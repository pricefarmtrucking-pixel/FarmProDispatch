
// Simple debounce (shared)
function debounce(fn, wait=350){
  let t; 
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}

const $=s=>document.querySelector(s);
const listEl = $('#mList');
const filterEl = $('#mFilter');

function row(m){
  return `<div class="card">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div>#${m.id}</div>
      <input class="input" value="${m.name||''}" data-k="name" data-id="${m.id}" />
      <div>
        <button class="table-btn danger del" data-id="${m.id}">Delete</button>
      </div>
      <input class="input" value="${m.phone||''}" data-k="phone" data-id="${m.id}" />
      <input class="input" value="${m.email||''}" data-k="email" data-id="${m.id}" />
      <input class="input" value="${m.notes||''}" data-k="notes" data-id="${m.id}" />
    </div>
  </div>`;
}

let cache = [];
let mSortAsc = true;
function applyFilter(items){
  const q = (filterEl.value||'').toLowerCase();
  if(!q) return items;
  return items.filter(m =>
    (m.name||'').toLowerCase().includes(q) ||
    (m.phone||'').toLowerCase().includes(q) ||
    (m.email||'').toLowerCase().includes(q) ||
    (m.notes||'').toLowerCase().includes(q)
  );
}

async function render(){
  const r = await fetch('/api/merchants'); const j = await r.json();
  cache = j.items||[];
  let items = applyFilter(cache);
  items = items.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
  if (!mSortAsc) items.reverse();
  listEl.innerHTML = items.map(row).join('');
}

filterEl?.addEventListener('input', ()=>{
  let items = applyFilter(cache);
  items = items.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
  if (!mSortAsc) items.reverse();
  listEl.innerHTML = items.map(row).join('');
});

const debouncedMerchPatch = debounce(async (id, k, v)=>{
  debouncedMerchPatch(id, k, v);
}, 400);

document.addEventListener('input', async (e)=>{
  const el = e.target;
  if (!el.matches('input[data-k]')) return;
  const id = Number(el.getAttribute('data-id'));
  const k = el.getAttribute('data-k');
  const v = el.value;
  debouncedMerchPatch(id, k, v);
});

document.addEventListener('click', async (e)=>{
  const b = e.target.closest('.del'); if(!b) return;
  await fetch('/api/merchants/'+b.dataset.id,{method:'DELETE'});
  render();
});

$('#mAdd').addEventListener('click', async ()=>{
  const payload={ name:$('#mName').value.trim(), phone:$('#mPhone').value.trim(), email:$('#mEmail').value.trim(), notes:$('#mNotes').value.trim() };
  if(!payload.name) return;
  await fetch('/api/merchants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  $('#mName').value=$('#mPhone').value=$('#mEmail').value=$('#mNotes').value='';
  render();
});

render();

document.getElementById('mSortName').addEventListener('click', ()=>{ mSortAsc = !mSortAsc; const items = applyFilter(cache).sort((a,b)=> (a.name||'').localeCompare(b.name||'')); if(!mSortAsc) items.reverse(); listEl.innerHTML = items.map(row).join(''); });

document.getElementById('mExport').addEventListener('click', ()=>{
  const items = applyFilter(cache);
  const cols = ['id','name','phone','email','notes'];
  const lines = [cols.join(',')].concat(items.map(m => cols.map(c => (`"${String(m[c]||'').replace(/"/g,'""')}"`)).join(',')));
  const blob = new Blob([lines.join('\n')], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='merchants.csv'; a.click(); URL.revokeObjectURL(url);
});
