const id = location.pathname.split('/').pop();
const metaEl = document.getElementById('loadMeta');
const rowEl = document.getElementById('statusRow');
const clockEl = document.getElementById('clock');
function tick(){ clockEl.textContent = new Date().toLocaleString(); } setInterval(tick, 1000); tick();

const BUTTONS = [
  'En-route',
  'Arrived',
  'Loaded',
  'En-route to unload',
  'Arrived (receiver)',
  'Delivered'
];

function btn(label){
  const b = document.createElement('button');
  b.className='btn btn-accent';
  b.textContent = label;
  b.style.flex='1 1 200px';
  return b;
}

async function getLoad(){
  const r = await fetch(`/api/loads/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error('Not found');
  const j = await r.json();
  return j.item;
}

async function render(){
  const l = await getLoad();
  metaEl.innerHTML = `<div><strong>${l.id}</strong> • ${l.origin} → ${l.destination}</div>
  <div class="muted">Commodity: ${l.commodity||'-'} &nbsp; | &nbsp; Status: <strong>${l.status||'-'}</strong> &nbsp; | &nbsp; ETA: ${l.eta||'-'}</div>`;
  rowEl.innerHTML='';
  BUTTONS.forEach(lbl=>{
    const b = btn(lbl);
    b.addEventListener('click', async ()=>{
      let patch = { status: lbl };
      if (lbl.toLowerCase().startsWith('en-route')){
        const eta = prompt('Enter ETA (e.g., 17:30 or 2025-09-25 17:30):', l.eta||'');
        if (eta !== null) patch.eta = eta.trim();
      }
      const r = await fetch(`/api/loads/${encodeURIComponent(id)}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(patch)
      });
      if (r.ok) render();
    });
    rowEl.appendChild(b);
  });
}

render();
