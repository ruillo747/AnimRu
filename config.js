/* Настройки сайта. Чтобы аккаунты работали на всех устройствах,
   создайте бесплатный проект Supabase, выполните supabase/schema.sql
   и вставьте здесь Project URL и anon public key.
   Publishable/anon key можно использовать в клиенте: доступ ограничивает RLS. */
window.ANIMRU_CONFIG = {
  supabaseUrl: 'https://ompdnsozzsdnxktcmawe.supabase.co',
  supabaseAnonKey: 'sb_publishable_8xTHJnTYpoeYtVZiDLcKDA_9KqDVqfL'
};

/* Критичные модули каталога подключаются рано и с общей версией. catalog.js
   добавлен сюда специально: старый extras.js больше не сможет оставить в
   браузере предыдущую версию каталога Kodik. */
(function () {
  ['kodik-net.js', 'mobile-nav.js', 'unified-catalog.js', 'catalog.js'].forEach(function (file) {
    if (document.querySelector('script[src*="' + file + '"]')) return;
    var script = document.createElement('script');
    script.src = file + '?v=33';
    script.defer = true;
    (document.head || document.documentElement).appendChild(script);
  });
})();
