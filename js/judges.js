var title = 'Judges';

document.addEventListener('DOMContentLoaded', () => {

  updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `masterdata.html?eventId=${getEvent().id}`);
  updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${getEvent().id}`);
  updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${getEvent().id}`);


});