import {
  loginUser,
  registerUser,
  logoutUser,
  getAuthState,
  ensureValidAccessToken,
  API_BASE_URL,
} from '../lib/auth.js';

const browserApi = typeof browser !== 'undefined' ? browser : chrome;

const elements = {
  authSection: document.getElementById('authSection'),
  authMessage: document.getElementById('authMessage'),
  authEmail: document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  authPasswordConfirmRow: document.getElementById('authPasswordConfirmRow'),
  authPasswordConfirm: document.getElementById('authPasswordConfirm'),
  authSubmit: document.getElementById('authSubmit'),
  toggleAuthMode: document.getElementById('toggleAuthMode'),
  dashboardSection: document.getElementById('dashboardSection'),
  dashboardMessage: document.getElementById('dashboardMessage'),
  currentUserEmail: document.getElementById('currentUserEmail'),
  serverUrl: document.getElementById('serverUrl'),
  logoutButton: document.getElementById('logoutButton'),
  estimation: document.getElementById('estimation'),
};

if (elements.serverUrl) {
  elements.serverUrl.textContent = API_BASE_URL;
}

let authMode = 'login';
let lastEstimation = null;

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

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === 'register';
  elements.authPasswordConfirmRow.classList.toggle('hidden', !isRegister);
  elements.authSubmit.textContent = isRegister ? 'Créer un compte' : 'Se connecter';
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

  elements.authSubmit.disabled = true;
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
    elements.authSubmit.disabled = false;
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
  elements.authSubmit.addEventListener('click', handleAuthSubmit);
  elements.toggleAuthMode.addEventListener('click', () => {
    setAuthMode(authMode === 'register' ? 'login' : 'register');
  });
  elements.logoutButton.addEventListener('click', handleLogout);

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
