(global => {
  'use strict';

  const REPO = 'tahahanjum/bookmarkle';
  const BRANCH = 'main';
  const MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/bookmarkle/manifest.json`;
  const REPO_URL = `https://github.com/${REPO}`;
  const STATE_KEY = 'bookmarkle:update';
  const CHECK_EVERY = 24 * 60 * 60 * 1000;

  function currentVersion() {
    try { return chrome.runtime.getManifest().version; } catch { return '0.0.0'; }
  }

  function compare(a, b) {
    const x = String(a).split('.').map(Number);
    const y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] || 0;
      const q = y[i] || 0;
      if (p !== q) { return p > q ? 1 : -1; }
    }
    return 0;
  }

  async function readState() {
    if (!global.chrome || !chrome.storage) { return {}; }
    const res = await chrome.storage.local.get(STATE_KEY);
    return res?.[STATE_KEY] ?? {};
  }

  async function writeState(patch) {
    const prev = await readState();
    const next = { ...prev, ...patch };
    try { chrome.storage.local.set({ [STATE_KEY]: next }); } catch {  }
    return next;
  }

  async function fetchLatest() {
    const r = await fetch(MANIFEST_URL, { cache: 'no-cache', credentials: 'omit' });
    if (!r.ok) { throw new Error(`HTTP ${r.status}`); }
    const m = await r.json();
    return m && m.version ? String(m.version) : null;
  }

  async function check(force) {
    const state = await readState();
    const fresh = state.lastCheck && (Date.now() - state.lastCheck) < CHECK_EVERY;
    if (fresh && !force) {
      return { latest: state.latest || null, current: currentVersion(), cached: true };
    }
    try {
      const latest = await fetchLatest();
      await writeState({ lastCheck: Date.now(), latest, error: null });
      return { latest, current: currentVersion(), cached: false };
    } catch (err) {
      const message = String(err.message || err);
      await writeState({ lastCheck: Date.now(), error: message });
      return { latest: state.latest || null, current: currentVersion(), error: message };
    }
  }

  async function pending() {
    const [info, state] = await Promise.all([check(false), readState()]);
    if (!info.latest) { return null; }
    if (compare(info.latest, info.current) <= 0) { return null; }
    if (state.dismissed === info.latest) { return null; }
    return { latest: info.latest, current: info.current };
  }

  function dismiss(version) {
    return writeState({ dismissed: version });
  }

  global.UpdateCheck = {
    REPO_URL,
    MANIFEST_URL,
    currentVersion,
    compare,
    check,
    pending,
    dismiss
  };
})(typeof window !== 'undefined' ? window : globalThis);
