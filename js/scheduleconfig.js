const allowedRoles = ["admin", "organizer"];

const pastelColors = [
  { value: "#F9C5D1", key: "color_rose", fallback: "Rose" },
  { value: "#FAD9C1", key: "color_peach", fallback: "Peach" },
  { value: "#FFF3B0", key: "color_butter", fallback: "Butter" },
  { value: "#CDEAC0", key: "color_mint", fallback: "Mint" },
  { value: "#BEE3F8", key: "color_sky", fallback: "Sky" },
  { value: "#D7C6FF", key: "color_lavender", fallback: "Lavender" }
];

let scheduleBlocks = [];
let competitions = [];
let selectedBlockId = null;
let detailSortable = null;
let confirmDeleteCallback = null;
let activeDetailId = null;
let activeCompetitionId = null;
let competitionModal = null;
let breakModal = null;
let confirmDeleteModal = null;
let previewScheduleModal = null;
let unsavedChangesModal = null;
let beforeUnloadHandlerBound = false;
let allowNavigateWithoutPrompt = false;

window.renderScheduleConfig = renderScheduleConfig;

document.addEventListener('DOMContentLoaded', async () => {
  validateRoles(allowedRoles);
  await WaitEventLoaded();

  competitionModal = new bootstrap.Modal(document.getElementById('competitionModal'));
  breakModal = new bootstrap.Modal(document.getElementById('breakModal'));
  confirmDeleteModal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
  previewScheduleModal = new bootstrap.Modal(document.getElementById('previewScheduleModal'));
  unsavedChangesModal = new bootstrap.Modal(document.getElementById('unsavedChangesModal'));

  initColorSelect();
  bindScheduleConfigEvents();
  bindBeforeUnloadWarning();

  await Promise.all([loadCompetitions(), loadScheduleBlocks()]);
  if (!selectedBlockId && scheduleBlocks.length > 0) {
    selectedBlockId = scheduleBlocks[0].id;
    await ensureBlockDetailsLoaded();
  }
  renderScheduleConfig();
});

function bindScheduleConfigEvents() {
  const blockSelect = document.getElementById('blockSelect');
  const blockStart = document.getElementById('blockStart');
  const blockColor = document.getElementById('blockColor');

  blockSelect.addEventListener('change', async (e) => {
    selectedBlockId = e.target.value || null;
    await ensureBlockDetailsLoaded();
    renderScheduleConfig();
  });

  blockStart.addEventListener('input', () => {
    const block = getSelectedBlock();
    if (!block) return;
    block.start = blockStart.value;
    renderDetails();
    updateSelectedBlockMeta();
    markBlockDirty(block);
  });

  blockColor.addEventListener('change', () => {
    updateColorPreview();
    const block = getSelectedBlock();
    if (!block) return;
    block.color = blockColor.value;
    renderDetails();
    updateSelectedBlockMeta();
    markBlockDirty(block);
  });

  document.getElementById('addBlockBtn').addEventListener('click', createScheduleBlock);
  document.getElementById('updateBlockBtn').addEventListener('click', saveSelectedBlock);
  document.getElementById('deleteBlockBtn').addEventListener('click', () => {
    if (!getSelectedBlock()) return;
    confirmDelete(t('confirm_delete_block'), async () => {
      await deleteSelectedBlock();
    });
  });

  document.getElementById('competitionsList').addEventListener('click', (event) => {
    const button = event.target.closest('.btn-add-competition');
    if (!button) return;

    if (!getSelectedBlock()) {
      showMessageModal(t('no_block_selected'), t('error'));
      return;
    }

    activeCompetitionId = button.dataset.id;
    activeDetailId = null;

    document.getElementById('competitionModalTitle').textContent = t('competition_modal_title_add');
    document.getElementById('timePerDancerInput').value = '';
    document.getElementById('timeBeforeStartInput').value = '';

    const competitionModalEl = document.getElementById('competitionModal');
    competitionModalEl.addEventListener('shown.bs.modal', () => {
      document.getElementById('timePerDancerInput').focus();
    }, { once: true });
    competitionModal.show();
  });

  document.getElementById('addBreakBtn').addEventListener('click', () => {
    if (!getSelectedBlock()) {
      showMessageModal(t('no_block_selected'), t('error'));
      return;
    }

    activeDetailId = null;
    document.getElementById('breakModalTitle').textContent = t('break_modal_title_add');
    document.getElementById('breakNameInput').value = '';
    document.getElementById('breakTimeInput').value = '';
    const breakModalEl = document.getElementById('breakModal');
    breakModalEl.addEventListener('shown.bs.modal', () => {
      document.getElementById('breakNameInput').focus();
    }, { once: true });
    breakModal.show();
  });

  document.getElementById('saveCompetitionDetailBtn').addEventListener('click', saveCompetitionDetailFromModal);
  document.getElementById('saveBreakDetailBtn').addEventListener('click', saveBreakDetailFromModal);
  document.getElementById('previewScheduleBtn').addEventListener('click', openPreviewSchedule);
  document.getElementById('backToCompetitionsBtn').addEventListener('click', handleBackToCompetitions);
  document.getElementById('confirmLeaveBtn').addEventListener('click', () => {
    if (unsavedChangesModal) unsavedChangesModal.hide();
    navigateToCompetitions();
  });

  document.getElementById('detailsList').addEventListener('click', (event) => {
    const editButton = event.target.closest('.btn-edit-detail');
    const deleteButton = event.target.closest('.btn-delete-detail');
    if (!editButton && !deleteButton) return;

    const item = event.target.closest('li');
    const detailId = item?.dataset?.id;
    const block = getSelectedBlock();
    if (!block || !detailId) return;

    const detail = block.details.find(d => String(d.id) === String(detailId));
    if (!detail) return;

    if (editButton) {
      activeDetailId = detail.id;
      if (detail.block_type === 'BREAK') {
        document.getElementById('breakModalTitle').textContent = t('break_modal_title_edit');
        document.getElementById('breakNameInput').value = detail.break_name || '';
        document.getElementById('breakTimeInput').value = detail.break_time || '';
        breakModal.show();
      } else {
        document.getElementById('competitionModalTitle').textContent = t('competition_modal_title_edit');
        document.getElementById('timePerDancerInput').value = detail.time_per_dancer || '';
        document.getElementById('timeBeforeStartInput').value = detail.time_before_start || '';
        competitionModal.show();
      }
    }

    if (deleteButton) {
      confirmDelete(t('confirm_delete_detail'), async () => {
        removeDetail(detail.id);
      });
    }
  });

  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (confirmDeleteCallback) {
      await confirmDeleteCallback();
      confirmDeleteCallback = null;
    }
    confirmDeleteModal.hide();
  });
}

async function loadCompetitions() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching competitions');
    const data = await response.json();
    competitions = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Failed to load competitions:', error);
  }
}

async function loadScheduleBlocks() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/schedule-blocks?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Error fetching schedule blocks');
    const data = await response.json();
    const list = Array.isArray(data) ? data : (data.blocks || data.schedule_blocks || []);
    scheduleBlocks = list.map(normalizeBlock);
  } catch (error) {
    console.error('Failed to load schedule blocks:', error);
    scheduleBlocks = [];
  }
}

async function ensureBlockDetailsLoaded() {
  const block = getSelectedBlock();
  if (!block) return;
  await ensureBlockDetailsLoadedFor(block);
}

async function ensureBlockDetailsLoadedFor(block) {
  if (!block || block.detailsLoaded) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/schedule-blocks/${block.id}`);
    if (!response.ok) throw new Error('Error fetching block details');
    const data = await response.json();

    const details = data.details || data.block_details || data.schedule_block_details || data.schedule_block_detail || [];
    block.details = Array.isArray(details) ? details.map(normalizeDetail) : [];
    block.detailsLoaded = true;
    block.start = data.start || block.start;
    block.color = data.color || block.color;
  } catch (error) {
    console.error('Failed to load block details:', error);
  }
}

function normalizeBlock(block) {
  const details = block.details || block.block_details || block.schedule_block_details || block.schedule_block_detail;
  const startValue = block.start || block.start_time || block.startDate;
  const colorValue = block.color || block.block_color || '';
  const hasDetails = Array.isArray(details);

  return {
    id: block.id,
    start: startValue,
    color: colorValue,
    details: hasDetails ? details.map(normalizeDetail) : [],
    detailsLoaded: hasDetails,
    dirty: false
  };
}

function normalizeDetail(detail) {
  const blockType = normalizeBlockType(detail.block_type || detail.type || detail.blockType);
  return {
    id: detail.id ?? `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    block_type: blockType,
    competition_id: detail.competition_id ?? detail.competitionId ?? null,
    time_per_dancer: toNumber(detail.time_per_dancer ?? detail.timePerDancer),
    time_before_start: toNumber(detail.time_before_start ?? detail.timeBeforeStart),
    break_name: detail.break_name ?? detail.breakName ?? '',
    break_time: toNumber(detail.break_time ?? detail.breakTime),
    category_name: detail.category_name ?? detail.category,
    style_name: detail.style_name ?? detail.style,
    num_dancers: detail.num_dancers ?? detail.dancers
  };
}

function normalizeBlockType(value) {
  const raw = (value || '').toString().trim().toUpperCase();
  if (raw.startsWith('B')) return 'BREAK';
  if (raw.startsWith('C')) return 'COMP';
  return raw || 'COMP';
}

function initColorSelect() {
  const colorSelect = document.getElementById('blockColor');
  colorSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = t('block_color_placeholder');
  colorSelect.appendChild(placeholder);

  pastelColors.forEach(color => {
    const option = document.createElement('option');
    option.value = color.value;
    option.textContent = t(color.key, color.fallback);
    colorSelect.appendChild(option);
  });

  updateColorPreview();
}

function updateColorPreview() {
  const preview = document.getElementById('blockColorPreview');
  const colorValue = document.getElementById('blockColor').value;
  preview.style.backgroundColor = colorValue || '#f1f3f5';
}

function renderScheduleConfig() {
  const currentColor = document.getElementById('blockColor')?.value || '';
  initColorSelect();
  if (currentColor) {
    document.getElementById('blockColor').value = currentColor;
  }
  updateColorPreview();
  renderBlockSelect();
  renderCompetitionsList();
  renderDetails();
}

function renderBlockSelect() {
  const select = document.getElementById('blockSelect');
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.textContent = t('block_select_placeholder');
  select.appendChild(placeholder);

  scheduleBlocks.forEach((block, index) => {
    const option = document.createElement('option');
    option.value = block.id;
    option.textContent = buildBlockLabel(block, index);
    select.appendChild(option);
  });

  if (!selectedBlockId && scheduleBlocks.length > 0) {
    selectedBlockId = scheduleBlocks[0].id;
  }

  if (selectedBlockId) {
    select.value = selectedBlockId;
  } else {
    placeholder.selected = true;
  }

  updateBlockForm();
}

function buildBlockLabel(block, index) {
  const startText = block.start ? formatDateTime(block.start) : t('not_set');
  return `${t('block_label')} ${index + 1} - ${startText}`;
}

function updateBlockForm() {
  const block = getSelectedBlock();
  const startInput = document.getElementById('blockStart');
  const colorSelect = document.getElementById('blockColor');
  const updateButton = document.getElementById('updateBlockBtn');
  const deleteButton = document.getElementById('deleteBlockBtn');
  const addBreakButton = document.getElementById('addBreakBtn');

  if (!block) {
    startInput.value = '';
    colorSelect.value = '';
    updateButton.disabled = true;
    deleteButton.disabled = true;
    addBreakButton.disabled = true;
    updateColorPreview();
    updateSelectedBlockMeta();
    return;
  }

  startInput.value = toDatetimeLocalValue(block.start);
  if (block.color) {
    colorSelect.value = block.color;
  } else {
    colorSelect.value = '';
  }

  updateBlockDirtyState();
  deleteButton.disabled = false;
  addBreakButton.disabled = false;

  updateColorPreview();
  updateSelectedBlockMeta();
}

function updateSelectedBlockMeta() {
  const block = getSelectedBlock();
  const meta = document.getElementById('selectedBlockMeta');
  const dragHint = document.getElementById('dragHint');

  if (!block) {
    meta.textContent = t('details_empty_no_block');
    dragHint.classList.add('d-none');
    return;
  }

  const blockIndex = scheduleBlocks.findIndex(item => String(item.id) === String(block.id));
  const startText = block.start ? formatDateTime(block.start) : t('not_set');
  const colorLabel = getColorLabel(block.color);
  const labelParts = [
    `${t('block_label')} ${blockIndex + 1}`,
    startText
  ];
  if (colorLabel) {
    labelParts.push(colorLabel);
  }
  meta.textContent = labelParts.join(' | ');

  dragHint.classList.toggle('d-none', !(block.details && block.details.length > 1));
}

function renderCompetitionsList() {
  const list = document.getElementById('competitionsList');
  const empty = document.getElementById('competitionsEmpty');
  list.innerHTML = '';

  const availableCompetitions = getAvailableCompetitions();
  const blockSelected = Boolean(getSelectedBlock());

  if (availableCompetitions.length === 0) {
    empty.classList.remove('d-none');
  } else {
    empty.classList.add('d-none');
  }

  availableCompetitions.forEach(comp => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2">
        <span class="fw-semibold">${comp.category_name || comp.category}</span>
        <span class="text-muted">${comp.style_name || comp.style}</span>
        <span class="badge bg-secondary">${comp.num_dancers ?? comp.dancers ?? 0}</span>
      </div>
      <button class="btn btn-sm btn-outline-primary btn-add-competition" data-id="${comp.id}" ${blockSelected ? '' : 'disabled'}>
        ${t('add_competition')}
      </button>
    `;
    list.appendChild(li);
  });
}

async function openPreviewSchedule() {
  await Promise.all(scheduleBlocks.map(block => ensureBlockDetailsLoadedFor(block)));
  renderPreviewSchedule();
  previewScheduleModal.show();
}

function renderPreviewSchedule() {
  const list = document.getElementById('previewScheduleList');
  const empty = document.getElementById('previewScheduleEmpty');
  list.innerHTML = '';

  const previewItems = buildPreviewItems();

  const withStart = previewItems.filter(item => item.estimatedStart);
  const withoutStart = previewItems.filter(item => !item.estimatedStart);

  withStart.sort((a, b) => a.estimatedStart - b.estimatedStart);
  withoutStart.sort((a, b) => {
    const nameA = getPreviewSortName(a);
    const nameB = getPreviewSortName(b);
    return nameA.localeCompare(nameB);
  });

  if (!withStart.length && !withoutStart.length) {
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  const groupedByDay = new Map();
  withStart.forEach(item => {
    const dayKey = formatDateOnly(item.estimatedStart);
    if (!groupedByDay.has(dayKey)) {
      groupedByDay.set(dayKey, []);
    }
    groupedByDay.get(dayKey).push(item);
  });

  const dayKeys = Array.from(groupedByDay.keys()).sort();
  dayKeys.forEach(dayKey => {
    const header = document.createElement('li');
    header.className = 'list-group-item fw-semibold bg-light';
    header.textContent = dayKey;
    list.appendChild(header);

    groupedByDay.get(dayKey).forEach(item => {
      renderPreviewItem(item, list);
    });
  });

  if (withoutStart.length) {
    const header = document.createElement('li');
    header.className = 'list-group-item fw-semibold bg-warning-subtle';
    header.textContent = t('preview_no_start');
    list.appendChild(header);

    withoutStart.forEach(item => {
      renderPreviewItem(item, list);
    });
  }
}

function renderPreviewItem(item, list) {
  const comp = item.comp;
  const detail = item.detail;
  const assigned = item.assigned;
  const estimatedStart = item.estimatedStart;
  const hasStart = Boolean(estimatedStart);
  const isBreak = item.type === 'BREAK';

  const li = document.createElement('li');
  li.className = 'list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2';

  const backgroundColor = !hasStart
    ? '#ffe8a1'
    : assigned?.blockColor
      ? assigned.blockColor
        : '#e9ecef';
  li.style.backgroundColor = backgroundColor;

  const category = comp?.category_name || comp?.category || t('category');
  const style = comp?.style_name || comp?.style || '';
  const dancers = comp?.num_dancers ?? comp?.dancers ?? 0;
  const title = isBreak
    ? (detail?.break_name || t('break_label'))
    : `${category}${style ? ` / ${style}` : ''}`;
  const estimatedText = hasStart ? formatTime(estimatedStart) : t('not_set');

  const badgeText = assigned ? t('preview_in_block') : t('preview_unassigned');
  const badgeClass = assigned ? 'text-bg-light' : 'text-bg-secondary';

  li.innerHTML = `
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span class="fw-semibold">${title}</span>
          ${isBreak ? '' : `<span class="badge bg-secondary">${dancers}</span>`}
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="text-muted small">${t('estimated_start')}: ${estimatedText}</div>
      `;

  list.appendChild(li);
}

function buildPreviewItems() {
  const assignment = buildCompetitionAssignmentMap();
  const items = competitions.map(comp => {
    const assigned = assignment.get(String(comp.id)) || null;
    const estimatedStart = getCompetitionEstimatedStart(comp, assigned?.detailId);
    return {
      type: 'COMP',
      comp,
      assigned,
      estimatedStart
    };
  });

  scheduleBlocks.forEach(block => {
    const schedule = computeBlockSchedule(block);
    const scheduleMap = new Map(schedule.map(entry => [String(entry.id), entry]));
    (block.details || []).forEach(detail => {
      if (detail.block_type !== 'BREAK') return;
      const scheduleInfo = scheduleMap.get(String(detail.id)) || {};
      items.push({
        type: 'BREAK',
        detail,
        assigned: {
          blockId: block.id,
          blockColor: block.color || '#e9ecef'
        },
        estimatedStart: scheduleInfo.estimatedStart || null
      });
    });
  });

  return items;
}

function getPreviewSortName(item) {
  if (item.type === 'BREAK') {
    return (item.detail?.break_name || t('break_label')).toString();
  }
  const comp = item.comp || {};
  return `${comp.category_name || comp.category || ''} ${comp.style_name || comp.style || ''}`.trim();
}

function formatDateOnly(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildCompetitionAssignmentMap() {
  const map = new Map();
  scheduleBlocks.forEach(block => {
    (block.details || []).forEach(detail => {
      if (detail.block_type !== 'COMP' || !detail.competition_id) return;
      const key = String(detail.competition_id);
      if (map.has(key)) return;
      map.set(key, {
        blockId: block.id,
        blockColor: block.color || '#e9ecef',
        detailId: detail.id
      });
    });
  });
  return map;
}

function getCompetitionEstimatedStart(comp, detailId) {
  const parsed = parseDate(comp.estimated_start || comp.estimatedStart);
  if (parsed) return parsed;

  if (!detailId) return null;

  for (const block of scheduleBlocks) {
    const detail = (block.details || []).find(item => String(item.id) === String(detailId));
    if (!detail) continue;
    const schedule = computeBlockSchedule(block);
    const entry = schedule.find(item => String(item.id) === String(detailId));
    if (entry?.estimatedStart) return entry.estimatedStart;
  }

  return null;
}

function renderDetails() {
  const list = document.getElementById('detailsList');
  const empty = document.getElementById('detailsEmpty');
  list.innerHTML = '';

  const block = getSelectedBlock();
  if (!block) {
    empty.textContent = t('details_empty_no_block');
    empty.classList.remove('d-none');
    if (detailSortable) {
      detailSortable.destroy();
      detailSortable = null;
    }
    return;
  }

  const details = block.details || [];
  if (details.length === 0) {
    empty.textContent = t('details_empty_no_items');
    empty.classList.remove('d-none');
  } else {
    empty.classList.add('d-none');
  }

  const schedule = computeBlockSchedule(block);
  const scheduleMap = new Map(schedule.map(entry => [String(entry.id), entry]));

  details.forEach(detail => {
    const scheduleInfo = scheduleMap.get(String(detail.id)) || {};
    const estimatedStart = scheduleInfo.estimatedStart;
    const durationSec = scheduleInfo.durationSec ?? 0;

    const isBreak = detail.block_type === 'BREAK';
    const typeLabel = isBreak ? t('break_label') : t('competition_label');
    const typeBadge = isBreak ? 'bg-secondary' : 'bg-primary';

    const compInfo = isBreak ? null : getCompetitionInfo(detail);
    const category = compInfo?.category_name || compInfo?.category || t('category');
    const style = compInfo?.style_name || compInfo?.style || '';
    const dancers = isBreak ? null : (compInfo?.num_dancers ?? compInfo?.dancers ?? detail.num_dancers ?? 0);

    const estimatedText = estimatedStart ? formatTime(estimatedStart) : t('not_set');
    const durationText = formatDuration(durationSec);
    const title = isBreak ? (detail.break_name || t('break_label')) : `${category} ${style ? `/ ${style}` : ''}`;
    const metaItems = [];
    if (!isBreak) {
      //metaItems.push(`${t('dancers')}: <span class="badge bg-secondary">${dancers}</span>`);
      metaItems.push(`${t('time_before_start')}: ${detail.time_before_start ?? 0}s`);
      metaItems.push(`${t('time_per_dancer')}: ${detail.time_per_dancer ?? 0}s`);
    } else {
      metaItems.push(`${t('break_time')}: ${detail.break_time ?? 0} ${t('minutes_short')}`);
    }

    let numDancers = '';
    if (!isBreak) {
      numDancers = `<span class="badge bg-secondary">${dancers}</span>`;
    }

    const li = document.createElement('li');
    li.className = 'list-group-item schedule-detail-item d-flex gap-3 align-items-start';
    li.dataset.id = detail.id;
    li.style.setProperty('--block-color', block.color || '#e9ecef');

    li.innerHTML = `
      <div class="drag-handle text-muted mt-1"><i class="bi bi-grip-vertical"></i></div>
      <div class="flex-grow-1">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <div>
            <div>
              <span class="badge ${typeBadge} me-2">${typeLabel}</span>
              <span class="fw-semibold me-2">${title}</span>
              ${numDancers}
            </div>
            <div class="mt-2 text-muted small d-flex flex-wrap gap-3">
              ${metaItems.map(item => `<span>${item}</span>`).join('')}
            </div>
          </div>
          <div class="text-end">
            <div class="fw-semibold">${t('estimated_start')}: ${estimatedText}</div>
            <div class="mt-2 text-muted small">${t('duration')}: ${durationText}</div>
          </div>
        </div>

      </div>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-outline-primary btn-edit-detail" title="${t('edit')}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger btn-delete-detail" title="${t('delete')}"><i class="bi bi-trash"></i></button>
      </div>
    `;

    list.appendChild(li);
  });

  initSortable();
  updateSelectedBlockMeta();
}

function initSortable() {
  const list = document.getElementById('detailsList');
  const block = getSelectedBlock();
  if (!block || block.details.length < 2) {
    if (detailSortable) {
      detailSortable.destroy();
      detailSortable = null;
    }
    return;
  }

  if (detailSortable) {
    detailSortable.destroy();
  }

    detailSortable = new Sortable(list, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: () => {
        const order = Array.from(list.children).map(item => item.dataset.id);
        block.details.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
        markBlockDirty(block);
        renderDetails();
      }
    });
  }

function getAvailableCompetitions() {
  const usedIds = new Set();
  scheduleBlocks.forEach(block => {
    (block.details || []).forEach(detail => {
      if (detail.block_type !== 'BREAK' && detail.competition_id) {
        usedIds.add(String(detail.competition_id));
      }
    });
  });

  return competitions.filter(comp => !usedIds.has(String(comp.id)));
}

function getCompetitionInfo(detail) {
  const comp = competitions.find(item => String(item.id) === String(detail.competition_id));
  if (comp) return comp;
  if (detail.category_name || detail.style_name) return detail;
  return null;
}

function getSelectedBlock() {
  if (!selectedBlockId) return null;
  return scheduleBlocks.find(block => String(block.id) === String(selectedBlockId)) || null;
}

async function createScheduleBlock() {
  const startValue = document.getElementById('blockStart').value;
  const colorValue = document.getElementById('blockColor').value;

  if (!startValue) {
    showMessageModal(t('block_start_missing'), t('error'));
    return;
  }

  if (!colorValue) {
    showMessageModal(t('block_color_missing'), t('error'));
    return;
  }

  const payload = {
    event_id: getEvent().id,
    start: startValue,
    color: colorValue,
    details: []
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/schedule-blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      showMessageModal(data.error || 'Error creating schedule block', t('error'));
      return;
    }

    const blockId = data.id || data.schedule_block_id || data.insertId;
    if (!blockId) {
      showMessageModal('Missing block id from API response', t('error'));
      return;
    }

    scheduleBlocks.push({
      id: blockId,
      start: startValue,
      color: colorValue,
      details: [],
      detailsLoaded: true,
      dirty: false
    });

    selectedBlockId = blockId;
    renderScheduleConfig();
  } catch (error) {
    console.error('Failed to create schedule block:', error);
    showMessageModal('Error creating schedule block', t('error'));
  }
}

async function saveSelectedBlock() {
  const block = getSelectedBlock();
  if (!block) return;

  const payload = {
    event_id: getEvent().id,
    start: formatStartForApi(block.start),
    color: block.color || null,
    details: serializeDetails(block.details)
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/schedule-blocks/${block.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      showMessageModal(data.error || 'Error saving schedule block', t('error'));
      return;
    }

      if (data && typeof data === 'object') {
        block.start = data.start || block.start;
        block.color = data.color || block.color;
        if (Array.isArray(data.details)) {
          block.details = data.details.map(normalizeDetail);
          block.detailsLoaded = true;
        }
      }

      clearBlockDirty(block);
      renderScheduleConfig();
  } catch (error) {
    console.error('Failed to save schedule block:', error);
    showMessageModal('Error saving schedule block', t('error'));
  }
}

async function deleteSelectedBlock() {
  const block = getSelectedBlock();
  if (!block) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/schedule-blocks/${block.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const data = await response.json();
      showMessageModal(data.error || 'Error deleting schedule block', t('error'));
      return;
    }

    scheduleBlocks = scheduleBlocks.filter(item => String(item.id) !== String(block.id));
    selectedBlockId = scheduleBlocks.length ? scheduleBlocks[0].id : null;

    renderScheduleConfig();
  } catch (error) {
    console.error('Failed to delete schedule block:', error);
    showMessageModal('Error deleting schedule block', t('error'));
  }
}

function saveCompetitionDetailFromModal() {
  const timePerDancer = toNumber(document.getElementById('timePerDancerInput').value);
  const timeBeforeStart = toNumber(document.getElementById('timeBeforeStartInput').value);
  const block = getSelectedBlock();

  if (!block) return;
  if (timePerDancer <= 0) {
    showMessageModal(t('time_per_dancer_missing'), t('error'));
    return;
  }

  if (activeDetailId) {
    const detail = block.details.find(d => String(d.id) === String(activeDetailId));
    if (detail) {
      detail.time_per_dancer = timePerDancer;
      detail.time_before_start = timeBeforeStart;
    }
  } else {
    if (!activeCompetitionId) return;
    block.details.push({
      id: `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      block_type: 'COMP',
      competition_id: activeCompetitionId,
      time_per_dancer: timePerDancer,
      time_before_start: timeBeforeStart
    });
  }

  competitionModal.hide();
  activeDetailId = null;
  activeCompetitionId = null;

  markBlockDirty(block);
  renderScheduleConfig();
}

function formatStartForApi(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (match) {
      return `${match[1]}T${match[2]}`;
    }
  }

  const date = parseDate(value);
  return date ? toDatetimeLocalValue(date) : null;
}

function saveBreakDetailFromModal() {
  const breakName = document.getElementById('breakNameInput').value.trim();
  const breakTime = toNumber(document.getElementById('breakTimeInput').value);
  const block = getSelectedBlock();

  if (!block) return;
  if (!breakName) {
    showMessageModal(t('break_name_missing'), t('error'));
    return;
  }
  if (breakTime <= 0) {
    showMessageModal(t('break_time_missing'), t('error'));
    return;
  }

  if (activeDetailId) {
    const detail = block.details.find(d => String(d.id) === String(activeDetailId));
    if (detail) {
      detail.break_name = breakName;
      detail.break_time = breakTime;
    }
  } else {
    block.details.push({
      id: `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      block_type: 'BREAK',
      break_name: breakName,
      break_time: breakTime
    });
  }

  breakModal.hide();
  activeDetailId = null;

  markBlockDirty(block);
  renderScheduleConfig();
}

function removeDetail(detailId) {
  const block = getSelectedBlock();
  if (!block) return;

  block.details = block.details.filter(detail => String(detail.id) !== String(detailId));
  markBlockDirty(block);
  renderScheduleConfig();
}

function markBlockDirty(block) {
  if (!block) return;
  block.dirty = true;
  updateBlockDirtyState();
}

function clearBlockDirty(block) {
  if (!block) return;
  block.dirty = false;
  updateBlockDirtyState();
}

function updateBlockDirtyState() {
  const updateButton = document.getElementById('updateBlockBtn');
  if (!updateButton) return;
  const block = getSelectedBlock();
  updateButton.disabled = !block || !block.dirty;
}

function hasPendingChanges() {
  const updateButton = document.getElementById('updateBlockBtn');
  return Boolean(updateButton && !updateButton.disabled);
}

function bindBeforeUnloadWarning() {
  if (beforeUnloadHandlerBound) return;
  beforeUnloadHandlerBound = true;
  window.addEventListener('beforeunload', (event) => {
    if (allowNavigateWithoutPrompt) return;
    if (!hasPendingChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function handleBackToCompetitions() {
  if (hasPendingChanges()) {
    if (unsavedChangesModal) {
      unsavedChangesModal.show();
      return;
    }
  }
  navigateToCompetitions();
}

function navigateToCompetitions() {
  allowNavigateWithoutPrompt = true;
  window.location.href = getCompetitionsUrl();
}

function getCompetitionsUrl() {
  return `competitions.html?eventId=${encodeURIComponent(eventId)}`;
}

function confirmDelete(message, callback) {
  confirmDeleteCallback = callback;
  document.getElementById('confirmDeleteMessage').textContent = message;
  confirmDeleteModal.show();
}

function serializeDetails(details) {
  return (details || []).map((detail, index) => ({
    id: isTempId(detail.id) ? null : detail.id,
    block_type: detail.block_type,
    competition_id: detail.competition_id || null,
    time_per_dancer: detail.time_per_dancer || null,
    time_before_start: detail.time_before_start || null,
    break_name: detail.break_name || null,
    break_time: detail.break_time || null,
    order: index + 1
  }));
}

function isTempId(id) {
  return String(id).startsWith('temp-');
}

function computeBlockSchedule(block) {
  const details = block.details || [];
  const start = parseDate(block.start);
  if (!start) {
    return details.map(detail => ({
      id: detail.id,
      estimatedStart: null,
      durationSec: 0
    }));
  }

  const orderedDetails = [...details].sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : 0;
    const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : 0;
    return orderA - orderB;
  });

  let offsetSeconds = 0;
  const schedule = [];

  orderedDetails.forEach(detail => {
    if (!detail) return;

    if (detail.block_type === 'BREAK') {
      if (offsetSeconds % 60 !== 0) {
        offsetSeconds = Math.ceil(offsetSeconds / 60) * 60;
      }
      const estimatedStart = new Date(start.getTime() + offsetSeconds * 1000);
      const durationSec = toNumber(detail.break_time) * 60;
      offsetSeconds += durationSec;
      schedule.push({ id: detail.id, estimatedStart, durationSec });
      return;
    }

    if (detail.block_type === 'COMP' && detail.competition_id) {
      const preSeconds = toNumber(detail.time_before_start);
      offsetSeconds += preSeconds;

      if (offsetSeconds % 60 !== 0) {
        offsetSeconds = Math.ceil(offsetSeconds / 60) * 60;
      }

      const estimatedStart = new Date(start.getTime() + offsetSeconds * 1000);

      const dancers = getCompetitionDancers(detail);
      const durationSec = toNumber(detail.time_per_dancer) * dancers;
      offsetSeconds += durationSec;

      schedule.push({ id: detail.id, estimatedStart, durationSec });
      return;
    }

    schedule.push({ id: detail.id, estimatedStart: null, durationSec: 0 });
  });

  return schedule;
}

function getCompetitionDancers(detail) {
  const comp = competitions.find(item => String(item.id) === String(detail.competition_id));
  const value = comp?.num_dancers ?? comp?.dancers ?? detail.num_dancers ?? 0;
  return toNumber(value);
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remaining}s`;
  }
  return `${remaining}s`;
}

function toDatetimeLocalValue(value) {
  const date = parseDate(value);
  if (!date) return '';

  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (isoMatch) {
      const [, year, month, day, hour, minute, second] = isoMatch;
      return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second || 0));
    }

    const dmyMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
    if (dmyMatch) {
      const [, day, month, year, hour, minute] = dmyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0);
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return null;
}

function formatTime(date) {
  if (!date) return '-';
  return date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return t('not_set');
  return date.toLocaleString(getLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getLocale() {
  const lang = localStorage.getItem('lang') || 'en';
  if (lang === 'es') return 'es-ES';
  if (lang === 'it') return 'it-IT';
  if (lang === 'pt') return 'pt-PT';
  if (lang === 'fr') return 'fr-FR';
  return 'en-GB';
}

function getColorLabel(colorValue) {
  if (!colorValue) return '';
  const entry = pastelColors.find(color => color.value === colorValue);
  if (!entry) return colorValue;
  return t(entry.key, entry.fallback);
}

function toNumber(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}




