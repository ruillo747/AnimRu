/* AnimRu — переключатель между полноценными каталогами AniLibria и Kodik.
   Это обычные ссылки: они работают без зависимости от порядка загрузки модулей. */
(function () {
  'use strict';

  var CSS = [
    '.uc-toolbar{display:flex;align-items:center;margin:0 0 18px}',
    '.uc-sources{display:inline-grid;grid-template-columns:repeat(2,minmax(118px,1fr));gap:5px;padding:4px;' +
      'border:1px solid var(--line);border-radius:13px;background:var(--surface-2)}',
    '.uc-source{display:flex;align-items:center;justify-content:center;min-height:40px;padding:8px 16px;border-radius:9px;' +
      'color:var(--dim);font-size:13px;font-weight:700;text-decoration:none;transition:background-color 150ms ease,color 150ms ease}',
    '.uc-source:hover{color:var(--text)}',
    '.uc-source.active{background:var(--surface);color:var(--text);box-shadow:0 1px 5px rgba(0,0,0,.18)}',
    '#kodikFound{display:none!important}',
    '@media (max-width:620px){.uc-toolbar{margin-bottom:14px}.uc-sources{width:100%;grid-template-columns:repeat(2,1fr)}' +
      '.uc-source{min-height:44px;padding-inline:10px}}',
    '@media (prefers-reduced-motion:reduce){.uc-source{transition:none}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('unified-catalog-css')) return;
    var style = document.createElement('style');
    style.id = 'unified-catalog-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function route() {
    var hash = location.hash || '';
    if (/^#\/catalog(?:\?|$)/.test(hash)) return 'anilibria';
    if (/^#\/kodik\/?(?:\?|$)/.test(hash)) return 'kodik';
    return '';
  }

  function hostFor(source) {
    if (source === 'anilibria') return document.querySelector('#view-list .catalog-main');
    if (source === 'kodik') return document.getElementById('kbRoot');
    return null;
  }

  function makeToolbar(source) {
    var toolbar = document.createElement('nav');
    toolbar.id = 'ucToolbar';
    toolbar.className = 'uc-toolbar';
    toolbar.setAttribute('aria-label', 'Источник каталога');
    toolbar.innerHTML = '<div class="uc-sources">' +
      '<a class="uc-source' + (source === 'anilibria' ? ' active' : '') + '" href="#/catalog"' +
      (source === 'anilibria' ? ' aria-current="page"' : '') + '>AniLibria</a>' +
      '<a class="uc-source' + (source === 'kodik' ? ' active' : '') + '" href="#/kodik"' +
      (source === 'kodik' ? ' aria-current="page"' : '') + '>Kodik</a></div>';
    return toolbar;
  }

  function install() {
    var source = route();
    var toolbar = document.getElementById('ucToolbar');
    if (!source) {
      if (toolbar) toolbar.remove();
      return;
    }

    var host = hostFor(source);
    if (!host) return;
    var expected = source === 'kodik' ? '#/kodik' : '#/catalog';
    var active = toolbar && toolbar.querySelector('[aria-current="page"]');
    var correct = toolbar && toolbar.parentNode === host && active && active.getAttribute('href') === expected;
    if (!correct) {
      if (toolbar) toolbar.remove();
      toolbar = makeToolbar(source);
      host.insertBefore(toolbar, host.firstChild);
    }

    var duplicate = document.getElementById('kodikFound');
    if (duplicate) duplicate.hidden = true;
    var separate = document.querySelector('.nav [data-tab="kodik"]');
    if (separate) separate.hidden = true;
  }

  function schedule() {
    if (schedule.pending) return;
    schedule.pending = true;
    setTimeout(function () {
      schedule.pending = false;
      install();
    }, 80);
  }

  function start() {
    injectCss();
    var observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', function () {
      var toolbar = document.getElementById('ucToolbar');
      if (toolbar) toolbar.remove();
      schedule();
    });
    install();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
