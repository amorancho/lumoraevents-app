var competitions = [
  { 
    id: 1, 
    category: 'Amateur', 
    style: 'Raqs sharki', 
    startTime: '10/06/2025 17:00', 
    status: 'OPEN', 
    judges: ['Leandro', 'Aliah'] 
  },
  { 
    id: 2, 
    category: 'Professional', 
    style: 'Fusion', 
    startTime: '11/06/2025 18:30', 
    status: 'CLOSED', 
    judges: ['Zara', 'Alberto'] 
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
  { id: 1, name: 'Leandro' },
  { id: 2, name: 'Aliah' },
  { id: 3, name: 'Zara' },
  { id: 4, name: 'Alberto' }
];

const statusColor = {
  'OPEN': 'success',
  'FINISHED': 'info',
  'CLOSED': 'danger'
};

var title = 'Competitions';

document.addEventListener('DOMContentLoaded', () => {

  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${getEvent().id}`);
  updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${getEvent().id}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${getEvent().id}`);

  loadCategories();
  loadStyles();
  loadMasters();
  loadCompetitions();
});

function loadCompetitions() {
  const competitionsTable = document.getElementById('competitionsTable');
  competitionsTable.innerHTML = ''; // Limpiar tabla

  competitions.forEach(comp => {
    const row = document.createElement('tr');
    row.dataset.id = comp.id;

    let colorBg = statusColor[comp.status];

    row.innerHTML = `
      <td><span class="badge bg-info fs-6">${comp.category}</span></td>
      <td><span class="badge bg-warning text-dark fs-6">${comp.style}</span></td>
      <td><i class="bi bi-clock me-1 text-muted"></i>${comp.startTime}</td>
      <td><span class="badge bg-${colorBg}">${comp.status}</span></td>
      <td>
        <i class="bi bi-people me-1 text-muted"></i>
        ${comp.judges.join(', ')}
      </td>
      <td class="text-center">
        <div class="btn-group" role="group">
            <button type="button" class="btn btn-outline-primary btn-sm btn-edit-competition" title="Edit">
                <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-delete-competition" title="Delete">
                <i class="bi bi-trash"></i>
            </button>
        </div>
      </td>
    `;

    competitionsTable.appendChild(row);
  });
}

function addCompt() {
  const inputCat = document.getElementById('categoryDropdown');
  const inputSty = document.getElementById('styleDropdown');
  const valueCat = inputCat.value.trim();
  const valueSty = inputSty.value.trim();

  if (valueCat !== "" && valueSty !== "") {

    const newComp = {
      id: competitions.length + 1,
      category: valueCat,
      style: valueSty,
      startTime: '',
      status: 'OPEN',
      judges: []
    }
    competitions.push(newComp);

    loadCompetitions();

    inputCat.value = '';
    inputSty.value = '';
  }
  
} 

document.addEventListener('DOMContentLoaded', () => {
    const editModal = new bootstrap.Modal(document.getElementById('editModal'));

    document.addEventListener('click', (event) => {

      const button = event.target.closest('.btn-edit-competition');

      if (button) {

        const tr = button.closest('tr');

        const competitionId = tr.dataset.id;
        const competition = competitions.find(c => c.id == competitionId);

        const editForm = document.getElementById('editForm');
        editForm.dataset.id = button.closest('tr').dataset.id;

        document.getElementById('modalTitleCategory').textContent = competition.category;
        document.getElementById('modalTitleStyle').textContent = competition.style;

        let parsedDate = null;

        if (competition.startTime) {
          const [datePart, timePart] = competition.startTime.split(' ');
          if (datePart && timePart) {
            const [day, month, year] = datePart.split('/');
            const isoString = `${year}-${month}-${day}T${timePart}`;
            parsedDate = new Date(isoString);
          }
        }

        if (parsedDate && !isNaN(parsedDate.getTime())) {
          const formatted = parsedDate.toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:mm'
          document.getElementById('editStartTime').value = formatted;
        } else {
          document.getElementById('editStartTime').value = '';
        }

        document.getElementById('editStatus').value = competition.status;

    
        const judges = competition.judges || [];

        const judgeOptions = document.getElementById('editJudges').options;
        
        Array.from(judgeOptions).forEach(opt => {
          opt.selected = judges.includes(opt.value);
        });

        editModal.show();
      } else if (event.target.closest('.btn-delete-competition')) {

        const button = event.target.closest('.btn-delete-competition');
        const tr = button.closest('tr');
        const competitionId = tr.dataset.id;
        const competition = competitions.find(c => c.id == competitionId);

        if (competition) {
          const message = `Are you sure you want to delete the competition for <strong>${competition.category} - ${competition.style}</strong>?`;
          document.getElementById('deleteModalMessage').innerHTML = message;

          const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
          deleteModal.show();

          document.getElementById('confirmDeleteBtn').onclick = () => {
            competitions = competitions.filter(c => c.id != competitionId);
            loadCompetitions();
            deleteModal.hide();
          };
        }
      }

    });

    document.getElementById('saveEditBtn').addEventListener('click', () => {
      console.log('Save button clicked');
      const competitionId = document.getElementById('editForm').dataset.id;
      console.log('Competition ID:', competitionId);

      const competition = competitions.find(c => c.id == competitionId);
      if (!competition) return;

      competition.startTime = document.getElementById('editStartTime').value;
      competition.status = document.getElementById('editStatus').value;
      const selectedJudges = Array.from(document.getElementById('editJudges').selectedOptions).map(opt => opt.value);
      console.log('Selected judges:', selectedJudges);
      competition.judges = selectedJudges;

      loadCompetitions();

      editModal.hide();
    });
  });

function loadCategories() {
  const categorySelect = document.getElementById('categoryDropdown');
  categoryList.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

function loadStyles() {
  const styleSelect = document.getElementById('styleDropdown');
  styleList.forEach(style => {
    const option = document.createElement('option');
    option.value = style;
    option.textContent = style;
    styleSelect.appendChild(option);
  });

}

function loadMasters() {
  const masterSelect = document.getElementById('editJudges');   
  masters.forEach(master => {
    const option = document.createElement('option');
    option.value = master.name;
    option.textContent = master.name;
    masterSelect.appendChild(option);
  });
}