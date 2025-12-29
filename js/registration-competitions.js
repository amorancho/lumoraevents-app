function initCompetitionsTab() {
  const tableBody = document.getElementById('registrationsTable');
  const countEl = document.getElementById('registrationsCount');
  const emptyEl = document.getElementById('registrationsEmpty');
  const createBtn = document.getElementById('createRegistrationBtn');
  const modalEl = document.getElementById('registrationModal');
  const deleteModalEl = document.getElementById('deleteRegistrationModal');

  if (!tableBody || !modalEl || !deleteModalEl) {
    return;
  }

  const user = getUserFromToken();
  if (!user || !user.id) {
    showMessageModal(t('registration_school_no_user', 'No user found.'), t('error_title', 'Error'));
    return;
  }

  const form = document.getElementById('registrationForm');
  const elements = {
    id: document.getElementById('registrationId'),
    choreographyName: document.getElementById('choreographyName'),
    choreographer: document.getElementById('choreographerName'),
    category: document.getElementById('registrationCategory'),
    style: document.getElementById('registrationStyle'),
    categoryInfo: document.getElementById('categoryRuleInfo'),
    participantSelect: document.getElementById('registrationParticipantSelect'),
    addMemberBtn: document.getElementById('addRegistrationMemberBtn'),
    membersTable: document.getElementById('registrationMembersTable'),
    membersCount: document.getElementById('registrationMembersCount'),
    membersEmpty: document.getElementById('registrationMembersEmpty'),
    saveBtn: document.getElementById('registrationSaveBtn'),
    modalTitle: document.getElementById('registrationModalTitle'),
    deleteMessage: document.getElementById('deleteRegistrationMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteRegistrationBtn')
  };

  const registrationModal = new bootstrap.Modal(modalEl);
  const deleteModal = new bootstrap.Modal(deleteModalEl);

  const registrationEndpoints = {
    config: '/api/registrations/config',
    list: '/api/registrations/choreographies',
    registerChoreography: '/api/registrations/choreographies',
    registration: '/api/registrations/choreographies',
    members: (id) => `/api/registrations/choreographies/${id}/members`,
    detail: (id) => `/api/registrations/${id}`
  };

  let participantSelect = null;
  let participantsById = new Map();
  let categoryById = new Map();
  let styleById = new Map();
  let selectedMembers = [];
  let registrationToDelete = null;

  const getEventIdValue = () => {
    const eventObj = getEvent();
    return eventObj?.id || registrationState.school?.event_id;
  };

  const safeJson = async (res) => {
    try {
      return await res.json();
    } catch (err) {
      return null;
    }
  };

  const normalizeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getSelectedCategory = () => {
    const categoryId = elements.category ? elements.category.value : '';
    if (!categoryId) return null;
    return categoryById.get(`${categoryId}`) || null;
  };

  const isIndividualCategory = (category) => {
    if (!category) return false;
    const minPar = normalizeNumber(category.min_par);
    const maxPar = normalizeNumber(category.max_par);
    return minPar === 1 && maxPar === 1;
  };
  const updateCategoryInfo = () => {
    if (!elements.categoryInfo) return;
    const category = getSelectedCategory();
    if (!category) {
      elements.categoryInfo.textContent = '';
      return;
    }

    const minLabel = t('registration_competitions_rule_min', 'Min');
    const maxLabel = t('registration_competitions_rule_max', 'Max');
    const minPar = normalizeNumber(category.min_par);
    const maxPar = normalizeNumber(category.max_par);

    let info = `${minLabel}: ${minPar ?? '-'} | ${maxLabel}: ${maxPar ?? '-'}`;

    if (isIndividualCategory(category)) {
      const minYears = normalizeNumber(category.min_years);
      const maxYears = normalizeNumber(category.max_years);
      if (minYears !== null || maxYears !== null) {
        const ageLabel = t('registration_competitions_rule_age', 'Edad');
        info += ` | ${ageLabel}: ${minYears ?? '-'}-${maxYears ?? '-'}`;
      }
    }

    elements.categoryInfo.textContent = info;
  };

  const updateMemberControls = () => {
    if (!elements.addMemberBtn) return;
    const category = getSelectedCategory();
    if (!category || !registrationState.participants.length) {
      elements.addMemberBtn.disabled = true;
      return;
    }
    const maxPar = normalizeNumber(category.max_par);
    const reachedMax = maxPar !== null && selectedMembers.length >= maxPar;
    elements.addMemberBtn.disabled = reachedMax;
  };

  const updateMemberCount = () => {
    if (elements.membersCount) {
      elements.membersCount.textContent = `${selectedMembers.length}`;
    }
  };

  const renderMembersTable = () => {
    if (!elements.membersTable) return;
    elements.membersTable.innerHTML = '';

    updateMemberCount();

    if (!selectedMembers.length) {
      if (elements.membersEmpty) elements.membersEmpty.classList.remove('d-none');
      return;
    }

    if (elements.membersEmpty) elements.membersEmpty.classList.add('d-none');

    const deleteTitle = t('delete', 'Delete');

    selectedMembers.forEach(member => {
      const row = document.createElement('tr');
      row.dataset.id = member.id;

      const nameCell = document.createElement('td');
      nameCell.textContent = member.name || '';
      row.appendChild(nameCell);

      const dobValue = getDateOnlyValue(member.date_of_birth);
      const dobCell = document.createElement('td');
      dobCell.textContent = dobValue || '-';
      row.appendChild(dobCell);

      const ageCell = document.createElement('td');
      ageCell.textContent = `${calculateAge(dobValue)}`;
      row.appendChild(ageCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-outline-danger btn-sm btn-remove-member';
      removeBtn.dataset.id = member.id;
      removeBtn.title = deleteTitle;
      removeBtn.setAttribute('aria-label', deleteTitle);
      removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
      actionsCell.appendChild(removeBtn);
      row.appendChild(actionsCell);

      elements.membersTable.appendChild(row);
    });

    updateMemberControls();
  };
  const refreshParticipantSelect = () => {
    if (!elements.participantSelect) return;

    const excluded = new Set(selectedMembers.map(member => `${member.id}`));
    const options = registrationState.participants
      .filter(participant => !excluded.has(`${participant.id}`))
      .map(participant => ({
        value: `${participant.id}`,
        text: participant.name || `${participant.id}`,
        dob: participant.date_of_birth
      }));

    if (participantSelect) {
      participantSelect.clear(true);
      participantSelect.clearOptions();
      participantSelect.addOptions(options);
      participantSelect.refreshOptions(false);
      return;
    }

    if (window.TomSelect) {
      participantSelect = new TomSelect(elements.participantSelect, {
        options,
        allowEmptyOption: true,
        maxOptions: 200,
        placeholder: t('registration_competitions_participant_placeholder', 'Escribe para buscar...'),
        render: {
          option: (data, escape) => {
            const ageValue = calculateAge(getDateOnlyValue(data.dob));
            const ageText = ageValue === '-' ? '' : `${ageValue}`;
            return `<div class="d-flex justify-content-between">
              <span>${escape(data.text)}</span>
              <span class="text-muted small">${escape(ageText)}</span>
            </div>`;
          },
          item: (data, escape) => `<div>${escape(data.text)}</div>`
        }
      });
      return;
    }

    elements.participantSelect.innerHTML = '<option value=""></option>';
    options.forEach(optionData => {
      const option = document.createElement('option');
      option.value = optionData.value;
      option.textContent = optionData.text;
      elements.participantSelect.appendChild(option);
    });
  };

  const ensureParticipantsLoaded = async () => {
    if (Array.isArray(registrationState.participants) && registrationState.participants.length) {
      participantsById = new Map(registrationState.participants.map(p => [`${p.id}`, p]));
      return;
    }

    const params = new URLSearchParams();
    params.set('school_id', user.id);
    const eventIdValue = getEventIdValue();
    if (eventIdValue) {
      params.set('event_id', eventIdValue);
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
    participantsById = new Map(registrationState.participants.map(p => [`${p.id}`, p]));
  };

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

  const loadRegistrationConfig = async () => {
    if (registrationState.registrationConfig.categories.length || registrationState.registrationConfig.styles.length) {
      categoryById = new Map(registrationState.registrationConfig.categories.map(item => [`${item.id}`, item]));
      styleById = new Map(registrationState.registrationConfig.styles.map(item => [`${item.id}`, item]));
      populateSelect(elements.category, registrationState.registrationConfig.categories);
      populateSelect(elements.style, registrationState.registrationConfig.styles);
      return;
    }

    const params = new URLSearchParams();
    const eventIdValue = getEventIdValue();
    if (eventIdValue) {
      params.set('event_id', eventIdValue);
    }

    const url = params.toString()
      ? `${API_BASE_URL}${registrationEndpoints.config}?${params.toString()}`
      : `${API_BASE_URL}${registrationEndpoints.config}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(t('registration_competitions_load_error', 'Error loading registrations.'));
    }

    const data = await res.json();
    const categories = Array.isArray(data?.categories) ? data.categories : [];
    const styles = Array.isArray(data?.styles) ? data.styles : [];

    registrationState.registrationConfig = { categories, styles };
    categoryById = new Map(categories.map(item => [`${item.id}`, item]));
    styleById = new Map(styles.map(item => [`${item.id}`, item]));

    populateSelect(elements.category, categories);
    populateSelect(elements.style, styles);
  };
  const normalizeMembers = (members) => {
    if (!Array.isArray(members)) return [];
    return members.map(member => {
      if (member && typeof member === 'object') {
        const memberId = member.id ?? member.participant_id ?? member.member_id;
        const fallback = memberId ? participantsById.get(`${memberId}`) : null;
        return {
          ...fallback,
          ...member,
          id: memberId ?? fallback?.id ?? member.id,
          name: member.name ?? member.participant_name ?? fallback?.name ?? `${memberId ?? ''}`.trim(),
          date_of_birth: member.date_of_birth ?? member.birth ?? member.dob ?? fallback?.date_of_birth
        };
      }
      const fallback = participantsById.get(`${member}`);
      return fallback || { id: member, name: `#${member}` };
    }).filter(Boolean);
  };

  const fetchRegistrationDetails = async (registrationId) => {
    const params = new URLSearchParams();
    params.set('school_id', user.id);
    const eventIdValue = getEventIdValue();
    if (eventIdValue) {
      params.set('event_id', eventIdValue);
    }

    const url = params.toString()
      ? `${API_BASE_URL}${registrationEndpoints.detail(registrationId)}?${params.toString()}`
      : `${API_BASE_URL}${registrationEndpoints.detail(registrationId)}`;

    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    return safeJson(res);
  };

  const resolveRegistrationMembers = async (registration) => {
    if (!registration) return [];
    if (Array.isArray(registration.members)) {
      return normalizeMembers(registration.members);
    }
    const details = await fetchRegistrationDetails(registration.id);
    if (details && Array.isArray(details.members)) {
      return normalizeMembers(details.members);
    }
    return [];
  };

  const resetForm = () => {
    if (form) form.classList.remove('was-validated');
    if (elements.id) elements.id.value = '';
    if (elements.choreographyName) elements.choreographyName.value = '';
    if (elements.choreographer) elements.choreographer.value = '';
    if (elements.category) elements.category.value = '';
    if (elements.style) elements.style.value = '';
    selectedMembers = [];
    updateCategoryInfo();
    renderMembersTable();
    refreshParticipantSelect();
  };

  const openRegistrationModal = async (mode, registration = null) => {
    if (!form) return;

    form.dataset.mode = mode;
    form.classList.remove('was-validated');

    if (elements.modalTitle) {
      elements.modalTitle.textContent = mode === 'edit'
        ? t('registration_competitions_modal_edit', 'Editar inscripcion')
        : t('registration_competitions_modal_create', 'Crear inscripcion');
    }

    if (elements.saveBtn) {
      elements.saveBtn.textContent = t('save', 'Guardar');
    }

    try {
      await loadRegistrationConfig();
      await ensureParticipantsLoaded();
      refreshParticipantSelect();
    } catch (err) {
      showMessageModal(err.message || t('registration_competitions_load_error', 'Error loading registrations.'), t('error_title', 'Error'));
      return;
    }

    if (mode === 'create') {
      resetForm();
      registrationModal.show();
      return;
    }

    if (!registration) {
      resetForm();
      registrationModal.show();
      return;
    }

    elements.id.value = registration.id || '';
    elements.choreographyName.value = registration.name || '';
    elements.choreographer.value = registration.choreographer || '';
    elements.category.value = registration.reg_category_id;
    elements.style.value = registration.reg_style_id;


    selectedMembers = await resolveRegistrationMembers(registration);
    updateCategoryInfo();
    renderMembersTable();
    refreshParticipantSelect();
    registrationModal.show();
  };
  /*
  const getParticipantsCount = (registration) => {
    if (!registration) return 0;
    const count = registration.participants_count ?? registration.members_count ?? registration.num_participants;
    if (count !== undefined && count !== null) return Number(count) || 0;
    if (Array.isArray(registration.members)) return registration.members.length;
    if (Array.isArray(registration.participants)) return registration.participants.length;
    return 0;
  };
  */
  const formatStatusInfo = (status) => {
    const statusMap = {
      CRE: { label: t('registration_status_creation', 'En creacion'), color: 'primary' },
      PEN: { label: t('registration_status_pending', 'Pendiente validar'), color: 'warning' },
      VAL: { label: t('registration_status_validated', 'Validada'), color: 'success' },
      REJ: { label: t('registration_status_rejected', 'Rechazada'), color: 'danger' }
    };
    return statusMap[status] || { label: status || '-', color: 'secondary' };
  };

  const renderRegistrations = () => {
    tableBody.innerHTML = '';
    const registrations = Array.isArray(registrationState.registrations)
      ? registrationState.registrations
      : [];

    if (countEl) {
      countEl.textContent = `${registrations.length}`;
    }

    if (!registrations.length) {
      if (emptyEl) emptyEl.classList.remove('d-none');
      return;
    }

    if (emptyEl) emptyEl.classList.add('d-none');

    const editTitle = t('edit', 'Edit');
    const deleteTitle = t('delete', 'Delete');

    registrations.forEach(registration => {
      const row = document.createElement('tr');
      row.dataset.id = registration.id;

      const nameCell = document.createElement('td');
      const nameWrapper = document.createElement('div');
      nameWrapper.className = 'fw-semibold';
      nameWrapper.textContent = registration.name || '-';
      nameCell.appendChild(nameWrapper);
      row.appendChild(nameCell);

      const choreographerCell = document.createElement('td');
      choreographerCell.textContent = registration.choreographer || '-';
      row.appendChild(choreographerCell);

      const categoryCell = document.createElement('td');
      categoryCell.textContent = registration.category_name || '-';
      row.appendChild(categoryCell);

      const styleCell = document.createElement('td');
      styleCell.textContent = registration.style_name || '-';
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
      participantsCell.textContent = registration.member_count;
      row.appendChild(participantsCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-outline-primary btn-sm btn-edit-registration';
      editBtn.dataset.id = registration.id;
      editBtn.title = editTitle;
      editBtn.setAttribute('aria-label', editTitle);
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm btn-delete-registration';
      deleteBtn.dataset.id = registration.id;
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
  const showRegistrationsError = (message) => {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'text-danger';
    cell.textContent = message;
    row.appendChild(cell);
    tableBody.appendChild(row);
    if (countEl) countEl.textContent = '0';
    if (emptyEl) emptyEl.classList.add('d-none');
  };

  const loadRegistrations = async () => {
    try {
      const params = new URLSearchParams();
      params.set('school_id', user.id);
      const eventIdValue = getEventIdValue();
      if (eventIdValue) {
        params.set('event_id', eventIdValue);
      }

      const url = params.toString()
        ? `${API_BASE_URL}${registrationEndpoints.list}?${params.toString()}`
        : `${API_BASE_URL}${registrationEndpoints.list}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(t('registration_competitions_load_error', 'Error loading registrations.'));
      }
      const data = await res.json();
      registrationState.registrations = Array.isArray(data) ? data : [];
      renderRegistrations();
    } catch (err) {
      showRegistrationsError(err.message || t('registration_competitions_load_error', 'Error loading registrations.'));
    }
  };

  const addMember = () => {
    const category = getSelectedCategory();
    if (!category) {
      showMessageModal(
        t('registration_competitions_category_required_error', 'Selecciona una categoria.'),
        t('error_title', 'Error')
      );
      return;
    }

    const selectedId = participantSelect ? participantSelect.getValue() : (elements.participantSelect?.value || '');
    if (!selectedId) {
      showMessageModal(
        t('registration_competitions_participant_required_error', 'Selecciona un participante.'),
        t('error_title', 'Error')
      );
      return;
    }

    if (selectedMembers.some(member => `${member.id}` === `${selectedId}`)) {
      showMessageModal(
        t('registration_competitions_member_duplicate_error', 'Este participante ya esta anadido.'),
        t('error_title', 'Error')
      );
      return;
    }

    const maxPar = normalizeNumber(category.max_par);
    if (maxPar !== null && selectedMembers.length >= maxPar) {
      const message = formatTemplate(
        t('registration_competitions_member_limit_error', 'El numero de miembros debe estar entre {min} y {max}.'),
        { min: category.min_par ?? '-', max: category.max_par ?? '-' }
      );
      showMessageModal(message, t('error_title', 'Error'));
      return;
    }

    const participant = participantsById.get(`${selectedId}`);
    if (!participant) {
      showMessageModal(
        t('registration_competitions_participant_required_error', 'Selecciona un participante.'),
        t('error_title', 'Error')
      );
      return;
    }

    if (isIndividualCategory(category)) {
      const age = calculateAge(getDateOnlyValue(participant.date_of_birth));
      const minYears = normalizeNumber(category.min_years);
      const maxYears = normalizeNumber(category.max_years);
      if (age === '-' || (minYears !== null && age < minYears) || (maxYears !== null && age > maxYears)) {
        const message = formatTemplate(
          t('registration_competitions_member_age_error', 'La edad debe estar entre {min} y {max} anos.'),
          { min: category.min_years ?? '-', max: category.max_years ?? '-' }
        );
        showMessageModal(message, t('error_title', 'Error'));
        return;
      }
    }

    selectedMembers.push(participant);
    renderMembersTable();
    refreshParticipantSelect();
  };

  const removeMember = (memberId) => {
    selectedMembers = selectedMembers.filter(member => `${member.id}` !== `${memberId}`);
    renderMembersTable();
    refreshParticipantSelect();
  };

  const validateRegistration = () => {
    if (!form) return false;
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return false;
    }

    const category = getSelectedCategory();
    if (!category) {
      showMessageModal(
        t('registration_competitions_category_required_error', 'Selecciona una categoria.'),
        t('error_title', 'Error')
      );
      return false;
    }

    const minPar = normalizeNumber(category.min_par);
    const maxPar = normalizeNumber(category.max_par);
    if (minPar !== null && selectedMembers.length < minPar) {
      const message = formatTemplate(
        t('registration_competitions_member_limit_error', 'El numero de miembros debe estar entre {min} y {max}.'),
        { min: category.min_par ?? '-', max: category.max_par ?? '-' }
      );
      showMessageModal(message, t('error_title', 'Error'));
      return false;
    }
    if (maxPar !== null && selectedMembers.length > maxPar) {
      const message = formatTemplate(
        t('registration_competitions_member_limit_error', 'El numero de miembros debe estar entre {min} y {max}.'),
        { min: category.min_par ?? '-', max: category.max_par ?? '-' }
      );
      showMessageModal(message, t('error_title', 'Error'));
      return false;
    }

    if (isIndividualCategory(category) && selectedMembers.length === 1) {
      const participant = selectedMembers[0];
      const age = calculateAge(getDateOnlyValue(participant.date_of_birth));
      const minYears = normalizeNumber(category.min_years);
      const maxYears = normalizeNumber(category.max_years);
      if (age === '-' || (minYears !== null && age < minYears) || (maxYears !== null && age > maxYears)) {
        const message = formatTemplate(
          t('registration_competitions_member_age_error', 'La edad debe estar entre {min} y {max} anos.'),
          { min: category.min_years ?? '-', max: category.max_years ?? '-' }
        );
        showMessageModal(message, t('error_title', 'Error'));
        return false;
      }
    }

    return true;
  };

  const saveRegistrationMembers = async (registrationId, members, isEdit) => {
    const eventIdValue = getEventIdValue();
    const payload = {
      registration_id: registrationId,
      event_id: eventIdValue,
      members: members.map(member => member.id)
    };

    if (!payload.event_id) delete payload.event_id;

    const url = `${API_BASE_URL}${registrationEndpoints.members(registrationId)}`;
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errData = await safeJson(res);
      const message = errData?.error || t('registration_competitions_save_error', 'Error saving registration.');
      throw new Error(message);
    }
  };

  const saveRegistration = async () => {
    if (!validateRegistration()) {
      return;
    }

    const mode = form ? form.dataset.mode : 'create';
    const isEdit = mode === 'edit';
    const registrationId = elements.id ? elements.id.value : '';

    const payload = {
      id: registrationId || undefined,
      name: elements.choreographyName ? elements.choreographyName.value.trim() : '',
      choreographer: elements.choreographer ? elements.choreographer.value.trim() : '',
      reg_category_id: elements.category ? elements.category.value : '',
      reg_style_id: elements.style ? elements.style.value : '',
      school_id: user.id,
      event_id: getEventIdValue()
    };

    if (!payload.id) delete payload.id;
    if (!payload.event_id) delete payload.event_id;

    const url = isEdit && registrationId
      ? `${API_BASE_URL}${registrationEndpoints.registration}/${registrationId}`
      : `${API_BASE_URL}${registrationEndpoints.registerChoreography}`;
    const method = isEdit ? 'PUT' : 'POST';

    if (elements.saveBtn) {
      elements.saveBtn.disabled = true;
      elements.saveBtn.textContent = t('saving', 'Guardando...');
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await safeJson(res);
      if (!res.ok) {
        const message = data?.error || t('registration_competitions_save_error', 'Error saving registration.');
        throw new Error(message);
      }

      const savedId = registrationId || data?.id || data?.registration_id;
      if (!savedId) {
        throw new Error(t('registration_competitions_save_error', 'Error saving registration.'));
      }

      await saveRegistrationMembers(savedId, selectedMembers, isEdit);
      registrationModal.hide();
    } catch (err) {
      showMessageModal(err.message || t('registration_competitions_save_error', 'Error saving registration.'), t('error_title', 'Error'));
    } finally {
      if (elements.saveBtn) {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = t('save', 'Guardar');
      }
    }
  };
  const deleteRegistration = async () => {
    if (!registrationToDelete) return;

    if (elements.confirmDeleteBtn) {
      elements.confirmDeleteBtn.disabled = true;
    }

    try {
      const eventIdValue = getEventIdValue();
      const payload = {
        id: registrationToDelete.id,
        school_id: user.id,
        event_id: eventIdValue
      };
      if (!payload.event_id) delete payload.event_id;

      const res = await fetch(`${API_BASE_URL}${registrationEndpoints.registration}/${registrationToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await safeJson(res);
        const message = data?.error || t('registration_competitions_delete_error', 'Error deleting registration.');
        throw new Error(message);
      }

      deleteModal.hide();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('registration_competitions_delete_error', 'Error deleting registration.'), t('error_title', 'Error'));
    } finally {
      if (elements.confirmDeleteBtn) {
        elements.confirmDeleteBtn.disabled = false;
      }
      registrationToDelete = null;
    }
  };

  if (elements.category) {
    elements.category.addEventListener('change', () => {
      updateCategoryInfo();
      updateMemberControls();
    });
  }

  if (elements.addMemberBtn) {
    elements.addMemberBtn.addEventListener('click', addMember);
  }

  if (elements.membersTable) {
    elements.membersTable.addEventListener('click', (event) => {
      const removeBtn = event.target.closest('.btn-remove-member');
      if (!removeBtn) return;
      removeMember(removeBtn.dataset.id);
    });
  }

  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', saveRegistration);
  }

  if (createBtn) {
    createBtn.addEventListener('click', () => openRegistrationModal('create'));
  }

  tableBody.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.btn-edit-registration');
    const deleteBtn = event.target.closest('.btn-delete-registration');

    if (editBtn) {
      const id = editBtn.dataset.id;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      openRegistrationModal('edit', registration || null);
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      if (!registration) return;
      registrationToDelete = registration;
      if (elements.deleteMessage) {
        const name = registration.choreography_name || registration.choreography || registration.name || '';
        elements.deleteMessage.innerHTML = `${t('registration_competitions_delete_question', 'Seguro que deseas eliminar la inscripcion de')} <strong>${name}</strong>?`;
      }
      deleteModal.show();
    }
  });

  if (elements.confirmDeleteBtn) {
    elements.confirmDeleteBtn.addEventListener('click', deleteRegistration);
  }

  modalEl.addEventListener('hidden.bs.modal', () => {
    loadRegistrations();
  });

  Promise.resolve()
    .then(loadRegistrationConfig)
    .then(loadRegistrations)
    .catch(() => loadRegistrations());
}

function formatTemplate(template, values) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values || {}, key)) {
      return values[key];
    }
    return match;
  });
}
