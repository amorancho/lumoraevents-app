var title = 'Welcome';

const formatFecha = (isoString) => {
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-GB', { month: 'short' }); // 'Sep'
    return `${day}-${month}`;
};

document.addEventListener('DOMContentLoaded', () => {

    if (!eventId) {
        const divEvents = document.getElementById('eventTableContainer');
        divEvents.classList.remove('d-none');

        fetch(`${API_BASE_URL}/api/event`)
            .then(response => {
            if (!response.ok) throw new Error(`Error fetching events: ${response.status}`);
            return response.json();
            })
            .then(data => {
                ecvents = data;
                const tableEvents = document.getElementById('eventsTable');
                tableEvents.innerHTML = '';   
                data.forEach(event => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${event.name}</td>
                        <td>${formatFecha(event.start)} / ${formatFecha(event.end)}</td>
                        <td class="text-end"><a href="index.html?eventId=${event.code}">Go to Event</a></td>
                    `;
                    tableEvents.appendChild(row);
                });        
            })
            .catch(error => {
            console.error('Failed to load events:', error);
            });

        const divPrincipal = document.getElementById('principalContainer');
        divPrincipal.classList.add('d-none');
    } else {
        updateElementProperty('event-logo', 'src', getEvent().eventLogo);

        updateElementProperty('configUrl', 'href', `?eventId=${eventId}`, false);
        updateElementProperty('votingUrl', 'href', `?eventId=${getEvent().id}`, false);
        updateElementProperty('participantsUrl', 'href', `?eventId=${getEvent().id}`, false);
        updateElementProperty('resultsUrl', 'href', `?eventId=${getEvent().id}`, false);
    }
    
});