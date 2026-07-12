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
  const countEl = document.getElementById('registrationPaymentsCount');
  const schoolHeader = document.getElementById('registrationPaymentsSchoolHeader');
  const copyTsvBtn = document.getElementById('registrationPaymentsCopyTsvBtn');

  if (!tableBody || !emptyEl) {
    return;
  }

  if (schoolHeader) {
    schoolHeader.classList.toggle('d-none', !isOrganizer);
  }

  if (copyTsvBtn && typeof bindTableTsvExportButton === 'function') {
    bindTableTsvExportButton(copyTsvBtn, tableBody);
  }

  const paymentEndpoints = {
    view: (id) => `/api/registrations/choreographies/${id}/payment/view`,
    download: (id) => `/api/registrations/choreographies/${id}/payment/download`,
    validate: (id) => `/api/registrations/choreographies/${id}/payment/validate`
  };

  const getCategoryById = () => new Map(
    (Array.isArray(registrationState.registrationCategories) ? registrationState.registrationCategories : [])
      .map((item) => [`${item.id}`, item])
  );

  const getStyleById = () => new Map(
    (Array.isArray(registrationState.registrationDisciplines) ? registrationState.registrationDisciplines : [])
      .map((item) => [`${item.id}`, item])
  );

  const formatInteger = (value) => new Intl.NumberFormat(getRegistrationLanguage()).format(Number(value) || 0);

  const safeJson = async (res) => {
    try {
      return await res.json();
    } catch (error) {
      return null;
    }
  };

  const buildActionUrl = (endpoint) => {
    const eventIdValue = getEvent()?.id;
    return eventIdValue
      ? `${API_BASE_URL}${endpoint}?event_id=${encodeURIComponent(eventIdValue)}`
      : `${API_BASE_URL}${endpoint}`;
  };

  const openActionUrl = (url, options = {}) => {
    if (!url) return;
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

  const getRoleRegistrations = () => {
    const registrations = isOrganizer
      ? registrationState.organizerRegistrations
      : registrationState.registrations;
    return Array.isArray(registrations) ? registrations : [];
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

  const getSchoolName = (registration) => registration?.school_name || registration?.school?.name || '-';

  const getRegistrationName = (registration) => registration?.name || registration?.choreography || '-';

  const getCategoryName = (registration, categoryById) => {
    const categoryId = getRegistrationCategoryIdValue(registration);
    return registration?.category_name
      || categoryById.get(`${categoryId}`)?.name
      || registration?.reg_category?.name
      || registration?.category?.name
      || '-';
  };

  const getStyleName = (registration, styleById) => {
    const styleId = registration?.reg_style_id
      ?? registration?.style_id
      ?? registration?.reg_style?.id
      ?? registration?.reg_style;

    return registration?.style_name
      || styleById.get(`${styleId}`)?.name
      || registration?.reg_style?.name
      || registration?.style?.name
      || '-';
  };

  const getPaymentSortWeight = (registration) => {
    if (isRegistrationFlagEnabled(registration?.payment_validated)) return 2;
    if (isRegistrationFlagEnabled(registration?.has_payment)) return 1;
    return 0;
  };

  const sortRegistrations = (registrations) => {
    const locale = getRegistrationLanguage();
    return [...registrations].sort((a, b) => {
      const paymentDiff = getPaymentSortWeight(a) - getPaymentSortWeight(b);
      if (paymentDiff !== 0) return paymentDiff;

      const schoolDiff = getSchoolName(a).localeCompare(getSchoolName(b), locale, { sensitivity: 'base' });
      if (schoolDiff !== 0) return schoolDiff;

      return getRegistrationName(a).localeCompare(getRegistrationName(b), locale, { sensitivity: 'base' });
    });
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

  const createActionButton = ({ className, icon, title, action, registrationId, disabled = false }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${className}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.dataset.paymentAction = action;
    button.dataset.id = registrationId;
    button.disabled = disabled;
    button.innerHTML = `<i class="bi ${icon}"></i>`;
    return button;
  };

  const renderPayments = () => {
    const categoryById = getCategoryById();
    const styleById = getStyleById();
    const registrations = sortRegistrations(getRoleRegistrations());
    const metrics = buildMetrics(registrations);

    updateSummary(metrics);

    if (countEl) {
      countEl.textContent = `${registrations.length}`;
    }

    tableBody.innerHTML = '';
    if (!registrations.length) {
      emptyEl.classList.remove('d-none');
      return;
    }

    emptyEl.classList.add('d-none');

    const viewTitle = t('registration_payment_view_receipt', 'View receipt');
    const downloadTitle = t('registration_payment_download', 'Download receipt');
    const validateTitle = t('registration_payment_validate', 'Validate payment');

    registrations.forEach((registration) => {
      const row = document.createElement('tr');
      row.dataset.id = registration.id;

      if (isOrganizer) {
        const schoolCell = document.createElement('td');
        schoolCell.textContent = getSchoolName(registration);
        row.appendChild(schoolCell);
      }

      const nameCell = document.createElement('td');
      const nameWrap = document.createElement('div');
      nameWrap.className = 'fw-semibold';
      nameWrap.textContent = getRegistrationName(registration);
      nameCell.appendChild(nameWrap);
      row.appendChild(nameCell);

      const categoryCell = document.createElement('td');
      categoryCell.textContent = getCategoryName(registration, categoryById);
      row.appendChild(categoryCell);

      const styleCell = document.createElement('td');
      styleCell.textContent = getStyleName(registration, styleById);
      row.appendChild(styleCell);

      const participantsCell = document.createElement('td');
      participantsCell.className = 'text-center';
      participantsCell.textContent = `${getRegistrationParticipantsTotal(registration)}`;
      row.appendChild(participantsCell);

      const amountCell = document.createElement('td');
      amountCell.className = 'text-center';
      amountCell.textContent = formatRegistrationCurrency(
        getRegistrationTotalAmountValue(registration, { categoryById })
      );
      row.appendChild(amountCell);

      const paymentCell = document.createElement('td');
      paymentCell.className = 'text-center';
      const paymentInfo = getRegistrationPaymentBadgeInfo(registration);
      const paymentBadge = document.createElement('span');
      paymentBadge.className = `badge ${paymentInfo.className}`;
      paymentBadge.textContent = paymentInfo.label;
      paymentCell.appendChild(paymentBadge);
      row.appendChild(paymentCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'text-center';
      actionsCell.setAttribute('data-tsv-ignore', 'true');

      const actionGroup = document.createElement('div');
      actionGroup.className = 'btn-group';
      actionGroup.setAttribute('role', 'group');

      const hasPayment = isRegistrationFlagEnabled(registration?.has_payment);
      const isValidated = isRegistrationFlagEnabled(registration?.payment_validated);

      actionGroup.appendChild(createActionButton({
        className: 'btn-outline-primary',
        icon: 'bi-eye',
        title: viewTitle,
        action: 'view',
        registrationId: registration.id,
        disabled: !hasPayment
      }));
      actionGroup.appendChild(createActionButton({
        className: 'btn-outline-dark',
        icon: 'bi-download',
        title: downloadTitle,
        action: 'download',
        registrationId: registration.id,
        disabled: !hasPayment
      }));

      if (isOrganizer) {
        actionGroup.appendChild(createActionButton({
          className: 'btn-outline-success',
          icon: 'bi-check2-circle',
          title: validateTitle,
          action: 'validate',
          registrationId: registration.id,
          disabled: !hasPayment || isValidated
        }));
      }

      actionsCell.appendChild(actionGroup);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  };

  const validatePayment = async (button, registrationId) => {
    if (!registrationId || !isOrganizer) {
      return;
    }

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>';

    try {
      const res = await fetch(buildActionUrl(paymentEndpoints.validate(registrationId)), { method: 'POST' });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || t('registration_payment_validate_error', 'Error validating payment.'));
      }

      await fetchOrganizerRegistrationsForEvent();
      notifyOrganizerRegistrationsUpdate();
      renderPayments();
    } catch (error) {
      showMessageModal(
        error.message || t('registration_payment_validate_error', 'Error validating payment.'),
        t('error_title', 'Error')
      );
    } finally {
      button.innerHTML = originalHtml;
      renderPayments();
    }
  };

  tableBody.addEventListener('click', (event) => {
    const actionButton = event.target.closest('button[data-payment-action]');
    if (!actionButton || actionButton.disabled) {
      return;
    }

    const registrationId = actionButton.dataset.id;
    const action = actionButton.dataset.paymentAction;

    if (action === 'view') {
      openActionUrl(buildActionUrl(paymentEndpoints.view(registrationId)), { newTab: true });
      return;
    }

    if (action === 'download') {
      openActionUrl(buildActionUrl(paymentEndpoints.download(registrationId)));
      return;
    }

    if (action === 'validate') {
      validatePayment(actionButton, registrationId);
    }
  });

  window.addEventListener('registration:participants-updated', renderPayments);
  window.addEventListener('registration:config-updated', renderPayments);
  window.addEventListener('registration:school-registrations-updated', renderPayments);
  window.addEventListener('registration:organizer-registrations-updated', renderPayments);
  window.addEventListener('registration:panel-changed', (event) => {
    if (event?.detail?.key === 'payments') {
      renderPayments();
    }
  });

  const languageObserver = new MutationObserver(() => {
    renderPayments();
  });
  languageObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang']
  });

  window.addEventListener('beforeunload', () => {
    languageObserver.disconnect();
  });

  renderPayments();
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
