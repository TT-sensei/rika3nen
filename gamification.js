// 理科ラボ3の「発見図鑑」と「研究ランク」のデータと計算だけを受け持つモジュール。
// 保存は app.js 側（localStorage キー rikaLab3.v3）に一本化し、ここでは状態を持たない。
// 旧版にあった「あとNaN XP」「0 / undefined XP」表示バグ（next を関数として返していた）を避けるため、
// rankInfo は必ず数値だけを返す。
(() => {
  "use strict";

  const RANKS = [
    ["研究みならい", 0],
    ["かけだし研究員", 80],
    ["研究員", 220],
    ["上級研究員", 450],
    ["主任研究員", 750],
    ["エキスパート研究員", 1120],
    ["理科博士", 1600]
  ];

  // 単元を最後まで進めたときの「大発見」の一文（内容は指導要領ベースで確認済みのもの）。
  const FACTS = {
    living: "生き物は、すみかに合ったすがたでくらしている",
    plants: "植物は、たね→芽→花→実の順に育つ",
    insects: "昆虫のからだは、あたま・むね・はらに分かれる",
    windrubber: "風やゴムの力で、物を動かせる",
    sound: "音が出ている物は、ふるえている",
    sun: "太陽の位置が変わると、かげの向きも変わる",
    light: "鏡では、光をはね返して進む",
    electricity: "電気を通る道がつながると、豆電球がつく",
    magnets: "磁石には、引き付ける物と引き付けない物がある",
    weight: "物は形を変えても、重さは変わらない"
  };

  const PHASE_DISCOVERY = {
    knowledge: { label: "くらべる発見", text: "くらべると、ちがいから新しいことが見えてくる。" },
    preparation: { label: "じゅんびの発見", text: "調べること以外をそろえると、理由を確かめられる。" },
    consideration: { label: "まとめる発見", text: "結果を根拠にすると、説得力のあるまとめになる。" }
  };

  const PHASE_XP = { knowledge: 10, preparation: 16, consideration: 18 };
  const RETRY_XP = 5;
  const UNIT_COMPLETE_XP = 35;
  const LAB_MISSION_XP = 10;

  function rankInfo(xp) {
    const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
    let index = 0;
    RANKS.forEach((rank, i) => { if (safeXp >= rank[1]) index = i; });
    const current = RANKS[index];
    const nextRank = RANKS[index + 1] || null;
    const base = current[1];
    const pct = nextRank
      ? Math.min(100, Math.round(((safeXp - base) / (nextRank[1] - base)) * 100))
      : 100;
    return {
      xp: safeXp,
      index,
      level: index + 1,
      name: current[0],
      nextName: nextRank ? nextRank[0] : null,
      nextXp: nextRank ? nextRank[1] : null,
      remain: nextRank ? nextRank[1] - safeXp : 0,
      pct,
      isMax: !nextRank
    };
  }

  // 図鑑は 10単元 ×（3フェイズの発見＋大発見＋LABミッション発見3件）＝ 70件。
  // LABミッションの定義は labs/manifests.js（RikaLabManifests）にあり、実行時に読む。
  function catalogItems(discoveries) {
    const got = discoveries || {};
    const items = [];
    const manifests = window.RikaLabManifests || {};
    Object.keys(FACTS).forEach(unitId => {
      ["knowledge", "preparation", "consideration"].forEach(phase => {
        const key = unitId + "." + phase;
        const found = Boolean(got[key]);
        items.push({
          key, unitId, kind: phase, found,
          title: found ? PHASE_DISCOVERY[phase].label : "？？？",
          text: found ? PHASE_DISCOVERY[phase].text : "この単元の学習を進めると見つかるよ"
        });
      });
      const key = "major." + unitId;
      const found = Boolean(got[key]);
      items.push({
        key, unitId, kind: "major", found,
        title: found ? "大発見" : "大発見（未発見）",
        text: found ? FACTS[unitId] : "単元を最後まで進めると見つかるよ"
      });
      const missions = (manifests[unitId] && manifests[unitId].missions) || [];
      missions.forEach(mission => {
        const mKey = "lab." + unitId + "." + mission.id;
        const mFound = Boolean(got[mKey]);
        items.push({
          key: mKey, unitId, kind: "lab", found: mFound,
          title: mFound ? mission.title : "？？？",
          text: mFound ? mission.text : "LABのあそびミッションを達成すると見つかるよ"
        });
      });
    });
    return items;
  }

  window.RikaGame = {
    RANKS, FACTS, PHASE_DISCOVERY, PHASE_XP, RETRY_XP, UNIT_COMPLETE_XP, LAB_MISSION_XP,
    rankInfo, catalogItems,
    // 総数はミッション定義を含むため、実行時に数える（読み込み順に依存しない）。
    get TOTAL_DISCOVERIES() { return catalogItems({}).length; }
  };
})();
