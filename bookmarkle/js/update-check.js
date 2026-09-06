(function (global) {
  'use strict';

  var REPO = 'tahahanjum/bookmarkle';
  var BRANCH = 'main';
  var MANIFEST_URL = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/bookmarkle/manifest.json';
  var REPO_URL = 'https://github.com/' + REPO;
  var STATE_KEY = 'bookmarkle:update';
  var CHECK_EVERY = 24 * 60 * 60 * 1000;

  function currentVersion() {
    try { return chrome.runtime.getManifest().version; } catch (e) { return '0.0.0'; }
  }

  function compare(a, b) {
    var x = String(a).split('.').map(Number);
    var y = String(b).split('.').map(Number);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = x[i] || 0, q = y[i] || 0;
      if (p !== q) { return p > q ? 1 : -1; }
    }
    return 0;
  }

  function readState() {
    return new Promise(function (resolve) {
      if (!global.chrome || !chrome.storage) { resolve({}); return; }
      chrome.storage.local.get(STATE_KEY, function (res) { resolve((res && res[STATE_KEY]) || {}); });
    });
  }

  function writeState(patch) {
    return readState().then(function (prev) {
      var next = Object.assign({}, prev, patch);
      var payload = {};
      payload[STATE_KEY] = next;
      try { chrome.storage.local.set(payload); } catch (e) {  }
      return next;
    });
  }

  function fetchLatest() {
    return fetch(MANIFEST_URL, { cache: 'no-cache', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      })
      .then(function (m) { return m && m.version ? String(m.version) : null; });
  }

  function check(force) {
    return readState().then(function (state) {
      var fresh = state.lastCheck && (Date.now() - state.lastCheck) < CHECK_EVERY;
      if (fresh && !force) {
        return { latest: state.latest || null, current: currentVersion(), cached: true };
      }
      return fetchLatest()
        .then(function (latest) {
          return writeState({ lastCheck: Date.now(), latest: latest, error: null })
            .then(function () { return { latest: latest, current: currentVersion(), cached: false }; });
        })
        .catch(function (err) {
          return writeState({ lastCheck: Date.now(), error: String(err.message || err) })
            .then(function () {
              return { latest: state.latest || null, current: currentVersion(), error: String(err.message || err) };
            });
        });
    });
  }

  function pending() {
    return Promise.all([check(false), readState()]).then(function (r) {
      var info = r[0], state = r[1];
      if (!info.latest) { return null; }
      if (compare(info.latest, info.current) <= 0) { return null; }
      if (state.dismissed === info.latest) { return null; }
      return { latest: info.latest, current: info.current };
    });
  }

  function dismiss(version) {
    return writeState({ dismissed: version });
  }

  global.UpdateCheck = {
    REPO_URL: REPO_URL,
    MANIFEST_URL: MANIFEST_URL,
    currentVersion: currentVersion,
    compare: compare,
    check: check,
    pending: pending,
    dismiss: dismiss
  };
})(typeof window !== 'undefined' ? window : globalThis);
