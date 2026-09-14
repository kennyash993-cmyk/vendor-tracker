const sgMail = require('@sendgrid/mail');
const cron = require('node-cron');
const db = require('./db');
const { buildReceiptBuffer } = require('./pdf');

// Use SendGrid API key stored in SMTP_PASS
sgMail.setApiKey(process.env.SMTP_PASS);

// Build overdue email HTML
function buildOverdueEmailHtml(overdueItems, thresholdDays) {
  const rows = overdueItems
    .map(
      (i) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;">${i.woNumber || ''}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${i.poNumber || ''}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${i.vendorName || ''}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${i.description || ''}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${i.sentDate || ''}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;color:#b00;">${i.daysOut}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;">
      <h2>Vendor Work Alert: ${overdueItems.length} component(s) out ${thresholdDays}+ days</h2>
      <table style="border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f2f2f2;">
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Work Order</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">PO #</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Vendor</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Component</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Sent Date</th>
            <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Days Out</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#888;font-size:12px;margin-top:16px;">Sent automatically by your Vendor Work Tracker app.</p>
    </div>
  `;
}

// Run overdue alert check
async function runAlertCheck({ force = false } = {}) {
  const settings = await db.getSettings();

  if (!settings.alertsEnabled && !force) {
    return { sent: false, reason: 'Alerts disabled in settings.' };
  }
  if (!settings.emailRecipients || settings.emailRecipients.length === 0) {
    return { sent: false, reason: 'No email recipients configured.' };
  }

  const overdue = await db.getOverdueComponents(settings.alertThresholdDays);
  if (overdue.length === 0) {
    return { sent: false, reason: 'Nothing over the threshold right now.' };
  }

  const html = buildOverdueEmailHtml(overdue, settings.alertThresholdDays);

  await sgMail.send({
    to: settings.emailRecipients,
    from: process.env.EMAIL_FROM,
    subject: `Vendor Work Alert: ${overdue.length} item(s) out ${settings.alertThresholdDays}+ days`,
    html
  });

  return { sent: true, count: overdue.length };
}

// Send pickup/return receipt email with PDF attachment
async function sendReceiptEmail(wo, event) {
  const settings = await db.getSettings();
  if (!settings.emailRecipients || settings.emailRecipients.length === 0) {
    return { sent: false, reason: 'No email recipients configured in Settings.' };
  }

  const buffer = await buildReceiptBuffer(wo, event);
  const typeLabel = event.type === 'out' ? 'Pickup' : 'Return';
  const fileSafeWo = (wo.woNumber || wo.id).replace(/[^a-z0-9-_]/gi, '_');

  await sgMail.send({
    to: settings.emailRecipients,
    from: process.env.EMAIL_FROM,
    subject: `${typeLabel} Receipt — WO ${wo.woNumber || ''} (${wo.vendorName || 'vendor'})`,
    html: `<p>Attached is the signed ${typeLabel.toLowerCase()} receipt.</p>`,
    attachments: [
      {
        content: buffer.toString('base64'),
        filename: `${typeLabel.toLowerCase()}-receipt-${fileSafeWo}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment'
      }
    ]
  });

  return { sent: true };
}

// Cron scheduler
function scheduleAlerts() {
  const cronExpr = process.env.ALERT_CRON || '0 8 * * *';
  cron.schedule(cronExpr, async () => {
    try {
      const result = await runAlertCheck();
      console.log('[alert check]', result);
    } catch (err) {
      console.error('[alert check] failed:', err.message);
    }
  });
  console.log(`Alert emails scheduled with cron pattern "${cronExpr}"`);
}

module.exports = { runAlertCheck, sendReceiptEmail, scheduleAlerts };

