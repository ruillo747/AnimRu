/* Доступность и финальная доводка интерфейса без новых зависимостей. */
(function () {
  'use strict';
  var STYLE_ID = 'animru-quality-v35';
  var previousFocus = null;

  function byId(id) { return document.getElementById(id); }
  function toast(text) {
    if (window.AnimAuth && window.AnimAuth.toast) window.AnimAuth.toast(text);
  }

  function injectStyle() {
    if (byId(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'html{min-height:100%;scroll-padding-top:calc(var(--header-h) + 14px)}',
      'body{min-height:100dvh}',
      '.skip-link{position:fixed;left:12px;top:10px;z-index:120;transform:translateY(-160%);padding:9px 13px;border-radius:var(--r-sm);background:var(--accent);color:var(--accent-ink);font-weight:700}',
      '.skip-link:focus{transform:translateY(0)}',
      '.kc-search,.kc-toggle,.kc-pill{border-radius:var(--r-sm)!important}',
      '.kc-section-title{text-transform:none!important;letter-spacing:0!important;font-size:13px!important}',
      '.kc-rate{backdrop-filter:none!important}',
      '.kc-doc-note{display:none!important}',
      '.kc-type,.kc-toggle,.kc-advanced-btn,.kc-reset,.kc-more{min-height:44px}',
      '.nav-link,.btn,.icon-btn,.acc-btn,.link-btn{touch-action:manipulation}',
      '.card-poster img[data-broken="true"]{display:none}',
      '@media(hover:hover) and (pointer:fine){.card,.kc-card .card-poster,.nav-link,.btn,.icon-btn{transition:border-color 160ms ease,color 160ms ease,background-color 160ms ease,transform 160ms var(--ease-out,cubic-bezier(.23,1,.32,1))}.kc-card:hover .card-poster{transform:translateY(-2px)}}',
      '@media(max-width:620px){.wrap{padding-left:max(14px,env(safe-area-inset-left));padding-right:max(14px,env(safe-area-inset-right))}.topbar{padding-top:env(safe-area-inset-top);height:calc(var(--header-h) + env(safe-area-inset-top))}.kc-head-actions{display:grid!important;grid-template-columns:minmax(0,1fr) auto}.kc-search{width:100%!important}.kc-layout{gap:14px!important}.kc-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}}',
      '@media(prefers-reduced-motion:reduce){.skip-link,.card,.kc-card .card-poster,.nav-link,.btn,.icon-btn{transition-duration:80ms!important;animation-duration:160ms!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  function addSkipLink() {
    if (document.querySelector('.skip-link')) return;
    var link = document.createElement('a');
    link.className = 'skip-link';
    link.href = '#app';
    link.textContent = 'К содержанию';
    document.body.insertBefore(link, document.body.firstChild);
    var app = byId('app');
    if (app && !app.hasAttribute('tabindex')) app.tabIndex = -1;
  }

  function addKodikNavigation() {
    var nav = byId('nav');
    if (!nav || nav.querySelector('[href="#/kodik"]')) return;
    var link = document.createElement('a');
    link.href = '#/kodik';
    link.className = 'nav-link';
    link.dataset.tab = 'kodik';
    link.textContent = 'Kodik';
    nav.appendChild(link);
  }

  function improveCatalog() {
    var search = byId('kcSearch');
    if (search && !search.getAttribute('aria-label')) search.setAttribute('aria-label', 'Поиск в каталоге Kodik');
    var grid = byId('kcGrid');
    if (grid) {
      grid.setAttribute('aria-live', 'polite');
      grid.setAttribute('aria-busy', String(!!(window.AnimCatalog && window.AnimCatalog.state().loading)));
    }
    var status = byId('kcState');
    if (status) { status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); }
    var count = byId('kcCount');
    if (count) count.setAttribute('aria-live', 'polite');
    var nestedMain = document.querySelector('#app main.kc-main');
    if (nestedMain) nestedMain.setAttribute('role', 'region');
  }

  function handleBrokenImages(root) {
    Array.prototype.slice.call((root || document).querySelectorAll('img:not([data-error-bound])')).forEach(function (image) {
      image.dataset.errorBound = 'true';
      image.addEventListener('error', function () {
        image.dataset.broken = 'true';
        image.removeAttribute('src');
      }, { once: true });
    });
  }

  function focusable(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(function (node) {
      return !node.hidden && node.getClientRects().length;
    });
  }

  function watchModal() {
    var modal = byId('authModal');
    if (!modal || modal.dataset.focusManaged) return;
    modal.dataset.focusManaged = 'true';
    var observer = new MutationObserver(function () {
      if (!modal.hidden) {
        previousFocus = document.activeElement;
        var nodes = focusable(modal);
        if (nodes[0]) setTimeout(function () { nodes[0].focus(); }, 0);
      } else if (previousFocus && previousFocus.focus) {
        previousFocus.focus();
        previousFocus = null;
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    modal.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      var nodes = focusable(modal);
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  function pass() {
    injectStyle();
    addSkipLink();
    addKodikNavigation();
    improveCatalog();
    handleBrokenImages(document);
    watchModal();
  }

  window.addEventListener('offline', function () { toast('Нет сети. Доступны сохранённые страницы и серии.'); });
  window.addEventListener('online', function () { toast('Соединение восстановлено'); });
  window.addEventListener('hashchange', function () { setTimeout(pass, 80); });

  function start() {
    pass();
    var observer = new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(pass, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
