(() => {
  "use strict";

  const STORAGE_KEY = "rikaLab3.v1";
  const PHASES = {
    knowledge: { label: "① くらべて気づく", sub: "同じ・ちがうを見つける" },
    preparation: { label: "② 予想してためす", sub: "調べ方を組み立てる" },
    consideration: { label: "③ 発見をまとめる", sub: "結果から考える" }
  };
  const app = document.querySelector("#app");
  const toast = document.querySelector("#toast");
  const dialog = document.querySelector("#settingsDialog");
  const soundToggle = document.querySelector("#soundToggle");
  let answerState = { selected: null, checked: false, assignments: {}, selectedCard: null };
  let reviewState = null;
  const sessionItems = {};

  function defaultData() { return { version: 1, completed: {}, attempts: {}, mistakes: {}, sound: false }; }
  function loadData() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return raw && raw.version === 1 ? { ...defaultData(), ...raw } : defaultData();
    } catch (_) { return defaultData(); }
  }
  let data = loadData();
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const activityKey = (unitId, phase, id) => `${unitId}.${phase}.${id}`;
  const unitById = id => window.SCIENCE_UNITS.find(unit => unit.id === id);
  const itemsFor = (unit, phase) => unit?.[phase] || [];
  function sessionFor(unit, phase) { const key=`${unit.id}.${phase}`; if(!sessionItems[key]) { const all=itemsFor(unit,phase), unfinished=all.filter(item=>!data.completed[activityKey(unit.id,phase,item.id)]), source=unfinished.length?unfinished:all; sessionItems[key]=[...source].sort(()=>Math.random()-.5).slice(0,Math.min(3,source.length)).map(item=>item.id); } return itemsFor(unit,phase).filter(item=>sessionItems[key].includes(item.id)); }
  const totalActivities = unit => Object.keys(PHASES).reduce((sum, phase) => sum + itemsFor(unit, phase).length, 0);
  const completedCount = unit => Object.keys(PHASES).reduce((sum, phase) => sum + itemsFor(unit, phase).filter(item => data.completed[activityKey(unit.id, phase, item.id)]).length, 0);
  const unitPercent = unit => Math.round(completedCount(unit) / totalActivities(unit) * 100);
  const phaseDone = (unit, phase) => itemsFor(unit, phase).every(item => data.completed[activityKey(unit.id, phase, item.id)]);
  const overall = () => {
    const total = window.SCIENCE_UNITS.reduce((sum, unit) => sum + totalActivities(unit), 0);
    const done = window.SCIENCE_UNITS.reduce((sum, unit) => sum + completedCount(unit), 0);
    return { done, total, percent: Math.round(done / total * 100) };
  };
  const escapeHtml = value => String(value).replace(/[&<>"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[char]));
  function orderedChoices(item) {
    const list = item.choices.map((text, original) => ({ text, original }));
    let seed = Array.from(item.id).reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
    for (let i = list.length - 1; i > 0; i -= 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function routeTo(path) { location.hash = path; if (location.hash === path) render(); }
  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] === "unit") return { page: "unit", unitId: parts[1], phase: PHASES[parts[2]] ? parts[2] : "knowledge", index: Math.max(0, Number(parts[3]) || 0) };
    if (parts[0] === "review") return { page: "review" };
    if (parts[0] === "discoveries") return { page: "discoveries" };
    return { page: "home" };
  }
  const unitStyle = unit => `--unit-color:${unit.color};--unit-pale:${unit.pale}`;

  function renderHome() {
    const progress = overall();
    app.innerHTML = `<section class="hero">
      <p class="eyebrow">小学3年生 理科</p>
      <h1>くらべて、ためして、<br>発見しよう。</h1>
      <p>同じところと、ちがうところに目を向けると、「どうしてだろう？」が生まれます。予想を立てて観察や実験をし、見つけたことを自分の言葉でまとめよう。</p>
      <div class="thinking-flow" aria-label="3年生の問題解決の流れ"><span>くらべる</span><b>→</b><span>気づく</span><b>→</b><span>予想してためす</span><b>→</b><span>発見をまとめる</span></div>
      <div class="overall-progress"><div class="progress-label"><span>全体の学習記録</span><span>${progress.done} / ${progress.total}</span></div><div class="progress-track" role="progressbar" aria-label="全体の進み具合" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><div class="progress-fill" style="width:${progress.percent}%"></div></div></div>
    </section>${window.ScienceGame ? window.ScienceGame.panel() : ""}
    <div class="section-heading"><h2>10の単元</h2><p>学びたい単元を選ぼう</p></div>
    <section class="unit-grid" aria-label="単元一覧">${window.SCIENCE_UNITS.map((unit, index) => `<button class="unit-card" data-unit="${unit.id}" style="${unitStyle(unit)}"><span class="unit-top"><span class="unit-icon" aria-hidden="true">${unit.icon}</span><span class="unit-number">UNIT ${index + 1}</span></span><h3>${unit.title}</h3><p>${unit.summary}</p><span class="mini-progress"><span class="progress-track"><span class="progress-fill" style="width:${unitPercent(unit)}%"></span></span><span>${unitPercent(unit)}%</span></span></button>`).join("")}</section>`;
  }

  function renderUnit(route) {
    const unit = unitById(route.unitId);
    if (!unit) return renderNotFound();
    const phase = route.phase;
    const items = sessionFor(unit, phase);
    const index = Math.min(route.index, items.length - 1);
    const item = items[index];
    answerState = { selected: null, checked: false, assignments: {}, selectedCard: null };
    app.innerHTML = `<nav class="breadcrumbs" aria-label="現在位置"><button class="text-button" data-home>単元一覧</button><span>›</span><span>${unit.title}</span></nav>
      <section class="unit-banner" style="${unitStyle(unit)}"><span class="unit-icon" aria-hidden="true">${unit.icon}</span><div><h1>${unit.title}</h1><p>${unit.bigIdea}</p></div><div class="unit-score"><b>${unitPercent(unit)}%</b><small>学習済み</small></div></section>
      <div class="phase-tabs" role="tablist" aria-label="学習の段階">${Object.entries(PHASES).map(([key, value]) => `<button class="phase-tab ${phaseDone(unit,key)?"is-done":""}" role="tab" aria-selected="${phase===key}" data-phase="${key}">${value.label}<small>${value.sub}</small></button>`).join("")}</div>
      <section class="activity-layout"><nav class="activity-nav" aria-label="この段階の問題"><h2>${PHASES[phase].label}</h2>${items.map((navItem, i) => `<button class="activity-dot ${i===index?"active":""} ${data.completed[activityKey(unit.id,phase,navItem.id)]?"done":""}" data-index="${i}">問題 ${i+1}</button>`).join("")}</nav><article class="activity-card" data-unit-id="${unit.id}" data-phase="${phase}" data-index="${index}">${phase === "preparation" ? preparationMarkup(item, index, items.length) : questionMarkup(item, index, items.length, phase)}</article></section>`;
  }

  function questionMarkup(item, index, length, phase) {
    return `<span class="activity-count">${index + 1} / ${length}　${phase === "knowledge" ? "同じところ・ちがうところに注目" : "結果から発見をまとめる"}</span><h2>${item.prompt}</h2>${item.pair ? `<div class="pair-box"><div class="pair-item">${item.pair[0]}</div><span class="pair-vs">くらべよう</span><div class="pair-item">${item.pair[1]}</div></div>` : ""}${item.evidence ? `<div class="evidence"><b>観察・実験の結果</b>${item.evidence}</div>` : ""}<div class="choices" role="group" aria-label="答えを選ぶ">${orderedChoices(item).map(choice => `<button class="choice" data-choice="${choice.original}">${escapeHtml(choice.text)}</button>`).join("")}</div><div class="answer-area"></div><div class="action-row"><button class="secondary-button" data-prev ${index===0?"disabled":""}>前へ</button><button class="primary-button" data-check disabled>答えを確かめる</button></div>`;
  }

  function preparationMarkup(item, index, length) {
    return `<span class="activity-count">${index + 1} / ${length}　予想して、確かめ方を組み立てる</span><h2>${item.title}</h2><div class="prediction"><b>予想</b>${item.prediction}</div><p class="activity-lead">${item.lead}</p><p class="sort-instruction">①カードをタップ　②入れる場所をタップ</p><div class="sort-cards">${item.cards.map((card,i) => `<button class="sort-card" data-card="${i}">${escapeHtml(card.text)}</button>`).join("")}</div><div class="buckets">${item.buckets.map(bucket => `<button class="bucket" data-bucket="${bucket.id}" type="button"><h3>${bucket.label}</h3><span class="bucket-items"></span></button>`).join("")}</div><div class="answer-area"></div><div class="action-row"><button class="secondary-button" data-prev ${index===0?"disabled":""}>前へ</button><button class="primary-button" data-check disabled>確かめ方を確認する</button></div>`;
  }

  function renderNotFound() { app.innerHTML = `<section class="empty-state"><h1>ページが見つかりません</h1><button class="primary-button" data-home>単元一覧へ</button></section>`; }
  function getCurrentContext() {
    const card = document.querySelector(".activity-card");
    if (!card) return null;
    const unit = unitById(card.dataset.unitId), phase = card.dataset.phase, index = Number(card.dataset.index);
    return { card, unit, phase, index, item: sessionFor(unit, phase)[index] };
  }
  function chooseAnswer(button) {
    if (answerState.checked) return;
    answerState.selected = Number(button.dataset.choice);
    document.querySelectorAll(".choice").forEach(el => el.classList.toggle("selected", el === button));
    document.querySelector("[data-check]").disabled = false;
  }
  function selectSortCard(button) {
    if (answerState.checked) return;
    answerState.selectedCard = Number(button.dataset.card);
    document.querySelectorAll(".sort-card").forEach(el => el.classList.toggle("selected", el === button));
  }
  function assignCard(bucketId) {
    if (answerState.checked || answerState.selectedCard === null) return;
    answerState.assignments[answerState.selectedCard] = bucketId;
    answerState.selectedCard = null; updateBuckets();
  }
  function unassignCard(cardIndex) { if (!answerState.checked) { delete answerState.assignments[cardIndex]; updateBuckets(); } }
  function updateBuckets() {
    const ctx = getCurrentContext();
    document.querySelectorAll(".sort-card").forEach((el, i) => { el.classList.toggle("assigned", answerState.assignments[i] !== undefined); el.classList.remove("selected"); });
    document.querySelectorAll(".bucket").forEach(bucket => { bucket.querySelector(".bucket-items").innerHTML = Object.entries(answerState.assignments).filter(([, value]) => value === bucket.dataset.bucket).map(([i]) => `<button class="bucket-chip" data-unassign="${i}" type="button">${escapeHtml(ctx.item.cards[Number(i)].text)} ×</button>`).join(""); });
    document.querySelector("[data-check]").disabled = Object.keys(answerState.assignments).length !== ctx.item.cards.length;
  }
  function recordAttempt(ctx, correct, wrongCards = []) {
    const key = activityKey(ctx.unit.id, ctx.phase, ctx.item.id), wasCompleted = !!data.completed[key];
    if (!data.attempts[key]) data.attempts[key] = { count: 0, firstCorrect: null };
    data.attempts[key].count += 1;
    if (data.attempts[key].firstCorrect === null) data.attempts[key].firstCorrect = correct;
    if (correct) data.completed[key] = true;
    wrongCards.forEach(i => { data.mistakes[`${key}.${i}`] = (data.mistakes[`${key}.${i}`] || 0) + 1; });
    save();
    window.ScienceGame?.award({ unitId: ctx.unit.id, phase: ctx.phase, itemId: ctx.item.id, correct, wasCompleted, unitComplete: correct && completedCount(ctx.unit) === totalActivities(ctx.unit) });
  }
  function checkAnswer() { const ctx = getCurrentContext(); if (ctx) ctx.phase === "preparation" ? checkPreparation(ctx) : checkQuestion(ctx); }
  function checkQuestion(ctx) {
    if (answerState.checked || answerState.selected === null) return;
    answerState.checked = true;
    const correct = answerState.selected === ctx.item.answer;
    recordAttempt(ctx, correct);
    document.querySelectorAll(".choice").forEach(el => { const original = Number(el.dataset.choice); el.disabled = true; el.classList.remove("selected"); if (original === ctx.item.answer) el.classList.add("correct"); if (original === answerState.selected && !correct) el.classList.add("wrong"); });
    showFeedback(correct, ctx.item.explanation); playTone(correct);
    if (correct) setNextButton(ctx);
    else { const button = document.querySelector("[data-check]"); button.disabled = false; button.textContent = "解き直す"; button.removeAttribute("data-check"); button.dataset.retryQuestion = "true"; }
  }
  function checkPreparation(ctx) {
    if (answerState.checked || Object.keys(answerState.assignments).length !== ctx.item.cards.length) return;
    const wrong = ctx.item.cards.map((card, i) => answerState.assignments[i] === card.bucket ? -1 : i).filter(i => i >= 0);
    const correct = wrong.length === 0; recordAttempt(ctx, correct, wrong);
    if (correct) { answerState.checked = true; document.querySelectorAll(".sort-card, .bucket-chip").forEach(el => el.disabled = true); showFeedback(true, ctx.item.explanation); setNextButton(ctx); }
    else { wrong.forEach(i => delete answerState.assignments[i]); updateBuckets(); showFeedback(false, `${wrong.length}枚をもう一度考えよう。合っていたカードは残しています。`); }
    playTone(correct);
  }
  function showFeedback(correct, explanation) { document.querySelector(".answer-area").innerHTML = `<div class="feedback ${correct?"correct":"wrong"}"><b>${correct ? "正解！" : "もう一度考えよう"}</b>${escapeHtml(explanation)}</div>`; }
  function setNextButton(ctx) {
    const button = document.querySelector("[data-check]");
    button.disabled = false; button.removeAttribute("data-check");
    const list = sessionFor(ctx.unit, ctx.phase);
    if (ctx.index < list.length - 1) { button.textContent = "次の問題へ"; button.dataset.next = String(ctx.index + 1); }
    else if (!phaseDone(ctx.unit, ctx.phase)) { delete sessionItems[`${ctx.unit.id}.${ctx.phase}`]; button.textContent="次の研究へ"; button.dataset.nextBatch="true"; }
    else { const keys = Object.keys(PHASES), nextPhase = keys[keys.indexOf(ctx.phase) + 1]; button.textContent = nextPhase ? "次の段階へ" : "単元一覧へ"; button.dataset.nextPhase = nextPhase || "home"; }
  }

  function startReview() {
    const pick = (items, count) => [...items].sort(() => Math.random() - .5).slice(0, Math.min(count, items.length));
    const questions = window.SCIENCE_UNITS.flatMap(unit => {
      const pool = [...(unit.knowledge || []), ...(unit.consideration || [])];
      return pick(pool, 1).map(item => ({ unitId: unit.id, item }));
    }).sort(() => Math.random() - .5);
    reviewState = { index: 0, score: 0, misses: [], finished: false, questions };
  }
  function renderReview() {
    if (!reviewState) startReview();
    if (reviewState.finished) return renderReviewResult();
    const entry = reviewState.questions[reviewState.index], unit = unitById(entry.unitId), item = entry.item;
    app.innerHTML = `<div class="review-head"><div><p class="eyebrow">10単元のまとめ</p><h1>まとめチェック</h1><p>くらべる・予想する・発見する力を、各単元からランダムに1問ずつ確かめます。</p></div><b>${reviewState.index + 1} / ${reviewState.questions.length}</b></div><article class="activity-card review-card" style="${unitStyle(unit)}"><span class="activity-count">${unit.icon} ${unit.title}</span><h2>${item.prompt}</h2><div class="evidence"><b>観察・実験の結果</b>${item.evidence}</div><div class="choices">${orderedChoices(item).map(choice=>`<button class="choice" data-review-choice="${choice.original}">${escapeHtml(choice.text)}</button>`).join("")}</div><div class="answer-area"></div></article>`;
  }
    app.querySelectorAll("[data-review-choice]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      answerReview(Number(button.dataset.reviewChoice));
    }));

  function answerReview(choiceIndex) {
    const entry = reviewState.questions[reviewState.index], correct = choiceIndex === entry.item.answer;
    if (correct) reviewState.score += 1; else reviewState.misses.push(entry);
    document.querySelectorAll("[data-review-choice]").forEach(el => { const original = Number(el.dataset.reviewChoice); el.disabled = true; if (original === entry.item.answer) el.classList.add("correct"); if (original === choiceIndex && !correct) el.classList.add("wrong"); });
    showFeedback(correct, entry.item.explanation); playTone(correct);
    const next = document.createElement("button"); next.className = "primary-button review-next"; next.textContent = reviewState.index === reviewState.questions.length - 1 ? "結果を見る" : "次の問題へ";
    next.addEventListener("click", () => { reviewState.index += 1; if (reviewState.index >= reviewState.questions.length) reviewState.finished = true; renderReview(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    document.querySelector(".answer-area").append(next);
  }
  function renderReviewResult() {
    const percent = Math.round(reviewState.score / reviewState.questions.length * 100);
    app.innerHTML = `<article class="activity-card review-card review-result"><p class="eyebrow">まとめチェック結果</p><div class="result-ring" style="--score:${percent}%"><b>${reviewState.score} / ${reviewState.questions.length}</b></div><h1>${percent === 100 ? "全問正解！" : percent >= 70 ? "あと少しでばっちり！" : "まちがいは、次の発見のもと。"}</h1><p>${reviewState.misses.length ? "観察・実験の結果を、もう一度くらべよう。" : "同じところと違うところから、発見をまとめられています。"}</p>${reviewState.misses.length ? `<div class="miss-list">${reviewState.misses.map(entry => { const unit=unitById(entry.unitId); return `<button class="miss-item text-button" data-unit="${unit.id}">${unit.icon} ${unit.title}</button>`; }).join("")}</div>` : ""}<div class="action-row"><button class="secondary-button" data-home>単元一覧へ</button><button class="primary-button" data-retry-review>もう一度</button></div></article>`;
  }
  function playTone(correct) {
    if (!data.sound) return;
    try { const AudioContext = window.AudioContext || window.webkitAudioContext, ctx = new AudioContext(), osc = ctx.createOscillator(), gain = ctx.createGain(); osc.frequency.value = correct ? 660 : 190; gain.gain.setValueAtTime(.05, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .16); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .16); } catch (_) { /* 学習は続けられる */ }
  }
  function showToast(message) { toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 1800); }
  function render() { const route = parseRoute(); if (route.page === "unit") renderUnit(route); else if (route.page === "review") renderReview(); else if (route.page === "discoveries") app.innerHTML = window.ScienceGame?.catalog() || ""; else renderHome(); app.focus({ preventScroll: true }); const focusCard = document.querySelector(".activity-card"); if (focusCard) { const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 0; const targetTop = focusCard.getBoundingClientRect().top + window.scrollY - headerHeight - 14; window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" }); } else { window.scrollTo({ top: 0, behavior: "smooth" }); } }

  document.addEventListener("click", event => {
    const target = event.target.closest("button"); if (!target) return;
    const route = parseRoute();
    if (target.matches("[data-home]")) routeTo("");
    else if (target.matches("[data-discoveries]")) routeTo("discoveries");
    else if (target.dataset.unit) routeTo(`unit/${target.dataset.unit}/knowledge/0`);
    else if (target.dataset.phase && route.page === "unit") routeTo(`unit/${route.unitId}/${target.dataset.phase}/0`);
    else if (target.dataset.index && route.page === "unit") routeTo(`unit/${route.unitId}/${route.phase}/${target.dataset.index}`);
    else if (target.matches("[data-choice]")) chooseAnswer(target);
    else if (target.matches("[data-card]")) selectSortCard(target);
    else if (target.dataset.bucket) assignCard(target.dataset.bucket);
    else if (target.dataset.unassign) unassignCard(Number(target.dataset.unassign));
    else if (target.matches("[data-check]")) checkAnswer();
    else if (target.matches("[data-retry-question]")) render();
    else if (target.matches("[data-prev]") && route.page === "unit") routeTo(`unit/${route.unitId}/${route.phase}/${Math.max(0, route.index-1)}`);
    else if (target.dataset.next && route.page === "unit") routeTo(`unit/${route.unitId}/${route.phase}/${target.dataset.next}`);
    else if (target.dataset.nextBatch && route.page === "unit") routeTo(`unit/${route.unitId}/${route.phase}/0`);
    else if (target.dataset.nextPhase === "home") routeTo("");
    else if (target.dataset.nextPhase && route.page === "unit") routeTo(`unit/${route.unitId}/${target.dataset.nextPhase}/0`);
    else if (target.matches("[data-review-choice]")) answerReview(Number(target.dataset.reviewChoice));
    else if (target.matches("[data-retry-review]")) { reviewState = null; renderReview(); }
  });
  document.querySelector("#homeButton").addEventListener("click", () => routeTo(""));
  document.querySelector("#reviewButton").addEventListener("click", () => { reviewState = null; routeTo("review"); });
  document.querySelector("#settingsButton").addEventListener("click", () => { soundToggle.checked = data.sound; dialog.showModal(); });
  soundToggle.addEventListener("change", () => { data.sound = soundToggle.checked; save(); showToast(data.sound ? "効果音をオンにしました" : "効果音をオフにしました"); });
  document.querySelector("#resetButton").addEventListener("click", () => { if (!confirm("この端末に保存した学習記録を、すべて消しますか？")) return; data = defaultData(); save(); dialog.close(); showToast("学習記録を消しました"); render(); });
  window.addEventListener("hashchange", render);
  render();
})();
