var competitions = [];
var masters = [];

const convertStatus = {
  'OPE': 'OPEN',
  'FIN': 'FINISHED', 
  'CLO': 'CLOSED'
}

const statusColor = {
  'OPE': 'success',
  'FIN': 'info',
  'CLO': 'danger'
};

var title = 'Competitions';

const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;

  await WaitEventLoaded();

  updateElementProperty('admineventUrl', 'href', `adminevent.html?eventId=${eventId}`);
  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('scheduleconfigUrl', 'href', `scheduleconfig.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${eventId}`);
  updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);

  const closedPanel = document.getElementById('closedPanel');

  if (getEvent().status == 'finished') {
      closedPanel.style.display = 'block';

      // deshabilitar inputs y botones
      document.querySelectorAll('input, button').forEach(el => el.disabled = true);
  }

  const filter = document.getElementById('categoryFilter');

  filter.addEventListener('change', applyCategoryFilter);

  loadCategories();
  loadStyles();
  loadMasters();
  fetchCompetitionsFromAPI();

  const editForm = document.getElementById("editForm");

  if (editForm) {
    editForm.addEventListener("submit", (e) => {
      e.preventDefault(); // evita recarga/redirección
    });
  }

});

async function fetchCompetitionsFromAPI() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching dancers');
    competitions = await response.json();
    loadCompetitions();
    applyCategoryFilter();
  } catch (error) {
    console.error('Failed to fetch dancers:', error);
  }
}

function loadCompetitions() {
  const competitionsTable = document.getElementById('competitionsTable');
  competitionsTable.innerHTML = ''; // Limpiar tabla

  competitions.forEach(comp => {
    const row = document.createElement('tr');
    row.dataset.id = comp.id;
    row.dataset.cat_id = comp.category_id;
    row.dataset.style_id = comp.style_id;

    let colorBg = statusColor[comp.status];
    let statusText = convertStatus[comp.status];
    let colorJudges;

    let tooltipText = `
      Total assigned: ${comp.judges.length}<br>
    `.trim();
    const isFinished = comp.status === 'FIN';
    const isOpen = comp.status === 'OPE';
    const isClosed = comp.status === 'CLO';

    let btnDisabled = '';
    if (getEvent().status === 'finished') {
      btnDisabled = 'disabled';
    }

    // Botón de estado
    let statusBtn;
    if (isFinished) {
      statusBtn = `
        <button type="button" 
                class="btn btn-outline-secondary btn-sm" 
                disabled
                title="Finished" ${btnDisabled}>
            <i class="bi bi-check-circle"></i>
        </button>
      `;
    } else {
      statusBtn = `
        <button type="button" 
                class="btn btn-outline-${isOpen ? 'warning' : 'success'} btn-sm btn-toggle-status"
                title="${isOpen ? t('close_competition') : t('open_competition')}"
                data-action="${isOpen ? 'close' : 'open'}" ${btnDisabled}>
            <i class="bi ${isOpen ? 'bi-lock' : 'bi-unlock'}"></i>
        </button>
      `;
    }

    row.innerHTML = `
      <td><span class="badge bg-info fs-6">${comp.category_name}</span></td>
      <td><span class="badge bg-warning text-dark fs-6">${comp.style_name}</span></td>
      <td><i class="bi bi-clock me-1 text-muted"></i>${comp.estimated_start_form ?? 'Not defined'}</td>
      <td data-status><span class="badge bg-${colorBg}">${statusText}</span></td>
      <td>
        <i class="bi bi-people me-1 text-muted"></i>
        ${comp.judges
          .map(j => 
            j.reserve
              ? `${j.name} <span class="badge bg-secondary ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="${t('judge_in_reserve')}">R</span>`
              : j.name
          )
          .join(', ')
        }
      </td>
      <td>
        <span class="badge bg-primary">${comp.judges.filter(j => !j.reserve).length}</span>
        <span class="mx-1">/</span>

        <span class="badge bg-warning"
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              title="${t('reserve_judges')}">
          ${comp.judges.filter(j => j.reserve).length}
        </span>
      </td>
      <td>
        <span class="badge bg-secondary">${comp.num_dancers}</span>
      </td>
      <td class="text-center">
        <div class="btn-group" role="group">
            ${statusBtn}
            <button type="button" class="btn btn-outline-secondary btn-sm btn-dancers-order" title="${t('dancers_order_modal_title')}" data-bs-toggle="modal" data-bs-target="#dancersOrderModal" ${btnDisabled}>
                <i class="bi bi-list-ol"></i>
            </button>
            <button type="button" class="btn btn-outline-primary btn-sm btn-edit-competition" title="${t('edit')}" ${btnDisabled}>
                <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-delete-competition" title="${t('delete')}" ${btnDisabled}>
                <i class="bi bi-trash"></i>
            </button>
        </div>
      </td>
    `;

    competitionsTable.appendChild(row);
  });

  // actualizar contador
  const countEl = document.getElementById(`count-competitions`);
  if (countEl) {
      countEl.textContent = competitions.length;
  }

  // Activar tooltips de Bootstrap después de crear los elementos
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  tooltipTriggerList.map(el => new bootstrap.Tooltip(el));

  competitionsTable.querySelectorAll('.btn-toggle-status').forEach(btn => {
    btn.addEventListener('click', async e => {
      const row = e.target.closest('tr');
      const compId = row.dataset.id;
      const action = btn.dataset.action; // ahora usamos data-action

      if (!action) return; // botón disabled (finished), no hacemos nada

      try {
        const response = await fetch(`${API_BASE_URL}/api/competitions/${compId}/changestatus`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: getEvent().id, action })
        });

        const data = await response.json();

        if (!response.ok) {
          showMessageModal(data.error || 'Error saving competition', 'Error');
          return;
        }

        // Recargamos la lista para reflejar el cambio de estado
        //await fetchCompetitionsFromAPI();
        let newStatus;
        if (action === 'open') {
          newStatus = 'OPE';
        } else if (action === 'close') {
          newStatus = 'CLO';
        }

        // Actualizamos la competición en el array local
        const compIndex = competitions.findIndex(c => c.id == compId);
        if (compIndex !== -1) {
          competitions[compIndex].status = newStatus;
        }

        const statusTd = row.querySelector('td[data-status]');
        const badge = statusTd.querySelector('.badge');
        if (badge) {
          badge.textContent = convertStatus[newStatus];
          badge.classList.remove('bg-success', 'bg-danger');
          badge.classList.add(newStatus === 'OPE' ? 'bg-success' : 'bg-danger');
        }

        // Actualizamos el botón
        btn.dataset.action = newStatus === 'OPE' ? 'close' : 'open';
        btn.title = newStatus === 'OPE' ? t('close_competition') : t('open_competition');
        btn.querySelector('i').className = newStatus === 'OPE' ? 'bi bi-lock' : 'bi bi-unlock';


      } catch (error) {
        console.error('Error changing status:', error);
        showMessageModal('Unexpected error changing status', 'Error');
      }
    });
  });

}


async function addCompt() {
  
  const inputCat = document.getElementById('categoryDropdown');
  const inputSty = document.getElementById('styleDropdown');
  const valueCat = inputCat.value.trim();
  const valueSty = inputSty.value.trim();

  if (valueCat !== "" && valueSty !== "") {

    // Deshabilitar botón para evitar múltiples envíos
    const addBtn = document.getElementById('createBtn');
    if (addBtn.disabled) return;
    addBtn.disabled = true;
    addBtn.textContent = "Adding...";


    const newComp = {
      event_id: getEvent().id,
      category_id: valueCat,
      style_id: valueSty,
      startTime: '',
      status: 'CLO'
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/competitions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newComp)
      });

      if (!response.ok) {
        const errData = await response.json();
        inputCat.value = '';
        inputSty.value = '';
        showMessageModal(errData.error || 'Error saving competition', 'Error');
        return;
      }

      // Vuelves a cargar la lista desde la API
      await fetchCompetitionsFromAPI();

      // Limpias los inputs
      inputCat.value = '';
      inputSty.value = '';

    } catch (error) {
      console.error(error);
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Add Competition";
    }
  } else {
    showMessageModal(t('error_create_competition'), 'Error');
  }
}

function toDatetimeLocalFormat(str) {
  if (!str) return ''; // evitar errores con null o undefined

  const [datePart, timePart] = str.split(" ");
  if (!datePart || !timePart) return '';

  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  if (
    !day || !month || !year ||
    hour === undefined || minute === undefined
  ) return '';

  return `${year.toString().padStart(4, '0')}-` +
         `${month.toString().padStart(2, '0')}-` +
         `${day.toString().padStart(2, '0')}T` +
         `${hour.toString().padStart(2, '0')}:` +
         `${minute.toString().padStart(2, '0')}`;
}


document.addEventListener('DOMContentLoaded', () => {
    const editModal = new bootstrap.Modal(document.getElementById('editModal'));
    const dancersOrderModal = new bootstrap.Modal(document.getElementById('dancersOrderModal'));
    const judgesAssignmentModalEl = document.getElementById('judgesAssignmentModal');
    const judgesAssignmentModal = judgesAssignmentModalEl ? new bootstrap.Modal(judgesAssignmentModalEl) : null;

    document.addEventListener('click', (event) => {

      const button = event.target.closest('.btn-edit-competition');

      if (button) {

        const tr = button.closest('tr');

        const competitionId = tr.dataset.id;
        const competition = competitions.find(c => c.id == competitionId);

        const editForm = document.getElementById('editForm');
        editForm.dataset.id = button.closest('tr').dataset.id;
        editForm.dataset.cat_id = competition.category_id;
        editForm.dataset.style_id = competition.style_id;

        document.getElementById('modalTitleCategory').textContent = competition.category_name;
        document.getElementById('modalTitleStyle').textContent = competition.style_name;
        document.getElementById('editStartTime').value = toDatetimeLocalFormat(competition.estimated_start_form);
        document.getElementById('editStatus').value = competition.status;

        const judges = competition.judges || [];

        const judgeOptions = document.getElementById('editJudges').options;
        const reserveSelect = document.getElementById('editJudgeReserve');
        
        const judgeIds = judges.map(j => String(j.id)); // ids como strings para comparar

        Array.from(judgeOptions).forEach(opt => {
          opt.selected = judgeIds.includes(opt.value);
        });

        if (reserveSelect) {
          const reserveJudge = judges.find(j => j.reserve);
          reserveSelect.value = reserveJudge ? String(reserveJudge.id) : '';
        }

        editModal.show();
      } else if (event.target.closest('.btn-delete-competition')) {

        const button = event.target.closest('.btn-delete-competition');

        const tr = button.closest('tr');
        const competitionId = tr.dataset.id;
        const competition = competitions.find(c => c.id == competitionId);

        if (competition) {
          const message = `${t('confirm_delete_competition')} <strong>${competition.category_name} - ${competition.style_name}</strong>?`;
          document.getElementById('deleteModalMessage').innerHTML = message;

          const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
          deleteModal.show();

          document.getElementById('confirmDeleteBtn').onclick = async () => {
            await deleteCompetition(competitionId);
            fetchCompetitionsFromAPI();
            deleteModal.hide();
          };
        }
      }

    });

    document.getElementById('saveEditBtn').addEventListener('click', async () => {

      const competitionId = document.getElementById('editForm').dataset.id;
      const categoryId = document.getElementById('editForm').dataset.cat_id;
      const styleId = document.getElementById('editForm').dataset.style_id;

      inputEstimatedStart = document.getElementById('editStartTime');
      inputStatus = document.getElementById('editStatus');
      inputJudges = Array.from(document.getElementById('editJudges').selectedOptions).map(opt => opt.value);
      const inputReserveJudge = document.getElementById('editJudgeReserve');

      const competitionData = {
        category_id: categoryId,
        style_id: styleId,
        estimated_start: inputEstimatedStart.value,
        status: inputStatus.value,
        judges: inputJudges,
        judge_reserve: inputReserveJudge ? (inputReserveJudge.value || null) : null,
        event_id: getEvent().id
      }


      const response = await fetch(`${API_BASE_URL}/api/competitions/${competitionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(competitionData)
      });

      if (!response.ok) {
        const errData = await response.json();
        showMessageModal(errData.error || 'Error saving competition', 'Error');
        return;
      }

      await fetchCompetitionsFromAPI();

      editModal.hide();
    });

    const sortable = new Sortable(document.getElementById('sortableDancers'), {
      animation: 150,
      onEnd: () => {
        document.querySelectorAll('#sortableDancers .order-number').forEach((el, i) => {
          el.textContent = `${i + 1}.`;
        });
      }
    });

    document.addEventListener('click', async (event) => {
      const btn = event.target.closest('.btn-dancers-order');
      if (!btn) return;

      const compId = btn.closest('tr').dataset.id;

      const list = document.getElementById('sortableDancers');
      list.innerHTML = '';
      list.dataset.competitionId = compId;

      try {
        const res = await fetch(`${API_BASE_URL}/api/competitions/${compId}/dancers?event_id=${getEvent().id}`);
        if (!res.ok) throw new Error('Error fetching dancers');
        const dancers = await res.json();

        dancers.forEach(dancer => {
          const li = document.createElement('li');
          li.className = 'list-group-item d-flex align-items-center draggable-item';
          li.dataset.id = dancer.id;

          li.innerHTML = `
            <span class="me-3 text-muted drag-icon"><i class="bi bi-grip-vertical"></i></span>
            <span class="me-2 order-number">${dancer.position}.</span>
            <img src="https://flagsapi.com/${dancer.nationality}/shiny/24.png" class="me-2" style="width: 24px;" />
            <span class="dancer-name">${dancer.dancer_name}</span>
          `;

          list.appendChild(li);
        });

        dancersOrderModal.show();
      } catch (err) {
        console.error('Error loading dancers:', err);
      }
    });

  
    document.getElementById('saveDancerOrder').addEventListener('click', () => {
      const items = document.querySelectorAll('#sortableDancers li');
      const dancerIds = Array.from(items).map(item => item.dataset.id, 10);
      const compId = document.getElementById('sortableDancers').dataset.competitionId;
    
      fetch(`${API_BASE_URL}/api/competitions/${compId}/order?event_id=${getEvent().id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competition_id: compId,
          order: dancerIds
        })
      })
      .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(data => {
        dancersOrderModal.hide();
      })
      .catch(err => console.error('Error al guardar orden:', err));

      // Cerrar modal
      dancersOrderModal.hide();
    });

    const judgesAssignmentBtn = document.getElementById('judgesAssignmentBtn');
    const assignJudgesBtn = document.getElementById('assignJudgesBtn');

    if (judgesAssignmentBtn && judgesAssignmentModal) {
      judgesAssignmentBtn.addEventListener('click', async () => {
        if (!masters.length) {
          await loadMasters();
        }

        if (!competitions.length) {
          await fetchCompetitionsFromAPI();
        }

        renderJudgesAssignmentList();
        renderCompetitionsAssignmentList();
        judgesAssignmentModal.show();
      });
    }

    if (assignJudgesBtn) {
      assignJudgesBtn.addEventListener('click', async () => {
        const selectedJudges = getSelectedAssignmentJudges();
        const selectedCompetitions = getSelectedAssignmentCompetitions();

        if (!selectedJudges.length) {
          showMessageModal(t('judges_assignment_missing_judges'), 'Error');
          return;
        }

        if (!selectedCompetitions.length) {
          showMessageModal(t('judges_assignment_missing_competitions'), 'Error');
          return;
        }

        assignJudgesBtn.disabled = true;
        const originalText = assignJudgesBtn.textContent;
        assignJudgesBtn.textContent = t('judges_assignment_status_updating');

        for (const compId of selectedCompetitions) {
          const competition = competitions.find(c => String(c.id) === String(compId));
          if (!competition) {
            setAssignmentResult(compId, 'error', 'Competition not found');
            continue;
          }

          await updateCompetitionJudgesAssignment(competition, selectedJudges);
        }

        assignJudgesBtn.disabled = false;
        assignJudgesBtn.textContent = originalText;
      });
    }

    if (judgesAssignmentModalEl) {
      judgesAssignmentModalEl.addEventListener('hidden.bs.modal', () => {
        window.location.reload();
      });
    }
  });


async function loadCategories() {
  const categorySelect = document.getElementById('categoryDropdown');
  //categorySelect.innerHTML = ''; // Limpiar opciones anteriores

  const categoryFilter = document.getElementById('categoryFilter');

  try {
    const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching categories');
    const categories = await response.json();

    categories.forEach(category => {
      const option1 = document.createElement('option');
      option1.value = category.id || category; // por si es string directo
      option1.textContent = category.name || category;
      categorySelect.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = category.name || category; // por si es string directo
      option2.textContent = category.name || category;
      categoryFilter.appendChild(option2);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadStyles() {
  const styleSelect = document.getElementById('styleDropdown');
  //styleSelect.innerHTML = ''; // Limpiar opciones anteriores

  try {
    const response = await fetch(`${API_BASE_URL}/api/styles?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching styles');
    const styles = await response.json();

    styles.forEach(style => {
      const option = document.createElement('option');
      option.value = style.id || style;
      option.textContent = style.name || style;
      styleSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load styles:', err);
  }
}

async function loadMasters() {
  const masterSelect = document.getElementById('editJudges');
  const reserveSelect = document.getElementById('editJudgeReserve');
  masterSelect.innerHTML = ''; // Limpiar opciones anteriores
  if (reserveSelect) {
    reserveSelect.innerHTML = `<option value=\"\">${t('ninguno')}</option>`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/judges?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching masters');
    masters = await response.json();

    masters.forEach(master => {
      const option = document.createElement('option');
      option.value = master.id;
      option.textContent = master.name;
      masterSelect.appendChild(option);

      if (reserveSelect) {
        const reserveOption = document.createElement('option');
        reserveOption.value = master.id;
        reserveOption.textContent = master.name;
        reserveSelect.appendChild(reserveOption);
      }
    });
  } catch (err) {
    console.error('Failed to load masters:', err);
  }
}

async function deleteCompetition(competitionIdToDelete) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/competitions/${competitionIdToDelete}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
      showMessageModal(data.error || 'Unknown error', 'Error eliminando la competición');
      return;
    }

  } catch (error) {
    console.error('Error al eliminar la competición:', error);
  }
}


function applyCategoryFilter() {
  const filter = document.getElementById('categoryFilter');
  const table = document.getElementById('competitionsTable');

  if (!filter || !table) return; // seguridad por si aún no existen en el DOM

  const selected = filter.value.toLowerCase();
  const rows = table.querySelectorAll('tr');

  rows.forEach(row => {
    const category = row.children[0]?.textContent.trim().toLowerCase();
    if (!selected || category === selected) {
      row.classList.remove('d-none');
    } else {
      row.classList.add('d-none');
    }
  });

  // Mostrar o no el empty state
  const visibleRows = Array.from(rows).filter(row => !row.classList.contains('d-none'));
  document.getElementById('emptyState')?.classList.toggle('d-none', visibleRows.length > 0);
}

function renderJudgesAssignmentList() {
  const list = document.getElementById('judgesAssignmentList');
  if (!list) return;

  list.innerHTML = '';

  if (!masters.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t('judges_assignment_no_judges');
    list.appendChild(empty);
    return;
  }

  masters.forEach(master => {
    const label = document.createElement('label');
    label.className = 'list-group-item d-flex align-items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input';
    checkbox.value = master.id;

    const name = document.createElement('span');
    name.textContent = master.name;

    label.appendChild(checkbox);
    label.appendChild(name);
    list.appendChild(label);
  });
}

function renderCompetitionsAssignmentList() {
  const list = document.getElementById('competitionsAssignmentList');
  if (!list) return;

  list.innerHTML = '';

  const availableCompetitions = competitions.filter(comp => comp.status !== 'FIN');

  if (!availableCompetitions.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t('judges_assignment_no_competitions');
    list.appendChild(empty);
    return;
  }

  availableCompetitions.forEach(comp => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex align-items-center justify-content-between gap-3';

    const statusBadge = document.createElement('span');
    statusBadge.className = `badge bg-${statusColor[comp.status] || 'secondary'} ms-2`;
    statusBadge.textContent = convertStatus[comp.status] || comp.status;

    const formCheck = document.createElement('div');
    formCheck.className = 'form-check';

    const checkbox = document.createElement('input');
    const checkboxId = `assign-comp-${comp.id}`;
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input';
    checkbox.id = checkboxId;
    checkbox.dataset.compId = comp.id;
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = checkboxId;

    const categorySpan = document.createElement('span');
    categorySpan.className = 'fw-semibold';
    categorySpan.textContent = comp.category_name;

    const styleSpan = document.createElement('span');
    styleSpan.className = 'text-muted ms-1';
    styleSpan.textContent = `/ ${comp.style_name}`;

    label.appendChild(categorySpan);
    label.appendChild(styleSpan);
    label.appendChild(statusBadge);

    formCheck.appendChild(checkbox);
    formCheck.appendChild(label);

    const result = document.createElement('span');
    result.className = 'small text-muted ms-auto';
    result.dataset.result = 'pending';
    result.textContent = t('judges_assignment_status_pending');

    item.appendChild(formCheck);
    item.appendChild(result);

    list.appendChild(item);
  });
}

function getSelectedAssignmentJudges() {
  return Array.from(document.querySelectorAll('#judgesAssignmentList input[type="checkbox"]:checked'))
    .map(input => input.value);
}

function getSelectedAssignmentCompetitions() {
  return Array.from(document.querySelectorAll('#competitionsAssignmentList input[type="checkbox"]:checked'))
    .map(input => input.dataset.compId);
}

function setAssignmentResult(compId, status, message) {
  const resultEl = document.querySelector(`#competitionsAssignmentList input[data-comp-id="${compId}"]`)
    ?.closest('.list-group-item')
    ?.querySelector('[data-result]');

  if (!resultEl) return;

  resultEl.classList.remove('text-muted', 'text-success', 'text-danger', 'text-warning');

  if (status === 'updating') {
    resultEl.textContent = t('judges_assignment_status_updating');
    resultEl.classList.add('text-warning');
    return;
  }

  if (status === 'ok') {
    resultEl.textContent = t('judges_assignment_status_ok');
    resultEl.classList.add('text-success');
    return;
  }

  if (status === 'error') {
    const errorPrefix = t('judges_assignment_status_error');
    resultEl.textContent = message ? `${errorPrefix}: ${message}` : errorPrefix;
    resultEl.classList.add('text-danger');
    return;
  }

  resultEl.textContent = t('judges_assignment_status_pending');
  resultEl.classList.add('text-muted');
}

async function updateCompetitionJudgesAssignment(competition, judgeIds) {
  if (!competition) return;

  setAssignmentResult(competition.id, 'updating');

  const reserveJudge = (competition.judges || []).find(j => j.reserve);
  const reserveId = reserveJudge ? String(reserveJudge.id) : null;
  const reserveToSend = reserveId && judgeIds.includes(reserveId) ? reserveId : null;

  const competitionData = {
    category_id: competition.category_id,
    style_id: competition.style_id,
    estimated_start: toDatetimeLocalFormat(competition.estimated_start_form),
    status: competition.status,
    judges: judgeIds,
    judge_reserve: reserveToSend,
    event_id: getEvent().id
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/${competition.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(competitionData)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setAssignmentResult(competition.id, 'error', data?.error || 'Error saving competition');
      return;
    }

    setAssignmentResult(competition.id, 'ok');
  } catch (error) {
    console.error('Error updating competition judges:', error);
    setAssignmentResult(competition.id, 'error', error?.message || 'Unexpected error');
  }
}

