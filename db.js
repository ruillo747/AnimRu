/* AnimRu — слой данных: аккаунты и прогресс.
   Два бэкенда:
   1. supabase — если в config.js заданы URL и anon-ключ (Postgres + Auth по REST);
   2. local — IndexedDB в браузере, пароли хешируются PBKDF2-SHA256.
   Публичный API одинаковый: window.AnimDB. */
(function () {
  'use strict';

  var CFG = window.ANIMRU_CONFIG || {};
  var SB_URL = (CFG.supabaseUrl || '').replace(/\/+$/, '');
  var SB_KEY = CFG.supabaseAnonKey || '';
  var USE_SB = !!(SB_URL && SB_KEY);

  var LS_SESSION = 'animru:session';
  var DB_NAME = 'animru';
  var DB_VERSION = 1;

  /* ---------------- общие утилиты ---------------- */

  function normEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function fail(message) {
    return Promise.reject(new Error(message));
  }

  function validate(data, needName) {
    var email = normEmail(data && data.email);
    var password = String((data && data.password) || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Проверьте адрес почты';
    if (password.length < 8) return 'Пароль короче 8 символов';
    if (needName && String((data && data.name) || '').trim().length < 2) return 'Имя короче 2 символов';
    return null;
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
    } catch (e) {
      return null;
    }
  }

  function writeSession(value) {
    try {
      if (value) localStorage.setItem(LS_SESSION, JSON.stringify(value));
      else localStorage.removeItem(LS_SESSION);
    } catch (e) {
      /* приватный режим — работаем без сохранения сессии */
    }
  }

  /* ---------------- бэкенд Supabase ---------------- */

  function sbFetch(path, options) {
    var opts = options || {};
    var headers = Object.assign({ apikey: SB_KEY, 'Content-Type': 'application/json' }, opts.headers || {});
    var session = readSession();
    if (opts.auth !== false && session && session.accessToken) {
      headers.Authorization = 'Bearer ' + session.accessToken;
    }
    return fetch(SB_URL + path, { method: opts.method || 'GET', headers: headers, body: opts.body })
      .then(function (response) {
        return response.text().then(function (text) {
          var json = null;
          if (text) {
            try {
              json = JSON.parse(text);
            } catch (e) {
              json = null;
            }
          }
          if (!response.ok) {
            var message = (json && (json.msg || json.message || json.error_description || json.error)) || 'Сервер ответил ' + response.status;
            throw new Error(message);
          }
          return json;
        });
      });
  }

  function sbSession(payload, name) {
    var user = payload && payload.user;
    if (!payload || !payload.access_token || !user) {
      throw new Error('Подтвердите адрес почты по ссылке из письма, затем войдите');
    }
    var meta = user.user_metadata || {};
    var session = {
      backend: 'supabase',
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || '',
      user: { id: user.id, email: user.email, name: name || meta.name || (user.email || '').split('@')[0] }
    };
    writeSession(session);
    return session.user;
  }

  var supabaseBackend = {
    name: 'supabase',

    signUp: function (data) {
      var problem = validate(data, true);
      if (problem) return fail(problem);
      var name = String(data.name).trim();
      return sbFetch('/auth/v1/signup', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email: normEmail(data.email), password: data.password, data: { name: name } })
      }).then(function (payload) {
        var user = sbSession(payload, name);
        return supabaseBackend.saveProfile({ name: name }).then(function () {
          return user;
        });
      });
    },

    signIn: function (data) {
      var problem = validate(data, false);
      if (problem) return fail(problem);
      return sbFetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email: normEmail(data.email), password: data.password })
      }).then(function (payload) {
        return sbSession(payload, null);
      });
    },

    signOut: function () {
      return sbFetch('/auth/v1/logout', { method: 'POST' })
        .catch(function () {
          return null;
        })
        .then(function () {
          writeSession(null);
        });
    },

    saveProfile: function (patch) {
      var session = readSession();
      if (!session) return fail('Нужен вход');
      var row = Object.assign({ id: session.user.id, email: session.user.email }, patch);
      return sbFetch('/rest/v1/profiles?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row)
      }).then(function () {
        if (patch && patch.name) {
          session.user.name = patch.name;
          writeSession(session);
        }
        return session.user;
      });
    },

    pullProgress: function () {
      var session = readSession();
      if (!session) return fail('Нужен вход');
      return sbFetch('/rest/v1/profiles?select=gamify,watch&id=eq.' + encodeURIComponent(session.user.id)).then(function (rows) {
        var row = (rows && rows[0]) || {};
        return { gamify: row.gamify || null, watch: row.watch || null };
      });
    },

    pushProgress: function (progress) {
      return supabaseBackend.saveProfile({
        gamify: progress.gamify || null,
        watch: progress.watch || null,
        updated_at: new Date().toISOString()
      });
    }
  };

  /* ---------------- бэкенд IndexedDB ---------------- */

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('Браузер не поддерживает локальную базу'));
        return;
      }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'email' });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'email' });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error('Не удалось открыть локальную базу'));
      };
    });
    return dbPromise;
  }

  function tx(store, mode, run) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(store, mode);
        var request = run(transaction.objectStore(store));
        transaction.oncomplete = function () {
          resolve(request ? request.result : null);
        };
        transaction.onerror = function () {
          reject(transaction.error || new Error('Ошибка запроса к базе'));
        };
        transaction.onabort = function () {
          reject(transaction.error || new Error('Запрос к базе отменён'));
        };
      });
    });
  }

  function toHex(buffer) {
    return Array.prototype.map
      .call(new Uint8Array(buffer), function (byte) {
        return ('0' + byte.toString(16)).slice(-2);
      })
      .join('');
  }

  function randomSalt() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
  }

  function hashPassword(password, salt) {
    var encoder = new TextEncoder();
    if (!crypto.subtle) return Promise.reject(new Error('Нужен защищённый контекст (https или localhost)'));
    return crypto.subtle
      .importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 150000 },
          key,
          256
        );
      })
      .then(toHex);
  }

  function localUser(row) {
    return { id: row.email, email: row.email, name: row.name };
  }

  var localBackend = {
    name: 'local',

    signUp: function (data) {
      var problem = validate(data, true);
      if (problem) return fail(problem);
      var email = normEmail(data.email);
      var name = String(data.name).trim();
      return tx('users', 'readonly', function (store) {
        return store.get(email);
      }).then(function (existing) {
        if (existing) throw new Error('Такая почта уже зарегистрирована');
        var salt = randomSalt();
        return hashPassword(data.password, salt).then(function (hash) {
          var row = { email: email, name: name, salt: salt, hash: hash, createdAt: Date.now() };
          return tx('users', 'readwrite', function (store) {
            return store.put(row);
          }).then(function () {
            writeSession({ backend: 'local', user: localUser(row) });
            return localUser(row);
          });
        });
      });
    },

    signIn: function (data) {
      var problem = validate(data, false);
      if (problem) return fail(problem);
      var email = normEmail(data.email);
      return tx('users', 'readonly', function (store) {
        return store.get(email);
      }).then(function (row) {
        if (!row) throw new Error('Аккаунт не найден');
        return hashPassword(data.password, row.salt).then(function (hash) {
          if (hash !== row.hash) throw new Error('Неверный пароль');
          writeSession({ backend: 'local', user: localUser(row) });
          return localUser(row);
        });
      });
    },

    signOut: function () {
      writeSession(null);
      return Promise.resolve();
    },

    saveProfile: function (patch) {
      var session = readSession();
      if (!session) return fail('Нужен вход');
      var email = session.user.email;
      return tx('users', 'readonly', function (store) {
        return store.get(email);
      }).then(function (row) {
        if (!row) throw new Error('Аккаунт не найден');
        if (patch && patch.name) row.name = String(patch.name).trim();
        return tx('users', 'readwrite', function (store) {
          return store.put(row);
        }).then(function () {
          session.user = localUser(row);
          writeSession(session);
          return session.user;
        });
      });
    },

    pullProgress: function () {
      var session = readSession();
      if (!session) return fail('Нужен вход');
      return tx('progress', 'readonly', function (store) {
        return store.get(session.user.email);
      }).then(function (row) {
        return { gamify: (row && row.gamify) || null, watch: (row && row.watch) || null };
      });
    },

    pushProgress: function (progress) {
      var session = readSession();
      if (!session) return fail('Нужен вход');
      var row = {
        email: session.user.email,
        gamify: progress.gamify || null,
        watch: progress.watch || null,
        updatedAt: Date.now()
      };
      return tx('progress', 'readwrite', function (store) {
        return store.put(row);
      }).then(function () {
        return session.user;
      });
    }
  };

  /* ---------------- публичный API ---------------- */

  var backend = USE_SB ? supabaseBackend : localBackend;

  window.AnimDB = {
    backend: backend.name,
    isCloud: backend.name === 'supabase',
    me: function () {
      var session = readSession();
      return session && session.backend === backend.name ? session.user : null;
    },
    signUp: function (data) {
      return backend.signUp(data);
    },
    signIn: function (data) {
      return backend.signIn(data);
    },
    signOut: function () {
      return backend.signOut();
    },
    updateName: function (name) {
      if (String(name || '').trim().length < 2) return fail('Имя короче 2 символов');
      return backend.saveProfile({ name: String(name).trim() });
    },
    pullProgress: function () {
      return backend.pullProgress();
    },
    pushProgress: function (progress) {
      return backend.pushProgress(progress || {});
    }
  };
})();
