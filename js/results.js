//var title = 'Results';
let categoryName;

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
  categoryStyles: [],
  selectedCategoryId: '',
  selectedCategoryName: '',
  selectedStyleId: '',
  selectedStyleName: ''
};
const STYLE_DETAILS_PLACE_COLUMN_WIDTH_PX = 80;
const STYLE_DETAILS_TOTAL_COLUMN_WIDTH_PX = 120;
const STYLE_DETAILS_DANCER_MIN_WIDTH_PX = 0;
const STYLE_DETAILS_DANCER_MAX_WIDTH_PX = 420;
const STYLE_DETAILS_MODAL_MAX_WIDTH_PX = 1600;
const STYLE_DETAILS_MODAL_MIN_WIDTH_PX = 0;
const STYLE_DETAILS_MODAL_CHROME_WIDTH_PX = 96;
const STYLE_DETAILS_ROTATE_HINT_MAX_WIDTH_PX = 575;
const DEFAULT_CRITERIA_MAX_SCORE = 10;

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
  penaltyCard.className = 'results-detail-card results-penalty-card';
  penaltyCard.innerHTML = `
    <div class="results-detail-header">
      <h3>${escapeHtml(t('penalties', 'Penalties'))}${headerSuffix}</h3>
      <span class="results-penalty-count">${validPenalties.length}</span>
    </div>
    <div class="results-detail-body">
      <div class="results-penalty-grid">
        ${validPenalties.map((penalty) => `
          <div class="results-penalty-item">
            <div class="results-penalty-name">${escapeHtml(penalty.name || '-')}</div>
            <div class="results-penalty-score">${escapeHtml(t('total_score', 'Total Score'))}: ${escapeHtml(penalty.score ?? '-')}</div>
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

function formatVoteTotalScore(vote, { defaultFixedDecimals = null } = {}) {
  const fixedDecimals = getEvent()?.criteriaConfig === 'WITH_POR'
    ? 2
    : defaultFixedDecimals;
  return formatScoreValue(getVoteTotalScore(vote), { fixedDecimals });
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

function getPlaceColumnStyle() {
  return `width: ${STYLE_DETAILS_PLACE_COLUMN_WIDTH_PX}px; min-width: ${STYLE_DETAILS_PLACE_COLUMN_WIDTH_PX}px; max-width: ${STYLE_DETAILS_PLACE_COLUMN_WIDTH_PX}px;`;
}

function getPenaltyColumnStyle() {
  return 'width: 3.5rem; min-width: 3.5rem; max-width: 3.5rem;';
}

function getDancerColumnStyle() {
  return `width: auto; min-width: ${STYLE_DETAILS_DANCER_MIN_WIDTH_PX}px; max-width: ${STYLE_DETAILS_DANCER_MAX_WIDTH_PX}px;`;
}

function getTotalScoreColumnStyle() {
  return `width: ${STYLE_DETAILS_TOTAL_COLUMN_WIDTH_PX}px; min-width: ${STYLE_DETAILS_TOTAL_COLUMN_WIDTH_PX}px; max-width: ${STYLE_DETAILS_TOTAL_COLUMN_WIDTH_PX}px;`;
}

function getCriteriaHeaderTextStyle() {
  return 'display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; font-size: 0.72rem; line-height: 1.1;';
}

function getCriteriaHeaderMetaStyle() {
  return 'display: block; margin-top: 0.2rem; font-size: 0.68rem; line-height: 1.1; color: var(--lm-text-soft); text-align: center;';
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
    <div class="d-flex align-items-center gap-2 style-voting-dancer-cell">
      ${getDancerFlagImgHtml(dancer?.dancer_nationality, { width: 20, height: 20 })}
      <div class="d-flex flex-column style-voting-dancer-copy">
        <span class="fw-semibold">${escapeHtml(dancer?.dancer_name || '-')}</span>
        ${clubLabel ? `<small class="text-muted">${escapeHtml(clubLabel)}</small>` : ''}
      </div>
    </div>
  `;
}

function syncStyleVotingStickyColumns(container = document) {
  if (!container || typeof container.querySelectorAll !== 'function') return;

  container.querySelectorAll('.style-voting-details-table').forEach((table) => {
    table.style.setProperty('--style-voting-sticky-place-width', `${STYLE_DETAILS_PLACE_COLUMN_WIDTH_PX}px`);
    table.style.setProperty('--style-voting-sticky-dancer-width', `${STYLE_DETAILS_DANCER_MAX_WIDTH_PX}px`);

    const dancerCell = table.querySelector('tbody .style-voting-sticky-dancer')
      || table.querySelector('thead .style-voting-sticky-dancer');
    if (!dancerCell) return;

    const dancerWidth = Math.ceil(dancerCell.getBoundingClientRect().width);
    if (dancerWidth > 0) {
      const clampedDancerWidth = Math.max(
        STYLE_DETAILS_DANCER_MIN_WIDTH_PX,
        Math.min(dancerWidth, STYLE_DETAILS_DANCER_MAX_WIDTH_PX)
      );
      table.style.setProperty('--style-voting-sticky-dancer-width', `${clampedDancerWidth}px`);
    }
  });
}

function syncStyleVotingModalWidth(styleVotingModalEl) {
  if (!styleVotingModalEl) return;

  const modalDialog = styleVotingModalEl.querySelector('.modal-dialog');
  const table = styleVotingModalEl.querySelector('.style-voting-details-table');
  if (!modalDialog || !table) return;

  const viewportMaxWidth = Math.floor(window.innerWidth * 0.96);
  const maxAllowedWidth = Math.min(STYLE_DETAILS_MODAL_MAX_WIDTH_PX, viewportMaxWidth);
  const desiredWidth = Math.ceil(table.scrollWidth) + STYLE_DETAILS_MODAL_CHROME_WIDTH_PX;
  const clampedWidth = Math.min(
    maxAllowedWidth,
    Math.max(STYLE_DETAILS_MODAL_MIN_WIDTH_PX, desiredWidth)
  );

  modalDialog.style.setProperty('--bs-modal-width', `${clampedWidth}px`);
}

function shouldShowStyleVotingOrientationHint() {
  return window.innerWidth <= STYLE_DETAILS_ROTATE_HINT_MAX_WIDTH_PX
    && window.innerHeight > window.innerWidth;
}

function syncStyleVotingOrientationHint(styleVotingModalEl) {
  if (!styleVotingModalEl) return;

  const hintEl = styleVotingModalEl.querySelector('#styleVotingOrientationHint');
  if (!hintEl) return;

  hintEl.classList.toggle('d-none', !shouldShowStyleVotingOrientationHint());
}

function updateStyleVotingScrollHint(wrapper) {
  if (!wrapper) return;

  const hasHorizontalOverflow = wrapper.scrollWidth > wrapper.clientWidth + 1;
  const maxScrollLeft = Math.max(wrapper.scrollWidth - wrapper.clientWidth, 0);
  const isAtStart = wrapper.scrollLeft <= 1;
  const isAtEnd = wrapper.scrollLeft >= maxScrollLeft - 1;

  wrapper.classList.toggle('style-voting-details-table-wrap-scrollable', hasHorizontalOverflow);
  wrapper.classList.toggle('style-voting-details-table-wrap-can-scroll-left', hasHorizontalOverflow && !isAtStart);
  wrapper.classList.toggle('style-voting-details-table-wrap-can-scroll-right', hasHorizontalOverflow && !isAtEnd);
}

function syncStyleVotingScrollHints(container = document) {
  if (!container || typeof container.querySelectorAll !== 'function') return;

  container.querySelectorAll('.style-voting-details-table-wrap').forEach((wrapper) => {
    if (!wrapper.dataset.scrollHintBound) {
      wrapper.addEventListener('scroll', () => {
        updateStyleVotingScrollHint(wrapper);
      }, { passive: true });
      wrapper.dataset.scrollHintBound = 'true';
    }

    updateStyleVotingScrollHint(wrapper);
  });
}

function getCriteriaPositionNumber(criteria) {
  const rawPosition = criteria?.criteria_position;
  if (rawPosition === undefined || rawPosition === null || rawPosition === '') return null;

  const numericPosition = Number(rawPosition);
  return Number.isFinite(numericPosition) ? numericPosition : null;
}

function sumCriteriaMaxScore(currentMaxScore, nextMaxScore, { fallbackWhenMissing = false } = {}) {
  if (nextMaxScore === undefined || nextMaxScore === null || nextMaxScore === '') {
    nextMaxScore = fallbackWhenMissing ? DEFAULT_CRITERIA_MAX_SCORE : null;
  }

  if (nextMaxScore === null) {
    return currentMaxScore ?? null;
  }

  const numericNextMaxScore = Number(nextMaxScore);
  if (!Number.isFinite(numericNextMaxScore)) {
    return currentMaxScore ?? nextMaxScore;
  }

  const numericCurrentMaxScore = Number(currentMaxScore);
  return Number.isFinite(numericCurrentMaxScore)
    ? numericCurrentMaxScore + numericNextMaxScore
    : numericNextMaxScore;
}

function getAccumulatedCriteriaMaxScore(criteriaList, { fallbackWhenMissing = false } = {}) {
  return (criteriaList || []).reduce(
    (currentMaxScore, criterion) => sumCriteriaMaxScore(currentMaxScore, criterion?.max_score, { fallbackWhenMissing }),
    null
  );
}

function updateStyleVotingDetailsMaxScore(styleVotingModalEl, styleObj) {
  if (!styleVotingModalEl) return;

  const maxScoreEl = styleVotingModalEl.querySelector('#styleVotingDetailsModalMaxScore');
  if (!maxScoreEl) return;

  if (!getEvent()?.criteriaPerJudge) {
    maxScoreEl.textContent = '';
    maxScoreEl.classList.add('d-none');
    return;
  }

  const accumulatedMaxScore = getAccumulatedCriteriaMaxScore(collectStyleCriteriaSummary(styleObj));
  if (accumulatedMaxScore === null || accumulatedMaxScore === undefined || accumulatedMaxScore === '') {
    maxScoreEl.textContent = '';
    maxScoreEl.classList.add('d-none');
    return;
  }

  maxScoreEl.textContent = `Max: ${formatScoreValue(accumulatedMaxScore)}`;
  maxScoreEl.classList.remove('d-none');
}

function compareCriteriaByPosition(a, b) {
  const positionA = getCriteriaPositionNumber(a);
  const positionB = getCriteriaPositionNumber(b);

  if (positionA !== null || positionB !== null) {
    if (positionA === null) return 1;
    if (positionB === null) return -1;
    if (positionA !== positionB) return positionA - positionB;
  }

  return (a?._orderIndex ?? 0) - (b?._orderIndex ?? 0);
}

function collectStyleCriteriaSummary(styleObj) {
  const criteriaMap = new Map();
  let orderIndex = 0;

  (styleObj?.clasification || []).forEach((dancer) => {
    (dancer?.votes || []).forEach((vote, voteIndex) => {
      const voteJudgeKey = normalizeLookupKey(vote?.judge_id ?? vote?.judge_name ?? `judge_${voteIndex}`);
      (vote?.criteria || []).forEach((criterion) => {
        const key = normalizeLookupKey(criterion?.name);
        if (!key) return;

        let summary = criteriaMap.get(key);
        if (!summary) {
          summary = {
            key,
            name: String(criterion?.name || '').trim(),
            percentage: criterion?.percentage,
            max_score: null,
            criteria_position: criterion?.criteria_position,
            _orderIndex: orderIndex++,
            _maxScoreSources: new Set()
          };
          criteriaMap.set(key, summary);
        }

        if (!summary.name) {
          summary.name = String(criterion?.name || '').trim();
        }

        if ((summary.percentage === undefined || summary.percentage === null || summary.percentage === '')
          && criterion?.percentage !== undefined && criterion?.percentage !== null && criterion?.percentage !== '') {
          summary.percentage = criterion.percentage;
        }

        const currentPosition = getCriteriaPositionNumber(summary);
        const nextPosition = getCriteriaPositionNumber(criterion);
        if (currentPosition === null && nextPosition !== null) {
          summary.criteria_position = criterion.criteria_position;
        } else if (currentPosition !== null && nextPosition !== null && nextPosition < currentPosition) {
          summary.criteria_position = criterion.criteria_position;
        }

        const maxScoreSourceKey = `${voteJudgeKey}::${key}`;
        if (!summary._maxScoreSources.has(maxScoreSourceKey)) {
          summary._maxScoreSources.add(maxScoreSourceKey);
          summary.max_score = sumCriteriaMaxScore(summary.max_score, criterion?.max_score, {
            fallbackWhenMissing: true
          });
        }
      });
    });
  });

  return Array.from(criteriaMap.values())
    .sort(compareCriteriaByPosition)
    .map(({ _maxScoreSources, ...criterion }) => criterion);
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
  const totalScoreFixedDecimals = getEvent()?.criteriaConfig === 'WITH_POR' ? 2 : null;

  if (!dancers.length || !criteria.length) {
    return `<div class="results-empty results-empty-page">${escapeHtml(t('no_style_voting_details', 'No voting details available for this style.'))}</div>`;
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

        const currentTotals = criteriaTotals.get(criterionKey) || { score: 0, max_score: null };
        currentTotals.score += Number(criterion?.score) || 0;
        currentTotals.max_score = sumCriteriaMaxScore(currentTotals.max_score, criterion?.max_score);
        criteriaTotals.set(criterionKey, currentTotals);
      });
    });

    const criteriaCells = criteria.map((criterion) => {
      const currentTotals = criteriaTotals.get(criterion.key);
      return `<td class="text-center align-middle" style="${getCriteriaColumnStyle()}">${currentTotals ? formatScoreValue(currentTotals.score) : '-'}</td>`;
    }).join('');
    const penaltiesCell = showPenalties
      ? `<td class="text-center fw-semibold" style="${getPenaltyColumnStyle()}">${formatScoreValue(getPenaltyTotal(dancer?.penalties))}</td>`
      : '';

    return `
      <tr>
        <td class="text-center fw-semibold style-voting-sticky-col style-voting-sticky-place" style="${getPlaceColumnStyle()}">${displayPositions[index]}</td>
        <td class="style-voting-sticky-col style-voting-sticky-dancer" style="${getDancerColumnStyle()}">${renderStyleTableDancerCell(dancer)}</td>
        <td class="text-center fw-semibold" style="${getTotalScoreColumnStyle()}">${formatScoreValue(dancer?.total_score, { fixedDecimals: totalScoreFixedDecimals })}</td>
        ${penaltiesCell}
        ${criteriaCells}
      </tr>
    `;
  }).join('');

  return `
    <div class="table-responsive style-voting-details-table-wrap">
      <table class="table table-bordered table-sm align-middle mb-0 style-voting-details-table">
        <colgroup>
          <col style="${getPlaceColumnStyle()}">
          <col style="${getDancerColumnStyle()}">
          <col style="${getTotalScoreColumnStyle()}">
          ${showPenalties ? `<col style="${getPenaltyColumnStyle()}">` : ''}
          ${criteria.map(() => `<col style="${getCriteriaColumnStyle()}">`).join('')}
        </colgroup>
        <thead class="table-light">
          <tr>
            <th class="text-center style-voting-sticky-col style-voting-sticky-place" style="${getPlaceColumnStyle()}">${escapeHtml(t('place', 'Place'))}</th>
            <th class="style-voting-sticky-col style-voting-sticky-dancer" style="${getDancerColumnStyle()}">${escapeHtml(t('dancer', 'Dancer'))}</th>
            <th class="text-center style-voting-total-header" style="${getTotalScoreColumnStyle()}">${escapeHtml(t('total_score', 'Total Score'))}</th>
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
  const totalScoreFixedDecimals = getEvent()?.criteriaConfig === 'WITH_POR' ? 2 : null;

  if (!dancers.length || !judgeGroups.length) {
    return `<div class="results-empty results-empty-page">${escapeHtml(t('no_style_voting_details', 'No voting details available for this style.'))}</div>`;
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
        return `<td class="text-center">${formatVoteTotalScore(vote)}</td>`;
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
        <td class="text-center fw-semibold style-voting-sticky-col style-voting-sticky-place" style="${getPlaceColumnStyle()}">${displayPositions[index]}</td>
        <td class="style-voting-sticky-col style-voting-sticky-dancer" style="${getDancerColumnStyle()}">${renderStyleTableDancerCell(dancer)}</td>
        <td class="text-center fw-semibold" style="${getTotalScoreColumnStyle()}">${formatScoreValue(dancer?.total_score, { fixedDecimals: totalScoreFixedDecimals })}</td>
        ${penaltiesCell}
        ${judgeCells}
      </tr>
    `;
  }).join('');

  return `
    <div class="table-responsive style-voting-details-table-wrap">
      <table class="table table-bordered table-sm align-middle mb-0 style-voting-details-table">
        <colgroup>
          <col style="${getPlaceColumnStyle()}">
          <col style="${getDancerColumnStyle()}">
          <col style="${getTotalScoreColumnStyle()}">
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
            <th class="text-center style-voting-sticky-col style-voting-sticky-place" rowspan="2" style="${getPlaceColumnStyle()}">${escapeHtml(t('place', 'Place'))}</th>
            <th class="style-voting-sticky-col style-voting-sticky-dancer" rowspan="2" style="${getDancerColumnStyle()}">${escapeHtml(t('dancer', 'Dancer'))}</th>
            <th class="text-center style-voting-total-header" rowspan="2" style="${getTotalScoreColumnStyle()}">${escapeHtml(t('total_score', 'Total Score'))}</th>
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
    <div class="results-modal-summary">
      <div>
        <div class="results-modal-context">${escapeHtml(categoryName || '-')}</div>
        <div class="results-modal-style">${escapeHtml(styleObj?.style_name || '-')}</div>
      </div>
    </div>
    ${renderStyleVotingDetailsTable(styleObj)}
  `;

  const titleEl = styleVotingModalEl.querySelector('#styleVotingDetailsModalLabel');
  if (titleEl) {
    titleEl.textContent = t('style_voting_details', 'Style Voting Details');
  }
  updateStyleVotingDetailsMaxScore(styleVotingModalEl, styleObj);

  styleVotingModal.show();
}

function showDancerVotingDetailsModal(styleObj, dancerData, votingModalEl, votingModal, detailsContainer) {
  if (!styleObj || !dancerData || !votingModalEl || !votingModal || !detailsContainer) return;

  const clubLabel = getDancerClubLabel(dancerData);
  const totalScoreFixedDecimals = getEvent()?.criteriaConfig === 'WITH_POR' ? 2 : 1;
  detailsContainer.innerHTML = '';

  const summaryCard = document.createElement('div');
  summaryCard.className = 'results-modal-summary';
  summaryCard.innerHTML = `
    <div>
      <div class="results-modal-context">${escapeHtml(categoryName || '-')}</div>
      <div class="results-modal-style">${escapeHtml(styleObj.style_name || '-')}</div>
      <div class="results-modal-person">
        ${getDancerFlagImgHtml(dancerData.dancer_nationality, { width: 24, height: 24 })}
        <div class="results-modal-person-copy">
          <strong>${escapeHtml(dancerData.dancer_name || '-')}</strong>
          ${clubLabel ? `<small class="text-muted">${escapeHtml(clubLabel)}</small>` : ''}
        </div>
      </div>
    </div>
    <div class="results-modal-score-group">
      <span class="results-modal-score">
        ${formatScoreValue(dancerData.total_score, { fixedDecimals: totalScoreFixedDecimals })}
      </span>
      ${shouldShowAvgPlaceBadge() ? `
        <span class="results-modal-score results-modal-score--average">
          ${formatAvgPlace(dancerData.avg_place)}
        </span>
      ` : ''}
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
      judgeCard.className = 'results-detail-card';
      judgeCard.innerHTML = `
        <div class="results-detail-header">
          <h3>${escapeHtml(vote.judge_name || t('judge', 'Judge'))}</h3>
          <span class="results-detail-total">${escapeHtml(t('total', 'Total'))}: ${formatVoteTotalScore(vote, { defaultFixedDecimals: 1 })}</span>
        </div>
        <div class="results-detail-body">
          <div class="results-criteria-grid">
            ${(vote.criteria || []).map((criterion) => `
              <div class="results-criterion">
                <label>${escapeHtml(getCriteriaDisplayLabel(criterion))}</label>
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

  const titleEl = votingModalEl.querySelector('#votingDetailsModalLabel');
  if (titleEl) {
    titleEl.textContent = t('voting_details');
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

function getCategoryStyleOptions(idField, nameField, filter = () => true) {
  const seenIds = new Set();

  return resultsFilterState.categoryStyles.filter(filter).reduce((options, item) => {
    const rawId = item?.[idField];
    if (rawId === undefined || rawId === null || rawId === '') return options;

    const id = String(rawId);
    if (seenIds.has(id)) return options;

    seenIds.add(id);
    options.push({
      id,
      name: String(item?.[nameField] || '').trim() || `#${id}`
    });
    return options;
  }, []);
}

function getAvailableStylesByCategory(categoryId) {
  if (!categoryId) return [];

  return getCategoryStyleOptions(
    'style_id',
    'style_name',
    (item) => String(item?.category_id) === String(categoryId)
  );
}

function getAvailableCategoriesByStyle(styleId) {
  if (!styleId) return [];

  return getCategoryStyleOptions(
    'category_id',
    'category_name',
    (item) => String(item?.style_id) === String(styleId)
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

function updateResultsSelectionUi() {
  const categoriaBadge = document.getElementById('categoriaBadge');
  const categoriaBadgeText = categoriaBadge?.querySelector('span');
  const infoText = document.getElementById('infoText');
  const refreshBtn = document.getElementById('refreshBtn');
  const hasCompleteSelection = isResultsSelectionComplete();

  if (categoriaBadge) {
    if (hasCompleteSelection) {
      if (categoriaBadgeText) categoriaBadgeText.textContent = getResultsBadgeText();
      categoriaBadge.classList.remove('d-none');
    } else {
      if (categoriaBadgeText) categoriaBadgeText.textContent = '';
      categoriaBadge.classList.add('d-none');
    }
  }

  if (infoText) {
    infoText.classList.toggle('d-none', !hasCompleteSelection);
    infoText.classList.toggle('d-block', hasCompleteSelection);
  }

  if (refreshBtn) {
    refreshBtn.disabled = !hasCompleteSelection;
  }
}

function configureResultsFilterLayout() {
  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const categoryFilter = document.getElementById('categoryFilter');
  const styleFilter = document.getElementById('styleFilter');
  const filterControls = categoryFilter?.parentElement;

  if (!categorySelect || !styleSelect || !categoryFilter || !styleFilter || !filterControls) return;

  styleFilter.classList.toggle('d-none', !usesStyleResultsFilter());
  filterControls.classList.toggle('results-filter-controls--single', !usesStyleResultsFilter());

  if (resultsFilterState.mode === RESULTS_FILTER_MODE_BY_STYLE_CATEGORY) {
    filterControls.insertBefore(styleFilter, categoryFilter);
  } else {
    filterControls.insertBefore(categoryFilter, styleFilter);
  }
}

function setResultsControlsLoadingState(isLoading) {
  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const refreshBtn = document.getElementById('refreshBtn');

  if (categorySelect) {
    categorySelect.disabled = isLoading || categorySelect.options.length <= 1;
  }

  if (styleSelect) {
    const styleFilter = document.getElementById('styleFilter');
    const shouldDisableStyle = styleFilter?.classList.contains('d-none') || styleSelect.options.length <= 1;
    styleSelect.disabled = isLoading || shouldDisableStyle;
  }

  if (refreshBtn) {
    refreshBtn.disabled = isLoading || !isResultsSelectionComplete();
  }
}

async function fetchResultsCategories() {
  const response = await fetch(`${API_BASE_URL}/api/public/categories?event_id=${getEvent().id}`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
}

async function fetchResultsCategoryStyles() {
  const response = await fetch(`${API_BASE_URL}/api/public/categories-styles?event_id=${getEvent().id}`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
}

function restoreCategoryDrivenFilters(previousCategoryId, previousStyleId) {
  const categories = getCategoryStyleOptions('category_id', 'category_name');
  populateCategorySelect(categories, previousCategoryId);
  syncResultsFilterStateFromControls();

  const availableStyles = getAvailableStylesByCategory(resultsFilterState.selectedCategoryId);
  populateStyleSelect(availableStyles, previousStyleId);
  syncResultsFilterStateFromControls();
}

function restoreStyleDrivenFilters(previousStyleId, previousCategoryId) {
  const styles = getCategoryStyleOptions('style_id', 'style_name');
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

  if (getEvent().notice_active && getEvent().notice_text.trim() !== '') {
    const noticePanel = document.getElementById('noticePanel');
    const noticeInnerPanel = document.getElementById('notice_type');
    noticeInnerPanel.classList.add(`alert-${getEvent().notice_type === 'IMP' ? 'danger' : 'success'}`);
    const noticeTextDiv = document.getElementById('notice_text');
    noticeTextDiv.innerText = getEvent().notice_text;
    noticePanel.style.display = 'block';
  }

  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const refreshBtn = document.getElementById('refreshBtn');

  resultsFilterState.mode = getResultsFilterMode();

  refreshBtn.disabled = true;

  const votingModalEl = document.getElementById('votingDetailsModal');
  let votingModal = null;
  const detailsContainer = document.getElementById('votingDetailsContainer');
  if (votingModalEl) votingModal = new bootstrap.Modal(votingModalEl);

  const styleVotingModalEl = document.getElementById('styleVotingDetailsModal');
  let styleVotingModal = null;
  const styleDetailsContainer = document.getElementById('styleVotingDetailsContainer');
  if (styleVotingModalEl) {
    styleVotingModal = new bootstrap.Modal(styleVotingModalEl);
    styleVotingModalEl.addEventListener('show.bs.modal', () => {
      requestAnimationFrame(() => {
        syncStyleVotingOrientationHint(styleVotingModalEl);
        syncStyleVotingStickyColumns(styleVotingModalEl);
        syncStyleVotingModalWidth(styleVotingModalEl);
        syncStyleVotingScrollHints(styleVotingModalEl);
      });
    });
    styleVotingModalEl.addEventListener('shown.bs.modal', () => {
      syncStyleVotingOrientationHint(styleVotingModalEl);
      syncStyleVotingStickyColumns(styleVotingModalEl);
      syncStyleVotingModalWidth(styleVotingModalEl);
      syncStyleVotingScrollHints(styleVotingModalEl);
    });
  }

  window.addEventListener('resize', () => {
    if (styleVotingModalEl?.classList.contains('show')) {
      syncStyleVotingOrientationHint(styleVotingModalEl);
      syncStyleVotingStickyColumns(styleVotingModalEl);
      syncStyleVotingModalWidth(styleVotingModalEl);
      syncStyleVotingScrollHints(styleVotingModalEl);
    }
  });

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
      resultsFilterState.categoryStyles = [];
      const categories = await fetchResultsCategories();
      const normalizedCategories = (categories || []).map((category) => ({
        id: String(category.id),
        name: category.name
      }));

      populateCategorySelect(normalizedCategories, previousCategoryId);
      populateStyleSelect([]);
      syncResultsFilterStateFromControls();
    } else {
      resultsFilterState.categoryStyles = await fetchResultsCategoryStyles();

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
    resultsContainer.innerHTML = '<div class="results-empty results-empty-page results-error">Error loading results.</div>';
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
  const blockCount = styles.length + (shouldRenderGeneralBlock ? 1 : 0);

  resultsContainer.innerHTML = '';

  if (blockCount === 0) {
    resultsContainer.innerHTML = `
      <div class="results-empty results-empty-page">
        ${t('no_results')}
      </div>
    `;
    return;
  }

  const grid = document.createElement('div');
  grid.className = `results-grid${blockCount === 1 ? ' results-grid--single' : ''}`;

  if (shouldRenderGeneralBlock) {
    grid.insertAdjacentHTML('beforeend', renderGeneralClassification(general));
  }

  styles.forEach((style) => {
    grid.insertAdjacentHTML('beforeend', renderStyleClassification(style));
  });

  resultsContainer.appendChild(grid);
}

function renderGeneralClassification(general) {
  if (!general || general.length === 0) {
    return `
      <section class="results-card results-general-card">
        <header class="results-card-header">
          <h2 class="results-card-heading"><i class="bi bi-trophy-fill" aria-hidden="true"></i><span>${t('general_classification')}</span></h2>
        </header>
        <p class="results-empty">${t('no_results')}</p>
      </section>
    `;
  }

  let html = `
    <section class="results-card results-general-card">
      <header class="results-card-header">
        <h2 class="results-card-heading"><i class="bi bi-trophy-fill" aria-hidden="true"></i><span>${t('general_classification')}</span></h2>
      </header>
      <ol class="results-ranking-list">
  `;

  general.forEach((dancer, index) => {
    const displayPosition = index < 3 ? index + 1 : dancer.position;
    const podiumClass = getResultsPodiumClass(index + 1);
    const clubLabel = getDancerClubLabel(dancer);
    html += `
      <li class="results-rank-row${podiumClass}">
        <span class="results-place">${escapeHtml(displayPosition)}</span>
        <span class="results-person">
          ${getDancerFlagImgHtml(dancer.dancer_nationality)}
          <span class="results-person-copy">
            <span class="results-person-name">${escapeHtml(dancer.dancer_name)}</span>
            ${clubLabel ? `<span class="results-person-club">${escapeHtml(clubLabel)}</span>` : ''}
            <span class="results-general-medals">
              <span>🥇 ${dancer.num_oros || 0}</span>
              <span>🥈 ${dancer.num_platas || 0}</span>
              <span>🥉 ${dancer.num_bronces || 0}</span>
            </span>
          </span>
        </span>
        <span class="results-score results-general-score">${formatScoreValue(dancer.total_score, { fixedDecimals: index < 3 ? 1 : null })}</span>
      </li>
    `;
  });

  html += '</ol></section>';
  return html;
}

function renderStyleClassification(style) {
  if (!style || !style.clasification || style.clasification.length === 0) {
    return `
      <section class="results-card style-block" data-style-id="${style?.style_id || ''}">
        <header class="results-card-header">
          <h2 class="results-card-heading"><i class="bi bi-lightning-charge-fill" aria-hidden="true"></i><span>${escapeHtml(style?.style_name || 'Unknown Style')}</span></h2>
        </header>
        <p class="results-empty">${t('no_results')}</p>
      </section>
    `;
  }

  const detailsLabel = t('details', 'Details');

  let html = `
    <section class="results-card style-block" data-style-id="${style.style_id}">
      <header class="results-card-header">
        <h2 class="results-card-heading"><i class="bi bi-lightning-charge-fill" aria-hidden="true"></i><span>${escapeHtml(style.style_name)}</span></h2>
        <button type="button" class="results-details-btn style-details-btn" data-style-id="${style.style_id}">
          ${escapeHtml(detailsLabel)} <i class="bi bi-table" aria-hidden="true"></i>
        </button>
      </header>
      <ol class="results-ranking-list">
  `;

  const displayPositions = getClassificationDisplayPositions(style.clasification);
  const totalScoreFixedDecimals = getEvent()?.criteriaConfig === 'WITH_POR' ? 2 : 1;

  style.clasification.forEach((dancer, index) => {
    const displayPosition = displayPositions[index];
    const podiumClass = getResultsPodiumClass(displayPosition);
    const medal = getResultsMedal(displayPosition);
    const clubLabel = getDancerClubLabel(dancer);

    html += `
      <li>
        <button type="button" class="results-rank-row${podiumClass} dancer-result" data-dancer-id="${dancer.dancer_id}">
          <span class="results-place">${escapeHtml(displayPosition)}</span>
          <span class="results-person">
            ${getDancerFlagImgHtml(dancer.dancer_nationality)}
            <span class="results-person-copy">
              <span class="results-person-name">${escapeHtml(dancer.dancer_name)}${medal ? ` <span aria-hidden="true">${medal}</span>` : ''}</span>
              ${clubLabel ? `<span class="results-person-club">${escapeHtml(clubLabel)}</span>` : ''}
            </span>
          </span>
          <span class="results-row-values">
            <span class="results-score">${formatScoreValue(dancer.total_score, { fixedDecimals: totalScoreFixedDecimals })}</span>
            ${shouldShowAvgPlaceBadge() ? `<span class="results-average">${formatAvgPlace(dancer.avg_place)}</span>` : ''}
            <i class="bi bi-chevron-right results-row-chevron" aria-hidden="true"></i>
          </span>
        </button>
      </li>
    `;
  });

  html += '</ol></section>';
  return html;
}

function getResultsPodiumClass(position) {
  switch (Number(position)) {
    case 1: return ' results-rank-row--podium results-rank-row--first';
    case 2: return ' results-rank-row--podium results-rank-row--second';
    case 3: return ' results-rank-row--podium results-rank-row--third';
    default: return '';
  }
}

function getResultsMedal(position) {
  return ['🥇', '🥈', '🥉'][Number(position) - 1] || '';
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
