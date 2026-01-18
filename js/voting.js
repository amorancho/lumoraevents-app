var title = 'Voting';

const allowedRoles = ["admin", "judge"];

let criteriaList = [];

let criteriaColumnsVisible = false;
const CRITERIA_COL_VIS_STORAGE_PREFIX = 'lumora.voting.criteriaColumnsVisible';

let modal, criteriaContainer;
let commentsModal, commentsTextarea, saveCommentsBtn, clearCommentsBtn;
let commentsContext = { competitionId: null, dancerId: null };

const DEFAULT_MIN_SCORE = 1;
const DEFAULT_MAX_SCORE = 10;
const MOBILE_MAX_WIDTH = 768;

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

function generateScoreOptions(scoreType, min = DEFAULT_MIN_SCORE, max = DEFAULT_MAX_SCORE) {
  const normalizedType = (scoreType || 'INT').toUpperCase();
  const step = normalizedType === 'DEC' ? 0.1 : normalizedType === 'MED' ? 0.5 : 1;
  const options = [];
  let current = min;

  while (current <= max + 1e-9) {
    const rounded = normalizedType === 'INT' ? Math.round(current) : Number(current.toFixed(1));
    options.push(rounded);
    current += step;
  }

  return options;
}

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;
  await WaitEventLoaded();

  criteriaColumnsVisible = loadCriteriaColumnsVisibility();

  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const competitionInfo = document.getElementById('competitionInfo');
  const dancersTableContainer = document.getElementById('dancersTableContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const toggleCriteriaBtn = document.getElementById('toggleCriteriaBtn');

  refreshBtn.disabled = true;

  if (toggleCriteriaBtn) {
    toggleCriteriaBtn.addEventListener('click', () => {
      setCriteriaColumnsVisibility(!criteriaColumnsVisible, { persist: true });
    });
  }

  await ensureTranslationsReady();

  const data = await loadCategoriesAndStyles();
  populateCategorySelect(data, categorySelect);
  applyTranslations();

  categorySelect.addEventListener('change', () => {
    populateStyleSelect(categorySelect.value, data, styleSelect);
  });

  styleSelect.addEventListener('change', () => {
    loadCompetitionAndDancers();
    refreshBtn.disabled = false;
  });

  refreshBtn.addEventListener('click', () => {
    styleSelect.dispatchEvent(new Event('change'));
  });

  syncCriteriaToggleButtonState();

  const modalEl = document.getElementById('detailsModal');
  modal = new bootstrap.Modal(modalEl);
  criteriaContainer = document.getElementById('criteriaContainer');

  initCommentsModal();

});

function getCriteriaColumnsVisibilityStorageKey() {
  const eventId = typeof getEvent === 'function' ? (getEvent()?.id ?? 'no_event') : 'no_event';
  const userId = typeof getUserId === 'function' ? (getUserId() ?? 'no_user') : 'no_user';
  return `${CRITERIA_COL_VIS_STORAGE_PREFIX}:${eventId}:${userId}`;
}

function loadCriteriaColumnsVisibility() {
  try {
    const raw = localStorage.getItem(getCriteriaColumnsVisibilityStorageKey());
    if (raw === null) return false;
    return raw === 'true';
  } catch {
    return false;
  }
}

function saveCriteriaColumnsVisibility(visible) {
  try {
    localStorage.setItem(getCriteriaColumnsVisibilityStorageKey(), String(Boolean(visible)));
  } catch {
    // ignore
  }
}

function syncCriteriaToggleButtonState() {
  const toggleCriteriaBtn = document.getElementById('toggleCriteriaBtn');
  if (toggleCriteriaBtn) {
    toggleCriteriaBtn.disabled = !(Array.isArray(criteriaList) && criteriaList.length > 0);
  }
  setCriteriaColumnsVisibility(criteriaColumnsVisible, { persist: false });
  syncCommentsColumnPresentation();
}

function setCriteriaColumnsVisibility(visible, { persist = false } = {}) {
  criteriaColumnsVisible = Boolean(visible);

  const dancersTableContainer = document.getElementById('dancersTableContainer');
  if (dancersTableContainer) {
    dancersTableContainer.classList.toggle('dancers-table-expanded', criteriaColumnsVisible);
    dancersTableContainer.classList.toggle('dancers-table-collapsed', !criteriaColumnsVisible);
  }

  document.querySelectorAll('#dancersTableContainer .criteria-col').forEach(el => {
    el.classList.toggle('d-none', !criteriaColumnsVisible);
  });

  syncCommentsColumnPresentation();

  const toggleCriteriaBtnText = document.getElementById('toggleCriteriaBtnText');
  const toggleCriteriaBtn = document.getElementById('toggleCriteriaBtn');
  const labelKey = criteriaColumnsVisible ? 'hide_scores_table' : 'show_scores_table';
  const fallback = criteriaColumnsVisible ? 'Hide scores' : 'Show scores';
  if (toggleCriteriaBtnText) toggleCriteriaBtnText.textContent = t(labelKey, fallback);
  if (toggleCriteriaBtn) toggleCriteriaBtn.setAttribute('aria-pressed', criteriaColumnsVisible ? 'true' : 'false');

  if (persist) saveCriteriaColumnsVisibility(criteriaColumnsVisible);
}

function syncCommentsColumnPresentation() {
  const commentsLabel = t('comments', 'Comments');

  const commentsHeader = document.querySelector('#dancersTableHeadRow th[data-col="comments"]');
  if (commentsHeader) {
    if (criteriaColumnsVisible) {
      commentsHeader.innerHTML = `<i class="bi bi-chat-dots" title="${commentsLabel}" aria-label="${commentsLabel}"></i>`;
    } else {
      commentsHeader.textContent = commentsLabel;
    }
  }

  document.querySelectorAll('#dancersTableContainer [data-role="comments-btn"]').forEach(btn => {
    const hasComments = btn.dataset.hasComments === 'true';
    if (criteriaColumnsVisible) {
      btn.innerHTML = `<i class="bi ${hasComments ? 'bi-chat-dots-fill' : 'bi-chat-dots'}" aria-hidden="true"></i>`;
      btn.setAttribute('aria-label', commentsLabel);
      btn.setAttribute('title', commentsLabel);
    } else {
      btn.textContent = commentsLabel;
      btn.removeAttribute('title');
      btn.setAttribute('aria-label', commentsLabel);
    }
  });
}

function initCommentsModal() {
  const modalEl = document.getElementById('commentsModal');
  commentsTextarea = document.getElementById('commentsTextarea');
  saveCommentsBtn = document.getElementById('saveCommentsBtn');
  clearCommentsBtn = document.getElementById('clearCommentsBtn');

  if (!modalEl || !commentsTextarea || !saveCommentsBtn || !clearCommentsBtn) return;

  commentsModal = new bootstrap.Modal(modalEl);

  modalEl.addEventListener('hidden.bs.modal', () => {
    commentsTextarea.value = '';
    commentsContext = { competitionId: null, dancerId: null };
    setCommentsButtonsDisabled(false);
  });

  saveCommentsBtn.addEventListener('click', async () => {
    if (!commentsContext.competitionId || !commentsContext.dancerId) return;
    await upsertComments(commentsContext.competitionId, commentsContext.dancerId, commentsTextarea.value);
  });

  clearCommentsBtn.addEventListener('click', async () => {
    if (!commentsContext.competitionId || !commentsContext.dancerId) return;
    await upsertComments(commentsContext.competitionId, commentsContext.dancerId, '');
  });
}

function setCommentsButtonsDisabled(disabled) {
  if (saveCommentsBtn) saveCommentsBtn.disabled = disabled;
  if (clearCommentsBtn) clearCommentsBtn.disabled = disabled;
}

async function upsertComments(competitionId, dancerId, comments) {
  try {
    setCommentsButtonsDisabled(true);

    const res = await fetch(`${API_BASE_URL}/api/competitions/${competitionId}/comments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: getEvent().id,
        judge_id: getUserId(),
        dancer_id: dancerId,
        comments: comments ?? ''
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      showMessageModal(errData.error || 'Error saving comments', 'Error');
      setCommentsButtonsDisabled(false);
      return;
    }

    commentsModal?.hide();
    await loadCompetitionAndDancers();
  } catch (err) {
    console.error('Error saving comments', err);
    showMessageModal('Error saving comments', 'Error');
    setCommentsButtonsDisabled(false);
  }
}

async function loadCompetitionAndDancers() {
  const category = categorySelect.value;
  const style = styleSelect.value;
  if (!category || !style) return;

  const data = await fetchVoting(category, style);
  const loadedCriteria = Array.isArray(data.criteria) ? data.criteria : [];
  criteriaList = loadedCriteria
    .slice()
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  syncCriteriaToggleButtonState();
  renderCompetitionInfo(data.competition);

  // Si data.competition.judge_reserve es true, mostrar texto indicando que es juez reserva
  const judgeReserveInfo = document.getElementById('judgeReserveInfo');
  if (data.competition.judge_reserve) {
    judgeReserveInfo.style.display = 'block';
  } else {
    judgeReserveInfo.style.display = 'none';
  }

  renderDancersTable(data.dancers, data.competition.status);

  competitionInfo.style.display = 'block';
  dancersTableContainer.style.display = 'block';
}

function showVotesModal(dancer, mode = "details") {
  const scoreType = getScoreType();
  const normalizedScoreType = (scoreType || 'INT').toUpperCase();
  const scoreStep = scoreType === 'DEC' ? '0.1' : scoreType === 'MED' ? '0.5' : '1';
  const inputMode = scoreType === 'INT' ? 'numeric' : 'decimal';
  const useMobileLayout = mode !== "vote" || isMobileViewport() || normalizedScoreType === 'DEC';
  const minScore = DEFAULT_MIN_SCORE;
  const maxScore = DEFAULT_MAX_SCORE;
  document.getElementById('detailsModalLabel').textContent =
    mode === "details" ? `${t('votes_for')} ${dancer.name}` : `${t('vote_for')} ${dancer.name}`;

  const dialog = modal._element.querySelector('.modal-dialog');
  dialog.classList.remove('modal-lg', 'modal-xl', 'modal-dialog-scrollable');
  if (!useMobileLayout && mode === "vote") {
    dialog.classList.add('modal-xl', 'modal-dialog-scrollable');
  }

  criteriaContainer.className = useMobileLayout ? 'row g-3 text-center' : 'd-flex flex-column gap-3';
  criteriaContainer.innerHTML = '';

  const getCriteriaInput = (criteriaId) =>
    criteriaContainer.querySelector(`.score-input[data-criteria="${criteriaId}"]`);

  const parseCriteriaPercentage = (criteria) => {
    const rawPercentage = criteria?.percentage;
    if (rawPercentage === undefined || rawPercentage === null || rawPercentage === '') {
      return null;
    }
    const percentageNumber = Number(rawPercentage);
    if (Number.isNaN(percentageNumber)) return null;
    return percentageNumber;
  };

  const hasCriteriaPercentages = () =>
    criteriaList.some(c => parseCriteriaPercentage(c) !== null);

  const formatCriteriaLabel = (criteria) => {
    const percentageNumber = parseCriteriaPercentage(criteria);
    if (percentageNumber === null) return criteria.name;
    return `${criteria.name} (${percentageNumber}%)`;
  };

  const formatTotalScore = (value) => {
    if (value === null || value === undefined) return '';
    if (hasCriteriaPercentages()) {
      return Number.isFinite(value) ? value.toFixed(1) : '';
    }
    return formatScoreForDisplay(value, scoreType);
  };

  const calculateTotalScore = (getScore) => {
    const hasWeights = hasCriteriaPercentages();
    let total = 0;
    let weightSum = 0;

    criteriaList.forEach(c => {
      const score = getScore(c);
      if (score === null || score === undefined) return;

      const percentage = parseCriteriaPercentage(c);
      if (hasWeights && percentage !== null) {
        total += score * percentage;
        weightSum += percentage;
      } else if (!hasWeights) {
        total += score;
      }
    });

    if (hasWeights) {
      if (weightSum <= 0) return 0;
      return total / weightSum;
    }

    return total;
  };

  function refreshTotalScore() {
    const total = calculateTotalScore((criteria) => {
      const input = getCriteriaInput(criteria.id);
      if (!input) return null;
      const normalized = normalizeScoreValue(
        input.value,
        scoreType,
        minScore,
        maxScore,
        { clamp: false }
      );
      return normalized;
    });
    const totalEl = document.getElementById('totalScore');
    if (totalEl) {
      totalEl.textContent = formatTotalScore(total) || '0';
    }
  }

  function renderTotal(initialTotal = 0) {
    const totalCol = document.createElement('div');
    if (useMobileLayout) {
      totalCol.className = 'col-12 mt-3 text-center';
      totalCol.innerHTML = `
        <div class="fw-bold mb-1">Total</div>
        <span id="totalScore" class="badge bg-success fs-4 px-4">${formatTotalScore(initialTotal) || '0'}</span>
      `;
    } else {
      totalCol.className = 'border-top pt-3 text-center';
      totalCol.innerHTML = `
        <div class="fw-bold mb-1">Total</div>
        <span id="totalScore" class="badge bg-success fs-4 px-4">${formatTotalScore(initialTotal) || '0'}</span>
      `;
    }
    criteriaContainer.appendChild(totalCol);
  }

  if (useMobileLayout) {
    criteriaList.forEach(c => {
      const value = dancer.scores?.[c.name] ?? '-';
      const criteriaLabel = formatCriteriaLabel(c);
      const col = document.createElement('div');
      col.className = 'col-6 text-center';

      if (mode === "details") {
        // Solo lectura
        const formattedValue = typeof value === 'number' ? formatScoreForDisplay(value, scoreType) : value;
        col.innerHTML = `
        <div class="mb-1 fw-semibold">${criteriaLabel}</div>
        <span class="badge bg-info fs-5">${formattedValue}</span>
      `;
      } else {
        // Modo edicion
        const currentVal = typeof value === 'number' ? formatScoreForDisplay(value, scoreType) : '';
        col.innerHTML = `
        <div class="mb-1 fw-semibold">${criteriaLabel}</div>
        <input type="number" inputmode="${inputMode}" class="form-control form-control-lg score-input"
               data-criteria="${c.id}" data-score-type="${scoreType}" step="${scoreStep}" value="${currentVal}">
      `;
      }

      criteriaContainer.appendChild(col);

    });

    const total = calculateTotalScore((criteria) => {
      const rawValue = dancer.scores?.[criteria.name];
      return typeof rawValue === 'number' ? rawValue : rawValue == null ? null : Number(rawValue);
    });
    renderTotal(total);
  } else {
    const options = generateScoreOptions(scoreType, minScore, maxScore);

    criteriaList.forEach(c => {
      const value = dancer.scores?.[c.name];
      const row = document.createElement('div');
      row.className = 'row align-items-center';

      const labelCol = document.createElement('div');
      labelCol.className = 'col-12 col-md-3 mb-2 mb-md-0 fw-semibold text-md-end';
      labelCol.textContent = formatCriteriaLabel(c);
      row.appendChild(labelCol);

      const controlCol = document.createElement('div');
      controlCol.className = 'col-12 col-md-9';
      const currentVal = typeof value === 'number' ? formatScoreForDisplay(value, scoreType) : '';

      const useButtons = options.length <= 12 || normalizedScoreType === 'MED';
      if (useButtons) {
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.className = 'score-input';
        hiddenInput.dataset.criteria = c.id;
        hiddenInput.dataset.scoreType = scoreType;
        hiddenInput.dataset.min = minScore;
        hiddenInput.dataset.max = maxScore;
        if (currentVal) hiddenInput.value = currentVal;

        const btnGroup = document.createElement('div');
        btnGroup.className = 'd-flex flex-wrap w-100 gap-2';

        options.forEach(opt => {
          const btnId = `criteria-${c.id}-${String(opt).replace('.', '-')}`;
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.className = 'btn-check';
          radio.name = `criteria-${c.id}`;
          radio.id = btnId;
          radio.value = formatScoreForDisplay(opt, scoreType);

          const label = document.createElement('label');
          const isHalfStep = normalizedScoreType === 'MED' && !Number.isInteger(opt);
          const sizeClass = normalizedScoreType === 'INT' ? 'btn-lg' : 'btn-sm';
          const colorClass = isHalfStep ? 'btn-outline-warning' : 'btn-outline-primary';
          label.className = `btn ${colorClass} ${sizeClass} flex-fill`;
          label.setAttribute('for', btnId);
          label.textContent = formatScoreForDisplay(opt, scoreType);

          if (currentVal && radio.value === currentVal) {
            radio.checked = true;
            hiddenInput.value = currentVal;
          }

          radio.addEventListener('change', () => {
            hiddenInput.value = radio.value;
            refreshTotalScore();
          });

          btnGroup.appendChild(radio);
          btnGroup.appendChild(label);
        });

        controlCol.appendChild(hiddenInput);
        controlCol.appendChild(btnGroup);
      } else {
        const select = document.createElement('select');
        select.className = 'form-select score-input';
        select.dataset.criteria = c.id;
        select.dataset.scoreType = scoreType;
        select.dataset.min = minScore;
        select.dataset.max = maxScore;

        const placeholder = t('select_score', t('select', '--'));
        select.innerHTML = `<option value="">${placeholder}</option>`;
        options.forEach(opt => {
          const optEl = document.createElement('option');
          const formatted = formatScoreForDisplay(opt, scoreType);
          optEl.value = formatted;
          optEl.textContent = formatted;
          select.appendChild(optEl);
        });

        if (currentVal) select.value = currentVal;
        select.addEventListener('change', refreshTotalScore);
        controlCol.appendChild(select);
      }

      row.appendChild(controlCol);
      criteriaContainer.appendChild(row);
    });

    renderTotal(0);
  }

  // Footer - limpiar primero
  const footer = modal._element.querySelector('.modal-footer');
  footer.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">${t('close')}</button>`;

  if (mode === "vote") {

    const collectScores = () => {
      const scores = [];
      let allFilled = true;
      const outOfRange = [];

      criteriaList.forEach(c => {
        const input = getCriteriaInput(c.id);
        if (!input) return;
        const normalizedScore = normalizeScoreValue(
          input.value,
          scoreType,
          minScore,
          maxScore,
          { clamp: false }
        );

        if (normalizedScore === null) {
          allFilled = false;
        } else if (!isScoreInRange(normalizedScore, minScore, maxScore)) {
          outOfRange.push(c.name);
        } else {
          if (input.tagName === 'INPUT' && input.type === 'number') {
            input.value = formatScoreForDisplay(normalizedScore, scoreType);
          } else if (input.tagName === 'SELECT') {
            input.value = formatScoreForDisplay(normalizedScore, scoreType);
          } else {
            input.value = normalizedScore.toString();
          }
          scores.push({
            criteria_id: Number(c.id),
            score: normalizedScore
          });
        }
      });

      return { scores, allFilled, outOfRange };
    };

    const setVoteAlert = (message) => {
      let alertDiv = document.getElementById("voteErrorAlert");
      if (!alertDiv) {
        alertDiv = document.createElement("div");
        alertDiv.id = "voteErrorAlert";
        alertDiv.className = "alert alert-danger alert-dismissible fade show mt-3";
        alertDiv.role = "alert";
        criteriaContainer.appendChild(alertDiv);
      }
      alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      `;
    };

    const sendBtn = document.createElement('button');
    sendBtn.className = "btn btn-primary btn-sm";
    sendBtn.textContent = t('send_votes');
  
    const noShowBtn = document.createElement('button');
    noShowBtn.className = "btn btn-warning btn-sm me-auto";
    noShowBtn.textContent = t('no_show');
  
    // --- funcion auxiliar para enviar votos ---
    async function sendVotes(scores) {
      try {
        setVoteButtonsDisabled(true);
        const originalContent = sendBtn.innerHTML;
        sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${t('sending')}`;    
        sendBtn.disabled = true;
        noShowBtn.disabled = true;
  
        const response = await fetch(`${API_BASE_URL}/api/voting`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: getEvent().id,
            competition_id: dancer.competition_id,
            judge_id: getUserId(),
            dancer_id: dancer.id,
            scores: scores
          })
        });
  
        if (!response.ok) {
          const errData = await response.json();
          showMessageModal(errData.error || 'Error sending votes', 'Error');
          setVoteButtonsDisabled(false);
          sendBtn.disabled = false;
          noShowBtn.disabled = false;
          sendBtn.innerHTML = originalContent;
          return;
        }
  
        await loadCompetitionAndDancers();
        modal.hide();
  
      } catch (err) {
        console.error("Error sending votes", err);
        alert("Error sending votes");
        sendBtn.innerHTML = originalContent;
      }
    }
  
    // --- modal de confirmacion (solo se crea si no existe aun) ---
    if (!document.getElementById("outlierConfirmModal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="outlierConfirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${t('confirm', 'Confirm')}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <p id="outlierConfirmMessage">${t('confirm_outlier_scores')}</p>
                <p id="outlierConfirmList" class="mb-0 fw-semibold"></p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${t('cancel')}</button>
                <button type="button" class="btn btn-primary" id="confirmOutlierBtn">${t('confirm')}</button>
              </div>
            </div>
          </div>
        </div>
      `);
    }

    const outlierModal = new bootstrap.Modal(document.getElementById("outlierConfirmModal"));
    const confirmOutlierBtn = document.getElementById("confirmOutlierBtn");
    const outlierMessageEl = document.getElementById("outlierConfirmMessage");
    const outlierListEl = document.getElementById("outlierConfirmList");

    // --- boton normal: enviar votos manuales ---
    sendBtn.addEventListener('click', async () => {
      const { scores, allFilled, outOfRange } = collectScores();
  
      if (!allFilled) {
        setVoteAlert(t('alert_criteria'));
        return;
      }

      if (outOfRange.length > 0) {
        const message = t(
          'alert_criteria_range',
          `Las puntuaciones deben estar entre ${minScore} y ${maxScore}.`
        );
        setVoteAlert(message);
        return;
      }
  
      const existingAlert = document.getElementById("voteErrorAlert");
      if (existingAlert) existingAlert.remove();

      // Analizamos si algun valor esta lejos de la media (por ejemplo, si la media es 8 y se pone un 2)
      const scoreValues = scores.map(s => s.score);
      const avg = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
      const threshold = 3; // umbral de desviacion
      const outliers = scores.filter(s => Math.abs(s.score - avg) >= threshold);

      if (outliers.length > 0) {
        let outlierNames = outliers.map(o => {
          const crit = criteriaList.find(c => c.id === o.criteria_id);
          return crit ? crit.name : 'Unknown';
        }).join(', ');

        if (outlierMessageEl) {
          outlierMessageEl.textContent = t('confirm_outlier_scores');
        }
        if (outlierListEl) {
          outlierListEl.textContent = outlierNames;
        }
        confirmOutlierBtn.onclick = async () => {
          outlierModal.hide();
          await sendVotes(scores);
        };
        outlierModal.show();
        return;
      }
  
      await sendVotes(scores);
    });
  
    // --- modal de confirmacion (solo se crea si no existe aun) ---
    if (!document.getElementById("noShowConfirmModal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="noShowConfirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${t('confirm_no_show_title')}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <p>${t('confirm_no_show_text')}</p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${t('cancel')}</button>
                <button type="button" class="btn btn-danger" id="confirmNoShowBtn">${t('confirm')}</button>
              </div>
            </div>
          </div>
        </div>
      `);
    }
  
    const noShowModal = new bootstrap.Modal(document.getElementById("noShowConfirmModal"));
    const confirmNoShowBtn = document.getElementById("confirmNoShowBtn");
  
    // --- boton no show ---
    noShowBtn.addEventListener('click', () => {
      // abrir modal de confirmacion
      noShowModal.show();
  
      // asignar listener temporal para este bailarin
      confirmNoShowBtn.onclick = async () => {
        noShowModal.hide();
  
        const scores = criteriaList.map(c => ({
          criteria_id: c.id,
          score: 0
        }));
  
        await sendVotes(scores);
      };
    });
  
    // Anadir botones al footer
    footer.prepend(noShowBtn);  // a la izquierda
    footer.appendChild(sendBtn); // los actuales permanecen a la derecha
  
    // --- recalcular total al cambiar inputs ---
    criteriaContainer.querySelectorAll('input[type="number"].score-input').forEach(input => {
      input.addEventListener('input', refreshTotalScore);

      input.addEventListener('blur', () => {
        const normalized = normalizeScoreValue(
          input.value,
          scoreType,
          minScore,
          maxScore,
          { clamp: false }
        );
        if (normalized !== null) {
          input.value = formatScoreForDisplay(normalized, scoreType);
        }
        refreshTotalScore();
      });
    });

    refreshTotalScore();
  }  


  modal.show();
}
function setVoteButtonsDisabled(disabled) {
  document.querySelectorAll('button.btn-primary').forEach(btn => {
    if (btn.textContent.trim() === t('vote')) {
      btn.disabled = disabled;
    }
  });
}


async function fetchVoting(category, style) {
  try {
    const userId = getUserId();
    const res = await fetch(`${API_BASE_URL}/api/voting?event_id=${getEvent().id}&judge=${userId}&category=${category}&style=${style}`);
    return await res.json();
  } catch (err) {
    console.error('Error loading dancers', err);
    return { dancers: [] };
  }
}

function renderDancersTable(dancers, compStatus) {
  renderDancersTableHeader();
  dancersTableBody.innerHTML = ''; // limpiar
  syncCriteriaToggleButtonState();

  dancers.forEach(d => {
    const tr = document.createElement('tr');

    // Columna Dancer (bandera + nombre + orden)
    const tdDancer = document.createElement('td');
    tdDancer.innerHTML = `
      <div class="d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center">
          <img src="https://flagsapi.com/${d.nationality}/shiny/24.png" 
               class="me-2" style="vertical-align: middle;">
          <span>${d.name}</span>
        </div>
        <span class="badge bg-info">#${d.position}</span>
      </div>
    `;
    tr.appendChild(tdDancer);

    // Columna Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'text-center';
    tdStatus.innerHTML = `
      <span class="badge 
        ${d.status === 'Pending'
          ? 'bg-warning'
          : d.status === 'Incompatible'
            ? 'bg-danger'
            : d.status === 'Max Judges Voted'
              ? 'bg-danger'
              : d.status === 'No Show'
                ? 'bg-noshown'
                : d.status === 'Not Applicable'
                  ? 'bg-secondary'
                  : 'bg-success'}">
        ${d.status}
      </span>
    `;
    tr.appendChild(tdStatus);

    // Columna Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'text-center';

    if (d.status === 'Completed') {
      const btnDetails = document.createElement('button');
      btnDetails.className = 'btn btn-sm btn-secondary';
      btnDetails.textContent = t('details');
      btnDetails.addEventListener('click', () => showVotesModal(d, "details"));
      tdActions.appendChild(btnDetails);
    } else if (d.status === 'Pending' && compStatus === 'OPE') {
      const btnVote = document.createElement('button');
      btnVote.className = 'btn btn-sm btn-primary';
      btnVote.textContent = t('vote');
      btnVote.addEventListener('click', () => showVotesModal(d, "vote"));
      tdActions.appendChild(btnVote);
    }

    tr.appendChild(tdActions);

    // Columna Comments (última)
    const tdComments = document.createElement('td');
    tdComments.className = 'text-center';

    const hasComments = typeof d.comments === 'string' && d.comments.trim().length > 0;
    if (d.status === 'Completed') {
      const btnComments = document.createElement('button');
      btnComments.className = `btn btn-sm ${hasComments ? 'btn-comments' : 'btn-outline-comments'}`;
      btnComments.dataset.role = 'comments-btn';
      btnComments.dataset.hasComments = hasComments ? 'true' : 'false';
      btnComments.textContent = t('comments', 'Comments');
      btnComments.addEventListener('click', () => {
        if (!commentsModal) return;
        commentsContext = { competitionId: d.competition_id, dancerId: d.id };
        commentsTextarea.value = d.comments || '';
        commentsModal.show();
      });
      tdComments.appendChild(btnComments);
    } else {
      tdComments.textContent = '-';
    }

    tr.appendChild(tdComments);

    const scoreType = getScoreType();

    criteriaList.forEach(c => {
      const tdCriteria = document.createElement('td');
      tdCriteria.className = 'text-center small criteria-col';
      tdCriteria.dataset.criteriaId = c.id;

      const rawScore = d?.scores?.[c.name];
      const scoreNumber = typeof rawScore === 'number' ? rawScore : rawScore == null ? null : Number(rawScore);
      tdCriteria.textContent =
        scoreNumber === null || Number.isNaN(scoreNumber)
          ? '-'
          : (formatScoreForDisplay(scoreNumber, scoreType) || '-');

      tr.appendChild(tdCriteria);
    });

    const tdTotal = document.createElement('td');
    tdTotal.className = 'text-center fw-semibold criteria-col';
    const totalNumber = typeof d.totalScore === 'number' ? d.totalScore : d.totalScore == null ? null : Number(d.totalScore);
    tdTotal.textContent =
      totalNumber === null || Number.isNaN(totalNumber)
        ? '-'
        : (formatScoreForDisplay(totalNumber, scoreType) || '-');
    tr.appendChild(tdTotal);

    dancersTableBody.appendChild(tr);
  });

  setCriteriaColumnsVisibility(criteriaColumnsVisible, { persist: false });
}

function renderDancersTableHeader() {
  const headRow = document.getElementById('dancersTableHeadRow');
  if (!headRow) return;

  const th = (text, className = '') => {
    const el = document.createElement('th');
    el.scope = 'col';
    if (className) el.className = className;
    el.textContent = text;
    return el;
  };

  headRow.innerHTML = '';
  headRow.appendChild(th(t('col_dancer', 'Dancer')));

  headRow.appendChild(th(t('col_status', 'Status'), 'text-center'));
  headRow.appendChild(th(t('col_action', 'Action'), 'text-center'));
  {
    const el = th(t('comments', 'Comments'), 'text-center');
    el.dataset.col = 'comments';
    headRow.appendChild(el);
  }

  criteriaList.forEach(c => {
    const el = document.createElement('th');
    el.scope = 'col';
    el.className = 'text-center small criteria-col';
    el.dataset.criteriaId = c.id;

    const label = document.createElement('span');
    label.className = 'criteria-header-text';
    label.title = c.name;
    label.textContent = c.name;
    el.appendChild(label);
    headRow.appendChild(el);
  });

  {
    const el = document.createElement('th');
    el.scope = 'col';
    el.className = 'text-center criteria-col';
    const label = document.createElement('span');
    label.className = 'criteria-header-text';
    label.title = t('total', 'Total');
    label.textContent = t('total', 'Total');
    el.appendChild(label);
    headRow.appendChild(el);
  }
}


function getUserId() {
  const token = getToken();
  const payload = parseJwt(token);
  const userId = payload?.id || null;

  return userId;
}

async function loadCategoriesAndStyles() {
  try {
    const judgeId = getUserId();
    const res = await fetch(`${API_BASE_URL}/api/competitions/categories-and-styles?event_id=${getEvent().id}&judge_id=${judgeId}`);
    const data = await res.json();
    return data; // array de { category: {...}, styles: [...] }
  } catch (err) {
    console.error('Error loading categories and styles', err);
    return [];
  }
}

function populateCategorySelect(data, categorySelect) {
  categorySelect.innerHTML = '<option selected disabled data-i18n="select_category">Select a category</option>';
  data.forEach(item => {
    const option = document.createElement('option');
    option.value = item.category.id;
    option.textContent = item.category.name;
    categorySelect.appendChild(option);
  });
}

function populateStyleSelect(selectedCategoryId, data, styleSelect) {
  const categoryData = data.find(item => item.category.id == selectedCategoryId);
  styleSelect.innerHTML = '<option selected disabled data-i18n="select_style">Select a style</option>';
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
  applyTranslations();
}

function getScoreType() {
  const eventData = typeof getEvent === 'function' ? getEvent() : null;
  const type = eventData?.score_type;
  return type ? type.toUpperCase() : 'INT';
}

function normalizeScoreValue(rawValue, scoreType, min = 1, max = 10, { clamp = true } = {}) {
  if (rawValue === undefined || rawValue === null) return null;
  const normalizedType = (scoreType || 'INT').toUpperCase();
  const stringValue = String(rawValue).replace(',', '.').trim();
  if (stringValue === '') return null;
  const numericValue = Number(stringValue);
  if (Number.isNaN(numericValue)) return null;

  let value = numericValue;
  if (clamp) {
    if (typeof min === 'number') value = Math.max(value, min);
    if (typeof max === 'number') value = Math.min(value, max);
  }

  switch (normalizedType) {
    case 'DEC':
      return Number((Math.round(value * 10) / 10).toFixed(1));
    case 'MED':
      return Number((Math.round(value * 2) / 2).toFixed(1));
    default:
      return Math.round(value);
  }
}

function isScoreInRange(value, min = 1, max = 10) {
  if (typeof value !== 'number' || Number.isNaN(value)) return false;
  if (typeof min === 'number' && value < min) return false;
  if (typeof max === 'number' && value > max) return false;
  return true;
}

function formatScoreForDisplay(value, scoreType) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  
  const eventData = typeof getEvent === 'function' ? getEvent() : null;
  const criteriaConfig = eventData?.criteriaConfig;
  const isWeighted = criteriaConfig === 'WITH_POR';
  const normalizedType = (isWeighted ? 'DEC' : (scoreType || 'INT')).toUpperCase();

  switch (normalizedType) {
    case 'DEC':
      return (Math.round(value * 10) / 10).toFixed(1);
    case 'MED': {
      const normalized = Math.round(value * 2) / 2;
      return Number.isInteger(normalized) ? normalized.toString() : normalized.toFixed(1);
    }
    default:
      return Math.round(value).toString();
  }
}

function renderCompetitionInfo(competition) {
  if (!competition) return;

  // Categoría y estilo
  document.getElementById('compCategory').innerHTML = `<span class="badge bg-secondary">${competition.category_name}</span>`;
  document.getElementById('compStyle').innerHTML = `<span class="badge bg-secondary">${competition.style_name}</span>`;

  // Hora estimada
  document.getElementById('compTime').innerHTML = competition.estimated_start_form || '<span class="badge bg-dark">NOT DEFINED</span>';

  // Estado
  let statusClass = 'bg-secondary';
  let statusText;
  switch (competition.status) {
    case 'OPE':
      statusClass = 'bg-warning';
      statusText = 'OPEN';
      break;
    case 'CLO':
      statusClass = 'bg-danger';
      statusText = 'CLOSED';
      break;
    case 'FIN':
      statusClass = 'bg-success';
      statusText = 'FINISHED';
      break;
  }
  document.getElementById('compStatus').innerHTML = `<span class="badge ${statusClass}">${statusText}</span>`;

  // Número de jueces
  document.getElementById('compNumJudges').innerHTML = 
    `<p>
      <span class="badge bg-primary">${competition.judge_number}</span>
      <span class="mx-1">/</span>
      <span class="badge bg-warning"
                          data-bs-toggle="tooltip"
                          data-bs-placement="top"
                          title="Jueces reserva">
                      ${competition.judge_number_reserve}
                    </span>
    </p>`;

  // Número de bailarinas
  document.getElementById('compDancers').innerHTML = `<span class="badge bg-primary">${competition.num_dancers}</span>`;
  document.getElementById('compDancersPend').innerHTML = `<span class="badge bg-warning">${competition.dancersPending}</span>`;

  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  tooltipTriggerList.map(el => new bootstrap.Tooltip(el));
}

