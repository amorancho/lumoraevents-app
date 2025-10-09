var title = 'Administración LumoraEvents';

const allowedRoles = ["admin"];


document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  const authBtn = document.getElementById("auth-btn");

  authBtn.addEventListener("click", () => {
    const token = getToken();
    if (token) {
      localStorage.removeItem("token");
      window.location.href = `/index.html`;
    }
  });

});