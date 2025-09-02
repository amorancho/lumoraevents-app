var title = 'Event Configuration';

const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  await eventReadyPromise;

  updateElementProperty('masterdataUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('judgesUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('dancersUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('competitionsUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('trackingUrl', 'href', `?eventId=${eventId}`, false);

});