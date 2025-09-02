document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const year = today.getFullYear();

  const regNameSpan = document.getElementById('regName');
  regNameSpan.textContent = `© ${year}  LumoraEvents`;

  const form = document.querySelector("form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const eventId = getEventIdFromUrl();
    const username = document.getElementById("username").value.trim();
    const passwordInput = document.getElementById("password"); // referencia al input
    const password = passwordInput.value.trim();

    if (!eventId) {
      alert("No se ha proporcionado un eventId");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ eventId, username, password })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error en el login");
      }

      const data = await response.json();

      if (data.token) {
        localStorage.setItem("token", data.token);

        // Redirigir al home del evento
        window.location.href = `/home.html?eventId=${encodeURIComponent(eventId)}`;
      } else {
        alert("No se recibió token en la respuesta");
      }
    } catch (err) {
      alert(err);
      passwordInput.value = "";
    }
  });
});

function getEventIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  for (const [key, value] of urlParams.entries()) {
    if (key.toLowerCase() === 'eventid') {
      return value;
    }
  }

  if (pageName !== 'index') {    
    window.location.href = 'index.html';
  }
  return null;
}