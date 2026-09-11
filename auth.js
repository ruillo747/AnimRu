/* AnimRu — интерфейс аккаунта: модалка входа/регистрации, кнопка в шапке,
   блок аккаунта в профиле и синхронизация прогресса. */
(function () {
  'use strict';

  var DB = window.AnimDB;
  if (!DB) return;

  var LS_GAMIFY = 'animru:gamify';
  var LS_WATCH = 'animru:watch';
  var LS_LISTS = 'animru:lists';

  function $(id) { return document.getElementById(id); }

  function toast(message) {
    var box = $('toast');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { box.hidden = true; }, 3400);
  }

  function readJson(key, def) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : def; }
    catch (e) { return def; }
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ---------------- модалка ---------------- */

  var modal = $('authModal');
  var form = $('authForm');
  var errorBox = $('authError');

  function setError(message) {
    if (!errorBox) return;
    errorBox.textContent = message || '';
    errorBox.hidden = !message;
  }

  function setMode(mode) {
    if (!form) return;
    var signup = mode === 'signup';
    form.dataset.mode = signup ? 'signup' : 'signin';
    $('authTitle').textContent = signup ? 'Регистрация' : 'Вход';
    $('authNameRow').hidden = !signup;
    $('authSubmit').textContent = signup ? 'Создать аккаунт' : 'Войти';
    $('authSwitchHint').textContent = signup ? 'Уже есть аккаунт?' : 'Нет аккаунта?';
    $('authSwitch').textContent = signup ? 'Войти' : 'Зарегистрироваться';
    $('authPassword').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    setError('');
  }

  function openModal(mode) {
    if (!modal) return;
    setMode(mode || 'signin');
    modal.hidden = false;
    document.body.classList.add('modal-open');
    var oauth = $('authOauth');
    if (oauth) oauth.hidden = !DB.isCloud;
    var email = $('authEmail');
    if (email) setTimeout(function () { email.focus(); }, 30);
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    if (form) form.reset();
    setError('');
  }

  if (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-auth-close]')) closeModal();
    });
    modal.addEventListener('click', function (event) {
      var oauthBtn = event.target.closest('[data-oauth]');
      if (!oauthBtn) return;
      DB.signInWith(oauthBtn.getAttribute('data-oauth')).catch(function (err) { setError(err.message); });
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  var switchBtn = $('authSwitch');
  if (switchBtn) {
    switchBtn.addEventListener('click', function () {
      setMode(form.dataset.mode === 'signup' ? 'signin' : 'signup');
    });
  }

  var forgotBtn = $('authForgot');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', function () {
      var email = ($('authEmail').value || '').trim();
      setError('');
      DB.resetPassword(email).then(function () {
        toast('Письмо для смены пароля отправлено');
        closeModal();
      }).catch(function (err) { setError(err.message); });
    });
  }

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var submit = $('authSubmit');
      var signup = form.dataset.mode === 'signup';
      var data = {
        name: $('authName').value,
        email: $('authEmail').value,
        password: $('authPassword').value
      };
      setError('');
      submit.disabled = true;
      (signup ? DB.signUp(data) : DB.signIn(data))
        .then(function (user) {
          closeModal();
          toast(signup ? 'Аккаунт создан, добро пожаловать!' : ('С возвращением, ' + (user ? user.name : '') + '!'));
          return syncOnLogin();
        })
        .catch(function (err) { setError(err.message); })
        .then(function () { submit.disabled = false; });
    });
  }

  /* ---------------- кнопка в шапке ---------------- */

  var accountBtn = $('accountBtn');
  if (accountBtn) {
    accountBtn.addEventListener('click', function () {
      if (DB.me()) location.hash = '#/profile';
      else openModal('signin');
    });
  }

  /* ---------------- блок аккаунта в профиле ---------------- */

  var accountBox = $('accountBox');

  function renderAccount(user) {
    if (accountBtn) {
      accountBtn.textContent = user ? user.name : 'Войти';
      accountBtn.classList.toggle('is-signed', !!user);
      accountBtn.title = user ? 'Открыть профиль' : 'Войти или зарегистрироваться';
    }
    if (!accountBox) return;

    var where = DB.isCloud ? 'облачная база (доступно на всех устройствах)' : 'локальная база этого браузера';

    if (!user) {
      accountBox.innerHTML =
        '<p class="muted">Вы не вошли. Без аккаунта прогресс и списки хранятся только в этом браузере.</p>' +
        '<p class="muted small">Хранилище: ' + escapeHtml(where) + '</p>' +
        '<div class="pf-actions">' +
        '<button class="btn" data-auth="signin">Войти</button>' +
        '<button class="btn btn-ghost" data-auth="signup">Зарегистрироваться</button>' +
        '<button class="btn btn-ghost" data-auth="export">Скачать резервную копию</button>' +
        '<button class="btn btn-ghost" data-auth="import">Загрузить копию</button>' +
        '</div>';
      return;
    }

    accountBox.innerHTML =
      '<dl class="acc-list">' +
      '<div><dt>Имя</dt><dd>' + escapeHtml(user.name) + '</dd></div>' +
      '<div><dt>Почта</dt><dd>' + escapeHtml(user.email) + '</dd></div>' +
      '<div><dt>Хранилище</dt><dd>' + escapeHtml(where) + '</dd></div>' +
      '<div><dt>Способ входа</dt><dd>' + escapeHtml(user.provider === 'email' || user.provider === 'local' ? 'почта и пароль' : user.provider) + '</dd></div>' +
      '</dl>' +
      '<div class="pf-actions">' +
      '<button class="btn btn-ghost" data-auth="rename">Изменить имя</button>' +
      '<button class="btn btn-ghost" data-auth="sync">Сохранить прогресс</button>' +
      '<button class="btn btn-ghost" data-auth="export">Скачать резервную копию</button>' +
      '<button class="btn btn-ghost" data-auth="import">Загрузить копию</button>' +
      '<button class="btn btn-ghost" data-auth="signout">Выйти</button>' +
      '</div>';
  }

  if (accountBox) {
    accountBox.addEventListener('click', function (event) {
      var button = event.target.closest('[data-auth]');
      if (!button) return;
      var action = button.getAttribute('data-auth');

      if (action === 'signin' || action === 'signup') { openModal(action); return; }

      if (action === 'signout') {
        DB.signOut().then(function () { toast('Вы вышли из аккаунта'); });
        return;
      }

      if (action === 'rename') {
        var user = DB.me();
        var next = prompt('Новое имя', user ? user.name : '');
        if (next == null) return;
        DB.updateName(next)
          .then(function () { toast('Имя обновлено'); })
          .catch(function (err) { toast(err.message); });
        return;
      }

      if (action === 'sync') {
        pushNow().then(function () { toast('Прогресс сохранён'); })
          .catch(function (err) { toast(err.message); });
        return;
      }

      if (action === 'export') { exportBackup(); return; }
      if (action === 'import') { importBackup(); }
    });
  }

  /* ---------------- резервная копия файлом ---------------- */

  function exportBackup() {
    var payload = {
      app: 'AnimRu',
      version: 1,
      savedAt: new Date().toISOString(),
      gamify: readJson(LS_GAMIFY, null),
      watch: readJson(LS_WATCH, null),
      lists: readJson(LS_LISTS, null)
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'animru-backup.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Файл с прогрессом скачан');
  }

  function importBackup() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      file.text().then(function (text) {
        var data = JSON.parse(text);
        if (data.gamify) localStorage.setItem(LS_GAMIFY, JSON.stringify(data.gamify));
        if (data.watch) localStorage.setItem(LS_WATCH, JSON.stringify(data.watch));
        if (data.lists) localStorage.setItem(LS_LISTS, JSON.stringify(data.lists));
        toast('Копия загружена, обновляю страницу');
        setTimeout(function () { location.reload(); }, 700);
      }).catch(function () { toast('Файл не похож на резервную копию'); });
    });
    input.click();
  }

  /* ---------------- синхронизация ---------------- */

  function localSnapshot() {
    return {
      gamify: readJson(LS_GAMIFY, null),
      watch: readJson(LS_WATCH, null),
      lists: readJson(LS_LISTS, null)
    };
  }

  function weight(gamify) {
    if (!gamify) return -1;
    return (Number(gamify.level) || 0) * 100000 + (Number(gamify.xp) || 0);
  }

  function pushNow() {
    if (!DB.me()) return Promise.resolve(null);
    return DB.pushProgress(localSnapshot());
  }

  var pushTimer = null;
  function schedulePush() {
    if (!DB.me()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushNow().catch(function () {}); }, 4000);
  }

  function syncOnLogin() {
    if (!DB.me()) return Promise.resolve(null);
    return DB.pullProgress().then(function (remote) {
      var local = localSnapshot();
      if (remote && weight(remote.gamify) > weight(local.gamify)) {
        if (remote.gamify) localStorage.setItem(LS_GAMIFY, JSON.stringify(remote.gamify));
        if (remote.watch) localStorage.setItem(LS_WATCH, JSON.stringify(remote.watch));
        if (remote.lists) localStorage.setItem(LS_LISTS, JSON.stringify(remote.lists));
        toast('Загружен сохранённый прогресс');
        setTimeout(function () { location.reload(); }, 800);
        return null;
      }
      return pushNow();
    }).catch(function () { return null; });
  }

  if (window.Gamify && typeof window.Gamify.subscribe === 'function') {
    window.Gamify.subscribe(function () { schedulePush(); });
  }
  document.addEventListener('animru:lists-changed', schedulePush);
  window.addEventListener('beforeunload', function () {
    if (DB.me()) { try { pushNow(); } catch (e) {} }
  });

  DB.subscribe(renderAccount);
  if (DB.me()) syncOnLogin();

  window.AnimAuth = { open: openModal, close: closeModal, sync: pushNow, toast: toast };
})();
