//const API_BASE_URL = 'http://localhost:3000';
//const API_BASE_URL = 'https://api.lumoraevents.net';

var API_BASE_URL;

(function() {
  var host = window.location.hostname;

  if (host === "localhost" || host === "127.0.0.1") {
    API_BASE_URL = "http://localhost:3000"; // local
  } else {
    API_BASE_URL = "https://api.lumoraevents.net"; // producción
  }
})();

function getToken() {
  return localStorage.getItem("token");
}

function getUserFromToken() {
  const token = getToken();
  if (!token) return null;

  try {
    const decoded = jwt_decode(token); // { id, name, role, iat, exp, ... }

    // Validar expiración
    if (decoded.exp * 1000 < Date.now()) {
      console.warn("Token expirado");
      localStorage.removeItem("token");
      return null;
    }

    return decoded;
  } catch (err) {
    console.warn("Token inválido:", err.message);
    return null;
  }
}

function validateRoles(allowedRoles, redirect = true) {
  const user = getUserFromToken();
  if (!user || !allowedRoles.includes(user.role)) {

    if (redirect) {
      alert("No tienes permiso para acceder a esta página");  
      // Redirige al login o home
      window.location.href = `/home.html?eventId=${eventId}`;
    }
    return false;
  }
  return true;
}

function updateElementProperty(elementId, property, value, replace = true) {
  const element = document.getElementById(elementId);

  if (element) {

    if (replace) {
      element[property] = value;
    } else {
      element[property] += value;
    }        
  }
}