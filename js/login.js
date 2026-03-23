let pendingLoginToken = null;
let pendingLoginEventId = null;
let pendingLegalAcceptance = null;
let legalAcceptModal = null;
let loginTranslations = {};

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const eventId = getEventIdFromUrl();
    const username = document.getElementById('username').value.trim();
    const passwordInput = document.getElementById('password');
    const password = passwordInput.value.trim();

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
      throw new Error(data?.error || 'Error aceptando los documentos legales');
    }

    const tokenToPersist = pendingLoginToken;
    const eventIdToNavigate = pendingLoginEventId;

    resetPendingLoginState();
    localStorage.setItem('token', tokenToPersist);

    if (legalAcceptModal) {
      legalAcceptModal.hide();
    }

    continueNavigation(eventIdToNavigate);
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
