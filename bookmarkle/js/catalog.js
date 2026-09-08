(global => {
  'use strict';

  const CATALOG_URL = 'https://xbccmcszhnybxzlirjgk.supabase.co/storage/v1/object/public/wallpaper/gallery.json';
  const GALLERY_SITE = 'https://lumilist.in/wallpapers/';
  const CACHE_KEY = 'bookmarkle:catalog';
  const CACHE_TTL = 12 * 60 * 60 * 1000;

  let builtinCache = null;
  let remoteCache = null;
  let inflight = null;

  function extUrl(p) {
    return (global.chrome?.runtime?.getURL)
      ? chrome.runtime.getURL(p)
      : p;
  }

  async function loadBuiltin() {
    if (builtinCache) { return builtinCache; }
    try {
      const r = await fetch(extUrl('wallpapers/manifest.json'));
      const rows = await r.json();
      builtinCache = rows.map(w => ({
          id: w.id,
          name: w.name,
          src: extUrl(w.file),
          thumb: extUrl(w.file),
          isLight: !!w.isLight,
          builtin: true,
          source: 'builtin',
          categoryId: 'bundled',

          style: {
            primary: w.accent,
            board: w.board || (w.isLight ? '#EFF0F1' : '#14161C'),
            opacity: typeof w.opacity === 'number' ? w.opacity : (w.isLight ? 0.35 : 0.5),
            blur: typeof w.blur === 'number' ? w.blur : 16
          }
      }));
    } catch {
      builtinCache = [];
    }
    return builtinCache;
  }

  function normalise(raw, isLight) {
    const st = raw.style || {};
    return {
      id: raw.id,
      name: raw.label || 'Wallpaper',
      src: raw.file,
      thumb: raw.thumbnailUrl || raw.file,
      isLight,
      builtin: false,
      source: 'lumilist',
      categoryId: raw.categoryId || 'featured',
      tags: raw.tags || [],
      downloads: raw.downloadCount || 0,
      updatedAt: raw.updatedAt || '',
      style: {
        primary: st.primary || null,
        blur: typeof st.boardBackdropBlur === 'number' ? st.boardBackdropBlur : 16,
        board: st.boardBackgroundColor || (isLight ? '#EFF0F1' : '#14161C'),
        opacity: typeof st.boardBackgroundOpacity === 'number' ? st.boardBackgroundOpacity : (isLight ? 0.35 : 0.5)
      }
    };
  }

  function parseCatalog(json) {
    const out = { items: [], categories: [] };
    if (!json || !json.themes) { return out; }
    ['dark', 'light'].forEach(theme => {
      const bucket = json.themes[theme];
      if (!bucket) { return; }
      Object.keys(bucket).forEach(k => {
        const raw = bucket[k];
        if (raw?.file) { out.items.push(normalise(raw, theme === 'light')); }
      });
    });
    out.categories = (json.categories || []).map(c => ({
      id: c.id,
      label: c.label
    }));
    return out;
  }

  async function readCache() {
    if (!global.chrome || !chrome.storage) { return null; }
    const res = await chrome.storage.local.get(CACHE_KEY);
    const hit = res && res[CACHE_KEY];
    const fresh = hit?.at && Date.now() - hit.at < CACHE_TTL && hit.data;
    return fresh ? hit.data : null;
  }

  function writeCache(data) {
    if (!global.chrome || !chrome.storage) { return; }
    try {
      chrome.storage.local.set({ [CACHE_KEY]: { at: Date.now(), data } });
    } catch {  }
  }

  async function fetchCatalog() {
    const r = await fetch(CATALOG_URL, { credentials: 'omit' });
    if (!r.ok) { throw new Error(`catalog ${r.status}`); }
    const parsed = parseCatalog(await r.json());
    if (parsed.items.length) { writeCache(parsed); }
    return parsed;
  }

  function loadRemote(force) {
    if (remoteCache && !force) { return Promise.resolve(remoteCache); }
    if (inflight && !force) { return inflight; }

    inflight = (async () => {
      try {
        const cached = force ? null : await readCache();
        remoteCache = cached || await fetchCatalog();
      } catch (err) {
        remoteCache = { items: [], categories: [], error: String(err?.message || err) };
      }
      inflight = null;
      return remoteCache;
    })();

    return inflight;
  }

  async function loadAll(force) {
    const [builtin, remote] = await Promise.all([loadBuiltin(), loadRemote(force)]);
    return {
      builtin,
      remote: remote.items,
      categories: remote.categories,
      error: remote.error || null,
      all: builtin.concat(remote.items)
    };
  }

  function byId(id, data) {
    const pool = (data && data.all) || [];
    for (let i = 0; i < pool.length; i++) { if (pool[i].id === id) { return pool[i]; } }
    return null;
  }

  global.Catalog = {
    CATALOG_URL,
    GALLERY_SITE,
    loadBuiltin,
    loadRemote,
    loadAll,
    byId
  };
})(typeof window !== 'undefined' ? window : globalThis);
