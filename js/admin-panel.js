var title='Administración LumoraEvents';
const allowedRoles=['admin'];
let clients=[],events=[],directoryEvents=[],directoryMasters=[],directoryStyles=[],selectedEventId=null,currentEventDetail=null,keepCreateMode=false;
let clientModal,clearEventDataModal,categoryEditorModal,directoryEventModal,directoryCatalogModal;
let directoryEventsLoaded=false,directoryCatalogsLoaded=false,directoryStylesLoaded=false,directoryMastersLoaded=false;
let categoryEditorDraft=[];
const directoryEventTypeOptions=['FESTIVAL','GALA SHOW','WORKSHOPS','MASTERCLASSES'];
const directoryCatalogConfig={
  masters:{singular:'maestro/a',plural:'Maestros',nameMaxLength:100,hasNationality:true,tableId:'directoryMastersTable',countId:'count-directory-masters',loadingId:'directoryMastersLoadingState',emptyId:'directoryMastersEmptyState'},
  styles:{singular:'estilo',plural:'Estilos',nameMaxLength:50,hasNationality:false,tableId:'directoryStylesTable',countId:'count-directory-styles',loadingId:'directoryStylesLoadingState',emptyId:'directoryStylesEmptyState'}
};
const directoryEventValueConfig={
  status:{
    ACT:{label:'ACTIVO',badgeClass:'text-bg-success'},
    INA:{label:'INACTIVO',badgeClass:'text-bg-secondary'},
    DEL:{label:'DESCARTADO',badgeClass:'text-bg-danger'}
  },
  update_status:{
    OK:{label:'OK',badgeClass:'text-bg-success'},
    PEN:{label:'PENDIENTE',badgeClass:'text-bg-warning'}
  },
  is_published:{
    1:{label:'PUBLICADO',filterLabel:'Sí',badgeClass:'text-bg-success'},
    0:{label:'NO PUBLICADO',filterLabel:'No',badgeClass:'text-bg-secondary'}
  },
  contact_status:{
    NON:{label:'sin contacto',badgeClass:'text-bg-secondary'},
    INB:{label:'han contactado',badgeClass:'text-bg-info'},
    SEN:{label:'info enviada',badgeClass:'text-bg-primary'},
    RES:{label:'han respondido',badgeClass:'text-bg-warning'},
    INT:{label:'interesados',badgeClass:'text-bg-success'},
    NIN:{label:'no interesados',badgeClass:'text-bg-danger'},
    CLI:{label:'clientes',badgeClass:'text-bg-dark'}
  }
};

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

function formatCentsToCurrencyValue(value){
  if(value===null||value===undefined||value==='') return '';
  const cents=Number(value);
  if(!Number.isFinite(cents)) return '';
  return (cents/100).toFixed(2);
}

function parseCurrencyValueToCents(value){
  const normalized=String(value??'').replace(',','.').trim();
  if(!normalized) return 0;
  const amount=Number(normalized);
  if(!Number.isFinite(amount)) return 0;
  return Math.round(amount*100);
}

document.addEventListener('DOMContentLoaded',async()=>{
  validateRoles(allowedRoles);
  await ensureTranslationsReady();
  renderAdminLayout();
  ensureDirectoryEventModal();
  ensureDirectoryCatalogModal();
  initDirectoryEventTypeSelect();
  initDirectoryDanceStyleSelect();
  initDirectoryMasterSelect();
  syncTiedPositionsFieldOptions();
  syncSendStatsCodeFieldOptions();
  syncJudgeFeedbackFieldOptions();
  bindStaticEvents();
  clientModal=new bootstrap.Modal(document.getElementById('clientModal'));
  clearEventDataModal=new bootstrap.Modal(document.getElementById('clearEventDataModal'));
  categoryEditorModal=new bootstrap.Modal(document.getElementById('categoryEditorModal'));
  directoryEventModal=new bootstrap.Modal(document.getElementById('directoryEventModal'));
  directoryCatalogModal=new bootstrap.Modal(document.getElementById('directoryCatalogModal'));
  setEventCategories([]);
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
      <li class="nav-item" role="presentation">
        <button type="button" class="nav-link admin-section-link" data-admin-section="bellydance" aria-selected="false">Bellydance</button>
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
    </section>
    <section id="bellydanceSection" data-admin-panel="bellydance" class="d-none">
      <ul class="nav nav-tabs mb-4" role="tablist" aria-label="Secciones de Bellydance">
        <li class="nav-item" role="presentation">
          <button type="button" class="nav-link bellydance-tab-link active" data-bellydance-tab="events" aria-selected="true">Eventos</button>
        </li>
        <li class="nav-item" role="presentation">
          <button type="button" class="nav-link bellydance-tab-link" data-bellydance-tab="catalogs" aria-selected="false">Maestros/Estilos</button>
        </li>
      </ul>
      <div data-bellydance-panel="events">
      <div class="card shadow-sm border-0 mb-3">
        <div class="card-header bg-body-tertiary">
          <h3 class="h6 mb-0"><i class="bi bi-funnel me-2"></i>Filtros</h3>
        </div>
        <div class="card-body">
          <div class="row g-3 align-items-end">
            <div class="col-12 col-md-6 col-lg-3">
              <label for="directoryNameFilter" class="form-label">Nombre</label>
              <input type="search" id="directoryNameFilter" class="form-control" autocomplete="off">
            </div>
            <div class="col-12 col-sm-6 col-lg-1">
              <label for="directoryCountryFilter" class="form-label">País</label>
              <select id="directoryCountryFilter" class="form-select"><option value="">Todos</option></select>
            </div>
            <div class="col-12 col-sm-6 col-lg-1">
              <label for="directoryDateFromFilter" class="form-label">Desde</label>
              <input type="date" id="directoryDateFromFilter" class="form-control">
            </div>
            <div class="col-12 col-sm-6 col-lg-1">
              <label for="directoryDateToFilter" class="form-label">Hasta</label>
              <input type="date" id="directoryDateToFilter" class="form-control">
            </div>
            <div class="col-12 col-sm-6 col-lg-1">
              <label for="directoryStatusFilter" class="form-label">Estado</label>
              <select id="directoryStatusFilter" class="form-select"><option value="">Todos</option></select>
            </div>
            <div class="col-12 col-sm-6 col-lg-1">
              <label for="directoryUpdateStatusFilter" class="form-label">Actualización</label>
              <select id="directoryUpdateStatusFilter" class="form-select"><option value="">Todos</option></select>
            </div>
            <div class="col-12 col-sm-6 col-lg-1">
              <label for="directoryPublishedFilter" class="form-label">Publicado</label>
              <select id="directoryPublishedFilter" class="form-select"><option value="">Todos</option></select>
            </div>
            <div class="col-12 col-sm-6 col-lg-1">
              <label for="directoryContactStatusFilter" class="form-label">Contacto</label>
              <select id="directoryContactStatusFilter" class="form-select"><option value="">Todos</option></select>
            </div>
            <div class="col-12 col-sm-6 col-lg-2">
              <button type="button" id="clearDirectoryFiltersBtn" class="btn btn-outline-secondary w-100">
                Limpiar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card shadow-sm border-0">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <h3 class="h5 mb-0"><i class="bi bi-calendar-event me-2"></i>Eventos</h3>
          <div class="d-flex align-items-center gap-2">
            <button id="createDirectoryEventBtn" class="btn btn-primary btn-sm">
              <i class="bi bi-plus-lg me-1"></i> Nuevo evento
            </button>
            <span id="count-directory-events" class="badge bg-secondary rounded-pill">0</span>
          </div>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Nombre</th>
                  <th>Fecha inicio</th>
                  <th>Fecha fin</th>
                  <th>País</th>
                  <th class="text-center">Poster</th>
                  <th>Estado</th>
                  <th>Actualización</th>
                  <th>Publicado</th>
                  <th>Contacto</th>
                  <th>Visitas</th>
                  <th>Última actualización</th>
                  <th class="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody id="directoryEventsTable"></tbody>
            </table>
          </div>
          <div id="directoryEventsLoadingState" class="text-center py-5 d-none">
            <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div>
            <p class="text-body-secondary mt-3 mb-0">Cargando eventos...</p>
          </div>
          <div id="directoryEventsEmptyState" class="text-center py-5 d-none">
            <i class="bi bi-calendar-x text-muted" style="font-size:3rem;"></i>
            <h4 class="h5 text-muted mt-3">No hay eventos</h4>
            <p class="text-muted mb-0">Crea un evento o ajusta los filtros.</p>
          </div>
        </div>
      </div>
      </div>
      <div data-bellydance-panel="catalogs" class="d-none">
      <div class="row g-4">
        <div class="col-12 col-lg-6">
          <div class="card shadow-sm border-0 h-100">
            <div class="card-header d-flex justify-content-between align-items-center gap-2">
              <h3 class="h5 mb-0"><i class="bi bi-person-badge me-2"></i>Maestros</h3>
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-primary btn-sm btn-create-directory-catalog" data-resource="masters">
                  <i class="bi bi-plus-lg me-1"></i>Nuevo maestro/a
                </button>
                <span id="count-directory-masters" class="badge bg-secondary rounded-pill">0</span>
              </div>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                  <thead class="table-light"><tr><th>Nombre</th><th>Nacionalidad</th><th class="text-center">Acciones</th></tr></thead>
                  <tbody id="directoryMastersTable"></tbody>
                </table>
              </div>
              <div id="directoryMastersLoadingState" class="text-center py-5 d-none">
                <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div>
              </div>
              <div id="directoryMastersEmptyState" class="text-center text-body-secondary py-5 d-none">No hay maestros registrados.</div>
            </div>
          </div>
        </div>
        <div class="col-12 col-lg-6">
          <div class="card shadow-sm border-0 h-100">
            <div class="card-header d-flex justify-content-between align-items-center gap-2">
              <h3 class="h5 mb-0"><i class="bi bi-stars me-2"></i>Estilos</h3>
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-primary btn-sm btn-create-directory-catalog" data-resource="styles">
                  <i class="bi bi-plus-lg me-1"></i>Nuevo estilo
                </button>
                <span id="count-directory-styles" class="badge bg-secondary rounded-pill">0</span>
              </div>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                  <thead class="table-light"><tr><th>Nombre</th><th class="text-center">Acciones</th></tr></thead>
                  <tbody id="directoryStylesTable"></tbody>
                </table>
              </div>
              <div id="directoryStylesLoadingState" class="text-center py-5 d-none">
                <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div>
              </div>
              <div id="directoryStylesEmptyState" class="text-center text-body-secondary py-5 d-none">No hay estilos registrados.</div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>`;
  document.getElementById('eventFormMount').appendChild(eventForm);
  buildEventFormTabs();
  eventModal.remove();
  const titleEl=document.querySelector('#event-name span');
  if(titleEl) titleEl.textContent='Administración';
}

function ensureDirectoryEventModal(){
  if(document.getElementById('directoryEventModal')) return;
  const wrapper=document.createElement('div');
  wrapper.innerHTML=`
    <div class="modal fade" id="directoryEventModal" tabindex="-1" aria-labelledby="directoryEventModalTitle" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="directoryEventModalTitle">Crear evento Bellydance</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <form id="directoryEventForm" data-action="create">
              <div class="row g-3">
                <div class="col-12 col-md-2">
                  <label class="form-label" for="directoryEventId">ID</label>
                  <input type="text" class="form-control bg-body-tertiary" id="directoryEventId" name="id" readonly>
                </div>
                <div class="col-12 col-md-5">
                  <label class="form-label" for="directoryEventCreatedAt">Fecha de creación</label>
                  <input type="text" class="form-control bg-body-tertiary" id="directoryEventCreatedAt" name="created_at" readonly>
                </div>
                <div class="col-12 col-md-5">
                  <label class="form-label" for="directoryEventUpdatedAt">Última actualización</label>
                  <input type="text" class="form-control bg-body-tertiary" id="directoryEventUpdatedAt" name="updated_at" readonly>
                </div>

                <div class="col-12">
                  <hr class="my-1">
                </div>
                <div class="col-12 col-lg-6">
                  <label class="form-label" for="directoryEventName">Nombre</label>
                  <input type="text" class="form-control" id="directoryEventName" name="name" maxlength="150" required>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <label class="form-label" for="directoryEventStartDate">Fecha de inicio</label>
                  <input type="date" class="form-control" id="directoryEventStartDate" name="start_date" required>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <label class="form-label" for="directoryEventEndDate">Fecha de fin</label>
                  <input type="date" class="form-control" id="directoryEventEndDate" name="end_date" required>
                  <div class="invalid-feedback">La fecha de fin no puede ser anterior a la fecha de inicio.</div>
                </div>
                <div class="col-12">
                  <label class="form-label" for="directoryEventDescription">Descripción</label>
                  <textarea class="form-control" id="directoryEventDescription" name="description" rows="3"></textarea>
                </div>
                <div class="col-12 col-md-4">
                  <label class="form-label" for="directoryEventCity">Ciudad</label>
                  <input type="text" class="form-control" id="directoryEventCity" name="city" maxlength="100">
                </div>
                <div class="col-12 col-md-2">
                  <label class="form-label" for="directoryEventCountryCode">Código de país</label>
                  <input type="text" class="form-control text-uppercase" id="directoryEventCountryCode" name="country_code" maxlength="2" pattern="[A-Za-z]{2}">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventVenue">Lugar</label>
                  <input type="text" class="form-control" id="directoryEventVenue" name="venue" maxlength="150">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventOrganizerName">Organizador</label>
                  <input type="text" class="form-control" id="directoryEventOrganizerName" name="organizer_name" maxlength="150">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventOrganizerInstagram">Instagram del organizador</label>
                  <input type="text" class="form-control" id="directoryEventOrganizerInstagram" name="organizer_instagram" maxlength="300" placeholder="Indica el usuario de Instagram sin @">
                </div>

                <div class="col-12">
                  <hr class="my-1">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventEventType">Tipo de evento</label>
                  <select class="form-select" id="directoryEventEventType" name="event_type" multiple>
                    ${directoryEventTypeOptions.map((eventType)=>`<option value="${eventType}">${eventType}</option>`).join('')}
                  </select>
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventDanceStyles">Estilos de baile</label>
                  <select class="form-select" id="directoryEventDanceStyles" name="dance_styles" multiple required></select>
                </div>
                <div class="col-12">
                  <div class="border rounded-3 bg-body-tertiary p-3">
                    <h6 class="mb-3"><i class="bi bi-person-badge me-2"></i>Gestión de maestros/as</h6>
                    <div class="row g-3">
                      <div class="col-12 col-lg-5">
                        <label class="form-label" for="directoryEventMasterCatalog">Añadir desde el catálogo</label>
                        <select class="form-select" id="directoryEventMasterCatalog"></select>
                        <div class="form-text">Selecciona un maestro/a para añadirlo al campo editable.</div>
                      </div>
                      <div class="col-12 col-lg-7">
                        <label class="form-label" for="directoryEventMasters">Maestros/as del evento</label>
                        <textarea class="form-control" id="directoryEventMasters" name="masters" rows="3" maxlength="500"></textarea>
                        <div class="form-text">Puedes añadir, corregir o eliminar valores manualmente. Usa valores con formato Nombre (PAÍS), separados por comas.</div>
                        <div id="directoryEventMasterStatus" class="d-flex flex-wrap gap-2 mt-2" aria-live="polite"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <label class="form-label" for="directoryEventStatus">Estado</label>
                  <select class="form-select" id="directoryEventStatus" name="status" data-directory-value-field="status" required></select>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <label class="form-label" for="directoryEventUpdateStatus">Estado de actualización</label>
                  <select class="form-select" id="directoryEventUpdateStatus" name="update_status" data-directory-value-field="update_status" required></select>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <label class="form-label" for="directoryEventIsPublished">Publicado</label>
                  <select class="form-select" id="directoryEventIsPublished" name="is_published" data-directory-value-field="is_published" required></select>
                </div>
                <div class="col-12 col-sm-6 col-lg-3">
                  <label class="form-label" for="directoryEventContactStatus">Estado de contacto</label>
                  <select class="form-select" id="directoryEventContactStatus" name="contact_status" data-directory-value-field="contact_status" required></select>
                </div>

                <div class="col-12">
                  <hr class="my-1">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventWebsiteUrl">Sitio web</label>
                  <input type="url" class="form-control" id="directoryEventWebsiteUrl" name="website_url" maxlength="300">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventRegistrationUrl">Enlace de registro</label>
                  <input type="url" class="form-control" id="directoryEventRegistrationUrl" name="registration_url" maxlength="300">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventInstagramUrl">Instagram</label>
                  <input type="url" class="form-control" id="directoryEventInstagramUrl" name="instagram_url" maxlength="300">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventFacebookUrl">Facebook</label>
                  <input type="url" class="form-control" id="directoryEventFacebookUrl" name="facebook_url" maxlength="300">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventTiktokUrl">TikTok</label>
                  <input type="url" class="form-control" id="directoryEventTiktokUrl" name="tiktok_url" maxlength="300">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventYoutubeUrl">YouTube</label>
                  <input type="url" class="form-control" id="directoryEventYoutubeUrl" name="youtube_url" maxlength="300">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventPosterUrl">Cartel</label>
                  <input type="url" class="form-control" id="directoryEventPosterUrl" name="poster_url" maxlength="300">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label" for="directoryEventContactEmail">Email de contacto</label>
                  <input type="email" class="form-control" id="directoryEventContactEmail" name="contact_email" maxlength="200">
                </div>

                <div class="col-12">
                  <hr class="my-1">
                </div>
                <div class="col-12 col-md-6 col-lg-3">
                  <label class="form-label" for="directoryEventContactedUsAt">Fecha de contacto recibido</label>
                  <input type="datetime-local" class="form-control" id="directoryEventContactedUsAt" name="contacted_us_at">
                </div>
                <div class="col-12 col-md-6 col-lg-3">
                  <label class="form-label" for="directoryEventOutreachSentAt">Fecha de información enviada</label>
                  <input type="datetime-local" class="form-control" id="directoryEventOutreachSentAt" name="outreach_sent_at">
                </div>
                <div class="col-12 col-md-6 col-lg-3">
                  <label class="form-label" for="directoryEventOutreachResponseAt">Fecha de respuesta</label>
                  <input type="datetime-local" class="form-control" id="directoryEventOutreachResponseAt" name="outreach_response_at">
                </div>
                <div class="col-12 col-md-6 col-lg-3">
                  <label class="form-label" for="directoryEventLastCheckedAt">Última comprobación</label>
                  <input type="datetime-local" class="form-control" id="directoryEventLastCheckedAt" name="last_checked_at">
                </div>
                <div class="col-12 col-md-4">
                  <label class="form-label" for="directoryEventContactSource">Origen del contacto</label>
                  <input type="text" class="form-control" id="directoryEventContactSource" name="contact_source" maxlength="20">
                </div>
                <div class="col-12 col-md-8">
                  <label class="form-label" for="directoryEventInternalNotes">Notas internas</label>
                  <textarea class="form-control" id="directoryEventInternalNotes" name="internal_notes" rows="3"></textarea>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="saveDirectoryEventBtn">Crear evento</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper.firstElementChild);
  populateDirectoryEventValueFields();
}

function ensureDirectoryCatalogModal(){
  if(document.getElementById('directoryCatalogModal')) return;
  const wrapper=document.createElement('div');
  wrapper.innerHTML=`
    <div class="modal fade" id="directoryCatalogModal" tabindex="-1" aria-labelledby="directoryCatalogModalTitle" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="directoryCatalogModalTitle">Nuevo registro</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <form id="directoryCatalogForm" data-action="create">
              <div class="mb-3">
                <label class="form-label" for="directoryCatalogName">Nombre</label>
                <input type="text" class="form-control" id="directoryCatalogName" name="name" required>
              </div>
              <div id="directoryCatalogNationalityGroup">
                <label class="form-label" for="directoryCatalogNationality">Nacionalidad</label>
                <input type="text" class="form-control text-uppercase" id="directoryCatalogNationality" name="nationality" maxlength="2" pattern="[A-Za-z]{2}" required>
                <div class="form-text">Código de país de dos letras.</div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="saveDirectoryCatalogBtn">Crear</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper.firstElementChild);
}

function populateDirectoryEventValueFields(){
  document.querySelectorAll('[data-directory-value-field]').forEach((select)=>{
    const field=select.dataset.directoryValueField;
    const options=directoryEventValueConfig[field]||{};
    select.replaceChildren();
    Object.entries(options).forEach(([value,config])=>{
      select.appendChild(new Option(config.label,value));
    });
  });
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
    if(nodeContainsIds(node,['category'])){
      node.className='col-md-3';
      const statusBlock=getFormFieldBlock('status');
      if(statusBlock) statusBlock.insertAdjacentElement('beforebegin',node);
      return;
    }
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
    if(nodeContainsIds(node,['visible_judges','visible_participants','visible_schedule','visible_results','visible_statistics','show_flags','send_stats_code','hide_judges','has_penalties','has_clubs','hide_school_info','criteria_per_judge','judge_feedback','judges_vis_results','judges_can_change_votes','has_masters','has_registrations','has_audience_voting','registration_start','registration_end','music_extra_time','registration_fee_cost','registration_finance','registration_not_new_school','registration_not_new_group','show_gender','min_styles','category_class_type','score_type','criteria_config','total_system','can_decide_positions','restrict_voting','results_filter','tied_positions'])){
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
    'show_flags','send_stats_code','hide_judges','judge_feedback','judges_vis_results','judges_can_change_votes','has_masters',
    'has_penalties','has_clubs','hide_school_info','has_registrations','has_audience_voting','registration_start','registration_end','music_extra_time','registration_fee_cost',
    'registration_finance','registration_not_new_school','registration_not_new_group','show_gender',
    'category_class_type','score_type','criteria_config','total_system','criteria_per_judge',
    'min_styles','can_decide_positions','restrict_voting','results_filter',
    'tied_positions'
  ];
  const fields=Object.fromEntries(fieldIds.map((id)=>[id,getFormFieldBlock(id)]));
  configContent.innerHTML='';
  registrationsContent.innerHTML='';

  appendConfigRow(configContent,[
    fields.visible_judges,fields.visible_participants,fields.visible_schedule,fields.visible_results,fields.visible_statistics
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.show_flags,fields.hide_judges,fields.judges_vis_results,fields.judges_can_change_votes,fields.has_masters
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.has_penalties,fields.has_clubs,fields.hide_school_info,fields.has_registrations,fields.has_audience_voting
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.category_class_type,fields.score_type,fields.criteria_config,fields.total_system,fields.criteria_per_judge
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.min_styles,fields.can_decide_positions,fields.restrict_voting,fields.results_filter
  ],'col-12 col-md-6 col-lg');
  appendConfigRow(configContent,[
    fields.tied_positions,fields.send_stats_code,fields.judge_feedback
  ],'col-12 col-md-6 col-lg-4');
  appendConfigRow(registrationsContent,[
    fields.registration_start,fields.registration_end,fields.music_extra_time,fields.registration_fee_cost
  ],'col-12 col-md-6 col-lg-3');
  appendConfigRow(registrationsContent,[
    fields.registration_finance,fields.registration_not_new_school,fields.registration_not_new_group,fields.show_gender
  ],'col-12 col-md-6 col-lg-3');
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

function parseEventCategories(value){
  const rawValues=Array.isArray(value)
    ? value.flatMap((item)=>String(item??'').split(','))
    : String(value??'').split(',');
  const seen=new Set();
  return rawValues
    .map((item)=>String(item??'').trim())
    .filter(Boolean)
    .filter((item)=>{
      const key=item.toLowerCase();
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatEventCategoriesValue(categories){
  return parseEventCategories(categories).join(',');
}

function getEventCategories(){
  return parseEventCategories(document.getElementById('category')?.value||'');
}

function setEventCategories(categories){
  const normalized=parseEventCategories(categories);
  const input=document.getElementById('category');
  if(input) input.value=formatEventCategoriesValue(normalized);
  renderEventCategoryBadges(normalized);
}

function renderEventCategoryBadges(categories=getEventCategories()){
  const badgesContainer=document.getElementById('categoryBadges');
  const emptyState=document.getElementById('categoryEmptyState');
  if(!badgesContainer||!emptyState) return;

  badgesContainer.innerHTML='';
  categories.forEach((category)=>{
    const badge=document.createElement('span');
    badge.className='badge text-bg-primary';
    badge.textContent=category;
    badgesContainer.appendChild(badge);
  });

  emptyState.classList.toggle('d-none',categories.length>0);
}

function renderCategoryEditorDraft(){
  const list=document.getElementById('categoryEditorList');
  const emptyState=document.getElementById('categoryEditorEmptyState');
  if(!list||!emptyState) return;

  list.innerHTML='';
  categoryEditorDraft.forEach((category,index)=>{
    const badge=document.createElement('span');
    badge.className='badge text-bg-primary admin-category-editor-chip';

    const label=document.createElement('span');
    label.textContent=category;
    badge.appendChild(label);

    const removeBtn=document.createElement('button');
    removeBtn.type='button';
    removeBtn.className='admin-category-editor-remove';
    removeBtn.dataset.categoryIndex=String(index);
    removeBtn.setAttribute('aria-label',`Eliminar categoría ${category}`);
    removeBtn.innerHTML='&times;';
    badge.appendChild(removeBtn);

    list.appendChild(badge);
  });

  emptyState.classList.toggle('d-none',categoryEditorDraft.length>0);
}

function openCategoryEditorModal(){
  categoryEditorDraft=getEventCategories();
  const input=document.getElementById('categoryEditorInput');
  if(input) input.value='';
  renderCategoryEditorDraft();
  categoryEditorModal?.show();
  setTimeout(()=>input?.focus(),150);
}

function addCategoryEditorValues(){
  const input=document.getElementById('categoryEditorInput');
  if(!input) return;

  const nextValues=parseEventCategories(input.value);
  if(!nextValues.length){
    input.focus();
    return;
  }

  categoryEditorDraft=parseEventCategories([...categoryEditorDraft,...nextValues]);
  input.value='';
  renderCategoryEditorDraft();
  input.focus();
}

function removeCategoryEditorValue(index){
  if(!Number.isInteger(index)||index<0||index>=categoryEditorDraft.length) return;
  categoryEditorDraft=categoryEditorDraft.filter((_,itemIndex)=>itemIndex!==index);
  renderCategoryEditorDraft();
}

function saveCategoryEditor(){
  setEventCategories(categoryEditorDraft);
  categoryEditorModal?.hide();
}

function bindStaticEvents(){
  document.getElementById('auth-btn')?.addEventListener('click',logout);
  document.getElementById('createNewEventBtn')?.addEventListener('click',openCreateEventMode);
  document.getElementById('createNewClientBtn')?.addEventListener('click',openCreateClientModal);
  document.getElementById('createDirectoryEventBtn')?.addEventListener('click',openCreateDirectoryEventModal);
  document.getElementById('saveEventBtn')?.addEventListener('click',saveEvent);
  document.getElementById('saveClientBtn')?.addEventListener('click',saveClient);
  document.getElementById('saveDirectoryEventBtn')?.addEventListener('click',saveDirectoryEvent);
  document.getElementById('saveDirectoryCatalogBtn')?.addEventListener('click',saveDirectoryCatalog);
  document.getElementById('sendWelcome')?.addEventListener('click',sendEventWelcomeEmail);
  document.getElementById('confirmClearEventDataBtn')?.addEventListener('click',clearEventData);
  document.getElementById('openSelectedEventBtn')?.addEventListener('click',()=>openEventAccess(currentEventDetail));
  document.getElementById('duplicateSelectedEventBtn')?.addEventListener('click',()=>currentEventDetail&&openDuplicateModal(currentEventDetail.id));
  document.getElementById('clearSelectedEventBtn')?.addEventListener('click',()=>currentEventDetail&&openClearEventDataModal(currentEventDetail));
  document.getElementById('deleteSelectedEventBtn')?.addEventListener('click',()=>currentEventDetail&&confirmDeleteEvent(currentEventDetail));
  document.getElementById('editCategoryBtn')?.addEventListener('click',openCategoryEditorModal);
  document.getElementById('addCategoryEditorBtn')?.addEventListener('click',addCategoryEditorValues);
  document.getElementById('saveCategoryEditorBtn')?.addEventListener('click',saveCategoryEditor);
  document.getElementById('categoryEditorInput')?.addEventListener('keydown',(event)=>{
    if(event.key!=='Enter') return;
    event.preventDefault();
    addCategoryEditorValues();
  });
  document.getElementById('categoryEditorList')?.addEventListener('click',(event)=>{
    const removeBtn=event.target.closest('[data-category-index]');
    if(!removeBtn) return;
    removeCategoryEditorValue(parseInt(removeBtn.dataset.categoryIndex,10));
  });
  document.getElementById('categoryEditorModal')?.addEventListener('hidden.bs.modal',()=>{
    const input=document.getElementById('categoryEditorInput');
    if(input) input.value='';
  });
  ['eventStatusFilter','eventVisibleFilter','eventTrialFilter'].forEach((id)=>document.getElementById(id)?.addEventListener('change',()=>renderEvents()));
  document.getElementById('directoryNameFilter')?.addEventListener('input',renderDirectoryEvents);
  [
    'directoryCountryFilter',
    'directoryDateFromFilter',
    'directoryDateToFilter',
    'directoryStatusFilter',
    'directoryUpdateStatusFilter',
    'directoryPublishedFilter',
    'directoryContactStatusFilter'
  ].forEach((id)=>document.getElementById(id)?.addEventListener('change',renderDirectoryEvents));
  document.getElementById('clearDirectoryFiltersBtn')?.addEventListener('click',clearDirectoryEventFilters);
  ['directoryEventStartDate','directoryEventEndDate'].forEach((id)=>document.getElementById(id)?.addEventListener('change',validateDirectoryEventDates));
  document.getElementById('directoryEventCountryCode')?.addEventListener('input',(event)=>{event.target.value=event.target.value.toUpperCase();});
  document.getElementById('directoryCatalogNationality')?.addEventListener('input',(event)=>{event.target.value=event.target.value.toUpperCase();});
  document.getElementById('directoryEventMasters')?.addEventListener('input',renderDirectoryMasterValueStatus);
  document.getElementById('directoryCatalogModal')?.addEventListener('shown.bs.modal',()=>{
    const form=document.getElementById('directoryCatalogForm');
    if(form?.dataset.action==='create') document.getElementById('directoryCatalogName')?.focus();
  });
  ['visible','trial'].forEach((id)=>document.getElementById(id)?.addEventListener('change',syncEventPanelBadgesFromForm));
  document.getElementById('has_registrations')?.addEventListener('change',syncRegistrationsTabState);
  document.getElementById('clearEventDataCodeInput')?.addEventListener('input',()=>{document.getElementById('clearEventDataCodeInput')?.classList.remove('is-invalid');document.getElementById('clearEventDataFeedback')?.classList.add('d-none');});
  document.addEventListener('click',handleDocumentClick);
}

function handleDocumentClick(ev){
  const sectionBtn=ev.target.closest('[data-admin-section]');
  if(sectionBtn){setActiveSection(sectionBtn.dataset.adminSection);return;}
  const bellydanceTabBtn=ev.target.closest('[data-bellydance-tab]');
  if(bellydanceTabBtn){setActiveBellydanceTab(bellydanceTabBtn.dataset.bellydanceTab);return;}
  const eventItem=ev.target.closest('.event-list-item');
  if(eventItem){loadEventDetail(eventItem.dataset.eventId);return;}
  const editClientBtn=ev.target.closest('.btn-edit-client');
  if(editClientBtn){const client=clients.find((item)=>String(item.id)===String(editClientBtn.closest('tr')?.dataset.id));if(client) openEditClientModal(client);return;}
  const deleteClientBtn=ev.target.closest('.btn-delete-client');
  if(deleteClientBtn){const client=clients.find((item)=>String(item.id)===String(deleteClientBtn.closest('tr')?.dataset.id));if(client) confirmDeleteClient(client);return;}
  const editDirectoryEventBtn=ev.target.closest('.btn-edit-directory-event');
  if(editDirectoryEventBtn){openEditDirectoryEventModal(editDirectoryEventBtn.closest('tr')?.dataset.id,editDirectoryEventBtn);return;}
  const deleteDirectoryEventBtn=ev.target.closest('.btn-delete-directory-event');
  if(deleteDirectoryEventBtn){
    const directoryEvent=directoryEvents.find((item)=>String(item.id)===String(deleteDirectoryEventBtn.closest('tr')?.dataset.id));
    if(directoryEvent) confirmDeleteDirectoryEvent(directoryEvent);
    return;
  }
  const createDirectoryCatalogBtn=ev.target.closest('.btn-create-directory-catalog');
  if(createDirectoryCatalogBtn){openCreateDirectoryCatalogModal(createDirectoryCatalogBtn.dataset.resource);return;}
  const editDirectoryCatalogBtn=ev.target.closest('.btn-edit-directory-catalog');
  if(editDirectoryCatalogBtn){openEditDirectoryCatalogModal(editDirectoryCatalogBtn.dataset.resource,editDirectoryCatalogBtn.closest('tr')?.dataset.id,editDirectoryCatalogBtn);return;}
  const deleteDirectoryCatalogBtn=ev.target.closest('.btn-delete-directory-catalog');
  if(deleteDirectoryCatalogBtn){
    const resource=deleteDirectoryCatalogBtn.dataset.resource;
    const records=resource==='masters'?directoryMasters:directoryStyles;
    const record=records.find((item)=>String(item.id)===String(deleteDirectoryCatalogBtn.closest('tr')?.dataset.id));
    if(record) confirmDeleteDirectoryCatalog(resource,record);
  }
}

function setActiveSection(section){
  document.querySelectorAll('[data-admin-panel]').forEach((panel)=>panel.classList.toggle('d-none',panel.dataset.adminPanel!==section));
  document.querySelectorAll('[data-admin-section]').forEach((btn)=>{
    const isActive=btn.dataset.adminSection===section;
    btn.classList.toggle('active',isActive);
    btn.setAttribute('aria-selected',isActive?'true':'false');
  });
  if(section==='bellydance'&&!directoryEventsLoaded) loadDirectoryEvents();
}

function setActiveBellydanceTab(tab){
  document.querySelectorAll('[data-bellydance-panel]').forEach((panel)=>panel.classList.toggle('d-none',panel.dataset.bellydancePanel!==tab));
  document.querySelectorAll('[data-bellydance-tab]').forEach((btn)=>{
    const isActive=btn.dataset.bellydanceTab===tab;
    btn.classList.toggle('active',isActive);
    btn.setAttribute('aria-selected',isActive?'true':'false');
  });
  if(tab==='events'&&!directoryEventsLoaded) loadDirectoryEvents();
  if(tab==='catalogs'&&!directoryCatalogsLoaded) loadDirectoryCatalogs();
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
  setEventCategories(eventObj.category??eventObj.categories);
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
  ['visible','trial','visible_judges','visible_participants','visible_schedule','visible_results','visible_statistics','has_clubs','hide_school_info','has_penalties','has_registrations','has_audience_voting','judges_vis_results','judges_can_change_votes','has_masters','show_flags','hide_judges','notice_active','registration_finance','registration_not_new_school','registration_not_new_group','show_gender'].forEach((id)=>{document.getElementById(id).checked=Number(eventObj[id])===1;});
  document.getElementById('registration_start').value=eventObj.registration_start?String(eventObj.registration_start).slice(0,10):'';
  document.getElementById('registration_end').value=eventObj.registration_end?String(eventObj.registration_end).slice(0,10):'';
  document.getElementById('music_extra_time').value=eventObj.music_extra_time??0;
  document.getElementById('registration_fee_cost').value=formatCentsToCurrencyValue(eventObj.registration_fee_cost);
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
  setEventCategories([]);
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
  const categoryValue=formatEventCategoriesValue(getEventCategories());
  return {
    code:document.getElementById('code').value.trim(),
    name:document.getElementById('name').value.trim(),
    language:document.getElementById('language').value,
    status:document.getElementById('status').value,
    start:document.getElementById('start').value||null,
    end:document.getElementById('end').value||null,
    password:parseInt(document.getElementById('password').value,10)||0,
    eventurl:document.getElementById('eventurl').value.trim()||null,
    eventlogo:document.getElementById('eventlogo').value.trim()||null,
    client_id:parseInt(document.getElementById('clientSelect').value,10)||null,
    visible:document.getElementById('visible').checked?1:0,
    trial:document.getElementById('trial').checked?1:0,
    min_styles:parseInt(document.getElementById('min_styles').value,10)||null,
    category:categoryValue,
    category_class_type:document.getElementById('category_class_type').value||'NO',
    criteria_config:document.getElementById('criteria_config').value||'NO_CONFIG',
    total_system:document.getElementById('total_system').value||'SUM_SCORES',
    visible_judges:document.getElementById('visible_judges').checked?1:0,
    visible_participants:document.getElementById('visible_participants').checked?1:0,
    visible_schedule:document.getElementById('visible_schedule').checked?1:0,
    visible_results:document.getElementById('visible_results').checked?1:0,
    visible_statistics:document.getElementById('visible_statistics').checked?1:0,
    has_clubs:document.getElementById('has_clubs').checked?1:0,
    hide_school_info:document.getElementById('hide_school_info').checked?1:0,
    criteria_per_judge:parseInt(document.getElementById('criteria_per_judge').value,10)||0,
    has_penalties:document.getElementById('has_penalties').checked?1:0,
    has_registrations:document.getElementById('has_registrations').checked?1:0,
    has_audience_voting:document.getElementById('has_audience_voting').checked?1:0,
    tied_positions:normalizeTiedPositionsValue(document.getElementById('tied_positions').value),
    judge_feedback:document.getElementById('judge_feedback').value,
    judges_vis_results:document.getElementById('judges_vis_results').checked?1:0,
    judges_can_change_votes:document.getElementById('judges_can_change_votes').checked?1:0,
    has_masters:document.getElementById('has_masters').checked?1:0,
    registration_start:document.getElementById('registration_start').value||null,
    registration_end:document.getElementById('registration_end').value||null,
    music_extra_time:parseInt(document.getElementById('music_extra_time').value,10)||0,
    registration_fee_cost:parseCurrencyValueToCents(document.getElementById('registration_fee_cost').value),
    registration_finance:document.getElementById('registration_finance').checked?1:0,
    registration_not_new_school:document.getElementById('registration_not_new_school').checked?1:0,
    registration_not_new_group:document.getElementById('registration_not_new_group').checked?1:0,
    show_gender:document.getElementById('show_gender').checked?1:0,
    notice_text:document.getElementById('notice_text').value.trim(),
    notice_active:document.getElementById('notice_active').checked?1:0,
    notice_type:document.getElementById('notice_type').value,
    score_type:document.getElementById('score_type').value,
    can_decide_positions:parseInt(document.getElementById('can_decide_positions').value,10)||0,
    restrict_voting:parseInt(document.getElementById('restrict_voting').value,10)||0,
    results_filter:document.getElementById('results_filter').value||'BY_CAT',
    show_flags:document.getElementById('show_flags').checked?1:0,
    send_stats_code:normalizeSendStatsCodeValue(document.getElementById('send_stats_code').value),
    hide_judges:document.getElementById('hide_judges').checked?1:0
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

async function getDirectoryResponseError(response,fallbackMessage){
  const errorData=await response.json().catch(()=>null);
  return errorData?.error||errorData?.message||fallbackMessage;
}

async function loadDirectoryCatalogs(){
  const results=await Promise.all([
    loadDirectoryCatalog('masters'),
    loadDirectoryCatalog('styles')
  ]);
  directoryCatalogsLoaded=results.every(Boolean);
}

async function loadDirectoryCatalog(resource){
  const config=directoryCatalogConfig[resource];
  if(!config) return false;
  const loadingState=document.getElementById(config.loadingId);
  const emptyState=document.getElementById(config.emptyId);
  loadingState?.classList.remove('d-none');
  emptyState?.classList.add('d-none');
  try{
    const response=await fetch(`${API_BASE_URL}/api/directory/${resource}`);
    if(!response.ok) throw new Error(await getDirectoryResponseError(response,`Error al cargar ${config.plural.toLocaleLowerCase()}`));
    const payload=await response.json();
    const records=Array.isArray(payload)?payload:(Array.isArray(payload?.[resource])?payload[resource]:[]);
    if(resource==='masters'){
      directoryMasters=records;
      directoryMastersLoaded=true;
      refreshDirectoryMasterOptions();
    }else{
      directoryStyles=records;
      directoryStylesLoaded=true;
      refreshDirectoryDanceStyleOptions();
    }
    renderDirectoryCatalog(resource);
    return true;
  }catch(error){
    if(resource==='masters') directoryMastersLoaded=false;
    if(resource==='styles') directoryStylesLoaded=false;
    console.error(`Error cargando ${resource}:`,error);
    showMessageModal(error.message||`Error al cargar ${config.plural.toLocaleLowerCase()}`,'Error');
    return false;
  }finally{
    loadingState?.classList.add('d-none');
  }
}

function renderDirectoryCatalog(resource){
  const config=directoryCatalogConfig[resource];
  if(!config) return;
  const records=resource==='masters'?directoryMasters:directoryStyles;
  const tableBody=document.getElementById(config.tableId);
  const emptyState=document.getElementById(config.emptyId);
  const count=document.getElementById(config.countId);
  if(!tableBody||!emptyState||!count) return;
  tableBody.replaceChildren();
  count.textContent=String(records.length);
  emptyState.classList.toggle('d-none',records.length>0);

  const fragment=document.createDocumentFragment();
  records.forEach((record)=>{
    const row=document.createElement('tr');
    row.dataset.id=record.id;
    const values=config.hasNationality?[record.name,record.nationality]:[record.name];
    values.forEach((value)=>{
      const cell=document.createElement('td');
      cell.textContent=value===null||value===undefined?'':String(value);
      row.appendChild(cell);
    });
    const actionsCell=document.createElement('td');
    actionsCell.className='text-center';
    actionsCell.innerHTML=`
      <div class="btn-group" role="group" aria-label="Acciones">
        <button type="button" class="btn btn-outline-primary btn-sm btn-edit-directory-catalog" data-resource="${resource}" title="Editar" aria-label="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm btn-delete-directory-catalog" data-resource="${resource}" title="Eliminar" aria-label="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </div>`;
    row.appendChild(actionsCell);
    fragment.appendChild(row);
  });
  tableBody.appendChild(fragment);
}

function configureDirectoryCatalogModal(resource,action,record={}){
  const config=directoryCatalogConfig[resource];
  const form=document.getElementById('directoryCatalogForm');
  if(!config||!form) return false;
  form.reset();
  form.dataset.resource=resource;
  form.dataset.action=action;
  if(action==='edit') form.dataset.id=String(record.id);
  else form.removeAttribute('data-id');

  const nameInput=document.getElementById('directoryCatalogName');
  const nationalityInput=document.getElementById('directoryCatalogNationality');
  const nationalityGroup=document.getElementById('directoryCatalogNationalityGroup');
  nameInput.maxLength=config.nameMaxLength;
  nameInput.value=record.name??'';
  nationalityInput.value=record.nationality??'';
  nationalityInput.required=config.hasNationality;
  nationalityInput.disabled=!config.hasNationality;
  nationalityGroup.classList.toggle('d-none',!config.hasNationality);

  const isCreate=action==='create';
  document.getElementById('directoryCatalogModalTitle').textContent=`${isCreate?'Crear':'Editar'} ${config.singular}`;
  document.getElementById('saveDirectoryCatalogBtn').textContent=isCreate?'Crear':'Guardar cambios';
  return true;
}

function openCreateDirectoryCatalogModal(resource){
  if(!configureDirectoryCatalogModal(resource,'create')) return;
  directoryCatalogModal.show();
}

async function openEditDirectoryCatalogModal(resource,id,triggerButton){
  const config=directoryCatalogConfig[resource];
  if(!config||!id) return;
  setLoadingButtonState(triggerButton,true,'');
  try{
    const response=await fetch(`${API_BASE_URL}/api/directory/${resource}/${encodeURIComponent(id)}`);
    if(!response.ok) throw new Error(await getDirectoryResponseError(response,`Error al cargar el ${config.singular}`));
    const payload=await response.json();
    const record=Array.isArray(payload)?payload[0]:payload;
    if(!record) throw new Error(`No se ha encontrado el ${config.singular}`);
    if(!configureDirectoryCatalogModal(resource,'edit',record)) return;
    directoryCatalogModal.show();
  }catch(error){
    console.error(`Error cargando ${resource}:`,error);
    showMessageModal(error.message||`Error al cargar el ${config.singular}`,'Error');
  }finally{
    setLoadingButtonState(triggerButton,false);
  }
}

async function saveDirectoryCatalog(){
  const form=document.getElementById('directoryCatalogForm');
  const resource=form?.dataset.resource;
  const config=directoryCatalogConfig[resource];
  if(!form||!config||!form.reportValidity()) return;
  const action=form.dataset.action;
  const id=form.dataset.id;
  const payload={name:form.elements.namedItem('name').value.trim()};
  if(config.hasNationality) payload.nationality=form.elements.namedItem('nationality').value.trim().toUpperCase();
  const saveButton=document.getElementById('saveDirectoryCatalogBtn');
  setLoadingButtonState(saveButton,true,action==='create'?'Creando...':'Guardando...');
  try{
    const url=action==='create'
      ?`${API_BASE_URL}/api/directory/${resource}`
      :`${API_BASE_URL}/api/directory/${resource}/${encodeURIComponent(id)}`;
    const response=await fetch(url,{
      method:action==='create'?'POST':'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!response.ok) throw new Error(await getDirectoryResponseError(response,`Error al guardar el ${config.singular}`));
    directoryCatalogModal.hide();
    const loaded=await loadDirectoryCatalog(resource);
    if(!loaded) directoryCatalogsLoaded=false;
    showToast(`${config.singular.charAt(0).toUpperCase()+config.singular.slice(1)} ${action==='create'?'creado':'actualizado'} correctamente`);
  }catch(error){
    console.error(`Error guardando ${resource}:`,error);
    showMessageModal(error.message||`Error al guardar el ${config.singular}`,'Error');
  }finally{
    setLoadingButtonState(saveButton,false);
  }
}

function confirmDeleteDirectoryCatalog(resource,record){
  const config=directoryCatalogConfig[resource];
  if(!config) return;
  const modalElement=document.getElementById('deleteModal');
  const deleteModal=bootstrap.Modal.getOrCreateInstance(modalElement);
  const title=modalElement.querySelector('.modal-title');
  if(title) title.textContent='Confirmar eliminación';
  const cancelButton=modalElement.querySelector('[data-bs-dismiss="modal"]:not(.btn-close)');
  if(cancelButton) cancelButton.textContent='Cancelar';
  document.getElementById('deleteModalMessage').replaceChildren(
    document.createTextNode(`¿Estás seguro de que quieres eliminar el ${config.singular} `),
    Object.assign(document.createElement('strong'),{textContent:String(record.name||'')}),
    document.createTextNode('?')
  );
  const confirmButton=document.getElementById('confirmDeleteBtn');
  confirmButton.textContent='Eliminar';
  confirmButton.onclick=async()=>{
    setLoadingButtonState(confirmButton,true,'Eliminando...');
    try{
      const response=await fetch(`${API_BASE_URL}/api/directory/${resource}/${encodeURIComponent(record.id)}`,{method:'DELETE'});
      if(!response.ok) throw new Error(await getDirectoryResponseError(response,`Error al eliminar el ${config.singular}`));
      deleteModal.hide();
      const loaded=await loadDirectoryCatalog(resource);
      if(!loaded) directoryCatalogsLoaded=false;
      showToast(`${config.singular.charAt(0).toUpperCase()+config.singular.slice(1)} eliminado correctamente`);
    }catch(error){
      console.error(`Error eliminando ${resource}:`,error);
      showMessageModal(error.message||`Error al eliminar el ${config.singular}`,'Error');
    }finally{
      setLoadingButtonState(confirmButton,false);
    }
  };
  deleteModal.show();
}

async function loadDirectoryEvents(){
  const loadingState=document.getElementById('directoryEventsLoadingState');
  const emptyState=document.getElementById('directoryEventsEmptyState');
  loadingState?.classList.remove('d-none');
  emptyState?.classList.add('d-none');
  try{
    const response=await fetch(`${API_BASE_URL}/api/directory/events`);
    if(!response.ok) throw new Error(await getDirectoryResponseError(response,'Error al cargar los eventos de Bellydance'));
    const data=await response.json();
    directoryEvents=Array.isArray(data)?data:[];
    directoryEventsLoaded=true;
    populateDirectoryEventFilters();
    renderDirectoryEvents();
  }catch(error){
    directoryEventsLoaded=false;
    console.error('Error cargando eventos de Bellydance:',error);
    showMessageModal(error.message||'Error al cargar los eventos de Bellydance','Error');
  }finally{
    loadingState?.classList.add('d-none');
  }
}

function populateDirectoryEventFilters(){
  populateDirectoryEventFilter('directoryCountryFilter',directoryEvents.map((event)=>event.country_code));
  populateDirectoryEventFilter('directoryStatusFilter',directoryEvents.map((event)=>event.status),(value)=>getDirectoryEventValueLabel('status',value));
  populateDirectoryEventFilter('directoryUpdateStatusFilter',directoryEvents.map((event)=>event.update_status),(value)=>getDirectoryEventValueLabel('update_status',value));
  populateDirectoryEventFilter('directoryPublishedFilter',directoryEvents.map((event)=>event.is_published),(value)=>getDirectoryEventValueLabel('is_published',value,true));
  populateDirectoryEventFilter('directoryContactStatusFilter',directoryEvents.map((event)=>event.contact_status),(value)=>getDirectoryEventValueLabel('contact_status',value));
}

function populateDirectoryEventFilter(id,values,getLabel=(value)=>value){
  const select=document.getElementById(id);
  if(!select) return;
  const selectedValue=select.value;
  const uniqueValues=[...new Set(values
    .filter((value)=>value!==null&&value!==undefined&&value!=='')
    .map((value)=>String(value))
  )].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  select.replaceChildren(new Option('Todos',''));
  uniqueValues.forEach((value)=>select.appendChild(new Option(getLabel(value),value)));
  select.value=uniqueValues.includes(selectedValue)?selectedValue:'';
}

function getDirectoryEventValueLabel(field,value,useFilterLabel=false){
  const normalizedValue=value===null||value===undefined?'':String(value);
  const config=directoryEventValueConfig[field]?.[normalizedValue];
  return useFilterLabel&&config?.filterLabel?config.filterLabel:config?.label||normalizedValue;
}

function appendDirectoryEventBadgeCell(row,field,value){
  const normalizedValue=value===null||value===undefined?'':String(value);
  const config=directoryEventValueConfig[field]?.[normalizedValue];
  const cell=document.createElement('td');
  const badge=document.createElement('span');
  badge.className=`badge ${config?.badgeClass||'text-bg-secondary'}`;
  badge.textContent=config?.label||normalizedValue;
  cell.appendChild(badge);
  row.appendChild(cell);
}

function getFilteredDirectoryEvents(){
  const name=(document.getElementById('directoryNameFilter')?.value||'').trim().toLocaleLowerCase();
  const country=document.getElementById('directoryCountryFilter')?.value||'';
  const dateFrom=document.getElementById('directoryDateFromFilter')?.value||'';
  const dateTo=document.getElementById('directoryDateToFilter')?.value||'';
  const status=document.getElementById('directoryStatusFilter')?.value||'';
  const updateStatus=document.getElementById('directoryUpdateStatusFilter')?.value||'';
  const published=document.getElementById('directoryPublishedFilter')?.value||'';
  const contactStatus=document.getElementById('directoryContactStatusFilter')?.value||'';

  return directoryEvents.filter((event)=>{
    const startDate=formatDirectoryDate(event.start_date);
    const endDate=formatDirectoryDate(event.end_date);
    return (!name||String(event.name||'').toLocaleLowerCase().includes(name))
      &&(!country||String(event.country_code??'')===country)
      &&(!dateFrom||endDate>=dateFrom)
      &&(!dateTo||startDate<=dateTo)
      &&(!status||String(event.status??'')===status)
      &&(!updateStatus||String(event.update_status??'')===updateStatus)
      &&(!published||String(event.is_published??'')===published)
      &&(!contactStatus||String(event.contact_status??'')===contactStatus);
  });
}

function renderDirectoryEvents(){
  const tableBody=document.getElementById('directoryEventsTable');
  const emptyState=document.getElementById('directoryEventsEmptyState');
  if(!tableBody||!emptyState) return;
  const filteredEvents=getFilteredDirectoryEvents();
  tableBody.replaceChildren();
  document.getElementById('count-directory-events').textContent=String(filteredEvents.length);
  emptyState.classList.toggle('d-none',filteredEvents.length>0);

  const fragment=document.createDocumentFragment();
  filteredEvents.forEach((event)=>{
    const row=document.createElement('tr');
    row.dataset.id=event.id;
    [
      event.name,
      formatDirectoryDate(event.start_date),
      formatDirectoryDate(event.end_date),
      event.country_code
    ].forEach((value)=>{
      const cell=document.createElement('td');
      cell.textContent=value===null||value===undefined?'':String(value);
      row.appendChild(cell);
    });
    const hasPoster=typeof event.poster_url==='string'&&event.poster_url.trim()!=='';
    const posterCell=document.createElement('td');
    posterCell.className='text-center';
    posterCell.innerHTML=hasPoster
      ? '<i class="bi bi-check-circle-fill text-success" role="img" aria-label="Poster informado" title="Poster informado"></i>'
      : '<i class="bi bi-x-circle text-secondary" role="img" aria-label="Poster no informado" title="Poster no informado"></i>';
    row.appendChild(posterCell);
    appendDirectoryEventBadgeCell(row,'status',event.status);
    appendDirectoryEventBadgeCell(row,'update_status',event.update_status);
    appendDirectoryEventBadgeCell(row,'is_published',event.is_published);
    appendDirectoryEventBadgeCell(row,'contact_status',event.contact_status);
    const viewsCell=document.createElement('td');
    viewsCell.textContent=event.views_count===null||event.views_count===undefined?'':String(event.views_count);
    row.appendChild(viewsCell);
    const updatedAtCell=document.createElement('td');
    updatedAtCell.textContent=formatDirectoryDateTime(event.updated_at);
    row.appendChild(updatedAtCell);
    const actionsCell=document.createElement('td');
    actionsCell.className='text-center';
    actionsCell.innerHTML=`
      <div class="btn-group" role="group" aria-label="Acciones">
        <button type="button" class="btn btn-outline-primary btn-sm btn-edit-directory-event" title="Editar" aria-label="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm btn-delete-directory-event" title="Eliminar" aria-label="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </div>`;
    row.appendChild(actionsCell);
    fragment.appendChild(row);
  });
  tableBody.appendChild(fragment);
}

function clearDirectoryEventFilters(){
  [
    'directoryNameFilter',
    'directoryCountryFilter',
    'directoryDateFromFilter',
    'directoryDateToFilter',
    'directoryStatusFilter',
    'directoryUpdateStatusFilter',
    'directoryPublishedFilter',
    'directoryContactStatusFilter'
  ].forEach((id)=>{
    const field=document.getElementById(id);
    if(field) field.value='';
  });
  renderDirectoryEvents();
}

function formatDirectoryDate(value){
  if(value===null||value===undefined||value==='') return '';
  const normalized=String(value);
  const match=normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?match[1]:normalized;
}

function formatDirectoryDateTimeInput(value){
  if(value===null||value===undefined||value==='') return '';
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime())) return String(value).replace(' ','T').slice(0,16);
  const pad=(part)=>String(part).padStart(2,'0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth()+1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function formatDirectoryDateTime(value){
  if(value===null||value===undefined||value==='') return '';
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'});
}

function initDirectoryEventTypeSelect(){
  const field=document.getElementById('directoryEventEventType');
  if(!field) return;
  if(field.tomselect) return;
  if(typeof TomSelect!=='function') return;
  new TomSelect(field,{
    plugins:['remove_button'],
    create:false,
    closeAfterSelect:false,
    placeholder:'Selecciona uno o varios tipos',
    onItemAdd(){field.tomselect?.setTextboxValue('');}
  });
}

function initDirectoryDanceStyleSelect(){
  const field=document.getElementById('directoryEventDanceStyles');
  if(!field||field.tomselect||typeof TomSelect!=='function') return;
  new TomSelect(field,{
    plugins:['remove_button'],
    create:false,
    closeAfterSelect:false,
    placeholder:'Selecciona uno o varios estilos',
    onItemAdd(){field.tomselect?.setTextboxValue('');}
  });
}

function parseDirectoryCsvValues(value){
  return [...new Set(String(value??'')
    .split(',')
    .map((item)=>item.trim())
    .filter(Boolean)
  )];
}

function getDirectoryDanceStyleCatalogNames(){
  return [...new Set(directoryStyles
    .map((style)=>String(style?.name??'').trim())
    .filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
}

function replaceDirectoryDanceStyleOptions(field){
  const options=getDirectoryDanceStyleCatalogNames();
  if(field.tomselect){
    field.tomselect.clear(true);
    field.tomselect.clearOptions();
    field.tomselect.addOptions(options.map((value)=>({value,text:value})));
    field.tomselect.refreshOptions(false);
    return;
  }
  field.replaceChildren(...options.map((value)=>new Option(value,value)));
}

function setDirectoryDanceStyleValues(field,value){
  if(!field) return;
  const selectedValues=parseDirectoryCsvValues(value);
  const catalogValues=new Set(getDirectoryDanceStyleCatalogNames());
  const legacyValues=selectedValues.filter((item)=>!catalogValues.has(item));
  if(field.tomselect){
    legacyValues.forEach((legacyValue)=>field.tomselect.addOption({
      value:legacyValue,
      text:`${legacyValue} (sin catalogar)`
    }));
    field.tomselect.setValue(selectedValues,true);
    return;
  }
  legacyValues.forEach((legacyValue)=>field.appendChild(new Option(`${legacyValue} (sin catalogar)`,legacyValue)));
  [...field.options].forEach((option)=>{option.selected=selectedValues.includes(option.value);});
}

function getDirectoryDanceStyleValue(form){
  const field=form.elements.namedItem('dance_styles');
  if(!field) return null;
  const selectedValues=[...field.selectedOptions].map((option)=>option.value);
  return selectedValues.length?selectedValues.join(','):null;
}

function refreshDirectoryDanceStyleOptions(){
  const field=document.getElementById('directoryEventDanceStyles');
  if(!field) return;
  const currentValue=getDirectoryDanceStyleValue(document.getElementById('directoryEventForm'));
  replaceDirectoryDanceStyleOptions(field);
  setDirectoryDanceStyleValues(field,currentValue);
}

async function ensureDirectoryStylesLoaded(){
  if(directoryStylesLoaded) return true;
  return loadDirectoryCatalog('styles');
}

function initDirectoryMasterSelect(){
  const field=document.getElementById('directoryEventMasterCatalog');
  if(!field||field.tomselect) return;
  if(typeof TomSelect!=='function'){
    field.addEventListener('change',()=>{
      appendDirectoryMasterValue(field.value);
      field.value='';
    });
    return;
  }
  new TomSelect(field,{
    create:false,
    maxItems:1,
    closeAfterSelect:true,
    placeholder:'Selecciona para añadir',
    onChange(value){
      if(!value) return;
      appendDirectoryMasterValue(value);
      this.clear(true);
    }
  });
}

function getDirectoryMasterCatalogValues(){
  return [...new Set(directoryMasters
    .map((master)=>{
      const name=String(master?.name??'').trim();
      const nationality=String(master?.nationality??'').trim();
      return name&&nationality?`${name} (${nationality})`:'';
    })
    .filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
}

function replaceDirectoryMasterOptions(field){
  if(!field) return;
  const options=getDirectoryMasterCatalogValues();
  if(field.tomselect){
    field.tomselect.clear(true);
    field.tomselect.clearOptions();
    field.tomselect.addOptions(options.map((value)=>({value,text:value})));
    field.tomselect.refreshOptions(false);
    return;
  }
  field.replaceChildren(new Option('Selecciona para añadir',''),...options.map((value)=>new Option(value,value)));
}

function appendDirectoryMasterValue(value){
  const field=document.getElementById('directoryEventMasters');
  const normalizedValue=String(value??'').trim();
  if(!field||!normalizedValue) return;
  const currentValues=parseDirectoryCsvValues(field.value);
  if(!currentValues.includes(normalizedValue)) currentValues.push(normalizedValue);
  const nextValue=currentValues.join(',');
  if(field.maxLength>0&&nextValue.length>field.maxLength){
    showToast('No se puede añadir: el campo de maestros ha alcanzado su longitud máxima.');
    return;
  }
  field.value=nextValue;
  field.dispatchEvent(new Event('input',{bubbles:true}));
}

function getDirectoryMasterValue(form){
  const field=form.elements.namedItem('masters');
  if(!field) return null;
  const values=parseDirectoryCsvValues(field.value);
  return values.length?values.join(','):null;
}

function renderDirectoryMasterValueStatus(){
  const field=document.getElementById('directoryEventMasters');
  const status=document.getElementById('directoryEventMasterStatus');
  if(!field||!status) return;
  const catalogValues=new Set(getDirectoryMasterCatalogValues());
  const fragment=document.createDocumentFragment();
  parseDirectoryCsvValues(field.value).forEach((value)=>{
    const isCatalogued=catalogValues.has(value);
    const badge=document.createElement('span');
    badge.className=`badge ${isCatalogued?'text-bg-success':'text-bg-warning'}`;
    badge.textContent=isCatalogued?value:`${value} (sin catalogar)`;
    fragment.appendChild(badge);
  });
  status.replaceChildren(fragment);
}

function refreshDirectoryMasterOptions(){
  replaceDirectoryMasterOptions(document.getElementById('directoryEventMasterCatalog'));
  renderDirectoryMasterValueStatus();
}

async function ensureDirectoryMastersLoaded(){
  if(directoryMastersLoaded) return true;
  return loadDirectoryCatalog('masters');
}

function setDirectoryEventTypeValues(field,value){
  const selectedValues=String(value??'')
    .split(',')
    .map((item)=>item.trim())
    .filter((item)=>directoryEventTypeOptions.includes(item));
  if(field.tomselect) field.tomselect.setValue(selectedValues,true);
  else [...field.options].forEach((option)=>{option.selected=selectedValues.includes(option.value);});
}

function getDirectoryEventTypeValue(form){
  const field=form.elements.namedItem('event_type');
  if(!field) return null;
  const selectedValues=[...field.selectedOptions].map((option)=>option.value);
  return selectedValues.length?selectedValues.join(','):null;
}

function setDirectoryEventFormValue(form,name,value){
  const field=form.elements.namedItem(name);
  if(!field) return;
  if(name==='event_type'&&field.multiple){
    setDirectoryEventTypeValues(field,value);
    return;
  }
  if(name==='dance_styles'&&field.multiple){
    setDirectoryDanceStyleValues(field,value);
    return;
  }
  let normalizedValue;
  if(['start_date','end_date'].includes(name)) normalizedValue=formatDirectoryDate(value);
  else if(['contacted_us_at','outreach_sent_at','outreach_response_at','last_checked_at'].includes(name)) normalizedValue=formatDirectoryDateTimeInput(value);
  else normalizedValue=value===null||value===undefined?'':String(value);
  if(field.tagName==='SELECT'&&normalizedValue&&![...field.options].some((option)=>option.value===normalizedValue)){
    field.appendChild(new Option(normalizedValue,normalizedValue));
  }
  field.value=normalizedValue;
  if(name==='masters') renderDirectoryMasterValueStatus();
}

async function openCreateDirectoryEventModal(){
  const [stylesLoaded,mastersLoaded]=await Promise.all([
    ensureDirectoryStylesLoaded(),
    ensureDirectoryMastersLoaded()
  ]);
  if(!stylesLoaded||!mastersLoaded) return;
  const form=document.getElementById('directoryEventForm');
  populateDirectoryEventValueFields();
  form.reset();
  setDirectoryEventTypeValues(form.elements.namedItem('event_type'),'');
  replaceDirectoryDanceStyleOptions(form.elements.namedItem('dance_styles'));
  replaceDirectoryMasterOptions(document.getElementById('directoryEventMasterCatalog'));
  setDirectoryEventFormValue(form,'masters','');
  form.dataset.action='create';
  form.removeAttribute('data-id');
  const defaultStyle=getDirectoryDanceStyleCatalogNames().includes('BELLYDANCE')?'BELLYDANCE':'';
  setDirectoryEventFormValue(form,'dance_styles',defaultStyle);
  setDirectoryEventFormValue(form,'status','ACT');
  setDirectoryEventFormValue(form,'update_status','OK');
  setDirectoryEventFormValue(form,'is_published',0);
  setDirectoryEventFormValue(form,'contact_status','NON');
  validateDirectoryEventDates();
  document.getElementById('directoryEventModalTitle').textContent='Crear evento Bellydance';
  document.getElementById('saveDirectoryEventBtn').textContent='Crear evento';
  directoryEventModal.show();
}

async function openEditDirectoryEventModal(id,triggerButton){
  if(!id) return;
  setLoadingButtonState(triggerButton,true,'');
  try{
    const [response,stylesLoaded,mastersLoaded]=await Promise.all([
      fetch(`${API_BASE_URL}/api/directory/events/${encodeURIComponent(id)}`),
      ensureDirectoryStylesLoaded(),
      ensureDirectoryMastersLoaded()
    ]);
    if(!stylesLoaded||!mastersLoaded) return;
    if(!response.ok) throw new Error(await getDirectoryResponseError(response,'Error al cargar el evento'));
    const event=await response.json();
    const form=document.getElementById('directoryEventForm');
    populateDirectoryEventValueFields();
    form.reset();
    setDirectoryEventTypeValues(form.elements.namedItem('event_type'),'');
    replaceDirectoryDanceStyleOptions(form.elements.namedItem('dance_styles'));
    replaceDirectoryMasterOptions(document.getElementById('directoryEventMasterCatalog'));
    form.dataset.action='edit';
    form.dataset.id=String(event.id);
    [
      'id',
      'created_at',
      'updated_at',
      'name',
      'description',
      'start_date',
      'end_date',
      'city',
      'country_code',
      'venue',
      'organizer_name',
      'organizer_instagram',
      'website_url',
      'registration_url',
      'instagram_url',
      'facebook_url',
      'tiktok_url',
      'youtube_url',
      'contact_email',
      'poster_url',
      'event_type',
      'dance_styles',
      'masters',
      'status',
      'update_status',
      'is_published',
      'contact_status',
      'contacted_us_at',
      'outreach_sent_at',
      'outreach_response_at',
      'contact_source',
      'internal_notes',
      'last_checked_at'
    ].forEach((field)=>setDirectoryEventFormValue(form,field,event[field]));
    validateDirectoryEventDates();
    document.getElementById('directoryEventModalTitle').textContent='Editar evento Bellydance';
    document.getElementById('saveDirectoryEventBtn').textContent='Guardar cambios';
    directoryEventModal.show();
  }catch(error){
    console.error('Error cargando el evento de Bellydance:',error);
    showMessageModal(error.message||'Error al cargar el evento','Error');
  }finally{
    setLoadingButtonState(triggerButton,false);
  }
}

function validateDirectoryEventDates(){
  const startDate=document.getElementById('directoryEventStartDate');
  const endDate=document.getElementById('directoryEventEndDate');
  if(!startDate||!endDate) return true;
  const invalid=Boolean(startDate.value&&endDate.value&&endDate.value<startDate.value);
  endDate.setCustomValidity(invalid?'La fecha de fin no puede ser anterior a la fecha de inicio.':'');
  return !invalid;
}

function getOptionalDirectoryEventValue(form,name){
  const value=String(form.elements.namedItem(name)?.value||'').trim();
  return value||null;
}

function getDirectoryEventDateTimeValue(form,name){
  const value=form.elements.namedItem(name)?.value||'';
  if(!value) return null;
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime())?value:parsed.toISOString();
}

function collectDirectoryEventFormData(){
  const form=document.getElementById('directoryEventForm');
  return {
    name:form.elements.namedItem('name').value.trim(),
    description:getOptionalDirectoryEventValue(form,'description'),
    start_date:form.elements.namedItem('start_date').value,
    end_date:form.elements.namedItem('end_date').value,
    city:getOptionalDirectoryEventValue(form,'city'),
    country_code:getOptionalDirectoryEventValue(form,'country_code')?.toUpperCase()||null,
    venue:getOptionalDirectoryEventValue(form,'venue'),
    organizer_name:getOptionalDirectoryEventValue(form,'organizer_name'),
    organizer_instagram:getOptionalDirectoryEventValue(form,'organizer_instagram'),
    website_url:getOptionalDirectoryEventValue(form,'website_url'),
    registration_url:getOptionalDirectoryEventValue(form,'registration_url'),
    instagram_url:getOptionalDirectoryEventValue(form,'instagram_url'),
    facebook_url:getOptionalDirectoryEventValue(form,'facebook_url'),
    tiktok_url:getOptionalDirectoryEventValue(form,'tiktok_url'),
    youtube_url:getOptionalDirectoryEventValue(form,'youtube_url'),
    contact_email:getOptionalDirectoryEventValue(form,'contact_email'),
    poster_url:getOptionalDirectoryEventValue(form,'poster_url'),
    event_type:getDirectoryEventTypeValue(form),
    dance_styles:getDirectoryDanceStyleValue(form),
    masters:getDirectoryMasterValue(form),
    status:form.elements.namedItem('status').value.trim(),
    update_status:form.elements.namedItem('update_status').value.trim(),
    is_published:Number(form.elements.namedItem('is_published').value),
    contact_status:form.elements.namedItem('contact_status').value.trim(),
    contacted_us_at:getDirectoryEventDateTimeValue(form,'contacted_us_at'),
    outreach_sent_at:getDirectoryEventDateTimeValue(form,'outreach_sent_at'),
    outreach_response_at:getDirectoryEventDateTimeValue(form,'outreach_response_at'),
    contact_source:getOptionalDirectoryEventValue(form,'contact_source'),
    internal_notes:getOptionalDirectoryEventValue(form,'internal_notes'),
    last_checked_at:getDirectoryEventDateTimeValue(form,'last_checked_at')
  };
}

async function saveDirectoryEvent(){
  const form=document.getElementById('directoryEventForm');
  validateDirectoryEventDates();
  if(!form.reportValidity()) return;
  const action=form.dataset.action;
  const id=form.dataset.id;
  const saveButton=document.getElementById('saveDirectoryEventBtn');
  setLoadingButtonState(saveButton,true,action==='create'?'Creando...':'Guardando...');
  try{
    const url=action==='create'
      ?`${API_BASE_URL}/api/directory/events`
      :`${API_BASE_URL}/api/directory/events/${encodeURIComponent(id)}`;
    const response=await fetch(url,{
      method:action==='create'?'POST':'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(collectDirectoryEventFormData())
    });
    if(!response.ok) throw new Error(await getDirectoryResponseError(response,'Error al guardar el evento'));
    directoryEventModal.hide();
    directoryEventsLoaded=false;
    await loadDirectoryEvents();
    showToast(action==='create'?'Evento creado correctamente':'Evento actualizado correctamente');
  }catch(error){
    console.error('Error guardando el evento de Bellydance:',error);
    showMessageModal(error.message||'Error al guardar el evento','Error');
  }finally{
    setLoadingButtonState(saveButton,false);
  }
}

function confirmDeleteDirectoryEvent(event){
  const modalElement=document.getElementById('deleteModal');
  const deleteModal=bootstrap.Modal.getOrCreateInstance(modalElement);
  const message=document.getElementById('deleteModalMessage');
  message.replaceChildren(
    document.createTextNode('¿Estás seguro de que quieres eliminar el evento '),
    Object.assign(document.createElement('strong'),{textContent:String(event.name||'')}),
    document.createTextNode('?')
  );
  const confirmButton=document.getElementById('confirmDeleteBtn');
  confirmButton.onclick=async()=>{
    setLoadingButtonState(confirmButton,true,'Eliminando...');
    try{
      const response=await fetch(`${API_BASE_URL}/api/directory/events/${encodeURIComponent(event.id)}`,{method:'DELETE'});
      if(!response.ok) throw new Error(await getDirectoryResponseError(response,'Error al eliminar el evento'));
      deleteModal.hide();
      directoryEventsLoaded=false;
      await loadDirectoryEvents();
      showToast('Evento eliminado correctamente');
    }catch(error){
      console.error('Error eliminando el evento de Bellydance:',error);
      showMessageModal(error.message||'Error al eliminar el evento','Error');
    }finally{
      setLoadingButtonState(confirmButton,false);
    }
  };
  deleteModal.show();
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


