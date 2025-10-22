const pageName = window.location.pathname.split("/").pop().split(".")[0] || "index";
const savedLang = localStorage.getItem('lang') || 'es';
let translations = {};

updateFlag(savedLang);

const eventId = getEventIdFromUrl();

const originalFetch = window.fetch;

window.fetch = function(url, options = {}) {
  const lang = localStorage.getItem('lang') || 'es';

  // obtenemos el role del usuario
  const user = getUserFromToken();
  const role = user ? user.role : 'guest';

  options = options || {};
  options.headers = {
    ...options.headers,
    'Accept-Language': lang,
    'X-User-Role': role
  };
  return originalFetch(url, options);
};

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
  

  if (pageName !== 'index' && pageName !== 'admin') {    
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

      const today = new Date();
      today.setHours(0, 0, 0, 0); // eliminamos horas para comparar solo la fecha

      const start = new Date(data.start);
      start.setHours(0, 0, 0, 0);

      const end = new Date(data.end);
      end.setHours(0, 0, 0, 0);

      let status;

      if (data.status === 'CLO') {
        status = 'completed';
      } else if (start > today) {
        status = 'upcoming';
      } else if (start <= today && end >= today) {
        status = 'ongoing';
      } else {
        status = 'completed';
      }

      eventObj = {
        id: data.id,
        name: data.name,
        eventLogo: data.eventlogo,
        eventUrl: data.eventurl,
        visible: data.visible === 1,
        trial: data.trial === 1,
        status: status,
        homeUrl: `home.html?eventId=${eventId}`,
        language: data.language,
        judgesToVote: data.judges_to_vote,
        autoRefreshMin: data.autorefresh_minutes,
        catClassification: data.category_class_type,
        license: data.license
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
  document.documentElement.setAttribute('lang', savedLang);

  await loadTranslations(savedLang, pageName);
  applyTranslations();

  // Esperamos a que los datos del evento estén listos
  try {
    await eventReadyPromise;
    if (pageName !== 'index' && pageName !== 'admin') {
      generateHeader(() => { setPageTitleAndLang(translations['title'], savedLang); });
      generateFooter();
    }
  } catch (err) {
    console.warn("No se pudieron cargar datos del evento, cabecera no generada");
  }

});

async function loadTranslations(lang, page) {
  try {

    const res = await fetch(`/lang/${page}.${lang}.json`);
    translations = await res.json();

  } catch (error) {
    console.error(`Error cargando traducciones para ${page}.${lang}:`, error);
  }
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) {
      el.textContent = translations[key];
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[key]) el.placeholder = translations[key];
  });
}

async function changeLanguage(lang, page = null) {
  localStorage.setItem('lang', lang);
  document.documentElement.setAttribute('lang', lang); 
  updateFlag(lang);
  //const currentPage = page || window.location.pathname.split("/").pop().split(".")[0] || "index";
  await loadTranslations(lang, pageName);
  applyTranslations();
  //updateElementProperty('screen-title', 'textContent', title);
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

async function WaitEventLoaded() {
  try {
    await eventReadyPromise;
  } catch (error) {
      console.error('Evento no encontrado:', error);

      // Mostrar mensaje
      const body = document.body;
      body.innerHTML = `<div style="text-align:center; margin-top:50px;">
                          <h2>No se ha encontrado el evento</h2>
                          <p>Redirigiendo a la página principal...</p>
                      </div>`;

      // Redirigir después de 2 segundos
      setTimeout(() => {
      window.location.href = 'index.html';
      }, 2000);
  }
}

// 5. Hacer la función global para usarla desde cualquier script inline o externo
window.showMessageModal = showMessageModal;