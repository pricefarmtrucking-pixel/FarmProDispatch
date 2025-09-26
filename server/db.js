// server/db.js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../data/driver-comm.db');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

/* ========= Schema ========= */

// Loads
db.exec(`
CREATE TABLE IF NOT EXISTS loads (
  id TEXT PRIMARY KEY,
  origin TEXT,
  destination TEXT,
  lane TEXT,
  driver TEXT,
  driverPhone TEXT,
  status TEXT,
  eta TEXT,
  agentPhone TEXT,
  merchantPhone TEXT,
  shipperPhone TEXT,
  receiverPhone TEXT,
  dispatcherPhone TEXT,
  originLocationId INTEGER,
  destinationLocationId INTEGER,
  commodity TEXT,
  createdAt TEXT,
  updatedAt TEXT
);`);

// Messages (outbound audit)
db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loadId TEXT,
  toRole TEXT,
  toPhone TEXT,
  body TEXT,
  createdAt TEXT,
  fromRole TEXT,
  fromName TEXT
);`);

// Partners (shipper/receiver orgs)
db.exec(`
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,      -- 'shipper' | 'receiver'
  name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  createdAt TEXT,
  updatedAt TEXT
);`);

// Locations for a partner
db.exec(`
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partnerId INTEGER,
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  lat REAL,
  lng REAL,
  createdAt TEXT,
  updatedAt TEXT
);`);

// Recipients (notification routing for a location)
db.exec(`
CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locationId INTEGER,
  role TEXT,            -- 'agent' | 'merchant' | 'dispatcher' | 'ops' | 'other'
  name TEXT,
  phone TEXT,
  email TEXT,
  notifySMS INTEGER DEFAULT 1,
  notifyEmail INTEGER DEFAULT 0,
  createdAt TEXT,
  updatedAt TEXT
);`);

// Legacy mapping table used by earlier UI (kept for compatibility)
db.exec(`
CREATE TABLE IF NOT EXISTS location_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locationId INTEGER,
  partnerId INTEGER,
  channel TEXT,
  createdAt TEXT
);`);

// Directories
db.exec(`
CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  phone TEXT,
  email TEXT,
  notes TEXT,
  createdAt TEXT,
  updatedAt TEXT
);`);

db.exec(`
CREATE TABLE IF NOT EXISTS dispatchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  phone TEXT,
  email TEXT,
  notes TEXT,
  createdAt TEXT,
  updatedAt TEXT
);`);

/* ========= Migrations (safe) ========= */
try {
  const cols = db.prepare('PRAGMA table_info(loads)').all().map(r => r.name);
  if (!cols.includes('dispatcherPhone')) db.exec('ALTER TABLE loads ADD COLUMN dispatcherPhone TEXT');
  if (!cols.includes('originLocationId')) db.exec('ALTER TABLE loads ADD COLUMN originLocationId INTEGER');
  if (!cols.includes('destinationLocationId')) db.exec('ALTER TABLE loads ADD COLUMN destinationLocationId INTEGER');
  if (!cols.includes('commodity')) db.exec('ALTER TABLE loads ADD COLUMN commodity TEXT');
} catch (e) {
  console.error('loads migration:', e.message);
}

try {
  const mcols = db.prepare('PRAGMA table_info(messages)').all().map(r => r.name);
  if (!mcols.includes('fromRole')) db.exec('ALTER TABLE messages ADD COLUMN fromRole TEXT');
  if (!mcols.includes('fromName')) db.exec('ALTER TABLE messages ADD COLUMN fromName TEXT');
} catch (e) {
  console.error('messages migration:', e.message);
}

/* ========= Utils ========= */
export const nowISO = () => new Date().toISOString();
export function makeId(prefix = 'LD') { return `${prefix}-${Math.floor(Math.random()*90000+10000)}`; }
export function normPhone(p) {
  if (!p) return '';
  const raw = String(p).trim();
  if (raw.startsWith('+')) return raw.replace(/\s+/g, '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return '';
}

/* ========= Loads ========= */
export function listLoads() {
  return db.prepare('SELECT * FROM loads ORDER BY datetime(createdAt) DESC').all();
}
export function getLoad(id) {
  return db.prepare('SELECT * FROM loads WHERE id=?').get(id);
}
export function upsertLoad(load) {
  const now = nowISO();
  const id = (load.id && String(load.id).trim()) || makeId('LD');
  const lane = `${load.origin || ''} → ${load.destination || ''}`;
  const existing = getLoad(id);

  const common = {
    origin: load.origin || '',
    destination: load.destination || '',
    lane,
    driver: load.driver || '',
    driverPhone: normPhone(load.driverPhone),
    status: load.status || 'Planned',
    eta: load.eta || '',
    agentPhone: normPhone(load.agentPhone),
    merchantPhone: normPhone(load.merchantPhone),
    shipperPhone: normPhone(load.shipperPhone),
    receiverPhone: normPhone(load.receiverPhone),
    dispatcherPhone: normPhone(load.dispatcherPhone || load.agentPhone),
    originLocationId: load.originLocationId || null,
    destinationLocationId: load.destinationLocationId || null,
    commodity: load.commodity || ''
  };

  if (existing) {
    db.prepare(`UPDATE loads SET
      origin=@origin, destination=@destination, lane=@lane, driver=@driver, driverPhone=@driverPhone,
      status=@status, eta=@eta, agentPhone=@agentPhone, merchantPhone=@merchantPhone, shipperPhone=@shipperPhone,
      receiverPhone=@receiverPhone, dispatcherPhone=@dispatcherPhone,
      originLocationId=@originLocationId, destinationLocationId=@destinationLocationId,
      commodity=@commodity, updatedAt=@updatedAt
      WHERE id=@id`).run({ ...existing, ...common, updatedAt: now, id });
    return getLoad(id);
  }

  db.prepare(`INSERT INTO loads
    (id, origin, destination, lane, driver, driverPhone, status, eta,
     agentPhone, merchantPhone, shipperPhone, receiverPhone, dispatcherPhone,
     originLocationId, destinationLocationId, commodity, createdAt, updatedAt)
    VALUES
    (@id, @origin, @destination, @lane, @driver, @driverPhone, @status, @eta,
     @agentPhone, @merchantPhone, @shipperPhone, @receiverPhone, @dispatcherPhone,
     @originLocationId, @destinationLocationId, @commodity, @createdAt, @updatedAt)`)
    .run({ id, ...common, createdAt: now, updatedAt: now });
  return getLoad(id);
}
export function updateLoadPartial(id, patch) {
  const existing = getLoad(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: nowISO() };
  if (patch.origin !== undefined || patch.destination !== undefined) {
    merged.lane = `${merged.origin || ''} → ${merged.destination || ''}`;
  }
  db.prepare(`UPDATE loads SET
    origin=@origin, destination=@destination, lane=@lane, driver=@driver, driverPhone=@driverPhone,
    status=@status, eta=@eta, agentPhone=@agentPhone, merchantPhone=@merchantPhone, shipperPhone=@shipperPhone,
    receiverPhone=@receiverPhone, dispatcherPhone=@dispatcherPhone,
    originLocationId=@originLocationId, destinationLocationId=@destinationLocationId,
    commodity=@commodity, updatedAt=@updatedAt
    WHERE id=@id`).run(merged);
  return getLoad(id);
}
export function deleteLoad(id) {
  return db.prepare('DELETE FROM loads WHERE id=?').run(id);
}

/* ========= Messages ========= */
export function logMessage(m) {
  db.prepare(`INSERT INTO messages (loadId,toRole,toPhone,body,createdAt,fromRole,fromName)
              VALUES (@loadId,@toRole,@toPhone,@body,@createdAt,@fromRole,@fromName)`)
    .run({ ...m, createdAt: nowISO() });
}
export function listMessagesByLoad(loadId) {
  return db.prepare('SELECT * FROM messages WHERE loadId=? ORDER BY datetime(createdAt) ASC').all(loadId);
}

/* ========= Partners & Locations ========= */
export function listPartners(type) {
  const stmt = type
    ? db.prepare('SELECT * FROM partners WHERE type=? ORDER BY name')
    : db.prepare('SELECT * FROM partners ORDER BY type,name');
  return type ? stmt.all(type) : stmt.all();
}
export function getPartner(id) {
  return db.prepare('SELECT * FROM partners WHERE id=?').get(id);
}
export function createPartner(p) {
  const t = nowISO();
  const row = {
    type: p.type || '',
    name: p.name || '',
    phone: normPhone(p.phone),
    email: p.email || '',
    notes: p.notes || '',
    createdAt: t,
    updatedAt: t
  };
  const r = db.prepare(`INSERT INTO partners (type,name,phone,email,notes,createdAt,updatedAt)
                        VALUES (@type,@name,@phone,@email,@notes,@createdAt,@updatedAt)`).run(row);
  return getPartner(r.lastInsertRowid);
}
export function updatePartner(id, patch) {
  const cur = getPartner(id);
  if (!cur) return null;
  const row = { ...cur, ...patch, phone: normPhone(patch.phone ?? cur.phone), updatedAt: nowISO() };
  db.prepare(`UPDATE partners SET type=@type,name=@name,phone=@phone,email=@email,notes=@notes,updatedAt=@updatedAt WHERE id=@id`)
    .run({ ...row, id });
  return getPartner(id);
}
export function deletePartner(id) {
  return db.prepare('DELETE FROM partners WHERE id=?').run(id);
}

// Locations
export function listLocations(partnerId) {
  return db.prepare('SELECT * FROM locations WHERE partnerId=? ORDER BY name').all(partnerId);
}
export function getLocation(id) {
  return db.prepare('SELECT * FROM locations WHERE id=?').get(id);
}
export function createLocation(loc) {
  const t = nowISO();
  const row = {
    partnerId: loc.partnerId,
    name: loc.name || '',
    address: loc.address || '',
    city: loc.city || '',
    state: loc.state || '',
    zip: loc.zip || '',
    lat: loc.lat ?? null,
    lng: loc.lng ?? null,
    createdAt: t,
    updatedAt: t
  };
  const r = db.prepare(`INSERT INTO locations (partnerId,name,address,city,state,zip,lat,lng,createdAt,updatedAt)
                        VALUES (@partnerId,@name,@address,@city,@state,@zip,@lat,@lng,@createdAt,@updatedAt)`).run(row);
  return getLocation(r.lastInsertRowid);
}
export function updateLocation(id, patch) {
  const cur = getLocation(id);
  if (!cur) return null;
  const row = { ...cur, ...patch, updatedAt: nowISO() };
  db.prepare(`UPDATE locations SET name=@name,address=@address,city=@city,state=@state,zip=@zip,lat=@lat,lng=@lng,updatedAt=@updatedAt WHERE id=@id`)
    .run({ ...row, id });
  return getLocation(id);
}
export function deleteLocation(id) {
  db.prepare('DELETE FROM recipients WHERE locationId=?').run(id);
  db.prepare('DELETE FROM location_recipients WHERE locationId=?').run(id); // legacy
  return db.prepare('DELETE FROM locations WHERE id=?').run(id);
}

/* ========= Recipients (used by notification hook & portals) ========= */
export function listRecipients(locationId) {
  return db.prepare('SELECT * FROM recipients WHERE locationId=? ORDER BY name').all(locationId);
}
export function getRecipient(id) {
  return db.prepare('SELECT * FROM recipients WHERE id=?').get(id);
}
export function createRecipient(r) {
  const t = nowISO();
  const row = {
    locationId: r.locationId,
    role: r.role || 'other',
    name: r.name || '',
    phone: normPhone(r.phone),
    email: r.email || '',
    notifySMS: r.notifySMS ? 1 : 0,
    notifyEmail: r.notifyEmail ? 1 : 0,
    createdAt: t,
    updatedAt: t
  };
  const res = db.prepare(`INSERT INTO recipients (locationId,role,name,phone,email,notifySMS,notifyEmail,createdAt,updatedAt)
                          VALUES (@locationId,@role,@name,@phone,@email,@notifySMS,@notifyEmail,@createdAt,@updatedAt)`).run(row);
  return getRecipient(res.lastInsertRowid);
}
export function updateRecipient(id, patch) {
  const cur = getRecipient(id);
  if (!cur) return null;
  const row = {
    ...cur,
    ...patch,
    phone: normPhone(patch.phone ?? cur.phone),
    notifySMS: (patch.notifySMS ?? cur.notifySMS) ? 1 : 0,
    notifyEmail: (patch.notifyEmail ?? cur.notifyEmail) ? 1 : 0,
    updatedAt: nowISO()
  };
  db.prepare(`UPDATE recipients SET locationId=@locationId,role=@role,name=@name,phone=@phone,email=@email,notifySMS=@notifySMS,notifyEmail=@notifyEmail,updatedAt=@updatedAt WHERE id=@id`)
    .run({ ...row, id });
  return getRecipient(id);
}
export function deleteRecipient(id) {
  return db.prepare('DELETE FROM recipients WHERE id=?').run(id);
}

/* ========= Legacy location_recipients helpers (kept if UI still calls them) ========= */
export function listLocationRecipients(locationId) {
  return db.prepare(
    `SELECT lr.id, lr.locationId, lr.partnerId, lr.channel,
            p.name AS partnerName, p.phone AS partnerPhone, p.email AS partnerEmail, p.type AS partnerType
     FROM location_recipients lr
     LEFT JOIN partners p ON p.id = lr.partnerId
     WHERE lr.locationId=?
     ORDER BY lr.id DESC`
  ).all(locationId);
}
export function addLocationRecipient(locationId, partnerId, channel = 'sms') {
  db.prepare('INSERT INTO location_recipients (locationId,partnerId,channel,createdAt) VALUES (?,?,?,?)')
    .run(locationId, partnerId, channel, nowISO());
  return listLocationRecipients(locationId);
}
export function removeLocationRecipient(id) {
  return db.prepare('DELETE FROM location_recipients WHERE id=?').run(id);
}

/* ========= Directories ========= */
export function listMerchants() {
  return db.prepare('SELECT * FROM merchants ORDER BY name').all();
}
export function createMerchant(m) {
  const t = nowISO();
  const res = db.prepare(`INSERT INTO merchants (name,phone,email,notes,createdAt,updatedAt)
                          VALUES (@name,@phone,@email,@notes,@createdAt,@updatedAt)`)
    .run({
      name: m.name || '',
      phone: normPhone(m.phone),
      email: m.email || '',
      notes: m.notes || '',
      createdAt: t,
      updatedAt: t
    });
  return db.prepare('SELECT * FROM merchants WHERE id=?').get(res.lastInsertRowid);
}
export function updateMerchant(id, m) {
  const cur = db.prepare('SELECT * FROM merchants WHERE id=?').get(id);
  if (!cur) return null;
  const row = { ...cur, ...m, phone: normPhone(m.phone ?? cur.phone), updatedAt: nowISO() };
  db.prepare('UPDATE merchants SET name=@name,phone=@phone,email=@email,notes=@notes,updatedAt=@updatedAt WHERE id=@id')
    .run({ ...row, id });
  return db.prepare('SELECT * FROM merchants WHERE id=?').get(id);
}
export function deleteMerchant(id) {
  return db.prepare('DELETE FROM merchants WHERE id=?').run(id);
}

export function listDispatchers() {
  return db.prepare('SELECT * FROM dispatchers ORDER BY name').all();
}
export function createDispatcher(d) {
  const t = nowISO();
  const res = db.prepare(`INSERT INTO dispatchers (name,phone,email,notes,createdAt,updatedAt)
                          VALUES (@name,@phone,@email,@notes,@createdAt,@updatedAt)`)
    .run({
      name: d.name || '',
      phone: normPhone(d.phone),
      email: d.email || '',
      notes: d.notes || '',
      createdAt: t,
      updatedAt: t
    });
  return db.prepare('SELECT * FROM dispatchers WHERE id=?').get(res.lastInsertRowid);
}
export function updateDispatcher(id, d) {
  const cur = db.prepare('SELECT * FROM dispatchers WHERE id=?').get(id);
  if (!cur) return null;
  const row = { ...cur, ...d, phone: normPhone(d.phone ?? cur.phone), updatedAt: nowISO() };
  db.prepare('UPDATE dispatchers SET name=@name,phone=@phone,email=@email,notes=@notes,updatedAt=@updatedAt WHERE id=@id')
    .run({ ...row, id });
  return db.prepare('SELECT * FROM dispatchers WHERE id=?').get(id);
}
export function deleteDispatcher(id) {
  return db.prepare('DELETE FROM dispatchers WHERE id=?').run(id);
}

/* ========= Aliases to match server/index.js imports ========= */
export const listParties = listPartners;
export const createParty = createPartner;
export const updateParty = updatePartner;
export const deleteParty = deletePartner;

export default db;
