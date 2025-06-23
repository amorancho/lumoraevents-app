var title = 'Participants';

document.addEventListener('DOMContentLoaded', () => {

  loadParticipants();  
  
});

function loadParticipants() {
    const participantsContainer = document.getElementById('participantsContainer');
    const mockData = getMockParticipantsData(); // Simula la obtención de datos
    
    // Limpiar el contenedor
    participantsContainer.innerHTML = '';
    
    // Iterar sobre las categorías y sus participantes
    Object.keys(mockData).forEach(category => {
        const categoryData = mockData[category];
        const categoryItem = createCategoryItem(category, categoryData);
        participantsContainer.appendChild(categoryItem);
    });
}

function getMockParticipantsData() {
    return {
        'Category A': [
            { name: 'Alice', id: 1, age: 25 },
            { name: 'Bob', id: 2, age: 30 }
        ],
        'Category B': [
            { name: 'Charlie', id: 3, age: 22 },
            { name: 'David', id: 4, age: 28 }
        ]
    };
}

function createCategoryItem(category, participants) {
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.dataset.nombres = category.toLowerCase();

    const header = document.createElement('h2');
    header.className = 'accordion-header';
    header.id = `heading-${category}`;

    const button = document.createElement('button');
    button.className = 'accordion-button collapsed';
    button.type = 'button';
    button.setAttribute('data-bs-toggle', 'collapse');
    button.setAttribute('data-bs-target', `#collapse-${category}`);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `collapse-${category}`);
    button.textContent = category;

    header.appendChild(button);
    item.appendChild(header);

    const collapse = document.createElement('div');
    collapse.id = `collapse-${category}`;
    collapse.className = 'accordion-collapse collapse';
    collapse.setAttribute('aria-labelledby', `heading-${category}`);
    collapse.setAttribute('data-bs-parent', '#participantsContainer');

    const body = document.createElement('div');
    body.className = 'accordion-body';

    participants.forEach(participant => {
        const p = document.createElement('p');
        p.textContent = `${participant.name} (ID: ${participant.id}, Age: ${participant.age})`;
        body.appendChild(p);
    });

    collapse.appendChild(body);
    item.appendChild(collapse);

    return item;
}

function filtrarCategorias() {
    const texto = document.getElementById('buscador').value.toLowerCase().trim();
    const items = document.querySelectorAll('.accordion-item');

    let hayCoincidencia = false;

    items.forEach(item => {
        const nombres = item.dataset.nombres.toLowerCase();
        const collapse = item.querySelector('.accordion-collapse');

        if (texto === "") {
        item.style.display = '';
        collapse.classList.remove('show');
        } else if (nombres.includes(texto)) {
        item.style.display = '';
        collapse.classList.add('show');
        hayCoincidencia = true;
        } else {
        item.style.display = 'none';
        collapse.classList.remove('show');
        }
    });
}

function resetearBuscador() {
    document.getElementById('buscador').value = "";
    filtrarCategorias(); // reutilizamos la misma funciónconst buscador = document.getElementById('buscador');
    buscador.value = "";
    buscador.focus(); // pone el cursor de nuevo en el input
    filtrarCategorias(); // restablece los acordeones
}

    // Permitir buscar al pulsar Enter
document.getElementById('buscador').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') filtrarCategorias();
});