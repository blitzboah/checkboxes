document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('taskInput');
    const addTaskButton = document.getElementById('addTaskButton');
    const taskHeader = document.getElementById('taskHeader');
    const taskBody = document.getElementById('taskBody');
    const themeToggle = document.getElementById('themeToggle');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let db;
    let tasks = [];
    let isDarkTheme = localStorage.getItem('isDarkTheme') !== 'false';

    const initDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('HabitTracker', 2);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('tasks')) {
                    db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                }
                
                if (!db.objectStoreNames.contains('completions')) {
                    const completionsStore = db.createObjectStore('completions', { keyPath: 'id' });
                    completionsStore.createIndex('taskId', 'taskId', { unique: false });
                    completionsStore.createIndex('date', 'date', { unique: false });
                    completionsStore.createIndex('taskId_date', ['taskId', 'date'], { unique: true });
                }
            };
        });
    };

    const dbOperations = {
        getTasks: () => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['tasks'], 'readonly');
                const store = transaction.objectStore('tasks');
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        addTask: (task) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['tasks'], 'readwrite');
                const store = transaction.objectStore('tasks');
                const request = store.add(task);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        deleteTask: (taskId) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['tasks', 'completions'], 'readwrite');
                const taskStore = transaction.objectStore('tasks');
                const completionsStore = transaction.objectStore('completions');

                const deleteTask = taskStore.delete(taskId);
                
                const completionsIndex = completionsStore.index('taskId');
                const completionsRequest = completionsIndex.getAll(taskId);
                
                completionsRequest.onsuccess = () => {
                    const completions = completionsRequest.result;
                    completions.forEach(completion => {
                        completionsStore.delete(completion.id);
                    });
                };

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        },

        getCompletion: (taskId, date) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['completions'], 'readonly');
                const store = transaction.objectStore('completions');
                const index = store.index('taskId_date');
                const request = index.get([taskId, date]);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        setCompletion: (taskId, date, completed) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['completions'], 'readwrite');
                const store = transaction.objectStore('completions');
                const request = store.put({
                    id: `${taskId}_${date}`,
                    taskId,
                    date,
                    completed
                });

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        getAllCompletions: () => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['completions'], 'readonly');
                const store = transaction.objectStore('completions');
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
    };

    async function showConfirmationDialog(taskName) {
        return new Promise((resolve) => {
            const existingOverlay = document.querySelector('.overlay');
            if (existingOverlay) {
                document.body.removeChild(existingOverlay);
            }

            const overlay = document.createElement('div');
            overlay.className = 'overlay';
            
            const dialog = document.createElement('div');
            dialog.className = 'confirmation-dialog';
            
            dialog.innerHTML = `
                <p>delete "${taskName}"?</p>
                <button class="confirm-delete">delete</button>
                <button class="cancel-delete">cancel</button>
            `;
            
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    resolve(false);
                    document.body.removeChild(overlay);
                }
            });
            
            dialog.querySelector('.confirm-delete').addEventListener('click', () => {
                resolve(true);
                document.body.removeChild(overlay);
            });
            
            dialog.querySelector('.cancel-delete').addEventListener('click', () => {
                resolve(false);
                document.body.removeChild(overlay);
            });
            
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    resolve(false);
                    document.body.removeChild(overlay);
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
            
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            dialog.querySelector('button').focus();
        });
    }

    async function deleteTask(taskId, taskName) {
        const shouldDelete = await showConfirmationDialog(taskName);
        if (shouldDelete) {
            try {
                await dbOperations.deleteTask(taskId);
                await loadTasks();
                window.location.reload();
            } catch (error) {
                console.error('failed to delete task:', error);
                window.location.reload();
            }
        }
    }

    async function loadTasks() {
        try {
            tasks = await dbOperations.getTasks();
            const completions = await dbOperations.getAllCompletions();
            const completionsMap = new Map(
                completions.map(completion => [`${completion.taskId}_${completion.date}`, completion.completed])
            );

            while (taskHeader.children.length > 1) {
                taskHeader.removeChild(taskHeader.lastChild);
            }

            tasks.forEach((task) => {
                const taskHeaderCell = document.createElement('th');
                taskHeaderCell.textContent = task.name;
                
                const deleteButton = document.createElement('button');
                deleteButton.textContent = '×';
                deleteButton.className = 'delete-task';
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteTask(task.id, task.name);
                });
                
                taskHeaderCell.appendChild(deleteButton);
                taskHeader.appendChild(taskHeaderCell);
            });

            taskBody.innerHTML = '';
            const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            
            for (let date = new Date(startDate); date <= today; date.setDate(date.getDate() + 1)) {
                const dateRow = document.createElement('tr');
                const dateCell = document.createElement('td');
                dateCell.className = 'date-column';
                dateCell.textContent = date.toLocaleDateString('en-US', { 
                    month: 'short'.toLowerCase(), 
                    day: 'numeric'
                });
                dateRow.appendChild(dateCell);

                for (const task of tasks) {
                    const checkboxCell = document.createElement('td');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';

                    const dateStr = date.toISOString().split('T')[0];
                    const isCompleted = completionsMap.get(`${task.id}_${dateStr}`);
                    checkbox.checked = isCompleted || false;
                    checkbox.disabled = date.getTime() !== today.getTime();

                    checkbox.addEventListener('change', async () => {
                        try {
                            await dbOperations.setCompletion(task.id, dateStr, checkbox.checked);
                        } catch (error) {
                            console.error('failed to update completion:', error);
                            checkbox.checked = !checkbox.checked;
                            alert('refresh page.');
                        }
                    });

                    checkboxCell.appendChild(checkbox);
                    dateRow.appendChild(checkboxCell);
                }

                taskBody.appendChild(dateRow);
            }
        } catch (error) {
            console.error('failed to load tasks:', error);
            alert('refresh page.');
        }
    }

    async function addTask() {
        const taskName = taskInput.value.trim();
        if (!taskName) return;

        if (tasks.some(task => task.name === taskName)) {
            alert('This habit already exists!');
            return;
        }

        try {
            await dbOperations.addTask({ name: taskName });
            await loadTasks();
            taskInput.value = '';
        } catch (error) {
            console.error('Failed to add task:', error);
            alert('Failed to add task. Please try again.');
        }
    }

    function toggleTheme() {
        isDarkTheme = !isDarkTheme;
        document.body.classList.toggle('light-theme', !isDarkTheme);
        localStorage.setItem('isDarkTheme', isDarkTheme);
    }

    // Initialize app
    async function init() {
        try {
            await initDB();
            document.body.classList.toggle('light-theme', !isDarkTheme);
            await loadTasks();

            addTaskButton.addEventListener('click', addTask);
            taskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addTask();
            });
            themeToggle.addEventListener('click', toggleTheme);
        } catch (error) {
            console.error('Failed to initialize app:', error);
            alert('Failed to initialize the application. Please refresh the page.');
        }
    }

    init();
});