async function loadLegalDocument() {
  const legalContent = document.getElementById('legalContent');
  const legalType = document.body.dataset.legalType;
  const storedLang = localStorage.getItem('lang') || 'en';
  const lang = storedLang === 'es' || storedLang === 'en' ? storedLang : 'en';

  document.documentElement.lang = lang;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/public/legal?type=${legalType}`,
      {
        headers: {
          'Accept-Language': lang
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Error ${response.status} loading ${legalType}`);
    }

    const data = await response.json();
    legalContent.classList.remove('legal-status', 'legal-status--error');
    legalContent.innerHTML = data.content || '';
  } catch (error) {
    console.error('Error loading legal document:', error);
    legalContent.classList.add('legal-status', 'legal-status--error');
    legalContent.textContent = 'Unable to load the legal document.';
  }
}

loadLegalDocument();
