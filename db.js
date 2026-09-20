const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// ---------- Connection (lazy + memoized, so any function can just call it) ----------

let connectPromise = null;

function connect() {
  if (!connectPromise) {
    connectPromise = (async () => {
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        throw new Error(
          'MONGODB_URI is not set. Add your MongoDB Atlas connection string to .env (see .env.example).'
        );
      }

      const client = new MongoClient(uri, {
        tls: true,
        tlsAllowInvalidCertificates: false
      });

      await client.connect();

      const database = client.db(process.env.MONGODB_DB_NAME || 'vendor_tracker');
      const workOrdersCol = database.collection('workOrders');
      const settingsCol = database.collection('settings');

      await workOrdersCol.createIndex({ id: 1 }, { unique: true });

      const existingSettings = await settingsCol.findOne({ _id: 'app-settings' });
      if (!existingSettings) {
        await settingsCol.insertOne({
          _id: 'app-settings',
          alertThresholdDays: 7,
          emailRecipients: [],
          alertsEnabled: true,
          receiptEmailsEnabled: true
        });
      }

      console.log('Connected to MongoDB:', database.databaseName);
      return { client, database, workOrdersCol, settingsCol };
    })();
  }

  return connectPromise;
}

function newId() {
  return crypto.randomBytes(16).toString('hex');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Calendar days (kept in case you ever want it again)
function daysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const diff = e - s;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Business days (Mon–Fri only)
function businessDaysBetween(start, end) {
  if (!start || !end) return 0;

  const s = new Date(start);
  const e = new Date(end);

  let count = 0;
  let current = new Date(s);

  while (current <= e) {
    const day = current.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

// ---------- Signatures / enrichment helpers ----------

// Find the most recent signature event of a given type ('out' or 'in') that covers this component.
function findSignatureFor(signatures, componentId, type) {
  for (let i = signatures.length - 1; i >= 0; i--) {
    const ev = signatures[i];
    if (ev.type === type && ev.componentIds.includes(componentId)) {
      return { signerName: ev.signerName, signatureImage: ev.signatureImage, timestamp: ev.timestamp };
    }
  }
  return null;
}

function enrichComponent(c, signatures) {
  const today = todayISO();
  let daysOut = 0;

  if (c.status === 'out' && c.sentDate) {
    // Use business days from sentDate to today
    daysOut = businessDaysBetween(c.sentDate, today);
  } else if (c.status === 'returned' && c.sentDate && c.returnedDate) {
    // Use business days from sentDate to returnedDate
    daysOut = businessDaysBetween(c.sentDate, c.returnedDate);
  }

  const isOverdueByExpected =
    c.status === 'out' && c.expectedReturnDate && c.expectedReturnDate < today;

  return {
    ...c,
    daysOut, // now represents business days out
    isOverdueByExpected,
    pickupSignature: findSignatureFor(signatures, c.id, 'out'),
    returnSignature: findSignatureFor(signatures, c.id, 'in')
  };
}

function enrichWorkOrder(wo) {
  const signatures = wo.signatures || [];
  const components = (wo.components || []).map((c) => enrichComponent(c, signatures));

  const anyOut = components.some((c) => c.status === 'out');
  const anyPending = components.some((c) => c.status === 'pending');

  let status = 'closed';
  if (anyOut) status = 'open';
  else if (anyPending) status = 'pending';
  else if (components.length === 0) status = 'pending';

  const maxDaysOut = components
    .filter((c) => c.status === 'out')
    .reduce((max, c) => Math.max(max, c.daysOut), 0);

  return { ...wo, components, signatures, status, maxDaysOut };
}

// ---------- Raw document helpers (Mongo I/O only, no enrichment) ----------

async function getRaw(id) {
  const { workOrdersCol } = await connect();
  return workOrdersCol.findOne({ id }, { projection: { _id: 0 } });
}

async function saveRaw(wo) {
  const { workOrdersCol } = await connect();
  await workOrdersCol.replaceOne({ id: wo.id }, wo, { upsert: true });
}

// ---------- Work Orders ----------

async function getAllWorkOrders() {
  const { workOrdersCol } = await connect();
  const list = await workOrdersCol
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
  return list.map(enrichWorkOrder);
}

async function getWorkOrderById(id) {
  const wo = await getRaw(id);
  return wo ? enrichWorkOrder(wo) : null;
}

async function createWorkOrder({ woNumber, poNumber, vendorName, notes, components }) {
  const { workOrdersCol } = await connect();
  const now = new Date().toISOString();

  const wo = {
    id: newId(),
    woNumber: woNumber || '',
    poNumber: poNumber || '',
    vendorName: vendorName || '',
    notes: notes || '',
    createdAt: now,
    signatures: [],
    components: (components || []).map((c) => ({
      id: newId(),
      description: c.description || '',
      sentDate: null,
      expectedReturnDate: c.expectedReturnDate || '',
      returnedDate: null,
      status: 'pending',
      notes: c.notes || ''
    }))
  };

  await workOrdersCol.insertOne(wo);
  return enrichWorkOrder(wo);
}

async function updateWorkOrder(id, fields) {
  const wo = await getRaw(id);
  if (!wo) return null;

  ['woNumber', 'poNumber', 'vendorName', 'notes'].forEach((key) => {
    if (fields[key] !== undefined) wo[key] = fields[key];
  });

  await saveRaw(wo);
  return enrichWorkOrder(wo);
}

async function deleteWorkOrder(id) {
  const { workOrdersCol } = await connect();
  const result = await workOrdersCol.deleteOne({ id });
  return result.deletedCount > 0;
}

// ---------- Components ----------

async function addComponent(workOrderId, { description, expectedReturnDate, notes }) {
  const wo = await getRaw(workOrderId);
  if (!wo) return null;

  wo.components.push({
    id: newId(),
    description: description || '',
    sentDate: null,
    expectedReturnDate: expectedReturnDate || '',
    returnedDate: null,
    status: 'pending',
    notes: notes || ''
  });

  await saveRaw(wo);
  return enrichWorkOrder(wo);
}

async function updateComponent(workOrderId, componentId, fields) {
  const wo = await getRaw(workOrderId);
  if (!wo) return null;

  const comp = wo.components.find((c) => c.id === componentId);
  if (!comp) return null;

  ['description', 'sentDate', 'expectedReturnDate', 'returnedDate', 'notes'].forEach((key) => {
    if (fields[key] !== undefined) comp[key] = fields[key];
  });

  await saveRaw(wo);
  return enrichWorkOrder(wo);
}

async function deleteComponent(workOrderId, componentId) {
  const wo = await getRaw(workOrderId);
  if (!wo) return null;

  wo.components = wo.components.filter((c) => c.id !== componentId);

  if (wo.signatures) {
    wo.signatures.forEach((ev) => {
      ev.componentIds = ev.componentIds.filter((id) => id !== componentId);
    });
  }

  await saveRaw(wo);
  return enrichWorkOrder(wo);
}

// ---------- Sign out / sign in (vendor signature, can cover multiple components at once) ----------
// type: 'out' (vendor picking items up) or 'in' (vendor dropping items back off)

async function signComponents(workOrderId, componentIds, type, signerName, signatureImage) {
  const wo = await getRaw(workOrderId);
  if (!wo) return null;
  if (!Array.isArray(componentIds) || componentIds.length === 0) return enrichWorkOrder(wo);
  if (!wo.signatures) wo.signatures = [];

  const today = todayISO();
  const now = new Date().toISOString();

  const validIds = componentIds.filter((cid) => wo.components.some((c) => c.id === cid));
  if (validIds.length === 0) return enrichWorkOrder(wo);

  wo.signatures.push({
    id: newId(),
    type,
    componentIds: validIds,
    signerName: (signerName || '').trim(),
    signatureImage: signatureImage || null,
    timestamp: now
  });

  validIds.forEach((cid) => {
    const c = wo.components.find((cc) => cc.id === cid);
    if (!c) return;
    if (type === 'out') {
      c.status = 'out';
      c.sentDate = today;
      c.returnedDate = null;
    } else if (type === 'in') {
      c.status = 'returned';
      c.returnedDate = today;
    }
  });

  await saveRaw(wo);
  return enrichWorkOrder(wo);
}

// ---------- Settings ----------

async function getSettings() {
  const { settingsCol } = await connect();
  const doc = await settingsCol.findOne({ _id: 'app-settings' });
  const { _id, ...rest } = doc;
  return rest;
}

async function updateSettings(fields) {
  const { settingsCol } = await connect();
  await settingsCol.updateOne({ _id: 'app-settings' }, { $set: fields }, { upsert: true });
  return getSettings();
}

// ---------- Derived / helper queries ----------

async function getVendorNames() {
  const { workOrdersCol } = await connect();
  const names = await workOrdersCol.distinct('vendorName');
  return names.filter(Boolean).sort();
}

async function getOverdueComponents(thresholdDays) {
  const all = await getAllWorkOrders();
  const result = [];

  all.forEach((wo) => {
    wo.components.forEach((c) => {
      if (c.status === 'out' && c.daysOut >= thresholdDays) {
        result.push({
          woNumber: wo.woNumber,
          poNumber: wo.poNumber,
          vendorName: wo.vendorName,
          description: c.description,
          sentDate: c.sentDate,
          expectedReturnDate: c.expectedReturnDate,
          daysOut: c.daysOut, // business days
          workOrderId: wo.id,
          componentId: c.id
        });
      }
    });
  });

  return result.sort((a, b) => b.daysOut - a.daysOut);
}

module.exports = {
  connect,
  getAllWorkOrders,
  getWorkOrderById,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
  addComponent,
  updateComponent,
  deleteComponent,
  signComponents,
  getSettings,
  updateSettings,
  getVendorNames,
  getOverdueComponents
};

