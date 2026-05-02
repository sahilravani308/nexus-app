// Initial State
let tasks = [];


// DOM Elements
const kanbanBoard = document.querySelector('.kanban-board');
const columns = document.querySelectorAll('.task-list');
const newTaskBtn = document.getElementById('newTaskBtn');
const taskModal = document.getElementById('taskModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');
const taskForm = document.getElementById('taskForm');
const teamSelect = document.getElementById('teamSelect');
const manageTeamBtn = document.getElementById('manageTeamBtn');
const teamModal = document.getElementById('teamModal');
const closeTeamModalBtn = document.getElementById('closeTeamModalBtn');
const teamMemberForm = document.getElementById('teamMemberForm');
const memberListItems = document.getElementById('memberListItems');
const teamRoster = document.getElementById('teamRoster');


// State tracking
let draggedTask = null;
let currentTeam = 'Product Design';

// Initialize the board
function initBoard() {
    fetchTasks();
    setupDragAndDrop();
}

// Fetch from API
async function fetchTasks() {
    try {
        const response = await fetch(`/api/tasks?team=${currentTeam}`);
        tasks = await response.json();
        renderTasks();
        updateCounts();
    } catch (err) {
        console.error('Failed to fetch tasks:', err);
    }
}

// Save to Backend (Create only for now)
async function saveTaskToBackend(task) {
    try {
        await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });
        fetchTasks();
    } catch (err) {
        console.error('Failed to save task:', err);
    }
}

// Generate Avatar URL based on name
function getAvatar(name) {
    const colors = {
        'Alice': 'ec4899',
        'Bob': '14b8a6',
        'Charlie': 'f59e0b',
        'User': '6366f1'
    };
    const color = colors[name] || '6366f1';
    return `https://ui-avatars.com/api/?name=${name}&background=${color}&color=fff`;
}

// Create Task Element
function createTaskElement(task) {
    const el = document.createElement('div');
    el.classList.add('task-card');
    el.setAttribute('draggable', 'true');
    el.setAttribute('data-id', task.id);
    
    el.innerHTML = `
        <div class="task-tags">
            <span class="tag ${task.priority}">${task.priority}</span>
        </div>
        <h3>${task.title}</h3>
        <p>${task.description || 'No description provided.'}</p>
        <div class="task-footer">
            <div class="task-meta">
                <span><i class="fa-regular fa-calendar"></i> ${task.date}</span>
                <span><i class="fa-regular fa-comment"></i> 0</span>
            </div>
            <div class="assignee-wrapper" title="Change Assignee (Current: ${task.assignee})">
                <img src="${getAvatar(task.assignee)}" alt="${task.assignee}" class="avatar avatar-sm">
                <select class="assignee-select" data-id="${task.id}">
                    <option value="Alice" ${task.assignee === 'Alice' ? 'selected' : ''}>Alice</option>
                    <option value="Bob" ${task.assignee === 'Bob' ? 'selected' : ''}>Bob</option>
                    <option value="Charlie" ${task.assignee === 'Charlie' ? 'selected' : ''}>Charlie</option>
                    <option value="User" ${task.assignee === 'User' ? 'selected' : ''}>User</option>
                </select>
            </div>
        </div>
    `;

    // Drag events for individual task
    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragend', handleDragEnd);

    return el;
}

// Render all tasks
function renderTasks() {
    // Clear all columns
    columns.forEach(col => col.innerHTML = '');
    
    // Distribute tasks
    tasks.filter(t => (t.team || 'Product Design') === currentTeam).forEach(task => {
        const columnEl = document.getElementById(`${task.status}-list`);
        if (columnEl) {
            columnEl.appendChild(createTaskElement(task));
        }
    });
}

// Render "My Tasks" view
function renderMyTasks() {
    const listContainer = document.getElementById('mytasks-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    const myTasks = tasks.filter(t => t.assignee === currentUser);
    
    if (myTasks.length === 0) {
        listContainer.innerHTML = '<div class="mytask-row"><span style="color: var(--text-muted)">No tasks assigned to you.</span></div>';
        return;
    }
    
    myTasks.forEach(task => {
        const row = document.createElement('div');
        row.classList.add('mytask-row');
        row.innerHTML = `
            <span class="mytask-name">${task.title}</span>
            <span class="mytask-project">${task.team || 'Personal'}</span>
            <span class="tag ${task.priority}">${task.priority}</span>
            <span style="font-size: 13px; color: var(--text-muted)">${task.date}</span>
            <span><span class="mytask-status status-${task.status}">${task.status}</span></span>
        `;
        listContainer.appendChild(row);
    });
}

// Render "Team Directory" view
async function renderTeamDirectory() {
    const listContainer = document.getElementById('team-directory-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '<div class="mytask-row"><span style="color: var(--text-muted)">Loading directory...</span></div>';
    
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        
        listContainer.innerHTML = '';
        
        users.forEach(user => {
            const row = document.createElement('div');
            row.classList.add('mytask-row');
            row.style.gridTemplateColumns = '2fr 1fr 2fr 1fr';
            
            const teamBadges = user.teams.map(t => `<span class="badge" style="font-size: 10px; margin-right: 5px;">${t}</span>`).join('');
            
            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${getAvatar(user.username)}" class="avatar avatar-sm">
                    <span class="mytask-name">${user.username}</span>
                </div>
                <span style="text-transform: capitalize;">${user.role}</span>
                <div>${teamBadges || '<span style="color: var(--text-muted)">No teams</span>'}</div>
                <span><span class="mytask-status status-done">Active</span></span>
            `;
            listContainer.appendChild(row);
        });
    } catch (err) {
        console.error('Failed to fetch users:', err);
        listContainer.innerHTML = '<div class="mytask-row"><span style="color: var(--accent-danger)">Error loading directory.</span></div>';
    }
}

// Update task counters
function updateCounts() {
    const counts = { todo: 0, inprogress: 0, review: 0, done: 0 };
    
    tasks.filter(t => (t.team || 'Product Design') === currentTeam).forEach(task => {
        if(counts[task.status] !== undefined) {
            counts[task.status]++;
        }
    });

    for (const [status, count] of Object.entries(counts)) {
        const countEl = document.getElementById(`count-${status}`);
        if (countEl) countEl.textContent = count;
    }
}

// Drag and Drop Logic
function setupDragAndDrop() {
    columns.forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('dragleave', handleDragLeave);
        column.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedTask = this;
    setTimeout(() => this.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handleDragEnd() {
    this.classList.remove('dragging');
    draggedTask = null;
    
    columns.forEach(column => {
        column.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
}

function handleDragLeave() {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    if (draggedTask) {
        // Append visually
        this.appendChild(draggedTask);
        
        // Update state
        const taskId = draggedTask.dataset.id;
        const newStatus = this.parentElement.dataset.status;
        
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            tasks[taskIndex].status = newStatus;
            saveTasks();
        }
    }
}

// Modal Logic
function openModal() {
    taskModal.classList.add('active');
    document.getElementById('taskTitle').focus();
    
    // Set default assignee to current user
    const assigneeSelect = document.getElementById('taskAssignee');
    let optionExists = false;
    for(let i=0; i<assigneeSelect.options.length; i++) {
        if(assigneeSelect.options[i].value === currentUser) {
            optionExists = true;
            break;
        }
    }
    if (!optionExists && currentUser) {
        const newOption = new Option(currentUser, currentUser);
        assigneeSelect.add(newOption);
    }
    if (currentUser) {
        assigneeSelect.value = currentUser;
    }
}

function closeModal() {
    taskModal.classList.remove('active');
    taskForm.reset();
}

newTaskBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelTaskBtn.addEventListener('click', closeModal);

// Close modal on outside click
taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) {
        closeModal();
    }
});

// Handle Form Submission
taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDesc').value.trim();
    const priority = document.getElementById('taskPriority').value;
    const assignee = document.getElementById('taskAssignee').value;
    
    if (!title) return;
    
    const newTask = {
        title,
        description,
        priority,
        assignee,
        status: 'todo',
        team: currentTeam
    };
    
    saveTaskToBackend(newTask);
    closeModal();
});

// Handle Assignee Change
kanbanBoard.addEventListener('change', (e) => {
    if (e.target.classList.contains('assignee-select')) {
        const taskId = e.target.dataset.id;
        const newAssignee = e.target.value;
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            tasks[taskIndex].assignee = newAssignee;
            saveTasks();
            renderTasks(); // Re-render to update the avatar
        }
    }
});

// Handle Team Change
if (teamSelect) {
    teamSelect.addEventListener('change', async (e) => {
        const targetTeam = e.target.value;
        
        // Check Access
        try {
            const res = await fetch(`/api/team-access?user=${currentUser}&team=${targetTeam}`);
            const data = await res.json();
            
            if (data.access) {
                currentTeam = targetTeam;
                fetchTasks();
            } else {
                alert(`Access Denied: You are not a member of the ${targetTeam} team.`);
                teamSelect.value = currentTeam; // Revert
            }
        } catch (err) {
            console.error('Access check failed:', err);
        }
    });
}

// Team Management Logic
function openTeamModal() {
    teamModal.classList.add('active');
    updateMemberList();
}

function closeTeamModal() {
    teamModal.classList.remove('active');
}

async function updateMemberList() {
    if (!memberListItems) return;
    memberListItems.innerHTML = '<div style="color: var(--text-muted)">Loading...</div>';
    
    // In a real app, you'd fetch the team roster
    // For now, we'll just show a placeholder or fetch if we had the endpoint
    memberListItems.innerHTML = '<div style="color: var(--text-muted)">Members managed on server.</div>';
}

if (manageTeamBtn) manageTeamBtn.addEventListener('click', openTeamModal);
if (closeTeamModalBtn) closeTeamModalBtn.addEventListener('click', closeTeamModal);

if (teamMemberForm) {
    teamMemberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('newMemberName').value.trim();
        if (!username) return;
        
        try {
            const res = await fetch('/api/teams/add-member', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    admin: currentUser,
                    username: username,
                    team: currentTeam
                })
            });
            const data = await res.json();
            alert(data.message);
            document.getElementById('newMemberName').value = '';
            updateMemberList();
        } catch (err) {
            console.error('Failed to add member:', err);
        }
    });
}

// Navigation Logic
const navLinks = document.querySelectorAll('#mainNav a');
const appViews = document.querySelectorAll('.app-view');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        
        const viewName = e.currentTarget.dataset.view;
        
        // Update active class on nav links
        document.querySelectorAll('#mainNav li').forEach(li => li.classList.remove('active'));
        e.currentTarget.parentElement.classList.add('active');
        
        // Show corresponding view
        const targetViewId = `view-${viewName}`;
        appViews.forEach(view => {
            if (view.id === targetViewId) {
                view.classList.add('active-view');
            } else {
                view.classList.remove('active-view');
            }
        });

        // Trigger view-specific rendering
        if (viewName === 'dashboard') {
            renderTasks();
            updateCounts();
        } else if (viewName === 'mytasks') {
            renderMyTasks();
        } else if (viewName === 'team') {
            renderTeamDirectory();
        }
    });
});

// Auth State Logic
let currentUser = localStorage.getItem('nexus_user');
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const sidebarName = document.getElementById('sidebarName');
const sidebarAvatar = document.getElementById('sidebarAvatar');
const logoutBtn = document.getElementById('logoutBtn');

function checkAuth() {
    if (currentUser) {
        loginScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        sidebarName.textContent = currentUser;
        sidebarAvatar.src = getAvatar(currentUser);
        initBoard();
    } else {
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
}

if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('usernameInput').value.trim();
        if (username) {
            currentUser = username;
            localStorage.setItem('nexus_user', currentUser);
            checkAuth();
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('nexus_user');
        checkAuth();
    });
}

// Start application
document.addEventListener('DOMContentLoaded', checkAuth);
