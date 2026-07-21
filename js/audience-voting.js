const audienceVoteAllowedRoles = ['admin', 'organizer'];

const audienceVoteState = {
  sessions: [],
  competitions: [],
  selectedSessionId: null,
  selectedDetail: null,
  selectedResults: null,
  selectionVersion: 0,
  formMode: 'create',
  formSessionId: null,
  formNameDirty: false,
  formNameProgrammatic: false,
  pollingTimer: null,
  countdownTimer: null,
  pollInFlight: false,
  liveUpdateVersion: 0,
  countdownRefreshRequested: false,
  operationInFlight: false,
  redirectingForAuth: false,
  confirmAction: null,
  modals: {}
};

class AudienceVoteApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = 'AudienceVoteApiError';
    this.status = status;
    this.payload = payload;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!getUserFromToken()) {
    localStorage.removeItem('token');
    window.location.href = `login.html?eventId=${encodeURIComponent(eventId || '')}`;
    return;
  }
  if (!validateRoles(audienceVoteAllowedRoles)) return;

  await WaitEventLoaded();
  await ensureTranslationsReady();
  if (!ensureAudienceVotingEnabled()) return;

  audienceVoteState.modals.form = new bootstrap.Modal(document.getElementById('sessionFormModal'));
  audienceVoteState.modals.confirm = new bootstrap.Modal(document.getElementById('confirmActionModal'));
  audienceVoteState.modals.qr = new bootstrap.Modal(document.getElementById('qrModal'));

  bindAudienceVoteEvents();
  await loadAudienceVoteSessions({ keepSelection: false });
});

window.addEventListener('beforeunload', stopAudienceVoteLiveUpdates);

function bindAudienceVoteEvents() {
  document.getElementById('newSessionBtn').addEventListener('click', () => openSessionForm());
  document.getElementById('emptyNewSessionBtn').addEventListener('click', () => openSessionForm());
  document.getElementById('refreshSessionsBtn').addEventListener('click', async () => {
    await loadAudienceVoteSessions();
    if (audienceVoteState.selectedSessionId) {
      await selectAudienceVoteSession(audienceVoteState.selectedSessionId);
    }
  });
  document.getElementById('addCompetitionBtn').addEventListener('click', addCompetitionSelector);
  document.getElementById('saveSessionBtn').addEventListener('click', saveAudienceVoteSession);
  document.getElementById('durationPreset').addEventListener('change', syncCustomDurationVisibility);
  document.getElementById('sessionName').addEventListener('input', () => {
    if (!audienceVoteState.formNameProgrammatic) audienceVoteState.formNameDirty = true;
  });

  document.getElementById('competitionSelectors').addEventListener('change', (event) => {
    if (!event.target.matches('.audience-competition-select')) return;
    const selectedIds = getFormCompetitionIds(true);
    renderCompetitionSelectors(selectedIds);
    suggestAudienceVoteName();
  });

  document.getElementById('competitionSelectors').addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove-competition]');
    if (!removeButton) return;
    const rows = [...document.querySelectorAll('#competitionSelectors .audience-competition-row')];
    const index = Number(removeButton.dataset.removeCompetition);
    const selectedIds = rows
      .filter((_, rowIndex) => rowIndex !== index)
      .map(row => row.querySelector('.audience-competition-select')?.value || '');
    renderCompetitionSelectors(selectedIds.length ? selectedIds : ['']);
    suggestAudienceVoteName();
  });

  document.getElementById('sessionsList').addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-session-action]');
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
      await handleSessionAction(actionButton.dataset.sessionAction, Number(actionButton.dataset.sessionId));
      return;
    }

    const sessionItem = event.target.closest('[data-session-id]');
    if (sessionItem) await selectAudienceVoteSession(Number(sessionItem.dataset.sessionId));
  });

  document.getElementById('workspaceContent').addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-session-action]');
    if (actionButton) {
      await handleSessionAction(actionButton.dataset.sessionAction, Number(actionButton.dataset.sessionId));
      return;
    }

    const copyButton = event.target.closest('[data-copy-public-link]');
    if (copyButton) await copyAudienceVotePublicLink(copyButton.dataset.copyPublicLink);

    const qrButton = event.target.closest('[data-enlarge-qr]');
    if (qrButton) showLargeAudienceVoteQr(qrButton.dataset.enlargeQr);
  });

  document.getElementById('confirmActionBtn').addEventListener('click', async () => {
    if (!audienceVoteState.confirmAction || audienceVoteState.operationInFlight) return;
    const action = audienceVoteState.confirmAction;
    audienceVoteState.modals.confirm.hide();
    audienceVoteState.confirmAction = null;
    await action();
  });

  document.getElementById('sessionFormModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('sessionForm').classList.remove('was-validated');
  });
}

async function audienceVoteApi(path, options = {}) {
  const token = getToken();
  if (!token || !getUserFromToken()) {
    throw new AudienceVoteApiError(t('session_expired', 'Your session has expired. Please sign in again.'), 401);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': getCurrentAppLanguage(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.error || t('request_failed', 'The request could not be completed.');
    throw new AudienceVoteApiError(message, response.status, payload);
  }

  return payload;
}

function getAudienceVoteEventId() {
  return Number(getEvent().id);
}

function getAudienceVoteListPath() {
  return `/api/audience-vote-sessions?event_id=${encodeURIComponent(getAudienceVoteEventId())}`;
}

function getAudienceVoteDetailPath(sessionId) {
  return `/api/audience-vote-sessions/${encodeURIComponent(sessionId)}?event_id=${encodeURIComponent(getAudienceVoteEventId())}`;
}

function getAudienceVoteResultsPath(sessionId) {
  return `/api/audience-vote-sessions/${encodeURIComponent(sessionId)}/results?event_id=${encodeURIComponent(getAudienceVoteEventId())}`;
}

function getAudienceVotePublicUrl(publicCode) {
  const url = new URL('public-vote.html', window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('code', publicCode || '');
  url.searchParams.set('eventId', getAudienceVoteEventId());
  return url.toString();
}

async function loadAudienceVoteSessions({ keepSelection = true } = {}) {
  setSessionsLoading(true);
  clearPageAlert();

  try {
    const sessions = await audienceVoteApi(getAudienceVoteListPath());
    audienceVoteState.sessions = Array.isArray(sessions) ? sessions : [];

    if (!keepSelection || !audienceVoteState.sessions.some(session => Number(session.id) === Number(audienceVoteState.selectedSessionId))) {
      if (!keepSelection || audienceVoteState.selectedSessionId) clearAudienceVoteSelection();
    }

    renderAudienceVoteSessionList();
  } catch (error) {
    audienceVoteState.sessions = [];
    renderAudienceVoteSessionList();
    await handleAudienceVoteError(error);
  } finally {
    setSessionsLoading(false);
  }
}

function setSessionsLoading(isLoading) {
  document.getElementById('sessionsLoading').classList.toggle('d-none', !isLoading);
  document.getElementById('refreshSessionsBtn').disabled = isLoading;
  if (isLoading) {
    document.getElementById('sessionsEmpty').classList.add('d-none');
    document.getElementById('sessionsList').classList.add('d-none');
  }
}

function renderAudienceVoteSessionList() {
  const list = document.getElementById('sessionsList');
  const empty = document.getElementById('sessionsEmpty');
  const hasSessions = audienceVoteState.sessions.length > 0;

  empty.classList.toggle('d-none', hasSessions);
  list.classList.toggle('d-none', !hasSessions);

  list.innerHTML = audienceVoteState.sessions.map(session => {
    const isActive = Number(session.id) === Number(audienceVoteState.selectedSessionId);
    return `
      <article class="list-group-item audience-vote-session-item p-3${isActive ? ' active' : ''}" data-session-id="${Number(session.id)}" tabindex="0">
        <div class="d-flex align-items-start gap-2 mb-2 audience-vote-min-width-0">
          <div class="flex-grow-1 audience-vote-min-width-0">
            <h3 class="h6 mb-1 text-break">${escapeAudienceVoteHtml(session.name)}</h3>
            <div class="d-flex flex-wrap gap-1">${renderAudienceVoteStatusBadge(session)}</div>
          </div>
          <span class="small text-nowrap"><i class="bi bi-clock me-1"></i>${formatAudienceVoteDuration(session.duration_seconds)}</span>
        </div>
        ${session.opened_at ? `<div class="small mb-2"><span class="opacity-75">${escapeAudienceVoteHtml(t('opened_at', 'Opened'))}:</span> ${escapeAudienceVoteHtml(formatAudienceVoteDate(session.opened_at))}</div>` : ''}
        <div class="small mb-3">
          <i class="bi ${isAudienceVotePublished(session) ? 'bi-eye-fill' : 'bi-eye-slash'} me-1"></i>
          ${escapeAudienceVoteHtml(isAudienceVotePublished(session) ? t('results_published', 'Results published') : t('results_hidden', 'Results hidden'))}
        </div>
        <div class="d-flex flex-wrap gap-2">${renderAudienceVoteListActions(session)}</div>
      </article>
    `;
  }).join('');

  list.querySelectorAll('[data-session-id]').forEach(item => {
    item.addEventListener('keydown', async event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        await selectAudienceVoteSession(Number(item.dataset.sessionId));
      }
    });
  });
}

function renderAudienceVoteListActions(session) {
  const id = Number(session.id);
  const button = (action, label, icon, style = 'outline-primary') => `
    <button type="button" class="btn btn-sm btn-${style}" data-session-action="${action}" data-session-id="${id}">
      <i class="bi ${icon} me-1"></i>${escapeAudienceVoteHtml(label)}
    </button>`;

  if (session.status === 'DRA') {
    return [
      button('edit', t('edit', 'Edit'), 'bi-pencil'),
      button('open', t('open_voting', 'Open'), 'bi-play-fill', 'success'),
      button('delete', t('delete', 'Delete'), 'bi-trash', 'outline-danger')
    ].join('');
  }
  if (session.status === 'OPE') {
    return [
      button('control', t('control', 'Control'), 'bi-broadcast', 'primary'),
      button('close', t('close_voting', 'Close'), 'bi-stop-fill', 'warning'),
      button('cancel', t('cancel_voting', 'Cancel voting'), 'bi-x-octagon', 'outline-danger')
    ].join('');
  }
  if (session.status === 'CLO') {
    const actions = [button('results', t('view_results', 'View results'), 'bi-bar-chart-fill')];
    if (isAudienceVotePublished(session)) {
      actions.push(button('public', t('open_public_page', 'Public page'), 'bi-box-arrow-up-right', 'outline-secondary'));
    } else {
      actions.push(button('publish', t('publish_results', 'Publish results'), 'bi-eye-fill', 'success'));
    }
    return actions.join('');
  }
  return button('details', t('view_details', 'View details'), 'bi-info-circle', 'outline-secondary');
}

function renderAudienceVoteStatusBadge(session) {
  let label = t('status_draft', 'Draft');
  let style = 'secondary';
  if (session.status === 'OPE') {
    label = t('status_open', 'Open');
    style = 'success';
  } else if (session.status === 'CLO') {
    label = isAudienceVotePublished(session)
      ? t('status_closed_published', 'Closed · results published')
      : t('status_closed_hidden', 'Closed · results hidden');
    style = isAudienceVotePublished(session) ? 'primary' : 'dark';
  } else if (session.status === 'CAN') {
    label = t('status_cancelled', 'Cancelled');
    style = 'danger';
  }
  return `<span class="badge text-bg-${style}">${escapeAudienceVoteHtml(label)}</span>`;
}

async function selectAudienceVoteSession(sessionId) {
  const version = ++audienceVoteState.selectionVersion;
  stopAudienceVoteLiveUpdates();
  audienceVoteState.selectedSessionId = Number(sessionId);
  audienceVoteState.selectedDetail = null;
  audienceVoteState.selectedResults = null;
  renderAudienceVoteSessionList();
  setWorkspaceLoading(true);
  clearPageAlert();

  try {
    const detail = await audienceVoteApi(getAudienceVoteDetailPath(sessionId));
    if (version !== audienceVoteState.selectionVersion) return;
    audienceVoteState.selectedDetail = detail;
    await presentAudienceVoteDetail(detail, version);
  } catch (error) {
    if (version !== audienceVoteState.selectionVersion) return;
    setWorkspaceLoading(false);
    await handleAudienceVoteError(error, { reconcile: isAudienceVoteConflict(error) });
  }
}

async function presentAudienceVoteDetail(detail, version = audienceVoteState.selectionVersion) {
  if (!detail || version !== audienceVoteState.selectionVersion) return;
  audienceVoteState.selectedSessionId = Number(detail.id);
  audienceVoteState.selectedDetail = detail;
  stopAudienceVoteLiveUpdates();
  renderAudienceVoteSessionList();

  if (detail.status === 'OPE') {
    renderAudienceVoteControl(detail, 0);
    startAudienceVoteLiveUpdates(detail);
    setWorkspaceLoading(false);
    return;
  }

  if (detail.status === 'CLO') {
    setWorkspaceLoading(true);
    try {
      const results = await audienceVoteApi(getAudienceVoteResultsPath(detail.id));
      if (version !== audienceVoteState.selectionVersion) return;
      audienceVoteState.selectedResults = results;
      renderAudienceVoteResults(detail, results);
    } catch (error) {
      if (version === audienceVoteState.selectionVersion) await handleAudienceVoteError(error, { reconcile: isAudienceVoteConflict(error) });
    } finally {
      if (version === audienceVoteState.selectionVersion) setWorkspaceLoading(false);
    }
    return;
  }

  renderAudienceVoteDetail(detail);
  setWorkspaceLoading(false);
}

function setWorkspaceLoading(isLoading) {
  document.getElementById('workspaceLoading').classList.toggle('d-none', !isLoading);
  document.getElementById('workspaceEmpty').classList.add('d-none');
  if (isLoading) document.getElementById('workspaceContent').classList.add('d-none');
}

function showAudienceVoteWorkspace(markup) {
  const content = document.getElementById('workspaceContent');
  document.getElementById('workspaceLoading').classList.add('d-none');
  document.getElementById('workspaceEmpty').classList.add('d-none');
  content.innerHTML = markup;
  content.classList.remove('d-none');
}

function clearAudienceVoteSelection() {
  audienceVoteState.selectionVersion += 1;
  stopAudienceVoteLiveUpdates();
  audienceVoteState.selectedSessionId = null;
  audienceVoteState.selectedDetail = null;
  audienceVoteState.selectedResults = null;
  document.getElementById('workspaceLoading')?.classList.add('d-none');
  document.getElementById('workspaceContent')?.classList.add('d-none');
  document.getElementById('workspaceEmpty')?.classList.remove('d-none');
}

function renderAudienceVoteDetail(detail) {
  const competitions = Array.isArray(detail.competitions) ? detail.competitions : [];
  const publicUrl = getAudienceVotePublicUrl(detail.public_code);
  const isDraft = detail.status === 'DRA';
  const isCancelled = detail.status === 'CAN';

  showAudienceVoteWorkspace(`
    <div class="card shadow-sm mb-4">
      <div class="card-header d-flex flex-column flex-md-row gap-2 align-items-md-center">
        <div class="me-auto audience-vote-min-width-0">
          <div class="d-flex flex-wrap gap-2 align-items-center mb-1">${renderAudienceVoteStatusBadge(detail)}</div>
          <h2 class="h4 mb-0 text-break">${escapeAudienceVoteHtml(detail.name)}</h2>
        </div>
        <div class="d-flex flex-wrap gap-2">
          ${isDraft ? `<button type="button" class="btn btn-outline-primary" data-session-action="edit" data-session-id="${Number(detail.id)}"><i class="bi bi-pencil me-1"></i>${escapeAudienceVoteHtml(t('edit', 'Edit'))}</button>` : ''}
          ${isDraft ? `<button type="button" class="btn btn-success" data-session-action="open" data-session-id="${Number(detail.id)}"><i class="bi bi-play-fill me-1"></i>${escapeAudienceVoteHtml(t('open_voting', 'Open voting'))}</button>` : ''}
        </div>
      </div>
      <div class="card-body">
        ${isCancelled ? `<div class="alert alert-danger"><i class="bi bi-x-octagon me-2"></i>${escapeAudienceVoteHtml(t('cancelled_notice', 'This voting session was cancelled.'))}</div>` : ''}
        <div class="row g-3 mb-4">
          ${renderAudienceVoteMetric(t('duration', 'Duration'), formatAudienceVoteDuration(detail.duration_seconds), 'bi-clock')}
          ${renderAudienceVoteMetric(t('competitions', 'Competitions'), String(competitions.length), 'bi-trophy')}
          ${renderAudienceVoteMetric(t('candidates', 'Candidates'), String(countAudienceVoteCandidates(detail)), 'bi-people')}
        </div>
        ${renderAudienceVoteCompetitions(competitions)}
      </div>
    </div>
    ${renderAudienceVotePublicAccess(publicUrl, detail.public_code, 'detailPublicQr')}
  `);

  renderAudienceVoteQr('detailPublicQr', publicUrl, 180);
}

function renderAudienceVoteCompetitions(competitions) {
  if (!competitions.length) {
    return `<div class="alert alert-warning mb-0"><i class="bi bi-exclamation-triangle me-2"></i>${escapeAudienceVoteHtml(t('no_candidates', 'This session has no candidates.'))}</div>`;
  }

  return `<div class="vstack gap-3">${competitions.map(competition => {
    const candidates = Array.isArray(competition.candidates) ? competition.candidates : [];
    return `
      <section class="border rounded p-3">
        <div class="d-flex flex-column flex-sm-row gap-2 justify-content-between mb-3">
          <div>
            <h3 class="h6 mb-1">${escapeAudienceVoteHtml(competition.category_name)} · ${escapeAudienceVoteHtml(competition.style_name)}</h3>
            <span class="small text-body-secondary">${candidates.length} ${escapeAudienceVoteHtml(t('candidates_lower', 'candidates'))}</span>
          </div>
        </div>
        ${candidates.length ? `<div class="list-group">${candidates.map(candidate => `
          <div class="list-group-item">
            <div class="d-flex align-items-start gap-3">
              <span class="badge rounded-pill text-bg-light border text-dark">${Number(candidate.position) || '–'}</span>
              <div class="flex-grow-1 audience-vote-min-width-0">
                <div class="fw-semibold text-break">${escapeAudienceVoteHtml(candidate.dancer_name)}</div>
                <div class="small text-body-secondary">${escapeAudienceVoteHtml(candidate.club_name || t('no_school', 'No school'))}</div>
              </div>
            </div>
          </div>`).join('')}</div>` : `<div class="alert alert-warning mb-0">${escapeAudienceVoteHtml(t('competition_no_candidates', 'This competition has no candidates.'))}</div>`}
      </section>`;
  }).join('')}</div>`;
}

function renderAudienceVoteControl(detail, totalVotes) {
  const publicUrl = getAudienceVotePublicUrl(detail.public_code);
  showAudienceVoteWorkspace(`
    <div class="card border-success shadow-sm mb-4">
      <div class="card-header bg-success text-white d-flex flex-column flex-md-row align-items-md-center gap-2">
        <div class="me-auto">
          <div class="small text-uppercase fw-semibold"><i class="bi bi-broadcast me-2"></i>${escapeAudienceVoteHtml(t('voting_open', 'Voting open'))}</div>
          <h2 class="h4 mb-0 mt-1 text-break">${escapeAudienceVoteHtml(detail.name)}</h2>
        </div>
        <span class="badge text-bg-light fs-6" id="openVotesBadge">${Number(totalVotes) || 0} ${escapeAudienceVoteHtml(t('votes', 'votes'))}</span>
      </div>
      <div class="card-body text-center py-4 py-lg-5">
        <div class="small text-uppercase text-body-secondary fw-semibold" data-i18n="time_remaining">${escapeAudienceVoteHtml(t('time_remaining', 'Time remaining'))}</div>
        <div class="audience-vote-countdown fw-bold text-success lh-1 my-3" id="audienceVoteCountdown">--:--</div>
        <div class="text-body-secondary">
          ${escapeAudienceVoteHtml(t('scheduled_close', 'Scheduled close'))}: <strong>${escapeAudienceVoteHtml(formatAudienceVoteDate(detail.closes_at))}</strong>
        </div>
      </div>
      <div class="card-footer bg-body d-flex flex-column flex-sm-row gap-2 justify-content-center py-3">
        <button type="button" class="btn btn-warning" data-session-action="close" data-session-id="${Number(detail.id)}"><i class="bi bi-stop-fill me-1"></i>${escapeAudienceVoteHtml(t('close_voting', 'Close voting'))}</button>
        <button type="button" class="btn btn-outline-danger" data-session-action="cancel" data-session-id="${Number(detail.id)}"><i class="bi bi-x-octagon me-1"></i>${escapeAudienceVoteHtml(t('cancel_voting', 'Cancel voting'))}</button>
      </div>
    </div>
    ${renderAudienceVotePublicAccess(publicUrl, detail.public_code, 'controlPublicQr')}
  `);
  renderAudienceVoteQr('controlPublicQr', publicUrl, 200);
  updateAudienceVoteCountdown();
}

function renderAudienceVoteResults(detail, results) {
  const totalVotes = Number(results?.total_votes) || 0;
  const rankedCandidates = buildAudienceVoteRanking(results);
  const maxVotes = totalVotes > 0 && rankedCandidates.length ? rankedCandidates[0].votes : null;
  const published = isAudienceVotePublished(detail) || Number(results?.session?.results_published) === 1;
  const publicUrl = getAudienceVotePublicUrl(detail.public_code);

  showAudienceVoteWorkspace(`
    <div class="card shadow-sm mb-4">
      <div class="card-header d-flex flex-column flex-md-row gap-3 align-items-md-center">
        <div class="me-auto audience-vote-min-width-0">
          <div class="d-flex flex-wrap gap-2 align-items-center mb-1">${renderAudienceVoteStatusBadge({ ...detail, results_published: published ? 1 : 0 })}</div>
          <h2 class="h4 mb-0 text-break">${escapeAudienceVoteHtml(detail.name)}</h2>
        </div>
        <div class="text-md-end">
          <div class="display-6 fw-bold">${totalVotes}</div>
          <div class="small text-body-secondary">${escapeAudienceVoteHtml(t('total_votes', 'Total votes'))}</div>
        </div>
      </div>
      <div class="card-body">
        ${totalVotes === 0 ? `<div class="alert alert-info"><i class="bi bi-info-circle me-2"></i>${escapeAudienceVoteHtml(t('ended_without_votes', 'The session ended without votes. No winner has been selected.'))}</div>` : ''}
        ${renderAudienceVoteRanking(rankedCandidates, maxVotes, totalVotes)}
      </div>
    </div>
    <div class="alert ${published ? 'alert-success' : 'alert-warning'} d-flex flex-column flex-md-row align-items-md-center gap-3">
      <div class="me-auto"><i class="bi ${published ? 'bi-check-circle-fill' : 'bi-eye-slash-fill'} me-2"></i><strong>${escapeAudienceVoteHtml(published ? t('results_published', 'Results published') : t('results_not_published', 'Results not published yet'))}</strong></div>
      ${published ? '' : `<button type="button" class="btn btn-success flex-shrink-0" data-session-action="publish" data-session-id="${Number(detail.id)}"><i class="bi bi-eye-fill me-1"></i>${escapeAudienceVoteHtml(t('publish_results', 'Publish results'))}</button>`}
    </div>
    ${published ? renderAudienceVotePublicAccess(publicUrl, detail.public_code, 'resultsPublicQr') : ''}
  `);
  if (published) renderAudienceVoteQr('resultsPublicQr', publicUrl, 180);
}

function buildAudienceVoteRanking(results) {
  const flattened = [];
  (results?.competitions || []).forEach(competition => {
    (competition.candidates || []).forEach(candidate => {
      flattened.push({
        ...candidate,
        votes: Number(candidate.votes) || 0,
        percentage: Number(candidate.percentage) || 0,
        category_name: competition.category_name,
        style_name: competition.style_name,
        competition_position: Number(competition.position) || 0
      });
    });
  });

  flattened.sort((a, b) =>
    b.votes - a.votes ||
    a.competition_position - b.competition_position ||
    Number(a.position || 0) - Number(b.position || 0) ||
    String(a.dancer_name || '').localeCompare(String(b.dancer_name || ''))
  );

  let previousVotes = null;
  let previousRank = 0;
  return flattened.map((candidate, index) => {
    const rank = previousVotes === candidate.votes ? previousRank : index + 1;
    previousVotes = candidate.votes;
    previousRank = rank;
    return { ...candidate, rank };
  });
}

function renderAudienceVoteRanking(candidates, maxVotes, totalVotes) {
  if (!candidates.length) {
    return `<div class="text-center text-body-secondary py-4">${escapeAudienceVoteHtml(t('no_result_candidates', 'There are no candidates in these results.'))}</div>`;
  }

  const winnerCount = totalVotes > 0 ? candidates.filter(candidate => candidate.votes === maxVotes).length : 0;
  return `<div class="vstack gap-3">${candidates.map(candidate => {
    const isWinner = totalVotes > 0 && candidate.votes === maxVotes;
    return `
      <article class="border rounded p-3 ${isWinner ? 'border-warning bg-warning-subtle' : ''}">
        <div class="d-flex flex-column flex-sm-row align-items-sm-center gap-3">
          <div class="audience-vote-ranking-position rounded-circle d-flex align-items-center justify-content-center fw-bold ${isWinner ? 'text-bg-warning' : 'text-bg-light border'}">${candidate.rank}</div>
          <div class="flex-grow-1 audience-vote-min-width-0">
            <div class="d-flex flex-wrap gap-2 align-items-center">
              <h3 class="h6 mb-0 text-break">${escapeAudienceVoteHtml(candidate.dancer_name)}</h3>
              ${isWinner ? `<span class="badge text-bg-warning"><i class="bi bi-trophy-fill me-1"></i>${escapeAudienceVoteHtml(winnerCount > 1 ? t('tied_winner', 'Tied winner') : t('winner', 'Winner'))}</span>` : ''}
            </div>
            <div class="small text-body-secondary mt-1">${escapeAudienceVoteHtml(candidate.club_name || t('no_school', 'No school'))}</div>
            <div class="small mt-1">${escapeAudienceVoteHtml(candidate.category_name)} · ${escapeAudienceVoteHtml(candidate.style_name)}</div>
          </div>
          <div class="text-sm-end">
            <div class="h4 mb-0">${candidate.votes}</div>
            <div class="small text-body-secondary">${escapeAudienceVoteHtml(formatAudienceVotePercentage(candidate.percentage))}</div>
          </div>
        </div>
      </article>`;
  }).join('')}</div>`;
}

function renderAudienceVoteMetric(label, value, icon) {
  return `
    <div class="col-12 col-sm-4">
      <div class="border rounded h-100 p-3">
        <div class="small text-body-secondary"><i class="bi ${icon} me-1"></i>${escapeAudienceVoteHtml(label)}</div>
        <div class="h5 mb-0 mt-1">${escapeAudienceVoteHtml(value)}</div>
      </div>
    </div>`;
}

function renderAudienceVotePublicAccess(publicUrl, publicCode, qrElementId) {
  return `
    <div class="card shadow-sm">
      <div class="card-header"><h2 class="h5 mb-0"><i class="bi bi-qr-code me-2"></i>${escapeAudienceVoteHtml(t('public_access', 'Public access'))}</h2></div>
      <div class="card-body">
        <div class="row g-4 align-items-center">
          <div class="col-12 col-md-8">
            <label class="form-label" for="${qrElementId}Link">${escapeAudienceVoteHtml(t('public_link', 'Public link'))}</label>
            <div class="input-group mb-3">
              <input type="text" class="form-control" id="${qrElementId}Link" value="${escapeAudienceVoteAttribute(publicUrl)}" readonly>
              <button type="button" class="btn btn-outline-primary" data-copy-public-link="${escapeAudienceVoteAttribute(publicUrl)}"><i class="bi bi-copy me-1"></i>${escapeAudienceVoteHtml(t('copy', 'Copy'))}</button>
            </div>
            <div class="d-flex flex-wrap gap-2">
              <a class="btn btn-outline-secondary" href="${escapeAudienceVoteAttribute(publicUrl)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>${escapeAudienceVoteHtml(t('open_new_tab', 'Open in new tab'))}</a>
              <button type="button" class="btn btn-outline-secondary" data-enlarge-qr="${escapeAudienceVoteAttribute(publicUrl)}"><i class="bi bi-arrows-fullscreen me-1"></i>${escapeAudienceVoteHtml(t('enlarge_qr', 'Enlarge QR'))}</button>
            </div>
            <div class="small text-body-secondary text-break mt-3">${escapeAudienceVoteHtml(t('public_code', 'Public code'))}: ${escapeAudienceVoteHtml(publicCode)}</div>
          </div>
          <div class="col-12 col-md-4 text-center">
            <button type="button" class="btn p-2 border bg-white" data-enlarge-qr="${escapeAudienceVoteAttribute(publicUrl)}" aria-label="${escapeAudienceVoteAttribute(t('enlarge_qr', 'Enlarge QR'))}">
              <span id="${qrElementId}" class="audience-vote-qr d-flex align-items-center justify-content-center"></span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

async function handleSessionAction(action, sessionId) {
  if (audienceVoteState.operationInFlight) return;
  const listSession = audienceVoteState.sessions.find(session => Number(session.id) === Number(sessionId));

  if (action === 'details' || action === 'control' || action === 'results') {
    await selectAudienceVoteSession(sessionId);
    return;
  }
  if (action === 'public') {
    const publicCode = listSession?.public_code || audienceVoteState.selectedDetail?.public_code;
    window.open(getAudienceVotePublicUrl(publicCode), '_blank', 'noopener');
    return;
  }
  if (action === 'edit') {
    const detail = await ensureAudienceVoteDetail(sessionId);
    if (detail) await openSessionForm(detail);
    return;
  }
  if (action === 'open') {
    const detail = await ensureAudienceVoteDetail(sessionId);
    if (detail) confirmOpenAudienceVote(detail);
    return;
  }
  if (action === 'delete') {
    confirmDeleteAudienceVote(listSession);
    return;
  }
  if (action === 'close') {
    confirmCloseAudienceVote(listSession || audienceVoteState.selectedDetail);
    return;
  }
  if (action === 'cancel') {
    confirmCancelAudienceVote(listSession || audienceVoteState.selectedDetail);
    return;
  }
  if (action === 'publish') {
    confirmPublishAudienceVote(listSession || audienceVoteState.selectedDetail);
  }
}

async function ensureAudienceVoteDetail(sessionId) {
  if (Number(audienceVoteState.selectedDetail?.id) === Number(sessionId)) return audienceVoteState.selectedDetail;
  clearPageAlert();
  try {
    const detail = await audienceVoteApi(getAudienceVoteDetailPath(sessionId));
    audienceVoteState.selectedSessionId = Number(sessionId);
    audienceVoteState.selectedDetail = detail;
    renderAudienceVoteSessionList();
    if (detail.status === 'DRA' || detail.status === 'CAN') {
      renderAudienceVoteDetail(detail);
    }
    return detail;
  } catch (error) {
    await handleAudienceVoteError(error, { reconcile: isAudienceVoteConflict(error) });
    return null;
  }
}

function confirmOpenAudienceVote(detail) {
  const competitions = detail.competitions || [];
  const candidateCount = countAudienceVoteCandidates(detail);
  const approximateClose = new Date(Date.now() + Number(detail.duration_seconds || 0) * 1000);
  showAudienceVoteConfirmation({
    title: t('confirm_open_title', 'Open voting session'),
    confirmLabel: t('open_voting', 'Open voting'),
    confirmStyle: 'success',
    body: `
      <p>${escapeAudienceVoteHtml(t('confirm_open_text', 'Check the session before opening it.'))}</p>
      ${candidateCount === 0 ? `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>${escapeAudienceVoteHtml(t('no_candidates', 'This session has no candidates.'))}</div>` : ''}
      <dl class="row mb-0">
        <dt class="col-5">${escapeAudienceVoteHtml(t('name', 'Name'))}</dt><dd class="col-7">${escapeAudienceVoteHtml(detail.name)}</dd>
        <dt class="col-5">${escapeAudienceVoteHtml(t('competitions', 'Competitions'))}</dt><dd class="col-7">${escapeAudienceVoteHtml(competitions.map(item => `${item.category_name} · ${item.style_name}`).join(', ') || '—')}</dd>
        <dt class="col-5">${escapeAudienceVoteHtml(t('candidates', 'Candidates'))}</dt><dd class="col-7">${candidateCount}</dd>
        <dt class="col-5">${escapeAudienceVoteHtml(t('duration', 'Duration'))}</dt><dd class="col-7">${escapeAudienceVoteHtml(formatAudienceVoteDuration(detail.duration_seconds))}</dd>
        <dt class="col-5">${escapeAudienceVoteHtml(t('approximate_close', 'Approximate close'))}</dt><dd class="col-7">${escapeAudienceVoteHtml(formatAudienceVoteDate(approximateClose.toISOString()))}</dd>
      </dl>`,
    action: () => runAudienceVoteOperation(detail.id, 'open')
  });
}

function confirmCloseAudienceVote(session) {
  if (!session) return;
  showAudienceVoteConfirmation({
    title: t('confirm_close_title', 'Close voting'),
    confirmLabel: t('close_voting', 'Close voting'),
    confirmStyle: 'warning',
    body: `<p class="mb-0">${escapeAudienceVoteHtml(t('confirm_close_text', 'No more votes will be accepted. Results will remain hidden until you publish them.'))}</p>`,
    action: () => runAudienceVoteOperation(session.id, 'close')
  });
}

function confirmCancelAudienceVote(session) {
  if (!session) return;
  showAudienceVoteConfirmation({
    title: t('confirm_cancel_title', 'Cancel voting session'),
    confirmLabel: t('cancel_voting', 'Cancel voting'),
    confirmStyle: 'danger',
    body: `<div class="alert alert-danger mb-0"><strong>${escapeAudienceVoteHtml(t('dangerous_action', 'Dangerous action'))}.</strong> ${escapeAudienceVoteHtml(t('confirm_cancel_text', 'The session will be cancelled and cannot be resumed.'))}</div>`,
    action: () => runAudienceVoteOperation(session.id, 'cancel')
  });
}

function confirmDeleteAudienceVote(session) {
  if (!session) return;
  showAudienceVoteConfirmation({
    title: t('confirm_delete_title', 'Delete session'),
    confirmLabel: t('delete', 'Delete'),
    confirmStyle: 'danger',
    body: `<p class="mb-0">${escapeAudienceVoteHtml(t('confirm_delete_text', 'Permanently delete this draft session?'))} <strong>${escapeAudienceVoteHtml(session.name)}</strong></p>`,
    action: () => deleteAudienceVoteSession(session.id)
  });
}

function confirmPublishAudienceVote(session) {
  if (!session) return;
  showAudienceVoteConfirmation({
    title: t('confirm_publish_title', 'Publish results'),
    confirmLabel: t('publish_results', 'Publish results'),
    confirmStyle: 'success',
    body: `<p class="mb-0">${escapeAudienceVoteHtml(t('confirm_publish_text', 'The results will become available through the public link.'))}</p>`,
    action: () => runAudienceVoteOperation(session.id, 'publish')
  });
}

function showAudienceVoteConfirmation({ title, body, confirmLabel, confirmStyle, action }) {
  hideAudienceVoteModalsExcept('confirm');
  document.getElementById('confirmActionModalLabel').textContent = title;
  document.getElementById('confirmActionModalBody').innerHTML = body;
  const button = document.getElementById('confirmActionBtn');
  button.className = `btn btn-${confirmStyle}`;
  button.querySelector('.button-label').textContent = confirmLabel;
  audienceVoteState.confirmAction = action;
  audienceVoteState.modals.confirm.show();
}

async function runAudienceVoteOperation(sessionId, action) {
  if (audienceVoteState.operationInFlight) return;
  audienceVoteState.operationInFlight = true;
  disableAudienceVoteActionButtons(true);
  clearPageAlert();

  try {
    const detail = await audienceVoteApi(`/api/audience-vote-sessions/${encodeURIComponent(sessionId)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ event_id: getAudienceVoteEventId() })
    });
    audienceVoteState.selectedSessionId = Number(detail.id);
    audienceVoteState.selectedDetail = detail;
    audienceVoteState.selectionVersion += 1;
    await loadAudienceVoteSessions();
    await presentAudienceVoteDetail(detail);
    showToastNotice(getAudienceVoteOperationSuccess(action), 'success');
  } catch (error) {
    await handleAudienceVoteError(error, { reconcile: isAudienceVoteConflict(error) });
  } finally {
    audienceVoteState.operationInFlight = false;
    disableAudienceVoteActionButtons(false);
  }
}

async function deleteAudienceVoteSession(sessionId) {
  if (audienceVoteState.operationInFlight) return;
  audienceVoteState.operationInFlight = true;
  disableAudienceVoteActionButtons(true);
  clearPageAlert();
  try {
    await audienceVoteApi(`/api/audience-vote-sessions/${encodeURIComponent(sessionId)}?event_id=${encodeURIComponent(getAudienceVoteEventId())}`, { method: 'DELETE' });
    if (Number(audienceVoteState.selectedSessionId) === Number(sessionId)) clearAudienceVoteSelection();
    await loadAudienceVoteSessions();
    showToastNotice(t('session_deleted', 'Voting session deleted.'), 'success');
  } catch (error) {
    await handleAudienceVoteError(error, { reconcile: isAudienceVoteConflict(error) });
  } finally {
    audienceVoteState.operationInFlight = false;
    disableAudienceVoteActionButtons(false);
  }
}

function getAudienceVoteOperationSuccess(action) {
  const messages = {
    open: t('session_opened', 'Voting session opened.'),
    close: t('session_closed', 'Voting session closed.'),
    cancel: t('session_cancelled', 'Voting session cancelled.'),
    publish: t('session_published', 'Results published.')
  };
  return messages[action] || t('operation_completed', 'Operation completed.');
}

async function openSessionForm(detail = null) {
  hideAudienceVoteModalsExcept('form');
  audienceVoteState.formMode = detail ? 'edit' : 'create';
  audienceVoteState.formSessionId = detail ? Number(detail.id) : null;
  audienceVoteState.formNameDirty = Boolean(detail);
  document.getElementById('sessionFormModalLabel').textContent = detail ? t('edit_session', 'Edit session') : t('new_session', 'New session');
  document.getElementById('sessionName').value = detail?.name || '';
  setAudienceVoteDuration(detail?.duration_seconds || 300);
  document.getElementById('sessionForm').classList.remove('was-validated');
  audienceVoteState.modals.form.show();

  document.getElementById('competitionsFormLoading').classList.remove('d-none');
  document.getElementById('competitionSelectors').innerHTML = '';
  document.getElementById('addCompetitionBtn').disabled = true;
  document.getElementById('saveSessionBtn').disabled = true;
  try {
    await loadAudienceVoteCompetitions();
    const selectedIds = detail?.competitions?.map(item => String(item.competition_id)) || [''];
    renderCompetitionSelectors(selectedIds.length ? selectedIds : ['']);
    if (!detail) suggestAudienceVoteName();
  } catch (error) {
    audienceVoteState.modals.form.hide();
    await handleAudienceVoteError(error);
  } finally {
    document.getElementById('competitionsFormLoading').classList.add('d-none');
    document.getElementById('addCompetitionBtn').disabled = false;
    document.getElementById('saveSessionBtn').disabled = false;
  }
}

async function loadAudienceVoteCompetitions() {
  const competitions = await audienceVoteApi(`/api/competitions?event_id=${encodeURIComponent(getAudienceVoteEventId())}`);
  audienceVoteState.competitions = Array.isArray(competitions) ? competitions : [];
}

function renderCompetitionSelectors(selectedIds = ['']) {
  const normalized = selectedIds.length ? selectedIds.map(String) : [''];
  const selectedSet = new Set(normalized.filter(Boolean));
  const container = document.getElementById('competitionSelectors');

  if (!audienceVoteState.competitions.length) {
    container.innerHTML = `<div class="alert alert-warning mb-0">${escapeAudienceVoteHtml(t('no_competitions_available', 'There are no available competitions.'))}</div>`;
    document.getElementById('addCompetitionBtn').disabled = true;
    return;
  }

  container.innerHTML = normalized.map((selectedId, index) => {
    const competition = audienceVoteState.competitions.find(item => String(item.id) === selectedId);
    return `
      <div class="audience-competition-row border rounded p-3">
        <div class="d-flex gap-2 align-items-start">
          <div class="flex-grow-1">
            <select class="form-select audience-competition-select" aria-label="${escapeAudienceVoteAttribute(t('competition', 'Competition'))}" required>
              <option value="">${escapeAudienceVoteHtml(t('select_competition', 'Select a competition'))}</option>
              ${audienceVoteState.competitions.map(item => {
                const id = String(item.id);
                const disabled = selectedSet.has(id) && id !== selectedId;
                const label = `${item.category_name} · ${item.style_name}`;
                return `<option value="${escapeAudienceVoteAttribute(id)}"${id === selectedId ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeAudienceVoteHtml(label)}</option>`;
              }).join('')}
            </select>
            ${competition ? `<div class="small text-body-secondary mt-2"><strong>${escapeAudienceVoteHtml(String(competition.category_name || '').toUpperCase())}</strong> · <strong>${escapeAudienceVoteHtml(String(competition.style_name || '').toUpperCase())}</strong> · ${Number(competition.num_dancers) || 0} ${escapeAudienceVoteHtml(t('registered_candidates', 'registered candidates'))}</div>` : ''}
          </div>
          <button type="button" class="btn btn-outline-danger" data-remove-competition="${index}" ${normalized.length === 1 ? 'disabled' : ''} aria-label="${escapeAudienceVoteAttribute(t('remove_competition', 'Remove competition'))}"><i class="bi bi-trash"></i></button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('addCompetitionBtn').disabled = normalized.length >= audienceVoteState.competitions.length;
}

function addCompetitionSelector() {
  const selectedIds = [...document.querySelectorAll('.audience-competition-select')].map(select => select.value);
  if (selectedIds.length >= audienceVoteState.competitions.length) return;
  renderCompetitionSelectors([...selectedIds, '']);
}

function getFormCompetitionIds(includeEmpty = false) {
  return [...document.querySelectorAll('.audience-competition-select')]
    .map(select => select.value)
    .filter(value => includeEmpty || value)
    .map(value => includeEmpty && !value ? '' : Number(value));
}

function suggestAudienceVoteName() {
  const ids = getFormCompetitionIds();
  if (ids.length !== 1 || audienceVoteState.formNameDirty) return;
  const competition = audienceVoteState.competitions.find(item => Number(item.id) === Number(ids[0]));
  if (!competition) return;
  audienceVoteState.formNameProgrammatic = true;
  document.getElementById('sessionName').value = `${String(competition.category_name || '').toUpperCase()} - ${String(competition.style_name || '').toUpperCase()}`;
  audienceVoteState.formNameProgrammatic = false;
}

function setAudienceVoteDuration(durationSeconds) {
  const seconds = Number(durationSeconds) || 300;
  const preset = document.getElementById('durationPreset');
  if ([60, 180, 300, 600].includes(seconds)) {
    preset.value = String(seconds);
    document.getElementById('customDuration').value = '';
  } else {
    preset.value = 'custom';
    document.getElementById('customDuration').value = String(seconds / 60);
  }
  syncCustomDurationVisibility();
}

function syncCustomDurationVisibility() {
  const custom = document.getElementById('durationPreset').value === 'custom';
  document.getElementById('customDurationGroup').classList.toggle('d-none', !custom);
  document.getElementById('customDuration').required = custom;
}

function getFormDurationSeconds() {
  const preset = document.getElementById('durationPreset').value;
  if (preset !== 'custom') return Number(preset);
  const minutes = Number(document.getElementById('customDuration').value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
}

async function saveAudienceVoteSession() {
  if (audienceVoteState.operationInFlight) return;
  const form = document.getElementById('sessionForm');
  const competitionIds = getFormCompetitionIds();
  const uniqueIds = [...new Set(competitionIds)];
  const name = document.getElementById('sessionName').value.trim();
  const durationSeconds = getFormDurationSeconds();
  const valid = name && durationSeconds > 0 && uniqueIds.length > 0 && uniqueIds.length === competitionIds.length;

  form.classList.add('was-validated');
  document.querySelectorAll('.audience-competition-select').forEach(select => select.classList.toggle('is-invalid', !select.value));
  document.getElementById('customDuration').classList.toggle('is-invalid', document.getElementById('durationPreset').value === 'custom' && !durationSeconds);
  if (!valid) {
    showPageAlert(t('form_invalid', 'Complete all required fields and select each competition only once.'), 'warning');
    return;
  }

  const body = {
    event_id: getAudienceVoteEventId(),
    name,
    duration_seconds: durationSeconds,
    competition_ids: uniqueIds
  };
  const isEdit = audienceVoteState.formMode === 'edit';
  const path = isEdit
    ? `/api/audience-vote-sessions/${encodeURIComponent(audienceVoteState.formSessionId)}`
    : '/api/audience-vote-sessions';
  const button = document.getElementById('saveSessionBtn');
  audienceVoteState.operationInFlight = true;
  setAudienceVoteButtonBusy(button, true, t('saving', 'Saving...'));
  clearPageAlert();

  try {
    const detail = await audienceVoteApi(path, {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    audienceVoteState.modals.form.hide();
    audienceVoteState.selectedSessionId = Number(detail.id);
    audienceVoteState.selectedDetail = detail;
    audienceVoteState.selectionVersion += 1;
    await loadAudienceVoteSessions();
    await presentAudienceVoteDetail(detail);
    showToastNotice(isEdit ? t('session_updated', 'Session updated.') : t('session_created', 'Session created.'), 'success');
  } catch (error) {
    if (isAudienceVoteConflict(error)) audienceVoteState.modals.form.hide();
    await handleAudienceVoteError(error, { reconcile: isAudienceVoteConflict(error) });
  } finally {
    audienceVoteState.operationInFlight = false;
    setAudienceVoteButtonBusy(button, false);
  }
}

function startAudienceVoteLiveUpdates(detail) {
  stopAudienceVoteLiveUpdates();
  audienceVoteState.countdownRefreshRequested = false;
  audienceVoteState.countdownTimer = window.setInterval(updateAudienceVoteCountdown, 250);
  audienceVoteState.pollingTimer = window.setInterval(pollAudienceVoteResults, 4000);
  pollAudienceVoteResults();
}

function stopAudienceVoteLiveUpdates() {
  audienceVoteState.liveUpdateVersion += 1;
  if (audienceVoteState.pollingTimer) window.clearInterval(audienceVoteState.pollingTimer);
  if (audienceVoteState.countdownTimer) window.clearInterval(audienceVoteState.countdownTimer);
  audienceVoteState.pollingTimer = null;
  audienceVoteState.countdownTimer = null;
  audienceVoteState.pollInFlight = false;
}

async function pollAudienceVoteResults() {
  const detail = audienceVoteState.selectedDetail;
  if (!detail || detail.status !== 'OPE' || audienceVoteState.pollInFlight) return;
  const sessionId = Number(detail.id);
  const version = audienceVoteState.selectionVersion;
  const liveUpdateVersion = audienceVoteState.liveUpdateVersion;
  audienceVoteState.pollInFlight = true;
  try {
    const results = await audienceVoteApi(getAudienceVoteResultsPath(sessionId));
    if (
      version !== audienceVoteState.selectionVersion ||
      liveUpdateVersion !== audienceVoteState.liveUpdateVersion ||
      Number(audienceVoteState.selectedSessionId) !== sessionId
    ) return;
    const badge = document.getElementById('openVotesBadge');
    if (badge) badge.textContent = `${Number(results?.total_votes) || 0} ${t('votes', 'votes')}`;

    if (results?.session?.status && results.session.status !== 'OPE') {
      stopAudienceVoteLiveUpdates();
      await loadAudienceVoteSessions();
      await selectAudienceVoteSession(sessionId);
    }
  } catch (error) {
    if (version !== audienceVoteState.selectionVersion || liveUpdateVersion !== audienceVoteState.liveUpdateVersion) return;
    if (isAudienceVoteConflict(error)) {
      stopAudienceVoteLiveUpdates();
      await handleAudienceVoteError(error, { reconcile: true });
    } else if (error.status === 401) {
      await handleAudienceVoteError(error);
    }
  } finally {
    if (liveUpdateVersion === audienceVoteState.liveUpdateVersion) {
      audienceVoteState.pollInFlight = false;
    }
  }
}

function updateAudienceVoteCountdown() {
  const element = document.getElementById('audienceVoteCountdown');
  const detail = audienceVoteState.selectedDetail;
  if (!element || !detail?.closes_at) return;
  const remaining = Math.max(0, new Date(detail.closes_at).getTime() - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  element.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  element.classList.toggle('text-danger', remaining <= 30000);
  element.classList.toggle('text-success', remaining > 30000);

  if (remaining <= 0 && !audienceVoteState.countdownRefreshRequested) {
    audienceVoteState.countdownRefreshRequested = true;
    refreshAudienceVoteAfterCountdown(detail.id);
  }
}

async function refreshAudienceVoteAfterCountdown(sessionId) {
  try {
    const detail = await audienceVoteApi(getAudienceVoteDetailPath(sessionId));
    if (Number(audienceVoteState.selectedSessionId) !== Number(sessionId)) return;
    if (detail.status !== 'OPE') {
      audienceVoteState.selectedDetail = detail;
      audienceVoteState.selectionVersion += 1;
      await loadAudienceVoteSessions();
      await presentAudienceVoteDetail(detail);
    }
  } catch (error) {
    await handleAudienceVoteError(error, { reconcile: isAudienceVoteConflict(error) });
  }
}

async function copyAudienceVotePublicLink(url) {
  try {
    await copyTextToClipboard(url);
    showToastNotice(t('link_copied', 'Public link copied.'), 'success');
  } catch (error) {
    console.error('Could not copy audience voting link:', error);
    showToastNotice(t('copy_failed', 'Could not copy the public link.'), 'danger');
  }
}

function renderAudienceVoteQr(elementId, url, size) {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.innerHTML = '';
    if (typeof QRCode !== 'function') {
      element.innerHTML = `<span class="small text-danger">${escapeAudienceVoteHtml(t('qr_unavailable', 'QR could not be generated.'))}</span>`;
      return;
    }
    new QRCode(element, {
      text: url,
      width: size,
      height: size,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  });
}

function showLargeAudienceVoteQr(url) {
  hideAudienceVoteModalsExcept('qr');
  document.getElementById('qrModalLink').textContent = url;
  audienceVoteState.modals.qr.show();
  renderAudienceVoteQr('qrModalCode', url, 320);
}

function hideAudienceVoteModalsExcept(name) {
  Object.entries(audienceVoteState.modals).forEach(([key, modal]) => {
    if (key !== name) modal?.hide();
  });
}

function setAudienceVoteButtonBusy(button, busy, busyLabel = '') {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${escapeAudienceVoteHtml(busyLabel)}`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function disableAudienceVoteActionButtons(disabled) {
  document.querySelectorAll('[data-session-action]').forEach(button => { button.disabled = disabled; });
}

async function handleAudienceVoteError(error, { reconcile = false } = {}) {
  console.error('Audience voting request failed:', error);
  const message = error instanceof AudienceVoteApiError
    ? error.message
    : t('network_error', 'Network error. Check your connection and try again.');
  showPageAlert(message, 'danger');
  showToastNotice(message, 'danger', { delay: 5000 });

  if (error?.status === 401 && !audienceVoteState.redirectingForAuth) {
    audienceVoteState.redirectingForAuth = true;
    stopAudienceVoteLiveUpdates();
    localStorage.removeItem('token');
    window.setTimeout(() => {
      window.location.href = `login.html?eventId=${encodeURIComponent(eventId || '')}`;
    }, 1200);
    return;
  }

  if (reconcile) await reconcileAudienceVoteState();
}

async function reconcileAudienceVoteState() {
  const selectedId = audienceVoteState.selectedSessionId;
  await loadAudienceVoteSessions();
  if (selectedId && audienceVoteState.sessions.some(session => Number(session.id) === Number(selectedId))) {
    await selectAudienceVoteSession(selectedId);
  }
}

function isAudienceVoteConflict(error) {
  return error instanceof AudienceVoteApiError && error.status === 409;
}

function showPageAlert(message, type = 'danger') {
  const alert = document.getElementById('pageAlert');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
}

function clearPageAlert() {
  const alert = document.getElementById('pageAlert');
  alert.className = 'alert d-none';
  alert.textContent = '';
}

function countAudienceVoteCandidates(detail) {
  return (detail?.competitions || []).reduce((total, competition) => total + (competition.candidates || []).length, 0);
}

function isAudienceVotePublished(session) {
  return Number(session?.results_published) === 1;
}

function formatAudienceVoteDuration(seconds) {
  const minutes = Number(seconds || 0) / 60;
  const value = Number.isInteger(minutes) ? String(minutes) : String(Math.round(minutes * 10) / 10);
  return `${value} ${t('minutes_short', 'min')}`;
}

function formatAudienceVoteDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(getCurrentAppLanguage(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatAudienceVotePercentage(value) {
  return new Intl.NumberFormat(getCurrentAppLanguage(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value) || 0) + '%';
}

function escapeAudienceVoteHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAudienceVoteAttribute(value) {
  return escapeAudienceVoteHtml(value).replace(/`/g, '&#096;');
}

function renderAudienceVotePage() {
  renderAudienceVoteSessionList();
  const detail = audienceVoteState.selectedDetail;
  if (!detail) return;
  if (detail.status === 'OPE') {
    const currentVotes = Number(document.getElementById('openVotesBadge')?.textContent?.match(/\d+/)?.[0]) || 0;
    renderAudienceVoteControl(detail, currentVotes);
  } else if (detail.status === 'CLO' && audienceVoteState.selectedResults) {
    renderAudienceVoteResults(detail, audienceVoteState.selectedResults);
  } else {
    renderAudienceVoteDetail(detail);
  }
}

window.renderAudienceVotePage = renderAudienceVotePage;
