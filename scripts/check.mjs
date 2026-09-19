/* Проверки проекта без внешних зависимостей. */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const problems = [];
const read = (file) => readFileSync(file, 'utf8');
const localPath = (ref) => ref.split('?')[0].replace(/^\.\//, '');
const html = read('index.html');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
for (const ref of refs) {
  if (/^(https?:|data:|#|mailto:)/.test(ref)) continue;
  const file = localPath(ref);
  if (!existsSync(file)) problems.push(`index.html ссылается на отсутствующий файл: ${file}`);
}
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
for (const id of new Set(ids.filter((value, index) => ids.indexOf(value) !== index))) problems.push(`Повторяющийся id: ${id}`);
try { JSON.parse(read('manifest.webmanifest')); } catch (error) { problems.push(`manifest.webmanifest: ${error.message}`); }
const css = read('style.css');
if ((css.match(/{/g) || []).length !== (css.match(/}/g) || []).length) problems.push('style.css: не совпадает число скобок');
for (const file of readdirSync('.').filter((name) => name.endsWith('.js'))) {
  const code = read(file);
  if (/console\.log\(/.test(code)) problems.push(`${file}: остался console.log`);
  if (/\bTODO\b|\bFIXME\b/.test(code)) problems.push(`${file}: остался TODO/FIXME`);
}
const extras = read('extras.js');
const dynamicBlock = extras.match(/\[([^\]]+)\]\.forEach\(function \(file\)/s);
const dynamicFiles = dynamicBlock ? [...dynamicBlock[1].matchAll(/['"]([^'"]+\.js)['"]/g)].map((match) => match[1]) : [];
if (!dynamicFiles.length) problems.push('extras.js: не удалось определить динамические модули');
const worker = read('sw.js');
const shellBlock = worker.match(/const SHELL = \[([\s\S]*?)\]/);
const shellFiles = shellBlock ? [...shellBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => localPath(match[1])) : [];
for (const file of dynamicFiles) {
  if (!existsSync(file)) problems.push(`Отсутствует динамический модуль: ${file}`);
  if (!shellFiles.includes(file)) problems.push(`Service worker не кэширует: ${file}`);
}
for (const required of ['quality.js', 'catalog.js', 'kodik-net.js']) {
  if (!shellFiles.includes(required)) problems.push(`Service worker не кэширует критичный модуль: ${required}`);
}
const configVersion = read('config.js').match(/var VERSION = ['"](\d+)['"]/);
const cacheVersion = worker.match(/const CACHE = ['"]animru-v(\d+)['"]/);
if (!configVersion || !cacheVersion || configVersion[1] !== cacheVersion[1]) problems.push('Версии config.js и sw.js расходятся');
if (/setInterval\([\s\S]{0,200},\s*150\)/.test(read('kodik-net.js'))) problems.push('kodik-net.js содержит частый постоянный таймер');
const manifest = read('android/app/src/main/AndroidManifest.xml');
if (!/android:allowBackup="false"/.test(manifest)) problems.push('Android backup должен быть отключён');
const activity = read('android/app/src/main/java/ru/animru/app/MainActivity.kt');
if (!/allowFileAccess = false/.test(activity) || !/MIXED_CONTENT_NEVER_ALLOW/.test(activity)) problems.push('Небезопасные настройки Android WebView');
if (problems.length) {
  console.error('Найдены проблемы:');
  for (const line of problems) console.error(' - ' + line);
  process.exit(1);
}
console.error('Проверка пройдена: ссылки, кэш, версии, WebView и критичные модули в порядке.');
