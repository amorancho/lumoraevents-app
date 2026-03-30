var title = 'Welcome';

const EVENT_STATUS_ORDER = ['en_curso', 'proximamente', 'finalizado'];
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

const formatFecha = (isoString) => {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('en-GB', { month: 'short' });
  return `${day}-${month}`;
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

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('eventsContainer');
  const searchInput = document.getElementById('eventSearchInput');
  const filterButtons = Array.from(document.querySelectorAll('[data-status-filter]'));

  let allEvents = [];
  let selectedStatusFilter = 'all';

  await ensureTranslationsReady();

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

  const createEventCard = (event) => {
    const normalizedStatus = normalizeEventStatus(event.event_status);
    const safeName = escapeHtml(event.name);
    const safeCode = encodeURIComponent(event.code || '');
    const safeLogo = escapeHtml(event.eventlogo || 'https://via.placeholder.com/300x180?text=Event');
    const showRegistrationPeriod =
      Number(event.has_registrations) === 1 && event.registration_start && event.registration_end;

    return `
      <div class="col-12 col-md-6 col-lg-3">
        <div class="card h-100">
          <div class="card-header fw-bold text-center">
            ${safeName}
          </div>
          <div class="card-body d-flex flex-column">
            <img
              src="${safeLogo}"
              class="img-fluid mb-3"
              style="height: 100px; width: 100%; object-fit: contain;"
              alt="${safeName}"
            >
            <p class="text-muted text-center d-flex align-items-center justify-content-center gap-2">
              <i class="bi bi-calendar3 text-primary"></i>
              <span>${formatFecha(event.start)} / ${formatFecha(event.end)}</span>
            </p>
            ${showRegistrationPeriod ? `
              <p class="text-muted text-center d-flex align-items-center justify-content-center gap-2 small">
                <i class="bi bi-pencil-square text-success"></i>
                <span><span data-i18n="registration_period">Registration</span>: ${formatFecha(event.registration_start)} / ${formatFecha(event.registration_end)}</span>
              </p>
            ` : ''}
            <div class="mt-auto">
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

      return matchesStatus && matchesSearch;
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

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      updateActiveFilter(button.dataset.statusFilter || 'all');
      renderEvents();
    });
  });

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
