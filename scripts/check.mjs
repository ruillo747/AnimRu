/* Простая проверка проекта без внешних зависимостей:
   — все локальные файлы из index.html существуют;
   — баланс фигурных скобок в CSS;
   — нет забытых console.log и TODO в продакшен-коде. */
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const problems = [];

const html = readFileSync('index.html', 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);

for (const ref of refs) {
  if (/^(https?:|data:|#|mailto:)/.test(ref)) continue;
  const file = ref.split('?')[0];
  if (!existsSync(file)) problems.push(`index.html ссылается на отсутствующий файл: ${file}`);
}

const css = readFileSync('style.css', 'utf8');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open !== close) problems.push(`style.css: не совпадает число скобок (${open} вс. ${close})`);

for (const file of readdirSync('.').filter((name) => name.endsWith('.js'))) {
  const code = readFileSync(file, 'utf8');
  if (/console\.log\(/.test(code)) problems.push(`${file}: остался console.log`);
  if (/\bTODO\b|\bFIXME\b/.test(code)) problems.push(`${file}: остался TODO/FIXME`);
}

if (problems.length) {
  console.error('Найдены проблемы:');
  for (const line of problems) console.error(' — ' + line);
  process.exit(1);
}

console.error('Проверка пройдена: разметка, стили и скрипты в порядке.');
