// Configuration only: registration_price and registration totals come from the API.
function initRegistrationSupplements() {
  const openButton = document.getElementById('registrationSupplementsBtn');
  const modalElement = document.getElementById('registrationSupplementsModal');
  if (!openButton || !modalElement || getRegistrationRole() !== 'organizer') return;
  if (modalElement.dataset.initialized) return;
  modalElement.dataset.initialized = 'true';
  openButton.classList.remove('d-none');

  const element = suffix => document.getElementById(`registrationSupplement${suffix}`);
  const form = element('Form');
  const categoryField = element('Category');
  const styleField = element('Style');
  const priceField = element('Price');
  const saveButton = element('Save');
  const cancelButton = element('Cancel');
  const table = element('sTable');
  const empty = element('sEmpty');
  const feedback = element('sFeedback');
  const status = element('sStatus');
  const retry = element('sRetry');
  const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
  const text = (key, fallback) => t(`registration_supplements_${key}`, fallback);
  let eventId = null;
  let categories = [];
  let styles = [];
  let supplements = [];
  let editingId = null;
  let loading = false;
  let busy = false;
  let ready = false;
  let revision = 0;

  const showError = message => {
    feedback.textContent = message;
    feedback.classList.toggle('d-none', !message);
  };
  const sameEvent = () => Number(getEvent()?.id) === eventId && getRegistrationRole() === 'organizer';
  const updateControls = () => {
    const disabled = loading || busy || !ready || !sameEvent();
    categoryField.disabled = disabled;
    styleField.disabled = disabled;
    priceField.disabled = disabled;
    saveButton.disabled = disabled || !categories.length || !Array.from(styleField.options).some(option => option.value && !option.disabled);
    cancelButton.disabled = loading || busy;
    retry.disabled = loading || busy;
    table.querySelectorAll('button').forEach(button => { button.disabled = disabled; });
    modalElement.querySelectorAll('[data-bs-dismiss="modal"]').forEach(button => { button.disabled = busy; });
    form.setAttribute('aria-busy', String(loading || busy));
  };

  async function request(path, { method = 'GET', body } = {}) {
    if (!sameEvent() || !Number.isSafeInteger(eventId) || eventId <= 0) {
      throw new Error(text('unavailable', 'Select a valid event and sign in as its organizer or an administrator.'));
    }
    const options = { method, cache: 'no-store' };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const response = await lumoraApiFetch(`/api/registrations${path}`, options, { auth: 'required', eventContext: 'current' });
    let data = null;
    try { data = await response.json(); } catch { /* Use the translated fallback for non-JSON errors. */ }
    if (!sameEvent()) throw new Error(text('unavailable', 'Select a valid event and sign in as its organizer or an administrator.'));
    if (!response.ok) throw new Error(data?.error || text('request_error', 'Unable to complete the request.'));
    return data;
  }

  const hasSupplement = (categoryId, styleId) => supplements.some(item =>
    Number(item.event_id) === eventId && Number(item.category_id) === categoryId && Number(item.style_id) === styleId && Number(item.id) !== editingId);

  function renderCategories(selected = '') {
    categoryField.replaceChildren(new Option(text('select_category', 'Select a category'), ''));
    categories.forEach(category => categoryField.add(new Option(category.name, String(category.id))));
    categoryField.value = String(selected);
  }

  function renderStyles(selected = '') {
    styleField.replaceChildren(new Option(text('select_style', 'Select a style'), ''));
    styles.forEach(style => {
      const option = new Option(style.name, String(style.id));
      option.disabled = hasSupplement(Number(categoryField.value), Number(style.id));
      styleField.add(option);
    });
    styleField.value = String(selected);
    if (styleField.selectedOptions[0]?.disabled) styleField.value = '';
  }

  function resetForm() {
    editingId = null;
    form.reset();
    form.classList.remove('was-validated');
    categoryField.setCustomValidity('');
    styleField.setCustomValidity('');
    priceField.setCustomValidity('');
    renderCategories();
    renderStyles();
    saveButton.dataset.i18n = 'registration_supplements_add';
    saveButton.textContent = text('add', 'Add');
    cancelButton.classList.add('d-none');
  }

  function renderList() {
    table.replaceChildren();
    supplements.forEach(item => {
      const categoryName = categories.find(category => Number(category.id) === Number(item.category_id))?.name || `#${item.category_id}`;
      const styleName = styles.find(style => Number(style.id) === Number(item.style_id))?.name || `#${item.style_id}`;
      const row = document.createElement('tr');
      const categoryCell = row.insertCell();
      categoryCell.dataset.label = text('category', 'Category');
      categoryCell.textContent = categoryName;
      const styleCell = row.insertCell();
      styleCell.dataset.label = text('style', 'Style');
      styleCell.textContent = styleName;
      const priceCell = row.insertCell();
      priceCell.dataset.label = text('amount', 'Supplement');
      priceCell.className = 'text-end';
      priceCell.textContent = new Intl.NumberFormat(getRegistrationLanguage(), { style: 'currency', currency: 'EUR' }).format(Number(item.price) / 100);
      const actions = row.insertCell();
      const buttons = document.createElement('div');
      buttons.className = 'registration-supplement-row-actions';
      ['edit', 'delete'].forEach(action => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `lm-btn${action === 'delete' ? ' lm-btn-danger' : ''}`;
        button.dataset.supplementAction = action;
        button.dataset.id = String(item.id);
        button.title = `${t(action, action === 'edit' ? 'Edit' : 'Delete')}: ${categoryName} / ${styleName}`;
        button.setAttribute('aria-label', button.title);
        const icon = document.createElement('i');
        icon.className = `bi bi-${action === 'edit' ? 'pencil' : 'trash'}`;
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);
        buttons.appendChild(button);
      });
      actions.appendChild(buttons);
      table.appendChild(row);
    });
    empty.classList.toggle('d-none', supplements.length > 0);
  }

  async function load(includeOptions = true) {
    const version = ++revision;
    loading = true;
    ready = false;
    showError('');
    retry.classList.add('d-none');
    empty.classList.add('d-none');
    status.textContent = text('loading', 'Loading…');
    updateControls();
    try {
      const [items, eventStyles, eventCategories] = await Promise.all([
        request(`/supplements?event_id=${eventId}`),
        includeOptions ? request(`/styles?event_id=${eventId}`) : styles,
        includeOptions ? request(`/categories?event_id=${eventId}`) : categories
      ]);
      if (version !== revision) return false;
      if (!Array.isArray(items) || !Array.isArray(eventStyles) || !Array.isArray(eventCategories)) throw new Error(text('request_error', 'Unable to complete the request.'));
      supplements = items;
      styles = eventStyles;
      categories = eventCategories;
      ready = true;
      renderCategories(categoryField.value);
      renderStyles(styleField.value);
      renderList();
      status.textContent = !categories.length ? text('no_categories', 'Add event categories before configuring supplements.')
        : styles.length ? '' : text('no_styles', 'Add event styles before configuring supplements.');
      return true;
    } catch (error) {
      if (version !== revision) return false;
      status.textContent = '';
      showError(error.message || text('request_error', 'Unable to complete the request.'));
      retry.classList.remove('d-none');
      return false;
    } finally {
      if (version === revision) {
        loading = false;
        updateControls();
      }
    }
  }

  async function write(method, id, body) {
    busy = true;
    showError('');
    status.textContent = text('saving', 'Saving…');
    updateControls();
    try {
      await request(`/supplements${id == null ? '' : `/${id}`}`, { method, body });
      resetForm();
      if (await load(false)) status.textContent = text('saved', 'Changes saved.');
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
    if (busy || loading || !ready) return;
    const categoryId = Number(categoryField.value);
    categoryField.setCustomValidity(categories.some(category => Number(category.id) === categoryId) ? '' : text('select_category', 'Select a category'));
    const styleId = Number(styleField.value);
    styleField.setCustomValidity(styles.some(style => Number(style.id) === styleId) ? '' : text('select_style', 'Select a style'));
    // Like category prices, display euros and send an integer number of cents.
    const rawPrice = priceField.value.trim().replace(',', '.');
    const [whole, fraction = ''] = rawPrice.split('.');
    const price = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    priceField.setCustomValidity(/^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(rawPrice) && Number.isSafeInteger(price) && price >= 0
      ? '' : text('invalid_price', 'Enter a non-negative price with up to two decimal places.'));
    form.classList.add('was-validated');
    if (!form.reportValidity()) return;
    if (hasSupplement(categoryId, styleId)) {
      showError(text('duplicate', 'This category and style combination already has a supplement. Edit the existing entry.'));
      return;
    }
    await write(editingId == null ? 'POST' : 'PUT', editingId, { event_id: eventId, category_id: categoryId, style_id: styleId, price });
  });

  table.addEventListener('click', async event => {
    const button = event.target.closest('[data-supplement-action]');
    if (!button || busy || loading || !ready || !sameEvent()) return;
    const item = supplements.find(item => String(item.id) === button.dataset.id);
    if (!item) return;
    if (button.dataset.supplementAction === 'delete') {
      if (window.confirm(text('delete_confirm', 'Delete this category and style supplement?'))) await write('DELETE', item.id);
      return;
    }
    resetForm();
    editingId = Number(item.id);
    renderCategories(item.category_id);
    renderStyles(item.style_id);
    priceField.value = (Number(item.price) / 100).toFixed(2);
    saveButton.dataset.i18n = 'save';
    saveButton.textContent = t('save', 'Save');
    cancelButton.classList.remove('d-none');
    showError('');
    status.textContent = text('editing', 'Editing supplement');
    updateControls();
    categoryField.focus();
  });

  cancelButton.addEventListener('click', () => {
    if (busy || loading) return;
    resetForm();
    showError('');
    status.textContent = '';
    updateControls();
    categoryField.focus();
  });
  categoryField.addEventListener('change', () => {
    categoryField.setCustomValidity('');
    renderStyles(styleField.value);
    styleField.setCustomValidity('');
    showError('');
    updateControls();
  });
  [categoryField, styleField, priceField].forEach(field => field.addEventListener('input', () => field.setCustomValidity('')));
  retry.addEventListener('click', () => { if (!busy && !loading) load(); });
  openButton.addEventListener('click', () => { if (getRegistrationRole() === 'organizer') modal.show(); });
  modalElement.addEventListener('show.bs.modal', () => {
    eventId = Number(getEvent()?.id);
    supplements = [];
    styles = [];
    categories = [];
    table.replaceChildren();
    resetForm();
    load();
  });
  modalElement.addEventListener('hide.bs.modal', event => { if (busy) event.preventDefault(); });
  modalElement.addEventListener('hidden.bs.modal', () => {
    revision++;
    openButton.focus();
  });
}
