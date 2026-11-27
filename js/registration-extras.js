/* Extras stay in Registration's navigation, authentication and payment lifecycle.
 * Extras API money is in euros; existing Registration finance helpers use cents. */
window.RegistrationExtras = (() => {
  'use strict';
  const state = {
    role: '', eventKey: '', featureOn: false, initialized: false, generation: 0,
    summaries: new Map(), summaryIds: null, financeError: '', financeSerial: 0,
    account: null, accountTab: 'bookings', accountSummary: null, accountSerial: 0,
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
  const hasPrice = (item) => item?.price != null && Number.isFinite(Number(item.price)) && Number(item.price) > 0;
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
  const typeName = (type) => type === 'GALA' ? 'Gala' : text({ WORKSHOP: 'workshop', PACK: 'pack', SERVICE: 'service' }[type] || 'type');
  const workshopTypeBadge = item => `<span class="lm-status lm-status-${item.ws_type === 'GA' ? 'purple' : 'info'}">${html({ WS: 'Workshop', GA: 'Gala' }[item.ws_type] ?? '—')}</span>`;
  const button = (action, label, value = '', variant = 'outline-primary') => `<button type="button" class="btn btn-${variant} btn-sm" data-extras-action="${action}" data-id="${html(value)}">${html(label)}</button>`;
  const notice = (message, kind = 'danger') => `<div class="alert alert-${kind} mb-3" role="${kind === 'danger' ? 'alert' : 'status'}">${html(message)}</div>`;
  const loading = () => `<div class="py-4 text-center" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${html(text('loading'))}</div>`;
  const status = (value) => `<span class="lm-status lm-status-${{ PENDING: 'warning', VALIDATED: 'success', REJECTED: 'danger' }[value] || 'neutral'}"${value === 'PENDING' ? ` title="${html(text('pending'))}" aria-label="${html(text('pending'))}"` : ''}>${html(text(value === 'PENDING' ? 'pending_short' : String(value || '').toLowerCase()))}</span>`;
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
    if (method === 'GET' && /\/(?:summary|finance-summary)$/.test(path)) options.cache = 'no-store';
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
      error.code = data?.code;
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
      if (!state.summaryIds) return null;
      rows = state.summaryIds.map(key => state.summaries.get(key));
    }
    if (rows.some(row => !row)) return null;
    // Convert once at the boundary. Never add extras to API total_amount again.
    return Object.fromEntries(moneyFields.map(key => [key, rows.reduce((sum, row) => sum + Math.round(Number(row[key] || 0) * 100), 0)]));
  }
  function notifyFinance() {
    window.dispatchEvent(new CustomEvent('registration:extras-finance-updated'));
  }
  const financeVisible = () => ['payments', 'dashboard'].includes(registrationNavigationState.activeKey);
  const accountVisible = () => state.account && document.getElementById('schoolDetailsModal')?.classList.contains('show');
  const accountSummaryVisible = () => accountVisible() && state.accountTab === 'summary';

  async function refreshFinance() {
    if (!enabled() || !financeVisible()) return;
    const generation = state.generation, serial = ++state.financeSerial;
    state.summaries.clear(); state.summaryIds = null; state.financeError = '';
    notifyFinance(); renderFinance();
    try {
      // Each consumer tab entry gets a fresh response. Payment filters use only this response.
      const data = await request(admin() ? '/admin/finance-summary' : summaryPath());
      if (!sameEvent(generation) || serial !== state.financeSerial) return;
      if (admin()) {
        if (String(data?.event_id) !== state.eventKey || !Array.isArray(data.accounts)) throw new Error(text('invalid_response'));
        const summaries = new Map();
        for (const account of data.accounts) {
          const key = String(id(account.registration_school_id));
          if (summaries.has(key)) throw new Error(text('invalid_response'));
          summaries.set(key, checkedSummary(account));
        }
        state.summaries = summaries;
        state.summaryIds = [...summaries.keys()];
      } else state.summaries.set('self', checkedSummary(data));
    } catch (error) {
      if (!sameEvent(generation) || serial !== state.financeSerial) return;
      state.financeError = error.message;
    } finally {
      if (sameEvent(generation) && serial === state.financeSerial) { notifyFinance(); renderFinance(); }
    }
  }

  function summaryMarkup(summary, cents = false) {
    if (!summary) return '';
    return `<dl class="extras-finance-grid mb-0">${['registrations_amount', 'validated_extras_amount', 'gross_amount', 'effective_discount_amount', 'total_amount'].map(key =>
      fieldLabel(text(key), html(money(Number(summary[key]) / (cents ? 100 : 1))))).join('')}</dl>`;
  }
  function renderFinance() {
    const mount = document.getElementById('registrationExtrasFinance');
    if (!mount || !enabled() || registrationNavigationState.activeKey !== 'payments') return;
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
    const error = state.financeError;
    card.innerHTML = error
      ? notice(error) + button('finance-retry', text('retry'))
      : summary ? summaryMarkup(summary, true) : state.summaryIds != null || selectedId === '__unresolved__' ? notice(text('unavailable'), 'warning') : loading();
    // Payments owns the fee and registration breakdowns. Extras must not change
    // their visibility according to summary availability or response order.
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

  const summaryKinds = ['workshops', 'galas', 'packs', 'services'];
  const summaryLabel = kind => text(['workshops', 'galas'].includes(kind) ? `summary_${kind}` : kind === 'services' ? 'galas_extras' : kind);
  function buildValidatedSummaryShell(ctx) {
    ctx.summaryKind ||= 'workshops';
    ctx.summarySearch ||= '';
    ctx.summaryOpen ||= new Set();
    ctx.mount.innerHTML = `<div class="extras-heading"><div><h2 class="h4 mb-1">${html(text('summary_title'))}</h2><p class="small text-body-secondary mb-0">${html(text('summary_hint'))}</p></div><div class="extras-actions">${button('refresh', text('refresh'), '', 'outline-secondary')}</div></div>
      <div data-extras-feedback aria-live="polite"></div>
      <div class="extras-summary-kinds" role="group" aria-label="${html(text('type'))}">${summaryKinds.map(kind => `<button type="button" class="lm-card" data-summary-kind="${kind}" aria-pressed="${kind === ctx.summaryKind}"><i class="bi bi-${{ workshops: 'calendar-event', galas: 'stars', packs: 'collection', services: 'bag' }[kind]}" aria-hidden="true"></i><span>${html(summaryLabel(kind))}</span><strong data-summary-count="${kind}">—</strong></button>`).join('')}</div>
      <div class="extras-summary-tools lm-card lm-card-body"><div><label for="extras-summary-search" class="form-label">${html(text('summary_search'))}</label><input type="search" id="extras-summary-search" class="form-control lm-input" data-summary-search value="${html(ctx.summarySearch)}" autocomplete="off"></div><label class="extras-summary-check"><input type="checkbox" class="form-check-input" data-summary-booked${ctx.summaryOnlyBooked ? ' checked' : ''}>${html(text('summary_only_booked'))}</label><div class="extras-actions"><button type="button" class="btn btn-outline-secondary btn-sm" data-summary-expand="true">${html(text('summary_expand'))}</button><button type="button" class="btn btn-outline-secondary btn-sm" data-summary-expand="false">${html(text('summary_collapse'))}</button></div></div>
      <p class="small text-body-secondary mt-3" data-summary-results role="status"></p><div data-extras-list aria-live="polite"></div>`;
  }
  async function loadValidatedSummary(ctx) {
    if (!enabled() || !admin()) return;
    const generation = state.generation, serial = ++ctx.request;
    const list = ctx.mount.querySelector('[data-extras-list]');
    ctx.summaryData = null;
    renderValidatedSummary(ctx);
    ctx.mount.querySelector('[data-summary-results]').textContent = '';
    list.innerHTML = loading(); list.setAttribute('aria-busy', 'true');
    ctx.mount.querySelector('[data-extras-feedback]').innerHTML = '';
    try {
      const data = await request('/admin/summary');
      if (!sameEvent(generation) || serial !== ctx.request) return;
      if (String(data?.event_id) !== state.eventKey || !['workshops', 'packs', 'services'].every(kind => Array.isArray(data[kind]) && data[kind].every(item => Array.isArray(item.bookings)))) throw new Error(text('invalid_response'));
      ctx.summaryData = { ...data, workshops: data.workshops.filter(item => item.ws_type === 'WS'), galas: data.workshops.filter(item => item.ws_type === 'GA') };
      renderValidatedSummary(ctx);
    } catch (error) {
      if (sameEvent(generation) && serial === ctx.request) {
        list.innerHTML = notice(error.message) + button('refresh', text('retry'));
        ctx.mount.querySelector('[data-summary-results]').textContent = '';
      }
    } finally {
      if (serial === ctx.request) list.removeAttribute('aria-busy');
    }
  }
  const summarySearchValue = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  function summaryBookingMatches(booking, query) {
    return summarySearchValue([booking.booking_id, booking.attendee?.id, booking.attendee?.name, booking.account?.id, booking.account?.name, booking.account?.user_type, booking.pack?.id, booking.pack?.name, booking.item_type, typeName(booking.item_type)].join(' ')).includes(query);
  }
  function summaryBookingMarkup(booking) {
    const person = booking.attendee?.name ?? booking.account?.name ?? text('summary_no_name');
    const account = booking.account;
    const accountType = account?.user_type === 'SCH' ? text('school') : account?.user_type === 'PAR' ? text('individual') : account?.user_type || '—';
    const origin = `${html(typeName(booking.item_type))}${booking.pack ? `<br><strong>${html(booking.pack.name ?? text('summary_no_name'))}</strong>` : ''}`;
    return `<li class="extras-summary-booking"><dl>${fieldLabel(text('attendee'), `<strong>${html(person)}</strong>${booking.attendee ? '' : `<small>${html(text('summary_no_attendee'))}</small>`}`)}${fieldLabel(text('account'), `${html(account?.name ?? text('summary_no_name'))}<small>${html(accountType)}</small>`)}${fieldLabel(text('quantity'), html(booking.quantity))}${fieldLabel(text('summary_origin'), origin)}${fieldLabel(text('summary_booking'), `<button type="button" class="btn btn-outline-primary btn-sm" data-summary-booking="${html(booking.booking_id)}">${html(text('summary_view_booking'))} <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></button>`)}</dl></li>`;
  }
  function renderValidatedSummary(ctx) {
    const data = ctx.summaryData, kind = ctx.summaryKind;
    const list = ctx.mount.querySelector('[data-extras-list]');
    ctx.mount.querySelectorAll('[data-summary-kind]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.summaryKind === kind));
      button.querySelector('strong').textContent = data?.[button.dataset.summaryKind].length ?? '—';
    });
    if (!data) return;
    const query = summarySearchValue(ctx.summarySearch.trim());
    const products = data[kind].flatMap(item => {
      if (ctx.summaryOnlyBooked && !item.bookings.length) return [];
      const matchesProduct = !query || summarySearchValue([item.id, item.name, item.teacher, item.mode].join(' ')).includes(query);
      const bookings = matchesProduct ? item.bookings : item.bookings.filter(booking => summaryBookingMatches(booking, query));
      return matchesProduct || bookings.length ? [{ item, bookings }] : [];
    });
    ctx.mount.querySelector('[data-summary-results]').textContent = `${summaryLabel(kind)}: ${products.length} / ${data[kind].length}`;
    list.innerHTML = `<div class="extras-summary-products">${products.map(({ item, bookings }) => {
      const key = `${kind}-${item.id}`;
      const meta = ['workshops', 'galas'].includes(kind) ? `${html(item.teacher || '—')} · ${html(workshopTimestamp(item.start_at))} – ${html(workshopTimestamp(item.end_at))}` : kind === 'packs' ? `${html(text(item.mode === 'FLEX' ? 'flex' : 'fixed'))} (${html(item.mode)}) · ${html(text('workshop_count'))}: ${html(item.workshop_count)}` : '';
      return `<details class="extras-summary-product lm-card" data-summary-product="${html(key)}"${ctx.summaryOpen.has(key) ? ' open' : ''}><summary><span class="extras-summary-product-heading"><strong>${html(item.name ?? text('summary_no_name'))}</strong>${meta ? `<span class="extras-summary-meta">${meta}</span>` : ''}</span><span class="extras-summary-badges"><span class="lm-status lm-status-${isActive(item) ? 'success' : 'neutral'}">${html(text(isActive(item) ? 'active' : 'inactive'))}</span>${['workshops', 'galas'].includes(kind) ? `<span class="lm-status lm-status-neutral">${html(text('capacity'))}: ${html(item.capacity)}</span>` : ''}<span class="lm-status lm-status-success">${html(text('summary_validated'))}: ${html(item.validated_count)}</span><span class="lm-status lm-status-info">${html(text('quantity'))}: ${html(item.total_quantity)}</span></span><i class="bi bi-chevron-down extras-summary-chevron" aria-hidden="true"></i></summary><div class="lm-card-body">${query ? `<p class="small text-body-secondary">${html(text('summary_matching'))}: ${bookings.length} / ${item.bookings.length}</p>` : ''}${bookings.length ? `<ul class="extras-summary-bookings">${bookings.map(summaryBookingMarkup).join('')}</ul>` : `<p class="text-body-secondary mb-0">${html(text('summary_no_bookings'))}</p>`}</div></details>`;
    }).join('') || `<p class="text-body-secondary py-4">${html(text(data[kind].length ? 'summary_no_matches' : 'empty'))}</p>`}</div>`;
    list.querySelectorAll('[data-summary-product]').forEach(details => {
      details.addEventListener('toggle', () => {
        if (!details.isConnected) return;
        if (details.open) ctx.summaryOpen.add(details.dataset.summaryProduct);
        else ctx.summaryOpen.delete(details.dataset.summaryProduct);
      });
    });
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
    if (ctx.resource === 'validated-summary') return buildValidatedSummaryShell(ctx);
    ctx.mount.innerHTML = `<div class="extras-heading"><h2 class="h4 mb-0">${html(titleFor(ctx))}</h2><div class="extras-actions">${canManage(ctx) || (ctx.resource === 'bookings' && ctx.accountId != null) ? button('create', text('add')) : ''}${canManage(ctx) && ctx.resource === 'workshops' ? button('bulk-prices', text('prices')) : ''}${button('refresh', text('refresh'), '', 'outline-secondary')}</div></div>
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
    const statusFilter = selectFilter('status', text('status'), ['PENDING', 'VALIDATED', 'REJECTED'].map(value => [value, text(value.toLowerCase())]), ctx.filters.status);
    const typeFilter = selectFilter('item_type', text('type'), ['WORKSHOP', 'GALA', 'PACK', 'SERVICE'].map(value => [value, typeName(value)]), ctx.filters.item_type);
    let fields = '';
    if (admin() && ctx.accountId == null) {
      fields += selectFilter('registration_school_id', text('account'), registrationState.schools.map(account => [account.id, account.name || account.school_name]), ctx.filters.registration_school_id);
    }
    fields += admin() ? typeFilter + statusFilter : statusFilter + typeFilter;
    fields = fields.replaceAll('extras-filter-', `extras-filter-${prefix}-`);
    return `<form data-extras-filters class="extras-filters extras-filters--compact mb-3">${fields}<div class="extras-actions align-self-end"><button type="submit" class="btn btn-primary btn-sm">${html(text('filter'))}</button>${button('clear-filters', text('clear'), '', 'outline-secondary')}</div></form>`;
  }
  async function loadContext(ctx) {
    if (ctx.resource === 'validated-summary') return loadValidatedSummary(ctx);
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
      const data = ctx.resource === 'bookings' ? await loadAccountBookings(ctx.filters, resourcePath('bookings', ctx.accountId)).then(data => ({ data })) : await request(resourcePath(ctx.resource, ctx.accountId));
      if (!sameEvent(generation) || serial !== ctx.request) return;
      if (ctx.resource === 'packs') {
        const workshops = [...state.contexts.values()].find(context => context.resource === 'workshops')?.rows;
        ctx.allWorkshopIds = workshops?.length ? workshops.map(workshop => Number(workshop.id)) : null;
      }
      ctx.rows = ctx.resource === 'bookings' ? data?.data : data;
      if (!Array.isArray(ctx.rows)) throw new Error(text('invalid_response'));
      if (['workshops', 'packs', 'services'].includes(ctx.resource) && admin()) {
        if (!ctx.rows.every(row => Array.isArray(row.prices))) throw new Error(text('invalid_response'));
      }
      if (ctx.resource === 'bookings') {
        ctx.rows = await resolveBookingNames(ctx.rows);
        if (!sameEvent(generation) || serial !== ctx.request) return;
      }
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

  function occupancyMarkup(item, compact = false, grouped = false) {
    const capacity = Math.max(0, Number(item.capacity) || 0);
    const validated = Number(item.validated_count) || 0;
    const percent = capacity ? Math.min(100, Math.max(0, validated / capacity * 100)) : 0;
    const availability = item.available_count;
    const availabilityState = availability == null ? 'neutral' : Number(availability) > 0 ? 'success' : 'warning';
    const caption = compact
      ? `<span class="extras-availability lm-status lm-status-${availabilityState}"><i class="bi bi-ticket-perforated" aria-hidden="true"></i>${html(text('available_count'))}<strong>${html(availability ?? '—')}</strong></span>`
      : `<div class="extras-occupancy-badges">${grouped ? `<span class="lm-status lm-status-neutral">${html(text('capacity'))}: ${capacity}</span>` : ''}<span class="lm-status lm-status-success">${html(text('validated_count'))}: ${validated}</span><span class="lm-status lm-status-warning">${html(text('pending_count'))}: ${html(item.pending_count ?? '—')}</span><span class="lm-status lm-status-info">${html(text('available_count'))}: ${html(availability ?? '—')}</span></div>`;
    if (grouped) return `<div class="extras-occupancy extras-occupancy--grouped"><div class="extras-occupancy-badges"><span class="lm-status lm-status-neutral">${html(text('capacity'))}: ${capacity}</span><span class="lm-status lm-status-info">${html(text('available_count'))}: ${html(availability ?? '—')}</span></div><div class="extras-occupancy-badges"><span class="lm-status lm-status-success">${html(text('validated_count'))}: ${validated}</span><span class="lm-status lm-status-warning">${html(text('pending_count'))}: ${html(item.pending_count ?? '—')}</span></div></div>`;
    return `<div class="extras-occupancy"><div class="extras-occupancy-track" role="progressbar" aria-label="${html(text('validated_count'))}" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${validated}"><span style="width:${percent}%"></span></div>${caption}</div>`;
  }
  function columns(ctx) {
    if (ctx.resource === 'workshops') return ['name', 'ws_type', 'teacher', 'day', 'time_range', 'occupancy', 'prices', 'status'];
    if (ctx.resource === 'packs') return ['name', 'mode', 'workshop_count', 'workshops', 'prices', 'status'];
    if (ctx.resource === 'services') return ['name', 'description', 'prices', 'status'];
    if (ctx.resource === 'discount-codes') return ['code', 'amount', 'audience', 'valid_from', 'valid_until', 'max_uses', 'status'];
    return [...(admin() && ctx.accountId == null ? ['account'] : []), 'type', 'name', 'attendee', 'quantity', 'amount', 'status', 'created_at'];
  }
  function cell(ctx, row, key) {
    if (key === 'ws_type') return workshopTypeBadge(row);
    if (key === 'day') return html(workshopDatePart(row.start_at, false));
    if (key === 'time_range') return `${html(workshopDatePart(row.start_at, true))} – ${html(workshopDatePart(row.end_at, true))}`;
    if (key === 'status') return ctx.resource === 'bookings' ? status(row.status) : `<span class="lm-status lm-status-${isActive(row) ? 'success' : 'neutral'}">${html(text(isActive(row) ? 'active' : 'inactive'))}</span>`;
    if (key === 'occupancy') return occupancyMarkup(row, false, true);
    if (key === 'prices') return productPricesMarkup(row);
    if (key === 'price' || key === 'amount') return html(money(ctx.resource === 'bookings' ? row.total_amount : row[key]));
    if (['start_at', 'end_at'].includes(key)) return html(workshopTimestamp(row[key]));
    if (['valid_from', 'valid_until', 'created_at'].includes(key)) return html(date(row[key]));
    if (key === 'max_uses') return html(row.max_uses ?? text('unlimited'));
    if (key === 'audience') return html(text({ SCH: 'school', PAR: 'individual', BOTH: 'both' }[row.audience] || 'both'));
    if (key === 'mode') return html(text(row.mode === 'FLEX' ? 'flex' : 'fixed'));
    if (key === 'type') return html(typeName(row.item_type));
    if (key === 'concept' || (key === 'name' && ctx.resource === 'bookings')) return html(bookingConcept(row));
    if (key === 'attendee') return html(bookingAttendee(row, ctx.participants));
    if (key === 'account') return html(accountName(row));
    if (key === 'workshops') {
      const workshopIds = [...new Set([...(row.workshop_ids || []), ...(row.workshops || []).map(workshop => workshop.id)].map(Number))];
      if (ctx.allWorkshopIds?.length && sameIds(workshopIds, ctx.allWorkshopIds)) return `<div class="extras-pack-workshop-badges"><span class="lm-status lm-status-info">${html(text('all_workshops'))}</span></div>`;
      const names = row.workshops?.length ? row.workshops.map(workshop => workshop.name || `#${workshop.id}`) : ids(row).map(value => `#${value}`);
      return names.length ? `<div class="extras-pack-workshop-badges">${names.map(name => `<span class="lm-status lm-status-info">${html(name)}</span>`).join('')}</div>` : '—';
    }
    return html(row[key] ?? '—');
  }
  function columnLabel(ctx, key) {
    if (key === 'ws_type') return text('type');
    if (key === 'prices') return text('prices');
    return text(ctx.resource === 'packs' && key === 'workshops' ? 'available_workshops' : key);
  }
  function productPricesMarkup(row) {
    const prices = row.prices || [];
    if (!prices.length) return `<span class="text-body-secondary">${html(text('prices_empty'))}</span>`;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const formatDay = value => calendarDay(value) || '—';
    return `<div class="registration-category-price-ranges">${prices.map(price => {
      const current = row.price != null && Number(row.price) === Number(price.price) && price.start_date <= today && today <= price.end_date;
      return `<div class="registration-category-price-range${current ? ' registration-category-price-range--current' : ''}"${current ? ' aria-current="true"' : ''}><span class="registration-category-price-range__dates">${html(formatDay(price.start_date))} - ${html(formatDay(price.end_date))}</span><strong class="registration-category-price-range__amount">${html(money(price.price))}</strong>${current ? `<i class="bi bi-check-circle-fill" aria-hidden="true"></i><span class="visually-hidden">${html(t('registration_categories_price_current'))}</span>` : ''}</div>`;
    }).join('')}</div>`;
  }
  function actions(ctx, row) {
    let result = ['workshops', 'packs', 'services'].includes(ctx.resource) ? '' : button('details', text('details'), row.id);
    if (ctx.resource === 'bookings') {
      if (row.status === 'PENDING') {
        if (admin() && ctx.accountId == null) result += button('validate', text('validate'), row.id, 'outline-success') + button('reject', text('reject'), row.id, 'outline-danger');
        else result += button('edit', t('edit'), row.id);
      }
      if (['PENDING', 'VALIDATED'].includes(row.status)) result += button('delete', t('delete'), row.id, 'outline-danger');
    } else if (canManage(ctx)) {
      if (['workshops', 'packs', 'services'].includes(ctx.resource)) result += button('prices', text('manage_prices'), row.id);
      result += button('edit', t('edit'), row.id) + button('delete', t('delete'), row.id, 'outline-danger');
      result += button('toggle', text(isActive(row) ? 'deactivate' : 'activate'), row.id, 'outline-secondary');
    }
    return `<div class="extras-actions">${result}</div>`;
  }
  function renderList(ctx) {
    if (ctx.resource === 'validated-summary') return renderValidatedSummary(ctx);
    const list = ctx.mount.querySelector('[data-extras-list]');
    if (!list) return;
    const keys = columns(ctx);
    list.innerHTML = ctx.rows.length ? `<div class="table-responsive extras-desktop-table lm-card"><table class="table lm-table align-middle"><caption class="visually-hidden">${html(titleFor(ctx))}</caption><thead><tr>${keys.map(key => `<th scope="col"${key === 'workshop_count' ? ` class="extras-workshop-count" title="${html(text(key))}" aria-label="${html(text(key))}"` : ''}>${html(key === 'workshop_count' ? text('workshop_count_short') : columnLabel(ctx, key))}</th>`).join('')}<th scope="col">${html(text('actions'))}</th></tr></thead><tbody>${ctx.rows.map(row => `<tr>${keys.map(key => `<td${key === 'workshop_count' ? ' class="extras-workshop-count"' : ''}>${cell(ctx, row, key)}</td>`).join('')}<td>${actions(ctx, row)}</td></tr>`).join('')}</tbody></table></div>
      <div class="extras-mobile-list">${ctx.rows.map(row => `<article class="lm-card lm-card-body"><dl class="extras-detail-grid">${keys.map(key => fieldLabel(columnLabel(ctx, key), cell(ctx, row, key))).join('')}</dl>${actions(ctx, row)}</article>`).join('')}</div>` : `<p class="text-body-secondary py-4">${html(text('empty'))}</p>`;
    if (ctx.pagination) {
      const page = Number(ctx.pagination.page) || ctx.page;
      const pages = Number(ctx.pagination.total_pages) || 0;
      list.insertAdjacentHTML('beforeend', `<nav class="extras-pagination" aria-label="${html(text('pagination'))}"><button class="btn btn-outline-secondary btn-sm" type="button" data-extras-action="previous"${page <= 1 ? ' disabled' : ''}>${html(text('previous'))}</button><span>${page} / ${Math.max(1, pages)} · ${html(ctx.pagination.total_items)} ${html(text('results'))}</span><button class="btn btn-outline-secondary btn-sm" type="button" data-extras-action="next"${page >= pages ? ' disabled' : ''}>${html(text('next'))}</button></nav>`);
    }
  }

  function catalogPath(resource) { return `${admin() ? '/admin' : '/catalog'}/${resource}`; }
  async function resolveBookingNames(rows) {
    const types = { WORKSHOP: 'workshop', GALA: 'workshop', PACK: 'pack', SERVICE: 'service' };
    const missing = rows.filter(row => {
      const kind = types[row.item_type];
      return kind && !row[kind]?.name && !row[`${kind}_name`] && !row.item_name && !row.name
        && !(kind === 'workshop' && row.workshops?.some(workshop => workshop.name));
    });
    const catalogs = new Map(await Promise.all([...new Set(missing.map(row => types[row.item_type]))].map(async kind => [kind, await request(catalogPath(`${kind}s`))])));
    return rows.map(row => {
      if (!missing.includes(row)) return row;
      const kind = types[row.item_type];
      const productId = row[`${kind}_id`] || row[kind]?.id || (kind === 'workshop' ? ids(row)[0] : null);
      const product = catalogs.get(kind).find(item => Number(item.id) === Number(productId));
      return product ? { ...row, [`${kind}_name`]: product.name } : row;
    });
  }
  async function loadAccountBookings(filters = {}, path = '/bookings') {
    const bookings = new Map();
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const response = await request(path, { query: { ...filters, page, page_size: 100 } });
      if (!Array.isArray(response?.data)) throw new Error(text('invalid_response'));
      pages = Number(response.pagination?.total_pages) || 1;
      if (!Number.isSafeInteger(pages) || pages < 1) throw new Error(text('invalid_response'));
      response.data.forEach(booking => bookings.set(booking.id, booking));
    }
    return [...bookings.values()];
  }
  async function loadServiceReservations() {
    const bookings = await loadAccountBookings();
    const reservations = new Map();
    for (let booking of bookings) {
      if (booking.item_type !== 'SERVICE' || !['PENDING', 'VALIDATED'].includes(booking.status)) continue;
      if (!(booking.service_id || booking.service?.id) || booking.quantity == null) {
        booking = { ...booking, ...await request(`/bookings/${id(booking.id)}`) };
      }
      if (!['PENDING', 'VALIDATED'].includes(booking.status)) continue;
      const serviceId = id(booking.service_id || booking.service?.id);
      const quantity = id(booking.quantity);
      if (!reservations.has(serviceId)) reservations.set(serviceId, { PENDING: 0, VALIDATED: 0 });
      reservations.get(serviceId)[booking.status] += quantity;
    }
    return reservations;
  }
  function serviceReservations(serviceId, reservations) {
    const quantities = reservations?.get(Number(serviceId));
    if (!quantities) return '';
    const total = quantities.PENDING + quantities.VALIDATED;
    return `<div class="extras-service-reservations"><strong>${html(text('reserved_quantity').replace('{count}', total))}</strong><div class="extras-actions">${['VALIDATED', 'PENDING'].filter(key => quantities[key] > 0).map(key => `<span class="lm-status lm-status-${key === 'VALIDATED' ? 'success' : 'warning'}">${html(text(key === 'PENDING' ? 'pending_short' : key.toLowerCase()))}: ${html(quantities[key])}</span>`).join('')}</div></div>`;
  }
  async function loadWorkshopReservations() {
    const [participants, bookings] = await Promise.all([
      loadBookingParticipants().catch(() => []), loadAccountBookings()
    ]);
    const reservations = new Map();
    const packs = new Map();
    const snapshotIds = booking => [...new Set([
      ...(booking.workshop_ids || []), ...(booking.workshops || []).map(workshop => workshop.id),
      booking.workshop?.id, booking.workshop_id
    ].filter(Boolean).map(Number))];
    for (let booking of bookings) {
      if (!['PENDING', 'VALIDATED'].includes(booking.status) || !['WORKSHOP', 'GALA', 'PACK'].includes(booking.item_type)) continue;
      // Only booking snapshots identify the actual sessions chosen in a FLEX pack.
      // Never infer a reservation from the pack's current catalog composition.
      if (!snapshotIds(booking).length || (booking.item_type === 'PACK' && !(booking.pack_id || booking.pack?.id))) {
        booking = { ...booking, ...await request(`/bookings/${id(booking.id)}`) };
      }
      if (!['PENDING', 'VALIDATED'].includes(booking.status)) continue;
      const workshopIds = snapshotIds(booking);
      if (!workshopIds.length) throw new Error(text('invalid_response'));
      const name = bookingAttendee(booking, participants);
      const participant = name !== '—' ? name : `${text('attendee')} #${booking.attendee_id ?? '—'}`;
      const key = `${booking.attendee_id ?? participant}:${booking.status}`;
      const singleParticipant = participants.length === 1 && String(participants[0].id) === String(booking.attendee_id);
      const entry = { participant, participantId: String(booking.attendee_id), singleParticipant, status: booking.status };
      if (booking.item_type === 'PACK') {
        const packId = id(booking.pack_id || booking.pack?.id);
        if (!packs.has(packId)) packs.set(packId, new Map());
        packs.get(packId).set(key, entry);
      }
      workshopIds.forEach(workshopId => {
        if (!reservations.has(workshopId)) reservations.set(workshopId, new Map());
        reservations.get(workshopId).set(key, entry);
      });
    }
    return { workshops: reservations, packs, participantIds: participants.map(person => String(person.id)) };
  }
  function reservationBadges(itemId, reservations, resource = 'workshops') {
    const entries = reservations?.[resource].get(Number(itemId));
    if (!entries?.size) return '';
    return `<div class="extras-workshop-reservations">${[...entries.values()].map(entry => `<div class="extras-booking-marker"><span class="lm-status lm-status-info"><i class="bi bi-bookmark-check" aria-hidden="true"></i>${html(entry.singleParticipant ? text('booked') : text('booked_for').replace('{participant}', entry.participant))}</span>${status(entry.status)}</div>`).join('')}</div>`;
  }
  function allParticipantsBooked(itemId, reservations, resource = 'workshops') {
    if (!reservations?.participantIds.length) return false;
    const entries = reservations[resource].get(Number(itemId));
    if (!entries) return false;
    const bookedParticipants = new Set([...entries.values()].map(entry => entry.participantId));
    return reservations.participantIds.every(participantId => bookedParticipants.has(participantId));
  }
  async function loadCatalog(mount, resource) {
    const serial = String(Number(mount.dataset.request || 0) + 1);
    mount.dataset.request = serial;
    const generation = state.generation;
    const splitCatalog = resource === 'workshops';
    const catalogKinds = ['packs', 'workshops', 'galas'];
    const selectedTab = catalogKinds.includes(mount.dataset.catalogTab) ? mount.dataset.catalogTab : 'packs';
    const tabs = splitCatalog ? `<div class="extras-catalog-tabs" role="tablist" aria-label="${html(text('workshops_packs'))}">${catalogKinds.map(kind => `<button type="button" role="tab" id="${mount.id}-${kind}-tab" aria-controls="${mount.id}-${kind}-catalog" aria-selected="${kind === selectedTab}" tabindex="${kind === selectedTab ? '0' : '-1'}" data-extras-catalog-tab="${kind}">${html(summaryLabel(kind))}</button>`).join('')}</div>` : `<h2 class="h4">${html(text(resourceLabels[resource]))}</h2>`;
    mount.innerHTML = `<div class="extras-heading">${tabs}${button('catalog-refresh', text('refresh'), resource, 'outline-secondary')}</div><div data-extras-catalog-list>${loading()}</div>`;
    const list = mount.querySelector('[data-extras-catalog-list]');
    try {
      const resources = resource === 'workshops' ? ['workshops', 'packs'] : ['services'];
      let reservationsError = false;
      const [results, reservations] = await Promise.all([
        Promise.all(resources.map(item => request(`/catalog/${item}`))),
        (splitCatalog ? loadWorkshopReservations() : loadServiceReservations()).catch(() => { reservationsError = true; return null; })
      ]);
      if (!sameEvent(generation) || mount.dataset.request !== serial) return;
      if (splitCatalog && !results[1].length && !catalogKinds.includes(mount.dataset.catalogTab)) {
        selectCatalogTab(mount.querySelector('[data-extras-catalog-tab="workshops"]'));
      }
      const groups = splitCatalog ? [
        { kind: 'packs', resource: 'packs', items: results[1].map(item => ({ ...item, workshops: packWorkshops(item, results[0]) })) },
        { kind: 'workshops', resource: 'workshops', items: results[0].filter(item => item.ws_type === 'WS') },
        { kind: 'galas', resource: 'workshops', items: results[0].filter(item => item.ws_type === 'GA') }
      ] : [{ kind: 'services', resource: 'services', items: results[0] }];
      list.innerHTML = (reservationsError ? notice(text('bookings_unavailable'), 'warning') : '') + groups.map(({ kind, resource, items }) => `<section class="mb-4"${splitCatalog ? ` id="${mount.id}-${kind}-catalog" role="tabpanel" aria-labelledby="${mount.id}-${kind}-tab" tabindex="0"${kind !== mount.querySelector('[aria-selected="true"]').dataset.extrasCatalogTab ? ' hidden' : ''}` : ''}><div class="extras-catalog-grid${splitCatalog ? ` extras-catalog-grid--${resource}` : ''}">${items.map(item => catalogCard(resource, item, reservations)).join('') || `<p>${html(text('empty'))}</p>`}</div></section>`).join('');
    } catch (error) {
      if (sameEvent(generation) && mount.dataset.request === serial) list.innerHTML = notice(error.message) + button('catalog-refresh', text('retry'), resource);
    }
  }
  function selectCatalogTab(tab) {
    const mount = tab.closest('[data-extras-resource]');
    mount.dataset.catalogTab = tab.dataset.extrasCatalogTab;
    mount.querySelectorAll('[data-extras-catalog-tab]').forEach(button => {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
  }
  function workshopMeta(item, compact = false) {
    const day = workshopDatePart(item.start_at, false);
    const time = value => workshopDatePart(value, true);
    return `<span class="extras-session-meta${compact ? ' extras-session-meta--compact' : ''}">${item.ws_type === 'GA' ? '' : `<span class="extras-session-teacher"><i class="bi bi-person" aria-hidden="true"></i><span><small${compact ? ' class="visually-hidden"' : ''}>${html(text('teacher'))}</small><strong>${html(item.teacher || '—')}</strong></span></span>`}<span class="extras-session-schedule"><i class="bi bi-calendar-event" aria-hidden="true"></i><span><span>${html(day)}</span><strong>${html(time(item.start_at))} – ${html(time(item.end_at))}</strong></span></span></span>`;
  }
  function packWorkshops(item, catalog) {
    const workshops = item.workshops?.length ? item.workshops : catalog.filter(w => ids(item).includes(Number(w.id)));
    return workshops.map(w => ({ ...catalog.find(entry => Number(entry.id) === Number(w.id)), ...w }));
  }
  function packWorkshopSummary(item, reservations = null) {
    return `<div class="extras-pack-composition"><p class="extras-pack-mode"><span class="lm-status lm-status-purple">${html(text(item.mode === 'FLEX' ? 'flex' : 'fixed'))}</span><strong>${html(item.workshop_count)} ${html(text('workshops'))}</strong></p><details class="extras-pack-details"><summary><i class="bi bi-collection" aria-hidden="true"></i><span>${html(text(item.mode === 'FLEX' ? 'available_workshops' : 'included_workshops'))}</span><i class="bi bi-chevron-down extras-pack-chevron" aria-hidden="true"></i></summary><p class="extras-pack-hint">${html(item.mode === 'FLEX' ? text('select_exactly').replace('{count}', item.workshop_count) : text('included_workshops'))}</p><ul class="extras-workshop-summary">${(item.workshops || []).map(w => `<li><div class="extras-session-heading"><strong class="extras-session-name">${html(w.name)}</strong>${workshopTypeBadge(w)}</div>${workshopMeta(w, true)}${reservationBadges(w.id, reservations)}</li>`).join('')}</ul></details></div>`;
  }
  function workshopDescription(item) {
    return workshopMeta(item) + occupancyMarkup(item, !admin());
  }
  function catalogCard(resource, item, reservations = null) {
    const packWorkshops = resource === 'packs' ? packWorkshopSummary(item, reservations) : '';
    const descriptionText = `<p class="extras-description text-body-secondary">${html(item.description || '')}</p>`;
    const description = resource === 'packs' && state.role === 'school'
      ? (item.description ? `<details class="extras-pack-details"><summary><i class="bi bi-card-text" aria-hidden="true"></i><span>${html(text('description'))}</span><i class="bi bi-chevron-down extras-pack-chevron" aria-hidden="true"></i></summary><div class="lm-card-body">${descriptionText}</div></details>` : '')
      : descriptionText;
    const reservationInfo = ['workshops', 'packs'].includes(resource) ? reservationBadges(item.id, reservations, resource) : resource === 'services' ? serviceReservations(item.id, reservations) : '';
    const fullyBooked = ['workshops', 'packs'].includes(resource) && allParticipantsBooked(item.id, reservations, resource);
    return `<article class="lm-card lm-card-body extras-catalog-card"><h4 class="h6">${html(item.name)}</h4>${description}${resource === 'workshops' ? workshopDescription(item) : packWorkshops}<div class="extras-catalog-card-footer">${reservationInfo}<strong${resource === 'workshops' && !admin() && !hasPrice(item) ? ' class="extras-price-unavailable"' : ''}>${html(hasPrice(item) ? money(item.price) : text('price_unavailable'))}</strong><button type="button" class="btn btn-primary btn-sm" data-extras-action="book" data-resource="${resource}" data-id="${html(item.id)}"${fullyBooked || !hasPrice(item) ? ' disabled' : ''}>${html(text('book'))}</button></div></article>`;
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
        saved = await onSave(form) !== false;
      } catch (error) {
        modal.querySelector('[data-extras-dialog-feedback]').innerHTML = notice(error.message);
      } finally {
        form.dataset.saving = 'false';
        submit.disabled = form.dataset.priceReady === 'false' || form.dataset.bookingAvailable === 'false';
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
  // Workshop schedules are wall-clock values from the API, independent of the viewer's timezone.
  function workshopDateTime(value) {
    return value ? String(value).replace(' ', 'T').slice(0, 16) : '';
  }
  function workshopDatePart(value, timeOnly) {
    const schedule = workshopDateTime(value);
    return (timeOnly ? schedule.slice(11, 16) : schedule.slice(0, 10)) || '—';
  }
  function workshopTimestamp(value) {
    return workshopDateTime(value).replace('T', ' ') || '—';
  }
  function workshopTimePicker(name, value) {
    const local = workshopDateTime(value);
    const hour = local.slice(11, 13);
    const minute = local.slice(14, 16) || '00';
    const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
    const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
    // Preserve an existing off-step time when editing, without rounding a saved schedule.
    if (!minutes.includes(minute)) minutes.push(minute);
    minutes.sort();
    const control = (part, options, selected) => `<div><label class="visually-hidden" for="extras-field-${name}_${part}">${html(text(part))}</label><select class="form-select lm-input" id="extras-field-${name}_${part}" name="${name}_${part}" required>${part === 'hour' ? '<option value="">—</option>' : ''}${options.map(option => `<option value="${option}"${option === selected ? ' selected' : ''}>${option}</option>`).join('')}</select></div>`;
    return `<fieldset class="extras-form-field extras-time-field"><legend class="form-label">${html(text(`${name}_time`))} *</legend><div class="extras-time-controls">${control('hour', hours, hour)}<span aria-hidden="true">:</span>${control('minute', minutes, minute)}</div></fieldset>`;
  }
  function input(name, value = '', { type = 'text', required = false, min, max, step, disabled = false } = {}) {
    const valueText = type === 'datetime-local' ? localDateTime(value) : value ?? '';
    return `<div class="extras-form-field"><label class="form-label" for="extras-field-${name}">${html(text(name))}${required ? ' *' : ''}</label><input class="form-control lm-input" id="extras-field-${name}" name="${name}" type="${type}" value="${html(valueText)}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}${min != null ? ` min="${html(min)}"` : ''}${max != null ? ` max="${html(max)}"` : ''}${step != null ? ` step="${html(step)}"` : ''}></div>`;
  }
  function select(name, options, value, required = true, disabled = false) {
    return `<div class="extras-form-field"><label class="form-label" for="extras-field-${name}">${html(text(name))}</label><select class="form-select lm-input" id="extras-field-${name}" name="${name}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}>${options.map(([key, label]) => `<option value="${html(key)}"${String(key) === String(value) ? ' selected' : ''}>${html(label)}</option>`).join('')}</select></div>`;
  }
  function workshopSelector(workshops, selected = [], disabled = false) {
    const groups = [
      { kind: 'workshops', items: workshops.filter(item => item.ws_type !== 'GA') },
      { kind: 'galas', items: workshops.filter(item => item.ws_type === 'GA') }
    ];
    return `<fieldset class="extras-workshop-selector"${disabled ? ' disabled' : ''}><legend class="fs-6">${html(text('workshops_galas'))}</legend><p class="small text-body-secondary" data-extras-selection-hint></p><p class="small" data-extras-selection-count aria-live="polite"></p>${groups.map(({ kind, items }) => `<section class="extras-workshop-selector-group"><h3 class="h6">${html(summaryLabel(kind))}</h3><div class="extras-workshop-options">${items.map(w => `<label class="extras-workshop-option"><input class="form-check-input" type="checkbox" name="workshop_ids" value="${html(w.id)}"${selected.includes(Number(w.id)) ? ' checked' : ''}><span class="extras-workshop-option-content"><strong class="extras-session-name">${html(w.name)}</strong>${workshopMeta(w)}</span></label>`).join('') || `<p>${html(text('empty'))}</p>`}</div></section>`).join('')}</fieldset>`;
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

  function calendarDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
  }
  async function openBulkWorkshopPrices(ctx) {
    if (!canManage(ctx) || ctx.resource !== 'workshops') return;
    const generation = state.generation;
    const eventId = id(getEvent()?.id);
    const start = calendarDay(String(getEvent()?.registrationStart || '').slice(0, 10));
    const end = calendarDay(String(getEvent()?.registrationEnd || '').slice(0, 10));
    const periodValid = Boolean(start && end && start <= end);
    let existing = [], ready = false, sequence = 0, refreshing = false;
    const content = `<p class="small text-body-secondary">${html(text('bulk_prices_hint'))}</p>${periodValid ? '' : notice(text('price_period_missing'), 'warning')}
      <fieldset class="extras-price-fields" data-bulk-price-fields disabled><legend class="visually-hidden">${html(text('prices'))}</legend><div data-bulk-price-ranges></div><button type="button" class="btn btn-outline-primary btn-sm mt-2" data-bulk-price-action="add">${html(text('add_price'))}</button></fieldset>
      <details class="extras-pack-details mt-3"><summary><i class="bi bi-collection" aria-hidden="true"></i><span>${html(text('bulk_prices_title'))}</span><i class="bi bi-chevron-down extras-pack-chevron" aria-hidden="true"></i></summary><div class="lm-card-body"><div class="extras-prices-table" data-bulk-existing aria-live="polite"></div></div></details><button type="button" class="btn btn-outline-secondary btn-sm mt-2" data-bulk-price-action="refresh">${html(text('refresh'))}</button>`;
    const form = await openDialog(text('bulk_prices_title'), content, async () => {
      if (!ready || !periodValid) throw new Error(text('price_period_missing'));
      const ranges = [...form.querySelectorAll('[data-bulk-price-range]')].map(row => {
        const inicio = calendarDay(row.querySelector('[data-range-field="inicio"]').value);
        const fin = calendarDay(row.querySelector('[data-range-field="fin"]').value);
        const precio = row.querySelector('[data-range-field="precio"]').value.trim();
        if (!inicio || !fin || inicio > fin) throw new Error(text('price_invalid_dates'));
        if (inicio < start || fin > end) throw new Error(text('price_outside_period'));
        if (!/^\d+(?:\.\d{1,2})?$/.test(precio) || Number(precio) <= 0 || Number(precio) > 99999999.99) throw new Error(text('price_invalid_amount'));
        return { inicio, fin, precio };
      });
      if (!ranges.length) throw new Error(text('invalid_selection'));
      if (ranges.some((range, index) => ranges.slice(0, index).some(other => range.inicio <= other.fin && range.fin >= other.inicio))) throw new Error(text('bulk_prices_overlap'));
      fields.disabled = true;
      try {
        // Re-read every workshop, including inactive and recently created ones, immediately before the POST.
        await reload();
        if (!current()) return false;
        const conflict = existing.find(item => ranges.some(range => item.prices.some(price => range.inicio <= price.end_date && range.fin >= price.start_date)));
        if (conflict) throw new Error(`${text('bulk_prices_overlap')} · ${conflict.workshop.name}`);
        try {
          await request('/admin/workshops/prices', { method: 'POST', body: { event_id: eventId, ranges } });
        } catch (error) {
          if (error.status === 409 || error.status === 404) {
            try { await reload(); } catch { /* Retain the original mutation error and all entered ranges. */ }
          }
          throw error;
        }
        await loadContext(ctx);
        if (sameEvent(generation)) ctx.mount.querySelector('[data-extras-feedback]').innerHTML = notice(text('saved'), 'success');
        return true;
      } finally {
        if (current()) {
          fields.disabled = !ready || !periodValid;
          refresh.disabled = false;
        }
      }
    }, t('save'));
    if (!form || !sameEvent(generation)) return;
    const fields = form.querySelector('[data-bulk-price-fields]');
    const rangesMount = form.querySelector('[data-bulk-price-ranges]');
    const list = form.querySelector('[data-bulk-existing]');
    const submit = form.querySelector('[type="submit"]');
    const refresh = form.querySelector('[data-bulk-price-action="refresh"]');
    const current = () => sameEvent(generation) && state.dialog === form.closest('.modal');
    const addRange = () => {
      const prefix = `extras-bulk-${++sequence}`;
      const dateField = (key, label) => `<div class="extras-form-field"><label class="form-label" for="${prefix}-${key}">${html(text(label))}</label><input class="form-control lm-input" id="${prefix}-${key}" data-range-field="${key}" type="date"${start ? ` min="${start}"` : ''}${end ? ` max="${end}"` : ''} required></div>`;
      rangesMount.insertAdjacentHTML('beforeend', `<div class="extras-price-form-grid mb-3" data-bulk-price-range>${dateField('inicio', 'start_date')}${dateField('fin', 'end_date')}<div class="extras-form-field"><label class="form-label" for="${prefix}-precio">${html(text('price'))}</label><div class="input-group"><input class="form-control lm-input" id="${prefix}-precio" data-range-field="precio" type="number" min="0.01" max="99999999.99" step="0.01" inputmode="decimal" required><span class="input-group-text">EUR</span></div></div><div class="extras-price-submit"><button type="button" class="btn btn-outline-danger btn-sm" data-bulk-price-action="remove">${html(t('delete'))}</button></div></div>`);
      rangesMount.querySelectorAll('[data-bulk-price-action="remove"]').forEach(button => { button.disabled = rangesMount.children.length === 1; });
    };
    const reload = async () => {
      refreshing = true; ready = false; fields.disabled = true; submit.disabled = true; refresh.disabled = true; form.dataset.priceReady = 'false';
      list.innerHTML = loading();
      try {
        const workshops = await request('/admin/workshops');
        if (!current()) return;
        if (!Array.isArray(workshops)) throw new Error(text('invalid_response'));
        if (!workshops.every(workshop => Array.isArray(workshop.prices))) throw new Error(text('invalid_response'));
        const data = workshops.map(workshop => ({ workshop, prices: workshop.prices }));
        if (!current()) return;
        existing = data;
        list.innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th scope="col">${html(text('workshop'))}</th><th scope="col">${html(text('prices'))}</th></tr></thead><tbody>${data.map(item => `<tr><td>${html(item.workshop.name)}</td><td>${productPricesMarkup(item.workshop)}</td></tr>`).join('')}</tbody></table></div>`;
        ready = true;
        form.dataset.priceReady = String(periodValid);
      } catch (error) {
        if (current()) list.innerHTML = notice(error.message);
        throw error;
      } finally {
        refreshing = false;
        if (current()) {
          const saving = form.dataset.saving === 'true';
          fields.disabled = !ready || !periodValid || saving;
          submit.disabled = !ready || !periodValid || saving;
          refresh.disabled = saving;
        }
      }
    };
    form.addEventListener('click', async event => {
      const target = event.target.closest('[data-bulk-price-action]');
      if (!target || target.disabled || refreshing || form.dataset.saving === 'true') return;
      if (target.dataset.bulkPriceAction === 'add') { addRange(); return; }
      if (target.dataset.bulkPriceAction === 'remove') {
        if (rangesMount.children.length > 1) target.closest('[data-bulk-price-range]').remove();
        rangesMount.querySelectorAll('[data-bulk-price-action="remove"]').forEach(button => { button.disabled = rangesMount.children.length === 1; });
        return;
      }
      try { await reload(); } catch { /* The list shows the failure and refresh remains available. */ }
    });
    addRange();
    try { await reload(); } catch { /* Block writes until every existing tariff can be checked. */ }
  }

  async function openPrices(ctx, row) {
    if (!canManage(ctx) || !['workshops', 'packs', 'services'].includes(ctx.resource)) return;
    const generation = state.generation;
    const path = `/admin/${ctx.resource}/${id(row.id)}`;
    const start = calendarDay(String(getEvent()?.registrationStart || '').slice(0, 10));
    const end = calendarDay(String(getEvent()?.registrationEnd || '').slice(0, 10));
    const periodValid = Boolean(start && end && start <= end);
    let prices = [], editing = null, ready = false, reloading = false;
    const priceLabel = t('registration_category_prices_price', text('price'));
    const dateField = name => `<div class="extras-form-field"><label class="form-label" for="extras-field-${name}">${html(text(name))}</label><input class="form-control lm-input" id="extras-field-${name}" name="${name}" type="date"${start ? ` min="${start}"` : ''}${end ? ` max="${end}"` : ''} required></div>`;
    const content = `${periodValid ? '' : notice(text('price_period_missing'), 'warning')}
      <fieldset data-extras-price-fields class="extras-price-fields" disabled>
        <legend class="visually-hidden" data-extras-price-heading>${html(text('add_price'))}</legend>
        <div class="extras-price-form-grid">
          ${dateField('start_date')}${dateField('end_date')}
          <div class="extras-form-field"><label class="form-label" for="extras-field-price">${html(priceLabel)}</label><div class="input-group"><input class="form-control lm-input" id="extras-field-price" name="price" type="number" min="0.01" max="99999999.99" step="0.01" inputmode="decimal" required><span class="input-group-text">EUR</span></div></div>
          <div class="extras-price-submit" data-extras-price-controls></div>
        </div>
      </fieldset>
      <div class="extras-actions mt-2"><button type="button" class="btn btn-outline-secondary btn-sm" data-extras-price-action="reset" hidden>${html(t('cancel'))}</button><button type="button" class="btn btn-outline-secondary btn-sm" data-extras-price-action="refresh" hidden>${html(text('refresh'))}</button></div>
      <div class="extras-prices-table" data-extras-prices-list aria-live="polite"></div>
      <div data-extras-price-confirm aria-live="polite"></div>`;
    const form = await openDialog(`${text('manage_prices')} · ${row.name}`, content, async form => {
      if (!ready || !periodValid) throw new Error(text('price_period_missing'));
      const values = Object.fromEntries(new FormData(form));
      const first = calendarDay(values.start_date), last = calendarDay(values.end_date);
      if (!first || !last || first > last) throw new Error(text('price_invalid_dates'));
      if (first < start || last > end) throw new Error(text('price_outside_period'));
      const amount = String(values.price).trim();
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 99999999.99) throw new Error(text('price_invalid_amount'));
      if (prices.some(price => String(price.id) !== String(editing?.id) && first <= price.end_date && last >= price.start_date)) throw new Error(text('price_overlap'));
      const payload = { start_date: first, end_date: last, price: amount };
      const body = editing ? Object.fromEntries(Object.entries(payload).filter(([key, value]) => key === 'price' ? Number(value) !== Number(editing.price) : value !== editing[key])) : payload;
      if (!editing || Object.keys(body).length) {
        try {
          await request(`${path}/prices${editing ? `/${id(editing.id)}` : ''}`, { method: editing ? 'PATCH' : 'POST', body });
        } catch (error) {
          if (error.status === 409 || error.status === 404) {
            try { await reload(); } catch { /* Keep the original mutation error; the list shows the refresh failure. */ }
          }
          throw error;
        }
      }
      reset();
      await reload();
      feedback.innerHTML = notice(text('saved'), 'success');
      return false;
    }, text('add_price'));
    if (!form || !sameEvent(generation)) return;
    const feedback = form.querySelector('[data-extras-dialog-feedback]');
    const list = form.querySelector('[data-extras-prices-list]');
    const fields = form.querySelector('[data-extras-price-fields]');
    const confirmation = form.querySelector('[data-extras-price-confirm]');
    const submit = form.querySelector('[type="submit"]');
    submit.classList.add('text-nowrap');
    form.querySelector('[data-extras-price-controls]').prepend(submit);
    const cancelEdit = form.querySelector('[data-extras-price-action="reset"]');
    const refreshButton = form.querySelector('[data-extras-price-action="refresh"]');
    const closeButton = form.querySelector('.modal-footer [data-bs-dismiss]');
    closeButton.classList.replace('btn-outline-secondary', 'btn-secondary');
    const current = () => sameEvent(generation) && state.dialog === form.closest('.modal');
    const reset = () => {
      editing = null;
      ['start_date', 'end_date', 'price'].forEach(key => { form.elements.namedItem(key).value = ''; });
      form.querySelector('[data-extras-price-heading]').textContent = text('add_price');
      submit.textContent = text('add_price');
      cancelEdit.hidden = true;
      feedback.innerHTML = ''; confirmation.innerHTML = '';
    };
    const reload = async (preload = false) => {
      reloading = true;
      ready = false; fields.disabled = true; submit.disabled = true; form.dataset.priceReady = 'false';
      list.innerHTML = loading();
      try {
        const products = preload ? ctx.rows : await request(resourcePath(ctx.resource, ctx.accountId));
        if (!current()) return;
        if (!Array.isArray(products) || !products.every(product => Array.isArray(product.prices))) throw new Error(text('invalid_response'));
        const product = products.find(item => String(item.id) === String(row.id));
        if (!product) throw new Error(text('invalid_selection'));
        prices = product.prices;
        ctx.rows = products;
        renderList(ctx);
        list.innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th scope="col">${html(text('start_date'))}</th><th scope="col">${html(text('end_date'))}</th><th scope="col" class="text-end">${html(priceLabel)}</th><th scope="col" class="text-end">${html(text('actions'))}</th></tr></thead><tbody>${prices.map(price => `<tr><td>${html(price.start_date)}</td><td>${html(price.end_date)}</td><td class="text-end">${html(money(price.price))}</td><td class="text-end"><div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-primary" data-extras-price-action="edit" data-price-id="${html(price.id)}" title="${html(t('edit'))}" aria-label="${html(t('edit'))}"${periodValid ? '' : ' disabled'}><i class="bi bi-pencil" aria-hidden="true"></i></button><button type="button" class="btn btn-outline-danger" data-extras-price-action="delete" data-price-id="${html(price.id)}" title="${html(t('delete'))}" aria-label="${html(t('delete'))}"><i class="bi bi-trash" aria-hidden="true"></i></button></div></td></tr>`).join('')}</tbody></table></div>${prices.length ? '' : `<p class="text-muted text-center py-3 mb-0">${html(text('prices_empty'))}</p>`}`;
        refreshButton.hidden = true;
        ready = true;
        form.dataset.priceReady = String(periodValid);
        fields.disabled = !periodValid;
        submit.disabled = !periodValid;
      } catch (error) {
        if (current()) {
          list.innerHTML = notice(error.message);
          refreshButton.hidden = false;
        }
        throw error;
      } finally {
        reloading = false;
      }
    };
    form.addEventListener('click', async event => {
      const target = event.target.closest('[data-extras-price-action]');
      if (!target || target.disabled || reloading || form.dataset.saving === 'true') return;
      const action = target.dataset.extrasPriceAction;
      if (action === 'reset') { reset(); return; }
      if (action === 'cancel-delete') { confirmation.innerHTML = ''; return; }
      if (action === 'edit') {
        editing = prices.find(price => String(price.id) === target.dataset.priceId);
        if (!editing) return;
        ['start_date', 'end_date', 'price'].forEach(key => { form.elements.namedItem(key).value = editing[key]; });
        form.querySelector('[data-extras-price-heading]').textContent = text('save_price');
        submit.textContent = text('save_price');
        cancelEdit.hidden = false;
        feedback.innerHTML = ''; confirmation.innerHTML = '';
        form.elements.namedItem('start_date').focus();
        return;
      }
      if (action === 'delete') {
        confirmation.innerHTML = `${notice(text('price_delete_confirm'), 'warning')}<div class="extras-actions mb-3"><button type="button" class="btn btn-danger btn-sm" data-extras-price-action="confirm-delete" data-price-id="${html(target.dataset.priceId)}">${html(t('delete'))}</button><button type="button" class="btn btn-outline-secondary btn-sm" data-extras-price-action="cancel-delete">${html(t('cancel'))}</button></div>`;
        confirmation.querySelector('button').focus();
        return;
      }
      form.dataset.saving = 'true'; target.disabled = true; submit.disabled = true;
      try {
        if (action === 'confirm-delete') {
          await request(`${path}/prices/${id(target.dataset.priceId)}`, { method: 'DELETE' });
          reset();
        }
        await reload();
      } catch (error) {
        if (current()) feedback.innerHTML = notice(error.message);
      } finally {
        form.dataset.saving = 'false'; target.disabled = false; submit.disabled = !ready || !periodValid;
      }
    });
    try { await reload(true); } catch { /* The list contains the error and a refresh action remains available. */ }
  }

  function bindWorkshopType(form) {
    const teacher = form.elements.namedItem('teacher');
    let workshopTeacher = teacher.value === '-' ? '' : teacher.value;
    const update = () => {
      const isGala = form.elements.namedItem('ws_type').value === 'GA';
      if (isGala && !teacher.disabled) workshopTeacher = teacher.value === '-' ? '' : teacher.value;
      teacher.disabled = isGala;
      teacher.required = !isGala;
      teacher.value = isGala ? '-' : workshopTeacher;
    };
    form.querySelectorAll('input[name="ws_type"]').forEach(radio => radio.addEventListener('change', update));
    update();
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
    const compactProduct = ['packs', 'services'].includes(resource);
    const activeField = `<div class="extras-form-field extras-active-field"><label class="form-check"><input class="form-check-input" type="checkbox" name="is_active"${!row || isActive(original) ? ' checked' : ''}><span class="form-check-label">${html(text('active'))}</span></label></div>`;
    const nameField = input('name', original.name, { required: true });
    const descriptionField = `<div class="extras-form-field"><label class="form-label" for="extras-field-description">${html(text('description'))}</label><textarea class="form-control lm-input" id="extras-field-description" name="description" rows="3">${html(original.description || '')}</textarea></div>`;
    let fields = common ? nameField + descriptionField : '';
    if (resource === 'workshops') {
      fields = `<fieldset class="extras-workshop-type"><legend class="form-label">${html(text('type'))}</legend><div class="extras-workshop-type-options">${[['WS', 'Workshop', 'bi-person-workspace'], ['GA', 'Gala', 'bi-stars']].map(([value, label, icon]) => `<label class="extras-workshop-type-option"><input type="radio" name="ws_type" value="${value}"${(original.ws_type || 'WS') === value ? ' checked' : ''} required><span><i class="bi ${icon}" aria-hidden="true"></i>${label}</span></label>`).join('')}</div></fieldset>` + fields;
      fields += input('teacher', original.teacher, { required: true }) + input('capacity', original.capacity, { type: 'number', min: 1, step: 1, required: true })
        + `<div class="extras-workshop-schedule">${input('day', workshopDateTime(original.start_at).slice(0, 10), { type: 'date', required: true })}${workshopTimePicker('start', original.start_at)}${workshopTimePicker('end', original.end_at)}</div>`;
    }
    if (compactProduct) fields = `<div class="extras-product-editor-heading">${nameField}${activeField}</div>${descriptionField}`;
    if (resource === 'packs') {
      fields += select('mode', [['FIXED', text('fixed')], ['FLEX', text('flex')]], original.mode || 'FIXED') + input('workshop_count', original.workshop_count || 1, { type: 'number', min: 1, step: 1, required: true });
    }
    if (resource === 'discount-codes') {
      fields += input('code', original.code, { required: true, disabled: locked }) + input('amount', original.amount, { type: 'number', min: '0.01', step: '0.01', required: true, disabled: locked })
        + select('audience', [['SCH', text('school')], ['PAR', text('individual')], ['BOTH', text('both')]], original.audience || 'BOTH', true, locked)
        + input('valid_from', original.valid_from, { type: 'datetime-local', disabled: locked }) + input('valid_until', original.valid_until, { type: 'datetime-local', disabled: locked })
        + input('max_uses', original.max_uses, { type: 'number', min: 1, step: 1, disabled: locked });
    }
    if (!compactProduct) fields += activeField;
    const composition = resource === 'packs' ? `<div class="extras-pack-editor-workshops">${workshopSelector(workshops, ids(original))}</div>` : '';
    const form = await openDialog(`${row ? t('edit') : text('add')} · ${titleFor(ctx)}`, `${locked ? notice(text('discount_locked'), 'info') : ''}<div class="extras-form-grid${compactProduct ? ' extras-product-editor-fields' : ''}">${fields}</div>${composition}`, async (form) => {
      const values = Object.fromEntries(new FormData(form));
      if (resource === 'workshops') {
        if (!['WS', 'GA'].includes(values.ws_type)) throw new Error(text('required_fields'));
        if (values.ws_type === 'GA') values.teacher = '-';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(values.day) || !['start', 'end'].every(part => /^(?:[01]\d|2[0-3])$/.test(values[`${part}_hour`]) && /^[0-5]\d$/.test(values[`${part}_minute`]))) throw new Error(text('required_fields'));
        values.start_at = `${values.day}T${values.start_hour}:${values.start_minute}`;
        values.end_at = `${values.day}T${values.end_hour}:${values.end_minute}`;
      }
      const payload = {};
      const keys = resource === 'discount-codes' ? (locked ? [] : ['code', 'amount', 'audience', 'valid_from', 'valid_until', 'max_uses']) : ['name', 'description', ...(resource === 'workshops' ? ['ws_type', 'teacher', 'start_at', 'end_at', 'capacity'] : []), ...(resource === 'packs' ? ['mode', 'workshop_count'] : [])];
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
          if (['start_at', 'end_at'].includes(key)) return workshopDateTime(value) !== workshopDateTime(original[key]);
          if (['valid_from', 'valid_until'].includes(key)) return localDateTime(value) !== localDateTime(original[key]);
          if (key === 'is_active') return value !== isActive(original);
          if (['price', 'amount', 'capacity', 'workshop_count', 'max_uses'].includes(key)) return value == null ? original[key] != null : original[key] == null || Number(value) !== Number(original[key]);
          return String(value ?? '') !== String(original[key] ?? '');
        }));
        if (resource === 'packs' && !sameIds(selected, ids(original))) {
          data.workshop_ids = selected;
        }
        if (Object.keys(data).length) {
          await request(`${resourcePath(resource, ctx.accountId)}/${id(row.id)}`, { method: 'PATCH', body: data });
        }
      } else {
        if (resource === 'packs') data.workshop_ids = selected;
        await request(resourcePath(resource, ctx.accountId), { method: 'POST', body: data });
      }
      await afterMutation(ctx, text('saved'));
    });
    if (form && resource === 'workshops') bindWorkshopType(form);
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
    const initialType = original.item_type || (productResource === 'workshops' && product?.ws_type === 'GA' ? 'GALA' : null) || ({ workshops: 'WORKSHOP', packs: 'PACK', services: 'SERVICE' }[productResource]) || 'WORKSHOP';
    const products = { WORKSHOP: workshops.filter(item => item.ws_type !== 'GA'), GALA: workshops.filter(item => item.ws_type === 'GA'), PACK: packs, SERVICE: services };
    // Allow an unchanged pending booking to retain an inactive historical product.
    if (original.id) {
      const historical = original.pack || original.service || original.workshop || (['WORKSHOP', 'GALA'].includes(original.item_type) ? original.workshops?.[0] : null);
      const historicalId = original.pack_id || original.service_id || ids(original)[0];
      if (historicalId && !products[initialType].some(item => Number(item.id) === Number(historicalId))) {
        products[initialType].push(historical || { id: historicalId, name: bookingConcept(original), mode: original.pack_mode, workshop_count: original.workshop_count, workshop_ids: ids(original), workshops: original.workshops || [] });
      }
    }
    const initialProductId = product?.id || original.pack_id || original.service_id || ids(original)[0] || '';
    let currentType = initialType;
    let currentProduct = null;
    const keepsProduct = () => Boolean(original.id) && currentType === initialType && String(currentProduct?.id) === String(initialProductId);
    const fields = `${original.id || product ? '' : select('item_type', ['WORKSHOP', 'GALA', 'PACK', 'SERVICE'].map(value => [value, typeName(value)]), initialType)}<div data-extras-booking-fields></div>`;
    const form = await openDialog(original.id ? t('edit') : text('book'), fields, async form => {
      if (!keepsProduct() && !hasPrice(currentProduct)) throw new Error(text('price_unavailable'));
      const payload = bookingPayload(form, currentType, currentProduct, participants);
      if (!original.id && payload.attendee_id === null) delete payload.attendee_id;
      let body = payload;
      try {
        if (original.id) {
          delete payload.item_type;
          body = Object.fromEntries(Object.entries(payload).filter(([key, value]) => {
            if (key === 'workshop_ids') return !sameIds(value, ids(original)) || (currentType === 'PACK' && Number(payload.pack_id) !== Number(original.pack_id));
            return String(value ?? '') !== String(original[key] ?? '');
          }));
          if (Object.keys(body).length) await request(`${resourcePath('bookings', ctx.accountId)}/${id(original.id)}`, { method: 'PATCH', body });
        } else await request(resourcePath('bookings', ctx.accountId), { method: 'POST', body });
      } catch (error) {
        if (error.code === 'extras_price_not_available') {
          const resource = { WORKSHOP: 'workshops', GALA: 'workshops', PACK: 'packs', SERVICE: 'services' }[currentType];
          const selectedId = currentProduct?.id;
          // Block the stale offer even if refreshing the catalog fails.
          currentProduct.price = null;
          renderProduct(selectedId);
          try {
            const refreshed = await request(catalogPath(resource));
            products[currentType] = currentType === 'GALA' ? refreshed.filter(item => item.ws_type === 'GA') : currentType === 'WORKSHOP' ? refreshed.filter(item => item.ws_type !== 'GA') : refreshed;
            renderProduct(selectedId);
            if (ctx.catalogResource) await loadCatalog(ctx.mount, ctx.catalogResource);
          } catch { /* Keep the unavailable state and the original API error. */ }
        }
        throw error;
      }
      await afterMutation(ctx, original.id ? text('saved') : text('booking_pending'));
    }, original.id ? t('save') : text('book'));
    if (!form) return;
    const attendeeOptions = [['', text('select_participant')], ...participants.map(item => [item.id, participantName(item)])];
    const renderProduct = (productId, preserve = false) => {
      const area = form.querySelector('[data-extras-product-fields]');
      currentProduct = products[currentType].find(item => String(item.id) === String(productId));
      const available = keepsProduct() || hasPrice(currentProduct);
      form.dataset.bookingAvailable = String(available);
      form.querySelector('[type="submit"]').disabled = !available;
      if (!currentProduct) { area.innerHTML = ''; return; }
      const item = currentProduct;
      const attendee = form.querySelector('[name="attendee_id"]');
      if (attendee) attendee.required = currentType !== 'SERVICE';
      const amount = keepsProduct() ? original.unit_price ?? (original.total_amount != null ? Number(original.total_amount) / (Number(original.quantity) || 1) : null) : item.price;
      let content = `<p class="mt-3"><strong>${html(item.name)}</strong>${amount != null ? ` · ${html(money(amount))}` : ''}</p>${available ? '' : notice(text('price_unavailable'), 'warning')}`;
      if (currentType === 'SERVICE') content += input('quantity', preserve ? original.quantity || 1 : 1, { type: 'number', min: 1, step: 1, required: true });
      if (['WORKSHOP', 'GALA'].includes(currentType)) content += workshopDescription(item) + `<p class="small text-body-secondary">${html(text('capacity_pending_hint'))}</p>`;
      if (currentType === 'PACK') {
        content += `<p>${html(text(item.mode === 'FLEX' ? 'flex' : 'fixed'))}</p>`;
        if (item.mode === 'FLEX') content += workshopSelector(packWorkshops(item, workshops), preserve ? ids(original) : []);
        else content += packWorkshopSummary({ ...item, workshops: packWorkshops(item, workshops) });
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
      const attendeeId = original.attendee_id || (!original.id && (type !== 'SERVICE' || !admin()) && participants.length === 1 ? participants[0].id : '');
      form.querySelector('[data-extras-booking-fields]').innerHTML = `<div class="extras-form-grid">${select('product_id', [['', text('select_product')], ...products[type].map(item => [item.id, item.name])], productId)}${select('attendee_id', attendeeOptions, attendeeId, type !== 'SERVICE')}</div>${participantError ? notice(participantError, 'warning') : !participants.length && type !== 'SERVICE' ? notice(text(admin() ? 'account_needs_participants' : 'create_participant_first'), 'info') : ''}<div data-extras-product-fields></div>`;
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
    if (['WORKSHOP', 'GALA'].includes(type)) payload.workshop_ids = [id(product.id)];
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
    if (['workshops', 'packs', 'services'].includes(ctx.resource)) return;
    const item = await request(`${resourcePath(ctx.resource, ctx.accountId)}/${id(row.id)}`);
    if (ctx.resource === 'bookings' && item.attendee_id != null) {
      ctx.participants = await loadBookingParticipants(ctx.accountId);
    }
    let content = `<dl class="extras-detail-grid">${columns(ctx).map(key => fieldLabel(text(key), cell(ctx, item, key))).join('')}</dl>`;
    if (item.description && !columns(ctx).includes('description')) content += `<p class="extras-description">${html(item.description)}</p>`;
    if (ctx.resource === 'discount-codes') {
      const usage = await request(`/admin/discount-codes/${id(row.id)}/usage`);
      content += `<h3 class="h6">${html(text('usage'))}</h3><dl class="extras-detail-grid">${['used_count', 'max_uses', 'remaining_uses'].map(key => fieldLabel(text(key), html(usage[key] ?? text('unlimited')))).join('')}</dl>`;
    }
    if (ctx.resource === 'bookings' && item.workshops?.length) content += `<h3 class="h6">${html(text('workshops'))}</h3><ul>${item.workshops.map(w => `<li>${html(w.name)} · ${html(workshopTimestamp(w.start_at))}</li>`).join('')}</ul>`;
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
    if (accountSummaryVisible() && String(ctx?.accountId) === String(state.account.id)) renderAccount();
  }

  async function confirmAction(ctx, action, row) {
    if (ctx.resource === 'bookings' && !(action === 'delete' ? ['PENDING', 'VALIDATED'].includes(row.status) : row.status === 'PENDING')) throw new Error(text('pending_only'));
    const question = text(action === 'delete' ? 'delete_confirm' : action === 'validate' ? 'validate_confirm' : 'reject_confirm');
    await openDialog(text(action === 'delete' ? 'delete' : action), `<p>${html(question)}</p><p class="fw-semibold">${html(row.name || row.code || bookingConcept(row))}</p>`, async () => {
      const path = `${resourcePath(ctx.resource, ctx.accountId)}/${id(row.id)}`;
      // Validation and rejection deliberately have no request body.
      if (action === 'delete') await request(path, { method: 'DELETE' });
      else await request(`/admin/bookings/${id(row.id)}/${action}`, { method: 'POST' });
      await afterMutation(ctx, text('saved'));
    }, t('confirm', text('confirm')));
  }

  async function renderAccount({ reloadSummary = true } = {}) {
    const mount = document.getElementById('registrationAccountExtras');
    if (!mount || !enabled() || !admin() || !state.account) return;
    const accountId = id(state.account.id);
    const generation = state.generation, serial = ++state.accountSerial;
    state.contexts.delete(mount.querySelector('[data-extras-account-content]'));
    mount.classList.remove('d-none');
    mount.innerHTML = `<h2 class="h5">${html(text('account_extras'))}</h2><div class="extras-actions mb-3" role="group" aria-label="${html(text('account_extras'))}">${['bookings', 'summary'].map(tab => `<button type="button" class="btn btn-${tab === state.accountTab ? 'primary' : 'outline-secondary'} btn-sm" data-extras-account-tab="${tab}" aria-pressed="${tab === state.accountTab}">${html(text(tab))}</button>`).join('')}</div><div data-extras-account-content></div>`;
    const area = mount.querySelector('[data-extras-account-content]');
    if (state.accountTab !== 'summary') {
      const ctx = createContext(area, state.accountTab, accountId);
      buildShell(ctx);
      await loadContext(ctx);
    } else {
      if (reloadSummary) state.accountSummary = null;
      area.innerHTML = `<div data-extras-account-summary>${loading()}</div><div class="mt-3" data-extras-discount></div>`;
      loadDiscount(area.querySelector('[data-extras-discount]'), accountId);
      try {
        const summary = reloadSummary || !state.accountSummary
          ? checkedSummary(await request(summaryPath(accountId))) : state.accountSummary;
        if (!sameEvent(generation) || serial !== state.accountSerial || state.account?.id !== accountId || state.accountTab !== 'summary' || !area.isConnected) return;
        state.accountSummary = summary;
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
    const catalogTab = event.target.closest('[data-extras-catalog-tab]');
    if (catalogTab && enabled()) {
      selectCatalogTab(catalogTab);
      return;
    }
    const tab = event.target.closest('[data-extras-account-tab]');
    if (tab && enabled()) {
      state.accountTab = tab.dataset.extrasAccountTab;
      await renderAccount();
      return;
    }
    const target = event.target.closest('[data-extras-action], [data-summary-kind], [data-summary-expand], [data-summary-booking]');
    if (!target || target.disabled || !enabled()) return;
    const action = target.dataset.extrasAction;
    const ctx = closestContext(target);
    target.disabled = true;
    try {
      if (ctx?.resource === 'validated-summary') {
        if (!admin()) return;
        if (target.dataset.summaryKind && summaryKinds.includes(target.dataset.summaryKind)) {
          ctx.summaryKind = target.dataset.summaryKind;
          renderValidatedSummary(ctx); return;
        }
        if (target.hasAttribute('data-summary-expand')) {
          ctx.mount.querySelectorAll('[data-summary-product]').forEach(details => {
            details.open = target.dataset.summaryExpand === 'true';
            if (details.open) ctx.summaryOpen.add(details.dataset.summaryProduct);
            else ctx.summaryOpen.delete(details.dataset.summaryProduct);
          });
          return;
        }
        if (target.dataset.summaryBooking) {
          const bookingId = id(target.dataset.summaryBooking);
          if (!ctx.summaryData || !summaryKinds.some(kind => ctx.summaryData[kind].some(item => item.bookings.some(booking => Number(booking.booking_id) === bookingId)))) return;
          await openDetails({ resource: 'bookings', accountId: null, participants: [] }, { id: bookingId });
          return;
        }
      }
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
      if (action === 'bulk-prices') return await openBulkWorkshopPrices(ctx);
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
      if (action === 'prices' && canManage(ctx)) await openPrices(ctx, row);
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
      ctx.page = 1; if (data.page_size) ctx.pageSize = Number(data.page_size); delete data.page_size;
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
    if (resource === 'validated-summary' && !admin()) return;
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
      state.summaries.clear(); state.summaryIds = null; state.financeError = ''; state.financeSerial += 1;
      state.contexts.clear(); state.account = null; state.accountSummary = null; state.accountSerial += 1;
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
      document.addEventListener('input', event => {
        if (!enabled() || !admin() || !event.target.matches('[data-summary-search]')) return;
        const ctx = closestContext(event.target);
        if (!ctx) return;
        ctx.summarySearch = event.target.value;
        if (ctx.summarySearch.trim() && ctx.summaryData) ctx.summaryData[ctx.summaryKind].forEach(item => ctx.summaryOpen.add(`${ctx.summaryKind}-${item.id}`));
        renderValidatedSummary(ctx);
      });
      document.addEventListener('change', event => {
        if (!enabled() || !admin() || !event.target.matches('[data-summary-booked]')) return;
        const ctx = closestContext(event.target);
        if (!ctx) return;
        ctx.summaryOnlyBooked = event.target.checked;
        renderValidatedSummary(ctx);
      });
      document.addEventListener('keydown', event => {
        const tab = event.target.closest('[data-extras-catalog-tab]');
        if (!tab || !enabled() || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...tab.parentElement.querySelectorAll('[data-extras-catalog-tab]')];
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectCatalogTab(tabs[index]);
        tabs[index].focus();
      });
      document.addEventListener('submit', handleSubmit);
      window.addEventListener('registration:panel-changed', event => {
        state.financeSerial += 1;
        loadPanel(event.detail.key);
        if (['payments', 'dashboard'].includes(event.detail.key)) refreshFinance();
      });
      window.addEventListener('registration:account-opened', event => {
        if (!enabled() || !admin()) return;
        state.account = { ...event.detail.account, id: id(event.detail.account.id) };
        state.accountTab = 'bookings'; state.accountSummary = null;
        renderAccount();
      });
      let financeUpdateQueued = false;
      ['registration:school-registrations-updated', 'registration:organizer-registrations-updated', 'registration:schools-updated', 'registration:config-updated'].forEach(name => window.addEventListener(name, event => {
        if (!enabled() || event.detail?.financeChanged === false) return;
        if (!financeVisible() && !accountSummaryVisible()) return;
        if (financeUpdateQueued) return;
        financeUpdateQueued = true;
        const financeSerial = state.financeSerial, accountSerial = state.accountSerial;
        queueMicrotask(() => {
          financeUpdateQueued = false;
          if (financeSerial === state.financeSerial) refreshFinance();
          if (accountSerial === state.accountSerial && accountSummaryVisible()) renderAccount();
        });
      }));
      document.getElementById('registrationPaymentsSharedSchoolFilter')?.addEventListener('change', renderFinance);
      document.getElementById('registrationPaymentsSharedFilterClear')?.addEventListener('click', () => queueMicrotask(renderFinance));
      const observer = new MutationObserver(async () => {
        await ensureTranslationsReady();
        if (!enabled()) return;
        renderRegistrationSidebar(state.role);
        state.contexts.forEach(ctx => { buildShell(ctx); renderList(ctx); });
        if (accountVisible() && (state.accountTab !== 'summary' || state.accountSummary)) renderAccount({ reloadSummary: false });
        renderFinance();
        const discount = document.querySelector('#registrationExtrasFinance [data-extras-discount]');
        if (discount && registrationNavigationState.activeKey === 'payments') loadDiscount(discount);
        const active = document.querySelector('[data-extras-resource].active');
        if (active && !admin() && ['workshops', 'services'].includes(active.dataset.extrasResource)) loadCatalog(active, active.dataset.extrasResource);
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
    }
    // Navigation owns the initial summary request; initialization never sends one.
  }
  return { init, enabled, request, getFinanceSummary, refreshFinance };
})();
