/* MTBS Holýšov – nav menu + site-wide search (index.html + portal-svj.html)
 *
 * Included by both pages with <script src="site-search.js"></script> (placed last in <body>).
 * Each page sets <body data-page="index"> or <body data-page="portal">.
 *
 * How it works
 *  - The current page is indexed live from its own DOM.
 *  - The other page is fetched once (first time the search box is used) and indexed the same way,
 *    so there is no separate search index to keep up to date.
 *  - Choosing a result from the other page navigates there and scrolls to / highlights the
 *    matching element (or opens the service dialog / hub tab).
 *  - If the other page cannot be fetched (e.g. files opened via file://), search falls back to the
 *    current page only and says so.
 *
 * To make new content searchable, add a collector in collect() below.
 */
(function () {
  'use strict';

  const PAGES = {
    index:  { url: 'index.html',      label: 'Hlavní stránka' },
    portal: { url: 'portal-svj.html', label: 'Portál SVJ' }
  };
  const here  = document.body.dataset.page === 'portal' ? 'portal' : 'index';
  const other = here === 'portal' ? 'index' : 'portal';
  const KEY   = 'mtbs-search-target';

  const menuBtn   = document.getElementById('navMenuBtn');
  const menu      = document.getElementById('navMenu');
  const searchBtn = document.getElementById('navSearchBtn');
  const form      = document.getElementById('siteSearch');
  const input     = document.getElementById('siteSearchInput');
  const box       = document.getElementById('searchResults');
  if (!menu || !menuBtn || !form || !input || !box) return;

  /* ── Menu ─────────────────────────────────────────────────────────────── */
  menu.querySelectorAll('.nm-acc').forEach(btn => btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open);
    document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
  }));

  function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open);
    if (open) { setSearchBar(false); hideResults(); }
  }
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });

  /* ── Search bar (collapsed on narrow screens) ─────────────────────────── */
  function setSearchBar(open) {
    form.classList.toggle('open', open);
    if (searchBtn) searchBtn.setAttribute('aria-expanded', open);
    if (!open) hideResults();
  }
  if (searchBtn) searchBtn.addEventListener('click', () => {
    const open = !form.classList.contains('open');
    setSearchBar(open);
    if (open) { setMenu(false); input.focus(); }
  });

  /* ── Text helpers (diacritics-insensitive, length preserving) ─────────── */
  const fold  = s => s.split('').map(c => ((c.normalize('NFD')[0] || c).toLowerCase()[0] || c)).join('');
  const clean = s => s.replace(/\s+/g, ' ').trim();

  /* ── Indexing ─────────────────────────────────────────────────────────── */
  // Service popup texts live in a JS object on index.html. Locally we read it; for the fetched copy
  // we pull the entries out of the page source.
  function localDetails() {
    try { return typeof serviceDetails !== 'undefined' ? serviceDetails : {}; } catch (err) { return {}; }
  }
  function parseDetails(src) {
    const out = {};
    const re = /(\w+):\s*\{\s*title:\s*'([^']*)',\s*html:\s*`([^`]*)`/g;
    let m;
    while ((m = re.exec(src))) out[m[1]] = { title: m[2], html: m[3] };
    return out;
  }

  function collect(root, page, details) {
    const items = [];
    const q = (el, sel) => { const n = el.querySelector(sel); return n ? clean(n.textContent) : ''; };
    const each = (sel, fn) => root.querySelectorAll(sel).forEach((el, n) => {
      const o = fn(el);
      if (!o) return;
      o.page = page; o.sel = sel; o.n = n;
      o.text = clean(o.text); o.fText = fold(o.text); o.fTitle = fold(o.title);
      items.push(o);
    });

    // Hlavní stránka
    each('.about-text p', el => ({ sec: 'O nás', title: 'Kdo jsme a co děláme', text: el.textContent }));
    each('.av-cell', el => ({ sec: 'O nás', title: q(el, '.av-label'), text: q(el, '.av-label') + ' ' + q(el, '.av-sub') }));
    each('.srv-card', el => {
      let text = q(el, '.srv-name') + ' ' + q(el, '.srv-desc');
      const key = el.dataset.service;
      const d = key ? details[key] : null;
      if (d) { const tmp = document.createElement('div'); tmp.innerHTML = d.html; text += ' ' + tmp.textContent; }
      return { sec: 'Služby', title: q(el, '.srv-name'), text, service: !!key };
    });
    each('.news-card', el => ({ sec: 'Novinky', title: q(el, '.news-title'), text: q(el, '.news-tag') + ' ' + q(el, '.news-title') + ' ' + q(el, '.news-body') }));
    each('.person-card', el => {
      const role = q(el, '.pc-role');
      return { sec: 'Kontakt' + (role ? ' · ' + role : ''), title: q(el, '.pc-name'), text: role + ' ' + q(el, '.pc-name') + ' ' + q(el, '.pc-contacts') };
    });
    each('.contact-box .cb-eyebrow', el => {
      let text = clean(el.textContent);
      for (let s = el.nextElementSibling; s && !s.classList.contains('cb-eyebrow') && !s.classList.contains('cb-divider'); s = s.nextElementSibling) {
        if (!s.querySelector('iframe') && !s.classList.contains('map-thumb')) text += ' ' + s.textContent;
      }
      return { sec: 'Kontakt', title: clean(el.textContent), text };
    });
    each('#zadost .form-type-btn', el => ({ sec: 'Žádosti', title: q(el, '.form-type-name'), text: q(el, '.form-type-name') + ' ' + q(el, '.form-type-desc') }));
    each('.hub-panel', el => {
      const hub = el.closest('.hub');
      const hubTitle = q(hub, '.sec-title');
      const tabEl = hub.querySelector('.hub-tab[data-tab="' + el.dataset.tab + '"]');
      const label = tabEl ? clean(tabEl.textContent) : '';
      return { sec: hubTitle, title: label, text: hubTitle + ' ' + label + ' ' + el.textContent, route: hub.dataset.hub + '/' + el.dataset.tab };
    });

    // Portál SVJ
    each('.portal-card p', el => ({ sec: 'Portál SVJ', title: 'O portálu SVJ', text: el.textContent }));
    each('.portal-card li', el => ({ sec: 'Portál SVJ', title: clean(el.textContent).replace(/[,.]$/, ''), text: 'V portálu najdete ' + el.textContent }));

    return items;
  }

  let localItems = null;
  let remoteItems = [];
  let remoteState = 'idle';          // idle | loading | ok | fail

  function loadRemote() {
    if (remoteState !== 'idle') return;
    remoteState = 'loading';
    fetch(PAGES[other].url, { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
      .then(src => {
        const doc = new DOMParser().parseFromString(src, 'text/html');
        remoteItems = collect(doc, other, parseDetails(src));
        remoteState = 'ok';
        refresh();
      })
      .catch(() => { remoteState = 'fail'; refresh(); });
  }
  function refresh() { if (clean(input.value).length >= 2) render(); }

  /* ── Searching & rendering ────────────────────────────────────────────── */
  function search(terms) {
    const out = [];
    for (const it of localItems.concat(remoteItems)) {
      if (!terms.every(t => it.fText.includes(t))) continue;
      let score = it.page === here ? 1 : 0;
      terms.forEach(t => { if (it.fTitle.includes(t)) score += 10; });
      out.push({ it, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 10).map(r => r.it);
  }

  function appendMarked(parent, text, ftext, terms) {
    const marks = new Array(text.length).fill(false);
    terms.forEach(t => {
      let i = ftext.indexOf(t);
      while (i > -1) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = ftext.indexOf(t, i + 1); }
    });
    let i = 0;
    while (i < text.length) {
      let j = i;
      while (j < text.length && marks[j] === marks[i]) j++;
      const part = text.slice(i, j);
      if (marks[i]) { const m = document.createElement('mark'); m.textContent = part; parent.append(m); }
      else parent.append(part);
      i = j;
    }
  }

  function snippetFor(it, terms) {
    const f = it.fText;
    let pos = Infinity;
    terms.forEach(t => { const i = f.indexOf(t); if (i > -1 && i < pos) pos = i; });
    if (pos === Infinity) pos = 0;
    let start = Math.max(0, pos - 45);
    const sp = f.lastIndexOf(' ', start);
    if (sp > -1 && start - sp < 20) start = sp + 1;
    const end = Math.min(f.length, start + 150);
    const frag = document.createDocumentFragment();
    if (start > 0) frag.append('… ');
    appendMarked(frag, it.text.slice(start, end), f.slice(start, end), terms);
    if (end < f.length) frag.append(' …');
    return frag;
  }

  function hideResults() { box.hidden = true; box.textContent = ''; input.setAttribute('aria-expanded', 'false'); }

  function render() {
    const value = input.value;
    const terms = fold(value).split(/\s+/).filter(Boolean);
    if (clean(value).length < 2) { hideResults(); return; }
    if (!localItems) localItems = collect(document, here, localDetails());
    loadRemote();
    const list = search(terms);
    box.textContent = '';
    if (!list.length) {
      const d = document.createElement('div');
      d.className = 'sr-empty';
      d.textContent = remoteState === 'loading'
        ? 'Hledám…'
        : 'Pro „' + clean(value) + '“ jsme nic nenašli. Zkuste jiné slovo.';
      box.append(d);
    } else {
      list.forEach(it => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sr-item'; b.setAttribute('role', 'option');
        const sec = document.createElement('div'); sec.className = 'sr-sec';
        sec.textContent = it.sec + (it.page !== here ? ' · ' + PAGES[it.page].label : '');
        const title = document.createElement('div'); title.className = 'sr-title';
        appendMarked(title, it.title, it.fTitle, terms);
        const snip = document.createElement('div'); snip.className = 'sr-snip';
        snip.append(snippetFor(it, terms));
        b.append(sec, title, snip);
        b.addEventListener('click', () => go(it));
        box.append(b);
      });
    }
    if (remoteState === 'fail') {
      const n = document.createElement('div');
      n.className = 'sr-empty';
      n.textContent = 'Hledání teď probíhá jen na této stránce.';
      box.append(n);
    }
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  /* ── Navigating to a result ───────────────────────────────────────────── */
  function go(it) {
    hideResults(); setSearchBar(false); setMenu(false);
    if (it.page !== here) {
      if (it.route) { location.href = PAGES[it.page].url + '#' + it.route; return; }
      try { sessionStorage.setItem(KEY, JSON.stringify({ page: it.page, sel: it.sel, n: it.n, service: !!it.service, t: Date.now() })); } catch (err) {}
      location.href = PAGES[it.page].url;
      return;
    }
    show(it);
  }

  // Scroll to / highlight a result on the current page
  function show(it) {
    if (it.route) {
      if (location.hash === '#' + it.route) { window.scrollTo({ top: 0, behavior: 'instant' }); return; }
      location.hash = '#' + it.route;
      return;
    }
    const el = document.querySelectorAll(it.sel)[it.n];
    if (!el) return;
    if (document.body.classList.contains('hub-open')) {
      document.querySelectorAll('.hub').forEach(x => x.classList.remove('active'));
      document.body.classList.remove('hub-open');
      try { history.replaceState(null, '', location.pathname + location.search); } catch (err) {}
    }
    const panel = el.closest('.dept-panel');
    if (panel) {
      document.querySelectorAll('.dept-panel').forEach(p => p.classList.toggle('active', p === panel));
      const key = panel.id.replace('dept-', '');
      document.querySelectorAll('.ctab').forEach(b => b.classList.toggle('active', (b.getAttribute('onclick') || '').includes("'" + key + "'")));
    }
    const rev = el.closest('.reveal');
    if (rev) rev.classList.add('visible');
    el.classList.add('visible');
    const target = el.offsetParent === null ? el.closest('section') : el;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (it.service && typeof openServiceDialog === 'function') {
      setTimeout(() => openServiceDialog(el), 350);
    } else {
      target.classList.remove('search-flash'); void target.offsetWidth;
      target.classList.add('search-flash');
      setTimeout(() => target.classList.remove('search-flash'), 2100);
    }
  }

  // Result picked on the other page → finish the job after this page has loaded
  function runPending() {
    let p = null;
    try { p = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch (err) { return; }
    if (!p || p.page !== here || Date.now() - p.t > 15000) return;
    show(p);
  }
  if (document.readyState === 'complete') setTimeout(runPending, 200);
  else window.addEventListener('load', () => setTimeout(runPending, 250));

  /* ── Events ───────────────────────────────────────────────────────────── */
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { loadRemote(); if (clean(input.value).length >= 2) render(); });
  form.addEventListener('submit', e => { e.preventDefault(); const f = box.querySelector('.sr-item'); if (f) f.click(); });
  input.addEventListener('keydown', e => {
    const items = [...box.querySelectorAll('.sr-item')];
    if (!items.length) return;
    let i = items.findIndex(x => x.classList.contains('active'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (i > -1) items[i].classList.remove('active');
      i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[i].classList.add('active');
      items[i].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && i > -1) {
      e.preventDefault(); items[i].click();
    }
  });

  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    if (!form.contains(e.target) && !(searchBtn && searchBtn.contains(e.target))) { hideResults(); setSearchBar(false); }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!menu.hidden) { setMenu(false); menuBtn.focus(); }
    if (!box.hidden || form.classList.contains('open')) { hideResults(); setSearchBar(false); }
  });
})();
