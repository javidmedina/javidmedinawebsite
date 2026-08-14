import { checkDomain, getStripe, errMsg, type Env } from '../lib';

interface DomainCheckoutBody {
  domain?: string;
  email?: string;
}

export async function handleCreateDomainCheckoutSession(request: Request, env: Env): Promise<Response> {
  let body: DomainCheckoutBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  if (!domain || !domain.includes('.')) {
    return Response.json({ error: 'Missing or invalid "domain"' }, { status: 400 });
  }

  // Required, not optional: a domain purchase with no email on file is
  // unrecoverable if we can't reach the buyer (registration failure,
  // renewal reminders, etc.) — never trust client-side-only validation
  // for this, enforce it here too.
  const email = body.email?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'A valid "email" is required to purchase a domain' }, { status: 400 });
  }

  // Re-check price/availability server-side right before charging —
  // never trust a price the client sent, and availability can change
  // between when they searched and when they pay.
  let pricing;
  try {
    pricing = await checkDomain(env, domain);
  } catch (err) {
    console.error(`Domain re-check failed: ${errMsg(err)}`);
    return Response.json({ error: 'Could not verify domain availability. Please try again.' }, { status: 502 });
  }

  if (!pricing.registrable) {
    return Response.json(
      { error: `${domain} is no longer available (${pricing.reason ?? 'unknown reason'}).` },
      { status: 409 },
    );
  }

  const stripe = getStripe(env);
  const origin = new URL(request.url).origin;

  // Both the Checkout Session's own metadata (read by the
  // checkout.session.completed handler for the first-year registration)
  // and subscription_data.metadata (snapshotted onto every renewal invoice
  // and onto the Subscription object itself) need domain/email — the two
  // live on different Stripe objects and neither inherits from the other.
  const domainMetadata = { kind: 'domain_registration', domain, email };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      phone_number_collection: { enabled: true },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pricing.currency.toLowerCase(),
            unit_amount: pricing.clientPriceCents,
            recurring: { interval: 'year' },
            product_data: {
              name: `Domain registration: ${domain} (annual)`,
              description:
                'Billed once a year for as long as you keep the domain, at the then-current registration cost plus markup. Cancel anytime — cancelling stops future billing but does not release the domain automatically, contact me to sort that out.',
            },
          },
        },
      ],
      subscription_data: { metadata: domainMetadata },
      success_url: `${origin}/?domain_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?domain_checkout=cancelled`,
      metadata: domainMetadata,
    });

    if (!session.url) {
      return Response.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
    }

    return Response.json({ url: session.url });
  } catch (err) {
    console.error(`Stripe domain checkout session creation failed: ${errMsg(err)}`);
    return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
