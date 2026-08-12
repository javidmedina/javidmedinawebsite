function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.event === 'plan_purchase' || data.event === 'domain_registration') {
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

// Domain purchases and plan checkouts come from the Stripe webhook
// (functions/api/stripe-webhook.ts) after payment is already confirmed
// — this just logs + notifies, it never gates the payment itself.
function handlePaymentEvent(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payments')
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Payments');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp', 'Event', 'Domain', 'Plan', 'Email',
      'Amount Paid', 'Currency', 'Stripe Session', 'Registration OK'
    ]);
  }

  var amount = typeof data.amountPaid === 'number' ? (data.amountPaid / 100).toFixed(2) : '';

  sheet.appendRow([
    new Date(),
    data.event || '',
    data.domain || '',
    data.plan || '',
    data.email || '',
    amount,
    (data.currency || '').toUpperCase(),
    data.stripeSessionId || '',
    data.event === 'domain_registration' ? (data.registrationSucceeded ? 'Yes' : 'FAILED — CHECK MANUALLY') : ''
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

  if (data.event === 'domain_registration') {
    var subject = data.registrationSucceeded
      ? 'Domain purchased & registered: ' + data.domain
      : 'ACTION NEEDED — domain paid but registration FAILED: ' + data.domain;

    var body = 'Domain: ' + (data.domain || '—') + '\n' +
      'Client email: ' + (data.email || '—') + '\n' +
      'Amount paid: ' + amount + ' ' + (data.currency || '').toUpperCase() + '\n' +
      'Cloudflare registration succeeded: ' + (data.registrationSucceeded ? 'Yes' : 'NO — register manually in the Cloudflare dashboard') + '\n' +
      'Stripe session: ' + (data.stripeSessionId || '—') + '\n\n' +
      'View log:\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl();

    MailApp.sendEmail(recipient, subject, body);
    return;
  }

  var subject2 = 'Plan purchased: ' + (data.plan || '—');
  var body2 = 'Plan: ' + (data.plan || '—') + '\n' +
    'Client email: ' + (data.email || '—') + '\n' +
    'Amount paid: ' + amount + ' ' + (data.currency || '').toUpperCase() + '\n' +
    'Stripe session: ' + (data.stripeSessionId || '—') + '\n\n' +
    'View log:\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl();

  MailApp.sendEmail(recipient, subject2, body2);
}
