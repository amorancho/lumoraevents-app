// --- masterdata.js adaptado con Sortable ---
var title = 'Event Master Data';

const allowedRoles = ["admin", "organizer"];

document.addEventListener('DOMContentLoaded', async () => {
    validateRoles(allowedRoles);
    await eventReadyPromise;

    updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
    updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
    updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);
    updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

    const alertPanel = document.getElementById('alertPanel');
    if (getEvent().status !== 'upcoming') {
        alertPanel.style.display = 'block';
    }

    loadAll();
});

function loadAll() {
    loadTable("categories");
    loadTable("styles");
    loadTable("criteria");
}

async function loadTable(table) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/${table}?event_id=${getEvent().id}`);
        if (!response.ok) throw new Error(`Error loading ${table}`);
        const data = await response.json();

        // ordenar por position antes de pintar
        data.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

        renderTable(table, data);

        // activar drag&drop con Sortable
        makeSortable(table);
    } catch (error) {
        console.error(`Failed to load ${table}:`, error);
    }
}

function renderTable(table, fullData) {
    const list = document.getElementById(`list-${table}`);
    list.innerHTML = "";

    fullData.forEach((item) => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        li.dataset.id = item.id;

        // contenedor izquierda con icono + nombre
        const leftDiv = document.createElement("div");
        leftDiv.className = "d-flex align-items-center gap-2";

        const dragHandle = document.createElement("i");
        dragHandle.className = "bi bi-grip-vertical text-muted drag-handle";
        dragHandle.style.cursor = "grab";

        const span = document.createElement("span");
        span.textContent = item.name;

        leftDiv.appendChild(dragHandle);
        leftDiv.appendChild(span);

        // botón eliminar
        const btn = document.createElement("button");
        btn.className = "btn btn-link text-danger p-0 delete-btn";
        btn.innerHTML = '<i class="bi bi-trash"></i>';

        btn.onclick = async () => {
            const confirmed = await showModal(`Delete "${item.name}" from ${table}?`);
            if (confirmed) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/${table}/${item.id}`, { method: "DELETE" });
                    const data = await res.json();

                    if (!res.ok) {
                        showMessageModal(data.error || 'Unknown error', 'Error eliminando el item');
                        return;
                    }
                    loadTable(table);
                } catch (error) {
                    console.error('Unexpected error:', error);
                    showMessageModal(`Unexpected error: ${error.message}`, 'Error');
                }
            }
        };

        li.appendChild(leftDiv);
        li.appendChild(btn);
        list.appendChild(li);
    });

    // actualizar contador
    const countEl = document.getElementById(`count-${table}`);
    if (countEl) {
        countEl.textContent = fullData.length;
    }
}


async function addEntry(table) {
    const input = document.getElementById(`input-${table}`);
    const value = input.value.trim();

    if (value !== "") {
        try {
            const res = await fetch(`${API_BASE_URL}/api/${table}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event_id: getEvent().id, name: value })
            });
            if (!res.ok) throw new Error(`Failed to create ${table}`);
            input.value = "";
            loadTable(table);
        } catch (error) {
            console.error("Error en addEntry:", error);
        } finally {
            input.focus();
        }
    }
}

function showModal(message) {
    return new Promise((resolve) => {
        const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
        document.getElementById('deleteModalMessage').textContent = message;
    
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.onclick = () => {
            modal.hide();
            resolve(true);
        };
    
        modal.show();
    });
}

function makeSortable(table) {
    const list = document.getElementById(`list-${table}`);
    new Sortable(list, {
        animation: 150,
        handle: ".drag-handle", // <--- aquí le dices a Sortable qué usar como agarre
        onEnd: async (evt) => {
            const ids = Array.from(list.children).map((li, idx) => ({
                id: li.dataset.id,
                position: idx + 1
            }));

            try {
                const res = await fetch(`${API_BASE_URL}/api/${table}/reorder`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: ids })
                });

                if (!res.ok) {
                    const error = await res.json();
                    console.error("Error reordering:", error);
                }
            } catch (err) {
                console.error("Unexpected reorder error:", err);
            }
        }
    });
}
