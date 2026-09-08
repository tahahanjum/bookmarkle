(() => {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);

  const BATCH = 24;
  const ALL = '__all__';

  const state = {
    data: null,
    categories: [],
    category: ALL,
    theme: 'both',
    sort: 'recent',
    query: '',
    visible: BATCH,
    filtered: [],
    viewerIndex: -1
  };

  let observer = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, isErr) {
    const host = $('#g-toasts');
    const el = document.createElement('div');
    el.className = `g-toast${isErr ? ' err' : ''}`;
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); }, 320);
    }, 2600);
  }

  function categoryLabel(id) {
    for (let i = 0; i < state.categories.length; i++) {
      if (state.categories[i].id === id) { return state.categories[i].label; }
    }
    return id === 'bundled' ? 'Bundled' : id;
  }

  function applyFilters() {
    const items = state.data ? state.data.all : [];
    const q = state.query.trim().toLowerCase();

    state.filtered = items.filter(w => {
      if (state.theme === 'dark' && w.isLight) { return false; }
      if (state.theme === 'light' && !w.isLight) { return false; }
      if (state.category !== ALL && w.categoryId !== state.category) { return false; }
      if (q) {
        const hay = (`${w.name} ${(w.tags || []).join(' ')}`).toLowerCase();
        if (!hay.includes(q)) { return false; }
      }
      return true;
    });

    const s = state.sort;
    state.filtered = state.filtered.toSorted((a, b) => {
      if (s === 'popular') { return (b.downloads || 0) - (a.downloads || 0); }
      const at = a.updatedAt || '';
      const bt = b.updatedAt || '';
      return s === 'old' ? (at < bt ? -1 : at > bt ? 1 : 0) : (bt < at ? -1 : bt > at ? 1 : 0);
    });

    state.visible = Math.min(BATCH, state.filtered.length);
  }

  function renderChips() {
    const host = $('#g-chips');
    const cats = [{ id: ALL, label: 'All' }].concat(state.categories);
    host.innerHTML = '';
    cats.forEach(c => {
      const b = document.createElement('button');
      b.className = `g-chip${state.category === c.id ? ' active' : ''}`;
      b.textContent = c.label;
      b.addEventListener('click', () => {
        state.category = c.id;
        applyFilters();
        renderChips();
        renderGrid();
      });
      host.appendChild(b);
    });
  }

  function isSaved(w) {
    const pool = (Store.state && Store.state.wallpapers.user) || [];
    return pool.some(x => x.sourceId === w.id);
  }

  function card(w, index) {
    const el = document.createElement('article');
    el.className = 'g-card';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = w.name;
    img.src = w.thumb || w.src;
    img.addEventListener('error', () => {
      el.style.display = 'none';
    });
    el.appendChild(img);

    const ov = document.createElement('div');
    ov.className = 'g-overlay';
    ov.innerHTML =
      `<div class="g-card-name">${esc(w.name)}</div><div class="g-card-actions"><button class="g-btn g-btn-primary${isSaved(w) ? ' added' : ''}" data-add>${isSaved(w) ? 'Added' : 'Add to BookMarkle'}</button><button class="g-icon-btn" data-open title="Preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5.4A1.6 1.6 0 0116.4 21H4.6A1.6 1.6 0 013 19.4V7.6A1.6 1.6 0 014.6 6H10"/></svg></button></div>`;
    el.appendChild(ov);

    ov.querySelector('[data-add]').addEventListener('click', function (e) {
      e.stopPropagation();
      addWallpaper(w, this);
    });
    ov.querySelector('[data-open]').addEventListener('click', e => {
      e.stopPropagation();
      openViewer(index);
    });
    el.addEventListener('click', () => { openViewer(index); });

    return el;
  }

  function renderGrid() {
    const host = $('#g-grid');
    host.innerHTML = '';

    if (!state.filtered.length) {
      $('#g-status').textContent = state.data
        ? 'No wallpapers match those filters.'
        : 'Loading wallpapers...';
      return;
    }

    const slice = state.filtered.slice(0, state.visible);
    slice.forEach((w, i) => { host.appendChild(card(w, i)); });

    $('#g-status').textContent = `Showing ${slice.length} of ${state.filtered.length} wallpapers`;
    observeSentinel();
  }

  function appendMore() {
    if (state.visible >= state.filtered.length) { return; }
    const from = state.visible;
    state.visible = Math.min(state.visible + BATCH, state.filtered.length);
    const host = $('#g-grid');
    for (let i = from; i < state.visible; i++) {
      host.appendChild(card(state.filtered[i], i));
    }
    $('#g-status').textContent = `Showing ${state.visible} of ${state.filtered.length} wallpapers`;
  }

  function observeSentinel() {
    if (observer) { observer.disconnect(); }
    observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { appendMore(); }
    }, { rootMargin: '0px 0px 500px 0px' });
    observer.observe($('#g-sentinel'));
  }

  function loadImage(src) {
    const { promise, resolve, reject } = Promise.withResolvers();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      const plain = new Image();
      plain.onload = () => resolve(plain);
      plain.onerror = () => reject(new Error('image load failed'));
      plain.src = src;
    };
    img.src = src;
    return promise;
  }

  function addWallpaper(w, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

    loadImage(w.src)
      .then(img => {
        const pal = ColorUtil.fromImage(img);

        const accent = ColorUtil.normaliseAccent(
          (w.style && w.style.primary) || pal.accent,
          w.isLight
        );
        const entry = Store.addUserWallpaper({
          sourceId: w.id,
          name: w.name,
          src: w.src,
          source: 'lumilist',
          isLight: w.isLight,
          style: {
            primary: accent,
            board: (w.style && w.style.board) || (w.isLight ? '#EFF0F1' : '#14161C'),
            opacity: (w.style && typeof w.style.opacity === 'number')
              ? w.style.opacity
              : (w.isLight ? 0.35 : 0.5),
            blur: (w.style && typeof w.style.blur === 'number') ? w.style.blur : 16
          }
        });
        Store.setTheme(w.isLight ? 'light' : 'dark');
        Store.applyWallpaperToTheme(entry, w.isLight ? 'light' : 'dark');

        if (btn) { btn.disabled = false; btn.textContent = 'Added'; btn.classList.add('added'); }
        toast(`"${w.name}" added and applied`);
      })
      .catch(() => {
        if (btn) { btn.disabled = false; btn.textContent = 'Add to BookMarkle'; }
        toast('Could not load that wallpaper', true);
      });
  }

  function download(w) {
    const a = document.createElement('a');
    a.href = w.src;
    a.download = `${String(w.name || 'wallpaper').replace(/\s+/g, '-').toLowerCase()}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  }

  function openViewer(index) {
    state.viewerIndex = index;
    $('#g-viewer').hidden = false;
    document.body.style.overflow = 'hidden';
    paintViewer();
  }

  function closeViewer() {
    $('#g-viewer').hidden = true;
    document.body.style.overflow = '';
    state.viewerIndex = -1;
  }

  function step(delta) {
    if (!state.filtered.length) { return; }
    const n = state.filtered.length;
    state.viewerIndex = (state.viewerIndex + delta + n) % n;
    if (state.viewerIndex >= state.visible) { appendMore(); }
    paintViewer();
  }

  function paintViewer() {
    const w = state.filtered[state.viewerIndex];
    if (!w) { return; }
    $('#g-viewer-img').src = w.src;
    $('#g-viewer-img').alt = w.name;
    $('#g-viewer-title').textContent = w.name;
    $('#g-viewer-sub').textContent =
      `${categoryLabel(w.categoryId)} · ${w.isLight ? 'Light' : 'Dark'} wallpaper · ${state.viewerIndex + 1} of ${state.filtered.length}`;

    const add = $('#g-viewer-add');
    const saved = isSaved(w);
    add.textContent = saved ? 'Added' : 'Add to BookMarkle';
    add.classList.toggle('added', saved);
  }

  function bind() {
    $('#g-theme').addEventListener('click', function (e) {
      const b = e.target.closest('[data-theme]');
      if (!b) { return; }
      state.theme = b.dataset.theme;
      Array.prototype.forEach.call(this.children, c => {
        c.classList.toggle('active', c === b);
      });
      applyFilters();
      renderGrid();
    });

    let searchTimer = null;
    $('#g-search').addEventListener('input', function () {
      const v = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = v;
        applyFilters();
        renderGrid();
      }, 160);
    });

    $('#g-sort').addEventListener('change', function () {
      state.sort = this.value;
      applyFilters();
      renderGrid();
    });

    $('#g-close').addEventListener('click', closeViewer);
    $('#g-prev').addEventListener('click', () => { step(-1); });
    $('#g-next').addEventListener('click', () => { step(1); });
    $('#g-viewer').addEventListener('click', function (e) {
      if (e.target === this) { closeViewer(); }
    });
    $('#g-viewer-add').addEventListener('click', function () {
      const w = state.filtered[state.viewerIndex];
      if (w) { addWallpaper(w, this); }
    });
    $('#g-viewer-download').addEventListener('click', () => {
      const w = state.filtered[state.viewerIndex];
      if (w) { download(w); }
    });

    document.addEventListener('keydown', e => {
      if ($('#g-viewer').hidden) { return; }
      if (e.key === 'Escape') { closeViewer(); }
      if (e.key === 'ArrowLeft') { step(-1); }
      if (e.key === 'ArrowRight') { step(1); }
    });

    $('#g-back').addEventListener('click', e => {
      e.preventDefault();
      if (chrome.tabs && chrome.tabs.update) {
        chrome.tabs.update({ url: chrome.runtime.getURL('newtab.html') });
      } else {
        location.href = 'newtab.html';
      }
    });
  }

  (async () => {
    try {
      await Store.load();
      const data = await Catalog.loadAll();
      state.data = data;
      state.categories = data.categories.slice();
      if (data.builtin.length) {
        state.categories.push({ id: 'bundled', label: 'Bundled' });
      }
      applyFilters();
      renderChips();
      renderGrid();
      if (data.error) {
        toast('Gallery could not be reached - showing bundled wallpapers only', true);
      }
    } catch (err) {
      $('#g-status').textContent = `Could not load the wallpaper catalog. ${err?.message || ''}`;
    }
  })();

  bind();
})();
