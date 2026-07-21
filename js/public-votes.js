const publicVotesState = {
  eventId: null,
  sessions: [],
  signature: '',
  pollTimer: null,
  countdownTimer: null,
  requestInFlight: false,
  destroyed: false,
  hasLoaded: false
};

document.addEventListener('DOMContentLoaded', async () => {
  await ensureTranslationsReady();

  const rawEventId = new URLSearchParams(window.location.search).get('eventId');
  const parsedEventId = Number(rawEventId);
  if (!Number.isInteger(parsedEventId) || parsedEventId <= 0) {
    setPublicPageEventContext({}, { fallbackName: t('title', 'Audience voting'), homeUrl: 'index.html' });
    showPublicVotesError(t('invalid_event', 'The event identifier is missing or invalid.'), false);
    return;
  }

  publicVotesState.eventId = parsedEventId;
  await WaitEventLoaded();
  const currentEvent = getEvent();
  if (!ensureAudienceVotingEnabled()) return;
  setPublicPageEventContext(currentEvent, { fallbackName: t('title', 'Audience voting') });
  document.getElementById('retryPublicVotesBtn').addEventListener('click', () => loadPublicVotes({ initial: true }));
  publicVotesState.countdownTimer = window.setInterval(updatePublicVotesCountdowns, 1000);
  await loadPublicVotes({ initial: true });
});

window.addEventListener('beforeunload', stopPublicVotesPolling);

async function fetchPublicVotes() {
  const response = await fetch(`${API_BASE_URL}/api/public/audience-votes?event_id=${encodeURIComponent(publicVotesState.eventId)}`, {
    headers: { 'Accept-Language': getCurrentAppLanguage() }
  });
  const payload = await parsePublicVotesResponse(response);
  if (!response.ok) throw new PublicVotesError(payload?.error || t('load_error', 'Voting sessions could not be loaded.'), response.status);
  return Array.isArray(payload) ? payload : [];
}

class PublicVotesError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function parsePublicVotesResponse(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

async function loadPublicVotes({ initial = false } = {}) {
  if (publicVotesState.requestInFlight || publicVotesState.destroyed) return;
  publicVotesState.requestInFlight = true;
  if (initial && !publicVotesState.hasLoaded) setPublicVotesLoading(true);

  try {
    const sessions = await fetchPublicVotes();
    if (publicVotesState.destroyed) return;
    publicVotesState.sessions = sessions;
    rememberPublicVoteEventIds(sessions);
    publicVotesState.hasLoaded = true;
    hidePublicVotesError();

    const signature = JSON.stringify(sessions);
    if (signature !== publicVotesState.signature) {
      publicVotesState.signature = signature;
      renderPublicVotesPage();
    }
    schedulePublicVotesPoll();
  } catch (error) {
    const fatal = error instanceof PublicVotesError && [400, 404].includes(error.status);
    if (!publicVotesState.hasLoaded || fatal) {
      showPublicVotesError(error.message || t('network_error', 'Network error. Try again.'), !fatal);
    } else {
      schedulePublicVotesPoll();
    }
  } finally {
    publicVotesState.requestInFlight = false;
    setPublicVotesLoading(false);
  }
}

function rememberPublicVoteEventIds(sessions) {
  try {
    sessions.forEach(session => {
      if (!session?.public_code || !publicVotesState.eventId) return;
      sessionStorage.setItem(
        `publicAudienceVoteEventId:${session.public_code}`,
        String(publicVotesState.eventId)
      );
    });
  } catch (_error) {
    // El referrer seguirá permitiendo volver cuando sessionStorage no esté disponible.
  }
}

function schedulePublicVotesPoll() {
  if (publicVotesState.destroyed) return;
  if (publicVotesState.pollTimer) window.clearTimeout(publicVotesState.pollTimer);
  publicVotesState.pollTimer = window.setTimeout(() => loadPublicVotes(), 12000);
}

function stopPublicVotesPolling() {
  publicVotesState.destroyed = true;
  if (publicVotesState.pollTimer) window.clearTimeout(publicVotesState.pollTimer);
  if (publicVotesState.countdownTimer) window.clearInterval(publicVotesState.countdownTimer);
  publicVotesState.pollTimer = null;
  publicVotesState.countdownTimer = null;
}

function renderPublicVotesPage() {
  const openSessions = publicVotesState.sessions.filter(session => session.status === 'OPE');
  const publishedSessions = publicVotesState.sessions.filter(session => session.status === 'CLO' && Boolean(session.results_published));
  const empty = openSessions.length === 0 && publishedSessions.length === 0;

  document.getElementById('publicVotesEmpty').classList.toggle('d-none', !empty);
  document.getElementById('publicVotesContent').classList.toggle('d-none', empty);
  document.getElementById('openVotesSection').classList.toggle('d-none', openSessions.length === 0);
  document.getElementById('publishedVotesSection').classList.toggle('d-none', publishedSessions.length === 0);
  document.getElementById('openVotesList').innerHTML = openSessions.map(renderOpenPublicVoteCard).join('');
  document.getElementById('publishedVotesList').innerHTML = publishedSessions.map(renderPublishedPublicVoteCard).join('');

  const title = document.getElementById('event-name');
  if (title) title.textContent = t('title', 'Audience voting');
  updatePublicVotesCountdowns();
}

function renderOpenPublicVoteCard(session) {
  return `
    <div class="col-12 col-lg-6">
      <article class="card public-vote-card h-100 border-start border-4 border-success">
        <div class="card-body p-4">
          <span class="badge text-bg-success mb-3"><i class="bi bi-broadcast me-1"></i>${escapePublicVotesHtml(t('voting_open', 'Voting open'))}</span>
          <h3 class="h5 text-break">${escapePublicVotesHtml(session.name)}</h3>
          ${renderPublicVoteCompetitions(session.competitions)}
          <div class="d-flex flex-wrap align-items-center gap-2 mt-3 text-body-secondary">
            <i class="bi bi-clock"></i>
            <span>${escapePublicVotesHtml(t('closes_at', 'Closes'))}: ${escapePublicVotesHtml(formatPublicVotesDate(session.closes_at))}</span>
            <span class="badge text-bg-light border text-dark public-vote-countdown" data-closes-at="${escapePublicVotesAttribute(session.closes_at || '')}">--:--</span>
          </div>
        </div>
        <div class="card-footer p-3">
          <a class="btn btn-success w-100" href="${buildPublicVoteSessionUrl(session.public_code)}"><i class="bi bi-hand-index-thumb me-1"></i>${escapePublicVotesHtml(t('vote_now', 'Vote now'))}</a>
        </div>
      </article>
    </div>`;
}

function renderPublishedPublicVoteCard(session) {
  return `
    <div class="col-12 col-lg-6">
      <article class="card public-vote-card h-100 border-start border-4 border-primary">
        <div class="card-body p-4">
          <span class="badge text-bg-primary mb-3"><i class="bi bi-trophy-fill me-1"></i>${escapePublicVotesHtml(t('results_published', 'Results published'))}</span>
          <h3 class="h5 text-break">${escapePublicVotesHtml(session.name)}</h3>
          ${renderPublicVoteCompetitions(session.competitions)}
          <div class="mt-3 text-body-secondary"><i class="bi bi-calendar-check me-2"></i>${escapePublicVotesHtml(t('closed_at', 'Closed'))}: ${escapePublicVotesHtml(formatPublicVotesDate(session.closed_at))}</div>
        </div>
        <div class="card-footer p-3">
          <a class="btn btn-primary w-100" href="${buildPublicVoteSessionUrl(session.public_code)}"><i class="bi bi-bar-chart-fill me-1"></i>${escapePublicVotesHtml(t('view_results', 'View results'))}</a>
        </div>
      </article>
    </div>`;
}

function renderPublicVoteCompetitions(competitions = []) {
  const ordered = [...competitions].sort((a, b) => Number(a.position) - Number(b.position));
  if (!ordered.length) return '';
  return `<div class="vstack gap-2 mt-3">${ordered.map(item => `<div class="small"><i class="bi bi-award me-2 text-body-secondary"></i><strong>${escapePublicVotesHtml(item.category_name)}</strong> · ${escapePublicVotesHtml(item.style_name)}</div>`).join('')}</div>`;
}

function buildPublicVoteSessionUrl(publicCode) {
  return `public-vote.html?code=${encodeURIComponent(publicCode || '')}&eventId=${encodeURIComponent(publicVotesState.eventId || '')}`;
}

function updatePublicVotesCountdowns() {
  document.querySelectorAll('[data-closes-at]').forEach(element => {
    const closeTime = new Date(element.dataset.closesAt).getTime();
    if (!Number.isFinite(closeTime)) {
      element.textContent = '—';
      return;
    }
    const seconds = Math.max(0, Math.ceil((closeTime - Date.now()) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    element.textContent = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    element.classList.toggle('text-bg-danger', seconds <= 30);
    element.classList.toggle('text-bg-light', seconds > 30);
  });
}

function setPublicVotesLoading(loading) {
  document.getElementById('publicVotesLoading').classList.toggle('d-none', !loading);
}

function showPublicVotesError(message, retryable) {
  setPublicVotesLoading(false);
  document.getElementById('publicVotesContent').classList.add('d-none');
  document.getElementById('publicVotesEmpty').classList.add('d-none');
  document.getElementById('publicVotesError').classList.remove('d-none');
  document.getElementById('publicVotesErrorText').textContent = message;
  document.getElementById('retryPublicVotesBtn').classList.toggle('d-none', !retryable);
}

function hidePublicVotesError() {
  document.getElementById('publicVotesError').classList.add('d-none');
}

function formatPublicVotesDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(getCurrentAppLanguage(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function escapePublicVotesHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapePublicVotesAttribute(value) {
  return escapePublicVotesHtml(value).replace(/`/g, '&#096;');
}

window.renderPublicVotesPage = renderPublicVotesPage;
