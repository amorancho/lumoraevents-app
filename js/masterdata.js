var title = 'Event Master Data';

document.addEventListener('DOMContentLoaded', async () => {

    await eventReadyPromise;

    updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
    updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
    updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);
    updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

    loadAll();

});

function loadAll() {

    loadTable("category");
    loadTable("style");
    loadTable("criteria");
}

async function loadTable(table) {
    try {
        const eventId = getEventIdFromUrl();
        const response = await fetch(`${API_BASE_URL}/api/${table}?event_id=${getEvent().id}`);
        if (!response.ok) throw new Error(`Error loading ${table}`);
        const data = await response.json();

        // Si el backend devuelve objetos con "name", extrae los nombres
        const names = data.map(item => item.name);
        renderTable(table, names, data);
    } catch (error) {
        console.error(`Failed to load ${table}:`, error);
    }
}

function renderTable(table, names, fullData) {
    const list = document.getElementById(`list-${table}`);
    list.innerHTML = "";

    names.forEach((item, i) => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";

        const span = document.createElement("span");
        span.textContent = item;

        const btn = document.createElement("button");
        btn.className = "btn btn-link text-danger p-0 delete-btn";
        btn.innerHTML = '<i class="bi bi-trash"></i>';

        btn.onclick = async () => {
            const confirmed = await showModal(`Delete "${item}" from ${table}?`);
            if (confirmed) {
                try {
                const id = fullData[i].id;
                const res = await fetch(`${API_BASE_URL}/api/${table}/${id}`, { method: "DELETE" });

                const data = await res.json();

                if (!res.ok) {
                    showMessageModal(data.error || 'Unknown error', 'Error eliminando el item');
                    return; // Sales sin error para que no vaya al catch
                }

                loadTable(table);
                } catch (error) {
                // Este catch ya sería sólo para errores inesperados tipo red caida
                console.error('Unexpected error:', error);
                showMessageModal(`Unexpected error: ${error.message}`, 'Error');
                }
            }
        };

        li.appendChild(span);
        li.appendChild(btn);
        list.appendChild(li);
    });
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


