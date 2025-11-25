var title = 'Voting';

const allowedRoles = ["admin", "judge"];

let criteriaList = [];

let modal, criteriaContainer;

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;
  await WaitEventLoaded();

  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const competitionInfo = document.getElementById('competitionInfo');
  const dancersTableContainer = document.getElementById('dancersTableContainer');
  const refreshBtn = document.getElementById('refreshBtn');

  refreshBtn.disabled = true;

  const data = await loadCategoriesAndStyles();
  populateCategorySelect(data, categorySelect);

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

  await loadCriteria();

  const modalEl = document.getElementById('detailsModal');
  modal = new bootstrap.Modal(modalEl);
  criteriaContainer = document.getElementById('criteriaContainer');
});

async function loadCompetitionAndDancers() {
  const category = categorySelect.value;
  const style = styleSelect.value;
  if (!category || !style) return;

  const data = await fetchVoting(category, style);
  renderCompetitionInfo(data.competition);
  renderDancersTable(data.dancers, data.competition.status);

  competitionInfo.style.display = 'block';
  dancersTableContainer.style.display = 'block';
}

function showVotesModal(dancer, mode = "details") {
  const scoreType = getScoreType();
  const scoreStep = scoreType === 'DEC' ? '0.1' : scoreType === 'MED' ? '0.5' : '1';
  const inputMode = scoreType === 'INT' ? 'numeric' : 'decimal';
  document.getElementById('detailsModalLabel').textContent =
    mode === "details" ? `${translations["votes_for"]} ${dancer.name}` : `${translations["vote_for"]} ${dancer.name}`;

  criteriaContainer.innerHTML = '';

  let total = 0;

  criteriaList.forEach(c => {
    const value = dancer.scores?.[c.name] ?? '-';
    const col = document.createElement('div');
    col.className = 'col-6 text-center';

    if (mode === "details") {
      // Solo lectura
      if (typeof value === 'number') total += value;
      const formattedValue = typeof value === 'number' ? formatScoreForDisplay(value, scoreType) : value;
      col.innerHTML = `
        <div class="mb-1 fw-semibold">${c.name}</div>
        <span class="badge bg-info fs-5">${formattedValue}</span>
      `;
    } else {
      // Modo edición
      const currentVal = typeof value === 'number' ? formatScoreForDisplay(value, scoreType) : '';
      col.innerHTML = `
        <div class="mb-1 fw-semibold">${c.name}</div>
        <input type="number" inputmode="${inputMode}" class="form-control form-control-lg score-input"
               data-criteria="${c.id}" data-score-type="${scoreType}" min="1" max="10" step="${scoreStep}" value="${currentVal}">
      `;
    }

    criteriaContainer.appendChild(col);

  });

  // Total
  const totalCol = document.createElement('div');
  totalCol.className = 'col-12 mt-3 text-center';
  const formattedTotal = formatScoreForDisplay(total, scoreType) || '0';
  totalCol.innerHTML = `
    <div class="fw-bold mb-1">Total</div>
    <span id="totalScore" class="badge bg-success fs-4 px-4">${formattedTotal}</span>
  `;
  criteriaContainer.appendChild(totalCol);

  // Footer → limpiar primero
  const footer = modal._element.querySelector('.modal-footer');
  footer.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">${translations["close"]}</button>`;

  if (mode === "vote") {

    const refreshTotalScore = () => {
      let sum = 0;
      criteriaContainer.querySelectorAll('.score-input').forEach(inp => {
        const normalized = normalizeScoreValue(
          inp.value,
          scoreType,
          Number(inp.min),
          Number(inp.max)
        );
        if (normalized !== null) sum += normalized;
      });
      const totalEl = document.getElementById('totalScore');
      if (totalEl) {
        totalEl.textContent = formatScoreForDisplay(sum, scoreType) || '0';
      }
    };

    const sendBtn = document.createElement('button');
    sendBtn.className = "btn btn-primary btn-sm";
    sendBtn.textContent = translations["send_votes"];
  
    const noShowBtn = document.createElement('button');
    noShowBtn.className = "btn btn-warning btn-sm me-auto";
    noShowBtn.textContent = translations["no_show"];
  
    // --- función auxiliar para enviar votos ---
    async function sendVotes(scores) {
      try {
        setVoteButtonsDisabled(true);
        const originalContent = sendBtn.innerHTML;
        sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${translations["sending"]}`;    
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
  
    // --- botón normal: enviar votos manuales ---
    sendBtn.addEventListener('click', async () => {
      const scores = [];
      let allFilled = true;
  
      criteriaContainer.querySelectorAll('.score-input').forEach(input => {
        const normalizedScore = normalizeScoreValue(
          input.value,
          scoreType,
          Number(input.min),
          Number(input.max)
        );

        if (normalizedScore === null) {
          allFilled = false;
        } else {
          input.value = formatScoreForDisplay(normalizedScore, scoreType);
          scores.push({
            criteria_id: Number(input.dataset.criteria),
            score: normalizedScore
          });
        }
      });
  
      if (!allFilled) {
        if (!document.getElementById("voteErrorAlert")) {
          const alertDiv = document.createElement("div");
          alertDiv.id = "voteErrorAlert";
          alertDiv.className = "alert alert-danger alert-dismissible fade show mt-3";
          alertDiv.role = "alert";
          alertDiv.innerHTML = `
            ${translations["alert_criteria"]}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
          `;
          criteriaContainer.appendChild(alertDiv);
        }
        return;
      }
  
      const existingAlert = document.getElementById("voteErrorAlert");
      if (existingAlert) existingAlert.remove();

      // Analizamos si algún valor está lejos de la media (por ejemplo, si la media es 8 y se pone un 2)
      const scoreValues = scores.map(s => s.score);
      const avg = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
      const threshold = 3; // umbral de desviación
      const outliers = scores.filter(s => Math.abs(s.score - avg) >= threshold);

      if (outliers.length > 0) {
        let outlierNames = outliers.map(o => {
          const crit = criteriaList.find(c => c.id === o.criteria_id);
          return crit ? crit.name : 'Unknown';
        }).join(', ');

        if (!confirm(`${translations["confirm_outlier_scores"]}\n\n${outlierNames}`)) {
          return; // cancelar envío
        }
      }
  
      await sendVotes(scores);
    });
  
    // --- modal de confirmación (solo se crea si no existe aún) ---
    if (!document.getElementById("noShowConfirmModal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="noShowConfirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">${translations["confirm_no_show_title"]}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <p>${translations["confirm_no_show_text"]}</p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${translations["cancel"]}</button>
                <button type="button" class="btn btn-danger" id="confirmNoShowBtn">${translations["confirm"]}</button>
              </div>
            </div>
          </div>
        </div>
      `);
    }
  
    const noShowModal = new bootstrap.Modal(document.getElementById("noShowConfirmModal"));
    const confirmNoShowBtn = document.getElementById("confirmNoShowBtn");
  
    // --- botón no show ---
    noShowBtn.addEventListener('click', () => {
      // abrir modal de confirmación
      noShowModal.show();
  
      // asignar listener temporal para este bailarín
      confirmNoShowBtn.onclick = async () => {
        noShowModal.hide();
  
        const scores = criteriaList.map(c => ({
          criteria_id: c.id,
          score: 0
        }));
  
        await sendVotes(scores);
      };
    });
  
    // Añadir botones al footer
    footer.prepend(noShowBtn);  // a la izquierda
    footer.appendChild(sendBtn); // los actuales permanecen a la derecha
  
    // --- recalcular total al cambiar inputs ---
    criteriaContainer.querySelectorAll('.score-input').forEach(input => {
      input.addEventListener('input', () => {
        const min = Number(input.min);
        const max = Number(input.max);
        const val = Number(input.value);

        if (!Number.isNaN(val)) {
          if (val < min) input.value = formatScoreForDisplay(min, scoreType);
          if (val > max) input.value = formatScoreForDisplay(max, scoreType);
        }

        refreshTotalScore();
      });

      input.addEventListener('blur', () => {
        const normalized = normalizeScoreValue(
          input.value,
          scoreType,
          Number(input.min),
          Number(input.max)
        );
        if (normalized !== null) {
          input.value = formatScoreForDisplay(normalized, scoreType);
        }
        refreshTotalScore();
      });
    });
  }  


  modal.show();
}

function setVoteButtonsDisabled(disabled) {
  document.querySelectorAll('button.btn-primary').forEach(btn => {
    if (btn.textContent.trim() === translations["vote"]) {
      btn.disabled = disabled;
    }
  });
}


async function loadCriteria() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/criteria?event_id=${getEvent().id}`);
    criteriaList = await res.json();
  } catch (err) {
    console.error('Error loading criteria', err);
  }
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
  dancersTableBody.innerHTML = ''; // limpiar

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
      btnDetails.textContent = translations['details'];
      btnDetails.addEventListener('click', () => showVotesModal(d, "details"));
      tdActions.appendChild(btnDetails);
    } else if (d.status === 'Pending' && compStatus === 'OPE') {
      const btnVote = document.createElement('button');
      btnVote.className = 'btn btn-sm btn-primary';
      btnVote.textContent = translations['vote'];
      btnVote.addEventListener('click', () => showVotesModal(d, "vote"));
      tdActions.appendChild(btnVote);
    }

    tr.appendChild(tdActions);

    dancersTableBody.appendChild(tr);
  });
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
}

function getScoreType() {
  const eventData = typeof getEvent === 'function' ? getEvent() : null;
  const type = eventData?.score_type;
  return type ? type.toUpperCase() : 'INT';
}

function normalizeScoreValue(rawValue, scoreType, min = 1, max = 10) {
  if (rawValue === undefined || rawValue === null) return null;
  const normalizedType = (scoreType || 'INT').toUpperCase();
  const stringValue = String(rawValue).replace(',', '.').trim();
  if (stringValue === '') return null;
  const numericValue = Number(stringValue);
  if (Number.isNaN(numericValue)) return null;

  let value = numericValue;
  if (typeof min === 'number') value = Math.max(value, min);
  if (typeof max === 'number') value = Math.min(value, max);

  switch (normalizedType) {
    case 'DEC':
      return Number((Math.round(value * 10) / 10).toFixed(1));
    case 'MED':
      return Number((Math.round(value * 2) / 2).toFixed(1));
    default:
      return Math.round(value);
  }
}

function formatScoreForDisplay(value, scoreType) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  const normalizedType = (scoreType || 'INT').toUpperCase();

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
  document.getElementById('compTime').textContent = competition.estimated_start_form;

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
  document.getElementById('compNumJudges').innerHTML = `<span class="badge bg-primary">${competition.judge_number}</span>`;

  // Número de bailarinas
  document.getElementById('compDancers').innerHTML = `<span class="badge bg-primary">${competition.num_dancers}</span>`;
  document.getElementById('compDancersPend').innerHTML = `<span class="badge bg-warning">${competition.dancersPending}</span>`;
}
