
//var title = 'Results';
let categoryName;

let autoRefreshInterval = null;


document.addEventListener('DOMContentLoaded', async () => {
  //await eventReadyPromise;
  await WaitEventLoaded();

  if (!getEvent().visibleResults && getUserFromToken().role != "admin") {
      alert('Esta página no es visible en estos momentos');
      window.location.href = 'home.html?eventId='+eventId;
      return;
  }

  const categorySelect = document.getElementById('categorySelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const categoriaBadge = document.getElementById('categoriaBadge');
  const infoText = document.getElementById('infoText');
  const resultsContainer = document.getElementById('resultsContainer');
  const autoRefreshToggle = document.getElementById("autoRefreshToggle");
  const autoRefreshLabel = document.getElementById("autoRefreshLabel");

  refreshBtn.disabled = true;
  autoRefreshToggle.disabled = true;

  autoRefreshLabel.textContent += ` (${getEvent().autoRefreshMin || 2} min)`;

  // Inicializar modal (si existe)
  const votingModalEl = document.getElementById('votingDetailsModal');
  let votingModal = null;
  const detailsContainer = document.getElementById('votingDetailsContainer');
  if (votingModalEl) votingModal = new bootstrap.Modal(votingModalEl);

  categorySelect.addEventListener('change', async (e) => {
    const categoryId = e.target.value;
    if (categoryId) {
      refreshBtn.disabled = false;
      autoRefreshToggle.disabled = false;
      categoryName = categorySelect.options[categorySelect.selectedIndex].text;
      if (categoriaBadge) {
        categoriaBadge.textContent = categoryName;
        categoriaBadge.classList.remove('d-none');
      }
      if (infoText) {
        infoText.classList.remove('d-none');
        infoText.classList.add('d-block');
      }
      await loadClasifications(categoryId);
    }
  });

  refreshBtn.addEventListener('click', () => {
    categorySelect.dispatchEvent(new Event('change'));
  });

  autoRefreshToggle.addEventListener("change", () => {
    // Si se activa
    if (autoRefreshToggle.checked) {
      // Llamada inmediata
      //categorySelect.dispatchEvent(new Event('change'));

      // Configurar intervalo cada 2 minutos (120000 ms)
      autoRefreshInterval = setInterval(() => {
        categorySelect.dispatchEvent(new Event('change'));
      }, 60000 * (getEvent().autoRefreshMin || 2));
    } else {
      // Si se desactiva, limpiar intervalo
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  });

  // CLICK GLOBAL: abrir modal solo si el click viene de una bailarina dentro de un bloque de estilo
  document.addEventListener('click', (event) => {
    const dancerEl = event.target.closest('.dancer-result');
    if (!dancerEl) return;
    const styleBlock = dancerEl.closest('.style-block');
    if (!styleBlock) return;

    if (!window.resultsData || !votingModal || !detailsContainer) return;

    const styleId = Number(styleBlock.dataset.styleId);
    const dancerId = Number(dancerEl.dataset.dancerId);

    const styleObj = (window.resultsData.styles || []).find(s => Number(s.style_id) === styleId);
    if (!styleObj) return;

    const dancerData = (styleObj.clasification || []).find(d => Number(d.dancer_id) === dancerId);
    if (!dancerData) return;

    // --- Contenido del modal ---
    detailsContainer.innerHTML = '';

    // Caja superior con categoría, estilo, bandera, nombre y total score
    const summaryCard = document.createElement('div');
    summaryCard.className = 'card mb-3 border-primary shadow-sm';
    summaryCard.innerHTML = `
      <div class="card-body">
        <div class="row align-items-center">
          <!-- IZQUIERDA: Category - Style y Bandera/Nombre -->
          <div class="col">
            <div class="fw-bold fs-2 text-primary mb-2">
              ${escapeHtml(categoryName || '-')} - ${escapeHtml(styleObj.style_name || '-')}
            </div>
            <div class="d-flex align-items-center gap-2">
              <img src="https://flagsapi.com/${dancerData.dancer_nationality}/shiny/24.png" width="24" height="24" alt="${dancerData.dancer_nationality}">
              <strong class="fs-5">${escapeHtml(dancerData.dancer_name || '-')}</strong>
            </div>
          </div>
          <!-- DERECHA: Total Score -->
          <div class="col-auto text-center">
            <span class="badge bg-success fs-4 py-2 px-3">
              ${Number(dancerData.total_score).toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    `;
    detailsContainer.appendChild(summaryCard);

    // Detalle por juez
    if (Array.isArray(dancerData.votes) && dancerData.votes.length > 0) {
      dancerData.votes.forEach(vote => {
        //const totalJudge = (vote.criteria || []).reduce((sum, c) => sum + (Number(c.score) || 0), 0);

        const judgeCard = document.createElement('div');
        judgeCard.className = 'card mb-3';
        judgeCard.innerHTML = `
          <div class="card-header d-flex justify-content-between align-items-center">
            <h6 class="mb-0 text-primary">${escapeHtml(vote.judge_name || 'Judge')}</h6>
            <span class="badge bg-primary fs-6">Total: ${Number(vote.judge_total_score ?? vote.total_score ?? 0).toFixed(1)}</span>
          </div>
          <div class="card-body">
            <div class="row">
              ${ (vote.criteria || []).map(c => {
                const percentageSuffix = (c.percentage != null && c.percentage !== '')
                  ? ` (${Number(c.percentage).toFixed(0)}%)`
                  : '';
                return `
                <div class="col-6 col-md-4 col-lg-4 mb-2">
                  <label class="form-label mb-1">${escapeHtml(c.name || '')}${percentageSuffix}</label>
                  <input type="number" class="form-control" value="${Number(c.score).toFixed(1)}" readonly>
                </div>
              `;
              }).join('') }
            </div>
          </div>
        `;
        detailsContainer.appendChild(judgeCard);
      });
    } else {
      const noVotes = document.createElement('p');
      noVotes.textContent = t('no_voting_details');
      detailsContainer.appendChild(noVotes);
    }

    // Título modal fijo
    const titleSpan = votingModalEl.querySelector('.modal-title span');
    if (titleSpan) {
      titleSpan.textContent = t('voting_details');
    }

    votingModal.show();
  });

  await ensureTranslationsReady();

  // Cargar categorias y preparar eventos
  loadCategories();

}); // end DOMContentLoaded

// ---- Helpers y funciones originales adaptadas ----

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const categories = await response.json();
    populateCategorySelect(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
}

function populateCategorySelect(categories) {  
  const categorySelect = document.getElementById('categorySelect');
  categorySelect.innerHTML = `<option selected disabled>${t('select_category')}</option>`;
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
}

async function loadClasifications(categoryId) {
  const resultsContainer = document.getElementById("resultsContainer");
  const refreshBtn = document.getElementById("refreshBtn");
  const categorySelect = document.getElementById("categorySelect");

  // Deshabilitar botones y mostrar estado de carga
  refreshBtn.disabled = true;
  categorySelect.disabled = true;
  const originalBtnText = refreshBtn.innerHTML;
  refreshBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> ${t('loading')}`;

  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/results?event_id=${getEvent().id}&category_id=${categoryId}`);
    
    if (!response.ok) throw new Error("Network error");
    const data = await response.json();
    window.resultsData = data; // guardamos la respuesta para uso global
    renderResults(data);
  } catch (err) {
    console.error("Error loading results:", err);
    resultsContainer.innerHTML = `<div class="alert alert-danger">Error loading results.</div>`;
  } finally {
    // Volver a habilitar y restaurar texto
    refreshBtn.disabled = false;
    categorySelect.disabled = false;
    refreshBtn.innerHTML = originalBtnText;
  }
}


function renderResults(data) {
  const resultsContainer = document.getElementById("resultsContainer");
  resultsContainer.innerHTML = ""; // limpiar

  if ((data.general.length === 0)  && (!data.styles || data.styles.length === 0)) {
    resultsContainer.innerHTML = `
      <div class="alert alert-info text-center">
        ${t('no_results')}
      </div>
    `;
    return;
  }
  
  const row = document.createElement("div");
  row.className = "row g-4 pt-2";

  let colStylesClass = 'col-12';

  // Si hay clasificación general, generamos columna
  if (getEvent().catClassification != 'NO') {

    // === GENERAL CLASSIFICATION ===
    const colGeneral = document.createElement("div");
    colGeneral.className = "col-12 col-lg-4";
    colGeneral.innerHTML = renderGeneralClassification(data.general || []);
    row.appendChild(colGeneral);

    colStylesClass = colStylesClass + ' col-lg-8';
  }

  // === STYLES CLASSIFICATIONS ===
  const colStyles = document.createElement("div");
  colStyles.className = colStylesClass;

  const stylesRow = document.createElement("div");
  stylesRow.className = "row g-4";

  (data.styles || []).forEach(style => {
    const styleCol = document.createElement("div");
    styleCol.className = "col-12 col-md-6 col-xl-4";
    styleCol.innerHTML = renderStyleClassification(style);
    stylesRow.appendChild(styleCol);
  });

  colStyles.appendChild(stylesRow);
  row.appendChild(colStyles);

  resultsContainer.appendChild(row);
}

function renderGeneralClassification(general) {
  if (!general || general.length === 0) {
    return `
      <div class="list-group shadow-sm border-primary border-2 h-100">
        <div class="list-group-item active bg-primary fs-5 text-center">${t('general_classification')}</div>
        <div class="list-group-item text-center text-muted">${t('no_results')}</div>
      </div>
    `;
  }

  let html = `
    <div class="list-group shadow-sm border-primary border-2 h-100">
      <div class="list-group-item active bg-primary fs-5 text-center">${t('general_classification')}</div>
  `;

  general.forEach((d, i) => {
    const medals = ["🥇", "🥈", "🥉"];
    const colors = ["warning", "secondary", "warning-subtle"];
    if (i < 3) {
      html += `
        <div class="row my-2">
          <div class="col-12${i === 0 ? "" : " col-6"}">
            <div class="card border-${colors[i]} shadow text-center">
              <div class="card-header bg-${colors[i]} text-${i === 2 ? "dark" : "white"} fs-4">${medals[i]} ${i+1}º ${t('place')}</div>
              <div class="card-body">
                <div class="d-flex justify-content-center align-items-center gap-2 mb-3">
                  <img src="https://flagsapi.com/${d.dancer_nationality}/shiny/24.png" width="24" height="24" alt="${d.dancer_nationality}">
                  <h3 class="mb-0 dancer-result">${escapeHtml(d.dancer_name)}</h3>
                </div>
                <p class="card-text fs-4">
                  🥇 ${d.num_oros || 0} &nbsp;|&nbsp; 🥈 ${d.num_platas || 0} &nbsp;|&nbsp; 🥉 ${d.num_bronces || 0}
                </p>
                <p class="fs-5 text-muted mb-0">
                  <strong>${t('total_score')}:</strong> ${Number(d.total_score).toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="list-group-item d-flex justify-content-between align-items-center fs-6">
          <span class="me-2">${d.position}</span>
          <img src="https://flagsapi.com/${d.dancer_nationality}/shiny/24.png" class="me-2" alt="${d.dancer_nationality}">
          <span class="me-auto dancer-result">${escapeHtml(d.dancer_name)}</span>
          <span class="mx-2 text-muted small">
            (${t('total_score')}: ${d.total_score ?? 0})
          </span>
          <span class="badge bg-light text-dark rounded-pill">
            🥇 ${d.num_oros || 0} | 🥈 ${d.num_platas || 0} | 🥉 ${d.num_bronces || 0}
          </span>
        </div>
      `;
    }
  });

  html += `</div>`;
  return html;
}

function renderStyleClassification(style) {
  // style block with data-style-id so we can detect clicks inside it
  if (!style || !style.clasification || style.clasification.length === 0) {
    return `
      <div class="list-group shadow-sm style-block" data-style-id="${style?.style_id || ''}">
        <div class="list-group-item active bg-secondary fs-5 text-center">${escapeHtml(style?.style_name || "Unknown Style")}</div>
        <div class="list-group-item text-center text-muted">${t('no_results')}</div>
      </div>
    `;
  }

  // build list-group and each dancer is a button with data-dancer-id and class dancer-result
  let html = `
    <div class="list-group shadow-sm style-block" data-style-id="${style.style_id}">
      <div class="list-group-item active bg-secondary fs-5 text-center">${escapeHtml(style.style_name)}</div>
  `;

  style.clasification.forEach((d, i) => {
    const medals = ["🥇", "🥈", "🥉"];
    const bg = i === 0 ? "bg-warning" : i === 1 ? "bg-secondary-subtle" : i === 2 ? "bg-warning-subtle" : "";
    const fw = i < 3 ? "fw-bold" : "";

    html += `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${bg} fs-6 ${fw} dancer-result" data-dancer-id="${d.dancer_id}">
        <span class="me-2">${i+1}</span>
        <img src="https://flagsapi.com/${d.dancer_nationality}/shiny/24.png" class="me-2" alt="${d.dancer_nationality}">
        <span class="me-auto">${escapeHtml(d.dancer_name)} ${i<3 ? medals[i] : ""}</span>
        <span class="badge bg-light text-dark rounded-pill">${Number(d.total_score).toFixed(1)}</span>
      </button>
    `;
  });

  html += `</div>`;
  return html;
}

// small helper to avoid injecting raw text into HTML
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

