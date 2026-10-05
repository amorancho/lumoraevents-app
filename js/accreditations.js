const accreditationState = {
  canManage: false,
  view: 'people',
  search: '',
  people: [],
  groups: [],
  groupDetail: null,
  selectedPerson: null,
  history: [],
  historyLoading: false,
  historyError: '',
  listRequest: 0,
  groupRequest: 0,
  detailRequest: 0,
  searchTimer: null,
  busy: new Set()
};

const accredEl = (id) => document.getElementById(id);
const accredText = (key, fallback) => t(key, fallback);
const accredEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function accreditationName(person) {
  return [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim() || accredText('unnamed', 'Unnamed person');
}

function accreditationType(type) {
  return ({
    PARTICIPANT: accredText('participant', 'Participant'),
    STAFF: accredText('staff', 'Staff'),
    GUEST: accredText('guest', 'Guest')
  })[type] || type || '—';
}

function accreditationTime(value, includeDate = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const locale = typeof getCurrentAppLanguage === 'function' ? getCurrentAppLanguage() : 'en';
  return includeDate
    ? date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
    : date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function accreditationDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(getCurrentAppLanguage());
}

async function accreditationApi(path, options = {}) {
  const response = await lumoraApiFetch(`/api/accreditation${path}`, options, {
    auth: 'required', eventContext: 'current'
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || accredText('request_error', 'Could not complete the request.'));
  }
  return data;
}

function accreditationJson(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function accreditationFeedback(message = '') {
  const element = accredEl('accredFeedback');
  element.textContent = message;
  element.hidden = !message;
}

function accreditationEmpty(icon, title, message) {
  return `<div class="accred-empty"><i class="bi ${icon}" aria-hidden="true"></i><strong>${accredEscape(title)}</strong><span>${accredEscape(message)}</span></div>`;
}

function accreditationGroupLabel(group) {
  return group.category ? `${group.name} · ${group.category}` : group.name;
}

function renderAccreditationPerson(person) {
  const id = Number(person.id);
  if (!Number.isSafeInteger(id) || id <= 0) return '';
  const delivered = Boolean(person.accredited_at);
  const groupMarkup = (Array.isArray(person.groups) ? person.groups : []).map((group) =>
    `<span class="accred-group-chip">${accredEscape(accreditationGroupLabel(group))}</span>`
  ).join('');
  const noteMarkup = String(person.notes || '').trim()
    ? `<span class="accred-note-chip"><i class="bi bi-sticky" aria-hidden="true"></i>${accredEscape(accredText('note', 'Note'))}</span>` : '';
  const status = delivered
    ? `<i class="bi bi-check-circle-fill" aria-hidden="true"></i>${accredEscape(accredText('accredited_status', 'Accredited'))} ${accredEscape(accreditationTime(person.accredited_at))}`
    : `<i class="bi bi-circle" aria-hidden="true"></i>${accredEscape(accredText('pending_status', 'Pending'))}`;
  const action = delivered
    ? `<button type="button" class="accred-action accred-action--revoke" data-accred-action="revoke" data-person-id="${id}"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>${accredEscape(accredText('revoke', 'Revoke'))}</button>`
    : `<button type="button" class="accred-action accred-action--deliver" data-accred-action="deliver" data-person-id="${id}"><i class="bi bi-check2-circle" aria-hidden="true"></i>${accredEscape(accredText('accredit', 'Accredit'))}</button>`;
  return `<article class="accred-person-card${delivered ? ' is-accredited' : ''}" data-person-id="${id}">
    <div class="accred-person-main"><span class="accred-person-mark" aria-hidden="true"><i class="bi ${delivered ? 'bi-check-lg' : 'bi-person'}"></i></span><div class="accred-person-copy"><button type="button" class="accred-person-name" data-accred-action="detail" data-person-id="${id}">${accredEscape(accreditationName(person))}</button><span class="accred-person-type">${accredEscape(accreditationType(person.person_type))}</span></div></div>
    <div class="accred-person-details">
      <div class="accred-person-facts">
        <span class="accred-person-fact"><span class="accred-person-fact-label">${accredEscape(accredText('birth_date', 'Birth date'))}</span><strong>${accredEscape(accreditationDate(person.birth_date))}</strong></span>
        <span class="accred-person-fact"><span class="accred-person-fact-label">${accredEscape(accredText('document', 'Document'))}</span><strong>${accredEscape(person.document_masked || '—')}</strong></span>
      </div>
      <div class="accred-person-groups"><span class="accred-person-fact-label">${accredEscape(accredText('group_label', 'Group'))}</span>${groupMarkup || '<span class="accred-group-chip">—</span>'}${noteMarkup}</div>
    </div>
    <div class="accred-person-meta"><span class="accred-person-status">${status}</span><div class="accred-person-actions">${action}<button type="button" class="accred-action" data-accred-action="detail" data-person-id="${id}" aria-label="${accredEscape(accredText('details', 'Details'))}: ${accredEscape(accreditationName(person))}"><i class="bi bi-chevron-right" aria-hidden="true"></i></button></div></div>
  </article>`;
}

function renderAccreditationPeople() {
  const list = accredEl('peopleList');
  if (!accreditationState.people.length) {
    list.innerHTML = accreditationEmpty('bi-person-search', accredText('no_people', 'No accreditations found.'),
      accreditationState.search || accredEl('typeFilter').value || accredEl('statusFilter').value || accredEl('groupFilter').value
        ? accredText('no_people_match', 'No people match your search or filters.')
        : accredText('no_people_yet', 'People will appear here when they are added.'));
    return;
  }
  list.innerHTML = accreditationState.people.map(renderAccreditationPerson).join('');
}

function renderAccreditationGroupFilter() {
  const select = accredEl('groupFilter');
  const current = select.value;
  select.innerHTML = `<option value="">${accredEscape(accredText('all_groups', 'All groups'))}</option>` +
    accreditationState.groups.map((group) => `<option value="${Number(group.id)}">${accredEscape(accreditationGroupLabel(group))}</option>`).join('');
  select.value = current;
}

function renderAccreditationGroups() {
  if (accreditationState.groupDetail) return;
  const query = accreditationState.search.trim().toLocaleLowerCase();
  const groups = accreditationState.groups.filter((group) =>
    !query || accreditationGroupLabel(group).toLocaleLowerCase().includes(query));
  const list = accredEl('groupsList');
  if (!groups.length) {
    list.innerHTML = accreditationEmpty('bi-collection', accredText('no_groups', 'No groups found.'),
      query ? accredText('no_groups_match', 'No groups match your search.') : accredText('no_groups_yet', 'Groups will appear here when they are added.'));
    return;
  }
  list.innerHTML = groups.map((group) => `<button type="button" class="accred-group-card" data-group-id="${Number(group.id)}">
    <span><span class="accred-group-title">${accredEscape(group.name)}</span><span class="accred-group-category">${accredEscape(group.category || accredText('no_category', 'No category'))}</span></span>
    <span class="accred-group-counts"><span><b>${Number(group.total) || 0}</b> ${accredEscape(accredText('people_count', 'people'))}</span><span class="is-done"><b>${Number(group.accredited) || 0}</b> ${accredEscape(accredText('accredited', 'accredited').toLowerCase())}</span><span><b>${Number(group.pending) || 0}</b> ${accredEscape(accredText('pending', 'pending').toLowerCase())}</span></span>
  </button>`).join('');
}

function renderAccreditationGroupDetail() {
  const group = accreditationState.groupDetail;
  if (!group) return;
  accredEl('groupDetailTitle').textContent = group.name;
  const accreditedCount = group.people.filter((person) => Boolean(person.accredited_at)).length;
  accredEl('groupDetailMeta').textContent = `${group.category || accredText('no_category', 'No category')} · ${group.people.length} ${accredText('people_count', 'people')} · ${accreditedCount} ${accredText('accredited', 'accredited').toLowerCase()} · ${group.people.length - accreditedCount} ${accredText('pending', 'pending').toLowerCase()}`;
  accredEl('groupPeopleList').innerHTML = group.people.length
    ? group.people.map(renderAccreditationPerson).join('')
    : accreditationEmpty('bi-people', accredText('group_empty', 'No people in this group.'), '');
}

function renderAccreditationSummary(summary) {
  if (!summary) return;
  for (const [key, id] of Object.entries({ total: 'summaryTotal', accredited: 'summaryAccredited', pending: 'summaryPending', participants: 'summaryParticipants', staff: 'summaryStaff', guests: 'summaryGuests' })) {
    accredEl(id).textContent = Number(summary[key]) || 0;
  }
}

async function loadAccreditationSummary() {
  try { renderAccreditationSummary(await accreditationApi('/summary')); }
  catch (error) { accreditationFeedback(error.message); }
}

async function loadAccreditationGroups() {
  if (!accreditationState.groupDetail) {
    accredEl('groupsList').innerHTML = accreditationEmpty('bi-arrow-repeat', accredText('loading', 'Loading…'), '');
  }
  try {
    const groups = await accreditationApi('/groups');
    accreditationState.groups = Array.isArray(groups) ? groups : [];
    renderAccreditationGroupFilter();
    renderAccreditationGroups();
  } catch (error) {
    accreditationFeedback(error.message);
    if (!accreditationState.groupDetail) {
      accredEl('groupsList').innerHTML = accreditationEmpty('bi-exclamation-circle', accredText('load_error', 'Could not load accreditations.'), error.message);
    }
  }
}

async function loadAccreditationPeople() {
  const request = ++accreditationState.listRequest;
  accredEl('accredListState').textContent = accredText('loading', 'Loading…');
  const params = new URLSearchParams({ sort: 'name' });
  const search = accreditationState.search.trim();
  if (search) params.set('search', search);
  if (accredEl('typeFilter').value) params.set('person_type', accredEl('typeFilter').value);
  if (accredEl('statusFilter').value) params.set('accredited', accredEl('statusFilter').value);
  if (accredEl('groupFilter').value) params.set('group_id', accredEl('groupFilter').value);
  try {
    const people = await accreditationApi(`/?${params}`);
    if (request !== accreditationState.listRequest) return;
    accreditationState.people = Array.isArray(people) ? people : [];
    accredEl('accredListState').textContent = '';
    renderAccreditationPeople();
  } catch (error) {
    if (request !== accreditationState.listRequest) return;
    accredEl('accredListState').textContent = error.message || accredText('load_error', 'Could not load accreditations.');
    accredEl('peopleList').innerHTML = '';
  }
}

async function loadAccreditationGroupDetail(id) {
  const request = ++accreditationState.groupRequest;
  accredEl('groupPeopleList').innerHTML = accreditationEmpty('bi-arrow-repeat', accredText('loading', 'Loading…'), '');
  try {
    const group = await accreditationApi(`/groups/${id}`);
    if (request !== accreditationState.groupRequest) return;
    accreditationState.groupDetail = { ...group, people: Array.isArray(group.people) ? group.people : [] };
    renderAccreditationGroupDetail();
  } catch (error) {
    if (request === accreditationState.groupRequest) accredEl('groupPeopleList').innerHTML = accreditationEmpty('bi-exclamation-circle', accredText('load_error', 'Could not load accreditations.'), error.message);
  }
}

function showAccreditationView(view) {
  accreditationState.view = view;
  const groups = view === 'groups';
  accredEl('peopleViewBtn').classList.toggle('active', !groups);
  accredEl('groupsViewBtn').classList.toggle('active', groups);
  accredEl('peopleViewBtn').setAttribute('aria-pressed', String(!groups));
  accredEl('groupsViewBtn').setAttribute('aria-pressed', String(groups));
  accredEl('peopleFilters').hidden = groups;
  accredEl('peopleList').hidden = groups;
  accredEl('accredListState').hidden = groups;
  accredEl('groupsList').hidden = !groups || Boolean(accreditationState.groupDetail);
  accredEl('groupDetail').hidden = !groups || !accreditationState.groupDetail;
  if (groups) renderAccreditationGroups();
  else loadAccreditationPeople();
}

function patchAccreditationPerson(updated) {
  accreditationState.people = accreditationState.people.map((person) => Number(person.id) === Number(updated.id) ? updated : person);
  if (accreditationState.groupDetail) {
    accreditationState.groupDetail.people = accreditationState.groupDetail.people.map((person) => Number(person.id) === Number(updated.id) ? updated : person);
  }
  if (Number(accreditationState.selectedPerson?.id) === Number(updated.id)) accreditationState.selectedPerson = updated;
  renderAccreditationPeople();
  renderAccreditationGroupDetail();
}

function accreditationSetBusy(id, busy) {
  if (busy) accreditationState.busy.add(id);
  else accreditationState.busy.delete(id);
  document.querySelectorAll(`[data-person-id="${id}"] button, button[data-person-id="${id}"]`).forEach((button) => { button.disabled = busy; });
}

function confirmAccreditation(title, message, actionLabel) {
  const modalElement = accredEl('accredConfirmModal');
  accredEl('accredConfirmTitle').textContent = title;
  accredEl('accredConfirmMessage').textContent = message;
  accredEl('accredConfirmBtn').textContent = actionLabel;
  const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
  return new Promise((resolve) => {
    let accepted = false;
    const confirm = () => { accepted = true; modal.hide(); };
    accredEl('accredConfirmBtn').addEventListener('click', confirm, { once: true });
    modalElement.addEventListener('hidden.bs.modal', () => {
      accredEl('accredConfirmBtn').removeEventListener('click', confirm);
      resolve(accepted);
    }, { once: true });
    modal.show();
  });
}

function hideAccreditationModal(id) {
  const element = accredEl(id);
  if (!element.classList.contains('show')) return Promise.resolve();
  return new Promise((resolve) => {
    element.addEventListener('hidden.bs.modal', resolve, { once: true });
    bootstrap.Modal.getOrCreateInstance(element).hide();
  });
}

async function changeAccreditationStatus(id, action) {
  if (accreditationState.busy.has(id)) return;
  const person = [...accreditationState.people, ...(accreditationState.groupDetail?.people || [])].find((item) => Number(item.id) === id);
  if (!person) return;
  if (action === 'revoke') {
    const approved = await confirmAccreditation(accredText('revoke', 'Revoke'),
      `${accredText('revoke_question', 'Remove accreditation from')} ${accreditationName(person)}?`, accredText('revoke', 'Revoke'));
    if (!approved) return;
  }
  accreditationFeedback('');
  accreditationSetBusy(id, true);
  try {
    const updated = await accreditationApi(`/${id}/${action}`, { method: 'POST' });
    patchAccreditationPerson(updated);
    showToastNotice(action === 'deliver' ? accredText('delivered_success', 'Accreditation delivered.') : accredText('revoked_success', 'Accreditation removed.'));
    await Promise.all([loadAccreditationSummary(), loadAccreditationGroups(), loadAccreditationPeople(),
      accreditationState.groupDetail ? loadAccreditationGroupDetail(accreditationState.groupDetail.id) : Promise.resolve()]);
  } catch (error) { accreditationFeedback(error.message); }
  finally { accreditationSetBusy(id, false); }
}

function accreditationDetailField(label, value) {
  return `<div class="accred-detail-field"><span>${accredEscape(label)}</span><strong>${accredEscape(value || '—')}</strong></div>`;
}

function renderAccreditationDetail() {
  const person = accreditationState.selectedPerson;
  if (!person) return;
  accredEl('personDetailTitle').textContent = accreditationName(person);
  accredEl('editPersonBtn').hidden = !accreditationState.canManage;
  accredEl('deletePersonBtn').hidden = !accreditationState.canManage;
  const groups = (person.groups || []).map((group) => `<span class="accred-group-chip">${accredEscape(accreditationGroupLabel(group))}</span>`).join('') || '—';
  const history = accreditationState.historyLoading
    ? `<li>${accredEscape(accredText('loading', 'Loading…'))}</li>`
    : accreditationState.historyError
    ? `<li>${accredEscape(accreditationState.historyError)}</li>`
    : accreditationState.history.length
    ? accreditationState.history.map((item) => `<li>${accredEscape(accreditationTime(item.created_at, true))} · ${accredEscape(item.action === 'DELIVERED' ? accredText('delivered', 'Delivered') : accredText('revoked', 'Revoked'))} · ${accredEscape(item.user_name || item.user_role || '—')}</li>`).join('')
    : `<li>${accredEscape(accredText('no_history', 'No activity yet.'))}</li>`;
  accredEl('personDetailBody').innerHTML = `
    <div class="accred-detail-grid">
      ${accreditationDetailField(accredText('type_label', 'Person type'), accreditationType(person.person_type))}
      ${accreditationDetailField(accredText('status_label', 'Status'), person.accredited_at ? `${accredText('accredited_status', 'Accredited')} · ${accreditationTime(person.accredited_at, true)}` : accredText('pending_status', 'Pending'))}
      ${accreditationDetailField(accredText('birth_date', 'Birth date'), accreditationDate(person.birth_date))}
      ${accreditationDetailField(accredText('document', 'Document'), person.document_masked)}
      ${person.accredited_at ? accreditationDetailField(accredText('accredited_by', 'Accredited by'), person.accredited_by_name || person.accredited_by_role) : ''}
    </div>
    <section class="accred-detail-section"><h3>${accredEscape(accredText('groups', 'Groups'))}</h3>${groups}</section>
    <section class="accred-detail-section"><h3>${accredEscape(accredText('notes', 'Notes'))}</h3><label class="visually-hidden" for="detailNotes">${accredEscape(accredText('notes', 'Notes'))}</label><textarea id="detailNotes" class="form-control lm-input" maxlength="500" rows="3">${accredEscape(person.notes || '')}</textarea><button type="button" class="lm-btn lm-btn-secondary" id="saveNotesBtn">${accredEscape(accredText('save_notes', 'Save note'))}</button></section>
    <section class="accred-detail-section"><h3>${accredEscape(accredText('history', 'History'))}</h3><ul class="accred-history">${history}</ul></section>`;
}

async function openAccreditationDetail(id) {
  const request = ++accreditationState.detailRequest;
  accreditationState.selectedPerson = null;
  accreditationState.history = [];
  accreditationState.historyLoading = true;
  accreditationState.historyError = '';
  accredEl('personDetailBody').textContent = accredText('loading', 'Loading…');
  accredEl('editPersonBtn').hidden = true;
  accredEl('deletePersonBtn').hidden = true;
  bootstrap.Modal.getOrCreateInstance(accredEl('personDetailModal')).show();
  try {
    const person = await accreditationApi(`/${id}`);
    if (request !== accreditationState.detailRequest) return;
    accreditationState.selectedPerson = person;
    renderAccreditationDetail();
    try {
      const history = await accreditationApi(`/${id}/log`);
      if (request !== accreditationState.detailRequest) return;
      accreditationState.history = Array.isArray(history) ? history : [];
    } catch (error) {
      if (request !== accreditationState.detailRequest) return;
      accreditationState.historyError = error.message;
    }
    accreditationState.historyLoading = false;
    renderAccreditationDetail();
  } catch (error) {
    if (request === accreditationState.detailRequest) accredEl('personDetailBody').textContent = error.message;
  }
}

async function saveAccreditationNotes() {
  const person = accreditationState.selectedPerson;
  if (!person) return;
  const button = accredEl('saveNotesBtn');
  accreditationFeedback('');
  button.disabled = true;
  try {
    const notes = accredEl('detailNotes').value.trim() || null;
    const updated = await accreditationApi(`/${person.id}`, accreditationJson('PATCH', { notes }));
    patchAccreditationPerson(updated);
    renderAccreditationDetail();
    showToastNotice(accredText('notes_saved', 'Note saved.'));
  } catch (error) { accreditationFeedback(error.message); button.disabled = false; }
}

function renderAccreditationGroupChoices(selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));
  accredEl('personGroupChoices').innerHTML = accreditationState.groups.length
    ? accreditationState.groups.map((group) => `<label class="accred-group-choice"><input type="checkbox" value="${Number(group.id)}" ${selected.has(Number(group.id)) ? 'checked' : ''}><span>${accredEscape(accreditationGroupLabel(group))}</span></label>`).join('')
    : `<span class="text-muted">${accredEscape(accredText('no_groups', 'No groups found.'))}</span>`;
}

async function openAccreditationForm(mode) {
  if (!accreditationState.canManage) return;
  const person = mode === 'edit' ? accreditationState.selectedPerson : null;
  if (mode === 'edit' && !person) return;
  await hideAccreditationModal('personDetailModal');
  const form = accredEl('personForm');
  form.reset();
  form.dataset.personId = person?.id || '';
  accredEl('personFormTitle').textContent = accredText(person ? 'edit_person' : 'add_person', person ? 'Edit person' : 'Add person');
  accredEl('personType').value = person?.person_type || 'PARTICIPANT';
  accredEl('personFirstName').value = person?.first_name || '';
  accredEl('personLastName').value = person?.last_name || '';
  accredEl('personBirthDate').value = person?.birth_date ? String(person.birth_date).slice(0, 10) : '';
  accredEl('personDocument').value = person?.document_masked || '';
  accredEl('personNotes').value = person?.notes || '';
  renderAccreditationGroupChoices((person?.groups || []).map((group) => group.id));
  bootstrap.Modal.getOrCreateInstance(accredEl('personFormModal')).show();
}

async function saveAccreditationPerson(event) {
  event.preventDefault();
  if (!accreditationState.canManage) return;
  const form = accredEl('personForm');
  if (!form.reportValidity()) return;
  const id = Number(form.dataset.personId);
  const payload = {
    person_type: accredEl('personType').value,
    first_name: accredEl('personFirstName').value.trim(),
    last_name: accredEl('personLastName').value.trim() || null,
    birth_date: accredEl('personBirthDate').value || null,
    document_masked: accredEl('personDocument').value.trim() || null,
    notes: accredEl('personNotes').value.trim() || null,
    group_ids: [...accredEl('personGroupChoices').querySelectorAll('input:checked')].map((input) => Number(input.value))
  };
  const button = accredEl('savePersonBtn');
  accreditationFeedback('');
  button.disabled = true;
  try {
    const saved = id
      ? await accreditationApi(`/${id}`, accreditationJson('PATCH', payload))
      : await accreditationApi('/', accreditationJson('POST', payload));
    await hideAccreditationModal('personFormModal');
    accreditationState.selectedPerson = saved;
    showToastNotice(accredText(id ? 'person_updated' : 'person_created', id ? 'Person updated.' : 'Person added.'));
    await Promise.all([loadAccreditationPeople(), loadAccreditationSummary(), loadAccreditationGroups(),
      accreditationState.groupDetail ? loadAccreditationGroupDetail(accreditationState.groupDetail.id) : Promise.resolve()]);
  } catch (error) { accreditationFeedback(error.message); }
  finally { button.disabled = false; }
}

async function deleteAccreditationPerson() {
  if (!accreditationState.canManage || !accreditationState.selectedPerson) return;
  const person = accreditationState.selectedPerson;
  await hideAccreditationModal('personDetailModal');
  const approved = await confirmAccreditation(accredText('delete_person', 'Delete person'),
    `${accredText('delete_question', 'Delete')} ${accreditationName(person)}?`, accredText('delete', 'Delete'));
  if (!approved) return;
  accreditationFeedback('');
  try {
    await accreditationApi(`/${person.id}`, { method: 'DELETE' });
    accreditationState.selectedPerson = null;
    showToastNotice(accredText('person_deleted', 'Person deleted.'));
    await Promise.all([loadAccreditationPeople(), loadAccreditationSummary(), loadAccreditationGroups(),
      accreditationState.groupDetail ? loadAccreditationGroupDetail(accreditationState.groupDetail.id) : Promise.resolve()]);
  } catch (error) { accreditationFeedback(error.message); }
}

function renderAccreditationsPage() {
  renderAccreditationPeople();
  renderAccreditationGroupFilter();
  renderAccreditationGroups();
  renderAccreditationGroupDetail();
  if (accreditationState.selectedPerson) renderAccreditationDetail();
  if (accredEl('personFormModal').classList.contains('show')) {
    accredEl('personFormTitle').textContent = accredText(accredEl('personForm').dataset.personId ? 'edit_person' : 'add_person', 'Add person');
  }
}
window.renderAccreditationsPage = renderAccreditationsPage;

document.addEventListener('DOMContentLoaded', async () => {
  const user = getUserFromToken();
  if (user?.role === 'staff') {
    document.querySelector('.lm-org-sidebar-column')?.remove();
    accredEl('organizationSidebarToggle')?.remove();
  } else if (['admin', 'organizer'].includes(user?.role)) {
    document.body.classList.add('accreditations-page--manager');
  }
  if (!['admin', 'organizer', 'staff'].includes(user?.role)) {
    window.location.href = `home.html?eventId=${encodeURIComponent(eventId || '')}`;
    return;
  }
  await Promise.all([ensureTranslationsReady(), WaitEventLoaded()]);
  const currentEvent = getEvent();
  if (!currentEvent?.hasAccreditations || (user.role !== 'admin' && Number(user.event_id) !== Number(currentEvent.id))) {
    window.location.href = currentEvent?.homeUrl || `home.html?eventId=${encodeURIComponent(eventId || '')}`;
    return;
  }
  accreditationState.canManage = ['admin', 'organizer'].includes(user.role);
  if (accreditationState.canManage) accredEl('accredOrganizerActions').hidden = false;

  accredEl('peopleViewBtn').addEventListener('click', () => showAccreditationView('people'));
  accredEl('groupsViewBtn').addEventListener('click', () => showAccreditationView('groups'));
  accredEl('accredSearch').addEventListener('input', (event) => {
    accreditationState.search = event.target.value;
    clearTimeout(accreditationState.searchTimer);
    if (accreditationState.view === 'people') accreditationState.searchTimer = setTimeout(loadAccreditationPeople, 300);
    else renderAccreditationGroups();
  });
  ['typeFilter', 'statusFilter', 'groupFilter'].forEach((id) => accredEl(id).addEventListener('change', loadAccreditationPeople));
  accredEl('peopleList').addEventListener('click', onAccreditationPersonClick);
  accredEl('groupPeopleList').addEventListener('click', onAccreditationPersonClick);
  accredEl('groupsList').addEventListener('click', (event) => {
    const groupButton = event.target.closest('[data-group-id]');
    if (!groupButton) return;
    accreditationState.groupDetail = { id: Number(groupButton.dataset.groupId), name: groupButton.querySelector('.accred-group-title').textContent, people: [] };
    accredEl('groupsList').hidden = true;
    accredEl('groupDetail').hidden = false;
    loadAccreditationGroupDetail(accreditationState.groupDetail.id);
  });
  accredEl('backToGroupsBtn').addEventListener('click', () => {
    accreditationState.groupRequest++;
    accreditationState.groupDetail = null;
    accredEl('groupDetail').hidden = true;
    accredEl('groupsList').hidden = false;
    renderAccreditationGroups();
  });
  accredEl('personDetailBody').addEventListener('click', (event) => {
    if (event.target.closest('#saveNotesBtn')) saveAccreditationNotes();
  });
  accredEl('addPersonBtn').addEventListener('click', () => { if (accreditationState.canManage) openAccreditationForm('create'); });
  accredEl('editPersonBtn').addEventListener('click', () => { if (accreditationState.canManage) openAccreditationForm('edit'); });
  accredEl('deletePersonBtn').addEventListener('click', deleteAccreditationPerson);
  accredEl('personForm').addEventListener('submit', saveAccreditationPerson);
  await Promise.all([loadAccreditationSummary(), loadAccreditationGroups(), loadAccreditationPeople()]);
});

function onAccreditationPersonClick(event) {
  const button = event.target.closest('[data-accred-action]');
  if (!button) return;
  const id = Number(button.dataset.personId);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const action = button.dataset.accredAction;
  if (action === 'detail') openAccreditationDetail(id);
  else if (action === 'deliver' || action === 'revoke') changeAccreditationStatus(id, action);
}
