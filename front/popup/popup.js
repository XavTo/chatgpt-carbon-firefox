import {
  loginUser,
  registerUser,
  logoutUser,
  getAuthState,
  ensureValidAccessToken,
  authenticatedRequest,
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
  estimation: document.getElementById('estimation'),
  tabsContainer: document.getElementById('dashboardTabs'),
  overviewTab: document.getElementById('overviewTab'),
  historyTab: document.getElementById('historyTab'),
  summaryWindow: document.getElementById('summaryWindow'),
  summaryFrom: document.getElementById('summaryFrom'),
  summaryTo: document.getElementById('summaryTo'),
  summaryRefresh: document.getElementById('summaryRefresh'),
  summaryMessage: document.getElementById('summaryMessage'),
  summaryRequests: document.getElementById('summaryRequests'),
  summaryEnergy: document.getElementById('summaryEnergy'),
  summaryEmissions: document.getElementById('summaryEmissions'),
  summaryDuration: document.getElementById('summaryDuration'),
  summaryData: document.getElementById('summaryData'),
  historyFilters: document.getElementById('historyFilters'),
  historyFrom: document.getElementById('historyFrom'),
  historyTo: document.getElementById('historyTo'),
  historySearch: document.getElementById('historySearch'),
  historyReset: document.getElementById('historyReset'),
  historyMessage: document.getElementById('historyMessage'),
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
let authenticatedState = null;
let currentTab = 'overview';
let historyLoaded = false;
let summaryReloadTimeout = null;
let summaryAutoRefreshInterval = null;

const SUMMARY_AUTO_REFRESH_MS = 15000;

const summaryState = {
  window: '24h',
  from: null,
  to: null,
};

const historyState = {
  page: 1,
  pageSize: 10,
  from: null,
  to: null,
  search: '',
  totalPages: 1,
};

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

function formatBytesValue(value) {
  if (!value) {
    return '0 B';
  }
  try {
    const big = typeof value === 'bigint' ? value : BigInt(value);
    if (big <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return fmtBytes(Number(big));
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let current = big;
    let unitIndex = 0;
    const base = 1024n;
    while (current >= base && unitIndex < units.length - 1) {
      current /= base;
      unitIndex += 1;
    }
    return `${current.toString()} ${units[unitIndex]}`;
  } catch (err) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return fmtBytes(numeric);
    }
    return '—';
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function setSummaryMessage(text, variant) {
  if (!elements.summaryMessage) return;
  elements.summaryMessage.textContent = text || '';
  elements.summaryMessage.classList.remove('error', 'success');
  if (variant) {
    elements.summaryMessage.classList.add(variant);
  }
}

function setHistoryMessage(text, variant) {
  if (!elements.historyMessage) return;
  elements.historyMessage.textContent = text || '';
  elements.historyMessage.classList.remove('error', 'success');
  if (variant) {
    elements.historyMessage.classList.add(variant);
  }
}

function updateSummaryControls() {
  if (!elements.summaryWindow || !elements.summaryFrom || !elements.summaryTo) return;
  const isCustom = summaryState.window === 'custom';
  elements.summaryFrom.classList.toggle('hidden', !isCustom);
  elements.summaryTo.classList.toggle('hidden', !isCustom);
}

function computeSummaryRange() {
  const now = new Date();
  if (summaryState.window === 'custom') {
    const from = parseDateTimeLocal(elements.summaryFrom?.value || '');
    const to = parseDateTimeLocal(elements.summaryTo?.value || '');
    return { from, to };
  }

  switch (summaryState.window) {
    case '24h':
      return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
    case '7d':
      return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
    case '30d':
      return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

function renderSummary(data) {
  if (
    !elements.summaryRequests ||
    !elements.summaryEnergy ||
    !elements.summaryEmissions ||
    !elements.summaryDuration ||
    !elements.summaryData
  ) {
    return;
  }
  if (!data) {
    elements.summaryRequests.textContent = '—';
    elements.summaryEnergy.textContent = '—';
    elements.summaryEmissions.textContent = '—';
    elements.summaryDuration.textContent = '—';
    elements.summaryData.textContent = '—';
    return;
  }

  elements.summaryRequests.textContent = data.totalRequests?.toLocaleString?.() ?? '0';
  elements.summaryEnergy.textContent = fmt(data.totalWh ?? data.totalComputeWh ?? 0, 2);
  elements.summaryEmissions.textContent = fmt(data.totalKgCO2 ?? 0, 4);
  elements.summaryDuration.textContent = fmt(data.totalDurationSec ?? 0, 1);
  elements.summaryData.textContent = formatBytesValue(data.totalBytes ?? '0');
}

async function loadUsageSummary({ silent = false } = {}) {
  if (!authenticatedState) {
    return;
  }
  const range = computeSummaryRange();

  if (summaryState.window === 'custom') {
    if ((range.from && range.to && range.from > range.to) || (!range.from && !range.to)) {
      if (!silent) {
        setSummaryMessage('Veuillez sélectionner un intervalle valide.', 'error');
      }
      return;
    }
  }

  const params = new URLSearchParams();
  if (summaryState.window && summaryState.window !== 'custom') {
    params.set('window', summaryState.window);
  }
  if (range.from) {
    params.set('from', range.from.toISOString());
  }
  if (range.to) {
    params.set('to', range.to.toISOString());
  }

  try {
    const data = await authenticatedRequest(
      API_BASE_URL,
      `/usage/summary${params.toString() ? `?${params.toString()}` : ''}`,
      { method: 'GET' },
    );
    renderSummary(data);
    if (!silent) {
      setSummaryMessage('', null);
    }
  } catch (err) {
    if (!silent) {
      setSummaryMessage(err?.message || 'Impossible de récupérer la consommation.', 'error');
    }
  }
}

function renderHistory(data) {
  if (!elements.historyTableBody || !elements.historyEmpty) {
    return;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  elements.historyTableBody.innerHTML = '';

  if (items.length === 0) {
    elements.historyEmpty.classList.remove('hidden');
  } else {
    elements.historyEmpty.classList.add('hidden');
    const rows = items.map((item) => {
      const occurredAt = formatDateTime(item.occurredAt || item.createdAt);
      const duration = fmt(item.durationSec ?? 0, 2);
      const energy = fmt(item.totalWh ?? item.computeWh ?? 0, 3);
      const emissions = fmt(item.kgCO2 ?? 0, 4);
      const dataTransfer = formatBytesValue(item.totalBytes ?? '0');
      const region = item.region || '—';
      return `
        <tr>
          <td title="${item.url || ''}">${occurredAt}</td>
          <td>${duration}</td>
          <td>${energy}</td>
          <td>${emissions}</td>
          <td>${dataTransfer}</td>
          <td>${region}</td>
        </tr>
      `;
    });
    elements.historyTableBody.innerHTML = rows.join('');
  }

  historyState.page = data?.page ?? historyState.page;
  historyState.totalPages = data?.totalPages ?? historyState.totalPages;

  if (elements.historyPageInfo) {
    elements.historyPageInfo.textContent = `Page ${historyState.page} / ${historyState.totalPages}`;
  }
  if (elements.historyPrev) {
    elements.historyPrev.disabled = historyState.page <= 1;
  }
  if (elements.historyNext) {
    elements.historyNext.disabled = historyState.page >= historyState.totalPages;
  }
}

async function loadUsageHistory({ resetPage = false } = {}) {
  if (!authenticatedState) {
    return;
  }
  if (resetPage) {
    historyState.page = 1;
  }

  if (historyState.from && historyState.to && historyState.from > historyState.to) {
    setHistoryMessage('La date de début doit précéder la date de fin.', 'error');
    return;
  }

  const params = new URLSearchParams({
    page: String(historyState.page),
    pageSize: String(historyState.pageSize),
  });

  if (historyState.from) {
    params.set('from', historyState.from.toISOString());
  }
  if (historyState.to) {
    params.set('to', historyState.to.toISOString());
  }
  if (historyState.search) {
    params.set('search', historyState.search);
  }

  try {
    const data = await authenticatedRequest(
      API_BASE_URL,
      `/usage?${params.toString()}`,
      { method: 'GET' },
    );
    renderHistory(data);
    setHistoryMessage('', null);
    historyLoaded = true;
  } catch (err) {
    setHistoryMessage(err?.message || 'Impossible de récupérer l\'historique.', 'error');
  }
}

function switchTab(tab) {
  currentTab = tab;
  const buttons = elements.tabsContainer?.querySelectorAll?.('.tab-button') ?? [];
  buttons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tab);
  });

  if (elements.overviewTab) {
    elements.overviewTab.classList.toggle('hidden', tab !== 'overview');
  }
  if (elements.historyTab) {
    elements.historyTab.classList.toggle('hidden', tab !== 'history');
  }

  if (tab === 'history' && !historyLoaded) {
    loadUsageHistory({ resetPage: false });
  }
}

function stopSummaryAutoRefresh() {
  if (summaryAutoRefreshInterval) {
    clearInterval(summaryAutoRefreshInterval);
    summaryAutoRefreshInterval = null;
  }
  if (summaryReloadTimeout) {
    clearTimeout(summaryReloadTimeout);
    summaryReloadTimeout = null;
  }
}

function startSummaryAutoRefresh() {
  stopSummaryAutoRefresh();
  summaryAutoRefreshInterval = setInterval(() => {
    if (currentTab === 'overview' && authenticatedState) {
      loadUsageSummary({ silent: true });
    }
  }, SUMMARY_AUTO_REFRESH_MS);
}

function scheduleSummaryRefresh(delay = 1000) {
  if (summaryReloadTimeout) {
    clearTimeout(summaryReloadTimeout);
  }
  summaryReloadTimeout = setTimeout(() => {
    loadUsageSummary({ silent: true });
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

function showAuthView() {
  authenticatedState = null;
  stopSummaryAutoRefresh();
  elements.dashboardSection.classList.add('hidden');
  elements.authSection.classList.remove('hidden');
  setDashboardMessage('', null);
  setSummaryMessage('', null);
  setHistoryMessage('', null);
  renderSummary(null);
  if (elements.historyTableBody) {
    elements.historyTableBody.innerHTML = '';
  }
  if (elements.historyEmpty) {
    elements.historyEmpty.classList.add('hidden');
  }
  if (elements.authEmail) {
    elements.authEmail.focus();
  }
}

function showDashboard(state) {
  authenticatedState = state;
  elements.authSection.classList.add('hidden');
  elements.dashboardSection.classList.remove('hidden');
  elements.currentUserEmail.textContent = state?.user?.email ?? '';
  setAuthMessage('', null);
  renderEstimation();
  historyLoaded = false;
  historyState.page = 1;
  historyState.totalPages = 1;
  if (elements.historyFrom) elements.historyFrom.value = '';
  if (elements.historyTo) elements.historyTo.value = '';
  if (elements.historySearch) elements.historySearch.value = '';
  historyState.from = null;
  historyState.to = null;
  historyState.search = '';
  if (elements.historyPageInfo) {
    elements.historyPageInfo.textContent = 'Page 1 / 1';
  }
  if (elements.historyPrev) {
    elements.historyPrev.disabled = true;
  }
  if (elements.historyNext) {
    elements.historyNext.disabled = true;
  }
  if (elements.summaryWindow) {
    elements.summaryWindow.value = '24h';
  }
  summaryState.window = elements.summaryWindow?.value || '24h';
  updateSummaryControls();
  setSummaryMessage('', null);
  setHistoryMessage('', null);
  currentTab = 'overview';
  switchTab(currentTab);
  loadUsageSummary();
  startSummaryAutoRefresh();
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
    const sameUser = authenticatedState?.user?.id && authenticatedState.user.id === state.user.id;
    const dashboardVisible = !elements.dashboardSection.classList.contains('hidden');
    if (sameUser && dashboardVisible) {
      authenticatedState = state;
    } else {
      showDashboard(state);
    }
  } else {
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

  browserApi.runtime.onMessage.addListener((message) => {
    if (message?.type === 'gptcarbon:estimation' && message.data) {
      lastEstimation = message.data;
      renderEstimation();
      scheduleSummaryRefresh(800);
    }
  });

  if (elements.tabsContainer) {
    const buttons = elements.tabsContainer.querySelectorAll('.tab-button');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.getAttribute('data-tab') || 'overview';
        switchTab(tab);
      });
    });
  }

  if (elements.summaryWindow) {
    elements.summaryWindow.addEventListener('change', (event) => {
      summaryState.window = event.target.value;
      updateSummaryControls();
      if (summaryState.window !== 'custom') {
        loadUsageSummary();
      }
    });
  }

  if (elements.summaryRefresh) {
    elements.summaryRefresh.addEventListener('click', () => {
      loadUsageSummary();
    });
  }

  if (elements.summaryFrom) {
    elements.summaryFrom.addEventListener('change', () => {
      if (summaryState.window === 'custom') {
        scheduleSummaryRefresh(400);
      }
    });
  }

  if (elements.summaryTo) {
    elements.summaryTo.addEventListener('change', () => {
      if (summaryState.window === 'custom') {
        scheduleSummaryRefresh(400);
      }
    });
  }

  if (elements.historyFilters) {
    elements.historyFilters.addEventListener('submit', (event) => {
      event.preventDefault();
      historyState.from = parseDateTimeLocal(elements.historyFrom?.value || '') || null;
      historyState.to = parseDateTimeLocal(elements.historyTo?.value || '') || null;
      historyState.search = (elements.historySearch?.value || '').trim();
      loadUsageHistory({ resetPage: true });
    });
  }

  if (elements.historyReset) {
    elements.historyReset.addEventListener('click', () => {
      if (elements.historyFrom) elements.historyFrom.value = '';
      if (elements.historyTo) elements.historyTo.value = '';
      if (elements.historySearch) elements.historySearch.value = '';
      historyState.from = null;
      historyState.to = null;
      historyState.search = '';
      loadUsageHistory({ resetPage: true });
    });
  }

  if (elements.historyPrev) {
    elements.historyPrev.addEventListener('click', () => {
      if (historyState.page > 1) {
        historyState.page -= 1;
        loadUsageHistory();
      }
    });
  }

  if (elements.historyNext) {
    elements.historyNext.addEventListener('click', () => {
      if (historyState.page < historyState.totalPages) {
        historyState.page += 1;
        loadUsageHistory();
      }
    });
  }
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
  setupListeners();
  setupPasswordToggles();
  summaryState.window = elements.summaryWindow?.value || summaryState.window;
  updateSummaryControls();
  await hydrateEstimation();
  await refreshAuthState();
}

init();
