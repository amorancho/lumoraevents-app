var dancers = [
  { 
    id: 1, 
    name: 'Amina', 
    category: 'Professional', 
    styles: ['Raqs sharki', 'Fusion'],
    master: 'Master Amina',
    nationality: 'ES'
  },
  { 
    id: 2, 
    name: 'Layla', 
    category: 'Amateur', 
    styles: ['Baladi', 'Shaabi'],
    master: 'Master Layla',
    nationality: 'FR'
  },
  { 
    id: 3, 
    name: 'Zara', 
    category: 'Professional', 
    styles: ['Fusion', 'Pop song'],
    master: 'Master Zara',
    nationality: 'IT'
  },
  { 
    id: 4, 
    name: 'Alberto', 
    category: 'Professional', 
    styles: ['Fusion', 'Pop song'],
    master: 'Master Zara',
    nationality: 'IQ'
  }
];

var categoryList = [
    'Baby Amateur',
    'Baby Advenced',
    'Kid Amateur',
    'Kid Advenced',
    'Junior Amateur',
    'Junior Advenced',
    'Senior Amateur',
    'Senior Advenced',
    'Golden',
    'Amateur',
    'Semiprofessional',
    'Professional',
    'Master',
    'Group Oriental',
    'Group Folklore and Fusions',
    'Talento Nacional'
];
var styleList = [
    'Raqs sharki',
    'Baladi',
    'Shaabi',
    'Folklore',
    'Fusion',
    'Pop song',
    'Drum CD',
    'Live Drum'
];

var masters = [
  { id: 1, name: 'Master Amina' },
  { id: 2, name: 'Master Layla' },
  { id: 3, name: 'Master Zara' }
];

var title = 'Dancers';

document.addEventListener('DOMContentLoaded', () => {

  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${getEvent().id}`);
  updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${getEvent().id}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${getEvent().id}`);

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

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-edit-dancer');

    if (button) {

      const editForm = document.getElementById('editForm');
      editForm.dataset.id = button.closest('tr').dataset.id;
      editForm.dataset.action = 'edit';

      const tr = button.closest('tr');
      const id = tr.dataset.id;
      const dancer = dancers.find(d => d.id == id);

      document.getElementById('dancerName').value = dancer.name;
      document.getElementById('editCategory').value = dancer.category;
      document.getElementById('editMaster').value = dancer.master;
      document.getElementById('nationality').value = dancer.nationality;

      const stylesOptions = document.getElementById('editStyles').options;
    
      Array.from(stylesOptions).forEach(opt => {
        opt.selected = dancer.styles.includes(opt.value);
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

      document.getElementById('confirmDeleteBtn').onclick = () => {
        dancers = dancers.filter(d => d.id != dancerIdToDelete);
        loadDancers();
        deleteModal.hide();
      };

    }

  });


  document.getElementById('saveEditBtn').addEventListener('click', () => {

    const action = document.getElementById('editForm').dataset.action;

    inputName = document.getElementById('dancerName');
    inputCategory = document.getElementById('editCategory');
    inputMaster = document.getElementById('editMaster');
    inputNationality = document.getElementById('nationality');
    inputStyles = document.getElementById('editStyles');

    const selectedValues = Array.from(inputStyles.selectedOptions).map(option => option.value);

    // actualizar los valores del array dancers
    if (action === 'create') {
      const newDancer = {
        id: dancers.length + 1,
        name: inputName.value.trim().toUpperCase(),
        category: inputCategory.value.trim(),
        styles: selectedValues,
        master: inputMaster.value.trim(), 
        nationality: inputNationality.value.trim().toUpperCase()
      }
      dancers.push(newDancer);

    } else if (action === 'edit') { 
      const id = document.getElementById('editForm').dataset.id;
      const dancerIndex = dancers.findIndex(d => d.id == id);
      
      if (dancerIndex !== -1) {
        dancers[dancerIndex].name = inputName.value.trim().toUpperCase();
        dancers[dancerIndex].category = inputCategory.value.trim();
        dancers[dancerIndex].styles = selectedValues;
        dancers[dancerIndex].master = inputMaster.value.trim();
        dancers[dancerIndex].nationality = inputNationality.value.trim().toUpperCase();
      }
      
    }

    loadDancers();


    editModal.hide();
  });
      
  loadCategories();
  loadStyles();
  loadMasters();
  loadDancers();  

});

function loadDancers() {
  const dancersTable = document.getElementById('dancersTable');
  dancersTable.innerHTML = ''; // Clear existing rows
  dancers.forEach(dancer => {

    const row = document.createElement('tr');
    row.dataset.id = dancer.id;

    let stylesSpans = '';
    if (dancer.styles && dancer.styles.length > 0) {
      stylesSpans = dancer.styles.map(style => `<span class="badge bg-warning text-dark me-1">${style}</span>`).join('');
    } else {
      stylesSpans = '<span class="badge bg-secondary">No styles</span>';
    }

    row.innerHTML = `
      <td class="align-middle">
        <div class="d-flex align-items-center">
          <img src="https://flagsapi.com/${dancer.nationality}/shiny/24.png" class="me-2" style="vertical-align: middle;">
          <span>${dancer.name}</span>
        </div>
      </td>
      <td class="align-middle">${dancer.category}</td>
      <td class="align-middle">${stylesSpans}</td>
      <td class="align-middle">
        <i class="bi bi-people me-1 text-muted"></i>
        ${dancer.master}
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

function loadCategories() {
  const categorySelect = document.getElementById('editCategory');
  categoryList.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

function loadStyles() {
  const styleSelect = document.getElementById('editStyles');
  styleList.forEach(style => {
    const option = document.createElement('option');
    option.value = style;
    option.textContent = style;
    styleSelect.appendChild(option);
  });

}

function loadMasters() {
  const masterSelect = document.getElementById('editMaster');   
  masters.forEach(master => {
    const option = document.createElement('option');
    option.value = master.name;
    option.textContent = master.name;
    masterSelect.appendChild(option);
  });
}