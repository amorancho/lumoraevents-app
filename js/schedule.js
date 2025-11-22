let lang;

async function waitForTranslations(timeout = 5000) {
  const start = Date.now();

  while (!translations) {
    // salir si pasaron más de 5 segundos
    if (Date.now() - start > timeout) {
      break;
    }

    // esperar 100 ms antes de volver a comprobar
    await new Promise(resolve => setTimeout(resolve, 100));
  }

}

document.addEventListener('DOMContentLoaded', async () => {
    await WaitEventLoaded();

    if (!getEvent().visibleSchedule) {
        alert('Esta página no es visible en estos momentos');
        window.location.href = 'home.html?eventId='+eventId;
        return;
    }

    if (getEvent().notice_active && getEvent().notice_text.trim() !== '') {
        const noticePanel = document.getElementById('noticePanel');
        const noticeInnerPannel = document.getElementById('notice_type');
        noticeInnerPannel.classList.add(`alert-${getEvent().notice_type === 'IMP' ? 'danger' : 'success'}`);
        const noticeTextDiv = document.getElementById('notice_text');
        noticeTextDiv.innerText = getEvent().notice_text;
        noticePanel.style.display = 'block';
    }

    await waitForTranslations();

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

    // Row + Col para centrar y limitar ancho
    const row = document.createElement('div');
    row.className = 'row justify-content-center';
    const col = document.createElement('div');
    col.className = 'col-12 col-md-12 col-lg-10';

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
                <button class="accordion-button collapsed" type="button" 
                        data-bs-toggle="collapse" data-bs-target="#collapse-${dayId}" 
                        aria-expanded="false" aria-controls="collapse-${dayId}">
                    <div style="width: 100%; display: flex; justify-content: center">
                        <strong>${formatDate(date)}</strong>
                    </div>
                </button>
            </h2>
            <div id="collapse-${dayId}" class="accordion-collapse collapse" 
                aria-labelledby="heading-${dayId}" data-bs-parent="#scheduleAccordion">
                <div class="accordion-body">
                </div>
            </div>
        `;

        const body = dayItem.querySelector('.accordion-body');

        // Cards dentro del día
        items.forEach((item, itemIndex) => {
            const card = document.createElement('div');
            card.className = 'card mb-3 border border-secondary-subtle rounded-3 shadow-none';
            /*card.innerHTML = `
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
            `;*/

            card.innerHTML = `
                <div class="card-body">
                <div class="row text-center align-items-center">
                    <div class="col-6 col-md-3 mb-2 mb-md-0">
                        <p class="mb-1 fw-semibold">Category</p>
                        <span class="badge bg-primary">${item.category}</span>
                    </div>
                    <div class="col-6 col-md-3 mb-2 mb-md-0">
                        <p class="mb-1 fw-semibold">Style</p>
                        <span class="badge bg-primary">${item.style}</span>
                    </div>
                    <div class="col-4 col-md-2 mb-2 mb-md-0">
                        <p class="mb-1 fw-semibold">Time</p>
                        <span>${item.time}</span>
                    </div>
                    <div class="col-4 col-md-2 mb-2 mb-md-0">
                        <p class="mb-1 fw-semibold">Status</p>
                        ${getStatusBadge(item.status)}
                    </div>
                    <div class="col-4 col-md-2">
                        <p class="mb-1 fw-semibold">Dancers</p>
                        <span class="badge bg-secondary">${item.dancers}</span>
                    </div>
                </div>
                </div>
            `;

            // Solo si visibleParticipants == 1 añadimos el sub-accordion
            if (item.dancersList?.length) {

                if ((getEvent().visibleParticipants == 1) || validateRoles(["admin", "organizer"], false)) {

                    const rowWrapper = document.createElement('div');
                    rowWrapper.className = 'row justify-content-center mt-2 mt-4'; // row para centrar col

                    const subAccordionCol = document.createElement('div');
                    subAccordionCol.className = 'col-12 col-md-10';

                    // ID único para cada sub-accordion
                    const subId = `subAccordion-${item.id}-${itemIndex}`;
                    subAccordionCol.innerHTML = `
                    <div class="accordion" id="${subId}">
                        <div class="accordion-item">
                        <h2 class="accordion-header" id="heading-${subId}">
                            <button class="accordion-button collapsed py-1 px-2" type="button" 
                                    data-bs-toggle="collapse" data-bs-target="#collapse-${subId}" 
                                    aria-expanded="false" aria-controls="collapse-${subId}">
                            <div class="d-flex justify-content-center w-100">
                                <strong>Participants (starting order)</strong>
                            </div>
                            </button>
                        </h2>
                        <div id="collapse-${subId}" class="accordion-collapse collapse" 
                            aria-labelledby="heading-${subId}" data-bs-parent="#${subId}">
                            <div class="accordion-body p-0">
                            <ul class="list-group list-group-flush"></ul>
                            </div>
                        </div>
                        </div>
                    </div>
                    `;

                    //${translations["participants"]}

                    // Añadimos los bailarines a la lista
                    const list = subAccordionCol.querySelector('ul');
                    item.dancersList.forEach(dancer => {
                        const li = document.createElement('li');
                        li.className = 'list-group-item d-flex align-items-center';
                        li.innerHTML = `
                        <span class="badge bg-info me-2">#${dancer.position}</span>
                        <img src="https://flagsapi.com/${dancer.nationality}/shiny/24.png" class="me-2" style="width: 24px;" />
                        <span class="dancer-name">${dancer.name || dancer.dancer_name}</span>
                        `;
                        list.appendChild(li);
                    });

                    rowWrapper.appendChild(subAccordionCol);
                    card.querySelector('.card-body').appendChild(rowWrapper);

                }
            }

            body.appendChild(card);
            });


        accordion.appendChild(dayItem);
    });

    col.appendChild(accordion);
    row.appendChild(col);
    container.appendChild(row);
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