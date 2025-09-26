const $ = s=>document.querySelector(s);
const $$ = s=>Array.from(document.querySelectorAll(s));

const clockEl = $('#clock');
function tick(){ clockEl.textContent = new Date().toLocaleString(); }
setInterval(tick, 1000); tick();

const rowsEl = $('#rows');
const qEl = $('#q');
const form = $('#add-form');

const STATUS_OPTIONS = ['Planned','En-route','Arrived','Loaded','En-route to unload','Delivered'];
function fmtPhone(p){ if(!p) return ''; return p.replace(/\+1(\d{3})(\d{3})(\d{4})/, '($1) $2-$3'); }

async function fetchLoads(){
  const r = await fetch('/api/loads');
  const j = await r.json();
  return j.items || [];
}

function badgeClass(status){
  const s = status.toLowerCase();
  if (s.includes('en-route to unload')) return 'badge loaded';
  if (s.includes('en-route')) return 'badge enroute';
  if (s.includes('arrived')) return 'badge arrived';
  if (s.includes('loaded')) return 'badge loaded';
  if (s.includes('deliver')) return 'badge delivered';
  return 'badge light';
}

function rowHTML(l){
  return `
    <tr data-id="${l.id}" style="border-bottom:1px solid var(--border)">
      <td style="padding:10px"><strong>${l.id}</strong></td>
      <td style="padding:10px"><div class="muted">${l.lane||''}</div><div class="muted" style="font-size:12px">Driver: ${fmtPhone(l.driverPhone||'')}</div></td>
      <td style="padding:10px">${l.driver||''}</td>
      <td style="padding:10px">
        <span class="${badgeClass(l.status)}">${l.status||'Planned'}</span>
      </td>
      <td style="padding:10px">${l.eta||''}</td>
      <td style="padding:10px">
        <select class="input status" style="width:170px; margin-right:6px">
          ${STATUS_OPTIONS.map(s=>`<option ${s===l.status?'selected':''}>${s}</option>`).join('')}
        </select>
        <input class="input eta" placeholder="ETA" value="${l.eta||''}" style="width:110px; margin-right:6px">
        <button class="table-btn save">Save</button>
        <button class="table-btn" data-action="thread">Thread</button>
        <button class="table-btn textDriver">Text Driver</button>
        <button class="table-btn danger del">Delete</button>
      </td>
    </tr>
  `;
}

function applyFilter(items, q){
  if (!q) return items;
  const s = q.toLowerCase();
  return items.filter(l=>
    (l.id||'').toLowerCase().includes(s) ||
    (l.lane||'').toLowerCase().includes(s) ||
    (l.driver||'').toLowerCase().includes(s) ||
    (l.status||'').toLowerCase().includes(s)
  );
}

async function render(){
  const items = applyFilter(await fetchLoads(), qEl.value.trim());
  rowsEl.innerHTML = items.map(rowHTML).join('');
}

qEl.addEventListener('input', ()=>render());

rowsEl.addEventListener('click', async (e)=>{
  const tr = e.target.closest('tr'); if (!tr) return;
  const id = tr.dataset.id;
  if (e.target.classList.contains('save')){
    const status = tr.querySelector('.status').value;
    const eta = tr.querySelector('.eta').value;
    await fetch(`/api/loads/${encodeURIComponent(id)}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ status, eta })
    });
    render();
  }
  if (e.target.classList.contains('del')){
    await fetch(`/api/loads/${encodeURIComponent(id)}`, { method:'DELETE' });
    render();
  }
});

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(form);
  const payload = Object.fromEntries(fd.entries());
  // Normalize
  payload.origin = (payload.origin||'').trim();
  payload.destination = (payload.destination||'').trim();
  payload.driver = (payload.driver||'').trim();
  payload.status = payload.status || 'Planned';
  payload.eta = (payload.eta||'').trim();
  const r = await fetch('/api/loads', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (r.ok){
    form.reset();
    render();
  }
});

render();


rowsEl.addEventListener('click', async (e)=>{
  if (!e.target.classList.contains('textDriver')) return;
  const tr = e.target.closest('tr'); if (!tr) return;
  const id = tr.dataset.id;
  const msg = prompt('Message to driver:');
  if (!msg) return;
  await fetch('/api/message', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ loadId:id, to:'driver', body: msg })
  });
  alert('Sent');
});


rowsEl.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-action="thread"]'); if (!btn) return;
  const tr = e.target.closest('tr'); if (!tr) return;
  openThread(tr.dataset.id);
});
