(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var I = window.Icons;

  var ui = {
    searchTerm: '',
    searching: false,
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

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) { return ''; }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) { s = 'https://' + s; }
    try {
      var u = new URL(s);

      if (u.pathname === '/' && !u.search && !u.hash) {
        return u.origin;
      }
      return u.href;
    } catch (e) { return ''; }
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function faviconUrl(url) {
    var origin;
    try { origin = new URL(url).origin; } catch (e) { return ''; }
    if (!origin || origin === 'null') { return ''; }
    return 'https://t1.gstatic.com/faviconV2'
      + '?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64'
      + '&url=' + encodeURIComponent(origin);
  }

  function colorFor(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) { n = (n * 31 + str.charCodeAt(i)) % 360; }
    return 'hsl(' + n + ' 52% 42%)';
  }

  function hexToRgba(hex, alpha) {
    var h = String(hex || '#1a1a1f').replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var n = parseInt(h, 16);
    if (isNaN(n)) { n = 0x1a1a1f; }
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function toast(msg, isErr) {
    var host = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, 2600);
  }

  function fetchTitle(url) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 9000);
      try {
        chrome.runtime.sendMessage({ type: 'fetchTitle', url: url }, function (res) {
          if (done) { return; }
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(res && res.title ? res.title : null);
        });
      } catch (e) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  function prettyNameFromUrl(url) {
    var h = hostOf(url);
    if (!h) { return url; }
    var base = h.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  function resolveSrc(src) {
    if (!src) { return ''; }
    if (/^(data:|blob:|https?:|chrome-extension:)/.test(src)) { return src; }
    return chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL(src) : src;
  }

  function openUrl(url, forceNew) {
    var newTab = forceNew || Store.state.settings.openInNewTab;
    if (newTab) { window.open(url, '_blank', 'noopener'); }
    else { window.location.href = url; }
  }

  function applyTheme() {
    var s = Store.state.settings;
    var t = Store.currentTheme();
    var root = document.documentElement;

    root.setAttribute('data-mode', s.theme);
    root.setAttribute('data-compact', s.compactMode ? '1' : '0');
    root.setAttribute('data-shorten', s.shortenTitles ? '1' : '0');

    root.style.setProperty('--primary', t.primary);
    root.style.setProperty('--primary-soft', hexToRgba(t.primary, 0.16));
    root.style.setProperty('--on-primary', window.ColorUtil.onAccent(t.primary));

    var opacity = typeof t.opacity === 'number' ? t.opacity : 0.5;
    var blur = typeof t.blur === 'number' ? t.blur : 16;
    root.style.setProperty('--board-blur', blur + 'px');
    root.style.setProperty('--board-bg', hexToRgba(t.board, opacity));
    root.style.setProperty('--board-filter', 'blur(' + blur + 'px) saturate(120%)');
    root.style.setProperty('--panel-filter', 'blur(' + Math.max(blur, 14) + 'px) saturate(125%)');

    var bg = $('#wallpaper');
    bg.style.backgroundColor = s.theme === 'light' ? '#efe9f2' : '#141418';
    bg.style.backgroundImage = t.wallpaperSrc
      ? 'url("' + resolveSrc(t.wallpaperSrc).replace(/"/g, '%22') + '")'
      : 'none';

    document.body.classList.toggle('private', !!ui.private);
    document.body.classList.toggle('selecting', ui.selecting);
    document.body.classList.toggle('searching', ui.searching && !!ui.searchTerm);

    var rail = $('#rail');
    rail.classList.toggle('grouped', !!s.groupTools);
    rail.classList.toggle('expanded', ui.railExpanded);
  }

  function renderPages() {
    var host = $('#pages');
    host.innerHTML = '';
    var st = Store.state;

    st.pages.forEach(function (p, idx) {
      var pill = document.createElement('div');
      pill.className = 'page-pill' + (p.id === st.activePageId ? ' active' : '');
      pill.dataset.pageId = p.id;

      var b = document.createElement('button');
      b.className = 'page-tab';
      b.textContent = p.name;

      var caret = document.createElement('button');
      caret.className = 'page-caret';
      caret.title = 'Page options';
      caret.innerHTML = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M2 4.2h8L6 9z"/></svg>';

      pill.appendChild(b);
      pill.appendChild(caret);

      b.addEventListener('click', function () { Store.setActivePage(p.id); });

      caret.addEventListener('click', function (e) {
        e.stopPropagation();
        pill.classList.add('menu-open');
        var r = pill.getBoundingClientRect();
        pageMenu(r.left, r.bottom + 8, p, function () { pill.classList.remove('menu-open'); });
      });

      pill.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        pill.classList.add('menu-open');
        pageMenu(e.clientX, e.clientY, p, function () { pill.classList.remove('menu-open'); });
      });

      var b = pill;
      b.draggable = true;

      b.addEventListener('dragstart', function (e) {
        startDrag({ kind: 'page', index: idx });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', p.name);
      });
      b.addEventListener('dragend', endDrag);
      b.addEventListener('dragover', function (e) {
        if (drag && drag.kind === 'page') { e.preventDefault(); b.classList.add('drag-over'); }
        else if (drag && drag.kind === 'board') { e.preventDefault(); b.classList.add('drag-over'); }
      });
      b.addEventListener('dragleave', function () { b.classList.remove('drag-over'); });
      b.addEventListener('drop', function (e) {
        e.preventDefault();
        b.classList.remove('drag-over');
        if (!drag) { return; }
        if (drag.kind === 'page') { Store.movePage(drag.index, idx); }
        else if (drag.kind === 'board') {
          Store.moveBoardToPage(drag.boardId, p.id);
          toast('Board moved to "' + p.name + '"');
        }
        endDrag();
      });

      host.appendChild(b);
    });

    var add = document.createElement('button');
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
      function (root) {
        var input = $('#pg-name', root);
        input.focus();
        function create() {
          var v = input.value.trim();
          if (!v) { input.focus(); return; }
          Store.addPage(v);
          closeModal();
          toast('Page "' + v + '" created');
        }
        $('#pg-create', root).addEventListener('click', create);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { create(); } });
      }
    );
  }

  function promptRenamePage(p) {
    openModal(
      '<div class="modal">' +
      '<h2>Rename Page</h2>' +
      '<label>Page Name <span class="req">*</span></label>' +
      '<input class="field" id="pg-name" maxlength="40" value="' + esc(p.name) + '">' +
      '<div class="modal-actions">' +
      '<button class="btn" data-close>Cancel</button>' +
      '<button class="btn btn-primary" id="pg-save" style="flex:0 0 auto">Save</button>' +
      '</div></div>',
      function (root) {
        var input = $('#pg-name', root);
        input.focus();
        input.select();
        function save() {
          var v = input.value.trim();
          if (v) { Store.renamePage(p.id, v); }
          closeModal();
        }
        $('#pg-save', root).addEventListener('click', save);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { save(); } });
      }
    );
  }

  function boardCountOf(p) {
    var n = 0;
    p.columns.forEach(function (c) { n += c.length; });
    return n;
  }

  function confirmDeletePage(p) {
    var n = boardCountOf(p);
    openModal(
      '<div class="modal">' +
      '<h2>Delete "' + esc(p.name) + '"?</h2>' +
      '<div class="row-sub" style="font-size:15px;line-height:1.5">' +
      'This will move the page and all ' + n + ' board' + (n === 1 ? '' : 's') +
      ' to trash. You can restore them from the Trash panel.</div>' +
      '<div class="modal-actions">' +
      '<button class="btn" data-close>Cancel</button>' +
      '<button class="btn btn-danger" id="pg-confirm" style="flex:0 0 auto">Delete</button>' +
      '</div></div>',
      function (root) {
        $('#pg-confirm', root).addEventListener('click', function () {
          if (Store.deletePage(p.id)) { toast('Page moved to trash'); }
          else { toast('You need at least one page', true); }
          closeModal();
        });
      }
    );
  }

  function sharePage(p) {
    var lines = [p.name];
    p.columns.forEach(function (col) {
      col.forEach(function (b) {
        lines.push('', b.title);
        b.links.forEach(function (l) { lines.push('- ' + l.title + ' -> ' + l.url); });
      });
    });
    var text = lines.join('\n');
    openModal(
      '<div class="modal">' +
      '<h2>Share Page</h2>' +
      '<div class="row-sub" style="margin-bottom:14px">Every board and bookmark on "' + esc(p.name) + '".</div>' +
      '<textarea class="field" id="sp-text" style="min-height:200px" readonly>' + esc(text) + '</textarea>' +
      '<div class="modal-actions">' +
      '<button class="btn" data-close>Close</button>' +
      '<button class="btn btn-primary" id="sp-copy" style="flex:0 0 auto">Copy</button>' +
      '</div></div>',
      function (root) {
        $('#sp-copy', root).addEventListener('click', function () {
          navigator.clipboard.writeText(text).then(function () { toast('Page copied'); });
        });
      }
    );
  }

  function pageMenu(x, y, p, onClose) {
    var items = [
      { icon: 'pencil', label: 'Rename', fn: function () { promptRenamePage(p); } },
      { icon: 'share', label: 'Share Page', fn: function () { sharePage(p); } },
      { sep: true },
      { icon: 'trash', label: 'Delete', danger: true, fn: function () { confirmDeletePage(p); } }
    ];
    showMenu(x, y, items, onClose);
  }

  var drag = null;

  function startDrag(ctx) {
    drag = ctx;
    document.body.classList.add('dragging');
  }

  function endDrag() {
    drag = null;
    document.body.classList.remove('dragging');
    document.querySelectorAll('.drop-before, .drop-after, .dragging').forEach(function (n) {
      n.classList.remove('drop-before', 'drop-after', 'dragging');
    });
  }

  function visibleColumnCount() {
    var w = window.innerWidth;
    if (w <= 620) { return 1; }
    if (w <= 900) { return 2; }
    if (w <= 1240) { return 3; }
    return Store.COLS;
  }

  function matchesSearch(board) {
    var q = ui.searchTerm.toLowerCase();
    if (!q) { return { board: true, links: null }; }
    var titleHit = board.title.toLowerCase().indexOf(q) >= 0;
    var linkHits = board.links.filter(function (l) {
      return (l.title || '').toLowerCase().indexOf(q) >= 0 ||
             (l.url || '').toLowerCase().indexOf(q) >= 0 ||
             (l.description || '').toLowerCase().indexOf(q) >= 0;
    });
    return { board: titleHit || linkHits.length > 0, links: titleHit ? null : linkHits };
  }

  function renderGrid() {
    var grid = $('#grid');
    var page = Store.activePage();
    var n = visibleColumnCount();
    grid.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))';
    grid.innerHTML = '';

    var buckets = [], i;
    for (i = 0; i < n; i++) { buckets.push([]); }
    page.columns.forEach(function (col, ci) {
      col.forEach(function (b) { buckets[ci % n].push({ board: b, dataCol: ci }); });
    });

    buckets.forEach(function (items, ri) {
      var colEl = document.createElement('div');
      colEl.className = 'column';
      colEl.dataset.col = ri;

      items.forEach(function (item) {
        var hit = matchesSearch(item.board);
        if (ui.searchTerm && !hit.board) { return; }
        colEl.appendChild(renderBoard(item.board, item.dataCol, hit.links));
      });

      if (ui.addingBoard === ri) {
        colEl.appendChild(renderAddBoardForm(ri));
      } else {
        var tail = document.createElement('div');
        tail.className = 'column-tail';
        var add = document.createElement('button');
        add.className = 'add-board';
        add.innerHTML = I.svg('plus', 26) + '<span>Add Board</span>';
        add.addEventListener('click', function () { ui.addingBoard = ri; render(); });
        tail.appendChild(add);
        colEl.appendChild(tail);
      }

      colEl.addEventListener('dragover', function (e) {
        if (!drag || drag.kind !== 'board') { return; }
        e.preventDefault();
      });
      colEl.addEventListener('drop', function (e) {
        if (!drag || drag.kind !== 'board') { return; }
        e.preventDefault();
        Store.moveBoard(drag.boardId, ri, undefined);
        endDrag();
      });

      grid.appendChild(colEl);
    });
  }

  function renderAddBoardForm(col) {
    var wrap = document.createElement('div');
    wrap.className = 'board';
    wrap.innerHTML =
      '<div class="form-row">' +
      '<input class="field" id="nb-name" placeholder="Board name" maxlength="60">' +
      '<button class="btn btn-primary" id="nb-add" style="flex:0 0 auto">Add</button>' +
      '<button class="icon-btn" id="nb-cancel">' + I.svg('x', 18) + '</button>' +
      '</div>';
    setTimeout(function () {
      var input = $('#nb-name', wrap);
      if (!input) { return; }
      input.focus();
      function add() {
        var v = input.value.trim();
        if (!v) { input.focus(); return; }
        ui.addingBoard = null;
        Store.addBoard(col, v);
      }
      $('#nb-add', wrap).addEventListener('click', add);
      $('#nb-cancel', wrap).addEventListener('click', function () { ui.addingBoard = null; render(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { add(); }
        if (e.key === 'Escape') { ui.addingBoard = null; render(); }
      });
    }, 0);
    return wrap;
  }

  function renderBoard(board, dataCol, filteredLinks) {
    var st = Store.state;
    var el = document.createElement('section');
    el.className = 'board' + (ui.addingLink === board.id ? ' adding' : '');
    el.dataset.boardId = board.id;

    var head = document.createElement('div');
    head.className = 'board-head';
    head.innerHTML =
      '<div class="board-title">' + esc(board.title) + '</div>' +
      '<div class="board-actions">' +
      '<button class="icon-btn' + (ui.addingLink === board.id ? ' on' : '') +
      '" data-act="add" title="Add link">' + I.svg('link', 17) + '</button>' +
      '<button class="icon-btn" data-act="menu" title="Board menu">' + I.svg('dots', 17) + '</button>' +
      '</div>';
    el.appendChild(head);

    var rule = document.createElement('div');
    rule.className = 'board-rule';
    el.appendChild(rule);

    var list = document.createElement('div');
    list.className = 'links';

    var links = filteredLinks || board.links;
    var limited = false;
    if (!ui.searchTerm && st.settings.hideExtraBookmarks && !ui.expanded[board.id] && links.length > 8) {
      links = links.slice(0, 8);
      limited = true;
    }

    links.forEach(function (l) { list.appendChild(renderLink(board, l)); });

    if (!links.length) {
      var empty = document.createElement('div');
      empty.className = 'board-empty';
      empty.textContent = ui.searchTerm ? 'No matches in this board.' : 'No bookmarks yet.';
      list.appendChild(empty);
    }
    el.appendChild(list);

    if (limited) {
      var more = document.createElement('button');
      more.className = 'board-more';
      more.textContent = 'Show ' + (board.links.length - 8) + ' more';
      more.addEventListener('click', function () { ui.expanded[board.id] = true; render(); });
      el.appendChild(more);
    } else if (st.settings.hideExtraBookmarks && ui.expanded[board.id] && board.links.length > 8) {
      var less = document.createElement('button');
      less.className = 'board-more';
      less.textContent = 'Show less';
      less.addEventListener('click', function () { ui.expanded[board.id] = false; render(); });
      el.appendChild(less);
    }

    if (ui.addingLink === board.id) { el.appendChild(renderAddLinkForm(board)); }

    head.querySelector('[data-act="add"]').addEventListener('click', function () {
      ui.addingLink = board.id;
      ui.addStep = null;
      render();
    });
    head.querySelector('[data-act="menu"]').addEventListener('click', function (e) {
      e.stopPropagation();
      el.classList.add('menu-open');
      var r = e.currentTarget.getBoundingClientRect();
      boardMenu(r.right, r.bottom + 6, board, function () { el.classList.remove('menu-open'); });
    });

    head.querySelector('.board-title').addEventListener('dblclick', function () { editBoardTitle(el, board); });

    el.draggable = true;
    el.addEventListener('dragstart', function (e) {
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
    el.addEventListener('dragover', function (e) {
      if (!drag || drag.kind !== 'board' || drag.boardId === board.id) { return; }
      e.preventDefault();
      e.stopPropagation();
      var r = el.getBoundingClientRect();
      var before = e.clientY < r.top + r.height / 2;
      el.classList.toggle('drop-before', before);
      el.classList.toggle('drop-after', !before);
    });
    el.addEventListener('dragleave', function () { el.classList.remove('drop-before', 'drop-after'); });
    el.addEventListener('drop', function (e) {
      if (!drag || drag.kind !== 'board' || drag.boardId === board.id) { return; }
      e.preventDefault();
      e.stopPropagation();
      var before = el.classList.contains('drop-before');
      el.classList.remove('drop-before', 'drop-after');
      var target = Store.findBoard(board.id);
      if (target) { Store.moveBoard(drag.boardId, target.col, target.index + (before ? 0 : 1)); }
      endDrag();
    });

    return el;
  }

  function editBoardTitle(boardEl, board) {
    var titleEl = boardEl.querySelector('.board-title');
    var input = document.createElement('input');
    input.className = 'board-title-input';
    input.value = board.title;
    input.maxLength = 60;
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    var done = false;
    function commit() {
      if (done) { return; }
      done = true;
      var v = input.value.trim();
      if (v && v !== board.title) { Store.renameBoard(board.id, v); }
      else { render(); }
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { commit(); }
      if (e.key === 'Escape') { done = true; render(); }
    });
  }

  function renderLink(board, l) {
    var st = Store.state;
    var a = document.createElement('a');
    a.className = 'link' + (ui.selection[l.id] ? ' selected' : '');
    a.href = l.url;
    a.dataset.linkId = l.id;
    if (st.settings.openInNewTab) { a.target = '_blank'; a.rel = 'noopener'; }

    var iconHtml = '<img class="link-icon" src="' + esc(faviconUrl(l.url)) + '" alt="" ' +
      'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'">' +
      '<span class="link-fallback" style="display:none;background:' + colorFor(hostOf(l.url) || l.title) + '">' +
      esc((l.title || 'L').trim().charAt(0)) + '</span>';

    var descHtml = (st.settings.showDescriptions && l.description)
      ? '<div class="link-desc">' + esc(l.description) + '</div>' : '';

    a.innerHTML =
      '<span class="link-check">' + I.svg('check', 12) + '</span>' +
      iconHtml +
      '<span class="link-body">' +
      '<div class="link-title">' + esc(l.title || l.url) + '</div>' + descHtml +
      '</span>' +
      '<span class="link-tools">' +
      '<button class="icon-btn" data-act="edit" title="Edit">' + I.svg('pencil', 14) + '</button>' +
      '<button class="icon-btn" data-act="del" title="Remove">' + I.svg('trash', 14) + '</button>' +
      '</span>';

    a.addEventListener('click', function (e) {
      if (e.target.closest('[data-act]')) { e.preventDefault(); return; }
      if (ui.selecting) {
        e.preventDefault();
        if (ui.selection[l.id]) { delete ui.selection[l.id]; }
        else { ui.selection[l.id] = { boardId: board.id, link: l }; }
        render();
      }
    });

    a.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { icon: 'external', label: 'Open in new tab', fn: function () { window.open(l.url, '_blank', 'noopener'); } },
        { icon: 'link', label: 'Copy link', fn: function () {
          navigator.clipboard.writeText(l.url).then(function () { toast('Link copied'); });
        } },
        { icon: 'refresh', label: 'Fetch title', fn: function () { refetchOne(board.id, l); } },
        { icon: 'pencil', label: 'Edit bookmark', fn: function () { editLink(board, l); } },
        { sep: true },
        { icon: 'trash', label: 'Remove', danger: true, fn: function () {
          Store.deleteLink(board.id, l.id);
          toast('Bookmark moved to trash');
        } }
      ]);
    });

    a.querySelector('[data-act="edit"]').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      editLink(board, l);
    });
    a.querySelector('[data-act="del"]').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      Store.deleteLink(board.id, l.id);
      toast('Bookmark moved to trash');
    });

    a.draggable = true;
    a.addEventListener('dragstart', function (e) {
      e.stopPropagation();
      startDrag({ kind: 'link', boardId: board.id, linkId: l.id });
      a.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', l.url);
    });
    a.addEventListener('dragend', endDrag);
    a.addEventListener('dragover', function (e) {
      if (!drag || drag.kind !== 'link' || drag.linkId === l.id) { return; }
      e.preventDefault();
      e.stopPropagation();
      var r = a.getBoundingClientRect();
      var before = e.clientY < r.top + r.height / 2;
      a.classList.toggle('drop-before', before);
      a.classList.toggle('drop-after', !before);
    });
    a.addEventListener('dragleave', function () { a.classList.remove('drop-before', 'drop-after'); });
    a.addEventListener('drop', function (e) {
      if (!drag || drag.kind !== 'link' || drag.linkId === l.id) { return; }
      e.preventDefault();
      e.stopPropagation();
      var before = a.classList.contains('drop-before');
      a.classList.remove('drop-before', 'drop-after');
      var target = Store.findBoard(board.id);
      if (!target) { return; }
      var idx = target.board.links.findIndex(function (x) { return x.id === l.id; });
      Store.moveLink(drag.boardId, drag.linkId, board.id, idx + (before ? 0 : 1));
      endDrag();
    });

    return a;
  }

  var DESC_MAX = 2000;
  var SUPPORT_EMAIL = 'support.bookmarkle@gmail.com';

  function autoGrow(el, minRows) {
    var min = (minRows || 1) * 22 + 22;
    el.style.height = 'auto';
    el.style.height = Math.max(min, el.scrollHeight) + 'px';
  }

  function renderAddLinkForm(board) {
    var wrap = document.createElement('div');
    wrap.className = 'link-form';

    if (!ui.addStep) {
      wrap.innerHTML =
        '<input class="lf-field" id="al-url" placeholder="https://example.com" autocomplete="off" spellcheck="false">' +
        '<div class="lf-actions">' +
        '<button class="lf-btn lf-btn-primary" id="al-next">Add Link</button>' +
        '<button class="lf-btn lf-btn-cancel" id="al-cancel">Cancel</button>' +
        '</div>';

      setTimeout(function () {
        var input = $('#al-url', wrap);
        if (!input) { return; }
        input.focus();
        var btn = $('#al-next', wrap);

        function next() {
          var url = normalizeUrl(input.value);
          if (!url) { toast('That does not look like a URL', true); input.focus(); return; }
          btn.disabled = true;
          btn.textContent = 'Fetching title...';
          fetchTitle(url).then(function (title) {
            ui.addStep = {
              url: url,
              title: title || prettyNameFromUrl(url),
              description: ''
            };
            render();
          });
        }

        btn.addEventListener('click', next);
        $('#al-cancel', wrap).addEventListener('click', cancelAdd);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); next(); }
          if (e.key === 'Escape') { cancelAdd(); }
        });
      }, 0);

      return wrap;
    }

    var step = ui.addStep;
    wrap.innerHTML =
      '<input class="lf-field lf-url" id="al-url2" value="' + esc(step.url) + '" spellcheck="false">' +
      '<textarea class="lf-field lf-area" id="al-title" rows="1" maxlength="300" placeholder="Title">' +
      esc(step.title) + '</textarea>' +
      '<textarea class="lf-field lf-area" id="al-desc" rows="2" maxlength="' + DESC_MAX +
      '" placeholder="Optional description (shown below title)">' + esc(step.description) + '</textarea>' +
      '<div class="lf-count" id="al-count">' + (DESC_MAX - step.description.length) + '</div>' +
      '<div class="lf-actions">' +
      '<button class="lf-btn lf-btn-primary" id="al-save">Add Link</button>' +
      '<button class="lf-btn lf-btn-cancel" id="al-cancel">Cancel</button>' +
      '</div>';

    setTimeout(function () {
      var u = $('#al-url2', wrap), t = $('#al-title', wrap), d = $('#al-desc', wrap);
      if (!t) { return; }

      autoGrow(t, 1);
      autoGrow(d, 2);
      t.focus();
      t.select();

      t.addEventListener('input', function () { autoGrow(t, 1); });
      d.addEventListener('input', function () {
        autoGrow(d, 2);
        $('#al-count', wrap).textContent = DESC_MAX - d.value.length;
      });

      function save() {
        var url = normalizeUrl(u.value) || step.url;
        Store.addLink(board.id, {
          url: url,
          title: t.value.trim() || url,
          description: d.value.trim()
        });
        cancelAdd();
        toast('Bookmark added');
      }

      $('#al-save', wrap).addEventListener('click', save);
      $('#al-cancel', wrap).addEventListener('click', cancelAdd);

      [u, t].forEach(function (el) {
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { cancelAdd(); }
        });
      });
      d.addEventListener('keydown', function (e) {
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
      '<div class="modal">' +
      '<h2>Edit Bookmark</h2>' +
      '<label>Title</label>' +
      '<input class="field" id="ed-title" value="' + esc(l.title) + '" maxlength="200">' +
      '<label style="margin-top:16px">URL</label>' +
      '<input class="field" id="ed-url" value="' + esc(l.url) + '">' +
      '<label style="margin-top:16px">Description</label>' +
      '<textarea class="field" id="ed-desc" maxlength="2000" placeholder="Optional note shown under the title">' + esc(l.description || '') + '</textarea>' +
      '<div class="field-count"><span id="ed-count">' + (l.description || '').length + '</span>/2000</div>' +
      '<div class="modal-actions">' +
      '<button class="btn" id="ed-fetch" style="margin-right:auto">Fetch title</button>' +
      '<button class="btn" data-close>Cancel</button>' +
      '<button class="btn btn-primary" id="ed-save" style="flex:0 0 auto">Save</button>' +
      '</div></div>',
      function (root) {
        var t = $('#ed-title', root), u = $('#ed-url', root), d = $('#ed-desc', root);
        t.focus();
        d.addEventListener('input', function () { $('#ed-count', root).textContent = d.value.length; });
        $('#ed-fetch', root).addEventListener('click', function () {
          var btn = this;
          btn.disabled = true;
          btn.textContent = 'Fetching...';
          fetchTitle(normalizeUrl(u.value)).then(function (title) {
            btn.disabled = false;
            btn.textContent = 'Fetch title';
            if (title) { t.value = title; }
            else { toast('Could not read that page title', true); }
          });
        });
        $('#ed-save', root).addEventListener('click', function () {
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
    fetchTitle(l.url).then(function (title) {
      if (title) { Store.updateLink(boardId, l.id, { title: title }); toast('Title updated'); }
      else { toast('Could not read that page title', true); }
    });
  }

  function boardMenu(x, y, board, onClose) {
    showMenu(x, y, [
      {
        icon: 'external', label: 'Open All Links', fn: function () {
          if (!board.links.length) { toast('This board is empty', true); return; }
          board.links.forEach(function (l) { window.open(l.url, '_blank', 'noopener'); });
          toast('Opened ' + board.links.length + ' links');
        }
      },
      {
        icon: 'refresh', label: 'Fetch All Titles', fn: function () { fetchAllTitles(board); }
      },
      {
        icon: 'pencil', label: 'Edit Board', fn: function () {
          var el = document.querySelector('[data-board-id="' + board.id + '"]');
          if (el) { editBoardTitle(el, board); }
        }
      },
      {
        icon: 'share', label: 'Share Board', fn: function () { shareBoard(board); }
      },
      { sep: true },
      {
        icon: 'trash', label: 'Delete Board', danger: true, fn: function () {
          Store.deleteBoard(board.id);
          toast('Board moved to trash');
        }
      }
    ], onClose, { alignRight: true });
  }

  function fetchAllTitles(board) {
    if (!board.links.length) { toast('This board is empty', true); return; }
    toast('Fetching ' + board.links.length + ' titles...');
    var done = 0, changed = 0;
    board.links.forEach(function (l) {
      fetchTitle(l.url).then(function (title) {
        done++;
        if (title && title !== l.title) { Store.updateLink(board.id, l.id, { title: title }); changed++; }
        if (done === board.links.length) {
          toast(changed ? 'Updated ' + changed + ' title' + (changed > 1 ? 's' : '') : 'All titles were already current');
        }
      });
    });
  }

  function shareBoard(board) {
    var text = board.title + '\n' + board.links.map(function (l) {
      return '- ' + l.title + ' -> ' + l.url;
    }).join('\n');
    var json = JSON.stringify({ bookmarkle: 1, board: board }, null, 2);
    openModal(
      '<div class="modal">' +
      '<h2>Share Board</h2>' +
      '<div class="row-sub" style="margin-bottom:14px">Copy this board as a plain list, or as JSON another Bookmarkle can import.</div>' +
      '<textarea class="field" id="sh-text" style="min-height:190px" readonly>' + esc(text) + '</textarea>' +
      '<div class="modal-actions">' +
      '<button class="btn" id="sh-json" style="margin-right:auto">Show JSON</button>' +
      '<button class="btn" data-close>Close</button>' +
      '<button class="btn btn-primary" id="sh-copy" style="flex:0 0 auto">Copy</button>' +
      '</div></div>',
      function (root) {
        var ta = $('#sh-text', root), showingJson = false;
        $('#sh-json', root).addEventListener('click', function () {
          showingJson = !showingJson;
          ta.value = showingJson ? json : text;
          this.textContent = showingJson ? 'Show list' : 'Show JSON';
        });
        $('#sh-copy', root).addEventListener('click', function () {
          navigator.clipboard.writeText(ta.value).then(function () { toast('Copied to clipboard'); });
        });
      }
    );
  }

  function showMenu(x, y, items, onClose, opts) {
    closeMenu();
    var m = document.createElement('div');
    m.className = 'menu';
    items.forEach(function (it) {
      if (it.sep) {
        var s = document.createElement('div');
        s.className = 'menu-sep';
        m.appendChild(s);
        return;
      }
      var b = document.createElement('button');
      b.className = 'menu-item' + (it.danger ? ' danger' : '');
      b.innerHTML = I.svg(it.icon, 17) + '<span>' + esc(it.label) + '</span>';
      b.addEventListener('click', function () { closeMenu(); it.fn(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);

    var r = m.getBoundingClientRect();
    var left = (opts && opts.alignRight) ? x - r.width : x;
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
    var top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    m.style.left = left + 'px';
    m.style.top = top + 'px';

    m._onClose = onClose;
    setTimeout(function () { document.addEventListener('mousedown', outsideMenu); }, 0);
  }

  function outsideMenu(e) {
    if (!e.target.closest('.menu')) { closeMenu(); }
  }

  function closeMenu() {
    document.removeEventListener('mousedown', outsideMenu);
    document.querySelectorAll('.menu').forEach(function (m) {
      if (m._onClose) { m._onClose(); }
      m.remove();
    });
    document.querySelectorAll('.board.menu-open').forEach(function (b) { b.classList.remove('menu-open'); });
  }

  function openModal(html, wire) {
    var ov = $('#overlay');
    $('#overlay-content').innerHTML = html;
    ov.classList.add('open');
    ov.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', closeModal);
    });
    if (wire) { wire($('#overlay-content')); }
  }

  function closeModal() {
    $('#overlay').classList.remove('open');
    $('#overlay-content').innerHTML = '';
  }

  function openSearch() {
    ui.searching = true;
    $('#search-overlay').classList.add('open');
    var input = $('#search-input');
    input.value = ui.searchTerm;
    input.focus();
    input.select();
    applyTheme();
  }

  function closeSearch() {
    ui.searching = false;
    ui.searchTerm = '';
    $('#search-overlay').classList.remove('open');
    render();
  }

  function firstResult() {
    var a = document.querySelector('#grid .link');
    return a ? a.href : null;
  }

  function toggleSelect() {
    ui.selecting = !ui.selecting;
    ui.selection = {};
    render();
  }

  function selectionList() {
    return Object.keys(ui.selection).map(function (k) { return ui.selection[k]; });
  }

  function renderSelectBar() {
    var items = selectionList();
    $('#select-count').textContent = items.length + ' selected';
    var sel = $('#sel-move');
    var current = sel.value;
    sel.innerHTML = '<option value="">Move to board...</option>';
    Store.allBoards().forEach(function (b) {
      var o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.title;
      sel.appendChild(o);
    });
    sel.value = current;
  }

  function showTrash() {
    var st = Store.state;
    var body = st.trash.length
      ? st.trash.map(function (t) {
          return '<div class="list-item" data-id="' + t.id + '">' +
            '<span class="tag">' + t.kind + '</span>' +
            '<div class="li-body"><div class="li-title">' + esc(t.label || '(untitled)') + '</div>' +
            '<div class="li-sub">' + new Date(t.at).toLocaleString() + '</div></div>' +
            '<button class="icon-btn" data-restore="' + t.id + '" title="Restore">' + I.svg('restore', 16) + '</button>' +
            '<button class="icon-btn" data-purge="' + t.id + '" title="Delete forever">' + I.svg('trash', 16) + '</button>' +
            '</div>';
        }).join('')
      : '<div class="empty-state">Trash is empty.</div>';

    openModal(
      '<div class="modal">' +
      '<h2>Trash</h2>' +
      '<div class="row-sub" style="margin-bottom:16px">Deleted bookmarks, boards and pages are kept here until you clear them.</div>' +
      '<div style="max-height:44vh;overflow:auto">' + body + '</div>' +
      '<div class="modal-actions">' +
      (st.trash.length ? '<button class="btn btn-danger" id="tr-empty" style="margin-right:auto">Empty Trash</button>' : '') +
      '<button class="btn btn-primary" data-close style="flex:0 0 auto">Done</button>' +
      '</div></div>',
      function (root) {
        root.querySelectorAll('[data-restore]').forEach(function (b) {
          b.addEventListener('click', function () {
            if (Store.restoreTrash(b.dataset.restore)) { toast('Restored'); }
            else { toast('Original board is gone', true); }
            closeModal();
            showTrash();
          });
        });
        root.querySelectorAll('[data-purge]').forEach(function (b) {
          b.addEventListener('click', function () {
            Store.removeTrash(b.dataset.purge);
            closeModal();
            showTrash();
          });
        });
        var em = $('#tr-empty', root);
        if (em) {
          em.addEventListener('click', function () {
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
      function (root) {
        $('#dx-export', root).addEventListener('click', function () {
          var blob = new Blob([Store.exportData()], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'bookmarkle-backup-' + new Date().toISOString().slice(0, 10) + '.json';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          toast('Backup downloaded');
        });
        var file = $('#dx-file', root);
        $('#dx-import', root).addEventListener('click', function () { file.click(); });
        file.addEventListener('change', function () {
          var f = file.files[0];
          if (!f) { return; }
          var fr = new FileReader();
          fr.onload = function () {
            try {
              Store.importData(fr.result);
              closeModal();
              toast('Data imported');
            } catch (e) {
              toast('That file could not be read', true);
            }
          };
          fr.readAsText(f);
        });
        $('#dx-tabs', root).addEventListener('click', function () {
          saveAllTabs();
          closeModal();
        });
      }
    );
  }

  function saveAllTabs() {
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      var keep = tabs.filter(function (t) {
        return t.url && /^https?:/.test(t.url);
      });
      if (!keep.length) { toast('No saveable tabs in this window', true); return; }
      var board = Store.addBoard(0, 'Tabs ' + new Date().toLocaleDateString());
      keep.forEach(function (t) {
        Store.addLink(board.id, { url: t.url, title: t.title || t.url });
      });
      toast('Saved ' + keep.length + ' tabs');
      if (Store.state.settings.closeTabsAfterSaveAll) {
        chrome.tabs.remove(keep.filter(function (t) { return !t.active; }).map(function (t) { return t.id; }));
      }
    });
  }

  var catalogData = null;

  function ensureCatalog() {
    if (catalogData) { return Promise.resolve(catalogData); }
    return Catalog.loadAll().then(function (d) {
      catalogData = d;
      return d;
    });
  }

  function panelPicks(isLight) {
    if (!catalogData) { return []; }
    return catalogData.remote.filter(function (w) { return w.isLight === isLight; }).slice(0, 24);
  }

  function wallpaperSections() {
    var st = Store.state;
    var isLight = st.settings.theme === 'light';
    var user = st.wallpapers.user.filter(function (w) { return w.isLight === isLight; });
    var builtin = (catalogData ? catalogData.builtin : []).filter(function (w) { return w.isLight === isLight; });
    var gallery = panelPicks(isLight);

    var out = [];
    if (user.length) { out.push({ key: 'yours', label: 'Your Wallpapers', items: user, editable: true }); }
    if (builtin.length) { out.push({ key: 'builtin', label: 'Starter Wallpapers', items: builtin, editable: false }); }
    if (gallery.length) { out.push({ key: 'gallery', label: 'From the Gallery', items: gallery, editable: false }); }
    return out;
  }

  function renderWallpaperPanel() {
    var st = Store.state;
    var t = Store.currentTheme();
    $('#mode-dark').classList.toggle('active', st.settings.theme === 'dark');
    $('#mode-light').classList.toggle('active', st.settings.theme === 'light');

    var host = $('#wp-scroll');
    var sections = wallpaperSections();

    if (!catalogData) {
      host.innerHTML = '<div class="empty-state">Loading wallpapers...</div>';
      ensureCatalog().then(function () { if (ui.wpOpen) { renderWallpaperPanel(); } });
      return;
    }

    host.innerHTML = '';

    sections.forEach(function (sec) {
      var wrap = document.createElement('div');
      wrap.className = 'wp-section' + (ui.wpCollapsed[sec.key] ? ' collapsed' : '');

      var head = document.createElement('button');
      head.className = 'wp-section-head';
      head.innerHTML = '<span>' + esc(sec.label) + '</span>' +
        '<span class="wp-count">' + sec.items.length + '</span>' +
        '<span class="wp-chev">' + I.svg('chevron', 16) + '</span>';
      head.addEventListener('click', function () {
        ui.wpCollapsed[sec.key] = !ui.wpCollapsed[sec.key];
        renderWallpaperPanel();
      });
      wrap.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'wp-grid';

      sec.items.forEach(function (w) {
        var card = document.createElement('div');
        card.className = 'wp-card' + (t.wallpaperId === w.id ? ' active' : '');

        var thumb = document.createElement('div');
        thumb.className = 'wp-thumb';
        thumb.style.backgroundImage = 'url("' + resolveSrc(w.thumb || w.src).replace(/"/g, '%22') + '")';
        thumb.title = w.name;
        thumb.addEventListener('click', function () { applyWallpaper(w); });
        card.appendChild(thumb);

        var name = document.createElement('div');
        name.className = 'wp-name';
        name.textContent = w.name;
        card.appendChild(name);

        var tools = document.createElement('div');
        tools.className = 'wp-card-tools';

        var edit = document.createElement('button');
        edit.className = 'icon-btn';
        edit.title = 'Adjust style';
        edit.innerHTML = I.svg('pencil', 14);
        edit.addEventListener('click', function () { applyWallpaper(w); adjustStyleModal(w); });
        tools.appendChild(edit);

        var dl = document.createElement('button');
        dl.className = 'icon-btn';
        dl.title = 'Download';
        dl.innerHTML = I.svg('download', 14);
        dl.addEventListener('click', function () { downloadWallpaper(w); });
        tools.appendChild(dl);

        if (sec.editable) {
          var del = document.createElement('button');
          del.className = 'icon-btn';
          del.title = 'Remove';
          del.innerHTML = I.svg('trash', 14);
          del.addEventListener('click', function () {
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
      var warn = document.createElement('div');
      warn.className = 'row-sub';
      warn.style.padding = '10px 0 4px';
      warn.textContent = 'Gallery unavailable offline - starter wallpapers still work.';
      host.appendChild(warn);
    }
  }

  function resetThemeWallpaper() {
    var isLight = Store.state.settings.theme === 'light';
    var pool = (catalogData ? catalogData.builtin : []).filter(function (w) { return w.isLight === isLight; });
    if (pool.length) { Store.applyWallpaperToTheme(pool[0]); }
  }

  function applyWallpaper(w) {
    Store.applyWallpaperToTheme(w);
    toast('Wallpaper applied to the ' +
      (Store.state.settings.theme === 'light' ? 'Light' : 'Dark') + ' theme');
  }

  function downloadWallpaper(w) {
    var a = document.createElement('a');
    a.href = resolveSrc(w.src);
    a.download = String(w.name || 'wallpaper').replace(/\s+/g, '-').toLowerCase() + '.jpg';
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    toast('Downloading ' + w.name);
  }

  var MAX_UPLOAD_MB = 100;

  function handleUpload(file) {
    if (!file) { return; }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast('Please pick an image under ' + MAX_UPLOAD_MB + ' MB', true);
      return;
    }
    toast('Reading image...');
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var pal = ColorUtil.fromImage(img);
        var wp = Store.addUserWallpaper({
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
      img.onerror = function () { toast('That image could not be read', true); };
      img.src = fr.result;
    };
    fr.onerror = function () { toast('That file could not be read', true); };
    fr.readAsDataURL(file);
  }

  function adjustStyleModal(w) {
    var t = Store.currentTheme();
    var isLight = Store.state.settings.theme === 'light';
    var snapshot = { primary: t.primary, board: t.board, opacity: t.opacity, blur: t.blur };

    function tile(id, label, value) {
      return '<div class="as-tile">' +
        '<div class="as-tile-head"><span class="as-label">' + label + '</span>' +
        '<span class="as-value" id="' + id + '-hex">' + esc(value.toUpperCase()) + '</span></div>' +
        '<label class="as-swatch" style="background:' + esc(value) + '">' +
        '<input type="color" id="' + id + '" value="' + esc(value) + '">' +
        '</label></div>';
    }

    function slider(id, label, value, min, max, suffix) {
      return '<div class="as-tile as-tile-wide">' +
        '<div class="as-tile-head"><span class="as-label">' + label + '</span>' +
        '<span class="as-value" id="' + id + '-out">' + value + suffix + '</span></div>' +
        '<input type="range" class="as-range" id="' + id + '" min="' + min + '" max="' + max +
        '" value="' + value + '"></div>';
    }

    openModal(
      '<div class="modal as-modal">' +
      '<h2>Adjust Wallpaper Style</h2>' +
      '<p class="as-sub">' + (isLight ? 'Light' : 'Dark') + ' theme on this device.</p>' +
      '<div class="as-grid">' +
      tile('as-primary', 'Primary Color', t.primary) +
      tile('as-board', 'Board Color', t.board) +
      '</div>' +
      slider('as-opacity', 'Board Opacity', Math.round(t.opacity * 100), 0, 100, '%') +
      slider('as-blur', 'Board Blur', t.blur, 0, 40, 'px') +
      '<div class="as-actions">' +
      '<button class="as-btn" id="as-cancel">Cancel</button>' +
      '<button class="as-btn" id="as-reset">Reset</button>' +
      '<button class="as-btn as-btn-save" id="as-save">Save</button>' +
      '</div></div>',
      function (root) {
        var pc = $('#as-primary', root), bc = $('#as-board', root);
        var op = $('#as-opacity', root), bl = $('#as-blur', root);

        function paint() {
          $('#as-primary-hex', root).textContent = pc.value.toUpperCase();
          $('#as-board-hex', root).textContent = bc.value.toUpperCase();
          pc.parentNode.style.background = pc.value;
          bc.parentNode.style.background = bc.value;
          $('#as-opacity-out', root).textContent = op.value + '%';
          $('#as-blur-out', root).textContent = bl.value + 'px';
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

        [pc, bc, op, bl].forEach(function (el) {
          el.addEventListener('input', live);
        });

        $('#as-reset', root).addEventListener('click', function () {
          var base = (w && w.style) ? w.style : Store.defaultThemeStyle(isLight);
          pc.value = base.primary || snapshot.primary;
          bc.value = base.board || snapshot.board;
          op.value = Math.round((typeof base.opacity === 'number' ? base.opacity : snapshot.opacity) * 100);
          bl.value = typeof base.blur === 'number' ? base.blur : snapshot.blur;
          live();
        });

        $('#as-cancel', root).addEventListener('click', function () {
          Store.updateThemeStyle(snapshot);
          closeModal();
        });

        $('#as-save', root).addEventListener('click', function () {
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

  var settingsTab = 'general';

  function showSettings() {
    openModal('<div class="modal settings-modal" id="set-modal"></div>', function () { renderSettings(); });
  }

  function renderSettings() {
    var host = $('#set-modal');
    if (!host) { return; }
    var tabs = [
      ['general', 'General', 'gear'],
      ['account', 'Account', 'user'],
      ['language', 'Language', 'globe'],
      ['support', 'Support', 'bug']
    ];
    host.innerHTML =
      '<aside class="settings-nav"><h2>Settings</h2>' +
      tabs.map(function (t) {
        return '<button class="nav-item' + (settingsTab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' +
          I.svg(t[2], 19) + '<span>' + t[1] + '</span></button>';
      }).join('') +
      '</aside>' +
      '<div class="settings-body" id="set-body">' +
      '<button class="settings-close" data-close>' + I.svg('x', 18) + '</button>' +
      settingsBody() + '</div>';

    host.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { settingsTab = b.dataset.tab; renderSettings(); });
    });
    host.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', closeModal);
    });
    wireSettings(host);
  }

  function toggleRow(key, title, sub) {
    var on = Store.state.settings[key];
    return '<div class="row"><div class="row-text"><div class="row-title">' + title + '</div>' +
      '<div class="row-sub">' + sub + '</div></div>' +
      '<button class="toggle' + (on ? ' on' : '') + '" data-toggle="' + key + '"></button></div>';
  }

  function settingsBody() {
    var st = Store.state;

    if (settingsTab === 'general') {
      var pageOpts = ['<option value="current"' + (st.settings.quickSaveDestination === 'current' ? ' selected' : '') + '>Current Page</option>']
        .concat(st.pages.map(function (p) {
          return '<option value="' + p.id + '"' + (st.settings.quickSaveDestination === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
        })).join('');

      return '<h1>General Settings</h1><div class="settings-rule"></div>' +
        '<div class="group"><div class="group-title">Appearance</div>' +
        toggleRow('compactMode', 'Compact mode', 'Reduce spacing to show more bookmarks.') +
        toggleRow('groupTools', 'Group right-side tools', 'Keep Search and Settings visible, and group the other right-side buttons into one menu on this device.') +
        toggleRow('hideExtraBookmarks', 'Hide extra bookmarks in long boards', 'Automatically hide extra bookmarks in long boards.') +
        toggleRow('shortenTitles', 'Shorten long titles', 'Show titles on one line with "...".') +
        '</div>' +
        '<div class="group"><div class="group-title">Behavior</div>' +
        toggleRow('openInNewTab', 'Open links in new tab', 'Open bookmarks in a new browser tab.') +
        toggleRow('showDescriptions', 'Show bookmark descriptions', 'Display saved descriptions below bookmark titles.') +
        toggleRow('closeTabsAfterSaveAll', 'Close tabs after Save All Tabs', 'Automatically close the saved tabs in the current window.') +
        '<div class="row"><div class="row-text"><div class="row-title">Quick Save destination</div>' +
        '<div class="row-sub">Where to save new links.</div></div>' +
        '<select class="select" id="set-qs">' + pageOpts + '</select></div>' +
        '<div class="row"><div class="row-text"><div class="row-title">Change quick save shortcut</div>' +
        '<div class="row-sub">Open browser shortcut settings to change this key.</div></div>' +
        '<span class="kbd">Ctrl+Shift+Y</span>' +
        '<button class="btn btn-sm" id="set-shortcut">Change</button></div>' +
        '</div>';
    }

    if (settingsTab === 'account') {
      var boards = 0, links = 0;
      st.pages.forEach(function (p) {
        p.columns.forEach(function (c) {
          boards += c.length;
          c.forEach(function (b) { links += b.links.length; });
        });
      });
      return '<h1>Account</h1><div class="settings-rule"></div>' +
        '<div class="group"><div class="group-title">This device</div>' +
        '<div class="row"><div class="row-text"><div class="row-title">Local storage only</div>' +
        '<div class="row-sub">Bookmarkle has no account and no server. Everything you see is stored in this browser profile, ' +
        'and nothing is ever uploaded. Use Export to move your data to another machine.</div></div></div>' +
        '<div class="row"><div class="row-text"><div class="row-title">What you have saved</div>' +
        '<div class="row-sub">' + st.pages.length + ' page' + (st.pages.length > 1 ? 's' : '') +
        ' &middot; ' + boards + ' boards &middot; ' + links + ' bookmarks &middot; ' +
        st.wallpapers.user.length + ' uploaded wallpapers</div></div></div>' +
        '</div>' +
        '<div class="group"><div class="group-title">Data</div>' +
        '<div class="row"><div class="row-text"><div class="row-title">Download your data</div>' +
        '<div class="row-sub">Export every page, board and bookmark as a JSON file.</div></div>' +
        '<button class="btn" id="set-export">Download Data</button></div>' +
        '<div class="row"><div class="row-text"><div class="row-title">Import a backup</div>' +
        '<div class="row-sub">Replace everything with a previously exported file.</div></div>' +
        '<button class="btn" id="set-import">Import</button></div>' +
        '<div class="row"><div class="row-text"><div class="row-title">Reset everything</div>' +
        '<div class="row-sub">Delete all local data and return to the starter layout. This cannot be undone.</div></div>' +
        '<button class="btn btn-danger" id="set-reset">Reset</button></div>' +
        '</div><input type="file" id="set-file" accept="application/json,.json" hidden>';
    }

    if (settingsTab === 'language') {
      var langs = [
        ['auto', 'Automatic', 'Browser language', true],
        ['en', 'English', '', true],
        ['de', 'Deutsch', 'German', false],
        ['nl', 'Nederlands', 'Dutch', false],
        ['fr', 'Français', 'French', false],
        ['ja', '日本語', 'Japanese', false],
        ['ko', '한국어', 'Korean', false],
        ['hi', 'हिन्दी', 'Hindi', false],
        ['es', 'Español', 'Spanish', false],
        ['pt', 'Português (Brasil)', 'Portuguese (Brazil)', false],
        ['zh', '简体中文', 'Chinese (Simplified)', false],
        ['id', 'Bahasa Indonesia', 'Indonesian', false],
        ['ru', 'Русский', 'Russian', false],
        ['it', 'Italiano', 'Italian', false],
        ['tr', 'Türkçe', 'Turkish', false],
        ['pl', 'Polski', 'Polish', false],
        ['vi', 'Tiếng Việt', 'Vietnamese', false],
        ['ar', 'العربية', 'Arabic', false]
      ];
      return '<h1>Language</h1><div class="settings-rule"></div>' +
        '<input class="field" id="lang-q" placeholder="Search languages" style="margin-bottom:18px">' +
        '<div class="row-sub" style="margin-bottom:16px">This build ships with English. The other locales are listed so ' +
        'translation files can be dropped in later - picking one now keeps English.</div>' +
        '<div id="lang-list">' + langs.map(function (l) {
          var active = st.settings.language === l[0];
          return '<button class="lang-item' + (active ? ' active' : '') + '" data-lang="' + l[0] + '" data-search="' +
            esc((l[1] + ' ' + l[2]).toLowerCase()) + '">' +
            '<span class="lang-name">' + l[1] + '</span>' +
            (l[2] ? '<span class="lang-en">' + l[2] + '</span>' : '') +
            (l[3] ? '<span class="lang-radio"></span>' : '<span class="lang-soon">not translated yet</span>') +
            '</button>';
        }).join('') + '</div>';
    }

    return '<h1>Support</h1><div class="settings-rule"></div>' +
      '<div class="group"><div class="group-title">Report a problem</div>' +
      '<div class="row"><div class="row-text">' +
      '<div class="row-title">Found a bug, or something not working?</div>' +
      '<div class="row-sub">Email <a class="support-mail" href="mailto:' + SUPPORT_EMAIL +
      '?subject=Bookmarkle%20issue%20report">' + SUPPORT_EMAIL + '</a> with what happened ' +
      'and it will be looked into. Bug reports, broken sites, feature requests and any other ' +
      'problems are all welcome.</div></div>' +
      '<button class="btn btn-sm" id="sup-copy">Copy email</button></div>' +
      '</div>' +
      '<div class="group"><div class="group-title">Keyboard</div>' +
      '<div class="row"><div class="row-text"><div class="row-title">/ or Ctrl+K</div><div class="row-sub">Open search</div></div></div>' +
      '<div class="row"><div class="row-text"><div class="row-title">Esc</div><div class="row-sub">Close search, menus and dialogs</div></div></div>' +
      '<div class="row"><div class="row-text"><div class="row-title">Ctrl+Shift+Y</div><div class="row-sub">Quick save the page you are on</div></div></div>' +
      '<div class="row"><div class="row-text"><div class="row-title">Double click a board title</div><div class="row-sub">Rename it inline</div></div></div>' +
      '<div class="row"><div class="row-text"><div class="row-title">Right click a bookmark or page tab</div><div class="row-sub">Open its context menu</div></div></div>' +
      '</div>' +
      '<div class="group"><div class="group-title">Tips</div>' +
      '<div class="row"><div class="row-text"><div class="row-title">Drag things around</div>' +
      '<div class="row-sub">Boards drag between columns, bookmarks drag between boards, and dropping a board on a page tab moves it to that page.</div></div></div>' +
      '<div class="row"><div class="row-text"><div class="row-title">Wallpapers drive the colours</div>' +
      '<div class="row-sub">Upload any image and Bookmarkle picks the accent and board tint from it. Fine-tune with the pencil on the wallpaper card.</div></div></div>' +
      '</div>';
  }

  function wireSettings(host) {
    host.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.toggle;
        Store.setSetting(k, !Store.state.settings[k]);
        renderSettings();
      });
    });

    var qs = $('#set-qs', host);
    if (qs) {
      qs.addEventListener('change', function () { Store.setSetting('quickSaveDestination', qs.value); });
    }

    var sc = $('#set-shortcut', host);
    if (sc) {
      sc.addEventListener('click', function () {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    }

    var ex = $('#set-export', host);
    if (ex) {
      ex.addEventListener('click', function () {
        var blob = new Blob([Store.exportData()], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'bookmarkle-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast('Backup downloaded');
      });
    }

    var imp = $('#set-import', host), f = $('#set-file', host);
    if (imp && f) {
      imp.addEventListener('click', function () { f.click(); });
      f.addEventListener('change', function () {
        var file = f.files[0];
        if (!file) { return; }
        var fr = new FileReader();
        fr.onload = function () {
          try { Store.importData(fr.result); renderSettings(); toast('Data imported'); }
          catch (e) { toast('That file could not be read', true); }
        };
        fr.readAsText(file);
      });
    }

    var rs = $('#set-reset', host);
    if (rs) {
      rs.addEventListener('click', function () {
        if (rs.dataset.armed) { Store.resetAll(); renderSettings(); toast('Everything reset'); return; }
        rs.dataset.armed = '1';
        rs.textContent = 'Click again to confirm';
        setTimeout(function () { delete rs.dataset.armed; rs.textContent = 'Reset'; }, 4000);
      });
    }

    host.querySelectorAll('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () {
        Store.setSetting('language', b.dataset.lang);
        renderSettings();
        if (b.dataset.lang !== 'auto' && b.dataset.lang !== 'en') {
          toast('That language is not translated yet - staying on English');
        }
      });
    });

    var supCopy = $('#sup-copy', host);
    if (supCopy) {
      supCopy.addEventListener('click', function () {
        navigator.clipboard.writeText(SUPPORT_EMAIL).then(function () {
          toast('Email address copied');
        });
      });
    }

    var lq = $('#lang-q', host);
    if (lq) {
      lq.addEventListener('input', function () {
        var q = lq.value.toLowerCase().trim();
        host.querySelectorAll('[data-search]').forEach(function (n) {
          n.style.display = !q || n.dataset.search.indexOf(q) >= 0 ? '' : 'none';
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
    $('#btn-search').addEventListener('click', function () {
      if (ui.searching) { closeSearch(); } else { openSearch(); }
    });

    $('#search-input').addEventListener('input', function (e) {
      ui.searchTerm = e.target.value.trim();
      applyTheme();
      renderGrid();
    });
    $('#search-input').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSearch(); }
      if (e.key === 'Enter') {
        var url = firstResult();
        if (url) { openUrl(url, e.ctrlKey || e.metaKey); }
      }
    });
    $('#search-overlay').addEventListener('mousedown', function (e) {
      if (!e.target.closest('#search-bar')) { closeSearch(); }
    });

    $('#btn-data').addEventListener('click', showDataPanel);
    $('#btn-trash').addEventListener('click', showTrash);
    $('#btn-select').addEventListener('click', toggleSelect);
    $('#btn-settings').addEventListener('click', showSettings);

    $('#btn-private').addEventListener('click', function () {
      ui.private = !ui.private;
      $('#btn-private').classList.toggle('on', !!ui.private);
      applyTheme();
      toast(ui.private ? 'Bookmark titles blurred' : 'Privacy blur off');
    });

    $('#btn-zen').addEventListener('click', function () {
      document.body.classList.add('zen');
    });
    $('#zen-exit').addEventListener('click', function () {
      document.body.classList.remove('zen');
    });

    $('#btn-rail-toggle').addEventListener('click', function () {
      ui.railExpanded = !ui.railExpanded;
      $('#btn-rail-toggle').innerHTML = ui.railExpanded ? I.svg('x', 22) : I.svg('grip', 22);
      applyTheme();
    });

    $('#sel-done').addEventListener('click', toggleSelect);
    $('#sel-open').addEventListener('click', function () {
      var items = selectionList();
      if (!items.length) { return; }
      items.forEach(function (s) { window.open(s.link.url, '_blank', 'noopener'); });
    });
    $('#sel-delete').addEventListener('click', function () {
      var items = selectionList();
      items.forEach(function (s) { Store.deleteLink(s.boardId, s.link.id); });
      ui.selection = {};
      toast(items.length + ' bookmarks moved to trash');
    });
    $('#sel-move').addEventListener('change', function () {
      var target = this.value;
      if (!target) { return; }
      selectionList().forEach(function (s) {
        Store.moveLink(s.boardId, s.link.id, target);
      });
      ui.selection = {};
      this.value = '';
      toast('Bookmarks moved');
    });

    $('#wallpaper-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      ui.wpOpen = !ui.wpOpen;
      $('#wp-panel').classList.toggle('open', ui.wpOpen);
      $('#wallpaper-btn').classList.toggle('on', ui.wpOpen);
      if (ui.wpOpen) { renderWallpaperPanel(); }
    });
    document.addEventListener('mousedown', function (e) {
      if (!ui.wpOpen) { return; }
      if (e.target.closest('#wp-panel') || e.target.closest('#wallpaper-btn') || e.target.closest('.overlay')) { return; }
      ui.wpOpen = false;
      $('#wp-panel').classList.remove('open');
      $('#wallpaper-btn').classList.remove('on');
    });

    $('#mode-dark').addEventListener('click', function () { Store.setTheme('dark'); });
    $('#mode-light').addEventListener('click', function () { Store.setTheme('light'); });
    $('#wp-upload').addEventListener('click', function () { $('#wp-file').click(); });
    $('#wp-file').addEventListener('change', function () {
      handleUpload(this.files[0]);
      this.value = '';
    });
    $('#wp-more').addEventListener('click', moreWallpapers);

    $('#overlay').addEventListener('mousedown', function (e) {
      if (e.target === $('#overlay')) { closeModal(); }
    });

    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === 'Escape') {
        if ($('#overlay').classList.contains('open')) { closeModal(); return; }
        if (ui.searching) { closeSearch(); return; }
        if (document.body.classList.contains('zen')) { document.body.classList.remove('zen'); return; }
        if (ui.selecting) { toggleSelect(); return; }
        closeMenu();
        return;
      }
      if (typing) { return; }
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        openSearch();
      }
    });

    window.addEventListener('resize', function () {
      clearTimeout(window._lumiResize);
      window._lumiResize = setTimeout(renderGrid, 140);
    });

    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === 'refresh') { render(); }
    });
  }

  Store.load().then(function () {
    Store.subscribe(render);
    bind();
    $('#btn-rail-toggle').innerHTML = I.svg('grip', 22);
    render();
  });
})();
