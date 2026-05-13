//var title = 'Results';
let categoryName;

let autoRefreshInterval = null;

const RESULTS_FILTER_MODE_BY_CATEGORY = 'BY_CAT';
const RESULTS_FILTER_MODE_BY_CATEGORY_STYLE = 'BY_CAT_STY';
const RESULTS_FILTER_MODE_BY_STYLE_CATEGORY = 'BY_STY_CAT';
const RESULTS_FILTER_MODES = new Set([
  RESULTS_FILTER_MODE_BY_CATEGORY,
  RESULTS_FILTER_MODE_BY_CATEGORY_STYLE,
  RESULTS_FILTER_MODE_BY_STYLE_CATEGORY
]);

const resultsFilterState = {
  mode: RESULTS_FILTER_MODE_BY_CATEGORY,
  competitions: [],
  selectedCategoryId: '',
  selectedCategoryName: '',
  selectedStyleId: '',
  selectedStyleName: ''
};

function shouldShowAvgPlaceBadge() {
  return getEvent().totalSystem === 'AVG_POSJUD';
}

function formatAvgPlace(avgPlace) {
  if (avgPlace == null || avgPlace === '') return '';
  const num = Number(avgPlace);
  return Number.isNaN(num) ? avgPlace : num;
}

function getClassificationDisplayPositions(clasification = []) {
  return getDisplayPositionsByScore(clasification, (dancer) => {
    const rawScore = dancer?.total_score;
    const numericScore = Number(rawScore);
    return Number.isNaN(numericScore) ? String(rawScore ?? '') : `num:${numericScore}`;
  });
}

function getDancerClubLabel(dancer) {
  if (getEvent()?.hideSchoolInfo) return '';
  const clubName = String(dancer?.club_name || '').trim();
  const clubLocation = String(dancer?.club_location || '').trim();
  if (!clubName) return '';
  return clubLocation ? `${clubName} [${clubLocation}]` : clubName;
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
  const maxScore = criteria?.max_score;

  if (percentage !== undefined && percentage !== null && percentage !== '') {
    const numericPercentage = Number(percentage);
    if (Number.isFinite(numericPercentage)) {
      return `${rawName} (${numericPercentage.toFixed(0)}%)`;
    }
  }

  if (maxScore !== undefined && maxScore !== null && maxScore !== '') {
    return `${rawName} (Max: ${formatScoreValue(maxScore)})`;
  }

  return rawName;
}

function getCriteriaMetaLabel(criteria) {
  const percentage = criteria?.percentage;
  const maxScore = criteria?.max_score;

  if (percentage !== undefined && percentage !== null && percentage !== '') {
    const numericPercentage = Number(percentage);
    if (Number.isFinite(numericPercentage)) {
      return `${numericPercentage.toFixed(0)}%`;
    }
  }

  if (maxScore !== undefined && maxScore !== null && maxScore !== '') {
    return `Max: ${formatScoreValue(maxScore)}`;
  }

  return '';
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

function getCriteriaHeaderMetaStyle() {
  return 'display: block; margin-top: 0.2rem; font-size: 0.68rem; line-height: 1.1; color: var(--bs-secondary-color); text-align: center;';
}

function renderCriteriaHeaderCell(criteria) {
  const label = String(criteria?.name || '').trim();
  const metaLabel = getCriteriaMetaLabel(criteria);
  const safeLabel = escapeHtml(label);
  const safeMetaLabel = escapeHtml(metaLabel);
  return `
    <th class="text-center align-middle" style="${getCriteriaColumnStyle()}">
      <span style="${getCriteriaHeaderTextStyle()}" title="${safeLabel}">${safeLabel}</span>
      ${metaLabel ? `<span style="${getCriteriaHeaderMetaStyle()}">${safeMetaLabel}</span>` : ''}
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
          percentage: criterion?.percentage,
          max_score: criterion?.max_score
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
          percentage: criterion?.percentage,
          max_score: criterion?.max_score
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
  const displayPositions = getClassificationDisplayPositions(dancers);

  if (!dancers.length || !criteria.length) {
    return `<div class="alert alert-info mb-0">${escapeHtml(t('no_style_voting_details', 'No voting details available for this style.'))}</div>`;
  }

  const headerCells = criteria
    .map((criterion) => renderCriteriaHeaderCell(criterion))
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
        <td class="text-center fw-semibold">${displayPositions[index]}</td>
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
  const displayPositions = getClassificationDisplayPositions(dancers);

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
      .map((criterion) => renderCriteriaHeaderCell(criterion))
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
        <td class="text-center fw-semibold">${displayPositions[index]}</td>
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

function getResultsFilterMode() {
  const rawMode = String(getEvent()?.resultsFilter || RESULTS_FILTER_MODE_BY_CATEGORY).trim().toUpperCase();
  return RESULTS_FILTER_MODES.has(rawMode) ? rawMode : RESULTS_FILTER_MODE_BY_CATEGORY;
}

function usesStyleResultsFilter() {
  return resultsFilterState.mode !== RESULTS_FILTER_MODE_BY_CATEGORY;
}

function getSelectedOptionLabel(select) {
  if (!select || select.selectedIndex < 0) return '';
  const currentOption = select.options[select.selectedIndex];
  if (!currentOption || currentOption.value === '') return '';
  return currentOption.textContent || '';
}

function buildUniqueFilterOptions(items, idField, nameField) {
  const uniqueItems = new Map();

  (items || []).forEach((item) => {
    const rawId = item?.[idField];
    if (rawId === undefined || rawId === null || rawId === '') return;

    const id = String(rawId);
    if (uniqueItems.has(id)) return;

    uniqueItems.set(id, {
      id,
      name: String(item?.[nameField] || '').trim() || `#${id}`
    });
  });

  return Array.from(uniqueItems.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getAvailableStylesByCategory(categoryId) {
  if (!categoryId) return [];

  return buildUniqueFilterOptions(
    resultsFilterState.competitions.filter((competition) => String(competition?.category_id) === String(categoryId)),
    'style_id',
    'style_name'
  );
}

function getAvailableCategoriesByStyle(styleId) {
  if (!styleId) return [];

  return buildUniqueFilterOptions(
    resultsFilterState.competitions.filter((competition) => String(competition?.style_id) === String(styleId)),
    'category_id',
    'category_name'
  );
}

function populateFilterSelect(select, items, placeholderKey, placeholderFallback, selectedValue = '') {
  if (!select) return;

  const normalizedSelectedValue = String(selectedValue || '');
  select.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.disabled = true;
  placeholderOption.selected = normalizedSelectedValue === '';
  placeholderOption.textContent = t(placeholderKey, placeholderFallback);
  select.appendChild(placeholderOption);

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });

  const hasSelectedValue = normalizedSelectedValue !== '' && items.some((item) => String(item.id) === normalizedSelectedValue);
  select.value = hasSelectedValue ? normalizedSelectedValue : '';
  select.disabled = items.length === 0;
}

function populateCategorySelect(categories, selectedValue = '') {
  const categorySelect = document.getElementById('categorySelect');
  populateFilterSelect(categorySelect, categories, 'select_category', 'Select Category', selectedValue);
}

function populateStyleSelect(styles, selectedValue = '') {
  const styleSelect = document.getElementById('styleSelect');
  populateFilterSelect(styleSelect, styles, 'select_style', 'Select Style', selectedValue);
}

function syncResultsFilterStateFromControls() {
  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');

  resultsFilterState.selectedCategoryId = categorySelect?.value ? String(categorySelect.value) : '';
  resultsFilterState.selectedCategoryName = getSelectedOptionLabel(categorySelect);
  resultsFilterState.selectedStyleId = styleSelect?.value ? String(styleSelect.value) : '';
  resultsFilterState.selectedStyleName = getSelectedOptionLabel(styleSelect);
  categoryName = resultsFilterState.selectedCategoryName;
}

function isResultsSelectionComplete() {
  if (!resultsFilterState.selectedCategoryId) return false;
  if (!usesStyleResultsFilter()) return true;
  return Boolean(resultsFilterState.selectedStyleId);
}

function getResultsBadgeText() {
  if (!usesStyleResultsFilter()) {
    return resultsFilterState.selectedCategoryName;
  }

  return [resultsFilterState.selectedCategoryName, resultsFilterState.selectedStyleName]
    .filter(Boolean)
    .join(' / ');
}

function clearRenderedResults() {
  const resultsContainer = document.getElementById('resultsContainer');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
  }
  window.resultsData = null;
}

function stopAutoRefresh(resetToggle = true) {
  clearInterval(autoRefreshInterval);
  autoRefreshInterval = null;

  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  if (autoRefreshToggle && resetToggle) {
    autoRefreshToggle.checked = false;
  }
}

function updateResultsSelectionUi() {
  const categoriaBadge = document.getElementById('categoriaBadge');
  const infoText = document.getElementById('infoText');
  const refreshBtn = document.getElementById('refreshBtn');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  const hasCompleteSelection = isResultsSelectionComplete();

  if (categoriaBadge) {
    if (hasCompleteSelection) {
      categoriaBadge.textContent = getResultsBadgeText();
      categoriaBadge.classList.remove('d-none');
    } else {
      categoriaBadge.textContent = '';
      categoriaBadge.classList.add('d-none');
    }
  }

  if (infoText) {
    infoText.classList.toggle('d-none', !hasCompleteSelection);
    infoText.classList.toggle('d-block', hasCompleteSelection);
  }

  if (!hasCompleteSelection && autoRefreshInterval) {
    stopAutoRefresh();
  }

  if (refreshBtn) {
    refreshBtn.disabled = !hasCompleteSelection;
  }

  if (autoRefreshToggle) {
    autoRefreshToggle.disabled = !hasCompleteSelection;
  }
}

function configureResultsFilterLayout() {
  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const inputGroup = categorySelect?.parentElement;

  if (!categorySelect || !styleSelect || !inputGroup) return;

  styleSelect.classList.toggle('d-none', !usesStyleResultsFilter());

  if (resultsFilterState.mode === RESULTS_FILTER_MODE_BY_STYLE_CATEGORY) {
    inputGroup.insertBefore(styleSelect, categorySelect);
  } else {
    inputGroup.insertBefore(categorySelect, styleSelect);
  }
}

function setResultsControlsLoadingState(isLoading) {
  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');

  if (categorySelect) {
    categorySelect.disabled = isLoading || categorySelect.options.length <= 1;
  }

  if (styleSelect) {
    const shouldDisableStyle = styleSelect.classList.contains('d-none') || styleSelect.options.length <= 1;
    styleSelect.disabled = isLoading || shouldDisableStyle;
  }

  if (refreshBtn) {
    refreshBtn.disabled = isLoading || !isResultsSelectionComplete();
  }

  if (autoRefreshToggle) {
    autoRefreshToggle.disabled = isLoading || !isResultsSelectionComplete();
  }
}

async function fetchResultsCategories() {
  const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
}

async function fetchResultsCompetitions() {
  const response = await fetch(`${API_BASE_URL}/api/competitions?event_id=${getEvent().id}`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
}

function restoreCategoryDrivenFilters(previousCategoryId, previousStyleId) {
  const categories = buildUniqueFilterOptions(resultsFilterState.competitions, 'category_id', 'category_name');
  populateCategorySelect(categories, previousCategoryId);
  syncResultsFilterStateFromControls();

  const availableStyles = getAvailableStylesByCategory(resultsFilterState.selectedCategoryId);
  populateStyleSelect(availableStyles, previousStyleId);
  syncResultsFilterStateFromControls();
}

function restoreStyleDrivenFilters(previousStyleId, previousCategoryId) {
  const styles = buildUniqueFilterOptions(resultsFilterState.competitions, 'style_id', 'style_name');
  populateStyleSelect(styles, previousStyleId);
  syncResultsFilterStateFromControls();

  const availableCategories = getAvailableCategoriesByStyle(resultsFilterState.selectedStyleId);
  populateCategorySelect(availableCategories, previousCategoryId);
  syncResultsFilterStateFromControls();
}

async function runResultsSearch() {
  syncResultsFilterStateFromControls();
  updateResultsSelectionUi();

  if (!isResultsSelectionComplete()) {
    clearRenderedResults();
    return;
  }

  await loadClasifications({
    categoryId: resultsFilterState.selectedCategoryId,
    styleId: resultsFilterState.selectedStyleId
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();

  const user = getUserFromToken();
  const role = user ? user.role : 'guest';
  const canJudgeSeeResults = role === 'judge' && getEvent().judgesVisResults === true;

  if (!getEvent().visibleResults && role !== 'admin' && role !== 'organizer' && !canJudgeSeeResults) {
    alert(t('page_not_visible'));
    window.location.href = `home.html?eventId=${eventId}`;
    return;
  }

  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  const autoRefreshLabel = document.getElementById('autoRefreshLabel');

  resultsFilterState.mode = getResultsFilterMode();

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

  categorySelect.addEventListener('change', async () => {
    syncResultsFilterStateFromControls();

    if (resultsFilterState.mode === RESULTS_FILTER_MODE_BY_CATEGORY_STYLE) {
      populateStyleSelect(getAvailableStylesByCategory(resultsFilterState.selectedCategoryId));
      syncResultsFilterStateFromControls();
      clearRenderedResults();
      updateResultsSelectionUi();
      return;
    }

    await runResultsSearch();
  });

  styleSelect.addEventListener('change', async () => {
    syncResultsFilterStateFromControls();

    if (resultsFilterState.mode === RESULTS_FILTER_MODE_BY_STYLE_CATEGORY) {
      populateCategorySelect(getAvailableCategoriesByStyle(resultsFilterState.selectedStyleId));
      syncResultsFilterStateFromControls();
      clearRenderedResults();
      updateResultsSelectionUi();
      return;
    }

    await runResultsSearch();
  });

  refreshBtn.addEventListener('click', async () => {
    await runResultsSearch();
  });

  autoRefreshToggle.addEventListener('change', () => {
    const shouldEnableAutoRefresh = autoRefreshToggle.checked;
    stopAutoRefresh(false);

    if (shouldEnableAutoRefresh) {
      autoRefreshToggle.checked = true;
      autoRefreshInterval = setInterval(() => {
        runResultsSearch();
      }, 60000 * (getEvent().autoRefreshMin || 2));
    }
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
    resultsFilterState.mode = getResultsFilterMode();
    configureResultsFilterLayout();
    setResultsControlsLoadingState(true);

    const previousCategoryId = resultsFilterState.selectedCategoryId;
    const previousStyleId = resultsFilterState.selectedStyleId;

    if (!usesStyleResultsFilter()) {
      resultsFilterState.competitions = [];
      const categories = await fetchResultsCategories();
      const normalizedCategories = (categories || []).map((category) => ({
        id: String(category.id),
        name: category.name
      }));

      populateCategorySelect(normalizedCategories, previousCategoryId);
      populateStyleSelect([]);
      syncResultsFilterStateFromControls();
    } else {
      resultsFilterState.competitions = await fetchResultsCompetitions();

      if (resultsFilterState.mode === RESULTS_FILTER_MODE_BY_CATEGORY_STYLE) {
        restoreCategoryDrivenFilters(previousCategoryId, previousStyleId);
      } else {
        restoreStyleDrivenFilters(previousStyleId, previousCategoryId);
      }
    }

    if (!isResultsSelectionComplete()) {
      clearRenderedResults();
    }

    updateResultsSelectionUi();
    setResultsControlsLoadingState(false);
  } catch (error) {
    console.error('Error fetching categories:', error);
    clearRenderedResults();
    updateResultsSelectionUi();
    setResultsControlsLoadingState(false);
  }
}

async function loadClasifications(filters) {
  const resultsContainer = document.getElementById('resultsContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const originalBtnText = refreshBtn.innerHTML;
  const normalizedFilters = typeof filters === 'object' && filters !== null
    ? filters
    : { categoryId: filters, styleId: '' };
  const params = new URLSearchParams({
    event_id: getEvent().id,
    category_id: normalizedFilters.categoryId
  });

  if (normalizedFilters.styleId) {
    params.set('style_id', normalizedFilters.styleId);
  }

  setResultsControlsLoadingState(true);
  refreshBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> ${t('loading')}`;

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/results?${params.toString()}`);
    if (!response.ok) throw new Error('Network error');

    const data = await response.json();
    window.resultsData = data;
    renderResults(data);
  } catch (err) {
    console.error('Error loading results:', err);
    resultsContainer.innerHTML = '<div class="alert alert-danger">Error loading results.</div>';
  } finally {
    setResultsControlsLoadingState(false);
    refreshBtn.innerHTML = originalBtnText;
  }
}

function renderResults(data) {
  const resultsContainer = document.getElementById('resultsContainer');
  const general = Array.isArray(data?.general) ? data.general : [];
  const styles = Array.isArray(data?.styles) ? data.styles : [];
  const hasGeneralClassification = getEvent().catClassification !== 'NO';
  const shouldRenderGeneralBlock = hasGeneralClassification && general.length > 0;
  const shouldCenterSingleStyle = styles.length === 1 && !shouldRenderGeneralBlock;

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

  if (shouldRenderGeneralBlock) {
    const colGeneral = document.createElement('div');
    colGeneral.className = 'col-12 col-lg-4';
    colGeneral.innerHTML = renderGeneralClassification(general);
    row.appendChild(colGeneral);

    colStylesClass += ' col-lg-8';
  }

  const colStyles = document.createElement('div');
  colStyles.className = colStylesClass;

  const stylesRow = document.createElement('div');
  stylesRow.className = `row g-4${shouldCenterSingleStyle ? ' justify-content-center' : ''}`;

  styles.forEach((style) => {
    const styleCol = document.createElement('div');
    styleCol.className = 'col-12 col-xl-6 col-xxl-4';
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

  const displayPositions = getClassificationDisplayPositions(style.clasification);

  style.clasification.forEach((dancer, index) => {
    const medals = ['🥇', '🥈', '🥉'];
    const displayPosition = displayPositions[index];
    const bg = displayPosition === 1 ? 'bg-warning' : displayPosition === 2 ? 'bg-secondary-subtle' : displayPosition === 3 ? 'bg-warning-subtle' : '';
    const fw = displayPosition <= 3 ? 'fw-bold' : '';
    const medal = displayPosition >= 1 && displayPosition <= 3 ? medals[displayPosition - 1] : '';
    const clubLabel = getDancerClubLabel(dancer);

    html += `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${bg} fs-6 ${fw} dancer-result" data-dancer-id="${dancer.dancer_id}">
        <span class="me-2">${displayPosition}</span>
        ${getDancerFlagImgHtml(dancer.dancer_nationality, { className: 'me-2' })}
        <span class="me-auto d-flex align-items-baseline flex-wrap gap-1">
          <span>${escapeHtml(dancer.dancer_name)} ${medal}</span>
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
