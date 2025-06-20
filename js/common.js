const eventId = getEventIdFromUrl();

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

function setPageTitle(title) {
  updateElementProperty('screen-title', 'textContent', title);
}

// Ejecutar al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  generateHeader(() => {setPageTitle(title);});
  generateFooter();
});