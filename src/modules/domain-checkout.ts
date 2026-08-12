interface DomainSearchResult {
  name: string;
  available: boolean;
  reason?: string;
  priceCents: number;
  currency: string;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function initDomainCheckout(): void {
  const checkbox = document.getElementById('ctaDomain') as HTMLInputElement | null;
  const panel = document.getElementById('domainSearchPanel');
  const queryInput = document.getElementById('domainQuery') as HTMLInputElement | null;
  const searchBtn = document.getElementById('domainSearchBtn') as HTMLButtonElement | null;
  const resultsEl = document.getElementById('domainResults');
  const selectedEl = document.getElementById('domainSelected');
  const payBtn = document.getElementById('domainPayBtn') as HTMLButtonElement | null;
  const emailInput = document.getElementById('ctaEmail') as HTMLInputElement | null;

  if (!checkbox || !panel || !queryInput || !searchBtn || !resultsEl || !selectedEl || !payBtn) return;

  function syncPanelVisibility(): void {
    // Checked = "I have my own domain" -> hide the buy-a-domain panel.
    panel!.hidden = checkbox!.checked;
  }
  checkbox.addEventListener('change', syncPanelVisibility);
  syncPanelVisibility();

  let selected: DomainSearchResult | null = null;

  function renderResults(results: DomainSearchResult[]): void {
    resultsEl!.innerHTML = '';
    if (results.length === 0) {
      resultsEl!.textContent = 'No matches found.';
      return;
    }

    results.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'domain-result';

      const label = document.createElement('span');
      label.textContent = r.available
        ? `${r.name}, ${formatPrice(r.priceCents, r.currency)}/yr`
        : `${r.name}, unavailable`;

      row.appendChild(label);

      if (r.available) {
        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.textContent = 'Select';
        selectBtn.addEventListener('click', () => selectDomain(r));
        row.appendChild(selectBtn);
      }

      resultsEl!.appendChild(row);
    });
  }

  function selectDomain(result: DomainSearchResult): void {
    selected = result;
    selectedEl!.hidden = false;
    selectedEl!.textContent = `Selected: ${result.name}, ${formatPrice(result.priceCents, result.currency)}/yr`;
  }

  async function runSearch(): Promise<void> {
    const q = queryInput!.value.trim();
    if (q.length < 2) return;

    searchBtn!.disabled = true;
    resultsEl!.textContent = 'Searching…';

    try {
      const res = await fetch(`/api/domain-search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: DomainSearchResult[]; error?: string };
      if (!res.ok || !data.results) throw new Error(data.error ?? 'Search failed');
      renderResults(data.results);
    } catch (err) {
      console.error('Domain search failed:', err);
      resultsEl!.textContent = 'Something went wrong searching for that domain. Please try again.';
    } finally {
      searchBtn!.disabled = false;
    }
  }

  searchBtn.addEventListener('click', runSearch);
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  payBtn.addEventListener('click', async () => {
    if (!selected) return;

    // Required (also enforced server-side): a domain purchase with no
    // reachable email is unrecoverable if registration fails or a
    // renewal reminder is ever needed.
    const email = emailInput?.value.trim() ?? '';
    if (!emailPattern.test(email)) {
      window.alert('Enter your email above first, the domain receipt and registration confirmation go there.');
      emailInput?.focus();
      return;
    }

    const originalLabel = payBtn.textContent;
    payBtn.disabled = true;
    payBtn.textContent = 'Redirecting…';

    try {
      const res = await fetch('/api/create-domain-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: selected.name, email }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Checkout failed');
      window.location.href = data.url;
    } catch (err) {
      console.error('Domain checkout failed:', err);
      payBtn.disabled = false;
      payBtn.textContent = originalLabel;
      window.alert('Something went wrong starting checkout for that domain. Please try again.');
    }
  });
}
