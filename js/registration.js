const registrationState = {
  school: null,
  participants: [],
  registrations: [],
  organizerRegistrations: [],
  schools: [],
  registrationConfig: {
    categories: [],
    styles: []
  },
  registrationCategories: [],
  registrationDisciplines: []
};

let schoolLoadPromise = null;

function syncRegistrationConfigState() {
  registrationState.registrationConfig = {
    categories: Array.isArray(registrationState.registrationCategories)
      ? registrationState.registrationCategories
      : [],
    styles: Array.isArray(registrationState.registrationDisciplines)
      ? registrationState.registrationDisciplines
      : []
  };
}

function notifyRegistrationConfigUpdate() {
  syncRegistrationConfigState();
  window.dispatchEvent(new CustomEvent('registration:config-updated'));
}

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();
  const user = getUserFromToken();
  const role = user?.role?.toLowerCase() || 'guest';
  setRoleTabVisibility(role);
  setupRegistrationTabs();
  if (role === 'school') {
    initSchoolTab();
    initCompetitionsTab();
  }
  initParticipantsTab(role);
  if (role === 'organizer') {
    initSchoolsTab();
    initOrganizerRegistrationsTab();
    initRegistrationCategoriesTab();
    initRegistrationDisciplinesTab();
  }
});

function setupRegistrationTabs() {
  const tabButtons = document.querySelectorAll('#registrationTabs button[data-bs-toggle="tab"]');
  if (!tabButtons.length) {
    return;
  }

  const hash = window.location.hash.replace('#', '');
  if (hash) {
    const targetButton = document.querySelector(`#registrationTabs button[data-bs-target="#${hash}"]`);
    if (targetButton && !isTabHidden(targetButton)) {
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

function isTabHidden(button) {
  const parent = button?.closest('.nav-item');
  return parent ? parent.classList.contains('d-none') : true;
}

function setRoleTabVisibility(role) {
  const tabConfig = [
    { roles: ['organizer'], buttonId: 'schools-tab', paneId: 'schools' },
    { roles: ['school'], buttonId: 'school-tab', paneId: 'school' },
    { roles: ['school', 'organizer'], buttonId: 'participants-tab', paneId: 'participants' },
    { roles: ['organizer'], buttonId: 'org-registrations-tab', paneId: 'org-registrations' },
    { roles: ['organizer'], buttonId: 'registration-categories-tab', paneId: 'registration-categories' },
    { roles: ['organizer'], buttonId: 'registration-disciplines-tab', paneId: 'registration-disciplines' },
    { roles: ['school'], buttonId: 'competitions-tab', paneId: 'competitions' }
  ];

  tabConfig.forEach(({ roles, buttonId, paneId }) => {
    const button = document.getElementById(buttonId);
    const pane = document.getElementById(paneId);
    const shouldShow = roles.includes(role);

    if (button) {
      const navItem = button.closest('.nav-item');
      if (navItem) {
        navItem.classList.toggle('d-none', !shouldShow);
      }
      button.classList.toggle('active', false);
    }

    if (pane) {
      pane.classList.toggle('d-none', !shouldShow);
      pane.classList.remove('show', 'active');
    }
  });

  let preferredButton = null;
  if (role === 'organizer') {
    preferredButton = document.getElementById('schools-tab');
  } else if (role === 'school') {
    preferredButton = document.getElementById('school-tab');
  }

  if (preferredButton && !isTabHidden(preferredButton)) {
    bootstrap.Tab.getOrCreateInstance(preferredButton).show();
    return;
  }

  const firstVisibleButton = Array.from(document.querySelectorAll('#registrationTabs .nav-item'))
    .filter(item => !item.classList.contains('d-none'))
    .map(item => item.querySelector('button'))
    .find(Boolean);

  if (firstVisibleButton) {
    bootstrap.Tab.getOrCreateInstance(firstVisibleButton).show();
  }
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

function initParticipantsTab(role) {
  const tableBody = document.getElementById('participantsTable');
  const countEl = document.getElementById('participantsCount');
  const emptyEl = document.getElementById('participantsEmpty');
  const addBtn = document.getElementById('addParticipantBtn');
  const actionsHeader = document.querySelector('th[data-i18n="registration_participants_actions"]');
  const filtersForm = document.getElementById('participantsFilters');
  const filterSchool = document.getElementById('participantsFilterSchool');
  const filterName = document.getElementById('participantsFilterName');
  const filterClear = document.getElementById('participantsFilterClear');
  const modalEl = document.getElementById('participantModal');
  const deleteModalEl = document.getElementById('deleteParticipantModal');
  const duplicateModalEl = document.getElementById('duplicateParticipantModal');

  if (!tableBody || !modalEl || !deleteModalEl) {
    return;
  }

  const user = getUserFromToken();
  if (!user || !user.id) {
    showMessageModal(t('registration_school_no_user', 'No user found.'), t('error_title', 'Error'));
    return;
  }

  const allowEdit = role === 'school';
  const showSchoolColumn = role === 'organizer';
  if (!allowEdit) {
    if (addBtn) addBtn.classList.add('d-none');
    if (actionsHeader) actionsHeader.classList.add('d-none');
  }
  if (!showSchoolColumn) {
    if (filterSchool) {
      const schoolGroup = filterSchool.closest('.col-12');
      if (schoolGroup) schoolGroup.classList.add('d-none');
    }
  }
  if (showSchoolColumn) {
    const headRow = tableBody.closest('table')?.querySelector('thead tr');
    if (headRow) {
      const schoolHeader = document.createElement('th');
      schoolHeader.setAttribute('data-i18n', 'registration_participants_school');
      schoolHeader.textContent = t('registration_participants_school', 'Escuela');
      headRow.insertBefore(schoolHeader, actionsHeader || null);
    }
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
  const duplicateModal = duplicateModalEl ? new bootstrap.Modal(duplicateModalEl) : null;
  let participantToDelete = null;
  const duplicateMessageEl = document.getElementById('duplicateParticipantMessage');
  const confirmDuplicateBtn = document.getElementById('confirmDuplicateParticipantBtn');

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
    const filtered = applyParticipantFilters(participants);

    if (countEl) {
      countEl.textContent = `${filtered.length}`;
    }

    if (!filtered.length) {
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

    filtered.forEach(participant => {
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

      if (showSchoolColumn) {
        const schoolCell = document.createElement('td');
        schoolCell.textContent = participant.school_name || participant.school || '-';
        row.appendChild(schoolCell);
      }

      if (allowEdit) {
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
      }

      tableBody.appendChild(row);
    });
  };

  const showParticipantsError = (message) => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = (allowEdit ? 6 : 5) + (showSchoolColumn ? 1 : 0);
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
      if (role === 'school') {
        params.set('school_id', user.id);
      }

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

  const applyParticipantFilters = (participants) => {
    const schoolValue = showSchoolColumn && filterSchool ? filterSchool.value : '';
    const nameValue = filterName ? filterName.value.trim().toLowerCase() : '';

    return participants.filter(participant => {
      const matchesName = !nameValue || (participant?.name || '').toLowerCase().includes(nameValue);
      if (!schoolValue || !showSchoolColumn) {
        return matchesName;
      }
      const participantSchoolId = participant?.school_id ?? participant?.school?.id;
      const matchesSchool = `${participantSchoolId || ''}` === `${schoolValue}`;
      return matchesName && matchesSchool;
    });
  };

  const findDuplicateParticipant = (payload) => {
    const nameValue = payload?.name ? payload.name.trim().toLowerCase() : '';
    const dobValue = payload?.date_of_birth || '';
    if (!nameValue || !dobValue) return null;

    return registrationState.participants.find(participant => {
      const participantName = (participant?.name || '').trim().toLowerCase();
      const participantDob = getDateOnlyValue(participant?.date_of_birth);
      return participantName === nameValue && participantDob === dobValue;
    }) || null;
  };

  const confirmDuplicateParticipant = (participant) => new Promise((resolve) => {
    if (!duplicateModal || !duplicateModalEl) {
      resolve(true);
      return;
    }

    const dobValue = getDateOnlyValue(participant?.date_of_birth) || '-';
    if (duplicateMessageEl) {
      duplicateMessageEl.innerHTML = `Ya existe un participante con el mismo nombre y fecha de nacimiento: <strong>${participant?.name || '-'}</strong> (${dobValue}). ¿Es correcto?`;
    }

    let confirmed = false;
    const onConfirm = () => {
      confirmed = true;
      duplicateModal.hide();
    };
    const onHidden = () => {
      duplicateModalEl.removeEventListener('hidden.bs.modal', onHidden);
      if (confirmDuplicateBtn) {
        confirmDuplicateBtn.removeEventListener('click', onConfirm);
      }
      resolve(confirmed);
    };

    if (confirmDuplicateBtn) {
      confirmDuplicateBtn.addEventListener('click', onConfirm);
    }
    duplicateModalEl.addEventListener('hidden.bs.modal', onHidden);
    duplicateModal.show();
  });

  const loadParticipantSchools = async () => {
    if (!showSchoolColumn || !filterSchool) {
      return;
    }
    try {
      const params = new URLSearchParams();
      const eventObj = getEvent();
      if (eventObj && eventObj.id) {
        params.set('event_id', eventObj.id);
      }
      const url = params.toString()
        ? `${API_BASE_URL}/api/schools?${params.toString()}`
        : `${API_BASE_URL}/api/schools`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('schools_load_error', 'Error loading schools.'));
      }
      const data = await res.json();
      const schools = Array.isArray(data) ? data : [];
      filterSchool.innerHTML = '<option value=""></option>';
      schools.forEach(school => {
        const option = document.createElement('option');
        option.value = school.id;
        option.textContent = school?.name || school?.school_name || '-';
        filterSchool.appendChild(option);
      });
    } catch (err) {
      // keep filters but skip blocking participants load
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

    if (!isEdit) {
      const duplicate = findDuplicateParticipant(payload);
      if (duplicate) {
        const shouldContinue = await confirmDuplicateParticipant(duplicate);
        if (!shouldContinue) {
          return;
        }
      }
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

  if (addBtn && allowEdit) {
    addBtn.addEventListener('click', () => openParticipantModal('create'));
  }

  if (elements.saveBtn && allowEdit) {
    elements.saveBtn.addEventListener('click', () => saveParticipant(true));
  }

  if (elements.saveAddBtn && allowEdit) {
    elements.saveAddBtn.addEventListener('click', () => saveParticipant(false));
  }

  tableBody.addEventListener('click', (event) => {
    if (!allowEdit) return;
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

  if (elements.confirmDeleteBtn && allowEdit) {
    elements.confirmDeleteBtn.addEventListener('click', deleteParticipant);
  }

  if (allowEdit) {
    modalEl.addEventListener('hidden.bs.modal', () => {
      loadParticipants();
    });
  }

  if (filtersForm) {
    filtersForm.addEventListener('submit', (event) => {
      event.preventDefault();
    });
  }
  if (filterName) {
    filterName.addEventListener('input', renderParticipants);
  }
  if (filterSchool) {
    filterSchool.addEventListener('change', renderParticipants);
  }
  if (filterClear) {
    filterClear.addEventListener('click', () => {
      if (filterName) filterName.value = '';
      if (filterSchool) filterSchool.value = '';
      renderParticipants();
    });
  }

  loadParticipantSchools();
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

function initSchoolsTab() {
  const filterForm = document.getElementById('schoolsFilters');
  const tableBody = document.getElementById('schoolsTable');
  const emptyEl = document.getElementById('schoolsEmpty');
  const countEl = document.getElementById('schoolsCount');
  const filterName = document.getElementById('schoolsFilterName');
  const filterCountry = document.getElementById('schoolsFilterCountry');
  const filterClear = document.getElementById('schoolsFilterClear');
  const modalEl = document.getElementById('schoolDetailsModal');

  if (!filterForm || !tableBody || !filterName || !filterCountry || !modalEl) {
    return;
  }

  const countryMap = Array.isArray(countries)
    ? new Map(countries.map(c => [c.code, c.name]))
    : new Map();

  if (Array.isArray(countries)) {
    countries.forEach(c => {
      const option = document.createElement('option');
      option.value = c.code;
      option.textContent = `${c.code} - ${c.name}`;
      filterCountry.appendChild(option);
    });
  }

  const detailModal = new bootstrap.Modal(modalEl);
  const detailElements = {
    name: document.getElementById('schoolDetailName'),
    email: document.getElementById('schoolDetailEmail'),
    language: document.getElementById('schoolDetailLanguage'),
    city: document.getElementById('schoolDetailCity'),
    country: document.getElementById('schoolDetailCountry'),
    phone: document.getElementById('schoolDetailPhone'),
    representative: document.getElementById('schoolDetailRepresentative')
  };

  const applyFilters = () => {
    const nameValue = filterName.value.trim().toLowerCase();
    const countryValue = filterCountry.value;

    const filtered = registrationState.schools.filter(school => {
      const schoolName = (school?.name || school?.school_name || '').toLowerCase();
      const matchesName = !nameValue || schoolName.includes(nameValue);
      const matchesCountry = !countryValue || `${school?.country || ''}` === countryValue;
      return matchesName && matchesCountry;
    });

    renderSchools(filtered);
    if (countEl) {
      countEl.textContent = `${filtered.length}`;
    }
  };

  const renderSchools = (schools) => {
    tableBody.innerHTML = '';

    if (!schools.length) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    if (emptyEl) emptyEl.classList.add('d-none');

    const detailLabel = t('schools_action_detail', 'Detalle');

    schools.forEach(school => {
      const row = document.createElement('tr');
      row.dataset.id = school.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = school?.name || school?.school_name || '-';
      row.appendChild(nameCell);

      const countryCell = document.createElement('td');
      countryCell.textContent = getCountryName(school?.country, countryMap) || '-';
      row.appendChild(countryCell);

      const repCell = document.createElement('td');
      repCell.textContent = school?.representative || '-';
      row.appendChild(repCell);

      const participantsCell = document.createElement('td');
      participantsCell.className = 'text-center';
      const participantsBadge = document.createElement('span');
      participantsBadge.className = 'badge bg-secondary';
      participantsBadge.textContent = `${school.num_participants ?? 0}`;
      participantsCell.appendChild(participantsBadge);
      row.appendChild(participantsCell);

      const choreosCell = document.createElement('td');
      choreosCell.className = 'text-center';
      const totalChoreosBadge = document.createElement('span');
      totalChoreosBadge.className = 'badge bg-dark';
      totalChoreosBadge.textContent = `${school.num_choreos ?? 0}`;
      choreosCell.appendChild(totalChoreosBadge);
      row.appendChild(choreosCell);

      const choreoStatusCell = document.createElement('td');
      choreoStatusCell.className = 'text-center';
      const statusBadges = [
        { value: school.choreos_cre, className: 'bg-primary' },
        { value: school.choreos_pen, className: 'bg-warning text-dark' },
        { value: school.choreos_val, className: 'bg-success' },
        { value: school.choreos_rej, className: 'bg-danger' }
      ];
      statusBadges.forEach((badgeData, index) => {
        const badge = document.createElement('span');
        badge.className = `badge ${badgeData.className}`;
        badge.textContent = `${badgeData.value ?? 0}`;
        choreoStatusCell.appendChild(badge);
        if (index < statusBadges.length - 1) {
          choreoStatusCell.appendChild(document.createTextNode(' / '));
        }
      });
      row.appendChild(choreoStatusCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      const detailBtn = document.createElement('button');
      detailBtn.type = 'button';
      detailBtn.className = 'btn btn-outline-primary btn-sm btn-school-detail';
      detailBtn.dataset.id = school.id;
      detailBtn.textContent = detailLabel;
      actionsCell.appendChild(detailBtn);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  };

  const showSchoolsError = (message) => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    if (emptyEl) emptyEl.classList.add('d-none');
    if (countEl) countEl.textContent = '0';
  };

  const loadSchools = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/schools?event_id=${getEvent().id}`);
      if (!res.ok) {
        throw new Error(t('schools_load_error', 'Error loading schools.'));
      }

      const data = await res.json();
      registrationState.schools = Array.isArray(data) ? data : [];
      applyFilters();
    } catch (err) {
      showSchoolsError(err.message || t('schools_load_error', 'Error loading schools.'));
    }
  };

  const openSchoolDetails = (school) => {
    if (detailElements.name) detailElements.name.value = school?.name || school?.school_name || '';
    if (detailElements.email) detailElements.email.value = school?.email || '';
    if (detailElements.language) detailElements.language.value = school?.language || '';
    if (detailElements.city) detailElements.city.value = school?.city || '';
    if (detailElements.country) {
      detailElements.country.value = getCountryName(school?.country, countryMap) || school?.country || '';
    }
    if (detailElements.phone) detailElements.phone.value = school?.phone || '';
    if (detailElements.representative) detailElements.representative.value = school?.representative || '';
    detailModal.show();
  };

  filterName.addEventListener('input', applyFilters);
  filterCountry.addEventListener('change', applyFilters);
  if (filterClear) {
    filterClear.addEventListener('click', () => {
      filterName.value = '';
      filterCountry.value = '';
      applyFilters();
    });
  }

  tableBody.addEventListener('click', (event) => {
    const detailBtn = event.target.closest('.btn-school-detail');
    if (!detailBtn) return;
    const school = registrationState.schools.find(item => `${item.id}` === `${detailBtn.dataset.id}`);
    if (school) {
      openSchoolDetails(school);
    }
  });

  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  loadSchools();
}

function initRegistrationCategoriesTab() {
  const tableBody = document.getElementById('registrationCategoriesTable');
  const emptyEl = document.getElementById('registrationCategoriesEmpty');
  const countEl = document.getElementById('registrationCategoriesCount');
  const addBtn = document.getElementById('registrationCategoryAddBtn');
  const modalEl = document.getElementById('registrationCategoryModal');
  const deleteModalEl = document.getElementById('registrationCategoryDeleteModal');

  if (!tableBody || !modalEl || !deleteModalEl) {
    return;
  }

  const form = document.getElementById('registrationCategoryForm');
  const elements = {
    id: document.getElementById('registrationCategoryId'),
    name: document.getElementById('registrationCategoryName'),
    minPar: document.getElementById('registrationCategoryMinPar'),
    maxPar: document.getElementById('registrationCategoryMaxPar'),
    minYears: document.getElementById('registrationCategoryMinYears'),
    maxYears: document.getElementById('registrationCategoryMaxYears'),
    musicMaxDuration: document.getElementById('registrationCategoryMusicMaxDuration'),
    modalTitle: document.getElementById('registrationCategoryModalTitle'),
    saveBtn: document.getElementById('registrationCategorySaveBtn'),
    deleteMessage: document.getElementById('registrationCategoryDeleteMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteRegistrationCategoryBtn')
  };

  const categoryModal = new bootstrap.Modal(modalEl);
  const deleteModal = new bootstrap.Modal(deleteModalEl);
  let categoryToDelete = null;

  const normalizeNumber = (value) => {
    const raw = `${value ?? ''}`.trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const setFormValues = (category = {}) => {
    if (elements.id) elements.id.value = category?.id ?? '';
    if (elements.name) elements.name.value = category?.name ?? '';
    if (elements.minPar) elements.minPar.value = category?.min_par ?? '';
    if (elements.maxPar) elements.maxPar.value = category?.max_par ?? '';
    if (elements.minYears) elements.minYears.value = category?.min_years ?? '';
    if (elements.maxYears) elements.maxYears.value = category?.max_years ?? '';
    if (elements.musicMaxDuration) elements.musicMaxDuration.value = category?.music_max_duration ?? '';
  };

  const openCategoryModal = (mode, category = null) => {
    if (!form) return;
    form.dataset.mode = mode;
    form.classList.remove('was-validated');

    if (mode === 'edit') {
      if (elements.modalTitle) {
        elements.modalTitle.textContent = t('registration_categories_modal_edit', 'Editar categoria');
      }
      setFormValues(category || {});
    } else {
      if (elements.modalTitle) {
        elements.modalTitle.textContent = t('registration_categories_modal_create', 'Nueva categoria');
      }
      setFormValues({});
    }

    categoryModal.show();
  };

  const renderCategories = () => {
    tableBody.innerHTML = '';
    const categories = Array.isArray(registrationState.registrationCategories)
      ? registrationState.registrationCategories
      : [];

    if (countEl) {
      countEl.textContent = `${categories.length}`;
    }

    if (!categories.length) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    if (emptyEl) emptyEl.classList.add('d-none');

    const editTitle = t('edit', 'Edit');
    const deleteTitle = t('delete', 'Delete');

    categories.forEach(category => {
      const row = document.createElement('tr');
      row.dataset.id = category.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = category.name || '-';
      row.appendChild(nameCell);

      const minParCell = document.createElement('td');
      minParCell.className = 'text-center';
      minParCell.textContent = category.min_par ?? '-';
      row.appendChild(minParCell);

      const maxParCell = document.createElement('td');
      maxParCell.className = 'text-center';
      maxParCell.textContent = category.max_par ?? '-';
      row.appendChild(maxParCell);

      const minYearsCell = document.createElement('td');
      minYearsCell.className = 'text-center';
      minYearsCell.textContent = category.min_years ?? '-';
      row.appendChild(minYearsCell);

      const maxYearsCell = document.createElement('td');
      maxYearsCell.className = 'text-center';
      maxYearsCell.textContent = category.max_years ?? '-';
      row.appendChild(maxYearsCell);

      const musicMaxCell = document.createElement('td');
      musicMaxCell.className = 'text-center';
      musicMaxCell.textContent = category.music_max_duration ?? '-';
      row.appendChild(musicMaxCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-outline-primary btn-sm btn-registration-category-edit';
      editBtn.dataset.id = category.id;
      editBtn.title = editTitle;
      editBtn.setAttribute('aria-label', editTitle);
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm btn-registration-category-delete';
      deleteBtn.dataset.id = category.id;
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

  const showCategoriesError = (message) => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    if (emptyEl) emptyEl.classList.add('d-none');
    if (countEl) countEl.textContent = '0';
  };

  const loadCategories = async () => {
    try {
      const params = new URLSearchParams();
      const eventObj = getEvent();
      if (eventObj?.id) {
        params.set('event_id', eventObj.id);
      }

      const url = params.toString()
        ? `${API_BASE_URL}/api/registrations/categories?${params.toString()}`
        : `${API_BASE_URL}/api/registrations/categories`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('registration_categories_load_error', 'Error loading categories.'));
      }

      const data = await res.json();
      const categories = Array.isArray(data)
        ? data
        : (Array.isArray(data?.categories) ? data.categories : []);
      registrationState.registrationCategories = categories;
      notifyRegistrationConfigUpdate();
      renderCategories();
    } catch (err) {
      showCategoriesError(err.message || t('registration_categories_load_error', 'Error loading categories.'));
    }
  };

  const saveCategory = async () => {
    if (!form) return;
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    if (elements.saveBtn) {
      elements.saveBtn.disabled = true;
    }

    const originalText = elements.saveBtn ? elements.saveBtn.textContent : '';
    if (elements.saveBtn) {
      elements.saveBtn.textContent = t('saving', 'Guardando...');
    }

    const payload = {
      event_id: getEvent()?.id,
      name: elements.name ? elements.name.value.trim() : '',
      min_par: normalizeNumber(elements.minPar?.value),
      max_par: normalizeNumber(elements.maxPar?.value),
      min_years: normalizeNumber(elements.minYears?.value),
      max_years: normalizeNumber(elements.maxYears?.value),
      music_max_duration: normalizeNumber(elements.musicMaxDuration?.value)
    };

    if (!payload.event_id) delete payload.event_id;

    const isEdit = form.dataset.mode === 'edit';
    const categoryId = elements.id ? elements.id.value : '';
    if (isEdit && categoryId) {
      payload.id = categoryId;
    }

    const url = isEdit && categoryId
      ? `${API_BASE_URL}/api/registrations/categories/${categoryId}`
      : `${API_BASE_URL}/api/registrations/categories`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_categories_save_error', 'Error saving category.');
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

      categoryModal.hide();
      await loadCategories();
    } catch (err) {
      showMessageModal(err.message || t('registration_categories_save_error', 'Error saving category.'), t('error_title', 'Error'));
    } finally {
      if (elements.saveBtn) {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = originalText;
      }
    }
  };

  const deleteCategory = async () => {
    if (!categoryToDelete) return;

    if (elements.confirmDeleteBtn) {
      elements.confirmDeleteBtn.disabled = true;
    }

    try {
      const payload = {
        event_id: getEvent()?.id
      };
      if (!payload.event_id) delete payload.event_id;

      const res = await fetch(`${API_BASE_URL}/api/registrations/categories/${categoryToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_categories_delete_error', 'Error deleting category.');
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
      await loadCategories();
    } catch (err) {
      showMessageModal(err.message || t('registration_categories_delete_error', 'Error deleting category.'), t('error_title', 'Error'));
    } finally {
      if (elements.confirmDeleteBtn) {
        elements.confirmDeleteBtn.disabled = false;
      }
      categoryToDelete = null;
    }
  };

  if (addBtn) {
    addBtn.addEventListener('click', () => openCategoryModal('create'));
  }

  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', saveCategory);
  }

  if (elements.confirmDeleteBtn) {
    elements.confirmDeleteBtn.addEventListener('click', deleteCategory);
  }

  tableBody.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.btn-registration-category-edit');
    const deleteBtn = event.target.closest('.btn-registration-category-delete');

    if (editBtn) {
      const category = registrationState.registrationCategories.find(item => `${item.id}` === `${editBtn.dataset.id}`);
      if (category) {
        openCategoryModal('edit', category);
      }
      return;
    }

    if (!deleteBtn) return;
    const category = registrationState.registrationCategories.find(item => `${item.id}` === `${deleteBtn.dataset.id}`);
    if (!category) return;

    categoryToDelete = category;
    if (elements.deleteMessage) {
      const message = `${t('registration_categories_delete_question', 'Seguro que deseas eliminar la categoria')} "${category.name || ''}"?`;
      elements.deleteMessage.textContent = message;
    }
    deleteModal.show();
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!form) return;
    form.classList.remove('was-validated');
    form.dataset.mode = 'create';
  });

  loadCategories();
}

function initRegistrationDisciplinesTab() {
  const listEl = document.getElementById('list-registration-disciplines');
  const countEl = document.getElementById('count-registration-disciplines');
  const inputEl = document.getElementById('input-registration-disciplines');
  const addBtn = document.getElementById('registrationDisciplinesAddBtn');
  const deleteModalEl = document.getElementById('registrationDisciplineDeleteModal');

  if (!listEl || !inputEl || !addBtn || !deleteModalEl) {
    return;
  }

  const elements = {
    deleteMessage: document.getElementById('registrationDisciplineDeleteMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteRegistrationDisciplineBtn')
  };

  const deleteModal = new bootstrap.Modal(deleteModalEl);
  let disciplineToDelete = null;
  let sortableInstance = null;

  const renderDisciplines = () => {
    listEl.innerHTML = '';
    const disciplines = Array.isArray(registrationState.registrationDisciplines)
      ? [...registrationState.registrationDisciplines]
      : [];

    disciplines.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
    registrationState.registrationDisciplines = disciplines;

    disciplines.forEach(discipline => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.dataset.id = discipline.id;

      const leftDiv = document.createElement('div');
      leftDiv.className = 'd-flex align-items-center gap-2';

      const dragHandle = document.createElement('i');
      dragHandle.className = 'bi bi-grip-vertical text-muted drag-handle';
      dragHandle.style.cursor = 'grab';
      leftDiv.appendChild(dragHandle);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = discipline.name || '-';
      leftDiv.appendChild(nameSpan);

      li.appendChild(leftDiv);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-link text-danger p-0';
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.addEventListener('click', () => {
        disciplineToDelete = discipline;
        if (elements.deleteMessage) {
          const message = `${t('registration_disciplines_delete_question', 'Seguro que deseas eliminar la disciplina')} "${discipline.name || ''}"?`;
          elements.deleteMessage.textContent = message;
        }
        deleteModal.show();
      });

      li.appendChild(deleteBtn);
      listEl.appendChild(li);
    });

    if (countEl) {
      countEl.textContent = `${disciplines.length}`;
    }

    if (!sortableInstance && window.Sortable) {
      sortableInstance = new Sortable(listEl, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: async () => {
          const items = Array.from(listEl.children).map((li, idx) => ({
            id: li.dataset.id,
            position: idx + 1
          }));

          const disciplineById = new Map(
            registrationState.registrationDisciplines.map(item => [`${item.id}`, item])
          );
          registrationState.registrationDisciplines = items.map(item => ({
            ...(disciplineById.get(`${item.id}`) || { id: item.id }),
            position: item.position
          }));
          notifyRegistrationConfigUpdate();

          try {
            const res = await fetch(`${API_BASE_URL}/api/registrations/styles/reorder`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items })
            });

            if (!res.ok) {
              const error = await res.json();
              console.error('Error reordering disciplines:', error);
            }
          } catch (err) {
            console.error('Unexpected reorder error:', err);
          }
        }
      });
    }
  };

  const showDisciplinesError = (message) => {
    listEl.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'list-group-item text-danger';
    li.textContent = message;
    listEl.appendChild(li);
    if (countEl) {
      countEl.textContent = '0';
    }
  };

  const loadDisciplines = async () => {
    try {
      const params = new URLSearchParams();
      const eventObj = getEvent();
      if (eventObj?.id) {
        params.set('event_id', eventObj.id);
      }

      const url = params.toString()
        ? `${API_BASE_URL}/api/registrations/styles?${params.toString()}`
        : `${API_BASE_URL}/api/registrations/styles`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('registration_disciplines_load_error', 'Error loading disciplines.'));
      }

      const data = await res.json();
      const disciplines = Array.isArray(data)
        ? data
        : (Array.isArray(data?.disciplines) ? data.disciplines : []);
      registrationState.registrationDisciplines = disciplines;
      renderDisciplines();
      notifyRegistrationConfigUpdate();
    } catch (err) {
      showDisciplinesError(err.message || t('registration_disciplines_load_error', 'Error loading disciplines.'));
    }
  };

  const addDiscipline = async () => {
    const value = inputEl.value.trim();
    if (!value) {
      inputEl.focus();
      return;
    }

    addBtn.disabled = true;
    const originalText = addBtn.textContent;
    addBtn.textContent = t('saving', 'Guardando...');

    try {
      const payload = { name: value };
      const eventIdValue = getEvent()?.id;
      if (eventIdValue) {
        payload.event_id = eventIdValue;
      }
      const res = await fetch(`${API_BASE_URL}/api/registrations/styles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMessage = t('registration_disciplines_save_error', 'Error saving discipline.');
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

      inputEl.value = '';
      await loadDisciplines();
    } catch (err) {
      showMessageModal(err.message || t('registration_disciplines_save_error', 'Error saving discipline.'), t('error_title', 'Error'));
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = originalText;
      inputEl.focus();
    }
  };

  const deleteDiscipline = async () => {
    if (!disciplineToDelete) return;

    if (elements.confirmDeleteBtn) {
      elements.confirmDeleteBtn.disabled = true;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/registrations/styles/${disciplineToDelete.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        let errorMessage = t('registration_disciplines_delete_error', 'Error deleting discipline.');
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
      await loadDisciplines();
    } catch (err) {
      showMessageModal(err.message || t('registration_disciplines_delete_error', 'Error deleting discipline.'), t('error_title', 'Error'));
    } finally {
      if (elements.confirmDeleteBtn) {
        elements.confirmDeleteBtn.disabled = false;
      }
      disciplineToDelete = null;
    }
  };

  addBtn.addEventListener('click', addDiscipline);
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDiscipline();
    }
  });

  if (elements.confirmDeleteBtn) {
    elements.confirmDeleteBtn.addEventListener('click', deleteDiscipline);
  }

  loadDisciplines();
}

function initOrganizerRegistrationsTab() {
  const tableBody = document.getElementById('orgRegistrationsTable');
  const emptyEl = document.getElementById('orgRegistrationsEmpty');
  const filterForm = document.getElementById('orgRegistrationsFilters');
  const filterSchool = document.getElementById('orgRegistrationsFilterSchool');
  const filterStatus = document.getElementById('orgRegistrationsFilterStatus');
  const filterCategory = document.getElementById('orgRegistrationsFilterCategory');
  const filterStyle = document.getElementById('orgRegistrationsFilterStyle');
  const filterClear = document.getElementById('orgRegistrationsFilterClear');
  const modalEl = document.getElementById('registrationModal');
  const membersModalEl = document.getElementById('registrationMembersModal');
  const validateModalEl = document.getElementById('orgRegistrationValidateModal');
  const rejectModalEl = document.getElementById('orgRegistrationRejectModal');

  if (!tableBody || !emptyEl || !filterForm || !filterSchool || !filterStatus || !filterCategory || !filterStyle || !modalEl || !membersModalEl || !validateModalEl || !rejectModalEl) {
    return;
  }

  const registrationEndpoints = {
    list: '/api/registrations/choreographies',
    music: (id) => `/api/registrations/choreographies/${id}/music`,
    musicDownload: (id) => `/api/registrations/choreographies/${id}/music/download`,
    validate: (id) => `/api/registrations/choreographies/${id}/validate`,
    reject: (id) => `/api/registrations/choreographies/${id}/reject`
  };

  const form = document.getElementById('registrationForm');
  const modalElements = {
    id: document.getElementById('registrationId'),
    choreographyName: document.getElementById('choreographyName'),
    choreographer: document.getElementById('choreographerName'),
    category: document.getElementById('registrationCategory'),
    style: document.getElementById('registrationStyle'),
    modalTitle: document.getElementById('registrationModalTitle'),
    saveBtn: document.getElementById('registrationSaveBtn')
  };
  const validationElements = {
    validateConfirmBtn: document.getElementById('confirmOrgRegistrationValidateBtn'),
    rejectConfirmBtn: document.getElementById('confirmOrgRegistrationRejectBtn'),
    rejectReason: document.getElementById('orgRegistrationRejectReason')
  };
  const audioElements = {
    section: document.getElementById('registrationAudioSection'),
    uploadControls: document.getElementById('registrationAudioUploadControls'),
    name: document.getElementById('registrationAudioName'),
    duration: document.getElementById('registrationAudioDuration'),
    size: document.getElementById('registrationAudioSize'),
    max: document.getElementById('registrationAudioMax'),
    error: document.getElementById('registrationAudioError'),
    removeBtn: document.getElementById('registrationAudioRemoveBtn'),
    saveBtn: document.getElementById('registrationAudioSaveBtn'),
    downloadBtn: document.getElementById('registrationAudioDownloadBtn')
  };
  const registrationModal = new bootstrap.Modal(modalEl);
  const membersModal = new bootstrap.Modal(membersModalEl);
  const validateModal = new bootstrap.Modal(validateModalEl);
  const rejectModal = new bootstrap.Modal(rejectModalEl);

  const membersElements = {
    table: document.getElementById('registrationMembersTable'),
    count: document.getElementById('registrationMembersCount'),
    empty: document.getElementById('registrationMembersEmpty'),
    ruleInfo: document.getElementById('registrationMembersRuleInfo'),
    choreo: document.getElementById('registrationMembersChoreo'),
    category: document.getElementById('registrationMembersCategory'),
    style: document.getElementById('registrationMembersStyle'),
    participantSelect: document.getElementById('registrationParticipantSelect'),
    addMemberBtn: document.getElementById('addRegistrationMemberBtn'),
    saveBtn: document.getElementById('registrationMembersSaveBtn'),
    actionsHeader: document.querySelector('#registrationMembersModal th[data-i18n="registration_competitions_member_actions"]')
  };

  let categoryById = new Map();
  let styleById = new Map();
  let validationTarget = null;
  let rejectTarget = null;

  const populateSelect = (selectEl, items) => {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value=""></option>';
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id ?? item.value ?? '';
      option.textContent = item.name ?? item.label ?? '';
      selectEl.appendChild(option);
    });
  };

  const ensureRegistrationCategories = async () => {
    if (registrationState.registrationCategories.length) {
      return registrationState.registrationCategories;
    }

    const params = new URLSearchParams();
    const eventObj = getEvent();
    if (eventObj?.id) {
      params.set('event_id', eventObj.id);
    }

    const url = params.toString()
      ? `${API_BASE_URL}/api/registrations/categories?${params.toString()}`
      : `${API_BASE_URL}/api/registrations/categories`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(t('registration_categories_load_error', 'Error loading categories.'));
    }

    const data = await res.json();
    const categories = Array.isArray(data)
      ? data
      : (Array.isArray(data?.categories) ? data.categories : []);
    registrationState.registrationCategories = categories;
    syncRegistrationConfigState();
    return categories;
  };

  const ensureRegistrationStyles = async () => {
    if (registrationState.registrationDisciplines.length) {
      return registrationState.registrationDisciplines;
    }

    const params = new URLSearchParams();
    const eventObj = getEvent();
    if (eventObj?.id) {
      params.set('event_id', eventObj.id);
    }

    const url = params.toString()
      ? `${API_BASE_URL}/api/registrations/styles?${params.toString()}`
      : `${API_BASE_URL}/api/registrations/styles`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(t('registration_disciplines_load_error', 'Error loading disciplines.'));
    }

    const data = await res.json();
    const styles = Array.isArray(data)
      ? data
      : (Array.isArray(data?.styles) ? data.styles : (Array.isArray(data?.disciplines) ? data.disciplines : []));
    registrationState.registrationDisciplines = styles;
    syncRegistrationConfigState();
    return styles;
  };

  const loadRegistrationConfig = async () => {
    const categories = await ensureRegistrationCategories();
    const styles = await ensureRegistrationStyles();
    const orderedStyles = [...styles].sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

    categoryById = new Map(categories.map(item => [`${item.id}`, item]));
    styleById = new Map(orderedStyles.map(item => [`${item.id}`, item]));

    const selectedFilterCategory = filterCategory.value;
    const selectedFilterStyle = filterStyle.value;
    const selectedModalCategory = modalElements.category?.value || '';
    const selectedModalStyle = modalElements.style?.value || '';

    populateSelect(filterCategory, categories);
    populateSelect(filterStyle, orderedStyles);
    populateSelect(modalElements.category, categories);
    populateSelect(modalElements.style, orderedStyles);

    if (selectedFilterCategory) filterCategory.value = selectedFilterCategory;
    if (selectedFilterStyle) filterStyle.value = selectedFilterStyle;
    if (modalElements.category && selectedModalCategory) modalElements.category.value = selectedModalCategory;
    if (modalElements.style && selectedModalStyle) modalElements.style.value = selectedModalStyle;
  };

  const loadSchools = async () => {
    try {
      const params = new URLSearchParams();
      const eventObj = getEvent();
      if (eventObj?.id) {
        params.set('event_id', eventObj.id);
      }
      const url = params.toString()
        ? `${API_BASE_URL}/api/schools?${params.toString()}`
        : `${API_BASE_URL}/api/schools`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('schools_load_error', 'Error loading schools.'));
      }
      const data = await res.json();
      const schools = Array.isArray(data) ? data : [];
      filterSchool.innerHTML = '<option value=""></option>';
      schools.forEach(school => {
        const option = document.createElement('option');
        option.value = school.id;
        option.textContent = school?.name || school?.school_name || '-';
        filterSchool.appendChild(option);
      });
    } catch (err) {
      // keep filters but allow list to load
    }
  };

  const normalizeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const safeJson = async (res) => {
    try {
      return await res.json();
    } catch (err) {
      return null;
    }
  };

  const formatDuration = (value) => {
    const totalSeconds = Math.round(Number(value));
    if (!Number.isFinite(totalSeconds)) return '-';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const getEventIdValue = () => getEvent()?.id;

  const getMusicUrl = (registrationId) => {
    const eventIdValue = getEventIdValue();
    return eventIdValue
      ? `${API_BASE_URL}${registrationEndpoints.music(registrationId)}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${registrationEndpoints.music(registrationId)}`;
  };

  const getMusicDownloadUrl = (registrationId) => {
    const eventIdValue = getEventIdValue();
    return eventIdValue
      ? `${API_BASE_URL}${registrationEndpoints.musicDownload(registrationId)}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${registrationEndpoints.musicDownload(registrationId)}`;
  };

  const buildActionUrl = (endpoint) => {
    const eventIdValue = getEventIdValue();
    return eventIdValue
      ? `${API_BASE_URL}${endpoint}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${endpoint}`;
  };

  const setAudioSectionVisible = (visible) => {
    if (!audioElements.section) return;
    audioElements.section.classList.toggle('d-none', !visible);
  };

  const setAudioViewMode = (isViewOnly) => {
    if (audioElements.uploadControls) {
      audioElements.uploadControls.classList.toggle('d-none', isViewOnly);
    }
    if (audioElements.removeBtn) {
      audioElements.removeBtn.classList.toggle('d-none', isViewOnly);
    }
    if (audioElements.saveBtn) {
      audioElements.saveBtn.classList.toggle('d-none', isViewOnly);
    }
    if (audioElements.error) {
      audioElements.error.classList.add('d-none');
      audioElements.error.textContent = '';
    }
  };

  const setAudioDownloadState = (hasAudio, url, filename) => {
    if (!audioElements.downloadBtn) return;
    audioElements.downloadBtn.classList.toggle('d-none', !hasAudio);
    if (!hasAudio) {
      audioElements.downloadBtn.href = '#';
      audioElements.downloadBtn.removeAttribute('download');
      audioElements.downloadBtn.setAttribute('aria-disabled', 'true');
      audioElements.downloadBtn.tabIndex = -1;
      return;
    }
    audioElements.downloadBtn.href = url || '#';
    if (filename) {
      audioElements.downloadBtn.setAttribute('download', filename);
    } else {
      audioElements.downloadBtn.removeAttribute('download');
    }
    audioElements.downloadBtn.setAttribute('aria-disabled', 'false');
    audioElements.downloadBtn.tabIndex = 0;
  };

  const resetAudioInfo = () => {
    if (audioElements.name) audioElements.name.textContent = '-';
    if (audioElements.duration) audioElements.duration.textContent = '-';
    if (audioElements.size) audioElements.size.textContent = '-';
    setAudioDownloadState(false);
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'audio';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getFilenameFromHeader = (headerValue) => {
    if (!headerValue) return '';
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(headerValue);
    if (!match || !match[1]) return '';
    try {
      return decodeURIComponent(match[1].replace(/\"/g, '').trim());
    } catch (err) {
      return match[1].replace(/\"/g, '').trim();
    }
  };

  const handleAudioDownloadClick = async (event, registrationId) => {
    event.preventDefault();
    if (!registrationId) return;
    const url = getMusicDownloadUrl(registrationId);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const data = await safeJson(res);
        const message = data?.error || t('registration_audio_download_error', 'Error downloading audio.');
        throw new Error(message);
      }
      const blob = await res.blob();
      const headerFilename = getFilenameFromHeader(res.headers.get('content-disposition'));
      const fallbackName = audioElements.name?.textContent || '';
      downloadBlob(blob, headerFilename || fallbackName || 'audio');
    } catch (err) {
      showMessageModal(err.message || t('registration_audio_download_error', 'Error downloading audio.'), t('error_title', 'Error'));
    }
  };

  const setAudioInfo = (info, registrationId) => {
    if (audioElements.name) audioElements.name.textContent = info?.original_name || '-';
    if (audioElements.duration) {
      const durationValue = normalizeNumber(info?.duration);
      audioElements.duration.textContent = durationValue != null ? formatDuration(durationValue) : '-';
    }
    if (audioElements.size) {
      const sizeValue = normalizeNumber(info?.size);
      audioElements.size.textContent = sizeValue != null ? formatBytes(sizeValue) : '-';
    }
    const downloadUrl = info?.download_url || info?.url || info?.file_url || getMusicDownloadUrl(registrationId);
    setAudioDownloadState(Boolean(info?.original_name), downloadUrl, info?.original_name);
    if (audioElements.downloadBtn) {
      audioElements.downloadBtn.onclick = (event) => handleAudioDownloadClick(event, registrationId);
    }
  };

  const fetchRegistrationAudioInfo = async (registrationId) => {
    if (!registrationId) return;
    resetAudioInfo();
    try {
      const url = getMusicUrl(registrationId);
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          return;
        }
        const data = await safeJson(res);
        const message = data?.error || t('registration_audio_load_error', 'Error loading audio.');
        throw new Error(message);
      }
      const data = await safeJson(res);
      if (!data || !data.original_name) {
        return;
      }
      setAudioInfo(data, registrationId);
    } catch (err) {
      showMessageModal(err.message || t('registration_audio_load_error', 'Error loading audio.'), t('error_title', 'Error'));
    }
  };

  const openValidateModal = (registration) => {
    validationTarget = registration;
    if (validationElements.validateConfirmBtn) {
      validationElements.validateConfirmBtn.disabled = false;
    }
    validateModal.show();
  };

  const openRejectModal = (registration) => {
    rejectTarget = registration;
    if (validationElements.rejectReason) {
      validationElements.rejectReason.value = '';
      validationElements.rejectReason.classList.remove('is-invalid');
    }
    if (validationElements.rejectConfirmBtn) {
      validationElements.rejectConfirmBtn.disabled = false;
    }
    rejectModal.show();
  };

  const submitValidation = async () => {
    if (!validationTarget) return;
    if (validationElements.validateConfirmBtn) {
      validationElements.validateConfirmBtn.disabled = true;
    }

    try {
      const url = buildActionUrl(registrationEndpoints.validate(validationTarget.id));
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        let message = t('org_registrations_validate_error', 'Error validating registration.');
        try {
          const data = await res.json();
          if (data?.error) {
            message = data.error;
          }
        } catch (err) {
          // ignore
        }
        throw new Error(message);
      }
      validateModal.hide();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('org_registrations_validate_error', 'Error validating registration.'), t('error_title', 'Error'));
    } finally {
      if (validationElements.validateConfirmBtn) {
        validationElements.validateConfirmBtn.disabled = false;
      }
      validationTarget = null;
    }
  };

  const submitRejection = async () => {
    if (!rejectTarget) return;
    const reason = validationElements.rejectReason ? validationElements.rejectReason.value.trim() : '';
    if (!reason) {
      if (validationElements.rejectReason) {
        validationElements.rejectReason.classList.add('is-invalid');
        validationElements.rejectReason.focus();
      }
      return;
    }

    if (validationElements.rejectConfirmBtn) {
      validationElements.rejectConfirmBtn.disabled = true;
    }

    try {
      const url = buildActionUrl(registrationEndpoints.reject(rejectTarget.id));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_reason: reason })
      });
      if (!res.ok) {
        let message = t('org_registrations_reject_error_request', 'Error rejecting registration.');
        try {
          const data = await res.json();
          if (data?.error) {
            message = data.error;
          }
        } catch (err) {
          // ignore
        }
        throw new Error(message);
      }
      rejectModal.hide();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('org_registrations_reject_error_request', 'Error rejecting registration.'), t('error_title', 'Error'));
    } finally {
      if (validationElements.rejectConfirmBtn) {
        validationElements.rejectConfirmBtn.disabled = false;
      }
      rejectTarget = null;
    }
  };

  const getParticipantsCount = (registration) => {
    if (!registration) return 0;
    const count = registration.participants_count ?? registration.members_count ?? registration.member_count ?? registration.num_participants;
    if (count !== undefined && count !== null) return Number(count) || 0;
    if (Array.isArray(registration.members)) return registration.members.length;
    if (Array.isArray(registration.participants)) return registration.participants.length;
    return 0;
  };

  const formatStatusInfo = (status) => {
    const statusMap = {
      CRE: { label: t('registration_status_creation', 'En creacion'), color: 'primary' },
      PEN: { label: t('registration_status_pending', 'Pendiente validar'), color: 'warning' },
      VAL: { label: t('registration_status_validated', 'Validada'), color: 'success' },
      REJ: { label: t('registration_status_rejected', 'Rechazada'), color: 'danger' }
    };
    const info = statusMap[status] || { label: status || '-', color: 'secondary' };
    return { ...info, label: `${info.label}`.toUpperCase() };
  };

  const applyFilters = () => {
    const schoolValue = filterSchool.value;
    const statusValue = filterStatus.value;
    const categoryValue = filterCategory.value;
    const styleValue = filterStyle.value;

    return registrationState.organizerRegistrations.filter(registration => {
      const schoolId = registration?.school_id ?? registration?.school?.id;
      if (schoolValue && `${schoolId || ''}` !== `${schoolValue}`) return false;
      if (statusValue && `${registration?.status || ''}` !== `${statusValue}`) return false;
      const categoryId = registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id;
      if (categoryValue && `${categoryId || ''}` !== `${categoryValue}`) return false;
      const styleId = registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id;
      if (styleValue && `${styleId || ''}` !== `${styleValue}`) return false;
      return true;
    });
  };

  const setMembersViewMode = (isViewOnly) => {
    const controlsRow = membersElements.participantSelect?.closest('.d-flex');
    if (controlsRow) {
      controlsRow.classList.toggle('d-none', isViewOnly);
    }
    if (membersElements.saveBtn) {
      membersElements.saveBtn.classList.toggle('d-none', isViewOnly);
    }
    if (membersElements.actionsHeader) {
      membersElements.actionsHeader.classList.toggle('d-none', isViewOnly);
    }
  };

  const renderMembersTable = (members) => {
    if (!membersElements.table) return;
    membersElements.table.innerHTML = '';

    if (membersElements.count) {
      membersElements.count.textContent = `${members.length}`;
    }

    if (!members.length) {
      if (membersElements.empty) membersElements.empty.classList.remove('d-none');
      return;
    }

    if (membersElements.empty) membersElements.empty.classList.add('d-none');

    members.forEach(member => {
      const row = document.createElement('tr');
      row.dataset.id = member.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = member.name || '';
      row.appendChild(nameCell);

      const genderCell = document.createElement('td');
      genderCell.textContent = member.gender || '-';
      row.appendChild(genderCell);

      const dobValue = getDateOnlyValue(member.date_of_birth);
      const dobCell = document.createElement('td');
      dobCell.textContent = dobValue || '-';
      row.appendChild(dobCell);

      const ageCell = document.createElement('td');
      ageCell.textContent = `${calculateAge(dobValue)}`;
      row.appendChild(ageCell);

      membersElements.table.appendChild(row);
    });
  };

  const updateMembersRuleInfo = (category) => {
    if (!membersElements.ruleInfo) return;
    if (!category) {
      membersElements.ruleInfo.textContent = '';
      return;
    }

    const minLabel = t('registration_competitions_rule_min', 'Min');
    const maxLabel = t('registration_competitions_rule_max', 'Max');
    const minPar = normalizeNumber(category.min_par);
    const maxPar = normalizeNumber(category.max_par);

    let info = `${minLabel}: ${minPar ?? '-'} | ${maxLabel}: ${maxPar ?? '-'}`;

    const minYears = normalizeNumber(category.min_years);
    const maxYears = normalizeNumber(category.max_years);
    if (minYears !== null || maxYears !== null) {
      const ageLabel = t('registration_competitions_rule_age', 'Edad');
      info += ` | ${ageLabel}: ${minYears ?? '-'}-${maxYears ?? '-'}`;
    }

    membersElements.ruleInfo.textContent = info;
  };

  const fetchRegistrationDetails = async (registrationId) => {
    const params = new URLSearchParams();
    const eventObj = getEvent();
    if (eventObj?.id) {
      params.set('event_id', eventObj.id);
    }

    const url = params.toString()
      ? `${API_BASE_URL}/api/registrations/${registrationId}?${params.toString()}`
      : `${API_BASE_URL}/api/registrations/${registrationId}`;

    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    try {
      return await res.json();
    } catch (err) {
      return null;
    }
  };

  const normalizeMembers = (members) => {
    if (!Array.isArray(members)) return [];
    return members.map(member => {
      if (member && typeof member === 'object') {
        const memberId = member.id ?? member.participant_id ?? member.member_id;
        return {
          ...member,
          id: memberId,
          name: member.name || member.participant_name || `#${memberId ?? ''}`,
          date_of_birth: member.date_of_birth || member.birth_date || member.dob
        };
      }
      return { id: member, name: `#${member}` };
    }).filter(Boolean);
  };

  const openMembersModal = async (registration) => {
    if (!registration) return;

    try {
      await loadRegistrationConfig();
    } catch (err) {
      showMessageModal(err.message || t('org_registrations_load_error', 'Error loading registrations.'), t('error_title', 'Error'));
      return;
    }

    const categoryId = registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '';
    const category = categoryById.get(`${categoryId}`) || null;
    const styleId = registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id ?? '';
    const styleName = registration.style_name || styleById.get(`${styleId}`)?.name || '-';

    if (membersElements.choreo) {
      membersElements.choreo.textContent = registration.name || registration.choreography || '-';
    }
    if (membersElements.category) {
      membersElements.category.textContent = category?.name || registration.category_name || '-';
    }
    if (membersElements.style) {
      membersElements.style.textContent = styleName || '-';
    }
    updateMembersRuleInfo(category);

    let members = [];
    if (Array.isArray(registration.members)) {
      members = normalizeMembers(registration.members);
    } else {
      const details = await fetchRegistrationDetails(registration.id);
      if (details && Array.isArray(details.members)) {
        members = normalizeMembers(details.members);
      }
    }

    membersModalEl.dataset.viewOnly = 'true';
    setMembersViewMode(true);
    renderMembersTable(members);
    membersModal.show();
  };

  const setModalViewMode = (isViewOnly) => {
    const textInputs = [modalElements.choreographyName, modalElements.choreographer];
    const selects = [modalElements.category, modalElements.style];

    textInputs.forEach(input => {
      if (!input) return;
      if (isViewOnly) {
        input.setAttribute('readonly', 'readonly');
        input.classList.add('bg-light');
      } else {
        input.removeAttribute('readonly');
        input.classList.remove('bg-light');
      }
    });

    selects.forEach(select => {
      if (!select) return;
      select.disabled = isViewOnly;
      select.classList.toggle('bg-light', isViewOnly);
    });

    if (modalElements.saveBtn) {
      modalElements.saveBtn.classList.toggle('d-none', isViewOnly);
    }
    setAudioViewMode(isViewOnly);
  };

  const openRegistrationDetails = async (registration) => {
    if (!registration || !form) return;

    try {
      await loadRegistrationConfig();
    } catch (err) {
      showMessageModal(err.message || t('org_registrations_load_error', 'Error loading registrations.'), t('error_title', 'Error'));
      return;
    }

    if (modalElements.modalTitle) {
      modalElements.modalTitle.textContent = t('org_registrations_details_title', 'Detalle inscripcion');
    }

    if (modalElements.id) modalElements.id.value = registration.id || '';
    if (modalElements.choreographyName) modalElements.choreographyName.value = registration.name || registration.choreography || '';
    if (modalElements.choreographer) modalElements.choreographer.value = registration.choreographer || '';

    const categoryId = registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '';
    const styleId = registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id ?? '';
    if (modalElements.category) modalElements.category.value = categoryId ? `${categoryId}` : '';
    if (modalElements.style) modalElements.style.value = styleId ? `${styleId}` : '';

    modalEl.dataset.viewOnly = 'true';
    setModalViewMode(true);
    setAudioSectionVisible(true);
    resetAudioInfo();
    await fetchRegistrationAudioInfo(registration.id);
    registrationModal.show();
  };

  const renderRegistrations = () => {
    tableBody.innerHTML = '';
    const registrations = applyFilters();

    if (!registrations.length) {
      emptyEl.classList.remove('d-none');
      return;
    }

    emptyEl.classList.add('d-none');

    const detailsLabel = t('org_registrations_action_details', 'Detalles');
    const validateLabel = t('org_registrations_action_validate', 'Validar');
    const rejectLabel = t('org_registrations_action_reject', 'Rechazar');
    const membersLabel = t('org_registrations_action_members', 'Participantes');

    registrations.forEach(registration => {
      const row = document.createElement('tr');
      row.dataset.id = registration.id;

      const schoolCell = document.createElement('td');
      schoolCell.textContent = registration.school_name || registration.school?.name || '-';
      row.appendChild(schoolCell);

      const nameCell = document.createElement('td');
      nameCell.textContent = registration.name || registration.choreography || '-';
      row.appendChild(nameCell);

      const categoryId = registration?.reg_category_id ?? registration?.category_id ?? registration?.reg_category?.id ?? '';
      const categoryName = registration.category_name || categoryById.get(`${categoryId}`)?.name || '-';
      const categoryCell = document.createElement('td');
      categoryCell.textContent = categoryName;
      row.appendChild(categoryCell);

      const styleId = registration?.reg_style_id ?? registration?.style_id ?? registration?.reg_style?.id ?? '';
      const styleName = registration.style_name || styleById.get(`${styleId}`)?.name || '-';
      const styleCell = document.createElement('td');
      styleCell.textContent = styleName;
      row.appendChild(styleCell);

      const statusCell = document.createElement('td');
      const statusInfo = formatStatusInfo(registration.status);
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge bg-${statusInfo.color}`;
      statusBadge.textContent = statusInfo.label;
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);

      const participantsCell = document.createElement('td');
      participantsCell.className = 'text-center';
      participantsCell.textContent = `${getParticipantsCount(registration)}`;
      row.appendChild(participantsCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      const validateBtn = document.createElement('button');
      validateBtn.type = 'button';
      validateBtn.className = 'btn btn-outline-success btn-sm btn-org-registration-validate';
      validateBtn.textContent = validateLabel;
      validateBtn.disabled = registration.status !== 'PEN';
      validateBtn.dataset.id = registration.id;

      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = 'btn btn-outline-danger btn-sm btn-org-registration-reject';
      rejectBtn.textContent = rejectLabel;
      rejectBtn.disabled = !['PEN', 'VAL'].includes(`${registration.status || ''}`);
      rejectBtn.dataset.id = registration.id;

      const membersBtn = document.createElement('button');
      membersBtn.type = 'button';
      membersBtn.className = 'btn btn-outline-secondary btn-sm btn-org-registration-members';
      membersBtn.dataset.id = registration.id;
      membersBtn.textContent = membersLabel;

      const detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className = 'btn btn-outline-primary btn-sm btn-org-registration-details';
      detailsBtn.dataset.id = registration.id;
      detailsBtn.textContent = detailsLabel;

      actionGroup.appendChild(validateBtn);
      actionGroup.appendChild(rejectBtn);
      actionGroup.appendChild(membersBtn);
      actionGroup.appendChild(detailsBtn);
      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  };

  const showRegistrationsError = (message) => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    emptyEl.classList.add('d-none');
  };

  const loadRegistrations = async () => {
    try {
      const params = new URLSearchParams();
      const eventObj = getEvent();
      if (eventObj?.id) {
        params.set('event_id', eventObj.id);
      }
      const url = params.toString()
        ? `${API_BASE_URL}${registrationEndpoints.list}?${params.toString()}`
        : `${API_BASE_URL}${registrationEndpoints.list}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('org_registrations_load_error', 'Error loading registrations.'));
      }

      const data = await res.json();
      registrationState.organizerRegistrations = Array.isArray(data) ? data : [];
      renderRegistrations();
    } catch (err) {
      showRegistrationsError(err.message || t('org_registrations_load_error', 'Error loading registrations.'));
    }
  };

  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
  filterSchool.addEventListener('change', renderRegistrations);
  filterStatus.addEventListener('change', renderRegistrations);
  filterCategory.addEventListener('change', renderRegistrations);
  filterStyle.addEventListener('change', renderRegistrations);
  filterClear.addEventListener('click', () => {
    filterSchool.value = '';
    filterStatus.value = '';
    filterCategory.value = '';
    filterStyle.value = '';
    renderRegistrations();
  });

  const handleConfigUpdate = () => {
    loadRegistrationConfig()
      .then(renderRegistrations)
      .catch(() => {});
  };
  window.addEventListener('registration:config-updated', handleConfigUpdate);

  tableBody.addEventListener('click', (event) => {
    const detailsBtn = event.target.closest('.btn-org-registration-details');
    const membersBtn = event.target.closest('.btn-org-registration-members');
    const validateBtn = event.target.closest('.btn-org-registration-validate');
    const rejectBtn = event.target.closest('.btn-org-registration-reject');
    if (membersBtn) {
      const registration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${membersBtn.dataset.id}`);
      if (registration) {
        openMembersModal(registration);
      }
      return;
    }
    if (validateBtn) {
      const registration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${validateBtn.dataset.id}`);
      if (registration) {
        openValidateModal(registration);
      }
      return;
    }
    if (rejectBtn) {
      const registration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${rejectBtn.dataset.id}`);
      if (registration) {
        openRejectModal(registration);
      }
      return;
    }
    if (!detailsBtn) return;
    const registration = registrationState.organizerRegistrations.find(item => `${item.id}` === `${detailsBtn.dataset.id}`);
    if (registration) {
      openRegistrationDetails(registration);
    }
  });

  if (validationElements.validateConfirmBtn) {
    validationElements.validateConfirmBtn.addEventListener('click', submitValidation);
  }
  if (validationElements.rejectConfirmBtn) {
    validationElements.rejectConfirmBtn.addEventListener('click', submitRejection);
  }
  if (validationElements.rejectReason) {
    validationElements.rejectReason.addEventListener('input', () => {
      validationElements.rejectReason.classList.remove('is-invalid');
    });
  }

  modalEl.addEventListener('hidden.bs.modal', () => {
    if (modalEl.dataset.viewOnly !== 'true') return;
    setModalViewMode(false);
    delete modalEl.dataset.viewOnly;
  });
  membersModalEl.addEventListener('hidden.bs.modal', () => {
    if (membersModalEl.dataset.viewOnly !== 'true') return;
    setMembersViewMode(false);
    delete membersModalEl.dataset.viewOnly;
    if (membersElements.table) {
      membersElements.table.innerHTML = '';
    }
    if (membersElements.empty) {
      membersElements.empty.classList.remove('d-none');
    }
  });

  Promise.resolve()
    .then(loadRegistrationConfig)
    .then(loadSchools)
    .then(loadRegistrations)
    .catch(() => loadRegistrations());
}
