let lang;
let scheduleLoadInFlight = false;

document.addEventListener('DOMContentLoaded', async () => {
    await WaitEventLoaded();
    await ensureTranslationsReady();

    const user = getUserFromToken();
    const role = user ? user.role : 'guest';

    if (!getEvent().visibleSchedule && role !== 'admin' && role !== 'organizer') {
        alert(t('page_not_visible'));
        window.location.href = 'home.html?eventId=' + eventId;
        return;
    }

    if (getEvent().notice_active && getEvent().notice_text.trim() !== '') {
        const noticePanel = document.getElementById('noticePanel');
        const noticeInnerPanel = document.getElementById('notice_type');
        noticeInnerPanel.classList.add(`alert-${getEvent().notice_type === 'IMP' ? 'danger' : 'success'}`);
        const noticeTextDiv = document.getElementById('notice_text');
        noticeTextDiv.innerText = getEvent().notice_text;
        noticePanel.style.display = 'block';
    }

    initScheduleRefreshButton();
    loadSchedule();
});

function setScheduleRefreshButtonLoading(isLoading) {
    const refreshBtn = document.getElementById('refreshScheduleBtn');
    if (!refreshBtn) return;

    if (isLoading) {
        if (!refreshBtn.dataset.originalHtml) {
            refreshBtn.dataset.originalHtml = refreshBtn.innerHTML;
        }
        refreshBtn.innerHTML = `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            <span>${t('loading', 'Loading...')}</span>
        `;
        refreshBtn.disabled = true;
        return;
    }

    if (refreshBtn.dataset.originalHtml) {
        refreshBtn.innerHTML = refreshBtn.dataset.originalHtml;
        delete refreshBtn.dataset.originalHtml;
    }
    refreshBtn.disabled = false;
}

function initScheduleRefreshButton() {
    const refreshBtn = document.getElementById('refreshScheduleBtn');
    if (!refreshBtn || refreshBtn.dataset.initialized === '1') return;

    refreshBtn.addEventListener('click', async () => {
        await loadSchedule();
    });

    refreshBtn.dataset.initialized = '1';
}

async function loadSchedule() {
    if (scheduleLoadInFlight) return;
    scheduleLoadInFlight = true;

    const container = document.getElementById('scheduleContainer');
    const highlightContainer = document.getElementById('scheduleHighlightContainer');

    container.innerHTML = '<div class="text-center my-5"><div class="spinner-border text-primary" role="status"></div></div>';
    if (highlightContainer) {
        highlightContainer.innerHTML = '';
        highlightContainer.style.display = 'none';
    }
    setScheduleRefreshButtonLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/api/events/schedule?event_id=${getEvent().id}`);
        const scheduleData = await response.json();

        window.scheData = scheduleData;

        renderScheduleHighlight(scheduleData);
        renderSchedule(scheduleData);
    } catch (error) {
        console.error('Error loading schedule:', error);
        container.innerHTML = `<div class="alert alert-danger text-center mt-4">Error loading schedule</div>`;
    } finally {
        scheduleLoadInFlight = false;
        setScheduleRefreshButtonLoading(false);
    }
}

function getParticipantClubLabel(participant) {
    const clubName = String(participant?.club_name || '').trim();
    const clubLocation = String(participant?.club_location || '').trim();
    if (!clubName) return '';
    return clubLocation ? `${clubName} [${clubLocation}]` : clubName;
}

function renderSchedule(data) {
    lang = localStorage.getItem('lang') || 'en';
    const container = document.getElementById('scheduleContainer');
    container.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'row justify-content-center';

    const col = document.createElement('div');
    col.className = 'col-12 col-md-12 col-lg-10';

    const accordion = document.createElement('div');
    accordion.className = 'accordion';
    accordion.id = 'scheduleAccordion';

    Object.entries(data || {}).forEach(([date, items], index) => {
        const dayId = `day-${index}`;
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
                <div class="accordion-body"></div>
            </div>
        `;

        const body = dayItem.querySelector('.accordion-body');

        (Array.isArray(items) ? items : []).forEach((item, itemIndex) => {
            const card = createScheduleItemCard(item, {
                uniqueKey: `schedule-${index}-${itemIndex}`,
                expandParticipants: false
            });
            body.appendChild(card);
        });

        accordion.appendChild(dayItem);
    });

    col.appendChild(accordion);
    row.appendChild(col);
    container.appendChild(row);
}

function renderScheduleHighlight(data) {
    const highlightContainer = document.getElementById('scheduleHighlightContainer');
    if (!highlightContainer) return;

    highlightContainer.innerHTML = '';
    highlightContainer.style.display = 'none';

    const todayItems = getTodayScheduleItems(data);
    if (!todayItems.length) return;

    const inProgressItem = todayItems.find(item => item?.status === 'PRO');
    let selectedItem = null;
    let titleKey = '';
    let expandParticipants = false;

    if (inProgressItem) {
        selectedItem = inProgressItem;
        titleKey = 'competition_in_progress';
        expandParticipants = true;
    } else {
        const lastFinishedIndex = todayItems.reduce((lastIndex, item, index) => {
            return item?.status === 'FIN' ? index : lastIndex;
        }, -1);

        selectedItem = todayItems.slice(lastFinishedIndex + 1).find(item => item?.status !== 'FIN') || null;
        if (!selectedItem) return;

        titleKey = 'next_competition';
    }

    const row = document.createElement('div');
    row.className = 'row justify-content-center';

    const col = document.createElement('div');
    col.className = 'col-12 col-md-12 col-lg-10';

    const wrapper = document.createElement('div');
    wrapper.className = 'card border-primary shadow-sm';
    wrapper.innerHTML = `
        <div class="card-body">
            <h3 class="h5 mb-3 text-center">${t(titleKey)}</h3>
        </div>
    `;

    const wrapperBody = wrapper.querySelector('.card-body');
    wrapperBody.appendChild(createScheduleItemCard(selectedItem, {
        uniqueKey: `highlight-${selectedItem?.id ?? 'today'}`,
        expandParticipants
    }));

    col.appendChild(wrapper);
    row.appendChild(col);
    highlightContainer.appendChild(row);
    highlightContainer.style.display = 'block';
}

function getTodayScheduleItems(data) {
    const todayKey = getTodayDateKey();
    const todayItems = [];

    Object.entries(data || {}).forEach(([date, items]) => {
        if (!Array.isArray(items)) return;

        items.forEach(item => {
            const itemDayKey = normalizeScheduleDateKey(item?.day || date);
            if (itemDayKey === todayKey) {
                todayItems.push(item);
            }
        });
    });

    return todayItems;
}

function getTodayDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeScheduleDateKey(value) {
    if (!value) return '';

    const normalizedValue = String(value).trim();
    const directMatch = normalizedValue.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch?.[1]) {
        return directMatch[1];
    }

    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function canShowScheduleParticipants() {
    return getEvent().visibleParticipants == 1 || validateRoles(['admin', 'organizer'], false);
}

function createScheduleItemCard(item, { uniqueKey, expandParticipants = false } = {}) {
    const card = document.createElement('div');
    card.className = 'card mb-3 border border-secondary-subtle rounded-3 shadow-none';

    card.innerHTML = `
        <div class="card-body">
            <div class="row text-center align-items-center">
                <div class="col-6 col-md-3 mb-2 mb-md-0">
                    <p class="mb-1 fw-semibold">${t('category', 'Category')}</p>
                    <span class="badge bg-primary">${item?.category || ''}</span>
                </div>
                <div class="col-6 col-md-3 mb-2 mb-md-0">
                    <p class="mb-1 fw-semibold">${t('style', 'Style')}</p>
                    <span class="badge bg-primary">${item?.style || ''}</span>
                </div>
                <div class="col-4 col-md-2 mb-2 mb-md-0">
                    <p class="mb-1 fw-semibold">${t('time', 'Time')}</p>
                    <span>${item?.time || ''}</span>
                </div>
                <div class="col-4 col-md-2 mb-2 mb-md-0">
                    <p class="mb-1 fw-semibold">${t('status', 'Status')}</p>
                    ${getStatusBadge(item?.status)}
                </div>
                <div class="col-4 col-md-2">
                    <p class="mb-1 fw-semibold">${t('dancers', 'Dancers')}</p>
                    <span class="badge bg-secondary">${item?.dancers ?? 0}</span>
                </div>
            </div>
        </div>
    `;

    if (!item?.dancersList?.length || !canShowScheduleParticipants()) {
        return card;
    }

    const rowWrapper = document.createElement('div');
    rowWrapper.className = 'row justify-content-center mt-2 mt-4';

    const subAccordionCol = document.createElement('div');
    subAccordionCol.className = 'col-12 col-md-10';

    const subId = `subAccordion-${uniqueKey || item.id || 'item'}`;
    const collapseClass = expandParticipants ? 'accordion-collapse collapse show' : 'accordion-collapse collapse';
    const buttonClass = expandParticipants ? 'accordion-button py-1 px-2' : 'accordion-button collapsed py-1 px-2';
    const ariaExpanded = expandParticipants ? 'true' : 'false';

    subAccordionCol.innerHTML = `
        <div class="accordion" id="${subId}">
            <div class="accordion-item">
                <h2 class="accordion-header" id="heading-${subId}">
                    <button class="${buttonClass}" type="button"
                            data-bs-toggle="collapse" data-bs-target="#collapse-${subId}"
                            aria-expanded="${ariaExpanded}" aria-controls="collapse-${subId}">
                        <div class="d-flex justify-content-center w-100">
                            <strong>${t('participants')}</strong>
                        </div>
                    </button>
                </h2>
                <div id="collapse-${subId}" class="${collapseClass}"
                    aria-labelledby="heading-${subId}" data-bs-parent="#${subId}">
                    <div class="accordion-body p-0">
                        <ul class="list-group list-group-flush"></ul>
                    </div>
                </div>
            </div>
        </div>
    `;

    const list = subAccordionCol.querySelector('ul');
    item.dancersList.forEach(dancer => {
        const dancerName = dancer.name || dancer.dancer_name || '';
        const clubLabel = getParticipantClubLabel(dancer);
        const dancerStatusBadge = item?.status === 'PRO' ? getDancerScheduleStatusBadge(dancer?.schedule_status) : '';
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex align-items-center';
        li.innerHTML = `
            <span class="badge bg-info me-2">#${dancer.position}</span>
            ${getDancerFlagImgHtml(dancer.nationality, { className: 'me-2', style: 'width: 24px;' })}
            <span class="d-flex align-items-center flex-wrap flex-grow-1">
                <span class="dancer-name">${escapeHtml(dancerName)}</span>
                ${clubLabel ? `<span class="ms-2 small text-muted">${escapeHtml(clubLabel)}</span>` : ''}
            </span>
            ${dancerStatusBadge ? `<span class="ms-auto">${dancerStatusBadge}</span>` : ''}
        `;
        list.appendChild(li);
    });

    rowWrapper.appendChild(subAccordionCol);
    card.querySelector('.card-body').appendChild(rowWrapper);

    return card;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    let locale;

    if (lang === 'es') {
        locale = 'es-ES';
    } else if (lang === 'it') {
        locale = 'it-IT';
    } else if (lang === 'pt') {
        locale = 'pt-PT';
    } else if (lang === 'fr') {
        locale = 'fr-FR';
    } else {
        locale = 'en-GB';
    }

    return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
}

function getStatusBadge(status) {
    let badgeClass = 'bg-secondary';
    let text = status;

    switch (status) {
        case 'FIN':
            badgeClass = 'bg-success';
            text = 'FINISHED';
            break;
        case 'OPE':
            badgeClass = 'bg-warning text-dark';
            text = 'OPEN';
            break;
        case 'CLO':
            badgeClass = 'bg-danger';
            text = 'CLOSED';
            break;
        case 'PRO':
            badgeClass = 'bg-primary';
            text = 'IN PROGRESS';
            break;
    }

    return `<span class="badge ${badgeClass}">${text}</span>`;
}

function getDancerScheduleStatusBadge(status) {
    switch (status) {
        case 'FIN':
            return '<span class="badge bg-success">FINISHED</span>';
        case 'PEN':
            return '<span class="badge bg-warning text-dark">PENDING</span>';
        default:
            return '';
    }
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
