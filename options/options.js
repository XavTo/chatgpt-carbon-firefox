const browserApi = typeof browser !== 'undefined' ? browser : chrome;

const defaults = {
  baseWhPerQuery: 2.9,
  minWhPerQuery: 0.3,
  scale: {
    durationRefSec: 10, durationWeight: 0.5,
    promptRefKchars: 0.5, promptWeight: 0.2,
    replyRefKchars: 0.8,  replyWeight: 0.3,
    minScale: 0.4, maxScale: 4.0
  },
  regionCarbonIntensity: { "Europe": 0.30, "USA": 0.38, "Canada": 0.12, "World": 0.45 },
  selectedRegion: "Europe",
  networkKWhPerGBFixed: 0.03,
  networkKWhPerGBMobile: 0.14,
  useMobileNetwork: false,
  enableLogging: false,
  logApiUrl: "http://localhost:3000/events"
};

async function load() {
  const { settings } = await browserApi.storage.sync.get("settings");
  const s = mergeSettings(settings);
  // bind fields
  document.getElementById('baseWh').value = s.baseWhPerQuery;
  document.getElementById('minWh').value  = s.minWhPerQuery;

  document.getElementById('durRef').value = s.scale.durationRefSec;
  document.getElementById('wDur').value   = s.scale.durationWeight;
  document.getElementById('pRef').value   = s.scale.promptRefKchars;
  document.getElementById('wP').value     = s.scale.promptWeight;
  document.getElementById('rRef').value   = s.scale.replyRefKchars;
  document.getElementById('wR').value     = s.scale.replyWeight;
  document.getElementById('sMin').value   = s.scale.minScale;
  document.getElementById('sMax').value   = s.scale.maxScale;

  document.getElementById('kwhGbFixed').value = s.networkKWhPerGBFixed;
  document.getElementById('kwhGbMobile').value = s.networkKWhPerGBMobile;
  document.getElementById('useMobile').checked = s.useMobileNetwork;
  document.getElementById('enableLogging').checked = s.enableLogging;
  document.getElementById('logApiUrl').value = s.logApiUrl || '';

  const regionSel = document.getElementById('region');
  regionSel.innerHTML = '';
  Object.keys(s.regionCarbonIntensity).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = k;
    if (k === s.selectedRegion) opt.selected = true;
    regionSel.appendChild(opt);
  });

  const tbody = document.querySelector('#regionTable tbody');
  tbody.innerHTML = '';
  Object.entries(s.regionCarbonIntensity).forEach(([k,v]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td contenteditable="true" data-key>${k}</td>
      <td contenteditable="true" data-val>${v}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('addRegion').onclick = () => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td contenteditable="true" data-key>NvelleRegion</td><td contenteditable="true" data-val>0.30</td>`;
    tbody.appendChild(tr);
  };

  document.getElementById('save').onclick = async () => {
    const regionMap = {};
    document.querySelectorAll('#regionTable tbody tr').forEach(tr => {
      const key = tr.querySelector('[data-key]').textContent.trim();
      const val = parseFloat(tr.querySelector('[data-val]').textContent.trim());
      if (key && Number.isFinite(val)) regionMap[key] = val;
    });

    const newSettings = {
      baseWhPerQuery: parseFloat(document.getElementById('baseWh').value),
      minWhPerQuery:  parseFloat(document.getElementById('minWh').value),
      scale: {
        durationRefSec: parseFloat(document.getElementById('durRef').value),
        durationWeight: parseFloat(document.getElementById('wDur').value),
        promptRefKchars: parseFloat(document.getElementById('pRef').value),
        promptWeight: parseFloat(document.getElementById('wP').value),
        replyRefKchars: parseFloat(document.getElementById('rRef').value),
        replyWeight: parseFloat(document.getElementById('wR').value),
        minScale: parseFloat(document.getElementById('sMin').value),
        maxScale: parseFloat(document.getElementById('sMax').value)
      },
      regionCarbonIntensity: regionMap,
      selectedRegion: document.getElementById('region').value,
      networkKWhPerGBFixed: parseFloat(document.getElementById('kwhGbFixed').value),
      networkKWhPerGBMobile: parseFloat(document.getElementById('kwhGbMobile').value),
      useMobileNetwork: document.getElementById('useMobile').checked,
      enableLogging: document.getElementById('enableLogging').checked,
      logApiUrl: document.getElementById('logApiUrl').value.trim()
    };

    await browserApi.storage.sync.set({ settings: newSettings });
    document.getElementById('status').textContent = "Enregistré.";
    setTimeout(()=> document.getElementById('status').textContent="", 1500);
  };
}
document.addEventListener('DOMContentLoaded', load);

function mergeSettings(settings) {
  const merged = Object.assign({}, defaults, settings || {});
  merged.scale = Object.assign({}, defaults.scale, settings?.scale || {});
  merged.regionCarbonIntensity = Object.assign({}, defaults.regionCarbonIntensity, settings?.regionCarbonIntensity || {});
  return merged;
}
