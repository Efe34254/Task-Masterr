// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
let db = null;
let firebaseInitialized = false;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(err => console.log("Persistence error:", err.code));
    firebaseInitialized = true;
} catch (err) {
    console.error("Firebase init failed:", err);
}

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    let pendingSync = JSON.parse(localStorage.getItem('pendingSync')) || [];
    let userId = localStorage.getItem('userId') || `user_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('userId', userId);
    
    const displayUserIdEl = document.getElementById('display-userid');
    if (displayUserIdEl) displayUserIdEl.innerText = userId;

    let userProfile = JSON.parse(localStorage.getItem('userProfile')) || { name: 'Jane Doe', email: 'jane.doe@example.com' };
    let currentFilter = 'all';
    let unsubscribeListener = null;

    // --- DOM Elements ---
    const views = document.querySelectorAll('.view');
    const navItems = document.querySelectorAll('.nav-item');
    const taskListContainer = document.getElementById('task-list-container');
    const recentTasksContainer = document.getElementById('recent-tasks-container');
    const taskForm = document.getElementById('add-task-form');
    const profileModal = document.getElementById('profile-modal');
    const addOverlay = document.getElementById('view-add');

    // --- Navigation ---
    function switchView(targetId) {
        views.forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(targetId);
        if (targetView) targetView.classList.add('active');
        
        navItems.forEach(item => {
            if(item.dataset.target === targetId) item.classList.add('active');
            else item.classList.remove('active');
        });

        if (targetId === 'view-dashboard') updateDashboard();
        if (targetId === 'view-tasks') renderTasks();
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.target));
    });

    document.getElementById('btn-add-quick').addEventListener('click', () => addOverlay.classList.add('active'));
    document.querySelector('.close-overlay').addEventListener('click', () => addOverlay.classList.remove('active'));
    document.getElementById('view-all-link').addEventListener('click', () => switchView('view-tasks'));

    // --- Profile Management ---
    function updateProfileUI() {
        const initials = userProfile.name.split(' ').map(n => n[0]).join('').toUpperCase();
        document.getElementById('dash-avatar').innerText = initials;
        document.getElementById('settings-avatar').innerText = initials;
        document.getElementById('dash-welcome').innerText = `Hello, ${userProfile.name.split(' ')[0]}!`;
        document.getElementById('settings-name').innerText = userProfile.name;
        document.getElementById('settings-email').innerText = userProfile.email;
        document.getElementById('edit-name').value = userProfile.name;
        document.getElementById('edit-email').value = userProfile.email;
    }

    document.getElementById('edit-profile-trigger').addEventListener('click', () => profileModal.classList.add('active'));
    document.getElementById('close-modal').addEventListener('click', () => profileModal.classList.remove('active'));
    
    document.getElementById('save-profile').addEventListener('click', () => {
        userProfile.name = document.getElementById('edit-name').value || userProfile.name;
        userProfile.email = document.getElementById('edit-email').value || userProfile.email;
        localStorage.setItem('userProfile', JSON.stringify(userProfile));
        updateProfileUI();
        profileModal.classList.remove('active');
    });

    // --- Sync System ---
    function addToPendingSync(action, data) {
        pendingSync.push({ action, data, timestamp: Date.now() });
        localStorage.setItem('pendingSync', JSON.stringify(pendingSync));
        updateSyncIndicator();
    }

    function updateSyncIndicator() {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            if (!navigator.onLine) {
                statusEl.innerText = `Offline - ${pendingSync.length} pending`;
                statusEl.style.color = "var(--danger)";
                document.body.classList.add('offline');
            } else {
                statusEl.innerText = "Online - Synced ✓";
                statusEl.style.color = "var(--success)";
                document.body.classList.remove('offline');
            }
        }
    }

    async function processPendingSync() {
        if (!navigator.onLine || !firebaseInitialized || pendingSync.length === 0) return;
        const toProcess = [...pendingSync];
        pendingSync = [];
        localStorage.setItem('pendingSync', JSON.stringify(pendingSync));

        for (const item of toProcess) {
            try {
                const docRef = db.collection('users').doc(userId).collection('tasks').doc(item.data.id.toString());
                if (item.action === 'add' || item.action === 'update') await docRef.set(item.data);
                else if (item.action === 'delete') await docRef.delete();
            } catch (err) {
                pendingSync.push(item);
            }
        }
        localStorage.setItem('pendingSync', JSON.stringify(pendingSync));
        updateSyncIndicator();
    }

    async function saveTask(task, isNew = true) {
        if (isNew) tasks.push(task);
        else {
            const idx = tasks.findIndex(t => t.id === task.id);
            if (idx >= 0) tasks[idx] = task;
        }
        localStorage.setItem('tasks', JSON.stringify(tasks));
        if (navigator.onLine && firebaseInitialized) {
            try { await db.collection('users').doc(userId).collection('tasks').doc(task.id.toString()).set(task); }
            catch (err) { addToPendingSync('update', task); }
        } else { addToPendingSync('update', task); }
    }

    async function deleteTask(taskId) {
        tasks = tasks.filter(t => t.id != taskId);
        localStorage.setItem('tasks', JSON.stringify(tasks));
        if (navigator.onLine && firebaseInitialized) {
            try { await db.collection('users').doc(userId).collection('tasks').doc(taskId.toString()).delete(); }
            catch (err) { addToPendingSync('delete', { id: taskId }); }
        } else { addToPendingSync('delete', { id: taskId }); }
    }

    function setupRealtimeListener() {
        if (!firebaseInitialized || unsubscribeListener) return;
        unsubscribeListener = db.collection('users').doc(userId).collection('tasks')
            .onSnapshot((snapshot) => {
                const cloudTasks = [];
                snapshot.forEach(doc => cloudTasks.push({ ...doc.data(), id: doc.id }));
                if (cloudTasks.length > 0 || snapshot.metadata.fromCache === false) {
                    tasks = cloudTasks;
                    localStorage.setItem('tasks', JSON.stringify(tasks));
                    renderTasks();
                    updateDashboard();
                }
            });
    }

    // --- Task Management ---
    function renderTasks() {
        if (!taskListContainer) return;
        taskListContainer.innerHTML = '';
        let filtered = tasks;
        if (currentFilter === 'pending') filtered = tasks.filter(t => !t.completed);
        else if (currentFilter === 'completed') filtered = tasks.filter(t => t.completed);
        else if (currentFilter !== 'all') filtered = tasks.filter(t => t.priority === currentFilter);

        if (filtered.length === 0) {
            taskListContainer.innerHTML = `<div class="empty-state" style="text-align:center; padding:40px; opacity:0.5"><p>No tasks found.</p></div>`;
            return;
        }
        filtered.sort((a, b) => new Date(a.date + ' ' + (a.time || '00:00')) - new Date(b.date + ' ' + (b.time || '00:00')));
        filtered.forEach(task => taskListContainer.appendChild(createTaskElement(task)));
    }

    function updateDashboard() {
        document.getElementById('stat-total').innerText = tasks.length;
        document.getElementById('stat-pending').innerText = tasks.filter(t => !t.completed).length;
        document.getElementById('dash-date').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

        if (!recentTasksContainer) return;
        recentTasksContainer.innerHTML = '';
        const recent = tasks.filter(t => !t.completed).sort((a, b) => b.id - a.id).slice(0, 3);
        if (recent.length === 0) recentTasksContainer.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.5">No pending tasks.</p>';
        else recent.forEach(task => recentTasksContainer.appendChild(createTaskElement(task)));
    }

    function createTaskElement(task) {
        const el = document.createElement('div');
        el.className = `task-item priority-${task.priority} ${task.completed ? 'is-completed' : ''}`;
        el.innerHTML = `
            <div class="task-main">
                <div class="task-check"><i class="fas ${task.completed ? 'fa-check' : ''}"></i></div>
                <div class="task-content">
                    <button class="btn-delete" data-id="${task.id}"><i class="fas fa-trash"></i></button>
                    <h4>${task.title}</h4>
                    <p>${task.desc || ''}</p>
                    <div class="task-meta">
                        <span><i class="far fa-calendar"></i> ${task.date || ''} ${task.time || ''}</span>
                        <span>${task.priority}</span>
                    </div>
                    ${task.location ? `<p class="small-text" style="margin-top:8px; color:var(--primary); font-weight:600;"><i class="fas fa-map-marker-alt"></i> ${task.location}</p>` : ''}
                </div>
            </div>
        `;
        
        el.querySelector('.task-check').addEventListener('click', async (e) => {
            e.stopPropagation();
            task.completed = !task.completed;
            await saveTask(task, false);
            renderTasks();
            updateDashboard();
        });

        el.querySelector('.btn-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteTask(task.id);
            renderTasks();
            updateDashboard();
        });
        
        return el;
    }

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTasks();
        });
    });

    // --- Location Feature ---
    let currentLocation = null;
    document.getElementById('btn-get-location').addEventListener('click', () => {
        if (!navigator.geolocation) return alert('Not supported');
        document.getElementById('location-display').innerText = "Locating...";
        navigator.geolocation.getCurrentPosition(async pos => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const data = await res.json();
                const city = data.address.city || data.address.town || data.address.province || "";
                const district = data.address.suburb || data.address.district || data.address.village || "";
                currentLocation = `${district}${district && city ? ', ' : ''}${city}`;
                document.getElementById('location-display').innerText = currentLocation || "Location found";
            } catch (err) {
                currentLocation = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
                document.getElementById('location-display').innerText = currentLocation;
            }
        }, () => {
            document.getElementById('location-display').innerText = "Location access denied";
        });
    });

    // --- ROBUST NOTIFICATION SYSTEM ---
    function triggerNotification(title, body) {
        if (localStorage.getItem('notifications') !== 'true') return;
        
        // 1. Show In-App Toast (Always works)
        showToast(`🔔 ${title}: ${body}`);

        // 2. Try System Notification
        if (!("Notification" in window)) return;

        if (Notification.permission === "granted") {
            // Use Service Worker for better background support
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(title, {
                        body: body,
                        icon: 'https://cdn-icons-png.flaticon.com/512/906/906334.png',
                        badge: 'https://cdn-icons-png.flaticon.com/512/906/906334.png',
                        vibrate: [200, 100, 200],
                        tag: 'task-master-notif',
                        renotify: true
                    });
                });
            } else {
                new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/906/906334.png' });
            }
        }
    }

    function checkReminders() {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().slice(0, 5);

        tasks.forEach(task => {
            if (!task.completed && !task.notified && task.date === todayStr && task.time === timeStr) {
                triggerNotification("Task Reminder! ⏰", task.title);
                task.notified = true;
                saveTask(task, false);
            }
        });
    }

    setInterval(checkReminders, 10000);

    const notifToggle = document.getElementById('toggle-notif');
    if (notifToggle) {
        notifToggle.checked = localStorage.getItem('notifications') === 'true';
        notifToggle.addEventListener('change', async (e) => {
            if (e.target.checked) {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    localStorage.setItem('notifications', 'true');
                    triggerNotification("Notifications Active", "You're all set! 🚀");
                } else {
                    e.target.checked = false;
                    localStorage.setItem('notifications', 'false');
                    alert("Please enable notifications in your browser settings to receive reminders.");
                }
            } else {
                localStorage.setItem('notifications', 'false');
            }
        });
    }

    // --- Form Submit ---
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newTask = {
            id: Date.now(),
            title: document.getElementById('task-title').value,
            desc: document.getElementById('task-desc').value,
            date: document.getElementById('task-date').value,
            time: document.getElementById('task-time').value,
            priority: document.getElementById('task-priority').value,
            location: currentLocation,
            completed: false,
            notified: false
        };
        await saveTask(newTask, true);
        triggerNotification("Task Saved", newTask.title);
        taskForm.reset();
        currentLocation = null;
        document.getElementById('location-display').innerText = '';
        addOverlay.classList.remove('active');
        updateDashboard();
        renderTasks();
    });

    // --- Settings & UI ---
    const darkToggle = document.getElementById('toggle-dark');
    darkToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', darkToggle.checked);
    });
    if (localStorage.getItem('darkMode') === 'true') {
        darkToggle.checked = true;
        document.body.classList.add('dark-mode');
    }

    document.getElementById('copy-userid').addEventListener('click', () => {
        const newId = prompt("Your Sync ID:", userId);
        if (newId && newId !== userId) {
            localStorage.setItem('userId', newId);
            location.reload();
        }
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm("Are you sure? This will delete all local data.")) {
            localStorage.clear();
            location.reload();
        }
    });

    window.addEventListener('online', () => { updateSyncIndicator(); processPendingSync(); });
    window.addEventListener('offline', () => updateSyncIndicator());

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('SW Registered');
        });
    }

    updateProfileUI();
    updateDashboard();
    setupRealtimeListener();
    processPendingSync();
    updateSyncIndicator();
});
