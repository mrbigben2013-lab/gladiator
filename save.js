// ==================== СОХРАНЕНИЯ ====================
// Отдельный модуль: сериализация состояния, 5 независимых слотов,
// автосохранение в активный слот и финальная проверка «игра окончена».
//
// Правила:
//  • Сохраняем только данные (никаких canvas и DOM).
//  • Версия формата обязательна — иначе старые сейвы ломают игру.
//  • Слотов ровно 5. Каждый — свой ключ в localStorage.
//  • Игра заканчивается, когда отряд мёртв И денег не хватает
//    ни на одного гладиатора, ни на одного пса.

const SAVE_VERSION = 1;
const SAVE_SLOTS = 5;
const SAVE_KEY_PREFIX = 'gladiator_arena_slot_';
const SAVE_ACTIVE_KEY = 'gladiator_arena_active_slot';

const Save = (() => {
  let timer = null;
  let lastError = null;
  let available = true;

  function storage() {
    try {
      const s = window.localStorage;
      const probe = '__ga_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      available = false;
      return null;
    }
  }

  function slotKey(slot) {
    return SAVE_KEY_PREFIX + slot;
  }

  function validSlot(slot) {
    const n = parseInt(slot, 10);
    return n >= 1 && n <= SAVE_SLOTS ? n : 0;
  }

  // Что именно попадает в сейв. Список явный, чтобы не тащить мусор.
  function snapshot() {
    const S = typeof STATE !== 'undefined' ? STATE : null;
    if (!S) return null;
    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      gold: S.gold,
      fame: S.fame,
      day: S.day,
      wins: S.wins || 0,
      losses: S.losses || 0,
      roster: S.roster || [],
      inventory: S.inventory || [],
      squad: S.squad || [],
      recruits: S.recruits || [],
      dogs: S.dogs || [],
      kennelStock: S.kennelStock || [],
      selectedGladId: S.selectedGladId,
      modeSel: S.modeSel || 'auto',
      shopTab: S.shopTab || 'weapon',
      shopCat: S.shopCat || 'sword',
      armorCat: S.armorCat || 'offhand',
      gearFilter: S.gearFilter || 'all',
      payWith: S.payWith || 'gold',
      training: S.training || {},
      story: S.story || { step: 0, motherHealed: false, seen: [] },
      bossesBeaten: S.bossesBeaten || [],
      lastArenaId: S.lastArenaId || null,
      battleCount: S.battleCount || 0,
      lastEventBattle: S.lastEventBattle,
      eventHistory: (typeof EVENTS_RUNTIME !== 'undefined') ? (EVENTS_RUNTIME.history || []) : [],
      goalsCollapsed: !!S.goalsCollapsed,
      gameOver: !!S.gameOver,
      regenAt: S.regenAt || 0,
      regen: S.regen || {}
    };
  }

  function restore(data) {
    const S = typeof STATE !== 'undefined' ? STATE : null;
    if (!S || !data || typeof data !== 'object') return false;
    if (data.v !== SAVE_VERSION) return false;

    S.gold = Number(data.gold) || 0;
    S.fame = Number(data.fame) || 0;
    S.day = Number(data.day) || 1;
    S.wins = Number(data.wins) || 0;
    S.losses = Number(data.losses) || 0;
    S.roster = Array.isArray(data.roster) ? data.roster : [];
    S.inventory = Array.isArray(data.inventory) ? data.inventory : [];
    S.squad = Array.isArray(data.squad) ? data.squad : [];
    S.recruits = Array.isArray(data.recruits) ? data.recruits : [];
    S.dogs = Array.isArray(data.dogs) ? data.dogs : [];
    S.kennelStock = Array.isArray(data.kennelStock) ? data.kennelStock : [];
    S.selectedGladId = data.selectedGladId || null;
    S.modeSel = data.modeSel || 'auto';
    S.shopTab = data.shopTab || 'weapon';
    S.shopCat = data.shopCat || 'sword';
    S.armorCat = data.armorCat || 'offhand';
    S.gearFilter = data.gearFilter || 'all';
    S.payWith = data.payWith === 'fame' ? 'fame' : 'gold';
    // Тренировка хранится как {id: {prog, need}} — прогресс ритма в миллисекундах
    S.training = (data.training && typeof data.training === 'object') ? data.training : {};
    S.story = data.story || { step: 0, motherHealed: false, seen: [] };
    S.bossesBeaten = Array.isArray(data.bossesBeaten) ? data.bossesBeaten : [];
    S.lastArenaId = data.lastArenaId || null;
    S.battleCount = Number(data.battleCount) || 0;
    S.lastEventBattle = data.lastEventBattle == null ? undefined : Number(data.lastEventBattle);
    S.goalsCollapsed = !!data.goalsCollapsed;
    S.gameOver = !!data.gameOver;
    S.regen = (data.regen && typeof data.regen === 'object') ? data.regen : {};

    if (typeof EVENTS_RUNTIME !== 'undefined') {
      EVENTS_RUNTIME.history = Array.isArray(data.eventHistory) ? data.eventHistory : [];
      EVENTS_RUNTIME.pending = null;
      EVENTS_RUNTIME.lastId = null;
    }

    // Чиним то, что могло сломаться в старом сейве
    S.roster.forEach(g => {
      if (typeof ensureLimbs === 'function') ensureLimbs(g);
      if (!g.equip) g.equip = { weapon: null, offhand: null, head: null, body: null, arms: null, legs: null };
      if (g.isDog) g.aiRole = 'melee';
    });
    S.dogs.forEach(d => {
      if (typeof ensureLimbs === 'function') ensureLimbs(d);
      if (!d.equip) d.equip = { weapon: null, offhand: null, head: null, body: null, arms: null, legs: null };
      // В старых сейвах у псов не было ячейки под попону
      if (d.equip.doggear === undefined) d.equip.doggear = null;
      d.isDog = true;
      d.aiRole = 'melee';
    });

    // Офлайн-регенерация: пока игра была закрыта, бойцы тоже заживали.
    // Засчитываем прошедшее время, но не больше полного цикла (10 мин).
    if (typeof applyRegen === 'function' && data.savedAt) {
      const elapsed = Date.now() - Number(data.savedAt);
      if (elapsed > 0) applyRegen(Math.min(elapsed, 10 * 60 * 1000));
    }
    S.regenAt = Date.now();
    return true;
  }

  // --- Запись / чтение конкретного слота ---
  function save(slot) {
    const st = storage();
    if (!st) return false;
    const n = validSlot(slot != null ? slot : (typeof STATE !== 'undefined' ? STATE.slot : 0));
    if (!n) return false;
    const data = snapshot();
    if (!data) return false;
    try {
      st.setItem(slotKey(n), JSON.stringify(data));
      st.setItem(SAVE_ACTIVE_KEY, String(n));
      if (typeof STATE !== 'undefined') STATE.slot = n;
      lastError = null;
      return true;
    } catch (e) {
      lastError = e;
      return false;
    }
  }

  function readSlot(slot) {
    const st = storage();
    const n = validSlot(slot);
    if (!st || !n) return null;
    try {
      const raw = st.getItem(slotKey(n));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      lastError = e;
      return null;
    }
  }

  function load(slot) {
    const n = validSlot(slot != null ? slot : activeSlot());
    if (!n) return false;
    const data = readSlot(n);
    if (!data) return false;
    if (!restore(data)) return false;
    if (typeof STATE !== 'undefined') STATE.slot = n;
    const st = storage();
    if (st) { try { st.setItem(SAVE_ACTIVE_KEY, String(n)); } catch (e) {} }
    return true;
  }

  function remove(slot) {
    const st = storage();
    const n = validSlot(slot);
    if (!st || !n) return false;
    try {
      st.removeItem(slotKey(n));
      if (activeSlot() === n) st.removeItem(SAVE_ACTIVE_KEY);
      return true;
    } catch (e) {
      lastError = e;
      return false;
    }
  }

  function exists(slot) {
    return !!readSlot(slot);
  }

  // Краткая карточка слота для стартового экрана
  function info(slot) {
    const n = validSlot(slot);
    const data = readSlot(n);
    if (!data) return { slot: n, empty: true };
    const roster = Array.isArray(data.roster) ? data.roster : [];
    const dogs = Array.isArray(data.dogs) ? data.dogs : [];
    const leader = roster[0] || null;
    return {
      slot: n,
      empty: false,
      gold: Number(data.gold) || 0,
      fame: Number(data.fame) || 0,
      day: Number(data.day) || 1,
      wins: Number(data.wins) || 0,
      losses: Number(data.losses) || 0,
      fighters: roster.length + dogs.length,
      leaderName: leader ? leader.name : '—',
      leaderLevel: leader ? leader.level : 0,
      savedAt: Number(data.savedAt) || 0,
      gameOver: !!data.gameOver
    };
  }

  function list() {
    const out = [];
    for (let i = 1; i <= SAVE_SLOTS; i++) out.push(info(i));
    return out;
  }

  function hasAny() {
    for (let i = 1; i <= SAVE_SLOTS; i++) if (exists(i)) return true;
    return false;
  }

  // Автосохранение с задержкой: не чаще, чем раз в 1.2 с
  function autosave() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      save();
    }, 1200);
  }

  function clear() {
    for (let i = 1; i <= SAVE_SLOTS; i++) remove(i);
  }

  function activeSlot() {
    const st = storage();
    if (!st) return 0;
    try { return validSlot(st.getItem(SAVE_ACTIVE_KEY)); } catch (e) { return 0; }
  }

  return {
    save, load, remove, exists, info, list, hasAny, clear,
    autosave, snapshot, restore, activeSlot, slotKey,
    get available() { return available; },
    get lastError() { return lastError; },
    SLOTS: SAVE_SLOTS,
    VERSION: SAVE_VERSION
  };
})();

// ==================== КОНЕЦ ИГРЫ ====================
// Игра заканчивается, когда выполняется ВСЁ сразу:
//   • в живых нет ни одного бойца (в казарме, отряде и псарне),
//   • денег не хватает на самого дешёвого гладиатора в таверне,
//   • денег не хватает на самого дешёвого пса в псарне.
// Тогда продолжать нечем: ни бойцов, ни способа их купить.
function cheapestRecruitCost() {
  const list = (STATE.recruits || []).map(r => r.cost || 9999);
  // Если таверна пуста — считаем по самому дешёвому происхождению
  if (!list.length && typeof BACKGROUNDS !== 'undefined') {
    return Math.min(...BACKGROUNDS.map(b => b.cost));
  }
  return list.length ? Math.min(...list) : 9999;
}

function cheapestDogCost() {
  const stock = (STATE.kennelStock || []).map(d => d.cost || 9999);
  if (!stock.length && typeof DOG_BREEDS !== 'undefined') {
    return Math.min(...DOG_BREEDS.map(b => b.cost));
  }
  return stock.length ? Math.min(...stock) : 9999;
}

function aliveFighters() {
  const roster = (STATE.roster || []).filter(g => g && g.hp > 0);
  const dogs = (STATE.dogs || []).filter(d => d && d.hp > 0);
  return roster.concat(dogs);
}

function isGameOver() {
  if (STATE.gameOver) return true;
  if (aliveFighters().length > 0) return false;
  // Есть раненые, но живые? Их можно вылечить — это не конец.
  const wounded = (STATE.roster || []).filter(g => g && g.hp <= 0 && !g.dead)
    .concat((STATE.dogs || []).filter(d => d && d.hp <= 0 && !d.dead));
  if (wounded.length) return false;

  const gold = STATE.gold || 0;
  const canHireGlad = gold >= cheapestRecruitCost();
  const canHireDog = gold >= cheapestDogCost();
  return !canHireGlad && !canHireDog;
}

function checkGameOver() {
  if (STATE.gameOver) return true;
  if (!isGameOver()) return false;
  STATE.gameOver = true;
  if (typeof Save !== 'undefined') Save.save();
  if (typeof showGameOver === 'function') showGameOver();
  return true;
}
