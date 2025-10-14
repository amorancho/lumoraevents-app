var title = 'Event Configuration';

const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {

  validateRoles(allowedRoles);

  //await eventReadyPromise;
  await WaitEventLoaded();

  updateElementProperty('masterdataUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('judgesUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('dancersUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('competitionsUrl', 'href', `?eventId=${eventId}`, false);
  updateElementProperty('trackingUrl', 'href', `?eventId=${eventId}`, false);

  const toggleVisible = document.getElementById('flexSwitchCheckDefault');

  toggleVisible.checked = getEvent().visible;

  toggleVisible.addEventListener('change', async () => {
    const isMakingVisible = toggleVisible.checked;

    const { confirmed, notifyJudges } = await showVisibilityModal(
      isMakingVisible
        ? "¿Seguro que quieres marcar el evento como visible?"
        : "¿Seguro que quieres ocultar el evento?",
      isMakingVisible // solo mostrar checkbox si está marcando visible
    );

    if (!confirmed) {
      toggleVisible.checked = !isMakingVisible; // revertir toggle
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}/setvisible`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: isMakingVisible ? 1 : 0, notify_judges: notifyJudges })
      });

      if (!response.ok) {
        toggleVisible.checked = !isMakingVisible;
        const errData = await response.json();
        showMessageModal(errData.error || 'Error updating event', 'Error');
      }
    } catch (err) {
      console.error('Error al actualizar visibilidad:', err);
      toggleVisible.checked = !isMakingVisible; // revertir toggle si hay error
    }
  });




});

function showVisibilityModal(message, showCheckbox = false) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('visibilityModal');
    const modal = new bootstrap.Modal(modalEl);
    const confirmBtn = document.getElementById('visibilityConfirmBtn');
    const cancelBtn = document.getElementById('visibilityCancelBtn');
    const messageEl = document.getElementById('visibilityModalMessage');
    const checkboxContainer = document.getElementById('notifyJudgesContainer');
    const checkbox = document.getElementById('notifyJudgesCheck');

    messageEl.textContent = message;
    checkboxContainer.style.display = showCheckbox ? 'block' : 'none';
    checkbox.checked = false;

    const cleanup = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
    };

    const onConfirm = () => {
      cleanup();
      modal.hide();
      resolve({ confirmed: true, notifyJudges: showCheckbox ? checkbox.checked : false });
    };

    const onCancel = () => {
      cleanup();
      modal.hide();
      resolve({ confirmed: false, notifyJudges: false });
    };

    confirmBtn.addEventListener('click', onConfirm, { once: true });
    cancelBtn.addEventListener('click', onCancel, { once: true });

    modal.show();
  });
}



