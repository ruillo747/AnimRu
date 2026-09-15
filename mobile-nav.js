/* AnimRu — мобильная навигация v2. Пять основных разделов, безопасные зоны,
   корректная работа с экранной клавиатурой и повторное нажатие для прокрутки вверх. */
(function () {
  'use strict';

  var BREAKPOINT = 760;
  var items = [
    { href: '#/', label: 'Главная', route: function (h) { return h === '#/' || h === '' || h === '#'; }, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-5.8v-6.2H9.3V21H3.5a.5.5 0 0 1-.5-.5z"/></svg>' },
    { href: '#/catalog', label: 'Каталог', route: function (h) { return /^#\/(catalog|kodik)(?:\/|$)/.test(h); }, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>' },
    { href: '#/schedule', label: 'Расписание', route: function (h) { return /^#\/schedule(?:\/|$)/.test(h); }, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/></svg>' },
    { href: '#/top', label: 'Топ', route: function (h) { return /^#\/top(?:\/|$)/.test(h); }, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg>' },
    { href: '#/profile', label: 'Профиль', route: function (h) { return /^#\/profile(?:\/|$)/.test(h); }, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-4.2 3.2-6.3 7.5-6.3s6.8 2.1 7.5 6.3"/></svg>' }
  ];

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
    nav.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      if (!link) return;
      if (link.getAttribute('aria-current') === 'page') {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    });
    document.body.appendChild(nav);
    return nav;
  }

  function syncActive() {
    var nav = createNav();
    var hash = location.hash || '#/';
    Array.prototype.slice.call(nav.querySelectorAll('a')).forEach(function (link, index) {
      if (items[index].route(hash)) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function syncViewport() {
    var nav = createNav();
    var mobile = window.innerWidth <= BREAKPOINT;
    nav.setAttribute('aria-hidden', mobile ? 'false' : 'true');
    document.documentElement.style.setProperty('--app-vh', ((window.visualViewport ? window.visualViewport.height : window.innerHeight) * 0.01) + 'px');
    var keyboard = !!window.visualViewport && window.visualViewport.height < window.innerHeight * 0.72;
    document.documentElement.classList.toggle('app-keyboard-open', mobile && keyboard);
  }

  function start() {
    createNav();
    syncActive();
    syncViewport();
    window.addEventListener('hashchange', syncActive);
    window.addEventListener('resize', syncViewport, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewport, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
