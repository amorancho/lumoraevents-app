var title = 'Dancers';

let dancers = [];

document.addEventListener('DOMContentLoaded', async () => {

  await eventReadyPromise;

  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${eventId}`);
  updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

});

document.addEventListener('DOMContentLoaded', function () {

  const editModal = new bootstrap.Modal(document.getElementById('editModal'));
  const filter = document.getElementById('categoryFilter');
  const table = document.getElementById('dancersTable');

  filter.addEventListener('change', () => {
    const selected = filter.value.toLowerCase();
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
      const category = row.children[1]?.textContent.trim().toLowerCase();
      if (!selected || category === selected) {
        row.classList.remove('d-none');
      } else {
        row.classList.add('d-none');
      }
    });

    // Mostrar o no el empty state
    const visibleRows = Array.from(rows).filter(row => !row.classList.contains('d-none'));
    document.getElementById('emptyState').classList.toggle('d-none', visibleRows.length > 0);
  });

  document.getElementById('createNewDancerBtn').addEventListener('click', function () {

    document.getElementById('editForm').dataset.action = 'create';
    

    // Vaciar los campos del modal
    document.getElementById('dancerName').value = '';
    document.getElementById('editCategory').selectedIndex = 0;
    document.getElementById('editMaster').selectedIndex = 0;
    document.getElementById('nationality').value = '';
    document.getElementById('editStyles').selectedIndex = -1; // Deseleccionar todos los estilos

    // Cambiar el título del modal si lo deseas
    document.querySelector('#editModal .modal-title span').textContent = 'Create Dancer';

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
      document.getElementById('editCategory').value = dancer.category_id;
      document.getElementById('editMaster').value = dancer.master_id;
      document.getElementById('nationality').value = dancer.nationality;

      const stylesOptions = document.getElementById('editStyles').options;
    
      Array.from(stylesOptions).forEach(opt => {
        opt.selected = dancer.styles.some(style => style.id == opt.value);
      });

      document.querySelector('#editModal .modal-title span').textContent = 'Edit Dancer';

      editModal.show();

    } else if (event.target.closest('.btn-delete-dancer')) {

      const button = event.target.closest('.btn-delete-dancer');

      const tr = button.closest('tr');
      const id = tr.dataset.id;
      const dancer = dancers.find(d => d.id == id);

      dancerIdToDelete = id;

      const message = `Are you sure you want to delete dancer <strong>${dancer.name}</strong>?`;
      document.getElementById('deleteModalMessage').innerHTML = message;

      const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
      deleteModal.show();

      document.getElementById('confirmDeleteBtn').onclick = async () => {
        await deleteDancer(dancerIdToDelete);
        fetchDancersFromAPI();
        deleteModal.hide();
      };

    }

  });

  document.getElementById('saveEditBtn').addEventListener('click', () => {

    const action = document.getElementById('editForm').dataset.action;
    const id = document.getElementById('editForm').dataset.id;

    inputName = document.getElementById('dancerName');
    inputCategory = document.getElementById('editCategory');
    inputMaster = document.getElementById('editMaster');
    inputNationality = document.getElementById('nationality');
    inputStyles = document.getElementById('editStyles');

    if (!inputCategory.value) {
      alert('Please choose a category before saving.');
      inputCategory.focus();
      return; // No continúa si está vacío
    }

    const selectedValues = Array.from(inputStyles.selectedOptions).map(option => option.value); 
    
    const dancerData = {
      name: inputName.value.trim().toUpperCase(),
      category_id: parseInt(inputCategory.value, 10),
      styles: selectedValues,
      master_id: inputMaster.value ? parseInt(inputMaster.value, 10) : null,
      nationality: inputNationality.value.trim().toUpperCase(),
      event_id: eventId
    }

    // actualizar los valores del array dancers
    if (action === 'create') {
      
      fetch(`${API_BASE_URL}/api/dancer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dancerData)
      })
      .then(response => {        
        if (!response.ok) throw new Error('Failed to create dancer');
        return response.json();
      })
      .then(() => {
        fetchDancersFromAPI();
        editModal.hide();
      })
      .catch(err => console.error(err));

    } else if (action === 'edit') { 
      fetch(`${API_BASE_URL}/api/dancer/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dancerData)
      })
      .then(response => {
        if (!response.ok) throw new Error('Failed to update dancer');
        return response.json();
      })
      .then(() => {
        fetchDancersFromAPI();
        editModal.hide();
      })
      .catch(err => console.error(err));
      
    }

  });
      
  loadCategories();
  loadStyles();
  loadMasters();
  fetchDancersFromAPI();  

});

async function fetchDancersFromAPI() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/dancer?event_id=${eventId}`);
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

    const row = document.createElement('tr');
    row.dataset.id = dancer.id;

    let stylesSpans = Array.isArray(dancer.styles) && dancer.styles.length > 0
      ? dancer.styles.map(style => `<span class="badge bg-warning text-dark me-1">${style.name}</span>`).join('')
      : '<span class="badge bg-secondary">No styles</span>';

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
              <button type="button" class="btn btn-outline-primary btn-sm btn-edit-dancer" title="Edit">
                  <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn btn-outline-danger btn-sm btn-delete-dancer" title="Delete">
                  <i class="bi bi-trash"></i>
              </button>
          </div>
      </td>
    `;
    dancersTable.appendChild(row);
  });
}

async function loadCategories() {
  const categorySelect = document.getElementById('editCategory');
  categorySelect.innerHTML = ''; // Limpiar opciones anteriores

  const categoryFilter = document.getElementById('categoryFilter');

  try {
    const response = await fetch(`${API_BASE_URL}/api/category?event_id=${eventId}`);
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
    const response = await fetch(`${API_BASE_URL}/api/style?event_id=${eventId}`);
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
    const response = await fetch(`${API_BASE_URL}/api/judge?event_id=${eventId}`);
    if (!response.ok) throw new Error('Error fetching masters');
    const masters = await response.json();

    const emptyOption1 = document.createElement('option');
    emptyOption1.value = '';
    emptyOption1.textContent = '';
    masterSelect.appendChild(emptyOption1);

    masters.forEach(master => {
      const option = document.createElement('option');
      option.value = master.id;
      option.textContent = master.name;
      masterSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load masters:', err);
  }
}

async function getDancerById(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/dancer/${id}`);
    if (!res.ok) throw new Error(`Error ${res.status} al recuperar la bailarina`);
    return await res.json();
  } catch (err) {
    console.error('Error al obtener la bailarina:', err);
    return null;
  }
}

async function deleteDancer(dancerIdToDelete) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/dancer/${dancerIdToDelete}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`Error ${res.status} al eliminar bailarina`);

    // Si quieres, obtén respuesta confirmando borrado
    // const data = await res.json();

    // Actualizar array local solo si la API respondió bien
    //dancers = dancers.filter(d => d.id != dancerIdToDelete);

    console.log(`Bailarina con id ${dancerIdToDelete} eliminada correctamente.`);
  } catch (error) {
    console.error('Error al eliminar la bailarina:', error);
  }
}
