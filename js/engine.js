(function () {
  'use strict';

  const G = window.GAME;
  const META = window.CURRENT_SERIES || {};
  const UI = G.ui || {};
  const SAVE_KEY = META.saveKey || 'shirasagi-save-v1';
  const START_LOC = G.startLocation || G.locationOrder[0];
  const SNOW = META.weather === 'snow';
  const VICTIM = Object.values(G.characters).find(c => c.victim);
  const CALLS_LABEL = `${VICTIM ? VICTIM.short : '被害者'}の呼び方：`;
  const LOG_LIMIT = 300;

  /* ================================================================
   * ユーティリティ
   * ================================================================ */
  const $ = (sel, root = document) => root.querySelector(sel);

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style') e.setAttribute('style', v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const markup = s => esc(s).replace(/\{\{(.+?)\}\}/g, '<span class="hl">$1</span>');
  const resolve = x => (typeof x === 'function' ? x(S) : x) || [];

  function parseLine(ln) {
    if (ln && typeof ln === 'object') return { who: 'card', text: ln.card };
    const m = /^([a-z]+)\|([\s\S]*)$/.exec(ln);
    return m ? { who: m[1], text: m[2] } : { who: 'n', text: ln };
  }

  function speakerOf(who) {
    if (who === 'me') return G.detective;
    return G.characters[who] || null;
  }

  function colorOf(who) {
    const c = speakerOf(who);
    return c ? c.portrait.color : '#8a8f99';
  }

  /* ================================================================
   * 状態とセーブ
   * ================================================================ */
  function fresh() {
    return {
      v: 1, prologueDone: false, location: START_LOC,
      clues: [], flags: [], examined: [], talked: [], seen: [], unread: [],
      visited: [START_LOC], endings: [], log: [], storiesRead: [], pastRead: [], pastClues: [], myst: {}, dprog: {},
    };
  }

  let state = fresh();

  const S = {
    has: id => state.clues.includes(id) || state.flags.includes(id),
  };
  const test = cond => !cond || !!cond(S);

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.v === 1 ? Object.assign(fresh(), data) : null;
    } catch (e) {
      return null;
    }
  }

  function give(id) {
    const c = G.clues[id];
    if (!c || state.clues.includes(id)) return;
    state.clues.push(id);
    state.unread.push(id);
    toast(c.type === 'item' ? '物証を入手' : '証言を記録', c.name, c.type);
    save();
    if (currentScreen === 'game') renderGame();
  }

  function setFlag(f) {
    if (!state.flags.includes(f)) { state.flags.push(f); save(); }
  }

  function pushLog(who, text) {
    state.log.push({ w: who, t: text });
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  }

  /* ================================================================
   * 人物ポートレート（SVGシルエット）
   * ================================================================ */
  let portraitSeq = 0;

  function portraitSVG(c) {
    const p = c.portrait;
    const uid = 'pg' + (++portraitSeq);
    const col = p.color || '#444';
    const skin = '#262b35';
    const suit = '#12151b';
    const hair = p.hairColor || '#111';
    const acc = p.acc || [];
    const rim = `stroke="${col}" stroke-opacity=".75" stroke-width=".8"`;

    let back = '';
    if (p.hair === 'long') back = `<path d="M29 52 Q27 21 50 21 Q73 21 71 52 L75 98 Q50 104 25 98Z" fill="${hair}" ${rim}/>`;
    if (p.hair === 'bob') back = `<path d="M30 66 Q27 25 50 25 Q73 25 70 66 Q60 71 50 70 Q40 71 30 66Z" fill="${hair}" ${rim}/>`;
    if (p.hair === 'bun') back = `<circle cx="50" cy="22" r="9" fill="${hair}" ${rim}/>`;

    let body;
    switch (p.body) {
      case 'dress':
        body = `<path d="M10 120 Q12 92 36 84 Q50 90 64 84 Q88 92 90 120Z" fill="#2a1420" ${rim}/>
          <path d="M37 84 Q50 99 63 84 Q50 90 37 84Z" fill="${skin}"/>`;
        break;
      case 'turtle':
        body = `<path d="M10 120 Q12 92 36 84 L64 84 Q88 92 90 120Z" fill="${p.accent}" ${rim}/>`;
        break;
      case 'maid':
        body = `<path d="M10 120 Q12 92 36 84 Q50 90 64 84 Q88 92 90 120Z" fill="#14121a" ${rim}/>
          <path d="M38 83 L50 93 L62 83 L61 89 L50 98 L39 89Z" fill="#e9e6df"/>
          <path d="M39 101 L43 120 M61 101 L57 120" stroke="#e9e6df" stroke-width="3"/>`;
        break;
      case 'kimono':
        body = `<path d="M8 120 Q10 92 36 83 L50 104 L64 83 Q90 92 92 120Z" fill="${p.accent || '#2a1e24'}" ${rim}/>
          <path d="M36 83 L50 104 L64 83 L60 83 L50 98 L40 83Z" fill="#e6e0d4" opacity=".9"/>
          <path d="M40 83 L50 98 L60 83Z" fill="${skin}"/>
          <path d="M14 111 Q50 106 86 111 L88 120 L12 120Z" fill="#0b0c10" opacity=".75"/>`;
        break;
      case 'chef':
        body = `<path d="M8 120 Q10 92 36 83 L64 83 Q90 92 92 120Z" fill="#a9a59c" ${rim}/>
          <path d="M40 82 L60 82 L59 89 L41 89Z" fill="#c4c0b6"/>
          <path d="M44 89 L58 120" stroke="#77736b" stroke-width="1.2"/>
          <circle cx="54" cy="100" r="1.3" fill="#5f5b54"/><circle cx="56.5" cy="111" r="1.3" fill="#5f5b54"/>`;
        break;
      case 'uniform':
        body = `<path d="M40 82 L60 82 L54 120 L46 120Z" fill="#c9ced8"/>
          <path d="M48 86 L52 86 L53.5 105 L50 109 L46.5 105Z" fill="#1c2433"/>
          <path d="M8 120 Q10 90 36 82 L50 104 L46 120Z" fill="#18202e" ${rim}/>
          <path d="M92 120 Q90 90 64 82 L50 104 L54 120Z" fill="#18202e" ${rim}/>
          <path d="M14 94 L30 87 M86 94 L70 87" stroke="#c9a45c" stroke-width="1.6" opacity=".7"/>
          <rect x="62" y="95" width="5" height="6" rx="1" fill="#c9a45c" opacity=".75"/>`;
        break;
      case 'coat':
        body = `<path d="M38 82 L62 82 L54 120 L46 120Z" fill="#cfcac0"/>
          <path d="M8 120 Q10 90 34 82 L50 104 L46 120Z" fill="#3b3226" ${rim}/>
          <path d="M92 120 Q90 90 66 82 L50 104 L54 120Z" fill="#3b3226" ${rim}/>
          <path d="M34 82 L45 97 L40 106Z M66 82 L55 97 L60 106Z" fill="#4a3f30"/>`;
        break;
      default:
        body = `<path d="M38 82 L62 82 L54 120 L46 120Z" fill="#d9d6cf"/>
          <path d="M8 120 Q10 90 36 82 L50 104 L46 120Z" fill="${suit}" ${rim}/>
          <path d="M92 120 Q90 90 64 82 L50 104 L54 120Z" fill="${suit}" ${rim}/>`;
    }

    const neck = p.body === 'turtle'
      ? `<rect x="43.5" y="62" width="13" height="16" rx="4" fill="${skin}"/><rect x="41" y="70" width="18" height="17" rx="5" fill="${p.accent}" ${rim}/>`
      : `<rect x="43.5" y="62" width="13" height="22" rx="4" fill="${skin}"/>`;
    const head = `<ellipse cx="50" cy="49" rx="16.5" ry="20" fill="${skin}" ${rim}/>`;

    const frontPaths = {
      short: 'M32 50 Q30 26 50 25 Q70 26 68 50 Q66 37 57 35 L50 39 L43 35 Q34 38 32 50Z',
      slick: 'M33.5 46 Q33 27 50 27 Q67 27 66.5 46 Q63 33 47 33 Q38 35 33.5 46Z',
      part: 'M33 48 Q31 26 52 26 Q69 27 67.5 48 Q66 35 55 32 Q41 33 33 48Z',
      long: 'M32.5 47 Q32 25 50 25 Q68 25 67.5 47 Q60 35 52 39 Q45 33 32.5 47Z',
      bob: 'M33 47 Q33 27 50 27 Q67 27 67 47 Q58 37 50 39 Q42 37 33 47Z',
      bun: 'M33.5 50 Q31 28 50 28 Q69 28 66.5 50 Q64 36 50 35 Q36 36 33.5 50Z',
    };
    const front = frontPaths[p.hair] ? `<path d="${frontPaths[p.hair]}" fill="${hair}" ${rim}/>` : '';

    let extra = '';
    if (acc.includes('tie')) extra += `<path d="M48 86 L52 86 L54 106 L50 111 L46 106Z" fill="${p.tieColor || '#333'}"/>`;
    if (acc.includes('bowtie')) extra += `<path d="M42 85 L50 88.5 L58 85 L58 92 L50 88.5 L42 92Z" fill="#050505" stroke="${col}" stroke-opacity=".6" stroke-width=".6"/>`;
    if (acc.includes('pearls')) {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = 38 + 24 * t;
        const y = 85 + 11 * Math.sin(Math.PI * t);
        extra += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" fill="#efe9dc"/>`;
      }
    }
    if (acc.includes('mustache')) extra += `<path d="M42 59 Q46 56.5 50 58.5 Q54 56.5 58 59 Q54 61.5 50 60.5 Q46 61.5 42 59Z" fill="#9aa0a6"/>`;
    if (acc.includes('glasses')) extra += `<g stroke="#cfd6e0" stroke-width="1.3" fill="none" opacity=".85"><circle cx="43" cy="50" r="5"/><circle cx="57" cy="50" r="5"/><path d="M48 50 L52 50"/></g>`;
    if (acc.includes('glasses2')) extra += `<g stroke="#d8c9a8" stroke-width="1.2" fill="none" opacity=".85"><rect x="37" y="46.5" width="11" height="7" rx="1.5"/><rect x="52" y="46.5" width="11" height="7" rx="1.5"/><path d="M48 50 L52 50"/></g>`;
    if (acc.includes('maidcap')) extra += `<path d="M35 31 Q50 20 65 31 L63 34.5 Q50 26 37 34.5Z" fill="#ece8df"/>`;
    if (acc.includes('kanzashi')) {
      extra += '<path d="M40 31 L66 17" stroke="#c9a45c" stroke-width="1.3"/>';
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * 2 * i / 5 - Math.PI / 2;
        extra += `<circle cx="${(62 + 3 * Math.cos(a)).toFixed(1)}" cy="${(21 + 3 * Math.sin(a)).toFixed(1)}" r="2.6" fill="#b3202e"/>`;
      }
      extra += '<circle cx="62" cy="21" r="1.4" fill="#e8c860"/>';
    }
    if (p.body === 'uniform') {
      extra += `<path d="M33 34 Q34 22 50 21 Q66 22 67 34Z" fill="#141a26" ${rim}/>
        <rect x="33" y="31" width="34" height="3.5" fill="#c9a45c" opacity=".65"/>
        <path d="M33 34 Q50 40 67 34Z" fill="#0a0d14"/>
        <circle cx="50" cy="26.5" r="2.2" fill="#c9a45c"/>`;
    }
    if (acc.includes('hat')) {
      extra += `<path d="M35 34 Q35 15 50 14 Q65 15 65 34Z" fill="#1d1a15" ${rim}/>
        <rect x="35" y="27" width="30" height="4.5" fill="#3a2f22"/>
        <ellipse cx="50" cy="34" rx="25" ry="4.5" fill="#15130f" ${rim}/>`;
    }
    if (c.victim) extra += `<path d="M72 0 L84 0 L100 16 L100 28Z" fill="#050505" opacity=".9"/>`;

    return `<svg viewBox="0 0 100 120" class="portrait-svg${c.victim ? ' deceased' : ''}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><radialGradient id="${uid}" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="${col}" stop-opacity=".95"/><stop offset="1" stop-color="#07080b"/></radialGradient></defs>
      <rect width="100" height="120" fill="url(#${uid})"/>
      ${back}${body}${neck}${head}${front}${extra}
    </svg>`;
  }

  /* ================================================================
   * 画面切り替え・演出
   * ================================================================ */
  let currentScreen = 'title';

  function showScreen(name) {
    currentScreen = name;
    for (const s of ['title', 'scenario', 'past', 'stories', 'reader', 'game', 'deduce', 'ending']) {
      $('#screen-' + s).classList.toggle('active', s === name);
    }
    document.body.dataset.screen = name;
    renderSteppers();
  }

  function flash() {
    const f = $('#flash');
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
    if (!SNOW) Sound.thunder();
  }

  function shake() {
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 500);
  }

  function toast(label, name, type) {
    const t = h('div', { class: 'toast ' + (type || '') },
      h('span', { class: 'toast-label' }, label),
      h('span', { class: 'toast-name' }, name));
    const box = $('#toasts');
    box.append(t);
    while (box.children.length > 2) box.firstElementChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  function setStaged(on) {
    $('#dialogue').classList.toggle('staged', on);
    document.body.classList.toggle('staged', on);
  }

  function setStage(bg, label) {
    const st = $('#dlg-stage');
    st.className = 'dlg-stage stage-' + (bg || 'black');
    $('#stage-art').innerHTML = (META.artStages || []).includes(bg) ? META.art : '';
    $('#stage-label').textContent = label || '';
  }

  /* ================================================================
   * 会話ウィンドウ
   * ================================================================ */
  function parseSegs(text) {
    const out = [];
    const re = /\{\{(.+?)\}\}/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: Array.from(text.slice(last, m.index)) });
      out.push({ t: Array.from(m[1]), hl: true });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ t: Array.from(text.slice(last)) });
    return out;
  }

  function renderSegs(segs, n) {
    let html = '';
    let left = n;
    for (const s of segs) {
      if (left <= 0) break;
      const piece = s.t.slice(0, left).join('');
      left -= s.t.length;
      html += s.hl ? `<span class="hl">${esc(piece)}</span>` : esc(piece);
    }
    return html;
  }

  const Dlg = {
    lines: [], i: 0, done: null, typing: false, timer: null, segs: [], total: 0, n: 0, active: false,

    play(lines, done) {
      this.lines = resolve(lines).slice();
      this.i = 0;
      this.done = done || null;
      this.active = true;
      $('#dialogue').classList.remove('hidden');
      this.step();
    },

    step() {
      while (this.i < this.lines.length) {
        const ln = this.lines[this.i++];
        if (ln && typeof ln === 'object' && !('card' in ln)) { this.action(ln); continue; }
        this.show(ln);
        return;
      }
      this.finish();
    },

    action(a) {
      if ('bg' in a) {
        setStaged(true);
        setStage(a.bg, a.label);
      }
      if (a.give) [].concat(a.give).forEach(give);
      if (a.pgive) [].concat(a.pgive).forEach(givePast);
      if (a.set) [].concat(a.set).forEach(setFlag);
      if (a.fx === 'flash') flash();
      if (a.fx === 'shake') shake();
    },

    show(ln) {
      const { who, text } = parseLine(ln);
      const box = $('#dlg-box');
      const kind = who === 'card' ? 'card' : who === 'n' ? 'narr' : who === 'me' ? 'me' : 'char';
      box.className = 'dlg-box kind-' + kind;
      const sp = speakerOf(who);
      $('#dlg-name').textContent = sp ? sp.name : '';
      if (sp) $('#dlg-name').style.setProperty('--who', sp.portrait.color);
      else $('#dlg-name').style.removeProperty('--who');
      $('#dlg-portrait').innerHTML = sp ? portraitSVG(sp) : '';
      pushLog(who, text);

      this.segs = parseSegs(text);
      this.total = this.segs.reduce((a, s) => a + s.t.length, 0);
      this.n = 0;
      $('#dlg-text').innerHTML = '';
      this.typing = true;
      clearInterval(this.timer);
      const speed = kind === 'card' ? 45 : 18;
      this.timer = setInterval(() => {
        this.n += 1;
        if (this.n >= this.total) this.complete();
        else $('#dlg-text').innerHTML = renderSegs(this.segs, this.n);
      }, speed);
    },

    complete() {
      clearInterval(this.timer);
      this.typing = false;
      $('#dlg-text').innerHTML = renderSegs(this.segs, Infinity);
      $('#dlg-box').classList.add('ready');
    },

    advance() {
      if (!this.active) return;
      if (this.typing) { this.complete(); return; }
      this.step();
    },

    skip() {
      if (!this.active) return;
      clearInterval(this.timer);
      while (this.i < this.lines.length) {
        const ln = this.lines[this.i++];
        if (ln && typeof ln === 'object' && !('card' in ln)) this.action(ln);
        else { const p = parseLine(ln); pushLog(p.who, p.text); }
      }
      this.finish();
    },

    finish() {
      clearInterval(this.timer);
      this.active = false;
      this.typing = false;
      $('#dialogue').classList.add('hidden');
      setStaged(false);
      save();
      const d = this.done;
      this.done = null;
      if (d) d();
    },
  };

  /* ================================================================
   * モーダル
   * ================================================================ */
  let modalOnClose = null;
  let modalClosable = true;

  function openModal(node, opts = {}) {
    const card = $('#modal-card');
    const wasOpen = !$('#modal').classList.contains('hidden');
    const keepTop = opts.keepScroll && wasOpen ? card.scrollTop : 0;
    card.className = 'modal-card ' + (opts.cls || '');
    card.innerHTML = '';
    card.append(node);
    card.scrollTop = keepTop;
    $('#modal').classList.remove('hidden');
    modalOnClose = opts.onClose || null;
    modalClosable = opts.closable !== false;
  }

  function closeModal(runCallback) {
    $('#modal').classList.add('hidden');
    $('#modal-card').innerHTML = '';
    const cb = modalOnClose;
    modalOnClose = null;
    if (runCallback && cb) cb();
  }

  function confirmBox(title, body, buttons) {
    const node = h('div', { class: 'confirm' },
      h('h3', { class: 'confirm-title' }, title),
      typeof body === 'string' ? h('div', { class: 'confirm-body', html: body }) : body,
      h('div', { class: 'confirm-actions' }, buttons.map(b =>
        h('button', { class: 'btn ' + (b.cls || ''), onclick: () => { closeModal(); b.onClick && b.onClick(); } }, b.label))));
    openModal(node, { cls: 'confirm-modal' });
  }

  /* ================================================================
   * 捜査画面
   * ================================================================ */
  function pendingCount(locId) {
    const loc = G.locations[locId];
    return loc.hotspots.filter(hs => test(hs.req) && !state.examined.includes(locId + ':' + hs.id)).length;
  }

  function hasNewTopics(cid) {
    if (!state.talked.includes(cid)) return true;
    return G.dialogues[cid].topics.some(t => test(t.req) && !state.seen.includes(cid + ':' + t.id));
  }

  function renderGame() {
    const loc = G.locations[state.location];
    $('#loc-label').textContent = loc.floor + '　' + loc.name;
    renderMap();
    renderScene();
    renderNotebook();
    renderSteppers();
    $('#btn-deduce').textContent = getProgress('case') ? '推理の続きへ' : '推理を披露する';
  }

  function renderMap() {
    let svg = `<svg viewBox="0 0 400 300" class="map-svg" role="img" aria-label="${esc(UI.mapTitle || '見取り図')}">`;
    svg += '<rect x="6" y="6" width="388" height="288" rx="8" class="map-frame"/>';
    if (UI.mapCompass) {
      const top = UI.mapCompass.startsWith('▲');
      svg += `<text x="200" y="${top ? 15 : 298}" class="map-compass" text-anchor="middle">${esc(UI.mapCompass)}</text>`;
    }
    for (const r of G.map) {
      const cls = ['room'];
      if (r.loc === state.location) cls.push('current');
      if (state.visited.includes(r.loc)) cls.push('visited');
      if (r.outdoor) cls.push('outdoor');
      const pend = pendingCount(r.loc);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2 + 4;
      svg += `<g class="${cls.join(' ')}" data-loc="${r.loc}" tabindex="0">`;
      svg += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4"/>`;
      svg += `<text x="${cx}" y="${cy}" text-anchor="middle">${esc(r.label)}</text>`;
      if (pend > 0) svg += `<circle class="pend" cx="${r.x + r.w - 9}" cy="${r.y + 9}" r="5.5"/><text class="pend-n" x="${r.x + r.w - 9}" y="${r.y + 12}" text-anchor="middle">${pend}</text>`;
      svg += '</g>';
    }
    svg += '</svg>';
    const mapEl = $('#map');
    mapEl.innerHTML = svg;

    const list = $('#loc-list');
    list.innerHTML = '';
    for (const id of G.locationOrder) {
      const loc = G.locations[id];
      const pend = pendingCount(id);
      list.append(h('li', {},
        h('button', { class: 'loc-btn' + (id === state.location ? ' current' : ''), onclick: () => goTo(id) },
          h('span', { class: 'loc-btn-name' }, loc.name),
          pend > 0 ? h('span', { class: 'loc-btn-pend' }, '未調査 ' + pend) : h('span', { class: 'loc-btn-done' }, '調査済'))));
    }
  }

  function goTo(id) {
    if (!G.locations[id]) return;
    state.location = id;
    if (!state.visited.includes(id)) state.visited.push(id);
    save();
    renderGame();
    const scene = $('.pane-scene');
    if (scene) scene.scrollTop = 0;
  }

  function personChip(cid) {
    const c = G.characters[cid];
    return h('button', { class: 'person-chip', onclick: () => openTalk(cid) },
      h('span', { class: 'chip-portrait', html: portraitSVG(c) }),
      h('span', { class: 'chip-name' }, c.short),
      hasNewTopics(cid) && h('span', { class: 'tag-new' }, 'NEW'));
  }

  function renderScene() {
    const loc = G.locations[state.location];
    const root = $('#scene');
    root.innerHTML = '';
    const visible = loc.hotspots.filter(hs => test(hs.req));
    root.append(
      h('div', { class: 'scene-head bg-' + loc.bg },
        h('div', { class: 'scene-floor' }, loc.floor),
        h('h2', { class: 'scene-name' }, loc.name)),
      h('p', { class: 'scene-desc' }, loc.desc),
      h('h3', { class: 'section-title' }, '調べる'),
      h('div', { class: 'hotspots' }, visible.map(hs => {
        const done = state.examined.includes(state.location + ':' + hs.id);
        return h('button', { class: 'hotspot' + (done ? ' done' : ''), onclick: () => examine(state.location, hs) },
          h('span', { class: 'hs-mark' }, done ? '✓' : '?'),
          h('span', { class: 'hs-label' }, hs.label),
          done && hs.clue ? h('span', { class: 'hs-clue' }, G.clues[hs.clue].name) : null);
      })),
    );
    if (loc.people) {
      root.append(
        h('h3', { class: 'section-title' }, 'ここにいる人物'),
        h('div', { class: 'people-row' }, G.suspects.map(personChip)));
    } else {
      root.append(h('p', { class: 'scene-hint' }, UI.gatherHint));
    }
  }

  function examine(locId, hs) {
    const key = locId + ':' + hs.id;
    if (!state.examined.includes(key)) state.examined.push(key);
    const lines = resolve(hs.lines).slice();
    if (hs.clue) lines.push({ give: hs.clue });
    save();
    Dlg.play(lines, renderGame);
  }

  /* ---------------- 捜査手帳 ---------------- */
  let nbTab = 'items';
  let nbRenderedTab = null;
  let nbFresh = new Set();
  const TAB_TYPE = { items: 'item', testimony: 'testimony' };

  function openNbTab(id) {
    nbTab = id;
    const type = TAB_TYPE[id];
    nbFresh = new Set(type ? state.unread.filter(cid => G.clues[cid].type === type) : []);
    if (type) {
      state.unread = state.unread.filter(cid => G.clues[cid].type !== type);
      save();
    }
    renderNotebook();
  }

  function renderNotebook() {
    const unreadOf = type => state.unread.filter(id => G.clues[id] && G.clues[id].type === type).length;
    const tabs = [
      ['items', '物証', unreadOf('item')],
      ['testimony', '証言', unreadOf('testimony')],
      ['people', '人物', G.suspects.filter(hasNewTopics).length],
      ['timeline', '時系列', 0],
      ['mysteries', '謎メモ', 0],
    ];
    const tabsEl = $('#nb-tabs');
    tabsEl.innerHTML = '';
    for (const [id, label, badge] of tabs) {
      tabsEl.append(h('button', { class: 'nb-tab' + (nbTab === id ? ' on' : ''), onclick: () => openNbTab(id) },
        label, badge ? h('span', { class: 'badge' }, String(badge)) : null));
    }

    const body = $('#nb-body');
    const keepTop = nbRenderedTab === nbTab ? body.scrollTop : 0;
    body.innerHTML = '';
    nbRenderedTab = nbTab;
    requestAnimationFrame(() => { body.scrollTop = keepTop; });
    if (TAB_TYPE[nbTab]) {
      const type = TAB_TYPE[nbTab];
      const ids = state.clues.filter(id => G.clues[id].type === type).slice().reverse();
      if (!ids.length) body.append(h('p', { class: 'empty' }, type === 'item' ? `まだ物証はない。${UI.place}の中を調べよう。` : 'まだ証言はない。関係者に話を聞こう。'));
      for (const id of ids) body.append(clueCard(id, nbFresh.has(id) || state.unread.includes(id)));
    } else if (nbTab === 'people') {
      for (const cid of G.characterOrder) body.append(personCard(cid));
    } else if (nbTab === 'timeline') {
      renderTimeline(body);
    } else {
      renderMysteries(body);
    }
  }

  function clueCard(id, isNew) {
    const c = G.clues[id];
    const by = c.by ? G.characters[c.by] : null;
    return h('div', { class: 'clue-card ' + c.type },
      h('div', { class: 'clue-head' },
        by ? h('span', { class: 'clue-by', html: portraitSVG(by) }) : h('span', { class: 'clue-icon' }, '物'),
        h('span', { class: 'clue-name' }, c.name),
        isNew ? h('span', { class: 'tag-new' }, 'NEW') : null),
      by ? h('div', { class: 'clue-speaker' }, by.name + 'の証言') : null,
      h('p', { class: 'clue-desc' }, c.desc));
  }

  function personCard(cid) {
    const c = G.characters[cid];
    const talked = state.talked.includes(cid);
    const notes = (c.notes || []).filter(n => test(n.req));
    const pm = G.pastMysteries.find(m => m.char === cid);
    return h('div', { class: 'person-card' + (c.victim ? ' victim' : '') },
      h('div', { class: 'pc-top' },
        h('div', { class: 'pc-portrait', html: portraitSVG(c) }),
        h('div', { class: 'pc-info' },
          h('div', { class: 'pc-name' }, c.name, h('span', { class: 'pc-age' }, c.age + '歳')),
          h('div', { class: 'pc-kana' }, c.kana),
          h('div', { class: 'pc-role' }, c.role),
          c.calls && talked ? h('div', { class: 'pc-calls' }, CALLS_LABEL + c.calls) : null,
          c.victim ? h('div', { class: 'pc-dead' }, '故人') : null)),
      h('p', { class: 'pc-profile' }, c.profile),
      notes.length ? h('ul', { class: 'pc-notes' }, notes.map(n => h('li', {}, n.text))) : null,
      pm && mystSolved(pm.id) ? h('button', { class: 'pc-myst', onclick: () => openMystery(pm.id) },
        h('span', { class: 'pc-myst-label' }, `来歴の謎「${pm.title}」`), mystAnswer(pm)) : null,
      h('div', { class: 'pc-actions' },
        c.victim ? null : h('button', { class: 'btn small accent pc-talk', onclick: () => openTalk(cid) },
          '話を聞く', hasNewTopics(cid) ? h('span', { class: 'tag-new' }, 'NEW') : null),
        h('button', { class: 'btn small ghost pc-story', onclick: () => openReader('past', storyIndexOf('past', cid), 'game') }, '来歴'),
        h('button', { class: 'btn small ghost pc-story', onclick: () => openReader('day', storyIndexOf('day', cid), 'game') }, '当日')));
  }

  function renderTimeline(body) {
    const items = G.timeline.filter(e => test(e.req));
    const ol = h('ol', { class: 'timeline' });
    for (const e of items) {
      ol.append(h('li', {},
        h('span', { class: 'tl-time' }, e.t),
        h('span', { class: 'tl-dot', style: 'background:' + colorOf(e.who) }),
        h('span', { class: 'tl-text' }, resolve(e.text))));
    }
    body.append(ol, h('p', { class: 'nb-foot' }, '※ 物証や証言を集めると、空白の時間が埋まっていく。'));
  }

  function renderMysteries(body) {
    for (const m of G.mysteries) {
      if (!test(m.show)) continue;
      const got = m.ids.filter(S.has).length;
      const solved = got === m.ids.length;
      const status = solved ? '解明' : got ? `調査中 ${got}/${m.ids.length}` : '未解明';
      body.append(h('div', { class: 'mystery' + (solved ? ' solved' : '') },
        h('div', { class: 'my-head' },
          h('span', { class: 'my-q' }, m.q),
          h('span', { class: 'my-status' }, status)),
        h('p', { class: 'my-body' }, solved ? m.done : 'ヒント：' + m.hint)));
    }
  }

  /* ================================================================
   * 聞き込み
   * ================================================================ */
  function openTalk(cid) {
    closeModal();
    if (!state.talked.includes(cid)) {
      state.talked.push(cid);
      save();
      Dlg.play(G.dialogues[cid].intro, () => { renderGame(); renderTalk(cid); });
    } else {
      renderTalk(cid);
    }
  }

  function renderTalk(cid) {
    const c = G.characters[cid];
    const d = G.dialogues[cid];
    const topics = d.topics.filter(t => test(t.req));
    const node = h('div', { class: 'talk' },
      h('div', { class: 'talk-side' },
        h('div', { class: 'talk-portrait', html: portraitSVG(c) }),
        h('div', { class: 'talk-name' }, c.name),
        h('div', { class: 'talk-role' }, c.role),
        c.calls ? h('div', { class: 'talk-calls' }, CALLS_LABEL + c.calls) : null,
        h('div', { class: 'talk-story-row' },
          h('button', { class: 'btn tiny ghost', onclick: () => openReader('past', storyIndexOf('past', cid), 'game') }, '来歴を読む'),
          h('button', { class: 'btn tiny ghost', onclick: () => openReader('day', storyIndexOf('day', cid), 'game') }, '当日の物語'))),
      h('div', { class: 'talk-main' },
        h('h3', { class: 'section-title' }, '話題を選ぶ'),
        h('div', { class: 'topics' }, topics.map(t => {
          const seen = state.seen.includes(cid + ':' + t.id);
          return h('button', { class: 'topic' + (seen ? ' seen' : ''), onclick: () => playTopic(cid, t) },
            h('span', { class: 'topic-label' }, t.label),
            seen ? h('span', { class: 'topic-seen' }, '聞いた') : h('span', { class: 'tag-new' }, 'NEW'));
        })),
        h('p', { class: 'talk-tip' }, '証言の矛盾や隠し事に気づいたら、物証・証言を突きつけよう。'),
        h('div', { class: 'talk-actions' },
          h('button', {
            class: 'btn accent',
            onclick: () => openPicker({
              title: c.short + 'に証拠をつきつける',
              prompt: '突きつける物証・証言を選んでください。',
              onPick: id => present(cid, id),
              onCancel: () => renderTalk(cid),
            }),
          }, '証拠をつきつける'),
          h('button', { class: 'btn ghost', onclick: () => { closeModal(); renderGame(); } }, '話を終える'))));
    openModal(node, { cls: 'talk-modal', onClose: renderGame });
  }

  function playTopic(cid, t) {
    const key = cid + ':' + t.id;
    if (!state.seen.includes(key)) state.seen.push(key);
    closeModal();
    Dlg.play(resolve(t.lines), () => { renderGame(); renderTalk(cid); });
  }

  function present(cid, clueId) {
    const d = G.dialogues[cid];
    const clue = G.clues[clueId];
    const r = d.present[clueId];
    const intro = `あなたは「{{${clue.name}}}」を突きつけた。`;
    const lines = r && test(r.req) ? [intro, ...resolve(r.lines)] : [intro, ...resolve(d.noReaction)];
    Dlg.play(lines, () => { renderGame(); renderTalk(cid); });
  }

  /* ---------------- 証拠選択 ---------------- */
  function openPicker({ title, prompt, onPick, onCancel, confirmLabel = 'つきつける', pool = CASE_POOL }) {
    let tab = pool.tabs[0][0];
    let sel = null;
    const finish = () => {
      if (!sel) return;
      const id = sel;
      closeModal();
      onPick(id);
    };
    const cancel = () => {
      closeModal();
      if (onCancel) onCancel();
    };
    let grid = null;
    let detail = null;
    let confirmBtn = null;

    const detailFor = id => {
      const c = id ? pool.get(id) : null;
      return c
        ? h('div', { class: 'pick-detail' },
          h('div', { class: 'pick-detail-name' }, c.type === 'record' ? `${G.characters[c.by].name}の来歴` : c.name),
          c.sub ? h('div', { class: 'pick-detail-sub' }, c.sub) : null,
          h('p', {}, c.desc))
        : h('div', { class: 'pick-detail empty' }, '一覧から選択してください。');
    };

    const select = id => {
      sel = id;
      grid.querySelectorAll('.pick-card').forEach(el => el.classList.toggle('sel', el.dataset.id === id));
      const next = detailFor(id);
      detail.replaceWith(next);
      detail = next;
      confirmBtn.disabled = !sel;
    };

    const render = () => {
      const owned = pool.owned().filter(id => pool.get(id));
      let list = owned.filter(id => pool.get(id).type === tab);
      if (pool.group) list = list.slice().sort((a, b) => G.characterOrder.indexOf(pool.get(a).by) - G.characterOrder.indexOf(pool.get(b).by));
      const countOf = type => owned.filter(id => pool.get(id).type === type).length;
      const cards = [];
      let lastBy = null;
      for (const id of list) {
        const c = pool.get(id);
        const by = c.by ? G.characters[c.by] : null;
        if (pool.group && c.by !== lastBy) {
          cards.push(h('div', { class: 'pick-group' }, by ? by.name : ''));
          lastBy = c.by;
        }
        cards.push(h('button', {
          class: 'pick-card' + (sel === id ? ' sel' : ''),
          'data-id': id,
          onclick: () => select(id),
          ondblclick: () => { select(id); finish(); },
        },
        by ? h('span', { class: 'pick-by', html: portraitSVG(by) }) : h('span', { class: 'clue-icon' }, '物'),
        h('span', { class: 'pick-name' }, c.name)));
      }
      grid = h('div', { class: 'pick-grid' }, cards.length ? cards : h('p', { class: 'empty' }, 'まだ何もない。'));
      detail = detailFor(sel);
      confirmBtn = h('button', { class: 'btn primary', disabled: !sel, onclick: finish }, confirmLabel);
      const node = h('div', { class: 'picker' },
        h('h3', { class: 'picker-title' }, title),
        prompt ? h('p', { class: 'picker-prompt' }, prompt) : null,
        h('div', { class: 'pick-tabs' }, pool.tabs.map(([k, l]) =>
          h('button', { class: 'pick-tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; sel = null; render(); } }, `${l}（${countOf(k)}）`))),
        h('div', { class: 'pick-body' }, grid, detail),
        h('div', { class: 'pick-actions' },
          confirmBtn,
          h('button', { class: 'btn ghost', onclick: cancel }, 'やめる')));
      openModal(node, { cls: 'picker-modal', onClose: () => { if (onCancel) onCancel(); } });
    };
    render();
  }

  /* ================================================================
   * 推理パート
   * ================================================================ */
  const D = { mode: 'case', def: null, step: 0, cred: 5, mistakes: 0, restored: [], presented: [], preShown: -1, asking: false, active: false };

  function caseDef() {
    return {
      mode: 'case', title: '終章　推理', abortLabel: '調査に戻る', pickTitle: '証拠をつきつける',
      credibility: G.deduction.credibility, intro: G.deduction.intro, steps: G.deduction.steps, pool: CASE_POOL,
    };
  }

  function pastDef(m) {
    const c = G.characters[m.char];
    return {
      mode: 'past', mystery: m, title: `第一章　人物の謎 ― ${m.title}`, abortLabel: '来歴に戻る', pickTitle: '手がかりをつきつける',
      credibility: PAST_CRED, pool: PAST_POOL,
      intro: [{ card: `人物の謎　${m.title}` }, m.q, 'me|来歴手帳に集めた手がかりを、ひとつずつ照らし合わせていこう。'],
      steps: m.steps.map((s, i) => Object.assign({ act: `${c.short}の謎　第${KANJI_NUM[i]}段` }, s)),
    };
  }

  /* 推理の進み具合（答えた段・信頼度・再構築した真相）は、段を答えるたびに保存する */
  const progKey = def => (def.mode === 'case' ? 'case' : def.mystery.id);
  const getProgress = key => { const p = state.dprog[key]; return p && p.step > 0 ? p : null; };

  function saveProgress() {
    if (!D.def) return;
    state.dprog[progKey(D.def)] = {
      step: D.step, cred: D.cred, mistakes: D.mistakes,
      restored: D.restored.slice(), presented: D.presented.slice(),
    };
    save();
  }

  function clearProgress(key) {
    delete state.dprog[key];
    save();
  }

  function beginDeduction(def, opts = {}) {
    const key = progKey(def);
    if (opts.fresh) delete state.dprog[key];
    const p = getProgress(key);
    Object.assign(D, {
      def, mode: def.mode,
      step: p ? Math.min(p.step, def.steps.length) : 0,
      cred: p && p.cred > 0 ? p.cred : def.credibility,
      mistakes: p ? p.mistakes : 0,
      restored: p ? p.restored.slice() : [],
      presented: p ? p.presented.slice() : [],
      preShown: -1, asking: false, active: true,
    });
    if (def.mode === 'case') navBack = null;
    stopReader();
    closeModal();
    $('#deduce-brand').textContent = def.title;
    $('#btn-abort').textContent = def.abortLabel;
    showScreen('deduce');
    renderDeduce();
    const intro = p
      ? [{ card: def.mode === 'case' ? '推理再開' : `人物の謎　${def.mystery.title}` },
        `前回の推理の続きから再開する。（全${def.steps.length}段のうち、${D.step}段まで再構築済み）`]
      : def.intro;
    Dlg.play(intro, runStep);
  }

  function pastSolved() {
    const m = D.def.mystery;
    const ms = mystState(m.id);
    ms.solved = true;
    ms.mistakes = D.mistakes;
    D.active = false;
    clearProgress(m.id);
    const presented = D.presented.slice();
    Dlg.play([{ card: `解明　${m.title}` }], () => {
      openPast();
      toast('人物の謎を解明', m.title, 'myst');
      showMysteryReveal(m, true, presented);
    });
  }

  function pastCollapse() {
    const ms = mystState(D.def.mystery.id);
    ms.tries += 1;
    D.active = false;
    save();
    Dlg.play([
      '推理は行き詰まった。手がかりと答えが、どうしても噛み合わない。',
      'まだ記録していない手がかりがあるのかもしれない。来歴を読み直し、思い出の品を調べ、手帳を見直そう。',
      D.step > 0 ? `――ここまでに解いた${D.step}段の推理は保存された。次は信頼度を回復し、続きから挑める。` : '――次は、信頼度を回復して挑み直せる。',
    ], () => openPast());
  }

  function keyProgress() {
    const got = G.keyGroups.filter(g => g.ids.some(S.has)).length;
    return { got, total: G.keyGroups.length };
  }

  function missingHints(max) {
    return G.keyGroups.filter(g => !g.ids.some(S.has)).slice(0, max).map(g => g.hint);
  }

  function confirmDeduction() {
    const { got, total } = keyProgress();
    const pct = Math.round(got / total * 100);
    const body = h('div', {},
      h('p', {}, UI.deduceIntro),
      h('div', { class: 'ready-meter' },
        h('div', { class: 'ready-label' }, `推理に必要な手がかり：${got} / ${total}`),
        h('div', { class: 'ready-bar' }, h('div', { class: 'ready-fill', style: `width:${pct}%` }))),
      got < total ? h('p', { class: 'warn' }, '手がかりが足りないと、真相にたどり着けないかもしれません。') : h('p', { class: 'ok' }, '必要な手がかりは揃っているようだ。'),
      progressNote(getProgress('case'), G.deduction.steps),
      h('ul', { class: 'rules' },
        h('li', {}, '誤った証拠や答えを示すと「信頼度」が減ります。0になると推理は失敗します。'),
        h('li', {}, '犯人の指名は一度きり。間違えれば取り返しはつきません。'),
        h('li', {}, '推理の途中で調査に戻ることもできます。答えた段までの推理は保存され、続きから再開できます。')));
    const p = getProgress('case');
    confirmBox(p ? '推理を再開しますか？' : '推理を披露しますか？', body, p ? [
      { label: '続きから推理する', cls: 'primary', onClick: startDeduction },
      { label: '最初から推理し直す', onClick: () => beginDeduction(caseDef(), { fresh: true }) },
      { label: 'まだ調査を続ける', cls: 'ghost' },
    ] : [
      { label: '推理を始める', cls: 'primary', onClick: startDeduction },
      { label: 'まだ調査を続ける', cls: 'ghost' },
    ]);
  }

  function progressNote(p, steps) {
    if (!p) return null;
    return h('div', { class: 'progress-note' },
      h('div', { class: 'pn-label' }, `前回の推理：全${steps.length}段のうち ${p.step}段まで再構築済み`),
      h('ol', { class: 'restored small' }, p.restored.map(t => h('li', {}, t))));
  }

  function startDeduction() {
    beginDeduction(caseDef());
  }

  function runStep() {
    const st = D.def.steps[D.step];
    D.asking = false;
    if (!st) {
      if (D.mode === 'case') trueEnding();
      else pastSolved();
      return;
    }
    renderDeduce();
    if (st.pre && D.preShown !== D.step) {
      D.preShown = D.step;
      Dlg.play(st.pre, askStep);
    } else {
      askStep();
    }
  }

  function askStep() {
    D.asking = true;
    renderDeduce();
  }

  function renderDeduce() {
    if (!D.def) return;
    const steps = D.def.steps;
    const max = D.def.credibility;
    const hearts = $('#cred');
    hearts.innerHTML = '';
    for (let i = 0; i < max; i++) hearts.append(h('span', { class: 'heart' + (i < D.cred ? ' on' : '') }, i < D.cred ? '◆' : '◇'));

    const pct = Math.round(D.step / steps.length * 100);
    $('#deduce-progress').innerHTML = '';
    $('#deduce-progress').append(
      h('div', { class: 'dp-label' }, `真相の再構築　${D.step} / ${steps.length}`),
      h('div', { class: 'dp-bar' }, h('div', { class: 'dp-fill', style: `width:${pct}%` })));

    const list = $('#restored-list');
    list.innerHTML = '';
    if (!D.restored.length) list.append(h('li', { class: 'empty' }, 'まだ何も明らかになっていない。'));
    D.restored.forEach((t, i) => list.append(h('li', { class: i === D.restored.length - 1 ? 'fresh' : '' }, t)));

    const q = $('#dq');
    q.innerHTML = '';
    const st = steps[D.step];
    if (!st || !D.asking) {
      q.append(h('p', { class: 'dq-wait' }, '……'));
      return;
    }
    q.append(h('div', { class: 'dq-act' }, st.act), h('h2', { class: 'dq-q' }, st.q));

    if (st.type === 'evidence') {
      q.append(h('button', {
        class: 'btn primary big',
        onclick: () => openPicker({ title: D.def.pickTitle, prompt: st.q, onPick: answer, pool: D.def.pool }),
      }, D.def.pickTitle));
    } else if (st.type === 'choice') {
      q.append(h('div', { class: 'dq-options' }, st.options.map((o, i) =>
        h('button', { class: 'btn option', onclick: () => answer(i) }, o))));
    } else if (st.type === 'accuse') {
      q.append(
        h('p', { class: 'dq-note' }, '指名は一度きり。慎重に選べ。'),
        h('div', { class: 'accuse-grid' }, G.suspects.map(cid => {
          const c = G.characters[cid];
          return h('button', {
            class: 'accuse-card',
            onclick: () => confirmBox('犯人を指名する', `<p><strong>${esc(c.name)}</strong>を犯人として告発しますか？</p><p class="warn">この選択は取り消せません。</p>`, [
              { label: '告発する', cls: 'danger', onClick: () => answer(cid) },
              { label: '考え直す', cls: 'ghost' },
            ]),
          },
          h('span', { class: 'ac-portrait', html: portraitSVG(c) }),
          h('span', { class: 'ac-name' }, c.name),
          h('span', { class: 'ac-role' }, c.role));
        })));
    }
    if (D.mode === 'past') {
      const m = D.def.mystery;
      const ms = mystState(m.id);
      q.append(h('div', { class: 'dq-hint' },
        ms.hinted ? m.hints.slice(0, ms.hinted).map((t, i) => h('p', {}, h('strong', {}, `ヒント${i + 1}：`), t)) : null,
        ms.hinted < m.hints.length ? h('button', { class: 'btn small ghost', onclick: () => { ms.hinted += 1; save(); renderDeduce(); } }, `ヒントを見る（${ms.hinted + 1}/${m.hints.length}）`) : null));
    }
  }

  function answer(val) {
    const st = D.def.steps[D.step];
    const ok = st.type === 'evidence' ? st.answer.includes(val) : val === st.correct;
    const nameOf = id => D.def.pool.get(id).name;
    D.asking = false;
    renderDeduce();

    if (ok) {
      const lines = resolve(st.ok).slice();
      if (st.type === 'evidence') {
        lines.unshift(`あなたは「{{${nameOf(val)}}}」を突きつけた。`);
        D.presented.push(val);
      }
      Dlg.play(lines, () => {
        D.restored.push(st.truth);
        D.step += 1;
        if (D.step < D.def.steps.length) saveProgress();
        runStep();
      });
      return;
    }

    if (st.type === 'accuse') {
      const w = G.deduction.wrongAccuse;
      const lines = [`me|犯人は――あなたです。{{${G.characters[val].name}}}さん。`, ...w[val], ...w.common];
      Dlg.play(lines, () => badEnding('accuse', val));
      return;
    }

    D.cred -= 1;
    D.mistakes += 1;
    saveProgress();
    shake();
    renderDeduce();
    const intro = st.type === 'evidence'
      ? `あなたは「{{${nameOf(val)}}}」を突きつけた。`
      : `あなたは「{{${st.options[val]}}}」と答えた。`;
    Dlg.play([intro, ...resolve(st.ng), `――信頼度が下がった。（残り ${D.cred}）`], () => {
      if (D.cred > 0) askStep();
      else if (D.mode === 'case') Dlg.play(G.deduction.collapse, () => badEnding('collapse'));
      else pastCollapse();
    });
  }

  function abortDeduction() {
    const kept = D.step > 0
      ? `<p class="ok">ここまでに解いた推理（全${D.def.steps.length}段のうち${D.step}段）は保存されます。<br>あとで続きから再開できます。</p>`
      : '<p class="muted">まだ解いた段はありません。</p>';
    if (D.mode === 'past') {
      confirmBox('第一章に戻りますか？', `<p>推理を中断して第一章「来歴」に戻ります。</p>${kept}`, [
        { label: '来歴に戻る', cls: 'primary', onClick: () => { D.active = false; openPast(); } },
        { label: '推理を続ける', cls: 'ghost' },
      ]);
      return;
    }
    confirmBox('調査に戻りますか？', `<p>推理を中断して${UI.place}の調査に戻ります。</p>${kept}`, [
      { label: '調査に戻る', cls: 'primary', onClick: backToInvestigation },
      { label: '推理を続ける', cls: 'ghost' },
    ]);
  }

  function backToInvestigation() {
    D.active = false;
    navBack = null;
    stopReader();
    showScreen('game');
    renderGame();
  }

  /* ================================================================
   * エンディング
   * ================================================================ */
  function rankOf(mistakes, ratio) {
    if (mistakes === 0 && ratio >= 0.85) return ['S', '名探偵'];
    if (mistakes <= 1) return ['A', '敏腕探偵'];
    if (mistakes <= 3) return ['B', '探偵'];
    return ['C', '見習い探偵'];
  }

  function trueEnding() {
    D.active = false;
    if (!state.endings.includes('true')) state.endings.push('true');
    clearProgress('case');
    Dlg.play([...G.deduction.confession, ...G.deduction.epilogue], () => showEnding('true'));
  }

  function badEnding(kind, accused) {
    D.active = false;
    const key = kind === 'accuse' ? 'bad-' + accused : 'bad-collapse';
    if (!state.endings.includes(key)) state.endings.push(key);
    save();
    showEnding(kind, accused);
  }

  function stat(label, value) {
    return h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));
  }

  function showEnding(kind, accused) {
    showScreen('ending');
    const root = $('#ending');
    root.innerHTML = '';
    const totalClues = Object.keys(G.clues).length;
    const got = state.clues.length;
    const actions = [
      h('button', { class: 'btn primary', onclick: confirmDeduction }, kind === 'true' ? 'もう一度推理する' : '推理をやり直す'),
      h('button', { class: 'btn', onclick: backToInvestigation }, kind === 'true' ? `${UI.place}を調べ尽くす` : '調査に戻る'),
      h('button', { class: 'btn', onclick: () => openScenario('ending') }, 'シナリオ（目次）'),
      h('button', { class: 'btn ghost', onclick: toTitle }, 'タイトルへ'),
    ];

    if (kind === 'true') {
      const [r, rt] = rankOf(D.mistakes, got / totalClues);
      root.append(
        h('p', { class: 'end-kicker true' }, 'TRUE END'),
        h('h2', { class: 'end-title' }, G.deduction.trueTitle),
        h('div', { class: 'end-rank' },
          h('div', { class: 'rank-letter rank-' + r }, r),
          h('div', { class: 'rank-title' }, '探偵評価：' + rt)),
        h('div', { class: 'end-stats' },
          stat('推理ミス', D.mistakes + ' 回'),
          stat('残り信頼度', `${D.cred} / ${G.deduction.credibility}`),
          stat('手がかり収集', `${got} / ${totalClues}`)),
        h('h3', { class: 'section-title center' }, UI.reconTitle),
        h('ol', { class: 'truth-timeline' }, G.trueTimeline.map((e, i) =>
          h('li', { class: e.crime ? 'crime' : '', style: `animation-delay:${(i * 0.12).toFixed(2)}s` },
            h('span', { class: 'tt-time' }, e.t),
            h('span', { class: 'tt-dot', style: 'background:' + colorOf(e.who) }),
            h('span', { class: 'tt-text' }, e.text)))),
        h('div', { class: 'end-actions' }, actions));
      return;
    }

    const title = G.deduction.badTitles[kind === 'accuse' ? 'accuse' : 'collapse'];
    const lead = kind === 'accuse'
      ? `あなたは${G.characters[accused].name}を犯人として告発した。だが、それは真実ではなかった。`
      : 'あなたの推理は破綻し、真犯人は追及を逃れた。';
    const hints = missingHints(3);
    root.append(
      h('p', { class: 'end-kicker bad' }, 'BAD END'),
      h('h2', { class: 'end-title' }, title),
      h('p', { class: 'end-lead' }, lead),
      D.restored.length ? h('div', { class: 'end-box' },
        h('h3', { class: 'section-title' }, 'ここまでに再構築できた真相'),
        h('ol', { class: 'restored small' }, D.restored.map(t => h('li', {}, t)))) : null,
      h('div', { class: 'end-box' },
        h('h3', { class: 'section-title' }, '捜査のヒント'),
        hints.length
          ? h('ul', { class: 'hint-list' }, hints.map(t => h('li', {}, t)))
          : h('p', {}, '必要な手がかりは揃っている。証言と物証を、もう一度じっくり照らし合わせてみよう。')),
      h('div', { class: 'end-actions' }, actions));
  }

  /* ================================================================
   * タイトル・メニュー
   * ================================================================ */
  function renderTitle() {
    const saved = load();
    $('#btn-continue').disabled = !saved;
    const cast = $('#title-cast');
    cast.innerHTML = '';
    for (const cid of G.characterOrder) {
      const c = G.characters[cid];
      cast.append(h('div', { class: 'cast' },
        h('div', { class: 'cast-portrait', html: portraitSVG(c) }),
        h('div', { class: 'cast-name' }, c.short),
        h('div', { class: 'cast-role' }, c.role.split('／')[0])));
    }
    const badge = $('#title-badge');
    badge.textContent = saved && saved.endings && saved.endings.includes('true') ? 'TRUE END 到達済み' : '';
  }

  function toTitle() {
    closeModal();
    showScreen('title');
    renderTitle();
  }

  function newGame() {
    const begin = () => {
      const old = load();
      state = fresh();
      if (old) {
        for (const k of ['endings', 'storiesRead', 'pastRead', 'pastClues']) if (Array.isArray(old[k])) state[k] = old[k].slice();
        if (old.dprog) for (const [k, p] of Object.entries(old.dprog)) if (k !== 'case') state.dprog[k] = JSON.parse(JSON.stringify(p));
        if (old.myst) state.myst = JSON.parse(JSON.stringify(old.myst));
      }
      save();
      nbTab = 'items';
      nbFresh = new Set();
      D.active = false;
      openScenario(null);
    };
    const old = load();
    if (old && (old.prologueDone || (old.clues && old.clues.length))) {
      confirmBox('はじめから遊びますか？', '<p>現在の捜査データは消去されます。</p>', [
        { label: 'はじめから', cls: 'danger', onClick: begin },
        { label: 'やめる', cls: 'ghost' },
      ]);
    } else {
      begin();
    }
  }

  function startPrologue() {
    navBack = null;
    stopReader();
    showScreen('game');
    renderGame();
    setStaged(true);
    setStage((G.prologue[0] && G.prologue[0].bg) || 'black', '');
    Dlg.play(G.prologue, () => {
      state.prologueDone = true;
      save();
      renderGame();
      Dlg.play(G.tutorial, renderGame);
    });
  }

  function continueGame() {
    const saved = load();
    if (!saved) return;
    state = saved;
    D.active = false;
    openScenario(null);
  }

  /* ================================================================
   * シナリオ（章立て）
   * ================================================================ */
  const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const RETURN_LABEL = { game: '捜査に戻る', deduce: '推理に戻る', ending: 'エンディングに戻る' };
  const CHAPTERS = ['第一章', '第二章', '第三章', '終章'].map((short, i) => Object.assign({ n: i + 1, short }, UI.chapters[i + 1]));
  const chapterTitle = n => `${CHAPTERS[n - 1].short}「${CHAPTERS[n - 1].name}」`;
  const LOCK_MSG = {
    2: '第一章の来歴をすべて読み、人物の謎をすべて解くと解放されます。',
    3: '第二章の物語をすべて読むと解放されます。',
    4: '第三章で事件の夜を迎えると解放されます。',
  };
  const RE_KEY = /\[\[([a-z0-9_]+)\|(.+?)\]\]|\*\*(.+?)\*\*/g;

  let navBack = null;

  const COLL = {
    past: {
      list: () => G.backstories, key: 'pastRead', chapter: '第一章　来歴', done: '来歴を読了', listLabel: '来歴の一覧へ',
      legend: '<strong class="key">太字</strong>は重要な情報です。太字をクリックすると、手がかりとして「来歴手帳」に記録できます。人物の謎の推理では、記録した手がかりだけを突きつけられます。',
      open: () => openPast(),
    },
    day: {
      list: () => G.stories, key: 'storiesRead', chapter: '第二章　幕前', done: '物語を読了', listLabel: '物語の一覧へ',
      legend: '<strong class="key">太字</strong>は重要な情報です。',
      open: () => openStories(),
    },
  };

  const storyMarkup = s => esc(s).replace(RE_KEY, (all, id, t1, t2) => `<strong class="key">${t1 || t2}</strong>`);
  const isRead = (coll, id) => state[COLL[coll].key].includes(id);
  const allRead = coll => COLL[coll].list().every(st => isRead(coll, st.id));
  const storyIndexOf = (coll, cid) => Math.max(0, COLL[coll].list().findIndex(st => st.char === cid));
  const caseActive = () => D.active && D.mode === 'case';
  const hereAsBack = () => {
    if (currentScreen === 'deduce') return D.mode === 'case' ? 'deduce' : navBack;
    return ['game', 'ending'].includes(currentScreen) ? currentScreen : navBack;
  };
  const leavePastDeduction = () => { if (currentScreen === 'deduce' && D.mode === 'past') D.active = false; };

  function mystState(id) {
    if (!state.myst[id]) state.myst[id] = { tries: 0, hinted: 0, solved: false, revealed: false };
    return state.myst[id];
  }
  const mystSolved = id => !!(state.myst[id] && state.myst[id].solved);
  const solvedCount = () => G.pastMysteries.filter(m => mystSolved(m.id)).length;
  const pastDone = () => allRead('past') && solvedCount() === G.pastMysteries.length;

  function chapterUnlocked(n) {
    if (n === 1) return true;
    if (n === 2) return pastDone() || state.prologueDone;
    if (n === 3) return (pastDone() && allRead('day')) || state.prologueDone;
    return state.prologueDone;
  }

  function chapterDone(n) {
    if (n === 1) return pastDone();
    if (n === 2) return allRead('day');
    if (n === 3) return state.prologueDone && keyProgress().got === keyProgress().total;
    return state.endings.includes('true');
  }

  function chapterStarted(n) {
    if (n === 1) return state.pastRead.length > 0 || Object.keys(state.myst).length > 0;
    if (n === 2) return state.storiesRead.length > 0;
    if (n === 3) return state.prologueDone;
    return state.endings.length > 0 || caseActive() || !!getProgress('case');
  }

  function chapterProgress(n) {
    const count = coll => COLL[coll].list().filter(st => isRead(coll, st.id)).length;
    if (n === 1) return [
      { label: '八人の来歴を読む', got: count('past'), total: G.backstories.length },
      { label: '人物の謎を解く', got: solvedCount(), total: G.pastMysteries.length },
    ];
    if (n === 2) return [{ label: '事件当日の物語を読む', got: count('day'), total: G.stories.length }];
    if (n === 3) {
      const kp = keyProgress();
      return [
        { label: `${UI.place}を調べ、手がかりを集める`, got: state.prologueDone ? state.clues.length : 0, total: Object.keys(G.clues).length },
        { label: '推理に必要な手がかりをそろえる', got: state.prologueDone ? kp.got : 0, total: kp.total },
      ];
    }
    const bad = state.endings.filter(e => e.startsWith('bad')).length;
    return [{
      label: '真相を再構築し、犯人を指名する',
      text: state.endings.includes('true') ? 'TRUE END 到達' : bad ? `BAD END ${bad}種` : '未到達',
    }];
  }

  function chapterButtonLabel(n, done) {
    if (n === 1) return done ? '第一章を読み返す' : chapterStarted(1) ? '第一章の続きへ' : '第一章を始める';
    if (n === 2) return done ? '第二章を読み返す' : chapterStarted(2) ? '第二章の続きへ' : '第二章を始める';
    if (n === 3) return state.prologueDone ? '捜査を続ける' : '事件の夜へ';
    return caseActive() ? '推理に戻る' : getProgress('case') ? '推理の続きへ' : '推理を披露する';
  }

  function currentChapter() {
    if (currentScreen === 'past') return 1;
    if (currentScreen === 'stories') return 2;
    if (currentScreen === 'reader') return readerColl === 'past' ? 1 : 2;
    if (currentScreen === 'game') return 3;
    if (currentScreen === 'deduce') return D.mode === 'past' ? 1 : 4;
    if (currentScreen === 'ending') return 4;
    return 0;
  }

  function renderSteppers() {
    if (!G.backstories) return;
    const cur = currentChapter();
    document.querySelectorAll('.stepper').forEach(el => {
      el.innerHTML = '';
      el.append(
        h('button', { class: 'step-home', title: 'シナリオ（目次）を開く', onclick: () => { const back = hereAsBack(); leavePastDeduction(); openScenario(back); } }, '目次'),
        ...CHAPTERS.map(ch => h('button', {
          class: 'step' + (ch.n === cur ? ' current' : '') + (chapterDone(ch.n) ? ' done' : '') + (chapterUnlocked(ch.n) ? '' : ' locked'),
          title: chapterUnlocked(ch.n) ? `${ch.short}「${ch.name}」― ${ch.sub}` : LOCK_MSG[ch.n],
          onclick: () => gotoChapter(ch.n),
        }, h('span', { class: 'step-no' }, ch.short), h('span', { class: 'step-name' }, ch.name))));
    });
  }

  function gotoChapter(n) {
    if (!chapterUnlocked(n)) { toast('未解放', LOCK_MSG[n], 'lock'); return; }
    const from = hereAsBack();
    leavePastDeduction();
    if (n === 1) openPast(from);
    else if (n === 2) openStories(from);
    else if (n === 3) enterNight();
    else enterFinale();
  }

  function enterNight() {
    if (caseActive()) { abortDeduction(); return; }
    if (!state.prologueDone) { startPrologue(); return; }
    backToInvestigation();
  }

  function enterFinale() {
    if (currentScreen === 'ending') return;
    navBack = null;
    stopReader();
    if (caseActive()) { showScreen('deduce'); renderDeduce(); return; }
    if (currentScreen !== 'game') { showScreen('game'); renderGame(); }
    confirmDeduction();
  }

  function returnBack() {
    const target = navBack;
    navBack = null;
    stopReader();
    if (target === 'deduce') { showScreen('deduce'); renderDeduce(); }
    else if (target === 'ending') showScreen('ending');
    else if (target === 'game') { showScreen('game'); renderGame(); }
    else openScenario(null);
  }

  function openScenario(from) {
    if (from !== undefined) navBack = from;
    stopReader();
    closeModal();
    showScreen('scenario');
    renderScenario();
    $('#screen-scenario').scrollTop = 0;
  }

  function renderScenario() {
    const list = $('#scenario-list');
    list.innerHTML = '';
    for (const ch of CHAPTERS) {
      const open = chapterUnlocked(ch.n);
      const done = chapterDone(ch.n);
      const status = done ? '完了' : !open ? '未解放' : chapterStarted(ch.n) ? '進行中' : '未着手';
      list.append(h('li', { class: 'scn-ch' + (done ? ' done' : '') + (open ? '' : ' locked') + (currentChapterHint() === ch.n ? ' next' : '') },
        h('div', { class: 'scn-badge' }, h('span', { class: 'scn-no' }, ch.short), h('span', { class: 'scn-name' }, ch.name)),
        h('div', { class: 'scn-body' },
          h('div', { class: 'scn-head' },
            h('h2', { class: 'scn-title' }, `${ch.short}「${ch.name}」`, h('span', { class: 'scn-sub' }, `― ${ch.sub}`)),
            h('span', { class: 'scn-status' }, status)),
          h('p', { class: 'scn-desc' }, ch.desc),
          h('ul', { class: 'scn-goals' }, chapterProgress(ch.n).map(p => h('li', {},
            h('span', { class: 'scn-goal' }, p.label),
            p.total ? h('span', { class: 'scn-bar' }, h('span', { class: 'scn-fill', style: `width:${Math.round(p.got / p.total * 100)}%` })) : h('span', { class: 'scn-bar empty' }),
            h('span', { class: 'scn-count' }, p.total ? `${p.got} / ${p.total}` : p.text)))),
          open
            ? h('button', { class: 'btn ' + (done ? '' : 'primary'), onclick: () => gotoChapter(ch.n) }, chapterButtonLabel(ch.n, done))
            : h('p', { class: 'scn-lock' }, '未解放 ― ' + LOCK_MSG[ch.n]))));
    }
    const foot = $('#scenario-foot');
    foot.innerHTML = '';
    if (state.endings.length) {
      const names = state.endings.map(e => (e === 'true' ? 'TRUE END' : e === 'bad-collapse' ? 'BAD END（推理破綻）' : `BAD END（${G.characters[e.slice(4)].short}を告発）`));
      foot.append(h('p', {}, '到達したエンディング：' + names.join('、')));
    }
    $('#btn-scn-back').textContent = navBack ? RETURN_LABEL[navBack] : 'タイトルへ';
  }

  function currentChapterHint() {
    for (const ch of CHAPTERS) if (chapterUnlocked(ch.n) && !chapterDone(ch.n)) return ch.n;
    return 0;
  }

  /* ================================================================
   * 第一章「来歴」・第二章「幕前」― 物語の一覧
   * ================================================================ */
  function storyCard(coll, st, i) {
    const c = G.characters[st.char];
    const done = isRead(coll, st.id);
    return h('button', { class: 'story-card' + (done ? ' read' : ''), onclick: () => openReader(coll, i) },
      h('span', { class: 'sc-portrait', html: portraitSVG(c) }),
      h('span', { class: 'sc-body' },
        h('span', { class: 'sc-no' }, `其の${KANJI_NUM[i]}　${c.name}${coll === 'day' ? 'の視点' : ''}`),
        h('span', { class: 'sc-title' }, st.title),
        h('span', { class: 'sc-tag' }, st.tagline),
        h('span', { class: 'sc-status' }, done ? '読了' : '未読')));
  }

  function openPast(from) {
    if (from !== undefined) navBack = from;
    stopReader();
    closeModal();
    showScreen('past');
    renderPast();
    $('#screen-past').scrollTop = 0;
  }

  function renderPast() {
    const total = G.backstories.length;
    const read = G.backstories.filter(st => isRead('past', st.id)).length;
    const solved = solvedCount();
    const done = pastDone();
    $('#past-progress').textContent = `来歴 ${read} / ${total}　謎 ${solved} / ${G.pastMysteries.length}`;

    const grid = $('#past-grid');
    grid.innerHTML = '';
    G.backstories.forEach((st, i) => grid.append(storyCard('past', st, i)));

    const ig = $('#item-grid');
    ig.innerHTML = '';
    for (const it of G.pastItems) {
      const owner = G.characters[it.char];
      const open = isRead('past', it.char);
      const got = state.pastClues.includes(it.id);
      ig.append(h('button', { class: 'item-card' + (got ? ' got' : '') + (open ? '' : ' locked'), onclick: () => examinePastItem(it) },
        h('span', { class: 'ic-portrait', html: portraitSVG(owner) }),
        h('span', { class: 'ic-body' },
          h('span', { class: 'ic-owner' }, `${owner.short}の思い出の品`),
          h('span', { class: 'ic-name' }, open ? it.name : '？？？'),
          h('span', { class: 'ic-status' }, !open ? '来歴を読むと調べられる' : got ? '調査済' : '未調査'))));
    }

    const mg = $('#myst-grid');
    mg.innerHTML = '';
    for (const m of G.pastMysteries) mg.append(mysteryCard(m));
    renderPastNotebook();

    const actions = $('#past-actions');
    actions.innerHTML = '';
    if (done) {
      actions.append(h('div', { class: 'chapter-clear' },
        h('div', { class: 'cc-kicker' }, '第一章　完了'),
        h('p', {}, UI.pastDone)));
    }
    if (navBack) {
      actions.append(h('button', { class: 'btn primary big', onclick: returnBack }, RETURN_LABEL[navBack]));
    } else {
      const unread = total - read;
      const unsolved = G.pastMysteries.length - solved;
      let note = '第二章「幕前」が解放された。';
      if (unread && unsolved) note = `来歴をあと${unread}人分読み、謎をあと${unsolved}つ解くと、第二章へ進めます。`;
      else if (unread) note = `来歴をあと${unread}人分読むと、第二章へ進めます。`;
      else if (unsolved) note = `謎をあと${unsolved}つ解くと、第二章へ進めます。`;
      actions.append(
        h('button', { class: 'btn primary big', disabled: !done, onclick: () => openStories(null) }, '第二章「幕前」へ進む'),
        h('p', { class: 'stories-note' + (done ? ' ok' : '') }, note));
    }
    $('#btn-past-back').textContent = navBack ? RETURN_LABEL[navBack] : '目次';
    renderSteppers();
  }

  let pastNbTab = 'record';
  let pastNbRenderedTab = null;

  function renderPastNotebook() {
    const el = $('#past-nb');
    if (!el) return;
    const prevBody = el.querySelector('.pnb-body');
    const keepTop = prevBody && pastNbRenderedTab === pastNbTab ? prevBody.scrollTop : 0;
    pastNbRenderedTab = pastNbTab;
    el.innerHTML = '';
    const totalRecords = pastFragments().length;
    const totalItems = G.pastItems.length;
    const owned = state.pastClues.map(id => [id, pastClue(id)]).filter(([, c]) => c);
    const count = type => owned.filter(([, c]) => c.type === type).length;
    const tabs = [['record', '来歴の記述', count('record'), totalRecords], ['item', '思い出の品', count('item'), totalItems]];
    const list = owned.filter(([, c]) => c.type === pastNbTab)
      .sort((a, b) => G.characterOrder.indexOf(a[1].by) - G.characterOrder.indexOf(b[1].by));
    const body = [];
    let lastBy = null;
    for (const [id, c] of list) {
      if (c.by !== lastBy) {
        const who = G.characters[c.by];
        body.push(h('div', { class: 'pnb-group' }, h('span', { class: 'pnb-face', html: portraitSVG(who) }), who.name));
        lastBy = c.by;
      }
      body.push(h('div', { class: 'pnb-card ' + c.type, 'data-id': id },
        c.type === 'item' ? h('div', { class: 'pnb-name' }, c.name) : null,
        h('div', { class: 'pnb-sub' }, c.sub),
        h('div', { class: 'pnb-text' }, c.desc)));
    }
    el.append(
      h('h2', { class: 'pane-title' }, '来歴手帳'),
      h('p', { class: 'pnb-lead' }, '来歴の太字をクリックすると「記述」が、思い出の品を調べると「品」が記録される。人物の謎の推理では、ここに記録した手がかりだけを突きつけられる。'),
      h('nav', { class: 'nb-tabs' }, tabs.map(([k, label, got, total]) =>
        h('button', { class: 'nb-tab' + (pastNbTab === k ? ' on' : ''), onclick: () => { pastNbTab = k; renderPastNotebook(); } }, `${label} ${got}/${total}`))),
      h('div', { class: 'pnb-body' }, body.length ? body : h('p', { class: 'empty' }, pastNbTab === 'record'
        ? 'まだ何も記録していない。来歴を読み、太字の記述をクリックしよう。'
        : 'まだ何も調べていない。来歴を読むと、その人物の思い出の品を調べられる。')));
    const newBody = el.querySelector('.pnb-body');
    if (keepTop) requestAnimationFrame(() => { newBody.scrollTop = keepTop; });
  }

  function openStories(from) {
    if (from !== undefined) navBack = from;
    stopReader();
    closeModal();
    showScreen('stories');
    renderStories();
    $('#screen-stories').scrollTop = 0;
  }

  function renderStories() {
    const total = G.stories.length;
    const read = G.stories.filter(st => isRead('day', st.id)).length;
    $('#stories-progress').textContent = `読了 ${read} / ${total}`;

    const grid = $('#story-grid');
    grid.innerHTML = '';
    G.stories.forEach((st, i) => grid.append(storyCard('day', st, i)));

    const actions = $('#stories-actions');
    actions.innerHTML = '';
    if (navBack) {
      actions.append(h('button', { class: 'btn primary big', onclick: returnBack }, RETURN_LABEL[navBack]));
    } else {
      const left = total - read;
      actions.append(
        h('button', { class: 'btn primary big', disabled: left > 0, onclick: () => (state.prologueDone ? backToInvestigation() : startPrologue()) }, `${chapterTitle(3)}へ進む`),
        h('p', { class: 'stories-note' + (left ? '' : ' ok') }, left
          ? `あと ${left} 人の物語を読むと、第三章へ進めます。`
          : UI.dayDone));
    }
    $('#btn-stories-back').textContent = navBack ? RETURN_LABEL[navBack] : '目次';
    renderSteppers();
  }

  /* ---------------- 物語リーダー（両章共通） ---------------- */
  let readerColl = 'past';
  let readerIdx = 0;
  let readerObserver = null;

  function stopReader() {
    if (readerObserver) { readerObserver.disconnect(); readerObserver = null; }
  }

  function storyKeys(st) {
    const out = [];
    for (const sec of st.sections) {
      for (const p of sec.paras) {
        for (const m of p.matchAll(RE_KEY)) {
          const t = m[2] || m[3];
          if (!out.includes(t)) out.push(t);
        }
      }
    }
    return out;
  }

  function markRead(coll, st) {
    const key = COLL[coll].key;
    if (state[key].includes(st.id)) return;
    state[key].push(st.id);
    save();
    const c = G.characters[st.char];
    const unlocksMystery = coll === 'past' && G.pastMysteries.some(m => m.char === st.char);
    toast(COLL[coll].done, c.name + (coll === 'day' ? 'の視点' : unlocksMystery ? `の来歴 ― 「${c.short}の謎」に挑戦できる` : 'の来歴'), 'story');
    const status = $('#reader-status');
    if (status) status.textContent = '読了';
    const cta = $('#reader-myst');
    if (cta) cta.classList.remove('hidden');
    renderSteppers();
  }

  function openReader(coll, idx, from) {
    if (from !== undefined) navBack = from;
    stopReader();
    closeModal();
    readerColl = coll;
    readerIdx = idx;
    showScreen('reader');
    renderReader();
  }

  function renderReader() {
    const C = COLL[readerColl];
    const list = C.list();
    const st = list[readerIdx];
    const c = G.characters[st.char];
    const prev = list[readerIdx - 1];
    const next = list[readerIdx + 1];
    const day = readerColl === 'day';
    const label = `${C.chapter}　其の${KANJI_NUM[readerIdx]}　${c.name}${day ? 'の視点' : ''}`;
    const pm = day ? null : G.pastMysteries.find(m => m.char === st.char);

    $('#reader-label').textContent = label;
    $('#btn-reader-prev').disabled = !prev;
    $('#btn-reader-next').disabled = !next;
    $('#btn-reader-list').textContent = '← ' + C.listLabel.replace('へ', '');

    const keys = storyKeys(st);
    const root = $('#reader');
    root.innerHTML = '';
    let n = 0;
    const paraHTML = day ? storyMarkup : p => esc(p).replace(RE_KEY, (all, id, t1, t2) => {
      n += 1;
      const cid = id || `${st.id}#${n}`;
      const got = state.pastClues.includes(cid);
      return `<strong class="key clue${got ? ' got' : ''}" data-cid="${cid}" title="${got ? '記録済み' : 'クリックして来歴手帳に記録'}">${t1 || t2}</strong>`;
    });
    const keyList = day
      ? h('ul', {}, keys.map(k => h('li', {}, h('strong', { class: 'key' }, k))))
      : h('ul', { class: 'rk-list' }, pastFragments().filter(f => f.sid === st.id).map(f =>
        h('li', {}, h('button', { class: 'rk-btn key clue' + (state.pastClues.includes(f.id) ? ' got' : ''), 'data-cid': f.id }, f.text))));
    root.append(
      h('header', { class: 'rd-head' },
        h('div', { class: 'rd-portrait', html: portraitSVG(c) }),
        h('div', { class: 'rd-head-text' },
          h('div', { class: 'rd-no' }, label),
          h('h2', { class: 'rd-title' }, st.title),
          h('p', { class: 'rd-tag' }, st.tagline),
          h('div', { class: 'rd-meta' }, `${c.role}　${c.age}歳`),
          h('div', { class: 'rd-status', id: 'reader-status' }, isRead(readerColl, st.id) ? '読了' : '未読'))),
      h('p', { class: 'rd-legend', html: C.legend }),
      day ? '' : h('div', { class: 'rd-count', id: 'reader-count' }),
      ...st.sections.map(sec => h('section', { class: 'rd-section' },
        h('h3', { class: 'rd-time' }, h('span', { class: 'rd-clock' }, sec.time), h('span', { class: 'rd-place' }, sec.place)),
        sec.paras.map(p => h('p', { class: 'rd-p', html: paraHTML(p) })))),
      keys.length ? h('aside', { class: 'rd-keys' },
        h('h4', {}, day ? 'この章の重要な情報' : 'この来歴の重要な情報（クリックで手帳に記録）'),
        keyList) : '',
      pm ? h('div', { class: 'rd-myst' + (isRead('past', st.id) ? '' : ' hidden'), id: 'reader-myst' },
        h('div', { class: 'rd-myst-label' }, '人物の謎'),
        h('div', { class: 'rd-myst-q' }, pm.q),
        h('button', { class: 'btn accent', onclick: () => openMystery(pm.id) }, mystSolved(pm.id) ? '解明済みの真相を見る' : 'この謎に挑む')) : '',
      h('div', { class: 'rd-end', id: 'reader-end' },
        h('div', { class: 'rd-fin' }, '― 了 ―'),
        h('div', { class: 'rd-end-actions' },
          next ? h('button', { class: 'btn primary', onclick: () => { markRead(readerColl, st); openReader(readerColl, readerIdx + 1); } },
            `次へ：${G.characters[next.char].name}${day ? 'の視点' : 'の来歴'}`) : null,
          h('button', { class: next ? 'btn' : 'btn primary', onclick: () => { markRead(readerColl, st); C.open(); } }, C.listLabel))));

    updateReaderCount();
    $('#screen-reader').scrollTop = 0;
    window.scrollTo(0, 0);
    stopReader();
    if ('IntersectionObserver' in window) {
      readerObserver = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) markRead(readerColl, st);
      }, { threshold: 0.6 });
      readerObserver.observe($('#reader-end'));
    }
  }

  function checkReaderEnd() {
    if (currentScreen !== 'reader') return;
    const end = $('#reader-end');
    if (!end) return;
    const r = end.getBoundingClientRect();
    if (r.top < window.innerHeight - r.height * 0.4) markRead(readerColl, COLL[readerColl].list()[readerIdx]);
  }

  function readerStep(delta) {
    const target = readerIdx + delta;
    if (!COLL[readerColl].list()[target]) return;
    openReader(readerColl, target);
  }

  /* ================================================================
   * 第一章「人物の謎」
   * ================================================================ */
  let fragCache = null;

  function pastFragments() {
    if (fragCache) return fragCache;
    fragCache = [];
    for (const st of G.backstories) {
      let n = 0;
      for (const sec of st.sections) {
        for (const p of sec.paras) {
          for (const m of p.matchAll(RE_KEY)) {
            n += 1;
            fragCache.push({ id: m[1] || `${st.id}#${n}`, sid: st.id, char: st.char, text: m[2] || m[3], time: sec.time, place: sec.place });
          }
        }
      }
    }
    return fragCache;
  }

  const fragById = id => pastFragments().find(f => f.id === id);
  const itemById = id => G.pastItems.find(it => it.id === id);
  const shortText = t => (Array.from(t).length > 24 ? Array.from(t).slice(0, 24).join('') + '…' : t);
  const PAST_CRED = 3;

  function pastClue(id) {
    const it = itemById(id);
    if (it) return { type: 'item', name: it.name, desc: it.desc, by: it.char, sub: `${G.characters[it.char].short}の思い出の品・${it.place}` };
    const f = fragById(id);
    if (!f) return null;
    return { type: 'record', name: shortText(f.text), desc: f.text, by: f.char, sub: `${G.characters[f.char].short}の来歴・${f.time}` };
  }

  const CASE_POOL = { tabs: [['item', '物証'], ['testimony', '証言']], owned: () => state.clues, get: id => G.clues[id] };
  const PAST_POOL = { tabs: [['record', '来歴の記述'], ['item', '思い出の品']], owned: () => state.pastClues, get: pastClue, group: true };

  function givePast(id) {
    if (state.pastClues.includes(id)) return false;
    const c = pastClue(id);
    if (!c) return false;
    state.pastClues.push(id);
    save();
    toast(c.type === 'item' ? '思い出の品を記録' : '記述を手帳に記録', c.name, c.type === 'item' ? 'pitem' : 'record');
    if (currentScreen === 'past') renderPast();
    return true;
  }

  function collectFromReader(cid) {
    const added = givePast(cid);
    document.querySelectorAll(`#reader [data-cid="${cid}"]`).forEach(el => { el.classList.add('got'); el.title = '記録済み'; });
    if (!added) toast('記録済み', 'この記述は、すでに来歴手帳にある', 'lock');
    updateReaderCount();
  }

  function updateReaderCount() {
    const el = $('#reader-count');
    if (!el || readerColl !== 'past') return;
    const sid = COLL.past.list()[readerIdx].id;
    const frags = pastFragments().filter(f => f.sid === sid);
    el.textContent = `この来歴の手がかり：記録 ${frags.filter(f => state.pastClues.includes(f.id)).length} / ${frags.length}`;
  }

  function examinePastItem(it) {
    if (!isRead('past', it.char)) { toast('まだ調べられない', `${G.characters[it.char].name}の来歴を読むと調べられる`, 'lock'); return; }
    Dlg.play([...it.lines, { pgive: it.id }], () => { if (currentScreen === 'past') renderPast(); });
  }

  const mystAnswer = m => { const st = m.steps.find(s => s.type === 'choice'); return st ? st.options[st.correct] : ''; };
  function mystReadiness(m) {
    const ev = m.steps.filter(s => s.type === 'evidence');
    return { got: ev.filter(s => s.answer.some(a => state.pastClues.includes(a))).length, total: ev.length };
  }

  function mysteryCard(m) {
    const c = G.characters[m.char];
    const unlocked = isRead('past', m.char);
    const ms = state.myst[m.id];
    let status;
    let cls;
    if (mystSolved(m.id)) {
      status = ms.revealed ? '解明（答えを見た）' : !ms.hinted && !ms.mistakes ? '解明 ★' : '解明';
      cls = 'solved';
    } else if (unlocked) {
      const rd = mystReadiness(m);
      const p = getProgress(m.id);
      status = p
        ? `推理中 ${p.step} / ${m.steps.length}段`
        : `手がかり ${rd.got} / ${rd.total}` + (ms && ms.tries ? `・失敗 ${ms.tries}回` : '');
      cls = 'open' + (p ? ' inprogress' : '');
    } else {
      status = '未解禁';
      cls = 'locked';
    }
    return h('button', {
      class: 'myst-card ' + cls,
      onclick: () => (unlocked ? openMystery(m.id) : toast('未解禁', `${c.name}の来歴を読むと挑戦できる`, 'lock')),
    },
    h('span', { class: 'mc-portrait', html: portraitSVG(c) }),
    h('span', { class: 'mc-body' },
      h('span', { class: 'mc-no' }, `${c.short}の謎`),
      h('span', { class: 'mc-title' }, unlocked ? m.title : '？？？'),
      h('span', { class: 'mc-q' }, unlocked ? m.q : `${c.name}の来歴を読むと、謎が明らかになる。`),
      h('span', { class: 'mc-status' }, status)));
  }

  function afterMysteryClosed() {
    if (currentScreen === 'past') renderPast();
    else if (currentScreen === 'reader') renderReader();
    renderSteppers();
  }

  function openMystery(id) {
    const m = G.pastMysteries.find(x => x.id === id);
    if (mystSolved(id)) { showMysteryReveal(m, false); return; }
    const ms = mystState(id);
    const c = G.characters[m.char];

    const giveUp = () => confirmBox('答えを見ますか？', '<p>この謎の答えと手がかりを表示し、解明済みにします。</p>', [
      { label: '答えを見る', cls: 'danger', onClick: () => { ms.solved = true; ms.revealed = true; clearProgress(m.id); showMysteryReveal(m, true); } },
      { label: '自分で考える', cls: 'ghost', onClick: render },
    ]);

    function render() {
      const rd = mystReadiness(m);
      const pct = Math.round(rd.got / rd.total * 100);
      const p = getProgress(m.id);
      const node = h('div', { class: 'myst' },
        h('div', { class: 'myst-head' },
          h('div', { class: 'myst-portrait', html: portraitSVG(c) }),
          h('div', { class: 'myst-head-text' },
            h('div', { class: 'myst-kicker' }, `第一章　人物の謎 ― ${c.name}`),
            h('h3', { class: 'myst-title' }, m.title),
            h('p', { class: 'myst-q' }, m.q))),
        h('div', { class: 'ready-meter' },
          h('div', { class: 'ready-label' }, `推理に必要な手がかり：${rd.got} / ${rd.total}`),
          h('div', { class: 'ready-bar' }, h('div', { class: 'ready-fill', style: `width:${pct}%` }))),
        rd.got < rd.total
          ? h('p', { class: 'warn' }, '手がかりが足りないと、推理は行き詰まるかもしれない。来歴の太字をクリックして手帳に記録し、思い出の品を調べよう。')
          : h('p', { class: 'ok' }, '必要な手がかりは揃っているようだ。'),
        h('ul', { class: 'rules' },
          h('li', {}, `推理は全${m.steps.length}段階。来歴手帳に記録した手がかりを突きつけ、真相を再構築する。`),
          h('li', {}, `誤った手がかりや答えを示すと信頼度が減る（最大${PAST_CRED}）。0になると推理は行き詰まるが、それまでに解いた段は失われない。`),
          h('li', {}, '推理の途中で第一章に戻り、手がかりを集め直すこともできる。答えた段までの推理は自動で保存され、続きから再開できる。')),
        progressNote(p, m.steps),
        ms.hinted ? h('div', { class: 'myst-hints' }, m.hints.slice(0, ms.hinted).map((t, i) => h('p', {}, h('strong', {}, `ヒント${i + 1}：`), t))) : null,
        h('div', { class: 'myst-actions' },
          h('button', { class: 'btn primary', onclick: () => { closeModal(); beginDeduction(pastDef(m)); } }, p ? '続きから推理する' : '推理を始める'),
          p ? h('button', { class: 'btn', onclick: () => confirmBox('最初から推理し直しますか？', '<p>保存されている推理の進み具合を消去し、第一段から推理し直します。</p>', [
            { label: '最初から推理し直す', cls: 'danger', onClick: () => beginDeduction(pastDef(m), { fresh: true }) },
            { label: 'やめる', cls: 'ghost', onClick: render },
          ]) }, '最初から推理し直す') : null,
          ms.hinted < m.hints.length ? h('button', { class: 'btn', onclick: () => { ms.hinted += 1; save(); render(); } }, `ヒントを見る（${ms.hinted + 1}/${m.hints.length}）`) : null,
          ms.tries >= 2 ? h('button', { class: 'btn ghost', onclick: giveUp }, '答えを見る') : null,
          h('button', { class: 'btn ghost', onclick: () => { closeModal(); afterMysteryClosed(); } }, '閉じる')));
      openModal(node, { cls: 'myst-modal', onClose: afterMysteryClosed, keepScroll: true });
    }
    render();
  }

  function showMysteryReveal(m, fresh, presented) {
    const c = G.characters[m.char];
    const ms = mystState(m.id);
    const ids = presented && presented.length ? presented : m.steps.filter(s => s.type === 'evidence').map(s => s.answer[0]);
    const evidence = ids.map(pastClue).filter(Boolean);
    const allDone = pastDone();
    const node = h('div', { class: 'myst reveal' },
      h('div', { class: 'myst-head' },
        h('div', { class: 'myst-portrait', html: portraitSVG(c) }),
        h('div', { class: 'myst-head-text' },
          h('div', { class: 'myst-kicker' }, `人物の謎 ― ${c.name}`),
          h('h3', { class: 'myst-title' }, (fresh ? '解明：' : '') + m.title),
          h('p', { class: 'myst-q' }, m.q))),
      h('div', { class: 'reveal-answer' }, h('span', { class: 'ra-label' }, '答え'), h('span', {}, mystAnswer(m))),
      h('div', { class: 'reveal-evidence' }, evidence.map(f => h('blockquote', {},
        h('div', { class: 're-who' }, f.sub),
        h('div', { class: 're-text' }, h('strong', { class: 'key' }, f.type === 'item' ? `${f.name}：${f.desc}` : f.desc))))),
      h('div', { class: 'reveal-body' }, m.reveal.map(p => h('p', {}, p))),
      h('div', { class: 'reveal-rank' }, ms.revealed
        ? '答えを見て解明'
        : !ms.hinted && !ms.mistakes
          ? '★ 完全解明（ヒントなし・推理ミスなし）'
          : `解明（ヒント ${ms.hinted || 0}回・推理ミス ${ms.mistakes || 0}回）`),
      fresh && allDone ? h('div', { class: 'chapter-clear' },
        h('div', { class: 'cc-kicker' }, '第一章　完了'),
        h('p', {}, '八つの謎がすべて解けた。第二章「幕前」が解放された。')) : null,
      h('div', { class: 'myst-actions' },
        h('button', { class: 'btn primary', onclick: () => { closeModal(); afterMysteryClosed(); } }, '閉じる')));
    openModal(node, { cls: 'myst-modal', onClose: afterMysteryClosed });
  }

  const HOWTO_HTML = `
    <ol class="howto">
      <li><strong>シナリオ</strong>：物語は「${CHAPTERS.map(c => `${c.short} ${c.name}`).join(' → ')}」の順に進みます。画面上部の章の表示から現在地を確認でき、解放済みの章へいつでも戻れます。「目次」では各章の目標と進み具合を確認できます。</li>
      <li><strong>第一章 来歴</strong>：八人の出身や生い立ちを読みます。本文の<strong>太字</strong>をクリックすると手がかり（記述）が「来歴手帳」に記録され、「思い出の品」を調べると品の手がかりが手に入ります。集めた手がかりを突きつけて、終章と同じ形式の推理で八つの「人物の謎」を解きましょう。すべて解くと第二章が解放されます。</li>
      <li><strong>第二章 幕前</strong>：事件当日の一日を、八人それぞれの視点で読みます。すべて読むと、事件の夜（第三章）へ進めます。</li>
      <li><strong>調べる</strong>：左の見取り図（またはその下の一覧）で場所を移動し、中央の「調べる」から気になるものを調査します。地図上の数字は未調査の箇所の数です。</li>
      <li><strong>話を聞く</strong>：関係者は${UI.gatherPlace}に集まっています。「人物」タブや${UI.gatherPlace}の人物から話を聞き、話題を選びましょう。新しい話題には NEW が付きます。</li>
      <li><strong>証拠をつきつける</strong>：相手の嘘や隠し事に気づいたら、手に入れた物証や証言を突きつけます。正しい証拠なら、新たな証言を引き出せます。</li>
      <li><strong>捜査手帳</strong>：物証・証言・人物ファイル・時系列・謎メモを確認できます。謎メモには解くべき疑問とヒントがあります。</li>
      <li><strong>推理を披露する</strong>：真相が見えたら右上のボタンから推理パートへ。質問に答え、証拠を示して真相を再構築し、最後に犯人を指名します。</li>
    </ol>
    <p class="muted">人名・地名などの固有名詞には、読み方（ふりがな）が表示されます。「ふりがな」ボタンで「すべて／初出のみ／なし」を切り替えられます。</p>
    <p class="muted">会話はクリック／Enter／Spaceで進みます。進行状況はブラウザに自動保存されます。</p>`;

  function showHowto(after) {
    confirmBox('遊び方', HOWTO_HTML, [{ label: '閉じる', cls: 'primary', onClick: after }]);
  }

  function showLog() {
    const entries = state.log.slice(-200);
    const list = h('div', { class: 'backlog' }, entries.length ? entries.map(e => {
      const sp = speakerOf(e.w);
      return h('div', { class: 'bl-line ' + (sp ? 'speech' : 'narr') },
        sp ? h('span', { class: 'bl-name', style: '--who:' + sp.portrait.color }, sp.name) : null,
        h('span', { class: 'bl-text', html: markup(e.t) }));
    }) : h('p', { class: 'empty' }, 'まだ会話はない。'));
    confirmBox('会話履歴', list, [{ label: '閉じる', cls: 'primary' }]);
    setTimeout(() => { list.scrollTop = list.scrollHeight; }, 0);
  }

  function showMenu() {
    const node = h('div', { class: 'confirm' },
      h('h3', { class: 'confirm-title' }, 'メニュー'),
      h('div', { class: 'menu-list' },
        h('button', { class: 'btn', onclick: () => { closeModal(); showHowto(); } }, '遊び方'),
        h('button', { class: 'btn', onclick: () => openScenario(hereAsBack()) }, 'シナリオ（目次）'),
        h('button', { class: 'btn', onclick: () => { closeModal(); showLog(); } }, '会話履歴'),
        h('button', { class: 'btn btn-ruby', type: 'button' }),
        h('button', { class: 'btn', onclick: () => { save(); toTitle(); } }, 'タイトルへ戻る（自動保存済み）'),
        h('button', { class: 'btn', onclick: () => { save(); location.href = 'index.html'; } }, 'シリーズ選択へ（自動保存済み）'),
        h('button', { class: 'btn danger', onclick: () => { closeModal(); newGame(); } }, '最初からやり直す'),
        h('button', { class: 'btn ghost', onclick: () => closeModal() }, '閉じる')));
    openModal(node, { cls: 'confirm-modal' });
  }

  /* ================================================================
   * 雨（キャンバス）
   * ================================================================ */
  const Rain = {
    c: null, ctx: null, drops: [], w: 0, h: 0, reduced: false, rgb: '',

    readColor() {
      const v = getComputedStyle(document.documentElement).getPropertyValue(SNOW ? '--snow-rgb' : '--rain-rgb').trim();
      this.rgb = v || (SNOW ? '232,238,246' : '170,190,220');
    },

    init() {
      this.readColor();
      document.addEventListener('themechange', () => this.readColor());
      this.c = $('#rain');
      this.ctx = this.c.getContext('2d');
      this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      const count = SNOW ? (this.reduced ? 50 : 170) : (this.reduced ? 60 : 240);
      for (let i = 0; i < count; i++) this.drops.push(this.make(true));
      requestAnimationFrame(() => this.loop());
    },

    make(initial) {
      if (SNOW) {
        return {
          x: Math.random() * this.w * 1.2,
          y: initial ? Math.random() * this.h : -10 - Math.random() * 80,
          r: 1.2 + Math.random() * 2.6,
          v: (this.reduced ? 0.3 : 0.7) + Math.random() * 1.3,
          a: 0.35 + Math.random() * 0.55,
          ph: Math.random() * Math.PI * 2,
        };
      }
      return {
        x: Math.random() * this.w * 1.25,
        y: initial ? Math.random() * this.h : -20 - Math.random() * 120,
        l: 10 + Math.random() * 18,
        v: (this.reduced ? 3 : 9) + Math.random() * 9,
        a: 0.06 + Math.random() * 0.2,
      };
    },

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.c.width = this.w * dpr;
      this.c.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    loop() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      if (SNOW) {
        for (const d of this.drops) {
          ctx.fillStyle = `rgba(${this.rgb},${d.a})`;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fill();
          d.ph += 0.012 + d.r * 0.004;
          d.y += d.v * (0.6 + d.r * 0.25);
          d.x += Math.sin(d.ph) * 0.45 - 0.35 * d.v;
          if (d.y > this.h + 6 || d.x < -20) Object.assign(d, this.make(false));
        }
        requestAnimationFrame(() => this.loop());
        return;
      }
      ctx.lineWidth = 1;
      for (const d of this.drops) {
        ctx.strokeStyle = `rgba(${this.rgb},${d.a})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.l * 0.18, d.y + d.l);
        ctx.stroke();
        d.y += d.v;
        d.x -= d.v * 0.18;
        if (d.y > this.h) Object.assign(d, this.make(false));
      }
      requestAnimationFrame(() => this.loop());
    },
  };

  /* ================================================================
   * 雨音・雪風（Web Audio によるノイズ合成）
   * ================================================================ */
  const Sound = {
    ctx: null, master: null, on: false,

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        let brown = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          brown = (brown + 0.02 * white) / 1.02;
          data[i] = white * 0.35 + brown * 2.2;
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = SNOW ? 60 : 180;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = SNOW ? 900 : 4200;
      const master = ctx.createGain();
      master.gain.value = 0;
      if (SNOW) {
        const gust = ctx.createGain();
        gust.gain.value = 0.75;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.11;
        const depth = ctx.createGain();
        depth.gain.value = 0.45;
        lfo.connect(depth).connect(gust.gain);
        const sweep = ctx.createOscillator();
        sweep.frequency.value = 0.07;
        const sweepDepth = ctx.createGain();
        sweepDepth.gain.value = 380;
        sweep.connect(sweepDepth).connect(lp.frequency);
        src.connect(hp).connect(lp).connect(gust).connect(master).connect(ctx.destination);
        lfo.start();
        sweep.start();
      } else {
        src.connect(hp).connect(lp).connect(master).connect(ctx.destination);
      }
      src.start();
      this.ctx = ctx;
      this.master = master;
      return true;
    },

    toggle() {
      if (!this.ctx && !this.init()) return false;
      this.on = !this.on;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.master.gain.setTargetAtTime(this.on ? 0.22 : 0, this.ctx.currentTime, 0.4);
      return this.on;
    },

    thunder() {
      if (!this.on || !this.ctx) return;
      const ctx = this.ctx;
      const len = ctx.sampleRate * 3;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        b = (b + 0.04 * (Math.random() * 2 - 1)) / 1.04;
        data[i] = b * 6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 160;
      const g = ctx.createGain();
      const t = ctx.currentTime + 0.5;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.9, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
      src.connect(lp).connect(g).connect(ctx.destination);
      src.start(t);
    },
  };

  /* ================================================================
   * 初期化
   * ================================================================ */
  function bind() {
    $('#btn-new').addEventListener('click', newGame);
    $('#btn-continue').addEventListener('click', continueGame);
    $('#btn-howto').addEventListener('click', () => showHowto());
    $('#btn-menu').addEventListener('click', showMenu);
    $('#btn-log').addEventListener('click', showLog);
    $('#btn-deduce').addEventListener('click', confirmDeduction);
    $('#btn-abort').addEventListener('click', abortDeduction);
    $('#btn-scn-back').addEventListener('click', () => (navBack ? returnBack() : toTitle()));
    $('#btn-past-back').addEventListener('click', () => (navBack ? returnBack() : openScenario(null)));
    $('#btn-stories-back').addEventListener('click', () => (navBack ? returnBack() : openScenario(null)));
    $('#btn-reader-list').addEventListener('click', () => COLL[readerColl].open());
    $('#reader').addEventListener('click', e => {
      const el = e.target.closest('[data-cid]');
      if (el && readerColl === 'past') collectFromReader(el.dataset.cid);
    });
    $('#screen-reader').addEventListener('scroll', checkReaderEnd, { passive: true });
    window.addEventListener('scroll', checkReaderEnd, { passive: true });
    $('#btn-reader-prev').addEventListener('click', () => readerStep(-1));
    $('#btn-reader-next').addEventListener('click', () => readerStep(1));
    $('#btn-rain').addEventListener('click', () => {
      const on = Sound.toggle();
      $('#btn-rain').textContent = `${UI.soundLabel} ${on ? 'ON' : 'OFF'}`;
      $('#btn-rain').classList.toggle('on', !!on);
    });

    $('#map').addEventListener('click', e => {
      const g = e.target.closest('[data-loc]');
      if (g) goTo(g.dataset.loc);
    });
    $('#map').addEventListener('keydown', e => {
      const g = e.target.closest('[data-loc]');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); goTo(g.dataset.loc); }
    });

    $('#dialogue').addEventListener('click', e => {
      if (e.target.closest('#dlg-skip')) return;
      Dlg.advance();
    });
    $('#dlg-skip').addEventListener('click', e => { e.stopPropagation(); Dlg.skip(); });

    $('#modal').addEventListener('click', e => {
      if (e.target.id === 'modal' && modalClosable) closeModal(true);
    });

    document.addEventListener('keydown', e => {
      if (Dlg.active) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Dlg.advance(); }
        return;
      }
      if (e.key === 'Escape' && !$('#modal').classList.contains('hidden') && modalClosable) closeModal(true);
    });

    if (!SNOW) setInterval(() => {
      if (currentScreen === 'title' && Math.random() < 0.35) flash();
    }, 7000);
  }

  function applySeriesText() {
    document.title = `${G.title} ― ${G.subtitle}`;
    if (META.id) document.body.classList.add('series-' + META.id);
    const art = $('#title-art');
    if (art && META.art) art.innerHTML = META.art;
    const text = {
      title: G.title,
      subtitle: `― ${G.subtitle} ―`,
      no: META.no || '',
      scenarioBrand: `${G.title} ― シナリオ`,
      ch3Brand: `第三章　${CHAPTERS[2].name}`,
      dayNote: `<strong class="key">太字</strong>は重要な情報です。八人すべての物語を読むと、${chapterTitle(3)}へ進めます。物語は、あとからいつでも読み返せます。`,
      ...UI,
    };
    const snd = $('#btn-rain');
    snd.textContent = `${UI.soundLabel} OFF`;
    snd.title = `${UI.soundLabel}のオン／オフ`;
    document.querySelectorAll('[data-ui]').forEach(el => {
      const v = text[el.dataset.ui];
      if (typeof v !== 'string') return;
      if (el.dataset.attr) el.setAttribute(el.dataset.attr, v);
      else el.innerHTML = v;
    });
  }

  function init() {
    applySeriesText();
    Rain.init();
    bind();
    showScreen('title');
    renderTitle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
