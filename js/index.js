var title = 'Welcome';

const EVENT_STATUS_ORDER = ['en_curso', 'proximamente', 'finalizado'];
const DEFAULT_EVENT_LOGO_URL = 'https://via.placeholder.com/480x320?text=Event';
const LOCALE_BY_LANGUAGE = {
  es: 'es-ES',
  en: 'en-GB',
  it: 'it-IT',
  pt: 'pt-PT',
  fr: 'fr-FR'
};
const EVENT_DETAILS_ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'ol', 'ul', 'li', 'a', 'h2', 'h3', 'blockquote'];
const EVENT_DETAILS_ALLOWED_ATTRIBUTES = ['href', 'target', 'rel'];
const EVENT_DETAILS_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const EVENT_STATUS_META = {
  en_curso: {
    icon: 'bi-broadcast-pin',
    iconClass: 'text-warning',
    badgeClass: 'badge bg-warning text-dark',
    sectionClass: 'text-warning'
  },
  proximamente: {
    icon: 'bi-calendar-event-fill',
    iconClass: 'text-info',
    badgeClass: 'badge bg-primary',
    sectionClass: 'text-primary'
  },
  finalizado: {
    icon: 'bi-check-circle-fill',
    iconClass: 'text-success',
    badgeClass: 'badge bg-success',
    sectionClass: 'text-success'
  },
  default: {
    icon: 'bi-circle-fill',
    iconClass: 'text-secondary',
    badgeClass: 'badge bg-secondary',
    sectionClass: 'text-secondary'
  }
};

const getCurrentLanguage = () => String(localStorage.getItem('lang') || 'en').toLowerCase();

const COUNTRY_NAME_BY_CODE =
  typeof countries !== 'undefined' && Array.isArray(countries)
    ? new Map(countries.map((country) => [String(country.code || '').trim().toUpperCase(), String(country.name || '').trim()]))
    : new Map();

const getCurrentLocale = () => LOCALE_BY_LANGUAGE[getCurrentLanguage()] || LOCALE_BY_LANGUAGE.en;

const formatDateByLocale = (isoString, options) => {
  if (!isoString) {
    return '';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(getCurrentLocale(), options).format(date);
};

const formatFecha = (isoString) => formatDateByLocale(isoString, { day: '2-digit', month: 'short' });

const formatLongDate = (isoString) => formatDateByLocale(isoString, { day: '2-digit', month: 'long', year: 'numeric' });

const parseIsoDateParts = (isoString) => {
  const normalized = String(isoString || '').slice(0, 10);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return {
    normalized,
    year: Number(year),
    month: Number(month),
    day: Number(day)
  };
};

const createUtcDate = (parts) => new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

const formatMonthOnly = (parts) =>
  new Intl.DateTimeFormat(getCurrentLocale(), { month: 'long', timeZone: 'UTC' }).format(createUtcDate(parts));

const formatMonthYear = (parts) =>
  new Intl.DateTimeFormat(getCurrentLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(createUtcDate(parts));

const formatEventDetailsDateRange = (start, end) => {
  if (!start) {
    return '';
  }

  if (!end || String(start).slice(0, 10) === String(end).slice(0, 10)) {
    return formatLongDate(start);
  }

  const startParts = parseIsoDateParts(start);
  const endParts = parseIsoDateParts(end);
  if (!startParts || !endParts) {
    return `${formatLongDate(start)} / ${formatLongDate(end)}`;
  }

  if (startParts.year !== endParts.year) {
    return `${formatLongDate(start)} / ${formatLongDate(end)}`;
  }

  if (startParts.month === endParts.month) {
    return `${startParts.day}/ ${endParts.day} ${formatMonthYear(endParts)}`;
  }

  return `${startParts.day} ${formatMonthOnly(startParts)} / ${endParts.day} ${formatMonthYear(endParts)}`;
};

const formatEventDateRange = (start, end) => {
  if (!start) {
    return '';
  }

  if (!end || start === end) {
    return formatFecha(start);
  }

  return `${formatFecha(start)} / ${formatFecha(end)}`;
};

const normalizeEventStatus = (rawStatus) => {
  const normalized = String(rawStatus || '').trim().toLowerCase();

  if (normalized === 'en_curso' || normalized === 'ongoing') {
    return 'en_curso';
  }

  if (normalized === 'proximamente' || normalized === 'upcoming') {
    return 'proximamente';
  }

  if (normalized === 'finalizado' || normalized === 'finished') {
    return 'finalizado';
  }

  return '';
};

const getEventStatusBadgeClass = (eventStatus) => {
  const normalizedStatus = normalizeEventStatus(eventStatus);
  return (EVENT_STATUS_META[normalizedStatus] || EVENT_STATUS_META.default).badgeClass;
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const parseEventCategories = (value) => {
  const rawValues = Array.isArray(value)
    ? value.flatMap((item) => String(item ?? '').split(','))
    : String(value ?? '').split(',');
  const seen = new Set();

  return rawValues
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatTextWithLineBreaks = (value) => escapeHtml(value).replace(/\n/g, '<br>');

const getSafeExternalUrl = (value) => {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) {
    return '';
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.toString();
    }
  } catch {
    return '';
  }

  return '';
};

const getSafeMailtoHref = (value) => {
  const email = String(value || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return '';
  }

  return `mailto:${encodeURIComponent(email)}`;
};

const getSafeTelHref = (value) => {
  const phone = String(value || '').trim();
  if (!phone || /[<>"]/g.test(phone)) {
    return '';
  }

  return `tel:${encodeURIComponent(phone)}`;
};

const getUrlDisplayText = (value) => {
  const safeUrl = getSafeExternalUrl(value);
  if (!safeUrl) {
    return '';
  }

  try {
    const parsedUrl = new URL(safeUrl);
    return `${parsedUrl.hostname}${parsedUrl.pathname === '/' ? '' : parsedUrl.pathname}`;
  } catch {
    return safeUrl;
  }
};

const getCountryName = (value) => {
  const normalizedCode = String(value || '').trim().toUpperCase();
  if (!normalizedCode) {
    return '';
  }

  return COUNTRY_NAME_BY_CODE.get(normalizedCode) || normalizedCode;
};

const sanitizeEventDescriptionHtml = (rawHtml) => {
  if (!window.DOMPurify) {
    return '';
  }

  const sanitizedHtml = window.DOMPurify.sanitize(String(rawHtml || ''), {
    ALLOWED_TAGS: EVENT_DETAILS_ALLOWED_TAGS,
    ALLOWED_ATTR: EVENT_DETAILS_ALLOWED_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['style'],
    KEEP_CONTENT: true
  });

  const container = document.createElement('div');
  container.innerHTML = sanitizedHtml;

  container.querySelectorAll('a').forEach((link) => {
    const href = String(link.getAttribute('href') || '').trim();

    try {
      const parsedUrl = new URL(href, window.location.origin);
      if (!EVENT_DETAILS_LINK_PROTOCOLS.has(parsedUrl.protocol)) {
        link.replaceWith(document.createTextNode(link.textContent || ''));
        return;
      }
    } catch {
      link.replaceWith(document.createTextNode(link.textContent || ''));
      return;
    }

    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });

  const normalizedHtml = container.innerHTML.trim();
  if (!normalizedHtml) {
    return '';
  }

  const normalizedText = String(container.textContent || '').replace(/\u00a0/g, ' ').trim();
  return normalizedText ? normalizedHtml : '';
};

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('eventsContainer');
  const searchInput = document.getElementById('eventSearchInput');
  const categoryFilterSelect = document.getElementById('eventCategoryFilter');
  const filterButtons = Array.from(document.querySelectorAll('[data-status-filter]'));
  const eventDetailsModalEl = document.getElementById('eventDetailsModal');
  const eventDetailsModal = eventDetailsModalEl ? new bootstrap.Modal(eventDetailsModalEl) : null;
  const eventDetailsTitleEl = document.getElementById('eventDetailsModalLabel');
  const eventDetailsLogoEl = document.getElementById('eventDetailsLogo');
  const eventDetailsStatusBadgeEl = document.getElementById('eventDetailsStatusBadge');
  const eventDetailsPosterColumnEl = document.getElementById('eventDetailsPosterColumn');
  const eventDetailsDescriptionColumnEl = document.getElementById('eventDetailsDescriptionColumn');
  const eventDetailsDescriptionEl = document.getElementById('eventDetailsDescription');
  const eventDetailsPosterEl = document.getElementById('eventDetailsPoster');
  const eventDetailsInfoListEl = document.getElementById('eventDetailsInfoList');
  const eventDetailsGoToEventBtn = document.getElementById('eventDetailsGoToEventBtn');
  const eventPosterPreviewModalEl = document.getElementById('eventPosterPreviewModal');
  const eventPosterPreviewModal = eventPosterPreviewModalEl ? new bootstrap.Modal(eventPosterPreviewModalEl) : null;
  const eventPosterPreviewImageEl = document.getElementById('eventPosterPreviewImage');
  const eventPosterPreviewTitleEl = document.getElementById('eventPosterPreviewModalLabel');

  let allEvents = [];
  let selectedStatusFilter = 'all';
  let selectedCategoryFilter = '';
  let activeDetailsRequestId = 0;

  await ensureTranslationsReady();

  const renderPanelFallback = (panelEl, translationKey) => {
    panelEl.innerHTML = `
      <p class="event-details-fallback" data-i18n="${translationKey}">
        ${translationKey}
      </p>
    `;
  };

  const setEventDetailsPosterLayout = (hasPoster) => {
    if (eventDetailsPosterColumnEl) {
      eventDetailsPosterColumnEl.className = hasPoster ? 'col-12 col-lg-auto' : 'col-12 col-lg-auto d-none';
    }

    if (eventDetailsDescriptionColumnEl) {
      eventDetailsDescriptionColumnEl.className = hasPoster ? 'col-12 col-lg' : 'col-12';
    }
  };

  const showLoadingSpinner = () => {
    container.innerHTML = `
      <div class="d-flex justify-content-center w-100 my-5">
        <div class="text-center">
          <div class="spinner-border text-primary" role="status" aria-label="Loading events"></div>
          <div class="mt-2" data-i18n="loading_events">Loading events...</div>
        </div>
      </div>
    `;
    applyTranslations();
  };

  const populateCategoryFilterOptions = () => {
    if (!categoryFilterSelect) {
      return;
    }

    const categories = Array.from(
      new Map(
        allEvents
          .flatMap((event) => parseEventCategories(event.category ?? event.categories))
          .map((category) => [normalizeText(category), category])
      ).values()
    ).sort((left, right) => left.localeCompare(right, getCurrentLocale(), { sensitivity: 'base' }));

    categoryFilterSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = t('all_categories', 'All Categories');
    categoryFilterSelect.appendChild(allOption);

    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categoryFilterSelect.appendChild(option);
    });

    const matchingOption = Array.from(categoryFilterSelect.options).find(
      (option) => normalizeText(option.value) === selectedCategoryFilter
    );
    categoryFilterSelect.value = matchingOption ? matchingOption.value : '';
    if (!matchingOption) {
      selectedCategoryFilter = '';
    }

    categoryFilterSelect.disabled = categories.length === 0;
    categoryFilterSelect.setAttribute('aria-label', t('filter_by_category', 'Filter by category'));
    categoryFilterSelect.title = t('filter_by_category', 'Filter by category');
  };

  const renderEventDetailsLoading = (event) => {
    const loadingMarkup = `
      <div class="event-details-loading">
        <div class="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></div>
        <span data-i18n="event_details_loading">Loading event details...</span>
      </div>
    `;

    eventDetailsInfoListEl.innerHTML = loadingMarkup;
    eventDetailsDescriptionEl.innerHTML = loadingMarkup;
    eventDetailsPosterEl.innerHTML = '';
    setEventDetailsPosterLayout(false);
    applyTranslations();
  };

  const renderEventDetailsInfo = (event, info = {}) => {
    const eventPageUrl = getSafeExternalUrl(event?.eventurl);
    const mapsUrl = getSafeExternalUrl(info.location_maps);
    const basesUrl = getSafeExternalUrl(info.bases_document);
    const safeEmailHref = getSafeMailtoHref(info.email_contact);
    const safePhoneHref = getSafeTelHref(info.phone_contact);
    const countryValue = getCountryName(info.country);
    const formattedStartDate = formatLongDate(event?.start);
    const formattedEndDate = formatLongDate(event?.end);
    const formattedEventDateRange = formatEventDetailsDateRange(event?.start, event?.end);
    const normalizedStartDate = String(event?.start || '').slice(0, 10);
    const normalizedEndDate = String(event?.end || '').slice(0, 10);
    let eventDatesLabel = '';
    let eventDatesValue = '';

    if (formattedStartDate || formattedEndDate) {
      if (normalizedStartDate && normalizedStartDate === normalizedEndDate) {
        eventDatesLabel = t('event_details_event_date');
        eventDatesValue = formattedStartDate || formattedEndDate;
      } else if (formattedStartDate && formattedEndDate) {
        eventDatesLabel = t('event_details_dates');
        eventDatesValue = formattedEventDateRange;
      } else {
        eventDatesLabel = t('event_details_event_date');
        eventDatesValue = formattedStartDate || formattedEndDate;
      }
    }

    if (!eventDatesLabel) {
      eventDatesLabel = t('event_details_dates');
    }

    const placeholderText = escapeHtml(t('event_details_not_available'));
    const withPlaceholder = (value) => {
      const normalizedValue = String(value || '').trim();
      return normalizedValue
        ? formatTextWithLineBreaks(normalizedValue)
        : `<span class="event-details-placeholder">${placeholderText}</span>`;
    };

    const itemsMarkup = [
      {
        icon: 'bi-calendar-event',
        label: eventDatesLabel,
        value: eventDatesValue
      },
      {
        icon: 'bi-people',
        label: t('event_details_organizer'),
        value: info.organizer
      },
      {
        icon: 'bi-flag',
        label: t('event_details_country'),
        value: countryValue
      },
      {
        icon: 'bi-envelope',
        label: t('event_details_email_contact'),
        valueHtml: safeEmailHref
          ? `<a class="event-details-link" href="${escapeHtml(safeEmailHref)}">${escapeHtml(String(info.email_contact || '').trim())}</a>`
          : `<span class="event-details-placeholder">${placeholderText}</span>`
      },
      {
        icon: 'bi-telephone',
        label: t('event_details_phone_contact'),
        valueHtml: safePhoneHref
          ? `<a class="event-details-link" href="${escapeHtml(safePhoneHref)}">${escapeHtml(String(info.phone_contact || '').trim())}</a>`
          : `<span class="event-details-placeholder">${placeholderText}</span>`
      },
      {
        icon: 'bi-globe2',
        label: t('event_details_event_page'),
        valueHtml: eventPageUrl
          ? `<a class="event-details-link" href="${escapeHtml(eventPageUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(getUrlDisplayText(eventPageUrl))}</a>`
          : `<span class="event-details-placeholder">${placeholderText}</span>`
      },
      {
        icon: 'bi-geo-alt',
        label: t('event_details_address'),
        value: info.address
      },
      {
        icon: 'bi-map',
        label: t('event_details_maps'),
        valueHtml: mapsUrl
          ? `<a class="event-details-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('event_details_open_map'))}</a>`
          : `<span class="event-details-placeholder">${placeholderText}</span>`
      },
      {
        kind: 'bases',
        href: basesUrl
      }
    ]
      .map((item) => {
        if (item.kind === 'bases') {
          if (!item.href) {
            return `
              <div class="event-details-action event-details-bases-card is-disabled">
                <span class="event-details-action-icon"><i class="bi bi-file-earmark-pdf"></i></span>
                <span>
                  <span class="event-details-action-label">${escapeHtml(t('event_details_bases'))}</span>
                  <span class="event-details-action-subtitle">${placeholderText}</span>
                </span>
              </div>
            `;
          }
          return `
            <a class="event-details-action event-details-bases-card" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">
              <span class="event-details-action-icon"><i class="bi bi-file-earmark-pdf"></i></span>
              <span>
                <span class="event-details-action-label">${escapeHtml(t('event_details_bases'))}</span>
              </span>
            </a>
          `;
        }

        return `
          <div class="event-details-info-item">
            <span class="event-details-info-icon"><i class="bi ${escapeHtml(item.icon)}"></i></span>
            <div>
              <span class="event-details-info-label">${escapeHtml(item.label)}</span>
              <div class="event-details-info-value">${item.valueHtml || withPlaceholder(item.value)}</div>
            </div>
          </div>
        `;
      })
      .join('');

    eventDetailsInfoListEl.innerHTML = itemsMarkup;
  };

  const renderEventDetailsPoster = (event, info = {}) => {
    const posterUrl = getSafeExternalUrl(info.poster);
    if (!posterUrl) {
      eventDetailsPosterEl.innerHTML = '';
      setEventDetailsPosterLayout(false);
      return;
    }

    const eventName = String(event?.name || t('event_details_default_name')).trim();
    const posterAlt = `${eventName} - ${t('event_details_poster_title')}`;
    setEventDetailsPosterLayout(true);
    eventDetailsPosterEl.innerHTML = `
      <button type="button" class="event-details-poster-trigger" data-poster-url="${escapeHtml(posterUrl)}" data-poster-alt="${escapeHtml(posterAlt)}">
        <img class="event-details-poster-image" src="${escapeHtml(posterUrl)}" alt="${escapeHtml(posterAlt)}" loading="lazy">
      </button>
    `;
  };

  const renderEventDetailsDescription = (info = {}) => {
    const descriptionHtml = sanitizeEventDescriptionHtml(info.event_description);
    if (!descriptionHtml) {
      renderPanelFallback(eventDetailsDescriptionEl, 'event_details_description_empty');
      applyTranslations();
      return;
    }

    eventDetailsDescriptionEl.innerHTML = descriptionHtml;
  };

  const renderEventDetailsError = (event) => {
    eventDetailsDescriptionEl.innerHTML = `
      <div class="alert alert-warning event-details-error" data-i18n="event_details_error_loading">
        Could not load event details.
      </div>
    `;
    eventDetailsPosterEl.innerHTML = '';
    setEventDetailsPosterLayout(false);
    renderEventDetailsInfo(event, {});
    applyTranslations();
  };

  const renderEventDetailsHeader = (event) => {
    const normalizedStatus = normalizeEventStatus(event.event_status);
    const statusMeta = EVENT_STATUS_META[normalizedStatus] || EVENT_STATUS_META.default;
    const statusLabel = normalizedStatus
      ? t(normalizedStatus, normalizedStatus)
      : t('event_details_not_available');
    const safeLogo = getSafeExternalUrl(event.eventlogo) || DEFAULT_EVENT_LOGO_URL;
    const safeCode = encodeURIComponent(event.code || '');

    eventDetailsTitleEl.textContent = String(event.name || t('event_details_default_name'));
    eventDetailsLogoEl.src = safeLogo;
    eventDetailsLogoEl.alt = String(event.name || t('event_details_default_name'));
    eventDetailsStatusBadgeEl.innerHTML = `
      <i class="bi ${statusMeta.icon}"></i>
      <span>${escapeHtml(statusLabel)}</span>
    `;

    if (safeCode) {
      eventDetailsGoToEventBtn.href = `home.html?eventId=${safeCode}`;
      eventDetailsGoToEventBtn.classList.remove('disabled');
      eventDetailsGoToEventBtn.removeAttribute('aria-disabled');
      eventDetailsGoToEventBtn.tabIndex = 0;
    } else {
      eventDetailsGoToEventBtn.href = '#';
      eventDetailsGoToEventBtn.classList.add('disabled');
      eventDetailsGoToEventBtn.setAttribute('aria-disabled', 'true');
      eventDetailsGoToEventBtn.tabIndex = -1;
    }
  };

  const openEventDetailsModal = async (event) => {
    if (!eventDetailsModal) {
      return;
    }

    renderEventDetailsHeader(event);
    renderEventDetailsLoading(event);
    eventDetailsModal.show();

    if (!event?.id) {
      renderEventDetailsError(event);
      return;
    }

    const requestId = ++activeDetailsRequestId;

    try {
      const response = await fetch(`${API_BASE_URL}/api/events/${encodeURIComponent(event.id)}/info`);
      if (!response.ok) {
        throw new Error(`Error fetching event details: ${response.status}`);
      }

      const info = await response.json();
      if (requestId !== activeDetailsRequestId) {
        return;
      }

      renderEventDetailsInfo(event, info || {});
      renderEventDetailsPoster(event, info || {});
      renderEventDetailsDescription(info || {});
      applyTranslations();
    } catch (error) {
      if (requestId !== activeDetailsRequestId) {
        return;
      }

      console.error('Failed to load event details:', error);
      renderEventDetailsError(event);
    }
  };

  const createEventCard = (event) => {
    const safeName = escapeHtml(event.name);
    const safeCode = encodeURIComponent(event.code || '');
    const safeLogo = escapeHtml(getSafeExternalUrl(event.eventlogo) || DEFAULT_EVENT_LOGO_URL);
    const safeEventId = escapeHtml(String(event.id ?? ''));
    const categories = parseEventCategories(event.category ?? event.categories);
    const showRegistrationPeriod =
      Number(event.has_registrations) === 1 && event.registration_start && event.registration_end;
    const categoriesMarkup = categories.length
      ? `
            <div class="d-flex flex-wrap justify-content-center gap-2 mb-3">
              ${categories.map((category) => `<span class="badge rounded-pill text-bg-secondary">${escapeHtml(category)}</span>`).join('')}
            </div>
          `
      : '';

    return `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card h-100">
          <div class="card-header fw-bold text-center">
            ${safeName}
          </div>
          <div class="card-body d-flex flex-column">
            <img
              src="${safeLogo}"
              class="img-fluid mb-3"
              style="height: 150px; width: 100%; object-fit: contain;"
              alt="${safeName}"
            >
            <p class="text-muted text-center d-flex align-items-center justify-content-center gap-2">
              <i class="bi bi-calendar3 text-primary"></i>
              <span>${formatEventDateRange(event.start, event.end)}</span>
            </p>
            ${categoriesMarkup}
            ${showRegistrationPeriod ? `
              <p class="text-muted text-center d-flex align-items-center justify-content-center gap-2 small">
                <i class="bi bi-pencil-square text-success"></i>
                <span><span data-i18n="registration_period">Registration</span>: ${formatFecha(event.registration_start)} / ${formatFecha(event.registration_end)}</span>
              </p>
            ` : ''}
            <div class="mt-auto">
              <button
                type="button"
                class="btn btn-outline-primary w-100 mb-2"
                data-open-event-details="true"
                data-event-id="${safeEventId}"
                ${safeEventId ? '' : 'disabled'}
              >
                <i class="bi bi-stars me-2"></i><span data-i18n="event_details_button">Event Details</span>
              </button>
              <a href="home.html?eventId=${safeCode}" class="btn btn-primary w-100" data-i18n="go_to_event">Go to Event</a>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const renderEmptyState = (translationKey) => {
    container.innerHTML = `
      <div class="alert alert-light border text-center mb-0" data-i18n="${translationKey}">
        ${translationKey}
      </div>
    `;
    applyTranslations();
  };

  const renderEvents = () => {
    const searchTerm = normalizeText(searchInput.value);

    const filteredEvents = allEvents.filter((event) => {
      const normalizedStatus = normalizeEventStatus(event.event_status);
      const matchesStatus = selectedStatusFilter === 'all' || normalizedStatus === selectedStatusFilter;
      const matchesSearch = !searchTerm || normalizeText(event.name).includes(searchTerm);
      const matchesCategory =
        !selectedCategoryFilter ||
        parseEventCategories(event.category ?? event.categories).some(
          (category) => normalizeText(category) === selectedCategoryFilter
        );

      return matchesStatus && matchesSearch && matchesCategory;
    });

    if (!filteredEvents.length) {
      renderEmptyState('no_events_found');
      return;
    }

    const sections = EVENT_STATUS_ORDER
      .map((status) => {
        const statusEvents = filteredEvents.filter(
          (event) => normalizeEventStatus(event.event_status) === status
        );
        const statusMeta = EVENT_STATUS_META[status] || EVENT_STATUS_META.default;

        if (!statusEvents.length) {
          return '';
        }

        return `
          <section class="card shadow-sm border-0">
            <div class="card-body">
              <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pb-2 border-bottom">
                <div class="d-flex align-items-center gap-3">
                  <div class="rounded-circle bg-light d-inline-flex align-items-center justify-content-center shadow-sm" style="width: 52px; height: 52px;">
                    <i class="bi ${statusMeta.icon} fs-4 ${statusMeta.iconClass}"></i>
                  </div>
                  <div>
                    <h2 class="h4 mb-0 fw-bold ${statusMeta.sectionClass}" style="letter-spacing: 0.02em;">
                      <span data-i18n="${status}">${status}</span>
                    </h2>
                  </div>
                </div>
                <span class="badge rounded-pill text-bg-light fs-6 px-3 py-2">${statusEvents.length}</span>
              </div>
              <div class="row g-4">
                ${statusEvents.map(createEventCard).join('')}
              </div>
            </div>
          </section>
        `;
      })
      .filter(Boolean)
      .join('');

    if (!sections) {
      renderEmptyState('no_events_found');
      return;
    }

    container.innerHTML = sections;
    applyTranslations();
  };

  const updateActiveFilter = (nextStatus) => {
    selectedStatusFilter = nextStatus;

    filterButtons.forEach((button) => {
      const isActive = button.dataset.statusFilter === nextStatus;
      button.classList.toggle('active', isActive);
      button.classList.toggle('btn-secondary', isActive);
      button.classList.toggle('btn-outline-secondary', !isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  showLoadingSpinner();

  searchInput.addEventListener('input', renderEvents);
  categoryFilterSelect?.addEventListener('change', () => {
    selectedCategoryFilter = normalizeText(categoryFilterSelect.value);
    renderEvents();
  });

  container.addEventListener('click', (domEvent) => {
    const detailsButton = domEvent.target.closest('[data-open-event-details="true"]');
    if (!detailsButton) {
      return;
    }

    const selectedEventId = String(detailsButton.dataset.eventId || '');
    const selectedEvent = allEvents.find((event) => String(event.id) === selectedEventId);
    if (!selectedEvent) {
      return;
    }

    openEventDetailsModal(selectedEvent);
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      updateActiveFilter(button.dataset.statusFilter || 'all');
      renderEvents();
    });
  });

  if (eventDetailsModalEl) {
    eventDetailsModalEl.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-poster-url]');
      if (!trigger || !eventPosterPreviewModal || !eventPosterPreviewImageEl) {
        return;
      }

      const posterUrl = getSafeExternalUrl(trigger.dataset.posterUrl);
      if (!posterUrl) {
        return;
      }

      const posterAlt = String(trigger.dataset.posterAlt || '').trim();
      eventPosterPreviewImageEl.src = posterUrl;
      eventPosterPreviewImageEl.alt = posterAlt;
      if (eventPosterPreviewTitleEl && posterAlt) {
        eventPosterPreviewTitleEl.textContent = posterAlt;
      }
      eventPosterPreviewModal.show();
    });

    eventDetailsModalEl.addEventListener('hidden.bs.modal', () => {
      activeDetailsRequestId += 1;
      eventDetailsPosterEl.innerHTML = '';
      eventDetailsDescriptionEl.innerHTML = '';
      eventDetailsInfoListEl.innerHTML = '';
      setEventDetailsPosterLayout(false);
    });
  }

  if (eventPosterPreviewModalEl) {
    eventPosterPreviewModalEl.addEventListener('hidden.bs.modal', () => {
      if (eventPosterPreviewImageEl) {
        eventPosterPreviewImageEl.removeAttribute('src');
        eventPosterPreviewImageEl.alt = '';
      }

      if (eventPosterPreviewTitleEl) {
        eventPosterPreviewTitleEl.textContent = t('event_details_poster_preview_title');
      }
    });
  }

  fetch(`${API_BASE_URL}/api/events`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Error fetching events: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      allEvents = Array.isArray(data)
        ? data
            .map((event) => ({
              ...event,
              event_status: normalizeEventStatus(event.event_status)
            }))
            .sort((left, right) => {
              const leftIndex = EVENT_STATUS_ORDER.indexOf(left.event_status);
              const rightIndex = EVENT_STATUS_ORDER.indexOf(right.event_status);
              const safeLeftIndex = leftIndex === -1 ? EVENT_STATUS_ORDER.length : leftIndex;
              const safeRightIndex = rightIndex === -1 ? EVENT_STATUS_ORDER.length : rightIndex;

              return safeLeftIndex - safeRightIndex;
            })
        : [];

      populateCategoryFilterOptions();
      updateActiveFilter('all');
      renderEvents();
    })
    .catch((error) => {
      console.error('Failed to load events:', error);
      container.innerHTML = `
        <div class="alert alert-danger text-center mt-4" data-i18n="error_loading_events">
          Error loading events
        </div>
      `;
      applyTranslations();
    });
});
