document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const year = today.getFullYear();

  const regNameSpan = document.getElementById('regName');
  regNameSpan.textContent = `© ${year}  LumoraEvents`;
});