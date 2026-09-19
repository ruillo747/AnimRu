/* Публичные настройки клиента. Publishable key безопасен только вместе с RLS. */
window.ANIMRU_CONFIG = {
  supabaseUrl: 'https://ompdnsozzsdnxktcmawe.supabase.co',
  supabaseAnonKey: 'sb_publishable_8xTHJnTYpoeYtVZiDLcKDA_9KqDVqfL'
};

/* Критичные модули подключаются рано и с одной версией кэша. */
(function () {
  var VERSION = '35';
  var files = ['kodik-net.js', 'mobile-nav.js', 'catalog.js', 'unified-catalog.js', 'quality.js'];

  function hasExactScript(file) {
    return Array.prototype.some.call(document.scripts || [], function (script) {
      try {
        var path = new URL(script.src, location.href).pathname;
        return path.slice(path.lastIndexOf('/') + 1) === file;
      } catch (e) { return false; }
    });
  }

  files.forEach(function (file) {
    if (hasExactScript(file)) return;
    var script = document.createElement('script');
    script.src = file + '?v=' + VERSION;
    script.defer = true;
    (document.head || document.documentElement).appendChild(script);
  });
})();
