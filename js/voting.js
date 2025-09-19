var title = 'Voting';

const allowedRoles = ["admin", "organizer", "judge"];

let criteriaList = [];

let modal, criteriaContainer;

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  await eventReadyPromise;

  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const getDancersBtn = document.getElementById('getDancersBtn');
  const competitionInfo = document.getElementById('competitionInfo');
  const dancersTableContainer = document.getElementById('dancersTableContainer');

  const data = await loadCategoriesAndStyles();
  populateCategorySelect(data, categorySelect);

  categorySelect.addEventListener('change', () => {
    populateStyleSelect(categorySelect.value, data, styleSelect);
    getDancersBtn.disabled = true; // habilitar solo cuando haya estilo seleccionado
  });

  styleSelect.addEventListener('change', () => {
    getDancersBtn.disabled = false;
  });

  await loadCriteria();

  getDancersBtn.addEventListener('click', async () => {
    const category = categorySelect.value;
    const style = styleSelect.value;
    if (!category || !style) return;

    const data = await fetchVoting(category, style);
    renderCompetitionInfo(data.competition);
    renderDancersTable(data.dancers);

    competitionInfo.style.display = 'block';
    dancersTableContainer.style.display = 'block';
  });

  const modalEl = document.getElementById('detailsModal');
  modal = new bootstrap.Modal(modalEl);
  criteriaContainer = document.getElementById('criteriaContainer');
});

function showVotesModal(dancer, mode = "details") {
  document.getElementById('detailsModalLabel').textContent =
    mode === "details" ? `Votes for ${dancer.name}` : `Vote for ${dancer.name}`;

  criteriaContainer.innerHTML = '';

  let total = 0;

  criteriaList.forEach(c => {
    const value = dancer.scores?.[c.name] ?? '-';
    const col = document.createElement('div');
    col.className = 'col-6 text-center';

    if (mode === "details") {
      // Solo lectura
      if (typeof value === 'number') total += value;
      col.innerHTML = `
        <div class="mb-1 fw-semibold">${c.name}</div>
        <span class="badge bg-info fs-5">${value}</span>
      `;
    } else {
      // Modo edición
      const currentVal = typeof value === 'number' ? value : '';
      col.innerHTML = `
        <div class="mb-1 fw-semibold">${c.name}</div>
        <input type="number" class="form-control form-control-sm score-input"
               data-criteria="${c.id}" min="0" max="10" step="1" value="${currentVal}">
      `;
    }

    criteriaContainer.appendChild(col);
  });

  // Total
  const totalCol = document.createElement('div');
  totalCol.className = 'col-12 mt-3 text-center';
  totalCol.innerHTML = `
    <div class="fw-bold mb-1">Total</div>
    <span id="totalScore" class="badge bg-success fs-4 px-4">${total}</span>
  `;
  criteriaContainer.appendChild(totalCol);

  // Footer → limpiar primero
  const footer = modal._element.querySelector('.modal-footer');
  footer.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>`;

  if (mode === "vote") {

    const sendBtn = document.createElement('button');
    sendBtn.className = "btn btn-primary btn-sm";
    sendBtn.textContent = "Send votes";

    sendBtn.addEventListener('click', async () => {
      const scores = [];
      let allFilled = true;

      criteriaContainer.querySelectorAll('.score-input').forEach(input => {
        const val = input.value.trim();
        if (val === "" || isNaN(Number(val))) {
          allFilled = false;
        } else {
          scores.push({
            criteria_id: Number(input.dataset.criteria),
            score: Number(val)
          });
        }
      });

      if (!allFilled) {
        // Verificar si ya existe el alert
        if (!document.getElementById("voteErrorAlert")) {
          const alertDiv = document.createElement("div");
          alertDiv.id = "voteErrorAlert";
          alertDiv.className = "alert alert-danger alert-dismissible fade show mt-3";
          alertDiv.role = "alert";
          alertDiv.innerHTML = `
            You must fill in all criteria before sending the votes.
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
          `;
          criteriaContainer.appendChild(alertDiv);
        }
        return;
      }

      // Si estaba el alert, lo quitamos porque ya está todo informado
      const existingAlert = document.getElementById("voteErrorAlert");
      if (existingAlert) existingAlert.remove();

      // llamada API para enviar votos
      try {
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
          return;
        }

        modal.hide();

        // Recargar tabla de bailarinas
        document.getElementById('getDancersBtn').click();

      } catch (err) {
        console.error("Error sending votes", err);
        alert("Error sending votes");
      }
    });

    footer.appendChild(sendBtn);

    // Escuchar cambios en inputs para recalcular total
    criteriaContainer.querySelectorAll('.score-input').forEach(input => {
      input.addEventListener('input', () => {

        let min = parseInt(input.min);
        let max = parseInt(input.max);
        let val = parseInt(input.value);

        if (!isNaN(val)) {
          if (val < min) input.value = min;
          if (val > max) input.value = max;
        }

        let sum = 0;
        criteriaContainer.querySelectorAll('.score-input').forEach(inp => {
          const val = Number(inp.value);
          if (!isNaN(val)) sum += val;
        });
        document.getElementById('totalScore').textContent = sum;
      });
    });
  }


  modal.show();
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

function renderDancersTable(dancers) {
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
      btnDetails.textContent = 'Details';
      btnDetails.addEventListener('click', () => showVotesModal(d, "details"));
      tdActions.appendChild(btnDetails);
    } else if (d.status === 'Pending') {
      const btnVote = document.createElement('button');
      btnVote.className = 'btn btn-sm btn-primary';
      btnVote.textContent = 'Vote';
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
  categorySelect.innerHTML = '<option selected disabled>Select a category</option>';
  data.forEach(item => {
    const option = document.createElement('option');
    option.value = item.category.id;
    option.textContent = item.category.name;
    categorySelect.appendChild(option);
  });
}

function populateStyleSelect(selectedCategoryId, data, styleSelect) {
  const categoryData = data.find(item => item.category.id == selectedCategoryId);
  styleSelect.innerHTML = '<option selected disabled>Select a style</option>';
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

  // Número de bailarinas
  document.getElementById('compDancers').innerHTML = `<span class="badge bg-primary">${competition.num_dancers}</span>`;
  document.getElementById('compDancersPend').innerHTML = `<span class="badge bg-warning">${competition.dancersPending}</span>`;
}