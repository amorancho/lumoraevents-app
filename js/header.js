const AVATAR_CONFIG = {
  maxSizeBytes: 2 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

const avatarState = {
  currentUrl: null,
  judgeId: null,
  loadedFor: null,
  pendingFile: null,
  judgeName: null
};

function generateHeader(callback) {
  fetch('header.html')
    .then(res => res.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const titulo = doc.getElementById('event-name');
      const homeUrl = doc.getElementById('home-link');
      const infoBadge = doc.getElementById('event-info-badge');

      if (titulo) {
        titulo.textContent = getEvent().name;
        titulo.href = getEvent().homeUrl;
      }

      if (homeUrl) {
        homeUrl.href = getEvent().homeUrl;
      }

      if (infoBadge && getEvent().trial) {
        infoBadge.textContent = 'TRIAL EVENT';
      }

      if (infoBadge && getEvent().status === 'completed') {
        infoBadge.textContent = 'CLOSED EVENT';
      }

      const headerContainer = document.getElementById('header');
      if (headerContainer) {
        headerContainer.outerHTML = doc.body.innerHTML;
      }

      applyAvatarCopy();
      initUserInfo();

      if (callback) callback();
    });
}

function getCurrentLang() {
  return (localStorage.getItem('lang') || 'es').toLowerCase();
}

function getAvatarPlaceholder(name) {
  const safeName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Avatar';
  const encoded = encodeURIComponent(safeName);
  return `https://ui-avatars.com/api/?name=${encoded}&size=160&background=0D8ABC&color=fff&rounded=true`;
}

function getAvatarCopy() {
  const lang = getCurrentLang();
  const copy = {
    es: {
      trigger: 'Avatar',
      title: 'Gestionar foto',
      fileLabel: 'Sube tu foto (png, jpg o webp)',
      helper: 'Hasta 2 MB. Se optimizara automaticamente.',
      delete: 'Eliminar foto',
      cancel: 'Cancelar',
      save: 'Guardar',
      errorFormat: 'Formato no permitido. Usa png, jpg o webp.',
      errorSize: 'La imagen supera los 2 MB.',
      errorEmpty: 'Selecciona una imagen para subir.',
      errorUnknown: 'No se ha identificado al juez.',
      successDelete: 'Avatar eliminado.'
    },
    en: {
      trigger: 'Avatar',
      title: 'Manage photo',
      fileLabel: 'Upload your photo (png, jpg or webp)',
      helper: 'Up to 2 MB. It will be optimized automatically.',
      delete: 'Remove photo',
      cancel: 'Cancel',
      save: 'Save',
      errorFormat: 'Unsupported format. Use png, jpg or webp.',
      errorSize: 'Image exceeds 2 MB.',
      errorEmpty: 'Choose an image to upload.',
      errorUnknown: 'Judge not identified.',
      successDelete: 'Avatar removed.'
    }
  };

  return copy[lang] || copy.es;
}

function applyAvatarCopy() {
  const copy = getAvatarCopy();
  const triggerText = document.getElementById('avatar-trigger-text');
  const modalLabel = document.getElementById('avatarModalLabel');
  const fileLabel = document.querySelector('label[for="avatarFile"]');
  const helper = document.getElementById('avatarHelp');
  const deleteBtn = document.getElementById('deleteAvatarBtn');
  const saveBtn = document.getElementById('saveAvatarBtn');
  const cancelBtn = document.querySelector('#avatarModal .btn-outline-secondary');

  if (triggerText) triggerText.textContent = copy.trigger;
  if (modalLabel) modalLabel.textContent = copy.title;
  if (fileLabel) fileLabel.textContent = copy.fileLabel;
  if (helper) helper.textContent = copy.helper;
  if (deleteBtn) deleteBtn.textContent = copy.delete;
  if (saveBtn) saveBtn.textContent = copy.save;
  if (cancelBtn) cancelBtn.textContent = copy.cancel;
}

function getToken() {
  return localStorage.getItem("token");
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const jsonPayload = new TextDecoder().decode(bytes);

    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function renderUser() {
  const token = getToken();
  const userNameEl = document.getElementById("user-name");
  const authBtn = document.getElementById("auth-btn");
  const adminBtn = document.getElementById("admin-btn");

  if (!userNameEl || !authBtn || !adminBtn) return;

  if (token) {
    const payload = parseJwt(token);
    const name = payload?.name || "User";
    const role = payload?.role?.toLowerCase() || "guest";

    userNameEl.textContent = role !== "guest" ? `${name} (${role})` : "Guest";
    authBtn.textContent = "Logout";

    if (role === "admin") {
      adminBtn.classList.remove("d-none");
    } else {
      adminBtn.classList.add("d-none");
    }

    setupAvatarForUser(payload);
  } else {
    userNameEl.textContent = "Guest";
    authBtn.textContent = "Login";
    adminBtn.classList.add("d-none");
    resetAvatarUi();
  }
}

function setupAvatarForUser(payload) {
  const role = payload?.role?.toLowerCase();
  const judgeId = payload?.id;
  avatarState.judgeName = payload?.name || 'Avatar';
  const avatarTrigger = document.getElementById('avatar-trigger');

  if (!avatarTrigger) return;

  if (role === 'judge' && judgeId) {
    avatarState.judgeId = judgeId;
    avatarTrigger.classList.remove('d-none');

    if (avatarState.loadedFor !== judgeId) {
      loadAvatarFromApi(judgeId);
    }
  } else {
    resetAvatarUi();
  }
}

async function loadAvatarFromApi(judgeId) {
  avatarState.currentUrl = null;
  updateAvatarPreview(null);

  try {
    const res = await fetch(`${API_BASE_URL}/api/judges/${judgeId}/avatar?event_id=${getEvent().id}`, {
      headers: buildAuthHeaders()
    });
    if (!res.ok) throw new Error(`Avatar fetch failed: ${res.status}`);

    const data = await res.json();
    const url = data.avatarUrl || data.url || data.avatar || null;
    avatarState.currentUrl = url;
    avatarState.loadedFor = judgeId;
    updateAvatarPreview(url);
  } catch (err) {
    console.warn('No se pudo recuperar el avatar del juez', err);
    updateAvatarPreview(null);
  }
}

function resetAvatarUi() {
  avatarState.currentUrl = null;
  avatarState.pendingFile = null;
  avatarState.loadedFor = null;
  avatarState.judgeName = null;

  const avatarTrigger = document.getElementById('avatar-trigger');
  const thumb = document.getElementById('avatar-thumb');
  const fallbackIcon = document.getElementById('user-fallback-icon');

  if (avatarTrigger) avatarTrigger.classList.add('d-none');
  if (thumb) thumb.src = getAvatarPlaceholder();
  if (fallbackIcon) fallbackIcon.classList.remove('d-none');
}

function updateAvatarPreview(url) {
  const thumb = document.getElementById('avatar-thumb');
  const preview = document.getElementById('avatarPreview');
  const fallbackIcon = document.getElementById('user-fallback-icon');
  const avatarTrigger = document.getElementById('avatar-trigger');

  const src = url || getAvatarPlaceholder(avatarState.judgeName);
  if (thumb) thumb.src = src;
  if (preview) preview.src = src;
  if (fallbackIcon) {
    const triggerVisible = avatarTrigger && !avatarTrigger.classList.contains('d-none');
    if (triggerVisible) {
      fallbackIcon.classList.add('d-none');
    } else if (url) {
      fallbackIcon.classList.add('d-none');
    } else {
      fallbackIcon.classList.remove('d-none');
    }
  }
}

function initAvatarModal() {
  const trigger = document.getElementById('avatar-trigger');
  const fileInput = document.getElementById('avatarFile');
  const saveBtn = document.getElementById('saveAvatarBtn');
  const deleteBtn = document.getElementById('deleteAvatarBtn');
  const modalElement = document.getElementById('avatarModal');

  if (!trigger || !fileInput || !saveBtn || !deleteBtn || !modalElement) return;

  const modal = new bootstrap.Modal(modalElement);

  trigger.addEventListener('click', () => {
    clearAvatarAlert();
    fileInput.value = '';
    avatarState.pendingFile = null;
    updateAvatarPreview(avatarState.currentUrl);
    applyAvatarCopy();
    modal.show();
  });

  fileInput.addEventListener('change', handleAvatarFileChange);
  saveBtn.addEventListener('click', () => uploadAvatar(modal));
  deleteBtn.addEventListener('click', () => deleteAvatar(modal));

  modalElement.addEventListener('hidden.bs.modal', () => {
    fileInput.value = '';
    avatarState.pendingFile = null;
    clearAvatarAlert();
  });
}

function handleAvatarFileChange(event) {
  const file = event.target.files[0];
  if (!file) {
    avatarState.pendingFile = null;
    updateAvatarPreview(avatarState.currentUrl);
    return;
  }

  const copy = getAvatarCopy();

  if (!AVATAR_CONFIG.allowedMimeTypes.includes(file.type)) {
    showAvatarAlert(copy.errorFormat, 'danger');
    event.target.value = '';
    return;
  }

  if (file.size > AVATAR_CONFIG.maxSizeBytes) {
    showAvatarAlert(copy.errorSize, 'danger');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    avatarState.pendingFile = file;
    updateAvatarPreview(e.target.result);
    clearAvatarAlert();
  };
  reader.readAsDataURL(file);
}

function showAvatarAlert(message, type = 'danger') {
  const box = document.getElementById('avatarError');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('d-none', 'alert-danger', 'alert-success');
  box.classList.add(type === 'success' ? 'alert-success' : 'alert-danger');
}

function clearAvatarAlert() {
  const box = document.getElementById('avatarError');
  if (!box) return;
  box.textContent = '';
  box.classList.remove('alert-success', 'alert-danger');
  box.classList.add('d-none', 'alert-danger');
}

async function uploadAvatar(modalInstance) {
  const copy = getAvatarCopy();
  const judgeId = avatarState.judgeId;
  const file = avatarState.pendingFile;
  const saveBtn = document.getElementById('saveAvatarBtn');

  if (!judgeId) {
    showAvatarAlert(copy.errorUnknown);
    return;
  }

  if (!file) {
    showAvatarAlert(copy.errorEmpty);
    return;
  }

  const formData = new FormData();
  formData.append('avatar', file);
  formData.append('event_id', getEvent().id);
  formData.append('judge_id', judgeId);

  if (saveBtn) saveBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/judges/${judgeId}/avatar`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    const newUrl = data.avatarUrl || data.url || data.avatar || avatarState.currentUrl;
    avatarState.currentUrl = newUrl;
    avatarState.loadedFor = judgeId;
    updateAvatarPreview(newUrl);
    clearAvatarAlert();
    if (modalInstance) modalInstance.hide();
  } catch (err) {
    console.error('Error subiendo avatar', err);
    showAvatarAlert(err.message || 'Error al subir la imagen.');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function deleteAvatar(modalInstance) {
  const copy = getAvatarCopy();
  const judgeId = avatarState.judgeId;
  const deleteBtn = document.getElementById('deleteAvatarBtn');

  if (!judgeId) {
    showAvatarAlert(copy.errorUnknown);
    return;
  }

  if (deleteBtn) deleteBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/judges/${judgeId}/avatar?event_id=${getEvent().id}`, {
      method: 'DELETE',
      headers: buildAuthHeaders()
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }

    avatarState.currentUrl = null;
    updateAvatarPreview(null);
    showAvatarAlert(copy.successDelete, 'success');
    const fileInput = document.getElementById('avatarFile');
    if (fileInput) fileInput.value = '';
    avatarState.pendingFile = null;
  } catch (err) {
    console.error('Error eliminando avatar', err);
    showAvatarAlert(err.message || 'Error eliminando la foto.');
  } finally {
    if (deleteBtn) deleteBtn.disabled = false;
  }
}

function buildAuthHeaders() {
  const token = getToken();
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function initUserInfo() {
  initAvatarModal();
  renderUser();

  const adminBtn = document.getElementById("admin-btn");
  const authBtn = document.getElementById("auth-btn");

  if (adminBtn) {
    adminBtn.addEventListener("click", () => {
      window.location.href = `/admin.html`;
    });
  }

  if (authBtn) {
    authBtn.addEventListener("click", () => {
      const token = getToken();
      if (token) {
        localStorage.removeItem("token");
        renderUser();
        window.location.href = `/home.html?eventId=${encodeURIComponent(eventId)}`;
      } else {
        window.location.href = `/login.html?eventId=${encodeURIComponent(eventId)}`;
      }
    });
  }
}
