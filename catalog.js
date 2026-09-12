/* AnimRu: каталог Kodik в духе Anilibria — сетка постеров, фильтры, бесконечная подгрузка.
   Запросы идут только через AnimKodikNet: он сам подбирает токен и передатчик. */
(function () {
  'use strict';

  var API = 'https://kodik-api.com';
  var LIMIT = 50;
  var WANT = 24;
  var HOPS = 4;

  /* жанры Kodik на случай, если /genres не ответит */
  var FALLBACK_GENRES = [
    'боевик', 'вампиры', 'военный', 'гарем', 'детектив', 'детское', 'драма', 'игры',
    'исторический', 'комедия', 'магия', 'меха', 'мистика', 'музыка', 'пародия',
    'приключения', 'психологическое', 'романтика', 'самураи', 'сверхъестественное',
    'спорт', 'фантастика', 'фэнтези', 'хоррор', 'школа', 'экшен', 'этти'
  ];

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
      'color:#fff;font-size:11px;font-weight:600}',
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
    failed: false,
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

  /* ---------------- сеть ---------------- */

  /* ждём транспорт: kodik-net.js может ещё загружаться */
  function net(tries) {
    if (window.AnimKodikNet) return Promise.resolve(window.AnimKodikNet);
    if ((tries || 0) > 40) return Promise.resolve(null);
    return new Promise(function (done) { setTimeout(done, 150); }).then(function () {
      return net((tries || 0) + 1);
    });
  }

  function clean(params) {
    var out = {};
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value === '' || value == null || value === false) return;
      out[key] = value;
    });
    return out;
  }

  function ask(path, params) {
    return net().then(function (api) {
      if (api && api.request) return api.request(path, clean(params));
      /* транспорт не поднялся: пробуем напрямую, может сработать в приложении */
      var query = Object.keys(clean(params)).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]));
      }).join('&');
      return fetch(API + path + '?' + query, { cache: 'no-store' }).then(function (res) { return res.json(); });
    }).then(function (data) {
      if (!data || data.error) throw new Error(data && data.error ? String(data.error) : 'kodik');
      return data;
    });
  }

  /* следующая страница приходит готовой ссылкой next_page */
  function askUrl(url) {
    return fetch(url, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.error) throw new Error(data && data.error ? String(data.error) : 'kodik');
        return data;
      });
  }

  function listParams() {
    var f = state.filters;
    return {
      limit: LIMIT,
      types: f.type || 'anime,anime-serial',
      anime_genres: f.genre,
      year: f.year,
      anime_status: f.status,
      sort: f.sort,
      with_material_data: true
    };
  }

  function searchParams() {
    var f = state.filters;
    return {
      limit: LIMIT,
      title: f.title,
      types: f.type || 'anime,anime-serial',
      year: f.year,
      with_material_data: true
    };
  }

  /* Kodik даёт отдельную запись на каждую озвучку и серию — склеиваем в одну карточку */
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

  function fetchPortion() {
    if (state.loading || state.done) return Promise.resolve();
    state.loading = true;
    state.failed = false;
    render();

    var gained = 0;

    function absorbPage(data) {
      if (data.total) state.total = data.total;
      gained += absorb(data.results);
      state.next = data.next_page || null;
      if (!state.next) {
        state.done = true;
        return null;
      }
      return true;
    }

    function walk(hops) {
      return askUrl(state.next).then(function (data) {
        if (!absorbPage(data)) return null;
        if (gained >= WANT || hops >= HOPS) return null;
        return walk(hops + 1);
      });
    }

    var first = state.next
      ? askUrl(state.next)
      : ask(state.filters.title ? '/search' : '/list', state.filters.title ? searchParams() : listParams());

    return first
      .then(function (data) {
        if (!absorbPage(data)) return null;
        if (gained >= WANT) return null;
        return walk(1);
      })
      .catch(function () {
        state.failed = true;
      })
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
    state.failed = false;
    state.total = 0;
    fetchPortion();
  }

  function loadGenres() {
    if (state.genres) return Promise.resolve(state.genres);
    return ask('/genres', { genres_type: 'anime' })
      .then(function (data) {
        var list = (data.results || [])
          .map(function (row) { return typeof row === 'string' ? row : row.title || row.name; })
          .filter(Boolean)
          .sort();
        state.genres = list.length ? list : FALLBACK_GENRES;
        return state.genres;
      })
      .catch(function () {
        state.genres = FALLBACK_GENRES;
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
    var image = poster ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy" decoding="async">' : '';

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

    grid.innerHTML = state.items.map(cardHtml).join('') +
      (state.loading ? skeletons(state.items.length ? 6 : 18) : '');

    if (count) {
      count.textContent = state.items.length
        ? state.items.length + ' из ' + (state.total ? state.total.toLocaleString('ru-RU') : '—')
        : '';
    }
    if (stateLine) {
      var message = '';
      if (!state.loading && state.failed && !state.items.length) message = 'Kodik не ответил. Нажми «Повторить» — транспорт подберётся заново.';
      else if (!state.loading && !state.items.length) message = 'Ничего не нашлось — попробуй сменить фильтры.';
      stateLine.hidden = !message;
      stateLine.textContent = message;
    }
    if (more) {
      more.hidden = state.done && !state.failed;
      more.disabled = state.loading;
      more.textContent = state.loading
        ? 'Загружаем…'
        : (state.failed ? 'Повторить' : 'Показать ещё');
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
      }, 400);
    });

    [['acGenre', 'genre'], ['acYear', 'year'], ['acStatus', 'status'], ['acSort', 'sort']].forEach(function (pair) {
      var node = byId(pair[0]);
      if (!node) return;
      node.addEventListener('change', function () {
        f[pair[1]] = node.value;
        reload();
      });
    });

    byId('acMore').addEventListener('click', function () {
      if (state.failed) {
        state.failed = false;
        state.done = false;
        if (window.AnimKodikNet && window.AnimKodikNet.resolve) window.AnimKodikNet.resolve(true);
      }
      fetchPortion();
    });

    if (window.IntersectionObserver) {
      var observer = new IntersectionObserver(function (entries) {
        if (state.failed) return;
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
  }

  function pass() {
    injectCss();
    var hash = location.hash || '';
    if (!/^#\/kodik\/?$/.test(hash)) {
      state.mounted = false;
      return;
    }
    var root = byId('kbRoot');
    if (!root) return;
    if (state.mounted && byId('acGrid')) return;
    if (!root.children.length) return;
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
