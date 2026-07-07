const registrationState = {
  school: null,
  participants: [],
  registrations: [],
  organizerRegistrations: [],
  schools: [],
  registrationConfig: {
    categories: [],
    styles: []
  },
  registrationCategories: [],
  registrationDisciplines: []
};

let schoolLoadPromise = null;
const registrationResourceCache = {
  eventSchools: new Map(),
  registrationCategories: new Map(),
  registrationStyles: new Map()
};
const registrationResourceRequests = {
  eventSchools: new Map(),
  registrationCategories: new Map(),
  registrationStyles: new Map()
};
const registrationSyncEndpoints = {
  organizerRegistrations: '/api/registrations/choreographies',
  synchronization: '/api/registrations/synchronization'
};
const REGISTRATION_NAV_ITEMS = [
  {
    key: 'dashboard',
    paneId: 'dashboard',
    roles: ['school', 'organizer'],
    icon: 'bi-speedometer2',
    labelKey: 'registration_tab_dashboard',
    fallbackLabel: 'Dashboard'
  },
  {
    key: 'school',
    paneId: 'school',
    roles: ['school'],
    icon: 'bi-building',
    labelKey: 'registration_tab_school',
    fallbackLabel: 'School details'
  },
  {
    key: 'participants',
    paneId: 'participants',
    roles: ['school', 'organizer'],
    icon: 'bi-people',
    labelKey: 'registration_tab_participants',
    fallbackLabel: 'Participants'
  },
  {
    key: 'competitions',
    paneId: 'competitions',
    roles: ['school'],
    icon: 'bi-trophy',
    labelKey: 'registration_tab_competitions',
    fallbackLabel: 'Competition registrations'
  },
  {
    key: 'schools',
    paneId: 'schools',
    roles: ['organizer'],
    icon: 'bi-buildings',
    labelKey: 'registration_tab_schools',
    fallbackLabel: 'Schools'
  },
  {
    key: 'org-registrations',
    paneId: 'org-registrations',
    roles: ['organizer'],
    icon: 'bi-journal-check',
    labelKey: 'registration_tab_org_registrations',
    fallbackLabel: 'Registrations'
  },
  {
    key: 'registration-categories',
    paneId: 'registration-categories',
    roles: ['organizer'],
    icon: 'bi-tags',
    labelKey: 'registration_tab_categories',
    fallbackLabel: 'Categories'
  },
  {
    key: 'registration-disciplines',
    paneId: 'registration-disciplines',
    roles: ['organizer'],
    icon: 'bi-music-note-beamed',
    labelKey: 'registration_tab_disciplines',
    fallbackLabel: 'Disciplines/Styles'
  },
  {
    key: 'event-sync',
    paneId: 'event-sync',
    roles: ['organizer'],
    icon: 'bi-arrow-repeat',
    labelKey: 'registration_tab_event_sync',
    fallbackLabel: 'Event Synchronization'
  }
];
const registrationNavigationState = {
  role: 'guest',
  activeKey: ''
};

function getRegistrationEventKey(eventId = getEvent()?.id) {
  return eventId != null && eventId !== '' ? `${eventId}` : '__all__';
}

async function fetchRegistrationResource(resourceType, key, fetcher, { force = false } = {}) {
  const cache = registrationResourceCache[resourceType];
  const requests = registrationResourceRequests[resourceType];

  if (force) {
    cache.delete(key);
  }

  if (cache.has(key)) {
    return cache.get(key);
  }

  if (requests.has(key)) {
    return requests.get(key);
  }

  const request = (async () => {
    const data = await fetcher();
    cache.set(key, data);
    return data;
  })();

  requests.set(key, request);

  try {
    return await request;
  } finally {
    requests.delete(key);
  }
}

async function fetchEventSchools({ force = false } = {}) {
  const eventObj = getEvent();
  const eventId = eventObj?.id;
  const key = getRegistrationEventKey(eventId);

  const schools = await fetchRegistrationResource('eventSchools', key, async () => {
    const params = new URLSearchParams();
    if (eventId) {
      params.set('event_id', eventId);
    }

    const url = params.toString()
      ? `${API_BASE_URL}/api/schools?${params.toString()}`
      : `${API_BASE_URL}/api/schools`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(t('schools_load_error', 'Error loading schools.'));
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }, { force });

  registrationState.schools = schools;
  return schools;
}

async function fetchRegistrationCategories({ force = false } = {}) {
  const eventObj = getEvent();
  const eventId = eventObj?.id;
  const key = getRegistrationEventKey(eventId);

  const categories = await fetchRegistrationResource('registrationCategories', key, async () => {
    const params = new URLSearchParams();
    if (eventId) {
      params.set('event_id', eventId);
    }

    const url = params.toString()
      ? `${API_BASE_URL}/api/registrations/categories?${params.toString()}`
      : `${API_BASE_URL}/api/registrations/categories`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(t('registration_categories_load_error', 'Error loading categories.'));
    }

    const data = await res.json();
    return Array.isArray(data)
      ? data
      : (Array.isArray(data?.categories) ? data.categories : []);
  }, { force });

  registrationState.registrationCategories = categories;
  syncRegistrationConfigState();
  return categories;
}

async function fetchRegistrationStyles({ force = false } = {}) {
  const eventObj = getEvent();
  const eventId = eventObj?.id;
  const key = getRegistrationEventKey(eventId);

  const styles = await fetchRegistrationResource('registrationStyles', key, async () => {
    const params = new URLSearchParams();
    if (eventId) {
      params.set('event_id', eventId);
    }

    const url = params.toString()
      ? `${API_BASE_URL}/api/registrations/styles?${params.toString()}`
      : `${API_BASE_URL}/api/registrations/styles`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(t('registration_disciplines_load_error', 'Error loading disciplines.'));
    }

    const data = await res.json();
    return Array.isArray(data)
      ? data
      : (Array.isArray(data?.styles) ? data.styles : (Array.isArray(data?.disciplines) ? data.disciplines : []));
  }, { force });

  registrationState.registrationDisciplines = styles;
  syncRegistrationConfigState();
  return styles;
}

async function fetchOrganizerRegistrationsForEvent() {
  const params = new URLSearchParams();
  const eventObj = getEvent();
  if (eventObj?.id) {
    params.set('event_id', eventObj.id);
  }

  const url = params.toString()
    ? `${API_BASE_URL}${registrationSyncEndpoints.organizerRegistrations}?${params.toString()}`
    : `${API_BASE_URL}${registrationSyncEndpoints.organizerRegistrations}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(t('org_registrations_load_error', 'Error loading registrations.'));
  }

  const data = await res.json();
  const registrations = Array.isArray(data) ? data : [];
  registrationState.organizerRegistrations = registrations;
  return registrations;
}

function escapeRegistrationTooltipHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeRegistrationValidationErrorMessages(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeRegistrationValidationErrorMessages(item));
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const text = `${value}`.trim();
    return text ? [text] : [];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const directText = value.text_error
    ?? value.message
    ?? value.error
    ?? value.detail
    ?? value.msg;

  if (directText !== undefined && directText !== null) {
    const text = `${directText}`.trim();
    return text ? [text] : [];
  }

  return Object.values(value).flatMap((item) => normalizeRegistrationValidationErrorMessages(item));
}

function getRegistrationValidationErrorMessages(data) {
  const messages = normalizeRegistrationValidationErrorMessages(data?.validation_errors);
  return Array.from(new Set(messages));
}

function buildRegistrationValidationErrorsTooltip(data) {
  const items = getRegistrationValidationErrorMessages(data)
    .map((message) => `<li>${escapeRegistrationTooltipHtml(message)}</li>`);

  if (!items.length) {
    return escapeRegistrationTooltipHtml(t('registration_alerts_has_errors', 'Open alerts'));
  }

  return `<div style="text-align:left;"><ul class="mb-0 ps-3">${items.join('')}</ul></div>`;
}

function createRegistrationAlertsIcon(data) {
  const icon = document.createElement('i');
  const hasValidationErrors = isRegistrationFlagEnabled(data?.has_validation_errors);

  if (hasValidationErrors) {
    icon.className = 'bi bi-exclamation-triangle-fill text-warning';
    icon.setAttribute('data-bs-toggle', 'tooltip');
    icon.setAttribute('data-bs-placement', 'top');
    icon.setAttribute('data-bs-custom-class', 'alerts-tooltip');
    icon.setAttribute('data-bs-html', 'true');
    icon.setAttribute('data-bs-title', buildRegistrationValidationErrorsTooltip(data));
    icon.setAttribute('aria-label', t('registration_alerts_has_errors', 'Open alerts'));
    return icon;
  }

  icon.className = 'bi bi-patch-check-fill text-success';
  icon.setAttribute('aria-label', t('registration_alerts_no_errors', 'No alerts'));
  return icon;
}

function disposeTooltipInstances(instances = []) {
  (Array.isArray(instances) ? instances : []).forEach((instance) => instance?.dispose?.());
  return [];
}

function initTooltipInstances(rootEl) {
  if (!rootEl || !window.bootstrap?.Tooltip) {
    return [];
  }

  return Array.from(rootEl.querySelectorAll('[data-bs-toggle="tooltip"]')).map((element) =>
    bootstrap.Tooltip.getOrCreateInstance(element)
  );
}

function syncRegistrationConfigState() {
  registrationState.registrationConfig = {
    categories: Array.isArray(registrationState.registrationCategories)
      ? registrationState.registrationCategories
      : [],
    styles: Array.isArray(registrationState.registrationDisciplines)
      ? registrationState.registrationDisciplines
      : []
  };
}

function notifyRegistrationConfigUpdate() {
  syncRegistrationConfigState();
  window.dispatchEvent(new CustomEvent('registration:config-updated'));
}

function notifyRegistrationSchoolsUpdate() {
  window.dispatchEvent(new CustomEvent('registration:schools-updated'));
}

function notifyRegistrationParticipantsUpdate() {
  window.dispatchEvent(new CustomEvent('registration:participants-updated'));
}

function notifySchoolRegistrationsUpdate() {
  window.dispatchEvent(new CustomEvent('registration:school-registrations-updated'));
}

function notifyOrganizerRegistrationsUpdate() {
  window.dispatchEvent(new CustomEvent('registration:organizer-registrations-updated'));
}

function getRegistrationRole(user = getUserFromToken()) {
  const role = user?.role?.toLowerCase() || 'guest';
  return role === 'admin' ? 'organizer' : role;
}

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();
  const user = getUserFromToken();
  const role = getRegistrationRole(user);
  setupRegistrationNavigation(role);
  if (role === 'school') {
    initSchoolTab();
    initCompetitionsTab();
    initSchoolDashboard();
  }
  initParticipantsTab(role);
  if (role === 'organizer') {
    initOrganizerDashboard();
    initSchoolsTab();
    initOrganizerRegistrationsTab();
    initRegistrationCategoriesTab();
    initRegistrationDisciplinesTab();
    initEventSyncTab();
  }
});

function setupRegistrationNavigation(role) {
  registrationNavigationState.role = role;
  initRegistrationDashboard(role);
  applyRegistrationRoleVisibility(role);
  renderRegistrationSidebar(role);

  const visibleItems = getVisibleRegistrationNavItems(role);
  const requestedKey = window.location.hash.replace('#', '').trim();
  const requestedItem = visibleItems.find(item => item.key === requestedKey || item.paneId === requestedKey);
  const defaultItem = visibleItems.find(item => item.key === 'dashboard') || visibleItems[0] || null;

  if (requestedItem) {
    showRegistrationPanel(requestedItem.key);
  } else if (defaultItem) {
    showRegistrationPanel(defaultItem.key);
  }
}

function getVisibleRegistrationNavItems(role = registrationNavigationState.role) {
  return REGISTRATION_NAV_ITEMS.filter(item => item.roles.includes(role));
}

function getRegistrationSidebarTitle() {
  const currentEvent = getEvent();
  if (currentEvent?.name) {
    return currentEvent.name;
  }
  return t('registration_sidebar_section', 'Registration');
}

function getRegistrationCalendarDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    const clone = new Date(value.getTime());
    return Number.isNaN(clone.getTime()) ? null : clone;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRegistrationDayDate(value) {
  const date = getRegistrationCalendarDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatRegistrationSidebarDate(value) {
  const date = getRegistrationCalendarDate(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat(getRegistrationLanguage(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function formatRegistrationSidebarRange(startValue, endValue) {
  const startLabel = formatRegistrationSidebarDate(startValue);
  const endLabel = formatRegistrationSidebarDate(endValue);
  const noDatesLabel = t('registration_sidebar_no_dates', 'No dates available');

  if (startLabel === '-' && endLabel === '-') return noDatesLabel;
  if (startLabel === '-') return endLabel;
  if (endLabel === '-') return startLabel;
  return `${startLabel} - ${endLabel}`;
}

function getRegistrationSidebarStatusInfo() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = getRegistrationDayDate(getEvent()?.registrationStart);
  const endDate = getRegistrationDayDate(getEvent()?.registrationEnd);
  const isOpen = Boolean(startDate && endDate && today >= startDate && today <= endDate);

  return {
    isOpen,
    label: isOpen
      ? t('registration_sidebar_status_open', 'Inscripciones abiertas')
      : t('registration_sidebar_status_closed', 'Inscripciones cerradas'),
    icon: isOpen ? 'bi-unlock-fill' : 'bi-lock-fill',
    state: isOpen ? 'open' : 'closed'
  };
}

function getRegistrationSidebarCopy() {
  return {
    eventDates: t('registration_sidebar_event_dates', 'Fechas del evento'),
    registrationDates: t('registration_sidebar_registration_dates', 'Periodo de inscripcion'),
    menuButton: t('registration_sidebar_menu_button', 'Open menu'),
    closeButton: t('registration_sidebar_close_button', 'Close')
  };
}

function buildRegistrationSidebarHeroMarkup() {
  const copy = getRegistrationSidebarCopy();
  const eventObj = getEvent();
  const statusInfo = getRegistrationSidebarStatusInfo();
  const eventRange = formatRegistrationSidebarRange(eventObj?.start, eventObj?.end);
  const registrationRange = formatRegistrationSidebarRange(eventObj?.registrationStart, eventObj?.registrationEnd);

  return `
    <div class="registration-sidebar-meta">
      <div>
        <span class="registration-sidebar-status" data-state="${statusInfo.state}">
          <i class="bi ${statusInfo.icon}"></i>
          <span>${statusInfo.label}</span>
        </span>
      </div>
      <div class="registration-sidebar-meta-row">
        <div class="registration-sidebar-meta-label">
          <i class="bi bi-calendar-event"></i>
          <span>${copy.eventDates}</span>
        </div>
        <div class="registration-sidebar-meta-value">${eventRange}</div>
      </div>
      <div class="registration-sidebar-meta-row">
        <div class="registration-sidebar-meta-label">
          <i class="bi bi-journal-check"></i>
          <span>${copy.registrationDates}</span>
        </div>
        <div class="registration-sidebar-meta-value">${registrationRange}</div>
      </div>
    </div>
  `;
}

function buildRegistrationSidebarItemsMarkup(role, activeKey, options = {}) {
  const itemClassName = options.itemClassName
    || 'list-group-item list-group-item-action d-flex align-items-center gap-3 px-3 py-3 text-start';

  return getVisibleRegistrationNavItems(role).map((item) => {
    const isActive = item.key === activeKey;
    const activeClasses = isActive ? ' active' : '';
    const activeAttributes = isActive ? ' aria-current="page"' : '';

    return `
      <button
        type="button"
        class="${itemClassName}${activeClasses}"
        data-registration-nav-key="${item.key}"${activeAttributes}>
        <i class="bi ${item.icon}"></i>
        <span>${t(item.labelKey, item.fallbackLabel)}</span>
      </button>
    `;
  }).join('');
}

function renderRegistrationSidebar(role) {
  const desktopMount = document.getElementById('registrationSidebarMount');
  const mobileMount = document.getElementById('registrationSidebarToggle');

  if (!desktopMount && !mobileMount) {
    return;
  }

  const visibleItems = getVisibleRegistrationNavItems(role);
  if (!visibleItems.length) {
    if (desktopMount) desktopMount.innerHTML = '';
    if (mobileMount) mobileMount.innerHTML = '';
    return;
  }

  const copy = getRegistrationSidebarCopy();
  const title = getRegistrationSidebarTitle();
  const activeKey = registrationNavigationState.activeKey;
  const heroMarkup = buildRegistrationSidebarHeroMarkup();

  const desktopMarkup = `
    <div class="sticky-lg-top">
      <div class="card border-0 shadow-sm registration-sidebar-card">
        <div class="card-body border-bottom">
          <div class="h5 mb-1">${title}</div>
          ${heroMarkup}
        </div>
        <div class="list-group list-group-flush">
          ${buildRegistrationSidebarItemsMarkup(role, activeKey, {
            itemClassName: 'list-group-item list-group-item-action d-flex align-items-center gap-3 px-3 py-3 border-0 border-bottom text-start'
          })}
        </div>
      </div>
    </div>
  `;

  const mobileMarkup = `
    <button
      class="btn btn-outline-dark d-inline-flex align-items-center gap-2"
      type="button"
      data-bs-toggle="offcanvas"
      data-bs-target="#registrationSidebarOffcanvas"
      aria-controls="registrationSidebarOffcanvas">
      <i class="bi bi-list"></i>
      <span>${copy.menuButton}</span>
    </button>
    <div class="offcanvas offcanvas-start" tabindex="-1" id="registrationSidebarOffcanvas" aria-labelledby="registrationSidebarTitleMobile">
      <div class="offcanvas-header border-bottom">
        <div>
          <div class="h5 mb-1" id="registrationSidebarTitleMobile">${title}</div>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="${copy.closeButton}"></button>
      </div>
      <div class="offcanvas-body p-0">
        <div class="p-3 border-bottom">
          ${heroMarkup}
        </div>
        <div class="list-group list-group-flush">
          ${buildRegistrationSidebarItemsMarkup(role, activeKey)}
        </div>
      </div>
    </div>
  `;

  if (desktopMount) {
    desktopMount.innerHTML = desktopMarkup;
  }
  if (mobileMount) {
    mobileMount.innerHTML = mobileMarkup;
  }
}

function hideRegistrationSidebarOffcanvas() {
  const offcanvasEl = document.getElementById('registrationSidebarOffcanvas');
  if (!offcanvasEl || !offcanvasEl.classList.contains('show')) {
    return;
  }

  bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl).hide();
}

function showRegistrationPanel(panelKey) {
  const activeItem = getVisibleRegistrationNavItems().find(item => item.key === panelKey);
  if (!activeItem) {
    return false;
  }

  REGISTRATION_NAV_ITEMS.forEach(({ key, paneId, roles }) => {
    const pane = document.getElementById(paneId);
    if (!pane) {
      return;
    }

    const allowedForRole = roles.includes(registrationNavigationState.role);
    const isActive = allowedForRole && key === activeItem.key;
    pane.classList.toggle('d-none', !allowedForRole);
    pane.classList.toggle('show', isActive);
    pane.classList.toggle('active', isActive);
  });

  document.querySelectorAll('[data-registration-nav-key]').forEach((button) => {
    const isActive = button.getAttribute('data-registration-nav-key') === activeItem.key;
    button.classList.toggle('active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  registrationNavigationState.activeKey = activeItem.key;
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${activeItem.paneId}`);
  hideRegistrationSidebarOffcanvas();
  window.dispatchEvent(new CustomEvent('registration:panel-changed', {
    detail: {
      key: activeItem.key,
      paneId: activeItem.paneId
    }
  }));
  return true;
}

function applyRegistrationRoleVisibility(role) {
  REGISTRATION_NAV_ITEMS.forEach(({ paneId, roles }) => {
    const pane = document.getElementById(paneId);
    if (!pane) {
      return;
    }

    const shouldShow = roles.includes(role);
    pane.classList.toggle('d-none', !shouldShow);
    pane.classList.remove('show', 'active');
  });
}

function initRegistrationDashboard(role) {
  const badge = document.getElementById('registrationDashboardBadge');
  const title = document.getElementById('registrationDashboardTitle');
  const text = document.getElementById('registrationDashboardText');
  const organizerDashboard = document.getElementById('registrationOrganizerDashboard');
  const schoolDashboard = document.getElementById('registrationSchoolDashboard');
  const heroCard = document.querySelector('#dashboard .registration-dashboard-card');

  if (!badge || !title || !text) {
    return;
  }

  if (role === 'organizer') {
    if (heroCard) {
      heroCard.classList.add('d-none');
    }
    if (organizerDashboard) {
      organizerDashboard.classList.remove('d-none');
    }
    if (schoolDashboard) {
      schoolDashboard.classList.add('d-none');
    }
    badge.className = 'badge rounded-pill text-bg-primary mb-3';
    badge.textContent = t('registration_dashboard_badge_organizer', 'Organizer view');
    title.textContent = t('registration_dashboard_title_organizer', 'Organizer dashboard');
    text.textContent = t('registration_dashboard_text_organizer', 'Real-time overview of schools, participants, and registrations.');
    return;
  }

  if (organizerDashboard) {
    organizerDashboard.classList.add('d-none');
  }
  if (schoolDashboard) {
    schoolDashboard.classList.add('d-none');
  }
  if (heroCard) {
    heroCard.classList.remove('d-none');
  }

  if (role === 'school') {
    if (heroCard) {
      heroCard.classList.add('d-none');
    }
    if (schoolDashboard) {
      schoolDashboard.classList.remove('d-none');
    }
    badge.className = 'badge rounded-pill text-bg-success mb-3';
    badge.textContent = t('registration_dashboard_badge_school', 'School view');
    title.textContent = t('registration_dashboard_title_school', 'School dashboard');
    text.textContent = t('registration_dashboard_text_school', 'Overview of your participants and registrations.');
    return;
  }

  badge.className = 'badge rounded-pill text-bg-secondary mb-3';
  badge.textContent = t('registration_tab_dashboard', 'Dashboard');
  title.textContent = t('registration_tab_dashboard', 'Dashboard');
  text.textContent = t('registration_sidebar_section', 'Registration');
}

const REGISTRATION_DASHBOARD_STATUS_ORDER = [
  { code: 'CRE', label: 'registration_status_creation', fallback: 'In creation', color: '#0d6efd', dataLabelColor: '#ffffff' },
  { code: 'PEN', label: 'registration_status_pending', fallback: 'Pending validation', color: '#ffc107', dataLabelColor: '#212529' },
  { code: 'REJ', label: 'registration_status_rejected', fallback: 'Rejected', color: '#dc3545', dataLabelColor: '#ffffff' },
  { code: 'VAL', label: 'registration_status_validated', fallback: 'Validated', color: '#198754', dataLabelColor: '#ffffff' }
];
const REGISTRATION_DASHBOARD_COMBINED_CHART = {
  minHeight: 140,
  chromeHeight: 84,
  rowHeight: 36,
  barHeightPercent: '68%',
  labelFontSize: 11,
  labelPadding: 24,
  labelMinWidth: 180,
  totalOffsetX: 10
};

function createRegistrationDashboardStatusCounts() {
  return REGISTRATION_DASHBOARD_STATUS_ORDER.map((statusItem) => ({
    ...statusItem,
    count: 0
  }));
}

function getRegistrationDashboardItemLabel(item) {
  return (
    item?.name
    || item?.label
    || item?.category_name
    || item?.style_name
    || item?.discipline_name
    || t('registration_dashboard_unassigned', 'Unassigned')
  );
}

function buildRegistrationCategoryStyleStatusEntries(registrations, options = {}) {
  const {
    categoriesById = new Map(),
    stylesById = new Map(),
    getCategoryId = (registration) => registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '',
    getStyleId = (registration) => registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id ?? '',
    language = localStorage.getItem('lang') || document.documentElement.getAttribute('lang') || 'es'
  } = options;

  const entries = new Map();

  (Array.isArray(registrations) ? registrations : []).forEach((registration) => {
    const categoryId = getCategoryId(registration);
    const categoryMeta = categoriesById.get(`${categoryId}`) || null;
    const categoryLabel = registration?.category_name || getRegistrationDashboardItemLabel(categoryMeta);
    const styleId = getStyleId(registration);
    const styleMeta = stylesById.get(`${styleId}`) || null;
    const styleLabel = registration?.style_name || getRegistrationDashboardItemLabel(styleMeta);
    const categoryKey = categoryId ? `category:${categoryId}` : `category:${categoryLabel}`;
    const styleKey = styleId ? `style:${styleId}` : `style:${styleLabel}`;
    const entryKey = `${categoryKey}__${styleKey}`;

    const entry = entries.get(entryKey) || {
      label: `${categoryLabel} / ${styleLabel}`,
      categoryLabel,
      categoryPosition: Number.isFinite(Number(categoryMeta?.position)) ? Number(categoryMeta.position) : Number.MAX_SAFE_INTEGER,
      styleLabel,
      stylePosition: Number.isFinite(Number(styleMeta?.position)) ? Number(styleMeta.position) : Number.MAX_SAFE_INTEGER,
      total: 0,
      status: REGISTRATION_DASHBOARD_STATUS_ORDER.reduce((summary, statusItem) => {
        summary[statusItem.code] = 0;
        return summary;
      }, {})
    };

    const statusCode = `${registration?.status || ''}`;
    if (Object.prototype.hasOwnProperty.call(entry.status, statusCode)) {
      entry.status[statusCode] += 1;
    }
    entry.total += 1;
    entries.set(entryKey, entry);
  });

  return [...entries.values()].sort((left, right) => {
    if (left.categoryPosition !== right.categoryPosition) {
      return left.categoryPosition - right.categoryPosition;
    }
    const categoryCompare = left.categoryLabel.localeCompare(right.categoryLabel, language);
    if (categoryCompare !== 0) {
      return categoryCompare;
    }
    if (left.stylePosition !== right.stylePosition) {
      return left.stylePosition - right.stylePosition;
    }
    const styleCompare = left.styleLabel.localeCompare(right.styleLabel, language);
    if (styleCompare !== 0) {
      return styleCompare;
    }
    return right.total - left.total;
  });
}

function getRegistrationDashboardHorizontalChartHeight(entries) {
  const rowCount = Math.max(1, Array.isArray(entries) ? entries.length : 0);
  return Math.max(
    REGISTRATION_DASHBOARD_COMBINED_CHART.minHeight,
    REGISTRATION_DASHBOARD_COMBINED_CHART.chromeHeight + (rowCount * REGISTRATION_DASHBOARD_COMBINED_CHART.rowHeight)
  );
}

function getRegistrationDashboardMaxTotal(entries) {
  return (Array.isArray(entries) ? entries : []).reduce((maxTotal, entry) => (
    Math.max(maxTotal, Number(entry?.total) || 0)
  ), 0);
}

function buildRegistrationDashboardStatusChartSeries(entries) {
  return REGISTRATION_DASHBOARD_STATUS_ORDER.map((statusItem) => ({
    name: t(statusItem.label, statusItem.fallback),
    data: (Array.isArray(entries) ? entries : []).map((entry) => entry?.status?.[statusItem.code] || 0)
  }));
}

function getRegistrationDashboardLabelWidth(entries, ui) {
  const labels = (Array.isArray(entries) ? entries : [])
    .map((entry) => `${entry?.label || ''}`.trim())
    .filter(Boolean);

  if (!labels.length || typeof document === 'undefined') {
    return REGISTRATION_DASHBOARD_COMBINED_CHART.labelMinWidth;
  }

  const canvas = getRegistrationDashboardLabelWidth.canvas || document.createElement('canvas');
  getRegistrationDashboardLabelWidth.canvas = canvas;
  const context = canvas.getContext('2d');

  if (!context) {
    return REGISTRATION_DASHBOARD_COMBINED_CHART.labelMinWidth;
  }

  context.font = `400 ${REGISTRATION_DASHBOARD_COMBINED_CHART.labelFontSize}px ${ui.fontFamily || 'sans-serif'}`;

  const maxTextWidth = labels.reduce((maxWidth, label) => (
    Math.max(maxWidth, Math.ceil(context.measureText(label).width))
  ), 0);

  return Math.max(
    REGISTRATION_DASHBOARD_COMBINED_CHART.labelMinWidth,
    maxTextWidth + REGISTRATION_DASHBOARD_COMBINED_CHART.labelPadding
  );
}

function renderRegistrationDashboardCategoryStyleChart({
  renderChart,
  chartKey,
  element,
  entries,
  baseOptions,
  ui,
  formatInteger
}) {
  const chartHeight = getRegistrationDashboardHorizontalChartHeight(entries);
  const labelWidth = getRegistrationDashboardLabelWidth(entries, ui);
  const maxTotal = getRegistrationDashboardMaxTotal(entries);
  const xAxisMax = Math.max(1, maxTotal);

  if (element) {
    element.style.minHeight = `${chartHeight}px`;
    element.style.height = `${chartHeight}px`;
  }

  const horizontalLabelOptions = {
    minWidth: labelWidth,
    maxWidth: labelWidth,
    offsetX: 0,
    trim: false,
    style: {
      colors: ui.muted,
      fontSize: `${REGISTRATION_DASHBOARD_COMBINED_CHART.labelFontSize}px`
    }
  };
  const statusDataLabels = {
    enabled: true,
    formatter: (value) => {
      const number = Number(value);
      return number > 0 ? formatInteger(number) : '';
    },
    textAnchor: 'middle',
    offsetX: 0,
    style: {
      colors: REGISTRATION_DASHBOARD_STATUS_ORDER.map((statusItem) => statusItem.dataLabelColor),
      fontSize: '11px',
      fontWeight: 700
    },
    background: {
      enabled: false
    },
    dropShadow: {
      enabled: false
    }
  };

  renderChart(chartKey, element, {
    ...baseOptions,
    chart: {
      ...baseOptions.chart,
      type: 'bar',
      height: chartHeight,
      stacked: true,
      stackType: 'normal',
      offsetX: -8
    },
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'left',
      fontSize: '12px',
      fontWeight: 600,
      labels: {
        colors: ui.muted
      },
      markers: {
        radius: 2
      }
    },
    dataLabels: statusDataLabels,
    colors: REGISTRATION_DASHBOARD_STATUS_ORDER.map((statusItem) => statusItem.color),
    stroke: {
      width: 1,
      colors: ['#ffffff']
    },
    grid: {
      ...baseOptions.grid,
      padding: {
        left: 0,
        right: 28,
        top: 6
      }
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        barHeight: REGISTRATION_DASHBOARD_COMBINED_CHART.barHeightPercent,
        dataLabels: {
          position: 'center',
          total: {
            enabled: true,
            formatter: (value, opts) => formatInteger((Array.isArray(entries) ? entries[opts.dataPointIndex]?.total : value) || 0),
            offsetX: REGISTRATION_DASHBOARD_COMBINED_CHART.totalOffsetX,
            style: {
              color: ui.text,
              fontSize: '11px',
              fontFamily: ui.fontFamily,
              fontWeight: 700
            }
          }
        }
      }
    },
    series: buildRegistrationDashboardStatusChartSeries(entries),
    xaxis: {
      min: 0,
      max: xAxisMax,
      tickAmount: xAxisMax,
      stepSize: 1,
      decimalsInFloat: 0,
      categories: (Array.isArray(entries) ? entries : []).map((entry) => entry.label),
      labels: {
        formatter: (value) => `${Math.round(Number(value) || 0)}`,
        style: { colors: ui.muted }
      }
    },
    yaxis: {
      labels: horizontalLabelOptions
    },
    tooltip: {
      ...baseOptions.tooltip,
      shared: true,
      intersect: false,
      y: {
        formatter: (value) => formatInteger(value)
      }
    }
  });
}

function initOrganizerDashboard() {
  const dashboardPane = document.getElementById('dashboard');
  const dashboardRoot = document.getElementById('registrationOrganizerDashboard');
  const panelsContainer = dashboardRoot?.querySelector('.registration-dashboard-panels');
  if (!dashboardPane || !dashboardRoot) {
    return;
  }

  const statElements = {
    schools: document.getElementById('organizerDashboardSchoolsValue'),
    participants: document.getElementById('organizerDashboardParticipantsValue'),
    registrations: document.getElementById('organizerDashboardRegistrationsValue'),
    categoriesWithout: document.getElementById('organizerDashboardCategoriesWithoutValue'),
    categoriesWithoutAction: document.getElementById('organizerDashboardCategoriesWithoutAction'),
    stylesWithout: document.getElementById('organizerDashboardStylesWithoutValue'),
    stylesWithoutAction: document.getElementById('organizerDashboardStylesWithoutAction'),
    statusCre: document.getElementById('organizerDashboardStatusCreValue'),
    statusPen: document.getElementById('organizerDashboardStatusPenValue'),
    statusVal: document.getElementById('organizerDashboardStatusValValue'),
    statusRej: document.getElementById('organizerDashboardStatusRejValue'),
    totalAmount: document.getElementById('organizerDashboardTotalAmountValue'),
    totalAmountMeta: document.getElementById('organizerDashboardTotalAmountMeta'),
    paidAmount: document.getElementById('organizerDashboardPaidAmountValue'),
    paidAmountMeta: document.getElementById('organizerDashboardPaidAmountMeta'),
    pendingAmount: document.getElementById('organizerDashboardPendingAmountValue'),
    pendingAmountMeta: document.getElementById('organizerDashboardPendingAmountMeta'),
    pendingValidationPayments: document.getElementById('organizerDashboardPendingValidationPaymentsValue')
  };
  const missingItemsModalElements = {
    root: document.getElementById('organizerDashboardMissingItemsModal'),
    title: document.getElementById('organizerDashboardMissingItemsModalTitle'),
    list: document.getElementById('organizerDashboardMissingItemsModalList'),
    empty: document.getElementById('organizerDashboardMissingItemsModalEmpty')
  };
  const chartElements = {
    categoryStyles: document.getElementById('organizerDashboardCategoryChart'),
    registrationsByDay: document.getElementById('organizerDashboardRegistrationsByDayChart'),
    schoolsByDay: document.getElementById('organizerDashboardSchoolsByDayChart'),
    topSchools: document.getElementById('organizerDashboardTopSchoolsChart'),
    topRegistrationSchools: document.getElementById('organizerDashboardTopRegistrationSchoolsChart')
  };
  const chartInstances = {};
  let renderQueued = false;
  let needsChartRefresh = true;
  let currentMetrics = null;

  const reorderDashboardPanels = () => {
    if (!panelsContainer) {
      return;
    }

    const orderedCards = [
      panelsContainer.querySelector('#organizerDashboardStatusChart')?.closest('.card'),
      chartElements.categoryStyles?.closest('.card'),
      chartElements.topSchools?.closest('.card'),
      chartElements.topRegistrationSchools?.closest('.card'),
      chartElements.registrationsByDay?.closest('.card'),
      chartElements.schoolsByDay?.closest('.card')
    ].filter(Boolean);

    orderedCards.forEach((card) => {
      panelsContainer.appendChild(card);
    });
  };

  const getLanguage = () => localStorage.getItem('lang') || document.documentElement.getAttribute('lang') || 'es';

  const formatInteger = (value) => {
    const number = Number(value);
    return new Intl.NumberFormat(getLanguage()).format(Number.isFinite(number) ? number : 0);
  };

  const sortDashboardItems = (items) => (
    [...(Array.isArray(items) ? items : [])].sort((left, right) => {
      const leftPosition = Number.isFinite(Number(left?.position)) ? Number(left.position) : Number.MAX_SAFE_INTEGER;
      const rightPosition = Number.isFinite(Number(right?.position)) ? Number(right.position) : Number.MAX_SAFE_INTEGER;
      if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
      }
      return getRegistrationDashboardItemLabel(left).localeCompare(getRegistrationDashboardItemLabel(right), getLanguage());
    })
  );

  const getUiColors = () => {
    const styles = getComputedStyle(document.documentElement);
    return {
      text: (styles.getPropertyValue('--bs-body-color') || '#212529').trim(),
      muted: (styles.getPropertyValue('--bs-secondary-color') || '#6c757d').trim(),
      border: 'rgba(33, 37, 41, 0.08)',
      fontFamily: (styles.getPropertyValue('--bs-body-font-family') || 'inherit').trim()
    };
  };

  const parseDashboardDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const rawValue = `${value}`.trim();
    if (!rawValue) return null;
    const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
      ? `${rawValue}T00:00:00`
      : rawValue.replace(' ', 'T');
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDateKeyFromDate = (parsed) => {
    if (!parsed) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDateKey = (value) => formatDateKeyFromDate(parseDashboardDate(value));
  const getTimestampDateKey = (value) => {
    if (!value) return '';
    if (typeof value === 'string') {
      const rawValue = value.trim();
      if (!rawValue) return '';
      const match = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) {
        return match[1];
      }
    }
    return formatDateKeyFromDate(parseDashboardDate(value));
  };

  const formatShortDate = (dateKey) => {
    const parsed = parseDashboardDate(dateKey);
    if (!parsed) return dateKey;
    return new Intl.DateTimeFormat(getLanguage(), {
      day: '2-digit',
      month: '2-digit'
    }).format(parsed);
  };

  const getCreatedAt = (item) => item?.created_at || item?.createdAt || item?.date_created || item?.created || '';
  const getSchoolName = (school) => school?.name || school?.school_name || '';
  const getSchoolId = (item) => item?.school_id ?? item?.school?.id ?? '';
  const getCategoryId = (registration) => registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '';
  const getStyleId = (registration) => registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id ?? '';

  const incrementEntryMap = (map, key, label, amount = 1) => {
    if (!key) return;
    const entry = map.get(key) || { label: label || t('registration_dashboard_unassigned', 'Unassigned'), value: 0 };
    entry.value += amount;
    if (!entry.label) {
      entry.label = label || t('registration_dashboard_unassigned', 'Unassigned');
    }
    map.set(key, entry);
  };

  const getTopEntries = (map, limit = 5) => (
    [...map.values()]
      .sort((left, right) => {
        if (right.value !== left.value) {
          return right.value - left.value;
        }
        return left.label.localeCompare(right.label, getLanguage());
      })
      .slice(0, limit)
  );

  const buildDailySeries = (items, options = {}) => {
    const counts = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const dateKey = getTimestampDateKey(getCreatedAt(item));
      if (!dateKey) return;
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    });

    const startKey = getDateKey(options.start);
    const endKey = getDateKey(options.end);
    let orderedKeys = [];

    if (startKey && endKey) {
      const startDate = parseDashboardDate(startKey);
      const endDate = parseDashboardDate(endKey);
      if (startDate && endDate && startDate <= endDate) {
        const cursor = new Date(startDate.getTime());
        while (cursor <= endDate) {
          orderedKeys.push(getDateKey(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    if (!orderedKeys.length) {
      orderedKeys = [...counts.keys()].sort();
    }

    return {
      categories: orderedKeys.map(formatShortDate),
      values: orderedKeys.map((dateKey) => counts.get(dateKey) || 0)
    };
  };

  const getWeeklyTickAmount = (series) => {
    const totalPoints = Array.isArray(series?.values) ? series.values.length : 0;
    if (totalPoints <= 1) return totalPoints || 1;
    return Math.max(2, Math.ceil(totalPoints / 7));
  };

  const isDashboardVisible = () => dashboardPane.classList.contains('active') && !dashboardPane.classList.contains('d-none');

  const destroyChart = (key) => {
    if (!chartInstances[key]) {
      return;
    }
    chartInstances[key].destroy();
    delete chartInstances[key];
  };

  const createBaseChartOptions = (ui) => ({
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { speed: 260 },
      fontFamily: ui.fontFamily
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: {
      borderColor: ui.border,
      strokeDashArray: 4
    },
    noData: {
      text: t('registration_dashboard_no_data', 'No data available')
    },
    tooltip: {
      theme: 'light'
    }
  });

  const buildTodayAnnotation = (series) => {
    const categories = Array.isArray(series?.categories) ? series.categories : [];
    const todayLabel = formatShortDate(getDateKey(new Date()));
    if (!todayLabel || !categories.includes(todayLabel)) {
      return null;
    }

    return {
      xaxis: [{
        x: todayLabel,
        borderColor: '#198754',
        borderWidth: 2,
        strokeDashArray: 5,
        label: {
          text: todayLabel,
          borderColor: '#198754',
          orientation: 'horizontal',
          offsetY: -6,
          style: {
            background: '#198754',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 700
          }
        }
      }]
    };
  };

  const renderChart = (key, element, options) => {
    if (!element || typeof ApexCharts === 'undefined') {
      return;
    }
    destroyChart(key);
    element.innerHTML = '';
    chartInstances[key] = new ApexCharts(element, options);
    chartInstances[key].render();
  };

  const renderStats = (metrics) => {
    if (statElements.schools) statElements.schools.textContent = formatInteger(metrics.totalSchools);
    if (statElements.participants) statElements.participants.textContent = formatInteger(metrics.totalParticipants);
    if (statElements.registrations) statElements.registrations.textContent = formatInteger(metrics.totalRegistrations);
    if (statElements.categoriesWithout) statElements.categoriesWithout.textContent = formatInteger(metrics.categoriesWithoutRegistrations);
    if (statElements.stylesWithout) statElements.stylesWithout.textContent = formatInteger(metrics.stylesWithoutRegistrations);
    if (statElements.statusCre) statElements.statusCre.textContent = formatInteger(metrics.status.CRE);
    if (statElements.statusPen) statElements.statusPen.textContent = formatInteger(metrics.status.PEN);
    if (statElements.statusVal) statElements.statusVal.textContent = formatInteger(metrics.status.VAL);
    if (statElements.statusRej) statElements.statusRej.textContent = formatInteger(metrics.status.REJ);
    if (statElements.totalAmount) statElements.totalAmount.textContent = formatRegistrationCurrency(metrics.finance.totalAmount);
    if (statElements.totalAmountMeta) {
      statElements.totalAmountMeta.textContent = `${formatInteger(metrics.finance.totalRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
    if (statElements.paidAmount) statElements.paidAmount.textContent = formatRegistrationCurrency(metrics.finance.paidAmount);
    if (statElements.paidAmountMeta) {
      statElements.paidAmountMeta.textContent = `${formatInteger(metrics.finance.paidRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
    if (statElements.pendingAmount) statElements.pendingAmount.textContent = formatRegistrationCurrency(metrics.finance.pendingAmount);
    if (statElements.pendingAmountMeta) {
      statElements.pendingAmountMeta.textContent = `${formatInteger(metrics.finance.pendingRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
    if (statElements.pendingValidationPayments) {
      statElements.pendingValidationPayments.textContent = formatInteger(metrics.finance.pendingValidationPaymentsCount);
    }

    const showListLabel = t('registration_dashboard_show_list', 'Show list');
    if (statElements.categoriesWithoutAction) {
      const hasMissingCategories = metrics.categoriesWithoutRegistrations > 0;
      statElements.categoriesWithoutAction.disabled = !hasMissingCategories;
      statElements.categoriesWithoutAction.title = `${showListLabel}: ${t('registration_dashboard_kpi_categories_without_registrations', 'Categories without registrations')}`;
      statElements.categoriesWithoutAction.setAttribute('aria-label', statElements.categoriesWithoutAction.title);
    }
    if (statElements.stylesWithoutAction) {
      const hasMissingStyles = metrics.stylesWithoutRegistrations > 0;
      statElements.stylesWithoutAction.disabled = !hasMissingStyles;
      statElements.stylesWithoutAction.title = `${showListLabel}: ${t('registration_dashboard_kpi_styles_without_registrations', 'Styles without registrations')}`;
      statElements.stylesWithoutAction.setAttribute('aria-label', statElements.stylesWithoutAction.title);
    }
  };

  const openMissingItemsModal = (type) => {
    if (!missingItemsModalElements.root || !missingItemsModalElements.title || !missingItemsModalElements.list) {
      return;
    }

    const metrics = currentMetrics || buildMetrics();
    const isCategories = type === 'categories';
    const title = isCategories
      ? t('registration_dashboard_kpi_categories_without_registrations', 'Categories without registrations')
      : t('registration_dashboard_kpi_styles_without_registrations', 'Styles without registrations');
    const items = isCategories
      ? metrics.categoriesWithoutRegistrationItems
      : metrics.stylesWithoutRegistrationItems;

    missingItemsModalElements.title.textContent = title;
    missingItemsModalElements.list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (missingItemsModalElements.empty) {
        missingItemsModalElements.empty.classList.remove('d-none');
      }
    } else {
      if (missingItemsModalElements.empty) {
        missingItemsModalElements.empty.classList.add('d-none');
      }

      items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'list-group-item px-0';
        li.textContent = getRegistrationDashboardItemLabel(item);
        missingItemsModalElements.list.appendChild(li);
      });
    }

    bootstrap.Modal.getOrCreateInstance(missingItemsModalElements.root).show();
  };

  const buildMetrics = () => {
    const eventObj = getEvent();
    const schools = Array.isArray(registrationState.schools) ? registrationState.schools : [];
    const participants = Array.isArray(registrationState.participants) ? registrationState.participants : [];
    const registrations = Array.isArray(registrationState.organizerRegistrations) ? registrationState.organizerRegistrations : [];
    const categories = Array.isArray(registrationState.registrationCategories) ? registrationState.registrationCategories : [];
    const styles = Array.isArray(registrationState.registrationDisciplines) ? registrationState.registrationDisciplines : [];
    const schoolsById = new Map(schools.map((school) => [`${school.id}`, school]));
    const categoriesById = new Map(categories.map((category) => [`${category.id}`, category]));
    const stylesById = new Map(styles.map((style) => [`${style.id}`, style]));
    const schoolCounts = new Map();
    const schoolRegistrationCounts = new Map();
    const categoryIdsWithRegistrations = new Set();
    const styleIdsWithRegistrations = new Set();

    const statusCounts = createRegistrationDashboardStatusCounts();

    registrations.forEach((registration) => {
      const matchingStatus = statusCounts.find((item) => item.code === `${registration?.status || ''}`);
      if (matchingStatus) {
        matchingStatus.count += 1;
      }

      const categoryId = getCategoryId(registration);
      if (categoryId) {
        categoryIdsWithRegistrations.add(`${categoryId}`);
      }

      const styleId = getStyleId(registration);
      if (styleId) {
        styleIdsWithRegistrations.add(`${styleId}`);
      }

      const schoolId = getSchoolId(registration);
      const schoolLabel = registration?.school_name
        || getSchoolName(schoolsById.get(`${schoolId}`))
        || t('registration_dashboard_unassigned', 'Unassigned');
      const schoolKey = schoolId ? `school:${schoolId}` : `school:${schoolLabel}`;
      incrementEntryMap(schoolRegistrationCounts, schoolKey, schoolLabel, 1);
    });

    if (participants.length) {
      participants.forEach((participant) => {
        const schoolId = getSchoolId(participant);
        const schoolLabel = participant?.school_name
          || getSchoolName(schoolsById.get(`${schoolId}`))
          || t('registration_dashboard_unassigned', 'Unassigned');
        const schoolKey = schoolId ? `school:${schoolId}` : `school:${schoolLabel}`;
        incrementEntryMap(schoolCounts, schoolKey, schoolLabel, 1);
      });
    } else {
      schools.forEach((school) => {
        incrementEntryMap(
          schoolCounts,
          `school:${school.id}`,
          getSchoolName(school) || t('registration_dashboard_unassigned', 'Unassigned'),
          Number(school?.num_participants) || 0
        );
      });
    }

    return {
      totalSchools: schools.length,
      totalParticipants: participants.length,
      totalRegistrations: registrations.length,
      finance: buildRegistrationFinanceMetrics(registrations, { categoryById: categoriesById }),
      categoriesWithoutRegistrations: categories.filter((category) => !categoryIdsWithRegistrations.has(`${category.id}`)).length,
      stylesWithoutRegistrations: styles.filter((style) => !styleIdsWithRegistrations.has(`${style.id}`)).length,
      categoriesWithoutRegistrationItems: sortDashboardItems(
        categories.filter((category) => !categoryIdsWithRegistrations.has(`${category.id}`))
      ),
      stylesWithoutRegistrationItems: sortDashboardItems(
        styles.filter((style) => !styleIdsWithRegistrations.has(`${style.id}`))
      ),
      status: statusCounts.reduce((summary, item) => {
        summary[item.code] = item.count;
        return summary;
      }, {}),
      categoryStyles: buildRegistrationCategoryStyleStatusEntries(registrations, {
        categoriesById,
        stylesById,
        getCategoryId,
        getStyleId,
        language: getLanguage()
      }),
      registrationsByDay: buildDailySeries(registrations, {
        start: eventObj?.registrationStart,
        end: eventObj?.registrationEnd
      }),
      schoolsByDay: buildDailySeries(schools, {
        start: eventObj?.registrationStart,
        end: eventObj?.registrationEnd
      }),
      topSchools: getTopEntries(schoolCounts),
      topRegistrationSchools: getTopEntries(schoolRegistrationCounts)
    };
  };

  const renderCharts = (metrics) => {
    const ui = getUiColors();
    const baseOptions = createBaseChartOptions(ui);
    const registrationsByDayAnnotation = buildTodayAnnotation(metrics.registrationsByDay);
    const schoolsByDayAnnotation = buildTodayAnnotation(metrics.schoolsByDay);
    const horizontalBarDataLabels = {
      enabled: true,
      formatter: (value) => formatInteger(value),
      textAnchor: 'middle',
      offsetX: 0,
      style: {
        colors: ['#ffffff'],
        fontSize: '11px',
        fontWeight: 700
      },
      background: {
        enabled: false
      },
      dropShadow: {
        enabled: false
      }
    };

    renderRegistrationDashboardCategoryStyleChart({
      renderChart,
      chartKey: 'categoryStyles',
      element: chartElements.categoryStyles,
      entries: metrics.categoryStyles,
      baseOptions,
      ui,
      formatInteger
    });

    renderChart('registrationsByDay', chartElements.registrationsByDay, {
      ...baseOptions,
      chart: {
        ...baseOptions.chart,
        type: 'line',
        height: 320
      },
      ...(registrationsByDayAnnotation ? { annotations: registrationsByDayAnnotation } : {}),
      colors: ['#0d6efd'],
      stroke: {
        curve: 'smooth',
        width: 3
      },
      markers: {
        size: 4,
        strokeWidth: 0
      },
      series: [{
        name: t('registration_dashboard_series_registrations', 'Registrations'),
        data: metrics.registrationsByDay.values
      }],
      xaxis: {
        type: 'category',
        categories: metrics.registrationsByDay.categories,
        tickPlacement: 'on',
        tickAmount: getWeeklyTickAmount(metrics.registrationsByDay),
        labels: {
          style: { colors: ui.muted },
          hideOverlappingLabels: true,
          rotate: 0
        }
      },
      yaxis: {
        labels: {
          style: { colors: ui.muted }
        }
      }
    });

    renderChart('schoolsByDay', chartElements.schoolsByDay, {
      ...baseOptions,
      chart: {
        ...baseOptions.chart,
        type: 'line',
        height: 320
      },
      ...(schoolsByDayAnnotation ? { annotations: schoolsByDayAnnotation } : {}),
      colors: ['#fd7e14'],
      stroke: {
        curve: 'smooth',
        width: 3
      },
      markers: {
        size: 4,
        strokeWidth: 0
      },
      series: [{
        name: t('registration_dashboard_series_schools', 'Schools'),
        data: metrics.schoolsByDay.values
      }],
      xaxis: {
        type: 'category',
        categories: metrics.schoolsByDay.categories,
        tickPlacement: 'on',
        tickAmount: getWeeklyTickAmount(metrics.schoolsByDay),
        labels: {
          style: { colors: ui.muted },
          hideOverlappingLabels: true,
          rotate: 0
        }
      },
      yaxis: {
        labels: {
          style: { colors: ui.muted }
        }
      }
    });

    renderChart('topSchools', chartElements.topSchools, {
      ...baseOptions,
      chart: {
        ...baseOptions.chart,
        type: 'bar',
        height: 280
      },
      dataLabels: horizontalBarDataLabels,
      grid: {
        ...baseOptions.grid,
        padding: {
          right: 20
        }
      },
      colors: ['#212529'],
      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 4,
          barHeight: '58%',
          dataLabels: {
            position: 'center'
          }
        }
      },
      series: [{
        name: t('registration_dashboard_kpi_participants', 'Participants'),
        data: metrics.topSchools.map((item) => item.value)
      }],
      xaxis: {
        categories: metrics.topSchools.map((item) => item.label),
        labels: {
          style: { colors: ui.muted }
        }
      },
      yaxis: {
        labels: {
          style: { colors: ui.muted }
        }
      }
    });

    renderChart('topRegistrationSchools', chartElements.topRegistrationSchools, {
      ...baseOptions,
      chart: {
        ...baseOptions.chart,
        type: 'bar',
        height: 280
      },
      dataLabels: horizontalBarDataLabels,
      grid: {
        ...baseOptions.grid,
        padding: {
          right: 20
        }
      },
      colors: ['#6f42c1'],
      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 4,
          barHeight: '58%',
          dataLabels: {
            position: 'center'
          }
        }
      },
      series: [{
        name: t('registration_dashboard_series_registrations', 'Registrations'),
        data: metrics.topRegistrationSchools.map((item) => item.value)
      }],
      xaxis: {
        categories: metrics.topRegistrationSchools.map((item) => item.label),
        labels: {
          style: { colors: ui.muted }
        }
      },
      yaxis: {
        labels: {
          style: { colors: ui.muted }
        }
      }
    });
  };

  const renderDashboard = () => {
    renderQueued = false;
    reorderDashboardPanels();
    const metrics = buildMetrics();
    currentMetrics = metrics;
    renderStats(metrics);
    if (!isDashboardVisible()) {
      needsChartRefresh = true;
      return;
    }
    renderCharts(metrics);
    needsChartRefresh = false;
  };

  const scheduleRender = () => {
    if (renderQueued) {
      return;
    }
    renderQueued = true;
    window.requestAnimationFrame(renderDashboard);
  };

  window.addEventListener('registration:schools-updated', scheduleRender);
  window.addEventListener('registration:participants-updated', scheduleRender);
  window.addEventListener('registration:organizer-registrations-updated', scheduleRender);
  window.addEventListener('registration:config-updated', scheduleRender);
  statElements.categoriesWithoutAction?.addEventListener('click', () => openMissingItemsModal('categories'));
  statElements.stylesWithoutAction?.addEventListener('click', () => openMissingItemsModal('styles'));
  window.addEventListener('registration:panel-changed', (event) => {
    if (event?.detail?.key !== 'dashboard') {
      return;
    }
    window.setTimeout(scheduleRender, 0);
  });

  scheduleRender();
}

function initSchoolDashboard() {
  const dashboardPane = document.getElementById('dashboard');
  const dashboardRoot = document.getElementById('registrationSchoolDashboard');
  if (!dashboardPane || !dashboardRoot) {
    return;
  }

  const statElements = {
    participants: document.getElementById('schoolDashboardParticipantsValue'),
    registrations: document.getElementById('schoolDashboardRegistrationsValue'),
    registrationsWithoutMusic: document.getElementById('schoolDashboardRegistrationsWithoutMusicValue'),
    statusCre: document.getElementById('schoolDashboardStatusCreValue'),
    statusPen: document.getElementById('schoolDashboardStatusPenValue'),
    statusVal: document.getElementById('schoolDashboardStatusValValue'),
    statusRej: document.getElementById('schoolDashboardStatusRejValue'),
    totalAmount: document.getElementById('schoolDashboardTotalAmountValue'),
    totalAmountMeta: document.getElementById('schoolDashboardTotalAmountMeta'),
    paidAmount: document.getElementById('schoolDashboardPaidAmountValue'),
    paidAmountMeta: document.getElementById('schoolDashboardPaidAmountMeta'),
    pendingAmount: document.getElementById('schoolDashboardPendingAmountValue'),
    pendingAmountMeta: document.getElementById('schoolDashboardPendingAmountMeta'),
    pendingValidationPayments: document.getElementById('schoolDashboardPendingValidationPaymentsValue')
  };
  const chartElements = {
    categoryStyles: document.getElementById('schoolDashboardCategoryChart')
  };
  const chartInstances = {};
  let renderQueued = false;
  let needsChartRefresh = true;

  const getLanguage = () => localStorage.getItem('lang') || document.documentElement.getAttribute('lang') || 'es';

  const formatInteger = (value) => {
    const number = Number(value);
    return new Intl.NumberFormat(getLanguage()).format(Number.isFinite(number) ? number : 0);
  };

  const getUiColors = () => {
    const styles = getComputedStyle(document.documentElement);
    return {
      text: (styles.getPropertyValue('--bs-body-color') || '#212529').trim(),
      muted: (styles.getPropertyValue('--bs-secondary-color') || '#6c757d').trim(),
      border: 'rgba(33, 37, 41, 0.08)',
      fontFamily: (styles.getPropertyValue('--bs-body-font-family') || 'inherit').trim()
    };
  };

  const getCategoryId = (registration) => registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '';
  const getStyleId = (registration) => registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id ?? '';
  const hasMusic = (registration) => Number(registration?.has_music) === 1 || registration?.has_music === true || Boolean(registration?.audio);

  const isDashboardVisible = () => dashboardPane.classList.contains('active') && !dashboardPane.classList.contains('d-none');

  const destroyChart = (key) => {
    if (!chartInstances[key]) {
      return;
    }
    chartInstances[key].destroy();
    delete chartInstances[key];
  };

  const createBaseChartOptions = (ui) => ({
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { speed: 260 },
      fontFamily: ui.fontFamily
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: {
      borderColor: ui.border,
      strokeDashArray: 4
    },
    noData: {
      text: t('registration_dashboard_no_data', 'No data available')
    },
    tooltip: {
      theme: 'light'
    }
  });

  const renderChart = (key, element, options) => {
    if (!element || typeof ApexCharts === 'undefined') {
      return;
    }
    destroyChart(key);
    element.innerHTML = '';
    chartInstances[key] = new ApexCharts(element, options);
    chartInstances[key].render();
  };

  const buildMetrics = () => {
    const participants = Array.isArray(registrationState.participants) ? registrationState.participants : [];
    const registrations = Array.isArray(registrationState.registrations) ? registrationState.registrations : [];
    const categories = Array.isArray(registrationState.registrationCategories) ? registrationState.registrationCategories : [];
    const styles = Array.isArray(registrationState.registrationDisciplines) ? registrationState.registrationDisciplines : [];
    const categoriesById = new Map(categories.map((category) => [`${category.id}`, category]));
    const stylesById = new Map(styles.map((style) => [`${style.id}`, style]));
    const statusCounts = createRegistrationDashboardStatusCounts();

    registrations.forEach((registration) => {
      const matchingStatus = statusCounts.find((item) => item.code === `${registration?.status || ''}`);
      if (matchingStatus) {
        matchingStatus.count += 1;
      }
    });

    return {
      totalParticipants: participants.length,
      totalRegistrations: registrations.length,
      finance: buildRegistrationFinanceMetrics(registrations, { categoryById: categoriesById }),
      registrationsWithoutMusic: registrations.filter((registration) => !hasMusic(registration)).length,
      status: statusCounts.reduce((summary, item) => {
        summary[item.code] = item.count;
        return summary;
      }, {}),
      categoryStyles: buildRegistrationCategoryStyleStatusEntries(registrations, {
        categoriesById,
        stylesById,
        getCategoryId,
        getStyleId,
        language: getLanguage()
      })
    };
  };

  const renderStats = (metrics) => {
    if (statElements.participants) statElements.participants.textContent = formatInteger(metrics.totalParticipants);
    if (statElements.registrations) statElements.registrations.textContent = formatInteger(metrics.totalRegistrations);
    if (statElements.registrationsWithoutMusic) statElements.registrationsWithoutMusic.textContent = formatInteger(metrics.registrationsWithoutMusic);
    if (statElements.statusCre) statElements.statusCre.textContent = formatInteger(metrics.status.CRE);
    if (statElements.statusPen) statElements.statusPen.textContent = formatInteger(metrics.status.PEN);
    if (statElements.statusVal) statElements.statusVal.textContent = formatInteger(metrics.status.VAL);
    if (statElements.statusRej) statElements.statusRej.textContent = formatInteger(metrics.status.REJ);
    if (statElements.totalAmount) statElements.totalAmount.textContent = formatRegistrationCurrency(metrics.finance.totalAmount);
    if (statElements.totalAmountMeta) {
      statElements.totalAmountMeta.textContent = `${formatInteger(metrics.finance.totalRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
    if (statElements.paidAmount) statElements.paidAmount.textContent = formatRegistrationCurrency(metrics.finance.paidAmount);
    if (statElements.paidAmountMeta) {
      statElements.paidAmountMeta.textContent = `${formatInteger(metrics.finance.paidRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
    if (statElements.pendingAmount) statElements.pendingAmount.textContent = formatRegistrationCurrency(metrics.finance.pendingAmount);
    if (statElements.pendingAmountMeta) {
      statElements.pendingAmountMeta.textContent = `${formatInteger(metrics.finance.pendingRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
    if (statElements.pendingValidationPayments) {
      statElements.pendingValidationPayments.textContent = formatInteger(metrics.finance.pendingValidationPaymentsCount);
    }
  };

  const renderCharts = (metrics) => {
    const ui = getUiColors();
    const baseOptions = createBaseChartOptions(ui);
    renderRegistrationDashboardCategoryStyleChart({
      renderChart,
      chartKey: 'categoryStyles',
      element: chartElements.categoryStyles,
      entries: metrics.categoryStyles,
      baseOptions,
      ui,
      formatInteger
    });
  };

  const renderDashboard = () => {
    renderQueued = false;
    const metrics = buildMetrics();
    renderStats(metrics);
    if (!isDashboardVisible()) {
      needsChartRefresh = true;
      return;
    }
    renderCharts(metrics);
    needsChartRefresh = false;
  };

  const scheduleRender = () => {
    if (renderQueued) {
      return;
    }
    renderQueued = true;
    window.requestAnimationFrame(renderDashboard);
  };

  window.addEventListener('registration:participants-updated', scheduleRender);
  window.addEventListener('registration:school-registrations-updated', scheduleRender);
  window.addEventListener('registration:config-updated', scheduleRender);
  window.addEventListener('registration:panel-changed', (event) => {
    if (event?.detail?.key !== 'dashboard') {
      return;
    }
    if (!needsChartRefresh) {
      return;
    }
    window.setTimeout(scheduleRender, 0);
  });

  scheduleRender();
}

document.addEventListener('click', (event) => {
  const navButton = event.target.closest('[data-registration-nav-key]');
  if (!navButton) {
    return;
  }

  event.preventDefault();
  const panelKey = navButton.getAttribute('data-registration-nav-key');
  if (panelKey) {
    showRegistrationPanel(panelKey);
  }
});

async function fetchSchoolRecord(userId) {
  if (registrationState.school) {
    return registrationState.school;
  }

  if (!schoolLoadPromise) {
    schoolLoadPromise = (async () => {
      const res = await fetch(`${API_BASE_URL}/api/schools/${userId}`);
      if (!res.ok) {
        throw new Error(t('registration_school_load_error', 'Error loading school data.'));
      }

      const data = await res.json();
      if (!data) {
        throw new Error(t('registration_school_load_error', 'Error loading school data.'));
      }

      registrationState.school = data;
      return data;
    })();
  }

  try {
    return await schoolLoadPromise;
  } catch (err) {
    schoolLoadPromise = null;
    throw err;
  }
}

function initSchoolTab() {
  const form = document.getElementById('schoolForm');
  if (!form) {
    return;
  }

  const user = getUserFromToken();
  if (!user || !user.id) {
    showMessageModal(t('registration_school_no_user', 'No user found.'), t('error_title', 'Error'));
    return;
  }

  const elements = {
    name: document.getElementById('schoolName'),
    username: document.getElementById('schoolUsername'),
    email: document.getElementById('schoolEmail'),
    language: document.getElementById('schoolLanguage'),
    city: document.getElementById('schoolCity'),
    country: document.getElementById('schoolCountry'),
    phone: document.getElementById('schoolPhone'),
    representative: document.getElementById('schoolRepresentative'),
    password: document.getElementById('schoolPassword'),
    togglePassword: document.getElementById('toggleSchoolPassword'),
    saveBtn: document.getElementById('schoolSaveBtn'),
    alert: document.getElementById('schoolSaveAlert')
  };

  if (elements.username) elements.username.setAttribute('readonly', 'readonly');
  if (elements.password) elements.password.setAttribute('readonly', 'readonly');

  if (elements.togglePassword && elements.password) {
    elements.togglePassword.addEventListener('click', () => {
      const isHidden = elements.password.type === 'password';
      elements.password.type = isHidden ? 'text' : 'password';
      const icon = elements.togglePassword.querySelector('i');
      if (icon) {
        icon.classList.toggle('bi-eye', !isHidden);
        icon.classList.toggle('bi-eye-slash', isHidden);
      }
    });
  }

  if (elements.alert) {
    const hideAlert = () => elements.alert.classList.add('d-none');
    form.addEventListener('input', hideAlert);
    form.addEventListener('change', hideAlert);
  }

  let countrySelect = null;
  if (elements.country && Array.isArray(countries)) {
    countries.forEach(c => {
      const option = document.createElement('option');
      option.value = c.code;
      option.textContent = `${c.code} - ${c.name}`;
      elements.country.appendChild(option);
    });

    if (window.TomSelect) {
      countrySelect = new TomSelect('#schoolCountry', {
        maxOptions: 200,
        placeholder: 'Type to search...',
        allowEmptyOption: true
      });
    }
  }

  let schoolRecord = null;

  const loadSchool = async () => {
    try {
      schoolRecord = await fetchSchoolRecord(user.id);

      if (elements.username) elements.username.value = schoolRecord.username || '';

      if (elements.name) elements.name.value = schoolRecord.name || '';
      if (elements.email) elements.email.value = schoolRecord.email || '';
      if (elements.language) elements.language.value = schoolRecord.language || 'es';
      if (elements.city) elements.city.value = schoolRecord.city || '';
      if (elements.phone) elements.phone.value = schoolRecord.phone || '';
      if (elements.representative) elements.representative.value = schoolRecord.representative || '';
      if (elements.password) elements.password.value = schoolRecord.password || '';

      if (elements.country) {
        if (countrySelect) {
          countrySelect.setValue(schoolRecord.country || '', true);
        } else {
          elements.country.value = schoolRecord.country || '';
        }
      }
    } catch (err) {
      showMessageModal(err.message || t('registration_school_load_error', 'Error loading school data.'), t('error_title', 'Error'));
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    if (!schoolRecord) {
      showMessageModal(t('registration_school_load_error', 'Error loading school data.'), t('error_title', 'Error'));
      return;
    }

    const payload = {
      id: schoolRecord.id,
      event_id: schoolRecord.event_id,
      name: elements.name.value.trim(),
      username: schoolRecord.username,
      language: elements.language.value,
      email: schoolRecord.email,
      city: elements.city.value.trim(),
      country: elements.country.value,
      phone: elements.phone.value.trim(),
      representative: elements.representative.value.trim(),
      password: elements.password.value.trim()
    };

    elements.saveBtn.disabled = true;
    const originalText = elements.saveBtn.textContent;
    elements.saveBtn.textContent = t('saving', 'Guardando...');

    try {
      const res = await fetch(`${API_BASE_URL}/api/schools/${schoolRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(t('registration_school_save_error', 'Error saving school data.'));
      }

      schoolRecord = { ...schoolRecord, ...payload };
      registrationState.school = schoolRecord;
      if (elements.alert) {
        elements.alert.classList.remove('d-none');
      }
    } catch (err) {
      showMessageModal(err.message || t('registration_school_save_error', 'Error saving school data.'), t('error_title', 'Error'));
    } finally {
      elements.saveBtn.disabled = false;
      elements.saveBtn.textContent = originalText;
    }
  });

  loadSchool();
}

function initParticipantsTab(role) {
  const tableBody = document.getElementById('participantsTable');
  const countEl = document.getElementById('participantsCount');
  const emptyEl = document.getElementById('participantsEmpty');
  const addBtn = document.getElementById('addParticipantBtn');
  const importOpenBtn = document.getElementById('importParticipantsOpenBtn');
  const copyTsvBtn = document.getElementById('participantsCopyTsvBtn');
  const actionsHeader = document.querySelector('th[data-i18n="registration_participants_actions"]');
  const filtersForm = document.getElementById('participantsFilters');
  const filterSchool = document.getElementById('participantsFilterSchool');
  const filterName = document.getElementById('participantsFilterName');
  const filterClear = document.getElementById('participantsFilterClear');
  const modalEl = document.getElementById('participantModal');
  const importModalEl = document.getElementById('importParticipantsModal');
  const deleteModalEl = document.getElementById('deleteParticipantModal');
  const duplicateModalEl = document.getElementById('duplicateParticipantModal');

  if (!tableBody || !modalEl || !deleteModalEl) {
    return;
  }

  const user = getUserFromToken();
  if (!user || (role === 'school' && !user.id)) {
    showMessageModal(t('registration_school_no_user', 'No user found.'), t('error_title', 'Error'));
    return;
  }

  const allowEdit = role === 'school';
  const showSchoolColumn = role === 'organizer';
  const shouldShowGender = Boolean(getEvent()?.showGender);
  const ageHeaderInfoBtn = document.getElementById('participantsAgeInfoBtn');
  const registrationsHeader = document.querySelector('th[data-i18n="registration_participants_registrations"]');
  const participantTable = tableBody.closest('table');
  const participantGenderHeader = participantTable?.querySelector('th[data-i18n="registration_participants_gender"]');
  if (!allowEdit) {
    if (addBtn) addBtn.classList.add('d-none');
    if (importOpenBtn) importOpenBtn.classList.add('d-none');
    if (actionsHeader) actionsHeader.classList.add('d-none');
  }
  if (allowEdit && !showSchoolColumn && actionsHeader && registrationsHeader) {
    const headRow = actionsHeader.parentElement;
    if (headRow) {
      headRow.appendChild(actionsHeader);
    }
  }
  if (!showSchoolColumn) {
    if (filterSchool) {
      const schoolGroup = filterSchool.closest('.col-12');
      if (schoolGroup) schoolGroup.classList.add('d-none');
    }
  }
  if (showSchoolColumn) {
    const headRow = tableBody.closest('table')?.querySelector('thead tr');
    if (headRow) {
      const schoolHeader = document.createElement('th');
      schoolHeader.setAttribute('data-i18n', 'registration_participants_school');
      schoolHeader.textContent = t('registration_participants_school', 'Escuela');
      headRow.insertBefore(schoolHeader, actionsHeader || null);
    }
  }

  const form = document.getElementById('participantForm');
  const elements = {
    id: document.getElementById('participantId'),
    name: document.getElementById('participantName'),
    dob: document.getElementById('participantDob'),
    gender: document.getElementById('participantGender'),
    genderField: document.getElementById('participantGender')?.closest('.col-12'),
    country: document.getElementById('participantCountry'),
    saveBtn: document.getElementById('participantSaveBtn'),
    saveAddBtn: document.getElementById('participantSaveAddBtn'),
    modalTitle: document.getElementById('participantModalTitle'),
    deleteMessage: document.getElementById('deleteParticipantMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteParticipantBtn')
  };

  const countryMap = Array.isArray(countries)
    ? new Map(countries.map(c => [c.code, c.name]))
    : new Map();

  let participantCountrySelect = null;
  if (elements.country && Array.isArray(countries)) {
    countries.forEach(c => {
      const option = document.createElement('option');
      option.value = c.code;
      option.textContent = `${c.code} - ${c.name}`;
      elements.country.appendChild(option);
    });

    if (window.TomSelect) {
      participantCountrySelect = new TomSelect('#participantCountry', {
        maxOptions: 200,
        placeholder: 'Type to search...',
        allowEmptyOption: true
      });
    }
  }

  const participantModal = new bootstrap.Modal(modalEl);
  const importParticipantsModal = importModalEl ? new bootstrap.Modal(importModalEl) : null;
  const deleteModal = new bootstrap.Modal(deleteModalEl);
  const duplicateModal = duplicateModalEl ? new bootstrap.Modal(duplicateModalEl) : null;
  let participantToDelete = null;
  const duplicateMessageEl = document.getElementById('duplicateParticipantMessage');
  const confirmDuplicateBtn = document.getElementById('confirmDuplicateParticipantBtn');
  const importElements = {
    textarea: document.getElementById('importParticipantsTextarea'),
    previewWrap: document.getElementById('importParticipantsPreviewWrap'),
    detectedColumns: document.getElementById('importParticipantsDetectedColumns'),
    total: document.getElementById('importParticipantsPreviewTotal'),
    valid: document.getElementById('importParticipantsPreviewValid'),
    invalid: document.getElementById('importParticipantsPreviewInvalid'),
    tableBody: document.getElementById('importParticipantsPreviewTableBody'),
    empty: document.getElementById('importParticipantsPreviewEmpty'),
    previewBtn: document.getElementById('previewImportParticipantsBtn'),
    confirmBtn: document.getElementById('confirmImportParticipantsBtn')
  };
  const importPreviewState = {
    rawText: '',
    preview: null
  };

  const updateParticipantsAgeHeaderTooltip = () => {
    syncRegistrationAgeTooltipButton(ageHeaderInfoBtn);
  };

  const syncParticipantsGenderUi = () => {
    if (participantGenderHeader) {
      participantGenderHeader.classList.toggle('d-none', !shouldShowGender);
    }
    if (elements.genderField) {
      elements.genderField.classList.toggle('d-none', role === 'school');
    }
    if (elements.gender) {
      elements.gender.required = false;
      if (role === 'school') {
        elements.gender.value = '';
      }
    }
  };

  const safeJsonResponse = async (res) => {
    try {
      return await res.json();
    } catch (error) {
      return null;
    }
  };

  const normalizeImportPreviewErrors = (value) => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => normalizeImportPreviewErrors(item));
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const text = `${value}`.trim();
      return text ? [text] : [];
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    const directText = value.message ?? value.error ?? value.detail ?? value.msg;
    if (directText !== undefined && directText !== null) {
      const text = `${directText}`.trim();
      return text ? [text] : [];
    }

    return Object.values(value).flatMap((item) => normalizeImportPreviewErrors(item));
  };

  const getNormalizedImportPreview = (preview) => {
    const rows = Array.isArray(preview?.rows)
      ? preview.rows.map((row, index) => {
        const errors = Array.from(new Set(normalizeImportPreviewErrors(row?.errors)));
        const status = `${row?.status || (errors.length ? 'invalid' : 'valid')}`.trim().toLowerCase();
        return {
          rowNumber: row?.rowNumber ?? row?.row_number ?? (index + 1),
          data: row?.data && typeof row.data === 'object' ? row.data : {},
          status,
          errors
        };
      })
      : [];

    const summaryTotal = Number(preview?.summary?.total);
    const summaryValid = Number(preview?.summary?.valid);
    const summaryInvalid = Number(preview?.summary?.invalid);
    const computedValid = rows.filter((row) => row.status === 'valid' && row.errors.length === 0).length;
    const computedInvalid = rows.length - computedValid;

    return {
      columnsDetected: Array.isArray(preview?.columnsDetected)
        ? preview.columnsDetected.map((value) => `${value ?? ''}`.trim()).filter(Boolean)
        : [],
      rows,
      summary: {
        total: Number.isFinite(summaryTotal) ? summaryTotal : rows.length,
        valid: Number.isFinite(summaryValid) ? summaryValid : computedValid,
        invalid: Number.isFinite(summaryInvalid) ? summaryInvalid : computedInvalid
      }
    };
  };

  const getImportPreviewBirthDate = (rowData) => {
    const rawValue = `${rowData?.birth_date ?? rowData?.date_of_birth ?? ''}`.trim();
    return getDateOnlyValue(rawValue) || rawValue;
  };

  const formatImportPreviewCountry = (value) => {
    const rawValue = `${value ?? ''}`.trim();
    if (!rawValue) return '-';

    const normalizedCode = rawValue.toUpperCase();
    if (countryMap.has(normalizedCode)) {
      return `${normalizedCode} - ${countryMap.get(normalizedCode)}`;
    }

    return rawValue;
  };

  const getImportPreviewStatusInfo = (statusValue, errors) => {
    const normalizedStatus = `${statusValue || ''}`.trim().toLowerCase();
    if (normalizedStatus === 'valid' && (!Array.isArray(errors) || errors.length === 0)) {
      return {
        className: 'text-bg-success',
        label: t('registration_participants_import_status_valid', 'Valido')
      };
    }

    return {
      className: 'text-bg-danger',
      label: t('registration_participants_import_status_invalid', 'Invalido')
    };
  };

  const clearImportParticipantsPreview = () => {
    importPreviewState.rawText = '';
    importPreviewState.preview = null;

    if (importElements.previewWrap) {
      importElements.previewWrap.classList.add('d-none');
    }
    if (importElements.detectedColumns) {
      importElements.detectedColumns.innerHTML = '';
    }
    if (importElements.tableBody) {
      importElements.tableBody.innerHTML = '';
    }
    if (importElements.total) {
      importElements.total.textContent = '0';
    }
    if (importElements.valid) {
      importElements.valid.textContent = '0';
    }
    if (importElements.invalid) {
      importElements.invalid.textContent = '0';
    }
    if (importElements.empty) {
      importElements.empty.classList.add('d-none');
    }
    if (importElements.confirmBtn) {
      importElements.confirmBtn.disabled = true;
      importElements.confirmBtn.textContent = t('registration_participants_import_confirm', 'Importar validos');
    }
  };

  const resetImportParticipantsState = () => {
    clearImportParticipantsPreview();

    if (importElements.textarea) {
      importElements.textarea.value = '';
    }
    if (importElements.previewBtn) {
      importElements.previewBtn.disabled = false;
      importElements.previewBtn.textContent = t('registration_participants_import_preview', 'Previsualizar');
    }
  };

  const getValidImportPreviewRows = () => {
    const preview = importPreviewState.preview;
    if (!preview || !Array.isArray(preview.rows)) {
      return [];
    }

    return preview.rows.filter((row) => {
      if (!row || row.status !== 'valid' || row.errors.length > 0) {
        return false;
      }

      const nameValue = `${row?.data?.name ?? ''}`.trim();
      const birthDate = getImportPreviewBirthDate(row?.data || {});
      return Boolean(nameValue && birthDate);
    });
  };

  const renderImportParticipantsPreview = (preview) => {
    const normalizedPreview = getNormalizedImportPreview(preview);
    importPreviewState.preview = normalizedPreview;

    if (importElements.previewWrap) {
      importElements.previewWrap.classList.remove('d-none');
    }
    if (importElements.total) {
      importElements.total.textContent = `${normalizedPreview.summary.total}`;
    }
    if (importElements.valid) {
      importElements.valid.textContent = `${normalizedPreview.summary.valid}`;
    }
    if (importElements.invalid) {
      importElements.invalid.textContent = `${normalizedPreview.summary.invalid}`;
    }
    if (importElements.detectedColumns) {
      importElements.detectedColumns.innerHTML = '';
      if (normalizedPreview.columnsDetected.length) {
        normalizedPreview.columnsDetected.forEach((columnName) => {
          const badge = document.createElement('span');
          badge.className = 'badge rounded-pill text-bg-light border text-dark';
          badge.textContent = columnName;
          importElements.detectedColumns.appendChild(badge);
        });
      } else {
        const emptyBadge = document.createElement('span');
        emptyBadge.className = 'badge rounded-pill text-bg-light border text-dark';
        emptyBadge.textContent = '-';
        importElements.detectedColumns.appendChild(emptyBadge);
      }
    }
    if (importElements.tableBody) {
      importElements.tableBody.innerHTML = '';
    }

    if (!normalizedPreview.rows.length) {
      if (importElements.empty) {
        importElements.empty.classList.remove('d-none');
      }
    } else {
      if (importElements.empty) {
        importElements.empty.classList.add('d-none');
      }

      normalizedPreview.rows.forEach((row) => {
        const tableRow = document.createElement('tr');
        const statusInfo = getImportPreviewStatusInfo(row.status, row.errors);
        const rowData = row.data || {};
        const errorsValue = row.errors.length
          ? row.errors.join(' | ')
          : t('registration_participants_import_no_errors', 'Sin errores');

        [
          `${row.rowNumber ?? '-'}`,
          `${rowData.name ?? ''}`.trim() || '-',
          getImportPreviewBirthDate(rowData) || '-',
          `${rowData.gender ?? ''}`.trim() || '-',
          formatImportPreviewCountry(rowData.country)
        ].forEach((value) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          tableRow.appendChild(cell);
        });

        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${statusInfo.className}`;
        statusBadge.textContent = statusInfo.label;
        statusCell.appendChild(statusBadge);
        tableRow.appendChild(statusCell);

        const errorsCell = document.createElement('td');
        errorsCell.className = row.errors.length ? 'text-danger small' : 'text-muted small';
        errorsCell.textContent = errorsValue;
        tableRow.appendChild(errorsCell);

        if (importElements.tableBody) {
          importElements.tableBody.appendChild(tableRow);
        }
      });
    }

    if (importElements.confirmBtn) {
      importElements.confirmBtn.disabled = getValidImportPreviewRows().length === 0;
    }
  };

  const buildImportParticipantsPreviewPayload = (rawText) => {
    const eventObj = getEvent();
    return {
      event_id: eventObj?.id || registrationState.school?.event_id,
      school_id: user.id,
      text: rawText
    };
  };

  const previewImportParticipants = async () => {
    if (!importElements.textarea || !importElements.previewBtn) {
      return;
    }

    const rawText = importElements.textarea.value;
    if (!rawText.trim()) {
      showMessageModal(
        t('registration_participants_import_empty_error', 'Pega primero los datos que quieres importar.'),
        t('error_title', 'Error')
      );
      return;
    }

    const originalPreviewText = importElements.previewBtn.textContent;
    importElements.previewBtn.disabled = true;
    importElements.previewBtn.textContent = t('registration_participants_import_preview_loading', 'Previsualizando...');
    if (importElements.confirmBtn) {
      importElements.confirmBtn.disabled = true;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/participants/import-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildImportParticipantsPreviewPayload(rawText))
      });

      const data = await safeJsonResponse(res);
      if (!res.ok) {
        throw new Error(data?.error || t('registration_participants_import_preview_error', 'Error al previsualizar la importacion.'));
      }

      importPreviewState.rawText = rawText;
      renderImportParticipantsPreview(data || {});
    } catch (err) {
      clearImportParticipantsPreview();
      showMessageModal(
        err.message || t('registration_participants_import_preview_error', 'Error al previsualizar la importacion.'),
        t('error_title', 'Error')
      );
    } finally {
      importElements.previewBtn.disabled = false;
      importElements.previewBtn.textContent = originalPreviewText;
    }
  };

  const normalizeImportConfirmCountry = (value) => {
    const rawValue = `${value ?? ''}`.trim();
    if (!rawValue) return '';

    const normalizedCode = rawValue.toUpperCase();
    if (countryMap.has(normalizedCode)) {
      return normalizedCode;
    }

    return rawValue;
  };

  const buildImportParticipantsConfirmRows = () => {
    return getValidImportPreviewRows().map((row) => {
      const rowData = row.data || {};
      const participantRow = {
        name: `${rowData.name ?? ''}`.trim(),
        birth_date: getImportPreviewBirthDate(rowData)
      };

      const genderValue = `${rowData.gender ?? ''}`.trim();
      const countryValue = normalizeImportConfirmCountry(rowData.country);

      if (genderValue) {
        participantRow.gender = genderValue;
      }
      if (countryValue) {
        participantRow.country = countryValue;
      }

      return participantRow;
    }).filter((row) => row.name && row.birth_date);
  };

  const confirmImportParticipants = async () => {
    if (!importElements.confirmBtn) {
      return;
    }

    const rows = buildImportParticipantsConfirmRows();
    if (!rows.length) {
      showMessageModal(
        t('registration_participants_import_empty_error', 'Pega primero los datos que quieres importar.'),
        t('error_title', 'Error')
      );
      return;
    }

    const eventObj = getEvent();
    const payload = {
      event_id: eventObj?.id || registrationState.school?.event_id,
      school_id: user.id,
      rows
    };

    const originalConfirmText = importElements.confirmBtn.textContent;
    importElements.confirmBtn.disabled = true;
    if (importElements.previewBtn) {
      importElements.previewBtn.disabled = true;
    }
    importElements.confirmBtn.textContent = t('registration_participants_import_confirm_loading', 'Importando...');

    try {
      const res = await fetch(`${API_BASE_URL}/api/participants/import-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await safeJsonResponse(res);
      if (!res.ok) {
        throw new Error(data?.error || t('registration_participants_import_confirm_error', 'Error al importar participantes.'));
      }

      importParticipantsModal?.hide();
      await loadParticipants();
      showMessageModal(
        t('registration_participants_import_success', 'Se han importado {count} participantes validos.').replace('{count}', `${rows.length}`),
        t('registration_participants_import_title', 'Importar participantes'),
        'success'
      );
    } catch (err) {
      showMessageModal(
        err.message || t('registration_participants_import_confirm_error', 'Error al importar participantes.'),
        t('error_title', 'Error')
      );
    } finally {
      if (importElements.previewBtn) {
        importElements.previewBtn.disabled = false;
      }
      importElements.confirmBtn.textContent = originalConfirmText;
      importElements.confirmBtn.disabled = getValidImportPreviewRows().length === 0;
    }
  };

  const getParticipantRegistrations = (participant) => {
    const rawValue = `${participant?.reg_cat_sty ?? ''}`.trim();
    if (!rawValue || rawValue.toUpperCase() === 'NULL') {
      return [];
    }
    return rawValue
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
  };

  const setCountryValue = (value) => {
    if (participantCountrySelect) {
      if (value) {
        participantCountrySelect.setValue(value, true);
      } else {
        participantCountrySelect.clear(true);
      }
    } else if (elements.country) {
      elements.country.value = value || '';
    }
  };

  const setCreateDefaults = async () => {
    let defaultCountry = '';
    if (registrationState.school && registrationState.school.country) {
      defaultCountry = registrationState.school.country;
    } else {
      try {
        const school = await fetchSchoolRecord(user.id);
        defaultCountry = school?.country || '';
      } catch (err) {
        defaultCountry = '';
      }
    }

    if (elements.id) elements.id.value = '';
    if (elements.name) elements.name.value = '';
    if (elements.dob) elements.dob.value = '';
    if (elements.gender) elements.gender.value = '';
    setCountryValue(defaultCountry);
  };

  const openParticipantModal = async (mode, participant = null) => {
    if (!form) return;

    form.dataset.mode = mode;
    form.classList.remove('was-validated');

    if (mode === 'create') {
      if (elements.modalTitle) {
        elements.modalTitle.textContent = t('registration_participants_modal_create', 'Alta participantes');
      }
      if (elements.saveAddBtn) elements.saveAddBtn.classList.remove('d-none');
      if (elements.saveBtn) {
        elements.saveBtn.textContent = t('registration_participants_save_close', 'Guardar y cerrar');
      }
      await setCreateDefaults();
    } else {
      if (elements.modalTitle) {
        elements.modalTitle.textContent = t('registration_participants_modal_edit', 'Editar participante');
      }
      if (elements.saveAddBtn) elements.saveAddBtn.classList.add('d-none');
      if (elements.saveBtn) {
        elements.saveBtn.textContent = t('save', 'Guardar');
      }

      if (participant) {
        if (elements.id) elements.id.value = participant.id || '';
        if (elements.name) elements.name.value = participant.name || '';
        if (elements.dob) elements.dob.value = getDateOnlyValue(participant.date_of_birth);
        if (elements.gender) elements.gender.value = role === 'school' ? '' : (participant.gender || '');
        setCountryValue(participant.country || '');
      }
    }

    participantModal.show();
  };

  const renderParticipants = () => {
    tableBody.innerHTML = '';
    const participantsAgeReferenceDate = getRegistrationAgeReferenceDate();

    const participants = Array.isArray(registrationState.participants)
      ? registrationState.participants
      : [];
    const filtered = applyParticipantFilters(participants);

    if (countEl) {
      countEl.textContent = `${filtered.length}`;
    }

    if (!filtered.length) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    if (emptyEl) emptyEl.classList.add('d-none');

    const genderLabels = {
      M: t('gender_male', 'Male'),
      F: t('gender_female', 'Female')
    };
    const editTitle = t('edit', 'Edit');
    const deleteTitle = t('delete', 'Delete');

    filtered.forEach(participant => {
      const row = document.createElement('tr');
      row.dataset.id = participant.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = participant.name || '';
      row.appendChild(nameCell);

      if (shouldShowGender) {
        const genderCell = document.createElement('td');
        genderCell.textContent = genderLabels[participant.gender] || participant.gender || '-';
        row.appendChild(genderCell);
      }

      const dobValue = getDateOnlyValue(participant.date_of_birth);
      const dobCell = document.createElement('td');
      dobCell.textContent = dobValue || '-';
      row.appendChild(dobCell);

      const ageCell = document.createElement('td');
      ageCell.textContent = `${calculateAge(dobValue, participantsAgeReferenceDate)}`;
      row.appendChild(ageCell);

      const countryCell = document.createElement('td');
      countryCell.textContent = getCountryName(participant.country, countryMap) || '-';
      row.appendChild(countryCell);

      if (showSchoolColumn) {
        const schoolCell = document.createElement('td');
        schoolCell.textContent = participant.school_name || participant.school || '-';
        row.appendChild(schoolCell);
      }

      const registrationsCell = document.createElement('td');
      const registrations = getParticipantRegistrations(participant);
      const registrationsWrap = document.createElement('div');
      registrationsWrap.className = 'd-flex flex-wrap gap-1';

      if (registrations.length) {
        registrations.forEach((registrationLabel) => {
          const badge = document.createElement('span');
          badge.className = 'badge bg-primary-subtle text-primary-emphasis';
          badge.textContent = registrationLabel;
          registrationsWrap.appendChild(badge);
        });
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge bg-secondary-subtle text-secondary-emphasis';
        badge.textContent = t('registration_participants_no_registration', 'NO INSCRIPCIÓN');
        registrationsWrap.appendChild(badge);
      }

      registrationsCell.appendChild(registrationsWrap);
      row.appendChild(registrationsCell);

      if (allowEdit) {
        const actionsCell = document.createElement('td');
        actionsCell.className = 'text-center';
        actionsCell.setAttribute('data-tsv-ignore', 'true');
        const actionGroup = document.createElement('div');
        actionGroup.className = 'btn-group';
        actionGroup.setAttribute('role', 'group');

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-outline-primary btn-sm btn-edit-participant';
        editBtn.dataset.id = participant.id;
        editBtn.title = editTitle;
        editBtn.setAttribute('aria-label', editTitle);
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-outline-danger btn-sm btn-delete-participant';
        deleteBtn.dataset.id = participant.id;
        deleteBtn.title = deleteTitle;
        deleteBtn.setAttribute('aria-label', deleteTitle);
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';

        actionGroup.appendChild(editBtn);
        actionGroup.appendChild(deleteBtn);
        actionsCell.appendChild(actionGroup);
        row.appendChild(actionsCell);
      }

      tableBody.appendChild(row);
    });
  };

  const showParticipantsError = (message) => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5 + (shouldShowGender ? 1 : 0) + (showSchoolColumn ? 1 : 0) + (allowEdit ? 1 : 0);
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    if (countEl) countEl.textContent = '0';
    if (emptyEl) emptyEl.classList.add('d-none');
  };

  const loadParticipants = async () => {
    try {
      const params = new URLSearchParams();
      if (role === 'school') {
        params.set('school_id', user.id);
      }

      const eventObj = getEvent();
      if (eventObj && eventObj.id) {
        params.set('event_id', eventObj.id);
      }

      const url = params.toString()
        ? `${API_BASE_URL}/api/participants?${params.toString()}`
        : `${API_BASE_URL}/api/participants`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('registration_participants_load_error', 'Error loading participants.'));
      }

      const data = await res.json();
      registrationState.participants = Array.isArray(data) ? data : [];
      notifyRegistrationParticipantsUpdate();
      renderParticipants();
    } catch (err) {
      showParticipantsError(err.message || t('registration_participants_load_error', 'Error loading participants.'));
    }
  };

  const applyParticipantFilters = (participants) => {
    const schoolValue = showSchoolColumn && filterSchool ? filterSchool.value : '';
    const nameValue = filterName ? filterName.value.trim().toLowerCase() : '';

    return participants.filter(participant => {
      const matchesName = !nameValue || (participant?.name || '').toLowerCase().includes(nameValue);
      if (!schoolValue || !showSchoolColumn) {
        return matchesName;
      }
      const participantSchoolId = participant?.school_id ?? participant?.school?.id;
      const matchesSchool = `${participantSchoolId || ''}` === `${schoolValue}`;
      return matchesName && matchesSchool;
    });
  };

  const findDuplicateParticipant = (payload) => {
    const nameValue = payload?.name ? payload.name.trim().toLowerCase() : '';
    const dobValue = payload?.date_of_birth || '';
    if (!nameValue || !dobValue) return null;

    return registrationState.participants.find(participant => {
      const participantName = (participant?.name || '').trim().toLowerCase();
      const participantDob = getDateOnlyValue(participant?.date_of_birth);
      return participantName === nameValue && participantDob === dobValue;
    }) || null;
  };

  const confirmDuplicateParticipant = (participant) => new Promise((resolve) => {
    if (!duplicateModal || !duplicateModalEl) {
      resolve(true);
      return;
    }

    const dobValue = getDateOnlyValue(participant?.date_of_birth) || '-';
    if (duplicateMessageEl) {
      duplicateMessageEl.innerHTML = `Ya existe un participante con el mismo nombre y fecha de nacimiento: <strong>${participant?.name || '-'}</strong> (${dobValue}). ¿Es correcto?`;
    }

    let confirmed = false;
    const onConfirm = () => {
      confirmed = true;
      duplicateModal.hide();
    };
    const onHidden = () => {
      duplicateModalEl.removeEventListener('hidden.bs.modal', onHidden);
      if (confirmDuplicateBtn) {
        confirmDuplicateBtn.removeEventListener('click', onConfirm);
      }
      resolve(confirmed);
    };

    if (confirmDuplicateBtn) {
      confirmDuplicateBtn.addEventListener('click', onConfirm);
    }
    duplicateModalEl.addEventListener('hidden.bs.modal', onHidden);
    duplicateModal.show();
  });

  const loadParticipantSchools = async () => {
    if (!showSchoolColumn || !filterSchool) {
      return;
    }
    try {
      const schools = await fetchEventSchools();
      filterSchool.innerHTML = '<option value=""></option>';
      schools.forEach(school => {
        const option = document.createElement('option');
        option.value = school.id;
        option.textContent = school?.name || school?.school_name || '-';
        filterSchool.appendChild(option);
      });
    } catch (err) {
      // keep filters but skip blocking participants load
    }
  };

  const saveParticipant = async (closeOnSuccess) => {
    if (!form) return;

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const mode = form.dataset.mode || 'create';
    const participantId = elements.id ? elements.id.value : '';
    const eventObj = getEvent();
    const eventIdValue = eventObj?.id || registrationState.school?.event_id;

    const payload = {
      id: participantId || undefined,
      event_id: eventIdValue,
      name: elements.name ? elements.name.value.trim() : '',
      date_of_birth: elements.dob ? elements.dob.value : '',
      country: elements.country ? elements.country.value : '',
      gender: role === 'school' ? null : ((elements.gender ? `${elements.gender.value || ''}`.trim() : '') || null),
      school_id: user.id
    };

    if (!payload.id) delete payload.id;
    if (!payload.event_id) delete payload.event_id;

    const isEdit = mode === 'edit';
    if (isEdit && !participantId) {
      showMessageModal(t('registration_participants_save_error', 'Error saving participant.'), t('error_title', 'Error'));
      return;
    }

    if (!isEdit) {
      const duplicate = findDuplicateParticipant(payload);
      if (duplicate) {
        const shouldContinue = await confirmDuplicateParticipant(duplicate);
        if (!shouldContinue) {
          return;
        }
      }
    }
    const url = `${API_BASE_URL}/api/participants${isEdit ? `/${participantId}` : ''}`;
    const method = isEdit ? 'PUT' : 'POST';

    const activeButton = closeOnSuccess ? elements.saveBtn : elements.saveAddBtn;
    const originalSaveText = elements.saveBtn ? elements.saveBtn.textContent : '';
    const originalSaveAddText = elements.saveAddBtn ? elements.saveAddBtn.textContent : '';

    if (elements.saveBtn) elements.saveBtn.disabled = true;
    if (elements.saveAddBtn) elements.saveAddBtn.disabled = true;
    if (activeButton) activeButton.textContent = t('saving', 'Guardando...');

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_participants_save_error', 'Error saving participant.');
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (parseErr) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      if (closeOnSuccess) {
        participantModal.hide();
      } else {
        await setCreateDefaults();
        if (elements.name) elements.name.focus();
        await loadParticipants();
      }
    } catch (err) {
      showMessageModal(err.message || t('registration_participants_save_error', 'Error saving participant.'), t('error_title', 'Error'));
    } finally {
      if (elements.saveBtn) {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = originalSaveText;
      }
      if (elements.saveAddBtn) {
        elements.saveAddBtn.disabled = false;
        elements.saveAddBtn.textContent = originalSaveAddText;
      }
    }
  };

  const deleteParticipant = async () => {
    if (!participantToDelete) return;

    if (elements.confirmDeleteBtn) {
      elements.confirmDeleteBtn.disabled = true;
    }

    try {
      const eventObj = getEvent();
      const eventIdValue = eventObj?.id || registrationState.school?.event_id;
      const deletePayload = {
        id: participantToDelete.id,
        school_id: user.id,
        event_id: eventIdValue
      };
      if (!deletePayload.event_id) delete deletePayload.event_id;

      const res = await fetch(`${API_BASE_URL}/api/participants/${participantToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deletePayload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_participants_delete_error', 'Error deleting participant.');
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (parseErr) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      deleteModal.hide();
      await loadParticipants();
    } catch (err) {
      showMessageModal(err.message || t('registration_participants_delete_error', 'Error deleting participant.'), t('error_title', 'Error'));
    } finally {
      if (elements.confirmDeleteBtn) {
        elements.confirmDeleteBtn.disabled = false;
      }
      participantToDelete = null;
    }
  };

  if (addBtn && allowEdit) {
    addBtn.addEventListener('click', () => openParticipantModal('create'));
  }

  if (importOpenBtn && allowEdit && importParticipantsModal) {
    importOpenBtn.addEventListener('click', () => {
      resetImportParticipantsState();
      importParticipantsModal.show();
    });
  }

  if (copyTsvBtn) {
    bindTableTsvExportButton(copyTsvBtn, tableBody);
  }

  if (elements.saveBtn && allowEdit) {
    elements.saveBtn.addEventListener('click', () => saveParticipant(true));
  }

  if (elements.saveAddBtn && allowEdit) {
    elements.saveAddBtn.addEventListener('click', () => saveParticipant(false));
  }

  tableBody.addEventListener('click', (event) => {
    if (!allowEdit) return;
    const editBtn = event.target.closest('.btn-edit-participant');
    const deleteBtn = event.target.closest('.btn-delete-participant');

    if (editBtn) {
      const id = editBtn.dataset.id;
      const participant = registrationState.participants.find(p => `${p.id}` === `${id}`);
      if (!participant) return;
      openParticipantModal('edit', participant);
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const participant = registrationState.participants.find(p => `${p.id}` === `${id}`);
      if (!participant) return;

      participantToDelete = participant;
      if (elements.deleteMessage) {
        elements.deleteMessage.innerHTML = `${t('registration_participants_delete_question', 'Seguro que deseas eliminar a')} <strong>${participant.name}</strong>?`;
      }
      deleteModal.show();
    }
  });

  if (elements.confirmDeleteBtn && allowEdit) {
    elements.confirmDeleteBtn.addEventListener('click', deleteParticipant);
  }

  if (importElements.previewBtn && allowEdit) {
    importElements.previewBtn.addEventListener('click', previewImportParticipants);
  }

  if (importElements.confirmBtn && allowEdit) {
    importElements.confirmBtn.addEventListener('click', confirmImportParticipants);
  }

  if (importElements.textarea && allowEdit) {
    importElements.textarea.addEventListener('input', () => {
      if (!importPreviewState.rawText) {
        return;
      }
      if (importElements.textarea.value !== importPreviewState.rawText) {
        clearImportParticipantsPreview();
      }
    });
  }

  if (allowEdit) {
    modalEl.addEventListener('hidden.bs.modal', () => {
      loadParticipants();
    });
    if (importModalEl) {
      importModalEl.addEventListener('hidden.bs.modal', resetImportParticipantsState);
      importModalEl.addEventListener('shown.bs.modal', () => {
        importElements.textarea?.focus();
      });
    }
  }

  if (filtersForm) {
    filtersForm.addEventListener('submit', (event) => {
      event.preventDefault();
    });
  }
  if (filterName) {
    filterName.addEventListener('input', renderParticipants);
  }
  if (filterSchool) {
    filterSchool.addEventListener('change', renderParticipants);
  }
  if (filterClear) {
    filterClear.addEventListener('click', () => {
      if (filterName) filterName.value = '';
      if (filterSchool) filterSchool.value = '';
      renderParticipants();
    });
  }

  const refreshParticipantsTranslations = async () => {
    try {
      await window.translationsReady;
    } catch (error) {
      // Ignore translation loading failures and keep current labels.
    }
    updateParticipantsAgeHeaderTooltip();
    renderParticipants();
  };

  if (ageHeaderInfoBtn) {
    const ageHeaderLanguageObserver = new MutationObserver(() => {
      refreshParticipantsTranslations();
    });
    ageHeaderLanguageObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang']
    });
  }

  window.addEventListener('registration:config-updated', () => {
    updateParticipantsAgeHeaderTooltip();
    renderParticipants();
  });

  updateParticipantsAgeHeaderTooltip();
  syncParticipantsGenderUi();
  loadParticipantSchools();
  loadParticipants();
}

function getDateOnlyValue(dateValue) {
  if (!dateValue) return '';
  if (typeof dateValue === 'string') {
    return dateValue.split('T')[0];
  }
  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    return dateValue.toISOString().split('T')[0];
  }
  return '';
}

function calculateAge(dateValue, referenceDateValue = null) {
  if (!dateValue) return '-';
  const parts = dateValue.split('-').map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
    return '-';
  }
  const [year, month, day] = parts;
  const referenceDateOnly = getDateOnlyValue(referenceDateValue);
  const referenceParts = referenceDateOnly
    ? referenceDateOnly.split('-').map(Number)
    : [];
  const hasValidReference = referenceParts.length >= 3
    && referenceParts[0]
    && referenceParts[1]
    && referenceParts[2];
  const [referenceYear, referenceMonth, referenceDay] = hasValidReference
    ? referenceParts
    : [null, null, null];

  const today = hasValidReference ? null : new Date();
  const baseYear = hasValidReference ? referenceYear : today.getFullYear();
  const baseMonth = hasValidReference ? referenceMonth : (today.getMonth() + 1);
  const baseDay = hasValidReference ? referenceDay : today.getDate();

  let age = baseYear - year;
  const monthDiff = baseMonth - month;
  const dayDiff = baseDay - day;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

function getRegistrationAgeReferenceDate() {
  return getEvent()?.start || null;
}

function formatRegistrationAgeReferenceDate(dateValue) {
  const normalizedDate = getDateOnlyValue(dateValue);
  if (!normalizedDate) {
    return '-';
  }

  const [year, month, day] = normalizedDate.split('-').map(Number);
  if (!year || !month || !day) {
    return normalizedDate;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return normalizedDate;
  }

  return new Intl.DateTimeFormat(getRegistrationLanguage(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getRegistrationAgeTooltipText() {
  const referenceDateLabel = formatRegistrationAgeReferenceDate(getRegistrationAgeReferenceDate());
  return t(
    'registration_participants_age_tooltip',
    'Age is calculated using the event start date ({date}).'
  ).replace('{date}', referenceDateLabel);
}

function syncRegistrationAgeTooltipButton(buttonEl) {
  if (!buttonEl) {
    return;
  }

  const tooltipText = getRegistrationAgeTooltipText();
  buttonEl.setAttribute('aria-label', tooltipText);
  buttonEl.setAttribute('data-bs-title', tooltipText);
  buttonEl.setAttribute('data-bs-original-title', tooltipText);
  buttonEl.removeAttribute('title');

  const tooltipInstance = window.bootstrap?.Tooltip?.getOrCreateInstance(buttonEl);
  if (tooltipInstance) {
    tooltipInstance.setContent({ '.tooltip-inner': tooltipText });
    tooltipInstance.update();
  }
}

function getCountryName(code, countryMap) {
  if (!code) return '';
  if (countryMap && countryMap.has(code)) {
    return countryMap.get(code);
  }
  return code;
}

function isRegistrationFlagEnabled(value) {
  if (value === true) return true;
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function getRegistrationMusicBadgeInfo(registration) {
  const hasMusic = isRegistrationFlagEnabled(registration?.has_music);
  if (!hasMusic) {
    return {
      label: t('registration_music_status_none', 'No').toUpperCase(),
      className: 'bg-danger-subtle text-danger-emphasis'
    };
  }

  if (isRegistrationFlagEnabled(registration?.music_validated)) {
    return {
      label: t('registration_music_status_validated', 'Validada').toUpperCase(),
      className: 'bg-success-subtle text-success-emphasis'
    };
  }

  return {
    label: t('registration_music_status_pending_validation', 'Pend. val.').toUpperCase(),
    className: 'bg-warning-subtle text-warning-emphasis'
  };
}

function getRegistrationPaymentBadgeInfo(registration) {
  const hasPayment = isRegistrationFlagEnabled(registration?.has_payment);
  if (!hasPayment) {
    return {
      label: t('registration_payment_status_none', 'No').toUpperCase(),
      className: 'bg-danger-subtle text-danger-emphasis'
    };
  }

  if (isRegistrationFlagEnabled(registration?.payment_validated)) {
    return {
      label: t('registration_payment_status_validated', 'Validado').toUpperCase(),
      className: 'bg-success-subtle text-success-emphasis'
    };
  }

  return {
    label: t('registration_payment_status_pending_validation', 'Pend. val.').toUpperCase(),
    className: 'bg-warning-subtle text-warning-emphasis'
  };
}

function getRegistrationLanguage() {
  return getCurrentAppLanguage?.() || localStorage.getItem('lang') || document.documentElement.getAttribute('lang') || 'es';
}

function normalizeRegistrationNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRegistrationCurrency(value) {
  const cents = normalizeRegistrationNumber(value);
  const amount = (cents ?? 0) / 100;
  return new Intl.NumberFormat(getRegistrationLanguage(), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatRegistrationPercent(value) {
  const ratio = Number(value);
  return new Intl.NumberFormat(getRegistrationLanguage(), {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(Number.isFinite(ratio) ? ratio : 0);
}

function getRegistrationCategoryIdValue(registration) {
  return registration?.reg_category_id
    ?? registration?.category_id
    ?? registration?.reg_category?.id
    ?? registration?.reg_category
    ?? '';
}

function getRegistrationParticipantsTotal(registration) {
  if (!registration) return 0;
  const directCount = registration?.member_count
    ?? registration?.members_count
    ?? registration?.participants_count
    ?? registration?.num_participants;
  if (directCount !== undefined && directCount !== null) {
    return Number(directCount) || 0;
  }
  if (Array.isArray(registration?.members)) return registration.members.length;
  if (Array.isArray(registration?.participants)) return registration.participants.length;
  return 0;
}

function getRegistrationTotalAmountValue(registration, options = {}) {
  const directAmount = normalizeRegistrationNumber(
    registration?.total_amount
    ?? registration?.totalAmount
    ?? registration?.amount_total
  );
  if (directAmount !== null) {
    return directAmount;
  }

  let category = null;
  if (options.categoryById instanceof Map) {
    category = options.categoryById.get(`${getRegistrationCategoryIdValue(registration)}`) || null;
  }

  const categoryPrice = normalizeRegistrationNumber(category?.registration_price) ?? 0;
  const feeCost = normalizeRegistrationNumber(options.registrationFeeCost ?? getEvent()?.registrationFeeCost) ?? 0;
  return (feeCost + categoryPrice) * getRegistrationParticipantsTotal(registration);
}

function buildRegistrationFinanceMetrics(registrations, options = {}) {
  const summary = (Array.isArray(registrations) ? registrations : []).reduce((summary, registration) => {
    const amount = getRegistrationTotalAmountValue(registration, options);
    const hasPayment = isRegistrationFlagEnabled(registration?.has_payment);
    const isValidated = isRegistrationFlagEnabled(registration?.payment_validated);

    summary.totalRegistrationsCount += 1;
    summary.totalAmount += amount;

    if (isValidated) {
      summary.paidAmount += amount;
      summary.paidRegistrationsCount += 1;
    } else {
      summary.pendingAmount += amount;
      summary.pendingRegistrationsCount += 1;
    }

    if (hasPayment && !isValidated) {
      summary.pendingValidationPaymentsCount += 1;
    }

    return summary;
  }, {
    totalRegistrationsCount: 0,
    totalAmount: 0,
    paidAmount: 0,
    paidRegistrationsCount: 0,
    pendingAmount: 0,
    pendingRegistrationsCount: 0,
    pendingValidationPaymentsCount: 0,
    paidRatio: 0
  });

  summary.paidRatio = summary.totalAmount > 0 ? summary.paidAmount / summary.totalAmount : 0;
  return summary;
}

function initSchoolsTab() {
  const filterForm = document.getElementById('schoolsFilters');
  const tableBody = document.getElementById('schoolsTable');
  const emptyEl = document.getElementById('schoolsEmpty');
  const countEl = document.getElementById('schoolsCount');
  const filterName = document.getElementById('schoolsFilterName');
  const filterCountry = document.getElementById('schoolsFilterCountry');
  const filterClear = document.getElementById('schoolsFilterClear');
  const copyTsvBtn = document.getElementById('schoolsCopyTsvBtn');
  const modalEl = document.getElementById('schoolDetailsModal');

  if (!filterForm || !tableBody || !filterName || !filterCountry || !modalEl) {
    return;
  }

  const countryMap = Array.isArray(countries)
    ? new Map(countries.map(c => [c.code, c.name]))
    : new Map();

  if (Array.isArray(countries)) {
    countries.forEach(c => {
      const option = document.createElement('option');
      option.value = c.code;
      option.textContent = `${c.code} - ${c.name}`;
      filterCountry.appendChild(option);
    });
  }

  const detailModal = new bootstrap.Modal(modalEl);
  const detailElements = {
    name: document.getElementById('schoolDetailName'),
    email: document.getElementById('schoolDetailEmail'),
    language: document.getElementById('schoolDetailLanguage'),
    city: document.getElementById('schoolDetailCity'),
    country: document.getElementById('schoolDetailCountry'),
    phone: document.getElementById('schoolDetailPhone'),
    representative: document.getElementById('schoolDetailRepresentative')
  };
  let schoolsTooltipInstances = [];

  const applyFilters = () => {
    const nameValue = filterName.value.trim().toLowerCase();
    const countryValue = filterCountry.value;

    const filtered = registrationState.schools.filter(school => {
      const schoolName = (school?.name || school?.school_name || '').toLowerCase();
      const matchesName = !nameValue || schoolName.includes(nameValue);
      const matchesCountry = !countryValue || `${school?.country || ''}` === countryValue;
      return matchesName && matchesCountry;
    });

    renderSchools(filtered);
    if (countEl) {
      countEl.textContent = `${filtered.length}`;
    }
  };

  const renderSchools = (schools) => {
    schoolsTooltipInstances = disposeTooltipInstances(schoolsTooltipInstances);
    tableBody.innerHTML = '';

    if (!schools.length) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    if (emptyEl) emptyEl.classList.add('d-none');

    const detailLabel = t('schools_action_detail', 'Detalle');

    schools.forEach(school => {
      const row = document.createElement('tr');
      row.dataset.id = school.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = school?.name || school?.school_name || '-';
      row.appendChild(nameCell);

      const countryCell = document.createElement('td');
      countryCell.textContent = getCountryName(school?.country, countryMap) || '-';
      row.appendChild(countryCell);

      const repCell = document.createElement('td');
      repCell.textContent = school?.representative || '-';
      row.appendChild(repCell);

      const participantsCell = document.createElement('td');
      participantsCell.className = 'text-center';
      const participantsBadge = document.createElement('span');
      participantsBadge.className = 'badge bg-secondary';
      participantsBadge.textContent = `${school.num_participants ?? 0}`;
      participantsCell.appendChild(participantsBadge);
      row.appendChild(participantsCell);

      const choreoStatusCell = document.createElement('td');
      choreoStatusCell.className = 'text-center';
      choreoStatusCell.appendChild(createChoreoStatusBadges(buildChoreoStatusSummaryFromCounts({
        CRE: school.choreos_cre,
        PEN: school.choreos_pen,
        VAL: school.choreos_val,
        REJ: school.choreos_rej
      }), {
        className: 'd-flex flex-wrap justify-content-center gap-1',
        totalCountOverride: school.num_choreos
      }));
      row.appendChild(choreoStatusCell);

      const syncroCell = document.createElement('td');
      syncroCell.className = 'text-center';
      const syncroBadge = document.createElement('span');
      const syncroInfo = getSyncroStatusBadgeInfo(school.syncro_status);
      syncroBadge.className = `badge ${syncroInfo.className}`;
      syncroBadge.textContent = syncroInfo.label;
      syncroCell.appendChild(syncroBadge);
      row.appendChild(syncroCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      actionsCell.setAttribute('data-tsv-ignore', 'true');
      const detailBtn = document.createElement('button');
      detailBtn.type = 'button';
      detailBtn.className = 'btn btn-outline-primary btn-sm btn-school-detail';
      detailBtn.dataset.id = school.id;
      detailBtn.textContent = detailLabel;
      actionsCell.appendChild(detailBtn);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });

    schoolsTooltipInstances = initTooltipInstances(tableBody);
  };

  const showSchoolsError = (message) => {
    schoolsTooltipInstances = disposeTooltipInstances(schoolsTooltipInstances);
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    if (emptyEl) emptyEl.classList.add('d-none');
    if (countEl) countEl.textContent = '0';
  };

  const loadSchools = async () => {
    try {
      await fetchEventSchools();
      applyFilters();
      notifyRegistrationSchoolsUpdate();
    } catch (err) {
      showSchoolsError(err.message || t('schools_load_error', 'Error loading schools.'));
    }
  };

  const openSchoolDetails = (school) => {
    if (detailElements.name) detailElements.name.value = school?.name || school?.school_name || '';
    if (detailElements.email) detailElements.email.value = school?.email || '';
    if (detailElements.language) detailElements.language.value = school?.language || '';
    if (detailElements.city) detailElements.city.value = school?.city || '';
    if (detailElements.country) {
      detailElements.country.value = getCountryName(school?.country, countryMap) || school?.country || '';
    }
    if (detailElements.phone) detailElements.phone.value = school?.phone || '';
    if (detailElements.representative) detailElements.representative.value = school?.representative || '';
    detailModal.show();
  };

  filterName.addEventListener('input', applyFilters);
  filterCountry.addEventListener('change', applyFilters);
  if (filterClear) {
    filterClear.addEventListener('click', () => {
      filterName.value = '';
      filterCountry.value = '';
      applyFilters();
    });
  }

  if (copyTsvBtn) {
    bindTableTsvExportButton(copyTsvBtn, tableBody);
  }

  tableBody.addEventListener('click', (event) => {
    const detailBtn = event.target.closest('.btn-school-detail');
    if (!detailBtn) return;
    const school = registrationState.schools.find(item => `${item.id}` === `${detailBtn.dataset.id}`);
    if (school) {
      openSchoolDetails(school);
    }
  });

  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  window.addEventListener('beforeunload', () => {
    schoolsTooltipInstances = disposeTooltipInstances(schoolsTooltipInstances);
  });

  loadSchools();
}

function getSyncroStatusBadgeInfo(status) {
  switch (`${status || ''}`) {
    case 'NOT_APPLICABLE':
      return { label: t('registration_categories_syncro_status_not_applicable', 'Not applicable'), className: 'bg-info-subtle text-info-emphasis' };
    case 'SYNCRO_OK':
      return { label: t('registration_categories_syncro_status_ok', 'Synchronized'), className: 'bg-success-subtle text-success-emphasis' };
    case 'PEN_UPDATE':
      return { label: t('registration_categories_syncro_status_pending', 'Pending update'), className: 'bg-warning-subtle text-warning-emphasis' };
    case 'NOT_SYNCRO':
    default:
      return { label: t('registration_categories_syncro_status_not', 'Not synchronized'), className: 'bg-secondary-subtle text-secondary-emphasis' };
  }
}

function parseChoreoStatusSummary(status) {
  if (status === null || status === undefined) {
    return [];
  }

  const order = { CRE: 0, PEN: 1, VAL: 2, REJ: 3 };
  return `${status}`
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [rawCode, rawCount] = item.split(':');
      const code = `${rawCode || ''}`.trim().toUpperCase();
      if (!code) {
        return null;
      }
      const count = Number.parseInt(`${rawCount ?? ''}`.trim(), 10);
      return {
        code,
        count: Number.isFinite(count) ? count : 0
      };
    })
    .filter((item) => item && order[item.code] !== undefined)
    .sort((left, right) => order[left.code] - order[right.code]);
}

function getChoreoStatusBadgeInfo(code, count) {
  switch (`${code || ''}`.toUpperCase()) {
    case 'CRE':
      return { label: `${count}`, className: 'bg-primary' };
    case 'PEN':
      return { label: `${count}`, className: 'bg-warning text-dark' };
    case 'VAL':
      return { label: `${count}`, className: 'bg-success' };
    case 'REJ':
      return { label: `${count}`, className: 'bg-danger' };
    default:
      return { label: `${count}`, className: 'bg-secondary' };
  }
}

function getChoreoStatusLegendItems() {
  return [
    { dotClass: 'choreo-status-legend-tooltip-dot--dark', label: t('registration_choreo_status_legend_total', 'Number of choreos') },
    { dotClass: 'choreo-status-legend-tooltip-dot--primary', label: t('registration_choreo_status_legend_cre', 'In creation') },
    { dotClass: 'choreo-status-legend-tooltip-dot--warning', label: t('registration_choreo_status_legend_pen', 'Pending validation') },
    { dotClass: 'choreo-status-legend-tooltip-dot--success', label: t('registration_choreo_status_legend_val', 'Validated') },
    { dotClass: 'choreo-status-legend-tooltip-dot--danger', label: t('registration_choreo_status_legend_rej', 'Rejected') }
  ];
}

function buildChoreoStatusLegendTooltipHtml() {
  return `
    <div class="choreo-status-legend-tooltip">
      ${getChoreoStatusLegendItems().map((item) => `
        <div class="choreo-status-legend-tooltip-row">
          <span aria-hidden="true" class="choreo-status-legend-tooltip-dot ${item.dotClass}"></span>
          <span>${escapeRegistrationTooltipHtml(item.label)}</span>
        </div>
      `).join('')}
    </div>
  `.trim();
}

function getChoreoStatusLegendTooltipText() {
  return getChoreoStatusLegendItems()
    .map((item) => item.label)
    .join('. ');
}

function setChoreoStatusLegendTooltip(element) {
  if (!element) {
    return;
  }

  const tooltipText = getChoreoStatusLegendTooltipText();
  element.setAttribute('data-bs-toggle', 'tooltip');
  element.setAttribute('data-bs-placement', 'top');
  element.setAttribute('data-bs-html', 'true');
  element.setAttribute('data-bs-title', buildChoreoStatusLegendTooltipHtml());
  element.setAttribute('aria-label', tooltipText);
  element.style.cursor = 'help';
}

function buildChoreoStatusSummaryFromCounts(statusCounts = {}) {
  const parseCount = (value) => {
    const parsed = Number.parseInt(`${value ?? ''}`.trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return ['CRE', 'PEN', 'VAL', 'REJ']
    .map((code) => `${code}:${parseCount(statusCounts[code])}`)
    .join('|');
}

function createChoreoStatusBadges(status, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = options.className || 'd-flex flex-wrap gap-1';
  const showTotalBadge = options.showTotalBadge !== false;

  const choreoStatuses = parseChoreoStatusSummary(status);
  const computedTotalChoreoCount = choreoStatuses.reduce((sum, statusItem) => sum + (Number(statusItem.count) || 0), 0);
  const overrideTotal = Number(options.totalCountOverride);
  const totalChoreoCount = Number.isFinite(overrideTotal) ? overrideTotal : computedTotalChoreoCount;
  if (showTotalBadge) {
    const totalBadge = document.createElement('span');
    totalBadge.className = 'badge bg-dark';
    totalBadge.textContent = `${totalChoreoCount}`;
    wrap.appendChild(totalBadge);
  }

  if (!choreoStatuses.length) {
    const emptyBadge = document.createElement('span');
    emptyBadge.className = 'badge bg-danger';
    emptyBadge.textContent = t('registration_categories_choreo_status_none', 'NO REGISTRATIONS').toUpperCase();
    wrap.appendChild(emptyBadge);
    if (options.showLegendTooltip !== false) {
      setChoreoStatusLegendTooltip(wrap);
    }
    return wrap;
  }

  choreoStatuses.forEach((statusItem) => {
    const badge = document.createElement('span');
    const badgeInfo = getChoreoStatusBadgeInfo(statusItem.code, statusItem.count);
    badge.className = `badge ${badgeInfo.className}`;
    badge.textContent = badgeInfo.label;
    wrap.appendChild(badge);
  });

  if (options.showLegendTooltip !== false) {
    setChoreoStatusLegendTooltip(wrap);
  }

  return wrap;
}

function countSyncroStatuses(items, options = {}) {
  return (Array.isArray(items) ? items : []).reduce((summary, item) => {
    const status = `${item?.syncro_status || ''}`;
    if (status === 'NOT_APPLICABLE') {
      summary.notApplicable += 1;
    } else if (status === 'SYNCRO_OK') {
      summary.syncroOk += 1;
    } else if (status === 'PEN_UPDATE') {
      summary.pendingUpdate += 1;
    } else {
      summary.notSynchronized += 1;
    }
    return summary;
  }, {
    notSynchronized: 0,
    pendingUpdate: 0,
    syncroOk: 0,
    notApplicable: 0
  });
}

function hasPendingSyncWork(summary) {
  if (!summary || typeof summary !== 'object') return false;
  return summary.notSynchronized > 0 || summary.pendingUpdate > 0;
}

function renderEventSyncSummary(container, items, options = {}) {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  const summary = countSyncroStatuses(items, options);
  const total = summary.notSynchronized + summary.pendingUpdate + summary.syncroOk + summary.notApplicable;
  const rows = [
    { label: t('registration_categories_syncro_status_not', 'Not synchronized'), count: summary.notSynchronized, badgeClass: 'bg-secondary-subtle text-secondary-emphasis' },
    { label: t('registration_categories_syncro_status_pending', 'Pending update'), count: summary.pendingUpdate, badgeClass: 'bg-warning-subtle text-warning-emphasis' },
    { label: t('registration_categories_syncro_status_ok', 'Synchronized'), count: summary.syncroOk, badgeClass: 'bg-success-subtle text-success-emphasis' }
  ];
  if (options.includeNotApplicable) {
    rows.push({
      label: t('registration_categories_syncro_status_not_applicable', 'Not applicable'),
      count: summary.notApplicable,
      badgeClass: 'bg-info-subtle text-info-emphasis'
    });
  }

  const list = document.createElement('ul');
  list.className = 'list-group list-group-flush';

  rows.forEach((rowData) => {
    const row = document.createElement('li');
    row.className = 'list-group-item px-0 d-flex justify-content-between align-items-center';

    const label = document.createElement('span');
    label.textContent = rowData.label;
    row.appendChild(label);

    const badge = document.createElement('span');
    badge.className = `badge rounded-pill ${rowData.badgeClass}`;
    badge.textContent = `${rowData.count}`;
    row.appendChild(badge);

    list.appendChild(row);
  });

  container.appendChild(list);

  const info = document.createElement('div');
  info.className = total === 0
    ? 'small text-muted mt-3'
    : (summary.notSynchronized === 0 && summary.pendingUpdate === 0
      ? 'alert alert-success py-2 px-3 mt-3 mb-0'
      : 'small text-muted mt-3');
  info.textContent = total === 0
    ? t('event_sync_no_items', 'No items available yet.')
    : (summary.notSynchronized === 0 && summary.pendingUpdate === 0
      ? t('event_sync_all_good', 'All good. Nothing to sync here.')
      : t('event_sync_pending_work', 'There are still items pending review or synchronization.'));
  container.appendChild(info);

  return summary;
}

function getEventRegistrationStartDate() {
  return getRegistrationDayDate(getEvent()?.registrationStart);
}

function getEventRegistrationEndDate() {
  return getRegistrationDayDate(getEvent()?.registrationEnd);
}

function isEventRegistrationStillOpen() {
  const registrationStartDate = getEventRegistrationStartDate();
  const registrationEndDate = getEventRegistrationEndDate();
  if (!registrationStartDate || !registrationEndDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= registrationStartDate && today <= registrationEndDate;
}

function showEventSyncBeforeDeadlineModal() {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('eventSyncConfirmModal');
    const confirmBtn = document.getElementById('confirmEventSyncBtn');

    if (!modalEl || !confirmBtn) {
      resolve(false);
      return;
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let confirmed = false;

    const onConfirm = () => {
      confirmed = true;
      modal.hide();
    };

    const onHidden = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      modalEl.removeEventListener('hidden.bs.modal', onHidden);
      resolve(confirmed);
    };

    confirmBtn.addEventListener('click', onConfirm);
    modalEl.addEventListener('hidden.bs.modal', onHidden);
    modal.show();
  });
}

async function runEventSyncAction(syncTarget) {
  if (isEventRegistrationStillOpen()) {
    const confirmed = await showEventSyncBeforeDeadlineModal();
    if (!confirmed) return;
  }

  const buttonMap = {
    categories: document.getElementById('eventSyncCategoriesBtn'),
    styles: document.getElementById('eventSyncStylesBtn'),
    schools: document.getElementById('eventSyncSchoolsBtn'),
    registrations: document.getElementById('eventSyncRegistrationsBtn')
  };
  const elementMap = {
    categories: 'cat',
    styles: 'sty',
    schools: 'sch',
    registrations: 'reg'
  };

  const button = buttonMap[syncTarget] || null;
  const element = elementMap[syncTarget] || null;
  if (!element) return;

  const originalText = button?.textContent || t('event_sync_action_sync', 'Synchronize');
  let stateRefreshed = false;
  if (button) {
    button.disabled = true;
    button.textContent = t('loading', 'Loading...');
  }

  try {
    const res = await fetch(`${API_BASE_URL}${registrationSyncEndpoints.synchronization}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: Number(getEvent().id),
        element
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || t('event_sync_error_default', 'Error performing synchronization.'));
    }

    await Promise.allSettled([
      fetchRegistrationCategories({ force: true }),
      fetchRegistrationStyles({ force: true }),
      fetchEventSchools({ force: true }),
      fetchOrganizerRegistrationsForEvent()
    ]);

    notifyRegistrationConfigUpdate();
    notifyRegistrationSchoolsUpdate();
    notifyOrganizerRegistrationsUpdate();
    stateRefreshed = true;

    showMessageModal(
      data?.message || t('event_sync_success_default', 'Synchronization completed successfully.'),
      t('event_sync_success_title', 'Synchronization'),
      'success'
    );
  } catch (error) {
    showMessageModal(
      error?.message || t('event_sync_error_default', 'Error performing synchronization.'),
      t('error_title', 'Error')
    );
  } finally {
    if (button) {
      button.textContent = originalText;
      if (!stateRefreshed) {
        button.disabled = false;
      }
    }
  }
}

function initEventSyncTab() {
  const categoriesEl = document.getElementById('eventSyncCategoriesSummary');
  const stylesEl = document.getElementById('eventSyncStylesSummary');
  const schoolsEl = document.getElementById('eventSyncSchoolsSummary');
  const registrationsEl = document.getElementById('eventSyncRegistrationsSummary');
  const categoriesBtn = document.getElementById('eventSyncCategoriesBtn');
  const stylesBtn = document.getElementById('eventSyncStylesBtn');
  const schoolsBtn = document.getElementById('eventSyncSchoolsBtn');
  const registrationsBtn = document.getElementById('eventSyncRegistrationsBtn');
  const registrationsBtnWrapper = document.getElementById('eventSyncRegistrationsBtnWrapper');

  if (!categoriesEl || !stylesEl || !schoolsEl || !registrationsEl || !categoriesBtn || !stylesBtn || !schoolsBtn || !registrationsBtn || !registrationsBtnWrapper) {
    return;
  }

  let registrationsDisabledTooltip = null;

  const renderAll = () => {
    const categoriesSummary = renderEventSyncSummary(categoriesEl, registrationState.registrationCategories);
    const stylesSummary = renderEventSyncSummary(stylesEl, registrationState.registrationDisciplines);
    const schoolsSummary = renderEventSyncSummary(schoolsEl, registrationState.schools);
    const registrationsSummary = renderEventSyncSummary(registrationsEl, registrationState.organizerRegistrations, {
      includeNotApplicable: true
    });

    categoriesBtn.disabled = !hasPendingSyncWork(categoriesSummary);
    stylesBtn.disabled = !hasPendingSyncWork(stylesSummary);
    schoolsBtn.disabled = !hasPendingSyncWork(schoolsSummary);

    const hasBlockingItems = [categoriesSummary, stylesSummary, schoolsSummary].some(hasPendingSyncWork);
    const hasRegistrationsSyncWork = hasPendingSyncWork(registrationsSummary);
    registrationsBtn.disabled = hasBlockingItems || !hasRegistrationsSyncWork;

    if (hasBlockingItems) {
      registrationsBtnWrapper.setAttribute('data-bs-toggle', 'tooltip');
      registrationsBtnWrapper.setAttribute('data-bs-placement', 'top');
      registrationsBtnWrapper.setAttribute('data-bs-title', t('event_sync_registrations_disabled_tooltip', 'Registrations can only be synchronized when categories, styles, and schools are fully synchronized.'));
      registrationsBtnWrapper.tabIndex = 0;
      registrationsDisabledTooltip = bootstrap.Tooltip.getOrCreateInstance(registrationsBtnWrapper);
    } else if (registrationsDisabledTooltip) {
      registrationsDisabledTooltip.dispose();
      registrationsDisabledTooltip = null;
      registrationsBtnWrapper.removeAttribute('data-bs-toggle');
      registrationsBtnWrapper.removeAttribute('data-bs-placement');
      registrationsBtnWrapper.removeAttribute('data-bs-title');
      registrationsBtnWrapper.removeAttribute('data-bs-original-title');
      registrationsBtnWrapper.removeAttribute('tabindex');
    }
  };

  const loadAll = async () => {
    await Promise.allSettled([
      fetchRegistrationCategories(),
      fetchRegistrationStyles(),
      fetchEventSchools()
    ]);
    renderAll();
  };

  window.addEventListener('registration:config-updated', renderAll);
  window.addEventListener('registration:schools-updated', renderAll);
  window.addEventListener('registration:organizer-registrations-updated', renderAll);

  categoriesBtn.addEventListener('click', async () => {
    await runEventSyncAction('categories');
  });

  stylesBtn.addEventListener('click', async () => {
    await runEventSyncAction('styles');
  });

  schoolsBtn.addEventListener('click', async () => {
    await runEventSyncAction('schools');
  });

  registrationsBtn.addEventListener('click', async () => {
    if (registrationsBtn.disabled) return;
    await runEventSyncAction('registrations');
  });

  loadAll();
}

function initRegistrationCategoriesTab() {
  const tableBody = document.getElementById('registrationCategoriesTable');
  const emptyEl = document.getElementById('registrationCategoriesEmpty');
  const countEl = document.getElementById('registrationCategoriesCount');
  const feeCostEl = document.getElementById('registrationCategoriesFeeCost');
  const addBtn = document.getElementById('registrationCategoryAddBtn');
  const modalEl = document.getElementById('registrationCategoryModal');
  const deleteModalEl = document.getElementById('registrationCategoryDeleteModal');

  if (!tableBody || !modalEl || !deleteModalEl) {
    return;
  }

  const form = document.getElementById('registrationCategoryForm');
  const elements = {
    id: document.getElementById('registrationCategoryId'),
    name: document.getElementById('registrationCategoryName'),
    minPar: document.getElementById('registrationCategoryMinPar'),
    maxPar: document.getElementById('registrationCategoryMaxPar'),
    minYears: document.getElementById('registrationCategoryMinYears'),
    maxYears: document.getElementById('registrationCategoryMaxYears'),
    maxOutOfRange: document.getElementById('registrationCategoryMaxOutOfRange'),
    maxOutOfRangeInfo: modalEl.querySelector('[data-bs-toggle="tooltip"]'),
    musicMaxDuration: document.getElementById('registrationCategoryMusicMaxDuration'),
    price: document.getElementById('registrationCategoryPrice'),
    modalTitle: document.getElementById('registrationCategoryModalTitle'),
    saveBtn: document.getElementById('registrationCategorySaveBtn'),
    deleteMessage: document.getElementById('registrationCategoryDeleteMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteRegistrationCategoryBtn')
  };

  const categoryModal = new bootstrap.Modal(modalEl);
  const deleteModal = new bootstrap.Modal(deleteModalEl);
  const maxOutOfRangeTooltip = elements.maxOutOfRangeInfo
    ? bootstrap.Tooltip.getOrCreateInstance(elements.maxOutOfRangeInfo)
    : null;
  let categoryToDelete = null;
  let categoriesTooltipInstances = [];
  const requiredFields = [
    elements.name,
    elements.minPar,
    elements.maxPar,
    elements.minYears,
    elements.maxYears,
    elements.musicMaxDuration
  ];
  const validationFields = [
    elements.name,
    elements.minPar,
    elements.maxPar,
    elements.minYears,
    elements.maxYears,
    elements.maxOutOfRange,
    elements.musicMaxDuration,
    elements.price
  ].filter(Boolean);

  const normalizeNumber = (value) => {
    const raw = `${value ?? ''}`.trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const syncCategoryRequiredFields = () => {
    requiredFields.forEach((field) => {
      if (field) field.required = true;
    });

    if (elements.maxOutOfRange) elements.maxOutOfRange.required = false;
    if (elements.price) elements.price.required = false;
  };

  const clearCategoryValidationState = () => {
    validationFields.forEach((field) => {
      field.classList.remove('is-invalid', 'is-valid');
      field.removeAttribute('aria-invalid');
    });
  };

  const setCategoryFieldInvalidState = (field, isInvalid) => {
    if (!field) return;
    field.classList.toggle('is-invalid', isInvalid);
    field.classList.remove('is-valid');
    if (isInvalid) {
      field.setAttribute('aria-invalid', 'true');
    } else {
      field.removeAttribute('aria-invalid');
    }
  };

  const getLanguage = () => getCurrentAppLanguage?.() || document.documentElement.getAttribute('lang') || 'es';

  const formatDurationValue = (value) => {
    const totalSeconds = Math.round(Number(value));
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const parseDurationValue = (value) => {
    const raw = `${value ?? ''}`.trim();
    if (!raw) return null;

    if (/^\d+$/.test(raw)) {
      const totalSeconds = Number(raw);
      return Number.isFinite(totalSeconds) ? totalSeconds : null;
    }

    const match = raw.match(/^(\d+):(\d{1,2})$/);
    if (!match) return null;

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) {
      return null;
    }

    return (minutes * 60) + seconds;
  };

  const syncDurationFieldValidity = () => {
    if (!elements.musicMaxDuration) return true;
    const raw = `${elements.musicMaxDuration.value ?? ''}`.trim();
    const isValid = !raw || parseDurationValue(raw) !== null;
    elements.musicMaxDuration.setCustomValidity(
      isValid ? '' : t('registration_categories_field_music_max_duration_invalid', 'Use mm:ss format.')
    );
    return isValid;
  };

  const normalizeDurationFieldDisplay = () => {
    if (!elements.musicMaxDuration) return;
    const totalSeconds = parseDurationValue(elements.musicMaxDuration.value);
    if (totalSeconds === null) return;
    elements.musicMaxDuration.value = formatDurationValue(totalSeconds);
  };

  const validateCategoryField = (field) => {
    if (!field) return true;

    if (field === elements.musicMaxDuration) {
      syncDurationFieldValidity();
    }

    const rawValue = `${field.value ?? ''}`.trim();
    const shouldValidate = field.required || rawValue !== '';
    const isValid = shouldValidate ? field.checkValidity() : true;
    setCategoryFieldInvalidState(field, !isValid);
    return isValid;
  };

  const validateCategoryForm = () => {
    syncCategoryRequiredFields();

    let firstInvalidField = null;
    validationFields.forEach((field) => {
      const isValid = validateCategoryField(field);
      if (!isValid && !firstInvalidField) {
        firstInvalidField = field;
      }
    });

    if (firstInvalidField) {
      firstInvalidField.focus();
      return false;
    }

    return true;
  };

  const formatCentsToCurrencyValue = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const cents = Number(value);
    if (!Number.isFinite(cents)) return '';
    return (cents / 100).toFixed(2);
  };

  const parseCurrencyValueToCents = (value) => {
    const normalized = String(value ?? '').replace(',', '.').trim();
    if (!normalized) return null;
    const amount = Number(normalized);
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount * 100);
  };

  const formatCurrencyDisplay = (value) => {
    const cents = Number(value);
    if (!Number.isFinite(cents)) return '-';
    return new Intl.NumberFormat(getLanguage(), {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(cents / 100);
  };

  const setFormValues = (category = {}) => {
    if (elements.id) elements.id.value = category?.id ?? '';
    if (elements.name) elements.name.value = category?.name ?? '';
    if (elements.minPar) elements.minPar.value = category?.min_par ?? '';
    if (elements.maxPar) elements.maxPar.value = category?.max_par ?? '';
    if (elements.minYears) elements.minYears.value = category?.min_years ?? '';
    if (elements.maxYears) elements.maxYears.value = category?.max_years ?? '';
    if (elements.maxOutOfRange) elements.maxOutOfRange.value = category?.max_outofrange ?? '';
    if (elements.musicMaxDuration) elements.musicMaxDuration.value = formatDurationValue(category?.music_max_duration);
    if (elements.price) elements.price.value = formatCentsToCurrencyValue(category?.registration_price);
    syncDurationFieldValidity();
  };

  const openCategoryModal = (mode, category = null) => {
    if (!form) return;
    syncCategoryRequiredFields();
    form.dataset.mode = mode;
    form.classList.remove('was-validated');
    clearCategoryValidationState();

    if (mode === 'edit') {
      if (elements.modalTitle) {
        elements.modalTitle.textContent = t('registration_categories_modal_edit', 'Editar categoria');
      }
      setFormValues(category || {});
    } else {
      if (elements.modalTitle) {
        elements.modalTitle.textContent = t('registration_categories_modal_create', 'Nueva categoria');
      }
      setFormValues({});
    }

    categoryModal.show();
  };

  const renderCategories = () => {
    categoriesTooltipInstances = disposeTooltipInstances(categoriesTooltipInstances);
    tableBody.innerHTML = '';
    const categories = Array.isArray(registrationState.registrationCategories)
      ? registrationState.registrationCategories
      : [];

    if (countEl) {
      countEl.textContent = `${categories.length}`;
    }
    if (feeCostEl) {
      feeCostEl.textContent = formatCurrencyDisplay(getEvent()?.registrationFeeCost ?? 0);
    }

    if (!categories.length) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    if (emptyEl) emptyEl.classList.add('d-none');

    const editTitle = t('edit', 'Edit');
    const deleteTitle = t('delete', 'Delete');

    categories.forEach(category => {
      const row = document.createElement('tr');
      row.dataset.id = category.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = category.name || '-';
      row.appendChild(nameCell);

      const minParCell = document.createElement('td');
      minParCell.className = 'text-center';
      minParCell.textContent = category.min_par ?? '-';
      row.appendChild(minParCell);

      const maxParCell = document.createElement('td');
      maxParCell.className = 'text-center';
      maxParCell.textContent = category.max_par ?? '-';
      row.appendChild(maxParCell);

      const minYearsCell = document.createElement('td');
      minYearsCell.className = 'text-center';
      minYearsCell.textContent = category.min_years ?? '-';
      row.appendChild(minYearsCell);

      const maxYearsCell = document.createElement('td');
      maxYearsCell.className = 'text-center';
      maxYearsCell.textContent = category.max_years ?? '-';
      row.appendChild(maxYearsCell);

      const maxOutOfRangeCell = document.createElement('td');
      maxOutOfRangeCell.className = 'text-center';
      maxOutOfRangeCell.textContent = category.max_outofrange ?? '-';
      row.appendChild(maxOutOfRangeCell);

      const musicMaxCell = document.createElement('td');
      musicMaxCell.className = 'text-center';
      musicMaxCell.textContent = formatDurationValue(category.music_max_duration) || '-';
      row.appendChild(musicMaxCell);

      const priceCell = document.createElement('td');
      priceCell.className = 'text-center';
      priceCell.textContent = category.registration_price != null
        ? formatCurrencyDisplay(category.registration_price)
        : '-';
      row.appendChild(priceCell);

      const choreoStatusCell = document.createElement('td');
      choreoStatusCell.className = 'text-start';
      choreoStatusCell.appendChild(createChoreoStatusBadges(category.choreo_status, {
        className: 'd-flex flex-wrap justify-content-start gap-1'
      }));
      row.appendChild(choreoStatusCell);

      const syncroCell = document.createElement('td');
      syncroCell.className = 'text-center';
      const syncroBadge = document.createElement('span');
      const syncroInfo = getSyncroStatusBadgeInfo(category.syncro_status);
      syncroBadge.className = `badge ${syncroInfo.className}`;
      syncroBadge.textContent = syncroInfo.label;
      syncroCell.appendChild(syncroBadge);
      row.appendChild(syncroCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-outline-primary btn-sm btn-registration-category-edit';
      editBtn.dataset.id = category.id;
      editBtn.title = editTitle;
      editBtn.setAttribute('aria-label', editTitle);
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm btn-registration-category-delete';
      deleteBtn.dataset.id = category.id;
      deleteBtn.title = deleteTitle;
      deleteBtn.setAttribute('aria-label', deleteTitle);
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';

      actionGroup.appendChild(editBtn);
      actionGroup.appendChild(deleteBtn);
      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });

    categoriesTooltipInstances = initTooltipInstances(tableBody);
  };

  const showCategoriesError = (message) => {
    categoriesTooltipInstances = disposeTooltipInstances(categoriesTooltipInstances);
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 11;
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    if (emptyEl) emptyEl.classList.add('d-none');
    if (countEl) countEl.textContent = '0';
  };

  const loadCategories = async () => {
    try {
      await fetchRegistrationCategories();
      notifyRegistrationConfigUpdate();
      renderCategories();
    } catch (err) {
      showCategoriesError(err.message || t('registration_categories_load_error', 'Error loading categories.'));
    }
  };

  const saveCategory = async () => {
    if (!form) return;
    if (!validateCategoryForm()) {
      return;
    }

    if (syncDurationFieldValidity()) {
      normalizeDurationFieldDisplay();
    }

    if (elements.saveBtn) {
      elements.saveBtn.disabled = true;
    }

    const originalText = elements.saveBtn ? elements.saveBtn.textContent : '';
    if (elements.saveBtn) {
      elements.saveBtn.textContent = t('saving', 'Guardando...');
    }

    const payload = {
      event_id: getEvent()?.id,
      name: elements.name ? elements.name.value.trim() : '',
      min_par: normalizeNumber(elements.minPar?.value),
      max_par: normalizeNumber(elements.maxPar?.value),
      min_years: normalizeNumber(elements.minYears?.value),
      max_years: normalizeNumber(elements.maxYears?.value),
      max_outofrange: normalizeNumber(elements.maxOutOfRange?.value),
      music_max_duration: parseDurationValue(elements.musicMaxDuration?.value),
      registration_price: parseCurrencyValueToCents(elements.price?.value)
    };

    if (!payload.event_id) delete payload.event_id;

    const isEdit = form.dataset.mode === 'edit';
    const categoryId = elements.id ? elements.id.value : '';
    if (isEdit && categoryId) {
      payload.id = categoryId;
    }

    const url = isEdit && categoryId
      ? `${API_BASE_URL}/api/registrations/categories/${categoryId}`
      : `${API_BASE_URL}/api/registrations/categories`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_categories_save_error', 'Error saving category.');
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (parseErr) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      categoryModal.hide();
      await fetchRegistrationCategories({ force: true });
      notifyRegistrationConfigUpdate();
      renderCategories();
    } catch (err) {
      showMessageModal(err.message || t('registration_categories_save_error', 'Error saving category.'), t('error_title', 'Error'));
    } finally {
      if (elements.saveBtn) {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = originalText;
      }
    }
  };

  const deleteCategory = async () => {
    if (!categoryToDelete) return;

    if (elements.confirmDeleteBtn) {
      elements.confirmDeleteBtn.disabled = true;
    }

    try {
      const payload = {
        event_id: getEvent()?.id
      };
      if (!payload.event_id) delete payload.event_id;

      const res = await fetch(`${API_BASE_URL}/api/registrations/categories/${categoryToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_categories_delete_error', 'Error deleting category.');
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (parseErr) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      deleteModal.hide();
      await fetchRegistrationCategories({ force: true });
      notifyRegistrationConfigUpdate();
      renderCategories();
    } catch (err) {
      showMessageModal(err.message || t('registration_categories_delete_error', 'Error deleting category.'), t('error_title', 'Error'));
    } finally {
      if (elements.confirmDeleteBtn) {
        elements.confirmDeleteBtn.disabled = false;
      }
      categoryToDelete = null;
    }
  };

  if (addBtn) {
    addBtn.addEventListener('click', () => openCategoryModal('create'));
  }

  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', saveCategory);
  }

  if (elements.confirmDeleteBtn) {
    elements.confirmDeleteBtn.addEventListener('click', deleteCategory);
  }

  tableBody.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.btn-registration-category-edit');
    const deleteBtn = event.target.closest('.btn-registration-category-delete');

    if (editBtn) {
      const category = registrationState.registrationCategories.find(item => `${item.id}` === `${editBtn.dataset.id}`);
      if (category) {
        openCategoryModal('edit', category);
      }
      return;
    }

    if (!deleteBtn) return;
    const category = registrationState.registrationCategories.find(item => `${item.id}` === `${deleteBtn.dataset.id}`);
    if (!category) return;

    categoryToDelete = category;
    if (elements.deleteMessage) {
      const message = `${t('registration_categories_delete_question', 'Seguro que deseas eliminar la categoria')} "${category.name || ''}"?`;
      elements.deleteMessage.textContent = message;
    }
    deleteModal.show();
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    maxOutOfRangeTooltip?.hide();
    if (!form) return;
    form.classList.remove('was-validated');
    form.dataset.mode = 'create';
    clearCategoryValidationState();
  });

  validationFields.forEach((field) => {
    field.addEventListener('input', () => {
      validateCategoryField(field);
    });
    field.addEventListener('blur', () => {
      validateCategoryField(field);
    });
  });

  elements.musicMaxDuration?.addEventListener('input', syncDurationFieldValidity);
  elements.musicMaxDuration?.addEventListener('blur', () => {
    if (syncDurationFieldValidity()) {
      normalizeDurationFieldDisplay();
    }
  });

  window.addEventListener('beforeunload', () => {
    categoriesTooltipInstances = disposeTooltipInstances(categoriesTooltipInstances);
  });

  syncCategoryRequiredFields();
  loadCategories();
}

function initRegistrationDisciplinesTab() {
  const listEl = document.getElementById('list-registration-disciplines');
  const countEl = document.getElementById('count-registration-disciplines');
  const inputEl = document.getElementById('input-registration-disciplines');
  const addBtn = document.getElementById('registrationDisciplinesAddBtn');
  const deleteModalEl = document.getElementById('registrationDisciplineDeleteModal');

  if (!listEl || !inputEl || !addBtn || !deleteModalEl) {
    return;
  }

  const elements = {
    deleteMessage: document.getElementById('registrationDisciplineDeleteMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteRegistrationDisciplineBtn')
  };

  const deleteModal = new bootstrap.Modal(deleteModalEl);
  let disciplineToDelete = null;
  let sortableInstance = null;
  let disciplinesTooltipInstances = [];

  const renderDisciplines = () => {
    disciplinesTooltipInstances = disposeTooltipInstances(disciplinesTooltipInstances);
    listEl.innerHTML = '';
    const disciplines = Array.isArray(registrationState.registrationDisciplines)
      ? [...registrationState.registrationDisciplines]
      : [];

    disciplines.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
    registrationState.registrationDisciplines = disciplines;

    disciplines.forEach(discipline => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.dataset.id = discipline.id;

      const leftDiv = document.createElement('div');
      leftDiv.className = 'd-flex align-items-center gap-2';

      const dragHandle = document.createElement('i');
      dragHandle.className = 'bi bi-grip-vertical text-muted drag-handle';
      dragHandle.style.cursor = 'grab';
      leftDiv.appendChild(dragHandle);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = discipline.name || '-';
      leftDiv.appendChild(nameSpan);

      li.appendChild(leftDiv);

      const rightDiv = document.createElement('div');
      rightDiv.className = 'd-flex align-items-center gap-2 ms-3 flex-wrap';

      rightDiv.appendChild(createChoreoStatusBadges(discipline.choreo_status, {
        className: 'd-flex flex-wrap justify-content-start gap-1'
      }));

      const syncroBadge = document.createElement('span');
      const syncroInfo = getSyncroStatusBadgeInfo(discipline.syncro_status);
      syncroBadge.className = `badge ${syncroInfo.className}`;
      syncroBadge.textContent = syncroInfo.label;
      rightDiv.appendChild(syncroBadge);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-link text-danger p-0';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.addEventListener('click', () => {
        disciplineToDelete = discipline;
        if (elements.deleteMessage) {
          const message = `${t('registration_disciplines_delete_question', 'Seguro que deseas eliminar la disciplina')} "${discipline.name || ''}"?`;
          elements.deleteMessage.textContent = message;
        }
        deleteModal.show();
      });

      rightDiv.appendChild(deleteBtn);
      li.appendChild(rightDiv);
      listEl.appendChild(li);
    });

    disciplinesTooltipInstances = initTooltipInstances(listEl);

    if (countEl) {
      countEl.textContent = `${disciplines.length}`;
    }

    if (!sortableInstance && window.Sortable) {
      sortableInstance = new Sortable(listEl, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: async () => {
          const items = Array.from(listEl.children).map((li, idx) => ({
            id: li.dataset.id,
            position: idx + 1
          }));

          const disciplineById = new Map(
            registrationState.registrationDisciplines.map(item => [`${item.id}`, item])
          );
          registrationState.registrationDisciplines = items.map(item => ({
            ...(disciplineById.get(`${item.id}`) || { id: item.id }),
            position: item.position
          }));
          notifyRegistrationConfigUpdate();

          try {
            const res = await fetch(`${API_BASE_URL}/api/registrations/styles/reorder`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items })
            });

            if (!res.ok) {
              const error = await res.json();
              console.error('Error reordering disciplines:', error);
              return;
            }

            await fetchRegistrationStyles({ force: true });
            renderDisciplines();
            notifyRegistrationConfigUpdate();
          } catch (err) {
            console.error('Unexpected reorder error:', err);
          }
        }
      });
    }
  };

  const showDisciplinesError = (message) => {
    disciplinesTooltipInstances = disposeTooltipInstances(disciplinesTooltipInstances);
    listEl.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'list-group-item text-danger';
    li.textContent = message;
    listEl.appendChild(li);
    if (countEl) {
      countEl.textContent = '0';
    }
  };

  const loadDisciplines = async () => {
    try {
      await fetchRegistrationStyles();
      renderDisciplines();
      notifyRegistrationConfigUpdate();
    } catch (err) {
      showDisciplinesError(err.message || t('registration_disciplines_load_error', 'Error loading disciplines.'));
    }
  };

  const addDiscipline = async () => {
    const value = inputEl.value.trim();
    if (!value) {
      inputEl.focus();
      return;
    }

    addBtn.disabled = true;
    const originalText = addBtn.textContent;
    addBtn.textContent = t('saving', 'Guardando...');

    try {
      const payload = { name: value };
      const eventIdValue = getEvent()?.id;
      if (eventIdValue) {
        payload.event_id = eventIdValue;
      }
      const res = await fetch(`${API_BASE_URL}/api/registrations/styles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_disciplines_save_error', 'Error saving discipline.');
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (parseErr) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      inputEl.value = '';
      await fetchRegistrationStyles({ force: true });
      renderDisciplines();
      notifyRegistrationConfigUpdate();
    } catch (err) {
      showMessageModal(err.message || t('registration_disciplines_save_error', 'Error saving discipline.'), t('error_title', 'Error'));
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = originalText;
      inputEl.focus();
    }
  };

  const deleteDiscipline = async () => {
    if (!disciplineToDelete) return;

    if (elements.confirmDeleteBtn) {
      elements.confirmDeleteBtn.disabled = true;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/registrations/styles/${disciplineToDelete.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        let errorMessage = t('registration_disciplines_delete_error', 'Error deleting discipline.');
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (parseErr) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      deleteModal.hide();
      await fetchRegistrationStyles({ force: true });
      renderDisciplines();
      notifyRegistrationConfigUpdate();
    } catch (err) {
      showMessageModal(err.message || t('registration_disciplines_delete_error', 'Error deleting discipline.'), t('error_title', 'Error'));
    } finally {
      if (elements.confirmDeleteBtn) {
        elements.confirmDeleteBtn.disabled = false;
      }
      disciplineToDelete = null;
    }
  };

  addBtn.addEventListener('click', addDiscipline);
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDiscipline();
    }
  });

  if (elements.confirmDeleteBtn) {
    elements.confirmDeleteBtn.addEventListener('click', deleteDiscipline);
  }

  window.addEventListener('beforeunload', () => {
    disciplinesTooltipInstances = disposeTooltipInstances(disciplinesTooltipInstances);
  });

  loadDisciplines();
}

function initOrganizerRegistrationsTab() {
  const tableBody = document.getElementById('orgRegistrationsTable');
  const emptyEl = document.getElementById('orgRegistrationsEmpty');
  const countEl = document.getElementById('orgRegistrationsCount');
  const totalAmountEl = document.getElementById('orgRegistrationsTotalAmount');
  const paidAmountEl = document.getElementById('orgRegistrationsPaidAmount');
  const pendingAmountEl = document.getElementById('orgRegistrationsPendingAmount');
  const filterForm = document.getElementById('orgRegistrationsFilters');
  const filterSchool = document.getElementById('orgRegistrationsFilterSchool');
  const filterStatus = document.getElementById('orgRegistrationsFilterStatus');
  const filterCategory = document.getElementById('orgRegistrationsFilterCategory');
  const filterStyle = document.getElementById('orgRegistrationsFilterStyle');
  const filterClear = document.getElementById('orgRegistrationsFilterClear');
  const copyTsvBtn = document.getElementById('orgRegistrationsCopyTsvBtn');
  const modalEl = document.getElementById('registrationModal');
  const membersModalEl = document.getElementById('registrationMembersModal');
  const validateModalEl = document.getElementById('orgRegistrationValidateModal');
  const rejectModalEl = document.getElementById('orgRegistrationRejectModal');

  if (!tableBody || !emptyEl || !filterForm || !filterSchool || !filterStatus || !filterCategory || !filterStyle || !modalEl || !membersModalEl || !validateModalEl || !rejectModalEl) {
    return;
  }

  const registrationEndpoints = {
    list: '/api/registrations/choreographies',
    music: (id) => `/api/registrations/choreographies/${id}/music`,
    musicDownload: (id) => `/api/registrations/choreographies/${id}/music/download`,
    musicValidate: (id) => `/api/registrations/choreographies/${id}/music/validate`,
    payment: (id) => `/api/registrations/choreographies/${id}/payment`,
    paymentView: (id) => `/api/registrations/choreographies/${id}/payment/view`,
    paymentDownload: (id) => `/api/registrations/choreographies/${id}/payment/download`,
    paymentValidate: (id) => `/api/registrations/choreographies/${id}/payment/validate`,
    validate: (id) => `/api/registrations/choreographies/${id}/validate`,
    reject: (id) => `/api/registrations/choreographies/${id}/reject`
  };

  const form = document.getElementById('registrationForm');
  const modalElements = {
    id: document.getElementById('registrationId'),
    choreographyName: document.getElementById('choreographyName'),
    participantsCountAddon: document.getElementById('registrationParticipantsCountAddon'),
    choreographer: document.getElementById('choreographerName'),
    category: document.getElementById('registrationCategory'),
    style: document.getElementById('registrationStyle'),
    observations: document.getElementById('registrationObservations'),
    statusWrapper: document.getElementById('registrationStatusWrapper'),
    statusBadge: document.getElementById('registrationStatusBadge'),
    musicStatusWrapper: document.getElementById('registrationMusicStatusWrapper'),
    musicStatusBadge: document.getElementById('registrationMusicStatusBadge'),
    paymentStatusWrapper: document.getElementById('registrationPaymentStatusWrapper'),
    paymentStatusBadge: document.getElementById('registrationPaymentStatusBadge'),
    totalAmountWrapper: document.getElementById('registrationTotalAmountWrapper'),
    totalAmountValue: document.getElementById('registrationTotalAmountValue'),
    rejectWrapper: document.getElementById('registrationRejectReasonWrapper'),
    rejectReason: document.getElementById('registrationRejectReason'),
    modalTitle: document.getElementById('registrationModalTitle'),
    saveBtn: document.getElementById('registrationSaveBtn')
  };
  const validationElements = {
    validateConfirmBtn: document.getElementById('confirmOrgRegistrationValidateBtn'),
    rejectConfirmBtn: document.getElementById('confirmOrgRegistrationRejectBtn'),
    rejectReason: document.getElementById('orgRegistrationRejectReason')
  };
  const audioElements = {
    section: document.getElementById('registrationAudioSection'),
    uploadControls: document.getElementById('registrationAudioUploadControls'),
    name: document.getElementById('registrationAudioName'),
    duration: document.getElementById('registrationAudioDuration'),
    size: document.getElementById('registrationAudioSize'),
    max: document.getElementById('registrationAudioMax'),
    error: document.getElementById('registrationAudioError'),
    removeBtn: document.getElementById('registrationAudioRemoveBtn'),
    saveBtn: document.getElementById('registrationAudioSaveBtn'),
    downloadBtn: document.getElementById('registrationAudioDownloadBtn'),
    validateBtn: document.getElementById('registrationAudioValidateBtn')
  };
  const paymentElements = {
    section: document.getElementById('registrationPaymentSection'),
    name: document.getElementById('registrationPaymentName'),
    size: document.getElementById('registrationPaymentSize'),
    viewBtn: document.getElementById('registrationPaymentViewBtn'),
    downloadBtn: document.getElementById('registrationPaymentDownloadBtn'),
    validateBtn: document.getElementById('registrationPaymentValidateBtn')
  };
  const registrationModal = new bootstrap.Modal(modalEl);
  const membersModal = new bootstrap.Modal(membersModalEl);
  const validateModal = new bootstrap.Modal(validateModalEl);
  const rejectModal = new bootstrap.Modal(rejectModalEl);

  const membersElements = {
    table: document.getElementById('registrationMembersTable'),
    count: document.getElementById('registrationMembersCount'),
    empty: document.getElementById('registrationMembersEmpty'),
    ruleInfo: document.getElementById('registrationMembersRuleInfo'),
    choreo: document.getElementById('registrationMembersChoreo'),
    category: document.getElementById('registrationMembersCategory'),
    style: document.getElementById('registrationMembersStyle'),
    participantSelect: document.getElementById('registrationParticipantSelect'),
    addMemberBtn: document.getElementById('addRegistrationMemberBtn'),
    ageInfoBtn: document.getElementById('registrationMembersAgeInfoBtn'),
    genderHeader: document.querySelector('#registrationMembersModal th[data-i18n="registration_competitions_member_gender"]'),
    saveBtn: document.getElementById('registrationMembersSaveBtn'),
    actionsHeader: document.querySelector('#registrationMembersModal th[data-i18n="registration_competitions_member_actions"]')
  };

  let categoryById = new Map();
  let styleById = new Map();
  let validationTarget = null;
  let rejectTarget = null;
  let detailRegistration = null;
  let registrationsTooltipInstances = [];
  const paymentValidateBtnLabel = paymentElements.validateBtn ? paymentElements.validateBtn.textContent : '';

  const populateSelect = (selectEl, items) => {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value=""></option>';
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id ?? item.value ?? '';
      option.textContent = item.name ?? item.label ?? '';
      selectEl.appendChild(option);
    });
  };

  const ensureRegistrationCategories = async () => {
    return fetchRegistrationCategories();
  };

  const ensureRegistrationStyles = async () => {
    return fetchRegistrationStyles();
  };

  const loadRegistrationConfig = async () => {
    const categories = await ensureRegistrationCategories();
    const styles = await ensureRegistrationStyles();
    const orderedStyles = [...styles].sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

    categoryById = new Map(categories.map(item => [`${item.id}`, item]));
    styleById = new Map(orderedStyles.map(item => [`${item.id}`, item]));

    const selectedFilterCategory = filterCategory.value;
    const selectedFilterStyle = filterStyle.value;
    const selectedModalCategory = modalElements.category?.value || '';
    const selectedModalStyle = modalElements.style?.value || '';

    populateSelect(filterCategory, categories);
    populateSelect(filterStyle, orderedStyles);
    populateSelect(modalElements.category, categories);
    populateSelect(modalElements.style, orderedStyles);

    if (selectedFilterCategory) filterCategory.value = selectedFilterCategory;
    if (selectedFilterStyle) filterStyle.value = selectedFilterStyle;
    if (modalElements.category && selectedModalCategory) modalElements.category.value = selectedModalCategory;
    if (modalElements.style && selectedModalStyle) modalElements.style.value = selectedModalStyle;
  };

  const loadSchools = async () => {
    try {
      const schools = await fetchEventSchools();
      filterSchool.innerHTML = '<option value=""></option>';
      schools.forEach(school => {
        const option = document.createElement('option');
        option.value = school.id;
        option.textContent = school?.name || school?.school_name || '-';
        filterSchool.appendChild(option);
      });
    } catch (err) {
      // keep filters but allow list to load
    }
  };

  const normalizeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getLanguage = () => getCurrentAppLanguage?.() || document.documentElement.getAttribute('lang') || 'es';

  const formatCurrencyDisplay = (value) => {
    const cents = normalizeNumber(value);
    const amount = (cents ?? 0) / 100;
    return new Intl.NumberFormat(getLanguage(), {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getRegistrationTotalAmount = (registration) => {
    const directAmount = normalizeNumber(
      registration?.total_amount
      ?? registration?.totalAmount
      ?? registration?.amount_total
    );

    if (directAmount !== null) {
      return directAmount;
    }

    const categoryId = registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '';
    const category = categoryById.get(`${categoryId}`) || null;
    const categoryPrice = normalizeNumber(category?.registration_price) ?? 0;
    const feeCost = normalizeNumber(getEvent()?.registrationFeeCost) ?? 0;
    return (feeCost + categoryPrice) * getParticipantsCount(registration);
  };

  const isPaymentValidated = (registration) => isRegistrationFlagEnabled(registration?.payment_validated);

  const safeJson = async (res) => {
    try {
      return await res.json();
    } catch (err) {
      return null;
    }
  };

  const formatDuration = (value) => {
    const totalSeconds = Math.round(Number(value));
    if (!Number.isFinite(totalSeconds)) return '-';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const disposeRegistrationsTooltips = () => {
    registrationsTooltipInstances.forEach((instance) => instance.dispose());
    registrationsTooltipInstances = [];
  };

  const initRegistrationsTooltips = () => {
    disposeRegistrationsTooltips();
    const tooltipElements = tableBody.querySelectorAll('[data-bs-toggle="tooltip"]');
    registrationsTooltipInstances = Array.from(tooltipElements).map((element) =>
      new bootstrap.Tooltip(element)
    );
  };

  const getEventIdValue = () => getEvent()?.id;

  const getMusicUrl = (registrationId) => {
    const eventIdValue = getEventIdValue();
    return eventIdValue
      ? `${API_BASE_URL}${registrationEndpoints.music(registrationId)}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${registrationEndpoints.music(registrationId)}`;
  };

  const getMusicDownloadUrl = (registrationId) => {
    const eventIdValue = getEventIdValue();
    return eventIdValue
      ? `${API_BASE_URL}${registrationEndpoints.musicDownload(registrationId)}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${registrationEndpoints.musicDownload(registrationId)}`;
  };

  const getPaymentUrl = (registrationId) => {
    return buildActionUrl(registrationEndpoints.payment(registrationId));
  };

  const getPaymentViewUrl = (registrationId) => {
    return buildActionUrl(registrationEndpoints.paymentView(registrationId));
  };

  const getPaymentDownloadUrl = (registrationId) => {
    return buildActionUrl(registrationEndpoints.paymentDownload(registrationId));
  };

  const buildActionUrl = (endpoint) => {
    const eventIdValue = getEventIdValue();
    return eventIdValue
      ? `${API_BASE_URL}${endpoint}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${endpoint}`;
  };

  const setAudioSectionVisible = (visible) => {
    if (!audioElements.section) return;
    audioElements.section.classList.toggle('d-none', !visible);
  };

  const setPaymentSectionVisible = (visible) => {
    if (!paymentElements.section) return;
    paymentElements.section.classList.toggle('d-none', !visible);
  };

  const setAudioViewMode = (isViewOnly) => {
    if (audioElements.uploadControls) {
      audioElements.uploadControls.classList.toggle('d-none', isViewOnly);
    }
    if (audioElements.removeBtn) {
      audioElements.removeBtn.classList.toggle('d-none', isViewOnly);
    }
    if (audioElements.saveBtn) {
      audioElements.saveBtn.classList.toggle('d-none', isViewOnly);
    }
    if (audioElements.validateBtn) {
      audioElements.validateBtn.classList.toggle('d-none', !isViewOnly);
      if (!isViewOnly) {
        audioElements.validateBtn.disabled = true;
      }
    }
    if (audioElements.error) {
      audioElements.error.classList.add('d-none');
      audioElements.error.textContent = '';
    }
  };

  const setAudioDownloadState = (hasAudio, url, filename) => {
    if (!audioElements.downloadBtn) return;
    audioElements.downloadBtn.classList.toggle('d-none', !hasAudio);
    if (!hasAudio) {
      audioElements.downloadBtn.href = '#';
      audioElements.downloadBtn.removeAttribute('download');
      audioElements.downloadBtn.setAttribute('aria-disabled', 'true');
      audioElements.downloadBtn.tabIndex = -1;
      return;
    }
    audioElements.downloadBtn.href = url || '#';
    if (filename) {
      audioElements.downloadBtn.setAttribute('download', filename);
    } else {
      audioElements.downloadBtn.removeAttribute('download');
    }
    audioElements.downloadBtn.setAttribute('aria-disabled', 'false');
    audioElements.downloadBtn.tabIndex = 0;
  };

  const resetAudioInfo = () => {
    if (audioElements.name) audioElements.name.textContent = '-';
    if (audioElements.duration) audioElements.duration.textContent = '-';
    if (audioElements.size) audioElements.size.textContent = '-';
    setAudioDownloadState(false);
  };

  const updateAudioMaxDuration = (categoryId = null) => {
    const category = categoryId ? categoryById.get(`${categoryId}`) : null;
    const maxDuration = normalizeNumber(category?.music_max_duration);
    if (!audioElements.max) return;
    audioElements.max.textContent = maxDuration == null
      ? '-'
      : `${formatDuration(maxDuration)} (+${getEvent().musicExtraTime || 0} sec extra)`;
  };

  const extractPaymentInfo = (data) => {
    const nestedPayment = data?.payment && typeof data.payment === 'object'
      ? data.payment
      : null;
    const hasDirectPaymentRecord = Boolean(
      data?.original_name || data?.file_url || data?.download_url || data?.mime_type
    );
    const fallbackStatus = typeof getRegistrationPaymentBadgeInfo === 'function'
      ? getRegistrationPaymentBadgeInfo(data || {}).label
      : '';
    const status = data?.payment_status
      || data?.pay_status
      || nestedPayment?.status
      || data?.payment_state
      || fallbackStatus;
    const name = data?.payment_file_name
      || data?.payment_original_name
      || data?.payment_pdf_name
      || nestedPayment?.original_name
      || nestedPayment?.name
      || (hasDirectPaymentRecord ? (data?.original_name || '') : '')
      || '';
    const size = normalizeNumber(
      data?.payment_file_size
      ?? data?.payment_size
      ?? nestedPayment?.size
      ?? (hasDirectPaymentRecord ? (data?.size ?? null) : null)
      ?? null
    );
    const hasFile = Boolean(
      name
      || nestedPayment?.file_url
      || nestedPayment?.download_url
      || (hasDirectPaymentRecord ? (data?.file_url || data?.download_url || data?.url) : '')
    );

    return { status, name, size, hasFile };
  };

  const resetPaymentInfo = () => {
    if (paymentElements.name) paymentElements.name.textContent = '-';
    if (paymentElements.size) paymentElements.size.textContent = '-';
    if (paymentElements.viewBtn) {
      paymentElements.viewBtn.disabled = true;
      paymentElements.viewBtn.onclick = null;
    }
    if (paymentElements.downloadBtn) {
      paymentElements.downloadBtn.disabled = true;
      paymentElements.downloadBtn.onclick = null;
    }
    if (paymentElements.validateBtn) {
      paymentElements.validateBtn.disabled = true;
      paymentElements.validateBtn.textContent = paymentValidateBtnLabel;
    }
  };

  const updatePaymentActionButtonState = (registration, paymentInfo = null) => {
    const hasPayment = isRegistrationFlagEnabled(registration?.has_payment) || Boolean(paymentInfo?.hasFile);
    const isValidated = isRegistrationFlagEnabled(registration?.payment_validated);
    const hasFile = Boolean(paymentInfo?.hasFile);

    if (paymentElements.viewBtn) {
      paymentElements.viewBtn.disabled = !registration?.id || !hasFile;
    }
    if (paymentElements.downloadBtn) {
      paymentElements.downloadBtn.disabled = !registration?.id || !hasFile;
    }
    if (paymentElements.validateBtn) {
      paymentElements.validateBtn.disabled = !registration?.id || !hasPayment || isValidated;
    }
  };

  const setPaymentInfo = (data, registration = null) => {
    const paymentInfo = extractPaymentInfo(data);
    if (paymentElements.name) {
      paymentElements.name.textContent = paymentInfo.name || '-';
    }
    if (paymentElements.size) {
      paymentElements.size.textContent = paymentInfo.size != null ? formatBytes(paymentInfo.size) : '-';
    }
    updatePaymentActionButtonState(registration || data, paymentInfo);
  };

  const updateAudioValidateButtonState = (registration) => {
    if (!audioElements.validateBtn) return;
    const hasMusic = isRegistrationFlagEnabled(registration?.has_music);
    const isValidated = isRegistrationFlagEnabled(registration?.music_validated);
    audioElements.validateBtn.disabled = !registration?.id || !hasMusic || isValidated;
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'audio';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getFilenameFromHeader = (headerValue) => {
    if (!headerValue) return '';
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(headerValue);
    if (!match || !match[1]) return '';
    try {
      return decodeURIComponent(match[1].replace(/\"/g, '').trim());
    } catch (err) {
      return match[1].replace(/\"/g, '').trim();
    }
  };

  const openActionUrl = (url, options = {}) => {
    if (!url) return;
    const { newTab = false, download = false, filename = '' } = options;
    const link = document.createElement('a');
    link.href = url;
    if (newTab) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    if (download && filename) {
      link.setAttribute('download', filename);
    }
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleAudioDownloadClick = async (event, registrationId) => {
    event.preventDefault();
    if (!registrationId) return;
    const url = getMusicDownloadUrl(registrationId);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const data = await safeJson(res);
        const message = data?.error || t('registration_audio_download_error', 'Error downloading audio.');
        throw new Error(message);
      }
      const blob = await res.blob();
      const headerFilename = getFilenameFromHeader(res.headers.get('content-disposition'));
      const fallbackName = audioElements.name?.textContent || '';
      downloadBlob(blob, headerFilename || fallbackName || 'audio');
    } catch (err) {
      showMessageModal(err.message || t('registration_audio_download_error', 'Error downloading audio.'), t('error_title', 'Error'));
    }
  };

  const handlePaymentDownloadClick = async (event, registrationId) => {
    event.preventDefault();
    if (!registrationId) return;
    const url = getPaymentDownloadUrl(registrationId);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const data = await safeJson(res);
        const message = data?.error || t('registration_payment_download_error', 'Error al descargar el justificante.');
        throw new Error(message);
      }
      const blob = await res.blob();
      const headerFilename = getFilenameFromHeader(res.headers.get('content-disposition'));
      const fallbackName = paymentElements.name?.textContent || '';
      downloadBlob(blob, headerFilename || fallbackName || 'payment.pdf');
    } catch (err) {
      showMessageModal(err.message || t('registration_payment_download_error', 'Error al descargar el justificante.'), t('error_title', 'Error'));
    }
  };

  const setAudioInfo = (info, registrationId) => {
    if (audioElements.name) audioElements.name.textContent = info?.original_name || '-';
    if (audioElements.duration) {
      const durationValue = normalizeNumber(info?.duration);
      audioElements.duration.textContent = durationValue != null ? formatDuration(durationValue) : '-';
    }
    if (audioElements.size) {
      const sizeValue = normalizeNumber(info?.size);
      audioElements.size.textContent = sizeValue != null ? formatBytes(sizeValue) : '-';
    }
    const downloadUrl = info?.download_url || info?.url || info?.file_url || getMusicDownloadUrl(registrationId);
    setAudioDownloadState(Boolean(info?.original_name), downloadUrl, info?.original_name);
    if (audioElements.downloadBtn) {
      audioElements.downloadBtn.onclick = (event) => handleAudioDownloadClick(event, registrationId);
    }
  };

  const fetchRegistrationAudioInfo = async (registrationId) => {
    if (!registrationId) return;
    resetAudioInfo();
    try {
      const url = getMusicUrl(registrationId);
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          return;
        }
        const data = await safeJson(res);
        const message = data?.error || t('registration_audio_load_error', 'Error loading audio.');
        throw new Error(message);
      }
      const data = await safeJson(res);
      if (!data || !data.original_name) {
        return;
      }
      setAudioInfo(data, registrationId);
    } catch (err) {
      showMessageModal(err.message || t('registration_audio_load_error', 'Error loading audio.'), t('error_title', 'Error'));
    }
  };

  const setPaymentActions = (registrationId, paymentInfo) => {
    if (paymentElements.viewBtn) {
      paymentElements.viewBtn.onclick = (event) => {
        event.preventDefault();
        if (paymentElements.viewBtn.disabled) return;
        openActionUrl(getPaymentViewUrl(registrationId), { newTab: true });
      };
    }
    if (paymentElements.downloadBtn) {
      paymentElements.downloadBtn.onclick = (event) => {
        if (paymentElements.downloadBtn.disabled) {
          event.preventDefault();
          return;
        }
        handlePaymentDownloadClick(event, registrationId);
      };
    }
    updatePaymentActionButtonState(detailRegistration || { id: registrationId }, paymentInfo);
  };

  const fetchRegistrationPaymentInfo = async (registrationId) => {
    if (!registrationId) return;
    try {
      const url = getPaymentUrl(registrationId);
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          updatePaymentActionButtonState(detailRegistration, extractPaymentInfo(detailRegistration || {}));
          return;
        }
        const data = await safeJson(res);
        const message = data?.error || t('registration_payment_load_error', 'Error al cargar el pago.');
        throw new Error(message);
      }
      const data = await safeJson(res);
      if (!data) {
        updatePaymentActionButtonState(detailRegistration, extractPaymentInfo(detailRegistration || {}));
        return;
      }
      const registrationSnapshot = detailRegistration || {};
      const paymentViewData = {
        ...registrationSnapshot,
        payment: {
          ...(registrationSnapshot.payment && typeof registrationSnapshot.payment === 'object'
            ? registrationSnapshot.payment
            : {}),
          ...data
        },
        payment_file_name: data?.original_name
          || data?.payment_file_name
          || registrationSnapshot.payment_file_name
          || '',
        payment_original_name: data?.original_name
          || data?.payment_original_name
          || registrationSnapshot.payment_original_name
          || '',
        payment_file_size: data?.size
          ?? data?.payment_file_size
          ?? registrationSnapshot.payment_file_size
          ?? null,
        payment_size: data?.size
          ?? data?.payment_size
          ?? registrationSnapshot.payment_size
          ?? null,
        payment_status: data?.payment_status
          || data?.pay_status
          || registrationSnapshot.payment_status
          || '',
        file_url: data?.file_url || registrationSnapshot.file_url || '',
        download_url: data?.download_url || registrationSnapshot.download_url || ''
      };
      const paymentInfo = extractPaymentInfo(paymentViewData);
      setPaymentInfo(paymentViewData, registrationSnapshot);
      setPaymentActions(registrationId, paymentInfo);
    } catch (err) {
      showMessageModal(err.message || t('registration_payment_load_error', 'Error al cargar el pago.'), t('error_title', 'Error'));
    }
  };

  const openValidateModal = (registration) => {
    validationTarget = registration;
    if (validationElements.validateConfirmBtn) {
      validationElements.validateConfirmBtn.disabled = false;
    }
    validateModal.show();
  };

  const openRejectModal = (registration) => {
    rejectTarget = registration;
    if (validationElements.rejectReason) {
      validationElements.rejectReason.value = '';
      validationElements.rejectReason.classList.remove('is-invalid');
    }
    if (validationElements.rejectConfirmBtn) {
      validationElements.rejectConfirmBtn.disabled = false;
    }
    rejectModal.show();
  };

  const submitValidation = async () => {
    if (!validationTarget) return;
    if (validationElements.validateConfirmBtn) {
      validationElements.validateConfirmBtn.disabled = true;
    }

    try {
      const url = buildActionUrl(registrationEndpoints.validate(validationTarget.id));
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        let message = t('org_registrations_validate_error', 'Error validating registration.');
        try {
          const data = await res.json();
          if (data?.error) {
            message = data.error;
          }
        } catch (err) {
          // ignore
        }
        throw new Error(message);
      }
      validateModal.hide();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('org_registrations_validate_error', 'Error validating registration.'), t('error_title', 'Error'));
    } finally {
      if (validationElements.validateConfirmBtn) {
        validationElements.validateConfirmBtn.disabled = false;
      }
      validationTarget = null;
    }
  };

  const submitRejection = async () => {
    if (!rejectTarget) return;
    const reason = validationElements.rejectReason ? validationElements.rejectReason.value.trim() : '';
    if (!reason) {
      if (validationElements.rejectReason) {
        validationElements.rejectReason.classList.add('is-invalid');
        validationElements.rejectReason.focus();
      }
      return;
    }

    if (validationElements.rejectConfirmBtn) {
      validationElements.rejectConfirmBtn.disabled = true;
    }

    try {
      const url = buildActionUrl(registrationEndpoints.reject(rejectTarget.id));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_reason: reason })
      });
      if (!res.ok) {
        let message = t('org_registrations_reject_error_request', 'Error rejecting registration.');
        try {
          const data = await res.json();
          if (data?.error) {
            message = data.error;
          }
        } catch (err) {
          // ignore
        }
        throw new Error(message);
      }
      rejectModal.hide();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('org_registrations_reject_error_request', 'Error rejecting registration.'), t('error_title', 'Error'));
    } finally {
      if (validationElements.rejectConfirmBtn) {
        validationElements.rejectConfirmBtn.disabled = false;
      }
      rejectTarget = null;
    }
  };

  const getParticipantsCount = (registration) => {
    if (!registration) return 0;
    const count = registration.participants_count ?? registration.members_count ?? registration.member_count ?? registration.num_participants;
    if (count !== undefined && count !== null) return Number(count) || 0;
    if (Array.isArray(registration.members)) return registration.members.length;
    if (Array.isArray(registration.participants)) return registration.participants.length;
    return 0;
  };

  const formatParticipantsCountLabel = (registration) => {
    const count = getParticipantsCount(registration);
    const suffix = count === 1
      ? t('registration_competitions_member_single', 'miembro')
      : t('registration_competitions_member_plural', 'miembros');
    return `${count} ${suffix}`;
  };

  const formatStatusInfo = (status) => {
    const statusMap = {
      CRE: { label: t('registration_status_creation', 'En creacion'), color: 'primary' },
      PEN: { label: t('registration_status_pending', 'Pendiente validar'), color: 'warning' },
      VAL: { label: t('registration_status_validated', 'Validada'), color: 'success' },
      REJ: { label: t('registration_status_rejected', 'Rechazada'), color: 'danger' }
    };
    const info = statusMap[status] || { label: status || '-', color: 'secondary' };
    return { ...info, label: `${info.label}`.toUpperCase() };
  };

  const getRejectReasonValue = (data) => data?.reject_reason
    || data?.rejection_reason
    || data?.rejectReason
    || data?.reject_note
    || '';

  const getRegistrationObservationsValue = (data) => data?.notes
    ?? data?.observations
    ?? data?.observation
    ?? data?.observaciones
    ?? data?.remarks
    ?? '';

  const hasRegistrationObservations = (data) => `${getRegistrationObservationsValue(data)}`.trim().length > 0;

  const updateModalStatusInfo = (status, rejectReason, registration = null, { showExtended = false } = {}) => {
    if (!modalElements.statusWrapper || !modalElements.statusBadge) return;
    if (!status && !showExtended) {
      modalElements.statusWrapper.classList.add('d-none');
      if (modalElements.rejectWrapper) modalElements.rejectWrapper.classList.add('d-none');
      if (modalElements.musicStatusWrapper) modalElements.musicStatusWrapper.classList.add('d-none');
      if (modalElements.paymentStatusWrapper) modalElements.paymentStatusWrapper.classList.add('d-none');
      if (modalElements.totalAmountWrapper) modalElements.totalAmountWrapper.classList.add('d-none');
      return;
    }

    const statusInfo = formatStatusInfo(status);
    modalElements.statusBadge.className = `badge bg-${statusInfo.color}`;
    modalElements.statusBadge.textContent = statusInfo.label;
    modalElements.statusWrapper.classList.remove('d-none');

    if (modalElements.musicStatusWrapper && modalElements.musicStatusBadge) {
      modalElements.musicStatusWrapper.classList.toggle('d-none', !showExtended);
      if (showExtended) {
        const musicInfo = getRegistrationMusicBadgeInfo(registration || {});
        modalElements.musicStatusBadge.className = `badge ${musicInfo.className}`;
        modalElements.musicStatusBadge.textContent = musicInfo.label;
      }
    }

    if (modalElements.paymentStatusWrapper && modalElements.paymentStatusBadge) {
      modalElements.paymentStatusWrapper.classList.toggle('d-none', !showExtended);
      if (showExtended) {
        const paymentInfo = getRegistrationPaymentBadgeInfo(registration || {});
        modalElements.paymentStatusBadge.className = `badge ${paymentInfo.className}`;
        modalElements.paymentStatusBadge.textContent = paymentInfo.label;
      }
    }

    if (modalElements.totalAmountWrapper && modalElements.totalAmountValue) {
      modalElements.totalAmountWrapper.classList.toggle('d-none', !showExtended);
      if (showExtended) {
        modalElements.totalAmountValue.textContent = formatCurrencyDisplay(getRegistrationTotalAmount(registration || {}));
      }
    }

    if (modalElements.rejectWrapper && modalElements.rejectReason) {
      if (`${status}` === 'REJ') {
        modalElements.rejectReason.textContent = rejectReason || '-';
        modalElements.rejectWrapper.classList.remove('d-none');
      } else {
        modalElements.rejectWrapper.classList.add('d-none');
      }
    }
  };

  const applyFilters = () => {
    const schoolValue = filterSchool.value;
    const statusValue = filterStatus.value;
    const categoryValue = filterCategory.value;
    const styleValue = filterStyle.value;

    return registrationState.organizerRegistrations.filter(registration => {
      const schoolId = registration?.school_id ?? registration?.school?.id;
      if (schoolValue && `${schoolId || ''}` !== `${schoolValue}`) return false;
      if (statusValue && `${registration?.status || ''}` !== `${statusValue}`) return false;
      const categoryId = registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id;
      if (categoryValue && `${categoryId || ''}` !== `${categoryValue}`) return false;
      const styleId = registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id;
      if (styleValue && `${styleId || ''}` !== `${styleValue}`) return false;
      return true;
    });
  };

  const setMembersViewMode = (isViewOnly) => {
    const controlsRow = membersElements.participantSelect?.closest('.d-flex');
    if (controlsRow) {
      controlsRow.classList.toggle('d-none', isViewOnly);
    }
    if (membersElements.saveBtn) {
      membersElements.saveBtn.classList.toggle('d-none', isViewOnly);
    }
    if (membersElements.actionsHeader) {
      membersElements.actionsHeader.classList.toggle('d-none', isViewOnly);
    }
  };

  const updateMembersAgeHeaderTooltip = () => {
    syncRegistrationAgeTooltipButton(membersElements.ageInfoBtn);
  };

  const syncMembersGenderUi = () => {
    if (membersElements.genderHeader) {
      membersElements.genderHeader.classList.toggle('d-none', !Boolean(getEvent()?.showGender));
    }
  };

  const renderMembersTable = (members) => {
    if (!membersElements.table) return;
    membersElements.table.innerHTML = '';

    if (membersElements.count) {
      membersElements.count.textContent = `${members.length}`;
    }

    if (!members.length) {
      if (membersElements.empty) membersElements.empty.classList.remove('d-none');
      return;
    }

    if (membersElements.empty) membersElements.empty.classList.add('d-none');

    members.forEach(member => {
      const row = document.createElement('tr');
      row.dataset.id = member.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = member.name || '';
      row.appendChild(nameCell);

      if (getEvent()?.showGender) {
        const genderCell = document.createElement('td');
        genderCell.textContent = member.gender || '-';
        row.appendChild(genderCell);
      }

      const dobValue = getDateOnlyValue(member.date_of_birth);
      const dobCell = document.createElement('td');
      dobCell.textContent = dobValue || '-';
      row.appendChild(dobCell);

      const ageCell = document.createElement('td');
      ageCell.textContent = `${calculateAge(dobValue, getRegistrationAgeReferenceDate())}`;
      row.appendChild(ageCell);

      membersElements.table.appendChild(row);
    });
  };

  const updateMembersRuleInfo = (category) => {
    if (!membersElements.ruleInfo) return;
    if (!category) {
      membersElements.ruleInfo.innerHTML = '';
      return;
    }

    const minLabel = t('registration_competitions_rule_min', 'Min');
    const maxLabel = t('registration_competitions_rule_max', 'Max');
    const participantsLabel = t('registration_competitions_table_participants', 'Participantes');
    const ageRequirementsLabel = t('registration_competitions_rule_age', 'Edad');
    const minPar = normalizeNumber(category.min_par);
    const maxPar = normalizeNumber(category.max_par);
    const minYears = normalizeNumber(category.min_years);
    const maxYears = normalizeNumber(category.max_years);
    const maxOutOfRange = normalizeNumber(category?.max_outofrange) ?? 0;
    const maxOutOfRangeLabel = t('registration_competitions_rule_max_outofrange', 'Máx. fuera de rango');
    const participantsInfo = `
      <div class="registration-category-info-card registration-category-info-card--rules">
        <div class="registration-category-info-title">
          <i class="bi bi-people"></i>
          <span>${participantsLabel}</span>
        </div>
        <div class="registration-category-info-values">
          <span><strong>${minLabel}:</strong> ${minPar ?? '-'}</span>
          <span><strong>${maxLabel}:</strong> ${maxPar ?? '-'}</span>
        </div>
      </div>
    `;
    const hasAgeInfo = minYears !== null || maxYears !== null;
    const ageInfo = hasAgeInfo
      ? `
        <div class="registration-category-info-card registration-category-info-card--age">
          <div class="registration-category-info-title">
            <i class="bi bi-hourglass-split"></i>
            <span>${ageRequirementsLabel}</span>
          </div>
          <div class="registration-category-info-values">
            <span><strong>${minLabel}:</strong> ${minYears ?? '-'}</span>
            <span><strong>${maxLabel}:</strong> ${maxYears ?? '-'}</span>
            <span><strong>${maxOutOfRangeLabel}:</strong> ${maxOutOfRange}</span>
          </div>
        </div>
      `
      : '';
    const gridClassName = hasAgeInfo
      ? 'registration-category-info-grid'
      : 'registration-category-info-grid registration-category-info-grid--no-age';
    membersElements.ruleInfo.innerHTML = `<div class="${gridClassName}">${participantsInfo}${ageInfo}</div>`;
  };

  const fetchRegistrationDetails = async (registrationId) => {
    const params = new URLSearchParams();
    const eventObj = getEvent();
    if (eventObj?.id) {
      params.set('event_id', eventObj.id);
    }

    const url = params.toString()
      ? `${API_BASE_URL}/api/registrations/${registrationId}?${params.toString()}`
      : `${API_BASE_URL}/api/registrations/${registrationId}`;

    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    try {
      return await res.json();
    } catch (err) {
      return null;
    }
  };

  const normalizeMembers = (members) => {
    if (!Array.isArray(members)) return [];
    return members.map(member => {
      if (member && typeof member === 'object') {
        const memberId = member.id ?? member.participant_id ?? member.member_id;
        return {
          ...member,
          id: memberId,
          name: member.name || member.participant_name || `#${memberId ?? ''}`,
          date_of_birth: member.date_of_birth || member.birth_date || member.dob
        };
      }
      return { id: member, name: `#${member}` };
    }).filter(Boolean);
  };

  const openMembersModal = async (registration) => {
    if (!registration) return;

    try {
      await loadRegistrationConfig();
    } catch (err) {
      showMessageModal(err.message || t('org_registrations_load_error', 'Error loading registrations.'), t('error_title', 'Error'));
      return;
    }

    const categoryId = registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '';
    const category = categoryById.get(`${categoryId}`) || null;
    const styleId = registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id ?? '';
    const styleName = registration.style_name || styleById.get(`${styleId}`)?.name || '-';

    if (membersElements.choreo) {
      membersElements.choreo.textContent = registration.name || registration.choreography || '-';
    }
    if (membersElements.category) {
      membersElements.category.textContent = category?.name || registration.category_name || '-';
    }
    if (membersElements.style) {
      membersElements.style.textContent = styleName || '-';
    }
    updateMembersRuleInfo(category);

    let members = [];
    if (Array.isArray(registration.members)) {
      members = normalizeMembers(registration.members);
    } else {
      const details = await fetchRegistrationDetails(registration.id);
      if (details && Array.isArray(details.members)) {
        members = normalizeMembers(details.members);
      }
    }

    membersModalEl.dataset.viewOnly = 'true';
    setMembersViewMode(true);
    renderMembersTable(members);
    membersModal.show();
  };

  const setModalViewMode = (isViewOnly) => {
    const textInputs = [modalElements.choreographyName, modalElements.choreographer, modalElements.observations];
    const selects = [modalElements.category, modalElements.style];

    textInputs.forEach(input => {
      if (!input) return;
      if (isViewOnly) {
        input.setAttribute('readonly', 'readonly');
        input.classList.add('bg-light');
      } else {
        input.removeAttribute('readonly');
        input.classList.remove('bg-light');
      }
    });

    selects.forEach(select => {
      if (!select) return;
      select.disabled = isViewOnly;
      select.classList.toggle('bg-light', isViewOnly);
    });

    if (modalElements.saveBtn) {
      modalElements.saveBtn.classList.toggle('d-none', isViewOnly);
    }
    setAudioViewMode(isViewOnly);
  };

  const fillRegistrationDetailsModal = async (registration) => {
    if (!registration || !form) return;

    const details = registration.id ? await fetchRegistrationDetails(registration.id) : null;
    const data = { ...(registration || {}), ...(details || {}) };
    detailRegistration = data;

    if (modalElements.modalTitle) {
      modalElements.modalTitle.textContent = t('org_registrations_details_title', 'Detalle inscripcion');
    }

    if (modalElements.id) modalElements.id.value = data.id || '';
    if (modalElements.choreographyName) modalElements.choreographyName.value = data.name || data.choreography || '';
    if (modalElements.participantsCountAddon) {
      modalElements.participantsCountAddon.textContent = formatParticipantsCountLabel(data);
      modalElements.participantsCountAddon.classList.remove('d-none');
    }
    if (modalElements.choreographer) modalElements.choreographer.value = data.choreographer || '';

    const categoryId = data?.reg_category_id ?? data?.category_id ?? data?.reg_category?.id ?? '';
    const styleId = data?.reg_style_id ?? data?.style_id ?? data?.reg_style?.id ?? '';
    if (modalElements.category) modalElements.category.value = categoryId ? `${categoryId}` : '';
    if (modalElements.style) modalElements.style.value = styleId ? `${styleId}` : '';
    if (modalElements.observations) modalElements.observations.value = getRegistrationObservationsValue(data);
    updateAudioMaxDuration(categoryId);

    const statusValue = data.status || '';
    const rejectReason = getRejectReasonValue(data);
    updateModalStatusInfo(statusValue, rejectReason, data, { showExtended: true });

    modalEl.dataset.viewOnly = 'true';
    setModalViewMode(true);
    setAudioSectionVisible(true);
    setPaymentSectionVisible(true);
    resetAudioInfo();
    resetPaymentInfo();
    updateAudioValidateButtonState(data);
    setPaymentInfo(data, data);
    setPaymentActions(data.id, extractPaymentInfo(data));
    await fetchRegistrationAudioInfo(data.id);
    await fetchRegistrationPaymentInfo(data.id);
  };

  const validateMusicUpload = async () => {
    const registrationId = detailRegistration?.id || modalElements.id?.value || '';
    if (!registrationId || !audioElements.validateBtn) return;

    const originalText = audioElements.validateBtn.textContent;
    audioElements.validateBtn.disabled = true;
    audioElements.validateBtn.textContent = t('saving', 'Guardando...');

    try {
      const url = buildActionUrl(registrationEndpoints.musicValidate(registrationId));
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const data = await safeJson(res);
        const message = data?.error || t('registration_audio_validate_error', 'Error validating music.');
        throw new Error(message);
      }

      await loadRegistrations();
      const refreshedRegistration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${registrationId}`) || detailRegistration;
      await fillRegistrationDetailsModal(refreshedRegistration);
    } catch (err) {
      showMessageModal(err.message || t('registration_audio_validate_error', 'Error validating music.'), t('error_title', 'Error'));
    } finally {
      if (audioElements.validateBtn) {
        audioElements.validateBtn.textContent = originalText;
        updateAudioValidateButtonState(detailRegistration);
      }
    }
  };

  const validatePaymentUpload = async () => {
    const registrationId = detailRegistration?.id || modalElements.id?.value || '';
    if (!registrationId || !paymentElements.validateBtn) return;

    const originalText = paymentElements.validateBtn.textContent;
    paymentElements.validateBtn.disabled = true;
    paymentElements.validateBtn.textContent = t('saving', 'Guardando...');

    try {
      const url = buildActionUrl(registrationEndpoints.paymentValidate(registrationId));
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const data = await safeJson(res);
        const message = data?.error || t('registration_payment_validate_error', 'Error al validar el pago.');
        throw new Error(message);
      }

      await loadRegistrations();
      const refreshedRegistration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${registrationId}`) || detailRegistration;
      await fillRegistrationDetailsModal(refreshedRegistration);
    } catch (err) {
      showMessageModal(err.message || t('registration_payment_validate_error', 'Error al validar el pago.'), t('error_title', 'Error'));
    } finally {
      if (paymentElements.validateBtn) {
        paymentElements.validateBtn.textContent = originalText;
        updatePaymentActionButtonState(detailRegistration, extractPaymentInfo(detailRegistration || {}));
      }
    }
  };

  const openRegistrationDetails = async (registration) => {
    if (!registration || !form) return;

    try {
      await loadRegistrationConfig();
    } catch (err) {
      showMessageModal(err.message || t('org_registrations_load_error', 'Error loading registrations.'), t('error_title', 'Error'));
      return;
    }

    await fillRegistrationDetailsModal(registration);
    registrationModal.show();
  };

  const renderRegistrations = () => {
    disposeRegistrationsTooltips();
    tableBody.innerHTML = '';
    const registrations = applyFilters();
    const totalAmount = registrations.reduce((sum, registration) => sum + getRegistrationTotalAmount(registration), 0);
    const paidAmount = registrations.reduce((sum, registration) => (
      isPaymentValidated(registration) ? sum + getRegistrationTotalAmount(registration) : sum
    ), 0);
    const pendingAmount = registrations.reduce((sum, registration) => (
      isPaymentValidated(registration) ? sum : sum + getRegistrationTotalAmount(registration)
    ), 0);

    if (countEl) {
      countEl.textContent = `${registrations.length}`;
    }
    if (totalAmountEl) {
      totalAmountEl.textContent = formatCurrencyDisplay(totalAmount);
    }
    if (paidAmountEl) {
      paidAmountEl.textContent = formatCurrencyDisplay(paidAmount);
    }
    if (pendingAmountEl) {
      pendingAmountEl.textContent = formatCurrencyDisplay(pendingAmount);
    }

    if (!registrations.length) {
      emptyEl.classList.remove('d-none');
      return;
    }

    emptyEl.classList.add('d-none');

    const detailsLabel = t('org_registrations_action_details', 'Detalles');
    const validateLabel = t('org_registrations_action_validate', 'Validar');
    const rejectLabel = t('org_registrations_action_reject', 'Rechazar');
    const membersLabel = t('org_registrations_action_members', 'Participantes');

    registrations.forEach(registration => {
      const row = document.createElement('tr');
      row.dataset.id = registration.id;

      const schoolCell = document.createElement('td');
      schoolCell.textContent = registration.school_name || registration.school?.name || '-';
      row.appendChild(schoolCell);

      const nameCell = document.createElement('td');
      nameCell.textContent = registration.name || registration.choreography || '-';
      row.appendChild(nameCell);

      const categoryId = registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '';
      const categoryName = registration.category_name || categoryById.get(`${categoryId}`)?.name || '-';
      const categoryCell = document.createElement('td');
      categoryCell.textContent = categoryName;
      row.appendChild(categoryCell);

      const styleId = registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id ?? '';
      const styleName = registration.style_name || styleById.get(`${styleId}`)?.name || '-';
      const styleCell = document.createElement('td');
      styleCell.textContent = styleName;
      row.appendChild(styleCell);

      const participantsCell = document.createElement('td');
      participantsCell.className = 'text-center';
      participantsCell.textContent = `${getParticipantsCount(registration)}`;
      row.appendChild(participantsCell);

      const observationsCell = document.createElement('td');
      observationsCell.className = 'text-center';
      observationsCell.setAttribute('data-tsv-ignore', 'true');
      const observationsIcon = document.createElement('i');
      const hasObservations = hasRegistrationObservations(registration);
      observationsIcon.className = hasObservations
        ? 'bi bi-chat-left-text-fill text-warning'
        : 'bi bi-dash-circle text-body-tertiary';
      observationsIcon.setAttribute('data-bs-toggle', 'tooltip');
      observationsIcon.setAttribute('data-bs-placement', 'top');
      observationsIcon.setAttribute(
        'data-bs-title',
        hasObservations
          ? t('registration_competitions_observations_yes', 'Con observaciones')
          : t('registration_competitions_observations_no', 'Sin observaciones')
      );
      observationsIcon.setAttribute(
        'aria-label',
        hasObservations
          ? t('registration_competitions_observations_yes', 'Con observaciones')
          : t('registration_competitions_observations_no', 'Sin observaciones')
      );
      observationsCell.appendChild(observationsIcon);
      row.appendChild(observationsCell);

      const alertsCell = document.createElement('td');
      alertsCell.className = 'text-center';
      alertsCell.setAttribute('data-tsv-ignore', 'true');
      alertsCell.appendChild(createRegistrationAlertsIcon(registration));
      row.appendChild(alertsCell);

      const totalAmountCell = document.createElement('td');
      totalAmountCell.className = 'text-center';
      totalAmountCell.textContent = formatCurrencyDisplay(getRegistrationTotalAmount(registration));
      row.appendChild(totalAmountCell);

      const statusCell = document.createElement('td');
      const statusInfo = formatStatusInfo(registration.status);
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge bg-${statusInfo.color}`;
      statusBadge.textContent = statusInfo.label;
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);

      const paymentCell = document.createElement('td');
      paymentCell.className = 'text-center';
      const paymentInfo = getRegistrationPaymentBadgeInfo(registration);
      const paymentBadge = document.createElement('span');
      paymentBadge.className = `badge ${paymentInfo.className}`;
      paymentBadge.textContent = paymentInfo.label;
      paymentCell.appendChild(paymentBadge);
      row.appendChild(paymentCell);

      const musicCell = document.createElement('td');
      musicCell.className = 'text-center';
      const musicInfo = getRegistrationMusicBadgeInfo(registration);
      const musicBadge = document.createElement('span');
      musicBadge.className = `badge ${musicInfo.className}`;
      musicBadge.textContent = musicInfo.label;
      musicCell.appendChild(musicBadge);
      row.appendChild(musicCell);

      const syncroCell = document.createElement('td');
      syncroCell.className = 'text-center';
      const syncroBadge = document.createElement('span');
      const syncroInfo = getSyncroStatusBadgeInfo(registration.syncro_status);
      syncroBadge.className = `badge ${syncroInfo.className}`;
      syncroBadge.textContent = syncroInfo.label;
      syncroCell.appendChild(syncroBadge);
      row.appendChild(syncroCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      actionsCell.setAttribute('data-tsv-ignore', 'true');
      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      const validateBtn = document.createElement('button');
      validateBtn.type = 'button';
      validateBtn.className = 'btn btn-outline-success btn-sm btn-org-registration-validate';
      validateBtn.disabled = registration.status !== 'PEN';
      validateBtn.dataset.id = registration.id;
      validateBtn.title = validateLabel;
      validateBtn.setAttribute('aria-label', validateLabel);
      validateBtn.setAttribute('data-bs-toggle', 'tooltip');
      validateBtn.setAttribute('data-bs-placement', 'top');
      validateBtn.innerHTML = '<i class="bi bi-check-circle"></i>';

      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = 'btn btn-outline-danger btn-sm btn-org-registration-reject';
      rejectBtn.disabled = !['PEN', 'VAL'].includes(`${registration.status || ''}`);
      rejectBtn.dataset.id = registration.id;
      rejectBtn.title = rejectLabel;
      rejectBtn.setAttribute('aria-label', rejectLabel);
      rejectBtn.setAttribute('data-bs-toggle', 'tooltip');
      rejectBtn.setAttribute('data-bs-placement', 'top');
      rejectBtn.innerHTML = '<i class="bi bi-x-circle"></i>';

      const membersBtn = document.createElement('button');
      membersBtn.type = 'button';
      membersBtn.className = 'btn btn-outline-secondary btn-sm btn-org-registration-members';
      membersBtn.dataset.id = registration.id;
      membersBtn.title = membersLabel;
      membersBtn.setAttribute('aria-label', membersLabel);
      membersBtn.setAttribute('data-bs-toggle', 'tooltip');
      membersBtn.setAttribute('data-bs-placement', 'top');
      membersBtn.innerHTML = '<i class="bi bi-people"></i>';

      const detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className = 'btn btn-outline-primary btn-sm btn-org-registration-details';
      detailsBtn.dataset.id = registration.id;
      detailsBtn.title = detailsLabel;
      detailsBtn.setAttribute('aria-label', detailsLabel);
      detailsBtn.setAttribute('data-bs-toggle', 'tooltip');
      detailsBtn.setAttribute('data-bs-placement', 'top');
      detailsBtn.innerHTML = '<i class="bi bi-search"></i>';

      actionGroup.appendChild(validateBtn);
      actionGroup.appendChild(rejectBtn);
      actionGroup.appendChild(membersBtn);
      actionGroup.appendChild(detailsBtn);
      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });

    initRegistrationsTooltips();
  };

  const showRegistrationsError = (message) => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 13;
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    emptyEl.classList.add('d-none');
    if (countEl) {
      countEl.textContent = '0';
    }
    if (totalAmountEl) totalAmountEl.textContent = formatCurrencyDisplay(0);
    if (paidAmountEl) paidAmountEl.textContent = formatCurrencyDisplay(0);
    if (pendingAmountEl) pendingAmountEl.textContent = formatCurrencyDisplay(0);
  };

  const loadRegistrations = async () => {
    try {
      await fetchOrganizerRegistrationsForEvent();
      notifyOrganizerRegistrationsUpdate();
      renderRegistrations();
    } catch (err) {
      showRegistrationsError(err.message || t('org_registrations_load_error', 'Error loading registrations.'));
    }
  };

  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
  filterSchool.addEventListener('change', renderRegistrations);
  filterStatus.addEventListener('change', renderRegistrations);
  filterCategory.addEventListener('change', renderRegistrations);
  filterStyle.addEventListener('change', renderRegistrations);
  filterClear.addEventListener('click', () => {
    filterSchool.value = '';
    filterStatus.value = '';
    filterCategory.value = '';
    filterStyle.value = '';
    renderRegistrations();
  });

  if (copyTsvBtn) {
    bindTableTsvExportButton(copyTsvBtn, tableBody);
  }

  const handleConfigUpdate = () => {
    loadRegistrationConfig()
      .then(renderRegistrations)
      .catch(() => {});
  };
  window.addEventListener('registration:config-updated', handleConfigUpdate);
  window.addEventListener('registration:organizer-registrations-updated', renderRegistrations);

  if (membersElements.ageInfoBtn) {
    const membersAgeLanguageObserver = new MutationObserver(() => {
      updateMembersAgeHeaderTooltip();
    });
    membersAgeLanguageObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang']
    });
  }

  tableBody.addEventListener('click', (event) => {
    const detailsBtn = event.target.closest('.btn-org-registration-details');
    const membersBtn = event.target.closest('.btn-org-registration-members');
    const validateBtn = event.target.closest('.btn-org-registration-validate');
    const rejectBtn = event.target.closest('.btn-org-registration-reject');
    if (membersBtn) {
      const registration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${membersBtn.dataset.id}`);
      if (registration) {
        openMembersModal(registration);
      }
      return;
    }
    if (validateBtn) {
      const registration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${validateBtn.dataset.id}`);
      if (registration) {
        openValidateModal(registration);
      }
      return;
    }
    if (rejectBtn) {
      const registration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${rejectBtn.dataset.id}`);
      if (registration) {
        openRejectModal(registration);
      }
      return;
    }
    if (!detailsBtn) return;
    const registration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${detailsBtn.dataset.id}`);
    if (registration) {
      openRegistrationDetails(registration);
    }
  });

  if (validationElements.validateConfirmBtn) {
    validationElements.validateConfirmBtn.addEventListener('click', submitValidation);
  }
  if (validationElements.rejectConfirmBtn) {
    validationElements.rejectConfirmBtn.addEventListener('click', submitRejection);
  }
  if (validationElements.rejectReason) {
    validationElements.rejectReason.addEventListener('input', () => {
      validationElements.rejectReason.classList.remove('is-invalid');
    });
  }
  if (audioElements.validateBtn) {
    audioElements.validateBtn.addEventListener('click', validateMusicUpload);
  }
  if (paymentElements.validateBtn) {
    paymentElements.validateBtn.addEventListener('click', validatePaymentUpload);
  }

  modalEl.addEventListener('hidden.bs.modal', () => {
    if (modalEl.dataset.viewOnly !== 'true') return;
    setModalViewMode(false);
    updateModalStatusInfo('', '');
    if (modalElements.participantsCountAddon) {
      modalElements.participantsCountAddon.classList.add('d-none');
      modalElements.participantsCountAddon.textContent = '0 miembros';
    }
    if (modalElements.observations) {
      modalElements.observations.value = '';
    }
    setPaymentSectionVisible(false);
    resetPaymentInfo();
    updateAudioValidateButtonState(null);
    detailRegistration = null;
    delete modalEl.dataset.viewOnly;
  });
  membersModalEl.addEventListener('hidden.bs.modal', () => {
    if (membersModalEl.dataset.viewOnly !== 'true') return;
    setMembersViewMode(false);
    delete membersModalEl.dataset.viewOnly;
    if (membersElements.table) {
      membersElements.table.innerHTML = '';
    }
    if (membersElements.empty) {
      membersElements.empty.classList.remove('d-none');
    }
  });

  window.addEventListener('beforeunload', disposeRegistrationsTooltips);

  updateMembersAgeHeaderTooltip();
  syncMembersGenderUi();
  Promise.resolve()
    .then(loadRegistrationConfig)
    .then(loadSchools)
    .then(loadRegistrations)
    .catch(() => loadRegistrations());
}
