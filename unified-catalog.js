/* AnimRu — единый каталог AniLibria + Kodik.
   Карточки обоих источников живут в одной сетке, а переключатель источника
   позволяет показать всё, только AniLibria или только Kodik. */
(function () {
  'use strict';

  var STORAGE = 'animru:catalog-source';
  var mode = readMode();
  var cacheKey = '';
  var kodikItems = [];
  var loading = false;
  var scheduled = false;

  var CSS = [
    '.uc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:10px 12px;' +
      'border:1px solid var(--line);border-radius:14px;background:var(--surface)}',
    '.uc-label{font-size:13px;font-weight:650;color:var(--muted)}',
    '.uc-sources{display:flex;gap:6px;padding:3px;border-radius:12px;background:var(--surface-2)}',
    '.uc-source{min-height:36px;padding:7px 12px;border:0;border-radius:9px;background:transparent;color:var(--dim);' +
      'font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;transition:background-color 150ms ease,color 150ms ease}',
    '.uc-source[aria-pressed="true"]{background:var(--surface);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.16)}',
    '.uc-source-badge{position:absolute;left:8px;bottom:8px;z-index:2;padding:3px 7px;border-radius:8px;' +
      'background:rgba(8,8,10,.78);color:#fff;font-size:10px;font-weight:700;backdrop-filter:blur(5px)}',
    '.uc-kodik .card-badge{background:rgba(8,8,10,.78);color:#fff}',
    '.uc-status{grid-column:1/-1;margin:6px 0;color:var(--dim);font-size:13px}',
    '#kodikFound{display:none!important}',
    '@media (max-width:620px){.uc-toolbar{align-items:stretch;flex-direction:column;padding:10px}.uc-sources{display:grid;grid-template-columns:repeat(3,1fr)}' +
      '.uc-source{padding-inline:7px}.uc-label{padding:0 2px}}',
    '@media (prefers-reduced-motion:reduce){.uc-source{transition:none}}'
  ].join('');

  function readMode() {
    try {
      var value = localStorage.getItem(STORAGE);
      return value === 'anilibria' || value === 'kodik' ? value : 'all';
    } catch (e) {
      return 'all';
    }
  }

  function saveMode(value) {
    mode = value;
    try { localStorage.setItem(STORAGE, value); } catch (e) {}
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[ёë]/g, 'е')
      .replace(/[^a-zа-я0-9]+/g, ' ')
      .trim();
  }

  function material(item) { return (item && item.material_data) || {}; }

  function titleOf(item) {
    var data = material(item);
    return data.anime_title || item.title || data.title || 'Без названия';
  }

  function posterOf(item) {
    var data = material(item);
    return data.anime_poster_url || data.poster_url || '';
  }

  function subOf(item) {
    var data = material(item);
    var total = item.last_episode || data.episodes_aired || data.episodes_total || '';
    return [item.year || data.year, data.anime_kind || data.kind, total ? total + ' эп.' : '']
      .filter(Boolean)
      .join(' · ');
  }

  function unique(items) {
    var seen = {};
    return (items || []).filter(function (item) {
      if (!item || !item.id) return false;
      var data = material(item);
      var key = item.shikimori_id || item.kinopoisk_id || normalize(titleOf(item)) + ':' + (item.year || data.year || '');
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function cardHtml(item) {
    var poster = posterOf(item);
    return '<a class="card uc-kodik" data-uc-source="kodik" href="#/kodik/' + encodeURIComponent(item.id) + '">' +
      '<div class="card-poster">' +
      (poster ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy" decoding="async">' : '') +
      '<span class="card-badge">Kodik</span></div>' +
      '<div class="card-body"><div class="card-title">' + escapeHtml(titleOf(item)) + '</div>' +
      '<div class="card-sub">' + escapeHtml(subOf(item)) + '</div></div></a>';
  }

  function isCatalog() {
    return /^#\/catalog(?:\?|$)/.test(location.hash || '');
  }

  function query() {
    var hash = location.hash || '';
    var at = hash.indexOf('?');
    return new URLSearchParams(at >= 0 ? hash.slice(at + 1) : '');
  }

  function requestPlan() {
    var params = query();
    var search = (params.get('q') || '').trim();
    var request = {
      limit: 50,
      types: 'anime,anime-serial',
      with_material_data: true
    };
    if (search) request.title = search;
    else {
      request.sort = 'updated_at';
      request.order = 'desc';
    }

    var from = params.get('yf') || '';
    var to = params.get('yt') || '';
    if (from && to) request.year = from + '-' + to;
    else if (from || to) request.year = from || to;

    var genres = params.get('g');
    if (genres) {
      var first = genres.split(',')[0];
      try { first = decodeURIComponent(first); } catch (e) {}
      if (first) request.anime_genres = first;
    }

    return { path: search ? '/search' : '/list', params: request };
  }

  function waitForKodik(tries) {
    if (window.AnimKodikNet && window.AnimKodikNet.request) return Promise.resolve(window.AnimKodikNet);
    if ((tries || 0) >= 50) return Promise.reject(new Error('Kodik transport unavailable'));
    return new Promise(function (resolve) { setTimeout(resolve, 120); })
      .then(function () { return waitForKodik((tries || 0) + 1); });
  }

  function loadKodik() {
    if (!isCatalog() || loading) return;
    var key = location.hash || '#/catalog';
    if (key === cacheKey && kodikItems.length) {
      scheduleRender();
      return;
    }

    loading = true;
    cacheKey = key;
    kodikItems = [];
    updateToolbar('Загружаем Kodik…');
    var plan = requestPlan();

    waitForKodik()
      .then(function (api) { return api.request(plan.path, plan.params); })
      .then(function (data) {
        if (cacheKey !== key) return;
        kodikItems = unique(data && data.results).slice(0, 30);
      })
      .catch(function () {
        if (cacheKey === key) kodikItems = [];
      })
      .then(function () {
        loading = false;
        scheduleRender();
      });
  }

  function injectCss() {
    if (document.getElementById('unified-catalog-css')) return;
    var style = document.createElement('style');
    style.id = 'unified-catalog-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function toolbarHost() {
    return document.querySelector('#view-list .catalog-main');
  }

  function ensureToolbar() {
    var host = toolbarHost();
    if (!host) return null;
    var toolbar = document.getElementById('ucToolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'ucToolbar';
      toolbar.className = 'uc-toolbar';
      toolbar.innerHTML = '<span class="uc-label">Источники каталога</span>' +
        '<div class="uc-sources" role="group" aria-label="Источник каталога">' +
        '<button class="uc-source" type="button" data-source="all">Все</button>' +
        '<button class="uc-source" type="button" data-source="anilibria">AniLibria</button>' +
        '<button class="uc-source" type="button" data-source="kodik">Kodik</button></div>';
      host.insertBefore(toolbar, host.firstChild);
      toolbar.addEventListener('click', function (event) {
        var button = event.target.closest('[data-source]');
        if (!button) return;
        saveMode(button.getAttribute('data-source'));
        render();
      });
    }
    return toolbar;
  }

  function updateToolbar(status) {
    var toolbar = ensureToolbar();
    if (!toolbar) return;
    Array.prototype.slice.call(toolbar.querySelectorAll('[data-source]')).forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-source') === mode ? 'true' : 'false');
    });
    var label = toolbar.querySelector('.uc-label');
    if (label) label.textContent = status || 'AniLibria + Kodik';
  }

  function markAnilibria(grid) {
    Array.prototype.slice.call(grid.querySelectorAll(':scope > .card:not([data-uc-source])')).forEach(function (card) {
      card.setAttribute('data-uc-source', 'anilibria');
      var poster = card.querySelector('.card-poster');
      if (poster && !poster.querySelector('.uc-source-badge')) {
        var badge = document.createElement('span');
        badge.className = 'uc-source-badge';
        badge.textContent = 'AniLibria';
        poster.appendChild(badge);
      }
    });
  }

  function appendKodik(grid) {
    if (grid.querySelector('.uc-kodik')) return;
    var aniNames = {};
    Array.prototype.slice.call(grid.querySelectorAll('[data-uc-source="anilibria"] .card-title')).forEach(function (node) {
      aniNames[normalize(node.textContent)] = true;
    });
    var html = kodikItems.filter(function (item) {
      return !aniNames[normalize(titleOf(item))];
    }).map(cardHtml).join('');
    if (html) grid.insertAdjacentHTML('beforeend', html);
  }

  function applyMode(grid) {
    Array.prototype.slice.call(grid.querySelectorAll('[data-uc-source]')).forEach(function (card) {
      var source = card.getAttribute('data-uc-source');
      card.hidden = mode !== 'all' && mode !== source;
    });
  }

  function render() {
    scheduled = false;
    if (!isCatalog()) return;
    var grid = document.getElementById('grid');
    if (!grid) return;
    ensureToolbar();
    markAnilibria(grid);
    appendKodik(grid);
    applyMode(grid);

    var aniCount = grid.querySelectorAll('[data-uc-source="anilibria"]').length;
    var kodikCount = grid.querySelectorAll('[data-uc-source="kodik"]').length;
    updateToolbar(loading ? 'Загружаем Kodik…' : 'AniLibria ' + aniCount + ' · Kodik ' + kodikCount);
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(render, 80);
  }

  function route() {
    var toolbar = document.getElementById('ucToolbar');
    if (!isCatalog()) {
      if (toolbar) toolbar.remove();
      return;
    }
    injectCss();
    cacheKey = '';
    kodikItems = [];
    ensureToolbar();
    scheduleRender();
    loadKodik();
  }

  function start() {
    injectCss();
    var separate = document.querySelector('.nav [data-tab="kodik"]');
    if (separate) separate.hidden = true;

    var observer = new MutationObserver(function () {
      if (isCatalog()) scheduleRender();
      var duplicate = document.getElementById('kodikFound');
      if (duplicate) duplicate.hidden = true;
      var link = document.querySelector('.nav [data-tab="kodik"]');
      if (link) link.hidden = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
