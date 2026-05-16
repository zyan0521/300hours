const GOAL_HOURS = 300;
const GOAL_MS = GOAL_HOURS * 60 * 60 * 1000;

const STORAGE_KEYS = {
  tasks: "threeHundredHours.tasks",
  timer: "threeHundredHours.timer",
};

const listView = document.getElementById("list-view");
const timerView = document.getElementById("timer-view");
const taskList = document.getElementById("task-list");
const addTaskButton = document.getElementById("add-task-button");
const taskForm = document.getElementById("task-form");
const taskNameInput = document.getElementById("task-name");
const cancelTaskButton = document.getElementById("cancel-task");
const timerTaskName = document.getElementById("timer-task-name");
const timerTaskSelect = document.getElementById("timer-task-select");
const sessionTime = document.getElementById("session-time");
const timerTotal = document.getElementById("timer-total");
const timerPercent = document.getElementById("timer-percent");
const timerHint = document.getElementById("timer-hint");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");
const timerProgress = document.getElementById("timer-progress");
const tabListButton = document.getElementById("tab-list");
const tabTimerButton = document.getElementById("tab-timer");
const confirmModal = document.getElementById("confirm-modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalCancel = document.getElementById("modal-cancel");
const modalConfirm = document.getElementById("modal-confirm");

let tasks = loadTasks();
let timerState = loadTimer();
let activeTaskId = null;
let longPressTimer = null;
let longPressTaskId = null;
let pendingDeleteId = null;

function loadTasks() {
  const raw = localStorage.getItem(STORAGE_KEYS.tasks);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
}

function loadTimer() {
  const raw = localStorage.getItem(STORAGE_KEYS.timer);
  if (!raw) {
    return { running: false, taskId: null, startTime: null };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      running: Boolean(parsed.running),
      taskId: parsed.taskId || null,
      startTime: parsed.startTime || null,
    };
  } catch (error) {
    return { running: false, taskId: null, startTime: null };
  }
}

function saveTimer() {
  localStorage.setItem(STORAGE_KEYS.timer, JSON.stringify(timerState));
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatHoursMinutes(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatPercent(ms) {
  const percent = Math.min(ms / GOAL_MS, 1) * 100;
  return `${percent.toFixed(1)}%`;
}

function getTaskById(taskId) {
  return tasks.find((task) => task.id === taskId) || null;
}

function getActiveSessionMs() {
  if (!timerState.running || !timerState.startTime) {
    return 0;
  }
  return Date.now() - timerState.startTime;
}

function getLiveTotalMs(task) {
  if (timerState.running && timerState.taskId === task.id) {
    return task.totalMs + getActiveSessionMs();
  }
  return task.totalMs;
}

function showView(view) {
  const isList = view === "list";
  listView.classList.toggle("is-active", isList);
  timerView.classList.toggle("is-active", !isList);
  tabListButton.classList.toggle("is-active", isList);
  tabTimerButton.classList.toggle("is-active", !isList);
  document.body.classList.toggle("is-timer", !isList);
  if (!isList && timerState.running && !activeTaskId) {
    activeTaskId = timerState.taskId;
  }
}

function resetForm() {
  taskForm.classList.add("is-hidden");
  taskForm.reset();
}

function renderList() {
  taskList.innerHTML = "";

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "task-card";
    empty.textContent = "还没有任务，先创建一个试试。";
    taskList.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    const liveTotal = getLiveTotalMs(task);
    const remaining = Math.max(GOAL_MS - liveTotal, 0);
    const percent = Math.min(liveTotal / GOAL_MS, 1) * 100;

    const card = document.createElement("article");
    card.className = "task-card";
    card.dataset.id = task.id;

    const cardMain = document.createElement("div");
    cardMain.className = "card-main";

    const text = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = task.name;
    const subtitle = document.createElement("p");
    subtitle.className = "muted";
    subtitle.textContent = `已累计 ${formatHoursMinutes(liveTotal)}`;
    text.append(title, subtitle);

    const ring = document.createElement("div");
    ring.className = "ring";
    ring.style.setProperty("--progress", `${percent}%`);
    const ringLabel = document.createElement("span");
    ringLabel.textContent = formatPercent(liveTotal);
    ring.appendChild(ringLabel);

    cardMain.append(text, ring);

    const meta = document.createElement("div");
    meta.className = "card-meta";

    const remain = document.createElement("span");
    remain.textContent = `还差 ${formatHoursMinutes(remaining)}`;
    meta.appendChild(remain);

    if (timerState.running && timerState.taskId === task.id) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = "计时中";
      meta.appendChild(chip);
    }

    const openButton = document.createElement("button");
    openButton.className = "primary full";
    openButton.dataset.action = "open";
    openButton.dataset.id = task.id;
    openButton.textContent = "进入计时";

    card.append(cardMain, meta, openButton);
    taskList.appendChild(card);
  });
}

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressTaskId = null;
}

function deleteTask(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    return;
  }
  tasks = tasks.filter((item) => item.id !== taskId);
  if (timerState.running && timerState.taskId === taskId) {
    timerState = { running: false, taskId: null, startTime: null };
    saveTimer();
  }
  if (activeTaskId === taskId) {
    activeTaskId = null;
  }
  saveTasks();
  renderList();
  renderTimer();
  updateTitle();
}

function openDeleteModal(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    return;
  }
  pendingDeleteId = taskId;
  modalTitle.textContent = "删除任务";
  const isRunning = timerState.running && timerState.taskId === taskId;
  const extra = isRunning ? " 当前任务正在计时，删除会自动停止。" : "";
  modalBody.textContent = `将永久删除“${task.name}”，累计时长会被清除。${extra}`;
  confirmModal.classList.remove("is-hidden");
  document.body.classList.add("is-modal-open");
}

function closeDeleteModal() {
  confirmModal.classList.add("is-hidden");
  document.body.classList.remove("is-modal-open");
  pendingDeleteId = null;
}

function ensureActiveTask() {
  if (activeTaskId && !getTaskById(activeTaskId)) {
    activeTaskId = null;
  }
  if (timerState.running && timerState.taskId) {
    activeTaskId = timerState.taskId;
    return;
  }
  if (!activeTaskId && tasks.length > 0) {
    activeTaskId = tasks[0].id;
  }
}

function renderTaskSelect() {
  timerTaskSelect.innerHTML = "";

  if (tasks.length === 0) {
    activeTaskId = null;
    const option = new Option("选择任务", "", true, true);
    timerTaskSelect.append(option);
    timerTaskSelect.disabled = true;
    return;
  }

  ensureActiveTask();
  timerTaskSelect.disabled = false;
  tasks.forEach((task) => {
    const option = new Option(task.name, task.id);
    timerTaskSelect.appendChild(option);
  });
  timerTaskSelect.value = activeTaskId || tasks[0].id;
}

function renderTimer() {
  ensureActiveTask();
  renderTaskSelect();
  const task = activeTaskId ? getTaskById(activeTaskId) : null;
  if (!task) {
    const hasTasks = tasks.length > 0;
    timerTaskName.textContent = hasTasks ? "未选择任务" : "暂无任务";
    sessionTime.textContent = "00:00:00";
    timerTotal.textContent = "0h 0m";
    timerPercent.textContent = "0.0%";
    timerHint.textContent = hasTasks ? "请选择一个任务。" : "先去任务页创建任务。";
    timerProgress.style.setProperty("--timer-progress", "0%");
    startButton.disabled = true;
    stopButton.disabled = true;
    return;
  }

  const liveTotal = getLiveTotalMs(task);
  const isRunningThis = timerState.running && timerState.taskId === task.id;
  const hasOtherRunning = timerState.running && timerState.taskId !== task.id;

  timerTaskName.textContent = task.name;
  sessionTime.textContent = isRunningThis ? formatClock(getActiveSessionMs()) : "00:00:00";
  timerTotal.textContent = formatHoursMinutes(liveTotal);
  timerPercent.textContent = formatPercent(liveTotal);
  timerProgress.style.setProperty("--timer-progress", `${Math.min(liveTotal / GOAL_MS, 1) * 100}%`);

  if (hasOtherRunning) {
    const active = getTaskById(timerState.taskId);
    const name = active ? active.name : "其他任务";
    timerHint.textContent = `${name} 正在计时，请先停止。`;
  } else if (isRunningThis) {
    timerHint.textContent = "计时中...";
  } else {
    timerHint.textContent = "";
  }

  startButton.disabled = isRunningThis || hasOtherRunning;
  stopButton.disabled = !isRunningThis;
}

function updateTitle() {
  if (timerState.running) {
    const task = getTaskById(timerState.taskId);
    const label = task ? task.name : "计时中";
    document.title = `${formatClock(getActiveSessionMs())} · ${label}`;
  } else {
    document.title = "三百小时计划";
  }
}

function tick() {
  if (!timerState.running) {
    return;
  }
  renderTimer();
  renderList();
  updateTitle();
}

addTaskButton.addEventListener("click", () => {
  taskForm.classList.toggle("is-hidden");
  if (!taskForm.classList.contains("is-hidden")) {
    taskNameInput.focus();
  }
});

cancelTaskButton.addEventListener("click", () => {
  resetForm();
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = taskNameInput.value.trim();
  if (!name) {
    return;
  }
  const newTask = {
    id: `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`,
    name,
    totalMs: 0,
    createdAt: Date.now(),
  };
  tasks.unshift(newTask);
  saveTasks();
  resetForm();
  renderList();
});

taskList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='open']");
  if (!button) {
    return;
  }
  activeTaskId = button.dataset.id;
  showView("timer");
  renderTimer();
});

taskList.addEventListener("pointerdown", (event) => {
  const card = event.target.closest(".task-card");
  if (!card || event.target.closest("button")) {
    return;
  }
  const taskId = card.dataset.id;
  if (!taskId) {
    return;
  }
  clearLongPress();
  longPressTaskId = taskId;
  longPressTimer = window.setTimeout(() => {
    openDeleteModal(longPressTaskId);
    clearLongPress();
  }, 650);
});

taskList.addEventListener("pointerup", clearLongPress);
taskList.addEventListener("pointerleave", clearLongPress);
taskList.addEventListener("pointercancel", clearLongPress);
taskList.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".task-card")) {
    event.preventDefault();
  }
});

confirmModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-modal-close]")) {
    closeDeleteModal();
  }
});

modalCancel.addEventListener("click", () => {
  closeDeleteModal();
});

modalConfirm.addEventListener("click", () => {
  if (pendingDeleteId) {
    deleteTask(pendingDeleteId);
  }
  closeDeleteModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.classList.contains("is-hidden")) {
    closeDeleteModal();
  }
});

tabListButton.addEventListener("click", () => {
  showView("list");
  renderList();
});

tabTimerButton.addEventListener("click", () => {
  showView("timer");
  renderTimer();
});

timerTaskSelect.addEventListener("change", (event) => {
  activeTaskId = event.target.value || null;
  renderTimer();
});

startButton.addEventListener("click", () => {
  if (!activeTaskId) {
    return;
  }
  if (timerState.running && timerState.taskId !== activeTaskId) {
    return;
  }
  if (!timerState.running) {
    timerState = {
      running: true,
      taskId: activeTaskId,
      startTime: Date.now(),
    };
    saveTimer();
    renderTimer();
    renderList();
    updateTitle();
  }
});

stopButton.addEventListener("click", () => {
  if (!timerState.running || timerState.taskId !== activeTaskId) {
    return;
  }
  const task = getTaskById(activeTaskId);
  if (!task) {
    return;
  }
  const elapsed = getActiveSessionMs();
  task.totalMs += elapsed;
  timerState = { running: false, taskId: null, startTime: null };
  saveTasks();
  saveTimer();
  renderTimer();
  renderList();
  updateTitle();
});

renderList();
if (timerState.running) {
  activeTaskId = timerState.taskId;
  showView("timer");
}
renderTimer();
updateTitle();
setInterval(tick, 1000);
