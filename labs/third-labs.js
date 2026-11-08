(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const one = (value, digits = 0) => Number(value).toFixed(digits);
  const option = (id, label) => ({ id, label });

  function svgPoint(svg, event) {
    if (svg && svg.createSVGPoint && svg.getScreenCTM) {
      const matrix = svg.getScreenCTM();
      if (matrix && matrix.inverse) {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const mapped = point.matrixTransform(matrix.inverse());
        return { x: mapped.x, y: mapped.y };
      }
    }
    const rect = svg && svg.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    return {
      x: (event.clientX - rect.left) * 640 / rect.width,
      y: (event.clientY - rect.top) * 360 / rect.height
    };
  }

  // 画面側の演出専用：ステージの「表示値」を目標値へなめらかに寄せる小さなアニメーター。
  // 補間するのは見た目だけ。科学モデル・読み出し・ミッション判定は今までどおり state から計算する。
  const REDUCED_MOTION = typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function createSceneAnimator(stage, renderScene) {
    let raf = 0;
    let display = null;
    let target = null;
    const tick = () => {
      raf = 0;
      if (!display || !target) return;
      let done = true;
      Object.keys(target).forEach(key => {
        const diff = target[key] - display[key];
        if (Math.abs(diff) > 0.02) { done = false; display[key] += diff * 0.22; }
        else display[key] = target[key];
      });
      renderScene({ ...display });
      if (!done) raf = requestAnimationFrame(tick);
      else stage.classList.remove("is-direct-manipulating");
    };
    return {
      update(values, snap) {
        target = { ...(target || {}), ...values };
        if (!display || snap || REDUCED_MOTION) {
          display = { ...target };
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
          stage.classList.remove("is-direct-manipulating");
          renderScene({ ...display });
          return;
        }
        // アニメーション中は lab-core の場面パルスを止める（ドラッグ中と同じ扱い）。
        stage.classList.add("is-direct-manipulating");
        if (!raf) raf = requestAnimationFrame(tick);
      },
      destroy() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    };
  }

  // あそびミッションの達成判定。snapshot は各LABの draw() が渡す現在の状態、
  // mem はミッションごとに残る記憶（比べるミッションで「前に試した条件」を覚える）。
  // 初期状態のままで達成になってしまうミッションは、mem の遷移ガードで
  // 「一度ちがう状態を見てから戻る」ことを達成条件にしている。
  const MISSION_CHECKS = {
    living: {
      "pillbug-home": (s, mem) => {
        if (!(s.creature === "pillbug" && s.place === "understone")) mem.left = true;
        return Boolean(mem.left && s.creature === "pillbug" && s.place === "understone");
      },
      "butterfly-home": s => s.creature === "butterfly" && s.place === "flowers",
      "three-places": (s, mem) => {
        mem.byCreature = mem.byCreature || {};
        (mem.byCreature[s.creature] = mem.byCreature[s.creature] || new Set()).add(s.place);
        return Object.values(mem.byCreature).some(set => set.size >= 3);
      }
    },
    plants: {
      "flower": s => s.day >= 35,
      "fruit": s => s.day >= 49,
      "same-day": (s, mem) => {
        if (s.day > 0) {
          mem.days = mem.days || {};
          (mem.days[s.kind] = mem.days[s.kind] || new Set()).add(s.day);
        }
        if (!mem.days) return false;
        const a = mem.days.sunflower, b = mem.days.balsam;
        return Boolean(a && b && [...a].some(day => b.has(day)));
      }
    },
    insects: {
      "pupa": s => s.kind === "butterfly" && s.stage === 2,
      "two-adults": (s, mem) => {
        if (s.stageName === "成虫") { mem.adults = mem.adults || new Set(); mem.adults.add(s.kind); }
        return Boolean(mem.adults && mem.adults.size >= 2);
      },
      "no-pupa": (s, mem) => {
        if (s.kind === "grasshopper") { mem.stages = mem.stages || new Set(); mem.stages.add(s.stage); }
        return Boolean(mem.stages && mem.stages.size >= 3);
      }
    },
    windrubber: {
      "just120": s => Math.abs(s.distance - 120) <= 10,
      "max200": s => s.distance >= 200,
      "same-distance": (s, mem) => {
        if (s.distance > 0) {
          mem.bySource = mem.bySource || {};
          (mem.bySource[s.source] = mem.bySource[s.source] || new Set()).add(s.distance);
        }
        const w = mem.bySource && mem.bySource.wind, r = mem.bySource && mem.bySource.rubber;
        return Boolean(w && r && [...w].some(d => r.has(d)));
      }
    },
    sound: {
      "full-power": s => s.strength >= 100,
      "transmit50": s => s.transmission >= 50,
      "tight-loose": (s, mem) => {
        if (s.strength > 0) {
          mem.byStrength = mem.byStrength || {};
          (mem.byStrength[s.strength] = mem.byStrength[s.strength] || new Set()).add(s.string);
        }
        if (!mem.byStrength) return false;
        return Object.values(mem.byStrength).some(set => set.size >= 2);
      }
    },
    sun: {
      "shortest-shadow": (s, mem) => {
        if (s.time !== 12) mem.moved = true;
        return Boolean(mem.moved && s.time === 12);
      },
      "hottest": s => s.temp >= 31,
      "west-shadow": s => s.time < 12
    },
    light: {
      "three-mirrors": s => s.mirrors >= 3,
      "to-top": s => s.zone === "上",
      "to-bottom": s => s.zone === "下"
    },
    electricity: {
      "light-it": (s, mem) => {
        if (!s.lit) mem.dark = true;
        return Boolean(mem.dark && s.lit);
      },
      "find-blockers": (s, mem) => {
        if (s.closed === "closed" && !s.conducts) { mem.set = mem.set || new Set(); mem.set.add(s.material); }
        return Boolean(mem.set && mem.set.size >= 3);
      },
      "find-conductors": (s, mem) => {
        if (s.closed === "closed" && s.conducts) { mem.set = mem.set || new Set(); mem.set.add(s.material); }
        return Boolean(mem.set && mem.set.size >= 3);
      }
    },
    magnets: {
      "attract": (s, mem) => {
        if (!s.opposite) mem.same = true;
        return Boolean(mem.same && s.opposite);
      },
      "force100": s => s.material === "iron" && s.force >= 100,
      "three-distances": (s, mem) => {
        if (s.material === "iron") { mem.set = mem.set || new Set(); mem.set.add(s.distance); }
        return Boolean(mem.set && mem.set.size >= 3);
      }
    },
    weight: {
      "same-weight": (s, mem) => {
        mem.seen = mem.seen || {};
        const key = s.material + ":" + s.amount;
        (mem.seen[key] = mem.seen[key] || new Set()).add(s.shape);
        return Object.values(mem.seen).some(set => set.size >= 2);
      },
      "just24": s => s.weight === 24,
      "match-wood-clay": (s, mem) => {
        mem.weights = mem.weights || {};
        (mem.weights[s.material] = mem.weights[s.material] || new Set()).add(s.weight);
        const w = mem.weights.wood, c = mem.weights.clay;
        return Boolean(w && c && [...w].some(value => value > 0 && c.has(value)));
      }
    }
  };

  // 進み具合の表示（比べる・集めるミッション用）。mem から「あと少し」が分かる文を作る。
  const setProgress = (mem, total, unit) => {
    const best = mem.set ? mem.set.size : 0;
    return "いま " + best + " / " + total + unit;
  };
  const MISSION_PROGRESS = {
    living: {
      "three-places": mem => {
        const sizes = Object.values(mem.byCreature || {}).map(set => set.size);
        return "調べた場所 いま " + (sizes.length ? Math.max(...sizes) : 0) + " / 3";
      }
    },
    insects: {
      "no-pupa": mem => "バッタの段階 いま " + (mem.stages ? mem.stages.size : 0) + " / 3"
    },
    electricity: {
      "find-blockers": mem => setProgress(mem, 3, "つ"),
      "find-conductors": mem => setProgress(mem, 3, "つ")
    },
    magnets: {
      "three-distances": mem => setProgress(mem, 3, "通り")
    }
  };

  function mountInstant(root, { core, host, manifest, create }) {
    const view = core.shell(root, manifest, { onHome: () => host.routeTo("lab") });
    view.note.textContent = manifest.modelNote || "";
    const model = create(view, core);
    if (Array.isArray(manifest.missions) && manifest.missions.length && typeof core.missionPanel === "function" && host.onMission) {
      view.setMissionState = core.missionPanel(view, manifest, {
        isDone: missionId => Boolean(host.missionDone && host.missionDone(manifest.id, missionId)),
        onAchieve: mission => host.onMission(manifest.id, mission),
        checks: MISSION_CHECKS[manifest.id] || {},
        progress: MISSION_PROGRESS[manifest.id] || {}
      });
    }
    core.action(view.actions, "リセット", () => model.reset());
    core.action(view.actions, model.stepLabel || "1つ進める", () => {
      if (typeof model.step === "function") { model.step(); view.markTried(); }
    });
    core.action(view.actions, "🎲 おまかせ", () => { core.randomizeOne(view); }, "randomize-button");
    core.action(view.actions, "📒 記録", () => {
      if (view.saveTrial()) host.showToast && host.showToast("実験ノートに記録したよ");
    }, "primary-button");
    model.render();
    return () => {
      model.destroy && model.destroy();
      view.destroy();
    };
  }

  function living(view, core) {
    const state = { creature: "pillbug", place: "understone" };
    const creatures = {
      pillbug: { label: "ダンゴムシ", icon: "●", color: "#7b6a61" },
      butterfly: { label: "チョウ", icon: "🦋", color: "#d78bab" }
    };
    const places = {
      understone: { label: "石の下", ground: "#82906f" },
      flowers: { label: "花のある日なた", ground: "#83b968" },
      bare: { label: "かわいた地面", ground: "#d2b77d" }
    };
    const scores = {
      pillbug: { understone: 9, flowers: 3, bare: 1 },
      butterfly: { understone: 1, flowers: 9, bare: 2 }
    };
    const section = core.section(view.panel, "生き物と場所を変える", "同じ場所でも、生き物の種類によって見つかり方は同じかな。");
    const creature = core.options(section, { label: "さがす生き物", values: [option("pillbug", "ダンゴムシ"), option("butterfly", "チョウ")], value: state.creature, format: item => item.label, onChange: value => { state.creature = value; draw(); } });
    const place = core.options(section, { label: "さがす場所", values: [option("understone", "石の下"), option("flowers", "花のある日なた"), option("bare", "かわいた地面")], value: state.place, format: item => item.label, onChange: value => { state.place = value; draw(); } });
    function draw() {
      const creatureData = creatures[state.creature];
      const placeData = places[state.place];
      const found = scores[state.creature][state.place];
      const marks = Array.from({ length: found }, (_, i) => {
        const x = 126 + (i * 67) % 390;
        const y = 222 + (i % 3) * 22;
        if (state.creature === "butterfly") {
          return '<ellipse cx="' + x + '" cy="267" rx="15" ry="3.5" fill="#22331f" opacity=".13"/><text class="sim-bug" style="--bug-delay:' + (i * .08) + 's" x="' + x + '" y="' + y + '" font-size="27">🦋</text>';
        }
        return '<g class="sim-bug" style="--bug-delay:' + (i * .08) + 's"><ellipse cx="' + x + '" cy="' + (y + 11) + '" rx="12" ry="3.5" fill="#22331f" opacity=".16"/><circle cx="' + x + '" cy="' + y + '" r="10" fill="' + creatureData.color + '"/><path d="M' + (x - 7) + ' ' + y + 'h14" stroke="#ded6ce" stroke-width="2"/></g>';
      }).join("");
      const grassTufts = [[70, 272], [215, 276], [470, 274], [560, 270]].map((p, i) =>
        '<path class="grass-sway" style="--sway-delay:' + (i * .4) + 's" d="M' + p[0] + ' ' + p[1] + ' q3 -20 8 -26 M' + (p[0] + 9) + ' ' + p[1] + ' q-2 -18 -7 -24 M' + (p[0] + 4) + ' ' + p[1] + ' q1 -22 3 -30" fill="none" stroke="#5d9c52" stroke-width="3.4" stroke-linecap="round"/>'
      ).join("");
      const scene = state.place === "understone"
        ? '<ellipse cx="320" cy="266" rx="212" ry="11" fill="#5f7050" opacity=".55"/>' +
          '<path d="M118 246 Q128 194 320 190 Q514 194 524 246 Q524 264 320 264 Q118 264 118 246Z" fill="#a3a8a0"/>' +
          '<ellipse cx="320" cy="214" rx="148" ry="15" fill="#ffffff" opacity=".18"/>' +
          '<ellipse cx="205" cy="252" rx="9" ry="3" fill="#ffffff" opacity=".22"/><ellipse cx="438" cy="256" rx="7" ry="2.6" fill="#ffffff" opacity=".22"/>' +
          '<ellipse cx="150" cy="300" rx="17" ry="6" fill="#b98a4a" transform="rotate(-18 150 300)"/><ellipse cx="492" cy="312" rx="14" ry="5" fill="#a87c3e" transform="rotate(14 492 312)"/>' +
          '<ellipse cx="255" cy="330" rx="26" ry="5" fill="#68795a"/><ellipse cx="420" cy="342" rx="34" ry="5" fill="#68795a"/>'
        : state.place === "flowers"
          ? '<g><circle cx="556" cy="54" r="34" fill="#f7cf4d" opacity=".28"/><circle cx="556" cy="54" r="23" fill="#f7cf4d"/><g class="cloud-drift"><ellipse cx="408" cy="48" rx="40" ry="14" fill="#ffffff" opacity=".92"/><ellipse cx="436" cy="40" rx="26" ry="11" fill="#ffffff" opacity=".92"/></g></g>' +
            '<path d="M150 270 C140 235 144 205 150 184 M270 270 C262 230 266 195 270 170 M405 270 C398 232 402 198 405 180" fill="none" stroke="#4f934b" stroke-width="9" stroke-linecap="round"/><circle cx="150" cy="164" r="18" fill="#f0a3b3"/><circle cx="270" cy="150" r="18" fill="#f2c955"/><circle cx="405" cy="160" r="18" fill="#a9a1df"/>' +
            [[88, "#e88bb0"], [180, "#f2c955"], [262, "#ffffff"], [352, "#f0a3b3"], [442, "#e88bb0"], [530, "#a9a1df"]].map((f, i) =>
              '<path d="M' + f[0] + ' 274 V' + (256 - (i % 3) * 4) + '" stroke="#4f934b" stroke-width="4"/><circle cx="' + f[0] + '" cy="' + (252 - (i % 3) * 4) + '" r="7.5" fill="' + f[1] + '"/><circle cx="' + f[0] + '" cy="' + (252 - (i % 3) * 4) + '" r="2.8" fill="#e8a33d"/>'
            ).join("") + grassTufts
          : '<path d="M90 265 Q180 245 270 265 T450 260 T570 267" fill="none" stroke="#ad9365" stroke-width="5"/>' +
            '<path d="M120 292 q22 10 44 2 M300 306 q26 12 52 3 M452 290 q20 9 40 2" fill="none" stroke="#b08d55" stroke-width="3" stroke-linecap="round"/>' +
            '<ellipse cx="170" cy="318" rx="13" ry="5" fill="#b7ab98"/><ellipse cx="428" cy="330" rx="17" ry="6" fill="#b7ab98"/><ellipse cx="512" cy="306" rx="9" ry="4" fill="#c2b6a2"/>' +
            '<path d="M96 274 q3 -16 8 -21 M104 274 q-2 -13 -6 -18" fill="none" stroke="#c2a15e" stroke-width="3.4" stroke-linecap="round"/><path d="M540 272 q3 -15 8 -20 M548 272 q-2 -12 -6 -17" fill="none" stroke="#c2a15e" stroke-width="3.4" stroke-linecap="round"/>';
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="group" aria-label="' + creatureData.label + 'を' + placeData.label + 'で探すシミュレーション">' +
          '<defs><linearGradient id="livingSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2faf0"/><stop offset="1" stop-color="#e2f2dd"/></linearGradient></defs>' +
          '<rect width="640" height="360" fill="url(#livingSky)"/><rect y="270" width="640" height="90" fill="' + placeData.ground + '"/><rect y="270" width="640" height="7" fill="#22331f" opacity=".1"/>' +
          '<text x="28" y="42" class="scene-title">どんな場所で見つかる？</text><text x="30" y="80" class="scene-caption">' + creatureData.label + 'を「' + placeData.label + '」でさがす</text>' +
          '<g class="living-habitat-target scene-tap-target" role="button" tabindex="0" aria-label="場所を切り替える"><rect x="18" y="110" width="604" height="166" fill="#fff" fill-opacity="0.001"/>' + scene + '</g>' +
          '<g class="living-creature-target scene-tap-target" role="button" tabindex="0" aria-label="さがす生き物を切り替える">' + marks + '</g>' +
          '<text x="55" y="330" class="component-label">背景をタップ・左右にうごかす：場所／生き物をタップ：種類</text>' +
        '</svg>';
      const reason = state.creature === "pillbug"
        ? (state.place === "understone" ? "ダンゴムシは、暗くて湿り気のある石の下などで見つかりやすいね。" : "別の場所も調べ、暗さや湿り気との関係を比べよう。")
        : (state.place === "flowers" ? "チョウは、明るく花のある場所で見つかりやすいね。" : "花のある場所と比べ、食べ物や明るさとの関係を考えよう。");
      core.renderReadout(view.readout, {
        metrics: [
          { label: "さがす生き物", value: creatureData.label, detail: "種類を区別して観察" },
          { label: "見つかりやすさ", value: found + " / 10", detail: placeData.label + "でのモデル" }
        ],
        message: reason,
        note: "生き物によって、食べ物やかくれ場所など、くらしやすい環境はちがいます。"
      });
      view.setTrial({ condition: creatureData.label + "・" + placeData.label, result: "見つかりやすさ " + found + " / 10" });
      if (view.setMissionState) view.setMissionState({ creature: state.creature, place: state.place, found });
    }
    const livingStage = view.stage;
    const nextPlace = () => {
      const order = ["understone", "flowers", "bare"];
      state.place = order[(order.indexOf(state.place) + 1) % order.length];
      place.set(state.place);
      if (view.markTried) view.markTried();
      draw();
    };
    const toggleCreature = () => {
      state.creature = state.creature === "pillbug" ? "butterfly" : "pillbug";
      creature.set(state.creature);
      if (view.markTried) view.markTried();
      draw();
    };
    const prevPlace = () => {
      const order = ["understone", "flowers", "bare"];
      state.place = order[(order.indexOf(state.place) + order.length - 1) % order.length];
      place.set(state.place);
      draw();
    };
    let livingDrag = null;
    let suppressLivingClickUntil = 0;
    livingStage.addEventListener("pointerdown", event => {
      if (!event.target.closest || !event.target.closest(".living-habitat-target")) return;
      if (event.target.closest(".living-creature-target")) return;
      const point = svgPoint(livingStage.querySelector("svg"), event);
      if (!point) return;
      livingDrag = { x: point.x, moved: false };
      if (livingStage.setPointerCapture) {
        try { livingStage.setPointerCapture(event.pointerId); }
        catch (_) { livingDrag = null; return; }
      }
      livingStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    livingStage.addEventListener("pointermove", event => {
      if (!livingDrag) return;
      const point = svgPoint(livingStage.querySelector("svg"), event);
      if (!point) return;
      const dx = point.x - livingDrag.x;
      if (Math.abs(dx) > 12) livingDrag.moved = true;
      if (dx <= -70) { nextPlace(); livingDrag.x = point.x; }
      else if (dx >= 70) { prevPlace(); livingDrag.x = point.x; }
    });
    const stopLivingDrag = () => {
      if (livingDrag && livingDrag.moved) {
        suppressLivingClickUntil = Date.now() + 250;
        if (view.markTried) view.markTried();
      }
      livingDrag = null;
      livingStage.classList.remove("is-direct-manipulating");
    };
    livingStage.addEventListener("pointerup", stopLivingDrag);
    livingStage.addEventListener("pointercancel", stopLivingDrag);
    livingStage.addEventListener("lostpointercapture", stopLivingDrag);
    livingStage.addEventListener("click", event => {
      if (Date.now() < suppressLivingClickUntil) return;
      if (!event.target.closest) return;
      if (event.target.closest(".living-creature-target")) toggleCreature();
      else if (event.target.closest(".living-habitat-target")) nextPlace();
    });
    livingStage.addEventListener("keydown", event => {
      if (!event.target.closest || !["Enter", " "].includes(event.key)) return;
      const target = event.target.closest(".living-creature-target, .living-habitat-target");
      if (!target) return;
      event.preventDefault();
      if (target.classList.contains("living-creature-target")) toggleCreature();
      else nextPlace();
      const selector = target.classList.contains("living-creature-target") ? ".living-creature-target" : ".living-habitat-target";
      const handle = livingStage.querySelector(selector);
      if (handle) handle.focus();
    });
    return {
      render: draw,
      reset: () => { state.creature = "pillbug"; state.place = "understone"; creature.set(state.creature); place.set(state.place); draw(); },
      stepLabel: "場所を1つ進める",
      step: () => {
        const order = ["understone", "flowers", "bare"];
        state.place = order[(order.indexOf(state.place) + 1) % order.length];
        place.set(state.place);
        draw();
      }
    };
  }

  function plants(view, core) {
    const state = { kind: "sunflower", day: 14, focus: "growth" };
    const kinds = {
      sunflower: { label: "ヒマワリ", stem: "#4f934b", flower: "#f2c94c", maxHeight: 116 },
      balsam: { label: "ホウセンカ", stem: "#4a8b62", flower: "#e692b2", maxHeight: 96 }
    };
    const section = core.section(view.panel, "育ち方を時間で見る", "日数や植物の種類を変えて、育つ順序と体のつくりを比べよう。");
    const kind = core.options(section, { label: "植物", values: [option("sunflower", "ヒマワリ"), option("balsam", "ホウセンカ")], value: state.kind, format: item => item.label, onChange: value => { state.kind = value; draw(); } });
    const day = core.range(section, { label: "育ちの目安（日）", min: 0, max: 63, step: 7, value: state.day, format: value => value + "日", onInput: value => { state.day = value; draw(); } });
    const focus = core.options(section, { label: "見るところ", values: [option("growth", "育つ順序"), option("body", "体のつくり")], value: state.focus, format: item => item.label, onChange: value => { state.focus = value; draw(); } });
    function draw() {
      const data = kinds[state.kind];
      const leaves = state.day < 7 ? 0 : Math.min(10, 2 + Math.floor(state.day / 7));
      const stageName = state.day === 0 ? "種" : state.day < 14 ? "芽が出る" : state.day < 35 ? "葉がふえてのびる" : state.day < 49 ? "つぼみ・花" : "花のあとに実";
      core.renderReadout(view.readout, {
        metrics: [
          { label: "育ちの段階", value: stageName, detail: state.day + "日目のモデル" },
          { label: "体のつくり", value: state.day === 0 ? "種" : "根・茎・葉" + (state.day >= 35 ? "・花" : "") + (state.day >= 49 ? "・実" : ""), detail: data.label }
        ],
        message: state.focus === "body"
          ? "大きくなっても、植物の体は主に根・茎・葉からできています。花のあとには実ができます。"
          : "日数を進めると、芽が出て、葉がふえ、花が咲き、花のあとに実ができる順序が見えるね。",
        note: "実際の育つ速さは、植物の種類や天候、育て方によって変わります。"
      });
      view.setTrial({ condition: data.label + "・" + state.day + "日目", result: stageName + "・葉 " + leaves + "枚" });
      if (view.setMissionState) view.setMissionState({ kind: state.kind, day: state.day, focus: state.focus });
      animator.update({ day: state.day });
    }
    // 場面だけを「表示日（小数）」で描く。日が小数のあいだは茎・葉・花・実が途中まで育った姿になる。
    function renderScene(disp) {
      const data = kinds[state.kind];
      const day = disp.day;
      const growth = clamp(day / 49, 0, 1);
      const height = 20 + growth * data.maxHeight;
      const stageName = state.day === 0 ? "種" : state.day < 14 ? "芽が出る" : state.day < 35 ? "葉がふえてのびる" : state.day < 49 ? "つぼみ・花" : "花のあとに実";
      const leafMarks = Array.from({ length: 10 }, (_, i) => {
        const s = clamp((day - (5 + i * 4.5)) / 3, 0, 1);
        if (s <= 0) return "";
        const x = 320 + (i % 2 ? 31 : -31);
        const y = 262 - (i + 0.7) * (height / 9.5);
        return '<ellipse cx="0" cy="0" rx="28" ry="12" transform="translate(' + x + ' ' + y.toFixed(1) + ') rotate(' + (i % 2 ? 24 : -24) + ') scale(' + s.toFixed(2) + ')" fill="' + data.stem + '"/>';
      }).join("");
      const flowerScale = clamp((day - 35) / 6, 0, 1);
      const flower = flowerScale > 0
        ? '<g transform="translate(320 ' + (260 - height) + ') scale(' + flowerScale.toFixed(2) + ')">' + (state.kind === "sunflower"
          ? '<circle cx="0" cy="0" r="29" fill="' + data.flower + '"/><circle cx="0" cy="0" r="12" fill="#7d5b31"/>'
          : '<circle cx="-13" cy="5" r="15" fill="' + data.flower + '"/><circle cx="10" cy="0" r="15" fill="' + data.flower + '"/>') + '</g>'
        : "";
      const fruitScale = clamp((day - 49) / 6, 0, 1);
      const fruit = fruitScale > 0 ? '<g transform="translate(320 ' + (282 - height) + ') scale(' + fruitScale.toFixed(2) + ')"><ellipse cx="0" cy="0" rx="13" ry="22" fill="#8aa65c" stroke="#567342" stroke-width="3"/></g>' : "";
      const seed = day < 2 ? '<ellipse cx="320" cy="268" rx="' + (24 * (1 - day / 2)).toFixed(1) + '" ry="' + (12 * (1 - day / 2)).toFixed(1) + '" fill="#8e6b42"/>' : "";
      const stem = day > 0.4 ? '<path d="M320 274 Q314 ' + (274 - height / 2) + ' 320 ' + (274 - height) + '" fill="none" stroke="' + data.stem + '" stroke-width="12" stroke-linecap="round"/>' : "";
      const roots = state.focus === "body" ? '<g class="plant-roots"><path d="M320 274 Q292 305 275 337 M320 274 Q335 311 370 338 M320 274 V345" fill="none" stroke="#9a744f" stroke-width="6" stroke-linecap="round"/><text x="382" y="336" class="component-label">根</text></g>' : "";
      const labels = state.focus === "body"
        ? '<path d="M350 170 H430" stroke="#607483" stroke-width="2"/><text x="440" y="176" class="component-label">葉</text><path d="M329 225 H430" stroke="#607483" stroke-width="2"/><text x="440" y="231" class="component-label">茎</text>'
        : '<text x="90" y="326" class="component-label">種 → 芽 → 葉がふえる → 花 → 実</text>';
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="group" aria-label="' + data.label + 'の育ち方と体のつくりのシミュレーション">' +
          '<defs><linearGradient id="plantSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7fcf2"/><stop offset="1" stop-color="#e9f6df"/></linearGradient></defs>' +
          '<rect width="640" height="360" fill="url(#plantSky)"/><rect y="274" width="640" height="86" fill="#b99a72"/>' +
          '<ellipse cx="320" cy="278" rx="128" ry="10" fill="#a07d55"/><ellipse cx="238" cy="292" rx="16" ry="3.4" fill="#a07d55" opacity=".65"/><ellipse cx="402" cy="300" rx="20" ry="3.8" fill="#a07d55" opacity=".65"/><ellipse cx="322" cy="318" rx="24" ry="4" fill="#a07d55" opacity=".5"/>' +
          '<path d="M120 274 q3 -16 8 -21 M128 274 q-2 -13 -6 -18 M512 274 q3 -15 8 -20 M520 274 q-2 -12 -6 -17" fill="none" stroke="#6aa84f" stroke-width="3.4" stroke-linecap="round"/>' +
          '<text x="28" y="42" class="scene-title">時間がたつと、どこが変わる？</text><text x="30" y="80" class="scene-caption">' + data.label + '・' + state.day + '日目・' + stageName + '</text><text x="28" y="110" class="tiny-label">植物を上にドラッグすると育ちが進むよ</text>' +
          '<g class="plant-growth-target drag-handle" role="slider" tabindex="0" aria-label="植物を上下に動かして育ちの日数を調整" aria-valuemin="0" aria-valuemax="63" aria-valuenow="' + state.day + '">' + seed + stem + leafMarks + flower + fruit + '</g>' +
          roots + labels +
        '</svg>';
    }
    const animator = createSceneAnimator(view.stage, renderScene);
    let draggingPlantGrowth = false;
    let plantStartY = 0;
    let plantStartDay = state.day;
    const plantStage = view.stage;
    plantStage.addEventListener("pointerdown", event => {
      const handle = event.target.closest && event.target.closest(".plant-growth-target");
      if (!handle) return;
      const point = svgPoint(plantStage.querySelector("svg"), event);
      if (!point) return;
      plantStartY = point.y;
      plantStartDay = state.day;
      draggingPlantGrowth = true;
      if (plantStage.setPointerCapture) {
        try { plantStage.setPointerCapture(event.pointerId); }
        catch (_) { draggingPlantGrowth = false; return; }
      }
      plantStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    plantStage.addEventListener("pointermove", event => {
      if (!draggingPlantGrowth) return;
      const point = svgPoint(plantStage.querySelector("svg"), event);
      if (!point) return;
      const dayDelta = (plantStartY - point.y) * 0.45;
      state.day = clamp(Math.round((plantStartDay + dayDelta) / 7) * 7, 0, 63);
      day.set(state.day);
      draw();
    });
    const stopDraggingPlant = () => {
      if (draggingPlantGrowth && view.markTried) view.markTried();
      draggingPlantGrowth = false;
      plantStage.classList.remove("is-direct-manipulating");
    };
    plantStage.addEventListener("pointerup", stopDraggingPlant);
    plantStage.addEventListener("pointercancel", stopDraggingPlant);
    plantStage.addEventListener("lostpointercapture", stopDraggingPlant);
    plantStage.addEventListener("keydown", event => {
      if (!event.target.closest || !event.target.closest(".plant-growth-target") || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      state.day = clamp(state.day + (event.key === "ArrowUp" ? 7 : -7), 0, 63);
      day.set(state.day);
      if (view.markTried) view.markTried();
      draw();
      const handle = plantStage.querySelector(".plant-growth-target");
      if (handle) handle.focus();
    });
    return {
      render: draw,
      destroy: () => animator.destroy(),
      stepLabel: "7日進める",
      reset: () => { state.kind = "sunflower"; state.day = 14; state.focus = "growth"; kind.set(state.kind); day.set(state.day); focus.set(state.focus); draw(); },
      step: () => { state.day = state.day >= 63 ? 0 : state.day + 7; day.set(state.day); draw(); }
    };
  }

  function insects(view, core) {
    const state = { kind: "butterfly", stage: 1 };
    let lastFigureKey = null;
    let lastFigureHTML = "";
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
      else if (name === "幼虫") figure = '<g class="larva-wiggle"><path d="M210 205 Q270 145 330 205 T450 205" fill="none" stroke="#68a55c" stroke-width="28" stroke-linecap="round"/><circle cx="215" cy="201" r="23" fill="#78b86b"/></g>';
      else if (name === "さなぎ") figure = '<path d="M300 125 Q355 120 365 178 Q368 238 320 255 Q278 225 285 170Z" fill="#9c8561" stroke="#6c5d49" stroke-width="4"/>';
      else if (state.kind === "butterfly") figure = '<path class="wing-flap wing-flap-l" d="M290 175 Q220 95 205 175 Q210 225 290 202Z" fill="#e9b8d0" stroke="#9b6a8c" stroke-width="4"/>' +
        '<path class="wing-flap wing-flap-r" d="M350 175 Q420 95 435 175 Q430 225 350 202Z" fill="#e9b8d0" stroke="#9b6a8c" stroke-width="4"/>' +
        '<ellipse cx="320" cy="190" rx="52" ry="22" fill="#7b9f55"/><circle cx="270" cy="190" r="23" fill="#a86b45"/>' +
        '<path d="M294 188 l-55 -28 M294 195 l-62 12 M346 188 l55 -28 M346 195 l62 12" stroke="#5e6b52" stroke-width="5" stroke-linecap="round"/>';
      else figure = '<ellipse cx="330" cy="190" rx="75" ry="24" fill="#78a45a"/><circle cx="255" cy="184" r="24" fill="#97bc70"/><path d="M290 207 l-55 50 M330 210 l-16 52 M370 207 l55 48" stroke="#536f42" stroke-width="8" stroke-linecap="round"/><path d="M260 163 l-35 -35 M270 165 l12 -46" stroke="#536f42" stroke-width="4"/>';
      const bodyText = adult ? "頭・胸・腹、胸から6本の足" : "成長の途中";
      const figureKey = state.kind + ":" + state.stage;
      const ghost = lastFigureHTML && lastFigureKey !== figureKey ? '<g class="stage-ghost" aria-hidden="true">' + lastFigureHTML + '</g>' : "";
      lastFigureKey = figureKey;
      lastFigureHTML = figure;
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="group" aria-label="昆虫の育ち方と体のつくりのシミュレーション">' +
          '<rect width="640" height="360" fill="#fff7ed"/><rect y="252" width="640" height="108" fill="#f3e3c2" opacity=".55"/>' +
          '<path d="M60 262 q3 -16 8 -21 M68 262 q-2 -13 -6 -18 M556 262 q3 -15 8 -20 M564 262 q-2 -12 -6 -17" fill="none" stroke="#8fae62" stroke-width="3.4" stroke-linecap="round"/>' +
          '<text x="28" y="42" class="scene-title">育ちの順序と体のつくり</text><text x="30" y="80" class="scene-caption">' + (state.kind === "butterfly" ? "チョウ" : "バッタ") + "：" + name + '</text>' +
          (state.kind === "butterfly" ? '<path d="M100 285 H540" stroke="#c4a56e" stroke-width="4" stroke-dasharray="8 9"/><circle cx="130" cy="285" r="14" fill="#e7d28f"/><circle cx="280" cy="285" r="14" fill="#78b86b"/><circle cx="410" cy="285" r="14" fill="#9c8561"/><circle cx="520" cy="285" r="14" fill="#e9b8d0"/><text x="112" y="320" class="component-label">卵</text><text x="255" y="320" class="component-label">幼虫</text><text x="370" y="320" class="component-label">さなぎ</text><text x="495" y="320" class="component-label">成虫</text>' : '<path d="M120 285 H520" stroke="#c4a56e" stroke-width="4" stroke-dasharray="8 9"/><circle cx="150" cy="285" r="14" fill="#e7d28f"/><circle cx="320" cy="285" r="14" fill="#78b86b"/><circle cx="500" cy="285" r="14" fill="#91b86d"/><text x="132" y="320" class="component-label">卵</text><text x="295" y="320" class="component-label">幼虫</text><text x="475" y="320" class="component-label">成虫</text>') +
          '<ellipse cx="320" cy="256" rx="96" ry="9" fill="#22331f" opacity=".08"/>' + ghost + '<g class="life-stage-figure scene-tap-target" role="button" tabindex="0" aria-label="昆虫をタップして次の育ちの段階へ進める">' + figure + '</g>' +
          '<text x="410" y="120" class="component-label">' + bodyText + '</text>' +
          '<text x="195" y="345" class="tiny-label">昆虫をタップ、または左右にスワイプして段階を変えよう</text>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "いまの段階", value: name, detail: state.kind === "butterfly" ? "卵→幼虫→さなぎ→成虫" : "卵→幼虫→成虫" },
          { label: "成虫の体", value: adult ? "3つに分かれる" : "これから変化", detail: adult ? "頭・胸・腹" : "育ちの途中" }
        ],
        message: state.kind === "butterfly" ? "チョウにはさなぎの時期があるね。成虫の体は頭・胸・腹に分かれるよ。" : "バッタはさなぎにならず、幼虫から少しずつ成虫に近づくね。"
      });
      view.setTrial({ condition: state.kind === "butterfly" ? "チョウ" : "バッタ", result: state.kind === "butterfly" ? "卵→幼虫→さなぎ→成虫" : "卵→幼虫→成虫" });
      if (view.setMissionState) view.setMissionState({ kind: state.kind, stage: state.stage, stageName: name });
    }
    const insectStage = view.stage;
    const advanceLifeStage = () => {
      const max = state.kind === "butterfly" ? 3 : 2;
      state.stage = state.stage >= max ? 0 : state.stage + 1;
      stage.set(state.stage);
      if (view.markTried) view.markTried();
      draw();
    };
    const retreatLifeStage = () => {
      const max = state.kind === "butterfly" ? 3 : 2;
      state.stage = state.stage <= 0 ? max : state.stage - 1;
      stage.set(state.stage);
      if (view.markTried) view.markTried();
      draw();
    };
    let insectDrag = null;
    let suppressInsectClickUntil = 0;
    insectStage.addEventListener("pointerdown", event => {
      if (!event.target.closest || !event.target.closest(".life-stage-figure")) return;
      const point = svgPoint(insectStage.querySelector("svg"), event);
      if (!point) return;
      insectDrag = { x: point.x, moved: false };
      if (insectStage.setPointerCapture) {
        try { insectStage.setPointerCapture(event.pointerId); }
        catch (_) { insectDrag = null; return; }
      }
      insectStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    insectStage.addEventListener("pointermove", event => {
      if (!insectDrag) return;
      const point = svgPoint(insectStage.querySelector("svg"), event);
      if (!point) return;
      const dx = point.x - insectDrag.x;
      if (Math.abs(dx) > 12) insectDrag.moved = true;
      if (dx <= -60) { advanceLifeStage(); insectDrag.x = point.x; }
      else if (dx >= 60) { retreatLifeStage(); insectDrag.x = point.x; }
    });
    const stopInsectDrag = () => {
      if (insectDrag && insectDrag.moved) suppressInsectClickUntil = Date.now() + 250;
      insectDrag = null;
      insectStage.classList.remove("is-direct-manipulating");
    };
    insectStage.addEventListener("pointerup", stopInsectDrag);
    insectStage.addEventListener("pointercancel", stopInsectDrag);
    insectStage.addEventListener("lostpointercapture", stopInsectDrag);
    insectStage.addEventListener("click", event => {
      if (Date.now() < suppressInsectClickUntil) return;
      if (!event.target.closest || !event.target.closest(".life-stage-figure")) return;
      advanceLifeStage();
    });
    insectStage.addEventListener("keydown", event => {
      if (!event.target.closest || !event.target.closest(".life-stage-figure") || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      advanceLifeStage();
      const handle = insectStage.querySelector(".life-stage-figure");
      if (handle) handle.focus();
    });
    return {
      render: draw,
      stepLabel: "育ちを1段階進める",
      reset: () => { state.kind = "butterfly"; state.stage = 1; kind.set(state.kind); stage.setMax(3); stage.set(state.stage); draw(); },
      step: () => { const max = state.kind === "butterfly" ? 3 : 2; state.stage = state.stage >= max ? 0 : state.stage + 1; stage.set(state.stage); draw(); }
    };
  }

  function windrubber(view, core) {
    const state = { force: 55, source: "wind" };
    const section = core.section(view.panel, "力の大きさを変える", "風の強さやゴムの伸びを変えて、車の距離を見よう。");
    const source = core.options(section, { label: "力の種類", values: [option("wind", "風"), option("rubber", "ゴム")], value: state.source, format: item => item.label, onChange: value => { state.source = value; force.setLabel(value === "wind" ? "風の強さ" : "ゴムの伸び"); draw(); } });
    const force = core.range(section, { label: state.source === "wind" ? "風の強さ" : "ゴムの伸び", min: 0, max: 100, value: state.force, format: value => value + "%", onInput: value => { state.force = value; draw(); } });
    function draw() {
      const distance = state.source === "wind" ? Math.round(state.force * 2) : Math.round(state.force * state.force / 50);
      core.renderReadout(view.readout, {
        metrics: [
          { label: "力の種類", value: state.source === "wind" ? "風" : "ゴム", detail: "変えた条件" },
          { label: "進んだ距離", value: distance + " cm", detail: "モデルの目安（実測値ではない）" }
        ],
        message: state.force === 0 ? "力が0%のときは、車が進まないモデルだよ。" : state.source === "wind" ? "風を強くすると、車の進む距離が長くなるモデルだよ。" : "ゴムを長くのばすほど、たくわえられる力が大きくなるモデルだよ。",
        note: "距離は条件の違いを比べるためのモデル値です。実際の距離は車や床、風、ゴムの条件によって変わります。"
      });
      view.setTrial({ condition: (state.source === "wind" ? "風" : "ゴム") + "・力 " + state.force + "%", result: distance + "cm進んだ" });
      if (view.setMissionState) view.setMissionState({ source: state.source, force: state.force, distance });
      animator.update({ force: state.force });
    }
    let wheelAngle = 0;
    let lastDist = null;
    // 場面は「表示中の力（小数）」で描く。車の進みとタイヤの回転がアニメーションになる。
    function renderScene(disp) {
      const f = disp.force;
      const distance = state.source === "wind" ? Math.round(f * 2) : Math.round(f * f / 50);
      if (lastDist === null) lastDist = distance;
      wheelAngle += (distance - lastDist) * 4.8;
      lastDist = distance;
      const carX = 92 + distance * 2.0;
      const wheel = cx => '<g transform="rotate(' + wheelAngle.toFixed(1) + ' ' + cx + ' 270)"><circle cx="' + cx + '" cy="270" r="12" fill="#4b5c62"/><path d="M' + (cx - 8) + ' 270 H' + (cx + 8) + ' M' + cx + ' 262 V278" stroke="#dfe9ec" stroke-width="3.4"/></g><circle cx="' + cx + '" cy="270" r="3.4" fill="#dfe9ec"/>';
      const arrows = state.source === "wind"
        ? '<path class="force-arrow" d="M105 150 H250 M130 125 H300 M170 175 H330" stroke="#5aa6b4" stroke-width="9" stroke-linecap="round"/><path class="force-arrow" d="M240 140 l25 10 -25 10 M290 115 l25 10 -25 10 M320 165 l25 10 -25 10" fill="none" stroke="#327b8b" stroke-width="6"/>' +
          (f > 0 ? [118, 146, 168, 196].map((y, i) => '<circle class="wind-particle" style="animation-duration:' + (2.3 - f / 100 * 1.6).toFixed(2) + 's;animation-delay:' + (i * .38) + 's" cx="52" cy="' + y + '" r="' + (3 + i % 2) + '" fill="#5aa6b4" opacity="0"/>').join("") : "")
        : '<path d="M110 118 V196" stroke="#8a6f5c" stroke-width="9" stroke-linecap="round"/><path d="M110 150 Q' + (150 + f * .35) + ' ' + (118 + (100 - f) * .3) + ' ' + (196 + f * .8) + ' 150 Q' + (250 + f * .5) + ' ' + (182 - (100 - f) * .22) + ' 330 150" fill="none" stroke="#bd5550" stroke-width="7"/><path class="force-arrow" d="M110 150 H' + (110 + f * .8) + '" stroke="#bd5550" stroke-width="5"/>';
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="group" aria-label="風やゴムの力と車の移動距離のシミュレーション">' +
          '<rect width="640" height="360" fill="#eef8fa"/><text x="28" y="42" class="scene-title">力を大きくすると、車は？</text><text x="30" y="80" class="scene-caption">' + (state.source === "wind" ? "風の強さ" : "ゴムの伸び") + " " + state.force + '%</text><text x="30" y="105" class="tiny-label">車をつかんで左右に動かそう</text>' + arrows +
          '<rect x="52" y="254" width="536" height="32" rx="9" fill="#dde8ea"/><path d="M70 270 H570" stroke="#ffffff" stroke-width="3" stroke-dasharray="16 14" opacity=".8"/>' +
          '<ellipse cx="' + (carX + 36) + '" cy="285" rx="46" ry="5" fill="#33555e" opacity=".16"/>' +
          '<g class="sim-car drag-handle" role="slider" tabindex="0" aria-label="車を左右に動かして力を調整" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + state.force + '"><rect x="' + carX + '" y="230" width="72" height="35" rx="10" fill="#27849b"/><rect x="' + (carX + 40) + '" y="236" width="22" height="14" rx="4" fill="#cfeef5"/>' + wheel(carX + 16) + wheel(carX + 57) + '</g><text x="80" y="320" class="component-label">0cm</text><text x="490" y="320" class="component-label">200cm</text><line class="distance-line" x1="92" y1="305" x2="' + (92 + distance * 2.0) + '" y2="305" stroke="#27849b" stroke-width="6"/>' +
        '</svg>';
    }
    const animator = createSceneAnimator(view.stage, renderScene);
    let draggingCar = false;
    let carGrabOffset = 0;
    const stage = view.stage;
    stage.addEventListener("pointerdown", event => {
      const handle = event.target.closest && event.target.closest(".sim-car");
      if (!handle) return;
      const svg = stage.querySelector("svg");
      const point = svgPoint(svg, event);
      if (!point) return;
      const currentDistance = state.source === "wind" ? state.force * 2 : Math.round(state.force * state.force / 50);
      carGrabOffset = point.x - (92 + currentDistance * 2 + 36);
      draggingCar = true;
      if (stage.setPointerCapture) {
        try { stage.setPointerCapture(event.pointerId); }
        catch (_) { draggingCar = false; return; }
      }
      stage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    stage.addEventListener("pointermove", event => {
      if (!draggingCar) return;
      const svg = stage.querySelector("svg");
      const point = svgPoint(svg, event);
      if (!point) return;
      const carCenter = point.x - carGrabOffset;
      const distance = clamp((carCenter - 92 - 36) / 2, 0, 200);
      state.force = Math.round(state.source === "wind" ? distance / 2 : Math.sqrt(distance * 50));
      force.set(state.force);
      draw();
    });
    const stopDraggingCar = () => {
      if (draggingCar && view.markTried) view.markTried();
      draggingCar = false;
      stage.classList.remove("is-direct-manipulating");
    };
    stage.addEventListener("pointerup", stopDraggingCar);
    stage.addEventListener("pointercancel", stopDraggingCar);
    stage.addEventListener("lostpointercapture", stopDraggingCar);
    stage.addEventListener("keydown", event => {
      if (!event.target.closest || !event.target.closest(".sim-car") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      state.force = clamp(state.force + (event.key === "ArrowRight" ? 5 : -5), 0, 100);
      force.set(state.force);
      if (view.markTried) view.markTried();
      draw();
      const handle = stage.querySelector(".sim-car");
      if (handle) handle.focus();
    });
    return {
      render: draw,
      destroy: () => animator.destroy(),
      reset: () => { state.force = 55; state.source = "wind"; source.set(state.source); force.set(state.force); draw(); },
      stepLabel: "力を変える",
      step: () => { state.force = state.force >= 100 ? 0 : Math.min(100, state.force + 20); force.set(state.force); draw(); }
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
      core.renderReadout(view.readout, {
        metrics: [
          { label: "音を出す物のふるえ", value: vibration + " / 100", detail: state.medium === "rubber" ? "輪ゴム" : "太鼓" },
          { label: "糸で伝わる強さ", value: transmission + " / 100", detail: state.string === "tight" ? "ぴんと張った糸" : "ゆるんだ糸" }
        ],
        message: state.string === "tight" ? "音が大きいほど物のふるえも大きいね。糸をぴんと張ると、そのふるえが伝わりやすいよ。" : "音を出す物は同じようにふるえても、糸がゆるむと相手へ伝わりにくいね。",
        note: "ふるえと糸電話での伝わりやすさは、違いを比べるためのモデル値です。実際の音量や伝わり方を測定した数値ではありません。"
      });
      view.setTrial({ condition: (state.medium === "rubber" ? "輪ゴム" : "太鼓") + "・強さ " + state.strength + "%・糸" + (state.string === "tight" ? "ぴん" : "ゆるい"), result: "元のふるえ " + vibration + "・伝わる強さ " + transmission });
      if (view.setMissionState) view.setMissionState({ medium: state.medium, strength: state.strength, string: state.string, vibration, transmission });
      animator.update({ strength: state.strength });
    }
    // 場面は「表示中の強さ（小数）」で描く。波の大きさがなめらかに変わる。
    function renderScene(disp) {
      const vibration = Math.round(disp.strength);
      const transmission = Math.round(disp.strength * (state.string === "tight" ? 1 : .25));
      const amplitude = disp.strength * .32;
      const rings = disp.strength > 0 ? '<circle class="sound-ring" style="--rdelay:0s" cx="130" cy="175" r="36" fill="none" stroke="#8a64a7" stroke-width="3"/><circle class="sound-ring" style="--rdelay:.85s" cx="130" cy="175" r="36" fill="none" stroke="#8a64a7" stroke-width="3"/>' : "";
      const sourceDrawing = state.medium === "rubber"
        ? '<line x1="110" y1="150" x2="110" y2="200" stroke="#607483" stroke-width="7"/><line x1="151" y1="150" x2="151" y2="200" stroke="#607483" stroke-width="7"/><path d="M110 175 Q130 ' + (175 - amplitude) + ' 151 175 Q130 ' + (175 + amplitude) + ' 110 175" fill="none" stroke="#bd5550" stroke-width="5"/>'
        : '<ellipse cx="130" cy="175" rx="28" ry="38" fill="#d9b58a" stroke="#8f684b" stroke-width="5"/><ellipse cx="130" cy="175" rx="18" ry="28" fill="#f4dfbd" stroke="#8f684b" stroke-width="3"/><path d="M111 175 Q130 ' + (175 - amplitude * .4) + ' 149 175 Q130 ' + (175 + amplitude * .4) + ' 111 175" fill="none" stroke="#b58a62" stroke-width="4"/>';
      const vibe = disp.strength > 0 ? ' class="sound-vibe" style="--vy:' + (disp.strength / 100 * 2.2).toFixed(2) + 'px"' : "";
      const wave = Array.from({ length: 9 }, (_, i) => {
        const x = 166 + i * 36;
        const y = 175 + (i % 2 ? amplitude : -amplitude);
        return (i === 0 ? "M" : " L") + x + " " + y.toFixed(1);
      }).join("");
      const pulses = transmission > 0 ? '<g opacity="' + (0.25 + transmission / 100 * 0.75).toFixed(2) + '">' + [0, 1, 2].map(i => '<circle class="string-pulse" style="animation-delay:' + (i * .45) + 's" cx="172" cy="175" r="' + (3.5 + transmission / 100 * 2) + '" fill="#8a64a7"/>').join("") + '</g>' : "";
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="group" aria-label="音の大きさとふるえのシミュレーション">' +
          '<rect width="640" height="360" fill="#f7f1fb"/><text x="28" y="42" class="scene-title">音が大きいと、ふるえは？</text><text x="30" y="80" class="scene-caption">' + (state.medium === "rubber" ? "輪ゴム" : "太鼓") + "・強さ " + state.strength + '%</text>' +
          '<g class="sound-source drag-handle" role="button" tabindex="0" aria-label="' + (state.medium === "rubber" ? "輪ゴム" : "太鼓") + 'をタップ、または上下にドラッグしてふるえを変える"><rect x="78" y="112" width="108" height="132" fill="#fff" fill-opacity="0.001"/>' + rings + '<g' + vibe + '>' + sourceDrawing + '</g></g><text x="330" y="116" class="tiny-label">音を出す物をタップ／上下にドラッグ</text><path class="sound-wave" d="' + wave + '" fill="none" stroke="#8a64a7" stroke-width="7" stroke-linecap="round"/><line x1="165" y1="175" x2="480" y2="175" stroke="#c7b6d5" stroke-width="2" stroke-dasharray="6 7"/>' + pulses +
          '<circle class="sound-receiver" cx="535" cy="175" r="' + (18 + transmission * .18) + '" fill="#e5c8ee" stroke="#8a64a7" stroke-width="4"/><path class="sound-rings" d="M570 140 Q620 175 570 210 M590 125 Q650 175 590 225" fill="none" stroke="#8a64a7" stroke-width="5" opacity="' + (transmission / 100) + '"/><text x="110" y="280" class="component-label">音を出す物のふるえ：' + vibration + ' / 100</text><text x="405" y="320" class="component-label">糸で伝わる強さ：' + transmission + '</text>' +
        '</svg>';
    }
    const animator = createSceneAnimator(view.stage, renderScene);
    const soundStage = view.stage;
    const pluck = () => {
      state.strength = state.strength >= 100 ? 20 : Math.min(100, state.strength + 20);
      strength.set(state.strength);
      if (view.markTried) view.markTried();
      draw();
    };
    let soundDrag = null;
    let suppressSoundClickUntil = 0;
    soundStage.addEventListener("pointerdown", event => {
      if (!event.target.closest || !event.target.closest(".sound-source")) return;
      const point = svgPoint(soundStage.querySelector("svg"), event);
      if (!point) return;
      soundDrag = { y: point.y, strength: state.strength, moved: false };
      if (soundStage.setPointerCapture) {
        try { soundStage.setPointerCapture(event.pointerId); }
        catch (_) { soundDrag = null; return; }
      }
      soundStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    soundStage.addEventListener("pointermove", event => {
      if (!soundDrag) return;
      const point = svgPoint(soundStage.querySelector("svg"), event);
      if (!point) return;
      const dy = soundDrag.y - point.y;
      if (Math.abs(dy) > 6) soundDrag.moved = true;
      const next = clamp(Math.round(soundDrag.strength + dy * 0.6), 0, 100);
      if (next !== state.strength) {
        state.strength = next;
        strength.set(next);
        draw();
      }
    });
    const stopSoundDrag = () => {
      if (soundDrag && soundDrag.moved) {
        suppressSoundClickUntil = Date.now() + 250;
        if (view.markTried) view.markTried();
      }
      soundDrag = null;
      soundStage.classList.remove("is-direct-manipulating");
    };
    soundStage.addEventListener("pointerup", stopSoundDrag);
    soundStage.addEventListener("pointercancel", stopSoundDrag);
    soundStage.addEventListener("lostpointercapture", stopSoundDrag);
    soundStage.addEventListener("click", event => {
      if (Date.now() < suppressSoundClickUntil) return;
      if (!event.target.closest || !event.target.closest(".sound-source")) return;
      pluck();
    });
    soundStage.addEventListener("keydown", event => {
      if (!event.target.closest || !event.target.closest(".sound-source") || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      pluck();
      const source = soundStage.querySelector(".sound-source");
      if (source) source.focus();
    });
    return {
      render: draw,
      destroy: () => animator.destroy(),
      reset: () => { state.strength = 55; state.medium = "rubber"; state.string = "tight"; medium.set(state.medium); strength.set(state.strength); string.set(state.string); draw(); },
      stepLabel: "音を出す強さを変える",
      step: () => { state.strength = state.strength >= 100 ? 0 : Math.min(100, state.strength + 20); strength.set(state.strength); draw(); }
    };
  }

  function sun(view, core) {
    const state = { time: 12, target: "shadow" };
    const section = core.section(view.panel, "時刻と見るものを変える", "太陽の位置、影の向き、地面の温度を比べよう。");
    const time = core.range(section, { label: "時刻", min: 8, max: 16, value: state.time, format: value => value + "時", onInput: value => { state.time = value; draw(); } });
    const target = core.options(section, { label: "注目するもの", values: [option("shadow", "影"), option("ground", "地面の温度")], value: state.target, format: item => item.label, onChange: value => { state.target = value; draw(); } });
    const TEMP_TABLE = [18, 20, 23, 26, 28, 30, 31, 30, 27];
    function draw() {
      const ratio = (state.time - 8) / 8;
      const height = 70 + Math.sin(Math.PI * ratio) * 150;
      const shadowLength = Math.round(180 - Math.sin(Math.PI * ratio) * 125);
      const temp = TEMP_TABLE[state.time - 8];
      const shadowSide = state.time < 12 ? "西がわ" : state.time > 12 ? "東がわ" : "短い影";
      core.renderReadout(view.readout, {
        metrics: [
          { label: "太陽の高さ", value: Math.round(height) + " / 220", detail: state.time + "時ごろ" },
          { label: state.target === "shadow" ? "影" : "日なたの地面", value: state.target === "shadow" ? shadowSide + "・" + shadowLength + "cm" : temp + "℃", detail: state.target === "shadow" ? "太陽と反対側" : "日光を受けたモデル" }
        ],
        message: state.target === "shadow" ? "太陽の位置が変わると、影の向きと長さも変わるね。影は太陽と反対側にできるよ。" : "日なたの地面は日光であたためられ、正午を過ぎてから最も高くなることがあるね。"
      });
      view.setTrial({ condition: state.time + "時", result: "影 " + shadowLength + "cm・地面 " + temp + "℃" });
      if (view.setMissionState) view.setMissionState({ time: state.time, temp, shadowLength });
      animator.update({ time: state.time });
    }
    function tempAt(t) {
      const x = clamp(t - 8, 0, 8);
      const lo = Math.floor(x);
      const hi = Math.min(8, lo + 1);
      return TEMP_TABLE[lo] + (TEMP_TABLE[hi] - TEMP_TABLE[lo]) * (x - lo);
    }
    const lerp3 = (a, b, k) => Math.round(a + (b - a) * k);
    function skyColor(t) {
      const morning = [255, 226, 166], noon = [255, 247, 232], evening = [255, 199, 140];
      const from = t <= 12 ? morning : noon;
      const to = t <= 12 ? noon : evening;
      const k = t <= 12 ? (t - 8) / 4 : (t - 12) / 4;
      return "rgb(" + lerp3(from[0], to[0], k) + "," + lerp3(from[1], to[1], k) + "," + lerp3(from[2], to[2], k) + ")";
    }
    // 場面は「表示中の時刻（小数）」で描く。太陽・影・温度計がなめらかに動く。
    function renderScene(disp) {
      const t = disp.time;
      const ratio = (t - 8) / 8;
      const sunX = 110 + ratio * 420;
      const height = 70 + Math.sin(Math.PI * ratio) * 150;
      const sunY = 270 - height;
      const shadowLength = 180 - Math.sin(Math.PI * ratio) * 125;
      const shadowDirection = t < 12 ? 1 : -1;
      const shadowEnd = 330 + shadowDirection * shadowLength;
      const shadowSide = t < 11.5 ? "西がわ" : t > 12.5 ? "東がわ" : "短い影";
      const temp = tempAt(t);
      const mercury = clamp((temp - 12) / 22, 0, 1) * 96;
      const rays = Array.from({ length: 8 }, (_, i) => {
        const a = i * Math.PI / 4;
        const x1 = sunX + Math.cos(a) * 37, y1 = sunY + Math.sin(a) * 37;
        const x2 = sunX + Math.cos(a) * 48, y2 = sunY + Math.sin(a) * 48;
        return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="#f0b93e" stroke-width="5" stroke-linecap="round"/>';
      }).join("");
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="group" aria-label="太陽の位置と影のシミュレーション">' +
          '<rect width="640" height="360" fill="' + skyColor(t) + '"/><rect y="280" width="640" height="80" fill="#d6c38d"/>' +
          '<g class="cloud-drift"><ellipse cx="452" cy="52" rx="40" ry="14" fill="#ffffff" opacity=".88"/><ellipse cx="478" cy="44" rx="26" ry="11" fill="#ffffff" opacity=".88"/></g>' +
          '<g class="moving-sun drag-handle" role="slider" tabindex="0" aria-label="太陽を左右に動かして時刻を調整" aria-valuemin="8" aria-valuemax="16" aria-valuenow="' + state.time + '"><circle cx="' + sunX + '" cy="' + sunY + '" r="42" fill="#f5c84d" opacity=".25"/>' + rays + '<circle cx="' + sunX + '" cy="' + sunY + '" r="28" fill="#f5c84d"/></g>' +
          '<text x="28" y="42" class="scene-title">太陽の位置が変わると、影は？</text><text x="30" y="80" class="scene-caption">' + state.time + "時ごろ・" + (state.target === "shadow" ? "影に注目" : "地面の温度に注目") + '</text><text x="72" y="118" class="component-label">東</text><text x="548" y="118" class="component-label">西</text>' +
          '<text x="190" y="346" class="tiny-label">太陽を左右に動かそう</text><rect x="322" y="180" width="16" height="100" fill="#806d51"/><ellipse cx="330" cy="282" rx="30" ry="4.5" fill="#22331f" opacity=".12"/><path class="moving-shadow" d="M330 280 L' + shadowEnd.toFixed(1) + ' 280 L' + (shadowEnd - shadowDirection * 10).toFixed(1) + ' 270 Z" fill="#8e836d" opacity=".75"/>' +
          '<g><text x="586" y="148" text-anchor="middle" class="tiny-label">温度計</text><rect x="580" y="156" width="13" height="114" rx="6.5" fill="#ffffff" stroke="#b08968" stroke-width="2.5"/><rect x="583.5" y="' + (270 - mercury).toFixed(1) + '" width="6" height="' + mercury.toFixed(1) + '" fill="#e2574c"/><circle cx="586.5" cy="282" r="12" fill="#e2574c" stroke="#b08968" stroke-width="2.5"/><path d="M593 176 h7 M593 206 h7 M593 236 h7" stroke="#b08968" stroke-width="2"/></g>' +
          '<text x="105" y="320" class="component-label">影：' + shadowSide + '・' + Math.round(shadowLength) + 'cm</text><text x="400" y="320" class="component-label">日なたの地面 ' + Math.round(temp) + '℃</text>' +
        '</svg>';
    }
    const animator = createSceneAnimator(view.stage, renderScene);
    let draggingSun = false;
    let sunGrabOffset = 0;
    const sunStage = view.stage;
    sunStage.addEventListener("pointerdown", event => {
      const handle = event.target.closest && event.target.closest(".moving-sun");
      if (!handle) return;
      const point = svgPoint(sunStage.querySelector("svg"), event);
      if (!point) return;
      const sunX = 110 + ((state.time - 8) / 8) * 420;
      sunGrabOffset = point.x - sunX;
      draggingSun = true;
      if (sunStage.setPointerCapture) {
        try { sunStage.setPointerCapture(event.pointerId); }
        catch (_) { draggingSun = false; return; }
      }
      sunStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    sunStage.addEventListener("pointermove", event => {
      if (!draggingSun) return;
      const point = svgPoint(sunStage.querySelector("svg"), event);
      if (!point) return;
      const sunX = point.x - sunGrabOffset;
      state.time = Math.round(clamp(8 + ((sunX - 110) / 420) * 8, 8, 16));
      time.set(state.time);
      draw();
    });
    const stopDraggingSun = () => {
      if (draggingSun && view.markTried) view.markTried();
      draggingSun = false;
      sunStage.classList.remove("is-direct-manipulating");
    };
    sunStage.addEventListener("pointerup", stopDraggingSun);
    sunStage.addEventListener("pointercancel", stopDraggingSun);
    sunStage.addEventListener("lostpointercapture", stopDraggingSun);
    sunStage.addEventListener("keydown", event => {
      if (!event.target.closest || !event.target.closest(".moving-sun") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      state.time = clamp(state.time + (event.key === "ArrowRight" ? 1 : -1), 8, 16);
      time.set(state.time);
      if (view.markTried) view.markTried();
      draw();
      const handle = sunStage.querySelector(".moving-sun");
      if (handle) handle.focus();
    });
    return {
      render: draw,
      destroy: () => animator.destroy(),
      reset: () => { state.time = 12; state.target = "shadow"; time.set(state.time); target.set(state.target); draw(); },
      stepLabel: "時刻を1時間進める",
      step: () => { state.time = state.time >= 16 ? 8 : state.time + 1; time.set(state.time); draw(); }
    };
  }

  function light(view, core) {
    const state = { angle: 180, mirrors: 1 };
    const section = core.section(view.panel, "反射の条件を変える", "黄色い線をたどって、光が鏡ではね返る道すじを見よう。");
    const angle = core.range(section, { label: "壁で光が届く高さ", min: 100, max: 270, value: state.angle, format: value => value < 145 ? "上" : value > 215 ? "下" : "中央", onInput: value => { state.angle = value; draw(); } });
    const mirrors = core.options(section, { label: "同じ場所へ向ける鏡", values: [option("1", "1枚"), option("2", "2枚"), option("3", "3枚")], value: String(state.mirrors), format: item => item.label, onChange: value => { state.mirrors = Number(value); draw(); } });
    function draw() {
      const sourceX = 131, sourceY = 224, mirrorX = 282, wallX = 570;
      const targetY = state.angle;
      const targetZone = targetY < 145 ? "上" : targetY > 215 ? "下" : "中央";
      const mirrorYs = state.mirrors === 1 ? [188] : state.mirrors === 2 ? [158, 218] : [132, 188, 244];
      const brightness = 32 + state.mirrors * 22;
      const paths = mirrorYs.map((my, index) => {
        const inX = mirrorX - sourceX, inY = my - sourceY;
        const inLength = Math.hypot(inX, inY) || 1;
        const dX = inX / inLength, dY = inY / inLength;
        const outX = wallX - mirrorX, outY = targetY - my;
        const outLength = Math.hypot(outX, outY) || 1;
        const rX = outX / outLength, rY = outY / outLength;
        let nX = -dX + rX, nY = -dY + rY;
        const nLength = Math.hypot(nX, nY) || 1;
        nX /= nLength; nY /= nLength;
        const tX = -nY, tY = nX;
        const half = 32;
        const x1 = mirrorX - tX * half, y1 = my - tY * half;
        const x2 = mirrorX + tX * half, y2 = my + tY * half;
        const normal = index === 0 ? '<line x1="' + (mirrorX - nX * 46) + '" y1="' + (my - nY * 46) + '" x2="' + (mirrorX + nX * 46) + '" y2="' + (my + nY * 46) + '" stroke="#74888d" stroke-width="2" stroke-dasharray="5 5"/><text x="' + (mirrorX + nX * 50 - 18) + '" y="' + (my + nY * 50 - 5) + '" class="tiny-label">鏡に直角</text>' : "";
        const photon = (x1, y1, x2, y2, begin) => '<circle r="3.6" fill="#fff3ae" stroke="#d99a16" stroke-width="1" pointer-events="none"><animateMotion dur="0.85s" begin="' + begin + 's" repeatCount="indefinite" path="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '"/></circle>';
        const sparkle = '<g transform="translate(' + mirrorX + ' ' + my + ')"><path class="mirror-spark" style="animation-delay:' + (index * .3) + 's" d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3Z" fill="#fff6bf"/></g>';
        return '<g><line class="light-ray" style="--ray-delay:' + (index * .07) + 's" x1="' + sourceX + '" y1="' + sourceY + '" x2="' + (mirrorX - dX * 7) + '" y2="' + (my - dY * 7) + '" stroke="#f0b72f" stroke-width="6" marker-end="url(#rayArrow)"/><line class="light-ray" style="--ray-delay:' + ((index + 1) * .07) + 's" x1="' + (mirrorX + rX * 7) + '" y1="' + (my + rY * 7) + '" x2="' + (wallX - 12) + '" y2="' + (targetY - rY * 3) + '" stroke="#f5c94b" stroke-width="6" marker-end="url(#rayArrow)"/>' + normal + '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#607b83" stroke-width="13" stroke-linecap="round"/><line x1="' + (x1 + nX * 4) + '" y1="' + (y1 + nY * 4) + '" x2="' + (x2 + nX * 4) + '" y2="' + (y2 + nY * 4) + '" stroke="#d8eef2" stroke-width="7" stroke-linecap="round"/><circle cx="' + mirrorX + '" cy="' + my + '" r="5" fill="#fff"/>' +
          photon(sourceX, sourceY, mirrorX - dX * 7, my - dY * 7, -0.12 - index * 0.21) + photon(sourceX, sourceY, mirrorX - dX * 7, my - dY * 7, -0.55 - index * 0.21) +
          photon(mirrorX + rX * 7, my + rY * 7, wallX - 12, targetY - rY * 3, -0.33 - index * 0.21) + photon(mirrorX + rX * 7, my + rY * 7, wallX - 12, targetY - rY * 3, -0.76 - index * 0.21) + sparkle + '</g>';
      }).join("");
      const rings = Array.from({ length: state.mirrors }, (_, i) => '<circle cx="' + wallX + '" cy="' + targetY + '" r="' + (17 + i * 8) + '" fill="none" stroke="#f7d75a" stroke-width="4" opacity="' + (.7 - i * .16) + '"/>').join("");
      view.stage.innerHTML =
        '<svg class="extra-svg light-lab-svg" viewBox="0 0 640 360" role="group" aria-label="懐中電灯の光が鏡ではね返り壁へ届く道すじ">' +
          '<defs><marker id="rayArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="#d99a16"/></marker><radialGradient id="lightSpot"><stop offset="0" stop-color="#fff9ba" stop-opacity="1"/><stop offset=".55" stop-color="#f8dc60" stop-opacity=".8"/><stop offset="1" stop-color="#f8dc60" stop-opacity="0"/></radialGradient><linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf2"/><stop offset="1" stop-color="#fdf0cd"/></linearGradient></defs>' +
          '<rect width="640" height="360" fill="url(#wallGrad)"/><rect y="292" width="640" height="68" fill="#e9dcc0" opacity=".45"/><text x="28" y="38" class="scene-title">光の道すじを線でたどろう</text><text x="30" y="72" class="scene-caption">鏡 ' + state.mirrors + '枚 → 壁の' + targetZone + 'に届く</text>' +
          '<text x="30" y="100" class="tiny-label">壁の光を上下に動かそう</text><rect x="564" y="82" width="24" height="210" rx="6" fill="#e8e0cf" stroke="#9c8f79" stroke-width="3"/><path d="M590 82 V292" stroke="#c9bda6" stroke-width="2"/>' +
          '<g transform="translate(45 200)"><rect width="58" height="48" rx="12" fill="#486a75"/><path d="M57 8 L86 15 V33 L57 40Z" fill="#79939b"/><circle cx="18" cy="24" r="7" fill="#d5eef2"/></g>' +
          paths + '<g class="light-target drag-handle" role="slider" tabindex="0" aria-label="壁の光を上下に動かして高さを調整" aria-valuemin="100" aria-valuemax="270" aria-valuenow="' + state.angle + '"><circle class="light-spot" cx="' + wallX + '" cy="' + targetY + '" r="' + (25 + state.mirrors * 5) + '" fill="url(#lightSpot)"/>' + rings + '</g>' +
          '<g class="diagram-key"><rect x="32" y="300" width="576" height="42" rx="12" fill="#fff" opacity=".93"/><text x="50" y="326" class="component-label">① 光を出す</text><text x="185" y="326" class="component-label">② 鏡に当たる</text><text x="335" y="326" class="component-label">③ はね返る</text><text x="475" y="326" class="component-label">④ 壁に届く</text></g>' +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "光が届く場所", value: "壁の" + targetZone, detail: "鏡の向きを変えると上下に動く" },
          { label: "光の重なり", value: state.mirrors + "本", detail: "同じ場所で明るさ " + brightness + " / 100" }
        ],
        message: "光はまっすぐ進み、鏡に当たるとはね返ります。それぞれの鏡の向きが変わると、光が届く高さも変わります。",
        note: "鏡の枚数は明るさを比べるためのモデルです。光の強さは実測値ではありません。"
      });
      view.setTrial({ condition: "鏡 " + state.mirrors + "枚・壁の高さ " + targetZone, result: "明るさ " + brightness + " / 100" });
      if (view.setMissionState) view.setMissionState({ angle: state.angle, mirrors: state.mirrors, zone: targetZone });
    }
    let draggingLightTarget = false;
    let lightGrabOffsetY = 0;
    const lightStage = view.stage;
    lightStage.addEventListener("pointerdown", event => {
      const handle = event.target.closest && event.target.closest(".light-target");
      if (!handle) return;
      const point = svgPoint(lightStage.querySelector("svg"), event);
      if (!point) return;
      lightGrabOffsetY = point.y - state.angle;
      draggingLightTarget = true;
      if (lightStage.setPointerCapture) {
        try { lightStage.setPointerCapture(event.pointerId); }
        catch (_) { draggingLightTarget = false; return; }
      }
      lightStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    lightStage.addEventListener("pointermove", event => {
      if (!draggingLightTarget) return;
      const point = svgPoint(lightStage.querySelector("svg"), event);
      if (!point) return;
      state.angle = Math.round(clamp(point.y - lightGrabOffsetY, 100, 270));
      angle.set(state.angle);
      draw();
    });
    const stopDraggingLightTarget = () => {
      if (draggingLightTarget && view.markTried) view.markTried();
      draggingLightTarget = false;
      lightStage.classList.remove("is-direct-manipulating");
    };
    lightStage.addEventListener("pointerup", stopDraggingLightTarget);
    lightStage.addEventListener("pointercancel", stopDraggingLightTarget);
    lightStage.addEventListener("lostpointercapture", stopDraggingLightTarget);
    lightStage.addEventListener("keydown", event => {
      if (!event.target.closest || !event.target.closest(".light-target") || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      state.angle = clamp(state.angle + (event.key === "ArrowDown" ? 5 : -5), 100, 270);
      angle.set(state.angle);
      if (view.markTried) view.markTried();
      draw();
      const handle = lightStage.querySelector(".light-target");
      if (handle) handle.focus();
    });
    return {
      render: draw,
      reset: () => { state.angle = 180; state.mirrors = 1; angle.set(state.angle); mirrors.set(String(state.mirrors)); draw(); },
      stepLabel: "光が届く高さを変える",
      step: () => { state.angle = state.angle >= 270 ? 100 : Math.min(270, state.angle + 45); angle.set(state.angle); draw(); }
    };
  }

  function electricity(view, core) {
    const state = { material: "copper", closed: "closed" };
    const materials = { copper: { label:"銅", color:"#c98b55", conducts:true }, iron: { label:"鉄", color:"#a2abb0", conducts:true }, aluminum: { label:"アルミ", color:"#c8d0d3", conducts:true }, plastic: { label:"プラスチック", color:"#d4a6a0", conducts:false }, rubber: { label:"ゴム", color:"#59656a", conducts:false }, wood: { label:"木", color:"#b88d57", conducts:false } };
    const section = core.section(view.panel, "回路の条件を変える", "線を一周たどり、切れ目がないか確かめよう。");
    const material = core.options(section, { label: "回路の途中", values: Object.entries(materials).map(([id, item]) => option(id, item.label)), value: state.material, format: item => item.label, onChange: value => { state.material = value; draw(); } });
    const closed = core.options(section, { label: "スイッチ", values: [option("closed", "つなぐ"), option("open", "切る")], value: state.closed, format: item => item.label, onChange: value => { state.closed = value; draw(); } });
    function draw() {
      const tested = materials[state.material];
      const lit = state.closed === "closed" && tested.conducts;
      const wireColor = lit ? "#d59620" : "#718a91";
      const wireSegments =
        '<path d="M105 245 V115 H190" fill="none" stroke="' + wireColor + '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M270 115 H505 V146" fill="none" stroke="' + wireColor + '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M505 214 V274 H360" fill="none" stroke="' + wireColor + '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M300 274 H145" fill="none" stroke="' + wireColor + '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>';
      const switchPart = state.closed === "closed" ? '<line x1="300" y1="274" x2="360" y2="274" stroke="' + wireColor + '" stroke-width="8" stroke-linecap="round"/>' : '<line x1="300" y1="274" x2="344" y2="244" stroke="#718a91" stroke-width="8" stroke-linecap="round"/>';
      const flowMarks = lit ? Array.from({ length: 6 }, (_, i) => '<circle r="5.5" fill="#ffd94d" stroke="#c9861d" stroke-width="1.5" pointer-events="none"><animateMotion dur="3s" begin="' + (-i * 0.5) + 's" repeatCount="indefinite" path="M105 274 V115 H505 V274 Z"/></circle>').join("") : "";
      view.stage.innerHTML =
        '<svg class="extra-svg circuit-diagram" viewBox="0 0 640 360" role="group" aria-label="乾電池、調べる物、豆電球、スイッチが一つの輪につながった回路">' +
          '<defs><radialGradient id="bulbLight"><stop offset="0" stop-color="#fff8a6" stop-opacity=".95"/><stop offset="1" stop-color="#f7d75a" stop-opacity="0"/></radialGradient></defs><rect width="640" height="360" fill="#fffaf0"/><rect y="316" width="640" height="44" fill="#f0dfC0" opacity=".55"/><text x="28" y="38" class="scene-title">電気の通り道を一周たどろう</text><text x="30" y="74" class="scene-caption">' + (lit ? "切れ目のない一つの輪 → 豆電球がつく" : state.closed === "open" ? "スイッチに切れ目がある" : tested.label + "は電気を通さない") + '</text>' +
          wireSegments +
          '<g><circle cx="190" cy="115" r="10" fill="#d9e1df" stroke="#60777d" stroke-width="3"/><circle cx="270" cy="115" r="10" fill="#d9e1df" stroke="#60777d" stroke-width="3"/><rect x="190" y="94" width="80" height="42" rx="8" fill="' + tested.color + '" stroke="#6e7776" stroke-width="3"/><text x="205" y="121" class="component-label">' + tested.label + '</text><text x="180" y="157" class="tiny-label">調べる物</text></g>' +
          '<g><rect x="85" y="225" width="60" height="74" rx="8" fill="#f0d36c" stroke="#8d7225" stroke-width="3"/><line x1="96" y1="245" x2="134" y2="245" stroke="#705b1d" stroke-width="5"/><line x1="103" y1="274" x2="127" y2="274" stroke="#705b1d" stroke-width="3"/><text x="74" y="322" class="component-label">乾電池 ＋／−</text></g>' +
          '<g><circle cx="505" cy="180" r="34" fill="' + (lit ? "#fff4a4" : "#eef0e9") + '" stroke="#7e7468" stroke-width="5"/><path d="M487 184 Q505 153 523 184 M493 188 H517" fill="none" stroke="' + (lit ? "#d88917" : "#999") + '" stroke-width="4"/><rect x="488" y="212" width="34" height="24" rx="4" fill="#9a9c96"/>' + (lit ? '<circle class="bulb-glow" cx="505" cy="180" r="64" fill="url(#bulbLight)"/>' : "") + '<text x="468" y="259" class="component-label">豆電球</text></g>' +
          '<g class="circuit-switch drag-handle" role="switch" tabindex="0" aria-label="回路のスイッチを切り替える" aria-checked="' + (state.closed === "closed") + '"><rect x="286" y="236" width="168" height="96" fill="#fff" fill-opacity="0.001"/><circle cx="300" cy="274" r="9" fill="#d9e1df" stroke="#60777d" stroke-width="3"/><circle cx="360" cy="274" r="9" fill="#d9e1df" stroke="#60777d" stroke-width="3"/>' + switchPart + '<text x="300" y="318" class="component-label">スイッチ：' + (state.closed === "closed" ? "つながる" : "切れ目") + '</text></g>' + '<text x="215" y="348" class="tiny-label">スイッチをタップ、または左右にドラッグ</text>' + flowMarks +
        '</svg>';
      core.renderReadout(view.readout, {
        metrics: [
          { label: "通り道", value: state.closed === "closed" ? "スイッチはつながる" : "スイッチに切れ目", detail: "乾電池から一周たどる" },
          { label: tested.label, value: tested.conducts ? "電気を通す" : "電気を通さない", detail: lit ? "豆電球がつく" : "豆電球はつかない" }
        ],
        message: lit ? "切れ目のない一つの輪になり、途中の物も電気を通すので、豆電球がつきます。" : "青灰色の線を一周たどって、切れ目か、電気を通さない物を見つけよう。"
      });
      view.setTrial({ condition: (state.closed === "closed" ? "スイッチをつなぐ" : "スイッチを切る") + "・" + tested.label, result: lit ? "豆電球がつく" : "豆電球はつかない" });
      if (view.setMissionState) view.setMissionState({ material: state.material, closed: state.closed, lit, conducts: tested.conducts });
    }
    const circuitStage = view.stage;
    const toggleSwitch = () => {
      state.closed = state.closed === "closed" ? "open" : "closed";
      closed.set(state.closed);
      if (view.markTried) view.markTried();
      draw();
    };
    const setSwitch = next => {
      if (state.closed === next) return;
      state.closed = next;
      closed.set(state.closed);
      draw();
    };
    let switchDrag = null;
    let suppressSwitchClickUntil = 0;
    circuitStage.addEventListener("pointerdown", event => {
      if (!event.target.closest || !event.target.closest(".circuit-switch")) return;
      const point = svgPoint(circuitStage.querySelector("svg"), event);
      if (!point) return;
      switchDrag = { x: point.x, moved: false };
      if (circuitStage.setPointerCapture) {
        try { circuitStage.setPointerCapture(event.pointerId); }
        catch (_) { switchDrag = null; return; }
      }
      circuitStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    circuitStage.addEventListener("pointermove", event => {
      if (!switchDrag) return;
      const point = svgPoint(circuitStage.querySelector("svg"), event);
      if (!point) return;
      const dx = point.x - switchDrag.x;
      if (Math.abs(dx) > 10) switchDrag.moved = true;
      if (dx >= 40) { setSwitch("closed"); switchDrag.x = point.x; }
      else if (dx <= -40) { setSwitch("open"); switchDrag.x = point.x; }
    });
    const stopSwitchDrag = () => {
      if (switchDrag && switchDrag.moved) {
        suppressSwitchClickUntil = Date.now() + 250;
        if (view.markTried) view.markTried();
      }
      switchDrag = null;
      circuitStage.classList.remove("is-direct-manipulating");
    };
    circuitStage.addEventListener("pointerup", stopSwitchDrag);
    circuitStage.addEventListener("pointercancel", stopSwitchDrag);
    circuitStage.addEventListener("lostpointercapture", stopSwitchDrag);
    circuitStage.addEventListener("click", event => {
      if (Date.now() < suppressSwitchClickUntil) return;
      if (!event.target.closest || !event.target.closest(".circuit-switch")) return;
      toggleSwitch();
    });
    circuitStage.addEventListener("keydown", event => {
      if (!event.target.closest || !event.target.closest(".circuit-switch") || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      toggleSwitch();
      const handle = circuitStage.querySelector(".circuit-switch");
      if (handle) handle.focus();
    });
    return {
      render: draw,
      reset: () => { state.material = "copper"; state.closed = "closed"; material.set(state.material); closed.set(state.closed); draw(); },
      stepLabel: "スイッチを切り替える",
      step: () => { state.closed = state.closed === "closed" ? "open" : "closed"; closed.set(state.closed); draw(); }
    };
  }

  function magnets(view, core) {
    // poleA / poleB は「相手に向いている側の極」。turnsA / turnsB は棒磁石の半回転の回数で、
    // 偶数・奇数が pole と対応する（左: 偶数=N極むき、右: 偶数=N極むき）。表示だけを補間して反転をなめらかに見せる。
    const state = { poleA: "N", poleB: "S", turnsA: 0, turnsB: 1, distance: 50, material: "iron" };
    const section = core.section(view.panel, "磁石の条件を変える", "磁石はタップでも ひっくり返せるよ。極の組み合わせと材料を変えて、動きを比べよう。");
    const poleA = core.options(section, { label: "左の棒磁石の極", values: [option("N", "N極"), option("S", "S極")], value: state.poleA, format: item => item.label, onChange: value => setPole("A", value) });
    const poleB = core.options(section, { label: "右の棒磁石の極", values: [option("N", "N極"), option("S", "S極")], value: state.poleB, format: item => item.label, onChange: value => setPole("B", value) });
    const material = core.options(section, { label: "近づける物", values: [option("iron", "鉄"), option("aluminum", "アルミ")], value: state.material, format: item => item.label, onChange: value => { state.material = value; draw(); } });
    const distance = core.range(section, { label: "距離", min: 20, max: 100, value: state.distance, format: value => value + "cm", onInput: value => { state.distance = value; draw(); } });
    function setPole(which, value) {
      const key = which === "A" ? "poleA" : "poleB";
      if (state[key] !== value) {
        state[key] = value;
        if (which === "A") state.turnsA += 1; else state.turnsB += 1;
      }
      draw();
    }
    function flipMagnet(which) {
      if (which === "A") { state.poleA = state.poleA === "N" ? "S" : "N"; state.turnsA += 1; poleA.set(state.poleA); }
      else { state.poleB = state.poleB === "N" ? "S" : "N"; state.turnsB += 1; poleB.set(state.poleB); }
      if (view.markTried) view.markTried();
      draw();
    }
    function draw(snap) {
      const opposite = state.poleA !== state.poleB;
      const force = Math.round(clamp(100 * Math.pow(20 / state.distance, 2), 0, 100));
      core.renderReadout(view.readout, {
        metrics: [
          { label: "極の関係", value: opposite ? "引き合う" : "しりぞけ合う", detail: "同じ極／違う極" },
          { label: "鉄への力（モデル）", value: state.material === "iron" ? force + " / 100" : "ほぼ 0", detail: state.distance + "cmのモデル" }
        ],
        message: state.material === "iron" ? "鉄は磁石に引き付けられるね。距離が遠くなるほど引き付ける力が弱くなるモデルで比べよう。" : "金属でもアルミは磁石につかないね。材料を変えて比べてみよう。",
        note: "引き付ける力は距離による変化を比べるためのモデル値です。実物の磁石の力を測定した数値ではありません。"
      });
      view.setTrial({ condition: state.poleA + "極と" + state.poleB + "極・距離 " + state.distance + "cm・" + (state.material === "iron" ? "鉄" : "アルミ"), result: (opposite ? "引き合う" : "しりぞけ合う") + "・引き付け " + (state.material === "iron" ? force : 0) + " / 100" });
      if (view.setMissionState) view.setMissionState({ poleA: state.poleA, poleB: state.poleB, opposite, distance: state.distance, material: state.material, force });
      animator.update({ distance: state.distance, gather: state.material === "iron" ? clamp(force / 100, 0, 1) : 0, flipA: state.turnsA, flipB: state.turnsB }, snap === true);
    }
    const CLIP_HOMES = [[150, 306, -24], [225, 322, 18], [300, 308, -8], [368, 324, 26], [438, 306, -18], [492, 320, 10]];
    const SAND_HOMES = [[120, 332], [190, 296], [262, 334], [330, 298], [402, 332], [470, 296], [520, 328], [215, 338]];
    // 棒磁石を描く部品。leftPole は「反転していないとき（sx=+1）に左半分へ描く極」。
    // 反転は scaleX の補間（表示値 flip のコサイン）で表し、文字は逆向きに縮めて読みやすく保つ。
    // 左の磁石は左半分が S・右半分が N、右の磁石は左半分が N・右半分が S を素の向きとする。
    function barMagnet(cx, flip, leftPole, clipId) {
      let sx = Math.cos(Math.PI * flip);
      if (Math.abs(sx) < 0.02) sx = sx < 0 ? -0.02 : 0.02;
      const csx = sx < 0 ? -1 : 1;
      const color = pole => pole === "N" ? "#db6d67" : "#668bc0";
      const rightPole = leftPole === "N" ? "S" : "N";
      return '<g transform="translate(' + cx.toFixed(1) + ' 134) scale(' + sx.toFixed(3) + ' 1)">' +
        '<clipPath id="' + clipId + '"><rect x="-85" y="-24" width="170" height="48" rx="12"/></clipPath>' +
        '<g clip-path="url(#' + clipId + ')">' +
          '<rect x="-85" y="-24" width="85" height="48" fill="' + color(leftPole) + '"/>' +
          '<rect x="0" y="-24" width="85" height="48" fill="' + color(rightPole) + '"/>' +
          '<rect x="-85" y="-24" width="170" height="15" fill="#ffffff" opacity=".16"/>' +
        '</g>' +
        '<rect x="-85" y="-24" width="170" height="48" rx="12" fill="none" stroke="rgba(90,40,35,.35)" stroke-width="2"/>' +
        '<line x1="0" y1="-24" x2="0" y2="24" stroke="rgba(255,255,255,.5)" stroke-width="2"/>' +
        '<text transform="translate(-42.5 9) scale(' + csx + ' 1)" text-anchor="middle" fill="#fff" font-size="27" font-weight="900">' + leftPole + '</text>' +
        '<text transform="translate(42.5 9) scale(' + csx + ' 1)" text-anchor="middle" fill="#fff" font-size="27" font-weight="900">' + rightPole + '</text>' +
      '</g>';
    }
    // 場面は「表示中の距離・集まり具合（小数）」で描く。クリップと砂鉄が磁石へ寄っていく。
    function renderScene(disp) {
      const opposite = state.poleA !== state.poleB;
      const rightX = 295 + disp.distance * 1.15;
      const arrow = opposite ? '<path d="M280 135 H' + (rightX - 18) + '" stroke="#bd5550" stroke-width="7" marker-end="url(#arrow)"/>' : '<path d="M280 135 H245 M' + (rightX - 18) + ' 135 H' + (rightX + 18) + '" stroke="#607483" stroke-width="7"/>';
      const midX = (280 + rightX) / 2;
      const g = disp.gather;
      const clips = CLIP_HOMES.map((home, i) => {
        const gx = midX + (i - 2.5) * 15;
        const gy = 198 + (i % 2) * 11;
        const x = home[0] + (gx - home[0]) * g;
        const y = home[1] + (gy - home[1]) * g;
        const rot = home[2] + ((i % 2 ? 18 : -14) - home[2]) * g;
        return '<g transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(1) + ')"><rect x="-9" y="-3.5" width="18" height="7" rx="3.5" fill="#ccd1d6" stroke="#79828a" stroke-width="1.6"/><rect x="-4" y="-3.5" width="8" height="7" rx="3" fill="none" stroke="#79828a" stroke-width="1.4"/></g>';
      }).join("");
      const sand = SAND_HOMES.map((home, i) => {
        const gx = midX + (i - 3.5) * 11;
        const gy = 218 + (i % 3) * 6;
        const x = home[0] + (gx - home[0]) * g;
        const y = home[1] + (gy - home[1]) * g;
        return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.3" fill="#707880"/>';
      }).join("");
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="group" aria-label="磁石の極と材料による動きのシミュレーション">' +
          '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#bd5550"/></marker></defs><rect width="640" height="360" fill="#fff1f0"/><rect y="288" width="640" height="72" fill="#f6ddda" opacity=".6"/><text x="28" y="42" class="scene-title">磁石を近づけると、どう動く？</text><text x="30" y="80" class="scene-caption">' + state.poleA + "極と" + state.poleB + "極・距離 " + state.distance + 'cm</text><text x="30" y="200" class="tiny-label">右の磁石をつかんで 左右へ うごかせるよ</text><text x="30" y="224" class="tiny-label">磁石をタップすると ひっくり返るよ</text>' +
          '<ellipse cx="195" cy="166" rx="92" ry="5" fill="#22331f" opacity=".1"/><ellipse cx="' + (rightX + 85) + '" cy="166" rx="92" ry="5" fill="#22331f" opacity=".1"/>' +
          '<g class="magnet-left bar-magnet ' + (opposite ? "attract" : "repel") + '" tabindex="0" role="button" aria-label="左の棒磁石。タップでひっくり返して、むきを変える">' + barMagnet(195, disp.flipA || 0, "S", "barClipA") + '</g><g class="magnet-right drag-handle bar-magnet ' + (opposite ? "attract" : "repel") + '" role="slider" tabindex="0" aria-label="右の棒磁石。左右に動かして距離を調整。タップでひっくり返して、むきを変える" aria-valuemin="20" aria-valuemax="100" aria-valuenow="' + state.distance + '">' + barMagnet(rightX + 85, disp.flipB || 0, "N", "barClipB") + '</g>' + arrow +
          '<g pointer-events="none">' + clips + sand + '</g>' +
          '<circle class="magnet-test-object ' + (state.material === "iron" ? "sticks" : "") + '" cx="320" cy="250" r="28" fill="' + (state.material === "iron" ? "#a2abb0" : "#d3c2a0") + '" stroke="#6f7779" stroke-width="4"/><text x="358" y="258" class="component-label">' + (state.material === "iron" ? "鉄" : "アルミ") + "：" + (state.material === "iron" ? "つく" : "つかない") + '</text>' +
        '</svg>';
    }
    const animator = createSceneAnimator(view.stage, renderScene);
    let draggingMagnet = false;
    let magnetGrabOffset = 0;
    const magnetStage = view.stage;
    magnetStage.addEventListener("pointerdown", event => {
      const handle = event.target.closest && event.target.closest(".magnet-right");
      if (!handle) return;
      const svg = magnetStage.querySelector("svg");
      const point = svgPoint(svg, event);
      if (!point) return;
      magnetGrabOffset = point.x - (380 + state.distance * 1.15);
      draggingMagnet = true;
      if (magnetStage.setPointerCapture) {
        try { magnetStage.setPointerCapture(event.pointerId); }
        catch (_) { draggingMagnet = false; return; }
      }
      magnetStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    magnetStage.addEventListener("pointermove", event => {
      if (!draggingMagnet) return;
      const svg = magnetStage.querySelector("svg");
      const point = svgPoint(svg, event);
      if (!point) return;
      const magnetCenter = point.x - magnetGrabOffset;
      state.distance = Math.round(clamp((magnetCenter - 380) / 1.15, 20, 100));
      distance.set(state.distance);
      draw();
    });
    const stopDraggingMagnet = () => {
      if (draggingMagnet && view.markTried) view.markTried();
      draggingMagnet = false;
      magnetStage.classList.remove("is-direct-manipulating");
    };
    magnetStage.addEventListener("pointerup", stopDraggingMagnet);
    magnetStage.addEventListener("pointercancel", stopDraggingMagnet);
    magnetStage.addEventListener("lostpointercapture", stopDraggingMagnet);
    // タップ（ほぼ動かさずに離す）で棒磁石をひっくり返す。ドラッグと区別するため移動量で判定する。
    let tapInfo = null;
    magnetStage.addEventListener("pointerdown", event => {
      const onLeft = event.target.closest && event.target.closest(".magnet-left");
      const onRight = event.target.closest && event.target.closest(".magnet-right");
      const svg = magnetStage.querySelector("svg");
      const point = svgPoint(svg, event);
      tapInfo = point ? { x: point.x, y: point.y, which: onLeft ? "A" : onRight ? "B" : null, distance: state.distance } : null;
    });
    magnetStage.addEventListener("pointerup", event => {
      const info = tapInfo;
      tapInfo = null;
      if (!info || !info.which) return;
      const svg = magnetStage.querySelector("svg");
      const point = svgPoint(svg, event);
      if (!point) return;
      if (Math.hypot(point.x - info.x, point.y - info.y) > 6) return;
      // タップと判定したら、ドラッグ扱いでずれた距離を元に戻してから反転する。
      if (info.which === "B" && state.distance !== info.distance) { state.distance = info.distance; distance.set(state.distance); }
      flipMagnet(info.which);
    });
    magnetStage.addEventListener("pointercancel", () => { tapInfo = null; });
    magnetStage.addEventListener("keydown", event => {
      if (!event.target.closest) return;
      const onLeft = event.target.closest(".magnet-left");
      const onRight = event.target.closest(".magnet-right");
      if (!onLeft && !onRight) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        flipMagnet(onLeft ? "A" : "B");
        const flipped = magnetStage.querySelector(onLeft ? ".magnet-left" : ".magnet-right");
        if (flipped) flipped.focus();
        return;
      }
      if (!onRight || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      state.distance = clamp(state.distance + (event.key === "ArrowRight" ? 5 : -5), 20, 100);
      distance.set(state.distance);
      if (view.markTried) view.markTried();
      draw();
      const handle = magnetStage.querySelector(".magnet-right");
      if (handle) handle.focus();
    });
    return {
      render: () => draw(),
      destroy: () => animator.destroy(),
      reset: () => { state.poleA = "N"; state.poleB = "S"; state.turnsA = 0; state.turnsB = 1; state.distance = 50; state.material = "iron"; poleA.set(state.poleA); poleB.set(state.poleB); distance.set(state.distance); material.set(state.material); draw(true); },
      stepLabel: "距離を変える",
      step: () => { state.distance = state.distance >= 100 ? 20 : Math.min(100, state.distance + 20); distance.set(state.distance); draw(); }
    };
  }

  function weight(view, core) {
    const state = { shape: "round", material: "clay", amount: 1 };
    const section = core.section(view.panel, "形・材料・量を変える", "形を変えても量が同じなら、重さはどうなる？");
    const shape = core.options(section, { label: "形", values: [option("round", "丸い"), option("flat", "平ら")], value: state.shape, format: item => item.label, onChange: value => { state.shape = value; draw(); } });
    const material = core.options(section, { label: "材料", values: [option("clay", "粘土"), option("wood", "木"), option("iron", "鉄")], value: state.material, format: item => item.label, onChange: value => { state.material = value; draw(); } });
    const amount = core.range(section, { label: "量", min: 1, max: 3, value: state.amount, format: value => value + "こ分", onInput: value => { state.amount = value; draw(); } });
    const MAT_COLORS = { clay: "#c98268", wood: "#b88d57", iron: "#9ca7ac" };
    const MAT_LABELS = { clay: "粘土", wood: "木", iron: "鉄" };
    function draw() {
      const density = { clay: 2, wood: 1, iron: 8 }[state.material];
      const weightValue = state.amount * density;
      core.renderReadout(view.readout, {
        metrics: [
          { label: "重さ", value: weightValue + "g", detail: "量 " + state.amount + "こ分" },
          { label: "形の影響", value: "変わらない", detail: state.shape === "round" ? "丸い形" : "平らな形" }
        ],
        message: "同じ材料・同じ量なら、形を変えても重さは変わらないね。材料や量を変えると重さを比べられるよ。",
        note: "同じ体積の物を比べるモデルです。木・粘土・鉄の重さは学習用の目安で、実際の材料には種類による差があります。"
      });
      view.setTrial({ condition: MAT_LABELS[state.material] + "・" + (state.shape === "round" ? "丸い" : "平ら") + "・" + state.amount + "こ分", result: weightValue + "g" });
      if (view.setMissionState) view.setMissionState({ shape: state.shape, material: state.material, amount: state.amount, weight: weightValue });
      if (!wAnim.mounted) {
        // 開いた直後は釣り合った状態で見せる（ゆれは条件を変えたときだけ）。
        wAnim.mounted = true;
        wAnim.shapeT = state.shape === "flat" ? 1 : 0;
        renderWeightScene(0);
      } else {
        kickWeightAnim();
      }
    }
    // てんびんの場面。beam の傾きは「傾いて→ゆれて→釣り合う」減衰振動で描く。
    const wAnim = { raf: 0, shapeT: 0, tiltStart: -5.5, startTime: 0, mounted: false };
    function renderWeightScene(tilt) {
      const density = { clay: 2, wood: 1, iron: 8 }[state.material];
      const weightValue = state.amount * density;
      const t = wAnim.shapeT;
      const objW = 104 + (148 - 104) * t;
      const objH = 104 + (74 - 104) * t;
      const objRx = 52 + (12 - 52) * t;
      const pieces = weightValue <= 2 ? 1 : weightValue <= 6 ? 2 : weightValue <= 12 ? 3 : 4;
      const blocks = Array.from({ length: pieces }, (_, i) => {
        const w = 46 - i * 7;
        return '<rect x="' + (472 - w / 2) + '" y="' + (219 - 16 * (i + 1)) + '" width="' + w + '" height="15" rx="4" fill="#8d99a0" stroke="#5f6d73" stroke-width="2"/>';
      }).join("");
      view.stage.innerHTML =
        '<svg class="extra-svg" viewBox="0 0 640 360" role="group" aria-label="形と材料による物の重さのシミュレーション">' +
          '<rect width="640" height="360" fill="#f0f4f6"/><rect y="322" width="640" height="38" fill="#dde5e8"/>' +
          '<text x="28" y="42" class="scene-title">形を変えると、重さは？</text><text x="30" y="80" class="scene-caption">' + (state.shape === "round" ? "丸い形" : "平らな形") + "・" + MAT_LABELS[state.material] + "・" + state.amount + 'こ分</text>' + '<text x="320" y="112" text-anchor="middle" class="tiny-label">物をタップ、または左右にドラッグして形を変えよう</text>' +
          '<ellipse cx="320" cy="330" rx="86" ry="6" fill="#22331f" opacity=".1"/>' +
          '<path d="M306 322 L320 240 L334 322Z" fill="#8fa3ad"/><rect x="272" y="320" width="96" height="11" rx="4" fill="#77878f"/>' +
          '<g transform="rotate(' + tilt.toFixed(2) + ' 320 238)">' +
            '<rect x="128" y="232" width="384" height="11" rx="5" fill="#a8bcc4" stroke="#77878f" stroke-width="2"/>' +
            '<path d="M112 226 Q168 250 224 226 L218 216 Q168 236 118 216Z" fill="#cfd9dd" stroke="#77878f" stroke-width="2"/>' +
            '<path d="M416 226 Q472 250 528 226 L522 216 Q472 236 422 216Z" fill="#cfd9dd" stroke="#77878f" stroke-width="2"/>' +
            '<g class="weight-object-target scene-tap-target" role="button" tabindex="0" aria-label="物の形を丸い形と平らな形で切り替える"><ellipse cx="168" cy="222" rx="' + (objW / 2 - 4) + '" ry="4" fill="#22331f" opacity=".12"/><rect class="weight-mass" x="' + (168 - objW / 2) + '" y="' + (222 - objH) + '" width="' + objW + '" height="' + objH + '" rx="' + objRx + '" fill="' + MAT_COLORS[state.material] + '" stroke="#6c777b" stroke-width="4"/></g>' +
            blocks + '<text x="472" y="' + (219 - 16 * pieces - 12) + '" text-anchor="middle" class="component-label">おもり ' + weightValue + 'g</text>' +
          '</g><circle cx="320" cy="238" r="7" fill="#5d6f78"/>' +
          '<text x="168" y="352" text-anchor="middle" class="component-label">左のお皿：物</text>' +
        '</svg>';
    }
    function kickWeightAnim() {
      const targetT = state.shape === "flat" ? 1 : 0;
      if (REDUCED_MOTION) {
        wAnim.shapeT = targetT;
        renderWeightScene(0);
        return;
      }
      wAnim.tiltStart = -5.5;
      wAnim.startTime = performance.now();
      view.stage.classList.add("is-direct-manipulating");
      if (wAnim.raf) cancelAnimationFrame(wAnim.raf);
      const stepFn = now => {
        const el = (now - wAnim.startTime) / 1000;
        const tilt = wAnim.tiltStart * Math.exp(-3.4 * el) * Math.cos(el * 10.5);
        wAnim.shapeT += (targetT - wAnim.shapeT) * 0.2;
        if (Math.abs(targetT - wAnim.shapeT) < 0.01) wAnim.shapeT = targetT;
        renderWeightScene(tilt);
        if (el < 1.05 || wAnim.shapeT !== targetT) wAnim.raf = requestAnimationFrame(stepFn);
        else {
          wAnim.raf = 0;
          renderWeightScene(0);
          view.stage.classList.remove("is-direct-manipulating");
        }
      };
      wAnim.raf = requestAnimationFrame(stepFn);
    }
    const weightStage = view.stage;
    const toggleShape = () => {
      state.shape = state.shape === "round" ? "flat" : "round";
      shape.set(state.shape);
      if (view.markTried) view.markTried();
      draw();
    };
    const setShape = next => {
      if (state.shape === next) return;
      state.shape = next;
      shape.set(state.shape);
      draw();
    };
    let weightDrag = null;
    let suppressWeightClickUntil = 0;
    weightStage.addEventListener("pointerdown", event => {
      if (!event.target.closest || !event.target.closest(".weight-object-target")) return;
      const point = svgPoint(weightStage.querySelector("svg"), event);
      if (!point) return;
      weightDrag = { x: point.x, moved: false };
      if (weightStage.setPointerCapture) {
        try { weightStage.setPointerCapture(event.pointerId); }
        catch (_) { weightDrag = null; return; }
      }
      weightStage.classList.add("is-direct-manipulating");
      event.preventDefault();
    });
    weightStage.addEventListener("pointermove", event => {
      if (!weightDrag) return;
      const point = svgPoint(weightStage.querySelector("svg"), event);
      if (!point) return;
      const dx = point.x - weightDrag.x;
      if (Math.abs(dx) > 10) weightDrag.moved = true;
      if (dx >= 55) { setShape("flat"); weightDrag.x = point.x; }
      else if (dx <= -55) { setShape("round"); weightDrag.x = point.x; }
    });
    const stopWeightDrag = () => {
      if (weightDrag && weightDrag.moved) {
        suppressWeightClickUntil = Date.now() + 250;
        if (view.markTried) view.markTried();
      }
      weightDrag = null;
      weightStage.classList.remove("is-direct-manipulating");
    };
    weightStage.addEventListener("pointerup", stopWeightDrag);
    weightStage.addEventListener("pointercancel", stopWeightDrag);
    weightStage.addEventListener("lostpointercapture", stopWeightDrag);
    weightStage.addEventListener("click", event => {
      if (Date.now() < suppressWeightClickUntil) return;
      if (!event.target.closest || !event.target.closest(".weight-object-target")) return;
      toggleShape();
    });
    weightStage.addEventListener("keydown", event => {
      if (!event.target.closest || !event.target.closest(".weight-object-target") || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      toggleShape();
      const handle = weightStage.querySelector(".weight-object-target");
      if (handle) handle.focus();
    });
    return {
      render: draw,
      destroy: () => { if (wAnim.raf) cancelAnimationFrame(wAnim.raf); wAnim.raf = 0; },
      reset: () => { state.shape = "round"; state.material = "clay"; state.amount = 1; shape.set(state.shape); material.set(state.material); amount.set(state.amount); draw(); },
      stepLabel: "量を1こ分増やす",
      step: () => { state.amount = state.amount >= 3 ? 1 : state.amount + 1; amount.set(state.amount); draw(); }
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
