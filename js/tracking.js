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

  competitions.forEach((comp, index) => {
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
    } else {
      const tableContainer = document.createElement('div');
      tableContainer.className = 'table-responsive mx-auto mb-4';

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
        const flagUrl = d.nationality
          ? `https://flagsapi.com/${d.nationality}/shiny/24.png`
          : `https://flagsapi.com/XX/shiny/24.png`;

        const dancerCell = `
          <div class="d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center">
              <img src="${flagUrl}" class="me-2" style="vertical-align: middle;">
              <span>${d.dancer_name}</span>
            </div>
            <span class="badge bg-info">#${d.position}</span>
          </div>
        `;

        const voteCells = d.votes.map((v, judgeIndex) => {
          let badgeClass = 'secondary';
          if (v.status === 'Completed') badgeClass = 'success';
          else if (v.status === 'Pending') badgeClass = 'warning';
          else if (v.status === 'Incompatible') badgeClass = 'danger';

          if (v.status === 'Completed') {
            return `
              <td class="text-center">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="badge status-badge bg-${badgeClass}">${v.status}</span>
                  <div class="actions-cell">
                    <button class="btn btn-sm btn-outline-primary me-1" 
                      onclick="showVoteDetails(${comp.id}, ${d.id}, ${comp.judges[judgeIndex].id})" 
                      title="Ver detalles">
                      <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                      onclick="resetVote(${comp.id}, ${d.id}, ${comp.judges[judgeIndex].id}, '${comp.id}-${d.id}-${comp.judges[judgeIndex].id}')"
                      title="Reiniciar voto">
                      <i class="bi bi-arrow-counterclockwise"></i>
                    </button>
                  </div>
                </div>
              </td>
            `;
          }

          return `<td class="text-center"><span class="badge status-badge bg-${badgeClass}">${v.status}</span></td>`;
        }).join('');

        // Asignar ID a la fila combinando competición-dancer-judge (para poder localizarla en reset)
        tableHTML += `<tr id="row-${comp.id}-${d.id}">${'<td>' + dancerCell + '</td>' + voteCells}</tr>`;
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
}


async function showVoteDetails(competitionId, dancerId, judgeId) {
  try {
    const res = await fetch(`/api/votes/${competitionId}/${dancerId}/${judgeId}`);
    if (!res.ok) {
      throw new Error('Error al obtener detalles de la votación');
    }

    const data = await res.json();
    // data debe tener { dancer, criteriaList } o similar

    // Referencias al modal
    const modalEl = document.getElementById('voteDetailsModal');
    const modal = new bootstrap.Modal(modalEl);
    const criteriaContainer = modalEl.querySelector('#voteDetailsBody');
    criteriaContainer.innerHTML = ''; // limpiar antes de pintar

    let total = 0;

    // Pintar criterios en modo "details"
    data.criteriaList.forEach(c => {
      const value = data.dancer.scores?.[c.name] ?? '-';
      const col = document.createElement('div');
      col.className = 'col-6 text-center';

      if (typeof value === 'number') total += value;
      col.innerHTML = `
        <div class="mb-1 fw-semibold">${c.name}</div>
        <span class="badge bg-info fs-5">${value}</span>
      `;

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

    // Footer (limpiamos y dejamos solo botón Cerrar)
    const footer = modalEl.querySelector('.modal-footer');
    footer.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
    `;

    // Mostrar modal
    modal.show();

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}


async function resetVote(eventId, categoryId, styleId, judgeId, dancerId, rowId) {
  console.log({ eventId, categoryId, styleId, judgeId, dancerId, rowId });
  if (!confirm('¿Seguro que quieres reiniciar este voto?')) return;

  try {
    const res = await fetch(`${API_BASE_URL}/api/voting/resetVoting?event_id=${eventId}`, {
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
      // ✅ Actualizar DOM
      const row = document.getElementById(`row-${rowId}`);
      if (row) {
        // Cambiar badge a Pending
        const badge = row.querySelector('.status-badge');
        if (badge) {
          badge.textContent = 'Pending';
          badge.classList.remove('bg-success');
          badge.classList.add('bg-warning');
        }

        // Quitar iconos de acción
        const actionsCell = row.querySelector('.actions-cell');
        if (actionsCell) {
          actionsCell.innerHTML = ''; // vaciar los botones
        }
      }
    }

    // refrescar la pantalla / recargar tabla aquí si hace falta

  } catch (err) {
    alert(err.message);
  }
}

