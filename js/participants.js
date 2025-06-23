var title = 'Participants';

var totals = {
    categories: 3,  
    styles: 8,
    participants: 11
};

document.addEventListener('DOMContentLoaded', () => {

  loadParticipants();  
  
});

function loadParticipants() {
    const participantsContainer = document.getElementById('participantsContainer');
    const mockData = getMockParticipantsData(); 

    const numCategories = document.getElementById('numCat');
    const numStyles = document.getElementById('numSty');
    const numParticipants = document.getElementById('numPar');

    numCategories.textContent = totals.categories;
    numStyles.textContent = totals.styles;
    numParticipants.textContent = totals.participants;

    // Limpiar el contenedor
    participantsContainer.innerHTML = '';

    var i = 0;
    
    // Iterar sobre las categorías y sus participantes
    Object.keys(mockData).forEach(category => {
        const categoryData = mockData[category];
        const categoryItem = createCategoryItem(category, categoryData, ++i);
        participantsContainer.appendChild(categoryItem);
    });
}


function getMockParticipantsData() {
    return {
        'Baby Amateur': {
            styles: ['Raqs sharki', 'Baladi', 'Shaabi', 'Folklore', 'Fusion', 'Pop song', 'Drum CD', 'Live Drum'],
            participants: [
                { name: 'Alice', id: 1, nationality: 'ES', styles: ['Raqs sharki', 'Baladi', 'Fusion'] },
                { name: 'Bob', id: 2, nationality: 'FR', styles: ['Shaabi', 'Folklore', 'Pop song'] },
                { name: 'Grace', id: 7, nationality: 'DE', styles: ['Raqs sharki', 'Baladi', 'Fusion'] },
                { name: 'Hannah', id: 8, nationality: 'IT', styles: ['Raqs sharki', 'Baladi', 'Fusion'] }
            ]
        },
        'Baby Advenced': {
            styles: ['Raqs sharki', 'Baladi', 'Fusion', 'Pop song', 'Drum CD', 'Live Drum', 'Shaabi'],
            participants: [
                { name: 'Charlie', id: 3, nationality: 'US', styles: ['Raqs sharki', 'Fusion', 'Pop song'] },
                { name: 'David', id: 4, nationality: 'UK', styles: ['Baladi', 'Pop song', 'Drum CD'] },
                { name: 'Ivy', id: 9, nationality: 'CA', styles: ['Raqs sharki', 'Baladi', 'Fusion'] }
            ]
        },
        'Kid Amateur': {
            styles: ['Raqs sharki', 'Baladi', 'Shaabi', 'Folklore', 'Fusion', 'Pop song', 'Drum CD', 'Live Drum'],
            participants: [
                { name: 'Eve', id: 5, nationality: 'ES', styles: ['Raqs sharki', 'Shaabi', 'Fusion'] },
                { name: 'Frank', id: 6, nationality: 'FR', styles: ['Baladi', 'Folklore', 'Fusion'] },
                { name: 'Liam', id: 10, nationality: 'IT', styles: ['Raqs sharki', 'Baladi', 'Fusion'] },
                { name: 'Mia', id: 11, nationality: 'ES', styles: ['Raqs sharki', 'Baladi', 'Fusion'] }
            ]
        }
    };
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
            //collapse.setAttribute('data-bs-parent', '#participantsContainer');

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
                            thParticipant.textContent = 'Participant';
                            headerRow.appendChild(thParticipant);

                            categoryData.styles.forEach(style => {
                                const th = document.createElement('th');
                                th.textContent = style;
                                headerRow.appendChild(th);
                            });

                            thead.appendChild(headerRow);
                            table.appendChild(thead);

                            const tbody = document.createElement('tbody');
                            tbody.className = 'text-center text-success fw-bold';
                            

                            categoryData.participants.forEach(participant => {
                                const row = document.createElement('tr');
                                const tdParticipant = document.createElement('td');
                                tdParticipant.textContent = participant.name;
                                row.appendChild(tdParticipant);

                                categoryData.styles.forEach(style => {
                                    const td = document.createElement('td');
                                    const spanTd = document.createElement('span');
                                    spanTd.className = 'text-success';
                                    spanTd.textContent = participant.styles.includes(style) ? '✓' : '';
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