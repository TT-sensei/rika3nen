(() => {
  "use strict";
  const grade = document.title.match(/理科ラボ\s*(\d)/)?.[1] || "3";
  const KEY = `rikaLab${grade}.research.v1`;
  const RANKS = [["研究みならい",0],["かけだし研究員",80],["研究員",220],["上級研究員",450],["主任研究員",750],["エキスパート研究員",1120],["理科博士",1600]];
  const FACTS = {
    3:{living:"生き物は、すみかに合ったすがたでくらしている",plants:"植物は、たね→芽→花→実の順に育つ",insects:"昆虫のからだは、あたま・むね・はらに分かれる",windrubber:"風やゴムの力で、物を動かせる",sound:"音が出ている物は、ふるえている",sun:"太陽の位置が変わると、かげの向きも変わる",light:"鏡では、光をはね返して進む",electricity:"電気を通る道がつながると、豆電球がつく",magnets:"磁石には、引き付ける物と引き付けない物がある",weight:"物は形を変えても、重さは変わらない"},
    4:{seasons:"気温の変化と、生き物のようすは関係している",body:"骨・関節・筋肉が協力して体を動かす",weather:"天気によって、1日の気温の変わり方にちがいがある",rainwater:"地面の傾きや土のつぶで、水のゆくえが変わる",moonstars:"星は時間とともに動いて見え、月は日ごとに形が変わる",electricity:"乾電池の数やつなぎ方で、モーターの回り方が変わる",airwater:"空気は縮むが、水はほとんど縮まない",volume:"空気・水・金属は温めると体積が大きくなる",heating:"物によって、温まり方と熱の伝わり方がちがう",waterstate:"水は温度によって、氷・水・水蒸気に姿を変える"},
    5:{plants:"発芽や成長には、必要な条件がある",animals:"メダカも人も、命をつないで育つ",weather:"雲の動きは、天気の変化を予想する手がかり",river:"流れる水には、けずる・運ぶ・積もらせる働きがある",solutions:"物が水にとけても、全体の重さは変わらない",electromagnet:"電流の向きや強さ、巻き数で電磁石の働きが変わる"},
    6:{burning:"ものが燃え続けるには、酸素をふくむ空気が必要",body:"消化・呼吸・血液の流れが、体を支えている",plants:"植物は日光を使って、葉ででんぷんをつくる",environment:"生物は食べ物・空気・水でつながっている",moon:"月の形は、月・地球・太陽の位置関係で決まる",earth:"地層や化石は、昔の環境を知らせる証拠",lever:"てこは、重さと支点からの距離の組合せでつり合う",electricity:"電気は、光・熱・運動・音などに変えられる",solutions:"水溶液は、性質を示す証拠で見分けられる"}
  };
  const ICONS={living:"🐞",plants:"🌱",insects:"🦋",windrubber:"💨",sound:"🔔",sun:"☀️",light:"🪞",electricity:"💡",magnets:"🧲",weight:"⚖️",seasons:"🌸",body:"💪",weather:"🌤️",rainwater:"🌧️",moonstars:"🌙",airwater:"💨",volume:"🌡️",heating:"🔥",waterstate:"🧊",animals:"🐟",river:"🏞️",solutions:"🧪",electromagnet:"🧲",burning:"🔥",environment:"🕸️",moon:"🌗",earth:"🌋",lever:"⚖️"};
  const empty = () => ({xp:0, discoveries:{}, rewards:{}, rank:0});
  let state; try { state = {...empty(), ...JSON.parse(localStorage.getItem(KEY))}; } catch (_) { state=empty(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} };
  const rank = () => { let i=0; RANKS.forEach((r,n)=>{if(state.xp>=r[1]) i=n;}); return i; };
  const next = () => RANKS[rank()+1] || null;
  const info = () => ({xp:state.xp, rank:rank(), name:RANKS[rank()][0], next, discoveries:Object.keys(state.discoveries).length, total:Object.keys(FACTS[grade]||{}).length*4});
  const esc = v => String(v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
  function overlay(title, body, kind="discovery") { const el=document.createElement("div"); el.className=`science-overlay ${kind}`; el.innerHTML=`<div class="science-pop" role="dialog" aria-modal="true"><p>${kind === "rank" ? "RANK UP!" : kind === "major" ? "★ 大発見！" : "🔍 NEW DISCOVERY!"}</p><h2>${esc(title)}</h2><div>${esc(body)}</div><button type="button">やった！</button></div>`; el.querySelector("button").onclick=()=>el.remove(); document.body.append(el); }
  function tone() { try { const a=new (window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain(); o.frequency.value=880;g.gain.setValueAtTime(.06,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.28);o.connect(g).connect(a.destination);o.start();o.stop(a.currentTime+.28); } catch(_){} }
  function addDiscovery(id,title,text,kind) { if(state.discoveries[id]) return; state.discoveries[id]={title,text,kind}; save(); tone(); overlay(title,text,kind); }
  function celebrate() { const old=document.querySelector(".science-correct-burst"); if(old) old.remove(); const el=document.createElement("div"); el.className="science-correct-burst"; el.innerHTML=`<div class="correct-mark">○<small>正解！</small></div>${Array.from({length:16},(_,i)=>`<i style="--i:${i}">${i%3===0?"🌸":i%3===1?"✨":"🎉"}</i>`).join("")}`; document.body.append(el); setTimeout(()=>el.remove(),1100); try { const a=new (window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain(); o.type="sine"; o.frequency.setValueAtTime(523,a.currentTime); o.frequency.exponentialRampToValueAtTime(880,a.currentTime+.16); g.gain.setValueAtTime(.07,a.currentTime); g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.32); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime+.32); } catch(_){} }
  function award({unitId,phase,itemId,correct,wasCompleted,unitComplete}) { if(!correct) return; celebrate(); const before=rank(); const reward=`${unitId}.${phase}.${itemId}`; let gained=0;
    if(!wasCompleted && !state.rewards[reward]) { gained={knowledge:10,preparation:16,consideration:18}[phase]||10; state.rewards[reward]=true; }
    else if(wasCompleted && !state.rewards[`retry.${reward}`]) { gained=5; state.rewards[`retry.${reward}`]=true; }
    const phaseKey=`${unitId}.${phase}`; if(!state.discoveries[phaseKey]) { const labels={knowledge:"観察の発見",preparation:"実験計画の発見",consideration:"考察の発見"}; const text=phase==="knowledge" ? "くらべると、ちがいから新しいことが見えてくる。" : phase==="preparation" ? "調べること以外の条件をそろえると、理由を確かめられる。" : "結果を根拠にすると、説得力のある考察になる。"; addDiscovery(phaseKey, `${labels[phase]}｜${unitId}`, text, "discovery"); }
    if(unitComplete && !state.discoveries[`major.${unitId}`]) { gained+=35; addDiscovery(`major.${unitId}`, "大発見", FACTS[grade]?.[unitId] || "観察や実験の結果から、きまりを見つけよう。", "major"); }
    if(gained) { state.xp+=gained; save(); if(rank()>before) { tone(); overlay(`${RANKS[rank()][0]} になった！`, `研究XP ${state.xp} XP。次の発見も楽しみだね。`, "rank"); } }
  }
  function panel() { const s=info(), n=s.next, max=n?n[1]:s.xp||1, base=RANKS[s.rank][1], pct=n?Math.min(100,Math.round((s.xp-base)/(max-base)*100)):100; return `<section class="research-panel"><div><span class="research-kicker">研究ランク</span><b>${esc(s.name)} Lv.${s.rank+1}</b><small>${n?`あと ${n[1]-s.xp} XPでランクアップ！`:"最高ランクに到達！"}</small></div><div class="research-meter"><span style="width:${pct}%"></span></div><strong>${s.xp} / ${n?max:"MAX"} XP</strong><button type="button" data-discoveries>🔍 発見図鑑　${s.discoveries} / ${s.total}</button></section>`; }
  function catalog() { const facts=FACTS[grade]||{}; const items=[]; Object.entries(facts).forEach(([id,fact])=> { const got=state.discoveries[`major.${id}`], icon=ICONS[id]||"🔬";items.push(`<article class="discovery-card ${got?"found":"hidden"}"><span>${got?icon:"？"}</span><b>${got?esc(got.title):"？？？"}</b><small>${got?esc(fact):"研究を進めると見つかるよ"}</small></article>`); }); return `<section class="catalog-page"><button class="text-button" data-home>単元一覧へ</button><p class="eyebrow">DISCOVERY BOOK</p><h1>発見図鑑　${info().discoveries} / ${info().total}</h1><p>見つけた大発見は、いつでもここで確かめられるよ。</p><div class="discovery-grid">${items.join("")}</div></section>`; }
  window.ScienceGame={award,panel,catalog,celebrate};
})();
