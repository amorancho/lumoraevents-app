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

  const toggleVisible = document.getElementById('flexSwitchCheckDefault');

  console.log('visible: ', getEvent().visible);

  toggleVisible.checked = getEvent().visible;

  toggleVisible.addEventListener('change', async () => {

    // confirmar acción
    const confirmed = await showModal("¿Seguro que quieres cambiar la visibilidad del evento?");

    if (confirmed) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/events/${getEvent().id}/setvisible`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ visible: toggleVisible.checked ? 1 : 0 })
        });

        if (!response.ok) {
          toggleVisible.checked = !toggleVisible.checked;
          const errData = await response.json();
          showMessageModal(errData.error || 'Error updating event', 'Error');
          return;
        }

      } catch (error) {
        console.error('Error al actualizar visibilidad:', error);
        // opcional: revertir el toggle si hubo error
        toggleVisible.checked = !toggleVisible.checked;
      }
    } else {
      console.log('hola');
      toggleVisible.checked = !toggleVisible.checked;
    }
  });

});

function showModal(message) {
  return new Promise((resolve) => {
    const modalElement = document.getElementById('deleteModal');
    const modal = new bootstrap.Modal(modalElement);
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const messageEl = document.getElementById('deleteModalMessage');

    messageEl.textContent = message;

    const onConfirm = () => {
      cleanup();
      modal.hide();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      modal.hide();
      resolve(false);
    };

    const cleanup = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      modalElement.removeEventListener('hidden.bs.modal', onCancel);
    };

    confirmBtn.addEventListener('click', onConfirm, { once: true });
    cancelBtn.addEventListener('click', onCancel, { once: true });
    modalElement.addEventListener('hidden.bs.modal', onCancel, { once: true });

    modal.show();
  });
}


