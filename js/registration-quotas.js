// Closed or full quotas prevent creation; existing registrations remain editable.
window.RegistrationQuotaAvailability = (() => {
  let eventId = null;
  let generation = 0;
  let rows = new Map();
  let pending = null;
  let ready = false;
  let loading = false;
  let error = '';
  let listening = false;
  const text = (key, fallback) => t(`registration_quotas_${key}`, fallback);
  const enabled = () => getEvent()?.registrationQuota === true
    && Number(getEvent()?.id) === eventId && ['school', 'organizer'].includes(getRegistrationRole());
  const scope = (categoryId, styleId) => `${Number(categoryId)}:${Number(styleId)}`;
  const template = (value, params) => value.replace(/\{(\w+)\}/g, (match, key) => params[key] ?? match);

  function getAvailability(categoryId, styleId) {
    if (!enabled() || !ready || !categoryId || !styleId) return null;
    const row = rows.get(scope(categoryId, styleId));
    if (!row) return null;
    return { total: row.quota, occupied: row.occupied_places, available: Math.max(0, row.quota - row.occupied_places), status: row.status };
  }

  function isClosed(categoryId, styleId) {
    const info = getAvailability(categoryId, styleId);
    return Boolean(info && (info.status === 'CLOSE' || info.available === 0));
  }

  function describe(info) {
    return template(text('availability_detail', 'Total places: {total} · Occupied: {occupied} · Available: {available}'), info);
  }

  function createIndicator(registration) {
    if (registration?.status !== 'CRE') return null;
    const info = getAvailability(registration?.reg_category_id ?? registration?.category_id,
      registration?.reg_style_id ?? registration?.style_id);
    if (!info) return null;
    const badge = document.createElement('span');
    badge.className = `lm-status registration-quota-availability ${info.available > 0 ? 'lm-status-info' : 'lm-status-warning'}`;
    const full = info.available === 0;
    badge.textContent = full ? text('availability_full', 'No places left')
      : template(text('availability_badge', 'Places: {available}/{total} available'), info);
    badge.title = full
      ? (getRegistrationRole() === 'organizer'
        ? text('availability_review', 'Review the quota for this category/style')
        : text('availability_contact', 'Contact the organizers'))
      : describe(info);
    badge.setAttribute('aria-label', full ? `${badge.textContent}. ${badge.title}` : badge.title);
    if (full) {
      badge.tabIndex = 0;
      badge.setAttribute('data-bs-toggle', 'tooltip');
      badge.setAttribute('data-bs-placement', 'top');
      badge.setAttribute('data-bs-title', badge.title);
    }
    return badge;
  }

  function appendIndicator(container, registration) {
    const badge = createIndicator(registration);
    if (!badge) return;
    const group = document.createElement('div');
    group.className = 'registration-status-quota';
    while (container.firstChild) group.appendChild(container.firstChild);
    group.appendChild(badge);
    container.appendChild(group);
    if (container.dataset.tsvValue) container.dataset.tsvValue += ` · ${badge.textContent}`;
  }

  function updateModal() {
    const mount = document.getElementById('registrationQuotaAvailability');
    if (!mount) return;
    const categoryId = document.getElementById('registrationCategory')?.value;
    const styleId = document.getElementById('registrationStyle')?.value;
    const closed = isClosed(categoryId, styleId);
    const save = document.getElementById('registrationSaveBtn');
    if (save) save.disabled = save.dataset.saving === 'true'
      || (document.getElementById('registrationForm')?.dataset.mode === 'create' && closed);
    mount.textContent = '';
    mount.className = 'col-12 registration-quota-modal-info d-none';
    if (!enabled() || !categoryId || !styleId) return;
    const info = getAvailability(categoryId, styleId);
    if (loading || error) {
      mount.textContent = loading ? text('availability_loading', 'Loading available places…')
        : text('availability_error', 'Unable to load place availability.');
      mount.classList.remove('d-none');
      return;
    }
    if (!info) return;
    mount.textContent = closed ? text('availability_closed', 'This category/style is closed. Contact the organizer.')
      : template(text('availability_remaining', 'Available places: {available}'), info);
    const emailContact = registrationState.emailContact;
    if (closed && emailContact) mount.textContent += ` (${emailContact})`;
    mount.classList.remove('d-none');
    mount.classList.add(closed ? 'text-warning' : 'text-info');
    if (closed) {
      mount.classList.remove('text-warning');
      mount.classList.add('lm-notice', 'alert-warning', 'registration-quota-modal-info--closed');
      const icon = document.createElement('i');
      icon.className = 'bi bi-exclamation-triangle-fill';
      icon.setAttribute('aria-hidden', 'true');
      const message = document.createElement('strong');
      message.textContent = mount.textContent;
      mount.replaceChildren(icon, message);
    }
  }

  function updateFeedback() {
    const mount = document.getElementById('registrationQuotaAvailabilityFeedback');
    if (!mount) return;
    mount.classList.toggle('d-none', !enabled() || !error);
    const message = document.getElementById('registrationQuotaAvailabilityError');
    if (message) message.textContent = error ? text('availability_error', 'Unable to load place availability.') : '';
  }

  async function refresh() {
    if (!enabled()) return;
    if (pending) return pending;
    const version = generation;
    loading = true;
    error = '';
    updateFeedback();
    updateModal();
    const run = async () => {
      try {
        const response = await lumoraApiFetch(`/api/registrations/quotas/availability?event_id=${eventId}`,
          { cache: 'no-store' }, { auth: 'required', eventContext: 'current' });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) throw new Error('Invalid quota availability response');
        const next = new Map();
        for (const row of data) {
          const quota = Number(row.quota);
          const occupied = Number(row.occupied_places);
          if (Number(row.event_id) !== eventId || !Number.isInteger(Number(row.category_id)) || Number(row.category_id) <= 0
              || !Number.isInteger(Number(row.style_id)) || Number(row.style_id) <= 0
              || row.quota == null || row.occupied_places == null || !Number.isSafeInteger(quota) || quota < 0
              || !Number.isSafeInteger(occupied) || occupied < 0) throw new Error('Invalid quota availability row');
          next.set(scope(row.category_id, row.style_id), { quota, occupied_places: occupied, status: row.status });
        }
        if (version !== generation || !enabled()) return;
        rows = next;
        ready = true;
      } catch {
        if (version !== generation) return;
        rows.clear();
        ready = false;
        error = text('availability_error', 'Unable to load place availability.');
      } finally {
        if (version === generation) {
          loading = false;
          pending = null;
          updateFeedback();
          updateModal();
          window.dispatchEvent(new CustomEvent('registration:quota-availability-updated'));
        }
      }
    };
    pending = run();
    return pending;
  }

  function init() {
    const nextId = Number(getEvent()?.id);
    if (getEvent()?.registrationQuota !== true || !['school', 'organizer'].includes(getRegistrationRole())
        || !Number.isSafeInteger(nextId) || nextId <= 0) return;
    if (!listening) {
      ['registrationCategory', 'registrationStyle'].forEach(id => {
        const field = document.getElementById(id);
        ['input', 'change'].forEach(name => field?.addEventListener(name, updateModal));
      });
      document.getElementById('registrationModal')?.addEventListener('show.bs.modal', updateModal);
      window.addEventListener('registration:payment-instructions-updated', updateModal);
      document.getElementById('registrationQuotaAvailabilityRetry')?.addEventListener('click', refresh);
      ['registration:school-registrations-updated', 'registration:organizer-registrations-updated'].forEach(name => window.addEventListener(name, refresh));
      new MutationObserver(() => {
        updateModal();
        updateFeedback();
        window.dispatchEvent(new CustomEvent('registration:quota-availability-updated'));
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      listening = true;
    }
    if (eventId === nextId) return pending;
    generation++;
    eventId = nextId;
    rows.clear();
    ready = false;
    pending = null;
    return refresh();
  }

  return { init, refresh, getAvailability, isClosed, updateModal, createIndicator, appendIndicator };
})();

// Quota configuration does not change registration prices or confirmation rules.
function initRegistrationQuotas() {
  const pane = document.getElementById('registration-quotas');
  const eventId = Number(getEvent()?.id);
  const allowed = () => getRegistrationRole() === 'organizer'
    && getEvent()?.registrationQuota === true && Number(getEvent()?.id) === eventId;
  if (!pane || pane.dataset.initialized || !allowed() || !Number.isSafeInteger(eventId) || eventId <= 0) return;
  pane.dataset.initialized = 'true';

  const element = suffix => document.getElementById(`registrationQuota${suffix}`);
  const form = element('Form');
  const categoryField = element('Category');
  const styleField = element('Style');
  const quotaField = element('Value');
  const statusField = element('Status');
  const save = element('Save');
  const cancel = element('Cancel');
  const table = element('sTable');
  const empty = element('sEmpty');
  const status = element('sStatus');
  const feedback = element('sFeedback');
  const retry = element('sRetry');
  const text = (key, fallback) => t(`registration_quotas_${key}`, fallback);
  let categories = [];
  let styles = [];
  let quotas = [];
  let editingId = null;
  let loading = false;
  let busy = false;
  let ready = false;

  function showError(message = '') {
    feedback.textContent = message;
    feedback.classList.toggle('d-none', !message);
  }

  function updateControls() {
    const disabled = loading || busy || !ready || !allowed();
    [categoryField, styleField, quotaField, statusField, save].forEach(control => { control.disabled = disabled || !categories.length || !styles.length; });
    [cancel, retry].forEach(control => { control.disabled = loading || busy || !allowed(); });
    table.querySelectorAll('button').forEach(button => { button.disabled = disabled; });
    form.setAttribute('aria-busy', String(loading || busy));
  }

  async function request(path, { method = 'GET', body } = {}) {
    if (!allowed()) throw new Error(text('unavailable', 'Select a valid event and sign in as its organizer or an administrator.'));
    const options = { method, cache: 'no-store' };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const response = await lumoraApiFetch(`/api/registrations${path}`, options, { auth: 'required', eventContext: 'current' });
    const data = await response.json().catch(() => null);
    if (!allowed()) throw new Error(text('unavailable', 'Select a valid event and sign in as its organizer or an administrator.'));
    if (!response.ok) throw new Error(data?.error || text('request_error', 'Unable to complete the request.'));
    return data;
  }

  function renderOptions() {
    const category = categoryField.value;
    const style = styleField.value;
    categoryField.replaceChildren(new Option(text('select_category', 'Select a category'), ''));
    categories.forEach(item => categoryField.add(new Option(item.name, String(item.id))));
    styleField.replaceChildren(new Option(text('select_style', 'Select a style'), ''));
    styles.forEach(item => styleField.add(new Option(item.name, String(item.id), styles.length === 1)));
    categoryField.value = category;
    styleField.value = style || (styles.length === 1 ? String(styles[0].id) : '');
  }

  function resetForm() {
    editingId = null;
    form.reset();
    form.classList.remove('was-validated');
    [categoryField, styleField, quotaField, statusField].forEach(field => field.setCustomValidity(''));
    save.dataset.i18n = 'registration_quotas_add';
    save.textContent = text('add', 'Add quota');
    cancel.classList.add('d-none');
  }

  function renderList() {
    table.replaceChildren();
    quotas.forEach(item => {
      const category = categories.find(category => Number(category.id) === Number(item.category_id))?.name || `#${item.category_id}`;
      const style = styles.find(style => Number(style.id) === Number(item.style_id))?.name
        || (item.style_id == null ? '-' : `#${item.style_id}`);
      const row = document.createElement('tr');
      [[category, 'category', 'Category'], [style, 'style', 'Style'], [String(item.quota), 'quota', 'Quota'],
        [String(item.occupied_places ?? '-'), 'occupied_places', 'Occupied places']].forEach(([value, key, fallback]) => {
        const cell = row.insertCell();
        cell.dataset.label = text(key, fallback);
        cell.textContent = value;
      });
      const stateCell = row.insertCell();
      stateCell.dataset.label = text('status', 'Status');
      const stateBadge = document.createElement('span');
      stateBadge.className = `lm-status ${item.status === 'OPEN' ? 'lm-status-success' : 'lm-status-warning'}`;
      stateBadge.textContent = item.status === 'OPEN' ? text('status_open', 'Open')
        : item.status === 'CLOSE' ? text('status_close', 'Closed') : '-';
      stateCell.appendChild(stateBadge);
      const actions = row.insertCell();
      const buttons = document.createElement('div');
      buttons.className = 'registration-quota-actions';
      ['edit', ...(item.status === 'OPEN' ? ['close'] : item.status === 'CLOSE' ? ['open'] : []), 'delete'].forEach(action => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `lm-btn${action === 'delete' ? ' lm-btn-danger' : ''}`;
        button.dataset.quotaAction = action;
        button.dataset.id = String(item.id);
        const label = action === 'open' ? text('open', 'Open') : action === 'close' ? text('close', 'Close')
          : t(action, action === 'edit' ? 'Edit' : 'Delete');
        button.title = `${label}: ${category} / ${style}`;
        button.setAttribute('aria-label', button.title);
        const icon = document.createElement('i');
        icon.className = `bi bi-${{ edit: 'pencil', delete: 'trash', open: 'unlock', close: 'lock' }[action]}`;
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);
        if (action === 'open' || action === 'close') button.appendChild(document.createTextNode(label));
        buttons.appendChild(button);
      });
      actions.appendChild(buttons);
      table.appendChild(row);
    });
    empty.classList.toggle('d-none', quotas.length > 0);
  }

  async function load() {
    if (loading || !allowed()) return false;
    loading = true;
    ready = false;
    showError();
    retry.classList.add('d-none');
    empty.classList.add('d-none');
    status.textContent = text('loading', 'Loading…');
    updateControls();
    try {
      const results = await Promise.all([
        request(`/quotas?event_id=${eventId}`),
        request(`/categories?event_id=${eventId}`),
        request(`/styles?event_id=${eventId}`)
      ]);
      if (!results.every(Array.isArray)) throw new Error(text('request_error', 'Unable to complete the request.'));
      [quotas, categories, styles] = results;
      ready = true;
      renderOptions();
      renderList();
      status.textContent = !categories.length ? text('no_categories', 'Add event categories before configuring quotas.')
        : !styles.length ? text('no_styles', 'Add event styles before configuring quotas.') : '';
      return true;
    } catch (error) {
      table.replaceChildren();
      status.textContent = '';
      showError(error.message || text('request_error', 'Unable to complete the request.'));
      retry.classList.remove('d-none');
      return false;
    } finally {
      loading = false;
      updateControls();
    }
  }

  async function write(method, id, body, statusOnly = false) {
    busy = true;
    showError();
    status.textContent = text('saving', 'Saving…');
    updateControls();
    try {
      await request(`/quotas${id == null ? '' : `/${encodeURIComponent(id)}`}${statusOnly ? '/status' : ''}`, { method, body });
      window.RegistrationQuotaAvailability.refresh();
      if (!statusOnly) resetForm();
      else if (editingId === Number(id)) statusField.value = body.status;
      if (await load()) status.textContent = text('saved', 'Changes saved.');
    } catch (error) {
      status.textContent = '';
      showError(error.message || text('request_error', 'Unable to complete the request.'));
    } finally {
      busy = false;
      updateControls();
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || loading || !ready || !allowed() || !categories.length || !styles.length) return;
    const categoryId = Number(categoryField.value);
    const styleId = Number(styleField.value);
    const quota = Number(quotaField.value);
    categoryField.setCustomValidity(categories.some(item => Number(item.id) === categoryId) ? '' : text('select_category', 'Select a category'));
    styleField.setCustomValidity(styleField.value !== '' && styles.some(item => Number(item.id) === styleId) ? '' : text('invalid_style', 'Select an event style.'));
    quotaField.setCustomValidity(quotaField.value.trim() !== '' && Number.isInteger(quota) && quota >= 0 && quota <= 2147483647
      ? '' : text('invalid_quota', 'Enter an integer between 0 and 2147483647.'));
    statusField.setCustomValidity(['OPEN', 'CLOSE'].includes(statusField.value) ? '' : text('invalid_status', 'Select a valid status.'));
    form.classList.add('was-validated');
    if (!form.reportValidity()) return;
    const duplicate = quotas.some(item => Number(item.category_id) === categoryId
      && Number(item.style_id) === styleId && Number(item.id) !== editingId);
    if (duplicate) {
      showError(text('duplicate', 'This category and style combination already has a quota. Edit the existing entry.'));
      return;
    }
    await write(editingId == null ? 'POST' : 'PUT', editingId, { event_id: eventId, category_id: categoryId, style_id: styleId, quota, status: statusField.value });
  });

  table.addEventListener('click', async event => {
    const button = event.target.closest('[data-quota-action]');
    if (!button || busy || loading || !ready || !allowed()) return;
    const item = quotas.find(item => String(item.id) === button.dataset.id);
    if (!item) return;
    if (['open', 'close'].includes(button.dataset.quotaAction)) {
      await write('PATCH', item.id, { status: button.dataset.quotaAction === 'open' ? 'OPEN' : 'CLOSE' }, true);
      return;
    }
    if (button.dataset.quotaAction === 'delete') {
      if (window.confirm(text('delete_confirm', 'Delete this quota?'))) await write('DELETE', item.id);
      return;
    }
    resetForm();
    editingId = Number(item.id);
    categoryField.value = String(item.category_id);
    styleField.value = item.style_id == null ? '' : String(item.style_id);
    quotaField.value = String(item.quota);
    statusField.value = item.status ?? 'OPEN';
    save.dataset.i18n = 'save';
    save.textContent = t('save', 'Save');
    cancel.classList.remove('d-none');
    showError();
    status.textContent = text('editing', 'Editing quota');
    categoryField.focus();
  });
  cancel.addEventListener('click', () => {
    if (busy || loading) return;
    resetForm();
    showError();
    status.textContent = '';
    categoryField.focus();
  });
  [categoryField, styleField, quotaField, statusField].forEach(field => field.addEventListener('input', () => {
    field.setCustomValidity('');
    showError();
  }));
  retry.addEventListener('click', () => { if (!busy) load(); });
  window.addEventListener('registration:panel-changed', event => {
    if (event.detail?.key === 'registration-quotas' && !busy && !loading) load();
  });
  window.addEventListener('registration:config-updated', () => {
    if (registrationNavigationState.activeKey === 'registration-quotas' && !busy && !loading) load();
  });
  // Navigation may already have selected this pane from the URL hash.
  if (registrationNavigationState.activeKey === 'registration-quotas') load();
}
