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
  serverUrl: document.getElementById('serverUrl'),
  logoutButton: document.getElementById('logoutButton'),
  estimation: document.getElementById('estimation'),
};

const THEME_STORAGE_KEY = 'gptcarbon:themePreference';
const THEME_CYCLE = ['system', 'light', 'dark'];
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

let themePreference = loadThemePreference();
setThemePreference(themePreference, { persist: false });

if (typeof prefersDarkScheme.addEventListener === 'function') {
  prefersDarkScheme.addEventListener('change', () => {
    if (themePreference === 'system') {
      applyTheme('system');
    }
  });
} else if (typeof prefersDarkScheme.addListener === 'function') {
  prefersDarkScheme.addListener(() => {
    if (themePreference === 'system') {
      applyTheme('system');
    }
  });
}

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
  return 'system';
}

function saveThemePreference(pref) {
  try {
    if (pref === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    }
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
  if (pref === 'system') {
    return `Thème auto (${resolved === 'dark' ? 'sombre' : 'clair'})`;
  }
  return `Thème ${pref === 'dark' ? 'sombre' : 'clair'}`;
}

function actionDescription(pref) {
  if (pref === 'system') {
    return 'revenir au thème automatique';
  }
  return `passer au thème ${pref === 'dark' ? 'sombre' : 'clair'}`;
}

function iconForPreference(pref) {
  if (pref === 'system') {
    return '🖥️';
  }
  return pref === 'dark' ? '🌙' : '☀️';
}

function getNextThemePreference(current) {
  const index = THEME_CYCLE.indexOf(current);
  if (index === -1) {
    return 'system';
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
  elements.dashboardSection.classList.add('hidden');
  elements.authSection.classList.remove('hidden');
  setDashboardMessage('', null);
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
    showDashboard(state);
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

  if (!email || !password) {
    setAuthMessage('Veuillez renseigner votre e-mail et votre mot de passe.', 'error');
    return;
  }

  if (authMode === 'register' && password !== confirm) {
    setAuthMessage('Les mots de passe ne correspondent pas.', 'error');
    return;
  }

  const pendingMessage = authMode === 'register' ? 'Création du compte…' : 'Connexion…';
  setAuthMessage(pendingMessage, null);

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
    }
  });
}

async function init() {
  setAuthMode('login');
  setupListeners();
  await hydrateEstimation();
  await refreshAuthState();
}

init();
