(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };

  var BATCH = 24;
  var ALL = '__all__';

  var state = {
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

  var observer = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, isErr) {
    var host = $('#g-toasts');
    var el = document.createElement('div');
    el.className = 'g-toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, 2600);
  }

  function categoryLabel(id) {
    for (var i = 0; i < state.categories.length; i++) {
      if (state.categories[i].id === id) { return state.categories[i].label; }
    }
    return id === 'bundled' ? 'Bundled' : id;
  }

  function applyFilters() {
    var items = state.data ? state.data.all : [];
    var q = state.query.trim().toLowerCase();

    state.filtered = items.filter(function (w) {
      if (state.theme === 'dark' && w.isLight) { return false; }
      if (state.theme === 'light' && !w.isLight) { return false; }
      if (state.category !== ALL && w.categoryId !== state.category) { return false; }
      if (q) {
        var hay = (w.name + ' ' + (w.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) { return false; }
      }
      return true;
    });

    var s = state.sort;
    state.filtered.sort(function (a, b) {
      if (s === 'popular') { return (b.downloads || 0) - (a.downloads || 0); }
      var at = a.updatedAt || '', bt = b.updatedAt || '';
      return s === 'old' ? (at < bt ? -1 : at > bt ? 1 : 0) : (bt < at ? -1 : bt > at ? 1 : 0);
    });

    state.visible = Math.min(BATCH, state.filtered.length);
  }

  function renderChips() {
    var host = $('#g-chips');
    var cats = [{ id: ALL, label: 'All' }].concat(state.categories);
    host.innerHTML = '';
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'g-chip' + (state.category === c.id ? ' active' : '');
      b.textContent = c.label;
      b.addEventListener('click', function () {
        state.category = c.id;
        applyFilters();
        renderChips();
        renderGrid();
      });
      host.appendChild(b);
    });
  }

  function isSaved(w) {
    var pool = (Store.state && Store.state.wallpapers.user) || [];
    return pool.some(function (x) { return x.sourceId === w.id; });
  }

  function card(w, index) {
    var el = document.createElement('article');
    el.className = 'g-card';

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = w.name;
    img.src = w.thumb || w.src;
    img.addEventListener('error', function () {
      el.style.display = 'none';
    });
    el.appendChild(img);

    var ov = document.createElement('div');
    ov.className = 'g-overlay';
    ov.innerHTML =
      '<div class="g-card-name">' + esc(w.name) + '</div>' +
      '<div class="g-card-actions">' +
      '<button class="g-btn g-btn-primary' + (isSaved(w) ? ' added' : '') + '" data-add>' +
      (isSaved(w) ? 'Added' : 'Add to BookMarkle') + '</button>' +
      '<button class="g-icon-btn" data-open title="Preview">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5.4A1.6 1.6 0 0116.4 21H4.6A1.6 1.6 0 013 19.4V7.6A1.6 1.6 0 014.6 6H10"/></svg>' +
      '</button></div>';
    el.appendChild(ov);

    ov.querySelector('[data-add]').addEventListener('click', function (e) {
      e.stopPropagation();
      addWallpaper(w, this);
    });
    ov.querySelector('[data-open]').addEventListener('click', function (e) {
      e.stopPropagation();
      openViewer(index);
    });
    el.addEventListener('click', function () { openViewer(index); });

    return el;
  }

  function renderGrid() {
    var host = $('#g-grid');
    host.innerHTML = '';

    if (!state.filtered.length) {
      $('#g-status').textContent = state.data
        ? 'No wallpapers match those filters.'
        : 'Loading wallpapers...';
      return;
    }

    var slice = state.filtered.slice(0, state.visible);
    slice.forEach(function (w, i) { host.appendChild(card(w, i)); });

    $('#g-status').textContent = 'Showing ' + slice.length + ' of ' + state.filtered.length + ' wallpapers';
    observeSentinel();
  }

  function appendMore() {
    if (state.visible >= state.filtered.length) { return; }
    var from = state.visible;
    state.visible = Math.min(state.visible + BATCH, state.filtered.length);
    var host = $('#g-grid');
    for (var i = from; i < state.visible; i++) {
      host.appendChild(card(state.filtered[i], i));
    }
    $('#g-status').textContent = 'Showing ' + state.visible + ' of ' + state.filtered.length + ' wallpapers';
  }

  function observeSentinel() {
    if (observer) { observer.disconnect(); }
    observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { appendMore(); }
    }, { rootMargin: '0px 0px 500px 0px' });
    observer.observe($('#g-sentinel'));
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        var plain = new Image();
        plain.onload = function () { resolve(plain); };
        plain.onerror = function () { reject(new Error('image load failed')); };
        plain.src = src;
      };
      img.src = src;
    });
  }

  function addWallpaper(w, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

    loadImage(w.src)
      .then(function (img) {
        var pal = ColorUtil.fromImage(img);

        var accent = ColorUtil.normaliseAccent(
          (w.style && w.style.primary) || pal.accent,
          w.isLight
        );
        var entry = Store.addUserWallpaper({
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
        toast('"' + w.name + '" added and applied');
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Add to BookMarkle'; }
        toast('Could not load that wallpaper', true);
      });
  }

  function download(w) {
    var a = document.createElement('a');
    a.href = w.src;
    a.download = String(w.name || 'wallpaper').replace(/\s+/g, '-').toLowerCase() + '.jpg';
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
    var n = state.filtered.length;
    state.viewerIndex = (state.viewerIndex + delta + n) % n;
    if (state.viewerIndex >= state.visible) { appendMore(); }
    paintViewer();
  }

  function paintViewer() {
    var w = state.filtered[state.viewerIndex];
    if (!w) { return; }
    $('#g-viewer-img').src = w.src;
    $('#g-viewer-img').alt = w.name;
    $('#g-viewer-title').textContent = w.name;
    $('#g-viewer-sub').textContent =
      categoryLabel(w.categoryId) + ' · ' +
      (w.isLight ? 'Light' : 'Dark') + ' wallpaper · ' +
      (state.viewerIndex + 1) + ' of ' + state.filtered.length;

    var add = $('#g-viewer-add');
    var saved = isSaved(w);
    add.textContent = saved ? 'Added' : 'Add to BookMarkle';
    add.classList.toggle('added', saved);
  }

  function bind() {
    $('#g-theme').addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme]');
      if (!b) { return; }
      state.theme = b.dataset.theme;
      Array.prototype.forEach.call(this.children, function (c) {
        c.classList.toggle('active', c === b);
      });
      applyFilters();
      renderGrid();
    });

    var searchTimer = null;
    $('#g-search').addEventListener('input', function () {
      var v = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
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
    $('#g-prev').addEventListener('click', function () { step(-1); });
    $('#g-next').addEventListener('click', function () { step(1); });
    $('#g-viewer').addEventListener('click', function (e) {
      if (e.target === this) { closeViewer(); }
    });
    $('#g-viewer-add').addEventListener('click', function () {
      var w = state.filtered[state.viewerIndex];
      if (w) { addWallpaper(w, this); }
    });
    $('#g-viewer-download').addEventListener('click', function () {
      var w = state.filtered[state.viewerIndex];
      if (w) { download(w); }
    });

    document.addEventListener('keydown', function (e) {
      if ($('#g-viewer').hidden) { return; }
      if (e.key === 'Escape') { closeViewer(); }
      if (e.key === 'ArrowLeft') { step(-1); }
      if (e.key === 'ArrowRight') { step(1); }
    });

    $('#g-back').addEventListener('click', function (e) {
      e.preventDefault();
      if (chrome.tabs && chrome.tabs.update) {
        chrome.tabs.update({ url: chrome.runtime.getURL('newtab.html') });
      } else {
        location.href = 'newtab.html';
      }
    });
  }

  Store.load()
    .then(function () { return Catalog.loadAll(); })
    .then(function (data) {
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
    })
    .catch(function (err) {
      $('#g-status').textContent = 'Could not load the wallpaper catalog. ' + (err && err.message || '');
    });

  bind();
})();
