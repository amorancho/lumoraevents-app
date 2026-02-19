var title = 'Competition Tracking';

const allowedRoles = ["admin", "organizer"];
const voteDetailsInFlight = new Set();
const competitionDetailsInFlight = new Set();
const classificationExportState = {
  options: [],
  mode: 'ALL',
  categoryIds: []
};

const categorySelect = document.getElementById('categorySelect');

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeClassificationExportOptions(payload) {
  const categories = Array.isArray(payload?.categories) ? payload.categories : [];
  const seenCategoryIds = new Set();

  return categories.reduce((acc, entry) => {
    const rawCategoryId = entry?.category?.id ?? entry?.general?.category_id;
    const categoryId = Number(rawCategoryId);

    if (!Number.isFinite(categoryId) || seenCategoryIds.has(categoryId)) {
      return acc;
    }

    seenCategoryIds.add(categoryId);

    const categoryName = entry?.category?.name
      || entry?.general?.category_name
      || `${t('category')} ${categoryId}`;

    acc.push({
      id: categoryId,
      name: categoryName,
      stylesCount: Array.isArray(entry?.styles) ? entry.styles.length : 0
    });

    return acc;
  }, []);
}

function renderClassificationExportOptions(categories) {
  const modalBody = document.getElementById('classificationExportOptionsBody');
  if (!modalBody) return;

  const categoriesCount = categories.length;
  const categoryRows = categories.map((category, index) => {
    const inputId = `export-category-option-${category.id}-${index}`;
    return `
      <div class="form-check mb-2">
        <input class="form-check-input js-export-category-option" type="checkbox" value="${category.id}" id="${inputId}">
        <label class="form-check-label" for="${inputId}">
          ${escapeHtml(category.name)}
          <span class="text-muted ms-1">(${category.stylesCount} ${escapeHtml(t('style'))})</span>
        </label>
      </div>
    `;
  }).join('');

  modalBody.innerHTML = `
    <div class="mb-3">
      <div class="form-check">
        <input class="form-check-input js-export-scope-option" type="radio" name="classificationExportScope" id="exportScopeAll" value="ALL" checked>
        <label class="form-check-label" for="exportScopeAll">${escapeHtml(t('export_modal_scope_all', 'All'))}</label>
      </div>
      <div class="form-check">
        <input class="form-check-input js-export-scope-option" type="radio" name="classificationExportScope" id="exportScopeCategories" value="CATEGORIES">
        <label class="form-check-label" for="exportScopeCategories">${escapeHtml(t('export_modal_scope_categories', 'Select categories'))}</label>
      </div>
    </div>
    <div id="exportCategoriesWrapper" class="d-none">
      <p class="fw-semibold mb-2">
        ${escapeHtml(t('export_modal_available_categories', 'Available categories'))}
        (${categoriesCount})
      </p>
      <div class="border rounded p-3 export-categories-list">
        ${categoryRows}
      </div>
    </div>
    <div id="exportSelectionValidation" class="alert alert-warning py-2 mt-3 mb-0 d-none"></div>
    <small class="text-muted d-block mt-3" id="exportSelectionHint"></small>
  `;

  const scopeInputs = Array.from(modalBody.querySelectorAll('.js-export-scope-option'));
  const categoryInputs = Array.from(modalBody.querySelectorAll('.js-export-category-option'));
  const categoriesWrapper = modalBody.querySelector('#exportCategoriesWrapper');
  const selectionHint = modalBody.querySelector('#exportSelectionHint');
  const validationEl = modalBody.querySelector('#exportSelectionValidation');
  const confirmBtn = document.getElementById('classificationExportConfirmBtn');

  const clearValidation = () => {
    if (!validationEl) return;
    validationEl.textContent = '';
    validationEl.classList.add('d-none');
  };

  const syncSelectionState = () => {
    const selectedScope = scopeInputs.find(input => input.checked)?.value || 'ALL';
    const isByCategory = selectedScope === 'CATEGORIES';

    classificationExportState.mode = selectedScope;
    if (categoriesWrapper) {
      categoriesWrapper.classList.toggle('d-none', !isByCategory);
    }

    categoryInputs.forEach(input => {
      input.disabled = !isByCategory;
      if (!isByCategory) {
        input.checked = false;
      }
    });

    classificationExportState.categoryIds = isByCategory
      ? categoryInputs
        .filter(input => input.checked)
        .map(input => Number(input.value))
        .filter(value => Number.isFinite(value))
      : [];

    if (confirmBtn) {
      confirmBtn.disabled = isByCategory && classificationExportState.categoryIds.length === 0;
    }

    if (selectionHint) {
      selectionHint.textContent = isByCategory
        ? `${classificationExportState.categoryIds.length}/${categoriesCount} ${t('export_modal_categories_selected', 'categories selected')}`
        : t('export_modal_all_selected', 'Selected: all categories');
    }

    clearValidation();
  };

  scopeInputs.forEach(input => input.addEventListener('change', syncSelectionState));
  categoryInputs.forEach(input => input.addEventListener('change', syncSelectionState));
  syncSelectionState();
}

function setButtonLoading(button, isLoading, loadingText = t('loading')) {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${escapeHtml(loadingText)}</span>
    `;
    button.disabled = true;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
  button.disabled = false;
}

function getFilenameFromContentDisposition(dispositionHeader) {
  if (!dispositionHeader || typeof dispositionHeader !== 'string') return null;

  const utf8Match = dispositionHeader.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // ignore malformed uri encoding
    }
  }

  const asciiMatch = dispositionHeader.match(/filename=\"?([^\";]+)\"?/i);
  return asciiMatch?.[1]?.trim() || null;
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'results-export.pdf';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initClassificationExportOptions() {
  const exportBtn = document.getElementById('exportBtn');
  const modalEl = document.getElementById('classificationExportOptionsModal');
  const modalBody = document.getElementById('classificationExportOptionsBody');
  const confirmBtn = document.getElementById('classificationExportConfirmBtn');

  if (!exportBtn || !modalEl || !modalBody || !confirmBtn) return;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  confirmBtn.disabled = true;

  exportBtn.addEventListener('click', async () => {
    if (exportBtn.disabled) return;

    const originalContent = exportBtn.innerHTML;
    exportBtn.disabled = true;
    exportBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      ${t('loading')}
    `;

    modalBody.innerHTML = `
      <div class="d-flex align-items-center justify-content-center py-4">
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>${t('loading')}</span>
      </div>
    `;
    confirmBtn.disabled = true;

    modal.show();

    try {
      const eventId = getEvent()?.id;
      if (!eventId) {
        throw new Error(t('error_title'));
      }

      const response = await fetch(`${API_BASE_URL}/api/competitions/classification-export-options?event_id=${eventId}`);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || t('error_title'));
      }

      const categories = normalizeClassificationExportOptions(payload);

      classificationExportState.options = categories;
      classificationExportState.mode = 'ALL';
      classificationExportState.categoryIds = [];

      if (!categories.length) {
        modalBody.innerHTML = `
          <div class="alert alert-info mb-0">
            ${escapeHtml(t('export_modal_no_options', 'No classification results are available to export.'))}
          </div>
        `;
        confirmBtn.disabled = true;
        return;
      }

      renderClassificationExportOptions(categories);
      confirmBtn.disabled = false;
    } catch (error) {
      console.error('Error loading classification export options:', error);
      classificationExportState.options = [];
      classificationExportState.mode = 'ALL';
      classificationExportState.categoryIds = [];

      modalBody.innerHTML = `
        <div class="alert alert-danger mb-0">
          ${escapeHtml(error?.message || t('error_title'))}
        </div>
      `;
      confirmBtn.disabled = true;
    } finally {
      exportBtn.innerHTML = originalContent;
      exportBtn.disabled = false;
    }
  });

  confirmBtn.addEventListener('click', async () => {
    if (confirmBtn.disabled) return;

    const eventId = getEvent()?.id;
    if (!eventId) {
      showMessageModal(t('error_title'), t('error_title'));
      return;
    }

    const validationEl = modalBody.querySelector('#exportSelectionValidation');
    const all = classificationExportState.mode === 'ALL';
    const categories = all ? [] : [...classificationExportState.categoryIds];

    if (!all && categories.length === 0) {
      if (validationEl) {
        validationEl.textContent = t('export_modal_select_category_validation', 'Select at least one category to export.');
        validationEl.classList.remove('d-none');
      }
      return;
    }

    if (validationEl) {
      validationEl.textContent = '';
      validationEl.classList.add('d-none');
    }

    setButtonLoading(confirmBtn, true, t('exporting', 'Exporting...'));
    try {
      const response = await fetch(`${API_BASE_URL}/api/competitions/results/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          all,
          categories
        })
      });

      if (!response.ok) {
        let message = t('error_title');
        try {
          const data = await response.json();
          message = data?.error || data?.message || message;
        } catch {
          // ignore non-json errors
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      const filename = getFilenameFromContentDisposition(disposition) || `results-event-${eventId}.pdf`;

      downloadBlobFile(blob, filename);
      modal.hide();
    } catch (error) {
      console.error('Error exporting results:', error);
      showMessageModal(error?.message || t('error_title'), t('error_title'));
    } finally {
      setButtonLoading(confirmBtn, false);
    }
  });
}

function getClassificationExportSelection() {
  return {
    mode: classificationExportState.mode,
    categoryIds: [...classificationExportState.categoryIds]
  };
}

window.getClassificationExportSelection = getClassificationExportSelection;

function getCompetitionJudges(competition) {
  const directJudges = Array.isArray(competition?.judges) ? competition.judges.filter(Boolean) : [];
  if (directJudges.length) return directJudges;

  const judgesById = new Map();
  const dancers = Array.isArray(competition?.dancers) ? competition.dancers : [];
  dancers.forEach(dancer => {
    const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
    votes.forEach(vote => {
      const judge = vote?.judge;
      if (!judge || judge.id === undefined || judge.id === null) return;
      judgesById.set(String(judge.id), judge);
    });
  });

  return Array.from(judgesById.values());
}

function getCompetitionCriteria(competition, judges) {
  const dancers = Array.isArray(competition?.dancers) ? competition.dancers : [];
  for (const dancer of dancers) {
    const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
    for (const judge of judges) {
      const vote = votes.find(v => String(v?.judge?.id) === String(judge?.id));
      const details = Array.isArray(vote?.details) ? vote.details : [];
      if (!details.length) continue;

      return details.map(detail => ({
        criteria_id: detail?.criteria_id,
        criteria_name: detail?.criteria_name || '',
        percentage: detail?.percentage
      }));
    }
  }
  return [];
}

function findVoteDetailByCriteria(vote, criteriaRef) {
  const details = Array.isArray(vote?.details) ? vote.details : [];
  if (!details.length) return null;

  const byId = details.find(detail =>
    criteriaRef?.criteria_id !== undefined &&
    criteriaRef?.criteria_id !== null &&
    detail?.criteria_id === criteriaRef.criteria_id
  );
  if (byId) return byId;

  return details.find(detail => String(detail?.criteria_name || '') === String(criteriaRef?.criteria_name || '')) || null;
}

function formatVoteScore(score) {
  if (score === null || score === undefined || score === '') {
    return '-';
  }

  const numericValue = Number(score);
  if (Number.isFinite(numericValue) && (numericValue === 0 || numericValue === -1)) {
    return '-';
  }

  return escapeHtml(score);
}

function parseCriterionScore(score) {
  if (score === null || score === undefined || score === '') {
    return null;
  }

  const numericValue = Number(score);
  if (!Number.isFinite(numericValue) || numericValue === -1 || numericValue === 0) {
    return null;
  }

  return numericValue;
}

function formatVoteTotalScore(score) {
  if (score === null || score === undefined || score === '') {
    return '-';
  }

  const numericValue = Number(score);
  if (!Number.isFinite(numericValue)) {
    return escapeHtml(score);
  }
  if (numericValue === -1) {
    return '-';
  }

  return escapeHtml(formatResultScore(numericValue));
}

function formatCriteriaPercentageLabel(rawPercentage) {
  if (rawPercentage === null || rawPercentage === undefined || rawPercentage === '') {
    return '';
  }

  const normalizedValue = String(rawPercentage).trim();
  if (!normalizedValue) return '';

  if (normalizedValue.endsWith('%')) {
    return normalizedValue;
  }

  const numericValue = Number(normalizedValue);
  if (Number.isFinite(numericValue)) {
    return `${numericValue}%`;
  }

  return normalizedValue;
}

function getVoteStatusBadgeClass(status) {
  if (status === 'Completed') return 'success';
  if (status === 'Pending') return 'warning';
  if (status === 'Incompatible') return 'danger';
  if (status === 'Max Judges Voted') return 'danger';
  if (status === 'No Show') return 'noshown';
  if (status === 'Disqualified') return 'danger';
  return 'secondary';
}

function renderVoteStatusBadge(status) {
  const statusText = status ? escapeHtml(status) : '-';
  const badgeClass = getVoteStatusBadgeClass(status);
  return `<span class="badge bg-${badgeClass}">${statusText}</span>`;
}

function shouldCollapseCriteriaByStatus(status) {
  return Boolean(status) && !['Completed', 'Pending'].includes(status);
}

function getCompetitionStatusBadgeInfo(status) {
  if (status === 'OPE') return { label: 'OPEN', className: 'bg-warning text-dark' };
  if (status === 'CLO') return { label: 'CLOSED', className: 'bg-secondary' };
  if (status === 'FIN') return { label: 'FINISHED', className: 'bg-success' };
  return { label: status || '-', className: 'bg-secondary' };
}

function renderVotingDetailsModalTitle(competition) {
  const baseTitle = t('voting_details', 'Voting details');
  const titleParts = [competition?.category_name, competition?.style_name]
    .filter(Boolean)
    .map(value => escapeHtml(value));
  const titleText = titleParts.length
    ? `${escapeHtml(baseTitle)}: ${titleParts.join(' - ')}`
    : escapeHtml(baseTitle);

  const statusInfo = getCompetitionStatusBadgeInfo(competition?.status);
  return `${titleText} <span class="badge ${statusInfo.className} ms-2">${escapeHtml(statusInfo.label)}</span>`;
}

function renderCompetitionCriteriaLeadersSummary(competition, criteria) {
  if (!Array.isArray(criteria) || !criteria.length) {
    return '';
  }

  const dancers = Array.isArray(competition?.dancers) ? competition.dancers : [];
  if (!dancers.length) {
    return '';
  }

  const criteriaRows = criteria.map((criteriaRef) => {
    const epsilon = 0.0001;
    let maxTotal = null;
    let leaders = [];

    dancers.forEach((dancer) => {
      const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
      let dancerTotal = 0;
      let hasAnyScore = false;

      votes.forEach((vote) => {
        const detail = findVoteDetailByCriteria(vote, criteriaRef);
        const numericScore = parseCriterionScore(detail?.score);
        if (numericScore === null) return;
        dancerTotal += numericScore;
        hasAnyScore = true;
      });

      if (!hasAnyScore) return;

      if (maxTotal === null || dancerTotal > (maxTotal + epsilon)) {
        maxTotal = dancerTotal;
        leaders = [dancer];
        return;
      }

      if (Math.abs(dancerTotal - maxTotal) <= epsilon) {
        leaders.push(dancer);
      }
    });

    const criteriaName = escapeHtml(criteriaRef?.criteria_name || t('criteria', 'Criterio'));
    const leadersText = leaders.length
      ? leaders.map((dancer) => escapeHtml(dancer?.dancer_name || t('dancer'))).join(', ')
      : '-';
    const totalText = formatVoteTotalScore(maxTotal);

    return `
      <div class="vote-details-criteria-leader-item">
        <span class="vote-details-criteria-leader-name">${criteriaName}:</span>
        <span class="vote-details-criteria-leader-value">${leadersText} <span class="text-muted">(${totalText})</span></span>
      </div>
    `;
  }).join('');

  return `
    <div class="vote-details-criteria-leaders">
      <div class="vote-details-criteria-leaders-title">${t('top_by_criteria', 'Mejor puntuación por criterio')}</div>
      <div class="vote-details-criteria-leaders-list">
        ${criteriaRows}
      </div>
    </div>
  `;
}

function renderVoteDetailsFooter(showCriteria = false, showToggle = true) {
  const toggleButton = showToggle
    ? `
      <button
        type="button"
        class="btn btn-outline-primary btn-sm btn-toggle-vote-details"
        data-show-criteria="${showCriteria ? '1' : '0'}"
        aria-pressed="${showCriteria ? 'true' : 'false'}">
        ${showCriteria ? t('hide_vote_details', 'Hide voting details') : t('show_vote_details', 'Show voting details')}
      </button>
    `
    : '';

  return `
    ${toggleButton}
    <button type="button" class="btn btn-secondary btn-sm ms-auto" data-bs-dismiss="modal">${t('close')}</button>
  `;
}

function setVoteDetailsCriteriaVisibility(modalBody, modalFooter, showCriteria, showToggle = true) {
  if (modalBody) {
    modalBody.classList.toggle('vote-details-show-criteria', Boolean(showCriteria));
    modalBody.querySelectorAll('.vote-details-judge-group-head').forEach((headerCell) => {
      const expandedSpan = Number(headerCell.dataset.colspanExpanded || headerCell.colSpan || 1);
      headerCell.colSpan = showCriteria ? expandedSpan : 1;
    });
  }
  if (modalFooter) {
    modalFooter.innerHTML = renderVoteDetailsFooter(showCriteria, showToggle);
  }
}

function renderCompetitionVotingDetailsTable(competition) {
  const judges = getCompetitionJudges(competition);
  const criteria = getCompetitionCriteria(competition, judges);
  const dancers = Array.isArray(competition?.dancers) ? competition.dancers : [];
  const criteriaLeadersSummary = renderCompetitionCriteriaLeadersSummary(competition, criteria);

  if (!judges.length || !dancers.length) {
    return `
      <div class="mb-4">
        <div class="alert alert-info mb-0">${t('no_data')}</div>
      </div>
    `;
  }

  const hasCriteria = criteria.length > 0;
  const detailColumnsPerJudge = hasCriteria ? (criteria.length + 1) : 1;
  const staticColumnsCount = 2;
  const detailCols = judges.map(() => {
    if (!hasCriteria) {
      return '<col class="vote-details-col-judge-total">';
    }

    const criteriaCols = new Array(criteria.length)
      .fill('<col class="vote-details-col-criteria vote-details-criteria-col">')
      .join('');
    return `${criteriaCols}<col class="vote-details-col-judge-total">`;
  }).join('');

  const judgeHeaderCells = judges.map((judge) => {
    const reserveBadge = judge?.reserve
      ? `<span class="badge bg-secondary ms-1" title="${t('judge_in_reserve')}">R</span>`
      : '';
    return `
      <th class="text-center vote-details-judge-group-head" colspan="${detailColumnsPerJudge}" data-colspan-expanded="${detailColumnsPerJudge}">
        ${escapeHtml(judge?.name || '')}${reserveBadge}
      </th>
    `;
  }).join('');

  const criteriaHeaderCells = judges.map(() => {
    if (!hasCriteria) {
      return `<th class="text-center vote-details-criteria-head vote-details-judge-total-head">${t('total')}</th>`;
    }

    const criteriaHeads = criteria.map(item => {
      const rawName = item?.criteria_name || '';
      const percentageText = formatCriteriaPercentageLabel(item?.percentage);
      const caption = percentageText ? `${rawName} (${percentageText})` : rawName;
      const captionEscaped = escapeHtml(caption);
      const nameEscaped = escapeHtml(rawName);
      const percentageEscaped = escapeHtml(percentageText);
      return `
        <th class="text-center vote-details-criteria-head vote-details-criteria-col" title="${captionEscaped}">
          <span class="vote-details-criteria-caption">
            <span class="vote-details-criteria-name">${nameEscaped}</span>
            ${percentageText ? `<span class="vote-details-criteria-percentage">${percentageEscaped}</span>` : ''}
          </span>
        </th>
      `;
    }).join('');

    return `
      ${criteriaHeads}
      <th class="text-center vote-details-criteria-head vote-details-judge-total-head" title="${t('total')}">${t('total')}</th>
    `;
  }).join('');

  const rows = dancers.map(dancer => {
    const votes = Array.isArray(dancer?.votes) ? dancer.votes : [];
    const dancerName = escapeHtml(dancer?.dancer_name || '');
    const positionBadge = dancer?.position
      ? `<span class="badge bg-info vote-details-dancer-badge">#${escapeHtml(dancer.position)}</span>`
      : '';
    const dancerTotalScore = formatVoteTotalScore(dancer?.total_score);

    const judgeCells = judges.map((judge) => {
      const vote = votes.find(v => String(v?.judge?.id) === String(judge?.id));
      if (!vote) {
        if (!hasCriteria) {
          return '<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell text-muted">-</td>';
        }
        const emptyCriteriaCells = new Array(criteria.length)
          .fill('<td class="vote-details-cell vote-details-score-cell text-muted vote-details-criteria-col">-</td>')
          .join('');
        return `${emptyCriteriaCells}<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell text-muted">-</td>`;
      }

      const statusTitle = escapeHtml(vote?.status || '');
      if (!hasCriteria) {
        const score = formatVoteTotalScore(vote?.total);
        if (shouldCollapseCriteriaByStatus(vote?.status)) {
          return `<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell" title="${statusTitle}">${renderVoteStatusBadge(vote?.status)}</td>`;
        }
        return `<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell" title="${statusTitle}">${score}</td>`;
      }

      if (shouldCollapseCriteriaByStatus(vote?.status)) {
        const judgeTotalScore = formatVoteTotalScore(vote?.total);
        return `
          <td class="vote-details-cell vote-details-status-cell vote-details-criteria-col" colspan="${criteria.length}" title="${statusTitle}">
            ${renderVoteStatusBadge(vote?.status)}
          </td>
          <td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell" title="${statusTitle}">${judgeTotalScore}</td>
        `;
      }

      const criteriaCells = criteria.map(criteriaRef => {
        const detail = findVoteDetailByCriteria(vote, criteriaRef);
        const score = formatVoteScore(detail?.score);
        return `<td class="vote-details-cell vote-details-score-cell vote-details-criteria-col" title="${statusTitle}">${score}</td>`;
      }).join('');

      const judgeTotalScore = formatVoteTotalScore(vote?.total);
      return `${criteriaCells}<td class="vote-details-cell vote-details-score-cell vote-details-judge-total-cell" title="${statusTitle}">${judgeTotalScore}</td>`;
    }).join('');

    return `
      <tr>
        <th scope="row" class="text-start vote-details-sticky-col">
          <div class="vote-details-dancer-cell">
            <span class="vote-details-dancer-name" title="${dancerName}">${dancerName}</span>
            ${positionBadge}
          </div>
        </th>
        <td class="vote-details-cell vote-details-score-cell vote-details-dancer-total-cell">${dancerTotalScore}</td>
        ${judgeCells}
      </tr>
    `;
  }).join('');

  return `
    ${criteriaLeadersSummary}
    <div class="vote-details-scroll-group">
      <div class="vote-details-scrollbar-top" aria-hidden="true">
        <div class="vote-details-scrollbar-spacer"></div>
      </div>
      <div class="vote-details-table-wrap">
        <table class="table table-bordered align-middle text-center vote-details-table mb-0" data-static-cols="${staticColumnsCount}">
          <colgroup>
            <col class="vote-details-col-dancer">
            <col class="vote-details-col-dancer-total">
            ${detailCols}
          </colgroup>
          <thead class="table-light">
            <tr>
              <th class="text-start vote-details-sticky-col" rowspan="2">${t('dancer')}</th>
              <th class="text-center vote-details-total-head" rowspan="2">${t('total')}</th>
              ${judgeHeaderCells}
            </tr>
            <tr>
              ${criteriaHeaderCells}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function initVoteDetailsScrollSync(container) {
  if (!container) return;

  const groups = container.querySelectorAll('.vote-details-scroll-group');
  groups.forEach(group => {
    const topBar = group.querySelector('.vote-details-scrollbar-top');
    const spacer = group.querySelector('.vote-details-scrollbar-spacer');
    const tableWrap = group.querySelector('.vote-details-table-wrap');
    const tableEl = group.querySelector('.vote-details-table');
    if (!topBar || !spacer || !tableWrap || !tableEl) return;

    const updateScrollbar = () => {
      spacer.style.width = `${tableWrap.scrollWidth}px`;
      const hasHorizontalOverflow = tableWrap.scrollWidth > (tableWrap.clientWidth + 1);
      topBar.style.display = hasHorizontalOverflow ? 'block' : 'none';
      if (hasHorizontalOverflow) {
        topBar.scrollLeft = tableWrap.scrollLeft;
      }

      const firstHeaderRow = tableEl.querySelector('thead tr:first-child');
      if (firstHeaderRow) {
        const rowHeight = Math.ceil(firstHeaderRow.getBoundingClientRect().height);
        tableEl.style.setProperty('--vote-details-header-second-row-top', `${rowHeight}px`);
      }
    };

    if (!group.dataset.scrollSyncBound) {
      let syncingFromTop = false;
      let syncingFromTable = false;

      topBar.addEventListener('scroll', () => {
        if (syncingFromTable) return;
        syncingFromTop = true;
        tableWrap.scrollLeft = topBar.scrollLeft;
        syncingFromTop = false;
      });

      tableWrap.addEventListener('scroll', () => {
        if (syncingFromTop) return;
        syncingFromTable = true;
        topBar.scrollLeft = tableWrap.scrollLeft;
        syncingFromTable = false;
      });

      group.dataset.scrollSyncBound = '1';
    }

    updateScrollbar();
    requestAnimationFrame(updateScrollbar);
  });
}

function initVoteDetailsGridHover(container) {
  if (!container) return;

  const clearHover = (table) => {
    table.querySelectorAll('.vote-details-hover-row').forEach(row => row.classList.remove('vote-details-hover-row'));
    table.querySelectorAll('.vote-details-hover-col').forEach(cell => cell.classList.remove('vote-details-hover-col'));
    table._hoverColStart = null;
    table._hoverColEnd = null;
    table._hoverRowEl = null;
  };

  const getCellRange = (cell) => {
    if (!cell || !cell.parentElement) {
      return { start: 0, end: 0 };
    }

    let start = 0;
    const siblings = Array.from(cell.parentElement.children);
    for (const sibling of siblings) {
      if (sibling === cell) break;
      start += Number(sibling.colSpan || 1);
    }

    const span = Math.max(1, Number(cell.colSpan || 1));
    return {
      start,
      end: start + span - 1
    };
  };

  const rangesOverlap = (startA, endA, startB, endB) => {
    return startA <= endB && startB <= endA;
  };

  const highlightColumnRange = (table, colStart, colEnd) => {
    const firstHeaderRow = table.querySelector('thead tr:first-child');
    const secondHeaderRow = table.querySelector('thead tr:nth-child(2)');
    const staticCols = Number(table.dataset.staticCols || 1);

    if (firstHeaderRow) {
      for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
        if (colIndex < staticCols) {
          const staticHead = firstHeaderRow.cells[colIndex];
          if (staticHead) staticHead.classList.add('vote-details-hover-col');
        }
      }
    }

    if (secondHeaderRow) {
      for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
        if (colIndex >= staticCols) {
          const criteriaHead = secondHeaderRow.cells[colIndex - staticCols];
          if (criteriaHead) criteriaHead.classList.add('vote-details-hover-col');
        }
      }
    }

    if (firstHeaderRow && colEnd >= staticCols) {
      let currentStart = staticCols;
      const headerCells = Array.from(firstHeaderRow.cells).filter((cell, idx) => idx >= staticCols);
      for (const headerCell of headerCells) {
        const span = Number(headerCell.colSpan || 1);
        const groupStart = currentStart;
        const groupEnd = currentStart + span - 1;
        if (rangesOverlap(colStart, colEnd, groupStart, groupEnd)) {
          headerCell.classList.add('vote-details-hover-col');
        }
        currentStart += span;
      }
    }

    table.querySelectorAll('tbody tr').forEach(row => {
      Array.from(row.children).forEach((rowCell) => {
        const { start, end } = getCellRange(rowCell);
        if (rangesOverlap(colStart, colEnd, start, end)) {
          rowCell.classList.add('vote-details-hover-col');
        }
      });
    });
  };

  container.querySelectorAll('.vote-details-table').forEach(table => {
    if (table.dataset.hoverBound === '1') return;

    table.addEventListener('mousemove', (event) => {
      const cell = event.target.closest('tbody td, tbody th');
      if (!cell || !table.contains(cell)) {
        clearHover(table);
        return;
      }

      const row = cell.parentElement;
      const cellRange = getCellRange(cell);
      if (
        table._hoverRowEl === row &&
        table._hoverColStart === cellRange.start &&
        table._hoverColEnd === cellRange.end
      ) {
        return;
      }

      clearHover(table);
      row.classList.add('vote-details-hover-row');
      highlightColumnRange(table, cellRange.start, cellRange.end);
      table._hoverRowEl = row;
      table._hoverColStart = cellRange.start;
      table._hoverColEnd = cellRange.end;
    });

    table.addEventListener('mouseleave', () => clearHover(table));
    table.dataset.hoverBound = '1';
  });
}

function adjustVoteDetailsModalWidth(modalEl, modalBody) {
  const dialogEl = modalEl?.querySelector('.modal-dialog');
  if (!dialogEl) return;

  const viewportMaxWidth = Math.max(640, Math.floor(window.innerWidth * 0.96));
  const compactDefaultMaxWidth = Math.min(viewportMaxWidth, 820);

  if (!modalBody) {
    dialogEl.style.maxWidth = `${compactDefaultMaxWidth}px`;
    return;
  }

  const tables = Array.from(modalBody.querySelectorAll('.vote-details-table'));
  if (!tables.length) {
    dialogEl.style.maxWidth = `${compactDefaultMaxWidth}px`;
    return;
  }

  const widestTable = tables.reduce((maxWidth, tableEl) => {
    const measuredWidth = Math.ceil(tableEl.getBoundingClientRect().width || 0);
    const scrollWidth = tableEl.scrollWidth || 0;
    return Math.max(maxWidth, measuredWidth, scrollWidth);
  }, 0);
  if (!widestTable) {
    dialogEl.style.maxWidth = `${compactDefaultMaxWidth}px`;
    return;
  }

  const bodyStyles = window.getComputedStyle(modalBody);
  const horizontalBodyPadding = (parseFloat(bodyStyles.paddingLeft) || 0) + (parseFloat(bodyStyles.paddingRight) || 0);
  const modalChromeSpace = 40;
  const desiredModalWidth = Math.ceil(widestTable + horizontalBodyPadding + modalChromeSpace);
  dialogEl.style.maxWidth = `${Math.min(viewportMaxWidth, desiredModalWidth)}px`;
}

function scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody) {
  adjustVoteDetailsModalWidth(modalEl, modalBody);
  requestAnimationFrame(() => adjustVoteDetailsModalWidth(modalEl, modalBody));
  setTimeout(() => adjustVoteDetailsModalWidth(modalEl, modalBody), 0);
  setTimeout(() => adjustVoteDetailsModalWidth(modalEl, modalBody), 120);
}

async function showCompetitionVotingDetails(categoryId, styleId) {
  if (!categoryId || !styleId) return;

  const requestKey = `${categoryId}-${styleId}`;
  if (competitionDetailsInFlight.has(requestKey)) return;
  competitionDetailsInFlight.add(requestKey);

  const modalEl = document.getElementById('voteDetailsModal');
  const modalBody = document.getElementById('voteDetailsBody');
  const modalTitle = modalEl?.querySelector('.modal-title');
  const modalFooter = modalEl?.querySelector('.modal-footer');

  if (!modalEl || !modalBody) {
    competitionDetailsInFlight.delete(requestKey);
    return;
  }

  if (!modalEl.dataset.voteDetailsToggleBound) {
    modalEl.addEventListener('click', (event) => {
      const toggleBtn = event.target.closest('.btn-toggle-vote-details');
      if (!toggleBtn) return;

      const bodyEl = document.getElementById('voteDetailsBody');
      const footerEl = modalEl.querySelector('.modal-footer');
      if (!bodyEl || !footerEl) return;

      const showCriteria = toggleBtn.dataset.showCriteria !== '1';
      setVoteDetailsCriteriaVisibility(bodyEl, footerEl, showCriteria, true);
      initVoteDetailsScrollSync(bodyEl);
      initVoteDetailsGridHover(bodyEl);
      scheduleVoteDetailsModalWidthAdjustment(modalEl, bodyEl);
    });
    modalEl.dataset.voteDetailsToggleBound = '1';
  }

  if (!modalEl.dataset.voteDetailsShownBound) {
    modalEl.addEventListener('shown.bs.modal', () => {
      const body = document.getElementById('voteDetailsBody');
      if (!body) return;
      initVoteDetailsScrollSync(body);
      initVoteDetailsGridHover(body);
      scheduleVoteDetailsModalWidthAdjustment(modalEl, body);
    });
    modalEl.dataset.voteDetailsShownBound = '1';
  }

  if (modalTitle) {
    modalTitle.textContent = t('voting_details', 'Voting details');
  }
  setVoteDetailsCriteriaVisibility(modalBody, modalFooter, false, false);

  modalBody.innerHTML = `
    <div class="d-flex align-items-center justify-content-center py-4">
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${t('loading')}</span>
    </div>
  `;
  scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();

  try {
    const url = `${API_BASE_URL}/api/competitions/tracking/voting-details?event_id=${getEvent().id}&category_id=${categoryId}&style_id=${styleId}`;
    const response = await fetch(url);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || t('error_title'));
    }

    const competitions = Array.isArray(data) ? data : (data ? [data] : []);
    if (!competitions.length) {
      modalBody.innerHTML = `<div class="alert alert-info mb-0">${t('no_data')}</div>`;
      setVoteDetailsCriteriaVisibility(modalBody, modalFooter, false, false);
      scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody);
      return;
    }

    const firstCompetition = competitions[0];
    if (modalTitle) {
      modalTitle.innerHTML = renderVotingDetailsModalTitle(firstCompetition);
    }

    modalBody.innerHTML = competitions.map(renderCompetitionVotingDetailsTable).join('');
    setVoteDetailsCriteriaVisibility(modalBody, modalFooter, false, true);
    initVoteDetailsScrollSync(modalBody);
    initVoteDetailsGridHover(modalBody);
    scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody);
    if (!modalEl.dataset.voteDetailsResizeBound) {
      window.addEventListener('resize', () => {
        const body = document.getElementById('voteDetailsBody');
        if (body) {
          initVoteDetailsScrollSync(body);
          initVoteDetailsGridHover(body);
          scheduleVoteDetailsModalWidthAdjustment(modalEl, body);
        }
      });
      modalEl.dataset.voteDetailsResizeBound = '1';
    }
  } catch (error) {
    console.error('Error fetching competition voting details:', error);
    modalBody.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(error?.message || t('error_title'))}</div>`;
    setVoteDetailsCriteriaVisibility(modalBody, modalFooter, false, false);
    scheduleVoteDetailsModalWidthAdjustment(modalEl, modalBody);
  } finally {
    competitionDetailsInFlight.delete(requestKey);
  }
}

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  const getCompetitionsBtn = document.getElementById('getCompetitionsBtn');
  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');

  getCompetitionsBtn.disabled = true;

  //await eventReadyPromise;
  await WaitEventLoaded();

  const data = await loadCategoriesAndStyles();
  populateCategorySelect(data, categorySelect);
  initClassificationExportOptions();

  categorySelect.addEventListener('change', () => {
    populateStyleSelect(categorySelect.value, data, styleSelect);

    getCompetitionsBtn.disabled = !categorySelect.value;
  });

  getCompetitionsBtn.addEventListener('click', async () => {

    const originalContent = getCompetitionsBtn.innerHTML;
    getCompetitionsBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${t('loading')}
    `;
    getCompetitionsBtn.disabled = true;
    try {
      await loadCompetitions(categorySelect.value, styleSelect.value);
    } finally {
      // Restaurar contenido original
      getCompetitionsBtn.innerHTML = originalContent;
      getCompetitionsBtn.disabled = !categorySelect.value; // volver a habilitar si hay categoría
    }
  });

  const saveClassificationBtn = document.getElementById('saveClassificationBtn');
  if (saveClassificationBtn) {
    saveClassificationBtn.addEventListener('click', async () => {
      if (!getEvent().canDecidePositions) return;

      const modalEl = document.getElementById('resultsModal');
      const tbody = modalEl?.querySelector('tbody');
      const categoryId = modalEl?.dataset.categoryId;
      const styleId = modalEl?.dataset.styleId;

      if (!tbody || !categoryId || !styleId) return;

      const classification = buildClassificationFromResultsTable(tbody, modalEl?._resultsData);
      const originalText = saveClassificationBtn.innerHTML;

      saveClassificationBtn.disabled = true;
      saveClassificationBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        ${t('loading')}
      `;

      try {
        const response = await fetch(`${API_BASE_URL}/api/competitions/set-classification`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: getEvent().id,
            category_id: Number(categoryId),
            style_id: Number(styleId),
            classification
          })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          showMessageModal(data.error || t('error_title'), t('error_title'));
          return;
        }

        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        const currentCategory = document.getElementById('categorySelect')?.value;
        const currentStyle = document.getElementById('styleSelect')?.value;
        if (currentCategory) {
          await loadCompetitions(currentCategory, currentStyle);
        }
      } catch (err) {
        showMessageModal(err.message || t('error_title'), t('error_title'));
      } finally {
        saveClassificationBtn.disabled = false;
        saveClassificationBtn.innerHTML = originalText;
      }
    });
  }

});


async function loadCompetitions(categoryId, styleId) {
  try {
    let url = `${API_BASE_URL}/api/competitions/tracking?event_id=${getEvent().id}&category_id=${categoryId}`;
    if (styleId) {
      url += `&style_id=${styleId}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const competitions = await response.json();
    renderCompetitions(competitions);

    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    tooltipTriggerList.map(el => new bootstrap.Tooltip(el));
  } catch (error) {
    console.error('Error fetching competitions:', error);
  }
}

function renderCompetitions(competitions) {
  const container = document.getElementById('competitionsContainer');
  container.innerHTML = '';

  let btnDisabled = '';
  if (getEvent().status === 'finished') {
    btnDisabled = 'disabled';
  }

  if (!competitions || competitions.length === 0) {
    container.innerHTML = `
      <div class="alert alert-warning text-center my-4">
        ${t('no_competitions_found')}
      </div>
    `;
    return;
  }

  competitions.forEach((comp, index) => {

    let statusText;
    if (comp.status === 'OPE') {
      statusText = 'OPEN';
    } else if (comp.status === 'FIN') {
      statusText = 'FINISHED';
    } else if (comp.status === 'CLO') {
      statusText = 'CLOSED';
    } else {
      statusText = comp.status;
    }
    const isFinished = comp.status === 'FIN';
    const isOpen = comp.status === 'OPE';
    const statusActionButton = !isFinished
      ? `
        <button type="button"
          class="btn btn-outline-${isOpen ? 'warning' : 'success'} btn-sm w-100 btn-toggle-status"
          data-action="${isOpen ? 'close' : 'open'}"
          data-comp-id="${comp.id}" ${btnDisabled}>
          <i class="bi ${isOpen ? 'bi-lock' : 'bi-unlock'} me-1"></i>
          ${isOpen ? t('close_competition') : t('open_competition')}
        </button>
      `
      : '';
    // Card con info de competición
    const card = document.createElement('div');
    card.className = 'card mb-4';
    card.innerHTML = `
      <div class="card-header">
        <h5 class="mb-0 text-center w-85">${comp.category_name} - ${comp.style_name}</h5>
      </div>
      <div class="card-body">
        <div class="row text-center align-items-stretch">
          <div class="col-12 col-md-2 d-flex">
            <div class="d-grid gap-2 w-100">
              ${statusActionButton}
              <div class="row g-2">
                <div class="col-6">
                  <button type="button"
                    class="btn btn-outline-secondary btn-sm w-100 btn-competition-details"
                    data-category-id="${comp.category_id}"
                    data-style-id="${comp.style_id}"
                    data-status="${comp.status}">
                    <i class="bi bi-info-circle me-1"></i>
                    ${t('view_details')}
                  </button>
                </div>
                <div class="col-6">
                  <button type="button"
                    class="btn btn-outline-primary btn-sm w-100 btn-view-results"
                    data-category-id="${comp.category_id}"
                    data-style-id="${comp.style_id}"
                    data-status="${comp.status}">
                    <i class="bi bi-trophy me-1"></i>
                    ${t('results_button', 'Results')}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">${t('category')}</p>
            <p><span class="badge bg-secondary">${comp.category_name}</span></p>
          </div>
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">${t('style')}</p>
            <p><span class="badge bg-secondary">${comp.style_name}</span></p>
          </div>
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">${t('stimated_time')}</p>
            <p>${comp.estimated_start_form ?? '<span class="badge bg-dark">' + t('not_defined') + '</span>'}</p>
          </div>
          <div class="col-6 col-md-1">
            <p class="mb-1 fw-semibold">${t('status')}</p>
            <p>
              <span class="badge bg-${
                comp.status === 'OPE'
                  ? 'warning'
                  : comp.status === 'CLO'
                  ? 'danger'
                  : 'success'
              }">
                ${statusText}
              </span>
            </p>

          </div>                  
          <div class="col-6 col-md-1">
            <p class="mb-1 fw-semibold">${t('judges')}</p>
            <p class="text-nowrap">
              <span class="badge bg-primary">${comp.judge_number}</span>
              <span>/</span>
              <span class="badge bg-warning"
                    data-bs-toggle="tooltip"
                    data-bs-placement="top"
                    title="${t('reserve_judges')}">
                ${comp.judge_number_reserve}
              </span>
            </p>
          </div>
          <div class="col-6 col-md-1">
            <p class="mb-1 fw-semibold">${t('dancers')}</p>
            <p><span class="badge bg-primary">${comp.num_dancers}</span></p>
          </div>
          <div class="col-6 col-md-1">
            <p class="mb-1 fw-semibold">${t('pending')}</p>
            <p><span class="badge bg-warning">${comp.dancers.filter(d => d.votes.some(v => v.status === 'Pending')).length}</span></p>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);

    // Tabla de votaciones
    if (!comp.judges.length || !comp.dancers.length) {
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-info text-center';
      alertDiv.textContent = t('no_data');
      container.appendChild(alertDiv);
    } else {
      const tableContainer = document.createElement('div');
      tableContainer.className = 'table-responsive mx-auto mb-4';

      let tableHTML = `
        <table class="table table-bordered align-middle text-center">
          <thead class="table-light">
            <tr>
              <th>${t('dancer')}</th>
              ${comp.judges.map(j => `
                <th class="text-center">
                  ${j.name}
                  ${j.reserve ? `<span class="badge bg-secondary ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="${t('judge_in_reserve')}">R</span>` : ''}
                </th>
              `).join('')}              
              <th>${t('voted')}</th>
              <th>${t('total')}</th>
              ${shouldShowAvgPlaceColumn() ? `<th>${t('avg_place')}</th>` : ''}
            </tr>
          </thead>
          <tbody>
      `;

      comp.dancers.forEach(d => {
        const dancerFlagHtml = getDancerFlagImgHtml(d.nationality, {
          className: 'me-2',
          style: 'vertical-align: middle;'
        });

        const dancerCell = `
          <div class="d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              ${dancerFlagHtml}
              <span>${d.dancer_name}</span>
            </div>
            <div class="d-flex align-items-center gap-2">
              <div class="dropdown">
                <button class="btn btn-outline-secondary btn-sm dropdown-toggle"
                  type="button"
                  data-bs-toggle="dropdown"
                  aria-expanded="false" ${btnDisabled}>
                  ${t('actions')}
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                  <li>
                    <button class="dropdown-item js-no-show"
                      type="button"
                      data-category-id="${comp.category_id}"
                      data-style-id="${comp.style_id}"
                      data-dancer-id="${d.dancer_id ?? d.id}"
                      data-dancer-name="${d.dancer_name}" ${btnDisabled}>
                      ${t('no_show')}
                    </button>
                  </li>
                  <li>
                    <button class="dropdown-item js-disqualify"
                      type="button"
                      data-category-id="${comp.category_id}"
                      data-style-id="${comp.style_id}"
                      data-dancer-id="${d.dancer_id ?? d.id}"
                      data-dancer-name="${d.dancer_name}" ${btnDisabled}>
                      ${t('disqualify')}
                    </button>
                  </li>
                  <li><button class="dropdown-item" type="button" ${btnDisabled}>${t('penalty')}</button></li>
                </ul>
              </div>
              <span class="badge bg-info">#${d.position}</span>
            </div>
          </div>
        `;

        const voteCells = d.votes.map((v, judgeIndex) => {
          let badgeClass = 'secondary';
          if (v.status === 'Completed') badgeClass = 'success';
          else if (v.status === 'Pending') badgeClass = 'warning';
          else if (v.status === 'Incompatible') badgeClass = 'danger';
          else if (v.status === 'Max Judges Voted') badgeClass = 'danger';
          else if (v.status === 'No Show') badgeClass = 'noshown';
          else if (v.status === 'Disqualified') badgeClass = 'danger';

          // async function resetVote(categoryId, styleId, judgeId, dancerId, rowId) {

          let ind = `${comp.id}-${d.dancer_id}-${v.judge.id}`; // ID de la fila para localizarla en reset

          if (['Completed', 'No Show'].includes(v.status)) {

            let params = `${comp.category_id}, ${comp.style_id}, ${v.judge.id}, ${d.dancer_id}, '${ind}', '${d.dancer_name}', '${v.judge.name}'`;
            let showEye = v.status === 'Completed';
            
            return `
              <td class="text-center" id="row-${ind}">
                <div class="d-flex justify-content-between align-items-center">
                  <!-- Ver detalles (izquierda) -->
                  <button class="btn btn-link text-primary p-0" 
                    onclick="showVoteDetails(${params})" 
                    title="${t('ver_detalles')}"
                    style="visibility: ${showEye ? 'visible' : 'hidden'};">
                    <i class="bi bi-eye"></i>
                  </button>

                  <!-- Badge (centro) -->
                  <span class="badge status-badge bg-${badgeClass}">${v.status}</span>

                  <!-- Reiniciar voto (derecha) -->
                  <button class="btn btn-link text-danger p-0" 
                    onclick="resetVote(${params})" 
                    title="${t('reiniciar_voto')}" ${btnDisabled}>
                    <i class="bi bi-arrow-counterclockwise"></i>
                  </button>
                </div>
              </td>
            `;

          }

          return `<td class="text-center" id="row-${ind}"><span class="badge status-badge bg-${badgeClass}">${v.status}</span></td>`;
        }).join('');

        // Asignar ID a la fila combinando competición-dancer-judge (para poder localizarla en reset)
        const totalScoreText = (getEvent().criteriaConfig === 'WITH_POR')
          ? Number(d.total_score ?? 0).toFixed(1)
          : (d.total_score || 0);
        const avgPlaceText = formatAvgPlace(d.avg_place);
        tableHTML += `<tr id="row-${comp.id}-${d.id}">${'<td>' + dancerCell + '</td>' + voteCells}        
        <td class="bg-light">${d.judges_voted}</td>
        <td class="bg-light">${totalScoreText}</td>
        ${shouldShowAvgPlaceColumn() ? `<td class="bg-light">${avgPlaceText}</td>` : ''}</tr>`;
      });

      tableHTML += '</tbody></table>';
      tableContainer.innerHTML = tableHTML;
      container.appendChild(tableContainer);
    }

    // Separador entre competiciones (menos después de la última)
    if (index < competitions.length - 1) {
      const hr = document.createElement('hr');
      hr.className = 'my-4 mx-auto';
      hr.style.width = '200px';
      container.appendChild(hr);
    }
  });

  container.querySelectorAll('.btn-toggle-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;

      const compId = btn.dataset.compId;
      const action = btn.dataset.action;
      if (!compId || !action) return;

      btn.disabled = true;

      try {
        const response = await fetch(`${API_BASE_URL}/api/competitions/${compId}/changestatus`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: getEvent().id, action })
        });

        const data = await response.json();

        if (!response.ok) {
          showMessageModal(data.error || t('error_change_competition_status'), t('error_title'));
          btn.disabled = false;
          return;
        }

        await loadCompetitions(
          document.getElementById('categorySelect').value,
          document.getElementById('styleSelect').value
        );
      } catch (error) {
        console.error('Error changing competition status:', error);
        showMessageModal(t('error_change_competition_status'), t('error_title'));
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.js-no-show').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await markNoShow(
        btn.dataset.categoryId,
        btn.dataset.styleId,
        btn.dataset.dancerId,
        btn.dataset.dancerName
      );
    });
  });

  container.querySelectorAll('.js-disqualify').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await markDisqualified(
        btn.dataset.categoryId,
        btn.dataset.styleId,
        btn.dataset.dancerId,
        btn.dataset.dancerName
      );
    });
  });

  container.querySelectorAll('.btn-competition-details').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await showCompetitionVotingDetails(btn.dataset.categoryId, btn.dataset.styleId);
    });
  });

  container.querySelectorAll('.btn-view-results').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      await showResults(btn.dataset.categoryId, btn.dataset.styleId, btn.dataset.status);
    });
  });

  initActionDropdowns(container);
}

function initActionDropdowns(container) {
  container.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(btn => {
    if (bootstrap.Dropdown.getInstance(btn)) return;
    new bootstrap.Dropdown(btn, {
      popperConfig: {
        strategy: 'fixed',
        modifiers: [
          { name: 'preventOverflow', options: { boundary: 'viewport' } }
        ]
      }
    });
  });
}

async function showVoteDetails(categoryId, styleId, judgeId, dancerId, rowId, dancerName, judgeName) {
  if (voteDetailsInFlight.has(rowId)) {
    return;
  }
  voteDetailsInFlight.add(rowId);

  document.getElementById('detailsModalLabel').textContent = `${t('judge')}: ${judgeName} / ${t('dancer')}: ${dancerName}`;

  criteriaContainer.innerHTML = '';

  let total = 0;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting?event_id=${getEvent().id}&judge=${judgeId}&category=${categoryId}&style=${styleId}`);
    if (!res.ok) {
      throw new Error(t('error_fetch_vote_details'));
    }

    const data = await res.json();

    const formatCriteriaLabel = (criteria) => {
      const rawPercentage = criteria?.percentage;
      if (rawPercentage === undefined || rawPercentage === null || rawPercentage === '') {
        return criteria.name;
      }
      const percentageNumber = Number(rawPercentage);
      if (Number.isNaN(percentageNumber)) {
        return criteria.name;
      }
      return `${criteria.name} (${percentageNumber}%)`;
    };

    // Filtramos dancerId de data.dancers
    data.dancers = data.dancers.find(d => d.id === dancerId);
    if (!data.dancers) throw new Error(t('error_vote_details_dancer_not_found'));

    data.criteria.forEach(c => {
      const value = data.dancers.scores?.[c.name] ?? '-';
      const col = document.createElement('div');
      col.className = 'col-6 text-center';

      // Solo lectura
      if (typeof value === 'number') total += value;
      col.innerHTML = `
        <div class="mb-1 fw-semibold">${formatCriteriaLabel(c)}</div>
        <span class="badge bg-info fs-5">${value}</span>
      `;    

      criteriaContainer.appendChild(col);
    });

    // Total
    const totalCol = document.createElement('div');
    totalCol.className = 'col-12 mt-3 text-center';
    totalCol.innerHTML = `
      <div class="fw-bold mb-1">${t('total')}</div>
      <span id="totalScore" class="badge bg-success fs-4 px-4">${data.dancers.totalScore}</span>
    `;
    criteriaContainer.appendChild(totalCol);

    const modalEl = document.getElementById('detailsModal');
    let modal = new bootstrap.Modal(modalEl);

    // Footer  limpiar primero
    const footer = modal._element.querySelector('.modal-footer');
    footer.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">${t('close')}</button>`;

    modal.show();
  } catch (error) {
    console.error('Error loading vote details modal:', error);
    showMessageModal(error?.message || t('error_fetch_vote_details'), t('error_title'));
  } finally {
    voteDetailsInFlight.delete(rowId);
  }
}

async function resetVote(categoryId, styleId, judgeId, dancerId, rowId, dancerName, judgeName) {

  const confirmed = await showModal(`${t('confirm_reset_1')} "${judgeName}" ${t('confirm_reset_2')} "${dancerName}"?`);

  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting/resetVoting?event_id=${getEvent().id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: categoryId,
        style_id: styleId,
        judge_id: judgeId,
        dancer_id: dancerId
      })
    });

    if (!res.ok) throw new Error('Error al reiniciar el voto');

    const data = await res.json();
    
    if (data.success) {

      loadCompetitions(document.getElementById('categorySelect').value, document.getElementById('styleSelect').value);

    }


  } catch (err) {
    alert(err.message);
  }
}

async function markNoShow(categoryId, styleId, dancerId, dancerName) {
  const confirmed = await showModal(`${t('confirm_no_show_1')} "${dancerName}"${t('confirm_no_show_2')}`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting/markNoShow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: Number(getEvent().id),
        category_id: Number(categoryId),
        style_id: Number(styleId),
        dancer_id: Number(dancerId)
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showMessageModal(data.error || t('error_mark_no_show'), t('error_title'));
      return;
    }

    await loadCompetitions(
      document.getElementById('categorySelect').value,
      document.getElementById('styleSelect').value
    );
  } catch (err) {
    showMessageModal(err.message || t('error_mark_no_show'), t('error_title'));
  }
}

async function markDisqualified(categoryId, styleId, dancerId, dancerName) {
  const confirmed = await showModal(`${t('confirm_disqualify_1')} "${dancerName}"${t('confirm_disqualify_2')}`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting/setDesqualified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: Number(getEvent().id),
        category_id: Number(categoryId),
        style_id: Number(styleId),
        dancer_id: Number(dancerId)
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showMessageModal(data.error || t('error_set_disqualified'), t('error_title'));
      return;
    }

    await loadCompetitions(
      document.getElementById('categorySelect').value,
      document.getElementById('styleSelect').value
    );
  } catch (err) {
    showMessageModal(err.message || t('error_set_disqualified'), t('error_title'));
  }
}

function showModal(message) {
    return new Promise((resolve) => {
    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    document.getElementById('deleteModalMessage').textContent = message;
    
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.onclick = () => {
        modal.hide();
        resolve(true);
    };
    
    modal.show();
    });
}

async function loadCategoriesAndStyles() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/competitions/categories-and-styles?event_id=${getEvent().id}`);
    const data = await res.json();
    return data; // array de { category: {...}, styles: [...] }
  } catch (err) {
    console.error('Error loading categories and styles', err);
    return [];
  }
}

function populateCategorySelect(data, categorySelect) {
  categorySelect.innerHTML = `<option selected disabled>${t('select_category')}</option>`;
  data.forEach(item => {
    const option = document.createElement('option');
    option.value = item.category.id;
    option.textContent = item.category.name;
    categorySelect.appendChild(option);
  });
}

function populateStyleSelect(selectedCategoryId, data, styleSelect) {
  const categoryData = data.find(item => item.category.id == selectedCategoryId);
  styleSelect.innerHTML = `<option selected value="">${t('all_styles')}</option>`;
  if (categoryData) {
    categoryData.styles.forEach(style => {
      const option = document.createElement('option');
      option.value = style.id;
      option.textContent = style.name;
      styleSelect.appendChild(option);
    });
    styleSelect.disabled = false;
  } else {
    styleSelect.disabled = true;
  }
}

function formatResultScore(totalScore) {
  if (getEvent().criteriaConfig === 'WITH_POR') {
    return Number(totalScore ?? 0).toFixed(1);
  }
  return totalScore ?? 0;
}

function formatAvgPlace(avgPlace) {
  return avgPlace ?? '';
}

function shouldShowAvgPlaceColumn() {
  return getEvent().totalSystem === 'AVG_POSJUD';
}

function formatPositionCount(positionCount) {
  if (!positionCount || typeof positionCount !== 'object') return '';
  const entries = Object.entries(positionCount)
    .filter(([, count]) => count !== null && count !== undefined && count !== '')
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!entries.length) return '';
  return entries.map(([pos, count]) => `${pos}(${count})`).join(', ');
}

function formatPositionCountKey(positionCount) {
  if (!positionCount || typeof positionCount !== 'object') return '';
  const entries = Object.entries(positionCount)
    .filter(([, count]) => count !== null && count !== undefined && count !== '')
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!entries.length) return '';
  return entries.map(([pos, count]) => `${pos}:${count}`).join('|');
}

function updateResultsPositions(tbody) {
  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.forEach((row, index) => {
    const cell = row.querySelector('td');
    if (!cell) return;
    const positionText = `${index + 1}`;
    if (row.dataset.draggable === 'true') {
      cell.innerHTML = `<i class="bi bi-grip-vertical text-muted me-2 tie-move-icon" aria-hidden="true"></i>${positionText}`;
    } else {
      cell.textContent = positionText;
    }
  });
}

function initResultsTieSorting(bodyEl) {
  if (!getEvent().canDecidePositions || !window.Sortable) return;

  const tbody = bodyEl.querySelector('tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  if (!rows.length) return;

  const usesAvgPosJud = getEvent().totalSystem === 'AVG_POSJUD';
  const getTieKey = (row) => {
    if (usesAvgPosJud) {
      const avgPlace = row.dataset.avgPlace || '';
      const positionCountKey = row.dataset.positionCountKey || '';
      return `${avgPlace}|${positionCountKey}`;
    }
    return row.dataset.score || '';
  };

  const scoreCounts = rows.reduce((acc, row) => {
    const key = getTieKey(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  let hasTies = false;
  rows.forEach(row => {
    const key = getTieKey(row);
    if (scoreCounts[key] > 1) {
      row.dataset.draggable = 'true';
      row.classList.add('results-draggable');
      const firstCell = row.querySelector('td');
      if (firstCell && !firstCell.querySelector('.tie-move-icon')) {
        firstCell.insertAdjacentHTML(
          'afterbegin',
          '<i class="bi bi-grip-vertical text-muted me-2 tie-move-icon" aria-hidden="true"></i>'
        );
      }
      hasTies = true;
    } else {
      row.dataset.draggable = 'false';
    }
  });

  if (!hasTies) return;

  new Sortable(tbody, {
    animation: 150,
    draggable: 'tr[data-draggable="true"]',
    onMove: (evt) => {
      const draggedKey = evt.dragged ? getTieKey(evt.dragged) : '';
      const relatedKey = evt.related ? getTieKey(evt.related) : '';
      if (!draggedKey || !relatedKey) return false;
      return draggedKey === relatedKey;
    },
    onEnd: () => updateResultsPositions(tbody)
  });
}

function buildClassificationFromResultsTable(tbody, resultsData) {
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const byId = new Map();
  if (Array.isArray(resultsData)) {
    resultsData.forEach(item => {
      const key = item?.dancer_id ?? item?.id;
      if (key !== undefined && key !== null) {
        byId.set(String(key), item);
      }
    });
  }

  return rows.map((row, index) => {
    const dancerIdRaw = row.dataset.dancerId;
    const dancerId = dancerIdRaw !== undefined ? String(dancerIdRaw) : null;
    if (dancerId && byId.has(dancerId)) {
      return { ...byId.get(dancerId) };
    }

    const avgPlaceRaw = row.dataset.avgPlace;
    const totalScoreRaw = row.dataset.score;
    return {
      dancer_id: dancerId ? Number(dancerId) : null,
      dancer_name: null,
      dancer_nationality: null,
      total_score: totalScoreRaw !== undefined && totalScoreRaw !== '' ? Number(totalScoreRaw) : null,
      avg_place: avgPlaceRaw !== undefined && avgPlaceRaw !== '' ? Number(avgPlaceRaw) : null
    };
  });
}

async function showResults(categoryId, styleId, status) {
  const modalEl = document.getElementById('resultsModal');
  const bodyEl = document.getElementById('resultsModalBody');
  const modalTitle = document.getElementById('resultsModalLabel');
  const saveClassificationBtn = document.getElementById('saveClassificationBtn');
  const showAvgPlace = shouldShowAvgPlaceColumn();
  const showPositions = showAvgPlace && status === 'FIN';

  modalTitle.textContent = t('view_results');
  if (modalEl) {
    modalEl.dataset.categoryId = categoryId;
    modalEl.dataset.styleId = styleId;
    const dialogEl = modalEl.querySelector('.modal-dialog');
    if (dialogEl) {
      dialogEl.classList.toggle('results-modal-wide', showPositions);
    }
  }
  if (saveClassificationBtn) {
    if (getEvent().canDecidePositions) {
      saveClassificationBtn.classList.remove('d-none');
      saveClassificationBtn.disabled = false;
    } else {
      saveClassificationBtn.classList.add('d-none');
    }
  }
  const provisionalNote = status !== 'FIN'
    ? `
      <div class="alert alert-warning text-center mb-3">
        ${t('results_provisional')}
      </div>
    `
    : '';

  bodyEl.innerHTML = `
    ${provisionalNote}
    <div class="d-flex align-items-center justify-content-center py-4">
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${t('loading')}</span>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  try {
    const url = `${API_BASE_URL}/api/competitions/tracking/results?event_id=${getEvent().id}&category_id=${categoryId}&style_id=${styleId}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Error loading results');
    }

    const results = await res.json();
    if (modalEl) {
      modalEl._resultsData = results;
    }

    if (!results || results.length === 0) {
      bodyEl.innerHTML = `
        <div class="alert alert-info text-center mb-0">
          ${t('no_votes_yet')}
        </div>
      `;
      return;
    }

    const rows = results.map((r, index) => {
      const dancerFlagHtml = getDancerFlagImgHtml(r.dancer_nationality, {
        className: 'me-2',
        style: 'vertical-align: middle;'
      });
      const dancerCell = `
        <div class="d-flex align-items-center gap-2 results-dancer-row">
          <div class="d-flex align-items-center results-dancer-content">
            ${dancerFlagHtml}
            <span class="results-dancer-name">${r.dancer_name}</span>
          </div>
        </div>
      `;
      const scoreValue = formatResultScore(r.total_score);
      const scoreKey = String(scoreValue);
      const avgPlaceText = formatAvgPlace(r.avg_place);
      const positionCountText = formatPositionCount(r.positionCount);
      const positionCountKey = formatPositionCountKey(r.positionCount);
      const dancerId = r.dancer_id ?? r.id ?? '';
      const avgPlaceKey = r.avg_place ?? '';
      return `
        <tr data-score="${scoreKey}" data-dancer-id="${dancerId}" data-avg-place="${avgPlaceKey}" data-position-count-key="${positionCountKey}">
          <td class="fw-semibold">${index + 1}</td>
          <td class="results-dancer-cell">${dancerCell}</td>
          <td class="fw-semibold">${scoreValue}</td>
          ${showPositions ? `<td class="fw-semibold">${positionCountText}</td>` : ''}
          ${showAvgPlace ? `<td class="fw-semibold">${avgPlaceText}</td>` : ''}
        </tr>
      `;
    }).join('');

    bodyEl.innerHTML = `
      ${provisionalNote}
      <div class="table-responsive">
        <table class="table table-bordered align-middle text-center mb-0">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>${t('dancer')}</th>
              <th>${t('total')}</th>
              ${showPositions ? `<th>${t('positions')}</th>` : ''}
              ${showAvgPlace ? `<th>${t('avg_place')}</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    initResultsTieSorting(bodyEl);
  } catch (err) {
    console.error('Error fetching results:', err);
    bodyEl.innerHTML = `
      ${provisionalNote}
      <div class="alert alert-danger text-center mb-0">
        ${t('error_title')}
      </div>
    `;
  }
}

