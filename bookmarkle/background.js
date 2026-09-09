var KEY = 'bookmarkle:v1';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function readState() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(KEY, function (res) { resolve(res && res[KEY] ? res[KEY] : null); });
  });
}

function writeState(state) {
  return new Promise(function (resolve) {
    state.rev = (state.rev || 0) + 1;
    state.writer = 'background';
    var payload = {};
    payload[KEY] = state;
    chrome.storage.local.set(payload, resolve);
  });
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
}

function titleFromHtml(html) {
  var og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
           html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  var t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  var raw = (t && t[1]) || (og && og[1]) || '';
  raw = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  return raw.slice(0, 200);
}

async function fetchTitle(url) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 8000);
  try {
    var res = await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'follow'
    });
    clearTimeout(timer);
    if (!res.ok) { return null; }
    var type = res.headers.get('content-type') || '';
    if (type && type.indexOf('html') < 0) { return null; }
    var reader = res.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var html = '';
    while (html.length < 120000) {
      var chunk = await reader.read();
      if (chunk.done) { break; }
      html += decoder.decode(chunk.value, { stream: true });
      if (/<\/title>/i.test(html)) { break; }
    }
    try { reader.cancel(); } catch (e) {  }
    return titleFromHtml(html) || null;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

var SUGGEST_URL = 'https://suggestqueries.google.com/complete/search?client=firefox&q=';

async function fetchSuggestions(query) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 4000);
  try {
    var r = await fetch(SUGGEST_URL + encodeURIComponent(query), {
      signal: controller.signal,
      credentials: 'omit'
    });
    clearTimeout(timer);
    if (!r.ok) { return []; }
    var data = JSON.parse(await r.text());

    return Array.isArray(data) && Array.isArray(data[1]) ? data[1].slice(0, 8) : [];
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'suggest') {
    fetchSuggestions(msg.q).then(function (items) { sendResponse({ items: items }); });
    return true;
  }
  if (msg && msg.type === 'fetchTitle') {
    fetchTitle(msg.url).then(function (title) { sendResponse({ title: title }); });
    return true;
  }
  if (msg && msg.type === 'saveCurrent') {
    quickSave(msg.tab).then(function (r) { sendResponse(r); });
    return true;
  }
  if (msg && msg.type === 'saveAllTabs') {
    saveAllTabs().then(function (r) { sendResponse(r); });
    return true;
  }
  return false;
});

function targetPage(state) {
  var dest = state.settings && state.settings.quickSaveDestination;
  var page = null;
  if (dest && dest !== 'current') {
    page = state.pages.find(function (p) { return p.id === dest; });
  }
  if (!page) {
    page = state.pages.find(function (p) { return p.id === state.activePageId; }) || state.pages[0];
  }
  return page;
}

function inboxBoard(page) {
  var found = null;
  page.columns.forEach(function (col) {
    col.forEach(function (b) { if (!found && b.title === 'Quick Saves') { found = b; } });
  });
  if (found) { return found; }
  var board = { id: uid(), title: 'Quick Saves', links: [], collapsed: false };
  var shortest = 0;
  for (var i = 1; i < page.columns.length; i++) {
    if (page.columns[i].length < page.columns[shortest].length) { shortest = i; }
  }
  page.columns[shortest].push(board);
  return board;
}

async function quickSave(tabInfo) {
  var tab = tabInfo;
  if (!tab) {
    var found = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = found[0];
  }
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    return { ok: false, error: 'This page cannot be saved.' };
  }
  var state = await readState();
  if (!state) { return { ok: false, error: 'Open a new tab once to set Bookmarkle up.' }; }

  var page = targetPage(state);
  var board = inboxBoard(page);
  var dup = board.links.some(function (l) { return l.url === tab.url; });
  if (dup) { return { ok: false, error: 'Already saved to ' + board.title + '.' }; }

  board.links.push({
    id: uid(),
    url: tab.url,
    title: (tab.title || tab.url).slice(0, 200),
    description: '',
    addedAt: Date.now()
  });
  await writeState(state);
  notify('Saved to ' + page.name + ' / ' + board.title);
  return { ok: true, board: board.title, page: page.name };
}

async function saveAllTabs() {
  var tabs = await chrome.tabs.query({ currentWindow: true });
  var keep = tabs.filter(function (t) { return t.url && /^https?:/.test(t.url); });
  if (!keep.length) { return { ok: false, error: 'No saveable tabs here.' }; }

  var state = await readState();
  if (!state) { return { ok: false, error: 'Open a new tab once to set Bookmarkle up.' }; }

  var page = targetPage(state);
  var board = { id: uid(), title: 'Tabs ' + new Date().toLocaleDateString(), links: [], collapsed: false };
  keep.forEach(function (t) {
    board.links.push({
      id: uid(),
      url: t.url,
      title: (t.title || t.url).slice(0, 200),
      description: '',
      addedAt: Date.now()
    });
  });

  var shortest = 0;
  for (var i = 1; i < page.columns.length; i++) {
    if (page.columns[i].length < page.columns[shortest].length) { shortest = i; }
  }
  page.columns[shortest].push(board);
  await writeState(state);

  if (state.settings && state.settings.closeTabsAfterSaveAll) {
    var ids = keep.filter(function (t) { return !t.active; }).map(function (t) { return t.id; });
    if (ids.length) { chrome.tabs.remove(ids); }
  }
  notify('Saved ' + keep.length + ' tabs to ' + board.title);
  return { ok: true, count: keep.length, board: board.title };
}

function notify(message) {
  chrome.action.setBadgeText({ text: 'OK' });
  chrome.action.setBadgeBackgroundColor({ color: '#e0413f' });
  chrome.action.setTitle({ title: 'Bookmarkle - ' + message });
  setTimeout(function () {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Bookmarkle' });
  }, 2600);
}

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'quick-save') { quickSave(null); }
  if (command === 'save-all-tabs') { saveAllTabs(); }
});
