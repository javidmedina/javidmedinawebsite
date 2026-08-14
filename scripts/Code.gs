var PAYMENT_EVENTS = [
  'plan_purchase',
  'domain_registration',
  'domain_subscription_renewed',
  'domain_subscription_payment_failed',
  'domain_subscription_cancelled',
  'domain_handoff_choice'
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (PAYMENT_EVENTS.indexOf(data.event) !== -1) {
      return handlePaymentEvent(data);
    }

    return handleInquiry(data);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleInquiry(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp',
      'Tier',
      'Creator Type',
      'Name',
      'Email',
      'Phone',
      'Description',
      'Custom Domain',
      'Reference Images'
    ]);
  }

  sheet.appendRow([
    new Date(),
    data.tier || '',
    data.creatorType || '',
    data.name || '',
    data.email || '',
    data.phone || '',
    data.description || '',
    data.domain ? 'Yes' : 'No',
    (data.imageNames || []).join(', ')
  ]);

  sendInquiryNotification(data);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Domain/plan purchases, renewals, payment failures, cancellations, and
// handoff choices all come from the Stripe webhook
// (worker/routes/stripe-webhook.ts, worker/routes/domain-handoff.ts) after
// the underlying Stripe event already happened — this just logs + notifies,
// it never gates or reverses anything on the Stripe/Cloudflare side.
function handlePaymentEvent(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payments')
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Payments');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp', 'Event', 'Domain', 'Plan', 'Email', 'Phone',
      'Amount', 'Currency', 'Stripe Session/Invoice/Subscription', 'Registration OK', 'Refund', 'Notes'
    ]);
  }

  var amountCents = data.amountPaid;
  if (typeof amountCents !== 'number') amountCents = data.amountDue;
  var amount = typeof amountCents === 'number' ? (amountCents / 100).toFixed(2) : '';

  var refundStatus = '';
  if (data.event === 'domain_registration' && data.refundAttempted) {
    refundStatus = data.refundSucceeded ? 'Refunded' : 'REFUND FAILED — CHECK MANUALLY';
    if (data.subscriptionCancelled) refundStatus += ' (subscription cancelled)';
  }

  var reference = data.stripeSessionId || data.stripeInvoiceId || data.subscriptionId || '';

  var notes = '';
  if (data.event === 'domain_handoff_choice') {
    notes = 'Choice: ' + (data.choice === 'send_to_owner' ? 'Send to Javid to link' : 'Client will manage it') +
      (data.notes ? ' — ' + data.notes : '');
  } else if (data.event === 'domain_subscription_renewed') {
    notes = 'Renewal charge succeeded — renew the domain manually in the Cloudflare dashboard (API renewals aren\'t available yet).';
  } else if (data.event === 'domain_subscription_payment_failed') {
    notes = 'Renewal charge FAILED — Cloudflare auto-renew will still bill your account regardless, follow up with the client.';
  } else if (data.event === 'domain_subscription_cancelled') {
    notes = 'Client cancelled — disable auto-renew for this domain manually in the Cloudflare dashboard to stop paying for it.';
  }

  sheet.appendRow([
    new Date(),
    data.event || '',
    data.domain || '',
    data.plan || '',
    data.email || '',
    data.phone || '',
    amount,
    (data.currency || '').toUpperCase(),
    reference,
    data.event === 'domain_registration' ? (data.registrationSucceeded ? 'Yes' : 'FAILED — CHECK MANUALLY') : '',
    refundStatus,
    notes
  ]);

  sendPaymentNotification(data, amount);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendInquiryNotification(data) {
  var recipient = 'javidamedina@gmail.com';

  var subject = 'New Project Inquiry: ' + (data.tier || 'Website');
  var body = 'New submission received:\n\n' +
    'Tier: ' + (data.tier || '—') + '\n' +
    'Creator Type: ' + (data.creatorType || '—') + '\n' +
    'Name: ' + (data.name || '—') + '\n' +
    'Email: ' + (data.email || '—') + '\n' +
    'Phone: ' + (data.phone || '—') + '\n' +
    'Custom Domain: ' + (data.domain ? 'Yes' : 'No') + '\n' +
    'Reference Images: ' + ((data.imageNames || []).join(', ') || 'none') + '\n\n' +
    'Description:\n' + (data.description || '(not provided)') + '\n\n' +
    'View all submissions:\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl();

  MailApp.sendEmail(recipient, subject, body);
}

function sendPaymentNotification(data, amount) {
  var recipient = 'javidamedina@gmail.com';
  var logLine = '\n\nView log:\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl();

  if (data.event === 'domain_registration') {
    var refundLine = '—';
    var subjectPrefix = 'Domain purchased & registered (yearly subscription started): ';

    if (!data.registrationSucceeded) {
      if (data.refundAttempted && data.refundSucceeded) {
        refundLine = 'Yes — client was automatically refunded, subscription cancelled';
        subjectPrefix = 'Domain registration FAILED (auto-refunded): ';
      } else if (data.refundAttempted) {
        refundLine = 'ATTEMPTED BUT FAILED — refund the client manually in Stripe';
        subjectPrefix = 'ACTION NEEDED — domain paid, registration FAILED, refund FAILED: ';
      } else {
        subjectPrefix = 'ACTION NEEDED — domain paid but registration FAILED: ';
      }
    }

    var subject = subjectPrefix + data.domain;

    var body = 'Domain: ' + (data.domain || '—') + '\n' +
      'Client email: ' + (data.email || '—') + '\n' +
      'Client phone: ' + (data.phone || '—') + '\n' +
      'Amount charged today: ' + amount + ' ' + (data.currency || '').toUpperCase() + ' (billed yearly going forward)\n' +
      'Cloudflare registration succeeded: ' + (data.registrationSucceeded ? 'Yes (auto-renew requested)' : 'NO — register manually in the Cloudflare dashboard') + '\n' +
      'Refunded: ' + refundLine + '\n' +
      'Stripe session: ' + (data.stripeSessionId || '—') + '\n' +
      'Stripe subscription: ' + (data.subscriptionId || '—') +
      logLine;

    MailApp.sendEmail(recipient, subject, body);
    return;
  }

  if (data.event === 'domain_subscription_renewed') {
    var body3 = 'Domain: ' + (data.domain || '—') + '\n' +
      'Client email: ' + (data.email || '—') + '\n' +
      'Amount charged: ' + amount + ' ' + (data.currency || '').toUpperCase() + '\n' +
      'Stripe subscription: ' + (data.subscriptionId || '—') + '\n' +
      'Stripe invoice: ' + (data.stripeInvoiceId || '—') + '\n\n' +
      'ACTION: renew this domain in the Cloudflare dashboard if it\'s coming up on expiry — the Registrar API doesn\'t support renewals yet, so this isn\'t automatic on Cloudflare\'s side even though auto_renew was requested at registration.' +
      logLine;

    MailApp.sendEmail(recipient, 'Domain subscription renewed: ' + (data.domain || '—'), body3);
    return;
  }

  if (data.event === 'domain_subscription_payment_failed') {
    var body4 = 'Domain: ' + (data.domain || '—') + '\n' +
      'Client email: ' + (data.email || '—') + '\n' +
      'Amount due: ' + amount + ' ' + (data.currency || '').toUpperCase() + '\n' +
      'Stripe subscription: ' + (data.subscriptionId || '—') + '\n\n' +
      'ACTION NEEDED: the renewal charge failed. Cloudflare\'s auto-renew is independent of this and will still try to bill your CF account, so follow up with the client (Stripe will retry automatically) or you\'ll be covering this domain yourself.' +
      logLine;

    MailApp.sendEmail(recipient, 'ACTION NEEDED — domain renewal payment failed: ' + (data.domain || '—'), body4);
    return;
  }

  if (data.event === 'domain_subscription_cancelled') {
    var body5 = 'Domain: ' + (data.domain || '—') + '\n' +
      'Client email: ' + (data.email || '—') + '\n' +
      'Stripe subscription: ' + (data.subscriptionId || '—') + '\n\n' +
      'ACTION NEEDED: disable auto-renew for this domain in the Cloudflare dashboard (no API for it yet) unless you want to keep paying for it with no matching subscription revenue.' +
      logLine;

    MailApp.sendEmail(recipient, 'ACTION NEEDED — domain subscription cancelled: ' + (data.domain || '—'), body5);
    return;
  }

  if (data.event === 'domain_handoff_choice') {
    var choiceLabel = data.choice === 'send_to_owner' ? 'Send it to Javid to link (recommended)' : 'Client will manage it themselves';
    var body6 = 'Domain: ' + (data.domain || '—') + '\n' +
      'Client email: ' + (data.email || '—') + '\n' +
      'Client phone: ' + (data.phone || '—') + '\n' +
      'Client\'s choice: ' + choiceLabel + '\n' +
      'Notes from client: ' + (data.notes || '(none)') + '\n' +
      'Stripe session: ' + (data.stripeSessionId || '—') + '\n\n' +
      (data.choice === 'self_manage'
        ? 'Remember: the domain is registered under your Cloudflare account either way, so "manage it myself" still needs you to grant access or transfer it out — follow up with the client about which.'
        : 'Link this domain to the client\'s build when ready.') +
      logLine;

    MailApp.sendEmail(recipient, 'Domain handoff choice — ' + choiceLabel + ': ' + (data.domain || '—'), body6);
    return;
  }

  var subject2 = 'Plan purchased: ' + (data.plan || '—');
  var body2 = 'Plan: ' + (data.plan || '—') + '\n' +
    'Client email: ' + (data.email || '—') + '\n' +
    'Client phone: ' + (data.phone || '—') + '\n' +
    'Amount paid: ' + amount + ' ' + (data.currency || '').toUpperCase() + '\n' +
    'Stripe session: ' + (data.stripeSessionId || '—') +
    logLine;

  MailApp.sendEmail(recipient, subject2, body2);
}
