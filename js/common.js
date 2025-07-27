const eventId = getEventIdFromUrl();
const API_BASE_URL = 'http://localhost:3000';

const eventObj = {
  id: eventId,
  name: "ETOILES D'ORIENT FESTIVAL 25",
  eventLogo: "https://www.forotic.es/wp-content/uploads/2025/05/logo-etoiles.png",
  eventUrl: "https://etoilesdorientfest.com",
  homeUrl: `index.html?eventId=${eventId}`
};

function getEventIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('eventId');
}

function getEvent() {
  return eventObj;
}

function setPageTitleAndLang(title, lang) {
  updateElementProperty('screen-title', 'textContent', title);
  updateFlag(lang);
}

// Ejecutar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  const savedLang = localStorage.getItem('lang') || 'es';
  const pageName = window.location.pathname.split("/").pop().split(".")[0] || "index";

  //console.log('savedLang: ', savedLang);
  //console.log('pageName: ', pageName);
  //console.log('navLang: ', navigator.language);

  loadTranslations(savedLang, pageName);
  document.documentElement.setAttribute('lang', savedLang);

  generateHeader(() => {setPageTitleAndLang(title, savedLang);});
  generateFooter();  
});

async function loadTranslations(lang, page) {
  try {
    const res = await fetch(`/lang/${page}.${lang}.json`);
    const translations = await res.json();

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[key]) {
        el.textContent = translations[key];
      }
    });
  } catch (error) {
    console.error(`Error cargando traducciones para ${page}.${lang}:`, error);
  }
}

function changeLanguage(lang, page = null) {
  localStorage.setItem('lang', lang);
  document.documentElement.setAttribute('lang', lang); 
  updateFlag(lang);
  const currentPage = page || window.location.pathname.split("/").pop().split(".")[0] || "index";
  loadTranslations(lang, currentPage);
}

function updateFlag(lang) {
  const flagMap = {
    es: 'https://flagcdn.com/24x18/es.png',
    en: 'https://flagcdn.com/24x18/gb.png'
  };
  const flag = document.getElementById('current-flag');
  if (flag) {
    flag.src = flagMap[lang];
    flag.alt = lang === 'es' ? 'Español' : 'English';
  }
}