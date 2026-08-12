import Stripe from 'stripe';
import { getStripe, registerDomain, notifyOwner, type Env } from '../_lib';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
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
    console.error('Webhook signature verification failed:', err);
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

    await notifyOwner(env, 'domain_registration', {
      domain,
      email: customerEmail,
      amountPaid: session.amount_total,
      currency: session.currency,
      stripeSessionId: session.id,
      registrationSucceeded: result.ok,
      registrationDetail: result.detail,
    });

    if (!result.ok) {
      // Payment already succeeded — surfacing this to the owner (above)
      // matters more than the HTTP response, since Stripe only cares
      // that we returned 2xx so it stops retrying the webhook.
      console.error('Domain registration failed after successful payment:', domain, result.detail);
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
};
