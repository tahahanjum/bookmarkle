(function (global) {
  'use strict';

  var CATALOG_URL = 'https://xbccmcszhnybxzlirjgk.supabase.co/storage/v1/object/public/wallpaper/gallery.json';
  var GALLERY_SITE = 'https://lumilist.in/wallpapers/';
  var CACHE_KEY = 'bookmarkle:catalog';
  var CACHE_TTL = 12 * 60 * 60 * 1000;

  var builtinCache = null;
  var remoteCache = null;
  var inflight = null;

  function extUrl(p) {
    return (global.chrome && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL(p)
      : p;
  }

  function loadBuiltin() {
    if (builtinCache) { return Promise.resolve(builtinCache); }
    return fetch(extUrl('wallpapers/manifest.json'))
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        builtinCache = rows.map(function (w) {
          return {
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
          };
        });
        return builtinCache;
      })
      .catch(function () { builtinCache = []; return builtinCache; });
  }

  function normalise(raw, isLight) {
    var st = raw.style || {};
    return {
      id: raw.id,
      name: raw.label || 'Wallpaper',
      src: raw.file,
      thumb: raw.thumbnailUrl || raw.file,
      isLight: isLight,
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
    var out = { items: [], categories: [] };
    if (!json || !json.themes) { return out; }
    ['dark', 'light'].forEach(function (theme) {
      var bucket = json.themes[theme];
      if (!bucket) { return; }
      Object.keys(bucket).forEach(function (k) {
        var raw = bucket[k];
        if (raw && raw.file) { out.items.push(normalise(raw, theme === 'light')); }
      });
    });
    out.categories = (json.categories || []).map(function (c) {
      return { id: c.id, label: c.label };
    });
    return out;
  }

  function readCache() {
    return new Promise(function (resolve) {
      if (!global.chrome || !chrome.storage) { resolve(null); return; }
      chrome.storage.local.get(CACHE_KEY, function (res) {
        var hit = res && res[CACHE_KEY];
        if (hit && hit.at && Date.now() - hit.at < CACHE_TTL && hit.data) { resolve(hit.data); }
        else { resolve(null); }
      });
    });
  }

  function writeCache(data) {
    if (!global.chrome || !chrome.storage) { return; }
    var payload = {};
    payload[CACHE_KEY] = { at: Date.now(), data: data };
    try { chrome.storage.local.set(payload); } catch (e) {  }
  }

  function loadRemote(force) {
    if (remoteCache && !force) { return Promise.resolve(remoteCache); }
    if (inflight && !force) { return inflight; }

    inflight = (force ? Promise.resolve(null) : readCache())
      .then(function (cached) {
        if (cached) { return cached; }
        return fetch(CATALOG_URL, { credentials: 'omit' })
          .then(function (r) {
            if (!r.ok) { throw new Error('catalog ' + r.status); }
            return r.json();
          })
          .then(function (json) {
            var parsed = parseCatalog(json);
            if (parsed.items.length) { writeCache(parsed); }
            return parsed;
          });
      })
      .then(function (data) {
        remoteCache = data;
        inflight = null;
        return data;
      })
      .catch(function (err) {
        inflight = null;
        remoteCache = { items: [], categories: [], error: String(err && err.message || err) };
        return remoteCache;
      });

    return inflight;
  }

  function loadAll(force) {
    return Promise.all([loadBuiltin(), loadRemote(force)]).then(function (r) {
      var builtin = r[0], remote = r[1];
      return {
        builtin: builtin,
        remote: remote.items,
        categories: remote.categories,
        error: remote.error || null,
        all: builtin.concat(remote.items)
      };
    });
  }

  function byId(id, data) {
    var pool = (data && data.all) || [];
    for (var i = 0; i < pool.length; i++) { if (pool[i].id === id) { return pool[i]; } }
    return null;
  }

  global.Catalog = {
    CATALOG_URL: CATALOG_URL,
    GALLERY_SITE: GALLERY_SITE,
    loadBuiltin: loadBuiltin,
    loadRemote: loadRemote,
    loadAll: loadAll,
    byId: byId
  };
})(typeof window !== 'undefined' ? window : globalThis);
