var title = 'Voting';

const allowedRoles = ["admin", "organizer"];

const mockCategories = [
    { id: 1, name: 'Solo' },
    { id: 2, name: 'Duo' }
  ];

  const mockStyles = {
    1: [{ id: '1a', name: 'Oriental' }, { id: '1b', name: 'Folklore' }],
    2: [{ id: '2a', name: 'Fusión' }]
  };

  const mockDancers = [
    { code: 'ES', name: 'Lucía Martínez', id: 1, order: 1 },
    { code: 'FR', name: 'Camille Dubois', id: 2, order: 2 },
    { code: 'IT', name: 'Giovanni Rossi', id: 3, order: 3 },
    { code: 'IQ', name: 'Fatima Al-Sabah', id: 4, order: 4 },
    { code: 'ES', name: 'Sofía García', id: 5, order: 5 }
  ];

  const criterios = [
    { key: 'choreography', label: 'Choreography' },
    { key: 'technique', label: 'Technique' },
    { key: 'occupation', label: 'Occupation' },
    { key: 'presence', label: 'Presence' },
    { key: 'interpretation', label: 'Interpretation' },
    { key: 'costume', label: 'Costume & Makeup' }
  ];

  

  mockCategories.forEach(cat => {
    categorySelect.add(new Option(cat.name, cat.id));
  });

  categorySelect.addEventListener('change', () => {
    const catId = categorySelect.value;
    styleSelect.innerHTML = '<option selected disabled>Select a style</option>';
    styleSelect.disabled = false;
    mockStyles[catId]?.forEach(style => {
      styleSelect.add(new Option(style.name, style.id));
    });
    checkFormReady();
  });

  styleSelect.addEventListener('change', checkFormReady);
  function checkFormReady() {
    getDancersBtn.disabled = !(categorySelect.value && styleSelect.value);
  }

  getDancersBtn.addEventListener('click', () => {
    dancersContainer.innerHTML = '';

    const title = `${categorySelect.options[categorySelect.selectedIndex].text} - 
                    ${styleSelect.options[styleSelect.selectedIndex].text}`;

    document.getElementById('dancersTitle').innerHTML = 

    `<div class="card mt-2 mb-2 border-start border-2 border-warning">
      <div class="card-body py-2">
        <h4 class="card-title mb-0 text-center">
          <span class="text-secondary">${categorySelect.options[categorySelect.selectedIndex].text} - ${styleSelect.options[styleSelect.selectedIndex].text}</span>
        </h4>
      </div>
    </div>`;

    mockDancers.forEach(dancer => {
      const col = document.createElement('div');
      col.className = 'col-12';

      const card = document.createElement('div');
      card.className = 'card shadow-sm participant-card';

      const body = document.createElement('div');
      body.className = 'card-body';

      body.innerHTML = `
        <h5 class="card-title d-flex align-items-center">
          <img src="https://flagsapi.com/${dancer.code}/shiny/24.png" class="me-2" style="vertical-align: middle;">
          <strong class="participant-name">${dancer.name}</strong>
          <span class="badge bg-secondary ms-2">#${dancer.order}</span>
        </h5>
        
        <!-- Fila de criterios -->
        <div class="row row-cols-2 row-cols-sm-3 row-cols-md-6 g-3 mt-3">
          ${criterios.map(c => `
            <div class="col">
              <label class="form-label">${c.label}</label>
              <input type="number" class="form-control score" 
                    name="${c.key}_${dancer.id}" 
                    min="0" max="10" step="0.1" required>
            </div>
          `).join('')}
        </div>

        <!-- Fila separada para total y botón -->
        <div class="row mt-3 align-items-end">
          <div class="col-6 col-md-2 mb-2">
            <label class="form-label">Total</label>
            <input type="number" class="form-control total bg-light" 
                  name="total_${dancer.id}" 
                  readonly>
          </div>
          <div class="col-6 col-md-6 mb-2">
            <button class="btn btn-success" onclick="sendVote(${dancer.id})">Send Votes</button>
          </div>
        </div>
      `;

      card.appendChild(body);
      col.appendChild(card);
      dancersContainer.appendChild(col);

      // Añadir evento a inputs para recalcular total
      setTimeout(() => {
        const inputs = col.querySelectorAll('.score');
        const totalInput = col.querySelector(`input[name="total_${dancer.id}"]`);
        inputs.forEach(input => {
          input.addEventListener('input', () => {
            const total = Array.from(inputs).reduce((sum, el) => sum + parseFloat(el.value || 0), 0);
            totalInput.value = total.toFixed(1);
          });
        });
      }, 0);
    });
  });

  function sendVote(dancerId) {
    const inputs = document.querySelectorAll(`[name$="_${dancerId}"].score`);
    const total = document.querySelector(`input[name="total_${dancerId}"]`).value;
    const scores = Array.from(inputs).reduce((obj, input) => {
      const key = input.name.split('_')[0];
      obj[key] = parseFloat(input.value || 0);
      return obj;
    }, {});
    scores.total = parseFloat(total);

    console.log(`Enviando votación para ${dancerId}:`, scores);
    alert(`Votes sent for dancer ${dancerId} ✔`);
    // fetch('/api/sendVotes', { method: 'POST', body: JSON.stringify(scores) })...
  }

document.addEventListener('DOMContentLoaded', () => {

  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const getDancersBtn = document.getElementById('getDancersBtn');
  const dancersContainer = document.getElementById('dancersContainer');

});