const API_BASE_URL = 'http://localhost:3000';
//const API_BASE_URL = 'https://api.lumoraevents.net';

function getToken() {
  return localStorage.getItem("token");
}

function getUserFromToken() {
  const token = getToken();
  if (!token) return null;

  try {
    return jwt_decode(token); // devuelve { id, name, role, iat, exp, ... }
  } catch (err) {
    console.warn("Token inválido:", err.message);
    return null;
  }
}

function validateRoles(allowedRoles) {
  const user = getUserFromToken();
  if (!user || !allowedRoles.includes(user.role)) {
    alert("No tienes permiso para acceder a esta página");  
    // Redirige al login o home
    window.location.href = `/home.html?eventId=${eventId}`;
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