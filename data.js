// ==================== ТИРЫ ПРЕДМЕТОВ ====================
// Чем выше тир — тем мощнее предмет и тем дороже. Цена считается из полезности,
// поэтому список в магазине всегда отсортирован «от слабого к сильному».
const TIER_INFO = {
  1: { name: 'Простое',     color: '#9b8a74', stars: '·' },
  2: { name: 'Хорошее',     color: '#7fae7f', stars: '◆' },
  3: { name: 'Отличное',    color: '#6f9fd8', stars: '◆◆' },
  4: { name: 'Редкое',      color: '#c58ae0', stars: '◆◆◆' },
  5: { name: 'Легендарное', color: '#e5b54f', stars: '★' }
};

const TIER_F = { 1: 0.62, 2: 1, 3: 1.55, 4: 2.15, 5: 2.95 };
const ARMOR_TIER_F = { 1: 0.66, 2: 1, 3: 1.5, 4: 2.1, 5: 2.9 };
// Экономика: цена растёт круче, чем сила вещи. Простые вещи доступны сразу,
// а «редкое» и «легендарное» — это уже цель на десятки боёв.
const TIER_PRICE_W = { 1: 1, 2: 1.6, 3: 2.6, 4: 4.2, 5: 7 };
const WEAPON_TIER_PRICE = { 1: 1, 2: 1.15, 3: 1.6, 4: 2.2, 5: 3.2 };

// ==================== КОНЕЧНОСТИ ====================
// У каждого бойца 6 частей тела. Попадание бьёт по прочности конечности.
// Выбитая конечность отлетает навсегда и даёт штраф к характеристикам.
const LIMB_DEFS = [
  { id: 'head',  name: 'Голова',       short: 'голова',  acc: 'голову',      icon: '🪖', hpMul: 0.42, dmgMul: 1.35, hpShare: 0.55 },
  { id: 'torso', name: 'Корпус',       short: 'корпус',  acc: 'корпус',      icon: '🦺', hpMul: 1.00, dmgMul: 1.00, hpShare: 1.00 },
  { id: 'armL',  name: 'Левая рука',   short: 'л. рука', acc: 'левую руку',  icon: '💪', hpMul: 0.52, dmgMul: 0.72, hpShare: 0.22 },
  { id: 'armR',  name: 'Правая рука',  short: 'п. рука', acc: 'правую руку', icon: '💪', hpMul: 0.52, dmgMul: 0.72, hpShare: 0.22 },
  { id: 'legL',  name: 'Левая нога',   short: 'л. нога', acc: 'левую ногу',  icon: '🦵', hpMul: 0.58, dmgMul: 0.80, hpShare: 0.28 },
  { id: 'legR',  name: 'Правая нога',  short: 'п. нога', acc: 'правую ногу', icon: '🦵', hpMul: 0.58, dmgMul: 0.80, hpShare: 0.28 }
];
const LIMB_BY_ID = {};
LIMB_DEFS.forEach(l => { LIMB_BY_ID[l.id] = l; });

// ==================== РАДИУС АТАКИ ====================
// Единственное правило дистанции в игре:
//   • любое копьё / древковое (polearm) — 2 клетки;
//   • любой лук и арбалет (ranged, crossbow) — 7 клеток;
//   • всё остальное оружие — только вплотную, 1 клетка.
// Моды предметов НЕ могут изменить радиус: он берётся только из категории.
const WEAPON_RANGE_BY_CAT = { polearm: 2, ranged: 7, crossbow: 7 };

function weaponRangeFor(cat) {
  return WEAPON_RANGE_BY_CAT[cat] != null ? WEAPON_RANGE_BY_CAT[cat] : 1;
}

// ==================== ПРОФИЛИ ОРУЖИЯ ====================
const WEAPON_PROFILE = {
  sword:    { ap: 3, range: 1, hit: 7,  pen: 0.16, base: [15, 23] },
  sword2h:  { ap: 5, range: 1, hit: -2, pen: 0.32, base: [26, 38], twoHanded: true },
  dagger:   { ap: 2, range: 1, hit: 12, pen: 0.34, base: [9, 14] },
  axe:      { ap: 3, range: 1, hit: 0,  pen: 0.32, base: [16, 24] },
  axe2h:    { ap: 5, range: 1, hit: -4, pen: 0.46, base: [30, 44], twoHanded: true },
  blunt:    { ap: 3, range: 1, hit: 4,  pen: 0.42, base: [15, 22] },
  hammer:   { ap: 3, range: 1, hit: 0,  pen: 0.58, base: [18, 26] },
  hammer2h: { ap: 5, range: 1, hit: -6, pen: 0.68, base: [32, 46], twoHanded: true },
  polearm:  { ap: 3, range: 2, hit: 10, pen: 0.24, base: [15, 24] },
  ranged:   { ap: 3, range: 7, hit: 3,  pen: 0.18, base: [16, 25], twoHanded: true },
  crossbow: { ap: 4, range: 7, hit: 12, pen: 0.48, base: [28, 40], twoHanded: true },
  dual:     { ap: 3, range: 1, hit: 8,  pen: 0.30, base: [13, 20] }
};

// [id, имя, тир, shape, vis, моды, описание]
const WEAPON_DEFS = {
  sword: [
    ['w_rusty', 'Ржавый гладиус', 1, 'rusty', { len: 46, curve: .05, guard: 'cross', metal: '#9aa0a6', grip: '#5a4028' }, { hit: -3, pen: -.06 }, 'Тупой, щербатый, но всё ещё режет.'],
    ['w_gladius', 'Гладиус легионера', 2, 'gladius', { len: 52, curve: .01, guard: 'cross', metal: '#c3cfdb', grip: '#6b4a2a' }, {}, 'Короткий, быстрый, смертоносный в тесном строю.'],
    ['w_spatha', 'Спата', 3, 'spatha', { len: 66, curve: .02, guard: 'cross', metal: '#d6e0ea', grip: '#5d3f24' }, { hit: 1 }, 'Длинный клинок с идеальным балансом.'],
    ['w_sabre', 'Кривая сабля', 3, 'sabre', { len: 62, curve: .34, guard: 'disc', metal: '#e2e9f2', grip: '#7a5230' }, { hit: -3, pen: .06 }, 'Рассекает кожу и кольчугу одним движением.'],
    ['w_falcata', 'Фальката', 3, 'falcata', { len: 54, curve: .5, guard: 'none', metal: '#dfe7f0', grip: '#6b4a2a' }, { hit: -2, pen: .1 }, 'Иберийский клинок с тяжёлым обухом.'],
    ['w_kopis', 'Копис', 4, 'kopis', { len: 60, curve: .4, guard: 'cross', metal: '#e8eef6', grip: '#7a4a28' }, { pen: .08 }, 'Греческая сабля, любимая македонцами.'],
    ['w_imperial', 'Имперский гладиус', 4, 'imperial', { len: 56, curve: 0, guard: 'basket', metal: '#eaf2fa', grip: '#8c2f28' }, { hit: 2 }, 'Парадная сталь офицера.'],
    ['w_aurelia', 'Золочёная спата', 4, 'aurelia', { len: 68, curve: .02, guard: 'disc', metal: '#e8c65f', grip: '#7a2f28' }, { hit: 1, pen: .03 }, 'Золото на клинке не для красоты.'],
    ['w_serpent', 'Клинок Змея', 5, 'serpent', { len: 64, curve: .12, guard: 'basket', metal: '#b9e0c8', grip: '#2f4a3a' }, { hit: 3, pen: .05 }, 'Зелёная сталь, будто покрытая чешуёй.'],
    ['w_champion', 'Гладиус чемпиона', 5, 'champion', { len: 58, curve: .06, guard: 'basket', metal: '#f0d070', grip: '#8c2f28' }, { dmg: 4, hit: 3 }, 'Вручается на песке Колизея. Таким уже убили двенадцать.']
  ],
  sword2h: [
    ['w_greatsword', 'Двуручник легиона', 2, 'greatsword', { len: 78, curve: 0, guard: 'cross2', metal: '#cfdae5', grip: '#4a3320' }, {}, 'Первый шаг к настоящей стали.'],
    ['w_bastard', 'Бастард', 3, 'bastard', { len: 86, curve: 0, guard: 'cross2', metal: '#dde8f2', grip: '#5d3f24' }, { hit: 2 }, 'Полуторный меч: и в одной руке, и в двух.'],
    ['w_zweihander', 'Цвайхандер', 3, 'zweihander', { len: 94, curve: 0, guard: 'cross2', metal: '#e6f0fa', grip: '#4a3320' }, { dmg: 2 }, 'Полтора метра стали. Замахиваться долго, падать быстро.'],
    ['w_estoc', 'Эсток', 4, 'estoc', { len: 98, curve: 0, guard: 'disc', metal: '#f0f7ff', grip: '#3f2b1a' }, { pen: .08, hit: 2 }, 'Гранёное шило против лат.'],
    ['w_claymore', 'Клеймор', 4, 'claymore', { len: 100, curve: 0, guard: 'cross2', metal: '#f2f8ff', grip: '#3f2b1a' }, { dmg: 3 }, 'Меч горцев. Разрубает щит вместе с рукой.'],
    ['w_executioner', 'Меч палача', 4, 'executioner', { len: 92, curve: 0, guard: 'none', metal: '#9aa4ad', grip: '#33220f' }, { dmg: 5, hit: -4 }, 'Тяжёлый и тупой к концу. Работает.'],
    ['w_flamberge', 'Фламберг', 5, 'flamberge', { len: 104, curve: .18, guard: 'cross2', metal: '#eef6ff', grip: '#2f4a3a' }, { dmg: 4, pen: .06 }, 'Волнистое лезвие рвёт раны, которые не сшить.'],
    ['w_nodachi', 'Нодати', 5, 'nodachi', { len: 112, curve: .08, guard: 'disc', metal: '#f6fbff', grip: '#7a2f28' }, { dmg: 5, hit: 1 }, 'Клинок длиннее человека.']
  ],
  dagger: [
    ['w_shiv', 'Заточенный обломок', 1, 'shiv', { len: 24, curve: .12, guard: 'none', metal: '#8a8f94', grip: '#6b5a44' }, { hit: 2 }, 'Кусок косы с обмоткой.'],
    ['w_dirk', 'Кортик', 2, 'dirk', { len: 30, curve: .05, guard: 'cross', metal: '#b9c4cf', grip: '#4a3320' }, {}, 'Шотландский кинжал.'],
    ['w_pugio', 'Пугио', 2, 'pugio', { len: 32, curve: 0, guard: 'cross', metal: '#c3cfdb', grip: '#5a4028' }, { hit: 2 }, 'Кинжал легионера ищет щель в доспехе.'],
    ['w_stiletto', 'Стилет', 3, 'stiletto', { len: 36, curve: 0, guard: 'cross', metal: '#dfe7f0', grip: '#3f2b1a' }, { pen: .12, hit: 1 }, 'Тонкое шило.'],
    ['w_sai', 'Сай', 3, 'sai', { len: 34, curve: .02, guard: 'none', metal: '#cfd8e2', grip: '#6b4a2a' }, { hit: 3 }, 'Клинок с рогаткой у гарды.'],
    ['w_kris', 'Волнистый крис', 3, 'kris', { len: 38, curve: .55, guard: 'disc', metal: '#dfe7f0', grip: '#8a5a2a' }, { pen: .06 }, 'Оставляет раны, которые не заживают.'],
    ['w_katar', 'Катар', 4, 'katar', { len: 28, curve: 0, guard: 'none', metal: '#e4ecf4', grip: '#4a3320' }, { pen: .1, dmg: 2 }, 'Клинок, растущий из кулака.'],
    ['w_nightfang', 'Клык ночи', 5, 'nightfang', { len: 40, curve: .2, guard: 'none', metal: '#8fa8c0', grip: '#1e1a2a' }, { hit: 5, pen: .1 }, 'Тёмная сталь, почти невидимая.'],
  ],
  axe: [
    ['w_hatchet', 'Топорик', 1, 'hatchet', { head: 'axe', len: 42, bladeW: 1, metal: '#9aa4ad', grip: '#6b4a2a' }, {}, 'Дровосечный топор. Против человека работает не хуже.'],
    ['w_francisca', 'Франциска', 2, 'francisca', { head: 'axe', len: 46, bladeW: 1.05, metal: '#aab4be', grip: '#5d3f24' }, { hit: 2 }, 'Метательный топор франков.'],
    ['w_handaxe', 'Боевой топор', 2, 'handaxe', { head: 'axe', len: 50, bladeW: 1.15, metal: '#b3c1cd', grip: '#5d3f24' }, {}, 'Раскалывает щиты и рёбра.'],
    ['w_waraxe', 'Боевая секира', 3, 'waraxe', { head: 'axe', len: 54, bladeW: 1.25, metal: '#c2ced9', grip: '#4a3320' }, { dmg: 1 }, 'Широкое лезвие с зазубриной.'],
    ['w_bearded', 'Бородатая секира', 3, 'bearded', { head: 'axe', len: 58, bladeW: 1.3, metal: '#c2ced9', grip: '#4a3320', hook: true }, { hit: -2, pen: .04 }, 'Крюк подцепляет щит и открывает тело.'],
    ['w_broadaxe', 'Широколезвийный топор', 4, 'broadaxe', { head: 'axe', len: 64, bladeW: 1.5, metal: '#d5e0ea', grip: '#3f2b1a' }, { dmg: 2 }, 'Один удар — и бой закончен.'],
    ['w_skullsplitter', 'Колун', 4, 'skullsplitter', { head: 'axe', len: 60, bladeW: 1.4, metal: '#cfdae5', grip: '#33220f' }, { dmg: 3, hit: -3 }, 'Мясницкий инструмент.'],
    ['w_bloodmoon', 'Кровавая луна', 5, 'bloodmoon', { head: 'axe', len: 62, bladeW: 1.55, metal: '#e8b0a0', grip: '#5a1a14' }, { dmg: 3, pen: .05 }, 'Лезвие цвета запёкшейся крови.'],
  ],
  axe2h: [
    ['w_greatbeard', 'Двуручная бородатая', 3, 'greatbeard', { head: 'axe', len: 80, bladeW: 1.4, metal: '#cfdae5', grip: '#3f2b1a', hook: true }, {}, 'Секира северного хускарла.'],
    ['w_greataxe', 'Двуручная секира', 3, 'greataxe', { head: 'axe', len: 78, bladeW: 1.35, metal: '#cfdae5', grip: '#3f2b1a' }, { dmg: 2 }, 'Заносится двумя руками, опускается один раз.'],
    ['w_bardiche', 'Бердыш', 4, 'bardiche', { head: 'axe', len: 96, bladeW: 1.7, metal: '#dde8f2', grip: '#33220f' }, { dmg: 2, pen: .04 }, 'Длинное лезвие на древке.'],
    ['w_labrys', 'Лабрис', 4, 'labrys', { head: 'axe', len: 74, bladeW: 1.5, metal: '#e2ecf6', grip: '#4a3320', double: true }, { dmg: 3 }, 'Двойная критская секира.'],
    ['w_daneaxe', 'Датская секира', 4, 'daneaxe', { head: 'axe', len: 88, bladeW: 1.6, metal: '#e0ebf5', grip: '#33220f' }, { dmg: 4 }, 'Разрубает всадника до седла.'],
    ['w_executioner_axe', 'Секира палача', 5, 'execaxe', { head: 'axe', len: 94, bladeW: 1.75, metal: '#9aa4ad', grip: '#241708' }, { dmg: 6, hit: -4 }, 'Тупая к концу, тяжёлая к началу.'],
    ['w_titanaxe', 'Топор титана', 5, 'titanaxe', { head: 'axe', len: 100, bladeW: 1.9, metal: '#f0d9a0', grip: '#3a2a1a' }, { dmg: 5, pen: .05 }, 'Слишком большой для человека.'],
  ],
  blunt: [
    ['w_club', 'Окованная дубина', 1, 'club', { head: 'mace', len: 42, metal: '#8a6748', grip: '#5a4028', studs: true }, {}, 'Дерево с гвоздями. Проминает латы, не пробивая их.'],
    ['w_spiked_club', 'Шипастая дубина', 2, 'spikedclub', { head: 'mace', len: 46, metal: '#9a7a58', grip: '#5a4028', studs: true }, { dmg: 1 }, 'Гвозди торчат во все стороны.'],
    ['w_mace', 'Булава', 2, 'mace', { head: 'mace', len: 48, metal: '#a7b3bf', grip: '#4a3320' }, {}, 'Стальная головка на короткой рукояти.'],
    ['w_war_mace', 'Боевая булава', 3, 'warmace', { head: 'mace', len: 52, metal: '#b8c5d2', grip: '#3f2b1a' }, { dmg: 1 }, 'Свинчатка на цепочке.'],
    ['w_flanged', 'Гранёная булава', 3, 'flanged', { head: 'mace', len: 54, metal: '#c0ccd8', grip: '#3f2b1a', flanges: true }, { pen: .03 }, 'Шесть граней, шесть рёбер.'],
    ['w_skull_mace', 'Булава-череп', 4, 'skullmace', { head: 'mace', len: 56, metal: '#cfdae6', grip: '#33220f', skull: true }, { dmg: 2 }, 'Головка отлита в виде черепа.'],
    ['w_morningstar', 'Моргенштерн', 4, 'morningstar', { head: 'mace', len: 58, metal: '#cfdae6', grip: '#33220f', spikes: true, chain: true }, { dmg: 2, pen: .04 }, 'Шар с шипами на цепи. Броня тут не помогает.'],
    ['w_sun_mace', 'Солнечная булава', 5, 'sunmace', { head: 'mace', len: 58, metal: '#e8c65f', grip: '#7a2f28', flanges: true, rays: true }, { dmg: 4 }, 'Лучи расходятся от головки.'],
  ],
  hammer: [
    ['w_blacksmith', 'Молот кузнеца', 2, 'smithhammer', { head: 'hammer', len: 46, metal: '#9fa9b4', grip: '#4a3320' }, { hit: 2 }, 'Инструмент, нашедший новое применение.'],
    ['w_warhammer', 'Боевой молот', 2, 'warhammer', { head: 'hammer', len: 48, metal: '#a7b3bf', grip: '#4a3320' }, {}, 'Пробивает кирасу и ломает ключицу.'],
    ['w_horseman_pick', 'Конный клевец', 3, 'horsemanpick', { head: 'pick', len: 54, metal: '#b8c5d2', grip: '#3f2b1a' }, { pen: .04 }, 'Клюв входит в любую щель.'],
    ['w_warpick', 'Клевец', 3, 'warpick', { head: 'pick', len: 52, metal: '#b8c5d2', grip: '#3f2b1a' }, {}, 'Узкий клюв против лат.'],
    ['w_sledge', 'Кузнечная кувалда', 4, 'sledge', { head: 'hammer', len: 58, metal: '#c9d5e1', grip: '#33220f', big: true }, { dmg: 1 }, 'Тяжёлая и честная.'],
    ['w_judge', 'Молот судьи', 4, 'judge', { head: 'hammer', len: 56, metal: '#d0dbe7', grip: '#33220f', big: true }, { pen: .04 }, 'Выносит приговор без слов.'],
    ['w_thunder', 'Молот грома', 5, 'thunder', { head: 'hammer', len: 62, metal: '#e8c65f', grip: '#2f4a3a', big: true, huge: true }, { dmg: 4 }, 'Говорят, им бил сам Тор.'],
  ],
  hammer2h: [
    ['w_ram', 'Таранный молот', 3, 'ram', { head: 'hammer', len: 66, metal: '#9fa9b4', grip: '#33220f', big: true }, {}, 'Головка как таран.'],
    ['w_maul', 'Двуручный молот', 3, 'maul', { head: 'hammer', len: 68, metal: '#9fa9b4', grip: '#33220f', big: true }, { dmg: 2 }, 'Сокрушает даже самый прочный шлем.'],
    ['w_greathammer', 'Молот палача', 4, 'greathammer', { head: 'hammer', len: 78, metal: '#d0dbe7', grip: '#241708', big: true, huge: true }, { dmg: 2 }, 'Не оружие, а приговор.'],
    ['w_earthbreaker', 'Земледробитель', 4, 'earthbreaker', { head: 'hammer', len: 84, metal: '#c9d5e1', grip: '#33220f', big: true, huge: true }, { dmg: 3, hit: -2 }, 'Оставляет воронки в песке.'],
    ['w_godhammer', 'Молот богов', 5, 'godhammer', { head: 'hammer', len: 90, metal: '#f0d070', grip: '#2f4a3a', big: true, huge: true }, { dmg: 5 }, 'Золото и камень.'],
    ['w_doomhammer', 'Молот рока', 5, 'doomhammer', { head: 'hammer', len: 86, metal: '#b06a5a', grip: '#241708', big: true, huge: true }, { dmg: 6, pen: .04 }, 'Красная сталь, чёрные заклёпки.'],
  ],
  polearm: [
    ['w_spear', 'Короткое копьё', 1, 'spear', { head: 'spear', len: 94, metal: '#b98d5c', grip: '#7d5637', tip: '#d6e0ea' }, {}, 'Держит врага на расстоянии двух шагов.'],
    ['w_harpoon', 'Гарпун', 2, 'harpoon', { head: 'spear', len: 88, metal: '#a37850', grip: '#6b4a2a', tip: '#c9d3dc', barb: true }, { pen: .04 }, 'С зазубринами у острия.'],
    ['w_trident', 'Трезубец ретиария', 2, 'trident', { head: 'trident', len: 92, metal: '#7d5637', grip: '#6b4a2a', tip: '#e0bd5f' }, {}, 'Классика арены: три зубца и никакой пощады.'],
    ['w_lance', 'Турнирное копьё', 3, 'lance', { head: 'spear', len: 110, metal: '#c9a46a', grip: '#5d3f24', tip: '#e8f0f8', vamplate: true }, { hit: 2 }, 'Длинное, с широким щитком.'],
    ['w_pike', 'Длинная пика', 3, 'pike', { head: 'spear', len: 118, metal: '#a37850', grip: '#6b4a2a', tip: '#c9d3dc' }, {}, 'Два шага дистанции. Подойти — уже подвиг.'],
    ['w_glaive', 'Глефа', 3, 'glaive', { head: 'halberd', len: 106, metal: '#8a6244', grip: '#5d3f24', tip: '#d6e0ea' }, {}, 'Клинок на длинном древке.'],
    ['w_partisan', 'Партизан', 4, 'partisan', { head: 'spear', len: 112, metal: '#a37850', grip: '#4a3320', tip: '#e2ecf6', wide: true }, { dmg: 1 }, 'Широкое перо с ушками.'],
    ['w_halberd', 'Алебарда', 4, 'halberd', { head: 'halberd', len: 104, metal: '#8a6244', grip: '#5d3f24', tip: '#d6e0ea' }, { pen: .1 }, 'Копьё, топор и крюк в одном древке.'],
    ['w_imperial_lance', 'Имперское копьё', 5, 'implance', { head: 'spear', len: 116, metal: '#d9b45c', grip: '#7a2f28', tip: '#f0e0a0' }, { dmg: 3, hit: 2 }, 'Золото на древке.'],
    ['w_trident_champion', 'Трезубец чемпиона', 5, 'tridentchamp', { head: 'trident', len: 108, metal: '#d9b45c', grip: '#7a2f28', tip: '#f0e0a0' }, { dmg: 3 }, 'Три зубца из белой стали.'],
  ],
  ranged: [
    ['w_shortbow', 'Охотничий лук', 1, 'shortbow', { head: 'bow', len: 40, metal: '#b8834f', grip: '#6b4a2a' }, {}, 'Стреляет через пол-арены. Броню почти не берёт.'],
    ['w_hunting_bow', 'Лук охотника', 2, 'huntingbow', { head: 'bow', len: 46, metal: '#9a6a38', grip: '#5a4028' }, { hit: 2 }, 'Гибкий ясень с жилой.'],
    ['w_warbow', 'Боевой лук', 2, 'warbow', { head: 'bow', len: 48, metal: '#8a5426', grip: '#5a4028' }, { dmg: 1 }, 'Склеен из дерева и рога.'],
    ['w_horsebow', 'Конный лук', 3, 'horsebow', { head: 'bow', len: 44, metal: '#c08a3a', grip: '#4a3320', recurve: true }, { hit: 1 }, 'Короткий, но злой.'],
    ['w_longbow', 'Длинный лук', 3, 'longbow', { head: 'bow', len: 58, metal: '#a9742f', grip: '#4a3320' }, {}, 'Пробивает кольчугу с семи шагов.'],
    ['w_recurve', 'Составной лук', 4, 'recurve', { head: 'bow', len: 52, metal: '#c08a3a', grip: '#3f2b1a', recurve: true }, { dmg: 1, hit: 2 }, 'Свистит, а не стреляет.'],
    ['w_elm_bow', 'Вязовый лук', 4, 'elmbow', { head: 'bow', len: 62, metal: '#8a6a3a', grip: '#33220f' }, { dmg: 2 }, 'Тяжёлый, как кулак великана.'],
    ['w_phoenix', 'Лук феникса', 5, 'phoenix', { head: 'bow', len: 60, metal: '#e0703a', grip: '#7a2f28', recurve: true }, { dmg: 3, hit: 2 }, 'Пламенное дерево.'],
  ],
  crossbow: [
    ['w_hand_xbow', 'Ручной арбалет', 1, 'handxbow', { head: 'xbow', len: 38, metal: '#7a5f47', grip: '#5a4028' }, {}, 'Стреляет навскидку.'],
    ['w_light_xbow', 'Лёгкий арбалет', 2, 'lightxbow', { head: 'xbow', len: 46, metal: '#7a5f47', grip: '#5a4028' }, {}, 'Наводить долго, зато болт летит точно и глубоко.'],
    ['w_heavy_xbow', 'Тяжёлый арбалет', 3, 'heavyxbow', { head: 'xbow', len: 56, metal: '#5a4c3d', grip: '#3f2b1a', heavy: true }, {}, 'Смертелен против тяжеловооружённых.'],
    ['w_repeating', 'Повторный арбалет', 3, 'repeating', { head: 'xbow', len: 50, metal: '#6a5a48', grip: '#3f2b1a', magazine: true }, { hit: 3 }, 'Магазин на шесть болтов.'],
    ['w_siege_xbow', 'Осадный арбалет', 4, 'siegexbow', { head: 'xbow', len: 64, metal: '#4a3d2e', grip: '#33220f', heavy: true }, { dmg: 2 }, 'Собирается на месте.'],
    ['w_arbalest', 'Арбалет-аркебуза', 4, 'arbalest', { head: 'xbow', len: 64, metal: '#4a3d2e', grip: '#33220f', heavy: true }, { dmg: 2, pen: .05 }, 'Пробивает кирасу насквозь.'],
    ['w_scorpion_xbow', 'Скорпион', 5, 'scorpion', { head: 'xbow', len: 70, metal: '#3a2f24', grip: '#241708', heavy: true }, { dmg: 4, pen: .06 }, 'Назван в честь осадной машины.'],
  ],
  dual: [
    ['w_dual_daggers', 'Пара кинжалов', 2, 'dualdaggers', { head: 'blade', len: 32, curve: .1, guard: 'cross', metal: '#c3cfdb', grip: '#5a4028', dual: true }, {}, 'Два клинка, два удара, одна ошибка у врага.'],
    ['w_dual_sickles', 'Пара серпов', 3, 'dualsickles', { head: 'blade', len: 36, curve: .7, guard: 'none', metal: '#c9d5e1', grip: '#4a3320', dual: true }, { hit: 2 }, 'Жатва на песке.'],
    ['w_dual_swords', 'Пара коротких мечей', 3, 'dualswords', { head: 'blade', len: 50, curve: 0, guard: 'cross', metal: '#d6e0ea', grip: '#4a3320', dual: true }, {}, 'Стиль димахера: одна рука прикрывает, другая убивает.'],
    ['w_dual_gladius', 'Пара гладиусов', 4, 'dualgladius', { head: 'blade', len: 54, curve: .02, guard: 'cross', metal: '#e2ecf6', grip: '#6b4a2a', dual: true }, { dmg: 1 }, 'Легионер без щита.'],
    ['w_dual_katar', 'Пара катаров', 4, 'dualkatar', { head: 'blade', len: 30, curve: 0, guard: 'none', metal: '#e4ecf4', grip: '#4a3320', dual: true }, { pen: .08 }, 'Два клинка из кулаков.'],
    ['w_dual_axes', 'Пара топоров', 4, 'dualaxes', { head: 'axe', len: 48, bladeW: 1.1, metal: '#b3c1cd', grip: '#4a3320', dual: true }, { dmg: 1 }, 'Берсерк не выбирает руку. Бьёт обеими.'],
    ['w_dual_fangs', 'Клыки близнецов', 5, 'dualfangs', { head: 'blade', len: 56, curve: .15, guard: 'disc', metal: '#b9e0c8', grip: '#2f4a3a', dual: true }, { dmg: 2, hit: 2 }, 'Пара клинков из одной заготовки.'],
  ]
};

// [id, имя, тир, vis, цвет, моды, описание]
const ARMOR_PROFILE = {
  offhand: { armor: [18, 30], def: [7, 12] },
  head:    { armor: [20, 30] },
  body:    { armor: [30, 42] },
  arms:    { armor: [13, 20] },
  legs:    { armor: [14, 21] }
};

const ARMOR_DEFS = {
  offhand: [
    ['o_hide', 'Кожаный щит', 1, 'round', '#8a6244', {}, 'Обтянут бычьей кожей.'],
    ['o_buckler', 'Деревянный баклер', 1, 'buckler', '#a5744a', {}, 'Лёгкий щит для парирования.'],
    ['o_studded', 'Клёпаный щит', 2, 'round', '#8a6a48', { emblem: 'studs' }, 'Железные бляхи по кругу.'],
    ['o_round', 'Круглый щит', 2, 'round', '#9a7a50', {}, 'Надёжный щит с железным умбоном.'],
    ['o_heater', 'Треугольный щит', 3, 'kite', '#7a5a38', { emblem: 'cross' }, 'Классика рыцаря.'],
    ['o_spiked', 'Шипастый щит', 3, 'round', '#6a5a48', { emblem: 'spikes' }, 'Им не только защищаются.'],
    ['o_scutum', 'Башенный скутум', 3, 'scutum', '#a5744a', {}, 'Закрывает почти всё тело бойца.'],
    ['o_aspis', 'Греческий аспис', 4, 'round', '#c9a45c', { emblem: 'lambda' }, 'Бронза с лямбдой.'],
    ['o_kite', 'Каплевидный щит', 4, 'kite', '#8a6a48', {}, 'Форма отводит удар вниз.'],
    ['o_mirror', 'Зеркальный щит', 4, 'round', '#c8d4e0', { emblem: 'mirror' }, 'Полированная сталь слепит врага.'],
    ['o_tower', 'Ростовой щит', 4, 'tower', '#7a5a38', {}, 'Стена из дуба и стали.'],
    ['o_pavise', 'Павеза', 5, 'tower', '#5a4a38', { emblem: 'gold' }, 'Осадный щит с подпоркой.'],
    ['o_lion', 'Львиный щит', 5, 'scutum', '#c9a45c', { emblem: 'lion' }, 'Золотой лев на алом поле.'],
    ['o_tower_gold', 'Золочёный ростовой', 5, 'tower', '#d9b45c', { emblem: 'gold' }, 'Для тех, кто не боится бликов.'],
    // --- Новые школы: Средневековье, Китай, Русь, Монголия ---
    ['o_knight_shield', 'Рыцарский щит', 4, 'kite', '#3a4a6a', { emblem: 'cross', visStyle: 'medieval' }, 'Синее поле, золотой крест.'],
    ['o_han_shield', 'Щит эпохи Хань', 4, 'round', '#8a2f28', { emblem: 'gold', visStyle: 'china' }, 'Лак и бронза, круглый, как солнце.'],
    ['o_rus_shield', 'Русский щит', 4, 'kite', '#7a2f28', { emblem: 'lion', visStyle: 'rus' }, 'Червлёный щит с золотым зверем.'],
    ['o_mongol_shield', 'Монгольский щит', 4, 'round', '#6a4a2e', { emblem: 'studs', visStyle: 'mongol' }, 'Плетёный из прутьев, обтянут кожей.']
  ],
  head: [
    ['h_band', 'Кожаная повязка', 1, 'headband', '#7d5637', {}, 'Хоть что-то для головы.'],
    ['h_hood', 'Кожаный капюшон', 1, 'hood', '#7d5637', {}, 'Мягкая кожа, тёплый вид.'],
    ['h_cap', 'Кожаный шлем', 1, 'leathercap', '#6b4a2e', {}, 'Плотная кожа с металлическими бляхами.'],
    ['h_skullcap', 'Черепной колпак', 2, 'cap', '#9aa4ad', {}, 'Простая стальная чаша.'],
    ['h_nasal', 'Норманнский шлем', 2, 'nasal', '#b0bac4', {}, 'Классический железный шлем с наносником.'],
    ['h_kettle', 'Капалин', 2, 'kettle', '#a9b4bf', {}, 'Широкие поля защищают плечи от стрел.'],
    ['h_spangen', 'Спангенхельм', 3, 'spangen', '#c2ccd6', { trim: '#d9b45c' }, 'Клёпаный каркас из полос.'],
    ['h_thracian', 'Фракийский шлем', 3, 'thracian', '#c9a45c', { crest: '#8a2f28' }, 'Гладиаторский гребень.'],
    ['h_sutton', 'Секуторский шлем', 3, 'sutton', '#b0bac4', { crest: '#2f4a3a', face: true }, 'Без гребня, с глухим лицом.'],
    ['h_murmillo', 'Шлем мурмиллона', 3, 'murmillo', '#d9b45c', { crest: '#c9402f' }, 'Тяжёлый шлем с решёткой и гребнем.'],
    ['h_bascinet', 'Бацинет', 4, 'bascinet', '#ccd6e0', {}, 'Острый верх, подвижное забрало.'],
    ['h_sallet', 'Салад', 4, 'sallet', '#b9c4cf', {}, 'Немецкая сталь с длинным козырьком.'],
    ['h_greathelm', 'Топфхельм', 4, 'greathelm', '#ccd6e0', {}, 'Глухой стальной цилиндр.'],
    ['h_horned', 'Рогатый шлем ярла', 4, 'horned', '#b9c4cf', {}, 'Враги запоминают такой силуэт.'],
    ['h_crown', 'Венец чемпиона', 5, 'crown', '#e5b54f', { def: 6 }, 'Золото на голове не защищает, но пугает.'],
    ['h_imperial_gold', 'Имперский венец', 5, 'imperialcrown', '#f0d070', { def: 8, trim: '#c0392b' }, 'Лавры и золото. Носить — честь.'],
    // --- Новые школы: Средневековье, Китай, Русь, Монголия ---
    ['h_knight_bascinet', 'Рыцарский бацинет', 4, 'bascinet', '#c8d4e0', { visStyle: 'medieval', trim: '#c0392b' }, 'Стальной купол с плюмажем.'],
    ['h_han_cap', 'Ханьский колпак', 4, 'hanhelm', '#8a2f28', { visStyle: 'china', trim: '#e2b65a' }, 'Лаковая шапочка с золотым шипом.'],
    ['h_rus_helm', 'Русский шелом', 4, 'rushelm', '#b8c2cc', { visStyle: 'rus', trim: '#c9a45c' }, 'Высокий купол с бармицей.'],
    ['h_mongol_helm', 'Монгольский шлем', 4, 'mongolhelm', '#8a7a5a', { visStyle: 'mongol', trim: '#5a4a2e' }, 'Кожа и сталь, меховой обод.'],
    // --- Новые модели: у каждого свой силуэт ---
    ['h_turban', 'Тканевая чалма', 2, 'turban', '#c8b48c', {}, 'Многослойная ткань. Держит удар не хуже колпака.'],
    ['h_brim', 'Шляпа с полями', 2, 'brimhat', '#6a5232', { trim: '#8a6a3a' }, 'Поля прикрывают глаза от солнца и стрел.'],
    ['h_fur', 'Меховой треух', 3, 'furhat', '#7a5a3a', { trim: '#b8a888' }, 'Тёплый, тяжёлый, с медными накладками.'],
    ['h_barbute', 'Барбют', 4, 'barbute', '#c0cad6', { trim: '#8a95a0' }, 'Колокол с Т-образным вырезом для лица.'],
    ['h_kabuto', 'Кабуто', 5, 'kabuto', '#3a3a42', { trim: '#c9a45c' }, 'Лаковые пластины и полумесяц на лбу.']
  ],
  body: [
    ['b_rags', 'Лохмотья', 1, 'rags', '#8a7a66', {}, 'Ткань и дыры.'],
    ['b_tunic', 'Простая туника', 1, 'tunic', '#8f6a4c', {}, 'Ткань. Держит только от солнца.'],
    ['b_hide_raw', 'Сырая шкура', 1, 'hide', '#7a5a38', {}, 'Пахнет скотом, держит удары.'],
    ['b_gambeson', 'Стёганый гамбезон', 1, 'gambeson', '#a8886a', {}, 'Двадцать слоёв льна. Мягко гасит удар.'],
    ['b_quilted', 'Стёганка', 2, 'quilted', '#9a7a58', {}, 'Плотная, тёплая, живучая.'],
    ['b_leather', 'Клёпаный кожаный доспех', 2, 'leather', '#6b4529', {}, 'Хорошо держит режущие удары, плохо — дробящие.'],
    ['b_scale', 'Чешуйчатый доспех', 3, 'scale', '#9aa6b2', {}, 'Стальные чешуйки на коже. Гибко и надёжно.'],
    ['b_mail', 'Кольчужная рубаха', 3, 'mail', '#98a3ad', {}, 'Тяжёлое плетение из тысяч колец.'],
    ['b_chain_long', 'Длинная кольчуга', 3, 'chainlong', '#8a95a0', {}, 'Кольчуга до колен.'],
    ['b_brigandine', 'Бригантина', 3, 'brigandine', '#7a5a48', {}, 'Пластины под тканью.'],
    ['b_splint', 'Шинный доспех', 3, 'splint', '#a0aab4', {}, 'Металлические полосы на ремнях.'],
    ['b_bronze_muscle', 'Бронзовый мускульный', 4, 'bronzemuscle', '#c9a45c', {}, 'Анатомические формы из бронзы.'],
    ['b_lorica', 'Лорика сегментата', 4, 'lorica', '#b0bac4', {}, 'Пластины легиона.'],
    ['b_cuirass', 'Кираса', 4, 'cuirass', '#c2ccd6', {}, 'Цельная грудь и спина.'],
    ['b_lamellar', 'Ламеллярный доспех', 4, 'lamellar', '#b08a4a', {}, 'Пластины, стянутые шнуром.'],
    ['b_plate', 'Кираса центуриона', 5, 'plate', '#d8b455', {}, 'Бронза и сталь. Носивший её не проигрывал.'],
    ['b_dragon', 'Драконья чешуя', 5, 'dragon', '#4a8a6a', {}, 'Чешуя, которой не должно быть.'],
    ['b_imperial', 'Имперские латы', 5, 'imperial', '#e8c65f', {}, 'Парад и война в одном доспехе.'],
    // --- Новые школы: Средневековье, Китай, Русь, Монголия ---
    ['b_knight_plate', 'Рыцарский доспех', 4, 'medieval', '#c0cad6', { trim: '#c0392b' }, 'Сборные латы с наплечниками и нагрудником.'],
    ['b_han_lamellar', 'Ханьский ламелляр', 4, 'china', '#a83a2c', { trim: '#e2b65a' }, 'Красный лак, бронзовые пластины, пояс с драконом.'],
    ['b_rus_kolchuga', 'Русская кольчуга', 4, 'rus', '#9aa8b4', { trim: '#8a2f28' }, 'Плотное плетение с медными вставками.'],
    ['b_mongol_khatanga', 'Монгольский хатанга', 4, 'mongol', '#8a6a44', { trim: '#c9a45c' }, 'Кожа и сталь, меховой воротник.'],
    // --- Новые модели: у каждого свой силуэт ---
    ['b_sleeveless', 'Безрукавка', 1, 'sleeveless', '#7a6a52', {}, 'Кожаный жилет на голое тело.'],
    ['b_poncho', 'Плащ-накидка', 2, 'poncho', '#5a6a4a', {}, 'Кусок плотной ткани с прорезью для головы.'],
    ['b_cuirbouilli', 'Варёная кожа', 2, 'cuirbouilli', '#8a5a32', {}, 'Кожа, затвердевшая в кипятке. Как дерево.'],
    ['b_lamellar_iron', 'Железный ламелляр', 3, 'lamellariron', '#8a95a0', {}, 'Тяжёлые железные пластины в шнуровке.'],
    ['b_hauberk', 'Хауберк с капюшоном', 3, 'hauberk', '#9aa4ad', {}, 'Кольчуга с рукавами и подшлемником.'],
    ['b_muscle_iron', 'Железный мускульный', 4, 'muscleiron', '#a8b2bc', {}, 'Кованые мышцы. Пугает и защищает.'],
    ['b_gothic', 'Готические латы', 5, 'gothic', '#c8d2dc', { trim: '#7a2f28' }, 'Рифлёная сталь с острыми гранями.']
  ],
  arms: [
    ['a_leather_guard', 'Кожаные наручи', 1, 'leatherguard', '#7a5a3a', {}, 'Ремни на предплечьях.'],
    ['a_wraps', 'Кожаные обмотки', 1, 'wraps', '#8a6244', {}, 'Защищают предплечья от порезов.'],
    ['a_bronze_bracers', 'Бронзовые наручи', 2, 'bronzebracer', '#b08a4a', {}, 'Тёплая бронза.'],
    ['a_bracers', 'Стальные наручи', 2, 'bracers', '#a9b3bd', {}, 'Тонкие пластины, привычные движения.'],
    ['a_manica', 'Сегментная маника', 2, 'manica', '#b6c0ca', {}, 'Пластины на руке, как у гладиаторов.'],
    ['a_chain_sleeves', 'Кольчужные рукава', 3, 'chainsleeve', '#98a3ad', {}, 'Кольца до локтя.'],
    ['a_scale_arms', 'Чешуйчатые наручи', 3, 'scalearm', '#9aa6b2', {}, 'Чешуя на руках.'],
    ['a_gladiator_manica', 'Гладиаторская маника', 3, 'gladmanica', '#c9a45c', {}, 'С бронзовыми вставками.'],
    ['a_plate_arms', 'Латные наплечники', 4, 'pauldron', '#d8b455', {}, 'Тяжёлая защита рук и плеч.'],
    ['a_iron_vambraces', 'Железные наручи', 4, 'vambrace', '#b0bac4', {}, 'Просто и надёжно.'],
    ['a_gold_arms', 'Позолоченные наручи', 5, 'goldarm', '#e8c65f', {}, 'Роскошь на запястьях.'],
    ['a_titan_arms', 'Наручи титана', 5, 'titanarm', '#8a6a4a', {}, 'Слишком велики, но держатся.'],
    // --- Новые школы: Средневековье, Китай, Русь, Монголия ---
    ['a_knight_vambraces', 'Рыцарские наручи', 4, 'medieval', '#c0cad6', { trim: '#c0392b' }, 'Стальные створки на всю руку.'],
    ['a_han_sleeves', 'Ханьские рукава', 4, 'china', '#a83a2c', { trim: '#e2b65a' }, 'Лаковая пластинчатая защита предплечий.'],
    ['a_rus_bracers', 'Русские наручи', 4, 'rus', '#9aa8b4', { trim: '#8a2f28' }, 'Кольчуга и медные бляхи.'],
    ['a_mongol_bracers', 'Монгольские наручи', 4, 'mongol', '#8a6a44', { trim: '#c9a45c' }, 'Кожа, стянутая стальными полосами.'],
    // --- Новые модели: у каждого свой силуэт ---
    ['a_arm_wraps', 'Тканевые обмотки', 1, 'armwraps', '#a89070', {}, 'Полосы ткани в несколько слоёв. Дёшево и не натирает.'],
    ['a_hide_guards', 'Кожаные щитки', 2, 'hideguard', '#6a4a2c', { trim: '#8a6a3a' }, 'Жёсткая кожа, прошитая по краю.'],
    ['a_splint_bracers', 'Шинные наручи', 3, 'splintarm', '#a0aab4', { trim: '#7a5a38' }, 'Стальные полосы на ремнях, гнутся с рукой.'],
    ['a_lamellar_sleeves', 'Ламеллярные рукава', 4, 'lamellararm', '#b08a4a', { trim: '#e2b65a' }, 'Мелкие пластины в шнуровке до локтя.'],
    ['a_fauld_arms', 'Наручи с оплечьем', 5, 'fauldarm', '#d8c8a8', { trim: '#c9a45c' }, 'Створки с гребнем и золотой насечкой.']
  ],
  legs: [
    ['l_bare_boots', 'Кожаные сапоги', 1, 'boots', '#6b4a2e', {}, 'Мягкая кожа.'],
    ['l_sandals', 'Калиги и обмотки', 1, 'sandals', '#7d5637', {}, 'Лёгкие сандалии легионера.'],
    ['l_wraps_legs', 'Плотные обмотки', 1, 'legwraps', '#8a6a48', {}, 'Ткань и ремни.'],
    ['l_hide_greaves', 'Кожаные поножи', 2, 'hidegreaves', '#7a5a38', {}, 'Кожа на голенях.'],
    ['l_greaves', 'Железные поножи', 2, 'greaves', '#a2acb6', {}, 'Надёжно закрывают голени.'],
    ['l_chain_leggings', 'Кольчужные чулки', 3, 'chainlegs', '#98a3ad', {}, 'Кольца до колен.'],
    ['l_scale_leggings', 'Чешуйчатые поножи', 3, 'scalelegs', '#9aa6b2', {}, 'Чешуя на бёдрах.'],
    ['l_plate_legs', 'Латные поножи', 4, 'platelegs', '#c2ccd6', {}, 'Кованые створки. Ходить тяжело.'],
    ['l_gold_greaves', 'Позолоченные поножи', 4, 'goldgreaves', '#e0bc5a', {}, 'Роскошь, которую не стыдно забрызгать кровью.'],
    ['l_iron_greaves', 'Железные латы ног', 4, 'irongreaves', '#b0bac4', {}, 'Тяжело ходить, зато не больно.'],
    ['l_imperial_greaves', 'Имперские поножи', 5, 'imperialgreaves', '#e8c65f', {}, 'Сталь с золотом.'],
    ['l_titan_greaves', 'Поножи титана', 5, 'titangreaves', '#c9a45c', {}, 'Выдержат удар тарана.'],
    // --- Новые школы: Средневековье, Китай, Русь, Монголия ---
    ['l_knight_greaves', 'Рыцарские поножи', 4, 'medieval', '#c0cad6', { trim: '#c0392b' }, 'Кованые створки с наколенниками.'],
    ['l_han_leggings', 'Ханьские поножи', 4, 'china', '#a83a2c', { trim: '#e2b65a' }, 'Лак и пластины до колен.'],
    ['l_rus_leggings', 'Русские поножи', 4, 'rus', '#9aa8b4', { trim: '#8a2f28' }, 'Кольчуга и кожаные ремни.'],
    ['l_mongol_leggings', 'Монгольские поножи', 4, 'mongol', '#8a6a44', { trim: '#c9a45c' }, 'Мягкая кожа со стальными накладками.'],
    // --- Новые модели ---
    ['l_puttees', 'Портянки и лапти', 1, 'puttees', '#8a7452', {}, 'Дёшево и почти не мешает бегать.'],
    ['l_gaiters', 'Кожаные гетры', 2, 'gaiters', '#5c4228', { trim: '#8a6a3a' }, 'Обхватывают голень ремнями.'],
    ['l_baggy', 'Шаровары', 2, 'baggy', '#6a5a48', {}, 'Свободные штаны, подвязанные у щиколотки.'],
    ['l_splint_legs', 'Шинные наголенники', 3, 'splintlegs', '#a0aab4', { trim: '#7a5a38' }, 'Стальные полосы на кожаной основе.'],
    ['l_samurai', 'Самурайские наголенники', 5, 'samurai', '#3a3a42', { trim: '#c9a45c' }, 'Лаковые пластины, шнурованные золотом.']
  ]
};

// ==================== ТРЕБОВАНИЯ К ХАРАКТЕРИСТИКАМ ====================
// Чем выше тир — тем выше требования. Тяжёлое оружие требует силу,
// парное и луки — ловкость, тяжёлая броня — телосложение/выносливость.
const TIER_REQ = {
  1: { str: 3, dex: 3, vit: 3, sta: 3 },
  2: { str: 5, dex: 5, vit: 5, sta: 5 },
  3: { str: 7, dex: 7, vit: 7, sta: 7 },
  4: { str: 9, dex: 9, vit: 9, sta: 9 },
  5: { str: 12, dex: 12, vit: 12, sta: 12 }
};

// Профиль требований по категории оружия: множители к базовым требованиям тира
const WEAPON_REQ_PROFILE = {
  sword:    { str: 1.0, dex: 0.8, sta: 0.6 },
  sword2h:  { str: 1.5, dex: 0.7, sta: 1.0 },
  dagger:   { str: 0.5, dex: 1.4, sta: 0.5 },
  axe:      { str: 1.25, dex: 0.7, sta: 0.7 },
  axe2h:    { str: 1.7, dex: 0.6, sta: 1.1 },
  blunt:    { str: 1.2, dex: 0.7, sta: 0.8 },
  hammer:   { str: 1.35, dex: 0.6, sta: 0.9 },
  hammer2h: { str: 1.8, dex: 0.5, sta: 1.2 },
  polearm:  { str: 1.1, dex: 0.9, sta: 0.8 },
  ranged:   { str: 0.8, dex: 1.4, sta: 0.7 },
  crossbow: { str: 1.0, dex: 1.1, sta: 0.9 },
  dual:     { str: 0.8, dex: 1.6, sta: 0.8 }
};

// Профиль требований по слоту брони
const ARMOR_REQ_PROFILE = {
  offhand: { str: 0.9, vit: 0.8, sta: 0.7 },
  head:    { vit: 0.8, wil: 0.6 },
  body:    { str: 0.7, vit: 1.2, sta: 0.8 },
  arms:    { dex: 0.8, sta: 0.7 },
  legs:    { str: 0.7, vit: 0.9, sta: 0.7 }
};

function reqForWeapon(it) {
  const base = TIER_REQ[it.tier] || TIER_REQ[2];
  const prof = WEAPON_REQ_PROFILE[it.cat] || {};
  const req = {};
  Object.keys(prof).forEach(k => {
    req[k] = Math.max(1, Math.round((base[k] || base.str) * prof[k]));
  });
  // Тяжёлое/двуручное оружие требует ещё больше силы
  if (it.twoHanded) req.str = (req.str || 1) + Math.max(1, Math.round(it.tier * 0.6));
  return req;
}

function reqForArmor(it) {
  const base = TIER_REQ[it.tier] || TIER_REQ[2];
  const prof = ARMOR_REQ_PROFILE[it.slot] || {};
  const req = {};
  Object.keys(prof).forEach(k => {
    req[k] = Math.max(1, Math.round((base[k] || base.vit) * prof[k]));
  });
  // Щиты требуют силы тем больше, чем прочнее
  if (it.slot === 'offhand' && it.armor) {
    req.str = (req.str || 1) + Math.round(it.armor / 26);
  }
  return req;
}

// Проверка: хватает ли характеристик
function canEquipItem(glad, item) {
  if (!item) return { ok: true, missing: [] };
  if (!item.req) return { ok: true, missing: [] };
  const attrs = glad.attrs || {};
  const missing = [];
  Object.keys(item.req).forEach(k => {
    const need = item.req[k];
    const have = attrs[k] || 0;
    if (have < need) missing.push({ key: k, need, have });
  });
  return { ok: missing.length === 0, missing };
}

// ==================== ПРАВИЛА РУК ====================
// Правая рука держит любое оружие. Левая — щит ИЛИ второй одноручный клинок.
// Снаряжение универсальное: класс не ограничивает ни щит, ни оружие.
function classAllowsShield() {
  return true;
}

// Можно ли положить этот предмет во вторую руку как оружие.
// Годится одноручный клинок. «Парный» набор — это уже готовые два клинка:
// он занимает обе руки сразу (вторая копия кладётся автоматически).
function canOffhandWeapon(glad, item) {
  if (!item || item.slot !== 'weapon') return false;
  if (item.bothHands) return false;                 // двуручное занимает обе руки
  if (glad && glad.equip) {
    const main = glad.equip.weapon;
    if (main && main.bothHands) return false;
    // Парный набор уже занял обе руки: второй клинок рисуется в левой
    // руке автоматически, щит туда не встанет.
    if (main && main.dualPair) return false;
  }
  return true;
}

// Годится ли оружие в правую руку: второй клинок набора — только в левую
function canMainWeapon(glad, item) {
  if (!item || item.slot !== 'weapon') return false;
  return !item.offhandOnly;
}

// Можно ли взять этот предмет в левую руку (щит или клинок)
function canEquipOffhand(glad, item) {
  if (!item) return false;
  if (item.slot === 'offhand') return classAllowsShield(glad);
  if (item.slot === 'weapon') return canOffhandWeapon(glad, item);
  return false;
}

// У бойца два клинка — значит, щита нет и быть не может
function isDualWielding(glad) {
  const eq = (glad && glad.equip) || {};
  return !!(eq.weapon && eq.offhand && eq.offhand.slot === 'weapon');
}

function reqLabel(item) {
  if (!item || !item.req) return '';
  return Object.keys(item.req).map(k => {
    const a = ATTRS.find(x => x.key === k);
    return `${a ? a.icon : k}${item.req[k]}`;
  }).join(' ');
}

// ==================== СБОРКА БАЗЫ ====================
// Вес оружия в «кг»: от него напрямую зависит кулдаун удара в кликер-бою.
// Лёгкий кинжал — около 1.5, двуручная секира — около 5.
function weaponWeightOf(it) {
  const ap = it.apCost || 3;
  const tier = it.tier || 1;
  const w = ap * 0.7 + (it.twoHanded ? 1.2 : 0) + (it.cat === 'dual' ? 0.35 : 0) + tier * 0.15;
  return Math.round(w * 10) / 10;
}

function priceWeapon(it) {
  const dps = (it.dmgMin + it.dmgMax) / 2 / Math.max(1, it.apCost);
  const u = dps * (1 + it.armorPen * 1.4) * (1 + it.hitMod * 0.015) * (1 + (it.range - 1) * 0.1);
  const base = 9 * Math.pow(u, 1.35) + it.tier * 18;
  const p = base * (WEAPON_TIER_PRICE[it.tier] || 1);
  return Math.max(20, Math.round(p / 5) * 5);
}

function priceArmor(it) {
  const base = (it.armor || 0) * 3.2 + (it.defBonus || 0) * 14;
  const p = base * (TIER_PRICE_W[it.tier] || 1);
  return Math.max(25, Math.round(p / 5) * 5);
}

const ITEMS_DB = [];

Object.keys(WEAPON_PROFILE).forEach(cat => {
  const p = WEAPON_PROFILE[cat];
  (WEAPON_DEFS[cat] || []).forEach(d => {
    const [id, name, tier, shape, vis, mods, desc] = d;
    const f = TIER_F[tier];
    const m = mods || {};
    const dmgMin = Math.max(3, Math.round(p.base[0] * f + (m.dmg || 0)));
    const dmgMax = Math.max(dmgMin + 2, Math.round(p.base[1] * f + (m.dmg || 0)));
    const twoHanded = !!(p.twoHanded || m.two);
    const it = {
      id, name, slot: 'weapon', cat, tier, shape,
      dmgMin, dmgMax,
      range: weaponRangeFor(cat),
      apCost: Math.max(1, p.ap + (m.ap || 0)),
      hitMod: Math.round(p.hit + (m.hit || 0)),
      armorPen: Math.max(0.05, +(p.pen + (m.pen || 0)).toFixed(2)),
      twoHanded,
      // Парное оружие — это клинок «двойного хвата»: его можно взять
      // вторым в левую руку. Обе руки занимает только двуручное.
      dualPair: cat === 'dual',
      bothHands: twoHanded,
      gearClass: 'universal',
      desc,
      vis: Object.assign({ head: 'blade', len: 50, metal: '#c8d2dc', grip: '#6b4a2a' }, vis)
    };
    // Вес влияет на кулдаун удара: тяжёлое оружие замахивается дольше.
    it.weight = weaponWeightOf(it);
    it.price = priceWeapon(it);
    it.famePrice = Math.max(1, Math.round(it.price / 18));
    it.req = reqForWeapon(it);
    ITEMS_DB.push(it);
  });
});

Object.keys(ARMOR_PROFILE).forEach(slot => {
  const p = ARMOR_PROFILE[slot];
  (ARMOR_DEFS[slot] || []).forEach(d => {
    const [id, name, tier, vis, color, mods, desc] = d;
    const f = ARMOR_TIER_F[tier];
    const m = mods || {};
    const it = {
      id, name, slot, cat: slot, tier, vis, color,
      armor: Math.round(p.armor[0] * f + (m.armor || 0)),
      desc
    };
    if (p.def) it.defBonus = Math.round(p.def[0] * f + (m.def || 0));
    if (m.emblem) it.emblem = m.emblem;
    if (m.trim) it.trim = m.trim;
    if (m.crest) it.crest = m.crest;
    if (m.face) it.faceMask = true;
    it.gearClass = 'universal';
    it.price = priceArmor(it);
    // Слава — вторая валюта: дорогое снаряжение можно взять за неё,
    // но курс жёсткий — легендарная вещь стоит десяток побед.
    it.famePrice = Math.max(1, Math.round(it.price / 18));
    it.req = reqForArmor(it);
    ITEMS_DB.push(it);
  });
});

// ==================== СНАРЯЖЕНИЕ ДЛЯ ПСОВ ====================
// Псы не носят человеческую броню: у них своя защита — попоны и нагрудники.
// Требований к характеристикам нет (псы не качают атрибуты), зато цена
// держится в той же вилке, что и лёгкая броня гладиатора.
// [id, имя, тир, vis, цвет, броня, цена, описание]
const DOG_GEAR_DEFS = [
  ['dg_leather', 'Кожаная попона', 1, 'leather', '#7a5230', 12, 55,
    'Плотная бычья кожа на спине и боках. Держит клыки и когти.'],
  ['dg_mail', 'Кольчужная попона', 2, 'mail', '#8d99a4', 26, 125,
    'Плетение из мелких колец, стянутое ремнями. Пёс почти не замечает веса.'],
  ['dg_bronze', 'Бронзовый боевой нагрудник', 3, 'bronze', '#b08f43', 44, 215,
    'Пластины с шипами на груди и боках. Работа псарни для лучших зверей.']
];

DOG_GEAR_DEFS.forEach(([id, name, tier, vis, color, armor, price, desc]) => {
  const it = {
    id, name, slot: 'doggear', cat: 'doggear', tier, vis, color,
    armor, price, desc, dogOnly: true, gearClass: 'dog'
  };
  it.req = null;                       // псам характеристики не нужны
  it.famePrice = Math.max(1, Math.round(price / 18));
  ITEMS_DB.push(it);
});

// Быстрый доступ
const ITEM_MAP = {};
ITEMS_DB.forEach(i => { ITEM_MAP[i.id] = i; });
function itemById(id) { return ITEM_MAP[id] || null; }
function itemsByCat(cat) { return ITEMS_DB.filter(i => i.cat === cat); }
function itemsBySlot(slot) { return ITEMS_DB.filter(i => i.slot === slot); }

// ==================== ПРЕДМЕТЫ БОССОВ ====================
// Уникальные вещи, которые нельзя купить. Выпадают только с боссов арены.
// Чем позже босс — тем выше тир и тем сильнее вещь.
const BOSS_ITEMS_DB = [];

function addBossWeapon(id, name, tier, shape, vis, stats, desc) {
  const twoHanded = !!stats.two;
  const it = {
    id, name, slot: 'weapon', cat: shape === 'warhammer' ? 'hammer' : 'sword', tier, shape,
    dmgMin: stats.min, dmgMax: stats.max,
    range: stats.range || 1,
    apCost: stats.ap || 3,
    hitMod: stats.hit || 0,
    armorPen: stats.pen || 0.2,
    twoHanded,
    dualPair: false,
    bothHands: twoHanded,
    desc, vis, bossItem: true, gearClass: 'boss',
    price: Math.round((stats.min + stats.max) * 9 + tier * 120)
  };
  it.weight = weaponWeightOf(it);
  it.famePrice = Math.max(2, Math.round(it.price / 45));
  it.req = reqForWeapon(it);
  BOSS_ITEMS_DB.push(it);
  ITEM_MAP[it.id] = it;
  return it;
}

function addBossArmor(id, name, tier, slot, vis, color, stats, desc) {
  const it = {
    id, name, slot, cat: slot, tier, vis, color,
    armor: stats.armor,
    desc, bossItem: true,
    price: Math.round(stats.armor * 11 + tier * 130)
  };
  if (stats.def) it.defBonus = stats.def;
  if (stats.emblem) it.emblem = stats.emblem;
  if (stats.trim) it.trim = stats.trim;
  if (stats.crest) it.crest = stats.crest;
  if (stats.face) it.faceMask = true;
  it.gearClass = 'boss';
  it.famePrice = Math.max(2, Math.round(it.price / 45));
  it.req = reqForArmor(it);
  BOSS_ITEMS_DB.push(it);
  ITEM_MAP[it.id] = it;
  return it;
}

// --- Босс 1: Ганник Пепельный (2 тир) ---
addBossWeapon('bw_ashfang', 'Пепельный клык', 2, 'gladius',
  { len: 54, curve: .02, guard: 'cross', metal: '#b8b0a4', grip: '#3a2e24' },
  { min: 22, max: 31, hit: 3, pen: .2 }, 'Клинок, закалённый в золе арены.');
addBossArmor('ba_ashplate', 'Пепельная кираса', 2, 'body', 'plate', '#9a9186',
  { armor: 46 }, 'Тяжёлая, серая, будто выкопанная из пепла.');

// --- Босс 2: Мортус Жрец (3 тир) ---
addBossWeapon('bw_gravebell', 'Погребальный колокол', 3, 'flanged',
  { head: 'mace', len: 58, metal: '#8a9aa6', grip: '#2a2a34', flanges: true, skull: true },
  { min: 30, max: 42, hit: 2, pen: .3 }, 'Звенит один раз. Больше не нужно.');
addBossArmor('ba_shroud', 'Саван мертвеца', 3, 'body', 'chain', '#5c6b70',
  { armor: 58 }, 'Кольчуга, снятая с того, кто уже не дышит.');

// --- Босс 3: Игнис Пламенный (4 тир) ---
addBossWeapon('bw_ember', 'Угольный двуручник', 4, 'flamberge',
  { len: 100, curve: .16, guard: 'cross2', metal: '#e08a4a', grip: '#3a1a12' },
  { min: 44, max: 62, hit: 1, pen: .34, two: true, ap: 5 }, 'Лезвие светится изнутри.');
addBossArmor('ba_ember', 'Латы углей', 4, 'body', 'plate', '#c2703a',
  { armor: 78 }, 'Раскалённая сталь, которая не остывает.');

// --- Босс 4: Скади Белая (5 тир) ---
addBossWeapon('bw_frost', 'Клинок вечной зимы', 5, 'nodachi',
  { len: 108, curve: .06, guard: 'disc', metal: '#cfe6f2', grip: '#2a3a44' },
  { min: 58, max: 78, hit: 4, pen: .4, two: true, ap: 5 }, 'От него стынет кровь на клинке.');
addBossArmor('ba_frost', 'Броня ледяной королевы', 5, 'body', 'lamellar', '#a8c8d8',
  { armor: 96 }, 'Пластины, скованные из вечного льда.');

// --- Босс 5: Легенда Колизея (5 тир, сильнее всех) ---
addBossWeapon('bw_legend', 'Гладиус Легенды', 5, 'champion',
  { len: 62, curve: .04, guard: 'basket', metal: '#ffd76a', grip: '#8c1f18' },
  { min: 66, max: 88, hit: 7, pen: .46 }, 'Им закололи сорок семь чемпионов.');
addBossArmor('ba_legend', 'Латы Легенды Колизея', 5, 'body', 'imperial', '#e8c65f',
  { armor: 112, def: 10 }, 'Золото и сталь. Их носил непобеждённый.');

// Визуал оружия по shape (для совместимости с рендером)
const WEAPON_VIS = {};
ITEMS_DB.filter(i => i.slot === 'weapon').forEach(i => { WEAPON_VIS[i.shape] = i.vis; });

const SLOT_NAMES = { weapon: 'Оружие', offhand: 'Щит', head: 'Голова', body: 'Туловище', arms: 'Руки', legs: 'Ноги', doggear: 'Попона' };
const SLOT_ICONS = { weapon: '🗡️', offhand: '🛡️', head: '🪖', body: '🦺', arms: '🧤', legs: '👢', doggear: '🐕' };

const SHOP_TABS = [
  { id: 'weapon', name: 'Оружие', icon: '⚔️' },
  { id: 'armor',  name: 'Броня',  icon: '🛡️' },
  { id: 'dog',    name: 'Псы',    icon: '🐕' }
];

const WEAPON_CATS = [
  { id: 'sword',    name: 'Мечи',             icon: '🗡️' },
  { id: 'sword2h',  name: 'Двуручные мечи',   icon: '⚔️' },
  { id: 'dagger',   name: 'Кинжалы',          icon: '🔪' },
  { id: 'axe',      name: 'Топоры',           icon: '🪓' },
  { id: 'axe2h',    name: 'Двуручные топоры', icon: '🪓' },
  { id: 'blunt',    name: 'Булавы',           icon: '🔨' },
  { id: 'hammer',   name: 'Молоты',           icon: '🔨' },
  { id: 'hammer2h', name: 'Двуручные молоты', icon: '🔨' },
  { id: 'polearm',  name: 'Копья',            icon: '🔱' },
  { id: 'ranged',   name: 'Луки',             icon: '🏹' },
  { id: 'crossbow', name: 'Арбалеты',         icon: '🎯' },
  { id: 'dual',     name: 'Парное',           icon: '⚔️' }
];

const ARMOR_CATS = [
  { id: 'offhand', name: 'Щиты',    icon: '🛡️' },
  { id: 'head',    name: 'Шлемы',   icon: '🪖' },
  { id: 'body',    name: 'Доспехи', icon: '🦺' },
  { id: 'arms',    name: 'Наручи',  icon: '🧤' },
  { id: 'legs',    name: 'Поножи',  icon: '👢' }
];

// Защита для псов: у них своя линейка, человеческую броню им не надеть
const DOG_GEAR_CATS = [
  { id: 'doggear', name: 'Попоны', icon: '🐕' }
];

// ==================== ХАРАКТЕРИСТИКИ ====================
const ATTRS = [
  { key: 'str',  name: 'Сила',         icon: '💪', desc: 'Урон оружием ближнего боя' },
  { key: 'dex',  name: 'Ловкость',     icon: '🤸', desc: 'Уклонение и точность' },
  { key: 'vit',  name: 'Телосложение', icon: '❤️', desc: 'Здоровье' },
  { key: 'sta',  name: 'Выносливость', icon: '⚡', desc: 'Очки действия' },
  { key: 'wil',  name: 'Воля',         icon: '🧠', desc: 'Стойкость и защита' }
];

// ==================== ВНЕШНОСТЬ ====================
const GENDERS = [
  { id: 'male',   name: 'Мужчина' },
  { id: 'female', name: 'Женщина' }
];

const SKIN_TONES = [
  { id: 'light', name: 'Светлая',           color: '#f5c9a4' },
  { id: 'med',   name: 'Средиземноморская', color: '#e8ab7e' },
  { id: 'tan',   name: 'Загорелая',         color: '#cf9468' },
  { id: 'olive', name: 'Смуглая',           color: '#a9744c' },
  { id: 'dark',  name: 'Тёмная',            color: '#7d5236' }
];

const HAIR_COLORS = [
  { id: 'black', name: 'Вороной',    color: '#2a2118' },
  { id: 'brown', name: 'Каштановый', color: '#4a3018' },
  { id: 'blond', name: 'Русый',      color: '#c9a45c' },
  { id: 'red',   name: 'Рыжий',      color: '#a84a3a' },
  { id: 'grey',  name: 'Седой',      color: '#b8bcc0' },
  { id: 'white', name: 'Белый',      color: '#e4e2dc' }
];

const HAIR_STYLES = [
  { id: 'short',      name: 'Короткая' },
  { id: 'long',       name: 'Длинная' },
  { id: 'ponytail',   name: 'Хвост' },
  { id: 'braids',     name: 'Косы' },
  { id: 'bun',        name: 'Пучок' },
  { id: 'mohawk',     name: 'Ирокез' },
  { id: 'curly',      name: 'Кудри' },
  { id: 'dreadlocks', name: 'Дреды' },
  { id: 'topknot',    name: 'Узел' },
  { id: 'shaved',     name: 'Бритый' },
  { id: 'bald',       name: 'Лысый' },
  // --- Новые причёски ---
  { id: 'crew',       name: 'Ёжик' },
  { id: 'slick',      name: 'Зачёс назад' },
  { id: 'parted',     name: 'Пробор' },
  { id: 'fringe',     name: 'Чёлка' },
  { id: 'spiky',      name: 'Рваные пряди' },
  { id: 'halfup',     name: 'Полухвост' },
  { id: 'twinbraids', name: 'Две косы' },
  { id: 'afro',       name: 'Афро' },
  { id: 'wavy',       name: 'Волны' },
  { id: 'undercut',   name: 'Выбритый висок' }
];

const BEARD_STYLES = [
  { id: 'none',        name: 'Нет' },
  { id: 'stubble',     name: 'Щетина' },
  { id: 'full',        name: 'Густая' },
  { id: 'long',        name: 'Длинная' },
  { id: 'goatee',      name: 'Козлиная' },
  { id: 'moustache',   name: 'Усы' },
  // --- Новые бороды ---
  { id: 'shortbox',    name: 'Короткая окладистая' },
  { id: 'verdi',       name: 'Верди' },
  { id: 'chinstrap',   name: 'По контуру' },
  { id: 'imperial',    name: 'Имперская' },
  { id: 'horseshoe',   name: 'Подкова' },
  { id: 'vandyke',     name: 'Ван Дейк' },
  { id: 'garibaldi',   name: 'Гарибальди' },
  { id: 'anchor',      name: 'Якорь' },
  { id: 'ducktail',    name: 'Утиный хвост' },
  { id: 'sidewhiskers',name: 'Бакенбарды' }
];

const BUILDS = [
  { id: 'slim',     name: 'Худой' },
  { id: 'normal',   name: 'Обычный' },
  { id: 'muscular', name: 'Мышцастый' },
  { id: 'heavy',    name: 'Тяжёлый' }
];

// ==================== ФОРМЫ ЛИЦА ====================
// Лицо строится из параметров в долях радиуса головы, поэтому форма
// не ломается при смене телосложения или пола. Один и тот же набор
// работает и для героя, и для врагов.
//   jaw    — ширина нижней челюсти
//   chin   — длина подбородка (вытянутость лица)
//   cheek  — выраженность скул
//   eyeGap — расстояние между глазами
//   eyeSize— размер глаза
//   nose   — длина носа
//   lip    — ширина губ
//   brow   — толщина и высота брови
const FACE_STYLES = [
  { id: 'classic',   name: 'Классическое', jaw: 1.00, chin: 1.00, cheek: 1.00, eyeGap: 1.00, eyeSize: 1.00, nose: 1.00, lip: 1.00, brow: 1.00 },
  { id: 'square',    name: 'Квадратное',   jaw: 1.22, chin: 0.94, cheek: 1.06, eyeGap: 1.04, eyeSize: 0.96, nose: 0.96, lip: 1.06, brow: 1.14 },
  { id: 'oval',      name: 'Овальное',     jaw: 0.86, chin: 1.14, cheek: 0.96, eyeGap: 0.98, eyeSize: 1.02, nose: 1.08, lip: 0.96, brow: 0.92 },
  { id: 'round',     name: 'Круглое',      jaw: 1.10, chin: 0.86, cheek: 1.12, eyeGap: 1.02, eyeSize: 1.06, nose: 0.90, lip: 1.04, brow: 0.94 },
  { id: 'gaunt',     name: 'Худое',        jaw: 0.84, chin: 1.10, cheek: 1.18, eyeGap: 0.96, eyeSize: 1.00, nose: 1.14, lip: 0.90, brow: 1.04 },
  { id: 'broad',     name: 'Широкоскулое', jaw: 1.14, chin: 0.98, cheek: 1.24, eyeGap: 1.10, eyeSize: 0.94, nose: 1.04, lip: 1.02, brow: 1.08 },
  { id: 'pointed',   name: 'Заострённое',  jaw: 0.80, chin: 1.20, cheek: 0.92, eyeGap: 0.96, eyeSize: 1.04, nose: 1.06, lip: 0.92, brow: 0.88 },
  { id: 'weathered', name: 'Обветренное',  jaw: 1.16, chin: 1.02, cheek: 1.10, eyeGap: 1.06, eyeSize: 0.90, nose: 1.16, lip: 1.08, brow: 1.22 }
];

const FACE_BY_ID = {};
FACE_STYLES.forEach(f => { FACE_BY_ID[f.id] = f; });

function faceStyleOf(glad) {
  return FACE_BY_ID[(glad && glad.faceStyle) || 'classic'] || FACE_BY_ID.classic;
}

// ==================== НАБОРЫ ЧЕРТ ====================
// Форма головы — не единственное, что делает лица разными. Даже при
// одинаковом овале лица человек с тяжёлым нависшим веком, крупным
// крючковатым носом и косматыми бровями выглядит совсем иначе, чем
// человек с раскосыми глазами, коротким носом и тонкой дугой брови.
// Каждый набор — коэффициенты поверх формы лица:
//   open  — раскрытость века (высота разреза)
//   tilt  — наклон внешнего угла (положительный — вверх, «кошачий»)
//   round — округлость глаза (1 — круглый, 0 — узкий миндалевидный)
//   lid   — тяжесть верхнего века (0 — открытый взгляд, 1 — нависшее)
//   pupil — размер зрачка

const EYE_SETS = [
  { id: 'calm',     name: 'Спокойные',    open: 1.00, tilt: 0.00, round: 0.35, lid: 0.25, pupil: 1.00 },
  { id: 'narrow',   name: 'Прищуренные',  open: 0.74, tilt: -0.18, round: 0.15, lid: 0.62, pupil: 0.94 },
  { id: 'wide',     name: 'Раскрытые',    open: 1.24, tilt: 0.06, round: 0.72, lid: 0.06, pupil: 1.06 },
  { id: 'heavy',    name: 'Тяжёлые веки', open: 0.90, tilt: -0.06, round: 0.30, lid: 0.88, pupil: 0.92 },
  { id: 'almond',   name: 'Миндалевидные',open: 0.92, tilt: 0.26, round: 0.10, lid: 0.34, pupil: 1.00 },
  { id: 'deep',     name: 'Глубокие',     open: 0.84, tilt: -0.10, round: 0.24, lid: 0.54, pupil: 0.88 },
  { id: 'hawk',     name: 'Хищные',       open: 0.80, tilt: 0.34, round: 0.08, lid: 0.48, pupil: 0.86 },
  { id: 'sleepy',   name: 'Сонные',       open: 0.66, tilt: -0.24, round: 0.44, lid: 0.74, pupil: 1.02 },
  { id: 'kind',     name: 'Добрые',       open: 1.06, tilt: 0.14, round: 0.58, lid: 0.18, pupil: 1.10 },
  { id: 'stare',    name: 'Немигающий',   open: 1.14, tilt: 0.00, round: 0.30, lid: 0.02, pupil: 0.74 }
];

//   len    — длина носа
//   width  — ширина крыльев
//   bridge — ширина спинки
//   hook   — горбинка (0 — прямой, 1 — крючковатый)
//   tip    — опущенность/вздёрнутость кончика
//   flare  — раздутость ноздрей

const NOSE_SETS = [
  { id: 'straight', name: 'Прямой',       len: 1.00, width: 1.00, bridge: 1.00, hook: 0.10, tip: 0.00, flare: 1.00 },
  { id: 'aquiline', name: 'Орлиный',      len: 1.16, width: 0.94, bridge: 1.10, hook: 0.82, tip: 0.24, flare: 0.92 },
  { id: 'button',   name: 'Курносый',     len: 0.84, width: 1.06, bridge: 0.86, hook: 0.00, tip: -0.42, flare: 1.12 },
  { id: 'broad',    name: 'Широкий',      len: 1.02, width: 1.28, bridge: 1.16, hook: 0.06, tip: 0.04, flare: 1.30 },
  { id: 'thin',     name: 'Тонкий',       len: 1.08, width: 0.82, bridge: 0.78, hook: 0.16, tip: 0.06, flare: 0.80 },
  { id: 'broken',   name: 'С горбинкой',  len: 1.10, width: 1.02, bridge: 1.22, hook: 0.58, tip: 0.16, flare: 1.04 },
  { id: 'snub',     name: 'Вздёрнутый',   len: 0.90, width: 0.96, bridge: 0.92, hook: 0.00, tip: -0.30, flare: 0.96 },
  { id: 'heavy',    name: 'Тяжёлый',      len: 1.14, width: 1.18, bridge: 1.08, hook: 0.44, tip: 0.30, flare: 1.20 },
  { id: 'roman',    name: 'Римский',      len: 1.20, width: 1.06, bridge: 1.02, hook: 0.34, tip: 0.10, flare: 1.08 }
];

//   thick  — толщина брови
//   arch   — высота дуги (0 — прямая, 1 — крутая)
//   inner  — поднятость внутреннего края (гнев/удивление)
//   outer  — опущенность внешнего края
//   gap    — расстояние от переносицы

const BROW_SETS = [
  { id: 'natural', name: 'Естественные', thick: 1.00, arch: 0.40, inner: 0.00, outer: 0.00, gap: 1.00 },
  { id: 'thick',   name: 'Густые',       thick: 1.48, arch: 0.30, inner: 0.04, outer: -0.04, gap: 0.88 },
  { id: 'thin',    name: 'Тонкие',       thick: 0.62, arch: 0.56, inner: -0.02, outer: 0.06, gap: 1.06 },
  { id: 'straight',name: 'Прямые',       thick: 1.06, arch: 0.04, inner: 0.02, outer: -0.02, gap: 0.94 },
  { id: 'arched',  name: 'Дугой',        thick: 0.86, arch: 0.92, inner: -0.08, outer: 0.14, gap: 1.02 },
  { id: 'angry',   name: 'Сдвинутые',    thick: 1.24, arch: 0.18, inner: 0.30, outer: -0.16, gap: 0.80 },
  { id: 'worried', name: 'Домиком',      thick: 0.94, arch: 0.34, inner: -0.26, outer: 0.10, gap: 1.04 },
  { id: 'bushy',   name: 'Косматые',     thick: 1.72, arch: 0.24, inner: 0.06, outer: -0.08, gap: 0.84 },
  { id: 'unibrow', name: 'Сросшиеся',    thick: 1.30, arch: 0.10, inner: 0.10, outer: -0.06, gap: 0.30, unibrow: true }
];

const EYE_BY_ID = {};  EYE_SETS.forEach(s => { EYE_BY_ID[s.id] = s; });
const NOSE_BY_ID = {}; NOSE_SETS.forEach(s => { NOSE_BY_ID[s.id] = s; });
const BROW_BY_ID = {}; BROW_SETS.forEach(s => { BROW_BY_ID[s.id] = s; });

//   width  — ширина рта
//   full   — полнота губ (0 — тонкие нитки, 1 — тяжёлые)
//   corner — уголки (положительный — вниз, «жёсткий» рот)
//   tilt   — перекос (асимметрия ухмылки)
//   philtrum — глубина желобка над верхней губой

const MOUTH_SETS = [
  { id: 'neutral',  name: 'Обычный',        width: 1.00, full: 0.55, corner: 0.00, tilt: 0.00, philtrum: 1.00 },
  { id: 'thin',     name: 'Тонкие губы',    width: 1.04, full: 0.18, corner: -0.04, tilt: 0.00, philtrum: 0.92 },
  { id: 'full',     name: 'Полные губы',    width: 0.96, full: 1.00, corner: 0.02, tilt: 0.00, philtrum: 1.10 },
  { id: 'wide',     name: 'Широкий рот',    width: 1.22, full: 0.62, corner: -0.02, tilt: 0.00, philtrum: 1.02 },
  { id: 'small',    name: 'Маленький рот',  width: 0.78, full: 0.66, corner: 0.02, tilt: 0.00, philtrum: 0.94 },
  { id: 'grim',     name: 'Жёсткий',        width: 1.06, full: 0.34, corner: 0.16, tilt: 0.00, philtrum: 1.06 },
  { id: 'smirk',    name: 'Ухмылка',        width: 1.02, full: 0.50, corner: -0.10, tilt: 0.14, philtrum: 1.00 },
  { id: 'scarred',  name: 'Перекошенный',   width: 1.08, full: 0.44, corner: 0.06, tilt: -0.20, philtrum: 1.04 }
];

const MOUTH_BY_ID = {}; MOUTH_SETS.forEach(s => { MOUTH_BY_ID[s.id] = s; });

function eyeSetOf(glad) {
  return EYE_BY_ID[(glad && glad.eyeStyle) || 'calm'] || EYE_BY_ID.calm;
}
function noseSetOf(glad) {
  return NOSE_BY_ID[(glad && glad.noseStyle) || 'straight'] || NOSE_BY_ID.straight;
}
function browSetOf(glad) {
  return BROW_BY_ID[(glad && glad.browStyle) || 'natural'] || BROW_BY_ID.natural;
}
function mouthSetOf(glad) {
  return MOUTH_BY_ID[(glad && glad.mouthStyle) || 'neutral'] || MOUTH_BY_ID.neutral;
}

// Случайный «набор лица»: форма черепа + глаза + нос + брови + рот.
// Враги и наёмники получают его целиком, поэтому двое бойцов с одинаковым
// овалом лица всё равно выглядят как разные люди.
function randomFaceLook() {
  return {
    faceStyle: pick(FACE_STYLES).id,
    eyeStyle: pick(EYE_SETS).id,
    noseStyle: pick(NOSE_SETS).id,
    browStyle: pick(BROW_SETS).id,
    mouthStyle: pick(MOUTH_SETS).id
  };
}


// ==================== ИМЕНА ====================
const NAMES_M = ['Крикс', 'Спартак', 'Эномай', 'Ганник', 'Фламма', 'Спикулус', 'Коммод', 'Варрон', 'Тит', 'Кассий', 'Марк', 'Дракс', 'Ульф', 'Бьорн', 'Рагнар', 'Аттикус', 'Гай', 'Секст', 'Отон', 'Тиберий'];
const NAMES_F = ['Амазонка', 'Фероксия', 'Ахиллия', 'Мевия', 'Брита', 'Секстула', 'Диана', 'Фрея', 'Сигрун', 'Астрид', 'Кальпурния', 'Юния', 'Немезида', 'Валерия', 'Тарпея', 'Аврелия'];
const NAMES = NAMES_M.concat(NAMES_F);
// Прозвища разделены по роду: раньше женское имя получало мужское прозвище
// («Мевия Кровавый»), и наоборот. Теперь форма согласована с полом.
const NICKNAMES_M = ['Кровавый', 'Хмурый', 'Изгой', 'Однорукий', 'Молчаливый', 'Свирепый', 'Непобедимый', 'Железный', 'Быстрый', 'Грозный', 'Бешеный', 'Крепкий', 'Тихий', 'Гордый', 'Смелый', 'Проклятый', 'Стальной', 'Костолом', 'Ярый', 'Бессердечный'];
const NICKNAMES_F = ['Кровавая', 'Хмурая', 'Изгойка', 'Однорукая', 'Молчаливая', 'Свирепая', 'Непобедимая', 'Железная', 'Быстрая', 'Грозная', 'Бешеная', 'Крепкая', 'Тихая', 'Гордая', 'Смелая', 'Проклятая', 'Стальная', 'Костоломка', 'Ярая', 'Бессердечная'];
// Нейтральные прозвища-существительные — подходят обоим полам
const NICKNAMES_N = ['Ворон', 'Медведь', 'Волчица', 'Тень', 'Игла', 'Молот', 'Щитолом', 'Клинок', 'Гром', 'Лава', 'Вьюга', 'Оса', 'Шип', 'Пламя', 'Клык', 'Цепь', 'Пепел', 'Уголь', 'Стрела', 'Маска'];

// Прозвище по полу: 60% согласованное прилагательное, 40% нейтральное
function nicknameFor(gender) {
  const pool = gender === 'female' ? NICKNAMES_F : NICKNAMES_M;
  return Math.random() < 0.6 ? pick(pool) : pick(NICKNAMES_N);
}

// Полное имя: имя + согласованное прозвище
function randomName(gender) {
  const pool = gender === 'female' ? NAMES_F : NAMES_M;
  return pick(pool) + ' ' + nicknameFor(gender);
}

// У каждого происхождения свой id — по нему выдаются навыки каждые 3 уровня
const BACKGROUNDS = [
  { id: 'legionnaire', title: 'Бывший легионер',  hp: 75, atk: 62, def: 12, agi: 8,  cost: 240, hair: '#4a3018', beard: true,
    perk: 'Дисциплина: +1 ОД в бою', attrs: { str: 6, dex: 4, vit: 6, sta: 6, wil: 5 } },
  { id: 'debtor', title: 'Должник',          hp: 60, atk: 52, def: 5,  agi: 11, cost: 110, hair: '#8a6244', beard: false,
    perk: 'Отчаянный: дёшев, но хрупок', attrs: { str: 4, dex: 6, vit: 4, sta: 5, wil: 3 } },
  { id: 'northman', title: 'Северный наёмник', hp: 85, atk: 64, def: 8,  agi: 7,  cost: 290, hair: '#e0b45f', beard: true,
    perk: 'Закалка: +10 здоровья', attrs: { str: 7, dex: 3, vit: 7, sta: 5, wil: 4 } },
  { id: 'poacher', title: 'Браконьер',        hp: 62, atk: 58, def: 10, agi: 16, cost: 160, hair: '#3a2a1c', beard: false,
    perk: 'Ловкач: лучший уклон', attrs: { str: 3, dex: 8, vit: 4, sta: 5, wil: 4 } },
  { id: 'smith', title: 'Кузнец',           hp: 80, atk: 57, def: 6,  agi: 5,  cost: 200, hair: '#2a2118', beard: true,
    perk: 'Силач: тяжёлое оружие', attrs: { str: 8, dex: 3, vit: 6, sta: 6, wil: 4 } }
];

// ==================== АРЕНЫ ====================
const ARENAS = [
  { id: 'colosseum', name: 'Колизей', bg: 'colosseum',
    sky: ['#20304a', '#7a5a3e'], wall: ['#6a5238', '#3c2c1d'],
    ground: ['#c9a87c', '#6d4f30'], accent: '#e5b54f', crowd: '#c8a878',
    mood: 'Главная арена Рима. Песок, солнце и рёв пятидесяти тысяч.' },
  { id: 'street', name: 'Ночная улица', bg: 'street',
    sky: ['#121a28', '#2a3348'], wall: ['#3a3730', '#221f1a'],
    ground: ['#5a544a', '#2e2a24'], accent: '#f0b45a', crowd: '#4a4438',
    mood: 'Переулок за таверной. Факелы, грязь и никаких правил.' },
  { id: 'forest', name: 'Лесная арена', bg: 'forest',
    sky: ['#16281c', '#3d5233'], wall: ['#3c4a30', '#212a1b'],
    ground: ['#8a8a52', '#4a4a28'], accent: '#a8c46a', crowd: '#7a9a68',
    mood: 'Деревянные трибуны среди вековых дубов. Пахнет хвоей и смолой.' },
  { id: 'prison', name: 'Тюрьма Мамертина', bg: 'prison',
    sky: ['#17120f', '#2e2620'], wall: ['#4a443c', '#28231d'],
    ground: ['#6a6258', '#332e28'], accent: '#c98a4a', crowd: '#5a5248',
    mood: 'Подземелье под холмом. Здесь бьются те, кому нечего терять.' },
  { id: 'sewer', name: 'Большая Клоака', bg: 'sewer',
    sky: ['#12201c', '#22322c'], wall: ['#3c4438', '#1e2520'],
    ground: ['#4a5244', '#232a22'], accent: '#7fc9a0', crowd: '#3c4a3c',
    mood: 'Кирпичный тоннель и вода по колено. Воняет, но публика близко.' },
  { id: 'tavern', name: 'Таверна «Ржавый Гладиус»', bg: 'tavern',
    sky: ['#241a12', '#3a2a1c'], wall: ['#5a4128', '#33240f'],
    ground: ['#6a4f34', '#3a2a1a'], accent: '#f2c069', crowd: '#8a6a48',
    mood: 'Драка на столах. Кто упадёт — платит за разбитую посуду.' },
  { id: 'arena', name: 'Малая арена', bg: 'smallarena',
    sky: ['#2a3348', '#6a5a44'], wall: ['#8a6a44', '#4a3722'],
    ground: ['#c0a072', '#6a5030'], accent: '#d9a85a', crowd: '#a89070',
    mood: 'Деревянный амфитеатр на окраине. Честный песок без затей.' },
  { id: 'bath', name: 'Термы Каракаллы', bg: 'bath',
    sky: ['#2a2c3a', '#5a5a6a'], wall: ['#c8c4b8', '#7a766c'],
    ground: ['#d8d4c8', '#8a867c'], accent: '#9fd4e0', crowd: '#b8b4a8',
    mood: 'Мрамор, пар и вода. Бой в термах — любимая забава патрициев.' }
];

// Фоновые фотографии для боя. Одна из них выбирается случайно на каждый бой.
// Подпись и настроение подбираются под сам снимок, чтобы текст не спорил с картинкой.
const ARENA_BACKGROUNDS = [
  { file: 'camp.jpg',  name: 'Походный лагерь', mood: 'Палатки, костры и брошенные щиты. Дерутся прямо между кострищ.' },
  { file: 'kanal.jpg', name: 'Каналы',          mood: 'Сырой камень, вода и факелы. Эхо ударов уходит под своды.' },
  { file: 'arena.jpg', name: 'Арена',           mood: 'Классический песок и каменные стены. Здесь решается судьба.' },
  { file: 'term.png',  name: 'Термы',           mood: 'Пар, мрамор и вода по колено. Бой в термах — забава патрициев.' }
];

function rollArenaBackground() {
  return ARENA_BACKGROUNDS[Math.floor(Math.random() * ARENA_BACKGROUNDS.length)];
}

// ==================== СЛОЖНОСТЬ ====================
// Арену выбрать нельзя — она выпадает случайно. Игрок выбирает только сложность.
const ARENA_TIERS = [
  { id: 'low', label: 'Низкая сложность', short: 'Низкая', icon: '🟢', color: '#5aa870',
    desc: 'Разминка. Противники зелёные, и награда скромная.',
    power: 0.72, goldMul: 0.85, xpMul: 0.9, fameMul: 0.8 },
  { id: 'mid', label: 'Средняя сложность', short: 'Средняя', icon: '🟡', color: '#e5b54f',
    desc: 'Честный бой. Противники держат строй и стреляют.',
    power: 1.0, goldMul: 1.15, xpMul: 1.1, fameMul: 1.1 },
  { id: 'brutal', label: 'Невыносимая сложность', short: 'Невыносимая', icon: '🔴', color: '#c0392b',
    desc: 'Здесь умирают даже чемпионы. И награда соответствующая.',
    power: 1.42, goldMul: 1.6, xpMul: 1.6, fameMul: 1.8 }
];

// ==================== ПРОТИВНИКИ ====================
// Набор отрядов противника по сложности. Арена выбирается случайно,
// поэтому состав зависит только от ступени сложности.
const OPPONENT_POOL = {
  low: [
    { name: 'Новобранцы легиона',      units: 'grunts' },
    { name: 'Уличные головорезы',      units: 'grunts' },
    { name: 'Должники в кандалах',     units: 'grunts' },
    { name: 'Пьяные завсегдатаи',      units: 'grunts' },
    { name: 'Лесные браконьеры',       units: 'grunts' }
  ],
  mid: [
    { name: 'Сектор мурмиллонов',      units: 'murmillo' },
    { name: 'Банда Мясника',           units: 'bruisers' },
    { name: 'Стража коллекторов',      units: 'ranged' },
    { name: 'Гвардия арены',           units: 'murmillo' },
    { name: 'Отряд надзирателей',      units: 'bruisers' }
  ],
  brutal: [
    { name: 'Элита песка',             units: 'murmillo' },
    { name: 'Костоломы Клоаки',        units: 'bruisers' },
    { name: 'Стрелки терм',            units: 'ranged' },
    { name: 'Хищники арены',           units: 'murmillo' }
  ]
};


// Три бойца в каждой группе — арена рассчитана на отряд из трёх.
const ENEMY_TEMPLATES = {
  grunts: [
    { name: 'Грызло',    role: 'melee',  hp: 44, atk: 42, def: 3,  agi: 6,  wId: 'w_club',        lId: 'l_sandals' },
    { name: 'Косой Тим', role: 'melee',  hp: 42, atk: 44, def: 2,  agi: 9,  wId: 'w_rusty',       lId: 'l_sandals' },
    { name: 'Бор',       role: 'shield', hp: 56, atk: 40, def: 8,  agi: 5,  wId: 'w_club', oId: 'o_buckler', bId: 'b_tunic', lId: 'l_sandals' }
  ],
  bruisers: [
    { name: 'Кувалда',   role: 'melee',  hp: 66, atk: 54, def: 8,  agi: 6,  wId: 'w_handaxe',  bId: 'b_leather', lId: 'l_sandals' },
    { name: 'Рвань',     role: 'melee',  hp: 62, atk: 56, def: 6,  agi: 9,  wId: 'w_hatchet',  bId: 'b_leather', lId: 'l_wraps_legs' },
    { name: 'Стена',     role: 'shield', hp: 78, atk: 46, def: 14, agi: 4,  wId: 'w_rusty', oId: 'o_round', bId: 'b_leather', hId: 'h_cap', lId: 'l_sandals' }
  ],
  murmillo: [
    { name: 'Мурмиллон Гай', role: 'shield', hp: 90, atk: 60, def: 16, agi: 6, wId: 'w_gladius', oId: 'o_scutum', hId: 'h_murmillo', bId: 'b_leather', aId: 'a_manica', lId: 'l_greaves' },
    { name: 'Секутор Друз',  role: 'melee',  hp: 82, atk: 64, def: 12, agi: 9, wId: 'w_gladius', hId: 'h_nasal', bId: 'b_leather', aId: 'a_manica', lId: 'l_greaves' },
    { name: 'Гопломах Нерва',role: 'melee',  hp: 76, atk: 60, def: 10, agi: 8, wId: 'w_spear', hId: 'h_nasal', bId: 'b_gambeson', lId: 'l_sandals' }
  ],
  ranged: [
    { name: 'Серый Лис', role: 'ranged', hp: 58, atk: 56, def: 6,  agi: 14, wId: 'w_shortbow', hId: 'h_hood', bId: 'b_tunic', lId: 'l_sandals' },
    { name: 'Болт',      role: 'ranged', hp: 64, atk: 60, def: 8,  agi: 12, wId: 'w_light_xbow', hId: 'h_nasal', bId: 'b_leather', lId: 'l_sandals' },
    { name: 'Прикрытие', role: 'shield', hp: 86, atk: 52, def: 16, agi: 4,  wId: 'w_warhammer', oId: 'o_scutum', hId: 'h_murmillo', bId: 'b_mail', lId: 'l_greaves' }
  ]
};

// ==================== БОССЫ АРЕНЫ ====================
// Босс выходит один — без свиты. Сложность босс-боя фиксирована.
// Порог побед: 5 → 20 → 40 → 65 → 100. Каждый босс сильнее предыдущего,
// у каждого свой облик, своё оружие и броня, свои уникальные способности.
const BOSS_LADDER = [
  {
    id: 'boss_ash',
    name: 'Ганник Пепельный',
    title: 'Первый страж песка',
    winAt: 5,
    tier: 2,
    look: { build: 'muscular', skin: '#cf9468', hair: '#2a2118', hairStyle: 'shaved', faceStyle: 'weathered', beard: 'stubble', gender: 'male' },
    aura: '#b8b0a4',
    hp: 300, atk: 74, def: 18, agi: 7,
    equip: { wId: 'bw_ashfang', bId: 'ba_ashplate', hId: 'h_murmillo', aId: 'a_manica', lId: 'l_greaves' },
    loot: ['bw_ashfang', 'ba_ashplate'],
    abilities: [
      { id: 'ash_charge', name: 'Пепельный рывок', desc: 'Рывок через две клетки и удар по корпусу.', cd: 3 }
    ],
    intro: 'Из пепла старой арены поднимается тот, кто никогда не сдавался.'
  },
  {
    id: 'boss_mortus',
    name: 'Мортус Жрец',
    title: 'Голос мёртвых',
    winAt: 20,
    tier: 3,
    look: { build: 'slim', skin: '#b8bcc0', hair: '#e4e2dc', hairStyle: 'bald', faceStyle: 'gaunt', beard: 'long', gender: 'male' },
    aura: '#8a9aa6',
    hp: 380, atk: 84, def: 22, agi: 8,
    equip: { wId: 'bw_gravebell', bId: 'ba_shroud', hId: 'h_hood', aId: 'a_chain_sleeves', lId: 'l_chain_leggings' },
    loot: ['bw_gravebell', 'ba_shroud'],
    abilities: [
      { id: 'soul_drain', name: 'Похищение души', desc: 'Высасывает жизнь: урон по всем врагам и лечит себя.', cd: 4 },
      { id: 'curse', name: 'Проклятие тлена', desc: 'Проклинает цель: +25% входящего урона на 2 раунда.', cd: 5 }
    ],
    intro: 'Он говорит с теми, кто уже проиграл. И они отвечают.'
  },
  {
    id: 'boss_ignis',
    name: 'Игнис Пламенный',
    title: 'Жрец пара и огня',
    winAt: 40,
    tier: 4,
    look: { build: 'normal', skin: '#a9744c', hair: '#a84a3a', hairStyle: 'mohawk', beard: 'goatee', gender: 'male' },
    aura: '#e08a4a',
    hp: 470, atk: 96, def: 26, agi: 11,
    equip: { wId: 'bw_ember', bId: 'ba_ember', hId: 'h_horned', aId: 'a_plate_arms', lId: 'l_plate_legs' },
    loot: ['bw_ember', 'ba_ember'],
    abilities: [
      { id: 'fireball', name: 'Огненный шар', desc: 'Магия: дальний удар по случайной конечности.', cd: 3, magic: true },
      { id: 'flame_wave', name: 'Волна пламени', desc: 'Магия: обжигает всех врагов в 2 клетках.', cd: 4, magic: true },
      { id: 'ignite', name: 'Поджог', desc: 'Поджигает цель: 3 раунда горения.', cd: 5, magic: true }
    ],
    intro: 'Воздух вокруг него дрожит от жара. Броня плавится на глазах.'
  },
  {
    id: 'boss_skadi',
    name: 'Скади Белая',
    title: 'Королева вечной зимы',
    winAt: 65,
    tier: 5,
    look: { build: 'slim', skin: '#f5c9a4', hair: '#e4e2dc', hairStyle: 'braids', faceStyle: 'pointed', beard: 'none', gender: 'female' },
    aura: '#cfe6f2',
    hp: 560, atk: 108, def: 30, agi: 15,
    equip: { wId: 'bw_frost', bId: 'ba_frost', hId: 'h_horned', aId: 'a_plate_arms', lId: 'l_imperial_greaves' },
    loot: ['bw_frost', 'ba_frost'],
    abilities: [
      { id: 'frost_nova', name: 'Морозная нова', desc: 'Магия: замораживает всех врагов, крадёт ОД.', cd: 4, magic: true },
      { id: 'ice_lance', name: 'Ледяное копьё', desc: 'Магия: пробивает броню, бьёт в корпус.', cd: 3, magic: true },
      { id: 'winter_veil', name: 'Покров зимы', desc: 'Щит изо льда: поглощает урон и лечит.', cd: 6, magic: true }
    ],
    intro: 'С каждым её шагом песок покрывается инеем. Дышать становится больно.'
  },
  {
    id: 'boss_legend',
    name: 'Легенда Колизея',
    title: 'Непобеждённый',
    winAt: 100,
    tier: 5,
    look: { build: 'muscular', skin: '#e8ab7e', hair: '#c9a45c', hairStyle: 'short', faceStyle: 'square', beard: 'full', gender: 'male' },
    aura: '#ffd76a',
    hp: 700, atk: 124, def: 36, agi: 18,
    equip: { wId: 'bw_legend', bId: 'ba_legend', hId: 'h_crown', aId: 'a_gold_arms', lId: 'l_imperial_greaves' },
    loot: ['bw_legend', 'ba_legend'],
    abilities: [
      { id: 'legend_strike', name: 'Удар легенды', desc: 'Сокрушительный удар по самой слабой конечности.', cd: 3 },
      { id: 'crowd_favor', name: 'Милость толпы', desc: 'Толпа ревёт: лечится и получает ОД.', cd: 5 },
      { id: 'execute', name: 'Казнь', desc: 'Если цель ниже 30% HP — добивает.', cd: 6 },
      { id: 'sandstorm', name: 'Песчаная буря', desc: 'Магия песка: бьёт всех и снижает точность.', cd: 5, magic: true }
    ],
    intro: 'Сто побед. Ни одного поражения. Сегодня один из вас уйдёт с песка.'
  }
];

function bossForWinCount(wins) {
  return BOSS_LADDER.find(b => b.winAt === wins) || null;
}

function nextBossAfter(wins) {
  return BOSS_LADDER.find(b => b.winAt > wins) || null;
}

// ==================== МАГИЯ ГЕРОЕВ ====================
// У героя может открыться дар. Школа даёт три заклинания;
// заклинания тратят ОД и имеют перезарядку в раундах.
const MAGIC_SCHOOLS = {
  flame: {
    id: 'flame', name: 'Пламя', icon: '🔥', color: '#ff7a3a',
    desc: 'Огонь жжёт и не спрашивает разрешения.',
    spells: [
      { id: 'ember_bolt', name: 'Уголёк', desc: 'Обжигает цель на 3 клетки.', cd: 2, ap: 2, dmg: 0.8, range: 3 },
      { id: 'cinder_ring', name: 'Круг углей', desc: 'Поджигает всех врагов рядом.', cd: 4, ap: 3, dmg: 0.55, aoe: 2 },
      { id: 'inferno', name: 'Инферно', desc: 'Столб огня по самой слабой цели.', cd: 5, ap: 4, dmg: 1.4, range: 6 }
    ]
  },
  frost: {
    id: 'frost', name: 'Стужа', icon: '❄️', color: '#a8d8f0',
    desc: 'Холод замедляет, ломает и убивает.',
    spells: [
      { id: 'ice_shard', name: 'Ледяная игла', desc: 'Пробивает броню на 4 клетки.', cd: 2, ap: 2, dmg: 0.75, range: 4, pen: 0.3 },
      { id: 'chill', name: 'Окоченение', desc: 'Крадёт 2 ОД у цели.', cd: 4, ap: 2, dmg: 0.3, range: 3, drainAp: 2 },
      { id: 'glacier', name: 'Глетчер', desc: 'Ледяной щит себе и урон всем рядом.', cd: 5, ap: 3, dmg: 0.6, aoe: 2, shield: 0.2 }
    ]
  },
  blood: {
    id: 'blood', name: 'Кровь', icon: '🩸', color: '#c0392b',
    desc: 'Кровь — топливо. Своя или чужая.',
    spells: [
      { id: 'bloodlet', name: 'Кровопускание', desc: 'Урон и лечение себя на половину.', cd: 3, ap: 2, dmg: 0.7, range: 2, lifesteal: 0.5 },
      { id: 'warcry', name: 'Кровавый рёв', desc: 'Лечит отряд и даёт ОД.', cd: 5, ap: 2, heal: 0.18, team: true },
      { id: 'sacrifice', name: 'Жертва', desc: 'Тратит своё HP ради огромного урона.', cd: 5, ap: 3, dmg: 1.9, range: 2, selfCost: 0.12 }
    ]
  },
  sand: {
    id: 'sand', name: 'Песок', icon: '🏜️', color: '#d8c3a0',
    desc: 'Арена сама помогает тому, кто её слышит.',
    spells: [
      { id: 'sand_blast', name: 'Песчаный вихрь', desc: 'Урон и −точность цели.', cd: 3, ap: 2, dmg: 0.65, range: 4, blind: 6 },
      { id: 'mirage', name: 'Мираж', desc: 'Уклонение всему отряду на раунд.', cd: 5, ap: 2, team: true, dodge: 18 },
      { id: 'quicksand', name: 'Зыбучий песок', desc: 'Обездвиживает цель и бьёт.', cd: 4, ap: 3, dmg: 0.8, range: 5, root: 1 }
    ]
  }
};

const MAGIC_LIST = Object.keys(MAGIC_SCHOOLS).map(k => MAGIC_SCHOOLS[k]);

// Шанс, что у наёмника откроется дар
const MAGIC_CHANCE = 0.3;

// ==================== СЛУЧАЙНЫЕ СОБЫТИЯ ====================
// Событие срабатывает после боя с некоторым шансом.
// type: 'good' | 'bad' | 'choice'
const EVENTS = [
  {
    id: 'patron',
    type: 'good', icon: '🏛️', weight: 10,
    title: 'Патриций в ложе',
    text: 'Богатый патриций заметил, как ты дерёшься. Он присылает кошель и записку: «Риму нужны такие».',
    effects: [{ gold: 140 }]
  },
  {
    id: 'sponsor',
    type: 'good', icon: '💰', weight: 8,
    title: 'Спонсор из сената',
    text: 'Сенатор вкладывает в твою школу. «Побеждай — и я удвою ставку».',
    effects: [{ gold: 220, fame: 3 }]
  },
  {
    id: 'crowd_fav',
    type: 'good', icon: '🎉', weight: 9,
    title: 'Толпа запомнила имя',
    text: 'Пятьдесят тысяч глоток выкрикивают твоё имя. Это стоит дороже золота.',
    effects: [{ fame: 8 }]
  },
  {
    id: 'healer_gift',
    type: 'good', icon: '🌿', weight: 8,
    title: 'Старый лекарь',
    text: 'Лекарь из Субуры бесплатно перевязывает твоих бойцов: «За то, что ты не забыл мать».',
    effects: [{ healAll: 0.45 }]
  },
  {
    id: 'dog_found',
    type: 'good', icon: '🐕', weight: 6,
    title: 'Бродячий пёс',
    text: 'Облезлый пёс идёт за тобой от самой арены. Похоже, он выбрал хозяина.',
    effects: [{ freeDog: true }]
  },
  {
    id: 'blacksmith',
    type: 'good', icon: '⚒️', weight: 7,
    title: 'Кузнец-должник',
    text: 'Кузнец задолжал тебе и расплачивается клинком из своей лучшей стали.',
    effects: [{ freeItem: true }]
  },
  {
    id: 'training_insight',
    type: 'good', icon: '🧠', weight: 7,
    title: 'Озарение',
    text: 'Ночью тебя посещает мысль о том, как держать щит. Ты просыпаешься другим бойцом.',
    effects: [{ xpAll: 60 }]
  },

  {
    id: 'robbery',
    type: 'bad', icon: '🗡️', weight: 9,
    title: 'Ночные грабители',
    text: 'В переулке тебя ждали трое. Кошель они забрали, синяки оставили.',
    effects: [{ goldPct: -0.18 }]
  },
  {
    id: 'injury',
    type: 'bad', icon: '🩹', weight: 9,
    title: 'Тренировка до крови',
    text: 'На разминке один из бойцов неудачно падает. Кость цела, но рука не слушается.',
    effects: [{ limbDamage: 0.4 }]
  },
  {
    id: 'fever',
    type: 'bad', icon: '🤒', weight: 7,
    title: 'Лихорадка',
    text: 'В казарме пахнет болезнью. Половина отряда горит и кашляет.',
    effects: [{ hpPct: -0.25 }]
  },
  {
    id: 'racket',
    type: 'bad', icon: '🕵️', weight: 6,
    title: 'Рэкет',
    text: 'Люди хозяина квартала напоминают: за крышу надо платить.',
    effects: [{ goldPct: -0.12 }]
  },
  {
    id: 'bad_rumor',
    type: 'bad', icon: '📜', weight: 6,
    title: 'Грязные слухи',
    text: 'Кто-то пустил слух, что ты покупаешь победы. Толпа свистит.',
    effects: [{ fame: -6 }]
  },
  {
    id: 'betrayal',
    type: 'bad', icon: '🚪', weight: 4,
    title: 'Ночь без сна',
    text: 'Бойцы всю ночь спорили о доле. Утром один вышел мрачнее тучи и еле держится на ногах — но из лудуса не ушёл.',
    effects: [{ loseWeakest: true }]
  },

  {
    id: 'mercenary',
    type: 'choice', icon: '🤝', weight: 7,
    title: 'Наёмник у ворот',
    text: 'У ворот ждёт старый знакомый. Он просит 120 золота взаймы — обещает вернуть вдвое.',
    choices: [
      { label: 'Дать 120з', cost: 120, effects: [{ gold: 260, fame: 2 }], result: 'Через три дня он возвращается с деньгами и уважением в глазах.' },
      { label: 'Отказать', effects: [], result: 'Он уходит молча. Ты не знаешь, было ли это правильным.' }
    ]
  },
  {
    id: 'healer_offer',
    type: 'choice', icon: '💊', weight: 6,
    title: 'Предложение лекаря',
    text: 'Лекарь предлагает редкую мазь: 90 золота и раны затянутся быстрее.',
    choices: [
      { label: 'Купить 90з', cost: 90, effects: [{ healAll: 0.6 }], result: 'Мазь воняет дёгтем, но раны действительно затягиваются.' },
      { label: 'Обойтись', effects: [], result: 'Ты экономишь. Раны заживут сами — или не заживут.' }
    ]
  },
  {
    id: 'gladiator_duel',
    type: 'choice', icon: '⚔️', weight: 6,
    title: 'Вызов на дуэль',
    text: 'Чемпион соседней школы вызывает тебя на показательный бой. Толпа уже ставит деньги.',
    choices: [
      { label: 'Принять', effects: [{ gold: 180, fame: 6, hpPct: -0.18 }], result: 'Ты побеждаешь, но уходишь с песка хромая.' },
      { label: 'Отказаться', effects: [{ fame: -4 }], result: 'Толпа недовольна. Отказ помнят дольше, чем проигрыш.' }
    ]
  },
  {
    id: 'magic_awakening',
    type: 'choice', icon: '✨', weight: 5,
    title: 'Сон о пламени',
    text: 'Тебе снится, что песок под ногами становится углями. Проснувшись, ты чувствуешь жар в ладонях.',
    choices: [
      { label: 'Принять дар', effects: [{ awakenMagic: true }], result: 'Дар просыпается. Теперь у одного из бойцов есть магия.' },
      { label: 'Отмахнуться', effects: [{ xpAll: 30 }], result: 'Ты списываешь всё на усталость. Зато выспался.' }
    ]
  }
];



// Координаты зданий на фоне города (x, y от 0 до 1, size — масштаб кнопки)
// Расположение по скриншоту: таверна слева, храм на холме вверху,
// рынок по центру, колизей справа вверху, псарня и казарма справа по центру,
// тренировочная площадка ниже казармы.
const CITY_LOCATIONS = [
  { id: 'tavern', icon: '🍺', name: 'Таверна', sub: 'Taberna',
    desc: 'Найм гладиаторов',
    x: 0.125, y: 0.700, size: 0.85, accent: '#c98a4a' },
  { id: 'temple', icon: '🏛️', name: 'Храм Медикуса', sub: 'Aesculapium',
    desc: 'Раны и конечности',
    x: 0.285, y: 0.365, size: 0.95, accent: '#c8c4b8' },
  { id: 'chests', icon: '📦', name: 'Торговец сундуками', sub: 'Cistae',
    desc: 'Случайный лут за золото',
    x: 0.455, y: 0.625, size: 0.80, accent: '#a8895e' },
  { id: 'market', icon: '⚒️', name: 'Кузница', sub: 'Ferraria',
    desc: 'Оружие и броня',
    x: 0.262, y: 0.500, size: 0.75, accent: '#b08a4a' },
  { id: 'arena', icon: '⚔️', name: 'Колизей', sub: 'Amphitheatrum',
    desc: 'Слава или смерть',
    x: 0.690, y: 0.455, size: 0.90, accent: '#e5b54f' },
  { id: 'barracks', icon: '🛡️', name: 'Казарма', sub: 'Ludus',
    desc: 'Отряд, снаряжение, роли',
    x: 0.845, y: 0.560, size: 0.82, accent: '#c9a45c' },
  { id: 'kennel', icon: '🐕', name: 'Псарня', sub: 'Canile',
    desc: 'Боевые псы',
    x: 0.945, y: 0.545, size: 0.78, accent: '#a8895e' },
  { id: 'training', icon: '🎯', name: 'Двор тренировок', sub: 'Palaestra',
    desc: 'Опыт без риска',
    x: 0.885, y: 0.815, size: 0.72, accent: '#a8c46a' },
  // Море в правой части панорамы: рыбацкая лодка у причала
  { id: 'fishing', icon: '🎣', name: 'Промысел', sub: 'Piscatio',
    desc: 'Рыбалка и охота: скромный заработок',
    x: 0.472, y: 0.258, size: 0.70, accent: '#5f9ec4' }
];

// ==================== КОСМЕТИКА ЗА СЛАВУ ====================
// Слава больше не покупает снаряжение — она покупает облик. Косметика
// не даёт ни урона, ни защиты: только то, что видит толпа.
const COSMETICS = [
  { id: 'build_slim',    group: 'Телосложение', name: 'Сухой',        fame: 8,  kind: 'build', value: 'slim' },
  { id: 'build_normal',  group: 'Телосложение', name: 'Обычный',      fame: 0,  kind: 'build', value: 'normal' },
  { id: 'build_muscular',group: 'Телосложение', name: 'Мышцы',        fame: 20, kind: 'build', value: 'muscular' },
  { id: 'build_heavy',   group: 'Телосложение', name: 'Гора',         fame: 32, kind: 'build', value: 'heavy' },

  { id: 'hair_short',    group: 'Причёска', name: 'Короткая',         fame: 0,  kind: 'hair', value: 'short' },
  { id: 'hair_long',     group: 'Причёска', name: 'Длинная',          fame: 10, kind: 'hair', value: 'long' },
  { id: 'hair_ponytail', group: 'Причёска', name: 'Хвост',            fame: 14, kind: 'hair', value: 'ponytail' },
  { id: 'hair_mohawk',   group: 'Причёска', name: 'Ирокез',           fame: 26, kind: 'hair', value: 'mohawk' },
  { id: 'hair_bald',     group: 'Причёска', name: 'Бритая голова',    fame: 6,  kind: 'hair', value: 'bald' },
  // Новые причёски за славу
  { id: 'hair_crew',     group: 'Причёска', name: 'Ёжик',             fame: 4,  kind: 'hair', value: 'crew' },
  { id: 'hair_slick',    group: 'Причёска', name: 'Зачёс назад',      fame: 18, kind: 'hair', value: 'slick' },
  { id: 'hair_parted',   group: 'Причёска', name: 'Пробор',           fame: 12, kind: 'hair', value: 'parted' },
  { id: 'hair_fringe',   group: 'Причёска', name: 'Чёлка',            fame: 8,  kind: 'hair', value: 'fringe' },
  { id: 'hair_spiky',    group: 'Причёска', name: 'Рваные пряди',     fame: 22, kind: 'hair', value: 'spiky' },
  { id: 'hair_halfup',   group: 'Причёска', name: 'Полухвост',        fame: 16, kind: 'hair', value: 'halfup' },
  { id: 'hair_twinbraids', group: 'Причёска', name: 'Две косы',       fame: 20, kind: 'hair', value: 'twinbraids' },
  { id: 'hair_afro',     group: 'Причёска', name: 'Афро',             fame: 28, kind: 'hair', value: 'afro' },
  { id: 'hair_wavy',     group: 'Причёска', name: 'Волны',            fame: 15, kind: 'hair', value: 'wavy' },
  { id: 'hair_undercut', group: 'Причёска', name: 'Выбритый висок',   fame: 30, kind: 'hair', value: 'undercut' },

  { id: 'beard_none',    group: 'Борода',   name: 'Нет',              fame: 0,  kind: 'beard', value: 'none' },
  { id: 'beard_stubble', group: 'Борода',   name: 'Щетина',           fame: 0,  kind: 'beard', value: 'stubble' },
  { id: 'beard_full',    group: 'Борода',   name: 'Густая',           fame: 6,  kind: 'beard', value: 'full' },
  { id: 'beard_long',    group: 'Борода',   name: 'Длинная',          fame: 12, kind: 'beard', value: 'long' },
  { id: 'beard_goatee',  group: 'Борода',   name: 'Козлиная',         fame: 4,  kind: 'beard', value: 'goatee' },
  { id: 'beard_moustache', group: 'Борода', name: 'Усы',              fame: 4,  kind: 'beard', value: 'moustache' },
  // Новые бороды за славу
  { id: 'beard_shortbox', group: 'Борода',  name: 'Окладистая',       fame: 8,  kind: 'beard', value: 'shortbox' },
  { id: 'beard_verdi',   group: 'Борода',   name: 'Верди',            fame: 16, kind: 'beard', value: 'verdi' },
  { id: 'beard_chinstrap', group: 'Борода', name: 'По контуру',       fame: 10, kind: 'beard', value: 'chinstrap' },
  { id: 'beard_imperial', group: 'Борода',  name: 'Имперская',        fame: 18, kind: 'beard', value: 'imperial' },
  { id: 'beard_horseshoe', group: 'Борода', name: 'Подкова',          fame: 12, kind: 'beard', value: 'horseshoe' },
  { id: 'beard_vandyke', group: 'Борода',   name: 'Ван Дейк',         fame: 20, kind: 'beard', value: 'vandyke' },
  { id: 'beard_garibaldi', group: 'Борода', name: 'Гарибальди',       fame: 14, kind: 'beard', value: 'garibaldi' },
  { id: 'beard_anchor',  group: 'Борода',   name: 'Якорь',            fame: 10, kind: 'beard', value: 'anchor' },
  { id: 'beard_ducktail', group: 'Борода',  name: 'Утиный хвост',     fame: 22, kind: 'beard', value: 'ducktail' },
  { id: 'beard_sidewhiskers', group: 'Борода', name: 'Бакенбарды',    fame: 24, kind: 'beard', value: 'sidewhiskers' },

  { id: 'tattoo_none',   group: 'Татуировки', name: 'Без татуировок', fame: 0,  kind: 'tattoo', value: 'none' },
  { id: 'tattoo_bands',  group: 'Татуировки', name: 'Кольца на руках',fame: 12, kind: 'tattoo', value: 'bands' },
  { id: 'tattoo_snake',  group: 'Татуировки', name: 'Змей на плече',  fame: 24, kind: 'tattoo', value: 'snake' },
  { id: 'tattoo_wings',  group: 'Татуировки', name: 'Крылья на спине',fame: 40, kind: 'tattoo', value: 'wings' },
  { id: 'tattoo_runes',  group: 'Татуировки', name: 'Руны',           fame: 34, kind: 'tattoo', value: 'runes' },

  { id: 'paint_none',    group: 'Раскраска', name: 'Без раскраски',   fame: 0,  kind: 'paint', value: 'none' },
  { id: 'paint_war',     group: 'Раскраска', name: 'Боевая',          fame: 18, kind: 'paint', value: 'war' },
  { id: 'paint_ash',     group: 'Раскраска', name: 'Пепел',           fame: 22, kind: 'paint', value: 'ash' },
  { id: 'paint_gold',    group: 'Раскраска', name: 'Золото',          fame: 48, kind: 'paint', value: 'gold' }
];

const COSMETIC_BY_ID = {};
COSMETICS.forEach(c => { COSMETIC_BY_ID[c.id] = c; });

// Что уже куплено: храним на самом бойце в glad.cosmetic.
// По умолчанию облик бесплатный и уже «принадлежит» бойцу.
function cosmeticOwned(glad, c) {
  if (!glad || !c) return false;
  const own = glad.cosmeticOwned || [];
  if (!c.fame) return true;      // базовые варианты бесплатны
  return own.indexOf(c.id) >= 0;
}

function gladCosmetic(glad, kind, fallback) {
  const c = glad && glad.cosmetic ? glad.cosmetic : null;
  return (c && c[kind]) || fallback;
}

// ==================== ПРОМЫСЛЫ ====================
// Рыбалка и охота — способ дотянуть до следующего боя, а не заменить арену.
// Награда за один промысел — примерно половина золота среднего боя
// (средний бой даёт около 72 золота), поэтому экономику это не ломает.
const WORK_TYPES = {
  fishing: {
    id: 'fishing', name: 'Морская рыбалка', sub: 'Piscatio', icon: '🎣',
    accent: '#5f9ec4',
    desc: 'Поплавок уходит под воду — подсекайте, когда метка в зоне.',
    gold: 36, xp: 10,
    need: 3,               // сколько удачных подсечек до улова
    hint: 'Пробел или клик — подсечка'
  },
  hunting: {
    id: 'hunting', name: 'Лесная охота', sub: 'Venatio', icon: '🏹',
    accent: '#8aa85c',
    desc: 'Зверь бежит по чаще — стреляйте, когда он в перекрестии.',
    gold: 34, xp: 14,
    need: 3,
    hint: 'Пробел или клик — выстрел'
  }
};

const ROLE_LABELS = { melee: 'Ближний бой', ranged: 'Дальний бой', shield: 'Защитник', beast: 'Зверь', mage: 'Маг' };
const ROLE_ICONS = { melee: '🗡️', ranged: '🏹', shield: '🛡️', beast: '🐕', mage: '✨' };

// Роли — не просто подпись, а стиль игры. Каждая даёт бонусы и штрафы,
// так что выбор снаряжения реально меняет бой.
const ROLE_DEFS = {
  melee: {
    id: 'melee', name: 'Ближний бой', icon: '🗡️', color: '#c98a4a',
    desc: 'Чистый урон вплотную. Ничего лишнего.',
    bonus: '+12% урона вплотную', hint: 'Топоры, мечи, парное оружие'
  },
  shield: {
    id: 'shield', name: 'Защитник', icon: '🛡️', color: '#7f9ad1',
    desc: 'Держит удар и прикрывает остальных.',
    bonus: '+15% блока, −8% урона', hint: 'Щит и одноручное оружие'
  },
  ranged: {
    id: 'ranged', name: 'Дальний бой', icon: '🏹', color: '#7fb08a',
    desc: 'Бьёт издалека, но плохо держит удар.',
    bonus: 'Стреляет на 7 клеток, −10% HP', hint: 'Луки'
  },
  mage: {
    id: 'mage', name: 'Маг', icon: '✨', color: '#b98fdc',
    desc: 'Дар арены. Заклинания вместо размаха.',
    bonus: 'Заклинания, +1 ОД', hint: 'Любое оружие + дар'
  },
  beast: {
    id: 'beast', name: 'Зверь', icon: '🐕', color: '#a8895e',
    desc: 'Не боец, но кусает злее многих.',
    bonus: 'Быстрый, дёшев, без снаряжения', hint: 'Только псарня'
  }
};


// ==================== БОЕВЫЕ ПСЫ ====================
// Псы — отдельный вид бойца. Им нельзя купить снаряжение: они выходят
// на песок такими, какими их привели. Зато дёшевы и кусают больно.
const DOG_BREEDS = [
  {
    id: 'molossian', name: 'Молосская морда', icon: '🐕‍🦺',
    hp: 46, atk: 46, def: 4, agi: 9, cost: 90,
    body: '#6b4a2e', belly: '#a98a63', snout: '#4a3320',
    build: 'heavy', perk: 'Хватка: урон по корпусу +15%'
  },
  {
    id: 'molossian2', name: 'Эпирский волкодав', icon: '🐕',
    hp: 52, atk: 44, def: 6, agi: 7, cost: 110,
    body: '#7a6a58', belly: '#c2b49c', snout: '#4a3a2c',
    build: 'heavy', perk: 'Толстая шкура: −10% входящего урона'
  },
  {
    id: 'pug', name: 'Боевой мопс', icon: '🐶',
    hp: 34, atk: 40, def: 2, agi: 14, cost: 60,
    body: '#c9a678', belly: '#e8d4b0', snout: '#3a2a1c',
    build: 'slim', perk: 'Юркий: +12 к уклонению'
  },
  {
    id: 'shepherd', name: 'Пастуший пёс', icon: '🐕‍🦺',
    hp: 42, atk: 48, def: 3, agi: 12, cost: 95,
    body: '#3a2f26', belly: '#8a7358', snout: '#241c15',
    build: 'normal', perk: 'Погоня: +1 клетка рывка'
  },
  {
    id: 'wolfhound', name: 'Ирландский волкодав', icon: '🐺',
    hp: 58, atk: 52, def: 5, agi: 10, cost: 150,
    body: '#8a7358', belly: '#c9b896', snout: '#5a4632',
    build: 'slim', perk: 'Длинные лапы: бьёт на 2 клетки'
  },
  {
    id: 'blackdog', name: 'Чёрный пёс Тартара', icon: '🐕‍🦺',
    hp: 44, atk: 56, def: 3, agi: 13, cost: 170,
    body: '#26201c', belly: '#4a3f36', snout: '#14100d',
    build: 'normal', perk: 'Злоба: +10% урона при HP ниже 50%'
  },
  {
    id: 'warhound', name: 'Римский боевой пёс', icon: '🐕',
    hp: 50, atk: 54, def: 7, agi: 8, cost: 190,
    body: '#8a5a34', belly: '#d8b48a', snout: '#3a2416',
    build: 'muscular', perk: 'Броня на груди: +6 защиты'
  }
];

const DOG_NAMES = ['Цербер', 'Брут', 'Клык', 'Тень', 'Уголёк', 'Рык', 'Молния', 'Кусь', 'Серый', 'Пепел', 'Гром', 'Вихрь'];

function makeDog(breed, name) {
  const b = breed || DOG_BREEDS[Math.floor(Math.random() * DOG_BREEDS.length)];
  const nm = name || DOG_NAMES[Math.floor(Math.random() * DOG_NAMES.length)];
  const dog = {
    id: 'dog_' + Math.random().toString(36).substr(2, 9),
    name: nm,
    isDog: true,
    breedId: b.id,
    breedName: b.name,
    icon: b.icon,
    bgTitle: 'Боевой пёс',
    perk: b.perk,
    level: 1,
    xp: 0,
    unspent: 0,
    hp: b.hp, maxHp: b.hp,
    atk: b.atk,
    def: b.def + (b.id === 'warhound' ? 6 : 0),
    agi: b.agi,
    attrs: {
      str: Math.round(b.atk / 12),
      dex: Math.round(b.agi / 1.6),
      vit: Math.round(b.hp / 12),
      sta: 5, wil: 4
    },
    cost: b.cost,
    colors: { body: b.body, belly: b.belly, snout: b.snout },
    build: b.build,
    aiRole: 'melee',
    equip: { weapon: null, offhand: null, head: null, body: null, arms: null, legs: null, doggear: null }
  };
  resetLimbs(dog);
  return dog;
}

// ==================== СУНДУКИ ====================
// Сундук — лотерея за золото. Дешёвый может дать мусор, дорогой —
// вещь 4–5 тира. Ожидаемая ценность всегда ниже цены сундука,
// поэтому бесконечно крутить их невыгодно: экономика не ломается.
const CHESTS = [
  {
    id: 'chest_poor', name: 'Облезлый сундук', icon: '📦', price: 70,
    desc: 'Найден на свалке у Субуры. Пахнет рыбой.',
    weights: { 1: 62, 2: 30, 3: 8 },
    goldBack: 0.35
  },
  {
    id: 'chest_old', name: 'Старый сундук', icon: '🧰', price: 180,
    desc: 'Сколочен из корабельных досок. Внутри что-то звенит.',
    weights: { 1: 30, 2: 44, 3: 22, 4: 4 },
    goldBack: 0.3
  },
  {
    id: 'chest_merchant', name: 'Купеческий сундук', icon: '🎁', price: 420,
    desc: 'С замком из Карфагена. Купец клянётся, что не открывал.',
    weights: { 2: 34, 3: 42, 4: 20, 5: 4 },
    goldBack: 0.28
  },
  {
    id: 'chest_imperial', name: 'Имперский сундук', icon: '💎', price: 950,
    desc: 'Клеймо легиона. Такие выдают за особые заслуги.',
    weights: { 3: 40, 4: 42, 5: 18 },
    goldBack: 0.25
  },
  {
    id: 'chest_legend', name: 'Сундук Легенды', icon: '🏆', price: 1900,
    desc: 'Говорят, последний такой открыл сам чемпион.',
    weights: { 4: 55, 5: 45 },
    goldBack: 0.22
  }
];

function chestById(id) {
  return CHESTS.find(c => c.id === id) || null;
}

// Что выпадет из сундука: предмет + иногда немного золота «сдачи»
function rollChestLoot(chest) {
  const w = chest.weights;
  const total = Object.keys(w).reduce((s, k) => s + w[k], 0);
  let r = Math.random() * total;
  let tier = 1;
  for (const k of Object.keys(w)) {
    r -= w[k];
    if (r <= 0) { tier = parseInt(k, 10); break; }
  }
  const pool = ITEMS_DB.filter(i => i.tier === tier && !i.bossItem);
  const item = pool.length
    ? { ...pool[Math.floor(Math.random() * pool.length)] }
    : { ...ITEMS_DB[0] };
  item.uid = 'ch_' + Math.random().toString(36).substr(2, 9);

  const goldBack = Math.random() < 0.45
    ? Math.round(chest.price * chest.goldBack * (0.4 + Math.random() * 0.8))
    : 0;

  return { item, goldBack, tier };
}

// ==================== ТАВЕРНА: ПИВО И РАЗГОВОРЫ ====================
// Кружка пива стоит немного, даёт мелкий бафф на день и открывает
// разговор со случайным персонажем. Иногда собеседник даёт подсказку.
const BEER_COST = 25;

const TAVERN_TALKERS = [
  {
    id: 'veteran', name: 'Старый легионер', icon: '🎖️', color: '#c9a45c',
    lines: [
      'Держи щит выше, сынок. Мёртвым броня не нужна.',
      'Я служил в девятом. Из моей когорты вернулись трое. Я — один из них.',
      'Если враг сильнее — бей по руке с оружием. Без руки он никто.'
    ],
    hint: 'Конечности решают бой: отруби руку — и враг бьёт вдвое слабее.',
    buff: { def: 1 }
  },
  {
    id: 'merchant', name: 'Купец из Остии', icon: '⚖️', color: '#c98a4a',
    lines: [
      'Сундуки? Половина — мусор. Но вторая половина... вторая половина платит за всё.',
      'Ты знаешь, что за 950 можно купить сундук с имперским клеймом? Рискни.',
      'Цена и ценность — разные вещи. Но не для меня.'
    ],
    hint: 'Дорогие сундуки чаще дают 4–5 тир, но иногда попадается и хлам.',
    buff: { gold: 15 }
  },
  {
    id: 'courtesan', name: 'Танцовщица', icon: '💃', color: '#c77a9a',
    lines: [
      'Ты дерёшься красиво. Толпа любит красивых.',
      'Патриции смотрят на тебя из ложи. Улыбнись — они платят за улыбки.',
      'Мой брат был гладиатором. Он тоже думал, что бессмертен.'
    ],
    hint: 'Слава приносит золото: чем громче имя, тем щедрее патриции.',
    buff: { fame: 2 }
  },
  {
    id: 'medicus', name: 'Ученик Медикуса', icon: '⚕️', color: '#7fb08a',
    lines: [
      'Конечность не срастётся. Никогда. Я пробовал.',
      'Лихорадку лечат покоем, а не молитвами. Но молитвы не мешают.',
      'Кровь на песке — это просто кровь. Пока это не твоя.'
    ],
    hint: 'Храм лечит здоровье, но не возвращает отрубленное. Береги конечности.',
    buff: { heal: 12 }
  },
  {
    id: 'beastmaster', name: 'Псарь', icon: '🐕', color: '#a8895e',
    lines: [
      'Пёс умрёт за тебя быстрее, чем брат. Так уж они устроены.',
      'Волкодав бьёт на две клетки. Молосская морда — держит удар.',
      'Не корми пса со стола. Он начнёт думать, что он главный.'
    ],
    hint: 'Псы дёшевы и бьют больно. Хороши как заслон перед стрелками.',
    buff: { dogXp: 25 }
  },
  {
    id: 'champion', name: 'Завсегдатай-чемпион', icon: '🏆', color: '#e5b54f',
    lines: [
      'Сто побед. Вот тогда они запомнят имя.',
      'Легенда? Я видел его бой. Он не человек. Он — сама арена.',
      'Каждый десятый бой — босс. Готовься заранее, а не на песке.'
    ],
    hint: 'Каждый 10-й победный бой — босс. Проверь конечности и снаряжение заранее.',
    buff: { xp: 20 }
  },
  {
    id: 'drunk', name: 'Пьяный возница', icon: '🍺', color: '#9b8a74',
    lines: [
      'А я тебе говорю — лошади умнее людей! Ну, кроме тебя. Ты тоже умный.',
      'Слышал, как ты дрался? Не слышал. Но слышал, как о тебе говорили.',
      'Наливай ещё. За твою мать. Она вырастила бойца.'
    ],
    hint: 'Иногда стоит просто выпить. Не всё в этом городе про бой.',
    buff: {}
  },
  {
    id: 'sponsor', name: 'Сенатор в тени', icon: '🏛️', color: '#8a9ac9',
    lines: [
      'Я плачу за зрелище. Не за победу — за зрелище.',
      'Проиграй красиво, и я всё равно заплачу. Победи скучно — и я забуду тебя.',
      'Толпа любит кровь. Толпа платит за кровь. Не разочаровывай толпу.'
    ],
    hint: 'Невыносимая сложность платит в полтора раза больше, но и убивает чаще.',
    buff: { gold: 25 }
  }
];

function pickTalker(excludeId) {
  const pool = TAVERN_TALKERS.filter(t => t.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)] || TAVERN_TALKERS[0];
}

// ==================== СЮЖЕТ ====================
// Короткая история: герой всё потерял, мать больна, нужны деньги.
const STORY = {
  intro: {
    title: 'Пепел и долги',
    text: `Ты был лучшим гладиатором Рима — пока кредиторы не забрали дом, лошадей и имя.\n\n` +
          `Осталось одно: мать, которая лежит в лихорадке, и лекарь, который назвал цену — 6000 сестерциев.\n\n` +
          `Столько платят только за победу над Легендой Колизея. Последний босс арены — и он выйдет на песок.`
  },
  motherSick: 'Мать кашляет кровью. Лекарь говорит: «Время, гладиатор. Времени у неё мало».',
  bosses: [
    'Ганник Пепельный — тот, кто отнял у тебя имя. Он помнит тебя. Он улыбается.',
    'Мортус Жрец — шепчет, что смерть милосерднее долга.',
    'Игнис Пламенный — сжёг дом, в котором ты родился.',
    'Скади Белая — та, кому ты проиграл один раз. Она не забыла.',
    'Легенда Колизея — последний босс. Он ждёт тебя с самого начала.'
  ],
  winFinal: `Толпа падает на колени. Легенда Колизея лежит на песке — непобеждённый больше не нужен Риму.\n\n` +
            `Кредиторы молчат. Лекарь получает свои деньги. Мать снова дышит без хрипа.\n\n` +
            `Ты не вернул имя. Ты вернул кое-что важнее.`,
  winBoss: 'Толпа ревёт. Ты поднимаешь трофей — и понимаешь, что это только начало.',
  lose: 'Песок помнит всех. Тебя он тоже запомнит.',
  healMother: 'Лекарь забирает монеты и кивает: «Она будет жить».'
};

const MOTHER_HEAL_COST = 6000;

// ==================== ПРЕДЫСТОРИИ КЛАССОВ ====================
// Каждый класс — это история. Она показывается при клике на наёмника
// в таверне (вкладка «Предыстория»).
const CLASS_LORE = {
  murmillo: {
    title: 'Мурмиллон — Стена Рима',
    story: (name) => `${name} родился в провинции Галлия, в семье переселенцев. В двенадцать лет его продали в школу гладиаторов — магистр Фламиний взял за него тридцать монет. «Пусть учится стоять, — сказал Фламиний. — Умный не учится бегать.»\n\nПервый год он провёл со щитом: стоял в строю, учился не моргать, когда бьёт по лицу. Второй год — с гладиусом: учился бить не в живот, а в горло. Третий — первый раз вышел на песке один.\n\n«Стена» — так его прозвали враги. Потому что мурмиллон не отступает. Даже когда умирает — стоит.`
  },
  retiarius: {
    title: 'Ретиарий — Тень на песке',
    story: (name) => `${name} вырос на побережье — в маленьком порту, где ловили рыбу и играли в азартные игры. Отец был рыбаком, мать стирала чужое бельё. Когда отцу сломали спину, а хозяин порта забрал лодку, ${name} ушёл на арены.\n\nТрезубец он выковал из старого якорного крюка. Сеть сшила ему старуха-соседка — из рыболовной сети, конечно. «Бей по ногам, — говорила она. — Пока они падают, ты уже ушёл.»\n\nПервый год ${name} провёл в подзвёздье. Второй — выиграл первый бой. Третий — мурмиллон упал на песок, и он понял: его сеть — это судьба.`
  },
  thraex: {
    title: 'Фракиец — Кривой клинок',
    story: (name) => `${name} — из племени, которое Рим не покорил до сих пор. Родом с Балкан, из гор, где каждый мужчина — воин, а каждый воин — вор.\n\nКривой клинок — сика — достался ему от отца, а тот получил его от деда. «Прямой меч — для солдат, — говорил отец. — Кривой — для убийц.» ${name} был и тем, и другим.\n\nНа аренах его любят за то, что он не стоит на месте. Он бежит, колет, убегает. Враги называют его трусом — пока не понимают, что уже умерли.\n\n«Живой фракиец — редкость, — говорит Фламиний. — Мёртвый — ещё реже.»`
  },
  hoplomachus: {
    title: 'Гопломах — Греческий боец',
    story: (name) => `${name} — грек. Родом из Спарты, хотя сам он предпочитает называть себя «из Афин» — потому что в Спарте его бы не восприняли всерьёз: «Ты не родился с мечом в руке, — говорили там. — Значит, ты не воин.»\n\nНо ${name} не согласился. Он взял копьё и щит — греческое оружие, оружие его предков — и отправился на Рим. Там его приняли: копьё с щитом — редкий боец, редкий зрелище.\n\n«Гопломах, — сказал Фламиний после первого боя. — Ты бьёшь из второго ряда, как будто тебя не видят. Но я вижу.»\n\n${name} кивнул и пошёл на свой следующий бой.`
  },
  dimachaerus: {
    title: 'Димахер — Два клинка',
    story: (name) => `${name} начал с убийств. Не на арене — на улицах Рима, в переулке за рынком, где не слышно криков. Он не был гладиатором. Он был тем, кого нанимали — за монету, за долг, за страх.\n\nДва клинка — это не оружие гладиатора. Это оружие убийцы. Но Фламиний увидел его первый бой и сказал: «У тебя нет щита, зато у тебя две руки. Это лучше.»\n\nВихрь — так называют его на арене. Потому что враг не знает, откуда прилетит удар. Один клинок отвлекает, другой — бьёт. И так — пока не упадёт.\n\n«Димахер без щита — безумец, — говорит Фламиний. — Димахер с щитом — Бог.»`
  },
  sagittarius: {
    title: 'Сагиттарий — Стрелок',
    story: (name) => `${name} — охотник. До арены он стрелял в оленей в лесах Испании. Отец был фермером, мать — ткачихой. Когда римский легионер прошёл через деревню, ${name} ушёл с ним — не по призыву, а по доброй воле.\n\n«Там ты будешь стрелять в людей, — сказал отец. — Это хуже.»\n\n${name} не ответил. Он взял лук и пошёл.\n\nНа арене он — редкость. Стрелков мало, потому что стрелок живёт дольше бойца ближнего боя. Он не бьёт вплотную. Он стреляет — и отходит. Враг бежит за ним, а он уже зарядил вторую стрелу.\n\n«Сагиттарий, — говорит Фламиний. — Ты — мой лучший снайпер. И мой самый тихий.»`
  },
  bestiarius: {
    title: 'Бестиарий — Зверолов',
    story: (name) => `${name} родился на краю Тартара — в месте, где Рим держит зверей для арены. Отец был звероловом, мать — травильщицей. Когда отца разорвал лев, ${name} взял его ружьё и пошёл в лес.\n\nОн убил медведя, волка, льва. Три зверя — три года. Три зверя — три жизни.\n\nНа аренах его любят за то, что он не боится зверя. Другие гладиаторы боятся — не потому что зверь силён, а потому что он не понимает правил. Зверь не стоит на месте. Зверь не ждёт команды. Зверь бьёт — и всё.\n\n«Бестиарий, — говорит Фламиний. — Ты — единственный, кто может выйти против своры и не упасть.»\n\n${name} кивает и идёт на песок.`
  },
  crupellarius: {
    title: 'Крупелларий — Железный Галл',
    story: (name) => `${name} — галл. Большой, тяжёлый, медленный. Но тот, кто коснётся его — не отстанет.\n\nОн родился в племени, где каждый мужчина — кузнец. Отец ковал мечи, дед — латы. Когда Рим пришёл и забрал кузницу, ${name} ковал доспехи для врагов — потому что платить было нечем.\n\n«Ты тяжёлый, — сказал Фламиний. — Но ты живучий.»\n\n${name} надел латы — все семь доспехов — и вышел на песок. Враг ударил — и сломал меч. Второй ударил — и сломал копьё. Третий ударил — и сломал щит.\n\n«Крупелларий, — говорит Фламиний. — Ты — мой танк. И мой самый ненавидимый.»\n\n${name} не слышит. Он слишком медленный, чтобы услышать.`
  },
  veles: {
    title: 'Велит — Лёгкий стрелок',
    story: (name) => `${name} — из племени, которое не имеет имени. Он родился в горах Карпат, в месте, где нет городов и нет дорог. Его племя жило охотой и грабежом.\n\nДротик — его первое оружие. Он научился бросать его раньше, чем ходить. Отец сказал: «Ты не воин. Ты — ветер.»\n\nНа аренах ${name} — ветер. Он бросает дротик — и отходит. Бросает второй — и снова отходит. Враг бежит за ним, а он уже зарядил третий.\n\n«Велит, — говорит Фламиний. — Ты — мой скаут. И мой самый быстрый.»\n\n${name} кивает и уже ушёл.`
  },
  provocator: {
    title: 'Провокатор — Зов Арены',
    story: (name) => `${name} — из Рима. Настоящий римлянин — из тех, кто родился в городе, вырос на форуме и впервые увидел море в двадцать лет.\n\nОн начал как солдат — легионер, рядовой, простой пехотинец. Но когда его командир умер от чумы, ${name} ушёл в отставку и пошёл на арены.\n\n«Ты не солдат, — сказал Фламиний. — Ты гладиатор.»\n\n«Я знаю, — ответил ${name}. — Но я умею стоять. И я умею звать.»\n\nПровокатор — это тот, кто вызывает. Выходит на арену один, смотрит врагу в глаза и говорит: «Иди сюда.» И враг идёт — потому что не может отказать.\n\n«Провокатор, — говорит Фламиний. — Ты — мой призрак. И мой самый смелый.»`
  }
};

// ==================== КЛАССЫ ГЛАДИАТОРОВ ====================
// Класс — это не роль, а школа арены: исторический тип бойца со своим
// снаряжением и особым перком. Роль определяется оружием, класс — тем,
// как боец им пользуется. Класс задаётся при найме и не меняется.
const CLASS_DEFS = {
  murmillo: {
    id: 'murmillo', name: 'Мурмиллон', latin: 'Murmillo', icon: '🛡️',
    role: 'shield', color: '#7f9ad1', costMul: 1.15,
    desc: 'Тяжёлый щит, гладиус и упрямство. Держит линию, пока другие падают.',
    perk: 'Стена: +12% блока, +8 брони корпуса, но −4 к уклонению',
    mods: { blockBonus: 12, armorBonus: 8, evasionMul: 0.92 }
  },
  retiarius: {
    id: 'retiarius', name: 'Ретиарий', latin: 'Retiarius', icon: '🕸️',
    role: 'melee', color: '#7fb08a', costMul: 1.05,
    desc: 'Сеть и трезубец. Бьёт по ногам и уходит прежде, чем ты поймёшь, что упал.',
    perk: 'Сеть: +15% урона по ногам, +8 к уклонению',
    mods: { legDmgMul: 1.15, evasionBonus: 8 }
  },
  thraex: {
    id: 'thraex', name: 'Фракиец', latin: 'Thraex', icon: '🗡️',
    role: 'melee', color: '#c98a4a', costMul: 1.1,
    desc: 'Кривой клинок и малый щит. Живёт короткими злыми выпадами.',
    perk: 'Выпад: +10% урона, +8 к точности',
    mods: { dmgMul: 1.1, hitBonus: 8 }
  },
  hoplomachus: {
    id: 'hoplomachus', name: 'Гопломах', latin: 'Hoplomachus', icon: '🔱',
    role: 'shield', color: '#8aa8c9', costMul: 1.2,
    desc: 'Копьё, щит и греческая выучка. Работает вторым рядом.',
    perk: 'Держи дистанцию: копьё бьёт на 2 клетки, +6 к защите',
    mods: { defBonus: 6, reachBonus: 1 }
  },
  dimachaerus: {
    id: 'dimachaerus', name: 'Димахер', latin: 'Dimachaerus', icon: '⚔️',
    role: 'melee', color: '#d1745f', costMul: 1.25,
    desc: 'Два клинка, ни щита, ни страха. Умирает красиво, живёт быстро.',
    perk: 'Вихрь: 25% шанс ударить второй раз, но −8 брони',
    mods: { doubleStrike: 0.25, armorBonus: -8, evasionBonus: 4 }
  },
  sagittarius: {
    id: 'sagittarius', name: 'Сагиттарий', latin: 'Sagittarius', icon: '🏹',
    role: 'ranged', color: '#9ec58a', costMul: 1.1,
    desc: 'Лук и холодная голова. Стреляет раньше, чем противник дойдёт.',
    perk: 'Хладнокровие: +12% урона на дистанции, −10 здоровья',
    mods: { dmgMul: 1.12, hpMul: 0.9 }
  },
  bestiarius: {
    id: 'bestiarius', name: 'Бестиарий', latin: 'Bestiarius', icon: '🐾',
    role: 'melee', color: '#a8895e', costMul: 1.0,
    desc: 'Выходил против зверей и научился бить туда, где больно.',
    perk: 'Зверолов: +25% урона по псам и зверям',
    mods: { beastDmgMul: 1.25 }
  },
  crupellarius: {
    id: 'crupellarius', name: 'Крупелларий', latin: 'Crupellarius', icon: '🪨',
    role: 'shield', color: '#a0a0a8', costMul: 1.3,
    desc: 'Галльские латы с ног до головы. Медленный, но пробить трудно.',
    perk: 'Железный: −12% входящего урона, −2 ОД',
    mods: { drMul: 0.88, apBonus: -2, armorBonus: 10 }
  },
  veles: {
    id: 'veles', name: 'Велит', latin: 'Veles', icon: '🎯',
    role: 'ranged', color: '#c9a86a', costMul: 1.05,
    desc: 'Лёгкий, быстрый, с дротиками. Бьёт первым и отходит.',
    perk: 'Первый удар в бою наносит +50% урона',
    mods: { firstStrikeMul: 1.5, evasionBonus: 6 }
  },
  provocator: {
    id: 'provocator', name: 'Провокатор', latin: 'Provocator', icon: '📣',
    role: 'shield', color: '#c9a05a', costMul: 1.15,
    desc: 'Средний щит и тяжёлый гладиус. Умеет выйти и заставить драться.',
    perk: 'Вызов: +10% здоровья, враги чаще выбирают его целью',
    mods: { hpMul: 1.1, taunt: true }
  }
};

const CLASS_LIST = Object.values(CLASS_DEFS);

function classById(id) {
  return CLASS_DEFS[id] || null;
}

function pickClassForRole(role) {
  const pool = CLASS_LIST.filter(c => c.role === role);
  const list = pool.length ? pool : CLASS_LIST;
  return list[Math.floor(Math.random() * list.length)];
}

// ==================== СНАРЯЖЕНИЕ УНИВЕРСАЛЬНО ====================
// Классовое снаряжение убрано из игры. Класс гладиатора влияет только
// на характеристики и уникальные способности, но не на то, что он может надеть.
function classItems() { return []; }

// ==================== УНИКАЛЬНОСТЬ ХАРАКТЕРИСТИК ====================
// Двух одинаковых оружий быть не должно: если у двух предметов совпал
// полный набор характеристик, второму добавляем «характер» — сдвигаем
// урон, точность или бронебой, пока подпись не станет уникальной.
function weaponSignature(it) {
  return [it.dmgMin, it.dmgMax, it.apCost, it.hitMod, it.armorPen, it.range].join('|');
}

function ensureUniqueWeaponStats() {
  const seen = new Set();
  const weapons = ITEMS_DB.filter(i => i.slot === 'weapon')
    .sort((a, b) => (a.tier || 1) - (b.tier || 1) || a.price - b.price);
  weapons.forEach((it, idx) => {
    let guard = 0;
    while (seen.has(weaponSignature(it)) && guard++ < 40) {
      // Поочерёдно подкручиваем разные параметры — так предметы
      // остаются в своём тире, но перестают быть клонами.
      if (guard % 3 === 1) {
        it.dmgMax += 1;
        if (it.dmgMax <= it.dmgMin) it.dmgMax = it.dmgMin + 2;
      } else if (guard % 3 === 2) {
        it.hitMod += 1;
      } else {
        it.armorPen = Math.min(0.9, +(it.armorPen + 0.01).toFixed(2));
      }
    }
    seen.add(weaponSignature(it));
  });
  // Цена и требования считаются уже от итоговых характеристик
  weapons.forEach(it => {
    if (it.bossItem) return;
    it.price = priceWeapon(it);
    it.famePrice = Math.max(1, Math.round(it.price / 45));
  });
}

ensureUniqueWeaponStats();

// Итоговый модификатор ОД от надетых вещей (тяжёлая броня отнимает действия)
function equipApModifier(glad) {
  const eq = (glad && glad.equip) || {};
  let d = 0;
  ['head', 'body', 'arms', 'legs', 'offhand'].forEach(s => {
    if (eq[s] && eq[s].apBonus) d += eq[s].apBonus;
  });
  return d;
}

// Суммарные бонусы к характеристикам от снаряжения
function equipAttrBonus(glad) {
  const eq = (glad && glad.equip) || {};
  const out = {};
  Object.keys(eq).forEach(s => {
    const it = eq[s];
    if (it && it.attrBonus) {
      Object.keys(it.attrBonus).forEach(k => { out[k] = (out[k] || 0) + it.attrBonus[k]; });
    }
  });
  return out;
}

// Эффективные характеристики: базовые + от вещей
function effectiveAttrs(glad) {
  const base = (glad && glad.attrs) || { str: 5, dex: 5, vit: 5, sta: 5, wil: 5 };
  const bonus = equipAttrBonus(glad);
  const out = {};
  Object.keys(base).forEach(k => { out[k] = (base[k] || 0) + (bonus[k] || 0); });
  Object.keys(bonus).forEach(k => { if (!(k in out)) out[k] = bonus[k]; });
  return out;
}

// ==================== НАВЫКИ ПРОИСХОЖДЕНИЙ ====================
// Каждые 3 уровня боец выбирает один навык из трёх предложенных.
// Набор навыков зависит от происхождения: легионер учится строю,
// браконьер — засадам, кузнец — тяжёлому удару.
const SKILL_LEVEL_STEP = 3;

const BG_SKILLS = {
  legionnaire: [
    { id: 'lg_shieldwall', name: 'Стена щитов', icon: '🛡️', desc: '+8% блока и +6 к защите', mods: { blockBonus: 8, defBonus: 6 } },
    { id: 'lg_drill', name: 'Строевая выучка', icon: '⚡', desc: '+1 ОД в бою', mods: { apBonus: 1 } },
    { id: 'lg_pilum', name: 'Пилум перед строем', icon: '🎯', desc: '+10 к точности', mods: { hitBonus: 10 } },
    { id: 'lg_veteran', name: 'Ветеранская закалка', icon: '❤️', desc: '+12% здоровья', mods: { hpMul: 1.12 } },
    { id: 'lg_press', name: 'Давление', icon: '💪', desc: '+8% урона', mods: { dmgMul: 1.08 } },
    { id: 'lg_steady', name: 'Хладнокровие', icon: '🧠', desc: '−6% входящего урона', mods: { drMul: 0.94 } }
  ],
  debtor: [
    { id: 'db_desperate', name: 'Отчаяние', icon: '🔥', desc: '+14% урона, −5% здоровья', mods: { dmgMul: 1.14, hpMul: 0.95 } },
    { id: 'db_slip', name: 'Ускользнуть', icon: '💨', desc: '+10 к уклонению', mods: { evasionBonus: 10 } },
    { id: 'db_cheap', name: 'Грязный приём', icon: '🗡️', desc: '+12% урона по конечностям', mods: { limbDmgMul: 1.12 } },
    { id: 'db_survive', name: 'Жить любой ценой', icon: '❤️', desc: '+15% здоровья', mods: { hpMul: 1.15 } },
    { id: 'db_lucky', name: 'Долговая удача', icon: '🍀', desc: '+6 к точности и +6 к уклонению', mods: { hitBonus: 6, evasionBonus: 6 } },
    { id: 'db_bite', name: 'Укус крысы', icon: '🦷', desc: 'Первый удар в бою +40% урона', mods: { firstStrikeMul: 1.4 } }
  ],
  northman: [
    { id: 'nm_rage', name: 'Ярость севера', icon: '🪓', desc: '+12% урона', mods: { dmgMul: 1.12 } },
    { id: 'nm_frost', name: 'Морозная кровь', icon: '❄️', desc: '−8% входящего урона', mods: { drMul: 0.92 } },
    { id: 'nm_bear', name: 'Медвежья сила', icon: '🐻', desc: '+18% здоровья', mods: { hpMul: 1.18 } },
    { id: 'nm_shield', name: 'Круглый щит', icon: '🛡️', desc: '+10% блока', mods: { blockBonus: 10 } },
    { id: 'nm_charge', name: 'Натиск', icon: '⚡', desc: '+1 ОД в бою', mods: { apBonus: 1 } },
    { id: 'nm_thick', name: 'Толстая шкура', icon: '🪨', desc: '+10 брони корпуса', mods: { armorBonus: 10 } }
  ],
  poacher: [
    { id: 'pc_ambush', name: 'Засада', icon: '🎯', desc: 'Первый удар +50% урона', mods: { firstStrikeMul: 1.5 } },
    { id: 'pc_eye', name: 'Острый глаз', icon: '👁️', desc: '+14 к точности', mods: { hitBonus: 14 } },
    { id: 'pc_dodge', name: 'Лесной шаг', icon: '💨', desc: '+12 к уклонению', mods: { evasionBonus: 12 } },
    { id: 'pc_snare', name: 'Силок', icon: '🕸️', desc: '+16% урона по ногам', mods: { legDmgMul: 1.16 } },
    { id: 'pc_poison', name: 'Яд на клинке', icon: '☠️', desc: '+10% урона и +4 к точности', mods: { dmgMul: 1.1, hitBonus: 4 } },
    { id: 'pc_quiet', name: 'Тихий шаг', icon: '🍃', desc: '−8% входящего урона', mods: { drMul: 0.92 } }
  ],
  smith: [
    { id: 'sm_hammer', name: 'Молот кузнеца', icon: '🔨', desc: '+14% урона тяжёлым оружием', mods: { dmgMul: 1.14 } },
    { id: 'sm_plate', name: 'Своя броня', icon: '🛡️', desc: '+12 брони корпуса', mods: { armorBonus: 12 } },
    { id: 'sm_forge', name: 'Кузнечная хватка', icon: '💪', desc: '+8 к точности и +6% урона', mods: { hitBonus: 8, dmgMul: 1.06 } },
    { id: 'sm_anvil', name: 'Наковальня', icon: '🪨', desc: '−10% входящего урона', mods: { drMul: 0.9 } },
    { id: 'sm_quench', name: 'Закалка', icon: '❤️', desc: '+14% здоровья', mods: { hpMul: 1.14 } },
    { id: 'sm_edge', name: 'Острая кромка', icon: '🗡️', desc: '+10% урона, +6% бронебоя', mods: { dmgMul: 1.1, penBonus: 0.06 } }
  ]
};

function skillsForBg(bgId) {
  // Навыки скорости доступны любому бойцу: это общий пул арены.
  const common = SPEED_SKILLS.filter(s => !s.requires);
  return (BG_SKILLS[bgId] || BG_SKILLS.debtor).concat(common);
}

// Навыки скорости: каждый уровень сокращает замах в кликер-бою.
// Берутся последовательно — второй уровень открывается после первого.
const SPEED_SKILLS = [
  { id: 'spd_quick', name: 'Быстрые руки', icon: '⚡', desc: 'Замах короче на 10%', mods: { speedMul: 0.90 } },
  { id: 'spd_swift', name: 'Скорость', icon: '💨', desc: 'Замах короче ещё на 12%', mods: { speedMul: 0.88 }, requires: 'spd_quick' },
  { id: 'spd_lightning', name: 'Молния', icon: '🌩️', desc: 'Замах короче ещё на 14%', mods: { speedMul: 0.86 }, requires: 'spd_swift' }
];

// Суммарное ускорение замаха от изученных навыков (множитель ≤ 1)
function speedSkillMul(glad) {
  const ids = (glad && glad.skills) || [];
  let mul = 1;
  ids.forEach(id => {
    const s = SPEED_SKILLS.find(x => x.id === id);
    if (s && s.mods && s.mods.speedMul) mul *= s.mods.speedMul;
  });
  return mul;
}

function skillById(id) {
  for (const k of Object.keys(BG_SKILLS)) {
    const s = BG_SKILLS[k].find(x => x.id === id);
    if (s) return s;
  }
  return SPEED_SKILLS.find(x => x.id === id) || null;
}

// Предложить три навыка: только те, что ещё не взяты и чьи требования выполнены
function rollSkillChoices(glad) {
  const taken = glad.skills || [];
  const pool = skillsForBg(glad.bgId).concat(
    SPEED_SKILLS.filter(s => s.requires && taken.includes(s.requires))
  ).filter(s => !taken.includes(s.id) && (!s.requires || taken.includes(s.requires)));
  const out = [];
  const rest = pool.slice();
  while (out.length < 3 && rest.length) {
    out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
  }
  return out;
}

// ==================== СЮЖЕТНЫЕ ЦЕЛИ ====================
// Цели висят справа в городе: игрок видит, куда двигаться, и что за это дадут.
// Награда выдаётся один раз, отметка хранится в STATE.story.claimedGoals.
// unlock — условие, когда цель появляется в списке: сначала видны только
// первые шаги, остальные открываются по мере развития отряда.
const STORY_GOALS = [
  {
    id: 'goal_first_blood', title: 'Первая кровь', icon: '⚔️',
    desc: 'Одержите первую победу на арене',
    reward: { gold: 200, fame: 10 },
    progress: S => Math.min(1, (S.wins || 0)),
    need: 1,
    unlock: () => true
  },
  {
    id: 'goal_squad3', title: 'Три клинка', icon: '🛡️',
    desc: 'Соберите отряд из трёх бойцов',
    reward: { gold: 150 },
    progress: S => (S.squad || []).length,
    need: 3,
    unlock: () => true
  },
  {
    id: 'goal_dog', title: 'Зубастый друг', icon: '🐕',
    desc: 'Купите боевого пса в псарне',
    reward: { gold: 120, fame: 5 },
    progress: S => (S.dogs || []).length,
    need: 1,
    unlock: S => (S.wins || 0) >= 1
  },
  {
    id: 'goal_roster6', title: 'Школа арены', icon: '🏛️',
    desc: 'Соберите шесть гладиаторов в казарме',
    reward: { gold: 400, fame: 15 },
    progress: S => (S.roster || []).length,
    need: 6,
    unlock: S => (S.wins || 0) >= 3
  },
  {
    id: 'goal_boss1', title: 'Пепел Ганника', icon: '👑',
    desc: 'Победите первого босса — Ганника Пепельного',
    reward: { gold: 600, fame: 30 },
    progress: S => (S.bossesBeaten || []).length,
    need: 1,
    unlock: S => (S.wins || 0) >= 5
  },
  {
    id: 'goal_win10', title: 'Десять побед', icon: '🏆',
    desc: 'Одержите десять побед подряд на любой сложности',
    reward: { gold: 500, fame: 25 },
    progress: S => Math.min(10, (S.wins || 0)),
    need: 10,
    unlock: S => (S.wins || 0) >= 7 || (S.bossesBeaten || []).length >= 1
  },
  {
    id: 'goal_boss3', title: 'Три короны', icon: '💀',
    desc: 'Победите трёх боссов Колизея',
    reward: { gold: 1200, fame: 60 },
    progress: S => (S.bossesBeaten || []).length,
    need: 3,
    unlock: S => (S.bossesBeaten || []).length >= 1
  },
  {
    id: 'goal_mother', title: 'Долг лекаря', icon: '💊',
    desc: 'Накопите 6000 сестерциев на лечение матери',
    reward: { gold: 800, fame: 40 },
    progress: S => (S.story && S.story.motherHealed) ? 6000 : Math.min(6000, (S.gold || 0)),
    need: 6000,
    unlock: S => (S.bossesBeaten || []).length >= 2 || (S.wins || 0) >= 12
  },
  {
    id: 'goal_legend', title: 'Легенда Колизея', icon: '🌟',
    desc: 'Победите Легенду Колизея — последнего босса арены',
    reward: { gold: 3000, fame: 200 },
    progress: S => (S.story && S.story.finalWon) ? 1 : 0,
    need: 1,
    unlock: S => (S.bossesBeaten || []).length >= 4 || (S.wins || 0) >= 60
  }
];

// ==================== СПРАВКА ====================
// Всё, что новичок должен узнать, не выходя из игры.
const HELP_GUIDE = [
  {
    icon: '🏛️', title: 'С чего начать',
    text: 'Вы в Риме без денег и без имени. Начните с таверны: там нанимают гладиаторов. ' +
          'Возьмите двух-трёх бойцов, поставьте их в отряд в казарме и идите в Колизей на низкую сложность.'
  },
  {
    icon: '🧍', title: 'Отряд и резерв',
    text: 'Владеть можно 12 гладиаторами, но на песок выходят только трое. Остальные ждут в казарме: ' +
          'их можно менять между боями, лечить и прокачивать. Псы считаются отдельно — до 3 в псарне.'
  },
  {
    icon: '⚔️', title: 'Как идёт бой',
    text: 'Бой пошаговый. У каждого бойца есть очки действия (ОД). Перемещение, удар, стойка и уклонение ' +
          'стоят ОД. Кликните по своему бойцу — рядом откроется меню действий. Затем кликните по врагу или по клетке.'
  },
  {
    icon: '🎯', title: 'Конечности и лечение',
    text: 'Удары бьют по конкретным частям тела: голова, корпус, руки, ноги. Конечность можно повредить, ' +
          'а потом и потерять навсегда. В храме Медикуса видно, что именно повреждено, и сколько стоит лечение.'
  },
  {
    icon: '🏹', title: 'Дистанции оружия',
    text: 'Копья бьют на 2 клетки, луки и арбалеты — на 7. Всё остальное — только вплотную, на 1 клетку. ' +
          'Дальнобойный боец не должен подпускать врага: отходите и стреляйте.'
  },
  {
    icon: '👑', title: 'Боссы и сюжет',
    text: 'Боссы выходят один на один на 5-й, 20-й, 40-й, 65-й и 100-й победе — каждый сильнее предыдущего, ' +
          'со своими способностями и магией. Уровень сложности в таком бою не выбирается: всё решает арена. ' +
          'Победа над Легендой Колизея завершает историю.'
  },
  {
    icon: '🎲', title: 'Случайные события',
    text: 'После боя может случиться событие: хорошее, плохое или с выбором. Иногда выбор важнее победы. ' +
          'Историю событий можно посмотреть в городе по кнопке «Вести».'
  },
  {
    icon: '🔄', title: 'Обновление списков',
    text: 'Не нравятся наёмники в таверне или собаки в псарне? Обновите список за деньги — ' +
          'придут другие. Обновление в таверне стоит 45 сестерциев, в псарне — 40.'
  },
  {
    icon: '💾', title: 'Сохранения',
    text: 'В игре пять слотов. Игра сохраняется автоматически после каждого боя. ' +
          'Кнопка 💾 в шапке открывает меню слотов: можно сохранить, загрузить или начать заново.'
  }
];

const HELP_CLASSES = [
  { icon: '🛡️', name: 'Мурмиллон', perk: 'Стена: +12% блока, +8 брони корпуса, −4 к уклонению',
    text: 'Тяжёлый щит и гладиус. Классика арены: стоит впереди и не двигается с места.' },
  { icon: '🕸️', name: 'Ретиарий', perk: 'Сеть: +15% урона по ногам, +8 к уклонению',
    text: 'Сеть и трезубец. Бьёт по ногам, чтобы противник не догнал.' },
  { icon: '🗡️', name: 'Фракиец', perk: 'Выпад: +10% урона, +8 к точности',
    text: 'Кривой клинок и малый щит. Короткие злые выпады, много движения.' },
  { icon: '🔱', name: 'Гопломах', perk: 'Держи дистанцию: копьё бьёт на 2 клетки, +6 к защите',
    text: 'Копьё и греческая выучка. Работает из второго ряда через голову товарища.' },
  { icon: '⚔️', name: 'Димахер', perk: 'Вихрь: 25% шанс ударить второй раз, но −8 брони',
    text: 'Два клинка и ни щита. Либо убивает быстро, либо умирает быстро.' },
  { icon: '🏹', name: 'Сагиттарий', perk: 'Хладнокровие: +12% урона на дистанции, −10 здоровья',
    text: 'Лук и холодная голова. Держите его позади — вплотную он слаб.' },
  { icon: '🐾', name: 'Бестиарий', perk: 'Зверолов: +25% урона по псам и зверям',
    text: 'Специалист против зверей. Незаменим, когда на песок выходит свора.' },
  { icon: '🪨', name: 'Крупелларий', perk: 'Железный: −12% входящего урона, −2 ОД',
    text: 'Галльские латы с ног до головы. Медленный, но пробить его трудно.' },
  { icon: '🎯', name: 'Велит', perk: 'Первый удар в бою наносит +50% урона',
    text: 'Лёгкий и быстрый, с дротиками. Бьёт первым и отходит.' },
  { icon: '📣', name: 'Провокатор', perk: 'Вызов: +10% здоровья, враги чаще выбирают его целью',
    text: 'Средний щит и тяжёлый гладиус. Умеет выйти и заставить драться.' }
];

const HELP_DOGS = [
  { icon: '🐕‍🦺', name: 'Молосская морда', perk: 'Хватка: урон по корпусу +15%',
    text: 'Тяжёлая, медленная, очень больно кусает корпус.' },
  { icon: '🐕', name: 'Эпирский волкодав', perk: 'Толстая шкура: −10% входящего урона',
    text: 'Самый живучий пёс. Держит удар, пока хозяин работает.' },
  { icon: '🐶', name: 'Боевой мопс', perk: 'Юркий: +12 к уклонению',
    text: 'Дешёвый и вертлявый. Промахнуться по нему — обычное дело.' },
  { icon: '🐕‍🦺', name: 'Пастуший пёс', perk: 'Погоня: +1 клетка рывка',
    text: 'Быстро догоняет убегающих стрелков.' },
  { icon: '🐺', name: 'Ирландский волкодав', perk: 'Длинные лапы: бьёт на 2 клетки',
    text: 'Единственный пёс, который достаёт врага через клетку.' },
  { icon: '🐕‍🦺', name: 'Чёрный пёс Тартара', perk: 'Злоба: +10% урона при HP ниже 50%',
    text: 'Опасен именно тогда, когда кажется, что уже проиграл.' },
  { icon: '🐕', name: 'Римский боевой пёс', perk: 'Броня на груди: +6 защиты',
    text: 'Дорогой, но крепкий. Лучший выбор, если нужен надёжный второй ряд.' }
];

const HELP_FAQ = [
  { q: 'Почему боец не может ударить?',
    a: 'В бою бойцы двигаются сами, а бьёт только клик по врагу. Если удара нет — либо идёт ' +
       'перезарядка замаха (её видно полосой над бойцом), либо враг ещё далеко: копьё бьёт на ' +
       '2 клетки, лук — на 7, остальное — вплотную.' },
  { q: 'От чего зависит скорость удара?',
    a: 'База — 2 секунды в ближнем бою и 4 секунды на дистанции. Тяжёлое оружие замахивается ' +
       'дольше, ловкость и навыки скорости — быстрее (Быстрые руки → Скорость → Молния).' },
  { q: 'Боец потерял руку — это навсегда?',
    a: 'Да. Потерянную конечность нельзя вылечить, только компенсировать: наденьте лучшее оружие ' +
       'на оставшуюся руку и держите бойца во втором ряду.' },
  { q: 'Как быстро поднять деньги?',
    a: 'Невыносимая сложность платит в 1,6 раза больше. Ещё помогают сундуки и события в городе. ' +
       'Но не рискуйте последним бойцом: если отряд погиб и денег нет — игра закончена.' },
  { q: 'Снаряжение зависит от класса?',
    a: 'Нет. Всё снаряжение универсальное: любой боец может надеть любую вещь, если хватает ' +
       'характеристик. Класс даёт только бонусы к характеристикам и уникальную способность.' },
  { q: 'Можно ли дать бойцу щит и второй клинок сразу?',
    a: 'Нет. Левая рука держит либо щит, либо второй одноручный клинок. С парой клинков боец ' +
       'бьёт быстрее и чаще, но теряет защиту щита.' },
  { q: 'Можно ли купить псу снаряжение?',
    a: 'Нет. Псы выходят на песок без брони и оружия — только зубы и порода. Зато они дешёвые и ' +
       'быстро качаются.' },
  { q: 'Что будет, если отряд погиб, а денег нет?',
    a: 'Игра заканчивается. Проверка идёт после каждого боя: если в живых никого и не хватает даже ' +
       'на самого дешёвого наёмника или пса — наступает конец.' },
  { q: 'Как сменить сложность?',
    a: 'В Колизее арену выбрать нельзя — она выпадает случайно. Вы выбираете только сложность: ' +
       'низкую, среднюю или невыносимую.' },
  { q: 'Когда дают навыки?',
    a: 'Каждые три уровня боец выбирает один навык из трёх предложенных. Набор зависит от происхождения: ' +
       'легионер учится строю, браконьер — засадам, кузнец — тяжёлому удару.' },
  { q: 'Как переименовать или удалить сохранение?',
    a: 'В меню слотов (кнопка 💾 в шапке) у каждого слота есть удаление. Переименования нет: ' +
       'имя в слоте — это имя вашего первого гладиатора.' }
];

