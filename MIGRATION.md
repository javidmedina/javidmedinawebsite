# Migration: static HTML/CSS/JS → Vite + TypeScript + Tailwind + Stripe on a Cloudflare Worker

> **Update:** this project was originally migrated onto **Cloudflare Pages** (see the original
> write-up below section 3). It was then converted to a plain **Cloudflare Worker** with a static
> assets binding, because the actual Cloudflare project this repo deploys to (`home`) turned out to
> already be a Worker, not a Pages project — Cloudflare Pages Functions (`functions/api/*.ts`,
> file-based routing) don't exist on Workers, so all four API routes were rewritten as plain
> `(request, env) => Promise<Response>` handlers wired up by a manual router in `worker/index.ts`.
> Sections below have been updated to match; historical/one-time steps (git repo setup, Stripe
> product setup) are left as they were.

## What changed

```
index.html, terms.html          Vite entry points (moved from VARIENT/, live at repo root)
public/assets/                  static images, served as-is at /assets/...
src/
  main.ts                       entry point, wires up all modules
  style.css                     @import legacy.css + Tailwind layers
  legacy.css                    your original style.css, unchanged, kept as the design system
  modules/
    nav.ts                      nav scroll state, hamburger, smooth scroll (from script.js)
    marquee-text.ts              draggable text marquee (from script.js)
    marquee-boxes.ts             draggable box marquee + mobile carousel (from script.js)
    contact-form.ts              Google Sheets form submit (from script.js, unchanged endpoint)
    checkout.ts                  Stripe Checkout trigger for fixed-price plans
    domain-checkout.ts           domain search + instant Stripe Checkout for domains
    checkout-status.ts           post-Stripe-redirect confirmation/cancellation toast
worker/
  index.ts                      Worker entry point: fetch() handler, manual routing for /api/*,
                                 falls back to env.ASSETS.fetch() for everything else
  lib.ts                        shared Env type, Stripe client, Cloudflare Registrar calls
  routes/
    create-checkout-session.ts        Stripe Checkout for the $299 plan (one-time, collects phone)
    domain-search.ts                  Cloudflare Registrar search/check, with your markup applied
    create-domain-checkout-session.ts Stripe Checkout *subscription* for a specific domain — billed
                                       yearly at (re-verified) registration cost + markup, collects phone
    domain-checkout-details.ts        looks up a completed domain Checkout Session by ID, for the
                                       post-purchase confirmation panel (never trusts client-supplied price)
    domain-handoff.ts                 records the buyer's choice (send to Javid to link vs. self-manage)
                                       and emails you
    stripe-webhook.ts                 verifies Stripe signature; on first payment registers the domain
                                       (auto_renew requested) and auto-refunds+cancels on registration
                                       failure; on renewal/failed-renewal/cancellation of the domain
                                       subscription, emails you — see "Domain renewal" below
scripts/Code.gs                 extended (not replaced) — also logs/emails Stripe payment, renewal,
                                 cancellation, and handoff-choice events
```

Typecheck and build were run and pass clean (`npm run typecheck`, `npm run build`), and every route
was smoke-tested locally under `wrangler dev` before deploying.

---

## 1. Fix the git repo situation first

`git rev-parse --show-toplevel` from this folder currently resolves to `C:\Users\javid`, not this
project folder — meaning at some point `git init` was run in your home directory, and it has no
commits yet. **Do not `git add .` from there** — it would try to stage your entire home folder
(`.ssh`, browser profiles, credential caches, this Claude session's config, etc.) into whatever
you push.

Fix: initialize a **separate, nested repo scoped to this project folder**. Git supports this fine —
the outer home-directory repo just won't descend into this folder once it has its own `.git`.

```bash
git init
git add .
git commit -m "Migrate to Vite + TypeScript + Tailwind + Stripe/Cloudflare Worker"
```

The `.gitignore` already excludes `node_modules/`, `dist/`, `.wrangler/`, and `.env`, so this is
safe to run as-is.

Separately: the stray `C:\Users\javid\.git` with zero commits is harmless as long as nothing is ever
committed/pushed from it. Worth deleting at some point (`rm -rf ~/.git` — but only when you're sure
nothing else on your machine depends on it) to avoid future confusion, but that's outside this
project.

## 2. Push to GitHub

```bash
gh repo create javidmedinawebsite --private --source=. --remote=origin
git push -u origin main
```

(`--private` is a suggestion, not a requirement — switch to `--public` if you want it visible. If
you don't have `gh` installed/authenticated, create the repo manually on github.com instead, then:
`git remote add origin https://github.com/<you>/javidmedinawebsite.git && git push -u origin main`.)

## 3. Cloudflare: connect for automatic deploys (Workers Builds)

This project deploys as a **Worker with a static assets binding**, not Cloudflare Pages. The
existing `home` project in the dashboard (Workers & Pages → filter by "Workers") is already wired
to this GitHub repo via Workers Builds.

Build settings (Settings → Build configuration):
- Build command: `npm run build`
- **Deploy command: `npx wrangler deploy`** (not `wrangler pages deploy` — this is a Worker)
- **API token**: Workers Builds auto-generates one, but its default permission set does **not**
  include what a Pages-style project might need — if you ever see an `Authentication error
  [code: 10000]` or `Project not found [code: 8000007]` on deploy, the fix is a custom token (see
  `dash.cloudflare.com/profile/api-tokens`) with at least: Account → Workers Scripts (Edit),
  Account → Account Settings (Read), User → User Details/Memberships (Read), Zone → Workers Routes
  (Edit) — set as the project's `CLOUDFLARE_API_TOKEN`, and make sure its **Account Resources**
  scope actually includes the account that owns this Worker.

### Environment variables (Settings → Variables and Secrets)

| Variable | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Set after step 4 below |
| `STRIPE_PRICE_SOCIAL` | Stripe Dashboard → Product catalog (see step 4) |
| `CF_REGISTRAR_ACCOUNT_ID` | Your Cloudflare account ID (dashboard URL or right sidebar) |
| `CF_REGISTRAR_API_TOKEN` | Cloudflare Dashboard → Manage Account → API Tokens → create with "Registrar Write" |
| `DOMAIN_MARKUP_PERCENT` | Your choice, e.g. `30` — required; domain lookups now error loudly instead of silently selling at 0% margin if this is unset |
| `FORM_NOTIFY_ENDPOINT` | Your existing Google Apps Script `/exec` URL (same one already in `contact-form.ts`) |

Mark `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `CF_REGISTRAR_API_TOKEN` as **Secret**, not
plain text.

## 4. Stripe setup

1. **Product for the $299 plan**: Dashboard → Product catalog → Add product → one-time price,
   $299 USD → copy the resulting `price_...` ID into `STRIPE_PRICE_SOCIAL`.
   (The domain product/price is *not* pre-created — `create-domain-checkout-session.ts` builds a
   one-off recurring price inline at checkout time, since the amount depends on the specific domain.)
2. **Webhook**: Dashboard → Developers → Webhooks → Add endpoint →
   `https://<your-domain>/api/stripe-webhook` → listen for **all four** of `checkout.session.completed`,
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted` → copy the signing secret
   into `STRIPE_WEBHOOK_SECRET`. The last three only matter for the domain subscription (its renewals,
   failed renewals, and cancellations) — the $299 plan is a one-time payment and never triggers them.
   (You can only do this after the first deploy, once you have a real URL.)
3. Start in **test mode** (test API keys, test card `4242 4242 4242 4242`) and confirm the full
   flow — click "Get Started" on the Social & Creator card, complete checkout, confirm you get the
   email from `Code.gs` — before flipping to live keys. For the domain subscription, also use the
   Stripe CLI or Dashboard to simulate `invoice.paid` (renewal) and `customer.subscription.deleted`
   (cancellation) against a test subscription, since those only happen naturally a year later otherwise.

## 5. Cloudflare Registrar API prerequisites (for the domain search/purchase feature)

This is a **beta** API — behavior may still change. Before it'll work:

1. Cloudflare Dashboard → Manage Account → Billing → add a payment method (registrations bill this,
   at cost — no markup from Cloudflare; you add yours via `DOMAIN_MARKUP_PERCENT`).
2. Set a default registrant contact on the account (used for all API-registered domains — the
   client is not prompted for legal/WHOIS info in this flow, they're just paying you).
3. Accept the Domain Registration Agreement (prompted in the dashboard's domain registration flow).
4. Not every TLD supported in the dashboard is available via the API yet — the search/check
   endpoints return `available: false` with a reason (e.g. `extension_not_supported_via_api`) when
   that happens; the UI shows it as unavailable rather than failing silently.

**Registration failures after payment auto-refund.** If Cloudflare registration fails after Stripe
payment succeeds (e.g. lost a race to another buyer for the same domain), `stripe-webhook.ts`
cancels the subscription and refunds the first charge automatically via the Stripe API rather than
leaving the client on the hook for a domain they don't have — refund/cancellation outcome is
logged/emailed alongside the registration status.

### Domain renewal: two independent yearly cycles, not one automated pipeline

The client side is a real Stripe **subscription** (`mode: 'subscription'`, yearly interval,
`create-domain-checkout-session.ts`): they're billed once a year, indefinitely, at whatever the
domain's registration cost is at signup time plus your `DOMAIN_MARKUP_PERCENT` markup — that price
is fixed at signup, it doesn't get re-quoted each renewal. Cancelling in the Stripe customer portal
(or you cancelling it for them) stops future billing but doesn't touch the domain itself.

The registrar side is handled separately: `registerDomain()` passes `auto_renew: true` at
registration, which authorizes Cloudflare to renew the domain itself using your Cloudflare account's
payment method (up to 30 days before expiry, at cost — no markup from Cloudflare, that's where your
margin from the Stripe subscription comes from). **The beta Registrar API has no endpoint to change
`auto_renew` after registration** — it's a create-time-only flag — so if a client cancels their
Stripe subscription, Cloudflare will still keep auto-renewing (and billing your CF account for) that
domain until you manually turn auto-renew off for it in the Cloudflare dashboard. `stripe-webhook.ts`
emails you on cancellation specifically so this doesn't get missed; treat that email as an action
item, not just an FYI.

These two cycles aren't linked beyond both being roughly annual — a renewal succeeding on the Stripe
side doesn't trigger anything on the Cloudflare side (Cloudflare's `auto_renew` already covers it),
it's just a confirmation email. A **failed** Stripe renewal charge (`invoice.payment_failed`) *is*
worth acting on manually, since Cloudflare's auto-renew will still try to charge your account
regardless of whether the client's card worked.

### Phone numbers + the post-purchase handoff panel

Both Stripe Checkout Sessions (`create-checkout-session.ts` for the $299 plan, and
`create-domain-checkout-session.ts` for the domain subscription) set `phone_number_collection.enabled
= true`, so Stripe's hosted checkout page itself asks for a phone number — no site-side form field
needed, it shows up on `session.customer_details.phone` and gets included in the owner-notification
email alongside the rest of the purchase details.

After a domain purchase, the buyer is redirected back with `?domain_checkout=success&session_id=...`.
`src/modules/domain-purchase-confirmation.ts` re-fetches the purchase from `/api/domain-checkout-
details` (authoritative, from Stripe — never trusts the redirect's query params for what was
actually bought) and shows a panel with the domain and price, plus a choice: "send it to Javid to
link it" (the normal path) or "I'll manage it myself". Either way the domain is registered under
your Cloudflare account, so "manage it myself" still starts with you granting access or transferring
it out — the choice just tells `/api/domain-handoff` which email to send you so you know which
conversation to start. You're notified of every domain purchase via the webhook regardless of
whether the buyer interacts with this panel at all.

## 6. Local development

```bash
npm install
npm run dev          # http://localhost:5173 — frontend only, hot reload, no Worker routes
npm run worker:dev    # builds, then runs the full site + /api/* routes via `wrangler dev`
```

For `worker:dev` to actually hit Stripe/Cloudflare Registrar locally, copy `.env.example` to `.env`
and fill in real (test-mode) values.

`npm run deploy` builds and runs `wrangler deploy` directly, if you ever want to deploy manually
instead of via the git-connected Workers Builds pipeline.

## 7. Mobile-responsive CSS: why Tailwind wasn't used to rewrite everything

Your original `style.css` already uses `clamp()` for fluid type, has a working mobile nav
(hamburger + slide-out), and a separate mobile carousel for the client-showcase marquee — it's not
starting from zero. Rewriting ~1400 lines of tuned, working CSS into Tailwind utility classes with
no visual regression testing loop is a good way to quietly break things that currently work.

What I did instead: kept `legacy.css` as-is (imported first), added Tailwind on top via
`@tailwind base/components/utilities`, and used Tailwind utilities only for genuinely new
components (the domain-search widget, the checkout status toast). Its breakpoint convention
(`sm:`, `md:`, etc., all `min-width`, mobile-first) is now available for anything new you build —
you're not locked into the old file's `max-width` (desktop-first) pattern going forward, just
carrying it for what already exists.

If you do want the old stylesheet converted to Tailwind utilities section-by-section later, that's
a real project best done with the dev server open and a visual diff at each step — worth scoping
separately rather than doing blind.

## Known behavior difference from the old Pages setup

Cloudflare's static-asset serving for Workers defaults to redirecting `/terms.html` → `/terms`
(307). Content is identical either way and browsers follow it transparently, but it's a real
difference from before (Pages served the exact path with no redirect). Pinning
`html_handling = "none"` in `wrangler.toml` avoids that redirect, but it also disables the
`/` → `index.html` mapping and breaks the homepage — not worth that tradeoff for one cosmetic
redirect, so it's left at the default.
