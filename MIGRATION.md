# Migration: static HTML/CSS/JS → Vite + TypeScript + Tailwind + Stripe on Cloudflare Pages

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
    checkout.ts                  NEW: generic Stripe Checkout trigger for fixed-price plans
    domain-checkout.ts           NEW: domain search + instant Stripe Checkout for domains
functions/
  _lib.ts                       shared Env type, Stripe client, Cloudflare Registrar calls
  api/create-checkout-session.ts        Stripe Checkout for the $299 plan
  api/domain-search.ts                  Cloudflare Registrar search/check, with your markup applied
  api/create-domain-checkout-session.ts Stripe Checkout for a specific domain (re-verifies price server-side)
  api/stripe-webhook.ts                 verifies Stripe signature, registers the domain, emails you
scripts/Code.gs                 extended (not replaced) — now also logs/emails Stripe payment events
VARIENT/, assets/ (root)        untouched — your old source, safe to delete once you've confirmed
                                 the new site locally (npm run dev / npm run pages:dev)
```

Typecheck and build were run and pass clean (`npm run typecheck`, `npm run build`).

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
git commit -m "Migrate to Vite + TypeScript + Tailwind + Stripe/Cloudflare Pages"
```

The `.gitignore` already excludes `node_modules/`, `dist/`, `.wrangler/`, and `.env`, so this is
safe to run as-is. (I did not run this for you — happy to if you confirm.)

Separately: the stray `C:\Users\javid\.git` with zero commits is harmless as long as nothing is ever
committed/pushed from it. Worth deleting at some point (`rm -rf ~/.git` — but only when you're sure
nothing else on your machine depends on it) to avoid future confusion, but that's outside this
project and I'd want your explicit go-ahead before touching it.

## 2. Push to GitHub

```bash
gh repo create javidmedinawebsite --private --source=. --remote=origin
git push -u origin main
```

(`--private` is a suggestion, not a requirement — switch to `--public` if you want it visible. If
you don't have `gh` installed/authenticated, create the repo manually on github.com instead, then:
`git remote add origin https://github.com/<you>/javidmedinawebsite.git && git push -u origin main`.)

## 3. Cloudflare Pages: connect for automatic deploys

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the `javidmedinawebsite` GitHub repo.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Deploy. Every push to `main` now redeploys automatically; PRs get preview URLs for free.

### Environment variables (Settings → Environment variables, for both Production and Preview)

| Variable | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Set after step 4 below |
| `STRIPE_PRICE_SOCIAL` | Stripe Dashboard → Product catalog (see step 4) |
| `CF_REGISTRAR_ACCOUNT_ID` | Your Cloudflare account ID (dashboard URL or right sidebar) |
| `CF_REGISTRAR_API_TOKEN` | Cloudflare Dashboard → Manage Account → API Tokens → create with "Registrar Write" |
| `DOMAIN_MARKUP_PERCENT` | Your choice, e.g. `30` |
| `FORM_NOTIFY_ENDPOINT` | Your existing Google Apps Script `/exec` URL (same one already in `contact-form.ts`) |

Mark `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `CF_REGISTRAR_API_TOKEN` as **Secret**, not
plain text.

## 4. Stripe setup

1. **Product for the $299 plan**: Dashboard → Product catalog → Add product → one-time price,
   $299 USD → copy the resulting `price_...` ID into `STRIPE_PRICE_SOCIAL`.
2. **Webhook**: Dashboard → Developers → Webhooks → Add endpoint →
   `https://<your-domain>/api/stripe-webhook` → listen for `checkout.session.completed` → copy the
   signing secret into `STRIPE_WEBHOOK_SECRET`.
   (You can only do this after the first deploy, once you have a real URL.)
3. Start in **test mode** (test API keys, test card `4242 4242 4242 4242`) and confirm the full
   flow — click "Get Started" on the Social & Creator card, complete checkout, confirm you get the
   email from `Code.gs` — before flipping to live keys.

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

**Renewal is not automated.** The registration response comes back with `auto_renew: false`. This
integration handles the first-year purchase; deciding whether/how to renew (and whether to re-bill
the client) is a separate decision — I didn't want to guess at a recurring-billing scheme on your
behalf.

## 6. Local development

```bash
npm install
npm run dev          # http://localhost:5173 — frontend only, hot reload, no Functions
npm run pages:dev     # http://localhost:8788 — full site + /api/* Functions via wrangler
```

For `pages:dev` to actually hit Stripe/Cloudflare Registrar locally, copy `.env.example` to `.env`
and fill in real (test-mode) values.

## 7. Mobile-responsive CSS: why Tailwind wasn't used to rewrite everything

Your original `style.css` already uses `clamp()` for fluid type, has a working mobile nav
(hamburger + slide-out), and a separate mobile carousel for the client-showcase marquee — it's not
starting from zero. Rewriting ~1400 lines of tuned, working CSS into Tailwind utility classes with
no visual regression testing loop is a good way to quietly break things that currently work.

What I did instead: kept `legacy.css` as-is (imported first), added Tailwind on top via
`@tailwind base/components/utilities`, and used Tailwind utilities only for the genuinely new
domain-search widget. Its breakpoint convention (`sm:`, `md:`, etc., all `min-width`, mobile-first)
is now available for anything new you build — you're not locked into the old file's `max-width`
(desktop-first) pattern going forward, just carrying it for what already exists.

If you do want the old stylesheet converted to Tailwind utilities section-by-section later, that's
a real project best done with the dev server open and a visual diff at each step — worth scoping
separately rather than doing blind.

## Loose ends worth your attention

- **Pricing mismatch**: the homepage lists the Social & Creator plan at **$299**, but
  `terms.html` § 02 still says **$199** for the same package (and describes a 4-month payment
  plan option for Local Business that isn't reflected on the pricing cards). I didn't touch the
  legal copy — just flagging the inconsistency so it doesn't ship silently.
- **`assets/` at the repo root** duplicates `VARIENT/assets/` byte-for-byte — leftover from before.
  Safe to delete once you're confident the new `public/assets/` copy is complete.
- Only the **Social & Creator** plan is wired to instant Stripe checkout. Local Business and Custom
  Architecture still route to the contact form — those involve scope/consultation before a fixed
  price makes sense, so I left them as-is rather than force a checkout button onto a bespoke quote.
