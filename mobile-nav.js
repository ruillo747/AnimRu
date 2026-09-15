/* AnimRu — мобильная навигация: сверху остаётся поиск, основные разделы
   переезжают в плавающую нижнюю панель в стиле нативного приложения. */
(function () {
  'use strict';

  var BREAKPOINT = 760;
  var items = [
    {
      href: '#/',
      label: 'Главная',
      route: function (hash) { return hash === '#/' || hash === '' || hash === '#'; },
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-5.8v-6.2H9.3V21H3.5a.5.5 0 0 1-.5-.5z"/></svg>'
    },
    {
      href: '#/catalog',
      label: 'Каталог',
      route: function (hash) { return /^#\/(catalog|kodik)(?:\/|$)/.test(hash); },
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>'
    },
    {
      href: '#/top',
      label: 'Топ',
      route: function (hash) { return /^#\/top(?:\/|$)/.test(hash); },
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg>'
    },
    {
      href: '#/profile',
      label: 'Профиль',
      route: function (hash) { return /^#\/profile(?:\/|$)/.test(hash); },
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-4.2 3.2-6.3 7.5-6.3s6.8 2.1 7.5 6.3"/></svg>'
    }
  ];

  var CSS = [
    '.mobile-bottom-nav{display:none}',
    '@media (max-width:' + BREAKPOINT + 'px){',
      'body{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}',
      '.topbar{background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}',
      '.topbar-inner{min-height:64px;padding-top:max(8px,env(safe-area-inset-top,0px));padding-bottom:8px}',
      '.topbar .logo,.topbar .nav,.topbar .lvl-chip,.topbar .acc-btn,.topbar .theme-btn,.topbar .menu-btn{display:none !important}',
      '.topbar .search-wrap{display:block !important;flex:1 1 100%;width:100%;max-width:none;margin:0}',
      '.topbar .search{width:100% !important;min-width:0 !important;height:46px;border-radius:16px;background:var(--surface-2)}',
      '.topbar #searchInput{width:100%;min-width:0;font-size:16px}',
      '.mobile-bottom-nav{position:fixed;left:50%;bottom:max(12px,env(safe-area-inset-bottom,0px));z-index:75;display:grid;grid-template-columns:repeat(4,1fr);' +
        'width:min(calc(100vw - 24px),430px);min-height:70px;padding:7px;border:1px solid color-mix(in srgb,var(--text) 16%,transparent);' +
        'border-radius:30px;background:color-mix(in srgb,var(--surface) 90%,transparent);box-shadow:0 18px 44px rgba(0,0,0,.36);' +
        'backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);transform:translateX(-50%);isolation:isolate}',
      '.mobile-bottom-nav a{position:relative;display:flex;min-width:0;min-height:56px;align-items:center;justify-content:center;gap:3px;flex-direction:column;' +
        'border-radius:23px;color:var(--dim);text-decoration:none;-webkit-tap-highlight-color:transparent;transition:background-color 160ms ease,color 160ms ease,transform 120ms ease}',
      '.mobile-bottom-nav a:active{transform:scale(.96)}',
      '.mobile-bottom-nav a[aria-current="page"]{background:color-mix(in srgb,var(--text) 16%,transparent);color:var(--text)}',
      '.mobile-bottom-nav svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
      '.mobile-bottom-nav a:nth-child(3) svg{fill:currentColor;stroke:none}',
      '.mobile-bottom-nav span{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:10px;font-weight:650;line-height:1.15;white-space:nowrap}',
      '.toast{bottom:calc(96px + env(safe-area-inset-bottom,0px))}',
      '.player.ap-mini{bottom:calc(96px + env(safe-area-inset-bottom,0px)) !important}',
    '}',
    '@media (max-width:370px){.mobile-bottom-nav span{font-size:9px}.mobile-bottom-nav{width:calc(100vw - 16px)}}',
    '@media (prefers-reduced-motion:reduce){.mobile-bottom-nav a{transition:none}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('mobile-nav-css')) return;
    var style = document.createElement('style');
    style.id = 'mobile-nav-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function createNav() {
    var current = document.getElementById('mobileBottomNav');
    if (current) return current;
    var nav = document.createElement('nav');
    nav.id = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Основная навигация');
    nav.innerHTML = items.map(function (item) {
      return '<a href="' + item.href + '" aria-label="' + item.label + '">' + item.icon + '<span>' + item.label + '</span></a>';
    }).join('');
    document.body.appendChild(nav);
    return nav;
  }

  function syncActive() {
    var nav = createNav();
    var hash = location.hash || '#/';
    Array.prototype.slice.call(nav.querySelectorAll('a')).forEach(function (link, index) {
      var active = items[index].route(hash);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function syncVisibility() {
    var nav = createNav();
    nav.setAttribute('aria-hidden', window.innerWidth > BREAKPOINT ? 'true' : 'false');
  }

  function start() {
    injectCss();
    createNav();
    syncActive();
    syncVisibility();
    window.addEventListener('hashchange', syncActive);
    window.addEventListener('resize', syncVisibility, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
