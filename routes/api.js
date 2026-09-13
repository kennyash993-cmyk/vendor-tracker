const express = require('express');
const router = express.Router();
const db = require('../db');
const { runAlertCheck, sendReceiptEmail } = require('../email');
const { buildReceiptBuffer } = require('../pdf');

// Small helper so every route doesn't need its own try/catch boilerplate.
function h(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message });
    });
  };
}

// ---------- Work Orders ----------

router.get('/work-orders', h(async (req, res) => {
  let list = await db.getAllWorkOrders();
  const { status, vendor, q, poNumber, woNumber, dateFrom, dateTo, onlyOut, onlyPending } = req.query;

  if (status && status !== 'all') {
    list = list.filter((wo) => wo.status === status);
  }
  if (vendor) {
    list = list.filter((wo) => wo.vendorName.toLowerCase().includes(vendor.toLowerCase()));
  }
  if (poNumber) {
    list = list.filter((wo) => wo.poNumber.toLowerCase().includes(poNumber.toLowerCase()));
  }
  if (woNumber) {
    list = list.filter((wo) => wo.woNumber.toLowerCase().includes(woNumber.toLowerCase()));
  }
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter((wo) => {
      const haystack = [wo.woNumber, wo.poNumber, wo.vendorName, wo.notes, ...wo.components.map((c) => c.description)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }
  if (dateFrom) {
    list = list.filter((wo) => wo.components.some((c) => c.sentDate && c.sentDate >= dateFrom));
  }
  if (dateTo) {
    list = list.filter((wo) => wo.components.some((c) => c.sentDate && c.sentDate <= dateTo));
  }
  if (onlyOut === 'true') {
    list = list
      .map((wo) => ({ ...wo, components: wo.components.filter((c) => c.status === 'out') }))
      .filter((wo) => wo.components.length > 0);
  }
  if (onlyPending === 'true') {
    list = list
      .map((wo) => ({ ...wo, components: wo.components.filter((c) => c.status === 'pending') }))
      .filter((wo) => wo.components.length > 0);
  }

  res.json(list);
}));

router.get('/work-orders/:id', h(async (req, res) => {
  const wo = await db.getWorkOrderById(req.params.id);
  if (!wo) return res.status(404).json({ error: 'Not found' });
  res.json(wo);
}));

router.post('/work-orders', h(async (req, res) => {
  const wo = await db.createWorkOrder(req.body);
  res.status(201).json(wo);
}));

router.put('/work-orders/:id', h(async (req, res) => {
  const wo = await db.updateWorkOrder(req.params.id, req.body);
  if (!wo) return res.status(404).json({ error: 'Not found' });
  res.json(wo);
}));

router.delete('/work-orders/:id', h(async (req, res) => {
  const ok = await db.deleteWorkOrder(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

// ---------- Components ----------

router.post('/work-orders/:id/components', h(async (req, res) => {
  const wo = await db.addComponent(req.params.id, req.body);
  if (!wo) return res.status(404).json({ error: 'Work order not found' });
  res.status(201).json(wo);
}));

router.put('/work-orders/:id/components/:componentId', h(async (req, res) => {
  const wo = await db.updateComponent(req.params.id, req.params.componentId, req.body);
  if (!wo) return res.status(404).json({ error: 'Not found' });
  res.json(wo);
}));

router.delete('/work-orders/:id/components/:componentId', h(async (req, res) => {
  const wo = await db.deleteComponent(req.params.id, req.params.componentId);
  if (!wo) return res.status(404).json({ error: 'Not found' });
  res.json(wo);
}));

// ---------- Sign out / sign in (vendor signature, can cover multiple components at once) ----------

router.post('/work-orders/:id/sign-out', h(async (req, res) => {
  const { componentIds, signerName, signatureImage } = req.body;
  if (!signerName || !signerName.trim()) {
    return res.status(400).json({ error: 'Signer name is required' });
  }
  const wo = await db.signComponents(req.params.id, componentIds, 'out', signerName, signatureImage);
  if (!wo) return res.status(404).json({ error: 'Work order not found' });

  // Best-effort: email a signed pickup receipt automatically. Never let an
  // email hiccup block the sign-out itself.
  db.getSettings()
    .then((settings) => {
      if (settings.receiptEmailsEnabled === false) return;
      const event = wo.signatures[wo.signatures.length - 1];
      if (!event) return;
      return sendReceiptEmail(wo, event);
    })
    .catch((err) => console.error('[pickup receipt email] failed:', err.message));

  res.json(wo);
}));

router.post('/work-orders/:id/sign-in', h(async (req, res) => {
  const { componentIds, signerName, signatureImage } = req.body;
  if (!signerName || !signerName.trim()) {
    return res.status(400).json({ error: 'Signer name is required' });
  }
  const wo = await db.signComponents(req.params.id, componentIds, 'in', signerName, signatureImage);
  if (!wo) return res.status(404).json({ error: 'Work order not found' });
  res.json(wo);
}));

// ---------- Printable / emailed signature receipts ----------

router.get('/work-orders/:id/signatures/:sigId/pdf', h(async (req, res) => {
  const wo = await db.getWorkOrderById(req.params.id);
  if (!wo) return res.status(404).json({ error: 'Not found' });
  const event = wo.signatures.find((e) => e.id === req.params.sigId);
  if (!event) return res.status(404).json({ error: 'Signature not found' });

  const buffer = await buildReceiptBuffer(wo, event);
  const fileSafeWo = (wo.woNumber || wo.id).replace(/[^a-z0-9-_]/gi, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="receipt-${fileSafeWo}.pdf"`);
  res.send(buffer);
}));

router.post('/work-orders/:id/signatures/:sigId/email', h(async (req, res) => {
  const wo = await db.getWorkOrderById(req.params.id);
  if (!wo) return res.status(404).json({ error: 'Not found' });
  const event = wo.signatures.find((e) => e.id === req.params.sigId);
  if (!event) return res.status(404).json({ error: 'Signature not found' });

  const result = await sendReceiptEmail(wo, event);
  res.json(result);
}));

// ---------- Settings ----------

router.get('/settings', h(async (req, res) => {
  res.json(await db.getSettings());
}));

router.put('/settings', h(async (req, res) => {
  res.json(await db.updateSettings(req.body));
}));

router.get('/vendors', h(async (req, res) => {
  res.json(await db.getVendorNames());
}));

// ---------- Overdue alerts ----------

router.post('/alerts/run-now', h(async (req, res) => {
  const result = await runAlertCheck({ force: true });
  res.json(result);
}));

router.get('/alerts/preview', h(async (req, res) => {
  const settings = await db.getSettings();
  const threshold = req.query.threshold ? Number(req.query.threshold) : settings.alertThresholdDays;
  res.json(await db.getOverdueComponents(threshold));
}));

module.exports = router;
