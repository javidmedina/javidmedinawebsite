import Stripe from 'stripe';
import { getStripe, registerDomain, notifyOwner, errMsg, type Env } from '../lib';

/** Metadata shape stamped on both the Checkout Session and the Subscription
 *  it creates (see create-domain-checkout-session.ts) — the latter is what
 *  lets renewal/cancellation events, which never see the original session,
 *  still know which domain and buyer they're for. */
interface DomainSubscriptionMetadata {
  kind?: string;
  domain?: string;
  email?: string;
}

async function handleCheckoutSessionCompleted(event: Stripe.Event, env: Env, stripe: Stripe): Promise<Response> {
  const session = event.data.object as Stripe.Checkout.Session;
  const kind = session.metadata?.kind;
  const customerEmail = session.customer_details?.email ?? session.customer_email ?? undefined;
  const customerPhone = session.customer_details?.phone ?? undefined;

  if (kind === 'domain_registration') {
    const domain = session.metadata?.domain;
    if (!domain) {
      console.error('domain_registration checkout completed with no domain in metadata', session.id);
      return new Response('ok', { status: 200 });
    }

    const result = await registerDomain(env, domain);

    // Registration can fail after payment already succeeded — e.g. it got
    // registered by someone else in the gap between our last availability
    // check and Stripe capturing payment. Cancel the subscription (so it
    // never bills again) and refund the first charge automatically rather
    // than leaving the client on the hook for a domain they don't have —
    // don't wait on a manual fix.
    const refund: { attempted: boolean; succeeded: boolean; detail?: unknown } = {
      attempted: false,
      succeeded: false,
    };
    let subscriptionCancelled = false;

    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id;

    if (!result.ok) {
      refund.attempted = true;

      if (!subscriptionId) {
        console.error('Cannot auto-cancel domain subscription — no subscription on session:', session.id);
      } else {
        try {
          await stripe.subscriptions.cancel(subscriptionId);
          subscriptionCancelled = true;
        } catch (cancelErr) {
          console.error(`Failed to cancel subscription after registration failure: ${errMsg(cancelErr)}`);
        }
      }

      if (!invoiceId) {
        console.error('Cannot auto-refund domain purchase — no invoice on session:', session.id);
        refund.detail = 'no invoice on session';
      } else {
        try {
          const invoice = await stripe.invoices.retrieve(invoiceId);
          const paymentIntentId =
            typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id;

          if (!paymentIntentId) {
            refund.detail = 'invoice has no payment_intent to refund';
          } else {
            const stripeRefund = await stripe.refunds.create({
              payment_intent: paymentIntentId,
              reason: 'requested_by_customer',
            });
            refund.succeeded = stripeRefund.status === 'succeeded' || stripeRefund.status === 'pending';
            refund.detail = { id: stripeRefund.id, status: stripeRefund.status };
          }
        } catch (refundErr) {
          console.error(`Auto-refund failed for domain purchase: ${domain} — ${errMsg(refundErr)}`);
          refund.detail = errMsg(refundErr);
        }
      }
    }

    await notifyOwner(env, 'domain_registration', {
      domain,
      email: customerEmail,
      phone: customerPhone,
      amountPaid: session.amount_total,
      currency: session.currency,
      stripeSessionId: session.id,
      subscriptionId,
      registrationSucceeded: result.ok,
      registrationDetail: result.detail,
      refundAttempted: refund.attempted,
      refundSucceeded: refund.succeeded,
      refundDetail: refund.detail,
      subscriptionCancelled,
    });

    if (!result.ok) {
      // Payment already succeeded — surfacing this to the owner (above)
      // matters more than the HTTP response, since Stripe only cares
      // that we returned 2xx so it stops retrying the webhook. If the
      // refund itself also failed, this line is the paper trail.
      console.error(
        'Domain registration failed after successful payment:',
        domain,
        result.detail,
        'refund:',
        refund,
      );
    }

    return new Response('ok', { status: 200 });
  }

  if (kind === 'plan_purchase') {
    await notifyOwner(env, 'plan_purchase', {
      plan: session.metadata?.plan,
      email: customerEmail,
      phone: customerPhone,
      amountPaid: session.amount_total,
      currency: session.currency,
      stripeSessionId: session.id,
    });
    return new Response('ok', { status: 200 });
  }

  return new Response('ok', { status: 200 });
}

async function handleInvoicePaid(event: Stripe.Event, env: Env): Promise<Response> {
  const invoice = event.data.object as Stripe.Invoice;
  const meta = (invoice.subscription_details?.metadata ?? {}) as DomainSubscriptionMetadata;

  if (meta.kind !== 'domain_registration' || !meta.domain) {
    return new Response('ok', { status: 200 });
  }

  // The very first invoice on a new subscription is already fully handled
  // by checkout.session.completed (registration + owner email) — only
  // years 2+ (billing_reason "subscription_cycle") are a renewal we
  // haven't seen yet.
  if (invoice.billing_reason !== 'subscription_cycle') {
    return new Response('ok', { status: 200 });
  }

  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;

  await notifyOwner(env, 'domain_subscription_renewed', {
    domain: meta.domain,
    email: meta.email,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    subscriptionId,
    stripeInvoiceId: invoice.id,
  });

  return new Response('ok', { status: 200 });
}

async function handleInvoicePaymentFailed(event: Stripe.Event, env: Env): Promise<Response> {
  const invoice = event.data.object as Stripe.Invoice;
  const meta = (invoice.subscription_details?.metadata ?? {}) as DomainSubscriptionMetadata;

  if (meta.kind !== 'domain_registration' || !meta.domain) {
    return new Response('ok', { status: 200 });
  }

  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;

  // Cloudflare's own auto_renew (set at registration time) bills Javid's CF
  // account independently of whether this Stripe charge succeeds, so a
  // failed renewal charge here needs a human to chase the client before it
  // becomes a domain Javid is paying for with no matching revenue.
  await notifyOwner(env, 'domain_subscription_payment_failed', {
    domain: meta.domain,
    email: meta.email,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
    subscriptionId,
    stripeInvoiceId: invoice.id,
  });

  return new Response('ok', { status: 200 });
}

async function handleSubscriptionDeleted(event: Stripe.Event, env: Env): Promise<Response> {
  const subscription = event.data.object as Stripe.Subscription;
  const meta = (subscription.metadata ?? {}) as DomainSubscriptionMetadata;

  if (meta.kind !== 'domain_registration' || !meta.domain) {
    return new Response('ok', { status: 200 });
  }

  // The beta Registrar API has no endpoint to flip auto_renew back off
  // after registration, so Cloudflare will otherwise keep renewing (and
  // billing Javid's CF account for) a domain the client stopped paying
  // for — this has to be a manual dashboard step, hence the email.
  await notifyOwner(env, 'domain_subscription_cancelled', {
    domain: meta.domain,
    email: meta.email,
    subscriptionId: subscription.id,
  });

  return new Response('ok', { status: 200 });
}

export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const stripe = getStripe(env);

  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // constructEventAsync (not constructEvent) — Workers don't have
    // Node's sync crypto, Stripe's SDK uses SubtleCrypto under the hood
    // for the edge-compatible path.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${errMsg(err)}`);
    return new Response('Invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(event, env, stripe);
    case 'invoice.paid':
      return handleInvoicePaid(event, env);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event, env);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event, env);
    default:
      return new Response('ok', { status: 200 });
  }
}
