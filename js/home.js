var title = 'Welcome';

const user = getUserFromToken();

const formatFecha = (isoString) => {
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-GB', { month: 'short' }); // 'Sep'
    return `${day}-${month}`;
};

document.addEventListener('DOMContentLoaded', async () => {

    const user = getUserFromToken();

    const configCol = document.getElementById("col-configUrl");
    if (configCol && (!user || !["admin", "organizer"].includes(user.role))) {
        configCol.remove();
    }

    // Voting card solo para admin + judge
    const votingCol = document.getElementById("col-votingUrl");
    if (votingCol && (!user || !["admin", "organizer", "judge"].includes(user.role))) {
        votingCol.remove();
    }

    await eventReadyPromise;


    updateElementProperty('event-logo', 'src', getEvent().eventLogo);

    updateElementProperty('configUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('votingUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('participantsUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('resultsUrl', 'href', `?eventId=${eventId}`, false);

    
});