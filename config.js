/* Настройки сайта. Чтобы аккаунты работали на всех устройствах,
   создайте бесплатный проект Supabase, выполните supabase/schema.sql
   и вставьте здесь Project URL и anon public key.
   Publishable/anon key можно использовать в клиенте: доступ ограничивает RLS. */
window.ANIMRU_CONFIG = {
  supabaseUrl: 'https://ompdnsozzsdnxktcmawe.supabase.co',
  supabaseAnonKey: 'sb_publishable_8xTHJnTYpoeYtVZiDLcKDA_9KqDVqfL'
};

/* Критичные модули каталога подключаются рано и с общей версией. Проверяем
   точное имя файла: selector src*="catalog.js" ошибочно считал
   unified-catalog.js самим catalog.js и пропускал новый каталог Kodik. */
(function () {
  var VERSION = '34';
  var files = ['kodik-net.js', 'mobile-nav.js', 'catalog.js', 'unified-catalog.js'];

  function hasExactScript(file) {
    return Array.prototype.some.call(document.scripts || [], function (script) {
      try {
        var path = new URL(script.src, location.href).pathname;
        return path.slice(path.lastIndexOf('/') + 1) === file;
      } catch (e) {
        return false;
      }
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
