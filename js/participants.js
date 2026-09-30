//var title = 'Participants';

// Simula tu eventReadyPromise si existe
//const eventReadyPromise = Promise.resolve();

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();
  await ensureTranslationsReady();

  const user = getUserFromToken();
  const role = user ? user.role : 'guest';

  // Si el evento no tiene visibleParticipants y el usuario no es ni admin ni organizer, redirigir a home
  if (!getEvent().visibleParticipants && role !== 'admin' && role !== 'organizer') {
      //alert('Esta página no es visible en estos momentos');
      alert(t('page_not_visible'));
      window.location.href = 'home.html?eventId='+eventId;
      return;
  }

  if (getEvent().notice_active && getEvent().notice_text.trim() !== '') {
      const noticePanel = document.getElementById('noticePanel');
      const noticeInnerPannel = document.getElementById('notice_type');
      noticeInnerPannel.classList.add(`alert-${getEvent().notice_type === 'IMP' ? 'danger' : 'success'}`);
      const noticeTextDiv = document.getElementById('notice_text');
      noticeTextDiv.innerText = getEvent().notice_text;
      noticePanel.style.display = 'block';
  }

  applyParticipantsSummaryLayout();
  bindParticipantsSearch();
  loadParticipants(); 
});

function applyParticipantsSummaryLayout() {
  const showFlags = shouldShowDancerFlags();
  const summary = document.getElementById('participantsSummary');
  summary?.classList.toggle('participants-summary--three', !showFlags);

  const natCol = document.getElementById('statsColNat');
  if (natCol) {
    natCol.classList.toggle('d-none', !showFlags);
  }

  const natDistributionSection = document.getElementById('natDistributionSection');
  if (natDistributionSection) {
    natDistributionSection.classList.toggle('d-none', !showFlags);
  }
}

function bindParticipantsSearch() {
  const searchForm = document.getElementById('participantsSearchForm');
  const clearButton = document.getElementById('clearSearchBtn');

  searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    filtrarCategorias();
  });

  clearButton?.addEventListener('click', resetearBuscador);
}

function getParticipantClubLabel(participant) {
  if (getEvent()?.hideSchoolInfo) return '';
  const clubName = String(participant?.club_name || '').trim();
  const clubLocation = String(participant?.club_location || '').trim();
  if (!clubName) return '';
  return clubLocation ? `${clubName} [${clubLocation}]` : clubName;
}

async function loadParticipants() {
  const participantsContainer = document.getElementById('participantsContainer');
  
  let data;
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/events/participants?event_id=${getEvent().id}`);
    if (!res.ok) throw new Error('Error fetching data');
    data = await res.json();
    window.participantsData = data;
  } catch (err) {
    console.error('Error fetching participants:', err);
    participantsContainer.innerHTML = '<p class="participants-error">Error loading participants.</p>';
    return;
  }  

  renderData(data);  
}

function renderData(data) {

  const showFlags = shouldShowDancerFlags();
  const numCategories = document.getElementById('numCat');
  const numStyles = document.getElementById('numSty');
  const numParticipants = document.getElementById('numPar');
  const numNationalities = document.getElementById('numNat');
  const parByNat = document.getElementById('parByNat');

  const totals = {
    categories: data.length,
    styles: new Set(),
    participants: 0,
    nationalities: new Set(),
    participantsByNat: {}
  };

  data.forEach(cat => {
    cat.styles.forEach(s => totals.styles.add(s.name));

    cat.participants.forEach(p => {
      const participantNatCode = String(p.nationality || 'XX').trim().toUpperCase() || 'XX';
      totals.participants++;
      totals.nationalities.add(participantNatCode);
      totals.participantsByNat[participantNatCode] =
        (totals.participantsByNat[participantNatCode] || 0) + 1;
    });
  });

  // Mostrar totales
  numCategories.textContent = totals.categories;
  numStyles.textContent = totals.styles.size;
  numParticipants.textContent = totals.participants;
  numNationalities.textContent = showFlags ? totals.nationalities.size : '';

  // Mostrar banderas + número (sin recuadro)
  parByNat.innerHTML = ''; // limpiar contenedor

  Object.entries(totals.participantsByNat)
  .sort((a, b) => b[1] - a[1])
  .forEach(([nat, count]) => {
    const div = document.createElement('div');
    div.className = 'participants-nationality';

    if (showFlags) {
      const img = document.createElement('img');
      img.src = getDancerFlagUrl(nat, 24);
      img.alt = nat;
      img.width = 24;
      img.height = 24;
      div.appendChild(img);
    } else {
      return;
    }

    const span = document.createElement('span');
    span.textContent = count;

    div.appendChild(span);
    parByNat.appendChild(div);
  });


  participantsContainer.innerHTML = '';

  data.forEach((categoryData, i) => {
    const categoryItem = createCategoryItem(categoryData.category_name, categoryData, i + 1);
    participantsContainer.appendChild(categoryItem);
  });
}

function createCategoryItem(category, categoryData, index) {
  const accordion = document.createElement('div');
  accordion.className = 'accordion participants-category';
  accordion.id = 'accordion-' + index;

  const item = document.createElement('div');
  item.className = 'accordion-item';
  item.dataset.nombres = categoryData.participants.map((participant) => participant.name || '').join(', ');

  const header = document.createElement('h2');
  header.className = 'accordion-header';
  header.id = `heading-${index}`;

  const button = document.createElement('button');
  button.className = 'accordion-button collapsed participants-category-toggle';
  button.type = 'button';
  button.setAttribute('data-bs-toggle', 'collapse');
  button.setAttribute('data-bs-target', `#collapse-${index}`);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `collapse-${index}`);

  const categoryTitle = document.createElement('span');
  categoryTitle.className = 'participants-category-title';

  const categoryIcon = document.createElement('i');
  categoryIcon.className = 'bi bi-people-fill';
  categoryIcon.setAttribute('aria-hidden', 'true');

  const categoryName = document.createElement('span');
  categoryName.className = 'participants-category-name';
  categoryName.textContent = category;

  const categorySummary = document.createElement('span');
  categorySummary.className = 'participants-category-summary';

  const participantCount = document.createElement('span');
  participantCount.className = 'participants-category-count';
  participantCount.textContent = categoryData.participants.length;
  participantCount.setAttribute('aria-label', `${t('total_participants')}: ${categoryData.participants.length}`);

  const categoryChevron = document.createElement('i');
  categoryChevron.className = 'bi bi-chevron-down participants-category-chevron';
  categoryChevron.setAttribute('aria-hidden', 'true');

  categoryTitle.append(categoryIcon, categoryName);
  categorySummary.append(participantCount, categoryChevron);
  button.append(categoryTitle, categorySummary);

  header.appendChild(button);

  const collapse = document.createElement('div');
  collapse.id = `collapse-${index}`;
  collapse.className = 'accordion-collapse collapse';
  collapse.setAttribute('aria-labelledby', `heading-${index}`);

  const body = document.createElement('div');
  body.className = 'accordion-body';

  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'participants-category-controls';

  const btnSchedule = document.createElement('button');
  btnSchedule.type = 'button';
  btnSchedule.className = 'lm-btn participants-schedule-btn';
  btnSchedule.innerHTML = `<i class="bi bi-calendar-week" aria-hidden="true"></i><span>${t('style_schedule')}</span>`;
  controlsDiv.appendChild(btnSchedule);

  btnSchedule.addEventListener('click', () => {
    const modalTitle = document.getElementById('styleScheduleLabel');
    modalTitle.textContent = `${t('style_schedule')} - ${category}`;

    const tbodyModal = document.querySelector('#styleScheduleModal tbody');
    tbodyModal.innerHTML = '';

    categoryData.styles.forEach(style => {
      const tr = document.createElement('tr');

      const tdStyle = document.createElement('td');
      tdStyle.textContent = style.name;
      tr.appendChild(tdStyle);

      const tdStart = document.createElement('td');
      if (style.start && String(style.start).toLowerCase() !== 'null') {
        const clockIcon = document.createElement('i');
        clockIcon.className = 'bi bi-clock';
        clockIcon.setAttribute('aria-hidden', 'true');
        tdStart.append(clockIcon, document.createTextNode(style.start));
      } else {
        const notDefined = document.createElement('span');
        notDefined.className = 'text-muted';
        notDefined.textContent = t('not_defined');
        tdStart.appendChild(notDefined);
      }
      tr.appendChild(tdStart);

      tbodyModal.appendChild(tr);
    });

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('styleScheduleModal'));
    modal.show();
  });

  const legend = document.createElement('small');
  legend.className = 'participants-category-legend';
  legend.innerHTML = `<i class="bi bi-list-ol" aria-hidden="true"></i><span>${t('icon_legend')}</span>`;
  controlsDiv.appendChild(legend);

  const tableDiv = document.createElement('div');
  tableDiv.className = 'table-responsive participants-table-wrap';

  const table = document.createElement('table');
  table.className = 'table participants-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const thParticipant = document.createElement('th');
  thParticipant.textContent = t('participant');
  headerRow.appendChild(thParticipant);

  categoryData.styles.forEach(style => {
    const th = document.createElement('th');

    const styleHeader = document.createElement('div');
    styleHeader.className = 'participants-style-header';

    const spanName = document.createElement('span');
    spanName.className = 'participants-style-name';
    spanName.textContent = style.name;
    styleHeader.appendChild(spanName);

    if (style.competition_id) {
      const orderButton = document.createElement('button');
      orderButton.type = 'button';
      orderButton.className = 'participants-style-order-btn';
      orderButton.title = t('participants_by_style');
      orderButton.setAttribute('aria-label', `${t('participants_by_style')}: ${style.name}`);
      orderButton.dataset.compId = style.competition_id;
      orderButton.dataset.start = style.start ?? '';
      orderButton.dataset.categoryName = category;
      orderButton.dataset.styleName = style.name;
      orderButton.innerHTML = '<i class="bi bi-list-ol" aria-hidden="true"></i>';
      styleHeader.appendChild(orderButton);
    } else {
      const badge = document.createElement('span');
      badge.className = 'participants-no-competition';
      badge.textContent = t('no_competition');
      th.appendChild(badge);
    }

    th.insertBefore(styleHeader, th.firstChild);
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  categoryData.participants.forEach(participant => {
    const row = document.createElement('tr');

    const tdParticipant = document.createElement('td');
    tdParticipant.className = 'participants-table-participant';

    const participantContent = document.createElement('div');
    participantContent.className = 'participants-person';

    if (shouldShowDancerFlags()) {
      const imgCountry = document.createElement('img');
      imgCountry.className = 'participants-person-flag';
      imgCountry.src = getDancerFlagUrl(participant.nationality, 24);
      imgCountry.alt = String(participant.nationality || 'N/A');
      imgCountry.width = 24;
      imgCountry.height = 24;
      participantContent.appendChild(imgCountry);
    }

    const textBlock = document.createElement('div');
    textBlock.className = 'participants-person-copy';

    const topRow = document.createElement('div');
    topRow.className = 'participants-person-main';

    const spanDancer = document.createElement('span');
    spanDancer.className = 'participants-person-name';
    spanDancer.textContent = participant.name;
    const clubLabel = getParticipantClubLabel(participant);

    topRow.appendChild(spanDancer);

    const badge = document.createElement('span');
    badge.className = 'participants-style-count';
    badge.textContent = `${participant.styles.length} ${t('styles')}`;
    topRow.appendChild(badge);

    textBlock.appendChild(topRow);

    if (clubLabel) {
      const spanClub = document.createElement('small');
      spanClub.className = 'participants-person-club';
      spanClub.textContent = clubLabel;
      textBlock.appendChild(spanClub);
    }

    participantContent.appendChild(textBlock);

    tdParticipant.appendChild(participantContent);

    row.appendChild(tdParticipant);

    categoryData.styles.forEach(style => {
      const td = document.createElement('td');
      td.className = 'participants-style-cell';
      const spanTd = document.createElement('span');
      spanTd.className = 'participants-style-check';
      spanTd.textContent = participant.styles.some(s => s.id === style.id) ? '✓' : '';
      td.appendChild(spanTd);
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });


  table.appendChild(tbody);
  tableDiv.appendChild(table);

  body.appendChild(controlsDiv);
  body.appendChild(tableDiv);
  collapse.appendChild(body);

  item.appendChild(header);
  item.appendChild(collapse);
  accordion.appendChild(item);

  return accordion;
}

// Filtrado por buscador
function filtrarCategorias() {
  const texto = document.getElementById('buscador').value.toLowerCase().trim();
  const items = document.querySelectorAll('.accordion-item');

  items.forEach(item => {
    const nombres = item.dataset.nombres.toLowerCase();
    const collapse = item.querySelector('.accordion-collapse');

    if (texto === "") {
      item.style.display = '';
      setParticipantCategoryExpanded(item, collapse, false);
    } else if (nombres.includes(texto)) {
      item.style.display = '';
      setParticipantCategoryExpanded(item, collapse, true);
    } else {
      item.style.display = 'none';
      setParticipantCategoryExpanded(item, collapse, false);
    }
  });
}

function setParticipantCategoryExpanded(item, collapse, expanded) {
  const toggle = item.querySelector('.participants-category-toggle');
  collapse.classList.toggle('show', expanded);
  toggle?.classList.toggle('collapsed', !expanded);
  toggle?.setAttribute('aria-expanded', String(expanded));
}

function resetearBuscador() {
  const buscador = document.getElementById('buscador');
  buscador.value = "";
  buscador.focus();
  filtrarCategorias();
}

document.addEventListener('click', async (event) => {
  const orderButton = event.target.closest('.participants-style-order-btn');
  if (!orderButton) return;

  const compId = orderButton.dataset.compId;
  const categoryName = orderButton.dataset.categoryName;
  const styleName = orderButton.dataset.styleName;
  const startTime = orderButton.dataset.start;
  const eventId = getEvent().id; // tu función existente

  const modalTitle = document.getElementById('styleDancersModalLabel');
  modalTitle.textContent = `${t('competition')}: ${categoryName} / ${styleName}`;

  // Mostrar hora de inicio (si existe en el dataset)
  const estimatedStartEl = document.getElementById('estimatedStart');
  if (startTime && startTime != 'null') {
    estimatedStartEl.textContent = startTime;
  } else {
    estimatedStartEl.textContent = t('not_defined');
  }

  const list = document.getElementById('styleDancersList');
  list.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE_URL}/api/competitions/${compId}/dancers?event_id=${eventId}`);
    if (!res.ok) throw new Error('Error fetching dancers');
    const dancers = await res.json();

    dancers.forEach(dancer => {
      const li = document.createElement('li');
      li.className = 'participants-modal-person';
      li.innerHTML = `        
        <span class="participants-modal-position">#${escapeHtml(dancer.position)}</span>
        ${getDancerFlagImgHtml(dancer.nationality, { className: 'participants-modal-flag', width: 22, height: 22 })}
        <span class="participants-modal-name">${escapeHtml(dancer.name || dancer.dancer_name || '')}</span>
      `;
      list.appendChild(li);
    });

    const modalEl = document.getElementById('styleDancersModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

  } catch (err) {
    console.error('Error loading dancers:', err);
    list.innerHTML = '<li class="participants-modal-error">Error loading dancers</li>';
  }
});

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


