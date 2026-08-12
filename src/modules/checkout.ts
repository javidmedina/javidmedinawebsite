interface CreateCheckoutSessionResponse {
  url?: string;
  error?: string;
}

/**
 * Wires up any element with `data-checkout-plan="<planId>"` to create a
 * Stripe Checkout Session via the Cloudflare Pages Function at
 * /api/create-checkout-session, then redirects to Stripe's hosted page.
 *
 * Only fixed-price, self-serve tiers should get this attribute — plans
 * that need a scoping conversation first (bespoke quotes, add-on
 * subscriptions) should keep linking to the contact form instead.
 */
export function initCheckout(): void {
  const buttons = document.querySelectorAll<HTMLElement>('[data-checkout-plan]');

  buttons.forEach((button) => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const plan = button.getAttribute('data-checkout-plan');
      if (!plan) return;

      const originalLabel = button.textContent;
      const isButton = button instanceof HTMLButtonElement;
      if (isButton) (button as HTMLButtonElement).disabled = true;
      button.textContent = 'Redirecting…';

      try {
        const res = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan }),
        });

        const data = (await res.json()) as CreateCheckoutSessionResponse;

        if (!res.ok || !data.url) {
          throw new Error(data.error ?? `Checkout request failed (${res.status})`);
        }

        window.location.href = data.url;
      } catch (err) {
        console.error('Stripe checkout failed:', err);
        if (isButton) (button as HTMLButtonElement).disabled = false;
        button.textContent = originalLabel;
        window.alert('Something went wrong starting checkout. Please try again or contact me directly.');
      }
    });
  });
}
