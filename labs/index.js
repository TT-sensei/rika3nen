(() => {
  "use strict";

  const MANIFESTS = {
    living: { id:"living", title:"生き物LAB", unit:"身近な生き物", icon:"🔎", summary:"明るさ・湿り方・植物を変えて、見つかる生き物のようすを比べます。", accent:"#43835a", modelNote:"生き物の数や活動を、すみかの条件との関係が見えやすいように単純化したモデルです。" },
    plants: { id:"plants", title:"植物LAB", unit:"植物の育ち", icon:"🌱", summary:"日数や植物の種類を変えて、育つ順序と体のつくりを見ます。", accent:"#4f934b", modelNote:"種から芽、葉、花、実へと育つ順序と、根・茎・葉のつくりを見やすく単純化しています。実際の速さには幅があります。" },
    insects: { id:"insects", title:"昆虫LAB", unit:"昆虫の育ちと体", icon:"🦋", summary:"育ち方と体のつくりを切り替えて、共通点や違いを比べます。", accent:"#b87835", modelNote:"昆虫の育ちの順序と、頭・胸・腹、6本の足という共通点を見やすく表しています。" },
    windrubber: { id:"windrubber", title:"風とゴムLAB", unit:"風とゴムの力", icon:"💨", summary:"風の強さやゴムの伸びを変えて、車の動く距離を比べます。", accent:"#27849b", modelNote:"風やゴムの力と動く距離の関係を、条件を一つずつ変えて比べるモデルです。" },
    sound: { id:"sound", title:"音LAB", unit:"音のせいしつ", icon:"🔔", summary:"はじく強さや音の伝わり方を変えて、ふるえと音の関係を見ます。", accent:"#8a64a7", modelNote:"音を出す物のふるえと、音が伝わる様子を観察しやすくしたモデルです。" },
    sun: { id:"sun", title:"太陽LAB", unit:"太陽と地面", icon:"☀️", summary:"時刻や見るものを変えて、太陽の位置・影・地面の温度を比べます。", accent:"#d18524", modelNote:"太陽の位置と影の向き、日光による地面の温度変化を単純化しています。太陽を直接見ないでください。" },
    light: { id:"light", title:"光LAB", unit:"光のせいしつ", icon:"🪞", summary:"鏡の向きや枚数を変えて、反射した光の進み方を比べます。", accent:"#d3a01e", modelNote:"光の反射と、光を重ねたときの明るさを比べやすく表しています。人や道路へ光を向けないでください。" },
    electricity: { id:"electricity", title:"電気LAB", unit:"電気の通り道", icon:"💡", summary:"回路のつながりや材料を変えて、豆電球の点灯を確かめます。", accent:"#b88a12", modelNote:"乾電池・導線・豆電球の回路と、材料による電気の通しやすさを単純化しています。" },
    magnets: { id:"magnets", title:"磁石LAB", unit:"磁石のせいしつ", icon:"🧲", summary:"極の組み合わせや距離、材料を変えて、磁石の動きを比べます。", accent:"#bd5550", modelNote:"磁石の極の組み合わせと、鉄を引き付ける力の変化を見やすく表しています。" },
    weight: { id:"weight", title:"重さLAB", unit:"物と重さ", icon:"⚖️", summary:"形・量・材料を変えて、重さの変化を比べます。", accent:"#607483", modelNote:"形を変えても量が同じなら重さは変わらず、材料で重さが変わる関係を単純化しています。" }
  };
  const CHALLENGES = {
    "living": [
      "同じ場所で、さがす生き物だけを変えて比べよう。",
      "ダンゴムシが見つかりやすい場所の共通点を探そう。",
      "チョウが見つかりやすい場所と食べ物の関係を考えよう。"
    ],
    "plants": [
      "7日ずつ進め、変わったところを順番に見つけよう。",
      "ヒマワリとホウセンカの育ち方を同じ日数で比べよう。",
      "根・茎・葉、花、実が見える時期を探そう。"
    ],
    "insects": [
      "チョウにあって、バッタにない段階を見つけよう。",
      "成虫まで1段階ずつ進め、変わる所を観察しよう。",
      "成虫の体の3つの部分と6本の足を確かめよう。"
    ],
    "windrubber": [
      "力を20%ずつ強くすると、距離はどう変わる？",
      "同じ強さで、風とゴムを比べよう。",
      "車が200cm以上進む条件を探そう。"
    ],
    "sound": [
      "同じ物を、弱く・強く鳴らしてふるえを比べよう。",
      "同じ強さで、輪ゴムと太鼓のふるえを比べよう。",
      "糸電話の糸を張る・ゆるめるで伝わり方を比べよう。"
    ],
    "sun": [
      "時刻を2時間ずつ進め、太陽の位置を追おう。",
      "太陽と影の向きの関係を見つけよう。",
      "影がいちばん短くなる時刻を探そう。"
    ],
    "light": [
      "鏡の向きを少しずつ変え、光が届く場所を探そう。",
      "鏡1枚と2枚で、光の進み方を比べよう。",
      "光が鏡で曲がるときの決まりを見つけよう。"
    ],
    "electricity": [
      "回路を開く・閉じるで、電気の通り道を比べよう。",
      "同じ回路で、金属とほかの物を入れて比べよう。",
      "豆電球がつくために必要なつながり方を探そう。"
    ],
    "magnets": [
      "同じ極どうしと違う極どうしを比べよう。",
      "距離を少しずつ変え、力が弱くなる様子を見よう。",
      "磁石につく物・つかない物の共通点を探そう。"
    ],
    "weight": [
      "形だけを変えて、重さが変わるか確かめよう。",
      "量を同じにして、材料ごとの重さを比べよう。",
      "材料を同じにして、量と重さの関係を見つけよう。"
    ]
  };
  Object.entries(CHALLENGES).forEach(([id, items]) => { if (MANIFESTS[id]) MANIFESTS[id].challenges = items; });
  const UNIT_ORDER = ["living","plants","insects","windrubber","sound","sun","light","electricity","magnets","weight"];
  const loaded = new Map();
  let activeCleanup = null;

  function loadScript(src) {
    if (loaded.has(src)) return loaded.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    promise.catch(() => loaded.delete(src));
    loaded.set(src, promise);
    return promise;
  }

  function catalog() {
    const units = window.SCIENCE_UNITS || [];
    const cards = UNIT_ORDER.map(id => {
      const manifest = MANIFESTS[id];
      const unit = units.find(item => item.id === id);
      if (!manifest || !unit) return "";
      return '<button class="lab-card" type="button" data-lab-id="' + manifest.id + '" style="--lab-accent:' + manifest.accent + '">' +
        '<span class="lab-card-icon" aria-hidden="true">' + unit.icon + '</span>' +
        '<span class="lab-card-tag">' + unit.title + '</span>' +
        '<h2>' + manifest.title + '</h2><p>' + manifest.summary + '</p><b>実験を始める →</b></button>';
    }).join("");
    return '<nav class="breadcrumbs" aria-label="現在位置"><button class="text-button" type="button" data-home>単元一覧</button><span>›</span><span>LAB</span></nav>' +
      '<section class="lab-library-hero"><div><p class="eyebrow">SCIENCE LAB</p><h1>条件を変えると、何が変わる？</h1><p>答えを当てる場所ではありません。条件を動かして、現象の変化を見つける実験室です。</p></div></section>' +
      '<section class="lab-library" aria-labelledby="readyLabs"><div class="section-heading"><h2 id="readyLabs">10単元のシミュレーション</h2><p>好きな単元から試そう</p></div><div class="lab-card-grid">' + cards + '</div></section>';
  }

  async function render(route, root, host) {
    if (activeCleanup) { activeCleanup(); activeCleanup = null; }
    if (!route.labId) { root.innerHTML = catalog(); return null; }
    const manifest = MANIFESTS[route.labId];
    if (!manifest) {
      root.innerHTML = '<section class="empty-state"><h1>このLABはまだありません</h1><button class="primary-button" type="button" data-lab-home>一覧へ戻る</button></section>';
      return null;
    }
    root.innerHTML = '<section class="lab-loading"><span class="lab-loading-mark" aria-hidden="true">' + manifest.icon + '</span><h1>' + manifest.title + 'を準備しています</h1><p>このLABに必要な実験道具だけを読み込んでいます。</p></section>';
    if (!window.RikaThreeLabCore) await loadScript("labs/lab-core.js");
    if (!window.RikaThreeSimulations) await loadScript("labs/third-labs.js");
    const factory = window.RikaThreeSimulations && window.RikaThreeSimulations[manifest.id];
    if (!factory) throw new Error("Simulation factory missing");
    activeCleanup = factory.mount(root, Object.assign({}, { core: window.RikaThreeLabCore, host, manifest }));
    return activeCleanup;
  }

  function leave() {
    if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  }

  window.SCIENCE_UNIT_ORDER = UNIT_ORDER;
  window.RikaLabRouter = { render, catalog, leave, manifests: MANIFESTS };
})();
