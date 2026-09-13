/* AnimRu — классический отдельный каталог Kodik.
   Основа возвращена к первому каталогу (commit 015d814), интерфейс приведён к
   каталогу AniLibria, а параметры сверены с KODIK_API.md AnimeParsers. */
(function () {
  'use strict';

  var LIMIT = 50;
  var WANT = 30;
  var HOPS = 5;
  var STORAGE = 'animru:kodik-catalog-classic';

  var GENRES = [
    'Боевые искусства', 'Военное', 'Драма', 'Исторический', 'Комедия', 'Музыка',
    'Повседневность', 'Приключения', 'Психологическое', 'Романтика', 'Самураи',
    'Сверхъестественное', 'Сёнен', 'Спорт', 'Триллер', 'Фантастика', 'Фэнтези',
    'Школа', 'Экшен'
  ];

  var DEFAULTS = {
    title: '', type: '', genre: '', year: '', kind: '', status: '', voice: '',
    rating: '', mpaa: '', sort: 'updated_at', order: 'desc'
  };

  var state = {
    filters: loadFilters(),
    items: [],
    seen: {},
    next: '',
    total: 0,
    loading: false,
    failed: false,
    done: false,
    mounted: false,
    sideOpen: false,
    genreKey: ''
  };

  var CSS = [
    '.kc-page{padding-top:calc(var(--header-h,64px) + 24px)}',
    '.kc-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 18px}',
    '.kc-head h1{margin:0;font-size:28px;line-height:1.15;letter-spacing:-.02em}',
    '.kc-count{font-size:13px;color:var(--dim,var(--muted))}',
    '.kc-search{margin-left:auto;width:min(320px,100%);padding:10px 14px;border:1px solid var(--line);border-radius:999px;background:var(--surface-2);color:var(--text);font:inherit}',
    '.kc-search:focus,.kc-select:focus{outline:none;border-color:var(--accent)}',
    '.kc-filter-toggle{display:none;margin-left:auto;padding:10px 15px;border:1px solid var(--line);border-radius:999px;background:var(--surface-2);color:var(--text);font:inherit}',
    '.kc-layout{display:grid;grid-template-columns:268px minmax(0,1fr);gap:26px;align-items:start}',
    '.kc-side{position:sticky;top:calc(var(--header-h,64px) + 16px);display:grid;gap:15px;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--surface);max-height:calc(100vh - var(--header-h,64px) - 38px);overflow:auto;scrollbar-width:thin}',
    '.kc-group{display:grid;gap:7px}',
    '.kc-label{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dim,var(--muted))}',
    '.kc-select{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--text);font:inherit;font-size:13.5px}',
    '.kc-types{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}',
    '.kc-type{min-height:36px;padding:7px 5px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--muted);font:inherit;font-size:12px;cursor:pointer}',
    '.kc-type[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#0a0a0b;font-weight:700}',
    '.kc-reset{padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--muted);font:inherit;cursor:pointer}',
    '.kc-active{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px}',
    '.kc-pill{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border:1px solid var(--line);border-radius:999px;background:var(--surface-2);font-size:12.5px}',
    '.kc-pill button{padding:0;border:0;background:none;color:var(--dim);font:inherit;cursor:pointer}',
    '.kc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(164px,1fr));gap:20px 16px}',
    '.kc-card{display:block;color:inherit;text-decoration:none}',
    '.kc-poster{position:relative;aspect-ratio:2/3;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface-2);box-shadow:0 6px 20px rgba(0,0,0,.24);transition:transform 180ms ease,border-color 180ms ease}',
    '.kc-card:hover .kc-poster{transform:translateY(-3px);border-color:var(--accent)}',
    '.kc-poster img{display:block;width:100%;height:100%;object-fit:cover}',
    '.kc-kind,.kc-rate,.kc-ep{position:absolute;z-index:2;padding:3px 7px;border-radius:8px;background:rgba(8,8,10,.78);color:#fff;font-size:11px;font-weight:700;backdrop-filter:blur(4px)}',
    '.kc-kind{left:8px;top:8px}.kc-rate{right:8px;top:8px;color:#ffd166}.kc-ep{left:8px;bottom:8px}',
    '.kc-name{margin:9px 2px 0;font-size:13.5px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.kc-meta{margin:4px 2px 0;font-size:12px;color:var(--dim,var(--muted));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.kc-card:hover .kc-name{color:var(--accent)}',
    '.kc-skel{aspect-ratio:2/3;border-radius:14px;background:var(--surface-2);animation:animru-skeleton 1.1s ease-in-out infinite}',
    '.kc-state{margin:22px 2px;color:var(--muted)}',
    '.kc-more{display:block;width:100%;margin:22px 0 4px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);color:var(--text);font:inherit;cursor:pointer}',
    '@media(max-width:1000px){.kc-layout{grid-template-columns:1fr}.kc-side{display:none;position:static;max-height:none}.kc-side.open{display:grid}.kc-filter-toggle{display:inline-block}.kc-search{order:3;margin-left:0;flex:1 1 100%}}',
    '@media(max-width:620px){.kc-page{padding-top:calc(var(--header-h,64px) + 14px)}.kc-head h1{font-size:22px}.kc-grid{grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:16px 10px}}',
    '@media(prefers-reduced-motion:reduce){.kc-poster{transition:none}}'
  ].join('');

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function cloneDefaults() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) { out[key] = DEFAULTS[key]; });
    return out;
  }
  function loadFilters() {
    var out = cloneDefaults();
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (saved && typeof saved === 'object') Object.keys(out).forEach(function (key) {
        if (saved[key] != null) out[key] = String(saved[key]);
      });
    } catch (e) {}
    out.title = '';
    return out;
  }
  function saveFilters() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state.filters)); } catch (e) {}
  }
  function injectCss() {
    if (byId('kodik-classic-css')) return;
    var style = document.createElement('style');
    style.id = 'kodik-classic-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }
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
    var root = byId('kbRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'kbRoot';
      view.appendChild(root);
    }
    return { view: view, root: root };
  }
  function showView(view) {
    Array.prototype.slice.call(document.querySelectorAll('#app > .view')).forEach(function (node) {
      node.hidden = node !== view;
    });
    view.hidden = false;
  }
  function clean(params) {
    var out = {};
    Object.keys(params).forEach(function (key) {
      if (params[key] !== '' && params[key] != null) out[key] = params[key];
    });
    return out;
  }
  function net(tries) {
    if (window.AnimKodikNet && window.AnimKodikNet.request) return Promise.resolve(window.AnimKodikNet);
    if ((tries || 0) > 50) return Promise.reject(new Error('Kodik transport unavailable'));
    return new Promise(function (resolve) { setTimeout(resolve, 120); }).then(function () { return net((tries || 0) + 1); });
  }
  function ask(path, params) {
    return net().then(function (api) { return api.request(path, clean(params)); });
  }
  function nextPage(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) { return res.json(); }).then(function (data) {
      if (!data || data.error) throw new Error('Kodik page unavailable');
      return data;
    });
  }
  function material(item) { return (item && item.material_data) || {}; }
  function titleOf(item) { var data = material(item); return data.anime_title || data.title || item.title || 'Без названия'; }
  function keyOf(item) {
    var data = material(item);
    return item.shikimori_id ? 'sh:' + item.shikimori_id : item.kinopoisk_id ? 'kp:' + item.kinopoisk_id : 'nm:' + titleOf(item).toLowerCase() + ':' + (item.year || data.year || '');
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
  function genreKey(name) { return GENRES.indexOf(name) >= 0 ? 'anime_genres' : 'genres'; }
  function params(key) {
    var f = state.filters;
    var out = {
      limit: LIMIT,
      types: f.type || 'anime,anime-serial',
      year: f.year,
      anime_kind: f.kind,
      anime_status: f.status,
      translation_type: f.voice,
      shikimori_rating: f.rating,
      rating_mpaa: f.mpaa,
      with_material_data: true
    };
    if (f.genre) out[key || genreKey(f.genre)] = f.genre;
    if (f.title) out.title = f.title;
    else { out.sort = f.sort; out.order = f.order; }
    return out;
  }
  function firstPage() {
    var f = state.filters;
    var path = f.title ? '/search' : '/list';
    if (!f.genre) return ask(path, params(''));
    var key = state.genreKey || genreKey(f.genre);
    return ask(path, params(key)).then(function (data) {
      if ((data.results || []).length || state.genreKey) { state.genreKey = key; return data; }
      var other = key === 'anime_genres' ? 'genres' : 'anime_genres';
      return ask(path, params(other)).then(function (second) {
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
    function take(data) {
      if (data.total != null) state.total = Number(data.total) || 0;
      gained += absorb(data.results);
      state.next = data.next_page || '';
      if (!state.next) state.done = true;
    }
    function walk(hop) {
      if (!state.next || gained >= WANT || hop >= HOPS) return Promise.resolve();
      return nextPage(state.next).then(function (data) { take(data); return walk(hop + 1); });
    }
    var start = state.next ? nextPage(state.next) : firstPage();
    return start.then(function (data) { take(data); return walk(1); }).catch(function () {
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
    saveFilters();
    fetchPortion();
  }
  function optionRows(rows, value) {
    return rows.map(function (row) {
      return '<option value="' + escapeHtml(row[0]) + '"' + (String(row[0]) === String(value) ? ' selected' : '') + '>' + escapeHtml(row[1]) + '</option>';
    }).join('');
  }
  function yearRows() {
    var now = new Date().getFullYear();
    var rows = [['', 'Любой год'], ['2020-' + now, '2020-е'], ['2010-2019', '2010-е'], ['2000-2009', '2000-е'], ['1990-1999', '1990-е']];
    for (var year = now; year >= 1980; year -= 1) rows.push([String(year), String(year)]);
    return rows;
  }
  var FIELDS = [
    ['genre', 'Жанр', [['', 'Любой жанр']].concat(GENRES.map(function (g) { return [g, g]; }))],
    ['year', 'Год', null],
    ['kind', 'Вид', [['', 'Любой вид'], ['tv', 'ТВ-сериал'], ['movie', 'Фильм'], ['special', 'Спешл'], ['ova', 'OVA'], ['ona', 'ONA'], ['music', 'Клип']]],
    ['status', 'Статус', [['', 'Любой статус'], ['ongoing', 'Онгоинг'], ['released', 'Вышло'], ['anons', 'Анонс']]],
    ['voice', 'Перевод', [['', 'Любой перевод'], ['voice', 'Озвучка'], ['subtitles', 'Субтитры']]],
    ['rating', 'Оценка Шикимори', [['', 'Любая оценка'], ['9-10', '9+'], ['8-10', '8+'], ['7-10', '7+'], ['6-10', '6+']]],
    ['mpaa', 'Рейтинг MPAA', [['', 'Любой рейтинг'], ['g', 'G'], ['pg', 'PG'], ['pg-13', 'PG-13'], ['r', 'R'], ['rx', 'Rx']]],
    ['sort', 'Сортировка', [['updated_at', 'По обновлению'], ['created_at', 'По добавлению'], ['year', 'По году'], ['shikimori_rating', 'По Шикимори'], ['kinopoisk_rating', 'По Кинопоиску'], ['imdb_rating', 'По IMDb']]],
    ['order', 'Порядок', [['desc', 'Сначала новое'], ['asc', 'Сначала старое']]]
  ];
  function fieldHtml(field) {
    var rows = field[0] === 'year' ? yearRows() : field[2];
    return '<label class="kc-group"><span class="kc-label">' + field[1] + '</span><select class="kc-select" data-filter="' + field[0] + '">' + optionRows(rows, state.filters[field[0]]) + '</select></label>';
  }
  function cardHtml(item) {
    var data = material(item);
    var poster = data.anime_poster_url || data.poster_url || '';
    var rating = Number(data.shikimori_rating || data.kinopoisk_rating || data.imdb_rating || 0);
    var kind = data.anime_kind || (item.type === 'anime' ? 'Фильм' : 'Сериал');
    var episodes = item.last_episode || data.episodes_aired || data.episodes_total || '';
    var genres = (data.anime_genres || data.genres || []).slice(0, 2).join(', ');
    return '<a class="kc-card" href="#/kodik/' + encodeURIComponent(item.id) + '"><div class="kc-poster">' +
      (poster ? '<img src="' + escapeHtml(poster) + '" alt="" loading="lazy" decoding="async">' : '') +
      '<span class="kc-kind">' + escapeHtml(kind) + '</span>' +
      (rating ? '<span class="kc-rate">★ ' + rating.toFixed(1) + '</span>' : '') +
      (episodes ? '<span class="kc-ep">' + escapeHtml(episodes) + ' эп.</span>' : '') +
      '</div><p class="kc-name">' + escapeHtml(titleOf(item)) + '</p><p class="kc-meta">' +
      escapeHtml([item.year || data.year || '—', genres].filter(Boolean).join(' · ')) + '</p></a>';
  }
  function activeHtml() {
    var labels = {};
    FIELDS.forEach(function (field) { labels[field[0]] = field[1]; });
    var pills = [];
    Object.keys(state.filters).forEach(function (key) {
      var value = state.filters[key];
      if (!value || value === DEFAULTS[key]) return;
      pills.push('<span class="kc-pill">' + escapeHtml(labels[key] ? labels[key] + ': ' + value : value) + '<button type="button" data-clear="' + key + '" aria-label="Убрать фильтр">×</button></span>');
    });
    return pills.join('');
  }
  function skeletons(count) {
    var out = '';
    for (var i = 0; i < count; i += 1) out += '<div class="kc-skel"></div>';
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
      var text = !state.loading && state.failed ? 'Kodik сейчас не ответил. Нажмите «Повторить».' : !state.loading && !state.items.length ? 'Ничего не найдено — измените фильтры.' : '';
      status.textContent = text;
      status.hidden = !text;
    }
    var more = byId('kcMore');
    if (more) {
      more.hidden = state.done && !state.failed;
      more.disabled = state.loading;
      more.textContent = state.loading ? 'Загружаем…' : state.failed ? 'Повторить' : 'Показать ещё';
    }
  }
  function mount(root) {
    var f = state.filters;
    root.innerHTML = '<div class="kc-head"><h1>Каталог Kodik</h1><span class="kc-count" id="kcCount"></span>' +
      '<button type="button" class="kc-filter-toggle" id="kcToggle" aria-expanded="false">Фильтры</button>' +
      '<input class="kc-search" id="kcSearch" type="search" placeholder="Поиск по названию" autocomplete="off" value="' + escapeHtml(f.title) + '"></div>' +
      '<div class="kc-layout"><aside class="kc-side" id="kcSide"><div class="kc-group"><span class="kc-label">Тип</span><div class="kc-types">' +
      [['', 'Все'], ['anime-serial', 'Сериалы'], ['anime', 'Фильмы']].map(function (row) {
        return '<button class="kc-type" type="button" data-type="' + row[0] + '" aria-pressed="' + (f.type === row[0] ? 'true' : 'false') + '">' + row[1] + '</button>';
      }).join('') + '</div></div>' + FIELDS.map(fieldHtml).join('') +
      '<button class="kc-reset" type="button" id="kcReset">Сбросить фильтры</button></aside>' +
      '<main><div class="kc-active" id="kcActive" hidden></div><div class="kc-grid" id="kcGrid"></div>' +
      '<p class="kc-state" id="kcState" hidden></p><button class="kc-more" type="button" id="kcMore">Показать ещё</button>' +
      '<div id="kcSentinel" aria-hidden="true"></div></main></div>';
    var timer = null;
    byId('kcSearch').addEventListener('input', function (event) {
      clearTimeout(timer);
      var value = event.target.value;
      timer = setTimeout(function () { f.title = value.trim(); reload(); }, 350);
    });
    root.addEventListener('click', function click(event) {
      var type = event.target.closest('[data-type]');
      if (type) { f.type = type.getAttribute('data-type'); mount(root); reload(); return; }
      var clear = event.target.closest('[data-clear]');
      if (clear) { var key = clear.getAttribute('data-clear'); f[key] = DEFAULTS[key]; mount(root); reload(); }
    }, { once: false });
    Array.prototype.slice.call(root.querySelectorAll('[data-filter]')).forEach(function (select) {
      select.addEventListener('change', function () { f[select.getAttribute('data-filter')] = select.value; reload(); });
    });
    byId('kcReset').addEventListener('click', function () { state.filters = cloneDefaults(); saveFilters(); mount(root); reload(); });
    byId('kcToggle').addEventListener('click', function () {
      state.sideOpen = !state.sideOpen;
      byId('kcSide').classList.toggle('open', state.sideOpen);
      byId('kcToggle').setAttribute('aria-expanded', state.sideOpen ? 'true' : 'false');
    });
    byId('kcMore').addEventListener('click', function () {
      if (state.failed) { state.failed = false; state.done = false; if (window.AnimKodikNet) window.AnimKodikNet.resolve(true); }
      fetchPortion();
    });
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
  function onCatalog() { return /^#\/kodik\/?(?:\?|$)/.test(location.hash || ''); }
  function pass() {
    injectCss();
    if (!onCatalog()) { state.mounted = false; return; }
    var parts = ensureView();
    showView(parts.view);
    if (!byId('kcGrid')) mount(parts.root);
  }
  function start() {
    pass();
    window.addEventListener('hashchange', function () { state.mounted = false; setTimeout(pass, 0); setTimeout(pass, 650); });
    var observer = new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(pass, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(pass, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.AnimCatalog = { reload: reload, filters: function () { return state.filters; }, state: function () { return state; } };
})();
