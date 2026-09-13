const nodemailer = require('nodemailer');
const cron = require('node-cron');
const db = require('./db');
const { buildReceiptBuffer } = require('./pdf');

function buildTransporter() {
  if (!process.env.SMTP_HOST) return null;

  // DEBUG LOGS — these will show in Railway logs
  console.log('SMTP HOST:', process.env.SMTP_HOST);
  console.log('SMTP USER:', process.env.SMTP_USER);
  console.log('SMTP PORT:', process.env.SMTP_PORT);
  console.log('SMTP SECURE:', process.env.SMTP_SECURE);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
}


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

  const transporter = buildTransporter();
  if (!transporter) {
    return { sent: false, reason: 'Email (SMTP) is not configured in .env yet.' };
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: settings.emailRecipients.join(','),
    subject: `Vendor Work Alert: ${overdue.length} item(s) out ${settings.alertThresholdDays}+ days`,
    html: buildOverdueEmailHtml(overdue, settings.alertThresholdDays)
  });

  return { sent: true, count: overdue.length };
}

// Emails a signed pickup/return receipt (as a PDF attachment) to the same
// recipients configured for overdue alerts.
async function sendReceiptEmail(wo, event) {
  const settings = await db.getSettings();
  if (!settings.emailRecipients || settings.emailRecipients.length === 0) {
    return { sent: false, reason: 'No email recipients configured in Settings.' };
  }

  const transporter = buildTransporter();
  if (!transporter) {
    return { sent: false, reason: 'Email (SMTP) is not configured in .env yet.' };
  }

  const buffer = await buildReceiptBuffer(wo, event);
  const typeLabel = event.type === 'out' ? 'Pickup' : 'Return';
  const fileSafeWo = (wo.woNumber || wo.id).replace(/[^a-z0-9-_]/gi, '_');

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: settings.emailRecipients.join(','),
    subject: `${typeLabel} Receipt \u2014 WO ${wo.woNumber || ''} (${wo.vendorName || 'vendor'})`,
    text: `Attached is the signed ${typeLabel.toLowerCase()} receipt for work order ${wo.woNumber || wo.id}, PO ${wo.poNumber || '\u2014'}, vendor ${wo.vendorName || '\u2014'}.`,
    attachments: [
      {
        filename: `${typeLabel.toLowerCase()}-receipt-${fileSafeWo}.pdf`,
        content: buffer
      }
    ]
  });

  return { sent: true };
}

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
