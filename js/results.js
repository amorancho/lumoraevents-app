//var title = 'Results';
let categoryName;

let autoRefreshInterval = null;

function shouldShowAvgPlaceBadge() {
  return getEvent().totalSystem === 'AVG_POSJUD';
}

function formatAvgPlace(avgPlace) {
  if (avgPlace == null || avgPlace === '') return '';
  const num = Number(avgPlace);
  return Number.isNaN(num) ? avgPlace : num;
}

function getDancerClubLabel(dancer) {
  const clubName = String(dancer?.club_name || '').trim();
  const clubLocation = String(dancer?.club_location || '').trim();
  if (!clubName) return '';
  return clubLocation ? `${clubName} (${clubLocation})` : clubName;
}

function getValidPenalties(source) {
  if (!Array.isArray(source)) return [];
  return source.filter((penalty) => {
    if (!penalty || typeof penalty !== 'object') return false;
    const hasName = String(penalty.name || '').trim() !== '';
    const hasScore = penalty.score !== undefined && penalty.score !== null && penalty.score !== '';
    return hasName || hasScore;
  });
}

function renderPenaltiesCard(penalties, { headerSuffix = '' } = {}) {
  const validPenalties = getValidPenalties(penalties);
  if (!validPenalties.length) return null;

  const penaltyCard = document.createElement('div');
  penaltyCard.className = 'card mb-3 border-warning shadow-sm';
  penaltyCard.innerHTML = `
    <div class="card-header d-flex justify-content-between align-items-center bg-warning-subtle">
      <h6 class="mb-0 text-warning">${escapeHtml(t('penalties', 'Penalties'))}${headerSuffix}</h6>
      <span class="badge text-bg-warning">${validPenalties.length}</span>
    </div>
    <div class="card-body">
      <div class="row g-2">
        ${validPenalties.map((penalty) => `
          <div class="col-12 col-md-6">
            <div class="border rounded p-2 h-100 bg-light">
              <div class="fw-semibold">${escapeHtml(penalty.name || '-')}</div>
              <div class="small text-muted">${escapeHtml(t('total_score', 'Total Score'))}: ${escapeHtml(penalty.score ?? '-')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return penaltyCard;
}

function normalizeLookupKey(value) {
  return String(value || '').trim().toUpperCase();
}

function formatScoreValue(value, { fixedDecimals = null } = {}) {
  if (value === undefined || value === null || value === '') return '-';

  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  if (fixedDecimals !== null) return num.toFixed(fixedDecimals);

  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function sumVoteCriteriaScores(criteria) {
  return (criteria || []).reduce((sum, criterion) => sum + (Number(criterion?.score) || 0), 0);
}

function getVoteTotalScore(vote) {
  return vote?.judge_total_score ?? vote?.total_score ?? sumVoteCriteriaScores(vote?.criteria);
}

function shouldShowPenaltiesColumn() {
  return Boolean(getEvent()?.has_penalties);
}

function getPenaltyTotal(penalties) {
  return getValidPenalties(penalties).reduce((sum, penalty) => sum + (Number(penalty?.score) || 0), 0);
}

function getResultsStyleById(styleId) {
  return (window.resultsData?.styles || []).find((style) => Number(style?.style_id) === Number(styleId)) || null;
}

function getStyleDancerById(styleObj, dancerId) {
  return (styleObj?.clasification || []).find((dancer) => Number(dancer?.dancer_id) === Number(dancerId)) || null;
}

function getCriteriaDisplayLabel(criteria) {
  const rawName = String(criteria?.name || '').trim();
  const percentage = criteria?.percentage;

  if (percentage === undefined || percentage === null || percentage === '') {
    return rawName;
  }

  const numericPercentage = Number(percentage);
  if (!Number.isFinite(numericPercentage)) {
    return rawName;
  }

  return `${rawName} (${numericPercentage.toFixed(0)}%)`;
}

function getCriteriaColumnStyle() {
  const widthRem = getEvent()?.criteriaPerJudge ? 5 : 3.25;
  return `width: ${widthRem}rem; min-width: ${widthRem}rem; max-width: ${widthRem}rem;`;
}

function getPenaltyColumnStyle() {
  return 'width: 3.5rem; min-width: 3.5rem; max-width: 3.5rem;';
}

function getDancerColumnStyle() {
  return 'width: 14rem; min-width: 14rem;';
}

function getCriteriaHeaderTextStyle() {
  return 'display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; font-size: 0.72rem; line-height: 1.1;';
}

function renderCriteriaHeaderCell(label) {
  const safeLabel = escapeHtml(label);
  return `
    <th class="text-center align-middle" style="${getCriteriaColumnStyle()}">
      <span style="${getCriteriaHeaderTextStyle()}" title="${safeLabel}">${safeLabel}</span>
    </th>
  `;
}

function renderStyleTableDancerCell(dancer) {
  const clubLabel = getDancerClubLabel(dancer);

  return `
    <div class="d-flex align-items-center gap-2">
      ${getDancerFlagImgHtml(dancer?.dancer_nationality, { width: 20, height: 20 })}
      <div class="d-flex flex-column">
        <span class="fw-semibold">${escapeHtml(dancer?.dancer_name || '-')}</span>
        ${clubLabel ? `<small class="text-muted">${escapeHtml(clubLabel)}</small>` : ''}
      </div>
    </div>
  `;
}

function collectStyleCriteriaSummary(styleObj) {
  const criteria = [];
  const criteriaKeys = new Set();

  (styleObj?.clasification || []).forEach((dancer) => {
    (dancer?.votes || []).forEach((vote) => {
      (vote?.criteria || []).forEach((criterion) => {
        const key = normalizeLookupKey(criterion?.name);
        if (!key || criteriaKeys.has(key)) return;
        criteriaKeys.add(key);
        criteria.push({
          key,
          name: String(criterion?.name || '').trim(),
          percentage: criterion?.percentage
        });
      });
    });
  });

  return criteria;
}

function collectStyleJudgeGroups(styleObj) {
  const judges = [];
  const judgesMap = new Map();

  (styleObj?.clasification || []).forEach((dancer) => {
    (dancer?.votes || []).forEach((vote) => {
      const judgeName = String(vote?.judge_name || '').trim() || t('judge', 'Judge');
      const judgeKey = normalizeLookupKey(judgeName);
      if (!judgeKey) return;

      let judgeGroup = judgesMap.get(judgeKey);
      if (!judgeGroup) {
        judgeGroup = {
          key: judgeKey,
          judgeName,
          criteria: [],
          criteriaKeys: new Set()
        };
        judgesMap.set(judgeKey, judgeGroup);
        judges.push(judgeGroup);
      }

      (vote?.criteria || []).forEach((criterion) => {
        const criterionKey = normalizeLookupKey(criterion?.name);
        if (!criterionKey || judgeGroup.criteriaKeys.has(criterionKey)) return;
        judgeGroup.criteriaKeys.add(criterionKey);
        judgeGroup.criteria.push({
          key: criterionKey,
          name: String(criterion?.name || '').trim(),
          percentage: criterion?.percentage
        });
      });
    });
  });

  return judges.map(({ criteriaKeys, ...judgeGroup }) => judgeGroup);
}

function renderStyleCriteriaSummaryTable(styleObj) {
  const dancers = Array.isArray(styleObj?.clasification) ? styleObj.clasification : [];
  const criteria = collectStyleCriteriaSummary(styleObj);
  const showPenalties = shouldShowPenaltiesColumn();

  if (!dancers.length || !criteria.length) {
    return `<div class="alert alert-info mb-0">${escapeHtml(t('no_style_voting_details', 'No voting details available for this style.'))}</div>`;
  }

  const headerCells = criteria
    .map((criterion) => renderCriteriaHeaderCell(getCriteriaDisplayLabel(criterion)))
    .join('');

  const bodyRows = dancers.map((dancer, index) => {
    const criteriaTotals = new Map();

    (dancer?.votes || []).forEach((vote) => {
      (vote?.criteria || []).forEach((criterion) => {
        const criterionKey = normalizeLookupKey(criterion?.name);
        if (!criterionKey) return;
        const currentTotal = criteriaTotals.get(criterionKey) || 0;
        criteriaTotals.set(criterionKey, currentTotal + (Number(criterion?.score) || 0));
      });
    });

    const criteriaCells = criteria.map((criterion) => {
      const hasValue = criteriaTotals.has(criterion.key);
      return `<td class="text-center align-middle" style="${getCriteriaColumnStyle()}">${hasValue ? formatScoreValue(criteriaTotals.get(criterion.key)) : '-'}</td>`;
    }).join('');
    const penaltiesCell = showPenalties
      ? `<td class="text-center fw-semibold" style="${getPenaltyColumnStyle()}">${formatScoreValue(getPenaltyTotal(dancer?.penalties))}</td>`
      : '';

    return `
      <tr>
        <td class="text-center fw-semibold">${index + 1}</td>
        <td>${renderStyleTableDancerCell(dancer)}</td>
        <td class="text-center fw-semibold">${formatScoreValue(dancer?.total_score)}</td>
        ${penaltiesCell}
        ${criteriaCells}
      </tr>
    `;
  }).join('');

  return `
    <div class="table-responsive">
      <table class="table table-bordered table-sm align-middle mb-0">
        <colgroup>
          <col>
          <col style="${getDancerColumnStyle()}">
          <col>
          ${showPenalties ? `<col style="${getPenaltyColumnStyle()}">` : ''}
          ${criteria.map(() => `<col style="${getCriteriaColumnStyle()}">`).join('')}
        </colgroup>
        <thead class="table-light">
          <tr>
            <th class="text-center">${escapeHtml(t('place', 'Place'))}</th>
            <th>${escapeHtml(t('dancer', 'Dancer'))}</th>
            <th class="text-center">${escapeHtml(t('total_score', 'Total Score'))}</th>
            ${showPenalties ? `<th class="text-center" style="${getPenaltyColumnStyle()}">${escapeHtml(t('penalties_abbr', 'Pen.'))}</th>` : ''}
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;
}

function renderStyleJudgeGroupedTable(styleObj) {
  const dancers = Array.isArray(styleObj?.clasification) ? styleObj.clasification : [];
  const judgeGroups = collectStyleJudgeGroups(styleObj);
  const showPenalties = shouldShowPenaltiesColumn();

  if (!dancers.length || !judgeGroups.length) {
    return `<div class="alert alert-info mb-0">${escapeHtml(t('no_style_voting_details', 'No voting details available for this style.'))}</div>`;
  }

  const judgeHeaderRow = judgeGroups.map((judgeGroup) => {
    const colspan = Math.max(judgeGroup.criteria.length, 1);
    return `<th class="text-center" colspan="${colspan}">${escapeHtml(judgeGroup.judgeName)}</th>`;
  }).join('');

  const criteriaHeaderRow = judgeGroups.map((judgeGroup) => {
    if (!judgeGroup.criteria.length) {
      return `<th class="text-center">${escapeHtml(t('total', 'Total'))}</th>`;
    }

    return judgeGroup.criteria
      .map((criterion) => renderCriteriaHeaderCell(getCriteriaDisplayLabel(criterion)))
      .join('');
  }).join('');

  const bodyRows = dancers.map((dancer, index) => {
    const votesByJudge = new Map(
      (dancer?.votes || []).map((vote) => [normalizeLookupKey(vote?.judge_name), vote])
    );

    const judgeCells = judgeGroups.map((judgeGroup) => {
      const vote = votesByJudge.get(judgeGroup.key);
      if (!vote) {
        return new Array(Math.max(judgeGroup.criteria.length, 1))
          .fill('<td class="text-center text-muted">-</td>')
          .join('');
      }

      if (!judgeGroup.criteria.length) {
        return `<td class="text-center">${formatScoreValue(getVoteTotalScore(vote))}</td>`;
      }

      const criteriaByKey = new Map(
        (vote?.criteria || []).map((criterion) => [normalizeLookupKey(criterion?.name), criterion])
      );

      return judgeGroup.criteria.map((criterion) => {
        const currentCriterion = criteriaByKey.get(criterion.key);
        return `<td class="text-center align-middle" style="${getCriteriaColumnStyle()}">${currentCriterion ? formatScoreValue(currentCriterion?.score) : '-'}</td>`;
      }).join('');
    }).join('');
    const penaltiesCell = showPenalties
      ? `<td class="text-center fw-semibold" style="${getPenaltyColumnStyle()}">${formatScoreValue(getPenaltyTotal(dancer?.penalties))}</td>`
      : '';

    return `
      <tr>
        <td class="text-center fw-semibold">${index + 1}</td>
        <td>${renderStyleTableDancerCell(dancer)}</td>
        <td class="text-center fw-semibold">${formatScoreValue(dancer?.total_score)}</td>
        ${penaltiesCell}
        ${judgeCells}
      </tr>
    `;
  }).join('');

  return `
    <div class="table-responsive">
      <table class="table table-bordered table-sm align-middle mb-0">
        <colgroup>
          <col>
          <col style="${getDancerColumnStyle()}">
          <col>
          ${showPenalties ? `<col style="${getPenaltyColumnStyle()}">` : ''}
          ${judgeGroups.map((judgeGroup) => {
            if (!judgeGroup.criteria.length) {
              return '<col>';
            }
            return judgeGroup.criteria.map(() => `<col style="${getCriteriaColumnStyle()}">`).join('');
          }).join('')}
        </colgroup>
        <thead class="table-light">
          <tr>
            <th class="text-center" rowspan="2">${escapeHtml(t('place', 'Place'))}</th>
            <th rowspan="2">${escapeHtml(t('dancer', 'Dancer'))}</th>
            <th class="text-center" rowspan="2">${escapeHtml(t('total_score', 'Total Score'))}</th>
            ${showPenalties ? `<th class="text-center" rowspan="2" style="${getPenaltyColumnStyle()}">${escapeHtml(t('penalties_abbr', 'Pen.'))}</th>` : ''}
            ${judgeHeaderRow}
          </tr>
          <tr>
            ${criteriaHeaderRow}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;
}

function renderStyleVotingDetailsTable(styleObj) {
  if (getEvent()?.criteriaPerJudge) {
    return renderStyleCriteriaSummaryTable(styleObj);
  }

  return renderStyleJudgeGroupedTable(styleObj);
}

function showStyleVotingDetailsModal(styleObj, styleVotingModalEl, styleVotingModal, styleDetailsContainer) {
  if (!styleObj || !styleVotingModalEl || !styleVotingModal || !styleDetailsContainer) return;

  styleDetailsContainer.innerHTML = `
    <div class="mb-3">
      <div class="small text-muted">${escapeHtml(categoryName || '-')}</div>
      <div class="fw-bold fs-4 text-primary">${escapeHtml(styleObj?.style_name || '-')}</div>
    </div>
    ${renderStyleVotingDetailsTable(styleObj)}
  `;

  const titleSpan = styleVotingModalEl.querySelector('.modal-title span');
  if (titleSpan) {
    titleSpan.textContent = t('style_voting_details', 'Style Voting Details');
  }

  styleVotingModal.show();
}

function showDancerVotingDetailsModal(styleObj, dancerData, votingModalEl, votingModal, detailsContainer) {
  if (!styleObj || !dancerData || !votingModalEl || !votingModal || !detailsContainer) return;

  const clubLabel = getDancerClubLabel(dancerData);
  detailsContainer.innerHTML = '';

  const summaryCard = document.createElement('div');
  summaryCard.className = 'card mb-3 border-primary shadow-sm';
  summaryCard.innerHTML = `
    <div class="card-body">
      <div class="row align-items-center">
        <div class="col">
          <div class="fw-bold fs-2 text-primary mb-2">
            ${escapeHtml(categoryName || '-')} - ${escapeHtml(styleObj.style_name || '-')}
          </div>
          <div class="d-flex align-items-center gap-2">
            ${getDancerFlagImgHtml(dancerData.dancer_nationality, { width: 24, height: 24 })}
            <div class="d-flex align-items-baseline flex-wrap gap-2">
              <strong class="fs-5">${escapeHtml(dancerData.dancer_name || '-')}</strong>
              ${clubLabel ? `<small class="text-muted">${escapeHtml(clubLabel)}</small>` : ''}
            </div>
          </div>
        </div>
        <div class="col-auto text-center">
          <div class="d-flex align-items-center gap-2 justify-content-center flex-wrap">
            <span class="badge bg-success fs-4 py-2 px-3">
              ${formatScoreValue(dancerData.total_score, { fixedDecimals: 1 })}
            </span>
            ${shouldShowAvgPlaceBadge() ? `
              <span class="badge bg-info fs-5 py-2 px-3">
                ${formatAvgPlace(dancerData.avg_place)}
              </span>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
  detailsContainer.appendChild(summaryCard);

  const dancerPenalties = getValidPenalties(dancerData.penalties);
  const votes = Array.isArray(dancerData.votes) ? dancerData.votes : [];
  const hasVoteLevelPenalties = votes.some((vote) => getValidPenalties(vote?.penalties).length > 0);

  if (dancerPenalties.length > 0 && !hasVoteLevelPenalties) {
    const dancerPenaltiesCard = renderPenaltiesCard(dancerPenalties);
    if (dancerPenaltiesCard) {
      detailsContainer.appendChild(dancerPenaltiesCard);
    }
  }

  if (votes.length > 0) {
    votes.forEach((vote) => {
      const votePenalties = getValidPenalties(vote?.penalties);
      if (votePenalties.length > 0) {
        const votePenaltiesCard = renderPenaltiesCard(votePenalties, {
          headerSuffix: vote?.judge_name ? ` - ${escapeHtml(vote.judge_name)}` : ''
        });
        if (votePenaltiesCard) {
          detailsContainer.appendChild(votePenaltiesCard);
        }
      }

      const judgeCard = document.createElement('div');
      judgeCard.className = 'card mb-3';
      judgeCard.innerHTML = `
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="mb-0 text-primary">${escapeHtml(vote.judge_name || t('judge', 'Judge'))}</h6>
          <span class="badge bg-primary fs-6">${escapeHtml(t('total', 'Total'))}: ${formatScoreValue(getVoteTotalScore(vote), { fixedDecimals: 1 })}</span>
        </div>
        <div class="card-body">
          <div class="row">
            ${(vote.criteria || []).map((criterion) => `
              <div class="col-6 col-md-4 col-lg-4 mb-2">
                <label class="form-label mb-1">${escapeHtml(getCriteriaDisplayLabel(criterion))}</label>
                <input type="text" class="form-control" value="${escapeHtml(formatScoreValue(criterion?.score))}" readonly>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      detailsContainer.appendChild(judgeCard);
    });
  } else {
    const noVotes = document.createElement('p');
    noVotes.textContent = t('no_voting_details');
    detailsContainer.appendChild(noVotes);
  }

  const titleSpan = votingModalEl.querySelector('.modal-title span');
  if (titleSpan) {
    titleSpan.textContent = t('voting_details');
  }

  votingModal.show();
}

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();

  const user = getUserFromToken();
  const role = user ? user.role : 'guest';

  if (!getEvent().visibleResults && role !== 'admin' && role !== 'organizer') {
    alert(t('page_not_visible'));
    window.location.href = `home.html?eventId=${eventId}`;
    return;
  }

  const categorySelect = document.getElementById('categorySelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const categoriaBadge = document.getElementById('categoriaBadge');
  const infoText = document.getElementById('infoText');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  const autoRefreshLabel = document.getElementById('autoRefreshLabel');

  refreshBtn.disabled = true;
  autoRefreshToggle.disabled = true;

  autoRefreshLabel.textContent += ` (${getEvent().autoRefreshMin || 2} min)`;

  const votingModalEl = document.getElementById('votingDetailsModal');
  let votingModal = null;
  const detailsContainer = document.getElementById('votingDetailsContainer');
  if (votingModalEl) votingModal = new bootstrap.Modal(votingModalEl);

  const styleVotingModalEl = document.getElementById('styleVotingDetailsModal');
  let styleVotingModal = null;
  const styleDetailsContainer = document.getElementById('styleVotingDetailsContainer');
  if (styleVotingModalEl) styleVotingModal = new bootstrap.Modal(styleVotingModalEl);

  categorySelect.addEventListener('change', async (e) => {
    const categoryId = e.target.value;
    if (!categoryId) return;

    refreshBtn.disabled = false;
    autoRefreshToggle.disabled = false;
    categoryName = categorySelect.options[categorySelect.selectedIndex].text;

    if (categoriaBadge) {
      categoriaBadge.textContent = categoryName;
      categoriaBadge.classList.remove('d-none');
    }

    if (infoText) {
      infoText.classList.remove('d-none');
      infoText.classList.add('d-block');
    }

    await loadClasifications(categoryId);
  });

  refreshBtn.addEventListener('click', () => {
    categorySelect.dispatchEvent(new Event('change'));
  });

  autoRefreshToggle.addEventListener('change', () => {
    if (autoRefreshToggle.checked) {
      autoRefreshInterval = setInterval(() => {
        categorySelect.dispatchEvent(new Event('change'));
      }, 60000 * (getEvent().autoRefreshMin || 2));
      return;
    }

    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  });

  document.addEventListener('click', (event) => {
    const styleDetailsBtn = event.target.closest('.style-details-btn');
    if (styleDetailsBtn) {
      if (!window.resultsData || !styleVotingModal || !styleDetailsContainer) return;

      const styleBlock = styleDetailsBtn.closest('.style-block');
      if (!styleBlock) return;

      const styleId = Number(styleDetailsBtn.dataset.styleId || styleBlock.dataset.styleId);
      const styleObj = getResultsStyleById(styleId);
      if (!styleObj) return;

      showStyleVotingDetailsModal(styleObj, styleVotingModalEl, styleVotingModal, styleDetailsContainer);
      return;
    }

    const dancerEl = event.target.closest('.dancer-result');
    if (!dancerEl) return;

    const styleBlock = dancerEl.closest('.style-block');
    if (!styleBlock) return;

    if (!window.resultsData || !votingModal || !detailsContainer) return;

    const styleId = Number(styleBlock.dataset.styleId);
    const dancerId = Number(dancerEl.dataset.dancerId);
    const styleObj = getResultsStyleById(styleId);
    if (!styleObj) return;

    const dancerData = getStyleDancerById(styleObj, dancerId);
    if (!dancerData) return;

    showDancerVotingDetailsModal(styleObj, dancerData, votingModalEl, votingModal, detailsContainer);
  });

  loadCategories();
});

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const categories = await response.json();
    populateCategorySelect(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
}

function populateCategorySelect(categories) {
  const categorySelect = document.getElementById('categorySelect');
  categorySelect.innerHTML = `<option selected disabled>${t('select_category')}</option>`;

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
}

async function loadClasifications(categoryId) {
  const resultsContainer = document.getElementById('resultsContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const categorySelect = document.getElementById('categorySelect');

  refreshBtn.disabled = true;
  categorySelect.disabled = true;
  const originalBtnText = refreshBtn.innerHTML;
  refreshBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> ${t('loading')}`;

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/results?event_id=${getEvent().id}&category_id=${categoryId}`);
    if (!response.ok) throw new Error('Network error');

    const data = await response.json();
    window.resultsData = data;
    renderResults(data);
  } catch (err) {
    console.error('Error loading results:', err);
    resultsContainer.innerHTML = '<div class="alert alert-danger">Error loading results.</div>';
  } finally {
    refreshBtn.disabled = false;
    categorySelect.disabled = false;
    refreshBtn.innerHTML = originalBtnText;
  }
}

function renderResults(data) {
  const resultsContainer = document.getElementById('resultsContainer');
  const general = Array.isArray(data?.general) ? data.general : [];
  const styles = Array.isArray(data?.styles) ? data.styles : [];

  resultsContainer.innerHTML = '';

  if (!general.length && !styles.length) {
    resultsContainer.innerHTML = `
      <div class="alert alert-info text-center">
        ${t('no_results')}
      </div>
    `;
    return;
  }

  const row = document.createElement('div');
  row.className = 'row g-4 pt-2';

  let colStylesClass = 'col-12';

  if (getEvent().catClassification !== 'NO') {
    const colGeneral = document.createElement('div');
    colGeneral.className = 'col-12 col-lg-4';
    colGeneral.innerHTML = renderGeneralClassification(general);
    row.appendChild(colGeneral);

    colStylesClass += ' col-lg-8';
  }

  const colStyles = document.createElement('div');
  colStyles.className = colStylesClass;

  const stylesRow = document.createElement('div');
  stylesRow.className = 'row g-4';

  styles.forEach((style) => {
    const styleCol = document.createElement('div');
    styleCol.className = 'col-12 col-md-6 col-xl-4';
    styleCol.innerHTML = renderStyleClassification(style);
    stylesRow.appendChild(styleCol);
  });

  colStyles.appendChild(stylesRow);
  row.appendChild(colStyles);
  resultsContainer.appendChild(row);
}

function renderGeneralClassification(general) {
  if (!general || general.length === 0) {
    return `
      <div class="list-group shadow-sm border-primary border-2 h-100">
        <div class="list-group-item active bg-primary fs-5 text-center">${t('general_classification')}</div>
        <div class="list-group-item text-center text-muted">${t('no_results')}</div>
      </div>
    `;
  }

  let html = `
    <div class="list-group shadow-sm border-primary border-2 h-100">
      <div class="list-group-item active bg-primary fs-5 text-center">${t('general_classification')}</div>
  `;

  general.forEach((dancer, index) => {
    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['warning', 'secondary', 'warning-subtle'];
    const clubLabel = getDancerClubLabel(dancer);

    if (index < 3) {
      html += `
        <div class="row my-2">
          <div class="col-12${index === 0 ? '' : ' col-6'}">
            <div class="card border-${colors[index]} shadow text-center">
              <div class="card-header bg-${colors[index]} text-${index === 2 ? 'dark' : 'white'} fs-4">${medals[index]} ${index + 1}&ordm; ${t('place')}</div>
              <div class="card-body">
                <div class="d-flex justify-content-center align-items-center gap-2 mb-3">
                  ${getDancerFlagImgHtml(dancer.dancer_nationality, { width: 24, height: 24 })}
                  <div class="d-flex align-items-baseline flex-wrap gap-2">
                    <h3 class="mb-0 dancer-result">${escapeHtml(dancer.dancer_name)}</h3>
                    ${clubLabel ? `<small class="text-muted">${escapeHtml(clubLabel)}</small>` : ''}
                  </div>
                </div>
                <p class="card-text fs-4">
                  🥇 ${dancer.num_oros || 0} &nbsp;|&nbsp; 🥈 ${dancer.num_platas || 0} &nbsp;|&nbsp; 🥉 ${dancer.num_bronces || 0}
                </p>
                <p class="fs-5 text-muted mb-0">
                  <strong>${t('total_score')}:</strong> ${formatScoreValue(dancer.total_score, { fixedDecimals: 1 })}
                </p>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    html += `
      <div class="list-group-item d-flex justify-content-between align-items-center fs-6">
        <span class="me-2">${dancer.position}</span>
        ${getDancerFlagImgHtml(dancer.dancer_nationality, { className: 'me-2' })}
        <span class="me-auto d-flex align-items-baseline flex-wrap gap-1 dancer-result">
          <span>${escapeHtml(dancer.dancer_name)}</span>
          ${clubLabel ? `<small class="text-muted">${escapeHtml(clubLabel)}</small>` : ''}
        </span>
        <span class="mx-2 text-muted small">
          (${t('total_score')}: ${formatScoreValue(dancer.total_score)})
        </span>
        <span class="badge bg-light text-dark rounded-pill">
          🥇 ${dancer.num_oros || 0} | 🥈 ${dancer.num_platas || 0} | 🥉 ${dancer.num_bronces || 0}
        </span>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

function renderStyleClassification(style) {
  if (!style || !style.clasification || style.clasification.length === 0) {
    return `
      <div class="list-group shadow-sm style-block" data-style-id="${style?.style_id || ''}">
        <div class="list-group-item active bg-secondary fs-5 text-center">${escapeHtml(style?.style_name || 'Unknown Style')}</div>
        <div class="list-group-item text-center text-muted">${t('no_results')}</div>
      </div>
    `;
  }

  const detailsLabel = t('details', 'Details');

  let html = `
    <div class="list-group shadow-sm style-block" data-style-id="${style.style_id}">
      <div class="list-group-item active bg-secondary fs-5">
        <div class="d-flex align-items-center gap-2">
          <span class="btn btn-light btn-sm invisible flex-shrink-0" tabindex="-1" aria-hidden="true">${escapeHtml(detailsLabel)}</span>
          <span class="flex-grow-1 text-center">${escapeHtml(style.style_name)}</span>
          <button type="button" class="btn btn-light btn-sm flex-shrink-0 style-details-btn" data-style-id="${style.style_id}">
            ${escapeHtml(detailsLabel)}
          </button>
        </div>
      </div>
  `;

  style.clasification.forEach((dancer, index) => {
    const medals = ['🥇', '🥈', '🥉'];
    const bg = index === 0 ? 'bg-warning' : index === 1 ? 'bg-secondary-subtle' : index === 2 ? 'bg-warning-subtle' : '';
    const fw = index < 3 ? 'fw-bold' : '';
    const clubLabel = getDancerClubLabel(dancer);

    html += `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${bg} fs-6 ${fw} dancer-result" data-dancer-id="${dancer.dancer_id}">
        <span class="me-2">${index + 1}</span>
        ${getDancerFlagImgHtml(dancer.dancer_nationality, { className: 'me-2' })}
        <span class="me-auto d-flex align-items-baseline flex-wrap gap-1">
          <span>${escapeHtml(dancer.dancer_name)} ${index < 3 ? medals[index] : ''}</span>
          ${clubLabel ? `<small class="text-muted">${escapeHtml(clubLabel)}</small>` : ''}
        </span>
        <span class="badge bg-light text-dark rounded-pill">${formatScoreValue(dancer.total_score, { fixedDecimals: 1 })}</span>
        ${shouldShowAvgPlaceBadge() ? `
          <span class="badge bg-info text-dark rounded-pill ms-2">${formatAvgPlace(dancer.avg_place)}</span>
        ` : ''}
      </button>
    `;
  });

  html += '</div>';
  return html;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
