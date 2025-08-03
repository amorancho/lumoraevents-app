// En el principio sigue igual
let judges = [];
//const eventId = 'etoilesdorientfest25';
var title = 'Judges';

document.addEventListener('DOMContentLoaded', async () => {

  await eventReadyPromise;
  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${eventId}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

  initJudgeManagement();
});

function initJudgeManagement() {
  const editModal = new bootstrap.Modal(document.getElementById('editModal'));

  document.getElementById('createNewJudgeBtn').addEventListener('click', function () {
    document.getElementById('editForm').dataset.action = 'create';
    document.getElementById('judgeName').value = '';
    document.getElementById('judgeEmail').value = '';
    document.getElementById('judgeMaster').checked = false;
    document.getElementById('judgeUsername').value = '';
    document.getElementById('judgePassword').value = '';
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
      const master = tr.dataset.master === '1';
      const judge = judges.find(d => d.id == id);

      document.getElementById('judgeName').value = judge.name;
      document.getElementById('judgeEmail').value = judge.email;
      document.getElementById('judgeMaster').checked = master;
      document.getElementById('judgeUsername').value = judge.username;
      document.getElementById('judgePassword').value = judge.password;

      document.querySelector('#editModal .modal-title span').textContent = 'Edit Judge';
      editModal.show();

    } else if (event.target.closest('.btn-delete-judge')) {
      const button = event.target.closest('.btn-delete-judge');
      const tr = button.closest('tr');
      const id = tr.dataset.id;
      const judge = judges.find(d => d.id == id);

      const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
      document.getElementById('deleteModalMessage').innerHTML = `Are you sure you want to delete judge <strong>${judge.name}</strong>?`;
      deleteModal.show();

      document.getElementById('confirmDeleteBtn').onclick = () => {
        fetch(`${API_BASE_URL}/api/judge/${id}`, {
          method: 'DELETE'
        })
        .then(response => {
          if (!response.ok) throw new Error('Failed to delete judge');
          return response.json();
        })
        .then(() => loadJudges())
        .catch(err => console.error(err));

        deleteModal.hide();
      };
    }
  });

  document.getElementById('saveEditBtn').addEventListener('click', () => {
    const action = document.getElementById('editForm').dataset.action;
    const id = document.getElementById('editForm').dataset.id;

    const inputName = document.getElementById('judgeName');
    const inputEmail = document.getElementById('judgeEmail');
    const inputMaster = document.getElementById('judgeMaster');
    const inputUsername = document.getElementById('judgeUsername');
    const inputPassword = document.getElementById('judgePassword');

    const judgeData = {
      name: inputName.value.trim(),
      email: inputEmail.value.trim(),
      ismaster: inputMaster.checked ? 1 : 0,
      username: inputUsername.value.trim(),
      password: inputPassword.value.trim()
    };

    if (action === 'create') {
      judgeData.event_id = eventId;

      fetch(`${API_BASE_URL}/api/judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(judgeData)
      })
      .then(response => {        
        if (!response.ok) throw new Error('Failed to create judge');
        return response.json();
      })
      .then(() => {
        loadJudges();
        editModal.hide();
      })
      .catch(err => console.error(err));

    } else if (action === 'edit') {
      fetch(`${API_BASE_URL}/api/judge/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(judgeData)
      })
      .then(response => {
        if (!response.ok) throw new Error('Failed to update judge');
        return response.json();
      })
      .then(() => {
        loadJudges();
        editModal.hide();
      })
      .catch(err => console.error(err));
    }
  });

  loadJudges();
}

function loadJudges() {
  fetch(`${API_BASE_URL}/api/judge?event_id=${eventId}`)
    .then(response => {
      if (!response.ok) throw new Error(`Error fetching judges: ${response.status}`);
      return response.json();
    })
    .then(data => {
      judges = data;
      renderJudges();
    })
    .catch(error => {
      console.error('Failed to load judges:', error);
    });
}

function renderJudges() {
  const judgesTable = document.getElementById('judgesTable');
  judgesTable.innerHTML = '';

  judges.forEach(judge => {

    const row = document.createElement('tr');
    row.dataset.id = judge.id;
    row.dataset.master = judge.ismaster;

    row.innerHTML = `
      <td>${judge.name}</td>
      <td>${judge.email}</td>
      <td class="align-middle text-center text-success">
        ${Number(judge.ismaster) === 1 ? '✓' : ''}
      </td>
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
