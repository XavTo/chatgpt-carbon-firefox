import {
  loginUser,
  registerUser,
  logoutUser,
  getAuthState,
  ensureValidAccessToken,
  clearAuthState,
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
  serverUrl: document.getElementById('serverUrl'),
  logoutButton: document.getElementById('logoutButton'),
  dashboardTabs: document.getElementById('dashboardTabs'),
  tabOverview: document.getElementById('tabOverview'),
  tabHistory: document.getElementById('tabHistory'),
  summaryWindow: document.getElementById('summaryWindow'),
  summaryCustomRange: document.getElementById('summaryCustomRange'),
  summaryFrom: document.getElementById('summaryFrom'),
  summaryTo: document.getElementById('summaryTo'),
  summaryApply: document.getElementById('summaryApply'),
  summaryCount: document.getElementById('summaryCount'),
  summaryTotalWh: document.getElementById('summaryTotalWh'),
  summaryKgCO2: document.getElementById('summaryKgCO2'),
  summaryDuration: document.getElementById('summaryDuration'),
  summaryRangeInfo: document.getElementById('summaryRangeInfo'),
  estimation: document.getElementById('estimation'),
  historyFrom: document.getElementById('historyFrom'),
  historyTo: document.getElementById('historyTo'),
  historyApply: document.getElementById('historyApply'),
  historyReset: document.getElementById('historyReset'),
  historyTableBody: document.getElementById('historyTableBody'),
  historyEmpty: document.getElementById('historyEmpty'),
  historyPrev: document.getElementById('historyPrev'),
  historyNext: document.getElementById('historyNext'),
  historyPageInfo: document.getElementById('historyPageInfo'),
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
let currentTab = 'overview';
let summaryState = null;
let summaryFilters = {
  mode: 'window',
  windowMinutes: 1440,
  from: null,
  to: null,
};
let historyState = {
  items: [],
  page: 1,
  limit: 10,
  totalPages: 1,
  total: 0,
};
let historyFilters = {
  from: null,
  to: null,
};
let historyLoaded = false;

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

function fmtDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return date.toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(seconds) {
  const total = Number(seconds) || 0;
  if (total <= 0) {
    return '0 s';
  }
  if (total < 60) {
    return `${fmt(total, 1)} s`;
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const parts = [];
  if (hours) parts.push(`${hours} h`);
  if (minutes) parts.push(`${minutes} min`);
  if (!hours && secs) parts.push(`${secs} s`);
  return parts.join(' ') || '0 s';
}

function describeSummaryRange(fromIso, toIso) {
  if (!fromIso && !toIso) {
    return 'Période : depuis le début';
  }

  const from = fromIso ? new Date(fromIso) : null;
  const to = toIso ? new Date(toIso) : null;

  if (from && to) {
    return `Période : ${fmtDateTime(from)} → ${fmtDateTime(to)}`;
  }
  if (from) {
    return `Période : depuis ${fmtDateTime(from)}`;
  }
  if (to) {
    return `Période : jusqu’au ${fmtDateTime(to)}`;
  }
  return 'Période : —';
}

function resetDashboardData() {
  currentTab = 'overview';
  summaryState = null;
  summaryFilters = {
    mode: 'window',
    windowMinutes: 1440,
    from: null,
    to: null,
  };
  historyState = {
    items: [],
    page: 1,
    limit: 10,
    totalPages: 1,
    total: 0,
  };
  historyFilters = { from: null, to: null };
  historyLoaded = false;

  if (elements.summaryWindow) {
    elements.summaryWindow.value = '1440';
  }
  if (elements.summaryCustomRange) {
    elements.summaryCustomRange.classList.add('hidden');
  }
  if (elements.summaryFrom) elements.summaryFrom.value = '';
  if (elements.summaryTo) elements.summaryTo.value = '';

  if (elements.historyFrom) elements.historyFrom.value = '';
  if (elements.historyTo) elements.historyTo.value = '';

  if (elements.tabOverview) elements.tabOverview.classList.remove('hidden');
  if (elements.tabHistory) elements.tabHistory.classList.add('hidden');
  if (elements.dashboardTabs) {
    elements.dashboardTabs.querySelectorAll('.tab-button').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === 'overview');
    });
  }

  renderSummary();
  renderHistory();
}

function parseDateInput(value, { endOfDay = false } = {}) {
  if (!value) return null;
  const timePart = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const date = new Date(`${value}${timePart}`);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toISOString();
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toISOString();
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
}

function renderSummary() {
  if (!elements.summaryCount) return;
  if (!summaryState) {
    elements.summaryCount.textContent = '0';
    elements.summaryTotalWh.textContent = '0 Wh';
    elements.summaryKgCO2.textContent = '0 kgCO₂';
    elements.summaryDuration.textContent = '0 s';
    elements.summaryRangeInfo.textContent = 'Période : —';
    return;
  }

  elements.summaryCount.textContent = String(summaryState.count ?? 0);
  elements.summaryTotalWh.textContent = `${fmt(summaryState.totalWh ?? 0, 2)} Wh`;
  elements.summaryKgCO2.textContent = `${fmt(summaryState.totalKgCO2 ?? 0, 4)} kgCO₂`;
  elements.summaryDuration.textContent = fmtDuration(summaryState.totalDurationSec ?? 0);
  elements.summaryRangeInfo.textContent = describeSummaryRange(summaryState.from, summaryState.to);
}

function renderHistory() {
  if (!elements.historyTableBody || !elements.historyEmpty) return;
  const items = Array.isArray(historyState.items) ? historyState.items : [];
  elements.historyTableBody.innerHTML = '';

  if (items.length === 0) {
    elements.historyEmpty.classList.remove('hidden');
  } else {
    elements.historyEmpty.classList.add('hidden');
    items.forEach((item) => {
      const tr = document.createElement('tr');
      const dateCell = document.createElement('td');
      dateCell.textContent = fmtDateTime(item.occurredAt);
      const energyCell = document.createElement('td');
      energyCell.textContent = fmt(item.totalWh, 3);
      const co2Cell = document.createElement('td');
      co2Cell.textContent = fmt(item.kgCO2, 4);
      const durationCell = document.createElement('td');
      durationCell.textContent = fmtDuration(item.durationSec);
      tr.append(dateCell, energyCell, co2Cell, durationCell);
      elements.historyTableBody.appendChild(tr);
    });
  }

  if (elements.historyPrev) {
    elements.historyPrev.disabled = historyState.page <= 1;
  }
  if (elements.historyNext) {
    elements.historyNext.disabled = historyState.page >= historyState.totalPages;
  }
  if (elements.historyPageInfo) {
    elements.historyPageInfo.textContent = `Page ${historyState.page} / ${historyState.totalPages} · ${historyState.total} éléments`;
  }
}

function setActiveTab(tab) {
  currentTab = tab === 'history' ? 'history' : 'overview';

  if (elements.tabOverview) {
    elements.tabOverview.classList.toggle('hidden', currentTab !== 'overview');
  }
  if (elements.tabHistory) {
    elements.tabHistory.classList.toggle('hidden', currentTab !== 'history');
  }

  if (elements.dashboardTabs) {
    elements.dashboardTabs.querySelectorAll('.tab-button').forEach((btn) => {
      const buttonTab = btn.getAttribute('data-tab');
      btn.classList.toggle('active', buttonTab === currentTab);
    });
  }

  if (currentTab === 'history' && !historyLoaded) {
    historyLoaded = true;
    loadHistory().catch((err) => {
      setDashboardMessage(err?.message || 'Impossible de charger l’historique.', 'error');
    });
  }
}

function showAuthView() {
  elements.dashboardSection.classList.add('hidden');
  elements.authSection.classList.remove('hidden');
  setDashboardMessage('', null);
  resetDashboardData();
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
  setActiveTab(currentTab);
  renderSummary();
  refreshConsumptionSummary({ silent: true }).catch((err) => {
    setDashboardMessage(err?.message || 'Impossible de charger la consommation.', 'error');
  });
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
    currentAuthState = state;
    showDashboard(state);
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

async function apiRequest(path, { method = 'GET', searchParams, body } = {}) {
  const state = await ensureValidAccessToken(API_BASE_URL);
  if (!state || !state.accessToken) {
    currentAuthState = null;
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

  currentAuthState = state;
  const url = new URL(path, API_BASE_URL);
  if (searchParams && typeof searchParams === 'object') {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `${state.tokenType || 'Bearer'} ${state.accessToken}`,
  };

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      // ignore JSON parse errors
    }
  }

  if (response.status === 401) {
    await clearAuthState();
    currentAuthState = null;
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

  if (!response.ok) {
    const message = data?.message || data?.error || `Erreur ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function refreshConsumptionSummary({ silent = false } = {}) {
  try {
    const params = {};
    if (summaryFilters.mode === 'window' && summaryFilters.windowMinutes) {
      params.windowMinutes = summaryFilters.windowMinutes;
    } else if (summaryFilters.mode === 'custom') {
      if (summaryFilters.from) params.from = summaryFilters.from;
      if (summaryFilters.to) params.to = summaryFilters.to;
    }

    const data = await apiRequest('/consumption/summary', { searchParams: params });
    summaryState = data || null;
    renderSummary();
  } catch (err) {
    summaryState = null;
    renderSummary();
    if (!silent) {
      setDashboardMessage(err?.message || 'Impossible de récupérer la consommation.', 'error');
    }
    throw err;
  }
}

async function loadHistory({ page } = {}) {
  const targetPage = page ? Math.max(1, page) : historyState.page || 1;
  try {
    const params = {
      page: targetPage,
      limit: historyState.limit,
    };
    if (historyFilters.from) params.from = historyFilters.from;
    if (historyFilters.to) params.to = historyFilters.to;

    const data = await apiRequest('/consumption/history', { searchParams: params });
    historyState = {
      items: data?.items ?? [],
      page: data?.page ?? targetPage,
      limit: data?.limit ?? historyState.limit,
      totalPages: data?.totalPages ?? 1,
      total: data?.total ?? 0,
    };
    renderHistory();
  } catch (err) {
    if (err?.message) {
      setDashboardMessage(err.message, 'error');
    }
    throw err;
  }
}

function handleSummaryWindowChange() {
  if (!elements.summaryWindow) return;
  const value = elements.summaryWindow.value;

  if (value === 'custom') {
    summaryFilters.mode = 'custom';
    if (elements.summaryCustomRange) {
      elements.summaryCustomRange.classList.remove('hidden');
    }
    return;
  }

  if (elements.summaryCustomRange) {
    elements.summaryCustomRange.classList.add('hidden');
  }

  if (value === 'all') {
    summaryFilters = {
      mode: 'all',
      windowMinutes: null,
      from: null,
      to: null,
    };
  } else {
    const minutes = Number(value);
    summaryFilters = {
      mode: 'window',
      windowMinutes: Number.isFinite(minutes) ? minutes : 1440,
      from: null,
      to: null,
    };
  }

  refreshConsumptionSummary().catch(() => {});
}

async function handleSummaryApply() {
  if (!elements.summaryFrom || !elements.summaryTo) return;

  const fromIso = parseDateTimeLocal(elements.summaryFrom.value);
  const toIso = parseDateTimeLocal(elements.summaryTo.value);

  if (!fromIso && !toIso) {
    setDashboardMessage('Veuillez sélectionner au moins une date pour la période personnalisée.', 'error');
    return;
  }

  if (fromIso && toIso && new Date(fromIso) > new Date(toIso)) {
    setDashboardMessage('La date de début doit précéder la date de fin.', 'error');
    return;
  }

  summaryFilters = {
    mode: 'custom',
    windowMinutes: null,
    from: fromIso,
    to: toIso,
  };

  if (elements.summaryWindow) {
    elements.summaryWindow.value = 'custom';
  }

  try {
    await refreshConsumptionSummary();
  } catch (err) {
    // message already handled in refreshConsumptionSummary
  }
}

async function handleHistoryApply() {
  const fromIso = parseDateInput(elements.historyFrom?.value || '', { endOfDay: false });
  const toIso = parseDateInput(elements.historyTo?.value || '', { endOfDay: true });

  if (fromIso && toIso && new Date(fromIso) > new Date(toIso)) {
    setDashboardMessage('La date de début doit précéder la date de fin.', 'error');
    return;
  }

  historyFilters = { from: fromIso, to: toIso };
  historyState.page = 1;
  try {
    await loadHistory({ page: 1 });
  } catch (err) {
    // message already handled
  }
}

async function handleHistoryReset() {
  historyFilters = { from: null, to: null };
  if (elements.historyFrom) elements.historyFrom.value = '';
  if (elements.historyTo) elements.historyTo.value = '';
  historyState.page = 1;
  try {
    await loadHistory({ page: 1 });
  } catch (err) {
    // message already handled
  }
}

async function handleHistoryPrev() {
  if (historyState.page <= 1) return;
  try {
    await loadHistory({ page: historyState.page - 1 });
  } catch (err) {
    // handled elsewhere
  }
}

async function handleHistoryNext() {
  if (historyState.page >= historyState.totalPages) return;
  try {
    await loadHistory({ page: historyState.page + 1 });
  } catch (err) {
    // handled elsewhere
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

  if (elements.dashboardTabs) {
    elements.dashboardTabs.addEventListener('click', (event) => {
      const button = event.target.closest('.tab-button');
      if (!button) return;
      const tab = button.getAttribute('data-tab');
      if (tab) {
        setActiveTab(tab);
      }
    });
  }

  if (elements.summaryWindow) {
    elements.summaryWindow.addEventListener('change', handleSummaryWindowChange);
  }
  if (elements.summaryApply) {
    elements.summaryApply.addEventListener('click', handleSummaryApply);
  }
  if (elements.historyApply) {
    elements.historyApply.addEventListener('click', handleHistoryApply);
  }
  if (elements.historyReset) {
    elements.historyReset.addEventListener('click', handleHistoryReset);
  }
  if (elements.historyPrev) {
    elements.historyPrev.addEventListener('click', handleHistoryPrev);
  }
  if (elements.historyNext) {
    elements.historyNext.addEventListener('click', handleHistoryNext);
  }

  browserApi.runtime.onMessage.addListener((message) => {
    if (message?.type === 'gptcarbon:estimation' && message.data) {
      lastEstimation = message.data;
      renderEstimation();
      refreshConsumptionSummary({ silent: true }).catch(() => {});
      if (currentTab === 'history' && historyState.page === 1) {
        loadHistory({ page: 1 }).catch(() => {});
      }
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
  resetDashboardData();
  setupListeners();
  setupPasswordToggles();
  await hydrateEstimation();
  await refreshAuthState();
}

init();
