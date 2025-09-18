var title = 'Competition Tracking';

const categorySelect = document.getElementById('categorySelect');

document.addEventListener('DOMContentLoaded', async () => {

  await eventReadyPromise;

  loadCategories();

  categorySelect.addEventListener('change', async (e) => {
    const categoryId = e.target.value;
    if (categoryId) {
      await loadCompetitions(categoryId);
    }
  });

});

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/categories?event_id=${getEvent().id}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const categories = await response.json();
    populateCategorySelect(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
}

function populateCategorySelect(categories) {  
  
  categorySelect.innerHTML = '<option selected disabled>Select a category</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
}

async function loadCompetitions(categoryId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/competitions/tracking?event_id=${getEvent().id}&category_id=${categoryId}`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const competitions = await response.json();
    renderCompetitions(competitions);
  } catch (error) {
    console.error('Error fetching competitions:', error);
  }
}

// 👇 Ejemplo de renderizado (ajústalo según tu HTML)
function renderCompetitions(competitions) {
  const container = document.getElementById('competitionsContainer');
  container.innerHTML = '';

  if (competitions.length === 0) {
    container.innerHTML = '<p>No competitions found for this category.</p>';
    return;
  }

  competitions.forEach(comp => {
    const div = document.createElement('div');
    div.classList.add('competition-item', 'mb-2', 'p-2', 'border');
    div.textContent = `${comp.category_name} (${comp.style_name})`;
    container.appendChild(div);
  });
}