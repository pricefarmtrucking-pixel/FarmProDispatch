const $ = s=>document.querySelector(s);
const rowsEl = $('#rows');
const qEl = $('#q');

function badgeClass(status){
  const s = (status||'').toLowerCase();
  if (s.includes('en-route to unload')) return 'badge loaded';
  if (s.includes('en-route')) return 'badge enroute';
  if (s.includes('arrived')) return 'badge arrived';
  if (s.includes('loaded')) return 'badge loaded';
  if (s.includes('deliver')) return 'badge delivered';
  return 'badge light';
}

function rowHTML(l){
  return `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px"><strong>${l.id}</strong></td>
      <td style="padding:10px">${l.origin||''}</td>
      <td style="padding:10px">${l.destination||''}</td>
      <td style="padding:10px">${l.commodity||''}</td>
      <td style="padding:10px"><span class="${badgeClass(l.status)}">${l.status||''}</span></td>
      <td style="padding:10px">${l.eta||''}</td>
      <td style="padding:10px"><button class="table-btn msg" data-id="${l.id}">Message</button> <button class="table-btn thread" data-id="${l.id}">Thread</button></td>
    </tr>
  `;
}

function applyFilter(items, q){
  if (!q) return items;
  const s = q.toLowerCase();
  return items.filter(l=>
    (l.id||'').toLowerCase().includes(s) ||
    (l.origin||'').toLowerCase().includes(s) ||
    (l.destination||'').toLowerCase().includes(s) ||
    (l.commodity||'').toLowerCase().includes(s) ||
    (l.status||'').toLowerCase().includes(s)
  );
}

async function render(){
  const r = await fetch('/api/loads');
  const j = await r.json();
  const items = applyFilter(j.items||[], qEl.value.trim());
  rowsEl.innerHTML = items.map(rowHTML).join('');
}

qEl.addEventListener('input', render);
render();


document.addEventListener('click', async (e)=>{
  const b = e.target.closest('.msg'); if (!b) return;
  const loadId = b.getAttribute('data-id');
  const to = prompt("Send to 'driver' or 'dispatcher'?", 'dispatcher');
  if (!to || !['driver','dispatcher'].includes(to.trim().toLowerCase())) return;
  const body = prompt('Message text:');
  if (!body) return;
  const r = await fetch('/api/message', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ loadId, to: to.trim().toLowerCase(), body })
  });
  if (r.ok) alert('Sent'); else alert('Failed to send');
});


document.addEventListener('click', (e)=>{
  const b = e.target.closest('.thread'); if (!b) return;
  openThread(b.getAttribute('data-id'));
});
