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

    const principalContainer = document.getElementById('principalContainer');
    const hiddenMessage = document.getElementById('eventHiddenMessage');

    if ((getEvent().visible) || validateRoles(allowedRoles, false)) {

        const user = getUserFromToken();

        const configCol = document.getElementById("col-configUrl");
        if (configCol && (!user || !["admin", "organizer"].includes(user.role))) {
            configCol.remove();
        } else {
            configCol.classList.remove("d-none");
        }

        // Voting card solo para admin + judge
        const votingCol = document.getElementById("col-votingUrl");
        if (votingCol && (!user || !["admin", "judge"].includes(user.role) || ( user.role === "judge" && getEvent().status === 'completed') || (getEvent().visibleJudges == 0) )) {
            votingCol.remove();
        } else {
            votingCol.classList.remove("d-none");
        }

        const participantsCol = document.getElementById("col-participantsUrl");
        if (getEvent().visibleParticipants == 0) {
            participantsCol.remove();
        } else {
            participantsCol.classList.remove("d-none");
        }

        const scheduleCol = document.getElementById("col-scheduleUrl");
        if (getEvent().visibleSchedule == 0) {
            scheduleCol.remove();
        } else {
            scheduleCol.classList.remove("d-none");
        }

        const resultsCol = document.getElementById("col-resultsUrl");
        if (getEvent().visibleResults == 0) {
            resultsCol.remove();
        } else {
            resultsCol.classList.remove("d-none");
        }

        updateElementProperty('event-logo', 'src', getEvent().eventLogo);

        updateElementProperty('configUrl', 'href', `?eventId=${eventId}`, false);
        updateElementProperty('votingUrl', 'href', `?eventId=${eventId}`, false);
        updateElementProperty('participantsUrl', 'href', `?eventId=${eventId}`, false);
        updateElementProperty('scheduleUrl', 'href', `?eventId=${eventId}`, false);
        updateElementProperty('resultsUrl', 'href', `?eventId=${eventId}`, false);

    } else {
        // Mostrar mensaje de evento oculto
        principalContainer.classList.add('d-none');
        hiddenMessage.classList.remove('d-none');
    }
    
});