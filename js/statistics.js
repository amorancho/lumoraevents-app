const statsContainer = () => document.getElementById('statisticsContainer');
const statsAlert = () => document.getElementById('statsAlert');
const getStatsBtn = () => document.getElementById('getStatsBtn');
const dancerCodeInput = () => document.getElementById('dancerCode');

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  //renderEmptyState();

  const form = document.getElementById('statsForm');
  if (form) {
    form.addEventListener('submit', handleStatsSubmit);
  }
});

function renderEmptyState() {
  const container = statsContainer();
  if (!container) return;
  container.innerHTML = `
    <div class="col-12 col-lg-8">
      <div class="alert alert-info d-flex align-items-center mb-0" role="alert">
        <i class="bi bi-info-circle me-2 fs-5"></i>
        <div>Introduce un código de bailarina y pulsa "Get Stats" para ver sus estadísticas.</div>
      </div>
    </div>
  `;
}

async function handleStatsSubmit(event) {
  event.preventDefault();
  const code = dancerCodeInput()?.value.trim();
  clearAlert();

  if (!code) {
    showAlert('warning', 'Introduce un código válido para continuar.');
    return;
  }

  setLoading(true);
  try {
    const data = await fetchStats(code);
    renderStats(data);
  } catch (error) {
    console.error('Error obteniendo estadisticas:', error);
    //renderEmptyState();
    showAlert('danger', error.message || 'No se pudieron cargar las estadísticas.');
  } finally {
    setLoading(false);
  }
}

async function fetchStats(code) {
  const query = eventId ? `?event_id=${eventId}` : '';
  const res = await fetch(`${API_BASE_URL}/api/dancers/${encodeURIComponent(code)}/stats${query}`);

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

  if (!data) {
    //renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();

  if (data.personalData) {
    fragment.appendChild(buildPersonalCard(data.personalData));
  }

  if (Array.isArray(data.results?.styles) && data.results.styles.length > 0) {
    fragment.appendChild(buildVotesDetailCard(data.results, data.personalData));
  }

  if (Array.isArray(data.styleStats) && data.styleStats.length > 0) {
    fragment.appendChild(buildStylesCard(data.styleStats));
  }

  if (Array.isArray(data.judgesStats) && data.judgesStats.length > 0) {
    fragment.appendChild(buildJudgesCard(data.judgesStats));
  }

  if (Array.isArray(data.criteriaStats) && data.criteriaStats.length > 0) {
    fragment.appendChild(buildCriteriaCard(data.criteriaStats));
  }

  if (!fragment.childNodes.length) {
    //renderEmptyState();
    showAlert('warning', 'No hay datos de estadísticas para este código.');
    return;
  }

  container.appendChild(fragment);
}

function buildPersonalCard(personalData) {
  const { id, name, nationality, category_name, category_position } = personalData;
  const card = document.createElement('div');
  card.className = 'col-12 col-lg-10';

  const flagUrl = nationality ? `https://flagsapi.com/${nationality}/shiny/48.png` : null;

  card.innerHTML = `
    <div class="card shadow-sm border-0 overflow-hidden">
      <div class="card-body bg-primary bg-gradient text-white text-center">
        <div class="d-flex flex-column align-items-center gap-2">
          <div class="d-flex align-items-center justify-content-center gap-2 flex-wrap">
            <h3 class="mb-0 text-uppercase fw-bold">${name ?? 'Dancer'}</h3>
            ${flagUrl ? `<img src="${flagUrl}" alt="${nationality}" class="rounded shadow-sm" style="width:48px;height:36px;">` : ''}
          </div>
          <div class="d-flex flex-wrap justify-content-center gap-2 mt-2">
            <span class="badge bg-light text-primary fw-semibold fs-6 px-3 py-2"><i class="bi bi-bookmark-star me-1"></i>${category_name ?? 'Category'}</span>
            <span class="badge bg-warning text-dark fw-semibold fs-6 px-3 py-2"><i class="bi bi-trophy me-1"></i>Pos. ${category_position ?? '-'}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  return card;
}

function buildVotesDetailCard(results, personalData) {
  const styles = Array.isArray(results?.styles) ? results.styles : [];
  const dancerId = personalData?.id ?? null;

  const card = document.createElement('div');
  card.className = 'col-12 col-lg-10';

  if (!styles.length) {
    card.innerHTML = `
      <div class="card shadow-sm border-0">
        <div class="card-header bg-white d-flex align-items-center gap-2">
          <i class="bi bi-table text-primary"></i>
          <span class="fw-semibold">Detalle de las votaciones</span>
        </div>
        <div class="card-body">
          <div class="text-muted">No hay detalle de votaciones disponible.</div>
        </div>
      </div>
    `;
    return card;
  }

  const { criteria } = buildVotesSchema(styles, dancerId);
  const collapseId = 'votesDetailCollapse';

  card.innerHTML = `
    <div class="card shadow border-0 overflow-hidden">
      <button
        class="btn btn-primary bg-gradient text-white text-start d-flex align-items-center justify-content-between gap-3 px-4 py-3"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#${collapseId}"
        aria-expanded="false"
        aria-controls="${collapseId}"
      >
        <span class="d-flex align-items-center gap-2">
          <i class="bi bi-card-list fs-5"></i>
          <span class="fw-semibold">Detalle de las votaciones</span>
        </span>
        <span class="d-flex align-items-center gap-2">
          <span class="badge bg-light text-primary fw-semibold">${styles.length} styles</span>
          <span class="d-inline-flex align-items-center justify-content-center rounded-pill bg-white bg-opacity-25" style="width:32px;height:32px;">
            <i class="bi bi-chevron-down" id="${collapseId}Icon" aria-hidden="true"></i>
          </span>
        </span>
      </button>
      <div id="${collapseId}" class="collapse">
        <div class="card-body p-0">
          <div class="p-3 p-md-4">
            <div class="table-responsive" id="votesDetailTableWrap"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const wrap = card.querySelector('#votesDetailTableWrap');
  // Ensure horizontal scroll works smoothly on touch devices.
  wrap.style.overflowX = 'auto';
  wrap.style.webkitOverflowScrolling = 'touch';
  wrap.appendChild(buildVotesDetailTable(styles, criteria, dancerId));

  const collapseEl = card.querySelector(`#${collapseId}`);
  const iconEl = card.querySelector(`#${collapseId}Icon`);
  if (collapseEl && iconEl) {
    collapseEl.addEventListener('show.bs.collapse', () => {
      iconEl.classList.remove('bi-chevron-down');
      iconEl.classList.add('bi-chevron-up');
    });
    collapseEl.addEventListener('hide.bs.collapse', () => {
      iconEl.classList.remove('bi-chevron-up');
      iconEl.classList.add('bi-chevron-down');
    });
  }

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
  table.className = 'table table-sm table-bordered table-hover align-middle mb-0 small';
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
  thead.className = 'table-light';

  const header = document.createElement('tr');
  const thStyle = document.createElement('th');
  thStyle.scope = 'col';
  thStyle.className = 'text-start';
  thStyle.textContent = 'Style';
  if (stickyStyle) makeStickyCell(thStyle, 0, 3, '#f8f9fa');
  header.appendChild(thStyle);

  const thJudge = document.createElement('th');
  thJudge.scope = 'col';
  thJudge.className = 'text-center';
  thJudge.textContent = 'Judge';
  if (stickyJudge) makeStickyCell(thJudge, styleColWidthPx, 3, '#f8f9fa');
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
  thTotal.textContent = 'Total';
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
        tdStyle.className = 'text-start';
        tdStyle.rowSpan = rowSpan;
        const maxNameWidth = Math.max(60, styleColWidthPx - 20);
        tdStyle.innerHTML = `
          <div class="fw-semibold text-truncate" style="max-width:${maxNameWidth}px" title="${escapeHtml(styleName)}">${escapeHtml(styleName)}</div>
          ${styleTotal != null ? `<div class="mt-1"><span class="badge bg-primary-subtle text-primary fw-semibold">Total ${escapeHtml(styleTotal)}</span></div>` : ''}
        `;
        tdStyle.style.verticalAlign = 'top';
        tdStyle.classList.add('bg-body-secondary');
        if (isMobile) {
          tdStyle.style.padding = '0.35rem';
          //tdStyle.style.fontSize = '0.75rem';
          tdStyle.style.lineHeight = '1.1';
          tdStyle.style.wordBreak = 'break-word';
        }
        if (stickyStyle) makeStickyCell(tdStyle, 0, 2, 'var(--bs-secondary-bg)');
        tr.appendChild(tdStyle);
        tr.classList.add('border-top', 'border-2');
      }

      const judgeName = (vote?.judge_name || '-').trim() || '-';
      const tdJudge = document.createElement('td');
      tdJudge.className = 'text-center';
      tdJudge.textContent = judgeName;
      tdJudge.title = judgeName;
      tdJudge.style.whiteSpace = 'nowrap';
      tdJudge.style.overflow = 'hidden';
      tdJudge.style.textOverflow = 'ellipsis';
      if (isMobile) {
        tdJudge.style.padding = '0.35rem';
        //tdJudge.style.fontSize = '0.75rem';
        tdJudge.style.lineHeight = '1.1';
        tdJudge.style.wordBreak = 'break-word';
      }
      if (stickyJudge) makeStickyCell(tdJudge, styleColWidthPx, 1, '#fff');
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

      const judgeTotal = vote?.total_score ?? sumNumericScores(voteCriteria);
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
    return `<span class="text-muted">-</span>`;
  }
  if (typeof value === 'number' || /^\s*\d+(\.\d+)?\s*$/.test(String(value))) {
    return `<span class="badge bg-dark-subtle text-dark fw-semibold">${escapeHtml(value)}</span>`;
  }
  return `<span class="fw-semibold">${escapeHtml(value)}</span>`;
}

function renderTotalScore(value) {
  if (value == null || value === '-' || value === '') {
    return `<span class="text-muted">-</span>`;
  }
  return `<span class="badge bg-warning text-dark fw-bold px-2 py-1">${escapeHtml(value)}</span>`;
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
  card.className = 'col-12 col-lg-4';
  card.innerHTML = `
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white d-flex align-items-center gap-2">
        <i class="bi bi-sliders2-vertical text-primary"></i>
        <span class="fw-semibold">Criteria</span>
      </div>
      <div class="card-body">
        <div class="d-flex flex-column gap-3" id="criteriaList"></div>
      </div>
    </div>
  `;

  const list = card.querySelector('#criteriaList');
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
  row.className = 'border rounded-3 p-3 bg-light';
  row.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
      <div>
        <div class="fw-semibold">${item.name}</div>
        <div class="text-muted small">Min ${min.toFixed(1)} - Max ${max.toFixed(1)}</div>
      </div>
      ${diffBadge(diff)}
    </div>
    ${progressBlock('Average', avg, 'primary')}
    ${progressBlock('Others', others, 'secondary')}
  `;
  return row;
}

function buildJudgesCard(judges) {
  const card = document.createElement('div');
  card.className = 'col-12 col-lg-4';
  card.innerHTML = `
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white d-flex align-items-center gap-2">
        <i class="bi bi-people text-primary"></i>
        <span class="fw-semibold">Judges</span>
      </div>
      <div class="card-body">
        <div class="d-flex flex-column gap-3" id="judgesList"></div>
      </div>
    </div>
  `;

  const list = card.querySelector('#judgesList');
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
  row.className = 'border rounded-3 p-3 bg-light';
  row.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
      <div>
        <div class="fw-semibold">${judge.name}</div>
        <div class="text-muted small">Min ${min.toFixed(1)} - Max ${max.toFixed(1)}</div>
      </div>
      ${diffBadge(diff)}
    </div>
    ${progressBlock('Average', avg, 'primary')}
    ${progressBlock('Others', others, 'secondary')}
  `;
  return row;
}

function buildStylesCard(styles) {
  const card = document.createElement('div');
  card.className = 'col-12 col-lg-4';
  card.innerHTML = `
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white d-flex align-items-center gap-2">
        <i class="bi bi-music-note-beamed text-primary"></i>
        <span class="fw-semibold">Styles</span>
      </div>
      <div class="card-body">
        <div class="d-flex flex-column gap-3" id="stylesList"></div>
      </div>
    </div>
  `;

  const list = card.querySelector('#stylesList');
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
  col.className = '';
  col.innerHTML = `
    <div class="border rounded-3 p-3 h-100 bg-light">
      <div class="d-flex justify-content-between align-items-center gap-2 mb-1">
        <div class="fw-semibold">${style.style_name}</div>
        <span class="badge bg-primary-subtle text-primary fw-semibold">Pos. ${style.position ?? '-'}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
        <div class="text-muted small mb-0">Min ${min.toFixed(1)} - Max ${max.toFixed(1)}</div>
        ${diffBadge(diff)}
      </div>
      <div class="mb-2">${progressBlock('Average', avg, 'primary')}</div>
      <div>${progressBlock('Others', others, 'secondary')}</div>
    </div>
  `;
  return col;
}

function progressBlock(label, value, color) {
  const safeVal = clampToRange(value, 0, 10);
  return `
    <div>
      <div class="d-flex justify-content-between small mb-1">
        <span class="fw-semibold text-${color === 'secondary' ? 'secondary' : 'primary'}">${label}</span>
        <span class="text-muted">${safeVal.toFixed(2)}/10</span>
      </div>
      <div class="progress" style="height: 8px;">
        <div class="progress-bar bg-${color}" role="progressbar" style="width: ${safeVal * 10}%" aria-valuenow="${safeVal}" aria-valuemin="0" aria-valuemax="10"></div>
      </div>
    </div>
  `;
}

function diffBadge(diff) {
  const positive = diff >= 0;
  const badgeClass = positive ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
  const icon = positive ? 'bi-arrow-up-right' : 'bi-arrow-down-right';
  const label = `${positive ? '+' : ''}${diff.toFixed(2)} vs others`;
  return `<span class="badge ${badgeClass} d-inline-flex align-items-center gap-1"><i class="bi ${icon}"></i>${label}</span>`;
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
  alertBox.innerHTML = `<div class="alert alert-${type} mb-0" role="alert">${message}</div>`;
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
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Loading...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-graph-up-arrow me-2"></i>Get Stats`;
  }
}
