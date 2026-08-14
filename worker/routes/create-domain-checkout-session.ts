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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pricing.currency.toLowerCase(),
            unit_amount: pricing.clientPriceCents,
            product_data: {
              name: `Domain registration: ${domain} (1 year)`,
              description: 'First-year registration. Renewal is handled separately, not auto-billed.',
            },
          },
        },
      ],
      success_url: `${origin}/?domain_checkout=success`,
      cancel_url: `${origin}/?domain_checkout=cancelled`,
      metadata: { kind: 'domain_registration', domain },
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
