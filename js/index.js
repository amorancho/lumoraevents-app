var title = 'Welcome';

const formatFecha = (isoString) => {
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-GB', { month: 'short' }); // 'Sep'
    return `${day}-${month}`;
};

const getEventStatusInfo = (startIso, endIso) => {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  const now = new Date();

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  if (now < startDate) {
    return { label: 'proximamente', badgeClass: 'badge bg-primary' };
  }

  const endBoundary = new Date(endDate);
  endBoundary.setDate(endBoundary.getDate() + 1);

  if (now > endBoundary) {
    return { label: 'finalizado', badgeClass: 'badge bg-success' };
  }

  return { label: 'en_curso', badgeClass: 'badge bg-warning text-dark' };
};

document.addEventListener('DOMContentLoaded', () => {
  fetch(`${API_BASE_URL}/api/events`)
    .then(response => {
      if (!response.ok) throw new Error(`Error fetching events: ${response.status}`);
      return response.json();
    })
    .then(data => {
      const container = document.getElementById('eventsContainer');
      container.innerHTML = '';
      data.forEach(event => {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6 col-lg-4';

        const statusInfo = getEventStatusInfo(event.start, event.end);

        col.innerHTML = `
          <div class="card h-100">
            <div class="card-header fw-bold text-center">
              ${event.name}
              ${statusInfo ? `<div class="mt-2"><span class="${statusInfo.badgeClass}" data-i18n="${statusInfo.label}">${statusInfo.label}</span></div>` : ''}
            </div>
            <div class="card-body d-flex flex-column">
              <img src="${event.eventlogo || 'https://via.placeholder.com/300x180?text=Event'}"
                   class="img-fluid mb-3"
                   style="height: 180px; width: 100%; object-fit: contain;"
                   alt="${event.name}">
              <p class="text-muted text-center">${formatFecha(event.start)} / ${formatFecha(event.end)}</p>
              <div class="mt-auto text-center">
                <a href="home.html?eventId=${event.code}" class="btn btn-primary" data-i18n="go_to_event">Go to Event</a>
              </div>
            </div>
          </div>
        `;

        container.appendChild(col);
      });
    })
    .then(() => {
      applyTranslations();
    })
    .catch(error => {
      console.error('Failed to load events:', error);
    });
});
