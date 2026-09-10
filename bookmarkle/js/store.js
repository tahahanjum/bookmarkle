(global => {
  'use strict';

  const KEY = 'bookmarkle:v1';
  const COLS = 4;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultSettings() {
    return {
      compactMode: true,
      showClock: true,

      clockX: 50,
      clockY: 10,

      clockAnchorX: 'center',
      clockAnchorY: 'top',
      clockOffsetX: 0,
      clockOffsetY: 0,
      clockScale: 1,

      clockStretch: 1,
      clockFont: 'saira',

      clockColorMode: 'accent',
      clockColor: '#ffffff',
      clockGlass: false,

      clockShadow: true,
      clockShadowColor: '#000000',
      clockShadowAngle: 90,
      clockShadowDistance: 6,
      clockShadowBlur: 18,
      clockShadowOpacity: 0.45,
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
    const c = [];
    let i;
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
    const page = makePage('Home');
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

  let state = null;
  const listeners = [];
  let saveTimer = null;

  function migrate(data) {
    if (!data || typeof data !== 'object') { return seed(); }
    if (!Array.isArray(data.pages) || !data.pages.length) { return seed(); }

    const hadNoAnchor = !!data.settings && !data.settings.clockAnchorX;
    data.settings = { ...defaultSettings(), ...(data.settings || {}) };
    if (hadNoAnchor) { data.settings.clockNeedsAnchor = true; }
    data.themes = data.themes || {};
    ['dark', 'light'].forEach(mode => {
      const isLight = mode === 'light';
      const t = { ...defaultThemeStyle(isLight), ...(data.themes[mode] || {}) };

      if (t.dim !== undefined) {
        t.board ||= isLight ? '#EFF0F1' : '#14161C';
        if (typeof t.opacity !== 'number') { t.opacity = isLight ? 0.35 : 0.5; }
        delete t.dim;
      }

      if (!t.wallpaperSrc) {
        const d = defaultThemeStyle(isLight);
        t.wallpaperId = d.wallpaperId;
        t.wallpaperSrc = d.wallpaperSrc;
        t.wallpaperName = d.wallpaperName;
      }
      data.themes[mode] = t;
    });
    data.wallpapers = data.wallpapers || {};
    data.wallpapers.user = (data.wallpapers.user || []).filter(w => w && w.src);
    data.trash = data.trash || [];
    data.pages.forEach(p => {
      if (!Array.isArray(p.columns)) { p.columns = emptyColumns(); }
      while (p.columns.length < COLS) { p.columns.push([]); }
      p.columns.forEach(col => {
        col.forEach(b => {
          b.links = b.links || [];
          b.links.forEach(l => { l.id ||= uid(); });
        });
      });
    });
    if (!data.pages.some(p => p.id === data.activePageId)) {
      data.activePageId = data.pages[0].id;
    }
    return data;
  }

  async function load() {
    const res = await chrome.storage.local.get(KEY);
    state = migrate(res && res[KEY]);
    myRev = state.rev || 0;
    watchStorage();
    return state;
  }

  const PAGE_ID = uid();
  let myRev = 0;

  function persist() {
    if (saveTimer) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(() => {
      state.rev = (state.rev || 0) + 1;
      state.writer = PAGE_ID;
      myRev = state.rev;
      chrome.storage.local.set({ [KEY]: state });
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
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEY]) { return; }
      adoptExternal(changes[KEY].newValue);
    });
  }

  function emit() {
    listeners.forEach(fn => { fn(state); });
  }

  function commit() {
    persist();
    emit();
  }

  function activePage() {
    for (let i = 0; i < state.pages.length; i++) {
      if (state.pages[i].id === state.activePageId) { return state.pages[i]; }
    }
    return state.pages[0];
  }

  function pageById(id) {
    for (let i = 0; i < state.pages.length; i++) {
      if (state.pages[i].id === id) { return state.pages[i]; }
    }
    return null;
  }

  function findBoard(boardId) {
    for (let p = 0; p < state.pages.length; p++) {
      const page = state.pages[p];
      for (let c = 0; c < page.columns.length; c++) {
        for (let b = 0; b < page.columns[c].length; b++) {
          if (page.columns[c][b].id === boardId) {
            return { page, col: c, index: b, board: page.columns[c][b] };
          }
        }
      }
    }
    return null;
  }

  function allBoards(page) {
    return (page || activePage()).columns.flat();
  }

  function currentTheme() {
    return state.themes[state.settings.theme] || state.themes.dark;
  }

  function addPage(name) {
    const p = makePage(name);
    state.pages.push(p);
    state.activePageId = p.id;
    commit();
    return p;
  }

  function renamePage(id, name) {
    const p = pageById(id);
    if (p) { p.name = name; commit(); }
  }

  function deletePage(id) {
    if (state.pages.length <= 1) { return false; }
    const idx = state.pages.findIndex(p => p.id === id);
    if (idx < 0) { return false; }
    const removed = state.pages.splice(idx, 1)[0];
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
    const moved = state.pages.splice(fromIdx, 1)[0];
    state.pages.splice(toIdx, 0, moved);
    commit();
  }

  function addBoard(col, title) {
    const page = activePage();
    const b = makeBoard(title);
    const c = Math.max(0, Math.min(page.columns.length - 1, col));
    page.columns[c].push(b);
    commit();
    return b;
  }

  function renameBoard(boardId, title) {
    const hit = findBoard(boardId);
    if (hit) { hit.board.title = title; commit(); }
  }

  function toggleBoardCollapsed(boardId) {
    const hit = findBoard(boardId);
    if (!hit) { return; }
    hit.board.collapsed = !hit.board.collapsed;
    commit();
    return hit.board.collapsed;
  }

  function deleteBoard(boardId) {
    const hit = findBoard(boardId);
    if (!hit) { return; }
    hit.page.columns[hit.col].splice(hit.index, 1);
    state.trash.unshift({
      id: uid(), kind: 'board', label: hit.board.title,
      payload: hit.board, pageId: hit.page.id, col: hit.col, at: Date.now()
    });
    commit();
  }

  function moveBoard(boardId, toCol, toIndex) {
    const hit = findBoard(boardId);
    if (!hit) { return; }
    const page = hit.page;
    page.columns[hit.col].splice(hit.index, 1);
    const target = Math.max(0, Math.min(page.columns.length - 1, toCol));
    let at = toIndex;
    if (at === undefined || at === null || at > page.columns[target].length) {
      at = page.columns[target].length;
    }
    page.columns[target].splice(at, 0, hit.board);
    commit();
  }

  function moveBoardToPage(boardId, pageId) {
    const hit = findBoard(boardId);
    const target = pageById(pageId);
    if (!hit || !target || hit.page.id === pageId) { return; }
    hit.page.columns[hit.col].splice(hit.index, 1);
    let shortest = 0;
    for (let i = 1; i < target.columns.length; i++) {
      if (target.columns[i].length < target.columns[shortest].length) { shortest = i; }
    }
    target.columns[shortest].push(hit.board);
    commit();
  }

  function addLink(boardId, link) {
    const hit = findBoard(boardId);
    if (!hit) { return null; }
    const l = {
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
    const hit = findBoard(boardId);
    if (!hit) { return null; }
    hit.board.links = links.map(link => ({
      id: uid(),
      url: link.url,
      title: link.title || link.url,
      description: link.description || '',
      addedAt: Date.now()
    }));
    commit();
    return hit.board;
  }

  function updateLink(boardId, linkId, patch) {
    const hit = findBoard(boardId);
    if (!hit) { return; }
    const l = hit.board.links.find(x => x.id === linkId);
    if (l) { Object.assign(l, patch); commit(); }
  }

  function deleteLink(boardId, linkId) {
    const hit = findBoard(boardId);
    if (!hit) { return; }
    const i = hit.board.links.findIndex(x => x.id === linkId);
    if (i < 0) { return; }
    const removed = hit.board.links.splice(i, 1)[0];
    state.trash.unshift({
      id: uid(), kind: 'link', label: removed.title,
      payload: removed, boardId, at: Date.now()
    });
    commit();
  }

  function moveLink(fromBoardId, linkId, toBoardId, toIndex) {
    const from = findBoard(fromBoardId);
    const to = findBoard(toBoardId);
    if (!from || !to) { return; }
    const i = from.board.links.findIndex(x => x.id === linkId);
    if (i < 0) { return; }
    const l = from.board.links.splice(i, 1)[0];
    let at = toIndex;
    if (at === undefined || at === null || at > to.board.links.length) {
      at = to.board.links.length;
    }
    to.board.links.splice(at, 0, l);
    commit();
  }

  function restoreTrash(entryId) {
    const i = state.trash.findIndex(t => t.id === entryId);
    if (i < 0) { return false; }
    const e = state.trash[i];
    if (e.kind === 'link') {
      const hit = findBoard(e.boardId);
      if (!hit) { return false; }
      hit.board.links.push(e.payload);
    } else if (e.kind === 'board') {
      const page = pageById(e.pageId) || activePage();
      const col = Math.max(0, Math.min(page.columns.length - 1, e.col || 0));
      page.columns[col].push(e.payload);
    } else if (e.kind === 'page') {
      state.pages.push(e.payload);
    }
    state.trash.splice(i, 1);
    commit();
    return true;
  }

  function removeTrash(entryId) {
    const i = state.trash.findIndex(t => t.id === entryId);
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
    const existing = wp.sourceId && state.wallpapers.user.filter(w => w.sourceId === wp.sourceId)[0];
    if (existing) { return existing; }

    const entry = {
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
    state.wallpapers.user = state.wallpapers.user.filter(w => w.id !== id);
    commit();
  }

  function updateUserWallpaper(id, patch) {
    const w = state.wallpapers.user.find(x => x.id === id);
    if (w) { Object.assign(w, patch); commit(); }
  }

  function wallpaperById(id) {
    return state.wallpapers.user.find(x => x.id === id) || null;
  }

  function applyWallpaperToTheme(wp, mode) {
    const target = mode || state.settings.theme;
    const t = state.themes[target];
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
    const parsed = JSON.parse(json);
    state = migrate(parsed);
    commit();
    return state;
  }

  function resetAll() {
    state = seed();
    commit();
  }

  global.Store = {
    COLS,
    uid,
    load,
    commit,
    subscribe(fn) { listeners.push(fn); },
    get state() { return state; },
    activePage,
    pageById,
    findBoard,
    allBoards,
    currentTheme,
    defaultThemeStyle,
    defaultSettings,
    addPage,
    renamePage,
    deletePage,
    setActivePage,
    movePage,
    addBoard,
    renameBoard,
    toggleBoardCollapsed,
    deleteBoard,
    moveBoard,
    moveBoardToPage,
    addLink,
    replaceBoardLinks,
    updateLink,
    deleteLink,
    moveLink,
    restoreTrash,
    removeTrash,
    emptyTrash,
    setSetting,
    setTheme,
    updateThemeStyle,
    addUserWallpaper,
    deleteUserWallpaper,
    updateUserWallpaper,
    wallpaperById,
    applyWallpaperToTheme,
    exportData,
    importData,
    resetAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
