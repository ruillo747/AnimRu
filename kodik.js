/* AnimRu: вторая студия — Kodik.
   Токен подбирается автоматически: config.js → localStorage → открытый список → встроенные.
   Data-API блокирует CORS, поэтому есть fallback на публичные прокси.
   Совпадение тайтла ищем по названию + году + числу серий, иначе Kodik отдаёт чужое аниме.
   Стили блока озвучек живут здесь же и опираются на общие токены темы из style.css. */
(function () {
  'use strict';

  var KODIK_API = 'https://kodik-api.com';
  var TOKENS_URL = 'https://raw.githubusercontent.com/YaNesyTortiK/AnimeParsers/main/kdk_tokns/tokens.json';
  var FALLBACK_TOKENS = [
    '56a768d08f43091901c44b54fe970049',
    '41dd95f84c21719b09d6c71182237a25',
    '77b567ec164db6ca9162d2f3dc4948c3'
  ];
  var PROXIES = [
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); }
  ];

  /* без allow-popups и allow-top-navigation: фрейм не откроет рекламную вкладку и не уведёт страницу */
  var SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-presentation allow-orientation-lock';

  var AD_NOTE = 'Реклама внутри этого плеера — от Kodik. Плеер встроен с их сайта, убрать её со своей стороны мы не можем. Переходы по рекламе заблокированы.';

  var CSS = [
    '.kodik-wrap{display:grid;gap:12px}',
    '.kodik-ad-note{margin:0;font-size:11.5px;line-height:1.45;color:var(--dim);opacity:.72}',
    '.kv-panel{padding:14px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}',
    '.kv-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}',
    '.kv-title{font-size:15px;font-weight:600}',
    '.kv-count{font-size:12.5px;color:var(--dim)}',
    '.kv-list{display:grid;gap:8px;max-height:42vh;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--line-2) transparent}',
    '.kv-list::-webkit-scrollbar{width:8px;height:8px}',
    '.kv-list::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:4px}',
    '.kv-btn{display:flex;align-items:baseline;gap:10px;width:100%;padding:9px 11px;border:1px solid var(--line);' +
      'border-radius:var(--r-sm);background:var(--surface-2);color:var(--text);font:inherit;font-size:13.5px;' +
      'text-align:left;cursor:pointer}',
    '.kv-btn:hover{border-color:var(--accent)}',
    '.kv-btn.active{border-color:var(--accent);background:var(--accent-soft)}',
    '.kv-num{flex:none;min-width:22px;font-weight:700;color:var(--dim)}',
    '.kv-btn.active .kv-num{color:var(--accent)}',
    '.kv-name{flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.kv-kind{flex:none;font-size:11px;color:var(--dim)}',
    '@media (min-width:901px){.kv-list{grid-template-columns:repeat(auto-fill,minmax(216px,1fr));max-height:34vh}}',
    '@media (max-width:520px){.kv-list{max-height:36vh}.kodik-ad-note{font-size:11px}}'
  ].join('');

  var LS_SOURCE = 'animru:source';
  var LS_TOKEN = 'animru:kodik-token';

  var state = {
    source: 'anilibria',
    token: null,
    candidates: null,
    materials: null,
    materialsFor: null,
    picked: 0,
    weak: false,
    loading: false
  };
  var els = {};

  function $(id) { return document.getElementById(id); }

  function lsGet(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* приватный режим */ }
  }

  function absUrl(u) {
    if (!u) return '';
    return u.indexOf('//') === 0 ? 'https:' + u : u;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function injectCss() {
    if ($('kodik-css')) return;
    var tag = document.createElement('style');
    tag.id = 'kodik-css';
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }

  function smartFetch(url) {
    var attempts = [function () { return fetch(url); }].concat(
      PROXIES.map(function (make) {
        return function () { return fetch(make(url)); };
      })
    );

    return attempts.reduce(function (chain, run) {
      return chain.then(function (res) {
        if (res) return res;
        return run().then(
          function (r) { return r && r.ok ? r : null; },
          function () { return null; }
        );
      });
    }, Promise.resolve(null));
  }

  function apiJson(url) {
    return smartFetch(url).then(function (res) {
      if (!res) throw new Error('kodik unreachable');
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('kodik bad json'); }
        if (data && data.error) {
          var err = new Error(data.error);
          err.badToken = /токен|token/i.test(data.error);
          throw err;
        }
        return data;
      });
    });
  }

  /* токены открытого списка лежат обфусцированно: реверс → части по '==' → base64 */
  function decodeToken(s) {
    var rev = String(s).split('').reverse().join('');
    var out = '';
    rev.split('==').forEach(function (part) {
      if (!part) return;
      try { out += atob(part + '=='); } catch (e) { /* битая часть */ }
    });
    return out;
  }

  function candidateTokens() {
    if (state.candidates) return Promise.resolve(state.candidates);

    var list = [];
    var cfg = (window.ANIMRU_CONFIG || {}).kodikToken;
    if (cfg && cfg.trim()) list.push(cfg.trim());
    var saved = lsGet(LS_TOKEN).trim();
    if (saved) list.push(saved);

    return smartFetch(TOKENS_URL)
      .then(function (res) { return res ? res.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        if (data) {
          ['stable', 'unstable'].forEach(function (key) {
            (data[key] || []).forEach(function (item) {
              var t = decodeToken(item && item.tokn);
              if (t) list.push(t);
            });
          });
        }
        FALLBACK_TOKENS.forEach(function (t) { list.push(t); });

        var seen = {};
        state.candidates = list.filter(function (t) {
          if (!t || seen[t]) return false;
          seen[t] = 1;
          return true;
        });
        return state.candidates;
      });
  }

  function getToken() {
    if (state.token) return Promise.resolve(state.token);

    return candidateTokens().then(function (tokens) {
      return tokens.reduce(function (chain, token) {
        return chain.then(function (found) {
          if (found) return found;
          return apiJson(KODIK_API + '/translations?token=' + encodeURIComponent(token))
            .then(function () { return token; })
            .catch(function () { return null; });
        });
      }, Promise.resolve(null));
    }).then(function (token) {
      if (!token) throw new Error('no kodik token');
      state.token = token;
      lsSet(LS_TOKEN, token);
      return token;
    });
  }

  /* ---------------- данные открытого тайтла ---------------- */

  function textOf(id) {
    var node = $(id);
    return node ? node.textContent.trim() : '';
  }

  function titleYear() {
    var m = textOf('tMeta').match(/\b(?:19|20)\d{2}\b/);
    return m ? m[0] : '';
  }

  function titleEpisodesTotal() {
    var m = textOf('tMeta').match(/(\d+)\s*эп\./);
    if (m) return parseInt(m[1], 10);
    var list = document.querySelectorAll('#episodes .ep-btn');
    return list.length || 0;
  }

  function currentEpisode() {
    var active = document.querySelector('#episodes .ep-btn.active .ep-num');
    var num = active ? parseInt(active.textContent, 10) : 1;
    return isFinite(num) && num > 0 ? num : 1;
  }

  /* ---------------- подбор совпадения ---------------- */

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[ёë]/g, 'е')
      .replace(/\b(tv|сезон|season)\b/g, ' ')
      .replace(/[^a-zа-я0-9]+/g, ' ')
      .trim();
  }

  function sameTitle(a, b) {
    var x = norm(a);
    var y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return x.length > 6 && y.length > 6 && (x.indexOf(y) === 0 || y.indexOf(x) === 0);
  }

  function score(item, want) {
    var points = 0;

    if (sameTitle(item.title, want.ru) || sameTitle(item.titleOrig, want.ru)) points += 3;
    else if (sameTitle(item.title, want.en) || sameTitle(item.titleOrig, want.en)) points += 3;
    else if (norm(item.title).indexOf(norm(want.ru)) >= 0 && norm(want.ru).length > 8) points += 1;

    if (want.year && item.year && String(item.year) === String(want.year)) points += 2;
    else if (want.year && item.year && Math.abs(item.year - Number(want.year)) === 1) points += 1;

    if (want.total && item.episodes) {
      var diff = Math.abs(item.episodes - want.total);
      if (diff === 0) points += 2;
      else if (diff <= 2) points += 1;
      else if (item.episodes < want.total / 2) points -= 2;
    }

    return points;
  }

  function searchUrl(token, params) {
    var query = ['token=' + encodeURIComponent(token), 'limit=50', 'with_material_data=true', 'with_episodes_data=true'];
    Object.keys(params).forEach(function (key) {
      if (params[key]) query.push(key + '=' + encodeURIComponent(params[key]));
    });
    return KODIK_API + '/search?' + query.join('&');
  }

  function rawSearch(params) {
    return getToken().then(function (token) {
      return apiJson(searchUrl(token, params)).catch(function (err) {
        if (!err.badToken) throw err;
        state.token = null;
        return getToken().then(function (fresh) { return apiJson(searchUrl(fresh, params)); });
      });
    }).then(function (data) {
      return ((data && data.results) || []).filter(function (m) { return m && m.link; }).map(function (m) {
        var material = m.material_data || {};
        return {
          link: absUrl(m.link),
          title: m.title || material.title || '',
          titleOrig: m.title_orig || material.title_en || '',
          year: m.year || material.year || null,
          season: m.last_season || m.season || null,
          episodes: m.episodes_count || material.episodes_total || null,
          label: (m.translation && m.translation.title) || 'Озвучка',
          kind: m.translation && m.translation.type === 'subtitles' ? 'субтитры' : 'озвучка'
        };
      });
    });
  }

  function findMaterials() {
    var want = {
      ru: textOf('tName'),
      en: textOf('tNameEn'),
      year: titleYear(),
      total: titleEpisodesTotal()
    };
    if (!want.ru && !want.en) return Promise.resolve({ list: [], weak: false });

    var probes = [];
    if (want.ru) probes.push({ title: want.ru, year: want.year });
    if (want.en) probes.push({ title_orig: want.en, year: want.year });
    if (want.ru) probes.push({ title: want.ru });
    if (want.en) probes.push({ title_orig: want.en });

    return probes
      .reduce(function (chain, params) {
        return chain.then(function (acc) {
          if (acc.best >= 5) return acc;
          return rawSearch(params)
            .catch(function () { return []; })
            .then(function (found) {
              found.forEach(function (item) {
                item.score = score(item, want);
                if (item.score > acc.best) acc.best = item.score;
                acc.all.push(item);
              });
              return acc;
            });
        });
      }, Promise.resolve({ all: [], best: -99 }))
      .then(function (acc) {
        var seen = {};
        var unique = acc.all.filter(function (item) {
          if (seen[item.link]) return false;
          seen[item.link] = 1;
          return true;
        });

        var list = unique.filter(function (item) { return item.score >= 4; });
        var weak = false;

        if (!list.length) {
          list = unique.filter(function (item) { return item.score >= 2; });
          weak = list.length > 0;
        }

        list.sort(function (a, b) { return b.score - a.score; });
        return { list: list, weak: weak };
      });
  }

  /* ---------------- интерфейс ---------------- */

  function build() {
    var main = document.querySelector('#view-title .watch-main');
    var player = $('playerRoot');
    if (!main || !player || els.bar) return;

    injectCss();

    var bar = document.createElement('div');
    bar.className = 'src-bar';
    bar.innerHTML =
      '<span class="src-label">Студия</span>' +
      '<button class="src-btn" type="button" data-src="anilibria">Anilibria</button>' +
      '<button class="src-btn" type="button" data-src="kodik">Kodik</button>';

    var wrap = document.createElement('div');
    wrap.className = 'kodik-wrap';
    wrap.hidden = true;
    wrap.innerHTML =
      '<iframe class="kodik-frame" title="Kodik" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"' +
      ' allowfullscreen sandbox="' + SANDBOX + '"></iframe>' +
      '<p class="kodik-note" hidden></p>' +
      '<section class="kv-panel" hidden>' +
      '<div class="kv-head"><h3 class="kv-title">Озвучка</h3><span class="kv-count"></span></div>' +
      '<div class="kv-list"></div>' +
      '</section>' +
      '<p class="kodik-ad-note">' + escapeHtml(AD_NOTE) + '</p>';

    main.insertBefore(bar, player);
    main.insertBefore(wrap, player.nextSibling);

    els.bar = bar;
    els.wrap = wrap;
    els.frame = wrap.querySelector('.kodik-frame');
    els.note = wrap.querySelector('.kodik-note');
    els.panel = wrap.querySelector('.kv-panel');
    els.count = wrap.querySelector('.kv-count');
    els.list = wrap.querySelector('.kv-list');

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.src-btn');
      if (btn) setSource(btn.getAttribute('data-src'));
    });

    els.list.addEventListener('click', function (e) {
      var btn = e.target.closest('.kv-btn');
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-voice'), 10);
      if (!state.materials || !state.materials[idx]) return;
      state.picked = idx;
      renderVoices();
      mountFrame(true);
    });

    var episodes = $('episodes');
    if (episodes) {
      episodes.addEventListener('click', function () {
        if (state.source === 'kodik') setTimeout(function () { mountFrame(true); }, 80);
      });
    }
  }

  function note(text) {
    if (!els.note) return;
    els.note.textContent = text || '';
    els.note.hidden = !text;
  }

  function matchNote() {
    var item = (state.materials || [])[state.picked] || null;
    if (!item) return;
    var bits = [item.title || item.titleOrig];
    if (item.year) bits.push(item.year + ' г.');
    if (item.episodes) bits.push(item.episodes + ' эп.');
    var text = 'Kodik: ' + bits.filter(Boolean).join(' · ');
    note(state.weak ? text + ' — точного совпадения нет, проверьте название' : text);
  }

  /* список озвучек оформлен как блок серий, но стоит под плеером */
  function renderVoices() {
    if (!els.panel || !els.list) return;

    var list = state.materials || [];
    if (list.length < 2) {
      els.panel.hidden = true;
      els.list.innerHTML = '';
      return;
    }

    els.panel.hidden = false;
    els.count.textContent = list.length + ' всего';
    els.list.innerHTML = list.map(function (m, i) {
      var sub = [m.title || m.titleOrig, m.year ? m.year + ' г.' : ''].filter(Boolean).join(' · ');
      return (
        '<button class="kv-btn' + (i === state.picked ? ' active' : '') + '" type="button" data-voice="' + i + '"' +
        ' title="' + escapeHtml(sub) + '">' +
        '<span class="kv-num">' + (i + 1) + '</span>' +
        '<span class="kv-name">' + escapeHtml(m.label) + '</span>' +
        '<span class="kv-kind">' + escapeHtml(m.kind) + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function markButtons() {
    if (!els.bar) return;
    els.bar.querySelectorAll('.src-btn').forEach(function (btn) {
      var on = btn.getAttribute('data-src') === state.source;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function stopNative() {
    var video = $('player');
    if (video && !video.paused) video.pause();
  }

  function applyLayout() {
    var player = $('playerRoot');
    var kodik = state.source === 'kodik';
    if (player) player.hidden = kodik;
    if (els.wrap) els.wrap.hidden = !kodik;
    markButtons();
  }

  /* свои серии и озвучки уже есть в интерфейсе, внутренние селекторы фрейма прячем */
  function frameUrl(item) {
    var parts = ['episode=' + currentEpisode(), 'season=' + (item.season || 1), 'hide_selectors=true'];
    var sep = item.link.indexOf('?') === -1 ? '?' : '&';
    return item.link + sep + parts.join('&');
  }

  function mountFrame(force) {
    if (state.source !== 'kodik' || !els.frame) return;
    var item = (state.materials || [])[state.picked];
    if (!item) return;

    var next = frameUrl(item);
    if (force || els.frame.getAttribute('src') !== next) {
      els.frame.setAttribute('sandbox', SANDBOX);
      els.frame.src = next;
    }
    matchNote();
  }

  function titleKey() {
    return textOf('tName') + '|' + titleYear() + '|' + titleEpisodesTotal();
  }

  function load() {
    if (state.source !== 'kodik' || state.loading) return;

    var key = titleKey();
    if (state.materialsFor === key && state.materials && state.materials.length) {
      renderVoices();
      mountFrame(false);
      return;
    }

    state.loading = true;
    note('Ищем озвучки в Kodik…');
    if (els.frame) els.frame.removeAttribute('src');

    findMaterials()
      .then(function (res) {
        state.loading = false;
        state.materials = res.list;
        state.materialsFor = key;
        state.weak = res.weak;
        state.picked = 0;

        if (!res.list.length) {
          renderVoices();
          note('Kodik не нашёл это аниме. Попробуйте студию Anilibria.');
          return;
        }

        renderVoices();
        mountFrame(true);
      })
      .catch(function () {
        state.loading = false;
        note('Kodik недоступен. Попробуйте студию Anilibria.');
      });
  }

  function setSource(id) {
    if (id !== 'kodik' && id !== 'anilibria') return;
    if (state.source === id) return;
    state.source = id;
    lsSet(LS_SOURCE, id);

    if (id === 'kodik') {
      stopNative();
      applyLayout();
      load();
    } else {
      if (els.frame) els.frame.src = 'about:blank';
      note('');
      applyLayout();
    }
  }

  function onRoute() {
    var view = $('view-title');
    if (!view || view.hidden) return;

    build();
    if (!els.bar) return;

    if (state.materialsFor && state.materialsFor !== titleKey()) {
      state.materials = null;
      state.materialsFor = null;
      state.picked = 0;
      state.weak = false;
      if (els.frame) els.frame.src = 'about:blank';
      renderVoices();
    }

    applyLayout();
    if (state.source === 'kodik') {
      stopNative();
      load();
    }
  }

  state.source = lsGet(LS_SOURCE) === 'kodik' ? 'kodik' : 'anilibria';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(onRoute, 500); });
  } else {
    setTimeout(onRoute, 500);
  }

  window.addEventListener('hashchange', function () { setTimeout(onRoute, 600); });

  window.AnimKodik = {
    set: setSource,
    current: function () { return state.source; },
    setToken: function (token) {
      lsSet(LS_TOKEN, String(token || '').trim());
      state.token = null;
      state.candidates = null;
      state.materials = null;
      state.materialsFor = null;
      if (state.source === 'kodik') load();
    }
  };
})();
