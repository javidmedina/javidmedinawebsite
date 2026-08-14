interface DomainCheckoutDetails {
  domain?: string;
  amountTotal?: number;
  currency?: string;
  error?: string;
}

interface DomainHandoffResponse {
  ok?: boolean;
  error?: string;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/**
 * After a successful *domain* Stripe Checkout redirect, fetches the
 * authoritative purchase details (never trusts the redirect's query params
 * for what was actually bought — Stripe's own docs warn a success_url can
 * be hit directly without paying) and shows the buyer their domain plus a
 * choice: have Javid link it (the normal path, since it's registered under
 * his Cloudflare account either way) or say they'll handle it themselves.
 *
 * Must run before initCheckoutStatus(), which strips the domain_checkout
 * query param this reads.
 */
export function initDomainPurchaseConfirmation(): void {
  const panel = document.getElementById('domainPurchasePanel');
  const summaryEl = document.getElementById('domainPurchaseSummary');
  const notesEl = document.getElementById('domainPurchaseNotes') as HTMLTextAreaElement | null;
  const ownerBtn = document.getElementById('domainHandoffOwnerBtn') as HTMLButtonElement | null;
  const selfBtn = document.getElementById('domainHandoffSelfBtn') as HTMLButtonElement | null;
  const feedbackEl = document.getElementById('domainPurchaseFeedback');

  if (!panel || !summaryEl || !notesEl || !ownerBtn || !selfBtn || !feedbackEl) return;

  const params = new URLSearchParams(window.location.search);
  const isDomainSuccess = params.get('domain_checkout') === 'success';
  const sessionId = params.get('session_id');

  // Strip session_id regardless of outcome so a refresh/share doesn't
  // re-trigger this fetch — checkout-status.ts separately strips
  // checkout/domain_checkout, this only owns its own param.
  if (params.has('session_id')) {
    params.delete('session_id');
    const query = params.toString();
    const cleanUrl = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);
  }

  if (!isDomainSuccess || !sessionId) return;

  fetch(`/api/domain-checkout-details?session_id=${encodeURIComponent(sessionId)}`)
    .then((res) => res.json() as Promise<DomainCheckoutDetails>)
    .then((data) => {
      if (!data.domain || typeof data.amountTotal !== 'number' || !data.currency) {
        throw new Error(data.error ?? 'Could not load purchase details');
      }

      panel.hidden = false;
      summaryEl.textContent = `${data.domain} — ${formatPrice(data.amountTotal, data.currency)} charged today, billed annually until cancelled.`;

      function submitChoice(choice: 'send_to_owner' | 'self_manage', button: HTMLButtonElement): void {
        ownerBtn!.disabled = true;
        selfBtn!.disabled = true;
        const originalLabel = button.textContent;
        button.textContent = 'Sending…';

        fetch('/api/domain-handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, choice, notes: notesEl!.value.trim() }),
        })
          .then((res) => res.json() as Promise<DomainHandoffResponse>)
          .then((result) => {
            if (!result.ok) throw new Error(result.error ?? 'Something went wrong');
            button.textContent = 'Sent';
            feedbackEl!.textContent =
              choice === 'send_to_owner'
                ? "Got it — I'll reach out to get this linked up."
                : "Got it — I'll follow up about handing off access.";
          })
          .catch((err) => {
            console.error('Domain handoff choice failed:', err);
            feedbackEl!.textContent = 'Something went wrong sending that. Feel free to just text or email me directly.';
            ownerBtn!.disabled = false;
            selfBtn!.disabled = false;
            button.textContent = originalLabel;
          });
      }

      ownerBtn.addEventListener('click', () => submitChoice('send_to_owner', ownerBtn));
      selfBtn.addEventListener('click', () => submitChoice('self_manage', selfBtn));
    })
    .catch((err) => {
      console.error('Failed to load domain purchase details:', err);
      // Fail quiet — the owner is still notified of the purchase via the
      // Stripe webhook regardless of whether this panel loads.
    });
}
