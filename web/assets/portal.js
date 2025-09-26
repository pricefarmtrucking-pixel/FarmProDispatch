const pid = location.pathname.split('/').pop();
const $ = s=>document.querySelector(s);
const $$ = s=>Array.from(document.querySelectorAll(s));

async function getPartner(){
  const r = await fetch('/api/partners?'); // we'll filter client-side
  const j = await r.json();
  return (j.items||[]).find(p=>String(p.id)===String(pid));
}
async function listLocations(){
  const r = await fetch(`/api/partners/${pid}/locations`);
  return (await r.json()).items||[];
}
async function listRecipients(locId){
  const r = await fetch(`/api/locations/${locId}/recipients`);
  return (await r.json()).items||[];
}
async function addRecipient(locId, partnerId, channel='sms'){
  await fetch(`/api/locations/${locId}/recipients`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ partnerId, channel })
  });
}
async function delRecipient(id){
  await fetch(`/api/locationRecipients/${id}`, { method:'DELETE' });
}

function locCard(loc){
  return `<div class="card" data-loc="${loc.id}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div><strong>${loc.name}</strong><div class="muted">${loc.city||''} ${loc.state||''}</div></div>
      <div>
        <button class="table-btn" data-act="add-recipient">Add Recipient</button>
        <button class="table-btn danger" data-act="del-loc">Delete</button>
      </div>
    </div>
    <div class="muted" style="margin-top:8px">Recipients (get messages/emails when loads change for this location):</div>
    <div class="cards recips" style="margin-top:8px"></div>
  </div>`;
}

function recipPill(r){
  const label = `${r.partnerName} • ${r.partnerType} • ${r.channel}`;
  return `<span class="badge light" data-recip="${r.id}" title="${r.partnerEmail||''} ${r.partnerPhone||''}">${label} ✕</span>`;
}

async function render(){
  const p = await getPartner();
  if (p){ $('#pname').textContent = p.name; $('#ptype').textContent = p.type; }
  const locs = await listLocations();
  const box = $('#locations');
  box.innerHTML = locs.map(locCard).join('');
  for (const card of $$('.card[data-loc]')){
    const locId = card.getAttribute('data-loc');
    const recips = await listRecipients(locId);
    const rb = card.querySelector('.recips');
    rb.innerHTML = recips.map(recipPill).join('');
  }
}

document.addEventListener('click', async (e)=>{
  const t = e.target;
  // Add location
  if (t.id==='addLoc'){
    const name = $('#locName').value.trim(); if (!name) return;
    await fetch(`/api/partners/${pid}/locations`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    $('#locName').value='';
    render();
  }
  // Delete location
  if (t.dataset.act === 'del-loc'){
    const card = t.closest('.card'); const id = card.getAttribute('data-loc');
    if (!confirm('Delete this location?')) return;
    await fetch(`/api/locations/${id}`, { method:'DELETE' });
    render();
  }
  // Add recipient
  if (t.dataset.act === 'add-recipient'){
    const card = t.closest('.card'); const id = card.getAttribute('data-loc');
    const partnerId = prompt('Enter partner ID to add as recipient (use Merchants/Dispatchers pages to look up IDs):');
    if (!partnerId) return;
    const channel = prompt("Channel: 'sms' or 'email'?", 'sms') || 'sms';
    await addRecipient(id, Number(partnerId), channel);
    render();
  }
  // Remove recipient (click pill)
  if (t.matches('.badge[data-recip]')){
    const rid = t.getAttribute('data-recip');
    await delRecipient(rid);
    render();
  }
});

render();
