judges = [
  { id: 1, name: 'Judge Amina', email: 'amina@example.com', username: 'amina123', password: 'password123' },
  { id: 2, name: 'Judge Layla', email: 'layla@example.com', username: 'layla123', password: 'password123' },
  { id: 3, name: 'Judge Zara', email: 'zara@example.com', username: 'zara123', password: 'password123' },
  { id: 4, name: 'Judge Alberto', email: 'alberto@example.com', username: 'alberto123', password: 'password123' }
];

var title = 'Judges';

document.addEventListener('DOMContentLoaded', () => {

  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${getEvent().id}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${getEvent().id}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${getEvent().id}`);


});

document.addEventListener('DOMContentLoaded', function () {

  const editModal = new bootstrap.Modal(document.getElementById('editModal'));

  document.getElementById('createNewJudgeBtn').addEventListener('click', function () {

    document.getElementById('editForm').dataset.action = 'create';
    

    // Vaciar los campos del modal
    document.getElementById('judgeName').value = '';
    document.getElementById('judgeEmail').value = '';
    document.getElementById('judgeUsername').value = '';
    document.getElementById('judgePassword').value = '';

    // Cambiar el título del modal si lo deseas
    document.querySelector('#editModal .modal-title span').textContent = 'Create Judge';

    editModal.show();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-edit-judge');

    if (button) {

      const editForm = document.getElementById('editForm');
      editForm.dataset.id = button.closest('tr').dataset.id;
      editForm.dataset.action = 'edit';

      const tr = button.closest('tr');
      const id = tr.dataset.id;
      const judge = judges.find(d => d.id == id);

      document.getElementById('judgeName').value = judge.name;
      document.getElementById('judgeEmail').value = judge.email;
      document.getElementById('judgeUsername').value = judge.username;
      document.getElementById('judgePassword').value = judge.password;


      document.querySelector('#editModal .modal-title span').textContent = 'Edit Judge';

      editModal.show();

    } else if (event.target.closest('.btn-delete-judge')) {

      const button = event.target.closest('.btn-delete-judge');

      const tr = button.closest('tr');
      const id = tr.dataset.id;
      const judge = judges.find(d => d.id == id);

      judgeIdToDelete = id;

      const message = `Are you sure you want to delete judge <strong>${judge.name}</strong>?`;
      document.getElementById('deleteModalMessage').innerHTML = message;

      const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
      deleteModal.show();

      document.getElementById('confirmDeleteBtn').onclick = () => {
        judges = judges.filter(d => d.id != judgeIdToDelete);
        loadJudges();
        deleteModal.hide();
      };

    }

  });


  document.getElementById('saveEditBtn').addEventListener('click', () => {

    const action = document.getElementById('editForm').dataset.action;

    inputName = document.getElementById('judgeName');
    inputEmail = document.getElementById('judgeEmail');
    inputUsername = document.getElementById('judgeUsername');
    inputPassword = document.getElementById('judgePassword');


    // actualizar los valores del array judges
    if (action === 'create') {
      const newJudge = {
        id: judges.length + 1,
        name: inputName.value.trim(),
        email: inputEmail.value.trim(),
        username: inputUsername.value.trim(),
        password: inputPassword.value.trim()
      }
      judges.push(newJudge);

    } else if (action === 'edit') { 
      const id = document.getElementById('editForm').dataset.id;
      const judgeIndex = judges.findIndex(d => d.id == id);

      if (judgeIndex !== -1) {
        judges[judgeIndex].name = inputName.value.trim();
        judges[judgeIndex].email = inputEmail.value.trim();
        judges[judgeIndex].username = inputUsername.value.trim();
        judges[judgeIndex].password = inputPassword.value.trim();
      }
      
    }

    loadJudges();

    editModal.hide();
  });
      
  loadJudges();  

});

function loadJudges() {
  const judgesTable = document.getElementById('judgesTable');
  judgesTable.innerHTML = ''; // Clear existing rows

  judges.forEach(judge => {

    const row = document.createElement('tr');
    row.dataset.id = judge.id;

    row.innerHTML = `
      <td>${judge.name}</td>
      <td>${judge.email}</td>
      <td>${judge.username}</td>
      <td>${judge.password}</td>
      <td class="text-center align-middle">
          <div class="btn-group" role="group">
              <button type="button" class="btn btn-outline-primary btn-sm btn-edit-judge" title="Edit">
                  <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn btn-outline-danger btn-sm btn-delete-judge" title="Delete">
                  <i class="bi bi-trash"></i>
              </button>
          </div>
      </td>
    `;
    judgesTable.appendChild(row);
  });
}