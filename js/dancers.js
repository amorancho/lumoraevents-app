let dancers = [];
let clubsById = new Map();
var title = 'Dancers';

const allowedRoles = ["admin", "organizer"];
const allowedImportExtensions = ['xls', 'xlsx'];
const analyzeParticipantsEndpoints = [
  '/api/dancers/analyze-participants-file',
  '/api/dancers/analize-participants-file'
];
const createParticipantsEndpoints = [
  '/api/dancers/create-participants'
];
const importMappingStorageKey = 'dancers_import_mapping_presets_v1';
const importMappingLastStorageKey = 'dancers_import_mapping_last_v1';
const importMappingValues = new Set([
  '',
  'category',
  'style',
  'category_style',
  'style_category',
  'participant_name',
  'club_name',
  'origin_club_1',
  'origin_club_2',
  'club_email'
]);
const importState = {
  selectedFile: null,
  headerRowIndex: -1,
  columns: [],
  mappingByColumn: {},
  mappingSignature: '',
  analysis: null
};

const select = document.getElementById("nationality");

countries.forEach(c => {
  const option = document.createElement("option");
  option.value = c.code;
  option.textContent = `${c.code} - ${c.name}`;
  select.appendChild(option);
});

// Inicializamos Tom Select
const nationalityTomSelect = new TomSelect("#nationality", {
  maxOptions: 200,
  placeholder: "Type to search...",
  allowEmptyOption: true
});

function shouldShowDancerClubs() {
  const rawHasClubs = getEvent()?.hasClubs;
  if (rawHasClubs === true || rawHasClubs === 1) return true;
  if (typeof rawHasClubs === 'string') {
    const normalized = rawHasClubs.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function applyClubsVisibility() {
  const showClubs = shouldShowDancerClubs();

  const clubFilter = document.getElementById('clubFilter');
  if (clubFilter) {
    clubFilter.classList.toggle('d-none', !showClubs);
    if (!showClubs) {
      clubFilter.value = '';
    }
  }

  const clubHeader = document.getElementById('clubHeader');
  if (clubHeader) {
    clubHeader.classList.toggle('d-none', !showClubs);
  }

  const editClubRow = document.getElementById('editClubRow');
  if (editClubRow) {
    editClubRow.classList.toggle('d-none', !showClubs);
  }
}

function applyFlagsVisibility() {
  const showFlags = shouldShowDancerFlags();

  const nationalityFieldCol = document.getElementById('nationalityFieldCol');
  if (nationalityFieldCol) {
    nationalityFieldCol.classList.toggle('d-none', !showFlags);
  }

  const masterFieldCol = document.getElementById('masterFieldCol');
  if (masterFieldCol) {
    masterFieldCol.classList.remove('col-md-6', 'col-md-12');
    masterFieldCol.classList.add(showFlags ? 'col-md-6' : 'col-md-12');
  }

  const nationalityHeader = document.getElementById('nationalityHeader');
  if (nationalityHeader) {
    nationalityHeader.classList.toggle('d-none', !showFlags);
  }
}

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;
  await WaitEventLoaded();
  await ensureTranslationsReady();
  applyFlagsVisibility();
  applyClubsVisibility();

  const closedPanel = document.getElementById('closedPanel');

  if (getEvent().status == 'finished') {
      closedPanel.style.display = 'block';

      // deshabilitar inputs y botones
      document.querySelectorAll('input, button').forEach(el => {
        if (el.closest('#organizationSidebarToggle')) return;
        el.disabled = true;
      });
  }

  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  loadCategories();
  loadStyles();
  loadMasters(); 
  if (shouldShowDancerClubs()) {
    loadClubs();
  }

  fetchDancersFromAPI();

});

document.addEventListener('DOMContentLoaded', async function () {
  await ensureTranslationsReady();

  const editModalElement = document.getElementById('editModal');
  const editModal = new bootstrap.Modal(editModalElement);
  const filterCategory = document.getElementById('categoryFilter');
  const filterClub = document.getElementById('clubFilter');
  const filterStyle = document.getElementById('styleFilter');
  const codeLabel = document.getElementById('dancerCodeLabel');
  const currentUser = getUserFromToken();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const importDancersModalElement = document.getElementById('importDancersModal');
  const importFileInput = document.getElementById('importFileInput');
  const selectImportFileBtn = document.getElementById('selectImportFileBtn');
  const importDropzone = document.getElementById('importDropzone');
  const analyzeParticipantsFileBtn = document.getElementById('analyzeParticipantsFileBtn');
  const importCreateMissingEntitiesCheck = document.getElementById('importCreateMissingEntitiesCheck');
  const importParticipantsBtn = document.getElementById('importParticipantsBtn');

  const setCodeLabel = (value, forceShow = false) => {
    if (!codeLabel) return;
    if (!isAdmin || (!value && !forceShow)) {
      codeLabel.textContent = '';
      codeLabel.classList.add('d-none');
      return;
    }
    codeLabel.textContent = `Code: ${value || '-'}`;
    codeLabel.classList.remove('d-none');
  };

  filterCategory.addEventListener('change', () => {
    applyFilter();
  });

  if (filterClub) {
    filterClub.addEventListener('change', () => {
      applyFilter();
    });
  }

  filterStyle.addEventListener('change', () => {
    applyFilter();
  });

  editModalElement.addEventListener('shown.bs.modal', () => {
    if (document.getElementById('editForm').dataset.action === 'create') {
      document.getElementById('dancerName').focus();
    }
  });

  document.getElementById('createNewDancerBtn').addEventListener('click', function () {

    document.getElementById('editForm').dataset.action = 'create';
    
    // Vaciar los campos del modal
    document.getElementById('dancerName').value = '';
    document.getElementById('dancerEmail').value = '';
    document.getElementById('dancerLanguage').value = getEvent().language;
    document.getElementById('editCategory').selectedIndex = 0;
    document.getElementById('editMaster').selectedIndex = 0;
    document.getElementById('nationality').tomselect.setValue('');
    const editClubSelect = document.getElementById('editClub');
    if (editClubSelect) {
      editClubSelect.selectedIndex = 0;
    }
    document.getElementById('editStyles').selectedIndex = -1; // Deseleccionar todos los estilos
    setCodeLabel('', false);
    

    // Cambiar el título del modal si lo deseas
    document.querySelector('#editModal .modal-title span').textContent = t('create_dancer');

    editModal.show();
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('.btn-edit-dancer');

    if (button) {

      const editForm = document.getElementById('editForm');
      editForm.dataset.id = button.closest('tr').dataset.id;
      editForm.dataset.action = 'edit';

      const tr = button.closest('tr');
      const id = tr.dataset.id;

      const dancer = dancers.find(d => d.id == id);

      document.getElementById('dancerName').value = dancer.name;
      document.getElementById('dancerEmail').value = dancer.email;
      document.getElementById('dancerLanguage').value = dancer.language;
      document.getElementById('editCategory').value = dancer.category_id;
      document.getElementById('editMaster').value = dancer.master_id;
      document.getElementById('nationality').tomselect.setValue(dancer.nationality || '');
      if (shouldShowDancerClubs()) {
        document.getElementById('editClub').value = dancer.club_id;
      }

      const stylesOptions = document.getElementById('editStyles').options;
    
      Array.from(stylesOptions).forEach(opt => {
        opt.selected = dancer.styles.some(style => style.id == opt.value);
      });

      setCodeLabel(dancer.code, true);

      document.querySelector('#editModal .modal-title span').textContent = t('edit_dancer');

      editModal.show();

    } else if (event.target.closest('.btn-delete-dancer')) {

      const button = event.target.closest('.btn-delete-dancer');

      const tr = button.closest('tr');
      const id = tr.dataset.id;
      const dancer = dancers.find(d => d.id == id);

      dancerIdToDelete = id;

      const message = `${t('delete_question')} <strong>${dancer.name}</strong>?`;
      document.getElementById('deleteModalMessage').innerHTML = message;

      const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
      deleteModal.show();

      document.getElementById('confirmDeleteBtn').onclick = async () => {
        await deleteDancer(dancerIdToDelete);
        await fetchDancersFromAPI();
        applyFilter(); 
        deleteModal.hide();
      };

    }

  });

  document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('saveEditBtn');
    if (saveBtn.disabled) return; // prevención extra por si acaso

    saveBtn.disabled = true;  
    saveBtn.textContent = t('guardando'); // feedback opcional al usuario

    const action = document.getElementById('editForm').dataset.action;
    const id = document.getElementById('editForm').dataset.id;

    const inputName = document.getElementById('dancerName');
    const inputEmail = document.getElementById('dancerEmail');
    const inputLanguage = document.getElementById('dancerLanguage');
    const inputCategory = document.getElementById('editCategory');
    const inputMaster = document.getElementById('editMaster');
    const inputNationality = document.getElementById('nationality');
    const inputClub = document.getElementById('editClub');
    const inputStyles = document.getElementById('editStyles');

    const selectedValues = Array.from(inputStyles.selectedOptions).map(option => option.value); 

    const dancerData = {
      name: inputName.value.trim().toUpperCase(),
      category_id: parseInt(inputCategory.value, 10),
      styles: selectedValues,
      master_id: inputMaster.value ? parseInt(inputMaster.value, 10) : null,
      nationality: inputNationality.value.trim().toUpperCase() || null,
      event_id: getEvent().id,
      email: inputEmail.value.trim().toLowerCase(),
      language: inputLanguage.value,
      club_id: shouldShowDancerClubs() && inputClub.value ? parseInt(inputClub.value, 10) : null
    };

    try {
      let res;
      if (action === 'create') {
        res = await fetch(`${API_BASE_URL}/api/dancers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dancerData)
        });

      } else if (action === 'edit') {
        res = await fetch(`${API_BASE_URL}/api/dancers/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dancerData)
        });

      }

      if (!res.ok) {
        const errData = await res.json();
        showMessageModal(errData.error || 'Error saving dancer', 'Error');
        return;
      }

      await fetchDancersFromAPI(); 
      editModal.hide();
      applyFilter(); 
    } catch (err) {
      console.error(err);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = t('save');
    }
  });

  if (selectImportFileBtn && importFileInput) {
    selectImportFileBtn.addEventListener('click', () => {
      importFileInput.value = '';
      importFileInput.click();
    });
  }

  if (importFileInput) {
    importFileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      void handleImportParticipantsFileSelection(file);
    });
  }

  if (importDropzone) {
    importDropzone.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      importFileInput?.click();
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      importDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        importDropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      importDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        importDropzone.classList.remove('is-dragover');
      });
    });

    importDropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files && event.dataTransfer.files[0];
      void handleImportParticipantsFileSelection(file);
    });
  }

  if (analyzeParticipantsFileBtn) {
    analyzeParticipantsFileBtn.addEventListener('click', async () => {
      await analyzeParticipantsFile();
    });
  }

  if (importCreateMissingEntitiesCheck) {
    importCreateMissingEntitiesCheck.addEventListener('change', () => {
      refreshImportCreateButtonState();
    });
  }

  if (importParticipantsBtn) {
    importParticipantsBtn.addEventListener('click', async () => {
      await handleImportParticipantsClick();
    });
  }

  if (importDancersModalElement) {
    importDancersModalElement.addEventListener('hidden.bs.modal', () => {
      resetImportParticipantsState();
    });
  }

  resetImportParticipantsState();

});

async function fetchDancersFromAPI() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/dancers?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching dancers');
    dancers = await response.json();
    loadDancers();
  } catch (error) {
    console.error('Failed to fetch dancers:', error);
  }
}

function loadDancers() {
  const showFlags = shouldShowDancerFlags();
  const showClubs = shouldShowDancerClubs();
  const dancersTable = document.getElementById('dancersTable');
  dancersTable.innerHTML = ''; // Clear existing rows
  dancers.forEach(dancer => {

    let btnDisabled = '';
    if (getEvent().status === 'finished') {
      btnDisabled = 'disabled';
    }

    const row = document.createElement('tr');
    row.dataset.id = dancer.id;
    row.dataset.club_id = dancer.club_id ? String(dancer.club_id) : '';
    row.dataset.style_ids = Array.isArray(dancer.styles)
      ? dancer.styles
        .map(style => String(style.id ?? style).trim())
        .filter(Boolean)
        .join(',')
      : '';

    let stylesSpans = Array.isArray(dancer.styles) && dancer.styles.length > 0
      ? dancer.styles.map(style => `<span class="badge bg-warning text-dark me-1">${style.name}</span>`).join('')
      : `<span class="badge bg-secondary" data-i18n="no_styles">${t('no_styles')}</span>`;
    const clubName = dancer.club_name || clubsById.get(String(dancer.club_id || '')) || '';

    row.innerHTML = `
      <td class="align-middle">
        <div class="d-flex align-items-center">
          ${getDancerFlagImgHtml(dancer.nationality, { className: 'me-2', style: 'vertical-align: middle;' })}
          <span>${dancer.name}</span>
        </div>
      </td>
      <td class="align-middle">${dancer.category_name}</td>
      <td class="align-middle">${stylesSpans}</td>
      ${showClubs ? `<td class="align-middle">${clubName}</td>` : ''}
      <td class="align-middle">
        <i class="bi bi-people me-1 text-muted"></i>
        ${dancer.master_name || ''}
      </td>
      ${showFlags ? `<td class="align-middle">${dancer.nationality || ''}</td>` : ''}
      <td class="text-center align-middle">
          <div class="btn-group" role="group">
              <button type="button" class="btn btn-outline-primary btn-sm btn-edit-dancer" title="Edit" ${btnDisabled}>
                  <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn btn-outline-danger btn-sm btn-delete-dancer" title="Delete" ${btnDisabled}>
                  <i class="bi bi-trash"></i>
              </button>
          </div>
      </td>
    `;
    dancersTable.appendChild(row);
  });

  applyFilter();
}

async function loadCategories() {
  const categorySelect = document.getElementById('editCategory');
  categorySelect.innerHTML = ''; // Limpiar opciones anteriores

  const categoryFilter = document.getElementById('categoryFilter');
  const selectedFilterValue = categoryFilter ? categoryFilter.value : '';
  if (categoryFilter) {
    categoryFilter.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = t('all_categories', 'All Categories');
    categoryFilter.appendChild(defaultOption);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching categories');
    const categories = await response.json();

    const emptyOption1 = document.createElement('option');
    emptyOption1.value = '';
    emptyOption1.textContent = '';
    categorySelect.appendChild(emptyOption1);

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

    if (categoryFilter) {
      const hasPreviousSelection = selectedFilterValue && categoryFilter.querySelector(`option[value="${selectedFilterValue}"]`);
      categoryFilter.value = hasPreviousSelection ? selectedFilterValue : '';
    }
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadStyles() {
  const styleSelect = document.getElementById('editStyles');
  styleSelect.innerHTML = ''; // Limpiar opciones anteriores
  const styleFilter = document.getElementById('styleFilter');
  const selectedStyleFilterValue = styleFilter ? styleFilter.value : '';
  if (styleFilter) {
    styleFilter.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = t('all_styles', 'All Styles');
    styleFilter.appendChild(defaultOption);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/styles?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching styles');
    const styles = await response.json();

    styles.forEach(style => {
      const option = document.createElement('option');
      option.value = style.id || style;
      option.textContent = style.name || style;
      styleSelect.appendChild(option);

      if (styleFilter) {
        const optionFilter = document.createElement('option');
        optionFilter.value = String(style.id || style);
        optionFilter.textContent = style.name || style;
        styleFilter.appendChild(optionFilter);
      }
    });

    if (styleFilter) {
      const hasPreviousSelection = selectedStyleFilterValue && styleFilter.querySelector(`option[value="${selectedStyleFilterValue}"]`);
      styleFilter.value = hasPreviousSelection ? selectedStyleFilterValue : '';
    }
  } catch (err) {
    console.error('Failed to load styles:', err);
  }
}

async function loadMasters() {
  const masterSelect = document.getElementById('editMaster');
  masterSelect.innerHTML = ''; // Limpiar opciones anteriores

  try {
    const response = await fetch(`${API_BASE_URL}/api/judges?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching masters');
    const masters = await response.json();

    const emptyOption1 = document.createElement('option');
    emptyOption1.value = '';
    emptyOption1.textContent = '';
    masterSelect.appendChild(emptyOption1);

    masters.forEach(master => {
      if (master.ismaster == 1) {
        const option = document.createElement('option');
        option.value = master.id;
        option.textContent = master.name;
        masterSelect.appendChild(option);
      }
    });
  } catch (err) {
    console.error('Failed to load masters:', err);
  }
}

async function loadClubs() {
  if (!shouldShowDancerClubs()) {
    clubsById = new Map();
    return;
  }

  const clubSelect = document.getElementById('editClub');
  clubSelect.innerHTML = ''; // Limpiar opciones anteriores

  const clubFilter = document.getElementById('clubFilter');
  clubsById = new Map();

  try {
    const response = await fetch(`${API_BASE_URL}/api/clubs?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching clubs');
    const clubs = await response.json();

    const emptyOption1 = document.createElement('option');
    emptyOption1.value = '';
    emptyOption1.textContent = '';
    clubSelect.appendChild(emptyOption1);

    clubs.forEach(club => {
      clubsById.set(String(club.id || club), club.name || club);

      const option1 = document.createElement('option');
      option1.value = club.id || club; // por si es string directo
      option1.textContent = club.name || club;
      clubSelect.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = club.id || club; // por si es string directo
      option2.textContent = club.name || club;
      clubFilter.appendChild(option2);
    });

    if (Array.isArray(dancers) && dancers.length > 0) {
      loadDancers();
    }
  } catch (err) {
    console.error('Failed to load clubs:', err);
  }
}

async function getDancerById(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/dancers/${id}`);
    if (!res.ok) throw new Error(`Error ${res.status} al recuperar la bailarina`);
    return await res.json();
  } catch (err) {
    console.error('Error al obtener la bailarina:', err);
    return null;
  }
}

async function deleteDancer(dancerIdToDelete) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/dancers/${dancerIdToDelete}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const errData = await res.json();
      showMessageModal(errData.error || 'Error deleting dancer', 'Error');
      return;
    }

  } catch (error) {
    console.error('Error al eliminar la bailarina:', error);
  }
}

function applyFilter() {
  const filterCategory = document.getElementById('categoryFilter').value.toLowerCase();
  const hasClubs = shouldShowDancerClubs();
  const filterClub = hasClubs ? (document.getElementById('clubFilter')?.value || '') : '';
  const filterStyle = document.getElementById('styleFilter').value;
  const rows = document.querySelectorAll('#dancersTable tr');

  rows.forEach(row => {
    const category = row.children[1]?.textContent.trim().toLowerCase();
    const club_id = row.dataset.club_id;
    const styleIds = (row.dataset.style_ids || '').split(',').filter(Boolean);

    if (
      (!filterCategory || category === filterCategory) &&
      (!filterClub || club_id === filterClub) &&
      (!filterStyle || styleIds.includes(filterStyle))
    ) {
      row.classList.remove('d-none');
    } else {
      row.classList.add('d-none');
    }
  });

  // Mostrar o no el empty state
  const visibleRows = Array.from(rows).filter(row => !row.classList.contains('d-none'));
  updateDancersCounter(rows.length, visibleRows.length);
  document.getElementById('emptyState').classList.toggle('d-none', visibleRows.length > 0);
}

function updateDancersCounter(totalCount, visibleCount) {
  const countEl = document.getElementById('count-dancers');
  if (!countEl) return;

  const categoryFilterValue = document.getElementById('categoryFilter')?.value || '';
  const clubFilterValue = shouldShowDancerClubs() ? (document.getElementById('clubFilter')?.value || '') : '';
  const styleFilterValue = document.getElementById('styleFilter')?.value || '';
  const hasActiveFilters = Boolean(categoryFilterValue || clubFilterValue || styleFilterValue);

  if (hasActiveFilters) {
    countEl.textContent = `${visibleCount} / ${totalCount}`;
    return;
  }

  countEl.textContent = `${totalCount}`;
}

function resetImportParticipantsState() {
  importState.selectedFile = null;
  importState.headerRowIndex = -1;
  importState.columns = [];
  importState.mappingByColumn = {};
  importState.mappingSignature = '';
  importState.analysis = null;

  const importFileInput = document.getElementById('importFileInput');
  const selectedFileName = document.getElementById('importSelectedFileName');
  const analyzeBtn = document.getElementById('analyzeParticipantsFileBtn');
  const resultsWrap = document.getElementById('importAnalyzeResults');
  const apiResultsWrap = document.getElementById('importApiAnalyzeResults');
  const mappingsTableBody = document.getElementById('importMappingsTableBody');
  const headerRowInfo = document.getElementById('importDetectedHeaderRowInfo');
  const validationFeedback = document.getElementById('importMappingValidationFeedback');
  const categoriesList = document.getElementById('importCategoriesList');
  const stylesList = document.getElementById('importStylesList');
  const clubsList = document.getElementById('importClubsList');
  const existingCount = document.getElementById('importExistingCount');
  const toCreateCount = document.getElementById('importToCreateCount');
  const createMissingEntitiesCheck = document.getElementById('importCreateMissingEntitiesCheck');
  const importParticipantsBtn = document.getElementById('importParticipantsBtn');

  if (importFileInput) {
    importFileInput.value = '';
  }
  if (selectedFileName) {
    selectedFileName.textContent = t('import_no_file_selected', 'No file selected');
  }
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = t('analyze_file', 'Analyze file');
  }
  if (resultsWrap) {
    resultsWrap.classList.add('d-none');
  }
  if (apiResultsWrap) {
    apiResultsWrap.classList.add('d-none');
  }
  if (mappingsTableBody) {
    mappingsTableBody.innerHTML = '';
  }
  if (headerRowInfo) {
    headerRowInfo.textContent = '';
  }
  if (validationFeedback) {
    validationFeedback.textContent = '';
    validationFeedback.classList.remove('text-success', 'text-danger');
  }
  if (categoriesList) {
    categoriesList.innerHTML = '';
  }
  if (stylesList) {
    stylesList.innerHTML = '';
  }
  if (clubsList) {
    clubsList.innerHTML = '';
  }
  if (existingCount) {
    existingCount.textContent = '0';
  }
  if (toCreateCount) {
    toCreateCount.textContent = '0';
  }
  if (createMissingEntitiesCheck) {
    createMissingEntitiesCheck.checked = true;
  }
  if (importParticipantsBtn) {
    importParticipantsBtn.disabled = true;
    importParticipantsBtn.textContent = t('import_participants', 'Import participants');
  }

  setImportMappingsPanelExpanded(false);
}

function isValidParticipantsImportFile(file) {
  if (!file || !file.name) return false;
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (allowedImportExtensions.includes(extension)) {
    return true;
  }

  const mimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  return mimeTypes.includes(file.type);
}

async function handleImportParticipantsFileSelection(file) {
  const importFileInput = document.getElementById('importFileInput');
  const selectedFileName = document.getElementById('importSelectedFileName');
  const analyzeBtn = document.getElementById('analyzeParticipantsFileBtn');
  const resultsWrap = document.getElementById('importAnalyzeResults');

  if (!file) {
    resetImportParticipantsState();
    return;
  }

  if (!isValidParticipantsImportFile(file)) {
    resetImportParticipantsState();
    if (importFileInput) importFileInput.value = '';
    showMessageModal(
      t('import_invalid_file_type', 'Select a valid Excel file (.xls or .xlsx).'),
      t('import_invalid_file_title', 'Invalid file')
    );
    return;
  }

  importState.selectedFile = file;

  if (selectedFileName) {
    selectedFileName.textContent = `${t('import_selected_file', 'Selected file')}: ${file.name}`;
  }
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
  }

  try {
    const parsed = await parseParticipantsImportFile(file);
    importState.headerRowIndex = parsed.headerRowIndex;
    importState.columns = parsed.columns;
    importState.mappingSignature = buildImportMappingSignature(parsed.columns);

    const savedPresets = getSavedImportMappingPresets();
    const savedForSignature = savedPresets[importState.mappingSignature] || {};
    const hasSavedSignatureConfig = hasSavedImportMappingConfig(savedForSignature, importState.columns);
    const lastByHeader = getLastImportHeaderMapping();

    importState.mappingByColumn = buildInitialImportMapping(
      importState.columns,
      savedForSignature,
      lastByHeader
    );
    importState.analysis = null;

    resetImportAnalysisResultsUi();
    renderImportMappingsTable();
    updateImportMappingValidationHint();
    persistCurrentImportMappings();

    if (resultsWrap) {
      resultsWrap.classList.remove('d-none');
    }
    setImportMappingsPanelExpanded(!hasSavedSignatureConfig);
    if (analyzeBtn) {
      analyzeBtn.disabled = importState.columns.length === 0;
    }
  } catch (error) {
    console.error('Error parsing participants import file:', error);
    resetImportParticipantsState();
    if (selectedFileName) {
      selectedFileName.textContent = `${t('import_selected_file', 'Selected file')}: ${file.name}`;
    }
    showMessageModal(
      error.message || t('import_analyze_error', 'Could not analyze file.'),
      t('error', 'Error')
    );
  }
}

async function analyzeParticipantsFile() {
  if (!importState.selectedFile) return;

  const analyzeBtn = document.getElementById('analyzeParticipantsFileBtn');
  if (!analyzeBtn) return;

  const baseLabel = t('analyze_file', 'Analyze file');
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = t('analyzing_file', 'Analyzing file...');

  try {
    const validation = validateImportMappings(importState.mappingByColumn);
    if (!validation.isValid) {
      throw new Error(validation.errors.join('\n'));
    }

    persistCurrentImportMappings();
    const payload = buildImportMappingPayload();
    const response = await requestParticipantsImportAnalysis({
      eventId: getEvent().id,
      file: importState.selectedFile,
      mapping: payload.mapping
    });

    applyImportApiAnalysis(response || {});
  } catch (error) {
    console.error('Error validating participants mapping:', error);
    showMessageModal(error.message || t('import_analyze_error', 'Could not analyze file.'), t('error', 'Error'));
  } finally {
    analyzeBtn.disabled = importState.columns.length === 0;
    analyzeBtn.textContent = baseLabel;
    updateImportMappingValidationHint();
  }
}

async function requestParticipantsImportAnalysis({ eventId, file, mapping }) {
  let lastError = null;

  for (let index = 0; index < analyzeParticipantsEndpoints.length; index += 1) {
    const path = analyzeParticipantsEndpoints[index];
    const endpoint = `${API_BASE_URL}${path}?event_id=${encodeURIComponent(eventId)}`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('event_id', `${eventId}`);
    formData.append('mapping', JSON.stringify(mapping || {}));

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      let data = null;
      try {
        data = await response.json();
      } catch (parseError) {
        data = null;
      }

      if (response.ok) {
        return data || {};
      }

      if (response.status === 404 && index < (analyzeParticipantsEndpoints.length - 1)) {
        continue;
      }

      const responseError = new Error(data?.error || t('import_analyze_error', 'Could not analyze file.'));
      responseError.statusCode = response.status;
      throw responseError;
    } catch (error) {
      lastError = error;
      const canRetryWithNextEndpoint = (
        (error?.statusCode === 404 || /404/.test(`${error?.message || ''}`))
        && index < (analyzeParticipantsEndpoints.length - 1)
      );
      if (!canRetryWithNextEndpoint) {
        throw error;
      }
    }
  }

  throw lastError || new Error(t('import_analyze_error', 'Could not analyze file.'));
}

function resetImportAnalysisResultsUi() {
  const apiResultsWrap = document.getElementById('importApiAnalyzeResults');
  const categoriesList = document.getElementById('importCategoriesList');
  const stylesList = document.getElementById('importStylesList');
  const clubsList = document.getElementById('importClubsList');
  const existingCount = document.getElementById('importExistingCount');
  const toCreateCount = document.getElementById('importToCreateCount');
  const importParticipantsBtn = document.getElementById('importParticipantsBtn');

  if (apiResultsWrap) {
    apiResultsWrap.classList.add('d-none');
  }
  if (categoriesList) {
    categoriesList.innerHTML = '';
  }
  if (stylesList) {
    stylesList.innerHTML = '';
  }
  if (clubsList) {
    clubsList.innerHTML = '';
  }
  if (existingCount) {
    existingCount.textContent = '0';
  }
  if (toCreateCount) {
    toCreateCount.textContent = '0';
  }
  if (importParticipantsBtn) {
    importParticipantsBtn.disabled = true;
    importParticipantsBtn.textContent = t('import_participants', 'Import participants');
  }
}

function applyImportApiAnalysis(data) {
  const receivedCategories = Array.isArray(data?.receivedCategories) ? data.receivedCategories : [];
  const receivedStyles = Array.isArray(data?.receivedStyles) ? data.receivedStyles : [];
  const receivedClubs = Array.isArray(data?.receivedClubs) ? data.receivedClubs : [];
  const participants = Array.isArray(data?.participants) ? data.participants : [];

  importState.analysis = {
    receivedCategories,
    receivedStyles,
    receivedClubs,
    participants
  };

  renderImportDetectedList('category', receivedCategories);
  renderImportDetectedList('style', receivedStyles);
  renderImportDetectedList('club', receivedClubs);
  refreshImportParticipantsSummary(participants);

  const apiResultsWrap = document.getElementById('importApiAnalyzeResults');
  if (apiResultsWrap) {
    apiResultsWrap.classList.remove('d-none');
  }
  refreshImportCreateButtonState();
}

function renderImportDetectedList(type, items) {
  const listElementByType = {
    category: document.getElementById('importCategoriesList'),
    style: document.getElementById('importStylesList'),
    club: document.getElementById('importClubsList')
  };
  const listEl = listElementByType[type];
  if (!listEl) return;

  listEl.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-group-item text-muted';
    empty.textContent = type === 'category'
      ? 'No se detectaron categorias.'
      : type === 'style'
        ? 'No se detectaron estilos.'
        : 'No se detectaron clubs.';
    listEl.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'list-group-item';

    const top = document.createElement('div');
    top.className = 'd-flex flex-wrap justify-content-between align-items-center gap-2';

    const name = document.createElement('div');
    name.className = 'fw-semibold';
    name.textContent = `${item?.name || ''}`.trim() || '-';
    top.appendChild(name);

    const mappedId = type === 'category'
      ? item?.categoryId
      : type === 'style'
        ? item?.styleId
        : item?.clubId;

    const statusBadge = document.createElement('span');
    statusBadge.className = mappedId ? 'badge text-bg-success' : 'badge text-bg-warning';
    statusBadge.textContent = mappedId ? 'Encontrado' : 'No encontrado';
    top.appendChild(statusBadge);
    row.appendChild(top);

    listEl.appendChild(row);
  });
}

function refreshImportParticipantsSummary(participants) {
  const list = Array.isArray(participants) ? participants : [];
  const existingCountValue = list.filter((participant) => Boolean(participant?.exists)).length;
  const toCreateCountValue = list.filter((participant) => !Boolean(participant?.exists)).length;

  const existingCount = document.getElementById('importExistingCount');
  const toCreateCount = document.getElementById('importToCreateCount');

  if (existingCount) {
    existingCount.textContent = `${existingCountValue}`;
  }
  if (toCreateCount) {
    toCreateCount.textContent = `${toCreateCountValue}`;
  }
}

function refreshImportCreateButtonState() {
  const importParticipantsBtn = document.getElementById('importParticipantsBtn');
  if (!importParticipantsBtn) return;

  const hasAnalysis = Array.isArray(importState.analysis?.participants);
  importParticipantsBtn.disabled = !hasAnalysis;
}

function normalizeImportCompareValue(value) {
  return normalizeImportLabel(value || '');
}

function buildCreateParticipantsPayload(createMissingEntities) {
  const analysis = importState.analysis || {};
  const receivedCategories = Array.isArray(analysis.receivedCategories) ? analysis.receivedCategories : [];
  const receivedStyles = Array.isArray(analysis.receivedStyles) ? analysis.receivedStyles : [];
  const receivedClubs = Array.isArray(analysis.receivedClubs) ? analysis.receivedClubs : [];
  const participants = Array.isArray(analysis.participants) ? analysis.participants : [];

  const createCategories = createMissingEntities
    ? [...new Set(
      receivedCategories
        .filter((item) => !item?.categoryId)
        .map((item) => `${item?.name || ''}`.trim())
        .filter(Boolean)
    )]
    : [];

  const createStyles = createMissingEntities
    ? [...new Set(
      receivedStyles
        .filter((item) => !item?.styleId)
        .map((item) => `${item?.name || ''}`.trim())
        .filter(Boolean)
    )]
    : [];

  const createClubs = createMissingEntities
    ? receivedClubs
      .filter((item) => !item?.clubId)
      .map((item) => ({
        name: `${item?.name || ''}`.trim(),
        email: item?.email_assigned || null,
        location: item?.location_assigned || null
      }))
      .filter((item) => item.name)
    : [];

  const participantsPayload = [];
  const skippedParticipants = [];

  participants.forEach((participant) => {
    if (!participant || typeof participant !== 'object') return;

    const name = `${participant?.name || ''}`.trim();
    if (!name) return;

    const hasMissingCategory = !participant?.categoryId && !!`${participant?.category_assigned || ''}`.trim();
    const hasMissingStyle = !participant?.styleId && !!`${participant?.style_assigned || ''}`.trim();

    if (!createMissingEntities && (hasMissingCategory || hasMissingStyle)) {
      skippedParticipants.push(name);
      return;
    }

    if (!participant?.categoryId && !`${participant?.category_assigned || ''}`.trim()) {
      skippedParticipants.push(name);
      return;
    }

    participantsPayload.push({
      name,
      exists: Boolean(participant?.exists),
      categoryId: participant?.categoryId ?? null,
      styleId: participant?.styleId ?? null,
      clubId: participant?.clubId ?? null,
      category_assigned: participant?.category_assigned || null,
      style_assigned: participant?.style_assigned || null,
      club_assigned: participant?.club_assigned || null,
      club_email_assigned: participant?.club_email_assigned || null,
      club_location_assigned: participant?.club_location_assigned || null
    });
  });

  return {
    createCategories,
    createStyles,
    createClubs,
    participantsPayload,
    skippedParticipants
  };
}

function estimateModifiedParticipants(participantsPayload) {
  if (!Array.isArray(participantsPayload) || participantsPayload.length === 0) {
    return 0;
  }

  const dancersByKey = new Map();
  (Array.isArray(dancers) ? dancers : []).forEach((dancer) => {
    const categoryId = Number(dancer?.category_id);
    if (Number.isNaN(categoryId)) return;
    const nameKey = normalizeImportCompareValue(dancer?.name);
    if (!nameKey) return;
    dancersByKey.set(`${categoryId}::${nameKey}`, dancer);
  });

  let modifiedCount = 0;

  participantsPayload.forEach((participant) => {
    const categoryId = Number(participant?.categoryId);
    if (Number.isNaN(categoryId)) return;

    const participantKey = `${categoryId}::${normalizeImportCompareValue(participant?.name)}`;
    const existing = dancersByKey.get(participantKey);
    if (!existing) return;

    const existingStyleIds = Array.isArray(existing?.styles)
      ? existing.styles
        .map((style) => Number(style?.id ?? style))
        .filter((value) => !Number.isNaN(value))
      : [];
    const existingStyleNames = Array.isArray(existing?.styles)
      ? existing.styles
        .map((style) => normalizeImportCompareValue(style?.name ?? ''))
        .filter(Boolean)
      : [];

    let shouldAddStyle = false;
    const participantStyleId = participant?.styleId === null || participant?.styleId === undefined || participant?.styleId === ''
      ? null
      : Number(participant.styleId);

    if (participantStyleId !== null && !Number.isNaN(participantStyleId)) {
      shouldAddStyle = !existingStyleIds.includes(participantStyleId);
    } else {
      const styleAssignedKey = normalizeImportCompareValue(participant?.style_assigned || '');
      if (styleAssignedKey) {
        shouldAddStyle = !existingStyleNames.includes(styleAssignedKey);
      }
    }

    const participantClubId = participant?.clubId === null || participant?.clubId === undefined || participant?.clubId === ''
      ? null
      : Number(participant.clubId);
    const existingClubId = existing?.club_id === null || existing?.club_id === undefined || existing?.club_id === ''
      ? null
      : Number(existing.club_id);

    let shouldAssignClub = false;
    if (participantClubId !== null && !Number.isNaN(participantClubId)) {
      shouldAssignClub = participantClubId !== existingClubId;
    } else {
      const assignedClubKey = normalizeImportCompareValue(participant?.club_assigned || '');
      if (assignedClubKey) {
        const existingClubName = `${existing?.club_name || clubsById.get(String(existing?.club_id || '')) || ''}`.trim();
        const existingClubKey = normalizeImportCompareValue(existingClubName);
        shouldAssignClub = assignedClubKey !== existingClubKey;
      }
    }

    if (shouldAddStyle || shouldAssignClub) {
      modifiedCount += 1;
    }
  });

  return modifiedCount;
}

async function requestCreateParticipants({ eventId, payload }) {
  let lastError = null;

  for (let index = 0; index < createParticipantsEndpoints.length; index += 1) {
    const endpoint = `${API_BASE_URL}${createParticipantsEndpoints[index]}?event_id=${encodeURIComponent(eventId)}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          create_categories: payload.createCategories,
          create_styles: payload.createStyles,
          create_clubs: payload.createClubs,
          participants: payload.participantsPayload
        })
      });

      let data = null;
      try {
        data = await response.json();
      } catch (parseError) {
        data = null;
      }

      if (response.ok) {
        return data || {};
      }

      throw new Error(data?.error || t('import_create_error', 'Could not create participants.'));
    } catch (error) {
      lastError = error;
      if (index >= (createParticipantsEndpoints.length - 1)) {
        throw error;
      }
    }
  }

  throw lastError || new Error(t('import_create_error', 'Could not create participants.'));
}

async function handleImportParticipantsClick() {
  if (!importState.analysis || !Array.isArray(importState.analysis.participants)) return;

  const importParticipantsBtn = document.getElementById('importParticipantsBtn');
  const createMissingEntitiesCheck = document.getElementById('importCreateMissingEntitiesCheck');
  const createMissingEntities = createMissingEntitiesCheck?.checked ?? true;

  const payload = buildCreateParticipantsPayload(createMissingEntities);

  if (!payload.participantsPayload.length) {
    const message = payload.skippedParticipants.length > 0
      ? 'No hay participantes validos para crear/modificar con la configuracion actual.'
      : t('import_no_participants_to_create', 'There are no participants to create.');
    showMessageModal(message, t('import_dancers', 'Import dancers'));
    return;
  }

  const estimatedModifiedParticipants = estimateModifiedParticipants(payload.participantsPayload);
  const originalButtonText = importParticipantsBtn ? importParticipantsBtn.textContent : '';
  if (importParticipantsBtn) {
    importParticipantsBtn.disabled = true;
    importParticipantsBtn.textContent = t('importing_participants', 'Importing...');
  }

  try {
    const response = await requestCreateParticipants({
      eventId: getEvent().id,
      payload
    });

    const createdCategoriesCount = Array.isArray(response?.createdCategories) ? response.createdCategories.length : 0;
    const createdStylesCount = Array.isArray(response?.createdStyles) ? response.createdStyles.length : 0;
    const createdClubsCount = Array.isArray(response?.createdClubs) ? response.createdClubs.length : 0;
    const createdParticipantsCount = Array.isArray(response?.createdParticipants) ? response.createdParticipants.length : 0;
    const modifiedParticipantsCount = Math.max(0, estimatedModifiedParticipants);
    const skippedParticipantsCount = Array.isArray(payload?.skippedParticipants) ? payload.skippedParticipants.length : 0;

    const summaryMessage = [
      `Categorias creadas: ${createdCategoriesCount}`,
      `Estilos creados: ${createdStylesCount}`,
      `Clubs creados: ${createdClubsCount}`,
      `Participantes creados: ${createdParticipantsCount}`,
      `Participantes modificados: ${modifiedParticipantsCount}`,
      `Participantes omitidos: ${skippedParticipantsCount}`
    ].join('. ');

    const importModalEl = document.getElementById('importDancersModal');
    if (importModalEl) {
      const importModal = bootstrap.Modal.getInstance(importModalEl) || new bootstrap.Modal(importModalEl);
      importModal.hide();
    }

    await Promise.all([
      loadCategories(),
      loadStyles(),
      shouldShowDancerClubs() ? loadClubs() : Promise.resolve()
    ]);
    await fetchDancersFromAPI();
    applyFilter();

    showMessageModal(summaryMessage, t('import_dancers', 'Import dancers'), 'success');
  } catch (error) {
    console.error('Error creating participants:', error);
    showMessageModal(error.message || t('import_create_error', 'Could not create participants.'), t('error', 'Error'));
  } finally {
    const modalVisible = Boolean(document.getElementById('importDancersModal')?.classList.contains('show'));
    if (importParticipantsBtn && modalVisible) {
      importParticipantsBtn.disabled = false;
      importParticipantsBtn.textContent = originalButtonText || t('import_participants', 'Import participants');
    }
  }
}

async function parseParticipantsImportFile(file) {
  if (typeof XLSX === 'undefined') {
    throw new Error('The Excel parser is not available in this browser.');
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames[0] : null;
  if (!firstSheetName || !workbook.Sheets[firstSheetName]) {
    throw new Error('The file does not contain any worksheet.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rowsRaw = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false
  });

  const rows = Array.isArray(rowsRaw)
    ? rowsRaw.map((row) => (Array.isArray(row) ? row : []))
    : [];

  if (!rows.length) {
    throw new Error('The file is empty.');
  }

  const headerRowIndex = detectParticipantsHeaderRowIndex(rows);
  const maxColumns = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const columns = [];

  for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
    const rawHeader = rows[headerRowIndex]?.[columnIndex];
    const originalHeader = cleanImportCellValue(rawHeader);
    const sampleValue = getFirstColumnSampleValue(rows, headerRowIndex, columnIndex);

    let hasDataInColumn = false;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      if (rowIndex === headerRowIndex) continue;
      if (cleanImportCellValue(rows[rowIndex]?.[columnIndex])) {
        hasDataInColumn = true;
        break;
      }
    }

    if (!originalHeader && !hasDataInColumn) continue;

    columns.push({
      columnIndex,
      columnLabel: buildSpreadsheetColumnLabel(columnIndex),
      headerLabel: originalHeader || `Column ${columnIndex + 1}`,
      originalHeader,
      sampleValue
    });
  }

  if (!columns.length) {
    throw new Error('No usable columns were detected in the file.');
  }

  return {
    headerRowIndex,
    columns
  };
}

function detectParticipantsHeaderRowIndex(rows) {
  const maxRowsToScan = Math.min(rows.length, 30);
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let rowIndex = 0; rowIndex < maxRowsToScan; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const cleanedCells = row.map(cleanImportCellValue).filter(Boolean);
    if (!cleanedCells.length) continue;

    const uniqueCount = new Set(cleanedCells.map(normalizeImportLabel)).size;
    const textLikeCount = cleanedCells.filter((cell) => /[a-z]/i.test(cell)).length;
    const numericLikeCount = cleanedCells.filter((cell) => /^[\d.,\/\-]+$/.test(cell)).length;
    const nextRowNonEmpty = countNonEmptyCells(rows[rowIndex + 1]);

    let score = (cleanedCells.length * 4) + (uniqueCount * 2) + (textLikeCount * 2) - numericLikeCount;
    if (nextRowNonEmpty > 0) score += 2;
    if (rowIndex <= 5) score += 1;
    if (cleanedCells.length === 1) score -= 4;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  }

  if (bestIndex >= 0) return bestIndex;

  const firstNonEmptyRow = rows.findIndex((row) => countNonEmptyCells(row) > 0);
  return firstNonEmptyRow >= 0 ? firstNonEmptyRow : 0;
}

function countNonEmptyCells(row) {
  if (!Array.isArray(row)) return 0;
  return row.reduce((count, cell) => count + (cleanImportCellValue(cell) ? 1 : 0), 0);
}

function cleanImportCellValue(value) {
  if (value === null || value === undefined) return '';
  return `${value}`.trim();
}

function normalizeImportLabel(value) {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildSpreadsheetColumnLabel(columnIndex) {
  let n = columnIndex + 1;
  let label = '';

  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }

  return label;
}

function getFirstColumnSampleValue(rows, headerRowIndex, columnIndex) {
  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const value = cleanImportCellValue(rows[rowIndex]?.[columnIndex]);
    if (value) return value;
  }
  return '';
}

function buildImportColumnStorageKey(column) {
  const normalizedHeader = normalizeImportLabel(column.originalHeader || '');
  if (normalizedHeader) return `h:${normalizedHeader}`;
  return `c:${column.columnIndex}`;
}

function buildImportMappingSignature(columns) {
  return columns
    .map((column) => buildImportColumnStorageKey(column))
    .join('|');
}

function getImportMappingOptions() {
  return [
    { value: '', label: t('import_mapping_none', 'Not mapped') },
    { value: 'category', label: 'Categoria' },
    { value: 'style', label: 'Estilo' },
    { value: 'category_style', label: 'Categoria - Estilo' },
    { value: 'style_category', label: 'Estilo - Categoria' },
    { value: 'participant_name', label: 'Nombre Grupo/participante' },
    { value: 'club_name', label: 'Nombre del Club' },
    { value: 'origin_club_1', label: 'Procedencia 1 Club' },
    { value: 'origin_club_2', label: 'Procedencia 2 Club' },
    { value: 'club_email', label: 'Email Club' }
  ];
}

function sanitizeImportMappingValue(value) {
  const candidate = `${value || ''}`.trim();
  return importMappingValues.has(candidate) ? candidate : '';
}

function guessImportMappingValue(columnLabel) {
  const normalized = normalizeImportLabel(columnLabel).replace(/\s+/g, ' ');
  if (!normalized) return '';

  if (/(categoria|category).*(estilo|style)/.test(normalized)) return 'category_style';
  if (/(estilo|style).*(categoria|category)/.test(normalized)) return 'style_category';
  if (normalized.includes('email') && normalized.includes('club')) return 'club_email';

  if (normalized.includes('procedencia') || normalized.includes('origen') || normalized.includes('origin')) {
    if (/(^| )1($| )|uno|first/.test(normalized)) return 'origin_club_1';
    if (/(^| )2($| )|dos|second/.test(normalized)) return 'origin_club_2';
  }

  if (normalized.includes('club') && !normalized.includes('email') && !normalized.includes('procedencia')) {
    return 'club_name';
  }

  if (
    normalized.includes('nombre grupo') ||
    normalized.includes('nombre participante') ||
    normalized.includes('participant name') ||
    normalized === 'nombre' ||
    normalized === 'name'
  ) {
    return 'participant_name';
  }

  if (normalized.includes('participante') || normalized.includes('participant')) return 'participant_name';
  if (normalized.includes('categoria') || normalized.includes('category')) return 'category';
  if (normalized.includes('estilo') || normalized.includes('style')) return 'style';

  return '';
}

function buildInitialImportMapping(columns, savedForSignature, lastByHeader) {
  const mappingByColumn = {};
  const signatureConfig = (savedForSignature && typeof savedForSignature === 'object') ? savedForSignature : {};

  columns.forEach((column) => {
    const storageKey = buildImportColumnStorageKey(column);
    const headerKey = normalizeImportLabel(column.originalHeader || column.headerLabel);
    const hasSignatureValue = Object.prototype.hasOwnProperty.call(signatureConfig, storageKey);
    const fromSignature = sanitizeImportMappingValue(signatureConfig[storageKey]);
    const fromLast = sanitizeImportMappingValue(lastByHeader?.[headerKey]);
    const fromGuess = sanitizeImportMappingValue(guessImportMappingValue(column.headerLabel));

    mappingByColumn[column.columnIndex] = hasSignatureValue
      ? fromSignature
      : (fromLast || fromGuess || '');
  });

  return mappingByColumn;
}

function hasSavedImportMappingConfig(savedForSignature, columns) {
  if (!savedForSignature || typeof savedForSignature !== 'object') return false;
  if (!Array.isArray(columns) || columns.length === 0) return false;

  return columns.some((column) => {
    const storageKey = buildImportColumnStorageKey(column);
    return Object.prototype.hasOwnProperty.call(savedForSignature, storageKey);
  });
}

function setImportMappingsPanelExpanded(expand) {
  const collapseEl = document.getElementById('importMappingsCollapse');
  if (!collapseEl || typeof bootstrap === 'undefined') return;

  const collapseInstance = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
  if (expand) {
    collapseInstance.show();
  } else {
    collapseInstance.hide();
  }
}

function getSavedImportMappingPresets() {
  try {
    const raw = localStorage.getItem(importMappingStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (error) {
    console.warn('Could not read import mapping presets from localStorage:', error);
    return {};
  }
}

function saveImportMappingPresets(presets) {
  try {
    localStorage.setItem(importMappingStorageKey, JSON.stringify(presets || {}));
  } catch (error) {
    console.warn('Could not save import mapping presets to localStorage:', error);
  }
}

function getLastImportHeaderMapping() {
  try {
    const raw = localStorage.getItem(importMappingLastStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (error) {
    console.warn('Could not read last import mapping from localStorage:', error);
    return {};
  }
}

function saveLastImportHeaderMapping(mappingByHeader) {
  try {
    localStorage.setItem(importMappingLastStorageKey, JSON.stringify(mappingByHeader || {}));
  } catch (error) {
    console.warn('Could not save last import mapping to localStorage:', error);
  }
}

function persistCurrentImportMappings() {
  if (!importState.mappingSignature || !importState.columns.length) return;

  const signaturePreset = {};
  const lastByHeader = {};

  importState.columns.forEach((column) => {
    const target = sanitizeImportMappingValue(importState.mappingByColumn[column.columnIndex]);
    const storageKey = buildImportColumnStorageKey(column);
    const headerKey = normalizeImportLabel(column.originalHeader || column.headerLabel);

    signaturePreset[storageKey] = target;
    if (headerKey) {
      lastByHeader[headerKey] = target;
    }
  });

  const currentPresets = getSavedImportMappingPresets();
  currentPresets[importState.mappingSignature] = signaturePreset;
  saveImportMappingPresets(currentPresets);
  saveLastImportHeaderMapping(lastByHeader);
}

function renderImportMappingsTable() {
  const tableBody = document.getElementById('importMappingsTableBody');
  const headerRowInfo = document.getElementById('importDetectedHeaderRowInfo');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  if (headerRowInfo) {
    const detectedRowNumber = importState.headerRowIndex >= 0 ? (importState.headerRowIndex + 1) : 0;
    headerRowInfo.textContent = detectedRowNumber > 0
      ? `Fila de cabeceras detectada automaticamente: ${detectedRowNumber}`
      : '';
  }

  if (!importState.columns.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 4;
    emptyCell.className = 'text-muted text-center py-3';
    emptyCell.textContent = 'No se detectaron columnas.';
    emptyRow.appendChild(emptyCell);
    tableBody.appendChild(emptyRow);
    return;
  }

  const options = getImportMappingOptions();

  importState.columns.forEach((column) => {
    const row = document.createElement('tr');

    const columnCell = document.createElement('td');
    columnCell.className = 'text-muted small';
    columnCell.textContent = `${column.columnLabel} (${column.columnIndex + 1})`;

    const headerCell = document.createElement('td');
    headerCell.className = 'fw-semibold';
    headerCell.textContent = column.headerLabel;

    const sampleCell = document.createElement('td');
    sampleCell.className = 'text-muted small';
    sampleCell.textContent = column.sampleValue || '-';

    const mappingCell = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'form-select form-select-sm';
    select.dataset.columnIndex = `${column.columnIndex}`;

    options.forEach((optionData) => {
      const option = document.createElement('option');
      option.value = optionData.value;
      option.textContent = optionData.label;
      select.appendChild(option);
    });

    select.value = sanitizeImportMappingValue(importState.mappingByColumn[column.columnIndex]);

    select.addEventListener('change', (event) => {
      const target = event.target;
      const columnIndex = Number(target.dataset.columnIndex);
      importState.mappingByColumn[columnIndex] = sanitizeImportMappingValue(target.value);
      persistCurrentImportMappings();
      updateImportMappingValidationHint();
    });

    mappingCell.appendChild(select);
    row.appendChild(columnCell);
    row.appendChild(headerCell);
    row.appendChild(sampleCell);
    row.appendChild(mappingCell);
    tableBody.appendChild(row);
  });
}

function updateImportMappingValidationHint() {
  const validationFeedback = document.getElementById('importMappingValidationFeedback');
  if (!validationFeedback) return;

  validationFeedback.classList.remove('text-success', 'text-danger');

  if (!importState.columns.length) {
    validationFeedback.textContent = '';
    return;
  }

  const validation = validateImportMappings(importState.mappingByColumn);
  if (validation.isValid) {
    validationFeedback.classList.add('text-success');
    validationFeedback.textContent = 'Mapeo valido. Puedes continuar con Analizar.';
  } else {
    validationFeedback.classList.add('text-danger');
    validationFeedback.textContent = validation.errors.join(' ');
  }
}

function validateImportMappings(mappingByColumn) {
  const values = Object.values(mappingByColumn || {}).map(sanitizeImportMappingValue).filter(Boolean);
  const hasParticipantName = values.includes('participant_name');
  const hasCategory = values.includes('category');
  const hasStyle = values.includes('style');
  const hasCategoryStyle = values.includes('category_style');
  const hasStyleCategory = values.includes('style_category');

  const hasCategoryAndStyle = (hasCategory && hasStyle) || hasCategoryStyle || hasStyleCategory;
  const errors = [];

  if (!hasParticipantName) {
    errors.push('Debes mapear al menos una columna como \"Nombre Grupo/participante\".');
  }

  if (!hasCategoryAndStyle) {
    errors.push('Debes mapear \"Categoria\" y \"Estilo\", o \"Categoria - Estilo\", o \"Estilo - Categoria\".');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function buildImportMappingPayload() {
  const mapping = {};

  importState.columns.forEach((column) => {
    const headerKey = normalizeImportLabel(column.originalHeader || column.headerLabel || column.columnLabel);
    if (!headerKey || Object.prototype.hasOwnProperty.call(mapping, headerKey)) {
      return;
    }
    mapping[headerKey] = sanitizeImportMappingValue(importState.mappingByColumn[column.columnIndex]);
  });

  return {
    event_id: getEvent().id,
    file_name: importState.selectedFile?.name || '',
    header_row: importState.headerRowIndex + 1,
    mapping
  };
}

