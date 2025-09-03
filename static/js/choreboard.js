document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    // IMPORTANT: Change this to your Raspberry Pi's actual IP address!
    const API_BASE_URL = 'http://10.14.192.238:5001';

    // --- STATE MANAGEMENT ---
    // This object holds the local copy of the application state.
    // It will be kept in sync with the backend.
    let state = {
        users: [],
        masterChores: [],
        currentWeek: {
            prize: '',
            assignedChores: [],
            completedLog: []
        },
        activePage: 'home',
        modal: {
            isOpen: false,
            chore: null,
        }
    };

    // --- DOM ELEMENTS ---
    const appContainer = document.getElementById('app-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const pages = document.querySelectorAll('.page');
    const navButtons = document.querySelectorAll('.nav-btn');
    const scoresSection = document.getElementById('scores-section');
    const quickAddSection = document.getElementById('quick-add-section');
    const weeklyChoresSection = document.getElementById('weekly-chores-section');
    const scoreboardPrize = document.getElementById('scoreboard-prize');
    const scoreboardLeader = document.getElementById('scoreboard-leader');
    const scoreboardDetails = document.getElementById('scoreboard-details');
    const addChoreForm = document.getElementById('add-chore-form');
    const masterChoreList = document.getElementById('master-chore-list');
    const resetWeekForm = document.getElementById('reset-week-form');
    const userSelectModal = document.getElementById('user-select-modal');
    const userSelectButtons = document.getElementById('user-select-buttons');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const choreTypeSelect = document.getElementById('chore-type');
    const assignUserContainer = document.getElementById('assign-user-container');
    const assignUserSelect = document.getElementById('assign-user');

    // --- API HELPERS ---
    
    /**
     * A generic function to update the local state and re-render the UI.
     * @param {object} newState - The complete new state from the server.
     */
    function updateStateAndRender(newState) {
        state = { ...state, ...newState };
        render();
    }

    /**
     * A generic fetch function to handle API requests and errors.
     * @param {string} endpoint - The API endpoint to call (e.g., '/api/state').
     * @param {object} [options={}] - The options for the fetch request (method, headers, body).
     */
    async function apiRequest(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("API Request Failed:", error);
            loadingIndicator.innerHTML = `<p class="text-red-500">Error: Could not connect to the server. Is the Raspberry Pi on and the IP address correct?</p>`;
            loadingIndicator.style.display = 'block';
            appContainer.classList.add('hidden');
            return null;
        }
    }

    // --- RENDER FUNCTIONS ---
    // (These are mostly the same as before, they just read from the local `state` object)

    function render() {
        renderPage();
        renderScores();
        renderQuickAddChores();
        renderWeeklyChores();
        renderScoreboard();
        renderAdmin();
        renderModal();
    }

    function renderPage() {
        pages.forEach(page => page.classList.toggle('active', page.id === `${state.activePage}-page`));
        navButtons.forEach(btn => {
            const isActive = btn.dataset.page === state.activePage;
            btn.classList.toggle('bg-sky-500', isActive);
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('bg-white', !isActive);
            btn.classList.toggle('text-slate-600', !isActive);
        });
    }

    function renderScores() {
        scoresSection.innerHTML = '';
        const scores = calculateScores();
        scores.forEach(score => {
            const user = findUserById(score.userId);
            scoresSection.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm p-6">
                    <h2 class="text-xl font-bold text-slate-700">${user.name}</h2>
                    <p class="text-4xl font-bold text-sky-500 mt-2">${score.totalPoints}</p>
                </div>`;
        });
    }
    
    function renderQuickAddChores() {
        quickAddSection.innerHTML = '';
        state.masterChores.filter(c => c.type === 'repeatable').forEach(chore => {
            const button = document.createElement('button');
            button.className = 'bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-emerald-600 transition';
            button.textContent = `${chore.name} (+${chore.points})`;
            button.dataset.choreId = chore.id;
            button.addEventListener('click', handleQuickAddClick);
            quickAddSection.appendChild(button);
        });
    }

    function renderWeeklyChores() {
        weeklyChoresSection.innerHTML = '';
        state.users.forEach(user => {
            const userChores = state.currentWeek.assignedChores.filter(ac => ac.userId === user.id);
            const choreItemsHTML = userChores.map(assignedChore => {
                const chore = findChoreById(assignedChore.choreId);
                if (!chore) return '';
                return `
                    <div class="flex items-center justify-between mb-2">
                        <label for="chore-${chore.id}-${user.id}" class="flex items-center cursor-pointer ${assignedChore.completed ? 'line-through text-slate-400' : ''}">
                            <input type="checkbox" id="chore-${chore.id}-${user.id}" data-chore-id="${chore.id}" data-user-id="${user.id}"
                                class="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 weekly-chore-checkbox" ${assignedChore.completed ? 'checked' : ''}>
                            <span class="ml-3 text-lg">${chore.name}</span>
                        </label>
                        <span class="font-semibold text-slate-500">+${chore.points}</span>
                    </div>`;
            }).join('');

            const userChoreList = document.createElement('div');
            userChoreList.className = 'bg-white rounded-xl shadow-sm p-6';
            userChoreList.innerHTML = `
                <h3 class="text-xl font-bold mb-4">${user.name}'s Weekly Chores</h3>
                <div>${choreItemsHTML || '<p class="text-slate-500">No weekly chores assigned.</p>'}</div>`;
            weeklyChoresSection.appendChild(userChoreList);
        });
        document.querySelectorAll('.weekly-chore-checkbox').forEach(cb => cb.addEventListener('change', handleWeeklyChoreToggle));
    }

    function renderScoreboard() {
        const scores = calculateScores();
        const leader = scores.length > 0 ? scores.reduce((a, b) => a.totalPoints > b.totalPoints ? a : b) : null;
        scoreboardPrize.textContent = state.currentWeek.prize;
        scoreboardLeader.textContent = leader ? findUserById(leader.userId).name : 'Nobody yet';
        
        scoreboardDetails.innerHTML = '';
        state.users.forEach(user => {
            const userLog = state.currentWeek.completedLog.filter(log => log.userId === user.id);
            const userScore = scores.find(s => s.userId === user.id)?.totalPoints || 0;
            const logHTML = userLog.map(log => {
                const chore = findChoreById(log.choreId);
                return chore ? `<li class="flex justify-between"><span>${chore.name}</span><span class="font-medium">+${chore.points}</span></li>` : '';
            }).join('');

            scoreboardDetails.innerHTML += `
                <div>
                    <div class="border-b-2 border-slate-200 pb-2 mb-2 flex justify-between items-baseline">
                        <h3 class="text-xl font-bold">${user.name}</h3>
                        <p class="text-2xl font-bold text-sky-500">${userScore}</p>
                    </div>
                    <ul class="space-y-1 text-slate-600">${logHTML || '<li>No chores completed yet.</li>'}</ul>
                </div>`;
        });
    }
    
    function renderAdmin() {
        assignUserSelect.innerHTML = state.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
        masterChoreList.innerHTML = `<div class="space-y-2">${state.masterChores.map(chore => `
            <div class="flex justify-between items-center p-2 rounded ${chore.type === 'weekly' ? 'bg-amber-100' : 'bg-emerald-100'}">
                <span>${chore.name} (${chore.points} pts) - <span class="text-sm font-medium capitalize">${chore.type}</span></span>
                <button data-chore-id="${chore.id}" class="delete-chore-btn text-red-500 hover:text-red-700 font-bold">✖</button>
            </div>`).join('')}</div>`;
        document.querySelectorAll('.delete-chore-btn').forEach(btn => btn.addEventListener('click', handleDeleteChore));
    }

    function renderModal() {
        if (state.modal.isOpen) {
            userSelectButtons.innerHTML = state.users.map(user => 
                `<button data-user-id="${user.id}" class="user-select-btn bg-sky-500 text-white px-6 py-3 rounded-lg shadow-sm hover:bg-sky-600 transition text-lg font-semibold">${user.name}</button>`
            ).join('');
            document.querySelectorAll('.user-select-btn').forEach(btn => btn.addEventListener('click', handleUserSelection));
            userSelectModal.classList.remove('hidden');
            userSelectModal.classList.add('flex');
        } else {
            userSelectModal.classList.add('hidden');
            userSelectModal.classList.remove('flex');
        }
    }

    // --- EVENT HANDLERS ---

    function handleNavClick(e) {
        if (e.target.matches('.nav-btn')) {
            state.activePage = e.target.dataset.page;
            render();
        }
    }
    
    function handleQuickAddClick(e) {
        state.modal.isOpen = true;
        state.modal.chore = findChoreById(parseInt(e.target.dataset.choreId));
        renderModal();
    }
    
    async function handleUserSelection(e) {
        const payload = {
            logId: Date.now(),
            choreId: state.modal.chore.id,
            userId: parseInt(e.target.dataset.userId),
            timestamp: new Date().toISOString()
        };
        const newState = await apiRequest('/api/log_chore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        state.modal.isOpen = false;
        if (newState) updateStateAndRender(newState);
    }

    async function handleWeeklyChoreToggle(e) {
        const payload = {
            choreId: parseInt(e.target.dataset.choreId),
            userId: parseInt(e.target.dataset.userId),
            completed: e.target.checked,
            logId: Date.now(),
            timestamp: new Date().toISOString()
        };
        const newState = await apiRequest('/api/update_weekly_chore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (newState) updateStateAndRender(newState);
    }
    
    async function handleAddChoreSubmit(e) {
        e.preventDefault();
        const payload = {
            id: Date.now(),
            name: document.getElementById('chore-name').value,
            points: parseInt(document.getElementById('chore-points').value),
            type: choreTypeSelect.value
        };
        if (payload.type === 'weekly') {
            payload.assignedUserId = parseInt(assignUserSelect.value);
        }
        const newState = await apiRequest('/api/add_chore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (newState) {
            addChoreForm.reset();
            assignUserContainer.classList.add('hidden');
            updateStateAndRender(newState);
        }
    }
    
    async function handleDeleteChore(e) {
        const choreId = parseInt(e.target.dataset.choreId);
        const newState = await apiRequest('/api/delete_chore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ choreId })
        });
        if (newState) updateStateAndRender(newState);
    }
    
    async function handleResetWeekSubmit(e) {
        e.preventDefault();
        const prize = document.getElementById('next-prize').value;
        const newState = await apiRequest('/api/reset_week', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prize })
        });
        if (newState) {
            document.getElementById('next-prize').value = '';
            alert('New week has started!');
            state.activePage = 'home';
            updateStateAndRender(newState);
        }
    }

    // --- HELPER FUNCTIONS ---

    function calculateScores() {
        const scores = {};
        state.users.forEach(user => scores[user.id] = 0);
        state.currentWeek.completedLog.forEach(log => {
            const chore = findChoreById(log.choreId);
            if (chore) scores[log.userId] += chore.points;
        });
        return Object.entries(scores).map(([userId, totalPoints]) => ({ userId: parseInt(userId), totalPoints }));
    }

    function findUserById(id) { return state.users.find(u => u.id === id); }
    function findChoreById(id) { return state.masterChores.find(c => c.id === id); }

    // --- INITIALIZATION ---
    async function init() {
        // Attach static event listeners
        document.querySelector('header nav').addEventListener('click', handleNavClick);
        addChoreForm.addEventListener('submit', handleAddChoreSubmit);
        resetWeekForm.addEventListener('submit', handleResetWeekSubmit);
        modalCancelBtn.addEventListener('click', () => { state.modal.isOpen = false; renderModal(); });
        choreTypeSelect.addEventListener('change', () => assignUserContainer.classList.toggle('hidden', choreTypeSelect.value !== 'weekly'));

        // Fetch initial state from the server
        const initialState = await apiRequest('/api/state');
        if (initialState) {
            loadingIndicator.style.display = 'none';
            appContainer.classList.remove('hidden');
            updateStateAndRender(initialState);
        }
    }

    init();
});
