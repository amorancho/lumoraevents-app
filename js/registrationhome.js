document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();

  const user = getUserFromToken();

  if (user && (user.role === 'admin' || ((user.role === 'organizer' || user.role === 'school') && user.eventId === eventId))) {
    window.location.href = `registration.html?eventId=${encodeURIComponent(eventId)}`;
    return;
  }

  updateElementProperty('loginLink', 'href', `login.html?eventId=${encodeURIComponent(eventId)}`);
  updateElementProperty('signupLink', 'href', `registrationsignup.html?eventId=${encodeURIComponent(eventId)}`);
});
