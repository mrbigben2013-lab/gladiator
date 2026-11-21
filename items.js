// База данных экипировки, оружия и шаблонов врагов
const ITEMS_DB = [
    // === ГОЛОВА (Шлемы) ===
    { id: 'head_hood', name: 'Кожаный капюшон', slot: 'head', armor: 15, price: 45, style: 'hood', color: '#5c3c24', desc: 'Лёгкая защита от скользящих ударов.' },
    { id: 'head_cap', name: 'Железный шишак', slot: 'head', armor: 35, price: 110, style: 'cap', color: '#7d848c', desc: 'Простой кованый шлем пехотинца.' },
    { id: 'head_nasal', name: 'Норманнский шлем', slot: 'head', armor: 60, price: 210, style: 'nasal', color: '#8f969e', desc: 'Надёжный шлем с наносником.' },
    { id: 'head_murmillo', name: 'Шлем Мурмиллона', slot: 'head', armor: 95, price: 380, style: 'gladiator', color: '#b59445', desc: 'Тяжёлый гладиаторский шлем с гребнем и забралом.' },
    { id: 'head_greathelm', name: 'Топфхельм (Ведро)', slot: 'head', armor: 130, price: 560, style: 'greathelm', color: '#616870', desc: 'Глухой рыцарский шлем. Почти непробиваем.' },

    // === ТЕЛО (Броня) ===
    { id: 'body_tunic', name: 'Льняная туника', slot: 'body', armor: 10, price: 30, style: 'tunic', color: '#8c7a65', desc: 'Обычная одежда раба или новичка.' },
    { id: 'body_leather', name: 'Стеганый гамбезон', slot: 'body', armor: 35, price: 95, style: 'gambeson', color: '#6b472a', desc: 'Плотная многослойная куртка.' },
    { id: 'body_chain', name: 'Кольчужная рубаха', slot: 'body', armor: 75, price: 240, style: 'chainmail', color: '#7a828a', desc: 'Хорошо держит режущие удары мечей.' },
    { id: 'body_scale', name: 'Чешуйчатый панцирь', slot: 'body', armor: 115, price: 420, style: 'scale', color: '#9c7c38', desc: 'Бронзовые пластины, нашитые на кожу.' },
    { id: 'body_plate', name: 'Латная кираса', slot: 'body', armor: 165, price: 690, style: 'plate', color: '#9aa3ad', desc: 'Тяжёлая стальная броня чемпионов арены.' },

    // === РУКИ (Наручи и перчатки) ===
    { id: 'hands_wraps', name: 'Кожаные обмотки', slot: 'hands', armor: 8, price: 25, style: 'wraps', color: '#6e4c30', desc: 'Защищают костяшки и запястья.' },
    { id: 'hands_bracers', name: 'Клёпаные наручи', slot: 'hands', armor: 22, price: 75, style: 'bracers', color: '#543822', desc: 'Усилены железными полосами.' },
    { id: 'hands_manica', name: 'Гладиаторская маника', slot: 'hands', armor: 40, price: 160, style: 'manica', color: '#9e8240', desc: 'Сегментная защита руки из бронзы.' },
    { id: 'hands_gauntlets', name: 'Латные рукавицы', slot: 'hands', armor: 60, price: 260, style: 'gauntlets', color: '#8b939c', desc: 'Полная стальная защита кистей и предплечий.' },

    // === НОГИ (Поножи и обувь) ===
    { id: 'legs_sandals', name: 'Кожаные сандалии', slot: 'legs', armor: 8, price: 25, style: 'sandals', color: '#5c3c24', desc: 'Лёгкая обувь для песка арены.' },
    { id: 'legs_boots', name: 'Укреплённые сапоги', slot: 'legs', armor: 22, price: 80, style: 'boots', color: '#452c19', desc: 'Плотная кожа с металлическими накладками.' },
    { id: 'legs_greaves', name: 'Бронзовые поножи', slot: 'legs', armor: 42, price: 170, style: 'greaves', color: '#b08f43', desc: 'Классическая защита голеней гладиатора.' },
    { id: 'legs_plate', name: 'Латные наголенники', slot: 'legs', armor: 65, price: 280, style: 'plate_legs', color: '#828a94', desc: 'Тяжёлые стальные щитки на ноги.' },

    // === ЩИТЫ ===
    { id: 'shield_buckler', name: 'Кулачный баклер', slot: 'shield', armor: 20, defBonus: 10, price: 65, style: 'buckler', color: '#788087', desc: '+10% к защите в ближнем бою.' },
    { id: 'shield_round', name: 'Деревянный круглый щит', slot: 'shield', armor: 45, defBonus: 18, price: 140, style: 'round', color: '#7a4b26', desc: '+18% к защите. Надёжный щит пехотинца.' },
    { id: 'shield_scutum', name: 'Римский скутум', slot: 'shield', armor: 80, defBonus: 28, price: 310, style: 'scutum', color: '#8f2424', desc: '+28% к защите. Огромный ростовой щит.' },

    // === ОРУЖИЕ: МЕЧИ ===
    { id: 'wpn_gladius', name: 'Римский гладиус', slot: 'weapon', wType: 'sword', minDmg: 18, maxDmg: 28, armorPen: 0.25, range: 1, twoHanded: false, price: 95, color: '#b5bdc4', desc: 'Короткий колющий меч. Быстрый и точный.' },
    { id: 'wpn_arming', name: 'Рыцарский меч', slot: 'weapon', wType: 'sword', minDmg: 26, maxDmg: 38, armorPen: 0.30, range: 1, twoHanded: false, price: 210, color: '#cbd2d9', desc: 'Сбалансированный одноручный клинок.' },
    { id: 'wpn_greatsword', name: 'Двуручный цвайхандер', slot: 'weapon', wType: 'sword', minDmg: 45, maxDmg: 68, armorPen: 0.40, range: 1, twoHanded: true, price: 460, color: '#dce3eb', desc: 'Огромный двуручный меч. Нельзя носить со щитом.' },

    // === ОРУЖИЕ: ТОПОРЫ ===
    { id: 'wpn_handaxe', name: 'Боевой топор', slot: 'weapon', wType: 'axe', minDmg: 22, maxDmg: 36, armorPen: 0.45, range: 1, twoHanded: false, price: 120, color: '#8a9299', desc: 'Хорошо рубит щиты и среднюю броню.' },
    { id: 'wpn_greataxe', name: 'Секира палача', slot: 'weapon', wType: 'axe', minDmg: 52, maxDmg: 76, armorPen: 0.55, range: 1, twoHanded: true, price: 490, color: '#9ca5ad', desc: 'Двуручная секира чудовищной силы.' },

    // === ОРУЖИЕ: МОЛОТЫ И БУЛАВЫ ===
    { id: 'wpn_mace', name: 'Шипастая булава', slot: 'weapon', wType: 'hammer', minDmg: 20, maxDmg: 32, armorPen: 0.70, range: 1, twoHanded: false, price: 145, color: '#6c737a', desc: 'Проминает латы (70% пробития брони).' },
    { id: 'wpn_warhammer', name: 'Двуручный боевой молот', slot: 'weapon', wType: 'hammer', minDmg: 44, maxDmg: 65, armorPen: 0.85, range: 1, twoHanded: true, price: 510, color: '#5b6269', desc: 'Крушит любую броню (85% пробития).' },

    // === ОРУЖИЕ: КОПЬЯ ===
    { id: 'wpn_spear', name: 'Боевое копьё', slot: 'weapon', wType: 'spear', minDmg: 20, maxDmg: 30, armorPen: 0.35, range: 2, twoHanded: false, price: 130, color: '#967249', desc: 'Бьёт на 2 клетки! Можно держать со щитом.' },
    { id: 'wpn_pike', name: 'Алебарда стражника', slot: 'weapon', wType: 'spear', minDmg: 38, maxDmg: 56, armorPen: 0.50, range: 2, twoHanded: true, price: 390, color: '#a8b0b8', desc: 'Двуручное древковое оружие (дальность 2).' },

    // === ОРУЖИЕ: ЛУКИ И АРБАЛЕТЫ ===
    { id: 'wpn_shortbow', name: 'Охотничий лук', slot: 'weapon', wType: 'bow', minDmg: 18, maxDmg: 29, armorPen: 0.25, range: 6, twoHanded: true, price: 135, color: '#8c5e32', desc: 'Стреляет через всю арену (дальность 6).' },
    { id: 'wpn_warbow', name: 'Тяжёлый боевой лук', slot: 'weapon', wType: 'bow', minDmg: 30, maxDmg: 46, armorPen: 0.35, range: 7, twoHanded: true, price: 340, color: '#6e4520', desc: 'Мощный лук с высокой дальностью (7 клеток).' },
    { id: 'wpn_crossbow', name: 'Лёгкий арбалет', slot: 'weapon', wType: 'crossbow', minDmg: 34, maxDmg: 48, armorPen: 0.60, range: 6, twoHanded: true, price: 320, color: '#59422e', desc: 'Высокое пробитие брони болтами (60%).' },
    { id: 'wpn_heavy_xbow', name: 'Осадный арбалет', slot: 'weapon', wType: 'crossbow', minDmg: 50, maxDmg: 72, armorPen: 0.75, range: 7, twoHanded: true, price: 620, color: '#3d2d20', desc: 'Пробивает рыцарей навылет (75% пробития).' }
];

// Генератор случайных имён и предысторий
const FIRST_NAMES = ['Марк', 'Луций', 'Красс', 'Ганник', 'Спартак', 'Крикс', 'Варрон', 'Тит', 'Брут', 'Кассий', 'Флавий', 'Децим', 'Аврелий', 'Руфус', 'Драго', 'Ульф', 'Торвальд', 'Гуннар'];
const TITLES = ['Железный', 'Хромой', 'Бешеный', 'Кровавый', 'Молчаливый', 'Бык', 'Ворон', 'Палач', 'Щитолом', 'Счастливчик', 'Серый', 'Медведь'];

const SKIN_TONES = ['#e0b18c', '#c9946b', '#ad764e', '#f0c8a8', '#8c5a38'];
const HAIR_COLORS = ['#2b1d12', '#59381e', '#8c6239', '#b89758', '#6e6e6e', '#7a291d'];

function getItemById(id) {
    return ITEMS_DB.find(i => i.id === id) || null;
}

function generateGladiator(level = 1) {
    const name = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} «${TITLES[Math.floor(Math.random() * TITLES.length)]}»`;
    const hpBase = 65 + Math.floor(Math.random() * 25) + (level - 1) * 12;
    return {
        uid: 'glad_' + Math.random().toString(36).substr(2, 9),
        name: name,
        level: level,
        xp: 0,
        statPoints: 0,
        hp: hpBase,
        maxHp: hpBase,
        matk: 52 + Math.floor(Math.random() * 14) + (level - 1) * 4, // Ближний бой
        ratk: 48 + Math.floor(Math.random() * 16) + (level - 1) * 4, // Дальний бой
        mdef: 8 + Math.floor(Math.random() * 10) + (level - 1) * 3,  // Защита
        price: 90 + level * 60 + Math.floor(Math.random() * 40),
        appearance: {
            skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
            hair: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
            beard: Math.random() > 0.35
        },
        equip: {
            head: null,
            body: 'body_tunic',
            hands: null,
            legs: 'legs_sandals',
            weapon: null,
            shield: null
        }
    };
}
