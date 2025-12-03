const statsContainer = () => document.getElementById('statisticsContainer');
const statsAlert = () => document.getElementById('statsAlert');
const getStatsBtn = () => document.getElementById('getStatsBtn');
const dancerCodeInput = () => document.getElementById('dancerCode');

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  renderEmptyState();

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
    renderEmptyState();
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
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();

  if (data.personalData) {
    fragment.appendChild(buildPersonalCard(data.personalData));
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
    renderEmptyState();
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
