//var title = 'Event Configuration';

const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;
  await WaitEventLoaded();

  updateElementProperty('admineventUrl', 'href', `adminevent.html?eventId=${eventId}`);
  updateElementProperty('masterdataUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('judgesUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('dancersUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('competitionsUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('trackingUrl', 'href', `?eventId=${eventId}`, false);

  await loadTranslations(savedLang, pageName);
  applyTranslations();

});




