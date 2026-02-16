var competitions = [];
var masters = [];
var categoriesCatalog = [];
var stylesCatalog = [];

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
      e.preventDefault(); // evita recarga/redirecciÃ³n
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

    // BotÃ³n de estado
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

  // Activar tooltips de Bootstrap despuÃ©s de crear los elementos
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  tooltipTriggerList.map(el => new bootstrap.Tooltip(el));

  competitionsTable.querySelectorAll('.btn-toggle-status').forEach(btn => {
    btn.addEventListener('click', async e => {
      const row = e.target.closest('tr');
      const compId = row.dataset.id;
      const action = btn.dataset.action; // ahora usamos data-action

      if (!action) return; // botÃ³n disabled (finished), no hacemos nada

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

        // Actualizamos la competiciÃ³n en el array local
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

        // Actualizamos el botÃ³n
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


async function createCompetitionRequest(categoryId, styleId) {
  const payload = {
    event_id: getEvent().id,
    category_id: categoryId,
    style_id: styleId,
    startTime: '',
    status: 'CLO'
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: data?.error || t('create_competitions_error_save', 'Error saving competition')
      };
    }

    return { ok: true, message: data?.message || t('create_competitions_result_ok', 'Created') };
  } catch (error) {
    console.error('Error creating competition:', error);
    return {
      ok: false,
      message: error?.message || t('create_competitions_result_error', 'Unexpected error')
    };
  }
}


async function addCompt() {
  
  const inputCat = document.getElementById('categoryDropdown');
  const inputSty = document.getElementById('styleDropdown');
  const valueCat = inputCat.value.trim();
  const valueSty = inputSty.value.trim();

  if (valueCat !== "" && valueSty !== "") {

    // Deshabilitar botÃ³n para evitar mÃºltiples envÃ­os
    const addBtn = document.getElementById('createBtn');
    if (addBtn.disabled) return;
    addBtn.disabled = true;
    addBtn.textContent = "Adding...";

    try {
      const createResult = await createCompetitionRequest(valueCat, valueSty);

      if (!createResult.ok) {
        inputCat.value = '';
        inputSty.value = '';
        showMessageModal(createResult.message, t('error_title', 'Error'));
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

async function saveCompetitionEdits(editModal, recalculateSchedule = false) {
  const editForm = document.getElementById('editForm');
  const competitionId = editForm.dataset.id;
  const categoryId = editForm.dataset.cat_id;
  const styleId = editForm.dataset.style_id;

  const inputEstimatedStart = document.getElementById('editStartTime');
  const inputStatus = document.getElementById('editStatus');
  const inputJudges = Array.from(document.getElementById('editJudges').selectedOptions).map(opt => opt.value);
  const inputReserveJudge = document.getElementById('editJudgeReserve');
  const inputMaxTime = document.getElementById('editMaxTime');
  const maxTimeRaw = (inputMaxTime?.value || '').trim();

  let maxTimeSeconds = null;
  if (maxTimeRaw) {
    const normalizedMaxTime = normalizeMaxTimeValue(maxTimeRaw);
    const parsedMaxTimeSeconds = maxTimeToSeconds(normalizedMaxTime);

    if (!normalizedMaxTime || !Number.isFinite(parsedMaxTimeSeconds)) {
      if (inputMaxTime) inputMaxTime.classList.add('is-invalid');
      showMessageModal(
        t('max_times_invalid_format', 'Enter a valid time in mm:ss format.'),
        t('error_title', 'Error')
      );
      return;
    }

    if (inputMaxTime) {
      inputMaxTime.classList.remove('is-invalid');
      inputMaxTime.value = normalizedMaxTime;
    }
    maxTimeSeconds = parsedMaxTimeSeconds;
  } else if (inputMaxTime) {
    inputMaxTime.classList.remove('is-invalid');
  }

  const competitionData = {
    category_id: categoryId,
    style_id: styleId,
    estimated_start: inputEstimatedStart.value,
    status: inputStatus.value,
    judges: inputJudges,
    judge_reserve: inputReserveJudge ? (inputReserveJudge.value || null) : null,
    max_time: maxTimeSeconds,
    event_id: getEvent().id,
    recalculate_schedule: Boolean(recalculateSchedule)
  };

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
}


document.addEventListener('DOMContentLoaded', () => {
    const editModal = new bootstrap.Modal(document.getElementById('editModal'));
    const scheduleConfigWarningModalEl = document.getElementById('scheduleConfigWarningModal');
    const scheduleConfigWarningModal = scheduleConfigWarningModalEl ? new bootstrap.Modal(scheduleConfigWarningModalEl) : null;
    const recalculateScheduleModalEl = document.getElementById('recalculateScheduleModal');
    const recalculateScheduleModal = recalculateScheduleModalEl ? new bootstrap.Modal(recalculateScheduleModalEl) : null;
    const dancersOrderModal = new bootstrap.Modal(document.getElementById('dancersOrderModal'));
    const judgesAssignmentModalEl = document.getElementById('judgesAssignmentModal');
    const judgesAssignmentModal = judgesAssignmentModalEl ? new bootstrap.Modal(judgesAssignmentModalEl) : null;
    const maxTimesModalEl = document.getElementById('maxTimesModal');
    const maxTimesModal = maxTimesModalEl ? new bootstrap.Modal(maxTimesModalEl) : null;
    const createCompetitionsModalEl = document.getElementById('createCompetitionsModal');
    const createCompetitionsModal = createCompetitionsModalEl ? new bootstrap.Modal(createCompetitionsModalEl) : null;
    const editMaxTimeInput = document.getElementById('editMaxTime');

    const confirmRecalculateSchedule = () => new Promise(resolve => {
      if (!recalculateScheduleModal || !recalculateScheduleModalEl) {
        resolve(false);
        return;
      }

      const confirmBtn = document.getElementById('confirmRecalculateScheduleBtn');
      const onConfirm = () => {
        cleanup();
        resolve(true);
        recalculateScheduleModal.hide();
      };
      const onHidden = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        confirmBtn?.removeEventListener('click', onConfirm);
        recalculateScheduleModalEl.removeEventListener('hidden.bs.modal', onHidden);
      };

      confirmBtn?.addEventListener('click', onConfirm, { once: true });
      recalculateScheduleModalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
      recalculateScheduleModal.show();
    });

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
        const estimatedStartValue = toDatetimeLocalFormat(competition.estimated_start_form);
        document.getElementById('editStartTime').value = estimatedStartValue;
        document.getElementById('editStatus').value = competition.status;
        const scheduleNotice = document.getElementById('scheduleConfigNotice');
        const hasScheduleConfig = competition.schedule_config !== null && competition.schedule_config !== undefined;
        editForm.dataset.schedule_config = hasScheduleConfig ? String(competition.schedule_config) : '';
        editForm.dataset.original_estimated_start = estimatedStartValue || '';
        if (scheduleNotice) {
          scheduleNotice.classList.toggle('d-none', !hasScheduleConfig);
        }

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
        if (editMaxTimeInput) {
          const existingMaxTimeSeconds = getCompetitionMaxTimeSeconds(competition);
          const existingMaxTimeNormalized = maxTimeSecondsToNormalized(existingMaxTimeSeconds) || '';
          editMaxTimeInput.value = existingMaxTimeNormalized;
          editMaxTimeInput.classList.remove('is-invalid');
          editForm.dataset.original_max_time = existingMaxTimeNormalized;
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
      const editForm = document.getElementById('editForm');
      const hasScheduleConfig = Boolean(editForm.dataset.schedule_config);
      const originalStart = editForm.dataset.original_estimated_start || '';
      const currentStart = document.getElementById('editStartTime').value || '';
      const originalMaxTime = editForm.dataset.original_max_time || '';
      const maxTimeInput = document.getElementById('editMaxTime');
      const maxTimeRaw = (maxTimeInput?.value || '').trim();
      const currentMaxTime = maxTimeRaw ? normalizeMaxTimeValue(maxTimeRaw) : '';
      const maxTimeChanged = currentMaxTime !== null && currentMaxTime !== originalMaxTime;
      let recalculateSchedule = false;

      if (hasScheduleConfig && originalStart !== currentStart && scheduleConfigWarningModal) {
        const confirmButton = document.getElementById('confirmScheduleConfigOverrideBtn');
        confirmButton.onclick = async () => {
          await saveCompetitionEdits(editModal, recalculateSchedule);
          scheduleConfigWarningModal.hide();
        };
        scheduleConfigWarningModal.show();
        return;
      }

      if (hasScheduleConfig && maxTimeChanged) {
        recalculateSchedule = await confirmRecalculateSchedule();
      }

      await saveCompetitionEdits(editModal, recalculateSchedule);
    });

    if (editMaxTimeInput) {
      editMaxTimeInput.addEventListener('input', () => {
        editMaxTimeInput.classList.remove('is-invalid');
      });
    }

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

    const createCompetitionsBtn = document.getElementById('createCompetitionsBtn');
    const createCompsSelectAllCategories = document.getElementById('createCompsSelectAllCategories');
    const createCompsSelectAllStyles = document.getElementById('createCompsSelectAllStyles');
    const createCompetitionsApplyBtn = document.getElementById('createCompetitionsApplyBtn');

    if (createCompetitionsBtn && createCompetitionsModal) {
      createCompetitionsBtn.addEventListener('click', async () => {
        await ensureCreateCompsSourceOptionsLoaded();
        renderCreateCompetitionsSelectionLists();
        updateCreateCompsSelectAllState('category');
        updateCreateCompsSelectAllState('style');
        updateCreateCompsSelectionSummary();
        clearCreateCompsResultPanel();
        createCompetitionsModal.show();
      });
    }

    if (createCompsSelectAllCategories) {
      createCompsSelectAllCategories.addEventListener('change', () => {
        setCreateCompsOptionsChecked('category', createCompsSelectAllCategories.checked);
        updateCreateCompsSelectAllState('category');
        updateCreateCompsSelectionSummary();
      });
    }

    if (createCompsSelectAllStyles) {
      createCompsSelectAllStyles.addEventListener('change', () => {
        setCreateCompsOptionsChecked('style', createCompsSelectAllStyles.checked);
        updateCreateCompsSelectAllState('style');
        updateCreateCompsSelectionSummary();
      });
    }

    if (createCompetitionsModalEl) {
      createCompetitionsModalEl.addEventListener('change', (event) => {
        if (!event.target.classList.contains('create-comps-option')) return;
        updateCreateCompsSelectAllState('category');
        updateCreateCompsSelectAllState('style');
        updateCreateCompsSelectionSummary();
      });
    }

    if (createCompetitionsApplyBtn) {
      createCompetitionsApplyBtn.addEventListener('click', async () => {
        const selectedCategories = getSelectedCreateCompsValues('category');
        const selectedStyles = getSelectedCreateCompsValues('style');

        if (!selectedCategories.length) {
          showMessageModal(
            t('create_competitions_missing_categories', 'Select at least one category.'),
            t('error_title', 'Error')
          );
          return;
        }

        if (!selectedStyles.length) {
          showMessageModal(
            t('create_competitions_missing_styles', 'Select at least one style.'),
            t('error_title', 'Error')
          );
          return;
        }

        createCompetitionsApplyBtn.disabled = true;
        const originalText = createCompetitionsApplyBtn.textContent;
        createCompetitionsApplyBtn.textContent = t('create_competitions_creating', 'Creating...');

        const combinations = [];
        selectedCategories.forEach((categoryId) => {
          selectedStyles.forEach((styleId) => {
            combinations.push({
              categoryId,
              styleId,
              categoryName: getSelectOptionLabel('categoryDropdown', categoryId),
              styleName: getSelectOptionLabel('styleDropdown', styleId)
            });
          });
        });

        const results = [];
        for (const combo of combinations) {
          const result = await createCompetitionRequest(combo.categoryId, combo.styleId);
          results.push({
            ...combo,
            ok: result.ok,
            message: result.message
          });
        }

        renderCreateCompsResults(results);
        await fetchCompetitionsFromAPI();

        createCompetitionsApplyBtn.disabled = false;
        createCompetitionsApplyBtn.textContent = originalText;
      });
    }

    const maxTimesAssignmentBtn = document.getElementById('maxTimesAssignmentBtn');
    const maxTimesSelectAllCategories = document.getElementById('maxTimesSelectAllCategories');
    const maxTimesSelectAllStyles = document.getElementById('maxTimesSelectAllStyles');
    const assignMaxTimesBtn = document.getElementById('assignMaxTimesBtn');
    const maxTimesValueInput = document.getElementById('maxTimesValue');

    if (maxTimesAssignmentBtn && maxTimesModal) {
      maxTimesAssignmentBtn.addEventListener('click', async () => {
        await ensureCreateCompsSourceOptionsLoaded();
        renderMaxTimesSelectionLists();
        if (maxTimesValueInput) {
          maxTimesValueInput.value = '';
          maxTimesValueInput.classList.remove('is-invalid');
        }
        updateMaxTimesSelectAllState('category');
        updateMaxTimesSelectAllState('style');
        updateMaxTimesSelectionSummary();
        maxTimesModal.show();
      });
    }

    if (maxTimesSelectAllCategories) {
      maxTimesSelectAllCategories.addEventListener('change', () => {
        setMaxTimesOptionsChecked('category', maxTimesSelectAllCategories.checked);
        updateMaxTimesSelectAllState('category');
        updateMaxTimesSelectionSummary();
      });
    }

    if (maxTimesSelectAllStyles) {
      maxTimesSelectAllStyles.addEventListener('change', () => {
        setMaxTimesOptionsChecked('style', maxTimesSelectAllStyles.checked);
        updateMaxTimesSelectAllState('style');
        updateMaxTimesSelectionSummary();
      });
    }

    if (maxTimesModalEl) {
      maxTimesModalEl.addEventListener('change', (event) => {
        if (!event.target.classList.contains('max-times-option')) return;
        updateMaxTimesSelectAllState('category');
        updateMaxTimesSelectAllState('style');
        updateMaxTimesSelectionSummary();
      });
    }

    if (maxTimesValueInput) {
      maxTimesValueInput.addEventListener('input', () => {
        maxTimesValueInput.classList.remove('is-invalid');
      });
    }

    if (assignMaxTimesBtn) {
      assignMaxTimesBtn.addEventListener('click', async () => {
        const selectedCategories = getSelectedMaxTimesValues('category');
        const selectedStyles = getSelectedMaxTimesValues('style');
        const maxTimeRaw = (maxTimesValueInput?.value || '').trim();
        const normalizedMaxTime = normalizeMaxTimeValue(maxTimeRaw);
        const maxTimeSeconds = maxTimeToSeconds(normalizedMaxTime);

        if (!selectedCategories.length) {
          showMessageModal(
            t('max_times_missing_categories', 'Select at least one category.'),
            t('error_title', 'Error')
          );
          return;
        }
        if (!selectedStyles.length) {
          showMessageModal(
            t('max_times_missing_styles', 'Selecciona al menos un estilo.'),
            t('error_title', 'Error')
          );
          return;
        }
        if (!normalizedMaxTime) {
          if (maxTimesValueInput) maxTimesValueInput.classList.add('is-invalid');
          showMessageModal(
            t('max_times_invalid_format', 'Enter a valid time in mm:ss format.'),
            t('error_title', 'Error')
          );
          return;
        }
        if (!Number.isFinite(maxTimeSeconds)) {
          if (maxTimesValueInput) maxTimesValueInput.classList.add('is-invalid');
          showMessageModal(
            t('max_times_invalid_format', 'Enter a valid time in mm:ss format.'),
            t('error_title', 'Error')
          );
          return;
        }

        if (maxTimesValueInput) {
          maxTimesValueInput.classList.remove('is-invalid');
          maxTimesValueInput.value = normalizedMaxTime;
        }

        const originalText = assignMaxTimesBtn.textContent;
        assignMaxTimesBtn.disabled = true;
        assignMaxTimesBtn.textContent = t('max_times_status_updating', 'Updating...');

        try {
          const response = await fetch(`${API_BASE_URL}/api/competitions/bulk-max-time`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_id: getEvent().id,
              category_list: selectedCategories,
              styles_list: selectedStyles,
              max_time: maxTimeSeconds
            })
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            showMessageModal(
              data?.error || t('max_times_request_error', 'Error assigning maximum times.'),
              t('error_title', 'Error')
            );
            return;
          }

          const successTemplate = t(
            'max_times_assignment_success',
            'Maximum time {time} ({seconds}s) assigned. Updated {updated} of {requested} combinations.'
          );
          const successMessage = successTemplate
            .replace('{time}', normalizedMaxTime)
            .replace('{seconds}', String(maxTimeSeconds))
            .replace('{updated}', String(data?.updated_competitions ?? 0))
            .replace('{requested}', String(data?.requested_pairs ?? (selectedCategories.length * selectedStyles.length)));

          showMessageModal(successMessage, t('max_times_info_title', 'Information'));
          maxTimesModal.hide();
          await fetchCompetitionsFromAPI();
        } catch (error) {
          console.error('Error assigning bulk max time:', error);
          showMessageModal(
            t('max_times_request_error', 'Error assigning maximum times.'),
            t('error_title', 'Error')
          );
        } finally {
          assignMaxTimesBtn.disabled = false;
          assignMaxTimesBtn.textContent = originalText;
        }
      });
    }
  });


async function loadCategories() {
  const categorySelect = document.getElementById('categoryDropdown');
  const categoryFilter = document.getElementById('categoryFilter');
  const defaultFilterOption = categoryFilter?.querySelector('option[value=""]')?.cloneNode(true);

  if (categorySelect) {
    categorySelect.innerHTML = '';
  }
  if (categoryFilter) {
    categoryFilter.innerHTML = '';
    if (defaultFilterOption) {
      categoryFilter.appendChild(defaultFilterOption);
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching categories');
    const categories = await response.json();
    categoriesCatalog = categories.map(category => ({
      value: String(category?.id ?? category),
      label: String(category?.name ?? category)
    }));

    categories.forEach(category => {
      const value = category.id || category;
      const label = category.name || category;

      if (categorySelect) {
        const option1 = document.createElement('option');
        option1.value = value;
        option1.textContent = label;
        categorySelect.appendChild(option1);
      }

      if (categoryFilter) {
        const option2 = document.createElement('option');
        option2.value = label;
        option2.textContent = label;
        categoryFilter.appendChild(option2);
      }
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadStyles() {
  const styleSelect = document.getElementById('styleDropdown');
  if (styleSelect) {
    styleSelect.innerHTML = '';
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/styles?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching styles');
    const styles = await response.json();
    stylesCatalog = styles.map(style => ({
      value: String(style?.id ?? style),
      label: String(style?.name ?? style)
    }));

    styles.forEach(style => {
      if (styleSelect) {
        const option = document.createElement('option');
        option.value = style.id || style;
        option.textContent = style.name || style;
        styleSelect.appendChild(option);
      }
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
      showMessageModal(data.error || 'Unknown error', 'Error eliminando la competiciÃ³n');
      return;
    }

  } catch (error) {
    console.error('Error al eliminar la competiciÃ³n:', error);
  }
}


function applyCategoryFilter() {
  const filter = document.getElementById('categoryFilter');
  const table = document.getElementById('competitionsTable');

  if (!filter || !table) return; // seguridad por si aÃºn no existen en el DOM

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

function renderMaxTimesSelectionListFromSelect(selectId, targetId, type) {
  const targetList = document.getElementById(targetId);
  if (!targetList) return;

  targetList.innerHTML = '';

  let options = [];
  const sourceSelect = document.getElementById(selectId);
  if (sourceSelect) {
    options = Array.from(sourceSelect.options)
      .filter(opt => !opt.disabled && String(opt.value || '').trim() !== '')
      .map(opt => ({ value: String(opt.value), label: opt.textContent || opt.label || String(opt.value) }));
  } else {
    const catalog = type === 'category' ? categoriesCatalog : stylesCatalog;
    options = catalog.map(item => ({ value: String(item.value), label: item.label }));
  }

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t('max_times_no_items', 'No hay elementos disponibles.');
    targetList.appendChild(empty);
    return;
  }

  options.forEach((option, index) => {
    const label = document.createElement('label');
    label.className = 'list-group-item d-flex align-items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input max-times-option';
    checkbox.dataset.type = type;
    checkbox.value = option.value;
    checkbox.id = `max-times-${type}-${index}`;

    const text = document.createElement('span');
    text.textContent = option.label;

    label.appendChild(checkbox);
    label.appendChild(text);
    targetList.appendChild(label);
  });
}

function renderMaxTimesSelectionLists() {
  renderMaxTimesSelectionListFromSelect('categoryDropdown', 'maxTimesCategoriesList', 'category');
  renderMaxTimesSelectionListFromSelect('styleDropdown', 'maxTimesStylesList', 'style');
}

function getMaxTimesSelectAllElement(type) {
  if (type === 'category') return document.getElementById('maxTimesSelectAllCategories');
  if (type === 'style') return document.getElementById('maxTimesSelectAllStyles');
  return null;
}

function setMaxTimesOptionsChecked(type, checked) {
  const options = document.querySelectorAll(`#maxTimesModal .max-times-option[data-type="${type}"]`);
  options.forEach(input => {
    input.checked = Boolean(checked);
  });
}

function updateMaxTimesSelectAllState(type) {
  const selectAllEl = getMaxTimesSelectAllElement(type);
  if (!selectAllEl) return;

  const allOptions = Array.from(document.querySelectorAll(`#maxTimesModal .max-times-option[data-type="${type}"]`));
  if (!allOptions.length) {
    selectAllEl.checked = false;
    selectAllEl.indeterminate = false;
    return;
  }

  const checkedCount = allOptions.filter(input => input.checked).length;
  selectAllEl.checked = checkedCount === allOptions.length;
  selectAllEl.indeterminate = checkedCount > 0 && checkedCount < allOptions.length;
}

function getSelectedMaxTimesValues(type) {
  return Array.from(document.querySelectorAll(`#maxTimesModal .max-times-option[data-type="${type}"]:checked`))
    .map(input => input.value);
}

function updateMaxTimesSelectionSummary() {
  const summaryEl = document.getElementById('maxTimesSelectionSummary');
  if (!summaryEl) return;

  const categoriesCount = getSelectedMaxTimesValues('category').length;
  const stylesCount = getSelectedMaxTimesValues('style').length;
  const summaryTemplate = t(
    'max_times_summary',
    'Selected: {categories} category(ies), {styles} style(s).'
  );
  summaryEl.textContent = summaryTemplate
    .replace('{categories}', String(categoriesCount))
    .replace('{styles}', String(stylesCount));
}

function normalizeMaxTimeValue(rawValue) {
  const match = String(rawValue || '').trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function maxTimeToSeconds(normalizedValue) {
  if (!normalizedValue) return null;

  const [minutesPart, secondsPart] = String(normalizedValue).split(':');
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return (minutes * 60) + seconds;
}

function maxTimeSecondsToNormalized(totalSeconds) {
  const parsedSeconds = Number(totalSeconds);
  if (!Number.isFinite(parsedSeconds) || parsedSeconds < 0) return null;

  const minutes = Math.floor(parsedSeconds / 60);
  const seconds = parsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getCompetitionMaxTimeSeconds(competition) {
  if (!competition) return null;

  const maxTimeAsNumber = Number(competition.max_time ?? competition.maxTime);
  if (Number.isFinite(maxTimeAsNumber) && maxTimeAsNumber >= 0) {
    return maxTimeAsNumber;
  }

  const maxTimeAsText = competition.max_time_form || competition.max_time_text || competition.max_time_display;
  const normalizedMaxTime = normalizeMaxTimeValue(maxTimeAsText);
  const parsedSeconds = maxTimeToSeconds(normalizedMaxTime);
  return Number.isFinite(parsedSeconds) ? parsedSeconds : null;
}

function getSelectOptionLabel(selectId, value) {
  const selectEl = document.getElementById(selectId);
  if (selectEl) {
    const option = Array.from(selectEl.options).find(opt => String(opt.value) === String(value));
    if (option) {
      return option.textContent || option.label || String(value);
    }
  }

  if (selectId === 'categoryDropdown') {
    const item = categoriesCatalog.find(cat => String(cat.value) === String(value));
    if (item) return item.label;
  }

  if (selectId === 'styleDropdown') {
    const item = stylesCatalog.find(style => String(style.value) === String(value));
    if (item) return item.label;
  }

  return String(value);
}

async function ensureCreateCompsSourceOptionsLoaded() {
  const categorySelect = document.getElementById('categoryDropdown');
  const categoriesLoaded = categoriesCatalog.length > 0 || (categorySelect && categorySelect.options.length > 0);
  if (!categoriesLoaded) {
    await loadCategories();
  }

  const styleSelect = document.getElementById('styleDropdown');
  const stylesLoaded = stylesCatalog.length > 0 || (styleSelect && styleSelect.options.length > 0);
  if (!stylesLoaded) {
    await loadStyles();
  }
}

function renderCreateCompsSelectionListFromSelect(selectId, targetId, type) {
  const targetList = document.getElementById(targetId);
  if (!targetList) return;

  targetList.innerHTML = '';

  let options = [];
  const sourceSelect = document.getElementById(selectId);
  if (sourceSelect) {
    options = Array.from(sourceSelect.options)
      .filter(opt => !opt.disabled && String(opt.value || '').trim() !== '')
      .map(opt => ({ value: String(opt.value), label: opt.textContent || opt.label || String(opt.value) }));
  } else {
    const catalog = type === 'category' ? categoriesCatalog : stylesCatalog;
    options = catalog.map(item => ({ value: String(item.value), label: item.label }));
  }

  if (!options.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = t('create_competitions_no_items', 'No items available.');
    targetList.appendChild(empty);
    return;
  }

  options.forEach((option, index) => {
    const label = document.createElement('label');
    label.className = 'list-group-item d-flex align-items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input create-comps-option';
    checkbox.dataset.type = type;
    checkbox.value = option.value;
    checkbox.id = `create-comps-${type}-${index}`;

    const text = document.createElement('span');
    text.textContent = option.label;

    label.appendChild(checkbox);
    label.appendChild(text);
    targetList.appendChild(label);
  });
}

function renderCreateCompetitionsSelectionLists() {
  renderCreateCompsSelectionListFromSelect('categoryDropdown', 'createCompsCategoriesList', 'category');
  renderCreateCompsSelectionListFromSelect('styleDropdown', 'createCompsStylesList', 'style');
}

function getCreateCompsSelectAllElement(type) {
  if (type === 'category') return document.getElementById('createCompsSelectAllCategories');
  if (type === 'style') return document.getElementById('createCompsSelectAllStyles');
  return null;
}

function setCreateCompsOptionsChecked(type, checked) {
  const options = document.querySelectorAll(`#createCompetitionsModal .create-comps-option[data-type="${type}"]`);
  options.forEach(input => {
    input.checked = Boolean(checked);
  });
}

function updateCreateCompsSelectAllState(type) {
  const selectAllEl = getCreateCompsSelectAllElement(type);
  if (!selectAllEl) return;

  const allOptions = Array.from(document.querySelectorAll(`#createCompetitionsModal .create-comps-option[data-type="${type}"]`));
  if (!allOptions.length) {
    selectAllEl.checked = false;
    selectAllEl.indeterminate = false;
    return;
  }

  const checkedCount = allOptions.filter(input => input.checked).length;
  selectAllEl.checked = checkedCount === allOptions.length;
  selectAllEl.indeterminate = checkedCount > 0 && checkedCount < allOptions.length;
}

function getSelectedCreateCompsValues(type) {
  return Array.from(document.querySelectorAll(`#createCompetitionsModal .create-comps-option[data-type="${type}"]:checked`))
    .map(input => input.value);
}

function updateCreateCompsSelectionSummary() {
  const summaryEl = document.getElementById('createCompsSelectionSummary');
  if (!summaryEl) return;

  const categoriesCount = getSelectedCreateCompsValues('category').length;
  const stylesCount = getSelectedCreateCompsValues('style').length;
  const summaryTemplate = t(
    'create_competitions_summary_selection',
    'Selected: {categories} category(ies), {styles} style(s).'
  );
  summaryEl.textContent = summaryTemplate
    .replace('{categories}', String(categoriesCount))
    .replace('{styles}', String(stylesCount));
}

function clearCreateCompsResultPanel() {
  const panelEl = document.getElementById('createCompsResultPanel');
  const summaryEl = document.getElementById('createCompsResultSummary');
  const listEl = document.getElementById('createCompsResultList');

  if (panelEl) panelEl.classList.add('d-none');
  if (summaryEl) summaryEl.textContent = '';
  if (listEl) listEl.innerHTML = '';
}

function renderCreateCompsResults(results) {
  const panelEl = document.getElementById('createCompsResultPanel');
  const summaryEl = document.getElementById('createCompsResultSummary');
  const listEl = document.getElementById('createCompsResultList');
  if (!panelEl || !summaryEl || !listEl) return;

  const okCount = results.filter(item => item.ok).length;
  const errorCount = results.length - okCount;
  const summaryTemplate = t(
    'create_competitions_results_summary',
    'Total: {total} | OK: {ok} | Error: {error}'
  );
  summaryEl.innerHTML = summaryTemplate
    .replace('{total}', `<strong>${results.length}</strong>`)
    .replace('{ok}', `<span class="text-success"><strong>${okCount}</strong></span>`)
    .replace('{error}', `<span class="text-danger"><strong>${errorCount}</strong></span>`);

  listEl.innerHTML = '';
  results.forEach((result) => {
    const row = document.createElement('div');
    row.className = 'list-group-item d-flex align-items-start justify-content-between gap-3';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'fw-semibold';
    title.textContent = `${result.categoryName} / ${result.styleName}`;
    const message = document.createElement('div');
    message.className = `small ${result.ok ? 'text-success' : 'text-danger'}`;
    message.textContent = result.message || (result.ok
      ? t('create_competitions_result_ok', 'Created')
      : t('create_competitions_result_error', 'Error'));

    left.appendChild(title);
    left.appendChild(message);

    const badge = document.createElement('span');
    badge.className = `badge ${result.ok ? 'bg-success' : 'bg-danger'}`;
    badge.textContent = result.ok
      ? t('create_competitions_result_ok_short', 'OK')
      : t('create_competitions_result_error_short', 'ERROR');

    row.appendChild(left);
    row.appendChild(badge);
    listEl.appendChild(row);
  });

  panelEl.classList.remove('d-none');
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
    max_time: getCompetitionMaxTimeSeconds(competition),
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


