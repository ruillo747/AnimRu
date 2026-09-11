/* AnimRu — SPA на Anilibria API v1: главная с рельсами, топ, каталог с фильтрами,
   страница тайтла со своим плеером и профиль с боевым пропуском. */
(function () {
  'use strict';

  var API = 'https://anilibria.top/api/v1';
  var PAGE_SIZE = 30;
  var LS_WATCH = 'animru:watch';
  var LS_PREFS = 'animru:prefs';
  var G = window.Gamify;

  function $(id) {
    return document.getElementById(id);
  }

  var state = {
    tab: 'home',
    page: 1,
    hasMore: false,
    filters: emptyFilters(),
    title: null,
    episodes: [],
    epIndex: 0,
    quality: null,
    hls: null,
    suggestTimer: null,
    saveTimer: null,
    tickTimer: null,
    hideUiTimer: null,
    toastTimer: null,
    pToastTimer: null,
    epCounted: false
  };

  var prefs = Object.assign(
    { volume: 1, muted: false, rate: 1, quality: 'hls_720', autoNext: true },
    readJson(LS_PREFS, {})
  );

  var refs = { genres: [], years: [], types: [], ageRatings: [], loaded: false };

  /* ---------------- утилиты ---------------- */

  function emptyFilters() {
    return { q: '', genres: [], types: [], ageRatings: [], yearFrom: '', yearTo: '', sorting: 'FRESH_AT_DESC' };
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* приватный режим — просто не сохраняем */
    }
  }

  function savePrefs() {
    writeJson(LS_PREFS, prefs);
  }

  function getWatch() {
    var map = readJson(LS_WATCH, {});
    return map && typeof map === 'object' ? map : {};
  }

  function saveWatch(map) {
    var keys = Object.keys(map).sort(function (a, b) {
      return (map[b].at || 0) - (map[a].at || 0);
    });
    var trimmed = {};
    keys.slice(0, 24).forEach(function (k) {
      trimmed[k] = map[k];
    });
    writeJson(LS_WATCH, trimmed);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtTime(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function toast(text) {
    var box = $('toast');
    if (!box) return;
    box.textContent = text;
    box.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      box.hidden = true;
    }, 3200);
  }

  /* ---------------- API ---------------- */

  function apiFetch(path, params) {
    var url = new URL(API + path);
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value == null || value === '') return;
      if (Array.isArray(value)) {
        value.forEach(function (item, i) {
          url.searchParams.set(key + '[' + i + ']', item);
        });
      } else {
        url.searchParams.set(key, value);
      }
    });
    return fetch(url.toString(), { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function normalizeList(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.data)) return json.data;
    return [];
  }

  function loadRefs() {
    if (refs.loaded) return Promise.resolve(refs);
    function safe(path) {
      return apiFetch(path).catch(function () {
        return [];
      });
    }
    return Promise.all([
      safe('/anime/catalog/references/genres'),
      safe('/anime/catalog/references/years'),
      safe('/anime/catalog/references/types'),
      safe('/anime/catalog/references/age-ratings')
    ]).then(function (parts) {
      refs.genres = normalizeList(parts[0]);
      refs.years = normalizeList(parts[1]);
      refs.types = normalizeList(parts[2]);
      refs.ageRatings = normalizeList(parts[3]);
      refs.loaded = true;
      return refs;
    });
  }

  function getLatest(limit) {
    return apiFetch('/anime/releases/latest', { limit: limit || 20 }).then(normalizeList);
  }

  function getCatalog(params) {
    return apiFetch('/anime/catalog/releases', params).then(function (json) {
      return { items: normalizeList(json), meta: (json && json.meta) || null };
    });
  }

  function getTitle(id) {
    return apiFetch('/anime/releases/' + encodeURIComponent(id));
  }

  function getRandom() {
    return apiFetch('/anime/releases/random', { limit: PAGE_SIZE }).then(normalizeList);
  }

  /* ---------------- карточки ---------------- */

  var NO_POSTER =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect fill="#1c2027" width="200" height="300"/><text x="100" y="152" font-family="sans-serif" font-size="13" fill="#6f7885" text-anchor="middle">Нет постера</text></svg>'
    );

  function posterUrl(t) {
    var p = t && t.poster;
    var src = (p && ((p.optimized && p.optimized.src) || p.src)) || '';
    if (!src) return NO_POSTER;
    return /^https?:/.test(src) ? src : 'https://anilibria.top' + src;
  }

  function titleName(t) {
    return (t && t.name && (t.name.main || t.name.english)) || 'Без названия';
  }

  function statusName(t) {
    if (!t) return '';
    if (t.is_ongoing) return 'Онгоинг';
    if (t.is_in_production) return 'В производстве';
    return (t.type && t.type.description) || '';
  }

  function subLine(t) {
    var bits = [];
    if (t.year) bits.push(t.year);
    if (t.type && t.type.description) bits.push(t.type.description);
    if (t.episodes_total) bits.push(t.episodes_total + ' эп.');
    return bits.join(' · ');
  }

  function cardHtml(t) {
    var badge = statusName(t);
    return (
      '<a class="card" href="#/title/' + encodeURIComponent(t.id) + '">' +
      '<div class="card-poster"><img src="' + escapeHtml(posterUrl(t)) + '" alt="" loading="lazy">' +
      (badge ? '<span class="card-badge">' + escapeHtml(badge) + '</span>' : '') +
      '</div><div class="card-body">' +
      '<div class="card-title">' + escapeHtml(titleName(t)) + '</div>' +
      '<div class="card-sub">' + escapeHtml(subLine(t)) + '</div>' +
      '</div></a>'
    );
  }

  function railCardHtml(t, sub) {
    return (
      '<a class="card" href="#/title/' + encodeURIComponent(t.id) + '">' +
      '<div class="card-poster"><img src="' + escapeHtml(posterUrl(t)) + '" alt="" loading="lazy"></div>' +
      '<div class="card-body">' +
      '<div class="card-title">' + escapeHtml(titleName(t)) + '</div>' +
      '<div class="card-sub">' + escapeHtml(sub == null ? subLine(t) : sub) + '</div>' +
      '</div></a>'
    );
  }

  function topRowHtml(t, rank) {
    var score = t.rating != null ? Number(t.rating).toFixed(1) : '';
    var href = '#/title/' + encodeURIComponent(t.id);
    return (
      '<li class="top-row' + (rank <= 3 ? ' lead' : '') + '">' +
      '<span class="top-rank">' + rank + '</span>' +
      '<a href="' + href + '"><img src="' + escapeHtml(posterUrl(t)) + '" alt="" loading="lazy"></a>' +
      '<span><a class="top-name" href="' + href + '">' + escapeHtml(titleName(t)) + '</a>' +
      '<span class="top-sub">' + escapeHtml(subLine(t)) + '</span></span>' +
      '<span class="top-score">' + escapeHtml(score) + '</span></li>'
    );
  }

  function renderSkeleton(node, count, kind) {
    if (!node) return;
    var out = [];
    for (var i = 0; i < count; i += 1) {
      out.push(
        kind === 'row'
          ? '<div class="skeleton" style="height:60px;margin-bottom:6px"></div>'
          : '<div><div class="skeleton" style="aspect-ratio:2/3"></div><div class="skeleton" style="height:14px;margin-top:8px"></div></div>'
      );
    }
    node.innerHTML = out.join('');
  }

  /* ---------------- главная ---------------- */

  function renderPass() {
    var box = $('passCard');
    if (!box || !G) return;
    var s = G.state();
    var next = G.nextReward();
    box.innerHTML =
      '<div class="pass-main">' +
      '<p class="pass-kicker">Боевой пропуск «Нулевой слой»</p>' +
      '<p class="pass-title">Уровень <b>' + s.level + '</b> из ' + G.MAX_LEVEL + ' · ' + s.into + ' / ' + s.need + ' XP</p>' +
      '<div class="progress-line"><i style="width:' + s.pct + '%"></i></div>' +
      '<p class="pass-next">' +
      (next
        ? 'Дальше: ' + escapeHtml(next.name) + ' — ' + escapeHtml(G.KIND_NAME[next.kind]) + ', уровень ' + next.level
        : 'Все ' + s.stats.total + ' предметов собраны') +
      '</p></div>' +
      '<div class="pass-side"><a class="btn btn-ghost" href="#/profile">Профиль</a></div>';
  }

  function renderContinue() {
    var block = $('continueBlock');
    var rail = $('continueRail');
    if (!block || !rail) return;
    var map = getWatch();
    var items = Object.keys(map)
      .map(function (key) {
        return map[key];
      })
      .filter(function (item) {
        return item && item.titleId && item.duration > 0;
      })
      .sort(function (a, b) {
        return (b.at || 0) - (a.at || 0);
      })
      .slice(0, 12);

    if (!items.length) {
      block.hidden = true;
      return;
    }
    block.hidden = false;
    rail.innerHTML = items
      .map(function (item) {
        var pct = Math.min(100, Math.round((item.position / item.duration) * 100));
        return (
          '<a class="rail-card" href="#/title/' + encodeURIComponent(item.titleId) + '">' +
          '<img src="' + escapeHtml(item.poster || NO_POSTER) + '" alt="" loading="lazy">' +
          '<span class="rail-body">' +
          '<span class="rail-title">' + escapeHtml(item.name || 'Тайтл') + '</span>' +
          '<span class="rail-sub">Серия ' + escapeHtml(item.episode) + ' · ' + fmtTime(item.position) + '</span>' +
          '<span class="progress-line"><i style="width:' + pct + '%"></i></span>' +
          '</span></a>'
        );
      })
      .join('');
  }

  function loadHome() {
    renderPass();
    renderContinue();

    var railOngoing = $('railOngoing');
    var railNew = $('railNew');
    var railPopular = $('railPopular');
    var preview = $('topPreview');
    renderSkeleton(railOngoing, 8);
    renderSkeleton(railNew, 8);
    renderSkeleton(railPopular, 8);
    renderSkeleton(preview, 5, 'row');

    getCatalog({ 'f[sorting]': 'FRESH_AT_DESC', page: 1, limit: 24 })
      .then(function (res) {
        var ongoing = res.items.filter(function (t) {
          return t.is_ongoing;
        });
        railOngoing.innerHTML = (ongoing.length ? ongoing : res.items)
          .slice(0, 18)
          .map(function (t) {
            return railCardHtml(t);
          })
          .join('');
      })
      .catch(function () {
        railOngoing.innerHTML = '<p class="muted small">Не удалось загрузить онгоинги.</p>';
      });

    getLatest(18)
      .then(function (items) {
        railNew.innerHTML = items
          .map(function (t) {
            return railCardHtml(t, t.episodes_total ? t.episodes_total + ' эп.' : subLine(t));
          })
          .join('');
      })
      .catch(function () {
        railNew.innerHTML = '<p class="muted small">Не удалось загрузить новые серии.</p>';
      });

    getCatalog({ 'f[sorting]': 'RATING_DESC', page: 1, limit: 30 })
      .then(function (res) {
        railPopular.innerHTML = res.items
          .slice(0, 18)
          .map(function (t) {
            return railCardHtml(t);
          })
          .join('');
        preview.innerHTML = res.items
          .slice(0, 10)
          .map(function (t, i) {
            return topRowHtml(t, i + 1);
          })
          .join('');
      })
      .catch(function () {
        railPopular.innerHTML = '<p class="muted small">Не удалось загрузить популярное.</p>';
        preview.innerHTML = '';
      });
  }

  /* ---------------- топ-100 ---------------- */

  function loadTop() {
    var list = $('topList');
    var grid = $('grid');
    var status = $('listStatus');
    grid.innerHTML = '';
    list.hidden = false;
    status.textContent = '';
    renderSkeleton(list, 10, 'row');

    Promise.all([
      getCatalog({ 'f[sorting]': 'RATING_DESC', page: 1, limit: 50 }),
      getCatalog({ 'f[sorting]': 'RATING_DESC', page: 2, limit: 50 })
    ])
      .then(function (parts) {
        var items = parts[0].items.concat(parts[1].items).slice(0, 100);
        if (!items.length) {
          list.innerHTML = '';
          status.textContent = 'Топ пока недоступен.';
          return;
        }
        list.innerHTML = items
          .map(function (t, i) {
            return topRowHtml(t, i + 1);
          })
          .join('');
      })
      .catch(function () {
        list.innerHTML = '';
        status.textContent = 'Не удалось загрузить топ.';
      });
  }

  /* ---------------- фильтры и каталог ---------------- */

  var SORTINGS = [
    ['FRESH_AT_DESC', 'Сначала свежие'],
    ['RATING_DESC', 'По рейтингу'],
    ['YEAR_DESC', 'Год: новые сначала'],
    ['YEAR_ASC', 'Год: старые сначала']
  ];

  function filtersToHash(f) {
    var parts = [];
    if (f.q) parts.push('q=' + encodeURIComponent(f.q));
    if (f.sorting && f.sorting !== 'FRESH_AT_DESC') parts.push('sort=' + f.sorting);
    if (f.yearFrom) parts.push('yf=' + f.yearFrom);
    if (f.yearTo) parts.push('yt=' + f.yearTo);
    if (f.genres.length) parts.push('g=' + f.genres.join(','));
    if (f.types.length) parts.push('t=' + f.types.join(','));
    if (f.ageRatings.length) parts.push('a=' + f.ageRatings.join(','));
    return '#/catalog' + (parts.length ? '?' + parts.join('&') : '');
  }

  function hashToFilters(query) {
    var f = emptyFilters();
    if (!query) return f;
    query.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i === -1) return;
      var key = pair.slice(0, i);
      var value = decodeURIComponent(pair.slice(i + 1));
      if (key === 'q') f.q = value;
      if (key === 'sort') f.sorting = value;
      if (key === 'yf') f.yearFrom = value;
      if (key === 'yt') f.yearTo = value;
      if (key === 'g') f.genres = value.split(',').filter(Boolean);
      if (key === 't') f.types = value.split(',').filter(Boolean);
      if (key === 'a') f.ageRatings = value.split(',').filter(Boolean);
    });
    return f;
  }

  function optionValue(item) {
    return item && (item.value != null ? item.value : item.id);
  }

  function optionLabel(item) {
    return (item && (item.description || item.name || item.label || item.value)) || '';
  }

  function chipsHtml(items, selected) {
    return items
      .map(function (item) {
        var value = String(optionValue(item));
        var active = selected.indexOf(value) !== -1 ? ' active' : '';
        return (
          '<button type="button" class="f-chip' + active + '" data-val="' + escapeHtml(value) + '">' +
          escapeHtml(optionLabel(item)) +
          '</button>'
        );
      })
      .join('');
  }

  function renderFilters() {
    var box = $('filterBar');
    if (!box) return;
    var f = state.filters;
    var years = refs.years
      .map(function (y) {
        return String(optionValue(y) || y);
      })
      .filter(Boolean);

    box.innerHTML =
      '<div class="f-group"><label class="f-label" for="fSort">Сортировка</label>' +
      '<select class="f-select" id="fSort">' +
      SORTINGS.map(function (s) {
        return '<option value="' + s[0] + '"' + (f.sorting === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('') +
      '</select></div>' +
      '<div class="f-group"><span class="f-label">Год</span><div class="f-years">' +
      '<select class="f-select" id="fYearFrom"><option value="">от</option>' +
      years
        .map(function (y) {
          return '<option value="' + y + '"' + (String(f.yearFrom) === y ? ' selected' : '') + '>' + y + '</option>';
        })
        .join('') +
      '</select><span class="muted">—</span>' +
      '<select class="f-select" id="fYearTo"><option value="">до</option>' +
      years
        .map(function (y) {
          return '<option value="' + y + '"' + (String(f.yearTo) === y ? ' selected' : '') + '>' + y + '</option>';
        })
        .join('') +
      '</select></div></div>' +
      '<div class="f-group"><span class="f-label">Тип</span><div class="f-chips" id="fTypes">' +
      chipsHtml(refs.types, f.types) +
      '</div></div>' +
      '<div class="f-group"><span class="f-label">Возрастной рейтинг</span><div class="f-chips" id="fAge">' +
      chipsHtml(refs.ageRatings, f.ageRatings) +
      '</div></div>' +
      '<div class="f-group"><span class="f-label">Жанры</span><div class="f-chips f-scroll" id="fGenres">' +
      chipsHtml(refs.genres, f.genres) +
      '</div></div>' +
      '<div class="f-actions"><button class="btn btn-ghost" id="fReset">Сбросить</button></div>';

    $('fSort').addEventListener('change', function (e) {
      state.filters.sorting = e.target.value;
      applyFilters();
    });
    $('fYearFrom').addEventListener('change', function (e) {
      state.filters.yearFrom = e.target.value;
      applyFilters();
    });
    $('fYearTo').addEventListener('change', function (e) {
      state.filters.yearTo = e.target.value;
      applyFilters();
    });
    bindChips($('fTypes'), 'types');
    bindChips($('fAge'), 'ageRatings');
    bindChips($('fGenres'), 'genres');
    $('fReset').addEventListener('click', function () {
      state.filters = emptyFilters();
      applyFilters();
    });
  }

  function bindChips(box, key) {
    if (!box) return;
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('.f-chip');
      if (!btn) return;
      var value = btn.dataset.val;
      var list = state.filters[key];
      var i = list.indexOf(value);
      if (i === -1) list.push(value);
      else list.splice(i, 1);
      btn.classList.toggle('active');
      applyFilters();
    });
  }

  function applyFilters() {
    if (G) G.onCatalogFilter();
    location.hash = filtersToHash(state.filters);
  }

  function labelFor(list, value) {
    var found = list.filter(function (item) {
      return String(optionValue(item)) === String(value);
    })[0];
    return found ? optionLabel(found) : value;
  }

  function renderActiveFilters() {
    var box = $('activeFilters');
    if (!box) return;
    var f = state.filters;
    var tags = [];

    function tag(text, kind, value) {
      tags.push(
        '<span class="af-tag">' + escapeHtml(text) +
        '<button type="button" data-kind="' + kind + '" data-val="' + escapeHtml(value) + '" aria-label="Убрать">×</button></span>'
      );
    }

    if (f.q) tag('Поиск: ' + f.q, 'q', '');
    if (f.yearFrom) tag('С ' + f.yearFrom, 'yearFrom', '');
    if (f.yearTo) tag('По ' + f.yearTo, 'yearTo', '');
    f.types.forEach(function (v) {
      tag(labelFor(refs.types, v), 'types', v);
    });
    f.ageRatings.forEach(function (v) {
      tag(labelFor(refs.ageRatings, v), 'ageRatings', v);
    });
    f.genres.forEach(function (v) {
      tag(labelFor(refs.genres, v), 'genres', v);
    });

    box.innerHTML = tags.join('');
    box.hidden = !tags.length;
  }

  function catalogParams(page) {
    var f = state.filters;
    return {
      page: page,
      limit: PAGE_SIZE,
      'f[search]': f.q,
      'f[sorting]': f.sorting,
      'f[genres]': f.genres,
      'f[types]': f.types,
      'f[age_ratings]': f.ageRatings,
      'f[years][from_year]': f.yearFrom,
      'f[years][to_year]': f.yearTo
    };
  }

  function loadList(tab, page, append) {
    var grid = $('grid');
    var status = $('listStatus');
    var list = $('topList');
    if (list) list.hidden = true;
    status.textContent = '';
    if (!append) renderSkeleton(grid, 12);

    var request;
    if (tab === 'random') request = getRandom().then(function (items) {
      return { items: items, meta: null };
    });
    else request = getCatalog(catalogParams(page));

    request
      .then(function (res) {
        var items = res.items;
        var html = items.map(cardHtml).join('');
        if (append) grid.insertAdjacentHTML('beforeend', html);
        else grid.innerHTML = html;

        if (!items.length && !append) {
          status.textContent = 'Ничего не нашлось. Попробуйте ослабить фильтры.';
        }
        state.hasMore = tab === 'catalog' && items.length === PAGE_SIZE;
        $('loadMoreWrap').hidden = !state.hasMore;
      })
      .catch(function () {
        if (!append) grid.innerHTML = '';
        status.textContent = 'Не удалось загрузить список. Проверьте соединение.';
        $('loadMoreWrap').hidden = true;
      });
  }

  /* ---------------- поиск с подсказками ---------------- */

  function hideSuggest() {
    var box = $('suggestBox');
    if (box) box.hidden = true;
  }

  function renderSuggest(items) {
    var box = $('suggestBox');
    if (!box) return;
    if (!items.length) {
      box.hidden = true;
      return;
    }
    box.innerHTML = items
      .slice(0, 8)
      .map(function (t) {
        return (
          '<a class="sug-item" href="#/title/' + encodeURIComponent(t.id) + '">' +
          '<img class="sug-poster" src="' + escapeHtml(posterUrl(t)) + '" alt="" loading="lazy">' +
          '<span class="sug-body"><span class="sug-title">' + escapeHtml(titleName(t)) + '</span>' +
          '<span class="sug-sub">' + escapeHtml(subLine(t)) + '</span></span></a>'
        );
      })
      .join('');
    box.hidden = false;
  }

  function initSearch() {
    var form = $('searchForm');
    var input = $('searchInput');
    if (!form || !input) return;

    input.addEventListener('input', function () {
      var value = input.value.trim();
      clearTimeout(state.suggestTimer);
      if (value.length < 2) {
        hideSuggest();
        return;
      }
      state.suggestTimer = setTimeout(function () {
        getCatalog({ 'f[search]': value, limit: 8, page: 1 })
          .then(function (res) {
            renderSuggest(res.items);
          })
          .catch(hideSuggest);
      }, 220);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideSuggest();
      var f = emptyFilters();
      f.q = input.value.trim();
      state.filters = f;
      location.hash = filtersToHash(f);
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-wrap')) hideSuggest();
    });
  }

  /* ---------------- страница тайтла ---------------- */

  var QUALITIES = [
    ['hls_1080', '1080p'],
    ['hls_720', '720p'],
    ['hls_480', '480p']
  ];

  function episodeSources(ep) {
    return QUALITIES.filter(function (q) {
      return ep && ep[q[0]];
    }).map(function (q) {
      return { key: q[0], label: q[1], url: ep[q[0]] };
    });
  }

  function watchKey(titleId, episodeId) {
    return String(titleId) + ':' + String(episodeId);
  }

  function episodeProgress(ep) {
    if (!state.title || !ep) return null;
    var map = getWatch();
    return map[watchKey(state.title.id, ep.id != null ? ep.id : ep.ordinal)] || null;
  }

  function renderEpisodes() {
    var box = $('episodes');
    var count = $('epCount');
    if (!box) return;
    count.textContent = state.episodes.length
      ? state.episodes.length + ' всего'
      : '';

    box.innerHTML = state.episodes
      .map(function (ep, i) {
        var progress = episodeProgress(ep);
        var seen = progress && progress.duration && progress.position / progress.duration > 0.9;
        var num = ep.ordinal != null ? ep.ordinal : i + 1;
        return (
          '<button class="ep-btn' + (i === state.epIndex ? ' active' : '') + '" data-i="' + i + '">' +
          '<span class="ep-num">' + escapeHtml(num) + '</span>' +
          '<span class="ep-name">' + escapeHtml(ep.name || 'Серия ' + num) + '</span>' +
          (seen ? '<span class="ep-seen">просмотрено</span>' : '') +
          '</button>'
        );
      })
      .join('');

    box.querySelectorAll('.ep-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectEpisode(Number(btn.dataset.i), true);
      });
    });
  }

  function renderQualityMenu() {
    var menu = $('pQualityMenu');
    var ep = state.episodes[state.epIndex];
    if (!menu || !ep) return;
    var sources = episodeSources(ep);
    menu.innerHTML = sources
      .map(function (s) {
        return (
          '<button type="button" data-q="' + s.key + '"' + (s.key === state.quality ? ' class="active"' : '') + '>' +
          s.label + '</button>'
        );
      })
      .join('');
    menu.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var video = $('player');
        var at = video ? video.currentTime : 0;
        var playing = video && !video.paused;
        state.quality = btn.dataset.q;
        prefs.quality = state.quality;
        savePrefs();
        menu.hidden = true;
        updateQualityLabel();
        loadStream(at, playing);
      });
    });
  }

  function updateQualityLabel() {
    var btn = $('pQualityBtn');
    if (!btn) return;
    var found = QUALITIES.filter(function (q) {
      return q[0] === state.quality;
    })[0];
    btn.textContent = found ? found[1] : 'Авто';
  }

  function pickQuality(ep) {
    var sources = episodeSources(ep);
    if (!sources.length) return null;
    var preferred = sources.filter(function (s) {
      return s.key === prefs.quality;
    })[0];
    return (preferred || sources[0]).key;
  }

  function loadStream(startAt, autoplay) {
    var video = $('player');
    var ep = state.episodes[state.epIndex];
    if (!video || !ep) return;
    var source = episodeSources(ep).filter(function (s) {
      return s.key === state.quality;
    })[0];
    if (!source) {
      pToast('У этой серии нет доступного потока');
      return;
    }

    showLoader(true);
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }

    function afterReady() {
      if (startAt > 0) {
        try {
          video.currentTime = startAt;
        } catch (e) {
          /* некоторые браузеры не дают сетить сразу */
        }
      }
      if (autoplay) {
        var promise = video.play();
        if (promise && promise.catch) promise.catch(function () {});
      }
    }

    if (window.Hls && window.Hls.isSupported()) {
      var hls = new window.Hls({ maxBufferLength: 30 });
      state.hls = hls;
      hls.loadSource(source.url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        showLoader(false);
        afterReady();
      });
      hls.on(window.Hls.Events.ERROR, function (evt, data) {
        if (data && data.fatal) {
          showLoader(false);
          pToast('Ошибка потока, попробуйте другое качество');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source.url;
      video.addEventListener('loadedmetadata', function once() {
        video.removeEventListener('loadedmetadata', once);
        showLoader(false);
        afterReady();
      });
    } else {
      showLoader(false);
      pToast('Браузер не поддерживает HLS');
    }
  }

  function selectEpisode(index, autoplay) {
    if (index < 0 || index >= state.episodes.length) return;
    persistProgress(true);
    state.epIndex = index;
    state.epCounted = false;
    var ep = state.episodes[index];
    state.quality = pickQuality(ep);
    updateQualityLabel();
    renderQualityMenu();
    renderEpisodes();

    var num = ep.ordinal != null ? ep.ordinal : index + 1;
    $('epLabel').textContent = 'Серия ' + num + (ep.name ? ' · ' + ep.name : '');
    $('pPrevEp').disabled = index === 0;
    $('pNextEp').disabled = index === state.episodes.length - 1;

    var saved = episodeProgress(ep);
    var startAt = saved && saved.duration && saved.position / saved.duration < 0.95 ? saved.position : 0;
    loadStream(startAt, autoplay);
  }

  function loadTitle(id) {
    showView('view-title');
    getTitle(id)
      .then(function (t) {
        state.title = t;
        state.episodes = Array.isArray(t.episodes)
          ? t.episodes.slice().sort(function (a, b) {
              return (a.sort_order || a.ordinal || 0) - (b.sort_order || b.ordinal || 0);
            })
          : [];

        document.title = titleName(t) + ' — AnimRu';
        $('tHeroBg').style.backgroundImage = 'url("' + posterUrl(t) + '")';
        $('tPoster').src = posterUrl(t);
        $('tPoster').alt = titleName(t);
        $('tName').textContent = titleName(t);
        $('tNameEn').textContent = (t.name && t.name.english) || '';

        var meta = [];
        if (t.year) meta.push('<span>' + escapeHtml(t.year) + '</span>');
        if (t.season && t.season.description) meta.push('<span>' + escapeHtml(t.season.description) + '</span>');
        if (t.type && t.type.description) meta.push('<span>' + escapeHtml(t.type.description) + '</span>');
        if (t.age_rating && t.age_rating.label) meta.push('<span>' + escapeHtml(t.age_rating.label) + '</span>');
        if (t.episodes_total) meta.push('<span>' + escapeHtml(t.episodes_total) + ' эп.</span>');
        if (t.is_ongoing) meta.push('<span><strong>Онгоинг</strong></span>');
        $('tMeta').innerHTML = meta.join('');

        $('tGenres').innerHTML = (t.genres || [])
          .map(function (g) {
            return '<span class="chip">' + escapeHtml(g.name) + '</span>';
          })
          .join('');
        $('tDesc').textContent = t.description || '';

        if (G) G.onTitleOpen(t.id);

        if (!state.episodes.length) {
          $('epLabel').textContent = 'Серий пока нет';
          $('episodes').innerHTML = '<p class="muted small">Серии ещё не выложены.</p>';
          return;
        }

        var map = getWatch();
        var startIndex = 0;
        var newest = 0;
        state.episodes.forEach(function (ep, i) {
          var rec = map[watchKey(t.id, ep.id != null ? ep.id : ep.ordinal)];
          if (rec && (rec.at || 0) > newest) {
            newest = rec.at || 0;
            startIndex = i;
          }
        });
        selectEpisode(startIndex, false);
      })
      .catch(function () {
        showError('Не удалось загрузить тайтл. Возможно, он удалён или источник недоступен.');
      });
  }

  /* ---------------- плеер ---------------- */

  function showLoader(on) {
    var loader = $('pLoader');
    if (loader) loader.hidden = !on;
  }

  function pToast(text) {
    var box = $('pToast');
    if (!box) return;
    box.textContent = text;
    box.hidden = false;
    clearTimeout(state.pToastTimer);
    state.pToastTimer = setTimeout(function () {
      box.hidden = true;
    }, 1600);
  }

  function closeMenus() {
    ['pSpeedMenu', 'pQualityMenu'].forEach(function (id) {
      var menu = $(id);
      if (menu) menu.hidden = true;
    });
  }

  function togglePlay() {
    var video = $('player');
    if (!video) return;
    if (video.paused) video.play().catch(function () {});
    else video.pause();
  }

  function seekBy(delta) {
    var video = $('player');
    if (!video || !isFinite(video.duration)) return;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta));
    pToast((delta > 0 ? '+' : '−') + Math.abs(delta) + ' с');
  }

  function setVolume(value) {
    var video = $('player');
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, value));
    video.muted = video.volume === 0;
    prefs.volume = video.volume;
    prefs.muted = video.muted;
    savePrefs();
    syncVolumeUi();
  }

  function syncVolumeUi() {
    var video = $('player');
    var slider = $('pVol');
    var btn = $('pMute');
    if (!video || !slider || !btn) return;
    slider.value = video.muted ? 0 : video.volume;
    btn.querySelector('.i-vol').hidden = video.muted || video.volume === 0;
    btn.querySelector('.i-muted').hidden = !(video.muted || video.volume === 0);
  }

  function toggleFullscreen() {
    var root = $('playerRoot');
    if (!root) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen().catch(function () {});
  }

  function scheduleHideUi() {
    var root = $('playerRoot');
    var video = $('player');
    if (!root || !video) return;
    root.classList.remove('hide-ui');
    clearTimeout(state.hideUiTimer);
    state.hideUiTimer = setTimeout(function () {
      if (!video.paused) root.classList.add('hide-ui');
    }, 2600);
  }

  function persistProgress(force) {
    var video = $('player');
    var ep = state.episodes[state.epIndex];
    if (!video || !ep || !state.title || !isFinite(video.duration) || video.duration <= 0) return;
    if (!force && video.paused) return;
    var map = getWatch();
    map[watchKey(state.title.id, ep.id != null ? ep.id : ep.ordinal)] = {
      titleId: state.title.id,
      name: titleName(state.title),
      poster: posterUrl(state.title),
      episode: ep.ordinal != null ? ep.ordinal : state.epIndex + 1,
      position: Math.floor(video.currentTime),
      duration: Math.floor(video.duration),
      at: Date.now()
    };
    saveWatch(map);
  }

  function seekFromEvent(e) {
    var video = $('player');
    var seek = $('pSeek');
    if (!video || !seek || !isFinite(video.duration)) return;
    var rect = seek.getBoundingClientRect();
    var ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
  }

  function initPlayer() {
    var video = $('player');
    var root = $('playerRoot');
    if (!video || !root) return;

    video.volume = prefs.volume;
    video.muted = prefs.muted;
    video.playbackRate = prefs.rate;
    syncVolumeUi();

    var speedMenu = $('pSpeedMenu');
    speedMenu.innerHTML = [0.5, 0.75, 1, 1.25, 1.5, 2]
      .map(function (rate) {
        return '<button type="button" data-r="' + rate + '"' + (rate === prefs.rate ? ' class="active"' : '') + '>' + rate + '×</button>';
      })
      .join('');
    $('pSpeedBtn').textContent = prefs.rate + '×';

    speedMenu.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        prefs.rate = Number(btn.dataset.r);
        savePrefs();
        video.playbackRate = prefs.rate;
        $('pSpeedBtn').textContent = prefs.rate + '×';
        speedMenu.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        speedMenu.hidden = true;
      });
    });

    $('pSpeedBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var hidden = speedMenu.hidden;
      closeMenus();
      speedMenu.hidden = !hidden;
    });
    $('pQualityBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = $('pQualityMenu');
      var hidden = menu.hidden;
      closeMenus();
      menu.hidden = !hidden;
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.p-select')) closeMenus();
    });

    $('pPlay').addEventListener('click', togglePlay);
    $('pBigPlay').addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);
    $('pPrevEp').addEventListener('click', function () {
      selectEpisode(state.epIndex - 1, true);
    });
    $('pNextEp').addEventListener('click', function () {
      selectEpisode(state.epIndex + 1, true);
    });
    $('pMute').addEventListener('click', function () {
      video.muted = !video.muted;
      prefs.muted = video.muted;
      savePrefs();
      syncVolumeUi();
    });
    $('pVol').addEventListener('input', function (e) {
      setVolume(Number(e.target.value));
    });
    $('pPip').addEventListener('click', function () {
      if (document.pictureInPictureElement) document.exitPictureInPicture();
      else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function () {
        pToast('Картинка в картинке недоступна');
      });
    });
    $('pFull').addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', function () {
      root.classList.toggle('is-fullscreen', !!document.fullscreenElement);
    });

    var seek = $('pSeek');
    seek.addEventListener('click', seekFromEvent);
    seek.addEventListener('mousemove', function (e) {
      if (!isFinite(video.duration)) return;
      var rect = seek.getBoundingClientRect();
      var ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      var tip = $('pTip');
      tip.hidden = false;
      tip.style.left = ratio * rect.width + 'px';
      tip.textContent = fmtTime(ratio * video.duration);
    });
    seek.addEventListener('mouseleave', function () {
      $('pTip').hidden = true;
    });

    video.addEventListener('play', function () {
      root.classList.add('playing');
      $('pPlay').querySelector('.i-play').hidden = true;
      $('pPlay').querySelector('.i-pause').hidden = false;
      scheduleHideUi();
    });
    video.addEventListener('pause', function () {
      root.classList.remove('playing', 'hide-ui');
      $('pPlay').querySelector('.i-play').hidden = false;
      $('pPlay').querySelector('.i-pause').hidden = true;
      persistProgress(true);
    });
    video.addEventListener('waiting', function () {
      showLoader(true);
    });
    video.addEventListener('playing', function () {
      showLoader(false);
    });
    video.addEventListener('volumechange', syncVolumeUi);
    video.addEventListener('loadedmetadata', function () {
      $('pDur').textContent = fmtTime(video.duration);
    });

    video.addEventListener('timeupdate', function () {
      if (!isFinite(video.duration) || video.duration <= 0) return;
      var ratio = video.currentTime / video.duration;
      $('pPlayed').style.width = ratio * 100 + '%';
      $('pCur').textContent = fmtTime(video.currentTime);
      $('pSeek').setAttribute('aria-valuenow', Math.round(ratio * 100));
      if (video.buffered.length) {
        $('pBuffer').style.width = (video.buffered.end(video.buffered.length - 1) / video.duration) * 100 + '%';
      }
      if (!state.epCounted && ratio > 0.9) {
        state.epCounted = true;
        if (G && state.title) G.onEpisodeDone(state.title.id);
        renderEpisodes();
      }
    });

    video.addEventListener('ended', function () {
      persistProgress(true);
      if ($('autoNext').checked && state.epIndex < state.episodes.length - 1) {
        selectEpisode(state.epIndex + 1, true);
      }
    });

    root.addEventListener('mousemove', scheduleHideUi);
    root.addEventListener('keydown', function (e) {
      var key = e.key.toLowerCase();
      if (key === ' ' || key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        seekBy(5);
      } else if (e.key === 'ArrowLeft') {
        seekBy(-5);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume(video.volume + 0.1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume(video.volume - 0.1);
      } else if (key === 'f') {
        toggleFullscreen();
      } else if (key === 'm') {
        video.muted = !video.muted;
        syncVolumeUi();
      } else if (key === 'n') {
        selectEpisode(state.epIndex + 1, true);
      } else if (key === 'p') {
        selectEpisode(state.epIndex - 1, true);
      }
    });

    $('autoNext').checked = prefs.autoNext;
    $('autoNext').addEventListener('change', function (e) {
      prefs.autoNext = e.target.checked;
      savePrefs();
    });

    clearInterval(state.saveTimer);
    state.saveTimer = setInterval(function () {
      persistProgress(false);
    }, 5000);

    clearInterval(state.tickTimer);
    state.tickTimer = setInterval(function () {
      if (!video.paused && !video.ended && G) G.onWatchSeconds(5);
    }, 5000);
  }

  /* ---------------- профиль и боевой пропуск ---------------- */

  function updateLvlChip() {
    if (!G) return;
    var s = G.state();
    var num = $('lvlChipNum');
    var bar = $('lvlChipBar');
    if (num) num.textContent = s.level;
    if (bar) bar.style.width = s.pct + '%';
  }

  function renderProfile() {
    if (!G) return;
    var s = G.state();
    var card = $('pfCard');
    var avatar = $('pfAvatar');
    var glyph = $('pfAvatarGlyph');
    var titleItem = G.equipped('title');
    var frameItem = G.equipped('frame');
    var avatarItem = G.equipped('avatar');
    var bgItem = G.equipped('background');

    card.className = 'pf-card' + (bgItem ? ' bg-' + bgItem.value : '');
    avatar.className = 'pf-avatar' + (frameItem ? ' frame-' + frameItem.value : '');
    glyph.textContent = avatarItem ? avatarItem.value : 'ア';
    $('pfTitle').textContent = titleItem ? titleItem.value : 'Без титула';
    $('pfLevel').textContent = s.level;
    $('pfXp').textContent = s.into + ' / ' + s.need + ' XP';
    $('pfBar').style.width = s.pct + '%';

    $('pfStats').innerHTML =
      '<div class="pf-stat"><b>' + s.stats.episodes + '</b><span>серий просмотрено</span></div>' +
      '<div class="pf-stat"><b>' + s.stats.minutes + '</b><span>минут в плеере</span></div>' +
      '<div class="pf-stat"><b>' + s.stats.titles + '</b><span>тайтлов открыто</span></div>' +
      '<div class="pf-stat"><b>' + s.xp + '</b><span>всего XP</span></div>';

    $('questReset').textContent = 'Ежедневные обновляются в полночь, недельные — в понедельник';
    $('questList').innerHTML = s.quests
      .map(function (q) {
        var pct = Math.round((q.progress / q.target) * 100);
        return (
          '<div class="quest' + (q.done ? ' done' : '') + '">' +
          '<div class="quest-head"><span class="quest-name">' + escapeHtml(q.name) + '</span>' +
          '<span class="quest-xp">' + (q.scope === 'daily' ? 'день' : 'неделя') + ' · ' + q.xp + ' XP</span></div>' +
          '<div class="progress-line"><i style="width:' + pct + '%"></i></div>' +
          '<p class="quest-sub">' + (q.done ? 'Выполнено' : q.progress + ' / ' + q.target + ' ' + escapeHtml(q.unit)) + '</p>' +
          '</div>'
        );
      })
      .join('');

    var rewards = G.rewards();
    $('rewardCount').textContent = s.stats.unlocked + ' из ' + s.stats.total + ' предметов';
    $('rewardGrid').innerHTML = rewards
      .map(function (r) {
        var cls = 'reward' + (r.unlocked ? '' : ' locked') + (r.equipped ? ' equipped' : '');
        return (
          '<button class="' + cls + '" data-id="' + r.id + '"' + (r.unlocked ? '' : ' disabled') + '>' +
          '<span class="reward-lvl">Уровень ' + r.level + '</span>' +
          '<span class="reward-name">' + escapeHtml(r.name) + '</span>' +
          '<span class="reward-kind">' + escapeHtml(G.KIND_NAME[r.kind]) + ' · ' +
          '<span class="reward-rar rar-' + r.rarity + '">' + escapeHtml(G.RARITY_NAME[r.rarity]) + '</span></span>' +
          '</button>'
        );
      })
      .join('');

    $('rewardGrid').querySelectorAll('.reward').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (G.equip(btn.dataset.id)) renderProfile();
      });
    });
  }

  function initProfileActions() {
    var exportBtn = $('pfExport');
    var resetBtn = $('pfReset');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var text = G ? G.exportData() : '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              toast('Сохранение скопировано в буфер обмена');
            },
            function () {
              toast('Не удалось скопировать');
            }
          );
        } else {
          toast('Буфер обмена недоступен');
        }
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!window.confirm('Сбросить уровни, квесты и предметы? История просмотра останется.')) return;
        if (G) G.reset();
        renderProfile();
        updateLvlChip();
        toast('Прогресс сброшен');
      });
    }
  }

  /* ---------------- роутер ---------------- */

  var VIEWS = ['view-home', 'view-list', 'view-title', 'view-profile', 'view-error'];

  function showView(id) {
    VIEWS.forEach(function (name) {
      var node = $(name);
      if (node) node.hidden = name !== id;
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function showError(text) {
    $('errText').textContent = text;
    showView('view-error');
  }

  function stopPlayback() {
    var video = $('player');
    if (video) {
      persistProgress(true);
      video.pause();
      video.removeAttribute('src');
    }
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }
  }

  function setActiveNav(tab) {
    document.querySelectorAll('.nav-link').forEach(function (link) {
      link.classList.toggle('active', link.dataset.tab === tab);
    });
    var nav = $('nav');
    if (nav) nav.classList.remove('open');
  }

  function router() {
    var hash = location.hash || '#/';
    var body = hash.slice(2);
    var queryAt = body.indexOf('?');
    var path = queryAt === -1 ? body : body.slice(0, queryAt);
    var query = queryAt === -1 ? '' : body.slice(queryAt + 1);

    if (!path.indexOf('title/')) {
      state.tab = 'title';
      setActiveNav('');
      loadTitle(path.slice('title/'.length));
      return;
    }

    stopPlayback();
    document.title = 'AnimRu — аниме онлайн';

    if (path === 'profile') {
      state.tab = 'profile';
      setActiveNav('');
      showView('view-profile');
      renderProfile();
      return;
    }

    if (path === 'top') {
      state.tab = 'top';
      setActiveNav('top');
      showView('view-list');
      $('listTitle').textContent = 'Топ-100 AnimRu';
      $('filterToggle').hidden = true;
      $('filterBar').hidden = true;
      $('activeFilters').hidden = true;
      $('loadMoreWrap').hidden = true;
      document.querySelector('.catalog-layout').classList.add('no-filters');
      loadTop();
      return;
    }

    if (path === 'random') {
      state.tab = 'random';
      setActiveNav('random');
      showView('view-list');
      $('listTitle').textContent = 'Случайная подборка';
      $('filterToggle').hidden = true;
      $('filterBar').hidden = true;
      $('activeFilters').hidden = true;
      $('topList').hidden = true;
      document.querySelector('.catalog-layout').classList.add('no-filters');
      loadList('random', 1, false);
      return;
    }

    if (path === 'catalog') {
      state.tab = 'catalog';
      state.page = 1;
      state.filters = hashToFilters(query);
      setActiveNav('catalog');
      showView('view-list');
      $('listTitle').textContent = state.filters.q ? 'Поиск: ' + state.filters.q : 'Каталог';
      $('topList').hidden = true;
      $('filterToggle').hidden = false;
      document.querySelector('.catalog-layout').classList.remove('no-filters');
      var searchInput = $('searchInput');
      if (searchInput && state.filters.q) searchInput.value = state.filters.q;

      loadRefs().then(function () {
        renderFilters();
        renderActiveFilters();
        $('filterBar').hidden = window.innerWidth <= 900 ? true : false;
      });
      loadList('catalog', 1, false);
      return;
    }

    state.tab = 'home';
    setActiveNav('home');
    showView('view-home');
    loadHome();
  }

  /* ---------------- инициализация ---------------- */

  function initChrome() {
    var menuBtn = $('menuBtn');
    var nav = $('nav');
    if (menuBtn && nav) {
      menuBtn.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', String(open));
      });
    }

    var toggle = $('filterToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var bar = $('filterBar');
        bar.hidden = !bar.hidden;
        toggle.setAttribute('aria-expanded', String(!bar.hidden));
      });
    }

    var activeBox = $('activeFilters');
    if (activeBox) {
      activeBox.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-kind]');
        if (!btn) return;
        var kind = btn.dataset.kind;
        if (kind === 'q') state.filters.q = '';
        else if (kind === 'yearFrom') state.filters.yearFrom = '';
        else if (kind === 'yearTo') state.filters.yearTo = '';
        else {
          var list = state.filters[kind];
          var i = list.indexOf(btn.dataset.val);
          if (i !== -1) list.splice(i, 1);
        }
        location.hash = filtersToHash(state.filters);
      });
    }

    var loadMore = $('loadMore');
    if (loadMore) {
      loadMore.addEventListener('click', function () {
        state.page += 1;
        loadList('catalog', state.page, true);
      });
    }

    var clear = $('clearContinue');
    if (clear) {
      clear.addEventListener('click', function () {
        writeJson(LS_WATCH, {});
        renderContinue();
        toast('История просмотра очищена');
      });
    }

    var back = $('backBtn');
    if (back) {
      back.addEventListener('click', function () {
        if (history.length > 1) history.back();
        else location.hash = '#/';
      });
    }

    window.addEventListener('beforeunload', function () {
      persistProgress(true);
    });
  }

  function initGamifyFeedback() {
    if (!G) return;
    G.subscribe(function (event) {
      if (event.type === 'level') {
        var names = event.rewards.map(function (r) {
          return r.name;
        });
        toast(
          'Уровень ' + event.level + (names.length ? ' · открыто: ' + names.join(', ') : '')
        );
      } else if (event.type === 'quest') {
        toast('Квест выполнен: ' + event.quest.name + ' · +' + event.quest.xp + ' XP');
      }
      updateLvlChip();
      if (state.tab === 'profile') renderProfile();
      if (state.tab === 'home') renderPass();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initChrome();
    initSearch();
    initPlayer();
    initProfileActions();
    initGamifyFeedback();
    updateLvlChip();
    window.addEventListener('hashchange', router);
    router();
  });
})();
