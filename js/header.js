function generateHeader(callback) {

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
        titulo.href = getEvent().homeUrl;
      }

      if (homeUrl) {
        homeUrl.href = getEvent().homeUrl;
      }

      // Insertar el HTML modificado en el DOM final
      const headerContainer = document.getElementById('header');
      if (headerContainer) {
        headerContainer.outerHTML = doc.body.innerHTML;
      }

      if (callback) callback();
    });
}