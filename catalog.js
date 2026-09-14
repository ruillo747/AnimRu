/* AnimRu — отдельный каталог Kodik в визуальном языке каталога AniLibria.
   Параметры сверены с AnimeParsers/KODIK_API.md. Каталог не меняет страницы
   тайтлов: их по-прежнему обслуживает kodik-browse.js. */
(function () {
  'use strict';

  var LIMIT = 50;
  var TARGET = 30;
  var MAX_HOPS = 5;
  var STORAGE = 'animru:kodik-catalog-v2';

  var GENRES = [
    'Боевые искусства', 'Военное', 'Драма', 'Исторический', 'Комедия', 'Музыка',
    'Повседневность', 'Приключения', 'Психологическое', 'Романтика', 'Самураи',
    'Сверхъестественное', 'Спорт', 'Триллер', 'Фантастика', 'Фэнтези', 'Школа',
    'Экшен', 'Сёнен'
  ];

  var DEFAULTS = {
    title: '', type: '', genre: '', genreMode: 'auto', year: '', kind: '', status: '',
    translationType: '', translationId: '', shikimoriRating: '', kinopoiskRating: '',
    imdbRating: '', mpaa: '', minimalAge: '', duration: '', countries: '', studios: '',
    licensedBy: '', actors: '', directors: '', writers: '', producers: '', composers: '',
    sort: 'updated_at', order: 'desc', noCamrip: true, noLgbt: false
  };

  var state = {
    filters: readFilters(), items: [], seen: {}, next: '', total: 0,
    loading: false, failed: false, done: false, mounted: false,
    filtersOpen: false, advancedOpen: false, genreKey: ''
  };

  var CSS = [
    '.kc-page{padding-top:calc(var(--header-h,64px) + 24px)}',
    '.kc-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}',
    '.kc-head h1{margin:0;font-size:28px;line-height:1.15;letter-spacing:-.02em}',
    '.kc-count{font-size:13px;color:var(--dim,var(--muted))}',
    '.kc-head-actions{margin-left:auto;display:flex;align-items:center;gap:8px}',
    '.kc-search{width:300px;max-width:100%;padding:10px 14px;border:1px solid var(--line);border-radius:999px;background:var(--surface-2);color:var(--text);font:inherit}',
    '.kc-search:focus,.kc-control:focus{outline:none;border-color:var(--accent)}',
    '.kc-toggle{display:none;padding:10px 15px;border:1px solid var(--line);border-radius:999px;background:var(--surface-2);color:var(--text);font:inherit;cursor:pointer}',
    '.kc-layout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:24px;align-items:start}',
    '.kc-side{position:sticky;top:calc(var(--header-h,64px) + 16px);display:grid;gap:15px;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--surface);max-height:calc(100vh - var(--header-h,64px) - 38px);overflow:auto;scrollbar-width:thin}',
    '.kc-section{display:grid;gap:10px;padding-bottom:14px;border-bottom:1px solid var(--line)}',
    '.kc-section:last-of-type{border-bottom:0;padding-bottom:0}',
    '.kc-section-title{font-size:12px;font-weight:750;letter-spacing:.055em;text-transform:uppercase;color:var(--dim,var(--muted))}',
    '.kc-field{display:grid;gap:6px}',
    '.kc-label{font-size:12px;color:var(--muted)}',
    '.kc-control{width:100%;min-width:0;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--text);font:inherit;font-size:13px}',
    '.kc-types{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}',
    '.kc-type{min-height:36px;padding:7px 4px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--muted);font:inherit;font-size:12px;cursor:pointer}',
    '.kc-type[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#0a0a0b;font-weight:700}',
    '.kc-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);cursor:pointer}',
    '.kc-check input{accent-color:var(--accent)}',
    '.kc-advanced{display:grid;gap:10px}',
    '.kc-advanced[hidden]{display:none}',
    '.kc-advanced-btn,.kc-reset{padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--muted);font:inherit;font-size:13px;cursor:pointer}',
    '.kc-advanced-btn:hover,.kc-reset:hover{color:var(--text);border-color:var(--accent)}',
    '.kc-active{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:15px}',
    '.kc-pill{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border:1px solid var(--line);border-radius:999px;background:var(--surface-2);font-size:12.5px}',
    '.kc-pill button{border:0;padding:0;background:none;color:var(--dim);font:inherit;cursor:pointer}',
    '.kc-main{min-width:0}',
    '.kc-grid{align-items:start}',
    '.kc-card .card-poster{position:relative}',
    '.kc-rate{position:absolute;left:8px;top:8px;z-index:3;padding:3px 7px;border-radius:8px;background:rgba(8,8,10,.8);color:#ffd166;font-size:11px;font-weight:700;backdrop-filter:blur(4px)}',
    '.kc-source{position:absolute;left:8px;bottom:8px;z-index:3;padding:3px 7px;border-radius:8px;background:rgba(8,8,10,.78);color:#fff;font-size:10px;font-weight:700}',
    '.kc-state{margin:22px 2px;color:var(--muted)}',
    '.kc-more{display:block;width:100%;margin:22px 0 4px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);color:var(--text);font:inherit;cursor:pointer}',
    '.kc-more[disabled]{opacity:.6;cursor:default}',
    '.kc-doc-note{font-size:11px;line-height:1.45;color:var(--dim)}',
    '@media(max-width:1000px){.kc-layout{grid-template-columns:1fr}.kc-side{display:none;position:static;max-height:none}.kc-side.open{display:grid}.kc-toggle{display:inline-block}.kc-search{width:220px}}',
    '@media(max-width:620px){.kc-page{padding-top:calc(var(--header-h,64px) + 14px)}.kc-head h1{font-size:22px}.kc-head-actions{width:100%;margin-left:0}.kc-search{flex:1;width:auto}.kc-toggle{flex:0 0 auto}.kc-side{padding:14px}}',
    '@media(prefers-reduced-motion:reduce){.kc-card .card-poster{transition:none}}'
  ].join('');

  var BASIC_FIELDS = [
    field('genre', 'Жанр', 'select', [['', 'Любой жанр']].concat(GENRES.map(function (x) { return [x, x]; }))),
    field('genreMode', 'Тип жанра', 'select', [['auto', 'Определять автоматически'], ['anime', 'Аниме-жанр'], ['general', 'Обычный жанр']]),
    field('year', 'Год или диапазон', 'text', null, '2024 или 2010-2019'),
    field('kind', 'Вид', 'select', [['', 'Любой вид'], ['tv', 'ТВ-сериал'], ['tv13', 'ТВ 13 минут'], ['tv24', 'ТВ 24 минуты'], ['tv48', 'ТВ 48 минут'], ['movie', 'Фильм'], ['special', 'Спецвыпуск'], ['ova', 'OVA'], ['ona', 'ONA'], ['music', 'Клип']]),
    field('status', 'Статус', 'select', [['', 'Любой статус'], ['ongoing', 'Онгоинг'], ['released', 'Завершён'], ['anons', 'Анонс']]),
    field('sort', 'Сортировка', 'select', [['updated_at', 'По обновлению'], ['created_at', 'По добавлению'], ['year', 'По году'], ['shikimori_rating', 'По Shikimori'], ['kinopoisk_rating', 'По Кинопоиску'], ['imdb_rating', 'По IMDb']]),
    field('order', 'Порядок', 'select', [['desc', 'По убыванию'], ['asc', 'По возрастанию']])
  ];

  var ADVANCED_FIELDS = [
    field('translationType', 'Формат перевода', 'select', [['', 'Любой'], ['voice', 'Озвучка'], ['subtitles', 'Субтитры']]),
    field('translationId', 'ID переводов', 'text', null, '609,610'),
    field('shikimoriRating', 'Рейтинг Shikimori', 'text', null, '7-10'),
    field('kinopoiskRating', 'Рейтинг Кинопоиска', 'text', null, '7-10'),
    field('imdbRating', 'Рейтинг IMDb', 'text', null, '7-10'),
    field('mpaa', 'Рейтинг MPAA', 'select', [['', 'Любой'], ['g', 'G'], ['pg', 'PG'], ['pg-13', 'PG-13'], ['r', 'R'], ['rx', 'Rx']]),
    field('minimalAge', 'Минимальный возраст', 'text', null, '0-16'),
    field('duration', 'Длительность, минуты', 'text', null, '11-30'),
    field('countries', 'Страны', 'text', null, 'Япония,Китай'),
    field('studios', 'Аниме-студии', 'text', null, 'Bones,Madhouse'),
    field('licensedBy', 'Лицензиар', 'text', null, 'название компании'),
    field('actors', 'Актёры', 'text', null, 'через запятую'),
    field('directors', 'Режиссёры', 'text', null, 'через запятую'),
    field('writers', 'Авторы', 'text', null, 'через запятую'),
    field('producers', 'Продюсеры', 'text', null, 'через запятую'),
    field('composers', 'Композиторы', 'text', null, 'через запятую')
  ];

  function field(key, label, kind, options, placeholder) {
    return { key: key, label: label, kind: kind, options: options || [], placeholder: placeholder || '' };
  }
  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function copyDefaults() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) { out[key] = DEFAULTS[key]; });
    return out;
  }
  function readFilters() {
    var out = copyDefaults();
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (saved && typeof saved === 'object') Object.keys(out).forEach(function (key) {
        if (saved[key] == null) return;
        out[key] = typeof out[key] === 'boolean' ? !!saved[key] : String(saved[key]);
      });
    } catch (e) {}
    out.title = '';
    return out;
  }
  function writeFilters() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state.filters)); } catch (e) {}
  }
  function injectCss() {
    if (byId('kodik-catalog-v2-css')) return;
    var style = document.createElement('style');
    style.id = 'kodik-catalog-v2-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  function onCatalog() { return /^#\/kodik\/?(?:\?|$)/.test(location.hash || ''); }
  function ensureView() {
    var view = byId('view-kodik');
    if (!view) {
      view = document.createElement('section');
      view.id = 'view-kodik';
      view.className = 'view wrap kc-page';
      view.hidden = true;
      view.innerHTML = '<div id="kbRoot"></div>';
      (byId('app') || document.body).appendChild(view);
    }
    view.classList.add('kc-page');
    var root = byId('kbRoot');
    if (!root) { root = document.createElement('div'); root.id = 'kbRoot'; view.appendChild(root); }
    return { view: view, root: root };
  }
  function showView(view) {
    Array.prototype.slice.call(document.querySelectorAll('#app > .view')).forEach(function (node) { node.hidden = node !== view; });
    view.hidden = false;
  }
  function clean(params) {
    var out = {};
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value !== '' && value != null && value !== false) out[key] = value;
    });
    return out;
  }
  function transport(tries) {
    if (window.AnimKodikNet && window.AnimKodikNet.request) return Promise.resolve(window.AnimKodikNet);
    if ((tries || 0) >= 50) return Promise.reject(new Error('Kodik transport unavailable'));
    return new Promise(function (resolve) { setTimeout(resolve, 120); }).then(function () { return transport((tries || 0) + 1); });
  }
  function ask(path, params) { return transport().then(function (api) { return api.request(path, clean(params)); }); }
  function askNext(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) { return res.json(); }).then(function (data) {
      if (!data || data.error) throw new Error('Kodik page unavailable');
      return data;
    });
  }
  function material(item) { return (item && item.material_data) || {}; }
  function nameOf(item) { var data = material(item); return data.anime_title || data.title || item.title || 'Без названия'; }
  function keyOf(item) {
    var data = material(item);
    if (item.shikimori_id) return 'sh:' + item.shikimori_id;
    if (item.kinopoisk_id) return 'kp:' + item.kinopoisk_id;
    return 'name:' + nameOf(item).toLowerCase().trim() + ':' + (item.year || data.year || '');
  }
  function absorb(items) {
    var added = 0;
    (items || []).forEach(function (item) {
      if (!item || !item.id) return;
      var key = keyOf(item);
      if (state.seen[key]) return;
      state.seen[key] = true;
      state.items.push(item);
      added += 1;
    });
    return added;
  }
  function automaticGenreKey(value) {
    var found = GENRES.some(function (genre) { return genre.toLowerCase() === String(value).toLowerCase(); });
    return found ? 'anime_genres' : 'genres';
  }
  function activeGenreKey() {
    if (state.filters.genreMode === 'anime') return 'anime_genres';
    if (state.filters.genreMode === 'general') return 'genres';
    return automaticGenreKey(state.filters.genre);
  }
  function requestParams(genreKey) {
    var f = state.filters;
    var params = {
      limit: LIMIT,
      types: f.type || 'anime,anime-serial',
      year: f.year,
      anime_kind: f.kind,
      anime_status: f.status,
      translation_type: f.translationType,
      translation_id: f.translationId,
      shikimori_rating: f.shikimoriRating,
      kinopoisk_rating: f.kinopoiskRating,
      imdb_rating: f.imdbRating,
      rating_mpaa: f.mpaa,
      minimal_age: f.minimalAge,
      duration: f.duration,
      countries: f.countries,
      anime_studios: f.studios,
      licensed_by: f.licensedBy,
      actors: f.actors,
      directors: f.directors,
      writers: f.writers,
      producers: f.producers,
      composers: f.composers,
      camrip: f.noCamrip ? 'false' : '',
      lgbt: f.noLgbt ? 'false' : '',
      with_material_data: true
    };
    if (f.genre) params[genreKey || activeGenreKey()] = genreKey === 'genres' ? f.genre.toLowerCase() : f.genre;
    if (f.title) params.title = f.title;
    else { params.sort = f.sort; params.order = f.order; }
    return params;
  }
  function firstRequest() {
    var path = state.filters.title ? '/search' : '/list';
    if (!state.filters.genre) return ask(path, requestParams(''));
    var key = state.genreKey || activeGenreKey();
    return ask(path, requestParams(key)).then(function (data) {
      if ((data.results || []).length || state.genreKey || state.filters.genreMode !== 'auto') { state.genreKey = key; return data; }
      var other = key === 'anime_genres' ? 'genres' : 'anime_genres';
      return ask(path, requestParams(other)).then(function (second) {
        if ((second.results || []).length) { state.genreKey = other; return second; }
        state.genreKey = key;
        return data;
      }).catch(function () { state.genreKey = key; return data; });
    });
  }
  function fetchPortion() {
    if (state.loading || state.done) return Promise.resolve();
    state.loading = true;
    state.failed = false;
    render();
    var gained = 0;
    function consume(data) {
      if (data.total != null) state.total = Number(data.total) || 0;
      gained += absorb(data.results);
      state.next = data.next_page || '';
      if (!state.next) state.done = true;
    }
    function continuePages(hop) {
      if (!state.next || gained >= TARGET || hop >= MAX_HOPS) return Promise.resolve();
      return askNext(state.next).then(function (data) { consume(data); return continuePages(hop + 1); });
    }
    var start = state.next ? askNext(state.next) : firstRequest();
    return start.then(function (data) { consume(data); return continuePages(1); }).catch(function () {
      state.failed = true;
    }).then(function () {
      state.loading = false;
      render();
    });
  }
  function reload() {
    state.items = [];
    state.seen = {};
    state.next = '';
    state.total = 0;
    state.done = false;
    state.failed = false;
    state.genreKey = '';
    writeFilters();
    render();
    fetchPortion();
  }
  function optionHtml(rows, selected) {
    return rows.map(function (row) {
      return '<option value="' + escapeHtml(row[0]) + '"' + (String(row[0]) === String(selected) ? ' selected' : '') + '>' + escapeHtml(row[1]) + '</option>';
    }).join('');
  }
  function fieldHtml(meta) {
    var value = state.filters[meta.key];
    if (meta.kind === 'select') {
      return '<label class="kc-field"><span class="kc-label">' + escapeHtml(meta.label) + '</span><select class="kc-control" data-filter="' + meta.key + '">' + optionHtml(meta.options, value) + '</select></label>';
    }
    return '<label class="kc-field"><span class="kc-label">' + escapeHtml(meta.label) + '</span><input class="kc-control" data-filter="' + meta.key + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(meta.placeholder) + '"></label>';
  }
  function cardHtml(item) {
    var data = material(item);
    var poster = data.anime_poster_url || data.poster_url || '';
    var total = item.last_episode || data.episodes_aired || data.episodes_total || '';
    var rating = Number(data.shikimori_rating || data.kinopoisk_rating || data.imdb_rating || 0);
    var kind = data.anime_kind || (item.type === 'anime' ? 'Фильм' : 'Сериал');
    var meta = [item.year || data.year, kind, total ? total + ' эп.' : ''].filter(Boolean).join(' · ');
    return '<a class="card kc-card" href="#/kodik/' + encodeURIComponent(item.id) + '"><div class="card-poster">' +
      (poster ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy" decoding="async">' : '') +
      '<span class="card-badge">' + escapeHtml(kind) + '</span>' +
      (rating ? '<span class="kc-rate">★ ' + rating.toFixed(1) + '</span>' : '') +
      '<span class="kc-source">Kodik</span></div><div class="card-body"><div class="card-title">' + escapeHtml(nameOf(item)) +
      '</div><div class="card-sub">' + escapeHtml(meta) + '</div></div></a>';
  }
  function filterLabel(key) {
    var found = BASIC_FIELDS.concat(ADVANCED_FIELDS).filter(function (meta) { return meta.key === key; })[0];
    return found ? found.label : key;
  }
  function activeHtml() {
    var pills = [];
    Object.keys(state.filters).forEach(function (key) {
      var value = state.filters[key];
      if (key === 'title' || key === 'genreMode' || value === '' || value === DEFAULTS[key]) return;
      if (typeof value === 'boolean') {
        if (value !== DEFAULTS[key]) pills.push('<span class="kc-pill">' + (key === 'noCamrip' ? 'Без экранок' : 'Без LGBT-метки') + '<button data-clear="' + key + '" aria-label="Убрать">×</button></span>');
        return;
      }
      pills.push('<span class="kc-pill">' + escapeHtml(filterLabel(key) + ': ' + value) + '<button data-clear="' + key + '" aria-label="Убрать">×</button></span>');
    });
    if (state.filters.title) pills.unshift('<span class="kc-pill">Поиск: ' + escapeHtml(state.filters.title) + '<button data-clear="title" aria-label="Убрать">×</button></span>');
    return pills.join('');
  }
  function skeletons(count) {
    var out = '';
    for (var i = 0; i < count; i += 1) out += '<div><div class="skeleton" style="aspect-ratio:2/3"></div><div class="skeleton" style="height:14px;margin-top:8px"></div></div>';
    return out;
  }
  function render() {
    var grid = byId('kcGrid');
    if (!grid) return;
    grid.innerHTML = state.items.map(cardHtml).join('') + (state.loading ? skeletons(state.items.length ? 6 : 18) : '');
    var count = byId('kcCount');
    if (count) count.textContent = state.items.length ? state.items.length + (state.total ? ' из ' + state.total.toLocaleString('ru-RU') : '') : '';
    var active = byId('kcActive');
    if (active) { active.innerHTML = activeHtml(); active.hidden = !active.innerHTML; }
    var status = byId('kcState');
    if (status) {
      var message = !state.loading && state.failed ? 'Kodik не ответил. Нажмите «Повторить».' : !state.loading && !state.items.length ? 'Ничего не найдено — попробуйте ослабить фильтры.' : '';
      status.textContent = message;
      status.hidden = !message;
    }
    var more = byId('kcMore');
    if (more) {
      more.hidden = state.done && !state.failed;
      more.disabled = state.loading;
      more.textContent = state.loading ? 'Загружаем…' : state.failed ? 'Повторить' : 'Показать ещё';
    }
  }
  function syncControls(root) {
    Array.prototype.slice.call(root.querySelectorAll('[data-type]')).forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-type') === state.filters.type ? 'true' : 'false');
    });
  }
  function mount(root) {
    var f = state.filters;
    root.innerHTML = '<div class="kc-head"><h1>Каталог Kodik</h1><span class="kc-count" id="kcCount"></span>' +
      '<div class="kc-head-actions"><input class="kc-search" id="kcSearch" type="search" placeholder="Поиск по названию" autocomplete="off" value="' + escapeHtml(f.title) + '">' +
      '<button class="kc-toggle" id="kcToggle" type="button" aria-expanded="false">Фильтры</button></div></div>' +
      '<div class="kc-layout"><aside class="kc-side" id="kcSide">' +
      '<section class="kc-section"><span class="kc-section-title">Основные фильтры</span><div class="kc-types">' +
      [['', 'Все'], ['anime-serial', 'Сериалы'], ['anime', 'Фильмы']].map(function (row) {
        return '<button class="kc-type" type="button" data-type="' + row[0] + '" aria-pressed="' + (f.type === row[0] ? 'true' : 'false') + '">' + row[1] + '</button>';
      }).join('') + '</div>' + BASIC_FIELDS.map(fieldHtml).join('') + '</section>' +
      '<button class="kc-advanced-btn" id="kcAdvancedBtn" type="button" aria-expanded="false">Расширенные фильтры</button>' +
      '<section class="kc-advanced" id="kcAdvanced" hidden>' + ADVANCED_FIELDS.map(fieldHtml).join('') +
      '<label class="kc-check"><input id="kcNoCamrip" type="checkbox"' + (f.noCamrip ? ' checked' : '') + '> Без экранок</label>' +
      '<label class="kc-check"><input id="kcNoLgbt" type="checkbox"' + (f.noLgbt ? ' checked' : '') + '> Без LGBT-метки</label></section>' +
      '<button class="kc-reset" id="kcReset" type="button">Сбросить всё</button>' +
      '<p class="kc-doc-note">Поиск использует /search, каталог — /list. Страницы загружаются по next_page.</p></aside>' +
      '<main class="kc-main"><div class="kc-active" id="kcActive" hidden></div><div class="grid kc-grid" id="kcGrid"></div>' +
      '<p class="kc-state" id="kcState" hidden></p><button class="kc-more" id="kcMore" type="button">Показать ещё</button><div id="kcSentinel" aria-hidden="true"></div></main></div>';

    var searchTimer = null;
    byId('kcSearch').oninput = function (event) {
      clearTimeout(searchTimer);
      var value = event.target.value;
      searchTimer = setTimeout(function () { f.title = value.trim(); reload(); }, 350);
    };
    root.onclick = function (event) {
      var type = event.target.closest('[data-type]');
      if (type) { f.type = type.getAttribute('data-type') || ''; syncControls(root); reload(); return; }
      var clear = event.target.closest('[data-clear]');
      if (clear) { var key = clear.getAttribute('data-clear'); f[key] = DEFAULTS[key]; mount(root); reload(); }
    };
    Array.prototype.slice.call(root.querySelectorAll('[data-filter]')).forEach(function (control) {
      var timer = null;
      var apply = function () { f[control.getAttribute('data-filter')] = control.value.trim(); reload(); };
      if (control.tagName === 'SELECT') control.onchange = apply;
      else control.oninput = function () { clearTimeout(timer); timer = setTimeout(apply, 450); };
    });
    byId('kcNoCamrip').onchange = function (event) { f.noCamrip = event.target.checked; reload(); };
    byId('kcNoLgbt').onchange = function (event) { f.noLgbt = event.target.checked; reload(); };
    byId('kcToggle').onclick = function () {
      state.filtersOpen = !state.filtersOpen;
      byId('kcSide').classList.toggle('open', state.filtersOpen);
      this.setAttribute('aria-expanded', state.filtersOpen ? 'true' : 'false');
    };
    byId('kcAdvancedBtn').onclick = function () {
      state.advancedOpen = !state.advancedOpen;
      byId('kcAdvanced').hidden = !state.advancedOpen;
      this.setAttribute('aria-expanded', state.advancedOpen ? 'true' : 'false');
    };
    byId('kcReset').onclick = function () { state.filters = copyDefaults(); writeFilters(); mount(root); reload(); };
    byId('kcMore').onclick = function () {
      if (state.failed) { state.failed = false; state.done = false; if (window.AnimKodikNet) window.AnimKodikNet.resolve(true); }
      fetchPortion();
    };
    if (window.IntersectionObserver) {
      var observer = new IntersectionObserver(function (entries) {
        if (!state.failed && entries.some(function (entry) { return entry.isIntersecting; })) fetchPortion();
      }, { rootMargin: '600px 0px' });
      observer.observe(byId('kcSentinel'));
    }
    state.mounted = true;
    render();
    if (!state.items.length) fetchPortion();
  }
  function pass() {
    injectCss();
    if (!onCatalog()) { state.mounted = false; return; }
    var parts = ensureView();
    showView(parts.view);
    if (!byId('kcGrid')) mount(parts.root);
  }
  function start() {
    pass();
    window.addEventListener('hashchange', function () { state.mounted = false; setTimeout(pass, 0); setTimeout(pass, 700); });
    var observer = new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(pass, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(pass, 850);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.AnimCatalog = { reload: reload, filters: function () { return state.filters; }, state: function () { return state; } };
})();
