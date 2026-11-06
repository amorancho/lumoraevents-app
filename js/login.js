let pendingLoginToken = null;
let pendingLoginEventId = null;
let pendingLegalAcceptance = null;
let legalAcceptModal = null;
let loginTranslations = {};
let pendingLoginReturnUrl = null;
let pendingLoginPreviousToken = null;

document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date();
  const year = today.getFullYear();
  const regNameSpan = document.getElementById('regName');
  const form = document.querySelector('form');
  const legalAcceptModalEl = document.getElementById('legalAcceptModal');
  const legalAcceptConfirmBtn = document.getElementById('legalAcceptConfirmBtn');
  const currentLang = getLoginLanguage();

  if (regNameSpan) {
    regNameSpan.textContent = `(c) ${year}  LumoraEvents`;
  }

  document.documentElement.lang = currentLang;
  await loadLoginTranslations(currentLang);
  applyLoginTranslations();

  const eventId = getEventIdFromUrl();
  initLoginPasswordRecovery(eventId);
  if (eventId) {
    loadLoginEventName(eventId);
  }

  if (legalAcceptModalEl) {
    legalAcceptModal = new bootstrap.Modal(legalAcceptModalEl, {
      backdrop: 'static',
      keyboard: false
    });
  }

  if (legalAcceptConfirmBtn) {
    legalAcceptConfirmBtn.addEventListener('click', acceptLegalDocuments);
  }

  if (!form) {
    return;
  }

  const pendingEventLogin = sessionStorage.getItem('lumoraPendingEventLogin');
  if (pendingEventLogin) {
    sessionStorage.removeItem('lumoraPendingEventLogin');
    try {
      const pending = JSON.parse(pendingEventLogin);
      const user = jwt_decode(pending.token);
      const returnUrl = new URL(pending.returnUrl, window.location.origin);
      if (pending.eventCode === eventId && user.eventId === eventId && user.exp * 1000 > Date.now() &&
          pending.previousToken === getToken() && returnUrl.origin === window.location.origin) {
        pendingLoginToken = pending.token;
        pendingLoginEventId = eventId;
        pendingLoginPreviousToken = pending.previousToken;
        pendingLoginReturnUrl = returnUrl.pathname + returnUrl.search;
        pendingLegalAcceptance = normalizeLegalAcceptance(pending.legal);
        form.hidden = true;
        showLegalAcceptModal(pendingLegalAcceptance);
      }
    } catch (error) {
      console.warn('No se pudo recuperar la aceptación legal pendiente:', error.message);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const eventId = getEventIdFromUrl();
    const username = document.getElementById('username').value.trim().toLowerCase();
    const passwordInput = document.getElementById('password');
    const password = passwordInput.value;

    if (!eventId) {
      alert('No se ha proporcionado un eventId');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ eventId, username, password })
      });

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data?.error || 'Error en el login');
      }

      const loginToken = extractLoginToken(data, response);

      if (data.mustAcceptLegal) {
        pendingLoginToken = loginToken;
        pendingLoginEventId = eventId;
        pendingLegalAcceptance = normalizeLegalAcceptance(data.legal);

        if (!pendingLoginToken) {
          throw new Error('No se recibio token para aceptar los documentos legales');
        }

        showLegalAcceptModal(pendingLegalAcceptance);
        return;
      }

      if (loginToken) {
        finalizeLogin(loginToken, eventId);
        return;
      }

      throw new Error('No se recibio token en la respuesta');
    } catch (err) {
      resetPendingLoginState();
      alert(err instanceof Error ? err.message : String(err));
      passwordInput.value = '';
    }
  });
});

function initLoginPasswordRecovery(eventCode) {
  const supportedEvents = ['onstage27', 'tedvision27', 'givemehype27', 'costaflow27'];
  if (!supportedEvents.includes(String(eventCode || '').toLowerCase())) return;
  const link = document.getElementById('forgotPasswordLink');
  const form = document.getElementById('forgotPasswordForm');
  if (!link || !form || form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  const help = document.getElementById('loginHelp');
  if (help) help.hidden = true;
  link.hidden = false;
  const usernameInput = document.getElementById('forgotPasswordUsername');
  const submit = document.getElementById('forgotPasswordSubmit');
  const feedback = document.getElementById('forgotPasswordFeedback');
  let busy = false;
  let retryAt = 0;
  let retryTimer = null;
  let message = '';
  let state = 'error';

  const updateFeedback = () => {
    const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    feedback.textContent = message + (seconds ? ' ' +
      tLogin('forgot_password_retry_after', 'Try again in {seconds} seconds.').replace('{seconds}', String(seconds)) : '');
    feedback.dataset.state = state;
    feedback.hidden = !message;
    submit.disabled = busy || seconds > 0;
    if (!seconds && retryTimer !== null) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  };
  link.addEventListener('click', () => {
    form.hidden = !form.hidden;
    link.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) {
      if (!usernameInput.value) usernameInput.value = document.getElementById('username')?.value || '';
      usernameInput.focus();
    }
  });
  usernameInput.addEventListener('input', () => usernameInput.setCustomValidity(''));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || Date.now() < retryAt) return;
    const username = usernameInput.value.trim().toLowerCase();
    usernameInput.setCustomValidity(username.length < 1 || username.length > 191
      ? tLogin('forgot_password_username_invalid', 'Enter a username of up to 191 characters.') : '');
    if (!form.reportValidity()) return;
    if (!confirm(tLogin('forgot_password_confirm',
      'Reset your password? A new temporary password will be emailed to the stored contact and previous sessions will be revoked.'))) return;
    busy = true;
    message = '';
    updateFeedback();
    const originalText = submit.textContent;
    submit.textContent = tLogin('forgot_password_sending', 'Sending...');
    try {
      // Public recovery: never reuse a session helper or send an Authorization header.
      const response = await lumoraNativeFetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': getLoginLanguage() },
        body: JSON.stringify({ eventId: eventCode, username })
      });
      const data = await parseJsonResponse(response);
      if (!response.ok || data?.success !== true) {
        if (response.status === 429) {
          const seconds = Number(response.headers.get('Retry-After'));
          if (Number.isFinite(seconds) && seconds > 0) retryAt = Date.now() + Math.ceil(seconds) * 1000;
        }
        throw new Error(data?.error || tLogin('forgot_password_error', 'Unable to request a password reset. Please try again later.'));
      }
      state = 'success';
      message = data.message || tLogin('forgot_password_success',
        'If an eligible account exists for this username and event, you will receive an email with instructions.');
    } catch (error) {
      state = 'error';
      message = error.message || tLogin('forgot_password_error', 'Unable to request a password reset. Please try again later.');
    } finally {
      busy = false;
      submit.textContent = originalText;
      updateFeedback();
      if (retryAt > Date.now() && retryTimer === null) retryTimer = setInterval(updateFeedback, 1000);
    }
  });
  window.addEventListener('pagehide', () => {
    if (retryTimer !== null) clearInterval(retryTimer);
  }, { once: true });
}

function getEventIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);

  for (const [key, value] of urlParams.entries()) {
    if (key.toLowerCase() === 'eventid') {
      return value;
    }
  }

  window.location.href = 'index.html';
  return null;
}

async function loadLoginEventName(eventId) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/public/events/code/${encodeURIComponent(eventId)}`
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status} al recuperar el evento`);
    }

    const event = await response.json();
    const eventName = document.getElementById('eventName');

    if (eventName) {
      eventName.textContent = event?.name || '';
    }
  } catch (error) {
    console.error('Error cargando datos del evento:', error);
  }
}

function getRequiredLegalDocuments(legal = {}) {
  return [
    { key: 'terms', labelKey: 'legal_link_terms', fallbackLabel: 'Terms and Conditions', href: 'terms.html' },
    { key: 'privacy', labelKey: 'legal_link_privacy', fallbackLabel: 'Privacy Policy', href: 'privacy.html' },
    { key: 'cookies', labelKey: 'legal_link_cookies', fallbackLabel: 'Cookie Policy', href: 'cookies.html' }
  ].filter((documentItem) => Boolean(legal[documentItem.key]));
}

function showLegalAcceptModal(legal) {
  const linksContainer = document.getElementById('legalAcceptLinks');
  const requiredDocuments = getRequiredLegalDocuments(legal);

  if (!linksContainer || !legalAcceptModal) {
    throw new Error('El modal legal no esta disponible');
  }

  if (!requiredDocuments.length) {
    throw new Error('No hay documentos legales para aceptar');
  }

  linksContainer.innerHTML = '';

  requiredDocuments.forEach((documentItem) => {
    const link = document.createElement('a');
    link.href = documentItem.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = tLogin(documentItem.labelKey, documentItem.fallbackLabel);
    linksContainer.appendChild(link);
  });

  legalAcceptModal.show();
}

async function acceptLegalDocuments() {
  const legalAcceptConfirmBtn = document.getElementById('legalAcceptConfirmBtn');

  if (!pendingLoginToken || !pendingLoginEventId || !pendingLegalAcceptance) {
    alert('La sesion pendiente ha expirado. Inicia sesion de nuevo.');
    return;
  }

  if (!legalAcceptConfirmBtn) {
    return;
  }

  const originalButtonText = legalAcceptConfirmBtn.textContent;
  legalAcceptConfirmBtn.disabled = true;
  legalAcceptConfirmBtn.textContent = 'Accepting...';

  try {
    const response = await fetch(`${API_BASE_URL}/api/legal/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pendingLoginToken}`,
        'Accept-Language': localStorage.getItem('lang') || 'en'
      },
      body: JSON.stringify(pendingLegalAcceptance)
    });

    const data = await parseJsonResponse(response);

    if (!response.ok || data?.success === false) {
      if (lumoraLoginRequiredCodes.has(data?.code)) {
        requireLumoraLogin(data.error);
        return;
      }
      throw new Error(data?.error || 'Error aceptando los documentos legales');
    }

    if (pendingLoginPreviousToken && getToken() !== pendingLoginPreviousToken) {
      throw new Error(getLumoraSessionMessage('changed'));
    }

    const tokenToPersist = pendingLoginToken;
    const eventIdToNavigate = pendingLoginEventId;
    const returnUrl = pendingLoginReturnUrl;

    resetPendingLoginState();
    localStorage.setItem('token', tokenToPersist);

    if (legalAcceptModal) {
      legalAcceptModal.hide();
    }

    if (returnUrl) window.location.href = returnUrl;
    else continueNavigation(eventIdToNavigate);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  } finally {
    legalAcceptConfirmBtn.disabled = false;
    legalAcceptConfirmBtn.textContent = originalButtonText;
  }
}

function finalizeLogin(token, eventId) {
  localStorage.setItem('token', token);
  continueNavigation(eventId);
}

function continueNavigation(eventId) {
  window.location.href = `/home.html?eventId=${encodeURIComponent(eventId)}`;
}

function resetPendingLoginState() {
  pendingLoginToken = null;
  pendingLoginEventId = null;
  pendingLegalAcceptance = null;
  pendingLoginReturnUrl = null;
  pendingLoginPreviousToken = null;
}

function extractLoginToken(data, response) {
  if (data?.token) {
    return data.token;
  }

  const authorizationHeader = response.headers.get('Authorization') || response.headers.get('authorization');

  if (authorizationHeader) {
    return authorizationHeader.replace(/^Bearer\s+/i, '').trim();
  }

  const fallbackHeader = response.headers.get('X-Auth-Token') || response.headers.get('x-auth-token');
  return fallbackHeader ? fallbackHeader.trim() : null;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function getLoginLanguage() {
  const storedLang = localStorage.getItem('lang') || 'en';
  return ['es', 'en', 'it', 'fr', 'pt'].includes(storedLang) ? storedLang : 'en';
}

async function loadLoginTranslations(lang) {
  try {
    const response = await fetch(`/lang/login.${lang}.json`);
    if (!response.ok) {
      throw new Error(`Error ${response.status} cargando traducciones`);
    }

    loginTranslations = await response.json();
  } catch (error) {
    loginTranslations = {};
  }
}

function applyLoginTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    const translation = tLogin(key);

    if (translation) {
      element.textContent = translation;
    }
  });
}

function tLogin(key, fallback = null) {
  if (loginTranslations && Object.prototype.hasOwnProperty.call(loginTranslations, key)) {
    return loginTranslations[key];
  }

  return fallback;
}

function normalizeLegalAcceptance(legal = {}) {
  return {
    terms: legal?.terms === true,
    privacy: legal?.privacy === true,
    cookies: legal?.cookies === true
  };
}
