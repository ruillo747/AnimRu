/* AnimRu: каталог Kodik в духе Anilibria — плотная сетка постеров, фильтры,
   бесконечная подгрузка по ссылке next_page и склейка дубликатов одного тайтла.
   Модуль забирает себе только список; страницу тайтла и плеер по-прежнему рисует kodik-browse.js. */
(function () {
  'use strict';

  var API = 'https://kodik-api.com';
  var LIMIT = 100;
  var WANT = 28;

  var CSS = [
    '.ac-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}',
    '.ac-head h1{margin:0;font-size:26px;letter-spacing:-0.01em}',
    '.ac-count{font-size:13px;color:var(--muted)}',
    '.ac-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}',
    '.ac-search{flex:1 1 220px;min-width:0;padding:9px 12px;border:1px solid var(--line);border-radius:10px;' +
      'background:var(--surface-2);color:var(--text);font:inherit;font-size:14px}',
    '.ac-search:focus{outline:none;border-color:var(--accent)}',
    '.ac-sel{padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);' +
      'color:var(--text);font:inherit;font-size:13px;max-width:100%}',
    '.ac-sel:focus{outline:none;border-color:var(--accent)}',
    '.ac-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}',
    '.ac-chip{padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--surface-2);' +
      'color:var(--muted);font:inherit;font-size:13px;cursor:pointer;transition:color var(--t-fast,120ms) ease,' +
      'border-color var(--t-fast,120ms) ease}',
    '.ac-chip:hover{color:var(--text);border-color:var(--accent)}',
    '.ac-chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#0a0a0b;font-weight:600}',
    '.ac-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(156px,1fr));gap:14px}',
    '.ac-card{display:block;color:inherit;text-decoration:none}',
    '.ac-poster{position:relative;aspect-ratio:2/3;border-radius:12px;overflow:hidden;background:var(--surface-2);' +
      'border:1px solid var(--line);transition:border-color var(--t-fast,120ms) ease,transform var(--t,180ms) ease}',
    '.ac-card:hover .ac-poster{border-color:var(--accent);transform:translateY(-3px)}',
    '.ac-poster img{width:100%;height:100%;object-fit:cover;display:block}',
    '.ac-badge{position:absolute;left:7px;top:7px;padding:3px 7px;border-radius:7px;background:rgba(10,10,11,0.82);' +
      'color:#fff;font-size:11px;font-weight:600;letter-spacing:0.01em}',
    '.ac-ep{position:absolute;right:7px;bottom:7px;padding:3px 7px;border-radius:7px;background:var(--accent);' +
      'color:#0a0a0b;font-size:11px;font-weight:700}',
    '.ac-name{margin:8px 2px 0;font-size:13px;line-height:1.32;display:-webkit-box;-webkit-line-clamp:2;' +
      '-webkit-box-orient:vertical;overflow:hidden}',
    '.ac-meta{margin:3px 2px 0;font-size:12px;color:var(--muted)}',
    '.ac-skel{aspect-ratio:2/3;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);' +
      'animation:animru-skeleton 1.1s ease-in-out infinite}',
    '.ac-state{margin:18px 2px;font-size:14px;color:var(--muted)}',
    '.ac-more{display:block;width:100%;margin:18px 0 4px;padding:11px 16px;border:1px solid var(--line);' +
      'border-radius:10px;background:var(--surface-2);color:var(--text);font:inherit;font-size:14px;cursor:pointer}',
    '.ac-more:hover{border-color:var(--accent)}',
    '.ac-more[disabled]{opacity:0.6;cursor:default}',
    '@media (max-width:760px){' +
      '.ac-grid{grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px}' +
      '.ac-head h1{font-size:21px}' +
      '.ac-bar{gap:6px}' +
      '.ac-sel{flex:1 1 46%}' +
      '.ac-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:4px}' +
      '.ac-chips::-webkit-scrollbar{display:none}' +
      '.ac-chip{flex:0 0 auto}' +
    '}'
  ].join('');

  var TYPES = [
    { id: '', label: 'Всё' },
    { id: 'anime-serial', label: 'Сериалы' },
    { id: 'anime', label: 'Фильмы' }
  ];

  var STATUS = [
    { id: '', label: 'Любой статус' },
    { id: 'ongoing', label: 'Онгоинг' },
    { id: 'released', label: 'Вышло' },
    { id: 'anons', label: 'Анонс' }
  ];

  var SORTS = [
    { id: 'updated_at', label: 'По обновлению' },
    { id: 'created_at', label: 'По добавлению' },
    { id: 'year', label: 'По году' },
    { id: 'shikimori_rating', label: 'По оценке' }
  ];

  var state = {
    filters: { title: '', type: '', genre: '', year: '', status: '', sort: 'updated_at' },
    items: [],
    seen: {},
    next: null,
    total: 0,
    loading: false,
    done: false,
    genres: null,
    mounted: false
  };

  function byId(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function injectCss() {
    if (byId('catalog-css')) return;
    var style = document.createElement('style');
    style.id = 'catalog-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ---------------- данные ---------------- */

  function apiUrl(path, params) {
    var url = API + path + '?';
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === '' || value == null || value === false) return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    });
    return url + parts.join('&');
  }

  /* запросы идут через kodik-net.js: он подставляет рабочий токен и передатчик */
  function load(url) {
    return fetch(url, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.error) throw new Error(data && data.error ? String(data.error) : 'kodik');
        return data;
      });
  }

  function listUrl() {
    var f = state.filters;
    return apiUrl('/list', {
      limit: LIMIT,
      types: f.type || 'anime,anime-serial',
      anime_genres: f.genre,
      year: f.year,
      anime_status: f.status,
      sort: f.sort,
      order: 'desc',
      with_material_data: true
    });
  }

  function searchUrl() {
    var f = state.filters;
    return apiUrl('/search', {
      limit: LIMIT,
      title: f.title,
      types: f.type || 'anime,anime-serial',
      year: f.year,
      with_material_data: true
    });
  }

  /* Kodik отдаёт по записи на каждую озвучку и серию, поэтому одну и ту же работу
     склеиваем по shikimori_id (а если его нет — по названию с годом). */
  function keyOf(item) {
    var material = item.material_data || {};
    if (item.shikimori_id) return 'sh:' + item.shikimori_id;
    if (item.kinopoisk_id) return 'kp:' + item.kinopoisk_id;
    var name = (material.anime_title || item.title || '').toLowerCase().trim();
    return 'nm:' + name + ':' + (item.year || material.year || '');
  }

  function absorb(results) {
    var added = 0;
    (results || []).forEach(function (item) {
      if (!item || !item.id) return;
      var key = keyOf(item);
      if (state.seen[key]) return;
      state.seen[key] = true;
      state.items.push(item);
      added += 1;
    });
    return added;
  }

  /* одна страница Kodik после склейки даёт мало карточек, поэтому идём по next_page,
     пока не наберём порцию или не закончится список */
  function fetchPortion() {
    if (state.loading || state.done) return Promise.resolve();
    state.loading = true;
    render();

    var gained = 0;

    function step(url, hops) {
      return load(url).then(function (data) {
        if (data.total) state.total = data.total;
        gained += absorb(data.results);
        state.next = data.next_page || null;
        if (!state.next) {
          state.done = true;
          return null;
        }
        if (gained >= WANT || hops >= 6) return null;
        return step(state.next, hops + 1);
      });
    }

    var start = state.next || (state.filters.title ? searchUrl() : listUrl());
    return step(start, 0)
      .catch(function () { state.done = true; })
      .then(function () {
        state.loading = false;
        render();
      });
  }

  function reload() {
    state.items = [];
    state.seen = {};
    state.next = null;
    state.done = false;
    state.total = 0;
    fetchPortion();
  }

  function loadGenres() {
    if (state.genres) return Promise.resolve(state.genres);
    return load(apiUrl('/genres', { genres_type: 'anime' }))
      .then(function (data) {
        state.genres = (data.results || [])
          .map(function (row) { return typeof row === 'string' ? row : row.title || row.name; })
          .filter(Boolean)
          .sort();
        return state.genres;
      })
      .catch(function () {
        state.genres = [];
        return state.genres;
      });
  }

  /* ---------------- разметка ---------------- */

  function cardHtml(item) {
    var material = item.material_data || {};
    var name = material.anime_title || material.title || item.title || 'Без названия';
    var year = item.year || material.year || '';
    var poster = material.anime_poster_url || material.poster_url || '';
    var kind = item.type === 'anime' ? 'Фильм' : 'Сериал';
    var episodes = item.last_episode || material.episodes_aired || material.episodes_total || 0;
    var rating = material.shikimori_rating || material.kinopoisk_rating || 0;

    var image = poster
      ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy" decoding="async">'
      : '';

    return '<a class="ac-card" href="#/kodik/' + encodeURIComponent(item.id) + '">' +
      '<div class="ac-poster">' + image +
      '<span class="ac-badge">' + escapeHtml(kind) + '</span>' +
      (episodes ? '<span class="ac-ep">' + escapeHtml(episodes) + ' эп.</span>' : '') +
      '</div>' +
      '<p class="ac-name">' + escapeHtml(name) + '</p>' +
      '<p class="ac-meta">' + escapeHtml(year || '—') +
      (rating ? ' · ' + escapeHtml(Number(rating).toFixed(1)) : '') + '</p>' +
      '</a>';
  }

  function skeletons(count) {
    var out = '';
    for (var i = 0; i < count; i += 1) out += '<div class="ac-skel"></div>';
    return out;
  }

  function yearOptions(selected) {
    var now = new Date().getFullYear();
    var out = '<option value="">Любой год</option>';
    for (var year = now; year >= 1980; year -= 1) {
      out += '<option value="' + year + '"' + (String(selected) === String(year) ? ' selected' : '') + '>' + year + '</option>';
    }
    return out;
  }

  function options(list, selected) {
    return list.map(function (row) {
      return '<option value="' + escapeHtml(row.id) + '"' + (row.id === selected ? ' selected' : '') + '>' +
        escapeHtml(row.label) + '</option>';
    }).join('');
  }

  function render() {
    var grid = byId('acGrid');
    if (!grid) return;
    var more = byId('acMore');
    var stateLine = byId('acState');
    var count = byId('acCount');

    grid.innerHTML = state.items.map(cardHtml).join('') + (state.loading ? skeletons(state.items.length ? 6 : 18) : '');

    if (count) {
      count.textContent = state.items.length
        ? state.items.length + ' из ' + (state.total ? state.total.toLocaleString('ru-RU') : '—')
        : '';
    }
    if (stateLine) {
      var empty = !state.items.length && !state.loading;
      stateLine.hidden = !empty;
      stateLine.textContent = empty ? 'Ничего не нашлось — попробуй сменить фильтры.' : '';
    }
    if (more) {
      more.hidden = state.done || !state.items.length;
      more.disabled = state.loading;
      more.textContent = state.loading ? 'Загружаем…' : 'Показать ещё';
    }
  }

  function mount(root) {
    var f = state.filters;

    root.innerHTML =
      '<div class="ac-head"><h1>Каталог Kodik</h1><span class="ac-count" id="acCount"></span></div>' +
      '<div class="ac-chips" id="acChips">' +
      TYPES.map(function (row) {
        return '<button type="button" class="ac-chip" data-type="' + escapeHtml(row.id) + '" aria-pressed="' +
          (row.id === f.type ? 'true' : 'false') + '">' + escapeHtml(row.label) + '</button>';
      }).join('') +
      '</div>' +
      '<div class="ac-bar">' +
      '<input class="ac-search" id="acSearch" type="search" placeholder="Поиск по названию" autocomplete="off" value="' +
      escapeHtml(f.title) + '">' +
      '<select class="ac-sel" id="acGenre"><option value="">Любой жанр</option></select>' +
      '<select class="ac-sel" id="acYear">' + yearOptions(f.year) + '</select>' +
      '<select class="ac-sel" id="acStatus">' + options(STATUS, f.status) + '</select>' +
      '<select class="ac-sel" id="acSort">' + options(SORTS, f.sort) + '</select>' +
      '</div>' +
      '<div class="ac-grid" id="acGrid"></div>' +
      '<p class="ac-state" id="acState" hidden></p>' +
      '<button type="button" class="ac-more" id="acMore" hidden>Показать ещё</button>' +
      '<div id="acSentinel" aria-hidden="true"></div>';

    byId('acChips').addEventListener('click', function (event) {
      var chip = event.target.closest('.ac-chip');
      if (!chip) return;
      f.type = chip.dataset.type || '';
      Array.prototype.slice.call(root.querySelectorAll('.ac-chip')).forEach(function (node) {
        node.setAttribute('aria-pressed', node === chip ? 'true' : 'false');
      });
      reload();
    });

    var search = byId('acSearch');
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        f.title = search.value.trim();
        reload();
      }, 350);
    });

    [['acGenre', 'genre'], ['acYear', 'year'], ['acStatus', 'status'], ['acSort', 'sort']].forEach(function (pair) {
      var node = byId(pair[0]);
      if (!node) return;
      node.addEventListener('change', function () {
        f[pair[1]] = node.value;
        reload();
      });
    });

    byId('acMore').addEventListener('click', function () { fetchPortion(); });

    /* бесконечная подгрузка, как в каталоге Anilibria */
    if (window.IntersectionObserver) {
      var observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) fetchPortion();
      }, { rootMargin: '600px 0px' });
      observer.observe(byId('acSentinel'));
    }

    loadGenres().then(function (list) {
      var select = byId('acGenre');
      if (!select) return;
      select.innerHTML = '<option value="">Любой жанр</option>' +
        list.map(function (genre) {
          return '<option value="' + escapeHtml(genre) + '"' + (genre === f.genre ? ' selected' : '') + '>' +
            escapeHtml(genre) + '</option>';
        }).join('');
    });

    render();
    if (!state.items.length) fetchPortion();
    else render();
  }

  /* Забираем список себе: пока в корне лежит сетка kodik-browse, подменяем её разметку.
     Старый код после этого не находит свой #kbGrid и тихо уходит в сторону. */
  function pass() {
    injectCss();
    var hash = location.hash || '';
    var onCatalog = /^#\/kodik\/?$/.test(hash);
    if (!onCatalog) {
      state.mounted = false;
      return;
    }
    var root = byId('kbRoot');
    if (!root) return;
    if (byId('acGrid') && state.mounted) return;
    if (!byId('kbGrid') && !byId('acGrid') && !root.children.length) return;
    state.mounted = true;
    mount(root);
  }

  function start() {
    pass();
    window.addEventListener('hashchange', function () {
      state.mounted = false;
      setTimeout(pass, 120);
      setTimeout(pass, 600);
    });
    var observer = new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(pass, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(pass, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.AnimCatalog = { reload: reload, state: function () { return state; } };
})();
