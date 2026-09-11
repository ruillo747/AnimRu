/* AnimRu: вторая студия — Kodik.
   Токен не требует регистрации: берём из config.js → из localStorage → из открытого списка → встроенные.
   Дата-API блокирует CORS, поэтому есть fallback на публичные прокси. */
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

  var LS_SOURCE = 'animru:source';
  var LS_TOKEN = 'animru:kodik-token';

  var state = {
    source: 'anilibria',
    token: null,
    candidates: null,
    materials: null,
    materialsFor: null,
    picked: null,
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
    if (u.indexOf('//') === 0) return 'https:' + u;
    return u;
  }

  /* запрос напрямую, при CORS-ошибке — через прокси */
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

  /* токены из открытого списка хранятся обфусцированно: реверс → части по '==' → base64 */
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

  /* первый токен, который проходит проверку на /translations */
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

  function searchMaterials(query) {
    return getToken().then(function (token) {
      var url =
        KODIK_API + '/search?token=' + encodeURIComponent(token) +
        '&limit=24&with_material_data=true&with_episodes_data=true&title=' +
        encodeURIComponent(query);

      return apiJson(url).catch(function (err) {
        if (!err.badToken) throw err;
        state.token = null;
        return getToken().then(function (fresh) {
          return apiJson(
            KODIK_API + '/search?token=' + encodeURIComponent(fresh) +
            '&limit=24&with_material_data=true&with_episodes_data=true&title=' +
            encodeURIComponent(query)
          );
        });
      });
    }).then(function (data) {
      var results = (data && data.results) || [];
      var seen = {};
      return results
        .filter(function (m) { return m && m.link; })
        .map(function (m) {
          return {
            link: absUrl(m.link),
            label: (m.translation && m.translation.title) || m.title || 'Озвучка',
            kind: m.translation && m.translation.type === 'subtitles' ? 'субтитры' : 'озвучка',
            episodes: m.episodes_count || null
          };
        })
        .filter(function (m) {
          var key = m.label + '|' + m.link;
          if (seen[key]) return false;
          seen[key] = 1;
          return true;
        });
    });
  }

  function titleName() {
    var node = $('tName');
    return node ? node.textContent.trim() : '';
  }

  function titleNameEn() {
    var node = $('tNameEn');
    return node ? node.textContent.trim() : '';
  }

  function currentEpisode() {
    var active = document.querySelector('#episodes .ep-btn.active .ep-num');
    var num = active ? parseInt(active.textContent, 10) : 1;
    return isFinite(num) && num > 0 ? num : 1;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function build() {
    var main = document.querySelector('#view-title .watch-main');
    var player = $('playerRoot');
    if (!main || !player || els.bar) return;

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
      '<div class="src-bar kodik-voices" hidden></div>' +
      '<iframe class="kodik-frame" title="Kodik" allow="autoplay; fullscreen; encrypted-media; picture-in-picture"' +
      ' allowfullscreen referrerpolicy="origin"></iframe>' +
      '<p class="kodik-note" hidden></p>';

    main.insertBefore(bar, player);
    main.insertBefore(wrap, player.nextSibling);

    els.bar = bar;
    els.wrap = wrap;
    els.voices = wrap.querySelector('.kodik-voices');
    els.frame = wrap.querySelector('.kodik-frame');
    els.note = wrap.querySelector('.kodik-note');

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.src-btn');
      if (btn) setSource(btn.getAttribute('data-src'));
    });

    els.voices.addEventListener('click', function (e) {
      var btn = e.target.closest('.src-btn');
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-voice'), 10);
      if (!state.materials || !state.materials[idx]) return;
      state.picked = idx;
      renderVoices();
      mountFrame();
    });

    var episodes = $('episodes');
    if (episodes) {
      episodes.addEventListener('click', function () {
        if (state.source === 'kodik') setTimeout(mountFrame, 80);
      });
    }
  }

  function note(text) {
    if (!els.note) return;
    els.note.textContent = text || '';
    els.note.hidden = !text;
  }

  function renderVoices() {
    if (!els.voices) return;
    var list = state.materials || [];
    if (list.length < 2) {
      els.voices.hidden = true;
      els.voices.innerHTML = '';
      return;
    }
    els.voices.hidden = false;
    els.voices.innerHTML =
      '<span class="src-label">Озвучка</span>' +
      list.map(function (m, i) {
        return (
          '<button class="src-btn' + (i === state.picked ? ' active' : '') + '" type="button" data-voice="' + i + '">' +
          escapeHtml(m.label) +
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

  function mountFrame() {
    if (state.source !== 'kodik' || !els.frame) return;
    var item = (state.materials || [])[state.picked || 0];
    if (!item) return;
    var sep = item.link.indexOf('?') === -1 ? '?' : '&';
    var next = item.link + sep + 'episode=' + currentEpisode();
    if (els.frame.getAttribute('src') !== next) els.frame.src = next;
    note('');
  }

  function load() {
    if (state.source !== 'kodik' || state.loading) return;

    var key = titleName();
    if (state.materialsFor === key && state.materials && state.materials.length) {
      renderVoices();
      mountFrame();
      return;
    }

    var queries = [key, titleNameEn()].filter(Boolean);
    if (!queries.length) return;

    state.loading = true;
    note('Ищем озвучки в Kodik…');
    if (els.frame) els.frame.removeAttribute('src');

    queries
      .reduce(function (chain, query) {
        return chain.then(function (found) {
          if (found && found.length) return found;
          return searchMaterials(query).catch(function () { return []; });
        });
      }, Promise.resolve([]))
      .then(function (list) {
        state.loading = false;
        state.materials = list;
        state.materialsFor = key;
        state.picked = 0;

        if (!list.length) {
          renderVoices();
          note('Kodik не нашёл это аниме или источник недоступен. Попробуйте студию Anilibria.');
          return;
        }

        renderVoices();
        mountFrame();
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
      if (els.frame) els.frame.removeAttribute('src');
      note('');
      applyLayout();
    }
  }

  function onRoute() {
    var view = $('view-title');
    if (!view || view.hidden) return;

    build();
    if (!els.bar) return;

    if (state.materialsFor && state.materialsFor !== titleName()) {
      state.materials = null;
      state.materialsFor = null;
      state.picked = 0;
      if (els.frame) els.frame.removeAttribute('src');
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
    document.addEventListener('DOMContentLoaded', function () { setTimeout(onRoute, 400); });
  } else {
    setTimeout(onRoute, 400);
  }

  window.addEventListener('hashchange', function () { setTimeout(onRoute, 500); });

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
