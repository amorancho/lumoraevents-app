const statsContainer = () => document.getElementById('statisticsContainer');
const statsAlert = () => document.getElementById('statsAlert');
const getStatsBtn = () => document.getElementById('getStatsBtn');
const dancerCodeInput = () => document.getElementById('dancerCode');

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();

  const user = getUserFromToken();
  const role = user ? user.role : 'guest';

  // Si el evento no tiene visibleParticipants y el usuario no es ni admin ni organizer, redirigir a home
  if (!getEvent().visibleStatistics && role !== 'admin' && role !== 'organizer') {
      //alert('Esta página no es visible en estos momentos');
      alert(t('page_not_visible'));
      window.location.href = 'home.html?eventId='+eventId;
      return;
  }

  const form = document.getElementById('statsForm');
  if (form) {
    form.addEventListener('submit', handleStatsSubmit);
    autoLoadStatsFromUrl(form);
  }

});

function autoLoadStatsFromUrl(form) {
  const input = dancerCodeInput();
  if (!input) return;

  const params = new URLSearchParams(window.location.search || '');
  const code = (params.get('code') || '').trim();
  if (!code) return;

  input.value = code;

  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
  } else {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
}

async function handleStatsSubmit(event) {
  event.preventDefault();
  const code = dancerCodeInput()?.value.trim();
  clearAlert();

  if (!code) {
    showAlert('warning', t('valid_code'));
    return;
  }

  setLoading(true);
  try {
    const data = await fetchStats(code);
    renderStats(data);
  } catch (error) {
    showAlert('danger', error.message || 'No se pudieron cargar las estadísticas.');
  } finally {
    setLoading(false);
  }
}

async function fetchStats(code) {
  const query = eventId ? `?event_id=${eventId}` : '';
  const res = await fetch(`${API_BASE_URL}/api/public/${encodeURIComponent(code)}/stats${query}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se encontro información para este código.');
  }

  return res.json();
}

function renderStats(data) {
  const container = statsContainer();
  if (!container) return;
  container.innerHTML = '';
  const hideJudges = isEventHideJudgesEnabled() || getEvent().criteriaPerJudge;

  if (!data) {
    return;
  }

  const fragment = document.createDocumentFragment();

  if (data.personalData) {
    fragment.appendChild(buildPersonalCard(data.personalData, data.results, data.styleStats));
  }

  if (Array.isArray(data.results?.styles) && data.results.styles.length > 0) {
    fragment.appendChild(buildVotesDetailCard(data.results, data.personalData));
  }

  if (Array.isArray(data.styleStats) && data.styleStats.length > 0) {
    fragment.appendChild(buildStylesCard(data.styleStats));
  }

  if (!hideJudges && Array.isArray(data.judgesStats) && data.judgesStats.length > 0) {
    fragment.appendChild(buildJudgesCard(data.judgesStats));
  }

  if (Array.isArray(data.criteriaStats) && data.criteriaStats.length > 0) {
    fragment.appendChild(buildCriteriaCard(data.criteriaStats));
  }

  if (!fragment.childNodes.length) {
    showAlert('warning', t('no_stats_info'));
    return;
  }

  container.appendChild(fragment);
}

function isEventHideJudgesEnabled() {
  const value = getEvent()?.hideJudges;
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function buildPersonalCard(personalData, results, styleStats) {
  const { id, name, nationality, category_name, category_position } = personalData;
  const hasGeneralClassification = getEvent().catClassification === 'NUM_MEDALS';
  const singleStyleSummary = getSingleStyleSummary(results, styleStats, id);
  const card = document.createElement('div');
  card.className = 'statistics-panel statistics-profile';

  const flagHtml = getDancerFlagImgHtml(nationality, {
    size: 48,
    width: 48,
    height: 36,
    className: 'statistics-profile-flag'
  });

  card.innerHTML = `
    <div class="statistics-profile-main">
      <h2 class="statistics-profile-name">${escapeHtml(name ?? 'Dancer')}</h2>
      ${flagHtml}
    </div>
    <div class="statistics-profile-meta">
      <span class="statistics-chip"><i class="bi bi-bookmark-star" aria-hidden="true"></i><span>${escapeHtml(category_name ?? 'Category')}</span></span>
      ${hasGeneralClassification
        ? `<span class="statistics-chip statistics-chip--position"><i class="bi bi-trophy" aria-hidden="true"></i><span>Pos. ${escapeHtml(category_position ?? '-')}</span></span>`
        : ''}
      ${singleStyleSummary
        ? `<span class="statistics-chip statistics-chip--style"><i class="bi bi-music-note-beamed" aria-hidden="true"></i><span>${escapeHtml(singleStyleSummary.name)} · Pos. ${escapeHtml(singleStyleSummary.position ?? '-')}</span></span>`
        : ''}
    </div>
  `;

  return card;
}

function getSingleStyleSummary(results, styleStats, dancerId) {
  const statsList = Array.isArray(styleStats) ? styleStats.filter(Boolean) : [];
  if (statsList.length === 1) {
    const style = statsList[0];
    return {
      name: style?.style_name ?? style?.name ?? '-',
      position: getStylePositionValue(style)
    };
  }

  const resultStyles = Array.isArray(results?.styles) ? results.styles.filter(Boolean) : [];
  if (resultStyles.length !== 1) {
    return null;
  }

  const style = resultStyles[0];
  const classification = pickClassification(style?.clasification, dancerId);

  return {
    name: style?.style_name ?? style?.name ?? '-',
    position: getStylePositionValue(style, classification)
  };
}

function getStylePositionValue(style, classification = null) {
  return style?.position
    ?? style?.style_position
    ?? style?.stylePosition
    ?? classification?.position
    ?? classification?.style_position
    ?? classification?.stylePosition
    ?? classification?.classification_position
    ?? classification?.classificationPosition
    ?? null;
}

function buildVotesDetailCard(results, personalData) {
  const styles = Array.isArray(results?.styles) ? results.styles : [];
  const dancerId = personalData?.id ?? null;

  const card = document.createElement('div');
  card.className = 'statistics-panel statistics-votes-panel';

  if (!styles.length) {
    card.innerHTML = `
      <header class="statistics-panel-header">
        <i class="bi bi-table" aria-hidden="true"></i>
        <h2 class="statistics-panel-title">${t('detalles')}</h2>
      </header>
      <div class="statistics-panel-body">
        <p class="statistics-panel-empty">${t('no_detalles')}</p>
      </div>
    `;
    return card;
  }

  const { criteria } = buildVotesSchema(styles, dancerId);
  const collapseId = 'votesDetailCollapse';

  card.innerHTML = `
    <button class="statistics-collapse-btn" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
      <span class="statistics-collapse-title">
        <i class="bi bi-card-list" aria-hidden="true"></i>
        <span>${t('detalles')}</span>
      </span>
      <span class="statistics-collapse-meta">
        <span class="statistics-collapse-count">${styles.length} ${t('styles')}</span>
        <i class="bi bi-chevron-down statistics-collapse-chevron" aria-hidden="true"></i>
      </span>
    </button>
    <div id="${collapseId}" class="collapse">
      <div class="statistics-votes-body">
        <div class="table-responsive statistics-votes-table-wrap" id="votesDetailTableWrap"></div>
      </div>
    </div>
  `;

  const wrap = card.querySelector('#votesDetailTableWrap');
  wrap.appendChild(buildVotesDetailTable(styles, criteria, dancerId));

  return card;
}

function buildVotesSchema(styles, dancerId) {
  const criteria = [];
  const criteriaSet = new Set();

  styles.forEach((style) => {
    const classification = pickClassification(style?.clasification, dancerId);
    const votes = Array.isArray(classification?.votes) ? classification.votes : [];

    votes.forEach((vote) => {
      const voteCriteria = Array.isArray(vote?.criteria) ? vote.criteria : [];
      voteCriteria.forEach((c) => {
        const critName = (c?.name || '').trim();
        if (!critName) return;
        if (!criteriaSet.has(critName)) {
          criteriaSet.add(critName);
          criteria.push(critName);
        }
      });
    });
  });

  return { criteria };
}

function buildVotesDetailTable(styles, criteria, dancerId) {
  const table = document.createElement('table');
  table.className = 'table statistics-votes-table';
  table.style.tableLayout = 'fixed';
  table.style.width = '100%';

  const critList = Array.isArray(criteria) && criteria.length ? criteria : ['Score'];

  const isMobile = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 576px)').matches
    : false;
  const isSmallWidth = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 768px)').matches
    : false;

  // Keep Style/Judge fixed; scroll horizontally over scores.
  const stickyStyle = true;
  const stickyJudge = true;

  const colgroup = document.createElement('colgroup');
  const styleColWidthPx = isSmallWidth
    ? computeStyleColumnWidth(styles)
    : 160;
  const judgeColWidthPx = computeJudgeColumnWidth(styles, dancerId, isSmallWidth);
  const valueColWidthPx = isMobile ? 96 : 105;

  // Keep Style/Judge compact; make criteria equal-width.
  colgroup.appendChild(createCol(`${styleColWidthPx}px`)); // style
  colgroup.appendChild(createCol(`${judgeColWidthPx}px`)); // judge
  critList.forEach(() => colgroup.appendChild(createCol(`${valueColWidthPx}px`)));
  colgroup.appendChild(createCol(`${valueColWidthPx}px`)); // total

  table.appendChild(colgroup);
  table.style.minWidth = `${styleColWidthPx + judgeColWidthPx + valueColWidthPx * (critList.length + 1)}px`;

  const thead = document.createElement('thead');

  const header = document.createElement('tr');
  const thStyle = document.createElement('th');
  thStyle.scope = 'col';
  thStyle.className = 'text-center';
  thStyle.textContent = t('style');
  if (stickyStyle) makeStickyCell(thStyle, 0, 3, 'var(--lm-surface-raised)');
  header.appendChild(thStyle);

  const thJudge = document.createElement('th');
  thJudge.scope = 'col';
  thJudge.className = 'text-center';
  thJudge.textContent = t('judge');
  if (stickyJudge) makeStickyCell(thJudge, styleColWidthPx, 3, 'var(--lm-surface-raised)');
  header.appendChild(thJudge);

  critList.forEach((critName) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = 'text-center small';
    th.textContent = critName;
    header.appendChild(th);
  });

  const thTotal = document.createElement('th');
  thTotal.scope = 'col';
  thTotal.className = 'text-center';
  thTotal.textContent = t('total');
  header.appendChild(thTotal);

  thead.appendChild(header);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  styles.forEach((style) => {
    const styleName = style?.style_name ?? '-';

    const classification = pickClassification(style?.clasification, dancerId);
    const styleTotal = classification?.total_score ?? null;
    const votes = Array.isArray(classification?.votes) ? classification.votes : [];

    const effectiveVotes = votes.length
      ? votes
      : [{ judge_name: '-', criteria: [] }];

    const rowSpan = effectiveVotes.length;

    effectiveVotes.forEach((vote, index) => {
      const tr = document.createElement('tr');

      if (index === 0) {
        const tdStyle = document.createElement('td');
        tdStyle.className = 'text-start statistics-style-cell';
        tdStyle.rowSpan = rowSpan;
        const maxNameWidth = Math.max(60, styleColWidthPx - 20);
        tdStyle.innerHTML = `
          <div class="statistics-style-name" style="max-width:${maxNameWidth}px" title="${escapeHtml(styleName)}">${escapeHtml(styleName)}</div>
          ${styleTotal != null ? `<span class="statistics-style-total">${t('total')} ${escapeHtml(styleTotal)}</span>` : ''}
        `;
        tdStyle.style.verticalAlign = 'top';
        if (isMobile) {
          tdStyle.style.padding = '0.35rem';
          //tdStyle.style.fontSize = '0.75rem';
          tdStyle.style.lineHeight = '1.1';
          tdStyle.style.wordBreak = 'break-word';
        }
        if (stickyStyle) makeStickyCell(tdStyle, 0, 2, '#13283a');
        tr.appendChild(tdStyle);
        tr.classList.add('statistics-style-start');
      }

      const judgeName = (vote?.judge_name || '-').trim() || '-';
      const commentText = typeof vote?.comments === 'string' ? vote.comments.trim() : '';
      const hasFeedback = parseFeedbackFlag(vote?.has_feedback);
      const competitionId =
        vote?.competition_id
        ?? vote?.competitionId
        ?? style?.competition_id
        ?? style?.competitionId
        ?? classification?.competition_id
        ?? classification?.competitionId
        ?? null;
      const judgeId = vote?.judge_id ?? vote?.judgeId ?? null;
      const tdJudge = document.createElement('td');
      tdJudge.className = 'text-start statistics-judge-cell';
      tdJudge.title = judgeName;
      tdJudge.style.whiteSpace = 'nowrap';
      tdJudge.style.overflow = 'hidden';
      tdJudge.style.textOverflow = 'ellipsis';
      const judgeWrap = document.createElement('div');
      judgeWrap.className = 'statistics-judge-content';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'statistics-judge-name';
      nameSpan.textContent = judgeName;
      judgeWrap.appendChild(nameSpan);
      const judgeActions = document.createElement('div');
      judgeActions.className = 'statistics-judge-actions';
      if (commentText) {
        const commentBtn = document.createElement('button');
        commentBtn.type = 'button';
        commentBtn.className = 'statistics-judge-action statistics-judge-action--comment';
        commentBtn.innerHTML = '<i class="bi bi-chat-dots-fill" aria-hidden="true"></i>';
        commentBtn.setAttribute('aria-label', t('comments'));
        commentBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          showVoteComment(commentText, judgeName, styleName);
        });
        judgeActions.appendChild(commentBtn);
      }
      if (hasFeedback) {
        const feedbackBtn = document.createElement('button');
        feedbackBtn.type = 'button';
        feedbackBtn.className = 'statistics-judge-action statistics-judge-action--audio';
        feedbackBtn.innerHTML = '<i class="bi bi-mic-fill" aria-hidden="true"></i>';
        feedbackBtn.setAttribute('aria-label', t('audio_feedback', 'Audio feedback'));
        feedbackBtn.addEventListener('click', async (event) => {
          event.stopPropagation();
          await showVoteFeedbackAudio({
            competitionId,
            judgeId,
            dancerId,
            judgeName,
            styleName
          });
        });
        judgeActions.appendChild(feedbackBtn);
      }
      if (judgeActions.childNodes.length) {
        judgeWrap.appendChild(judgeActions);
      }
      tdJudge.appendChild(judgeWrap);
      if (isMobile) {
        tdJudge.style.padding = '0.35rem';
        //tdJudge.style.fontSize = '0.75rem';
        tdJudge.style.lineHeight = '1.1';
        tdJudge.style.wordBreak = 'break-word';
      }
      if (stickyJudge) makeStickyCell(tdJudge, styleColWidthPx, 1, 'var(--lm-surface)');
      tr.appendChild(tdJudge);

      const criteriaMap = new Map();
      const voteCriteria = Array.isArray(vote?.criteria) ? vote.criteria : [];
      voteCriteria.forEach((c) => {
        const critName = (c?.name || '').trim();
        if (!critName) return;
        criteriaMap.set(critName, c?.score ?? '-');
      });

      critList.forEach((critName) => {
        const td = document.createElement('td');
        td.className = 'text-center';
        const score = criteriaMap.has(critName) ? criteriaMap.get(critName) : null;
        td.innerHTML = renderScore(score);
        tr.appendChild(td);
      });

      const judgeTotal = vote?.judge_total_score ?? sumNumericScores(voteCriteria);
      const tdTotal = document.createElement('td');
      tdTotal.className = 'text-center fw-semibold';
      tdTotal.innerHTML = renderTotalScore(judgeTotal);
      tr.appendChild(tdTotal);

      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);
  return table;
}

let commentsModalInstance = null;
let commentsModalTitleEl = null;
let commentsModalBodyEl = null;
let feedbackAudioModalInstance = null;
let feedbackAudioModalTitleEl = null;
let feedbackAudioModalBodyEl = null;
let feedbackAudioObjectUrl = '';
let feedbackAudioRequestId = 0;

function ensureCommentsModal() {
  if (commentsModalInstance) return commentsModalInstance;
  if (!document.getElementById('voteCommentsModal')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade statistics-modal" id="voteCommentsModal" tabindex="-1" aria-labelledby="voteCommentsModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title fs-5" id="voteCommentsModalLabel">${t('comments')}</h2>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="voteCommentsModalBody"></div>
            <div class="modal-footer">
              <button type="button" class="lm-btn lm-btn-secondary" data-bs-dismiss="modal">${t('close', 'Close')}</button>
            </div>
          </div>
        </div>
      </div>
    `);
  }
  const modalEl = document.getElementById('voteCommentsModal');
  commentsModalTitleEl = document.getElementById('voteCommentsModalLabel');
  commentsModalBodyEl = document.getElementById('voteCommentsModalBody');
  commentsModalInstance = new bootstrap.Modal(modalEl);
  return commentsModalInstance;
}

function showVoteComment(commentText, judgeName, styleName) {
  const modal = ensureCommentsModal();
  if (commentsModalTitleEl) {
    commentsModalTitleEl.textContent = t('comments');
  }
  if (commentsModalBodyEl) {
    const judgeLine = judgeName && judgeName !== '-'
      ? `<div class="small mb-1"><span class="text-muted">${t('judge')}:</span> <strong>${escapeHtml(judgeName)}</strong></div>`
      : '';
    const styleLine = styleName && styleName !== '-'
      ? `<div class="small mb-2"><span class="text-muted">${t('style')}:</span> <strong>${escapeHtml(styleName)}</strong></div>`
      : '';
    commentsModalBodyEl.innerHTML = `
      <div class="statistics-modal-context">${judgeLine}${styleLine}</div>
      <div class="statistics-modal-copy">${escapeHtml(commentText)}</div>
    `;
  }
  modal.show();
}

function parseFeedbackFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function clearFeedbackAudioObjectUrl() {
  if (!feedbackAudioObjectUrl) return;
  URL.revokeObjectURL(feedbackAudioObjectUrl);
  feedbackAudioObjectUrl = '';
}

function buildVoteFeedbackDownloadUrl(competitionId, judgeId, dancerId) {
  const params = new URLSearchParams();
  const currentEventId = getEvent()?.id;
  if (currentEventId) params.set('event_id', String(currentEventId));
  if (judgeId != null) params.set('judge_id', String(judgeId));
  if (dancerId != null) params.set('dancer_id', String(dancerId));
  return `${API_BASE_URL}/api/competitions/${competitionId}/feedback/download?${params.toString()}`;
}

function ensureFeedbackAudioModal() {
  if (feedbackAudioModalInstance) return feedbackAudioModalInstance;
  if (!document.getElementById('voteFeedbackAudioModal')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade statistics-modal" id="voteFeedbackAudioModal" tabindex="-1" aria-labelledby="voteFeedbackAudioModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title fs-5" id="voteFeedbackAudioModalLabel">${t('audio_feedback', 'Audio feedback')}</h2>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="voteFeedbackAudioModalBody"></div>
            <div class="modal-footer">
              <button type="button" class="lm-btn lm-btn-secondary" data-bs-dismiss="modal">${t('close', 'Close')}</button>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  const modalEl = document.getElementById('voteFeedbackAudioModal');
  feedbackAudioModalTitleEl = document.getElementById('voteFeedbackAudioModalLabel');
  feedbackAudioModalBodyEl = document.getElementById('voteFeedbackAudioModalBody');
  feedbackAudioModalInstance = new bootstrap.Modal(modalEl);
  modalEl.addEventListener('hidden.bs.modal', () => {
    feedbackAudioRequestId += 1;
    clearFeedbackAudioObjectUrl();
    if (feedbackAudioModalBodyEl) {
      feedbackAudioModalBodyEl.innerHTML = '';
    }
  });
  return feedbackAudioModalInstance;
}

async function showVoteFeedbackAudio({ competitionId, judgeId, dancerId, judgeName, styleName }) {
  const modal = ensureFeedbackAudioModal();
  const requestId = feedbackAudioRequestId + 1;
  feedbackAudioRequestId = requestId;
  clearFeedbackAudioObjectUrl();

  if (feedbackAudioModalTitleEl) {
    feedbackAudioModalTitleEl.textContent = t('audio_feedback', 'Audio feedback');
  }
  if (feedbackAudioModalBodyEl) {
    const judgeLine = judgeName && judgeName !== '-'
      ? `<div class="small mb-1"><span class="text-muted">${t('judge')}:</span> <strong>${escapeHtml(judgeName)}</strong></div>`
      : '';
    const styleLine = styleName && styleName !== '-'
      ? `<div class="small mb-3"><span class="text-muted">${t('style')}:</span> <strong>${escapeHtml(styleName)}</strong></div>`
      : '';
    feedbackAudioModalBodyEl.innerHTML = `
      <div class="statistics-modal-context">${judgeLine}${styleLine}</div>
      <div class="statistics-audio-loading">
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        <span>${escapeHtml(t('audio_feedback_loading', 'Loading audio...'))}</span>
      </div>
    `;
  }

  modal.show();

  try {
    if (!competitionId || !judgeId || !dancerId) {
      throw new Error(t('audio_feedback_load_error', 'Error loading audio feedback.'));
    }

    const response = await fetch(buildVoteFeedbackDownloadUrl(competitionId, judgeId, dancerId));
    if (!response.ok) {
      const err = await safeJson(response);
      throw new Error(err?.error || t('audio_feedback_load_error', 'Error loading audio feedback.'));
    }

    const blob = await response.blob();
    if (requestId !== feedbackAudioRequestId) return;

    feedbackAudioObjectUrl = URL.createObjectURL(blob);

    if (feedbackAudioModalBodyEl) {
      const judgeLine = judgeName && judgeName !== '-'
        ? `<div class="small mb-1"><span class="text-muted">${t('judge')}:</span> <strong>${escapeHtml(judgeName)}</strong></div>`
        : '';
      const styleLine = styleName && styleName !== '-'
        ? `<div class="small mb-3"><span class="text-muted">${t('style')}:</span> <strong>${escapeHtml(styleName)}</strong></div>`
        : '';
      feedbackAudioModalBodyEl.innerHTML = `
        <div class="statistics-modal-context">${judgeLine}${styleLine}</div>
        <audio id="voteFeedbackAudioPlayer" class="statistics-audio-player" controls preload="metadata"></audio>
      `;
      const playerEl = document.getElementById('voteFeedbackAudioPlayer');
      if (playerEl) {
        playerEl.src = feedbackAudioObjectUrl;
        playerEl.load();
      }
    }
  } catch (error) {
    if (requestId !== feedbackAudioRequestId) return;
    if (feedbackAudioModalBodyEl) {
      const judgeLine = judgeName && judgeName !== '-'
        ? `<div class="small mb-1"><span class="text-muted">${t('judge')}:</span> <strong>${escapeHtml(judgeName)}</strong></div>`
        : '';
      const styleLine = styleName && styleName !== '-'
        ? `<div class="small mb-3"><span class="text-muted">${t('style')}:</span> <strong>${escapeHtml(styleName)}</strong></div>`
        : '';
      feedbackAudioModalBodyEl.innerHTML = `
        <div class="statistics-modal-context">${judgeLine}${styleLine}</div>
        <div class="statistics-audio-error">${escapeHtml(error?.message || t('audio_feedback_load_error', 'Error loading audio feedback.'))}</div>
      `;
    }
  }
}

function createCol(width) {
  const col = document.createElement('col');
  if (width) col.style.width = width;
  return col;
}

function computeJudgeColumnWidth(styles, dancerId, isSmallWidth) {
  const min = isSmallWidth ? 90 : 100;
  const max = isSmallWidth ? 140 : 170;

  let maxChars = 5;
  styles.forEach((style) => {
    const classification = pickClassification(style?.clasification, dancerId);
    const votes = Array.isArray(classification?.votes) ? classification.votes : [];
    votes.forEach((vote) => {
      const name = (vote?.judge_name || '').trim();
      if (name.length > maxChars) maxChars = name.length;
    });
  });

  // Rough estimate: ~7px per char + padding.
  const estimated = Math.round(maxChars * 7 + 34);
  return clampToRange(estimated, min, max);
}

function computeStyleColumnWidth(styles) {
  const min = 95;
  const max = 175;

  let maxChars = 5;
  styles.forEach((style) => {
    const name = String(style?.style_name ?? '').trim();
    if (name.length > maxChars) maxChars = name.length;
  });

  // Rough estimate: ~7px per char + padding.
  const estimated = Math.round(maxChars * 7 + 28);
  return clampToRange(estimated, min, max);
}

function makeStickyCell(cell, leftPx, zIndex, bg) {
  cell.style.position = 'sticky';
  cell.style.left = `${leftPx}px`;
  cell.style.zIndex = String(zIndex);
  cell.style.background = bg;
}

function renderScore(value) {
  if (value == null || value === '-' || value === '') {
    return '<span class="statistics-score-empty">-</span>';
  }
  if (typeof value === 'number' || /^\s*\d+(\.\d+)?\s*$/.test(String(value))) {
    return `<span class="statistics-score">${escapeHtml(value)}</span>`;
  }
  return `<span class="statistics-score">${escapeHtml(value)}</span>`;
}

function renderTotalScore(value) {
  if (value == null || value === '-' || value === '') {
    return '<span class="statistics-score-empty">-</span>';
  }
  return `<span class="statistics-score statistics-total-score">${escapeHtml(value)}</span>`;
}

function sumNumericScores(criteria) {
  const list = Array.isArray(criteria) ? criteria : [];
  let sum = 0;
  let count = 0;
  list.forEach((c) => {
    const n = Number(c?.score);
    if (Number.isFinite(n)) {
      sum += n;
      count += 1;
    }
  });
  return count ? sum : '-';
}

function pickClassification(clasification, dancerId) {
  const list = Array.isArray(clasification) ? clasification : [];
  if (!list.length) return null;
  if (dancerId == null) return list[0];
  return list.find((c) => String(c?.dancer_id) === String(dancerId)) || list[0];
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildCriteriaCard(criteria) {
  const card = document.createElement('div');
  card.className = 'statistics-panel statistics-metric-panel';
  card.innerHTML = `
    <header class="statistics-panel-header">
      <i class="bi bi-sliders2-vertical" aria-hidden="true"></i>
      <h2 class="statistics-panel-title">${t('criteria')}</h2>
    </header>
    <div class="statistics-panel-body">
      <div class="statistics-metric-list"></div>
    </div>
  `;

  const list = card.querySelector('.statistics-metric-list');
  criteria.forEach((item) => {
    list.appendChild(buildCriterionRow(item));
  });

  return card;
}

function buildCriterionRow(item) {
  const avg = toNumber(item.avg_score);
  const others = toNumber(item.avg_score_others);
  const diff = avg - others;
  const min = toNumber(item.min_score);
  const max = toNumber(item.max_score);

  const row = document.createElement('div');
  row.className = 'statistics-metric-row';
  row.innerHTML = `
    <div class="statistics-metric-heading">
      <div>
        <div class="statistics-metric-name">${escapeHtml(item.name ?? '-')}</div>
        <div class="statistics-metric-range">Min ${min.toFixed(1)} - Max ${max.toFixed(1)}</div>
      </div>
      ${diffBadge(diff)}
    </div>
    ${progressBlock(t('average'), avg, 'primary')}
    ${progressBlock(t('others'), others, 'secondary')}
  `;
  return row;
}

function buildJudgesCard(judges) {
  const card = document.createElement('div');
  card.className = 'statistics-panel statistics-metric-panel';
  card.innerHTML = `
    <header class="statistics-panel-header">
      <i class="bi bi-people" aria-hidden="true"></i>
      <h2 class="statistics-panel-title">${t('judges')}</h2>
    </header>
    <div class="statistics-panel-body">
      <div class="statistics-metric-list"></div>
    </div>
  `;

  const list = card.querySelector('.statistics-metric-list');
  judges.forEach((judge) => {
    list.appendChild(buildJudgeRow(judge));
  });

  return card;
}

function buildJudgeRow(judge) {
  const avg = toNumber(judge.avg_score);
  const others = toNumber(judge.avg_score_others);
  const diff = avg - others;
  const min = toNumber(judge.min_score);
  const max = toNumber(judge.max_score);

  const row = document.createElement('div');
  row.className = 'statistics-metric-row';
  row.innerHTML = `
    <div class="statistics-metric-heading">
      <div>
        <div class="statistics-metric-name">${escapeHtml(judge.name ?? '-')}</div>
        <div class="statistics-metric-range">Min ${min.toFixed(1)} - Max ${max.toFixed(1)}</div>
      </div>
      ${diffBadge(diff)}
    </div>
    ${progressBlock(t('average'), avg, 'primary')}
    ${progressBlock(t('others'), others, 'secondary')}
  `;
  return row;
}

function buildStylesCard(styles) {
  const card = document.createElement('div');
  card.className = 'statistics-panel statistics-metric-panel';
  card.innerHTML = `
    <header class="statistics-panel-header">
      <i class="bi bi-music-note-beamed" aria-hidden="true"></i>
      <h2 class="statistics-panel-title">${t('styles')}</h2>
    </header>
    <div class="statistics-panel-body">
      <div class="statistics-metric-list"></div>
    </div>
  `;

  const list = card.querySelector('.statistics-metric-list');
  styles.forEach((style) => {
    list.appendChild(buildStyleRow(style));
  });

  return card;
}

function buildStyleRow(style) {
  const avg = toNumber(style.avg_score);
  const others = toNumber(style.avg_score_others);
  const diff = avg - others;
  const min = toNumber(style.min_score);
  const max = toNumber(style.max_score);

  const col = document.createElement('div');
  col.className = 'statistics-metric-row';
  col.innerHTML = `
    <div class="statistics-metric-heading">
      <div>
        <div class="statistics-metric-title-row">
          <div class="statistics-metric-name">${escapeHtml(style.style_name ?? '-')}</div>
          <span class="statistics-position">Pos. ${escapeHtml(style.position ?? '-')}</span>
        </div>
        <div class="statistics-metric-range">Min ${min.toFixed(1)} - Max ${max.toFixed(1)}</div>
      </div>
      ${diffBadge(diff)}
    </div>
    ${progressBlock(t('average'), avg, 'primary')}
    ${progressBlock(t('others'), others, 'secondary')}
  `;
  return col;
}

function progressBlock(label, value, color) {
  const safeVal = clampToRange(value, 0, 10);
  const variantClass = color === 'secondary' ? ' statistics-progress-block--others' : '';
  return `
    <div class="statistics-progress-block${variantClass}">
      <div class="statistics-progress-label">
        <strong>${escapeHtml(label)}</strong>
        <span>${safeVal.toFixed(2)}/10</span>
      </div>
      <div class="statistics-progress-track">
        <div class="statistics-progress-bar" role="progressbar" style="width: ${safeVal * 10}%" aria-valuenow="${safeVal}" aria-valuemin="0" aria-valuemax="10"></div>
      </div>
    </div>
  `;
}

function diffBadge(diff) {
  const positive = diff >= 0;
  const badgeClass = positive ? 'statistics-diff--positive' : 'statistics-diff--negative';
  const icon = positive ? 'bi-arrow-up-right' : 'bi-arrow-down-right';
  const label = `${positive ? '+' : ''}${diff.toFixed(2)} vs ${t('others')}`;
  return `<span class="statistics-diff ${badgeClass}"><i class="bi ${icon}" aria-hidden="true"></i>${escapeHtml(label)}</span>`;
}

function clampToRange(value, min, max) {
  if (isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function showAlert(type, message) {
  const alertBox = statsAlert();
  if (!alertBox) return;
  const normalizedType = ['warning', 'danger', 'success'].includes(type) ? type : 'warning';
  alertBox.innerHTML = `<div class="statistics-notice statistics-notice--${normalizedType}" role="alert">${escapeHtml(message)}</div>`;
}

function clearAlert() {
  const alertBox = statsAlert();
  if (alertBox) alertBox.innerHTML = '';
}

function setLoading(isLoading) {
  const btn = getStatsBtn();
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span><span>${t('loading')}</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-graph-up-arrow" aria-hidden="true"></i><span>${t('get_stats')}</span>`;
  }
}

