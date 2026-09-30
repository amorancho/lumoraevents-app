let lang;
let scheduleLoadInFlight = false;
let selectedScheduleDate = null;

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
    setScheduleRefreshButtonMode('hidden');
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

function setScheduleRefreshButtonMode(mode, liveSlotOverride = null) {
    const refreshBtn = document.getElementById('refreshScheduleBtn');
    const defaultSlot = document.getElementById('scheduleRefreshDefaultSlot');
    const liveSlot = liveSlotOverride || document.getElementById('scheduleRefreshLiveSlot');

    if (!refreshBtn || !defaultSlot) return;

    const nextMode = mode === 'live' && liveSlot
        ? 'live'
        : mode === 'default'
            ? 'default'
            : 'hidden';

    if (nextMode === 'live') {
        liveSlot.appendChild(refreshBtn);
    } else {
        defaultSlot.appendChild(refreshBtn);
    }

    refreshBtn.className = nextMode === 'live'
        ? 'lm-btn schedule-refresh-btn-live'
        : 'lm-btn lm-btn-secondary';

    refreshBtn.hidden = nextMode === 'hidden';
    defaultSlot.hidden = nextMode !== 'default';
    refreshBtn.dataset.mode = nextMode;
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

    container.innerHTML = '<div class="schedule-loading" role="status"><div class="spinner-border" aria-hidden="true"></div><span class="visually-hidden">Loading...</span></div>';
    setScheduleRefreshButtonMode('hidden');
    if (highlightContainer) {
        highlightContainer.innerHTML = '';
        highlightContainer.style.display = 'none';
    }
    setScheduleRefreshButtonLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/api/public/events/schedule?event_id=${getEvent().id}`);
        const scheduleData = await response.json();

        window.scheData = scheduleData;

        renderScheduleHighlight(scheduleData);
        renderSchedule(scheduleData);
    } catch (error) {
        console.error('Error loading schedule:', error);
        container.innerHTML = '<div class="lm-notice alert-danger schedule-error" role="alert">Error loading schedule</div>';
    } finally {
        scheduleLoadInFlight = false;
        setScheduleRefreshButtonLoading(false);
    }
}

function getParticipantClubLabel(participant) {
    if (getEvent()?.hideSchoolInfo) return '';
    const clubName = String(participant?.club_name || '').trim();
    const clubLocation = String(participant?.club_location || '').trim();
    if (!clubName) return '';
    return clubLocation ? `${clubName} [${clubLocation}]` : clubName;
}

function renderSchedule(data) {
    lang = localStorage.getItem('lang') || 'en';
    const container = document.getElementById('scheduleContainer');
    container.innerHTML = '';

    const days = Object.entries(data || {}).map(([date, items], index) => ({
        date,
        key: normalizeScheduleDateKey(date) || date,
        items: Array.isArray(items) ? items : [],
        index
    }));
    if (!days.length) {
        selectedScheduleDate = null;
        return;
    }

    if (!days.some(day => day.key === selectedScheduleDate)) {
        selectedScheduleDate = (days.find(day => day.key === getTodayDateKey()) || days[0]).key;
    }

    const panels = days.map(day => {
        const panel = document.createElement('div');
        panel.className = 'schedule-day-content';
        panel.id = `schedule-day-panel-${day.index}`;
        panel.hidden = day.key !== selectedScheduleDate;

        day.items.forEach((item, itemIndex) => {
            const card = createScheduleItemCard(item, {
                uniqueKey: `schedule-${day.index}-${itemIndex}`,
                expandParticipants: false
            });
            panel.appendChild(card);
        });

        return panel;
    });

    if (days.length === 1) {
        const heading = document.createElement('h2');
        heading.className = 'schedule-day-single';
        heading.id = 'schedule-day-heading';
        heading.innerHTML = createScheduleDayLabel(days[0].date);
        panels[0].setAttribute('role', 'region');
        panels[0].setAttribute('aria-labelledby', heading.id);
        container.append(heading, panels[0]);
        return;
    }

    const selector = document.createElement('div');
    selector.className = `schedule-days ${days.length === 2 ? 'schedule-days--two' : 'schedule-days--scroll'}`;
    selector.setAttribute('role', 'tablist');
    selector.setAttribute('aria-label', t('title', 'Schedule'));

    const tabs = days.map((day, index) => {
        const tab = document.createElement('button');
        const active = day.key === selectedScheduleDate;
        tab.type = 'button';
        tab.className = `schedule-day-tab${active ? ' schedule-day-tab-active' : ''}`;
        tab.id = `schedule-day-tab-${index}`;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', panels[index].id);
        tab.setAttribute('aria-selected', String(active));
        tab.setAttribute('aria-label', formatDate(day.date));
        tab.tabIndex = active ? 0 : -1;
        tab.innerHTML = createScheduleDayLabel(day.date);
        panels[index].setAttribute('role', 'tabpanel');
        panels[index].setAttribute('aria-labelledby', tab.id);
        panels[index].tabIndex = 0;
        tab.addEventListener('click', () => selectDay(index));
        selector.appendChild(tab);
        return tab;
    });

    function selectDay(index) {
        selectedScheduleDate = days[index].key;
        tabs.forEach((tab, tabIndex) => {
            const active = tabIndex === index;
            tab.classList.toggle('schedule-day-tab-active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            panels[tabIndex].hidden = !active;
        });
    }

    selector.addEventListener('keydown', event => {
        const currentIndex = tabs.indexOf(event.target);
        if (currentIndex < 0) return;
        let nextIndex;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;

        event.preventDefault();
        tabs[nextIndex].focus();
        selectDay(nextIndex);
    });

    container.appendChild(selector);
    container.append(...panels);
}

function createScheduleDayLabel(date) {
    const day = new Date(date);
    const locale = getScheduleDateLocale();
    const weekday = day.toLocaleDateString(locale, { weekday: 'long' }).toUpperCase();
    const shortDate = day.toLocaleDateString(locale, { day: 'numeric', month: 'short' }).toUpperCase();
    return `<span class="schedule-day-weekday">${escapeHtml(weekday)}</span><span class="schedule-day-date">${escapeHtml(shortDate)}</span>`;
}

function renderScheduleHighlight(data) {
    const highlightContainer = document.getElementById('scheduleHighlightContainer');
    if (!highlightContainer) return;

    setScheduleRefreshButtonMode('hidden');
    highlightContainer.innerHTML = '';
    highlightContainer.style.display = 'none';

    const todayItems = getTodayScheduleItems(data);
    if (!todayItems.length) return;

    const inProgressItems = todayItems.filter(item => {
        return getScheduleItemBlockType(item) === 'COMP' && item?.status === 'PRO';
    });
    let selectedItems = [];
    let titleKey = '';
    let showLiveHighlight = false;
    let previousBreakItems = [];

    if (inProgressItems.length) {
        showLiveHighlight = true;
    } else {
        const nextCompetitionContext = getNextCompetitionHighlightContext(todayItems);
        selectedItems = nextCompetitionContext.items;
        previousBreakItems = nextCompetitionContext.previousBreaks;
        if (!selectedItems.length) return;
        titleKey = 'next_competition';
    }

    const wrapper = document.createElement('div');
    wrapper.className = showLiveHighlight ? 'lm-card schedule-highlight schedule-highlight-live' : 'lm-card schedule-highlight schedule-highlight-next';
    wrapper.innerHTML = showLiveHighlight
        ? `
            <div class="lm-card-body schedule-highlight-body">
                <div class="schedule-live-banner" role="status" aria-live="polite">
                    <span class="schedule-live-pill">
                        <span class="schedule-live-dot" aria-hidden="true"></span>
                        ${t('live_now', 'Live now')}
                    </span>
                    <div id="scheduleRefreshLiveSlot" class="schedule-live-refresh-slot"></div>
                </div>
            </div>
        `
        : `
            <div class="lm-card-body schedule-highlight-body">
                <h3 class="schedule-highlight-title"><i class="bi bi-arrow-right-circle" aria-hidden="true"></i> ${t(titleKey, 'Next competition')}</h3>
            </div>
        `;

    const wrapperBody = wrapper.querySelector('.schedule-highlight-body');
    if (!showLiveHighlight && previousBreakItems.length) {
        wrapperBody.appendChild(createScheduleHighlightBreakStrip(previousBreakItems));
    }
    if (showLiveHighlight) {
        inProgressItems.forEach((item, index) => {
            wrapperBody.appendChild(createScheduleItemCard(item, {
                uniqueKey: `highlight-${item?.id ?? 'today'}-${index}`,
                expandParticipants: true,
                highlightLive: true
            }));
        });
    } else {
        selectedItems.forEach((item, index) => {
            wrapperBody.appendChild(createScheduleItemCard(item, {
                uniqueKey: `highlight-${item?.id ?? 'today'}-${index}`
            }));
        });
    }

    highlightContainer.appendChild(wrapper);
    if (showLiveHighlight) {
        setScheduleRefreshButtonMode('live', wrapper.querySelector('#scheduleRefreshLiveSlot'));
    } else {
        setScheduleRefreshButtonMode('default');
    }
    highlightContainer.style.display = 'block';
}

function getNextCompetitionHighlightContext(todayItems) {
    const items = Array.isArray(todayItems) ? todayItems : [];
    const defaultContext = getNextCompetitionHighlightContextForItems(items);

    if (!getEvent()?.hasMultipleScenarios) {
        return {
            items: defaultContext.item ? [defaultContext.item] : [],
            previousBreaks: defaultContext.previousBreaks
        };
    }

    const competitionsByScenario = new Map();
    items.forEach((item) => {
        if (getScheduleItemBlockType(item) !== 'COMP') return;

        const scenario = String(item?.scenario ?? '').trim();
        if (!competitionsByScenario.has(scenario)) {
            competitionsByScenario.set(scenario, []);
        }
        competitionsByScenario.get(scenario).push(item);
    });

    const nextCompetitionItems = Array.from(competitionsByScenario.values())
        .map((scenarioItems) => getNextCompetitionHighlightContextForItems(scenarioItems).item)
        .filter(Boolean);

    return {
        items: nextCompetitionItems,
        previousBreaks: defaultContext.previousBreaks
    };
}

function getNextCompetitionHighlightContextForItems(items) {
    const lastFinishedIndex = items.reduce((lastIndex, item, index) => {
        return item?.status === 'FIN' ? index : lastIndex;
    }, -1);

    const remainingItems = items.slice(lastFinishedIndex + 1);
    const nextCompetitionIndex = remainingItems.findIndex((item) => {
        return getScheduleItemBlockType(item) === 'COMP' && item?.status !== 'FIN';
    });

    if (nextCompetitionIndex < 0) {
        return { item: null, previousBreaks: [] };
    }

    const previousBreaks = remainingItems
        .slice(0, nextCompetitionIndex)
        .filter((item) => getScheduleItemBlockType(item) === 'BREAK');

    return {
        item: remainingItems[nextCompetitionIndex],
        previousBreaks
    };
}

function createScheduleHighlightBreakStrip(breakItems) {
    const wrapper = document.createElement('div');
    wrapper.className = 'schedule-highlight-breaks';

    const itemsHtml = breakItems.map((item) => {
        return `
            <span class="schedule-highlight-break-chip">
                <span class="schedule-highlight-break-name">${escapeHtml(getScheduleBreakName(item))}</span>
                <span class="schedule-highlight-break-time">${escapeHtml(formatBreakMinutesLabel(getScheduleBreakMinutes(item)))}</span>
            </span>
        `;
    }).join('');

    wrapper.innerHTML = `
        <div class="schedule-highlight-breaks-label">${t('break_label', 'Break')}</div>
        <div class="schedule-highlight-breaks-list">${itemsHtml}</div>
    `;

    return wrapper;
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
    return true;
    //return getEvent().visibleParticipants == 1 || validateRoles(['admin', 'organizer'], false);
}

function createScheduleItemCard(item, { uniqueKey, expandParticipants = false, highlightLive = false } = {}) {
    if (getScheduleItemBlockType(item) === 'BREAK') {
        return createScheduleBreakCard(item, { highlightLive });
    }

    return createCompetitionScheduleItemCard(item, { uniqueKey, expandParticipants, highlightLive });
}

function createCompetitionScheduleItemCard(item, { uniqueKey, expandParticipants = false, highlightLive = false } = {}) {
    const card = document.createElement('div');
    const isLiveItem = highlightLive && item?.status === 'PRO';
    const showScenario = Boolean(getEvent()?.hasMultipleScenarios);
    const scenario = String(item?.scenario ?? '').trim() || '-';
    const hasParticipants = Boolean(item?.dancersList?.length && canShowScheduleParticipants());
    card.className = `lm-card schedule-item${isLiveItem ? ' schedule-item-live' : ''}`;

    card.innerHTML = `
        <div class="lm-card-body schedule-item-body">
            <div class="schedule-item-main">
                <time class="schedule-time">${escapeHtml(item?.time || '')}</time>
                <div class="schedule-item-info">
                    <div class="schedule-item-tags">
                        <span class="lm-badge lm-badge-primary schedule-category">${escapeHtml(item?.category || '')}</span>
                        <span class="lm-badge lm-badge-purple schedule-style">${escapeHtml(item?.style || '')}</span>
                    </div>
                    ${showScenario ? `<div class="schedule-item-meta"><span class="schedule-scenario"><i class="bi bi-pin-map" aria-hidden="true"></i><span class="visually-hidden">${t('scenario', 'Stage')}:</span> ${escapeHtml(scenario)}</span></div>` : ''}
                </div>
                <div class="schedule-item-summary">
                    <span class="schedule-count"><i class="bi bi-people-fill" aria-hidden="true"></i> ${escapeHtml(item?.dancers ?? 0)} ${t('dancers', 'Dancers')}</span>
                    <div class="schedule-item-status">${getStatusBadge(item?.status)}</div>
                </div>
            </div>
        </div>
    `;

    if (!hasParticipants) {
        return card;
    }

    const participants = document.createElement('div');
    participants.className = 'schedule-participants';

    const subId = `subAccordion-${uniqueKey || item.id || 'item'}`;
    const collapseClass = expandParticipants ? 'collapse show' : 'collapse';
    const buttonClass = expandParticipants ? 'lm-collapse-trigger schedule-participant-toggle' : 'lm-collapse-trigger schedule-participant-toggle collapsed';
    const ariaExpanded = expandParticipants ? 'true' : 'false';

    participants.innerHTML = `
        <h3 class="schedule-participants-heading" id="heading-${subId}">
            <button class="${buttonClass}" type="button"
                    data-bs-toggle="collapse" data-bs-target="#collapse-${subId}"
                    aria-expanded="${ariaExpanded}" aria-controls="collapse-${subId}">
                <span><i class="bi bi-list-ol" aria-hidden="true"></i> ${t('participants')}</span>
                <span class="schedule-participants-count">${escapeHtml(item.dancersList.length)}</span>
                <i class="bi bi-chevron-down schedule-participants-chevron" aria-hidden="true"></i>
            </button>
        </h3>
        <div id="collapse-${subId}" class="${collapseClass} schedule-participant-panel"
             aria-labelledby="heading-${subId}">
            <ul class="lm-list schedule-participant-list"></ul>
        </div>
    `;

    const list = participants.querySelector('ul');
    item.dancersList.forEach(dancer => {
        const dancerName = dancer.name || dancer.dancer_name || '';
        const clubLabel = getParticipantClubLabel(dancer);
        const dancerStatusBadge = item?.status === 'PRO' ? getDancerScheduleStatusBadge(dancer?.schedule_status) : '';
        const li = document.createElement('li');
        li.className = 'lm-list-item schedule-participant-row';
        li.innerHTML = `
            <span class="schedule-participant-position">#${escapeHtml(dancer.position ?? '')}</span>
            ${getDancerFlagImgHtml(dancer.nationality, { className: 'schedule-participant-flag' })}
            <span class="schedule-participant-identity">
                <span class="schedule-participant-name">${escapeHtml(dancerName)}</span>
                ${clubLabel ? `<span class="schedule-participant-club">${escapeHtml(clubLabel)}</span>` : ''}
            </span>
            ${dancerStatusBadge ? `<span class="schedule-participant-status">${dancerStatusBadge}</span>` : ''}
        `;
        list.appendChild(li);
    });

    card.appendChild(participants);

    return card;
}

function createScheduleBreakCard(item, { highlightLive = false } = {}) {
    const card = document.createElement('div');
    const isLiveItem = highlightLive && item?.status === 'PRO';
    const breakName = getScheduleBreakName(item);
    const breakDuration = formatBreakMinutesLabel(getScheduleBreakMinutes(item));

    card.className = `lm-card schedule-break${isLiveItem ? ' schedule-item-live' : ''}`;
    card.innerHTML = `
        <div class="lm-card-body schedule-break-body">
            <i class="bi bi-cup-hot schedule-break-icon" aria-hidden="true"></i>
            <div class="schedule-break-title">${escapeHtml(breakName)}</div>
            <div class="lm-badge lm-badge-warning schedule-break-duration">${escapeHtml(breakDuration)}</div>
        </div>
    `;

    return card;
}

function getScheduleItemBlockType(item) {
    const rawType = item?.block_type ?? item?.blockType ?? item?.detail?.block_type ?? item?.detail?.blockType ?? item?.type ?? 'COMP';
    const normalizedType = String(rawType || 'COMP').trim().toUpperCase();
    return normalizedType === 'BREAK' ? 'BREAK' : 'COMP';
}

function getScheduleBreakName(item) {
    const name = item?.break_name ?? item?.breakName ?? item?.detail?.break_name ?? item?.detail?.breakName ?? item?.name ?? '';
    return String(name || '').trim() || t('break_label', 'Break');
}

function getScheduleBreakMinutes(item) {
    const value = item?.break_time ?? item?.breakTime ?? item?.detail?.break_time ?? item?.detail?.breakTime ?? item?.minutes ?? null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
}

function formatBreakMinutesLabel(minutes) {
    if (minutes == null) return '-';
    return `${Math.trunc(minutes)} ${t('minutes_short', 'min')}`;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(getScheduleDateLocale(), { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
}

function getScheduleDateLocale() {
    if (lang === 'es') {
        return 'es-ES';
    } else if (lang === 'it') {
        return 'it-IT';
    } else if (lang === 'pt') {
        return 'pt-PT';
    } else if (lang === 'fr') {
        return 'fr-FR';
    }
    return 'en-GB';
}

function getStatusBadge(status) {
    let badgeClass = 'lm-status-neutral';
    let text = status;
    let icon = '';

    switch (status) {
        case 'FIN':
            badgeClass = 'lm-status-success';
            text = 'FINISHED';
            icon = 'bi-check2';
            break;
        case 'OPE':
            badgeClass = 'lm-status-info';
            text = 'OPEN';
            icon = 'bi-unlock';
            break;
        case 'CLO':
            badgeClass = 'lm-status-danger';
            text = 'CLOSED';
            icon = 'bi-lock';
            break;
        case 'PRO':
            badgeClass = 'lm-status-live';
            text = 'IN PROGRESS';
            icon = 'bi-broadcast';
            break;
    }

    return `<span class="lm-status ${badgeClass}">${icon ? `<i class="bi ${icon}" aria-hidden="true"></i>` : ''}${escapeHtml(text)}</span>`;
}

function getDancerScheduleStatusBadge(status) {
    const normalizedStatus = String(status || '').trim().toUpperCase();

    switch (normalizedStatus) {
        case 'FIN':
            return '<span class="lm-status lm-status-success">FINISHED</span>';
        case 'PEN':
            return '<span class="lm-status lm-status-warning">PENDING</span>';
        case 'NOS':
        case 'NO SHOW':
            return '<span class="lm-status lm-status-purple">NO SHOW</span>';
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
