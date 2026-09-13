/* Настройки сайта. Чтобы аккаунты работали на всех устройствах,
   создайте бесплатный проект Supabase, выполните supabase/schema.sql
   и вставьте здесь Project URL и anon public key.
   Publishable/anon key можно использовать в клиенте: доступ ограничивает RLS. */
window.ANIMRU_CONFIG = {
  supabaseUrl: 'https://ompdnsozzsdnxktcmawe.supabase.co',
  supabaseAnonKey: 'sb_publishable_8xTHJnTYpoeYtVZiDLcKDA_9KqDVqfL'
};

/* Ранние модули подключаем до основной логики: транспорт Kodik нужен сетевым
   запросам, а мобильная навигация должна появиться без скачка старой шапки. */
(function () {
  ['kodik-net.js', 'mobile-nav.js'].forEach(function (file) {
    if (document.querySelector('script[src*="' + file + '"]')) return;
    var script = document.createElement('script');
    script.src = file + '?v=27';
    script.defer = true;
    (document.head || document.documentElement).appendChild(script);
  });
})();
