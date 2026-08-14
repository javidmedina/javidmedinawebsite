import Stripe from 'stripe';

export interface Env {
  ASSETS: Fetcher;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_SOCIAL: string;
  CF_REGISTRAR_ACCOUNT_ID: string;
  CF_REGISTRAR_API_TOKEN: string;
  DOMAIN_MARKUP_PERCENT: string;
  FORM_NOTIFY_ENDPOINT: string;
}

// Cloudflare's Workers Logs pipeline has been observed dropping the
// message line of an Error object logged as a bare console.error() arg,
// showing only its stack frames — so always fold the message into the
// logged string itself rather than passing the Error object separately.
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function getStripe(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export interface DomainPricing {
  name: string;
  registrable: boolean;
  reason?: string;
  registrationCostCents: number;
  clientPriceCents: number;
  currency: string;
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

function cfHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.CF_REGISTRAR_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function applyMarkup(costDollars: string, markupPercent: string): { costCents: number; priceCents: number } {
  const costCents = Math.round(parseFloat(costDollars) * 100);

  // A missing/unparseable markup must fail loudly, not silently sell
  // domains at Cloudflare's raw cost with zero margin. An explicit "0"
  // (deliberately no markup) is a valid choice and passes through fine.
  if (markupPercent === undefined || markupPercent === null || markupPercent.trim() === '') {
    throw new Error('DOMAIN_MARKUP_PERCENT is not configured');
  }
  const pct = parseFloat(markupPercent);
  if (Number.isNaN(pct)) {
    throw new Error(`DOMAIN_MARKUP_PERCENT is not a valid number: "${markupPercent}"`);
  }

  const priceCents = Math.round(costCents * (1 + pct / 100));
  return { costCents, priceCents };
}

/** Authoritative real-time availability + pricing check for one exact domain name. */
export async function checkDomain(env: Env, domain: string): Promise<DomainPricing> {
  const res = await fetch(`${CF_API_BASE}/accounts/${env.CF_REGISTRAR_ACCOUNT_ID}/registrar/domain-check`, {
    method: 'POST',
    headers: cfHeaders(env),
    body: JSON.stringify({ domains: [domain] }),
  });

  const json = (await res.json()) as {
    success: boolean;
    errors?: Array<{ code: number; message: string }>;
    // Cloudflare nests the array one level deeper than the usual bare
    // `result: [...]` convention for this endpoint - confirmed against
    // the Registrar API docs after a live 200/empty-result response
    // exposed the mismatch.
    result?: {
      domains?: Array<{
        name: string;
        registrable: boolean;
        reason?: string;
        pricing?: { currency: string; registration_cost: string };
      }>;
    };
  };

  if (!json.success || !json.result?.domains?.length) {
    throw new Error(
      `Cloudflare domain-check request failed (HTTP ${res.status}): ${JSON.stringify(json.errors ?? json)}`,
    );
  }

  const result = json.result.domains[0];
  const { costCents, priceCents } = applyMarkup(
    result.pricing?.registration_cost ?? '0',
    env.DOMAIN_MARKUP_PERCENT,
  );

  return {
    name: result.name,
    registrable: result.registrable,
    reason: result.reason,
    registrationCostCents: costCents,
    clientPriceCents: priceCents,
    currency: result.pricing?.currency ?? 'USD',
  };
}

/** Keyword/partial-name suggestions (softer signal than checkDomain). */
export async function searchDomains(env: Env, query: string, limit = 8): Promise<DomainPricing[]> {
  const url = `${CF_API_BASE}/accounts/${env.CF_REGISTRAR_ACCOUNT_ID}/registrar/domain-search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { headers: cfHeaders(env) });

  const json = (await res.json()) as {
    success: boolean;
    errors?: Array<{ code: number; message: string }>;
    result?: {
      domains?: Array<{
        name: string;
        registrable: boolean;
        reason?: string;
        pricing?: { currency: string; registration_cost: string };
      }>;
    };
  };

  if (!json.success || !json.result?.domains) {
    throw new Error(
      `Cloudflare domain-search request failed (HTTP ${res.status}): ${JSON.stringify(json.errors ?? json)}`,
    );
  }

  return json.result.domains.map((r) => {
    const { costCents, priceCents } = applyMarkup(r.pricing?.registration_cost ?? '0', env.DOMAIN_MARKUP_PERCENT);
    return {
      name: r.name,
      registrable: r.registrable,
      reason: r.reason,
      registrationCostCents: costCents,
      clientPriceCents: priceCents,
      currency: r.pricing?.currency ?? 'USD',
    };
  });
}

/**
 * Registers a domain, billed at cost to this Cloudflare account's payment
 * method. Requests auto_renew at registration time — the beta Registrar API
 * only exposes that flag at creation, there's no endpoint to flip it later
 * — so Cloudflare keeps the domain alive on its own each year. The paired
 * Stripe subscription re-bills the client annually to cover that cost plus
 * markup; the two renewals aren't wired together, they just both recur.
 */
export async function registerDomain(env: Env, domain: string): Promise<{ ok: boolean; detail: unknown }> {
  const res = await fetch(`${CF_API_BASE}/accounts/${env.CF_REGISTRAR_ACCOUNT_ID}/registrar/registrations`, {
    method: 'POST',
    headers: cfHeaders(env),
    body: JSON.stringify({ domain_name: domain, auto_renew: true }),
  });
  const detail = await res.json();
  return { ok: res.ok, detail };
}

/**
 * Reuses the existing Google Apps Script web app (see scripts/Code.gs) to
 * notify the site owner + log a row, instead of standing up a separate
 * email pipeline for one webhook.
 */
export async function notifyOwner(env: Env, event: string, data: Record<string, unknown>): Promise<void> {
  try {
    await fetch(env.FORM_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ event, ...data }),
    });
  } catch (err) {
    console.error(`notifyOwner failed: ${errMsg(err)}`);
  }
}
