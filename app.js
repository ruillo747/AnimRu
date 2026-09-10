/* AnimRu — SPA over Anilibria API v1 (anilibria.top)
   Views: updates / popular / random / catalog (filters) / search / title + player */

const API = 'https://anilibria.top/api/v1';
const MEDIA_HOST = 'https://anilibria.top';
const PAGE_SIZE = 30;
const LS_WATCH = 'animru:watch';
const LS_PREFS = 'animru:prefs';

const emptyFilters = () => ({
  q: '',
  genres: [],
  types: [],
  ageRatings: [],
  yearFrom: '',
  yearTo: '',
  sorting: 'FRESH_AT_DESC',
});

const state = {
  tab: 'updates',
  page: 1,
  hasMore: false,
  filters: emptyFilters(),
  title: null,
  episodes: [],
  epIndex: 0,
  quality: null,
  hls: null,
  suggestTimer: null,
  saveTimer: null,
  hideUiTimer: null,
  toastTimer: null,
};

const prefs = Object.assign(
  { volume: 1, muted: false, rate: 1, quality: 'hls_720', autoNext: true },
  readJson(LS_PREFS, {})
);

const $ = (id) => document.getElementById(id);

/* ---------------- storage ---------------- */
function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage may be unavailable */
  }
}

function savePrefs() {
  writeJson(LS_PREFS, prefs);
}

function getWatch() {
  return readJson(LS_WATCH, {});
}

function saveWatch(entry) {
  const all = getWatch();
  all[entry.id] = Object.assign({}, all[entry.id], entry, { updated: Date.now() });
  const keys = Object.keys(all).sort((a, b) => all[b].updated - all[a].updated).slice(0, 24);
  const trimmed = {};
  keys.forEach((k) => (trimmed[k] = all[k]));
  writeJson(LS_WATCH, trimmed);
}

/* ---------------- api ---------------- */
async function apiFetch(path, params = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((item, i) => url.searchParams.set(`${k}[${i}]`, item));
    else url.searchParams.set(k, v);
  });
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const refs = { genres: null, years: null, types: null, ageRatings: null };

async function loadRefs() {
  if (refs.genres) return refs;
  const safe = (p) => apiFetch(p).catch(() => []);
  const [genres, years, types, ageRatings] = await Promise.all([
    safe('/anime/catalog/references/genres'),
    safe('/anime/catalog/references/years'),
    safe('/anime/catalog/references/types'),
    safe('/anime/catalog/references/age-ratings'),
  ]);
  refs.genres = genres || [];
  refs.years = years || [];
  refs.types = types || [];
  refs.ageRatings = ageRatings || [];
  return refs;
}

function normalizeList(resp, page = 1) {
  if (Array.isArray(resp)) return { list: resp, pages: 1, current: 1 };
  const list = resp.data || [];
  const meta = resp.meta || {};
  const pag = meta.pagination || meta || {};
  return {
    list,
    pages: pag.total_pages || pag.last_page || 1,
    current: pag.current_page || page,
  };
}

const getUpdates = (page) =>
  apiFetch('/anime/releases/latest', { limit: PAGE_SIZE, page }).then((r) => normalizeList(r, page));

const getPopular = (page) =>
  apiFetch('/anime/catalog/releases', { 'f[sorting]': 'RATING_DESC', limit: PAGE_SIZE, page }).then((r) =>
    normalizeList(r, page)
  );

async function getRandom() {
  try {
    return normalizeList(await apiFetch('/anime/releases/random', { limit: 18 }));
  } catch (e) {
    const r = await apiFetch('/anime/releases/latest', { limit: 30 });
    const arr = Array.isArray(r) ? r : r.data || [];
    return { list: arr.slice().sort(() => Math.random() - 0.5).slice(0, 18), pages: 1, current: 1 };
  }
}

function getCatalog(page, f) {
  const params = { limit: PAGE_SIZE, page, 'f[sorting]': f.sorting || 'FRESH_AT_DESC' };
  if (f.q) params['f[search]'] = f.q;
  if (f.genres.length) params['f[genres]'] = f.genres;
  if (f.types.length) params['f[types]'] = f.types;
  if (f.ageRatings.length) params['f[age_ratings]'] = f.ageRatings;
  if (f.yearFrom) params['f[years][from_year]'] = f.yearFrom;
  if (f.yearTo) params['f[years][to_year]'] = f.yearTo;
  return apiFetch('/anime/catalog/releases', params).then((r) => normalizeList(r, page));
}

const getTitle = (id) => apiFetch('/anime/releases/' + encodeURIComponent(id));

/* ---------------- helpers ---------------- */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function placeholderPoster() {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect fill="#1c2027" width="200" height="300"/><text x="100" y="152" font-family="sans-serif" font-size="13" fill="#6f7885" text-anchor="middle">Нет постера</text></svg>'
    )
  );
}

function posterUrl(t) {
  const p = t.poster || {};
  const o = p.optimized || {};
  const src = o.src || p.src || o.preview || p.preview || o.thumbnail || p.thumbnail;
  if (!src) return placeholderPoster();
  return src.startsWith('http') ? src : MEDIA_HOST + src;
}

const displayName = (t) => (t.name && (t.name.main || t.name.english)) || 'Без названия';
const displayEn = (t) => (t.name && t.name.english) || '';
const typeName = (t) => (t.type && (t.type.description || t.type.value)) || '';
const yearOf = (t) => t.year || '';

function statusName(t) {
  if (t.is_in_production) return 'В производстве';
  if (t.is_ongoing) return 'Онгоинг';
  return 'Завершён';
}

function seasonInfo(t) {
  const s = (t.season && t.season.description) || '';
  return [s, yearOf(t)].filter(Boolean).join(' ');
}

function genreNames(t) {
  return (t.genres || []).map((g) => (typeof g === 'string' ? g : g.name || '')).filter(Boolean);
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* ---------------- list rendering ---------------- */
function renderSkeleton() {
  const grid = $('grid');
  grid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML =
      '<div class="card-poster skeleton"></div><div class="card-body"><div class="skeleton" style="height:13px;margin-bottom:6px"></div><div class="skeleton" style="height:11px;width:55%"></div></div>';
    grid.appendChild(d);
  }
}

function renderGrid(items, append) {
  const grid = $('grid');
  if (!append) grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  items.forEach((t) => {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = '#/title/' + t.id;
    const sub = [typeName(t), yearOf(t)].filter(Boolean).join(' · ');
    a.innerHTML = `
      <div class="card-poster">
        <img loading="lazy" alt="" src="${posterUrl(t)}" onerror="this.src='${placeholderPoster()}'">
        <span class="card-badge">${escapeHtml(statusName(t))}</span>
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(displayName(t))}</div>
        <div class="card-sub"><span>${escapeHtml(sub)}</span></div>
      </div>`;
    frag.appendChild(a);
  });
  grid.appendChild(frag);
}

function renderContinue() {
  const block = $('continueBlock');
  const rail = $('continueRail');
  const items = Object.values(getWatch()).sort((a, b) => b.updated - a.updated);
  if (!items.length) {
    block.hidden = true;
    return;
  }
  block.hidden = false;
  rail.innerHTML = items
    .map((w) => {
      const pct = w.duration ? Math.min(100, Math.round((w.time / w.duration) * 100)) : 0;
      return `
      <a class="rail-card" href="#/title/${encodeURIComponent(w.id)}">
        <img loading="lazy" alt="" src="${escapeHtml(w.poster || placeholderPoster())}">
        <div class="rail-body">
          <div class="rail-title">${escapeHtml(w.name || '')}</div>
          <div class="rail-sub">Серия ${escapeHtml(String(w.epNum || 1))} · ${fmtTime(w.time || 0)}</div>
          <div class="progress-line"><i style="width:${pct}%"></i></div>
        </div>
      </a>`;
    })
    .join('');
}

/* ---------------- filters UI ---------------- */
function filtersActive(f) {
  return !!(f.q || f.genres.length || f.types.length || f.ageRatings.length || f.yearFrom || f.yearTo || f.sorting !== 'FRESH_AT_DESC');
}

async function renderFilters() {
  const box = $('filterBar');
  box.hidden = false;
  document.querySelector('.catalog-layout').classList.remove('no-filters');
  await loadRefs();
  const f = state.filters;

  const sortings = [
    ['FRESH_AT_DESC', 'Свежие обновления'],
    ['RATING_DESC', 'По рейтингу'],
    ['YEAR_DESC', 'Сначала новые'],
    ['YEAR_ASC', 'Сначала старые'],
  ];
  const years = (refs.years || []).slice().sort((a, b) => b - a);
  const yearOpts = (sel) =>
    ['<option value="">—</option>']
      .concat(years.map((y) => `<option value="${y}"${String(sel) === String(y) ? ' selected' : ''}>${y}</option>`))
      .join('');

  box.innerHTML = `
    <div class="f-group">
      <label class="f-label" for="fSort">Сортировка</label>
      <select class="f-select" id="fSort">
        ${sortings.map(([v, l]) => `<option value="${v}"${v === f.sorting ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="f-group">
      <span class="f-label">Год выхода</span>
      <div class="f-years">
        <select class="f-select" id="fYearFrom">${yearOpts(f.yearFrom)}</select>
        <span class="muted">—</span>
        <select class="f-select" id="fYearTo">${yearOpts(f.yearTo)}</select>
      </div>
    </div>
    <div class="f-group">
      <span class="f-label">Тип</span>
      <div class="f-chips" id="fTypes">
        ${(refs.types || [])
          .map(
            (t) =>
              `<button type="button" class="f-chip${f.types.includes(t.value) ? ' active' : ''}" data-val="${escapeHtml(
                t.value
              )}">${escapeHtml(t.description || t.value)}</button>`
          )
          .join('')}
      </div>
    </div>
    <div class="f-group">
      <span class="f-label">Возрастной рейтинг</span>
      <div class="f-chips" id="fAge">
        ${(refs.ageRatings || [])
          .map(
            (a) =>
              `<button type="button" class="f-chip${f.ageRatings.includes(a.value) ? ' active' : ''}" data-val="${escapeHtml(
                a.value
              )}">${escapeHtml(a.label || a.value)}</button>`
          )
          .join('')}
      </div>
    </div>
    <div class="f-group">
      <span class="f-label">Жанры</span>
      <div class="f-chips f-scroll" id="fGenres">
        ${(refs.genres || [])
          .map(
            (g) =>
              `<button type="button" class="f-chip${f.genres.includes(g.id) ? ' active' : ''}" data-val="${g.id}">${escapeHtml(
                g.name
              )}</button>`
          )
          .join('')}
      </div>
    </div>
    <div class="f-actions">
      <button type="button" class="btn btn-ghost" id="fReset">Сбросить</button>
    </div>`;

  $('fSort').onchange = (e) => applyFilter(() => (state.filters.sorting = e.target.value));
  $('fYearFrom').onchange = (e) => applyFilter(() => (state.filters.yearFrom = e.target.value));
  $('fYearTo').onchange = (e) => applyFilter(() => (state.filters.yearTo = e.target.value));
  $('fReset').onclick = () => {
    const q = state.filters.q;
    state.filters = emptyFilters();
    state.filters.q = q;
    navigateCatalog();
  };

  bindChips('fTypes', 'types', String);
  bindChips('fAge', 'ageRatings', String);
  bindChips('fGenres', 'genres', Number);

  renderActiveFilters();
}

function bindChips(containerId, key, cast) {
  const box = $(containerId);
  if (!box) return;
  box.querySelectorAll('.f-chip').forEach((btn) => {
    btn.onclick = () => {
      const value = cast(btn.dataset.val);
      const arr = state.filters[key];
      const i = arr.findIndex((x) => String(x) === String(value));
      if (i >= 0) arr.splice(i, 1);
      else arr.push(value);
      btn.classList.toggle('active');
      navigateCatalog();
    };
  });
}

function applyFilter(fn) {
  fn();
  navigateCatalog();
}

function renderActiveFilters() {
  const box = $('activeFilters');
  const f = state.filters;
  const tags = [];
  const label = (arr, val, keys) => {
    const found = (arr || []).find((x) => String(x[keys[0]]) === String(val));
    return found ? found[keys[1]] || found[keys[2]] || val : val;
  };

  if (f.q) tags.push({ text: `Поиск: ${f.q}`, key: 'q' });
  f.types.forEach((v) => tags.push({ text: label(refs.types, v, ['value', 'description', 'value']), key: 'types', val: v }));
  f.ageRatings.forEach((v) => tags.push({ text: label(refs.ageRatings, v, ['value', 'label', 'value']), key: 'ageRatings', val: v }));
  f.genres.forEach((v) => tags.push({ text: label(refs.genres, v, ['id', 'name', 'name']), key: 'genres', val: v }));
  if (f.yearFrom) tags.push({ text: `с ${f.yearFrom}`, key: 'yearFrom' });
  if (f.yearTo) tags.push({ text: `по ${f.yearTo}`, key: 'yearTo' });

  if (!tags.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = tags
    .map(
      (t, i) =>
        `<span class="af-tag">${escapeHtml(String(t.text))}<button type="button" data-i="${i}" aria-label="Убрать">×</button></span>`
    )
    .join('');
  box.querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      const t = tags[Number(btn.dataset.i)];
      if (t.key === 'q') {
        state.filters.q = '';
        $('searchInput').value = '';
      } else if (Array.isArray(state.filters[t.key])) {
        state.filters[t.key] = state.filters[t.key].filter((x) => String(x) !== String(t.val));
      } else {
        state.filters[t.key] = '';
      }
      navigateCatalog();
    };
  });
}

function hideFilters() {
  $('filterBar').hidden = true;
  $('activeFilters').hidden = true;
  $('filterToggle').hidden = true;
  document.querySelector('.catalog-layout').classList.add('no-filters');
}

/* ---------------- routing helpers ---------------- */
function filtersToHash(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.sorting && f.sorting !== 'FRESH_AT_DESC') p.set('sort', f.sorting);
  if (f.yearFrom) p.set('yf', f.yearFrom);
  if (f.yearTo) p.set('yt', f.yearTo);
  if (f.genres.length) p.set('g', f.genres.join(','));
  if (f.types.length) p.set('t', f.types.join(','));
  if (f.ageRatings.length) p.set('a', f.ageRatings.join(','));
  const qs = p.toString();
  return '#/catalog' + (qs ? '?' + qs : '');
}

function hashToFilters(hash) {
  const i = hash.indexOf('?');
  const p = new URLSearchParams(i >= 0 ? hash.slice(i + 1) : '');
  return {
    q: p.get('q') || '',
    sorting: p.get('sort') || 'FRESH_AT_DESC',
    yearFrom: p.get('yf') || '',
    yearTo: p.get('yt') || '',
    genres: (p.get('g') || '').split(',').filter(Boolean).map(Number),
    types: (p.get('t') || '').split(',').filter(Boolean),
    ageRatings: (p.get('a') || '').split(',').filter(Boolean),
  };
}

let navTimer;
function navigateCatalog() {
  clearTimeout(navTimer);
  navTimer = setTimeout(() => {
    location.hash = filtersToHash(state.filters);
  }, 120);
}

/* ---------------- list loading ---------------- */
async function loadList(tab, page = 1, append = false) {
  state.tab = tab;
  state.page = page;

  $('view-list').hidden = false;
  $('view-title').hidden = true;
  $('view-error').hidden = true;

  document.querySelectorAll('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.tab === tab));

  const titles = {
    updates: 'Последние обновления',
    popular: 'Популярное',
    random: 'Случайная подборка',
    catalog: state.filters.q ? `Поиск: ${state.filters.q}` : 'Каталог',
  };
  $('listTitle').textContent = titles[tab] || 'Каталог';
  $('continueBlock').hidden = tab !== 'updates' || $('continueRail').children.length === 0;

  if (!append) {
    renderSkeleton();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  $('loadMoreWrap').hidden = true;
  $('listStatus').textContent = '';

  try {
    let data;
    if (tab === 'popular') data = await getPopular(page);
    else if (tab === 'random') data = await getRandom();
    else if (tab === 'catalog') data = await getCatalog(page, state.filters);
    else data = await getUpdates(page);

    renderGrid(data.list || [], append);
    state.hasMore = tab !== 'random' && data.current < data.pages;
    $('loadMoreWrap').hidden = !state.hasMore;
    if (!(data.list || []).length && !append) $('listStatus').textContent = 'Ничего не найдено';
  } catch (e) {
    console.error(e);
    if (!append) $('grid').innerHTML = '';
    $('listStatus').textContent = 'Не удалось загрузить данные. Попробуйте ещё раз.';
  }
}

/* ---------------- suggestions ---------------- */
async function fetchSuggestions(q) {
  if (!q || q.length < 2) return [];
  try {
    const r = await apiFetch('/anime/catalog/releases', { 'f[search]': q, limit: 6 });
    return normalizeList(r).list || [];
  } catch (e) {
    return [];
  }
}

function renderSuggestions(items) {
  const box = $('suggestBox');
  if (!items.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = items
    .map(
      (t) => `
    <a class="sug-item" href="#/title/${t.id}">
      <img class="sug-poster" loading="lazy" alt="" src="${posterUrl(t)}">
      <div class="sug-body">
        <div class="sug-title">${escapeHtml(displayName(t))}</div>
        <div class="sug-sub">${escapeHtml([typeName(t), yearOf(t)].filter(Boolean).join(' · '))}</div>
      </div>
    </a>`
    )
    .join('');
}

const hideSuggestions = () => {
  const b = $('suggestBox');
  if (b) b.hidden = true;
};

/* ---------------- title view ---------------- */
async function loadTitle(id) {
  $('view-list').hidden = true;
  $('view-title').hidden = false;
  $('view-error').hidden = true;
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));

  $('tName').textContent = 'Загрузка…';
  $('tNameEn').textContent = '';
  $('tMeta').innerHTML = '';
  $('tGenres').innerHTML = '';
  $('tDesc').textContent = '';
  $('episodes').innerHTML = '';
  $('tPoster').src = placeholderPoster();
  window.scrollTo({ top: 0 });

  try {
    const t = await getTitle(id);
    state.title = t;

    const poster = posterUrl(t);
    $('tPoster').src = poster;
    $('tHeroBg').style.backgroundImage = `url("${poster}")`;
    $('player').poster = poster;
    $('tName').textContent = displayName(t);
    $('tNameEn').textContent = displayEn(t);
    document.title = displayName(t) + ' — AnimRu';

    const meta = [];
    if (typeName(t)) meta.push(`<span>${escapeHtml(typeName(t))}</span>`);
    if (seasonInfo(t)) meta.push(`<span><strong>Сезон:</strong> ${escapeHtml(seasonInfo(t))}</span>`);
    meta.push(`<span><strong>Статус:</strong> ${escapeHtml(statusName(t))}</span>`);
    if (t.age_rating && t.age_rating.label) meta.push(`<span><strong>Возраст:</strong> ${escapeHtml(t.age_rating.label)}</span>`);
    if (t.episodes_total) meta.push(`<span><strong>Серий:</strong> ${t.episodes_total}</span>`);
    $('tMeta').innerHTML = meta.join('');

    $('tGenres').innerHTML = genreNames(t)
      .map((g) => `<span class="chip">${escapeHtml(g)}</span>`)
      .join('');
    $('tDesc').textContent = t.description || 'Описание отсутствует.';

    const episodes = (t.episodes || [])
      .slice()
      .sort((a, b) => (a.sort_order || a.ordinal || 0) - (b.sort_order || b.ordinal || 0));
    state.episodes = episodes;
    renderEpisodes();

    if (episodes.length) {
      const saved = getWatch()[String(t.id)];
      let idx = 0;
      let resume = 0;
      if (saved && typeof saved.epIndex === 'number' && episodes[saved.epIndex]) {
        idx = saved.epIndex;
        resume = saved.time && saved.duration && saved.time < saved.duration - 20 ? saved.time : 0;
      }
      selectEpisode(idx, { autoplay: false, resume });
    } else {
      $('epLabel').textContent = 'Серии недоступны';
    }
  } catch (e) {
    console.error(e);
    $('view-title').hidden = true;
    $('view-error').hidden = false;
    $('errText').textContent = 'Не удалось загрузить тайтл: ' + e.message;
  }
}

function renderEpisodes() {
  const box = $('episodes');
  const watched = (getWatch()[String(state.title && state.title.id)] || {}).seen || {};
  box.innerHTML = '';
  $('epCount').textContent = state.episodes.length ? state.episodes.length + ' шт.' : '';
  state.episodes.forEach((ep, i) => {
    const num = ep.ordinal || i + 1;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ep-btn' + (i === state.epIndex ? ' active' : '');
    btn.dataset.idx = i;
    btn.innerHTML = `<span class="ep-num">${escapeHtml(String(num))}</span><span class="ep-name">${escapeHtml(
      ep.name || 'Серия ' + num
    )}</span>${watched[i] ? '<span class="ep-seen">✓</span>' : ''}`;
    btn.onclick = () => selectEpisode(i, { autoplay: true });
    box.appendChild(btn);
  });
}

function episodeSources(ep) {
  const out = {};
  ['hls_1080', 'hls_720', 'hls_480'].forEach((k) => {
    if (ep && ep[k]) out[k] = ep[k];
  });
  return out;
}

function selectEpisode(idx, opts = {}) {
  const ep = state.episodes[idx];
  if (!ep) return;
  state.epIndex = idx;

  document.querySelectorAll('.ep-btn').forEach((b) => {
    const on = Number(b.dataset.idx) === idx;
    b.classList.toggle('active', on);
    if (on) b.scrollIntoView({ block: 'nearest' });
  });

  const num = ep.ordinal || idx + 1;
  $('epLabel').textContent = `Серия ${num}${ep.name ? ' — ' + ep.name : ''}`;
  $('pPrevEp').disabled = idx === 0;
  $('pNextEp').disabled = idx === state.episodes.length - 1;

  const sources = episodeSources(ep);
  const list = Object.keys(sources);
  renderQualityMenu(list);

  if (!list.length) {
    $('epLabel').textContent += ' — источник недоступен';
    return;
  }
  const quality = list.includes(prefs.quality) ? prefs.quality : list[0];
  state.quality = quality;
  prefs.quality = quality;
  savePrefs();
  updateQualityMenu();
  loadStream(sources[quality], opts.resume || 0, opts.autoplay !== false);
}

function renderQualityMenu(list) {
  const labels = { hls_1080: '1080p', hls_720: '720p', hls_480: '480p' };
  const menu = $('pQualityMenu');
  menu.innerHTML = list
    .map((q) => `<button type="button" data-q="${q}">${labels[q] || q}</button>`)
    .join('');
  menu.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const q = b.dataset.q;
      const ep = state.episodes[state.epIndex];
      const src = ep && ep[q];
      if (!src) return;
      const video = $('player');
      const time = video.currentTime;
      const wasPlaying = !video.paused;
      state.quality = q;
      prefs.quality = q;
      savePrefs();
      updateQualityMenu();
      closeMenus();
      loadStream(src, time, wasPlaying);
    };
  });
  updateQualityMenu();
}

function updateQualityMenu() {
  const labels = { hls_1080: '1080p', hls_720: '720p', hls_480: '480p' };
  $('pQualityBtn').textContent = labels[state.quality] || '—';
  $('pQualityMenu')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('active', b.dataset.q === state.quality));
}

/* ---------------- player ---------------- */
function loadStream(src, resumeTime = 0, autoplay = true) {
  const video = $('player');
  if (!src) return;

  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }
  showLoader(true);

  const start = () => {
    if (resumeTime > 0) {
      try {
        video.currentTime = resumeTime;
      } catch (e) {
        /* ignore */
      }
    }
    video.playbackRate = prefs.rate;
    if (autoplay) video.play().catch(() => {});
  };

  if (window.Hls && window.Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 40, capLevelToPlayerSize: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, start);
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else {
        hls.destroy();
        showLoader(false);
        toast('Ошибка воспроизведения');
      }
    });
    state.hls = hls;
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.addEventListener('loadedmetadata', start, { once: true });
  } else {
    showLoader(false);
    toast('Браузер не поддерживает HLS');
  }
}

function showLoader(on) {
  $('pLoader').hidden = !on;
}

function toast(text) {
  const el = $('pToast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => (el.hidden = true), 1200);
}

function togglePlay() {
  const v = $('player');
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}

function seekBy(delta) {
  const v = $('player');
  if (!isFinite(v.duration)) return;
  v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration);
  toast((delta > 0 ? '+' : '') + delta + ' с');
}

function setVolume(val) {
  const v = $('player');
  v.volume = Math.min(1, Math.max(0, val));
  v.muted = v.volume === 0;
  prefs.volume = v.volume;
  prefs.muted = v.muted;
  savePrefs();
  syncVolumeUi();
}

function syncVolumeUi() {
  const v = $('player');
  $('pVol').value = v.muted ? 0 : v.volume;
  $('pMute').querySelector('.i-vol').hidden = v.muted || v.volume === 0;
  $('pMute').querySelector('.i-muted').hidden = !(v.muted || v.volume === 0);
}

function closeMenus() {
  ['pSpeedMenu', 'pQualityMenu'].forEach((id) => ($(id).hidden = true));
  $('pSpeedBtn').setAttribute('aria-expanded', 'false');
  $('pQualityBtn').setAttribute('aria-expanded', 'false');
}

function toggleFullscreen() {
  const root = $('playerRoot');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
}

function scheduleHideUi() {
  const root = $('playerRoot');
  root.classList.remove('hide-ui');
  clearTimeout(state.hideUiTimer);
  state.hideUiTimer = setTimeout(() => {
    if (!$('player').paused) root.classList.add('hide-ui');
  }, 2600);
}

function persistProgress(force) {
  const v = $('player');
  const t = state.title;
  if (!t || !isFinite(v.duration) || v.duration <= 0) return;
  if (!force && v.paused) return;
  const prev = getWatch()[String(t.id)] || {};
  const seen = Object.assign({}, prev.seen);
  if (v.currentTime / v.duration > 0.9) seen[state.epIndex] = 1;
  const ep = state.episodes[state.epIndex] || {};
  saveWatch({
    id: String(t.id),
    name: displayName(t),
    poster: posterUrl(t),
    epIndex: state.epIndex,
    epNum: ep.ordinal || state.epIndex + 1,
    time: v.currentTime,
    duration: v.duration,
    seen,
  });
}

function seekFromEvent(e) {
  const v = $('player');
  if (!isFinite(v.duration)) return;
  const rect = $('pSeek').getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const ratio = Math.min(1, Math.max(0, x / rect.width));
  v.currentTime = ratio * v.duration;
}

function initPlayer() {
  const v = $('player');
  const root = $('playerRoot');

  v.volume = prefs.volume;
  v.muted = prefs.muted;
  v.playbackRate = prefs.rate;
  syncVolumeUi();

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  $('pSpeedMenu').innerHTML = speeds.map((s) => `<button type="button" data-s="${s}">${s}×</button>`).join('');
  const syncSpeed = () => {
    $('pSpeedBtn').textContent = prefs.rate + '×';
    $('pSpeedMenu')
      .querySelectorAll('button')
      .forEach((b) => b.classList.toggle('active', Number(b.dataset.s) === prefs.rate));
  };
  $('pSpeedMenu')
    .querySelectorAll('button')
    .forEach((b) => {
      b.onclick = () => {
        prefs.rate = Number(b.dataset.s);
        v.playbackRate = prefs.rate;
        savePrefs();
        syncSpeed();
        closeMenus();
      };
    });
  syncSpeed();

  $('autoNext').checked = prefs.autoNext;
  $('autoNext').onchange = (e) => {
    prefs.autoNext = e.target.checked;
    savePrefs();
  };

  $('pPlay').onclick = togglePlay;
  $('pBigPlay').onclick = togglePlay;
  v.addEventListener('click', togglePlay);
  v.addEventListener('dblclick', toggleFullscreen);

  $('pPrevEp').onclick = () => selectEpisode(state.epIndex - 1, { autoplay: true });
  $('pNextEp').onclick = () => selectEpisode(state.epIndex + 1, { autoplay: true });

  $('pMute').onclick = () => {
    v.muted = !v.muted;
    prefs.muted = v.muted;
    savePrefs();
    syncVolumeUi();
  };
  $('pVol').oninput = (e) => setVolume(Number(e.target.value));

  $('pPip').onclick = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch (e) {
      toast('PiP недоступен');
    }
  };
  $('pFull').onclick = toggleFullscreen;

  const toggleMenu = (btnId, menuId) => {
    $(btnId).onclick = (e) => {
      e.stopPropagation();
      const menu = $(menuId);
      const open = menu.hidden;
      closeMenus();
      menu.hidden = !open;
      $(btnId).setAttribute('aria-expanded', String(open));
    };
  };
  toggleMenu('pSpeedBtn', 'pSpeedMenu');
  toggleMenu('pQualityBtn', 'pQualityMenu');
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.p-select')) closeMenus();
  });

  // seek interactions
  const seek = $('pSeek');
  let dragging = false;
  seek.addEventListener('pointerdown', (e) => {
    dragging = true;
    seek.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  });
  seek.addEventListener('pointermove', (e) => {
    if (dragging) seekFromEvent(e);
    if (isFinite(v.duration)) {
      const rect = seek.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const tip = $('pTip');
      tip.hidden = false;
      tip.style.left = ratio * 100 + '%';
      tip.textContent = fmtTime(ratio * v.duration);
    }
  });
  seek.addEventListener('pointerup', () => (dragging = false));
  seek.addEventListener('pointerleave', () => {
    dragging = false;
    $('pTip').hidden = true;
  });
  seek.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') seekBy(5);
    if (e.key === 'ArrowLeft') seekBy(-5);
  });

  // video events
  v.addEventListener('play', () => {
    root.classList.add('playing');
    $('pPlay').querySelector('.i-play').hidden = true;
    $('pPlay').querySelector('.i-pause').hidden = false;
    scheduleHideUi();
  });
  v.addEventListener('pause', () => {
    root.classList.remove('playing', 'hide-ui');
    $('pPlay').querySelector('.i-play').hidden = false;
    $('pPlay').querySelector('.i-pause').hidden = true;
    persistProgress(true);
  });
  v.addEventListener('waiting', () => showLoader(true));
  v.addEventListener('playing', () => showLoader(false));
  v.addEventListener('canplay', () => showLoader(false));
  v.addEventListener('loadedmetadata', () => {
    $('pDur').textContent = fmtTime(v.duration);
  });
  v.addEventListener('timeupdate', () => {
    const pct = isFinite(v.duration) && v.duration ? (v.currentTime / v.duration) * 100 : 0;
    $('pPlayed').style.width = pct + '%';
    $('pCur').textContent = fmtTime(v.currentTime);
    $('pSeek').setAttribute('aria-valuenow', String(Math.round(pct)));
  });
  v.addEventListener('progress', () => {
    if (v.buffered.length && isFinite(v.duration) && v.duration) {
      const end = v.buffered.end(v.buffered.length - 1);
      $('pBuffer').style.width = (end / v.duration) * 100 + '%';
    }
  });
  v.addEventListener('volumechange', syncVolumeUi);
  v.addEventListener('ended', () => {
    persistProgress(true);
    renderEpisodes();
    if (prefs.autoNext && state.episodes[state.epIndex + 1]) selectEpisode(state.epIndex + 1, { autoplay: true });
  });

  root.addEventListener('pointermove', scheduleHideUi);
  root.addEventListener('pointerleave', () => {
    if (!v.paused) root.classList.add('hide-ui');
  });

  document.addEventListener('fullscreenchange', () => {
    root.classList.toggle('is-fullscreen', !!document.fullscreenElement);
  });

  // periodic progress save
  state.saveTimer = setInterval(() => persistProgress(false), 5000);
  window.addEventListener('beforeunload', () => persistProgress(true));

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ($('view-title').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekBy(5);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seekBy(-5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume(v.volume + 0.1);
        toast('Громкость ' + Math.round(v.volume * 100) + '%');
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume(v.volume - 0.1);
        toast('Громкость ' + Math.round(v.volume * 100) + '%');
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'm':
        v.muted = !v.muted;
        syncVolumeUi();
        break;
      case 'n':
        selectEpisode(state.epIndex + 1, { autoplay: true });
        break;
      case 'p':
        selectEpisode(state.epIndex - 1, { autoplay: true });
        break;
      default:
        break;
    }
  });
}

/* ---------------- router ---------------- */
async function router() {
  const hash = location.hash || '#/';
  hideSuggestions();
  closeMenus();
  $('nav').classList.remove('open');

  const v = $('player');
  if (!$('view-title').hidden) {
    persistProgress(true);
    v.pause();
  }

  if (hash.startsWith('#/title/')) {
    const id = decodeURIComponent(hash.slice('#/title/'.length));
    await loadTitle(id);
    return;
  }

  document.title = 'AnimRu — аниме онлайн';
  renderContinue();

  if (hash.startsWith('#/catalog')) {
    state.filters = hashToFilters(hash);
    $('searchInput').value = state.filters.q;
    $('filterToggle').hidden = window.innerWidth > 900;
    await renderFilters();
    await loadList('catalog', 1, false);
    renderActiveFilters();
    return;
  }

  hideFilters();
  if (hash.startsWith('#/popular')) await loadList('popular');
  else if (hash.startsWith('#/random')) await loadList('random');
  else await loadList('updates');
}

/* ---------------- init ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const input = $('searchInput');

  $('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    hideSuggestions();
    state.filters = Object.assign(emptyFilters(), state.filters, { q: input.value.trim() });
    location.hash = filtersToHash(state.filters);
  });

  input.addEventListener('input', () => {
    clearTimeout(state.suggestTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      hideSuggestions();
      return;
    }
    state.suggestTimer = setTimeout(async () => {
      const items = await fetchSuggestions(q);
      if (input.value.trim() === q) renderSuggestions(items);
    }, 220);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideSuggestions();
      input.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) hideSuggestions();
  });

  $('menuBtn').addEventListener('click', () => {
    const nav = $('nav');
    nav.classList.toggle('open');
    $('menuBtn').setAttribute('aria-expanded', String(nav.classList.contains('open')));
  });

  $('filterToggle').addEventListener('click', () => {
    const box = $('filterBar');
    box.hidden = !box.hidden;
    $('filterToggle').setAttribute('aria-expanded', String(!box.hidden));
  });

  $('loadMore').addEventListener('click', () => {
    if (!state.hasMore) return;
    loadList(state.tab, state.page + 1, true);
  });

  $('backBtn').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = '#/';
  });

  $('clearContinue').addEventListener('click', () => {
    writeJson(LS_WATCH, {});
    renderContinue();
  });

  initPlayer();
  window.addEventListener('hashchange', router);
  router();
});
