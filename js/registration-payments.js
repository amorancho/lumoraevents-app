function initPaymentsTab(role) {
  const pane = document.getElementById('payments');
  if (!pane || pane.dataset.initialized === 'true') {
    return;
  }
  if (!['school', 'organizer'].includes(role)) {
    return;
  }

  pane.dataset.initialized = 'true';

  const isOrganizer = role === 'organizer';
  const summaryElements = {
    feeValue: document.getElementById('registrationPaymentsFeeValue'),
    feeMeta: document.getElementById('registrationPaymentsFeeMeta'),
    amountValue: document.getElementById('registrationPaymentsAmountValue'),
    amountMeta: document.getElementById('registrationPaymentsAmountMeta'),
    paidValue: document.getElementById('registrationPaymentsPaidValue'),
    paidMeta: document.getElementById('registrationPaymentsPaidMeta'),
    pendingValue: document.getElementById('registrationPaymentsPendingValue'),
    pendingMeta: document.getElementById('registrationPaymentsPendingMeta')
  };
  const tableBody = document.getElementById('registrationPaymentsTable');
  const emptyEl = document.getElementById('registrationPaymentsEmpty');
  const organizerCountEl = document.getElementById('registrationPaymentsCount');
  const schoolCountEl = document.getElementById('registrationPaymentsCountSchool');
  const schoolHeader = document.getElementById('registrationPaymentsSchoolHeader');
  const copyTsvBtn = document.getElementById('registrationPaymentsCopyTsvBtn');
  const copyTsvBtnSchool = document.getElementById('registrationPaymentsCopyTsvBtnSchool');
  const addPaymentBtn = document.getElementById('registrationPaymentsAddBtn');
  const organizerHeader = document.getElementById('registrationPaymentsOrganizerHeader');
  const organizerCountWrap = document.getElementById('registrationPaymentsOrganizerCountWrap');
  const schoolActions = document.getElementById('registrationPaymentsSchoolActions');
  const schoolFilterEl = document.getElementById('registrationPaymentsSchoolFilter');
  const statusFilterEl = document.getElementById('registrationPaymentsStatusFilter');
  const clearFiltersBtn = document.getElementById('registrationPaymentsFilterClear');
  const createModalEl = document.getElementById('registrationPaymentsCreateModal');
  const createForm = document.getElementById('registrationPaymentsCreateForm');
  const createAmountEl = document.getElementById('registrationPaymentsCreateAmount');
  const createFileEl = document.getElementById('registrationPaymentsCreateFile');
  const createFileInfoEl = document.getElementById('registrationPaymentsCreateFileInfo');
  const createFileNameEl = document.getElementById('registrationPaymentsCreateFileName');
  const createFileSizeEl = document.getElementById('registrationPaymentsCreateFileSize');
  const createSaveBtn = document.getElementById('registrationPaymentsCreateSaveBtn');
  const deleteModalEl = document.getElementById('registrationPaymentsDeleteModal');
  const deleteConfirmBtn = document.getElementById('confirmDeleteRegistrationPaymentBtn');
  const validateModalEl = document.getElementById('registrationPaymentsValidateModal');
  const validateConfirmBtn = document.getElementById('confirmValidateRegistrationPaymentBtn');
  const rejectModalEl = document.getElementById('registrationPaymentsRejectModal');
  const rejectConfirmBtn = document.getElementById('confirmRejectRegistrationPaymentBtn');
  const createModal = createModalEl && window.bootstrap?.Modal
    ? new bootstrap.Modal(createModalEl)
    : null;
  const deleteModal = deleteModalEl && window.bootstrap?.Modal
    ? new bootstrap.Modal(deleteModalEl)
    : null;
  const validateModal = validateModalEl && window.bootstrap?.Modal
    ? new bootstrap.Modal(validateModalEl)
    : null;
  const rejectModal = rejectModalEl && window.bootstrap?.Modal
    ? new bootstrap.Modal(rejectModalEl)
    : null;

  if (!tableBody || !emptyEl) {
    return;
  }

  if (schoolHeader) {
    schoolHeader.classList.toggle('d-none', !isOrganizer);
  }
  if (addPaymentBtn) {
    addPaymentBtn.classList.toggle('d-none', isOrganizer);
  }
  if (organizerHeader) {
    organizerHeader.classList.toggle('d-none', !isOrganizer);
  }
  if (organizerCountWrap) {
    organizerCountWrap.classList.toggle('d-none', !isOrganizer);
  }
  if (schoolActions) {
    schoolActions.classList.toggle('d-none', isOrganizer);
  }

  if (copyTsvBtn && typeof bindTableTsvExportButton === 'function') {
    bindTableTsvExportButton(copyTsvBtn, tableBody);
  }
  if (copyTsvBtnSchool && typeof bindTableTsvExportButton === 'function') {
    bindTableTsvExportButton(copyTsvBtnSchool, tableBody);
  }

  const paymentListEndpoint = '/api/registrations/payments';
  let paymentRows = [];
  let activeRequestId = 0;

  const getCategoryById = () => new Map(
    (Array.isArray(registrationState.registrationCategories) ? registrationState.registrationCategories : [])
      .map((item) => [`${item.id}`, item])
  );

  const getRoleRegistrations = () => {
    const registrations = isOrganizer
      ? registrationState.organizerRegistrations
      : registrationState.registrations;
    return Array.isArray(registrations) ? registrations : [];
  };

  const formatInteger = (value) => new Intl.NumberFormat(getRegistrationLanguage()).format(Number(value) || 0);

  const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '-';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const isPdfFile = (file) => Boolean(
    file
    && `${file.name || ''}`.trim()
    && (
      `${file.type || ''}`.toLowerCase() === 'application/pdf'
      || /\.pdf$/i.test(`${file.name || ''}`)
    )
  );

  const parseAmountToCents = (value) => {
    const normalized = `${value ?? ''}`
      .trim()
      .replace(/\s+/g, '')
      .replace(',', '.');

    if (!normalized || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      return null;
    }

    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount < 0) {
      return null;
    }

    return Math.round(amount * 100);
  };

  const safeJson = async (res) => {
    try {
      return await res.json();
    } catch (error) {
      return null;
    }
  };

  const getParticipantRegistrationCount = (participant) => {
    const directCount = Number(
      participant?.registrations_count
      ?? participant?.registration_count
      ?? participant?.num_registrations
      ?? participant?.registrationsCount
    );
    if (Number.isFinite(directCount)) {
      return { hasInfo: true, count: directCount };
    }

    if (Object.prototype.hasOwnProperty.call(participant || {}, 'reg_cat_sty')
      || Object.prototype.hasOwnProperty.call(participant || {}, 'regCatSty')) {
      const rawValue = `${participant?.reg_cat_sty ?? participant?.regCatSty ?? ''}`.trim();
      if (!rawValue || rawValue.toUpperCase() === 'NULL') {
        return { hasInfo: true, count: 0 };
      }

      return {
        hasInfo: true,
        count: rawValue.split('|').map((value) => value.trim()).filter(Boolean).length
      };
    }

    return { hasInfo: false, count: 0 };
  };

  const getRegisteredParticipantsCount = (registrations) => {
    const participants = Array.isArray(registrationState.participants)
      ? registrationState.participants
      : [];

    if (participants.length) {
      let hasParticipantInfo = false;
      const count = participants.reduce((total, participant) => {
        const info = getParticipantRegistrationCount(participant);
        hasParticipantInfo = hasParticipantInfo || info.hasInfo;
        return total + (info.count > 0 ? 1 : 0);
      }, 0);

      if (hasParticipantInfo) {
        return count;
      }
    }

    const participantIds = new Set();
    (Array.isArray(registrations) ? registrations : []).forEach((registration) => {
      const members = Array.isArray(registration?.members)
        ? registration.members
        : (Array.isArray(registration?.participants) ? registration.participants : []);

      members.forEach((member) => {
        const memberId = member?.id ?? member?.participant_id ?? member?.participantId;
        if (memberId !== undefined && memberId !== null && `${memberId}` !== '') {
          participantIds.add(`${memberId}`);
        }
      });
    });

    if (participantIds.size) {
      return participantIds.size;
    }

    return (Array.isArray(registrations) ? registrations : []).reduce(
      (sum, registration) => sum + getRegistrationParticipantsTotal(registration),
      0
    );
  };

  const buildMetrics = (registrations) => {
    const categoryById = getCategoryById();
    const finance = buildRegistrationFinanceMetrics(registrations, { categoryById });
    const registeredParticipantsCount = getRegisteredParticipantsCount(registrations);
    const registrationFeeCost = normalizeRegistrationNumber(getEvent()?.registrationFeeCost) ?? 0;
    const totalFee = registrationFeeCost * registeredParticipantsCount;
    const pendingAmount = Math.max(0, totalFee + finance.totalAmount - finance.paidAmount);

    return {
      finance,
      registeredParticipantsCount,
      totalFee,
      pendingAmount
    };
  };

  const updateSummary = (metrics) => {
    if (summaryElements.feeValue) {
      summaryElements.feeValue.textContent = formatRegistrationCurrency(metrics.totalFee);
    }
    if (summaryElements.feeMeta) {
      summaryElements.feeMeta.textContent = `${formatInteger(metrics.registeredParticipantsCount)} ${t('registration_dashboard_kpi_participants', 'Participants')}`;
    }
    if (summaryElements.amountValue) {
      summaryElements.amountValue.textContent = formatRegistrationCurrency(metrics.finance.totalAmount);
    }
    if (summaryElements.amountMeta) {
      summaryElements.amountMeta.textContent = `${formatInteger(metrics.finance.totalRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
    if (summaryElements.paidValue) {
      summaryElements.paidValue.textContent = formatRegistrationCurrency(metrics.finance.paidAmount);
    }
    if (summaryElements.paidMeta) {
      summaryElements.paidMeta.textContent = `${formatInteger(metrics.finance.paidRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
    if (summaryElements.pendingValue) {
      summaryElements.pendingValue.textContent = formatRegistrationCurrency(metrics.pendingAmount);
    }
    if (summaryElements.pendingMeta) {
      summaryElements.pendingMeta.textContent = `${formatInteger(metrics.finance.pendingRegistrationsCount)} ${t('registration_dashboard_kpi_registrations', 'Registrations')}`;
    }
  };

  const renderSummary = () => {
    updateSummary(buildMetrics(getRoleRegistrations()));
  };

  const setCreateFileInfo = (file) => {
    if (!createFileInfoEl || !createFileNameEl || !createFileSizeEl) {
      return;
    }

    if (!file) {
      createFileInfoEl.classList.add('d-none');
      createFileNameEl.textContent = '-';
      createFileSizeEl.textContent = '-';
      return;
    }

    createFileInfoEl.classList.remove('d-none');
    createFileNameEl.textContent = file.name || '-';
    createFileSizeEl.textContent = formatBytes(file.size);
  };

  const resetCreatePaymentModal = () => {
    createForm?.reset();
    createForm?.classList.remove('was-validated');
    createAmountEl?.classList.remove('is-invalid');
    createFileEl?.classList.remove('is-invalid');
    setCreateFileInfo(null);

    if (createSaveBtn) {
      createSaveBtn.disabled = false;
      createSaveBtn.textContent = t('registration_payments_add', 'Add payment');
    }
  };

  const getCreatePaymentContext = async () => {
    const user = getUserFromToken();
    if (!user?.id) {
      throw new Error(t('registration_school_no_user', 'No user found.'));
    }

    let schoolRecord = registrationState.school || null;
    if (!schoolRecord && typeof fetchSchoolRecord === 'function') {
      schoolRecord = await fetchSchoolRecord(user.id);
    }

    const eventIdValue = getEvent()?.id || schoolRecord?.event_id;
    const schoolIdValue = schoolRecord?.id || user.id;

    if (!eventIdValue) {
      throw new Error(t('event_not_found', 'Event not found.'));
    }
    if (!schoolIdValue) {
      throw new Error(t('school_not_found', 'School not found.'));
    }

    return {
      eventId: eventIdValue,
      schoolId: schoolIdValue
    };
  };

  const buildPaymentsUrl = () => {
    const eventIdValue = getEvent()?.id;
    return eventIdValue
      ? `${API_BASE_URL}${paymentListEndpoint}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${paymentListEndpoint}`;
  };

  const buildPaymentActionUrl = (paymentId, action) => {
    if (!paymentId || !action) {
      return '';
    }

    const eventIdValue = getEvent()?.id;
    const baseUrl = `${API_BASE_URL}${paymentListEndpoint}/${encodeURIComponent(paymentId)}/${action}`;
    return eventIdValue
      ? `${baseUrl}?event_id=${encodeURIComponent(eventIdValue)}`
      : baseUrl;
  };

  const buildPaymentDeleteUrl = (paymentId) => {
    if (!paymentId) {
      return '';
    }

    const eventIdValue = getEvent()?.id;
    const baseUrl = `${API_BASE_URL}${paymentListEndpoint}/${encodeURIComponent(paymentId)}`;
    return eventIdValue
      ? `${baseUrl}?event_id=${encodeURIComponent(eventIdValue)}`
      : baseUrl;
  };

  const openActionUrl = (url, options = {}) => {
    if (!url) {
      return;
    }

    const link = document.createElement('a');
    link.href = url;

    if (options.newTab) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }

    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const formatPaymentCreatedAt = (value) => {
    const date = getRegistrationCalendarDate(value);
    if (!date) {
      return '-';
    }

    return new Intl.DateTimeFormat(getRegistrationLanguage(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getPaymentStatusInfo = (payment) => {
    const normalizedStatus = `${payment?.status ?? ''}`.trim().toUpperCase();
    if (normalizedStatus === 'VAL') {
      return {
        label: t('registration_payment_status_validated', 'Validated'),
        className: 'bg-success-subtle text-success-emphasis'
      };
    }

    if (normalizedStatus === 'REJ') {
      return {
        label: t('registration_payment_status_rejected', 'Rejected'),
        className: 'bg-danger-subtle text-danger-emphasis'
      };
    }

    if (normalizedStatus === 'PEN') {
      return {
        label: t('registration_status_pending', 'Pending validation'),
        className: 'bg-warning-subtle text-warning-emphasis'
      };
    }

    return {
      label: normalizedStatus || '-',
      className: 'bg-secondary-subtle text-secondary-emphasis'
    };
  };

  const getPaymentSchoolName = (payment) => `${payment?.school_name ?? ''}`.trim();

  const getPaymentStatusValue = (payment) => `${payment?.status ?? ''}`.trim().toUpperCase();

  const buildFilterOptions = (selectEl, values, allLabel) => {
    if (!selectEl) {
      return;
    }

    const currentValue = selectEl.value;
    selectEl.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = allLabel;
    selectEl.appendChild(allOption);

    values.forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      selectEl.appendChild(option);
    });

    selectEl.value = values.some((item) => item.value === currentValue) ? currentValue : '';
  };

  const renderOrganizerFilters = () => {
    if (!isOrganizer) {
      return;
    }

    const locale = getRegistrationLanguage();
    const schoolValues = [...new Set(
      paymentRows
        .map((payment) => getPaymentSchoolName(payment))
        .filter(Boolean)
    )]
      .sort((a, b) => a.localeCompare(b, locale, { sensitivity: 'base' }))
      .map((value) => ({ value, label: value }));

    const knownStatuses = ['PEN', 'VAL', 'REJ'];
    const dynamicStatuses = [...new Set(
      paymentRows
        .map((payment) => getPaymentStatusValue(payment))
        .filter(Boolean)
    )];
    const orderedStatuses = [
      ...knownStatuses.filter((status) => dynamicStatuses.includes(status)),
      ...dynamicStatuses.filter((status) => !knownStatuses.includes(status)).sort((a, b) => a.localeCompare(b, locale))
    ];
    const statusValues = orderedStatuses.map((value) => ({
      value,
      label: getPaymentStatusInfo({ status: value }).label
    }));

    buildFilterOptions(
      schoolFilterEl,
      schoolValues,
      t('registration_payments_filter_all_schools', 'All schools')
    );
    buildFilterOptions(
      statusFilterEl,
      statusValues,
      t('registration_payments_filter_all_statuses', 'All statuses')
    );
  };

  const getFilteredPaymentRows = () => {
    if (!isOrganizer) {
      return paymentRows;
    }

    const selectedSchool = `${schoolFilterEl?.value ?? ''}`.trim();
    const selectedStatus = `${statusFilterEl?.value ?? ''}`.trim().toUpperCase();

    return paymentRows.filter((payment) => {
      if (selectedSchool && getPaymentSchoolName(payment) !== selectedSchool) {
        return false;
      }
      if (selectedStatus && getPaymentStatusValue(payment) !== selectedStatus) {
        return false;
      }
      return true;
    });
  };

  const createRowActionButton = ({ action, titleKey, titleFallback, className, icon, disabled = false }) => {
    const button = document.createElement('button');
    const title = t(titleKey, titleFallback);

    button.type = 'button';
    button.className = `btn btn-sm ${className}`;
    button.dataset.paymentAction = action;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.disabled = disabled;
    button.innerHTML = `<i class="bi ${icon}"></i>`;

    return button;
  };

  const renderPaymentsTable = () => {
    const rows = getFilteredPaymentRows();

    if (organizerCountEl) {
      organizerCountEl.textContent = `${rows.length}`;
    }
    if (schoolCountEl) {
      schoolCountEl.textContent = `${rows.length}`;
    }

    tableBody.innerHTML = '';
    if (!rows.length) {
      emptyEl.classList.remove('d-none');
      return;
    }

    emptyEl.classList.add('d-none');

    rows.forEach((payment) => {
      const row = document.createElement('tr');
      row.dataset.id = payment.id;

      if (isOrganizer) {
        const schoolCell = document.createElement('td');
        schoolCell.textContent = payment?.school_name || '-';
        row.appendChild(schoolCell);
      }

      const statusCell = document.createElement('td');
      const statusInfo = getPaymentStatusInfo(payment);
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge ${statusInfo.className}`;
      statusBadge.textContent = statusInfo.label;
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);

      const amountCell = document.createElement('td');
      amountCell.className = 'text-center';
      amountCell.textContent = formatRegistrationCurrency(payment?.amount);
      row.appendChild(amountCell);

      const createdAtCell = document.createElement('td');
      createdAtCell.className = 'text-center';
      createdAtCell.textContent = formatPaymentCreatedAt(payment?.created_at);
      row.appendChild(createdAtCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      actionsCell.setAttribute('data-tsv-ignore', 'true');

      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      if (isOrganizer) {
        actionGroup.appendChild(createRowActionButton({
          action: 'validate',
          titleKey: 'registration_payment_validate',
          titleFallback: 'Validate payment',
          className: 'btn-outline-success',
          icon: 'bi-check2-circle'
        }));
        actionGroup.appendChild(createRowActionButton({
          action: 'reject',
          titleKey: 'org_registrations_action_reject',
          titleFallback: 'Reject',
          className: 'btn-outline-danger',
          icon: 'bi-x-circle'
        }));
      }
      actionGroup.appendChild(createRowActionButton({
        action: 'view',
        titleKey: 'registration_payment_view_receipt',
        titleFallback: 'View receipt',
        className: 'btn-outline-primary',
        icon: 'bi-eye'
      }));
      actionGroup.appendChild(createRowActionButton({
        action: 'download',
        titleKey: 'registration_payment_download',
        titleFallback: 'Download receipt',
        className: 'btn-outline-dark',
        icon: 'bi-download'
      }));
      actionGroup.appendChild(createRowActionButton({
        action: 'delete',
        titleKey: 'registration_payment_remove',
        titleFallback: 'Delete receipt',
        className: 'btn-outline-danger',
        icon: 'bi-trash'
      }));

      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  };

  const fetchPaymentsTable = async (options = {}) => {
    const showError = options.showError === true;
    const eventIdValue = getEvent()?.id;
    if (!eventIdValue) {
      paymentRows = [];
      renderPaymentsTable();
      return;
    }

    const requestId = ++activeRequestId;

    try {
      const res = await fetch(buildPaymentsUrl());
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error || t('registration_payment_load_error', 'Error loading payment.'));
      }

      if (requestId !== activeRequestId) {
        return;
      }

      paymentRows = Array.isArray(data) ? data : [];
      renderOrganizerFilters();
      renderPaymentsTable();
    } catch (error) {
      if (requestId !== activeRequestId) {
        return;
      }

      paymentRows = [];
      renderOrganizerFilters();
      renderPaymentsTable();

      if (showError) {
        showMessageModal(
          error.message || t('registration_payment_load_error', 'Error loading payment.'),
          t('error_title', 'Error')
        );
      }
    }
  };

  const refreshPayments = (options = {}) => {
    renderSummary();

    if (options.refetchTable) {
      return fetchPaymentsTable({ showError: options.showError === true });
    }

    renderPaymentsTable();
    return Promise.resolve();
  };

  const submitCreatePayment = async () => {
    if (!createForm || !createAmountEl || !createFileEl || !createSaveBtn) {
      return;
    }

    createAmountEl.classList.remove('is-invalid');
    createFileEl.classList.remove('is-invalid');

    const amount = parseAmountToCents(createAmountEl.value);
    const file = createFileEl.files?.[0] || null;

    let hasErrors = false;
    if (amount === null) {
      createAmountEl.classList.add('is-invalid');
      hasErrors = true;
    }
    if (!isPdfFile(file)) {
      createFileEl.classList.add('is-invalid');
      hasErrors = true;
    }

    if (hasErrors) {
      createForm.classList.add('was-validated');
      return;
    }

    const { eventId, schoolId } = await getCreatePaymentContext();
    const formData = new FormData();
    formData.append('event_id', `${eventId}`);
    formData.append('school_id', `${schoolId}`);
    formData.append('amount', `${amount}`);
    formData.append('payment', file);

    createSaveBtn.disabled = true;
    createSaveBtn.textContent = t('saving', 'Saving...');

    try {
      const res = await fetch(`${API_BASE_URL}${paymentListEndpoint}`, {
        method: 'POST',
        body: formData
      });
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(
          data?.error
          || data?.message
          || t('registration_payment_save_error', 'Error saving payment.')
        );
      }

      createModal?.hide();
      resetCreatePaymentModal();
      await refreshPayments({ refetchTable: true, showError: false });
      showMessageModal(
        t('registration_payments_add_success', 'Payment uploaded successfully.'),
        t('success_title', 'Success'),
        'success'
      );
    } finally {
      if (createSaveBtn) {
        createSaveBtn.disabled = false;
        createSaveBtn.textContent = t('registration_payments_add', 'Add payment');
      }
    }
  };

  const showDeletePaymentConfirm = () => new Promise((resolve) => {
    if (!deleteModal || !deleteModalEl || !deleteConfirmBtn) {
      resolve(window.confirm(
        t('registration_payment_remove_confirm', 'Are you sure you want to delete the payment receipt?')
      ));
      return;
    }

    let resolved = false;
    const handleHidden = () => {
      if (!resolved) {
        resolve(false);
      }
    };

    deleteModalEl.addEventListener('hidden.bs.modal', handleHidden, { once: true });
    deleteConfirmBtn.onclick = () => {
      resolved = true;
      deleteModal.hide();
      resolve(true);
    };

    deleteModal.show();
  });

  const showValidatePaymentConfirm = () => new Promise((resolve) => {
    if (!validateModal || !validateModalEl || !validateConfirmBtn) {
      resolve(window.confirm('Are you sure you want to validate this payment?'));
      return;
    }

    let resolved = false;
    const handleHidden = () => {
      if (!resolved) {
        resolve(false);
      }
    };

    validateModalEl.addEventListener('hidden.bs.modal', handleHidden, { once: true });
    validateConfirmBtn.onclick = () => {
      resolved = true;
      validateModal.hide();
      resolve(true);
    };

    validateModal.show();
  });

  const showRejectPaymentConfirm = () => new Promise((resolve) => {
    if (!rejectModal || !rejectModalEl || !rejectConfirmBtn) {
      resolve(window.confirm('Are you sure you want to reject this payment?'));
      return;
    }

    let resolved = false;
    const handleHidden = () => {
      if (!resolved) {
        resolve(false);
      }
    };

    rejectModalEl.addEventListener('hidden.bs.modal', handleHidden, { once: true });
    rejectConfirmBtn.onclick = () => {
      resolved = true;
      rejectModal.hide();
      resolve(true);
    };

    rejectModal.show();
  });

  const updatePaymentStatusById = async (paymentId, action, triggerButton = null) => {
    if (!paymentId || !['validate', 'reject'].includes(action)) {
      return;
    }

    const shouldContinue = action === 'validate'
      ? await showValidatePaymentConfirm()
      : await showRejectPaymentConfirm();

    if (!shouldContinue) {
      return;
    }

    const originalHtml = triggerButton?.innerHTML || '';
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';
    }

    try {
      const res = await fetch(buildPaymentActionUrl(paymentId, action), {
        method: 'POST'
      });
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(
          data?.error
          || data?.message
          || (action === 'validate'
            ? t('registration_payment_validate_error', 'Error validating payment.')
            : t('org_registrations_reject_error_request', 'Error rejecting the registration.'))
        );
      }

      await refreshPayments({ refetchTable: true, showError: false });
      showMessageModal(
        data?.message || (
          action === 'validate'
            ? t('choreography_payment_validated', 'Payment validated successfully.')
            : t('payment_rejected', 'Payment rejected successfully.')
        ),
        t('success_title', 'Success'),
        'success'
      );
    } finally {
      if (triggerButton) {
        triggerButton.disabled = false;
        triggerButton.innerHTML = originalHtml;
      }
    }
  };

  const removePaymentById = async (paymentId, triggerButton = null) => {
    if (!paymentId) {
      return;
    }

    const shouldDelete = await showDeletePaymentConfirm();
    if (!shouldDelete) {
      return;
    }

    const originalHtml = triggerButton?.innerHTML || '';
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';
    }

    try {
      const res = await fetch(buildPaymentDeleteUrl(paymentId), {
        method: 'DELETE'
      });
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(
          data?.error
          || data?.message
          || t('registration_payment_remove_error', 'Error deleting payment.')
        );
      }

      await refreshPayments({ refetchTable: true, showError: false });
      showMessageModal(
        data?.message || t('payment_removed', 'Payment removed successfully.'),
        t('success_title', 'Success'),
        'success'
      );
    } finally {
      if (triggerButton) {
        triggerButton.disabled = false;
        triggerButton.innerHTML = originalHtml;
      }
    }
  };

  if (addPaymentBtn) {
    addPaymentBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        await getCreatePaymentContext();
        resetCreatePaymentModal();
        createModal?.show();
      } catch (error) {
        showMessageModal(
          error.message || t('registration_payment_load_error', 'Error loading payment.'),
          t('error_title', 'Error')
        );
      }
    });
  }

  createFileEl?.addEventListener('change', () => {
    const file = createFileEl.files?.[0] || null;
    createFileEl.classList.toggle('is-invalid', Boolean(file) && !isPdfFile(file));
    setCreateFileInfo(file && isPdfFile(file) ? file : null);
  });

  createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await submitCreatePayment();
    } catch (error) {
      showMessageModal(
        error.message || t('registration_payment_save_error', 'Error saving payment.'),
        t('error_title', 'Error')
      );
    }
  });

  createModalEl?.addEventListener('hidden.bs.modal', resetCreatePaymentModal);

  schoolFilterEl?.addEventListener('change', renderPaymentsTable);
  statusFilterEl?.addEventListener('change', renderPaymentsTable);
  clearFiltersBtn?.addEventListener('click', () => {
    if (schoolFilterEl) {
      schoolFilterEl.value = '';
    }
    if (statusFilterEl) {
      statusFilterEl.value = '';
    }
    renderPaymentsTable();
  });

  tableBody.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('button[data-payment-action]');
    if (!actionButton) {
      return;
    }

    event.preventDefault();

    const row = actionButton.closest('tr');
    const paymentId = row?.dataset?.id;
    const action = actionButton.dataset.paymentAction;

    if (action === 'view' && paymentId) {
      openActionUrl(buildPaymentActionUrl(paymentId, 'view'), { newTab: true });
      return;
    }

    if (action === 'download' && paymentId) {
      openActionUrl(buildPaymentActionUrl(paymentId, 'download'));
      return;
    }

    if (action === 'validate' && paymentId) {
      try {
        await updatePaymentStatusById(paymentId, 'validate', actionButton);
      } catch (error) {
        showMessageModal(
          error.message || t('registration_payment_validate_error', 'Error validating payment.'),
          t('error_title', 'Error')
        );
      }
      return;
    }

    if (action === 'reject' && paymentId) {
      try {
        await updatePaymentStatusById(paymentId, 'reject', actionButton);
      } catch (error) {
        showMessageModal(
          error.message || t('org_registrations_reject_error_request', 'Error rejecting the registration.'),
          t('error_title', 'Error')
        );
      }
      return;
    }

    if (action === 'delete' && paymentId) {
      try {
        await removePaymentById(paymentId, actionButton);
      } catch (error) {
        showMessageModal(
          error.message || t('registration_payment_remove_error', 'Error deleting payment.'),
          t('error_title', 'Error')
        );
      }
    }
  });

  window.addEventListener('registration:participants-updated', () => {
    renderSummary();
  });
  window.addEventListener('registration:config-updated', () => {
    renderSummary();
  });
  window.addEventListener('registration:school-registrations-updated', () => {
    refreshPayments({ refetchTable: true, showError: false });
  });
  window.addEventListener('registration:organizer-registrations-updated', () => {
    refreshPayments({ refetchTable: true, showError: false });
  });
  window.addEventListener('registration:panel-changed', (event) => {
    if (event?.detail?.key === 'payments') {
      refreshPayments({ refetchTable: true, showError: true });
    }
  });

  const languageObserver = new MutationObserver(() => {
    renderSummary();
    renderOrganizerFilters();
    renderPaymentsTable();
  });
  languageObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang']
  });

  window.addEventListener('beforeunload', () => {
    languageObserver.disconnect();
  });

  renderSummary();
  fetchPaymentsTable({ showError: false });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await WaitEventLoaded();
    await ensureTranslationsReady();
  } catch (error) {
    // Keep the payments tab functional even if bootstrap loading fails.
  }

  const user = getUserFromToken();
  const role = typeof getRegistrationRole === 'function'
    ? getRegistrationRole(user)
    : `${user?.role || ''}`.toLowerCase();

  initPaymentsTab(role);
});
