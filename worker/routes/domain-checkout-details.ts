import { getStripe, errMsg, type Env } from '../lib';

/**
 * Backs the post-purchase confirmation panel. Deliberately re-fetches from
 * Stripe by session ID instead of trusting domain/price query params on the
 * success_url redirect — Stripe's own docs warn a success_url can be hit
 * directly without paying, so anything shown to the buyer as "this is what
 * you bought" needs to come from Stripe's record, not the URL.
 */
export async function handleDomainCheckoutDetails(request: Request, env: Env): Promise<Response> {
  const sessionId = new URL(request.url).searchParams.get('session_id')?.trim();
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return Response.json({ error: 'Missing or invalid "session_id"' }, { status: 400 });
  }

  const stripe = getStripe(env);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.kind !== 'domain_registration' || !session.metadata.domain) {
      return Response.json({ error: 'Not a domain purchase session' }, { status: 404 });
    }
    if (session.status !== 'complete' || session.amount_total == null || !session.currency) {
      return Response.json({ error: 'Checkout not completed' }, { status: 409 });
    }

    return Response.json({
      domain: session.metadata.domain,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
  } catch (err) {
    console.error(`Failed to retrieve checkout session for details display: ${errMsg(err)}`);
    return Response.json({ error: 'Could not load purchase details' }, { status: 502 });
  }
}
