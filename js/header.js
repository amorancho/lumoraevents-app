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

      initUserInfo();

      if (callback) callback();
    });
}
function getToken() {
  return localStorage.getItem("token");
}

function parseJwt(token) {
  try {
    //return JSON.parse(atob(token.split(".")[1]));
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);

    // Convertir a Uint8Array
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

    // Decodificar como UTF-8
    const jsonPayload = new TextDecoder().decode(bytes);

    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function renderUser() {
  const token = getToken();
  const userNameEl = document.getElementById("user-name");
  const authBtn = document.getElementById("auth-btn");

  if (!userNameEl || !authBtn) return;

  if (token) {
    const payload = parseJwt(token);
    const name = payload?.name || "User";
    const role = payload?.role || "";

    if (role && role.toLowerCase() !== "guest") {
      userNameEl.textContent = `${name} (${role})`;
    } else {
      userNameEl.textContent = "Guest";
    }

    authBtn.textContent = "Logout";
  } else {
    userNameEl.textContent = "Guest";
    authBtn.textContent = "Login";
  }
}


function initUserInfo() {
  renderUser();

  const authBtn = document.getElementById("auth-btn");
  if (authBtn) {
    authBtn.addEventListener("click", () => {
      const token = getToken();
      if (token) {
        localStorage.removeItem("token");
        renderUser();
        window.location.href = `/home.html?eventId=${encodeURIComponent(eventId)}`;
      } else {
        window.location.href = `/login.html?eventId=${encodeURIComponent(eventId)}`;
      }
    });
  }
}