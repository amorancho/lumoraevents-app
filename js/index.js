document.addEventListener('DOMContentLoaded', () => {

    updateElementProperty('event-logo', 'src', getEvent().eventLogo);

    updateElementProperty('configUrl', 'href', `?eventId=${eventId}`, false);
    updateElementProperty('judgesUrl', 'href', `?eventId=${getEvent().id}`, false);
    updateElementProperty('participantsUrl', 'href', `?eventId=${getEvent().id}`, false);
    updateElementProperty('resultsUrl', 'href', `?eventId=${getEvent().id}`, false);

});