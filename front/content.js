// content.js — Injecte un panneau discret et expose deux canaux:
// (1) renvoie la taille approximative du dernier prompt/réponse,
// (2) affiche les estimations reçues du background.

(function () {
  const browserApi = typeof browser !== 'undefined' ? browser : chrome;
  // UI
  const panel = document.createElement('div');
  panel.id = 'gptcarbon-panel';
  panel.innerHTML = `
    <div class="gptc-head">
      <span class="gptc-title">ChatGPT Carbon (estimation)</span>
      <button type="button" id="gptc-toggle" class="gptc-toggle" aria-label="Réduire le panneau" aria-expanded="true">−</button>
    </div>
    <div class="gptc-body">
      <div class="gptc-row"><span>Région</span><span id="gptc-region">—</span></div>
      <div class="gptc-row"><span>Durée</span><span id="gptc-dur">—</span></div>
      <div class="gptc-row"><span>Énergie calcul</span><span id="gptc-comp">—</span></div>
      <div class="gptc-row"><span>Énergie réseau</span><span id="gptc-net">—</span></div>
      <div class="gptc-row total"><span>Total</span><span id="gptc-wh">—</span></div>
      <div class="gptc-row co2"><span>Émissions</span><span id="gptc-co2">—</span></div>
      <div class="gptc-foot">Heuristique; facteurs modifiables dans Options.</div>
    </div>
  `;
  document.documentElement.appendChild(panel);

  const qs = id => panel.querySelector(id);
  const fmt = (n, d=2) => (n==null? "—" : n.toFixed(d));
  const fmtBytes = (b) => {
    if (!b) return "0 B";
    const u = ['B','KB','MB','GB']; let i=0; let v=b;
    while (v >= 1024 && i<u.length-1) { v/=1024; i++; }
    return `${v.toFixed(2)} ${u[i]}`;
  };

  const toggleBtn = panel.querySelector('#gptc-toggle');
  const STORAGE_KEY = 'gptcarbon:panelCollapsed';

  function applyCollapsed(state) {
    panel.classList.toggle('gptc-collapsed', state);
    const expanded = !state;
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    toggleBtn.setAttribute('aria-label', expanded ? 'Réduire le panneau' : 'Déployer le panneau');
    toggleBtn.textContent = expanded ? '−' : '+';
  }

  function loadCollapsed() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function saveCollapsed(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, state ? '1' : '0');
    } catch (_) {}
  }

  let isCollapsed = loadCollapsed();
  applyCollapsed(isCollapsed);

  toggleBtn.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    applyCollapsed(isCollapsed);
    saveCollapsed(isCollapsed);
  });

  // Estimation des tailles: récupère le dernier prompt (zone textarea) et le dernier bloc de réponse
  function getLastSizes() {
    let promptChars = 0;
    const textarea = document.querySelector('textarea');
    if (textarea && textarea.value) promptChars = textarea.value.length;

    // Sélection d’un dernier message de l’assistant (texte visible)
    let replyChars = 0;
    const assistantBlocks = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (assistantBlocks && assistantBlocks.length) {
      const last = assistantBlocks[assistantBlocks.length - 1];
      const t = last.innerText || last.textContent || "";
      replyChars = t.trim().length;
    }
    return { promptChars, replyChars };
  }

  // Répond au background
  browserApi.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;

    if (msg.type === "gptcarbon:estimation") {
      const d = msg.data;
      qs('#gptc-region').textContent = `${d.region} (${d.kgPerKWh.toFixed(2)} kgCO₂/kWh)`;
      qs('#gptc-dur').textContent    = `${fmt(d.durationSec,1)} s`;
      qs('#gptc-comp').textContent   = `${fmt(d.computeWh,3)} Wh`;
      qs('#gptc-net').textContent    = `${fmt(d.networkWh,3)} Wh (${fmtBytes(d.totalBytes)})`;
      qs('#gptc-wh').textContent     = `${fmt(d.totalWh,3)} Wh`;
      qs('#gptc-co2').textContent    = `${fmt(d.kgCO2,4)} kgCO₂`;
    }
  });

  // Canal “pull” utilisé par background pour obtenir prompt/reply
  browserApi.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "gptcarbon:lastMessageSizes") {
      sendResponse(getLastSizes());
      return true;
    }
  });
})();
