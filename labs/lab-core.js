(() => {
  "use strict";

  const esc = value => String(value ?? "").replace(/[&<>\"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
  }[char]));

  function shell(root, manifest, { onHome } = {}) {
    root.innerHTML =
      '<section class="lab-screen instant-lab" style="--lab-accent:' + esc(manifest.accent || "#2a8068") + '">' +
        '<nav class="breadcrumbs" aria-label="現在位置"><button class="text-button" type="button" data-lab-home>シミュレーション一覧</button><span>›</span><span>' + esc(manifest.title) + '</span></nav>' +
        '<header class="lab-titlebar"><div><p class="eyebrow">SIMULATION LAB / ' + esc(manifest.unit) + '</p><h1>' + esc(manifest.title) + '</h1><p>' + esc(manifest.summary) + '</p></div><button class="secondary-button lab-back" type="button" data-lab-home>一覧へ戻る</button></header>' +
        '<div class="lab-workspace"><section class="simulation-column" aria-label="シミュレーション"><div class="sim-stage" data-sim-stage></div><div class="sim-readout" data-sim-readout aria-live="polite"></div><div class="sim-actions" data-sim-actions></div></section><aside class="control-panel instant-panel" aria-label="条件操作"><div class="control-heading"><p class="eyebrow">TRY IT</p><h2>条件を変えてみよう</h2><p>動かすと、図と結果がすぐ変わります。</p></div><div data-control-panel></div></aside></div>' +
        '<p class="model-note" data-model-note></p></section>';
    const view = root.querySelector(".lab-screen");
    const cleanups = [];
    const on = (target, event, handler, options) => {
      if (!target) return handler;
      target.addEventListener(event, handler, options);
      cleanups.push(() => target.removeEventListener(event, handler, options));
      return handler;
    };
    view.querySelectorAll("[data-lab-home]").forEach(button => on(button, "click", () => onHome && onHome()));
    return {
      root: view,
      stage: view.querySelector("[data-sim-stage]"),
      readout: view.querySelector("[data-sim-readout]"),
      actions: view.querySelector("[data-sim-actions]"),
      panel: view.querySelector("[data-control-panel]"),
      note: view.querySelector("[data-model-note]"),
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
    return { input, output, set: update };
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

  function renderReadout(target, config) {
    const metrics = config.metrics || [];
    target.innerHTML = '<div class="instant-readout-grid">' + metrics.map(metric =>
      '<div class="instant-metric"><span>' + esc(metric.label) + '</span><b>' + esc(metric.value) + '</b>' + (metric.detail ? '<small>' + esc(metric.detail) + '</small>' : '') + '</div>'
    ).join("") + '</div><div class="instant-result"><strong>結果</strong><p>' + esc(config.message || "") + '</p></div>' + (config.note ? '<p class="instant-note">' + esc(config.note) + '</p>' : "");
  }

  function renderError(root, message) {
    root.innerHTML = '<section class="empty-state lab-error"><h1>LABを読み込めませんでした</h1><p>' + esc(message || "画面を更新して、もう一度試してください。") + '</p><button class="primary-button" type="button" data-lab-home>シミュレーション一覧へ</button></section>';
  }

  window.RikaThreeLabCore = { esc, shell, section, range, options, action, presets, renderReadout, renderError };
})();

