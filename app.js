// --- Firebase Configuration ---
// Kendi Firebase bilgilerinizi buraya yapıştırın
const firebaseConfig = {
  apiKey: "AIzaSyClQd5eimrK7Td_jt_IWiG0u1XgCScbHzo",
  authDomain: "task-master-5ce09.firebaseapp.com",
  projectId: "task-master-5ce09",
  storageBucket: "task-master-5ce09.firebasestorage.app",
  messagingSenderId: "948851318109",
  appId: "1:948851318109:web:c7904897d2590944401cb4",
  measurementId: "G-YVJD16J70K"
};

// Initialize Firebase
let db = null;
let firebaseInitialized = false;

try {
    if (firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    // Offline veri saklama (Persistence)
    db.enablePersistence({ synchronizeTabs: true })
        .catch(err => console.log("Persistence error:", err.code));
    firebaseInitialized = true;
} catch (err) {
    console.error("Firebase init failed (Config eksik olabilir):", err);
}

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    let pendingSync = JSON.parse(localStorage.getItem('pendingSync')) || [];
    
    // Kullanıcı ID oluşturma veya alma
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = `user_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('userId', userId);
    }
    
    const displayUserIdEl = document.getElementById('display-userid');
    if (displayUserIdEl) displayUserIdEl.innerText = userId;

    // Profil Bilgileri
    let userProfile = JSON.parse(localStorage.getItem('userProfile')) || { name: 'Jane Doe', email: 'jane.doe@example.com' };
    let currentFilter = 'all';
    let unsubscribeListener = null;

    // --- DOM Elements ---
    const views = document.querySelectorAll('.view');
    const navItems = document.querySelectorAll('.nav-item');
    const taskListContainer = document.getElementById('task-list-container');
    const recentTasksContainer = document.getElementById('recent-tasks-container');
    const taskForm = document.getElementById('add-task-form');
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

    // Hızlı Ekleme Butonu
    const btnAddQuick = document.getElementById('btn-add-quick');
    if(btnAddQuick) btnAddQuick.addEventListener('click', () => addOverlay.classList.add('active'));

    // Overlay Kapatma
    document.querySelectorAll('.close-overlay').forEach(btn => {
        btn.addEventListener('click', () => addOverlay.classList.remove('active'));
    });

    const viewAllLink = document.getElementById('view-all-link');
    if(viewAllLink) viewAllLink.addEventListener('click', () => switchView('view-tasks'));

    // --- Profile Management ---
    function updateProfileUI() {
        const initials = userProfile.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        
        const dashAvatar = document.getElementById('dash-avatar');
        if(dashAvatar) dashAvatar.innerText = initials;
        
        const settingsAvatar = document.getElementById('settings-avatar');
        if(settingsAvatar) settingsAvatar.innerText = initials;

        const dashWelcome = document.getElementById('dash-welcome');
        if(dashWelcome) dashWelcome.innerText = `Hello, ${userProfile.name.split(' ')[0]}!`;

        const settingsName = document.getElementById('settings-name');
        if(settingsName) settingsName.innerText = userProfile.name;

        const settingsEmail = document.getElementById('settings-email');
        if(settingsEmail) settingsEmail.innerText = userProfile.email;

        // Modal inputs
        const editName = document.getElementById('edit-name');
        if(editName) editName.value = userProfile.name;
        
        const editEmail = document.getElementById('edit-email');
        if(editEmail) editEmail.value = userProfile.email;
    }

    const saveProfileBtn = document.getElementById('save-profile');
    if(saveProfileBtn) {
        saveProfileBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('edit-name');
            const emailInput = document.getElementById('edit-email');
            
            userProfile.name = nameInput.value || userProfile.name;
            userProfile.email = emailInput.value || userProfile.email;
            
            localStorage.setItem('userProfile', JSON.stringify(userProfile));
            updateProfileUI();
            
            // Modalı kapat (Style.css ve HTML yapısına bağlı olarak)
            document.getElementById('profile-modal').style.display = 'none';
        });
    }

    // --- Sync System (Veri Senkronizasyonu) ---
    function addToPendingSync(action, data) {
        pendingSync.push({ action, data, timestamp: Date.now() });
        localStorage.setItem('pendingSync', JSON.stringify(pendingSync));
        updateSyncIndicator();
    }

    function updateSyncIndicator() {
        const statusEl = document.getElementById('connection-status');
        const offlineBanner = document.getElementById('offline-indicator');
        
        if (statusEl) {
            if (!navigator.onLine) {
                statusEl.innerText = `Offline - ${pendingSync.length} changes pending`;
                statusEl.style.color = "var(--danger)";
                if(offlineBanner) offlineBanner.style.display = 'block';
            } else {
                statusEl.innerText = "Online - All synced ✓";
                statusEl.style.color = "var(--success)";
                if(offlineBanner) offlineBanner.style.display = 'none';
            }
        }
    }

    async function processPendingSync() {
        if (!navigator.onLine || !firebaseInitialized || pendingSync.length === 0) return;
        
        const toProcess = [...pendingSync];
        // Kuyruğu temizle (başarısız olursa geri ekleriz)
        pendingSync = [];
        localStorage.setItem('pendingSync', JSON.stringify(pendingSync));

        for (const item of toProcess) {
            try {
                const docRef = db.collection('users').doc(userId).collection('tasks').doc(item.data.id.toString());
                if (item.action === 'add' || item.action === 'update') {
                    await docRef.set(item.data);
                } else if (item.action === 'delete') {
                    await docRef.delete();
                }
            } catch (err) {
                console.error("Sync error:", err);
                pendingSync.push(item); // Geri ekle
            }
        }
        localStorage.setItem('pendingSync', JSON.stringify(pendingSync));
        updateSyncIndicator();
    }

    // --- Task CRUD Operations ---
    async function saveTask(task, isNew = true) {
        // 1. Local Update
        if (isNew) {
            tasks.push(task);
        } else {
            const idx = tasks.findIndex(t => t.id === task.id);
            if (idx >= 0) tasks[idx] = task;
        }
        localStorage.setItem('tasks', JSON.stringify(tasks));
        
        // 2. Cloud Update
        if (navigator.onLine && firebaseInitialized) {
            try { 
                await db.collection('users').doc(userId).collection('tasks').doc(task.id.toString()).set(task); 
            } catch (err) { 
                addToPendingSync('update', task); 
            }
        } else { 
            addToPendingSync('update', task); 
        }
    }

    async function deleteTask(taskId) {
        // 1. Local Update
        tasks = tasks.filter(t => t.id != taskId);
        localStorage.setItem('tasks', JSON.stringify(tasks));
        
        // 2. Cloud Update
        if (navigator.onLine && firebaseInitialized) {
            try { 
                await db.collection('users').doc(userId).collection('tasks').doc(taskId.toString()).delete(); 
            } catch (err) { 
                addToPendingSync('delete', { id: taskId }); 
            }
        } else { 
            addToPendingSync('delete', { id: taskId }); 
        }
    }

    function setupRealtimeListener() {
        if (!firebaseInitialized || unsubscribeListener) return;
        
        unsubscribeListener = db.collection('users').doc(userId).collection('tasks')
            .onSnapshot((snapshot) => {
                const cloudTasks = [];
                snapshot.forEach(doc => cloudTasks.push({ ...doc.data(), id: doc.id }));
                
                // Cache'den gelmiyorsa veya veri varsa güncelle
                if (!snapshot.metadata.hasPendingWrites) {
                    tasks = cloudTasks;
                    localStorage.setItem('tasks', JSON.stringify(tasks));
                    renderTasks();
                    updateDashboard();
                }
            }, (error) => {
                console.log("Listen failed: ", error);
            });
    }

    // --- Render Logic (YENİ TASARIMA UYGUN) ---
    function createTaskElement(task) {
        const el = document.createElement('div');
        // Yeni CSS yapısına uygun sınıf ve yapı
        el.className = `task-item priority-${task.priority} ${task.completed ? 'is-completed' : ''}`;
        
        el.innerHTML = `
            <div class="task-check">
                <i class="fas ${task.completed ? 'fa-check' : ''}"></i>
            </div>
            
            <div class="task-content">
                <h4>${task.title}</h4>
                ${task.desc ? `<p>${task.desc}</p>` : ''}
                <div class="task-meta">
                    <span><i class="far fa-calendar"></i> ${task.date || 'No Date'} ${task.time || ''}</span>
                    ${task.location ? `<span><i class="fas fa-map-marker-alt"></i> ${task.location}</span>` : ''}
                </div>
            </div>

            <button class="btn-delete" data-id="${task.id}">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        // Checkbox Event
        el.querySelector('.task-check').addEventListener('click', async (e) => {
            e.stopPropagation(); // Kartın kendisine tıklamayı engelle
            task.completed = !task.completed;
            await saveTask(task, false);
            renderTasks();
            updateDashboard();
        });

        // Delete Event
        el.querySelector('.btn-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            if(confirm("Delete this task?")) {
                await deleteTask(task.id);
                renderTasks();
                updateDashboard();
            }
        });
        
        return el;
    }

    function renderTasks() {
        if (!taskListContainer) return;
        taskListContainer.innerHTML = '';
        
        let filtered = tasks;
        if (currentFilter === 'pending') filtered = tasks.filter(t => !t.completed);
        else if (currentFilter === 'completed') filtered = tasks.filter(t => t.completed);
        else if (currentFilter !== 'all') filtered = tasks.filter(t => t.priority === currentFilter);

        if (filtered.length === 0) {
            taskListContainer.innerHTML = `<div style="text-align:center; padding:40px; opacity:0.5; color:var(--text-muted)"><p>No tasks found.</p></div>`;
            return;
        }

        // Tarihe göre sırala
        filtered.sort((a, b) => {
            const dateA = new Date(a.date + ' ' + (a.time || '00:00'));
            const dateB = new Date(b.date + ' ' + (b.time || '00:00'));
            return dateA - dateB;
        });

        filtered.forEach(task => {
            taskListContainer.appendChild(createTaskElement(task));
        });
    }

    function updateDashboard() {
        const statTotal = document.getElementById('stat-total');
        const statPending = document.getElementById('stat-pending');
        
        if(statTotal) statTotal.innerText = tasks.length;
        if(statPending) statPending.innerText = tasks.filter(t => !t.completed).length;
        
        const dateEl = document.getElementById('dash-date');
        if(dateEl) dateEl.innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

        if (!recentTasksContainer) return;
        recentTasksContainer.innerHTML = '';
        
        // Son eklenen 3 pending görev
        const recent = tasks.filter(t => !t.completed)
                            .sort((a, b) => b.id - a.id) // ID'ye göre (yeni eklenenler)
                            .slice(0, 3);
                            
        if (recent.length === 0) {
            recentTasksContainer.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.5; color:var(--text-muted)">No pending tasks.</p>';
        } else {
            recent.forEach(task => recentTasksContainer.appendChild(createTaskElement(task)));
        }
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
    const btnLocation = document.getElementById('btn-get-location');
    if(btnLocation) {
        btnLocation.addEventListener('click', () => {
            if (!navigator.geolocation) return alert('Geolocation not supported');
            
            const locDisplay = document.getElementById('location-display');
            locDisplay.innerText = "Locating...";
            
            navigator.geolocation.getCurrentPosition(async pos => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                try {
                    // OpenStreetMap API ile adres bulma
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                    const data = await res.json();
                    
                    const city = data.address.city || data.address.town || data.address.province || "";
                    const district = data.address.suburb || data.address.district || "";
                    
                    currentLocation = `${district}${district && city ? ', ' : ''}${city}`;
                    if(!currentLocation) currentLocation = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
                    
                    locDisplay.innerText = currentLocation;
                } catch (err) {
                    currentLocation = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
                    locDisplay.innerText = currentLocation;
                }
            }, (err) => {
                console.error(err);
                document.getElementById('location-display').innerText = "Location access denied";
            });
        });
    }

    // --- NOTIFICATION SYSTEM (DÜZELTİLMİŞ) ---
    function triggerNotification(title, body) {
        // Eğer ayarlardan kapalıysa çık
        if (localStorage.getItem('notifications') !== 'true') return;
        
        // 1. Toast Mesajı Göster (Her zaman çalışır)
        showToast(`🔔 ${title}: ${body}`);

        // 2. Tarayıcı Bildirimi
        if (!("Notification" in window)) return;

        if (Notification.permission === "granted") {
            try {
                // Service Worker varsa onu kullan (Mobil uyumu için daha iyi)
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.ready.then(registration => {
                        registration.showNotification(title, {
                            body: body,
                            icon: 'https://cdn-icons-png.flaticon.com/512/906/906334.png',
                            vibrate: [200, 100, 200],
                            tag: 'task-reminder'
                        });
                    });
                } else {
                    // Fallback: Standart API
                    new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/906/906334.png' });
                }
            } catch (e) {
                console.log("Notification error:", e);
            }
        }
    }

    function checkReminders() {
        const now = new Date();
        
        // YEREL SAAT AYARLAMASI (Timezone Fix)
        // toISOString() kullanmak yerine yerel bileşenleri alıyoruz
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        tasks.forEach(task => {
            // Tamamlanmamış, bildirim gitmemiş ve zamanı gelmişse
            if (!task.completed && !task.notified && task.date === todayStr && task.time === timeStr) {
                triggerNotification("Task Reminder", task.title);
                task.notified = true; // Tekrar çalmaması için işaretle
                saveTask(task, false); // Durumu kaydet
            }
        });
    }

    // Her 5 saniyede bir kontrol et (Daha hassas)
    setInterval(checkReminders, 5000);

    // Bildirim İzni İsteme
    const notifToggle = document.getElementById('toggle-notif');
    if (notifToggle) {
        notifToggle.checked = localStorage.getItem('notifications') === 'true';
        notifToggle.addEventListener('change', async (e) => {
            if (e.target.checked) {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    localStorage.setItem('notifications', 'true');
                    triggerNotification("Notifications Active", "Setup complete! 🚀");
                } else {
                    e.target.checked = false;
                    localStorage.setItem('notifications', 'false');
                    alert("Please enable notifications in your browser settings.");
                }
            } else {
                localStorage.setItem('notifications', 'false');
            }
        });
    }

    // --- Form Submit ---
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const titleVal = document.getElementById('task-title').value;
        if(!titleVal) return;

        const newTask = {
            id: Date.now(),
            title: titleVal,
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

    // --- Settings Listeners ---
    const darkToggle = document.getElementById('toggle-dark');
    if(darkToggle) {
        darkToggle.addEventListener('change', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('darkMode', darkToggle.checked);
        });
        
        // Init state
        if (localStorage.getItem('darkMode') === 'true') {
            darkToggle.checked = true;
            document.body.classList.add('dark-mode');
        }
    }

    const copyUserIdBtn = document.getElementById('copy-userid');
    if(copyUserIdBtn) {
        copyUserIdBtn.addEventListener('click', () => {
            const newId = prompt("Enter Sync ID from another device to sync:", userId);
            if (newId && newId !== userId) {
                localStorage.setItem('userId', newId);
                // Yeni ID ile verileri çekmek için sayfayı yenile
                location.reload();
            }
        });
    }

    const resetBtn = document.getElementById('btn-reset');
    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("WARNING: This will delete all data on this device. Continue?")) {
                localStorage.clear();
                location.reload();
            }
        });
    }

    // --- Utility Functions ---
    window.addEventListener('online', () => { updateSyncIndicator(); processPendingSync(); });
    window.addEventListener('offline', () => updateSyncIndicator());

    function showToast(msg) {
        const toast = document.createElement('div');
        // Style.css'de .toast-msg sınıfı olmayabilir, inline style ekleyelim garanti olsun
        toast.className = 'toast-msg';
        toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #333; color: white; padding: 12px 24px; border-radius: 50px;
            font-size: 0.9rem; z-index: 5000; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: opacity 0.5s;
        `;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // --- Init ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('SW Registered'))
            .catch(err => console.log('SW Fail', err));
    }

    updateProfileUI();
    updateDashboard();
    setupRealtimeListener();
    processPendingSync();
    updateSyncIndicator();
});
