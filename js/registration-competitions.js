function initCompetitionsTab() {
  const tableBody = document.getElementById('registrationsTable');
  const countEl = document.getElementById('registrationsCount');
  const emptyEl = document.getElementById('registrationsEmpty');
  const createBtn = document.getElementById('createRegistrationBtn');
  const modalEl = document.getElementById('registrationModal');
  const deleteModalEl = document.getElementById('deleteRegistrationModal');
  const deleteAudioModalEl = document.getElementById('deleteAudioModal');
  const membersModalEl = document.getElementById('registrationMembersModal');
  const confirmModalEl = document.getElementById('confirmRegistrationModal');

  if (!tableBody || !modalEl || !deleteModalEl || !membersModalEl || !confirmModalEl) {
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
    membersSaveBtn: document.getElementById('registrationMembersSaveBtn'),
    membersRuleInfo: document.getElementById('registrationMembersRuleInfo'),
    membersChoreo: document.getElementById('registrationMembersChoreo'),
    membersCategory: document.getElementById('registrationMembersCategory'),
    membersStyle: document.getElementById('registrationMembersStyle'),
    saveBtn: document.getElementById('registrationSaveBtn'),
    membersForm: document.getElementById('registrationMembersForm'),
    membersId: document.getElementById('registrationMembersId'),
    modalTitle: document.getElementById('registrationModalTitle'),
    deleteMessage: document.getElementById('deleteRegistrationMessage'),
    confirmDeleteBtn: document.getElementById('confirmDeleteRegistrationBtn'),
    confirmMessage: document.getElementById('confirmRegistrationMessage'),
    confirmRegistrationBtn: document.getElementById('confirmRegistrationBtn'),
    audioDeleteModal: deleteAudioModalEl,
    audioDeleteConfirmBtn: document.getElementById('confirmDeleteAudioBtn'),
    audioSection: document.getElementById('registrationAudioSection'),
    audioUploadControls: document.getElementById('registrationAudioUploadControls'),
    audioDropzone: document.getElementById('registrationAudioDropzone'),
    audioInput: document.getElementById('registrationAudioInput'),
    audioBrowseBtn: document.getElementById('registrationAudioBrowseBtn'),
    audioName: document.getElementById('registrationAudioName'),
    audioDuration: document.getElementById('registrationAudioDuration'),
    audioSize: document.getElementById('registrationAudioSize'),
    audioMax: document.getElementById('registrationAudioMax'),
    audioError: document.getElementById('registrationAudioError'),
    audioRemoveBtn: document.getElementById('registrationAudioRemoveBtn'),
    audioSaveBtn: document.getElementById('registrationAudioSaveBtn')
  };

  const registrationModal = new bootstrap.Modal(modalEl);
  const deleteModal = new bootstrap.Modal(deleteModalEl);
  const audioDeleteModal = deleteAudioModalEl ? new bootstrap.Modal(deleteAudioModalEl) : null;
  const registrationMembersModal = new bootstrap.Modal(membersModalEl);
  const confirmModal = new bootstrap.Modal(confirmModalEl);

  const registrationEndpoints = {
    list: '/api/registrations/choreographies',
    registerChoreography: '/api/registrations/choreographies',
    registration: '/api/registrations/choreographies',
    members: (id) => `/api/registrations/choreographies/${id}/members`,
    detail: (id) => `/api/registrations/${id}`,
    confirm: (id) => `/api/registrations/choreographies/${id}/confirm`,
    desconfirm: (id) => `/api/registrations/choreographies/${id}/desconfirm`,
    music: (id) => `/api/registrations/choreographies/${id}/music`
  };

  let participantSelect = null;
  let participantsById = new Map();
  let categoryById = new Map();
  let styleById = new Map();
  let selectedMembers = [];
  let registrationToDelete = null;
  let registrationToConfirm = null;
  let confirmAction = 'confirm';
  let membersRegistration = null;
  let membersCategoryId = null;
  let audioState = {
    file: null,
    duration: null,
    maxDuration: null,
    existingName: '',
    existingDuration: null,
    existingSize: null,
    hasRemote: false,
    isValid: true
  };
  const saveBtnLabel = elements.saveBtn ? elements.saveBtn.textContent : '';
  const membersSaveBtnLabel = elements.membersSaveBtn ? elements.membersSaveBtn.textContent : '';

  const getEventIdValue = () => {
    const eventObj = getEvent();
    return eventObj.id;
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

  const getMembersCategory = () => {
    if (!membersCategoryId) return null;
    return categoryById.get(`${membersCategoryId}`) || null;
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
      updateAudioMaxDuration();
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
    updateAudioMaxDuration();
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

  const setAudioSectionVisible = (visible) => {
    if (!elements.audioSection) return;
    elements.audioSection.classList.toggle('d-none', !visible);
  };

  const setAudioUploadControlsVisible = (visible) => {
    if (!elements.audioUploadControls) return;
    elements.audioUploadControls.classList.toggle('d-none', !visible);
  };

  const setAudioRemoveVisible = (visible) => {
    if (!elements.audioRemoveBtn) return;
    elements.audioRemoveBtn.classList.toggle('d-none', !visible);
  };

  const setAudioError = (message) => {
    if (!elements.audioError) return;
    if (message) {
      elements.audioError.textContent = message;
      elements.audioError.classList.remove('d-none');
    } else {
      elements.audioError.textContent = '';
      elements.audioError.classList.add('d-none');
    }
  };

  const validateAudioDuration = () => {
    if (!audioState.file) {
      audioState.isValid = true;
      setAudioError('');
      if (elements.audioSaveBtn) elements.audioSaveBtn.disabled = true;
      return true;
    }

    if (audioState.duration == null) {
      audioState.isValid = false;
      setAudioError('No se pudo leer la duracion del audio.');
      if (elements.audioSaveBtn) elements.audioSaveBtn.disabled = true;
      return false;
    }

    const maxDuration = audioState.maxDuration;
    if (maxDuration != null && audioState.duration > maxDuration) {
      audioState.isValid = false;
      setAudioError(`La duracion supera el maximo permitido (${formatDuration(maxDuration)}).`);
      if (elements.audioSaveBtn) elements.audioSaveBtn.disabled = true;
      return false;
    }

    audioState.isValid = true;
    setAudioError('');
    if (elements.audioSaveBtn) elements.audioSaveBtn.disabled = false;
    return true;
  };

  const updateAudioMaxDuration = () => {
    const category = getSelectedCategory();
    const maxDuration = normalizeNumber(category?.music_max_duration);
    audioState.maxDuration = maxDuration;
    if (elements.audioMax) {
      elements.audioMax.textContent = maxDuration == null ? '-' : `${formatDuration(maxDuration)} (+10 sec extra)`;
    }
    validateAudioDuration();
  };

  const updateAudioUi = () => {
    setAudioUploadControlsVisible(!audioState.hasRemote);
    setAudioRemoveVisible(audioState.hasRemote);

    const name = audioState.file
      ? audioState.file.name
      : (audioState.existingName || '-');
    if (elements.audioName) {
      elements.audioName.textContent = name;
    }

    const durationValue = audioState.file ? audioState.duration : audioState.existingDuration;
    if (elements.audioDuration) {
      elements.audioDuration.textContent = durationValue != null ? formatDuration(durationValue) : '-';
    }

    const sizeValue = audioState.file ? audioState.file.size : audioState.existingSize;
    if (elements.audioSize) {
      elements.audioSize.textContent = sizeValue != null ? formatBytes(sizeValue) : '-';
    }

    if (elements.audioRemoveBtn) {
      elements.audioRemoveBtn.disabled = !audioState.hasRemote && !audioState.file;
    }

    validateAudioDuration();
  };

  const resetAudioState = () => {
    audioState = {
      file: null,
      duration: null,
      maxDuration: audioState.maxDuration,
      existingName: '',
      existingDuration: null,
      existingSize: null,
      hasRemote: false,
      isValid: true
    };
    if (elements.audioInput) elements.audioInput.value = '';
    setAudioError('');
    updateAudioUi();
  };

  const setRemoteAudioInfo = (info) => {
    audioState.existingName = info?.original_name || '';
    audioState.existingDuration = normalizeNumber(info?.duration);
    audioState.existingSize = normalizeNumber(info?.size);
    audioState.hasRemote = Boolean(audioState.existingName);
    updateAudioUi();
  };

  const getMusicUrl = (registrationId) => {
    const eventIdValue = getEventIdValue();
    return eventIdValue
      ? `${API_BASE_URL}${registrationEndpoints.music(registrationId)}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${registrationEndpoints.music(registrationId)}`;
  };

  const fetchRegistrationAudioInfo = async (registrationId) => {
    if (!registrationId) return;
    resetAudioState();
    try {
      const url = getMusicUrl(registrationId);
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          return;
        }
        const data = await safeJson(res);
        const message = data?.error || 'Error al cargar el audio.';
        throw new Error(message);
      }
      const data = await safeJson(res);
      if (!data || !data.original_name) {
        return;
      }
      setRemoteAudioInfo(data);
    } catch (err) {
      showMessageModal(err.message || 'Error al cargar el audio.', t('error_title', 'Error'));
    }
  };

  const readAudioDuration = (file) => new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(duration) ? duration : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
  });

  const handleAudioFile = async (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('audio/')) {
      setAudioError('Selecciona un archivo de audio valido.');
      return;
    }
    audioState.file = file;
    audioState.duration = await readAudioDuration(file);
    updateAudioUi();
  };

  const clearSelectedAudio = () => {
    audioState.file = null;
    audioState.duration = null;
    if (elements.audioInput) elements.audioInput.value = '';
    updateAudioUi();
  };

  const saveRegistrationAudio = async () => {
    const registrationId = elements.id ? elements.id.value : '';
    if (!registrationId) return;
    if (!audioState.file) {
      showMessageModal('Selecciona un archivo de audio.', t('error_title', 'Error'));
      return;
    }
    if (!validateAudioDuration()) {
      return;
    }

    if (elements.audioSaveBtn) {
      elements.audioSaveBtn.disabled = true;
      elements.audioSaveBtn.textContent = t('saving', 'Guardando...');
    }

    try {
      const url = getMusicUrl(registrationId);
      const formData = new FormData();
      formData.append('audio', audioState.file);
      if (audioState.duration != null) {
        formData.append('duration', `${Math.round(audioState.duration)}`);
      }

      const res = await fetch(url, {
        method: 'POST',
        body: formData
      });

      const data = await safeJson(res);
      if (!res.ok) {
        const message = data?.error || 'Error al guardar el audio.';
        throw new Error(message);
      }

      audioState.existingName = audioState.file.name;
      audioState.existingDuration = audioState.duration;
      audioState.existingSize = audioState.file.size;
      audioState.hasRemote = true;
      clearSelectedAudio();
    } catch (err) {
      showMessageModal(err.message || 'Error al guardar el audio.', t('error_title', 'Error'));
    } finally {
      if (elements.audioSaveBtn) {
        elements.audioSaveBtn.disabled = !(audioState.file && audioState.isValid);
        elements.audioSaveBtn.textContent = 'Guardar audio';
      }
    }
  };

  const deleteRegistrationAudio = async () => {
    const registrationId = elements.id ? elements.id.value : '';
    if (!registrationId || !audioState.existingName) return;

    const confirmDelete = await showAudioDeleteConfirm();
    if (!confirmDelete) {
      return;
    }

    if (elements.audioRemoveBtn) {
      elements.audioRemoveBtn.disabled = true;
    }

    try {
      const url = getMusicUrl(registrationId);
      const res = await fetch(url, { method: 'DELETE' });
      const data = await safeJson(res);
      if (!res.ok) {
        const message = data?.error || 'Error al eliminar el audio.';
        throw new Error(message);
      }
      audioState.existingName = '';
      audioState.existingDuration = null;
      audioState.existingSize = null;
      audioState.hasRemote = false;
      updateAudioUi();
    } catch (err) {
      showMessageModal(err.message || 'Error al eliminar el audio.', t('error_title', 'Error'));
    } finally {
      if (elements.audioRemoveBtn) {
        elements.audioRemoveBtn.disabled = !(audioState.file || audioState.existingName);
      }
    }
  };

  const updateMemberControls = () => {
    if (!elements.addMemberBtn) return;
    const category = getMembersCategory();
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
      updateMemberControls();
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

      const genderCell = document.createElement('td');
      genderCell.textContent = member.gender;
      row.appendChild(genderCell);

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

  const ensureRegistrationCategories = async () => {
    if (registrationState.registrationCategories.length) {
      return registrationState.registrationCategories;
    }

    const params = new URLSearchParams();
    const eventIdValue = getEventIdValue();
    if (eventIdValue) {
      params.set('event_id', eventIdValue);
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
    registrationState.registrationConfig.categories = categories;
    return categories;
  };

  const ensureRegistrationStyles = async () => {
    if (registrationState.registrationDisciplines.length) {
      return registrationState.registrationDisciplines;
    }

    const params = new URLSearchParams();
    const eventIdValue = getEventIdValue();
    if (eventIdValue) {
      params.set('event_id', eventIdValue);
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
    registrationState.registrationConfig.styles = styles;
    return styles;
  };

  const loadRegistrationConfig = async () => {
    const categories = await ensureRegistrationCategories();
    const styles = await ensureRegistrationStyles();
    const orderedStyles = [...styles].sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

    registrationState.registrationConfig = { categories, styles: orderedStyles };
    categoryById = new Map(categories.map(item => [`${item.id}`, item]));
    styleById = new Map(orderedStyles.map(item => [`${item.id}`, item]));

    const selectedCategory = elements.category?.value || '';
    const selectedStyle = elements.style?.value || '';

    populateSelect(elements.category, categories);
    populateSelect(elements.style, orderedStyles);

    if (elements.category && selectedCategory) elements.category.value = selectedCategory;
    if (elements.style && selectedStyle) elements.style.value = selectedStyle;
  };
  const normalizeMembers = (members) => {
    if (!Array.isArray(members)) return [];
    return members.map(member => {
      if (member && typeof member === 'object') {
        const memberId = member.id;
        const fallback = memberId ? participantsById.get(`${memberId}`) : null;
        return {
          ...fallback,
          ...member,
          id: memberId,
          name: member.name,
          date_of_birth: member.date_of_birth
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

  const showAudioDeleteConfirm = () => new Promise((resolve) => {
    if (!audioDeleteModal || !elements.audioDeleteConfirmBtn || !elements.audioDeleteModal) {
      resolve(window.confirm('Seguro que deseas eliminar la musica?'));
      return;
    }

    let resolved = false;
    const handleHidden = () => {
      if (!resolved) resolve(false);
    };

    elements.audioDeleteModal.addEventListener('hidden.bs.modal', handleHidden, { once: true });
    elements.audioDeleteConfirmBtn.onclick = () => {
      resolved = true;
      audioDeleteModal.hide();
      resolve(true);
    };

    audioDeleteModal.show();
  });

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

  const resetChoreoForm = () => {
    if (form) form.classList.remove('was-validated');
    if (elements.id) elements.id.value = '';
    if (elements.choreographyName) elements.choreographyName.value = '';
    if (elements.choreographer) elements.choreographer.value = '';
    if (elements.category) elements.category.value = '';
    if (elements.style) elements.style.value = '';
    updateCategoryInfo();
  };

  const resetMembersState = () => {
    if (elements.membersForm) elements.membersForm.classList.remove('was-validated');
    if (elements.membersId) elements.membersId.value = '';
    selectedMembers = [];
    membersRegistration = null;
    membersCategoryId = null;
    if (elements.membersRuleInfo) elements.membersRuleInfo.textContent = '';
    if (elements.membersChoreo) elements.membersChoreo.textContent = '-';
    if (elements.membersCategory) elements.membersCategory.textContent = '-';
    if (elements.membersStyle) elements.membersStyle.textContent = '-';
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
      elements.saveBtn.textContent = saveBtnLabel;
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
      resetChoreoForm();
      setAudioSectionVisible(false);
      resetAudioState();
      registrationModal.show();
      return;
    }

    if (!registration) {
      resetChoreoForm();
      setAudioSectionVisible(false);
      resetAudioState();
      registrationModal.show();
      return;
    }

    elements.id.value = registration.id || '';
    elements.choreographyName.value = registration.name || '';
    elements.choreographer.value = registration.choreographer || '';
    elements.category.value = registration.reg_category_id;
    elements.style.value = registration.reg_style_id;

    updateCategoryInfo();
    setAudioSectionVisible(true);
    resetAudioState();
    await fetchRegistrationAudioInfo(registration.id);
    registrationModal.show();
  };

  const openMembersModal = async (registration) => {
    if (!registration) return;

    try {
      await loadRegistrationConfig();
      await ensureParticipantsLoaded();
      refreshParticipantSelect();
    } catch (err) {
      showMessageModal(err.message || t('registration_competitions_load_error', 'Error loading registrations.'), t('error_title', 'Error'));
      return;
    }

    resetMembersState();
    membersRegistration = registration;
    const rawCategoryId = registration.reg_category_id
      || registration.category_id
      || registration.reg_category?.id
      || registration.reg_category;
    membersCategoryId = rawCategoryId ? `${rawCategoryId}` : null;
    if (elements.membersId) {
      elements.membersId.value = registration.id || '';
    }

    updateMembersRuleInfo();
    updateMembersChoreoInfo(registration);
    selectedMembers = await resolveRegistrationMembers(registration);
    renderMembersTable();
    refreshParticipantSelect();
    registrationMembersModal.show();
  };

  const updateMembersChoreoInfo = (registration) => {
    if (!registration) return;
    if (elements.membersChoreo) {
      elements.membersChoreo.textContent = registration.name || registration.choreography || '-';
    }
    const category = getMembersCategory();
    if (elements.membersCategory) {
      elements.membersCategory.textContent = category?.name || registration.category_name || '-';
    }
    const styleName = styleById.get(`${registration.reg_style_id}`)?.name || registration.style_name || registration.style;
    if (elements.membersStyle) {
      elements.membersStyle.textContent = styleName || '-';
    }
  };
  const updateMembersRuleInfo = () => {
    if (!elements.membersRuleInfo) return;
    const category = getMembersCategory();
    if (!category) {
      elements.membersRuleInfo.textContent = '';
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

    elements.membersRuleInfo.textContent = info;
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
    const confirmTitle = t('registration_competitions_confirm', 'Confirmar');
    const cancelConfirmTitle = t('registration_competitions_cancel_confirm', 'Cancelar confirmacion');

    registrations.forEach(registration => {
      const row = document.createElement('tr');
      row.dataset.id = registration.id;
      const isPending = `${registration.status}` === 'PEN';

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

      const musicCell = document.createElement('td');
      musicCell.className = 'text-center';
      musicCell.textContent = Number(registration.has_music) === 1
        ? t('registration_competitions_music_yes', 'Sí')
        : t('registration_competitions_music_no', 'No');
      row.appendChild(musicCell);

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
      editBtn.disabled = isPending;
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

      const membersBtn = document.createElement('button');
      membersBtn.type = 'button';
      membersBtn.className = 'btn btn-outline-secondary btn-sm btn-members-registration';
      membersBtn.dataset.id = registration.id;
      membersBtn.title = t('registration_competitions_members_title', 'Gestion de miembros');
      membersBtn.setAttribute('aria-label', membersBtn.title);
      membersBtn.disabled = isPending;
      membersBtn.innerHTML = '<i class="bi bi-people"></i>';

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = isPending
        ? 'btn btn-outline-warning btn-sm btn-confirm-registration'
        : 'btn btn-outline-success btn-sm btn-confirm-registration';
      confirmBtn.dataset.id = registration.id;
      confirmBtn.title = isPending ? cancelConfirmTitle : confirmTitle;
      confirmBtn.setAttribute('aria-label', confirmBtn.title);
      confirmBtn.dataset.action = isPending ? 'cancel' : 'confirm';
      confirmBtn.innerHTML = isPending
        ? '<i class="bi bi-x-circle"></i>'
        : '<i class="bi bi-check-circle"></i>';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm btn-delete-registration';
      deleteBtn.dataset.id = registration.id;
      deleteBtn.title = deleteTitle;
      deleteBtn.setAttribute('aria-label', deleteTitle);
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';

      actionGroup.appendChild(editBtn);
      actionGroup.appendChild(membersBtn);
      actionGroup.appendChild(confirmBtn);
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
    cell.colSpan = 8;
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
    const category = getMembersCategory();
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

    return true;
  };

  const validateMembersSelection = () => {
    const category = getMembersCategory();
    if (!category) {
      showMessageModal(
        t('registration_competitions_category_required_error', 'Selecciona una categoria.'),
        t('error_title', 'Error')
      );
      return false;
    }

    const maxPar = normalizeNumber(category.max_par);
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

  const updateRegistrationStatus = (registrationId, status) => {
    const registration = registrationState.registrations.find(item => `${item.id}` === `${registrationId}`);
    if (!registration) return;
    registration.status = status;
    renderRegistrations();
  };

  const confirmRegistration = async (registrationId) => {
    const url = `${API_BASE_URL}${registrationEndpoints.confirm(registrationId)}`;
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const data = await safeJson(res);
        const message = data?.error || t('registration_competitions_confirm_error', 'Error al confirmar la inscripcion.');
        throw new Error(message);
      }
      updateRegistrationStatus(registrationId, 'PEN');
      return true;
    } catch (err) {
      confirmModal.hide();
      showMessageModal(err.message || t('registration_competitions_confirm_error', 'Error al confirmar la inscripcion.'), t('error_title', 'Error'));
      return false;
    }
  };

  const cancelConfirmation = async (registrationId) => {
    const url = `${API_BASE_URL}${registrationEndpoints.desconfirm(registrationId)}`;
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const data = await safeJson(res);
        const message = data?.error || t('registration_competitions_cancel_confirm_error', 'Error al cancelar la confirmacion.');
        throw new Error(message);
      }
      updateRegistrationStatus(registrationId, 'CRE');
      return true;
    } catch (err) {
      confirmModal.hide();
      showMessageModal(err.message || t('registration_competitions_cancel_confirm_error', 'Error al cancelar la confirmacion.'), t('error_title', 'Error'));
      return false;
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

      registrationModal.hide();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('registration_competitions_save_error', 'Error saving registration.'), t('error_title', 'Error'));
    } finally {
      if (elements.saveBtn) {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = saveBtnLabel;
      }
    }
  };

  const saveMembers = async () => {
    if (!validateMembersSelection()) {
      return;
    }

    const registrationId = elements.membersId ? elements.membersId.value : '';
    if (!registrationId) {
      return;
    }

    if (elements.membersSaveBtn) {
      elements.membersSaveBtn.disabled = true;
      elements.membersSaveBtn.textContent = t('saving', 'Guardando...');
    }

    try {
      await saveRegistrationMembers(registrationId, selectedMembers, true);
      registrationMembersModal.hide();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('registration_competitions_save_error', 'Error saving registration.'), t('error_title', 'Error'));
    } finally {
      if (elements.membersSaveBtn) {
        elements.membersSaveBtn.disabled = false;
        elements.membersSaveBtn.textContent = membersSaveBtnLabel;
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

  if (elements.membersSaveBtn) {
    elements.membersSaveBtn.addEventListener('click', saveMembers);
  }

  if (elements.audioBrowseBtn && elements.audioInput) {
    elements.audioBrowseBtn.addEventListener('click', () => {
      elements.audioInput.click();
    });
  }

  if (elements.audioInput) {
    elements.audioInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      handleAudioFile(file);
    });
  }

  if (elements.audioDropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      elements.audioDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        elements.audioDropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      elements.audioDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        elements.audioDropzone.classList.remove('is-dragover');
      });
    });
    elements.audioDropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files && event.dataTransfer.files[0];
      handleAudioFile(file);
    });
  }

  if (elements.audioRemoveBtn) {
    elements.audioRemoveBtn.addEventListener('click', () => {
      if (audioState.file) {
        clearSelectedAudio();
        return;
      }
      deleteRegistrationAudio();
    });
  }

  if (elements.audioSaveBtn) {
    elements.audioSaveBtn.addEventListener('click', saveRegistrationAudio);
  }

  if (createBtn) {
    createBtn.addEventListener('click', () => openRegistrationModal('create'));
  }

  tableBody.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.btn-edit-registration');
    const membersBtn = event.target.closest('.btn-members-registration');
    const confirmBtn = event.target.closest('.btn-confirm-registration');
    const deleteBtn = event.target.closest('.btn-delete-registration');

    if (editBtn) {
      const id = editBtn.dataset.id;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      openRegistrationModal('edit', registration || null);
      return;
    }

    if (membersBtn) {
      const id = membersBtn.dataset.id;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      openMembersModal(registration || null);
      return;
    }

    if (confirmBtn) {
      const id = confirmBtn.dataset.id;
      if (!id) return;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      if (!registration) return;
      registrationToConfirm = registration;
      confirmAction = confirmBtn.dataset.action === 'cancel' ? 'cancel' : 'confirm';
      if (elements.confirmMessage) {
        if (confirmAction === 'cancel') {
          const question = t('registration_competitions_cancel_confirm_question', 'Seguro que deseas cancelar la confirmacion de');
          const name = registration.choreography_name || registration.choreography || registration.name || '';
          elements.confirmMessage.innerHTML = `${question} <strong>${name}</strong>?`;
        } else {
          const question = t('registration_competitions_confirm_question', 'Seguro que deseas confirmar la inscripcion de');
          const name = registration.choreography_name || registration.choreography || registration.name || '';
          elements.confirmMessage.innerHTML = `${question} <strong>${name}</strong>?`;
        }
      }
      if (elements.confirmRegistrationBtn) {
        elements.confirmRegistrationBtn.textContent = confirmAction === 'cancel'
          ? t('registration_competitions_cancel_confirm', 'Cancelar confirmacion')
          : t('registration_competitions_confirm', 'Confirmar');
      }
      confirmModal.show();
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      if (!registration) return;
      registrationToDelete = registration;
      if (elements.deleteMessage) {
        const name = registration.name;
        elements.deleteMessage.innerHTML = `${t('registration_competitions_delete_question', 'Seguro que deseas eliminar la inscripcion de')} <strong>${name}</strong>?`;
      }
      deleteModal.show();
    }
  });

  if (elements.confirmDeleteBtn) {
    elements.confirmDeleteBtn.addEventListener('click', deleteRegistration);
  }

  if (elements.confirmRegistrationBtn) {
    elements.confirmRegistrationBtn.addEventListener('click', async () => {
      if (!registrationToConfirm) return;
      elements.confirmRegistrationBtn.disabled = true;
      const originalText = elements.confirmRegistrationBtn.textContent;
      elements.confirmRegistrationBtn.textContent = t('saving', 'Guardando...');
      const registrationId = registrationToConfirm.id;
      const success = confirmAction === 'cancel'
        ? await cancelConfirmation(registrationId)
        : await confirmRegistration(registrationId);
      elements.confirmRegistrationBtn.disabled = false;
      elements.confirmRegistrationBtn.textContent = originalText;
      if (success) {
        confirmModal.hide();
      }
      registrationToConfirm = null;
    });
  }

  modalEl.addEventListener('hidden.bs.modal', () => {
    resetAudioState();
    setAudioSectionVisible(false);
    loadRegistrations();
  });

  membersModalEl.addEventListener('hidden.bs.modal', () => {
    resetMembersState();
  });

  const handleConfigUpdate = () => {
    loadRegistrationConfig()
      .then(renderRegistrations)
      .catch(() => {});
  };
  window.addEventListener('registration:config-updated', handleConfigUpdate);

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
