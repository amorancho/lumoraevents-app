var title = 'Competition Tracking';

const allowedRoles = ["admin", "organizer"];
const voteDetailsInFlight = new Set();

const categorySelect = document.getElementById('categorySelect');

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
          class="btn btn-outline-${isOpen ? 'warning' : 'success'} btn-sm btn-toggle-status ms-auto"
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
    const positionedStatusButton = statusActionButton
      ? statusActionButton.replace(
        'btn-toggle-status ms-auto',
        'btn-toggle-status position-absolute end-0 top-50 translate-middle-y me-3'
      )
      : '';
    card.innerHTML = `
      <div class="card-header position-relative">
        <h5 class="mb-0 text-center w-100">${comp.category_name} - ${comp.style_name}</h5>
        ${positionedStatusButton}
      </div>
      <div class="card-body">
        <div class="row text-center">
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
          <div class="col-6 col-md-2">
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
          <div class="col-12 col-md-4">
              <div class="row text-center">
                <div class="col-4">
                  <p class="mb-1 fw-semibold">${t('judges')}</p>
                  <p>
                    <span class="badge bg-primary">${comp.judge_number}</span>
                    <span class="mx-1">/</span>

                    <span class="badge bg-warning"
                          data-bs-toggle="tooltip"
                          data-bs-placement="top"
                          title="${t('reserve_judges')}">
                      ${comp.judge_number_reserve}
                    </span>
                  </p>
                </div>
                <div class="col-4">
                  <p class="mb-1 fw-semibold">${t('dancers')}</p>
                  <p><span class="badge bg-primary">${comp.num_dancers}</span></p>
                </div>
                <div class="col-4">
                  <p class="mb-1 fw-semibold">${t('pending')}</p>
                  <p><span class="badge bg-warning">${comp.dancers.filter(d => d.votes.some(v => v.status === 'Pending')).length}</span></p>
                </div>
              </div>
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
              <th>Dancer</th>
              ${comp.judges.map(j => `
                <th class="text-center">
                  ${j.name}
                  ${j.reserve ? `<span class="badge bg-secondary ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="${t('judge_in_reserve')}">R</span>` : ''}
                </th>
              `).join('')}              
              <th>${t('voted')}</th>
              <th>${t('total')}</th>
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
                  <li><button class="dropdown-item" type="button" ${btnDisabled}>${t('disqualify')}</button></li>
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
        tableHTML += `<tr id="row-${comp.id}-${d.id}">${'<td>' + dancerCell + '</td>' + voteCells}        
        <td class="bg-light">${d.judges_voted}</td>
        <td class="bg-light">${totalScoreText}</td></tr>`;
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
      throw new Error('Error al obtener detalles de la votaci?n');
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
    if (!data.dancers) throw new Error('No se han encontrado datos de la bailarina');

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

