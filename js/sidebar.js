const ORGANIZATION_SIDEBAR_COPY = {
  en: {
    section: 'Organization Access',
    subtitle: 'Private zone',
    menuButton: 'Open menu',
    closeButton: 'Close',
    dashboard: 'Dashboard',
    general: 'General Configuration',
    masterdata: 'Master Data',
    judges: 'Judges',
    participants: 'Participants',
    competitions: 'Competitions',
    tracking: 'Tracking'
  },
  es: {
    section: 'Acceso Organizadores',
    subtitle: 'Zona privada',
    menuButton: 'Abrir menu',
    closeButton: 'Cerrar',
    dashboard: 'Dashboard',
    general: 'Configuracion General',
    masterdata: 'Datos Maestros',
    judges: 'Jueces',
    participants: 'Participantes',
    competitions: 'Competiciones',
    tracking: 'Tracking'
  },
  it: {
    section: 'Accesso Organizzazione',
    subtitle: 'Area privata',
    menuButton: 'Apri menu',
    closeButton: 'Chiudi',
    dashboard: 'Dashboard',
    general: 'Configurazione Generale',
    masterdata: 'Dati Principali',
    judges: 'Giudici',
    participants: 'Partecipanti',
    competitions: 'Competizioni',
    tracking: 'Tracking'
  },
  pt: {
    section: 'Acesso Organizacao',
    subtitle: 'Zona privada',
    menuButton: 'Abrir menu',
    closeButton: 'Fechar',
    dashboard: 'Dashboard',
    general: 'Configuracao Geral',
    masterdata: 'Dados Mestres',
    judges: 'Jurados',
    participants: 'Participantes',
    competitions: 'Competicoes',
    tracking: 'Tracking'
  },
  fr: {
    section: 'Acces Organisation',
    subtitle: 'Zone privee',
    menuButton: 'Ouvrir le menu',
    closeButton: 'Fermer',
    dashboard: 'Dashboard',
    general: 'Configuration Generale',
    masterdata: 'Donnees Maitres',
    judges: 'Juges',
    participants: 'Participants',
    competitions: 'Competitions',
    tracking: 'Tracking'
  }
};

const ORGANIZATION_SIDEBAR_ITEMS = [
  { key: 'dashboard', href: 'dashboard.html', icon: 'bi-speedometer2', labelKey: 'dashboard' },
  { key: 'general', href: 'adminevent.html', icon: 'bi-sliders2', labelKey: 'general' },
  { key: 'masterdata', href: 'masterdata.html', icon: 'bi-diagram-3', labelKey: 'masterdata' },
  { key: 'judges', href: 'judges.html', icon: 'bi-person-badge', labelKey: 'judges' },
  { key: 'participants', href: 'dancers.html', icon: 'bi-people', labelKey: 'participants' },
  { key: 'competitions', href: 'competitions.html', icon: 'bi-trophy', labelKey: 'competitions' },
  { key: 'tracking', href: 'tracking.html', icon: 'bi-activity', labelKey: 'tracking' }
];

function getOrganizationSidebarLanguage() {
  const rawLang = document.documentElement.getAttribute('lang') || localStorage.getItem('lang') || 'en';
  const shortLang = String(rawLang).trim().slice(0, 2).toLowerCase();
  return ORGANIZATION_SIDEBAR_COPY[shortLang] ? shortLang : 'en';
}

function getOrganizationSidebarCopy() {
  return ORGANIZATION_SIDEBAR_COPY[getOrganizationSidebarLanguage()] || ORGANIZATION_SIDEBAR_COPY.en;
}

function buildOrganizationSidebarHref(path) {
  if (!eventId) return path;
  return `${path}?eventId=${encodeURIComponent(eventId)}`;
}

function getOrganizationSidebarActiveKey() {
  const pageToKey = {
    configevent: 'dashboard',
    dashboard: 'dashboard',
    adminevent: 'general',
    masterdata: 'masterdata',
    judges: 'judges',
    dancers: 'participants',
    competitions: 'competitions',
    tracking: 'tracking'
  };

  return pageToKey[pageName] || '';
}

function getOrganizationSidebarTitle() {
  const currentEvent = typeof getEvent === 'function' ? getEvent() : null;
  if (currentEvent && currentEvent.name) {
    return currentEvent.name;
  }
  return getOrganizationSidebarCopy().section;
}

function buildOrganizationSidebarItemsMarkup(copy, activeKey, options = {}) {
  const itemClassName = options.itemClassName || 'list-group-item list-group-item-action d-flex align-items-center gap-3 px-3 py-3';

  return ORGANIZATION_SIDEBAR_ITEMS.map((item) => {
    const isActive = item.key === activeKey;
    const activeClasses = isActive ? ' active' : '';
    const activeAttributes = isActive ? ' aria-current="page"' : '';

    return `
      <a href="${buildOrganizationSidebarHref(item.href)}" class="${itemClassName}${activeClasses}"${activeAttributes}>
        <i class="bi ${item.icon}"></i>
        <span>${copy[item.labelKey]}</span>
      </a>
    `;
  }).join('');
}

function buildOrganizationSidebarDesktopMarkup(copy, activeKey) {
  return `
    <div class="sticky-lg-top">
      <div class="card border-0 shadow-sm">
        <div class="card-body border-bottom">
          <div class="small text-uppercase text-body-secondary fw-semibold mb-2">${copy.subtitle}</div>
          <div class="h5 mb-1" id="organizationSidebarTitleDesktop">${getOrganizationSidebarTitle()}</div>
          <div class="small text-body-secondary">${copy.section}</div>
        </div>
        <div class="list-group list-group-flush">
          ${buildOrganizationSidebarItemsMarkup(copy, activeKey, {
            itemClassName: 'list-group-item list-group-item-action d-flex align-items-center gap-3 px-3 py-3 border-0 border-bottom'
          })}
        </div>
      </div>
    </div>
  `;
}

function buildOrganizationSidebarMobileMarkup(copy, activeKey) {
  return `
    <button class="btn btn-outline-dark d-inline-flex align-items-center gap-2" type="button" data-bs-toggle="offcanvas" data-bs-target="#organizationSidebarOffcanvas" aria-controls="organizationSidebarOffcanvas">
      <i class="bi bi-list"></i>
      <span>${copy.menuButton}</span>
    </button>
    <div class="offcanvas offcanvas-start" tabindex="-1" id="organizationSidebarOffcanvas" aria-labelledby="organizationSidebarTitleMobile">
      <div class="offcanvas-header border-bottom">
        <div>
          <div class="h5 mb-1" id="organizationSidebarTitleMobile">${getOrganizationSidebarTitle()}</div>
          <div class="small text-body-secondary">${copy.section}</div>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="${copy.closeButton}"></button>
      </div>
      <div class="offcanvas-body p-0">
        <div class="list-group list-group-flush">
          ${buildOrganizationSidebarItemsMarkup(copy, activeKey)}
        </div>
      </div>
    </div>
  `;
}

function updateOrganizationSidebarTitles() {
  const sidebarTitle = getOrganizationSidebarTitle();
  const desktopTitle = document.getElementById('organizationSidebarTitleDesktop');
  const mobileTitle = document.getElementById('organizationSidebarTitleMobile');

  if (desktopTitle) {
    desktopTitle.textContent = sidebarTitle;
  }

  if (mobileTitle) {
    mobileTitle.textContent = sidebarTitle;
  }
}

function renderOrganizationSidebar() {
  const desktopMount = document.getElementById('organizationSidebarMount');
  const mobileMount = document.getElementById('organizationSidebarToggle');

  if (!desktopMount && !mobileMount) {
    return;
  }

  const copy = getOrganizationSidebarCopy();
  const activeKey = getOrganizationSidebarActiveKey();

  if (desktopMount) {
    desktopMount.innerHTML = buildOrganizationSidebarDesktopMarkup(copy, activeKey);
  }

  if (mobileMount) {
    mobileMount.innerHTML = buildOrganizationSidebarMobileMarkup(copy, activeKey);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderOrganizationSidebar();

  if (typeof WaitEventLoaded === 'function') {
    WaitEventLoaded()
      .then(() => updateOrganizationSidebarTitles())
      .catch(() => {
        // Keep the generic sidebar title when the event cannot be loaded.
      });
  }
});

window.renderOrganizationSidebar = renderOrganizationSidebar;
