/* AnimRu: расписание выхода серий на неделю (Anilibria). */
(function () {
  'use strict';

  var API = 'https://anilibria.top/api/v1';
  var NO_POSTER =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect fill="#1c2027" width="200" height="300"/></svg>'
    );

  var DAYS = [
    { key: 1, name: 'Понедельник' },
    { key: 2, name: 'Вторник' },
    { key: 3, name: 'Среда' },
    { key: 4, name: 'Четверг' },
    { key: 5, name: 'Пятница' },
    { key: 6, name: 'Суббота' },
    { key: 7, name: 'Воскресенье' }
  ];

  var CSS = [
    '#view-schedule .sch-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin:6px 0 18px}',
    '#view-schedule h1{margin:0}',
    '.sch-day{margin-bottom:26px}',
    '.sch-day-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}',
    '.sch-day-name{font-size:16px;font-weight:600}',
    '.sch-today{font-size:11.5px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;' +
      'padding:3px 8px;border-radius:999px;background:var(--accent);color:var(--accent-ink)}',
    '.sch-count{font-size:12.5px;color:var(--dim)}',
    '.sch-line{flex:1;height:1px;background:var(--line)}',
    '.sch-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}',
    '.sch-card{display:grid;gap:8px;color:inherit;text-decoration:none}',
    '.sch-thumb{position:relative;aspect-ratio:2/3;border-radius:var(--r);overflow:hidden;' +
      'border:1px solid var(--line);background:var(--surface-2)}',
    '.sch-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
    '.sch-card:hover .sch-thumb{border-color:var(--accent)}',
    '.sch-ep{position:absolute;left:8px;bottom:8px;padding:3px 8px;border-radius:999px;font-size:11.5px;' +
      'font-weight:600;background:rgba(10,10,11,.82);color:#fff}',
    '.sch-name{font-size:13.5px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.sch-sub{font-size:12px;color:var(--dim)}',
    '.sch-empty{font-size:13px;color:var(--dim)}',
    '@media (max-width:520px){.sch-grid{grid-template-columns:repeat(auto-fill,minmax(116px,1fr))}}'
  ].join('');

  var view = null;
  var loaded = false;
  var loading = false;

  function injectCss() {
    if (document.getElementById('schedule-css')) return;
    var tag = document.createElement('style');
    tag.id = 'schedule-css';
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }

  function addNavLink() {
    var nav = document.getElementById('nav');
    if (!nav || nav.querySelector('[data-tab="schedule"]')) return;
    var link = document.createElement('a');
    link.href = '#/schedule';
    link.className = 'nav-link';
    link.dataset.tab = 'schedule';
    link.textContent = 'Расписание';
    var after = nav.querySelector('[data-tab="catalog"]');
    if (after && after.nextSibling) nav.insertBefore(link, after.nextSibling);
    else nav.appendChild(link);
  }

  function buildView() {
    if (view) return view;
    var app = document.getElementById('app');
    if (!app) return null;
    view = document.createElement('section');
    view.id = 'view-schedule';
    view.className = 'view wrap';
    view.hidden = true;
    view.innerHTML =
      '<div class="sch-head"><h1>Расписание</h1>' +
      '<span class="muted small" id="schStatus"></span></div>' +
      '<div id="schBody"></div>';
    app.appendChild(view);
    return view;
  }

  function status(text) {
    var node = document.getElementById('schStatus');
    if (node) node.textContent = text || '';
  }

  function posterOf(release) {
    var poster = release && release.poster;
    var src = (poster && ((poster.optimized && poster.optimized.src) || poster.src)) || '';
    if (!src) return NO_POSTER;
    return /^https?:/.test(src) ? src : 'https://anilibria.top' + src;
  }

  function nameOf(release) {
    return (release && release.name && (release.name.main || release.name.english)) || 'Без названия';
  }

  function dayOf(item, release) {
    var day = (item && (item.publish_day || item.day)) || (release && release.publish_day);
    if (day && typeof day === 'object') day = day.value;
    var num = parseInt(day, 10);
    if (num >= 1 && num <= 7) return num;
    return 0;
  }

  function todayKey() {
    var js = new Date().getDay();
    return js === 0 ? 7 : js;
  }

  function request(path, params) {
    var url = new URL(API + path);
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] != null && params[key] !== '') url.searchParams.set(key, params[key]);
    });
    return fetch(url.toString(), { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function listOf(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && typeof json === 'object') {
      var flat = [];
      Object.keys(json).forEach(function (key) {
        if (Array.isArray(json[key])) {
          json[key].forEach(function (entry) {
            flat.push({ day: key, release: entry.release || entry, episode: entry.new_episode || entry.episode });
          });
        }
      });
      return flat;
    }
    return [];
  }

  function fetchSchedule() {
    return request('/anime/schedule/week')
      .then(listOf)
      .then(function (items) {
        if (!items.length) throw new Error('empty');
        return items;
      })
      .catch(function () {
        return request('/anime/catalog/releases', { 'f[is_ongoing]': true, limit: 100 })
          .then(listOf)
          .then(function (items) {
            return items.map(function (entry) {
              return { release: entry };
            });
          });
      });
  }

  function cardHtml(release, episode) {
    var bits = [];
    if (release.year) bits.push(release.year);
    if (release.type && release.type.description) bits.push(release.type.description);
    var epNum = episode && (episode.ordinal || episode.sort_order);
    return (
      '<a class="sch-card" href="#/title/' +
      encodeURIComponent(release.id) +
      '"><span class="sch-thumb"><img loading="lazy" src="' +
      posterOf(release) +
      '" alt="">' +
      (epNum ? '<span class="sch-ep">' + epNum + ' серия</span>' : '') +
      '</span><span class="sch-name">' +
      nameOf(release).replace(/[<>]/g, '') +
      '</span><span class="sch-sub">' +
      bits.join(' · ') +
      '</span></a>'
    );
  }

  function render(items) {
    var byDay = {};
    DAYS.forEach(function (day) {
      byDay[day.key] = [];
    });
    var other = [];
    items.forEach(function (item) {
      var release = item.release || item;
      if (!release || !release.id) return;
      var key = dayOf(item, release);
      if (byDay[key]) byDay[key].push({ release: release, episode: item.episode || item.new_episode });
      else other.push({ release: release, episode: item.episode });
    });

    var today = todayKey();
    var html = '';
    DAYS.forEach(function (day) {
      var list = byDay[day.key];
      html +=
        '<section class="sch-day"><div class="sch-day-head"><span class="sch-day-name">' +
        day.name +
        '</span>' +
        (day.key === today ? '<span class="sch-today">сегодня</span>' : '') +
        '<span class="sch-line"></span><span class="sch-count">' +
        list.length +
        '</span></div>' +
        (list.length
          ? '<div class="sch-grid">' +
            list
              .map(function (entry) {
                return cardHtml(entry.release, entry.episode);
              })
              .join('') +
            '</div>'
          : '<p class="sch-empty">В этот день выхода серий не заявлено.</p>') +
        '</section>';
    });

    if (other.length) {
      html +=
        '<section class="sch-day"><div class="sch-day-head"><span class="sch-day-name">Без дня выхода</span>' +
        '<span class="sch-line"></span><span class="sch-count">' +
        other.length +
        '</span></div><div class="sch-grid">' +
        other
          .map(function (entry) {
            return cardHtml(entry.release, entry.episode);
          })
          .join('') +
        '</div></section>';
    }

    document.getElementById('schBody').innerHTML = html;
    status(items.length + ' тайтлов');
  }

  function load() {
    if (loaded || loading) return;
    loading = true;
    status('Загружаем…');
    fetchSchedule()
      .then(function (items) {
        loaded = true;
        render(items);
      })
      .catch(function () {
        document.getElementById('schBody').innerHTML =
          '<p class="sch-empty">Не удалось загрузить расписание. Попробуйте обновить страницу.</p>';
        status('');
      })
      .then(function () {
        loading = false;
      });
  }

  function hideOtherViews() {
    document.querySelectorAll('#app > .view').forEach(function (node) {
      if (node !== view) node.hidden = true;
    });
  }

  function markNav(active) {
    document.querySelectorAll('.nav-link').forEach(function (link) {
      if (link.dataset.tab === 'schedule') link.classList.toggle('active', active);
    });
  }

  function apply() {
    if (!buildView()) return;
    var isSchedule = (location.hash || '').indexOf('#/schedule') === 0;
    if (!isSchedule) {
      view.hidden = true;
      markNav(false);
      return;
    }
    hideOtherViews();
    view.hidden = false;
    markNav(true);
    document.title = 'Расписание — AnimRu';
    window.scrollTo({ top: 0, behavior: 'auto' });
    load();
  }

  function start() {
    injectCss();
    addNavLink();
    buildView();
    window.addEventListener('hashchange', function () {
      setTimeout(apply, 0);
    });
    setTimeout(apply, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
