function initCompetitionsTab() {
  const tableBody = document.getElementById('registrationsTable');
  const countEl = document.getElementById('registrationsCount');
  const emptyEl = document.getElementById('registrationsEmpty');
  const createBtn = document.getElementById('createRegistrationBtn');
  const copyTsvBtn = document.getElementById('competitionsCopyTsvBtn');
  const modalEl = document.getElementById('registrationModal');
  const audioModalEl = document.getElementById('registrationAudioModal');
  const paymentModalEl = document.getElementById('registrationPaymentModal');
  const deleteModalEl = document.getElementById('deleteRegistrationModal');
  const deleteAudioModalEl = document.getElementById('deleteAudioModal');
  const membersModalEl = document.getElementById('registrationMembersModal');
  const confirmModalEl = document.getElementById('confirmRegistrationModal');

  if (!tableBody || !modalEl || !audioModalEl || !paymentModalEl || !deleteModalEl || !membersModalEl || !confirmModalEl) {
    return;
  }

  const user = getUserFromToken();
  if (!user || !user.id) {
    showMessageModal(t('registration_school_no_user', 'No user found.'), t('error_title', 'Error'));
    return;
  }
  const isSchoolUser = `${user?.role || ''}`.toLowerCase() === 'school';

  const form = document.getElementById('registrationForm');
  const elements = {
    id: document.getElementById('registrationId'),
    choreographyName: document.getElementById('choreographyName'),
    participantsCountAddon: document.getElementById('registrationParticipantsCountAddon'),
    choreographer: document.getElementById('choreographerName'),
    category: document.getElementById('registrationCategory'),
    style: document.getElementById('registrationStyle'),
    observations: document.getElementById('registrationObservations'),
    categoryInfo: document.getElementById('categoryRuleInfo'),
    statusWrapper: document.getElementById('registrationStatusWrapper'),
    statusBadge: document.getElementById('registrationStatusBadge'),
    totalAmountWrapper: document.getElementById('registrationTotalAmountWrapper'),
    totalAmountValue: document.getElementById('registrationTotalAmountValue'),
    rejectWrapper: document.getElementById('registrationRejectReasonWrapper'),
    rejectReason: document.getElementById('registrationRejectReason'),
    participantSelect: document.getElementById('registrationParticipantSelect'),
    addMemberBtn: document.getElementById('addRegistrationMemberBtn'),
    membersTable: document.getElementById('registrationMembersTable'),
    membersCount: document.getElementById('registrationMembersCount'),
    membersOutOfRangeInfo: document.getElementById('registrationMembersOutOfRangeInfo'),
    membersEmpty: document.getElementById('registrationMembersEmpty'),
    membersSaveBtn: document.getElementById('registrationMembersSaveBtn'),
    membersRuleInfo: document.getElementById('registrationMembersRuleInfo'),
    membersChoreo: document.getElementById('registrationMembersChoreo'),
    membersCategory: document.getElementById('registrationMembersCategory'),
    membersStyle: document.getElementById('registrationMembersStyle'),
    membersAgeInfoBtn: document.getElementById('registrationMembersAgeInfoBtn'),
    membersGenderHeader: document.querySelector('#registrationMembersModal th[data-i18n="registration_competitions_member_gender"]'),
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
    paymentSection: document.getElementById('registrationPaymentSection')
  };

  const registrationModal = new bootstrap.Modal(modalEl);
  const registrationAudioModal = new bootstrap.Modal(audioModalEl);
  const registrationPaymentModal = new bootstrap.Modal(paymentModalEl);
  const deleteModal = new bootstrap.Modal(deleteModalEl);
  const audioDeleteModal = deleteAudioModalEl ? new bootstrap.Modal(deleteAudioModalEl) : null;
  const registrationMembersModal = new bootstrap.Modal(membersModalEl);
  const confirmModal = new bootstrap.Modal(confirmModalEl);
  const audioElements = {
    modal: audioModalEl,
    choreo: document.getElementById('registrationAudioModalChoreo'),
    category: document.getElementById('registrationAudioModalCategory'),
    style: document.getElementById('registrationAudioModalStyle'),
    statusBadge: document.getElementById('registrationAudioModalStatusBadge'),
    uploadControls: document.getElementById('registrationAudioModalUploadControls'),
    dropzone: document.getElementById('registrationAudioModalDropzone'),
    input: document.getElementById('registrationAudioModalInput'),
    browseBtn: document.getElementById('registrationAudioModalBrowseBtn'),
    name: document.getElementById('registrationAudioModalName'),
    duration: document.getElementById('registrationAudioModalDuration'),
    size: document.getElementById('registrationAudioModalSize'),
    max: document.getElementById('registrationAudioModalMax'),
    error: document.getElementById('registrationAudioModalError'),
    removeBtn: document.getElementById('registrationAudioModalRemoveBtn'),
    saveBtn: document.getElementById('registrationAudioModalSaveBtn')
  };
  const paymentElements = {
    modal: paymentModalEl,
    choreo: document.getElementById('registrationPaymentModalChoreo'),
    category: document.getElementById('registrationPaymentModalCategory'),
    style: document.getElementById('registrationPaymentModalStyle'),
    dropzone: document.getElementById('registrationPaymentModalDropzone'),
    input: document.getElementById('registrationPaymentModalInput'),
    browseBtn: document.getElementById('registrationPaymentModalBrowseBtn'),
    statusBadge: document.getElementById('registrationPaymentModalStatusBadge'),
    totalAmount: document.getElementById('registrationPaymentModalTotalAmount'),
    name: document.getElementById('registrationPaymentModalName'),
    size: document.getElementById('registrationPaymentModalSize'),
    viewBtn: document.getElementById('registrationPaymentModalViewBtn'),
    downloadBtn: document.getElementById('registrationPaymentModalDownloadBtn'),
    removeBtn: document.getElementById('registrationPaymentModalRemoveBtn'),
    saveBtn: document.getElementById('registrationPaymentModalSaveBtn')
  };

  const registrationEndpoints = {
    list: '/api/registrations/choreographies',
    registerChoreography: '/api/registrations/choreographies',
    registration: '/api/registrations/choreographies',
    members: (id) => `/api/registrations/choreographies/${id}/members`,
    detail: (id) => `/api/registrations/${id}`,
    confirm: (id) => `/api/registrations/choreographies/${id}/confirm`,
    desconfirm: (id) => `/api/registrations/choreographies/${id}/desconfirm`,
    music: (id) => `/api/registrations/choreographies/${id}/music`,
    payment: (id) => `/api/registrations/choreographies/${id}/payment`,
    paymentView: (id) => `/api/registrations/choreographies/${id}/payment/view`,
    paymentDownload: (id) => `/api/registrations/choreographies/${id}/payment/download`
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
  let audioRegistration = null;
  let paymentRegistration = null;
  let registrationsTooltipInstances = [];
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
  let paymentState = {
    file: null,
    existingName: '',
    existingSize: null,
    existingStatus: '',
    hasRemote: false
  };
  const saveBtnLabel = elements.saveBtn ? elements.saveBtn.textContent : '';
  const membersSaveBtnLabel = elements.membersSaveBtn ? elements.membersSaveBtn.textContent : '';
  const audioSaveBtnLabel = audioElements.saveBtn ? audioElements.saveBtn.textContent : '';
  const paymentSaveBtnLabel = paymentElements.saveBtn ? paymentElements.saveBtn.textContent : '';

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

  const getLanguage = () => getCurrentAppLanguage?.() || document.documentElement.getAttribute('lang') || 'es';

  const formatCurrencyDisplay = (value) => {
    const cents = normalizeNumber(value);
    const amount = (cents ?? 0) / 100;
    return new Intl.NumberFormat(getLanguage(), {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getCategoryRegistrationPrice = (category) => normalizeNumber(category?.registration_price) ?? 0;

  const getSelectedCategory = () => {
    const categoryId = elements.category ? elements.category.value : '';
    if (!categoryId) return null;
    return categoryById.get(`${categoryId}`) || null;
  };

  const getRegistrationCategoryId = (registration) => registration?.reg_category_id
    ?? registration?.category_id
    ?? registration?.reg_category?.id
    ?? registration?.reg_category
    ?? '';

  const getRegistrationStyleId = (registration) => registration?.reg_style_id
    ?? registration?.style_id
    ?? registration?.reg_style?.id
    ?? registration?.reg_style
    ?? '';

  const getMembersCategory = () => {
    if (!membersCategoryId) return null;
    return categoryById.get(`${membersCategoryId}`) || null;
  };

  const getRegistrationParticipantsCount = (registration) => {
    if (!registration) return 0;
    const directCount = registration.member_count
      ?? registration.members_count
      ?? registration.participants_count
      ?? registration.num_participants;
    if (directCount !== undefined && directCount !== null) {
      return Number(directCount) || 0;
    }
    if (Array.isArray(registration.members)) return registration.members.length;
    if (Array.isArray(registration.participants)) return registration.participants.length;
    return 0;
  };

  const formatParticipantsCountLabel = (registration) => {
    const count = getRegistrationParticipantsCount(registration);
    const suffix = count === 1
      ? t('registration_competitions_member_single', 'miembro')
      : t('registration_competitions_member_plural', 'miembros');
    return `${count} ${suffix}`;
  };

  const getRegistrationTotalAmount = (registration) => {
    const category = categoryById.get(`${getRegistrationCategoryId(registration)}`) || null;
    const categoryPrice = normalizeNumber(
      category?.registration_price
      ?? registration?.reg_category?.registration_price
      ?? registration?.category?.registration_price
      ?? registration?.registration_price
    );
    if (categoryPrice !== null) {
      return categoryPrice * getRegistrationParticipantsCount(registration);
    }

    const directAmount = normalizeNumber(
      registration?.total_amount
      ?? registration?.totalAmount
      ?? registration?.amount_total
    );
    return directAmount ?? 0;
  };

  const isIndividualCategory = (category) => {
    if (!category) return false;
    const minPar = normalizeNumber(category.min_par);
    const maxPar = normalizeNumber(category.max_par);
    return minPar === 1 && maxPar === 1;
  };

  const categoryHasAgeRange = (category) => {
    if (!category) return false;
    const minYears = normalizeNumber(category.min_years);
    const maxYears = normalizeNumber(category.max_years);
    return minYears !== null || maxYears !== null;
  };

  const getCategoryMaxOutOfRange = (category) => normalizeNumber(category?.max_outofrange) ?? 0;

  const updateMembersAgeHeaderTooltip = () => {
    syncRegistrationAgeTooltipButton(elements.membersAgeInfoBtn);
  };

  const syncMembersGenderUi = () => {
    if (elements.membersGenderHeader) {
      elements.membersGenderHeader.classList.toggle('d-none', !Boolean(getEvent()?.showGender));
    }
  };

  const getMemberAgeValue = (member) => calculateAge(
    getDateOnlyValue(member?.date_of_birth),
    getRegistrationAgeReferenceDate()
  );

  const isMemberOutOfAgeRange = (member, category = getMembersCategory()) => {
    if (!member || !categoryHasAgeRange(category)) return false;

    const age = getMemberAgeValue(member);
    const minYears = normalizeNumber(category?.min_years);
    const maxYears = normalizeNumber(category?.max_years);
    if (age === '-') {
      return true;
    }

    return (minYears !== null && age < minYears) || (maxYears !== null && age > maxYears);
  };

  const getOutOfAgeRangeMembersCount = (members = selectedMembers, category = getMembersCategory()) => {
    if (!Array.isArray(members) || !categoryHasAgeRange(category)) return 0;
    return members.reduce((count, member) => count + (isMemberOutOfAgeRange(member, category) ? 1 : 0), 0);
  };

  const updateCategoryInfo = () => {
    if (!elements.categoryInfo) return;
    const category = getSelectedCategory();
    if (!category) {
      elements.categoryInfo.innerHTML = '';
      return;
    }

    const minLabel = t('registration_competitions_rule_min', 'Min');
    const maxLabel = t('registration_competitions_rule_max', 'Max');
    const participantsLabel = t('registration_competitions_table_participants', 'Participantes');
    const ageRequirementsLabel = t('registration_competitions_rule_age', 'Edad');
    const musicLabel = t('registration_competitions_table_music', 'Música');
    const musicDurationLabel = t('registration_categories_field_music_max_duration', 'Duración música');
    const economicsLabel = t('registration_competitions_rule_economics', 'Información económica');
    const minPar = normalizeNumber(category.min_par);
    const maxPar = normalizeNumber(category.max_par);
    const minYears = normalizeNumber(category.min_years);
    const maxYears = normalizeNumber(category.max_years);
    const musicMaxDuration = normalizeNumber(category.music_max_duration);
    const maxOutOfRangeLabel = t('registration_competitions_rule_max_outofrange', 'Máx. fuera de rango');
    const participantsInfo = `
      <div class="registration-category-info-card registration-category-info-card--rules">
        <div class="registration-category-info-title">
          <i class="bi bi-people"></i>
          <span>${participantsLabel}</span>
        </div>
        <div class="registration-category-info-values">
          <span><strong>${minLabel}:</strong> ${minPar ?? '-'}</span>
          <span><strong>${maxLabel}:</strong> ${maxPar ?? '-'}</span>
        </div>
      </div>
    `;
    const hasAgeInfo = categoryHasAgeRange(category);
    const ageInfo = hasAgeInfo
      ? `
        <div class="registration-category-info-card registration-category-info-card--age">
          <div class="registration-category-info-title">
            <i class="bi bi-hourglass-split"></i>
            <span>${ageRequirementsLabel}</span>
          </div>
          <div class="registration-category-info-values">
            <span><strong>${minLabel}:</strong> ${minYears ?? '-'}</span>
            <span><strong>${maxLabel}:</strong> ${maxYears ?? '-'}</span>
            <span><strong>${maxOutOfRangeLabel}:</strong> ${getCategoryMaxOutOfRange(category)}</span>
          </div>
        </div>
      `
      : '';
    const musicInfo = `
      <div class="registration-category-info-card registration-category-info-card--music">
        <div class="registration-category-info-title">
          <i class="bi bi-music-note-beamed"></i>
          <span>${musicLabel}</span>
        </div>
        <div class="registration-category-info-values">
          <span><strong>${musicDurationLabel}:</strong> ${musicMaxDuration == null ? '-' : formatDuration(musicMaxDuration)}</span>
        </div>
      </div>
    `;

    const categoryPrice = getCategoryRegistrationPrice(category);
    const pricePerPaxLabel = t('registration_categories_field_price', 'Precio por pax');
    const economicsInfo = `
      <div class="registration-category-info-card registration-category-info-card--economics">
        <div class="registration-category-info-title">
          <i class="bi bi-cash-stack"></i>
          <span>${economicsLabel}</span>
        </div>
        <div class="registration-category-info-values">
          <span><strong>${pricePerPaxLabel}:</strong> ${formatCurrencyDisplay(categoryPrice)}</span>
        </div>
      </div>
    `;

    const gridClassName = hasAgeInfo
      ? 'registration-category-info-grid'
      : 'registration-category-info-grid registration-category-info-grid--no-age';
    elements.categoryInfo.innerHTML = `<div class="${gridClassName}">${participantsInfo}${ageInfo}${musicInfo}${economicsInfo}</div>`;
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

  const extractPaymentInfo = (data) => {
    if (!data || typeof data !== 'object') {
      return { status: '', name: '', size: null, hasFile: false };
    }

    const status = typeof data.status === 'string' ? data.status : '';
    const name = typeof data.original_name === 'string' ? data.original_name : '';
    const size = normalizeNumber(data.size);
    const hasFile = Boolean(name || data.file_url);

    return { status, name, size, hasFile };
  };

  const setAudioSectionVisible = (visible) => {
    if (!elements.audioSection) return;
    elements.audioSection.classList.toggle('d-none', !visible);
  };

  const setPaymentSectionVisible = (visible) => {
    if (!elements.paymentSection) return;
    elements.paymentSection.classList.toggle('d-none', !visible);
  };

  const setAudioUploadControlsVisible = (visible) => {
    if (!audioElements.uploadControls) return;
    audioElements.uploadControls.classList.toggle('d-none', !visible);
  };

  const setAudioRemoveVisible = (visible) => {
    if (!audioElements.removeBtn) return;
    audioElements.removeBtn.classList.toggle('d-none', !visible);
  };

  const setAudioError = (message) => {
    if (!audioElements.error) return;
    if (message) {
      audioElements.error.textContent = message;
      audioElements.error.classList.remove('d-none');
    } else {
      audioElements.error.textContent = '';
      audioElements.error.classList.add('d-none');
    }
  };

  const validateAudioDuration = () => {
    if (!audioState.file) {
      audioState.isValid = true;
      setAudioError('');
      if (audioElements.saveBtn) audioElements.saveBtn.disabled = true;
      return true;
    }

    if (audioState.duration == null) {
      audioState.isValid = false;
      setAudioError('No se pudo leer la duracion del audio.');
      if (audioElements.saveBtn) audioElements.saveBtn.disabled = true;
      return false;
    }

    const TIME_EXTRA = getEvent().musicExtraTime || 0;
    const maxDuration = audioState.maxDuration != null ? audioState.maxDuration + TIME_EXTRA : null;
    if (maxDuration != null && audioState.duration > maxDuration) {
      audioState.isValid = false;
      setAudioError(`La duración supera el máximo permitido (${formatDuration(maxDuration)}).`);
      if (audioElements.saveBtn) audioElements.saveBtn.disabled = true;
      return false;
    }

    audioState.isValid = true;
    setAudioError('');
    if (audioElements.saveBtn) audioElements.saveBtn.disabled = false;
    return true;
  };

  const updateAudioMaxDuration = (categoryId = null) => {
    const category = categoryId ? categoryById.get(`${categoryId}`) : null;
    const maxDuration = normalizeNumber(category?.music_max_duration);
    audioState.maxDuration = maxDuration;
    if (audioElements.max) {
      audioElements.max.textContent = maxDuration == null ? '-' : `${formatDuration(maxDuration)} (+${getEvent().musicExtraTime || 0} sec extra)`;
    }
    validateAudioDuration();
  };

  const updateAudioStatusBadge = (registration = audioRegistration) => {
    if (!audioElements.statusBadge) return;
    if (!registration || typeof getRegistrationMusicBadgeInfo !== 'function') {
      audioElements.statusBadge.className = 'badge bg-secondary-subtle text-secondary-emphasis';
      audioElements.statusBadge.textContent = '-';
      return;
    }
    const badgeInfo = getRegistrationMusicBadgeInfo(registration);
    audioElements.statusBadge.className = `badge ${badgeInfo.className}`;
    audioElements.statusBadge.textContent = badgeInfo.label;
  };

  const updateAudioUi = () => {
    setAudioUploadControlsVisible(!audioState.hasRemote);
    setAudioRemoveVisible(audioState.hasRemote);
    updateAudioStatusBadge();

    const name = audioState.file
      ? audioState.file.name
      : (audioState.existingName || '-');
    if (audioElements.name) {
      audioElements.name.textContent = name;
    }

    const durationValue = audioState.file ? audioState.duration : audioState.existingDuration;
    if (audioElements.duration) {
      audioElements.duration.textContent = durationValue != null ? formatDuration(durationValue) : '-';
    }

    const sizeValue = audioState.file ? audioState.file.size : audioState.existingSize;
    if (audioElements.size) {
      audioElements.size.textContent = sizeValue != null ? formatBytes(sizeValue) : '-';
    }

    if (audioElements.removeBtn) {
      audioElements.removeBtn.disabled = !audioState.hasRemote && !audioState.file;
    }

    validateAudioDuration();
  };

  const resetAudioState = () => {
    audioState = {
      file: null,
      duration: null,
      maxDuration: audioState.maxDuration ?? null,
      existingName: '',
      existingDuration: null,
      existingSize: null,
      hasRemote: false,
      isValid: true
    };
    if (audioElements.input) audioElements.input.value = '';
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

  const buildActionUrl = (endpoint) => {
    const eventIdValue = getEventIdValue();
    return eventIdValue
      ? `${API_BASE_URL}${endpoint}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${endpoint}`;
  };

  const getMusicUrl = (registrationId) => {
    return buildActionUrl(registrationEndpoints.music(registrationId));
  };

  const getPaymentUrl = (registrationId) => {
    return buildActionUrl(registrationEndpoints.payment(registrationId));
  };

  const getPaymentViewUrl = (registrationId) => {
    return buildActionUrl(registrationEndpoints.paymentView(registrationId));
  };

  const getPaymentDownloadUrl = (registrationId) => {
    return buildActionUrl(registrationEndpoints.paymentDownload(registrationId));
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
    if (audioElements.input) audioElements.input.value = '';
    updateAudioUi();
  };

  const updatePaymentUi = () => {
    const activeName = paymentState.file ? paymentState.file.name : (paymentState.existingName || '-');
    const activeSize = paymentState.file ? paymentState.file.size : paymentState.existingSize;

    updatePaymentStatusBadge();
    if (paymentElements.name) {
      paymentElements.name.textContent = activeName;
    }
    if (paymentElements.size) {
      paymentElements.size.textContent = activeSize != null ? formatBytes(activeSize) : '-';
    }
    if (paymentElements.saveBtn) {
      paymentElements.saveBtn.disabled = !paymentState.file;
    }
    if (paymentElements.viewBtn) {
      paymentElements.viewBtn.disabled = !paymentState.hasRemote;
    }
    if (paymentElements.downloadBtn) {
      paymentElements.downloadBtn.disabled = !paymentState.hasRemote;
    }
    if (paymentElements.removeBtn) {
      paymentElements.removeBtn.disabled = !paymentState.hasRemote;
    }
  };

  const updatePaymentStatusBadge = (registration = paymentRegistration) => {
    if (!paymentElements.statusBadge) return;
    if (!registration || typeof getRegistrationPaymentBadgeInfo !== 'function') {
      paymentElements.statusBadge.className = 'badge bg-secondary-subtle text-secondary-emphasis';
      paymentElements.statusBadge.textContent = '-';
      return;
    }
    const badgeInfo = getRegistrationPaymentBadgeInfo(registration);
    paymentElements.statusBadge.className = `badge ${badgeInfo.className}`;
    paymentElements.statusBadge.textContent = badgeInfo.label;
  };

  const resetPaymentState = () => {
    paymentState = {
      file: null,
      existingName: '',
      existingSize: null,
      existingStatus: '',
      hasRemote: false
    };
    if (paymentElements.input) paymentElements.input.value = '';
    updatePaymentUi();
  };

  const setRemotePaymentInfo = (info = null) => {
    const paymentInfo = extractPaymentInfo(info);
    paymentState.existingName = paymentInfo.name;
    paymentState.existingSize = paymentInfo.size;
    paymentState.existingStatus = paymentInfo.status;
    paymentState.hasRemote = paymentInfo.hasFile;
    updatePaymentUi();
  };

  const handlePaymentFile = (file) => {
    if (!file) return;
    const normalizedName = `${file.name || ''}`.toLowerCase();
    if (file.type !== 'application/pdf' && !normalizedName.endsWith('.pdf')) {
      showMessageModal(t('registration_payment_invalid_file', 'Selecciona un archivo PDF valido.'), t('error_title', 'Error'));
      return;
    }
    paymentState.file = file;
    updatePaymentUi();
  };

  const fetchRegistrationPaymentInfo = async (registrationId) => {
    if (!registrationId) return;
    try {
      const url = getPaymentUrl(registrationId);
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          return;
        }
        const data = await safeJson(res);
        const message = data?.error || t('registration_payment_load_error', 'Error al cargar el pago.');
        throw new Error(message);
      }
      const data = await safeJson(res);
      if (!data) {
        return;
      }
      setRemotePaymentInfo(data);
    } catch (err) {
      showMessageModal(err.message || t('registration_payment_load_error', 'Error al cargar el pago.'), t('error_title', 'Error'));
    }
  };

  const openActionUrl = (url, options = {}) => {
    if (!url) return;
    const { newTab = false, download = false, filename = '' } = options;
    const link = document.createElement('a');
    link.href = url;
    if (newTab) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    if (download && filename) {
      link.setAttribute('download', filename);
    }
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const saveRegistrationAudio = async () => {
    const registrationId = audioRegistration?.id ? `${audioRegistration.id}` : '';
    if (!registrationId) return;
    if (!audioState.file) {
      showMessageModal('Selecciona un archivo de audio.', t('error_title', 'Error'));
      return;
    }
    if (!validateAudioDuration()) {
      return;
    }

    if (audioElements.saveBtn) {
      audioElements.saveBtn.disabled = true;
      audioElements.saveBtn.textContent = t('saving', 'Guardando...');
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
      if (audioRegistration) {
        audioRegistration.has_music = true;
        audioRegistration.music_validated = false;
      }
      clearSelectedAudio();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || 'Error al guardar el audio.', t('error_title', 'Error'));
    } finally {
      if (audioElements.saveBtn) {
        audioElements.saveBtn.disabled = !(audioState.file && audioState.isValid);
        audioElements.saveBtn.textContent = audioSaveBtnLabel;
      }
    }
  };

  const deleteRegistrationAudio = async () => {
    const registrationId = audioRegistration?.id ? `${audioRegistration.id}` : '';
    if (!registrationId || !audioState.existingName) return;

    const confirmDelete = await showAudioDeleteConfirm();
    if (!confirmDelete) {
      return;
    }

    if (audioElements.removeBtn) {
      audioElements.removeBtn.disabled = true;
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
      if (audioRegistration) {
        audioRegistration.has_music = false;
        audioRegistration.music_validated = false;
      }
      updateAudioUi();
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || 'Error al eliminar el audio.', t('error_title', 'Error'));
    } finally {
      if (audioElements.removeBtn) {
        audioElements.removeBtn.disabled = !(audioState.file || audioState.existingName);
      }
    }
  };

  const saveRegistrationPayment = async () => {
    const registrationId = paymentRegistration?.id ? `${paymentRegistration.id}` : '';
    if (!registrationId) return;
    if (!paymentState.file) {
      showMessageModal(t('registration_payment_invalid_file', 'Selecciona un archivo PDF valido.'), t('error_title', 'Error'));
      return;
    }

    if (paymentElements.saveBtn) {
      paymentElements.saveBtn.disabled = true;
      paymentElements.saveBtn.textContent = t('saving', 'Guardando...');
    }

    try {
      const url = getPaymentUrl(registrationId);
      const formData = new FormData();
      const selectedFile = paymentState.file;
      formData.append('payment', selectedFile);

      const res = await fetch(url, {
        method: 'POST',
        body: formData
      });

      const data = await safeJson(res);
      if (!res.ok) {
        const message = data?.error || t('registration_payment_save_error', 'Error al guardar el pago.');
        throw new Error(message);
      }

      paymentState.file = null;
      if (paymentElements.input) paymentElements.input.value = '';
      if (paymentRegistration) {
        paymentRegistration.has_payment = true;
        paymentRegistration.payment_validated = false;
      }
      setRemotePaymentInfo(data || {
        original_name: selectedFile.name,
        size: selectedFile.size
      });
      await fetchRegistrationPaymentInfo(registrationId);
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('registration_payment_save_error', 'Error al guardar el pago.'), t('error_title', 'Error'));
    } finally {
      if (paymentElements.saveBtn) {
        paymentElements.saveBtn.disabled = !paymentState.file;
        paymentElements.saveBtn.textContent = paymentSaveBtnLabel;
      }
    }
  };

  const viewRegistrationPayment = () => {
    const registrationId = paymentRegistration?.id ? `${paymentRegistration.id}` : '';
    if (!registrationId || !paymentState.hasRemote) return;
    openActionUrl(getPaymentViewUrl(registrationId), { newTab: true });
  };

  const downloadRegistrationPayment = () => {
    const registrationId = paymentRegistration?.id ? `${paymentRegistration.id}` : '';
    if (!registrationId || !paymentState.hasRemote) return;
    openActionUrl(getPaymentDownloadUrl(registrationId), {
      download: true,
      filename: paymentState.existingName || 'payment.pdf'
    });
  };

  const deleteRegistrationPayment = async () => {
    const registrationId = paymentRegistration?.id ? `${paymentRegistration.id}` : '';
    if (!registrationId || !paymentState.hasRemote) return;

    const confirmDelete = window.confirm(
      t('registration_payment_remove_confirm', 'Seguro que deseas eliminar el justificante de pago?')
    );
    if (!confirmDelete) {
      return;
    }

    if (paymentElements.removeBtn) {
      paymentElements.removeBtn.disabled = true;
    }

    try {
      const url = getPaymentUrl(registrationId);
      const res = await fetch(url, { method: 'DELETE' });
      const data = await safeJson(res);
      if (!res.ok) {
        const message = data?.error || t('registration_payment_remove_error', 'Error al eliminar el pago.');
        throw new Error(message);
      }
      if (paymentRegistration) {
        paymentRegistration.has_payment = false;
        paymentRegistration.payment_validated = false;
      }
      setRemotePaymentInfo(null);
      await loadRegistrations();
    } catch (err) {
      showMessageModal(err.message || t('registration_payment_remove_error', 'Error al eliminar el pago.'), t('error_title', 'Error'));
    } finally {
      updatePaymentUi();
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

  const updateMembersOutOfRangeInfo = () => {
    if (!elements.membersOutOfRangeInfo) return;

    const category = getMembersCategory();
    if (!categoryHasAgeRange(category)) {
      elements.membersOutOfRangeInfo.textContent = '';
      elements.membersOutOfRangeInfo.classList.add('d-none');
      elements.membersOutOfRangeInfo.classList.remove('text-danger', 'fw-semibold', 'text-warning-emphasis');
      elements.membersOutOfRangeInfo.classList.add('text-muted');
      return;
    }

    const outOfRangeCount = getOutOfAgeRangeMembersCount(selectedMembers, category);
    const allowedOutOfRange = getCategoryMaxOutOfRange(category);
    elements.membersOutOfRangeInfo.textContent = formatTemplate(
      t('registration_competitions_members_outofrange_count', 'Fuera de rango: {count}'),
      { count: outOfRangeCount }
    );
    elements.membersOutOfRangeInfo.classList.remove('d-none', 'text-muted', 'text-warning-emphasis', 'text-danger', 'fw-semibold');

    if (outOfRangeCount > allowedOutOfRange) {
      elements.membersOutOfRangeInfo.classList.add('text-danger', 'fw-semibold');
    } else if (outOfRangeCount > 0) {
      elements.membersOutOfRangeInfo.classList.add('text-warning-emphasis');
    } else {
      elements.membersOutOfRangeInfo.classList.add('text-muted');
    }
  };

  const renderMembersTable = () => {
    if (!elements.membersTable) return;
    elements.membersTable.innerHTML = '';

    updateMemberCount();
    updateMembersOutOfRangeInfo();

    if (!selectedMembers.length) {
      if (elements.membersEmpty) elements.membersEmpty.classList.remove('d-none');
      updateMemberControls();
      return;
    }

    if (elements.membersEmpty) elements.membersEmpty.classList.add('d-none');

    const deleteTitle = t('delete', 'Delete');
    const category = getMembersCategory();

    selectedMembers.forEach(member => {

      const row = document.createElement('tr');
      row.dataset.id = member.id;
      const memberAge = getMemberAgeValue(member);
      const outOfRange = isMemberOutOfAgeRange(member, category);
      if (outOfRange) {
        row.classList.add('table-warning');
      }

      const nameCell = document.createElement('td');
      nameCell.textContent = member.name || '';
      row.appendChild(nameCell);

      if (getEvent()?.showGender) {
        const genderCell = document.createElement('td');
        genderCell.textContent = member.gender || '-';
        row.appendChild(genderCell);
      }

      const dobValue = getDateOnlyValue(member.date_of_birth);
      const dobCell = document.createElement('td');
      dobCell.textContent = dobValue || '-';
      row.appendChild(dobCell);

      const ageCell = document.createElement('td');
      ageCell.textContent = `${memberAge}`;
      if (outOfRange) {
        ageCell.classList.add('fw-semibold', 'text-warning-emphasis');
      }
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
            const ageValue = calculateAge(getDateOnlyValue(data.dob), getRegistrationAgeReferenceDate());
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
    if (typeof fetchRegistrationCategories === 'function') {
      const categories = await fetchRegistrationCategories();
      registrationState.registrationConfig.categories = categories;
      return categories;
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
    if (typeof fetchRegistrationStyles === 'function') {
      const styles = await fetchRegistrationStyles();
      registrationState.registrationConfig.styles = styles;
      return styles;
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
        const memberId = member.participant_id;
        const fallback = memberId ? participantsById.get(`${memberId}`) : null;
        return {
          ...fallback,
          ...member,
          id: memberId,
          name: member.name || (memberId != null ? `#${memberId}` : ''),
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

  const getRegistrationObservationsValue = (data) => data?.notes
    ?? data?.observations
    ?? data?.observation
    ?? data?.observaciones
    ?? data?.remarks
    ?? '';

  const disposeRegistrationsTooltips = () => {
    registrationsTooltipInstances.forEach((instance) => instance.dispose());
    registrationsTooltipInstances = [];
  };

  const initRegistrationsTooltips = () => {
    disposeRegistrationsTooltips();
    const tooltipElements = tableBody.querySelectorAll('[data-bs-toggle="tooltip"]');
    registrationsTooltipInstances = Array.from(tooltipElements).map((element) =>
      new bootstrap.Tooltip(element)
    );
  };

  const setObservationsEditable = (editable) => {
    if (!elements.observations) return;
    elements.observations.readOnly = !editable;
    elements.observations.classList.toggle('bg-light', !editable);
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
    if (elements.participantsCountAddon) {
      elements.participantsCountAddon.classList.add('d-none');
      elements.participantsCountAddon.textContent = formatParticipantsCountLabel(null);
    }
    if (elements.choreographer) elements.choreographer.value = '';
    if (elements.category) elements.category.value = '';
    if (elements.style) elements.style.value = '';
    if (elements.observations) elements.observations.value = '';
    setObservationsEditable(true);
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
      setPaymentSectionVisible(false);
      updateModalStatusInfo('', '');
      updateRegistrationTotalAmountInfo(null);
      registrationModal.show();
      return;
    }

    if (!registration) {
      resetChoreoForm();
      setAudioSectionVisible(false);
      setPaymentSectionVisible(false);
      updateModalStatusInfo('', '');
      updateRegistrationTotalAmountInfo(null);
      registrationModal.show();
      return;
    }

    let registrationData = registration;
    const details = registration.id ? await fetchRegistrationDetails(registration.id) : null;
    if (details && typeof details === 'object') {
      registrationData = { ...registration, ...details };
    }

    elements.id.value = registrationData.id || '';
    elements.choreographyName.value = registrationData.name || '';
    if (elements.participantsCountAddon) {
      elements.participantsCountAddon.textContent = formatParticipantsCountLabel(registrationData);
      elements.participantsCountAddon.classList.remove('d-none');
    }
    elements.choreographer.value = registrationData.choreographer || '';
    elements.category.value = registrationData.reg_category_id ?? registrationData.category_id ?? registration.reg_category_id ?? '';
    elements.style.value = registrationData.reg_style_id ?? registrationData.style_id ?? registration.reg_style_id ?? '';
    if (elements.observations) {
      elements.observations.value = getRegistrationObservationsValue(registrationData);
    }

    updateCategoryInfo();
    setAudioSectionVisible(false);
    setPaymentSectionVisible(false);
    updateRegistrationTotalAmountInfo(registrationData);
    const statusValue = registrationData.status || registration.status || '';
    const rejectReason = getRejectReasonValue(registrationData) || getRejectReasonValue(registration);
    setObservationsEditable(!statusValue || ['CRE', 'REJ'].includes(`${statusValue}`));
    updateModalStatusInfo(statusValue, rejectReason);
    registrationModal.show();
  };

  const openAudioModal = async (registration) => {
    if (!registration) return;

    try {
      await loadRegistrationConfig();
    } catch (err) {
      showMessageModal(err.message || t('registration_audio_load_error', 'Error loading audio.'), t('error_title', 'Error'));
      return;
    }

    audioRegistration = registration;

    const categoryId = getRegistrationCategoryId(registration);
    const category = categoryById.get(`${categoryId}`) || null;
    const styleId = getRegistrationStyleId(registration);
    const styleName = styleById.get(`${styleId}`)?.name || registration.style_name || '-';

    if (audioElements.choreo) {
      audioElements.choreo.textContent = registration.name || registration.choreography || '-';
    }
    if (audioElements.category) {
      audioElements.category.textContent = category?.name || registration.category_name || '-';
    }
    if (audioElements.style) {
      audioElements.style.textContent = styleName;
    }

    updateAudioMaxDuration(categoryId);
    resetAudioState();
    await fetchRegistrationAudioInfo(registration.id);
    registrationAudioModal.show();
  };

  const openPaymentModal = async (registration) => {
    if (!registration) return;

    try {
      await loadRegistrationConfig();
    } catch (err) {
      showMessageModal(err.message || t('registration_competitions_load_error', 'Error loading registrations.'), t('error_title', 'Error'));
      return;
    }

    paymentRegistration = registration;

    const categoryId = getRegistrationCategoryId(registration);
    const category = categoryById.get(`${categoryId}`) || null;
    const styleId = getRegistrationStyleId(registration);
    const styleName = styleById.get(`${styleId}`)?.name || registration.style_name || '-';

    if (paymentElements.choreo) {
      paymentElements.choreo.textContent = registration.name || registration.choreography || '-';
    }
    if (paymentElements.category) {
      paymentElements.category.textContent = category?.name || registration.category_name || '-';
    }
    if (paymentElements.style) {
      paymentElements.style.textContent = styleName;
    }
    if (paymentElements.totalAmount) {
      paymentElements.totalAmount.textContent = formatCurrencyDisplay(getRegistrationTotalAmount(registration));
    }

    resetPaymentState();
    setRemotePaymentInfo(registration);
    registrationPaymentModal.show();
    await fetchRegistrationPaymentInfo(registration.id);
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
      elements.membersRuleInfo.innerHTML = '';
      return;
    }

    const minLabel = t('registration_competitions_rule_min', 'Min');
    const maxLabel = t('registration_competitions_rule_max', 'Max');
    const participantsLabel = t('registration_competitions_table_participants', 'Participantes');
    const ageRequirementsLabel = t('registration_competitions_rule_age', 'Edad');
    const minPar = normalizeNumber(category.min_par);
    const maxPar = normalizeNumber(category.max_par);
    const minYears = normalizeNumber(category.min_years);
    const maxYears = normalizeNumber(category.max_years);
    const maxOutOfRangeLabel = t('registration_competitions_rule_max_outofrange', 'Máx. fuera de rango');
    const participantsInfo = `
      <div class="registration-category-info-card registration-category-info-card--rules">
        <div class="registration-category-info-title">
          <i class="bi bi-people"></i>
          <span>${participantsLabel}</span>
        </div>
        <div class="registration-category-info-values">
          <span><strong>${minLabel}:</strong> ${minPar ?? '-'}</span>
          <span><strong>${maxLabel}:</strong> ${maxPar ?? '-'}</span>
        </div>
      </div>
    `;
    const hasAgeInfo = categoryHasAgeRange(category);
    const ageInfo = hasAgeInfo
      ? `
        <div class="registration-category-info-card registration-category-info-card--age">
          <div class="registration-category-info-title">
            <i class="bi bi-hourglass-split"></i>
            <span>${ageRequirementsLabel}</span>
          </div>
          <div class="registration-category-info-values">
            <span><strong>${minLabel}:</strong> ${minYears ?? '-'}</span>
            <span><strong>${maxLabel}:</strong> ${maxYears ?? '-'}</span>
            <span><strong>${maxOutOfRangeLabel}:</strong> ${getCategoryMaxOutOfRange(category)}</span>
          </div>
        </div>
      `
      : '';
    const gridClassName = hasAgeInfo
      ? 'registration-category-info-grid'
      : 'registration-category-info-grid registration-category-info-grid--no-age';
    elements.membersRuleInfo.innerHTML = `<div class="${gridClassName}">${participantsInfo}${ageInfo}</div>`;
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
    const info = statusMap[status] || { label: status || '-', color: 'secondary' };
    return { ...info, label: `${info.label}`.toUpperCase() };
  };

  const getRejectReasonValue = (data) => data?.reject_reason
    || data?.rejection_reason
    || data?.rejectReason
    || data?.reject_note
    || '';

  const updateModalStatusInfo = (status, rejectReason) => {
    if (!elements.statusWrapper || !elements.statusBadge) return;
    if (!status) {
      elements.statusWrapper.classList.add('d-none');
      if (elements.totalAmountWrapper) elements.totalAmountWrapper.classList.add('d-none');
      if (elements.rejectWrapper) elements.rejectWrapper.classList.add('d-none');
      return;
    }

    const statusInfo = formatStatusInfo(status);
    elements.statusBadge.className = `badge bg-${statusInfo.color}`;
    elements.statusBadge.textContent = statusInfo.label;
    elements.statusWrapper.classList.remove('d-none');

    if (elements.rejectWrapper && elements.rejectReason) {
      if (`${status}` === 'REJ') {
        elements.rejectReason.textContent = rejectReason || '-';
        elements.rejectWrapper.classList.remove('d-none');
      } else {
        elements.rejectWrapper.classList.add('d-none');
      }
    }
  };

  const updateRegistrationTotalAmountInfo = (registration = null) => {
    if (!elements.totalAmountWrapper || !elements.totalAmountValue) return;
    if (!registration) {
      elements.totalAmountWrapper.classList.add('d-none');
      elements.totalAmountValue.textContent = '-';
      return;
    }

    elements.totalAmountValue.textContent = formatCurrencyDisplay(getRegistrationTotalAmount(registration));
    elements.totalAmountWrapper.classList.remove('d-none');
  };

  const renderRegistrations = () => {
    disposeRegistrationsTooltips();
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
      const isValidated = `${registration.status}` === 'VAL';

      const nameCell = document.createElement('td');
      const nameWrapper = document.createElement('div');
      nameWrapper.className = 'fw-semibold';
      nameWrapper.textContent = registration.name || '-';
      nameCell.appendChild(nameWrapper);
      row.appendChild(nameCell);

      const categoryCell = document.createElement('td');
      categoryCell.textContent = registration.category_name || '-';
      row.appendChild(categoryCell);

      const styleCell = document.createElement('td');
      styleCell.textContent = registration.style_name || '-';
      row.appendChild(styleCell);

      const participantsCell = document.createElement('td');
      participantsCell.className = 'text-center';
      participantsCell.textContent = `${getRegistrationParticipantsCount(registration)}`;
      row.appendChild(participantsCell);

      const observationsCell = document.createElement('td');
      observationsCell.className = 'text-center';
      observationsCell.setAttribute('data-tsv-ignore', 'true');
      const observationsIcon = document.createElement('i');
      const hasObservations = `${getRegistrationObservationsValue(registration)}`.trim().length > 0;
      observationsIcon.className = hasObservations
        ? 'bi bi-chat-left-text-fill text-warning'
        : 'bi bi-dash-circle text-body-tertiary';
      observationsIcon.setAttribute('data-bs-toggle', 'tooltip');
      observationsIcon.setAttribute('data-bs-placement', 'top');
      observationsIcon.setAttribute(
        'data-bs-title',
        hasObservations
          ? t('registration_competitions_observations_yes', 'Con observaciones')
          : t('registration_competitions_observations_no', 'Sin observaciones')
      );
      observationsIcon.setAttribute(
        'aria-label',
        hasObservations
          ? t('registration_competitions_observations_yes', 'Con observaciones')
          : t('registration_competitions_observations_no', 'Sin observaciones')
      );
      observationsCell.appendChild(observationsIcon);
      row.appendChild(observationsCell);

      const alertsCell = document.createElement('td');
      alertsCell.className = 'text-center';
      alertsCell.setAttribute('data-tsv-ignore', 'true');
      alertsCell.appendChild(createRegistrationAlertsIcon(registration));
      row.appendChild(alertsCell);

      const totalAmountCell = document.createElement('td');
      totalAmountCell.className = 'text-center';
      totalAmountCell.textContent = formatCurrencyDisplay(getRegistrationTotalAmount(registration));
      row.appendChild(totalAmountCell);

      const statusCell = document.createElement('td');
      const statusInfo = formatStatusInfo(registration.status);
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge bg-${statusInfo.color}`;
      statusBadge.textContent = statusInfo.label;
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);

      const musicCell = document.createElement('td');
      musicCell.className = 'text-center';
      const musicInfo = getRegistrationMusicBadgeInfo(registration);
      const musicBadge = document.createElement('span');
      musicBadge.className = `badge ${musicInfo.className}`;
      musicBadge.textContent = musicInfo.label;
      musicCell.appendChild(musicBadge);
      row.appendChild(musicCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      actionsCell.setAttribute('data-tsv-ignore', 'true');
      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-outline-primary btn-sm btn-edit-registration';
      editBtn.dataset.id = registration.id;
      editBtn.title = editTitle;
      editBtn.setAttribute('aria-label', editTitle);
      editBtn.disabled = isPending || isValidated;
      editBtn.innerHTML = '<i class="bi bi-pencil"></i>';

      const audioBtn = document.createElement('button');
      audioBtn.type = 'button';
      audioBtn.className = 'btn btn-outline-info btn-sm btn-registration-audio';
      audioBtn.dataset.id = registration.id;
      audioBtn.title = t('registration_audio_manage', 'Gestionar música');
      audioBtn.setAttribute('aria-label', audioBtn.title);
      audioBtn.innerHTML = '<i class="bi bi-music-note-beamed"></i>';

      const membersBtn = document.createElement('button');
      membersBtn.type = 'button';
      membersBtn.className = 'btn btn-outline-secondary btn-sm btn-members-registration';
      membersBtn.dataset.id = registration.id;
      membersBtn.title = t('registration_competitions_members_title', 'Gestion de miembros');
      membersBtn.setAttribute('aria-label', membersBtn.title);
      membersBtn.disabled = isPending || isValidated;
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
      confirmBtn.disabled = isValidated;

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm btn-delete-registration';
      deleteBtn.dataset.id = registration.id;
      deleteBtn.title = deleteTitle;
      deleteBtn.setAttribute('aria-label', deleteTitle);
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';

      actionGroup.appendChild(editBtn);
      actionGroup.appendChild(audioBtn);
      actionGroup.appendChild(membersBtn);
      actionGroup.appendChild(confirmBtn);
      actionGroup.appendChild(deleteBtn);
      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });

    initRegistrationsTooltips();
  };
  const showRegistrationsError = (message) => {
    disposeRegistrationsTooltips();
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 10;
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
      if (typeof notifySchoolRegistrationsUpdate === 'function') {
        notifySchoolRegistrationsUpdate();
      }
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
      notes: elements.observations ? elements.observations.value.trim() : '',
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

  if (audioElements.browseBtn && audioElements.input) {
    audioElements.browseBtn.addEventListener('click', () => {
      audioElements.input.click();
    });
  }

  if (audioElements.input) {
    audioElements.input.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      handleAudioFile(file);
    });
  }

  if (audioElements.dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      audioElements.dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        audioElements.dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      audioElements.dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        audioElements.dropzone.classList.remove('is-dragover');
      });
    });
    audioElements.dropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files && event.dataTransfer.files[0];
      handleAudioFile(file);
    });
  }

  if (audioElements.removeBtn) {
    audioElements.removeBtn.addEventListener('click', () => {
      if (audioState.file) {
        clearSelectedAudio();
        return;
      }
      deleteRegistrationAudio();
    });
  }

  if (audioElements.saveBtn) {
    audioElements.saveBtn.addEventListener('click', saveRegistrationAudio);
  }

  if (paymentElements.browseBtn && paymentElements.input) {
    paymentElements.browseBtn.addEventListener('click', () => {
      paymentElements.input.click();
    });
  }

  if (paymentElements.input) {
    paymentElements.input.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      handlePaymentFile(file);
    });
  }

  if (paymentElements.dropzone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      paymentElements.dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        paymentElements.dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      paymentElements.dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        paymentElements.dropzone.classList.remove('is-dragover');
      });
    });
    paymentElements.dropzone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files && event.dataTransfer.files[0];
      handlePaymentFile(file);
    });
  }

  if (paymentElements.viewBtn) {
    paymentElements.viewBtn.addEventListener('click', viewRegistrationPayment);
  }

  if (paymentElements.downloadBtn) {
    paymentElements.downloadBtn.addEventListener('click', downloadRegistrationPayment);
  }

  if (paymentElements.removeBtn) {
    paymentElements.removeBtn.addEventListener('click', deleteRegistrationPayment);
  }

  if (paymentElements.saveBtn) {
    paymentElements.saveBtn.addEventListener('click', saveRegistrationPayment);
  }

  if (createBtn) {
    createBtn.addEventListener('click', () => openRegistrationModal('create'));
  }

  if (copyTsvBtn) {
    bindTableTsvExportButton(copyTsvBtn, tableBody);
  }

  tableBody.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.btn-edit-registration');
    const audioBtn = event.target.closest('.btn-registration-audio');
    const paymentBtn = event.target.closest('.btn-registration-payment');
    const membersBtn = event.target.closest('.btn-members-registration');
    const confirmBtn = event.target.closest('.btn-confirm-registration');
    const deleteBtn = event.target.closest('.btn-delete-registration');

    if (editBtn) {
      const id = editBtn.dataset.id;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      openRegistrationModal('edit', registration || null);
      return;
    }

    if (audioBtn) {
      const id = audioBtn.dataset.id;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      openAudioModal(registration || null);
      return;
    }

    if (paymentBtn) {
      const id = paymentBtn.dataset.id;
      const registration = registrationState.registrations.find(item => `${item.id}` === `${id}`);
      openPaymentModal(registration || null);
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
    setAudioSectionVisible(false);
    setPaymentSectionVisible(false);
    updateRegistrationTotalAmountInfo(null);
    if (elements.participantsCountAddon) {
      elements.participantsCountAddon.classList.add('d-none');
      elements.participantsCountAddon.textContent = formatParticipantsCountLabel(null);
    }
    loadRegistrations();
  });

  audioModalEl.addEventListener('hidden.bs.modal', () => {
    audioRegistration = null;
    resetAudioState();
  });

  paymentModalEl.addEventListener('hidden.bs.modal', () => {
    paymentRegistration = null;
    resetPaymentState();
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

  if (isSchoolUser && elements.membersAgeInfoBtn) {
    const membersAgeLanguageObserver = new MutationObserver(() => {
      updateMembersAgeHeaderTooltip();
    });
    membersAgeLanguageObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang']
    });
  }
  window.addEventListener('beforeunload', disposeRegistrationsTooltips);

  updateMembersAgeHeaderTooltip();
  syncMembersGenderUi();
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
