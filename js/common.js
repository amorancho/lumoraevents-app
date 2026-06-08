const pageName = window.location.pathname.split("/").pop().split(".")[0] || "index";
const supportedAppLanguages = new Set(['es', 'en', 'it', 'pt', 'fr']);
let translations = {};

function getCurrentAppLanguage() {
  const rawLang = String(
    localStorage.getItem('lang') ||
    document.documentElement.getAttribute('lang') ||
    'en'
  ).toLowerCase();

  return supportedAppLanguages.has(rawLang) ? rawLang : 'en';
}

const initialLang = getCurrentAppLanguage();

updateFlag(initialLang);

const eventId = getEventIdFromUrl();

const originalFetch = window.fetch;

window.fetch = function (url, options = {}) {
  const lang = localStorage.getItem('lang') || 'es';

  // obtenemos el role del usuario
  const user = getUserFromToken();
  const role = user ? user.role : 'guest';

  options = options || {};
  options.headers = {
    ...options.headers,
    'Accept-Language': lang,
    'X-User-Role': role
  };
  return originalFetch(url, options);
};

const translationsReady = loadTranslations(initialLang, pageName);
window.translationsReady = translationsReady;

async function ensureTranslationsReady() {
  if (window.translationsReady) {
    await window.translationsReady;
  }
}

let eventObj = null;
let eventReadyPromise = null;

const modalHtml = `
<div class="modal fade" id="messageModal" tabindex="-1" aria-labelledby="messageModalLabel" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <!--div class="modal-header">
        <h5 class="modal-title" id="messageModalLabel">Mensaje</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
      </div-->
      <div class="modal-header bg-danger text-white">
        <h5 class="modal-title" id="messageModalLabel">Error</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body" id="messageModalBody">
        <!-- Aquí va el mensaje -->
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Aceptar</button>
      </div>
    </div>
  </div>
</div>
`;

function getEventIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  for (const [key, value] of urlParams.entries()) {
    if (key.toLowerCase() === 'eventid') {
      return value;
    }
  }


  if (pageName !== 'index' && pageName !== 'admin') {
    window.location.href = 'index.html';
  }
  return null;
}

function getEvent() {
  return eventObj;
}

const TIED_POSITIONS_NONE = 'NO';
const TIED_POSITIONS_COMPETITION = 'CR';
const TIED_POSITIONS_DENSE = 'DR';
const TIED_POSITIONS_MODES = new Set([
  TIED_POSITIONS_NONE,
  TIED_POSITIONS_COMPETITION,
  TIED_POSITIONS_DENSE
]);

function normalizeTiedPositionsMode(value) {
  if (value === true || value === 1 || value === '1') return TIED_POSITIONS_COMPETITION;
  if (value === false || value === 0 || value === '0' || value == null || value === '') return TIED_POSITIONS_NONE;
  const normalized = String(value).trim().toUpperCase();
  return TIED_POSITIONS_MODES.has(normalized) ? normalized : TIED_POSITIONS_NONE;
}

function getEventTiedPositionsMode(event = getEvent()) {
  return normalizeTiedPositionsMode(
    event?.TiedPositions ?? event?.tiedPositions ?? event?.hasTiedPositions
  );
}

function getDisplayPositionsByScore(items = [], getScoreKey = () => '') {
  const tiedPositionsMode = getEventTiedPositionsMode();
  let previousScoreKey = null;
  let previousPosition = 0;

  return items.map((item, index) => {
    const scoreKey = getScoreKey(item, index);
    const isTied = index > 0 && scoreKey === previousScoreKey;

    if (tiedPositionsMode !== TIED_POSITIONS_NONE && isTied) {
      return previousPosition;
    }

    const position = tiedPositionsMode === TIED_POSITIONS_DENSE
      ? previousPosition + 1
      : index + 1;

    previousScoreKey = scoreKey;
    previousPosition = position;
    return position;
  });
}

function setPageTitleAndLang(title, lang) {
  updateElementProperty('screen-title', 'textContent', title);
  updateFlag(lang);
}

// Creamos la promesa que se resolverá cuando los datos del evento estén listos
eventReadyPromise = new Promise(async (resolve, reject) => {
  try {

    if (eventId) {
      const res = await fetch(`${API_BASE_URL}/api/events/code/${eventId}`);
      if (!res.ok) throw new Error(`Error ${res.status} al recuperar el evento`);
      const data = await res.json();

      const today = new Date();
      today.setHours(0, 0, 0, 0); // eliminamos horas para comparar solo la fecha

      const start = new Date(data.start);
      start.setHours(0, 0, 0, 0);

      const end = new Date(data.end);
      end.setHours(0, 0, 0, 0);

      let status;

      if (data.status === 'FIN') {
        status = 'finished';
      } else if (start > today) {
        status = 'upcoming';
      } else if (start <= today && end >= today) {
        status = 'ongoing';
      } else {
        status = 'pending close';
      }

      const tiedPositions = normalizeTiedPositionsMode(
        data.tied_positions ?? data.TiedPositions ?? data.has_tied_positions
      );

      eventObj = {
        id: data.id,
        code: eventId,
        name: data.name,
        start: data.start,
        end: data.end,
        eventLogo: data.eventlogo,
        eventUrl: data.eventurl,
        visible: data.visible === 1,
        trial: data.trial === 1,
        status: status,
        homeUrl: `home.html?eventId=${eventId}`,
        language: data.language,
        autoRefreshMin: data.autorefresh_minutes ?? null,
        catClassification: data.category_class_type,
        visibleJudges: data.visible_judges,
        visibleParticipants: data.visible_participants,
        visibleSchedule: data.visible_schedule,
        visibleResults: data.visible_results,
        visibleStatistics: data.visible_statistics,
        has_penalties: data.has_penalties === 1,
        notice_text: data.notice_text,
        notice_active: data.notice_active === 1,
        notice_type: data.notice_type,
        score_type: data.score_type,
        hasRegistration: data.has_registrations === 1,
        registrationStart: data.registration_start,
        registrationEnd: data.registration_end,
        criteriaConfig: data.criteria_config,
        totalSystem: data.total_system,
        canDecidePositions: data.can_decide_positions === 1,
        showFlags: data.show_flags === 1,
        hideJudges: data.hide_judges === 1,
        hasClubs: data.has_clubs === 1,
        criteriaPerJudge: data.criteria_per_judge === 1,
        JudgeFeedback: data.judge_feedback,
        judgesVisResults: data.judges_vis_results === 1,
        resultsFilter: data.results_filter,
        TiedPositions: tiedPositions,
        musicExtraTime: data.music_extra_time || 0,
        hideSchoolInfo: data.hide_school_info === 1,
        hasMasters: data.has_masters === 1,
        judgesCanChangeVotes: data.judges_can_change_votes === 1
      };

    }
    resolve(eventObj);
  } catch (err) {
    console.error('Error cargando datos del evento:', err);
    reject(err);
  }
});

// Ejecutar al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {

  const user = getUserFromToken();

  if (eventId && user && user.eventId !== eventId && user.role !== 'admin') {
    console.warn('El usuario no tiene permiso para este evento. Redirigiendo a la página principal.');
    alert('No tienes permiso para acceder a este evento');
    window.location.href = 'index.html';
    return;
  }

  // Cargar el modal de mensajes
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.documentElement.setAttribute('lang', getCurrentAppLanguage());

  await ensureTranslationsReady();
  applyTranslations();

  // Esperamos a que los datos del evento estén listos
  try {
    await eventReadyPromise;
    if (pageName !== 'index' && pageName !== 'admin') {
      generateHeader(() => {
        setPageTitleAndLang(t('title'), getCurrentAppLanguage());
        applyTranslations();
      });
      generateFooter();
    }
  } catch (err) {
    console.warn("No se pudieron cargar datos del evento, cabecera no generada");
  }

});

async function loadTranslations(lang, page) {
  try {

    const res = await fetch(`/lang/${page}.${lang}.json`);
    translations = await res.json();

  } catch (error) {
    console.error(`Error cargando traducciones para ${page}.${lang}:`, error);
  }
}

function t(key, fallback) {
  if (translations && Object.prototype.hasOwnProperty.call(translations, key)) {
    const value = translations[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return key;
}

window.t = t;

function applyTranslatedTitle(el, text) {
  if (!text) return;

  const usesBootstrapTooltip = el.getAttribute('data-bs-toggle') === 'tooltip';
  if (!usesBootstrapTooltip) {
    el.title = text;
    return;
  }

  el.setAttribute('data-bs-original-title', text);
  el.removeAttribute('title');

  const tooltipInstance = window.bootstrap?.Tooltip?.getInstance(el);
  if (tooltipInstance) {
    tooltipInstance.setContent({ '.tooltip-inner': text });
    tooltipInstance.update();
  }
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) {
      el.textContent = translations[key];
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[key]) el.placeholder = translations[key];
  });

  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.dataset.i18nTitle;
    if (translations[key]) applyTranslatedTitle(el, translations[key]);
  });
}

async function changeLanguage(lang, page = null) {
  localStorage.setItem('lang', lang);
  document.documentElement.setAttribute('lang', lang);
  updateFlag(lang);
  //const currentPage = page || window.location.pathname.split("/").pop().split(".")[0] || "index";
  window.translationsReady = loadTranslations(lang, pageName);
  await window.translationsReady;
  applyTranslations();

  //updateElementProperty('screen-title', 'textContent', title);

  // Carga de elementos dinámicos por página
  if (pageName === 'results') {
    if (window.resultsData) renderResults(window.resultsData);
    loadCategories();
  } else if (pageName === 'participants') {
    renderData(window.participantsData);
  } else if (pageName === 'schedule') {
    renderSchedule(window.scheData);
  } else if (pageName === 'scheduleconfig') {
    if (window.renderScheduleConfig) {
      window.renderScheduleConfig();
    }
  } else if (pageName === 'voting') {
    loadCompetitionAndDancers();
  } else if (pageName === 'dashboard') {
    if (window.renderDashboardOverview) {
      await window.renderDashboardOverview();
    }
  }

  if (window.renderOrganizationSidebar) {
    window.renderOrganizationSidebar();
  }
}

function updateFlag(lang) {
  const flagMap = {
    es: 'https://flagcdn.com/24x18/es.png',
    en: 'https://flagcdn.com/24x18/gb.png',
    it: 'https://flagcdn.com/24x18/it.png',
    pt: 'https://flagcdn.com/24x18/pt.png',
    fr: 'https://flagcdn.com/24x18/fr.png'
  };
  const flag = document.getElementById('current-flag');
  if (flag) {
    flag.src = flagMap[lang] || flagMap.es;
    if (lang === 'es') {
      flag.alt = 'Espa�ol';
    } else if (lang === 'en') {
      flag.alt = 'English';
    } else if (lang === 'it') {
      flag.alt = 'Italiano';
    } else if (lang === 'pt') {
      flag.alt = 'Portugu�s';
    } else if (lang === 'fr') {
      flag.alt = 'Fran�ais';
    } else {
      flag.alt = lang;
    }
  }
}

const DEFAULT_DANCER_FLAG_SIZE = 24;
const DEFAULT_DANCER_FLAG_CODE = 'XX';
const GENERIC_DANCER_FLAG_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect x='0' y='4' width='24' height='16' rx='2' fill='#e9ecef'/><path d='M0 4h24v5.333H0z' fill='#adb5bd'/><path d='M0 14.667h24V20H0z' fill='#adb5bd'/><circle cx='12' cy='12' r='3.2' fill='#6c757d'/><path d='M12 9.8l.62 1.27 1.4.2-1.01.98.24 1.38L12 12.97l-1.25.66.24-1.38-1.01-.98 1.4-.2z' fill='#f8f9fa'/></svg>";
const GENERIC_DANCER_FLAG_URL = `data:image/svg+xml;utf8,${encodeURIComponent(GENERIC_DANCER_FLAG_SVG)}`;

function shouldShowDancerFlags() {
  const event = getEvent();
  if (!event || event.showFlags === undefined || event.showFlags === null) {
    return true;
  }
  return Boolean(event.showFlags);
}

function normalizeDancerNationalityCode(nationality) {
  return String(nationality || '').trim().toUpperCase();
}

function hasValidNationalityCode(nationality) {
  const normalizedCode = normalizeDancerNationalityCode(nationality);
  return /^[A-Z]{2}$/.test(normalizedCode) && normalizedCode !== DEFAULT_DANCER_FLAG_CODE;
}

function sanitizeFlagSize(rawSize) {
  const parsed = Number(rawSize);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DANCER_FLAG_SIZE;
  }
  return Math.round(parsed);
}

function escapeAttributeValue(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getDancerFlagUrl(nationality, size = DEFAULT_DANCER_FLAG_SIZE) {
  if (!hasValidNationalityCode(nationality)) {
    return GENERIC_DANCER_FLAG_URL;
  }

  const safeCode = normalizeDancerNationalityCode(nationality);
  const safeSize = sanitizeFlagSize(size);
  return `https://flagsapi.com/${safeCode}/shiny/${safeSize}.png`;
}

function getDancerFlagImgHtml(nationality, options = {}) {
  if (!shouldShowDancerFlags()) {
    return '';
  }

  const safeSize = sanitizeFlagSize(options.size);
  const safeWidth = sanitizeFlagSize(options.width || safeSize);
  const safeHeight = sanitizeFlagSize(options.height || safeSize);
  const safeClassName = options.className ? escapeAttributeValue(options.className) : '';
  const safeStyle = options.style ? escapeAttributeValue(options.style) : '';
  const safeNationality = normalizeDancerNationalityCode(nationality);
  const altValue = options.alt || (hasValidNationalityCode(safeNationality) ? safeNationality : 'N/A');
  const safeAlt = escapeAttributeValue(
    altValue
  );

  return `<img src="${getDancerFlagUrl(nationality, safeSize)}"${safeClassName ? ` class="${safeClassName}"` : ''}${safeStyle ? ` style="${safeStyle}"` : ''} width="${safeWidth}" height="${safeHeight}" alt="${safeAlt}">`;
}

function ensureToastContainer() {
  let container = document.getElementById('commonToastContainer');
  if (container) {
    return container;
  }

  container = document.createElement('div');
  container.id = 'commonToastContainer';
  container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
  container.style.zIndex = '1080';
  document.body.appendChild(container);
  return container;
}

function shouldUseLightToastCloseButton(type) {
  return ['success', 'danger', 'primary', 'secondary', 'dark'].includes(type);
}

function showToastNotice(message, type = 'success', options = {}) {
  if (!message || !document.body) return;

  const container = ensureToastContainer();
  const toastEl = document.createElement('div');
  const toastClassMap = {
    success: 'text-bg-success',
    danger: 'text-bg-danger',
    warning: 'text-bg-warning',
    info: 'text-bg-info',
    primary: 'text-bg-primary',
    secondary: 'text-bg-secondary',
    dark: 'text-bg-dark'
  };

  toastEl.className = `toast align-items-center border-0 ${toastClassMap[type] || toastClassMap.success}`;
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  toastEl.setAttribute('aria-atomic', 'true');

  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex';

  const body = document.createElement('div');
  body.className = 'toast-body';
  body.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = `btn-close me-2 m-auto${shouldUseLightToastCloseButton(type) ? ' btn-close-white' : ''}`;
  closeBtn.setAttribute('data-bs-dismiss', 'toast');
  closeBtn.setAttribute('aria-label', t('close', 'Close'));

  wrapper.appendChild(body);
  wrapper.appendChild(closeBtn);
  toastEl.appendChild(wrapper);
  container.appendChild(toastEl);

  if (window.bootstrap?.Toast) {
    const toast = new bootstrap.Toast(toastEl, { delay: options.delay ?? 3000 });
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove(), { once: true });
    toast.show();
    return;
  }

  toastEl.classList.add('show');
  window.setTimeout(() => {
    toastEl.remove();
  }, options.delay ?? 3000);
}

function resolveDomElement(elementOrSelector) {
  if (!elementOrSelector) return null;
  if (elementOrSelector instanceof Element) return elementOrSelector;
  if (typeof elementOrSelector === 'string') {
    return document.querySelector(elementOrSelector);
  }
  return null;
}

function resolveTableElement(tableOrSelector) {
  const element = resolveDomElement(tableOrSelector);
  if (!element) return null;
  if (element instanceof HTMLTableElement) return element;
  if (element instanceof HTMLElement) return element.closest('table');
  return null;
}

function isTableExportHidden(element) {
  if (!element) return true;
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return true;
  if (element.classList?.contains('d-none')) return true;

  const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
  if (!style) return false;
  return style.display === 'none' || style.visibility === 'hidden';
}

function normalizeTableExportText(value) {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTableCellExportText(cell) {
  if (!cell) return '';

  const explicitValue = cell.getAttribute('data-tsv-value');
  if (explicitValue !== null) {
    return normalizeTableExportText(explicitValue);
  }

  const field = cell.querySelector('input, textarea, select');
  if (field) {
    if (field.tagName === 'SELECT') {
      const selectedOption = field.options?.[field.selectedIndex];
      return normalizeTableExportText(selectedOption?.textContent || field.value || '');
    }
    return normalizeTableExportText(field.value || field.textContent || '');
  }

  return normalizeTableExportText(cell.innerText || cell.textContent || '');
}

function getIgnoredTableColumnIndexes(table, options = {}) {
  const indexes = new Set(
    Array.isArray(options.excludeColumnIndexes) ? options.excludeColumnIndexes : []
  );
  const headerRow = table.tHead?.rows?.[0] || table.querySelector('thead tr');
  const ignoreSelector = options.ignoreSelector ?? '[data-tsv-ignore="true"]';

  if (!headerRow) {
    return indexes;
  }

  Array.from(headerRow.cells).forEach((cell, index) => {
    if (ignoreSelector && cell.matches(ignoreSelector)) {
      indexes.add(index);
      return;
    }

    if (options.skipHiddenColumns !== false && isTableExportHidden(cell)) {
      indexes.add(index);
    }
  });

  return indexes;
}

function extractTableRowValues(row, ignoredColumnIndexes, options = {}) {
  return Array.from(row?.cells || [])
    .filter((cell, index) => {
      if (ignoredColumnIndexes.has(index)) return false;
      if (options.skipHiddenColumns !== false && isTableExportHidden(cell)) return false;
      if (options.ignoreSelector && cell.matches(options.ignoreSelector)) return false;
      return true;
    })
    .map(cell => getTableCellExportText(cell));
}

function tableToTsv(tableOrSelector, options = {}) {
  const table = resolveTableElement(tableOrSelector);
  if (!table) {
    return '';
  }

  const ignoredColumnIndexes = getIgnoredTableColumnIndexes(table, options);
  const lines = [];
  const includeHeaders = options.includeHeaders !== false;
  const ignoreEmptyRows = options.ignoreEmptyRows !== false;
  const onlyVisibleRows = options.onlyVisibleRows !== false;

  if (includeHeaders) {
    const headerRow = table.tHead?.rows?.[0] || table.querySelector('thead tr');
    const headerValues = extractTableRowValues(headerRow, ignoredColumnIndexes, options);
    if (headerValues.length && (!ignoreEmptyRows || headerValues.some(value => value !== ''))) {
      lines.push(headerValues);
    }
  }

  const bodyRows = Array.from(table.tBodies).flatMap(section => Array.from(section.rows));
  const rows = bodyRows.length
    ? bodyRows
    : Array.from(table.querySelectorAll('tr')).filter(row => !row.closest('thead'));

  rows.forEach(row => {
    if (onlyVisibleRows && isTableExportHidden(row)) {
      return;
    }

    const values = extractTableRowValues(row, ignoredColumnIndexes, options);
    if (!values.length) {
      return;
    }
    if (ignoreEmptyRows && !values.some(value => value !== '')) {
      return;
    }
    lines.push(values);
  });

  return lines.map(values => values.join('\t')).join('\n');
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('Clipboard copy command failed.');
    }
  } finally {
    textarea.remove();
  }
}

async function copyTableToClipboardAsTsv(tableOrSelector, options = {}) {
  const table = resolveTableElement(tableOrSelector);
  if (!table) {
    const error = new Error(options.tableNotFoundMessage || 'Table not found.');
    if (options.showNotice !== false) {
      showToastNotice(
        options.errorMessage || t('clipboard_copy_error', 'Could not copy the data to the clipboard.'),
        options.errorType || 'danger',
        options.toastOptions
      );
    }
    throw error;
  }

  const dataOnlyTsv = tableToTsv(table, { ...options, includeHeaders: false });
  if (!dataOnlyTsv) {
    if (options.showNotice !== false) {
      showToastNotice(
        options.emptyMessage || t('clipboard_copy_empty', 'There is no data to copy.'),
        options.emptyType || 'warning',
        options.toastOptions
      );
    }
    return { ok: false, tsv: '' };
  }

  const tsv = tableToTsv(table, options);

  try {
    await copyTextToClipboard(tsv);
  } catch (error) {
    if (options.showNotice !== false) {
      showToastNotice(
        options.errorMessage || t('clipboard_copy_error', 'Could not copy the data to the clipboard.'),
        options.errorType || 'danger',
        options.toastOptions
      );
    }
    throw error;
  }

  if (options.showNotice !== false) {
    showToastNotice(
      options.successMessage || t('clipboard_copy_success', 'Data copied to the clipboard.'),
      options.successType || 'success',
      options.toastOptions
    );
  }

  return { ok: true, tsv };
}

function bindTableTsvExportButton(buttonOrSelector, tableOrSelector, options = {}) {
  const button = resolveDomElement(buttonOrSelector);
  if (!button) {
    return null;
  }

  const onError = typeof options.onError === 'function' ? options.onError : null;
  const exportOptions = { ...options };
  delete exportOptions.onError;

  const handleClick = async () => {
    try {
      await copyTableToClipboardAsTsv(tableOrSelector, exportOptions);
    } catch (error) {
      if (onError) {
        onError(error);
        return;
      }
      console.error('Error exporting table as TSV:', error);
    }
  };

  button.addEventListener('click', handleClick);
  return handleClick;
}

function showMessageModal(message, title = "Mensaje", variant = 'danger') {
  const modalEl = document.getElementById('messageModal');
  const headerEl = modalEl?.querySelector('.modal-header');
  const closeBtn = headerEl?.querySelector('.btn-close');

  if (headerEl) {
    headerEl.classList.remove('bg-danger', 'bg-success', 'bg-primary', 'bg-warning', 'text-white', 'text-dark');
    if (closeBtn) {
      closeBtn.classList.remove('btn-close-white');
    }

    const resolvedVariant = variant;

    if (resolvedVariant === 'success') {
      headerEl.classList.add('bg-success', 'text-white');
      if (closeBtn) closeBtn.classList.add('btn-close-white');
    } else if (resolvedVariant === 'warning') {
      headerEl.classList.add('bg-warning', 'text-dark');
    } else if (resolvedVariant === 'danger') {
      headerEl.classList.add('bg-danger', 'text-white');
      if (closeBtn) closeBtn.classList.add('btn-close-white');
    } else {
      headerEl.classList.add('bg-primary', 'text-white');
      if (closeBtn) closeBtn.classList.add('btn-close-white');
    }
  }

  document.getElementById('messageModalLabel').textContent = title;
  document.getElementById('messageModalBody').textContent = message;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

async function WaitEventLoaded() {
  try {
    await eventReadyPromise;
  } catch (error) {
    console.error('Evento no encontrado:', error);

    // Mostrar mensaje
    const body = document.body;
    body.innerHTML = `<div style="text-align:center; margin-top:50px;">
                          <h2>No se ha encontrado el evento</h2>
                          <p>Redirigiendo a la página principal...</p>
                      </div>`;

    // Redirigir después de 2 segundos
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);
  }
}

// 5. Hacer la función global para usarla desde cualquier script inline o externo
window.showMessageModal = showMessageModal;
window.showToastNotice = showToastNotice;
window.shouldShowDancerFlags = shouldShowDancerFlags;
window.getDancerFlagUrl = getDancerFlagUrl;
window.getDancerFlagImgHtml = getDancerFlagImgHtml;
window.tableToTsv = tableToTsv;
window.copyTableToClipboardAsTsv = copyTableToClipboardAsTsv;
window.bindTableTsvExportButton = bindTableTsvExportButton;



