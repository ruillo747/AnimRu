/* AnimRu: единый транспорт Kodik через собственный Cloudflare Worker. */
(function () {
  'use strict';

  var HOSTS = ['kodik-api.com', 'kodikapi.com'];
  var LS_TOKEN = 'animru:kodik-token';
  var LS_ROUTE = 'animru:kodik-route';
  var LS_FOUND = 'animru:kodik-found';
  var LS_PROXY = 'animru:kodik-proxy';
  var TOKENS_URL = 'https://raw.githubusercontent.com/YaNesyTortiK/AnimeParsers/main/kdk_tokns/tokens.json';
  var IN_APP = /AnimRu\//.test(navigator.userAgent || '');
  var TIMEOUT = 7000;
  var DEFAULT_PROXY = 'https://animru.nozirovruillo.workers.dev/?url=';
  var BASE_TOKENS = [
    '56a768d08f43091901c44b54fe970049',
    '447d179e875efe44217f20d1ee2146be',
    '41dd95f84c21719b09d6c71182237a25',
    '77b567ec164db6ca9162d2f3dc4948c3'
  ];
  var nativeFetch = window.fetch.bind(window);
  var ROUTES = [];

  function read(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function write(key, value) {
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch (e) {}
  }

  (function buildRoutes() {
    var custom = read(LS_PROXY) || DEFAULT_PROXY;
    /* В приложении запрос перехватывает MediaProxy. Сначала пробуем его, затем Worker. */
    if (IN_APP || location.protocol === 'file:') {
      ROUTES.push({ id: 'direct', wrap: function (url) { return url; } });
    }
    if (custom) {
      ROUTES.push({
        id: 'custom',
        wrap: function (url) {
          return custom.indexOf('{url}') >= 0
            ? custom.replace('{url}', encodeURIComponent(url))
            : custom + encodeURIComponent(url);
        }
      });
    }
  })();

  function withTimeout(url, options) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var settings = Object.assign({}, options || {});
    if (controller) settings.signal = controller.signal;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT);
    return nativeFetch(url, settings).then(function (response) {
      clearTimeout(timer);
      return response;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

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
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

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

  function freshTokens() {
    return withTimeout(TOKENS_URL, { cache: 'no-store' }).then(function (response) {
      return response.ok ? response.text() : '';
    }).then(function (text) {
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
    }).catch(function () { return []; });
  }

  var state = {
    token: read(LS_TOKEN) || BASE_TOKENS[0],
    route: null,
    ready: null,
    ok: false,
    reason: ''
  };

  function routeById(id) {
    return ROUTES.filter(function (route) { return route.id === id; })[0] || null;
  }

  function probe(token, route) {
    var url = apiUrl('/list', { token: token, limit: 1, types: 'anime,anime-serial' });
    return withTimeout(route.wrap(url), { method: 'GET', cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }).then(function (text) {
      var data = parseJson(text || '');
      if (!data || data.error || !Array.isArray(data.results)) throw new Error('bad response');
      return true;
    });
  }

  function sequence(pairs, index) {
    if (index >= pairs.length) return Promise.resolve(null);
    var pair = pairs[index];
    return probe(pair.token, pair.route).then(function () { return pair; })
      .catch(function () { return sequence(pairs, index + 1); });
  }

  function buildPairs(tokens) {
    var pairs = [];
    var savedRoute = routeById(read(LS_ROUTE));
    var savedToken = read(LS_TOKEN);
    if (savedRoute && savedToken) pairs.push({ token: savedToken, route: savedRoute });
    ROUTES.forEach(function (route) {
      tokens.forEach(function (token) {
        if (!pairs.some(function (pair) { return pair.route === route && pair.token === token; })) {
          pairs.push({ token: token, route: route });
        }
      });
    });
    return pairs;
  }

  function resolve(force) {
    if (state.ready && !force) return state.ready;
    state.ready = sequence(buildPairs(tokenList()), 0).then(function (found) {
      if (found) return found;
      return freshTokens().then(function (tokens) {
        var known = tokenList();
        return sequence(buildPairs(tokens.filter(function (token) { return known.indexOf(token) < 0; })), 0);
      });
    }).then(function (found) {
      if (!found) {
        state.ok = false;
        state.reason = 'no-route';
        state.route = null;
        return null;
      }
      state.ok = true;
      state.reason = '';
      state.token = found.token;
      state.route = found.route;
      write(LS_TOKEN, found.token);
      write(LS_ROUTE, found.route.id);
      write(LS_FOUND, String(Date.now()));
      document.documentElement.setAttribute('data-kodik', found.route.id);
      return found;
    }).catch(function () {
      state.ok = false;
      state.reason = 'network';
      state.route = null;
      return null;
    });
    return state.ready;
  }

  function retarget(rawUrl) {
    var url;
    try { url = new URL(rawUrl, location.href); } catch (e) { return null; }
    if (HOSTS.indexOf(url.hostname) < 0) return null;
    url.protocol = 'https:';
    url.hostname = 'kodik-api.com';
    url.searchParams.set('token', state.token);
    url.searchParams.delete('page');
    return url.toString();
  }

  function through(url) {
    var route = state.route || routeById(read(LS_ROUTE)) || ROUTES[0];
    if (!route) return Promise.reject(new Error('kodik-unavailable'));
    return withTimeout(route.wrap(url), { method: 'GET', cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }).then(function (text) {
      var data = parseJson(text || '');
      if (!data || data.error) throw new Error(data && data.error ? String(data.error) : 'bad json');
      return data;
    });
  }

  function requestUrl(rawUrl, allowRetry) {
    return resolve().then(function () {
      if (!state.ok) throw new Error('kodik-unavailable');
      var target = retarget(rawUrl);
      if (!target) throw new Error('kodik-invalid-url');
      return through(target);
    }).catch(function (error) {
      if (allowRetry === false) throw error;
      return resolve(true).then(function () {
        if (!state.ok) throw error;
        var target = retarget(rawUrl);
        if (!target) throw error;
        return through(target);
      });
    });
  }

  function request(path, params) {
    return resolve().then(function () {
      if (!state.ok) throw new Error('kodik-unavailable');
      return requestUrl(apiUrl(path, Object.assign({}, params || {}, { token: state.token })));
    });
  }

  function patchFetch() {
    if (window.fetch.__animruKodikNet) return;
    function patched(input, init) {
      var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
      if (!rawUrl || !retarget(rawUrl)) return nativeFetch(input, init);
      return requestUrl(rawUrl).then(function (data) {
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      }).catch(function () {
        return new Response(JSON.stringify({ results: [], total: 0, error: 'kodik-unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      });
    }
    patched.__animruKodikNet = true;
    window.fetch = patched;
  }

  patchFetch();
  window.AnimKodikNet = {
    request: request,
    requestUrl: requestUrl,
    resolve: resolve,
    state: function () {
      return { ok: state.ok, token: state.token, route: state.route ? state.route.id : null, reason: state.reason };
    },
    setProxy: function (template) { write(LS_PROXY, template || ''); location.reload(); },
    setToken: function (token) {
      write(LS_TOKEN, token || '');
      state.token = token || BASE_TOKENS[0];
      return resolve(true).then(function () { return state.ok; });
    },
    routes: ROUTES.map(function (route) { return route.id; })
  };
  resolve();
})();
