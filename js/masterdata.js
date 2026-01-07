// --- masterdata.js adaptado con Sortable ---
//var title = 'Event Master Data';

const allowedRoles = ["admin", "organizer"];
let categoriesList = [];
let stylesList = [];
let criteriaList = [];
let criteriaConfigList = [];

document.addEventListener('DOMContentLoaded', async () => {
    validateRoles(allowedRoles);
    //await eventReadyPromise;
    await WaitEventLoaded();

    //setPenaltysVisibility();

    updateElementProperty('admineventUrl', 'href', `adminevent.html?eventId=${eventId}`);
    updateElementProperty('eventconfigUrl', 'href', `configevent.html?eventId=${eventId}`);
    updateElementProperty('judgesUrl', 'href', `judges.html?eventId=${eventId}`);
    updateElementProperty('dancersUrl', 'href', `dancers.html?eventId=${eventId}`);
    updateElementProperty('competitionsUrl', 'href', `competitions.html?eventId=${eventId}`);

    const alertPanel = document.getElementById('alertPanel');
    const closedPanel = document.getElementById('closedPanel');
    if (getEvent().status == 'ongoing') {
        alertPanel.style.display = 'block';
    }

    if (getEvent().status == 'completed') {
        closedPanel.style.display = 'block';

        // deshabilitar inputs y botones
        document.querySelectorAll('input, button').forEach(el => el.disabled = true);
    }

    setupCriteriaConfigTab();
    bindCriteriaConfigEvents();
    await loadAll();

});

function setPenaltysVisibility() {
    const hasPenalties = getEvent().has_penalties;
    const penaltyBox = document.getElementById('penalty_box');
    
    // Si tiene penalizaciones, la clase col-lg-3, si no tiene, col-lg-4
    const sizeClass = hasPenalties ? 'col-lg-3' : 'col-lg-4';
    document.getElementById('category_box').className = `col-12 ${sizeClass}`;
    document.getElementById('style_box').className = `col-12 ${sizeClass}`;
    document.getElementById('criteria_box').className = `col-12 ${sizeClass}`;
    document.getElementById('penalty_box').className = `col-12 ${sizeClass}`;

    if (hasPenalties) {
        penaltyBox.style.display = 'block';
    } else {
        penaltyBox.style.display = 'none';
    }
}

async function loadAll() {
    await Promise.all([
        loadTable("categories"),
        loadTable("styles"),
        loadTable("criteria"),
        loadTable("penalties"),
        loadTable("clubs")
    ]);

    if (shouldShowCriteriaConfigTab()) {
        populateCriteriaConfigOptions();
        await loadCriteriaConfig();
    }
}

async function loadTable(table) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/${table}?event_id=${getEvent().id}`);
        if (!response.ok) throw new Error(`Error loading ${table}`);
        const data = await response.json();

        // ordenar por position antes de pintar
        data.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

        if (table === "categories") {
            categoriesList = data;
        } else if (table === "styles") {
            stylesList = data;
        } else if (table === "criteria") {
            criteriaList = data;
        }

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

        if ((getEvent().status !== 'completed') && (table !== 'clubs')) {

            const dragHandle = document.createElement("i");
            dragHandle.className = "bi bi-grip-vertical text-muted drag-handle";
            dragHandle.style.cursor = "grab";
            leftDiv.appendChild(dragHandle);
        }

        const span = document.createElement("span");
        span.textContent = item.name;

        
        leftDiv.appendChild(span);

        li.appendChild(leftDiv);

        if (getEvent().status !== 'completed') {

            // botón eliminar
            const btn = document.createElement("button");
            btn.className = "btn btn-link text-danger p-0 delete-btn";
            btn.innerHTML = '<i class="bi bi-trash"></i>';

            btn.onclick = async () => {
                const confirmed = await showModal(`${t('delete')} "${item.name}" ${t('from')} <strong>${t(table)}</strong>?`);
                if (confirmed) {
                    try {
                        const res = await fetch(`${API_BASE_URL}/api/${table}/${item.id}`, { method: "DELETE" });
                        const data = await res.json();

                        if (!res.ok) {
                            showMessageModal(data.error || 'Unknown error', t('error_deleting'));
                            return;
                        }
                        loadTable(table);
                    } catch (error) {
                        console.error('Unexpected error:', error);
                        showMessageModal(`Unexpected error: ${error.message}`, 'Error');
                    }
                }
            };
            li.appendChild(btn);
        }

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
            if (!res.ok) {
                const error = await res.json();
                showMessageModal(error.error || 'Unknown error', 'Error adding entry');
                return;
            }
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
        document.getElementById('deleteModalMessage').innerHTML = message;
    
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


function shouldShowCriteriaConfigTab() {
    console.log(getEvent());
    return getEvent()?.criteriaConfig && getEvent().criteriaConfig !== 'NO_CONFIG';
}

function setupCriteriaConfigTab() {
    const tab = document.getElementById('tab-criteria-config-tab');
    const pane = document.getElementById('tab-criteria-config');
    if (!tab || !pane) return;

    if (!shouldShowCriteriaConfigTab()) {
        tab.classList.add('d-none');
        pane.classList.add('d-none');
        return;
    }

    const showPorcentage = getEvent().criteriaConfig === 'WITH_POR';
    const porcentageField = document.getElementById('criteria-config-porcentage-field');
    const porcentageHeader = document.getElementById('criteria-config-porcentage-header');

    if (porcentageField) {
        porcentageField.classList.toggle('d-none', !showPorcentage);
    }
    if (porcentageHeader) {
        porcentageHeader.classList.toggle('d-none', !showPorcentage);
    }
}

function bindCriteriaConfigEvents() {
    const addBtn = document.getElementById('criteria-config-add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addCriteriaConfig);
    }

    const categoriesAll = document.getElementById('criteria-config-categories-all');
    const categoriesNone = document.getElementById('criteria-config-categories-none');
    const stylesAll = document.getElementById('criteria-config-styles-all');
    const stylesNone = document.getElementById('criteria-config-styles-none');

    if (categoriesAll) categoriesAll.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-categories', true));
    if (categoriesNone) categoriesNone.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-categories', false));
    if (stylesAll) stylesAll.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-styles', true));
    if (stylesNone) stylesNone.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-styles', false));

    const tableBody = document.getElementById('criteria-config-table');
    if (tableBody) {
        tableBody.addEventListener('click', async (event) => {
            const deleteBtn = event.target.closest('.btn-delete-criteria-config');
            if (!deleteBtn) return;

            const id = deleteBtn.dataset.id;
            if (!id) return;
            const confirmed = await showModal('Deseas eliminar esta configuracion?');
            if (!confirmed) return;

            await deleteCriteriaConfig(id);
            await loadCriteriaConfig();
        });
    }
}

function populateCriteriaConfigOptions() {
    const criteriaSelect = document.getElementById('criteria-config-criteria');
    if (criteriaSelect) {
        criteriaSelect.innerHTML = '';
        criteriaList.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            criteriaSelect.appendChild(option);
        });
    }

    renderCriteriaConfigCheckboxes('criteria-config-categories', categoriesList, 'category');
    renderCriteriaConfigCheckboxes('criteria-config-styles', stylesList, 'style');
}

function renderCriteriaConfigCheckboxes(containerId, items, namePrefix) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'text-muted small';
        empty.textContent = 'Sin datos';
        container.appendChild(empty);
        return;
    }

    items.forEach((item) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'form-check';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'form-check-input';
        input.id = `criteria-config-${namePrefix}-${item.id}`;
        input.value = item.id;

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.setAttribute('for', input.id);
        label.textContent = item.name;

        wrapper.appendChild(input);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
}

function setAllCriteriaConfigChecks(containerId, checked) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = checked;
    });
}

function getCriteriaConfigCheckedValues(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
}

async function loadCriteriaConfig() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/criteria/config?event_id=${getEvent().id}`);
        if (!response.ok) throw new Error('Error loading criteria config');
        criteriaConfigList = await response.json();
        renderCriteriaConfigTable();
    } catch (error) {
        console.error('Failed to load criteria config:', error);
    }
}

function renderCriteriaConfigTable() {
    const tableBody = document.getElementById('criteria-config-table');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const showPorcentage = getEvent().criteriaConfig === 'WITH_POR';
    const porcentageClass = showPorcentage ? '' : 'd-none';

    const categoryMap = new Map(categoriesList.map((item) => [String(item.id), item.name]));
    const styleMap = new Map(stylesList.map((item) => [String(item.id), item.name]));
    const criteriaMap = new Map(criteriaList.map((item) => [String(item.id), item.name]));

    criteriaConfigList.forEach((item) => {
        const tr = document.createElement('tr');

        const categoryName = item.category_name || categoryMap.get(String(item.category_id)) || `#${item.category_id}`;
        const styleName = item.style_name || styleMap.get(String(item.style_id)) || `#${item.style_id}`;
        const criteriaName = item.criteria_name || criteriaMap.get(String(item.criteria_id)) || `#${item.criteria_id}`;
        const porcentageVal = item.porcentage ?? item.percentage ?? '';

        tr.innerHTML = `
            <td>${categoryName}</td>
            <td>${styleName}</td>
            <td>${criteriaName}</td>
            <td class="${porcentageClass}">${showPorcentage ? porcentageVal : ''}</td>
            <td class="text-center">
                <button type="button" class="btn btn-link text-danger p-0 btn-delete-criteria-config" data-id="${item.id}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;

        tableBody.appendChild(tr);
    });

    const countEl = document.getElementById('count-criteria-config');
    if (countEl) countEl.textContent = criteriaConfigList.length;
}

async function addCriteriaConfig() {
    const criteriaSelect = document.getElementById('criteria-config-criteria');
    if (!criteriaSelect) return;

    const criteriaId = Number(criteriaSelect.value);
    if (!criteriaId) {
        showMessageModal('Selecciona un criterio.', 'Error');
        return;
    }

    const categories = getCriteriaConfigCheckedValues('criteria-config-categories');
    const styles = getCriteriaConfigCheckedValues('criteria-config-styles');

    if (!categories.length || !styles.length) {
        showMessageModal('Selecciona al menos una categoria y un estilo.', 'Error');
        return;
    }

    const needsPorcentage = getEvent().criteriaConfig === 'WITH_POR';
    let porcentage = null;
    if (needsPorcentage) {
        const input = document.getElementById('criteria-config-porcentage');
        porcentage = input ? Number(input.value) : null;
        if (porcentage === null || Number.isNaN(porcentage) || porcentage < 0 || porcentage > 100) {
            showMessageModal('Indica un porcentaje valido.', 'Error');
            return;
        }
    }

    const payloads = [];
    categories.forEach((categoryId) => {
        styles.forEach((styleId) => {
            payloads.push({
                event_id: getEvent().id,
                category_id: Number(categoryId),
                style_id: Number(styleId),
                criteria_id: criteriaId,
                porcentage: needsPorcentage ? porcentage : null
            });
        });
    });

    const results = await Promise.allSettled(payloads.map(async (payload) => {
        const res = await fetch(`${API_BASE_URL}/api/criteria/config`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Error saving criteria config');
        }
    }));

    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
        showMessageModal('Algunas combinaciones no se pudieron guardar.', 'Error');
    }

    await loadCriteriaConfig();
}

async function deleteCriteriaConfig(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/criteria/config/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showMessageModal(data.error || 'Error deleting criteria config', 'Error');
        }
    } catch (error) {
        console.error('Error deleting criteria config:', error);
        showMessageModal('Error deleting criteria config', 'Error');
    }
}
