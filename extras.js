/* AnimRu — мелочи удобства: тема, горячие клавиши, PWA,
   пропуск опенинга/эндинга и подключение своих субтитров. */
(function () {
  'use strict';

  var API = 'https://anilibria.top/api/v1';
  var LS_THEME = 'animru:theme';

  function $(id) { return document.getElementById(id); }

  function toast(message) {
    if (window.AnimAuth && window.AnimAuth.toast) window.AnimAuth.toast(message);
  }

  /* ---------------- тема ---------------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#eef1f7' : '#0b0d12');
    var button = $('themeBtn');
    if (button) {
      button.textContent = theme === 'light' ? '☾' : '☀';
      button.title = theme === 'light' ? 'Темная тема' : 'Светлая тема';
    }
  }

  var savedTheme = null;
  try { savedTheme = localStorage.getItem(LS_THEME); } catch (e) {}
  if (!savedTheme) {
    savedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme(savedTheme);

  var themeBtn = $('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(LS_THEME, next); } catch (e) {}
      applyTheme(next);
    });
  }

  /* ---------------- горячие клавиши ---------------- */

  function typing(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var modal = $('authModal');
    if (modal && !modal.hidden) return;
    if (typing(event.target)) return;

    if (event.key === '/') {
      var input = $('searchInput');
      if (input) { event.preventDefault(); input.focus(); input.select(); }
      return;
    }
    var routes = { h: '#/', c: '#/catalog', t: '#/top', p: '#/profile', r: '#/random', s: '#/schedule', k: '#/kodik' };
    var route = routes[event.key.toLowerCase()];
    if (route) { location.hash = route; }
  });

  /* ---------------- PWA ---------------- */

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  /* ---------------- подключение модулей: мобильные фиксы, офлайн, расписание, Kodik ---------------- */

  (function bootstrapModules() {
    if (!document.getElementById('extras-css')) {
      var style = document.createElement('style');
      style.id = 'extras-css';
      style.textContent = [
        '.src-bar{margin-top:12px}',
        '@media (max-width:900px){.src-bar{margin-top:8px}}',
        /* панель управления уходит во время воспроизведения, даже если курсор или фокус на плеере */
        '.player.hide-ui .p-controls{opacity:0 !important;pointer-events:none !important}',
        '@media (hover:none){.player.hide-ui .p-controls{opacity:1 !important;pointer-events:auto !important}}'
      ].join('');
      document.head.appendChild(style);
    }
    ['mobilefix.js', 'offline.js', 'schedule.js', 'kodik-browse.js'].forEach(function (file) {
      if (document.querySelector('script[src*="' + file + '"]')) return;
      var script = document.createElement('script');
      script.src = file + '?v=12';
      script.defer = true;
      document.body.appendChild(script);
    });
  })();

  /* ---------------- чистка вывода: оценка без значения и описание с HTML ---------------- */

  (function fixOutput() {
    function fixScores(root) {
      Array.prototype.slice.call(root.querySelectorAll('.top-score')).forEach(function (node) {
        var value = parseFloat(node.textContent);
        var next = isFinite(value) ? value.toFixed(1) : '—';
        if (node.textContent !== next) node.textContent = next;
        node.title = isFinite(value) ? 'Оценка' : 'Оценок пока нет';
      });
    }

    /* Anilibria отдаёт описание с тегами <br>, <font>, <a>: показываем его как обычный текст */
    function fixDescription(node) {
      var raw = node.textContent || '';
      if (raw.indexOf('<') < 0 && raw.indexOf('&') < 0) return;
      var html = raw.replace(/<br\s*\/?>/gi, '\n');
      var holder = document.createElement('div');
      holder.innerHTML = html;
      var text = (holder.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
      if (text && text !== raw) node.textContent = text;
    }

    function pass() {
      var desc = $('tDesc');
      if (desc) {
        desc.style.whiteSpace = 'pre-line';
        fixDescription(desc);
      }
      fixScores(document);
    }

    var observer = new MutationObserver(function () {
      clearTimeout(pass.timer);
      pass.timer = setTimeout(pass, 60);
    });
    ['topList', 'topPreview', 'tDesc'].forEach(function (id) {
      var node = $(id);
      if (node) observer.observe(node, { childList: true, characterData: true, subtree: true });
    });
    window.addEventListener('hashchange', function () { setTimeout(pass, 400); });
    setTimeout(pass, 500);
  })();

  /* ---------------- плеер: автоскрытие панели, пропуск заставки и субтитры ---------------- */

  var video = $('player');
  var playerRoot = $('playerRoot');
  if (!video || !playerRoot) return;

  /* после клика по кнопкам снимаем фокус, иначе :focus-within держит панель на виду */
  playerRoot.addEventListener('click', function (event) {
    var button = event.target.closest('.p-btn, .p-bigplay');
    if (button) setTimeout(function () { button.blur(); }, 0);
  });

  var marks = { titleId: null, episodes: {} };
  var skipButton = null;
  var subtitleUrl = null;

  function ensureSkipButton() {
    if (skipButton) return skipButton;
    skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'p-skip';
    skipButton.hidden = true;
    skipButton.addEventListener('click', function () {
      var to = Number(skipButton.dataset.to || 0);
      if (to > 0) video.currentTime = to;
      skipButton.hidden = true;
    });
    playerRoot.appendChild(skipButton);
    return skipButton;
  }

  function currentTitleId() {
    var match = (location.hash || '').match(/#\/[^/]+\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function currentEpisodeNumber() {
    var label = $('epLabel');
    if (!label) return null;
    var match = label.textContent.match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function loadMarks() {
    var id = currentTitleId();
    if (!id || marks.titleId === id) return;
    marks = { titleId: id, episodes: {} };
    fetch(API + '/anime/releases/' + encodeURIComponent(id))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.episodes) return;
        data.episodes.forEach(function (ep) {
          var num = Number(ep.ordinal);
          if (!num) return;
          marks.episodes[num] = {
            opening: ep.opening && ep.opening.start != null ? ep.opening : null,
            ending: ep.ending && ep.ending.start != null ? ep.ending : null
          };
        });
      })
      .catch(function () {});
  }

  video.addEventListener('timeupdate', function () {
    var button = ensureSkipButton();
    var episode = marks.episodes[currentEpisodeNumber()];
    if (!episode) { button.hidden = true; return; }
    var time = video.currentTime;

    function inRange(range) {
      return range && time >= Number(range.start) && time < Number(range.stop || range.end || 0) - 1;
    }

    if (inRange(episode.opening)) {
      button.textContent = 'Пропустить опенинг';
      button.dataset.to = String(episode.opening.stop || episode.opening.end || 0);
      button.hidden = false;
    } else if (inRange(episode.ending)) {
      button.textContent = 'Пропустить эндинг';
      button.dataset.to = String(episode.ending.stop || episode.ending.end || 0);
      button.hidden = false;
    } else {
      button.hidden = true;
    }
  });

  window.addEventListener('hashchange', function () { setTimeout(loadMarks, 300); });
  setTimeout(loadMarks, 600);

  /* Субтитры: подключаем свой файл .vtt или .srt к текущему видео. */
  function srtToVtt(text) {
    var body = text.replace(/\r+/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return 'WEBVTT\n\n' + body;
  }

  function attachSubtitles(file) {
    return file.text().then(function (text) {
      var vtt = /^WEBVTT/.test(text.trim()) ? text : srtToVtt(text);
      if (subtitleUrl) URL.revokeObjectURL(subtitleUrl);
      subtitleUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      Array.prototype.slice.call(video.querySelectorAll('track')).forEach(function (node) { node.remove(); });
      var track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = 'Свои субтитры';
      track.srclang = 'ru';
      track.default = true;
      track.src = subtitleUrl;
      video.appendChild(track);
      setTimeout(function () {
        if (video.textTracks && video.textTracks[0]) video.textTracks[0].mode = 'showing';
      }, 100);
      toast('Субтитры подключены');
    });
  }

  var controlsRow = document.querySelector('#pControls .p-row');
  if (controlsRow) {
    var subButton = document.createElement('button');
    subButton.type = 'button';
    subButton.className = 'p-btn p-text';
    subButton.id = 'pSubs';
    subButton.textContent = 'СТ';
    subButton.title = 'Подключить файл субтитров (.vtt или .srt)';
    subButton.addEventListener('click', function () {
      var tracks = video.textTracks;
      if (tracks && tracks.length) {
        tracks[0].mode = tracks[0].mode === 'showing' ? 'hidden' : 'showing';
        toast(tracks[0].mode === 'showing' ? 'Субтитры включены' : 'Субтитры выключены');
        return;
      }
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.vtt,.srt,text/vtt';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (file) attachSubtitles(file).catch(function () { toast('Не удалось прочитать файл субтитров'); });
      });
      input.click();
    });
    var pip = $('pPip');
    if (pip) controlsRow.insertBefore(subButton, pip);
    else controlsRow.appendChild(subButton);
  }
})();
