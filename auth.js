/* AnimRu — регистрация, вход и привязка прогресса к аккаунту.
   Работает поверх AnimDB и не требует правок в app.js. */
(function () {
  'use strict';

  var DB = window.AnimDB;
  var LS_GAMIFY = 'animru:gamify';
  var LS_WATCH = 'animru:watch';
  var syncTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* квота исчерпана — остаёмся на текущих данных */
    }
  }

  function toast(message) {
    var box = $('toast');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
    window.clearTimeout(box.dataset.timer ? Number(box.dataset.timer) : 0);
    box.dataset.timer = String(
      window.setTimeout(function () {
        box.hidden = true;
      }, 3200)
    );
  }

  /* ---------------- шапка ---------------- */

  function renderAccountButton() {
    var button = $('accountBtn');
    if (!button) return;
    var user = DB.me();
    button.textContent = user ? user.name : 'Войти';
    button.classList.toggle('is-signed', !!user);
    button.setAttribute('title', user ? 'Вы вошли как ' + user.email : 'Вход и регистрация');
  }

  /* ---------------- модалка ---------------- */

  var lastFocused = null;

  function openModal(mode) {
    var modal = $('authModal');
    if (!modal) return;
    lastFocused = document.activeElement;
    setMode(mode || 'signin');
    modal.hidden = false;
    document.body.classList.add('modal-open');
    var field = $('authEmail');
    if (field) field.focus();
  }

  function closeModal() {
    var modal = $('authModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    setError('');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function setMode(mode) {
    var isSignUp = mode === 'signup';
    var nameRow = $('authNameRow');
    var submit = $('authSubmit');
    var title = $('authTitle');
    var hint = $('authSwitchHint');
    var switchBtn = $('authSwitch');
    var form = $('authForm');
    if (form) form.dataset.mode = isSignUp ? 'signup' : 'signin';
    if (nameRow) nameRow.hidden = !isSignUp;
    if (submit) submit.textContent = isSignUp ? 'Зарегистрироваться' : 'Войти';
    if (title) title.textContent = isSignUp ? 'Регистрация' : 'Вход';
    if (hint) hint.textContent = isSignUp ? 'Уже есть аккаунт?' : 'Нет аккаунта?';
    if (switchBtn) switchBtn.textContent = isSignUp ? 'Войти' : 'Зарегистрироваться';
    setError('');
  }

  function setError(message) {
    var box = $('authError');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function setBusy(busy) {
    var submit = $('authSubmit');
    if (submit) {
      submit.disabled = busy;
      submit.textContent = busy ? 'Подождите…' : submit.textContent;
    }
  }

  /* ---------------- синхронизация прогресса ---------------- */

  function localProgress() {
    return { gamify: readJson(LS_GAMIFY), watch: readJson(LS_WATCH) };
  }

  function scheduleSync() {
    if (!DB.me()) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(function () {
      DB.pushProgress(localProgress()).catch(function () {
        /* нет сети — прогресс остался в браузере, отправится позже */
      });
    }, 4000);
  }

  function xpOf(state) {
    if (!state) return -1;
    var level = Number(state.level || 1);
    var xp = Number(state.xp || 0);
    return level * 100000 + xp;
  }

  function adoptRemote(remote) {
    var mine = localProgress();
    var remoteGamify = remote && remote.gamify;
    if (!remoteGamify) {
      scheduleSync();
      return false;
    }
    if (xpOf(remoteGamify) <= xpOf(mine.gamify)) {
      scheduleSync();
      return false;
    }
    writeJson(LS_GAMIFY, remoteGamify);
    if (remote.watch) writeJson(LS_WATCH, remote.watch);
    return true;
  }

  function afterSignIn(user, isNew) {
    renderAccountButton();
    closeModal();
    return DB.pullProgress()
      .then(function (remote) {
        var replaced = adoptRemote(remote);
        if (replaced) {
          toast('С возвращением, ' + user.name + '. Загружаю ваш прогресс…');
          window.setTimeout(function () {
            window.location.reload();
          }, 900);
          return;
        }
        toast(isNew ? 'Аккаунт создан: ' + user.name : 'Вы вошли как ' + user.name);
        renderProfileAccount();
      })
      .catch(function () {
        toast(isNew ? 'Аккаунт создан: ' + user.name : 'Вы вошли как ' + user.name);
        renderProfileAccount();
      });
  }

  /* ---------------- блок аккаунта в профиле ---------------- */

  function renderProfileAccount() {
    var box = $('accountBox');
    if (!box) return;
    var user = DB.me();
    var storage = DB.isCloud ? 'облачная база (Supabase Postgres)' : 'локальная база браузера (IndexedDB)';

    if (!user) {
      box.innerHTML =
        '<p class="muted small">Вы не вошли. Создайте аккаунт, чтобы уровни, квесты и история просмотра сохранялись. Хранилище: ' +
        storage +
        '.</p>' +
        '<div class="pf-actions">' +
        '<button class="btn" data-auth="signup">Зарегистрироваться</button>' +
        '<button class="btn btn-ghost" data-auth="signin">Войти</button>' +
        '</div>';
      return;
    }

    box.innerHTML =
      '<dl class="acc-list">' +
      '<div><dt>Имя</dt><dd>' +
      escapeHtml(user.name) +
      '</dd></div>' +
      '<div><dt>Почта</dt><dd>' +
      escapeHtml(user.email) +
      '</dd></div>' +
      '<div><dt>Хранилище</dt><dd>' +
      storage +
      '</dd></div>' +
      '</dl>' +
      '<div class="pf-actions">' +
      '<button class="btn btn-ghost" data-auth="rename">Изменить имя</button>' +
      '<button class="btn btn-ghost" data-auth="sync">Сохранить прогресс</button>' +
      '<button class="btn btn-ghost" data-auth="signout">Выйти</button>' +
      '</div>';

    var nameNode = $('pfName');
    if (nameNode) nameNode.textContent = user.name;
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (char) {
      if (char === '&') return '&amp;';
      if (char === '<') return '&lt;';
      if (char === '>') return '&gt;';
      if (char === '"') return '&quot;';
      return '&#39;';
    });
  }

  /* ---------------- события ---------------- */

  function handleSubmit(event) {
    event.preventDefault();
    var form = $('authForm');
    if (!form) return;
    var isSignUp = form.dataset.mode === 'signup';
    var emailNode = $('authEmail');
    var passwordNode = $('authPassword');
    var nameNode = $('authName');
    var payload = {
      email: emailNode ? emailNode.value : '',
      password: passwordNode ? passwordNode.value : '',
      name: nameNode ? nameNode.value : ''
    };

    setError('');
    setBusy(true);
    var action = isSignUp ? DB.signUp(payload) : DB.signIn(payload);
    action
      .then(function (user) {
        setBusy(false);
        if (passwordNode) passwordNode.value = '';
        return afterSignIn(user, isSignUp);
      })
      .catch(function (error) {
        setBusy(false);
        setMode(isSignUp ? 'signup' : 'signin');
        setError(error && error.message ? error.message : 'Не удалось выполнить запрос');
      });
  }

  function handleAction(action) {
    if (action === 'signin' || action === 'signup') {
      openModal(action);
      return;
    }
    if (action === 'signout') {
      DB.signOut().then(function () {
        renderAccountButton();
        renderProfileAccount();
        toast('Вы вышли из аккаунта');
      });
      return;
    }
    if (action === 'rename') {
      var user = DB.me();
      var next = window.prompt('Новое имя', user ? user.name : '');
      if (next === null) return;
      DB.updateName(next)
        .then(function () {
          renderAccountButton();
          renderProfileAccount();
          toast('Имя обновлено');
        })
        .catch(function (error) {
          toast(error && error.message ? error.message : 'Не удалось сохранить имя');
        });
      return;
    }
    if (action === 'sync') {
      DB.pushProgress(localProgress())
        .then(function () {
          toast('Прогресс сохранён');
        })
        .catch(function (error) {
          toast(error && error.message ? error.message : 'Не удалось сохранить прогресс');
        });
    }
  }

  function init() {
    if (!DB) return;

    renderAccountButton();

    document.addEventListener('click', function (event) {
      var target = event.target instanceof Element ? event.target.closest('[data-auth]') : null;
      if (target) {
        event.preventDefault();
        handleAction(target.getAttribute('data-auth'));
        return;
      }
      var backdrop = event.target instanceof Element ? event.target.closest('[data-auth-close]') : null;
      if (backdrop) closeModal();
    });

    var accountBtn = $('accountBtn');
    if (accountBtn) {
      accountBtn.addEventListener('click', function () {
        if (DB.me()) window.location.hash = '#/profile';
        else openModal('signin');
      });
    }

    var switchBtn = $('authSwitch');
    if (switchBtn) {
      switchBtn.addEventListener('click', function () {
        var form = $('authForm');
        setMode(form && form.dataset.mode === 'signup' ? 'signin' : 'signup');
      });
    }

    var form = $('authForm');
    if (form) form.addEventListener('submit', handleSubmit);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeModal();
    });

    window.addEventListener('hashchange', function () {
      window.setTimeout(renderProfileAccount, 0);
    });
    window.setTimeout(renderProfileAccount, 0);

    window.addEventListener('beforeunload', function () {
      if (!DB.me()) return;
      window.clearTimeout(syncTimer);
      DB.pushProgress(localProgress()).catch(function () {
        /* выход со страницы — ошибку показать негде */
      });
    });

    if (window.Gamify && typeof window.Gamify.subscribe === 'function') {
      window.Gamify.subscribe(function () {
        scheduleSync();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
