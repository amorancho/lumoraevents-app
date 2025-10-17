var title = 'General Configuration';
const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {
  validateRoles(allowedRoles);

  await WaitEventLoaded();

  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${eventId}`);
  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

  await loadEventData(eventId);

  document.getElementById('saveEventBtn').addEventListener('click', async () => {
    await saveEventData(eventId);
  });

  document.getElementById('eventlogo').addEventListener('input', updateLogoPreview);
});


async function loadEventData(eventId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}`);
    if (!res.ok) throw new Error('Error loading event data');
    const data = await res.json();

    const f = id => document.getElementById(id);
    for (let key in data) {
      if (f(key)) f(key).value = data[key] ?? '';
    }

    console.log('Fecha original:', data.start);

    if (f('start') && data.start)
      f('start').value = data.start.slice(0, 10);
    if (f('end') && data.end)
      f('end').value = data.end.slice(0, 10);


    if (f('visible')) f('visible').checked = data.visible == 1; 
    if (f('username') && f('code')) f('username').value = f('code').value;

    updateLogoPreview();
  } catch (err) {
    showAlert('danger', '❌ Error loading event information');
    console.error(err);
  }
}


async function saveEventData(eventId) {
  const f = id => document.getElementById(id);
  const payload = {
    code: f('code').value.trim(),
    name: f('name').value.trim(),
    start: f('start').value,
    end: f('end').value,
    status: f('status').value,
    eventlogo: f('eventlogo').value.trim(),
    eventurl: f('eventurl').value.trim(),
    client_id: parseInt(f('client_id').value) || null,
    password: parseInt(f('password').value) || null,
    visible: parseInt(f('visible').value) || 0,
    language: f('language').value,
    min_styles: parseInt(f('min_styles').value) || null,
    autorefresh_minutes: parseInt(f('autorefresh_minutes').value) || null,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Error saving event data');
    const result = await res.json();

    showAlert('success', '✅ Event updated successfully!');
  } catch (err) {
    showAlert('danger', '❌ Failed to update event');
    console.error(err);
  }
}


function updateLogoPreview() {
  const url = document.getElementById('eventlogo').value.trim();
  const img = document.getElementById('previewLogo');

  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    img.src = url;
    img.classList.remove('d-none');
  } else {
    img.classList.add('d-none');
  }
}


function showAlert(type, message) {
  const container = document.querySelector('.container');
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show mt-3`;
  alert.role = 'alert';
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  container.prepend(alert);
  setTimeout(() => alert.classList.remove('show'), 4000);
}
