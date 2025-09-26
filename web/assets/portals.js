
// Simple debounce (shared)
function debounce(fn, wait=350){
  let t; 
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}

const $=s=>document.querySelector(s);
const partyList=$('#partyList'), locList=$('#locList'), recList=$('#recList');

let partiesCache=[], locsCache=[], recsCache=[];

function partyRow(p){
  return `<div class="card">
    <div style="display:grid;grid-template-columns:80px 1fr 1fr 1fr 120px;gap:8px;align-items:center">
      <span>#${p.id}</span>
      <select class="input" data-type="party" data-id="${p.id}" data-k="kind">
        <option value="shipper" ${p.kind==='shipper'?'selected':''}>shipper</option>
        <option value="receiver" ${p.kind==='receiver'?'selected':''}>receiver</option>
      </select>
      <input class="input" value="${p.name||''}" data-type="party" data-id="${p.id}" data-k="name" />
      <input class="input" value="${p.phone||''}" data-type="party" data-id="${p.id}" data-k="phone" />
      <input class="input" value="${p.email||''}" data-type="party" data-id="${p.id}" data-k="email" />
    </div>
  </div>`;
}

function locRow(l){
  return `<div class="card">
    <div style="display:grid;grid-template-columns:60px 1fr 1fr 100px 80px 100px;gap:8px">
      <span>#${l.id}</span>
      <input class="input" value="${l.name||''}" data-type="loc" data-id="${l.id}" data-k="name" />
      <input class="input" value="${l.address||''}" data-type="loc" data-id="${l.id}" data-k="address" />
      <input class="input" value="${l.city||''}" data-type="loc" data-id="${l.id}" data-k="city" />
      <input class="input" value="${l.state||''}" data-type="loc" data-id="${l.id}" data-k="state" />
      <input class="input" value="${l.zip||''}" data-type="loc" data-id="${l.id}" data-k="zip" />
    </div>
  </div>`;
}

function recRow(r){
  return `<div class="card">
    <div style="display:grid;grid-template-columns:60px 140px 1fr 1fr 1fr 90px 90px;gap:8px;align-items:center">
      <span>#${r.id}</span>
      <input class="input" value="${r.role||''}" data-type="rec" data-id="${r.id}" data-k="role" />
      <input class="input" value="${r.name||''}" data-type="rec" data-id="${r.id}" data-k="name" />
      <input class="input" value="${r.phone||''}" data-type="rec" data-id="${r.id}" data-k="phone" />
      <input class="input" value="${r.email||''}" data-type="rec" data-id="${r.id}" data-k="email" />
      <label class="muted"><input type="checkbox" ${r.notifySMS?'checked':''} data-type="rec" data-id="${r.id}" data-k="notifySMS"> SMS</label>
      <label class="muted"><input type="checkbox" ${r.notifyEmail?'checked':''} data-type="rec" data-id="${r.id}" data-k="notifyEmail"> Email</label>
    </div>
  </div>`;
}

function matches(v,q){ return (v||'').toLowerCase().includes(q); }

async function loadParties(){
  const kind = $('#kind').value || '';
  const r = await fetch('/api/parties'+(kind?`?kind=${encodeURIComponent(kind)}`:''));
  const j = await r.json();
  partiesCache = j.items||[];
  renderParties();
}
function renderParties(){
  const q = ($('#partyFilter')?.value||'').toLowerCase();
  const items = partiesCache.filter(p => !q || matches(p.name,q)||matches(p.phone,q)||matches(p.email,q));
  partyList.innerHTML = items.map(partyRow).join('');
}

async function loadLocs(){
  const partyId = $('#locPartyId').value.trim();
  if(!partyId){ locList.innerHTML=''; return; }
  const r = await fetch('/api/locations?partyId='+encodeURIComponent(partyId));
  const j = await r.json();
  locsCache = j.items||[];
  locList.innerHTML = locsCache.map(locRow).join('');
}

async function loadRecs(){
  const locId = $('#recLocId').value.trim();
  if(!locId){ recList.innerHTML=''; return; }
  const r = await fetch('/api/recipients?locationId='+encodeURIComponent(locId));
  const j = await r.json();
  recsCache = j.items||[];
  recList.innerHTML = recsCache.map(recRow).join('');
}

// Inline edit handlers
const debouncedPartyPatch = debounce(async (id, k, v)=>{
  debouncedPartyPatch(id, k, v);
}, 400);
const debouncedLocPatch = debounce(async (id, k, v)=>{
  debouncedLocPatch(id, k, v);
}, 400);
const debouncedRecPatch = debounce(async (id, k, v)=>{
  debouncedRecPatch(id, k, v);
}, 400);

document.addEventListener('input', async (e)=>{
  const el = e.target;
  const type = el.getAttribute('data-type'); if(!type) return;
  const id = Number(el.getAttribute('data-id'));
  const k = el.getAttribute('data-k');
  let v = el.type==='checkbox' ? el.checked : el.value;
  if (type==='party'){
    debouncedPartyPatch(id, k, v);
  } else if (type==='loc'){
    debouncedLocPatch(id, k, v);
  } else if (type==='rec'){
    debouncedRecPatch(id, k, v);
  }
});

// Add actions
$('#addParty').addEventListener('click', async ()=>{
  const name=$('#partyName').value.trim();
  const phone=$('#partyPhone').value.trim();
  const email=$('#partyEmail').value.trim();
  const kind=$('#kind').value.trim()||'shipper';
  if(!name) return;
  await fetch('/api/parties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,email,kind})});
  $('#partyName').value=$('#partyPhone').value=$('#partyEmail').value='';
  loadParties();
});

$('#addLoc').addEventListener('click', async ()=>{
  const payload={
    partyId:+$('#locPartyId').value.trim(),
    name:$('#locName').value.trim(),
    address:$('#locAddr').value.trim(),
    city:$('#locCity').value.trim(),
    state:$('#locState').value.trim(),
    zip:$('#locZip').value.trim()
  };
  if(!payload.partyId || !payload.name) return;
  await fetch('/api/locations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  $('#locName').value=$('#locAddr').value=$('#locCity').value=$('#locState').value=$('#locZip').value='';
  loadLocs();
});

$('#addRec').addEventListener('click', async ()=>{
  const payload={
    locationId:+$('#recLocId').value.trim(),
    name:$('#recName').value.trim(),
    role:$('#recRole').value.trim()||'other',
    phone:$('#recPhone').value.trim(),
    email:$('#recEmail').value.trim(),
    notifySMS:$('#recSMS').checked,
    notifyEmail:$('#recEmailChk').checked
  };
  if(!payload.locationId || !payload.name) return;
  await fetch('/api/recipients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  $('#recName').value=$('#recRole').value=$('#recPhone').value=$('#recEmail').value='';
  $('#recSMS').checked=true; $('#recEmailChk').checked=false;
  loadRecs();
});

// Filters
$('#kind').addEventListener('change', loadParties);
$('#partyFilter')?.addEventListener('input', renderParties);
$('#locPartyId').addEventListener('change', loadLocs);
$('#recLocId').addEventListener('change', loadRecs);

loadParties();
