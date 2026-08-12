import type { Env } from './lib';
import { handleCreateCheckoutSession } from './routes/create-checkout-session';
import { handleCreateDomainCheckoutSession } from './routes/create-domain-checkout-session';
import { handleDomainSearch } from './routes/domain-search';
import { handleStripeWebhook } from './routes/stripe-webhook';

// Converted from Cloudflare Pages Functions (file-based routing under
// functions/api/*) to a plain Worker, since the actual Cloudflare
// project this repo deploys to ("home") is a Worker, not a Pages
// project — see the wrangler.toml `[assets]` binding for the static
// site side of this.
//
// Routing model: with both `main` (this file) and `[assets]` set in
// wrangler.toml, Cloudflare checks the request against dist/ first —
// any path that matches a static file (/, /terms.html, /assets/...) is
// served directly by the platform and never reaches this fetch()
// handler at all. Only requests that *don't* match a static asset (all
// of /api/*, plus genuinely unmatched paths) fall through to here.
const routes: Record<string, Record<string, (request: Request, env: Env) => Promise<Response>>> = {
  '/api/create-checkout-session': { POST: handleCreateCheckoutSession },
  '/api/create-domain-checkout-session': { POST: handleCreateDomainCheckoutSession },
  '/api/domain-search': { GET: handleDomainSearch },
  '/api/stripe-webhook': { POST: handleStripeWebhook },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const route = routes[pathname];

    if (route) {
      const handler = route[request.method];
      if (handler) return handler(request, env);
      // Path is a known API route, just not with this method — reject
      // explicitly rather than falling through to the asset 404 below.
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Not an API route, and it didn't match a static asset either
    // (assets are checked before this Worker runs) — hand it to the
    // platform's own asset handling for a consistent 404 page.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
