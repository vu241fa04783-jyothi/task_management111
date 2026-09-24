import {
    getTasks,
    addTask,
    updateTask,
    deleteTask,
    getUsers
} from "./taskService.js";

let allTasks = [];
let users = [];
let editingTaskId = null;
let alarmPlaying = false;
let alarmDismissed = false;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

async function init() {
    setGreeting();
    setupNavigation();
    setupTheme();
    setupModalEvents();
    setupFilterEvents();
    setupDragAndDrop();
    setupAlarmEvents();

    try {
        users = await getUsers();
        populateUserFields();
        await loadTasks();
    } catch (error) {
        console.error(error);
        showToast("Start JSON Server, then refresh this page.");
    }
}

function setGreeting() {
    const hour = new Date().getHours();
    const text = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    $("greeting").textContent = `${text} 👋`;
}

function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
            button.classList.add("active");

            const section = button.dataset.section;
            const workspace = $("taskWorkspace");

            if (section === "overview") {
                window.scrollTo({ top: 0, behavior: "smooth" });
                return;
            }

            if (section === "tasks") {
                resetFilters();
                displayTasks(allTasks);
                workspace.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }

            if (section === "completed") {
                resetFilters();
                displayTasks(allTasks.filter(task => task.status === "completed"));
                workspace.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    });
}

function resetFilters() {
    $("searchInput").value = "";
    $("priorityFilter").value = "All";
    $("userFilter").value = "All";
    $("sortFilter").value = "none";
}

function setupTheme() {
    const saved = localStorage.getItem("tasknest-theme");

    if (saved === "dark") {
        document.body.classList.add("dark");
        $("themeBtn").textContent = "☀ Light mode";
    }

    $("themeBtn").addEventListener("click", () => {
        document.body.classList.toggle("dark");
        const dark = document.body.classList.contains("dark");
        $("themeBtn").textContent = dark ? "☀ Light mode" : "☾ Dark mode";
        localStorage.setItem("tasknest-theme", dark ? "dark" : "light");
    });
}

function setupModalEvents() {
    $("addTaskBtn").addEventListener("click", openAddModal);

    $("cancelBtn").addEventListener("click", closeTaskModal);
    $("cancelFormBtn").addEventListener("click", closeTaskModal);

    $("closeViewBtn").addEventListener("click", closeViewModal);
    $("closeDetailsBtn").addEventListener("click", closeViewModal);

    $("taskForm").addEventListener("submit", saveTask);

    document.querySelectorAll(".modal").forEach(modal => {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                modal.classList.remove("show");
                modal.setAttribute("aria-hidden", "true");
            }
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeTaskModal();
            closeViewModal();
        }
    });
}

function setupFilterEvents() {
    $("searchInput").addEventListener("input", applyFilters);
    $("priorityFilter").addEventListener("change", applyFilters);
    $("userFilter").addEventListener("change", applyFilters);
    $("sortFilter").addEventListener("change", applyFilters);

    $("clearFiltersBtn").addEventListener("click", () => {
        resetFilters();
        displayTasks(allTasks);
        showToast("Filters cleared");
    });
}

function setupDragAndDrop() {
    document.querySelectorAll(".task-list").forEach(list => {
        list.addEventListener("dragover", event => {
            event.preventDefault();
            list.classList.add("drag-over");
        });

        list.addEventListener("dragleave", () => {
            list.classList.remove("drag-over");
        });

        list.addEventListener("drop", async event => {
            event.preventDefault();
            list.classList.remove("drag-over");

            const id = event.dataTransfer.getData("taskId");
            const task = allTasks.find(item => String(item.id) === String(id));

            if (!task) return;

            const newStatus = list.dataset.status;

            if (task.status === newStatus) return;

            try {
                await updateTask(task.id, { ...task, status: newStatus });
                showToast("Task status updated");
                await loadTasks();
            } catch (error) {
                console.error(error);
                showToast("Could not update task");
            }
        });
    });
}

function setupAlarmEvents() {
    $("stopAlarmBtn").addEventListener("click", stopAlarm);
}

async function loadTasks() {
    allTasks = await getTasks();
    populateUserFields();
    displayTasks(allTasks);
    checkDueTodayTasks();
}

function populateUserFields() {
    const filter = $("userFilter");
    const assigned = $("taskAssignedTo");

    const names = users.length
        ? users.map(user => user.name)
        : ["Ananya", "Kiran", "Meera", "Rohan"];

    const currentFilter = filter.value;
    filter.innerHTML = `<option value="All">Everyone</option>`;
    assigned.innerHTML = `<option value="">Choose person</option>`;

    names.forEach(name => {
        filter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
        assigned.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
    });

    if (names.includes(currentFilter)) filter.value = currentFilter;
}

function displayTasks(tasks) {
    const containers = {
        todo: $("todoTasks"),
        "in-progress": $("progressTasks"),
        completed: $("completedTasks")
    };

    Object.values(containers).forEach(container => container.innerHTML = "");

    const counts = {
        todo: 0,
        "in-progress": 0,
        completed: 0
    };

    tasks.forEach(task => {
        const card = createTaskCard(task);
        const status = task.status || "todo";

        if (!containers[status]) return;

        containers[status].appendChild(card);
        counts[status]++;
    });

    Object.entries(counts).forEach(([status, count]) => {
        const id = status === "todo" ? "todoCount" :
            status === "in-progress" ? "progressCount" : "completedCount";
        $(id).textContent = count;
    });

    updateDashboard(tasks);
    $("visibleTaskCount").textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;

    renderEmptyStates(containers);
}

function createTaskCard(task) {
    const card = document.createElement("article");
    card.className = "task-card";
    card.draggable = true;
    card.dataset.id = task.id;

    const priorityClass = `priority-${String(task.priority || "Low").toLowerCase()}`;

    card.innerHTML = `
        <h5>${escapeHtml(task.title)}</h5>
        <p class="task-description">${escapeHtml(task.description)}</p>

        <div class="task-meta">
            <span class="priority-badge ${priorityClass}">${escapeHtml(task.priority || "Low")}</span>
            <span class="category-badge">${escapeHtml(task.category || "General")}</span>
        </div>

        <div class="task-details">
            <div><strong>Person:</strong> ${escapeHtml(task.assignedTo || "Unassigned")}</div>
            <div><strong>Due:</strong> ${escapeHtml(task.dueDate || "No date")}</div>
        </div>

        <label class="status-control">
            <span>Status</span>
            <select class="status-select" aria-label="Change task status">
                <option value="todo" ${task.status === "todo" ? "selected" : ""}>To do</option>
                <option value="in-progress" ${task.status === "in-progress" ? "selected" : ""}>In progress</option>
                <option value="completed" ${task.status === "completed" ? "selected" : ""}>Completed</option>
            </select>
        </label>

        <div class="task-actions">
            <button class="view-btn" type="button">View</button>
            <button class="edit-btn" type="button">Edit</button>
            <button class="delete-btn" type="button">Delete</button>
        </div>
    `;

    addDueDateWarning(card, task);

    card.querySelector(".view-btn").addEventListener("click", () => viewTask(task));
    card.querySelector(".edit-btn").addEventListener("click", () => openEditModal(task));
    card.querySelector(".delete-btn").addEventListener("click", () => deleteTaskHandler(task.id));
    card.querySelector(".status-select").addEventListener("change", event => {
        changeTaskStatus(task, event.target.value);
    });

    card.addEventListener("dragstart", event => {
        event.dataTransfer.setData("taskId", String(task.id));
    });

    return card;
}

function renderEmptyStates(containers) {
    const messages = {
        todo: ["Nothing queued", "Add a task to start your list."],
        "in-progress": ["Nothing in progress", "Drag a task here when you begin."],
        completed: ["No completed tasks", "Finished work will appear here."]
    };

    Object.entries(containers).forEach(([status, container]) => {
        if (container.children.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <strong>${messages[status][0]}</strong>
                    ${messages[status][1]}
                </div>
            `;
        }
    });
}

function addDueDateWarning(card, task) {
    if (task.status === "completed" || !task.dueDate) return;

    const today = startOfDay(new Date());
    const due = startOfDay(new Date(`${task.dueDate}T00:00:00`));
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    let text = "";
    let className = "";

    if (due < today) {
        card.classList.add("overdue");
        text = "Overdue";
        className = "overdue-label";
    } else if (due.getTime() === today.getTime()) {
        card.classList.add("due-today");
        text = "Due today";
        className = "today-label";
    } else if (due.getTime() === tomorrow.getTime()) {
        card.classList.add("due-soon");
        text = "Due tomorrow";
        className = "tomorrow-label";
    }

    if (text) {
        const label = document.createElement("span");
        label.className = `due-label ${className}`;
        label.textContent = text;
        card.appendChild(label);
    }
}

function updateDashboard(tasks) {
    const total = tasks.length;
    const progress = tasks.filter(task => task.status === "in-progress").length;
    const completed = tasks.filter(task => task.status === "completed").length;

    const today = startOfDay(new Date());
    const overdue = tasks.filter(task => {
        if (task.status === "completed" || !task.dueDate) return false;
        return startOfDay(new Date(`${task.dueDate}T00:00:00`)) < today;
    }).length;

    const percentage = total ? Math.round((completed / total) * 100) : 0;

    $("totalTasks").textContent = total;
    $("progressTasksStat").textContent = progress;
    $("completedTasksStat").textContent = completed;
    $("overdueTasks").textContent = overdue;
    $("completionPercentage").textContent = `${percentage}%`;
    $("progressFill").style.width = `${percentage}%`;

    $("progressText").textContent = total === 0
        ? "Start completing tasks to see your progress."
        : percentage === 100
            ? "Everything is complete. Great work!"
            : `${completed} of ${total} tasks completed. Keep going.`;
}

function applyFilters() {
    const search = $("searchInput").value.trim().toLowerCase();
    const priority = $("priorityFilter").value;
    const user = $("userFilter").value;
    const sort = $("sortFilter").value;

    let result = allTasks.filter(task => {
        const matchesSearch =
            !search ||
            String(task.title).toLowerCase().includes(search) ||
            String(task.description).toLowerCase().includes(search);

        const matchesPriority = priority === "All" || task.priority === priority;
        const matchesUser = user === "All" || task.assignedTo === user;

        return matchesSearch && matchesPriority && matchesUser;
    });

    if (sort === "priority") {
        const order = { High: 1, Medium: 2, Low: 3 };
        result.sort((a, b) => (order[a.priority] || 9) - (order[b.priority] || 9));
    } else if (sort === "dueDate") {
        result.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    } else if (sort === "title") {
        result.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    }

    displayTasks(result);
}

function openAddModal() {
    editingTaskId = null;
    $("modalTitle").textContent = "Create a new task";
    $("taskForm").reset();

    if (users[0]) $("taskAssignedTo").value = users[0].name;

    $("taskModal").classList.add("show");
    $("taskModal").setAttribute("aria-hidden", "false");
    $("taskTitle").focus();
}

function openEditModal(task) {
    editingTaskId = task.id;

    $("modalTitle").textContent = "Edit task";
    $("taskTitle").value = task.title;
    $("taskDescription").value = task.description;
    $("taskPriority").value = task.priority;
    $("taskAssignedTo").value = task.assignedTo;
    $("taskCategory").value = task.category || "Personal";
    $("taskDueDate").value = task.dueDate;

    $("taskModal").classList.add("show");
    $("taskModal").setAttribute("aria-hidden", "false");
}

function closeTaskModal() {
    $("taskModal").classList.remove("show");
    $("taskModal").setAttribute("aria-hidden", "true");
    $("taskForm").reset();
    editingTaskId = null;
}

async function saveTask(event) {
    event.preventDefault();

    const data = {
        title: $("taskTitle").value.trim(),
        description: $("taskDescription").value.trim(),
        priority: $("taskPriority").value,
        assignedTo: $("taskAssignedTo").value,
        category: $("taskCategory").value,
        dueDate: $("taskDueDate").value
    };

    try {
        if (editingTaskId === null) {
            await addTask({
                ...data,
                status: "todo"
            });
            showToast("New task added");
        } else {
            const oldTask = allTasks.find(task => String(task.id) === String(editingTaskId));
            await updateTask(editingTaskId, {
                ...oldTask,
                ...data
            });
            showToast("Task updated");
        }

        closeTaskModal();
        await loadTasks();
    } catch (error) {
        console.error(error);
        showToast("Could not save the task");
    }
}

async function changeTaskStatus(task, status) {
    try {
        await updateTask(task.id, { ...task, status });
        showToast("Task status updated");
        await loadTasks();
    } catch (error) {
        console.error(error);
        showToast("Could not update task status");
    }
}

async function deleteTaskHandler(id) {
    if (!confirm("Delete this task?")) return;

    try {
        await deleteTask(id);
        showToast("Task deleted");
        await loadTasks();
    } catch (error) {
        console.error(error);
        showToast("Could not delete the task");
    }
}

function viewTask(task) {
    $("viewTaskTitle").textContent = task.title;
    $("viewDescription").textContent = task.description;
    $("viewPriority").textContent = task.priority;
    $("viewAssignedTo").textContent = task.assignedTo;
    $("viewStatus").textContent = formatStatus(task.status);
    $("viewDueDate").textContent = task.dueDate;
    $("viewCategory").textContent = task.category || "General";

    $("viewTaskModal").classList.add("show");
    $("viewTaskModal").setAttribute("aria-hidden", "false");
}

function closeViewModal() {
    $("viewTaskModal").classList.remove("show");
    $("viewTaskModal").setAttribute("aria-hidden", "true");
}

function checkDueTodayTasks() {
    const today = formatDate(new Date());

    const dueToday = allTasks.filter(task =>
        task.status !== "completed" &&
        task.dueDate === today
    );

    if (dueToday.length && !alarmDismissed) {
        $("alarmMessage").textContent =
            `${dueToday.length} task${dueToday.length === 1 ? "" : "s"} need attention today.`;
        $("alarmBox").classList.add("show");
        startAlarm();
    } else if (!dueToday.length) {
        hideAlarm();
    }
}

function startAlarm() {
    if (alarmPlaying) return;

    const audio = $("alarmSound");
    audio.currentTime = 0;

    audio.play()
        .then(() => {
            alarmPlaying = true;
        })
        .catch(() => {
            // Browsers can block autoplay until the user interacts with the page.
        });
}

function stopAlarm() {
    const audio = $("alarmSound");
    audio.pause();
    audio.currentTime = 0;
    alarmPlaying = false;
    alarmDismissed = true;
    $("alarmBox").classList.remove("show");
}

function hideAlarm() {
    const audio = $("alarmSound");
    audio.pause();
    audio.currentTime = 0;
    alarmPlaying = false;
    $("alarmBox").classList.remove("show");
}

function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function formatStatus(status) {
    return status === "in-progress"
        ? "In progress"
        : status === "completed"
            ? "Completed"
            : "To do";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
