/* AnimRu: скачивание серий в память браузера и офлайн-просмотр (источник Anilibria). */
(function () {
  'use strict';

  var API = 'https://anilibria.top/api/v1';
  var CACHE = 'animru-offline';
  var LS = 'animru:offline';
  var QUALITY = ['hls_720', 'hls_480', 'hls_1080'];
  var PARALLEL = 4;

  var CSS = [
    '.dl-box{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.dl-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border:1px solid var(--line);' +
      'border-radius:var(--r-sm);background:var(--surface-2);color:var(--text);font:inherit;font-size:13.5px;cursor:pointer}',
    '.dl-btn:hover:not(:disabled){border-color:var(--accent)}',
    '.dl-btn:disabled{opacity:.6;cursor:default}',
    '.dl-btn.done{border-color:var(--accent);background:var(--accent-soft)}',
    '.dl-state{font-size:12.5px;color:var(--dim)}',
    '.dl-del{border:0;background:none;color:var(--dim);font:inherit;font-size:12.5px;cursor:pointer;text-decoration:underline}',
    '.dl-del:hover{color:var(--danger)}',
    '.dl-rail{display:grid;gap:10px}',
    '.dl-item{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--line);' +
      'border-radius:var(--r);background:var(--surface)}',
    '.dl-item img{width:44px;height:62px;object-fit:cover;border-radius:var(--r-sm);display:block;background:var(--surface-2)}',
    '.dl-item-main{flex:1;min-width:0}',
    '.dl-item-name{font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dl-item-sub{font-size:12px;color:var(--dim)}',
    '.dl-item a.btn{flex:none}'
  ].join('');

  var busy = false;

  function injectCss() {
    if (document.getElementById('offline-css')) return;
    var tag = document.createElement('style');
    tag.id = 'offline-css';
    tag.textContent = CSS;
    (document.head || document.documentElement).appendChild(tag);
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function readIndex() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (err) {
      return {};
    }
  }

  function writeIndex(data) {
    try {
      localStorage.setItem(LS, JSON.stringify(data));
    } catch (err) {
      notify('Не хватает места в хранилище браузера');
    }
  }

  function notify(text) {
    var box = document.getElementById('toast');
    if (!box) return;
    box.textContent = text;
    box.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(function () {
      box.hidden = true;
    }, 3200);
  }

  function titleId() {
    var match = /^#\/title\/([^/?#]+)/.exec(location.hash || '');
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch (err) {
      return match[1];
    }
  }

  function episodeIndex() {
    var active = document.querySelector('#episodes .ep-btn.active');
    if (!active) return 0;
    var i = parseInt(active.getAttribute('data-i'), 10);
    return isNaN(i) ? 0 : i;
  }

  function keyOf(id, index) {
    return id + '#' + index;
  }

  function getRelease(id) {
    return fetch(API + '/anime/releases/' + encodeURIComponent(id), {
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function posterOf(release) {
    var poster = release && release.poster;
    var src = (poster && ((poster.optimized && poster.optimized.src) || poster.src)) || '';
    if (!src) return '';
    return /^https?:/.test(src) ? src : 'https://anilibria.top' + src;
  }

  function nameOf(release) {
    return (release && release.name && (release.name.main || release.name.english)) || 'Аниме';
  }

  function pickSource(episode) {
    for (var i = 0; i < QUALITY.length; i++) {
      if (episode && episode[QUALITY[i]]) return { url: episode[QUALITY[i]], label: QUALITY[i].replace('hls_', '') + 'p' };
    }
    return null;
  }

  function fetchText(url) {
    return fetch(url, { mode: 'cors' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  }

  function absolute(line, base) {
    try {
      return new URL(line, base).toString();
    } catch (err) {
      return '';
    }
  }

  /* Если пришёл master-плейлист, берём первый вариант потока. Глубина ограничена, чтобы круговая ссылка не зациклила загрузку. */
  function resolvePlaylist(url, depth) {
    depth = depth || 0;
    return fetchText(url).then(function (text) {
      if (text.indexOf('#EXT-X-STREAM-INF') === -1 || depth >= 4) return { url: url, text: text };
      var lines = text.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.charAt(0) === '#') continue;
        var next = absolute(line, url);
        if (next && next !== url) return resolvePlaylist(next, depth + 1);
      }
      return { url: url, text: text };
    });
  }

  function segmentsOf(text, base) {
    var out = [];
    var seen = {};
    text.split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var target = '';
      if (line.charAt(0) === '#') {
        var keyMatch = /URI="([^"]+)"/.exec(line);
        if (keyMatch) target = absolute(keyMatch[1], base);
      } else {
        target = absolute(line, base);
      }
      if (!target || seen[target]) return;
      seen[target] = true;
      out.push(target);
    });
    return out;
  }

  function cacheUrl(cache, url) {
    return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (res) {
      if (res.type === 'opaque') throw new Error('CORS');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return cache.put(url, res);
    });
  }

  /* Возвращает число неудачных запросов, чтобы молчаливый провал не выглядел успехом. */
  function cacheAll(cache, urls, onProgress) {
    var done = 0;
    var failed = 0;
    var lastError = null;
    var cursor = 0;
    function worker() {
      if (cursor >= urls.length) return Promise.resolve();
      var url = urls[cursor++];
      return cacheUrl(cache, url)
        .catch(function (err) {
          failed++;
          lastError = err;
          return null;
        })
        .then(function () {
          done++;
          if (onProgress) onProgress(done, urls.length);
          return worker();
        });
    }
    var pool = [];
    for (var i = 0; i < Math.min(PARALLEL, urls.length); i++) pool.push(worker());
    return Promise.all(pool).then(function () {
      return { total: urls.length, failed: failed, error: lastError };
    });
  }

  /* Ошибка одного-двух сегментов терпима, массовый провал — нет. */
  function requireMostly(result, label) {
    if (!result.total) return result;
    if (result.failed >= result.total) {
      throw new Error(label + ': ни один файл не загрузился (' + reasonOf(result.error) + ')');
    }
    if (result.failed / result.total > 0.1) {
      throw new Error(label + ': не загрузилось ' + result.failed + ' из ' + result.total);
    }
    return result;
  }

  function reasonOf(err) {
    if (!err) return 'причина неизвестна';
    var text = err.message || String(err);
    if (text === 'CORS' || /Failed to fetch|NetworkError|Load failed/i.test(text)) {
      return 'сервер видео не отдал файл приложению';
    }
    if (/QuotaExceeded|quota/i.test(text)) return 'не хватает места в хранилище';
    if (text === 'no source') return 'у серии нет доступного потока';
    if (text === 'empty playlist') return 'плейлист оказался пустым';
    return text;
  }

  /* В приложении и старых WebView Cache Storage может быть недоступен. */
  function storageProblem() {
    if (!window.caches || typeof caches.open !== 'function') {
      return 'встроенный браузер не поддерживает офлайн-хранилище';
    }
    if (!window.isSecureContext) return 'страница открыта не по HTTPS';
    if (!('serviceWorker' in navigator)) return 'служба офлайн-доступа недоступна';
    return '';
  }

  function download() {
    if (busy) return;
    var id = titleId();
    if (!id) return;
    var index = episodeIndex();
    var button = document.getElementById('dlBtn');
    var state = document.getElementById('dlState');
    if (!button) return;

    var problem = storageProblem();
    if (problem) {
      if (state) state.textContent = 'Скачивание недоступно: ' + problem;
      notify('Скачивание недоступно: ' + problem);
      return;
    }

    busy = true;
    button.disabled = true;
    button.textContent = 'Готовим…';
    if (state) state.textContent = '';

    var cacheRef = null;
    var release = null;
    var episode = null;
    var source = null;
    var urls = [];
    var stored = [];

    caches
      .open(CACHE)
      .then(function (cache) {
        cacheRef = cache;
        return getRelease(id);
      })
      .then(function (json) {
        release = json && json.data ? json.data : json;
        var list = (release && release.episodes) || [];
        episode = list[index];
        source = pickSource(episode);
        if (!source) throw new Error('no source');
        /* карточка тайтла тоже нужна офлайн, иначе страница не откроется */
        var extras = [API + '/anime/releases/' + encodeURIComponent(id)];
        var poster = posterOf(release);
        if (poster) extras.push(poster);
        stored = stored.concat(extras);
        return cacheAll(cacheRef, extras)
          .then(function (result) {
            return requireMostly(result, 'Описание тайтла');
          })
          .then(function () {
            return resolvePlaylist(source.url);
          });
      })
      .then(function (playlist) {
        urls = segmentsOf(playlist.text, playlist.url);
        if (!urls.length) throw new Error('empty playlist');
        var meta = [source.url];
        if (playlist.url !== source.url) meta.push(playlist.url);
        stored = stored.concat(meta, urls);
        return cacheAll(cacheRef, meta)
          .then(function (result) {
            return requireMostly(result, 'Плейлист');
          })
          .then(function () {
            button.textContent = '0%';
            return cacheAll(cacheRef, urls, function (done, total) {
              button.textContent = Math.round((done / total) * 100) + '%';
            });
          })
          .then(function (result) {
            return requireMostly(result, 'Видео');
          });
      })
      .then(function () {
        var data = readIndex();
        data[keyOf(id, index)] = {
          id: id,
          index: index,
          name: nameOf(release),
          poster: posterOf(release),
          episode: (episode && (episode.ordinal || episode.sort_order)) || index + 1,
          episodeName: (episode && episode.name) || '',
          quality: source.label,
          parts: stored.length,
          /* список файлов нужен, чтобы при удалении чистить кеш, а не только запись */
          urls: stored,
          at: Date.now()
        };
        writeIndex(data);
        notify('Серия скачана — доступна без интернета');
        renderHome();
      })
      .catch(function (err) {
        var reason = reasonOf(err);
        if (state) state.textContent = 'Не удалось скачать: ' + reason;
        notify('Не удалось скачать серию — ' + reason);
        /* недокачанные файлы не должны занимать место */
        if (cacheRef && stored.length) dropUrls(cacheRef, stored);
      })
      .then(function () {
        busy = false;
        syncButton();
      });
  }

  function dropUrls(cache, urls) {
    var i = 0;
    function step() {
      if (i >= urls.length) return Promise.resolve();
      var url = urls[i++];
      return cache
        .delete(url)
        .catch(function () { return null; })
        .then(step);
    }
    return step();
  }

  function removeEntry(key) {
    var data = readIndex();
    var item = data[key];
    if (!item) return;
    delete data[key];
    writeIndex(data);
    renderHome();
    syncButton();
    notify('Скачанная серия удалена');

    /* чистим и само видео: иначе сегменты остаются в кеше навсегда */
    if (!window.caches || typeof caches.open !== 'function') return;
    var list = Array.isArray(item.urls) ? item.urls : null;
    caches
      .open(CACHE)
      .then(function (cache) {
        if (list) return dropUrls(cache, list);
        /* старые записи без списка файлов: если скачанного больше нет, кеш можно снести целиком */
        if (!Object.keys(readIndex()).length) return caches.delete(CACHE);
        return null;
      })
      .catch(function () { return null; });
  }

  function ensureUi() {
    var bar = document.querySelector('#view-title .watch-bar');
    if (!bar || document.getElementById('dlBox')) return;
    var box = document.createElement('div');
    box.id = 'dlBox';
    box.className = 'dl-box';
    box.innerHTML =
      '<button class="dl-btn" id="dlBtn" type="button">↓ Скачать серию</button>' +
      '<span class="dl-state" id="dlState"></span>';
    bar.appendChild(box);
    var button = document.getElementById('dlBtn');
    if (!button) return;
    button.addEventListener('click', function () {
      if (busy) return;
      var id = titleId();
      if (!id) return;
      var key = keyOf(id, episodeIndex());
      if (readIndex()[key]) removeEntry(key);
      else download();
    });
  }

  function syncButton() {
    var button = document.getElementById('dlBtn');
    var state = document.getElementById('dlState');
    if (!button || busy) return;
    var id = titleId();
    var entry = id ? readIndex()[keyOf(id, episodeIndex())] : null;
    button.disabled = false;
    if (entry) {
      button.textContent = '✓ Скачано — удалить';
      button.classList.add('done');
      if (state) state.textContent = 'Доступно офлайн' + (entry.quality ? ' · ' + entry.quality : '');
    } else {
      button.textContent = '↓ Скачать серию';
      button.classList.remove('done');
      if (state) state.textContent = 'Серия сохранится в память браузера';
    }
  }

  function plural(count) {
    var tail = count % 100;
    if (tail > 10 && tail < 20) return 'серий';
    var last = count % 10;
    if (last === 1) return 'серия';
    if (last >= 2 && last <= 4) return 'серии';
    return 'серий';
  }

  function renderHome() {
    var home = document.getElementById('view-home');
    if (!home) return;
    var block = document.getElementById('offlineBlock');
    var index = readIndex();
    var entries = Object.keys(index)
      .map(function (key) {
        var item = index[key];
        if (!item || typeof item !== 'object') return null;
        return {
          key: key,
          id: item.id,
          name: item.name,
          poster: item.poster,
          episode: item.episode,
          quality: item.quality,
          at: item.at
        };
      })
      .filter(Boolean);
    entries.sort(function (a, b) {
      return (b.at || 0) - (a.at || 0);
    });

    if (!entries.length) {
      if (block) block.hidden = true;
      return;
    }

    if (!block) {
      block = document.createElement('section');
      block.id = 'offlineBlock';
      block.className = 'row-block';
      block.innerHTML =
        '<div class="section-head"><h2>Скачано для офлайна</h2>' +
        '<span class="muted small" id="offlineCount"></span></div>' +
        '<div class="dl-rail" id="offlineRail"></div>';
      var first = home.querySelector('.row-block');
      if (first) home.insertBefore(block, first);
      else home.appendChild(block);
      block.addEventListener('click', function (event) {
        var target = event.target;
        var button = target && target.closest ? target.closest('.dl-del') : null;
        if (!button) return;
        removeEntry(button.getAttribute('data-key'));
      });
    }

    block.hidden = false;
    var count = document.getElementById('offlineCount');
    var rail = document.getElementById('offlineRail');
    if (count) count.textContent = entries.length + ' ' + plural(entries.length);
    if (!rail) return;
    rail.innerHTML = entries
      .map(function (item) {
        return (
          '<div class="dl-item">' +
          (item.poster ? '<img loading="lazy" src="' + escapeHtml(item.poster) + '" alt="">' : '<img alt="">') +
          '<div class="dl-item-main"><div class="dl-item-name">' +
          escapeHtml(item.name || 'Аниме') +
          '</div><div class="dl-item-sub">Серия ' +
          escapeHtml(item.episode) +
          (item.quality ? ' · ' + escapeHtml(item.quality) : '') +
          '</div></div><a class="btn btn-ghost" href="#/title/' +
          encodeURIComponent(item.id) +
          '">Смотреть</a><button class="dl-del" type="button" data-key="' +
          escapeHtml(item.key) +
          '">Удалить</button></div>'
        );
      })
      .join('');
  }

  function onRoute() {
    setTimeout(function () {
      ensureUi();
      syncButton();
      renderHome();
    }, 400);
    setTimeout(function () {
      ensureUi();
      syncButton();
    }, 1200);
  }

  function start() {
    injectCss();
    onRoute();
    window.addEventListener('hashchange', onRoute);
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (target && target.closest && target.closest('#episodes .ep-btn')) setTimeout(syncButton, 120);
    });
    window.addEventListener('online', renderHome);
    window.addEventListener('offline', function () {
      notify('Интернета нет — скачанные серии продолжают работать');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.AnimOffline = { list: readIndex, remove: removeEntry };
})();
