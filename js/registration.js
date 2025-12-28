const registrationState = {
  school: null,
  participants: []
};

let schoolLoadPromise = null;

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();
  setupRegistrationTabs();
  initSchoolTab();
  initParticipantsTab();
});

function setupRegistrationTabs() {
  const tabButtons = document.querySelectorAll('#registrationTabs button[data-bs-toggle="tab"]');
  if (!tabButtons.length) {
    return;
  }

  const hash = window.location.hash.replace('#', '');
  if (hash) {
    const targetButton = document.querySelector(`#registrationTabs button[data-bs-target="#${hash}"]`);
    if (targetButton) {
      bootstrap.Tab.getOrCreateInstance(targetButton).show();
    }
  }

  tabButtons.forEach((button) => {
    button.addEventListener('shown.bs.tab', (event) => {
      const target = event.target.getAttribute('data-bs-target');
      if (target) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}${target}`);
      }
    });
  });
}

async function fetchSchoolRecord(userId) {
  if (registrationState.school) {
    return registrationState.school;
  }

  if (!schoolLoadPromise) {
    schoolLoadPromise = (async () => {
      const res = await fetch(`${API_BASE_URL}/api/schools/${userId}`);
      if (!res.ok) {
        throw new Error(t('registration_school_load_error', 'Error loading school data.'));
      }

      const data = await res.json();
      if (!data) {
        throw new Error(t('registration_school_load_error', 'Error loading school data.'));
      }

      registrationState.school = data;
      return data;
    })();
  }

  try {
    return await schoolLoadPromise;
  } catch (err) {
    schoolLoadPromise = null;
    throw err;
  }
}

function initSchoolTab() {
  const form = document.getElementById('schoolForm');
  if (!form) {
    return;
  }

  const user = getUserFromToken();
  if (!user || !user.id) {
    showMessageModal(t('registration_school_no_user', 'No user found.'), t('error_title', 'Error'));
    return;
  }

  const elements = {
    name: document.getElementById('schoolName'),
    username: document.getElementById('schoolUsername'),
    email: document.getElementById('schoolEmail'),
    language: document.getElementById('schoolLanguage'),
    city: document.getElementById('schoolCity'),
    country: document.getElementById('schoolCountry'),
    phone: document.getElementById('schoolPhone'),
    representative: document.getElementById('schoolRepresentative'),
    password: document.getElementById('schoolPassword'),
    togglePassword: document.getElementById('toggleSchoolPassword'),
    saveBtn: document.getElementById('schoolSaveBtn'),
    alert: document.getElementById('schoolSaveAlert')
  };

  if (elements.togglePassword && elements.password) {
    elements.togglePassword.addEventListener('click', () => {
      const isHidden = elements.password.type === 'password';
      elements.password.type = isHidden ? 'text' : 'password';
      const icon = elements.togglePassword.querySelector('i');
      if (icon) {
        icon.classList.toggle('bi-eye', !isHidden);
        icon.classList.toggle('bi-eye-slash', isHidden);
      }
    });
  }

  if (elements.alert) {
    const hideAlert = () => elements.alert.classList.add('d-none');
    form.addEventListener('input', hideAlert);
    form.addEventListener('change', hideAlert);
  }

  let countrySelect = null;
  if (elements.country && Array.isArray(countries)) {
    countries.forEach(c => {
      const option = document.createElement('option');
      option.value = c.code;
      option.textContent = `${c.code} - ${c.name}`;
      elements.country.appendChild(option);
    });

    if (window.TomSelect) {
      countrySelect = new TomSelect('#schoolCountry', {
        maxOptions: 200,
        placeholder: 'Type to search...',
        allowEmptyOption: true
      });
    }
  }

  let schoolRecord = null;

  const loadSchool = async () => {
    try {
      schoolRecord = await fetchSchoolRecord(user.id);

      if (elements.username) elements.username.value = schoolRecord.username || '';

      if (elements.name) elements.name.value = schoolRecord.name || '';
      if (elements.email) elements.email.value = schoolRecord.email || '';
      if (elements.language) elements.language.value = schoolRecord.language || 'es';
      if (elements.city) elements.city.value = schoolRecord.city || '';
      if (elements.phone) elements.phone.value = schoolRecord.phone || '';
      if (elements.representative) elements.representative.value = schoolRecord.representative || '';
      if (elements.password) elements.password.value = schoolRecord.password || '';

      if (elements.country) {
        if (countrySelect) {
          countrySelect.setValue(schoolRecord.country || '', true);
        } else {
          elements.country.value = schoolRecord.country || '';
        }
      }
    } catch (err) {
      showMessageModal(err.message || t('registration_school_load_error', 'Error loading school data.'), t('error_title', 'Error'));
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    if (!schoolRecord) {
      showMessageModal(t('registration_school_load_error', 'Error loading school data.'), t('error_title', 'Error'));
      return;
    }

    const payload = {
      id: schoolRecord.id,
      event_id: schoolRecord.event_id,
      name: elements.name.value.trim(),
      username: schoolRecord.username,
      language: elements.language.value,
      email: schoolRecord.email,
      city: elements.city.value.trim(),
      country: elements.country.value,
      phone: elements.phone.value.trim(),
      representative: elements.representative.value.trim(),
      password: elements.password.value.trim()
    };

    elements.saveBtn.disabled = true;
    const originalText = elements.saveBtn.textContent;
    elements.saveBtn.textContent = t('saving', 'Guardando...');

    try {
      const res = await fetch(`${API_BASE_URL}/api/schools/${schoolRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(t('registration_school_save_error', 'Error saving school data.'));
      }

      schoolRecord = { ...schoolRecord, ...payload };
      registrationState.school = schoolRecord;
      if (elements.alert) {
        elements.alert.classList.remove('d-none');
      }
    } catch (err) {
      showMessageModal(err.message || t('registration_school_save_error', 'Error saving school data.'), t('error_title', 'Error'));
    } finally {
      elements.saveBtn.disabled = false;
      elements.saveBtn.textContent = originalText;
    }
  });

  loadSchool();
}

function initParticipantsTab() {
  const tableBody = document.getElementById('participantsTable');
  const countEl = document.getElementById('participantsCount');
  const emptyEl = document.getElementById('participantsEmpty');
  const addBtn = document.getElementById('addParticipantBtn');
  const modalEl = document.getElementById('participantModal');
  const deleteModalEl = document.getElementById('deleteParticipantModal');

  if (!tableBody || !modalEl || !deleteModalEl) {
    return;
  }

  const user = getUserFromToken();
  if (!user || !user.id) {
    showMessageModal(t('registration_school_no_user', 'No user found.'), t('error_title', 'Error'));
    return;
  }

  const form = document.getElementById('participantForm');
  const elements = {
    id: document.getElementById('participantId'),
    name: document.getElementById('participantName'),
    dob: document.getElementById('participantDob'),
    gender: document.getElementById('participantGender'),
    country: document.getElementById('participantCountry'),
    saveBtn: document.getElementById('participantSaveBtn'),
    saveAddBtn: document.getElementById('participantSaveAddBtn'),
    modalTitle: document.getElementById('participantModalTitle'),
    deleteMessage: document.getElementById('deleteParticipantMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteParticipantBtn')
  };

  const countryMap = Array.isArray(countries)
    ? new Map(countries.map(c => [c.code, c.name]))
    : new Map();

  let participantCountrySelect = null;
  if (elements.country && Array.isArray(countries)) {
    countries.forEach(c => {
      const option = document.createElement('option');
      option.value = c.code;
      option.textContent = `${c.code} - ${c.name}`;
      elements.country.appendChild(option);
    });

    if (window.TomSelect) {
      participantCountrySelect = new TomSelect('#participantCountry', {
        maxOptions: 200,
        placeholder: 'Type to search...',
        allowEmptyOption: true
      });
    }
  }

  const participantModal = new bootstrap.Modal(modalEl);
  const deleteModal = new bootstrap.Modal(deleteModalEl);
  let participantToDelete = null;

  const setCountryValue = (value) => {
    if (participantCountrySelect) {
      if (value) {
        participantCountrySelect.setValue(value, true);
      } else {
        participantCountrySelect.clear(true);
      }
    } else if (elements.country) {
      elements.country.value = value || '';
    }
  };

  const setCreateDefaults = async () => {
    let defaultCountry = '';
    if (registrationState.school && registrationState.school.country) {
      defaultCountry = registrationState.school.country;
    } else {
      try {
        const school = await fetchSchoolRecord(user.id);
        defaultCountry = school?.country || '';
      } catch (err) {
        defaultCountry = '';
      }
    }

    if (elements.id) elements.id.value = '';
    if (elements.name) elements.name.value = '';
    if (elements.dob) elements.dob.value = '';
    if (elements.gender) elements.gender.value = 'M';
    setCountryValue(defaultCountry);
  };

  const openParticipantModal = async (mode, participant = null) => {
    if (!form) return;

    form.dataset.mode = mode;
    form.classList.remove('was-validated');

    if (mode === 'create') {
      if (elements.modalTitle) {
        elements.modalTitle.textContent = t('registration_participants_modal_create', 'Alta participantes');
      }
      if (elements.saveAddBtn) elements.saveAddBtn.classList.remove('d-none');
      if (elements.saveBtn) {
        elements.saveBtn.textContent = t('registration_participants_save_close', 'Guardar y cerrar');
      }
      await setCreateDefaults();
    } else {
      if (elements.modalTitle) {
        elements.modalTitle.textContent = t('registration_participants_modal_edit', 'Editar participante');
      }
      if (elements.saveAddBtn) elements.saveAddBtn.classList.add('d-none');
      if (elements.saveBtn) {
        elements.saveBtn.textContent = t('save', 'Guardar');
      }

      if (participant) {
        if (elements.id) elements.id.value = participant.id || '';
        if (elements.name) elements.name.value = participant.name || '';
        if (elements.dob) elements.dob.value = getDateOnlyValue(participant.date_of_birth);
        if (elements.gender) elements.gender.value = participant.gender || 'M';
        setCountryValue(participant.country || '');
      }
    }

    participantModal.show();
  };

  const renderParticipants = () => {
    tableBody.innerHTML = '';

    const participants = Array.isArray(registrationState.participants)
      ? registrationState.participants
      : [];

    if (countEl) {
      countEl.textContent = `${participants.length}`;
    }

    if (!participants.length) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    if (emptyEl) emptyEl.classList.add('d-none');

    const genderLabels = {
      M: t('gender_male', 'Male'),
      F: t('gender_female', 'Female')
    };
    const editTitle = t('edit', 'Edit');
    const deleteTitle = t('delete', 'Delete');

    participants.forEach(participant => {
      const row = document.createElement('tr');
      row.dataset.id = participant.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = participant.name || '';
      row.appendChild(nameCell);

      const genderCell = document.createElement('td');
      genderCell.textContent = genderLabels[participant.gender] || participant.gender || '-';
      row.appendChild(genderCell);

      const dobValue = getDateOnlyValue(participant.date_of_birth);
      const dobCell = document.createElement('td');
      dobCell.textContent = dobValue || '-';
      row.appendChild(dobCell);

      const ageCell = document.createElement('td');
      ageCell.textContent = `${calculateAge(dobValue)}`;
      row.appendChild(ageCell);

      const countryCell = document.createElement('td');
      countryCell.textContent = getCountryName(participant.country, countryMap) || '-';
      row.appendChild(countryCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-outline-primary btn-sm btn-edit-participant';
      editBtn.dataset.id = participant.id;
      editBtn.title = editTitle;
      editBtn.setAttribute('aria-label', editTitle);
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm btn-delete-participant';
      deleteBtn.dataset.id = participant.id;
      deleteBtn.title = deleteTitle;
      deleteBtn.setAttribute('aria-label', deleteTitle);
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';

      actionGroup.appendChild(editBtn);
      actionGroup.appendChild(deleteBtn);
      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  };

  const showParticipantsError = (message) => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    if (countEl) countEl.textContent = '0';
    if (emptyEl) emptyEl.classList.add('d-none');
  };

  const loadParticipants = async () => {
    try {
      const params = new URLSearchParams();
      params.set('school_id', user.id);

      const eventObj = getEvent();
      if (eventObj && eventObj.id) {
        params.set('event_id', eventObj.id);
      }

      const url = params.toString()
        ? `${API_BASE_URL}/api/participants?${params.toString()}`
        : `${API_BASE_URL}/api/participants`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('registration_participants_load_error', 'Error loading participants.'));
      }

      const data = await res.json();
      registrationState.participants = Array.isArray(data) ? data : [];
      renderParticipants();
    } catch (err) {
      showParticipantsError(err.message || t('registration_participants_load_error', 'Error loading participants.'));
    }
  };

  const saveParticipant = async (closeOnSuccess) => {
    if (!form) return;

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const mode = form.dataset.mode || 'create';
    const participantId = elements.id ? elements.id.value : '';
    const eventObj = getEvent();
    const eventIdValue = eventObj?.id || registrationState.school?.event_id;

    const payload = {
      id: participantId || undefined,
      event_id: eventIdValue,
      name: elements.name ? elements.name.value.trim() : '',
      date_of_birth: elements.dob ? elements.dob.value : '',
      country: elements.country ? elements.country.value : '',
      gender: elements.gender ? elements.gender.value : 'M',
      school_id: user.id
    };

    if (!payload.id) delete payload.id;
    if (!payload.event_id) delete payload.event_id;

    const isEdit = mode === 'edit';
    if (isEdit && !participantId) {
      showMessageModal(t('registration_participants_save_error', 'Error saving participant.'), t('error_title', 'Error'));
      return;
    }
    const url = `${API_BASE_URL}/api/participants${isEdit ? `/${participantId}` : ''}`;
    const method = isEdit ? 'PUT' : 'POST';

    const activeButton = closeOnSuccess ? elements.saveBtn : elements.saveAddBtn;
    const originalSaveText = elements.saveBtn ? elements.saveBtn.textContent : '';
    const originalSaveAddText = elements.saveAddBtn ? elements.saveAddBtn.textContent : '';

    if (elements.saveBtn) elements.saveBtn.disabled = true;
    if (elements.saveAddBtn) elements.saveAddBtn.disabled = true;
    if (activeButton) activeButton.textContent = t('saving', 'Guardando...');

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_participants_save_error', 'Error saving participant.');
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (parseErr) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      if (closeOnSuccess) {
        participantModal.hide();
      } else {
        await setCreateDefaults();
        if (elements.name) elements.name.focus();
        await loadParticipants();
      }
    } catch (err) {
      showMessageModal(err.message || t('registration_participants_save_error', 'Error saving participant.'), t('error_title', 'Error'));
    } finally {
      if (elements.saveBtn) {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = originalSaveText;
      }
      if (elements.saveAddBtn) {
        elements.saveAddBtn.disabled = false;
        elements.saveAddBtn.textContent = originalSaveAddText;
      }
    }
  };

  const deleteParticipant = async () => {
    if (!participantToDelete) return;

    if (elements.confirmDeleteBtn) {
      elements.confirmDeleteBtn.disabled = true;
    }

    try {
      const eventObj = getEvent();
      const eventIdValue = eventObj?.id || registrationState.school?.event_id;
      const deletePayload = {
        id: participantToDelete.id,
        school_id: user.id,
        event_id: eventIdValue
      };
      if (!deletePayload.event_id) delete deletePayload.event_id;

      const res = await fetch(`${API_BASE_URL}/api/participants/${participantToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deletePayload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_participants_delete_error', 'Error deleting participant.');
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (parseErr) {
          // ignore
        }
        throw new Error(errorMessage);
      }

      deleteModal.hide();
      await loadParticipants();
    } catch (err) {
      showMessageModal(err.message || t('registration_participants_delete_error', 'Error deleting participant.'), t('error_title', 'Error'));
    } finally {
      if (elements.confirmDeleteBtn) {
        elements.confirmDeleteBtn.disabled = false;
      }
      participantToDelete = null;
    }
  };

  if (addBtn) {
    addBtn.addEventListener('click', () => openParticipantModal('create'));
  }

  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', () => saveParticipant(true));
  }

  if (elements.saveAddBtn) {
    elements.saveAddBtn.addEventListener('click', () => saveParticipant(false));
  }

  tableBody.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.btn-edit-participant');
    const deleteBtn = event.target.closest('.btn-delete-participant');

    if (editBtn) {
      const id = editBtn.dataset.id;
      const participant = registrationState.participants.find(p => `${p.id}` === `${id}`);
      if (!participant) return;
      openParticipantModal('edit', participant);
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const participant = registrationState.participants.find(p => `${p.id}` === `${id}`);
      if (!participant) return;

      participantToDelete = participant;
      if (elements.deleteMessage) {
        elements.deleteMessage.innerHTML = `${t('registration_participants_delete_question', 'Seguro que deseas eliminar a')} <strong>${participant.name}</strong>?`;
      }
      deleteModal.show();
    }
  });

  if (elements.confirmDeleteBtn) {
    elements.confirmDeleteBtn.addEventListener('click', deleteParticipant);
  }

  modalEl.addEventListener('hidden.bs.modal', () => {
    loadParticipants();
  });

  loadParticipants();
}

function getDateOnlyValue(dateValue) {
  if (!dateValue) return '';
  if (typeof dateValue === 'string') {
    return dateValue.split('T')[0];
  }
  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    return dateValue.toISOString().split('T')[0];
  }
  return '';
}

function calculateAge(dateValue) {
  if (!dateValue) return '-';
  const parts = dateValue.split('-').map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
    return '-';
  }
  const [year, month, day] = parts;
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  const dayDiff = today.getDate() - day;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

function getCountryName(code, countryMap) {
  if (!code) return '';
  if (countryMap && countryMap.has(code)) {
    return countryMap.get(code);
  }
  return code;
}
