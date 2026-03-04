const allowedRoles = ['admin', 'organizer'];

document.addEventListener('DOMContentLoaded', async () => {
  validateRoles(allowedRoles);

  await WaitEventLoaded();
  await ensureTranslationsReady();

  renderDashboardOverview();
});

function renderDashboardOverview() {
  const currentEvent = getEvent();
  if (!currentEvent) return;

  updateElementProperty('dashboardEventName', 'textContent', currentEvent.name || '-');
  updateElementProperty('dashboardEventCode', 'textContent', currentEvent.code || eventId || '-');
  updateElementProperty('dashboardDateValue', 'textContent', formatDashboardDateRange(currentEvent.start, currentEvent.end));
  updateElementProperty('dashboardLanguageValue', 'textContent', formatDashboardLanguage(currentEvent.language));

  setDashboardBadge(
    'dashboardStatusValue',
    getDashboardStatusLabel(currentEvent.status),
    getDashboardStatusBadgeClass(currentEvent.status)
  );

  setDashboardBadge(
    'dashboardVisibilityValue',
    currentEvent.visible ? t('visibility_visible') : t('visibility_hidden'),
    currentEvent.visible ? 'text-bg-success' : 'text-bg-secondary'
  );
}

function setDashboardBadge(elementId, text, className) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.textContent = text || '-';
  element.className = `badge rounded-pill ${className}`;
}

function getDashboardStatusLabel(status) {
  if (status === 'upcoming') return t('status_upcoming');
  if (status === 'ongoing') return t('status_ongoing');
  if (status === 'finished') return t('status_finished');
  return t('status_unknown');
}

function getDashboardStatusBadgeClass(status) {
  if (status === 'upcoming') return 'text-bg-warning';
  if (status === 'ongoing') return 'text-bg-primary';
  if (status === 'finished') return 'text-bg-dark';
  return 'text-bg-secondary';
}

function formatDashboardDateRange(startDate, endDate) {
  if (!startDate && !endDate) {
    return '-';
  }

  const formattedStart = formatDashboardDate(startDate);
  const formattedEnd = formatDashboardDate(endDate);

  if (!startDate) return formattedEnd;
  if (!endDate) return formattedStart;

  return `${formattedStart} - ${formattedEnd}`;
}

function formatDashboardDate(dateValue) {
  if (!dateValue) return '-';

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return `${dateValue}`;
  }

  return parsedDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDashboardLanguage(language) {
  if (!language) return '-';
  return String(language).toUpperCase();
}
