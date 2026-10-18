/* Extras stay in Registration's navigation, authentication and payment lifecycle.
 * Extras API money is in euros; existing Registration finance helpers use cents. */
window.RegistrationExtras = (() => {
  'use strict';
  const state = {
    role: '', eventKey: '', featureOn: false, initialized: false, generation: 0,
    summaries: new Map(), summaryIds: [], financeReady: false, financeError: '',
    financeRequest: null, financeRevision: 0, account: null, accountTab: 'bookings',
    contexts: new Map(), dialog: null, dialogVersion: 0
  };
  const resourceLabels = { workshops: 'workshops', packs: 'packs', services: 'services', 'discount-codes': 'discounts', bookings: 'bookings' };
  const moneyFields = ['registrations_amount', 'validated_extras_amount', 'gross_amount', 'applied_discount_amount', 'effective_discount_amount', 'total_amount'];
  const text = (key) => t(`extras_${key}`);
  const html = (value) => escapeRegistrationTooltipHtml(String(value ?? ''));
  const enabled = () => getEvent()?.hasWorkshopsServices === true && ['school', 'organizer'].includes(state.role);
  const admin = () => state.role === 'organizer';
  const sameEvent = (generation) => generation === state.generation && enabled() && String(getEvent()?.id) === state.eventKey;
  const money = (value) => new Intl.NumberFormat(getRegistrationLanguage(), { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
  const date = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString(getRegistrationLanguage(), { dateStyle: 'medium', timeStyle: 'short' });
  };
  const isActive = (item) => item?.is_active === true || Number(item?.is_active) === 1;
  const id = (value) => {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result <= 0) throw new Error(text('invalid_selection'));
    return result;
  };
  const ids = (item) => [...new Set((item?.workshop_ids || item?.workshops?.map(w => w.id) || []).map(Number))];
  const sameIds = (a, b) => a.length === b.length && a.every(value => b.includes(value));
  const participantName = (item) => item?.name || [item?.first_name, item?.last_name].filter(Boolean).join(' ');
  const bookingAttendee = (item, participants = []) => participantName(participants.find(person => String(person.id) === String(item.attendee_id)))
    || participantName(item.attendee) || participantName(item.participant) || item.attendee_name || item.participant_name
    || [item.attendee_first_name, item.attendee_last_name].filter(Boolean).join(' ') || '—';
  const bookingConcept = (item) => item.pack?.name || item.pack_name || item.service?.name || item.service_name || item.workshop?.name || item.workshop_name || item.workshops?.map(w => w.name).join(', ') || item.item_name || item.name || '—';
  const accountName = (item) => item.account?.name || item.registration_school?.name || item.school?.name || item.account_name || item.school_name || `#${item.registration_school_id ?? '—'}`;
  const typeName = (type) => text({ WORKSHOP: 'workshop', PACK: 'pack', SERVICE: 'service' }[type] || 'type');
  const button = (action, label, value = '', variant = 'outline-primary') => `<button type="button" class="btn btn-${variant} btn-sm" data-extras-action="${action}" data-id="${html(value)}">${html(label)}</button>`;
  const notice = (message, kind = 'danger') => `<div class="alert alert-${kind} mb-3" role="${kind === 'danger' ? 'alert' : 'status'}">${html(message)}</div>`;
  const loading = () => `<div class="py-4 text-center" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${html(text('loading'))}</div>`;
  const status = (value) => `<span class="lm-status lm-status-${{ PENDING: 'warning', VALIDATED: 'success', REJECTED: 'danger' }[value] || 'neutral'}">${html(text(String(value || '').toLowerCase()))}</span>`;
  const fieldLabel = (label, value) => `<div><dt>${html(label)}</dt><dd>${value}</dd></div>`;

  async function request(path, { method = 'GET', body, query } = {}) {
    if (!enabled()) throw new Error(text('unavailable'));
    const generation = state.generation;
    // Use the existing bearer-token helper; it adds numeric X-Event-Id only for admins.
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== '' && value != null) params.set(key, String(value));
    });
    const suffix = params.size ? `?${params}` : '';
    const options = { method };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const response = await lumoraApiFetch(`/api/extras${path}${suffix}`, options, { auth: 'required', eventContext: 'current' });
    let data;
    try { data = await response.json(); } catch { data = null; }
    if (!sameEvent(generation)) throw new Error(text('event_changed'));
    if (!response.ok) {
      const error = new Error(data?.error || t(`extras_error_${response.status}`, text('request_error')));
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function accountBase(accountId = null) {
    return accountId != null ? `/admin/accounts/${id(accountId)}` : '';
  }
  function resourcePath(resource, accountId = null) {
    if (accountId != null) return `${accountBase(accountId)}/${resource}`;
    return `${admin() ? '/admin' : ''}/${resource}`;
  }
  function summaryPath(accountId = null) {
    return accountId != null ? `${accountBase(accountId)}/summary` : '/account/summary';
  }
  function discountPath(accountId = null) {
    return accountId != null ? `${accountBase(accountId)}/discount` : '/account/discount';
  }
  function checkedSummary(summary) {
    if (!summary || moneyFields.some(key => !Number.isFinite(Number(summary[key])) || summary[key] == null)) throw new Error(text('invalid_response'));
    return summary;
  }
  function getFinanceSummary(accountId = null) {
    if (!enabled()) return null;
    let rows;
    if (!admin()) rows = [state.summaries.get('self')];
    else if (accountId != null) rows = [state.summaries.get(String(accountId))];
    else {
      if (!state.financeReady) return null;
      rows = state.summaryIds.map(key => state.summaries.get(key));
    }
    if (rows.some(row => !row)) return null;
    // Convert once at the boundary. Never add extras to API total_amount again.
    return Object.fromEntries(moneyFields.map(key => [key, rows.reduce((sum, row) => sum + Math.round(Number(row[key] || 0) * 100), 0)]));
  }
  function notifyFinance() {
    window.dispatchEvent(new CustomEvent('registration:extras-finance-updated'));
  }
  async function refreshFinance() {
    if (!enabled()) return;
    state.financeRevision += 1;
    if (state.financeRequest) return state.financeRequest;
    const generation = state.generation;
    const run = async () => {
      let revision;
      do {
        revision = state.financeRevision;
        state.financeError = '';
        try {
          if (!admin()) {
            const summary = checkedSummary(await request(summaryPath()));
            state.summaries.set('self', summary);
          } else {
            const accounts = await fetchEventSchools();
            if (!sameEvent(generation)) return;
            const accountIds = [...new Set(accounts.map(account => String(id(account.id))))];
            const results = new Map();
            // The contract has per-account summaries only. Bound concurrent requests.
            let cursor = 0;
            const workers = await Promise.allSettled(Array.from({ length: Math.min(4, accountIds.length) }, async () => {
              while (cursor < accountIds.length && sameEvent(generation)) {
                const accountId = accountIds[cursor++];
                results.set(accountId, checkedSummary(await request(summaryPath(accountId))));
              }
            }));
            const failure = workers.find(result => result.status === 'rejected');
            if (failure) throw failure.reason;
            if (!sameEvent(generation)) return;
            state.summaries = results;
            state.summaryIds = accountIds;
          }
          state.financeReady = true;
        } catch (error) {
          if (!sameEvent(generation)) return;
          state.financeReady = false;
          state.summaries.clear();
          state.financeError = error.message;
        }
        if (!sameEvent(generation)) return;
        notifyFinance();
        renderFinance();
      } while (revision !== state.financeRevision);
    };
    const pending = run();
    state.financeRequest = pending;
    try { await pending; } finally { if (state.financeRequest === pending) state.financeRequest = null; }
  }

  function summaryMarkup(summary, cents = false) {
    if (!summary) return '';
    return `<dl class="extras-finance-grid mb-0">${['registrations_amount', 'validated_extras_amount', 'gross_amount', 'effective_discount_amount', 'total_amount'].map(key =>
      fieldLabel(text(key), html(money(Number(summary[key]) / (cents ? 100 : 1))))).join('')}</dl>`;
  }
  function renderFinance() {
    const mount = document.getElementById('registrationExtrasFinance');
    if (!mount || !enabled()) return;
    mount.classList.remove('d-none');
    let card = mount.querySelector('[data-extras-finance-summary]');
    if (!card) {
      mount.innerHTML = `<div class="lm-card lm-card-body" data-extras-finance-summary></div>${!admin() ? '<div class="lm-card lm-card-body mt-3" data-extras-discount></div>' : ''}`;
      card = mount.querySelector('[data-extras-finance-summary]');
      if (!admin()) loadDiscount(mount.querySelector('[data-extras-discount]'));
    }
    const filter = document.getElementById('registrationPaymentsSharedSchoolFilter')?.value || '';
    const selectedId = filter.startsWith('id:') ? filter.slice(3) : filter ? '__unresolved__' : null;
    const summary = getFinanceSummary(selectedId);
    card.innerHTML = state.financeError
      ? notice(state.financeError) + button('finance-retry', text('retry'))
      : summary ? summaryMarkup(summary, true) : state.financeReady ? notice(text('unavailable'), 'warning') : loading();
    // The API's registrations_amount already includes the registration charge.
    document.querySelector('#payments .registration-payments-combined-metric')?.classList.toggle('d-none', Boolean(summary));
  }

  async function loadDiscount(mount, accountId = null) {
    if (!mount || !enabled()) return;
    const generation = state.generation;
    const version = String(Number(mount.dataset.version || 0) + 1);
    mount.dataset.version = version;
    mount.dataset.accountId = accountId == null ? '' : String(accountId);
    mount.innerHTML = loading();
    try {
      const discount = await request(discountPath(accountId));
      if (!sameEvent(generation) || mount.dataset.version !== version) return;
      const application = discount ? `<p>${html(discount.code || discount.discount_code?.code || text('active_discount'))} · ${html(money(discount.applied_amount))}</p>${button('discount-remove', text('remove_discount'), '', 'outline-danger')}` :
        `<form data-extras-discount-form class="extras-discount-form"><div><label class="form-label" for="extras-code-${accountId ?? 'self'}">${html(text('promo_code'))}</label><input class="form-control lm-input" id="extras-code-${accountId ?? 'self'}" name="code" required autocomplete="off"></div><button class="btn btn-primary" type="submit">${html(text('apply'))}</button></form>`;
      mount.innerHTML = `<h3 class="h6">${html(text('discount'))}</h3><div data-extras-feedback></div>${application}`;
    } catch (error) {
      if (sameEvent(generation) && mount.dataset.version === version) mount.innerHTML = notice(error.message) + button('discount-retry', text('retry'));
    }
  }

  function createContext(mount, resource, accountId = null) {
    const ctx = { mount, resource, accountId, rows: [], page: 1, pageSize: 20, filters: {}, pagination: null, request: 0 };
    state.contexts.set(mount, ctx);
    return ctx;
  }
  function titleFor(ctx) {
    return text(ctx.resource === 'bookings' && !admin() ? 'my_bookings' : resourceLabels[ctx.resource]);
  }
  function canManage(ctx) {
    return admin() && ctx.resource !== 'bookings';
  }
  function buildShell(ctx) {
    ctx.mount.innerHTML = `<div class="extras-heading"><h2 class="h4 mb-0">${html(titleFor(ctx))}</h2><div class="extras-actions">${canManage(ctx) || (ctx.resource === 'bookings' && ctx.accountId != null) ? button('create', text('add')) : ''}${button('refresh', text('refresh'), '', 'outline-secondary')}</div></div>
      <div data-extras-feedback aria-live="polite"></div>
      ${ctx.resource === 'bookings' ? bookingFilters(ctx) : ''}
      <div data-extras-list aria-live="polite"></div>`;
  }
  function selectFilter(name, label, options, value = '') {
    return `<div><label class="form-label" for="extras-filter-${name}">${html(label)}</label><select class="form-select lm-input" id="extras-filter-${name}" name="${name}"><option value="">${html(text('all'))}</option>${options.map(([key, caption]) => `<option value="${html(key)}"${String(value) === String(key) ? ' selected' : ''}>${html(caption)}</option>`).join('')}</select></div>`;
  }
  function bookingFilters(ctx) {
    // Unique prefixes allow the account dialog and the event list to coexist.
    const prefix = ctx.accountId == null ? ctx.mount.id : `account-${ctx.accountId}`;
    let fields = selectFilter('status', text('status'), ['PENDING', 'VALIDATED', 'REJECTED'].map(value => [value, text(value.toLowerCase())]), ctx.filters.status)
      + selectFilter('item_type', text('type'), ['WORKSHOP', 'PACK', 'SERVICE'].map(value => [value, typeName(value)]), ctx.filters.item_type);
    if (admin() && ctx.accountId == null) {
      fields += selectFilter('registration_school_id', text('account'), registrationState.schools.map(account => [account.id, account.name || account.school_name]), ctx.filters.registration_school_id);
      fields += selectFilter('user_type', text('audience'), [['SCH', text('school')], ['PAR', text('individual')]], ctx.filters.user_type);
      fields += ['workshop_id', 'pack_id', 'service_id', 'attendee_id'].map(name => `<div><label class="form-label" for="extras-filter-${name}">${html(text(name))}</label><input class="form-control lm-input" type="number" min="1" step="1" id="extras-filter-${name}" name="${name}" value="${html(ctx.filters[name] || '')}"></div>`).join('');
    }
    fields += selectFilter('page_size', text('page_size'), [10, 20, 50, 100].map(value => [value, value]), ctx.pageSize).replace(/<option value="">.*?<\/option>/, '');
    fields = fields.replaceAll('extras-filter-', `extras-filter-${prefix}-`);
    return `<form data-extras-filters class="extras-filters lm-card lm-card-body mb-3">${fields}<div class="extras-actions align-self-end"><button type="submit" class="btn btn-primary btn-sm">${html(text('filter'))}</button>${button('clear-filters', text('clear'), '', 'outline-secondary')}</div></form>`;
  }
  async function loadContext(ctx) {
    if (!enabled()) return;
    const generation = state.generation;
    const serial = ++ctx.request;
    const list = ctx.mount.querySelector('[data-extras-list]');
    if (!list) return;
    list.innerHTML = loading();
    list.setAttribute('aria-busy', 'true');
    try {
      if (ctx.resource === 'bookings' && admin() && ctx.accountId == null && !registrationState.schools.length) {
        await fetchEventSchools();
        if (!sameEvent(generation) || serial !== ctx.request) return;
        const form = ctx.mount.querySelector('[data-extras-filters]');
        if (form) form.outerHTML = bookingFilters(ctx);
      }
      const query = ctx.resource === 'bookings' ? { ...ctx.filters, page: ctx.page, page_size: ctx.pageSize } : undefined;
      const data = await request(resourcePath(ctx.resource, ctx.accountId), { query });
      if (!sameEvent(generation) || serial !== ctx.request) return;
      ctx.rows = ctx.resource === 'bookings' ? data?.data : data;
      if (!Array.isArray(ctx.rows)) throw new Error(text('invalid_response'));
      ctx.pagination = ctx.resource === 'bookings' ? data.pagination : null;
      if (ctx.pagination && ctx.page > Math.max(1, ctx.pagination.total_pages)) {
        ctx.page = Math.max(1, ctx.pagination.total_pages);
        return loadContext(ctx);
      }
      if (ctx.resource === 'bookings' && ctx.rows.some(row => row.attendee_id != null)) {
        let participants = [];
        try {
          participants = await loadBookingParticipants(ctx.accountId);
        } catch (error) {
          const feedback = ctx.mount.querySelector('[data-extras-feedback]');
          if (sameEvent(generation) && serial === ctx.request && feedback) feedback.innerHTML = notice(error.message, 'warning');
        }
        if (!sameEvent(generation) || serial !== ctx.request) return;
        ctx.participants = participants;
      }
      renderList(ctx);
    } catch (error) {
      if (sameEvent(generation) && serial === ctx.request) list.innerHTML = notice(error.message) + button('refresh', text('retry'));
    } finally {
      if (serial === ctx.request) list.removeAttribute('aria-busy');
    }
  }

  function occupancyMarkup(item) {
    const capacity = Math.max(0, Number(item.capacity) || 0);
    const validated = Number(item.validated_count) || 0;
    const percent = capacity ? Math.min(100, Math.max(0, validated / capacity * 100)) : 0;
    return `<div class="extras-occupancy"><div class="extras-occupancy-track" role="progressbar" aria-label="${html(text('validated_count'))}" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${validated}"><span style="width:${percent}%"></span></div><span>${html(text('validated_count'))}: ${validated} · ${html(text('pending_count'))}: ${html(item.pending_count ?? '—')} · ${html(text('available_count'))}: ${html(item.available_count ?? '—')}</span></div>`;
  }
  function columns(ctx) {
    if (ctx.resource === 'workshops') return ['name', 'teacher', 'start_at', 'end_at', 'price', 'capacity', 'occupancy', 'status'];
    if (ctx.resource === 'packs') return ['name', 'mode', 'workshop_count', 'workshops', 'price', 'status'];
    if (ctx.resource === 'services') return ['name', 'description', 'price', 'status'];
    if (ctx.resource === 'discount-codes') return ['code', 'amount', 'audience', 'valid_from', 'valid_until', 'max_uses', 'status'];
    return [...(admin() && ctx.accountId == null ? ['account'] : []), 'type', 'concept', 'attendee', 'quantity', 'amount', 'status', 'created_at'];
  }
  function cell(ctx, row, key) {
    if (key === 'status') return ctx.resource === 'bookings' ? status(row.status) : `<span class="lm-status lm-status-${isActive(row) ? 'success' : 'neutral'}">${html(text(isActive(row) ? 'active' : 'inactive'))}</span>`;
    if (key === 'occupancy') return occupancyMarkup(row);
    if (key === 'price' || key === 'amount') return html(money(ctx.resource === 'bookings' ? row.total_amount : row[key]));
    if (['start_at', 'end_at', 'valid_from', 'valid_until', 'created_at'].includes(key)) return html(date(row[key]));
    if (key === 'max_uses') return html(row.max_uses ?? text('unlimited'));
    if (key === 'audience') return html(text({ SCH: 'school', PAR: 'individual', BOTH: 'both' }[row.audience] || 'both'));
    if (key === 'mode') return html(text(row.mode === 'FLEX' ? 'flex' : 'fixed'));
    if (key === 'type') return html(typeName(row.item_type));
    if (key === 'concept') return html(bookingConcept(row));
    if (key === 'attendee') return html(bookingAttendee(row, ctx.participants));
    if (key === 'account') return html(accountName(row));
    if (key === 'workshops') return html((row.workshops || []).map(w => w.name).join(', ') || ids(row).map(value => `#${value}`).join(', ') || '—');
    return html(row[key] ?? '—');
  }
  function actions(ctx, row) {
    let result = button('details', text('details'), row.id);
    if (ctx.resource === 'bookings') {
      if (row.status === 'PENDING') {
        if (admin() && ctx.accountId == null) result += button('validate', text('validate'), row.id, 'outline-success') + button('reject', text('reject'), row.id, 'outline-danger');
        else result += button('edit', t('edit'), row.id) + button('delete', t('delete'), row.id, 'outline-danger');
      }
    } else if (canManage(ctx)) {
      result += button('edit', t('edit'), row.id) + button('delete', t('delete'), row.id, 'outline-danger');
      result += button('toggle', text(isActive(row) ? 'deactivate' : 'activate'), row.id, 'outline-secondary');
    }
    return `<div class="extras-actions">${result}</div>`;
  }
  function renderList(ctx) {
    const list = ctx.mount.querySelector('[data-extras-list]');
    if (!list) return;
    const keys = columns(ctx);
    list.innerHTML = ctx.rows.length ? `<div class="table-responsive extras-desktop-table lm-card"><table class="table lm-table align-middle"><caption class="visually-hidden">${html(titleFor(ctx))}</caption><thead><tr>${keys.map(key => `<th scope="col">${html(text(key))}</th>`).join('')}<th scope="col">${html(text('actions'))}</th></tr></thead><tbody>${ctx.rows.map(row => `<tr>${keys.map(key => `<td>${cell(ctx, row, key)}</td>`).join('')}<td>${actions(ctx, row)}</td></tr>`).join('')}</tbody></table></div>
      <div class="extras-mobile-list">${ctx.rows.map(row => `<article class="lm-card lm-card-body"><dl class="extras-detail-grid">${keys.map(key => fieldLabel(text(key), cell(ctx, row, key))).join('')}</dl>${actions(ctx, row)}</article>`).join('')}</div>` : `<p class="text-body-secondary py-4">${html(text('empty'))}</p>`;
    if (ctx.pagination) {
      const page = Number(ctx.pagination.page) || ctx.page;
      const pages = Number(ctx.pagination.total_pages) || 0;
      list.insertAdjacentHTML('beforeend', `<nav class="extras-pagination" aria-label="${html(text('pagination'))}"><button class="btn btn-outline-secondary btn-sm" type="button" data-extras-action="previous"${page <= 1 ? ' disabled' : ''}>${html(text('previous'))}</button><span>${page} / ${Math.max(1, pages)} · ${html(ctx.pagination.total_items)} ${html(text('results'))}</span><button class="btn btn-outline-secondary btn-sm" type="button" data-extras-action="next"${page >= pages ? ' disabled' : ''}>${html(text('next'))}</button></nav>`);
    }
  }

  function catalogPath(resource) { return `${admin() ? '/admin' : '/catalog'}/${resource}`; }
  async function loadCatalog(mount, resource) {
    const serial = String(Number(mount.dataset.request || 0) + 1);
    mount.dataset.request = serial;
    const generation = state.generation;
    mount.innerHTML = `<div class="extras-heading"><h2 class="h4">${html(text(resourceLabels[resource]))}</h2>${button('catalog-refresh', text('refresh'), resource, 'outline-secondary')}</div><div data-extras-catalog-list>${loading()}</div>`;
    const list = mount.querySelector('[data-extras-catalog-list]');
    try {
      const resources = resource === 'workshops' ? ['workshops', 'packs'] : ['services'];
      const results = await Promise.all(resources.map(item => request(`/catalog/${item}`)));
      if (!sameEvent(generation) || mount.dataset.request !== serial) return;
      list.innerHTML = resources.map((kind, index) => `<section class="mb-4"><h3 class="h5">${html(text(resourceLabels[kind]))}</h3><div class="extras-catalog-grid">${results[index].map(item => catalogCard(kind, item)).join('') || `<p>${html(text('empty'))}</p>`}</div></section>`).join('');
    } catch (error) {
      if (sameEvent(generation) && mount.dataset.request === serial) list.innerHTML = notice(error.message) + button('catalog-refresh', text('retry'), resource);
    }
  }
  function workshopDescription(item) {
    return `<p class="small text-body-secondary mb-2">${html(item.teacher || '')}<br>${html(date(item.start_at))} – ${html(date(item.end_at))}</p>${occupancyMarkup(item)}`;
  }
  function catalogCard(resource, item) {
    const packWorkshops = resource === 'packs' ? `<p>${html(text(item.mode === 'FLEX' ? 'flex' : 'fixed'))} · ${html(item.workshop_count)} ${html(text('workshops'))}</p><ul class="extras-workshop-summary">${(item.workshops || []).map(w => `<li>${html(w.name)} · ${html(w.teacher || '')}<br><small>${html(date(w.start_at))} – ${html(date(w.end_at))}</small></li>`).join('')}</ul>` : '';
    return `<article class="lm-card lm-card-body extras-catalog-card"><h4 class="h6">${html(item.name)}</h4><p class="extras-description text-body-secondary">${html(item.description || '')}</p>${resource === 'workshops' ? workshopDescription(item) : packWorkshops}<div class="extras-catalog-card-footer"><strong>${html(money(item.price))}</strong><button type="button" class="btn btn-primary btn-sm" data-extras-action="book" data-resource="${resource}" data-id="${html(item.id)}">${html(text('book'))}</button></div></article>`;
  }

  async function openDialog(title, content, onSave = null, saveLabel = t('save')) {
    const version = ++state.dialogVersion;
    const generation = state.generation;
    const accountModal = document.getElementById('schoolDetailsModal');
    const restoreAccount = accountModal?.classList.contains('show');
    if (restoreAccount) {
      await new Promise(resolve => {
        const hide = () => bootstrap.Modal.getOrCreateInstance(accountModal).hide();
        accountModal.addEventListener('shown.bs.modal', hide, { once: true });
        accountModal.addEventListener('hidden.bs.modal', () => {
          accountModal.removeEventListener('shown.bs.modal', hide);
          resolve();
        }, { once: true });
        hide();
      });
    }
    if (version !== state.dialogVersion || !enabled()) return;
    let modal = document.getElementById('registrationExtrasModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'registrationExtrasModal';
      modal.className = 'modal fade lm-modal registration-extras';
      modal.tabIndex = -1;
      modal.setAttribute('aria-labelledby', 'registrationExtrasModalTitle');
      modal.setAttribute('aria-hidden', 'true');
      modal.addEventListener('hide.bs.modal', event => {
        if (modal.querySelector('form')?.dataset.saving === 'true') event.preventDefault();
      });
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title fs-5" id="registrationExtrasModalTitle">${html(title)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${html(t('close'))}"></button></div><form data-extras-editor><div class="modal-body"><div data-extras-dialog-feedback aria-live="polite"></div>${content}</div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${html(t('close'))}</button>${onSave ? `<button type="submit" class="btn btn-primary">${html(saveLabel)}</button>` : ''}</div></form></div></div>`;
    const instance = bootstrap.Modal.getOrCreateInstance(modal, { backdrop: 'static' });
    state.dialog = modal;
    const form = modal.querySelector('form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!onSave || !form.reportValidity() || form.dataset.saving === 'true') return;
      const submit = form.querySelector('[type="submit"]');
      form.dataset.saving = 'true';
      submit.disabled = true;
      // Prevent closing or resubmission while a mutation is in flight.
      const dismiss = [...modal.querySelectorAll('[data-bs-dismiss]')];
      dismiss.forEach(button => { button.disabled = true; });
      let saved = false;
      try {
        await onSave(form);
        saved = true;
      } catch (error) {
        modal.querySelector('[data-extras-dialog-feedback]').innerHTML = notice(error.message);
      } finally {
        form.dataset.saving = 'false';
        submit.disabled = false;
        dismiss.forEach(button => { button.disabled = false; });
      }
      if (saved) instance.hide();
    });
    modal.addEventListener('hidden.bs.modal', () => {
      if (state.dialog === modal) state.dialog = null;
      if (restoreAccount && sameEvent(generation)) bootstrap.Modal.getOrCreateInstance(accountModal).show();
    }, { once: true });
    instance.show();
    modal.addEventListener('shown.bs.modal', () => form.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])')?.focus(), { once: true });
    return form;
  }

  function localDateTime(value) {
    if (!value) return '';
    if (!/(Z|[+-]\d\d:\d\d)$/.test(value)) return String(value).replace(' ', 'T').slice(0, 16);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function input(name, value = '', { type = 'text', required = false, min, step, disabled = false } = {}) {
    const valueText = type === 'datetime-local' ? localDateTime(value) : value ?? '';
    return `<div class="extras-form-field"><label class="form-label" for="extras-field-${name}">${html(text(name))}${required ? ' *' : ''}</label><input class="form-control lm-input" id="extras-field-${name}" name="${name}" type="${type}" value="${html(valueText)}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}${min != null ? ` min="${min}"` : ''}${step != null ? ` step="${step}"` : ''}></div>`;
  }
  function select(name, options, value, required = true, disabled = false) {
    return `<div class="extras-form-field"><label class="form-label" for="extras-field-${name}">${html(text(name))}</label><select class="form-select lm-input" id="extras-field-${name}" name="${name}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}>${options.map(([key, label]) => `<option value="${html(key)}"${String(key) === String(value) ? ' selected' : ''}>${html(label)}</option>`).join('')}</select></div>`;
  }
  function workshopSelector(workshops, selected = [], disabled = false) {
    return `<fieldset class="extras-workshop-selector"${disabled ? ' disabled' : ''}><legend class="fs-6">${html(text('workshops'))}</legend><p class="small text-body-secondary" data-extras-selection-hint></p><p class="small" data-extras-selection-count aria-live="polite"></p><div class="extras-workshop-options">${workshops.map(w => `<label class="extras-workshop-option"><input class="form-check-input" type="checkbox" name="workshop_ids" value="${html(w.id)}"${selected.includes(Number(w.id)) ? ' checked' : ''}><span><strong>${html(w.name)}</strong><small>${html(w.teacher || '')} · ${html(date(w.start_at))}</small></span></label>`).join('') || `<p>${html(text('empty'))}</p>`}</div></fieldset>`;
  }
  function selectedWorkshops(form) { return [...form.querySelectorAll('[name="workshop_ids"]:checked')].map(item => id(item.value)); }
  function bindWorkshopCounter(form, getRequirement) {
    const update = () => {
      const requirement = getRequirement();
      const selected = selectedWorkshops(form).length;
      const count = form.querySelector('[data-extras-selection-count]');
      if (count) count.textContent = `${text('selected')}: ${selected} / ${requirement.count}`;
      const hint = form.querySelector('[data-extras-selection-hint]');
      if (hint) hint.textContent = text(requirement.minimum ? 'select_minimum' : 'select_exactly').replace('{count}', requirement.count);
    };
    form.addEventListener('change', update);
    form.addEventListener('input', update);
    update();
  }
  function validatePack(mode, count, selected) {
    if (!['FIXED', 'FLEX'].includes(mode) || !Number.isSafeInteger(count) || count < 1 || new Set(selected).size !== selected.length || (mode === 'FIXED' ? selected.length !== count : selected.length < count)) throw new Error(text('pack_selection_invalid'));
  }

  async function openEditor(ctx, row = null) {
    let original = row ? await request(`${resourcePath(ctx.resource, ctx.accountId)}/${id(row.id)}`) : {};
    const resource = ctx.resource;
    if (resource === 'bookings') return openBookingEditor(ctx, original);
    let locked = false;
    if (resource === 'discount-codes' && row) {
      const usage = await request(`/admin/discount-codes/${id(row.id)}/usage`);
      locked = Number(usage.used_count) > 0;
    }
    let workshops = [];
    if (resource === 'packs') workshops = await request('/admin/workshops');
    const common = resource !== 'discount-codes';
    let fields = common ? input('name', original.name, { required: true }) + `<div class="extras-form-field"><label class="form-label" for="extras-field-description">${html(text('description'))}</label><textarea class="form-control lm-input" id="extras-field-description" name="description" rows="3">${html(original.description || '')}</textarea></div>` : '';
    if (resource === 'workshops') {
      fields += input('teacher', original.teacher, { required: true }) + input('start_at', original.start_at, { type: 'datetime-local', required: true }) + input('end_at', original.end_at, { type: 'datetime-local', required: true }) + input('capacity', original.capacity, { type: 'number', min: 1, step: 1, required: true });
    }
    if (resource === 'packs') fields += select('mode', [['FIXED', text('fixed')], ['FLEX', text('flex')]], original.mode || 'FIXED') + input('workshop_count', original.workshop_count || 1, { type: 'number', min: 1, step: 1, required: true });
    if (common) fields += input('price', original.price ?? '', { type: 'number', min: 0, step: '0.01', required: true });
    if (resource === 'discount-codes') {
      fields += input('code', original.code, { required: true, disabled: locked }) + input('amount', original.amount, { type: 'number', min: '0.01', step: '0.01', required: true, disabled: locked })
        + select('audience', [['SCH', text('school')], ['PAR', text('individual')], ['BOTH', text('both')]], original.audience || 'BOTH', true, locked)
        + input('valid_from', original.valid_from, { type: 'datetime-local', disabled: locked }) + input('valid_until', original.valid_until, { type: 'datetime-local', disabled: locked })
        + input('max_uses', original.max_uses, { type: 'number', min: 1, step: 1, disabled: locked });
    }
    fields += `<div class="extras-form-field"><label class="form-check"><input class="form-check-input" type="checkbox" name="is_active"${!row || isActive(original) ? ' checked' : ''}><span class="form-check-label">${html(text('active'))}</span></label></div>`;
    const composition = resource === 'packs' ? workshopSelector(workshops, ids(original)) : '';
    const form = await openDialog(`${row ? t('edit') : text('add')} · ${titleFor(ctx)}`, `${locked ? notice(text('discount_locked'), 'info') : ''}<div class="extras-form-grid">${fields}</div>${composition}`, async (form) => {
      const values = Object.fromEntries(new FormData(form));
      const payload = {};
      const keys = resource === 'discount-codes' ? (locked ? [] : ['code', 'amount', 'audience', 'valid_from', 'valid_until', 'max_uses']) : ['name', 'description', 'price', ...(resource === 'workshops' ? ['teacher', 'start_at', 'end_at', 'capacity'] : []), ...(resource === 'packs' ? ['mode', 'workshop_count'] : [])];
      keys.forEach(key => {
        let value = String(values[key] ?? '').trim();
        if (['name', 'teacher', 'code'].includes(key) && !value) throw new Error(text('required_fields'));
        if (['price', 'amount', 'capacity', 'workshop_count', 'max_uses'].includes(key)) value = value === '' && key === 'max_uses' ? null : Number(value);
        if (['valid_from', 'valid_until'].includes(key) && !value) value = null;
        payload[key] = value;
      });
      payload.is_active = form.elements.namedItem('is_active').checked;
      if (payload.start_at && payload.end_at && payload.end_at <= payload.start_at) throw new Error(text('date_order'));
      if (payload.valid_from && payload.valid_until && payload.valid_until < payload.valid_from) throw new Error(text('date_order'));
      const selected = resource === 'packs' ? selectedWorkshops(form) : [];
      if (resource === 'packs') validatePack(payload.mode, payload.workshop_count, selected);
      let data = payload;
      if (row) {
        data = Object.fromEntries(Object.entries(payload).filter(([key, value]) => {
          if (['start_at', 'end_at', 'valid_from', 'valid_until'].includes(key)) return localDateTime(value) !== localDateTime(original[key]);
          if (key === 'is_active') return value !== isActive(original);
          return String(value ?? '') !== String(original[key] ?? '');
        }));
        if (Object.keys(data).length) {
          await request(`${resourcePath(resource, ctx.accountId)}/${id(row.id)}`, { method: 'PATCH', body: data });
          original = { ...original, ...data };
        }
        if (resource === 'packs' && !sameIds(selected, ids(original))) {
          try {
            await request(`/admin/packs/${id(row.id)}/workshops`, { method: 'PUT', body: { workshop_ids: selected } });
          } catch (error) {
            await loadContext(ctx);
            throw new Error(`${text('composition_save_error')} ${error.message}`);
          }
        }
      } else {
        if (resource === 'packs') data.workshop_ids = selected;
        await request(resourcePath(resource, ctx.accountId), { method: 'POST', body: data });
      }
      await afterMutation(ctx, text('saved'));
    });
    if (form && resource === 'packs') bindWorkshopCounter(form, () => ({ count: Number(form.elements.namedItem('workshop_count').value), minimum: form.elements.namedItem('mode').value === 'FLEX' }));
  }

  async function loadBookingParticipants(accountId = null) {
    const generation = state.generation;
    const schoolId = admin() ? accountId : id(getUserFromToken()?.id);
    const participants = await fetchRegistrationParticipants(schoolId);
    if (!sameEvent(generation)) throw new Error(text('event_changed'));
    // Account queries already scope the response; also exclude explicit mismatches.
    return participants.filter(person => schoolId == null || (person.school_id == null && person.school?.id == null)
      || String(person.school_id ?? person.school?.id) === String(schoolId));
  }

  async function openBookingEditor(ctx, original = {}, product = null, productResource = null) {
    if (original.id && original.status !== 'PENDING') throw new Error(text('pending_only'));
    const generation = state.generation;
    const accountId = admin() ? id(ctx.accountId ?? original.registration_school_id) : null;
    let participantError = '';
    const [participants, workshops, packs, services] = await Promise.all([
      loadBookingParticipants(accountId).catch(error => { participantError = error.message; return []; }),
      request(catalogPath('workshops')), request(catalogPath('packs')), request(catalogPath('services'))
    ]);
    if (!sameEvent(generation)) return;
    // A failed lookup must not clear an existing optional service participant.
    if (participantError && original.attendee_id != null) throw new Error(participantError);
    const initialType = original.item_type || ({ workshops: 'WORKSHOP', packs: 'PACK', services: 'SERVICE' }[productResource]) || 'WORKSHOP';
    const products = { WORKSHOP: workshops, PACK: packs, SERVICE: services };
    // Allow an unchanged pending booking to retain an inactive historical product.
    if (original.id) {
      const historical = original.pack || original.service || original.workshop || (original.item_type === 'WORKSHOP' ? original.workshops?.[0] : null);
      const historicalId = original.pack_id || original.service_id || ids(original)[0];
      if (historicalId && !products[initialType].some(item => Number(item.id) === Number(historicalId))) {
        products[initialType].push(historical || { id: historicalId, name: bookingConcept(original), mode: original.pack_mode, workshop_count: original.workshop_count, workshop_ids: ids(original), workshops: original.workshops || [] });
      }
    }
    const initialProductId = product?.id || original.pack_id || original.service_id || ids(original)[0] || '';
    let currentType = initialType;
    let currentProduct = null;
    const fields = `${original.id || product ? '' : select('item_type', ['WORKSHOP', 'PACK', 'SERVICE'].map(value => [value, typeName(value)]), initialType)}<div data-extras-booking-fields></div>`;
    const form = await openDialog(original.id ? t('edit') : text('book'), fields, async form => {
      const payload = bookingPayload(form, currentType, currentProduct, participants);
      if (!original.id && payload.attendee_id === null) delete payload.attendee_id;
      let body = payload;
      if (original.id) {
        delete payload.item_type;
        body = Object.fromEntries(Object.entries(payload).filter(([key, value]) => {
          if (key === 'workshop_ids') return !sameIds(value, ids(original)) || (currentType === 'PACK' && Number(payload.pack_id) !== Number(original.pack_id));
          return String(value ?? '') !== String(original[key] ?? '');
        }));
        if (Object.keys(body).length) await request(`${resourcePath('bookings', ctx.accountId)}/${id(original.id)}`, { method: 'PATCH', body });
      } else await request(resourcePath('bookings', ctx.accountId), { method: 'POST', body });
      await afterMutation(ctx, original.id ? text('saved') : text('booking_pending'));
    }, original.id ? t('save') : text('book'));
    if (!form) return;
    const attendeeOptions = [['', text('select_participant')], ...participants.map(item => [item.id, participantName(item)])];
    const renderProduct = (productId, preserve = false) => {
      const area = form.querySelector('[data-extras-product-fields]');
      currentProduct = products[currentType].find(item => String(item.id) === String(productId));
      if (!currentProduct) { area.innerHTML = ''; return; }
      const item = currentProduct;
      const attendee = form.querySelector('[name="attendee_id"]');
      if (attendee) attendee.required = currentType !== 'SERVICE';
      let content = `<p class="mt-3"><strong>${html(item.name)}</strong>${item.price != null ? ` · ${html(money(item.price))}` : ''}</p>`;
      if (currentType === 'SERVICE') content += input('quantity', preserve ? original.quantity || 1 : 1, { type: 'number', min: 1, step: 1, required: true });
      if (currentType === 'WORKSHOP') content += workshopDescription(item) + `<p class="small text-body-secondary">${html(text('capacity_pending_hint'))}</p>`;
      if (currentType === 'PACK') {
        content += `<p>${html(text(item.mode === 'FLEX' ? 'flex' : 'fixed'))}</p>`;
        if (item.mode === 'FLEX') content += workshopSelector(item.workshops || workshops.filter(w => ids(item).includes(Number(w.id))), preserve ? ids(original) : []);
        else content += `<ul>${(item.workshops || []).map(w => `<li>${html(w.name)} · ${html(date(w.start_at))}</li>`).join('')}</ul>`;
      }
      area.innerHTML = content;
      if (item.mode === 'FLEX' && currentType === 'PACK') {
        const hint = area.querySelector('[data-extras-selection-hint]');
        if (hint) hint.textContent = text('select_exactly').replace('{count}', item.workshop_count);
      }
      updateCounter();
    };
    const updateCounter = () => {
      const count = form.querySelector('[data-extras-selection-count]');
      if (count) count.textContent = `${text('selected')}: ${selectedWorkshops(form).length} / ${currentProduct?.workshop_count ?? 0}`;
    };
    const renderType = (type, productId = '') => {
      currentType = type;
      form.querySelector('[data-extras-booking-fields]').innerHTML = `<div class="extras-form-grid">${select('product_id', [['', text('select_product')], ...products[type].map(item => [item.id, item.name])], productId)}${select('attendee_id', attendeeOptions, original.attendee_id || '', type !== 'SERVICE')}</div>${participantError ? notice(participantError, 'warning') : !participants.length && type !== 'SERVICE' ? notice(text(admin() ? 'account_needs_participants' : 'create_participant_first'), 'info') : ''}<div data-extras-product-fields></div>`;
      form.querySelector('[name="product_id"]').addEventListener('change', event => renderProduct(event.target.value));
      renderProduct(productId, Boolean(original.id));
    };
    form.querySelector('[name="item_type"]')?.addEventListener('change', event => renderType(event.target.value));
    form.addEventListener('change', updateCounter);
    renderType(initialType, initialProductId);
  }

  function bookingPayload(form, type, product, participants) {
    if (!product) throw new Error(text('invalid_selection'));
    const attendeeValue = form.elements.namedItem('attendee_id')?.value;
    const payload = { item_type: type };
    if (attendeeValue) {
      payload.attendee_id = id(attendeeValue);
      if (!participants.some(person => Number(person.id) === payload.attendee_id)) throw new Error(text('invalid_selection'));
    }
    else if (type !== 'SERVICE') throw new Error(text('select_participant'));
    else payload.attendee_id = null;
    if (type === 'WORKSHOP') payload.workshop_ids = [id(product.id)];
    else if (type === 'PACK') {
      payload.pack_id = id(product.id);
      if (product.mode === 'FLEX') {
        const selected = selectedWorkshops(form);
        validatePack('FIXED', Number(product.workshop_count), selected);
        if (!selected.every(value => ids(product).includes(value))) throw new Error(text('pack_selection_invalid'));
        payload.workshop_ids = selected;
      }
    } else if (type === 'SERVICE') {
      payload.service_id = id(product.id);
      payload.quantity = id(form.elements.namedItem('quantity').value);
    } else throw new Error(text('invalid_selection'));
    return payload;
  }

  async function openDetails(ctx, row) {
    const item = await request(`${resourcePath(ctx.resource, ctx.accountId)}/${id(row.id)}`);
    if (ctx.resource === 'bookings' && item.attendee_id != null) {
      ctx.participants = await loadBookingParticipants(ctx.accountId);
    }
    let content = `<dl class="extras-detail-grid">${columns(ctx).map(key => fieldLabel(text(key), cell(ctx, item, key))).join('')}</dl>`;
    if (item.description && !columns(ctx).includes('description')) content += `<p class="extras-description">${html(item.description)}</p>`;
    if (ctx.resource === 'workshops') content += occupancyMarkup(await request(`/admin/workshops/${id(row.id)}/occupancy`));
    if (ctx.resource === 'discount-codes') {
      const usage = await request(`/admin/discount-codes/${id(row.id)}/usage`);
      content += `<h3 class="h6">${html(text('usage'))}</h3><dl class="extras-detail-grid">${['used_count', 'max_uses', 'remaining_uses'].map(key => fieldLabel(text(key), html(usage[key] ?? text('unlimited')))).join('')}</dl>`;
    }
    if (ctx.resource === 'bookings' && item.workshops?.length) content += `<h3 class="h6">${html(text('workshops'))}</h3><ul>${item.workshops.map(w => `<li>${html(w.name)} · ${html(date(w.start_at))}</li>`).join('')}</ul>`;
    await openDialog(text('details'), content);
  }
  async function afterMutation(ctx, message) {
    if (!enabled()) return;
    if (ctx?.mount?.querySelector('[data-extras-list]')) await loadContext(ctx);
    if (ctx?.catalogResource) await loadCatalog(ctx.mount, ctx.catalogResource);
    if (ctx?.mount) {
      const feedback = ctx.mount.querySelector('[data-extras-feedback]');
      if (feedback) feedback.innerHTML = notice(message, 'success');
      else if (ctx.catalogResource) ctx.mount.querySelector('[data-extras-catalog-list]')?.insertAdjacentHTML('afterbegin', notice(message, 'success'));
    }
    // Refresh cached lists next time they are opened; current workshop occupancy also reloads.
    state.contexts.forEach(other => {
      if (other !== ctx && other.mount.classList.contains('active')) loadContext(other);
    });
    await refreshFinance();
    if (state.account && String(ctx?.accountId) === String(state.account.id) && state.accountTab === 'summary') renderAccount();
  }

  async function confirmAction(ctx, action, row) {
    if (ctx.resource === 'bookings' && row.status !== 'PENDING') throw new Error(text('pending_only'));
    const question = text(action === 'delete' ? 'delete_confirm' : action === 'validate' ? 'validate_confirm' : 'reject_confirm');
    await openDialog(text(action === 'delete' ? 'delete' : action), `<p>${html(question)}</p><p class="fw-semibold">${html(row.name || row.code || bookingConcept(row))}</p>`, async () => {
      const path = `${resourcePath(ctx.resource, ctx.accountId)}/${id(row.id)}`;
      // Validation and rejection deliberately have no request body.
      if (action === 'delete') await request(path, { method: 'DELETE' });
      else await request(`/admin/bookings/${id(row.id)}/${action}`, { method: 'POST' });
      await afterMutation(ctx, text('saved'));
    }, t('confirm', text('confirm')));
  }

  async function renderAccount() {
    const mount = document.getElementById('registrationAccountExtras');
    if (!mount || !enabled() || !admin() || !state.account) return;
    const accountId = id(state.account.id);
    const generation = state.generation;
    state.contexts.delete(mount.querySelector('[data-extras-account-content]'));
    mount.classList.remove('d-none');
    mount.innerHTML = `<h2 class="h5">${html(text('account_extras'))}</h2><div class="extras-actions mb-3" role="group" aria-label="${html(text('account_extras'))}">${['bookings', 'summary'].map(tab => `<button type="button" class="btn btn-${tab === state.accountTab ? 'primary' : 'outline-secondary'} btn-sm" data-extras-account-tab="${tab}" aria-pressed="${tab === state.accountTab}">${html(text(tab))}</button>`).join('')}</div><div data-extras-account-content></div>`;
    const area = mount.querySelector('[data-extras-account-content]');
    if (state.accountTab !== 'summary') {
      const ctx = createContext(area, state.accountTab, accountId);
      buildShell(ctx);
      await loadContext(ctx);
    } else {
      area.innerHTML = `<div data-extras-account-summary>${loading()}</div><div class="mt-3" data-extras-discount></div>`;
      loadDiscount(area.querySelector('[data-extras-discount]'), accountId);
      try {
        const summary = checkedSummary(await request(summaryPath(accountId)));
        if (!sameEvent(generation) || state.account?.id !== accountId || state.accountTab !== 'summary' || !area.isConnected) return;
        state.summaries.set(String(accountId), summary);
        area.querySelector('[data-extras-account-summary]').innerHTML = summaryMarkup(summary);
      } catch (error) {
        if (sameEvent(generation) && area.isConnected) area.querySelector('[data-extras-account-summary]').innerHTML = notice(error.message) + button('account-retry', text('retry'));
      }
    }
  }

  function closestContext(element) {
    for (let current = element; current; current = current.parentElement) {
      if (state.contexts.has(current)) return state.contexts.get(current);
    }
    return null;
  }
  function showError(error, element) {
    const feedback = element?.closest('[data-extras-discount]')?.querySelector('[data-extras-feedback]') || closestContext(element)?.mount.querySelector('[data-extras-feedback]');
    if (feedback) feedback.innerHTML = notice(error.message);
    else showMessageModal(error.message, t('error_title', 'Error'));
  }
  async function handleClick(event) {
    const tab = event.target.closest('[data-extras-account-tab]');
    if (tab && enabled()) {
      state.accountTab = tab.dataset.extrasAccountTab;
      await renderAccount();
      return;
    }
    const target = event.target.closest('[data-extras-action]');
    if (!target || target.disabled || !enabled()) return;
    const action = target.dataset.extrasAction;
    const ctx = closestContext(target);
    target.disabled = true;
    try {
      if (action === 'finance-retry') return await refreshFinance();
      if (action === 'account-retry') return await renderAccount();
      if (action === 'discount-retry') {
        const mount = target.closest('[data-extras-discount]');
        return await loadDiscount(mount, mount.dataset.accountId || null);
      }
      if (action === 'discount-remove') {
        const mount = target.closest('[data-extras-discount]');
        const accountId = mount.dataset.accountId || null;
        await openDialog(text('remove_discount'), `<p>${html(text('remove_discount_confirm'))}</p>`, async () => {
          await request(discountPath(accountId), { method: 'DELETE' });
          await loadDiscount(mount, accountId);
          await refreshFinance();
          if (accountId) await renderAccount();
        }, text('remove_discount'));
        return;
      }
      if (action === 'catalog-refresh') return await loadCatalog(target.closest('[data-extras-resource]'), target.dataset.id);
      if (action === 'book') {
        const product = await request(`/catalog/${target.dataset.resource}/${id(target.dataset.id)}`);
        return await openBookingEditor({ mount: target.closest('[data-extras-resource]'), accountId: null, catalogResource: target.closest('[data-extras-resource]').dataset.extrasResource }, {}, product, target.dataset.resource);
      }
      if (!ctx) return;
      if (action === 'refresh') return await loadContext(ctx);
      if (action === 'create') return ctx.resource === 'bookings' ? await openBookingEditor(ctx) : await openEditor(ctx);
      if (['next', 'previous'].includes(action)) {
        ctx.page += action === 'next' ? 1 : -1;
        return await loadContext(ctx);
      }
      if (action === 'clear-filters') {
        ctx.filters = {}; ctx.page = 1; ctx.pageSize = 20;
        buildShell(ctx);
        return await loadContext(ctx);
      }
      const row = ctx.rows.find(item => String(item.id) === target.dataset.id);
      if (!row) return;
      if (action === 'details') await openDetails(ctx, row);
      if (action === 'edit') await openEditor(ctx, row);
      if (['delete', 'validate', 'reject'].includes(action)) await confirmAction(ctx, action, row);
      if (action === 'toggle') {
        await request(`${resourcePath(ctx.resource, ctx.accountId)}/${id(row.id)}`, { method: 'PATCH', body: { is_active: !isActive(row) } });
        await afterMutation(ctx, text('saved'));
      }
    } catch (error) { showError(error, target); }
    finally { target.disabled = false; }
  }
  async function handleSubmit(event) {
    const form = event.target;
    if (!enabled() || !form.matches('[data-extras-filters], [data-extras-discount-form]')) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (form.matches('[data-extras-filters]')) {
      const ctx = closestContext(form);
      const data = Object.fromEntries(new FormData(form));
      ctx.page = 1; ctx.pageSize = Number(data.page_size); delete data.page_size;
      ctx.filters = data;
      return loadContext(ctx);
    }
    if (form.dataset.saving === 'true') return;
    const mount = form.closest('[data-extras-discount]');
    const accountId = mount.dataset.accountId || null;
    const submit = form.querySelector('[type="submit"]');
    form.dataset.saving = 'true'; submit.disabled = true;
    try {
      await request(discountPath(accountId), { method: 'POST', body: { code: form.elements.namedItem('code').value.trim() } });
      await loadDiscount(mount, accountId);
      await refreshFinance();
      if (accountId) await renderAccount();
    } catch (error) { showError(error, form); }
    finally { form.dataset.saving = 'false'; submit.disabled = false; }
  }

  function loadPanel(key) {
    if (!enabled()) return;
    const mount = document.getElementById(key);
    const resource = mount?.dataset.extrasResource;
    if (!resource) return;
    if (!admin() && ['workshops', 'services'].includes(resource)) return loadCatalog(mount, resource);
    const ctx = state.contexts.get(mount) || createContext(mount, resource);
    buildShell(ctx);
    return loadContext(ctx);
  }
  function init(role) {
    const eventKey = String(getEvent()?.id || '');
    const featureOn = getEvent()?.hasWorkshopsServices === true;
    if (state.eventKey !== eventKey || state.role !== role || state.featureOn !== featureOn) {
      state.generation += 1; state.eventKey = eventKey; state.role = role;
      state.featureOn = featureOn;
      state.summaries.clear(); state.summaryIds = []; state.financeReady = false;
      state.financeRequest = null; state.financeRevision = 0; state.contexts.clear(); state.account = null;
      state.dialogVersion += 1;
      if (state.dialog) {
        const form = state.dialog.querySelector('form');
        if (form) form.dataset.saving = 'false';
        bootstrap.Modal.getOrCreateInstance(state.dialog).hide();
      }
      document.getElementById('registrationExtrasFinance')?.replaceChildren();
      document.getElementById('registrationAccountExtras')?.replaceChildren();
      document.querySelectorAll('[data-extras-resource]').forEach(mount => mount.replaceChildren());
    }
    document.getElementById('registrationExtrasFinance')?.classList.toggle('d-none', !enabled());
    document.getElementById('registrationAccountExtras')?.classList.toggle('d-none', !enabled() || !admin());
    if (!state.initialized) {
      state.initialized = true;
      document.addEventListener('click', handleClick);
      document.addEventListener('submit', handleSubmit);
      window.addEventListener('registration:panel-changed', event => {
        loadPanel(event.detail.key);
        if (['payments', 'dashboard'].includes(event.detail.key)) refreshFinance();
      });
      window.addEventListener('registration:account-opened', event => {
        if (!enabled() || !admin()) return;
        state.account = { ...event.detail.account, id: id(event.detail.account.id) };
        state.accountTab = 'bookings';
        renderAccount();
      });
      ['registration:school-registrations-updated', 'registration:organizer-registrations-updated', 'registration:schools-updated', 'registration:config-updated'].forEach(name => window.addEventListener(name, refreshFinance));
      document.getElementById('registrationPaymentsSharedSchoolFilter')?.addEventListener('change', renderFinance);
      document.getElementById('registrationPaymentsSharedFilterClear')?.addEventListener('click', () => queueMicrotask(renderFinance));
      const observer = new MutationObserver(async () => {
        await ensureTranslationsReady();
        if (!enabled()) return;
        renderRegistrationSidebar(state.role);
        state.contexts.forEach(ctx => { buildShell(ctx); renderList(ctx); });
        if (state.account) renderAccount();
        renderFinance();
        const discount = document.querySelector('#registrationExtrasFinance [data-extras-discount]');
        if (discount) loadDiscount(discount);
        const active = document.querySelector('[data-extras-resource].active');
        if (active && !admin() && ['workshops', 'services'].includes(active.dataset.extrasResource)) loadCatalog(active, active.dataset.extrasResource);
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
    }
    if (enabled()) {
      renderFinance();
      refreshFinance();
    }
  }
  return { init, enabled, request, getFinanceSummary, refreshFinance };
})();
