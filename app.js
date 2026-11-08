// 「理科ラボ 3」小学3年・理科。画面と進行。
// 記録（進み具合・まちがえた問題・発見・研究XP）は localStorage にだけ保存する。
// 外部通信は tt-sensei.github.io の共通基盤（ナビキャラ画像・edu-effects・sounds-recipe-）のみ。

let soundList = [];
try {
  ({ soundList } = await import("https://tt-sensei.github.io/sounds-recipe-/sounds.js"));
} catch {
  // 音は補助要素。読み込めなくても学習本体は続けられるようにする。
  soundList = [];
}

const root = document.querySelector("#app");
const overlayRoot = document.querySelector("#overlay-root");
const LS_KEY = "rikaLab3.v3";
const NAVI_BASE = "https://tt-sensei.github.io/navi-character-/assets/web/";
const GROUP_IMG = NAVI_BASE + "groups/group-studying.webp";
const GROUP_CELEB_IMG = NAVI_BASE + "groups/group-celebration.webp";

// 単元ごとの担当ナビキャラ
const UNIT_NAVI = {
  living: "saku", plants: "nami", insects: "riku", windrubber: "sora", sound: "tsuki",
  sun: "sora", light: "kai", electricity: "kai", magnets: "riku", weight: "nami"
};
const NAVI_NAMES = { riku: "りく", sora: "そら", kai: "かい", saku: "さく", tsuki: "つき", nami: "なみ" };
const faceImg = (navi, expr) => NAVI_BASE + "characters/" + navi + "/expressions/" + expr + ".webp";
const fullImg = (navi, pose) => NAVI_BASE + "characters/" + navi + "/fullbody/" + pose + ".webp";
const EXPR = { normal: "01-normal-smile", happy: "02-happy", encourage: "07-encouraging" };

const PHASES = {
  knowledge: { num: "①", label: "くらべて気づく", hint: "観察の記録をくらべて、ちがいを見つけよう。" },
  preparation: { num: "②", label: "予想してためす", hint: "予想を立てて、カードを2つのグループに分けよう。" },
  consideration: { num: "③", label: "発見をまとめる", hint: "結果（証拠）をもとに、まとめを選ぼう。" }
};
const PHASE_ORDER = ["knowledge", "preparation", "consideration"];

const UNITS = window.SCIENCE_UNITS || [];
const UNIT_BY_ID = new Map(UNITS.map(u => [u.id, u]));
const QUESTION_BY_KEY = new Map(); // "unitId.phase.qid" -> {unit, phase, q}
UNITS.forEach(unit => {
  PHASE_ORDER.forEach(phase => {
    (unit[phase] || []).forEach(q => QUESTION_BY_KEY.set(unit.id + "." + phase + "." + q.id, { unit, phase, q }));
  });
});
const MANIFESTS = window.RikaLabManifests || {};
const GAME = window.RikaGame;

// ---------- 記録 ----------
function defaultState() {
  return {
    settings: { sound: true, furigana: true },
    xp: 0,
    xpRewards: {},
    discoveries: {},
    done: {},       // "unitId.phase" -> true
    mistakes: [],   // [{unitId, phase, qid}] 選択問題のみ
    labVisits: {},  // unitId -> 回数
    labMissions: {} // unitId -> { missionId: true } LABのあそびミッション達成
  };
}
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!raw) return defaultState();
    const d = defaultState();
    if (raw.settings) { d.settings.sound = raw.settings.sound !== false; d.settings.furigana = raw.settings.furigana !== false; }
    d.xp = Math.max(0, raw.xp | 0);
    if (raw.xpRewards && typeof raw.xpRewards === "object") d.xpRewards = raw.xpRewards;
    if (raw.discoveries && typeof raw.discoveries === "object") d.discoveries = raw.discoveries;
    if (raw.done && typeof raw.done === "object") d.done = raw.done;
    if (raw.labVisits && typeof raw.labVisits === "object") d.labVisits = raw.labVisits;
    if (raw.labMissions && typeof raw.labMissions === "object") d.labMissions = raw.labMissions;
    d.mistakes = Array.isArray(raw.mistakes)
      ? raw.mistakes.filter(m => m && QUESTION_BY_KEY.has(m.unitId + "." + m.phase + "." + m.qid))
      : [];
    return d;
  } catch { return defaultState(); }
}
const state = loadState();
function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* 保存できなくても続ける */ } }

// ---------- 音 ----------
class SoundController {
  constructor() { this.context = null; this.recipes = Array.isArray(soundList) ? soundList : []; }
  play(id) {
    if (!state.settings.sound || !this.recipes.length) return;
    const recipe = this.recipes.find(item => item.id === id);
    if (!recipe) return;
    try {
      if (!this.context) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.context = new AC();
      }
      if (this.context.state === "suspended") this.context.resume();
      recipe.play(this.context, 0.72);
    } catch { /* 効果音の失敗で操作を止めない */ }
  }
}
const sounds = new SoundController();

// ---------- 小物 ----------
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function shuffle(items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function celebrateFX() {
  try {
    const el = document.createElement("div");
    el.className = "fx-burst";
    el.innerHTML = '<div class="fx-mark">○<small>やったね！</small></div>' +
      Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}">${i % 3 === 0 ? "🌸" : i % 3 === 1 ? "✨" : "🎉"}</i>`).join("");
    document.body.append(el);
    setTimeout(() => el.remove(), 1150);
  } catch { /* 演出の失敗で操作を止めない */ }
}

// 発見・ランクアップのお知らせはキューに入れ、節目の画面で順に表示する
const pendingNotices = [];
function flushNotices() {
  if (!pendingNotices.length || overlayRoot.firstChild) return;
  const notice = pendingNotices.shift();
  const el = document.createElement("div");
  el.className = "notice-overlay";
  el.innerHTML = `<div class="notice-pop" role="dialog" aria-modal="true">
    <p class="notice-kind">${notice.kind === "rank" ? "RANK UP!" : notice.kind === "major" ? "★ 大発見！" : "🔍 新しい発見！"}</p>
    <h2>${esc(notice.title)}</h2><p>${esc(notice.text)}</p>
    <button class="primary-button" type="button" data-action="notice-close">やった！</button></div>`;
  overlayRoot.append(el);
}
function queueDiscovery(key, title, text, kind) {
  if (state.discoveries[key]) return;
  state.discoveries[key] = true;
  pendingNotices.push({ kind: kind || "discovery", title, text });
  persist();
}

function awardItem(unitId, phase, itemId, phaseWasDone) {
  const key = unitId + "." + phase + "." + itemId;
  let gained = 0;
  if (!state.xpRewards[key]) { gained = GAME.PHASE_XP[phase] || 10; state.xpRewards[key] = true; }
  else if (phaseWasDone && !state.xpRewards["retry." + key]) { gained = GAME.RETRY_XP; state.xpRewards["retry." + key] = true; }
  if (gained) {
    const before = GAME.rankInfo(state.xp);
    state.xp += gained;
    const after = GAME.rankInfo(state.xp);
    if (after.index > before.index) {
      pendingNotices.push({ kind: "rank", title: after.name + " になった！", text: "研究XP " + after.xp + " XP。次の発見も楽しみだね。" });
    }
    persist();
  }
}

function completePhase(unitId, phase) {
  const key = unitId + "." + phase;
  if (state.done[key]) return;
  state.done[key] = true;
  const disc = GAME.PHASE_DISCOVERY[phase];
  queueDiscovery(unitId + "." + phase, disc.label + "｜" + UNIT_BY_ID.get(unitId).title, disc.text, "discovery");
  const allDone = PHASE_ORDER.every(p => state.done[unitId + "." + p]);
  if (allDone && !state.discoveries["major." + unitId]) {
    state.xp += GAME.UNIT_COMPLETE_XP;
    queueDiscovery("major." + unitId, "大発見｜" + UNIT_BY_ID.get(unitId).title, GAME.FACTS[unitId], "major");
  }
  persist();
}

// ---------- 画面遷移 ----------
let view = { name: "home" };
let labCleanup = null;
let session = null;

function leaveLab() {
  if (labCleanup) { try { labCleanup(); } catch { /* noop */ } labCleanup = null; }
  window.RikaLabComment = null;
}
function go(next) {
  leaveLab();
  session = null;
  view = next;
  render();
  window.scrollTo(0, 0);
}
const goHome = () => go({ name: "home" });
const goUnit = unitId => go({ name: "unit", unitId });
const goRecords = () => go({ name: "records" });
const goCatalog = () => go({ name: "catalog" });

function render() {
  syncHeader();
  if (view.name === "home") renderHome();
  else if (view.name === "unit") renderUnit(view.unitId);
  else if (view.name === "phases") renderPhases(view.unitId);
  else if (view.name === "quiz") renderQuiz();
  else if (view.name === "prep") renderPrep();
  else if (view.name === "result") renderResult();
  else if (view.name === "tokun") renderTokun();
  else if (view.name === "records") renderRecords();
  else if (view.name === "catalog") renderCatalog();
  else if (view.name === "lab") renderLab(view.unitId);
  if (["home", "unit", "records", "catalog"].includes(view.name)) flushNotices();
  if (window.Furigana && state.settings.furigana) window.Furigana.apply(root);
}

function syncHeader() {
  const soundBtn = document.querySelector('[data-action="toggle-sound"]');
  const furiBtn = document.querySelector('[data-action="toggle-furigana"]');
  if (soundBtn) { soundBtn.textContent = state.settings.sound ? "🔊 音 ON" : "🔇 音 OFF"; soundBtn.setAttribute("aria-pressed", String(state.settings.sound)); }
  if (furiBtn) { furiBtn.textContent = state.settings.furigana ? "ふりがな ON" : "ふりがな OFF"; furiBtn.setAttribute("aria-pressed", String(state.settings.furigana)); }
}

function naviFace(unitId, expr, sizeClass) {
  const navi = UNIT_NAVI[unitId];
  return `<img class="navi-face ${sizeClass || ""}" src="${faceImg(navi, expr)}" alt="${NAVI_NAMES[navi]}" loading="lazy">`;
}
function phaseDots(unit) {
  return PHASE_ORDER.map(p => `<span class="phase-dot ${state.done[unit.id + "." + p] ? "is-done" : ""}" title="${PHASES[p].label}">${state.done[unit.id + "." + p] ? "✓" : PHASES[p].num}</span>`).join("");
}
function unitMistakeCount(unitId) { return state.mistakes.filter(m => m.unitId === unitId).length; }

// ---------- トップ ----------
function renderHome() {
  const info = GAME.rankInfo(state.xp);
  const found = Object.keys(state.discoveries).length;
  view = { name: "home" };
  root.innerHTML = `
  <section class="hero">
    <img class="hero-group" src="${GROUP_IMG}" alt="ナビキャラ6人">
    <div class="hero-text">
      <h1>観察して、ためして、見つけよう</h1>
      <p>10の単元で、LABのシミュレーションと問題に取り組みます。まちがえた問題は「とっくん」でもう一度できます。</p>
    </div>
  </section>
  <section class="rank-strip" aria-label="研究ランク">
    <div class="rank-main">
      <span class="rank-kicker">研究ランク</span>
      <b>${esc(info.name)} <small>Lv.${info.level}</small></b>
      <span class="rank-next">${info.isMax ? "最高ランクに到達！" : "あと " + info.remain + " XPで「" + esc(info.nextName) + "」"}</span>
    </div>
    <div class="rank-meter"><span style="width:${info.pct}%"></span></div>
    <div class="rank-xp">${info.xp} ${info.isMax ? "XP" : "/ " + info.nextXp + " XP"}</div>
    <button class="secondary-button" type="button" data-action="open-catalog">🔍 発見図鑑 ${found} / ${GAME.TOTAL_DISCOVERIES}</button>
  </section>
  <section class="unit-grid" aria-label="単元一覧">
    ${UNITS.map(unit => {
      const navi = UNIT_NAVI[unit.id];
      const mc = unitMistakeCount(unit.id);
      const complete = PHASE_ORDER.every(p => state.done[unit.id + "." + p]);
      return `<button class="unit-card" type="button" data-action="open-unit" data-unit="${unit.id}" style="--unit:${unit.color};--unit-pale:${unit.pale}">
        <span class="unit-card-top"><span class="unit-icon" aria-hidden="true">${unit.icon}</span>
        <img class="navi-face small" src="${faceImg(navi, EXPR.normal)}" alt="${NAVI_NAMES[navi]}" loading="lazy"></span>
        <b>${esc(unit.title)}</b>
        <span class="unit-summary">${esc(unit.summary)}</span>
        <span class="unit-card-foot">${phaseDots(unit)}${complete ? '<span class="unit-complete">★ 大発見ずみ</span>' : ""}${mc ? `<span class="mistake-badge">まちがい ${mc}件</span>` : ""}</span>
      </button>`;
    }).join("")}
  </section>
  <section class="home-links">
    ${state.mistakes.length ? `<button class="link-card tokun-card" type="button" data-action="open-tokun">
      <b>✏️ とっくん（まちがえた問題）</b><span>${state.mistakes.length}件 たまっています。正解すると消えます。</span></button>` : ""}
    <button class="link-card" type="button" data-action="open-records"><b>📒 学習の記録</b><span>単元ごとの進み具合と研究ランクを見ます。</span></button>
    <button class="link-card" type="button" data-action="open-catalog"><b>🔍 発見図鑑</b><span>集めた発見は ${found} / ${GAME.TOTAL_DISCOVERIES} 件です。</span></button>
  </section>`;
}

// ---------- 単元ページ ----------
function renderUnit(unitId) {
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) return goHome();
  const navi = UNIT_NAVI[unitId];
  const mc = unitMistakeCount(unitId);
  view = { name: "unit", unitId };
  root.innerHTML = `
  <nav class="crumbs"><button class="text-button" type="button" data-action="home">← トップ</button></nav>
  <section class="unit-hero" style="--unit:${unit.color};--unit-pale:${unit.pale}">
    <img class="unit-full" src="${fullImg(navi, "waving")}" alt="${NAVI_NAMES[navi]}" loading="lazy">
    <div class="unit-hero-text">
      <p class="eyebrow">${unit.icon} 小学3年・理科</p>
      <h1>${esc(unit.title)}</h1>
      <div class="navi-comment">${naviFace(unitId, EXPR.normal)}<p><b>${NAVI_NAMES[navi]}</b>「${esc(unit.bigIdea)}」</p></div>
      <div class="unit-progress">${phaseDots(unit)}<span class="unit-progress-text">${PHASE_ORDER.filter(p => state.done[unitId + "." + p]).length} / 3 フェイズ完了${mc ? ` ・ まちがい ${mc}件` : ""}</span></div>
    </div>
  </section>
  <section class="unit-actions">
    <button class="big-action lab-action" type="button" data-action="open-lab" data-unit="${unitId}" style="--unit:${unit.color}">
      <b>🧪 LABでためす</b><span>${esc(MANIFESTS[unitId] ? MANIFESTS[unitId].summary : "")}</span></button>
    <button class="big-action quiz-action" type="button" data-action="open-phases" data-unit="${unitId}" style="--unit:${unit.color}">
      <b>✏️ もんだい</b><span>3つのフェイズで、基本を何度もたしかめます。</span></button>
  </section>
  ${mc ? `<button class="link-card tokun-card" type="button" data-action="open-tokun-unit" data-unit="${unitId}">
    <b>✏️ この単元のとっくん</b><span>まちがえた問題が ${mc}件 あります。正解すると消えます。</span></button>` : ""}`;
}

function renderPhases(unitId) {
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) return goHome();
  view = { name: "phases", unitId };
  root.innerHTML = `
  <nav class="crumbs"><button class="text-button" type="button" data-action="open-unit" data-unit="${unitId}">← ${esc(unit.title)}</button></nav>
  <section class="page-head" style="--unit:${unit.color}">
    ${naviFace(unitId, EXPR.normal)}
    <div><h1>${esc(unit.title)}｜もんだい</h1><p>好きなフェイズから始められます。何度でも取り組めます。</p></div>
  </section>
  <section class="phase-list">
    ${PHASE_ORDER.map(phase => {
      const count = (unit[phase] || []).length;
      const done = state.done[unitId + "." + phase];
      return `<button class="phase-card" type="button" data-action="start-phase" data-unit="${unitId}" data-phase="${phase}" style="--unit:${unit.color}">
        <span class="phase-num">${PHASES[phase].num}</span>
        <span class="phase-main"><b>${PHASES[phase].label}</b><small>${esc(PHASES[phase].hint)}</small></span>
        <span class="phase-state">${done ? "✓ 完了（もう一度もOK）" : "全" + count + (phase === "preparation" ? "活動" : "問")}</span>
      </button>`;
    }).join("")}
  </section>`;
}

// ---------- 選択問題（フェイズ／とっくん共通） ----------
function startQuiz(unitId, phase) {
  const unit = UNIT_BY_ID.get(unitId);
  session = {
    mode: "quiz", unitId, phase,
    items: (unit[phase] || []).slice(),
    index: 0, correctCount: 0,
    phaseWasDone: Boolean(state.done[unitId + "." + phase]),
    current: null
  };
  sounds.play("start");
  view = { name: "quiz" };
  nextQuestion();
  render();
}
function startTokun(unitId) {
  const pool = state.mistakes.filter(m => !unitId || m.unitId === unitId);
  if (!pool.length) return unitId ? goUnit(unitId) : goHome();
  session = {
    mode: "tokun", unitId: unitId || null,
    items: shuffle(pool).map(m => QUESTION_BY_KEY.get(m.unitId + "." + m.phase + "." + m.qid)).filter(Boolean),
    index: 0, correctCount: 0, cleared: 0,
    current: null
  };
  sounds.play("start");
  view = { name: "tokun" };
  nextQuestion();
  render();
}
function nextQuestion() {
  const entry = session.items[session.index];
  if (!entry) return;
  const q = session.mode === "tokun" ? entry.q : entry;
  // 選択肢は必ずシャッフルし、正解（choices[answer]）の位置を追跡する。
  const order = shuffle(q.choices.map((_, i) => i));
  session.current = { entry, q, order, picked: null, correctIndex: order.indexOf(q.answer) };
}

function questionHead(entry, q) {
  if (session.mode === "tokun") {
    const unit = entry.unit;
    return { unit, label: "とっくん｜" + unit.title + "・" + PHASES[entry.phase].label };
  }
  const unit = UNIT_BY_ID.get(session.unitId);
  return { unit, label: PHASES[session.phase].num + " " + PHASES[session.phase].label + "｜" + unit.title };
}

function renderQuiz() { renderQuestion(); }
function renderTokun() { renderQuestion(); }

function renderQuestion() {
  const { entry, q, order, picked } = session.current;
  const { unit, label } = questionHead(entry, q);
  const answered = picked !== null;
  const isCorrect = answered && order[picked] === q.answer;
  const total = session.items.length;
  const navi = UNIT_NAVI[unit.id];
  const topBox = q.pair
    ? `<div class="pair-box">${q.pair.map(t => `<span>${esc(t)}</span>`).join("")}</div>`
    : q.evidence
      ? `<div class="evidence-box"><span>証拠（結果）</span><p>${esc(q.evidence)}</p></div>`
      : "";
  const face = !answered ? EXPR.normal : isCorrect ? EXPR.happy : EXPR.encourage;
  const comment = !answered
    ? PHASES[session.mode === "tokun" ? entry.phase : session.phase].hint
    : isCorrect ? "そのとおり！ 解説も読んでみよう。" : "だいじょうぶ。解説を読んで、もう一度考えよう。";
  root.innerHTML = `
  <nav class="crumbs"><button class="text-button" type="button" data-action="${session.mode === "tokun" ? (session.unitId ? "open-unit" : "home") : "open-phases"}" data-unit="${session.mode === "tokun" ? (session.unitId || "") : session.unitId}">← やめる</button>
  <span class="crumb-label">${esc(label)}</span><span class="crumb-count">${session.index + 1} / ${total}問</span></nav>
  <section class="question-card" style="--unit:${unit.color};--unit-pale:${unit.pale}">
    <div class="navi-comment">${naviFace(unit.id, face)}<p><b>${NAVI_NAMES[navi]}</b>「${esc(comment)}」</p></div>
    ${topBox}
    <h1 class="question-prompt">${esc(q.prompt)}</h1>
    <div class="choices">
      ${order.map((choiceIndex, pos) => {
        let cls = "choice-button";
        if (answered) {
          if (choiceIndex === q.answer) cls += " is-correct";
          else if (pos === picked) cls += " is-wrong";
          else cls += " is-dim";
        }
        return `<button class="${cls}" type="button" data-action="answer" data-pos="${pos}" ${answered ? "disabled" : ""}>${esc(q.choices[choiceIndex])}</button>`;
      }).join("")}
    </div>
    ${answered ? `<div class="feedback ${isCorrect ? "is-correct" : "is-wrong"}">
      <b>${isCorrect ? "⭕ 正解！" : "❌ もう一度考えよう"}</b>
      <p>${esc(q.explanation)}</p>
      <button class="primary-button" type="button" data-action="next-question">${session.index + 1 >= total ? "結果を見る" : "次の問題へ"}</button>
    </div>` : ""}
  </section>`;
}

function answerQuestion(pos) {
  const cur = session.current;
  if (!cur || cur.picked !== null) return;
  cur.picked = pos;
  const { entry, q } = cur;
  const unit = entry.unit || UNIT_BY_ID.get(session.unitId);
  const phase = session.mode === "tokun" ? entry.phase : session.phase;
  const correct = cur.order[pos] === q.answer;
  if (correct) {
    session.correctCount += 1;
    sounds.play("correct");
    if (session.mode === "tokun") {
      state.mistakes = state.mistakes.filter(m => !(m.unitId === unit.id && m.phase === phase && m.qid === q.id));
      session.cleared += 1;
      persist();
    } else {
      awardItem(unit.id, phase, q.id, session.phaseWasDone);
    }
  } else {
    sounds.play("wrong");
    if (session.mode === "quiz") {
      const exists = state.mistakes.some(m => m.unitId === unit.id && m.phase === phase && m.qid === q.id);
      if (!exists) { state.mistakes.push({ unitId: unit.id, phase, qid: q.id }); persist(); }
    }
  }
  renderQuestion();
  if (window.Furigana && state.settings.furigana) window.Furigana.apply(root);
}

function advanceQuestion() {
  session.index += 1;
  if (session.index >= session.items.length) return finishSession();
  nextQuestion();
  render();
  window.scrollTo(0, 0);
}

function finishSession() {
  if (session.mode === "quiz") {
    completePhase(session.unitId, session.phase);
    view = { name: "result", kind: "quiz", unitId: session.unitId, phase: session.phase, correct: session.correctCount, total: session.items.length };
  } else {
    view = { name: "result", kind: "tokun", unitId: session.unitId, correct: session.correctCount, total: session.items.length, cleared: session.cleared, remaining: state.mistakes.filter(m => !session.unitId || m.unitId === session.unitId).length };
  }
  session = null;
  render();
  window.scrollTo(0, 0);
}

// ---------- 分類活動（preparation） ----------
let prepState = null;
function startPrep(unitId) {
  const unit = UNIT_BY_ID.get(unitId);
  session = {
    mode: "prep", unitId, phase: "preparation",
    items: (unit.preparation || []).slice(),
    index: 0,
    phaseWasDone: Boolean(state.done[unitId + ".preparation"])
  };
  prepState = null;
  sounds.play("start");
  view = { name: "prep" };
  setupPrepItem();
  render();
}
function setupPrepItem() {
  const item = session.items[session.index];
  prepState = {
    item,
    tray: shuffle(item.cards.map((card, i) => ({ key: i, text: card.text, bucket: card.bucket }))),
    placed: {}, // key -> bucketId
    selected: null,
    checked: false,
    wrongCount: 0
  };
}
function renderPrep() {
  const unit = UNIT_BY_ID.get(session.unitId);
  const { item } = prepState;
  view = { name: "prep" };
  const allPlaced = prepState.tray.every(card => prepState.placed[card.key]);
  const trayCards = prepState.tray.filter(card => !prepState.placed[card.key]);
  root.innerHTML = `
  <nav class="crumbs"><button class="text-button" type="button" data-action="open-phases" data-unit="${unit.id}">← やめる</button>
  <span class="crumb-label">${PHASES.preparation.num} ${PHASES.preparation.label}｜${esc(unit.title)}</span><span class="crumb-count">${session.index + 1} / ${session.items.length}活動</span></nav>
  <section class="question-card prep-card" style="--unit:${unit.color};--unit-pale:${unit.pale}">
    <div class="navi-comment">${naviFace(unit.id, prepState.checked ? EXPR.happy : EXPR.normal)}<p><b>${NAVI_NAMES[UNIT_NAVI[unit.id]]}</b>「カードをえらんでから、グループをタップして入れよう。」</p></div>
    <h1 class="question-prompt">${esc(item.title)}</h1>
    <div class="prediction-box"><span>予想</span><p>${esc(item.prediction)}</p></div>
    <p class="prep-lead">${esc(item.lead)}</p>
    <div class="prep-tray" aria-label="カード置き場">
      ${trayCards.length ? trayCards.map(card => `<button class="prep-chip ${prepState.selected === card.key ? "is-selected" : ""}" type="button" data-action="prep-pick" data-key="${card.key}">${esc(card.text)}</button>`).join("") : '<span class="prep-tray-empty">カードは全部グループに入りました</span>'}
    </div>
    <div class="prep-buckets">
      ${item.buckets.map(bucket => {
        const cards = prepState.tray.filter(card => prepState.placed[card.key] === bucket.id);
        return `<div class="prep-bucket" data-bucket="${bucket.id}">
          <button class="prep-bucket-head" type="button" data-action="prep-place" data-bucket="${bucket.id}">${esc(bucket.label)}</button>
          <div class="prep-bucket-cards">${cards.map(card => `<button class="prep-chip in-bucket" type="button" data-action="prep-unplace" data-key="${card.key}">${esc(card.text)}</button>`).join("")}</div>
        </div>`;
      }).join("")}
    </div>
    ${prepState.wrongMessage ? `<p class="prep-wrong" role="alert">${esc(prepState.wrongMessage)}</p>` : ""}
    ${prepState.checked
      ? `<div class="feedback is-correct"><b>⭕ 全部合っている！</b><p>${esc(item.explanation)}</p>
         <button class="primary-button" type="button" data-action="prep-next">${session.index + 1 >= session.items.length ? "結果を見る" : "次の活動へ"}</button></div>`
      : `<button class="primary-button prep-check" type="button" data-action="prep-check" ${allPlaced ? "" : "disabled"}>こたえあわせ</button>`}
  </section>`;
}

function prepCheck() {
  const wrong = prepState.tray.filter(card => prepState.placed[card.key] !== card.bucket);
  if (!wrong.length) {
    prepState.checked = true;
    prepState.wrongMessage = "";
    sounds.play("correct");
    awardItem(session.unitId, "preparation", prepState.item.id, session.phaseWasDone);
  } else {
    sounds.play("wrong");
    wrong.forEach(card => { delete prepState.placed[card.key]; });
    prepState.selected = null;
    prepState.wrongCount += 1;
    prepState.wrongMessage = wrong.length + "つ グループがちがうカードがあったよ。もどしたから、もう一度考えて入れよう。";
  }
  renderPrep();
  if (window.Furigana && state.settings.furigana) window.Furigana.apply(root);
}
function prepNext() {
  session.index += 1;
  if (session.index >= session.items.length) {
    completePhase(session.unitId, "preparation");
    view = { name: "result", kind: "prep", unitId: session.unitId, phase: "preparation", correct: session.items.length, total: session.items.length };
    session = null; prepState = null;
    render();
    window.scrollTo(0, 0);
    return;
  }
  setupPrepItem();
  renderPrep();
  window.scrollTo(0, 0);
}

// ---------- 結果画面 ----------
function renderResult() {
  const r = view;
  const unit = r.unitId ? UNIT_BY_ID.get(r.unitId) : null;
  let body = "";
  if (r.kind === "tokun") {
    const clearedAll = r.remaining === 0;
    body = `
    <section class="result-card">
      ${clearedAll ? `<img class="result-group" src="${GROUP_CELEB_IMG}" alt="ナビキャラ6人" loading="lazy">` : (unit ? `<img class="result-full" src="${fullImg(UNIT_NAVI[unit.id], "complete")}" alt="" loading="lazy">` : "")}
      <h1>${clearedAll ? "🎉 克服！ まちがえた問題が全部消えた！" : "とっくん おつかれさま"}</h1>
      <p class="result-score">${r.total}問中 ${r.correct}問 正解 ・ ${r.cleared}件 克服</p>
      ${clearedAll ? "" : `<p>のこり ${r.remaining}件。また とっくんで取り組めます。</p>`}
      <div class="result-actions">
        ${r.unitId ? `<button class="primary-button" type="button" data-action="open-unit" data-unit="${r.unitId}">単元ページへ</button>` : `<button class="primary-button" type="button" data-action="home">トップへ</button>`}
        ${!clearedAll ? `<button class="secondary-button" type="button" data-action="${r.unitId ? "open-tokun-unit" : "open-tokun"}" ${r.unitId ? `data-unit="${r.unitId}"` : ""}>もう一度とっくん</button>` : ""}
      </div>
    </section>`;
    if (clearedAll) { celebrateFX(); sounds.play("clear"); }
  } else {
    const phase = PHASES[r.phase];
    body = `
    <section class="result-card" style="--unit:${unit.color};--unit-pale:${unit.pale}">
      <img class="result-full" src="${fullImg(UNIT_NAVI[unit.id], "complete")}" alt="${NAVI_NAMES[UNIT_NAVI[unit.id]]}" loading="lazy">
      <h1>${phase.num} ${phase.label} 完了！</h1>
      <p class="result-score">${esc(unit.title)}｜${r.kind === "prep" ? "全" + r.total + "活動 完了" : r.total + "問中 " + r.correct + "問 正解"}</p>
      <p>${r.kind === "prep" ? "予想してためす活動が全部できました。LABでもためしてみよう。" : r.correct === r.total ? "全部正解、すごい！ LABでもためしてみよう。" : "まちがえた問題は「とっくん」に記録したよ。あとで取り組めます。"}</p>
      <div class="result-actions">
        <button class="primary-button" type="button" data-action="open-unit" data-unit="${unit.id}">単元ページへ</button>
        <button class="secondary-button" type="button" data-action="open-lab" data-unit="${unit.id}">LABでためす</button>
      </div>
    </section>`;
    celebrateFX();
    sounds.play("clear");
  }
  root.innerHTML = body;
  flushNotices();
}

// ---------- 学習の記録 ----------
function renderRecords() {
  const info = GAME.rankInfo(state.xp);
  const found = Object.keys(state.discoveries).length;
  view = { name: "records" };
  root.innerHTML = `
  <nav class="crumbs"><button class="text-button" type="button" data-action="home">← トップ</button></nav>
  <section class="page-head"><div><h1>📒 学習の記録</h1><p>単元ごとの進み具合と、研究ランクです。</p></div></section>
  <section class="rank-strip">
    <div class="rank-main"><span class="rank-kicker">研究ランク</span>
      <b>${esc(info.name)} <small>Lv.${info.level}</small></b>
      <span class="rank-next">${info.isMax ? "最高ランクに到達！" : "あと " + info.remain + " XPで「" + esc(info.nextName) + "」"}</span></div>
    <div class="rank-meter"><span style="width:${info.pct}%"></span></div>
    <div class="rank-xp">${info.xp} ${info.isMax ? "XP" : "/ " + info.nextXp + " XP"}</div>
    <button class="secondary-button" type="button" data-action="open-catalog">🔍 発見 ${found} / ${GAME.TOTAL_DISCOVERIES}</button>
  </section>
  <p class="records-summary">まちがえた問題の残り：<b>${state.mistakes.length}件</b>（とっくんで正解すると消えます）</p>
  <section class="records-list">
    ${UNITS.map(unit => {
      const doneCount = PHASE_ORDER.filter(p => state.done[unit.id + "." + p]).length;
      const unitCatalog = GAME.catalogItems(state.discoveries).filter(i => i.unitId === unit.id);
      const disc = unitCatalog.filter(i => i.found).length;
      return `<article class="record-row" style="--unit:${unit.color};--unit-pale:${unit.pale}">
        <span class="unit-icon" aria-hidden="true">${unit.icon}</span>
        <div class="record-main"><b>${esc(unit.title)}</b>
          <span>${PHASE_ORDER.map(p => `<span class="record-phase ${state.done[unit.id + "." + p] ? "is-done" : ""}">${PHASES[p].num}${PHASES[p].label}${state.done[unit.id + "." + p] ? " ✓" : ""}</span>`).join("")}</span>
        </div>
        <div class="record-side"><span>進み ${doneCount} / 3</span><span>発見 ${disc} / ${unitCatalog.length}</span><span>まちがい ${unitMistakeCount(unit.id)}件</span><span>LAB ${state.labVisits[unit.id] || 0}回</span></div>
        <button class="secondary-button" type="button" data-action="open-unit" data-unit="${unit.id}">開く</button>
      </article>`;
    }).join("")}
  </section>`;
}

// ---------- 発見図鑑 ----------
function renderCatalog() {
  const items = GAME.catalogItems(state.discoveries);
  const found = items.filter(i => i.found).length;
  view = { name: "catalog" };
  root.innerHTML = `
  <nav class="crumbs"><button class="text-button" type="button" data-action="home">← トップ</button></nav>
  <section class="page-head"><div><h1>🔍 発見図鑑 ${found} / ${items.length}</h1><p>フェイズを進めると発見が集まります。単元を全部進めると「大発見」。LABのあそびミッションでも発見が増えます。</p></div></section>
  <section class="discovery-grid">
    ${items.map(item => {
      const unit = UNIT_BY_ID.get(item.unitId);
      return `<article class="discovery-card ${item.found ? "is-found" : ""}" style="--unit:${unit.color};--unit-pale:${unit.pale}">
        <span class="discovery-icon">${item.found ? (item.kind === "major" ? "★" : item.kind === "lab" ? "🎯" : "🔍") : "？"}</span>
        <b>${item.found ? esc(item.title) : "？？？"}</b>
        <small>${esc(unit.title)}｜${item.found ? esc(item.text) : (item.kind === "lab" ? "LABのあそびミッションで見つかるよ" : "この単元の学習を進めると見つかるよ")}</small>
      </article>`;
    }).join("")}
  </section>`;
}

// ---------- LAB ----------
const LAB_REACTIONS = [
  "条件を1つだけ変えると、比べやすいよ。",
  "「記録」ボタンで、実験ノートに残せるよ。",
  "ちがう条件でもためしてみよう。",
  "前と比べて、どこが変わったか見てみよう。"
];
let labReactionIndex = 0;
function renderLab(unitId) {
  const unit = UNIT_BY_ID.get(unitId);
  const manifest = MANIFESTS[unitId];
  const factory = window.RikaThreeSimulations && window.RikaThreeSimulations[unitId];
  if (!unit || !manifest || !factory || !window.RikaThreeLabCore) return goUnit(unitId);
  state.labVisits[unitId] = (state.labVisits[unitId] || 0) + 1;
  persist();
  view = { name: "lab", unitId };
  labReactionIndex = 0;
  const navi = UNIT_NAVI[unitId];
  root.innerHTML = `
  <div class="lab-navi-comment" id="lab-navi">
    ${naviFace(unitId, EXPR.normal)}
    <p><b>${NAVI_NAMES[navi]}</b><span id="lab-navi-text">「${esc(manifest.summary)} 条件を変えて、ためしてみよう！」</span></p>
  </div>
  <div id="lab-host"></div>`;
  const host = {
    routeTo: () => goUnit(unitId),
    showToast: message => {
      const el = document.createElement("div");
      el.className = "toast";
      el.textContent = message;
      document.body.append(el);
      setTimeout(() => el.remove(), 1800);
    },
    missionDone: (mUnitId, missionId) => Boolean(state.labMissions[mUnitId] && state.labMissions[mUnitId][missionId]),
    onMission: (mUnitId, mission) => {
      if (!state.labMissions[mUnitId]) state.labMissions[mUnitId] = {};
      if (state.labMissions[mUnitId][mission.id]) return;
      state.labMissions[mUnitId][mission.id] = true;
      const xpKey = "labmission." + mUnitId + "." + mission.id;
      if (!state.xpRewards[xpKey]) {
        state.xpRewards[xpKey] = true;
        const before = GAME.rankInfo(state.xp);
        state.xp += GAME.LAB_MISSION_XP;
        const after = GAME.rankInfo(state.xp);
        if (after.index > before.index) {
          pendingNotices.push({ kind: "rank", title: after.name + " になった！", text: "研究XP " + after.xp + " XP。次の発見も楽しみだね。" });
        }
      }
      queueDiscovery("lab." + mUnitId + "." + mission.id, mission.title, mission.text, "discovery");
      persist();
      sounds.play("correct");
      host.showToast("🎉 ミッション達成！ 発見図鑑に記録したよ");
    }
  };
  const startedAt = Date.now();
  window.RikaLabComment = message => {
    if (Date.now() - startedAt < 600) return; // 初期表示は開会のひとことのまま
    const textEl = document.getElementById("lab-navi-text");
    if (!textEl) return;
    let reaction;
    if (/つきます|ついた|光った/.test(message)) reaction = "すごい、結果が見えたね！ 前と比べてみよう。";
    else if (/進んだ|長く|強く|大きく/.test(message)) reaction = "お、変わったね！ 条件を変えると結果も変わるね。";
    else if (/つかない|進まない|変わらない/.test(message)) reaction = "変わらないことも、大事な発見だよ。";
    else reaction = LAB_REACTIONS[labReactionIndex++ % LAB_REACTIONS.length];
    textEl.textContent = "「" + reaction + "」";
  };
  labCleanup = factory.mount(document.querySelector("#lab-host"), { core: window.RikaThreeLabCore, host, manifest });
  sounds.play("practice");
}

// ---------- 操作 ----------
document.body.addEventListener("click", event => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const unitId = target.dataset.unit;
  if (action === "home") goHome();
  else if (action === "toggle-sound") { state.settings.sound = !state.settings.sound; persist(); syncHeader(); }
  else if (action === "toggle-furigana") {
    state.settings.furigana = !state.settings.furigana;
    persist(); syncHeader();
    if (window.Furigana) window.Furigana.setEnabled(state.settings.furigana);
  }
  else if (action === "notice-close") { overlayRoot.innerHTML = ""; flushNotices(); }
  else if (action === "open-unit") goUnit(unitId);
  else if (action === "open-phases") { leaveLab(); session = null; view = { name: "phases", unitId }; render(); window.scrollTo(0, 0); }
  else if (action === "open-records") goRecords();
  else if (action === "open-catalog") goCatalog();
  else if (action === "open-lab") go({ name: "lab", unitId });
  else if (action === "open-tokun") startTokun(null);
  else if (action === "open-tokun-unit") startTokun(unitId);
  else if (action === "start-phase") {
    if (target.dataset.phase === "preparation") startPrep(unitId);
    else startQuiz(unitId, target.dataset.phase);
  }
  else if (action === "answer") answerQuestion(Number(target.dataset.pos));
  else if (action === "next-question") advanceQuestion();
  else if (action === "prep-pick") {
    const key = Number(target.dataset.key);
    prepState.selected = prepState.selected === key ? null : key;
    prepState.wrongMessage = "";
    renderPrep();
  }
  else if (action === "prep-place") {
    if (prepState && prepState.selected !== null && !prepState.checked) {
      prepState.placed[prepState.selected] = target.dataset.bucket;
      prepState.selected = null;
      renderPrep();
    }
  }
  else if (action === "prep-unplace") {
    if (prepState && !prepState.checked) {
      delete prepState.placed[Number(target.dataset.key)];
      renderPrep();
    }
  }
  else if (action === "prep-check") prepCheck();
  else if (action === "prep-next") prepNext();
});

// ---------- 起動 ----------
if (window.Furigana) window.Furigana.setEnabled(state.settings.furigana);
render();
