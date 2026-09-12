/* AnimRu: полный экран в приложении, защита от горизонтальной прокрутки
   и резервные пути доступа к Kodik (зеркало домена, CORS-передатчики, свой токен). */
(function () {
  'use strict';

  var LS_TOKEN = 'animru:kodik-token';

  var CSS = [
    /* только защита от выезда за экран, без вмешательства в раскладку шапки */
    'html,body{max-width:100%;overflow-x:hidden}',
    'img,video,iframe{max-width:100%}',
    /* на телефоне шапка переносилась второй строкой и ложилась на контент */
    '@media (max-width:760px){' +
      '.topbar-inner{position:relative;flex-wrap:nowrap !important;gap:8px !important}' +
      '.lvl-chip{display:none !important}' +
      /* прячем меню только закрытое, иначе кнопка гамбургера ничего не открывает */
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
    /* запасной полный экран для WebView без Fullscreen API */
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

  /* ---------------- Kodik: зеркало домена и CORS-передатчики ---------------- */

  var HOSTS = ['kodik-api.com', 'kodikapi.com'];
  var LS_ROUTE = 'animru:kodik-route';

  /* Браузеру API Kodik отвечает без заголовков CORS (и часто режется провайдером),
     поэтому держим очередь передатчиков и запоминаем тот, который сработал. */
  var PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?url=',
    'https://proxy.cors.sh/'
  ];
  var lastError = '';

  function readRoute() {
    try { return localStorage.getItem(LS_ROUTE) || ''; } catch (e) { return ''; }
  }

  function writeRoute(prefix) {
    try { localStorage.setItem(LS_ROUTE, prefix); } catch (e) {}
  }

  function swapHost(url) {
    for (var i = 0; i < HOSTS.length; i++) {
      if (url.indexOf(HOSTS[i]) > -1) return url.replace(HOSTS[i], HOSTS[(i + 1) % HOSTS.length]);
    }
    return '';
  }

  (function patchFetch() {
    if (!window.fetch || window.fetch.animruPatched) return;
    var original = window.fetch.bind(window);

    function once(url, init) {
      return original(url, init).then(function (res) {
        if (res && res.ok) return res;
        throw new Error('ответ сервера ' + (res && res.status));
      });
    }

    /* Список попыток: прямой адрес, зеркало домена, затем передатчики с CORS. */
    function candidates(url) {
      var direct = [url];
      var alt = swapHost(url);
      if (alt) direct.push(alt);
      var list = [];
      var saved = readRoute();
      if (saved) {
        list.push(saved === 'direct' ? url : saved + encodeURIComponent(url));
      }
      direct.forEach(function (item) { list.push(item); });
      PROXIES.forEach(function (prefix) {
        direct.forEach(function (item) { list.push(prefix + encodeURIComponent(item)); });
      });
      return list;
    }

    function routeOf(target, url) {
      if (target === url) return 'direct';
      for (var i = 0; i < PROXIES.length; i++) {
        if (target.indexOf(PROXIES[i]) === 0) return PROXIES[i];
      }
      return 'direct';
    }

    function patched(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!url || HOSTS.every(function (host) { return url.indexOf(host) === -1; })) {
        return original(input, init);
      }
      var list = candidates(url);
      var index = 0;

      function attempt() {
        if (index >= list.length) {
          return Promise.reject(new Error(lastError || 'Kodik недоступен'));
        }
        var target = list[index++];
        return once(target, init)
          .then(function (res) {
            writeRoute(routeOf(target, url));
            return res;
          })
          .catch(function (err) {
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
        ? 'Каталог пуст: ни один путь до Kodik не ответил (' + lastError + '). В приложении запросы идут напрямую и работают надёжнее.'
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

  /* CDN Anilibria не отдаёт заголовки CORS, поэтому в обычном браузере
     страница не может прочитать видео. В приложении это делает нативный прокси,
     поэтому вне приложения честно говорим об этом вместо бесконечной ошибки. */
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

  /* ---------------- iframe Kodik: разрешаем полный экран и даём свою кнопку ---------------- */

  function prepareFrames() {
    Array.prototype.slice.call(document.querySelectorAll('iframe')).forEach(function (frame) {
      if (frame.dataset.fsReady) return;
      frame.dataset.fsReady = '1';
      frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
      frame.setAttribute('allowfullscreen', 'true');
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
