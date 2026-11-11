/*
 * ページのスタイル（配色テーマ）
 * <head> で読み込み、描画の前に <html data-theme> を設定する。
 * .btn-theme ボタンを押すと、スタイルの一覧が開く。選んだスタイルはすべてのページで共通。
 */
(function () {
  'use strict';

  const KEY = 'casefile-theme';
  const THEMES = [
    { id: 'noir', name: 'ノワール', desc: '夜の闇と金の灯り（標準）', sw: ['#10131a', '#c9a45c', '#e8e3d8'] },
    { id: 'hiiro', name: '緋色', desc: '暗がりに滲む深紅', sw: ['#150c0e', '#d0545e', '#f0e4e1'] },
    { id: 'tsukikage', name: '月影', desc: '冷たい月光と銀', sw: ['#0c111a', '#a7bedc', '#e5eaf2'] },
    { id: 'chousho', name: '調書', desc: '古い捜査資料の紙とインク', sw: ['#efe5cf', '#8f3426', '#2a2018'] },
  ];
  const byId = id => THEMES.find(t => t.id === id);
  const root = document.documentElement;

  let current = 'noir';
  try { const saved = localStorage.getItem(KEY); if (byId(saved)) current = saved; } catch (e) { /* storage unavailable */ }
  root.dataset.theme = current;

  function label(btn) {
    if (btn.dataset.themeShown === current) return;
    btn.dataset.themeShown = current;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', btn === opener ? 'true' : 'false');
    btn.title = 'ページのスタイルを切り替える';
    btn.innerHTML = `<span class="bt-sw" aria-hidden="true"></span><span class="bt-label">スタイル：</span><span class="bt-name">${byId(current).name}</span>`;
  }
  const labelAll = () => document.querySelectorAll('.btn-theme').forEach(label);

  function apply(id) {
    if (!byId(id) || id === current) return;
    current = id;
    root.dataset.theme = id;
    try { localStorage.setItem(KEY, id); } catch (e) { /* storage unavailable */ }
    labelAll();
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: id } }));
  }

  /* ---------------- スタイルの一覧 ---------------- */
  let menu = null;
  let opener = null;

  function items() { return [...menu.querySelectorAll('.tm-item')]; }

  function build() {
    menu = document.createElement('div');
    menu.className = 'theme-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'ページのスタイル');
    menu.dataset.noruby = '';
    menu.innerHTML = '<div class="tm-title" aria-hidden="true">ページのスタイル</div>' + THEMES.map(t =>
      `<button type="button" class="tm-item" role="menuitemradio" data-theme-id="${t.id}">` +
      `<span class="tm-sw" aria-hidden="true" style="--a:${t.sw[0]};--b:${t.sw[1]};--c:${t.sw[2]}"></span>` +
      `<span><span class="tm-name">${t.name}</span><span class="tm-desc">${t.desc}</span></span>` +
      '<span class="tm-check" aria-hidden="true">✓</span></button>').join('');
    menu.addEventListener('click', e => {
      const it = e.target.closest('.tm-item');
      if (!it) return;
      apply(it.dataset.themeId);
      close(true);
    });
    menu.addEventListener('keydown', e => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      let next = null;
      if (e.key === 'ArrowDown') next = list[(i + 1) % list.length];
      else if (e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
      else if (e.key === 'Home') next = list[0];
      else if (e.key === 'End') next = list[list.length - 1];
      else if (e.key === 'Tab') close(false);
      if (next) { e.preventDefault(); next.focus({ preventScroll: true }); }
    });
  }

  function place() {
    const r = opener.getBoundingClientRect();
    const w = menu.offsetWidth;
    const hgt = menu.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + hgt > window.innerHeight - 8 && r.top - hgt - 6 > 8) top = r.top - hgt - 6;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function open(btn) {
    if (!menu) build();
    opener = btn;
    btn.setAttribute('aria-expanded', 'true');
    items().forEach(it => it.setAttribute('aria-checked', it.dataset.themeId === current ? 'true' : 'false'));
    document.body.append(menu);
    place();
    (items().find(it => it.dataset.themeId === current) || items()[0]).focus({ preventScroll: true });
  }

  function close(focusBack) {
    if (!menu || !menu.isConnected) return;
    menu.remove();
    if (opener) {
      opener.setAttribute('aria-expanded', 'false');
      if (focusBack && opener.isConnected) opener.focus({ preventScroll: true });
    }
    opener = null;
  }

  function init() {
    labelAll();
    new MutationObserver(muts => {
      for (const mu of muts) for (const n of mu.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches('.btn-theme')) label(n);
        else n.querySelectorAll('.btn-theme').forEach(label);
      }
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn-theme');
      if (btn) {
        e.stopPropagation();
        if (opener === btn) close(true);
        else { close(false); open(btn); }
        return;
      }
      if (menu && menu.isConnected && !menu.contains(e.target)) close(false);
    }, true);
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu && menu.isConnected) { e.stopPropagation(); close(true); }
    }, true);
    window.addEventListener('resize', () => close(false));
    document.addEventListener('scroll', e => { if (!menu || !menu.contains(e.target)) close(false); }, true);
  }

  window.Theme = { get: () => current, set: apply, list: THEMES.map(t => ({ id: t.id, name: t.name })) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
