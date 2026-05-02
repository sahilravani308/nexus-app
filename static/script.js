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
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const channelList = document.getElementById('channelList');
const dmList = document.getElementById('dmList');
const editUserModal = document.getElementById('editUserModal');
const editUserForm = document.getElementById('editUserForm');




// State tracking
let draggedTask = null;
let currentTeam = 'Product Design';
let currentChannel = 'general';
let currentRecipient = null;



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

// Save to Backend (Update status)
async function updateTaskOnBackend(taskId, status) {
    try {
        await fetch('/api/tasks/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: taskId, status: status })
        });
        // We don't necessarily need to re-fetch everything if the drag was successful
        // but it ensures the global 'tasks' array stays in sync.
        const response = await fetch(`/api/tasks?team=${currentTeam}`);
        tasks = await response.json();
    } catch (err) {
        console.error('Failed to update task:', err);
    }
}

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
            
            const isAdmin = localStorage.getItem('nexus_role') === 'admin';
            const editBtn = isAdmin ? `<button class="icon-btn edit-user-btn" data-username="${user.username}" data-role="${user.role}" data-teams='${JSON.stringify(user.teams)}' style="margin-left: 10px;"><i class="fa-solid fa-pen-to-square"></i></button>` : '';

            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${getAvatar(user.username)}" class="avatar avatar-sm">
                    <span class="mytask-name">${user.username} ${editBtn}</span>
                </div>
                <span style="text-transform: capitalize;">${user.role}</span>
                <div>${teamBadges || '<span style="color: var(--text-muted)">No teams</span>'}</div>
                <span><span class="mytask-status status-done">Active</span></span>
            `;
            listContainer.appendChild(row);
        });

        // Add Edit Button listeners
        document.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openEditUserModal(btn.dataset);
            });
        });
    } catch (err) {
        console.error('Failed to fetch users:', err);
        listContainer.innerHTML = '<div class="mytask-row"><span style="color: var(--accent-danger)">Error loading directory.</span></div>';
    }
}

// User Edit Logic
function openEditUserModal(data) {
    document.getElementById('editTargetName').textContent = data.username;
    document.getElementById('editUsername').value = data.username;
    document.getElementById('editRole').value = data.role;
    
    const userTeams = JSON.parse(data.teams);
    document.querySelectorAll('input[name="editTeams"]').forEach(cb => {
        cb.checked = userTeams.includes(cb.value);
    });
    
    editUserModal.classList.add('active');
}

if (editUserForm) {
    editUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('editUsername').value;
        const role = document.getElementById('editRole').value;
        const teams = Array.from(document.querySelectorAll('input[name="editTeams"]:checked')).map(cb => cb.value);
        
        try {
            const res = await fetch('/api/users/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, role, teams })
            });
            const data = await res.json();
            alert(data.message);
            editUserModal.classList.remove('active');
            renderTeamDirectory();
            
            // If editing self, update local cache
            if (username === currentUser) {
                localStorage.setItem('nexus_role', role);
                localStorage.setItem('nexus_user_teams', JSON.stringify(teams));
                renderTeamSelect();
            }
        } catch (err) {
            console.error('Failed to update user:', err);
        }
    });
}

document.getElementById('closeEditUserModalBtn')?.addEventListener('click', () => editUserModal.classList.remove('active'));
document.getElementById('cancelEditUserBtn')?.addEventListener('click', () => editUserModal.classList.remove('active'));


// Render "Messages" view
async function renderMessages() {
    if (!chatMessages) return;
    
    try {
        let url = `/api/messages?user=${currentUser}`;
        if (currentRecipient) {
            url += `&recipient=${currentRecipient}`;
        } else {
            url += `&channel=${currentChannel}`;
        }
        
        const response = await fetch(url);
        const messages = await response.json();
        
        chatMessages.innerHTML = '';
        
        // Update header
        const chatTitle = document.querySelector('.chat-title h3');
        const chatDesc = document.querySelector('.chat-title p');
        if (chatTitle) {
            chatTitle.innerHTML = currentRecipient ? 
                `<img src="${getAvatar(currentRecipient)}" class="avatar avatar-sm"> ${currentRecipient}` : 
                `<i class="fa-solid fa-hashtag"></i> ${currentChannel}`;
        }
        if (chatDesc) {
            chatDesc.textContent = currentRecipient ? `Private conversation with ${currentRecipient}` : `Discussion for ${currentChannel}`;
        }
        
        if (messages.length === 0) {
            chatMessages.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No messages yet.</div>`;
        }
        
        messages.forEach(msg => {
            const isMe = msg.sender === currentUser;
            const msgEl = document.createElement('div');
            msgEl.classList.add('message-item');
            if (isMe) msgEl.classList.add('me');
            
            msgEl.innerHTML = `
                <img src="${getAvatar(msg.sender)}" class="avatar avatar-sm">
                <div class="message-content">
                    <div class="message-info">
                        <strong>${msg.sender}</strong>
                        <span>${msg.timestamp}</span>
                    </div>
                    <p>${msg.content}</p>
                </div>
            `;
            chatMessages.appendChild(msgEl);
        });
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
        renderMessagingSidebar();
    } catch (err) {
        console.error('Failed to fetch messages:', err);
    }
}

async function renderMessagingSidebar() {
    if (!channelList || !dmList) return;
    
    const userTeams = JSON.parse(localStorage.getItem('nexus_user_teams')) || [];
    const isAdmin = localStorage.getItem('nexus_role') === 'admin';
    
    // Render Channels (Restricted)
    const channels = ['general', 'Product Design', 'Engineering', 'Marketing'];
    channelList.innerHTML = '';
    channels.forEach(ch => {
        if (ch === 'general' || userTeams.includes(ch) || isAdmin) {
            const li = document.createElement('li');
            if (ch === currentChannel && !currentRecipient) li.classList.add('active');
            li.innerHTML = `<i class="fa-solid fa-hashtag"></i> ${ch}`;
            li.addEventListener('click', () => {
                currentChannel = ch;
                currentRecipient = null;
                renderMessages();
            });
            channelList.appendChild(li);
        }
    });

    // Render DMs
    try {
        const res = await fetch('/api/users');
        const users = await res.json();
        dmList.innerHTML = '';
        users.forEach(user => {
            if (user.username !== currentUser) {
                const li = document.createElement('li');
                if (user.username === currentRecipient) li.classList.add('active');
                li.innerHTML = `<img src="${getAvatar(user.username)}" class="avatar avatar-sm"> ${user.username}`;
                li.addEventListener('click', () => {
                    currentRecipient = user.username;
                    currentChannel = null;
                    renderMessages();
                });
                dmList.appendChild(li);
            }
        });
    } catch (err) {}
}

// Send Message
if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = chatInput.value.trim();
        if (!content) return;
        
        try {
            await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender: currentUser,
                    recipient: currentRecipient,
                    content: content,
                    channel: currentChannel
                })
            });
            chatInput.value = '';
            renderMessages();
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    });
}

// Render "Settings" view
function renderSettings() {
    const settingsUsername = document.getElementById('settingsUsername');
    const settingsAvatar = document.getElementById('settingsAvatar');
    
    if (settingsUsername) settingsUsername.value = currentUser;
    if (settingsAvatar) settingsAvatar.src = getAvatar(currentUser);
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
        
        updateTaskOnBackend(taskId, newStatus);
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

// Render teams authorized for the user
function renderTeamSelect() {
    if (!teamSelect) return;
    
    // Admins see all teams, members see only their teams
    const userRole = localStorage.getItem('nexus_role');
    const userTeams = JSON.parse(localStorage.getItem('nexus_user_teams')) || [];
    
    const allTeams = ['Product Design', 'Engineering', 'Marketing'];
    const visibleTeams = userRole === 'admin' ? allTeams : userTeams;
    
    teamSelect.innerHTML = '';
    visibleTeams.forEach(team => {
        const option = document.createElement('option');
        option.value = team;
        option.textContent = team;
        teamSelect.appendChild(option);
    });
    
    if (visibleTeams.length > 0) {
        currentTeam = visibleTeams[0];
        teamSelect.value = currentTeam;
    }
}

// Handle Team Change
if (teamSelect) {
    teamSelect.addEventListener('change', async (e) => {
        currentTeam = e.target.value;
        fetchTasks();
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
        } else if (viewName === 'messages') {
            renderMessages();
        } else if (viewName === 'settings') {
            renderSettings();
        }
    });
});

let currentUser = localStorage.getItem('nexus_user');
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const sidebarName = document.getElementById('sidebarName');
const sidebarAvatar = document.getElementById('sidebarAvatar');
const logoutBtn = document.getElementById('logoutBtn');

let messagePollInterval = null;

function checkAuth() {
    if (currentUser) {
        loginScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        sidebarName.textContent = currentUser;
        sidebarAvatar.src = getAvatar(currentUser);
        renderTeamSelect();
        initBoard();
        setupChannelListeners();
        
        // Start polling for messages if we're on the messages view
        startMessagePolling();
    } else {
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
        stopMessagePolling();
    }
}

function startMessagePolling() {
    if (messagePollInterval) clearInterval(messagePollInterval);
    messagePollInterval = setInterval(() => {
        const activeView = document.querySelector('.app-view.active-view');
        if (activeView && activeView.id === 'view-messages') {
            renderMessages();
        }
    }, 3000); // Poll every 3s
}

function stopMessagePolling() {
    if (messagePollInterval) clearInterval(messagePollInterval);
    messagePollInterval = null;
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('usernameInput').value.trim();
        if (username) {
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username })
                });
                const data = await res.json();
                
                if (data.success) {
                    currentUser = data.username;
                    localStorage.setItem('nexus_user', currentUser);
                    localStorage.setItem('nexus_role', data.role);
                    localStorage.setItem('nexus_user_teams', JSON.stringify(data.teams));
                    checkAuth();
                } else {
                    alert(data.message);
                }
            } catch (err) {
                console.error('Login failed:', err);
                alert('Connection error. Is the server running?');
            }
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
