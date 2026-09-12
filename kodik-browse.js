/* AnimRu — второй источник Kodik на равных с Anilibria:
   свой каталог с фильтрами, подборки на главной, поиск, страница тайтла
   с сезонами, сериями, озвучками и продолжением просмотра. */
(function () {
  'use strict';

  var API = 'https://kodik-api.com';
  var LS_TOKEN = 'animru:kodik-token';
  var LS_WATCH = 'animru:kodik-watch';
  var FALLBACK_TOKENS = [
    '56a768d08f43091901c44b54fe970049',
    '41dd95f84c21719b09d6c71182237a25',
    '77b567ec164db6ca9162d2f3dc4948c3'
  ];
  var SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-presentation allow-orientation-lock';
  var AD_NOTE = 'Реклама внутри этого плеера — от Kodik. Плеер встроен с их сайта, убрать её со своей стороны мы не можем.';
  var PAGE = 30;

  var CSS = [
    '.kb-block{margin-bottom:32px}',
    '.kb-src{font-size:12px;color:var(--dim);font-weight:600}',
    '.kb-page{padding-top:calc(var(--header-h) + 24px)}',
    '.kb-hero{display:grid;grid-template-columns:186px 1fr;gap:20px;align-items:start;margin-bottom:18px}',
    '.kb-poster{width:100%;aspect-ratio:2/3;object-fit:cover;border:1px solid var(--line);border-radius:var(--r);background:var(--surface-3)}',
    '.kb-desc{margin-top:12px;max-width:70ch;color:var(--muted);white-space:pre-line}',
    '.kb-frame{width:100%;aspect-ratio:16/9;border:1px solid var(--line);border-radius:var(--r);background:#000}',
    '.kb-note{margin:6px 0 0;font-size:11.5px;line-height:1.4;color:var(--dim);opacity:.75}',
    '.kb-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}',
    '.kb-ep-label{font-size:15px;font-weight:600}',
    '.kb-nav{display:flex;gap:8px}',
    '.kb-panel{margin-top:14px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}',
    '.kb-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}',
    '.kb-title{font-size:14px;font-weight:600}',
    '.kb-count{font-size:12px;color:var(--dim)}',
    '.kb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:8px;max-height:212px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line-2) transparent}',
    '.kb-list.wide{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}',
    '.kb-btn{min-height:34px;padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface-2);color:var(--text);font:inherit;font-size:13px;text-align:center;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.kb-list.wide .kb-btn{text-align:left}',
    '.kb-btn:hover{border-color:var(--accent)}',
    '.kb-btn.active{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);font-weight:600}',
    '.kb-btn.seen{color:var(--dim)}',
    '.kb-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:18px;padding:14px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}',
    '.kb-field{display:grid;gap:6px;min-width:150px}',
    '.kb-more{display:flex;justify-content:center;padding:22px 0 4px}',
    '@media (max-width:620px){.kb-hero{grid-template-columns:1fr}.kb-poster{max-width:170px}.kb-field{min-width:130px;flex:1 1 130px}}'
  ].join('');

  var state = {
    view: null,
    route: null,
    id: null,
    items: [],
    picked: 0,
    season: null,
    episode: 1,
    homeDone: false,
    searchFor: null,
    genres: null,
    catalog: { items: [], page: 1, loading: false, done: false, filters: { genre: '', year: '', type: '', sort: 'updated_at' } }
  };

  function byId(id) { return document.getElementById(id); }

  function injectCss() {
    if (byId('kodik-browse-css')) return;
    var style = document.createElement('style');
    style.id = 'kodik-browse-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
    });
  }

  function plainText(html) {
    if (!html) return '';
    var holder = document.createElement('div');
    holder.innerHTML = String(html).replace(/<br\s*\/?>/gi, '\n');
    return (holder.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---------------- запросы к API ---------------- */

  function tokens() {
    var list = [];
    try {
      var saved = localStorage.getItem(LS_TOKEN);
      if (saved) list.push(saved);
    } catch (e) {}
    if (window.ANIMRU_CONFIG && window.ANIMRU_CONFIG.kodikToken) list.push(window.ANIMRU_CONFIG.kodikToken);
    return list.concat(FALLBACK_TOKENS).filter(function (token, index, all) {
      return token && all.indexOf(token) === index;
    });
  }

  function request(path, params) {
    var list = tokens();
    var index = 0;

    function attempt() {
      var url = new URL(API + path);
      Object.keys(params || {}).forEach(function (key) {
        var value = params[key];
        if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
      });
      url.searchParams.set('token', list[index]);
      return fetch(url.toString())
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (json) {
          if (!json || json.error) throw new Error((json && json.error) || 'empty');
          try { localStorage.setItem(LS_TOKEN, list[index]); } catch (e) {}
          return json;
        })
        .catch(function (error) {
          index += 1;
          if (index < list.length) return attempt();
          throw error;
        });
    }

    return list.length ? attempt() : Promise.reject(new Error('no token'));
  }

  /* ---------------- разбор тайтла ---------------- */

  function material(item) { return (item && item.material_data) || {}; }

  function nameOf(item) {
    var data = material(item);
    return item.title || data.anime_title || data.title || 'Без названия';
  }

  function posterOf(item) {
    var data = material(item);
    return data.anime_poster_url || data.poster_url || '';
  }

  function voiceOf(item) {
    return (item.translation && item.translation.title) || 'Озвучка';
  }

  function seasonsOf(item) {
    var seasons = item && item.seasons;
    if (!seasons) return [];
    return Object.keys(seasons)
      .map(Number)
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; });
  }

  function episodesOf(item, season) {
    var seasons = (item && item.seasons) || null;
    if (seasons && season != null && seasons[season] && seasons[season].episodes) {
      return Object.keys(seasons[season].episodes)
        .map(Number)
        .filter(function (n) { return !isNaN(n); })
        .sort(function (a, b) { return a - b; });
    }
    var data = material(item);
    var total = Number(item.episodes_count || item.last_episode || data.episodes_total || data.episodes_aired || 0) || 0;
    var list = [];
    for (var i = 1; i <= total; i += 1) list.push(i);
    return list;
  }

  function totalOf(item) {
    var data = material(item);
    return Number(item.episodes_count || item.last_episode || data.episodes_total || data.episodes_aired || 0) || 0;
  }

  function subLine(item) {
    var data = material(item);
    var total = totalOf(item);
    return [item.year, data.anime_kind || data.kind, total ? total + ' эп.' : '']
      .filter(Boolean)
      .join(' · ');
  }

  function uniqueTitles(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (item) {
      if (!item || !item.link) return;
      var key = String(item.shikimori_id || item.kinopoisk_id || nameOf(item) + item.year);
      if (seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  /* ---------------- прогресс просмотра ---------------- */

  function readWatch() {
    try { return JSON.parse(localStorage.getItem(LS_WATCH) || '{}') || {}; } catch (e) { return {}; }
  }

  function writeWatch(map) {
    try { localStorage.setItem(LS_WATCH, JSON.stringify(map)); } catch (e) {}
  }

  function saveWatch(item, season, episode) {
    var map = readWatch();
    var key = String(item.id);
    var entry = map[key] || { seen: [] };
    entry.id = item.id;
    entry.name = nameOf(item);
    entry.poster = posterOf(item);
    entry.season = season;
    entry.episode = episode;
    entry.total = totalOf(item);
    entry.at = Date.now();
    entry.seen = (entry.seen || []).filter(function (value) { return value !== episode; }).concat(episode).slice(-400);
    map[key] = entry;
    writeWatch(map);
    if (window.Gamify && window.Gamify.onTitleOpen) window.Gamify.onTitleOpen('kodik:' + item.id);
  }

  function watchOf(id) {
    return readWatch()[String(id)] || null;
  }

  /* ---------------- карточки ---------------- */

  function cardHtml(item) {
    var poster = posterOf(item);
    return (
      '<a class="card kb-card" href="#/kodik/' + encodeURIComponent(item.id) + '">' +
      '<span class="card-poster">' +
      (poster ? '<img loading="lazy" alt="" src="' + escapeHtml(poster) + '">' : '') +
      '<span class="card-badge">Kodik</span>' +
      '</span>' +
      '<span class="card-body"><span class="card-title">' + escapeHtml(nameOf(item)) + '</span>' +
      '<span class="card-sub">' + escapeHtml(subLine(item)) + '</span></span>' +
      '</a>'
    );
  }

  function continueCardHtml(entry) {
    return (
      '<a class="card kb-card" href="#/kodik/' + encodeURIComponent(entry.id) + '">' +
      '<span class="card-poster">' +
      (entry.poster ? '<img loading="lazy" alt="" src="' + escapeHtml(entry.poster) + '">' : '') +
      '<span class="card-badge">Kodik</span></span>' +
      '<span class="card-body"><span class="card-title">' + escapeHtml(entry.name || '') + '</span>' +
      '<span class="card-sub">Серия ' + escapeHtml(entry.episode) +
      (entry.total ? ' из ' + escapeHtml(entry.total) : '') + '</span></span></a>'
    );
  }

  /* ---------------- навигация ---------------- */

  function addNavLink() {
    var nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('[data-tab="kodik"]')) return;
    var link = document.createElement('a');
    link.href = '#/kodik';
    link.className = 'nav-link';
    link.dataset.tab = 'kodik';
    link.textContent = 'Kodik';
    var after = nav.querySelector('[data-tab="catalog"]');
    if (after) after.after(link);
    else nav.appendChild(link);
    link.addEventListener('click', function () { nav.classList.remove('open'); });
  }

  function markNav(active) {
    var link = document.querySelector('.nav [data-tab="kodik"]');
    if (!link) return;
    if (active) {
      Array.prototype.slice.call(document.querySelectorAll('.nav .nav-link')).forEach(function (node) {
        node.classList.remove('active');
      });
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  }

  /* ---------------- главная ---------------- */

  function railBlock(id, heading) {
    var block = document.createElement('section');
    block.className = 'row-block kb-block';
    block.innerHTML =
      '<div class="section-head"><h2>' + heading + '</h2>' +
      '<a class="link-btn" href="#/kodik">Весь Kodik</a></div>' +
      '<div class="rail" id="' + id + '"><p class="status">Загрузка…</p></div>';
    return block;
  }

  function fillRail(id, params, empty) {
    request('/list', params)
      .then(function (json) {
        var rail = byId(id);
        if (!rail) return;
        var items = uniqueTitles(json.results).slice(0, 18);
        rail.innerHTML = items.length ? items.map(cardHtml).join('') : '<p class="status">' + empty + '</p>';
      })
      .catch(function () {
        var rail = byId(id);
        if (rail) rail.innerHTML = '<p class="status">Kodik сейчас недоступен.</p>';
      });
  }

  function renderHome() {
    var home = byId('view-home');
    if (!home || state.homeDone) return;
    state.homeDone = true;

    var blocks = home.querySelectorAll('.row-block');
    var anchor = blocks.length ? blocks[blocks.length - 1] : null;

    var map = readWatch();
    var entries = Object.keys(map)
      .map(function (key) { return map[key]; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); })
      .slice(0, 12);

    if (entries.length) {
      var resume = document.createElement('section');
      resume.className = 'row-block kb-block';
      resume.innerHTML =
        '<div class="section-head"><h2>Продолжить на Kodik</h2></div>' +
        '<div class="rail">' + entries.map(continueCardHtml).join('') + '</div>';
      if (anchor) anchor.before(resume);
      else home.appendChild(resume);
    }

    var fresh = railBlock('kodikRail', 'Новое на Kodik');
    var ongoing = railBlock('kodikOngoing', 'Онгоинги на Kodik');
    if (anchor) {
      anchor.before(fresh);
      anchor.before(ongoing);
    } else {
      home.appendChild(fresh);
      home.appendChild(ongoing);
    }

    fillRail('kodikRail', {
      limit: 40,
      types: 'anime,anime-serial',
      sort: 'updated_at',
      with_material_data: true
    }, 'Kodik ничего не вернул.');

    fillRail('kodikOngoing', {
      limit: 40,
      types: 'anime-serial',
      anime_status: 'ongoing',
      sort: 'updated_at',
      with_material_data: true
    }, 'Онгоингов не нашлось.');
  }

  /* ---------------- поиск в общем каталоге ---------------- */

  function queryFromHash() {
    var hash = location.hash || '';
    var at = hash.indexOf('?');
    if (at < 0) return '';
    var params = new URLSearchParams(hash.slice(at + 1));
    return (params.get('q') || params.get('search') || '').trim();
  }

  function renderSearch() {
    var query = queryFromHash();
    var box = byId('kodikFound');
    if (!query) {
      if (box) box.remove();
      state.searchFor = null;
      return;
    }
    if (state.searchFor === query && box) return;
    state.searchFor = query;

    var host = document.querySelector('#view-list .catalog-main') || byId('view-list');
    if (!host) return;
    if (!box) {
      box = document.createElement('section');
      box.className = 'row-block kb-block';
      box.id = 'kodikFound';
      host.appendChild(box);
    }
    var head =
      '<div class="section-head"><h2>Найдено на Kodik</h2>' +
      '<span class="kb-src">второй источник</span></div>';
    box.innerHTML = head + '<p class="status">Ищем «' + escapeHtml(query) + '»…</p>';

    request('/search', { title: query, limit: 40, with_material_data: true })
      .then(function (json) {
        var current = byId('kodikFound');
        if (!current || state.searchFor !== query) return;
        var items = uniqueTitles(json.results).slice(0, 12);
        current.innerHTML = head + (items.length
          ? '<div class="grid">' + items.map(cardHtml).join('') + '</div>'
          : '<p class="status">На Kodik по этому запросу ничего нет.</p>');
      })
      .catch(function () {
        var current = byId('kodikFound');
        if (current && state.searchFor === query) {
          current.innerHTML = head + '<p class="status">Kodik сейчас недоступен.</p>';
        }
      });
  }

  /* ---------------- свой каталог Kodik ---------------- */

  function buildView() {
    if (state.view) return state.view;
    var view = document.createElement('section');
    view.id = 'view-kodik';
    view.className = 'view wrap kb-page';
    view.hidden = true;
    view.innerHTML = '<div id="kbRoot"></div>';
    (byId('app') || document.body).appendChild(view);
    state.view = view;
    return view;
  }

  function yearOptions() {
    var now = new Date().getFullYear();
    var out = '<option value="">Любой год</option>';
    for (var year = now; year >= 1990; year -= 1) out += '<option value="' + year + '">' + year + '</option>';
    return out;
  }

  function loadGenres() {
    if (state.genres) return Promise.resolve(state.genres);
    return request('/genres', { genres_type: 'anime' })
      .then(function (json) {
        state.genres = (json.results || [])
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

  function catalogParams() {
    var filters = state.catalog.filters;
    return {
      limit: PAGE,
      page: state.catalog.page,
      types: filters.type || 'anime,anime-serial',
      anime_genres: filters.genre,
      year: filters.year,
      sort: filters.sort,
      with_material_data: true
    };
  }

  function renderCatalogGrid() {
    var grid = byId('kbGrid');
    var status = byId('kbStatus');
    var more = byId('kbMore');
    if (!grid) return;
    grid.innerHTML = state.catalog.items.map(cardHtml).join('');
    if (status) {
      status.hidden = state.catalog.items.length > 0 || state.catalog.loading;
      status.textContent = state.catalog.loading ? 'Загрузка…' : 'Ничего не нашлось — попробуй сменить фильтры.';
    }
    if (more) {
      more.disabled = state.catalog.loading;
      more.textContent = state.catalog.loading ? 'Загружаем…' : 'Показать ещё';
      more.parentNode.hidden = state.catalog.done;
    }
  }

  function loadCatalog(reset) {
    if (state.catalog.loading) return;
    if (reset) {
      state.catalog.items = [];
      state.catalog.page = 1;
      state.catalog.done = false;
    }
    state.catalog.loading = true;
    renderCatalogGrid();

    request('/list', catalogParams())
      .then(function (json) {
        var items = uniqueTitles(json.results);
        var known = {};
        state.catalog.items.forEach(function (item) { known[item.id] = true; });
        items.forEach(function (item) {
          if (!known[item.id]) state.catalog.items.push(item);
        });
        state.catalog.done = !json.next_page || items.length === 0;
        state.catalog.page += 1;
      })
      .catch(function () {
        state.catalog.done = true;
      })
      .then(function () {
        state.catalog.loading = false;
        renderCatalogGrid();
      });
  }

  function renderCatalog() {
    var root = byId('kbRoot');
    if (!root) return;
    var filters = state.catalog.filters;

    root.innerHTML =
      '<div class="list-head"><h1>Каталог Kodik</h1>' +
      '<span class="kb-src">второй источник</span></div>' +
      '<div class="kb-filters">' +
      '<label class="kb-field"><span class="f-label">Жанр</span>' +
      '<select class="f-select" id="kbGenre"><option value="">Любой жанр</option></select></label>' +
      '<label class="kb-field"><span class="f-label">Год</span>' +
      '<select class="f-select" id="kbYear">' + yearOptions() + '</select></label>' +
      '<label class="kb-field"><span class="f-label">Тип</span>' +
      '<select class="f-select" id="kbType">' +
      '<option value="">Всё</option>' +
      '<option value="anime-serial">Сериалы</option>' +
      '<option value="anime">Фильмы</option></select></label>' +
      '<label class="kb-field"><span class="f-label">Сортировка</span>' +
      '<select class="f-select" id="kbSort">' +
      '<option value="updated_at">По обновлению</option>' +
      '<option value="created_at">По добавлению</option>' +
      '<option value="year">По году</option></select></label>' +
      '<button type="button" class="btn btn-ghost" id="kbReset">Сбросить</button>' +
      '</div>' +
      '<div class="grid" id="kbGrid"></div>' +
      '<p class="status" id="kbStatus" hidden></p>' +
      '<div class="kb-more"><button type="button" class="btn btn-ghost" id="kbMore">Показать ещё</button></div>';

    byId('kbYear').value = filters.year;
    byId('kbType').value = filters.type;
    byId('kbSort').value = filters.sort;

    loadGenres().then(function (list) {
      var select = byId('kbGenre');
      if (!select) return;
      select.innerHTML = '<option value="">Любой жанр</option>' +
        list.map(function (genre) {
          return '<option value="' + escapeHtml(genre) + '">' + escapeHtml(genre) + '</option>';
        }).join('');
      select.value = filters.genre;
    });

    ['kbGenre', 'kbYear', 'kbType', 'kbSort'].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener('change', function () {
        filters.genre = byId('kbGenre').value;
        filters.year = byId('kbYear').value;
        filters.type = byId('kbType').value;
        filters.sort = byId('kbSort').value;
        loadCatalog(true);
      });
    });

    byId('kbReset').addEventListener('click', function () {
      state.catalog.filters = { genre: '', year: '', type: '', sort: 'updated_at' };
      renderCatalog();
      loadCatalog(true);
    });

    byId('kbMore').addEventListener('click', function () { loadCatalog(false); });

    if (state.catalog.items.length) renderCatalogGrid();
    else loadCatalog(true);
  }

  /* ---------------- страница тайтла ---------------- */

  function frameUrl(item, season, episode) {
    var link = String(item.link || '');
    if (link.indexOf('//') === 0) link = 'https:' + link;
    var url = new URL(link);
    url.searchParams.set('hide_selectors', 'true');
    if (season != null) url.searchParams.set('season', String(season));
    if (episodesOf(item, season).length > 1) url.searchParams.set('episode', String(episode));
    return url.toString();
  }

  function mount() {
    var root = byId('kbRoot');
    var item = state.items[state.picked];
    if (!root || !item) return;

    var data = material(item);
    var seasons = seasonsOf(item);
    var episodes = episodesOf(item, state.season);
    var watch = watchOf(item.id) || {};
    var seen = watch.seen || [];
    var position = episodes.indexOf(state.episode);

    var meta = [item.year, data.anime_kind || data.kind, data.anime_status || data.all_status]
      .filter(Boolean)
      .map(function (value) { return '<span>' + escapeHtml(value) + '</span>'; })
      .join('');

    var genres = (data.anime_genres || data.genres || [])
      .map(function (genre) { return '<span class="chip">' + escapeHtml(genre) + '</span>'; })
      .join('');

    var seasonButtons = seasons.length > 1
      ? '<div class="kb-panel"><div class="kb-head"><span class="kb-title">Сезоны</span>' +
        '<span class="kb-count">' + seasons.length + '</span></div><div class="kb-list">' +
        seasons.map(function (number) {
          return '<button type="button" class="kb-btn' + (number === state.season ? ' active' : '') +
            '" data-season="' + number + '">' + number + '</button>';
        }).join('') + '</div></div>'
      : '';

    var episodeButtons = episodes.length > 1
      ? '<div class="kb-panel"><div class="kb-head"><span class="kb-title">Серии</span>' +
        '<span class="kb-count">' + episodes.length + ' всего</span></div>' +
        '<div class="kb-list" id="kbEpisodes">' +
        episodes.map(function (number) {
          var classes = 'kb-btn' + (number === state.episode ? ' active' : '') +
            (seen.indexOf(number) >= 0 ? ' seen' : '');
          return '<button type="button" class="' + classes + '" data-ep="' + number + '">' + number + '</button>';
        }).join('') + '</div></div>'
      : '';

    var voiceButtons = state.items.length > 1
      ? '<div class="kb-panel"><div class="kb-head"><span class="kb-title">Озвучка</span>' +
        '<span class="kb-count">' + state.items.length + ' вариантов</span></div>' +
        '<div class="kb-list wide" id="kbVoices">' +
        state.items.map(function (variant, index) {
          return '<button type="button" class="kb-btn' + (index === state.picked ? ' active' : '') +
            '" data-voice="' + index + '">' + escapeHtml(voiceOf(variant)) + '</button>';
        }).join('') + '</div></div>'
      : '';

    root.innerHTML =
      '<a class="link-btn back" href="#/kodik">← Каталог Kodik</a>' +
      '<div class="kb-hero">' +
      (posterOf(item) ? '<img class="kb-poster" alt="" src="' + escapeHtml(posterOf(item)) + '">' : '<span></span>') +
      '<div><h1>' + escapeHtml(nameOf(item)) + '</h1>' +
      '<div class="meta-row">' + meta + '<span>Источник: Kodik</span></div>' +
      (genres ? '<div class="chips">' + genres + '</div>' : '') +
      (data.description ? '<p class="kb-desc">' + escapeHtml(plainText(data.description)) + '</p>' : '') +
      '</div></div>' +
      '<iframe class="kb-frame" id="kbFrame" allow="autoplay; fullscreen; encrypted-media" allowfullscreen ' +
      'referrerpolicy="no-referrer" sandbox="' + SANDBOX + '" src="' +
      escapeHtml(frameUrl(item, state.season, state.episode)) + '"></iframe>' +
      '<p class="kb-note">' + escapeHtml(AD_NOTE) + '</p>' +
      '<div class="kb-bar"><span class="kb-ep-label">' +
      (episodes.length > 1 ? 'Серия ' + state.episode + ' из ' + episodes.length : 'Фильм') +
      (seasons.length > 1 ? ' · сезон ' + state.season : '') + '</span>' +
      '<span class="kb-nav">' +
      '<button type="button" class="btn btn-ghost" id="kbPrev"' + (position <= 0 ? ' disabled' : '') + '>Назад</button>' +
      '<button type="button" class="btn" id="kbNext"' +
      (position < 0 || position >= episodes.length - 1 ? ' disabled' : '') + '>Следующая серия</button>' +
      '</span></div>' +
      seasonButtons + episodeButtons + voiceButtons;

    saveWatch(item, state.season, state.episode);

    if (!root.dataset.bound) {
      root.dataset.bound = '1';
      root.addEventListener('click', function (event) {
        var current = state.items[state.picked];
        if (!current) return;

        var season = event.target.closest('[data-season]');
        if (season) {
          state.season = Number(season.dataset.season);
          state.episode = episodesOf(current, state.season)[0] || 1;
          mount();
          return;
        }
        var episode = event.target.closest('[data-ep]');
        if (episode) {
          state.episode = Number(episode.dataset.ep);
          mount();
          return;
        }
        var voice = event.target.closest('[data-voice]');
        if (voice) {
          state.picked = Number(voice.dataset.voice);
          var list = seasonsOf(state.items[state.picked]);
          state.season = list.indexOf(state.season) >= 0 ? state.season : (list[0] != null ? list[0] : null);
          mount();
          return;
        }
        var step = event.target.closest('#kbPrev, #kbNext');
        if (step && !step.disabled) {
          var all = episodesOf(current, state.season);
          var at = all.indexOf(state.episode);
          var target = step.id === 'kbNext' ? all[at + 1] : all[at - 1];
          if (target != null) {
            state.episode = target;
            mount();
          }
        }
      });
    }
  }

  function loadTitle(id) {
    var root = byId('kbRoot');
    if (root) root.innerHTML = '<p class="status">Загрузка…</p>';

    request('/search', { id: id, with_material_data: true, with_episodes_data: true })
      .then(function (json) {
        var found = (json.results || [])[0];
        if (!found) throw new Error('not found');
        var key = found.shikimori_id
          ? { shikimori_id: found.shikimori_id }
          : { title: nameOf(found), year: found.year };
        key.with_material_data = true;
        key.with_episodes_data = true;
        key.limit = 40;
        return request('/search', key)
          .then(function (all) {
            var list = (all.results || []).filter(function (row) { return row.link; });
            if (!list.length) list = [found];
            var at = list.findIndex(function (row) { return row.id === found.id; });
            state.items = list;
            state.picked = at >= 0 ? at : 0;
          })
          .catch(function () {
            state.items = [found];
            state.picked = 0;
          });
      })
      .then(function () {
        var item = state.items[state.picked];
        var seasons = seasonsOf(item);
        var saved = watchOf(item.id);
        state.season = saved && saved.season != null ? saved.season : (seasons[0] != null ? seasons[0] : null);
        var episodes = episodesOf(item, state.season);
        state.episode = saved && episodes.indexOf(saved.episode) >= 0 ? saved.episode : (episodes[0] || 1);
        mount();
      })
      .catch(function () {
        var node = byId('kbRoot');
        if (node) node.innerHTML = '<p class="status">Не удалось загрузить тайтл с Kodik.</p>';
      });
  }

  /* ---------------- маршрутизация ---------------- */

  function hideOtherViews() {
    Array.prototype.slice.call(document.querySelectorAll('#app > .view')).forEach(function (node) {
      if (node.id !== 'view-kodik') node.hidden = true;
    });
  }

  function apply() {
    var hash = location.hash || '';
    var view = buildView();
    var title = hash.match(/^#\/kodik\/([^?]+)/);
    var catalog = /^#\/kodik(\?|$)/.test(hash);

    if (!title && !catalog) {
      view.hidden = true;
      state.route = null;
      markNav(false);
      return;
    }

    hideOtherViews();
    view.hidden = false;
    markNav(true);
    window.scrollTo(0, 0);

    if (title) {
      var id = decodeURIComponent(title[1]);
      if (state.route === 'title:' + id) return;
      state.route = 'title:' + id;
      state.id = id;
      loadTitle(id);
      return;
    }

    if (state.route === 'catalog') return;
    state.route = 'catalog';
    renderCatalog();
  }

  function onRoute() {
    addNavLink();
    apply();
    var hash = location.hash || '';
    if (hash === '' || hash === '#/' || hash.indexOf('#/home') === 0) setTimeout(renderHome, 500);
    if (hash.indexOf('#/catalog') === 0) setTimeout(renderSearch, 400);
  }

  injectCss();
  window.addEventListener('hashchange', onRoute);
  setTimeout(onRoute, 600);

  window.AnimKodikBrowse = {
    open: function (id) { location.hash = '#/kodik/' + encodeURIComponent(id); },
    catalog: function () { location.hash = '#/kodik'; },
    watched: readWatch
  };
})();
