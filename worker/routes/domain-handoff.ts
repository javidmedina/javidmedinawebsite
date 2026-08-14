import { getStripe, notifyOwner, errMsg, type Env } from '../lib';

interface DomainHandoffBody {
  sessionId?: string;
  choice?: string;
  notes?: string;
}

/**
 * Records which handoff the buyer wants — Javid links the domain to their
 * build (the normal path), or they intend to manage it themselves. Either
 * way the domain is registered under Javid's Cloudflare account, so
 * "manage it myself" still starts with Javid granting access or
 * transferring it out; this just tells him which conversation to start.
 * This is purely informational (an email), so it doesn't gate on anything
 * — the owner is already notified of every purchase regardless via the
 * stripe-webhook handler.
 */
export async function handleDomainHandoff(request: Request, env: Env): Promise<Response> {
  let body: DomainHandoffBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return Response.json({ error: 'Missing or invalid "sessionId"' }, { status: 400 });
  }

  const choice = body.choice;
  if (choice !== 'send_to_owner' && choice !== 'self_manage') {
    return Response.json({ error: 'Missing or invalid "choice"' }, { status: 400 });
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';

  const stripe = getStripe(env);

  try {
    // Re-derive domain/email from Stripe rather than trusting the client —
    // this only decides which email Javid receives, not money movement,
    // but Stripe's record is right there and it's one extra call.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.kind !== 'domain_registration' || !session.metadata.domain) {
      return Response.json({ error: 'Not a domain purchase session' }, { status: 404 });
    }

    const customerEmail = session.customer_details?.email ?? session.customer_email ?? undefined;
    const customerPhone = session.customer_details?.phone ?? undefined;

    await notifyOwner(env, 'domain_handoff_choice', {
      domain: session.metadata.domain,
      email: customerEmail,
      phone: customerPhone,
      choice,
      notes,
      stripeSessionId: sessionId,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error(`Domain handoff choice failed: ${errMsg(err)}`);
    return Response.json({ error: 'Failed to record handoff choice' }, { status: 500 });
  }
}
