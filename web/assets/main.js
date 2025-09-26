const clock = document.getElementById('clock');
const year = document.getElementById('year');
year.textContent = new Date().getFullYear().toString();

function tick(){
  const d = new Date();
  clock.textContent = d.toLocaleString();
}
setInterval(tick, 1000);
tick();

// Demo data for the landing page (mock "live loads")
const demo = [
  { id:'FP-12093', lane:'Mankato, MN → Cottage Grove, WI', driver:'T. Jensen', status:'En‑route', eta:'08:40', badge:'enroute' },
  { id:'ADM-55102', lane:'Iowa Falls, IA → Cedar Rapids, IA', driver:'K. Miller', status:'Arrived', eta:'—', badge:'arrived' },
  { id:'GT-33007', lane:'Walnut Ridge, AR → Duncombe, IA', driver:'S. Ortiz', status:'Loaded', eta:'ETA 18:15', badge:'loaded' },
  { id:'FP-12110', lane:'Hodgkins, IL → Reynolds, IN', driver:'R. Singh', status:'Delivered', eta:'15:05', badge:'delivered' }
];

const cards = document.getElementById('demo-cards');
demo.forEach(row => {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <strong>${row.id}</strong>
      <span class="badge ${row.badge}">${row.status}</span>
    </div>
    <div class="muted">${row.lane}</div>
    <div style="display:flex;justify-content:space-between;margin-top:6px">
      <span>Driver: <strong>${row.driver}</strong></span>
      <span class="muted">ETA: ${row.eta}</span>
    </div>
  `;
  cards.appendChild(el);
});
