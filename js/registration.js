document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();
  setupRegistrationTabs();
  initSchoolTab();
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
      const res = await fetch(`${API_BASE_URL}/api/schools/${user.id}`);
      if (!res.ok) {
        throw new Error(t('registration_school_load_error', 'Error loading school data.'));
      }

      schoolRecord = await res.json();
      if (!schoolRecord) {
        throw new Error(t('registration_school_load_error', 'Error loading school data.'));
      }


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
