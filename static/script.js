// Initial State
let tasks = JSON.parse(localStorage.getItem('nexus_tasks')) || [
    {
        id: 'task-1',
        title: 'Design System Architecture',
        description: 'Create the core design tokens, color palette, and typography system.',
        priority: 'high',
        assignee: 'Alice',
        status: 'todo',
        team: 'Product Design',
        date: new Date().toLocaleDateString()
    },
    {
        id: 'task-2',
        title: 'User Authentication Flow',
        description: 'Design the login, signup, and password recovery screens.',
        priority: 'medium',
        assignee: 'Bob',
        status: 'inprogress',
        team: 'Product Design',
        date: new Date().toLocaleDateString()
    },
    {
        id: 'task-3',
        title: 'Dashboard Wireframes',
        description: 'Initial sketches and low-fidelity wireframes for the main dashboard.',
        priority: 'low',
        assignee: 'Charlie',
        status: 'done',
        team: 'Product Design',
        date: new Date().toLocaleDateString()
    }
];

// DOM Elements
const kanbanBoard = document.querySelector('.kanban-board');
const columns = document.querySelectorAll('.task-list');
const newTaskBtn = document.getElementById('newTaskBtn');
const taskModal = document.getElementById('taskModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');
const taskForm = document.getElementById('taskForm');
const teamSelect = document.getElementById('teamSelect');

// State tracking
let draggedTask = null;
let currentTeam = 'Product Design';

// Initialize the board
function initBoard() {
    renderTasks();
    updateCounts();
    setupDragAndDrop();
}

// Save to LocalStorage
function saveTasks() {
    localStorage.setItem('nexus_tasks', JSON.stringify(tasks));
    updateCounts();
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
        id: `task-${Date.now()}`,
        title,
        description,
        priority,
        assignee,
        status: 'todo', // Default status
        team: currentTeam,
        date: new Date().toLocaleDateString()
    };
    
    tasks.push(newTask);
    saveTasks();
    renderTasks();
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
    teamSelect.addEventListener('change', (e) => {
        currentTeam = e.target.value;
        renderTasks();
        updateCounts();
    });
}

// Navigation Logic
const navLinks = document.querySelectorAll('#mainNav a');
const appViews = document.querySelectorAll('.app-view');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Update active class on nav links
        document.querySelectorAll('#mainNav li').forEach(li => li.classList.remove('active'));
        e.currentTarget.parentElement.classList.add('active');
        
        // Show corresponding view
        const targetViewId = `view-${e.currentTarget.dataset.view}`;
        appViews.forEach(view => {
            if (view.id === targetViewId) {
                view.classList.add('active-view');
            } else {
                view.classList.remove('active-view');
            }
        });
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
