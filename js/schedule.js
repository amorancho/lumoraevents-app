let lang;

document.addEventListener('DOMContentLoaded', async () => {
    await WaitEventLoaded();

    loadSchedule();
});

async function loadSchedule() {
    const container = document.getElementById('scheduleContainer');
    container.innerHTML = '<div class="text-center my-5"><div class="spinner-border text-primary" role="status"></div></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/events/schedule?event_id=${getEvent().id}`);
        const scheduleData = await response.json();

        window.scheData = scheduleData;

        renderSchedule(scheduleData);
    } catch (error) {
        console.error('Error loading schedule:', error);
        container.innerHTML = `<div class="alert alert-danger text-center mt-4">Error loading schedule</div>`;
    }
}

function renderSchedule(data) {
    lang = localStorage.getItem('lang') || 'en';
    const container = document.getElementById('scheduleContainer');
    container.innerHTML = '';

    const accordion = document.createElement('div');
    accordion.className = 'accordion';
    accordion.id = 'scheduleAccordion';

    Object.entries(data).forEach(([date, items], index) => {
        const dayId = `day-${index}`;

        // Cabecera del día
        const dayItem = document.createElement('div');
        dayItem.className = 'accordion-item mb-3 shadow-sm';

        dayItem.innerHTML = `
            <h2 class="accordion-header" id="heading-${dayId}">
                <button class="accordion-button ${index !== 0 ? 'collapsed' : ''} w-100 d-flex justify-content-center" type="button" 
                        data-bs-toggle="collapse" data-bs-target="#collapse-${dayId}" 
                        aria-expanded="${index === 0}" aria-controls="collapse-${dayId}">
                    <div style="width: 100%; display: flex; justify-content: center"><strong>${formatDate(date)}</strong></div>
                </button>
            </h2>
            <div id="collapse-${dayId}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" 
                 aria-labelledby="heading-${dayId}" data-bs-parent="#scheduleAccordion">
                <div class="accordion-body">
                </div>
            </div>
        `;

        const body = dayItem.querySelector('.accordion-body');

        // Cards de estilos dentro del día
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card mb-3 border border-secondary-subtle rounded-3 shadow-none';
            card.innerHTML = `
                <div class="card-body">
                    <div class="row text-center align-items-center">
                        <div class="col-6 col-md-3 mb-2 mb-md-0">
                            <p class="mb-1 fw-semibold">${translations["category"]}</p>
                            <span class="badge bg-primary">${item.category}</span>
                        </div>
                        <div class="col-6 col-md-3 mb-2 mb-md-0">
                            <p class="mb-1 fw-semibold">${translations["style"]}</p>
                            <span class="badge bg-primary">${item.style}</span>
                        </div>
                        <div class="col-4 col-md-2 mb-2 mb-md-0">
                            <p class="mb-1 fw-semibold">${translations["time"]}</p>
                            <span>${item.time}</span>
                        </div>
                        <div class="col-4 col-md-2 mb-2 mb-md-0">
                            <p class="mb-1 fw-semibold">${translations["status"]}</p>
                            ${getStatusBadge(item.status)}
                        </div>
                        <div class="col-4 col-md-2">
                            <p class="mb-1 fw-semibold">${translations["dancers"]}</p>
                            <span class="badge bg-secondary">${item.dancers}</span>
                        </div>
                    </div>
                </div>
            `;
            body.appendChild(card);
        });

        accordion.appendChild(dayItem);
    });

    container.appendChild(accordion);
}

// 🔹 Helpers
function formatDate(dateStr) {
    const d = new Date(dateStr);
    let locale;

    if (lang === 'es') {
        locale = 'es-ES';
    } else {
        locale = 'en-GB';
    }
    return d.toLocaleDateString(locale, { weekday: 'long',  month: 'long', day: 'numeric' }).toUpperCase();
}

function getStatusBadge(status) {
    let badgeClass = 'bg-secondary';
    let text = status;

    switch (status) {
        case 'FIN': badgeClass = 'bg-success'; text = 'FINISHED'; break;
        case 'OPE': badgeClass = 'bg-warning text-dark'; text = 'OPEN'; break;
        case 'CLO': badgeClass = 'bg-danger'; text = 'CLOSED'; break;
    }

    return `<span class="badge ${badgeClass}">${text}</span>`;
}