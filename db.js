/* AnimRu — слой данных: аккаунты, прогресс, списки, оценки, комментарии.
   Два режима: локальный (IndexedDB в браузере) и облачный (Supabase REST).
   Режим выбирается по config.js — если там есть ключи, включается облако. */
(function () {
  'use strict';

  var CFG = window.ANIMRU_CONFIG || {};
  var BASE = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
  var ANON = String(CFG.supabaseAnonKey || '');
  var CLOUD = !!(BASE && ANON);
  var SESSION_KEY = 'animru:session';

  /* ---------------- общие утилиты ---------------- */

  function nowIso() { return new Date().toISOString(); }

  function readJson(key, def) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : def; }
    catch (e) { return def; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  var subs = [];
  function emit() {
    var user = me();
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](user); } catch (e) {}
    }
  }

  function getSession() { return readJson(SESSION_KEY, null); }

  function setSession(s) {
    if (s) writeJson(SESSION_KEY, s);
    else { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
    emit();
  }

  function me() {
    var s = getSession();
    return s && s.user ? s.user : null;
  }

  function checkEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
  }

  function validate(data, needName) {
    if (!checkEmail(data.email)) throw new Error('Проверьте адрес почты');
    if (String(data.password || '').length < 8) throw new Error('Пароль — минимум 8 символов');
    if (needName && String(data.name || '').trim().length < 2) throw new Error('Имя — минимум 2 символа');
  }

  function ruError(msg) {
    var m = String(msg || '');
    if (/already registered|already exists|duplicate/i.test(m)) return 'Такая почта уже зарегистрирована';
    if (/invalid login credentials/i.test(m)) return 'Неверная почта или пароль';
    if (/email not confirmed/i.test(m)) return 'Почта не подтверждена — проверьте письмо';
    if (/rate limit|too many/i.test(m)) return 'Слишком много попыток, попробуйте позже';
    if (/password/i.test(m) && /short|least/i.test(m)) return 'Пароль слишком короткий';
    if (/failed to fetch|networkerror/i.test(m)) return 'Нет связи с сервером';
    return m || 'Что-то пошло не так';
  }

  /* ---------------- облачный режим ---------------- */

  function api(path, opts) {
    opts = opts || {};
    var s = getSession();
    var headers = {
      apikey: ANON,
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (!opts.anon && s && s.token ? s.token : ANON)
    };
    if (opts.headers) {
      for (var k in opts.headers) { if (Object.prototype.hasOwnProperty.call(opts.headers, k)) headers[k] = opts.headers[k]; }
    }
    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          if (res.status === 401 && s && s.token) setSession(null);
          var msg = (data && (data.msg || data.message || data.error_description || data.error || data.hint)) || ('Ошибка ' + res.status);
          throw new Error(ruError(msg));
        }
        return data;
      });
    }, function () { throw new Error('Нет связи с сервером'); });
  }

  function saveCloudSession(payload, fallbackName) {
    var user = payload && payload.user ? payload.user : null;
    if (!payload || !payload.access_token || !user) throw new Error('Сервер не вернул сессию');
    var meta = user.user_metadata || {};
    setSession({
      token: payload.access_token,
      refresh: payload.refresh_token || '',
      user: {
        id: user.id,
        email: user.email || '',
        name: meta.name || fallbackName || (user.email || '').split('@')[0],
        provider: (user.app_metadata && user.app_metadata.provider) || 'email'
      }
    });
    return me();
  }

  function upsertProfile(patch) {
    var user = me();
    if (!user) return Promise.resolve(null);
    var row = { id: user.id, email: user.email, name: user.name, updated_at: nowIso() };
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) row[k] = patch[k]; }
    return api('/rest/v1/profiles?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [row]
    });
  }

  /* Возврат после входа через Google/Discord: Supabase кладёт токен в hash. */
  function captureOauthRedirect() {
    if (!CLOUD) return;
    var hash = location.hash || '';
    if (hash.indexOf('access_token=') === -1) return;
    var params = new URLSearchParams(hash.replace(/^#/, ''));
    var token = params.get('access_token');
    if (!token) return;
    history.replaceState(null, '', location.pathname + location.search + '#/');
    fetch(BASE + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.json(); })
      .then(function (user) {
        saveCloudSession({ access_token: token, refresh_token: params.get('refresh_token') || '', user: user });
        return upsertProfile({});
      })
      .catch(function () {});
  }

  /* ---------------- локальный режим ---------------- */

  var dbPromise = null;

  function idb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!self.indexedDB) { reject(new Error('Браузер не поддерживает локальную базу')); return; }
      var req = indexedDB.open('animru', 2);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'email' });
        if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'email' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(new Error('Не удалось открыть локальную базу')); };
    });
    return dbPromise;
  }

  function store(name, mode, run) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(name, mode);
        var request = run(t.objectStore(name));
        t.oncomplete = function () { resolve(request ? request.result : null); };
        t.onerror = function () { reject(new Error('Ошибка локальной базы')); };
        t.onabort = function () { reject(new Error('Операция прервана')); };
      });
    });
  }

  function toHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }

  function fromHex(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  function subtle() {
    if (!self.crypto || !self.crypto.subtle) {
      throw new Error('Нужен защищённый контекст (https или localhost)');
    }
    return self.crypto.subtle;
  }

  function hashPassword(password, saltHex) {
    var salt = saltHex ? fromHex(saltHex) : self.crypto.getRandomValues(new Uint8Array(16));
    var enc = new TextEncoder();
    return subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return subtle().deriveBits({ name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
      })
      .then(function (bits) {
        return { salt: toHex(salt), hash: toHex(new Uint8Array(bits)) };
      });
  }

  function localSignUp(data) {
    var email = String(data.email).trim().toLowerCase();
    return store('users', 'readonly', function (s) { return s.get(email); }).then(function (found) {
      if (found) throw new Error('Такая почта уже зарегистрирована');
      return hashPassword(data.password);
    }).then(function (creds) {
      var user = {
        email: email,
        id: email,
        name: String(data.name).trim(),
        salt: creds.salt,
        hash: creds.hash,
        createdAt: nowIso()
      };
      return store('users', 'readwrite', function (s) { return s.put(user); }).then(function () {
        setSession({ token: '', user: { id: email, email: email, name: user.name, provider: 'local' } });
        return me();
      });
    });
  }

  function localSignIn(data) {
    var email = String(data.email).trim().toLowerCase();
    return store('users', 'readonly', function (s) { return s.get(email); }).then(function (found) {
      if (!found) throw new Error('Аккаунт не найден');
      return hashPassword(data.password, found.salt).then(function (creds) {
        if (creds.hash !== found.hash) throw new Error('Неверный пароль');
        setSession({ token: '', user: { id: email, email: email, name: found.name, provider: 'local' } });
        return me();
      });
    });
  }

  /* ---------------- публичный интерфейс ---------------- */

  var AnimDB = {
    backend: CLOUD ? 'supabase' : 'local',
    isCloud: CLOUD,
    me: me,

    subscribe: function (fn) {
      if (typeof fn === 'function') { subs.push(fn); fn(me()); }
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },

    signUp: function (data) {
      try { validate(data, true); } catch (e) { return Promise.reject(e); }
      var name = String(data.name).trim();
      if (!CLOUD) return localSignUp(data);
      return api('/auth/v1/signup', {
        method: 'POST',
        anon: true,
        body: { email: String(data.email).trim(), password: data.password, data: { name: name } }
      }).then(function (res) {
        if (!res || !res.access_token) {
          throw new Error('Аккаунт создан. Подтвердите почту по ссылке из письма и войдите.');
        }
        saveCloudSession(res, name);
        return upsertProfile({}).then(me);
      });
    },

    signIn: function (data) {
      try { validate(data, false); } catch (e) { return Promise.reject(e); }
      if (!CLOUD) return localSignIn(data);
      return api('/auth/v1/token?grant_type=password', {
        method: 'POST',
        anon: true,
        body: { email: String(data.email).trim(), password: data.password }
      }).then(function (res) {
        saveCloudSession(res);
        return upsertProfile({}).then(me);
      });
    },

    /* Вход через Google или Discord (только облачный режим). */
    signInWith: function (provider) {
      if (!CLOUD) return Promise.reject(new Error('Вход через сервисы работает только с облачной базой'));
      var back = location.origin + location.pathname;
      location.href = BASE + '/auth/v1/authorize?provider=' + encodeURIComponent(provider) +
        '&redirect_to=' + encodeURIComponent(back);
      return Promise.resolve(null);
    },

    resetPassword: function (email) {
      if (!checkEmail(email)) return Promise.reject(new Error('Проверьте адрес почты'));
      if (!CLOUD) return Promise.reject(new Error('Восстановление пароля доступно только с облачной базой'));
      return api('/auth/v1/recover', {
        method: 'POST',
        anon: true,
        body: { email: String(email).trim() }
      }).then(function () { return true; });
    },

    signOut: function () {
      if (!CLOUD) { setSession(null); return Promise.resolve(true); }
      return api('/auth/v1/logout', { method: 'POST' })
        .catch(function () { return null; })
        .then(function () { setSession(null); return true; });
    },

    updateName: function (name) {
      var user = me();
      if (!user) return Promise.reject(new Error('Сначала войдите'));
      var clean = String(name || '').trim();
      if (clean.length < 2) return Promise.reject(new Error('Имя — минимум 2 символа'));
      var s = getSession();
      s.user.name = clean;
      setSession(s);
      if (!CLOUD) {
        return store('users', 'readwrite', function (st) {
          var req = st.get(user.email);
          req.onsuccess = function () {
            if (req.result) { req.result.name = clean; st.put(req.result); }
          };
          return req;
        }).then(function () { return clean; });
      }
      return api('/auth/v1/user', { method: 'PUT', body: { data: { name: clean } } })
        .catch(function () { return null; })
        .then(function () { return upsertProfile({}); })
        .then(function () { return clean; });
    },

    /* Прогресс: уровни, история просмотра, списки. */
    pullProgress: function () {
      var user = me();
      if (!user) return Promise.resolve(null);
      if (!CLOUD) {
        return store('progress', 'readonly', function (s) { return s.get(user.email); })
          .then(function (row) { return row || null; });
      }
      return api('/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=gamify,watch,lists,updated_at')
        .then(function (rows) { return rows && rows[0] ? rows[0] : null; });
    },

    pushProgress: function (data) {
      var user = me();
      if (!user) return Promise.resolve(null);
      var row = {
        email: user.email,
        gamify: data.gamify || null,
        watch: data.watch || null,
        lists: data.lists || null,
        updated_at: nowIso()
      };
      if (!CLOUD) return store('progress', 'readwrite', function (s) { return s.put(row); });
      return upsertProfile({ gamify: row.gamify, watch: row.watch, lists: row.lists });
    },

    /* Оценки тайтлов. В локальном режиме считается только своя оценка. */
    getRating: function (titleId) {
      var user = me();
      if (!CLOUD) {
        return Promise.resolve({ avg: null, count: 0, mine: null, cloud: false });
      }
      return api('/rest/v1/ratings?title_id=eq.' + encodeURIComponent(titleId) + '&select=value,user_id')
        .then(function (rows) {
          rows = rows || [];
          var sum = 0, mine = null;
          for (var i = 0; i < rows.length; i++) {
            sum += Number(rows[i].value) || 0;
            if (user && rows[i].user_id === user.id) mine = Number(rows[i].value);
          }
          return {
            avg: rows.length ? Math.round((sum / rows.length) * 10) / 10 : null,
            count: rows.length,
            mine: mine,
            cloud: true
          };
        });
    },

    setRating: function (titleId, value) {
      var user = me();
      if (!user) return Promise.reject(new Error('Сначала войдите'));
      var v = Math.max(1, Math.min(10, Math.round(Number(value) || 0)));
      if (!CLOUD) return Promise.resolve({ mine: v, cloud: false });
      return api('/rest/v1/ratings?on_conflict=user_id,title_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: [{ user_id: user.id, title_id: String(titleId), value: v, updated_at: nowIso() }]
      }).then(function () { return { mine: v, cloud: true }; });
    },

    listComments: function (titleId) {
      if (!CLOUD) return Promise.resolve(null);
      return api('/rest/v1/comments?title_id=eq.' + encodeURIComponent(titleId) +
        '&select=id,user_id,name,body,created_at&order=created_at.desc&limit=100');
    },

    addComment: function (titleId, body) {
      var user = me();
      if (!user) return Promise.reject(new Error('Сначала войдите'));
      if (!CLOUD) return Promise.reject(new Error('Комментарии работают только с облачной базой'));
      var text = String(body || '').trim();
      if (text.length < 2) return Promise.reject(new Error('Слишком короткий комментарий'));
      if (text.length > 1000) return Promise.reject(new Error('Не больше 1000 символов'));
      return api('/rest/v1/comments', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: [{ user_id: user.id, title_id: String(titleId), name: user.name, body: text }]
      }).then(function (rows) { return rows && rows[0] ? rows[0] : null; });
    },

    deleteComment: function (id) {
      if (!CLOUD) return Promise.reject(new Error('Комментарии работают только с облачной базой'));
      return api('/rest/v1/comments?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () { return true; });
    }
  };

  captureOauthRedirect();
  window.AnimDB = AnimDB;
})();
