//const API_BASE_URL = 'http://localhost:3000';
//const API_BASE_URL = 'https://api.lumoraevents.net';

// Referencia estable al fetch nativo, capturada antes del override legacy de common.js.
const lumoraNativeFetch = window.fetch.bind(window);
window.lumoraNativeFetch = lumoraNativeFetch;

var API_BASE_URL;

(function() {
  var host = window.location.hostname;

  if (host === "localhost" || host === "127.0.0.1") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    API_BASE_URL = `${protocol}//${host}:3000`; // local, conservando el mismo site para las cookies SameSite
  } else {
    API_BASE_URL = "https://api.lumoraevents.net"; // producción
  }
})();

function getToken() {
  return localStorage.getItem("token");
}

function getUserFromToken() {
  const token = getToken();
  if (!token) return null;

  try {
    const decoded = jwt_decode(token); // { id, name, role, iat, exp, ... }

    // Validar expiración
    if (decoded.exp * 1000 < Date.now()) {
      console.warn("Token expirado");
      localStorage.removeItem("token");
      return null;
    }

    return decoded;
  } catch (err) {
    console.warn("Token inválido:", err.message);
    return null;
  }
}

function getLumoraApiLanguage() {
  if (typeof getCurrentAppLanguage === 'function') {
    return getCurrentAppLanguage();
  }

  const supportedLanguages = new Set(['es', 'en', 'it', 'pt', 'fr']);
  const rawLanguage = String(
    localStorage.getItem('lang')
    || document.documentElement.getAttribute('lang')
    || 'en'
  ).toLowerCase();

  return supportedLanguages.has(rawLanguage) ? rawLanguage : 'en';
}

function getLumoraApiPolicy(policy = {}) {
  const auth = policy.auth ?? 'none';
  const eventContext = policy.eventContext ?? 'none';

  if (!['none', 'required'].includes(auth)) {
    throw new TypeError(`Unsupported lumoraApiFetch auth policy: ${auth}`);
  }

  if (!['none', 'current'].includes(eventContext)) {
    throw new TypeError(`Unsupported lumoraApiFetch eventContext policy: ${eventContext}`);
  }

  return { auth, eventContext, token: policy.token };
}

async function getLumoraCurrentEventId() {
  let currentEvent = typeof getEvent === 'function' ? getEvent() : null;

  if (!currentEvent && typeof eventReadyPromise !== 'undefined' && eventReadyPromise) {
    await eventReadyPromise;
    currentEvent = typeof getEvent === 'function' ? getEvent() : null;
  }

  const numericEventId = Number(currentEvent?.id);
  if (!Number.isInteger(numericEventId) || numericEventId <= 0) {
    throw new Error('A numeric current event ID is required for this request.');
  }

  return `${numericEventId}`;
}

async function lumoraApiFetch(path, options = {}, policy = {}) {
  const resolvedPolicy = getLumoraApiPolicy(policy);
  const apiBaseUrl = new URL(API_BASE_URL, window.location.origin);
  const requestUrl = new URL(path instanceof URL ? path.href : String(path), `${apiBaseUrl.href.replace(/\/$/, '')}/`);
  const headers = new Headers(options.headers || {});
  const isLumoraApiOrigin = requestUrl.origin === apiBaseUrl.origin;

  // Nunca propagar credenciales o contexto de Lumora a servicios externos.
  if (!isLumoraApiOrigin) {
    headers.delete('Authorization');
    headers.delete('X-Event-Id');
    headers.delete('X-User-Role');
    headers.delete('X-User-Id');

    return lumoraNativeFetch(requestUrl.href, { ...options, headers });
  }

  headers.set('Accept-Language', getLumoraApiLanguage());
  headers.delete('X-User-Role');
  headers.delete('X-User-Id');

  if (resolvedPolicy.auth === 'required') {
    const token = String(resolvedPolicy.token ?? getToken() ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (!token) {
      throw new Error('An authentication token is required for this request.');
    }

    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }

  headers.delete('X-Event-Id');
  if (resolvedPolicy.eventContext === 'current') {
    const user = getUserFromToken();
    if (String(user?.role || '').toLowerCase() === 'admin') {
      headers.set('X-Event-Id', await getLumoraCurrentEventId());
    }
  }

  return lumoraNativeFetch(requestUrl.href, { ...options, headers });
}

function validateRoles(allowedRoles, redirect = true) {
  const user = getUserFromToken();
  if (!user || !allowedRoles.includes(user.role)) {

    if (redirect) {
      alert("No tienes permiso para acceder a esta página");  
      // Redirige al login o home
      window.location.href = `/home.html?eventId=${eventId}`;
    }
    return false;
  }
  return true;
}

function updateElementProperty(elementId, property, value, replace = true) {
  const element = document.getElementById(elementId);

  if (element) {

    if (replace) {
      element[property] = value;
    } else {
      element[property] += value;
    }        
  }
}
