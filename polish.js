/* AnimRu — доводка интерфейса по правилам дизайн-скиллов:
   единые кривые и длительности движения, наведение только для мыши,
   отклик на нажатие, читаемый серый текст, один радиус, чистый текст без ИИ-штампов. */
(function () {
  'use strict';

  var STYLE_ID = 'polish-css';

  /* ---------------- токены движения и цвета ---------------- */

  var CSS = [
    ':root{',
    '--ease-out:cubic-bezier(0.23,1,0.32,1);',
    '--ease-in-out:cubic-bezier(0.77,0,0.175,1);',
    '--t-fast:120ms;',
    '--t:180ms;',
    '--t-slow:260ms;',
    /* один радиус на весь интерфейс */
    '--r-sm:10px;--r:10px;--r-lg:10px;',
    /* серый текст ниже порога читаемости — поднимаем контраст */
    '--dim:#8f8f99;',
    '}',
    "html[data-theme='light']{--dim:#66666f;--bg:#fbfbfc;--surface:#ffffff}",

    'body{min-height:100dvh}',

    /* ---------------- отклик на действие ---------------- */
    '.btn,.btn-ghost,.icon-btn,.acc-btn,.f-chip,.src-btn,.ep-btn,.rate-dot,.reward,.nav-link,.card,.rail-card,.top-row,.kb-btn{',
    'transition:border-color var(--t) var(--ease-out),background-color var(--t) var(--ease-out),color var(--t) var(--ease-out),transform var(--t-fast) var(--ease-out);',
    '-webkit-tap-highlight-color:transparent;touch-action:manipulation;',
    '}',
    '.btn:active,.btn-ghost:active,.icon-btn:active,.acc-btn:active,.f-chip:active,.src-btn:active,.ep-btn:active,.rate-dot:active,.reward:active:not(:disabled),.kb-btn:active{transform:scale(.97)}',
    '.card:active,.rail-card:active,.top-row:active{transform:scale(.99)}',

    /* ---------------- наведение только там, где есть курсор ---------------- */
    '@media (hover:hover) and (pointer:fine){',
    '.card:hover,.rail-card:hover{transform:translateY(-2px)}',
    '.card:hover .card-poster img,.rail-card:hover>img{transform:scale(1.03)}',
    '.card-poster img,.rail-card>img{transition:transform var(--t-slow) var(--ease-out)}',
    '}',
    '@media (hover:none){',
    '.card:hover,.rail-card:hover,.top-row:hover,.nav-link:hover,.f-chip:hover,.src-btn:hover,.ep-btn:hover,.rate-dot:hover,.sug-item:hover,.icon-btn:hover,.acc-btn:hover,.lvl-chip:hover{background-color:initial;border-color:var(--line);color:inherit;transform:none}',
    '.nav-link.active{background:var(--accent-soft);color:var(--accent)}',
    '.f-chip.active,.src-btn.active,.rate-dot.on{border-color:var(--accent);background:var(--accent);color:var(--accent-ink)}',
    '.ep-btn.active{border-color:var(--accent);background:var(--accent-soft)}',
    '}',

    /* ---------------- появление контента: короткое, со сдвигом по очереди ---------------- */
    '@keyframes animru-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '.grid>*,.rail>*,.top-list>li,.kb-grid>*{animation:animru-in var(--t-slow) var(--ease-out) both}',
    '.grid>*:nth-child(1),.rail>*:nth-child(1),.top-list>li:nth-child(1),.kb-grid>*:nth-child(1){animation-delay:0ms}',
    '.grid>*:nth-child(2),.rail>*:nth-child(2),.top-list>li:nth-child(2),.kb-grid>*:nth-child(2){animation-delay:30ms}',
    '.grid>*:nth-child(3),.rail>*:nth-child(3),.top-list>li:nth-child(3),.kb-grid>*:nth-child(3){animation-delay:60ms}',
    '.grid>*:nth-child(4),.rail>*:nth-child(4),.top-list>li:nth-child(4),.kb-grid>*:nth-child(4){animation-delay:90ms}',
    '.grid>*:nth-child(5),.rail>*:nth-child(5),.top-list>li:nth-child(5),.kb-grid>*:nth-child(5){animation-delay:120ms}',
    '.grid>*:nth-child(n+6),.rail>*:nth-child(n+6),.top-list>li:nth-child(n+6),.kb-grid>*:nth-child(n+6){animation-delay:150ms}',

    /* ---------------- плеер: движение от точки нажатия ---------------- */
    '.p-bigplay{transition:opacity var(--t) var(--ease-out),transform var(--t) var(--ease-out),filter var(--t-fast) linear}',
    '.p-controls{transition:opacity var(--t) var(--ease-out)}',
    '.p-menu{transform-origin:bottom right;animation:animru-menu 160ms var(--ease-out) both}',
    '@keyframes animru-menu{from{opacity:0;transform:scale(.96) translateY(4px)}to{opacity:1;transform:none}}',
    '.p-btn{transition:background-color var(--t-fast) var(--ease-out),color var(--t-fast) var(--ease-out)}',

    /* ---------------- вспомогательные слои ---------------- */
    '.suggest,.modal-card{animation:animru-pop 180ms var(--ease-out) both}',
    '@keyframes animru-pop{from{opacity:0;transform:scale(.98) translateY(-4px)}to{opacity:1;transform:none}}',
    '.modal-backdrop{animation:animru-fade 180ms linear both}',
    '.toast{animation:animru-toast 220ms var(--ease-out) both}',
    '@keyframes animru-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes animru-toast{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%)}}',

    /* ---------------- плавные полосы прогресса ---------------- */
    '.progress-line i,.lvl-bar i{transition:width var(--t-slow) var(--ease-out)}',

    /* ---------------- скелетон вместо мигания ---------------- */
    '.skeleton{animation:animru-skeleton 1.4s var(--ease-in-out) infinite}',
    '@keyframes animru-skeleton{0%,100%{opacity:1}50%{opacity:.6}}',

    /* ---------------- типографика: спокойный ритм ---------------- */
    '.desc,.cm-body{line-height:1.6}',
    '.card-title,.rail-title,.top-name{letter-spacing:-.01em}',

    /* ---------------- уважение к настройке «меньше движения» ---------------- */
    '@media (prefers-reduced-motion: reduce){',
    '.grid>*,.rail>*,.top-list>li,.kb-grid>*,.suggest,.modal-card,.modal-backdrop,.toast,.p-menu{animation:none}',
    '.card:hover,.rail-card:hover{transform:none}',
    '.card:hover .card-poster img,.rail-card:hover>img{transform:none}',
    '}'
  ].join('');

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ---------------- чистка текста от ИИ-штампов ---------------- */

  var PHRASES = [
    [/\bпогрузитесь в мир\b/gi, 'смотрите'],
    [/\bоткройте для себя\b/gi, 'смотрите'],
    [/\bв современном мире\b/gi, ''],
    [/\bбесшовн(ый|ая|ое|ые)\b/gi, 'простой'],
    [/\bреволюционн(ый|ая|ое|ые)\b/gi, ''],
    [/\s*(🚀|✨|🔥)\s*/g, ' '],
    [/\s+—\s*$/g, ''],
    [/[ \t]{2,}/g, ' ']
  ];

  var TEXT_HOSTS = ['tDesc', 'kbStatus', 'listStatus', 'topStatus'];

  function cleanText(value) {
    var next = value;
    PHRASES.forEach(function (pair) {
      next = next.replace(pair[0], pair[1]);
    });
    return next.replace(/\n{3,}/g, '\n\n').trim();
  }

  function cleanNode(node) {
    if (!node) return;
    var raw = node.textContent || '';
    if (!raw) return;
    var next = cleanText(raw);
    if (next && next !== raw) node.textContent = next;
  }

  function textPass() {
    TEXT_HOSTS.forEach(function (id) {
      cleanNode(document.getElementById(id));
    });
  }

  /* ---------------- доступность мелочей ---------------- */

  function labelIconButtons() {
    var map = {
      menuBtn: 'Меню',
      themeBtn: 'Сменить тему',
      accountBtn: 'Аккаунт',
      pPlay: 'Воспроизведение и пауза',
      pFull: 'На весь экран',
      pVol: 'Громкость',
      pSubs: 'Субтитры'
    };
    Object.keys(map).forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', map[id]);
    });
  }

  function start() {
    injectCss();
    labelIconButtons();
    textPass();

    var timer = null;
    var observer = new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        labelIconButtons();
        textPass();
      }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
