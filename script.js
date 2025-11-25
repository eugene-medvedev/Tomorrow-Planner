// ---------- Utilities ----------
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHumanDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Simple confetti
function fireConfetti() {
  const canvas = document.getElementById("confetti-canvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const pieces = [];
  const colors = ["#ef4444", "#f97316", "#facc15", "#4ade80", "#60a5fa", "#818cf8", "#c084fc"];
  for(let i=0; i<100; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5, h: Math.random() * 10 + 5,
      col: colors[Math.floor(Math.random()*colors.length)],
      vy: Math.random() * 3 + 2, vx: Math.random() * 2 - 1
    });
  }
  let animId;
  function update() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let active = false;
    pieces.forEach(p => {
      p.y += p.vy; p.x += p.vx;
      if(p.y < canvas.height) active = true;
      ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, p.w, p.h);
    });
    if(active) animId = requestAnimationFrame(update);
  }
  cancelAnimationFrame(animId);
  update();
  setTimeout(() => { ctx.clearRect(0,0,canvas.width,canvas.height); }, 3000);
}

// === START: Health Calculation Functions (Task 5) ===

// Mifflin-St Jeor Equation (modern, more accurate BMR estimate)
function calculateBMR(profile) {
  const { sex, age, weightLbs, heightIn } = profile;
  if (!sex || !age || !weightLbs || !heightIn) return 0;

  const weightKg = weightLbs * 0.453592;
  const heightCm = heightIn * 2.54;
  const ageNum = Number(age);

  let bmr;
  if (sex === "male") {
    // Men: (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * ageNum) + 5;
  } else if (sex === "female") {
    // Women: (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * ageNum) - 161;
  } else {
    // Neutral estimate for 'other'
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * ageNum);
  }
  return Math.round(bmr);
}

// Simple exercise calorie estimation based on intensity (1-10)
function calculateExerciseCalories(intensity, durationMinutes) {
    if (!intensity || intensity < 1 || durationMinutes < 1) return 0;
    // Base 5 cals/min (light exercise) scaled up to 30 cals/min (intense)
    const calsBurnedPerMin = 5 + (25 * (intensity / 10)); 
    return Math.round(calsBurnedPerMin * durationMinutes);
}

function calculateDietDeficit(profile, exerciseData, dietData) {
  const bmr = calculateBMR(profile);
  const consumed = Number(dietData.consumedCalories) || 0;
  const exerciseCals = calculateExerciseCalories(Number(exerciseData.intensity) || 0, Number(exerciseData.durationMinutes) || 0);

  // Deficit = (Energy Expended) - (Energy Consumed)
  // We use BMR as the base for maintenance.
  const deficit = bmr + exerciseCals - consumed;

  return {
    deficit: Math.round(deficit),
    exerciseCals: exerciseCals
  };
}

const CALORIES_PER_POUND = 3500; // 3500 calories ~ 1 lb of fat

// Maps intensity (1-10) to a color gradient from Dark Red (low) to Dark Green (high)
function getIntensityColor(intensity) { // Task 5.B
  if (!intensity || intensity < 1) return "rgba(100, 100, 100, 0.2)"; // Grey for no data
  
  // Hue 0 (red) to Hue 120 (green). Intensity 1 is 0, Intensity 10 is 120.
  const hue = Math.round((intensity / 10) * 120); 
  const saturation = 80; 
  const lightness = 45; 
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
// === END: Health Calculation Functions ===

// ---------- State ----------
const DEFAULT_GOALS = [
  { id: "g_gym", name: "Gym Workout", todayTasks: ["Pack gym bag", "Fill water bottle", "Block 1hr on calendar"] },
  { id: "g_read", name: "Read 30 mins", todayTasks: ["Pick book", "Put phone in other room"] },
  { id: "g_sleep", name: "Sleep by 10pm", todayTasks: ["Set alarm", "Lay out clothes for tomorrow"] }
];

let state = {
  goals: DEFAULT_GOALS,
  days: {}, // keyed by YYYY-MM-DD
  theme: "calm",
  futureTasks: {},
  profile: { sex: "", age: null, weightLbs: null, heightIn: null },
  lastVisitDateKey: null
};

let currentDate = new Date();
// Calendar view cursors
let mainCalCursor = new Date();
let healthCalCursor = new Date();

let currentUser = null;
let firebaseEnabled = false;
let db = null, auth = null;

// ---------- Persistence ----------
const STORAGE_KEY = "planner_v11";

function loadStateLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
      if (!state.goals) state.goals = DEFAULT_GOALS;
      if (!state.futureTasks) state.futureTasks = {};
    } catch(e) { console.error(e); }
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (firebaseEnabled && currentUser && db) {
    db.collection("users").doc(currentUser.uid).set({ state }, { merge: true });
  }
}

function getDayData(dateKey) {
  if (!state.days[dateKey]) {
    state.days[dateKey] = {
      selectedGoalIds: [],
      completed: {},
      customTasks: [],
      carriedTasks: [],
      checklistOrder: [],
      removedTasks: [],
      notes: "",
      image: null, // New image field
      exercise: { intensity: 0, durationMinutes: 60, rating: null }, // MODIFIED: Use intensity/duration (Task 5.A)
      diet: { consumedCalories: null, rating: null } // MODIFIED: Removed targetCalories (Task 5.A)
    };
  }
  // Data migration for old entries
  if (!state.days[dateKey].exercise.intensity && state.days[dateKey].exercise.type) {
    state.days[dateKey].exercise.intensity = 5; // Set a default intensity if only old 'type' exists
  }
  if (!state.days[dateKey].exercise.durationMinutes) {
    state.days[dateKey].exercise.durationMinutes = 60;
  }
  return state.days[dateKey];
}

function getGoalsMap() {
  return state.goals.reduce((acc,g) => { acc[g.id]=g; return acc; }, {});
}

// ---------- Render Logic ----------
const dom = {
  headerDate: document.getElementById("header-date"),
  goalsRow: document.getElementById("goals-row"),
  tomorrowPlan: document.getElementById("tomorrow-plan"),
  checklist: document.getElementById("checklist"),
  currentDayLabel: document.getElementById("current-day-label"),
  completionPerc: document.getElementById("completion-perc"),
  completionBar: document.getElementById("completion-bar-fill"),
  notes: document.getElementById("daily-notes"),
  imagePreview: document.getElementById("day-image-preview"),
  imageContainer: document.getElementById("image-preview-container"),
  mainCalGrid: document.getElementById("main-calendar-grid"),
  mainCalMonth: document.getElementById("main-cal-month-label"),
  healthCalMonth: document.getElementById("health-cal-month-label"),
  exCalGrid: document.getElementById("exercise-mini-calendar"),
  dietCalGrid: document.getElementById("diet-mini-calendar"),
  upcomingList: document.getElementById("upcoming-list")
};

function render() {
  applyTheme();
  
  // Date Headers
  const dateKey = formatDateKey(currentDate);
  dom.headerDate.textContent = formatHumanDate(new Date()); // top right is always today
  dom.currentDayLabel.textContent = formatHumanDate(currentDate);
  if(formatDateKey(new Date()) === dateKey) {
    dom.currentDayLabel.textContent = "Today";
    dom.currentDayLabel.style.fontWeight = "800";
    dom.currentDayLabel.style.color = "var(--primary)";
  } else {
    dom.currentDayLabel.style.fontWeight = "500";
    dom.currentDayLabel.style.color = "var(--text-main)";
  }

  const dayData = getDayData(dateKey);
  const goalsMap = getGoalsMap();

  renderGoalBubbles(dayData);
  renderTomorrowPlan(goalsMap, dayData);
  renderChecklist(goalsMap, dayData); // Handles Partitioning & Confetti Check
  renderNotesAndImage(dayData);
  renderHealth(dayData);
  
  // Calendars
  renderCalendar(dom.mainCalGrid, mainCalCursor, "main");
  dom.mainCalMonth.textContent = mainCalCursor.toLocaleDateString(undefined, {month:'long', year:'numeric'});
  
  renderCalendar(dom.exCalGrid, healthCalCursor, "exercise");
  renderCalendar(dom.dietCalGrid, healthCalCursor, "diet");
  dom.healthCalMonth.textContent = healthCalCursor.toLocaleDateString(undefined, {month:'long', year:'numeric'});

  renderUpcomingCompact(); // Renders the list of future tasks
}

function renderGoalBubbles(dayData) {
  dom.goalsRow.innerHTML = "";
  state.goals.forEach(goal => {
    const btn = document.createElement("button");
    const isActive = dayData.selectedGoalIds.includes(goal.id);
    btn.className = `goal-bubble ${isActive ? 'active' : ''}`;
    btn.draggable = true;
    btn.innerHTML = `<span>${goal.name}</span> <span class="goal-badge">${goal.todayTasks.length}</span>`;
    btn.onclick = () => toggleGoal(goal.id);
    btn.ondragstart = (e) => { e.dataTransfer.setData("text", goal.id); };
    dom.goalsRow.appendChild(btn);
  });
}

function renderTomorrowPlan(goalsMap, dayData) {
  dom.tomorrowPlan.innerHTML = "";
  const goals = dayData.selectedGoalIds.map(id => goalsMap[id]).filter(Boolean);
  if (goals.length === 0) {
    dom.tomorrowPlan.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:1rem;">Nothing planned.</div>`;
    return;
  }
  goals.forEach(goal => {
    const el = document.createElement("div");
    el.className = "goal-card";
    el.innerHTML = `
      <div class="goal-card-header">
        <span>${goal.name}</span>
        <button class="goal-card-remove" onclick="toggleGoal('${goal.id}')">Remove</button>
      </div>
      <ul>${goal.todayTasks.map(t => `<li>${t}</li>`).join('')}</ul>
    `;
    dom.tomorrowPlan.appendChild(el);
  });
}

function renderChecklist(goalsMap, dayData) {
  dom.checklist.innerHTML = "";
  
  // Grouping Logic
  let groups = {};
  
  // 1. Goal tasks
  dayData.selectedGoalIds.forEach(gid => {
    const g = goalsMap[gid];
    if(g) {
      groups[g.name] = g.todayTasks.filter(t => !(dayData.removedTasks||[]).includes(t));
    }
  });

  // 2. Custom/Carried/Future tasks for TODAY
  let miscTasks = [
    ...(dayData.customTasks || []),
    ...(dayData.carriedTasks || []), // Includes carried over tasks (Task 3)
    ...(state.futureTasks[formatDateKey(currentDate)] || []) 
  ];
  if (miscTasks.length > 0) groups["One-off / Other"] = miscTasks;

  const completedMap = dayData.completed || {};
  let totalTasks = 0;
  let totalDone = 0;

  // Render Groups
  Object.keys(groups).forEach(groupName => {
    const tasks = groups[groupName];
    if(tasks.length === 0) return;
    totalTasks += tasks.length;
    const groupDoneCount = tasks.filter(t => completedMap[t]).length;
    totalDone += groupDoneCount;
    const isGroupComplete = groupDoneCount === tasks.length && tasks.length > 0;
    const groupDiv = document.createElement("div");
    groupDiv.className = `checklist-group ${isGroupComplete ? 'completed' : ''}`;
    groupDiv.innerHTML = `<div class="checklist-group-header">${groupName} (${groupDoneCount}/${tasks.length})</div>`;

    tasks.forEach(task => {
      const isDone = !!completedMap[task];
      const div = document.createElement("div");
      div.className = "checklist-item";
      div.innerHTML = `
        <label>
          <input type="checkbox" ${isDone ? 'checked' : ''} data-task="${task}" />
          <span style="${isDone?'text-decoration:line-through; opacity:0.6':''}">${task}</span>
        </label>
        <div class="checklist-item-actions">
          <button class="sched-btn" data-task="${task}">📅</button>
          <button class="del-btn" data-task="${task}">✕</button>
        </div>
      `;
      groupDiv.appendChild(div);
    });
    dom.checklist.appendChild(groupDiv);
  });

  // Completion calculation
  const completionPercentage = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
  dom.completionPerc.textContent = `${completionPercentage}%`;
  dom.completionBar.style.width = `${completionPercentage}%`;

  if (totalTasks > 0 && totalDone === totalTasks && totalTasks > 5) {
    fireConfetti();
  }
}

function renderNotesAndImage(dayData) {
  dom.notes.value = dayData.notes || "";
  if (dayData.image) {
    dom.imagePreview.src = dayData.image;
    dom.imageContainer.style.display = "block";
  } else {
    dom.imagePreview.src = "";
    dom.imageContainer.style.display = "none";
  }
}

function renderHealth(dayData) { // MODIFIED (Task 5)
  const profile = state.profile;
  const bmr = calculateBMR(profile);
  
  // Update BMR Summary
  document.getElementById("profile-bmr-display").textContent = bmr > 0 ? `${bmr} kcal/day` : 'N/A';

  // --- Exercise Tab (Task 5.A, 5.B) ---
  const exData = dayData.exercise;
  
  // Set values for the new inputs
  document.getElementById("exercise-intensity").value = exData.intensity || 0;
  document.getElementById("exercise-intensity-label").textContent = exData.intensity || 0;
  document.getElementById("exercise-duration-minutes").value = exData.durationMinutes || 60;

  // Calculate calories burned
  const burnedCals = calculateExerciseCalories(Number(exData.intensity), Number(exData.durationMinutes));
  document.getElementById("exercise-cals-burned").textContent = burnedCals;
  
  // Add handlers for new exercise inputs
  document.getElementById("exercise-intensity").oninput = (e) => {
    dayData.exercise.intensity = Number(e.target.value);
    document.getElementById("exercise-intensity-label").textContent = dayData.exercise.intensity;
    saveState();
    renderHealth(dayData); // Re-render health to update calculations
    renderCalendar(dom.exCalGrid, healthCalCursor, "exercise"); // Re-render calendar
  };
  document.getElementById("exercise-duration-minutes").onchange = (e) => {
    dayData.exercise.durationMinutes = Number(e.target.value);
    saveState();
    renderHealth(dayData);
  };
  
  // --- Diet Tab (Task 5.C, 5.D) ---
  const dietData = dayData.diet;
  const { deficit, exerciseCals } = calculateDietDeficit(profile, exData, dietData);
  
  // Set consumed calories
  document.getElementById("consumed-calories").value = dietData.consumedCalories || "";
  
  // Set diet rating
  document.getElementById("diet-rating-slide").value = dietData.rating || 5;
  document.getElementById("diet-rating-label").textContent = dietData.rating || 5;

  // Add handlers for diet inputs
  document.getElementById("consumed-calories").onchange = (e) => {
    dayData.diet.consumedCalories = Number(e.target.value);
    saveState();
    renderHealth(dayData); // Re-render health to update calculations
  };
  document.getElementById("diet-rating-slide").oninput = (e) => {
    dayData.diet.rating = Number(e.target.value);
    document.getElementById("diet-rating-label").textContent = dayData.diet.rating;
    saveState();
    renderCalendar(dom.dietCalGrid, healthCalCursor, "diet"); // Re-render calendar
  };
  
  // --- Deficit/Loss Display (Task 5.D) ---
  document.getElementById("health-bmr-value").textContent = bmr;
  document.getElementById("health-exercise-value").textContent = exerciseCals;
  document.getElementById("health-consumed-value").textContent = dietData.consumedCalories || 0;
  document.getElementById("health-deficit-value").textContent = deficit;
  
  // Weight Loss Calculations
  const lossPerDay = deficit / CALORIES_PER_POUND;
  document.getElementById("loss-1-day").textContent = lossPerDay.toFixed(2);
  document.getElementById("loss-1-week").textContent = (lossPerDay * 7).toFixed(2);
  document.getElementById("loss-1-month").textContent = (lossPerDay * 30).toFixed(2);
  document.getElementById("loss-3-months").textContent = (lossPerDay * 90).toFixed(2);
}

// True Calendar Generation
function renderCalendar(container, cursorDate, mode) {
  container.innerHTML = "";
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // 0=Sun, 1=Mon. We want Mon start.
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const totalSlots = 35; // 5 rows usually enough, sometimes 42 needed
  const daysInMonth = lastDay.getDate();

  // Previous month padding
  for (let i = 0; i < startDay; i++) {
    const d = document.createElement("div");
    d.className = "mini-day other-month";
    container.appendChild(d);
  }

  // Days
  const selectedKey = formatDateKey(currentDate);
  const todayKey = formatDateKey(new Date());

  for (let i = 1; i <= daysInMonth; i++) {
    const dDate = new Date(year, month, i);
    const key = formatDateKey(dDate);
    const div = document.createElement("div");
    let cls = "mini-day in-month";
    if (key === selectedKey) cls += " selected";
    if (key === todayKey) cls += " today";

    // Coloring logic based on mode (MODIFIED for Task 5.B)
    const dData = state.days[key];
    if(mode === "exercise" && dData && dData.exercise && dData.exercise.intensity) { // Check for intensity instead of rating
      div.style.backgroundColor = getIntensityColor(dData.exercise.intensity); // Use new intensity color
      if(key===selectedKey) div.style.border = "2px solid #000";
    } else if (mode === "diet" && dData && dData.diet && dData.diet.rating) {
      // Keep the diet rating color logic (Task 5.C)
      div.style.backgroundColor = getRatingColor(dData.diet.rating); 
      if(key===selectedKey) div.style.border = "2px solid #000";
    }

    // Dot for future tasks in main calendar
    if (mode === "main" && state.futureTasks[key] && state.futureTasks[key].length > 0) {
      cls += " has-future-task";
    }

    div.className = cls;
    div.textContent = i;
    div.onclick = () => {
      currentDate = dDate;
      render();
    };
    container.appendChild(div);
  }

  // Next month padding
  let totalDaysDisplayed = startDay + daysInMonth;
  for (let i = 0; i < totalSlots - totalDaysDisplayed; i++) {
    const d = document.createElement("div");
    d.className = "mini-day other-month";
    container.appendChild(d);
  }
}

// Function to delete a future task (Task 2)
function deleteFutureTaskById(dateKey, task) {
  if (state.futureTasks[dateKey]) {
    state.futureTasks[dateKey] = state.futureTasks[dateKey].filter(t => t !== task);
    if (state.futureTasks[dateKey].length === 0) {
      delete state.futureTasks[dateKey];
    }
    saveState();
    render();
  }
}

// Function to move a future task to today's custom tasks (Task 2)
function moveFutureTaskToToday(dateKey, task) {
  const todayKey = formatDateKey(currentDate);
  const d = getDayData(todayKey);

  // Add to today's custom tasks
  if (!d.customTasks.includes(task)) {
    d.customTasks.push(task);
    alert(`Moved "${task}" to Today's Checklist.`);
  }

  // Remove from future tasks
  deleteFutureTaskById(dateKey, task);
}

function renderUpcomingCompact() { // MODIFIED (Task 2)
  dom.upcomingList.innerHTML = "";
  const allKeys = Object.keys(state.futureTasks).sort();
  const todayKey = formatDateKey(currentDate);

  allKeys.forEach(dateKey => {
    if (dateKey !== todayKey) { // Don't show today's tasks here
      const tasks = state.futureTasks[dateKey];
      if (tasks && tasks.length > 0) {
        const date = parseDateKey(dateKey);
        const dateStr = formatHumanDate(date).split(',')[0]; // Just the day/month
        const groupDiv = document.createElement("div");
        groupDiv.className = "upcoming-group-compact";
        groupDiv.innerHTML = `<div class="upcoming-date">${dateStr}</div>`;
        
        tasks.forEach(task => {
          const item = document.createElement("div");
          item.className = "upcoming-item-compact future-bubble";
          item.textContent = task;
          item.draggable = true;
          item.dataset.datekey = dateKey;
          item.dataset.task = task;
          
          item.innerHTML += `<button class="future-delete-btn" onclick="deleteFutureTaskById('${dateKey}', '${task}')">✕</button>`;

          // Click to move to today
          item.onclick = () => moveFutureTaskToToday(dateKey, task);

          // Drag to move to today's checklist
          item.ondragstart = (e) => {
            e.stopPropagation();
            e.dataTransfer.setData("text/plain", JSON.stringify({
              type: "futureTask",
              dateKey: dateKey,
              task: task
            }));
            e.dataTransfer.effectAllowed = "move";
          };
          groupDiv.appendChild(item);
        });
        dom.upcomingList.appendChild(groupDiv);
      }
    }
  });

  // Checklist card drop target handler for future tasks (Task 2)
  const checklistCard = document.getElementById("checklist-card");
  if (checklistCard) {
    checklistCard.addEventListener("dragover", e => {
      e.preventDefault(); // allow drop
    });
    checklistCard.addEventListener("drop", e => {
      e.preventDefault();
      const data = e.dataTransfer.getData("text/plain");
      try {
        const taskData = JSON.parse(data);
        if (taskData.type === "futureTask") {
          moveFutureTaskToToday(taskData.dateKey, taskData.task);
        }
      } catch(e) { /* ignore non-JSON or other drag types */ }
    });
  }
}

// Function to handle task deletion from checklist (Task 2)
function deleteTask(task) {
  const d = getDayData(formatDateKey(currentDate));
  // Remove from arrays
  if(d.customTasks) d.customTasks = d.customTasks.filter(t => t!==task);
  if(d.carriedTasks) d.carriedTasks = d.carriedTasks.filter(t => t!==task);
  // Also remove from future tasks if it was scheduled for today
  if(state.futureTasks[formatDateKey(currentDate)]) { 
    state.futureTasks[formatDateKey(currentDate)] = state.futureTasks[formatDateKey(currentDate)].filter(t=>t!==task);
  }
  // If it comes from a goal, add to removed list
  const goalsMap = getGoalsMap();
  if (Object.values(goalsMap).some(g => g.todayTasks.includes(task))) {
    d.removedTasks = [...(d.removedTasks || []), task];
  }
  // Remove completion status
  delete d.completed[task];
  saveState();
  render();
}

// Function to carry over unfinished tasks (Task 3)
function carryOverUnfinishedTasks() {
  const yesterday = new Date(currentDate);
  yesterday.setDate(currentDate.getDate() - 1);
  const yesterdayKey = formatDateKey(yesterday);
  const todayKey = formatDateKey(currentDate);

  if (todayKey !== formatDateKey(new Date())) {
    alert("You can only carry over tasks to Today.");
    return;
  }

  const yesterdayData = state.days[yesterdayKey];
  const todayData = getDayData(todayKey);

  if (!yesterdayData) {
    alert("No data found for yesterday.");
    return;
  }

  let unfinishedTasks = [];
  const goalsMap = getGoalsMap();

  // 1. Unfinished Goal tasks
  yesterdayData.selectedGoalIds.forEach(gid => {
    const g = goalsMap[gid];
    if (g) {
      g.todayTasks.forEach(task => {
        if (!yesterdayData.completed[task] && !yesterdayData.removedTasks.includes(task)) {
          unfinishedTasks.push(task);
        }
      });
    }
  });

  // 2. Unfinished Custom/Carried/Future tasks from yesterday
  const miscTasks = [
    ...(yesterdayData.customTasks || []),
    ...(yesterdayData.carriedTasks || []),
    ...(state.futureTasks[yesterdayKey] || [])
  ];

  miscTasks.forEach(task => {
    if (!yesterdayData.completed[task]) {
      unfinishedTasks.push(task);
    }
  });

  // Filter out duplicates and tasks already on today's carried list
  const newCarriedTasks = unfinishedTasks.filter(t => !todayData.carriedTasks.includes(t) && !todayData.customTasks.includes(t));

  if (newCarriedTasks.length > 0) {
    todayData.carriedTasks = [...todayData.carriedTasks, ...newCarriedTasks];
    saveState();
    render();
    alert(`${newCarriedTasks.length} task(s) carried over from yesterday!`);
  } else {
    alert("No unfinished tasks to carry over from yesterday.`);
  }
}


// Handlers and Listeners
function toggleGoal(gid) {
  const d = getDayData(formatDateKey(currentDate));
  const idx = d.selectedGoalIds.indexOf(gid);
  if (idx !== -1) d.selectedGoalIds.splice(idx, 1);
  else d.selectedGoalIds.push(gid);
  saveState();
  render();
}

dom.checklist.addEventListener("click", e => {
  const btn = e.target;
  if (btn.classList.contains("del-btn")) {
    const task = btn.dataset.task;
    deleteTask(task);
  } else if (btn.classList.contains("sched-btn")) {
    const task = btn.dataset.task;
    const dest = prompt("Move to date (YYYY-MM-DD):");
    if(dest) {
      if(!state.futureTasks[dest]) state.futureTasks[dest] = [];
      state.futureTasks[dest].push(task);
      deleteTask(task); // Remove from today
      alert(`Moved to ${dest}`);
    }
  }
});

dom.checklist.addEventListener("change", e => {
  if (e.target.type === "checkbox") {
    const task = e.target.dataset.task;
    const d = getDayData(formatDateKey(currentDate));
    d.completed[task] = e.target.checked;
    saveState();
    render();
  }
});

// New Goal Form
document.getElementById("new-goal-form").onsubmit = (e) => {
  e.preventDefault();
  const name = document.getElementById("new-goal-name").value;
  const tasksStr = document.getElementById("new-goal-tasks").value;
  const tasks = tasksStr.split(",").map(t => t.trim()).filter(t => t.length > 0);
  
  if (name && tasks.length > 0) {
    state.goals.push({ id: "g_" + Date.now(), name, todayTasks: tasks });
    saveState();
    document.getElementById("new-goal-name").value = "";
    document.getElementById("new-goal-tasks").value = "";
    render();
  }
};

// Add Task Inline Form
document.getElementById("add-task-inline-form").onsubmit = (e) => {
  e.preventDefault();
  const task = document.getElementById("add-task-inline").value.trim();
  if (task) {
    const d = getDayData(formatDateKey(currentDate));
    if (!d.customTasks.includes(task)) {
      d.customTasks.push(task);
      saveState();
      document.getElementById("add-task-inline").value = "";
      render();
    }
  }
};

// Notes/Image Handlers
document.getElementById("daily-notes").oninput = (e) => {
  const d = getDayData(formatDateKey(currentDate));
  d.notes = e.target.value;
  autoResizeTextarea(e.target);
  saveState();
};
document.getElementById("day-image-input").onchange = (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const d = getDayData(formatDateKey(currentDate));
      d.image = event.target.result;
      saveState();
      renderNotesAndImage(d);
    };
    reader.readAsDataURL(file);
  }
};
document.getElementById("remove-image-btn").onclick = () => {
  const d = getDayData(formatDateKey(currentDate));
  d.image = null;
  saveState();
  renderNotesAndImage(d);
  document.getElementById("day-image-input").value = '';
};

// Calendar Navigation
document.getElementById("main-cal-prev").onclick = () => {
  mainCalCursor.setMonth(mainCalCursor.getMonth()-1);
  render();
};
document.getElementById("main-cal-next").onclick = () => {
  mainCalCursor.setMonth(mainCalCursor.getMonth()+1);
  render();
};
document.getElementById("health-cal-prev").onclick = () => {
  healthCalCursor.setMonth(healthCalCursor.getMonth()-1);
  render();
};
document.getElementById("health-cal-next").onclick = () => {
  healthCalCursor.setMonth(healthCalCursor.getMonth()+1);
  render();
};

// Navigation/Carry Over Handlers (Task 3)
// Removed old day navigation buttons: prev-day-btn, next-day-btn, today-btn
document.getElementById("carry-over-btn").onclick = carryOverUnfinishedTasks;

// Goal Drag/Drop for Tomorrow's Plan
document.getElementById("tomorrow-plan").addEventListener("dragover", e => {
  e.preventDefault();
});
document.getElementById("tomorrow-plan").addEventListener("drop", e => {
  e.preventDefault();
  const goalId = e.dataTransfer.getData("text");
  if(goalId) {
    const d = getDayData(formatDateKey(currentDate));
    if (!d.selectedGoalIds.includes(goalId)) {
      d.selectedGoalIds.push(goalId);
      saveState();
      render();
    }
  }
});


// Health Profile Inputs
document.getElementById("profile-height").onchange = (e) => {
  state.profile.heightIn = Number(e.target.value);
  saveState();
  renderHealth(getDayData(formatDateKey(currentDate)));
};
document.getElementById("profile-age").onchange = (e) => {
  state.profile.age = Number(e.target.value);
  saveState();
  renderHealth(getDayData(formatDateKey(currentDate)));
};
document.getElementById("profile-sex").onchange = (e) => {
  state.profile.sex = e.target.value;
  saveState();
  renderHealth(getDayData(formatDateKey(currentDate)));
};
document.getElementById("profile-weight").onchange = (e) => {
  state.profile.weightLbs = Number(e.target.value);
  saveState();
  renderHealth(getDayData(formatDateKey(currentDate)));
};

// Mock AI Goal Generation (Task 1)
document.getElementById("ai-goal-generate-btn").onclick = () => {
  const prompt = document.getElementById("ai-goal-prompt").value;
  if (!prompt) {
    alert("Please describe a goal for the AI Helper.");
    return;
  }

  const mockGoalId = "g_" + Date.now();
  let name = "AI Generated Goal";
  let tasks = ["Check generated tasks", "Review in goals list"];

  // Simple prompt parsing for a slightly better mock response
  if (prompt.toLowerCase().includes("exercise") || prompt.toLowerCase().includes("workout")) {
    name = "Workout: " + prompt;
    tasks = ["Warm-up (5 mins)", "Main Set (45 mins)", "Cool-down (10 mins)", "Hydrate"];
  } else if (prompt.toLowerCase().includes("study") || prompt.toLowerCase().includes("learn")) {
    name = "Study: " + prompt;
    tasks = ["Gather materials", "Set timer for 45 mins", "Take 15 min break", "Review notes"];
  } else {
    name = name + ": " + prompt;
  }

  state.goals.push({
    id: mockGoalId,
    name: name,
    todayTasks: tasks
  });
  saveState();
  document.getElementById("ai-goal-prompt").value = "";
  render();
  alert("✨ Magic Goal Generated!"); // Feedback that the button worked
};


// ... (rest of the file remains the same)