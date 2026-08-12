interface InquiryPayload {
  tier: string;
  creatorType: string;
  name: string;
  email: string;
  phone: string;
  description: string;
  domain: boolean;
  imageNames: string[];
}

// Google Apps Script Web App URL (see scripts/Code.gs). Public by design —
// it only accepts POSTs and appends rows to a private Sheet + sends an
// email; it holds no secret. Move to an env var if you'd rather not
// hardcode it in client JS.
const FORM_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbwFeFnRgLeLPAQceRK8U2AR82WhCHyJH7Q3KX7KmLRNnhdhWJyzP1DKDcn1SlwvrWIN2w/exec';

export function initContactForm(): void {
  const fileInput = document.getElementById('ctaImages') as HTMLInputElement | null;
  const fileListEl = document.getElementById('ctaFileList');

  if (fileInput && fileListEl) {
    fileInput.addEventListener('change', () => {
      fileListEl.innerHTML = '';
      Array.from(fileInput.files ?? []).forEach((file) => {
        const li = document.createElement('li');
        li.textContent = file.name;
        fileListEl.appendChild(li);
      });
    });
  }

  const form = document.getElementById('ctaForm') as HTMLFormElement | null;
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('ctaName') as HTMLInputElement | null;
    const email = document.getElementById('ctaEmail') as HTMLInputElement | null;
    const phone = document.getElementById('ctaPhone') as HTMLInputElement | null;
    const tier = document.getElementById('ctaTier') as HTMLSelectElement | null;
    const desc = document.getElementById('ctaDescription') as HTMLTextAreaElement | null;
    const images = document.getElementById('ctaImages') as HTMLInputElement | null;
    const domain = document.getElementById('ctaDomain') as HTMLInputElement | null;
    const submit = document.getElementById('ctaSubmit') as HTMLButtonElement | null;
    const feedback = document.getElementById('ctaFeedback');

    const imageNames = Array.from(images?.files ?? []).map((f) => f.name);

    const payload: InquiryPayload = {
      tier: tier?.value ?? '',
      creatorType: '',
      name: name?.value.trim() ?? '',
      email: email?.value.trim() ?? '',
      phone: phone?.value.trim() ?? '',
      description: desc?.value.trim() ?? '',
      domain: domain?.checked ?? false,
      imageNames,
    };

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'SENDING...';
    }
    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'cta-form__feedback';
    }

    fetch(FORM_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    })
      .then(() => {
        if (feedback) {
          feedback.textContent = 'Submitted — we’ll be in touch soon.';
          feedback.className = 'cta-form__feedback cta-form__feedback--success';
        }
        if (submit) submit.textContent = 'SUBMITTED';
        form.reset();
        if (fileListEl) fileListEl.innerHTML = '';
      })
      .catch(() => {
        if (feedback) {
          feedback.textContent = 'Something went wrong. Please try again.';
          feedback.className = 'cta-form__feedback cta-form__feedback--error';
        }
        if (submit) {
          submit.textContent = 'TRY AGAIN';
          submit.disabled = false;
        }
      });
  });
}
