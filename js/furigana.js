// ふりがな：読みが固定の言葉だけを辞書に持ち、最長一致でルビを付ける。
// 文脈で読みが変わる漢字（単漢字など）は辞書に入れない。
// 設定（ON/OFF・端末保存）は app.js 側が持ち、ここは付け外しの仕組みだけを受け持つ。
(() => {
  "use strict";

  const DICT = {
    "懐中電灯": "かいちゅうでんとう",
    "乾電池": "かんでんち", "豆電球": "まめでんきゅう", "糸電話": "いとでんわ",
    "温度計": "おんどけい", "共通点": "きょうつうてん", "反対側": "はんたいがわ",
    "生き物": "いきもの", "食べ物": "たべもの",
    "観察": "かんさつ", "実験": "じっけん", "記録": "きろく", "磁石": "じしゃく",
    "回路": "かいろ", "反射": "はんしゃ", "振動": "しんどう", "幼虫": "ようちゅう",
    "成虫": "せいちゅう", "発芽": "はつが", "草丈": "くさたけ", "温度": "おんど",
    "方位": "ほうい", "昆虫": "こんちゅう", "触角": "しょっかく", "環境": "かんきょう",
    "予想": "よそう", "結果": "けっか", "材料": "ざいりょう", "性質": "せいしつ",
    "距離": "きょり", "変化": "へんか", "関係": "かんけい", "条件": "じょうけん",
    "導線": "どうせん", "端子": "たんし", "金属": "きんぞく", "粘土": "ねんど",
    "太陽": "たいよう", "地面": "じめん", "電気": "でんき", "植物": "しょくぶつ",
    "様子": "ようす", "段階": "だんかい", "毎回": "まいかい", "比較": "ひかく",
    "準備": "じゅんび", "点灯": "てんとう", "特徴": "とくちょう", "状態": "じょうたい",
    "現象": "げんしょう", "理由": "りゆう", "目安": "めやす", "目標": "もくひょう",
    "確認": "かくにん", "種類": "しゅるい", "空気": "くうき", "約束": "やくそく",
    "順序": "じゅんじょ", "順番": "じゅんばん", "観点": "かんてん", "証拠": "しょうこ",
    "説明": "せつめい", "調整": "ちょうせい", "身近": "みぢか", "道具": "どうぐ",
    "道路": "どうろ", "適切": "てきせつ", "部分": "ぶぶん", "発見": "はっけん",
    "図鑑": "ずかん", "研究": "けんきゅう", "安全": "あんぜん", "注意": "ちゅうい",
    "考察": "こうさつ", "計画": "けいかく", "分類": "ぶんるい", "成長": "せいちょう",
    "音量": "おんりょう", "送風機": "そうふうき", "虫眼鏡": "むしめがね",
    "立方体": "りっぽうたい", "体積": "たいせき", "面積": "めんせき", "筋肉": "きんにく",
    "関節": "かんせつ", "銀色": "ぎんいろ", "高温": "こうおん", "正午": "しょうご",
    "標本": "ひょうほん", "清潔": "せいけつ", "測定": "そくてい", "単純化": "たんじゅんか",
    "接触": "せっしょく", "指示": "しじ", "角度": "かくど", "表面": "ひょうめん",
    "背景": "はいけい", "影響": "えいきょう", "原因": "げんいん", "判断": "はんだん",
    "区別": "くべつ", "世話": "せわ", "絶対": "ぜったい", "必要": "ひつよう",
    "実際": "じっさい", "対応": "たいおう", "方法": "ほうほう", "方向": "ほうこう",
    "時刻": "じこく", "時期": "じき", "時間": "じかん", "最初": "さいしょ",
    "枚数": "まいすう", "日数": "にっすう", "日光": "にっこう", "天気": "てんき",
    "天候": "てんこう", "大切": "たいせつ", "公園": "こうえん", "公平": "こうへい",
    "写真": "しゃしん", "利用": "りよう", "単元": "たんげん", "一覧": "いちらん",
    "全体": "ぜんたい", "両方": "りょうほう", "中央": "ちゅうおう", "中心": "ちゅうしん",
    "位置": "いち", "以上": "いじょう", "以外": "いがい", "世代": "せだい",
    "午前": "ごぜん", "午後": "ごご", "名前": "なまえ", "問題": "もんだい",
    "場所": "ばしょ", "塗装": "とそう", "増減": "ぞうげん", "学校": "がっこう",
    "家庭": "かてい", "用意": "ようい", "注目": "ちゅうもく", "現在": "げんざい",
    "直接": "ちょくせつ", "直角": "ちょっかく", "相手": "あいて", "複数": "ふくすう",
    "途中": "とちゅう", "追加": "ついか", "校庭": "こうてい", "重さ": "おもさ",
    "目盛り": "めもり", "比べる": "くらべる", "違い": "ちがい", "命": "いのち",
    "姿": "すがた"
  };
  const WORDS = Object.keys(DICT).sort((a, b) => b.length - a.length);

  let enabled = false;
  let observer = null;

  function rubyNode(word) {
    const ruby = document.createElement("ruby");
    ruby.append(document.createTextNode(word));
    const rt = document.createElement("rt");
    rt.textContent = DICT[word];
    ruby.append(rt);
    return ruby;
  }

  function processTextNode(node) {
    const text = node.nodeValue;
    if (!text || !/[一-龥]/.test(text)) return;
    let index = 0;
    let hit = null;
    // 最長一致：各位置で辞書の最長語を探す
    outer: while (index < text.length) {
      for (const word of WORDS) {
        if (text.startsWith(word, index)) { hit = { index, word }; break outer; }
      }
      index += 1;
    }
    if (!hit) return;
    const frag = document.createDocumentFragment();
    let rest = text;
    let pos = hit.index;
    // 先頭のヒット以降も分割して処理する
    const segments = [];
    let cursor = 0;
    while (cursor < rest.length) {
      let found = null;
      for (const word of WORDS) {
        if (rest.startsWith(word, cursor)) { found = word; break; }
      }
      if (found) { segments.push({ word: found }); cursor += found.length; }
      else {
        let next = cursor + 1;
        while (next < rest.length) {
          let f2 = null;
          for (const word of WORDS) { if (rest.startsWith(word, next)) { f2 = word; break; } }
          if (f2) break;
          next += 1;
        }
        segments.push({ text: rest.slice(cursor, next) });
        cursor = next;
      }
    }
    segments.forEach(seg => {
      frag.append(seg.word ? rubyNode(seg.word) : document.createTextNode(seg.text));
    });
    node.parentNode.replaceChild(frag, node);
  }

  function walk(root) {
    if (!enabled || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("script, style, ruby, rt, textarea, input, svg, .no-furigana")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(processTextNode);
  }

  function removeAll() {
    document.querySelectorAll("ruby").forEach(ruby => {
      const text = Array.from(ruby.childNodes)
        .filter(n => n.nodeName !== "RT" && n.nodeName !== "RP")
        .map(n => n.textContent).join("");
      ruby.replaceWith(document.createTextNode(text));
    });
  }

  function setEnabled(on) {
    enabled = Boolean(on);
    if (observer) { observer.disconnect(); observer = null; }
    if (enabled) {
      walk(document.body);
      observer = new MutationObserver(records => {
        for (const record of records) {
          record.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              if (node.closest && node.closest("ruby")) return;
              walk(node);
            } else if (node.nodeType === 3 && record.target && !record.target.closest("ruby")) {
              // 既存テキストへの追加は対象外（画面は再描画で差し替わるため）
            }
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      removeAll();
    }
  }

  window.Furigana = {
    setEnabled,
    apply: walk,
    isEnabled: () => enabled,
    DICT
  };
})();
