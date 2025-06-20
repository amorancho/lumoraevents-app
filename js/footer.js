function generateFooter() {
  console.log('Generating footer...');
  fetch('footer.html')
    .then(res => res.text())
    .then(html => {
      // Convertir string HTML en DOM manipulable
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const eventOficialPage = doc.getElementById('eventUrl');

      if (eventOficialPage) {
        eventOficialPage.href = getEvent().eventUrl;
      }

      // Modificar campos dentro del fragmento
      const footerContainer = document.getElementById('footer');
      if (footerContainer) {
        footerContainer.outerHTML = doc.body.innerHTML;
      }
  });
}