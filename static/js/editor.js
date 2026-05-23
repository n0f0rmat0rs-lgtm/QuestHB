let packs = [];
let currentPackName = null;
let currentPack = null; // {name, categories:[{name, questions:[...]}]}

/* ===== API ===== */
async function loadPackList() {
  const res = await fetch("/api/packs");
  packs = await res.json();
  renderPackList();
}

async function loadPack(name) {
  const res = await fetch(`/api/packs/${encodeURIComponent(name)}`);
  if (!res.ok) return;
  currentPackName = name;
  currentPack = await res.json();
  renderEditor();
}

async function savePack() {
  if (!currentPack) return;
  const name = currentPack.name.trim();
  if (!name) { alert("Укажи название пака."); return; }

  // if name changed, delete old
  if (currentPackName && currentPackName !== name) {
    await fetch(`/api/packs/${encodeURIComponent(currentPackName)}`, { method: "DELETE" });
  }
  await fetch(`/api/packs/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentPack),
  });
  currentPackName = name;
  await loadPackList();
  renderPackList();
  alert("Сохранено!");
}

async function uploadMedia(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (data.error) { alert("Ошибка загрузки: " + data.error); return null; }
  return data.path;
}

/* ===== SIDEBAR ===== */
function renderPackList() {
  const el = document.getElementById("pack-list");
  el.innerHTML = packs.map(p => `
    <div class="pack-item ${p === currentPackName ? "active" : ""}" data-name="${p}">${p}</div>
  `).join("");
  el.querySelectorAll(".pack-item").forEach(item => {
    item.onclick = () => loadPack(item.dataset.name);
  });
}

document.getElementById("new-pack-btn").onclick = () => {
  currentPackName = null;
  currentPack = { name: "Новый пак", categories: [] };
  renderPackList();
  renderEditor();
};

/* ===== EDITOR ===== */
function renderEditor() {
  const main = document.getElementById("editor-main");
  main.innerHTML = `
    <h1>Редактор пака</h1>
    <div class="editor-pack-name-row">
      <input type="text" id="pack-name-input" value="${esc(currentPack.name)}" placeholder="Название пака">
      <button class="btn btn-primary" id="save-pack-btn">Сохранить</button>
      ${currentPackName ? `<button class="btn btn-ghost" id="delete-pack-btn" style="color:var(--red)">Удалить пак</button>` : ""}
    </div>
    <div id="categories-container"></div>
    <button class="btn btn-secondary" id="add-cat-btn">+ Добавить категорию</button>
  `;
  document.getElementById("pack-name-input").oninput = e => { currentPack.name = e.target.value; };
  document.getElementById("save-pack-btn").onclick = savePack;
  const delBtn = document.getElementById("delete-pack-btn");
  if (delBtn) delBtn.onclick = deletePack;
  document.getElementById("add-cat-btn").onclick = addCategory;
  renderCategories();
}

function renderCategories() {
  const container = document.getElementById("categories-container");
  container.innerHTML = "";
  currentPack.categories.forEach((cat, ci) => {
    container.appendChild(buildCategoryBlock(cat, ci));
  });
}

function buildCategoryBlock(cat, ci) {
  const block = document.createElement("div");
  block.className = "category-block";
  block.dataset.ci = ci;
  block.innerHTML = `
    <div class="category-block-header">
      <input type="text" value="${esc(cat.name)}" placeholder="Название категории" style="flex:1">
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" title="Удалить категорию">✕ Категория</button>
    </div>
    <div class="category-block-body" id="cat-body-${ci}"></div>
    <div style="padding:.5rem 1rem 1rem">
      <button class="btn btn-secondary btn-sm">+ Вопрос</button>
    </div>
  `;
  block.querySelector(".category-block-header input").oninput = e => { cat.name = e.target.value; };
  block.querySelector(".category-block-header .btn-ghost").onclick = () => {
    if (!confirm("Удалить категорию вместе со всеми вопросами?")) return;
    currentPack.categories.splice(ci, 1);
    renderCategories();
  };
  block.querySelector(".category-block-body + div .btn-secondary").onclick = () => addQuestion(ci);

  const body = block.querySelector(`#cat-body-${ci}`);
  cat.questions.forEach((q, qi) => body.appendChild(buildQuestionCard(q, ci, qi)));
  return block;
}

function buildQuestionCard(q, ci, qi) {
  const card = document.createElement("div");
  card.className = "question-card";

  const penaltyOpts = [
    {val:"none",  label:"Без штрафа"},
    {val:"half",  label:"−½"},
    {val:"full",  label:"−полная"},
  ];

  card.innerHTML = `
    <div class="question-card-header">
      <label>Стоимость</label>
      <input type="number" value="${q.value || 100}" min="0" step="50" style="width:90px">
      <label style="margin-left:1rem">Штраф за неверно</label>
      <div class="penalty-toggle">
        ${penaltyOpts.map(o => `<button class="penalty-btn ${(q.penalty||"none")===o.val?"active":""}" data-val="${o.val}">${o.label}</button>`).join("")}
      </div>
      <button class="btn btn-ghost btn-sm" style="color:var(--red);margin-left:auto" title="Удалить вопрос">✕</button>
    </div>

    <label style="font-size:.8rem;color:var(--text-muted)">Вопрос</label>
    <textarea rows="3" placeholder="Текст вопроса">${esc(q.question||"")}</textarea>

    ${mediaRow("Изображение", "image", q.image)}
    ${mediaRow("Аудио", "audio", q.audio)}
    ${mediaRow("Видео", "video", q.video)}

    <div class="reveal-block" id="reveal-${ci}-${qi}" style="${q.answer_reveal ? "" : "display:none"}">
      <strong style="font-size:.85rem;color:var(--text-muted)">Ответ / пояснение (показывается после ответа)</strong>
      <textarea rows="2" placeholder="Текст ответа">${esc((q.answer_reveal||{}).text||"")}</textarea>
      ${mediaRow("Изображение", "rev-image", (q.answer_reveal||{}).image)}
      ${mediaRow("Аудио", "rev-audio", (q.answer_reveal||{}).audio)}
      ${mediaRow("Видео", "rev-video", (q.answer_reveal||{}).video)}
    </div>
    <button class="reveal-toggle-btn">${q.answer_reveal ? "▲ Скрыть блок ответа" : "▼ Добавить ответ/пояснение"}</button>
  `;

  // value
  card.querySelector("input[type=number]").oninput = e => { q.value = parseInt(e.target.value)||0; };

  // penalty
  card.querySelectorAll(".penalty-btn").forEach(btn => {
    btn.onclick = () => {
      q.penalty = btn.dataset.val;
      card.querySelectorAll(".penalty-btn").forEach(b => b.classList.toggle("active", b===btn));
    };
  });

  // remove
  card.querySelector(".btn-ghost[title='Удалить вопрос']").onclick = () => {
    currentPack.categories[ci].questions.splice(qi, 1);
    renderCategories();
  };

  // question text
  card.querySelectorAll("textarea")[0].oninput = e => { q.question = e.target.value; };

  // media inputs
  bindMediaRow(card, "image", q, "image");
  bindMediaRow(card, "audio", q, "audio");
  bindMediaRow(card, "video", q, "video");

  // answer reveal
  const revBlock = card.querySelector(`#reveal-${ci}-${qi}`);
  card.querySelectorAll("textarea")[1].oninput = e => {
    if (!q.answer_reveal) q.answer_reveal = {};
    q.answer_reveal.text = e.target.value;
  };
  bindMediaRow(card, "rev-image", q.answer_reveal || (q.answer_reveal={}), "image");
  bindMediaRow(card, "rev-audio", q.answer_reveal, "audio");
  bindMediaRow(card, "rev-video", q.answer_reveal, "video");

  // reveal toggle
  card.querySelector(".reveal-toggle-btn").onclick = function() {
    const hidden = revBlock.style.display === "none";
    revBlock.style.display = hidden ? "" : "none";
    this.textContent = hidden ? "▲ Скрыть блок ответа" : "▼ Добавить ответ/пояснение";
    if (!hidden && q.answer_reveal && !q.answer_reveal.text && !q.answer_reveal.image && !q.answer_reveal.audio && !q.answer_reveal.video) {
      q.answer_reveal = null;
    }
    if (hidden && !q.answer_reveal) q.answer_reveal = {};
  };

  return card;
}

function mediaRow(label, key, value) {
  return `
    <div class="media-row" data-key="${key}">
      <label>${label}</label>
      <input type="file" accept="${fileAccept(key)}">
      ${value ? `<span style="font-size:.75rem;color:var(--accent)">${value}</span>` : ""}
    </div>
  `;
}

function bindMediaRow(card, key, obj, field) {
  const row = card.querySelector(`.media-row[data-key="${key}"]`);
  if (!row) return;
  row.querySelector("input[type=file]").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const path = await uploadMedia(file);
    if (path) {
      obj[field] = path;
      const span = row.querySelector("span");
      if (span) span.textContent = path;
      else {
        const s = document.createElement("span");
        s.style.cssText = "font-size:.75rem;color:var(--accent)";
        s.textContent = path;
        row.appendChild(s);
      }
    }
  };
}

function fileAccept(key) {
  if (key.includes("image") || key === "image") return "image/*";
  if (key.includes("audio") || key === "audio") return "audio/*";
  if (key.includes("video") || key === "video") return "video/*";
  return "*";
}

function addCategory() {
  currentPack.categories.push({ name: "Новая категория", questions: [] });
  renderCategories();
}

function addQuestion(ci) {
  currentPack.categories[ci].questions.push({
    value: 100, question: "", answer: "", penalty: "none",
    image: null, audio: null, video: null, answer_reveal: null,
  });
  renderCategories();
}

async function deletePack() {
  if (!currentPackName) return;
  if (!confirm(`Удалить пак "${currentPackName}"? Это необратимо.`)) return;
  await fetch(`/api/packs/${encodeURIComponent(currentPackName)}`, { method: "DELETE" });
  currentPackName = null;
  currentPack = null;
  await loadPackList();
  document.getElementById("editor-main").innerHTML =
    "<p style='color:var(--text-muted);margin-top:3rem;text-align:center'>Выбери пак слева или создай новый</p>";
}

function esc(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

loadPackList();
