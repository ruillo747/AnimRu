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
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
for (const id of duplicateIds) problems.push(`index.html содержит повторяющийся id: ${id}`);

try {
  JSON.parse(read('manifest.webmanifest'));
} catch (error) {
  problems.push(`manifest.webmanifest: некорректный JSON (${error.message})`);
}

const css = read('style.css');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open !== close) problems.push(`style.css: не совпадает число скобок (${open} против ${close})`);

for (const file of readdirSync('.').filter((name) => name.endsWith('.js'))) {
  const code = read(file);
  if (/console\.log\(/.test(code)) problems.push(`${file}: остался console.log`);
  if (/\bTODO\b|\bFIXME\b/.test(code)) problems.push(`${file}: остался TODO/FIXME`);
}

/* Все локальные JS-модули, подключаемые динамически, должны существовать и
   входить в офлайн-оболочку. */
const loaderCode = read('extras.js') + '\n' + read('config.js');
const dynamicFiles = [...new Set(
  [...loaderCode.matchAll(/['"]([^'"]+\.js)['"]/g)].map((match) => match[1]),
)];
const worker = read('sw.js');
const shellBlock = worker.match(/const SHELL = \[([\s\S]*?)\]/);
const shellFiles = shellBlock
  ? [...shellBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => localPath(match[1]))
  : [];
for (const file of dynamicFiles) {
  if (!existsSync(file)) problems.push(`Загрузчик подключает отсутствующий файл: ${file}`);
  if (!shellFiles.includes(file)) problems.push(`sw.js не кэширует динамический модуль: ${file}`);
}

if (problems.length) {
  console.error('Найдены проблемы:');
  for (const line of problems) console.error(' — ' + line);
  process.exit(1);
}

console.error('Проверка пройдена: ссылки, ID, manifest, стили, скрипты и офлайн-оболочка в порядке.');
