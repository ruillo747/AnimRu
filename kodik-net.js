/* AnimRu — транспорт для API Kodik.
   Работает по неофициальной документации AnimeParsers:
   нужен рабочий token, запросы идут на /search, /list, /translations, /genres.
   У браузера две проблемы: у API нет CORS и токены периодически меняются.
   Модуль перебирает пары «токен + передатчик», запоминает рабочую и через неё ведёт все запросы. */
(function () {
  'use strict';

  var HOSTS = ['kodik-api.com', 'kodikapi.com'];
  var LS_TOKEN = 'animru:kodik-token';
  var LS_ROUTE = 'animru:kodik-route';
  var LS_FOUND = 'animru:kodik-found';
  var LS_PROXY = 'animru:kodik-proxy';
  var TOKENS_URL = 'https://raw.githubusercontent.com/YaNesyTortiK/AnimeParsers/main/kdk_tokns/tokens.json';
  var IN_APP = /AnimRu\//.test(navigator.userAgent || '');
  var TIMEOUT = 9000;

  /* известные общедоступные токены (расшифрованы из tokens.json) */
  var BASE_TOKENS = [
    '56a768d08f43091901c44b54fe970049',
    '447d179e875efe44217f20d1ee2146be',
    '41dd95f84c21719b09d6c71182237a25',
    '77b567ec164db6ca9162d2f3dc4948c3'
  ];

  /* передатчики с заголовками CORS */
  var ROUTES = [
    { id: 'allorigins', wrap: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
    { id: 'codetabs', wrap: function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } },
    { id: 'corsproxy', wrap: function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); } },
    { id: 'corslol', wrap: function (u) { return 'https://api.cors.lol/?url=' + encodeURIComponent(u); } },
    { id: 'corsfix', wrap: function (u) { return 'https://proxy.corsfix.com/?' + u; } },
    { id: 'workers', wrap: function (u) { return 'https://test.cors.workers.dev/?' + u; } },
    { id: 'corseu', wrap: function (u) { return 'https://cors.eu.org/' + u; } },
    { id: 'thingproxy', wrap: function (u) { return 'https://thingproxy.freeboard.io/fetch/' + u; } },
    { id: 'jina', wrap: function (u) { return 'https://r.jina.ai/' + u; } }
  ];

  /* свой прокси (например Cloudflare Worker) всегда первый, прямой запрос — только в приложении */
  (function orderRoutes() {
    var custom = '';
    try { custom = localStorage.getItem(LS_PROXY) || ''; } catch (e) {}
    if (custom) {
      ROUTES.unshift({
        id: 'custom',
        wrap: function (u) {
          return custom.indexOf('{url}') >= 0
            ? custom.replace('{url}', encodeURIComponent(u))
            : custom + encodeURIComponent(u);
        }
      });
    }
    if (IN_APP || location.protocol === 'file:') {
      ROUTES.unshift({ id: 'direct', wrap: function (u) { return u; } });
    }
  })();

  /* ---------------- служебное ---------------- */

  function read(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function write(key, value) {
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch (e) {}
  }

  /* чистый fetch из скрытого кадра: не попадаем в свои же перехватчики */
  var nativeFetch = window.fetch.bind(window);
  (function () {
    try {
      var frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.display = 'none';
      (document.body || document.documentElement).appendChild(frame);
      var inner = frame.contentWindow;
      if (inner && inner.fetch) nativeFetch = inner.fetch.bind(inner);
    } catch (e) {}
  })();

  function withTimeout(url, options) {
    var controller = null;
    var settings = options || {};
    try {
      controller = new AbortController();
      settings = Object.assign({}, settings, { signal: controller.signal });
    } catch (e) {}
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT);
    return nativeFetch(url, settings).then(
      function (res) { clearTimeout(timer); return res; },
      function (err) { clearTimeout(timer); throw err; }
    );
  }

  /* некоторые передатчики отдают JSON внутри текста — вытаскиваем его */
  function parseJson(text) {
    try { return JSON.parse(text); } catch (e) {}
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
  }

  function apiUrl(path, params) {
    var url = new URL('https://kodik-api.com' + path);
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== null) url.searchParams.set(key, String(params[key]));
    });
    return url.toString();
  }

  /* ---------------- токены ---------------- */

  function decryptToken(value) {
    function decode(part) {
      var reversed = part.split('').reverse().join('');
      return decodeURIComponent(escape(atob(reversed)));
    }
    var half = Math.floor(value.length / 2);
    return decode(value.slice(half)) + decode(value.slice(0, half));
  }

  function tokenList() {
    var list = [];
    var saved = read(LS_TOKEN);
    if (saved) list.push(saved);
    BASE_TOKENS.forEach(function (token) { if (list.indexOf(token) < 0) list.push(token); });
    return list;
  }

  /* свежий список токенов из открытого реестра (у raw.githubusercontent есть CORS) */
  function freshTokens() {
    return withTimeout(TOKENS_URL, { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.text() : ''; })
      .then(function (text) {
        var data = parseJson(text || '');
        if (!data) return [];
        var out = [];
        ['stable', 'unstable', 'legacy'].forEach(function (group) {
          (data[group] || []).forEach(function (item) {
            try {
              var token = decryptToken(item.tokn);
              if (/^[a-f0-9]{20,}$/i.test(token) && out.indexOf(token) < 0) out.push(token);
            } catch (e) {}
          });
        });
        return out;
      })
      .catch(function () { return []; });
  }

  /* ---------------- подбор рабочей связки ---------------- */

  var state = {
    token: read(LS_TOKEN) || BASE_TOKENS[0],
    route: null,
    ready: null,
    ok: false,
    reason: ''
  };

  function routeById(id) {
    for (var i = 0; i < ROUTES.length; i += 1) {
      if (ROUTES[i].id === id) return ROUTES[i];
    }
    return null;
  }

  function probe(token, route) {
    var url = apiUrl('/list', { token: token, limit: 1, types: 'anime,anime-serial' });
    return withTimeout(route.wrap(url), { method: 'GET', cache: 'no-store' })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var data = parseJson(text || '');
        if (!data) throw new Error('bad json');
        if (data.error) throw new Error(String(data.error));
        if (!Array.isArray(data.results)) throw new Error('no results');
        return true;
      });
  }

  function sequence(pairs, index) {
    if (index >= pairs.length) return Promise.resolve(null);
    var pair = pairs[index];
    return probe(pair.token, pair.route)
      .then(function () { return pair; })
      .catch(function () { return sequence(pairs, index + 1); });
  }

  function buildPairs(tokens) {
    var pairs = [];
    var savedRoute = routeById(read(LS_ROUTE));
    var savedToken = read(LS_TOKEN);
    if (savedRoute && savedToken) pairs.push({ token: savedToken, route: savedRoute });
    /* сначала проходим все токены на одном передатчике, потом меняем передатчик */
    ROUTES.forEach(function (route) {
      tokens.forEach(function (token) {
        pairs.push({ token: token, route: route });
      });
    });
    return pairs;
  }

  function resolve(force) {
    if (state.ready && !force) return state.ready;
    state.ready = sequence(buildPairs(tokenList()), 0)
      .then(function (found) {
        if (found) return found;
        /* ни одна известная связка не ответила — тянем свежие токены и пробуем ещё раз */
        return freshTokens().then(function (tokens) {
          var extra = tokens.filter(function (token) { return tokenList().indexOf(token) < 0; });
          if (!extra.length) return null;
          return sequence(buildPairs(extra), 0);
        });
      })
      .then(function (found) {
        if (!found) {
          state.ok = false;
          state.reason = 'no-route';
          return null;
        }
        state.ok = true;
        state.reason = '';
        state.token = found.token;
        state.route = found.route;
        write(LS_TOKEN, found.token);
        write(LS_ROUTE, found.route.id);
        write(LS_FOUND, String(Date.now()));
        return found;
      });
    return state.ready;
  }

  /* ---------------- запросы ---------------- */

  function retarget(rawUrl) {
    var url;
    try { url = new URL(rawUrl, location.href); } catch (e) { return null; }
    if (HOSTS.indexOf(url.hostname) < 0) return null;
    url.protocol = 'https:';
    url.hostname = 'kodik-api.com';
    url.searchParams.set('token', state.token);
    return url.toString();
  }

  function through(url) {
    var route = state.route || routeById(read(LS_ROUTE)) || ROUTES[0];
    return withTimeout(route.wrap(url), { method: 'GET', cache: 'no-store' })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var data = parseJson(text || '');
        if (!data) throw new Error('bad json');
        return data;
      });
  }

  function request(path, params) {
    return resolve().then(function () {
      if (!state.ok) throw new Error('kodik-unavailable');
      var merged = Object.assign({}, params || {}, { token: state.token });
      return through(apiUrl(path, merged)).catch(function (err) {
        /* связка рассыпалась на ходу: подбираем заново и повторяем один раз */
        return resolve(true).then(function () {
          if (!state.ok) throw err;
          return through(apiUrl(path, Object.assign({}, params || {}, { token: state.token })));
        });
      });
    });
  }

  /* перехват fetch: весь старый код продолжает звать API напрямую, а уходит через рабочий передатчик */
  function patchFetch() {
    var inner = window.fetch.bind(window);
    if (window.fetch.__animruKodikNet) return;

    function patched(input, init) {
      var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
      var target = rawUrl ? retarget(rawUrl) : null;
      if (!target) return inner(input, init);

      return resolve()
        .then(function () {
          if (!state.ok) throw new Error('kodik-unavailable');
          return through(retarget(rawUrl));
        })
        .then(function (data) {
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        })
        .catch(function () {
          return new Response(JSON.stringify({ results: [], total: 0, error: 'kodik-unavailable' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        });
    }

    patched.__animruKodikNet = true;
    window.fetch = patched;
  }

  /* ---------------- подсказка в каталоге ---------------- */

  function hint() {
    var node = document.getElementById('kbStatus');
    if (!node) return;
    if (state.ok) return;
    node.textContent = 'Kodik не ответил ни через один из каналов. Вставь свой токен в поле ниже, укажи свой прокси или открой каталог в приложении AnimRu.';
  }

  patchFetch();
  /* если другой модуль переопределит fetch позже — возвращаем свой перехват наверх */
  setInterval(function () {
    if (!window.fetch.__animruKodikNet) patchFetch();
  }, 150);

  window.AnimKodikNet = {
    request: request,
    resolve: resolve,
    state: function () {
      return { ok: state.ok, token: state.token, route: state.route ? state.route.id : null, reason: state.reason };
    },
    setProxy: function (template) {
      write(LS_PROXY, template || '');
      location.reload();
    },
    setToken: function (token) {
      write(LS_TOKEN, token || '');
      state.token = token || BASE_TOKENS[0];
      return resolve(true).then(function () { return state.ok; });
    },
    routes: ROUTES.map(function (route) { return route.id; })
  };

  resolve().then(function () {
    hint();
    if (state.ok) document.documentElement.setAttribute('data-kodik', state.route.id);
  });
})();
