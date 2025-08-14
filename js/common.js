const pageName = window.location.pathname.split("/").pop().split(".")[0] || "index";

const eventId = getEventIdFromUrl();
//const API_BASE_URL = 'http://localhost:3000';
const API_BASE_URL = 'https://api.lumoraevents.net';

let eventObj = null;
let eventReadyPromise = null;

const modalHtml = `
<div class="modal fade" id="messageModal" tabindex="-1" aria-labelledby="messageModalLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <!--div class="modal-header">
        <h5 class="modal-title" id="messageModalLabel">Mensaje</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
      </div-->
      <div class="modal-header bg-danger text-white">
        <h5 class="modal-title" id="messageModalLabel">Error</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body" id="messageModalBody">
        <!-- Aquí va el mensaje -->
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Aceptar</button>
      </div>
    </div>
  </div>
</div>
`;

function getEventIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  for (const [key, value] of urlParams.entries()) {
    if (key.toLowerCase() === 'eventid') {
      return value;
    }
  }

  if (pageName !== 'index') {    
    window.location.href = 'index.html';
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

    if (eventId) {
      const res = await fetch(`${API_BASE_URL}/api/events/code/${eventId}`);
      if (!res.ok) throw new Error(`Error ${res.status} al recuperar el evento`);
      const data = await res.json();

      eventObj = {
        id: data.id,
        name: data.name,
        eventLogo: data.eventlogo,
        eventUrl: data.eventurl,
        homeUrl: `home.html?eventId=${eventId}`
      };
    }
    resolve(eventObj);
  } catch (err) {
    console.error('Error cargando datos del evento:', err);
    reject(err);
  }
});

// Ejecutar al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
  // Cargar el modal de mensajes
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const savedLang = localStorage.getItem('lang') || 'es';

  await loadTranslations(savedLang, pageName);
  document.documentElement.setAttribute('lang', savedLang);

  // Esperamos a que los datos del evento estén listos
  try {
    await eventReadyPromise;
    if (pageName !== 'index') {
      generateHeader(() => { setPageTitleAndLang(title, savedLang); });
      generateFooter();
    }
  } catch (err) {
    console.warn("No se pudieron cargar datos del evento, cabecera no generada");
  }

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

function showMessageModal(message, title = "Mensaje") {
    // Establece el título y el cuerpo del modal
    document.getElementById('messageModalLabel').textContent = title;
    document.getElementById('messageModalBody').textContent = message;

    // Muestra el modal (requiere Bootstrap 5)
    const modal = new bootstrap.Modal(document.getElementById('messageModal'));
    modal.show();
  }

// 5. Hacer la función global para usarla desde cualquier script inline o externo
window.showMessageModal = showMessageModal;