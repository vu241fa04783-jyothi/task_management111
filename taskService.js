import { API_URL } from "./apiConfig.js";

const STORAGE_KEY = "tasknest-local-data-v2";
const DB_FILE = "./db.json";

async function request(url, options = {}, timeout = 1200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });

        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        if (response.status === 204) return null;
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function readLocalData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

function writeLocalData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function seedLocalData() {
    const existing = readLocalData();
    if (existing) return existing;

    try {
        const response = await fetch(DB_FILE);
        if (response.ok) {
            const data = await response.json();
            writeLocalData(data);
            return data;
        }
    } catch {
        // Continue with an empty local database.
    }

    const empty = { tasks: [], users: [] };
    writeLocalData(empty);
    return empty;
}

export async function getTasks() {
    try {
        const tasks = await request(`${API_URL}/tasks`);
        const data = readLocalData() || { tasks: [], users: [] };
        data.tasks = tasks;
        writeLocalData(data);
        return tasks;
    } catch {
        const data = await seedLocalData();
        return data.tasks || [];
    }
}

export async function addTask(task) {
    try {
        return await request(`${API_URL}/tasks`, {
            method: "POST",
            body: JSON.stringify(task)
        });
    } catch {
        const data = await seedLocalData();
        const newTask = {
            ...task,
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
        };
        data.tasks.push(newTask);
        writeLocalData(data);
        return newTask;
    }
}

export async function updateTask(id, task) {
    try {
        return await request(`${API_URL}/tasks/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: JSON.stringify(task)
        });
    } catch {
        const data = await seedLocalData();
        const index = data.tasks.findIndex(item => String(item.id) === String(id));
        if (index === -1) throw new Error("Task not found");
        data.tasks[index] = { ...data.tasks[index], ...task, id: data.tasks[index].id };
        writeLocalData(data);
        return data.tasks[index];
    }
}

export async function deleteTask(id) {
    try {
        return await request(`${API_URL}/tasks/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });
    } catch {
        const data = await seedLocalData();
        data.tasks = data.tasks.filter(item => String(item.id) !== String(id));
        writeLocalData(data);
        return null;
    }
}

export async function getUsers() {
    try {
        const users = await request(`${API_URL}/users`);
        const data = readLocalData() || { tasks: [], users: [] };
        data.users = users;
        writeLocalData(data);
        return users;
    } catch {
        const data = await seedLocalData();
        return data.users || [];
    }
}

export function resetLocalData() {
    localStorage.removeItem(STORAGE_KEY);
}
