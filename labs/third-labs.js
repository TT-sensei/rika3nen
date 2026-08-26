(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const one = (value, digits = 0) => Number(value).toFixed(digits);
  const option = (id, label) => ({ id, label });

  function mountInstant(root, { core, host, manifest, create }) {
    const view = core.shell(root, manifest, { onHome: () => host.routeTo("lab") });
    view.note.textContent = manifest.modelNote || "";
    const model = create(view, core);
    core.action(view.actions, "リセット", () => model.reset());
    core.action(view.actions, model.stepLabel || "条件を1つ進める", () => model.step());
    core.action(view.actions, "この結果をくらべる", () => {
      if (view.saveTrial()) host.showToast && host.showToast("結果を右側にのこしました");
    }, "primary-button");
    model.render();
    return () => {
      model.destroy && model.destroy();
      view.destroy();
    };
  }

  function living(view, core) {
    const state = { light: "shade", moisture: "moist" };
    const section = core.section(view.panel, "すみかの条件を変える", "明るさと湿り方を変えて、見つかりやすさを比べよう。");
    const light = core.options(section, { label: "明るさ", values: [option("sun", "日なた"), option("shade", "日かげ")], value: state.light, format: item => item.label, onChange: value => { state.light = value; draw(); } });
    const moisture = core.options(section, { label: "地面", values: [option("dry", "乾いている"), option("moist", "しめっている")], value: state.moisture, format: item => item.label, onChange: value => { state.moisture = value; draw(); } });
    function draw() {
      const habitat = (state.light === "shade" ? 26 : 12) + (state.moisture === "moist" ? 28 : 5);
      const bugs = Math.max(1, Math.round(habitat / 5));
      const plantHeight = state.light === "sun" ? 100 : 68;
      const bugMarks = Array.from({ length: bugs }, (_, i) => {
        const x = 125 + (i * 57) % 380;
        const y = 270 - (i % 3) * 23;
        return '<g class="sim-bug" style="--bug-delay:' + (i * .09) + 's"><circle cx="' + x + '" cy="' + y + '" r="8" fill="#7b574c"/><circle cx="' + (x - 7) + '" cy="' + (y - 5) + '" r="5" fill="#b98358"/><circle cx="' + (x + 7) + '" cy="' + (y - 5) + '" r="5" fill="#b98358"/></g>';
      }).join("");
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="すみかの条件と生き物の見つかりやすさのシミュレーション">' +
          '<rect width="640" height="360" fill="#edf7ee"/><rect y="270" width="640" height="90" fill="' + (state.moisture === "moist" ? "#a9c88b" : "#d9c28e") + '"/>' +
          '<circle class="sim-sun-glow" cx="540" cy="66" r="31" fill="' + (state.light === "sun" ? "#f4c84d" : "#dce7d9") + '"/><text x="28" y="42" class="scene-title">場所を変えると、何が見つかる？</text>' +
          '<text x="30" y="80" class="scene-caption">' + (state.light === "sun" ? "日なた" : "日かげ") + '・' + (state.moisture === "moist" ? "しめった地面" : "乾いた地面") + '</text>' +
          '<path d="M105 270 Q150 170 205 270 M175 270 Q220 145 265 270 M255 270 Q305 185 355 270" fill="none" stroke="#4f934b" stroke-width="12" stroke-linecap="round"/>' +
          '<path d="M0 245 Q130 220 260 245 T520 240 T640 248" fill="none" stroke="#7d9e62" stroke-width="4"/>' + bugMarks +
          '<text x="112" y="330" class="component-label">植物やかくれ場所</text><text x="425" y="330" class="component-label">生き物</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "環境", value: (state.light === "sun" ? "日なた" : "日かげ") + "・" + (state.moisture === "moist" ? "しめった" : "乾いた"), detail: "変えた条件" },
          { label: "見つかりやすさ", value: bugs + " / 10", detail: "モデルの目安" }
        ],
        message: state.moisture === "moist" && state.light === "shade" ? "しめっていて日かげの場所では、かくれやすい生き物が見つかりやすいね。" : "明るさや湿り方を一つずつ変えて、見つかる数の違いを比べてみよう。"
      });
      view.setTrial({ condition: (state.light === "sun" ? "日なた" : "日かげ") + "・" + (state.moisture === "moist" ? "しめった地面" : "乾いた地面"), result: "見つかりやすさ " + bugs + " / 10" });
    }
    return {
      render: draw,
      reset: () => { state.light = "shade"; state.moisture = "moist"; light.set(state.light); moisture.set(state.moisture); draw(); },
      step: () => { state.moisture = state.moisture === "moist" ? "dry" : "moist"; moisture.set(state.moisture); draw(); }
    };
  }

  function plants(view, core) {
    const state = { water: "enough", sunlight: "sun", day: 7 };
    const section = core.section(view.panel, "育つ条件を変える", "水・日光・日数を変えて、植物の姿を比べよう。");
    const water = core.options(section, { label: "水", values: [option("none", "なし"), option("enough", "適量"), option("much", "多すぎ")], value: state.water, format: item => item.label, onChange: value => { state.water = value; draw(); } });
    const sunlight = core.options(section, { label: "日光", values: [option("sun", "当てる"), option("shade", "当てない")], value: state.sunlight, format: item => item.label, onChange: value => { state.sunlight = value; draw(); } });
    const day = core.range(section, { label: "育てる日数", min: 0, max: 28, value: state.day, format: value => value + "日", onInput: value => { state.day = value; draw(); } });
    function draw() {
      const condition = state.water === "enough" && state.sunlight === "sun" ? 1 : state.water === "none" || state.sunlight === "shade" ? .28 : .62;
      const growth = clamp(state.day / 28 * condition, 0, 1);
      const height = 35 + growth * 170;
      const leaves = Math.max(0, Math.round(growth * 8));
      const leafMarks = Array.from({ length: leaves }, (_, i) => {
        const x = 318 + (i % 2 ? 28 : -28);
        const y = 260 - i * 19;
        return '<ellipse class="sim-plant-leaf" style="--leaf-delay:' + (i * .045) + 's" cx="' + x + '" cy="' + y + '" rx="27" ry="12" transform="rotate(' + (i % 2 ? 24 : -24) + ' ' + x + ' ' + y + ')" fill="#4f934b"/>';
      }).join("");
      const flower = growth > .82 ? '<g class="sim-flower"><circle cx="318" cy="82" r="13" fill="#e693a5"/><circle cx="335" cy="88" r="11" fill="#e693a5"/><circle cx="325" cy="72" r="10" fill="#e693a5"/><circle cx="325" cy="84" r="5" fill="#f1c74e"/></g>' : "";
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="植物の育ちのシミュレーション">' +
          '<rect width="640" height="360" fill="#f2faed"/><rect y="274" width="640" height="86" fill="#b99a72"/><circle class="sim-sun-glow" cx="535" cy="65" r="32" fill="' + (state.sunlight === "sun" ? "#f5cb54" : "#ced9cd") + '"/>' +
          '<text x="28" y="42" class="scene-title">条件を変えると、植物の育ちは？</text><text x="30" y="80" class="scene-caption">' + state.day + "日目・水：" + (state.water === "enough" ? "適量" : state.water === "none" ? "なし" : "多すぎ") + "・日光：" + (state.sunlight === "sun" ? "あり" : "なし") + '</text>' +
          '<path class="sim-plant-stem" d="M318 274 V' + (274 - height) + '" stroke="#4f934b" stroke-width="12" stroke-linecap="round"/>' + leafMarks + flower +
          '<text x="105" y="330" class="component-label">芽 → 葉 → 花</text><text x="430" y="330" class="component-label">成長 ' + Math.round(growth * 100) + '%</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "育ち", value: Math.round(growth * 100) + " / 100", detail: state.day + "日目のモデル" },
          { label: "姿", value: leaves + "枚の葉" + (flower ? "・花" : ""), detail: "種からの変化" }
        ],
        message: state.water === "enough" && state.sunlight === "sun" ? "適量の水と日光があると、日数に合わせてよく育つね。" : "日光や水の条件を変えて、育ち方の違いを比べてみよう。"
      });
      view.setTrial({ condition: state.day + "日目・水" + (state.water === "enough" ? "適量" : state.water === "none" ? "なし" : "多すぎ") + "・日光" + (state.sunlight === "sun" ? "あり" : "なし"), result: "育ち " + Math.round(growth * 100) + " / 100" });
    }
    return {
      render: draw,
      stepLabel: "4日進める",
      reset: () => { state.water = "enough"; state.sunlight = "sun"; state.day = 7; water.set(state.water); sunlight.set(state.sunlight); day.set(state.day); draw(); },
      step: () => { state.day = state.day >= 28 ? 0 : Math.min(28, state.day + 4); day.set(state.day); draw(); }
    };
  }

  function insects(view, core) {
    const state = { kind: "butterfly", stage: 1 };
    const section = core.section(view.panel, "育ち方を変える", "チョウとバッタの順序を比べてみよう。");
    const kind = core.options(section, { label: "生き物", values: [option("butterfly", "チョウ"), option("grasshopper", "バッタ")], value: state.kind, format: item => item.label, onChange: value => { state.kind = value; const max = value === "butterfly" ? 3 : 2; state.stage = Math.min(state.stage, max); stage.setMax(max); stage.set(state.stage); draw(); } });
    const stage = core.range(section, { label: "育ちの段階", min: 0, max: 3, value: state.stage, format: value => value + "段階", onInput: value => { state.stage = value; draw(); } });
    function draw() {
      const butterflyNames = ["卵", "幼虫", "さなぎ", "成虫"];
      const grasshopperNames = ["卵", "幼虫", "成虫", "成虫"];
      const name = (state.kind === "butterfly" ? butterflyNames : grasshopperNames)[state.stage];
      const adult = name === "成虫";
      let figure = "";
      if (name === "卵") figure = '<ellipse cx="320" cy="190" rx="42" ry="28" fill="#e7d28f" stroke="#a28b53" stroke-width="4"/>';
      else if (name === "幼虫") figure = '<path d="M210 205 Q270 145 330 205 T450 205" fill="none" stroke="#68a55c" stroke-width="28" stroke-linecap="round"/><circle cx="215" cy="201" r="23" fill="#78b86b"/>';
      else if (name === "さなぎ") figure = '<path d="M300 125 Q355 120 365 178 Q368 238 320 255 Q278 225 285 170Z" fill="#9c8561" stroke="#6c5d49" stroke-width="4"/>';
      else if (state.kind === "butterfly") figure = '<ellipse cx="320" cy="190" rx="52" ry="22" fill="#7b9f55"/><circle cx="270" cy="190" r="23" fill="#a86b45"/><path d="M290 175 Q220 95 205 175 Q210 225 290 202 M350 175 Q420 95 435 175 Q430 225 350 202" fill="#e9b8d0" stroke="#9b6a8c" stroke-width="4"/>' +
        '<path d="M294 188 l-55 -28 M294 195 l-62 12 M346 188 l55 -28 M346 195 l62 12" stroke="#5e6b52" stroke-width="5" stroke-linecap="round"/>';
      else figure = '<ellipse cx="330" cy="190" rx="75" ry="24" fill="#78a45a"/><circle cx="255" cy="184" r="24" fill="#97bc70"/><path d="M290 207 l-55 50 M330 210 l-16 52 M370 207 l55 48" stroke="#536f42" stroke-width="8" stroke-linecap="round"/><path d="M260 163 l-35 -35 M270 165 l12 -46" stroke="#536f42" stroke-width="4"/>';
      const bodyText = adult ? "頭・胸・腹、胸から6本の足" : "成長の途中";
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="昆虫の育ち方と体のつくりのシミュレーション">' +
          '<rect width="640" height="360" fill="#fff7ed"/><text x="28" y="42" class="scene-title">育ちの順序と体のつくり</text><text x="30" y="80" class="scene-caption">' + (state.kind === "butterfly" ? "チョウ" : "バッタ") + "：" + name + '</text>' +
          (state.kind === "butterfly" ? '<path d="M100 285 H540" stroke="#c4a56e" stroke-width="4" stroke-dasharray="8 9"/><circle cx="130" cy="285" r="14" fill="#e7d28f"/><circle cx="280" cy="285" r="14" fill="#78b86b"/><circle cx="410" cy="285" r="14" fill="#9c8561"/><circle cx="520" cy="285" r="14" fill="#e9b8d0"/><text x="112" y="320" class="component-label">卵</text><text x="255" y="320" class="component-label">幼虫</text><text x="370" y="320" class="component-label">さなぎ</text><text x="495" y="320" class="component-label">成虫</text>' : '<path d="M120 285 H520" stroke="#c4a56e" stroke-width="4" stroke-dasharray="8 9"/><circle cx="150" cy="285" r="14" fill="#e7d28f"/><circle cx="320" cy="285" r="14" fill="#78b86b"/><circle cx="500" cy="285" r="14" fill="#91b86d"/><text x="132" y="320" class="component-label">卵</text><text x="295" y="320" class="component-label">幼虫</text><text x="475" y="320" class="component-label">成虫</text>') + '<g class="life-stage-figure">' + figure + '</g>' +
          '<text x="410" y="120" class="component-label">' + bodyText + '</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "いまの段階", value: name, detail: state.kind === "butterfly" ? "卵→幼虫→さなぎ→成虫" : "卵→幼虫→成虫" },
          { label: "成虫の体", value: adult ? "3つに分かれる" : "これから変化", detail: adult ? "頭・胸・腹" : "育ちの途中" }
        ],
        message: state.kind === "butterfly" ? "チョウにはさなぎの時期があるね。成虫の体は頭・胸・腹に分かれるよ。" : "バッタはさなぎにならず、幼虫から少しずつ成虫に近づくね。"
      });
      view.setTrial({ condition: state.kind === "butterfly" ? "チョウ" : "バッタ", result: state.kind === "butterfly" ? "卵→幼虫→さなぎ→成虫" : "卵→幼虫→成虫" });
    }
    return {
      render: draw,
      reset: () => { state.kind = "butterfly"; state.stage = 1; kind.set(state.kind); stage.setMax(3); stage.set(state.stage); draw(); },
      step: () => { const max = state.kind === "butterfly" ? 3 : 2; state.stage = state.stage >= max ? 0 : state.stage + 1; stage.set(state.stage); draw(); }
    };
  }

  function windrubber(view, core) {
    const state = { force: 55, source: "wind" };
    const section = core.section(view.panel, "力の大きさを変える", "風の強さやゴムの伸びを変えて、車の距離を見よう。");
    const source = core.options(section, { label: "力の種類", values: [option("wind", "風"), option("rubber", "ゴム")], value: state.source, format: item => item.label, onChange: value => { state.source = value; draw(); } });
    const force = core.range(section, { label: state.source === "wind" ? "風の強さ" : "ゴムの伸び", min: 0, max: 100, value: state.force, format: value => value + "%", onInput: value => { state.force = value; draw(); } });
    function draw() {
      const distance = Math.round(state.force * 2.45);
      const carX = 92 + distance * 1.65;
      const arrows = state.source === "wind" ? '<path class="force-arrow" d="M105 150 H250 M130 125 H300 M170 175 H330" stroke="#5aa6b4" stroke-width="9" stroke-linecap="round"/><path class="force-arrow" d="M240 140 l25 10 -25 10 M290 115 l25 10 -25 10 M320 165 l25 10 -25 10" fill="none" stroke="#327b8b" stroke-width="6"/>' : '<path class="rubber-stretch" d="M110 150 Q165 110 220 150 T330 150" fill="none" stroke="#bd5550" stroke-width="7"/><path class="force-arrow" d="M110 150 H' + (110 + state.force * .8) + '" stroke="#bd5550" stroke-width="5"/>';
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="風やゴムの力と車の移動距離のシミュレーション">' +
          '<rect width="640" height="360" fill="#eef8fa"/><text x="28" y="42" class="scene-title">力を大きくすると、車は？</text><text x="30" y="80" class="scene-caption">' + (state.source === "wind" ? "風の強さ" : "ゴムの伸び") + " " + state.force + '%</text>' + arrows +
          '<path d="M70 270 H570" stroke="#78949a" stroke-width="5"/><path d="M70 287 H570" stroke="#c5d9d9" stroke-width="2"/><g class="sim-car"><rect x="' + carX + '" y="230" width="72" height="35" rx="10" fill="#27849b"/><circle cx="' + (carX + 16) + '" cy="270" r="12" fill="#4b5c62"/><circle cx="' + (carX + 57) + '" cy="270" r="12" fill="#4b5c62"/></g><text x="80" y="320" class="component-label">0cm</text><text x="490" y="320" class="component-label">250cm</text><line class="distance-line" x1="92" y1="305" x2="' + (92 + distance * 1.65) + '" y2="305" stroke="#27849b" stroke-width="6"/>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "力の種類", value: state.source === "wind" ? "風" : "ゴム", detail: "変えた条件" },
          { label: "進んだ距離", value: distance + " cm", detail: "同じ車のモデル" }
        ],
        message: state.force > 70 ? "風を強くしたりゴムを長く伸ばしたりすると、車を動かすはたらきが大きくなるね。" : "力の大きさを変えて、車の進んだ距離を比べてみよう。"
      });
      view.setTrial({ condition: (state.source === "wind" ? "風" : "ゴム") + "・力 " + state.force + "%", result: distance + "cm進んだ" });
    }
    return {
      render: draw,
      reset: () => { state.force = 55; state.source = "wind"; source.set(state.source); force.set(state.force); draw(); },
      step: () => { state.force = state.force >= 100 ? 0 : state.force + 20; force.set(state.force); draw(); }
    };
  }

  function sound(view, core) {
    const state = { strength: 55, medium: "rubber", string: "tight" };
    const section = core.section(view.panel, "ふるえの条件を変える", "はじく強さや糸の張り方を変えて、音を比べよう。");
    const medium = core.options(section, { label: "音を出す物", values: [option("rubber", "輪ゴム"), option("drum", "太鼓")], value: state.medium, format: item => item.label, onChange: value => { state.medium = value; draw(); } });
    const strength = core.range(section, { label: "はじく・たたく強さ", min: 0, max: 100, value: state.strength, format: value => value + "%", onInput: value => { state.strength = value; draw(); } });
    const string = core.options(section, { label: "糸電話の糸", values: [option("tight", "ぴんと張る"), option("loose", "ゆるめる")], value: state.string, format: item => item.label, onChange: value => { state.string = value; draw(); } });
    function draw() {
      const vibration = Math.round(state.strength);
      const transmission = Math.round(vibration * (state.string === "tight" ? 1 : .25));
      const amplitude = 6 + vibration * .32;
      const wave = Array.from({ length: 9 }, (_, i) => {
        const x = 115 + i * 48;
        const y = 175 + (i % 2 ? amplitude : -amplitude);
        return (i === 0 ? "M" : " L") + x + " " + y;
      }).join("");
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="音の大きさとふるえのシミュレーション">' +
          '<rect width="640" height="360" fill="#f7f1fb"/><text x="28" y="42" class="scene-title">音が大きいと、ふるえは？</text><text x="30" y="80" class="scene-caption">' + (state.medium === "rubber" ? "輪ゴム" : "太鼓") + "・強さ " + state.strength + '%</text>' +
          '<path class="sound-wave" d="' + wave + '" fill="none" stroke="#8a64a7" stroke-width="7" stroke-linecap="round"/><line x1="115" y1="175" x2="500" y2="175" stroke="#c7b6d5" stroke-width="2" stroke-dasharray="6 7"/>' +
          '<circle class="sound-receiver" cx="535" cy="175" r="' + (18 + transmission * .18) + '" fill="#e5c8ee" stroke="#8a64a7" stroke-width="4"/><path class="sound-rings" d="M570 140 Q620 175 570 210 M590 125 Q650 175 590 225" fill="none" stroke="#8a64a7" stroke-width="5" opacity="' + (transmission / 100) + '"/><text x="110" y="280" class="component-label">音を出す物のふるえ：' + vibration + ' / 100</text><text x="405" y="320" class="component-label">糸で伝わる強さ：' + transmission + '</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "音を出す物のふるえ", value: vibration + " / 100", detail: state.medium === "rubber" ? "輪ゴム" : "太鼓" },
          { label: "糸で伝わる強さ", value: transmission + " / 100", detail: state.string === "tight" ? "ぴんと張った糸" : "ゆるんだ糸" }
        ],
        message: state.string === "tight" ? "音が大きいほど物のふるえも大きいね。糸をぴんと張ると、そのふるえが伝わりやすいよ。" : "音を出す物は同じようにふるえても、糸がゆるむと相手へ伝わりにくいね。"
      });
      view.setTrial({ condition: (state.medium === "rubber" ? "輪ゴム" : "太鼓") + "・強さ " + state.strength + "%・糸" + (state.string === "tight" ? "ぴん" : "ゆるい"), result: "元のふるえ " + vibration + "・伝わる強さ " + transmission });
    }
    return {
      render: draw,
      reset: () => { state.strength = 55; state.medium = "rubber"; state.string = "tight"; medium.set(state.medium); strength.set(state.strength); string.set(state.string); draw(); },
      step: () => { state.strength = state.strength >= 100 ? 0 : state.strength + 20; strength.set(state.strength); draw(); }
    };
  }

  function sun(view, core) {
    const state = { time: 12, target: "shadow" };
    const section = core.section(view.panel, "時刻と見るものを変える", "太陽の位置、影の向き、地面の温度を比べよう。");
    const time = core.range(section, { label: "時刻", min: 8, max: 16, value: state.time, format: value => value + "時", onInput: value => { state.time = value; draw(); } });
    const target = core.options(section, { label: "注目するもの", values: [option("shadow", "影"), option("ground", "地面の温度")], value: state.target, format: item => item.label, onChange: value => { state.target = value; draw(); } });
    function draw() {
      const ratio = (state.time - 8) / 8;
      const sunX = 110 + ratio * 420;
      const height = 70 + Math.sin(Math.PI * ratio) * 150;
      const shadowLength = Math.round(180 - Math.sin(Math.PI * ratio) * 125);
      const temp = [18,20,23,26,28,30,31,30,27][state.time - 8];
      const shadowDirection = state.time < 12 ? 1 : -1;
      const shadowEnd = 330 + shadowDirection * shadowLength;
      const shadowSide = state.time < 12 ? "西がわ" : state.time > 12 ? "東がわ" : "短い影";
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="太陽の位置と影のシミュレーション">' +
          '<rect width="640" height="360" fill="#fff7e8"/><rect y="280" width="640" height="80" fill="#d6c38d"/><circle class="moving-sun" cx="' + sunX + '" cy="' + (270 - height) + '" r="28" fill="#f5c84d"/><text x="28" y="42" class="scene-title">太陽の位置が変わると、影は？</text><text x="30" y="80" class="scene-caption">' + state.time + "時ごろ・" + (state.target === "shadow" ? "影に注目" : "地面の温度に注目") + '</text><text x="72" y="118" class="component-label">東</text><text x="548" y="118" class="component-label">西</text>' +
          '<rect x="322" y="180" width="16" height="100" fill="#806d51"/><path class="moving-shadow" d="M330 280 L' + shadowEnd + ' 280 L' + (shadowEnd - shadowDirection * 10) + ' 270 Z" fill="#8e836d" opacity=".75"/><text x="105" y="320" class="component-label">影：' + shadowSide + '・' + shadowLength + 'cm</text><text x="430" y="320" class="component-label">日なたの地面 ' + temp + '℃</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "太陽の高さ", value: Math.round(height) + " / 220", detail: state.time + "時ごろ" },
          { label: state.target === "shadow" ? "影" : "日なたの地面", value: state.target === "shadow" ? shadowSide + "・" + shadowLength + "cm" : temp + "℃", detail: state.target === "shadow" ? "太陽と反対側" : "日光を受けたモデル" }
        ],
        message: state.target === "shadow" ? "太陽の位置が変わると、影の向きと長さも変わるね。影は太陽と反対側にできるよ。" : "日なたの地面は日光であたためられ、正午を過ぎてから最も高くなることがあるね。"
      });
      view.setTrial({ condition: state.time + "時", result: "影 " + shadowLength + "cm・地面 " + temp + "℃" });
    }
    return {
      render: draw,
      reset: () => { state.time = 12; state.target = "shadow"; time.set(state.time); target.set(state.target); draw(); },
      step: () => { state.time = state.time >= 16 ? 8 : state.time + 1; time.set(state.time); draw(); }
    };
  }

  function light(view, core) {
    const state = { angle: 90, mirrors: 1 };
    const section = core.section(view.panel, "反射の条件を変える", "鏡の向きや枚数を変えて、光の進み方を比べよう。");
    const angle = core.range(section, { label: "鏡の向き", min: 35, max: 145, value: state.angle, format: value => value + "°", onInput: value => { state.angle = value; draw(); } });
    const mirrors = core.options(section, { label: "鏡の枚数", values: [option("1", "1枚"), option("2", "2枚"), option("3", "3枚")], value: String(state.mirrors), format: item => item.label, onChange: value => { state.mirrors = Number(value); draw(); } });
    function draw() {
      const targetX = 355 + (state.angle - 90) * 2.15;
      const brightness = Math.round(clamp(42 + state.mirrors * 19 - Math.abs(state.angle - 90) * .12, 0, 100));
      const repeated = Array.from({ length: state.mirrors }, (_, i) => '<line class="light-ray" style="--ray-delay:' + (i * .08) + 's" x1="255" y1="' + (160 + i * 35) + '" x2="' + targetX + '" y2="' + (95 + i * 50) + '" stroke="#e4aa31" stroke-width="6" opacity=".78"/>').join("");
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="鏡の向きと反射した光のシミュレーション">' +
          '<rect width="640" height="360" fill="#fffbea"/><circle cx="78" cy="160" r="28" fill="#f4c84d"/><text x="28" y="42" class="scene-title">鏡の向きで、光の先は？</text><text x="30" y="80" class="scene-caption">鏡の向き ' + state.angle + '°・' + state.mirrors + '枚</text>' +
          '<path class="light-ray" d="M105 160 H255" stroke="#e4aa31" stroke-width="7"/><rect class="sim-mirror" x="246" y="105" width="16" height="150" rx="7" transform="rotate(' + (state.angle - 90) + ' 254 180)" fill="#bad0d4" stroke="#6b8790" stroke-width="4"/>' + repeated +
          '<circle class="light-spot" cx="' + targetX + '" cy="' + (95 + (state.mirrors - 1) * 50) + '" r="' + (10 + brightness / 8) + '" fill="#f7d75a" opacity=".9"/><text x="100" y="320" class="component-label">入ってくる光</text><text x="415" y="320" class="component-label">当たった場所・明るさ ' + brightness + '</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "反射した光", value: "向きが変わる", detail: state.angle + "°の鏡" },
          { label: "明るさ", value: brightness + " / 100", detail: state.mirrors + "枚の光を重ねたモデル" }
        ],
        message: state.mirrors > 1 ? "光を同じ場所へ重ねると、明るさが大きくなるね。鏡の向きで進む先も変わるよ。" : "鏡の向きを少しずつ変えて、反射した光の当たる場所を比べてみよう。"
      });
      view.setTrial({ condition: "鏡 " + state.mirrors + "枚・向き " + state.angle + "°", result: "明るさ " + brightness + " / 100" });
    }
    return {
      render: draw,
      reset: () => { state.angle = 90; state.mirrors = 1; angle.set(state.angle); mirrors.set(String(state.mirrors)); draw(); },
      step: () => { state.angle = state.angle >= 145 ? 35 : state.angle + 20; angle.set(state.angle); draw(); }
    };
  }

  function electricity(view, core) {
    const state = { material: "copper", closed: "closed" };
    const materials = { copper: { label:"銅", color:"#c98b55", conducts:true }, iron: { label:"鉄", color:"#a2abb0", conducts:true }, aluminum: { label:"アルミ", color:"#c8d0d3", conducts:true }, plastic: { label:"プラスチック", color:"#d4a6a0", conducts:false }, rubber: { label:"ゴム", color:"#59656a", conducts:false }, wood: { label:"木", color:"#b88d57", conducts:false } };
    const section = core.section(view.panel, "回路の条件を変える", "つながりと材料を変えて、豆電球を確かめよう。");
    const material = core.options(section, { label: "回路の途中", values: Object.entries(materials).map(([id, item]) => option(id, item.label)), value: state.material, format: item => item.label, onChange: value => { state.material = value; draw(); } });
    const closed = core.options(section, { label: "回路", values: [option("closed", "つながる"), option("open", "切れている")], value: state.closed, format: item => item.label, onChange: value => { state.closed = value; draw(); } });
    function draw() {
      const tested = materials[state.material];
      const lit = state.closed === "closed" && tested.conducts;
      const glow = lit ? '<circle class="bulb-glow" cx="500" cy="155" r="44" fill="#f7d75a" opacity=".35"/>' : "";
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="電気の通り道と豆電球のシミュレーション">' +
          '<rect width="640" height="360" fill="#fffaf0"/><text x="28" y="42" class="scene-title">電気の通り道をつなごう</text><text x="30" y="80" class="scene-caption">' + (state.closed === "closed" ? "回路はつながっている" : "回路は切れている") + "・" + tested.label + '</text>' +
          '<path class="circuit-path ' + (lit ? "is-lit" : "") + '" d="M90 150 H180 M270 150 H465 V245 H90 V150" fill="none" stroke="' + (lit ? "#d39d29" : "#81979a") + '" stroke-width="7" stroke-linecap="round"/><rect class="tested-material" x="180" y="125" width="90" height="50" rx="8" fill="' + tested.color + '"/><text x="196" y="157" class="component-label">' + tested.label + '</text><circle class="sim-bulb ' + (lit ? "is-lit" : "") + '" cx="500" cy="155" r="25" fill="' + (lit ? "#fff2a1" : "#e5e9e6") + '" stroke="#82756b" stroke-width="5"/>' + glow +
          '<text x="450" y="295" class="component-label">' + (lit ? "豆電球がつく" : "豆電球はつかない") + '</text><text x="92" y="295" class="component-label">乾電池</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "回路", value: state.closed === "closed" ? "一つの輪" : "切れ目あり", detail: "電気の通り道" },
          { label: tested.label, value: tested.conducts ? "電気を通す" : "電気を通さない", detail: lit ? "豆電球がつく" : "豆電球はつかない" }
        ],
        message: lit ? "回路が切れ目なくつながり、途中の金属が電気を通すと豆電球がつくね。" : "つながりか材料のどちらかを変えて、豆電球がつく条件を探そう。"
      });
      view.setTrial({ condition: (state.closed === "closed" ? "回路がつながる" : "回路に切れ目") + "・" + tested.label, result: lit ? "豆電球がつく" : "豆電球はつかない" });
    }
    return {
      render: draw,
      reset: () => { state.material = "copper"; state.closed = "closed"; material.set(state.material); closed.set(state.closed); draw(); },
      step: () => { state.closed = state.closed === "closed" ? "open" : "closed"; closed.set(state.closed); draw(); }
    };
  }

  function magnets(view, core) {
    const state = { poleA: "N", poleB: "S", distance: 50, material: "iron" };
    const section = core.section(view.panel, "磁石の条件を変える", "極の組み合わせと材料を変えて、動きを比べよう。");
    const poleA = core.options(section, { label: "左の極", values: [option("N", "N極"), option("S", "S極")], value: state.poleA, format: item => item.label, onChange: value => { state.poleA = value; draw(); } });
    const poleB = core.options(section, { label: "右の極", values: [option("N", "N極"), option("S", "S極")], value: state.poleB, format: item => item.label, onChange: value => { state.poleB = value; draw(); } });
    const material = core.options(section, { label: "近づける物", values: [option("iron", "鉄"), option("aluminum", "アルミ")], value: state.material, format: item => item.label, onChange: value => { state.material = value; draw(); } });
    const distance = core.range(section, { label: "距離", min: 20, max: 100, value: state.distance, format: value => value + "cm", onInput: value => { state.distance = value; draw(); } });
    function draw() {
      const opposite = state.poleA !== state.poleB;
      const force = Math.round(clamp((110 - state.distance) * .82, 0, 75));
      const gap = 35 + state.distance * .7;
      const rightX = 210 + gap;
      const arrow = opposite ? '<path d="M280 135 H' + (rightX - 18) + '" stroke="#bd5550" stroke-width="7" marker-end="url(#arrow)"/>' : '<path d="M280 135 H245 M' + (rightX - 18) + ' 135 H' + (rightX + 18) + '" stroke="#607483" stroke-width="7"/>';
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="磁石の極と材料による動きのシミュレーション">' +
          '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#bd5550"/></marker></defs><rect width="640" height="360" fill="#fff1f0"/><text x="28" y="42" class="scene-title">磁石を近づけると、どう動く？</text><text x="30" y="80" class="scene-caption">' + state.poleA + "極と" + state.poleB + "極・距離 " + state.distance + "cm</text>" +
          '<g class="magnet-left ' + (opposite ? "attract" : "repel") + '"><rect x="170" y="105" width="110" height="60" rx="12" fill="' + (state.poleA === "N" ? "#db6d67" : "#668bc0") + '"/><text x="216" y="143" fill="#fff" class="component-label">' + state.poleA + '</text></g><g class="magnet-right ' + (opposite ? "attract" : "repel") + '"><rect x="' + rightX + '" y="105" width="110" height="60" rx="12" fill="' + (state.poleB === "N" ? "#db6d67" : "#668bc0") + '"/><text x="' + (rightX + 46) + '" y="143" fill="#fff" class="component-label">' + state.poleB + '</text></g>' + arrow +
          '<circle class="magnet-test-object ' + (state.material === "iron" ? "sticks" : "") + '" cx="320" cy="250" r="28" fill="' + (state.material === "iron" ? "#a2abb0" : "#d3c2a0") + '" stroke="#6f7779" stroke-width="4"/><text x="300" y="310" class="component-label">' + (state.material === "iron" ? "鉄" : "アルミ") + "：" + (state.material === "iron" ? "つく" : "つかない") + '</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "極の関係", value: opposite ? "引き合う" : "しりぞけ合う", detail: "同じ極／違う極" },
          { label: "鉄への力", value: state.material === "iron" ? force + " / 75" : "ほぼ 0", detail: state.distance + "cmのモデル" }
        ],
        message: state.material === "iron" ? "鉄は磁石に引き付けられるね。極を変えると、引き合うかしりぞけ合うかも変わるよ。" : "金属でもアルミは磁石につかないね。材料を変えて比べてみよう。"
      });
      view.setTrial({ condition: state.poleA + "極と" + state.poleB + "極・" + (state.material === "iron" ? "鉄" : "アルミ"), result: (opposite ? "引き合う" : "しりぞけ合う") + "・物は" + (state.material === "iron" ? "つく" : "つかない") });
    }
    return {
      render: draw,
      reset: () => { state.poleA = "N"; state.poleB = "S"; state.distance = 50; state.material = "iron"; poleA.set(state.poleA); poleB.set(state.poleB); distance.set(state.distance); material.set(state.material); draw(); },
      step: () => { state.distance = state.distance >= 100 ? 20 : state.distance + 20; distance.set(state.distance); draw(); }
    };
  }

  function weight(view, core) {
    const state = { shape: "round", material: "clay", amount: 1 };
    const section = core.section(view.panel, "形・材料・量を変える", "形を変えても量が同じなら、重さはどうなる？");
    const shape = core.options(section, { label: "形", values: [option("round", "丸い"), option("flat", "平ら")], value: state.shape, format: item => item.label, onChange: value => { state.shape = value; draw(); } });
    const material = core.options(section, { label: "材料", values: [option("clay", "粘土"), option("wood", "木"), option("iron", "鉄")], value: state.material, format: item => item.label, onChange: value => { state.material = value; draw(); } });
    const amount = core.range(section, { label: "量", min: 1, max: 3, value: state.amount, format: value => value + "こ分", onInput: value => { state.amount = value; draw(); } });
    function draw() {
      const density = { clay: 100, wood: 55, iron: 260 }[state.material];
      const weightValue = state.amount * density;
      const object = state.shape === "round" ? '<circle class="weight-object" cx="320" cy="185" r="58" fill="' + ({clay:"#c98268",wood:"#b88d57",iron:"#9ca7ac"}[state.material]) + '" stroke="#6c777b" stroke-width="4"/>' : '<rect class="weight-object" x="245" y="145" width="150" height="80" rx="10" fill="' + ({clay:"#c98268",wood:"#b88d57",iron:"#9ca7ac"}[state.material]) + '" stroke="#6c777b" stroke-width="4"/>';
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="img" aria-label="形と材料による物の重さのシミュレーション">' +
          '<rect width="640" height="360" fill="#f0f4f6"/><text x="28" y="42" class="scene-title">形を変えると、重さは？</text><text x="30" y="80" class="scene-caption">' + (state.shape === "round" ? "丸い形" : "平らな形") + "・" + ({clay:"粘土",wood:"木",iron:"鉄"}[state.material]) + "・" + state.amount + 'こ分</text>' +
          '<path d="M185 285 H455 M320 285 V305" stroke="#607483" stroke-width="6"/><path d="M220 310 H420" stroke="#607483" stroke-width="5"/><path d="M250 300 l-32 28 M390 300 l32 28" stroke="#607483" stroke-width="4"/>' + object +
          '<text x="125" y="335" class="component-label">量が同じなら、形を変えても重さは同じ</text><text x="440" y="185" class="component-label">' + weightValue + 'g</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "重さ", value: weightValue + "g", detail: "量 " + state.amount + "こ分" },
          { label: "形の影響", value: "変わらない", detail: state.shape === "round" ? "丸い形" : "平らな形" }
        ],
        message: state.shape === "round" || state.shape === "flat" ? "同じ量の物なら、丸めたり平らにしたりしても重さは変わらないね。材料を変えると重さを比べられるよ。" : ""
      });
      view.setTrial({ condition: ({clay:"粘土",wood:"木",iron:"鉄"}[state.material]) + "・" + (state.shape === "round" ? "丸い" : "平ら") + "・" + state.amount + "こ分", result: weightValue + "g" });
    }
    return {
      render: draw,
      reset: () => { state.shape = "round"; state.material = "clay"; state.amount = 1; shape.set(state.shape); material.set(state.material); amount.set(state.amount); draw(); },
      step: () => { state.shape = state.shape === "round" ? "flat" : "round"; shape.set(state.shape); draw(); }
    };
  }

  window.RikaThreeSimulations = {
    living: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: living })) },
    plants: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: plants })) },
    insects: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: insects })) },
    windrubber: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: windrubber })) },
    sound: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: sound })) },
    sun: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: sun })) },
    light: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: light })) },
    electricity: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: electricity })) },
    magnets: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: magnets })) },
    weight: { mount: (root, options) => mountInstant(root, Object.assign({}, options, { create: weight })) }
  };
})();
