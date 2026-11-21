// ==================== БОЙ ====================
// Одна линия, вид сбоку, до 3 бойцов с каждой стороны.
// Управление — панель внутри арены. Клик по врагу открывает выбор конечности.
// Конечности изнашиваются и отрубаются навсегда. Смерть постоянная.

const STEPS = 18;
const STEP_W = 108;
const MARGIN = 170;
const WORLD_W = MARGIN * 2 + (STEPS - 1) * STEP_W;
const GROUND = 420;
const MAX_AP = 9;
const STEP_COST = 1;
const STANCE_COST = 2;
const DODGE_COST = 1;
const SWAP_COST = 1;
const DASH_STEPS = 3;
const UNIT_SCALE = 0.98;

const PLAYER_HOME = [7, 5, 3];
const ENEMY_HOME = [10, 12, 14];

const COMBAT = {
  active: false,
  raf: null,
  round: 1,
  phase: 'player',
  mode: 'manual',
  units: [],
  activeId: null,
  arena: null,
  tier: null,
  matchName: '',
  rewards: null,
  heavyMode: false,
  busy: false,
  floats: [],
  particles: [],
  projectiles: [],
  stains: [],
  shake: 0,
  time: 0,
  lastTs: 0,
  hoverId: null,
  hoverStep: null,
  winChance: 0,
  cam: { focusX: WORLD_W / 2, scale: 1, init: false },
  over: false,
  backdrop: null,
  backdropKey: '',
  aim: null,
  menu: null,
  menuSide: 'left',
  flashes: [],
  rings: [],
  magic: [],
  bloodOverlay: 0,
  isBossFight: false,
  boss: null,
  bossBanner: 0,
  // --- Кликер-бой ---
  clicker: true,
  clock: 0,        // миллисекунды боя
  lastClick: 0
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const stepX = s => MARGIN + s * STEP_W;
const lerp = (a, b, t) => a + (b - a) * t;

// ==================== КОНЕЧНОСТИ ====================
function resetLimbs(glad) {
  glad.limbs = {};
  LIMB_DEFS.forEach(l => {
    const mx = Math.max(6, Math.round((glad.maxHp || 60) * l.hpShare));
    glad.limbs[l.id] = { hp: mx, max: mx, lost: false };
  });
  return glad.limbs;
}

function ensureLimbs(glad) {
  if (!glad.limbs) return resetLimbs(glad);
  LIMB_DEFS.forEach(l => {
    if (!glad.limbs[l.id]) {
      const mx = Math.max(6, Math.round((glad.maxHp || 60) * l.hpShare));
      glad.limbs[l.id] = { hp: mx, max: mx, lost: false };
    }
  });
  return glad.limbs;
}

function lostLimbs(glad) {
  const out = [];
  LIMB_DEFS.forEach(l => { if (glad.limbs && glad.limbs[l.id] && glad.limbs[l.id].lost) out.push(l.id); });
  return out;
}

// ==================== СТАТЫ ====================
// Клыки пса: короткая дистанция, высокий шанс попадания, малое пробитие.
const DOG_WEAPON = {
  name: 'Клыки', shape: 'fist', cat: 'melee',
  dmgMin: 7, dmgMax: 13, range: 1, apCost: 3, hitMod: 14, armorPen: 0.12
};

function unitStatsFromGlad(glad) {
  const eq = glad.equip || {};
  const attrs = (typeof effectiveAttrs === 'function' && !glad.isDog)
    ? effectiveAttrs(glad)
    : (glad.attrs || { str: 5, dex: 5, vit: 5, sta: 5, wil: 5 });
  const armorHead = eq.head ? eq.head.armor : 0;
  const armorArms = eq.arms ? eq.arms.armor : 0;
  const armorLegs = eq.legs ? eq.legs.armor : 0;
  // У пса вместо человеческих доспехов — своя попона/нагрудник
  const armorBody = (eq.body ? eq.body.armor : 0) + Math.round((armorArms + armorLegs) * 0.35)
    + (glad.isDog && eq.doggear ? (eq.doggear.armor || 0) : 0);
  // В левой руке может быть щит ИЛИ второй клинок
  const offItem = eq.offhand || null;
  const offShield = offItem && offItem.slot === 'offhand' ? offItem : null;
  // Парный набор держат в двух руках: у него второй клинок «встроен»
  const offWeapon = offItem && offItem.slot === 'weapon' ? offItem
    : (eq.weapon && eq.weapon.dualPair ? eq.weapon : null);
  const armorShield = offShield ? (offShield.armor || 0) : 0;
  const def = (glad.def || 0) + (offShield ? (offShield.defBonus || 0) : 0) + Math.round(attrs.wil * 0.5);

  // У пса нет снаряжения — только клыки. Дистанция зависит от породы.
  let weapon;
  if (glad.isDog) {
    const reach = glad.breedId === 'wolfhound' ? 2 : 1;
    weapon = Object.assign({}, DOG_WEAPON, {
      dmgMin: Math.round(DOG_WEAPON.dmgMin * (1 + (glad.atk || 40) / 260)),
      dmgMax: Math.round(DOG_WEAPON.dmgMax * (1 + (glad.atk || 40) / 260)),
      range: reach
    });
  } else {
    weapon = eq.weapon || { name: 'Кулаки', shape: 'fist', dmgMin: 4, dmgMax: 8, range: 1, apCost: 3, hitMod: 0, armorPen: 0.1 };
  }
  return { armorHead, armorBody, armorArms, armorLegs, armorShield, def, weapon, offWeapon };
}

function deriveRole(glad) {
  if (glad.isDog) return 'beast';
  if (glad.aiRole) return glad.aiRole;
  if (glad.magic) return 'mage';
  const w = glad.equip && glad.equip.weapon;
  if (w && isRangedWeapon(w)) return 'ranged';
  // Второй клинок в левой руке — это димахер, а не защитник
  const off = glad.equip && glad.equip.offhand;
  if (off && off.slot === 'offhand') return 'shield';
  // Парный набор тоже держат двумя руками, но роль остаётся «ближний бой»
  return 'melee';
}

// Иконка роли: у псов свой значок, у боссов — корона
function roleIcon(u) {
  if (u && u.boss) return '👑';
  const r = u && u.role;
  if (r === 'beast') return '🐕';
  return ROLE_ICONS[r] || '🗡️';
}

// Дальний бой = лук/арбалет (7 клеток). Копья бьют на 2, но остаются ближним боем.
function isRangedWeapon(w) {
  if (!w) return false;
  return w.cat === 'ranged' || w.cat === 'crossbow' || w.cat === 'bow' || w.range >= 7;
}


function unitPower(glad) {
  const st = unitStatsFromGlad(glad);
  const w = st.weapon;
  const attrs = glad.attrs || { str: 5, dex: 5, vit: 5, sta: 5, wil: 5 };
  const dps = ((w.dmgMin + w.dmgMax) / 2) * (1 + attrs.str * 0.05) / Math.max(1, w.apCost);
  // Второй клинок добавляет половину своего DPS: руки работают по очереди
  const off = st.offWeapon;
  const offDps = off ? ((off.dmgMin + off.dmgMax) / 2) * (1 + attrs.str * 0.05) / Math.max(1, off.apCost) * 0.5 : 0;
  let p = (glad.maxHp || 50) * 0.45 + (dps + offDps) * 5 + (st.def + st.armorHead + st.armorBody) * 0.35
    + attrs.dex * 1.2 + (isRangedWeapon(w) ? 10 : w.range >= 2 ? 4 : 0);
  const lost = lostLimbs(glad).length;
  p *= Math.max(0.35, 1 - lost * 0.16);
  if (glad.boss) p *= 1.15;
  return p;
}

function estimateWinChance(playerGlads, enemyUnits, tier) {
  if (!playerGlads.length || !enemyUnits.length) return 0;
  const pPow = playerGlads.reduce((s, g) => s + unitPower(g), 0);
  const ePow = enemyUnits.reduce((s, u) => s + unitPower(enemyUnitToGlad(u)), 0);
  const ratio = pPow / Math.max(1, ePow);
  let chance = 1 / (1 + Math.pow(0.45 / Math.max(0.01, ratio), 2.1));
  return clamp(3, 96, Math.round(chance * 100));
}

// Живой шанс победы ПО ХОДУ боя. Раньше на экране висела статичная цифра,
// снятая ещё до выхода на песок: она не менялась, даже когда отряд уже
// выбил двоих врагов или, наоборот, остался один. Это особенно вводило в
// заблуждение в автобое, где игрок смотрит в основном на неё.
// Теперь считаю силу по ФАКТИЧЕСКОМУ состоянию: текущее HP, утраченные
// конечности и выбывшие из боя бойцы.
function liveWinChance() {
  if (!COMBAT.active) return 0;
  const alive = side => COMBAT.units.filter(u => u.side === side && u.alive && !u.fled);
  const pAlive = alive('player');
  const eAlive = alive('enemy');
  if (!pAlive.length) return 0;
  if (!eAlive.length) return 100;
  const power = u => {
    const g = u.glad;
    const hpFrac = clamp01((g.hp || 0) / Math.max(1, g.maxHp || 1));
    return Math.max(1, unitPower(g)) * (0.25 + 0.75 * hpFrac);
  };
  const pPow = pAlive.reduce((s, u) => s + power(u), 0);
  const ePow = eAlive.reduce((s, u) => s + power(u), 0);
  const ratio = pPow / Math.max(1, ePow);
  const chance = 1 / (1 + Math.pow(0.45 / Math.max(0.01, ratio), 2.1));
  return clamp(1, 99, Math.round(chance * 100));
}

// Подпись к проценту: объясняет, что именно означает цифра
function winChanceLabel(pct) {
  if (pct >= 70) return 'перевес на нашей стороне';
  if (pct >= 45) return 'шансы равны';
  if (pct >= 25) return 'приходится туго';
  return 'бой почти проигран';
}

// ==================== ЮНИТЫ ====================
function makeUnit(glad, side, step, id) {
  ensureLimbs(glad);
  const st = unitStatsFromGlad(glad);
  const attrs = (typeof effectiveAttrs === 'function' && !glad.isDog)
    ? effectiveAttrs(glad)
    : (glad.attrs || { str: 5, dex: 5, vit: 5, sta: 5, wil: 5 });
  const offItem = glad.equip ? glad.equip.offhand : null;
  // Щит — только если в левой руке именно щит, а не второй клинок
  const shield = offItem && offItem.slot === 'offhand' ? offItem : null;
  const lostLegs = ['legL', 'legR'].filter(k => glad.limbs[k] && glad.limbs[k].lost).length;

  // ⚡ Выносливость даёт очки действия, ловкость — тоже немного (скорость)
  const apFromSta = Math.floor((attrs.sta - 5) / 1.6);
  const apFromDex = attrs.dex >= 11 ? 1 : 0;
  // Тяжёлый доспех отнимает ОД, удобный — добавляет
  const apFromGear = (typeof equipApModifier === 'function') ? equipApModifier(glad) : 0;
  const maxAp = MAX_AP + apFromSta + apFromDex + apFromGear - lostLegs;

  const u = {
    id, side, glad,
    role: deriveRole(glad),
    step,
    drawStep: step,
    ap: maxAp, maxAp: Math.max(3, maxAp),
    armorHead: st.armorHead, maxArmorHead: Math.max(1, st.armorHead),
    armorBody: st.armorBody, maxArmorBody: Math.max(1, st.armorBody),
    armorArms: st.armorArms, armorLegs: st.armorLegs,
    armorShield: st.armorShield, maxArmorShield: Math.max(1, st.armorShield),
    def: st.def,
    weapon: st.weapon,
    // Второй клинок в левой руке (димахер или любой одноручный в пару)
    offWeapon: st.offWeapon || null,
    shield: (glad.equip && glad.equip.offhand && glad.equip.offhand.slot === 'offhand') ? glad.equip.offhand : null,
    // 🤸 Ловкость — уклонение. 🧠 Воля — стойкость к урону
    evasion: clamp(2 + attrs.dex * 2.6, 3, 46),
    // Блок = щит + особое устройство оружия (широкая гарда, крюк, древко)
    blockChance: clamp(
      (shield ? 6 + shield.defBonus * 1.1 + attrs.sta * 0.6 + attrs.wil * 0.4 : 0)
      + (st.weapon && st.weapon.parryChance ? st.weapon.parryChance : 0), 0, 68),
    // 💪 Сила и ❤️ телосложение — множитель урона
    dmgMul: 0.7 + attrs.str * 0.06,
    // 🧠 Воля снижает входящий урон
    drMul: clamp(1 - (attrs.wil - 5) * 0.018, 0.78, 1.16),
    stance: null,
    alive: true,
    boss: !!glad.boss,
    limbs: glad.limbs,
    hitPenalty: 0,
    // Две руки по очереди: после удара правой бьёт левая
    hand: 'right',
    anim: { swing: 0, lunge: 0, hurt: 0, block: 0, dodge: 0, walk: 0, dead: 0, victory: 0, walkPhase: 0 },
    tAnim: { swing: 0, lunge: 0, hurt: 0, block: 0, dodge: 0, victory: 0 },
    spellCd: {},
    magicSchool: (glad.magic && MAGIC_SCHOOLS[glad.magic]) ? glad.magic : null
  };
  recalcUnit(u);
  applyRoleBonus(u);
  applyClassBonus(u);
  applySkillBonus(u);
  return u;
}

// Особый перк класса: не роль, а школа арены. Работает поверх роли.
function applyClassBonus(u) {
  const g = u.glad || {};
  const cls = g.cls && typeof classById === 'function' ? classById(g.cls) : null;
  if (!cls) return;
  const m = cls.mods || {};
  if (m.blockBonus) u.blockChance = Math.min(85, (u.blockChance || 0) + m.blockBonus);
  if (m.armorBonus) {
    u.armorBody = Math.max(0, u.armorBody + m.armorBonus);
    u.maxArmorBody = Math.max(1, u.maxArmorBody + m.armorBonus);
  }
  if (m.evasionBonus) u.evasion = (u.evasion || 0) + m.evasionBonus;
  if (m.evasionMul) u.evasion = (u.evasion || 0) * m.evasionMul;
  if (m.defBonus) u.def = (u.def || 0) + m.defBonus;
  if (m.dmgMul) u.dmgMul = (u.dmgMul || 1) * m.dmgMul;
  if (m.hitBonus) u.hitBonus = (u.hitBonus || 0) + m.hitBonus;
  if (m.drMul) u.drMul = (u.drMul || 1) * m.drMul;
  if (m.apBonus) {
    u.maxAp = Math.max(3, u.maxAp + m.apBonus);
    u.ap = Math.max(1, Math.min(u.ap, u.maxAp));
  }
  if (m.doubleStrike) u.doubleStrike = m.doubleStrike;
  if (m.beastDmgMul) u.beastDmgMul = m.beastDmgMul;
  if (m.firstStrikeMul) u.firstStrikeMul = m.firstStrikeMul;
  if (m.legDmgMul) u.legDmgMul = m.legDmgMul;
  if (m.limbDmgMul) u.limbDmgMul = m.limbDmgMul;
  u.className = cls.name;
}

// Навыки, выбранные каждые 3 уровня, суммируются как небольшие постоянные бонусы
function applySkillBonus(u) {
  const g = u.glad || {};
  const ids = g.skills || [];
  if (!ids.length || typeof skillById !== 'function') return;
  ids.forEach(id => {
    const s = skillById(id);
    if (!s || !s.mods) return;
    const m = s.mods;
    if (m.blockBonus) u.blockChance = Math.min(88, (u.blockChance || 0) + m.blockBonus);
    if (m.armorBonus) {
      u.armorBody = Math.max(0, u.armorBody + m.armorBonus);
      u.maxArmorBody = Math.max(1, u.maxArmorBody + m.armorBonus);
    }
    if (m.evasionBonus) u.evasion = (u.evasion || 0) + m.evasionBonus;
    if (m.defBonus) u.def = (u.def || 0) + m.defBonus;
    if (m.dmgMul) u.dmgMul = (u.dmgMul || 1) * m.dmgMul;
    if (m.hitBonus) u.hitBonus = (u.hitBonus || 0) + m.hitBonus;
    if (m.drMul) u.drMul = (u.drMul || 1) * m.drMul;
    if (m.apBonus) {
      u.maxAp = Math.max(3, u.maxAp + m.apBonus);
      u.ap = Math.max(1, Math.min(u.ap, u.maxAp));
    }
    if (m.penBonus) u.weapon.armorPen = Math.min(0.9, (u.weapon.armorPen || 0) + m.penBonus);
    if (m.firstStrikeMul) u.firstStrikeMul = (u.firstStrikeMul || 1) * m.firstStrikeMul;
    if (m.legDmgMul) u.legDmgMul = (u.legDmgMul || 1) * m.legDmgMul;
    if (m.limbDmgMul) u.limbDmgMul = (u.limbDmgMul || 1) * m.limbDmgMul;
  });
}

// ==================== ПОТЕРЯ РУКИ И ОРУЖИЕ ====================
// Рука отрублена — оружие из неё падает, но не пропадает: оно уходит
// в инвентарь. Удар потерянной рукой (или кулаком без руки) бьёт на 1.
function dropWeaponFromLimb(glad, limbId) {
  if (!glad || glad.isDog || !glad.equip) return;
  const slots = [];
  if (limbId === 'armR') slots.push('weapon');
  if (limbId === 'armL') slots.push('offhand');
  slots.forEach(slot => {
    const it = glad.equip[slot];
    if (!it) return;
    glad.equip[slot] = null;
    if (typeof STATE !== 'undefined' && STATE.inventory) {
      STATE.inventory.push(Object.assign({}, it, {
        uid: it.uid || ('i_' + Math.random().toString(36).substr(2, 9))
      }));
    }
    if (typeof addLog === 'function') {
      addLog(`🗡️ <b>${glad.name}</b> роняет «${it.name}» — оружие подобрано и лежит в складе.`, 'log-warn');
    }
  });
}

// Бьёт ли боец рукой, которой у него уже нет
function strikesWithLostArm(u) {
  if (!u || !u.glad || u.glad.isDog) return false;
  const L = u.glad.limbs || {};
  if (u.hand === 'left') return !!(L.armL && L.armL.lost);
  return !!(L.armR && L.armR.lost);
}

// Штрафы за утраченные конечности
function recalcUnit(u) {
  const L = u.limbs || {};
  const lostArmL = L.armL && L.armL.lost;
  const lostArmR = L.armR && L.armR.lost;
  const lostLegL = L.legL && L.legL.lost;
  const lostLegR = L.legR && L.legR.lost;
  const arms = (lostArmL ? 1 : 0) + (lostArmR ? 1 : 0);
  const legs = (lostLegL ? 1 : 0) + (lostLegR ? 1 : 0);
  const attrs = (typeof effectiveAttrs === 'function' && !u.glad.isDog)
    ? effectiveAttrs(u.glad)
    : (u.glad.attrs || {});
  const sta = attrs.sta || 5;
  const dex = attrs.dex || 5;
  const apGear = (typeof equipApModifier === 'function' && !u.glad.isDog) ? equipApModifier(u.glad) : 0;

  if (u.glad.isDog) {
    // У пса нет рук — только лапы и пасть. Потеря лапы бьёт по подвижности,
    // но урон от укуса не падает.
    u.dmgMul = 0.85 + (attrs.str || 4) * 0.055;
    u.hitPenalty = 0;
    u.maxAp = Math.max(3, MAX_AP + Math.floor((sta - 5) / 1.6) + (dex >= 11 ? 1 : 0) - legs);
    u.lostArms = 0;
    u.lostLegs = legs;
  } else {
    u.dmgMul = arms >= 2 ? 0.3 : arms === 1 ? (lostArmR ? 0.62 : 0.74) : 1;
    u.hitPenalty = arms >= 2 ? 18 : arms === 1 ? 8 : 0;
    // Базовый множитель урона от силы сохраняется после пересчёта
    u.dmgMul *= 0.7 + (attrs.str || 5) * 0.06;
    u.maxAp = Math.max(3, MAX_AP + Math.floor((sta - 5) / 1.6) + (dex >= 11 ? 1 : 0) + apGear - legs);
    u.lostArms = arms;
    u.lostLegs = legs;
  }
  u.ap = Math.min(u.ap, u.maxAp);
}

// Женские причёски и мужские разделены: «две косы» у бородатого громилы
// смотрятся как ошибка, а не как характер.
const FEMALE_HAIR = ['long', 'ponytail', 'braids', 'bun', 'curly', 'halfup', 'twinbraids', 'wavy', 'fringe', 'undercut', 'shaved'];
const MALE_HAIR = ['short', 'long', 'ponytail', 'braids', 'bun', 'mohawk', 'curly', 'dreadlocks', 'topknot', 'shaved', 'bald',
  'crew', 'slick', 'parted', 'fringe', 'spiky', 'afro', 'wavy', 'undercut'];

function randomOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Внешность врага рождается один раз и запоминается на самом юните.
// Иначе оценка шансов и выход на песок показывали бы разных людей.
function rollEnemyLook(u) {
  if (u._look) return u._look;
  const femaleNames = typeof NAMES_F !== 'undefined' ? NAMES_F : [];
  const firstName = String(u.name || '').split(' ')[0];
  // Пол привязан к имени: «Кувалда» женского облика с бородой не бывает.
  const female = femaleNames.indexOf(firstName) >= 0;
  const hairPool = female ? FEMALE_HAIR : MALE_HAIR;
  // Женщине бороду не рисуем, мужчине — по настроению: треть бойцов
  // гладко выбрита, остальные носят что-то на лице.
  let beard = 'none';
  if (!female) {
    const r = Math.random();
    beard = r < 0.34 ? 'none' : r < 0.5 ? 'stubble' : randomOf(BEARD_STYLES.map(s => s.id));
    if (beard === 'none' && r >= 0.34) beard = 'stubble';
  }
  u._look = {
    gender: female ? 'female' : 'male',
    build: randomOf(BUILDS).id,
    skin: randomOf(SKIN_TONES).color,
    hair: randomOf(HAIR_COLORS).color,
    hairStyle: randomOf(hairPool),
    // Полный набор черт лица, а не только овал: враги с одинаковой
    // формой лица всё равно должны выглядеть разными людьми.
    ...randomFaceLook(),
    beard: beard
  };
  return u._look;
}

function enemyUnitToGlad(u) {
  // Боссы приходят со своим готовым обликом, остальные — случайным.
  const look = u.look || rollEnemyLook(u);
  const g = {
    id: 'eg_' + Math.random().toString(36).substr(2, 6),
    name: u.name,
    bgTitle: u.title || ROLE_LABELS[u.role] || 'Боец',
    level: 1, xp: 0,
    hp: u.hp, maxHp: u.hp,
    atk: u.atk, def: u.def, agi: u.agi || 8,
    boss: !!u.boss,
    aura: u.aura || null,
    isDog: !!u.isDog,
    gender: look.gender,
    build: look.build,
    skinColor: look.skin,
    hairColor: look.hair,
    hairStyle: look.hairStyle,
    faceStyle: look.faceStyle,
    // Если у босса задан только овал, остальные черты берём по умолчанию:
    // eyeSetOf/noseSetOf/browSetOf/mouthSetOf сами подставят базовый набор.
    eyeStyle: look.eyeStyle,
    noseStyle: look.noseStyle,
    browStyle: look.browStyle,
    mouthStyle: look.mouthStyle,
    beardStyle: look.beard,
    colors: u.colors || null,
    attrs: {
      str: Math.round(u.atk / 12), dex: Math.round((u.agi || 8) / 1.5),
      vit: Math.round(u.hp / 20), sta: 5, wil: Math.round(u.def / 4) + 3
    },
    aiRole: u.role,
    equip: { weapon: null, offhand: null, head: null, body: null, arms: null, legs: null }
  };
  const map = { wId: 'weapon', oId: 'offhand', hId: 'head', bId: 'body', aId: 'arms', lId: 'legs' };
  Object.keys(map).forEach(k => { if (u[k]) g.equip[map[k]] = itemById(u[k]); });
  resetLimbs(g);
  return g;
}

// ==================== МАТЧ ====================
function arenaIndex(id) { return Math.max(0, ARENAS.findIndex(a => a.id === id)); }
function tierIndex(id) { return Math.max(0, ARENA_TIERS.findIndex(t => t.id === id)); }

// Арену выбрать нельзя: она выпадает случайно.
// Игрок выбирает только ступень сложности.
function rollArena(excludeId) {
  const pool = ARENAS.filter(a => a.id !== excludeId);
  const list = pool.length ? pool : ARENAS;
  const base = list[Math.floor(Math.random() * list.length)];
  // Фон боя — случайная фотография из набора. Подпись берём у фото,
  // остальные параметры (земля, стены) — у базовой арены.
  const bg = rollArenaBackground();
  return Object.assign({}, base, {
    photo: bg.file,
    name: bg.name,
    mood: bg.mood,
    bgId: base.id
  });
}

// Сколько противников выходит на песок. Меньше врагов — каждый из них сильнее.
function enemyCountFor(tierId) {
  const ti = tierIndex(tierId);
  if (ti === 0) return 3;          // разминка: полный строй
  if (ti === 1) return 3;          // средняя: тройка
  return 2;                        // невыносимая: пара закалённых
}

// Компенсация за малое число врагов: один боец дерётся как трое.
function enemyPowerScale(count) {
  if (count >= 3) return { hp: 1, atk: 1, def: 1 };
  if (count === 2) return { hp: 1.55, atk: 1.35, def: 1.22 };
  return { hp: 2.85, atk: 1.78, def: 1.45 };
}

// Позиции врагов на песке — строй сжимается к центру, если бойцов меньше.
function enemyStepsFor(count) {
  if (count >= 3) return ENEMY_HOME.slice();
  if (count === 2) return [11, 13];
  return [12];
}

// ==================== СНАРЯЖЕНИЕ ПРОТИВНИКОВ ====================
// Шаблон отряда задаёт роль и «породу» бойца, а вещи подбираются случайно
// из вилки тиров, привязанной к сложности арены. Так один и тот же отряд
// выходит на песок по-разному: то в коже и с дубиной, то в кольчуге.
const ENEMY_GEAR_TIERS = {
  low:    { min: 1, max: 2 },
  mid:    { min: 2, max: 3 },
  brutal: { min: 3, max: 5 }
};

// Вероятность, что у бойца вообще есть вещь в этом слоте.
const ENEMY_GEAR_FILL = {
  low:    { head: 0.5, body: 0.65, arms: 0.35, legs: 0.6 },
  mid:    { head: 0.72, body: 0.85, arms: 0.55, legs: 0.78 },
  brutal: { head: 0.92, body: 0.98, arms: 0.8, legs: 0.9 }
};

function gearPoolFor(slot, tiers, cat) {
  return itemsByCat(cat || slot).filter(i =>
    !i.bossItem && !i.dogOnly &&
    (i.tier || 1) >= tiers.min && (i.tier || 1) <= tiers.max);
}

function pickGear(pool) {
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// Подбирает снаряжение бойцу. Роль не ломаем: лучник остаётся с луком
// или арбалетом, щитовик — со щитом, двуручное в руки не даём.
function rollEnemyGear(u, tierId) {
  const tiers = ENEMY_GEAR_TIERS[tierId] || ENEMY_GEAR_TIERS.mid;
  const fill = ENEMY_GEAR_FILL[tierId] || ENEMY_GEAR_FILL.mid;
  const out = { wId: u.wId, oId: u.oId, hId: u.hId, bId: u.bId, aId: u.aId, lId: u.lId };
  const isRanged = u.role === 'ranged';
  const isShield = u.role === 'shield';

  // Оружие: та же категория, что в шаблоне
  const baseW = u.wId ? itemById(u.wId) : null;
  if (baseW) {
    const pool = gearPoolFor('weapon', tiers, baseW.cat)
      .filter(i => isRanged || !i.twoHanded);
    const w = pickGear(pool);
    if (w) out.wId = w.id;
  }

  // Щит: щитовику почти всегда, остальным — изредка
  if (isShield) {
    const s = pickGear(gearPoolFor('offhand', tiers));
    if (s) out.oId = s.id;
  } else if (!isRanged && Math.random() < 0.18) {
    const s = pickGear(gearPoolFor('offhand', tiers));
    if (s) out.oId = s.id;
  } else if (!isRanged) {
    out.oId = null;
  }

  // Броня по слотам
  const slotKeys = { head: 'hId', body: 'bId', arms: 'aId', legs: 'lId' };
  Object.keys(slotKeys).forEach(slot => {
    const key = slotKeys[slot];
    // Тело закрывают охотнее, чем руки: так силуэты врагов различаются
    const chance = Math.min(1, fill[slot] + (slot === 'body' ? 0.1 : 0));
    if (Math.random() > chance) { out[key] = null; return; }
    const it = pickGear(gearPoolFor(slot, tiers));
    if (it) out[key] = it.id;
  });

  return out;
}

// ==================== БОСС АРЕНЫ ====================
// Босс выходит один на один: никакой свиты, никаких прислужников.
// Сложность босс-боя фиксирована — игрок её не выбирает, всё решает
// лестница боссов (5 / 20 / 40 / 65 / 100 побед).
const BOSS_TIER_ID = 'mid';

function bossFightTier() {
  return ARENA_TIERS.find(t => t.id === BOSS_TIER_ID) || ARENA_TIERS[1];
}

function buildBossMatch(boss, tierId) {
  // Сложность игнорируется: у босса всегда свой, фиксированный бой
  const tier = bossFightTier();
  const arena = rollArena(STATE.lastArenaId);
  const eq = boss.equip || {};

  const unit = {
    name: boss.name,
    title: boss.title,
    role: 'melee',
    hp: Math.round(boss.hp),
    atk: Math.round(boss.atk),
    def: Math.round(boss.def),
    agi: boss.agi,
    boss: true,
    bossId: boss.id,
    aura: boss.aura,
    look: boss.look,
    abilities: (boss.abilities || []).map(a => ({ ...a })),
    wId: eq.wId, bId: eq.bId, hId: eq.hId, aId: eq.aId, lId: eq.lId, oId: eq.oId
  };

  const units = [unit];

  return {
    arena, tier,
    name: `БОСС • ${boss.name}`,
    bossName: boss.name,
    boss,
    isBossFight: true,
    units,
    enemySteps: [12],
    gold: Math.round(120 + boss.winAt * 12),
    xp: Math.round(90 + boss.winAt * 8),
    fame: Math.round(18 + boss.winAt * 2)
  };
}

function buildMatch(arenaId, tierId, bossOverride) {
  const tier = ARENA_TIERS.find(t => t.id === tierId);
  if (!tier) return null;

  // Босс-бой идёт отдельной веткой
  if (bossOverride) return buildBossMatch(bossOverride, tierId);

  let arena;
  if (arenaId) {
    const bg = rollArenaBackground();
    arena = Object.assign({}, ARENAS.find(a => a.id === arenaId) || rollArena(STATE.lastArenaId),
      { photo: bg.file, name: bg.name, mood: bg.mood });
  } else {
    arena = rollArena(STATE.lastArenaId);
  }

  const pool = OPPONENT_POOL[tierId] || OPPONENT_POOL.mid;
  const conf = pool[Math.floor(Math.random() * pool.length)];
  const template = ENEMY_TEMPLATES[conf.units] || ENEMY_TEMPLATES.grunts;

  const pow = tier.power;
  const count = enemyCountFor(tierId);
  const sc = enemyPowerScale(count);

  const units = template.slice(0, count).map(u => {
    const unit = {
      ...u,
      hp: Math.round(u.hp * pow * sc.hp),
      atk: Math.round(u.atk * pow * sc.atk),
      def: Math.round(u.def * pow * sc.def)
    };
    // Снаряжение подбирается случайно под сложность арены
    Object.assign(unit, rollEnemyGear(u, tierId));
    return unit;
  });

  const base = 34 + tierIndex(tierId) * 16;
  const countBonus = count >= 3 ? 1 : count === 2 ? 1.22 : 1.5;

  return {
    arena, tier, name: conf.name, bossName: null, units,
    enemySteps: enemyStepsFor(units.length),
    gold: Math.round(base * tier.goldMul * countBonus),
    xp: Math.round((42 + tierIndex(tierId) * 16) * tier.xpMul * countBonus),
    fame: Math.round((4 + tierIndex(tierId) * 3) * tier.fameMul * countBonus)
  };
}

// ==================== РАССТАНОВКА ====================
// Три позиции: 0 — авангард (ближе к врагу), 1 — центр, 2 — тыл.
// Расстановка в один клик: у каждого бойца есть кнопки 1/2/3.
const DEPLOY_POS_STEPS = [7, 5, 3];
const DEPLOY_POS_NAMES = ['авангард', 'центр', 'тыл'];

const DEPLOY = {
  arenaId: null,
  tierId: null,
  boss: null,
  slots: [7, 5, 3],
  picked: 0,
  raf: null,
  match: null
};

// Собираем отряд: гладиаторы + псы, в порядке добавления
function squadFighters() {
  const ids = STATE.squad || [];
  return ids.map(id =>
    STATE.roster.find(g => g.id === id) || (STATE.dogs || []).find(d => d.id === id)
  ).filter(Boolean);
}

// Босс может прийти и объектом, и строкой id — приводим к объекту.
function resolveBossRef(ref) {
  if (!ref) return null;
  if (typeof ref === 'object') return ref;
  if (typeof ref === 'string' && typeof BOSS_LADDER !== 'undefined') {
    return BOSS_LADDER.find(b => b.id === ref) || null;
  }
  return null;
}

function openDeploy(tierId, boss) {
  const squad = squadFighters();
  if (!squad.length) return alert('Сначала соберите отряд!');
  if (squad.some(g => g.hp <= 0)) return alert('В отряде есть тяжелораненый боец. Вылечите его в храме.');

  const bossObj = resolveBossRef(boss);
  if (boss && !bossObj) return alert('Не удалось найти босса. Попробуйте обновить экран арены.');

  DEPLOY.tierId = bossObj ? BOSS_TIER_ID : tierId;
  DEPLOY.boss = bossObj;
  DEPLOY.arenaId = null;
  DEPLOY.slots = [7, 5, 3].slice(0, Math.max(1, squad.length));
  DEPLOY.picked = 0;
  // Матч фиксируем здесь: арена и противник не должны меняться при перерисовке
  DEPLOY.match = buildMatch(null, DEPLOY.tierId, bossObj);
  if (!DEPLOY.match) return alert('Не удалось подобрать бой.');

  const modal = document.getElementById('deploy-modal');
  if (!modal) return startCombat(DEPLOY.match, STATE.modeSel, DEPLOY.slots);
  modal.style.display = 'flex';
  renderDeploy();
}

function renderDeploy() {
  const body = document.getElementById('deploy-body');
  if (!body) return;
  const squad = squadFighters();
  const match = DEPLOY.match || buildMatch(DEPLOY.arenaId, DEPLOY.tierId, DEPLOY.boss);
  if (!match) return;
  const chance = estimateWinChance(squad, match.units, match.tier);
  const bossLine = match.isBossFight
    ? `<div class="deploy-boss-line">👑 ${match.boss.title} • ${match.boss.intro}</div>`
    : '';

  body.innerHTML = `
    <h2>${match.arena.name}</h2>
    <div class="cf-tier" style="color:${match.tier.color}">${match.tier.icon} ${match.tier.label}</div>
    <div class="cf-match">${match.name}${match.bossName ? ` • 👑 ${match.bossName}` : ''}</div>
    ${bossLine}
    <div class="deploy-hint">Нажмите на позицию бойца в списке ниже: 1 — авангард, 2 — центр, 3 — тыл. Авангард принимает удар первым.</div>
    <div class="deploy-stage">
      <canvas id="deployCanvas" width="720" height="260"></canvas>
    </div>
    <div class="deploy-list" id="deploy-list"></div>
    <div class="deploy-foot">
      <div class="cf-chance ${chance >= 65 ? 'good' : chance >= 40 ? 'even' : 'hard'}">
        <div class="cfc-val">${chance}%</div>
        <div class="cfc-lbl">шанс победы</div>
      </div>
      <div class="cf-mode">
        <button class="chip ${STATE.modeSel === 'auto' ? 'on' : ''}" onclick="setMode('auto'); renderDeploy()">🤖 Автобой</button>
        <button class="chip ${STATE.modeSel === 'manual' ? 'on' : ''}" onclick="setMode('manual'); renderDeploy()">🎮 Кликер</button>
        <button class="chip ${STATE.modeSel === 'step' ? 'on' : ''}" onclick="setMode('step'); renderDeploy()">♟️ Пошаговый</button>
      </div>
      <button class="wide-btn" onclick="cancelDeploy()" data-tip="Вернуться к выбору сложности, бой не начнётся">← Назад</button>
      <button class="wide-btn primary" onclick="confirmDeploy()">⚔️ В бой</button>
    </div>
  `;

  const list = document.getElementById('deploy-list');
  list.innerHTML = squad.map((g, i) => {
    const role = deriveRole(g);
    const pct = Math.round((g.hp / g.maxHp) * 100);
    const lost = lostLimbs(g).map(id => LIMB_BY_ID[id].icon).join('');
    // Позиция бойца в строю — прямо в карточке, без кликов по сцене
    const pos = DEPLOY_POS_STEPS.indexOf(DEPLOY.slots[i]);
    const posBtns = [0, 1, 2].map(p => `
      <button class="dc-pos ${pos === p ? 'on' : ''}"
        title="${DEPLOY_POS_NAMES[p]}"
        onclick="event.stopPropagation(); setDeployPos(${i}, ${p})">${p + 1}</button>`).join('');
    return `<div class="deploy-card ${DEPLOY.picked === i ? 'on' : ''}" onclick="pickDeploy(${i})">
      <span class="dc-role">${g.isDog ? '🐕' : ROLE_ICONS[role]}</span>
      <span class="dc-name">${g.name}</span>
      <span class="dc-hp">${g.hp}/${g.maxHp}${lost ? ' • ' + lost : ''}</span>
      <div class="dc-bar"><i style="width:${pct}%"></i></div>
      <div class="dc-pos-row">${posBtns}<span class="dc-pos-lbl">${pos >= 0 ? DEPLOY_POS_NAMES[pos] : '—'}</span></div>
    </div>`;
  }).join('');

  drawDeployStage(match, squad);
  startDeployAnim();
}

// Пока открыт экран расстановки — бойцы дышат и покачиваются
function startDeployAnim() {
  if (DEPLOY.raf) return;
  const step = () => {
    const modal = document.getElementById('deploy-modal');
    if (!modal || modal.style.display === 'none' || !DEPLOY.match) { DEPLOY.raf = null; return; }
    drawDeployStage(DEPLOY.match, squadFighters());
    DEPLOY.raf = requestAnimationFrame(step);
  };
  DEPLOY.raf = requestAnimationFrame(step);
}

function stopDeployAnim() {
  if (DEPLOY.raf) cancelAnimationFrame(DEPLOY.raf);
  DEPLOY.raf = null;
}

function pickDeploy(i) {
  DEPLOY.picked = i;
  renderDeploy();
}

// Поставить бойца i на позицию pos (0 — авангард, 1 — центр, 2 — тыл).
// Если позиция занята — бойцы меняются местами.
function setDeployPos(i, pos) {
  if (pos < 0 || pos > 2) return;
  const slots = DEPLOY.slots.slice();
  const step = DEPLOY_POS_STEPS[pos];
  const other = slots.indexOf(step);
  const prev = slots[i];
  slots[i] = step;
  if (other >= 0 && other !== i) slots[other] = prev;
  DEPLOY.slots = slots;
  DEPLOY.picked = i;
  sfx('click');
  renderDeploy();
}

function drawDeployStage(match, squad) {
  const cv = document.getElementById('deployCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const arena = match.arena;

  ctx.clearRect(0, 0, W, H);
  paintArenaBackground(ctx, arena, W, H, H * 0.80);
  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0.15)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const floorY = H * 0.86;
  if (!arena.photo) {
    const g = ctx.createLinearGradient(0, H * 0.78, 0, H);
    g.addColorStop(0, arena.ground[0]);
    g.addColorStop(1, arena.ground[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.78, W, H * 0.22);
  } else {
    // На фото своя перспектива: подмешиваем тёмную «землю», чтобы бойцы
    // стояли на ней, а не в стенах и текстурах снимка.
    const g = ctx.createLinearGradient(0, H * 0.76, 0, H);
    g.addColorStop(0, 'rgba(12,10,8,0)');
    g.addColorStop(0.45, 'rgba(12,10,8,0.42)');
    g.addColorStop(1, 'rgba(12,10,8,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.76, W, H * 0.24);
  }

  // Зоны позиций: 0 — авангард (ближе к врагу), 1 — центр, 2 — тыл.
  // Строй держим в середине кадра: у краёв фото стоят стены, арки и
  // скелет, и бойцы «врастали» в них. Компактнее строй — чище сцена.
  DEPLOY.zones = [W * 0.38, W * 0.30, W * 0.22];

  const t = performance.now() / 1000;

  DEPLOY.slots.forEach((step, i) => {
    const gd = squad[i];
    if (!gd) return;
    // Место на сцене определяется позицией в строю, а не порядком в списке
    const zone = Math.max(0, DEPLOY_POS_STEPS.indexOf(step));
    const x = DEPLOY.zones[zone];
    const y = floorY;
    const picked = DEPLOY.picked === i;
    const bob = Math.sin(t * 1.9 + i * 1.3) * 1.6;

    ctx.save();
    ctx.globalAlpha = 0.9;
    drawBattleBrother(ctx, gd, x, y + bob, 0.46, 1, {
      walk: 0.08,
      walkPhase: t * 2.2 + i,
      breath: 1.3,
      victory: picked ? 0.35 + 0.25 * Math.sin(t * 2.4) : 0,
      glow: picked ? 0.7 : 0,
      emotion: picked ? 'taunt' : 'idle'
    });
    ctx.restore();

    // Пульсирующий круг у выбранного бойца
    const pulse = picked ? 0.6 + 0.4 * Math.sin(t * 4.2) : 0;
    ctx.strokeStyle = picked ? `rgba(229,181,79,${0.55 + pulse * 0.45})` : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = picked ? 2.4 + pulse * 1.6 : 1.6;
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 32 + (picked ? pulse * 4 : 0), 9 + (picked ? pulse * 1.5 : 0), 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = picked ? '#ffe6a8' : 'rgba(240,224,184,0.7)';
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(DEPLOY_POS_NAMES[zone], x, H - 8);
  });

  // Враги — вдоль правой половины сцены, на той же линии пола.
  // Держим их ближе к центру: у самого правого края фото стоит скелет.
  const enemyCount = Math.max(1, match.units.length);
  const rightStart = W * 0.60;
  const rightEnd = W * 0.82;
  match.units.forEach((u, i) => {
    const gd = enemyUnitToGlad(u);
    const x = enemyCount === 1
      ? (rightStart + rightEnd) / 2
      : rightStart + (rightEnd - rightStart) * (i / (enemyCount - 1));
    const bob = Math.sin(t * 1.7 + i * 1.1 + 2) * 1.5;
    drawBattleBrother(ctx, gd, x, floorY + bob, u.boss ? 0.54 : 0.44, -1, {
      walk: 0.06,
      walkPhase: t * 2 + i * 1.4,
      breath: 1.3,
      aura: u.aura || null,
      emotion: u.boss ? 'angry' : (i % 2 ? 'taunt' : 'idle')
    });
  });

  ctx.fillStyle = 'rgba(240,224,184,0.8)';
  ctx.font = 'bold 12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ваш отряд', W * 0.30, H * 0.13);
  ctx.fillText('противник', W * 0.71, H * 0.13);
}

function confirmDeploy() {
  const modal = document.getElementById('deploy-modal');
  if (modal) modal.style.display = 'none';
  stopDeployAnim();
  const match = DEPLOY.match || buildMatch(DEPLOY.arenaId, DEPLOY.tierId, DEPLOY.boss);
  if (!match) return alert('Не удалось подобрать бой.');
  startCombat(match, STATE.modeSel, DEPLOY.slots.slice());
}

// Отмена подготовки к бою: закрываем окно и возвращаемся к выбору сложности
function cancelDeploy() {
  const modal = document.getElementById('deploy-modal');
  if (modal) modal.style.display = 'none';
  stopDeployAnim();
  DEPLOY.match = null;
  DEPLOY.boss = null;
  sfx('click');
  goTo('arena');
}

// ==================== СТАРТ ====================
function startCombat(match, mode, deploySlots) {
  const squadGlads = squadFighters().slice(0, 3);
  if (!squadGlads.length) return alert('Сначала соберите отряд в казарме!');
  if (squadGlads.some(g => g.hp <= 0)) return alert('В отряде есть тяжелораненый боец. Вылечите его в храме.');

  if (!match) return alert('Не удалось подобрать бой.');

  COMBAT.active = true;
  COMBAT.over = false;
  COMBAT.retreated = false;
  COMBAT.round = 1;
  COMBAT.phase = 'player';
  COMBAT.mode = mode || 'manual';
  COMBAT.arena = match.arena;
  COMBAT.tier = match.tier;
  COMBAT.matchName = match.name;
  COMBAT.isBossFight = !!match.isBossFight;
  COMBAT.boss = match.boss || null;
  COMBAT.rewards = { gold: match.gold, xp: match.xp, fame: match.fame };
  COMBAT.units = [];
  COMBAT.activeId = null;
  COMBAT.floats = [];
  COMBAT.particles = [];
  COMBAT.projectiles = [];
  COMBAT.stains = [];
  COMBAT.shake = 0;
  COMBAT.heavyMode = false;
  COMBAT.busy = false;
  COMBAT.hoverId = null;
  COMBAT.hoverStep = null;
  COMBAT.aim = null;
  COMBAT.menu = null;
  COMBAT.retreatArmed = false;
  COMBAT.turnRunning = false;
  clearTimeout(COMBAT.retreatTimer);
  COMBAT.magic = [];
  COMBAT.cam = { focusX: WORLD_W / 2, scale: 1, init: false };
  COMBAT.winChance = estimateWinChance(squadGlads, match.units, match.tier);
  STATE.lastArenaId = match.arena.id;

  const slots = deploySlots || PLAYER_HOME;

  squadGlads.forEach((g, i) => {
    COMBAT.units.push(makeUnit(g, 'player', slots[i] != null ? slots[i] : PLAYER_HOME[i], 'p' + i));
  });

  match.units.forEach((u, i) => {
    const steps = match.enemySteps || ENEMY_HOME;
    const eu = makeUnit(enemyUnitToGlad(u), 'enemy', steps[i] != null ? steps[i] : ENEMY_HOME[i], 'e' + i);
    // Босс: способности и собственный ритм
    if (u.boss) {
      eu.boss = true;
      eu.bossId = u.bossId;
      eu.abilities = (u.abilities || []).map(a => ({ ...a, cdLeft: 0 }));
      eu.aura = u.aura || null;
    }
    COMBAT.units.push(eu);
  });

  const log = document.getElementById('combat-log');
  if (log) log.innerHTML = '';
  const titleEl = document.getElementById('combat-screen-title');
  if (titleEl) titleEl.textContent = match.name;
  const arenaEl = document.getElementById('combat-arena-name');
  if (arenaEl) arenaEl.textContent = match.arena.name;
  const tb = document.getElementById('combat-tier-badge');
  if (tb) tb.innerHTML = `<span style="color:${match.tier.color}">${match.tier.icon} ${match.tier.short}</span>`;

  addLog(`🏟️ <b>${match.arena.name}</b> — ${match.arena.mood}`, 'log-info');
  if (match.isBossFight) {
    addLog(`👑 <b>${match.boss.name}</b> — ${match.boss.title}`, 'log-crit');
    addLog(`«${match.boss.intro}»`, 'log-warn');
    match.boss.abilities.forEach(a => addLog(`✦ ${a.name}: ${a.desc}`, 'log-warn'));
  } else {
    addLog(`⚔️ ${match.name}`, 'log-info');
  }
  addLog(`📊 Шанс победы: <b>${COMBAT.winChance}%</b>`, COMBAT.winChance >= 55 ? 'log-info' : 'log-hit');
  addLog('🩸 Попадание в конечность ломает её навсегда. Голова и корпус — смертельны.', 'log-warn');

  goTo('combat');
  updateCombatHUD();
  if (!COMBAT.raf) {
    COMBAT.lastTs = performance.now();
    COMBAT.raf = requestAnimationFrame(renderArenaLoop);
  }
  beginClicker();
}

// ==================== ЛОГ И ЭФФЕКТЫ ====================
function addLog(msg, cls = '') {
  const log = document.getElementById('combat-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = msg;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 160) log.removeChild(log.firstChild);
}

function addFloat(unit, text, color, big) {
  COMBAT.floats.push({
    x: stepX(unit.step) + rnd(-12, 12),
    y: GROUND - 215 * UNIT_SCALE,
    text, color, life: 1, vy: -46, big: !!big
  });
}

function spawnParticles(unit, color, count, spread) {
  const bx = stepX(unit.step);
  for (let i = 0; i < count; i++) {
    COMBAT.particles.push({
      x: bx + rnd(-14, 14),
      y: GROUND - rnd(60, 170) * UNIT_SCALE,
      vx: rnd(-spread, spread), vy: rnd(-200, -40),
      size: rnd(2.5, 6.5), color, life: 1, decay: rnd(0.7, 1.3), grav: 1
    });
  }
}

// Кровь: брызги + лужа
function bloodBurst(unit, amount) {
  const n = Math.round(clamp(amount, 4, 26));
  spawnParticles(unit, BLOOD, n, 150);
  spawnParticles(unit, BLOOD_DARK, Math.round(n * 0.4), 90);
  addStain(unit, amount);
  COMBAT.bloodOverlay = Math.min(0.55, COMBAT.bloodOverlay + amount * 0.012);
}

function addStain(unit, amount) {
  const big = clamp((amount || 10) / 20, 0.5, 2);
  COMBAT.stains.push({
    x: stepX(unit.step) + rnd(-24, 24),
    y: GROUND + rnd(2, 16),
    rx: rnd(12, 26) * big, ry: rnd(3, 8) * big, alpha: rnd(0.14, 0.3)
  });
  if (COMBAT.stains.length > 90) COMBAT.stains.shift();
}

// ==================== РАУНДЫ ====================
async function beginRound() {
  if (!COMBAT.active) return;
  COMBAT.phase = 'player';
  COMBAT.busy = true;
  const players = playerUnitsAlive();
  players.forEach(u => {
    tickStatuses(u);
    if (!u.alive) return;
    u.ap = u.maxAp;
    u.stance = null;
    u.dodgeUsed = false;
    u.hitPenalty = 0;
    u.evasionBonus = 0;
    tickSpellCooldowns(u);
    recalcUnit(u);
  });
  // Кулдауны способностей босса идут в начале раунда
  COMBAT.units.filter(u => u.alive && u.boss).forEach(tickBossCooldowns);

  addLog(`— Раунд ${COMBAT.round} —`, 'log-round');
  sfx('round');
  if (checkTeamWipe()) return;
  if (players[0] && players[0].alive) COMBAT.activeId = players[0].id;
  COMBAT.busy = false;
  updateCombatHUD();
  if (COMBAT.mode === 'auto') {
    await sleep(420);
    autoPlay();
  }
}

async function autoPlay() {
  if (!COMBAT.active || COMBAT.mode !== 'auto' || COMBAT.phase !== 'player') return;
  for (const u of playerUnitsAlive()) {
    if (!COMBAT.active || COMBAT.mode !== 'auto') return;
    COMBAT.activeId = u.id;
    updateCombatHUD();
    await sleep(220);
    await aiAct(u);
    if (!COMBAT.active || COMBAT.mode !== 'auto') return;
    if (checkTeamWipe()) return;
    updateCombatHUD();
  }
  await sleep(320);
  if (!COMBAT.active || COMBAT.mode !== 'auto') return;
  endPlayerTurn();
}

// Переключение режимов боя прямо в бою.
//   auto   — ИИ ведёт отряд сам (по умолчанию);
//   manual — кликер: кликаешь по врагу и бьёшь в ту часть, куда попал;
//   step   — пошаговый: выбираешь своего бойца и ставишь блок/уклон,
//            кликаешь по врагу и выбираешь, куда бить. Тратит ОД,
//            ход передаётся, враги отвечают в конце раунда.
const COMBAT_MODES = ['auto', 'manual', 'step'];
const COMBAT_MODE_INFO = {
  auto:   { label: '🤖 автобой',  toast: 'Автобой',        hint: 'ИИ бьёт по кулдауну' },
  manual: { label: '🎮 кликер',   toast: 'Кликер',         hint: 'Кликайте по врагу — куда попали, туда и удар' },
  step:   { label: '♟️ пошаговый', toast: 'Пошаговый бой',  hint: 'Выберите бойца, поставьте стойку, бейте по цели' }
};

function cycleCombatMode() {
  if (!COMBAT.active || COMBAT.over) return;
  const i = COMBAT_MODES.indexOf(COMBAT.mode);
  setCombatMode(COMBAT_MODES[(i + 1) % COMBAT_MODES.length]);
}

function setCombatMode(mode) {
  if (!COMBAT.active || COMBAT.over) return;
  if (!COMBAT_MODES.includes(mode)) return;
  COMBAT.mode = mode;
  COMBAT.menu = null;
  COMBAT.aim = null;
  COMBAT.heavyMode = false;
  sfx('click');
  if (mode === 'step') {
    // Пошаговый бой начинается с полного пула ОД у обеих сторон:
    // у врагов тоже есть ОД, иначе их полоски пустые и непонятно,
    // почему противник не отвечает.
    COMBAT.units.filter(u => u.alive).forEach(u => {
      u.ap = u.maxAp;
      u.stance = null;
      u.dodgeUsed = false;
    });
    COMBAT.phase = 'player';
    if (!COMBAT.activeId) {
      const first = playerUnitsAlive()[0];
      if (first) COMBAT.activeId = first.id;
    }
  }
  addLog(`🔁 Режим боя: <b>${COMBAT_MODE_INFO[mode].toast}</b>`, 'log-info');
  updateCombatHUD();
  renderAimPanel();
  renderUnitMenu();
  showTurnToast(COMBAT_MODE_INFO[mode].toast, COMBAT_MODE_INFO[mode].hint);
}

// Совместимость: старый переключатель «авто/ручной»
function toggleCombatMode() {
  setCombatMode(COMBAT.mode === 'auto' ? 'manual' : 'auto');
}

// ==================== МАГИЯ ГЕРОЕВ ====================
// Если у бойца есть дар (glad.magic), ему доступна школа заклинаний.
// Заклинания тратят ОД, имеют перезарядку и часто не требуют подхода.

function heroSpells(unit) {
  if (!unit || !unit.glad || !unit.glad.magic) return [];
  const school = MAGIC_SCHOOLS[unit.glad.magic];
  if (!school) return [];
  if (!unit.spellCd) unit.spellCd = {};
  return school.spells.map(s => ({
    ...s,
    cdLeft: unit.spellCd[s.id] || 0,
    school
  }));
}

function tickSpellCooldowns(unit) {
  if (!unit.spellCd) return;
  Object.keys(unit.spellCd).forEach(k => {
    if (unit.spellCd[k] > 0) unit.spellCd[k]--;
  });
}

// Применить роль-бонусы к юниту
function applyRoleBonus(u) {
  const role = u.role;
  if (role === 'melee') {
    u.dmgMul = (u.dmgMul || 1) * 1.12;
  } else if (role === 'shield') {
    u.blockChance = Math.min(80, (u.blockChance || 0) * 1.15 + 4);
    u.dmgMul = (u.dmgMul || 1) * 0.92;
  } else if (role === 'ranged') {
    u.dmgMul = (u.dmgMul || 1) * 1.05;
    u.evasion = (u.evasion || 10) * 0.92;
  } else if (role === 'mage') {
    u.maxAp = (u.maxAp || MAX_AP) + 1;
    u.ap = u.maxAp;
  } else if (role === 'beast') {
    u.dmgMul = (u.dmgMul || 1) * 1.04;
  }
}

async function castSpell(unit, spellId) {
  if (!COMBAT.active || !unit || !unit.alive) return false;
  if (!canControl()) return false;
  const spells = heroSpells(unit);
  const spell = spells.find(s => s.id === spellId);
  if (!spell) return false;
  if (spell.cdLeft > 0) { addFloat(unit, 'перезарядка', '#9e8c76'); sfx('error'); return false; }
  if (unit.ap < spell.ap) { addFloat(unit, 'мало ОД', '#9e8c76'); sfx('error'); return false; }

  const foes = COMBAT.units.filter(x => x.alive && x.side !== unit.side);
  if (!foes.length) return false;

  const color = spell.school.color;
  unit.ap -= spell.ap;
  unit.spellCd[spell.id] = spell.cd;
  unit.tAnim.swing = 1.2;
  COMBAT.aim = null;
  COMBAT.menu = { unitId: unit.id };

  addLog(`✨ <b>${unit.glad.name}</b> читает <b>${spell.name}</b> (${spell.school.name})`, 'log-crit');
  sfx('crit');

  // Цель: ближайшая подходящая или самая слабая
  const inRange = foes.filter(f => Math.abs(f.step - unit.step) <= (spell.range || 99));
  const target = (inRange.length ? inRange : foes)
    .sort((a, b) => (a.glad.hp / a.glad.maxHp) - (b.glad.hp / b.glad.maxHp))[0];

  const power = (unit.glad.atk || 50) * (spell.dmg || 0.7);

  // --- Одиночное ---
  if (!spell.aoe && !spell.team) {
    spawnMagic(unit, target, color, spell.school.id);
    await sleep(260);
    const limb = spell.pen ? 'torso' : aiPickLimb(unit, target);
    const dealt = dealAbilityDamage(unit, target, limb, Math.round(power), color, false, spell.pen || 0);

    if (spell.lifesteal) {
      const heal = Math.round(dealt * spell.lifesteal);
      unit.glad.hp = Math.min(unit.glad.maxHp, unit.glad.hp + heal);
      addFloat(unit, `+${heal}`, '#7fd18f');
    }
    if (spell.drainAp) {
      target.ap = Math.max(0, target.ap - spell.drainAp);
      addFloat(target, `−${spell.drainAp} ОД`, color);
    }
    if (spell.blind) {
      target.hitPenalty = (target.hitPenalty || 0) + spell.blind;
      addFloat(target, 'ослеплён', color);
    }
    if (spell.root) {
      target.rooted = 1;
      addFloat(target, 'обездвижен', color);
    }
    if (spell.selfCost) {
      const cost = Math.round(unit.glad.maxHp * spell.selfCost);
      unit.glad.hp = Math.max(1, unit.glad.hp - cost);
      addFloat(unit, `−${cost}`, '#ff5959');
    }
  }

  // --- По площади ---
  if (spell.aoe) {
    addRing(unit, color);
    for (const f of foes) {
      if (Math.abs(f.step - unit.step) > spell.aoe + 1) continue;
      spawnMagic(unit, f, color, spell.school.id);
      await sleep(110);
      dealAbilityDamage(unit, f, 'torso', Math.round(power), color);
    }
    if (spell.shield) {
      unit.iceShield = Math.round(unit.glad.maxHp * spell.shield);
      addFloat(unit, `❄ ${unit.iceShield}`, color, true);
    }
  }

  // --- По отряду ---
  if (spell.team) {
    const allies = playerUnitsAlive();
    for (const a of allies) {
      if (spell.heal) {
        const h = Math.round(a.glad.maxHp * spell.heal);
        a.glad.hp = Math.min(a.glad.maxHp, a.glad.hp + h);
        addFloat(a, `+${h}`, '#7fd18f');
        addFlash(a, '#a8f0c0');
      }
      if (spell.dodge) {
        a.stance = 'dodge';
        a.dodgeUsed = false;
        a.evasionBonus = (a.evasionBonus || 0) + spell.dodge;
        addFloat(a, 'мираж', color);
      }
      a.ap = Math.min(a.maxAp, a.ap + 1);
    }
    addRing(unit, color);
    addLog(`✨ Отряд получает поддержку «${spell.name}».`, 'log-block');
  }

  updateCombatHUD();
  if (checkTeamWipe()) return true;
  autoAdvanceTurn();
  return true;
}

// ==================== СПОСОБНОСТИ БОССОВ ====================
// У каждого босса свой набор. Часть — чистая магия (не требует подхода
// и не проверяет дистанцию), часть — боевые приёмы.

function bossAbilityReady(unit) {
  if (!unit.abilities || !unit.abilities.length) return null;
  const ready = unit.abilities.filter(a => (a.cdLeft || 0) <= 0);
  if (!ready.length) return null;
  return ready[Math.floor(Math.random() * ready.length)];
}

function tickBossCooldowns(unit) {
  if (!unit.abilities) return;
  unit.abilities.forEach(a => { if (a.cdLeft > 0) a.cdLeft--; });
}

// Магический снаряд: летит по дуге, независимо от дистанции
function spawnMagic(attacker, target, color, kind) {
  COMBAT.magic.push({
    x1: stepX(attacker.step),
    y1: GROUND - 150 * UNIT_SCALE,
    x2: stepX(target.step),
    y2: GROUND - 100 * UNIT_SCALE,
    p: 0, color: color || '#ff9f43', kind: kind || 'orb', arc: 60
  });
}

async function useBossAbility(unit, ability) {
  if (!COMBAT.active || !unit.alive) return false;
  const foes = playerUnitsAlive();
  if (!foes.length) return false;

  const target = foes[Math.floor(Math.random() * foes.length)];
  const power = unit.glad.atk || 70;
  const color = unit.aura || '#ff9f43';

  ability.cdLeft = ability.cd || 4;
  unit.tAnim.swing = 1.4;
  addLog(`✦ <b>${unit.glad.name}</b> применяет <b>${ability.name}</b>!`, 'log-crit');
  showTurnToast(ability.name, ability.desc);
  sfx(ability.magic ? 'crit' : 'limb');

  switch (ability.id) {
    // --- Ганник ---
    case 'ash_charge': {
      // Рывок к цели и удар по корпусу
      const dist = Math.abs(target.step - unit.step);
      if (dist > 1) {
        const moved = moveToward(unit, target.step, Math.min(2, dist - 1));
        unit.ap -= Math.max(0, moved - 1);
        dustTrail(unit, unit.step, unit.step + moved);
        await sleep(260);
      }
      spawnMagic(unit, target, color, 'trail');
      await sleep(180);
      const raw = Math.round(power * 0.75);
      dealAbilityDamage(unit, target, 'torso', raw, color);
      break;
    }

    // --- Мортус ---
    case 'soul_drain': {
      let healed = 0;
      for (const f of foes) {
        spawnMagic(unit, f, '#8a9aa6', 'drain');
        const raw = Math.round(power * 0.42);
        healed += dealAbilityDamage(unit, f, 'torso', raw, '#8a9aa6', true);
        await sleep(120);
      }
      const heal = Math.max(6, Math.round(healed * 0.6));
      unit.glad.hp = Math.min(unit.glad.maxHp, unit.glad.hp + heal);
      addFloat(unit, `+${heal}`, '#7fd18f', true);
      addLog(`🩸 <b>${unit.glad.name}</b> высасывает жизнь: +${heal} HP.`, 'log-block');
      break;
    }
    case 'curse': {
      target.cursed = 2;
      spawnMagic(unit, target, '#7a5f8a', 'curse');
      addFloat(target, 'ПРОКЛЯТ', '#b98fdc', true);
      addLog(`☠️ <b>${target.glad.name}</b> проклят: +25% входящего урона.`, 'log-warn');
      break;
    }

    // --- Игнис ---
    case 'fireball': {
      spawnMagic(unit, target, '#ff7a3a', 'fireball');
      await sleep(300);
      const limb = aiPickLimb(unit, target);
      dealAbilityDamage(unit, target, limb, Math.round(power * 0.9), '#ff7a3a');
      addRing(target, '#ff7a3a');
      break;
    }
    case 'flame_wave': {
      addRing(unit, '#ffb04a');
      for (const f of foes) {
        if (Math.abs(f.step - unit.step) > 3) continue;
        spawnMagic(unit, f, '#ffb04a', 'fire');
        await sleep(110);
        dealAbilityDamage(unit, f, 'torso', Math.round(power * 0.5), '#ffb04a');
      }
      break;
    }
    case 'ignite': {
      target.burning = 3;
      spawnMagic(unit, target, '#ff5a2a', 'fire');
      addFloat(target, 'ГОРИТ', '#ff7a3a', true);
      addLog(`🔥 <b>${target.glad.name}</b> охвачен пламенем: 3 раунда горения.`, 'log-warn');
      break;
    }

    // --- Скади ---
    case 'frost_nova': {
      addRing(unit, '#cfe6f2');
      for (const f of foes) {
        spawnMagic(unit, f, '#cfe6f2', 'frost');
        await sleep(100);
        dealAbilityDamage(unit, f, 'torso', Math.round(power * 0.36), '#cfe6f2');
        f.ap = Math.max(0, f.ap - 2);
        addFloat(f, '−2 ОД', '#a8d8f0');
      }
      break;
    }
    case 'ice_lance': {
      spawnMagic(unit, target, '#e0f4ff', 'lance');
      await sleep(260);
      const limb = aiPickLimb(unit, target);
      dealAbilityDamage(unit, target, limb, Math.round(power * 0.95), '#e0f4ff', false, 0.5);
      break;
    }
    case 'winter_veil': {
      unit.iceShield = Math.round(unit.glad.maxHp * 0.22);
      const heal = Math.round(unit.glad.maxHp * 0.12);
      unit.glad.hp = Math.min(unit.glad.maxHp, unit.glad.hp + heal);
      addFloat(unit, `❄ ${unit.iceShield}`, '#cfe6f2', true);
      addLog(`❄️ <b>${unit.glad.name}</b> укрывается льдом: щит ${unit.iceShield}, +${heal} HP.`, 'log-block');
      break;
    }

    // --- Легенда ---
    case 'legend_strike': {
      // Бьёт по самой повреждённой конечности
      let worst = 'torso', worstRatio = 1;
      LIMB_DEFS.forEach(l => {
        const s = target.limbs[l.id];
        if (!s || s.lost) return;
        const r = s.hp / s.max;
        if (r < worstRatio) { worstRatio = r; worst = l.id; }
      });
      spawnMagic(unit, target, '#ffd76a', 'trail');
      await sleep(200);
      dealAbilityDamage(unit, target, worst, Math.round(power * 0.85), '#ffd76a');
      break;
    }
    case 'crowd_favor': {
      const heal = Math.round(unit.glad.maxHp * 0.15);
      unit.glad.hp = Math.min(unit.glad.maxHp, unit.glad.hp + heal);
      unit.ap = Math.min(unit.maxAp + 2, unit.ap + 3);
      addFloat(unit, `+${heal}`, '#7fd18f', true);
      addRing(unit, '#ffd76a');
      addLog(`👑 Толпа ревёт! <b>${unit.glad.name}</b> восстанавливает ${heal} HP и силы.`, 'log-block');
      break;
    }
    case 'execute': {
      const ratio = target.glad.hp / target.glad.maxHp;
      if (ratio <= 0.32) {
        spawnMagic(unit, target, '#ff2b2b', 'lance');
        await sleep(240);
        addLog(`💀 <b>КАЗНЬ!</b> ${unit.glad.name} не оставляет шансов.`, 'log-crit');
        killUnit(target, 'казнён Легендой');
        bloodBurst(target, 30);
      } else {
        dealAbilityDamage(unit, target, 'torso', Math.round(power * 0.8), '#ffd76a');
        addFloat(target, 'выжил', '#9e8c76');
      }
      break;
    }
    case 'sandstorm': {
      addRing(unit, '#d8c3a0');
      for (const f of foes) {
        spawnMagic(unit, f, '#d8c3a0', 'sand');
        await sleep(100);
        dealAbilityDamage(unit, f, 'torso', Math.round(power * 0.44), '#d8c3a0');
        f.hitPenalty = (f.hitPenalty || 0) + 6;
        addFloat(f, '−точность', '#d8c3a0');
      }
      break;
    }
  }

  updateCombatHUD();
  return true;
}

// Урон от способности: не проверяет попадание, но уважает броню и волю.
// Возвращает нанесённый урон по HP (нужно для вампиризма).
function dealAbilityDamage(attacker, defender, limbId, raw, color, quiet, penBonus) {
  const limb = LIMB_BY_ID[limbId] ? limbId : 'torso';
  const limbDef = LIMB_BY_ID[limb];
  const armor = limbArmorFor(defender, limb);
  const pen = clamp((attacker.weapon.armorPen || 0.15) + (penBonus || 0) + 0.2, 0, 0.9);
  const mitigation = armor / (armor + 55);
  const effective = clamp(mitigation * (1 - pen), 0, 0.8);

  let dmg = Math.max(2, Math.round(raw * (1 - effective) * limbDef.dmgMul * (defender.drMul || 1)));
  if (defender.cursed > 0) dmg = Math.round(dmg * 1.25);
  if (defender.iceShield > 0) {
    const absorbed = Math.min(defender.iceShield, dmg);
    defender.iceShield -= absorbed;
    dmg -= absorbed;
  }

  const st = defender.limbs[limb];
  if (st && !st.lost) {
    st.hp = Math.max(0, st.hp - Math.round(raw * 0.5 * limbDef.dmgMul));
    if (st.hp <= 0) {
      st.lost = true;
      dmg += Math.round(raw * 0.4);
      addFloat(defender, `${limbDef.icon} ОТРУБЛЕНО`, '#ff2b2b', true);
      addLog(`🩸 <b>${defender.glad.name}</b> теряет ${limbDef.name.toLowerCase()}!`, 'log-crit');
      if (limb === 'armL' || limb === 'armR') dropWeaponFromLimb(defender.glad, limb);
      recalcUnit(defender);
    }
  }

  defender.glad.hp = Math.max(0, defender.glad.hp - dmg);
  defender.tAnim.hurt = 1;
  addFloat(defender, '-' + dmg, color || '#ff5959', true);
  if (!quiet) addLog(`${attacker.glad.name} → <b>${defender.glad.name}</b>: ${dmg} HP (магия)`, 'log-hit');
  bloodBurst(defender, clamp(dmg * 0.6, 3, 18));
  COMBAT.shake = 10;
  addFlash(defender, color || '#ffb066');

  if (defender.glad.hp <= 0) killUnit(defender, 'не выдержал магии');
  return dmg;
}

// Горение и проклятие тикают в начале раунда
function tickStatuses(unit) {
  if (unit.burning > 0) {
    unit.burning--;
    const dmg = Math.max(3, Math.round(unit.glad.maxHp * 0.035));
    unit.glad.hp = Math.max(0, unit.glad.hp - dmg);
    addFloat(unit, `🔥 ${dmg}`, '#ff7a3a');
    addLog(`🔥 <b>${unit.glad.name}</b> горит: ${dmg} урона.`, 'log-warn');
    if (unit.glad.hp <= 0) killUnit(unit, 'сгорел заживо');
  }
  if (unit.cursed > 0) unit.cursed--;
  if (unit.iceShield == null) unit.iceShield = 0;
}

async function aiAct(unit) {
  let guard = 0;
  // ИИ действует, пока у бойца есть ОД на осмысленный шаг.
  // Если ни ударить, ни подойти, ни поставить стойку нельзя — ход
  // бойца заканчивается сам, а не висит в ожидании таймаута.
  // Предел итераций выше максимума ОД, иначе боец с большим пулом
  // обрывал ход на середине и «терял» оставшиеся очки.
  while (COMBAT.active && unit.alive && guard++ < 24) {
    if ((unit.ap || 0) < 1) return;
    // Босс сначала пробует способность
    if (unit.boss && unit.abilities) {
      const ab = bossAbilityReady(unit);
      if (ab && Math.random() < 0.62) {
        await useBossAbility(unit, ab);
        if (!COMBAT.active) return;
        if (checkTeamWipe()) return;
        await sleep(420);
        continue;
      }
    }

    const target = pickTarget(unit);

    if (!target) {
      const foe = nearestEnemy(unit);
      if (!foe) return;
      const dist = Math.abs(foe.step - unit.step);
      if (isRangedWeapon(unit.weapon) && dist < 3) {
        if (unit.ap >= STEP_COST && stepAway(unit, 2)) {
          unit.ap -= STEP_COST;
          await sleep(240);
          continue;
        }
        return;
      }
      if (unit.ap < STEP_COST) return;
      const want = Math.min(DASH_STEPS, unit.ap, Math.max(1, dist - unit.weapon.range));
      const moved = moveToward(unit, foe.step, want);
      if (!moved) return;
      unit.ap -= moved;
      await sleep(260);
      continue;
    }

    if (unit.ap < unit.weapon.apCost) return;

    const hpPct = unit.glad.hp / unit.glad.maxHp;
    if (unit.ap >= STANCE_COST + unit.weapon.apCost && hpPct < 0.5 && Math.random() < 0.22) {
      if (unit.blockChance > 0) {
        unit.ap -= STANCE_COST; unit.stance = 'block'; unit.tAnim.block = 1;
        addLog(`🛡️ <b>${unit.glad.name}</b> поднимает щит.`, 'log-block');
        await sleep(300);
        continue;
      }
    }

    const aggression = COMBAT.mode === 'auto'
      ? (liveWinChance() < 35 ? 0.55 : liveWinChance() < 60 ? 0.32 : 0.16)
      : (unit.boss ? 0.4 : 0.18);
    const heavy = Math.random() < aggression && unit.ap >= unit.weapon.apCost + 2;
    unit.ap -= unit.weapon.apCost + (heavy ? 2 : 0);
    performAttack(unit, target, aiPickLimb(unit, target), heavy);
    updateCombatHUD();
    await sleep(520);
    if (!COMBAT.active) return;
    if (checkTeamWipe()) return;
  }
}

function aiPickLimb(attacker, target) {
  const L = target.limbs;
  const opts = [];
  LIMB_DEFS.forEach(l => {
    const s = L[l.id];
    if (!s || s.lost) return;
    let w = 1;
    if (l.id === 'head') w = 0.9 + (s.hp / s.max < 0.5 ? 1.4 : 0);
    if (l.id === 'torso') w = 1.6;
    if (l.id === 'armL' || l.id === 'armR') w = s.hp / s.max < 0.4 ? 1.6 : 0.7;
    if (l.id === 'legL' || l.id === 'legR') w = s.hp / s.max < 0.4 ? 1.4 : 0.6;
    opts.push({ id: l.id, w });
  });
  if (!opts.length) return 'torso';
  const total = opts.reduce((s, o) => s + o.w, 0);
  let r = Math.random() * total;
  for (const o of opts) { r -= o.w; if (r <= 0) return o.id; }
  return 'torso';
}

async function endPlayerTurn(force) {
  // Ходы существуют только в пошаговом режиме: автобой и кликер живут
  // своими таймерами. Раньше здесь стояла проверка флага COMBAT.clicker,
  // который всегда true — из-за неё ход противника не запускался никогда
  // и кнопка «завершить ход» молча ничего не делала.
  if (COMBAT.mode !== 'step') return;
  if (!COMBAT.active || COMBAT.over) return;
  // Защита от двойного запуска: пока идёт ход врага, повторный вызов
  // игнорируется. Флаг собственный, а не COMBAT.busy: тот используется
  // и для подходов, и мог «залипнуть» после переключения режима.
  if (COMBAT.turnRunning) return;
  // Кнопка «пропустить ход» передаёт force = true: игрок вправе закончить
  // ход в любой момент, даже если фаза по какой-то причине не 'player'.
  if (!force && COMBAT.phase !== 'player') return;
  COMBAT.turnRunning = true;
  COMBAT.phase = 'enemy';
  COMBAT.busy = true;
  COMBAT.aim = null;
  COMBAT.menu = null;
  sfx('click');
  updateCombatHUD();
  addLog('⏳ Ход противника...', 'log-info');
  await sleep(320);

  try {
    for (const e of COMBAT.units.filter(u => u.alive && u.side === 'enemy')) {
      if (!COMBAT.active || COMBAT.over) break;
      e.ap = e.maxAp;
      e.stance = null;
      e.dodgeUsed = false;
      COMBAT.activeId = e.id;
      updateCombatHUD();
      await sleep(200);
      await aiAct(e);
      if (!COMBAT.active || COMBAT.over) break;
      if (checkTeamWipe()) break;
    }
  } finally {
    COMBAT.turnRunning = false;
    COMBAT.busy = false;
  }

  if (!COMBAT.active || COMBAT.over) return;
  COMBAT.round++;
  if (COMBAT.mode === 'step') {
    // Новый раунд: обе стороны снова получают полный пул ОД, стойки
    // сбрасываются. Врагам ОД тоже восстанавливаем — иначе их полоски
    // оставались бы пустыми и не было видно, что противник готов.
    COMBAT.units.filter(u => u.alive).forEach(u => {
      u.ap = u.maxAp;
      u.stance = null;
      u.dodgeUsed = false;
    });
    const first = playerUnitsAlive()[0];
    if (first) COMBAT.activeId = first.id;
    COMBAT.phase = 'player';
    updateCombatHUD();
    showTurnToast(`Раунд ${COMBAT.round}`, 'ваш ход');
    return;
  }
  beginRound();
}

// ==================== ПОЗИЦИОНИРОВАНИЕ ====================
function occupied(step, exceptId) {
  return COMBAT.units.some(u => u.alive && u.id !== exceptId && u.step === step);
}

// Кто стоит на клетке (кроме указанного бойца)
function unitAt(step, exceptId) {
  return COMBAT.units.find(u => u.alive && u.id !== exceptId && u.step === step) || null;
}

function nearestEnemy(unit) {
  const foes = COMBAT.units.filter(u => u.alive && u.side !== unit.side);
  let best = null, bd = 999;
  foes.forEach(f => { const d = Math.abs(f.step - unit.step); if (d < bd) { bd = d; best = f; } });
  return best;
}

// Тяжелораненый боец: в автобое он старается уйти в тыл и не стоять в первом ряду.
function isWoundedUnit(u) {
  if (!u || !u.glad) return false;
  const pct = u.glad.hp / Math.max(1, u.glad.maxHp);
  return pct <= 0.35;
}

// ==================== ПОБЕГ ПРИ МАЛОМ ЗДОРОВЬЕ ====================
// Уходить с песка может любой боец — и наш, и вражеский. Но только
// действительно при смерти (22% здоровья и ниже) и с небольшим шансом:
// раз в секунду бросается кубик, обычно 8%. Псы не бегут никогда.
const FLEE_HP_PCT = 0.22;
const FLEE_CHANCE_PER_SEC = 0.08;

function canFleeByHealth(u) {
  if (!u || !u.alive || u.fled || !u.glad) return false;
  if (u.glad.isDog) return false;
  if (u.boss) return false;              // босс не покидает песок
  return (u.glad.hp / Math.max(1, u.glad.maxHp)) <= FLEE_HP_PCT;
}

// 🧠 Воля — это не только снижение урона, но и готовность стоять до конца.
// Базовый шанс побега (8% в секунду при HP ≤ 22%) умножается на множитель:
// воля 5 — ровно база, воля 1 — почти вдвое выше (трус бежит первым),
// воля 12 и выше — втрое ниже (боец скорее умрёт, чем покинет песок).
// Пределы множителя 0.28…1.9: даже самый стойкий не бессмертен, а самый
// робкий не сбегает мгновенно — иначе бой превращался в лотерею.
const FLEE_WILL_BASE = 5;

function fleeWillMul(u) {
  const attrs = (u && u.glad && typeof effectiveAttrs === 'function' && !u.glad.isDog)
    ? effectiveAttrs(u.glad)
    : (u && u.glad && u.glad.attrs) || null;
  const wil = attrs ? attrs.wil : FLEE_WILL_BASE;
  return clamp(1 - (wil - FLEE_WILL_BASE) * 0.14, 0.28, 1.9);
}

// Итоговый шанс побега в секунду: база × воля, но не выше 22% —
// иначе бойцы начинали бы исчезать с песка почти сразу.
function fleeChanceFor(u) {
  return Math.min(0.22, FLEE_CHANCE_PER_SEC * fleeWillMul(u));
}

// Бросаем кубик раз в секунду для каждого тяжелораненого бойца
function tickFleeRoll(u, dt) {
  if (!canFleeByHealth(u)) { u.fleeAcc = 0; return; }
  u.fleeAcc = (u.fleeAcc || 0) + dt;
  if (u.fleeAcc < 1) return;
  u.fleeAcc = 0;
  if (Math.random() < fleeChanceFor(u)) {
    fleeArena(u);
    checkTeamWipe();
  }
}

// Псы умеют перепрыгивать СВОИХ: зверь перемахивает союзника и встаёт
// на следующую свободную клетку. Чужих не перепрыгивают — только своих.
// В автобое так же поступает тяжелораненый боец: он уходит в тыл.
function canLeapOver(unit, step, dir) {
  if (!unit || !unit.glad) return false;
  // Псы перемахивают своих, лучники и копейщики — переступают,
  // чтобы освободить линию. Раненый в автобое уходит в тыл.
  const mayLeap = unit.glad.isDog
    || isReachUnit(unit)
    || (COMBAT.mode === 'auto' && unit.side === 'player' && isWoundedUnit(unit));
  if (!mayLeap) return false;
  const blocker = unitAt(step, unit.id);
  if (!blocker || blocker.side !== unit.side) return false;
  const landing = step + dir;
  if (landing < 0 || landing >= STEPS) return false;
  return !occupied(landing, unit.id);
}

function moveToward(unit, targetStep, maxSteps) {
  let moved = 0;
  const dir = Math.sign(targetStep - unit.step) || 1;
  while (moved < maxSteps) {
    const next = unit.step + dir;
    if (next < 0 || next >= STEPS) break;
    if (occupied(next, unit.id)) {
      // Собака перепрыгивает своего — прыжок стоит один шаг
      if (canLeapOver(unit, next, dir)) {
        unit.step = next + dir;
        moved++;
        if (unit.step === targetStep) break;
        continue;
      }
      break;
    }
    unit.step = next;
    moved++;
    if (unit.step === targetStep) break;
  }
  return moved;
}

function stepAway(unit, maxSteps) {
  const dir = unit.side === 'player' ? -1 : 1;
  let moved = 0;
  while (moved < maxSteps) {
    const next = unit.step + dir;
    if (next < 0 || next >= STEPS) break;
    if (occupied(next, unit.id)) {
      if (canLeapOver(unit, next, dir)) {
        unit.step = next + dir;
        moved++;
        continue;
      }
      break;
    }
    unit.step = next;
    moved++;
  }
  return moved;
}

function pickTarget(unit) {
  const reach = Math.max(unit.weapon.range || 1, (unit.offWeapon && unit.offWeapon.range) || 1);
  const foes = COMBAT.units.filter(u =>
    u.alive && u.side !== unit.side && Math.abs(u.step - unit.step) <= reach
  );
  if (!foes.length) return null;
  foes.sort((a, b) => {
    const sa = a.glad.hp / a.glad.maxHp + (a.role === 'ranged' ? -0.3 : 0) + (a.boss ? 0.25 : 0);
    const sb = b.glad.hp / b.glad.maxHp + (b.role === 'ranged' ? -0.3 : 0) + (b.boss ? 0.25 : 0);
    return sa - sb;
  });
  return foes[0];
}

// ==================== АТАКА ====================
function limbArmorFor(defender, limbId) {
  if (limbId === 'head') return defender.armorHead;
  if (limbId === 'torso') return defender.armorBody;
  if (limbId === 'armL' || limbId === 'armR') {
    return Math.round((defender.armorArms || 0) + defender.armorBody * 0.35);
  }
  return Math.round((defender.armorLegs || 0) + defender.armorBody * 0.35);
}

function limbHitPenalty(limbId) {
  if (limbId === 'head') return 14;
  if (limbId === 'torso') return 0;
  if (limbId === 'armL' || limbId === 'armR') return 9;
  return 7;
}

// Шанс попадания — единый расчёт для боя и для подсказки в панели прицеливания
function calcHitChance(attacker, defender, limbId, isHeavy, weapon) {
  const w = weapon || attacker.weapon;
  const attrs = attacker.glad.attrs || { str: 5, dex: 5 };
  const heavyPenalty = isHeavy ? 12 : 0;
  const dodgeBonus = defender.stance === 'dodge' ? 20 : 0;
  return clamp(18, 93,
    58 + (attrs.dex || 5) * 2.1 + (w.hitMod || 0) - defender.def * 0.45
    - defender.evasion - dodgeBonus - heavyPenalty - limbHitPenalty(limbId)
    - (attacker.hitPenalty || 0) + (attacker.hitBonus || 0)
  );
}

// Ожидаемый урон по конечности (без учёта блока)
// Броня снижает урон в процентах, а не «съедает» его пулом — иначе тяжёлые
// доспехи полностью гасят слабое оружие и бой вязнет в единицах урона.
function calcDamage(attacker, defender, limbId, isHeavy, baseRoll, weapon) {
  const w = weapon || attacker.weapon;
  const attrs = attacker.glad.attrs || { str: 5, dex: 5 };
  const limbDef = LIMB_BY_ID[limbId] || LIMB_BY_ID.torso;

  // Сила уже учтена в attacker.dmgMul, воля — в defender.drMul
  let raw = baseRoll;
  if (isHeavy) raw *= 1.55;
  raw *= (attacker.dmgMul || 1);
  raw *= (defender.drMul || 1);

  // Классовые и навыковые предпочтения по цели удара
  if (attacker.limbDmgMul && limbId !== 'torso') raw *= attacker.limbDmgMul;
  if (attacker.legDmgMul && (limbId === 'legL' || limbId === 'legR')) raw *= attacker.legDmgMul;
  if (attacker.beastDmgMul && defender.glad && defender.glad.isDog) raw *= attacker.beastDmgMul;
  // Первый удар в бою у велитов и засадников бьёт больнее
  if (attacker.firstStrikeMul && !attacker.hasStruck) raw *= attacker.firstStrikeMul;
  raw = Math.round(raw);

  const armor = limbArmorFor(defender, limbId);
  const pen = w.armorPen || 0.1;
  const mitigation = armor / (armor + 55);
  const effective = clamp(mitigation * (1 - pen), 0, 0.82);

  const hp = Math.max(1, Math.round(raw * (1 - effective) * limbDef.dmgMul));
  const armorDmg = Math.min(armor, Math.max(0, Math.round(raw * 0.3 * (1 - pen * 0.4))));
  return { hp, armor: armorDmg, raw };
}

// Диапазон урона для подсказки в панели прицеливания
function calcDamageEstimate(attacker, defender, limbId, isHeavy, weapon) {
  const w = weapon || attacker.weapon;
  const lo = calcDamage(attacker, defender, limbId, isHeavy, w.dmgMin, w).hp;
  const hi = calcDamage(attacker, defender, limbId, isHeavy, w.dmgMax, w).hp;
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}

function performAttack(attacker, defender, limbId, isHeavy, weaponOverride) {
  const w = weaponOverride || activeWeaponFor(attacker);
  const attrs = attacker.glad.attrs || { str: 5, dex: 5 };
  const limb = LIMB_BY_ID[limbId] ? limbId : 'torso';
  const limbDef = LIMB_BY_ID[limb];

  attacker.tAnim.swing = isHeavy ? 1.7 : 1.2;
  attacker.tAnim.lunge = 1;

  if (isRangedWeapon(w)) {
    COMBAT.projectiles.push({
      x1: stepX(attacker.step), x2: stepX(defender.step),
      y: GROUND - 96 * UNIT_SCALE, p: 0, kind: w.cat
    });
  }

  const heavyPenalty = isHeavy ? 12 : 0;
  const dodgeBonus = defender.stance === 'dodge' ? 20 : 0;
  const hitChance = calcHitChance(attacker, defender, limb, isHeavy, w);

  if (Math.random() * 100 > hitChance) {
    defender.tAnim.dodge = 1.4;
    addFloat(defender, defender.stance === 'dodge' ? 'УКЛОНЕНИЕ' : 'промах', '#9ec5ff', true);
    addLog(`${attacker.glad.name} бьёт в ${limbDef.acc} (${Math.round(hitChance)}%), но <b>${defender.glad.name}</b> уходит!`, 'log-miss');
    sfx('miss');
    return;
  }
  sfx(isRangedWeapon(w) ? 'bow' : 'swing');

  const dmg = calcDamage(attacker, defender, limb, isHeavy, rndInt(w.dmgMin, w.dmgMax), w);
  // Два клинка — руки работают по очереди
  if (attacker.offWeapon) attacker.hand = attacker.hand === 'right' ? 'left' : 'right';
  // Бонус первого удара действует один раз за бой
  attacker.hasStruck = true;
  const raw = dmg.raw;
  let hpDmg = dmg.hp;
  let armorDmg = dmg.armor;

  // Бьёт рукой, которой уже нет (или пустой культёй) — урон ровно 1
  const armGone = strikesWithLostArm(attacker);
  if (armGone) {
    hpDmg = 1;
    armorDmg = 0;
  }

  let blocked = false;
  const blockChance = defender.blockChance + (defender.stance === 'block' ? 30 : 0);
  if (blockChance > 0 && Math.random() * 100 < blockChance && limb !== 'torso') blocked = true;

  if (blocked) {
    hpDmg = Math.max(1, Math.round(hpDmg * 0.28));
    armorDmg = Math.round(armorDmg * 1.5);
    if (defender.armorShield > 0) defender.armorShield = Math.max(0, defender.armorShield - Math.round(raw * 0.45));
    defender.tAnim.block = 1;
    spawnParticles(defender, '#ffd166', 12, 90);
    addFloat(defender, 'БЛОК', '#ffd166', true);
    addFlash(defender, '#ffe9a8');
    addRing(defender, '#ffd166');
    sfx('block');
  } else if (isHeavy) {
    addRing(defender, '#ff9f43');
  }

  // Износ конечности
  const st = defender.limbs[limb];
  let limbBroke = false;
  if (st && !st.lost) {
    const limbDmg = Math.round(raw * 0.7 * limbDef.dmgMul * (blocked ? 0.4 : 1));
    st.hp = Math.max(0, st.hp - limbDmg);
    if (st.hp <= 0) {
      limbBroke = true;
      st.lost = true;
      hpDmg += Math.round(raw * 0.55);
    }
  } else if (st && st.lost) {
    hpDmg = Math.round(hpDmg * 1.35);
  }

  // Руку отрубили — оружие из неё падает в инвентарь
  if (limbBroke && (limb === 'armL' || limb === 'armR')) {
    dropWeaponFromLimb(defender.glad, limb);
  }

  if (limb === 'head') defender.armorHead = Math.max(0, defender.armorHead - armorDmg);
  else if (limb === 'torso') defender.armorBody = Math.max(0, defender.armorBody - armorDmg);
  else defender.armorBody = Math.max(0, defender.armorBody - Math.round(armorDmg * 0.5));

  defender.glad.hp = Math.max(0, defender.glad.hp - hpDmg);
  defender.tAnim.hurt = 1;
  recalcUnit(defender);

  // Кровь
  const bleed = blocked ? 2 : clamp(raw * 0.5, 3, 24);
  bloodBurst(defender, blocked ? 3 : bleed);
  COMBAT.shake = blocked ? 4 : (isHeavy || limb === 'head' ? 15 : 9);

  addFloat(defender, (blocked ? '🛡️ ' : '-') + hpDmg + (armorDmg > 0 ? ` (бр. -${armorDmg})` : ''),
    blocked ? '#ffd166' : (limb === 'head' ? '#ff9f43' : '#ff5959'), !blocked);

  if (limbBroke) {
    const def = LIMB_BY_ID[limb];
    addFloat(defender, `${def.icon} ОТРУБЛЕНО`, '#ff2b2b', true);
    addLog(`🩸 <b>${defender.glad.name}</b> теряет ${def.name.toLowerCase()}! Конечность уничтожена навсегда.`, 'log-crit');
    bloodBurst(defender, 24);
    COMBAT.shake = 22;
    addRing(defender, '#ff2b2b');
    addFlash(defender, '#ff6a5a');
    applyLimbPenaltyText(defender);
    sfx('limb');
  } else if (!blocked) {
    addFlash(defender, limb === 'head' ? '#ffb066' : '#ffe0b0');
    sfx(limb === 'head' ? 'crit' : 'hit');
  }

  if (blocked) addLog(`🛡️ <b>${defender.glad.name}</b> принимает на щит — только ${hpDmg} урона.`, 'log-block');
  else addLog(`${attacker.glad.name} → <b>${defender.glad.name}</b>: в ${limbDef.acc} ${hpDmg} HP${armorDmg ? `, броня -${armorDmg}` : ''}${isHeavy ? ' (мощный)' : ''}`, limb === 'head' ? 'log-crit' : 'log-hit');

  // Смерть
  const headLost = defender.limbs.head && defender.limbs.head.lost;
  const torsoDead = defender.limbs.torso && defender.limbs.torso.hp <= 0;
  if (defender.glad.hp <= 0 || headLost || torsoDead) {
    killUnit(defender, headLost ? 'голова отрублена' : 'раны несовместимы с жизнью');
  }
}

function applyLimbPenaltyText(u) {
  if (u.lostArms >= 2) addLog(`💀 <b>${u.glad.name}</b> без рук — почти беззащитен.`, 'log-crit');
  else if (u.lostArms === 1) addLog(`⚠️ <b>${u.glad.name}</b> теряет хват: урон −26%, точность −8.`, 'log-warn');
  if (u.lostLegs >= 2) addLog(`⚠️ <b>${u.glad.name}</b> не может идти: ОД −2.`, 'log-warn');
  else if (u.lostLegs === 1) addLog(`⚠️ <b>${u.glad.name}</b> хромает: ОД −1.`, 'log-warn');
}

// Боец покидает арену живым: он больше не цель и не участвует в бою.
// Используется ранеными в автобое, когда отходить уже некуда.
function fleeArena(u) {
  if (!u || u.fled) return;
  u.fled = true;
  u.alive = false;
  u.stepLock = true;
  if (u.side === 'enemy') {
    addFloat(u, 'БЕЖИТ', '#ffd98a', true);
    addLog(`🏃 <b>${u.glad.name}</b> бежит с арены, бросив оружие.`, 'log-win');
    sfx('miss');
  } else {
    addFloat(u, 'ПОКИНУЛ АРЕНУ', '#9ec5ff', true);
    addLog(`🏃 <b>${u.glad.name}</b> уходит с песка, сохраняя жизнь.`, 'log-warn');
  }
  if (COMBAT.activeId === u.id) COMBAT.activeId = null;
  if (COMBAT.menu && COMBAT.menu.unitId === u.id) COMBAT.menu = null;
}

function killUnit(defender, reason) {
  defender.alive = false;
  defender.anim.dead = 1;
  defender.glad.hp = 0;
  addFloat(defender, 'ПОВЕРЖЕН', '#ff4444', true);
  addLog(`💀 <b>${defender.glad.name}</b> падает на песок. ${reason}.`, 'log-crit');
  bloodBurst(defender, 26);
  COMBAT.shake = 20;
  sfx('death');
  if (COMBAT.activeId === defender.id) COMBAT.activeId = null;
  if (COMBAT.aim && COMBAT.aim.targetId === defender.id) COMBAT.aim = null;
}

function checkTeamWipe() {
  const playersAlive = COMBAT.units.some(u => u.alive && u.side === 'player');
  const enemiesAlive = COMBAT.units.some(u => u.alive && u.side === 'enemy');
  if (!enemiesAlive) { finishCombat(true); return true; }
  if (!playersAlive) {
    // Если отряд не погиб, а разбежался с арены — это отступление, не поражение
    const anyFled = COMBAT.units.some(u => u.side === 'player' && u.fled);
    finishCombat(false, anyFled);
    return true;
  }
  return false;
}

// ==================== ДЕЙСТВИЯ ИГРОКА ====================
function getActiveUnit() {
  return COMBAT.units.find(u => u.id === COMBAT.activeId && u.alive) || null;
}
function playerUnitsAlive() {
  return COMBAT.units.filter(u => u.alive && u.side === 'player');
}
function canControl() {
  return COMBAT.active && !COMBAT.over && !COMBAT.busy;
}

// ==================== КЛИКЕР-БОЙ ====================
// Бойцы двигаются сами. Атака — только по клику игрока в конкретную
// конечность. У каждого бойца свой кулдаун: 2 с вплотную, 4 с на дистанции,
// плюс поправка на вес оружия и ловкость.

function attackCooldownFor(u, weapon) {
  const w = weapon || u.weapon || {};
  const ranged = isRangedWeapon(w);
  const base = ranged ? 4000 : 2000;
  // Вес оружия: каждый «кг» сверх лёгкого клинка добавляет замах
  const weight = w.weight != null ? w.weight : (w.apCost || 3) * 0.7;
  const weightMul = clamp(0.75, 2.0, 0.72 + weight * 0.17);
  const attrs = (typeof effectiveAttrs === 'function' && !u.glad.isDog)
    ? effectiveAttrs(u.glad)
    : (u.glad.attrs || {});
  const dex = attrs.dex || 5;
  // Ловкость ускоряет: каждое очко сверх 5 даёт 3.5%
  const speedMul = clamp(0.62, 1.18, 1 - (dex - 5) * 0.035);
  // Навыки скорости (Быстрые руки → Скорость → Молния)
  const skillMul = (typeof speedSkillMul === 'function') ? speedSkillMul(u.glad) : 1;
  return Math.max(500, Math.round(base * weightMul * speedMul * skillMul));
}

// Оружие, которым боец бьёт в этот раз: при двух клинках руки чередуются
function activeWeaponFor(u) {
  if (u.offWeapon && u.hand === 'left') return u.offWeapon;
  return u.weapon;
}

function cdLeft(u) {
  return Math.max(0, (u.cdUntil || 0) - performance.now());
}

// Запуск кликер-боя: кулдауны в ноль, фазы не нужны
function beginClicker() {
  if (!COMBAT.active) return;
  COMBAT.phase = 'player';
  COMBAT.busy = false;
  COMBAT.clock = 0;
  // Меню бойца открывается только по клику на своего персонажа
  COMBAT.menu = null;
  COMBAT.aim = null;
  COMBAT.units.forEach(u => {
    u.cdUntil = 0;
    u.moveAcc = 0;
    u.ap = u.maxAp;
    u.hand = 'right';
    u.stance = null;
    u.hitPenalty = 0;
  });
  addLog('🥊 Бой начался. Кликайте по врагу — куда попадёте, туда и удар.', 'log-round');
  sfx('round');
  updateCombatHUD();
}

// Кто из моих бойцов может ударить цель прямо сейчас
function readyAttackersFor(target) {
  const now = performance.now();
  return playerUnitsAlive().filter(u => {
    const w = activeWeaponFor(u);
    return now >= (u.cdUntil || 0) && Math.abs(u.step - target.step) <= (w.range || 1);
  });
}

// Атака игрока по конкретной конечности
function clickerAttack(target, limbId) {
  if (!COMBAT.active || COMBAT.over || !target || !target.alive) return;
  const now = performance.now();
  const mine = playerUnitsAlive();
  if (!mine.length) return;

  const ready = readyAttackersFor(target);
  if (!ready.length) {
    // Подсказка, почему не вышло
    const anyInRange = mine.some(u => Math.abs(u.step - target.step) <= (activeWeaponFor(u).range || 1));
    if (!anyInRange) {
      const u = mine[0];
      if (u) addFloat(u, 'далеко — подходим', '#9e8c76');
    } else {
      const u = mine.find(x => Math.abs(x.step - target.step) <= (activeWeaponFor(x).range || 1));
      if (u) addFloat(u, 'перезарядка', '#9e8c76');
      sfx('error');
    }
    return;
  }

  // Бьёт тот, кто готов раньше всех — отряд не ждёт одного бойца
  const u = ready.slice().sort((a, b) => (a.cdUntil || 0) - (b.cdUntil || 0))[0];
  const w = activeWeaponFor(u);
  const st = target.limbs[limbId];
  if (!st || st.lost) {
    // Бьём в другую целую часть
    const alt = LIMB_DEFS.find(l => !target.limbs[l.id].lost);
    if (!alt) return;
    limbId = alt.id;
  }

  u.cdUntil = now + attackCooldownFor(u, w);
  u.tAnim.lunge = 1;
  performAttack(u, target, limbId, false, w);
  updateCombatHUD();
  if (checkTeamWipe()) return;
}

// Дальнобойный боец: лучник или копейщик (оружие бьёт на 2+ клетки).
// Такие бойцы умеют переступать через своих, чтобы занять позицию.
function isReachUnit(u) {
  if (!u || !u.glad || u.glad.isDog) return false;
  const w = u.weapon;
  if (!w) return false;
  const reach = Math.max(w.range || 1, (u.offWeapon && u.offWeapon.range) || 1);
  return isRangedWeapon(w) || reach >= 2;
}

// Направление «вперёд» для бойца: к ближайшему врагу
function forwardDir(u) {
  const foe = nearestEnemy(u);
  if (foe && foe.step !== u.step) return Math.sign(foe.step - u.step);
  return u.side === 'player' ? 1 : -1;
}

// Кто стоит непосредственно перед бойцом (в сторону врага)
function unitAhead(u) {
  return unitAt(u.step + forwardDir(u), u.id);
}

// Прямо перед бойцом стоит свой
function allyAhead(u) {
  const blocker = unitAhead(u);
  return !!blocker && blocker.side === u.side;
}

// Прямо перед бойцом стоит враг
function enemyAhead(u) {
  const blocker = unitAhead(u);
  return !!blocker && blocker.side !== u.side;
}

// Автоудар без команды игрока: только лучники и копейщики.
// Если прямо перед ними свой боец — они действуют сами: стреляют
// через голову или переступают через своих. Если перед ними враг —
// только ручное управление: игрок сам решает, когда бить.
function canAutoStrike(u) {
  if (!isReachUnit(u)) return false;
  return !enemyAhead(u);
}

// Автодвижение и вражеские атаки
function clickerTick(dt) {
  if (!COMBAT.active || COMBAT.over) return;
  // Пошаговый режим живёт по раундам: бойцы не ходят и не бьют сами.
  // Движение — playerEngage, удары — playerAttackLimb, враги — endPlayerTurn.
  if (COMBAT.mode === 'step') return;
  COMBAT.clock += dt * 1000;
  const now = performance.now();
  const STEP_TIME = 0.34; // секунд на клетку

  // Побег по здоровью: и наши, и враги бросают кубик раз в секунду
  COMBAT.units.forEach(u => {
    if (u.alive && !u.fled) tickFleeRoll(u, dt);
  });
  if (COMBAT.over) return;

  // Мои бойцы: подходят к ближайшему врагу.
  // В автобое раненый отходит назад, перепрыгивая своих.
  // В пошаговом режиме никто не двигается сам: подход выполняет
  // playerEngage, когда игрок кликает по цели.
  if (COMBAT.mode === 'auto') playerUnitsAlive().forEach(u => {
    if (u.stepLock || u.fled) return;
    const foe = nearestEnemy(u);
    if (!foe) return;

    if (COMBAT.mode === 'auto' && isWoundedUnit(u)) {
      // Отступаем, пока есть куда: перепрыгиваем своих и уходим в тыл.
      u.moveAcc = (u.moveAcc || 0) + dt;
      if (u.moveAcc < STEP_TIME) return;
      u.moveAcc = 0;
      const moved = stepAway(u, 1);
      if (moved) { sfx('step'); return; }
      // Дошёл до своего края арены — покидает бой живым.
      // Псы дерутся до конца: они не уходят с песка.
      // Если отходить некуда, но до края ещё далеко (строй запер) —
      // боец стоит на месте и бьёт вместе со всеми.
      if (u.step === 0 && !u.glad.isDog) {
        fleeArena(u);
        checkTeamWipe();
      }
      return;
    }

    const dist = Math.abs(foe.step - u.step);
    const want = activeWeaponFor(u).range || 1;
    if (dist <= want) return;

    u.moveAcc = (u.moveAcc || 0) + dt;
    if (u.moveAcc < STEP_TIME) return;
    u.moveAcc = 0;
    const moved = moveToward(u, foe.step, 1);
    if (moved) sfx('step');
  });

  // Ручной режим: лучники и копейщики бьют сами, не дожидаясь клика,
  // но только если прямо перед ними свой боец — они стреляют через голову
  // или переступают. Если перед ними враг — только ручное управление.
  if (COMBAT.mode === 'manual') {
    playerUnitsAlive().forEach(u => {
      if (!canAutoStrike(u)) return;
      if (now < (u.cdUntil || 0)) return;
      const target = pickTarget(u);
      if (!target) return;
      const w = activeWeaponFor(u);
      u.cdUntil = now + attackCooldownFor(u, w);
      performAttack(u, target, aiPickLimb(u, target), false, w);
      updateCombatHUD();
      checkTeamWipe();
    });
  }

  // Автобой: все бойцы бьют по кулдауну, если игрок его включил
  if (COMBAT.mode === 'auto') {
    playerUnitsAlive().forEach(u => {
      if (now < (u.cdUntil || 0)) return;
      const target = pickTarget(u);
      if (!target) return;
      const w = activeWeaponFor(u);
      u.cdUntil = now + attackCooldownFor(u, w);
      performAttack(u, target, aiPickLimb(u, target), false, w);
      updateCombatHUD();
      checkTeamWipe();
    });
  }

  // Пошаговый режим: сам игрок решает, кто и куда бьёт. Но враги всё равно
  // действуют по таймеру — иначе бой замирал бы, пока игрок думает.
  // Вражеская часть ниже общая для всех режимов.

  // Враги: подходят и бьют по своему кулдауну.
  // Лучники и копейщики врага тоже переступают через своих,
  // чтобы не толкаться в строю.
  COMBAT.units.filter(u => u.alive && u.side === 'enemy').forEach(e => {
    // Босс: в кликер-бою у него свой ритм магии. Способности идут
    // по таймеру независимо от обычного кулдауна удара.
    if (e.boss && e.abilities && e.abilities.length) {
      // Кулдауны способностей тикают временем: в кликер-бою нет раундов
      e.abilities.forEach(a => {
        if (a.cdLeft > 0) a.cdLeft = Math.max(0, a.cdLeft - dt * 0.55);
      });
      if (!e.casting) {
        if (e.abilityTimer == null) e.abilityTimer = 3200;
        e.abilityTimer -= dt * 1000;
        if (e.abilityTimer <= 0) {
          const ab = bossAbilityReady(e);
          if (ab) {
            e.casting = true;
            e.abilityTimer = 5200 + Math.random() * 2600;
            useBossAbility(e, ab).then(() => {
              e.casting = false;
              updateCombatHUD();
              checkTeamWipe();
            });
            return;
          }
          e.abilityTimer = 900;
        }
      }
    }

    const target = pickTarget(e);
    if (!target) {
      const foe = nearestEnemy(e);
      if (!foe) return;
      e.moveAcc = (e.moveAcc || 0) + dt;
      if (e.moveAcc < STEP_TIME) return;
      e.moveAcc = 0;
      // Лучники отходят, если враг слишком близко
      const d = Math.abs(foe.step - e.step);
      if (isRangedWeapon(e.weapon) && d < 3) stepAway(e, 1);
      else moveToward(e, foe.step, 1);
      return;
    }
    if (now < (e.cdUntil || 0)) return;
    const ew = activeWeaponFor(e);
    e.cdUntil = now + attackCooldownFor(e, ew);
    performAttack(e, target, aiPickLimb(e, target), false, ew);
    updateCombatHUD();
    checkTeamWipe();
  });
}

function selectUnit(id) {
  const u = COMBAT.units.find(x => x.id === id);
  if (!u || !u.alive || u.side !== 'player') return;
  if (!canControl()) return;
  COMBAT.activeId = id;
  COMBAT.aim = null;
  COMBAT.menu = { unitId: id };
  sfx('click');
  updateCombatHUD();
  if (COMBAT.mode === 'step') renderUnitMenu();
}

// Открыть/закрыть панель выбора конечности
function openAim(target) {
  if (!target || !target.alive) return;
  COMBAT.aim = { targetId: target.id };
  COMBAT.menu = null;
  sfx('open');
  updateCombatHUD();
}

function closeAim() {
  COMBAT.aim = null;
  sfx('close');
  updateCombatHUD();
}

function attackLimb(limbId) {
  if (!COMBAT.aim) return;
  const target = COMBAT.units.find(u => u.id === COMBAT.aim.targetId);
  if (!target || !target.alive) { closeAim(); return; }
  // Пошаговый режим тратит ОД и передаёт ход; кликер — только кулдаун.
  if (COMBAT.mode === 'step') { playerAttackLimb(target, limbId); return; }
  clickerAttack(target, limbId);
}

async function playerAttackLimb(target, limbId) {
  const u = getActiveUnit();
  if (!u || !canControl() || !target || !target.alive) return;

  const st = target.limbs[limbId];
  if (!st || st.lost) { addFloat(target, 'эта часть уже потеряна', '#9e8c76'); return; }

  const range = u.weapon.range;
  let dist = Math.abs(target.step - u.step);

  if (dist > range) {
    const want = Math.min(DASH_STEPS, u.ap, dist - range);
    if (want <= 0) { addFloat(u, 'мало ОД', '#9e8c76'); return; }
    COMBAT.busy = true;
    const moved = moveToward(u, target.step, want);
    u.ap -= moved;
    addLog(`🏃 <b>${u.glad.name}</b> идёт в атаку.`, 'log-move');
    updateCombatHUD();
    await sleep(320);
    COMBAT.busy = false;
    dist = Math.abs(target.step - u.step);
    if (dist > range) { updateCombatHUD(); return; }
  }

  const heavy = COMBAT.heavyMode;
  const cost = u.weapon.apCost + (heavy ? 2 : 0);
  if (u.ap < cost) { addFloat(u, 'мало ОД', '#9e8c76'); updateCombatHUD(); return; }

  u.ap -= cost;
  performAttack(u, target, limbId, heavy);
  updateCombatHUD();
  if (checkTeamWipe()) return;
  autoAdvanceTurn();
}

// Клик по врагу: подход и панель конечностей
async function playerEngage(target) {
  const u = getActiveUnit();
  if (!u || !canControl() || !target || !target.alive) return;

  const range = u.weapon.range;
  let dist = Math.abs(target.step - u.step);

  if (dist > range) {
    const want = Math.min(DASH_STEPS, u.ap, dist - range);
    if (want <= 0) { addFloat(u, 'мало ОД', '#9e8c76'); return; }
    COMBAT.busy = true;
    const moved = moveToward(u, target.step, want);
    u.ap -= moved;
    addLog(`🏃 <b>${u.glad.name}</b> сокращает дистанцию.`, 'log-move');
    updateCombatHUD();
    await sleep(320);
    COMBAT.busy = false;
    dist = Math.abs(target.step - u.step);
    if (dist > range) { updateCombatHUD(); return; }
  }

  openAim(target);
}

function stepActive(dir) {
  const u = getActiveUnit();
  if (!u || !canControl()) return;
  if (u.ap < STEP_COST) { addFloat(u, 'мало ОД', '#9e8c76'); return; }
  const next = u.step + dir;
  if (next < 0 || next >= STEPS) return;
  if (occupied(next, u.id)) { addFloat(u, 'занято', '#9e8c76'); return; }
  u.step = next;
  u.ap -= STEP_COST;
  COMBAT.aim = null;
  COMBAT.menu = null;
  sfx('step');
  updateCombatHUD();
  autoAdvanceTurn();
}

function dashForward() {
  const u = getActiveUnit();
  if (!u || !canControl()) return;
  const foe = nearestEnemy(u);
  if (!foe) return;
  const dist = Math.abs(foe.step - u.step);
  const want = Math.min(DASH_STEPS, u.ap, Math.max(0, dist - u.weapon.range));
  if (want <= 0) {
    if (dist <= u.weapon.range) addFloat(u, 'уже в зоне удара', '#ffd166');
    else addFloat(u, 'мало ОД', '#9e8c76');
    return;
  }
  const moved = moveToward(u, foe.step, want);
  if (!moved) { addFloat(u, 'путь закрыт', '#9e8c76'); return; }
  u.ap -= moved;
  COMBAT.aim = null;
  COMBAT.menu = null;
  sfx('move');
  addLog(`🏃 <b>${u.glad.name}</b> сокращает дистанцию.`, 'log-move');
  updateCombatHUD();
  autoAdvanceTurn();
}

function setStance(kind) {
  const u = getActiveUnit();
  if (!u || !canControl()) return;
  if (u.stance === kind) { u.stance = null; updateCombatHUD(); return; }

  // Уклонение: 1 ОД и только раз за ход
  if (kind === 'dodge' && u.dodgeUsed) {
    addFloat(u, 'уклон уже был', '#9e8c76');
    sfx('error');
    return;
  }

  const cost = kind === 'dodge' ? DODGE_COST : STANCE_COST;
  if (u.ap < cost) { addFloat(u, 'мало ОД', '#9e8c76'); sfx('error'); return; }
  if (kind === 'block' && u.armorShield <= 0) { addFloat(u, 'нужен щит', '#9e8c76'); sfx('error'); return; }

  u.ap -= cost;
  u.stance = kind;
  if (kind === 'dodge') u.dodgeUsed = true;

  if (kind === 'block') {
    u.tAnim.block = 1;
    addLog(`🛡️ <b>${u.glad.name}</b> поднимает щит.`, 'log-block');
    sfx('block');
  } else {
    addLog(`💨 <b>${u.glad.name}</b> готов уклоняться (1 раз за ход).`, 'log-info');
    sfx('move');
  }
  updateCombatHUD();
  autoAdvanceTurn();
}

function toggleHeavy() {
  COMBAT.heavyMode = !COMBAT.heavyMode;
  sfx('click');
  updateCombatHUD();
}

// Показ короткого уведомления на арене
let turnToastTimer = null;
function showTurnToast(main, sub) {
  const el = document.getElementById('turn-toast');
  if (!el) return;
  el.innerHTML = `${main}${sub ? `<small>${sub}</small>` : ''}`;
  el.classList.add('show');
  clearTimeout(turnToastTimer);
  turnToastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// Автопереход: если у бойца не осталось ОД на действие — передаём ход следующему
function autoAdvanceTurn() {
  if (!canControl()) return;
  // Пошаговый режим: ход НЕ завершается от одного действия, но как только
  // у всего отряда кончились ОД — передаём ход противнику автоматически.
  // Иначе игрок оставался с пустыми полосками и был вынужден жать кнопку.
  if (COMBAT.mode === 'step') {
    const players = playerUnitsAlive();
    const able = players.filter(u => (u.ap || 0) >= 1);
    if (!able.length) {
      showTurnToast('Ход завершён', 'у отряда закончились очки действий');
      setTimeout(() => {
        if (canControl() && COMBAT.mode === 'step' && !COMBAT.turnRunning) endPlayerTurn(true);
      }, 600);
      return;
    }
    const cur = getActiveUnit();
    if (!cur || (cur.ap || 0) < 1) {
      const next = able[0];
      COMBAT.activeId = next.id;
      COMBAT.menu = null;
      COMBAT.aim = null;
      updateCombatHUD();
    }
    return;
  }
  const cur = getActiveUnit();
  const players = playerUnitsAlive();
  const able = players.filter(u => u.ap >= STEP_COST);

  if (!able.length) {
    showTurnToast('Ход завершён', 'у отряда закончились очки действий');
    setTimeout(() => { if (canControl()) endPlayerTurn(); }, 620);
    return;
  }

  // Текущий боец исчерпал ОД — переключаемся на того, у кого они есть
  if (!cur || cur.ap < STEP_COST) {
    const next = able[0];
    COMBAT.activeId = next.id;
    COMBAT.menu = null;
    COMBAT.aim = null;
    showTurnToast(`Ходит ${next.glad.name.split(' ')[0]}`, 'у предыдущего бойца закончились ОД');
    updateCombatHUD();
  }
}

// Кнопка «пропустить ход» в пошаговом режиме.
// force = true: передать ход можно в любой момент, независимо от того,
// что успела сделать проверка фазы — кнопка не должна «залипать».
function endTurnNow() {
  if (!COMBAT.active || COMBAT.over) return;
  if (COMBAT.mode !== 'step') return;
  if (COMBAT.turnRunning) return;
  COMBAT.aim = null;
  COMBAT.menu = null;
  sfx('click');
  endPlayerTurn(true);
}

// ==================== КЛИКИ И КАМЕРА ====================
function screenToWorld(sx, sy, W, H) {
  const cam = COMBAT.cam;
  const originX = W / 2 - cam.focusX * cam.scale;
  const originY = H * 0.80 - GROUND * cam.scale;
  return { x: (sx - originX) / cam.scale, y: (sy - originY) / cam.scale };
}

function canvasMetrics() {
  const canvas = document.getElementById('arenaCanvas');
  if (!canvas) return null;
  const wrap = canvas.parentElement;
  return { canvas, W: wrap.clientWidth || 900, H: wrap.clientHeight || 420 };
}

function evPos(e) {
  const m = canvasMetrics();
  if (!m) return { mx: 0, my: 0, W: 900, H: 420 };
  const rect = m.canvas.getBoundingClientRect();
  return { mx: e.clientX - rect.left, my: e.clientY - rect.top, W: m.W, H: m.H };
}

function hitTestUnit(mx, my, W, H) {
  const w = screenToWorld(mx, my, W, H);
  let best = null, bestD = 1e9;
  COMBAT.units.forEach(u => {
    if (!u.alive) return;
    const ux = stepX(u.step);
    const hw = 54;
    if (Math.abs(w.x - ux) > hw) return;
    if (w.y > GROUND + 26 || w.y < GROUND - 235) return;
    const d = Math.abs(w.x - ux) + Math.abs(w.y - (GROUND - 110));
    if (d < bestD) { bestD = d; best = u; }
  });
  return best;
}

function stepFromWorldX(wx) {
  return clamp(Math.round((wx - MARGIN) / STEP_W), 0, STEPS - 1);
}

function arenaClick(e) {
  if (!COMBAT.active || COMBAT.over) return;
  const { mx, my, W, H } = evPos(e);
  const hit = hitTestUnit(mx, my, W, H);

  if (hit) {
    if (hit.side === 'player') { selectUnit(hit.id); return; }
    // Клик по врагу:
    //   кликер — сразу удар в ту часть тела, куда попали;
    //   пошаговый — подход и панель выбора конечности с шансами;
    //   автобой — только подсветка цели, бьёт ИИ.
    if (COMBAT.mode === 'step') { playerEngage(hit); return; }
    if (COMBAT.mode === 'auto') { COMBAT.aim = { targetId: hit.id }; return; }
    const limbId = limbFromClick(hit, mx, my, W, H);
    clickerAttack(hit, limbId);
    return;
  }

  if (COMBAT.aim) { closeAim(); return; }
  if (COMBAT.menu) { closeUnitMenu(); }
}

// Попадание в конечность по координате клика внутри фигуры.
// Считаем не «долю высоты вообще», а положение внутри конкретной фигуры:
// у неё есть свой центр и своя высота на экране.
function limbFromClick(target, mx, my, W, H) {
  const cam = COMBAT.cam;
  const originX = W / 2 - cam.focusX * cam.scale;
  const originY = H * 0.80 - GROUND * cam.scale;
  const sxCenter = originX + stepX(target.step) * cam.scale;
  const syFeet = originY + GROUND * cam.scale;
  const figH = 150 * UNIT_SCALE * cam.scale;

  // Доля от ступней (0) до макушки (1)
  const k = clamp01((syFeet - my) / Math.max(1, figH));
  const dx = (mx - sxCenter) / Math.max(1, cam.scale); // в единицах фигуры
  const facing = target.side === 'player' ? 1 : -1;
  // Левая/правая сторона фигуры с точки зрения бойца
  const leftSide = dx * facing < 0;

  if (k > 0.82) return 'head';
  if (k > 0.55) return leftSide ? 'armR' : 'armL';   // плечи и руки
  if (k > 0.30) return 'torso';                       // корпус
  return leftSide ? 'legL' : 'legR';                  // ноги
}

// Открыть прицел и, если попали в конечность, сразу ударить
function openAimAt(target, mx, my, W, H) {
  const limbId = limbFromClick(target, mx, my, W, H);
  COMBAT.aim = { targetId: target.id };
  COMBAT.menu = null;
  sfx('open');
  clickerAttack(target, limbId);
  updateCombatHUD();
}

// Пыль из-под ног при перемещении
function dustTrail(unit, fromStep, toStep) {
  const a = Math.min(fromStep, toStep), b = Math.max(fromStep, toStep);
  for (let s = a; s <= b; s++) {
    const x = stepX(s);
    for (let i = 0; i < 6; i++) {
      COMBAT.particles.push({
        x: x + rnd(-16, 16),
        y: GROUND - rnd(0, 10),
        vx: rnd(-40, 40), vy: rnd(-70, -15),
        size: rnd(2, 5), color: 'rgba(210,186,148,0.75)', life: 1, decay: rnd(1.4, 2.4), grav: 0.35
      });
    }
  }
}

function arenaMove(e) {
  if (!COMBAT.active) return;
  const { mx, my, W, H } = evPos(e);
  const hit = hitTestUnit(mx, my, W, H);
  COMBAT.hoverId = hit ? hit.id : null;

  const w = screenToWorld(mx, my, W, H);
  COMBAT.hoverStep = (!hit && w.y > GROUND - 40) ? stepFromWorldX(w.x) : null;

  let pointer = false;
  if (hit) pointer = canControl();
  else if (COMBAT.hoverStep != null && canControl()) pointer = true;
  const m = canvasMetrics();
  if (m) m.canvas.style.cursor = pointer ? 'pointer' : 'default';
}

function updateCamera(dt) {
  const cam = COMBAT.cam;
  const alive = COMBAT.units.filter(u => u.alive);
  const m = canvasMetrics();
  const W = m ? m.W : 900;
  const H = m ? m.H : 420;

  let focusX = WORLD_W / 2;
  let span = 6;

  if (alive.length) {
    let minX = Infinity, maxX = -Infinity;
    alive.forEach(u => {
      const x = stepX(u.step);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    });
    focusX = (minX + maxX) / 2;
    span = Math.max(4, (maxX - minX) / STEP_W);
  }

  const needed = span * STEP_W + 560;
  let scale = clamp(W / needed, 0.5, 1.3);

  const maxByHeight = H * 0.62 / (260 * UNIT_SCALE);
  scale = Math.min(scale, Math.max(0.5, maxByHeight));

  const halfView = W / (2 * scale);
  if (halfView * 2 >= WORLD_W) focusX = WORLD_W / 2;
  else focusX = clamp(focusX, halfView - 40, WORLD_W - halfView + 40);

  if (!cam.init) {
    cam.focusX = focusX; cam.scale = scale; cam.init = true;
  } else {
    const t = clamp(dt * 5.5, 0, 1);
    cam.focusX = lerp(cam.focusX, focusX, t);
    cam.scale = lerp(cam.scale, scale, t);
  }
}

function updateAnims(dt) {
  COMBAT.units.forEach(u => {
    const a = u.anim, t = u.tAnim;
    t.swing *= 0.82;
    t.lunge *= 0.84;
    t.hurt *= 0.84;
    t.block *= 0.88;
    t.dodge *= 0.85;
    if (u.alive) t.victory = COMBAT.over && u.side === 'player' ? 1 : t.victory * 0.9;

    a.swing = lerp(a.swing, t.swing, clamp(dt * 18, 0, 1));
    a.lunge = lerp(a.lunge, t.lunge, clamp(dt * 16, 0, 1));
    a.hurt = lerp(a.hurt, t.hurt, clamp(dt * 16, 0, 1));
    a.block = lerp(a.block, u.stance === 'block' ? 1 : t.block, clamp(dt * 14, 0, 1));
    a.dodge = lerp(a.dodge, t.dodge, clamp(dt * 16, 0, 1));
    a.victory = lerp(a.victory, t.victory, clamp(dt * 5, 0, 1));

    const moving = Math.abs(u.drawStep - u.step) > 0.02;
    a.walk = lerp(a.walk, moving ? 1 : 0, clamp(dt * 10, 0, 1));
    if (moving) a.walkPhase += dt * 13;
    u.drawStep = lerp(u.drawStep, u.step, clamp(dt * 11, 0, 1));
    if (Math.abs(u.drawStep - u.step) < 0.01) u.drawStep = u.step;

    if (!u.alive) a.dead = lerp(a.dead, 1, clamp(dt * 5, 0, 1));
  });
}

// ==================== HUD ====================
function limbPips(u) {
  return `<div class="limb-pips">${LIMB_DEFS.map(l => {
    const s = u.limbs[l.id];
    if (!s) return '';
    const pct = s.lost ? 0 : s.hp / s.max;
    const cls = s.lost ? 'lost' : pct < 0.3 ? 'low' : pct < 0.65 ? 'mid' : 'ok';
    return `<span class="lp ${cls}" title="${l.name}${s.lost ? ' — потеряна' : ''}">${s.lost ? '✕' : l.icon}</span>`;
  }).join('')}</div>`;
}

// Полоска очков действия: столько делений, сколько ОД у бойца.
// В пошаговом бою это главный ресурс — без него не видно, почему
// удар недоступен. Цвет делений: полные — золотые, пустые — тёмные.
function apPips(u) {
  const max = Math.max(1, u.maxAp || 1);
  const cur = Math.max(0, Math.min(max, u.ap || 0));
  let pips = '';
  for (let i = 0; i < max; i++) {
    pips += `<i class="ap-pip ${i < cur ? 'on' : ''}"></i>`;
  }
  return `<div class="ap-row" title="Очки действия: ${cur} из ${max}">
    <span class="ap-lbl">⚡</span><div class="ap-pips">${pips}</div><b class="ap-num">${cur}/${max}</b>
  </div>`;
}

function updateCombatHUD() {
  const rp = document.getElementById('team-player');
  const re = document.getElementById('team-enemy');
  const rb = document.getElementById('round-badge');
  const up = document.getElementById('unit-panel');
  const act = document.getElementById('combat-controls');
  const hint = document.getElementById('combat-hint');
  if (!rp || !re) return;

  const chip = u => {
    const dead = !u.alive;
    const pct = Math.max(0, u.glad.hp / u.glad.maxHp) * 100;
    const sel = u.id === COMBAT.activeId;
    const stanceIcon = u.stance === 'block' ? '🛡️' : u.stance === 'dodge' ? '💨' : '';
    const lost = lostLimbs(u.glad).length;
    const magicIcon = u.glad.magic && MAGIC_SCHOOLS[u.glad.magic]
      ? `<i style="color:${MAGIC_SCHOOLS[u.glad.magic].color}">${MAGIC_SCHOOLS[u.glad.magic].icon}</i>` : '';
    return `<div class="unit-chip ${dead ? 'dead' : ''} ${sel ? 'sel' : ''} ${u.side} ${u.boss ? 'boss' : ''}" data-id="${u.id}">
      <div class="chip-top">
        <span class="chip-role">${roleIcon(u)}</span>
        <span class="chip-name">${u.glad.name}</span>
        <span class="chip-stance">${magicIcon}${stanceIcon}${lost ? ` <i class="chip-lost">${lost}✕</i>` : ''}</span>
      </div>
      <div class="chip-bar"><i style="width:${pct}%;background:${pct > 55 ? '#5aa870' : pct > 25 ? '#e5b54f' : '#c0392b'}"></i></div>
      ${!dead && !u.fled ? apPips(u) : ''}
      <div class="chip-meta">${u.fled ? 'покинул арену' : dead ? 'пал' : `${u.glad.hp}/${u.glad.maxHp}`}${u.iceShield > 0 ? ` ❄${u.iceShield}` : ''}</div>
    </div>`;
  };

  rp.innerHTML = COMBAT.units.filter(u => u.side === 'player').map(chip).join('');
  re.innerHTML = COMBAT.units.filter(u => u.side === 'enemy').map(chip).join('');
  rp.querySelectorAll('.unit-chip').forEach(el => el.onclick = () => selectUnit(el.dataset.id));

  const now = performance.now();
  const readyCount = playerUnitsAlive().filter(u => now >= (u.cdUntil || 0)).length;
  // Живой шанс победы: пересчитывается по текущему состоянию боя,
  // а не висит цифрой, снятой до выхода на песок. В автобое это
  // главный индикатор, поэтому он должен отражать реальность.
  const live = COMBAT.over ? COMBAT.winChance : liveWinChance();
  const lvClass = live >= 65 ? 'good' : live >= 40 ? 'even' : 'hard';
  if (rb) rb.innerHTML = `<span class="round-num">Бой • раунд ${COMBAT.round}</span>
    <span class="win-meter ${lvClass}" title="Живой шанс победы: переоценивается каждый ход по HP и составу отрядов">
      <b>${live}%</b><small>${winChanceLabel(live)}</small>
    </span>
    <span class="round-phase player">${COMBAT.mode === 'step'
      ? (COMBAT.phase === 'enemy' ? 'ХОД ПРОТИВНИКА' : 'ВАШ ХОД')
      : (readyCount ? 'ГОТОВЫ БИТЬ' : 'ПЕРЕЗАРЯДКА')}</span>
    <button class="mode-toggle ${COMBAT.mode}" onclick="cycleCombatMode()" title="Переключить режим: автобой → кликер → пошаговый">
      ${COMBAT_MODE_INFO[COMBAT.mode] ? COMBAT_MODE_INFO[COMBAT.mode].label : COMBAT.mode}
    </button>
    ${COMBAT.mode === 'step' ? `<button class="skip-turn-btn ${COMBAT.turnRunning ? 'busy' : ''}" onclick="endTurnNow()" title="Завершить ход: противники ответят сразу">${COMBAT.turnRunning ? '⏳ ход врага…' : '✅ завершить ход'}</button>` : ''}
    <button class="retreat-btn ${COMBAT.retreatArmed ? 'armed' : ''}" onclick="retreatCombat()"
      title="Уйти с арены и сохранить отряд">${COMBAT.retreatArmed ? '🏳️ точно?' : '🏳️ отступить'}</button>`;

  const u = getActiveUnit();
  if (up) {
    if (u) {
      const w = activeWeaponFor(u);
      const foe = nearestEnemy(u);
      const dist = foe ? Math.abs(foe.step - u.step) : null;
      const inRange = dist != null && dist <= w.range;
      const lostTxt = lostLimbs(u.glad).map(id => LIMB_BY_ID[id].name).join(', ');
      const cd = cdLeft(u);
      const offLine = u.offWeapon
        ? `<div class="up-row"><span>🤝 Левая рука</span><b>${u.offWeapon.name}</b></div>`
        : (u.shield ? `<div class="up-row"><span>🛡️ Левая рука</span><b>${u.shield.name}</b></div>` : '');
      up.innerHTML = `
        <div class="up-name">${u.glad.name}</div>
        <div class="up-role">${ROLE_ICONS[u.role]} ${ROLE_LABELS[u.role]} • ${w.name}</div>
        ${apPips(u)}
        ${offLine}
        <div class="up-row"><span>⏱️ Замах</span><b>${(attackCooldownFor(u, w) / 1000).toFixed(1)} с</b></div>
        <div class="up-row"><span>🗡️ Урон</span><b>${Math.round(w.dmgMin * u.dmgMul)}–${Math.round(w.dmgMax * u.dmgMul)}</b></div>
        <div class="up-row"><span>📏 Дистанция</span><b class="${inRange ? 'good' : 'bad'}">${dist == null ? '—' : dist + ' / ' + w.range}</b></div>
        ${cd > 0 ? `<div class="up-lost" style="color:#9db4dd">⏳ перезарядка ${(cd / 1000).toFixed(1)} с</div>` : ''}
        ${lostTxt ? `<div class="up-lost">✕ ${lostTxt}</div>` : ''}
        ${limbPips(u)}
      `;
    } else {
      up.innerHTML = `<div class="up-empty">Боец не выбран</div>`;
    }
  }

  // Управление — контекстное меню у бойца, нижняя панель убрана
  if (act) {
    act.innerHTML = '';
    act.style.display = 'none';
  }

  if (hint) {
    hint.textContent = COMBAT.mode === 'step'
      ? '♟️ Клик по своему бойцу — стойка (щит/уклон), клик по врагу — выбор части тела. Кнопка «✅ завершить ход» передаёт ход противнику; когда у отряда кончатся ОД, ход передастся сам.'
      : COMBAT.mode === 'auto'
        ? '🤖 Автобой: ИИ ведёт отряд сам. Переключите режим кнопкой сверху, чтобы бить вручную.'
        : '🖱️ Клик по врагу — удар в ту часть тела, куда попали. Лучники и копейщики бьют сами, пока перед ними свой; враг впереди — только по клику.';
  }

  renderAimPanel();
  renderUnitMenu();
}

// Меню действий выбранного бойца.
// Меню выдвигается сбоку ОТ САМОГО БОЙЦА на арене, а не висит у края экрана.
function renderUnitMenu() {
  const el = document.getElementById('unit-menu');
  if (!el) return;
  const u = getActiveUnit();
  if (!COMBAT.menu || !u || !COMBAT.active || COMBAT.over) { el.style.display = 'none'; return; }

  const ok = canControl();
  const cd = cdLeft(u);
  const canStance = ok && u.ap >= STANCE_COST;
  const canDodge = ok && !u.dodgeUsed && u.ap >= DODGE_COST;
  const canBlock = canStance && u.armorShield > 0;
  const isDog = !!u.glad.isDog;
  const spells = heroSpells(u);

  const spellButtons = spells.map(s => {
    const ready = ok && s.cdLeft <= 0 && u.ap >= s.ap;
    const cdTxt = s.cdLeft > 0 ? ` (${s.cdLeft})` : ` ${s.ap}⚡`;
    return `<button class="um-btn spell ${ready ? '' : 'off'}" ${ready ? '' : 'disabled'}
      style="border-color:${hexA(s.school.color, 0.55)};color:${s.school.color}"
      title="${s.desc}"
      onclick="castSpell(getActiveUnit(),'${s.id}')">
      ${s.school.icon} ${s.name}${cdTxt}
    </button>`;
  }).join('');

  el.innerHTML = `
    <div class="um-head">
      <span class="um-name">${isDog ? '🐕 ' : ''}${u.glad.name.split(' ')[0]}</span>
      <span class="um-ap" style="color:${cd > 0 ? '#9db4dd' : '#8fd6a3'}">${cd > 0 ? `${(cd / 1000).toFixed(1)}с` : 'готов'}</span>
    </div>
    <div class="um-stats">
      <span>🗡️ ${Math.round(activeWeaponFor(u).dmgMin * u.dmgMul)}–${Math.round(activeWeaponFor(u).dmgMax * u.dmgMul)}</span>
      <span>📏 ${activeWeaponFor(u).range}</span>
      <span>⏱️ ${(attackCooldownFor(u, activeWeaponFor(u)) / 1000).toFixed(1)}с</span>
      ${u.offWeapon ? `<span title="Два клинка">⚔️2</span>` : ''}
      ${u.glad.magic ? `<span style="color:${MAGIC_SCHOOLS[u.glad.magic].color}">${MAGIC_SCHOOLS[u.glad.magic].icon}</span>` : ''}
    </div>
    ${apPips(u)}
    ${spells.length ? `<div class="um-sec">Магия</div><div class="um-grid one">${spellButtons}</div>` : ''}
    <div class="um-sec">Стойка</div>
    <div class="um-grid">
      <button class="um-btn ${u.stance === 'block' ? 'on' : ''}" ${canBlock ? '' : 'disabled'} onclick="setStance('block')">🛡️ Щит</button>
      <button class="um-btn ${u.stance === 'dodge' ? 'on' : ''}" ${canDodge ? '' : 'disabled'} onclick="setStance('dodge')">💨 Уклон</button>
    </div>
    ${COMBAT.mode === 'step' ? `<button class="um-skip" onclick="endTurnNow()">✅ завершить ход</button>` : ''}
    <button class="um-close" onclick="closeUnitMenu()">закрыть</button>
  `;
  el.style.display = 'block';
  positionUnitMenu();
}

// Позиция меню: справа от бойца, если есть место, иначе слева.
// Пересчитывается каждый кадр — камера ездит, бойцы ходят.
function positionUnitMenu() {
  const el = document.getElementById('unit-menu');
  if (!el || el.style.display === 'none') return;
  const u = getActiveUnit();
  const m = canvasMetrics();
  if (!u || !m) return;

  const { W, H } = m;
  const cam = COMBAT.cam;
  const originX = W / 2 - cam.focusX * cam.scale;
  const originY = H * 0.80 - GROUND * cam.scale;
  const sx = originX + stepX(u.step) * cam.scale;
  const sy = originY + (GROUND - 110) * cam.scale;

  const rect = el.getBoundingClientRect();
  const mw = rect.width || 190;
  const mh = rect.height || 170;

  // Ширина фигуры на экране
  const halfW = 56 * cam.scale;
  const gap = 12;

  let left = sx + halfW + gap;
  let side = 'right';
  if (left + mw > W - 8) {
    left = sx - halfW - gap - mw;
    side = 'left';
  }
  left = clamp(left, 8, Math.max(8, W - mw - 8));

  let top = sy - mh * 0.62;
  top = clamp(top, 8, Math.max(8, H - mh - 8));

  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.dataset.side = side;

  // Тонкая линия-указатель от меню к бойцу
  const pointer = document.getElementById('um-pointer');
  if (pointer) {
    pointer.style.display = 'block';
    const px = side === 'right' ? left : left + mw;
    const py = clamp(sy, top + 14, top + mh - 14);
    pointer.style.left = px + 'px';
    pointer.style.top = py + 'px';
    pointer.style.width = Math.abs((side === 'right' ? sx + halfW : sx - halfW) - px) + 'px';
    pointer.style.transform = side === 'right' ? 'none' : 'translateX(-100%)';
  }
}

function closeUnitMenu() {
  COMBAT.menu = null;
  const pointer = document.getElementById('um-pointer');
  if (pointer) pointer.style.display = 'none';
  renderUnitMenu();
}

function openUnitMenu(id) {
  COMBAT.menu = { unitId: id };
  renderUnitMenu();
}

function renderAimPanel() {
  const el = document.getElementById('aim-panel');
  if (!el) return;
  if (!COMBAT.aim || !COMBAT.active) { el.style.display = 'none'; return; }
  const target = COMBAT.units.find(x => x.id === COMBAT.aim.targetId);
  if (!target || !target.alive) { el.style.display = 'none'; return; }

  const u = getActiveUnit();
  const heavy = COMBAT.heavyMode;
  const w = u ? activeWeaponFor(u) : null;
  const cd = u ? cdLeft(u) : 0;
  const canHit = !!u && cd <= 0;
  const cost = w ? w.apCost + (heavy ? 2 : 0) : 0;

  el.innerHTML = `
    <div class="aim-head">${target.glad.name}<span>${canHit ? `удар ${cost} ОД` : 'перезарядка'}</span></div>
    <div class="aim-sub">${heavy ? '💥 мощный удар' : 'обычный удар'} • броня ${target.armorBody}</div>
    <div class="aim-grid">
      ${LIMB_DEFS.map(l => {
        const s = target.limbs[l.id];
        const pct = s.lost ? 0 : Math.round((s.hp / s.max) * 100);
        const cls = s.lost ? 'lost' : pct < 30 ? 'low' : pct < 65 ? 'mid' : 'ok';
        let hit = 0, dmg = { min: 0, max: 0 };
        if (u && !s.lost && w) {
          hit = Math.round(calcHitChance(u, target, l.id, heavy, w));
          dmg = calcDamageEstimate(u, target, l.id, heavy, w);
        }
        const kill = u && !s.lost && dmg.max >= target.glad.hp;
        return `<button class="aim-limb ${cls} ${kill ? 'kill' : ''}" ${s.lost || !canHit ? 'disabled' : ''} onclick="attackLimb('${l.id}')">
          <span class="al-ico">${l.icon}</span>
          <span class="al-name">${l.short}</span>
          <span class="al-pct">${s.lost ? '✕' : pct + '%'}</span>
          <span class="al-stats">${s.lost ? 'потеряна' : `<b>${hit}%</b> • ${dmg.min}–${dmg.max}`}</span>
          <i style="width:${pct}%"></i>
        </button>`;
      }).join('')}
    </div>
    <button class="aim-cancel" onclick="closeAim()">отмена</button>
  `;
  el.style.display = 'block';
  positionAimPanel();
}

function positionAimPanel() {
  const el = document.getElementById('aim-panel');
  if (!el || el.style.display === 'none') return;
  // Панель показывает части тела ЦЕЛИ, поэтому и ставим её рядом с целью,
  // а не с активным бойцом: иначе она перекрывает врага, по которому бьём.
  const target = COMBAT.aim ? COMBAT.units.find(x => x.id === COMBAT.aim.targetId) : null;
  const anchor = target || getActiveUnit();
  const m = canvasMetrics();
  if (!anchor || !m) return;

  const { W, H } = m;
  const cam = COMBAT.cam;
  const originX = W / 2 - cam.focusX * cam.scale;
  const originY = H * 0.80 - GROUND * cam.scale;
  const sx = originX + stepX(anchor.step) * cam.scale;
  const sy = originY + (GROUND - 110) * cam.scale;

  const rect = el.getBoundingClientRect();
  const pw = rect.width || 178;
  const ph = rect.height || 240;
  const halfW = 56 * cam.scale;
  const gap = 16;

  // Справа от цели. Если справа не влезает — слева. Панель не должна
  // накрывать фигуру врага, поэтому отступ считается от её края.
  let left = sx + halfW + gap;
  let side = 'right';
  if (left + pw > W - 8) {
    left = sx - halfW - gap - pw;
    side = 'left';
  }
  left = clamp(left, 8, Math.max(8, W - pw - 8));

  // Верх совмещаем с плечом бойца, чтобы панель «росла» от него
  let top = sy - ph * 0.28;
  top = clamp(top, 8, Math.max(8, H - ph - 8));

  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.right = 'auto';
  el.style.transform = 'none';
  el.dataset.side = side;
}


// ==================== ЗАВЕРШЕНИЕ ====================
// Отступление: бой прерывается без победы и без награды.
// Живые бойцы сохраняются, павшие всё равно остаются павшими.
// Кнопка работает в два нажатия: первый — взводит, второй — уводит отряд.
function retreatCombat() {
  if (!COMBAT.active || COMBAT.over) return;
  if (!COMBAT.retreatArmed) {
    COMBAT.retreatArmed = true;
    clearTimeout(COMBAT.retreatTimer);
    COMBAT.retreatTimer = setTimeout(() => {
      COMBAT.retreatArmed = false;
      if (COMBAT.active) updateCombatHUD();
    }, 3500);
    sfx('click');
    updateCombatHUD();
    showTurnToast('Отступить?', 'нажмите ещё раз, чтобы уйти с песка');
    return;
  }
  COMBAT.retreatArmed = false;
  clearTimeout(COMBAT.retreatTimer);
  COMBAT.retreated = true;
  addLog('🏳️ <b>ОТСТУПЛЕНИЕ.</b> Отряд уходит с песка живым.', 'log-warn');
  finishCombat(false, true);
}

async function finishCombat(victory, retreated) {
  if (COMBAT.over) return;
  COMBAT.over = true;
  COMBAT.active = false;
  COMBAT.busy = true;
  COMBAT.retreated = !!retreated;
  COMBAT.aim = null;
  updateCombatHUD();
  renderAimPanel();

  const rw = COMBAT.rewards;
  const players = COMBAT.units.filter(u => u.side === 'player');
  const levelUps = [];
  const fallen = [];
  const loot = [];

  // Смерть навсегда. Псы живут в STATE.dogs, гладиаторы — в STATE.roster.
  // Сбежавшие с арены (fled) живы: они просто покинули бой.
  players.forEach(pu => {
    const g = pu.glad;
    if (pu.fled) {
      ensureLimbs(g);
      g.hp = Math.max(1, Math.round(g.hp));
      return;
    }
    if (!pu.alive || g.hp <= 0) {
      fallen.push(g.name);
      const inRoster = STATE.roster.findIndex(x => x.id === g.id);
      if (inRoster >= 0) STATE.roster.splice(inRoster, 1);
      const inDogs = (STATE.dogs || []).findIndex(x => x.id === g.id);
      if (inDogs >= 0) STATE.dogs.splice(inDogs, 1);
      const si = STATE.squad.indexOf(g.id);
      if (si >= 0) STATE.squad.splice(si, 1);
      if (STATE.selectedGladId === g.id) {
        STATE.selectedGladId = STATE.roster[0] ? STATE.roster[0].id
          : (STATE.dogs[0] ? STATE.dogs[0].id : null);
      }
      return;
    }
    // Конечности остаются повреждёнными навсегда — сохраняем как есть
    ensureLimbs(g);
    g.hp = Math.max(1, Math.round(g.hp));
  });

  STATE.battleCount = (STATE.battleCount || 0) + 1;

  if (victory) {
    STATE.gold += rw.gold;
    STATE.fame += rw.fame;
    STATE.wins = (STATE.wins || 0) + 1;
    STATE.day++;
    addLog(`🏆 <b>ПОБЕДА!</b> +${rw.gold} золота, +${rw.fame} славы`, 'log-win');
    addLog(`📜 Побед всего: <b>${STATE.wins}</b>`, 'log-info');

    const alive = players.filter(p => p.alive);
    alive.forEach(pu => {
      const share = Math.round(rw.xp / Math.max(1, alive.length));
      pu.glad.xp += share;
      const res = applyLevelUps(pu.glad);
      if (res > 0) levelUps.push({ glad: pu.glad, levels: res });
      addLog(`${pu.glad.name}: +${share} опыта`, 'log-info');
    });

    // Трофей с босса: две уникальные вещи, которых нет в магазине
    if (COMBAT.isBossFight && COMBAT.boss) {
      const boss = COMBAT.boss;
      STATE.bossesBeaten = STATE.bossesBeaten || [];
      if (!STATE.bossesBeaten.includes(boss.id)) STATE.bossesBeaten.push(boss.id);
      (boss.loot || []).forEach(id => {
        const it = itemById(id);
        if (!it) return;
        const copy = { ...it, uid: 'loot_' + Math.random().toString(36).substr(2, 9) };
        STATE.inventory.push(copy);
        loot.push(copy);
      });
      addLog(`👑 <b>${boss.name}</b> повержен! Трофеи: ${loot.map(i => i.name).join(', ')}`, 'log-win');

      // Пятый босс — финал сюжета
      if (boss.id === 'boss_legend') {
        STATE.story = STATE.story || { step: 0, motherHealed: false, seen: [] };
        STATE.story.finalWon = true;
      }
    }
  } else if (retreated) {
    // Отступление: бой проигран, но живые бойцы остаются в отряде
    STATE.day++;
    addLog('🏳️ Отряд отступил. Награды нет, но бойцы живы.', 'log-warn');
  } else {
    STATE.losses = (STATE.losses || 0) + 1;
    STATE.day++;
    addLog('💀 <b>ПОРАЖЕНИЕ.</b> Выжившие уходят с песка.', 'log-crit');
  }

  if (fallen.length) addLog(`⚰️ Навсегда потеряны: <b>${fallen.join(', ')}</b>`, 'log-crit');

  sfx(victory ? 'victory' : 'defeat');

  await sleep(1500);
  updateUI();
  if (typeof Save !== 'undefined') Save.autosave();

  // Конец игры проверяем до событий: если играть больше нечем — показываем финал
  if (typeof checkGameOver === 'function' && checkGameOver()) return;

  // Случайное событие после боя — если повезёт (или не повезёт)
  if (typeof triggerPostBattleEvent === 'function' && triggerPostBattleEvent()) {
    showCombatResult(victory, levelUps, fallen, loot);
    showEventModal(EVENTS_RUNTIME.pending);
    return;
  }

  showCombatResult(victory, levelUps, fallen, loot);
}

function applyLevelUps(glad) {
  let levels = 0;
  while (glad.xp >= xpToNext(glad.level)) {
    glad.xp -= xpToNext(glad.level);
    glad.level++;
    glad.maxHp += 8;
    glad.hp = Math.min(glad.maxHp, glad.hp + 12);
    glad.atk += 3;
    glad.def += 2;
    glad.agi = (glad.agi || 8) + 1;
    glad.unspent = (glad.unspent || 0) + 2;
    // Каждый третий уровень — выбор навыка по происхождению
    if (glad.level % SKILL_LEVEL_STEP === 0) {
      glad.skillPicks = (glad.skillPicks || 0) + 1;
    }
    // Конечности становятся крепче
    LIMB_DEFS.forEach(l => {
      const s = glad.limbs && glad.limbs[l.id];
      if (!s || s.lost) return;
      const nm = Math.max(6, Math.round(glad.maxHp * l.hpShare));
      const gain = Math.max(0, nm - s.max);
      s.max = nm;
      s.hp = Math.min(nm, s.hp + gain + 3);
    });
    levels++;
  }
  return levels;
}

function showCombatResult(victory, levelUps, fallen, loot) {
  const modal = document.getElementById('combat-result');
  const body = document.getElementById('combat-result-body');
  if (!modal || !body) return;
  const rw = COMBAT.rewards;
  const players = COMBAT.units.filter(u => u.side === 'player');
  const boss = COMBAT.isBossFight ? COMBAT.boss : null;
  const nextBoss = (typeof nextBossAfter === 'function') ? nextBossAfter(STATE.wins || 0) : null;

  body.innerHTML = `
    <h2 style="color:${victory ? 'var(--gold)' : '#ff6b6b'}">${victory ? '🏆 Победа!' : (COMBAT.retreated ? '🏳️ Отступление' : '💀 Поражение')}</h2>
    <p class="result-sub">${COMBAT.arena.name} • ${COMBAT.matchName} • раундов: ${COMBAT.round}</p>
    <div class="result-list">
      ${players.map(u => {
        const lost = lostLimbs(u.glad);
        const state = u.fled
          ? `<b style="color:#9ec5ff">покинул арену • ${u.glad.hp}/${u.glad.maxHp} HP</b>`
          : `<b style="color:${u.alive ? '#7fd18f' : '#ff6b6b'}">${u.alive ? u.glad.hp + '/' + u.glad.maxHp + ' HP' : 'погиб навсегда'}</b>`;
        return `<div class="result-row">
          <span>${u.glad.isDog ? '🐕' : ROLE_ICONS[u.role]} ${u.glad.name}</span>
          ${state}
          ${lost.length ? `<span class="rl-lost">✕ ${lost.map(id => LIMB_BY_ID[id].name).join(', ')}</span>` : ''}
        </div>`;
      }).join('')}
    </div>
    ${victory ? `<p class="result-reward">+${rw.gold} 💰 • +${rw.fame} 🏆 • +${rw.xp} ✨</p>` : ''}
    ${loot && loot.length ? `<div class="result-loot">
      <div class="rl-title">👑 Трофеи босса</div>
      ${loot.map(i => `<div class="rl-item">${SLOT_ICONS[i.slot] || '📦'} ${i.name} <span>${i.tier} тир</span></div>`).join('')}
    </div>` : ''}
    ${boss && victory ? `<div class="result-story">${boss.id === 'boss_legend' ? STORY.winFinal : STORY.winBoss}</div>` : ''}
    ${victory && nextBoss ? `<div class="result-next">Следующий босс — <b>${nextBoss.name}</b> на ${nextBoss.winAt}-й победе.</div>` : ''}
    ${fallen.length ? `<div class="result-fallen">⚰️ ${fallen.join(', ')} — больше не выйдут на арену.</div>` : ''}
    ${levelUps.length ? `<div class="result-levelups">
      ${levelUps.map(l => `<div class="rl-row" onclick="openLevelUp('${l.glad.id}')">
        <span>🎉 ${l.glad.name}</span><b>+${l.levels} ур. — распределить очки</b>
      </div>`).join('')}
    </div>` : ''}
  `;
  modal.style.display = 'flex';
  const arenaBtn = document.getElementById('result-btn-arena');
  if (arenaBtn) arenaBtn.style.display = '';
}

// ==================== ФОНЫ ====================
function seeded(n) {
  let s = n % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Фотографии арен: грузим один раз и держим в памяти.
const ARENA_PHOTOS = {};
function arenaPhoto(file) {
  if (!file) return null;
  let entry = ARENA_PHOTOS[file];
  if (!entry) {
    const img = new Image();
    entry = { img, ready: false };
    img.onload = () => {
      entry.ready = true;
      // Фон мог быть собран до загрузки фото — сбрасываем кэш.
      COMBAT.backdropKey = '';
      if (typeof DEPLOY !== 'undefined' && DEPLOY.canvasKey) DEPLOY.canvasKey = '';
    };
    img.onerror = () => { entry.failed = true; };
    img.src = file;
    ARENA_PHOTOS[file] = entry;
  }
  return entry.ready ? entry.img : null;
}

// Заливка «по размеру с обрезкой»: фото покрывает кадр без искажений.
function drawCover(c, img, W, H) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// Фон арены: если фото загрузилось — рисуем его, иначе процедурный запасной.
function paintArenaBackground(c, arena, W, H, horizon) {
  const photo = arenaPhoto(arena.photo);
  if (photo) {
    drawCover(c, photo, W, H);
    return true;
  }
  const draw = BACKDROPS[arena.bg] || BACKDROPS.colosseum;
  draw(c, W, H, horizon, arena);
  return false;
}

function getBackdrop(arena, W, H) {
  const key = `${arena.photo || arena.bg}_${Math.round(W)}x${Math.round(H)}`;
  if (COMBAT.backdrop && COMBAT.backdropKey === key) return COMBAT.backdrop;

  const cv = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.floor(W * dpr);
  cv.height = Math.floor(H * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  const horizon = H * 0.80;
  const isPhoto = paintArenaBackground(c, arena, W, H, horizon);

  // Фото уже снято «как есть» — ему хватает лёгкого затемнения по краям.
  const vg = c.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.34, W / 2, H * 0.55, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, isPhoto ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.55)');
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);

  COMBAT.backdrop = cv;
  COMBAT.backdropKey = key;
  return cv;
}

function skyGrad(c, W, H, top, bottom) {
  const g = c.createLinearGradient(0, 0, 0, H * 0.8);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H * 0.8);
}

function crowdDots(c, W, x0, x1, y0, y1, color, rand, density) {
  const n = Math.floor(((x1 - x0) * (y1 - y0)) / density);
  for (let i = 0; i < n; i++) {
    const x = x0 + rand() * (x1 - x0);
    const y = y0 + rand() * (y1 - y0);
    c.fillStyle = color;
    c.globalAlpha = 0.2 + rand() * 0.35;
    c.beginPath();
    c.arc(x, y, 1.6 + rand() * 1.6, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

function archesRow(c, W, x0, x1, y, h, count, fill) {
  const aw = (x1 - x0) / count;
  c.fillStyle = fill;
  for (let a = 0; a < count; a++) {
    const ax = x0 + a * aw + aw * 0.18;
    c.beginPath();
    c.moveTo(ax, y + h);
    c.lineTo(ax, y + h * 0.44);
    c.quadraticCurveTo(ax + aw * 0.32, y + h * 0.02, ax + aw * 0.64, y + h * 0.44);
    c.lineTo(ax + aw * 0.64, y + h);
    c.closePath();
    c.fill();
  }
}

// ==================== ДЕКОР: ЗЕЛЕНЬ ====================
// Кипарисы и пинии — античный пейзаж без единого «современного» дома.
function drawCypress(c, x, baseY, h, alpha) {
  c.save();
  c.globalAlpha = alpha == null ? 1 : alpha;
  const w = h * 0.20;
  c.fillStyle = '#3c2a18';
  c.fillRect(x - h * 0.018, baseY - h * 0.12, h * 0.036, h * 0.12);
  const g = c.createLinearGradient(x - w, baseY, x + w, baseY - h);
  g.addColorStop(0, '#1f3323');
  g.addColorStop(0.5, '#33513a');
  g.addColorStop(1, '#1a2b1f');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x, baseY - h);
  c.quadraticCurveTo(x + w, baseY - h * 0.55, x + w * 0.72, baseY - h * 0.1);
  c.quadraticCurveTo(x, baseY + h * 0.03, x - w * 0.72, baseY - h * 0.1);
  c.quadraticCurveTo(x - w, baseY - h * 0.55, x, baseY - h);
  c.fill();
  c.restore();
}

// Итальянская пиния: зонтичная крона на голом стволе.
function drawPine(c, x, baseY, h, alpha) {
  c.save();
  c.globalAlpha = alpha == null ? 1 : alpha;
  c.strokeStyle = '#4a3520';
  c.lineWidth = Math.max(2, h * 0.022);
  c.beginPath();
  c.moveTo(x, baseY);
  c.quadraticCurveTo(x + h * 0.03, baseY - h * 0.55, x - h * 0.02, baseY - h * 0.74);
  c.stroke();
  const cw = h * 0.34;
  const g = c.createRadialGradient(x, baseY - h * 0.82, h * 0.04, x, baseY - h * 0.82, cw);
  g.addColorStop(0, '#41603f');
  g.addColorStop(1, '#1e3222');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(x, baseY - h * 0.82, cw, h * 0.16, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// Кустарник — низкая зелень у стены или у песка.
function drawShrub(c, x, baseY, w, rand, alpha) {
  c.save();
  c.globalAlpha = alpha == null ? 1 : alpha;
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const bx = x + (rand() - 0.5) * w;
    const by = baseY - rand() * w * 0.24;
    const r = w * (0.18 + rand() * 0.16);
    const g = c.createRadialGradient(bx, by - r * 0.4, r * 0.2, bx, by, r);
    g.addColorStop(0, '#4e7448');
    g.addColorStop(1, '#22361f');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(bx, by, r, r * 0.74, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// Плющ по стене/аркам — тонкие стебли с листвой.
function drawIvy(c, x, y0, y1, w, rand, alpha) {
  c.save();
  c.globalAlpha = alpha == null ? 1 : alpha;
  const stems = 2 + Math.floor(rand() * 3);
  for (let s = 0; s < stems; s++) {
    const sx = x + (rand() - 0.5) * w;
    c.strokeStyle = 'rgba(60,92,54,0.75)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(sx, y0);
    let cx = sx;
    for (let y = y0; y < y1; y += 10) {
      cx += (rand() - 0.5) * 6;
      c.lineTo(cx, y);
    }
    c.stroke();
    for (let y = y0; y < y1; y += 9 + rand() * 8) {
      const lr = 1.8 + rand() * 2.4;
      c.fillStyle = `rgba(${58 + Math.floor(rand() * 30)},${88 + Math.floor(rand() * 40)},${52 + Math.floor(rand() * 22)},0.8)`;
      c.beginPath();
      c.ellipse(cx + (rand() - 0.5) * 8, y, lr, lr * 0.7, rand() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

// Травяные пучки на песке арены
function drawGrassTufts(c, W, horizon, H, rand, color) {
  c.save();
  const n = Math.round(W / 34);
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    const y = horizon + rand() * (H - horizon) * 0.9;
    const hh = 4 + rand() * 9;
    c.strokeStyle = color || 'rgba(96,120,60,0.55)';
    c.lineWidth = 1.1;
    for (let b = 0; b < 3; b++) {
      c.beginPath();
      c.moveTo(x + b * 1.6, y);
      c.quadraticCurveTo(x + b * 1.6 + (rand() - 0.5) * 4, y - hh * 0.6, x + b * 1.6 + (rand() - 0.5) * 7, y - hh);
      c.stroke();
    }
  }
  c.restore();
}

const BACKDROPS = {
  colosseum(c, W, H, horizon, arena) {
    skyGrad(c, W, H, arena.sky[0], arena.sky[1]);
    const rand = seeded(11);

    for (let t = 0; t < 3; t++) {
      const y = H * (0.05 + t * 0.13);
      const h = H * 0.14;
      const inset = W * (0.01 + t * 0.02);
      c.fillStyle = ['#5d472f', '#6b5336', '#7a5f3d'][t];
      c.fillRect(inset, y, W - inset * 2, h);
      archesRow(c, W, inset, W - inset, y + h * 0.12, h * 0.82, Math.max(6, Math.round(W / 96)), '#2a2018');
      crowdDots(c, W, inset, W - inset, y + h * 0.2, y + h * 0.9, arena.crowd, rand, 260);
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(inset, y + h - 4, W - inset * 2, 4);
    }

    for (let i = 0; i < 8; i++) {
      const fx = W * (0.05 + i * 0.125);
      c.fillStyle = i % 2 ? '#b03a2c' : '#c9a227';
      c.globalAlpha = 0.75;
      c.beginPath();
      c.moveTo(fx, H * 0.045);
      c.lineTo(fx + 13, H * 0.045 + 26);
      c.lineTo(fx, H * 0.045 + 26);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
    }

    const wg = c.createLinearGradient(0, horizon - H * 0.13, 0, horizon);
    wg.addColorStop(0, arena.wall[0]);
    wg.addColorStop(1, arena.wall[1]);
    c.fillStyle = wg;
    c.fillRect(0, horizon - H * 0.13, W, H * 0.13);
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.fillRect(0, horizon - H * 0.13, W, 3);
    c.fillStyle = '#1c1510';
    roundRect(c, W * 0.44, horizon - H * 0.11, W * 0.11, H * 0.11, 6);
    c.fill();

    // Зелень: пинии за трибунами и плющ по стене
    for (let i = 0; i < 5; i++) {
      drawPine(c, W * (0.08 + i * 0.21) + rand() * 20, horizon - H * 0.13, H * (0.3 + rand() * 0.12), 0.5);
    }
    drawIvy(c, W * 0.06, horizon - H * 0.13, horizon - H * 0.01, W * 0.05, rand, 0.8);
    drawIvy(c, W * 0.88, horizon - H * 0.13, horizon - H * 0.02, W * 0.06, rand, 0.75);
  },

  street(c, W, H, horizon, arena) {
    skyGrad(c, W, H, arena.sky[0], arena.sky[1]);
    const rand = seeded(23);

    c.fillStyle = 'rgba(240,230,200,0.85)';
    c.beginPath(); c.arc(W * 0.78, H * 0.13, H * 0.045, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(240,230,200,0.10)';
    c.beginPath(); c.arc(W * 0.78, H * 0.13, H * 0.12, 0, Math.PI * 2); c.fill();

    const houses = 7;
    for (let i = 0; i < houses; i++) {
      const bw = W / houses;
      const bh = H * (0.26 + rand() * 0.22);
      const bx = i * bw;
      c.fillStyle = ['#2e2a24', '#3a342c', '#26221d'][i % 3];
      c.fillRect(bx, horizon - bh, bw - 4, bh);
      for (let wy = 0; wy < 3; wy++) {
        for (let wx = 0; wx < 3; wx++) {
          const lit = rand() > 0.55;
          c.fillStyle = lit ? 'rgba(240,190,110,0.7)' : 'rgba(10,10,12,0.8)';
          c.fillRect(bx + bw * 0.16 + wx * bw * 0.26, horizon - bh + H * 0.05 + wy * H * 0.07, bw * 0.14, H * 0.032);
        }
      }
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(bx + bw - 4, horizon - bh, 4, bh);
    }

    for (let i = 0; i < 5; i++) {
      const lx = W * (0.1 + i * 0.2);
      const ly = horizon - H * 0.2;
      const g = c.createRadialGradient(lx, ly, 2, lx, ly, H * 0.16);
      g.addColorStop(0, 'rgba(255,190,90,0.55)');
      g.addColorStop(1, 'rgba(255,190,90,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(lx, ly, H * 0.16, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f0b45a';
      c.beginPath(); c.arc(lx, ly, 4, 0, Math.PI * 2); c.fill();
    }

    const gg = c.createLinearGradient(0, horizon - H * 0.04, 0, H);
    gg.addColorStop(0, arena.ground[0]);
    gg.addColorStop(1, arena.ground[1]);
    c.fillStyle = gg;
    c.fillRect(0, horizon - H * 0.04, W, H);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const y = horizon + i * (H - horizon) / 8;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    for (let i = 0; i < 22; i++) {
      const x = rand() * W;
      c.beginPath(); c.moveTo(x, horizon); c.lineTo(x + (rand() - 0.5) * 40, H); c.stroke();
    }

    // Зелень у домов: кусты и трава в щелях
    drawShrub(c, W * 0.08, horizon - H * 0.01, H * 0.1, rand, 0.85);
    drawShrub(c, W * 0.53, horizon - H * 0.01, H * 0.09, rand, 0.8);
    drawShrub(c, W * 0.93, horizon - H * 0.01, H * 0.11, rand, 0.85);
    drawIvy(c, W * 0.19, horizon - H * 0.22, horizon - H * 0.02, W * 0.03, rand, 0.7);
    drawIvy(c, W * 0.72, horizon - H * 0.18, horizon - H * 0.02, W * 0.03, rand, 0.65);
    drawGrassTufts(c, W, horizon, H, rand);
  },

  forest(c, W, H, horizon, arena) {
    skyGrad(c, W, H, arena.sky[0], arena.sky[1]);
    const rand = seeded(37);

    for (let i = 0; i < 14; i++) {
      const x = rand() * W;
      const tw = 10 + rand() * 22;
      c.fillStyle = `rgba(40,52,34,${0.5 + rand() * 0.3})`;
      c.fillRect(x, 0, tw, horizon);
    }
    for (let i = 0; i < 10; i++) {
      const x = rand() * W, y = H * (0.04 + rand() * 0.18);
      c.fillStyle = `rgba(30,58,36,${0.55 + rand() * 0.3})`;
      c.beginPath(); c.ellipse(x, y, 70 + rand() * 70, 34 + rand() * 30, 0, 0, Math.PI * 2); c.fill();
    }

    c.fillStyle = '#4a3a26';
    c.fillRect(0, horizon - H * 0.22, W, H * 0.22);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? '#5a4630' : '#4e3c28';
      c.fillRect(0, horizon - H * 0.22 + i * H * 0.055, W, H * 0.055);
    }
    crowdDots(c, W, 0, W, horizon - H * 0.2, horizon - H * 0.03, arena.crowd, rand, 320);

    for (let i = 0; i < 6; i++) {
      const px = W * (0.04 + i * 0.185);
      c.fillStyle = '#3a2c1c';
      c.fillRect(px, horizon - H * 0.26, 12, H * 0.26);
      c.fillStyle = '#2a2016';
      c.fillRect(px - 4, horizon - H * 0.27, 20, 8);
    }

    const gg = c.createLinearGradient(0, horizon - H * 0.03, 0, H);
    gg.addColorStop(0, arena.ground[0]);
    gg.addColorStop(1, arena.ground[1]);
    c.fillStyle = gg;
    c.fillRect(0, horizon - H * 0.03, W, H);

    // Лесная арена: густая зелень, кусты и трава
    for (let i = 0; i < 4; i++) {
      drawPine(c, W * (0.12 + i * 0.26) + rand() * 26, horizon - H * 0.03, H * (0.34 + rand() * 0.14), 0.6);
    }
    for (let i = 0; i < 6; i++) {
      drawShrub(c, W * (0.06 + i * 0.17), horizon - H * 0.01, H * (0.08 + rand() * 0.06), rand, 0.9);
    }
    drawGrassTufts(c, W, horizon, H, rand, 'rgba(120,150,72,0.6)');
  },

  prison(c, W, H, horizon, arena) {
    skyGrad(c, W, H, arena.sky[0], arena.sky[1]);
    const rand = seeded(53);

    const brickH = H * 0.055;
    for (let row = 0; row * brickH < horizon; row++) {
      const off = row % 2 ? W * 0.045 : 0;
      for (let col = 0; col * W * 0.09 - off < W; col++) {
        const bx = col * W * 0.09 - off;
        c.fillStyle = `rgb(${56 + Math.floor(rand() * 18)},${50 + Math.floor(rand() * 14)},${42 + Math.floor(rand() * 12)})`;
        c.fillRect(bx + 1.5, row * brickH + 1.5, W * 0.09 - 3, brickH - 3);
      }
    }

    for (let i = 0; i < 4; i++) {
      const x = W * (0.1 + i * 0.27);
      c.fillStyle = 'rgba(6,6,8,0.85)';
      c.fillRect(x, horizon - H * 0.34, W * 0.08, H * 0.22);
      c.fillStyle = 'rgba(120,120,130,0.6)';
      for (let b = 0; b < 4; b++) c.fillRect(x + 4 + b * (W * 0.02), horizon - H * 0.34, 3, H * 0.22);
    }

    for (let i = 0; i < 3; i++) {
      const fx = W * (0.2 + i * 0.3);
      const fy = horizon - H * 0.36;
      const g = c.createRadialGradient(fx, fy, 3, fx, fy, H * 0.2);
      g.addColorStop(0, 'rgba(255,160,60,0.5)');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(fx, fy, H * 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffb04a';
      c.beginPath(); c.ellipse(fx, fy, 5, 9, 0, 0, Math.PI * 2); c.fill();
    }

    const gg = c.createLinearGradient(0, horizon - H * 0.03, 0, H);
    gg.addColorStop(0, arena.ground[0]);
    gg.addColorStop(1, arena.ground[1]);
    c.fillStyle = gg;
    c.fillRect(0, horizon - H * 0.03, W, H);

    for (let i = 0; i < 5; i++) {
      const px = rand() * W, py = horizon + rand() * (H - horizon);
      c.fillStyle = 'rgba(20,30,28,0.35)';
      c.beginPath(); c.ellipse(px, py, 30 + rand() * 40, 6 + rand() * 6, 0, 0, Math.PI * 2); c.fill();
    }

    // Сырость подземелья: мох и чахлая трава в щелях
    drawIvy(c, W * 0.03, horizon - H * 0.3, horizon - H * 0.02, W * 0.04, rand, 0.5);
    drawIvy(c, W * 0.95, horizon - H * 0.26, horizon - H * 0.02, W * 0.04, rand, 0.45);
    drawGrassTufts(c, W, horizon, H, rand, 'rgba(84,110,64,0.4)');
  },

  sewer(c, W, H, horizon, arena) {
    skyGrad(c, W, H, arena.sky[0], arena.sky[1]);
    const rand = seeded(71);

    c.fillStyle = '#2c342c';
    c.beginPath();
    c.moveTo(0, horizon);
    c.lineTo(0, H * 0.18);
    c.quadraticCurveTo(W / 2, H * -0.08, W, H * 0.18);
    c.lineTo(W, horizon);
    c.closePath();
    c.fill();

    const bh = H * 0.045;
    for (let row = 0; row * bh < H * 0.8; row++) {
      const off = row % 2 ? W * 0.04 : 0;
      for (let col = 0; col * W * 0.075 - off < W; col++) {
        const bx = col * W * 0.075 - off;
        c.fillStyle = `rgb(${44 + Math.floor(rand() * 16)},${54 + Math.floor(rand() * 16)},${44 + Math.floor(rand() * 14)})`;
        c.fillRect(bx + 1.2, row * bh + 1.2, W * 0.075 - 2.4, bh - 2.4);
      }
    }

    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(90,130,80,${0.12 + rand() * 0.2})`;
      c.beginPath();
      c.ellipse(rand() * W, rand() * horizon, 8 + rand() * 22, 5 + rand() * 12, 0, 0, Math.PI * 2);
      c.fill();
    }

    const lg = c.createRadialGradient(W * 0.5, H * 0.1, 10, W * 0.5, H * 0.1, H * 0.55);
    lg.addColorStop(0, 'rgba(200,240,220,0.22)');
    lg.addColorStop(1, 'rgba(200,240,220,0)');
    c.fillStyle = lg;
    c.fillRect(0, 0, W, H * 0.8);

    const wg = c.createLinearGradient(0, horizon - H * 0.03, 0, H);
    wg.addColorStop(0, arena.ground[0]);
    wg.addColorStop(1, arena.ground[1]);
    c.fillStyle = wg;
    c.fillRect(0, horizon - H * 0.03, W, H);
    c.fillStyle = 'rgba(120,200,170,0.10)';
    c.fillRect(0, horizon + H * 0.02, W, H * 0.1);
    for (let i = 0; i < 8; i++) {
      const y = horizon + H * 0.04 + i * (H * 0.02);
      c.strokeStyle = `rgba(160,230,200,${0.05 + rand() * 0.08})`;
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }

    // Клоака: мох по кирпичу и водоросли у воды
    drawIvy(c, W * 0.12, horizon - H * 0.34, horizon - H * 0.04, W * 0.05, rand, 0.55);
    drawIvy(c, W * 0.62, horizon - H * 0.3, horizon - H * 0.03, W * 0.05, rand, 0.5);
    drawShrub(c, W * 0.28, horizon - H * 0.01, H * 0.07, rand, 0.45);
    drawGrassTufts(c, W, horizon, H, rand, 'rgba(110,160,120,0.4)');
  },

  tavern(c, W, H, horizon, arena) {
    skyGrad(c, W, H, arena.sky[0], arena.sky[1]);
    const rand = seeded(89);

    for (let i = 0; i * H * 0.07 < horizon; i++) {
      c.fillStyle = i % 2 ? '#4e3a24' : '#5a432a';
      c.fillRect(0, i * H * 0.07, W, H * 0.07);
      c.strokeStyle = 'rgba(0,0,0,0.28)';
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(0, i * H * 0.07); c.lineTo(W, i * H * 0.07); c.stroke();
    }

    for (let i = 0; i < 5; i++) {
      c.fillStyle = '#33240f';
      c.fillRect(W * (0.06 + i * 0.22), 0, 16, horizon);
    }
    c.fillStyle = '#33240f';
    c.fillRect(0, H * 0.1, W, 18);

    for (let s = 0; s < 2; s++) {
      const sy = H * (0.2 + s * 0.14);
      c.fillStyle = '#3a2a18';
      c.fillRect(W * 0.05, sy + H * 0.05, W * 0.9, 6);
      for (let i = 0; i < 16; i++) {
        const bx = W * 0.06 + i * (W * 0.9 / 16);
        const bh2 = H * (0.03 + rand() * 0.02);
        c.fillStyle = ['#3a6a4a', '#6a3a2a', '#4a4a6a'][i % 3];
        roundRect(c, bx, sy + H * 0.05 - bh2, W * 0.012, bh2, 2);
        c.fill();
      }
    }

    for (let i = 0; i < 4; i++) {
      const lx = W * (0.15 + i * 0.24);
      const ly = H * 0.16;
      c.strokeStyle = '#2a1c10';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(lx, 0); c.lineTo(lx, ly - 10); c.stroke();
      const g = c.createRadialGradient(lx, ly, 3, lx, ly, H * 0.18);
      g.addColorStop(0, 'rgba(255,200,110,0.55)');
      g.addColorStop(1, 'rgba(255,190,90,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(lx, ly, H * 0.18, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f2c069';
      roundRect(c, lx - 6, ly - 8, 12, 16, 3);
      c.fill();
    }

    [0.06, 0.9].forEach(px => {
      c.fillStyle = '#5a3f22';
      roundRect(c, W * px - 26, horizon - H * 0.14, 52, H * 0.14, 8);
      c.fill();
      c.strokeStyle = '#2a1c10';
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(W * px - 26, horizon - H * 0.1); c.lineTo(W * px + 26, horizon - H * 0.1); c.stroke();
      c.beginPath(); c.moveTo(W * px - 26, horizon - H * 0.05); c.lineTo(W * px + 26, horizon - H * 0.05); c.stroke();
    });

    const gg = c.createLinearGradient(0, horizon - H * 0.03, 0, H);
    gg.addColorStop(0, arena.ground[0]);
    gg.addColorStop(1, arena.ground[1]);
    c.fillStyle = gg;
    c.fillRect(0, horizon - H * 0.03, W, H);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1.6;
    for (let i = 0; i < 10; i++) {
      const y = horizon + i * (H - horizon) / 9;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }

    // Таверна: солома на полу и пучки травы у порога
    c.save();
    c.globalAlpha = 0.35;
    c.strokeStyle = '#c9a45c';
    c.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const x = rand() * W, y = horizon + rand() * (H - horizon);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 16, y + (rand() - 0.5) * 6); c.stroke();
    }
    c.restore();
    drawGrassTufts(c, W, horizon, H, rand, 'rgba(160,140,80,0.35)');
  },

  smallarena(c, W, H, horizon, arena) {
    skyGrad(c, W, H, arena.sky[0], arena.sky[1]);
    const rand = seeded(101);

    for (let t = 0; t < 3; t++) {
      const y = H * (0.08 + t * 0.14);
      const h = H * 0.15;
      c.fillStyle = ['#6a4f30', '#77583a', '#856444'][t];
      c.fillRect(0, y, W, h);
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(0, y + h - 5, W, 5);
      crowdDots(c, W, 0, W, y + 6, y + h - 8, arena.crowd, rand, 300);
    }
    for (let i = 0; i < 7; i++) {
      c.fillStyle = '#3c2c1a';
      c.fillRect(W * (0.03 + i * 0.16), H * 0.03, 14, H * 0.6);
      c.fillStyle = '#4e3a22';
      c.fillRect(W * (0.03 + i * 0.16) - 5, H * 0.02, 24, 10);
    }

    c.fillStyle = '#5a4128';
    c.fillRect(0, horizon - H * 0.12, W, H * 0.12);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < 22; i++) c.fillRect(i * (W / 22), horizon - H * 0.12, 2, H * 0.12);

    const gg = c.createLinearGradient(0, horizon - H * 0.03, 0, H);
    gg.addColorStop(0, arena.ground[0]);
    gg.addColorStop(1, arena.ground[1]);
    c.fillStyle = gg;
    c.fillRect(0, horizon - H * 0.03, W, H);

    // Малая арена: кипарисы вокруг и трава по песку
    for (let i = 0; i < 6; i++) {
      drawCypress(c, W * (0.05 + i * 0.18) + rand() * 14, horizon - H * 0.02, H * (0.22 + rand() * 0.1), 0.55);
    }
    drawShrub(c, W * 0.15, horizon - H * 0.005, H * 0.07, rand, 0.7);
    drawShrub(c, W * 0.85, horizon - H * 0.005, H * 0.07, rand, 0.7);
    drawGrassTufts(c, W, horizon, H, rand);
  },

  bath(c, W, H, horizon, arena) {
    skyGrad(c, W, H, arena.sky[0], arena.sky[1]);
    const rand = seeded(131);

    c.fillStyle = '#c8c4b8';
    c.fillRect(0, 0, W, horizon);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = `rgba(${180 + rand() * 30},${176 + rand() * 30},${166 + rand() * 30},0.6)`;
      c.fillRect(i * (W / 8), 0, W / 8 - 2, horizon);
    }

    archesRow(c, W, W * 0.04, W * 0.96, H * 0.12, H * 0.4, 5, '#8f8b80');
    for (let a = 0; a < 5; a++) {
      const aw = (W * 0.92) / 5;
      const ax = W * 0.04 + a * aw + aw * 0.18;
      c.fillStyle = 'rgba(40,60,70,0.55)';
      c.beginPath();
      c.moveTo(ax, H * 0.52);
      c.lineTo(ax, H * 0.12 + H * 0.4 * 0.44);
      c.quadraticCurveTo(ax + aw * 0.32, H * 0.12, ax + aw * 0.64, H * 0.12 + H * 0.4 * 0.44);
      c.lineTo(ax + aw * 0.64, H * 0.52);
      c.closePath();
      c.fill();
    }

    for (let i = 0; i < 4; i++) {
      const px = W * (0.08 + i * 0.28);
      c.fillStyle = '#dedad0';
      c.fillRect(px, H * 0.1, 26, horizon - H * 0.1);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(px + 18, H * 0.1, 8, horizon - H * 0.1);
      c.fillStyle = '#eae6dc';
      c.fillRect(px - 6, H * 0.09, 38, 12);
      c.fillRect(px - 6, horizon - 12, 38, 12);
    }

    for (let i = 0; i < 16; i++) {
      c.fillStyle = `rgba(230,240,245,${0.05 + rand() * 0.09})`;
      c.beginPath();
      c.ellipse(rand() * W, horizon - rand() * H * 0.45, 40 + rand() * 80, 16 + rand() * 34, 0, 0, Math.PI * 2);
      c.fill();
    }

    const gg = c.createLinearGradient(0, horizon - H * 0.03, 0, H);
    gg.addColorStop(0, arena.ground[0]);
    gg.addColorStop(1, arena.ground[1]);
    c.fillStyle = gg;
    c.fillRect(0, horizon - H * 0.03, W, H);
    c.strokeStyle = 'rgba(0,0,0,0.14)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const y = horizon + i * (H - horizon) / 7;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const x = (i / 14) * W;
      c.beginPath(); c.moveTo(x, horizon); c.lineTo(x + (x - W / 2) * 0.25, H); c.stroke();
    }
    c.fillStyle = 'rgba(140,200,215,0.16)';
    c.fillRect(0, H * 0.9, W, H * 0.1);

    // Термы: плющ по мрамору и пальмы в кадках
    drawIvy(c, W * 0.02, H * 0.12, horizon - H * 0.02, W * 0.04, rand, 0.55);
    drawIvy(c, W * 0.98, H * 0.14, horizon - H * 0.02, W * 0.04, rand, 0.5);
    for (let i = 0; i < 3; i++) {
      drawShrub(c, W * (0.16 + i * 0.34), horizon - H * 0.01, H * 0.09, rand, 0.65);
    }
  }
};

// ==================== РЕНДЕР ====================
function renderArenaLoop(ts) {
  const m = canvasMetrics();
  if (!m) { COMBAT.raf = null; return; }
  const { canvas, W, H } = m;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const dt = Math.min(0.05, (ts - COMBAT.lastTs) / 1000 || 0.016);
  COMBAT.lastTs = ts;
  COMBAT.time += dt;
  COMBAT.bloodOverlay *= (1 - dt * 0.25);

  const arena = COMBAT.arena || ARENAS[0];

  ctx.drawImage(getBackdrop(arena, W, H), 0, 0, W, H);

  updateCamera(dt);
  updateAnims(dt);
  clickerTick(dt);

  drawFloor(ctx, arena, W, H);

  const cam = COMBAT.cam;
  const sh = COMBAT.shake;
  const shakeX = sh > 0.2 ? rnd(-sh, sh) : 0;
  const shakeY = sh > 0.2 ? rnd(-sh, sh) * 0.6 : 0;
  COMBAT.shake *= 0.87;

  const originX = W / 2 - cam.focusX * cam.scale + shakeX;
  // Линия пола — у самого низа кадра: бойцы стоят на переднем плане,
  // а не висят в середине фоновой картинки.
  const originY = H * 0.93 - GROUND * cam.scale + shakeY;

  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(cam.scale, cam.scale);

  drawLane(ctx);
  drawStains(ctx);

  const sorted = COMBAT.units.slice().sort((a, b) => {
    if (a.id === COMBAT.activeId) return 1;
    if (b.id === COMBAT.activeId) return -1;
    return 0;
  });
  sorted.forEach(u => drawUnit(ctx, u));

  drawProjectiles(ctx);
  drawParticles(ctx);
  drawRings(ctx);
  drawFlashes(ctx);
  drawFloats(ctx);

  ctx.restore();

  drawCombatOverlay(ctx, W, H);
  positionAimPanel();
  positionUnitMenu();
  COMBAT.raf = requestAnimationFrame(renderArenaLoop);
}

function drawFloor(ctx, arena, W, H) {
  const top = H * 0.80;

  // На фото-фоне пол не закрашиваем: только лёгкая тень у линии горизонта,
  // иначе земля закрывает нижнюю часть снимка.
  if (arena.photo) {
    const sh = ctx.createLinearGradient(0, top - 10, 0, top + 26);
    sh.addColorStop(0, 'rgba(0,0,0,0.28)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, top - 10, W, 36);

    if (COMBAT.stains.length) {
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = BLOOD_DARK;
      ctx.fillRect(0, top, W, H - top);
      ctx.restore();
    }
    return;
  }

  const g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, arena.ground[0]);
  g.addColorStop(1, arena.ground[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, W, H - top);

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, top - 3, W, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, top - 3, W, 1.5);

  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = arena.bg === 'bath' ? '#ffffff' : '#2a1a0e';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 10; i++) {
    const y = top + 12 + i * ((H - top) / 9);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(W / 2, y + 4, W, y);
    ctx.stroke();
  }
  ctx.restore();

  // Кровь на песке — лёгкий красный оттенок
  if (COMBAT.stains.length) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = BLOOD_DARK;
    ctx.fillRect(0, top, W, H - top);
    ctx.restore();
  }
}

function drawLane(ctx) {
  // В кликер-бою клетки шагов не нужны: бойцы двигаются сами.
  // Оставляем только мягкое кольцо под выбранным бойцом.
  const u = getActiveUnit();
  if (!u) return;
  ctx.save();
  const x = stepX(u.drawStep);
  ctx.strokeStyle = 'rgba(130,225,160,0.55)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(x, GROUND + 8, STEP_W * 0.36, 11, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStains(ctx) {
  ctx.save();
  COMBAT.stains.forEach(s => {
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = BLOOD_DARK;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawUnit(ctx, unit) {
  // Сбежавший с арены уже не на песке
  if (unit.fled) return;
  const x = stepX(unit.drawStep);
  const facing = unit.side === 'player' ? 1 : -1;
  const active = getActiveUnit();

  // Цель в зоне удара
  if (active && unit.side === 'enemy' && unit.alive && canControl()
      && Math.abs(unit.step - active.step) <= activeWeaponFor(active).range) {
    const pulse = 0.5 + 0.5 * Math.sin(COMBAT.time * 4.2);
    ctx.save();
    ctx.strokeStyle = `rgba(255,90,90,${0.35 + pulse * 0.45})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 6, 46, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,90,90,${0.6 + pulse * 0.4})`;
    ctx.beginPath();
    const ty = GROUND - 250;
    ctx.moveTo(x, ty + 16);
    ctx.lineTo(x - 10, ty);
    ctx.lineTo(x + 10, ty);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Выбранная цель прицеливания
  if (COMBAT.aim && COMBAT.aim.targetId === unit.id) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,200,80,0.95)';
    ctx.lineWidth = 3.4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 6, 50, 16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (COMBAT.hoverId === unit.id && unit.alive) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 6, 46, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (unit.boss && unit.alive) {
    const p = 0.5 + 0.5 * Math.sin(COMBAT.time * 3);
    const grd = ctx.createRadialGradient(x, GROUND - 90, 8, x, GROUND - 90, 130);
    grd.addColorStop(0, `rgba(200,40,40,${0.16 + p * 0.12})`);
    grd.addColorStop(1, 'rgba(200,40,40,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(x, GROUND - 80, 130, 150, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Лужа под раненым
  const hpPct = unit.glad.hp / unit.glad.maxHp;
  if (unit.alive && hpPct < 0.6) {
    ctx.save();
    ctx.globalAlpha = (0.6 - hpPct) * 0.5;
    ctx.fillStyle = BLOOD_DARK;
    ctx.beginPath();
    ctx.ellipse(x, GROUND + 10, 26 + (1 - hpPct) * 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const a = unit.anim;
  // Эмоция по состоянию бойца: боль, победа, злоба при низком HP
  const hpRatio = unit.glad.hp / Math.max(1, unit.glad.maxHp);
  let emotion = 'idle';
  if (!unit.alive) emotion = 'dead';
  else if (a.hurt > 0.25) emotion = 'hurt';
  else if (a.victory > 0.4) emotion = 'happy';
  else if (a.swing > 0.45) emotion = 'angry';
  else if (hpRatio < 0.3) emotion = 'fear';
  else if (unit.boss) emotion = 'angry';
  else if (COMBAT.mode === 'auto' && unit.side === 'player') emotion = 'taunt';

  drawBattleBrother(ctx, unit.glad, x, GROUND, UNIT_SCALE, facing, {
    swing: a.swing, lunge: a.lunge, hurt: a.hurt, block: a.block,
    dodge: a.dodge, walk: a.walk, walkPhase: a.walkPhase,
    dead: a.dead, victory: a.victory, glow: unit.id === COMBAT.activeId ? 1 : 0,
    alpha: unit.alive ? 1 : 0.95,
    emotion,
    breath: unit.alive ? (hpRatio < 0.3 ? 1.9 : 1) : 0
  });

  if (unit.alive) drawUnitBars(ctx, unit, x);
  else {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#8c2d2d';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✝', x, GROUND - 14);
    ctx.restore();
  }
}

function drawUnitBars(ctx, unit, x) {
  const bw = 118;
  const h = 8;
  const y = GROUND - 232;
  const isSel = unit.id === COMBAT.activeId;

  ctx.save();
  ctx.fillStyle = 'rgba(8,6,4,0.78)';
  roundRect(ctx, x - bw / 2 - 4, y - 4, bw + 8, h * 2 + 48, 6);
  ctx.fill();

  const hpPct = clamp(unit.glad.hp / unit.glad.maxHp, 0, 1);
  ctx.fillStyle = '#2e1010';
  ctx.fillRect(x - bw / 2, y, bw, h);
  ctx.fillStyle = hpPct > 0.55 ? '#5aa870' : hpPct > 0.25 ? '#e5b54f' : '#c0392b';
  ctx.fillRect(x - bw / 2, y, bw * hpPct, h);

  const totalArm = unit.armorHead + unit.armorBody;
  const totalMax = unit.maxArmorHead + unit.maxArmorBody;
  const armPct = totalMax > 0 ? clamp(totalArm / totalMax, 0, 1) : 0;
  ctx.fillStyle = '#232a31';
  ctx.fillRect(x - bw / 2, y + h + 2, bw, 3.5);
  ctx.fillStyle = '#9aa8b5';
  ctx.fillRect(x - bw / 2, y + h + 2, bw * armPct, 3.5);

  // Пипсы конечностей
  const pips = LIMB_DEFS.map(l => {
    const s = unit.limbs[l.id];
    if (!s) return null;
    if (s.lost) return '#ff3b30';
    const p = s.hp / s.max;
    return p < 0.3 ? '#c0392b' : p < 0.65 ? '#e5b54f' : '#7fb08a';
  }).filter(Boolean);
  const pw = 8;
  const gap = 3;
  const totalW = pips.length * (pw + gap) - gap;
  pips.forEach((col, i) => {
    ctx.fillStyle = col;
    roundRect(ctx, x - totalW / 2 + i * (pw + gap), y + h + 8, pw, 4, 2);
    ctx.fill();
  });

  // Кулдаун удара: полоса заполняется по мере готовности,
  // рядом — сколько секунд осталось до замаха.
  if (unit.alive) {
    const total = attackCooldownFor(unit, activeWeaponFor(unit));
    const left = Math.max(0, (unit.cdUntil || 0) - performance.now());
    const ready = left <= 0;
    const prog = total > 0 ? clamp(1 - left / total, 0, 1) : 1;
    const cy = y + h * 2 + 16;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x - bw / 2, cy, bw, 5, 3);
    ctx.fill();
    ctx.fillStyle = ready ? '#6fd08a' : (prog > 0.6 ? '#e5b54f' : '#8a6a48');
    roundRect(ctx, x - bw / 2, cy, bw * prog, 5, 3);
    ctx.fill();

    ctx.font = `bold 11px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ready ? '#9df0b4' : '#e0cfae';
    ctx.fillText(ready ? 'ГОТОВ' : `⏳ ${(left / 1000).toFixed(1)} с`, x, cy + 17);
  }

  ctx.font = `bold 14px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = unit.boss ? '#ff8f6b' : (isSel ? '#ffd98a' : (unit.side === 'player' ? '#d6f0dd' : '#ffc4c4'));
  ctx.fillText((unit.boss ? '👑 ' : '') + unit.glad.name, x, y - 9);
  ctx.restore();
}

function drawProjectiles(ctx) {
  for (let i = COMBAT.projectiles.length - 1; i >= 0; i--) {
    const pr = COMBAT.projectiles[i];
    pr.p += 0.14;
    const x = lerp(pr.x1, pr.x2, Math.min(1, pr.p));
    ctx.save();
    ctx.strokeStyle = pr.kind === 'crossbow' ? '#d8e2ec' : '#f0e6d2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 15, pr.y - 2);
    ctx.lineTo(x + 15, pr.y + 2);
    ctx.stroke();
    ctx.restore();
    if (pr.p >= 1) COMBAT.projectiles.splice(i, 1);
  }
}

function drawParticles(ctx) {
  for (let i = COMBAT.particles.length - 1; i >= 0; i--) {
    const p = COMBAT.particles[i];
    p.life -= 0.022 * p.decay;
    p.vy += 480 * 0.016;
    p.x += p.vx * 0.016 * 6;
    p.y += p.vy * 0.016 * 6;
    if (p.y > GROUND + 8) { p.y = GROUND + 8; p.vy = 0; p.vx *= 0.4; }
    if (p.life <= 0) { COMBAT.particles.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Вспышки удара — короткий яркий блик в точке попадания
function addFlash(unit, color) {
  COMBAT.flashes.push({
    x: stepX(unit.step) + rnd(-14, 14),
    y: GROUND - rnd(80, 175) * UNIT_SCALE,
    r: rnd(10, 16), life: 1, color: color || '#fff2c4'
  });
}

function drawFlashes(ctx) {
  for (let i = COMBAT.flashes.length - 1; i >= 0; i--) {
    const f = COMBAT.flashes[i];
    f.life -= 0.11;
    if (f.life <= 0) { COMBAT.flashes.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life) * 0.9;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (2.4 - f.life));
    g.addColorStop(0, f.color);
    g.addColorStop(0.45, 'rgba(255,200,120,0.5)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * (2.4 - f.life), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Расходящиеся кольца — для мощных ударов и отрубаний
function addRing(unit, color) {
  COMBAT.rings.push({
    x: stepX(unit.step), y: GROUND - 70 * UNIT_SCALE,
    r: 10, max: 78, life: 1, color: color || '#ff5a5a'
  });
}

function drawRings(ctx) {
  for (let i = COMBAT.rings.length - 1; i >= 0; i--) {
    const r = COMBAT.rings[i];
    r.life -= 0.045;
    if (r.life <= 0) { COMBAT.rings.splice(i, 1); continue; }
    const rad = r.max * (1 - r.life);
    ctx.save();
    ctx.globalAlpha = r.life * 0.75;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 3 * r.life + 0.6;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y + 20, rad, rad * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFloats(ctx) {
  for (let i = COMBAT.floats.length - 1; i >= 0; i--) {
    const f = COMBAT.floats[i];
    f.life -= 0.014;
    f.y += f.vy * 0.016 * 2.2;
    if (f.life <= 0) { COMBAT.floats.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = Math.min(1, f.life * 1.6);
    ctx.font = `900 ${f.big ? 24 : 17}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.82)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

function drawCombatOverlay(ctx, W, H) {
  const u = getActiveUnit();
  if (!u || !COMBAT.active) return;
  const foe = nearestEnemy(u);
  if (!foe) return;
  const reach = activeWeaponFor(u).range;
  const dist = Math.abs(foe.step - u.step);
  const inRange = dist <= reach;
  if (inRange || COMBAT.aim) return;

  ctx.save();
  const txt = `дистанция ${dist} · нужно ${reach}`;
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  const tw = ctx.measureText(txt).width;
  const bw = tw + 26, bh = 22;
  const bx = W / 2 - bw / 2, by = 12;
  ctx.fillStyle = 'rgba(12,9,7,0.78)';
  roundRect(ctx, bx, by, bw, bh, 11);
  ctx.fill();
  ctx.strokeStyle = 'rgba(229,181,79,0.45)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e5b54f';
  ctx.fillText(txt, W / 2, by + 15);
  ctx.restore();
}

// ==================== СОБЫТИЯ ====================
(function bindArenaEvents() {
  const canvas = document.getElementById('arenaCanvas');
  if (!canvas) return;
  canvas.addEventListener('click', arenaClick);
  canvas.addEventListener('mousemove', arenaMove);
  canvas.addEventListener('mouseleave', () => { COMBAT.hoverId = null; COMBAT.hoverStep = null; });
})();
