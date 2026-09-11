/* AnimRu — локальная геймификация: опыт, уровни, квесты, боевой пропуск.
   Всё хранится в localStorage этого браузера: аккаунтов и сервера нет. */
(function (global) {
  'use strict';

  var LS = 'animru:gamify';
  var MAX_LEVEL = 100;

  var RARITY_NAME = {
    common: 'Обычный',
    rare: 'Редкий',
    epic: 'Эпический',
    myth: 'Мифический'
  };

  var KIND_NAME = {
    title: 'Титул',
    frame: 'Рамка',
    avatar: 'Аватар',
    background: 'Фон профиля'
  };

  /* 55 предметов пропуска «Нулевой слой» */
  var RAW = [
    ['title', 'Новичок слоя', 'common', 'Новичок слоя'],
    ['avatar', 'Знак «ア»', 'common', 'ア'],
    ['title', 'Ночной зритель', 'common', 'Ночной зритель'],
    ['background', 'Ровный фон', 'common', 'plain'],
    ['avatar', 'Знак «イ»', 'common', 'イ'],
    ['title', 'Собиратель серий', 'common', 'Собиратель серий'],
    ['frame', 'Тонкая рамка', 'rare', 'line'],
    ['avatar', 'Знак «ウ»', 'common', 'ウ'],
    ['title', 'Марафонец', 'common', 'Марафонец'],
    ['background', 'Сетка', 'rare', 'grid'],
    ['avatar', 'Знак «エ»', 'common', 'エ'],
    ['title', 'Онгоинг-дозор', 'rare', 'Онгоинг-дозор'],
    ['avatar', 'Знак «オ»', 'common', 'オ'],
    ['title', 'Каталогизатор', 'common', 'Каталогизатор'],
    ['background', 'Полосы', 'rare', 'stripes'],
    ['avatar', 'Знак «カ»', 'common', 'カ'],
    ['title', 'Знаток жанров', 'rare', 'Знаток жанров'],
    ['avatar', 'Знак «キ»', 'common', 'キ'],
    ['title', 'Полуночник', 'common', 'Полуночник'],
    ['frame', 'Двойная рамка', 'epic', 'double'],
    ['avatar', 'Знак «ク»', 'common', 'ク'],
    ['title', 'Хранитель закладок', 'common', 'Хранитель закладок'],
    ['avatar', 'Знак «ケ»', 'common', 'ケ'],
    ['title', 'Сезонный ветеран', 'rare', 'Сезонный ветеран'],
    ['avatar', 'Знак «コ»', 'common', 'コ'],
    ['title', 'Тот, кто дошёл до титров', 'rare', 'Тот, кто дошёл до титров'],
    ['avatar', 'Знак «サ»', 'common', 'サ'],
    ['title', 'Ловец новых серий', 'common', 'Ловец новых серий'],
    ['avatar', 'Знак «シ»', 'common', 'シ'],
    ['title', 'Архивариус', 'rare', 'Архивариус'],
    ['avatar', 'Знак «ス»', 'common', 'ス'],
    ['title', 'Первая сотня', 'rare', 'Первая сотня'],
    ['avatar', 'Знак «セ»', 'common', 'セ'],
    ['title', 'Смотрящий насквозь', 'epic', 'Смотрящий насквозь'],
    ['avatar', 'Знак «ソ»', 'common', 'ソ'],
    ['title', 'Тихий рекомендатель', 'common', 'Тихий рекомендатель'],
    ['avatar', 'Знак «タ»', 'common', 'タ'],
    ['title', 'Куратор подборок', 'rare', 'Куратор подборок'],
    ['avatar', 'Знак «チ»', 'common', 'チ'],
    ['title', 'Сотня эпизодов', 'epic', 'Сотня эпизодов'],
    ['avatar', 'Знак «ツ»', 'common', 'ツ'],
    ['title', 'Голос за кадром', 'common', 'Голос за кадром'],
    ['avatar', 'Знак «テ»', 'common', 'テ'],
    ['title', 'Знающий финалы', 'rare', 'Знающий финалы'],
    ['avatar', 'Знак «ト»', 'common', 'ト'],
    ['title', 'Держатель нулевого слоя', 'epic', 'Держатель нулевого слоя'],
    ['avatar', 'Знак «ナ»', 'common', 'ナ'],
    ['title', 'Смотритель сезона', 'rare', 'Смотритель сезона'],
    ['avatar', 'Знак «ニ»', 'common', 'ニ'],
    ['title', 'Пересматривающий', 'common', 'Пересматривающий'],
    ['avatar', 'Знак «ヌ»', 'common', 'ヌ'],
    ['title', 'Дошедший до слоя ноль', 'epic', 'Дошедший до слоя ноль'],
    ['avatar', 'Знак «ネ»', 'common', 'ネ'],
    ['title', 'Кабаний глич', 'myth', 'Кабаний глич'],
    ['frame', 'Кабаний глич', 'myth', 'glitch']
  ];

  var REWARDS = RAW.map(function (r, i) {
    var level = i === RAW.length - 1 || i === RAW.length - 2 ? MAX_LEVEL : Math.max(2, Math.round(((i + 1) * (MAX_LEVEL - 3)) / RAW.length) + 1);
    return {
      id: r[0] + '_' + i,
      kind: r[0],
      name: r[1],
      rarity: r[2],
      value: r[3],
      level: level
    };
  });

  var QUESTS = [
    { id: 'd_ep', scope: 'daily', name: 'Посмотреть серию', unit: 'серия', target: 1, xp: 60 },
    { id: 'd_min', scope: 'daily', name: 'Смотреть 20 минут', unit: 'мин', target: 20, xp: 80 },
    { id: 'd_cat', scope: 'daily', name: 'Собрать подборку в каталоге', unit: 'подборка', target: 1, xp: 40 },
    { id: 'w_ep', scope: 'weekly', name: 'Пять серий за неделю', unit: 'серия', target: 5, xp: 220 },
    { id: 'w_titles', scope: 'weekly', name: 'Три разных тайтла за неделю', unit: 'тайтл', target: 3, xp: 180 }
  ];

  function levelNeed(level) {
    return 100 + (level - 1) * 40;
  }

  function emptyData() {
    return {
      xp: 0,
      equip: { title: null, frame: null, avatar: null, background: null },
      stats: { episodes: 0, seconds: 0, titles: [] },
      quests: { dayKey: '', weekKey: '', prog: {}, done: {}, weekTitles: [] }
    };
  }

  function read() {
    var d;
    try {
      d = JSON.parse(localStorage.getItem(LS) || 'null');
    } catch (e) {
      d = null;
    }
    if (!d || typeof d !== 'object') d = emptyData();
    var base = emptyData();
    d.xp = Number(d.xp) || 0;
    d.equip = Object.assign(base.equip, d.equip || {});
    d.stats = Object.assign(base.stats, d.stats || {});
    if (!Array.isArray(d.stats.titles)) d.stats.titles = [];
    d.quests = Object.assign(base.quests, d.quests || {});
    if (!d.quests.prog || typeof d.quests.prog !== 'object') d.quests.prog = {};
    if (!d.quests.done || typeof d.quests.done !== 'object') d.quests.done = {};
    if (!Array.isArray(d.quests.weekTitles)) d.quests.weekTitles = [];
    return d;
  }

  var data = read();
  var listeners = [];

  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify(data));
    } catch (e) {
      /* приватный режим или переполненное хранилище — просто не сохраняем */
    }
  }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function weekKey(d) {
    d = d || new Date();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (t.getDay() + 6) % 7;
    t.setDate(t.getDate() - day);
    return t.getFullYear() + '-w' + (t.getMonth() + 1) + '-' + t.getDate();
  }

  function rollQuests() {
    var dk = dayKey();
    var wk = weekKey();
    var changed = false;
    if (data.quests.dayKey !== dk) {
      data.quests.dayKey = dk;
      QUESTS.forEach(function (q) {
        if (q.scope === 'daily') {
          data.quests.prog[q.id] = 0;
          data.quests.done[q.id] = false;
        }
      });
      changed = true;
    }
    if (data.quests.weekKey !== wk) {
      data.quests.weekKey = wk;
      data.quests.weekTitles = [];
      QUESTS.forEach(function (q) {
        if (q.scope === 'weekly') {
          data.quests.prog[q.id] = 0;
          data.quests.done[q.id] = false;
        }
      });
      changed = true;
    }
    if (changed) save();
  }

  function levelFromXp(xp) {
    var level = 1;
    var rest = xp;
    while (level < MAX_LEVEL && rest >= levelNeed(level)) {
      rest -= levelNeed(level);
      level += 1;
    }
    return { level: level, into: level >= MAX_LEVEL ? levelNeed(MAX_LEVEL) : rest, need: levelNeed(level) };
  }

  function unlockedIds(level) {
    return REWARDS.filter(function (r) {
      return r.level <= level;
    }).map(function (r) {
      return r.id;
    });
  }

  function emit(event) {
    listeners.forEach(function (fn) {
      try {
        fn(event);
      } catch (e) {
        /* один сломанный слушатель не должен ломать остальных */
      }
    });
  }

  function addXp(amount, reason) {
    amount = Math.round(Number(amount) || 0);
    if (amount <= 0) return;
    var before = levelFromXp(data.xp).level;
    data.xp += amount;
    var after = levelFromXp(data.xp).level;
    save();
    emit({ type: 'xp', amount: amount, reason: reason || '' });
    if (after > before) {
      var gained = REWARDS.filter(function (r) {
        return r.level > before && r.level <= after;
      });
      emit({ type: 'level', level: after, rewards: gained });
    }
  }

  function bump(id, by) {
    rollQuests();
    var quest = QUESTS.filter(function (q) {
      return q.id === id;
    })[0];
    if (!quest || data.quests.done[id]) return;
    var value = (Number(data.quests.prog[id]) || 0) + (by == null ? 1 : by);
    data.quests.prog[id] = Math.min(value, quest.target);
    if (data.quests.prog[id] >= quest.target) {
      data.quests.done[id] = true;
      save();
      addXp(quest.xp, 'quest');
      emit({ type: 'quest', quest: quest });
      return;
    }
    save();
  }

  var api = {
    RARITY_NAME: RARITY_NAME,
    KIND_NAME: KIND_NAME,
    MAX_LEVEL: MAX_LEVEL,

    subscribe: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },

    state: function () {
      rollQuests();
      var lv = levelFromXp(data.xp);
      return {
        xp: data.xp,
        level: lv.level,
        into: lv.into,
        need: lv.need,
        pct: Math.min(100, Math.round((lv.into / lv.need) * 100)),
        equip: Object.assign({}, data.equip),
        stats: {
          episodes: data.stats.episodes,
          minutes: Math.floor(data.stats.seconds / 60),
          titles: data.stats.titles.length,
          unlocked: unlockedIds(lv.level).length,
          total: REWARDS.length
        },
        quests: QUESTS.map(function (q) {
          return {
            id: q.id,
            scope: q.scope,
            name: q.name,
            unit: q.unit,
            target: q.target,
            xp: q.xp,
            progress: Math.min(q.target, Number(data.quests.prog[q.id]) || 0),
            done: !!data.quests.done[q.id]
          };
        })
      };
    },

    rewards: function () {
      var level = levelFromXp(data.xp).level;
      return REWARDS.map(function (r) {
        return Object.assign({}, r, {
          unlocked: r.level <= level,
          equipped: data.equip[r.kind] === r.id
        });
      });
    },

    nextReward: function () {
      var level = levelFromXp(data.xp).level;
      return (
        REWARDS.filter(function (r) {
          return r.level > level;
        })[0] || null
      );
    },

    equip: function (id) {
      var level = levelFromXp(data.xp).level;
      var item = REWARDS.filter(function (r) {
        return r.id === id;
      })[0];
      if (!item || item.level > level) return false;
      data.equip[item.kind] = data.equip[item.kind] === id ? null : id;
      save();
      emit({ type: 'equip', item: item });
      return true;
    },

    equipped: function (kind) {
      var id = data.equip[kind];
      if (!id) return null;
      return (
        REWARDS.filter(function (r) {
          return r.id === id;
        })[0] || null
      );
    },

    /* Хуки из плеера и навигации */
    onWatchSeconds: function (seconds) {
      seconds = Math.max(0, Math.round(Number(seconds) || 0));
      if (!seconds) return;
      rollQuests();
      var before = Math.floor(data.stats.seconds / 60);
      data.stats.seconds += seconds;
      var after = Math.floor(data.stats.seconds / 60);
      save();
      if (after > before) {
        bump('d_min', after - before);
        addXp(after - before, 'watch');
      }
    },

    onEpisodeDone: function (titleId) {
      rollQuests();
      data.stats.episodes += 1;
      save();
      addXp(50, 'episode');
      bump('d_ep', 1);
      bump('w_ep', 1);
      if (titleId != null) {
        var key = String(titleId);
        if (data.quests.weekTitles.indexOf(key) === -1) {
          data.quests.weekTitles.push(key);
          save();
          bump('w_titles', 1);
        }
      }
    },

    onTitleOpen: function (titleId) {
      if (titleId == null) return;
      var key = String(titleId);
      if (data.stats.titles.indexOf(key) !== -1) return;
      data.stats.titles.push(key);
      if (data.stats.titles.length > 500) data.stats.titles.shift();
      save();
      addXp(10, 'title');
    },

    onCatalogFilter: function () {
      bump('d_cat', 1);
    },

    exportData: function () {
      return JSON.stringify(data);
    },

    reset: function () {
      data = emptyData();
      save();
      emit({ type: 'reset' });
    }
  };

  global.Gamify = api;
})(window);
