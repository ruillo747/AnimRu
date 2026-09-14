/* Настройки сайта. Publishable/anon key можно использовать в клиенте: доступ ограничивает RLS. */
window.ANIMRU_CONFIG = {
  supabaseUrl: 'https://ompdnsozzsdnxktcmawe.supabase.co',
  supabaseAnonKey: 'sb_publishable_8xTHJnTYpoeYtVZiDLcKDA_9KqDVqfL'
};

/* Критичные модули и мобильная тема подключаются рано. Сравниваем точное имя
   файла, чтобы unified-catalog.js не принимался за catalog.js. */
(function () {
  var VERSION = '35';

  function fileName(url) {
    try { var path = new URL(url, location.href).pathname; return path.slice(path.lastIndexOf('/') + 1); }
    catch (e) { return ''; }
  }
  function hasScript(file) {
    return Array.prototype.some.call(document.scripts || [], function (node) { return fileName(node.src) === file; });
  }
  function hasStyle(file) {
    return Array.prototype.some.call(document.querySelectorAll('link[rel="stylesheet"]'), function (node) { return fileName(node.href) === file; });
  }

  if (!hasStyle('mobile-app.css')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'mobile-app.css?v=' + VERSION;
    (document.head || document.documentElement).appendChild(link);
  }

  ['kodik-net.js', 'mobile-nav.js', 'catalog.js', 'unified-catalog.js'].forEach(function (file) {
    if (hasScript(file)) return;
    var script = document.createElement('script');
    script.src = file + '?v=' + VERSION;
    script.defer = true;
    (document.head || document.documentElement).appendChild(script);
  });
})();
