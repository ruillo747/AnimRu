/* Копия файла с настройками.
   Скопируйте в config.js и вставьте значения из проекта Supabase
   (Project Settings → API): Project URL и anon public key.

   Без config.js сайт работает на локальной базе браузера (IndexedDB):
   регистрация и вход работают, но аккаунт виден только в этом браузере.
   anon-ключ публичный, его можно держать в репозитории — доступ ограничивает RLS
   из supabase/schema.sql. Service role key в клиент класть нельзя.

   kodikToken — ключ студии Kodik из личного кабинета kodik.
   Без него переключатель студий остаётся, но работает только Anilibria. */
window.ANIMRU_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  kodikToken: ''
};
