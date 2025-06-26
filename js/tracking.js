var title = 'Competition Tracking';

const mockCategories = [
  { id: 1, name: 'Solo' },
  { id: 2, name: 'Duo' }
];

const mockStyles = {
  1: [{ id: '1a', name: 'Oriental' }, { id: '1b', name: 'Folklore' }],
  2: [{ id: '2a', name: 'Fusión' }]
};

const mockVotings = [
  {
    "category": "Solo",
    "style": "Oriental",
    "judges": ["Juez 1", "Juez 2", "Juez 3", "Juez 4", "Juez 5", "Juez 6"],
    "dancers": [
      {
        "name": "Alice",
        "code": "ES",
        "votes": [true, true, false, true, false, true]
      },
      {
        "name": "Beatriz",
        "code": "FR",
        "votes": [true, true, true, true, true, false]
      },
      {
        "name": "Clara",
        "code": "IT",
        "votes": [false, true, true, true, false, true]
      }
    ]
  },
  {
    "category": "Adult",
    "style": "Duo Folklore",
    "judges": ["Juez A", "Juez B", "Juez C", "Juez D"],
    "dancers": [  
      {
        "name": "David",
        "code": "ES",
        "votes": [true, false, true, true, true, true]
      },
      {
        "name": "Eva",
        "code": "FR",
        "votes": [true, true, true, false, true, false]
      },
      {
        "name": "Fernando",
        "code": "IT",
        "votes": [false, true, true, true, false, true]
      }
    ]
  }
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
  getCompetitionsBtn.disabled = !(categorySelect.value && styleSelect.value);
}

getCompetitionsBtn.addEventListener('click', () => {
  competitionsContainer.innerHTML = '';
  const title = `${categorySelect.options[categorySelect.selectedIndex].text} - 
                  ${styleSelect.options[styleSelect.selectedIndex].text}`;
  document.getElementById('competitionsTitle').innerHTML = 
  `<div class="card mt-2 mb-2 border-start border-2 border-warning">
    <div class="card-body py-2">
      <h4 class="card-title mb-0 text-center">
        <span class="text-secondary">${title}</span>
      </h4>
    </div>
  </div>`;

  const divCol = document.createElement('div');
  divCol.className = 'col-12';

  mockVotings.filter(v =>
    v.category === categorySelect.options[categorySelect.selectedIndex].text && 
    v.style === styleSelect.options[styleSelect.selectedIndex].text
  ).forEach(voting => {

    const tableResponsive = document.createElement("div");
    tableResponsive.className = "table-responsive";

    const table = document.createElement("table");
    table.className = "table table-bordered text-center align-middle";

    // Cabecera
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr class="table-light">
        <th>Bailarina</th>
        ${voting.judges.map(j => `<th>${j}</th>`).join("")}
      </tr>
    `;
    table.appendChild(thead);

    // Cuerpo
    const tbody = document.createElement("tbody");
    voting.dancers.forEach(dancer => {
    const row = document.createElement("tr");

    const cells = [
      `<td class="d-flex align-items-center ps-3">
          <img class="me-2" src="https://flagsapi.com/${dancer.code}/shiny/24.png">
          <span>${dancer.name}</span>
      </td>`,
      ...dancer.votes.map(v =>
        `<td><span class="${v ? 'text-success' : 'text-danger'}">${v ? "✓" : "✗"}</span></td>`
      )
    ];

    row.innerHTML = cells.join("");
    tbody.appendChild(row);
  });

    table.appendChild(tbody);    
    tableResponsive.appendChild(table);
    divCol.appendChild(tableResponsive);
    competitionsContainer.appendChild(divCol);
  });
    
});

document.addEventListener('DOMContentLoaded', () => {

  const categorySelect = document.getElementById('categorySelect');
  const styleSelect = document.getElementById('styleSelect');
  const getCompetitionsBtn = document.getElementById('getCompetitionsBtn');
  const competitionsContainer = document.getElementById('competitionsContainer');

});