(() => {
  "use strict";
  const grade = document.title.match(/理科ラボ\s*(\d)/)?.[1] || "3";
  const BASE = "https://tt-sensei.github.io/edu-assets/assets/web/";
  const science = [
    ["science-observer","観察の目"],["wonder","ふしぎ発見"],["prediction","予想"],["experiment","実験"],["fair-test","条件をそろえる"],
    ["science-measure","測定"],["science-record","記録"],["compare-results","結果を比べる"],["evidence","証拠から考える"],
    ["science-discovery","科学の発見"],["science-connection","つながり"],["life-science","生命"],["earth-science","地球・天気"],
    ["matter","物質"],["energy","エネルギー"]
  ];
  const elements = ["fire","water","nature","thunder","ice","wind","earth","light","moon","crystal","shadow","gravity","cosmos","psychic","sound","rainbow","dream","bubble","cloud","flower","fairy","candy","rain"];
  const collections = ["animal","sea-animal","fruit","gem","dinosaur","space","fantasy","insect","treasure","flower"];
  const KEY = "rikaLabAssets" + grade + ".v1";
  let state = {}; try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
  const img = (src, alt, locked) => "<div class=\"asset-card " + (locked ? "asset-locked" : "") + "\"><img src=\"" + src + "\" alt=\"" + esc(alt) + "\" loading=\"lazy\" onerror=\"this.closest('.asset-card').classList.add('asset-missing')\"><b>" + esc(alt) + "</b><small>" + (locked ? "学習を進めると解放" : "発見済み") + "</small></div>";
  const unlocked = () => state.unlocked || 0;
  function gallery() {
    const n = unlocked();
    const scienceHtml = science.map((x,i) => img(BASE+"badges/science/"+x[0]+"/badge.webp", "理科｜"+x[1], i >= Math.min(n, science.length))).join("");
    const elementHtml = elements.map((x,i) => img(BASE+"elements/"+x+"/level-"+((i%3)+1)+"/badge.webp", "エレメント｜"+x.toUpperCase(), i+science.length >= n)).join("");
    const collectionBadge = {animal:"bear","sea-animal":"dolphin",fruit:"apple",sweets:"candy",gem:"amethyst",dinosaur:"triceratops",space:"01-earth.webp",fantasy:"dragon",insect:"butterfly",car:"race-car",treasure:"coin-pouch",flower:"sunflower"};
    const collectionHtml = collections.map(x => { const item = collectionBadge[x] || "badge"; const file = x === "space" ? item : item + "/badge.webp"; return "<div class=\"asset-card asset-link\"><img class=\"discovery-badge\" src=\"" + BASE + "collections/" + x + "/common/" + file + "\" alt=\"コレクション｜" + x.toUpperCase() + "\" loading=\"lazy\"><b>コレクション｜"+x.toUpperCase()+"</b><small>軽量版バッジを見る</small></div>"; }).join("");
    return "<section class=\"asset-page\"><button class=\"text-button\" data-assets-home>単元一覧へ</button><p class=\"eyebrow\">SCIENCE ASSET BOOK</p><h1>理科のおまけ図鑑</h1><p>理科の学びにぴったりなバッジを中心に、エレメントやコレクションも集めよう。解放数："+n+"</p><h2>理科バッジ</h2><div class=\"asset-grid\">"+scienceHtml+"</div><h2>エレメント</h2><div class=\"asset-grid\">"+elementHtml+"</div><h2>コレクション</h2><div class=\"asset-grid\">"+collectionHtml+"</div></section>";
  }
  if (!window.ScienceGame) return;
  const originalPanel = window.ScienceGame.panel;
  const originalCatalog = window.ScienceGame.catalog;
  window.ScienceGame.panel = () => (originalPanel ? originalPanel() : "") + "<section class=\"asset-shortcut\"><div><span class=\"research-kicker\">SCIENCE ASSET BOOK</span><b>理科のおまけ図鑑</b><small>理科バッジを中心に、エレメントやコレクションも集めよう</small></div><button type=\"button\" data-assets>おまけ図鑑をひらく</button></section>";
  window.ScienceGame.catalog = () => (originalCatalog ? originalCatalog() : "") + gallery();
  const originalAward = window.ScienceGame.award;
  window.ScienceGame.award = payload => {
    originalAward(payload);
    if (!payload.correct || !payload.unitComplete) return;
    state.unlocked = Math.min(science.length + elements.length, unlocked() + 1);
    save();
  };
  document.addEventListener("click", e => {
    const open = e.target.closest("[data-assets]");
    const home = e.target.closest("[data-assets-home]");
    const app = document.querySelector("#app");
    if (open && app) { app.innerHTML = gallery(); app.focus(); window.scrollTo({top:0,behavior:"smooth"}); }
    if (home && app) { location.hash = ""; window.dispatchEvent(new HashChangeEvent("hashchange")); window.scrollTo({top:0,behavior:"smooth"}); }
  });
  const style = document.createElement("style");
  style.textContent = ".asset-shortcut{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:1.2rem 0;padding:1rem 1.2rem;border:2px solid #b9dfe6;border-radius:1.2rem;background:#f3fbfc}.asset-shortcut b,.asset-shortcut small{display:block}.asset-shortcut small{color:#55717a;margin-top:.25rem}.asset-shortcut button{border:0;border-radius:999px;padding:.7rem 1rem;background:#173f50;color:#fff;font-weight:700}.asset-page h2{margin-top:2rem}.asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:.75rem}.asset-card{min-height:145px;padding:.55rem;border:1px solid #d8e6e9;border-radius:1rem;background:#fff;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.25rem}.asset-card img{width:86px;height:86px;object-fit:contain}.asset-card b{font-size:.72rem}.asset-card small{font-size:.65rem;color:#647980}.asset-locked{filter:grayscale(1);opacity:.38}.asset-link{text-decoration:none;color:inherit}.asset-card span{font-size:2.5rem}.asset-missing{display:none}@media(max-width:600px){.asset-shortcut{align-items:flex-start;flex-direction:column}}";
  document.head.appendChild(style);
})();