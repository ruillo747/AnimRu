/* AnimRu: мобильная раскладка, полный экран в приложении и поле для своего токена Kodik.
   Сеть до Kodik целиком отвечает kodik-net.js; здесь остался только запасной путь
   для старых сборок, где этого модуля нет. */
(function () {
  'use strict';

  var LS_TOKEN = 'animru:kodik-token';
  var LS_ROUTE = 'animru:kodik-route';

  var CSS = [
    'html,body{max-width:100%;overflow-x:hidden}',
    'img,video,iframe{max-width:100%}',
    '@media (max-width:760px){' +
      '.topbar-inner{position:relative;flex-wrap:nowrap !important;gap:8px !important}' +
      '.lvl-chip{display:none !important}' +
      '.nav:not(.open){display:none !important}' +
      '.nav.open{display:flex !important;flex-direction:column;gap:2px;position:absolute;top:100%;left:0;right:0;' +
        'padding:8px 12px 12px;background:var(--surface);border-bottom:1px solid var(--line);z-index:60}' +
      '.nav.open .nav-link{padding:10px 4px;font-size:15px}' +
      '.logo{flex:0 0 auto}' +
      '.search-wrap{flex:1 1 auto;min-width:0}' +
      '.search{width:100% !important;min-width:0 !important}' +
      '#searchInput{width:100%;min-width:0}' +
      '.acc-btn{flex:0 0 auto;white-space:nowrap;padding:7px 11px;font-size:13px}' +
      '.icon-btn{flex:0 0 auto}' +
      '.suggest{left:0;right:0;width:auto}' +
    '}',
    /* каталог Kodik на телефоне: фильтры прокручиваются вбок, сетка в две карточки */
    '@media (max-width:760px){' +
      '.kb-filters{gap:8px}' +
      '.kb-filters .kb-row,.kb-chips,.kb-genres{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:8px;' +
        'padding-bottom:4px;scrollbar-width:none;-webkit-overflow-scrolling:touch}' +
      '.kb-filters .kb-row::-webkit-scrollbar,.kb-chips::-webkit-scrollbar,.kb-genres::-webkit-scrollbar{display:none}' +
      '.kb-filters .kb-btn,.kb-chip{flex:0 0 auto;white-space:nowrap}' +
      '.kb-filters select,.kb-filters input{min-width:0;max-width:100%}' +
      '.kb-grid{grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:10px}' +
      '.kb-card-title,.kb-title{font-size:13px;line-height:1.3}' +
      '.kb-frame,#kbFrame{width:100%;aspect-ratio:16/9;height:auto;min-height:0}' +
      '#kbEpisodes,#kbVoices{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;padding-bottom:4px;' +
        'scrollbar-width:none}' +
      '#kbEpisodes::-webkit-scrollbar,#kbVoices::-webkit-scrollbar{display:none}' +
      '#kbEpisodes>*,#kbVoices>*{flex:0 0 auto}' +
    '}',
    '.fs-fallback{position:fixed !important;inset:0 !important;width:100vw !important;height:100vh !important;' +
      'max-width:none !important;margin:0 !important;padding:0 !important;border:0 !important;border-radius:0 !important;' +
      'z-index:9999 !important;background:#000 !important}',
    '.fs-fallback iframe,.fs-fallback video,.fs-fallback .kb-frame,.fs-fallback .kodik-frame{' +
      'width:100% !important;height:100% !important;aspect-ratio:auto !important;border:0 !important;border-radius:0 !important}',
    'body.fs-lock{overflow:hidden}',
    '.fs-btn{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:6px 11px;border:1px solid var(--line);' +
      'border-radius:var(--r-sm);background:var(--surface-2);color:var(--text);font:inherit;font-size:13px;cursor:pointer}',
    '.fs-btn:hover{border-color:var(--accent)}',
    '.kt-box{display:grid;gap:6px;width:100%;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}',
    '.kt-row{display:flex;flex-wrap:wrap;gap:8px}',
    '.kt-row input{flex:1 1 190px;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-sm);' +
      'background:var(--surface-2);color:var(--text);font:inherit;font-size:13px}',
    '.kt-hint{font-size:12px;color:var(--dim);line-height:1.4}'
  ].join('');

  function injectCss() {
    if (document.getElementById('mobilefix-css')) return;
    var style = document.createElement('style');
    style.id = 'mobilefix-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* иконка сайта: без неё браузер каждый раз просит favicon.ico и получает 404 */
  var ICON =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="14" fill="#0a0a0b"/>' +
      '<path d="M20 46 32 18l12 28h-7l-5-12-5 12z" fill="#ff7a18"/></svg>'
    );

  function injectIcon() {
    if (document.querySelector('link[rel="icon"]')) return;
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = ICON;
    (document.head || document.documentElement).appendChild(link);
  }

  /* ---------------- Kodik: сеть ---------------- */

  var HOSTS = ['kodik-api.com', 'kodikapi.com'];
  var PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest='
  ];
  var lastError = '';

  function swapHost(url) {
    for (var i = 0; i < HOSTS.length; i++) {
      if (url.indexOf(HOSTS[i]) > -1) return url.replace(HOSTS[i], HOSTS[(i + 1) % HOSTS.length]);
    }
    return '';
  }

  /* Основной транспорт — kodik-net.js (свой Cloudflare Worker и подбор токена).
     Свою цепочку включаем только если этого модуля нет, иначе один запрос
     проходил бы через два перехватчика подряд. */
  (function patchFetch() {
    if (!window.fetch || window.fetch.animruPatched) return;
    if (window.AnimKodikNet) return;
    var original = window.fetch.bind(window);

    function once(url, init) {
      return original(url, init).then(function (res) {
        if (res && res.ok) return res;
        throw new Error('ответ сервера ' + (res && res.status));
      });
    }

    function candidates(url) {
      var direct = [url];
      var alt = swapHost(url);
      if (alt) direct.push(alt);
      var list = [];
      direct.forEach(function (item) { list.push(item); });
      PROXIES.forEach(function (prefix) {
        direct.forEach(function (item) { list.push(prefix + encodeURIComponent(item)); });
      });
      return list;
    }

    function patched(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!url || HOSTS.every(function (host) { return url.indexOf(host) === -1; })) {
        return original(input, init);
      }
      if (window.AnimKodikNet && window.AnimKodikNet.request) {
        return window.AnimKodikNet.request(url, init);
      }
      var list = candidates(url);
      var index = 0;

      function attempt() {
        if (index >= list.length) return Promise.reject(new Error(lastError || 'Kodik недоступен'));
        return once(list[index++], init).catch(function (err) {
          lastError = err.message || String(err);
          return attempt();
        });
      }

      return attempt();
    }

    patched.animruPatched = true;
    window.fetch = patched;
  })();

  /* Поле для своего токена: публичные токены Kodik периодически отключают. */
  function ensureTokenBox() {
    var filters = document.querySelector('.kb-filters');
    if (!filters || filters.querySelector('.kt-box')) return;

    var saved = '';
    try { saved = localStorage.getItem(LS_TOKEN) || ''; } catch (e) {}

    var box = document.createElement('div');
    box.className = 'kt-box';
    box.innerHTML =
      '<div class="kt-row"><input type="text" id="ktInput" placeholder="Свой токен Kodik" autocomplete="off" spellcheck="false">' +
      '<button class="kb-btn" type="button" id="ktSave">Применить</button></div>' +
      '<p class="kt-hint" id="ktHint"></p>';
    filters.appendChild(box);

    var input = box.querySelector('#ktInput');
    input.value = saved;
    box.querySelector('#ktSave').addEventListener('click', function () {
      var value = input.value.trim();
      try {
        if (value) localStorage.setItem(LS_TOKEN, value);
        else localStorage.removeItem(LS_TOKEN);
        localStorage.removeItem(LS_ROUTE);
      } catch (e) {}
      if (window.AnimKodikNet && window.AnimKodikNet.setToken) {
        window.AnimKodikNet.setToken(value);
      }
      location.reload();
    });
    updateHint();
  }

  function updateHint() {
    var hint = document.getElementById('ktHint');
    if (!hint) return;
    var status = document.getElementById('kbStatus');
    var empty = status && !status.hidden && /Ничего не нашлось/.test(status.textContent || '');
    if (empty) {
      hint.textContent = lastError
        ? 'Каталог пуст: ни один путь до Kodik не ответил (' + lastError + ').'
        : 'Каталог пуст. Можно подставить свой токен Kodik.';
    } else {
      hint.textContent = 'Токен нужен только если каталог Kodik пустой.';
    }
  }

  /* ---------------- полный экран ---------------- */

  function exitFallback() {
    var node = document.querySelector('.fs-fallback');
    if (node) node.classList.remove('fs-fallback');
    document.body.classList.remove('fs-lock');
  }

  function toggleFallback(node) {
    if (!node) return;
    if (node.classList.contains('fs-fallback')) {
      exitFallback();
      return;
    }
    exitFallback();
    node.classList.add('fs-fallback');
    document.body.classList.add('fs-lock');
  }

  function fullscreenActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function requestNative(node) {
    var call = node.requestFullscreen || node.webkitRequestFullscreen || node.webkitEnterFullscreen;
    if (!call) return Promise.reject(new Error('unsupported'));
    try {
      var result = call.call(node);
      return result && result.then ? result : Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function enter(node) {
    if (!node) return;
    if (fullscreenActive()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    if (node.classList.contains('fs-fallback')) {
      exitFallback();
      return;
    }
    requestNative(node).catch(function () { toggleFallback(node); });
    setTimeout(function () {
      if (!fullscreenActive() && !document.querySelector('.fs-fallback')) toggleFallback(node);
    }, 400);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('#pFull');
    if (!button) return;
    var player = document.getElementById('playerRoot') || button.closest('.player');
    setTimeout(function () {
      if (!fullscreenActive() && player) toggleFallback(player);
    }, 350);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') exitFallback();
  });

  /* ---------------- офлайн-копия ---------------- */

  var IN_APP = /AnimRu\//.test(navigator.userAgent || '');
  var APK = 'https://github.com/ruillo747/AnimRu/releases/download/android-latest/animru.apk';

  document.addEventListener('click', function (event) {
    if (IN_APP) return;
    var button = event.target.closest && event.target.closest('#dlBtn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var state = document.getElementById('dlState');
    if (state) {
      state.innerHTML =
        'Офлайн-копия работает только в приложении: браузеру источник запрещает читать файлы видео. ' +
        '<a href="' + APK + '">Скачать приложение</a>';
    }
  }, true);

  /* ---------------- iframe Kodik ---------------- */

  /* Достаточно одного атрибута allow: при обоих браузер пишет предупреждение
     «Allow attribute will take precedence over allowfullscreen». */
  function prepareFrames() {
    Array.prototype.slice.call(document.querySelectorAll('iframe')).forEach(function (frame) {
      if (frame.dataset.fsReady) return;
      frame.dataset.fsReady = '1';
      frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
      if (frame.hasAttribute('allowfullscreen')) frame.removeAttribute('allowfullscreen');
    });
  }

  function ensureKodikButton() {
    var frame = document.getElementById('kbFrame') || document.querySelector('.kodik-frame');
    if (!frame) return;
    var wrap = frame.closest('.kodik-wrap') || frame.parentElement;
    if (!wrap || wrap.querySelector('.fs-btn')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'fs-btn';
    button.textContent = '⛶ На весь экран';
    button.addEventListener('click', function () { enter(wrap); });
    wrap.appendChild(button);
  }

  function pass() {
    injectCss();
    injectIcon();
    prepareFrames();
    ensureKodikButton();
    ensureTokenBox();
    updateHint();
  }

  function start() {
    pass();
    window.addEventListener('hashchange', function () {
      exitFallback();
      setTimeout(pass, 400);
      setTimeout(pass, 1200);
    });
    var observer = new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(pass, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
