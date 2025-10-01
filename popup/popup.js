function fmt(n, d=3) { return (n==null? "—" : n.toFixed(d)); }
function fmtBytes(b) {
  if (!b) return "0 B";
  const u=['B','KB','MB','GB']; let i=0; let v=b;
  while (v>=1024 && i<u.length-1) { v/=1024; i++; }
  return `${v.toFixed(2)} ${u[i]}`;
}

const lastDiv = document.getElementById('last');
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'gptcarbon:estimation') return;
  const d = msg.data;
  lastDiv.innerHTML = `
    <div class="row"><span>Région</span><span>${d.region} (${d.kgPerKWh.toFixed(2)} kgCO₂/kWh)</span></div>
    <div class="row"><span>Durée</span><span>${fmt(d.durationSec,1)} s</span></div>
    <div class="row"><span>Calcul</span><span>${fmt(d.computeWh)} Wh</span></div>
    <div class="row"><span>Réseau</span><span>${fmt(d.networkWh)} Wh (${fmtBytes(d.totalBytes)})</span></div>
    <div class="row"><strong>Total</strong><strong>${fmt(d.totalWh)} Wh</strong></div>
    <div class="row"><strong>Émissions</strong><strong>${fmt(d.kgCO2,4)} kgCO₂</strong></div>
  `;
});

document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});
