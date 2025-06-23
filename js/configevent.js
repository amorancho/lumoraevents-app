var title = 'Event Configuration';

document.addEventListener('DOMContentLoaded', () => {

  // Actualizar propiedades de los elementos
  updateElementProperty('event-logo', 'src', getEvent().eventLogo);

  updateElementProperty('masterdataUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('judgesUrl', 'href', `?eventId=${getEvent().id}`, false);
  updateElementProperty('dancersUrl', 'href', `?eventId=${getEvent().id}`, false);
  updateElementProperty('competitionsUrl', 'href', `?eventId=${getEvent().id}`, false);

});