const allowedRoles = ['admin', 'organizer'];

document.addEventListener('DOMContentLoaded', async () => {
  validateRoles(allowedRoles);

  await WaitEventLoaded();
  await ensureTranslationsReady();

  await renderDashboardOverview();
});

async function renderDashboardOverview() {
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
    getDashboardVisibilityLabel(currentEvent.visible),
    getDashboardVisibilityBadgeClass(currentEvent.visible)
  );

  setDashboardBadge(
    'dashboardVisibilityJudgesValue',
    getDashboardVisibilityLabel(currentEvent.visibleJudges),
    getDashboardVisibilityBadgeClass(currentEvent.visibleJudges)
  );

  setDashboardBadge(
    'dashboardVisibilityParticipantsValue',
    getDashboardVisibilityLabel(currentEvent.visibleParticipants),
    getDashboardVisibilityBadgeClass(currentEvent.visibleParticipants)
  );

  setDashboardBadge(
    'dashboardVisibilityScheduleValue',
    getDashboardVisibilityLabel(currentEvent.visibleSchedule),
    getDashboardVisibilityBadgeClass(currentEvent.visibleSchedule)
  );

  setDashboardBadge(
    'dashboardVisibilityResultsValue',
    getDashboardVisibilityLabel(currentEvent.visibleResults),
    getDashboardVisibilityBadgeClass(currentEvent.visibleResults)
  );

  setDashboardBadge(
    'dashboardVisibilityStatisticsValue',
    getDashboardVisibilityLabel(currentEvent.visibleStatistics),
    getDashboardVisibilityBadgeClass(currentEvent.visibleStatistics)
  );

  await loadDashboardEntityCounts(currentEvent);
}

window.renderDashboardOverview = renderDashboardOverview;

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

function getDashboardVisibilityLabel(rawVisibility) {
  return isDashboardVisibilityEnabled(rawVisibility) ? t('visibility_visible') : t('visibility_hidden');
}

function getDashboardVisibilityBadgeClass(rawVisibility) {
  return isDashboardVisibilityEnabled(rawVisibility) ? 'text-bg-success' : 'text-bg-secondary';
}

function isDashboardVisibilityEnabled(rawVisibility) {
  if (rawVisibility === true || rawVisibility === 1) return true;
  if (typeof rawVisibility === 'string') {
    const normalized = rawVisibility.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
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

const dashboardEntityOrder = [
  'categories',
  'styles',
  'criteria',
  'judges',
  'dancers',
  'competitions',
  'clubs'
];

async function loadDashboardEntityCounts(currentEvent) {
  renderDashboardEntityCounts(currentEvent, new Map());
  renderDashboardProgressFromPayload(null);
  renderDashboardCompetitionFlow(null);

  if (!currentEvent || !currentEvent.id) return;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/events/info-dashboard?event_id=${encodeURIComponent(currentEvent.id)}`
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status} loading info-dashboard`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.numRows) ? payload.numRows : [];
    const countMap = new Map();

    rows.forEach((row) => {
      if (!row || typeof row.entity !== 'string') return;
      countMap.set(row.entity.toLowerCase(), normalizeDashboardCount(row.num_regs));
    });

    renderDashboardEntityCounts(currentEvent, countMap);
    renderDashboardProgressFromPayload(payload);
    renderDashboardCompetitionFlow(payload);
  } catch (error) {
    console.error('Error loading dashboard entity counts:', error);
  }
}

function renderDashboardEntityCounts(currentEvent, countMap) {
  const line = document.getElementById('dashboardEntityCountsLine');
  if (!line) return;

  const entities = getDashboardVisibleEntities(currentEvent);
  const fragment = document.createDocumentFragment();

  entities.forEach((entity) => {
    const item = document.createElement('div');
    item.className = 'col-12 col-md-6 col-lg-4 col-xl';

    const body = document.createElement('div');
    body.className = 'dashboard-stat-box';

    const label = document.createElement('div');
    label.className = 'small text-uppercase text-body-secondary fw-semibold mb-1';
    label.textContent = t(`dashboard_count_${entity}`, entity);

    const value = document.createElement('div');
    value.className = 'h5 fw-semibold mb-0';
    const entityCount = countMap.get(entity);
    value.textContent = entityCount !== undefined ? String(entityCount) : '-';

    body.appendChild(label);
    body.appendChild(value);
    item.appendChild(body);
    fragment.appendChild(item);
  });

  line.replaceChildren(fragment);
}

function getDashboardVisibleEntities(currentEvent) {
  return dashboardEntityOrder.filter((entity) => {
    if (entity !== 'clubs') return true;
    return Boolean(currentEvent?.hasClubs);
  });
}

function normalizeDashboardCount(rawValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : '-';
}

function renderDashboardProgressFromPayload(payload) {
  const competitionsByStatus = Array.isArray(payload?.competitionsByStatus) ? payload.competitionsByStatus : [];
  const finishedCompetitions = competitionsByStatus.reduce((acc, row) => {
    if (!row || typeof row.status !== 'string') return acc;
    return row.status.toUpperCase() === 'FIN' ? acc + normalizeNumber(row.num_comps) : acc;
  }, 0);
  const totalCompetitions = normalizeNumber(payload?.numCompetitions);
  const routinesWithVotes = normalizeNumber(payload?.routinesWithVotes);
  const totalRoutines = normalizeNumber(payload?.totalRoutines);
  const totalVotes = normalizeNumber(payload?.totalVotes);

  setDashboardProgress(
    'dashboardCompetitionsProgressBar',
    'dashboardCompetitionsProgressText',
    finishedCompetitions,
    totalCompetitions
  );
  setDashboardProgress(
    'dashboardRoutinesProgressBar',
    'dashboardRoutinesProgressText',
    routinesWithVotes,
    totalRoutines
  );

  const votesElement = document.getElementById('dashboardTotalVotesValue');
  if (votesElement) {
    votesElement.textContent = totalVotes.toLocaleString();
  }
}

function renderDashboardCompetitionFlow(payload) {
  const actualCompetition = payload?.actualCompetitions || null;
  const nextCompetition = payload?.nextCompetition || null;

  setDashboardTextValue('dashboardActualCategoryValue', safeDashboardText(actualCompetition?.category_name));
  setDashboardTextValue('dashboardActualStyleValue', safeDashboardText(actualCompetition?.style_name));

  const actualFinished = normalizeOptionalNumber(actualCompetition?.finished) ?? 0;
  const actualParticipants = normalizeOptionalNumber(actualCompetition?.num_participants);
  setDashboardTextValue(
    'dashboardActualProgressValue',
    formatDashboardCompletion(actualFinished, actualParticipants)
  );
  setDashboardTextValue(
    'dashboardActualRemainingValue',
    formatDashboardMinutes(actualCompetition?.estimated_remaining_time_minutes)
  );

  setDashboardTextValue('dashboardNextCategoryValue', safeDashboardText(nextCompetition?.category_name));
  setDashboardTextValue('dashboardNextStyleValue', safeDashboardText(nextCompetition?.style_name));
  setDashboardCompetitionStatusBadge(nextCompetition?.status);
  setDashboardTextValue(
    'dashboardNextParticipantsValue',
    formatDashboardInteger(nextCompetition?.num_participants)
  );
  setDashboardTextValue(
    'dashboardNextDurationValue',
    formatDashboardMinutes(nextCompetition?.duration_minutes)
  );
}

function setDashboardProgress(progressBarId, progressTextId, completed, total) {
  const progressBar = document.getElementById(progressBarId);
  const progressText = document.getElementById(progressTextId);
  if (!progressBar || !progressText) return;

  const safeCompleted = Math.max(0, completed);
  const safeTotal = Math.max(0, total);
  const percent = safeTotal > 0 ? (safeCompleted / safeTotal) * 100 : 0;
  const roundedPercent = Math.round(percent * 10) / 10;
  const percentText = `${roundedPercent.toFixed(1)}%`;
  const fractionText = `${safeCompleted}/${safeTotal}`;
  const widthPercent = Math.min(100, Math.max(0, percent));
  const isComplete = widthPercent >= 100;
  const wrapperProgress = progressBar.closest('.progress');

  progressBar.style.width = `${widthPercent}%`;
  progressBar.classList.remove('bg-warning', 'bg-success');
  progressBar.classList.add(isComplete ? 'bg-success' : 'bg-warning');
  progressBar.textContent = '';

  progressText.classList.remove('text-dark', 'text-white');
  progressText.classList.add(isComplete ? 'text-white' : 'text-dark');
  progressText.textContent = `${fractionText} (${percentText})`;

  if (wrapperProgress) {
    wrapperProgress.setAttribute('aria-valuemin', '0');
    wrapperProgress.setAttribute('aria-valuemax', '100');
    wrapperProgress.setAttribute('aria-valuenow', String(Math.round(widthPercent)));
  }
}

function setDashboardTextValue(elementId, value) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = value;
}

function setDashboardCompetitionStatusBadge(statusCode) {
  const element = document.getElementById('dashboardNextStatusValue');
  if (!element) return;

  const normalizedStatus = String(statusCode || '').trim().toUpperCase();
  const label = getDashboardCompetitionStatusLabel(normalizedStatus);
  const className = getDashboardCompetitionStatusBadgeClass(normalizedStatus);

  element.textContent = label;
  element.className = `badge rounded-pill dashboard-competition-status-badge ${className}`;
}

function getDashboardCompetitionStatusLabel(statusCode) {
  if (statusCode === 'OPE') return t('dashboard_comp_status_ope', 'OPEN');
  if (statusCode === 'CLO') return t('dashboard_comp_status_clo', 'CLOSED');
  if (statusCode === 'FIN') return t('dashboard_comp_status_fin', 'FINISHED');
  if (!statusCode) return '-';
  return statusCode;
}

function getDashboardCompetitionStatusBadgeClass(statusCode) {
  if (statusCode === 'OPE') return 'text-bg-warning';
  if (statusCode === 'CLO') return 'text-bg-primary';
  if (statusCode === 'FIN') return 'text-bg-success';
  return 'text-bg-light';
}

function formatDashboardCompletion(completed, total) {
  if (total === null || total <= 0) return '-';
  const safeCompleted = Math.max(0, completed);
  const percent = (safeCompleted / total) * 100;
  return `${safeCompleted}/${total} (${percent.toFixed(1)}%)`;
}

function formatDashboardInteger(value) {
  const normalized = normalizeOptionalNumber(value);
  if (normalized === null) return '-';
  return String(Math.max(0, Math.trunc(normalized)));
}

function formatDashboardMinutes(value) {
  const normalized = normalizeOptionalNumber(value);
  if (normalized === null) return '-';
  return `${Math.max(0, Math.trunc(normalized))} ${t('dashboard_minutes_short', 'min')}`;
}

function safeDashboardText(value) {
  if (value === undefined || value === null) return '-';
  const text = String(value).trim();
  return text || '-';
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOptionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
