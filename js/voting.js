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

  // Modal único
  const modalEl = document.createElement('div');
  modalEl.className = 'modal fade';
  modalEl.id = 'detailsModal';
  modalEl.tabIndex = -1;
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header bg-primary text-white">
          <h5 class="modal-title" id="detailsModalLabel">Votes</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="row g-3 text-center" id="criteriaContainer"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  modal = new bootstrap.Modal(modalEl);
  criteriaContainer = document.getElementById('criteriaContainer');
  

});

function showVotesModal(dancer) {
  document.getElementById('detailsModalLabel').textContent = `Votes for ${dancer.name}`;

  criteriaContainer.innerHTML = '';

  console.log('criteriaContainer:', criteriaContainer);

  let total = 0;
  criteriaList.forEach((c, i) => {

    const value = dancer.scores[c.name] ?? '-';

    if (typeof value === 'number') total += value;
    const col = document.createElement('div');
    col.className = 'col-6 text-center';
    col.innerHTML = `
      <div class="mb-1 fw-semibold">${c.name}</div>
      <span class="badge bg-info fs-5">${value}</span>
    `;

    criteriaContainer.appendChild(col);
  });

  console.log('criteriaContainer:', criteriaContainer);

  // Total
  const totalCol = document.createElement('div');
  totalCol.className = 'col-12 mt-3 text-center';
  totalCol.innerHTML = `
    <div class="fw-bold mb-1">Total</div>
    <span class="badge bg-success fs-4 px-4">${total}</span>
  `;
  criteriaContainer.appendChild(totalCol);

  console.log('criteriaContainer:', criteriaContainer);

  modal.show();
}

async function loadCriteria() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/criteria?event_id=1`);
    criteriaList = await res.json();
  } catch (err) {
    console.error('Error loading criteria', err);
  }
}

async function fetchVoting(category, style) {
  try {
    const userId = getUserId();
    const res = await fetch(`${API_BASE_URL}/api/voting?event=${getEvent().id}&judge=${userId}&category=${category}&style=${style}`);
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

    // Columna Dancer + estado + orden
    const tdDancer = document.createElement('td');
    tdDancer.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center">
          <img src="https://flagsapi.com/${d.nationality}/shiny/24.png" class="me-2" style="vertical-align: middle;">
          <span>${d.name}</span>
        </div>
        <div class="d-flex align-items-center">
          <span class="badge ${d.status==='Pending' ? 'bg-warning' : 'bg-success'} me-2">${d.status}</span>
          <span class="badge bg-info">#${d.position}</span>
        </div>
      </div>
    `;
    tr.appendChild(tdDancer);

    // Columna Details
    const tdDetails = document.createElement('td');
    tdDetails.className = 'text-center';
    const btnDetails = document.createElement('button');
    btnDetails.className = 'btn btn-sm btn-secondary';
    btnDetails.textContent = 'Details';
    btnDetails.disabled = d.status === 'Pending';
    btnDetails.addEventListener('click', () => showVotesModal(d));
    tdDetails.appendChild(btnDetails);
    tr.appendChild(tdDetails);

    // Columna Vote
    const tdVote = document.createElement('td');
    tdVote.className = 'text-center';
    const btnVote = document.createElement('button');
    btnVote.className = 'btn btn-sm btn-primary';
    btnVote.textContent = 'Vote';
    btnVote.disabled = d.status !== 'Pending';
    tdVote.appendChild(btnVote);
    tr.appendChild(tdVote);

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
  switch (competition.status) {
    case 'OPE':
      statusClass = 'bg-success';
      break;
    case 'CLO':
      statusClass = 'bg-danger';
      break;
    case 'PEN':
      statusClass = 'bg-warning';
      break;
  }
  document.getElementById('compStatus').innerHTML = `<span class="badge ${statusClass}">${competition.status}</span>`;

  // Número de bailarinas
  document.getElementById('compDancers').innerHTML = `<span class="badge bg-primary">${competition.num_dancers}</span>`;
  document.getElementById('compDancersPend').innerHTML = `<span class="badge bg-warning">${competition.dancersPending}</span>`;
}