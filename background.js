// background.js (Manifest V3 - Firefox compatible)

const CHAT_ENDPOINTS = [
  "*://chatgpt.com/backend-api/conversation*",
  "*://api.openai.com/v1/chat/completions*"
];

// Valeurs par défaut (modifiable via Options)
const DEFAULTS = {
  baseWhPerQuery: 2.9,             // 2.9 Wh : moyenne par requête (GPTFootprint)  :contentReference[oaicite:4]{index=4}
  minWhPerQuery: 0.3,              // 0.3 Wh : estimation plus récente (Epoch)      :contentReference[oaicite:5]{index=5}
  networkKWhPerGBFixed: 0.03,      // kWh/GB (fixe)                                 :contentReference[oaicite:6]{index=6}
  networkKWhPerGBMobile: 0.14,     // kWh/GB (mobile)                               :contentReference[oaicite:7]{index=7}
  useMobileNetwork: false,
  // Intensité carbone région (kgCO2/kWh) — valeurs rang d’ordre, éditables.
  // OWID/Ember indiquent ~0.25–0.35 kg/kWh Europe 2024 ; USA ≈0.38 kg/kWh.  :contentReference[oaicite:8]{index=8}
  regionCarbonIntensity: {
    "Europe": 0.30,
    "USA": 0.38,
    "Canada": 0.12,
    "World": 0.45
  },
  selectedRegion: "Europe",
  // Pondérations heuristiques d’échelle
  scale: {
    // durée (s) normalisée autour de 10 s
    durationRefSec: 10,
    durationWeight: 0.5,
    // tailles (kcar) normalisées
    promptRefKchars: 0.5,   // 500 caractères ~ ordre de grandeur
    promptWeight: 0.2,
    replyRefKchars: 0.8,    // la réponse pèse souvent plus
    replyWeight: 0.3,
    minScale: 0.4,
    maxScale: 4.0
  }
};

let settingsCache = null;
async function getSettings() {
  if (settingsCache) return settingsCache;
  const { settings } = await browser.storage.sync.get("settings");
  settingsCache = Object.assign({}, DEFAULTS, settings || {});
  // rétro-compatibilité profonde
  if (!settingsCache.regionCarbonIntensity) settingsCache.regionCarbonIntensity = DEFAULTS.regionCarbonIntensity;
  return settingsCache;
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    settingsCache = Object.assign({}, DEFAULTS, changes.settings.newValue || {});
  }
});

// Mémo sur requêtes afin de relier début/fin et accumuler octets
const reqState = new Map(); // key: requestId -> {start, url, method, reqBytes, respBytes, contentLength}

function guessBytesFromBody(details) {
  try {
    if (details.requestBody && details.requestBody.raw) {
      return details.requestBody.raw.reduce((acc, part) => acc + (part.bytes ? part.bytes.byteLength : 0), 0);
    }
  } catch {}
  return 0;
}

browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.method !== "POST") return;
    reqState.set(details.requestId, {
      start: performance.now(),
      url: details.url,
      method: details.method,
      reqBytes: guessBytesFromBody(details),
      respBytes: 0,
      contentLength: null
    });
  },
  { urls: CHAT_ENDPOINTS },
  ["requestBody"]
);

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    const st = reqState.get(details.requestId);
    if (!st) return;
    const clHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === "content-length");
    if (clHeader && clHeader.value) {
      const val = parseInt(clHeader.value, 10);
      if (!Number.isNaN(val)) st.contentLength = val;
    }
  },
  { urls: CHAT_ENDPOINTS },
  ["responseHeaders"]
);

browser.webRequest.onCompleted.addListener(
  async (details) => {
    const st = reqState.get(details.requestId);
    if (!st) return;
    const durationSec = Math.max(0.001, (performance.now() - st.start) / 1000);

    // Octets estimés (réseau) : Content-Length si disponible
    const respBytes = (st.contentLength != null) ? st.contentLength : 0;
    const reqBytes = st.reqBytes || 0;
    const totalBytes = reqBytes + respBytes;

    // Demande au content script des proxys de tailles (prompt/reply chars)
    // via message relayé à l’onglet d’origine (si présent)
    let promptChars = 0, replyChars = 0;
    try {
      const tabs = await browser.tabs.query({ url: "*://chatgpt.com/*" });
      if (tabs && tabs.length) {
        const tabId = tabs[0].id;
        const resp = await browser.tabs.sendMessage(tabId, { type: "gptcarbon:lastMessageSizes" });
        if (resp && typeof resp.promptChars === "number" && typeof resp.replyChars === "number") {
          promptChars = resp.promptChars;
          replyChars = resp.replyChars;
        }
      }
    } catch {}

    const settings = await getSettings();

    // Énergie de base ajustée
    const s = settings.scale;
    const scaleDur = durationSec / (s.durationRefSec || 10);
    const scalePrompt = (promptChars / 1000) / (s.promptRefKchars || 0.5);
    const scaleReply  = (replyChars / 1000) / (s.replyRefKchars || 0.8);

    let scale = 1
      + s.durationWeight * (scaleDur - 1)
      + s.promptWeight  * (scalePrompt - 1)
      + s.replyWeight   * (scaleReply - 1);

    scale = Math.max(s.minScale, Math.min(s.maxScale, scale));

    const baseWh = settings.baseWhPerQuery;
    const computeWh = baseWh * scale;

    // Énergie réseau
    const kWhPerGB = settings.useMobileNetwork ? settings.networkKWhPerGBMobile : settings.networkKWhPerGBFixed;
    const networkWh = (totalBytes / (1024 ** 3)) * (kWhPerGB * 1000); // kWh -> Wh

    const totalWh = computeWh + networkWh;

    // kgCO2
    const region = settings.selectedRegion || "Europe";
    const kgPerKWh = settings.regionCarbonIntensity[region] ?? 0.3;
    const kgCO2 = (totalWh / 1000) * kgPerKWh;

    // Diffuse l’estimation à l’UI (content + popup)
    const payload = {
      url: details.url,
      durationSec,
      promptChars,
      replyChars,
      reqBytes,
      respBytes,
      totalBytes,
      computeWh,
      networkWh,
      totalWh,
      kgCO2,
      region,
      kgPerKWh
    };

    try {
      const tabs = await browser.tabs.query({ url: "*://chatgpt.com/*" });
      for (const t of tabs) {
        browser.tabs.sendMessage(t.id, { type: "gptcarbon:estimation", data: payload });
      }
    } catch {}

    browser.runtime.sendMessage({ type: "gptcarbon:estimation", data: payload });

    reqState.delete(details.requestId);
  },
  { urls: CHAT_ENDPOINTS }
);
