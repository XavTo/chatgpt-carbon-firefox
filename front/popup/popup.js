import {
  loginUser,
  registerUser,
  logoutUser,
  getAuthState,
  ensureValidAccessToken,
  API_BASE_URL,
} from '../lib/auth.js';
import { createLoadingButton } from './loading-button.js';

const browserApi = typeof browser !== 'undefined'
  ? browser
  : (typeof chrome !== 'undefined' ? chrome : null);

const elements = {
  themeToggle: document.getElementById('themeToggle'),
  themeIcon: document.getElementById('themeIcon'),
  themeToggleLabel: document.getElementById('themeToggleLabel'),
  authSection: document.getElementById('authSection'),
  authMessage: document.getElementById('authMessage'),
  authEmail: document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  authPasswordConfirmRow: document.getElementById('authPasswordConfirmRow'),
  authPasswordConfirm: document.getElementById('authPasswordConfirm'),
  toggleAuthMode: document.getElementById('toggleAuthMode'),
  dashboardSection: document.getElementById('dashboardSection'),
  dashboardMessage: document.getElementById('dashboardMessage'),
  currentUserEmail: document.getElementById('currentUserEmail'),
  currentUserRole: document.getElementById('currentUserRole'),
  serverUrl: document.getElementById('serverUrl'),
  logoutButton: document.getElementById('logoutButton'),
  estimation: document.getElementById('estimation'),
  estimationTimestamp: document.getElementById('estimationTimestamp'),
  estimationLoader: document.getElementById('estimationLoader'),
  tabButtons: Array.from(document.querySelectorAll('.tab-button')),
  tabPanels: {
    overview: document.getElementById('tab-overview'),
    history: document.getElementById('tab-history'),
  },
  summaryForm: document.getElementById('summaryFilters'),
  summaryFrom: document.getElementById('summaryFrom'),
  summaryTo: document.getElementById('summaryTo'),
  summaryReset: document.getElementById('summaryReset'),
  summaryRangeButtons: Array.from(document.querySelectorAll('[data-summary-range]')),
  summaryCustomRange: document.getElementById('summaryCustomRange'),
  summaryMetrics: document.getElementById('summaryMetrics'),
  summaryRefresh: document.getElementById('summaryRefresh'),
  summaryLoader: document.getElementById('summaryLoader'),
  historyForm: document.getElementById('historyFilters'),
  historyFrom: document.getElementById('historyFrom'),
  historyTo: document.getElementById('historyTo'),
  historyPageSize: document.getElementById('historyPageSize'),
  historyReset: document.getElementById('historyReset'),
  historyStatus: document.getElementById('historyStatus'),
  historyTableBody: document.getElementById('historyTableBody'),
  historyPrev: document.getElementById('historyPrev'),
  historyNext: document.getElementById('historyNext'),
  historyPaginationInfo: document.getElementById('historyPaginationInfo'),
};

const THEME_STORAGE_KEY = 'gptcarbon:themePreference';
const THEME_CYCLE = ['light', 'dark'];
const prefersDarkScheme = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : { matches: false };

const authButtonController = createLoadingButton({
  container: document.getElementById('authButtonContainer'),
  id: 'authSubmit',
  label: 'Se connecter',
  variant: 'primary',
});

if (elements.serverUrl) {
  elements.serverUrl.textContent = API_BASE_URL;
}

let authMode = 'login';
let lastEstimation = null;
let currentAuthState = null;

const DEFAULT_HISTORY_PAGE_SIZE = 10;

const DEFAULT_SUMMARY_PRESET = 'today';
const SUMMARY_PRESETS = new Set(['today', '7d', '1m', 'custom']);

const summaryState = {
  filters: computeSummaryPresetRange(DEFAULT_SUMMARY_PRESET),
  data: null,
  rangePreset: DEFAULT_SUMMARY_PRESET,
};

const historyState = {
  filters: { from: null, to: null },
  page: 1,
  pageSize: DEFAULT_HISTORY_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  items: [],
  loading: false,
};

let consumptionRefreshTimeout = null;

function resetConsumptionState() {
  summaryState.rangePreset = DEFAULT_SUMMARY_PRESET;
  summaryState.filters = computeSummaryPresetRange(DEFAULT_SUMMARY_PRESET);
  summaryState.data = null;
  historyState.filters = { from: null, to: null };
  historyState.page = 1;
  historyState.pageSize = DEFAULT_HISTORY_PAGE_SIZE;
  historyState.total = 0;
  historyState.totalPages = 0;
  historyState.items = [];
  historyState.loading = false;
  renderSummary();
  renderHistory();
}

let themePreference = loadThemePreference();
setThemePreference(themePreference, { persist: false });

function fmt(value, digits = 3) {
  return value == null ? '—' : Number(value).toFixed(digits);
}

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTimeDisplay(value) {
  const date = toDate(value);
  if (!date) return '—';
  try {
    return date.toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return date.toISOString();
  }
}

function toLocalInputValue(date) {
  const d = toDate(date);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeInput(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function describeRole(role) {
  if (role === 'admin') {
    return 'Rôle : Administrateur';
  }
  return 'Rôle : Utilisateur';
}

function summarizeNumber(value, digits = 2) {
  if (value == null) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function computeSummaryPresetRange(preset) {
  const normalized = SUMMARY_PRESETS.has(preset) ? preset : DEFAULT_SUMMARY_PRESET;
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);

  const setStartOfDay = (date) => {
    date.setHours(0, 0, 0, 0);
  };

  switch (normalized) {
    case '7d': {
      setStartOfDay(from);
      from.setDate(from.getDate() - 6);
      break;
    }
    case '1m': {
      setStartOfDay(from);
      from.setMonth(from.getMonth() - 1);
      break;
    }
    case 'today':
    default: {
      setStartOfDay(from);
      break;
    }
  }

  return { from, to };
}

function scheduleConsumptionRefresh(delay = 1200) {
  if (consumptionRefreshTimeout) {
    clearTimeout(consumptionRefreshTimeout);
  }
  consumptionRefreshTimeout = setTimeout(() => {
    consumptionRefreshTimeout = null;
    if (!currentAuthState) return;
    loadSummary({ silent: true }).catch(() => {});
    loadHistory({ silent: true }).catch(() => {});
  }, delay);
}

function setAuthMessage(text, variant) {
  elements.authMessage.textContent = text || '';
  elements.authMessage.classList.remove('error', 'success');
  if (variant) {
    elements.authMessage.classList.add(variant);
  }
}

function setDashboardMessage(text, variant) {
  elements.dashboardMessage.textContent = text || '';
  elements.dashboardMessage.classList.remove('error', 'success');
  if (variant) {
    elements.dashboardMessage.classList.add(variant);
  }
}

function loadThemePreference() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && THEME_CYCLE.includes(stored)) {
      return stored;
    }
  } catch (_) {
    // ignore
  }
  return 'light';
}

function saveThemePreference(pref) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch (_) {
    // ignore persistence errors
  }
}

function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') {
    return pref;
  }
  return prefersDarkScheme.matches ? 'dark' : 'light';
}

function preferenceDescription(pref, resolved) {
  return `Thème ${pref === 'dark' ? 'sombre' : 'clair'}`;
}

function actionDescription(pref) {
  return `passer au thème ${pref === 'dark' ? 'sombre' : 'clair'}`;
}

function iconForPreference(pref) {
  return pref === 'dark' ? '🌙' : '☀️';
}

function getNextThemePreference(current) {
  const index = THEME_CYCLE.indexOf(current);
  if (index === -1) {
    return 'light';
  }
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
}

function updateThemeToggle(pref, resolved) {
  if (!elements.themeToggle) {
    return;
  }
  const next = getNextThemePreference(pref);
  const currentLabel = preferenceDescription(pref, resolved);
  const actionLabel = actionDescription(next);
  const accessibleLabel = `${currentLabel}. Cliquer pour ${actionLabel}.`;

  if (elements.themeIcon) {
    elements.themeIcon.textContent = iconForPreference(pref);
  }
  elements.themeToggle.setAttribute('aria-label', accessibleLabel);
  elements.themeToggle.title = accessibleLabel;
  if (elements.themeToggleLabel) {
    elements.themeToggleLabel.textContent = accessibleLabel;
  }
}

function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.body.dataset.theme = resolved;
  document.body.dataset.themePreference = pref;
  updateThemeToggle(pref, resolved);
}

function setThemePreference(pref, { persist = true } = {}) {
  themePreference = pref;
  if (persist) {
    saveThemePreference(pref);
  }
  applyTheme(pref);
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === 'register';
  elements.authPasswordConfirmRow.classList.toggle('hidden', !isRegister);
  authButtonController.setLabel(isRegister ? 'Créer un compte' : 'Se connecter');
  authButtonController.setLoading(false);
  authButtonController.setDisabled(false);
  elements.toggleAuthMode.textContent = isRegister ? 'J’ai déjà un compte' : 'Créer un compte';
  elements.authPassword.autocomplete = isRegister ? 'new-password' : 'current-password';
  if (!isRegister) {
    elements.authPasswordConfirm.value = '';
  }
  setAuthMessage('', null);
}

function renderEstimation() {
  if (!elements.estimation) return;
  if (!lastEstimation) {
    elements.estimation.innerHTML = '<p class="empty-state">Aucune estimation récente.</p>';
    if (elements.estimationTimestamp) {
      elements.estimationTimestamp.textContent = '';
    }
    return;
  }

  const d = lastEstimation;
  elements.estimation.innerHTML = `
    <div class="estimation-row"><span>Région</span><span>${d.region} (${fmt(d.kgPerKWh, 2)} kgCO₂/kWh)</span></div>
    <div class="estimation-row"><span>Durée</span><span>${fmt(d.durationSec, 1)} s</span></div>
    <div class="estimation-row"><span>Calcul</span><span>${fmt(d.computeWh)} Wh</span></div>
    <div class="estimation-row"><span>Réseau</span><span>${fmt(d.networkWh)} Wh (${fmtBytes(d.totalBytes)})</span></div>
    <div class="estimation-row"><strong>Total</strong><strong>${fmt(d.totalWh)} Wh</strong></div>
    <div class="estimation-row"><strong>Émissions</strong><strong>${fmt(d.kgCO2, 4)} kgCO₂</strong></div>
  `;
  if (elements.estimationTimestamp) {
    const ts = d.timestamp ? formatDateTimeDisplay(d.timestamp) : '';
    elements.estimationTimestamp.textContent = ts ? `Mesuré le ${ts}` : '';
  }
}

async function authorizedFetch(path, options = {}) {
  const state = await ensureValidAccessToken(API_BASE_URL);
  if (!state || !state.accessToken) {
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

  currentAuthState = state;

  const headers = Object.assign({}, options.headers || {});
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  headers.Authorization = `${state.tokenType || 'Bearer'} ${state.accessToken}`;

  const response = await fetch(`${state.apiBaseUrl || API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    // ignore JSON parsing errors for empty bodies
  }

  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(' ')
      : (data?.message || data?.error || response.statusText || 'Erreur serveur.');
    throw new Error(message);
  }

  return data;
}

function renderSummary() {
  if (!elements.summaryMetrics) return;

  const isCustomRange = summaryState.rangePreset === 'custom';
  if (Array.isArray(elements.summaryRangeButtons)) {
    elements.summaryRangeButtons.forEach((button) => {
      const preset = button?.dataset?.summaryRange;
      const isActive = preset === summaryState.rangePreset;
      button.classList.toggle('active', Boolean(isActive));
      if (isActive) {
        button.setAttribute('aria-pressed', 'true');
      } else {
        button.setAttribute('aria-pressed', 'false');
      }
    });
  }

  if (elements.summaryCustomRange) {
    elements.summaryCustomRange.classList.toggle('hidden', !isCustomRange);
  }

  const data = summaryState.data;
  const metrics = {
    totalRequests: data?.totalRequests ?? null,
    totalWh: data?.totalWh ?? null,
    totalKgCO2: data?.totalKgCO2 ?? null,
    totalComputeWh: data?.totalComputeWh ?? null,
    totalNetworkWh: data?.totalNetworkWh ?? null,
  };

  Object.entries(metrics).forEach(([key, value]) => {
    const el = elements.summaryMetrics.querySelector(`[data-metric="${key}"]`);
    if (!el) return;
    if (key === 'totalRequests') {
      el.textContent = value == null ? '—' : Number(value).toLocaleString('fr-FR');
    } else if (key === 'totalKgCO2') {
      el.textContent = summarizeNumber(value, 4);
    } else {
      el.textContent = summarizeNumber(value, 2);
    }
  });

  if (elements.summaryRefresh) {
    const parts = [];
    const fromText = summaryState.filters.from ? formatDateTimeDisplay(summaryState.filters.from) : null;
    const toText = summaryState.filters.to ? formatDateTimeDisplay(summaryState.filters.to) : null;
    if (fromText || toText) {
      parts.push(`Fenêtre ${fromText || '—'} → ${toText || '—'}`);
    }
    if (data?.updatedAt) {
      parts.push(`Mis à jour ${formatDateTimeDisplay(data.updatedAt)}`);
    }
    const tooltip = parts.join(' • ') || 'Aucune mise à jour';
    elements.summaryRefresh.title = tooltip;
    elements.summaryRefresh.setAttribute('aria-label', `Actualiser le résumé (${tooltip})`);
  }

  if (elements.summaryFrom) {
    elements.summaryFrom.value = isCustomRange
      ? toLocalInputValue(summaryState.filters.from)
      : '';
  }
  if (elements.summaryTo) {
    elements.summaryTo.value = isCustomRange
      ? toLocalInputValue(summaryState.filters.to)
      : '';
  }
}

async function selectSummaryPreset(preset, { fetch = true } = {}) {
  const normalized = SUMMARY_PRESETS.has(preset) ? preset : DEFAULT_SUMMARY_PRESET;
  summaryState.rangePreset = normalized;

  if (normalized === 'custom') {
    renderSummary();
    return;
  }

  summaryState.filters = computeSummaryPresetRange(normalized);
  renderSummary();

  if (fetch) {
    await loadSummary();
  }
}

function renderHistory() {
  if (!elements.historyTableBody) return;

  elements.historyPageSize.value = String(historyState.pageSize);
  if (elements.historyFrom) {
    elements.historyFrom.value = toLocalInputValue(historyState.filters.from);
  }
  if (elements.historyTo) {
    elements.historyTo.value = toLocalInputValue(historyState.filters.to);
  }

  const rows = Array.isArray(historyState.items) ? historyState.items : [];
  if (!rows.length) {
    elements.historyTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Aucune donnée.</td></tr>';
  } else {
    elements.historyTableBody.innerHTML = rows
      .map((record) => {
        const dateText = formatDateTimeDisplay(record.eventTimestamp || record.createdAt);
        const durationText = record.durationSec != null ? `${fmt(record.durationSec, 1)} s` : '—';
        const totalWh = record.totalWh != null ? summarizeNumber(Number(record.totalWh), 3) : '—';
        const computeWh = record.computeWh != null ? summarizeNumber(Number(record.computeWh), 3) : '—';
        const networkWhValue = record.networkWh != null ? Number(record.networkWh) : null;
        const networkWh = networkWhValue != null ? summarizeNumber(networkWhValue, 3) : '—';
        const kgCO2 = record.kgCO2 != null ? summarizeNumber(Number(record.kgCO2), 4) : '—';
        const bytesValue = record.totalBytes != null ? Number(record.totalBytes) : null;
        const bytesText = bytesValue != null && Number.isFinite(bytesValue) ? fmtBytes(bytesValue) : '—';

        return `
          <tr>
            <td>${dateText}</td>
            <td>${durationText}</td>
            <td>
              <div class="metric-small">${totalWh} Wh</div>
              <div class="muted">Calcul : ${computeWh} Wh</div>
            </td>
            <td>${kgCO2}</td>
            <td>
              <div class="metric-small">${networkWh} Wh</div>
              <div class="muted">${bytesText}</div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  if (elements.historyPaginationInfo) {
    if (historyState.totalPages <= 1) {
      elements.historyPaginationInfo.textContent = historyState.total
        ? `${historyState.total} requêtes`
        : '';
    } else {
      elements.historyPaginationInfo.textContent = `Page ${historyState.page} sur ${historyState.totalPages}`;
    }
  }

  if (elements.historyPrev) {
    elements.historyPrev.disabled = historyState.page <= 1;
  }
  if (elements.historyNext) {
    elements.historyNext.disabled = historyState.totalPages === 0 || historyState.page >= historyState.totalPages;
  }
}

function setActiveTab(tab) {
  const normalized = tab === 'history' ? 'history' : 'overview';
  elements.tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === normalized;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  Object.entries(elements.tabPanels).forEach(([name, panel]) => {
    if (!panel) return;
    panel.classList.toggle('active', name === normalized);
  });
}

function buildQueryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) return;
    if (value instanceof Date) {
      search.set(key, value.toISOString());
    } else {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function fetchConsumptionSummary(filters = {}) {
  const query = buildQueryString({
    from: filters.from,
    to: filters.to,
  });
  return authorizedFetch(`/consumption/summary${query}`);
}

async function fetchConsumptionHistory(params = {}) {
  const query = buildQueryString({
    page: params.page,
    pageSize: params.pageSize,
    from: params.from,
    to: params.to,
  });
  return authorizedFetch(`/consumption/history${query}`);
}

async function loadSummary({ silent = false } = {}) {
  if (!currentAuthState) return;
  if (!silent && elements.summaryRefresh) {
    if (elements.summaryRefresh) {
      elements.summaryRefresh.disabled = true;
      elements.summaryRefresh.title = 'Chargement…';
  // show loaders
  if (elements.summaryLoader) {
    elements.summaryLoader.classList.remove('hidden');
  }
  if (elements.summaryMetrics) {
    const content = elements.summaryMetrics.closest('.card-content');
    if (content) content.classList.add('hidden');
  }
    }
  }

  try {
    const data = await fetchConsumptionSummary(summaryState.filters);
    summaryState.data = data || null;
    if (summaryState.rangePreset === 'custom' && (data?.from || data?.to)) {
      summaryState.filters.from = toDate(data.from) || summaryState.filters.from;
      summaryState.filters.to = toDate(data.to) || summaryState.filters.to;
    }
  } catch (err) {
    if (!silent && elements.summaryRefresh) {
    if (elements.summaryLoader) {
      elements.summaryLoader.classList.add('hidden');
    }
    if (elements.summaryMetrics) {
      const content = elements.summaryMetrics.closest('.card-content');
      if (content) content.classList.remove('hidden');
    }
      elements.summaryRefresh.disabled = false;
      elements.summaryRefresh.title = err?.message || 'Impossible de récupérer le résumé.';
    }
    return;
  }
  // hide loaders
  if (elements.summaryLoader) {
    elements.summaryLoader.classList.add('hidden');
  }
  if (elements.summaryMetrics) {
    const content = elements.summaryMetrics.closest('.card-content');
    if (content) content.classList.remove('hidden');
  }

  renderSummary();
}

async function loadHistory({ page, pageSize, silent = false } = {}) {
  if (!currentAuthState) return;
  if (Number.isFinite(pageSize)) {
    historyState.pageSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
  }
  if (Number.isFinite(page)) {
    historyState.page = Math.max(1, Math.trunc(page));
  }

  if (!silent && elements.historyStatus) {
    elements.historyStatus.textContent = 'Chargement…';
  }

  historyState.loading = true;
  try {
    const data = await fetchConsumptionHistory({
      page: historyState.page,
      pageSize: historyState.pageSize,
      from: historyState.filters.from,
      to: historyState.filters.to,
    });

    historyState.items = Array.isArray(data?.items) ? data.items : [];
    const total = Number(data?.total);
    const page = Number(data?.page);
    const pageSize = Number(data?.pageSize);
    const totalPages = Number(data?.totalPages);

    historyState.total = Number.isFinite(total) ? total : historyState.items.length;
    historyState.page = Number.isFinite(page) ? page : historyState.page;
    historyState.pageSize = Number.isFinite(pageSize)
      ? pageSize
      : historyState.pageSize;
    historyState.totalPages = Number.isFinite(totalPages)
      ? totalPages
      : (historyState.pageSize > 0 ? Math.ceil(historyState.total / historyState.pageSize) : 0);

    if (!silent && elements.historyStatus) {
      elements.historyStatus.textContent = historyState.total
        ? `${historyState.total} requêtes enregistrées.`
        : 'Aucune requête pour cette période.';
    }
  } catch (err) {
    if (!silent && elements.historyStatus) {
      elements.historyStatus.textContent = err?.message || 'Impossible de récupérer l’historique.';
    }
  } finally {
    historyState.loading = false;
  }

  renderHistory();
}

function handleRealtimeConsumptionUpdate(payload) {
  if (!payload || !currentAuthState) return;
  const timestamp = toDate(payload.timestamp) || new Date();

  const summaryMatchesWindow = (() => {
    const from = summaryState.filters.from;
    const to = summaryState.rangePreset === 'custom' ? summaryState.filters.to : null;
    if (from && timestamp < from) return false;
    if (to && timestamp > to) return false;
    return true;
  })();

  if (summaryState.data && summaryMatchesWindow) {
    summaryState.data.totalRequests = (summaryState.data.totalRequests ?? 0) + 1;
    summaryState.data.totalComputeWh = (summaryState.data.totalComputeWh ?? 0) + (payload.computeWh ?? 0);
    summaryState.data.totalNetworkWh = (summaryState.data.totalNetworkWh ?? 0) + (payload.networkWh ?? 0);
    summaryState.data.totalWh = (summaryState.data.totalWh ?? 0) + (payload.totalWh ?? 0);
    summaryState.data.totalKgCO2 = (summaryState.data.totalKgCO2 ?? 0) + (payload.kgCO2 ?? 0);
    summaryState.data.lastRecordAt = timestamp.toISOString();
    summaryState.data.updatedAt = new Date().toISOString();
    renderSummary();
  }

  if (historyState.page === 1) {
    const historyMatchesWindow = (() => {
      const from = historyState.filters.from;
      const to = historyState.filters.to;
      if (from && timestamp < from) return false;
      if (to && timestamp > to) return false;
      return true;
    })();

    if (historyMatchesWindow) {
      const existingIndex = historyState.items.findIndex(
        (item) => item.requestId && payload.requestId && item.requestId === payload.requestId,
      );

      const newRecord = {
        id: payload.requestId || `temp-${Date.now()}`,
        createdAt: new Date().toISOString(),
        eventTimestamp: timestamp.toISOString(),
        requestId: payload.requestId ?? null,
        url: payload.url ?? null,
        durationSec: payload.durationSec ?? null,
        promptChars: payload.promptChars ?? null,
        replyChars: payload.replyChars ?? null,
        requestBytes: payload.reqBytes ?? null,
        responseBytes: payload.respBytes ?? null,
        totalBytes: payload.totalBytes ?? null,
        computeWh: payload.computeWh ?? null,
        networkWh: payload.networkWh ?? null,
        totalWh: payload.totalWh ?? null,
        kgCO2: payload.kgCO2 ?? null,
        region: payload.region ?? null,
        kgPerKWh: payload.kgPerKWh ?? null,
      };

      if (existingIndex >= 0) {
        historyState.items.splice(existingIndex, 1, newRecord);
      } else {
        historyState.items = [newRecord, ...historyState.items];
        if (historyState.items.length > historyState.pageSize) {
          historyState.items.pop();
        }
        historyState.total += 1;
        historyState.totalPages = historyState.pageSize > 0
          ? Math.max(historyState.totalPages, Math.ceil(historyState.total / historyState.pageSize))
          : historyState.totalPages;
      }

      renderHistory();
    }
  }

  scheduleConsumptionRefresh();
}

function showAuthView() {
  elements.dashboardSection.classList.add('hidden');
  elements.authSection.classList.remove('hidden');
  setDashboardMessage('', null);
  if (elements.currentUserRole) {
    elements.currentUserRole.textContent = '';
  }
  resetConsumptionState();
  setActiveTab('overview');
  if (elements.authEmail) {
    elements.authEmail.focus();
  }
}

function showDashboard(state) {
  elements.authSection.classList.add('hidden');
  elements.dashboardSection.classList.remove('hidden');
  elements.currentUserEmail.textContent = state?.user?.email ?? '';
  setAuthMessage('', null);
  renderEstimation();
  renderSummary();
  renderHistory();
  setActiveTab('overview');
}

async function refreshAuthState({ preserveMessages = false } = {}) {
  let state = null;
  try {
    state = await ensureValidAccessToken(API_BASE_URL);
  } catch (err) {
    // ignore and fall back to stored state
  }
  if (!state) {
    state = await getAuthState();
  }

  if (state?.user) {
    const userChanged = currentAuthState?.user?.id !== state.user.id;
    currentAuthState = state;
    if (userChanged) {
      resetConsumptionState();
    }
    showDashboard(state);
    if (userChanged) {
      historyState.page = 1;
    }
    await Promise.all([
      loadSummary({ silent: true }),
      loadHistory({ page: historyState.page, silent: true }),
    ]);
  } else {
    currentAuthState = null;
    if (!preserveMessages) {
      setAuthMessage('', null);
    }
    showAuthView();
  }
  return state;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = elements.authEmail.value.trim().toLowerCase();
  const password = elements.authPassword.value;
  const confirm = elements.authPasswordConfirm.value;
  // Basic client-side validation before sending requests
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}/;

  if (!email || !password) {
    setAuthMessage('Veuillez renseigner votre e-mail et votre mot de passe.', 'error');
    return;
  }

  if (!emailRegex.test(email)) {
    setAuthMessage('Veuillez saisir une adresse e-mail valide.', 'error');
    elements.authEmail.focus();
    return;
  }

  if (!passwordRegex.test(password)) {
    setAuthMessage('Le mot de passe doit faire au moins 8 caractères et contenir une majuscule, une minuscule, un chiffre et un caractère spécial.', 'error');
    elements.authPassword.focus();
    return;
  }

  if (authMode === 'register' && password !== confirm) {
    setAuthMessage('Les mots de passe ne correspondent pas.', 'error');
    elements.authPasswordConfirm.focus();
    return;
  }

  authButtonController.setLoading(true);
  authButtonController.setDisabled(true);
  elements.toggleAuthMode.disabled = true;

  try {
    if (authMode === 'register') {
      await registerUser(API_BASE_URL, email, password);
    } else {
      await loginUser(API_BASE_URL, email, password);
    }
    elements.authPassword.value = '';
    elements.authPasswordConfirm.value = '';
    const state = await refreshAuthState({ preserveMessages: true });
    const successMessage = authMode === 'register'
      ? `Compte créé pour ${email}.`
      : `Connecté en tant que ${email}.`;
    if (state?.user) {
      setDashboardMessage(successMessage, 'success');
    } else {
      setAuthMessage(successMessage, 'success');
    }
  } catch (err) {
    setAuthMessage(err?.message || 'Une erreur est survenue.', 'error');
    elements.authPassword.value = '';
    elements.authPasswordConfirm.value = '';
    elements.authPassword.focus();
  } finally {
    authButtonController.setLoading(false);
    authButtonController.setDisabled(false);
    elements.toggleAuthMode.disabled = false;
  }
}

async function handleLogout() {
  elements.logoutButton.disabled = true;
  setDashboardMessage('Déconnexion…', null);
  let logoutError = null;
  try {
    await logoutUser(API_BASE_URL);
  } catch (err) {
    logoutError = err?.message || 'Impossible de se déconnecter.';
  }
  elements.logoutButton.disabled = false;
  await refreshAuthState();
  setAuthMode('login');
  if (logoutError) {
    setAuthMessage(logoutError, 'error');
  } else {
    setAuthMessage('Déconnecté.', 'success');
  }
}

async function hydrateEstimation() {
  try {
    const response = await browserApi.runtime.sendMessage({ type: 'gptcarbon:getLastEstimation' });
    if (response?.data) {
      lastEstimation = response.data;
      renderEstimation();
    }
  } catch (err) {
    // Pas de background actif, ignorer.
  }
}

function showEstimationLoader(show) {
  if (elements.estimationLoader) {
    elements.estimationLoader.classList.toggle('hidden', !show);
  }
  if (elements.estimation) {
    const content = elements.estimation.closest('.card-content');
    if (content) content.classList.toggle('hidden', show);
  }
}

function setupListeners() {
  authButtonController.setOnClick(handleAuthSubmit);
  elements.toggleAuthMode.addEventListener('click', () => {
    setAuthMode(authMode === 'register' ? 'login' : 'register');
  });
  elements.logoutButton.addEventListener('click', handleLogout);

  if (elements.themeToggle) {
    elements.themeToggle.addEventListener('click', () => {
      const nextPref = getNextThemePreference(themePreference);
      setThemePreference(nextPref);
    });
  }

  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab);
    });
  });

  if (elements.summaryForm) {
    elements.summaryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const from = parseDateTimeInput(elements.summaryFrom?.value || '');
      const to = parseDateTimeInput(elements.summaryTo?.value || '');
      if (from && to && from > to) {
        if (elements.summaryRefresh) {
          elements.summaryRefresh.title = 'La date de début doit précéder la date de fin.';
        }
        return;
      }
      summaryState.rangePreset = 'custom';
      summaryState.filters = { from, to };
      renderSummary();
      await loadSummary();
    });
  }

  if (Array.isArray(elements.summaryRangeButtons)) {
    elements.summaryRangeButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const preset = button?.dataset?.summaryRange;
        if (!preset) return;
        if (preset === 'custom') {
          await selectSummaryPreset('custom', { fetch: false });
          if (elements.summaryFrom) {
            elements.summaryFrom.focus();
          }
          return;
        }
        await selectSummaryPreset(preset);
      });
    });
  }

  if (elements.summaryReset) {
    elements.summaryReset.addEventListener('click', async () => {
      await selectSummaryPreset(DEFAULT_SUMMARY_PRESET);
    });
  }

  if (elements.summaryRefresh) {
    elements.summaryRefresh.addEventListener('click', async () => {
      await loadSummary({ silent: false });
    });
  }

  if (elements.historyForm) {
    elements.historyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const from = parseDateTimeInput(elements.historyFrom?.value || '');
      const to = parseDateTimeInput(elements.historyTo?.value || '');
      if (from && to && from > to) {
        if (elements.historyStatus) {
          elements.historyStatus.textContent = 'La date de début doit précéder la date de fin.';
        }
        return;
      }
      historyState.filters = { from, to };
      historyState.pageSize = Number.parseInt(elements.historyPageSize?.value || `${historyState.pageSize}`, 10) || historyState.pageSize;
      historyState.page = 1;
      await loadHistory();
    });
  }

  if (elements.historyReset) {
    elements.historyReset.addEventListener('click', async () => {
      historyState.filters = { from: null, to: null };
      historyState.page = 1;
      historyState.pageSize = DEFAULT_HISTORY_PAGE_SIZE;
      if (elements.historyFrom) elements.historyFrom.value = '';
      if (elements.historyTo) elements.historyTo.value = '';
      if (elements.historyPageSize) elements.historyPageSize.value = String(DEFAULT_HISTORY_PAGE_SIZE);
      await loadHistory();
    });
  }

  if (elements.historyPrev) {
    elements.historyPrev.addEventListener('click', async () => {
      if (historyState.page <= 1) return;
      await loadHistory({ page: historyState.page - 1 });
    });
  }

  if (elements.historyNext) {
    elements.historyNext.addEventListener('click', async () => {
      if (historyState.page >= historyState.totalPages) return;
      await loadHistory({ page: historyState.page + 1 });
    });
  }

  if (elements.historyPageSize) {
    elements.historyPageSize.addEventListener('change', async () => {
      const newSize = Number.parseInt(elements.historyPageSize.value, 10);
      if (!Number.isFinite(newSize)) return;
      historyState.pageSize = Math.max(1, Math.min(100, Math.trunc(newSize)));
      historyState.page = 1;
      await loadHistory();
    });
  }

  browserApi.runtime.onMessage.addListener((message) => {
    if (message?.type === 'gptcarbon:estimation' && message.data) {
      lastEstimation = message.data;
      renderEstimation();
      handleRealtimeConsumptionUpdate(message.data);
    }
  });
}

function setupPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPassword = input.getAttribute('type') === 'password';
      input.setAttribute('type', isPassword ? 'text' : 'password');
      // Update icon after toggling type
      const newIsPassword = input.getAttribute('type') === 'password';
      const iconSrc = newIsPassword
        ? '../images/eye-open.svg'
        : '../images/eye-close.svg';
      btn.innerHTML = `<img src="${iconSrc}" alt="" style="width:1em;height:1em;vertical-align:middle;">`;
      btn.setAttribute(
        'aria-label',
        newIsPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
      );
    });
    // Set initial icon
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (input) {
      const isPassword = input.getAttribute('type') === 'password';
      const iconSrc = isPassword
        ? '../images/eye-open.svg'
        : '../images/eye-close.svg';
      btn.innerHTML = `<img src="${iconSrc}" alt="" style="width:1em;height:1em;vertical-align:middle;">`;
    }
  });
}

async function init() {
  setAuthMode('login');
  renderSummary();
  renderHistory();
  setupListeners();
  setupPasswordToggles();
  await hydrateEstimation();
  await refreshAuthState();
}

init();
