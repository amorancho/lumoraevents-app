// --- masterdata.js adaptado con Sortable ---
//var title = 'Event Master Data';

const allowedRoles = ["admin", "organizer"];
let categoriesList = [];
let stylesList = [];
let criteriaList = [];
let clubsList = [];
let penaltiesList = [];
let criteriaConfigList = [];
let filteredCriteriaConfigIds = [];

document.addEventListener('DOMContentLoaded', async () => {
    validateRoles(allowedRoles);
    //await eventReadyPromise;
    await WaitEventLoaded();
    await ensureTranslationsReady();

    const alertPanel = document.getElementById('alertPanel');
    const closedPanel = document.getElementById('closedPanel');
    if (getEvent().status == 'ongoing') {
        alertPanel.style.display = 'block';
    }

    if (getEvent().status == 'finished') {
        closedPanel.style.display = 'block';

        // deshabilitar inputs y botones
        document.querySelectorAll('input, button').forEach(el => el.disabled = true);
    }

    setupCriteriaConfigTab();
    setupClubsTab();
    setupPenaltiesTab();
    bindCriteriaConfigEvents();
    bindSchoolsEvents();
    bindPenaltiesEvents();
    await loadAll();

});

async function loadAll() {
    const tablesToLoad = [
        loadTable("categories"),
        loadTable("styles"),
        loadTable("criteria")
    ];

    await Promise.all(tablesToLoad);

    if (shouldShowPenaltiesTab()) {
        await loadPenaltiesTable();
    }

    if (shouldShowClubsTab()) {
        await loadSchoolsTable();
    }

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

        if (getEvent().status !== 'finished') {

            const dragHandle = document.createElement("i");
            dragHandle.className = "bi bi-grip-vertical text-muted drag-handle";
            dragHandle.style.cursor = "grab";
            leftDiv.appendChild(dragHandle);
        }

        const span = document.createElement("span");
        span.textContent = item.name;

        
        leftDiv.appendChild(span);

        li.appendChild(leftDiv);

        if (getEvent().status !== 'finished') {

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
                        if (shouldReloadCriteriaConfig(table)) {
                            await loadAll();
                        } else {
                            await loadTable(table);
                        }
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
            if (shouldReloadCriteriaConfig(table)) {
                await loadAll();
            } else {
                await loadTable(table);
            }
        } catch (error) {
            console.error("Error en addEntry:", error);
        } finally {
            input.focus();
        }
    }
}

function bindSchoolsEvents() {
    if (!shouldShowClubsTab()) {
        return;
    }

    const createBtn = document.getElementById('createNewSchoolBtn');
    const saveBtn = document.getElementById('saveSchoolBtn');
    const tableBody = document.getElementById('clubsTable');
    const modalEl = document.getElementById('schoolModal');
    const form = document.getElementById('schoolForm');

    if (!createBtn || !saveBtn || !tableBody || !modalEl || !form) {
        return;
    }

    const schoolModal = new bootstrap.Modal(modalEl);

    createBtn.addEventListener('click', () => {
        openSchoolModal({ modal: schoolModal, action: 'create' });
    });

    tableBody.addEventListener('click', async (event) => {
        const editBtn = event.target.closest('.btn-edit-school');
        if (editBtn) {
            const id = editBtn.closest('tr')?.dataset?.id;
            const school = clubsList.find((item) => String(item.id) === String(id));
            if (!school) return;
            openSchoolModal({ modal: schoolModal, action: 'edit', school });
            return;
        }

        const deleteBtn = event.target.closest('.btn-delete-school');
        if (!deleteBtn) return;

        const id = deleteBtn.closest('tr')?.dataset?.id;
        const school = clubsList.find((item) => String(item.id) === String(id));
        if (!school) return;

        const confirmed = await showModal(`${t('delete')} "${school.name}" ${t('from')} <strong>${t('clubs')}</strong>?`);
        if (!confirmed) return;

        await deleteSchool(id);
    });

    saveBtn.addEventListener('click', async () => {
        const action = form.dataset.action || 'create';
        const schoolId = form.dataset.id || null;
        await saveSchool(action, schoolId, schoolModal, saveBtn);
    });

    modalEl.addEventListener('shown.bs.modal', () => {
        document.getElementById('schoolNameInput')?.focus();
    });
}

function bindPenaltiesEvents() {
    if (!shouldShowPenaltiesTab()) {
        return;
    }

    const createBtn = document.getElementById('createNewPenaltyBtn');
    const saveBtn = document.getElementById('savePenaltyBtn');
    const tableBody = document.getElementById('penaltiesTable');
    const modalEl = document.getElementById('penaltyModal');
    const form = document.getElementById('penaltyForm');

    if (!createBtn || !saveBtn || !tableBody || !modalEl || !form) {
        return;
    }

    const penaltyModal = new bootstrap.Modal(modalEl);

    createBtn.addEventListener('click', () => {
        openPenaltyModal({ modal: penaltyModal, action: 'create' });
    });

    tableBody.addEventListener('click', async (event) => {
        const editBtn = event.target.closest('.btn-edit-penalty');
        if (editBtn) {
            const id = editBtn.closest('tr')?.dataset?.id;
            const penalty = penaltiesList.find((item) => String(item.id) === String(id));
            if (!penalty) return;
            openPenaltyModal({ modal: penaltyModal, action: 'edit', penalty });
            return;
        }

        const deleteBtn = event.target.closest('.btn-delete-penalty');
        if (!deleteBtn) return;

        const id = deleteBtn.closest('tr')?.dataset?.id;
        const penalty = penaltiesList.find((item) => String(item.id) === String(id));
        if (!penalty) return;

        const confirmed = await showModal(`${t('delete')} "${penalty.name}" ${t('from')} <strong>${t('penalties')}</strong>?`);
        if (!confirmed) return;

        await deletePenalty(id);
    });

    saveBtn.addEventListener('click', async () => {
        const action = form.dataset.action || 'create';
        const penaltyId = form.dataset.id || null;
        await savePenalty(action, penaltyId, penaltyModal, saveBtn);
    });

    modalEl.addEventListener('shown.bs.modal', () => {
        document.getElementById('penaltyNameInput')?.focus();
    });
}

function shouldShowClubsTab() {
    const rawHasClubs = getEvent()?.hasClubs;
    if (rawHasClubs === true || rawHasClubs === 1) return true;
    if (typeof rawHasClubs === 'string') {
        const normalized = rawHasClubs.trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    return false;
}

function setupClubsTab() {
    const tab = document.getElementById('tab-clubs-tab');
    const pane = document.getElementById('tab-clubs');
    if (!tab || !pane) return;

    const showClubs = shouldShowClubsTab();
    tab.classList.toggle('d-none', !showClubs);
    pane.classList.toggle('d-none', !showClubs);
}

function shouldShowPenaltiesTab() {
    const rawHasPenalties = getEvent()?.has_penalties;
    if (rawHasPenalties === true || rawHasPenalties === 1) return true;
    if (typeof rawHasPenalties === 'string') {
        const normalized = rawHasPenalties.trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    return false;
}

function setupPenaltiesTab() {
    const tab = document.getElementById('tab-penalties-tab');
    const pane = document.getElementById('tab-penalties');
    if (!tab || !pane) return;

    const showPenalties = shouldShowPenaltiesTab();
    tab.classList.toggle('d-none', !showPenalties);
    pane.classList.toggle('d-none', !showPenalties);
}

function parseBooleanValue(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    return false;
}

function openPenaltyModal({ modal, action, penalty = null }) {
    const form = document.getElementById('penaltyForm');
    const title = document.getElementById('penaltyModalTitle');
    const nameInput = document.getElementById('penaltyNameInput');
    const forJudgesInput = document.getElementById('penaltyForJudgesInput');
    const minInput = document.getElementById('penaltyMinInput');
    const maxInput = document.getElementById('penaltyMaxInput');

    if (!form || !title || !nameInput || !forJudgesInput || !minInput || !maxInput) {
        return;
    }

    form.dataset.action = action;
    if (action === 'edit' && penalty) {
        form.dataset.id = penalty.id;
        nameInput.value = penalty.name || '';
        forJudgesInput.checked = parseBooleanValue(penalty.for_judges);
        minInput.value = penalty.min_penalty ?? '';
        maxInput.value = penalty.max_penalty ?? '';
        title.textContent = t('penalty_modal_edit', 'Edit penalty');
    } else {
        delete form.dataset.id;
        nameInput.value = '';
        forJudgesInput.checked = false;
        minInput.value = '';
        maxInput.value = '';
        title.textContent = t('penalty_modal_create', 'Create penalty');
    }

    modal.show();
}

async function loadPenaltiesTable() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/penalties?event_id=${getEvent().id}`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showMessageModal(err.error || t('penalties_load_error', 'Error loading penalties.'), t('error'));
            return;
        }

        const data = await response.json();
        penaltiesList = Array.isArray(data) ? data : [];
        penaltiesList.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
        renderPenaltiesTable();
    } catch (error) {
        console.error('Failed to load penalties:', error);
        showMessageModal(t('penalties_load_error', 'Error loading penalties.'), t('error'));
    }
}

function renderPenaltiesTable() {
    const tableBody = document.getElementById('penaltiesTable');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    penaltiesList.forEach((penalty) => {
        const row = document.createElement('tr');
        row.dataset.id = penalty.id;

        const isFinished = getEvent().status === 'finished';
        const nameCell = document.createElement('td');
        nameCell.textContent = penalty?.name || '-';

        const forJudgesCell = document.createElement('td');
        forJudgesCell.className = 'text-center';
        const enabledForJudges = parseBooleanValue(penalty?.for_judges);
        forJudgesCell.innerHTML = enabledForJudges
            ? '<i class="bi bi-check-circle-fill text-success"></i>'
            : '<i class="bi bi-dash-circle text-muted"></i>';

        const minCell = document.createElement('td');
        minCell.textContent = penalty?.min_penalty ?? '-';

        const maxCell = document.createElement('td');
        maxCell.textContent = penalty?.max_penalty ?? '-';

        const actionsCell = document.createElement('td');
        actionsCell.className = 'text-center align-middle';
        const btnGroup = document.createElement('div');
        btnGroup.className = 'btn-group';
        btnGroup.setAttribute('role', 'group');

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-outline-primary btn-sm btn-edit-penalty';
        editBtn.title = t('edit', 'Edit');
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
        editBtn.disabled = isFinished;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-outline-danger btn-sm btn-delete-penalty';
        deleteBtn.title = t('delete');
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        deleteBtn.disabled = isFinished;

        btnGroup.appendChild(editBtn);
        btnGroup.appendChild(deleteBtn);
        actionsCell.appendChild(btnGroup);

        row.appendChild(nameCell);
        row.appendChild(forJudgesCell);
        row.appendChild(minCell);
        row.appendChild(maxCell);
        row.appendChild(actionsCell);

        tableBody.appendChild(row);
    });

    const countEl = document.getElementById('count-penalties');
    if (countEl) {
        countEl.textContent = penaltiesList.length;
    }

    const emptyState = document.getElementById('penaltiesEmptyState');
    if (emptyState) {
        emptyState.classList.toggle('d-none', penaltiesList.length > 0);
    }
}

async function savePenalty(action, penaltyId, penaltyModal, saveBtn) {
    const nameInput = document.getElementById('penaltyNameInput');
    const forJudgesInput = document.getElementById('penaltyForJudgesInput');
    const minInput = document.getElementById('penaltyMinInput');
    const maxInput = document.getElementById('penaltyMaxInput');

    if (!nameInput || !forJudgesInput || !minInput || !maxInput) return;

    const name = nameInput.value.trim();
    if (!name) {
        showMessageModal(t('penalty_name_required', 'Penalty name is required.'), t('error'));
        nameInput.focus();
        return;
    }

    const minRaw = minInput.value.trim();
    if (!minRaw) {
        showMessageModal(t('penalty_min_required', 'Minimum penalty is required.'), t('error'));
        minInput.focus();
        return;
    }

    const maxRaw = maxInput.value.trim();
    if (!maxRaw) {
        showMessageModal(t('penalty_max_required', 'Maximum penalty is required.'), t('error'));
        maxInput.focus();
        return;
    }

    const minPenalty = Number(minRaw);
    const maxPenalty = Number(maxRaw);

    const minPenaltyIsValid = Number.isInteger(minPenalty) && minPenalty >= 1 && minPenalty <= 999;
    const maxPenaltyIsValid = Number.isInteger(maxPenalty) && maxPenalty >= 1 && maxPenalty <= 999;
    if (!minPenaltyIsValid || !maxPenaltyIsValid) {
        showMessageModal(t('penalty_values_invalid', 'Penalty values must be integers between 1 and 999.'), t('error'));
        return;
    }

    if (minPenalty > maxPenalty) {
        showMessageModal(t('penalty_range_invalid', 'Minimum penalty cannot be greater than maximum penalty.'), t('error'));
        return;
    }

    const payload = {
        event_id: getEvent().id,
        name,
        for_judges: forJudgesInput.checked ? 1 : 0,
        min_penalty: minPenalty,
        max_penalty: maxPenalty
    };

    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = t('guardando', 'Saving...');

    try {
        let res;
        if (action === 'edit' && penaltyId) {
            res = await fetch(`${API_BASE_URL}/api/penalties/${penaltyId}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE_URL}/api/penalties`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showMessageModal(err.error || t('penalties_save_error', 'Error saving penalty.'), t('error'));
            return;
        }

        penaltyModal.hide();
        await loadPenaltiesTable();
    } catch (error) {
        console.error('Error saving penalty:', error);
        showMessageModal(t('penalties_save_error', 'Error saving penalty.'), t('error'));
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText || t('save', 'Save');
    }
}

async function deletePenalty(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/penalties/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showMessageModal(err.error || t('penalties_delete_error', 'Error deleting penalty.'), t('error'));
            return;
        }
        await loadPenaltiesTable();
    } catch (error) {
        console.error('Error deleting penalty:', error);
        showMessageModal(t('penalties_delete_error', 'Error deleting penalty.'), t('error'));
    }
}

function openSchoolModal({ modal, action, school = null }) {
    const form = document.getElementById('schoolForm');
    const title = document.getElementById('schoolModalTitle');
    const nameInput = document.getElementById('schoolNameInput');
    const locationInput = document.getElementById('schoolLocationInput');
    if (!form || !title || !nameInput || !locationInput) return;

    form.dataset.action = action;
    if (action === 'edit' && school) {
        form.dataset.id = school.id;
        nameInput.value = school.name || '';
        locationInput.value = school.location || '';
        title.textContent = t('school_modal_edit', 'Edit school');
    } else {
        delete form.dataset.id;
        nameInput.value = '';
        locationInput.value = '';
        title.textContent = t('school_modal_create', 'Create school');
    }

    modal.show();
}

async function loadSchoolsTable() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/clubs?event_id=${getEvent().id}`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showMessageModal(err.error || t('schools_load_error', 'Error loading schools.'), t('error'));
            return;
        }
        const data = await response.json();
        clubsList = Array.isArray(data) ? data : [];
        clubsList.sort((a, b) => {
            if (a?.position !== undefined || b?.position !== undefined) {
                return (a?.position ?? 9999) - (b?.position ?? 9999);
            }
            return String(a?.name || '').localeCompare(String(b?.name || ''));
        });
        renderSchoolsTable();
    } catch (error) {
        console.error('Failed to load schools:', error);
        showMessageModal(t('schools_load_error', 'Error loading schools.'), t('error'));
    }
}

function renderSchoolsTable() {
    const tableBody = document.getElementById('clubsTable');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    clubsList.forEach((school) => {
        const row = document.createElement('tr');
        row.dataset.id = school.id;

        const isFinished = getEvent().status === 'finished';
        const schoolName = school?.name || '-';
        const schoolLocation = school?.location || '-';
        const nameCell = document.createElement('td');
        nameCell.textContent = schoolName;

        const locationCell = document.createElement('td');
        locationCell.textContent = schoolLocation;

        const actionsCell = document.createElement('td');
        actionsCell.className = 'text-center align-middle';
        const btnGroup = document.createElement('div');
        btnGroup.className = 'btn-group';
        btnGroup.setAttribute('role', 'group');

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-outline-primary btn-sm btn-edit-school';
        editBtn.title = t('edit', 'Edit');
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
        editBtn.disabled = isFinished;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-outline-danger btn-sm btn-delete-school';
        deleteBtn.title = t('delete');
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        deleteBtn.disabled = isFinished;

        btnGroup.appendChild(editBtn);
        btnGroup.appendChild(deleteBtn);
        actionsCell.appendChild(btnGroup);

        row.appendChild(nameCell);
        row.appendChild(locationCell);
        row.appendChild(actionsCell);

        tableBody.appendChild(row);
    });

    const countEl = document.getElementById('count-clubs');
    if (countEl) {
        countEl.textContent = clubsList.length;
    }

    const emptyState = document.getElementById('schoolsEmptyState');
    if (emptyState) {
        emptyState.classList.toggle('d-none', clubsList.length > 0);
    }
}

async function saveSchool(action, schoolId, schoolModal, saveBtn) {
    const nameInput = document.getElementById('schoolNameInput');
    const locationInput = document.getElementById('schoolLocationInput');
    if (!nameInput || !locationInput) return;

    const name = nameInput.value.trim();
    const location = locationInput.value.trim();

    if (!name) {
        showMessageModal(t('school_name_required', 'School name is required.'), t('error'));
        nameInput.focus();
        return;
    }

    const payload = {
        event_id: getEvent().id,
        name,
        location: location || null
    };

    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = t('guardando', 'Saving...');

    try {
        let res;
        if (action === 'edit' && schoolId) {
            res = await fetch(`${API_BASE_URL}/api/clubs/${schoolId}`, {
                method: 'PUT',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE_URL}/api/clubs`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showMessageModal(err.error || t('schools_save_error', 'Error saving school.'), t('error'));
            return;
        }

        schoolModal.hide();
        await loadSchoolsTable();
    } catch (error) {
        console.error('Error saving school:', error);
        showMessageModal(t('schools_save_error', 'Error saving school.'), t('error'));
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText || t('save', 'Save');
    }
}

async function deleteSchool(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/clubs/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showMessageModal(err.error || t('schools_delete_error', 'Error deleting school.'), t('error'));
            return;
        }
        await loadSchoolsTable();
    } catch (error) {
        console.error('Error deleting school:', error);
        showMessageModal(t('schools_delete_error', 'Error deleting school.'), t('error'));
    }
}

function shouldReloadCriteriaConfig(table) {
    return ['categories', 'styles', 'criteria'].includes(table);
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
    const criteriaSelectField = document.getElementById('criteria-config-criteria-select-field');
    const criteriaListField = document.getElementById('criteria-config-criteria-list-field');

    if (porcentageField) {
        porcentageField.classList.toggle('d-none', !showPorcentage);
    }
    if (porcentageHeader) {
        porcentageHeader.classList.toggle('d-none', !showPorcentage);
    }
    const totalHeader = document.getElementById('criteria-config-total-header');
    if (totalHeader) {
        totalHeader.classList.toggle('d-none', !showPorcentage);
    }
    if (criteriaSelectField) {
        criteriaSelectField.classList.toggle('d-none', !showPorcentage);
    }
    if (criteriaListField) {
        criteriaListField.classList.toggle('d-none', showPorcentage);
    }

}

function bindCriteriaConfigEvents() {
    const addBtn = document.getElementById('criteria-config-add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addCriteriaConfig);
    }

    const filterCategory = document.getElementById('criteria-config-filter-category');
    const filterStyle = document.getElementById('criteria-config-filter-style');
    const filterCriteria = document.getElementById('criteria-config-filter-criteria');
    if (filterCategory) filterCategory.addEventListener('change', renderCriteriaConfigTable);
    if (filterStyle) filterStyle.addEventListener('change', renderCriteriaConfigTable);
    if (filterCriteria) filterCriteria.addEventListener('change', renderCriteriaConfigTable);

    const deleteFilteredBtn = document.getElementById('criteria-config-delete-filtered');
    if (deleteFilteredBtn) {
        deleteFilteredBtn.addEventListener('click', async () => {
            if (!filteredCriteriaConfigIds.length) return;
            const count = filteredCriteriaConfigIds.length;
            const confirmText = t('criteria_config_delete_many_confirm').replace('{count}', `<strong>${count}</strong>`);
            const confirmed = await showModal(confirmText);
            if (!confirmed) return;

            await deleteCriteriaConfig(filteredCriteriaConfigIds);
            await loadCriteriaConfig();
        });
    }

    const categoriesAll = document.getElementById('criteria-config-categories-all');
    const categoriesNone = document.getElementById('criteria-config-categories-none');
    const stylesAll = document.getElementById('criteria-config-styles-all');
    const stylesNone = document.getElementById('criteria-config-styles-none');
    const criteriaAll = document.getElementById('criteria-config-criteria-all');
    const criteriaNone = document.getElementById('criteria-config-criteria-none');

    if (categoriesAll) categoriesAll.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-categories', true));
    if (categoriesNone) categoriesNone.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-categories', false));
    if (stylesAll) stylesAll.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-styles', true));
    if (stylesNone) stylesNone.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-styles', false));
    if (criteriaAll) criteriaAll.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-criteria-list', true));
    if (criteriaNone) criteriaNone.addEventListener('click', () => setAllCriteriaConfigChecks('criteria-config-criteria-list', false));

    const tableBody = document.getElementById('criteria-config-table');
    if (tableBody) {
        tableBody.addEventListener('click', async (event) => {
            const deleteBtn = event.target.closest('.btn-delete-criteria-config');
            if (!deleteBtn) return;

            const id = deleteBtn.dataset.id;
            if (!id) return;
            const confirmed = await showModal(t('criteria_config_delete_one_confirm'));
            if (!confirmed) return;

            await deleteCriteriaConfig([id]);
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
    renderCriteriaConfigCheckboxes('criteria-config-criteria-list', criteriaList, 'criteria');
    populateCriteriaConfigFilters();
}

function populateCriteriaConfigFilters() {
    const filterCategory = document.getElementById('criteria-config-filter-category');
    const filterStyle = document.getElementById('criteria-config-filter-style');
    const filterCriteria = document.getElementById('criteria-config-filter-criteria');

    if (filterCategory) {
        filterCategory.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = t('criteria_config_all_feminine');
        filterCategory.appendChild(allOption);
        categoriesList.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            filterCategory.appendChild(option);
        });
    }

    if (filterStyle) {
        filterStyle.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = t('criteria_config_all_masculine');
        filterStyle.appendChild(allOption);
        stylesList.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            filterStyle.appendChild(option);
        });
    }

    if (filterCriteria) {
        filterCriteria.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = t('criteria_config_all_masculine');
        filterCriteria.appendChild(allOption);
        criteriaList.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            filterCriteria.appendChild(option);
        });
    }
}

function renderCriteriaConfigCheckboxes(containerId, items, namePrefix) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'text-muted small';
        empty.textContent = t('criteria_config_no_data');
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

    const filterCategory = document.getElementById('criteria-config-filter-category');
    const filterStyle = document.getElementById('criteria-config-filter-style');
    const filterCriteria = document.getElementById('criteria-config-filter-criteria');

    const selectedCategory = filterCategory ? filterCategory.value : '';
    const selectedStyle = filterStyle ? filterStyle.value : '';
    const selectedCriteria = filterCriteria ? filterCriteria.value : '';

    const showPorcentage = getEvent().criteriaConfig === 'WITH_POR';
    const porcentageClass = showPorcentage ? '' : 'd-none';
    const totalClass = showPorcentage ? '' : 'd-none';

    const categoryMap = new Map(categoriesList.map((item) => [String(item.id), item.name]));
    const styleMap = new Map(stylesList.map((item) => [String(item.id), item.name]));
    const criteriaMap = new Map(criteriaList.map((item) => [String(item.id), item.name]));

    const filteredList = criteriaConfigList.filter((item) => {
        const categoryMatch = !selectedCategory || String(item.category_id) === selectedCategory;
        const styleMatch = !selectedStyle || String(item.style_id) === selectedStyle;
        const criteriaMatch = !selectedCriteria || String(item.criteria_id) === selectedCriteria;
        return categoryMatch && styleMatch && criteriaMatch;
    });

    filteredCriteriaConfigIds = filteredList.map((item) => String(item.id));

    const groups = [];
    filteredList.forEach((item) => {
        const key = `${item.category_id}-${item.style_id}`;
        let group = groups[groups.length - 1];
        if (!group || group.key !== key) {
            group = { key, items: [] };
            groups.push(group);
        }
        group.items.push(item);
    });

    groups.forEach((group) => {
        const total = group.items.reduce((sum, item) => {
            const rawValue = item.porcentage ?? item.percentage ?? 0;
            const value = Number(rawValue);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        const totalText = showPorcentage ? formatPercentage(total) : '';
        const totalRounded = Math.round(total * 100) / 100;
        let totalBadgeClass = 'badge bg-secondary';
        if (showPorcentage) {
            if (totalRounded === 100) {
                totalBadgeClass = 'badge bg-success';
            } else if (totalRounded < 100) {
                totalBadgeClass = 'badge bg-warning text-dark';
            } else {
                totalBadgeClass = 'badge bg-danger';
            }
        }

        group.items.forEach((item, index) => {
            const tr = document.createElement('tr');

            const categoryName = item.category_name || categoryMap.get(String(item.category_id)) || `#${item.category_id}`;
            const styleName = item.style_name || styleMap.get(String(item.style_id)) || `#${item.style_id}`;
            const criteriaName = item.criteria_name || criteriaMap.get(String(item.criteria_id)) || `#${item.criteria_id}`;
            const porcentageVal = item.porcentage ?? item.percentage ?? '';

            if (index === 0) {
                const categoryCell = document.createElement('td');
                categoryCell.rowSpan = group.items.length;
                categoryCell.textContent = categoryName;
                tr.appendChild(categoryCell);

                const styleCell = document.createElement('td');
                styleCell.rowSpan = group.items.length;
                styleCell.textContent = styleName;
                tr.appendChild(styleCell);

                const totalCell = document.createElement('td');
                totalCell.rowSpan = group.items.length;
                totalCell.className = totalClass;
                if (showPorcentage) {
                    const badge = document.createElement('span');
                    badge.className = totalBadgeClass;
                    badge.textContent = totalText;
                    totalCell.appendChild(badge);
                }
                tr.appendChild(totalCell);
            }

            const criteriaCell = document.createElement('td');
            criteriaCell.textContent = criteriaName;
            tr.appendChild(criteriaCell);

            const porcentageCell = document.createElement('td');
            porcentageCell.className = porcentageClass;
            porcentageCell.textContent = showPorcentage ? porcentageVal : '';
            tr.appendChild(porcentageCell);

            const actionsCell = document.createElement('td');
            actionsCell.className = 'text-center';
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn-link text-danger p-0 btn-delete-criteria-config';
            deleteBtn.dataset.id = item.id;
            deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
            actionsCell.appendChild(deleteBtn);
            tr.appendChild(actionsCell);

            tableBody.appendChild(tr);
        });
    });

    const countEl = document.getElementById('count-criteria-config');
    if (countEl) {
        const hasFilters = Boolean(selectedCategory || selectedStyle || selectedCriteria);
        countEl.textContent = hasFilters
            ? `${filteredList.length} / ${criteriaConfigList.length}`
            : `${criteriaConfigList.length}`;
    }

    const deleteFilteredBtn = document.getElementById('criteria-config-delete-filtered');
    if (deleteFilteredBtn) {
        const hasFilters = Boolean(selectedCategory || selectedStyle || selectedCriteria);
        deleteFilteredBtn.disabled = !hasFilters || filteredList.length === 0;
    }

}

function formatPercentage(value) {
    if (!Number.isFinite(value)) return '-';
    const rounded = Math.round(value * 100) / 100;
    const display = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
    return `${display}%`;
}

async function addCriteriaConfig() {
    const needsPorcentage = getEvent().criteriaConfig === 'WITH_POR';
    let criteriaIds = [];

    if (needsPorcentage) {
        const criteriaSelect = document.getElementById('criteria-config-criteria');
        if (!criteriaSelect) return;

        const criteriaId = Number(criteriaSelect.value);
        if (!criteriaId) {
            showMessageModal(t('criteria_config_select_criteria_error'), t('error'));
            return;
        }
        criteriaIds = [criteriaId];
    } else {
        criteriaIds = getCriteriaConfigCheckedValues('criteria-config-criteria-list').map(Number);
        if (!criteriaIds.length) {
            showMessageModal(t('criteria_config_select_criteria_error'), t('error'));
            return;
        }
    }

    const categories = getCriteriaConfigCheckedValues('criteria-config-categories');
    const styles = getCriteriaConfigCheckedValues('criteria-config-styles');

    if (!categories.length || !styles.length) {
        showMessageModal(t('criteria_config_select_category_style_error'), t('error'));
        return;
    }

    let percentage = null;
    if (needsPorcentage) {
        const input = document.getElementById('criteria-config-porcentage');
        const rawValue = input ? input.value.trim() : '';
        if (!rawValue) {
            showMessageModal(t('criteria_config_percentage_invalid'), t('error'));
            return;
        }
        percentage = Number(rawValue);
        if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
            showMessageModal(t('criteria_config_percentage_invalid'), t('error'));
            return;
        }
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/criteria/config`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                event_id: getEvent().id,
                category_ids: categories.map(Number),
                style_ids: styles.map(Number),
                criteria_ids: criteriaIds,
                percentage: needsPorcentage ? percentage : null
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showMessageModal(data.error || t('criteria_config_save_error'), t('error'));
            return;
        }

        setAllCriteriaConfigChecks('criteria-config-categories', false);
        setAllCriteriaConfigChecks('criteria-config-styles', false);
        if (!needsPorcentage) {
            setAllCriteriaConfigChecks('criteria-config-criteria-list', false);
        }
        if (needsPorcentage) {
            const input = document.getElementById('criteria-config-porcentage');
            if (input) input.value = '';
        }

        await loadCriteriaConfig();
    } catch (error) {
        console.error('Error saving criteria config:', error);
        showMessageModal(t('criteria_config_save_error'), t('error'));
    }
}

async function deleteCriteriaConfig(ids) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/criteria/config`, {
            method: 'DELETE',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ids.map(Number))
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showMessageModal(data.error || t('criteria_config_delete_error'), t('error'));
        }
    } catch (error) {
        console.error('Error deleting criteria config:', error);
        showMessageModal(t('criteria_config_delete_error'), t('error'));
    }
}
