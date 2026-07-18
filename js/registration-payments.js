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
  const paymentListEndpoint = '/api/registrations/payments';

  const summaryElements = {
    feeValue: document.getElementById('registrationPaymentsFeeValue'),
    feeMeta: document.getElementById('registrationPaymentsFeeMeta'),
    amountValue: document.getElementById('registrationPaymentsAmountValue'),
    amountMeta: document.getElementById('registrationPaymentsAmountMeta'),
    paidValue: document.getElementById('registrationPaymentsPaidValue'),
    paidMeta: document.getElementById('registrationPaymentsPaidMeta'),
    invoicedValue: document.getElementById('registrationPaymentsInvoicedValue'),
    invoicedMeta: document.getElementById('registrationPaymentsInvoicedMeta'),
    pendingValue: document.getElementById('registrationPaymentsPendingValue')
  };

  const sharedFilterElements = {
    organizerWrap: document.getElementById('registrationPaymentsSharedOrganizerFilter'),
    schoolFilterEl: document.getElementById('registrationPaymentsSharedSchoolFilter'),
    clearFiltersBtn: document.getElementById('registrationPaymentsSharedFilterClear')
  };

  const paymentElements = {
    tableBody: document.getElementById('registrationPaymentsTable'),
    emptyEl: document.getElementById('registrationPaymentsEmpty'),
    organizerCountEl: document.getElementById('registrationPaymentsCount'),
    schoolCountEl: document.getElementById('registrationPaymentsCountSchool'),
    schoolHeader: document.getElementById('registrationPaymentsSchoolHeader'),
    copyTsvBtn: document.getElementById('registrationPaymentsCopyTsvBtn'),
    copyTsvBtnSchool: document.getElementById('registrationPaymentsCopyTsvBtnSchool'),
    addBtn: document.getElementById('registrationPaymentsAddBtn'),
    organizerHeader: document.getElementById('registrationPaymentsOrganizerHeader'),
    organizerCountWrap: document.getElementById('registrationPaymentsOrganizerCountWrap'),
    schoolActions: document.getElementById('registrationPaymentsSchoolActions'),
    statusFilterEl: document.getElementById('registrationPaymentsStatusFilter'),
    clearFiltersBtn: document.getElementById('registrationPaymentsFilterClear')
  };

  const invoiceElements = {
    tableBody: document.getElementById('registrationInvoicesTable'),
    emptyEl: document.getElementById('registrationInvoicesEmpty'),
    countEl: document.getElementById('registrationInvoicesCount'),
    schoolHeader: document.getElementById('registrationInvoicesSchoolHeader'),
    copyTsvBtn: document.getElementById('registrationInvoicesCopyTsvBtn'),
    copyTsvBtnSchool: document.getElementById('registrationInvoicesCopyTsvBtnSchool'),
    addBtn: document.getElementById('registrationInvoicesAddBtn'),
    organizerHeader: document.getElementById('registrationInvoicesOrganizerHeader'),
    actions: document.getElementById('registrationInvoicesActions')
  };

  const createModalEl = document.getElementById('registrationPaymentsCreateModal');
  const createForm = document.getElementById('registrationPaymentsCreateForm');
  const createModalTitleEl = document.getElementById('registrationPaymentsCreateModalTitle');
  const createSchoolFieldEl = document.getElementById('registrationPaymentsCreateSchoolField');
  const createSchoolSelectEl = document.getElementById('registrationPaymentsCreateSchoolSelect');
  const createAmountEl = document.getElementById('registrationPaymentsCreateAmount');
  const createFileEl = document.getElementById('registrationPaymentsCreateFile');
  const createFileInfoEl = document.getElementById('registrationPaymentsCreateFileInfo');
  const createFileNameEl = document.getElementById('registrationPaymentsCreateFileName');
  const createFileSizeEl = document.getElementById('registrationPaymentsCreateFileSize');
  const createSaveBtn = document.getElementById('registrationPaymentsCreateSaveBtn');

  const deleteModalEl = document.getElementById('registrationPaymentsDeleteModal');
  const deleteTitleEl = document.getElementById('registrationPaymentsDeleteTitle');
  const deleteMessageEl = document.getElementById('registrationPaymentsDeleteMessage');
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

  if (!paymentElements.tableBody || !paymentElements.emptyEl || !invoiceElements.tableBody || !invoiceElements.emptyEl) {
    return;
  }

  if (paymentElements.schoolHeader) {
    paymentElements.schoolHeader.classList.toggle('d-none', !isOrganizer);
  }
  if (paymentElements.addBtn) {
    paymentElements.addBtn.classList.toggle('d-none', isOrganizer);
  }
  if (paymentElements.organizerHeader) {
    paymentElements.organizerHeader.classList.toggle('d-none', !isOrganizer);
  }
  if (paymentElements.organizerCountWrap) {
    paymentElements.organizerCountWrap.classList.toggle('d-none', !isOrganizer);
  }
  if (paymentElements.schoolActions) {
    paymentElements.schoolActions.classList.toggle('d-none', isOrganizer);
  }
  if (sharedFilterElements.organizerWrap) {
    sharedFilterElements.organizerWrap.classList.toggle('d-none', !isOrganizer);
  }

  if (invoiceElements.schoolHeader) {
    invoiceElements.schoolHeader.classList.toggle('d-none', !isOrganizer);
  }
  if (invoiceElements.organizerHeader) {
    invoiceElements.organizerHeader.classList.add('d-none');
  }
  if (invoiceElements.actions) {
    invoiceElements.actions.classList.remove('d-none');
    invoiceElements.actions.classList.add('w-100');
  }
  if (invoiceElements.addBtn) {
    invoiceElements.addBtn.classList.toggle('d-none', !isOrganizer);
  }
  if (invoiceElements.copyTsvBtn) {
    invoiceElements.copyTsvBtn.classList.toggle('d-none', !isOrganizer);
  }
  if (invoiceElements.copyTsvBtnSchool) {
    invoiceElements.copyTsvBtnSchool.classList.toggle('d-none', isOrganizer);
  }

  if (paymentElements.copyTsvBtn && typeof bindTableTsvExportButton === 'function') {
    bindTableTsvExportButton(paymentElements.copyTsvBtn, paymentElements.tableBody);
  }
  if (paymentElements.copyTsvBtnSchool && typeof bindTableTsvExportButton === 'function') {
    bindTableTsvExportButton(paymentElements.copyTsvBtnSchool, paymentElements.tableBody);
  }
  if (invoiceElements.copyTsvBtn && typeof bindTableTsvExportButton === 'function') {
    bindTableTsvExportButton(invoiceElements.copyTsvBtn, invoiceElements.tableBody);
  }
  if (invoiceElements.copyTsvBtnSchool && typeof bindTableTsvExportButton === 'function') {
    bindTableTsvExportButton(invoiceElements.copyTsvBtnSchool, invoiceElements.tableBody);
  }

  let paymentRows = [];
  let invoiceRows = [];
  let activeDocumentsRequestId = 0;
  let activeCreateDocumentType = 'PAY';
  let activeDeleteDocumentType = 'PAY';

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

  const getRegisteredParticipantsCount = (registrations, options = {}) => {
    const relevantRegistrations = options.validatedOnly
      ? (Array.isArray(registrations) ? registrations : []).filter((registration) => isRegistrationValidated(registration))
      : (Array.isArray(registrations) ? registrations : []);
    const participants = Array.isArray(options.participants)
      ? options.participants
      : (Array.isArray(registrationState.participants) ? registrationState.participants : []);

    if (!options.validatedOnly && participants.length) {
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
    relevantRegistrations.forEach((registration) => {
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

    return relevantRegistrations.reduce(
      (sum, registration) => sum + getRegistrationParticipantsTotal(registration),
      0
    );
  };

  const buildMetrics = () => {
    const registrations = getFilteredRegistrations();
    const validatedRegistrations = registrations.filter((registration) => isRegistrationValidated(registration));
    const categoryById = getCategoryById();
    const finance = buildRegistrationFinanceMetrics(registrations, {
      categoryById,
      validatedOnly: true
    });
    const registeredParticipantsCount = getRegisteredParticipantsCount(validatedRegistrations, {
      validatedOnly: true,
      participants: getFilteredParticipants()
    });
    const registrationFeeCost = normalizeRegistrationNumber(getEvent()?.registrationFeeCost) ?? 0;
    const totalFee = registrationFeeCost * registeredParticipantsCount;
    const validatedPayments = getSchoolScopedPaymentRows().filter(
      (payment) => getPaymentStatusValue(payment) === 'VAL'
    );
    const invoices = getSchoolScopedInvoiceRows();
    const totalPaidAmount = validatedPayments.reduce(
      (sum, payment) => sum + getDocumentAmountValue(payment),
      0
    );
    const totalInvoicedAmount = invoices.reduce(
      (sum, invoice) => sum + getDocumentAmountValue(invoice),
      0
    );
    const pendingAmount = totalFee + finance.totalAmount - totalPaidAmount;

    return {
      finance,
      registeredParticipantsCount,
      totalFee,
      totalPaidAmount,
      validatedPaymentsCount: validatedPayments.length,
      totalInvoicedAmount,
      totalInvoicesCount: invoices.length,
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
      summaryElements.paidValue.textContent = formatRegistrationCurrency(metrics.totalPaidAmount);
    }
    if (summaryElements.paidMeta) {
      summaryElements.paidMeta.textContent = `${formatInteger(metrics.validatedPaymentsCount)} ${t('registration_payments_validated', 'Validated payments')}`;
    }
    if (summaryElements.invoicedValue) {
      summaryElements.invoicedValue.textContent = formatRegistrationCurrency(metrics.totalInvoicedAmount);
    }
    if (summaryElements.invoicedMeta) {
      summaryElements.invoicedMeta.textContent = `${formatInteger(metrics.totalInvoicesCount)} ${t('registration_tab_invoices', 'Invoices')}`;
    }
    if (summaryElements.pendingValue) {
      summaryElements.pendingValue.textContent = formatRegistrationCurrency(metrics.pendingAmount);
    }
  };

  const renderSummary = () => {
    updateSummary(buildMetrics());
  };

  const getDocumentMessages = (documentType) => {
    if (documentType === 'INV') {
      return {
        addAction: t('registration_invoices_add', 'Add invoice'),
        addTitle: t('registration_invoices_add_modal_title', 'Add invoice'),
        addSuccess: t('registration_invoices_add_success', 'Invoice uploaded successfully.'),
        loadError: t('registration_invoices_load_error', 'Error loading invoices.'),
        saveError: t('registration_invoices_save_error', 'Error saving invoice.'),
        removeError: t('registration_invoice_remove_error', 'Error deleting invoice.'),
        removeConfirm: t('registration_invoice_remove_confirm', 'Are you sure you want to delete the invoice?'),
        removeTitle: t('registration_invoice_remove', 'Delete invoice'),
        removeSuccess: t('registration_invoices_remove_success', 'Invoice deleted successfully.'),
        schoolRequired: t('registration_invoices_school_required', 'Select a school.')
      };
    }

    return {
      addAction: t('registration_payments_add', 'Add payment'),
      addTitle: t('registration_payments_add_modal_title', 'Add payment'),
      addSuccess: t('registration_payments_add_success', 'Payment uploaded successfully.'),
      loadError: t('registration_payment_load_error', 'Error loading payment.'),
      saveError: t('registration_payment_save_error', 'Error saving payment.'),
      removeError: t('registration_payment_remove_error', 'Error deleting payment.'),
      removeConfirm: t('registration_payment_remove_confirm', 'Are you sure you want to delete the payment receipt?'),
      removeTitle: t('registration_payment_remove', 'Delete receipt'),
      removeSuccess: t('payment_removed', 'Payment removed successfully.'),
      schoolRequired: ''
    };
  };

  const getSchoolLabel = (school) => `${school?.name ?? school?.school_name ?? ''}`.trim();
  const getRegistrationSchoolId = (registration) => `${registration?.school_id ?? registration?.school?.id ?? ''}`.trim();
  const getRegistrationSchoolName = (registration) => `${registration?.school_name ?? registration?.school?.name ?? ''}`.trim();
  const getPaymentSchoolName = (payment) => `${payment?.school_name ?? ''}`.trim();
  const getPaymentSchoolId = (payment) => `${payment?.school_id ?? ''}`.trim();
  const getPaymentStatusValue = (payment) => `${payment?.status ?? ''}`.trim().toUpperCase();
  const getDocumentAmountValue = (document) => normalizeRegistrationNumber(document?.amount) ?? 0;
  const normalizeSchoolNameKey = (value) => `${value ?? ''}`.trim().toLocaleLowerCase(getRegistrationLanguage());

  const encodeSchoolFilterValue = (schoolId, schoolName) => {
    const normalizedId = `${schoolId ?? ''}`.trim();
    if (normalizedId) {
      return `id:${normalizedId}`;
    }

    const normalizedName = `${schoolName ?? ''}`.trim();
    if (normalizedName) {
      return `name:${normalizedName}`;
    }

    return '';
  };

  const decodeSchoolFilterValue = (value) => {
    const rawValue = `${value ?? ''}`.trim();
    if (!rawValue) {
      return null;
    }

    const separatorIndex = rawValue.indexOf(':');
    if (separatorIndex === -1) {
      return {
        type: 'id',
        value: rawValue
      };
    }

    return {
      type: rawValue.slice(0, separatorIndex),
      value: rawValue.slice(separatorIndex + 1)
    };
  };

  const getKnownSchoolNameById = (schoolId) => {
    const normalizedId = `${schoolId ?? ''}`.trim();
    if (!normalizedId) {
      return '';
    }

    const schoolSources = [
      {
        items: Array.isArray(registrationState.schools) ? registrationState.schools : [],
        getId: (item) => `${item?.id ?? ''}`.trim(),
        getName: (item) => getSchoolLabel(item)
      },
      {
        items: getRoleRegistrations(),
        getId: (item) => getRegistrationSchoolId(item),
        getName: (item) => getRegistrationSchoolName(item)
      },
      {
        items: paymentRows,
        getId: (item) => getPaymentSchoolId(item),
        getName: (item) => getPaymentSchoolName(item)
      },
      {
        items: invoiceRows,
        getId: (item) => getPaymentSchoolId(item),
        getName: (item) => getPaymentSchoolName(item)
      }
    ];

    for (const source of schoolSources) {
      for (const item of source.items) {
        if (source.getId(item) !== normalizedId) {
          continue;
        }

        const label = source.getName(item);
        if (label) {
          return label;
        }
      }
    }

    return '';
  };

  const getSelectedSchoolFilter = () => {
    if (!isOrganizer) {
      return null;
    }

    return decodeSchoolFilterValue(sharedFilterElements.schoolFilterEl?.value);
  };

  const getSelectedSchoolFilterId = () => {
    const selectedSchool = getSelectedSchoolFilter();
    return selectedSchool?.type === 'id' ? selectedSchool.value : '';
  };

  const matchesSelectedSchool = (schoolId, schoolName) => {
    const selectedSchool = getSelectedSchoolFilter();
    if (!selectedSchool) {
      return true;
    }

    const normalizedId = `${schoolId ?? ''}`.trim();
    const normalizedName = `${schoolName ?? ''}`.trim();

    if (selectedSchool.type === 'id') {
      if (normalizedId) {
        return normalizedId === selectedSchool.value;
      }

      const knownSelectedName = getKnownSchoolNameById(selectedSchool.value);
      return Boolean(
        normalizedName
        && knownSelectedName
        && normalizeSchoolNameKey(normalizedName) === normalizeSchoolNameKey(knownSelectedName)
      );
    }

    return Boolean(
      normalizedName
      && normalizeSchoolNameKey(normalizedName) === normalizeSchoolNameKey(selectedSchool.value)
    );
  };

  const collectSchoolFilterValues = () => {
    const schoolMap = new Map();
    const locale = getRegistrationLanguage();
    const addSchool = (schoolId, schoolName) => {
      const normalizedName = `${schoolName ?? ''}`.trim();
      const value = encodeSchoolFilterValue(schoolId, normalizedName);
      const label = normalizedName || getKnownSchoolNameById(schoolId);
      if (!value || !label || schoolMap.has(value)) {
        return;
      }

      schoolMap.set(value, { value, label });
    };

    (Array.isArray(registrationState.schools) ? registrationState.schools : []).forEach((school) => {
      addSchool(school?.id, getSchoolLabel(school));
    });
    getRoleRegistrations().forEach((registration) => {
      addSchool(getRegistrationSchoolId(registration), getRegistrationSchoolName(registration));
    });
    paymentRows.forEach((payment) => {
      addSchool(getPaymentSchoolId(payment), getPaymentSchoolName(payment));
    });
    invoiceRows.forEach((invoice) => {
      addSchool(getPaymentSchoolId(invoice), getPaymentSchoolName(invoice));
    });

    return [...schoolMap.values()].sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: 'base' }));
  };

  const getFilteredRegistrations = () => {
    const registrations = getRoleRegistrations();
    if (!isOrganizer) {
      return registrations;
    }

    return registrations.filter((registration) => matchesSelectedSchool(
      getRegistrationSchoolId(registration),
      getRegistrationSchoolName(registration)
    ));
  };

  const getFilteredParticipants = () => {
    const participants = Array.isArray(registrationState.participants)
      ? registrationState.participants
      : [];
    if (!isOrganizer) {
      return participants;
    }

    return participants.filter((participant) => matchesSelectedSchool(
      getRegistrationSchoolId(participant),
      getRegistrationSchoolName(participant)
    ));
  };

  const getSchoolScopedPaymentRows = () => {
    if (!isOrganizer) {
      return paymentRows;
    }

    return paymentRows.filter((payment) => matchesSelectedSchool(
      getPaymentSchoolId(payment),
      getPaymentSchoolName(payment)
    ));
  };

  const getSchoolScopedInvoiceRows = () => {
    if (!isOrganizer) {
      return invoiceRows;
    }

    return invoiceRows.filter((invoice) => matchesSelectedSchool(
      getPaymentSchoolId(invoice),
      getPaymentSchoolName(invoice)
    ));
  };

  const getPaymentStatusInfo = (payment) => {
    const normalizedStatus = getPaymentStatusValue(payment);
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

  const buildDocumentListUrl = () => {
    const params = new URLSearchParams();
    const eventIdValue = getEvent()?.id;
    if (eventIdValue) {
      params.set('event_id', eventIdValue);
    }
    return `${API_BASE_URL}${paymentListEndpoint}?${params.toString()}`;
  };

  const buildDocumentActionUrl = (paymentId, action, documentType) => {
    if (!paymentId || !action) {
      return '';
    }

    const params = new URLSearchParams();
    const eventIdValue = getEvent()?.id;
    if (eventIdValue) {
      params.set('event_id', eventIdValue);
    }
    params.set('payment_type', documentType);

    return `${API_BASE_URL}${paymentListEndpoint}/${encodeURIComponent(paymentId)}/${action}?${params.toString()}`;
  };

  const buildDocumentDeleteUrl = (paymentId, documentType) => {
    if (!paymentId) {
      return '';
    }

    const params = new URLSearchParams();
    const eventIdValue = getEvent()?.id;
    if (eventIdValue) {
      params.set('event_id', eventIdValue);
    }
    params.set('payment_type', documentType);

    return `${API_BASE_URL}${paymentListEndpoint}/${encodeURIComponent(paymentId)}?${params.toString()}`;
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

  const renderSharedOrganizerFilters = () => {
    if (!isOrganizer) {
      return;
    }

    buildFilterOptions(
      sharedFilterElements.schoolFilterEl,
      collectSchoolFilterValues(),
      t('registration_payments_filter_all_schools', 'All schools')
    );
  };

  const renderPaymentOrganizerFilters = () => {
    if (!isOrganizer) {
      return;
    }

    const knownStatuses = ['PEN', 'VAL', 'REJ'];
    const dynamicStatuses = [...new Set(
      getSchoolScopedPaymentRows()
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
      paymentElements.statusFilterEl,
      statusValues,
      t('registration_payments_filter_all_statuses', 'All statuses')
    );
  };

  const getFilteredPaymentRows = () => {
    const rows = getSchoolScopedPaymentRows();
    const selectedStatus = `${paymentElements.statusFilterEl?.value ?? ''}`.trim().toUpperCase();

    return rows.filter((payment) => {
      if (selectedStatus && getPaymentStatusValue(payment) !== selectedStatus) {
        return false;
      }
      return true;
    });
  };

  const getFilteredInvoiceRows = () => {
    return getSchoolScopedInvoiceRows();
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

    if (paymentElements.organizerCountEl) {
      paymentElements.organizerCountEl.textContent = `${rows.length}`;
    }
    if (paymentElements.schoolCountEl) {
      paymentElements.schoolCountEl.textContent = `${rows.length}`;
    }

    paymentElements.tableBody.innerHTML = '';
    if (!rows.length) {
      paymentElements.emptyEl.classList.remove('d-none');
      return;
    }

    paymentElements.emptyEl.classList.add('d-none');

    rows.forEach((payment) => {
      const row = document.createElement('tr');
      row.dataset.id = payment.id;

      if (isOrganizer) {
        const schoolCell = document.createElement('td');
        schoolCell.textContent = payment.school_name || '-';
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
      amountCell.textContent = formatRegistrationCurrency(payment.amount);
      row.appendChild(amountCell);

      const createdAtCell = document.createElement('td');
      createdAtCell.className = 'text-center';
      createdAtCell.textContent = formatPaymentCreatedAt(payment.created_at);
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
      paymentElements.tableBody.appendChild(row);
    });
  };

  const renderInvoicesTable = () => {
    const rows = getFilteredInvoiceRows();

    if (invoiceElements.countEl) {
      invoiceElements.countEl.textContent = `${rows.length}`;
    }

    invoiceElements.tableBody.innerHTML = '';
    if (!rows.length) {
      invoiceElements.emptyEl.classList.remove('d-none');
      return;
    }

    invoiceElements.emptyEl.classList.add('d-none');

    rows.forEach((invoice) => {
      const row = document.createElement('tr');
      row.dataset.id = invoice.id;

      if (isOrganizer) {
        const schoolCell = document.createElement('td');
        schoolCell.textContent = invoice.school_name || '-';
        row.appendChild(schoolCell);
      }

      const amountCell = document.createElement('td');
      amountCell.className = 'text-center';
      amountCell.textContent = formatRegistrationCurrency(invoice.amount);
      row.appendChild(amountCell);

      const createdAtCell = document.createElement('td');
      createdAtCell.className = 'text-center';
      createdAtCell.textContent = formatPaymentCreatedAt(invoice.created_at);
      row.appendChild(createdAtCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      actionsCell.setAttribute('data-tsv-ignore', 'true');

      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      actionGroup.appendChild(createRowActionButton({
        action: 'view',
        titleKey: 'registration_invoice_view',
        titleFallback: 'View invoice',
        className: 'btn-outline-primary',
        icon: 'bi-eye'
      }));

      if (isOrganizer) {
        actionGroup.appendChild(createRowActionButton({
          action: 'download',
          titleKey: 'registration_invoice_download',
          titleFallback: 'Download invoice',
          className: 'btn-outline-dark',
          icon: 'bi-download'
        }));
        actionGroup.appendChild(createRowActionButton({
          action: 'delete',
          titleKey: 'registration_invoice_remove',
          titleFallback: 'Delete invoice',
          className: 'btn-outline-danger',
          icon: 'bi-trash'
        }));
      }

      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);
      invoiceElements.tableBody.appendChild(row);
    });
  };

  const applyDocumentRows = (rows) => {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    paymentRows = normalizedRows.filter((row) => row.payment_type === 'PAY');
    invoiceRows = normalizedRows.filter((row) => row.payment_type === 'INV');

    if (typeof registrationState === 'object' && registrationState) {
      registrationState.paymentDocuments = normalizedRows;
    }

    window.dispatchEvent(new CustomEvent('registration:payment-documents-updated', {
      detail: {
        rows: normalizedRows
      }
    }));
  };

  const renderDocumentTables = () => {
    renderSharedOrganizerFilters();
    renderPaymentOrganizerFilters();
    renderSummary();
    renderPaymentsTable();
    renderInvoicesTable();
  };

  const fetchDocumentTables = async (options = {}) => {
    const showError = options.showError === true;
    const eventIdValue = getEvent()?.id;
    if (!eventIdValue) {
      applyDocumentRows([]);
      renderDocumentTables();
      return;
    }

    const requestId = ++activeDocumentsRequestId;

    try {
      const res = await fetch(buildDocumentListUrl());
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error || getDocumentMessages('PAY').loadError);
      }

      if (requestId !== activeDocumentsRequestId) {
        return;
      }

      applyDocumentRows(Array.isArray(data) ? data : []);
      renderDocumentTables();
    } catch (error) {
      if (requestId !== activeDocumentsRequestId) {
        return;
      }

      applyDocumentRows([]);
      renderDocumentTables();

      if (showError) {
        showMessageModal(error.message || getDocumentMessages('PAY').loadError, t('error_title', 'Error'));
      }
    }
  };

  const refreshPayments = (options = {}) => {
    if (options.refetchTable) {
      return fetchDocumentTables({ showError: options.showError === true });
    }

    renderDocumentTables();
    return Promise.resolve();
  };

  const refreshInvoices = (options = {}) => {
    if (options.refetchTable) {
      return fetchDocumentTables({ showError: options.showError === true });
    }

    renderDocumentTables();
    return Promise.resolve();
  };

  const populateCreateSchoolOptions = async (selectedSchoolId = '') => {
    if (!createSchoolSelectEl) {
      return;
    }

    let schools = Array.isArray(registrationState.schools) ? registrationState.schools : [];
    if (!schools.length && typeof fetchEventSchools === 'function') {
      schools = await fetchEventSchools();
    }

    const locale = getRegistrationLanguage();
    const sortedSchools = [...schools].sort((a, b) => getSchoolLabel(a).localeCompare(getSchoolLabel(b), locale, { sensitivity: 'base' }));

    createSchoolSelectEl.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = t('registration_invoices_school_required', 'Select a school.');
    createSchoolSelectEl.appendChild(placeholderOption);

    sortedSchools.forEach((school) => {
      if (school?.id == null) {
        return;
      }

      const option = document.createElement('option');
      option.value = `${school.id}`;
      option.textContent = getSchoolLabel(school) || '-';
      createSchoolSelectEl.appendChild(option);
    });

    createSchoolSelectEl.value = selectedSchoolId && sortedSchools.some((school) => `${school.id}` === `${selectedSchoolId}`)
      ? `${selectedSchoolId}`
      : '';
  };

  const resetCreatePaymentModal = () => {
    createForm?.reset();
    createForm?.classList.remove('was-validated');
    createAmountEl?.classList.remove('is-invalid');
    createFileEl?.classList.remove('is-invalid');
    createSchoolSelectEl?.classList.remove('is-invalid');
    setCreateFileInfo(null);

    if (createSaveBtn) {
      createSaveBtn.disabled = false;
      createSaveBtn.textContent = getDocumentMessages(activeCreateDocumentType).addAction;
    }
  };

  const refreshCreateModalLabels = () => {
    const messages = getDocumentMessages(activeCreateDocumentType);

    if (createModalTitleEl) {
      createModalTitleEl.textContent = messages.addTitle;
    }
    if (createSaveBtn && !createSaveBtn.disabled) {
      createSaveBtn.textContent = messages.addAction;
    }
    if (activeCreateDocumentType === 'INV' && createSchoolSelectEl?.options?.length) {
      createSchoolSelectEl.options[0].textContent = messages.schoolRequired;
    }
  };

  const prepareCreateModal = async (documentType) => {
    activeCreateDocumentType = documentType;
    refreshCreateModalLabels();

    const showSchoolField = documentType === 'INV' && isOrganizer;
    if (createSchoolFieldEl) {
      createSchoolFieldEl.classList.toggle('d-none', !showSchoolField);
    }

    resetCreatePaymentModal();

    if (showSchoolField) {
      const selectedSchoolId = getSelectedSchoolFilterId();
      await populateCreateSchoolOptions(selectedSchoolId);
    } else if (createSchoolSelectEl) {
      createSchoolSelectEl.innerHTML = '';
    }
  };

  const getCreatePaymentContext = async (documentType) => {
    if (documentType === 'INV') {
      const eventIdValue = getEvent()?.id;
      if (!eventIdValue) {
        throw new Error(t('event_not_found', 'Event not found.'));
      }

      const schoolIdValue = `${createSchoolSelectEl?.value ?? ''}`.trim();
      if (!schoolIdValue) {
        createSchoolSelectEl?.classList.add('is-invalid');
        throw new Error(getDocumentMessages('INV').schoolRequired);
      }

      return {
        eventId: eventIdValue,
        schoolId: schoolIdValue
      };
    }

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

  const submitCreateDocument = async () => {
    if (!createForm || !createAmountEl || !createFileEl || !createSaveBtn) {
      return;
    }

    createAmountEl.classList.remove('is-invalid');
    createFileEl.classList.remove('is-invalid');
    createSchoolSelectEl?.classList.remove('is-invalid');

    const amount = parseAmountToCents(createAmountEl.value);
    const file = createFileEl.files?.[0] || null;
    const requiresSchool = activeCreateDocumentType === 'INV' && isOrganizer;
    const selectedSchoolId = `${createSchoolSelectEl?.value ?? ''}`.trim();

    let hasErrors = false;
    if (amount === null) {
      createAmountEl.classList.add('is-invalid');
      hasErrors = true;
    }
    if (!isPdfFile(file)) {
      createFileEl.classList.add('is-invalid');
      hasErrors = true;
    }
    if (requiresSchool && !selectedSchoolId) {
      createSchoolSelectEl?.classList.add('is-invalid');
      hasErrors = true;
    }

    if (hasErrors) {
      createForm.classList.add('was-validated');
      return;
    }

    const { eventId, schoolId } = await getCreatePaymentContext(activeCreateDocumentType);
    const formData = new FormData();
    formData.append('event_id', `${eventId}`);
    formData.append('school_id', `${schoolId}`);
    formData.append('amount', `${amount}`);
    formData.append('payment_type', activeCreateDocumentType);
    formData.append('payment', file);

    createSaveBtn.disabled = true;
    createSaveBtn.textContent = t('saving', 'Saving...');

    const messages = getDocumentMessages(activeCreateDocumentType);

    try {
      const res = await fetch(`${API_BASE_URL}${paymentListEndpoint}`, {
        method: 'POST',
        body: formData
      });
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error || data?.message || messages.saveError);
      }

      createModal?.hide();
      resetCreatePaymentModal();

      await fetchDocumentTables({ showError: false });

      showMessageModal(messages.addSuccess, t('success_title', 'Success'), 'success');
    } finally {
      if (createSaveBtn) {
        createSaveBtn.disabled = false;
        createSaveBtn.textContent = messages.addAction;
      }
    }
  };

  const applyDeleteModalText = (documentType) => {
    activeDeleteDocumentType = documentType;
    const messages = getDocumentMessages(documentType);

    if (deleteTitleEl) {
      deleteTitleEl.textContent = messages.removeTitle;
    }
    if (deleteMessageEl) {
      deleteMessageEl.textContent = messages.removeConfirm;
    }
  };

  const showDeleteDocumentConfirm = (documentType) => new Promise((resolve) => {
    const messages = getDocumentMessages(documentType);

    if (!deleteModal || !deleteModalEl || !deleteConfirmBtn) {
      resolve(window.confirm(messages.removeConfirm));
      return;
    }

    applyDeleteModalText(documentType);

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
      const res = await fetch(buildDocumentActionUrl(paymentId, action, 'PAY'), {
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

      await fetchDocumentTables({ showError: false });
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

  const removeDocumentById = async (paymentId, documentType, triggerButton = null) => {
    if (!paymentId) {
      return;
    }

    const shouldDelete = await showDeleteDocumentConfirm(documentType);
    if (!shouldDelete) {
      return;
    }

    const originalHtml = triggerButton?.innerHTML || '';
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';
    }

    const messages = getDocumentMessages(documentType);

    try {
      const res = await fetch(buildDocumentDeleteUrl(paymentId, documentType), {
        method: 'DELETE'
      });
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error || data?.message || messages.removeError);
      }

      await fetchDocumentTables({ showError: false });

      showMessageModal(
        data?.message || messages.removeSuccess,
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

  paymentElements.addBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      await getCreatePaymentContext('PAY');
      await prepareCreateModal('PAY');
      createModal?.show();
    } catch (error) {
      showMessageModal(error.message || getDocumentMessages('PAY').loadError, t('error_title', 'Error'));
    }
  });

  invoiceElements.addBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      await prepareCreateModal('INV');
      createModal?.show();
    } catch (error) {
      showMessageModal(error.message || getDocumentMessages('INV').loadError, t('error_title', 'Error'));
    }
  });

  createSchoolSelectEl?.addEventListener('change', () => {
    createSchoolSelectEl.classList.remove('is-invalid');
  });

  createFileEl?.addEventListener('change', () => {
    const file = createFileEl.files?.[0] || null;
    createFileEl.classList.toggle('is-invalid', Boolean(file) && !isPdfFile(file));
    setCreateFileInfo(file && isPdfFile(file) ? file : null);
  });

  createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await submitCreateDocument();
    } catch (error) {
      showMessageModal(
        error.message || getDocumentMessages(activeCreateDocumentType).saveError,
        t('error_title', 'Error')
      );
    }
  });

  createModalEl?.addEventListener('hidden.bs.modal', resetCreatePaymentModal);

  sharedFilterElements.schoolFilterEl?.addEventListener('change', renderDocumentTables);
  sharedFilterElements.clearFiltersBtn?.addEventListener('click', () => {
    if (sharedFilterElements.schoolFilterEl) {
      sharedFilterElements.schoolFilterEl.value = '';
    }
    renderDocumentTables();
  });

  paymentElements.statusFilterEl?.addEventListener('change', renderPaymentsTable);
  paymentElements.clearFiltersBtn?.addEventListener('click', () => {
    if (paymentElements.statusFilterEl) {
      paymentElements.statusFilterEl.value = '';
    }
    renderPaymentsTable();
  });

  paymentElements.tableBody.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('button[data-payment-action]');
    if (!actionButton) {
      return;
    }

    event.preventDefault();

    const row = actionButton.closest('tr');
    const paymentId = row?.dataset?.id;
    const action = actionButton.dataset.paymentAction;

    if (action === 'view' && paymentId) {
      openActionUrl(buildDocumentActionUrl(paymentId, 'view', 'PAY'), { newTab: true });
      return;
    }

    if (action === 'download' && paymentId) {
      openActionUrl(buildDocumentActionUrl(paymentId, 'download', 'PAY'));
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
        await removeDocumentById(paymentId, 'PAY', actionButton);
      } catch (error) {
        showMessageModal(
          error.message || getDocumentMessages('PAY').removeError,
          t('error_title', 'Error')
        );
      }
    }
  });

  invoiceElements.tableBody.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('button[data-payment-action]');
    if (!actionButton) {
      return;
    }

    event.preventDefault();

    const row = actionButton.closest('tr');
    const paymentId = row?.dataset?.id;
    const action = actionButton.dataset.paymentAction;

    if (action === 'view' && paymentId) {
      openActionUrl(buildDocumentActionUrl(paymentId, 'view', 'INV'), { newTab: true });
      return;
    }

    if (action === 'download' && paymentId) {
      openActionUrl(buildDocumentActionUrl(paymentId, 'download', 'INV'));
      return;
    }

    if (action === 'delete' && paymentId) {
      try {
        await removeDocumentById(paymentId, 'INV', actionButton);
      } catch (error) {
        showMessageModal(
          error.message || getDocumentMessages('INV').removeError,
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
    fetchDocumentTables({ showError: false });
  });
  window.addEventListener('registration:organizer-registrations-updated', () => {
    fetchDocumentTables({ showError: false });
  });
  window.addEventListener('registration:panel-changed', (event) => {
    if (event?.detail?.key === 'payments') {
      fetchDocumentTables({ showError: true });
    }
  });

  const languageObserver = new MutationObserver(() => {
    renderSharedOrganizerFilters();
    renderPaymentOrganizerFilters();
    renderSummary();
    renderPaymentsTable();
    renderInvoicesTable();

    if (createModalEl?.classList.contains('show')) {
      refreshCreateModalLabels();
    }
    if (deleteModalEl?.classList.contains('show')) {
      applyDeleteModalText(activeDeleteDocumentType);
    }
  });
  languageObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang']
  });

  window.addEventListener('beforeunload', () => {
    languageObserver.disconnect();
  });

  renderDocumentTables();
  fetchDocumentTables({ showError: false });
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
