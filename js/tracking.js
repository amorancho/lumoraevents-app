var title = 'Competition Tracking';

const categorySelect = document.getElementById('categorySelect');

document.addEventListener('DOMContentLoaded', async () => {

  const refreshBtn = document.getElementById('refreshBtn');

  await eventReadyPromise;

  loadCategories();

  categorySelect.addEventListener('change', async (e) => {
    const categoryId = e.target.value;
    if (categoryId) {
      await loadCompetitions(categoryId);
    }
  });

  refreshBtn.addEventListener('click', () => {
    categorySelect.dispatchEvent(new Event('change'));
  });

});

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const categories = await response.json();
    populateCategorySelect(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
}

function populateCategorySelect(categories) {  
  
  categorySelect.innerHTML = '<option selected disabled>Select a category</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
}

async function loadCompetitions(categoryId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/tracking?event_id=${getEvent().id}&category_id=${categoryId}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const competitions = await response.json();
    renderCompetitions(competitions);
  } catch (error) {
    console.error('Error fetching competitions:', error);
  }
}

function renderCompetitions(competitions) {
  const container = document.getElementById('competitionsContainer');
  container.innerHTML = '';

  if (!competitions || competitions.length === 0) {
    container.innerHTML = `
      <div class="alert alert-warning text-center my-4">
        No se han encontrado competiciones para esta categoría.
      </div>
    `;
    return;
  }

  competitions.forEach(comp => {
    // Card con info de competición
    const card = document.createElement('div');
    card.className = 'card mb-4';
    card.innerHTML = `
      <div class="card-header text-center">
        <h5 class="mb-0">${comp.category_name} - ${comp.style_name}</h5>
      </div>
      <div class="card-body">
        <div class="row text-center">
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">Category</p>
            <p><span class="badge bg-secondary">${comp.category_name}</span></p>
          </div>
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">Style</p>
            <p><span class="badge bg-secondary">${comp.style_name}</span></p>
          </div>
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">Estimated Time</p>
            <p>${comp.estimated_start_form ?? '-'}</p>
          </div>
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">Status</p>
            <p><span class="badge bg-${comp.status === 'OPE' ? 'success' : 'warning'}">${comp.status}</span></p>
          </div>
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">Dancers</p>
            <p><span class="badge bg-primary">${comp.num_dancers}</span></p>
          </div>
          <div class="col-6 col-md-2">
            <p class="mb-1 fw-semibold">Pending</p>
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
      alertDiv.textContent = 'No hay jueces o bailarinas registrados en esta competición.';
      container.appendChild(alertDiv);
      return;
    }

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-responsive mx-auto mb-4';
    //tableContainer.style.maxWidth = '900px';
    
    // Cabecera de la tabla: bailarinas + jueces
    let tableHTML = `
      <table class="table table-bordered align-middle text-center">
        <thead class="table-light">
          <tr>
            <th>Dancer</th>
            ${comp.judges.map(j => `<th class="text-center">${j.name}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    comp.dancers.forEach(d => {
      const flagUrl = d.nationality ? `https://flagsapi.com/${d.nationality}/shiny/24.png` : `https://flagsapi.com/XX/shiny/24.png`;
      const dancerCell = `
        <div class="d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center">
            <img src="${flagUrl}" class="me-2" style="vertical-align: middle;">
            <span>${d.dancer_name}</span>
          </div>
          <span class="badge bg-info">#${d.position}</span>
        </div>
      `;

      const voteCells = d.votes.map(v => {
        let badgeClass = 'secondary';
        if (v.status === 'Completed') badgeClass = 'success';
        else if (v.status === 'Pending') badgeClass = 'warning';
        else if (v.status === 'Incompatible') badgeClass = 'danger';
        return `<td class="text-center"><span class="badge bg-${badgeClass}">${v.status}</span></td>`;
      }).join('');

      tableHTML += `<tr><td>${dancerCell}</td>${voteCells}</tr>`;
    });

    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;
    container.appendChild(tableContainer);
  });
}



