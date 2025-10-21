let judges = [];
//var title = 'Judges';

const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;
  await WaitEventLoaded();
  
  updateElementProperty('admineventUrl', 'href', `adminevent.html?eventId=${eventId}`);
  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${eventId}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

  const closedPanel = document.getElementById('closedPanel');

  if (getEvent().status == 'completed') {
      closedPanel.style.display = 'block';

      // deshabilitar inputs y botones
      document.querySelectorAll('input, button').forEach(el => el.disabled = true);
  }

  initJudgeManagement();

  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
});

function initJudgeManagement() {
  const editModal = new bootstrap.Modal(document.getElementById('editModal'));

  document.getElementById('createNewJudgeBtn').addEventListener('click', function () {
    document.getElementById('editForm').dataset.action = 'create';
    document.getElementById('judgeName').value = '';
    document.getElementById('judgeEmail').value = '';
    document.getElementById('judgeMaster').checked = false;
    document.getElementById('judgeUsername').value = '';
    document.getElementById('judgeLanguage').value = getEvent().language;    
    document.querySelector('#editModal .modal-title span').textContent = 'Create Judge';

    document.getElementById('actionsCard').classList.add('d-none');
    document.getElementById('welcomeSendDiv').classList.add('d-none');

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
      document.getElementById('judgeLanguage').value = judge.language;

      setWelcomeDate(judge.welcomesended);
      
      document.querySelector('#editModal .modal-title span').textContent = translations['edit_judge'];

      document.getElementById('actionsCard').classList.remove('d-none');
      document.getElementById('welcomeSendDiv').classList.remove('d-none');

      editModal.show();

    } else if (event.target.closest('.btn-delete-judge')) {
      const button = event.target.closest('.btn-delete-judge');
      const tr = button.closest('tr');
      const id = tr.dataset.id;
      const judge = judges.find(d => d.id == id);

      const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
      document.getElementById('deleteModalMessage').innerHTML = `Are you sure you want to delete judge <strong>${judge.name}</strong>?`;
      deleteModal.show();

      document.getElementById('confirmDeleteBtn').onclick = async () => {

        deleteModal.hide();

        try {
          const res = await fetch(`${API_BASE_URL}/api/judges/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const errData = await res.json();
            showMessageModal(errData.error || 'Failed to delete judge', 'Error');
            return; // Parar para no cargar tabla
          }
          await loadJudges();
          deleteModal.hide();
        } catch (err) {
          console.error(err);
          showMessageModal('Unexpected error deleting judge', 'Error');
        }
        
      };
    }
  });

  document.getElementById('saveEditBtn').addEventListener('click', async () => {
    // Deshabilitar botón para evitar múltiples envíos
    const saveBtn = document.getElementById('saveEditBtn');
    if (saveBtn.disabled) return; // prevención extra por si acaso
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    const action = document.getElementById('editForm').dataset.action;
    const id = document.getElementById('editForm').dataset.id;

    const inputName = document.getElementById('judgeName');
    const inputEmail = document.getElementById('judgeEmail');
    const inputMaster = document.getElementById('judgeMaster');
    const inputUsername = document.getElementById('judgeUsername');
    const inputWelcomeSended = document.getElementById('judgeWelcomeSended');
    const inputLanguage = document.getElementById('judgeLanguage');

    const judgeData = {
      name: inputName.value.trim() || null,
      email: inputEmail.value.trim() || null,
      ismaster: inputMaster.checked ? 1 : 0,
      username: inputUsername.value.trim() || null,
      welcomesended: inputWelcomeSended.value || null,
      language: inputLanguage.value,
      event_id: getEvent().id
    };

    try {
      let res;
      if (action === 'create') {        
        res = await fetch(`${API_BASE_URL}/api/judges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(judgeData)
        });
      } else if (action === 'edit') {
        res = await fetch(`${API_BASE_URL}/api/judges/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(judgeData)
        });
      }      

      if (!res.ok) {
        const errData = await res.json();
        showMessageModal(errData.error || 'Error saving judge', 'Error');
        return;
      }

      editModal.hide();

      await loadJudges();
      
    } catch (err) {
      console.error(err);
      showMessageModal('Unexpected error saving judge', 'Error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save changes";
    }
  });

  document.getElementById('sendEmail').addEventListener('click', async () => {
    const sendBtn = document.getElementById('sendEmail');
    const judgeId = document.getElementById('editForm').dataset.id;
  
    if (!judgeId) {
      showMessageModal('No judge selected.');
      return;
    }
  
    // Mostrar spinner y deshabilitar botón
    const originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    //sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...`;

    const spinner = document.createElement('span');
    spinner.className = 'spinner-border spinner-border-sm';
    spinner.setAttribute('role', 'status');
    spinner.setAttribute('aria-hidden', 'true');
    sendBtn.appendChild(spinner);
  
    try {
      const response = await fetch(`${API_BASE_URL}/api/judges/${judgeId}/send-welcome-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
  
      if (!response.ok) {
        throw new Error(`Error sending email: ${response.statusText}`);
      }
  
      const data = await response.json();
  
      // Actualiza fecha en el formulario
      setWelcomeDate(data.welcomesended);
  
    } catch (err) {
      console.error(err);
      showMessageModal('Error sending welcome email.');
    } finally {
      // Quitar spinner y restaurar botón
      sendBtn.removeChild(spinner);
      sendBtn.value = originalText;
      sendBtn.disabled = false;
    }
  });

  document.getElementById('resetPassword').addEventListener('click', async () => {
    const sendBtn = document.getElementById('resetPassword');
    const judgeId = document.getElementById('editForm').dataset.id;
  
    if (!judgeId) {
      showMessageModal('No judge selected.');
      return;
    }
  
    // Mostrar spinner y deshabilitar botón
    const originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    //sendBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...`;

    const spinner = document.createElement('span');
    spinner.className = 'spinner-border spinner-border-sm';
    spinner.setAttribute('role', 'status');
    spinner.setAttribute('aria-hidden', 'true');
    sendBtn.appendChild(spinner);
  
    try {
      const response = await fetch(`${API_BASE_URL}/api/judges/${judgeId}/send-reset-password-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
  
      if (!response.ok) {
        throw new Error(`Error sending email: ${response.statusText}`);
      }
  
  
    } catch (err) {
      console.error(err);
      showMessageModal('Error sending welcome email.');
    } finally {
      // Quitar spinner y restaurar botón
      sendBtn.removeChild(spinner);
      sendBtn.value = originalText;
      sendBtn.disabled = false;
    }
  });

  document.getElementById('sendWelcomeAll').addEventListener('click', async () => {

    const confirmed = await showModal(`Are you sure you want to send the welcome email to all judges who have not received it?`);

    if (!confirmed) return;

    const btn = document.getElementById('sendWelcomeAll');
    const originalText = btn.innerHTML;
  
    // Mostrar spinner y deshabilitar botón
    btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Enviando...`;
    btn.disabled = true;
  
    try {
      const response = await fetch(`${API_BASE_URL}/api/judges/send-welcome-email?event_id=${getEvent().id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
  
      if (!response.ok) {
        throw new Error(`Error sending welcome emails: ${response.statusText}`);
      }
  
      const data = await response.json();
  
      //showMessageModal('Welcome emails sent to all judges.');
      loadJudges();
  
    } catch (err) {
      console.error(err);
      showMessageModal('Error sending welcome emails.');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });
  

  loadJudges();
}

async function loadJudges() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/judges?event_id=${getEvent().id}`);
    if (!res.ok) {
      const errData = await res.json();
      showMessageModal(errData.error || `Error fetching judges: ${res.status}`, 'Error');
      return;
    }
    const data = await res.json();
    judges = data;
    renderJudges();
  } catch (error) {
    console.error('Failed to load judges:', error);
    showMessageModal('Unexpected error loading judges', 'Error');
  }
}

function renderJudges() {
  const judgesTable = document.getElementById('judgesTable');
  judgesTable.innerHTML = '';

  judges.forEach(judge => {

    const row = document.createElement('tr');
    row.dataset.id = judge.id;
    row.dataset.master = judge.ismaster;

    let btnDisabled = '';
    if (getEvent().status === 'completed') {
      btnDisabled = 'disabled';
    }

    row.innerHTML = `
      <td>${judge.name}</td>
      <td>${judge.email}</td>
      <td class="align-middle text-center text-success">
        ${Number(judge.ismaster) === 1 ? '✓' : ''}
      </td>
      <td class="align-middle text-center text-success">
        ${judge.welcomesended ? '✓' : ''}
      </td>
      <td>${judge.username}</td>      
      <td class="text-center align-middle">
        <div class="btn-group" role="group">
          <button type="button" class="btn btn-outline-primary btn-sm btn-edit-judge" title="Edit" ${btnDisabled}>
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm btn-delete-judge" title="Delete" ${btnDisabled}>
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;
    judgesTable.appendChild(row);
  });

  // actualizar contador
  const countEl = document.getElementById(`count-judges`);
  if (countEl) {
      countEl.textContent = judges.length;
  }

  if (judges.length === 0) {
    document.getElementById('emptyState').classList.remove('d-none');
  } else {
    document.getElementById('emptyState').classList.add('d-none');
  }
}

function setWelcomeDate(dateValue) {
  
  const displayField = document.getElementById('judgeWelcomeSendedDisplay');
  const hiddenField = document.getElementById('judgeWelcomeSended');

  if (!dateValue) {
    // Si es null o vacío
    displayField.value = 'No enviado';
    displayField.value = translations['not_sent'];
    hiddenField.value = '';
  } else {
    // Convierte la fecha a texto legible
    const dateObj = new Date(dateValue);

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // meses base 0
    const year = dateObj.getFullYear();

    const formatted = `${day}/${month}/${year}`;

    displayField.value = formatted;
    hiddenField.value = dateValue; // aquí guardas el valor crudo para backend
  }
}

function showModal(message) {
  return new Promise((resolve) => {
  const modal = new bootstrap.Modal(document.getElementById('confirmSend'));
  document.getElementById('sendModalMessage').textContent = message;
  
  const confirmBtn = document.getElementById('confirmSendBtn');
  confirmBtn.onclick = () => {
      modal.hide();
      resolve(true);
  };
  
  modal.show();
  });
}