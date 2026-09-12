# AnimRu — Android

Оболочка сайта на системном ядре WebView (Chromium) с блокировщиком на фильтрах AdGuard.

## Что умеет

- Полноэкранный WebView: JS, DOM Storage (все данные сайта сохраняются), автовоспроизведение видео без жеста.
- Кнопка «Назад» идёт по истории сайта, свайп сверху обновляет страницу, состояние живёт при повороте экрана.
- Блокировщик рекламы в синтаксисе AdGuard / EasyList.

## Как работает блокировка

Android WebView не имеет декларативного Content Blocker API, как Safari, поэтому фильтры применяются самим приложением:

1. `AdBlocker` разбирает правила и переводит шаблоны (`||domain^`, `*`, `|`, `/regex/`) в регулярные выражения.
2. Каждый запрос страницы проходит через `shouldInterceptRequest`: совпадение → пустой ответ.
3. Косметические правила (`##selector`, `domain##selector`) собираются в CSS и вставляются в страницу.
4. Исключения (`@@`) и белый список доменов (`anilibria.top`, `kodikplayer.com`, `kodik-api.com` и т.д.) никогда не блокируются, иначе сломается воспроизведение.

Списки:

- `app/src/main/assets/filters/*.txt` — базовый набор, работает без сети сразу после установки.
- При запуске догружаются официальные фильтры AdGuard (Base, Russian, Mobile Ads) с `filters.adtidy.org` и кэшируются на сутки.

## Сборка

```bash
cd android
gradle assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

Готовый APK также собирает GitHub Actions: вкладка **Actions → Android APK → Artifacts**.

## Ссылка на сайт

Адрес задан в `MainActivity.SITE`. Если сайт переедет на другой домен, поменяй там одну строку.
