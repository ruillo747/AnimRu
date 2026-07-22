// AnimRu — anime streaming SPA on Anilibria API v1 (anilibria.top)

const API = 'https://anilibria.top/api/v1';
const MEDIA_HOST = 'https://anilibria.top';
const PAGE_SIZE = 24;

const state = {
  view: 'list',
  tab: 'updates',
  page: 1,
  items: [],
  query: '',
  searchQuery: '',
  filters: { genres: [], types: [], ageRatings: [], yearFrom: '', yearTo: '', sorting: 'FRESH_AT_DESC' },
  suggestTimer: null,
  currentTitle: null,
  currentEpisode: 0,
  currentQuality: 'hls_720',
  episodes: [],
  hls: null,
};

// ---------- API ----------
async function apiFetch(path, params = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => url.searchParams.set(`${k}[${i}]`, item));
    } else {
      url.searchParams.set(k, v);
    }
  });
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error('API ' + r.status);
  return r.json();
}

// Reference cache (loaded once)
const refs = { genres: null, years: null, types: null, ageRatings: null };
async function loadRefs() {
  if (refs.genres) return refs;
  try {
    const [genres, years, types, ageRatings] = await Promise.all([
      apiFetch('/anime/catalog/references/genres'),
      apiFetch('/anime/catalog/references/years'),
      apiFetch('/anime/catalog/references/types'),
      apiFetch('/anime/catalog/references/age-ratings'),
    ]);
    refs.genres = genres || [];
    refs.years = years || [];
    refs.types = types || [];
    refs.ageRatings = ageRatings || [];
  } catch (e) {
    console.warn('Failed to load references', e);
    refs.genres = []; refs.years = []; refs.types = []; refs.ageRatings = [];
  }
  return refs;
}

// New API returns either an array or {data, meta}
function normalizeList(resp, page = 1) {
  if (Array.isArray(resp)) {
    return { list: resp, pagination: { pages: 1, current_page: 1 } };
  }
  const list = resp.data || [];
  const meta = resp.meta || {};
  const pag = meta.pagination || meta || {};
  return {
    list,
    pagination: {
      pages: pag.total_pages || pag.last_page || 1,
      current_page: pag.current_page || page,
    },
  };
}

async function getUpdates(page = 1) {
  const r = await apiFetch('/anime/releases/latest', { limit: PAGE_SIZE, page });
  return normalizeList(r, page);
}

async function getPopular(page = 1) {
  // Catalog sorted by rating desc → "popular"
  const r = await apiFetch('/anime/catalog/releases', {
    'f[sorting]': 'RATING_DESC',
    page,
    limit: PAGE_SIZE,
  });
  return normalizeList(r, page);
}

async function getRandom() {
  // Endpoint returns a small random batch
  try {
    const r = await apiFetch('/anime/releases/random', { limit: 12 });
    return normalizeList(r);
  } catch (e) {
    // Fallback: pick from latest
    const r = await apiFetch('/anime/releases/latest', { limit: 24 });
    const arr = Array.isArray(r) ? r : (r.data || []);
    const shuffled = arr.slice().sort(() => Math.random() - 0.5).slice(0, 12);
    return { list: shuffled, pagination: { pages: 1, current_page: 1 } };
  }
}

async function searchTitle(query, page = 1, filters = {}) {
  const params = { limit: PAGE_SIZE, page };
  if (query) params['f[search]'] = query;
  if (filters.genres && filters.genres.length) params['f[genres]'] = filters.genres;
  if (filters.types && filters.types.length) params['f[types]'] = filters.types;
  if (filters.ageRatings && filters.ageRatings.length) params['f[age_ratings]'] = filters.ageRatings;
  if (filters.yearFrom) params['f[years][from_year]'] = filters.yearFrom;
  if (filters.yearTo) params['f[years][to_year]'] = filters.yearTo;
  params['f[sorting]'] = filters.sorting || 'FRESH_AT_DESC';
  const r = await apiFetch('/anime/catalog/releases', params);
  return normalizeList(r, page);
}

async function getTitle(id) {
  // id can be numeric id or alias
  return apiFetch('/anime/releases/' + encodeURIComponent(id));
}

// ---------- Helpers ----------
function posterUrl(title) {
  const p = title.poster || {};
  const opt = p.optimized || {};
  const chosen = opt.src || p.src || opt.preview || p.preview || opt.thumbnail || p.thumbnail;
  if (!chosen) return placeholderPoster();
  return chosen.startsWith('http') ? chosen : MEDIA_HOST + chosen;
}

function placeholderPoster() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect fill="#161923" width="200" height="300"/><text x="100" y="150" font-family="sans-serif" font-size="14" fill="#8892a6" text-anchor="middle">Нет постера</text></svg>'
  );
}

function displayName(title) {
  const n = title.name || {};
  return n.main || n.english || 'Без названия';
}

function displayEn(title) {
  return (title.name && title.name.english) || '';
}

function seasonInfo(title) {
  const s = title.season || {};
  const year = title.year || '';
  const season = s.description || '';
  return [season, year].filter(Boolean).join(' ');
}

function statusName(title) {
  if (title.is_in_production) return 'В производстве';
  if (title.is_ongoing) return 'Онгоинг';
  return 'Завершён';
}

function genreNames(title) {
  const g = title.genres || [];
  return g.map(x => (typeof x === 'string' ? x : (x.name || ''))).filter(Boolean);
}

// ---------- Render: list ----------
function renderGrid(titles, append = false) {
  const grid = document.getElementById('grid');
  if (!append) grid.innerHTML = '';
  if (!titles || !titles.length) {
    if (!append) grid.innerHTML = '<p class="status">Ничего не найдено</p>';
    return;
  }
  const frag = document.createDocumentFragment();
  titles.forEach(t => {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = '#/title/' + t.id;
    card.innerHTML = `
      <div class="card-poster">
        <img loading="lazy" alt="" src="${posterUrl(t)}" onerror="this.src='${placeholderPoster()}'">
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(displayName(t))}</p>
        <div class="card-sub">
          <span>${escapeHtml(seasonInfo(t))}</span>
          <span class="badge">${escapeHtml(statusName(t))}</span>
        </div>
      </div>
    `;
    frag.appendChild(card);
  });
  grid.appendChild(frag);
}

function renderSkeleton() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('div');
    s.className = 'card';
    s.innerHTML = `
      <div class="card-poster skeleton"></div>
      <div class="card-body">
        <div class="skeleton" style="height:14px;margin-bottom:6px"></div>
        <div class="skeleton" style="height:12px;width:60%"></div>
      </div>
    `;
    grid.appendChild(s);
  }
}

async function loadList(tab, page = 1, append = false) {
  state.tab = tab;
  state.page = page;
  if (tab !== 'search') state.query = '';

  document.getElementById('view-list').hidden = false;
  document.getElementById('view-title').hidden = true;
  document.getElementById('view-error').hidden = true;

  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  const titleMap = {
    updates: 'Последние обновления',
    popular: 'Недавно обновлённые',
    random: 'Случайные аниме',
    search: 'Результаты поиска',
  };
  document.getElementById('listTitle').textContent = titleMap[tab] || 'Каталог';

  if (!append) renderSkeleton();
  document.getElementById('loadMoreWrap').hidden = true;
  document.getElementById('listStatus').textContent = '';

  try {
    let data;
    if (tab === 'updates') data = await getUpdates(page);
    else if (tab === 'popular') data = await getPopular(page);
    else if (tab === 'random') data = await getRandom();
    else if (tab === 'search') data = await searchTitle(state.searchQuery, page, state.filters);

    const list = data.list || [];
    if (append) state.items = state.items.concat(list);
    else state.items = list;

    renderGrid(list, append);

    const pag = data.pagination || {};
    const hasMore = pag.current_page < pag.pages && tab !== 'random';
    document.getElementById('loadMoreWrap').hidden = !hasMore;

    if (!list.length && !append) {
      document.getElementById('listStatus').textContent = 'Ничего не найдено';
    }
  } catch (e) {
    console.error(e);
    document.getElementById('listStatus').textContent = 'Ошибка загрузки. Попробуйте обновить страницу.';
  }
}

async function loadSearch(query) {
  state.searchQuery = query || '';
  const parts = [];
  if (query) parts.push('«' + query + '»');
  if (state.filters.genres.length) parts.push(state.filters.genres.length + ' жанр(ов)');
  document.getElementById('listTitle').textContent = parts.length ? 'Поиск: ' + parts.join(', ') : 'Каталог';
  await renderFilterBar();
  await loadList('search', 1, false);
}

// ---------- Filters UI ----------
async function renderFilterBar() {
  const box = document.getElementById('filterBar');
  if (!box) return;
  box.hidden = false;
  await loadRefs();
  const f = state.filters;

  const sortings = [
    ['FRESH_AT_DESC', 'Новые обновления'],
    ['RATING_DESC', 'По рейтингу'],
    ['YEAR_DESC', 'Сначала новые'],
    ['YEAR_ASC', 'Сначала старые'],
  ];

  const yearsOpts = ['<option value="">—</option>']
    .concat((refs.years || []).slice().reverse().map(y => `<option value="${y}">${y}</option>`))
    .join('');

  box.innerHTML = `
    <div class="fb-row">
      <label class="fb-field">
        <span>Сортировка</span>
        <select id="fSort">${sortings.map(([v, l]) => `<option value="${v}"${v === f.sorting ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </label>
      <label class="fb-field">
        <span>Год с</span>
        <select id="fYearFrom">${yearsOpts}</select>
      </label>
      <label class="fb-field">
        <span>по</span>
        <select id="fYearTo">${yearsOpts}</select>
      </label>
      <button type="button" class="fb-reset" id="fReset">Сбросить</button>
    </div>
    <div class="fb-group">
      <span class="fb-label">Тип</span>
      <div class="fb-chips" id="fTypes">
        ${refs.types.map(t => `<button type="button" class="fb-chip${f.types.includes(t.value) ? ' active' : ''}" data-val="${escapeHtml(t.value)}">${escapeHtml(t.description || t.value)}</button>`).join('')}
      </div>
    </div>
    <div class="fb-group">
      <span class="fb-label">Возраст</span>
      <div class="fb-chips" id="fAge">
        ${refs.ageRatings.map(a => `<button type="button" class="fb-chip${f.ageRatings.includes(a.value) ? ' active' : ''}" data-val="${escapeHtml(a.value)}">${escapeHtml(a.label || a.value)}</button>`).join('')}
      </div>
    </div>
    <details class="fb-group fb-genres" ${f.genres.length ? 'open' : ''}>
      <summary><span class="fb-label">Жанры</span><span class="fb-count">${f.genres.length ? f.genres.length + ' выбрано' : ''}</span></summary>
      <div class="fb-chips" id="fGenres">
        ${(refs.genres || []).map(g => `<button type="button" class="fb-chip${f.genres.includes(g.id) ? ' active' : ''}" data-val="${g.id}">${escapeHtml(g.name)}</button>`).join('')}
      </div>
    </details>
  `;

  // Restore year selects
  document.getElementById('fYearFrom').value = f.yearFrom || '';
  document.getElementById('fYearTo').value = f.yearTo || '';

  document.getElementById('fSort').onchange = e => { state.filters.sorting = e.target.value; triggerSearch(); };
  document.getElementById('fYearFrom').onchange = e => { state.filters.yearFrom = e.target.value; triggerSearch(); };
  document.getElementById('fYearTo').onchange = e => { state.filters.yearTo = e.target.value; triggerSearch(); };
  document.getElementById('fReset').onclick = () => {
    state.filters = { genres: [], types: [], ageRatings: [], yearFrom: '', yearTo: '', sorting: 'FRESH_AT_DESC' };
    triggerSearch();
  };

  box.querySelectorAll('#fTypes .fb-chip').forEach(btn => {
    btn.onclick = () => toggleFilter('types', btn.dataset.val, btn);
  });
  box.querySelectorAll('#fAge .fb-chip').forEach(btn => {
    btn.onclick = () => toggleFilter('ageRatings', btn.dataset.val, btn);
  });
  box.querySelectorAll('#fGenres .fb-chip').forEach(btn => {
    btn.onclick = () => toggleFilter('genres', Number(btn.dataset.val), btn);
  });
}

function toggleFilter(key, value, btn) {
  const arr = state.filters[key];
  const idx = arr.indexOf(value);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(value);
  btn.classList.toggle('active');
  triggerSearch();
}

let searchDebounce;
function triggerSearch() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    const q = state.searchQuery || document.getElementById('searchInput').value.trim();
    updateSearchHash(q);
  }, 250);
}

function updateSearchHash(query) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const f = state.filters;
  if (f.sorting && f.sorting !== 'FRESH_AT_DESC') params.set('sort', f.sorting);
  if (f.yearFrom) params.set('yf', f.yearFrom);
  if (f.yearTo) params.set('yt', f.yearTo);
  if (f.genres.length) params.set('g', f.genres.join(','));
  if (f.types.length) params.set('t', f.types.join(','));
  if (f.ageRatings.length) params.set('a', f.ageRatings.join(','));
  const qs = params.toString();
  location.hash = '#/search' + (qs ? '?' + qs : '');
}

function parseSearchHash(hash) {
  // hash like: #/search?q=foo&g=1,2
  const qIdx = hash.indexOf('?');
  const params = new URLSearchParams(qIdx >= 0 ? hash.slice(qIdx + 1) : '');
  return {
    q: params.get('q') || '',
    sorting: params.get('sort') || 'FRESH_AT_DESC',
    yearFrom: params.get('yf') || '',
    yearTo: params.get('yt') || '',
    genres: (params.get('g') || '').split(',').filter(Boolean).map(Number),
    types: (params.get('t') || '').split(',').filter(Boolean),
    ageRatings: (params.get('a') || '').split(',').filter(Boolean),
  };
}

// ---------- Autocomplete suggestions ----------
async function fetchSuggestions(query) {
  if (!query || query.length < 2) return [];
  try {
    const r = await apiFetch('/anime/catalog/releases', {
      'f[search]': query,
      limit: 6,
    });
    const data = normalizeList(r);
    return data.list || [];
  } catch (e) {
    return [];
  }
}

function renderSuggestions(items) {
  const box = document.getElementById('suggestBox');
  if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = items.map(t => `
    <a class="sug-item" href="#/title/${t.id}">
      <img class="sug-poster" loading="lazy" src="${posterUrl(t)}" alt="" onerror="this.src='${placeholderPoster()}'">
      <div class="sug-body">
        <div class="sug-title">${escapeHtml(displayName(t))}</div>
        <div class="sug-sub">${escapeHtml(seasonInfo(t) || (t.type && t.type.description) || '')}</div>
      </div>
    </a>
  `).join('');
}

function hideSuggestions() {
  const box = document.getElementById('suggestBox');
  if (box) { box.hidden = true; }
}

// ---------- Render: title ----------
async function loadTitle(id) {
  document.getElementById('view-list').hidden = true;
  document.getElementById('view-title').hidden = false;
  document.getElementById('view-error').hidden = true;

  document.getElementById('tName').textContent = 'Загрузка...';
  document.getElementById('tNameEn').textContent = '';
  document.getElementById('tMeta').innerHTML = '';
  document.getElementById('tGenres').innerHTML = '';
  document.getElementById('tDesc').textContent = '';
  document.getElementById('episodes').innerHTML = '';
  document.getElementById('tPoster').src = placeholderPoster();

  try {
    const t = await getTitle(id);
    state.currentTitle = t;

    const poster = posterUrl(t);
    document.getElementById('tPoster').src = poster;
    const heroBg = document.getElementById('tHeroBg');
    if (heroBg) heroBg.style.backgroundImage = `url("${poster}")`;
    document.getElementById('tName').textContent = displayName(t);
    document.getElementById('tNameEn').textContent = displayEn(t);

    const meta = [];
    if (t.type && t.type.description) meta.push(`<span>${escapeHtml(t.type.description)}</span>`);
    if (seasonInfo(t)) meta.push(`<span><strong>Сезон:</strong> ${escapeHtml(seasonInfo(t))}</span>`);
    if (statusName(t)) meta.push(`<span><strong>Статус:</strong> ${escapeHtml(statusName(t))}</span>`);
    if (t.age_rating && t.age_rating.label) meta.push(`<span><strong>Возраст:</strong> ${escapeHtml(t.age_rating.label)}</span>`);
    if (t.episodes_total) meta.push(`<span><strong>Серий:</strong> ${t.episodes_total}</span>`);
    document.getElementById('tMeta').innerHTML = meta.join('');

    const genres = genreNames(t).map(g => `<span class="chip">${escapeHtml(g)}</span>`).join('');
    document.getElementById('tGenres').innerHTML = genres;

    document.getElementById('tDesc').textContent = t.description || 'Описание отсутствует.';

    // Episodes
    const episodes = (t.episodes || []).slice().sort(
      (a, b) => (a.sort_order || a.ordinal || 0) - (b.sort_order || b.ordinal || 0)
    );
    renderEpisodes(episodes);

    if (episodes.length > 0) {
      state.currentEpisode = 0;
      playEpisode(0);
    } else {
      document.getElementById('epLabel').textContent = 'Серии недоступны';
      document.getElementById('qualityBox').hidden = true;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    document.getElementById('view-title').hidden = true;
    document.getElementById('view-error').hidden = false;
    document.getElementById('errText').textContent = 'Не удалось загрузить тайтл: ' + e.message;
  }
}

function renderEpisodes(episodes) {
  const box = document.getElementById('episodes');
  box.innerHTML = '';
  state.episodes = episodes;
  episodes.forEach((ep, idx) => {
    const btn = document.createElement('button');
    btn.className = 'ep-btn';
    btn.dataset.idx = idx;
    const num = ep.ordinal || (idx + 1);
    btn.textContent = num;
    btn.title = ep.name || `Серия ${num}`;
    btn.onclick = () => playEpisode(idx);
    box.appendChild(btn);
  });
}

function episodeSources(ep) {
  // Returns { hls_1080, hls_720, hls_480 } — only present keys
  const out = {};
  ['hls_1080', 'hls_720', 'hls_480'].forEach(k => {
    if (ep[k]) out[k] = ep[k];
  });
  return out;
}

function playEpisode(idx) {
  const episodes = state.episodes || [];
  if (!episodes[idx]) return;
  state.currentEpisode = idx;
  const ep = episodes[idx];

  document.querySelectorAll('.ep-btn').forEach(b => {
    b.classList.toggle('active', +b.dataset.idx === idx);
    if (+b.dataset.idx === idx) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const num = ep.ordinal || idx + 1;
  document.getElementById('epLabel').textContent = `Серия ${num}${ep.name ? ' — ' + ep.name : ''}`;
  document.getElementById('prevEp').disabled = idx === 0;
  document.getElementById('nextEp').disabled = idx === episodes.length - 1;

  const sources = episodeSources(ep);
  const qualities = Object.keys(sources); // ordered: 1080,720,480
  renderQualityButtons(qualities);

  const preferred = qualities.includes(state.currentQuality) ? state.currentQuality : qualities[0];
  if (preferred) {
    state.currentQuality = preferred;
    loadStream(sources[preferred]);
  } else {
    document.getElementById('qualityBox').hidden = true;
    document.getElementById('epLabel').textContent += ' — источник недоступен';
  }
}

function renderQualityButtons(qualities) {
  const box = document.getElementById('qualityBox');
  const btnsBox = document.getElementById('qualityBtns');
  btnsBox.innerHTML = '';
  if (!qualities.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const labels = { hls_1080: '1080p', hls_720: '720p', hls_480: '480p' };
  qualities.forEach(q => {
    const b = document.createElement('button');
    b.className = 'quality-btn' + (q === state.currentQuality ? ' active' : '');
    b.textContent = labels[q] || q;
    b.onclick = () => {
      state.currentQuality = q;
      const ep = state.episodes[state.currentEpisode];
      const src = ep && ep[q];
      if (src) {
        const currentTime = document.getElementById('player').currentTime;
        loadStream(src, currentTime);
        document.querySelectorAll('.quality-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      }
    };
    btnsBox.appendChild(b);
  });
}

function loadStream(src, resumeTime = 0) {
  const video = document.getElementById('player');
  if (!src) return;

  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }

  if (window.Hls && window.Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 30 });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (resumeTime) video.currentTime = resumeTime;
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        console.warn('HLS error', data);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else {
          hls.destroy();
        }
      }
    });
    state.hls = hls;
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.addEventListener('loadedmetadata', () => {
      if (resumeTime) video.currentTime = resumeTime;
      video.play().catch(() => {});
    }, { once: true });
  } else {
    document.getElementById('epLabel').textContent = 'Ваш браузер не поддерживает HLS';
  }
}

// ---------- Utils ----------
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- Router ----------
function hideFilterBar() {
  const box = document.getElementById('filterBar');
  if (box) box.hidden = true;
}

function router() {
  const hash = location.hash || '#/';
  hideSuggestions();

  if (hash.startsWith('#/search')) {
    const parsed = parseSearchHash(hash);
    state.filters = {
      genres: parsed.genres, types: parsed.types, ageRatings: parsed.ageRatings,
      yearFrom: parsed.yearFrom, yearTo: parsed.yearTo, sorting: parsed.sorting,
    };
    document.getElementById('searchInput').value = parsed.q;
    loadSearch(parsed.q);
    return;
  }

  hideFilterBar();
  const parts = hash.replace(/^#\//, '').split('/');
  const path = parts[0];
  const param = parts[1];

  if (path === 'title' && param) {
    loadTitle(decodeURIComponent(param));
  } else if (path === 'popular') {
    loadList('popular');
  } else if (path === 'random') {
    loadList('random');
  } else {
    loadList('updates');
  }
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('searchInput');

  document.getElementById('searchForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value.trim();
    hideSuggestions();
    state.searchQuery = q;
    updateSearchHash(q);
  });

  input.addEventListener('input', () => {
    clearTimeout(state.suggestTimer);
    const q = input.value.trim();
    if (q.length < 2) { hideSuggestions(); return; }
    state.suggestTimer = setTimeout(async () => {
      const items = await fetchSuggestions(q);
      // ignore stale
      if (input.value.trim() === q) renderSuggestions(items);
    }, 200);
  });

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q.length >= 2) fetchSuggestions(q).then(renderSuggestions);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) hideSuggestions();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideSuggestions(); input.blur(); }
  });

  document.getElementById('loadMore').addEventListener('click', () => {
    state.page += 1;
    loadList(state.tab, state.page, true);
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.hash = '#/';
  });

  document.getElementById('prevEp').addEventListener('click', () => {
    if (state.currentEpisode > 0) playEpisode(state.currentEpisode - 1);
  });

  document.getElementById('nextEp').addEventListener('click', () => {
    if (state.currentEpisode < (state.episodes || []).length - 1) {
      playEpisode(state.currentEpisode + 1);
    }
  });

  window.addEventListener('hashchange', router);
  router();
});
