var title = 'Welcome';

const formatFecha = (isoString) => {
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-GB', { month: 'short' }); // 'Sep'
    return `${day}-${month}`;
};

document.addEventListener('DOMContentLoaded', async () => {

    await eventReadyPromise;


    updateElementProperty('event-logo', 'src', getEvent().eventLogo);

    updateElementProperty('configUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('votingUrl', 'href', `?eventId=${getEvent().id}`, false);
    updateElementProperty('participantsUrl', 'href', `?eventId=${getEvent().id}`, false);
    updateElementProperty('resultsUrl', 'href', `?eventId=${getEvent().id}`, false);

    
});