(() => {
  "use strict";

  const esc = value => String(value ?? "").replace(/[&<>\"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
  }[char]));

  function shell(root, manifest, { onHome } = {}) {
    root.innerHTML =
      '<section class="lab-screen instant-lab" style="--lab-accent:' + esc(manifest.accent || "#2a8068") + '">' +
        '<nav class="breadcrumbs" aria-label="現在位置"><button class="text-button" type="button" data-lab-home>シミュレーション一覧</button><span>›</span><span>' + esc(manifest.title) + '</span></nav>' +
        '<header class="lab-titlebar"><div><p class="eyebrow">🧪 自由にためす / ' + esc(manifest.unit) + '</p><h1>' + esc(manifest.title) + '</h1></div><div class="experiment-counter" aria-live="polite"><b data-experiment-count>0</b><small>回ためした</small></div><button class="secondary-button lab-back" type="button" data-lab-home>一覧へ戻る</button></header>' +
        '<div class="lab-workspace"><section class="simulation-column" aria-label="シミュレーション"><div class="sim-stage" data-sim-stage></div><div class="sim-readout" data-sim-readout aria-live="polite"></div><div class="sim-actions" data-sim-actions></div></section><aside class="control-panel instant-panel" aria-label="実験の操作"><div class="control-heading"><p class="eyebrow">TRY & PLAY</p><h2>さわってみよう</h2></div><div data-control-panel></div><details class="trial-panel" aria-labelledby="trialTitle"><summary>📒 実験ノート</summary><div class="trial-heading"><h3 id="trialTitle">くらべた結果</h3><button type="button" data-clear-trials>記録を消す</button></div><div class="trial-list" data-trial-list aria-live="polite"><p>気になる条件を変えて、結果を記録してみよう。</p></div></details></aside></div>' +
        '<details class="model-disclosure"><summary>このシミュレーションについて</summary><p class="model-note" data-model-note></p></details></section>';
    const view = root.querySelector(".lab-screen");
    const stage = view.querySelector("[data-sim-stage]");
    const cleanups = [];
    let sceneTimer = 0;
    const sceneObserver = new MutationObserver(records => {
      if (stage.classList.contains("is-direct-manipulating")) return;
      const onlyTouchSparks = records.every(record => {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        return nodes.length > 0 && nodes.every(node =>
          node.nodeType === 1 && node.classList.contains("stage-touch-spark")
        );
      });
      if (onlyTouchSparks) return;
      stage.classList.remove("is-changing");
      void stage.offsetWidth;
      stage.classList.add("is-changing");
      window.clearTimeout(sceneTimer);
      sceneTimer = window.setTimeout(() => stage.classList.remove("is-changing"), 360);
    });
    sceneObserver.observe(stage, { childList: true });
    cleanups.push(() => { sceneObserver.disconnect(); window.clearTimeout(sceneTimer); });
    const on = (target, event, handler, options) => {
      if (!target) return handler;
      target.addEventListener(event, handler, options);
      cleanups.push(() => target.removeEventListener(event, handler, options));
      return handler;
    };
    view.querySelectorAll("[data-lab-home]").forEach(button => on(button, "click", () => onHome && onHome()));
    const challenges = Array.isArray(manifest.challenges) ? manifest.challenges : [];
    if (challenges.length) {
      const mission = document.createElement("section");
      mission.className = "discovery-mission";
      mission.innerHTML = '<div class="mission-heading"><span aria-hidden="true">🔎</span><div><small>はっけんミッション</small><b data-mission-text>' + esc(challenges[0]) + '</b></div></div><div class="mission-dots" role="group" aria-label="ミッションを選ぶ">' +
        challenges.map((item, index) => '<button type="button" aria-pressed="' + (index === 0) + '" data-mission-index="' + index + '">' + (index + 1) + '</button>').join("") + '</div>';
      const missionDetails = document.createElement("details");
      missionDetails.className = "mission-details";
      missionDetails.innerHTML = '<summary>🎯 あそびミッション（やってみたい人）</summary>';
      missionDetails.append(mission);
      const controlArea = view.querySelector("[data-control-panel]");
      controlArea.insertAdjacentElement("afterend", missionDetails);
      mission.querySelectorAll("[data-mission-index]").forEach(button => on(button, "click", () => {
        mission.querySelectorAll("[data-mission-index]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        mission.querySelector("[data-mission-text]").textContent = challenges[Number(button.dataset.missionIndex)];
      }));
    }
    on(stage, "pointerdown", event => {
      const rect = stage.getBoundingClientRect();
      const spark = document.createElement("span");
      spark.className = "stage-touch-spark";
      spark.style.left = (event.clientX - rect.left) + "px";
      spark.style.top = (event.clientY - rect.top) + "px";
      stage.append(spark);
      window.setTimeout(() => spark.remove(), 520);
    });
    const trialList = view.querySelector("[data-trial-list]");
    let experimentCount = 0;
    const experimentCountOutput = view.querySelector("[data-experiment-count]");
    const markTried = () => {
      experimentCount += 1;
      if (experimentCountOutput) experimentCountOutput.textContent = String(experimentCount);
      const counter = view.querySelector(".experiment-counter");
      if (counter) {
        counter.classList.remove("is-bumped");
        void counter.offsetWidth;
        counter.classList.add("is-bumped");
      }
    };
    const controlArea = view.querySelector("[data-control-panel]");
    on(controlArea, "change", event => {
      if (event.target && event.target.matches('input[type="range"]')) markTried();
    });
    on(controlArea, "click", event => {
      if (event.target && event.target.closest(".segmented-control button")) markTried();
    });
    let trialDraft = null;
    let trials = [];
    const changedParts = (newer, older) => {
      if (!older) return "";
      const oldParts = String(older.condition || "").split("・");
      const nextParts = String(newer.condition || "").split("・");
      const changed = nextParts.filter((part, index) => part !== oldParts[index]);
      return changed.length ? "前とちがう条件：" + changed.join("・") : "条件は同じ";
    };
    const renderTrials = () => {
      trialList.innerHTML = trials.length ? trials.map((trial, index) => {
        const change = changedParts(trial, trials[index + 1]);
        return '<article><span>' + (trials.length - index) + '</span><div><b>' + esc(trial.condition) + '</b><small>' + esc(trial.result) + '</small>' + (change ? '<em>' + esc(change) + '</em>' : '') + '</div></article>';
      }).join("") : '<p>「この結果をくらべる」で3回分を並べられます。</p>';
    };
    on(view.querySelector("[data-clear-trials]"), "click", () => { trials = []; renderTrials(); });
    return {
      root: view,
      stage,
      readout: view.querySelector("[data-sim-readout]"),
      actions: view.querySelector("[data-sim-actions]"),
      panel: view.querySelector("[data-control-panel]"),
      note: view.querySelector("[data-model-note]"),
      setTrial: trial => { trialDraft = trial; },
      markTried,
      saveTrial: () => {
        if (!trialDraft) return false;
        const duplicate = trials[0] && trials[0].condition === trialDraft.condition && trials[0].result === trialDraft.result;
        if (duplicate) return false;
        trials = [trialDraft, ...trials].slice(0, 3);
        renderTrials();
        return true;
      },
      on: on,
      destroy: () => {
        cleanups.splice(0).forEach(cleanup => cleanup());
        view.remove();
      }
    };
  }

  function section(parent, title, hint) {
    const element = document.createElement("section");
    element.className = "control-section";
    element.innerHTML = "<h3>" + esc(title) + "</h3>" + (hint ? "<p>" + esc(hint) + "</p>" : "");
    parent.append(element);
    return element;
  }

  function range(parent, config) {
    const label = config.label, min = config.min, max = config.max, step = config.step || 1;
    const value = config.value, format = config.format || (value => value), onInput = config.onInput;
    const id = "lab-range-" + Math.random().toString(36).slice(2);
    const row = document.createElement("label");
    row.className = "range-control";
    row.innerHTML = '<span>' + esc(label) + '<output for="' + id + '">' + esc(format(value)) + '</output></span><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">';
    const input = row.querySelector("input");
    const output = row.querySelector("output");
    const update = next => { input.value = next; output.textContent = format(Number(next)); };
    input.addEventListener("input", () => { output.textContent = format(Number(input.value)); if (onInput) onInput(Number(input.value)); });
    parent.append(row);
    return { input, output, set: update, setLabel: next => { row.querySelector("span").firstChild.textContent = next; }, setMax: next => { input.max = next; if (Number(input.value) > Number(next)) update(next); } };
  }

  function options(parent, config) {
    const label = config.label, values = config.values, value = config.value;
    const format = config.format || (item => item.label), onChange = config.onChange;
    const wrap = document.createElement("div");
    wrap.className = "segmented-control";
    wrap.innerHTML = '<span>' + esc(label) + '</span><div>' + values.map(item => {
      const id = item.id !== undefined ? item.id : item;
      return '<button type="button" data-option-value="' + esc(id) + '" aria-pressed="' + (String(id) === String(value)) + '">' + esc(format(item)) + '</button>';
    }).join("") + '</div>';
    const buttons = Array.from(wrap.querySelectorAll("button"));
    const set = next => buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.optionValue) === String(next)));
    buttons.forEach(button => button.addEventListener("click", () => { set(button.dataset.optionValue); if (onChange) onChange(button.dataset.optionValue); }));
    parent.append(wrap);
    return { set };
  }

  function action(parent, label, onClick, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className || "secondary-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    parent.append(button);
    return button;
  }

  function presets(parent, items, onSelect) {
    const wrap = section(parent, "プリセット", "まずはここから試してもOK");
    wrap.classList.add("preset-section");
    const row = document.createElement("div");
    row.className = "preset-buttons";
    items.forEach(item => action(row, item.label, () => onSelect(item.id), "preset-button"));
    wrap.append(row);
    return wrap;
  }

  function randomizeOne(view) {
    const candidates = [];
    Array.from(view.panel.querySelectorAll(".range-control input")).forEach(input => {
      const min = Number(input.min), max = Number(input.max), step = Number(input.step) || 1;
      const count = Math.floor((max - min) / step);
      if (!(count > 0)) return;
      candidates.push(() => {
        const current = Math.max(0, Math.min(count, Math.round((Number(input.value) - min) / step)));
        let next = Math.floor(Math.random() * (count + 1));
        if (next === current) next = (next + 1 + Math.floor(Math.random() * count)) % (count + 1);
        input.value = String(min + next * step);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    Array.from(view.panel.querySelectorAll(".segmented-control")).forEach(group => {
      const alternatives = Array.from(group.querySelectorAll("button")).filter(button => button.getAttribute("aria-pressed") !== "true");
      if (alternatives.length) candidates.push(() => alternatives[Math.floor(Math.random() * alternatives.length)].click());
    });
    if (!candidates.length) return false;
    candidates[Math.floor(Math.random() * candidates.length)]();
    return true;
  }

  function renderReadout(target, config) {
    const metrics = config.metrics || [];
    target.innerHTML = '<div class="instant-readout-grid">' + metrics.map(metric =>
      '<div class="instant-metric"><span>' + esc(metric.label) + '</span><b>' + esc(metric.value) + '</b>' + (metric.detail ? '<small>' + esc(metric.detail) + '</small>' : '') + '</div>'
    ).join("") + '</div><div class="instant-result"><strong>結果</strong><p>' + esc(config.message || "") + '</p></div>' + (config.note ? '<p class="instant-note">' + esc(config.note) + '</p>' : "");
  }

  function renderError(root, message) {
    root.innerHTML = '<section class="empty-state lab-error"><h1>LABを読み込めませんでした</h1><p>' + esc(message || "画面を更新して、もう一度試してください。") + '</p><button class="primary-button" type="button" data-lab-home>シミュレーション一覧へ</button></section>';
  }

  window.RikaThreeLabCore = { esc, shell, section, range, options, action, presets, randomizeOne, renderReadout, renderError };
})();
