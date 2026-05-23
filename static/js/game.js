/* ===== STATE ===== */
const state = {
  rounds: [],       // [{packName, pack}]
  roundIdx: 0,
  teams: [],        // [{name, color, score}]
  usedQuestions: {}, // "roundIdx-catIdx-qIdx": true
  currentQ: null,   // {catIdx, qIdx, q}
  timerRunning: false,
  timerSeconds: 60,
  timerInterval: null,
  buzzedTeam: null, // team index that buzzed
  teamsAnsweredWrong: new Set(), // indices of teams that answered wrong this turn
};

const TEAM_COLORS = ["#4f8ef7", "#e74c3c", "#27ae60", "#9b59b6", "#f39c12", "#1abc9c"];
const CIRCUMFERENCE = 2 * Math.PI * 54; // ~339.3

/* ===== SCREEN MANAGEMENT ===== */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ===== SETUP SCREEN ===== */
let availablePacks = [];
let setupRounds = []; // [{packName}]
let setupTeams  = []; // [{name, color}]

async function initSetup() {
  const res = await fetch("/api/packs");
  availablePacks = await res.json();
  renderRounds();
  renderSetupTeams();
}

function renderRounds() {
  const el = document.getElementById("rounds-list");
  el.innerHTML = "";
  setupRounds.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "round-item";
    row.innerHTML = `
      <span style="color:var(--text-muted);font-size:.85rem;">Раунд ${i+1}</span>
      <select>${availablePacks.map(p => `<option value="${p}" ${p===r.packName?"selected":""}>${p}</option>`).join("")}</select>
      <button class="round-order-btn" title="Вверх">▲</button>
      <button class="round-order-btn" title="Вниз">▼</button>
      <button class="round-remove-btn" title="Удалить">✕</button>
    `;
    row.querySelector("select").onchange = e => { setupRounds[i].packName = e.target.value; };
    row.querySelectorAll(".round-order-btn")[0].onclick = () => { if(i>0) { [setupRounds[i-1],setupRounds[i]]=[setupRounds[i],setupRounds[i-1]]; renderRounds(); } };
    row.querySelectorAll(".round-order-btn")[1].onclick = () => { if(i<setupRounds.length-1) { [setupRounds[i],setupRounds[i+1]]=[setupRounds[i+1],setupRounds[i]]; renderRounds(); } };
    row.querySelector(".round-remove-btn").onclick = () => { setupRounds.splice(i,1); renderRounds(); };
    el.appendChild(row);
  });
}

document.getElementById("add-round-btn").onclick = () => {
  if (!availablePacks.length) { alert("Нет паков. Сначала создай пак в Редакторе."); return; }
  setupRounds.push({ packName: availablePacks[0] });
  renderRounds();
};

function renderSetupTeams() {
  const el = document.getElementById("teams-list");
  el.innerHTML = "";
  setupTeams.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "team-item";
    row.innerHTML = `
      <div class="team-color" style="background:${t.color}" title="Цвет команды"></div>
      <input class="team-name-input" value="${t.name}" placeholder="Название команды">
      <button class="team-remove-btn" title="Удалить">✕</button>
    `;
    row.querySelector(".team-color").onclick = () => {
      const colors = TEAM_COLORS;
      const next = (colors.indexOf(t.color) + 1) % colors.length;
      t.color = colors[next];
      renderSetupTeams();
    };
    row.querySelector(".team-name-input").oninput = e => { setupTeams[i].name = e.target.value; };
    row.querySelector(".team-remove-btn").onclick = () => { setupTeams.splice(i,1); renderSetupTeams(); };
    el.appendChild(row);
  });
}

document.getElementById("add-team-btn").onclick = () => {
  if (setupTeams.length >= 6) return;
  const idx = setupTeams.length;
  setupTeams.push({ name: `Команда ${idx+1}`, color: TEAM_COLORS[idx % TEAM_COLORS.length] });
  renderSetupTeams();
};

document.getElementById("start-game-btn").onclick = async () => {
  if (!setupRounds.length) { alert("Добавь хотя бы один раунд."); return; }
  if (!setupTeams.length)  { alert("Добавь хотя бы одну команду."); return; }
  if (setupTeams.some(t => !t.name.trim())) { alert("У всех команд должны быть названия."); return; }

  const packs = [];
  for (const r of setupRounds) {
    const res = await fetch(`/api/packs/${encodeURIComponent(r.packName)}`);
    if (!res.ok) { alert(`Пак не найден: ${r.packName}`); return; }
    packs.push({ packName: r.packName, pack: await res.json() });
  }

  state.rounds = packs;
  state.roundIdx = 0;
  state.teams = setupTeams.map(t => ({ name: t.name, color: t.color, score: 0 }));
  state.usedQuestions = {};

  startRound(0);
};

/* ===== BOARD SCREEN ===== */
function startRound(idx) {
  state.roundIdx = idx;
  buildBoard();
  renderScoresBar();
  updateRoundLabel();
  checkRoundComplete();
  showScreen("screen-board");
}

function updateRoundLabel() {
  document.getElementById("round-label").textContent =
    `Раунд ${state.roundIdx+1} / ${state.rounds.length}: ${state.rounds[state.roundIdx].packName}`;
}

function buildBoard() {
  const pack = state.rounds[state.roundIdx].pack;
  const grid = document.getElementById("board-grid");
  const cats = pack.categories;
  if (!cats || !cats.length) { grid.innerHTML = "<p>Нет категорий в паке.</p>"; return; }

  const maxQ = Math.max(...cats.map(c => c.questions.length));
  grid.style.gridTemplateColumns = `repeat(${cats.length}, 1fr)`;
  grid.innerHTML = "";

  // headers
  cats.forEach(cat => {
    const h = document.createElement("div");
    h.className = "category-header";
    h.textContent = cat.name;
    grid.appendChild(h);
  });

  // question cells row by row
  for (let qi = 0; qi < maxQ; qi++) {
    cats.forEach((cat, ci) => {
      const q = cat.questions[qi];
      const cell = document.createElement("div");
      const key = `${state.roundIdx}-${ci}-${qi}`;
      if (!q) {
        cell.className = "question-cell used";
      } else {
        cell.className = "question-cell" + (state.usedQuestions[key] ? " used" : "");
        cell.textContent = q.value;
        cell.onclick = () => openQuestion(ci, qi);
      }
      grid.appendChild(cell);
    });
  }
}

function renderScoresBar() {
  const bar = document.getElementById("scores-bar");
  bar.innerHTML = state.teams.map((t,i) => `
    <div class="score-chip" style="background:${t.color}22;border:2px solid ${t.color}">
      <span class="team-name">${t.name}</span>
      <span class="team-score" id="score-${i}">${t.score}</span>
    </div>
  `).join("");
}

function updateScoreDisplays() {
  state.teams.forEach((t,i) => {
    const el = document.getElementById(`score-${i}`);
    if (el) el.textContent = t.score;
  });
}

/* ── Score adjust modal ── */
document.getElementById("adjust-scores-btn").onclick = openScoreModal;
document.getElementById("modal-scores-close").onclick = () => {
  document.getElementById("modal-scores").style.display = "none";
};

function openScoreModal() {
  const list = document.getElementById("modal-scores-list");
  list.innerHTML = state.teams.map((t,i) => `
    <div class="score-adjust-row">
      <div class="team-dot" style="background:${t.color}"></div>
      <span class="team-label">${t.name}</span>
      <span class="cur-score" id="modal-score-${i}">${t.score}</span>
      <input class="adjust-input" type="number" value="100" min="0" id="adj-input-${i}">
      <button class="adj-plus"  onclick="adjustScore(${i},+1)">+</button>
      <button class="adj-minus" onclick="adjustScore(${i},-1)">−</button>
    </div>
  `).join("");
  document.getElementById("modal-scores").style.display = "flex";
}

function adjustScore(teamIdx, sign) {
  const val = parseInt(document.getElementById(`adj-input-${teamIdx}`).value) || 0;
  state.teams[teamIdx].score += sign * val;
  document.getElementById(`modal-score-${teamIdx}`).textContent = state.teams[teamIdx].score;
  updateScoreDisplays();
}

/* ── next round ── */
document.getElementById("next-round-btn").onclick = () => {
  if (state.roundIdx + 1 < state.rounds.length) {
    startRound(state.roundIdx + 1);
  }
};

function checkRoundComplete() {
  const pack = state.rounds[state.roundIdx].pack;
  let allUsed = true;
  pack.categories.forEach((cat, ci) => {
    cat.questions.forEach((_, qi) => {
      if (!state.usedQuestions[`${state.roundIdx}-${ci}-${qi}`]) allUsed = false;
    });
  });
  const btn = document.getElementById("next-round-btn");
  btn.style.display = (allUsed && state.roundIdx + 1 < state.rounds.length) ? "inline-flex" : "none";
}

document.getElementById("back-setup-btn").onclick = () => showScreen("screen-setup");

/* ===== QUESTION SCREEN ===== */
function openQuestion(catIdx, qIdx) {
  const key = `${state.roundIdx}-${catIdx}-${qIdx}`;
  if (state.usedQuestions[key]) return;

  const q = state.rounds[state.roundIdx].pack.categories[catIdx].questions[qIdx];
  state.currentQ = { catIdx, qIdx, key, q };
  state.buzzedTeam = null;
  state.teamsAnsweredWrong = new Set();

  resetTimer();
  populateQuestion(q);
  setBuzzDisplay(null);
  showAnswerJudgeBtns(false);
  document.getElementById("answer-overlay").style.display = "none";
  showScreen("screen-question");
}

function populateQuestion(q) {
  document.getElementById("q-value").textContent = q.value + " баллов";
  document.getElementById("q-text").textContent = q.question || "";

  const img = document.getElementById("q-image");
  if (q.image) { img.src = q.image; img.style.display = "block"; } else img.style.display = "none";

  const aud = document.getElementById("q-audio");
  if (q.audio) { aud.src = q.audio; aud.style.display = "block"; } else aud.style.display = "none";

  const vidWrap = document.getElementById("q-video-wrap");
  const vid = document.getElementById("q-video");
  if (q.video) { vid.src = q.video; vidWrap.style.display = "block"; } else vidWrap.style.display = "none";

  document.getElementById("q-start-btn").style.display = "inline-flex";
  document.getElementById("q-annul-btn").style.display = "inline-flex";
}

/* ── Timer ── */
const ARC = 339.3;

function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  state.timerSeconds = 60;
  updateTimerDisplay(60, 60);
}

function startTimer() {
  if (state.timerRunning) return;
  state.timerRunning = true;
  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay(state.timerSeconds, 60);
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      onTimerEnd();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
}

function resumeTimer() {
  if (state.timerSeconds > 0) startTimer();
}

function updateTimerDisplay(secs, total) {
  document.getElementById("timer-text").textContent = secs;
  const arc = document.getElementById("timer-arc");
  const fraction = secs / total;
  arc.style.strokeDashoffset = ARC * (1 - fraction);
  arc.classList.toggle("warning", fraction <= 0.5 && fraction > 0.25);
  arc.classList.toggle("danger",  fraction <= 0.25);
}

function onTimerEnd() {
  playSound("timer_end");
  flashScreen();
}

function flashScreen() {
  document.body.style.background = "#fff";
  setTimeout(() => { document.body.style.background = ""; }, 250);
}

function playSound(name) {
  try {
    const a = new Audio(`/static/sounds/${name}.mp3`);
    a.volume = 0.7;
    a.play().catch(() => {});
  } catch {}
}

/* ── Buzz handling ── */
function onBuzzerPress(teamIdx) {
  const team = state.teams[teamIdx];
  if (!team) return;
  if (!state.timerRunning && state.timerSeconds === 60) return; // timer not started yet
  if (state.buzzedTeam !== null) return;       // someone already buzzed
  if (state.teamsAnsweredWrong.has(teamIdx)) return; // this team already answered wrong

  pauseTimer();
  state.buzzedTeam = teamIdx;
  playSound("buzz");
  setBuzzDisplay(teamIdx);
  showAnswerJudgeBtns(true);
  document.getElementById("q-start-btn").style.display = "none";
}

function setBuzzDisplay(teamIdx) {
  const el = document.getElementById("buzz-display");
  const name = document.getElementById("buzz-team-name");
  if (teamIdx === null) {
    el.style.display = "none";
  } else {
    const t = state.teams[teamIdx];
    name.textContent = t.name;
    name.style.background = t.color;
    el.style.display = "block";
  }
}

function showAnswerJudgeBtns(show) {
  document.getElementById("q-correct-btn").style.display = show ? "inline-flex" : "none";
  document.getElementById("q-wrong-btn").style.display   = show ? "inline-flex" : "none";
}

document.getElementById("q-correct-btn").onclick = () => {
  const q = state.currentQ.q;
  state.teams[state.buzzedTeam].score += q.value;
  updateScoreDisplays();
  closeQuestion(true);
};

document.getElementById("q-wrong-btn").onclick = () => {
  const q = state.currentQ.q;
  const team = state.teams[state.buzzedTeam];
  if (q.penalty === "half") team.score -= Math.floor(q.value / 2);
  else if (q.penalty === "full") team.score -= q.value;
  updateScoreDisplays();

  state.teamsAnsweredWrong.add(state.buzzedTeam);
  state.buzzedTeam = null;
  setBuzzDisplay(null);
  showAnswerJudgeBtns(false);
  document.getElementById("q-start-btn").style.display = "inline-flex";

  // If all teams answered wrong, close the question
  const eligibleTeams = state.teams.filter((_,i) => !state.teamsAnsweredWrong.has(i));
  if (eligibleTeams.length === 0) {
    closeQuestion(false);
  } else {
    resumeTimer();
  }
};

document.getElementById("q-annul-btn").onclick = () => closeQuestion(false);

document.getElementById("q-back-btn").onclick = () => {
  pauseTimer();
  showScreen("screen-board");
};

document.getElementById("ans-close-btn").onclick = () => {
  document.getElementById("answer-overlay").style.display = "none";
  state.usedQuestions[state.currentQ.key] = true;
  buildBoard();
  checkRoundComplete();
  showScreen("screen-board");
};

function closeQuestion(correct) {
  pauseTimer();
  const q = state.currentQ.q;
  const rev = q.answer_reveal;

  const hasReveal = rev && (rev.text || rev.image || rev.audio || rev.video);
  if (hasReveal) {
    document.getElementById("ans-text").textContent = rev.text || "";

    const ai = document.getElementById("ans-image");
    if (rev.image) { ai.src = rev.image; ai.style.display = "block"; } else ai.style.display = "none";

    const aa = document.getElementById("ans-audio");
    if (rev.audio) { aa.src = rev.audio; aa.style.display = "block"; } else aa.style.display = "none";

    const av = document.getElementById("ans-video");
    if (rev.video) { av.src = rev.video; av.style.display = "block"; } else av.style.display = "none";

    document.getElementById("answer-overlay").style.display = "flex";
  } else {
    state.usedQuestions[state.currentQ.key] = true;
    buildBoard();
    checkRoundComplete();
    showScreen("screen-board");
  }
}

/* ── keyboard ── */
document.addEventListener("keydown", e => {
  const screen = document.querySelector(".screen.active");
  if (!screen) return;
  const id = screen.id;

  if (id === "screen-question") {
    if (e.code === "Space") {
      e.preventDefault();
      if (!state.timerRunning) startTimer();
    }
    if (e.key === "1") onBuzzerPress(0);
    if (e.key === "2") onBuzzerPress(1);
    if (e.key === "3") onBuzzerPress(2);
    if (e.key === "4") onBuzzerPress(3);
    if (e.key === "5") onBuzzerPress(4);
    if (e.key === "6") onBuzzerPress(5);
  }
});

document.getElementById("q-start-btn").onclick = () => {
  if (!state.timerRunning) startTimer();
};

/* ===== INIT ===== */
// Add 2 default teams to save clicks
setupTeams = [
  { name: "Команда 1", color: TEAM_COLORS[0] },
  { name: "Команда 2", color: TEAM_COLORS[1] },
];
initSetup();
