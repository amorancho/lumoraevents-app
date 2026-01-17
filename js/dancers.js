let dancers = [];
var title = 'Dancers';

const allowedRoles = ["admin", "organizer"];

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

  const editModal = new bootstrap.Modal(document.getElementById('editModal'));
  const filterCategory = document.getElementById('categoryFilter');
  const filterClub = document.getElementById('clubFilter');
  const table = document.getElementById('dancersTable');
  const codeLabel = document.getElementById('dancerCodeLabel');
  const currentUser = getUserFromToken();
  const isAdmin = currentUser && currentUser.role === 'admin';

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
  
  // actualizar contador
  const countEl = document.getElementById(`count-dancers`);
  if (countEl) {
      countEl.textContent = dancers.length;
  }

  // Mostrar o no el empty state
  if (dancers.length === 0) {
    document.getElementById('emptyState').classList.remove('d-none');
  } else {
    document.getElementById('emptyState').classList.add('d-none');
  }
}

async function loadCategories() {
  const categorySelect = document.getElementById('editCategory');
  categorySelect.innerHTML = ''; // Limpiar opciones anteriores

  const categoryFilter = document.getElementById('categoryFilter');

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
  document.getElementById('emptyState').classList.toggle('d-none', visibleRows.length > 0);
}

