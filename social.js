/* AnimRu — списки (Смотрю / Запланировано / Брошено / Просмотрено),
   избранное, оценки и комментарии на странице тайтла. */
(function () {
  'use strict';

  var DB = window.AnimDB;
  var LS_LISTS = 'animru:lists';

  var STATUSES = [
    { id: 'watching', name: 'Смотрю' },
    { id: 'planned', name: 'Запланировано' },
    { id: 'done', name: 'Просмотрено' },
    { id: 'dropped', name: 'Брошено' }
  ];

  function $(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function toast(message) {
    if (window.AnimAuth && window.AnimAuth.toast) window.AnimAuth.toast(message);
  }

  function readAll() {
    try { var raw = localStorage.getItem(LS_LISTS); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }

  function writeAll(map) {
    try { localStorage.setItem(LS_LISTS, JSON.stringify(map)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('animru:lists-changed'));
    renderProfileLists();
  }

  function entry(titleId) {
    return readAll()[String(titleId)] || null;
  }

  function patchEntry(titleId, patch, meta) {
    var map = readAll();
    var key = String(titleId);
    var item = map[key] || { id: key, status: '', fav: false, rating: 0 };
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) item[k] = patch[k]; }
    if (meta) {
      if (meta.name) item.name = meta.name;
      if (meta.poster) item.poster = meta.poster;
    }
    item.at = Date.now();
    if (!item.status && !item.fav && !item.rating) delete map[key];
    else map[key] = item;
    writeAll(map);
    return map[key] || null;
  }

  /* ---------------- страница тайтла ---------------- */

  function currentTitleId() {
    var view = $('view-title');
    if (!view || view.hidden) return null;
    var hash = location.hash || '';
    var match = hash.match(/#\/[^/]+\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function titleMeta() {
    var name = $('tName');
    var poster = $('tPoster');
    return {
      name: name ? name.textContent.trim() : '',
      poster: poster ? poster.getAttribute('src') || '' : ''
    };
  }

  function buildBar() {
    var host = document.querySelector('#view-title .info-col');
    if (!host) return null;
    var bar = $('socialBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'socialBar';
    bar.className = 'social-bar';
    var desc = $('tDesc');
    if (desc && desc.parentNode === host) host.insertBefore(bar, desc);
    else host.appendChild(bar);
    bar.addEventListener('click', onBarClick);
    bar.addEventListener('change', onBarChange);
    return bar;
  }

  function renderBar() {
    var id = currentTitleId();
    if (!id) return;
    var bar = buildBar();
    if (!bar) return;
    var item = entry(id) || {};
    var options = STATUSES.map(function (s) {
      return '<option value="' + s.id + '"' + (item.status === s.id ? ' selected' : '') + '>' + s.name + '</option>';
    }).join('');
    var stars = '';
    for (var v = 1; v <= 10; v++) {
      stars += '<button type="button" class="rate-dot' + (item.rating >= v ? ' on' : '') + '" data-rate="' + v + '" aria-label="Оценка ' + v + '">' + v + '</button>';
    }
    bar.innerHTML =
      '<label class="social-pick"><span class="f-label">В список</span>' +
      '<select class="f-select" id="listStatus"><option value="">Не в списках</option>' + options + '</select></label>' +
      '<button type="button" class="btn btn-ghost fav-btn' + (item.fav ? ' on' : '') + '" data-fav="1">' +
      (item.fav ? '★ В избранном' : '☆ В избранное') + '</button>' +
      '<div class="rate-box"><span class="f-label">Моя оценка</span><div class="rate-dots">' + stars + '</div>' +
      '<span class="rate-avg" id="rateAvg"></span></div>';
    loadRating(id);
  }

  function onBarChange(event) {
    var select = event.target.closest('#listStatus');
    if (!select) return;
    var id = currentTitleId();
    if (!id) return;
    patchEntry(id, { status: select.value }, titleMeta());
    toast(select.value ? 'Добавлено в список' : 'Убрано из списков');
  }

  function onBarClick(event) {
    var id = currentTitleId();
    if (!id) return;

    var fav = event.target.closest('[data-fav]');
    if (fav) {
      var next = !(entry(id) || {}).fav;
      patchEntry(id, { fav: next }, titleMeta());
      renderBar();
      toast(next ? 'Добавлено в избранное' : 'Убрано из избранного');
      return;
    }

    var rate = event.target.closest('[data-rate]');
    if (rate) {
      var value = Number(rate.getAttribute('data-rate'));
      patchEntry(id, { rating: value }, titleMeta());
      renderBar();
      if (DB && DB.me()) {
        DB.setRating(id, value).then(function () { loadRating(id); }).catch(function (err) { toast(err.message); });
      }
    }
  }

  function loadRating(id) {
    var box = $('rateAvg');
    if (!box || !DB) return;
    if (!DB.isCloud) { box.textContent = 'Средняя оценка сайта появится с облачной базой'; return; }
    box.textContent = 'Считаю среднюю…';
    DB.getRating(id).then(function (info) {
      box.textContent = info.count
        ? ('Средняя ' + info.avg + ' из 10 · оценок: ' + info.count)
        : 'Оценок пока нет';
    }).catch(function () { box.textContent = ''; });
  }

  /* ---------------- комментарии ---------------- */

  function buildComments() {
    var anchor = document.querySelector('#view-title .watch');
    if (!anchor) return null;
    var box = $('commentsBlock');
    if (box) return box;
    box = document.createElement('section');
    box.id = 'commentsBlock';
    box.className = 'wrap comments';
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
    box.addEventListener('submit', onCommentSubmit);
    box.addEventListener('click', onCommentClick);
    return box;
  }

  function renderComments() {
    var id = currentTitleId();
    if (!id) return;
    var box = buildComments();
    if (!box) return;
    var user = DB ? DB.me() : null;

    var head = '<div class="section-head"><h2>Комментарии</h2><span class="muted small" id="cmCount"></span></div>';

    if (!DB || !DB.isCloud) {
      box.innerHTML = head + '<p class="muted">Комментарии общие для всех зрителей, поэтому работают только с облачной базой (config.js).</p>';
      return;
    }

    box.innerHTML = head +
      (user
        ? '<form class="cm-form"><textarea class="cm-input" id="cmText" rows="3" maxlength="1000" placeholder="Что думаете о тайтле?"></textarea>' +
          '<button class="btn" type="submit">Отправить</button></form>'
        : '<p class="muted">Войдите, чтобы оставить комментарий.</p>') +
      '<div class="cm-list" id="cmList"><p class="muted small">Загружаю…</p></div>';

    DB.listComments(id).then(function (rows) {
      rows = rows || [];
      var list = $('cmList');
      var count = $('cmCount');
      if (count) count.textContent = rows.length ? (rows.length + ' шт.') : '';
      if (!list) return;
      if (!rows.length) { list.innerHTML = '<p class="muted small">Пока пусто — будьте первым.</p>'; return; }
      list.innerHTML = rows.map(function (row) {
        var mine = user && row.user_id === user.id;
        var when = new Date(row.created_at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
        return '<article class="cm">' +
          '<div class="cm-head"><b>' + escapeHtml(row.name || 'Зритель') + '</b><span class="muted small">' + escapeHtml(when) + '</span>' +
          (mine ? '<button class="link-btn" data-del="' + escapeHtml(row.id) + '">удалить</button>' : '') +
          '</div><p class="cm-body">' + escapeHtml(row.body) + '</p></article>';
      }).join('');
    }).catch(function (err) {
      var list = $('cmList');
      if (list) list.innerHTML = '<p class="muted small">' + escapeHtml(err.message) + '</p>';
    });
  }

  function onCommentSubmit(event) {
    if (!event.target.closest('.cm-form')) return;
    event.preventDefault();
    var id = currentTitleId();
    var field = $('cmText');
    if (!id || !field) return;
    DB.addComment(id, field.value).then(function () {
      field.value = '';
      renderComments();
      toast('Комментарий добавлен');
    }).catch(function (err) { toast(err.message); });
  }

  function onCommentClick(event) {
    var del = event.target.closest('[data-del]');
    if (!del) return;
    DB.deleteComment(del.getAttribute('data-del')).then(function () {
      renderComments();
      toast('Комментарий удалён');
    }).catch(function (err) { toast(err.message); });
  }

  /* ---------------- списки в профиле ---------------- */

  var activeTab = 'watching';

  function buildProfileSection() {
    var profile = $('view-profile');
    if (!profile) return null;
    var section = $('listsBlock');
    if (section) return section;
    section = document.createElement('section');
    section.id = 'listsBlock';
    section.className = 'row-block';
    var accountRow = $('accountBox') ? $('accountBox').closest('.row-block') : null;
    if (accountRow && accountRow.nextSibling) profile.insertBefore(section, accountRow.nextSibling);
    else profile.appendChild(section);
    section.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-list-tab]');
      if (!tab) return;
      activeTab = tab.getAttribute('data-list-tab');
      renderProfileLists();
    });
    return section;
  }

  function renderProfileLists() {
    var section = buildProfileSection();
    if (!section) return;
    var map = readAll();
    var items = Object.keys(map).map(function (key) { return map[key]; });

    var tabs = STATUSES.concat([{ id: 'fav', name: 'Избранное' }]).map(function (tab) {
      var count = items.filter(function (item) {
        return tab.id === 'fav' ? item.fav : item.status === tab.id;
      }).length;
      return '<button type="button" class="f-chip' + (activeTab === tab.id ? ' active' : '') +
        '" data-list-tab="' + tab.id + '">' + tab.name + ' · ' + count + '</button>';
    }).join('');

    var shown = items.filter(function (item) {
      return activeTab === 'fav' ? item.fav : item.status === activeTab;
    }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });

    var cards = shown.length
      ? shown.map(function (item) {
        return '<a class="card" href="#/title/' + encodeURIComponent(item.id) + '">' +
          '<div class="card-poster">' + (item.poster ? '<img loading="lazy" alt="" src="' + escapeHtml(item.poster) + '">' : '') +
          (item.rating ? '<span class="card-badge">' + item.rating + '/10</span>' : '') + '</div>' +
          '<div class="card-body"><div class="card-title">' + escapeHtml(item.name || ('Тайтл ' + item.id)) + '</div></div></a>';
      }).join('')
      : '<p class="muted small">Здесь пока пусто. Добавляйте тайтлы кнопкой «В список» на странице аниме.</p>';

    section.innerHTML =
      '<div class="section-head"><h2>Мои списки</h2>' +
      '<span class="muted small">всего тайтлов: ' + items.length + '</span></div>' +
      '<div class="f-chips list-tabs">' + tabs + '</div>' +
      (shown.length ? '<div class="grid">' + cards + '</div>' : cards);
  }

  /* ---------------- запуск ---------------- */

  function refresh() {
    if (currentTitleId()) {
      renderBar();
      renderComments();
    }
    if ($('view-profile') && !$('view-profile').hidden) renderProfileLists();
  }

  window.addEventListener('hashchange', function () { setTimeout(refresh, 350); });
  document.addEventListener('DOMContentLoaded', function () { setTimeout(refresh, 400); });
  setTimeout(refresh, 600);

  var titleNode = $('tName');
  if (titleNode && window.MutationObserver) {
    new MutationObserver(function () { setTimeout(refresh, 60); }).observe(titleNode, { childList: true, characterData: true, subtree: true });
  }
  if (DB && DB.subscribe) DB.subscribe(function () { setTimeout(refresh, 30); });

  window.AnimLists = {
    all: readAll,
    get: entry,
    set: patchEntry,
    statuses: STATUSES
  };
})();
