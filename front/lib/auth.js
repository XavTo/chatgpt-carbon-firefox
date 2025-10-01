const browserApi = typeof browser !== 'undefined'
  ? browser
  : (typeof chrome !== 'undefined' ? chrome : null);
const AUTH_STORAGE_KEY = 'authState';

function resolveRawApiBaseUrl() {
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : window;
  const envFromProcess = globalScope?.process?.env?.GPTCARBON_API_BASE_URL;
  const envFromWindow = globalScope?.GPTCARBON_API_BASE_URL;
  const envFromConfig = globalScope?.__GPTCARBON_CONFIG__?.API_BASE_URL;
  const viteEnv = typeof import.meta !== 'undefined'
    ? import.meta?.env?.VITE_GPTCARBON_API_BASE_URL
    : undefined;

  return envFromWindow || envFromProcess || envFromConfig || viteEnv || 'http://localhost:3000';
}

const RAW_API_BASE_URL = resolveRawApiBaseUrl();

function normalizeBaseUrl(url) {
  if (!url) return '';
  return url.replace(/\/$/, '');
}

export const API_BASE_URL = normalizeBaseUrl(RAW_API_BASE_URL);
export const EVENTS_URL = `${API_BASE_URL}/events`;

function resolveBaseUrl(candidate) {
  const base = normalizeBaseUrl(candidate || API_BASE_URL);
  if (!base) {
    throw new Error("URL de l'API invalide");
  }
  return base;
}

async function getLocalStorage() {
  if (!browserApi?.storage?.local) {
    throw new Error('Stockage local non disponible dans ce navigateur');
  }
  return browserApi.storage.local;
}

export async function getAuthState() {
  const storage = await getLocalStorage();
  const result = await storage.get(AUTH_STORAGE_KEY);
  const state = result[AUTH_STORAGE_KEY];
  if (!state) return null;
  return { ...state };
}

async function setAuthState(state) {
  const storage = await getLocalStorage();
  await storage.set({ [AUTH_STORAGE_KEY]: state });
}

export async function clearAuthState() {
  const storage = await getLocalStorage();
  await storage.remove(AUTH_STORAGE_KEY);
}

function mapAuthResponse(apiBaseUrl, payload) {
  const now = Date.now();
  return {
    apiBaseUrl: normalizeBaseUrl(apiBaseUrl),
    user: payload.user,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    tokenType: payload.tokenType ?? 'Bearer',
    accessTokenExpiresAt: now + (payload.accessTokenExpiresIn ?? 0) * 1000,
    refreshTokenExpiresAt: now + (payload.refreshTokenExpiresIn ?? 0) * 1000,
  };
}

async function request(apiBaseUrl, path, options = {}) {
  const base = resolveBaseUrl(apiBaseUrl);

  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const fetchOptions = {
    method: options.method || 'POST',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  };

  const response = await fetch(`${base}${path}`, fetchOptions);
  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    // ignore JSON parsing errors for empty bodies
  }

  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(' ')
      : (data?.message || data?.error || 'Erreur inconnue');
    throw new Error(message);
  }

  return data;
}

async function applyAuthResponse(apiBaseUrl, payload) {
  const base = resolveBaseUrl(apiBaseUrl);
  const state = mapAuthResponse(base, payload);
  await setAuthState(state);
  return state;
}

export async function registerUser(apiBaseUrl = API_BASE_URL, email, password) {
  const base = resolveBaseUrl(apiBaseUrl);
  const payload = await request(base, '/auth/register', {
    method: 'POST',
    body: { email, password },
  });
  return applyAuthResponse(base, payload);
}

export async function loginUser(apiBaseUrl = API_BASE_URL, email, password) {
  const base = resolveBaseUrl(apiBaseUrl);
  const payload = await request(base, '/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return applyAuthResponse(base, payload);
}

async function refreshTokens(apiBaseUrl, refreshToken) {
  const base = resolveBaseUrl(apiBaseUrl);
  const payload = await request(base, '/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
  return applyAuthResponse(base, payload);
}

export async function ensureValidAccessToken(apiBaseUrl = API_BASE_URL) {
  const state = await getAuthState();
  if (!state) {
    return null;
  }

  const base = normalizeBaseUrl(apiBaseUrl || state.apiBaseUrl || API_BASE_URL);
  if (!base) {
    await clearAuthState();
    return null;
  }

  if (state.apiBaseUrl && state.apiBaseUrl !== base) {
    return null;
  }

  const now = Date.now();
  if (state.accessToken && state.accessTokenExpiresAt && now < state.accessTokenExpiresAt - 5000) {
    return state;
  }

  if (!state.refreshToken || !state.refreshTokenExpiresAt || now >= state.refreshTokenExpiresAt - 5000) {
    await clearAuthState();
    return null;
  }

  try {
    return await refreshTokens(base, state.refreshToken);
  } catch (err) {
    await clearAuthState();
    return null;
  }
}

export async function logoutUser(apiBaseUrl = API_BASE_URL) {
  const base = normalizeBaseUrl(apiBaseUrl || API_BASE_URL);
  const state = await ensureValidAccessToken(base);

  if (state && state.accessToken) {
    try {
      await request(base || state.apiBaseUrl, '/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `${state.tokenType || 'Bearer'} ${state.accessToken}`,
        },
      });
    } catch (err) {
      // Ignorer les erreurs de déconnexion pour ne pas bloquer l'utilisateur
    }
  }

  await clearAuthState();
}

export function deriveApiBaseFromUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return normalizeBaseUrl(parsed.toString());
  } catch (err) {
    return '';
  }
}
