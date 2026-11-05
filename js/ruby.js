/*
 * 固有名詞のふりがな（ルビ）
 * 画面に表示されるテキストから固有名詞を見つけ、<ruby> で読み方を添える。
 * 表示モード：すべて／初出のみ（段落ごとに最初の一回）／なし
 */
(function () {
  'use strict';

  const KEY = 'shirasagi-ruby';
  const MODES = ['all', 'first', 'off'];
  const LABEL = { all: 'ふりがな：すべて', first: 'ふりがな：初出のみ', off: 'ふりがな：なし' };
  const TIP = {
    all: '固有名詞のすべてに読み方を表示しています（クリックで切り替え）',
    first: '段落ごとに、最初に出てきた固有名詞だけ読み方を表示しています（クリックで切り替え）',
    off: '読み方を表示していません（クリックで切り替え）',
  };

  /*
   * [正規表現, 読み]。シリーズごとの登録簿（js/series.js）から集める。
   * ゲーム画面では遊んでいるシリーズの語だけを使う（別シリーズの語の読みが混ざらないように）。
   */
  function collectEntries() {
    const all = window.SERIES || [];
    const pick = window.CURRENT_SERIES ? [window.CURRENT_SERIES] : all;
    const seen = new Set();
    const out = [];
    for (const [p, r] of [...pick.flatMap(s => s.ruby || []), ...(window.SERIES_PLACES || [])]) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push([p, r]);
    }
    return out;
  }
  const ENTRIES = collectEntries();

  const SCOPE = 'p, li, h1, h2, h3, h4, blockquote, button, .dlg-text, .dlg-name, .toast, .pnb-text, .clue-desc, .tl-text, .tt-text, .my-body, .pick-detail';
  const SKIP = 'ruby, rt, script, style, svg, textarea, input, [data-noruby]';
  const RX = new RegExp(ENTRIES.map(([p]) => `(${p})`).join('|') || '(?!)', 'g');
  const TEST = new RegExp(ENTRIES.map(([p]) => p).join('|') || '(?!)');

  let mode = MODES.includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'all';

  function applyMode() {
    document.body.classList.toggle('ruby-first', mode === 'first');
    document.body.classList.toggle('ruby-off', mode === 'off');
    document.querySelectorAll('.btn-ruby').forEach(b => {
      if (b.textContent !== LABEL[mode]) b.textContent = LABEL[mode];
      b.title = TIP[mode];
    });
  }

  function cycle() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try { localStorage.setItem(KEY, mode); } catch (e) { /* storage unavailable */ }
    applyMode();
  }

  function processText(node) {
    const text = node.data;
    if (!text || !TEST.test(text)) return;
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    const scope = parent.closest(SCOPE) || parent;
    const seenHere = new Set();
    const frag = document.createDocumentFragment();
    let last = 0;
    RX.lastIndex = 0;
    let m;
    while ((m = RX.exec(text))) {
      const idx = m.slice(1).findIndex(g => g !== undefined);
      const word = m[0];
      if (m.index > last) frag.append(text.slice(last, m.index));
      const ruby = document.createElement('ruby');
      ruby.className = 'pn';
      ruby.dataset.w = word;
      ruby.append(word);
      const rt = document.createElement('rt');
      rt.textContent = ENTRIES[idx][1];
      ruby.append(rt);
      if (seenHere.has(word) || scope.querySelector(`ruby.pn[data-w="${word}"]`)) ruby.classList.add('rep');
      seenHere.add(word);
      frag.append(ruby);
      last = m.index + word.length;
    }
    if (last < text.length) frag.append(text.slice(last));
    node.replaceWith(frag);
  }

  function process(node) {
    if (node.nodeType === Node.TEXT_NODE) { processText(node); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || node.closest(SKIP)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(processText);
    if (node.matches('.btn-ruby') || node.querySelector('.btn-ruby')) applyMode();
  }

  function init() {
    applyMode();
    process(document.body);
    new MutationObserver(mutations => {
      for (const mu of mutations) mu.addedNodes.forEach(n => { if (n.isConnected) process(n); });
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', e => {
      if (e.target.closest('.btn-ruby')) { e.stopPropagation(); cycle(); }
    }, true);
  }

  window.Furigana = { cycle, entries: ENTRIES.map(([p, r]) => [p.replace(/\(\?<?[=!][^)]*\)/g, ''), r]) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
