const eventId = getEventIdFromUrl();
const API_BASE_URL = 'http://localhost:3000';

let eventObj = null;
let eventReadyPromise = null;

function getEventIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  for (const [key, value] of urlParams.entries()) {
    if (key.toLowerCase() === 'eventid') {
      return value;
    }
  }
  return null;
}

function getEvent() {
  return eventObj;
}

function setPageTitleAndLang(title, lang) {
  updateElementProperty('screen-title', 'textContent', title);
  updateFlag(lang);
}

// Creamos la promesa que se resolverá cuando los datos del evento estén listos
eventReadyPromise = new Promise(async (resolve, reject) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/event/code/${eventId}`);
    if (!res.ok) throw new Error(`Error ${res.status} al recuperar el evento`);
    const data = await res.json();

    console.log('Evento recuperado:', data);

    eventObj = {
      id: data.id,
      name: data.name,
      eventLogo: data.eventlogo,
      eventUrl: data.eventurl,
      homeUrl: `home.html?eventId=${eventId}`
    };

    console.log('Objeto de evento:', eventObj);
    resolve(eventObj);
  } catch (err) {
    console.error('Error cargando datos del evento:', err);
    reject(err);
  }
});

// Ejecutar al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
  const savedLang = localStorage.getItem('lang') || 'es';
  const pageName = window.location.pathname.split("/").pop().split(".")[0] || "index";

  await loadTranslations(savedLang, pageName);
  document.documentElement.setAttribute('lang', savedLang);

  // Esperamos a que los datos del evento estén listos
  try {
    await eventReadyPromise;
    if (pageName !== 'index') {
      generateHeader(() => { setPageTitleAndLang(title, savedLang); });
    }
  } catch (err) {
    console.warn("No se pudieron cargar datos del evento, cabecera no generada");
  }

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
