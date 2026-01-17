//var title = 'Welcome';

const allowedRoles = ["admin", "organizer"];

const user = getUserFromToken();

const formatFecha = (isoString) => {
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-GB', { month: 'short' }); // 'Sep'
    return `${day}-${month}`;
};

document.addEventListener('DOMContentLoaded', async () => {

    await WaitEventLoaded();

    if (getEvent().notice_active && getEvent().notice_text.trim() !== '') {
        const noticePanel = document.getElementById('noticePanel');
        const noticeInnerPannel = document.getElementById('notice_type');
        noticeInnerPannel.classList.add(`alert-${getEvent().notice_type === 'IMP' ? 'danger' : 'success'}`);
        const noticeTextDiv = document.getElementById('notice_text');
        noticeTextDiv.innerText = getEvent().notice_text;
        noticePanel.style.display = 'block';
    }

    updateElementProperty('event-logo', 'src', getEvent().eventLogo);

    updateElementProperty('configUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('votingUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('participantsUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('scheduleUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('resultsUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('statisticsUrl', 'href', `?eventId=${eventId}`, false);

    const principalContainer = document.getElementById('principalContainer');
    const hiddenMessage = document.getElementById('eventHiddenMessage');

    const configCol = document.getElementById("col-configUrl");
    const votingCol = document.getElementById("col-votingUrl");
    const participantsCol = document.getElementById("col-participantsUrl");
    const scheduleCol = document.getElementById("col-scheduleUrl");
    const resultsCol = document.getElementById("col-resultsUrl");
    const statisticsCol = document.getElementById("col-statisticsUrl");
    const registrationCol = document.getElementById("col-registrationUrl");

    const user = getUserFromToken();

    if (user && (user.role === 'admin' || ((user.role === 'organizer' || user.role === 'school') && user.eventId === eventId))) {
        updateElementProperty('registrationUrl', 'href', `registration.html?eventId=${encodeURIComponent(eventId)}`);
    } else {
        updateElementProperty('registrationUrl', 'href', `registrationhome.html?eventId=${encodeURIComponent(eventId)}`);
    }

    if (validateRoles(allowedRoles, false)) {

        configCol.classList.remove("d-none");
        if (user.role === "admin") votingCol.classList.remove("d-none");
        participantsCol.classList.remove("d-none");
        scheduleCol.classList.remove("d-none");
        resultsCol.classList.remove("d-none");
        statisticsCol.classList.remove("d-none");
        //registrationCol.classList.remove("d-none");

        if ((["admin", "organizer"].includes(user.role)) && (getEvent().hasRegistration == 1)) {
            registrationCol.classList.remove("d-none");
        }

    } else if ((getEvent().visible)) {
        
        if (configCol && (!user || !["admin", "organizer"].includes(user.role))) {
            configCol.remove();
        } else {
            configCol.classList.remove("d-none");
        }

        if (votingCol && (!user || !["admin", "judge"].includes(user.role) || ( user.role === "judge" && getEvent().status === 'finished') || (getEvent().visibleJudges == 0) )) {
            votingCol.remove();
        } else {
            votingCol.classList.remove("d-none");
        }
        
        if (getEvent().visibleParticipants == 0) {
            participantsCol.remove();
        } else {
            participantsCol.classList.remove("d-none");
        }
        
        if (getEvent().visibleSchedule == 0) {
            scheduleCol.remove();
        } else {
            scheduleCol.classList.remove("d-none");
        }
        
        if (getEvent().visibleResults == 0) {
            resultsCol.remove();
        } else {
            resultsCol.classList.remove("d-none");
        }

        if (getEvent().visibleStatistics == 0) {
            statisticsCol.remove();
        } else {
            statisticsCol.classList.remove("d-none");
        }

        if ((getEvent().hasRegistration == 0) || getEvent().status !== 'upcoming' || (new Date() < new Date(getEvent().registrationStart)) || (new Date() > new Date(getEvent().registrationEnd)) ) {
            registrationCol.remove();
        } else {
            registrationCol.classList.remove("d-none");
        }

    } else {
        // Mostrar mensaje de evento oculto
        principalContainer.classList.add('d-none');
        hiddenMessage.classList.remove('d-none');
    }



});

