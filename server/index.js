import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  listLoads, upsertLoad, updateLoadPartial, deleteLoad, getLoad,
  listMessagesByLoad,
  listParties, createParty, updateParty, deleteParty,
  listLocations, createLocation, updateLocation, deleteLocation,
  listRecipients, createRecipient, updateRecipient, deleteRecipient,
  listMerchants, createMerchant, updateMerchant, deleteMerchant,
  listDispatchers, createDispatcher, updateDispatcher, deleteDispatcher
} from './db.js';
import { sendSMS } from './sms.js';
import { sendEmail } from './email.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health check
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* ===== Loads API ===== */
function recipientsForStatus(load) {
  const all = [load.agentPhone, load.merchantPhone, load.shipperPhone, load.receiverPhone].filter(Boolean);
  const uniq = Array.from(new Set(all));
  if (load.status?.toLowerCase().includes('en-route to unload')) {
    return uniq.filter(p => p !== load.shipperPhone);
  }
  return uniq;
}
function driverLink(id) {
  const base = process.env.BASE_URL || `http://localhost:${PORT}`;
  return `${base}/driver/${encodeURIComponent(id)}`;
}

app.get('/api/loads', (req, res) => {
  res.json({ ok: true, items: listLoads() });
});
app.get('/api/loads/:id', (req, res) => {
  const one = getLoad(req.params.id);
  if (!one) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, item: one });
});
app.post('/api/loads', async (req, res) => {
  const body = req.body || {};
  const saved = upsertLoad(body);
  if (body.driverPhone) {
    const msg = `Load ${saved.id}: ${saved.origin} → ${saved.destination}. Update status: ${driverLink(saved.id)}`;
    await sendSMS(saved.driverPhone, msg);
  }
  res.status(201).json({ ok: true, item: saved });
});
app.patch('/api/loads/:id', async (req, res) => {
  const { id } = req.params;
  const before = getLoad(id);
  if (!before) return res.status(404).json({ ok: false, error: 'Not found' });
  const patched = updateLoadPartial(id, req.body || {});
  const statusChanged = req.body.status && req.body.status !== before.status;
  const etaChanged = req.body.eta && req.body.eta !== before.eta;
  if (statusChanged || etaChanged) {
    const recips = recipientsForStatus(patched);
    const etaText = patched.eta ? ` ETA ${patched.eta}` : '';
    const msg = `Load ${patched.id}: ${patched.status}.${etaText} ${patched.origin} → ${patched.destination}`;
    for (const to of recips) await sendSMS(to, msg);
  }
  res.json({ ok: true, item: patched });
});
app.delete('/api/loads/:id', (req, res) => {
  const { id } = req.params;
  const r = deleteLoad(id);
  if (r.changes === 0) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true });
});
app.post('/api/message', async (req, res) => {
  const { loadId, to, body } = req.body || {};
  if (!loadId || !to || !body) return res.status(400).json({ ok: false, error: 'loadId, to, body required' });
  const l = getLoad(loadId);
  if (!l) return res.status(404).json({ ok: false, error: 'Load not found' });
  let toPhone = '';
  if (to === 'driver') toPhone = l.driverPhone;
  else if (to === 'dispatcher') toPhone = l.dispatcherPhone || l.agentPhone;
  if (!toPhone) return res.status(400).json({ ok: false, error: `No phone on file for ${to}` });
  const msg = `Load ${l.id}: ${body}`;
  const r = await sendSMS(toPhone, msg);
  try { const { logMessage } = await import('./db.js'); logMessage({ loadId, toRole: to, toPhone, body }); } catch (e) {}
  res.json({ ok: true, sent: !!r?.ok, twilio: r });
});

/* ===== Static web app ===== */
const webDir = path.resolve(__dirname, '../web');
app.use(express.static(webDir));

// Explicit pages
app.get('/dispatcher', (req, res) => {
  res.sendFile(path.join(webDir, 'dispatcher.html'));
});
app.get('/driver/:id', (req, res) => {
  res.sendFile(path.join(webDir, 'driver.html'));
});
app.get('/portal/:id', (req, res) => {
  res.sendFile(path.join(webDir, 'portal.html'));
});

/* ===== API for messages, parties, locations, etc. ===== */
app.get('/api/messages', (req, res) => {
  const { loadId } = req.query;
  if (!loadId) return res.status(400).json({ ok: false, error: 'loadId required' });
  res.json({ ok: true, items: listMessagesByLoad(loadId) });
});
app.get('/api/parties', (req, res) => {
  const { kind } = req.query;
  res.json({ ok: true, items: listParties(kind) });
});
app.post('/api/parties', (req, res) => res.status(201).json({ ok: true, item: createParty(req.body || {}) }));
app.patch('/api/parties/:id', (req, res) => res.json({ ok: true, item: updateParty(+req.params.id, req.body || {}) }));
app.delete('/api/parties/:id', (req, res) => { const r = deleteParty(+req.params.id); res.json({ ok: r.changes > 0 }); });

app.get('/api/locations', (req, res) => {
  const { partyId } = req.query;
  if (!partyId) return res.status(400).json({ ok: false, error: 'partyId required' });
  res.json({ ok: true, items: listLocations(+partyId) });
});
app.post('/api/locations', (req, res) => res.status(201).json({ ok: true, item: createLocation(req.body || {}) }));
app.patch('/api/locations/:id', (req, res) => res.json({ ok: true, item: updateLocation(+req.params.id, req.body || {}) }));
app.delete('/api/locations/:id', (req, res) => { const r = deleteLocation(+req.params.id); res.json({ ok: r.changes > 0 }); });

app.get('/api/recipients', (req, res) => {
  const { locationId } = req.query;
  if (!locationId) return res.status(400).json({ ok: false, error: 'locationId required' });
  res.json({ ok: true, items: listRecipients(+locationId) });
});
app.post('/api/recipients', (req, res) => res.status(201).json({ ok: true, item: createRecipient(req.body || {}) }));
app.patch('/api/recipients/:id', (req, res) => res.json({ ok: true, item: updateRecipient(+req.params.id, req.body || {}) }));
app.delete('/api/recipients/:id', (req, res) => { const r = deleteRecipient(+req.params.id); res.json({ ok: r.changes > 0 }); });

app.get('/api/merchants', (req, res) => res.json({ ok: true, items: listMerchants() }));
app.post('/api/merchants', (req, res) => res.status(201).json({ ok: true, item: createMerchant(req.body || {}) }));
app.patch('/api/merchants/:id', (req, res) => res.json({ ok: true, item: updateMerchant(+req.params.id, req.body || {}) }));
app.delete('/api/merchants/:id', (req, res) => { const r = deleteMerchant(+req.params.id); res.json({ ok: r.changes > 0 }); });

app.get('/api/dispatchers', (req, res) => res.json({ ok: true, items: listDispatchers() }));
app.post('/api/dispatchers', (req, res) => res.status(201).json({ ok: true, item: createDispatcher(req.body || {}) }));
app.patch('/api/dispatchers/:id', (req, res) => res.json({ ok: true, item: updateDispatcher(+req.params.id, req.body || {}) }));
app.delete('/api/dispatchers/:id', (req, res) => { const r = deleteDispatcher(+req.params.id); res.json({ ok: r.changes > 0 }); });

/* ===== Fallback (must be last) ===== */
app.get('*', (req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Driver-Comm server running on http://localhost:${PORT}`);
});
