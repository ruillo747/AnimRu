/* AnimRu: полноэкранный режим в приложении, запас по ширине на телефоне
   и подстраховка запросов к Kodik через второй домен. */
(function () {
  'use strict';

  var CSS = [
    /* ширина: ничего не выезжает за экран */
    'html,body{max-width:100%;overflow-x:hidden}',
    'img,video,iframe,table,select,input{max-width:100%}',
    '@media (max-width:760px){',
    '.topbar,.header,header .inner,header>div{flex-wrap:wrap;row-gap:8px}',
    '.logo{flex:none}',
    '.search,.search-box,#searchInput{min-width:0;flex:1 1 120px}',
    '.kb-field,.filter-field{min-width:0;flex:1 1 130px}',
    '.kb-filters{padding:12px}',
    '}',
    /* запасной полный экран: используем, когда WebView не даёт настоящий Fullscreen API */
    '.fs-fallback{position:fixed !important;inset:0 !important;width:100vw !important;height:100vh !important;' +
      'max-width:none !important;margin:0 !important;padding:0 !important;border:0 !important;border-radius:0 !important;' +
      'z-index:9999 !important;background:#000 !important}',
    '.fs-fallback iframe,.fs-fallback video,.fs-fallback .kb-frame,.fs-fallback .kodik-frame{' +
      'width:100% !important;height:100% !important;aspect-ratio:auto !important;border:0 !important;border-radius:0 !important}',
    'body.fs-lock{overflow:hidden}',
    '.fs-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid var(--line);' +
      'border-radius:var(--r-sm);background:var(--surface-2);color:var(--text);font:inherit;font-size:13px;cursor:pointer}',
    '.fs-btn:hover{border-color:var(--accent)}'
  ].join('');

  function injectCss() {
    if (document.getElementById('mobilefix-css')) return;
    var style = document.createElement('style');
    style.id = 'mobilefix-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ---------------- Kodik: второй домен, если первый не отвечает ---------------- */

  var HOSTS = ['kodik-api.com', 'kodikapi.com'];

  function swapHost(url) {
    for (var i = 0; i < HOSTS.length; i++) {
      if (url.indexOf(HOSTS[i]) > -1) return url.replace(HOSTS[i], HOSTS[(i + 1) % HOSTS.length]);
    }
    return '';
  }

  (function patchFetch() {
    if (!window.fetch || window.fetch.animruPatched) return;
    var original = window.fetch.bind(window);

    function patched(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!url || HOSTS.every(function (host) { return url.indexOf(host) === -1; })) {
        return original(input, init);
      }
      return original(url, init)
        .then(function (res) {
          if (res && res.ok) return res;
          throw new Error('HTTP ' + (res && res.status));
        })
        .catch(function (error) {
          var alt = swapHost(url);
          if (!alt) throw error;
          return original(alt, init);
        });
    }

    patched.animruPatched = true;
    window.fetch = patched;
  })();

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

  function fullscreenActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
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

  /* кнопка плеера Anilibria: если системный полный экран не сработал, включаем запасной */
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

  /* ---------------- iframe Kodik: разрешаем полный экран и добавляем свою кнопку ---------------- */

  function prepareFrames() {
    Array.prototype.slice.call(document.querySelectorAll('iframe')).forEach(function (frame) {
      if (frame.dataset.fsReady) return;
      frame.dataset.fsReady = '1';
      frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
      frame.setAttribute('allowfullscreen', 'true');
      var sandbox = frame.getAttribute('sandbox');
      if (sandbox && sandbox.indexOf('allow-popups') === -1) {
        frame.setAttribute('sandbox', sandbox + ' allow-popups');
      }
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
    var note = wrap.querySelector('.kb-note, .kodik-ad-note, .kodik-note');
    if (note) note.parentNode.insertBefore(button, note);
    else wrap.appendChild(button);
  }

  function pass() {
    injectCss();
    prepareFrames();
    ensureKodikButton();
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
      start.timer = setTimeout(pass, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
