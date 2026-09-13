/* AnimRu — переключатель каталогов AniLibria и Kodik.
   Каждый источник сохраняет собственные фильтры и собственную пагинацию. */
(function () {
  'use strict';

  var CSS = [
    '.uc-toolbar{display:flex;justify-content:flex-start;margin:0 0 16px}',
    '.uc-sources{display:inline-grid;grid-template-columns:repeat(2,minmax(112px,1fr));gap:5px;padding:4px;' +
      'border:1px solid var(--line);border-radius:13px;background:var(--surface-2)}',
    '.uc-source{min-height:38px;padding:8px 14px;border:0;border-radius:9px;background:transparent;color:var(--dim);' +
      'font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:background-color 150ms ease,color 150ms ease}',
    '.uc-source[aria-pressed="true"]{background:var(--surface);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.16)}',
    '#kodikFound{display:none!important}',
    '@media (max-width:620px){.uc-toolbar{margin-bottom:12px}.uc-sources{width:100%;grid-template-columns:repeat(2,1fr)}' +
      '.uc-source{min-height:42px}}',
    '@media (prefers-reduced-motion:reduce){.uc-source{transition:none}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('unified-catalog-css')) return;
    var style = document.createElement('style');
    style.id = 'unified-catalog-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function source() {
    var hash = location.hash || '';
    if (/^#\/kodik(?:\?|$)/.test(hash)) return 'kodik';
    if (/^#\/catalog(?:\?|$)/.test(hash)) return 'anilibria';
    return '';
  }

  function markup(active) {
    return '<div class="uc-sources" role="group" aria-label="Источник каталога">' +
      '<button class="uc-source" type="button" data-source="anilibria" aria-pressed="' +
      (active === 'anilibria' ? 'true' : 'false') + '">AniLibria</button>' +
      '<button class="uc-source" type="button" data-source="kodik" aria-pressed="' +
      (active === 'kodik' ? 'true' : 'false') + '">Kodik</button></div>';
  }

  function hostFor(active) {
    if (active === 'anilibria') return document.querySelector('#view-list .catalog-main');
    if (active === 'kodik') return document.getElementById('kbRoot');
    return null;
  }

  function install() {
    var active = source();
    var existing = document.getElementById('ucToolbar');
    if (!active) {
      if (existing) existing.remove();
      return;
    }

    var host = hostFor(active);
    if (!host) return;
    if (!existing || existing.parentNode !== host) {
      if (existing) existing.remove();
      existing = document.createElement('div');
      existing.id = 'ucToolbar';
      existing.className = 'uc-toolbar';
      existing.addEventListener('click', function (event) {
        var button = event.target.closest('[data-source]');
        if (!button) return;
        var next = button.getAttribute('data-source');
        location.hash = next === 'kodik' ? '#/kodik' : '#/catalog';
      });
      host.insertBefore(existing, host.firstChild);
    }
    existing.innerHTML = markup(active);

    /* Старый отдельный пункт Kodik больше не нужен: оба каталога доступны
       через один переключатель. */
    var separate = document.querySelector('.nav [data-tab="kodik"]');
    if (separate) separate.hidden = true;
    var duplicate = document.getElementById('kodikFound');
    if (duplicate) duplicate.hidden = true;
  }

  function schedule() {
    clearTimeout(schedule.timer);
    schedule.timer = setTimeout(install, 60);
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
