/* AnimRu — надстройка над встроенным плеером (источник Anilibria):
   редизайн панели, плавная прокрутка без рывков, превью кадра на таймлайне как в YouTube,
   мини-плеер при прокрутке страницы, жесты перемотки и колёсико громкости.
   Всё работает поверх app.js: своих источников не загружаем, только дополняем. */
(function () {
  'use strict';

  var LS_VOL = 'animru:volume';
  var PREVIEW_W = 168;
  var PREVIEW_H = 94;

  var CSS = [
    'html{scroll-behavior:smooth}',

    /* ---- корпус плеера ---- */
    '.player{border-radius:16px;overflow:hidden;background:#07070a}',
    '.player.ap-hidecursor{cursor:none}',
    '.player .p-controls{background:linear-gradient(to top,rgba(6,6,9,0.92) 0%,rgba(6,6,9,0.6) 48%,rgba(6,6,9,0) 100%);' +
      'padding:26px 14px 10px;transition:opacity 180ms ease,transform 180ms ease}',
    '.player.hide-ui .p-controls{transform:translateY(6px)}',

    /* ---- таймлайн ---- */
    '.player .p-seek{position:relative;padding:10px 0 8px;cursor:pointer;touch-action:none}',
    '.player .p-seek-track{position:relative;height:4px;border-radius:999px;background:rgba(255,255,255,0.22);' +
      'transition:height 120ms ease}',
    '.player .p-seek:hover .p-seek-track,.player .p-seek.ap-drag .p-seek-track{height:6px}',
    '.player .p-buffer{position:absolute;left:0;top:0;height:100%;border-radius:999px;background:rgba(255,255,255,0.34)}',
    '.player .p-played{position:absolute;left:0;top:0;height:100%;border-radius:999px;background:var(--accent);' +
      'box-shadow:0 0 10px rgba(255,126,29,0.45)}',
    '.player .ap-hover{position:absolute;left:0;top:0;height:100%;border-radius:999px;' +
      'background:rgba(255,255,255,0.3);opacity:0;transition:opacity 120ms ease}',
    '.player .p-seek:hover .ap-hover{opacity:1}',
    '.player .p-knob{position:absolute;right:-7px;top:50%;width:14px;height:14px;margin-top:-7px;border-radius:50%;' +
      'background:var(--accent);transform:scale(0);transition:transform 130ms ease}',
    '.player .p-seek:hover .p-knob,.player .p-seek.ap-drag .p-knob{transform:scale(1)}',
    '.player #pTip{display:none !important}',

    /* ---- мини-экранчик превью ---- */
    '.ap-tip{position:absolute;bottom:26px;left:0;z-index:6;display:none;flex-direction:column;align-items:center;' +
      'gap:0;pointer-events:none;transform:translateX(-50%)}',
    '.ap-tip.on{display:flex}',
    '.ap-tip-shot{width:' + PREVIEW_W + 'px;height:' + PREVIEW_H + 'px;border-radius:10px;overflow:hidden;' +
      'background:#0c0c10;border:1px solid rgba(255,255,255,0.16);box-shadow:0 12px 28px rgba(0,0,0,0.55)}',
    '.ap-tip-shot canvas{width:100%;height:100%;display:block}',
    '.ap-tip-shot.empty{display:none}',
    '.ap-tip-time{margin-top:6px;padding:3px 8px;border-radius:6px;background:rgba(8,8,11,0.9);color:#fff;' +
      'font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}',

    /* ---- кнопки ---- */
    '.player .p-row{gap:4px;align-items:center}',
    '.player .p-btn{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:38px;' +
      'border-radius:10px;color:#fff;background:transparent;border:0;transition:background 140ms ease,transform 140ms ease}',
    '.player .p-btn:hover{background:rgba(255,255,255,0.14)}',
    '.player .p-btn:active{transform:scale(0.93)}',
    '.player .p-btn.p-text{padding:0 10px;font-size:13px;font-weight:700}',
    '.player .p-time{font-size:12.5px;font-variant-numeric:tabular-nums;color:#e8e8ef;padding:0 6px;white-space:nowrap}',
    '.player .p-volume input[type="range"]{width:0;opacity:0;transition:width 160ms ease,opacity 160ms ease}',
    '.player .p-volume:hover input[type="range"],.player .p-volume:focus-within input[type="range"]{width:84px;opacity:1}',
    '.player .p-menu{border-radius:12px;overflow:hidden;background:rgba(10,10,13,0.96);' +
      'border:1px solid rgba(255,255,255,0.12);box-shadow:0 16px 34px rgba(0,0,0,0.5)}',

    /* ---- большая кнопка и жесты ---- */
    '.player .p-bigplay{border-radius:50%;box-shadow:0 10px 30px rgba(0,0,0,0.45);' +
      'transition:transform 160ms ease,opacity 160ms ease}',
    '.player .p-bigplay:hover{transform:translate(-50%,-50%) scale(1.06)}',
    '.ap-jump{position:absolute;top:50%;z-index:4;display:flex;flex-direction:column;align-items:center;gap:4px;' +
      'transform:translateY(-50%) scale(0.9);padding:14px 18px;border-radius:999px;background:rgba(8,8,11,0.62);' +
      'color:#fff;font-size:13px;font-weight:700;opacity:0;pointer-events:none;transition:opacity 180ms ease,transform 180ms ease}',
    '.ap-jump.left{left:8%}',
    '.ap-jump.right{right:8%}',
    '.ap-jump.on{opacity:1;transform:translateY(-50%) scale(1)}',
    '.ap-hint{position:absolute;left:50%;top:14px;z-index:5;transform:translateX(-50%);padding:6px 12px;' +
      'border-radius:999px;background:rgba(8,8,11,0.72);color:#fff;font-size:12.5px;font-weight:600;opacity:0;' +
      'pointer-events:none;transition:opacity 180ms ease}',
    '.ap-hint.on{opacity:1}',

    /* ---- мини-плеер ---- */
    '.player.ap-mini{position:fixed;right:18px;bottom:18px;left:auto;top:auto;width:340px;max-width:46vw;' +
      'aspect-ratio:16/9;z-index:70;border-radius:14px;box-shadow:0 22px 48px rgba(0,0,0,0.6);' +
      'border:1px solid rgba(255,255,255,0.12);animation:ap-mini-in 200ms ease}',
    '@keyframes ap-mini-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
    '.player.ap-mini .p-controls{padding:14px 8px 6px}',
    '.player.ap-mini .p-time,.player.ap-mini .p-volume,.player.ap-mini .p-select{display:none}',
    '.ap-mini-x{position:absolute;right:6px;top:6px;z-index:8;width:28px;height:28px;border:0;border-radius:50%;' +
      'background:rgba(8,8,11,0.7);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:none}',
    '.player.ap-mini .ap-mini-x{display:block}',
    '.ap-mini-slot{display:none}',
    '.ap-mini-slot.on{display:block;width:100%;aspect-ratio:16/9;border-radius:16px;border:1px dashed var(--line);' +
      'background:var(--surface-2)}',
    '@media (max-width:620px){.player.ap-mini{width:62vw;max-width:none;right:10px;bottom:10px}}',
    '@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.player *{transition:none !important}}'
  ].join('');

  function byId(id) { return document.getElementById(id); }

  function injectCss() {
    if (byId('player-plus-css')) return;
    var style = document.createElement('style');
    style.id = 'player-plus-css';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function clock(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var rest = total % 60;
    var tail = (minutes < 10 && hours ? '0' : '') + minutes + ':' + (rest < 10 ? '0' : '') + rest;
    return hours ? hours + ':' + tail : tail;
  }

  /* ---------------- источник для превью ----------------
     Для HLS плеер получает blob-адрес, из которого вторую дорожку не соберёшь,
     поэтому запоминаем реальный адрес плейлиста на уровне Hls.loadSource. */

  var lastSource = '';

  function hookHls() {
    var Hls = window.Hls;
    if (!Hls || !Hls.prototype || Hls.prototype.__animruHooked) return;
    var original = Hls.prototype.loadSource;
    Hls.prototype.loadSource = function (url) {
      lastSource = String(url || '');
      preview.reset();
      return original.apply(this, arguments);
    };
    Hls.prototype.__animruHooked = true;
  }

  /* ---------------- мини-экранчик: кадр под курсором ---------------- */

  var preview = {
    video: null,
    hls: null,
    ready: false,
    dead: false,
    source: '',
    pending: null,
    busy: false,

    reset: function () {
      this.ready = false;
      this.dead = false;
      this.source = '';
      if (this.hls && this.hls.destroy) {
        try { this.hls.destroy(); } catch (e) {}
        this.hls = null;
      }
      if (this.video) {
        try { this.video.removeAttribute('src'); this.video.load(); } catch (e) {}
      }
      var shot = document.querySelector('.ap-tip-shot');
      if (shot) shot.classList.add('empty');
    },

    sourceUrl: function (main) {
      var direct = main && main.currentSrc ? String(main.currentSrc) : '';
      if (direct && direct.indexOf('blob:') !== 0) return direct;
      return lastSource;
    },

    ensure: function (main) {
      if (this.dead) return null;
      var url = this.sourceUrl(main);
      if (!url) return null;
      if (this.video && this.source === url) return this.video;

      this.reset();
      this.source = url;

      if (!this.video) {
        var shadow = document.createElement('video');
        shadow.muted = true;
        shadow.defaultMuted = true;
        shadow.playsInline = true;
        shadow.preload = 'auto';
        shadow.crossOrigin = 'anonymous';
        shadow.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';
        document.body.appendChild(shadow);
        this.video = shadow;
      }

      var self = this;
      this.video.addEventListener('loadeddata', function () { self.ready = true; }, { once: true });
      this.video.addEventListener('error', function () { self.dead = true; }, { once: true });

      if (/\.m3u8(\?|$)/i.test(url) && window.Hls && window.Hls.isSupported && window.Hls.isSupported()) {
        try {
          this.hls = new window.Hls({ maxBufferLength: 4, maxMaxBufferLength: 8, capLevelToPlayerSize: true });
          this.hls.loadSource(url);
          this.hls.attachMedia(this.video);
          /* самое низкое качество: картинка маленькая, зато появляется быстро */
          this.hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
            if (self.hls) self.hls.currentLevel = 0;
          });
        } catch (e) {
          this.dead = true;
          return null;
        }
      } else {
        this.video.src = url;
        try { this.video.load(); } catch (e) {}
      }
      return this.video;
    },

    draw: function (canvas, time) {
      var shadow = this.video;
      if (!shadow || !this.ready || this.dead) return;
      if (this.busy) { this.pending = time; return; }
      this.busy = true;
      var self = this;

      function paint() {
        try {
          var context = canvas.getContext('2d');
          context.drawImage(shadow, 0, 0, canvas.width, canvas.height);
          var shot = canvas.parentNode;
          if (shot) shot.classList.remove('empty');
        } catch (e) {
          self.dead = true;
        }
        self.busy = false;
        if (self.pending != null) {
          var next = self.pending;
          self.pending = null;
          if (Math.abs(next - shadow.currentTime) > 0.6) self.draw(canvas, next);
        }
      }

      shadow.addEventListener('seeked', paint, { once: true });
      setTimeout(function () {
        if (self.busy) { self.busy = false; }
      }, 1200);
      try { shadow.currentTime = time; } catch (e) { this.busy = false; }
    }
  };

  /* ---------------- основная сборка ---------------- */

  function boot() {
    injectCss();
    hookHls();

    var root = byId('playerRoot');
    var video = byId('player');
    var seek = byId('pSeek');
    if (!root || !video || !seek || root.getAttribute('data-plus')) return false;
    root.setAttribute('data-plus', '1');

    var track = seek.querySelector('.p-seek-track');
    var played = byId('pPlayed');
    var buffer = byId('pBuffer');

    /* подсветка дорожки до курсора */
    var hover = document.createElement('div');
    hover.className = 'ap-hover';
    if (track) track.insertBefore(hover, played || null);

    /* превью-окно */
    var tip = document.createElement('div');
    tip.className = 'ap-tip';
    tip.innerHTML = '<div class="ap-tip-shot empty"><canvas width="' + PREVIEW_W + '" height="' + PREVIEW_H +
      '"></canvas></div><div class="ap-tip-time">0:00</div>';
    seek.appendChild(tip);
    var canvas = tip.querySelector('canvas');
    var tipTime = tip.querySelector('.ap-tip-time');

    /* подсказки и жесты */
    var hint = document.createElement('div');
    hint.className = 'ap-hint';
    root.appendChild(hint);

    var jumpLeft = document.createElement('div');
    jumpLeft.className = 'ap-jump left';
    jumpLeft.textContent = '◀◀ 10 сек';
    var jumpRight = document.createElement('div');
    jumpRight.className = 'ap-jump right';
    jumpRight.textContent = '10 сек ▶▶';
    root.appendChild(jumpLeft);
    root.appendChild(jumpRight);

    var miniClose = document.createElement('button');
    miniClose.type = 'button';
    miniClose.className = 'ap-mini-x';
    miniClose.setAttribute('aria-label', 'Закрыть мини-плеер');
    miniClose.textContent = '×';
    root.appendChild(miniClose);

    var hintTimer = null;
    function flash(text) {
      hint.textContent = text;
      hint.classList.add('on');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hint.classList.remove('on'); }, 900);
    }

    function bump(node) {
      node.classList.add('on');
      setTimeout(function () { node.classList.remove('on'); }, 400);
    }

    /* ---- плавная прокрутка: полоса живёт на requestAnimationFrame,
           а не на редких timeupdate — оттуда и были рывки ---- */
    var dragging = false;

    function frame() {
      if (!dragging && played && video.duration) {
        var ratio = Math.min(1, Math.max(0, video.currentTime / video.duration));
        played.style.width = (ratio * 100).toFixed(3) + '%';
        if (buffer && video.buffered && video.buffered.length) {
          var end = video.buffered.end(video.buffered.length - 1);
          buffer.style.width = Math.min(100, (end / video.duration) * 100).toFixed(2) + '%';
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    /* ---- наведение на таймлайн ---- */
    function ratioAt(clientX) {
      var rect = (track || seek).getBoundingClientRect();
      if (!rect.width) return 0;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }

    var shotTimer = null;

    function moveTip(clientX) {
      if (!video.duration) return;
      var ratio = ratioAt(clientX);
      var time = ratio * video.duration;
      var rect = (track || seek).getBoundingClientRect();
      var half = PREVIEW_W / 2 + 8;
      var x = Math.min(rect.width - half, Math.max(half, clientX - rect.left));

      hover.style.width = (ratio * 100).toFixed(2) + '%';
      tip.style.left = x + 'px';
      tip.classList.add('on');
      tipTime.textContent = clock(time);

      clearTimeout(shotTimer);
      shotTimer = setTimeout(function () {
        var shadow = preview.ensure(video);
        if (shadow) preview.draw(canvas, time);
      }, 90);
    }

    seek.addEventListener('mousemove', function (event) { moveTip(event.clientX); });
    seek.addEventListener('mouseleave', function () {
      tip.classList.remove('on');
      hover.style.width = '0%';
    });

    /* перетаскивание: показываем кадр и не даём rAF перебивать позицию */
    seek.addEventListener('pointerdown', function (event) {
      dragging = true;
      seek.classList.add('ap-drag');
      moveTip(event.clientX);
    });
    window.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      moveTip(event.clientX);
      if (played && video.duration) played.style.width = (ratioAt(event.clientX) * 100).toFixed(2) + '%';
    });
    window.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      seek.classList.remove('ap-drag');
      tip.classList.remove('on');
    });

    /* ---- жесты: двойной клик по краю = ±10 секунд ---- */
    root.addEventListener('dblclick', function (event) {
      var target = event.target;
      if (target !== video && target !== root) return;
      var rect = root.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width;
      if (x > 0.32 && x < 0.68) return;
      event.preventDefault();
      event.stopPropagation();
      if (x <= 0.32) {
        video.currentTime = Math.max(0, video.currentTime - 10);
        bump(jumpLeft);
      } else {
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
        bump(jumpRight);
      }
    }, true);

    /* ---- колёсико над плеером меняет громкость ---- */
    root.addEventListener('wheel', function (event) {
      if (event.ctrlKey) return;
      event.preventDefault();
      var step = event.deltaY > 0 ? -0.05 : 0.05;
      var next = Math.min(1, Math.max(0, (video.volume || 0) + step));
      video.volume = next;
      if (next > 0) video.muted = false;
      flash('Громкость ' + Math.round(next * 100) + '%');
    }, { passive: false });

    /* запоминаем громкость между сериями */
    try {
      var savedVolume = parseFloat(localStorage.getItem(LS_VOL));
      if (isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) video.volume = savedVolume;
    } catch (e) {}
    video.addEventListener('volumechange', function () {
      try { localStorage.setItem(LS_VOL, String(video.volume)); } catch (e) {}
    });

    /* ---- курсор убирается вместе с панелью ---- */
    var cursorTimer = null;
    root.addEventListener('mousemove', function () {
      root.classList.remove('ap-hidecursor');
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(function () {
        if (!video.paused) root.classList.add('ap-hidecursor');
      }, 2200);
    });
    video.addEventListener('pause', function () { root.classList.remove('ap-hidecursor'); });

    /* ---- мини-плеер при прокрутке, как на YouTube ---- */
    var slot = document.createElement('div');
    slot.className = 'ap-mini-slot';
    if (root.parentNode) root.parentNode.insertBefore(slot, root);

    var miniAllowed = true;

    function setMini(on) {
      if (on === root.classList.contains('ap-mini')) return;
      if (on) {
        slot.style.height = root.getBoundingClientRect().height + 'px';
        slot.classList.add('on');
        root.classList.add('ap-mini');
      } else {
        root.classList.remove('ap-mini');
        slot.classList.remove('on');
        slot.style.height = '';
      }
    }

    if (window.IntersectionObserver) {
      var watcher = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var far = entry.intersectionRatio < 0.25;
          var playing = !video.paused && !video.ended && video.currentTime > 0;
          if (far && playing && miniAllowed && !document.fullscreenElement) setMini(true);
          if (!far) setMini(false);
        });
      }, { threshold: [0, 0.25, 0.6] });
      watcher.observe(slot);
    }

    miniClose.addEventListener('click', function (event) {
      event.stopPropagation();
      miniAllowed = false;
      setMini(false);
      video.pause();
      setTimeout(function () { miniAllowed = true; }, 1500);
    });

    root.addEventListener('dblclick', function () {
      if (root.classList.contains('ap-mini')) {
        setMini(false);
        slot.scrollIntoView({ block: 'center' });
      }
    });

    video.addEventListener('pause', function () { setMini(false); });
    window.addEventListener('hashchange', function () {
      setMini(false);
      preview.reset();
    });

    /* ---- горячие клавиши в стиле YouTube: J / L / стрелки вверх-вниз / цифры ---- */
    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      var node = event.target;
      if (node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable)) return;
      var visible = root.classList.contains('ap-mini') || document.fullscreenElement ||
        (function () {
          var rect = root.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        })();
      if (!visible || !video.duration) return;
      var key = event.key.toLowerCase();

      if (key === 'j') {
        video.currentTime = Math.max(0, video.currentTime - 10);
        bump(jumpLeft);
      } else if (key === 'l') {
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
        bump(jumpRight);
      } else if (event.key === 'ArrowUp') {
        video.volume = Math.min(1, video.volume + 0.05);
        flash('Громкость ' + Math.round(video.volume * 100) + '%');
      } else if (event.key === 'ArrowDown') {
        video.volume = Math.max(0, video.volume - 0.05);
        flash('Громкость ' + Math.round(video.volume * 100) + '%');
      } else if (/^[0-9]$/.test(event.key)) {
        video.currentTime = video.duration * (Number(event.key) / 10);
        flash(clock(video.currentTime));
      } else {
        return;
      }
      event.preventDefault();
    });

    /* ---- плавный скролл к плееру при выборе серии ---- */
    var episodes = byId('episodes');
    if (episodes) {
      episodes.addEventListener('click', function (event) {
        if (!event.target || !event.target.closest) return;
        if (!event.target.closest('button, a')) return;
        setTimeout(function () {
          if (window.innerWidth <= 900) slot.scrollIntoView({ block: 'start' });
        }, 120);
      });
    }

    return true;
  }

  function start() {
    injectCss();
    hookHls();
    if (boot()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (boot() || tries > 60) clearInterval(timer);
    }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.AnimPlayerPlus = {
    preview: function () { return preview; },
    source: function () { return lastSource; }
  };
})();
