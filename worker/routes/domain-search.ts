import { checkDomain, searchDomains, type Env, type DomainPricing } from '../lib';

function toClientShape(d: DomainPricing) {
  return {
    name: d.name,
    available: d.registrable,
    reason: d.reason,
    priceCents: d.clientPriceCents,
    currency: d.currency,
    // registrationCostCents intentionally omitted — that's our cost, not the client's business.
  };
}

export async function handleDomainSearch(request: Request, env: Env): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return Response.json({ error: 'Provide a "q" query param with at least 2 characters' }, { status: 400 });
  }

  try {
    // A full domain (has a dot) gets an authoritative, real-time check.
    // A bare keyword gets fuzzy suggestions instead.
    const results = q.includes('.') ? [await checkDomain(env, q)] : await searchDomains(env, q);

    return Response.json({ results: results.map(toClientShape) });
  } catch (err) {
    console.error('Domain search failed:', err);
    return Response.json({ error: 'Domain lookup failed. Please try again shortly.' }, { status: 502 });
  }
}
