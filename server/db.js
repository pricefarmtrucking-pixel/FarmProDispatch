import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/driver-comm.db');

// Ensure data dir exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

// Migration: add commodity column if missing
const cols = db.prepare("PRAGMA table_info(loads)").all().map(r=>r.name);
if (!cols.includes('commodity')){
  db.exec("ALTER TABLE loads ADD COLUMN commodity TEXT");
}
if (!cols.includes('dispatcherPhone')){
  db.exec("ALTER TABLE loads ADD COLUMN dispatcherPhone TEXT");
}
if (!cols.includes('originLocationId')){
  db.exec("ALTER TABLE loads ADD COLUMN originLocationId INTEGER");
}
if (!cols.includes('destinationLocationId')){
  db.exec("ALTER TABLE loads ADD COLUMN destinationLocationId INTEGER");
}


// Schema
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
);
`);

// Helpers
export function listLoads(){
  const stmt = db.prepare('SELECT * FROM loads ORDER BY datetime(createdAt) DESC');
  return stmt.all();
}

export function getLoad(id){
  const stmt = db.prepare('SELECT * FROM loads WHERE id=?');
  return stmt.get(id);
}

export function upsertLoad(load){
  const now = new Date().toISOString();
  const lane = `${load.origin||''} → ${load.destination||''}`;
  const id = (load.id && load.id.trim()) || makeId('LD');
  const existing = getLoad(id);
  if (existing){
    const merged = { ...existing, ...load, lane, updatedAt: now };
    const stmt = db.prepare(`UPDATE loads SET
      origin=@origin, destination=@destination, lane=@lane, driver=@driver, driverPhone=@driverPhone,
      status=@status, eta=@eta, agentPhone=@agentPhone, merchantPhone=@merchantPhone, shipperPhone=@shipperPhone,
      receiverPhone=@receiverPhone, dispatcherPhone=@dispatcherPhone, originLocationId=@originLocationId, destinationLocationId=@destinationLocationId, commodity=@commodity, updatedAt=@updatedAt
      WHERE id=@id`);
    stmt.run({ ...merged, id });
    return getLoad(id);
  } else {
    const stmt = db.prepare(`INSERT INTO loads
      (id, origin, destination, lane, driver, driverPhone, status, eta, agentPhone, merchantPhone, shipperPhone, receiverPhone, dispatcherPhone, originLocationId, destinationLocationId, commodity, createdAt, updatedAt)
      VALUES (@id, @origin, @destination, @lane, @driver, @driverPhone, @status, @eta, @agentPhone, @merchantPhone, @shipperPhone, @receiverPhone, @dispatcherPhone, @originLocationId, @destinationLocationId, @commodity, @createdAt, @updatedAt)`);
    const row = {
      id, origin: load.origin||'', destination: load.destination||'', lane,
      driver: load.driver||'', driverPhone: normPhone(load.driverPhone),
      status: load.status||'Planned', eta: load.eta||'', originLocationId: load.originLocationId||null, destinationLocationId: load.destinationLocationId||null, commodity: load.commodity||'',
      agentPhone: normPhone(load.agentPhone), merchantPhone: normPhone(load.merchantPhone),
      shipperPhone: normPhone(load.shipperPhone), receiverPhone: normPhone(load.receiverPhone), dispatcherPhone: normPhone(load.dispatcherPhone||load.agentPhone),
      createdAt: now, updatedAt: now
    };
    stmt.run(row);
    return getLoad(id);
  }
}

export function updateLoadPartial(id, patch){
  const existing = getLoad(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const merged = { ...existing, ...patch, updatedAt: now };
  // recompute lane if origin/destination changed
  if (patch.origin !== undefined || patch.destination !== undefined){
    merged.lane = `${merged.origin||''} → ${merged.destination||''}`;
  }
  const stmt = db.prepare(`UPDATE loads SET
    origin=@origin, destination=@destination, lane=@lane, driver=@driver, driverPhone=@driverPhone,
    status=@status, eta=@eta, agentPhone=@agentPhone, merchantPhone=@merchantPhone, shipperPhone=@shipperPhone,
    receiverPhone=@receiverPhone, dispatcherPhone=@dispatcherPhone, originLocationId=@originLocationId, destinationLocationId=@destinationLocationId, commodity=@commodity, updatedAt=@updatedAt
    WHERE id=@id`);
  stmt.run(merged);
  return getLoad(id);
}

export function deleteLoad(id){
  const stmt = db.prepare('DELETE FROM loads WHERE id=?');
  return stmt.run(id);
}

export function makeId(prefix='LD'){
  const n = Math.floor(Math.random()*90000)+10000;
  return `${prefix}-${n}`;
}

export function normPhone(p){
  if (!p) return '';
  const digits = (''+p).replace(/\D/g,'');
  if (digits.length===10) return `+1${digits}`;
  if (digits.startswith?.('+')) return digits;
  if (digits.length>0) return `+${digits}`;
  return '';
}

export default db;


// Messages table
db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loadId TEXT,
  toRole TEXT,        -- 'driver' or 'dispatcher'
  toPhone TEXT,
  body TEXT,
  createdAt TEXT
);
`);

export function logMessage(m){
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO messages (loadId, toRole, toPhone, body, createdAt)
    VALUES (@loadId, @toRole, @toPhone, @body, @createdAt)`);
  stmt.run({ ...m, createdAt: now });
}


// === Directory & Routing Schema ===
db.exec(`
CREATE TABLE IF NOT EXISTS parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT,            -- 'shipper' | 'receiver'
  name TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  createdAt TEXT,
  updatedAt TEXT
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partyId INTEGER,
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  createdAt TEXT,
  updatedAt TEXT,
  FOREIGN KEY(partyId) REFERENCES parties(id) ON DELETE CASCADE
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locationId INTEGER,
  role TEXT,         -- 'agent' | 'merchant' | 'dispatcher' | 'driver' | 'ops' | 'other'
  name TEXT,
  phone TEXT,
  email TEXT,
  notifySMS INTEGER DEFAULT 1,
  notifyEmail INTEGER DEFAULT 0,
  createdAt TEXT,
  updatedAt TEXT,
  FOREIGN KEY(locationId) REFERENCES locations(id) ON DELETE CASCADE
);
`);

db.exec(\`
CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  phone TEXT,
  email TEXT,
  notes TEXT,
  createdAt TEXT,
  updatedAt TEXT
);
\`);

db.exec(\`
CREATE TABLE IF NOT EXISTS dispatchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  phone TEXT,
  email TEXT,
  notes TEXT,
  createdAt TEXT,
  updatedAt TEXT
);
\`);


export function nowISO(){ return new Date().toISOString(); }

// Messages retrieval
export function listMessagesByLoad(loadId){
  const stmt = db.prepare('SELECT * FROM messages WHERE loadId=? ORDER BY datetime(createdAt) ASC');
  return stmt.all(loadId);
}

// Generic helpers
function _insert(table, row){
  const keys = Object.keys(row);
  const cols = keys.join(',');
  const placeholders = keys.map(k=>`@${k}`).join(',');
  const stmt = db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`);
  stmt.run(row);
  return db.prepare('SELECT * FROM '+table+' ORDER BY rowid DESC LIMIT 1').get();
}
function _update(table, id, row){
  const sets = Object.keys(row).map(k=>`${k}=@${k}`).join(', ');
  const stmt = db.prepare(`UPDATE ${table} SET ${sets} WHERE id=@id`);
  stmt.run({ ...row, id });
  return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
}
function _delete(table, id){
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id=?`);
  return stmt.run(id);
}

// Parties
export function listParties(kind){
  const stmt = kind ? db.prepare('SELECT * FROM parties WHERE kind=? ORDER BY name') : db.prepare('SELECT * FROM parties ORDER BY name');
  return kind ? stmt.all(kind) : stmt.all();
}
export function createParty(p){
  const t = nowISO();
  return _insert('parties', { kind:p.kind||'', name:p.name||'', email:p.email||'', phone:normPhone(p.phone||''), createdAt:t, updatedAt:t });
}
export function updateParty(id, p){
  const t = nowISO();
  return _update('parties', id, { kind:p.kind||'', name:p.name||'', email:p.email||'', phone:normPhone(p.phone||''), updatedAt:t });
}
export function deleteParty(id){ return _delete('parties', id); }

// Locations
export function listLocations(partyId){
  const stmt = db.prepare('SELECT * FROM locations WHERE partyId=? ORDER BY name');
  return stmt.all(partyId);
}
export function createLocation(loc){
  const t = nowISO();
  return _insert('locations', { partyId:loc.partyId, name:loc.name||'', address:loc.address||'', city:loc.city||'', state:loc.state||'', zip:loc.zip||'', createdAt:t, updatedAt:t });
}
export function updateLocation(id, loc){
  const t = nowISO();
  return _update('locations', id, { partyId:loc.partyId, name:loc.name||'', address:loc.address||'', city:loc.city||'', state:loc.state||'', zip:loc.zip||'', updatedAt:t });
}
export function deleteLocation(id){ return _delete('locations', id); }

// Recipients
export function listRecipients(locationId){
  const stmt = db.prepare('SELECT * FROM recipients WHERE locationId=? ORDER BY name');
  return stmt.all(locationId);
}
export function createRecipient(r){
  const t = nowISO();
  return _insert('recipients', { locationId:r.locationId, role:r.role||'other', name:r.name||'', phone:normPhone(r.phone||''), email:r.email||'', notifySMS:r.notifySMS?1:0, notifyEmail:r.notifyEmail?1:0, createdAt:t, updatedAt:t });
}
export function updateRecipient(id, r){
  const t = nowISO();
  return _update('recipients', id, { locationId:r.locationId, role:r.role||'other', name:r.name||'', phone:normPhone(r.phone||''), email:r.email||'', notifySMS:r.notifySMS?1:0, notifyEmail:r.notifyEmail?1:0, updatedAt:t });
}
export function deleteRecipient(id){ return _delete('recipients', id); }

// Merchants
export function listMerchants(){ return db.prepare('SELECT * FROM merchants ORDER BY name').all(); }
export function createMerchant(m){ const t=nowISO(); return _insert('merchants',{ name:m.name||'', phone:normPhone(m.phone||''), email:m.email||'', notes:m.notes||'', createdAt:t, updatedAt:t }); }
export function updateMerchant(id,m){ const t=nowISO(); return _update('merchants', id, { name:m.name||'', phone:normPhone(m.phone||''), email:m.email||'', notes:m.notes||'', updatedAt:t }); }
export function deleteMerchant(id){ return _delete('merchants', id); }

// Dispatchers
export function listDispatchers(){ return db.prepare('SELECT * FROM dispatchers ORDER BY name').all(); }
export function createDispatcher(d){ const t=nowISO(); return _insert('dispatchers',{ name:d.name||'', phone:normPhone(d.phone||''), email:d.email||'', notes:d.notes||'', createdAt:t, updatedAt:t }); }
export function updateDispatcher(id,d){ const t=nowISO(); return _update('dispatchers', id, { name:d.name||'', phone:normPhone(d.phone||''), email:d.email||'', notes:d.notes||'', updatedAt:t }); }
export function deleteDispatcher(id){ return _delete('dispatchers', id); }


// Partners (people/orgs): shipper, receiver, merchant, dispatcher
db.exec(`
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,           -- 'shipper' | 'receiver' | 'merchant' | 'dispatcher'
  name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  createdAt TEXT,
  updatedAt TEXT
);
`);

// Locations owned by a shipper/receiver
db.exec(`
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partnerId INTEGER,   -- FK to partners(id)
  name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  lat REAL,
  lng REAL,
  createdAt TEXT,
  updatedAt TEXT
);
`);

// Recipient mapping per location -> partner
db.exec(`
CREATE TABLE IF NOT EXISTS location_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locationId INTEGER,
  partnerId INTEGER,
  channel TEXT,        -- 'sms' | 'email'
  createdAt TEXT
);
`);

// Migration: add fromRole/fromName to messages if missing
try {
  const mcols = db.prepare("PRAGMA table_info(messages)").all().map(r=>r.name);
  if (!mcols.includes('fromRole')) db.exec("ALTER TABLE messages ADD COLUMN fromRole TEXT");
  if (!mcols.includes('fromName')) db.exec("ALTER TABLE messages ADD COLUMN fromName TEXT");
} catch(e){}

export function nowISO(){ return new Date().toISOString(); }

export function listPartners(type){
  const stmt = type ? db.prepare('SELECT * FROM partners WHERE type=? ORDER BY name') 
                    : db.prepare('SELECT * FROM partners ORDER BY type,name');
  return type ? stmt.all(type) : stmt.all();
}
export function createPartner(p){
  const t = nowISO();
  const stmt = db.prepare(`INSERT INTO partners (type,name,phone,email,notes,createdAt,updatedAt)
    VALUES (@type,@name,@phone,@email,@notes,@createdAt,@updatedAt)`);
  const row = { type:p.type, name:p.name||'', phone: normPhone(p.phone), email: p.email||'', notes:p.notes||'', createdAt:t, updatedAt:t };
  const r = stmt.run(row);
  return getPartner(r.lastInsertRowid);
}
export function getPartner(id){
  return db.prepare('SELECT * FROM partners WHERE id=?').get(id);
}
export function updatePartner(id, patch){
  const cur = getPartner(id); if (!cur) return null;
  const row = { ...cur, ...patch, phone: normPhone(patch.phone||cur.phone), updatedAt: nowISO() };
  db.prepare(`UPDATE partners SET type=@type, name=@name, phone=@phone, email=@email, notes=@notes, updatedAt=@updatedAt WHERE id=@id`).run({ ...row, id });
  return getPartner(id);
}
export function deletePartner(id){
  return db.prepare('DELETE FROM partners WHERE id=?').run(id);
}

export function listLocations(partnerId){
  return db.prepare('SELECT * FROM locations WHERE partnerId=? ORDER BY name').all(partnerId);
}
export function createLocation(loc){
  const t = nowISO();
  const stmt = db.prepare(`INSERT INTO locations (partnerId,name,address,city,state,zip,lat,lng,createdAt,updatedAt)
    VALUES (@partnerId,@name,@address,@city,@state,@zip,@lat,@lng,@createdAt,@updatedAt)`);
  const row = { partnerId: loc.partnerId, name:loc.name||'', address:loc.address||'', city:loc.city||'', state:loc.state||'', zip:loc.zip||'', lat:loc.lat||null, lng:loc.lng||null, createdAt:t, updatedAt:t };
  const r = stmt.run(row);
  return getLocation(r.lastInsertRowid);
}
export function getLocation(id){
  return db.prepare('SELECT * FROM locations WHERE id=?').get(id);
}
export function updateLocation(id, patch){
  const cur = getLocation(id); if (!cur) return null;
  const row = { ...cur, ...patch, updatedAt: nowISO() };
  db.prepare(`UPDATE locations SET name=@name, address=@address, city=@city, state=@state, zip=@zip, lat=@lat, lng=@lng, updatedAt=@updatedAt WHERE id=@id`).run({ ...row, id });
  return getLocation(id);
}
export function deleteLocation(id){
  db.prepare('DELETE FROM location_recipients WHERE locationId=?').run(id);
  return db.prepare('DELETE FROM locations WHERE id=?').run(id);
}

export function listLocationRecipients(locationId){
  return db.prepare('SELECT lr.id, lr.locationId, lr.partnerId, lr.channel, p.name as partnerName, p.phone as partnerPhone, p.email as partnerEmail, p.type as partnerType
FROM location_recipients lr LEFT JOIN partners p ON p.id = lr.partnerId WHERE lr.locationId=? ORDER BY lr.id DESC').all(locationId);
}
export function addLocationRecipient(locationId, partnerId, channel){
  const t = nowISO();
  const stmt = db.prepare('INSERT INTO location_recipients (locationId, partnerId, channel, createdAt) VALUES (?,?,?,?)');
  const r = stmt.run(locationId, partnerId, channel, t);
  return listLocationRecipients(locationId);
}
export function removeLocationRecipient(id){
  return db.prepare('DELETE FROM location_recipients WHERE id=?').run(id);
}
