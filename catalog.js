/* AnimRu: каталог (Кодик) — верстка в стиле каталога Анилибрии: боковая панель фильтров,
   сетка постеров с оценкой, чипсы активных фильтров, бесконечная подгрузка.
   Запросы идут только через AnimKodikNet: он сам подбирает токен и передатчик. */
(function () {
  'use strict';

  var API = 'https://kodik-api.com';
  var LIMIT = 50;
  var WANT = 24;
  var HOPS = 4;
  var LS = 'animru:catalog';
  var PAGE_TITLE = 'Каталог (Кодик)';

  /* Аниме-жанры из документации Kodik: идут в anime_genres и чувствительны к регистру.
     Обычные жанры («драма», «боевик» и т.д., с маленькой буквы) идут в genres. */
  var ANIME_GENRES = [
    'Боевые искусства', 'Вампиры', 'Военное', 'Гарем', 'Демоны', 'Детектив',
    'Детское', 'Драма', 'Игры', 'Исторический', 'Комедия', 'Магия', 'Меха',
    'Мистика', 'Музыка', 'Пародия', 'Повседневность', 'Приключения',
    'Психологическое', 'Романтика', 'Самураи', 'Сверхъестественное', 'Сейнен',
    'Сёдзё', 'Сёнен', 'Спорт', 'Триллер', 'Ужасы', 'Фантастика', 'Фэнтези',
    'Школа', 'Экшен', 'Этти'
  ];

  var CSS = [
    /* шапка страницы */
    '.ac-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 18px}',
    '.ac-top h1{margin:0;font-size:28px;line-height:1.15;letter-spacing:-0.02em}',
    '.ac-count{font-size:13px;color:var(--dim,var(--muted))}',
    '.ac-top-right{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.ac-search{width:260px;max-width:100%;padding:10px 14px;border:1px solid var(--line);border-radius:999px;' +
      'background:var(--surface-2);color:var(--text);font:inherit;font-size:14px}',
    '.ac-search:focus{outline:none;border-color:var(--accent)}',
    '.ac-filters-btn{display:none;padding:10px 16px;border:1px solid var(--line);border-radius:999px;' +
      'background:var(--surface-2);color:var(--text);font:inherit;font-size:14px;cursor:pointer}',

    /* двухколоночная раскладка как в Анилибрии */
    '.ac-layout{display:grid;grid-template-columns:268px minmax(0,1fr);gap:26px;align-items:start}',
    '.ac-side{position:sticky;top:calc(var(--header-h,64px) + 16px);display:grid;gap:16px;padding:18px;' +
      'border:1px solid var(--line);border-radius:16px;background:var(--surface);max-height:calc(100vh - var(--header-h,64px) - 40px);' +
      'overflow:auto;scrollbar-width:thin}',
    '.ac-group{display:grid;gap:7px}',
    '.ac-label{font-size:11.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--dim,var(--muted))}',
    '.ac-sel,.ac-text{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;' +
      'background:var(--surface-2);color:var(--text);font:inherit;font-size:13.5px}',
    '.ac-sel:focus,.ac-text:focus{outline:none;border-color:var(--accent)}',
    '.ac-types{display:flex;gap:6px;flex-wrap:wrap}',
    '.ac-type{flex:1 1 auto;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);' +
      'color:var(--muted);font:inherit;font-size:13px;cursor:pointer;transition:all var(--t-fast,120ms) ease}',
    '.ac-type:hover{color:var(--text);border-color:var(--accent)}',
    '.ac-type[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#0a0a0b;font-weight:600}',
    '.ac-checks{display:grid;gap:9px;font-size:13px;color:var(--muted)}',
    '.ac-checks label{display:flex;align-items:center;gap:8px;cursor:pointer}',
    '.ac-checks input{accent-color:var(--accent)}',
    '.ac-reset{padding:10px 14px;border:1px solid var(--line);border-radius:10px;background:transparent;' +
      'color:var(--muted);font:inherit;font-size:13px;cursor:pointer}',
    '.ac-reset:hover{color:var(--text);border-color:var(--accent)}',

    /* активные фильтры */
    '.ac-active{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px}',
    '.ac-pill{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid var(--line);' +
      'border-radius:999px;background:var(--surface-2);color:var(--text);font-size:12.5px}',
    '.ac-pill button{border:0;background:transparent;color:var(--dim,var(--muted));font:inherit;font-size:14px;' +
      'line-height:1;cursor:pointer;padding:0}',
    '.ac-pill button:hover{color:var(--accent)}',

    /* сетка постеров */
    '.ac-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:20px 16px}',
    '.ac-card{display:block;color:inherit;text-decoration:none}',
    '.ac-poster{position:relative;aspect-ratio:350/500;border-radius:14px;overflow:hidden;background:var(--surface-2);' +
      'box-shadow:0 6px 20px rgba(0,0,0,0.28);transition:transform var(--t,200ms) ease,box-shadow var(--t,200ms) ease}',
    '.ac-card:hover .ac-poster{transform:translateY(-4px);box-shadow:0 14px 30px rgba(0,0,0,0.4)}',
    '.ac-poster img{width:100%;height:100%;object-fit:cover;display:block}',
    '.ac-poster::after{content:"";position:absolute;inset:auto 0 0;height:46%;pointer-events:none;' +
      'background:linear-gradient(to top,rgba(8,8,10,0.85),rgba(8,8,10,0))}',
    '.ac-rate{position:absolute;right:8px;top:8px;z-index:2;display:inline-flex;align-items:center;gap:3px;' +
      'padding:3px 8px;border-radius:999px;background:rgba(10,10,11,0.78);backdrop-filter:blur(4px);' +
      'color:#ffd166;font-size:11.5px;font-weight:700}',
    '.ac-kind{position:absolute;left:8px;top:8px;z-index:2;padding:3px 8px;border-radius:999px;' +
      'background:rgba(10,10,11,0.72);backdrop-filter:blur(4px);color:#fff;font-size:11px;font-weight:600}',
    '.ac-ep{position:absolute;left:10px;bottom:9px;z-index:2;color:#fff;font-size:12px;font-weight:600;' +
      'text-shadow:0 1px 6px rgba(0,0,0,0.6)}',
    '.ac-status{position:absolute;right:10px;bottom:9px;z-index:2;color:#dcdce3;font-size:11.5px;' +
      'text-shadow:0 1px 6px rgba(0,0,0,0.6)}',
    '.ac-name{margin:9px 2px 0;font-size:13.5px;font-weight:600;line-height:1.3;display:-webkit-box;' +
      '-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.ac-card:hover .ac-name{color:var(--accent)}',
    '.ac-meta{margin:4px 2px 0;font-size:12px;color:var(--dim,var(--muted));display:-webkit-box;' +
      '-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}',
    '.ac-skel{aspect-ratio:350/500;border-radius:14px;background:var(--surface-2);' +
      'animation:animru-skeleton 1.1s ease-in-out infinite}',
    '.ac-state{margin:22px 2px;font-size:14px;color:var(--muted)}',
    '.ac-more{display:block;width:100%;margin:22px 0 4px;padding:12px 16px;border:1px solid var(--line);' +
      'border-radius:12px;background:var(--surface-2);color:var(--text);font:inherit;font-size:14px;cursor:pointer}',
    '.ac-more:hover{border-color:var(--accent)}',
    '.ac-more[disabled]{opacity:0.6;cursor:default}',

    '@media (max-width:1000px){',
      '.ac-layout{grid-template-columns:1fr}',
      '.ac-side{position:static;max-height:none;display:none}',
      '.ac-side.open{display:grid}',
      '.ac-filters-btn{display:inline-block}',
      '.ac-search{width:200px}',
    '}',
    '@media (max-width:620px){',
      '.ac-top h1{font-size:22px}',
      '.ac-top-right{width:100%;margin-left:0}',
      '.ac-search{flex:1 1 auto;width:auto}',
      '.ac-grid{grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:16px 10px}',
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

  /* anime_kind из документации */
  var KINDS = [
    { id: '', label: 'Любой вид' },
    { id: 'tv', label: 'ТВ-сериал' },
    { id: 'movie', label: 'Фильм' },
    { id: 'ova', label: 'OVA' },
    { id: 'ona', label: 'ONA' },
    { id: 'special', label: 'Спешл' },
    { id: 'tv_special', label: 'ТВ-спешл' },
    { id: 'music', label: 'Клип' }
  ];

  var VOICES = [
    { id: '', label: 'Любой перевод' },
    { id: 'voice', label: 'Озвучка' },
    { id: 'subtitles', label: 'Субтитры' }
  ];

  var MPAA = [
    { id: '', label: 'Любой рейтинг' },
    { id: 'g', label: 'G' },
    { id: 'pg', label: 'PG' },
    { id: 'pg-13', label: 'PG-13' },
    { id: 'r', label: 'R' },
    { id: 'r+', label: 'R+' },
    { id: 'rx', label: 'Rx' }
  ];

  var AGES = [
    { id: '', label: 'Любой возраст' },
    { id: '0-6', label: 'До 6+' },
    { id: '0-12', label: 'До 12+' },
    { id: '0-16', label: 'До 16+' },
    { id: '16-21', label: '16+ и выше' },
    { id: '18-21', label: 'Только 18+' }
  ];

  var RATINGS = [
    { id: '', label: 'Любая оценка' },
    { id: '9-10', label: 'Шикимори 9+' },
    { id: '8-10', label: 'Шикимори 8+' },
    { id: '7-10', label: 'Шикимори 7+' },
    { id: '6-10', label: 'Шикимори 6+' }
  ];

  var DURATIONS = [
    { id: '', label: 'Любая длина' },
    { id: '0-10', label: 'До 10 мин' },
    { id: '11-30', label: '11–30 мин' },
    { id: '31-60', label: '31–60 мин' },
    { id: '61-400', label: 'Больше часа' }
  ];

  var COUNTRIES = [
    { id: '', label: 'Любая страна' },
    { id: 'Япония', label: 'Япония' },
    { id: 'Китай', label: 'Китай' },
    { id: 'Корея Южная', label: 'Южная Корея' },
    { id: 'США', label: 'США' }
  ];

  var SORTS = [
    { id: 'updated_at', label: 'По обновлению' },
    { id: 'created_at', label: 'По добавлению' },
    { id: 'year', label: 'По году' },
    { id: 'shikimori_rating', label: 'По оценке Шикимори' },
    { id: 'kinopoisk_rating', label: 'По оценке Кинопоиска' },
    { id: 'imdb_rating', label: 'По оценке IMDb' }
  ];

  var ORDERS = [
    { id: 'desc', label: 'Сначала новое' },
    { id: 'asc', label: 'Сначала старое' }
  ];

  var KIND_NAMES = {
    tv: 'ТВ', movie: 'Фильм', ova: 'OVA', ona: 'ONA',
    special: 'Спешл', tv_special: 'ТВ-спешл', music: 'Клип'
  };

  var STATUS_NAMES = { ongoing: 'Онгоинг', released: 'Вышло', anons: 'Анонс' };

  /* описание полей: из него собирается боковая панель и чипсы активных фильтров */
  var FIELDS = [
    { key: 'genre', id: 'acGenre', label: 'Жанр', kind: 'genre' },
    { key: 'year', id: 'acYear', label: 'Год', kind: 'year' },
    { key: 'kind', id: 'acKind', label: 'Вид', list: KINDS },
    { key: 'status', id: 'acStatus', label: 'Статус', list: STATUS },
    { key: 'voice', id: 'acVoice', label: 'Перевод', list: VOICES },
    { key: 'rating', id: 'acRating', label: 'Оценка', list: RATINGS },
    { key: 'mpaa', id: 'acMpaa', label: 'Рейтинг MPAA', list: MPAA },
    { key: 'age', id: 'acAge', label: 'Возраст', list: AGES },
    { key: 'duration', id: 'acDuration', label: 'Длительность', list: DURATIONS },
    { key: 'country', id: 'acCountry', label: 'Страна', list: COUNTRIES },
    { key: 'sort', id: 'acSort', label: 'Сортировка', list: SORTS },
    { key: 'order', id: 'acOrder', label: 'Порядок', list: ORDERS }
  ];

  var DEFAULTS = {
    title: '', type: '', genre: '', year: '', status: '', kind: '', voice: '',
    mpaa: '', age: '', rating: '', duration: '', country: '', studio: '',
    sort: 'updated_at', order: 'desc', noCamrip: true, noLgbt: false
  };

  var state = {
    filters: null,
    items: [],
    seen: {},
    next: null,
    total: 0,
    loading: false,
    done: false,
    failed: false,
    genres: null,
    genreKey: '',
    mounted: false,
    sideOpen: false
  };

  /* ---------------- фильтры: память ---------------- */

  function freshFilters() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) { out[key] = DEFAULTS[key]; });
    return out;
  }

  function loadFilters() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { saved = null; }
    var out = freshFilters();
    if (saved && typeof saved === 'object') {
      Object.keys(DEFAULTS).forEach(function (key) {
        if (saved[key] === undefined || saved[key] === null) return;
        out[key] = typeof DEFAULTS[key] === 'boolean' ? !!saved[key] : String(saved[key]);
      });
    }
    /* поиск по названию не запоминаем: он живёт одну сессию */
    out.title = '';
    return out;
  }

  function saveFilters() {
    try { localStorage.setItem(LS, JSON.stringify(state.filters)); } catch (e) {}
  }

  state.filters = loadFilters();

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

  /* в навигации вместо «Kodik» — «Каталог (Кодик)» */
  function renameNav() {
    var links = document.querySelectorAll('[data-tab="kodik"]');
    Array.prototype.slice.call(links).forEach(function (link) {
      if (link.textContent.trim() !== PAGE_TITLE) link.textContent = PAGE_TITLE;
      link.title = 'Каталог из источника Kodik';
    });
  }

  /* ---------------- жанры ---------------- */

  /* аниме-жанр идёт в anime_genres, остальное — в genres */
  function genreKeyFor(genre) {
    var name = String(genre || '');
    var hit = false;
    ANIME_GENRES.forEach(function (known) {
      if (known.toLowerCase() === name.toLowerCase()) hit = true;
    });
    return hit && name[0] === name[0].toUpperCase() ? 'anime_genres' : 'genres';
  }

  function genreValue(genre, key) {
    var name = String(genre || '');
    if (key === 'genres') return name.toLowerCase();
    var exact = name;
    ANIME_GENRES.forEach(function (known) {
      if (known.toLowerCase() === name.toLowerCase()) exact = known;
    });
    return exact;
  }

  function otherKey(key) {
    return key === 'anime_genres' ? 'genres' : 'anime_genres';
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
      var ready = clean(params);
      var query = Object.keys(ready).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(String(ready[key]));
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

  /* общие фильтры: работают и в /list, и в /search */
  function commonParams() {
    var f = state.filters;
    return {
      limit: LIMIT,
      types: f.type || 'anime,anime-serial',
      year: f.year,
      anime_kind: f.kind,
      anime_status: f.status,
      translation_type: f.voice,
      rating_mpaa: f.mpaa,
      minimal_age: f.age,
      shikimori_rating: f.rating,
      duration: f.duration,
      countries: f.country,
      anime_studios: f.studio,
      /* камрипы и LGBT-метки отключаем строками: false отбрасывается как пустое значение */
      camrip: f.noCamrip ? 'false' : '',
      lgbt: f.noLgbt ? 'false' : '',
      with_material_data: true
    };
  }

  function withGenre(params, key) {
    var f = state.filters;
    if (f.genre && key) params[key] = genreValue(f.genre, key);
    return params;
  }

  function listParams(key) {
    var f = state.filters;
    var params = commonParams();
    params.sort = f.sort;
    params.order = f.order || 'desc';
    return withGenre(params, key);
  }

  /* /search не поддерживает sort и order */
  function searchParams(key) {
    var params = commonParams();
    params.title = state.filters.title;
    return withGenre(params, key);
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

  /* первая страница: пробуем подходящий параметр жанра, при пустоте — второй */
  function firstPage() {
    var f = state.filters;
    var path = f.title ? '/search' : '/list';
    var build = f.title ? searchParams : listParams;

    if (!f.genre) return ask(path, build(''));

    var key = state.genreKey || genreKeyFor(f.genre);
    return ask(path, build(key)).then(function (data) {
      if ((data.results || []).length || state.genreKey) {
        state.genreKey = key;
        return data;
      }
      var alt = otherKey(key);
      return ask(path, build(alt))
        .then(function (second) {
          if ((second.results || []).length) {
            state.genreKey = alt;
            return second;
          }
          state.genreKey = key;
          return data;
        })
        .catch(function () {
          state.genreKey = key;
          return data;
        });
    });
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

    var first = state.next ? askUrl(state.next) : firstPage();

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
    state.genreKey = '';
    saveFilters();
    fetchPortion();
  }

  /* списка жанров в API нет (только /search, /list, /translations),
     так что берём аниме-жанры из документации и дополняем тем, что пришло в material_data */
  function collectGenres() {
    var map = {};
    ANIME_GENRES.forEach(function (genre) { map[genre] = true; });
    state.items.forEach(function (item) {
      var material = item.material_data || {};
      (material.anime_genres || []).forEach(function (genre) {
        var name = String(genre || '').trim();
        if (name && name.toLowerCase() !== 'аниме') map[name] = true;
      });
    });
    var list = Object.keys(map).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    var same = state.genres && state.genres.length === list.length &&
      state.genres.every(function (genre, index) { return genre === list[index]; });
    state.genres = list;
    return !same;
  }

  function fillGenreSelect() {
    var select = byId('acGenre');
    if (!select) return;
    var current = state.filters.genre;
    select.innerHTML = '<option value="">Любой жанр</option>' +
      (state.genres || []).map(function (genre) {
        return '<option value="' + escapeHtml(genre) + '">' + escapeHtml(genre) + '</option>';
      }).join('');
    select.value = current;
  }

  /* ---------------- разметка ---------------- */

  function cardHtml(item) {
    var material = item.material_data || {};
    var name = material.anime_title || material.title || item.title || 'Без названия';
    var year = item.year || material.year || '';
    var poster = material.anime_poster_url || material.poster_url || '';
    var kindRaw = material.anime_kind || material.kind || (item.type === 'anime' ? 'movie' : 'tv');
    var kind = KIND_NAMES[kindRaw] || (item.type === 'anime' ? 'Фильм' : 'Сериал');
    var statusRaw = material.anime_status || material.all_status || '';
    var status = STATUS_NAMES[statusRaw] || '';
    var episodes = item.last_episode || material.episodes_aired || material.episodes_total || 0;
    var total = material.episodes_total || 0;
    var rating = Number(material.shikimori_rating || material.kinopoisk_rating || material.imdb_rating || 0);
    var genres = (material.anime_genres || material.genres || []).slice(0, 3).join(', ');
    var image = poster
      ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy" decoding="async">'
      : '';
    var episodeLine = episodes
      ? escapeHtml(episodes) + (total && total > episodes ? ' из ' + escapeHtml(total) : '') + ' эп.'
      : '';

    return '<a class="ac-card" href="#/kodik/' + encodeURIComponent(item.id) + '">' +
      '<div class="ac-poster">' + image +
      '<span class="ac-kind">' + escapeHtml(kind) + '</span>' +
      (rating ? '<span class="ac-rate">★ ' + escapeHtml(rating.toFixed(1)) + '</span>' : '') +
      (episodeLine ? '<span class="ac-ep">' + episodeLine + '</span>' : '') +
      (status ? '<span class="ac-status">' + escapeHtml(status) + '</span>' : '') +
      '</div>' +
      '<p class="ac-name">' + escapeHtml(name) + '</p>' +
      '<p class="ac-meta">' + escapeHtml([year || '—', genres].filter(Boolean).join(' · ')) + '</p>' +
      '</a>';
  }

  function skeletons(count) {
    var out = '';
    for (var i = 0; i < count; i += 1) out += '<div class="ac-skel"></div>';
    return out;
  }

  /* год: конкретные значения плюс диапазоны — API принимает и «2021», и «2010-2019» */
  function yearList() {
    var now = new Date().getFullYear();
    var list = [
      { id: '', label: 'Любой год' },
      { id: String(now - 4) + '-' + String(now), label: 'Последние 5 лет' },
      { id: '2020-' + String(now), label: '2020-е' },
      { id: '2010-2019', label: '2010-е' },
      { id: '2000-2009', label: '2000-е' },
      { id: '1990-1999', label: '1990-е' },
      { id: '1980-1989', label: '1980-е' }
    ];
    for (var year = now; year >= 1980; year -= 1) {
      list.push({ id: String(year), label: String(year) });
    }
    return list;
  }

  function listFor(field) {
    if (field.kind === 'year') return yearList();
    if (field.kind === 'genre') {
      return [{ id: '', label: 'Любой жанр' }].concat((state.genres || []).map(function (genre) {
        return { id: genre, label: genre };
      }));
    }
    return field.list || [];
  }

  function labelFor(field, value) {
    var found = '';
    listFor(field).forEach(function (row) {
      if (String(row.id) === String(value)) found = row.label;
    });
    return found || String(value);
  }

  function options(list, selected) {
    return list.map(function (row) {
      return '<option value="' + escapeHtml(row.id) + '"' +
        (String(row.id) === String(selected) ? ' selected' : '') + '>' + escapeHtml(row.label) + '</option>';
    }).join('');
  }

  function groupHtml(field) {
    var value = state.filters[field.key];
    return '<div class="ac-group">' +
      '<span class="ac-label">' + escapeHtml(field.label) + '</span>' +
      '<select class="ac-sel" id="' + field.id + '">' + options(listFor(field), value) + '</select>' +
      '</div>';
  }

  /* чипсы активных фильтров над сеткой, каждый снимается крестиком */
  function activeHtml() {
    var f = state.filters;
    var pills = [];

    function pill(key, text) {
      pills.push('<span class="ac-pill">' + escapeHtml(text) +
        '<button type="button" data-clear="' + key + '" aria-label="Снять фильтр">×</button></span>');
    }

    if (f.title) pill('title', 'Поиск: ' + f.title);
    if (f.type) {
      TYPES.forEach(function (row) { if (row.id === f.type) pill('type', row.label); });
    }
    FIELDS.forEach(function (field) {
      var value = f[field.key];
      if (!value || value === DEFAULTS[field.key]) return;
      pill(field.key, labelFor(field, value));
    });
    if (f.studio) pill('studio', 'Студия: ' + f.studio);
    if (f.noLgbt) pill('noLgbt', 'Без LGBT-метки');
    if (!f.noCamrip) pill('noCamrip', 'С экранками');

    return pills.join('');
  }

  function render() {
    var grid = byId('acGrid');
    if (!grid) return;
    var more = byId('acMore');
    var stateLine = byId('acState');
    var count = byId('acCount');
    var active = byId('acActive');

    grid.innerHTML = state.items.map(cardHtml).join('') +
      (state.loading ? skeletons(state.items.length ? 6 : 18) : '');

    if (collectGenres()) fillGenreSelect();

    if (active) {
      var pills = activeHtml();
      active.innerHTML = pills;
      active.hidden = !pills;
    }
    if (count) {
      count.textContent = state.items.length
        ? state.items.length + ' из ' + (state.total ? state.total.toLocaleString('ru-RU') : '—')
        : '';
    }
    if (stateLine) {
      var message = '';
      if (!state.loading && state.failed && !state.items.length) message = 'Kodik не ответил. Нажми «Повторить» — транспорт подберётся заново.';
      else if (!state.loading && !state.items.length) message = 'Ничего не нашлось — попробуй ослабить фильтры или нажать «Сбросить».';
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
      '<div class="ac-top">' +
      '<h1>' + escapeHtml(PAGE_TITLE) + '</h1>' +
      '<span class="ac-count" id="acCount"></span>' +
      '<div class="ac-top-right">' +
      '<input class="ac-search" id="acSearch" type="search" placeholder="Поиск по названию" autocomplete="off" value="' +
      escapeHtml(f.title) + '">' +
      '<button type="button" class="ac-filters-btn" id="acFiltersBtn" aria-expanded="false">Фильтры</button>' +
      '</div></div>' +

      '<div class="ac-layout">' +
      '<aside class="ac-side' + (state.sideOpen ? ' open' : '') + '" id="acSide">' +
      '<div class="ac-group"><span class="ac-label">Тип</span><div class="ac-types" id="acTypes">' +
      TYPES.map(function (row) {
        return '<button type="button" class="ac-type" data-type="' + escapeHtml(row.id) + '" aria-pressed="' +
          (row.id === f.type ? 'true' : 'false') + '">' + escapeHtml(row.label) + '</button>';
      }).join('') + '</div></div>' +
      FIELDS.map(groupHtml).join('') +
      '<div class="ac-group"><span class="ac-label">Студия</span>' +
      '<input class="ac-text" id="acStudio" type="text" placeholder="например Bones" autocomplete="off" value="' +
      escapeHtml(f.studio) + '"></div>' +
      '<div class="ac-checks">' +
      '<label><input type="checkbox" id="acNoCamrip"' + (f.noCamrip ? ' checked' : '') + '> Без экранок</label>' +
      '<label><input type="checkbox" id="acNoLgbt"' + (f.noLgbt ? ' checked' : '') + '> Без LGBT-метки</label>' +
      '</div>' +
      '<button type="button" class="ac-reset" id="acReset">Сбросить фильтры</button>' +
      '</aside>' +

      '<div class="ac-main">' +
      '<div class="ac-active" id="acActive" hidden></div>' +
      '<div class="ac-grid" id="acGrid"></div>' +
      '<p class="ac-state" id="acState" hidden></p>' +
      '<button type="button" class="ac-more" id="acMore" hidden>Показать ещё</button>' +
      '<div id="acSentinel" aria-hidden="true"></div>' +
      '</div></div>';

    collectGenres();
    fillGenreSelect();

    byId('acTypes').addEventListener('click', function (event) {
      var chip = event.target && event.target.closest ? event.target.closest('.ac-type') : null;
      if (!chip) return;
      f.type = chip.getAttribute('data-type') || '';
      Array.prototype.slice.call(root.querySelectorAll('.ac-type')).forEach(function (node) {
        node.setAttribute('aria-pressed', node === chip ? 'true' : 'false');
      });
      reload();
    });

    var search = byId('acSearch');
    var searchTimer = null;
    search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        f.title = search.value.trim();
        reload();
      }, 400);
    });

    var studio = byId('acStudio');
    var studioTimer = null;
    studio.addEventListener('input', function () {
      clearTimeout(studioTimer);
      studioTimer = setTimeout(function () {
        f.studio = studio.value.trim();
        reload();
      }, 500);
    });

    FIELDS.forEach(function (field) {
      var node = byId(field.id);
      if (!node) return;
      node.addEventListener('change', function () {
        f[field.key] = node.value;
        reload();
      });
    });

    [['acNoCamrip', 'noCamrip'], ['acNoLgbt', 'noLgbt']].forEach(function (pair) {
      var node = byId(pair[0]);
      if (!node) return;
      node.addEventListener('change', function () {
        f[pair[1]] = !!node.checked;
        reload();
      });
    });

    var toggle = byId('acFiltersBtn');
    toggle.addEventListener('click', function () {
      state.sideOpen = !state.sideOpen;
      var side = byId('acSide');
      if (side) side.classList.toggle('open', state.sideOpen);
      toggle.setAttribute('aria-expanded', state.sideOpen ? 'true' : 'false');
    });

    /* крестик на чипсе снимает один фильтр и пересобирает панель */
    byId('acActive').addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-clear]') : null;
      if (!button) return;
      var key = button.getAttribute('data-clear');
      if (!(key in DEFAULTS)) return;
      f[key] = DEFAULTS[key];
      mount(root);
      reload();
    });

    byId('acReset').addEventListener('click', function () {
      state.filters = freshFilters();
      saveFilters();
      mount(root);
      reload();
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

    state.mounted = true;
    render();
    if (!state.items.length) fetchPortion();
  }

  function pass() {
    injectCss();
    renameNav();
    var hash = location.hash || '';
    if (!/^#\/kodik\/?$/.test(hash)) {
      state.mounted = false;
      return;
    }
    var root = byId('kbRoot');
    if (!root) return;
    if (state.mounted && byId('acGrid')) return;
    if (!root.children.length) return;
    mount(root);
  }

  function start() {
    pass();
    window.addEventListener('hashchange', function () {
      state.mounted = false;
      setTimeout(pass, 120);
      setTimeout(pass, 600);
    });
    if (document.body && window.MutationObserver) {
      var observer = new MutationObserver(function () {
        clearTimeout(start.timer);
        start.timer = setTimeout(pass, 120);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    setTimeout(pass, 800);
    setTimeout(renameNav, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.AnimCatalog = {
    reload: reload,
    genres: function () { return state.genres || []; },
    filters: function () { return state.filters; },
    state: function () { return state; }
  };
})();
