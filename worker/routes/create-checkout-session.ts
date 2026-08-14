import { getStripe, type Env } from '../lib';

interface CheckoutRequestBody {
  plan?: string;
}

// Server-side plan -> Stripe Price ID map. Never trust a price/amount
// sent from the client — only ever trust a plan *key*, and look the
// real price up here. Bespoke/consultation tiers (e.g. "Custom
// Architecture") should NOT get an entry here — keep those on the
// contact form.
function getPlanPriceId(env: Env, plan: string): string | undefined {
  const map: Record<string, string | undefined> = {
    social: env.STRIPE_PRICE_SOCIAL,
  };
  return map[plan];
}

export async function handleCreateCheckoutSession(request: Request, env: Env): Promise<Response> {
  let body: CheckoutRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const plan = body.plan;
  if (!plan) {
    return Response.json({ error: 'Missing "plan"' }, { status: 400 });
  }

  const priceId = getPlanPriceId(env, plan);
  if (!priceId) {
    return Response.json({ error: `Unknown or unsupported plan: ${plan}` }, { status: 400 });
  }

  const stripe = getStripe(env);
  const origin = new URL(request.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      metadata: { kind: 'plan_purchase', plan },
    });

    if (!session.url) {
      return Response.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
    }

    return Response.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session creation failed:', err);
    return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
