/* AnimRu: вторая студия — Kodik. Переключатель источника над плеером.
   Anilibria играет во встроенном плеере, Kodik — во фрейме студии. */
(function () {
  'use strict';

  var SOURCES = [
    { id: 'anilibria', name: 'Anilibria' },
    { id: 'kodik', name: 'Kodik' }
  ];

  var LS_SOURCE = 'animru:source';
  var state = { source: 'anilibria', link: null, linkFor: null, loading: false };
  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function token() {
    var cfg = window.ANIMRU_CONFIG || {};
    return (cfg.kodikToken || '').trim();
  }

  function savedSource() {
    try {
      var v = localStorage.getItem(LS_SOURCE);
      return v === 'kodik' ? 'kodik' : 'anilibria';
    } catch (e) {
      return 'anilibria';
    }
  }

  function saveSource(id) {
    try {
      localStorage.setItem(LS_SOURCE, id);
    } catch (e) {
      /* приватный режим */
    }
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

  function build() {
    var main = document.querySelector('#view-title .watch-main');
    var player = $('playerRoot');
    if (!main || !player || els.bar) return;

    var bar = document.createElement('div');
    bar.className = 'src-bar';
    bar.innerHTML =
      '<span class="src-label">Студия</span>' +
      SOURCES.map(function (s) {
        return '<button class="src-btn" type="button" data-src="' + s.id + '">' + s.name + '</button>';
      }).join('');

    var frameWrap = document.createElement('div');
    frameWrap.className = 'kodik-wrap';
    frameWrap.hidden = true;
    frameWrap.innerHTML =
      '<iframe class="kodik-frame" title="Kodik" allow="autoplay *; fullscreen *; encrypted-media *"' +
      ' allowfullscreen referrerpolicy="origin"></iframe>' +
      '<p class="kodik-note" hidden></p>';

    main.insertBefore(bar, player);
    main.insertBefore(frameWrap, player.nextSibling);

    els.bar = bar;
    els.wrap = frameWrap;
    els.frame = frameWrap.querySelector('.kodik-frame');
    els.note = frameWrap.querySelector('.kodik-note');

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.src-btn');
      if (btn) setSource(btn.getAttribute('data-src'));
    });

    var episodes = $('episodes');
    if (episodes) {
      episodes.addEventListener('click', function () {
        if (state.source === 'kodik') setTimeout(mount, 60);
      });
    }
  }

  function note(text) {
    if (!els.note) return;
    els.note.textContent = text || '';
    els.note.hidden = !text;
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

  function setSource(id) {
    if (id !== 'kodik' && id !== 'anilibria') return;
    if (state.source === id) return;
    state.source = id;
    saveSource(id);
    if (id === 'kodik') {
      stopNative();
      applyLayout();
      mount();
    } else {
      if (els.frame) els.frame.removeAttribute('src');
      note('');
      applyLayout();
    }
  }

  function search(query) {
    var url =
      'https://kodikapi.com/search?token=' +
      encodeURIComponent(token()) +
      '&limit=1&with_episodes=false&title=' +
      encodeURIComponent(query);

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var first = data && Array.isArray(data.results) ? data.results[0] : null;
        return first && first.link ? first.link : null;
      });
  }

  function resolveLink() {
    var key = titleName();
    if (state.link && state.linkFor === key) return Promise.resolve(state.link);

    var queries = [key, titleNameEn()].filter(Boolean);
    if (!queries.length) return Promise.resolve(null);

    return queries
      .reduce(function (chain, query) {
        return chain.then(function (found) {
          return found ? found : search(query);
        });
      }, Promise.resolve(null))
      .then(function (link) {
        state.link = link;
        state.linkFor = key;
        return link;
      });
  }

  function mount() {
    if (state.source !== 'kodik' || !els.frame) return;

    if (!token()) {
      els.frame.removeAttribute('src');
      note('Нужен ключ Kodik: добавьте kodikToken в config.js. До этого работает студия Anilibria.');
      return;
    }

    if (state.loading) return;
    state.loading = true;
    note('Ищем озвучку в Kodik…');

    resolveLink()
      .then(function (link) {
        state.loading = false;
        if (!link) {
          els.frame.removeAttribute('src');
          note('Kodik не нашёл это аниме. Попробуйте студию Anilibria.');
          return;
        }
        var base = link.indexOf('//') === 0 ? 'https:' + link : link;
        var sep = base.indexOf('?') === -1 ? '?' : '&';
        els.frame.src = base + sep + 'episode=' + currentEpisode();
        note('');
      })
      .catch(function () {
        state.loading = false;
        els.frame.removeAttribute('src');
        note('Kodik недоступен. Попробуйте студию Anilibria.');
      });
  }

  function onRoute() {
    var view = $('view-title');
    if (!view || view.hidden) return;

    build();
    if (!els.bar) return;

    if (state.linkFor && state.linkFor !== titleName()) {
      state.link = null;
      state.linkFor = null;
    }

    applyLayout();
    if (state.source === 'kodik') {
      stopNative();
      mount();
    }
  }

  state.source = savedSource();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(onRoute, 400);
    });
  } else {
    setTimeout(onRoute, 400);
  }

  window.addEventListener('hashchange', function () {
    setTimeout(onRoute, 500);
  });

  window.AnimKodik = { set: setSource, current: function () { return state.source; } };
})();
