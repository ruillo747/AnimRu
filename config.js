/* Настройки сайта. Чтобы аккаунты работали на всех устройствах,
   создайте бесплатный проект Supabase, выполните supabase/schema.sql
   и вставьте здесь Project URL и anon public key.
   Пока поля пустые, аккаунты хранятся в локальной базе браузера. */
window.ANIMRU_CONFIG = {
  supabaseUrl: 'https://ompdnsozzsdnxktcmawe.supabase.co',
  supabaseAnonKey: 'sb_publishable_8xTHJnTYpoeYtVZiDLcKDA_9KqDVqfL'
};

/* Транспорт для API Kodik подключаем раньше остальных модулей,
   чтобы каталог и поиск сразу шли через рабочий канал. */
(function () {
  if (document.querySelector('script[src*="kodik-net.js"]')) return;
  var script = document.createElement('script');
  script.src = 'kodik-net.js?v=16';
  script.defer = true;
  (document.head || document.documentElement).appendChild(script);
})();
