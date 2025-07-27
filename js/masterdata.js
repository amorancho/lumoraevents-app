

/*var categoryList = [
    'Baby Amateur',
    'Baby Advenced',
    'Kid Amateur',
    'Kid Advenced',
    'Junior Amateur',
    'Junior Advenced',
    'Senior Amateur',
    'Senior Advenced',
    'Golden',
    'Amateur',
    'Semiprofessional',
    'Professional',
    'Master',
    'Group Oriental',
    'Group Folklore and Fusions',
    'Talento Nacional'
];*/
var styleList = [
    'Raqs sharki',
    'Baladi',
    'Shaabi',
    'Folklore',
    'Fusion',
    'Pop song',
    'Drum CD',
    'Live Drum'
];
var criteriaList = [
    'Choreography',
    'Technique',
    'Occupation',
    'Presence',
    'Interpretation',
    'Costume & Makeup'
];

var title = 'Event Master Data';

document.addEventListener('DOMContentLoaded', () => {

    updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
    updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${getEvent().id}`);
    updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${getEvent().id}`);
    updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${getEvent().id}`);

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
        const response = await fetch(`${API_BASE_URL}/api/${table}?event_id=${eventId}`);
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
                    if (!res.ok) throw new Error(`Failed to delete ${table} id=${id}`);
                    loadTable(table);
                } catch (error) {
                    alert(`Error deleting item: ${error.message}`);
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
                body: JSON.stringify({ event_id: getEventIdFromUrl(), name: value })
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


