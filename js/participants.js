//var title = 'Participants';

// Simula tu eventReadyPromise si existe
//const eventReadyPromise = Promise.resolve();

document.addEventListener('DOMContentLoaded', async () => {
  await WaitEventLoaded();

  if (!getEvent().visibleParticipants) {
      alert('Esta página no es visible en estos momentos');
      window.location.href = 'home.html?eventId='+eventId;
      return;
  }

  loadParticipants();  
});

async function loadParticipants() {
  const participantsContainer = document.getElementById('participantsContainer');
  
  let data;
  try {
    const res = await fetch(`${API_BASE_URL}/api/events/participants?event_id=${getEvent().id}`);
    if (!res.ok) throw new Error('Error fetching data');
    data = await res.json();
    window.participantsData = data;
  } catch (err) {
    console.error('Error fetching participants:', err);
    participantsContainer.innerHTML = '<p class="text-danger">Error loading participants.</p>';
    return;
  }  

  renderData(data);  
}

function renderData(data) {

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
      totals.participants++;
      totals.nationalities.add(p.nationality);
      totals.participantsByNat[p.nationality] =
        (totals.participantsByNat[p.nationality] || 0) + 1;
    });
  });

  // Mostrar totales
  numCategories.textContent = totals.categories;
  numStyles.textContent = totals.styles.size;
  numParticipants.textContent = totals.participants;
  numNationalities.textContent = totals.nationalities.size;

  // Mostrar banderas + número (sin recuadro)
  parByNat.innerHTML = ''; // limpiar contenedor

  Object.entries(totals.participantsByNat)
  .sort((a, b) => b[1] - a[1])
  .forEach(([nat, count]) => {
    const div = document.createElement('div');
    div.className = 'd-flex align-items-center';

    const img = document.createElement('img');
    img.className = 'me-1';
    img.src = `https://flagsapi.com/${nat}/shiny/24.png`;
    img.alt = nat;

    const span = document.createElement('span');
    span.textContent = count;

    div.appendChild(img);
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
  accordion.className = 'accordion mb-4';
  accordion.id = 'accordion-' + index;

  const item = document.createElement('div');
  item.className = 'accordion-item';
  item.dataset.nombres = categoryData.participants.map(p => p.name).join(', ');

  const header = document.createElement('h2');
  header.className = 'accordion-header';
  header.id = `heading-${index}`;

  const button = document.createElement('button');
  button.className = 'accordion-button collapsed';
  button.type = 'button';
  button.setAttribute('data-bs-toggle', 'collapse');
  button.setAttribute('data-bs-target', `#collapse-${index}`);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `collapse-${index}`);
  button.textContent = category;

  header.appendChild(button);

  const collapse = document.createElement('div');
  collapse.id = `collapse-${index}`;
  collapse.className = 'accordion-collapse collapse';
  collapse.setAttribute('aria-labelledby', `heading-${index}`);

  const body = document.createElement('div');
  body.className = 'accordion-body';

  const title = document.createElement('h4'); 
  const titleText = document.createElement('span'); 
  titleText.className = 'badge bg-warning'; 
  titleText.textContent = `${translations["total_participants"]}: ${categoryData.participants.length}`; 
  title.appendChild(titleText);

  const controlsDiv = document.createElement('div');
  // flex-column en móvil, fila en pantallas medianas o mayores
  controlsDiv.className = 'd-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between mb-3 gap-2';

  // Botón "Style Schedule"
  const btnSchedule = document.createElement('button');
  btnSchedule.type = 'button';
  btnSchedule.className = 'btn btn-primary';
  btnSchedule.innerHTML = `<i class="bi bi-calendar-week me-2"></i>${translations["style_schedule"]}`;
  controlsDiv.appendChild(btnSchedule);

  btnSchedule.addEventListener('click', () => {
    // Título del modal
    const modalTitle = document.getElementById('styleScheduleLabel');
    modalTitle.textContent = `${translations["style_schedule"]} - ${category}`;

    // Cuerpo del modal: tabla
    const tbodyModal = document.querySelector('#styleScheduleModal tbody');
    tbodyModal.innerHTML = ''; // limpiar filas previas

    categoryData.styles.forEach(style => {
      const tr = document.createElement('tr');

      const tdStyle = document.createElement('td');
      tdStyle.textContent = style.name;
      tr.appendChild(tdStyle);

      const tdStart = document.createElement('td');
      if (style.start && style.start.toLowerCase() !== 'null') {
        tdStart.innerHTML = `<i class="bi bi-clock me-1"></i>${style.start}`;
      } else {
        tdStart.innerHTML = `<span class="text-muted">${translations["not_defined"]}</span>`; // Aquí el texto si no hay hora
      }
      tr.appendChild(tdStart);

      tbodyModal.appendChild(tr);
    });

    // Abrir el modal con Bootstrap 5
    const modal = new bootstrap.Modal(document.getElementById('styleScheduleModal'));
    modal.show();
  });


  // Leyenda con icono y texto explicativo
  const legend = document.createElement('small');
  legend.className = 'text-muted';
  legend.innerHTML = `<i class="bi bi-list-ol text-primary me-1 legend-icon"></i>${translations["icon_legend"]}`;
  controlsDiv.appendChild(legend);

  const tableDiv = document.createElement('div');
  tableDiv.className = 'table-responsive';

  const table = document.createElement('table');
  table.className = 'table table-bordered table-hover';
  const thead = document.createElement('thead');
  thead.className = 'table-light text-primary';
  const headerRow = document.createElement('tr');

  const thParticipant = document.createElement('th');
  thParticipant.className = 'text-center';
  thParticipant.textContent = translations["participant"];
  headerRow.appendChild(thParticipant);

  categoryData.styles.forEach(style => {
    const th = document.createElement('th');
    th.className = 'text-center';

    // Nombre del estilo
    const spanName = document.createElement('span');
    spanName.textContent = style.name;
    th.appendChild(spanName);

    if (style.competition_id) {
        // Icono clickable para mostrar bailarinas
        const icon = document.createElement('i');
        icon.className = 'bi bi-list-ol ms-2 text-primary';
        icon.style.cursor = 'pointer';
        icon.title = translations["participants_by_style"];
        icon.dataset.compId = style.competition_id; // Se usará en el fetch
        icon.dataset.start = style.start;
        icon.dataset.categoryName = category;
        icon.dataset.styleName = style.name;
        th.appendChild(icon);
    } else {
        // Badge rojo "No Competition"
        const badge = document.createElement('span');
        badge.className = 'badge bg-danger d-block mt-1';
        badge.textContent = translations["no_competition"];
        th.appendChild(badge);
    }

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.className = 'text-success fw-bold';

  categoryData.participants.forEach(participant => {
    const row = document.createElement('tr');

    // Celda participante con bandera, nombre y badge
    const tdParticipant = document.createElement('td');
    tdParticipant.className = 'd-flex justify-content-between align-items-center ps-3';

    // Contenedor izquierda (bandera + nombre)
    const leftDiv = document.createElement('div');
    leftDiv.className = 'd-flex align-items-center';

    const imgCountry = document.createElement('img');
    imgCountry.className = 'me-2';
    imgCountry.src = `https://flagsapi.com/${participant.nationality}/shiny/24.png`;

    const spanDancer = document.createElement('span');
    spanDancer.textContent = participant.name;

    leftDiv.appendChild(imgCountry);
    leftDiv.appendChild(spanDancer);

    // Badge derecha
    const badge = document.createElement('span');
    badge.className = 'badge bg-info me-2';
    badge.textContent = `${participant.styles.length} ${translations["styles"]}`;

    tdParticipant.appendChild(leftDiv);
    tdParticipant.appendChild(badge);

    row.appendChild(tdParticipant);

    // Columnas de estilos
    categoryData.styles.forEach(style => {
        const td = document.createElement('td');
        td.className = 'text-center';
        const spanTd = document.createElement('span');
        spanTd.className = 'text-success';
        spanTd.textContent = participant.styles.some(s => s.id === style.id) ? '✓' : '';
        td.appendChild(spanTd);
        row.appendChild(td);
    });

    tbody.appendChild(row);
  });


  table.appendChild(tbody);
  tableDiv.appendChild(table);

  body.appendChild(title);
  body.appendChild(controlsDiv);
  //body.appendChild(headerLine);
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
      collapse.classList.remove('show');
    } else if (nombres.includes(texto)) {
      item.style.display = '';
      collapse.classList.add('show');
    } else {
      item.style.display = 'none';
      collapse.classList.remove('show');
    }
  });
}

function resetearBuscador() {
  const buscador = document.getElementById('buscador');
  buscador.value = "";
  buscador.focus();
  filtrarCategorias();
}

// Permitir buscar al pulsar Enter
document.getElementById('buscador').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') filtrarCategorias();
});

document.addEventListener('click', async (event) => {
  const icon = event.target.closest('.bi-list-ol');
  if (!icon || icon.classList.contains('legend-icon')) return;

  const compId = icon.dataset.compId;
  const categoryName = icon.dataset.categoryName;
  const styleName = icon.dataset.styleName;
  const startTime = icon.dataset.start;
  const eventId = getEvent().id; // tu función existente

  const modalTitle = document.getElementById('styleDancersModalLabel');
  modalTitle.textContent = `${translations["competition"]}: ${categoryName} / ${styleName}`;

  // Mostrar hora de inicio (si existe en el dataset)
  const estimatedStartEl = document.getElementById('estimatedStart');
  if (startTime && startTime != 'null') {
    estimatedStartEl.textContent = startTime;
  } else {
    estimatedStartEl.textContent = translations["not_defined"];
  }

  const list = document.getElementById('styleDancersList');
  list.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE_URL}/api/competitions/${compId}/dancers?event_id=${eventId}`);
    if (!res.ok) throw new Error('Error fetching dancers');
    const dancers = await res.json();

    dancers.forEach(dancer => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex align-items-center';
      li.innerHTML = `        
        <span class="badge bg-info me-2 ">#${dancer.position}</span>
        <img src="https://flagsapi.com/${dancer.nationality}/shiny/24.png" class="me-2" style="width: 24px;" />
        <span class="dancer-name">${dancer.name || dancer.dancer_name}</span>
      `;
      list.appendChild(li);
    });

    const modalEl = document.getElementById('styleDancersModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

  } catch (err) {
    console.error('Error loading dancers:', err);
    list.innerHTML = '<li class="list-group-item text-danger">Error loading dancers</li>';
  }
});

