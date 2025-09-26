const $ = s=>document.querySelector(s);
const threadEl = $('#thread');
const loadIdEl = $('#loadId');
const toEl = $('#to');
const msgEl = $('#msg');
const sendBtn = $('#send');

function bubble(item){
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="muted" style="font-size:12px">${new Date(item.createdAt).toLocaleString()} • to ${item.toRole}</div>
  <div style="margin-top:6px">${item.body}</div>`;
  return div;
}

async function refresh(){
  const loadId = loadIdEl.value.trim();
  if (!loadId) { threadEl.innerHTML=''; return; }
  const r = await fetch(`/api/messages?loadId=${encodeURIComponent(loadId)}`);
  const j = await r.json();
  const items = j.items || [];
  threadEl.innerHTML = '';
  items.forEach(m => threadEl.appendChild(bubble(m)));
  threadEl.scrollTop = threadEl.scrollHeight;
}

sendBtn.addEventListener('click', async ()=>{
  const loadId = loadIdEl.value.trim();
  const body = msgEl.value.trim();
  const to = toEl.value;
  if (!loadId || !body) return;
  await fetch('/api/message', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ loadId, to, body })
  });
  msgEl.value='';
  await refresh();
});

loadIdEl.addEventListener('change', refresh);
