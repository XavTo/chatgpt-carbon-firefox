// background.js (Manifest V3 - Firefox compatible)

const browserApi = typeof browser !== 'undefined' ? browser : chrome;

// Les requêtes chatgpt.com transitent désormais par /backend-api/f/conversation ;
// on accepte toute variante contenant "conversation" pour rester robuste.
const CHAT_ENDPOINTS = [
  "*://chatgpt.com/backend-api/*conversation*",
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
  },
  enableLogging: false,
  logApiUrl: ""
};

let settingsCache = null;
async function getSettings() {
  if (settingsCache) return settingsCache;
  const { settings } = await browserApi.storage.sync.get("settings");
  settingsCache = mergeSettings(settings);
  // rétro-compatibilité profonde
  if (!settingsCache.regionCarbonIntensity) settingsCache.regionCarbonIntensity = DEFAULTS.regionCarbonIntensity;
  return settingsCache;
}
browserApi.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    settingsCache = mergeSettings(changes.settings.newValue);
  }
});

function mergeSettings(settings) {
  const merged = Object.assign({}, DEFAULTS, settings || {});
  merged.scale = Object.assign({}, DEFAULTS.scale, settings?.scale || {});
  merged.regionCarbonIntensity = Object.assign({}, DEFAULTS.regionCarbonIntensity, settings?.regionCarbonIntensity || {});
  return merged;
}

// Mémo sur requêtes afin de relier début/fin et accumuler octets
const reqState = new Map(); // key: requestId -> {start, url, method, reqBytes, respBytes, contentLength}

function logEvent(entry, providedSettings) {
  const send = (settings) => {
    if (!settings?.enableLogging) return;
    const url = (settings.logApiUrl || "").trim();
    if (!url) return;
    const payload = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch((err) => {
      console.warn("ChatGPT Carbon: échec de l'envoi vers l'API", err);
    });
  };

  if (providedSettings) {
    send(providedSettings);
  } else {
    getSettings().then(send).catch(() => {});
  }
}

function guessBytesFromBody(details) {
  try {
    if (details.requestBody && details.requestBody.raw) {
      return details.requestBody.raw.reduce((acc, part) => acc + (part.bytes ? part.bytes.byteLength : 0), 0);
    }
  } catch {}
  return 0;
}

browserApi.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== "POST") return;
    reqState.set(details.requestId, {
      start: performance.now(),
      url: details.url,
      method: details.method,
      reqBytes: guessBytesFromBody(details),
      respBytes: 0,
      contentLength: null
    });
    logEvent({
      type: "request:start",
      requestId: details.requestId,
      url: details.url,
      method: details.method,
      tabId: details.tabId,
      frameId: details.frameId
    });
  },
  { urls: CHAT_ENDPOINTS },
  ["requestBody"]
);

browserApi.webRequest.onHeadersReceived.addListener(
  (details) => {
    const st = reqState.get(details.requestId);
    if (!st) return;
    const clHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === "content-length");
    if (clHeader && clHeader.value) {
      const val = parseInt(clHeader.value, 10);
      if (!Number.isNaN(val)) st.contentLength = val;
    }
    logEvent({
      type: "request:headers",
      requestId: details.requestId,
      url: details.url,
      statusCode: details.statusCode,
      fromCache: details.fromCache,
      contentLength: st.contentLength ?? null
    });
  },
  { urls: CHAT_ENDPOINTS },
  ["responseHeaders"]
);

browserApi.webRequest.onCompleted.addListener(
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
    if (details.tabId >= 0) {
      try {
        const resp = await browserApi.tabs.sendMessage(details.tabId, { type: "gptcarbon:lastMessageSizes" });
        if (resp && typeof resp.promptChars === "number" && typeof resp.replyChars === "number") {
          promptChars = resp.promptChars;
          replyChars = resp.replyChars;
        }
      } catch (err) {
        logEvent({
          type: "tabs:message:error",
          requestId: details.requestId,
          tabId: details.tabId,
          reason: err?.message || String(err)
        });
      }
    }

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

    if (details.tabId >= 0) {
      try {
        browserApi.tabs.sendMessage(details.tabId, { type: "gptcarbon:estimation", data: payload });
      } catch {}
    }

    browserApi.runtime.sendMessage({ type: "gptcarbon:estimation", data: payload });

    logEvent({
      type: "estimation",
      requestId: details.requestId,
      ...payload
    }, settings);

    reqState.delete(details.requestId);
  },
  { urls: CHAT_ENDPOINTS }
);

browserApi.webRequest.onErrorOccurred.addListener(
  (details) => {
    const st = reqState.get(details.requestId);
    logEvent({
      type: "request:error",
      requestId: details.requestId,
      url: details.url,
      method: st?.method || details.method,
      error: details.error,
      fromCache: details.fromCache
    });
    reqState.delete(details.requestId);
  },
  { urls: CHAT_ENDPOINTS }
);
