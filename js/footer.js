function generateFooter() {
  fetch('footer.html')
    .then(res => res.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const footerStyles = doc.getElementById('app-footer-styles');

      if (footerStyles && !document.getElementById('app-footer-styles')) {
        document.head.appendChild(footerStyles.cloneNode(true));
      }
      footerStyles?.remove();

      const year = new Date().getFullYear();
      const regNameSpan = doc.getElementById('regName');
      if (regNameSpan) {
        regNameSpan.textContent = `© ${year} LumoraEvents`;
      }

      const footerContainer = document.getElementById('footer');
      if (footerContainer) {
        footerContainer.outerHTML = doc.body.innerHTML;
      }
    });
}
