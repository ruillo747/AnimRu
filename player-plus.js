/* AnimRu — надстройка над встроенным плеером (источник Anilibria):
   перетаскивание ручки, редизайн панели, превью кадра на таймлайне как в YouTube,
   мини-плеер при прокрутке страницы и жесты перемотки.
   В app.js у полосы был только click, поэтому тянуть кружочек было невозможно —
   здесь добавлен полноценный drag через pointer-события и захват курсора. */
(function () {
  'use strict';

  var LS_VOL = 'animru:volume';
  var SHOT_W = 168;
  var SHOT_H = 94;

  var CSS = [
    /* ---- корпус ---- */
    '.player{border-radius:16px;overflow:hidden;background:#07070a}',
    '.player.ap-hidecursor{cursor:none}',
    '.player .p-controls{background:linear-gradient(to top,rgba(6,6,9,0.92) 0%,rgba(6,6,9,0.6) 48%,rgba(6,6,9,0) 100%);' +
      'padding:22px 14px 10px}',

    /* ---- таймлайн: широкая зона захвата, чтобы легко брался пальцем и мышкой ---- */
    '.player .p-seek{position:relative;padding:14px 0 12px;cursor:pointer;touch-action:none;' +
      '-webkit-user-select:none;user-select:none}',
    '.player .p-seek-track{position:relative;height:5px;border-radius:999px;background:rgba(255,255,255,0.22);' +
      'transition:height 120ms ease}',
    '.player .p-seek:hover .p-seek-track,.player .p-seek.ap-drag .p-seek-track{height:7px}',
    '.player .p-buffer{position:absolute;left:0;top:0;height:100%;border-radius:999px;background:rgba(255,255,255,0.34)}',
    '.player .p-played{position:absolute;left:0;top:0;height:100%;border-radius:999px;background:var(--accent);' +
      'box-shadow:0 0 10px rgba(255,126,29,0.4)}',
    '.player .ap-hover{position:absolute;left:0;top:0;height:100%;width:0;border-radius:999px;' +
      'background:rgba(255,255,255,0.3);opacity:0;transition:opacity 120ms ease}',
    '.player .p-seek:hover .ap-hover{opacity:1}',
    '.player .p-knob{position:absolute;right:-8px;top:50%;width:16px;height:16px;margin-top:-8px;border-radius:50%;' +
      'background:var(--accent);box-shadow:0 2px 8px rgba(0,0,0,0.45);transform:scale(0);' +
      'transition:transform 130ms ease}',
    '.player .p-seek:hover .p-knob{transform:scale(1)}',
    '.player .p-seek.ap-drag .p-knob{transform:scale(1.25)}',
    '.player #pTip{display:none !important}',

    /* ---- мини-экранчик над таймлайном ---- */
    '.ap-tip{position:absolute;left:0;bottom:0;z-index:9;display:none;flex-direction:column;align-items:center;' +
      'pointer-events:none;transform:translateX(-50%)}',
    '.ap-tip.on{display:flex}',
    '.ap-shot{width:' + SHOT_W + 'px;height:' + SHOT_H + 'px;border-radius:10px;overflow:hidden;background:#0c0c10;' +
      'border:1px solid rgba(255,255,255,0.16);box-shadow:0 12px 28px rgba(0,0,0,0.55);display:none}',
    '.ap-shot.on{display:block}',
    '.ap-shot canvas{width:100%;height:100%;display:block}',
    '.ap-tip-time{margin-top:6px;padding:3px 9px;border-radius:7px;background:rgba(8,8,11,0.92);color:#fff;' +
      'font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}',

    /* ---- кнопки ---- */
    '.player .p-row{gap:4px;align-items:center}',
    '.player .p-btn{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:38px;' +
      'border-radius:10px;color:#fff;background:transparent;border:0;transition:background 140ms ease,transform 140ms ease}',
    '.player .p-btn:hover{background:rgba(255,255,255,0.14)}',
    '.player .p-btn:active{transform:scale(0.93)}',
    '.player .p-btn.p-text{padding:0 10px;font-size:13px;font-weight:700}',
    '.player .p-time{font-size:12.5px;font-variant-numeric:tabular-nums;color:#e8e8ef;padding:0 6px;white-space:nowrap}',
    '.player .p-menu{border-radius:12px;overflow:hidden;background:rgba(10,10,13,0.96);' +
      'border:1px solid rgba(255,255,255,0.12);box-shadow:0 16px 34px rgba(0,0,0,0.5)}',
    '.player .p-bigplay{border-radius:50%;box-shadow:0 10px 30px rgba(0,0,0,0.45)}',

    /* ---- жесты и подсказки ---- */
    '.ap-jump{position:absolute;top:50%;z-index:4;transform:translateY(-50%) scale(0.9);padding:12px 18px;' +
      'border-radius:999px;background:rgba(8,8,11,0.62);color:#fff;font-size:13px;font-weight:700;opacity:0;' +
      'pointer-events:none;transition:opacity 180ms ease,transform 180ms ease}',
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
      'border:1px solid rgba(255,255,255,0.12)}',
    '.player.ap-mini .p-controls{padding:14px 8px 6px}',
    '.player.ap-mini .p-time,.player.ap-mini .p-volume,.player.ap-mini .p-select{display:none}',
    '.ap-mini-x{position:absolute;right:6px;top:6px;z-index:8;width:28px;height:28px;border:0;border-radius:50%;' +
      'background:rgba(8,8,11,0.7);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:none}',
    '.player.ap-mini .ap-mini-x{display:block}',
    '.ap-slot{display:none}',
    '.ap-slot.on{display:block;width:100%;border-radius:16px;border:1px dashed var(--line);background:var(--surface-2)}',
    '@media (max-width:620px){.player.ap-mini{width:62vw;max-width:none;right:10px;bottom:10px}' +
      '.player .p-seek{padding:16px 0 14px}}',
    '@media (prefers-reduced-motion:reduce){.player *{transition:none !important}}'
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

  /* ---------------- откуда берём кадры для превью ---------------- */

  var lastSource = '';
  var diag = { source: '', mode: '', ready: false, error: '', frames: 0 };

  function hookHls() {
    var Hls = window.Hls;
    if (!Hls || !Hls.prototype || Hls.prototype.__animruHooked) return;
    var original = Hls.prototype.loadSource;
    Hls.prototype.loadSource = function (url) {
      lastSource = String(url || '');
      shots.reset();
      return original.apply(this, arguments);
    };
    Hls.prototype.__animruHooked = true;
  }

  var shots = {
    video: null,
    hls: null,
    source: '',
    ready: false,
    dead: false,
    busy: false,
    want: null,

    reset: function () {
      this.ready = false;
      this.dead = false;
      this.busy = false;
      this.want = null;
      this.source = '';
      diag.ready = false;
      diag.frames = 0;
      if (this.hls) {
        try { this.hls.destroy(); } catch (e) {}
        this.hls = null;
      }
      if (this.video) {
        try {
          this.video.removeAttribute('src');
          this.video.load();
        } catch (e) {}
      }
      var box = document.querySelector('.ap-shot');
      if (box) box.classList.remove('on');
    },

    url: function (main) {
      var direct = main && main.currentSrc ? String(main.currentSrc) : '';
      if (direct && direct.indexOf('blob:') !== 0) return direct;
      return lastSource;
    },

    shadow: function () {
      if (this.video) return this.video;
      var node = document.createElement('video');
      node.muted = true;
      node.defaultMuted = true;
      node.playsInline = true;
      node.setAttribute('playsinline', '');
      node.preload = 'auto';
      node.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none';
      document.body.appendChild(node);
      this.video = node;
      return node;
    },

    ensure: function (main) {
      if (this.dead) return null;
      var url = this.url(main);
      if (!url) { diag.error = 'no-source'; return null; }
      if (this.source === url && this.video) return this.video;

      this.reset();
      this.source = url;
      diag.source = url;
      var node = this.shadow();
      var self = this;

      function markReady() {
        self.ready = true;
        diag.ready = true;
      }

      node.addEventListener('loadeddata', markReady);
      node.addEventListener('canplay', markReady);
      node.addEventListener('error', function () {
        self.dead = true;
        diag.error = 'media-error';
      });

      var isHls = /\.m3u8(\?|$)/i.test(url);
      if (isHls && window.Hls && window.Hls.isSupported && window.Hls.isSupported()) {
        diag.mode = 'hls';
        try {
          var hls = new window.Hls({
            maxBufferLength: 6,
            maxMaxBufferLength: 12,
            capLevelToPlayerSize: false,
            startLevel: 0
          });
          hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
            try { hls.currentLevel = 0; } catch (e) {}
            markReady();
          });
          hls.on(window.Hls.Events.ERROR, function (event, data) {
            if (data && data.fatal) {
              self.dead = true;
              diag.error = 'hls-fatal';
            }
          });
          hls.loadSource(url);
          hls.attachMedia(node);
          this.hls = hls;
        } catch (e) {
          this.dead = true;
          diag.error = 'hls-init';
          return null;
        }
      } else if (isHls && !(node.canPlayType && node.canPlayType('application/vnd.apple.mpegurl'))) {
        this.dead = true;
        diag.error = 'no-hls';
        return null;
      } else {
        diag.mode = 'native';
        node.src = url;
        try { node.load(); } catch (e) {}
      }
      return node;
    },

    grab: function (canvas, time) {
      var node = this.video;
      if (!node || this.dead) return;
      if (this.busy) { this.want = time; return; }
      this.busy = true;
      var self = this;
      var done = false;

      function paint() {
        if (done) return;
        done = true;
        node.removeEventListener('seeked', paint);
        try {
          canvas.getContext('2d').drawImage(node, 0, 0, canvas.width, canvas.height);
          diag.frames += 1;
          var box = canvas.parentNode;
          if (box) box.classList.add('on');
        } catch (e) {
          diag.error = 'draw:' + (e && e.name ? e.name : 'fail');
        }
        self.busy = false;
        if (self.want != null) {
          var next = self.want;
          self.want = null;
          if (Math.abs(next - node.currentTime) > 0.7) self.grab(canvas, next);
        }
      }

      node.addEventListener('seeked', paint);
      setTimeout(function () {
        if (!done) {
          done = true;
          node.removeEventListener('seeked', paint);
          self.busy = false;
        }
      }, 1500);

      try {
        node.currentTime = Math.max(0.1, time);
      } catch (e) {
        this.busy = false;
        diag.error = 'seek-fail';
      }
    }
  };

  /* ---------------- сборка ---------------- */

  function boot() {
    injectCss();
    hookHls();

    var root = byId('playerRoot');
    var video = byId('player');
    var seek = byId('pSeek');
    if (!root || !video || !seek) return false;
    if (root.getAttribute('data-plus')) return true;
    root.setAttribute('data-plus', '1');

    var track = seek.querySelector('.p-seek-track') || seek;
    var played = byId('pPlayed');
    var buffer = byId('pBuffer');
    var current = byId('pCur');

    var hover = document.createElement('div');
    hover.className = 'ap-hover';
    if (track && track !== seek) track.insertBefore(hover, played || null);

    var tip = document.createElement('div');
    tip.className = 'ap-tip';
    tip.innerHTML = '<div class="ap-shot"><canvas width="' + SHOT_W + '" height="' + SHOT_H + '"></canvas></div>' +
      '<div class="ap-tip-time">0:00</div>';
    root.appendChild(tip);
    var canvas = tip.querySelector('canvas');
    var tipTime = tip.querySelector('.ap-tip-time');

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

    function duration() {
      return isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    }

    /* ---- ровная полоса на каждом кадре (пока не тянем ручку) ---- */
    var dragging = false;

    function frame() {
      var total = duration();
      if (!dragging && played && total) {
        var ratio = Math.min(1, Math.max(0, video.currentTime / total));
        played.style.width = (ratio * 100).toFixed(3) + '%';
        if (buffer && video.buffered && video.buffered.length) {
          var end = video.buffered.end(video.buffered.length - 1);
          buffer.style.width = Math.min(100, (end / total) * 100).toFixed(2) + '%';
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    /* ---- превью ---- */
    var shotTimer = null;

    function ratioAt(clientX) {
      var rect = track.getBoundingClientRect();
      if (!rect.width) return 0;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }

    function showTip(clientX) {
      var total = duration();
      if (!total) return;
      var trackRect = track.getBoundingClientRect();
      var rootRect = root.getBoundingClientRect();
      if (!trackRect.width) return;

      var ratio = ratioAt(clientX);
      var time = ratio * total;
      var half = SHOT_W / 2 + 8;
      var x = Math.min(rootRect.width - half, Math.max(half, clientX - rootRect.left));

      hover.style.width = (ratio * 100).toFixed(2) + '%';
      tip.style.left = x + 'px';
      tip.style.bottom = Math.max(12, rootRect.bottom - trackRect.top + 12) + 'px';
      tip.classList.add('on');
      tipTime.textContent = clock(time);

      clearTimeout(shotTimer);
      shotTimer = setTimeout(function () {
        var node = shots.ensure(video);
        if (node) shots.grab(canvas, time);
      }, 110);
    }

    function hideTip() {
      tip.classList.remove('on');
      hover.style.width = '0%';
    }

    /* ---- настоящее перетаскивание ручки.
           В app.js у полосы только click, поэтому тянуть было нечем.
           preventDefault в pointerdown гасит совместимый click, чтобы не было двойного сека. ---- */
    var lastScrub = 0;
    var resumeAfterDrag = false;

    function seekTo(ratio) {
      var total = duration();
      if (!total) return;
      try { video.currentTime = Math.min(total - 0.05, Math.max(0, ratio * total)); } catch (e) {}
    }

    function paintRatio(ratio) {
      if (played) played.style.width = (ratio * 100).toFixed(3) + '%';
      var total = duration();
      if (current && total) current.textContent = clock(ratio * total);
      seek.setAttribute('aria-valuenow', Math.round(ratio * 100));
    }

    seek.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      if (!duration()) return;
      dragging = true;
      seek.classList.add('ap-drag');
      resumeAfterDrag = !video.paused;
      try { seek.setPointerCapture(event.pointerId); } catch (e) {}
      var ratio = ratioAt(event.clientX);
      paintRatio(ratio);
      seekTo(ratio);
      showTip(event.clientX);
      event.preventDefault();
    });

    seek.addEventListener('pointermove', function (event) {
      if (!dragging) {
        showTip(event.clientX);
        return;
      }
      var ratio = ratioAt(event.clientX);
      paintRatio(ratio);
      showTip(event.clientX);
      /* живой скраб без шторма seek-ов */
      var now = Date.now();
      if (now - lastScrub > 140) {
        lastScrub = now;
        seekTo(ratio);
      }
      event.preventDefault();
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      seek.classList.remove('ap-drag');
      if (event && event.pointerId != null) {
        try { seek.releasePointerCapture(event.pointerId); } catch (e) {}
      }
      if (event && event.clientX != null) seekTo(ratioAt(event.clientX));
      if (resumeAfterDrag) {
        var promise = video.play();
        if (promise && promise.catch) promise.catch(function () {});
      }
      hideTip();
    }

    seek.addEventListener('pointerup', endDrag);
    seek.addEventListener('pointercancel', endDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('blur', function () { endDrag(null); });

    seek.addEventListener('mouseenter', function (event) { showTip(event.clientX); });
    seek.addEventListener('mouseleave', function () { if (!dragging) hideTip(); });

    /* клавиатура на самой полосе */
    seek.setAttribute('tabindex', '0');
    seek.addEventListener('keydown', function (event) {
      var total = duration();
      if (!total) return;
      if (event.key === 'ArrowRight') { seekTo((video.currentTime + 5) / total); event.preventDefault(); }
      if (event.key === 'ArrowLeft') { seekTo((video.currentTime - 5) / total); event.preventDefault(); }
      if (event.key === 'Home') { seekTo(0); event.preventDefault(); }
      if (event.key === 'End') { seekTo(0.999); event.preventDefault(); }
    });

    video.addEventListener('loadstart', function () { shots.reset(); });
    video.addEventListener('emptied', function () { shots.reset(); });

    /* ---- двойной клик по краю = ±10 секунд ---- */
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

    /* ---- громкость колёсиком только с Shift / в полном экране / над панелью ---- */
    root.addEventListener('wheel', function (event) {
      var overControls = event.target && event.target.closest && event.target.closest('.p-controls');
      if (!event.shiftKey && !document.fullscreenElement && !overControls) return;
      if (event.ctrlKey) return;
      event.preventDefault();
      var step = event.deltaY > 0 ? -0.05 : 0.05;
      var next = Math.min(1, Math.max(0, (video.volume || 0) + step));
      video.volume = next;
      if (next > 0) video.muted = false;
      flash('Громкость ' + Math.round(next * 100) + '%');
    }, { passive: false });

    try {
      var savedVolume = parseFloat(localStorage.getItem(LS_VOL));
      if (isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) video.volume = savedVolume;
    } catch (e) {}
    video.addEventListener('volumechange', function () {
      try { localStorage.setItem(LS_VOL, String(video.volume)); } catch (e) {}
    });

    /* ---- курсор уходит вместе с панелью ---- */
    var cursorTimer = null;
    root.addEventListener('mousemove', function () {
      root.classList.remove('ap-hidecursor');
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(function () {
        if (!video.paused && !dragging) root.classList.add('ap-hidecursor');
      }, 2200);
    });
    video.addEventListener('pause', function () { root.classList.remove('ap-hidecursor'); });

    /* ---- мини-плеер ---- */
    var slot = document.createElement('div');
    slot.className = 'ap-slot';
    if (root.parentNode) root.parentNode.insertBefore(slot, root);

    var miniAllowed = true;
    var miniLock = false;

    function setMini(on) {
      if (miniLock) return;
      if (on === root.classList.contains('ap-mini')) return;
      miniLock = true;
      if (on) {
        slot.style.height = Math.round(root.getBoundingClientRect().height) + 'px';
        slot.classList.add('on');
        root.classList.add('ap-mini');
      } else {
        root.classList.remove('ap-mini');
        slot.classList.remove('on');
        slot.style.height = '';
      }
      setTimeout(function () { miniLock = false; }, 260);
    }

    var anchor = document.createElement('div');
    anchor.style.cssText = 'width:100%;height:1px';
    if (root.parentNode) root.parentNode.insertBefore(anchor, root);

    if (window.IntersectionObserver) {
      var watcher = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var playing = !video.paused && !video.ended && video.currentTime > 0;
          var titleOpen = !!document.querySelector('#view-title:not([hidden])');
          if (!titleOpen) { setMini(false); return; }
          if (!entry.isIntersecting && playing && miniAllowed && !document.fullscreenElement) setMini(true);
          if (entry.isIntersecting) setMini(false);
        });
      }, { rootMargin: '-90px 0px 0px 0px' });
      watcher.observe(anchor);
    }

    miniClose.addEventListener('click', function (event) {
      event.stopPropagation();
      miniAllowed = false;
      setMini(false);
      video.pause();
      setTimeout(function () { miniAllowed = true; }, 1500);
    });

    root.addEventListener('click', function (event) {
      if (!root.classList.contains('ap-mini')) return;
      if (event.target && event.target.closest && event.target.closest('.p-controls, .ap-mini-x')) return;
      setMini(false);
      setTimeout(function () { anchor.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30);
    });

    video.addEventListener('pause', function () { setMini(false); });
    window.addEventListener('hashchange', function () {
      setMini(false);
      shots.reset();
    });

    /* ---- клавиши в стиле YouTube ---- */
    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      var node = event.target;
      if (node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable)) return;
      if (node === seek) return;
      var total = duration();
      if (!total) return;
      var rect = root.getBoundingClientRect();
      var visible = document.fullscreenElement || root.classList.contains('ap-mini') ||
        (rect.top < window.innerHeight && rect.bottom > 0 && rect.height > 0);
      if (!visible) return;
      var key = event.key.toLowerCase();

      if (key === 'j') {
        video.currentTime = Math.max(0, video.currentTime - 10);
        bump(jumpLeft);
      } else if (key === 'l') {
        video.currentTime = Math.min(total, video.currentTime + 10);
        bump(jumpRight);
      } else if (/^[0-9]$/.test(event.key)) {
        video.currentTime = total * (Number(event.key) / 10);
        flash(clock(video.currentTime));
      } else {
        return;
      }
      event.preventDefault();
    });

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
    diag: function () { return diag; },
    source: function () { return lastSource; },
    reset: function () { shots.reset(); }
  };
})();
