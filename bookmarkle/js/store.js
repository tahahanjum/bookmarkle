(function (global) {
  'use strict';

  var KEY = 'bookmarkle:v1';
  var COLS = 4;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultSettings() {
    return {
      compactMode: true,
      showClock: true,

      clockX: 50,
      clockY: 10,
      clockScale: 1,

      clockStretch: 1,
      clockFont: 'saira',

      clockColorMode: 'accent',
      clockColor: '#ffffff',
      clockGlass: false,
      groupTools: false,
      hideExtraBookmarks: false,
      shortenTitles: true,
      openInNewTab: false,
      showDescriptions: true,
      closeTabsAfterSaveAll: false,
      quickSaveDestination: 'current',
      language: 'auto',
      theme: 'dark'
    };
  }

  function defaultThemeStyle(isLight) {
    return isLight
      ? {
          wallpaperId: 'builtin/morning-haze',
          wallpaperSrc: 'wallpapers/morning-haze.png',
          wallpaperName: 'Morning Haze',
          primary: '#4A6FB5', board: '#EFF0F1', opacity: 0.35, blur: 16
        }
      : {
          wallpaperId: 'builtin/final-rest',
          wallpaperSrc: 'wallpapers/final-rest.jpg',
          wallpaperName: 'Final Rest',
          primary: '#A41929', board: '#35171B', opacity: 0.55, blur: 14
        };
  }

  function emptyColumns() {
    var c = [], i;
    for (i = 0; i < COLS; i++) { c.push([]); }
    return c;
  }

  function makeBoard(title) {
    return { id: uid(), title: title || 'New Board', links: [], collapsed: false };
  }

  function makePage(name) {
    return { id: uid(), name: name || 'Home', columns: emptyColumns() };
  }

  function seed() {
    var page = makePage('Home');
    return {
      version: 1,
      pages: [page],
      activePageId: page.id,
      settings: defaultSettings(),
      themes: { dark: defaultThemeStyle(false), light: defaultThemeStyle(true) },
      wallpapers: { user: [] },
      trash: []
    };
  }

  var state = null;
  var listeners = [];
  var saveTimer = null;

  function migrate(data) {
    if (!data || typeof data !== 'object') { return seed(); }
    if (!Array.isArray(data.pages) || !data.pages.length) { return seed(); }
    data.settings = Object.assign(defaultSettings(), data.settings || {});
    data.themes = data.themes || {};
    ['dark', 'light'].forEach(function (mode) {
      var isLight = mode === 'light';
      var t = Object.assign(defaultThemeStyle(isLight), data.themes[mode] || {});

      if (t.dim !== undefined) {
        if (!t.board) { t.board = isLight ? '#EFF0F1' : '#14161C'; }
        if (typeof t.opacity !== 'number') { t.opacity = isLight ? 0.35 : 0.5; }
        delete t.dim;
      }

      if (!t.wallpaperSrc) {
        var d = defaultThemeStyle(isLight);
        t.wallpaperId = d.wallpaperId;
        t.wallpaperSrc = d.wallpaperSrc;
        t.wallpaperName = d.wallpaperName;
      }
      data.themes[mode] = t;
    });
    data.wallpapers = data.wallpapers || {};
    data.wallpapers.user = (data.wallpapers.user || []).filter(function (w) { return w && w.src; });
    data.trash = data.trash || [];
    data.pages.forEach(function (p) {
      if (!Array.isArray(p.columns)) { p.columns = emptyColumns(); }
      while (p.columns.length < COLS) { p.columns.push([]); }
      p.columns.forEach(function (col) {
        col.forEach(function (b) {
          b.links = b.links || [];
          b.links.forEach(function (l) { if (!l.id) { l.id = uid(); } });
        });
      });
    });
    if (!data.pages.some(function (p) { return p.id === data.activePageId; })) {
      data.activePageId = data.pages[0].id;
    }
    return data;
  }

  function load() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(KEY, function (res) {
        state = migrate(res && res[KEY]);
        myRev = state.rev || 0;
        watchStorage();
        resolve(state);
      });
    });
  }

  var PAGE_ID = uid();
  var myRev = 0;

  function persist() {
    if (saveTimer) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(function () {
      state.rev = (state.rev || 0) + 1;
      state.writer = PAGE_ID;
      myRev = state.rev;
      var payload = {};
      payload[KEY] = state;
      chrome.storage.local.set(payload);
    }, 120);
  }

  function adoptExternal(incoming) {
    if (!incoming) { return; }

    if (incoming.writer === PAGE_ID && incoming.rev === myRev) { return; }
    state = migrate(incoming);
    myRev = state.rev || 0;
    emit();
  }

  function watchStorage() {
    if (!global.chrome || !chrome.storage || !chrome.storage.onChanged) { return; }
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[KEY]) { return; }
      adoptExternal(changes[KEY].newValue);
    });
  }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  function commit() {
    persist();
    emit();
  }

  function activePage() {
    for (var i = 0; i < state.pages.length; i++) {
      if (state.pages[i].id === state.activePageId) { return state.pages[i]; }
    }
    return state.pages[0];
  }

  function pageById(id) {
    for (var i = 0; i < state.pages.length; i++) {
      if (state.pages[i].id === id) { return state.pages[i]; }
    }
    return null;
  }

  function findBoard(boardId) {
    for (var p = 0; p < state.pages.length; p++) {
      var page = state.pages[p];
      for (var c = 0; c < page.columns.length; c++) {
        for (var b = 0; b < page.columns[c].length; b++) {
          if (page.columns[c][b].id === boardId) {
            return { page: page, col: c, index: b, board: page.columns[c][b] };
          }
        }
      }
    }
    return null;
  }

  function allBoards(page) {
    var out = [];
    (page || activePage()).columns.forEach(function (col) {
      col.forEach(function (b) { out.push(b); });
    });
    return out;
  }

  function currentTheme() {
    return state.themes[state.settings.theme] || state.themes.dark;
  }

  function addPage(name) {
    var p = makePage(name);
    state.pages.push(p);
    state.activePageId = p.id;
    commit();
    return p;
  }

  function renamePage(id, name) {
    var p = pageById(id);
    if (p) { p.name = name; commit(); }
  }

  function deletePage(id) {
    if (state.pages.length <= 1) { return false; }
    var idx = state.pages.findIndex(function (p) { return p.id === id; });
    if (idx < 0) { return false; }
    var removed = state.pages.splice(idx, 1)[0];
    state.trash.unshift({ id: uid(), kind: 'page', label: removed.name, payload: removed, at: Date.now() });
    if (state.activePageId === id) {
      state.activePageId = state.pages[Math.max(0, idx - 1)].id;
    }
    commit();
    return true;
  }

  function setActivePage(id) {
    state.activePageId = id;
    commit();
  }

  function movePage(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= state.pages.length) { return; }
    var moved = state.pages.splice(fromIdx, 1)[0];
    state.pages.splice(toIdx, 0, moved);
    commit();
  }

  function addBoard(col, title) {
    var page = activePage();
    var b = makeBoard(title);
    var c = Math.max(0, Math.min(page.columns.length - 1, col));
    page.columns[c].push(b);
    commit();
    return b;
  }

  function renameBoard(boardId, title) {
    var hit = findBoard(boardId);
    if (hit) { hit.board.title = title; commit(); }
  }

  function toggleBoardCollapsed(boardId) {
    var hit = findBoard(boardId);
    if (!hit) { return; }
    hit.board.collapsed = !hit.board.collapsed;
    commit();
    return hit.board.collapsed;
  }

  function deleteBoard(boardId) {
    var hit = findBoard(boardId);
    if (!hit) { return; }
    hit.page.columns[hit.col].splice(hit.index, 1);
    state.trash.unshift({
      id: uid(), kind: 'board', label: hit.board.title,
      payload: hit.board, pageId: hit.page.id, col: hit.col, at: Date.now()
    });
    commit();
  }

  function moveBoard(boardId, toCol, toIndex) {
    var hit = findBoard(boardId);
    if (!hit) { return; }
    var page = hit.page;
    page.columns[hit.col].splice(hit.index, 1);
    var target = Math.max(0, Math.min(page.columns.length - 1, toCol));
    var at = toIndex;
    if (at === undefined || at === null || at > page.columns[target].length) {
      at = page.columns[target].length;
    }
    page.columns[target].splice(at, 0, hit.board);
    commit();
  }

  function moveBoardToPage(boardId, pageId) {
    var hit = findBoard(boardId);
    var target = pageById(pageId);
    if (!hit || !target || hit.page.id === pageId) { return; }
    hit.page.columns[hit.col].splice(hit.index, 1);
    var shortest = 0;
    for (var i = 1; i < target.columns.length; i++) {
      if (target.columns[i].length < target.columns[shortest].length) { shortest = i; }
    }
    target.columns[shortest].push(hit.board);
    commit();
  }

  function addLink(boardId, link) {
    var hit = findBoard(boardId);
    if (!hit) { return null; }
    var l = {
      id: uid(),
      url: link.url,
      title: link.title || link.url,
      description: link.description || '',
      addedAt: Date.now()
    };
    hit.board.links.push(l);
    commit();
    return l;
  }

  function replaceBoardLinks(boardId, links) {
    var hit = findBoard(boardId);
    if (!hit) { return null; }
    hit.board.links = links.map(function (link) {
      return {
        id: uid(),
        url: link.url,
        title: link.title || link.url,
        description: link.description || '',
        addedAt: Date.now()
      };
    });
    commit();
    return hit.board;
  }

  function updateLink(boardId, linkId, patch) {
    var hit = findBoard(boardId);
    if (!hit) { return; }
    var l = hit.board.links.find(function (x) { return x.id === linkId; });
    if (l) { Object.assign(l, patch); commit(); }
  }

  function deleteLink(boardId, linkId) {
    var hit = findBoard(boardId);
    if (!hit) { return; }
    var i = hit.board.links.findIndex(function (x) { return x.id === linkId; });
    if (i < 0) { return; }
    var removed = hit.board.links.splice(i, 1)[0];
    state.trash.unshift({
      id: uid(), kind: 'link', label: removed.title,
      payload: removed, boardId: boardId, at: Date.now()
    });
    commit();
  }

  function moveLink(fromBoardId, linkId, toBoardId, toIndex) {
    var from = findBoard(fromBoardId), to = findBoard(toBoardId);
    if (!from || !to) { return; }
    var i = from.board.links.findIndex(function (x) { return x.id === linkId; });
    if (i < 0) { return; }
    var l = from.board.links.splice(i, 1)[0];
    var at = toIndex;
    if (at === undefined || at === null || at > to.board.links.length) {
      at = to.board.links.length;
    }
    to.board.links.splice(at, 0, l);
    commit();
  }

  function restoreTrash(entryId) {
    var i = state.trash.findIndex(function (t) { return t.id === entryId; });
    if (i < 0) { return false; }
    var e = state.trash[i];
    if (e.kind === 'link') {
      var hit = findBoard(e.boardId);
      if (!hit) { return false; }
      hit.board.links.push(e.payload);
    } else if (e.kind === 'board') {
      var page = pageById(e.pageId) || activePage();
      var col = Math.max(0, Math.min(page.columns.length - 1, e.col || 0));
      page.columns[col].push(e.payload);
    } else if (e.kind === 'page') {
      state.pages.push(e.payload);
    }
    state.trash.splice(i, 1);
    commit();
    return true;
  }

  function removeTrash(entryId) {
    var i = state.trash.findIndex(function (t) { return t.id === entryId; });
    if (i >= 0) { state.trash.splice(i, 1); commit(); }
  }

  function emptyTrash() {
    state.trash = [];
    commit();
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    commit();
  }

  function setTheme(mode) {
    state.settings.theme = mode;
    commit();
  }

  function updateThemeStyle(patch) {
    Object.assign(state.themes[state.settings.theme], patch);
    commit();
  }

  function addUserWallpaper(wp) {
    var existing = wp.sourceId && state.wallpapers.user.filter(function (w) {
      return w.sourceId === wp.sourceId;
    })[0];
    if (existing) { return existing; }

    var entry = {
      id: wp.id || uid(),
      sourceId: wp.sourceId || null,
      name: wp.name || 'My Wallpaper',
      src: wp.src,
      builtin: false,
      source: wp.source || 'upload',
      isLight: !!wp.isLight,
      style: wp.style || { primary: '#8CA6FF', board: wp.isLight ? '#EFF0F1' : '#14161C', opacity: wp.isLight ? 0.35 : 0.5, blur: 16 }
    };
    state.wallpapers.user.unshift(entry);
    commit();
    return entry;
  }

  function deleteUserWallpaper(id) {
    state.wallpapers.user = state.wallpapers.user.filter(function (w) { return w.id !== id; });
    commit();
  }

  function updateUserWallpaper(id, patch) {
    var w = state.wallpapers.user.find(function (x) { return x.id === id; });
    if (w) { Object.assign(w, patch); commit(); }
  }

  function wallpaperById(id) {
    return state.wallpapers.user.find(function (x) { return x.id === id; }) || null;
  }

  function applyWallpaperToTheme(wp, mode) {
    var target = mode || state.settings.theme;
    var t = state.themes[target];
    t.wallpaperId = wp.id;
    t.wallpaperSrc = wp.src;
    t.wallpaperName = wp.name || '';
    if (wp.style) {
      if (wp.style.primary) { t.primary = wp.style.primary; }
      if (typeof wp.style.blur === 'number') { t.blur = wp.style.blur; }
      if (wp.style.board) { t.board = wp.style.board; }
      if (typeof wp.style.opacity === 'number') { t.opacity = wp.style.opacity; }
    }
    commit();
    return t;
  }

  function exportData() {
    return JSON.stringify(state, null, 2);
  }

  function importData(json) {
    var parsed = JSON.parse(json);
    state = migrate(parsed);
    commit();
    return state;
  }

  function resetAll() {
    state = seed();
    commit();
  }

  global.Store = {
    COLS: COLS,
    uid: uid,
    load: load,
    commit: commit,
    subscribe: function (fn) { listeners.push(fn); },
    get state() { return state; },
    activePage: activePage,
    pageById: pageById,
    findBoard: findBoard,
    allBoards: allBoards,
    currentTheme: currentTheme,
    defaultThemeStyle: defaultThemeStyle,
    defaultSettings: defaultSettings,
    addPage: addPage,
    renamePage: renamePage,
    deletePage: deletePage,
    setActivePage: setActivePage,
    movePage: movePage,
    addBoard: addBoard,
    renameBoard: renameBoard,
    toggleBoardCollapsed: toggleBoardCollapsed,
    deleteBoard: deleteBoard,
    moveBoard: moveBoard,
    moveBoardToPage: moveBoardToPage,
    addLink: addLink,
    replaceBoardLinks: replaceBoardLinks,
    updateLink: updateLink,
    deleteLink: deleteLink,
    moveLink: moveLink,
    restoreTrash: restoreTrash,
    removeTrash: removeTrash,
    emptyTrash: emptyTrash,
    setSetting: setSetting,
    setTheme: setTheme,
    updateThemeStyle: updateThemeStyle,
    addUserWallpaper: addUserWallpaper,
    deleteUserWallpaper: deleteUserWallpaper,
    updateUserWallpaper: updateUserWallpaper,
    wallpaperById: wallpaperById,
    applyWallpaperToTheme: applyWallpaperToTheme,
    exportData: exportData,
    importData: importData,
    resetAll: resetAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
