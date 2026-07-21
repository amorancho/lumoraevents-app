const publicVoteState = {
  code: '',
  data: null,
  selectedCandidateId: null,
  requestInFlight: false,
  voteInFlight: false,
  pollTimer: null,
  countdownTimer: null,
  destroyed: false,
  renderSignature: '',
  clockRemainingAtSync: 0,
  clockSyncedAt: 0,
  countdownRefreshRequested: false,
  eventLanguageApplied: false,
  chromeReady: false,
  eventPermissionChecked: false,
  feedback: null,
  confirmModal: null
};

class PublicVoteError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await ensureTranslationsReady();

  if (eventId) {
    await WaitEventLoaded();
    const currentEvent = getEvent();
    if (!ensureAudienceVotingEnabled()) return;
    setPublicPageEventContext(currentEvent, { fallbackName: t('title', 'Audience voting') });
    publicVoteState.chromeReady = true;
  }

  publicVoteState.confirmModal = new bootstrap.Modal(document.getElementById('confirmPublicVoteModal'));
  bindPublicVoteEvents();

  publicVoteState.code = (new URLSearchParams(window.location.search).get('code') || '').trim();
  configurePublicVotesBackLink();
  if (!publicVoteState.code) {
    setPublicPageEventContext({}, { fallbackName: t('title', 'Audience voting'), homeUrl: 'index.html' });
    publicVoteState.chromeReady = true;
    showPublicVoteError(t('missing_code', 'The voting code is missing.'), false);
    return;
  }

  await loadPublicVoteSession({ initial: true, forceRender: true });
});

window.addEventListener('beforeunload', destroyPublicVotePage);

function bindPublicVoteEvents() {
  document.getElementById('retryPublicVoteBtn').addEventListener('click', () => loadPublicVoteSession({ initial: true, forceRender: true }));
  document.getElementById('publicVoteContent').addEventListener('change', event => {
    if (!event.target.matches('input[name="public-candidate"]')) return;
    publicVoteState.selectedCandidateId = Number(event.target.value);
    syncPublicCandidateSelection();
  });
  document.getElementById('publicVoteContent').addEventListener('click', event => {
    if (event.target.closest('#submitPublicVoteBtn')) openPublicVoteConfirmation();
  });
  document.getElementById('confirmPublicVoteBtn').addEventListener('click', async () => {
    if (publicVoteState.voteInFlight) return;
    publicVoteState.confirmModal.hide();
    await submitPublicVote();
  });
}

function configurePublicVotesBackLink() {
  if (!publicVoteState.code) return;
  const sourceEventId = getPublicVoteSourceEventId();

  const normalizedEventId = Number(sourceEventId);
  if (!Number.isInteger(normalizedEventId) || normalizedEventId <= 0) return;

  const button = document.getElementById('backToPublicVotesBtn');
  button.href = `public-votes.html?eventId=${encodeURIComponent(normalizedEventId)}`;
  document.getElementById('backToPublicVotesContainer').classList.remove('d-none');
}

function getPublicVoteSourceEventId() {
  const urlEventId = new URLSearchParams(window.location.search).get('eventId');
  if (urlEventId) return urlEventId;

  let sourceEventId = null;

  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer?.origin === window.location.origin && referrer.pathname.endsWith('/public-votes.html')) {
      sourceEventId = referrer.searchParams.get('eventId');
    }
  } catch (_error) {
    sourceEventId = null;
  }

  if (!sourceEventId) {
    try {
      sourceEventId = sessionStorage.getItem(`publicAudienceVoteEventId:${publicVoteState.code}`);
    } catch (_error) {
      sourceEventId = null;
    }
  }

  return sourceEventId;
}

async function publicVoteRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Accept-Language': getCurrentAppLanguage(),
        ...(options.headers || {})
      }
    });
  } catch (_error) {
    throw new PublicVoteError(t('network_error', 'Network error. Check your connection and try again.'));
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }
  if (!response.ok) throw new PublicVoteError(payload?.error || t('request_error', 'The request could not be completed.'), response.status);
  return { payload, status: response.status };
}

async function loadPublicVoteSession({ initial = false, forceRender = false } = {}) {
  if (publicVoteState.requestInFlight || publicVoteState.destroyed || !publicVoteState.code) return;
  publicVoteState.requestInFlight = true;
  clearPublicVotePoll();
  if (initial && !publicVoteState.data) setPublicVoteLoading(true);

  try {
    const { payload } = await publicVoteRequest(`/public/audience-votes/${encodeURIComponent(publicVoteState.code)}`);
    if (publicVoteState.destroyed) return;

    if (!publicVoteState.eventPermissionChecked) {
      const hasPermission = await initializePublicVoteEventPermission(payload);
      if (!hasPermission) {
        publicVoteState.destroyed = true;
        return;
      }
    }

    publicVoteState.data = payload;
    syncPublicVoteClock(payload);
    preservePublicVoteSelection(payload);
    if (payload?.session?.status === 'OPE' && !payload?.is_closed) ensurePublicVoteCountdown();

    if (!publicVoteState.eventLanguageApplied) {
      publicVoteState.eventLanguageApplied = true;
      const eventLanguage = String(payload?.event?.language || '').toLowerCase();
      if (!localStorage.getItem('lang') && ['es', 'en', 'it', 'fr', 'pt'].includes(eventLanguage)) {
        await changeLanguage(eventLanguage);
      }
    }

    if (!publicVoteState.chromeReady) {
      setPublicPageEventContext(payload.event || {}, { fallbackName: t('title', 'Audience voting'), homeUrl: 'index.html' });
      publicVoteState.chromeReady = true;
    }

    const signature = getPublicVoteRenderSignature(payload);
    if (forceRender || signature !== publicVoteState.renderSignature) {
      publicVoteState.renderSignature = signature;
      renderPublicVotePage();
    }
    schedulePublicVotePoll();
  } catch (error) {
    const fatal = error instanceof PublicVoteError && error.status === 404;
    if (initial || fatal || !publicVoteState.data) {
      if (!publicVoteState.chromeReady) {
        setPublicPageEventContext({}, { fallbackName: t('title', 'Audience voting'), homeUrl: 'index.html' });
        publicVoteState.chromeReady = true;
      }
      showPublicVoteError(error.message, !fatal);
    } else {
      schedulePublicVotePoll();
    }
  } finally {
    publicVoteState.requestInFlight = false;
    setPublicVoteLoading(false);
  }
}

async function initializePublicVoteEventPermission(payload) {
  let sourceEventId = payload?.event?.id || payload?.session?.event_id || null;

  const competitionId = payload?.competitions?.[0]?.id;
  if (!sourceEventId && competitionId) {
    const competitionResponse = await fetch(`${API_BASE_URL}/api/competitions/${encodeURIComponent(competitionId)}`);
    if (competitionResponse.ok) {
      const competition = await competitionResponse.json();
      sourceEventId = competition?.event_id;
    }
  }

  sourceEventId ||= getPublicVoteSourceEventId();

  const normalizedEventId = Number(sourceEventId);
  if (!Number.isInteger(normalizedEventId) || normalizedEventId <= 0) {
    setPublicPageEventContext(payload?.event || {}, { fallbackName: t('title', 'Audience voting'), homeUrl: 'index.html' });
    publicVoteState.chromeReady = true;
    publicVoteState.eventPermissionChecked = true;
    return ensureAudienceVotingEnabled();
  }

  let currentEvent = getEvent();
  if (Number(currentEvent?.id) !== normalizedEventId) {
    const eventResponse = await fetch(`${API_BASE_URL}/api/events/${encodeURIComponent(normalizedEventId)}`);
    if (!eventResponse.ok) {
      throw new PublicVoteError(t('request_error', 'The request could not be completed.'), eventResponse.status);
    }

    currentEvent = await eventResponse.json();
  }

  setPublicPageEventContext(currentEvent, { fallbackName: t('title', 'Audience voting') });
  publicVoteState.chromeReady = true;
  publicVoteState.eventPermissionChecked = true;

  try {
    sessionStorage.setItem(`publicAudienceVoteEventId:${publicVoteState.code}`, String(normalizedEventId));
  } catch (_error) {
    // El permiso ya está validado aunque el navegador no permita sessionStorage.
  }

  configurePublicVotesBackLink();
  return ensureAudienceVotingEnabled();
}

function getPublicVoteRenderSignature(data) {
  return JSON.stringify({
    event: data?.event,
    session: data?.session,
    has_voted: data?.has_voted,
    is_closed: data?.is_closed,
    results_available: data?.results_available,
    competitions: data?.competitions,
    results: data?.results,
    feedback: publicVoteState.feedback
  });
}

function preservePublicVoteSelection(data) {
  if (data?.has_voted || data?.session?.status !== 'OPE' || data?.is_closed) {
    publicVoteState.selectedCandidateId = null;
    return;
  }
  if (publicVoteState.selectedCandidateId == null) return;
  const exists = (data.competitions || []).some(competition =>
    (competition.candidates || []).some(candidate => Number(candidate.id) === Number(publicVoteState.selectedCandidateId))
  );
  if (!exists) publicVoteState.selectedCandidateId = null;
}

function syncPublicVoteClock(data) {
  const serverTime = new Date(data?.server_time).getTime();
  const closesAt = new Date(data?.session?.closes_at).getTime();
  publicVoteState.clockRemainingAtSync = Number.isFinite(serverTime) && Number.isFinite(closesAt)
    ? Math.max(0, closesAt - serverTime)
    : 0;
  publicVoteState.clockSyncedAt = Date.now();
  publicVoteState.countdownRefreshRequested = false;
}

function getPublicVoteRemainingMs() {
  return Math.max(0, publicVoteState.clockRemainingAtSync - (Date.now() - publicVoteState.clockSyncedAt));
}

function schedulePublicVotePoll() {
  clearPublicVotePoll();
  const data = publicVoteState.data;
  if (!data || publicVoteState.destroyed) return;

  if (data.session?.status !== 'OPE' || data.is_closed) stopPublicVoteCountdown();

  let delay = null;
  if (data.session?.status === 'DRA') delay = 5000;
  else if (data.session?.status === 'OPE' && !data.is_closed) delay = 5000;
  else if ((data.session?.status === 'CLO' || data.is_closed) && !data.results_available) delay = 7500;

  if (delay) publicVoteState.pollTimer = window.setTimeout(() => loadPublicVoteSession(), delay);
  else if (data.session?.status === 'CAN' || data.results_available) stopPublicVoteCountdown();
}

function clearPublicVotePoll() {
  if (publicVoteState.pollTimer) window.clearTimeout(publicVoteState.pollTimer);
  publicVoteState.pollTimer = null;
}

function stopPublicVoteCountdown() {
  if (publicVoteState.countdownTimer) window.clearInterval(publicVoteState.countdownTimer);
  publicVoteState.countdownTimer = null;
}

function ensurePublicVoteCountdown() {
  if (!publicVoteState.countdownTimer && !publicVoteState.destroyed) {
    publicVoteState.countdownTimer = window.setInterval(updatePublicVoteCountdown, 250);
  }
}

function destroyPublicVotePage() {
  publicVoteState.destroyed = true;
  clearPublicVotePoll();
  stopPublicVoteCountdown();
}

function updatePublicVoteCountdown() {
  const countdown = document.getElementById('publicVoteCountdown');
  if (!countdown || publicVoteState.data?.session?.status !== 'OPE') return;
  const remaining = getPublicVoteRemainingMs();
  const totalSeconds = Math.ceil(remaining / 1000);
  countdown.textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  countdown.classList.toggle('text-danger', totalSeconds <= 30);
  countdown.classList.toggle('text-success', totalSeconds > 30);

  if (remaining <= 0) {
    setPublicVoteControlsDisabled(true);
    if (!publicVoteState.countdownRefreshRequested && !publicVoteState.voteInFlight) {
      publicVoteState.countdownRefreshRequested = true;
      loadPublicVoteSession({ forceRender: true });
    }
  }
}

function renderPublicVotePage() {
  if (!publicVoteState.data) return;
  hidePublicVoteError();
  renderPublicVoteHero(publicVoteState.data);
  const data = publicVoteState.data;

  if (data.session?.status === 'CAN') renderCancelledPublicVote();
  else if (data.results_available && data.results) renderPublishedPublicVoteResults();
  else if (data.session?.status === 'DRA') renderDraftPublicVote();
  else if (data.session?.status === 'OPE' && !data.is_closed) renderOpenPublicVote();
  else if (data.session?.status === 'CLO' || data.is_closed) renderClosedPublicVote();
  else renderDraftPublicVote();
}

function renderPublicVoteHero(data) {
  const event = data.event || {};
  const session = data.session || {};
  const competitions = [...(data.competitions || [])].sort((a, b) => Number(a.position) - Number(b.position));
  document.getElementById('publicVoteHeroContent').innerHTML = `
    <div class="d-flex flex-column flex-sm-row align-items-sm-center gap-3">
      ${event.logo ? `<img class="public-vote-event-logo border" src="${escapePublicVoteAttribute(event.logo)}" alt="${escapePublicVoteAttribute(event.name || '')}">` : `<div class="public-vote-event-logo border d-flex align-items-center justify-content-center text-primary"><i class="bi bi-stars fs-1"></i></div>`}
      <div class="flex-grow-1 public-vote-min-width-0">
        <div class="small text-body-secondary">${escapePublicVoteHtml(formatPublicVoteEventDates(event.start, event.end))}</div>
        <h1 class="h4 mb-1 text-break">${escapePublicVoteHtml(event.name)}</h1>
        <h2 class="h5 mb-2 text-break">${escapePublicVoteHtml(session.name)}</h2>
        <div class="d-flex flex-wrap gap-2">${competitions.map(competition => `<span class="badge text-bg-light border text-dark">${escapePublicVoteHtml(competition.category_name)} · ${escapePublicVoteHtml(competition.style_name)}</span>`).join('')}</div>
      </div>
      ${event.url ? `<a class="btn btn-sm btn-outline-secondary" href="${escapePublicVoteAttribute(event.url)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-box-arrow-up-right me-1"></i>${escapePublicVoteHtml(t('official_website', 'Official website'))}</a>` : ''}
    </div>`;
  document.getElementById('publicVoteHero').classList.remove('d-none');
}

function renderDraftPublicVote() {
  showPublicVoteContent(`
    ${renderPublicVoteFeedback()}
    <section class="card public-vote-panel text-center">
      <div class="card-body py-5 px-3">
        <i class="bi bi-hourglass-split text-primary" style="font-size:3.5rem"></i>
        <h2 class="h3 mt-3">${escapePublicVoteHtml(t('not_open_title', 'Voting has not opened yet'))}</h2>
        <p class="text-body-secondary mb-0">${escapePublicVoteHtml(t('not_open_text', 'Keep this page open. Voting will appear here when the organizer opens it.'))}</p>
        <div class="spinner-grow spinner-grow-sm text-primary mt-4" role="status"><span class="visually-hidden">${escapePublicVoteHtml(t('checking_status', 'Checking status...'))}</span></div>
      </div>
    </section>`);
}

function renderOpenPublicVote() {
  const data = publicVoteState.data;
  if (data.has_voted) {
    showPublicVoteContent(`
      ${renderPublicVoteFeedback()}
      <section class="card public-vote-panel text-center border border-success">
        <div class="card-body py-5 px-3">
          <i class="bi bi-check-circle-fill text-success" style="font-size:4rem"></i>
          <h2 class="h3 mt-3">${escapePublicVoteHtml(t('vote_registered_title', 'Your vote is registered'))}</h2>
          <p class="text-body-secondary mb-0">${escapePublicVoteHtml(t('vote_registered_text', 'Thank you. Results will be shown here when they become available.'))}</p>
        </div>
      </section>`);
    return;
  }

  const competitions = [...(data.competitions || [])].sort((a, b) => Number(a.position) - Number(b.position));
  const candidateCount = competitions.reduce((total, competition) => total + (competition.candidates || []).length, 0);
  showPublicVoteContent(`
    ${renderPublicVoteFeedback()}
    <section class="card public-vote-panel border border-success mb-4">
      <div class="card-body text-center py-4">
        <span class="badge text-bg-success fs-6"><i class="bi bi-broadcast me-1"></i>${escapePublicVoteHtml(t('voting_open', 'Voting open'))}</span>
        <div class="small text-uppercase text-body-secondary fw-semibold mt-4">${escapePublicVoteHtml(t('time_remaining', 'Time remaining'))}</div>
        <div class="public-vote-countdown fw-bold text-success lh-1 my-2" id="publicVoteCountdown">--:--</div>
      </div>
    </section>
    <form id="publicCandidateForm">
      <div class="vstack gap-4">${competitions.map(renderPublicVoteCompetition).join('')}</div>
      ${candidateCount > 0 ? `<div class="d-grid mt-4"><button type="button" class="btn btn-primary btn-lg" id="submitPublicVoteBtn" disabled><i class="bi bi-check2-circle me-1"></i>${escapePublicVoteHtml(t('submit_vote', 'Submit vote'))}</button></div>` : `<div class="alert alert-warning">${escapePublicVoteHtml(t('no_candidates', 'There are no candidates available in this voting session.'))}</div>`}
    </form>`);
  syncPublicCandidateSelection();
  updatePublicVoteCountdown();
}

function renderPublicVoteCompetition(competition) {
  const candidates = [...(competition.candidates || [])].sort((a, b) => Number(a.position) - Number(b.position));
  return `
    <fieldset class="card public-vote-panel">
      <legend class="card-header h5 mb-0 px-4 py-3">${escapePublicVoteHtml(competition.category_name)} · ${escapePublicVoteHtml(competition.style_name)}</legend>
      <div class="card-body p-3 p-md-4">
        <div class="row g-3">${candidates.map(candidate => renderPublicCandidateCard(candidate)).join('')}</div>
        ${candidates.length ? '' : `<div class="text-body-secondary text-center py-3">${escapePublicVoteHtml(t('competition_no_candidates', 'No candidates are available in this competition.'))}</div>`}
      </div>
    </fieldset>`;
}

function renderPublicCandidateCard(candidate) {
  const checked = Number(publicVoteState.selectedCandidateId) === Number(candidate.id);
  return `
    <div class="col-12 col-md-6">
      <label class="public-candidate-card p-3 p-md-4 h-100" for="publicCandidate${Number(candidate.id)}">
        <input class="visually-hidden" type="radio" name="public-candidate" id="publicCandidate${Number(candidate.id)}" value="${Number(candidate.id)}"${checked ? ' checked' : ''}>
        <span class="d-flex align-items-start gap-3">
          <span class="badge rounded-pill text-bg-light border text-dark">${Number(candidate.position) || '—'}</span>
          <span class="flex-grow-1 public-vote-min-width-0">
            <span class="d-block fs-5 fw-bold text-break">${escapePublicVoteHtml(candidate.name)}</span>
            ${candidate.club_name ? `<span class="d-block text-body-secondary mt-1"><i class="bi bi-building me-1"></i>${escapePublicVoteHtml(candidate.club_name)}</span>` : ''}
          </span>
          ${candidate.nationality ? `<span class="badge text-bg-light border text-dark">${escapePublicVoteHtml(candidate.nationality)}</span>` : ''}
        </span>
      </label>
    </div>`;
}

function syncPublicCandidateSelection() {
  document.querySelectorAll('input[name="public-candidate"]').forEach(input => {
    input.checked = Number(input.value) === Number(publicVoteState.selectedCandidateId);
  });
  const button = document.getElementById('submitPublicVoteBtn');
  if (button) button.disabled = publicVoteState.selectedCandidateId == null || publicVoteState.voteInFlight || getPublicVoteRemainingMs() <= 0;
}

function openPublicVoteConfirmation() {
  if (publicVoteState.selectedCandidateId == null || publicVoteState.voteInFlight) return;
  const candidate = findPublicVoteCandidate(publicVoteState.selectedCandidateId);
  if (!candidate) return;
  document.getElementById('confirmPublicVoteQuestion').textContent = t('confirm_vote_question', 'Do you confirm your vote for {name}?').replace('{name}', candidate.name || '');
  publicVoteState.confirmModal.show();
}

async function submitPublicVote() {
  const candidate = findPublicVoteCandidate(publicVoteState.selectedCandidateId);
  if (!candidate || publicVoteState.voteInFlight) return;
  publicVoteState.voteInFlight = true;
  clearPublicVotePoll();
  setPublicVoteControlsDisabled(true);

  try {
    const { payload, status } = await publicVoteRequest(`/public/audience-votes/${encodeURIComponent(publicVoteState.code)}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: Number(candidate.id) })
    });
    if (status === 201) {
      publicVoteState.data.has_voted = true;
      publicVoteState.selectedCandidateId = null;
      publicVoteState.feedback = { type: 'success', message: payload?.message || t('vote_success', 'Your vote was submitted successfully.') };
      publicVoteState.renderSignature = '';
      renderPublicVotePage();
      schedulePublicVotePoll();
    }
  } catch (error) {
    publicVoteState.feedback = { type: 'danger', message: error.message || t('request_error', 'The request could not be completed.') };
    if (error.status === 409 || error.status === 400) {
      publicVoteState.renderSignature = '';
      await loadPublicVoteSession({ forceRender: true });
    } else {
      renderPublicVotePage();
      schedulePublicVotePoll();
    }
  } finally {
    publicVoteState.voteInFlight = false;
    if (!publicVoteState.data?.has_voted && publicVoteState.data?.session?.status === 'OPE' && !publicVoteState.data?.is_closed) {
      setPublicVoteControlsDisabled(false);
      syncPublicCandidateSelection();
    }
  }
}

function setPublicVoteControlsDisabled(disabled) {
  document.querySelectorAll('input[name="public-candidate"], #submitPublicVoteBtn').forEach(control => { control.disabled = disabled; });
}

function findPublicVoteCandidate(candidateId) {
  for (const competition of publicVoteState.data?.competitions || []) {
    const candidate = (competition.candidates || []).find(item => Number(item.id) === Number(candidateId));
    if (candidate) return candidate;
  }
  return null;
}

function renderClosedPublicVote() {
  showPublicVoteContent(`
    ${renderPublicVoteFeedback()}
    <section class="card public-vote-panel text-center">
      <div class="card-body py-5 px-3">
        <i class="bi bi-stop-circle text-body-secondary" style="font-size:4rem"></i>
        <h2 class="h3 mt-3">${escapePublicVoteHtml(t('voting_finished', 'Voting has ended'))}</h2>
        <p class="text-body-secondary mb-0">${escapePublicVoteHtml(t('results_soon', 'Results will be published soon.'))}</p>
        <div class="spinner-grow spinner-grow-sm text-primary mt-4" role="status"><span class="visually-hidden">${escapePublicVoteHtml(t('checking_results', 'Checking for results...'))}</span></div>
      </div>
    </section>`);
}

function renderCancelledPublicVote() {
  showPublicVoteContent(`
    ${renderPublicVoteFeedback()}
    <section class="card public-vote-panel text-center border border-danger">
      <div class="card-body py-5 px-3">
        <i class="bi bi-x-octagon-fill text-danger" style="font-size:4rem"></i>
        <h2 class="h3 mt-3">${escapePublicVoteHtml(t('voting_cancelled', 'This voting session has been cancelled'))}</h2>
      </div>
    </section>`);
}

function normalizePublicResults(response) {
  const totalVotes = Number(response?.results?.total_votes) || 0;
  const apiWinners = Array.isArray(response?.results?.winners) ? response.results.winners : [];
  const winnerIds = new Set(apiWinners.map(winner => Number(winner.id)).filter(Number.isFinite));
  const candidates = [];

  (response?.competitions || []).forEach(competition => {
    (competition.candidates || []).forEach(candidate => {
      candidates.push({
        id: Number(candidate.id),
        competitionId: Number(competition.id),
        competitionPosition: Number(competition.position) || 0,
        categoryName: competition.category_name,
        styleName: competition.style_name,
        name: candidate.name,
        clubName: candidate.club_name,
        nationality: candidate.nationality,
        position: Number(candidate.position) || 0,
        votes: Number(candidate.votes) || 0,
        percentage: Number(candidate.percentage) || 0
      });
    });
  });

  candidates.sort((a, b) => b.votes - a.votes || a.competitionPosition - b.competitionPosition || a.position - b.position || String(a.name).localeCompare(String(b.name)));
  if (totalVotes > 0 && winnerIds.size === 0 && candidates.length) {
    const maximum = candidates[0].votes;
    candidates.filter(candidate => candidate.votes === maximum).forEach(candidate => winnerIds.add(candidate.id));
  }

  let previousVotes = null;
  let previousRank = 0;
  const rankedCandidates = candidates.map((candidate, index) => {
    const rank = candidate.votes === previousVotes ? previousRank : index + 1;
    previousVotes = candidate.votes;
    previousRank = rank;
    return { ...candidate, rank, isWinner: totalVotes > 0 && winnerIds.has(candidate.id) };
  });
  return { totalVotes, candidates: rankedCandidates, winnerIds };
}

function renderPublishedPublicVoteResults() {
  const normalized = normalizePublicResults(publicVoteState.data);
  showPublicVoteContent(`
    ${renderPublicVoteFeedback()}
    <section class="card public-vote-panel mb-4">
      <div class="card-body text-center py-4">
        <span class="badge text-bg-primary fs-6"><i class="bi bi-trophy-fill me-1"></i>${escapePublicVoteHtml(t('results_published', 'Results published'))}</span>
        <div class="display-4 fw-bold mt-3">${normalized.totalVotes}</div>
        <div class="text-body-secondary">${escapePublicVoteHtml(t('total_votes', 'Total votes'))}</div>
      </div>
    </section>
    ${normalized.totalVotes === 0 ? `<div class="alert alert-info"><i class="bi bi-info-circle me-2"></i>${escapePublicVoteHtml(t('no_votes_cast', 'The session ended without votes.'))}</div>` : ''}
    <section class="vstack gap-3">${normalized.candidates.map(renderPublicResultCandidate).join('')}</section>`);
}

function renderPublicResultCandidate(candidate) {
  return `
    <article class="card public-vote-panel ${candidate.isWinner ? 'border border-warning bg-warning-subtle' : ''}">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex flex-column flex-sm-row align-items-sm-center gap-3">
          <div class="public-result-position rounded-circle d-flex align-items-center justify-content-center fw-bold ${candidate.isWinner ? 'text-bg-warning' : 'text-bg-light border'}">${candidate.rank}</div>
          <div class="flex-grow-1 public-vote-min-width-0">
            <div class="d-flex flex-wrap align-items-center gap-2">
              <h3 class="h5 mb-0 text-break">${escapePublicVoteHtml(candidate.name)}</h3>
              ${candidate.isWinner ? `<span class="badge text-bg-warning"><i class="bi bi-trophy-fill me-1"></i>${escapePublicVoteHtml(t('winner', 'Winner'))}</span>` : ''}
            </div>
            <div class="small mt-2">${escapePublicVoteHtml(candidate.categoryName)} · ${escapePublicVoteHtml(candidate.styleName)}</div>
            <div class="small text-body-secondary mt-1">${candidate.clubName ? `${escapePublicVoteHtml(candidate.clubName)} · ` : ''}${escapePublicVoteHtml(candidate.nationality || '')}</div>
          </div>
          <div class="text-sm-end">
            <div class="h3 mb-0">${candidate.votes}</div>
            <div class="text-body-secondary">${escapePublicVoteHtml(formatPublicVotePercentage(candidate.percentage))}</div>
          </div>
        </div>
      </div>
    </article>`;
}

function renderPublicVoteFeedback() {
  if (!publicVoteState.feedback?.message) return '';
  return `<div class="alert alert-${publicVoteState.feedback.type || 'info'}" role="status">${escapePublicVoteHtml(publicVoteState.feedback.message)}</div>`;
}

function showPublicVoteContent(markup) {
  const content = document.getElementById('publicVoteContent');
  document.getElementById('publicVoteLoading').classList.add('d-none');
  document.getElementById('publicVoteError').classList.add('d-none');
  content.innerHTML = markup;
  content.classList.remove('d-none');
}

function showPublicVoteError(message, retryable) {
  setPublicVoteLoading(false);
  document.getElementById('publicVoteContent').classList.add('d-none');
  document.getElementById('publicVoteError').classList.remove('d-none');
  document.getElementById('publicVoteErrorText').textContent = message;
  document.getElementById('retryPublicVoteBtn').classList.toggle('d-none', !retryable);
  if (!retryable) {
    clearPublicVotePoll();
    stopPublicVoteCountdown();
  }
}

function hidePublicVoteError() {
  document.getElementById('publicVoteError').classList.add('d-none');
}

function setPublicVoteLoading(loading) {
  document.getElementById('publicVoteLoading').classList.toggle('d-none', !loading);
}

function formatPublicVoteEventDates(start, end) {
  if (!start && !end) return '';
  const formatter = new Intl.DateTimeFormat(getCurrentAppLanguage(), { dateStyle: 'medium' });
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
  const valid = startDate && !Number.isNaN(startDate.getTime()) ? startDate : endDate;
  return valid && !Number.isNaN(valid.getTime()) ? formatter.format(valid) : '';
}

function formatPublicVotePercentage(value) {
  return new Intl.NumberFormat(getCurrentAppLanguage(), { maximumFractionDigits: 2 }).format(Number(value) || 0) + '%';
}

function escapePublicVoteHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapePublicVoteAttribute(value) {
  return escapePublicVoteHtml(value).replace(/`/g, '&#096;');
}

window.normalizePublicResults = normalizePublicResults;
window.renderPublicVotePage = renderPublicVotePage;
