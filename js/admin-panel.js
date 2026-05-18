var title='Administración LumoraEvents';
const allowedRoles=['admin'];
let clients=[],events=[],selectedEventId=null,currentEventDetail=null,keepCreateMode=false;
let clientModal,clearEventDataModal;

function setLoadingButtonState(button,isLoading,loadingText='Guardando...'){
  if(!button) return;

  if(isLoading){
    if(button.dataset.loading==='true') return;
    button.dataset.loading='true';
    button.dataset.originalHtml=button.innerHTML;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.innerHTML=`<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${loadingText}`;
    return;
  }

  if(button.dataset.originalHtml) button.innerHTML=button.dataset.originalHtml;
  button.disabled=false;
  button.removeAttribute('aria-busy');
  delete button.dataset.loading;
  delete button.dataset.originalHtml;
}

document.addEventListener('DOMContentLoaded',async()=>{
  validateRoles(allowedRoles);
  await ensureTranslationsReady();
  renderAdminLayout();
  syncTiedPositionsFieldOptions();
  syncSendStatsCodeFieldOptions();
  syncJudgeFeedbackFieldOptions();
  bindStaticEvents();
  clientModal=new bootstrap.Modal(document.getElementById('clientModal'));
  clearEventDataModal=new bootstrap.Modal(document.getElementById('clearEventDataModal'));
  await loadClients();
  await loadEvents();
});

function renderAdminLayout(){
  const main=document.getElementById('mainContainer');
  const eventModal=document.getElementById('eventModal');
  const eventForm=eventModal?.querySelector('#eventForm');
  if(!main||!eventForm) return;
  main.className='container-fluid py-4 px-3 px-lg-4';
  main.innerHTML=`
    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button type="button" class="nav-link admin-section-link active" data-admin-section="events" aria-selected="true">Eventos</button>
      </li>
      <li class="nav-item" role="presentation">
        <button type="button" class="nav-link admin-section-link" data-admin-section="clients" aria-selected="false">Clientes</button>
      </li>
    </ul>

    <section id="eventsSection" data-admin-panel="events">
          <div class="row g-4 align-items-start">
            <div class="col-12 col-xl-3">
              <div class="card border-0 shadow-sm sticky-xl-top admin-panel-sticky">
                <div class="card-body border-bottom"><div class="d-grid"><button id="createNewEventBtn" class="btn btn-primary">Nuevo evento</button></div></div>
                <div class="card-body border-bottom">
                  <div class="row g-2">
                    <div class="col-4"><label for="eventStatusFilter" class="form-label small fw-semibold mb-1">Estado</label><select id="eventStatusFilter" class="form-select form-select-sm"><option value="all" selected>Todos</option><option value="OPE">Abiertos</option><option value="FIN">Finalizados</option></select></div>
                    <div class="col-4"><label for="eventVisibleFilter" class="form-label small fw-semibold mb-1">Visible</label><select id="eventVisibleFilter" class="form-select form-select-sm"><option value="all" selected>Todos</option><option value="1">Sí</option><option value="0">No</option></select></div>
                    <div class="col-4"><label for="eventTrialFilter" class="form-label small fw-semibold mb-1">Trial</label><select id="eventTrialFilter" class="form-select form-select-sm"><option value="all">Todos</option><option value="1">Sí</option><option value="0" selected>No</option></select></div>
                  </div>
                </div>
                <div class="card-header bg-body-tertiary d-flex justify-content-between align-items-center"><h5 class="mb-0 d-flex align-items-center gap-2"><i class="bi bi-list-ul"></i><span>Eventos</span></h5><span id="count-events" class="badge bg-secondary rounded-pill">0</span></div>
                <div id="eventsList" class="list-group list-group-flush admin-event-list"></div>
                <div id="eventsListEmptyState" class="text-center py-5 px-3 d-none"><i class="bi bi-calendar-x text-muted" style="font-size:3rem;"></i><h5 class="text-muted mt-3">No hay eventos</h5><p class="text-muted mb-0">Crea un evento o ajusta los filtros.</p></div>
              </div>
            </div>
            <div class="col-12 col-xl-9">
              <div class="card border-0 shadow-sm">
                <div class="card-header d-flex justify-content-between align-items-start flex-wrap gap-3">
                  <div><h3 class="h4 mb-1" id="eventPanelTitle">Selecciona un evento</h3><div class="text-body-secondary small" id="eventPanelSubtitle">Haz clic en un evento del listado para cargar su información.</div></div>
                  <div class="d-flex flex-column align-items-stretch gap-2 ms-auto">
                    <div class="d-flex align-items-center justify-content-end flex-wrap gap-2">
                      <span id="eventPanelStatus" class="badge bg-secondary">SIN SELECCIÓN</span>
                      <span id="eventPanelVisibility" class="badge bg-secondary d-none"></span>
                      <span id="eventPanelTrial" class="badge bg-warning text-dark d-none">TRIAL</span>
                    </div>
                    <div class="d-flex align-items-center justify-content-end flex-wrap gap-2 pt-2 border-top">
                      <button type="button" class="btn btn-outline-success btn-sm" id="openSelectedEventBtn" disabled><i class="bi bi-box-arrow-in-right me-1"></i> Entrar</button>
                      <button type="button" class="btn btn-outline-dark btn-sm" id="duplicateSelectedEventBtn" disabled><i class="bi bi-files me-1"></i> Duplicar</button>
                      <button type="button" class="btn btn-outline-warning btn-sm" id="clearSelectedEventBtn" disabled><i class="bi bi-eraser me-1"></i> Vaciar datos</button>
                      <button type="button" class="btn btn-outline-danger btn-sm" id="deleteSelectedEventBtn" disabled><i class="bi bi-trash me-1"></i> Eliminar</button>
                    </div>
                  </div>
                </div>
                <div class="card-body"><div id="eventFormMount"></div></div>
                <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2"><div class="small text-body-secondary" id="eventFormHelperText">Selecciona un evento del listado o crea uno nuevo.</div><button type="button" class="btn btn-primary" id="saveEventBtn">Guardar cambios</button></div>
              </div>
            </div>
          </div>
    </section>
    <section id="clientsSection" data-admin-panel="clients" class="d-none">
          <div class="row justify-content-center mb-3"><div class="col-12 col-md-4 text-center"><button id="createNewClientBtn" class="btn btn-primary btn-lg w-100">Nuevo cliente</button></div></div>
          <div class="card shadow-sm border-0">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2"><h5 class="mb-0 d-flex align-items-center"><i class="bi bi-people-fill me-2"></i> Clientes</h5><span id="count-clients" class="badge bg-secondary rounded-pill">0</span></div>
            <div class="card-body p-2">
              <div class="table-responsive"><table class="table table-hover mb-0"><thead class="table"><tr><th>ID</th><th>Nombre</th><th>Persona de contacto</th><th>Email</th><th>Idioma</th><th>Eventos</th><th class="text-center">Acciones</th></tr></thead><tbody id="clientsTable"></tbody></table></div>
              <div id="clientsEmptyState" class="text-center py-5 d-none"><i class="bi bi-person-x text-muted" style="font-size:3rem;"></i><h5 class="text-muted mt-3">No hay clientes</h5><p class="text-muted">Crea tu primer cliente usando el botón superior.</p></div>
            </div>
          </div>
    </section>`;
  document.getElementById('eventFormMount').appendChild(eventForm);
  buildEventFormTabs();
  eventModal.remove();
  const titleEl=document.querySelector('#event-name span');
  if(titleEl) titleEl.textContent='Administración';
}

function buildEventFormTabs(){
  const form=document.getElementById('eventForm');
  const formRow=form?.querySelector('.row.g-3');
  const languageCol=document.getElementById('language')?.closest('.col-md-2');
  if(!formRow||!languageCol||document.getElementById('eventDetailTabs')) return;

  const tailNodes=[];
  let cursor=languageCol.nextElementSibling;
  while(cursor){
    const next=cursor.nextElementSibling;
    tailNodes.push(cursor);
    cursor=next;
  }

  const separator=document.createElement('div');
  separator.className='col-12';
  separator.innerHTML='<hr>';
  languageCol.insertAdjacentElement('afterend',separator);

  const tabsCol=document.createElement('div');
  tabsCol.className='col-12 mt-2';
  tabsCol.innerHTML=`
    <ul class="nav nav-tabs" id="eventDetailTabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="event-config-tab" data-bs-toggle="tab" data-bs-target="#event-config-pane" type="button" role="tab" aria-controls="event-config-pane" aria-selected="true">Configuración</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="event-registrations-tab" data-bs-toggle="tab" data-bs-target="#event-registrations-pane" type="button" role="tab" aria-controls="event-registrations-pane" aria-selected="false">Inscripciones</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="event-notice-tab" data-bs-toggle="tab" data-bs-target="#event-notice-pane" type="button" role="tab" aria-controls="event-notice-pane" aria-selected="false">Avisos</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="event-web-tab" data-bs-toggle="tab" data-bs-target="#event-web-pane" type="button" role="tab" aria-controls="event-web-pane" aria-selected="false">Web y Logo</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="event-welcome-tab" data-bs-toggle="tab" data-bs-target="#event-welcome-pane" type="button" role="tab" aria-controls="event-welcome-pane" aria-selected="false">Email de bienvenida</button>
      </li>
    </ul>
    <div class="tab-content border border-top-0 rounded-bottom p-3">
      <div class="tab-pane fade show active" id="event-config-pane" role="tabpanel" aria-labelledby="event-config-tab">
        <div class="row g-3" id="eventConfigContent"></div>
      </div>
      <div class="tab-pane fade" id="event-registrations-pane" role="tabpanel" aria-labelledby="event-registrations-tab">
        <div class="row g-3" id="eventRegistrationsContent"></div>
      </div>
      <div class="tab-pane fade" id="event-notice-pane" role="tabpanel" aria-labelledby="event-notice-tab">
        <div class="row g-3" id="eventNoticeContent"></div>
      </div>
      <div class="tab-pane fade" id="event-web-pane" role="tabpanel" aria-labelledby="event-web-tab">
        <div class="row g-3 align-items-center" id="eventWebContent"></div>
      </div>
      <div class="tab-pane fade" id="event-welcome-pane" role="tabpanel" aria-labelledby="event-welcome-tab">
        <div class="row g-3" id="eventWelcomeContent"></div>
      </div>
    </div>
  `;
  separator.insertAdjacentElement('afterend',tabsCol);

  const configContent=document.getElementById('eventConfigContent');
  const registrationsContent=document.getElementById('eventRegistrationsContent');
  const noticeContent=document.getElementById('eventNoticeContent');
  const webContent=document.getElementById('eventWebContent');
  const welcomeContent=document.getElementById('eventWelcomeContent');

  tailNodes.forEach((node)=>{
    if(nodeContainsIds(node,['notice_type','notice_text','notice_active'])){
      appendNodeToTabContent(noticeContent,node);
      return;
    }
    if(nodeContainsIds(node,['eventurl','eventlogo','previewLogo'])){
      appendNodeToTabContent(webContent,node);
      return;
    }
    if(nodeContainsIds(node,['welcome_status','WelcomeSendDate','organizer_info','sendWelcome'])){
      appendNodeToTabContent(welcomeContent,node);
      return;
    }
    if(nodeContainsIds(node,['visible_judges','visible_participants','visible_schedule','visible_results','visible_statistics','show_flags','send_stats_code','hide_judges','has_penalties','has_clubs','hide_school_info','criteria_per_judge','judge_feedback','judges_vis_results','has_masters','has_registrations','registration_start','registration_end','music_extra_time','min_styles','autorefresh_minutes','category_class_type','score_type','criteria_config','total_system','can_decide_positions','restrict_voting','results_filter','tied_positions'])){
      appendNodeToTabContent(configContent,node);
      return;
    }
    node.remove();
  });

  rebuildEventDetailTabLayouts(configContent,registrationsContent);
  activateEventDetailTab();
}

function nodeContainsIds(node,ids){
  return ids.some((id)=>node.id===id||node.querySelector(`#${id}`));
}

function appendNodeToTabContent(content,node){
  if(node.classList.contains('row')){
    const wrapper=document.createElement('div');
    wrapper.className='col-12';
    wrapper.appendChild(node);
    content.appendChild(wrapper);
    return;
  }
  if(node.classList.contains('col-12') && node.querySelector('.row')){
    const nestedRow=node.querySelector(':scope > .row');
    if(nestedRow){
      const wrapper=document.createElement('div');
      wrapper.className='col-12';
      wrapper.appendChild(nestedRow);
      content.appendChild(wrapper);
      node.remove();
      return;
    }
  }
  content.appendChild(node);
}

function rebuildEventDetailTabLayouts(configContent,registrationsContent){
  if(!configContent||!registrationsContent) return;

  const fieldIds=[
    'visible_judges','visible_participants','visible_schedule','visible_results','visible_statistics',
    'show_flags','send_stats_code','hide_judges','judge_feedback','judges_vis_results','has_masters',
    'has_penalties','has_clubs','hide_school_info','has_registrations','registration_start','registration_end','music_extra_time',
    'category_class_type','score_type','criteria_config','total_system','criteria_per_judge',
    'min_styles','autorefresh_minutes','can_decide_positions','restrict_voting','results_filter',
    'tied_positions'
  ];
  const fields=Object.fromEntries(fieldIds.map((id)=>[id,getFormFieldBlock(id)]));
  configContent.innerHTML='';
  registrationsContent.innerHTML='';

  appendConfigRow(configContent,[
    fields.visible_judges,fields.visible_participants,fields.visible_schedule,fields.visible_results,fields.visible_statistics
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.show_flags,fields.hide_judges,fields.judges_vis_results,fields.has_masters
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.has_penalties,fields.has_clubs,fields.hide_school_info,fields.has_registrations,createConfigSpacer()
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.category_class_type,fields.score_type,fields.criteria_config,fields.total_system,fields.criteria_per_judge
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.min_styles,fields.autorefresh_minutes,fields.can_decide_positions,fields.restrict_voting,fields.results_filter
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.tied_positions,fields.send_stats_code,fields.judge_feedback
  ],'col-12 col-md-6 col-lg-4');
  appendConfigRow(registrationsContent,[
    fields.registration_start,fields.registration_end,fields.music_extra_time
  ],'col-12 col-md-6 col-lg-4');
  syncRegistrationsTabState();
}

function getFormFieldBlock(id){
  return document.getElementById(id)?.closest('[class*="col-"]')||null;
}

function appendConfigRow(container,blocks,columnClass){
  const validBlocks=blocks.filter(Boolean);
  if(!validBlocks.length) return;
  const wrapper=document.createElement('div');
  wrapper.className='col-12';
  const row=document.createElement('div');
  row.className='row g-3 align-items-end';
  validBlocks.forEach((block)=>{
    block.className=columnClass;
    row.appendChild(block);
  });
  wrapper.appendChild(row);
  container.appendChild(wrapper);
}

function createConfigSpacer(){
  const spacer=document.createElement('div');
  spacer.setAttribute('aria-hidden','true');
  return spacer;
}

function normalizeTiedPositionsValue(value){
  return ['NO','CR','DR'].includes(value)?value:'NO';
}

function syncTiedPositionsFieldOptions(){
  const select=document.getElementById('tied_positions');
  if(!select) return;
  const currentValue=normalizeTiedPositionsValue(select.value);
  const options=[
    {value:'NO',label:'No posiciones repetidas'},
    {value:'CR',label:'R\u00E1nking con salto'},
    {value:'DR',label:'R\u00E1nking denso'}
  ];
  select.innerHTML='';
  options.forEach(({value,label})=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=label;
    select.appendChild(option);
  });
  select.value=currentValue;
}

function normalizeSendStatsCodeValue(value){
  return ['NO','BY_DANCER','BY_CLUB'].includes(value)?value:'NO';
}

function syncSendStatsCodeFieldOptions(){
  const select=document.getElementById('send_stats_code');
  if(!select) return;
  const currentValue=normalizeSendStatsCodeValue(select.value);
  const options=[
    {value:'NO',label:'No'},
    {value:'BY_DANCER',label:'Por Participante'},
    {value:'BY_CLUB',label:'Por Club/Escuela'}
  ];
  select.innerHTML='';
  options.forEach(({value,label})=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=label;
    select.appendChild(option);
  });
  select.value=currentValue;
}

function syncJudgeFeedbackFieldOptions(){
  const select=document.getElementById('judge_feedback');
  if(!select) return;
  const currentValue=(select.value);
  const options=[
    {value:'NO',label:'No'},
    {value:'TEXT',label:'Feedback por Texto'},
    {value:'AUDIO',label:'Feedback por audio'},
    {value:'TEXT_AUDIO',label:'Feedback por Texto y Audio'}
  ];
  select.innerHTML='';
  options.forEach(({value,label})=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=label;
    select.appendChild(option);
  });
  select.value=currentValue;
}

function bindStaticEvents(){
  document.getElementById('auth-btn')?.addEventListener('click',logout);
  document.getElementById('createNewEventBtn')?.addEventListener('click',openCreateEventMode);
  document.getElementById('createNewClientBtn')?.addEventListener('click',openCreateClientModal);
  document.getElementById('saveEventBtn')?.addEventListener('click',saveEvent);
  document.getElementById('saveClientBtn')?.addEventListener('click',saveClient);
  document.getElementById('sendWelcome')?.addEventListener('click',sendEventWelcomeEmail);
  document.getElementById('confirmClearEventDataBtn')?.addEventListener('click',clearEventData);
  document.getElementById('openSelectedEventBtn')?.addEventListener('click',()=>openEventAccess(currentEventDetail));
  document.getElementById('duplicateSelectedEventBtn')?.addEventListener('click',()=>currentEventDetail&&openDuplicateModal(currentEventDetail.id));
  document.getElementById('clearSelectedEventBtn')?.addEventListener('click',()=>currentEventDetail&&openClearEventDataModal(currentEventDetail));
  document.getElementById('deleteSelectedEventBtn')?.addEventListener('click',()=>currentEventDetail&&confirmDeleteEvent(currentEventDetail));
  ['eventStatusFilter','eventVisibleFilter','eventTrialFilter'].forEach((id)=>document.getElementById(id)?.addEventListener('change',()=>renderEvents()));
  ['visible','trial'].forEach((id)=>document.getElementById(id)?.addEventListener('change',syncEventPanelBadgesFromForm));
  document.getElementById('has_registrations')?.addEventListener('change',syncRegistrationsTabState);
  document.getElementById('clearEventDataCodeInput')?.addEventListener('input',()=>{document.getElementById('clearEventDataCodeInput')?.classList.remove('is-invalid');document.getElementById('clearEventDataFeedback')?.classList.add('d-none');});
  document.addEventListener('click',handleDocumentClick);
}

function handleDocumentClick(ev){
  const sectionBtn=ev.target.closest('[data-admin-section]');
  if(sectionBtn){setActiveSection(sectionBtn.dataset.adminSection);return;}
  const eventItem=ev.target.closest('.event-list-item');
  if(eventItem){loadEventDetail(eventItem.dataset.eventId);return;}
  const editClientBtn=ev.target.closest('.btn-edit-client');
  if(editClientBtn){const client=clients.find((item)=>String(item.id)===String(editClientBtn.closest('tr')?.dataset.id));if(client) openEditClientModal(client);return;}
  const deleteClientBtn=ev.target.closest('.btn-delete-client');
  if(deleteClientBtn){const client=clients.find((item)=>String(item.id)===String(deleteClientBtn.closest('tr')?.dataset.id));if(client) confirmDeleteClient(client);}
}

function setActiveSection(section){
  document.querySelectorAll('[data-admin-panel]').forEach((panel)=>panel.classList.toggle('d-none',panel.dataset.adminPanel!==section));
  document.querySelectorAll('[data-admin-section]').forEach((btn)=>{
    const isActive=btn.dataset.adminSection===section;
    btn.classList.toggle('active',isActive);
    btn.setAttribute('aria-selected',isActive?'true':'false');
  });
}

function logout(){if(getToken()){localStorage.removeItem('token');window.location.href='/index.html';}}
async function loadEvents(options={}){
  try{
    const response=await fetch(`${API_BASE_URL}/api/events/admin`);
    if(!response.ok) throw new Error('Error al cargar los eventos');
    events=await response.json();
    await renderEvents(options);
  }catch(error){console.error('Error cargando eventos:',error);}
}

function getFilteredEvents(){
  const status=document.getElementById('eventStatusFilter')?.value||'all';
  const visible=document.getElementById('eventVisibleFilter')?.value||'all';
  const trial=document.getElementById('eventTrialFilter')?.value||'all';
  return events.filter((event)=>{
    const statusOk=status==='all'||event.status===status;
    const visibleOk=visible==='all'||Number(event.visible)===Number(visible);
    const trialOk=trial==='all'||Number(event.trial)===Number(trial);
    return statusOk&&visibleOk&&trialOk;
  });
}

async function renderEvents(options={}){
  const list=document.getElementById('eventsList');
  const emptyState=document.getElementById('eventsListEmptyState');
  const filtered=getFilteredEvents();
  list.innerHTML='';
  document.getElementById('count-events').textContent=filtered.length;
  emptyState.classList.toggle('d-none',filtered.length>0);

  filtered.forEach((event)=>{
    const active=String(selectedEventId)===String(event.id)&&!keepCreateMode;
    const trialBadge=Number(event.trial)===1
      ? '<span class="badge bg-warning text-dark ms-2">TRIAL</span>'
      : '';
    const button=document.createElement('button');
    button.type='button';
    button.className=`list-group-item list-group-item-action py-3 event-list-item${active?' active':''}`;
    button.dataset.eventId=event.id;
    button.innerHTML=`<div class="d-flex justify-content-between align-items-start gap-2"><div class="text-start"><div class="fw-semibold">${event.name||'Sin nombre'}${trialBadge}</div><div class="small text-body-secondary">ID ${event.id}${event.code?` · ${event.code}`:''}</div></div><div class="d-flex flex-column align-items-end gap-1"><span class="badge ${getStatusBadgeClass(event.status)}">${getStatusLabel(event.status)}</span><span class="badge ${getVisibilityBadgeClass(event.visible)}">${getVisibilityLabel(event.visible)}</span></div></div>`;
    list.appendChild(button);
  });

  if(!filtered.length){selectedEventId=null;currentEventDetail=null;keepCreateMode=false;resetEventForm();return;}
  const preferred=options.preferredEventId?String(options.preferredEventId):null;
  const currentVisible=filtered.some((event)=>String(event.id)===String(selectedEventId));
  if(keepCreateMode&&!preferred) return;
  const nextId=preferred&&filtered.some((event)=>String(event.id)===preferred)?preferred:(currentVisible?String(selectedEventId):String(filtered[0].id));
  if(String(currentEventDetail?.id)!==nextId||options.forceReload) await loadEventDetail(nextId);
  else {selectedEventId=nextId;renderEventsSelection();}
}

function renderEventsSelection(){
  document.querySelectorAll('.event-list-item').forEach((item)=>item.classList.toggle('active',String(item.dataset.eventId)===String(selectedEventId)&&!keepCreateMode));
}

async function fetchEventDetail(id){
  const endpoints=[`${API_BASE_URL}/api/events/admin/${id}`,`${API_BASE_URL}/api/events/${id}`];
  let lastError=null;
  for(const endpoint of endpoints){
    try{
      const response=await fetch(endpoint);
      if(response.ok) return await response.json();
      lastError=new Error(`Error ${response.status} al recuperar el evento`);
    }catch(error){lastError=error;}
  }
  throw lastError||new Error('No se ha podido recuperar el evento');
}

async function loadEventDetail(eventId){
  try{
    const detail=await fetchEventDetail(eventId);
    const listEvent=events.find((event)=>String(event.id)===String(eventId))||{};
    currentEventDetail={...listEvent,...detail};
    selectedEventId=String(eventId);
    keepCreateMode=false;
    populateEventForm(currentEventDetail);
    renderEventsSelection();
  }catch(error){
    console.error('Error cargando detalle del evento:',error);
    showMessageModal('No se ha podido cargar el detalle del evento.','Error');
  }
}

function populateEventForm(eventObj){
  const form=document.getElementById('eventForm');
  form.dataset.action='edit';
  form.dataset.id=eventObj.id;
  document.getElementById('eventId').value=eventObj.id;
  document.getElementById('code').value=eventObj.code||'';
  document.getElementById('name').value=eventObj.name||'';
  document.getElementById('language').value=eventObj.language||'es';
  document.getElementById('status').value=eventObj.status||'OPE';
  document.getElementById('start').value=eventObj.start?String(eventObj.start).slice(0,10):'';
  document.getElementById('end').value=eventObj.end?String(eventObj.end).slice(0,10):'';
  document.getElementById('password').value=eventObj.password||0;
  document.getElementById('eventurl').value=eventObj.eventurl||'';
  document.getElementById('eventlogo').value=eventObj.eventlogo||'';
  document.getElementById('min_styles').value=eventObj.min_styles??'';
  document.getElementById('autorefresh_minutes').value=eventObj.autorefresh_minutes??0;
  document.getElementById('category_class_type').value=eventObj.category_class_type||'NO';
  document.getElementById('score_type').value=eventObj.score_type||'INT';
  document.getElementById('criteria_config').value=eventObj.criteria_config||'NO_CONFIG';
  document.getElementById('total_system').value=eventObj.total_system||'SUM_SCORES';
  document.getElementById('criteria_per_judge').value=Number(eventObj.criteria_per_judge)===1?'1':'0';
  document.getElementById('can_decide_positions').value=eventObj.can_decide_positions??0;
  document.getElementById('restrict_voting').value=eventObj.restrict_voting??0;
  document.getElementById('results_filter').value=eventObj.results_filter||'BY_CAT';
  document.getElementById('tied_positions').value=normalizeTiedPositionsValue(eventObj.tied_positions);
  document.getElementById('send_stats_code').value=normalizeSendStatsCodeValue(eventObj.send_stats_code);
  document.getElementById('judge_feedback').value=eventObj.judge_feedback;
  ['visible','trial','visible_judges','visible_participants','visible_schedule','visible_results','visible_statistics','has_clubs','hide_school_info','has_penalties','has_registrations','judges_vis_results','has_masters','show_flags','hide_judges','notice_active'].forEach((id)=>{document.getElementById(id).checked=Number(eventObj[id])===1;});
  document.getElementById('registration_start').value=eventObj.registration_start?String(eventObj.registration_start).slice(0,10):'';
  document.getElementById('registration_end').value=eventObj.registration_end?String(eventObj.registration_end).slice(0,10):'';
  document.getElementById('music_extra_time').value=eventObj.music_extra_time??0;
  document.getElementById('notice_text').value=eventObj.notice_text||'';
  document.getElementById('notice_type').value=eventObj.notice_type||'INF';
  populateClientSelect();
  document.getElementById('clientSelect').value=eventObj.client_id||'';
  updateLogoPreview();
  updateUrlPreview();
  setEventPanelState(eventObj);
  setEventWelcomeInfo({...eventObj,organizer_info:buildOrganizerInfo(eventObj)});
  syncRegistrationsTabState();
}

function resetEventForm(){
  const form=document.getElementById('eventForm');
  form.reset();
  form.dataset.action='create';
  form.removeAttribute('data-id');
  document.getElementById('eventId').value='';
  document.getElementById('status').value='OPE';
  document.getElementById('language').value='es';
  document.getElementById('notice_type').value='INF';
  document.getElementById('category_class_type').value='NO';
  document.getElementById('score_type').value='INT';
  document.getElementById('criteria_config').value='NO_CONFIG';
  document.getElementById('total_system').value='SUM_SCORES';
  document.getElementById('criteria_per_judge').value='0';
  document.getElementById('can_decide_positions').value='0';
  document.getElementById('results_filter').value='BY_CAT';
  document.getElementById('tied_positions').value='NO';
  document.getElementById('send_stats_code').value='NO';
  document.getElementById('judge_feedback').value='NO';
  document.getElementById('previewLogo').classList.add('d-none');
  document.getElementById('urlPreview').classList.add('d-none');
  populateClientSelect();
  setEventWelcomeInfo(null);
  setEventPanelState(null);
  syncRegistrationsTabState();
  activateEventDetailTab();
}

function syncRegistrationsTabState(){
  const hasRegistrations=document.getElementById('has_registrations')?.checked===true;
  const registrationsTab=document.getElementById('event-registrations-tab');
  if(!registrationsTab) return;

  registrationsTab.disabled=!hasRegistrations;
  registrationsTab.classList.toggle('disabled',!hasRegistrations);
  registrationsTab.setAttribute('aria-disabled',hasRegistrations?'false':'true');

  if(!hasRegistrations&&registrationsTab.classList.contains('active')){
    activateEventDetailTab('event-config-tab');
  }
}

function setEventPanelState(eventObj){
  const hasSelection=!!eventObj;
  document.getElementById('eventPanelTitle').textContent=hasSelection?`${eventObj.name||'Evento'} (${eventObj.code||eventObj.id})`:'Nuevo evento';
  document.getElementById('eventPanelSubtitle').textContent=hasSelection?`ID ${eventObj.id}${eventObj.client_name?` · Cliente: ${eventObj.client_name}`:''}`:'Configura un nuevo evento desde esta ficha.';
  setEventPanelBadges(eventObj);
  document.getElementById('eventFormHelperText').textContent=hasSelection?'Los cambios se guardan manualmente.':'Estás creando un nuevo evento.';
  document.getElementById('saveEventBtn').textContent=hasSelection?'Guardar cambios':'Crear evento';
  ['openSelectedEventBtn','duplicateSelectedEventBtn','clearSelectedEventBtn','deleteSelectedEventBtn'].forEach((id)=>document.getElementById(id).disabled=!hasSelection);
}

function setEventPanelBadges(eventObj){
  const hasSelection=!!eventObj;
  const statusEl=document.getElementById('eventPanelStatus');
  const visibilityEl=document.getElementById('eventPanelVisibility');
  const trialEl=document.getElementById('eventPanelTrial');
  statusEl.className=`badge ${hasSelection?getStatusBadgeClass(eventObj.status):'bg-secondary'}`;
  statusEl.textContent=hasSelection?getStatusLabel(eventObj.status):'SIN SELECCIÓN';
  visibilityEl.className=`badge ${hasSelection?getVisibilityBadgeClass(eventObj.visible):'bg-secondary d-none'}`;
  visibilityEl.textContent=hasSelection?getVisibilityLabel(eventObj.visible):'';
  trialEl.className=`badge bg-warning text-dark${hasSelection&&Number(eventObj.trial)===1?'':' d-none'}`;
}

function syncEventPanelBadgesFromForm(){
  if(!currentEventDetail) return;
  setEventPanelBadges({
    status:document.getElementById('status').value,
    visible:document.getElementById('visible').checked?1:0,
    trial:document.getElementById('trial').checked?1:0
  });
}

function openCreateEventMode(){
  setActiveSection('events');
  selectedEventId=null;
  currentEventDetail=null;
  keepCreateMode=true;
  renderEventsSelection();
  resetEventForm();
}

function activateEventDetailTab(tabId='event-config-tab'){
  const tabTrigger=document.getElementById(tabId);
  if(tabTrigger) bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
}

async function saveEvent(){
  const form=document.getElementById('eventForm');
  const saveBtn=document.getElementById('saveEventBtn');
  const action=form.dataset.action;
  const id=form.dataset.id;
  setLoadingButtonState(saveBtn,true,action==='create'?'Creando...':'Guardando...');
  try{
    const response=await fetch(action==='create'?`${API_BASE_URL}/api/events/admin`:`${API_BASE_URL}/api/events/admin/${id}`,{method:action==='create'?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(collectEventFormData())});
    if(!response.ok){const errorData=await response.json().catch(()=>({error:'Error guardando el evento'}));showMessageModal(errorData.error||'Error guardando el evento','Error');return;}
    const payload=await response.json().catch(()=>({}));
    keepCreateMode=false;
    await loadClients();
    await loadEvents({preferredEventId:payload.id||id||null,forceReload:true});
  }catch(error){console.error('Error guardando el evento:',error);showMessageModal('Error guardando el evento','Error');}
  finally{
    setLoadingButtonState(saveBtn,false);
  }
}

function collectEventFormData(){
  return {
    code:document.getElementById('code').value.trim(),name:document.getElementById('name').value.trim(),language:document.getElementById('language').value,status:document.getElementById('status').value,start:document.getElementById('start').value||null,end:document.getElementById('end').value||null,password:parseInt(document.getElementById('password').value,10)||0,eventurl:document.getElementById('eventurl').value.trim()||null,eventlogo:document.getElementById('eventlogo').value.trim()||null,client_id:parseInt(document.getElementById('clientSelect').value,10)||null,visible:document.getElementById('visible').checked?1:0,trial:document.getElementById('trial').checked?1:0,min_styles:parseInt(document.getElementById('min_styles').value,10)||null,autorefresh_minutes:parseInt(document.getElementById('autorefresh_minutes').value,10)||0,category_class_type:document.getElementById('category_class_type').value||'NO',criteria_config:document.getElementById('criteria_config').value||'NO_CONFIG',total_system:document.getElementById('total_system').value||'SUM_SCORES',visible_judges:document.getElementById('visible_judges').checked?1:0,visible_participants:document.getElementById('visible_participants').checked?1:0,visible_schedule:document.getElementById('visible_schedule').checked?1:0,visible_results:document.getElementById('visible_results').checked?1:0,visible_statistics:document.getElementById('visible_statistics').checked?1:0,has_clubs:document.getElementById('has_clubs').checked?1:0,hide_school_info:document.getElementById('hide_school_info').checked?1:0,criteria_per_judge:parseInt(document.getElementById('criteria_per_judge').value,10)||0,has_penalties:document.getElementById('has_penalties').checked?1:0,has_registrations:document.getElementById('has_registrations').checked?1:0,tied_positions:normalizeTiedPositionsValue(document.getElementById('tied_positions').value),judge_feedback:document.getElementById('judge_feedback').value,judges_vis_results:document.getElementById('judges_vis_results').checked?1:0,has_masters:document.getElementById('has_masters').checked?1:0,registration_start:document.getElementById('registration_start').value||null,registration_end:document.getElementById('registration_end').value||null,music_extra_time:parseInt(document.getElementById('music_extra_time').value,10)||0,notice_text:document.getElementById('notice_text').value.trim(),notice_active:document.getElementById('notice_active').checked?1:0,notice_type:document.getElementById('notice_type').value,score_type:document.getElementById('score_type').value,can_decide_positions:parseInt(document.getElementById('can_decide_positions').value,10)||0,restrict_voting:parseInt(document.getElementById('restrict_voting').value,10)||0,results_filter:document.getElementById('results_filter').value||'BY_CAT',show_flags:document.getElementById('show_flags').checked?1:0,send_stats_code:normalizeSendStatsCodeValue(document.getElementById('send_stats_code').value),hide_judges:document.getElementById('hide_judges').checked?1:0
  };
}
async function loadClients(){
  try{
    const response=await fetch(`${API_BASE_URL}/api/clients`);
    if(!response.ok) throw new Error('Error al cargar los clientes');
    clients=await response.json();
    populateClientSelect();
    renderClients();
  }catch(error){console.error('Error cargando clientes:',error);}
}

function renderClients(){
  const tableBody=document.getElementById('clientsTable');
  const emptyState=document.getElementById('clientsEmptyState');
  tableBody.innerHTML='';
  if(!clients.length){emptyState.classList.remove('d-none');document.getElementById('count-clients').textContent='0';return;}
  emptyState.classList.add('d-none');
  document.getElementById('count-clients').textContent=clients.length;
  clients.forEach((client)=>{
    const tr=document.createElement('tr');
    tr.dataset.id=client.id;
    let numEventsColor='bg-success';
    if(client.num_events===client.booked_events) numEventsColor='bg-primary';
    else if(client.num_events>client.booked_events) numEventsColor='bg-danger';
    tr.innerHTML=`<td>${client.id}</td><td>${client.name}</td><td>${client.contact_person}</td><td>${client.email}</td><td>${client.language}</td><td><span class="badge bg-primary">${client.booked_events}</span> / <span class="badge ${numEventsColor}">${client.num_events}</span> / <span class="badge bg-warning">${client.num_trials}</span></td><td class="text-center"><div class="btn-group"><button type="button" class="btn btn-outline-primary btn-sm btn-edit-client" title="Editar"><i class="bi bi-pencil"></i></button><button type="button" class="btn btn-outline-danger btn-sm btn-delete-client" title="Eliminar"><i class="bi bi-trash"></i></button></div></td>`;
    tableBody.appendChild(tr);
  });
}

function populateClientSelect(){
  const select=document.getElementById('clientSelect');
  if(!select) return;
  select.innerHTML='<option value="">Seleccionar cliente...</option>';
  clients.forEach((client)=>{const option=document.createElement('option');option.value=client.id;option.textContent=`${client.name} (ID:${client.id})`;select.appendChild(option);});
}

function openCreateClientModal(){
  const form=document.getElementById('clientForm');
  form.dataset.action='create';
  form.removeAttribute('data-id');
  form.reset();
  document.querySelector('#clientModal .modal-title span').textContent='Create Client';
  clientModal.show();
}

function openEditClientModal(client){
  const form=document.getElementById('clientForm');
  form.dataset.action='edit';
  form.dataset.id=client.id;
  document.getElementById('clientName').value=client.name;
  document.getElementById('clientContact').value=client.contact_person;
  document.getElementById('clientEmail').value=client.email;
  document.getElementById('clientLanguage').value=client.language;
  document.getElementById('clientBookedEvents').value=client.booked_events||0;
  document.getElementById('clientNumEvents').value=client.num_events;
  document.getElementById('clientNumTrials').value=client.num_trials;
  document.querySelector('#clientModal .modal-title span').textContent='Edit Client';
  clientModal.show();
}

async function saveClient(){
  const form=document.getElementById('clientForm');
  const saveBtn=document.getElementById('saveClientBtn');
  const action=form.dataset.action;
  const id=form.dataset.id;
  const data={name:document.getElementById('clientName').value.trim(),contact_person:document.getElementById('clientContact').value.trim(),email:document.getElementById('clientEmail').value.trim(),language:document.getElementById('clientLanguage').value,booked_events:parseInt(document.getElementById('clientBookedEvents').value,10)||0};
  setLoadingButtonState(saveBtn,true,action==='create'?'Creando...':'Guardando...');
  try{
    const response=await fetch(action==='create'?`${API_BASE_URL}/api/clients`:`${API_BASE_URL}/api/clients/${id}`,{method:action==='create'?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(!response.ok){const errorData=await response.json().catch(()=>({error:'Error guardando el cliente'}));showMessageModal(errorData.error||'Error guardando el cliente','Error');return;}
    await loadClients();
    clientModal.hide();
  }catch(error){console.error('Error guardando cliente:',error);}
  finally{
    setLoadingButtonState(saveBtn,false);
  }
}

function confirmDeleteClient(client){
  const deleteModal=new bootstrap.Modal(document.getElementById('deleteModal'));
  document.getElementById('deleteModalMessage').innerHTML=`¿Estás seguro de que quieres eliminar el cliente <strong>${client.name}</strong>?`;
  document.getElementById('confirmDeleteBtn').onclick=async()=>{await fetch(`${API_BASE_URL}/api/clients/${client.id}`,{method:'DELETE'});await loadClients();deleteModal.hide();};
  deleteModal.show();
}

function confirmDeleteEvent(eventObj){
  const deleteModal=new bootstrap.Modal(document.getElementById('deleteModal'));
  document.getElementById('deleteModalMessage').innerHTML=`¿Estás seguro de que quieres eliminar el evento <strong>${eventObj.name}</strong>?`;
  document.getElementById('confirmDeleteBtn').onclick=async()=>{await deleteEvent(eventObj.id);await loadClients();await loadEvents();deleteModal.hide();};
  deleteModal.show();
}

async function deleteEvent(id){
  const response=await fetch(`${API_BASE_URL}/api/events/${id}`,{method:'DELETE'});
  if(!response.ok){const errorData=await response.json().catch(()=>({error:'Error eliminando el evento'}));showMessageModal(errorData.error||'Error eliminando el evento','Error');}
}

function openDuplicateModal(eventId){
  const modal=new bootstrap.Modal(document.getElementById('duplicateModal'));
  const confirmBtn=document.getElementById('confirmDuplicateBtn');
  confirmBtn.replaceWith(confirmBtn.cloneNode(true));
  document.getElementById('confirmDuplicateBtn').addEventListener('click',async()=>{modal.hide();await duplicateEvent(eventId,document.getElementById('duplicateType').value);});
  modal.show();
}

async function duplicateEvent(eventId,duplicateType){
  try{
    const response=await fetch(`${API_BASE_URL}/api/events/${eventId}/duplicate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:duplicateType})});
    if(!response.ok){const errorData=await response.json().catch(()=>({error:'Error duplicando el evento'}));showMessageModal(errorData.error||'Error duplicando el evento','Error');return;}
    const payload=await response.json().catch(()=>({}));
    await loadEvents({preferredEventId:payload.id||eventId,forceReload:true});
    showToast('Evento duplicado correctamente');
  }catch(error){console.error('Error duplicando el evento:',error);showMessageModal('Error duplicando el evento','Error');}
}

function openClearEventDataModal(eventObj){
  const modalEl=document.getElementById('clearEventDataModal');
  modalEl.dataset.eventId=String(eventObj.id);
  modalEl.dataset.eventCode=String(eventObj.code||'');
  document.getElementById('clearEventDataName').textContent=eventObj.name||eventObj.code||`ID ${eventObj.id}`;
  document.getElementById('clearEventDataExpectedCode').textContent=eventObj.code||'';
  document.getElementById('clearEventDataCodeInput').value='';
  document.getElementById('clearEventDataCodeInput').classList.remove('is-invalid');
  document.getElementById('clearEventDataFeedback').classList.add('d-none');
  clearEventDataModal.show();
}

async function clearEventData(){
  const modalEl=document.getElementById('clearEventDataModal');
  const expectedCode=(modalEl.dataset.eventCode||'').trim();
  const typedCode=document.getElementById('clearEventDataCodeInput').value.trim();
  if(!typedCode||typedCode!==expectedCode){document.getElementById('clearEventDataCodeInput').classList.add('is-invalid');document.getElementById('clearEventDataFeedback').classList.remove('d-none');return;}
  try{
    const response=await fetch(`${API_BASE_URL}/api/events/${modalEl.dataset.eventId}/data`,{method:'DELETE'});
    if(!response.ok){const errorData=await response.json().catch(()=>({error:'Error vaciando los datos del evento'}));showMessageModal(errorData.error||'Error vaciando los datos del evento','Error');return;}
    clearEventDataModal.hide();
    await loadEvents({preferredEventId:selectedEventId,forceReload:true});
    showToast('Datos del evento eliminados correctamente');
  }catch(error){console.error('Error vaciando datos del evento:',error);}
}

function openEventAccess(eventObj){if(eventObj?.code) window.open(`home.html?eventId=${eventObj.code}`,'_blank');}

function updateLogoPreview(){const url=document.getElementById('eventlogo').value.trim();const img=document.getElementById('previewLogo');if(url&&/^(https?:\/\/)/.test(url)){img.src=url;img.classList.remove('d-none');}else img.classList.add('d-none');}
function updateUrlPreview(){const url=document.getElementById('eventurl').value.trim();const previewDiv=document.getElementById('urlPreview');if(url&&/^(https?:\/\/)/.test(url)){document.getElementById('urlPreviewLink').href=url;document.getElementById('urlPreviewText').textContent=url;previewDiv.classList.remove('d-none');}else previewDiv.classList.add('d-none');}
function getStatusBadgeClass(status){if(status==='OPE') return 'bg-success';if(status==='FIN') return 'bg-primary';if(status==='CLO') return 'bg-danger';return 'bg-secondary';}
function getStatusLabel(status){if(status==='OPE') return 'ABIERTO';if(status==='FIN') return 'FINALIZADO';if(status==='CLO') return 'CERRADO';return String(status||'SIN ESTADO').toUpperCase();}
function getVisibilityBadgeClass(visible){return Number(visible)===1?'bg-info text-dark':'bg-dark';}
function getVisibilityLabel(visible){return Number(visible)===1?'VISIBLE':'NO VISIBLE';}

function getWelcomeEmailBadge(eventObj){
  const sendDate=eventObj?.email_send_date??eventObj?.send_date??null;
  if(eventObj?.welcome_email_id==null) return {badgeClass:'bg-secondary',badgeLabel:'No enviado'};
  const status=eventObj?.email_status??eventObj?.welcome_email_status??null;
  const badgeTooltip=sendDate?formatSendDate(sendDate):null;
  if(status==='P') return {badgeClass:'bg-warning text-dark',badgeLabel:'En proceso',badgeTooltip};
  if(status==='S') return {badgeClass:'bg-success',badgeLabel:'Enviado',badgeTooltip};
  if(status==='E') return {badgeClass:'bg-danger',badgeLabel:'Error',badgeTooltip};
  return {badgeClass:'bg-secondary',badgeLabel:'No enviado',badgeTooltip};
}

function formatSendDate(sendDate){const parsed=new Date(sendDate);return Number.isNaN(parsed.getTime())?sendDate:parsed.toLocaleString();}
function buildOrganizerInfo(eventObj){const contact=eventObj.contact_person||'';const email=eventObj.email||'';return contact&&email?`${contact} <${email}>`:contact||email||'';}

function setEventWelcomeInfo(eventObj){
  const normalized=eventObj||{};
  const info=getWelcomeEmailBadge(normalized);
  const badge=document.getElementById('welcome_status');
  badge.className=`badge ${info.badgeClass}`;
  badge.textContent=info.badgeLabel;
  if(info.badgeTooltip) badge.title=info.badgeTooltip; else badge.removeAttribute('title');
  document.getElementById('WelcomeSendDate').value=normalized.email_send_date||normalized.send_date?formatSendDate(normalized.email_send_date||normalized.send_date):'No enviado';
  document.getElementById('organizer_info').value=normalized.organizer_info||'';
  const sendBtn=document.getElementById('sendWelcome');
  sendBtn.dataset.eventId=normalized.id?String(normalized.id):'';
  sendBtn.disabled=!(normalized.id&&normalized.welcome_email_id==null);
}

async function sendEventWelcomeEmail(){
  const eventId=document.getElementById('sendWelcome').dataset.eventId;
  if(!eventId){showMessageModal('No hay evento seleccionado.','Error');return;}
  try{
    const response=await fetch(`${API_BASE_URL}/api/events/${eventId}/send-welcome-email`,{method:'POST',headers:{'Content-Type':'application/json'}});
    if(!response.ok){const errorData=await response.json().catch(()=>({error:'Error enviando el email de bienvenida'}));showMessageModal(errorData.error||'Error enviando el email de bienvenida','Error');return;}
    await loadEventDetail(eventId);
    await loadEvents({preferredEventId:eventId});
  }catch(error){console.error('Error enviando bienvenida:',error);}
}

function showToast(message,type='success'){
  const container=document.getElementById('toastContainer');
  const toastEl=document.createElement('div');
  toastEl.className=`toast align-items-center text-bg-${type} border-0 mb-2`;
  toastEl.innerHTML=`<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  container.appendChild(toastEl);
  const toast=new bootstrap.Toast(toastEl,{delay:3000});
  toast.show();
  toastEl.addEventListener('hidden.bs.toast',()=>toastEl.remove());
}


