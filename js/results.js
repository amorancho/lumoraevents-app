var title = 'Results';

document.addEventListener('DOMContentLoaded', () => {
    const categorySelect = document.getElementById('categorySelect');
    const resultsContainer = document.getElementById('resultsContainer');
  
    const mockData = {
      'Junior': {
        general: [
        { position: 1, name: 'Amina Hassan', country: 'EG', score: 93.5 },
        { position: 2, name: 'Lina Torres', country: 'ES', score: 92.0 },
        { position: 3, name: 'Zara Malik', country: 'IN', score: 91.2 },
        { position: 4, name: 'Sofia Chen', country: 'CN', score: 90.5 },
        { position: 5, name: 'Nora Haddad', country: 'FR', score: 89.3 },
        { position: 6, name: 'Lucía Romero', country: 'AR', score: 88.7 },
        { position: 7, name: 'Fatima Noor', country: 'PK', score: 87.9 },
        { position: 8, name: 'Yasmine Ali', country: 'MA', score: 86.5 },
        { position: 9, name: 'Nadia Karim', country: 'DZ', score: 85.2 },
        { position: 10, name: 'Camila Díaz', country: 'CL', score: 84.6 }
        ],
        styles: {
        'Oriental': [
            { position: 1, name: 'Amina Hassan', country: 'EG', score: 94.1 },
            { position: 2, name: 'Lina Torres', country: 'ES', score: 92.3 },
            { position: 3, name: 'Zara Malik', country: 'IN', score: 91.9 },
            { position: 4, name: 'Lucía Romero', country: 'AR', score: 89.5 },
            { position: 5, name: 'Nadia Karim', country: 'DZ', score: 87.1 }
        ],
        'Folklore': [
            { position: 1, name: 'Fatima Noor', country: 'PK', score: 90.7 },
            { position: 2, name: 'Sofia Chen', country: 'CN', score: 89.3 },
            { position: 3, name: 'Nora Haddad', country: 'FR', score: 88.8 },
            { position: 4, name: 'Camila Díaz', country: 'CL', score: 86.0 }
        ],
        'Fusión': [
            { position: 1, name: 'Yasmine Ali', country: 'MA', score: 92.2 },
            { position: 2, name: 'Zara Malik', country: 'IN', score: 90.1 },
            { position: 3, name: 'Lucía Romero', country: 'AR', score: 89.0 }
        ],
        'Saidi': [
            { position: 1, name: 'Sofia Chen', country: 'CN', score: 91.4 },
            { position: 2, name: 'Amina Hassan', country: 'EG', score: 90.9 },
            { position: 3, name: 'Yasmine Ali', country: 'MA', score: 89.7 },
            { position: 4, name: 'Nadia Karim', country: 'DZ', score: 87.6 }
        ],
        'Baladi': [
            { position: 1, name: 'Lina Torres', country: 'ES', score: 93.3 },
            { position: 2, name: 'Fatima Noor', country: 'PK', score: 91.2 },
            { position: 3, name: 'Camila Díaz', country: 'CL', score: 89.9 },
            { position: 4, name: 'Nora Haddad', country: 'FR', score: 88.5 }
        ]
        }
    },
      'Senior': {
        general: [
            { position: 1, name: 'Nadia Karim', country: 'MA', score: 95.4 },
            { position: 2, name: 'Camila Díaz', country: 'AR', score: 94.0 },
            { position: 3, name: 'Fatima Noor', country: 'PK', score: 92.3 },
            { position: 4, name: 'Leila Ahmed', country: 'EG', score: 91.5 },
            { position: 5, name: 'Soraya Bensalem', country: 'DZ', score: 90.2 },
            { position: 6, name: 'Mariana Silva', country: 'BR', score: 89.8 },
            { position: 7, name: 'Ines Bouazizi', country: 'TN', score: 88.6 },
            { position: 8, name: 'Samira Al-Masri', country: 'SA', score: 87.9 },
            { position: 9, name: 'Valeria Russo', country: 'IT', score: 86.7 },
            { position: 10, name: 'Aya Yamamoto', country: 'JP', score: 85.5 }
        ],
        styles: {
            'Oriental': [
            { position: 1, name: 'Nadia Karim', country: 'MA', score: 96.2 },
            { position: 2, name: 'Leila Ahmed', country: 'EG', score: 94.5 },
            { position: 3, name: 'Fatima Noor', country: 'PK', score: 93.1 },
            { position: 4, name: 'Samira Al-Masri', country: 'SA', score: 90.8 },
            { position: 5, name: 'Valeria Russo', country: 'IT', score: 89.0 }
            ],
            'Folklore': [
            { position: 1, name: 'Soraya Bensalem', country: 'DZ', score: 93.7 },
            { position: 2, name: 'Mariana Silva', country: 'BR', score: 92.6 },
            { position: 3, name: 'Camila Díaz', country: 'AR', score: 91.4 },
            { position: 4, name: 'Ines Bouazizi', country: 'TN', score: 90.2 }
            ],
            'Fusión': [
            { position: 1, name: 'Aya Yamamoto', country: 'JP', score: 92.1 },
            { position: 2, name: 'Fatima Noor', country: 'PK', score: 91.3 },
            { position: 3, name: 'Samira Al-Masri', country: 'SA', score: 90.5 }
            ],
            'Saidi': [
            { position: 1, name: 'Leila Ahmed', country: 'EG', score: 94.7 },
            { position: 2, name: 'Soraya Bensalem', country: 'DZ', score: 93.3 },
            { position: 3, name: 'Nadia Karim', country: 'MA', score: 92.6 },
            { position: 4, name: 'Camila Díaz', country: 'AR', score: 91.1 }
            ],
            'Baladi': [
            { position: 1, name: 'Ines Bouazizi', country: 'TN', score: 93.0 },
            { position: 2, name: 'Mariana Silva', country: 'BR', score: 91.8 },
            { position: 3, name: 'Valeria Russo', country: 'IT', score: 90.7 },
            { position: 4, name: 'Aya Yamamoto', country: 'JP', score: 89.4 }
            ]
        }
        }

    };
  
    // Rellenar dropdown
    Object.keys(mockData).forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
  
    categorySelect.addEventListener('change', () => {
      const selected = categorySelect.value;
      if (!selected || !mockData[selected]) return;
  
      resultsContainer.innerHTML = '';
  
      const data = mockData[selected];
      const columns = document.createElement('div');
      columns.className = 'row g-4';
  
      // Clasificación general
      columns.appendChild(createListGroup(`${selected} - General Classification`, data.general, true));
  
      // Clasificaciones por estilo
      for (const [style, dancers] of Object.entries(data.styles)) {
        columns.appendChild(createListGroup(`${selected} - ${style}`, dancers));
      }
  
      resultsContainer.appendChild(columns);
    });
  
    function createListGroup(title, list, isGeneral = false) {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6 col-lg-3';
      
        const listGroup = document.createElement('div');
        listGroup.className = `list-group shadow-sm ${isGeneral ? 'border-primary border-2' : ''}`;
      
        const header = document.createElement('div');
        header.className = `list-group-item active ${isGeneral ? 'bg-primary' : 'bg-secondary'} fs-6`;
        header.textContent = title;
        listGroup.appendChild(header);
      
        list.forEach(item => {
          let bgClass = '';
          let medal = '';
          let fontWeight = '';
          if (item.position === 1) {
            bgClass = 'bg-warning-subtle'; // oro
            medal = '🥇';
            fontWeight = 'fw-bold';
          } else if (item.position === 2) {
            bgClass = 'bg-secondary-subtle'; // plata
            medal = '🥈';
            fontWeight = 'fw-bold';
          } else if (item.position === 3) {
            bgClass = 'bg-light-subtle'; // bronce (neutro claro, pero 100% Bootstrap)
            medal = '🥉';
            fontWeight = 'fw-bold';
          }
      
          const li = document.createElement('div');
          li.className = `list-group-item d-flex justify-content-between align-items-center ${bgClass} fs-6 ${fontWeight}`;
      
          li.innerHTML = `
            <span class="me-2">${item.position}</span>
            <img src="https://flagsapi.com/${item.country}/shiny/24.png" class="me-2" alt="${item.country}">
            <span class="me-auto">${item.name} ${medal}</span>
            <span class="badge bg-light text-dark rounded-pill">${item.score.toFixed(1)}</span>
          `;
      
          listGroup.appendChild(li);
        });
      
        col.appendChild(listGroup);
        return col;
      }
      
      
  });
  