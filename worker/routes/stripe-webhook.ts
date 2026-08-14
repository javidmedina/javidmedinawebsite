import Stripe from 'stripe';
import { getStripe, registerDomain, notifyOwner, errMsg, type Env } from '../lib';

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

  if (event.type !== 'checkout.session.completed') {
    return new Response('ok', { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const kind = session.metadata?.kind;
  const customerEmail = session.customer_details?.email ?? session.customer_email ?? undefined;

  if (kind === 'domain_registration') {
    const domain = session.metadata?.domain;
    if (!domain) {
      console.error('domain_registration checkout completed with no domain in metadata', session.id);
      return new Response('ok', { status: 200 });
    }

    const result = await registerDomain(env, domain);

    // Registration can fail after payment already succeeded — e.g. it
    // got registered by someone else in the gap between our last
    // availability check and Stripe capturing payment. Refund
    // automatically rather than leaving the client charged for a
    // domain they don't have; don't wait on a manual fix.
    const refund: { attempted: boolean; succeeded: boolean; detail?: unknown } = {
      attempted: false,
      succeeded: false,
    };

    if (!result.ok) {
      refund.attempted = true;
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

      if (!paymentIntentId) {
        console.error('Cannot auto-refund domain purchase — no payment_intent on session:', session.id);
        refund.detail = 'no payment_intent on session';
      } else {
        try {
          const stripeRefund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer',
          });
          refund.succeeded = stripeRefund.status === 'succeeded' || stripeRefund.status === 'pending';
          refund.detail = { id: stripeRefund.id, status: stripeRefund.status };
        } catch (refundErr) {
          console.error(`Auto-refund failed for domain purchase: ${domain} — ${errMsg(refundErr)}`);
          refund.detail = errMsg(refundErr);
        }
      }
    }

    await notifyOwner(env, 'domain_registration', {
      domain,
      email: customerEmail,
      amountPaid: session.amount_total,
      currency: session.currency,
      stripeSessionId: session.id,
      registrationSucceeded: result.ok,
      registrationDetail: result.detail,
      refundAttempted: refund.attempted,
      refundSucceeded: refund.succeeded,
      refundDetail: refund.detail,
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
      amountPaid: session.amount_total,
      currency: session.currency,
      stripeSessionId: session.id,
    });
    return new Response('ok', { status: 200 });
  }

  return new Response('ok', { status: 200 });
}
