var title = 'Participants';

// Simula tu eventReadyPromise si existe
//const eventReadyPromise = Promise.resolve();

document.addEventListener('DOMContentLoaded', async () => {
  //await eventReadyPromise;
  await WaitEventLoaded();
  loadParticipants();  
});

async function loadParticipants() {
  const participantsContainer = document.getElementById('participantsContainer');
  const numCategories = document.getElementById('numCat');
  const numStyles = document.getElementById('numSty');
  const numParticipants = document.getElementById('numPar');

  let data;
  try {
    const res = await fetch(`${API_BASE_URL}/api/events/participants?event_id=${getEvent().id}`);
    if (!res.ok) throw new Error('Error fetching data');
    data = await res.json();
  } catch (err) {
    console.error('Error fetching participants:', err);
    participantsContainer.innerHTML = '<p class="text-danger">Error loading participants.</p>';
    return;
  }

  const totals = {
    categories: data.length,
    styles: new Set(),
    participants: 0
  };

  data.forEach(cat => {
    cat.styles.forEach(s => totals.styles.add(s.name));
    totals.participants += cat.participants.length;
  });

  numCategories.textContent = totals.categories;
  numStyles.textContent = totals.styles.size;
  numParticipants.textContent = totals.participants;

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

  const title = document.createElement('h3');
  const titleText = document.createElement('span');
  titleText.className = 'badge bg-warning';
  titleText.textContent = `Total Participants: ${categoryData.participants.length}`;
  title.appendChild(titleText);

  const tableDiv = document.createElement('div');
  tableDiv.className = 'table-responsive';

  const table = document.createElement('table');
  table.className = 'table table-bordered table-hover';
  const thead = document.createElement('thead');
  thead.className = 'table-light text-primary';
  const headerRow = document.createElement('tr');

  const thParticipant = document.createElement('th');
  thParticipant.className = 'text-center';
  thParticipant.textContent = 'Participant';
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
        icon.title = 'Ver bailarinas de este estilo';
        icon.dataset.compId = style.competition_id; // Se usará en el fetch
        icon.dataset.start = style.start;
        icon.dataset.categoryName = category;
        icon.dataset.styleName = style.name;
        th.appendChild(icon);
    } else {
        // Badge rojo "No Competition"
        const badge = document.createElement('span');
        badge.className = 'badge bg-danger d-block mt-1';
        badge.textContent = 'No Competition';
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
    badge.textContent = `${participant.styles.length} Styles`;

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
  if (!icon) return;

  const compId = icon.dataset.compId;
  const categoryName = icon.dataset.categoryName;
  const styleName = icon.dataset.styleName;
  const startTime = icon.dataset.start;
  const eventId = getEvent().id; // tu función existente

  const modalTitle = document.getElementById('styleDancersModalLabel');
  modalTitle.textContent = `Competition: ${categoryName} / ${styleName}`;

  // Mostrar hora de inicio (si existe en el dataset)
  const estimatedStartEl = document.getElementById('estimatedStart');
  if (startTime) {
    estimatedStartEl.textContent = startTime;
  } else {
    estimatedStartEl.textContent = 'N/A';
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

