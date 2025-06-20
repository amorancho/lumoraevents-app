

var categoryList = [
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
];
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

document.addEventListener('DOMContentLoaded', () => {

    loadAll();

});

function loadAll() {

    loadTable("category");
    loadTable("style");
    loadTable("criteria");
}

function loadTable(table) {
    // Fetch para cargar los datos de la tabla desde el servidor

    // Cambiar esto por una sola línea pq el fetch ya devolverá el objeto a renderizar
    if (table === "category") {
        renderTable(table, categoryList)
    } else if (table === "style") {
        renderTable(table, styleList)
    } else if (table === "criteria") {
        renderTable(table, criteriaList)
    }
}


function renderTable(table, data) {

    const list = document.getElementById(`list-${table}`);
    list.innerHTML = "";

    data.forEach((item, i) => {
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

                
                //Fetch para eliminar el elemento del servidor

                if (table === "category") {
                    categoryList.splice(i, 1); // Eliminar del array
                } else if (table === "style") {
                    styleList.splice(i, 1); // Eliminar del array
                } else if (table === "criteria") {
                    criteriaList.splice(i, 1); // Eliminar del array
                }
                
                // Recargar datos
                loadTable(table);
                
            } catch (error) {
                // Opcional: Mostrar mensaje de error al usuario
                alert(`Error deleting item: ${error.message}`);
            } finally {
                // Ocultar spinner (aunque loadTable ya lo maneja)
                const spinner = document.getElementById(`${table}-spinner`);
                spinner.classList.add('d-none');
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
    const button = input.nextElementSibling;
    const spinner = document.getElementById(`${table}-spinner`);
    
    if (value !== "") {
    try {

        // Fetch haciendo un post al servidor para agregar la entrada

        // cambiar esto por una sola línea pq el fetch ya devolverá el objeto a renderizar
        if (table === "category") {
            categoryList.push(value);
        } else if (table === "style") {
            styleList.push(value);
        } else if (table === "criteria") {
            criteriaList.push(value);
        }

        input.value = "";

        loadTable(table);
        
    } catch (error) {
        // Aquí puedes mostrar un mensaje de error al usuario si lo deseas
        console.error("Error en addEntry:", error);
    } finally {
        // Siempre ocultar spinner y habilitar controles
        input.focus(); // Opcional: volver a poner foco en el input
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


