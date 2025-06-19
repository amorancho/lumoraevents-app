function getEventIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('eventId');
}

const eventId = getEventIdFromUrl();

const eventObj = {
  id: eventId,
  name: "ETOILES D'ORIENT FESTIVAL 25",
  eventLogo: "https://www.forotic.es/wp-content/uploads/2025/05/logo-etoiles.png",
  eventUrl: "https://etoilesdorientfest.com"
};

function getEvent() {
  return eventObj;
}

function generateHeader() {
  fetch('header.html')
    .then(res => res.text())
    .then(html => {
      // Convertir string HTML en DOM manipulable
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Modificar campos dentro del fragmento
      const titulo = doc.getElementById('event-name');
      const homeUrl = doc.getElementById('home-link');

      if (titulo) {
        titulo.textContent = getEvent().name;
      }

      if (homeUrl) {
        homeUrl.href = getEvent().eventUrl;
      }

      // Insertar el HTML modificado en el DOM final
      const headerContainer = document.getElementById('header');
      if (headerContainer) {
        headerContainer.innerHTML = doc.body.innerHTML;
      }
    });
}

function generateFooter() {
  fetch('footer.html')
    .then(res => res.text())
    .then(html => {
      // Convertir string HTML en DOM manipulable
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const eventOficialPage = doc.getElementById('eventUrl');

      if (eventOficialPage) {
        eventOficialPage.textContent = getEvent().eventUrl;
      }

      // Modificar campos dentro del fragmento
      const footerContainer = document.getElementById('footer');
      if (footerContainer) {
        footerContainer.innerHTML = doc.body.innerHTML;
      }
  });
}

// Ejecutar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('entra el DOMContentLoaded del common.js');
  generateHeader();
  generateFooter();
});