(() => {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const I = window.Icons;

  const ui = {
    searchTerm: '',
    selecting: false,
    selection: {},
    expanded: {},
    addingLink: null,
    addStep: null,
    addingBoard: null,
    railExpanded: false,
    wpOpen: false,
    wpCollapsed: {}
  };

  function num(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }

  const CLOCK_FONTS = [
    { id: 'saira', label: 'Saira', family: 'Clock Saira', min: 50, max: 125, weight: 620 },
    { id: 'archivo', label: 'Archivo', family: 'Clock Archivo', min: 62, max: 125, weight: 640 },
    { id: 'encode', label: 'Encode Sans', family: 'Clock Encode', min: 75, max: 125, weight: 640 },
    { id: 'robotoflex', label: 'Roboto Flex', family: 'Clock Roboto Flex', min: 25, max: 151, weight: 640 },
    { id: 'asap', label: 'Asap', family: 'Clock Asap', min: 75, max: 125, weight: 640 }
  ];

  function clockFontById(id) {
    for (let i = 0; i < CLOCK_FONTS.length; i++) {
      if (CLOCK_FONTS[i].id === id) { return CLOCK_FONTS[i]; }
    }
    return CLOCK_FONTS[0];
  }

  function measureAxis(family, wdth) {
    const el = document.createElement('span');
    el.style.cssText =
      `position:absolute;left:-9999px;top:-9999px;white-space:pre;font-size:100px;font-family:"${family}";font-variation-settings:"wdth" ${wdth};`;
    el.textContent = '00:00';
    document.body.appendChild(el);
    const w = el.getBoundingClientRect().width;
    el.remove();
    return w;
  }

  function calibrateClockFont(font) {
    if (font.k) { return font; }
    font.base = Math.min(font.max, Math.max(font.min, 100));
    const w0 = measureAxis(font.family, font.base);
    const wMin = measureAxis(font.family, font.min);
    if (!w0 || !wMin || font.min === font.base) { font.k = 0; return font; }
    font.k = (wMin / w0 - 1) / (font.min - font.base);
    return font;
  }

  async function calibrateAllClockFonts() {
    if (!document.fonts || !document.fonts.load) {
      CLOCK_FONTS.forEach(calibrateClockFont);
      return;
    }
    await Promise.all(
      CLOCK_FONTS.map(f => document.fonts.load(`100px "${f.family}"`).catch(() => {}))
    );
    CLOCK_FONTS.forEach(calibrateClockFont);
  }

  function clockAxes(stretch, fontId) {
    const font = calibrateClockFont(clockFontById(fontId));
    const s = Math.max(0.1, num(stretch, 1));
    const want = 1 / s;

    if (!font.k) {
      return { wdth: font.base || 100, wght: font.weight, squeeze: Math.round(want * 1000) / 1000 };
    }

    let wdth = font.base + (want - 1) / font.k;
    wdth = Math.min(font.max, Math.max(font.min, wdth));

    const got = 1 + (wdth - font.base) * font.k;
    const squeeze = Math.min(1, want / got);

    const wght = Math.round(Math.min(900, Math.max(100,
      font.weight + (font.base - wdth) * 1.8)));

    return {
      wdth: Math.round(wdth * 10) / 10,
      wght,
      squeeze: Math.round(squeeze * 1000) / 1000
    };
  }

  function writeClockShadow(root, s) {
    if (s.clockShadow === false) {
      root.style.setProperty('--clock-shadow', 'none');
      return;
    }
    const angle = num(s.clockShadowAngle, 90) * Math.PI / 180;
    const distance = num(s.clockShadowDistance, 6);
    const x = Math.round(Math.cos(angle) * distance * 100) / 100;
    const y = Math.round(Math.sin(angle) * distance * 100) / 100;
    const blur = num(s.clockShadowBlur, 18);
    const rgba = hexToRgba(s.clockShadowColor || '#000000', num(s.clockShadowOpacity, 0.45));
    root.style.setProperty('--clock-shadow',
      `calc(${x}px * var(--clock-scale, 1)) calc(${y}px * var(--clock-scale, 1)) ` +
      `calc(${blur}px * var(--clock-scale, 1)) ${rgba}`);
  }

  function writeClockAxes(root, stretch, fontId) {
    const ax = clockAxes(stretch, fontId);
    root.style.setProperty('--clock-wdth', ax.wdth);
    root.style.setProperty('--clock-wght', ax.wght);
    root.style.setProperty('--clock-squeeze', ax.squeeze);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) { return ''; }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) { s = `https://${s}`; }
    try {
      const u = new URL(s);

      if (u.pathname === '/' && !u.search && !u.hash) {
        return u.origin;
      }
      return u.href;
    } catch { return ''; }
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  function faviconUrl(url) {
    let origin;
    try { origin = new URL(url).origin; } catch { return ''; }
    if (!origin || origin === 'null') { return ''; }
    return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64&url=${encodeURIComponent(origin)}`;
  }

  function colorFor(str) {
    let n = 0;
    for (let i = 0; i < str.length; i++) { n = (n * 31 + str.charCodeAt(i)) % 360; }
    return `hsl(${n} 52% 42%)`;
  }

  function hexToRgba(hex, alpha) {
    let h = String(hex || '#1a1a1f').replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    let n = parseInt(h, 16);
    if (isNaN(n)) { n = 0x1a1a1f; }
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  function toast(msg, isErr) {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast${isErr ? ' err' : ''}`;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); }, 320);
    }, 2600);
  }

  function fetchTitle(url) {
    const { promise, resolve } = Promise.withResolvers();
    const timer = setTimeout(() => resolve(null), 9000);
    const finish = title => { clearTimeout(timer); resolve(title); };

    try {
      chrome.runtime.sendMessage({ type: 'fetchTitle', url }, res => {
        finish(chrome.runtime.lastError ? null : res?.title || null);
      });
    } catch {
      finish(null);
    }
    return promise;
  }

  function prettyNameFromUrl(url) {
    const h = hostOf(url);
    if (!h) { return url; }
    const base = h.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  function resolveSrc(src) {
    if (!src) { return ''; }
    if (/^(data:|blob:|https?:|chrome-extension:)/.test(src)) { return src; }
    return chrome.runtime?.getURL ? chrome.runtime.getURL(src) : src;
  }

  function openUrl(url, forceNew) {
    const newTab = forceNew || Store.state.settings.openInNewTab;
    if (newTab) { window.open(url, '_blank', 'noopener'); }
    else { window.location.href = url; }
  }

  function applyTheme() {
    const s = Store.state.settings;
    const t = Store.currentTheme();
    const root = document.documentElement;

    root.setAttribute('data-mode', s.theme);
    root.setAttribute('data-compact', s.compactMode ? '1' : '0');
    root.setAttribute('data-shorten', s.shortenTitles ? '1' : '0');
    root.setAttribute('data-clock', s.showClock === false ? '0' : '1');
    writeClockPosition(root, s);
    root.style.setProperty('--clock-scale', num(s.clockScale, 1));
    root.style.setProperty('--clock-stretch', num(s.clockStretch, 1));
    root.style.setProperty('--clock-family',
      `"${clockFontById(s.clockFont).family}"`);
    root.style.setProperty('--clock-ink',
      s.clockColorMode === 'custom' ? (s.clockColor || '#ffffff') : t.primary);
    root.setAttribute('data-clock-glass', s.clockGlass ? '1' : '0');
    writeClockShadow(root, s);
    writeClockAxes(root, s.clockStretch, s.clockFont);

    clampClockIntoView();

    root.style.setProperty('--primary', t.primary);
    root.style.setProperty('--primary-soft', hexToRgba(t.primary, 0.16));
    root.style.setProperty('--on-primary', window.ColorUtil.onAccent(t.primary));

    const opacity = typeof t.opacity === 'number' ? t.opacity : 0.5;
    const blur = typeof t.blur === 'number' ? t.blur : 16;
    root.style.setProperty('--board-blur', `${blur}px`);
    root.style.setProperty('--board-bg', hexToRgba(t.board, opacity));
    root.style.setProperty('--board-filter', `blur(${blur}px) saturate(120%)`);
    root.style.setProperty('--panel-filter', `blur(${Math.max(blur, 14)}px) saturate(125%)`);

    const bg = $('#wallpaper');
    bg.style.backgroundColor = s.theme === 'light' ? '#efe9f2' : '#141418';
    bg.style.backgroundImage = t.wallpaperSrc
      ? `url("${resolveSrc(t.wallpaperSrc).replace(/"/g, '%22')}")`
      : 'none';

    document.body.classList.toggle('private', !!ui.private);
    document.body.classList.toggle('selecting', ui.selecting);
    document.body.classList.toggle('searching', !!ui.searchTerm);

    const rail = $('#rail');
    rail.classList.toggle('grouped', !!s.groupTools);
    rail.classList.toggle('expanded', ui.railExpanded);
  }

  function renderPages() {
    const host = $('#pages');
    host.innerHTML = '';
    const st = Store.state;

    st.pages.forEach((p, idx) => {
      const pill = document.createElement('div');
      pill.className = `page-pill${p.id === st.activePageId ? ' active' : ''}`;
      pill.dataset.pageId = p.id;

      const tab = document.createElement('button');
      tab.className = 'page-tab';
      tab.textContent = p.name;

      const caret = document.createElement('button');
      caret.className = 'page-caret';
      caret.title = 'Page options';
      caret.innerHTML = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M2 4.2h8L6 9z"/></svg>';

      pill.appendChild(tab);
      pill.appendChild(caret);

      tab.addEventListener('click', () => { Store.setActivePage(p.id); });

      caret.addEventListener('click', e => {
        e.stopPropagation();
        pill.classList.add('menu-open');
        const r = pill.getBoundingClientRect();
        pageMenu(r.left, r.bottom + 8, p, () => { pill.classList.remove('menu-open'); });
      });

      pill.addEventListener('contextmenu', e => {
        e.preventDefault();
        pill.classList.add('menu-open');
        pageMenu(e.clientX, e.clientY, p, () => { pill.classList.remove('menu-open'); });
      });

      pill.draggable = true;

      pill.addEventListener('dragstart', e => {
        startDrag({ kind: 'page', index: idx });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', p.name);
      });
      pill.addEventListener('dragend', endDrag);
      pill.addEventListener('dragover', e => {
        if (drag && (drag.kind === 'page' || drag.kind === 'board')) {
          e.preventDefault();
          pill.classList.add('drag-over');
        }
      });
      pill.addEventListener('dragleave', () => { pill.classList.remove('drag-over'); });
      pill.addEventListener('drop', e => {
        e.preventDefault();
        pill.classList.remove('drag-over');
        if (!drag) { return; }
        if (drag.kind === 'page') { Store.movePage(drag.index, idx); }
        else if (drag.kind === 'board') {
          Store.moveBoardToPage(drag.boardId, p.id);
          toast(`Board moved to "${p.name}"`);
        }
        endDrag();
      });

      host.appendChild(pill);
    });

    const add = document.createElement('button');
    add.className = 'page-add';
    add.title = 'Add page';
    add.innerHTML = I.svg('plusSm', 20);
    add.addEventListener('click', showAddPage);
    host.appendChild(add);
  }

  function showAddPage() {
    openModal(
      '<div class="modal">' +
      '<h2>Add New Page</h2>' +
      '<label>Page Name <span class="req">*</span></label>' +
      '<input class="field" id="pg-name" placeholder="Enter page name..." maxlength="40">' +
      '<div class="modal-actions">' +
      '<button class="btn" data-close>Cancel</button>' +
      '<button class="btn btn-primary" id="pg-create" style="flex:0 0 auto">Create Page</button>' +
      '</div></div>',
      root => {
        const input = $('#pg-name', root);
        input.focus();
        function create() {
          const v = input.value.trim();
          if (!v) { input.focus(); return; }
          Store.addPage(v);
          closeModal();
          toast(`Page "${v}" created`);
        }
        $('#pg-create', root).addEventListener('click', create);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { create(); } });
      }
    );
  }

  function promptRenamePage(p) {
    openModal(
      `<div class="modal"><h2>Rename Page</h2><label>Page Name <span class="req">*</span></label><input class="field" id="pg-name" maxlength="40" value="${esc(p.name)}"><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="pg-save" style="flex:0 0 auto">Save</button></div></div>`,
      root => {
        const input = $('#pg-name', root);
        input.focus();
        input.select();
        function save() {
          const v = input.value.trim();
          if (v) { Store.renamePage(p.id, v); }
          closeModal();
        }
        $('#pg-save', root).addEventListener('click', save);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { save(); } });
      }
    );
  }

  function boardCountOf(p) {
    let n = 0;
    p.columns.forEach(c => { n += c.length; });
    return n;
  }

  function confirmDeletePage(p) {
    const n = boardCountOf(p);
    openModal(
      `<div class="modal"><h2>Delete "${esc(p.name)}"?</h2><div class="row-sub" style="font-size:15px;line-height:1.5">This will move the page and all ${n} board${n === 1 ? '' : 's'} to trash. You can restore them from the Trash panel.</div><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="pg-confirm" style="flex:0 0 auto">Delete</button></div></div>`,
      root => {
        $('#pg-confirm', root).addEventListener('click', () => {
          if (Store.deletePage(p.id)) { toast('Page moved to trash'); }
          else { toast('You need at least one page', true); }
          closeModal();
        });
      }
    );
  }

  function sharePage(p) {
    const lines = [p.name];
    p.columns.forEach(col => {
      col.forEach(b => {
        lines.push('', b.title);
        b.links.forEach(l => { lines.push(`- ${l.title} -> ${l.url}`); });
      });
    });
    const text = lines.join('\n');
    openModal(
      `<div class="modal"><h2>Share Page</h2><div class="row-sub" style="margin-bottom:14px">Every board and bookmark on "${esc(p.name)}".</div><textarea class="field" id="sp-text" style="min-height:200px" readonly>${esc(text)}</textarea><div class="modal-actions"><button class="btn" data-close>Close</button><button class="btn btn-primary" id="sp-copy" style="flex:0 0 auto">Copy</button></div></div>`,
      root => {
        $('#sp-copy', root).addEventListener('click', async () => {
          await navigator.clipboard.writeText(text);
          toast('Page copied');
        });
      }
    );
  }

  function pageMenu(x, y, p, onClose) {
    const items = [
      { icon: 'pencil', label: 'Rename', fn() { promptRenamePage(p); } },
      { icon: 'share', label: 'Share Page', fn() { sharePage(p); } },
      { sep: true },
      { icon: 'trash', label: 'Delete', danger: true, fn() { confirmDeletePage(p); } }
    ];
    showMenu(x, y, items, onClose);
  }

  let drag = null;

  function startDrag(ctx) {
    drag = ctx;
    document.body.classList.add('dragging');
  }

  function endDrag() {
    drag = null;
    document.body.classList.remove('dragging');
    document.querySelectorAll('.drop-before, .drop-after, .dragging').forEach(n => {
      n.classList.remove('drop-before', 'drop-after', 'dragging');
    });
  }

  function visibleColumnCount() {
    const w = window.innerWidth;
    if (w <= 620) { return 1; }
    if (w <= 900) { return 2; }
    if (w <= 1240) { return 3; }
    return Store.COLS;
  }

  function matchesSearch(board) {
    const q = ui.searchTerm.toLowerCase();
    if (!q) { return { board: true, links: null }; }
    const titleHit = board.title.toLowerCase().includes(q);
    const linkHits = board.links.filter(l =>
      (l.title || '').toLowerCase().includes(q) ||
      (l.url || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q));
    return { board: titleHit || linkHits.length > 0, links: titleHit ? null : linkHits };
  }

  function renderGrid() {
    const grid = $('#grid');
    const page = Store.activePage();
    const n = visibleColumnCount();
    grid.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
    grid.innerHTML = '';

    const buckets = [];
    let i;
    for (i = 0; i < n; i++) { buckets.push([]); }
    page.columns.forEach((col, ci) => {
      col.forEach(b => { buckets[ci % n].push({ board: b, dataCol: ci }); });
    });

    buckets.forEach((items, ri) => {
      const colEl = document.createElement('div');
      colEl.className = 'column';
      colEl.dataset.col = ri;

      items.forEach(item => {
        const hit = matchesSearch(item.board);
        if (ui.searchTerm && !hit.board) { return; }
        colEl.appendChild(renderBoard(item.board, item.dataCol, hit.links));
      });

      if (ui.addingBoard === ri) {
        colEl.appendChild(renderAddBoardForm(ri));
      } else {
        const tail = document.createElement('div');
        tail.className = 'column-tail';
        const add = document.createElement('button');
        add.className = 'add-board';
        add.innerHTML = `${I.svg('plus', 26)}<span>Add Board</span>`;
        add.addEventListener('click', () => { ui.addingBoard = ri; render(); });
        tail.appendChild(add);
        colEl.appendChild(tail);
      }

      colEl.addEventListener('dragover', e => {
        if (!drag || drag.kind !== 'board') { return; }
        e.preventDefault();
      });
      colEl.addEventListener('drop', e => {
        if (!drag || drag.kind !== 'board') { return; }
        e.preventDefault();
        Store.moveBoard(drag.boardId, ri, undefined);
        endDrag();
      });

      grid.appendChild(colEl);
    });
  }

  function renderAddBoardForm(col) {
    const wrap = document.createElement('div');
    wrap.className = 'board';
    wrap.innerHTML =
      `<div class="form-row"><input class="field" id="nb-name" placeholder="Board name" maxlength="60"><button class="btn btn-primary" id="nb-add" style="flex:0 0 auto">Add</button><button class="icon-btn" id="nb-cancel">${I.svg('x', 18)}</button></div>`;
    setTimeout(() => {
      const input = $('#nb-name', wrap);
      if (!input) { return; }
      input.focus();
      function add() {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        ui.addingBoard = null;
        Store.addBoard(col, v);
      }
      $('#nb-add', wrap).addEventListener('click', add);
      $('#nb-cancel', wrap).addEventListener('click', () => { ui.addingBoard = null; render(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { add(); }
        if (e.key === 'Escape') { ui.addingBoard = null; render(); }
      });
    }, 0);
    return wrap;
  }

  function renderBoard(board, dataCol, filteredLinks) {
    const st = Store.state;
    const el = document.createElement('section');
    el.className = `board${ui.addingLink === board.id ? ' adding' : ''}${board.collapsed && !ui.searchTerm ? ' collapsed' : ''}`;
    el.dataset.boardId = board.id;

    const head = document.createElement('div');
    head.className = 'board-head';
    head.innerHTML =
      `<button class="board-collapse" data-act="collapse" title="${board.collapsed ? 'Expand board' : 'Collapse board'}">${I.svg('chevron', 15)}</button><div class="board-title">${esc(board.title)}</div><div class="board-actions"><button class="icon-btn${ui.addingLink === board.id ? ' on' : ''}" data-act="add" title="Add link">${I.svg('link', 17)}</button><button class="icon-btn" data-act="menu" title="Board menu">${I.svg('dots', 17)}</button></div>`;
    el.appendChild(head);

    head.querySelector('[data-act="collapse"]').addEventListener('click', e => {
      e.stopPropagation();
      Store.toggleBoardCollapsed(board.id);
    });

    const rule = document.createElement('div');
    rule.className = 'board-rule';
    el.appendChild(rule);

    const list = document.createElement('div');
    list.className = 'links';

    let links = filteredLinks || board.links;
    let limited = false;
    if (!ui.searchTerm && st.settings.hideExtraBookmarks && !ui.expanded[board.id] && links.length > 8) {
      links = links.slice(0, 8);
      limited = true;
    }

    links.forEach(l => { list.appendChild(renderLink(board, l)); });

    if (!links.length) {
      const empty = document.createElement('div');
      empty.className = 'board-empty';
      empty.textContent = ui.searchTerm ? 'No matches in this board.' : 'No bookmarks yet.';
      list.appendChild(empty);
    }
    el.appendChild(list);

    if (limited) {
      const more = document.createElement('button');
      more.className = 'board-more';
      more.textContent = `Show ${board.links.length - 8} more`;
      more.addEventListener('click', () => { ui.expanded[board.id] = true; render(); });
      el.appendChild(more);
    } else if (st.settings.hideExtraBookmarks && ui.expanded[board.id] && board.links.length > 8) {
      const less = document.createElement('button');
      less.className = 'board-more';
      less.textContent = 'Show less';
      less.addEventListener('click', () => { ui.expanded[board.id] = false; render(); });
      el.appendChild(less);
    }

    if (ui.addingLink === board.id) { el.appendChild(renderAddLinkForm(board)); }

    head.querySelector('[data-act="add"]').addEventListener('click', () => {
      ui.addingLink = board.id;
      ui.addStep = null;
      render();
    });
    head.querySelector('[data-act="menu"]').addEventListener('click', e => {
      e.stopPropagation();
      el.classList.add('menu-open');
      const r = e.currentTarget.getBoundingClientRect();
      boardMenu(r.right, r.bottom + 6, board, () => { el.classList.remove('menu-open'); });
    });

    head.querySelector('.board-title').addEventListener('dblclick', () => { editBoardTitle(el, board); });

    el.draggable = true;
    el.addEventListener('dragstart', e => {
      if (e.target.closest('.link') || e.target.closest('input') || e.target.closest('textarea')) {
        e.preventDefault();
        return;
      }
      startDrag({ kind: 'board', boardId: board.id });
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', board.title);
    });
    el.addEventListener('dragend', endDrag);
    el.addEventListener('dragover', e => {
      if (!drag || drag.kind !== 'board' || drag.boardId === board.id) { return; }
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      el.classList.toggle('drop-before', before);
      el.classList.toggle('drop-after', !before);
    });
    el.addEventListener('dragleave', () => { el.classList.remove('drop-before', 'drop-after'); });
    el.addEventListener('drop', e => {
      if (!drag || drag.kind !== 'board' || drag.boardId === board.id) { return; }
      e.preventDefault();
      e.stopPropagation();
      const before = el.classList.contains('drop-before');
      el.classList.remove('drop-before', 'drop-after');
      const target = Store.findBoard(board.id);
      if (target) { Store.moveBoard(drag.boardId, target.col, target.index + (before ? 0 : 1)); }
      endDrag();
    });

    return el;
  }

  function editBoardTitle(boardEl, board) {
    const titleEl = boardEl.querySelector('.board-title');
    const input = document.createElement('input');
    input.className = 'board-title-input';
    input.value = board.title;
    input.maxLength = 60;
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    function commit() {
      if (done) { return; }
      done = true;
      const v = input.value.trim();
      if (v && v !== board.title) { Store.renameBoard(board.id, v); }
      else { render(); }
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { commit(); }
      if (e.key === 'Escape') { done = true; render(); }
    });
  }

  function renderLink(board, l) {
    const st = Store.state;
    const a = document.createElement('a');
    a.className = `link${ui.selection[l.id] ? ' selected' : ''}`;
    a.href = l.url;
    a.dataset.linkId = l.id;
    if (st.settings.openInNewTab) { a.target = '_blank'; a.rel = 'noopener'; }

    const iconHtml = `<img class="link-icon" src="${esc(faviconUrl(l.url))}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="link-fallback" style="display:none;background:${colorFor(hostOf(l.url) || l.title)}">${esc((l.title || 'L').trim().charAt(0))}</span>`;

    const descHtml = (st.settings.showDescriptions && l.description)
      ? `<div class="link-desc">${esc(l.description)}</div>` : '';

    a.innerHTML =
      `<span class="link-check">${I.svg('check', 12)}</span>${iconHtml}<span class="link-body"><div class="link-title">${esc(l.title || l.url)}</div>${descHtml}</span><span class="link-tools"><button class="icon-btn" data-act="edit" title="Edit">${I.svg('pencil', 14)}</button><button class="icon-btn" data-act="del" title="Remove">${I.svg('trash', 14)}</button></span>`;

    a.addEventListener('click', e => {
      if (e.target.closest('[data-act]')) { e.preventDefault(); return; }
      if (ui.selecting) {
        e.preventDefault();
        if (ui.selection[l.id]) { delete ui.selection[l.id]; }
        else { ui.selection[l.id] = { boardId: board.id, link: l }; }
        render();
      }
    });

    a.addEventListener('contextmenu', e => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { icon: 'external', label: 'Open in new tab', fn() { window.open(l.url, '_blank', 'noopener'); } },
        { icon: 'link', label: 'Copy link', async fn() {
          await navigator.clipboard.writeText(l.url);
          toast('Link copied');
        } },
        { icon: 'refresh', label: 'Fetch title', fn() { refetchOne(board.id, l); } },
        { icon: 'pencil', label: 'Edit bookmark', fn() { editLink(board, l); } },
        { sep: true },
        { icon: 'trash', label: 'Remove', danger: true, fn() {
          Store.deleteLink(board.id, l.id);
          toast('Bookmark moved to trash');
        } }
      ]);
    });

    a.querySelector('[data-act="edit"]').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      editLink(board, l);
    });
    a.querySelector('[data-act="del"]').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      Store.deleteLink(board.id, l.id);
      toast('Bookmark moved to trash');
    });

    a.draggable = true;
    a.addEventListener('dragstart', e => {
      e.stopPropagation();
      startDrag({ kind: 'link', boardId: board.id, linkId: l.id });
      a.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', l.url);
    });
    a.addEventListener('dragend', endDrag);
    a.addEventListener('dragover', e => {
      if (!drag || drag.kind !== 'link' || drag.linkId === l.id) { return; }
      e.preventDefault();
      e.stopPropagation();
      const r = a.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      a.classList.toggle('drop-before', before);
      a.classList.toggle('drop-after', !before);
    });
    a.addEventListener('dragleave', () => { a.classList.remove('drop-before', 'drop-after'); });
    a.addEventListener('drop', e => {
      if (!drag || drag.kind !== 'link' || drag.linkId === l.id) { return; }
      e.preventDefault();
      e.stopPropagation();
      const before = a.classList.contains('drop-before');
      a.classList.remove('drop-before', 'drop-after');
      const target = Store.findBoard(board.id);
      if (!target) { return; }
      const idx = target.board.links.findIndex(x => x.id === l.id);
      Store.moveLink(drag.boardId, drag.linkId, board.id, idx + (before ? 0 : 1));
      endDrag();
    });

    return a;
  }

  const DESC_MAX = 2000;
  const SUPPORT_EMAIL = 'support.bookmarkle@gmail.com';

  function autoGrow(el, minRows) {
    const min = (minRows || 1) * 22 + 22;
    el.style.height = 'auto';
    el.style.height = `${Math.max(min, el.scrollHeight)}px`;
  }

  function renderAddLinkForm(board) {
    const wrap = document.createElement('div');
    wrap.className = 'link-form';

    if (!ui.addStep) {
      wrap.innerHTML =
        '<input class="lf-field" id="al-url" placeholder="https://example.com" autocomplete="off" spellcheck="false">' +
        '<div class="lf-actions">' +
        '<button class="lf-btn lf-btn-primary" id="al-next">Add Link</button>' +
        '<button class="lf-btn lf-btn-cancel" id="al-cancel">Cancel</button>' +
        '</div>';

      setTimeout(() => {
        const input = $('#al-url', wrap);
        if (!input) { return; }
        input.focus();
        const btn = $('#al-next', wrap);

        function next() {
          const url = normalizeUrl(input.value);
          if (!url) { toast('That does not look like a URL', true); input.focus(); return; }
          btn.disabled = true;
          btn.textContent = 'Fetching title...';
          fetchTitle(url).then(title => {
            ui.addStep = {
              url,
              title: title || prettyNameFromUrl(url),
              description: ''
            };
            render();
          });
        }

        btn.addEventListener('click', next);
        $('#al-cancel', wrap).addEventListener('click', cancelAdd);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); next(); }
          if (e.key === 'Escape') { cancelAdd(); }
        });
      }, 0);

      return wrap;
    }

    const step = ui.addStep;
    wrap.innerHTML =
      `<input class="lf-field lf-url" id="al-url2" value="${esc(step.url)}" spellcheck="false"><textarea class="lf-field lf-area" id="al-title" rows="1" maxlength="300" placeholder="Title">${esc(step.title)}</textarea><textarea class="lf-field lf-area" id="al-desc" rows="2" maxlength="${DESC_MAX}" placeholder="Optional description (shown below title)">${esc(step.description)}</textarea><div class="lf-count" id="al-count">${DESC_MAX - step.description.length}</div><div class="lf-actions"><button class="lf-btn lf-btn-primary" id="al-save">Add Link</button><button class="lf-btn lf-btn-cancel" id="al-cancel">Cancel</button></div>`;

    setTimeout(() => {
      const u = $('#al-url2', wrap);
      const t = $('#al-title', wrap);
      const d = $('#al-desc', wrap);
      if (!t) { return; }

      autoGrow(t, 1);
      autoGrow(d, 2);
      t.focus();
      t.select();

      t.addEventListener('input', () => { autoGrow(t, 1); });
      d.addEventListener('input', () => {
        autoGrow(d, 2);
        $('#al-count', wrap).textContent = DESC_MAX - d.value.length;
      });

      function save() {
        const url = normalizeUrl(u.value) || step.url;
        Store.addLink(board.id, {
          url,
          title: t.value.trim() || url,
          description: d.value.trim()
        });
        cancelAdd();
        toast('Bookmark added');
      }

      $('#al-save', wrap).addEventListener('click', save);
      $('#al-cancel', wrap).addEventListener('click', cancelAdd);

      [u, t].forEach(el => {
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { cancelAdd(); }
        });
      });
      d.addEventListener('keydown', e => {
        if (e.key === 'Escape') { cancelAdd(); }
      });
    }, 0);

    return wrap;
  }

  function cancelAdd() {
    ui.addingLink = null;
    ui.addStep = null;
    render();
  }

  function editLink(board, l) {
    openModal(
      `<div class="modal"><h2>Edit Bookmark</h2><label>Title</label><input class="field" id="ed-title" value="${esc(l.title)}" maxlength="200"><label style="margin-top:16px">URL</label><input class="field" id="ed-url" value="${esc(l.url)}"><label style="margin-top:16px">Description</label><textarea class="field" id="ed-desc" maxlength="2000" placeholder="Optional note shown under the title">${esc(l.description || '')}</textarea><div class="field-count"><span id="ed-count">${(l.description || '').length}</span>/2000</div><div class="modal-actions"><button class="btn" id="ed-fetch" style="margin-right:auto">Fetch title</button><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="ed-save" style="flex:0 0 auto">Save</button></div></div>`,
      root => {
        const t = $('#ed-title', root);
        const u = $('#ed-url', root);
        const d = $('#ed-desc', root);
        t.focus();
        d.addEventListener('input', () => { $('#ed-count', root).textContent = d.value.length; });
        $('#ed-fetch', root).addEventListener('click', function () {
          const btn = this;
          btn.disabled = true;
          btn.textContent = 'Fetching...';
          fetchTitle(normalizeUrl(u.value)).then(title => {
            btn.disabled = false;
            btn.textContent = 'Fetch title';
            if (title) { t.value = title; }
            else { toast('Could not read that page title', true); }
          });
        });
        $('#ed-save', root).addEventListener('click', () => {
          Store.updateLink(board.id, l.id, {
            title: t.value.trim() || l.url,
            url: normalizeUrl(u.value) || l.url,
            description: d.value.trim()
          });
          closeModal();
          toast('Bookmark updated');
        });
      }
    );
  }

  function refetchOne(boardId, l) {
    toast('Fetching title...');
    fetchTitle(l.url).then(title => {
      if (title) { Store.updateLink(boardId, l.id, { title }); toast('Title updated'); }
      else { toast('Could not read that page title', true); }
    });
  }

  function boardMenu(x, y, board, onClose) {
    showMenu(x, y, [
      {
        icon: 'external', label: 'Open All Links', fn() {
          if (!board.links.length) { toast('This board is empty', true); return; }
          board.links.forEach(l => { window.open(l.url, '_blank', 'noopener'); });
          toast(`Opened ${board.links.length} links`);
        }
      },
      {
        icon: 'refresh', label: 'Fetch All Titles', fn() { fetchAllTitles(board); }
      },
      {
        icon: 'pencil', label: 'Edit Board', fn() {
          const el = document.querySelector(`[data-board-id="${board.id}"]`);
          if (el) { editBoardTitle(el, board); }
        }
      },
      {
        icon: 'share', label: 'Share Board', fn() { shareBoard(board); }
      },
      { sep: true },
      {
        icon: 'trash', label: 'Delete Board', danger: true, fn() {
          Store.deleteBoard(board.id);
          toast('Board moved to trash');
        }
      }
    ], onClose, { alignRight: true });
  }

  function fetchAllTitles(board) {
    if (!board.links.length) { toast('This board is empty', true); return; }
    toast(`Fetching ${board.links.length} titles...`);
    let done = 0;
    let changed = 0;
    board.links.forEach(l => {
      fetchTitle(l.url).then(title => {
        done++;
        if (title && title !== l.title) { Store.updateLink(board.id, l.id, { title }); changed++; }
        if (done === board.links.length) {
          toast(changed ? `Updated ${changed} title${changed > 1 ? 's' : ''}` : 'All titles were already current');
        }
      });
    });
  }

  function shareBoard(board) {
    const text = `${board.title}\n${board.links.map(l => `- ${l.title} -> ${l.url}`).join('\n')}`;
    const json = JSON.stringify({ bookmarkle: 1, board }, null, 2);
    openModal(
      `<div class="modal"><h2>Share Board</h2><div class="row-sub" style="margin-bottom:14px">Copy this board as a plain list, or as JSON another Bookmarkle can import.</div><textarea class="field" id="sh-text" style="min-height:190px" readonly>${esc(text)}</textarea><div class="modal-actions"><button class="btn" id="sh-json" style="margin-right:auto">Show JSON</button><button class="btn" data-close>Close</button><button class="btn btn-primary" id="sh-copy" style="flex:0 0 auto">Copy</button></div></div>`,
      root => {
        const ta = $('#sh-text', root);
        let showingJson = false;
        $('#sh-json', root).addEventListener('click', function () {
          showingJson = !showingJson;
          ta.value = showingJson ? json : text;
          this.textContent = showingJson ? 'Show list' : 'Show JSON';
        });
        $('#sh-copy', root).addEventListener('click', async () => {
          await navigator.clipboard.writeText(ta.value);
          toast('Copied to clipboard');
        });
      }
    );
  }

  function showMenu(x, y, items, onClose, opts) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'menu';
    items.forEach(it => {
      if (it.sep) {
        const s = document.createElement('div');
        s.className = 'menu-sep';
        m.appendChild(s);
        return;
      }
      const b = document.createElement('button');
      b.className = `menu-item${it.danger ? ' danger' : ''}`;
      b.innerHTML = `${I.svg(it.icon, 17)}<span>${esc(it.label)}</span>`;
      b.addEventListener('click', () => { closeMenu(); it.fn(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);

    const r = m.getBoundingClientRect();
    let left = opts?.alignRight ? x - r.width : x;
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    m.style.left = `${left}px`;
    m.style.top = `${top}px`;

    m._onClose = onClose;
    setTimeout(() => { document.addEventListener('mousedown', outsideMenu); }, 0);
  }

  function outsideMenu(e) {
    if (!e.target.closest('.menu')) { closeMenu(); }
  }

  function closeMenu() {
    document.removeEventListener('mousedown', outsideMenu);
    document.querySelectorAll('.menu').forEach(m => {
      if (m._onClose) { m._onClose(); }
      m.remove();
    });
    document.querySelectorAll('.board.menu-open').forEach(b => { b.classList.remove('menu-open'); });
  }

  function openModal(html, wire) {
    const ov = $('#overlay');
    $('#overlay-content').innerHTML = html;
    ov.classList.add('open');
    ov.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', closeModal);
    });
    if (wire) { wire($('#overlay-content')); }
  }

  function closeModal() {
    $('#overlay').classList.remove('open');
    $('#overlay-content').innerHTML = '';
  }

  const SEARCH_URL = 'https://www.google.com/search?q=';

  let suggestTimer = null;
  let suggestSeq = 0;
  let suggestions = [];
  let suggestIndex = -1;

  function suggestBox() { return $('#search-suggest'); }

  function hideSuggestions() {
    suggestions = [];
    suggestIndex = -1;
    const box = suggestBox();
    if (box) { box.innerHTML = ''; box.classList.remove('open'); }
  }

  function renderSuggestions() {
    const box = suggestBox();
    if (!box) { return; }
    if (!suggestions.length) { hideSuggestions(); return; }
    box.innerHTML = '';
    suggestions.forEach((text, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `suggest-row${i === suggestIndex ? ' on' : ''}`;
      row.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
        ' stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>' +
        `<span>${esc(text)}</span>`;
      row.addEventListener('click', () => {
        hideSuggestions();
        runWebSearch(text, false);
      });
      box.appendChild(row);
    });
    box.classList.add('open');
  }

  function requestSuggestions(query) {
    clearTimeout(suggestTimer);
    const q = query.trim();
    if (!q) { hideSuggestions(); return; }
    suggestTimer = setTimeout(() => {
      const seq = ++suggestSeq;
      try {
        chrome.runtime.sendMessage({ type: 'suggest', q }, res => {
          if (seq !== suggestSeq) { return; }
          if (chrome.runtime.lastError) { return; }
          suggestions = (res && res.items) || [];
          suggestIndex = -1;
          renderSuggestions();
        });
      } catch { hideSuggestions(); }
    }, 140);
  }

  function moveSuggestion(step) {
    if (!suggestions.length) { return false; }
    suggestIndex += step;
    if (suggestIndex < -1) { suggestIndex = suggestions.length - 1; }
    if (suggestIndex >= suggestions.length) { suggestIndex = -1; }
    renderSuggestions();
    return true;
  }

  function focusSearch() {
    const input = $('#search-input');
    if (!input) { return; }
    input.focus();
    input.select();
  }

  function clearSearch() {
    ui.searchTerm = '';
    const input = $('#search-input');
    if (input) { input.value = ''; }
    hideSuggestions();
    render();
  }

  function runWebSearch(query, newTab) {
    const q = query.trim();
    if (!q) { return; }
    openUrl(SEARCH_URL + encodeURIComponent(q), newTab);
  }

  function firstResult() {
    const a = document.querySelector('#grid .link');
    return a ? a.href : null;
  }

  function toggleSelect() {
    ui.selecting = !ui.selecting;
    ui.selection = {};
    render();
  }

  function selectionList() {
    return Object.keys(ui.selection).map(k => ui.selection[k]);
  }

  function renderSelectBar() {
    const items = selectionList();
    $('#select-count').textContent = `${items.length} selected`;
    const sel = $('#sel-move');
    const current = sel.value;
    sel.innerHTML = '<option value="">Move to board...</option>';
    Store.allBoards().forEach(b => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.title;
      sel.appendChild(o);
    });
    sel.value = current;
  }

  function showTrash() {
    const st = Store.state;
    const body = st.trash.length
      ? st.trash.map(t => `<div class="list-item" data-id="${t.id}"><span class="tag">${t.kind}</span><div class="li-body"><div class="li-title">${esc(t.label || '(untitled)')}</div><div class="li-sub">${new Date(t.at).toLocaleString()}</div></div><button class="icon-btn" data-restore="${t.id}" title="Restore">${I.svg('restore', 16)}</button><button class="icon-btn" data-purge="${t.id}" title="Delete forever">${I.svg('trash', 16)}</button></div>`).join('')
      : '<div class="empty-state">Trash is empty.</div>';

    openModal(
      `<div class="modal"><h2>Trash</h2><div class="row-sub" style="margin-bottom:16px">Deleted bookmarks, boards and pages are kept here until you clear them.</div><div style="max-height:44vh;overflow:auto">${body}</div><div class="modal-actions">${st.trash.length ? '<button class="btn btn-danger" id="tr-empty" style="margin-right:auto">Empty Trash</button>' : ''}<button class="btn btn-primary" data-close style="flex:0 0 auto">Done</button></div></div>`,
      root => {
        root.querySelectorAll('[data-restore]').forEach(b => {
          b.addEventListener('click', () => {
            if (Store.restoreTrash(b.dataset.restore)) { toast('Restored'); }
            else { toast('Original board is gone', true); }
            closeModal();
            showTrash();
          });
        });
        root.querySelectorAll('[data-purge]').forEach(b => {
          b.addEventListener('click', () => {
            Store.removeTrash(b.dataset.purge);
            closeModal();
            showTrash();
          });
        });
        const em = $('#tr-empty', root);
        if (em) {
          em.addEventListener('click', () => {
            Store.emptyTrash();
            closeModal();
            toast('Trash emptied');
          });
        }
      }
    );
  }

  function showDataPanel() {
    openModal(
      '<div class="modal">' +
      '<h2>Your Data</h2>' +
      '<div class="row-sub" style="margin-bottom:18px">Everything is stored on this device only. Export a copy to back it up or move it to another browser.</div>' +
      '<div class="group" style="margin-bottom:14px"><div class="row" style="border:0">' +
      '<div class="row-text"><div class="row-title">Export</div>' +
      '<div class="row-sub">Download all pages, boards, bookmarks and wallpapers as JSON.</div></div>' +
      '<button class="btn btn-primary" id="dx-export" style="flex:0 0 auto">Download</button>' +
      '</div></div>' +
      '<div class="group" style="margin-bottom:14px"><div class="row" style="border:0">' +
      '<div class="row-text"><div class="row-title">Import</div>' +
      '<div class="row-sub">Replace everything with a previously exported file.</div></div>' +
      '<button class="btn" id="dx-import" style="flex:0 0 auto">Choose file</button>' +
      '</div></div>' +
      '<div class="group"><div class="row" style="border:0">' +
      '<div class="row-text"><div class="row-title">Save all open tabs</div>' +
      '<div class="row-sub">Adds every tab in this window to a new board.</div></div>' +
      '<button class="btn" id="dx-tabs" style="flex:0 0 auto">Save tabs</button>' +
      '</div></div>' +
      '<input type="file" id="dx-file" accept="application/json,.json" hidden>' +
      '<div class="modal-actions"><button class="btn" data-close>Close</button></div>' +
      '</div>',
      root => {
        $('#dx-export', root).addEventListener('click', () => {
          const blob = new Blob([Store.exportData()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `bookmarkle-backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); }, 4000);
          toast('Backup downloaded');
        });
        const file = $('#dx-file', root);
        $('#dx-import', root).addEventListener('click', () => { file.click(); });
        file.addEventListener('change', () => {
          const f = file.files[0];
          if (!f) { return; }
          const fr = new FileReader();
          fr.onload = () => {
            try {
              Store.importData(fr.result);
              closeModal();
              toast('Data imported');
            } catch {
              toast('That file could not be read', true);
            }
          };
          fr.readAsText(f);
        });
        $('#dx-tabs', root).addEventListener('click', () => {
          saveAllTabs();
          closeModal();
        });
      }
    );
  }

  const CHROME_BOARD_TITLE = 'Chrome Bookmarks';

  function flattenBookmarks(nodes, out, seen) {
    nodes.forEach(n => {
      if (n.children) { flattenBookmarks(n.children, out, seen); return; }
      if (!n.url || !/^https?:/i.test(n.url) || seen[n.url]) { return; }
      seen[n.url] = true;
      out.push({ url: n.url, title: n.title || n.url });
    });
    return out;
  }

  function importChromeBookmarks(btn) {
    if (!chrome.bookmarks || !chrome.bookmarks.getTree) {
      toast('Bookmark access is not available in this browser', true);
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Importing...'; }
    chrome.bookmarks.getTree(tree => {
      const links = flattenBookmarks(tree || [], [], {});
      if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
      if (!links.length) { toast('No bookmarks found in this profile', true); return; }

      let existing = null;
      Store.allBoards().forEach(b => {
        if (b.title === CHROME_BOARD_TITLE) { existing = b; }
      });

      if (existing) {
        Store.replaceBoardLinks(existing.id, links);
        toast(`Refreshed ${links.length} Chrome bookmarks`);
      } else {
        const board = Store.addBoard(0, CHROME_BOARD_TITLE);
        Store.replaceBoardLinks(board.id, links);
        toast(`Imported ${links.length} Chrome bookmarks`);
      }
    });
  }

  function saveAllTabs() {
    chrome.tabs.query({ currentWindow: true }, tabs => {
      const keep = tabs.filter(t => t.url && /^https?:/.test(t.url));
      if (!keep.length) { toast('No saveable tabs in this window', true); return; }
      const board = Store.addBoard(0, `Tabs ${new Date().toLocaleDateString()}`);
      keep.forEach(t => {
        Store.addLink(board.id, { url: t.url, title: t.title || t.url });
      });
      toast(`Saved ${keep.length} tabs`);
      if (Store.state.settings.closeTabsAfterSaveAll) {
        chrome.tabs.remove(keep.filter(t => !t.active).map(t => t.id));
      }
    });
  }

  let catalogData = null;

  function ensureCatalog() {
    if (catalogData) { return Promise.resolve(catalogData); }
    return Catalog.loadAll().then(d => {
      catalogData = d;
      return d;
    });
  }

  function panelPicks(isLight) {
    if (!catalogData) { return []; }
    return catalogData.remote.filter(w => w.isLight === isLight).slice(0, 24);
  }

  function wallpaperSections() {
    const st = Store.state;
    const isLight = st.settings.theme === 'light';
    const user = st.wallpapers.user.filter(w => w.isLight === isLight);
    const builtin = (catalogData ? catalogData.builtin : []).filter(w => w.isLight === isLight);
    const gallery = panelPicks(isLight);

    const out = [];
    if (user.length) { out.push({ key: 'yours', label: 'Your Wallpapers', items: user, editable: true }); }
    if (builtin.length) { out.push({ key: 'builtin', label: 'Starter Wallpapers', items: builtin, editable: false }); }
    if (gallery.length) { out.push({ key: 'gallery', label: 'From the Gallery', items: gallery, editable: false }); }
    return out;
  }

  function renderWallpaperPanel() {
    const st = Store.state;
    const t = Store.currentTheme();
    $('#mode-dark').classList.toggle('active', st.settings.theme === 'dark');
    $('#mode-light').classList.toggle('active', st.settings.theme === 'light');

    const host = $('#wp-scroll');
    const sections = wallpaperSections();

    if (!catalogData) {
      host.innerHTML = '<div class="empty-state">Loading wallpapers...</div>';
      ensureCatalog().then(() => { if (ui.wpOpen) { renderWallpaperPanel(); } });
      return;
    }

    host.innerHTML = '';

    sections.forEach(sec => {
      const wrap = document.createElement('div');
      wrap.className = `wp-section${ui.wpCollapsed[sec.key] ? ' collapsed' : ''}`;

      const head = document.createElement('button');
      head.className = 'wp-section-head';
      head.innerHTML = `<span>${esc(sec.label)}</span><span class="wp-count">${sec.items.length}</span><span class="wp-chev">${I.svg('chevron', 16)}</span>`;
      head.addEventListener('click', () => {
        ui.wpCollapsed[sec.key] = !ui.wpCollapsed[sec.key];
        renderWallpaperPanel();
      });
      wrap.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'wp-grid';

      sec.items.forEach(w => {
        const card = document.createElement('div');
        card.className = `wp-card${t.wallpaperId === w.id ? ' active' : ''}`;

        const thumb = document.createElement('div');
        thumb.className = 'wp-thumb';
        thumb.style.backgroundImage = `url("${resolveSrc(w.thumb || w.src).replace(/"/g, '%22')}")`;
        thumb.title = w.name;
        thumb.addEventListener('click', () => { applyWallpaper(w); });
        card.appendChild(thumb);

        const name = document.createElement('div');
        name.className = 'wp-name';
        name.textContent = w.name;
        card.appendChild(name);

        const tools = document.createElement('div');
        tools.className = 'wp-card-tools';

        const edit = document.createElement('button');
        edit.className = 'icon-btn';
        edit.title = 'Adjust style';
        edit.innerHTML = I.svg('pencil', 14);
        edit.addEventListener('click', () => { applyWallpaper(w); adjustStyleModal(w); });
        tools.appendChild(edit);

        const dl = document.createElement('button');
        dl.className = 'icon-btn';
        dl.title = 'Download';
        dl.innerHTML = I.svg('download', 14);
        dl.addEventListener('click', () => { downloadWallpaper(w); });
        tools.appendChild(dl);

        if (sec.editable) {
          const del = document.createElement('button');
          del.className = 'icon-btn';
          del.title = 'Remove';
          del.innerHTML = I.svg('trash', 14);
          del.addEventListener('click', () => {
            Store.deleteUserWallpaper(w.id);
            if (t.wallpaperId === w.id) { resetThemeWallpaper(); }
            toast('Wallpaper removed');
            renderWallpaperPanel();
          });
          tools.appendChild(del);
        }

        card.appendChild(tools);
        grid.appendChild(card);
      });

      wrap.appendChild(grid);
      host.appendChild(wrap);
    });

    if (catalogData.error) {
      const warn = document.createElement('div');
      warn.className = 'row-sub';
      warn.style.padding = '10px 0 4px';
      warn.textContent = 'Gallery unavailable offline - starter wallpapers still work.';
      host.appendChild(warn);
    }
  }

  function resetThemeWallpaper() {
    const isLight = Store.state.settings.theme === 'light';
    const pool = (catalogData ? catalogData.builtin : []).filter(w => w.isLight === isLight);
    if (pool.length) { Store.applyWallpaperToTheme(pool[0]); }
  }

  function applyWallpaper(w) {
    Store.applyWallpaperToTheme(w);
    toast(`Wallpaper applied to the ${Store.state.settings.theme === 'light' ? 'Light' : 'Dark'} theme`);
  }

  function downloadWallpaper(w) {
    const a = document.createElement('a');
    a.href = resolveSrc(w.src);
    a.download = `${String(w.name || 'wallpaper').replace(/\s+/g, '-').toLowerCase()}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    toast(`Downloading ${w.name}`);
  }

  const MAX_UPLOAD_MB = 100;

  function handleUpload(file) {
    if (!file) { return; }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast(`Please pick an image under ${MAX_UPLOAD_MB} MB`, true);
      return;
    }
    toast('Reading image...');
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const pal = ColorUtil.fromImage(img);
        const wp = Store.addUserWallpaper({
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My Wallpaper',
          src: fr.result,
          source: 'upload',
          isLight: pal.isLight,
          style: {
            primary: pal.accent,
            board: pal.isLight ? '#EFF0F1' : '#14161C',
            opacity: pal.isLight ? 0.35 : 0.5,
            blur: 16
          }
        });
        if (pal.isLight !== (Store.state.settings.theme === 'light')) {
          Store.setTheme(pal.isLight ? 'light' : 'dark');
        }
        applyWallpaper(wp);
        renderWallpaperPanel();
      };
      img.onerror = () => { toast('That image could not be read', true); };
      img.src = fr.result;
    };
    fr.onerror = () => { toast('That file could not be read', true); };
    fr.readAsDataURL(file);
  }

  function adjustStyleModal(w) {
    const t = Store.currentTheme();
    const isLight = Store.state.settings.theme === 'light';
    const snapshot = { primary: t.primary, board: t.board, opacity: t.opacity, blur: t.blur };

    function tile(id, label, value) {
      return `<div class="as-tile"><div class="as-tile-head"><span class="as-label">${label}</span><span class="as-value" id="${id}-hex">${esc(value.toUpperCase())}</span></div><label class="as-swatch" style="background:${esc(value)}"><input type="color" id="${id}" value="${esc(value)}"></label></div>`;
    }

    function slider(id, label, value, min, max, suffix) {
      return `<div class="as-tile as-tile-wide"><div class="as-tile-head"><span class="as-label">${label}</span><span class="as-value" id="${id}-out">${value}${suffix}</span></div><input type="range" class="as-range" id="${id}" min="${min}" max="${max}" value="${value}"></div>`;
    }

    openModal(
      `<div class="modal as-modal"><h2>Adjust Wallpaper Style</h2><p class="as-sub">${isLight ? 'Light' : 'Dark'} theme on this device.</p><div class="as-grid">${tile('as-primary', 'Primary Color', t.primary)}${tile('as-board', 'Board Color', t.board)}</div>${slider('as-opacity', 'Board Opacity', Math.round(t.opacity * 100), 0, 100, '%')}${slider('as-blur', 'Board Blur', t.blur, 0, 40, 'px')}<div class="as-actions"><button class="as-btn" id="as-cancel">Cancel</button><button class="as-btn" id="as-reset">Reset</button><button class="as-btn as-btn-save" id="as-save">Save</button></div></div>`,
      root => {
        const pc = $('#as-primary', root);
        const bc = $('#as-board', root);
        const op = $('#as-opacity', root);
        const bl = $('#as-blur', root);

        function paint() {
          $('#as-primary-hex', root).textContent = pc.value.toUpperCase();
          $('#as-board-hex', root).textContent = bc.value.toUpperCase();
          pc.parentNode.style.background = pc.value;
          bc.parentNode.style.background = bc.value;
          $('#as-opacity-out', root).textContent = `${op.value}%`;
          $('#as-blur-out', root).textContent = `${bl.value}px`;
        }

        function live() {
          Store.updateThemeStyle({
            primary: pc.value,
            board: bc.value,
            opacity: parseInt(op.value, 10) / 100,
            blur: parseInt(bl.value, 10)
          });
          paint();
        }

        [pc, bc, op, bl].forEach(el => {
          el.addEventListener('input', live);
        });

        $('#as-reset', root).addEventListener('click', () => {
          const base = w?.style ?? Store.defaultThemeStyle(isLight);
          pc.value = base.primary || snapshot.primary;
          bc.value = base.board || snapshot.board;
          op.value = Math.round((typeof base.opacity === 'number' ? base.opacity : snapshot.opacity) * 100);
          bl.value = typeof base.blur === 'number' ? base.blur : snapshot.blur;
          live();
        });

        $('#as-cancel', root).addEventListener('click', () => {
          Store.updateThemeStyle(snapshot);
          closeModal();
        });

        $('#as-save', root).addEventListener('click', () => {
          if (w && !w.builtin) {
            Store.updateUserWallpaper(w.id, {
              style: {
                primary: pc.value,
                board: bc.value,
                opacity: parseInt(op.value, 10) / 100,
                blur: parseInt(bl.value, 10)
              }
            });
          }
          closeModal();
          toast('Style saved');
        });

        paint();
      }
    );
  }

  function moreWallpapers() {
    chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
  }

  let settingsTab = 'general';

  function showSettings() {
    openModal('<div class="modal settings-modal" id="set-modal"></div>', () => { renderSettings(); });
  }

  function renderSettings() {
    const host = $('#set-modal');
    if (!host) { return; }
    const tabs = [
      ['general', I18n.t('nav.general'), 'gear'],
      ['account', I18n.t('nav.account'), 'user'],
      ['language', I18n.t('nav.language'), 'globe'],
      ['updates', I18n.t('nav.updates'), 'download'],
      ['support', I18n.t('nav.support'), 'bug']
    ];
    host.innerHTML =
      `<aside class="settings-nav"><h2>${I18n.t('nav.title')}</h2>${tabs.map(t => `<button class="nav-item${settingsTab === t[0] ? ' active' : ''}" data-tab="${t[0]}">${I.svg(t[2], 19)}<span>${t[1]}</span></button>`).join('')}</aside><div class="settings-body" id="set-body"><button class="settings-close" data-close>${I.svg('x', 18)}</button>${settingsBody()}</div>`;

    host.dir = I18n.current() === 'ar' ? 'rtl' : 'ltr';

    host.querySelectorAll('[data-tab]').forEach(b => {
      b.addEventListener('click', () => { settingsTab = b.dataset.tab; renderSettings(); });
    });
    host.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', closeModal);
    });
    wireSettings(host);
  }

  function toggleRow(key, title, sub) {
    const on = Store.state.settings[key];
    return `<div class="row"><div class="row-text"><div class="row-title">${title}</div><div class="row-sub">${sub}</div></div><button class="toggle${on ? ' on' : ''}" data-toggle="${key}"></button></div>`;
  }

  function settingsBody() {
    const st = Store.state;

    if (settingsTab === 'general') {
      const pageOpts = [`<option value="current"${st.settings.quickSaveDestination === 'current' ? ' selected' : ''}>${I18n.t('general.currentPage')}</option>`]
        .concat(st.pages.map(p => `<option value="${p.id}"${st.settings.quickSaveDestination === p.id ? ' selected' : ''}>${esc(p.name)}</option>`)).join('');

      return `<h1>${I18n.t('general.h1')}</h1><div class="settings-rule"></div><div class="group"><div class="group-title">${I18n.t('general.appearance')}</div>${toggleRow('compactMode', I18n.t('general.compact'), I18n.t('general.compactSub'))}${toggleRow('showClock', I18n.t('general.clock'), I18n.t('general.clockSub'))}${toggleRow('groupTools', I18n.t('general.group'), I18n.t('general.groupSub'))}${toggleRow('hideExtraBookmarks', I18n.t('general.hideExtra'), I18n.t('general.hideExtraSub'))}${toggleRow('shortenTitles', I18n.t('general.shorten'), I18n.t('general.shortenSub'))}</div><div class="group"><div class="group-title">${I18n.t('general.behavior')}</div>${toggleRow('openInNewTab', I18n.t('general.newTab'), I18n.t('general.newTabSub'))}${toggleRow('showDescriptions', I18n.t('general.desc'), I18n.t('general.descSub'))}${toggleRow('closeTabsAfterSaveAll', I18n.t('general.closeTabs'), I18n.t('general.closeTabsSub'))}<div class="row"><div class="row-text"><div class="row-title">${I18n.t('general.qs')}</div><div class="row-sub">${I18n.t('general.qsSub')}</div></div><select class="select" id="set-qs">${pageOpts}</select></div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('general.shortcut')}</div><div class="row-sub">${I18n.t('general.shortcutSub')}</div></div><span class="kbd">Ctrl+Shift+Y</span><button class="btn btn-sm" id="set-shortcut">${I18n.t('general.change')}</button></div></div>`;
    }

    if (settingsTab === 'account') {
      let boards = 0;
      let links = 0;
      st.pages.forEach(p => {
        p.columns.forEach(c => {
          boards += c.length;
          c.forEach(b => { links += b.links.length; });
        });
      });
      return `<h1>${I18n.t('account.h1')}</h1><div class="settings-rule"></div><div class="group"><div class="group-title">${I18n.t('account.device')}</div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('account.local')}</div><div class="row-sub">${I18n.t('account.localSub')}</div></div></div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('account.saved')}</div><div class="row-sub">${st.pages.length} ${I18n.t('account.pages')} &middot; ${boards} ${I18n.t('account.boards')} &middot; ${links} ${I18n.t('account.bookmarks')} &middot; ${st.wallpapers.user.length} ${I18n.t('account.wallpapers')}</div></div></div></div><div class="group"><div class="group-title">${I18n.t('account.data')}</div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('account.download')}</div><div class="row-sub">${I18n.t('account.downloadSub')}</div></div><button class="btn" id="set-export">${I18n.t('account.downloadBtn')}</button></div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('account.import')}</div><div class="row-sub">${I18n.t('account.importSub')}</div></div><button class="btn" id="set-import">${I18n.t('account.importBtn')}</button></div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('account.reset')}</div><div class="row-sub">${I18n.t('account.resetSub')}</div></div><button class="btn btn-danger" id="set-reset">${I18n.t('account.resetBtn')}</button></div></div><div class="group"><div class="group-title">${I18n.t('account.chrome')}</div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('account.chromeImport')}</div><div class="row-sub">${I18n.t('account.chromeSub')} ${I18n.t('account.chromeBoard', { board: CHROME_BOARD_TITLE })}</div></div><button class="btn" id="set-chrome-bm">${I18n.t('account.importBtn')}</button></div></div><input type="file" id="set-file" accept="application/json,.json" hidden>`;
    }

    if (settingsTab === 'updates') {
      return `<h1>${I18n.t('updates.h1')}</h1><div class="settings-rule"></div>` +
        `<div class="group"><div class="group-title">${I18n.t('updates.version')}</div><div class="row"><div class="row-text"><div class="row-title">Bookmarkle ${esc(window.UpdateCheck ? UpdateCheck.currentVersion() : '')}</div><div class="row-sub" id="ver-status">${I18n.t('updates.checkSub')}</div></div><button class="btn btn-sm" id="ver-get" style="display:none">${I18n.t('updates.download')}</button><button class="btn btn-sm" id="ver-check">${I18n.t('updates.check')}</button></div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('updates.project')}</div><div class="row-sub">${I18n.t('updates.projectSub')}</div></div><button class="btn btn-sm" id="ver-repo">${I18n.t('updates.openGithub')}</button></div></div>`;
    }
    if (settingsTab === 'language') {
      const langs = [
        ['auto', 'Automatic', 'Browser language'],
        ['en', 'English', ''],
        ['de', 'Deutsch', 'German'],
        ['nl', 'Nederlands', 'Dutch'],
        ['fr', 'Français', 'French'],
        ['ja', '日本語', 'Japanese'],
        ['ko', '한국어', 'Korean'],
        ['hi', 'हिन्दी', 'Hindi'],
        ['es', 'Español', 'Spanish'],
        ['pt', 'Português (Brasil)', 'Portuguese (Brazil)'],
        ['zh', '简体中文', 'Chinese (Simplified)'],
        ['id', 'Bahasa Indonesia', 'Indonesian'],
        ['ru', 'Русский', 'Russian'],
        ['it', 'Italiano', 'Italian'],
        ['tr', 'Türkçe', 'Turkish'],
        ['pl', 'Polski', 'Polish'],
        ['vi', 'Tiếng Việt', 'Vietnamese'],
        ['ar', 'العربية', 'Arabic']
      ];
      return `<h1>${I18n.t('language.h1')}</h1><div class="settings-rule"></div><input class="field" id="lang-q" placeholder="${I18n.t('language.search')}" style="margin-bottom:18px"><div class="row-sub" style="margin-bottom:16px">${I18n.t('language.note')}</div><div id="lang-list">${langs.map(l => {
    const active = st.settings.language === l[0];
    return `<button class="lang-item${active ? ' active' : ''}" data-lang="${l[0]}" data-search="${esc((`${l[1]} ${l[2]}`).toLowerCase())}"><span class="lang-name">${l[1]}</span>${l[2] ? `<span class="lang-en">${l[2]}</span>` : ''}<span class="lang-radio"></span></button>`;
  }).join('')}</div>`;
    }

    return `<h1>${I18n.t('support.h1')}</h1><div class="settings-rule"></div><div class="group"><div class="group-title">${I18n.t('support.report')}</div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('support.bug')}</div><div class="row-sub">${I18n.t('support.bugSub', { mail: `<a class="support-mail" href="mailto:${SUPPORT_EMAIL}?subject=Bookmarkle%20issue%20report">${SUPPORT_EMAIL}</a>` })}</div></div><button class="btn btn-sm" id="sup-copy">${I18n.t('support.copyMail')}</button></div></div><div class="group"><div class="group-title">${I18n.t('support.keyboard')}</div><div class="row"><div class="row-text"><div class="row-title">/ &middot; Ctrl+K</div><div class="row-sub">${I18n.t('support.kbSearch')}</div></div></div><div class="row"><div class="row-text"><div class="row-title">Esc</div><div class="row-sub">${I18n.t('support.kbEsc')}</div></div></div><div class="row"><div class="row-text"><div class="row-title">Ctrl+Shift+Y</div><div class="row-sub">${I18n.t('support.kbSave')}</div></div></div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('support.kbRenameKey')}</div><div class="row-sub">${I18n.t('support.kbRename')}</div></div></div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('support.kbMenuKey')}</div><div class="row-sub">${I18n.t('support.kbMenu')}</div></div></div></div><div class="group"><div class="group-title">${I18n.t('support.tips')}</div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('support.tipDrag')}</div><div class="row-sub">${I18n.t('support.tipDragSub')}</div></div></div><div class="row"><div class="row-text"><div class="row-title">${I18n.t('support.tipWall')}</div><div class="row-sub">${I18n.t('support.tipWallSub')}</div></div></div></div>`;
  }

  function wireSettings(host) {
    host.querySelectorAll('[data-toggle]').forEach(b => {
      b.addEventListener('click', () => {
        const k = b.dataset.toggle;
        Store.setSetting(k, !Store.state.settings[k]);
        renderSettings();
      });
    });

    const qs = $('#set-qs', host);
    if (qs) {
      qs.addEventListener('change', () => { Store.setSetting('quickSaveDestination', qs.value); });
    }

    const cbm = $('#set-chrome-bm', host);
    if (cbm) {
      cbm.addEventListener('click', () => { importChromeBookmarks(cbm); });
    }

    const sc = $('#set-shortcut', host);
    if (sc) {
      sc.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    }

    const ex = $('#set-export', host);
    if (ex) {
      ex.addEventListener('click', () => {
        const blob = new Blob([Store.exportData()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bookmarkle-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); }, 4000);
        toast('Backup downloaded');
      });
    }

    const imp = $('#set-import', host);
    const f = $('#set-file', host);
    if (imp && f) {
      imp.addEventListener('click', () => { f.click(); });
      f.addEventListener('change', () => {
        const file = f.files[0];
        if (!file) { return; }
        const fr = new FileReader();
        fr.onload = () => {
          try { Store.importData(fr.result); renderSettings(); toast('Data imported'); }
          catch { toast('That file could not be read', true); }
        };
        fr.readAsText(file);
      });
    }

    const rs = $('#set-reset', host);
    if (rs) {
      rs.addEventListener('click', () => {
        if (rs.dataset.armed) { Store.resetAll(); renderSettings(); toast(I18n.t('toast.reset')); return; }
        rs.dataset.armed = '1';
        rs.textContent = I18n.t('account.confirmReset');
        setTimeout(() => { delete rs.dataset.armed; rs.textContent = I18n.t('account.resetBtn'); }, 4000);
      });
    }

    host.querySelectorAll('[data-lang]').forEach(b => {
      b.addEventListener('click', () => {
        Store.setSetting('language', b.dataset.lang);
        I18n.setLanguage(b.dataset.lang);
        renderSettings();
      });
    });

    const verRepo = $('#ver-repo', host);
    if (verRepo) { verRepo.addEventListener('click', openRepo); }

    const verGet = $('#ver-get', host);
    if (verGet) { verGet.addEventListener('click', openRepo); }

    const verCheck = $('#ver-check', host);
    if (verCheck) {
      UpdateCheck.check(false).then(info => {
        if (info.latest && UpdateCheck.compare(info.latest, info.current) > 0) {
          $('#ver-status', host).textContent = I18n.t('updates.available', { v: info.latest });
          if (verGet) { verGet.style.display = ''; verGet.classList.add('btn-primary'); }
        }
      });

      verCheck.addEventListener('click', () => {
        const status = $('#ver-status', host);
        verCheck.disabled = true;
        status.textContent = I18n.t('updates.checking');
        UpdateCheck.check(true).then(info => {
          verCheck.disabled = false;
          if (info.error) {
            status.textContent = I18n.t('updates.unreachable', { err: info.error });
          } else if (info.latest && UpdateCheck.compare(info.latest, info.current) > 0) {
            status.textContent = I18n.t('updates.available', { v: info.latest });
            if (verGet) { verGet.style.display = ''; verGet.classList.add('btn-primary'); }
            toast(I18n.t('updates.toastAvailable', { v: info.latest }));
          } else {
            status.textContent = I18n.t('updates.latest');
            if (verGet) { verGet.style.display = 'none'; }
          }
        });
      });
    }

    const supCopy = $('#sup-copy', host);
    if (supCopy) {
      supCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(SUPPORT_EMAIL).then(() => {
          toast(I18n.t('toast.mailCopied'));
        });
      });
    }

    const lq = $('#lang-q', host);
    if (lq) {
      lq.addEventListener('input', () => {
        const q = lq.value.toLowerCase().trim();
        host.querySelectorAll('[data-search]').forEach(n => {
          n.style.display = !q || n.dataset.search.includes(q) ? '' : 'none';
        });
      });
    }
  }

  function render() {
    applyTheme();
    renderPages();
    renderGrid();
    renderSelectBar();
    if (ui.wpOpen) { renderWallpaperPanel(); }
  }

  function bind() {
    $('#search').addEventListener('submit', e => {
      e.preventDefault();
      runWebSearch($('#search-input').value, false);
    });

    $('#search-input').addEventListener('input', e => {
      ui.searchTerm = e.target.value.trim();
      applyTheme();
      renderGrid();
      requestSuggestions(e.target.value);
    });

    $('#search-input').addEventListener('blur', () => {
      setTimeout(hideSuggestions, 120);
    });
    $('#search-input').addEventListener('focus', e => {
      if (e.target.value.trim()) { requestSuggestions(e.target.value); }
    });

    $('#search-input').addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (suggestions.length) { hideSuggestions(); return; }
        if (ui.searchTerm) { clearSearch(); } else { e.target.blur(); }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (moveSuggestion(e.key === 'ArrowDown' ? 1 : -1)) { e.preventDefault(); }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();

        const picked = suggestIndex >= 0 ? suggestions[suggestIndex] : e.target.value;
        hideSuggestions();
        runWebSearch(picked, e.ctrlKey || e.metaKey);
      }
    });

    $('#search-clear').addEventListener('click', () => {
      clearSearch();
      focusSearch();
    });

    $('#btn-data').addEventListener('click', showDataPanel);
    $('#btn-trash').addEventListener('click', showTrash);
    $('#btn-select').addEventListener('click', toggleSelect);
    $('#btn-settings').addEventListener('click', showSettings);

    $('#btn-private').addEventListener('click', () => {
      ui.private = !ui.private;
      $('#btn-private').classList.toggle('on', !!ui.private);
      applyTheme();
      toast(ui.private ? 'Bookmark titles blurred' : 'Privacy blur off');
    });

    $('#btn-zen').addEventListener('click', () => {
      const body = document.body;
      const all = body.classList.contains('zen');
      const clockOnly = body.classList.contains('zen-clock');
      body.classList.remove('zen');
      body.classList.remove('zen-clock');
      if (!all && !clockOnly) { body.classList.add('zen'); }
      else if (all) { body.classList.add('zen-clock'); }
    });
    $('#zen-exit').addEventListener('click', () => {
      document.body.classList.remove('zen-clock');
      document.body.classList.remove('zen');
    });

    $('#btn-rail-toggle').addEventListener('click', () => {
      ui.railExpanded = !ui.railExpanded;
      $('#btn-rail-toggle').innerHTML = ui.railExpanded ? I.svg('x', 22) : I.svg('grip', 22);
      applyTheme();
    });

    $('#sel-done').addEventListener('click', toggleSelect);
    $('#sel-open').addEventListener('click', () => {
      const items = selectionList();
      if (!items.length) { return; }
      items.forEach(s => { window.open(s.link.url, '_blank', 'noopener'); });
    });
    $('#sel-delete').addEventListener('click', () => {
      const items = selectionList();
      items.forEach(s => { Store.deleteLink(s.boardId, s.link.id); });
      ui.selection = {};
      toast(`${items.length} bookmarks moved to trash`);
    });
    $('#sel-move').addEventListener('change', function () {
      const target = this.value;
      if (!target) { return; }
      selectionList().forEach(s => {
        Store.moveLink(s.boardId, s.link.id, target);
      });
      ui.selection = {};
      this.value = '';
      toast('Bookmarks moved');
    });

    $('#wallpaper-btn').addEventListener('click', e => {
      e.stopPropagation();
      ui.wpOpen = !ui.wpOpen;
      $('#wp-panel').classList.toggle('open', ui.wpOpen);
      $('#wallpaper-btn').classList.toggle('on', ui.wpOpen);
      if (ui.wpOpen) { renderWallpaperPanel(); }
    });
    document.addEventListener('mousedown', e => {
      if (!ui.wpOpen) { return; }
      if (e.target.closest('#wp-panel') || e.target.closest('#wallpaper-btn') || e.target.closest('.overlay')) { return; }
      ui.wpOpen = false;
      $('#wp-panel').classList.remove('open');
      $('#wallpaper-btn').classList.remove('on');
    });

    $('#mode-dark').addEventListener('click', () => { Store.setTheme('dark'); });
    $('#mode-light').addEventListener('click', () => { Store.setTheme('light'); });
    $('#wp-upload').addEventListener('click', () => { $('#wp-file').click(); });
    $('#wp-file').addEventListener('change', function () {
      handleUpload(this.files[0]);
      this.value = '';
    });
    $('#wp-more').addEventListener('click', moreWallpapers);

    $('#overlay').addEventListener('mousedown', e => {
      if (e.target === $('#overlay')) { closeModal(); }
    });

    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === 'Escape') {
        if ($('#overlay').classList.contains('open')) { closeModal(); return; }
        if (ui.searchTerm) { clearSearch(); return; }
        if (document.body.classList.contains('zen') ||
            document.body.classList.contains('zen-clock')) {
          document.body.classList.remove('zen');
          document.body.classList.remove('zen-clock');
          return;
        }
        if (ui.selecting) { toggleSelect(); return; }
        closeMenu();
        return;
      }
      if (typing) { return; }

      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        focusSearch();
      }
    });

    window.addEventListener('resize', () => {
      clearTimeout(window._lumiResize);
      window._lumiResize = setTimeout(renderGrid, 140);
    });

    chrome.runtime.onMessage.addListener(msg => {
      if (msg?.type === 'refresh') { render(); }
    });
  }

  function openRepo() {
    const url = UpdateCheck.REPO_URL;
    try {
      if (chrome.tabs?.create) {
        chrome.tabs.create({ url });
        return;
      }
    } catch {  }
    window.open(url, '_blank', 'noopener');
  }

  function showUpdateBanner(info) {
    const el = $('#update-banner');
    if (!el) { return; }
    $('#ub-title').textContent = I18n.t('updates.bannerTitle', { v: info.latest });
    $('#ub-sub').textContent = I18n.t('updates.bannerSub', { cur: info.current });
    $('#ub-later').textContent = I18n.t('updates.later');
    $('#ub-get').textContent = I18n.t('updates.get');
    el.classList.add('open');

    $('#ub-get').addEventListener('click', () => {
      openRepo();
      UpdateCheck.dismiss(info.latest);
      el.classList.remove('open');
    });
    $('#ub-later').addEventListener('click', () => {
      UpdateCheck.dismiss(info.latest);
      el.classList.remove('open');
    });
  }

  function runUpdateCheck() {
    if (!window.UpdateCheck) { return; }
    UpdateCheck.pending().then(info => {
      if (info) { showUpdateBanner(info); }
    });
  }

  let clampClockIntoView = () => {};

  function writeClockPosition(root, s) {
    const ax = s.clockAnchorX || 'center';
    const ay = s.clockAnchorY || 'top';
    const ox = num(s.clockOffsetX, 0);
    const oy = num(s.clockOffsetY, 60);

    if (ax === 'right') {
      root.style.setProperty('--clock-left', 'auto');
      root.style.setProperty('--clock-right', `${ox}px`);
      root.style.setProperty('--clock-tx', '0');
    } else if (ax === 'left') {
      root.style.setProperty('--clock-left', `${ox}px`);
      root.style.setProperty('--clock-right', 'auto');
      root.style.setProperty('--clock-tx', '0');
    } else {
      root.style.setProperty('--clock-left', `calc(50% + ${ox}px)`);
      root.style.setProperty('--clock-right', 'auto');
      root.style.setProperty('--clock-tx', '-50%');
    }

    if (ay === 'bottom') {
      root.style.setProperty('--clock-top', 'auto');
      root.style.setProperty('--clock-bottom', `${oy}px`);
      root.style.setProperty('--clock-ty', '0');
    } else if (ay === 'top') {
      root.style.setProperty('--clock-top', `${oy}px`);
      root.style.setProperty('--clock-bottom', 'auto');
      root.style.setProperty('--clock-ty', '0');
    } else {
      root.style.setProperty('--clock-top', `calc(50% + ${oy}px)`);
      root.style.setProperty('--clock-bottom', 'auto');
      root.style.setProperty('--clock-ty', '-50%');
    }
  }

  const CLOCK_MIN_SCALE = 0.35;
  const CLOCK_MAX_SCALE = 3;
  const CLOCK_MIN_STRETCH = 0.6;
  const CLOCK_MAX_STRETCH = 2.6;

  function refreshClockGlass() {
    const host = $('#clock');
    const el = $('#clock-time');
    const defs = $('#clock-defs');
    if (!host || !el || !defs) { return; }

    const svg = defs.firstChild;
    const mask = $('#clock-glass-mask', defs);
    const text = $('#clock-glass-text', defs);
    if (!svg || !mask || !text) { return; }

    const box = host.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    const cs = window.getComputedStyle(el);

    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    mask.setAttribute('x', 0);
    mask.setAttribute('y', 0);
    mask.setAttribute('width', w);
    mask.setAttribute('height', h);

    const cx = er.left - box.left + er.width / 2;
    const cy = er.top - box.top + er.height / 2;

    text.textContent = el.textContent;
    text.style.cssText =
      `font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};font-variation-settings:${cs.fontVariationSettings};letter-spacing:${cs.letterSpacing};fill:#fff;`;

    text.setAttribute('transform', '');
    text.setAttribute('x', cx);
    text.setAttribute('y', cy);

    let bb = null;
    try { bb = text.getBBox(); } catch { bb = null; }
    if (bb?.width) {
      text.setAttribute('x', cx + (cx - (bb.x + bb.width / 2)));
      text.setAttribute('y', cy + (cy - (bb.y + bb.height / 2)));
    }

    let squeeze = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--clock-squeeze')
    );
    if (!isFinite(squeeze) || squeeze <= 0) { squeeze = 1; }
    if (squeeze !== 1) {
      text.setAttribute('transform',
        `translate(${cx} ${cy}) scale(${squeeze} 1) translate(${-cx} ${-cy})`);
    }
  }

  function clockPropsMenu(x, y) {
    const st = Store.state.settings;
    const wrap = document.createElement('div');
    wrap.className = 'menu clock-props';

    function section(title) {
      const h = document.createElement('div');
      h.className = 'menu-head';
      h.textContent = title;
      wrap.appendChild(h);
    }

    section('Font');
    const fonts = document.createElement('div');
    fonts.className = 'clock-fonts';
    CLOCK_FONTS.forEach(f => {
      const b = document.createElement('button');
      b.className = `clock-font${st.clockFont === f.id ? ' on' : ''}`;
      b.style.fontFamily = `"${f.family}"`;
      b.textContent = '12';
      b.title = f.label;
      b.addEventListener('click', () => {
        Store.setSetting('clockFont', f.id);
        fonts.querySelectorAll('.clock-font').forEach(n => {
          n.classList.remove('on');
        });
        b.classList.add('on');
        refreshClockGlass();
      });
      fonts.appendChild(b);
    });
    wrap.appendChild(fonts);

    section('Colour');
    const colours = document.createElement('div');
    colours.className = 'clock-colours';

    const accent = document.createElement('button');
    const custom = document.createElement('button');
    function markMode(mode) {
      accent.classList.toggle('btn-primary', mode !== 'custom');
      custom.classList.toggle('btn-primary', mode === 'custom');
    }

    accent.className = 'btn btn-sm';
    accent.textContent = 'Accent';
    accent.addEventListener('click', () => {
      Store.setSetting('clockColorMode', 'accent');
      markMode('accent');
    });

    custom.className = 'btn btn-sm';
    custom.textContent = 'Custom';
    custom.addEventListener('click', () => {
      Store.setSetting('clockColorMode', 'custom');
      markMode('custom');
    });

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'clock-swatch';
    swatch.value = st.clockColor || '#ffffff';
    swatch.title = 'Pick a colour';
    swatch.addEventListener('input', () => {
      Store.setSetting('clockColor', swatch.value);

      Store.setSetting('clockColorMode', 'custom');
      markMode('custom');
    });

    markMode(st.clockColorMode);
    colours.appendChild(accent);
    colours.appendChild(custom);
    colours.appendChild(swatch);
    wrap.appendChild(colours);

    section('Style');
    const glassRow = document.createElement('div');
    glassRow.className = 'clock-row';
    const label = document.createElement('span');
    label.textContent = 'Glass';
    const tog = document.createElement('button');
    tog.className = `toggle${st.clockGlass ? ' on' : ''}`;
    tog.addEventListener('click', () => {
      const next = !Store.state.settings.clockGlass;
      Store.setSetting('clockGlass', next);
      tog.classList.toggle('on', next);
      refreshClockGlass();
    });
    glassRow.appendChild(label);
    glassRow.appendChild(tog);
    wrap.appendChild(glassRow);

    section('Shadow');

    const shadowRow = document.createElement('div');
    shadowRow.className = 'clock-row';
    const shadowLabel = document.createElement('span');
    shadowLabel.textContent = 'Drop shadow';
    const shadowTog = document.createElement('button');
    shadowTog.className = `toggle${st.clockShadow === false ? '' : ' on'}`;
    shadowTog.addEventListener('click', () => {
      const next = Store.state.settings.clockShadow === false;
      Store.setSetting('clockShadow', next);
      shadowTog.classList.toggle('on', next);
      shadowFields.classList.toggle('off', !next);
    });
    shadowRow.appendChild(shadowLabel);
    shadowRow.appendChild(shadowTog);
    wrap.appendChild(shadowRow);

    const shadowFields = document.createElement('div');
    shadowFields.className = `clock-shadow${st.clockShadow === false ? ' off' : ''}`;

    function slider(key, label, min, max, step, unit, fallback) {
      const row = document.createElement('label');
      row.className = 'clock-slider';
      const head = document.createElement('span');
      const name = document.createElement('span');
      name.textContent = label;
      const out = document.createElement('b');
      const value = () => num(Store.state.settings[key], fallback);
      out.textContent = `${value()}${unit}`;
      head.appendChild(name);
      head.appendChild(out);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = value();
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        Store.setSetting(key, v);
        out.textContent = `${v}${unit}`;
      });

      row.appendChild(head);
      row.appendChild(input);
      shadowFields.appendChild(row);
      return input;
    }

    const colourRow = document.createElement('label');
    colourRow.className = 'clock-slider';
    const colourHead = document.createElement('span');
    colourHead.innerHTML = '<span>Colour</span>';
    const shadowSwatch = document.createElement('input');
    shadowSwatch.type = 'color';
    shadowSwatch.className = 'clock-swatch';
    shadowSwatch.value = st.clockShadowColor || '#000000';
    shadowSwatch.addEventListener('input', () => {
      Store.setSetting('clockShadowColor', shadowSwatch.value);
    });
    colourHead.appendChild(shadowSwatch);
    colourRow.appendChild(colourHead);
    shadowFields.appendChild(colourRow);

    const angleInput = slider('clockShadowAngle', 'Direction', 0, 360, 1, '\u00B0', 90);
    const distInput = slider('clockShadowDistance', 'Distance', 0, 40, 1, 'px', 6);
    const blurInput = slider('clockShadowBlur', 'Blur', 0, 60, 1, 'px', 18);
    const opacityInput = slider('clockShadowOpacity', 'Opacity', 0, 1, 0.05, '', 0.45);

    const shadowReset = document.createElement('button');
    shadowReset.className = 'btn btn-sm';
    shadowReset.textContent = 'Reset shadow';
    shadowReset.addEventListener('click', () => {
      resetClock(CLOCK_SHADOW_KEYS);
      const d = Store.defaultSettings();
      shadowTog.classList.toggle('on', d.clockShadow !== false);
      shadowFields.classList.toggle('off', d.clockShadow === false);
      shadowSwatch.value = d.clockShadowColor;
      angleInput.value = d.clockShadowAngle;
      distInput.value = d.clockShadowDistance;
      blurInput.value = d.clockShadowBlur;
      opacityInput.value = d.clockShadowOpacity;

      shadowFields.querySelectorAll('.clock-slider').forEach(row => {
        const input = row.querySelector('input[type=range]');
        const out = row.querySelector('b');
        if (input && out) { out.textContent = out.textContent.replace(/^[\d.]+/, input.value); }
      });
    });

    const resetRow = document.createElement('div');
    resetRow.className = 'clock-colours';
    resetRow.appendChild(shadowReset);
    shadowFields.appendChild(resetRow);

    wrap.appendChild(shadowFields);

    section('Reset');
    const resets = document.createElement('div');
    resets.className = 'clock-colours';

    const toHome = document.createElement('button');
    toHome.className = 'btn btn-sm';
    toHome.textContent = 'Position';
    toHome.title = 'Move the clock back to its default place';
    toHome.addEventListener('click', () => {
      resetClock(CLOCK_POSITION_KEYS);
      refreshClockGlass();
    });

    const toDefaults = document.createElement('button');
    toDefaults.className = 'btn btn-sm';
    toDefaults.textContent = 'Everything';
    toDefaults.title = 'Put every clock setting back to default';
    toDefaults.addEventListener('click', () => {
      resetClock(CLOCK_KEYS);
      const st2 = Store.state.settings;

      fonts.querySelectorAll('.clock-font').forEach((n, i) => {
        n.classList.toggle('on', CLOCK_FONTS[i].id === st2.clockFont);
      });
      markMode(st2.clockColorMode);
      swatch.value = st2.clockColor || '#ffffff';
      tog.classList.toggle('on', !!st2.clockGlass);
      refreshClockGlass();
    });

    resets.appendChild(toHome);
    resets.appendChild(toDefaults);
    wrap.appendChild(resets);

    document.body.appendChild(wrap);
    document.body.classList.add('clock-menu');
    const r = wrap.getBoundingClientRect();
    wrap.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 12))}px`;
    wrap.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 12))}px`;

    function close(e) {
      if (e && wrap.contains(e.target)) { return; }
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('clock-menu');
      wrap.remove();
    }
    function onKey(e) { if (e.key === 'Escape') { close(); } }
    setTimeout(() => {
      document.addEventListener('pointerdown', close, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
  }

  const CLOCK_KEYS = [
    'clockFont', 'clockColorMode', 'clockColor', 'clockGlass',
    'clockScale', 'clockStretch', 'clockX', 'clockY',
    'clockAnchorX', 'clockAnchorY', 'clockOffsetX', 'clockOffsetY',
    'clockShadow', 'clockShadowColor', 'clockShadowAngle',
    'clockShadowDistance', 'clockShadowBlur', 'clockShadowOpacity'
  ];

  const CLOCK_POSITION_KEYS = [
    'clockAnchorX', 'clockAnchorY', 'clockOffsetX', 'clockOffsetY',
    'clockX', 'clockY'
  ];

  const CLOCK_SHADOW_KEYS = [
    'clockShadow', 'clockShadowColor', 'clockShadowAngle',
    'clockShadowDistance', 'clockShadowBlur', 'clockShadowOpacity'
  ];

  function resetClock(keys) {
    const d = Store.defaultSettings();
    keys.forEach(k => { Store.setSetting(k, d[k]); });
  }

  function makeClockInteractive() {
    const host = $('#clock');
    if (!host) { return; }

    function grip(id) {
      const el = document.createElement('div');
      el.id = id;
      el.className = 'clock-grip';
      host.appendChild(el);
      return el;
    }

    const defs = document.createElement('div');
    defs.id = 'clock-defs';
    defs.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<defs><mask id="clock-glass-mask" maskUnits="userSpaceOnUse">' +
      '<text id="clock-glass-text" text-anchor="middle"' +
      ' dominant-baseline="central"></text>' +
      '</mask></defs></svg>';
    host.appendChild(defs);

    const glass = document.createElement('div');
    glass.id = 'clock-glass';
    glass.style.setProperty('--clock-glass-mask', 'url(#clock-glass-mask)');
    host.insertBefore(glass, host.firstChild);

    host.addEventListener('contextmenu', e => {
      e.preventDefault();
      clockPropsMenu(e.clientX, e.clientY);
    });

    host.addEventListener('pointerenter', () => {
      document.body.classList.add('clock-hover');
    });
    host.addEventListener('pointerleave', () => {
      document.body.classList.remove('clock-hover');
    });

    const gripV = grip('clock-grip-v');
    const gripH = grip('clock-grip-h');
    gripV.title = 'Drag to stretch';
    gripH.title = 'Drag to resize';

    let drag = null;

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

    function centre() {
      const box = host.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, box };
    }

    function commitPosition(left, top) {
      const box = host.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const x = clamp(left, 0, Math.max(0, vw - box.width));
      const y = clamp(top, 0, Math.max(0, vh - box.height));
      const midX = x + box.width / 2;
      const midY = y + box.height / 2;

      let anchorX = 'center';
      let offsetX = Math.round(midX - vw / 2);
      if (midX < vw / 3) { anchorX = 'left'; offsetX = Math.round(x); }
      else if (midX > vw * 2 / 3) { anchorX = 'right'; offsetX = Math.round(vw - (x + box.width)); }

      let anchorY = 'center';
      let offsetY = Math.round(midY - vh / 2);
      if (midY < vh / 3) { anchorY = 'top'; offsetY = Math.round(y); }
      else if (midY > vh * 2 / 3) { anchorY = 'bottom'; offsetY = Math.round(vh - (y + box.height)); }

      const at = {
        clockAnchorX: anchorX, clockAnchorY: anchorY,
        clockOffsetX: offsetX, clockOffsetY: offsetY
      };
      writeClockPosition(document.documentElement, at);
      return at;
    }

    host.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target === gripV || e.target === gripH) { return; }
      const box = host.getBoundingClientRect();
      drag = { kind: 'move', dx: e.clientX - box.left, dy: e.clientY - box.top, moved: false };
      host.setPointerCapture(e.pointerId);
      host.classList.add('dragging');
      document.body.classList.add('clock-dragging');
      e.preventDefault();
    });

    function startResize(el, kind) {
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0) { return; }
        const c = centre();
        const st = Store.state.settings;
        drag = {
          kind,
          from: Math.max(10, kind === 'stretch'
            ? Math.abs(e.clientY - c.y)
            : Math.abs(e.clientX - c.x)),
          base: num(kind === 'stretch' ? st.clockStretch : st.clockScale, 1)
        };
        el.setPointerCapture(e.pointerId);
        host.classList.add('sizing');
        e.preventDefault();
        e.stopPropagation();
      });
    }
    startResize(gripV, 'stretch');
    startResize(gripH, 'scale');

    function onMove(e) {
      if (!drag) { return; }
      if (drag.kind === 'move') {
        drag.moved = true;
        drag.last = commitPosition(e.clientX - drag.dx, e.clientY - drag.dy);
        return;
      }
      const c = centre();
      if (drag.kind === 'stretch') {
        drag.value = clamp(drag.base * (Math.abs(e.clientY - c.y) / drag.from),
          CLOCK_MIN_STRETCH, CLOCK_MAX_STRETCH);
        document.documentElement.style.setProperty('--clock-stretch', drag.value);
        writeClockAxes(document.documentElement, drag.value, Store.state.settings.clockFont);
        refreshClockGlass();
      } else {
        drag.value = clamp(drag.base * (Math.abs(e.clientX - c.x) / drag.from),
          CLOCK_MIN_SCALE, CLOCK_MAX_SCALE);
        document.documentElement.style.setProperty('--clock-scale', drag.value);

        refreshClockGlass();
      }
    }

    function onUp() {
      if (!drag) { return; }
      function saveAt(at) {
        Store.setSetting('clockAnchorX', at.clockAnchorX);
        Store.setSetting('clockAnchorY', at.clockAnchorY);
        Store.setSetting('clockOffsetX', at.clockOffsetX);
        Store.setSetting('clockOffsetY', at.clockOffsetY);
      }

      if (drag.kind === 'move') {
        if (drag.moved && drag.last) { saveAt(drag.last); }
      } else if (typeof drag.value === 'number') {
        Store.setSetting(drag.kind === 'stretch' ? 'clockStretch' : 'clockScale', drag.value);

        const box = host.getBoundingClientRect();
        saveAt(commitPosition(box.left, box.top));
      }
      drag = null;
      host.classList.remove('dragging');
      host.classList.remove('sizing');
      document.body.classList.remove('clock-dragging');
      refreshClockGlass();
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);

    clampClockIntoView = () => {
      refreshClockGlass();
      if (drag) { return; }
      const box = host.getBoundingClientRect();
      if (!box.width) { return; }

      const overflows = box.left < 0 || box.top < 0 ||
        box.right > window.innerWidth || box.bottom > window.innerHeight;
      if (overflows) { commitPosition(box.left, box.top); }
    };

    if (Store.state.settings.clockNeedsAnchor) {
      const s = Store.state.settings;
      const box = host.getBoundingClientRect();
      if (box.width) {
        const left = num(s.clockX, 50) / 100 * window.innerWidth - box.width / 2;
        const top = num(s.clockY, 10) / 100 * window.innerHeight - box.height / 2;
        const at = commitPosition(left, top);
        Store.setSetting('clockAnchorX', at.clockAnchorX);
        Store.setSetting('clockAnchorY', at.clockAnchorY);
        Store.setSetting('clockOffsetX', at.clockOffsetX);
        Store.setSetting('clockOffsetY', at.clockOffsetY);
      }
      Store.setSetting('clockNeedsAnchor', false);
    }

    window.addEventListener('resize', clampClockIntoView);
    clampClockIntoView();
  }

  function startClock() {
    const el = $("#clock-time");
    if (!el) { return; }

    function readClock() {
      if (globalThis.Temporal) {
        const t = Temporal.Now.plainTimeISO();
        return { hour: t.hour, minute: t.minute, second: t.second, ms: t.millisecond };
      }
      const d = new Date();
      return {
        hour: d.getHours(), minute: d.getMinutes(),
        second: d.getSeconds(), ms: d.getMilliseconds()
      };
    }

    function paint() {
      const now = readClock();
      const hour = now.hour % 12 || 12;
      el.textContent = `${hour}:${String(now.minute).padStart(2, '0')}`;
      refreshClockGlass();
      return now;
    }

    function schedule() {
      const now = paint();
      const ms = (60 - now.second) * 1000 - now.ms;
      setTimeout(schedule, Math.max(ms, 1000));
    }

    schedule();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { paint(); }
    });
  }

  (async () => {
    await Store.load();
    I18n.setLanguage(Store.state.settings.language);
    Store.subscribe(render);
    bind();
    startClock();
    makeClockInteractive();
    $('#btn-rail-toggle').innerHTML = I.svg('grip', 22);
    render();

    await calibrateAllClockFonts();
    render();
    refreshClockGlass();

    setTimeout(runUpdateCheck, 1200);
  })();
})();
