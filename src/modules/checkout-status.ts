/**
 * Stripe Checkout (functions/api/create-checkout-session.ts and
 * create-domain-checkout-session.ts) redirects back to `/?checkout=...`
 * or `/?domain_checkout=...` after payment. This reads that query param
 * on load and shows a confirmation/cancellation banner, then strips the
 * param from the URL so a refresh or share of the link doesn't re-show it.
 */
export function initCheckoutStatus(): void {
  const banner = document.getElementById('checkoutStatusBanner');
  const text = document.getElementById('checkoutStatusText');
  const closeBtn = document.getElementById('checkoutStatusClose');
  if (!banner || !text || !closeBtn) return;

  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  const domainCheckout = params.get('domain_checkout');

  let message: string | null = null;
  let kind: 'success' | 'cancelled' | null = null;

  if (checkout === 'success') {
    message = "Payment received, thanks! I'll be in touch shortly to kick off your project.";
    kind = 'success';
  } else if (checkout === 'cancelled') {
    message = 'Checkout was cancelled, no charge was made. Feel free to try again whenever you’re ready.';
    kind = 'cancelled';
  } else if (domainCheckout === 'success') {
    message =
      "Domain payment received, I'll register it and follow up by email once it's live. Questions in the meantime? Call or text 978-802-0051.";
    kind = 'success';
  } else if (domainCheckout === 'cancelled') {
    message = 'Domain checkout was cancelled, no charge was made.';
    kind = 'cancelled';
  }

  if (!message || !kind) return;

  text.textContent = message;
  banner.hidden = false;
  banner.classList.add(kind === 'success' ? 'checkout-banner--success' : 'checkout-banner--cancelled');

  closeBtn.addEventListener('click', () => {
    banner.hidden = true;
  });

  // Strip the query param so refreshing/sharing the URL doesn't re-trigger it.
  params.delete('checkout');
  params.delete('domain_checkout');
  const query = params.toString();
  const cleanUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
  window.history.replaceState({}, '', cleanUrl);
}
