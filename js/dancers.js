let dancers = [];
var title = 'Dancers';

const allowedRoles = ["admin", "organizer"];
const allowedImportExtensions = ['xls', 'xlsx'];
const importState = {
  selectedFile: null,
  analysis: null,
  detectedCategories: [],
  detectedStyles: [],
  summary: {
    unmappedCategoryEntries: 0,
    unmappedStyleEntries: 0
  }
};

const select = document.getElementById("nationality");

countries.forEach(c => {
  const option = document.createElement("option");
  option.value = c.code;
  option.textContent = `${c.code} - ${c.name}`;
  select.appendChild(option);
});

// Inicializamos Tom Select
new TomSelect("#nationality", {
  maxOptions: 200,
  placeholder: "Type to search...",
  allowEmptyOption: true
});

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;
  await WaitEventLoaded();

  updateElementProperty('admineventUrl', 'href', `adminevent.html?eventId=${eventId}`);
  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${eventId}`);
  updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

  const closedPanel = document.getElementById('closedPanel');

  if (getEvent().status == 'finished') {
      closedPanel.style.display = 'block';

      // deshabilitar inputs y botones
      document.querySelectorAll('input, button').forEach(el => el.disabled = true);
  }

  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  loadCategories();
  loadStyles();
  loadMasters(); 
  loadClubs();

  await ensureTranslationsReady();
  fetchDancersFromAPI();

});

document.addEventListener('DOMContentLoaded', function () {

  const editModalElement = document.getElementById('editModal');
  const editModal = new bootstrap.Modal(editModalElement);
  const filterCategory = document.getElementById('categoryFilter');
  const filterClub = document.getElementById('clubFilter');
  const codeLabel = document.getElementById('dancerCodeLabel');
  const currentUser = getUserFromToken();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const importDancersModalElement = document.getElementById('importDancersModal');
  const importFileInput = document.getElementById('importFileInput');
  const selectImportFileBtn = document.getElementById('selectImportFileBtn');
  const importDropzone = document.getElementById('importDropzone');
  const analyzeParticipantsFileBtn = document.getElementById('analyzeParticipantsFileBtn');
  const importCreateMissingCategoriesCheck = document.getElementById('importCreateMissingCategoriesCheck');
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

  filterClub.addEventListener('change', () => {
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
    document.getElementById('editClub').selectedIndex = 0;
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
      document.getElementById('nationality').tomselect.setValue(dancer.nationality); 
      document.getElementById('editClub').value = dancer.club_id;     

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
      nationality: inputNationality.value.trim().toUpperCase(),
      event_id: getEvent().id,
      email: inputEmail.value.trim().toLowerCase(),
      language: inputLanguage.value,
      club_id: inputClub.value ? parseInt(inputClub.value, 10) : null
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
      handleImportParticipantsFileSelection(file);
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
      handleImportParticipantsFileSelection(file);
    });
  }

  if (analyzeParticipantsFileBtn) {
    analyzeParticipantsFileBtn.addEventListener('click', async () => {
      await analyzeParticipantsFile();
    });
  }

  if (importCreateMissingCategoriesCheck) {
    importCreateMissingCategoriesCheck.addEventListener('change', () => {
      refreshImportSummary();
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
  const dancersTable = document.getElementById('dancersTable');
  dancersTable.innerHTML = ''; // Clear existing rows
  dancers.forEach(dancer => {

    let btnDisabled = '';
    if (getEvent().status === 'finished') {
      btnDisabled = 'disabled';
    }

    const row = document.createElement('tr');
    row.dataset.id = dancer.id;
    row.dataset.club_id = dancer.club_id;

    let stylesSpans = Array.isArray(dancer.styles) && dancer.styles.length > 0
      ? dancer.styles.map(style => `<span class="badge bg-warning text-dark me-1">${style.name}</span>`).join('')
      : `<span class="badge bg-secondary" data-i18n="no_styles">${t('no_styles')}</span>`;

    row.innerHTML = `
      <td class="align-middle">
        <div class="d-flex align-items-center">
          <img src="https://flagsapi.com/${dancer.nationality}/shiny/24.png" class="me-2" style="vertical-align: middle;">
          <span>${dancer.name}</span>
        </div>
      </td>
      <td class="align-middle">${dancer.category_name}</td>
      <td class="align-middle">${stylesSpans}</td>
      <td class="align-middle">
        <i class="bi bi-people me-1 text-muted"></i>
        ${dancer.master_name || ''}
      </td>
      <td class="align-middle">${dancer.nationality}</td>
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
  const clubSelect = document.getElementById('editClub');
  clubSelect.innerHTML = ''; // Limpiar opciones anteriores

  const clubFilter = document.getElementById('clubFilter');

  try {
    const response = await fetch(`${API_BASE_URL}/api/clubs?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching clubs');
    const clubs = await response.json();

    const emptyOption1 = document.createElement('option');
    emptyOption1.value = '';
    emptyOption1.textContent = '';
    clubSelect.appendChild(emptyOption1);

    clubs.forEach(club => {
      const option1 = document.createElement('option');
      option1.value = club.id || club; // por si es string directo
      option1.textContent = club.name || club;
      clubSelect.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = club.id || club; // por si es string directo
      option2.textContent = club.name || club;
      clubFilter.appendChild(option2);
    });
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
  const filterClub = document.getElementById('clubFilter').value;
  const rows = document.querySelectorAll('#dancersTable tr');

  rows.forEach(row => {
    const category = row.children[1]?.textContent.trim().toLowerCase();
    const club_id = row.dataset.club_id;

    if ((!filterCategory || category === filterCategory) && (!filterClub || club_id === filterClub)) {
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
  const clubFilterValue = document.getElementById('clubFilter')?.value || '';
  const hasActiveFilters = Boolean(categoryFilterValue || clubFilterValue);

  if (hasActiveFilters) {
    countEl.textContent = `${visibleCount} / ${totalCount}`;
    return;
  }

  countEl.textContent = `${totalCount}`;
}

function resetImportParticipantsState() {
  importState.selectedFile = null;
  importState.analysis = null;
  importState.detectedCategories = [];
  importState.detectedStyles = [];
  importState.summary = {
    unmappedCategoryEntries: 0,
    unmappedStyleEntries: 0
  };

  const importFileInput = document.getElementById('importFileInput');
  const selectedFileName = document.getElementById('importSelectedFileName');
  const analyzeBtn = document.getElementById('analyzeParticipantsFileBtn');
  const resultsWrap = document.getElementById('importAnalyzeResults');
  const categoriesList = document.getElementById('importCategoriesList');
  const stylesList = document.getElementById('importStylesList');
  const existingCount = document.getElementById('importExistingCount');
  const toCreateCount = document.getElementById('importToCreateCount');
  const createMissingCheck = document.getElementById('importCreateMissingCategoriesCheck');
  const importBtn = document.getElementById('importParticipantsBtn');

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
  if (categoriesList) {
    categoriesList.innerHTML = '';
  }
  if (stylesList) {
    stylesList.innerHTML = '';
  }
  if (existingCount) {
    existingCount.textContent = '0';
  }
  if (toCreateCount) {
    toCreateCount.textContent = '0';
  }
  if (createMissingCheck) {
    createMissingCheck.checked = true;
  }
  if (importBtn) {
    importBtn.disabled = true;
    importBtn.textContent = t('import_participants', 'Import participants');
  }
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

function handleImportParticipantsFileSelection(file) {
  const importFileInput = document.getElementById('importFileInput');
  const selectedFileName = document.getElementById('importSelectedFileName');
  const analyzeBtn = document.getElementById('analyzeParticipantsFileBtn');
  const resultsWrap = document.getElementById('importAnalyzeResults');
  const importBtn = document.getElementById('importParticipantsBtn');

  if (!file) {
    importState.selectedFile = null;
    if (selectedFileName) selectedFileName.textContent = t('import_no_file_selected', 'No file selected');
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (resultsWrap) resultsWrap.classList.add('d-none');
    if (importBtn) importBtn.disabled = true;
    return;
  }

  if (!isValidParticipantsImportFile(file)) {
    importState.selectedFile = null;
    if (importFileInput) importFileInput.value = '';
    if (selectedFileName) selectedFileName.textContent = t('import_no_file_selected', 'No file selected');
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (resultsWrap) resultsWrap.classList.add('d-none');
    if (importBtn) importBtn.disabled = true;
    showMessageModal(
      t('import_invalid_file_type', 'Select a valid Excel file (.xls or .xlsx).'),
      t('import_invalid_file_title', 'Invalid file')
    );
    return;
  }

  importState.selectedFile = file;
  importState.analysis = null;
  importState.detectedCategories = [];
  importState.detectedStyles = [];
  importState.summary = {
    unmappedCategoryEntries: 0,
    unmappedStyleEntries: 0
  };

  if (selectedFileName) {
    selectedFileName.textContent = `${t('import_selected_file', 'Selected file')}: ${file.name}`;
  }
  if (analyzeBtn) {
    analyzeBtn.disabled = false;
  }
  if (resultsWrap) {
    resultsWrap.classList.add('d-none');
  }
  if (importBtn) {
    importBtn.disabled = true;
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
    const formData = new FormData();
    formData.append('file', importState.selectedFile);
    formData.append('event_id', `${getEvent().id}`);

    const endpoint = `${API_BASE_URL}/api/dancers/analize-participants-file?event_id=${encodeURIComponent(getEvent().id)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    let data = null;
    try {
      data = await res.json();
    } catch (parseError) {
      data = null;
    }

    if (!res.ok) {
      const errorMessage = data?.error || t('import_analyze_error', 'Could not analyze file.');
      throw new Error(errorMessage);
    }

    applyImportAnalysis(data || {});
  } catch (error) {
    console.error('Error analyzing participants file:', error);
    showMessageModal(error.message || t('import_analyze_error', 'Could not analyze file.'), t('error', 'Error'));
  } finally {
    analyzeBtn.disabled = !importState.selectedFile;
    analyzeBtn.textContent = baseLabel;
  }
}

function applyImportAnalysis(data) {
  const receivedCategories = Array.isArray(data?.receivedCategories) ? data.receivedCategories : [];
  const receivedStyles = Array.isArray(data?.receivedStyles) ? data.receivedStyles : [];
  const participants = Array.isArray(data?.participants) ? data.participants : [];

  importState.analysis = { receivedCategories, receivedStyles, participants };
  importState.detectedCategories = buildDetectedMappingEntries(receivedCategories, 'category');
  importState.detectedStyles = buildDetectedMappingEntries(receivedStyles, 'style');

  renderDetectedMappingList('category');
  renderDetectedMappingList('style');
  refreshImportSummary();

  const resultsWrap = document.getElementById('importAnalyzeResults');
  if (resultsWrap) {
    resultsWrap.classList.remove('d-none');
  }

  const importBtn = document.getElementById('importParticipantsBtn');
  if (importBtn) {
    importBtn.disabled = false;
  }
}

function buildDetectedMappingEntries(items, type) {
  const byName = new Map();

  items.forEach((item, index) => {
    const sourceLabel = firstNonEmptyValue(item?.name);
    const normalizedLabel = normalizeImportLabel(sourceLabel) || `${type}_${index}`;
    if (byName.has(normalizedLabel)) return;

    const rawMappedId = type === 'category'
      ? firstNonEmptyValue(item?.categoryId, item?.category_id)
      : firstNonEmptyValue(item?.styleId, item?.style_id);

    const mappedId = rawMappedId ? `${rawMappedId}` : null;

    byName.set(normalizedLabel, {
      key: `${type}:${normalizedLabel}`,
      sourceLabel: sourceLabel || (type === 'category'
        ? t('import_unknown_category', 'Unknown category')
        : t('import_unknown_style', 'Unknown style')),
      mappedId
    });
  });

  return Array.from(byName.values());
}

function firstNonEmptyValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const cleaned = `${value}`.trim();
    if (cleaned) return cleaned;
  }
  return '';
}

function normalizeImportLabel(value) {
  return `${value || ''}`.trim().toLowerCase();
}

function renderDetectedMappingList(type) {
  const isCategory = type === 'category';
  const listEl = document.getElementById(isCategory ? 'importCategoriesList' : 'importStylesList');
  if (!listEl) return;

  listEl.innerHTML = '';

  const entries = isCategory ? importState.detectedCategories : importState.detectedStyles;

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'list-group-item text-muted';
    empty.textContent = isCategory
      ? t('import_no_categories_detected', 'No categories detected in file.')
      : t('import_no_styles_detected', 'No styles detected in file.');
    listEl.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'list-group-item';

    const top = document.createElement('div');
    top.className = 'd-flex flex-wrap justify-content-between align-items-center gap-2';

    const name = document.createElement('div');
    name.className = 'fw-semibold';
    name.textContent = entry.sourceLabel;
    top.appendChild(name);

    const badges = document.createElement('div');
    badges.className = 'd-flex gap-2';

    const resolvedId = entry.mappedId ? `${entry.mappedId}` : '';
    const statusBadge = document.createElement('span');
    statusBadge.className = resolvedId ? 'badge text-bg-success' : 'badge text-bg-warning';
    statusBadge.textContent = resolvedId
      ? t('import_mapping_found', 'Found')
      : t('import_mapping_not_found', 'Not found');
    badges.appendChild(statusBadge);
    top.appendChild(badges);
    row.appendChild(top);

    listEl.appendChild(row);
  });
}

function refreshImportSummary() {
  if (!importState.analysis || !Array.isArray(importState.analysis.participants)) return;

  const participants = importState.analysis.participants;
  const existingCount = participants.filter(participant => Boolean(participant?.exists)).length;
  const toCreateCount = participants.filter(participant => !Boolean(participant?.exists)).length;

  const existingCountEl = document.getElementById('importExistingCount');
  const toCreateCountEl = document.getElementById('importToCreateCount');
  if (existingCountEl) existingCountEl.textContent = `${existingCount}`;
  if (toCreateCountEl) toCreateCountEl.textContent = `${toCreateCount}`;

  const unmappedCategoryEntries = importState.detectedCategories.filter(entry => !entry.mappedId).length;
  const unmappedStyleEntries = importState.detectedStyles.filter(entry => !entry.mappedId).length;

  importState.summary = {
    unmappedCategoryEntries,
    unmappedStyleEntries
  };
}

function normalizeIdValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getParticipantSourceLabel(participant, type) {
  return type === 'category'
    ? firstNonEmptyValue(
      participant?.categoryName,
      participant?.category_name,
      participant?.category,
      participant?.rawCategory,
      participant?.raw_category,
      participant?.category_assigned
    )
    : firstNonEmptyValue(
      participant?.styleName,
      participant?.style_name,
      participant?.style,
      participant?.rawStyle,
      participant?.raw_style,
      participant?.style_assigned
    );
}

function buildDetectedResolution(type, createMissing) {
  const entries = type === 'category' ? importState.detectedCategories : importState.detectedStyles;
  const bySource = new Map();
  const createList = [];
  const unresolvedOriginalEntries = [];

  entries.forEach((entry) => {
    const source = firstNonEmptyValue(entry?.sourceLabel);
    const normalizedSource = normalizeImportLabel(source);
    const originalMappedId = normalizeIdValue(entry?.mappedId);
    const resolvedId = originalMappedId;
    const canCreate = !resolvedId && createMissing && !!source;

    const resolution = {
      source,
      resolvedId,
      createName: canCreate ? source : ''
    };

    bySource.set(normalizedSource, resolution);
    if (canCreate) {
      createList.push(source);
    }
    if (!originalMappedId) {
      unresolvedOriginalEntries.push(resolution);
    }
  });

  const uniqueFallbackKey = new Set(
    unresolvedOriginalEntries.map((item) => {
      if (item.resolvedId) return `id:${item.resolvedId}`;
      if (item.createName) return `create:${normalizeImportLabel(item.createName)}`;
      return 'unresolved';
    })
  );

  const fallback = uniqueFallbackKey.size === 1 && unresolvedOriginalEntries.length > 0
    ? unresolvedOriginalEntries[0]
    : null;

  return {
    bySource,
    createList,
    fallback
  };
}

function resolveParticipantField(participant, type, detectedResolution) {
  const rawId = type === 'category'
    ? firstNonEmptyValue(participant?.categoryId, participant?.category_id)
    : firstNonEmptyValue(participant?.styleId, participant?.style_id);

  const directId = normalizeIdValue(rawId);
  if (directId !== null) {
    return { id: directId, assigned: '', unresolved: false, unresolvedWithSource: false };
  }

  const sourceLabel = getParticipantSourceLabel(participant, type);
  const normalizedSource = normalizeImportLabel(sourceLabel);

  if (sourceLabel && detectedResolution.bySource.has(normalizedSource)) {
    const resolution = detectedResolution.bySource.get(normalizedSource);
    if (resolution.resolvedId !== null) {
      return { id: resolution.resolvedId, assigned: '', unresolved: false, unresolvedWithSource: false };
    }
    if (resolution.createName) {
      return { id: null, assigned: resolution.createName, unresolved: false, unresolvedWithSource: false };
    }
    return { id: null, assigned: '', unresolved: true, unresolvedWithSource: true };
  }

  if (detectedResolution.fallback) {
    if (detectedResolution.fallback.resolvedId !== null) {
      return { id: detectedResolution.fallback.resolvedId, assigned: '', unresolved: false, unresolvedWithSource: false };
    }
    if (detectedResolution.fallback.createName) {
      return { id: null, assigned: detectedResolution.fallback.createName, unresolved: false, unresolvedWithSource: false };
    }
    return { id: null, assigned: '', unresolved: true, unresolvedWithSource: false };
  }

  return { id: null, assigned: '', unresolved: true, unresolvedWithSource: Boolean(sourceLabel) };
}

function buildCreateParticipantsPayload(createMissingCategories) {
  const participants = Array.isArray(importState.analysis?.participants) ? importState.analysis.participants : [];
  const categoryResolution = buildDetectedResolution('category', createMissingCategories);
  const styleResolution = buildDetectedResolution('style', createMissingCategories);
  const createCategories = [...new Set(categoryResolution.createList)];
  const createStyles = [...new Set(styleResolution.createList)];
  const participantsPayload = [];
  const unresolvedBlocking = [];

  participants.forEach((participant) => {
    if (!participant || typeof participant !== 'object') return;

    const name = firstNonEmptyValue(participant?.name);
    if (!name) return;
    if (participant?.exists === true) return;

    const category = resolveParticipantField(participant, 'category', categoryResolution);
    const style = resolveParticipantField(participant, 'style', styleResolution);

    if (category.unresolved) {
      if (!createMissingCategories) {
        return;
      }
      unresolvedBlocking.push(name);
      return;
    }

    if (style.unresolvedWithSource) {
      if (!createMissingCategories) {
        return;
      }
      unresolvedBlocking.push(name);
      return;
    }

    const participantPayload = {
      name,
      exists: false,
      categoryId: category.id,
      styleId: style.id
    };

    if (category.assigned) {
      participantPayload.category_assigned = category.assigned;
    }
    if (style.assigned) {
      participantPayload.style_assigned = style.assigned;
    }

    participantsPayload.push(participantPayload);
  });

  return {
    createCategories,
    createStyles,
    participantsPayload,
    unresolvedBlocking
  };
}

async function handleImportParticipantsClick() {
  if (!importState.analysis) return;

  const createMissingCategories = document.getElementById('importCreateMissingCategoriesCheck')?.checked ?? true;
  const hasUnmappedEntries = (importState.summary.unmappedCategoryEntries > 0) || (importState.summary.unmappedStyleEntries > 0);

  if (!createMissingCategories && hasUnmappedEntries) {
    const confirmed = await showImportWarningModal(
      t(
        'import_warning_unmapped_message',
        'There are unmapped categories or styles. Participants from those rows will not be created. Do you want to continue?'
      )
    );

    if (!confirmed) return;
  }

  const { createCategories, createStyles, participantsPayload, unresolvedBlocking } = buildCreateParticipantsPayload(createMissingCategories);

  if (unresolvedBlocking.length > 0) {
    const examples = unresolvedBlocking.slice(0, 5).join(', ');
    const missingMappingMessage = t(
      'import_missing_mapping_error',
      'Cannot resolve category/style mapping for some participants: {participants}'
    ).replace('{participants}', examples);
    showMessageModal(
      missingMappingMessage,
      t('error', 'Error')
    );
    return;
  }

  if (!participantsPayload.length) {
    showMessageModal(
      t('import_no_participants_to_create', 'There are no participants to create.'),
      t('import_dancers', 'Import dancers')
    );
    return;
  }

  const importBtn = document.getElementById('importParticipantsBtn');
  const originalBtnText = importBtn ? importBtn.textContent : '';
  if (importBtn) {
    importBtn.disabled = true;
    importBtn.textContent = t('importing_participants', 'Importing...');
  }

  try {
    const endpoint = `${API_BASE_URL}/api/dancers/create-participants?event_id=${encodeURIComponent(getEvent().id)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: getEvent().id,
        create_categories: createCategories,
        create_styles: createStyles,
        participants: participantsPayload
      })
    });

    let data = null;
    try {
      data = await res.json();
    } catch (parseError) {
      data = null;
    }

    if (!res.ok) {
      const errorMessage = data?.error || t('import_create_error', 'Could not create participants.');
      throw new Error(errorMessage);
    }

    const createdCategoriesCount = Array.isArray(data?.createdCategories) ? data.createdCategories.length : 0;
    const createdStylesCount = Array.isArray(data?.createdStyles) ? data.createdStyles.length : 0;
    const createdParticipantsCount = Array.isArray(data?.createdParticipants) ? data.createdParticipants.length : 0;

    const successMessage = t(
      'import_create_success_message',
      'Created categories: {categories}. Created styles: {styles}. Created participants: {participants}.'
    )
      .replace('{categories}', String(createdCategoriesCount))
      .replace('{styles}', String(createdStylesCount))
      .replace('{participants}', String(createdParticipantsCount));

    const importModalEl = document.getElementById('importDancersModal');
    if (importModalEl) {
      const importModal = bootstrap.Modal.getInstance(importModalEl) || new bootstrap.Modal(importModalEl);
      importModal.hide();
    }

    await Promise.all([loadCategories(), loadStyles()]);
    await fetchDancersFromAPI();
    applyFilter();

    showMessageModal(successMessage, t('import_dancers', 'Import dancers'));
  } catch (error) {
    console.error('Error creating participants:', error);
    showMessageModal(error.message || t('import_create_error', 'Could not create participants.'), t('error', 'Error'));
  } finally {
    const modalVisible = Boolean(document.getElementById('importDancersModal')?.classList.contains('show'));
    if (importBtn && modalVisible) {
      importBtn.disabled = false;
      importBtn.textContent = originalBtnText || t('import_participants', 'Import participants');
    }
  }
}

function showImportWarningModal(message) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('importWarningModal');
    const messageEl = document.getElementById('importWarningMessage');
    const confirmBtn = document.getElementById('confirmImportWarningBtn');
    if (!modalEl || !messageEl || !confirmBtn) {
      resolve(window.confirm(message));
      return;
    }

    const modal = new bootstrap.Modal(modalEl);
    messageEl.textContent = message;
    let confirmed = false;

    confirmBtn.onclick = () => {
      confirmed = true;
      modal.hide();
      resolve(true);
    };

    modalEl.addEventListener('hidden.bs.modal', () => {
      if (!confirmed) {
        resolve(false);
      }
    }, { once: true });

    modal.show();
  });
}

