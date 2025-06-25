var title = 'Welcome';

document.addEventListener('DOMContentLoaded', () => {
    
    updateElementProperty('event-logo', 'src', getEvent().eventLogo);

    updateElementProperty('configUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('votingUrl', 'href', `?eventId=${getEvent().id}`, false);
    updateElementProperty('participantsUrl', 'href', `?eventId=${getEvent().id}`, false);
    updateElementProperty('resultsUrl', 'href', `?eventId=${getEvent().id}`, false);

});