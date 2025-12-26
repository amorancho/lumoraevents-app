const SIGNUP_ENDPOINT = `${API_BASE_URL}/api/schools`;

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();

  const form = document.getElementById('signupForm');
  const cancelLink = document.getElementById('cancelLink');
  const submitBtn = document.getElementById('signupSubmit');

  if (cancelLink) {
    cancelLink.href = `registrationhome.html?eventId=${encodeURIComponent(eventId)}`;
  }

  const countrySelect = document.getElementById('signupCountry');
  if (countrySelect && Array.isArray(countries)) {
    countries.forEach(c => {
      const option = document.createElement('option');
      option.value = c.code;
      option.textContent = `${c.code} - ${c.name}`;
      countrySelect.appendChild(option);
    });

    new TomSelect('#signupCountry', {
      maxOptions: 200,
      placeholder: 'Type to search...',
      allowEmptyOption: true
    });
  }

  const languageSelect = document.getElementById('signupLanguage');
  if (languageSelect && getEvent() && getEvent().language) {
    languageSelect.value = getEvent().language;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    if (!SIGNUP_ENDPOINT) {
      showMessageModal(t('signup_api_missing', 'Signup API not configured.'), t('error_title', 'Error'));
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = t('saving', 'Saving...');

    const payload = {
      name: document.getElementById('signupName').value.trim(),
      username: `sch_${document.getElementById('signupUsername').value.trim()}`,
      language: document.getElementById('signupLanguage').value,
      email: document.getElementById('signupEmail').value.trim(),
      city: document.getElementById('signupCity').value.trim(),
      country: document.getElementById('signupCountry').value,
      phone: document.getElementById('signupPhone').value.trim(),
      representative: document.getElementById('signupRepresentative').value.trim(),
      event_id: getEvent()?.id
    };

    try {
      const res = await fetch(SIGNUP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        console.error('Signup error data:', errData);
        throw new Error(errData.error || t('signup_error_generic', 'Error creating the account.'));
      }

      showSuccessAndRedirect(
        t('signup_success', 'Account created. Check your email for credentials.'),
        t('success_title', 'Success'),
        `registrationhome.html?eventId=${encodeURIComponent(eventId)}`
      );
    } catch (err) {
      showMessageModal(err.message || t('signup_error_generic', 'Error creating the account.'), t('error_title', 'Error'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
});

function showSuccessAndRedirect(message, title, redirectUrl) {
  const modalEl = document.getElementById('messageModal');
  if (!modalEl) {
    alert(message);
    window.location.href = redirectUrl;
    return;
  }

  const modalLabel = document.getElementById('messageModalLabel');
  const modalBody = document.getElementById('messageModalBody');
  const modalHeader = modalEl.querySelector('.modal-header');
  if (modalLabel) modalLabel.textContent = title;
  if (modalBody) modalBody.textContent = message;
  if (modalHeader) {
    modalHeader.classList.remove('bg-danger');
    modalHeader.classList.add('bg-success', 'text-white');
  }

  const handler = () => {
    modalEl.removeEventListener('hidden.bs.modal', handler);
    if (modalHeader) {
      modalHeader.classList.remove('bg-success');
      modalHeader.classList.add('bg-danger');
    }
    window.location.href = redirectUrl;
  };

  modalEl.addEventListener('hidden.bs.modal', handler);
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}
