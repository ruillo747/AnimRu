/* AnimRu — каталог, поиск и главная для аниме из Kodik.
   У Kodik свои id тайтлов, поэтому для них сделан отдельный маршрут #/kodik/<id>
   со своей страницей просмотра: серии, озвучки и встроенный плеер. */
(function () {
  'use strict';

  var API = 'https://kodik-api.com';
  var LS_TOKEN = 'animru:kodik-token';
  var FALLBACK_TOKENS = [
    '56a768d08f43091901c44b54fe970049',
    '41dd95f84c21719b09d6c71182237a25',
    '77b567ec164db6ca9162d2f3dc4948c3'
  ];
  var SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-presentation allow-orientation-lock';
  var AD_NOTE = 'Реклама внутри этого плеера — от Kodik. Плеер встроен с их сайта, убрать её со своей стороны мы не можем.';

  var CSS = [
    '.kb-block{margin-bottom:32px}',
    '.kb-src{font-size:12px;color:var(--dim);font-weight:600}',
    '.kb-page{padding-top:calc(var(--header-h) + 24px)}',
    '.kb-hero{display:grid;grid-template-columns:186px 1fr;gap:20px;align-items:start;margin-bottom:20px}',
    '.kb-poster{width:100%;aspect-ratio:2/3;object-fit:cover;border:1px solid var(--line);border-radius:var(--r);background:var(--surface-3)}',
    '.kb-desc{margin-top:12px;max-width:70ch;color:var(--muted)}',
    '.kb-frame{width:100%;aspect-ratio:16/9;border:1px solid var(--line);border-radius:var(--r);background:#000}',
    '.kb-note{margin:6px 0 0;font-size:11.5px;line-height:1.4;color:var(--dim);opacity:.75}',
    '.kb-panel{margin-top:14px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}',
    '.kb-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}',
    '.kb-title{font-size:14px;font-weight:600}',
    '.kb-count{font-size:12px;color:var(--dim)}',
    '.kb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:8px;max-height:210px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line-2) transparent}',
    '.kb-list.wide{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}',
    '.kb-btn{min-height:34px;padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface-2);color:var(--text);font:inherit;font-size:13px;text-align:center;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.kb-list.wide .kb-btn{text-align:left}',
    '.kb-btn:hover{border-color:var(--accent)}',
    '.kb-btn.active{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);font-weight:600}',
    '@media (max-width:620px){.kb-hero{grid-template-columns:1fr}.kb-poster{max-width:170px}}'
  ].join('');

  var state = { view: null, id: null, items: [], picked: 0, episode: 1, homeDone: false, searchFor: null };

  function injectCss() {
    if (document.getElementById('kodik-browse-css')) return;
    var style = document.createElement('style');
    style.id = 'kodik-browse-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

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
      Object.keys(params).forEach(function (key) {
        if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
          url.searchParams.set(key, String(params[key]));
        }
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

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
    });
  }

  function material(item) {
    return (item && item.material_data) || {};
  }

  function nameOf(item) {
    var data = material(item);
    return item.title || data.title || data.anime_title || 'Без названия';
  }

  function posterOf(item) {
    var data = material(item);
    return data.anime_poster_url || data.poster_url || '';
  }

  function episodesTotal(item) {
    var data = material(item);
    return Number(item.episodes_count || item.last_episode || data.episodes_total || data.episodes_aired || 0) || 0;
  }

  function voiceOf(item) {
    return (item.translation && item.translation.title) || 'Озвучка';
  }

  function uniqueTitles(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (item) {
      var key = String(item.shikimori_id || item.kinopoisk_id || nameOf(item) + item.year);
      if (seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function cardHtml(item) {
    var poster = posterOf(item);
    var name = escapeHtml(nameOf(item));
    var total = episodesTotal(item);
    var sub = [item.year, total ? total + ' эп.' : ''].filter(Boolean).join(' · ');
    return (
      '<a class="card kb-card" href="#/kodik/' + encodeURIComponent(item.id) + '">' +
      '<span class="card-poster">' +
      (poster ? '<img loading="lazy" alt="" src="' + escapeHtml(poster) + '">' : '') +
      '<span class="card-badge">Kodik</span>' +
      '</span>' +
      '<span class="card-body"><span class="card-title">' + name + '</span>' +
      '<span class="card-sub">' + escapeHtml(sub) + '</span></span>' +
      '</a>'
    );
  }

  /* ---------------- главная: раздел «Новое на Kodik» ---------------- */

  function renderHome() {
    var home = document.getElementById('view-home');
    if (!home || state.homeDone) return;
    state.homeDone = true;

    var block = document.createElement('section');
    block.className = 'row-block kb-block';
    block.id = 'kodikBlock';
    block.innerHTML =
      '<div class="section-head"><h2>Новое на Kodik</h2>' +
      '<span class="kb-src">второй источник</span></div>' +
      '<div class="rail" id="kodikRail"><p class="status">Загрузка…</p></div>';

    var blocks = home.querySelectorAll('.row-block');
    if (blocks.length) blocks[blocks.length - 1].before(block);
    else home.appendChild(block);

    request('/list', {
      limit: 40,
      types: 'anime,anime-serial',
      sort: 'updated_at',
      with_material_data: true
    })
      .then(function (json) {
        var items = uniqueTitles(json.results).slice(0, 18);
        var rail = document.getElementById('kodikRail');
        if (!rail) return;
        rail.innerHTML = items.length
          ? items.map(cardHtml).join('')
          : '<p class="status">Kodik ничего не вернул.</p>';
      })
      .catch(function () {
        var rail = document.getElementById('kodikRail');
        if (rail) rail.innerHTML = '<p class="status">Kodik сейчас недоступен.</p>';
      });
  }

  /* ---------------- каталог и поиск ---------------- */

  function queryFromHash() {
    var hash = location.hash || '';
    var at = hash.indexOf('?');
    if (at < 0) return '';
    var params = new URLSearchParams(hash.slice(at + 1));
    return (params.get('q') || params.get('search') || '').trim();
  }

  function catalogBox() {
    var host = document.querySelector('#view-list .catalog-main') || document.getElementById('view-list');
    if (!host) return null;
    var box = document.getElementById('kodikFound');
    if (!box) {
      box = document.createElement('section');
      box.className = 'row-block kb-block';
      box.id = 'kodikFound';
      host.appendChild(box);
    }
    return box;
  }

  function renderSearch() {
    var query = queryFromHash();
    var box = document.getElementById('kodikFound');
    if (!query) {
      if (box) box.remove();
      state.searchFor = null;
      return;
    }
    if (state.searchFor === query) return;
    state.searchFor = query;

    box = catalogBox();
    if (!box) return;
    box.innerHTML =
      '<div class="section-head"><h2>Найдено на Kodik</h2>' +
      '<span class="kb-src">второй источник</span></div>' +
      '<p class="status">Ищем «' + escapeHtml(query) + '»…</p>';

    request('/search', { title: query, limit: 40, with_material_data: true })
      .then(function (json) {
        var items = uniqueTitles(json.results).slice(0, 12);
        var current = document.getElementById('kodikFound');
        if (!current || state.searchFor !== query) return;
        current.innerHTML =
          '<div class="section-head"><h2>Найдено на Kodik</h2>' +
          '<span class="kb-src">второй источник</span></div>' +
          (items.length
            ? '<div class="grid">' + items.map(cardHtml).join('') + '</div>'
            : '<p class="status">На Kodik по этому запросу ничего нет.</p>');
      })
      .catch(function () {
        var current = document.getElementById('kodikFound');
        if (current && state.searchFor === query) {
          current.innerHTML =
            '<div class="section-head"><h2>Найдено на Kodik</h2></div>' +
            '<p class="status">Kodik сейчас недоступен.</p>';
        }
      });
  }

  /* ---------------- своя страница тайтла Kodik ---------------- */

  function buildView() {
    if (state.view) return state.view;
    var view = document.createElement('section');
    view.id = 'view-kodik';
    view.className = 'view wrap kb-page';
    view.hidden = true;
    view.innerHTML = '<p class="status" id="kbStatus">Загрузка…</p><div id="kbBody"></div>';
    var app = document.getElementById('app') || document.body;
    app.appendChild(view);
    state.view = view;
    return view;
  }

  function frameUrl(item, episode) {
    var link = String(item.link || '');
    if (link.indexOf('//') === 0) link = 'https:' + link;
    var url = new URL(link);
    url.searchParams.set('hide_selectors', 'true');
    url.searchParams.set('only_season', 'true');
    if (episodesTotal(item) > 1) url.searchParams.set('episode', String(episode));
    return url.toString();
  }

  function mount() {
    var body = document.getElementById('kbBody');
    var item = state.items[state.picked];
    if (!body || !item) return;

    var data = material(item);
    var total = episodesTotal(item);
    var meta = [item.year, data.anime_kind || data.kind, data.anime_status || data.all_status]
      .filter(Boolean)
      .map(function (value) { return '<span>' + escapeHtml(value) + '</span>'; })
      .join('');
    var episodes = '';
    for (var i = 1; i <= total; i += 1) {
      episodes +=
        '<button type="button" class="kb-btn' + (i === state.episode ? ' active' : '') +
        '" data-ep="' + i + '">' + i + '</button>';
    }
    var voices = state.items
      .map(function (variant, index) {
        return (
          '<button type="button" class="kb-btn' + (index === state.picked ? ' active' : '') +
          '" data-voice="' + index + '">' + escapeHtml(voiceOf(variant)) + '</button>'
        );
      })
      .join('');

    body.innerHTML =
      '<a class="link-btn back" href="#/">← На главную</a>' +
      '<div class="kb-hero">' +
      (posterOf(item) ? '<img class="kb-poster" alt="" src="' + escapeHtml(posterOf(item)) + '">' : '<span></span>') +
      '<div><h1>' + escapeHtml(nameOf(item)) + '</h1>' +
      '<div class="meta-row">' + meta + '<span>Источник: Kodik</span></div>' +
      (data.description ? '<p class="kb-desc">' + escapeHtml(data.description) + '</p>' : '') +
      '</div></div>' +
      '<iframe class="kb-frame" id="kbFrame" allow="autoplay; fullscreen; encrypted-media" allowfullscreen ' +
      'referrerpolicy="no-referrer" sandbox="' + SANDBOX + '" src="' + escapeHtml(frameUrl(item, state.episode)) + '"></iframe>' +
      '<p class="kb-note">' + escapeHtml(AD_NOTE) + '</p>' +
      (total > 1
        ? '<div class="kb-panel"><div class="kb-head"><span class="kb-title">Серии</span>' +
          '<span class="kb-count">' + total + ' всего</span></div>' +
          '<div class="kb-list" id="kbEpisodes">' + episodes + '</div></div>'
        : '') +
      (state.items.length > 1
        ? '<div class="kb-panel"><div class="kb-head"><span class="kb-title">Озвучка</span>' +
          '<span class="kb-count">' + state.items.length + ' вариантов</span></div>' +
          '<div class="kb-list wide" id="kbVoices">' + voices + '</div></div>'
        : '');

    var episodesBox = document.getElementById('kbEpisodes');
    if (episodesBox) {
      episodesBox.addEventListener('click', function (event) {
        var button = event.target.closest('[data-ep]');
        if (!button) return;
        state.episode = Number(button.dataset.ep);
        mount();
      });
    }
    var voicesBox = document.getElementById('kbVoices');
    if (voicesBox) {
      voicesBox.addEventListener('click', function (event) {
        var button = event.target.closest('[data-voice]');
        if (!button) return;
        state.picked = Number(button.dataset.voice);
        mount();
      });
    }
  }

  function loadTitle(id) {
    var status = document.getElementById('kbStatus');
    var body = document.getElementById('kbBody');
    if (body) body.innerHTML = '';
    if (status) {
      status.hidden = false;
      status.textContent = 'Загрузка…';
    }

    request('/search', { id: id, with_material_data: true, with_episodes_data: true })
      .then(function (json) {
        var found = (json.results || [])[0];
        if (!found) throw new Error('not found');
        var key = found.shikimori_id ? { shikimori_id: found.shikimori_id } : { title: nameOf(found), year: found.year };
        key.with_material_data = true;
        key.with_episodes_data = true;
        key.limit = 40;
        return request('/search', key)
          .then(function (all) {
            var list = (all.results || []).filter(function (item) { return item.link; });
            if (!list.length) list = [found];
            var at = list.findIndex(function (item) { return item.id === found.id; });
            state.items = list;
            state.picked = at >= 0 ? at : 0;
          })
          .catch(function () {
            state.items = [found];
            state.picked = 0;
          });
      })
      .then(function () {
        state.episode = 1;
        if (status) status.hidden = true;
        mount();
      })
      .catch(function () {
        if (status) status.textContent = 'Не удалось загрузить тайтл с Kodik.';
      });
  }

  /* ---------------- маршрутизация ---------------- */

  function hideOtherViews() {
    Array.prototype.slice.call(document.querySelectorAll('#app > .view')).forEach(function (node) {
      if (node.id !== 'view-kodik') node.hidden = true;
    });
  }

  function apply() {
    var match = (location.hash || '').match(/^#\/kodik\/([^?]+)/);
    var view = buildView();
    if (!match) {
      view.hidden = true;
      state.id = null;
      return;
    }
    var id = decodeURIComponent(match[1]);
    hideOtherViews();
    view.hidden = false;
    window.scrollTo(0, 0);
    if (state.id === id) return;
    state.id = id;
    loadTitle(id);
  }

  function onRoute() {
    apply();
    var hash = location.hash || '';
    if (hash === '' || hash === '#/' || hash.indexOf('#/home') === 0) setTimeout(renderHome, 500);
    if (hash.indexOf('#/catalog') === 0) setTimeout(renderSearch, 400);
  }

  injectCss();
  window.addEventListener('hashchange', onRoute);
  setTimeout(onRoute, 700);

  window.AnimKodikBrowse = { open: function (id) { location.hash = '#/kodik/' + encodeURIComponent(id); } };
})();
