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

// A page keeps one school context for its whole lifetime. Switching happens before
// its event data is loaded; changes from another tab require a fresh page.
const lumoraSession = {
  blocked: false,
  requests: new Set(),
  dirty: false,
  controller: new AbortController()
};
const lumoraLoginRequiredCodes = new Set([
  'unauthorized', 'session_upgrade_required', 'token_invalid_or_expired', 'session_revoked'
]);

function getLumoraSessionMessage(key) {
  const messages = {
    forbidden: {
      es: 'No tienes permiso para acceder a este evento', en: 'You do not have permission to access this event.',
      it: 'Non hai il permesso di accedere a questo evento.', pt: 'Não tens permissão para aceder a este evento.',
      fr: 'Vous ne pouvez pas accéder à cet événement.'
    },
    invalidSchool: {
      es: 'La sesión no contiene una escuela válida.', en: 'The session does not contain a valid school.',
      it: 'La sessione non contiene una scuola valida.', pt: 'A sessão não contém uma escola válida.',
      fr: 'La session ne contient pas d’école valide.'
    },
    invalidSession: {
      es: 'La respuesta de cambio de evento no contiene una sesión válida.', en: 'The event switch did not return a valid session.',
      it: 'Il cambio di evento non ha restituito una sessione valida.', pt: 'A mudança de evento não devolveu uma sessão válida.',
      fr: 'Le changement d’événement n’a pas renvoyé de session valide.'
    },
    changed: {
      es: 'La sesión ha cambiado. Recarga la página para continuar.', en: 'The session has changed. Reload the page to continue.',
      it: 'La sessione è cambiata. Ricarica la pagina per continuare.', pt: 'A sessão mudou. Recarrega a página para continuar.',
      fr: 'La session a changé. Rechargez la page pour continuer.'
    },
    unsaved: {
      es: 'La sesión ha cambiado en otra pestaña. Hay cambios que podrían no estar guardados. ¿Quieres continuar con la nueva sesión?',
      en: 'The session changed in another tab. Some changes may be unsaved. Continue with the new session?',
      it: 'La sessione è cambiata in un’altra scheda. Alcune modifiche potrebbero non essere salvate. Continuare con la nuova sessione?',
      pt: 'A sessão mudou noutro separador. Algumas alterações podem não estar guardadas. Continuar com a nova sessão?',
      fr: 'La session a changé dans un autre onglet. Des modifications peuvent ne pas être enregistrées. Continuer avec la nouvelle session ?'
    },
    blocked: {
      es: 'Se han bloqueado las peticiones para proteger los cambios. Copia lo que necesites y recarga la página para continuar.',
      en: 'Requests are blocked to protect your changes. Copy what you need and reload the page to continue.',
      it: 'Le richieste sono bloccate per proteggere le modifiche. Copia ciò che ti serve e ricarica la pagina per continuare.',
      pt: 'Os pedidos foram bloqueados para proteger as alterações. Copia o que precisares e recarrega a página para continuar.',
      fr: 'Les requêtes sont bloquées pour protéger vos modifications. Copiez ce dont vous avez besoin et rechargez la page pour continuer.'
    }
  };
  return messages[key][getLumoraApiLanguage()] || messages[key].en;
}

function getLumoraUrlEventCode() {
  for (const [key, value] of new URLSearchParams(window.location.search)) {
    if (key.toLowerCase() === 'eventid') return value;
  }
  return null;
}

function blockLumoraSession() {
  lumoraSession.blocked = true;
  lumoraSession.controller.abort();
  for (const controller of lumoraSession.requests) controller.abort();
  lumoraSession.requests.clear();
}

function requireLumoraLogin(message) {
  blockLumoraSession();
  localStorage.removeItem('token');
  sessionStorage.removeItem('lumoraPendingEventLogin');
  if (message) alert(message);
  const code = getLumoraUrlEventCode();
  window.location.href = code ? `login.html?eventId=${encodeURIComponent(code)}` : 'index.html';
}

async function readLumoraAuthResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    const error = new Error(data?.error || `Error ${response.status}`);
    error.code = data?.code;
    throw error;
  }
  return data;
}

async function ensureLumoraEventSession(eventCode, page) {
  if (!eventCode || ['public-votes', 'public-vote'].includes(page)) return;
  const switchSession = async () => {
    const sourceToken = getToken();
    const user = getUserFromToken();
    if (!user || user.eventId === eventCode || user.role === 'admin') return;
    // Legacy sessions keep their original navigation and never call switch-event.
    if (user.role !== 'school' || !user.account_id ||
        !Array.isArray(user.access) || !user.access.includes(eventCode)) {
      const error = new Error(getLumoraSessionMessage('forbidden'));
      error.code = 'event_access_forbidden';
      throw error;
    }
    const schoolId = user.school_id ?? user.id;
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      throw new Error(getLumoraSessionMessage('invalidSchool'));
    }
    const response = await lumoraNativeFetch(`${API_BASE_URL}/api/auth/switch-event`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sourceToken}`,
        'Content-Type': 'application/json',
        'Accept-Language': getLumoraApiLanguage()
      },
      body: JSON.stringify({ school_id: schoolId, event_code: eventCode }),
      signal: lumoraSession.controller.signal
    });
    const data = await readLumoraAuthResponse(response);
    if (lumoraSession.blocked || getToken() !== sourceToken) {
      throw new DOMException('La sesión ha cambiado durante la navegación.', 'AbortError');
    }
    const nextUser = data?.token ? jwt_decode(data.token) : null;
    if (nextUser?.role !== 'school' || nextUser.eventId !== eventCode ||
        nextUser.account_id !== user.account_id || !Number.isInteger(nextUser.id) ||
        nextUser.id <= 0 || nextUser.school_id !== nextUser.id ||
        !(nextUser.exp * 1000 > Date.now()) || nextUser.exp > user.exp) {
      throw new Error(getLumoraSessionMessage('invalidSession'));
    }
    if (data.mustAcceptLegal) {
      // Reuse the existing translated legal acceptance flow. Never load private
      // destination data while acceptance is pending, or persist its JWT early.
      sessionStorage.setItem('lumoraPendingEventLogin', JSON.stringify({
        token: data.token,
        previousToken: sourceToken,
        eventCode,
        legal: data.legal,
        returnUrl: window.location.pathname + window.location.search
      }));
      window.location.href = `login.html?eventId=${encodeURIComponent(eventCode)}`;
      blockLumoraSession();
      throw new DOMException('Aceptación legal pendiente.', 'AbortError');
    }
    // Every event navigation loads a new document, so there are no old forms or
    // event caches to reuse. Only now may the destination initialize its data.
    localStorage.setItem('token', data.token);
  };
  try {
    // Serialize switches in tabs of the same origin where Web Locks is available.
    if (navigator.locks) {
      await navigator.locks.request('lumora-event-session', { signal: lumoraSession.controller.signal }, switchSession);
    } else {
      await switchSession();
    }
  } catch (error) {
    if (!lumoraSession.blocked) {
      blockLumoraSession();
      if (lumoraLoginRequiredCodes.has(error.code)) {
        requireLumoraLogin(error.message);
      } else {
        alert(error.message);
        const previous = getUserFromToken();
        window.location.href = previous?.eventId
          ? `home.html?eventId=${encodeURIComponent(previous.eventId)}` : 'index.html';
      }
    }
    throw error;
  }
}

async function lumoraSessionFetch(url, options = {}, attachToken = false) {
  const requestUrl = new URL(typeof url?.url === 'string' ? url.url : String(url), window.location.origin);
  const isPrivateApi = requestUrl.origin === new URL(API_BASE_URL).origin &&
    requestUrl.pathname.startsWith('/api/') && !requestUrl.pathname.startsWith('/api/public/');
  if (!isPrivateApi) return lumoraNativeFetch(url, options);
  if (window.lumoraEventSessionReady) await window.lumoraEventSessionReady;
  if (lumoraSession.blocked) throw new DOMException('La sesión ha cambiado.', 'AbortError');
  const token = getToken();
  const headers = new Headers(options.headers || (typeof url !== 'string' ? url.headers : undefined));
  if (attachToken && token && !headers.has('Authorization') && requestUrl.pathname !== '/api/auth/login') {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const controller = new AbortController();
  const sourceSignal = options.signal || (typeof url !== 'string' ? url.signal : null);
  const abort = () => controller.abort();
  if (sourceSignal?.aborted) controller.abort();
  else sourceSignal?.addEventListener('abort', abort, { once: true });
  lumoraSession.requests.add(controller);
  try {
    const response = await lumoraNativeFetch(url, { ...options, headers, signal: controller.signal });
    if (lumoraSession.blocked || token !== getToken()) {
      throw new DOMException('La sesión ha cambiado.', 'AbortError');
    }
    if (!response.ok && (response.status === 401 || response.status === 403)) {
      const data = await response.clone().json().catch(() => null);
      if (lumoraLoginRequiredCodes.has(data?.code)) {
        requireLumoraLogin(data.error);
        throw new DOMException('Es necesario iniciar sesión.', 'AbortError');
      }
    }
    if (response.ok && (options.method || 'GET').toUpperCase() === 'POST' &&
        /\/api\/schools\/\d+\/send-reset-password-email$/.test(requestUrl.pathname) &&
        getUserFromToken()?.role === 'school') {
      requireLumoraLogin();
      throw new DOMException('La contraseña ha cambiado. Inicia sesión de nuevo.', 'AbortError');
    }
    return response;
  } finally {
    sourceSignal?.removeEventListener('abort', abort);
    lumoraSession.requests.delete(controller);
  }
}

window.addEventListener('pagehide', blockLumoraSession);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
document.addEventListener('input', (event) => {
  if (event.target.closest('form')) lumoraSession.dirty = true;
});
document.addEventListener('change', (event) => {
  if (event.target.closest('form')) lumoraSession.dirty = true;
});
window.addEventListener('storage', (event) => {
  if ((event.key !== 'token' && event.key !== null) || event.storageArea !== localStorage) return;
  blockLumoraSession();
  const continueNavigation = !lumoraSession.dirty || confirm(getLumoraSessionMessage('unsaved'));
  if (!continueNavigation) {
    alert(getLumoraSessionMessage('blocked'));
    return;
  }
  sessionStorage.removeItem('lumoraPendingEventLogin');
  const user = getUserFromToken();
  if (!user) {
    const code = getLumoraUrlEventCode();
    window.location.href = code ? `login.html?eventId=${encodeURIComponent(code)}` : 'index.html';
  } else if (getLumoraUrlEventCode() && user.eventId && user.eventId !== getLumoraUrlEventCode() && user.role !== 'admin') {
    window.location.href = `home.html?eventId=${encodeURIComponent(user.eventId)}`;
  } else {
    window.location.reload();
  }
});

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

  if (window.lumoraEventSessionReady) await window.lumoraEventSessionReady;

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

  return lumoraSessionFetch(requestUrl.href, { ...options, headers });
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
