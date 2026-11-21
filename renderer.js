// ==================== ОТРИСОВКА ГЛАДИАТОРОВ ====================
// Стиль Swords & Sandals: крупная голова, толстые конечности, жирный контур,
// два тона на объём. Всё векторно. Конечности можно потерять — они исчезают.

const OUTLINE = '#1b1410';
const BLOOD = '#8e1b12';
const BLOOD_DARK = '#5c0f0a';

function shade(hex, amt) {
  if (!hex) hex = '#888888';
  if (hex[0] !== '#') return hex;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  }
  return `rgb(${r},${g},${b})`;
}

// Полупрозрачный оттенок того же цвета. Нужен для контуров кожи:
// сплошная тёмная линия читается как шов между частями тела, а мягкая
// полупрозрачная тень — как естественный край объёма.
function shadeA(hex, amt, alpha) {
  if (!hex || hex[0] !== '#') return hex;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r = r + (255 - r) * amt;
    g = g + (255 - g) * amt;
    b = b + (255 - b) * amt;
  } else {
    r = r * (1 + amt);
    g = g * (1 + amt);
    b = b * (1 + amt);
  }
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// Конечность как единая форма: осевая линия плюс профиль толщины.
// Два отдельных отрезка с круглым суставом посередине читались как
// сочленённая трубка. Живая рука — это один плавный силуэт, который
// расширяется у плеча и сужается к запястью.
function limbShape(ctx, pts, widths, color) {
  // Уплотнение профиля: между заданными точками вставляем промежуточные
  // по сплайну Catmull-Rom. Форма остаётся того же объёма, но контур
  // идёт плавно — без изломов на локте и колене.
  const dense = (p, w) => {
    const op = [], ow = [];
    const catmull = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[Math.min(p.length - 1, i + 2)];
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        op.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
        ow.push(w[i] + (w[i + 1] - w[i]) * t);
      }
    }
    op.push(p[p.length - 1]);
    ow.push(w[w.length - 1]);
    return [op, ow];
  };
  const res = dense(pts, widths);
  pts = res[0];
  widths = res[1];

  const n = pts.length;
  if (n < 2) return;

  // Нормали к осевой линии в каждой точке
  const norm = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    norm.push([-dy, dx]);
  }

  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const w = widths[i] / 2;
    left.push([pts[i][0] + norm[i][0] * w, pts[i][1] + norm[i][1] * w]);
    right.push([pts[i][0] - norm[i][0] * w, pts[i][1] - norm[i][1] * w]);
  }

  const path = () => {
    ctx.beginPath();
    // Точки уже лежат на сплайне, поэтому обычный lineTo даёт гладкий
    // контур: мелкий шаг сглаживает изломы, не срезая объём.
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
    // Скругление на дальнем конце
    const endW = widths[n - 1] / 2;
    const ang = Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]);
    ctx.arc(pts[n - 1][0], pts[n - 1][1], endW, ang - Math.PI / 2, ang + Math.PI / 2, false);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    // Проксимальный конец скругляем, но радиусом меньше половины ширины:
    // полный полукруг вылезал за плечо и читался тёмным блоком.
    const startW = widths[0] * 0.34;
    const ang2 = Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]);
    ctx.arc(pts[0][0], pts[0][1], startW, ang2 - Math.PI / 2, ang2 + Math.PI / 2, false);
    ctx.closePath();
  };

  path();
  ctx.fillStyle = color;
  ctx.fill();
  // Мультяшный контур: сплошная тёмная линия по всему силуэту.
  // Именно она, а не толщина, читается как «рисованный персонаж»:
  // фигура отделяется от фона и от соседних частей тела.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(2.6, widths[0] * 0.18);
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Объём: два слоя. Первый — поперёк оси (свет сверху-слева), второй —
  // вдоль оси с затемнением к запястью. Один слабый слой давал плоскую
  // «наклейку» вместо руки.
  ctx.save();
  path();
  ctx.clip();
  const gx = pts[0][0], gy = pts[0][1];
  const grad = ctx.createLinearGradient(
    gx + norm[0][0] * widths[0] * 0.55, gy + norm[0][1] * widths[0] * 0.55,
    gx - norm[0][0] * widths[0] * 0.55, gy - norm[0][1] * widths[0] * 0.55);
  grad.addColorStop(0, 'rgba(255,248,236,0.22)');
  grad.addColorStop(0.34, 'rgba(255,248,236,0.05)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(44,24,12,0.34)');
  ctx.fillStyle = grad;
  const bb = 120;
  ctx.fillRect(gx - bb, gy - bb, bb * 2, bb * 2);

  // Продольная тень: у плеча кожа светлее, к кисти темнее — так рука
  // читается как объём, уходящий вглубь.
  const tip = pts[n - 1];
  const along = ctx.createLinearGradient(gx, gy, tip[0], tip[1]);
  along.addColorStop(0, 'rgba(255,250,240,0.10)');
  along.addColorStop(0.55, 'rgba(255,255,255,0)');
  along.addColorStop(1, 'rgba(60,32,16,0.18)');
  ctx.fillStyle = along;
  ctx.fillRect(gx - bb, gy - bb, bb * 2, bb * 2);
  ctx.restore();
}

function limb(ctx, x1, y1, x2, y2, w, color) {
  // Контур тонкий и пропорциональный толщине: раньше он был постоянным
  // (+4.5), из-за чего тонкие руки выглядели обведёнными маркером.
  ctx.strokeStyle = shade(color, -0.62);
  ctx.lineWidth = w + Math.max(1.6, w * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Мягкий объём: светлая полоса вдоль верхней части конечности
  ctx.strokeStyle = 'rgba(255,246,232,0.09)';
  ctx.lineWidth = Math.max(1, w * 0.26);
  ctx.beginPath();
  ctx.moveTo(x1 + w * 0.16, y1 - w * 0.18);
  ctx.lineTo(x2 + w * 0.16, y2 - w * 0.18);
  ctx.stroke();
}

// Рука из двух сегментов: плечо толще, предплечье тоньше, локоть —
// сустав, а не место стыка двух линий. Так рука читается как рука,
// а не как гнущаяся труба.
function drawArmAnatomy(ctx, ex, ey, hx, hy, w, color, side) {
  const s = side || 1;
  const upperW = w;
  const foreW = w * 0.78;
  const elbowX = ex * 0.52;
  const elbowY = ey * 0.52;

  // Плечо
  limb(ctx, 0, 0, elbowX, elbowY, upperW, color);
  // Предплечье
  limb(ctx, elbowX, elbowY, ex, ey, foreW, color);

  // Локоть: небольшой сустав с тенью
  ctx.fillStyle = shade(color, -0.06);
  ctx.beginPath();
  ctx.ellipse(elbowX, elbowY, foreW * 0.52, foreW * 0.46,
    Math.atan2(ey - 0, ex - 0), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Кисть: ладонь с четырьмя согнутыми пальцами
  const handAng = Math.atan2(hy - ey, hx - ex);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(handAng);
  const hw = foreW * 0.60;
  ctx.beginPath();
  ctx.ellipse(0, 0, hw, hw * 0.92, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(color, 0.04);
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = 1.1;
  ctx.stroke();
  // Пальцы: короткие дуги поперёк ладони
  ctx.strokeStyle = shade(color, -0.34);
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 3; i++) {
    const t = -0.42 + i * 0.42;
    ctx.beginPath();
    ctx.moveTo(hw * 0.20, t * hw);
    ctx.quadraticCurveTo(hw * 0.72, t * hw * 1.1, hw * 0.86, t * hw * 1.3);
    ctx.stroke();
  }
  // Большой палец
  ctx.beginPath();
  ctx.moveTo(-hw * 0.2, -hw * 0.55);
  ctx.quadraticCurveTo(hw * 0.28, -hw * 0.92, hw * 0.55, -hw * 0.42);
  ctx.stroke();
  ctx.restore();
}

const BUILD_W = { slim: 0.84, normal: 1, muscular: 1.1, heavy: 1.22 };

// ==================== КИСТЬ-КУЛАК ====================
// Кисть рисуется сжатым кулаком: округлая масса ладони, гребень
// согнутых пальцев с тыльной стороны и большой палец, лежащий поперёк.
// Отдельные пальцы не рисуем — в этом масштабе они превращаются в
// частокол штрихов и читаются хуже, чем один плотный кулак.
// dir = 1 — правая рука, -1 — левая. rot — поворот кисти.
function drawHand(ctx, hx, hy, armW, color, dir, rot) {
  const s = dir || 1;
  // Пропорции живого кулака: он не круглый шар, а слегка вытянутый
  // по вертикали блок — ширина примерно равна длине ладони, а высота
  // чуть больше за счёт согнутых пальцев.
  const R = armW * 0.50;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate((rot == null ? 0 : rot) + 0.10 * s);

  // --- Масса кулака: скошенный сверху блок, а не окружность.
  // Верхняя грань плоская (костяшки), низ округлый (основание ладони).
  const fistPath = () => {
    ctx.beginPath();
    ctx.moveTo(-R * 0.86, R * 0.44);
    ctx.quadraticCurveTo(-R * 1.04, -R * 0.06, -R * 0.94, -R * 0.60);
    // Плоская верхняя грань с мягкими углами
    ctx.quadraticCurveTo(-R * 0.86, -R * 0.94, -R * 0.36, -R * 0.98);
    ctx.lineTo(R * 0.44, -R * 0.96);
    ctx.quadraticCurveTo(R * 0.90, -R * 0.90, R * 0.98, -R * 0.52);
    ctx.quadraticCurveTo(R * 1.06, R * 0.04, R * 0.86, R * 0.48);
    ctx.quadraticCurveTo(R * 0.56, R * 0.94, 0, R * 0.94);
    ctx.quadraticCurveTo(-R * 0.60, R * 0.92, -R * 0.86, R * 0.44);
    ctx.closePath();
  };

  fistPath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = shadeA(color, -0.55, 0.40);
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Объём: свет сверху-слева, тень снизу-справа
  ctx.save();
  fistPath();
  ctx.clip();
  const pg = ctx.createLinearGradient(-R * 0.8, -R, R * 0.9, R);
  pg.addColorStop(0, 'rgba(255,250,242,0.30)');
  pg.addColorStop(0.40, 'rgba(255,255,255,0)');
  pg.addColorStop(1, 'rgba(44,24,12,0.36)');
  ctx.fillStyle = pg;
  ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);

  // --- Пальцы: четыре вертикальные канавки на лицевой стороне кулака.
  // Именно они читаются как сжатые пальцы; горизонтальные штрихи давали
  // «исцарапанный шар».
  const fingers = 4;
  const topY = -R * 0.92;
  const botY = R * 0.66;
  for (let i = 1; i < fingers; i++) {
    const fx = -R * 0.74 + (i * R * 1.52) / fingers;
    // Тень в борозде — мягкая, чтобы кулак не выглядел рубленым
    ctx.strokeStyle = shadeA(color, -0.55, 0.20);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(fx, topY + R * 0.20);
    ctx.quadraticCurveTo(fx + R * 0.04, R * 0.02, fx, botY - R * 0.16);
    ctx.stroke();
    // Свет на гребне пальца рядом с бороздой
    ctx.strokeStyle = 'rgba(255,250,242,0.13)';
    ctx.lineWidth = R * 0.14;
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.17, topY + R * 0.24);
    ctx.quadraticCurveTo(fx + R * 0.21, R * 0.02, fx + R * 0.17, botY - R * 0.20);
    ctx.stroke();
  }

  // --- Костяшки: плоский светлый гребень по верхней грани
  ctx.strokeStyle = 'rgba(255,250,242,0.28)';
  ctx.lineWidth = R * 0.14;
  ctx.beginPath();
  ctx.moveTo(-R * 0.62, -R * 0.84);
  ctx.quadraticCurveTo(0, -R * 0.90, R * 0.62, -R * 0.82);
  ctx.stroke();
  // Тень под костяшками — отделяет их от пальцев
  ctx.strokeStyle = shadeA(color, -0.5, 0.22);
  ctx.lineWidth = R * 0.08;
  ctx.beginPath();
  ctx.moveTo(-R * 0.66, -R * 0.66);
  ctx.quadraticCurveTo(0, -R * 0.72, R * 0.66, -R * 0.64);
  ctx.stroke();
  ctx.restore();

  // --- Большой палец не рисуем отдельно: в этом масштабе он читался
  // как нарост сбоку кулака. Масса кулака и борозды пальцев уже дают
  // нужное впечатление сжатой кисти.
  ctx.restore();
}

// Состояние конечностей: { hp, max, lost }
function limbState(glad, id) {
  const L = glad.limbs && glad.limbs[id];
  if (!L) return { hp: 100, max: 100, lost: false, ratio: 1 };
  return {
    hp: L.hp,
    max: L.max || 100,
    lost: !!L.lost,
    ratio: L.lost ? 0 : Math.max(0, L.hp / Math.max(1, L.max))
  };
}

// ==================== ГЛАВНАЯ ФУНКЦИЯ ====================
function drawBattleBrother(ctx, glad, x, y, scale = 1, facing = 1, anim = {}) {
  const a = {
    swing: anim.swing || 0,
    block: anim.block || 0,
    dodge: anim.dodge || 0,
    hurt: anim.hurt || 0,
    glow: anim.glow || 0,
    alpha: anim.alpha == null ? 1 : anim.alpha,
    lunge: anim.lunge || 0,
    walk: anim.walk || 0,
    walkPhase: anim.walkPhase || 0,
    dead: anim.dead || 0,
    victory: anim.victory || 0,
    crouch: anim.crouch || 0,
    blood: anim.blood || 0,
    breath: anim.breath == null ? 1 : anim.breath,
    emotion: anim.emotion || null,
    emotionT: anim.emotionT == null ? 1 : anim.emotionT,
    aura: anim.aura || null,
    aim: anim.aim || 0
  };

  // Псы рисуются отдельной функцией — у них другая анатомия
  if (glad.isDog) {
    drawBattleDog(ctx, glad, x, y, scale, facing, a);
    return;
  }

  // Живое дыхание и покачивание: работает даже когда боец стоит на месте
  const now = performance.now() / 1000;
  const seed = (glad.id || 'x').length * 0.73;
  const alive = 1 - a.dead;
  const breathAmt = a.breath * alive;
  const breathY = Math.sin(now * 1.75 + seed) * 1.7 * breathAmt;
  const breathS = 1 + Math.sin(now * 1.75 + seed) * 0.008 * breathAmt;
  const swayRot = Math.sin(now * 0.95 + seed * 1.7) * 0.014 * breathAmt;
  const headBob = Math.sin(now * 1.75 + seed + 0.6) * 0.9 * breathAmt;

  // Вертикальное покачивание корпуса при ходьбе: два шага за цикл,
  // максимум подъёма — когда ноги вместе.
  const walkCycle = a.walkPhase;
  const walkBob = -Math.abs(Math.sin(walkCycle)) * 2.4 * a.walk * alive;
  const walkLean = a.walk * 1.6;

  const eq = glad.equip || {};
  const female = glad.gender === 'female';
  const skin = glad.skinColor || '#f0b183';
  const skinDark = shade(skin, -0.2);
  const bw = BUILD_W[glad.build] || 1;
  // Плечи ≈ 1.5 ширины головы у мужчин и 1.35 у женщин — это уже
  // стилизованная пропорция: фигура держит крупную голову, а не
  // выглядит насаженной на палку. Талия уже плеч на треть.
  const shoulder = (female ? 25.5 : 30) * bw * breathS;
  // У женщин талия уже, а бёдра заметно шире плеч — силуэт «песочные
  // часы». Мужская фигура почти прямая, бёдра чуть шире талии.
  const waist = (female ? 13.5 : 17) * bw;
  // Голова — около 1/3.4 роста: мультяшная, крупная, с читаемым лицом.
  // Лаконичный стиль держится на трёх вещах: крупная голова, простые
  // крупные формы тела и единый жирный контур. Мелкая детализация в
  // этом масштабе только шумит, поэтому её сознательно немного.
  const headR = female ? 22.4 : 23.4;

  const legL = limbState(glad, 'legL');
  const legR = limbState(glad, 'legR');
  const armL = limbState(glad, 'armL');
  const armR = limbState(glad, 'armR');
  const headS = limbState(glad, 'head');

  ctx.save();
  ctx.globalAlpha = a.alpha;

  // --- Тень ---
  ctx.save();
  ctx.globalAlpha = 0.3 * a.alpha;
  ctx.fillStyle = '#0a0705';
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * scale, 42 * scale, 13 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- Аура активного бойца ---
  if (a.glow > 0.01) {
    const g = ctx.createRadialGradient(x, y - 62 * scale, 5, x, y - 62 * scale, 95 * scale);
    g.addColorStop(0, `rgba(255,214,110,${0.28 * a.glow})`);
    g.addColorStop(1, 'rgba(255,214,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - 56 * scale, 92 * scale, 108 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Аура босса: собственный цвет, живая пульсация ---
  if (a.aura) {
    const p = 0.55 + 0.45 * Math.sin(now * 2.6 + seed);
    const g = ctx.createRadialGradient(x, y - 70 * scale, 6, x, y - 70 * scale, 118 * scale);
    g.addColorStop(0, hexA(a.aura, 0.26 + p * 0.16));
    g.addColorStop(0.55, hexA(a.aura, 0.10 + p * 0.06));
    g.addColorStop(1, hexA(a.aura, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - 64 * scale, 112 * scale, 132 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Восходящие искры
    for (let i = 0; i < 5; i++) {
      const t = (now * 0.45 + i * 0.2) % 1;
      const sx = x + Math.sin(now * 1.1 + i * 2.1) * 26 * scale;
      const sy = y - (10 + t * 150) * scale;
      ctx.globalAlpha = (1 - t) * 0.55 * a.alpha;
      ctx.fillStyle = a.aura;
      ctx.beginPath();
      ctx.arc(sx, sy, (1.6 + (1 - t) * 1.6) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = a.alpha;
  }

  // --- Падение ---
  const deathRot = a.dead * 1.35;
  ctx.translate(x, y + (breathY + walkBob) * scale);
  if (a.dead > 0) {
    ctx.rotate(deathRot * facing);
    ctx.translate(0, a.dead * 10);
  }
  ctx.rotate(a.dodge * 0.14 * facing + swayRot * alive);
  ctx.scale(scale * facing * breathS, scale * breathS);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const lean = a.lunge * 5 + walkLean;
  const crouch = a.crouch * 6;
  // Пропорции скелета. Раньше таз стоял на -32, а голова на -108 при
  // радиусе 26.5: рост выходил ~127 единиц при голове в 53 — меньше
  // трёх голов, отсюда и «фигурка». Теперь ноги длиннее торса,
  // голова ~1/5 роста — как у stylized-realistic персонажа.
  // Мультяшный сдвиг: ноги короче, голова крупнее (~1/4.5 роста).
  // Фигура сразу читается как персонаж, а не как манекен, и позы
  // (замах, блок, уклон) видны на силуэте с первого взгляда.
  const hipY = -68 + crouch;
  const footY = -5;
  // Шея видна примерно на 7 единиц — половина радиуса головы.
  // Подбородок при этом слегка перекрывает её сверху.
  const headY = hipY - 50 - headR * 1.02;

  // ============ НОГИ ============
  const legColor = eq.legs ? eq.legs.color : skin;
  const stepAmp = a.walk * 9;
  const liftAmp = a.walk * 5.5;

  // Бёдра выводятся из низа торса, а не задаются отдельными числами:
  // раньше ноги были шире таза и торчали по бокам. Теперь внешний край
  // бедра совпадает с краем торса, стык идёт ровно.
  const hipOuter = female ? waist * 1.52 : waist * 1.20;
  const hipHalf = hipOuter * 0.45;
  // 1.46 — коэффициент толщины бедра в drawLegSegmented
  const legW = Math.max(9, (hipOuter - hipHalf) * 2 / 1.46 * 1.32);

  // Фазы ног: противоположные. sin — горизонталь, cos>0 — фаза переноса.
  const phaseL = walkCycle + Math.PI;
  const phaseR = walkCycle;

  const footLX = -hipHalf + Math.sin(phaseL) * stepAmp;
  const footRX = hipHalf + Math.sin(phaseR) * stepAmp;
  const liftL = Math.max(0, Math.cos(phaseL)) * liftAmp;
  const liftR = Math.max(0, Math.cos(phaseR)) * liftAmp;

  const geomL = { hipX: -hipHalf, hipY, footX: footLX, footY: footY - liftL, lift: liftL / Math.max(1, liftAmp || 1), lost: legL.lost };
  const geomR = { hipX: hipHalf, hipY, footX: footRX, footY: footY - liftR, lift: liftR / Math.max(1, liftAmp || 1), lost: legR.lost };

  if (!legL.lost) drawLegSegmented(ctx, geomL, legW, legColor);
  else drawStump(ctx, -hipHalf, hipY, legW, legColor, 'down');
  if (!legR.lost) drawLegSegmented(ctx, geomR, legW, legColor);
  else drawStump(ctx, hipHalf, hipY, legW, legColor, 'down');
  drawLegArmorNew(ctx, eq.legs, legColor, [geomL, geomR]);

  // --- Дальняя рука: расчёт позы ---
  // При ходьбе рука качается в противофазе ноге.
  // Оружие живёт своей жизнью: оно тяжелее кисти, поэтому отстаёт по фазе
  // (маятник) и догоняет руку с задержкой после размаха.
  const armWalkR = a.walk * Math.sin(walkCycle + Math.PI) * 0.42;
  const armWalkL = a.walk * Math.sin(walkCycle) * 0.34;

  // Сглаженное состояние снаряжения: переживает кадры, поэтому инерция
  // выглядит как настоящая, а не как телепорт угла.
  if (!glad._gear) glad._gear = { wpnLag: 0, wpnPrev: 0, shdLag: 0, shdPrev: 0, carry: 0 };
  const gear = glad._gear;
  const wpnMass = eq.weapon ? (eq.weapon.cat === 'polearm' || eq.weapon.cat === 'axe' ? 1.35 : 1) : 1;
  const shdMass = eq.offhand ? (eq.offhand.defBonus > 12 ? 1.5 : 1.05) : 1;

  // Инерция от размаха: чем быстрее рука рвётся вперёд, тем сильнее
  // оружие отстаёт, а затем догоняет с перелётом.
  const swingDelta = a.swing - gear.wpnPrev;
  gear.wpnPrev = a.swing;
  const blockDelta = a.block - gear.shdPrev;
  gear.shdPrev = a.block;

  gear.wpnLag = gear.wpnLag * 0.68 - swingDelta * 1.5 * wpnMass + (a.walk * 0.02);
  gear.wpnLag = clamp ? clamp(gear.wpnLag, -0.55, 0.75) : Math.max(-0.55, Math.min(0.75, gear.wpnLag));
  gear.shdLag = gear.shdLag * 0.7 - blockDelta * 1.1 * shdMass;
  gear.shdLag = Math.max(-0.4, Math.min(0.5, gear.shdLag));

  // Походный хват: оружие остриём вперёд (по направлению взгляда).
  // carry — доля (0..1) от походного угла: на месте боец держит клинок
  // вертикально, на ходу плавно переводит его вперёд.
  gear.carry = gear.carry + (a.walk - gear.carry) * 0.16;

  // Маятник при ходьбе: кисть уже ушла, клинок ещё догоняет
  const wpnWalkLag = a.walk * (Math.sin(walkCycle + Math.PI - 0.62) - Math.sin(walkCycle + Math.PI)) * 0.42;
  const shdWalkLag = a.walk * (Math.sin(walkCycle - 0.75) - Math.sin(walkCycle)) * 0.3;

  // Лучник не машет луком как мечом: рука вытянута вперёд и держит лук
  // вертикально. Иначе на замахе лук уезжает за корпус и пропадает.
  const wVis = eq.weapon ? (eq.weapon.vis || WEAPON_VIS[eq.weapon.shape] || WEAPON_VIS.gladius) : null;
  const isBowUnit = !!(wVis && wVis.head === 'bow');
  // Копьё, трезубец и алебарда — не рубящее оружие: ими колют.
  const isSpearUnit = !!(wVis && (wVis.head === 'spear' || wVis.head === 'trident' || wVis.head === 'halberd'));
  const swingAngle = isBowUnit
    ? (-0.98 + a.swing * 0.26 - a.victory * 0.35 + armWalkR * 0.4)
    : isSpearUnit
      // Укол: рука выносится вперёд почти горизонтально и дожимается
      // на выпаде. Никакого замаха над головой — древко остаётся
      // на линии боя.
      ? (-0.95 - a.swing * 0.5 + a.victory * 0.4 + armWalkR * 0.5)
      : (0.3 - a.swing * 1.6 + a.victory * 1.9 + armWalkR);
  // Победа: боец вскидывает правую руку вверх, приветствуя толпу.
  // Раньше вклад victory просто прибавлялся к боевому углу (до +1.9),
  // и кисть уезжала за голову — читалось как вывих плеча. Теперь у
  // победы своя целевая поза: рука поднята вверх-вперёд под 30° от
  // вертикали, поэтому кисть проходит впереди головы и не заходит
  // за силуэт.
  const VICTORY_ARM_ANGLE = -2.1;
  const armAngle = swingAngle + (VICTORY_ARM_ANGLE - swingAngle) * a.victory;
  // Положение кисти в системе тела — по нему ставим лук.
  // Отрубленной рукой лук не удержать. Кисть живёт в точке (18, 41)
  // относительно плечевого сустава (см. отрисовку руки).
  const bowHand = (isBowUnit && !armR.lost) ? {
    x: shoulder * 0.80 + 16.4 * Math.cos(armAngle) - 49 * Math.sin(armAngle),
    y: hipY - 44 + 16.4 * Math.sin(armAngle) + 49 * Math.cos(armAngle)
  } : null;

  // Древковое оружие рисуем ДО корпуса: боец держит копьё за середину,
  // поэтому комель уходит назад и скрывается за телом, а не режет грудь.
  // Кисть и предплечье рисуются позже, поверх древка.
  if (isSpearUnit && eq.weapon && !armR.lost) {
    ctx.save();
    ctx.translate(lean, 0);
    ctx.translate(shoulder * 0.80, hipY - 44);
    ctx.rotate(armAngle);
    ctx.translate(16.4, 49);
    // То же уменьшение, что и у оружия в кисти: иначе копьё/алебарда
    // перекрывали пол-арены.
    ctx.scale(WEAPON_HAND_SCALE, WEAPON_HAND_SCALE);
    const shaftLen = wVis.len || 94;
    // В модели древко идёт от y=34 (комель) до y=-len (острие),
    // значит середина — посередине этого отрезка.
    const shaftMidY = (34 - shaftLen) / 2;
    const thrust = a.swing || 0;
    // Почти горизонталь: остриё вперёд и чуть вверх, комель — вниз-назад.
    const worldAngle = Math.PI * 0.5 - 0.16 + thrust * 0.05 + gear.wpnLag * 0.06;
    ctx.rotate(worldAngle - armAngle);
    // Середину древка совмещаем с кистью, а не рукоять.
    ctx.translate(-12, -shaftMidY);
    // Укол: древко проезжает вперёд сквозь кисть (в модели «вперёд» = -y).
    ctx.translate(0, -(thrust * 24));
    drawWeapon(ctx, eq.weapon);
    ctx.restore();
  }

  // ============ ШЕЯ ============
  // Шея рисуется ДО торса: её основание уходит под воротник, поэтому
  // она не залезает на текстуру одежды. Цвет — тот же, что у тела;
  // объём даёт градиент, а не другой оттенок.
  if (!headS.lost) {
    const neckHalf = female ? 5.2 : 6.2;
    const chinY = headY + headR * 1.02;
    const neckTopY = chinY + 1.2;
    const neckBaseY = hipY - 40;
    ctx.save();
    ctx.translate(lean, 0);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-neckHalf * 1.16, neckBaseY);
    ctx.quadraticCurveTo(-neckHalf * 1.10, neckTopY + 4, -neckHalf * 0.92, neckTopY - 1);
    ctx.quadraticCurveTo(0, neckTopY - 2.6, neckHalf * 0.92, neckTopY - 1);
    ctx.quadraticCurveTo(neckHalf * 1.10, neckTopY + 4, neckHalf * 1.16, neckBaseY);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.clip();
    const ng = ctx.createLinearGradient(-neckHalf, 0, neckHalf, 0);
    ng.addColorStop(0, 'rgba(255,246,232,0.16)');
    ng.addColorStop(0.45, 'rgba(255,255,255,0)');
    ng.addColorStop(1, 'rgba(48,26,14,0.26)');
    ctx.fillStyle = ng;
    ctx.fillRect(-neckHalf * 2, neckTopY - 8, neckHalf * 4, neckBaseY - neckTopY + 16);
    const jg = ctx.createLinearGradient(0, neckTopY - 2, 0, neckTopY + 8);
    jg.addColorStop(0, 'rgba(44,20,10,0.5)');
    jg.addColorStop(1, 'rgba(44,20,10,0)');
    ctx.fillStyle = jg;
    ctx.fillRect(-neckHalf * 2, neckTopY - 2, neckHalf * 4, 10);
    ctx.restore();
    ctx.restore();
  } else {
    drawStump(ctx, 0, hipY - 45, female ? 9 : 11, skin, 'up');
  }

  // ============ ТОРС ============
  const bodyColor = eq.body ? eq.body.color : skin;
  ctx.save();
  ctx.translate(lean, 0);

  // Торс строим по анатомии: трапеции от шеи к плечам, дельтовидные
  // скругления, сужение к талии, затем подвздошные кости. Прежний
  // «колокол» с жирной обводкой и был главным источником мультяшности.
  const topY = hipY - 52;
  // Плечи у женщин уже и покатее, бёдра шире — силуэт «песочные часы».
  const delt = female ? 0.94 : 1.04;
  const torsoPath = () => {
    ctx.beginPath();
    // Левое плечо → трапеция → шея
    ctx.moveTo(-shoulder * delt, hipY - 40);
    ctx.quadraticCurveTo(-shoulder * (delt + 0.02), hipY - 47, -shoulder * 0.70, hipY - 49);
    ctx.quadraticCurveTo(-shoulder * 0.42, hipY - 50.5, -shoulder * 0.26, topY);
    // Шея
    ctx.quadraticCurveTo(0, topY - 2.0, shoulder * 0.26, topY);
    // Правое плечо
    ctx.quadraticCurveTo(shoulder * 0.42, hipY - 50.5, shoulder * 0.70, hipY - 49);
    ctx.quadraticCurveTo(shoulder * (delt + 0.02), hipY - 47, shoulder * delt, hipY - 40);
    // Бок: у женщин — резкая талия и широкий, но не «грушевидный» таз.
    // Полуширина бедра не превышает плечо, иначе силуэт читается как юбка.
    if (female) {
      ctx.bezierCurveTo(shoulder * 0.94, hipY - 26, waist * 0.88, hipY - 16, waist * 1.45, hipY - 4);
    } else {
      ctx.bezierCurveTo(shoulder * 1.02, hipY - 24, waist * 1.02, hipY - 14, waist * 1.14, hipY - 3);
    }
    // Низ торса — не «подгузник», а промежность: по бокам подвздошные
    // кости, в центре вырез между бёдрами.
    if (female) {
      ctx.bezierCurveTo(waist * 1.52, hipY + 2, waist * 1.10, hipY + 7, waist * 0.62, hipY + 5);
      ctx.quadraticCurveTo(0, hipY + 2.5, -waist * 0.62, hipY + 5);
      ctx.bezierCurveTo(-waist * 1.10, hipY + 7, -waist * 1.52, hipY + 2, -waist * 1.45, hipY - 4);
    } else {
      ctx.bezierCurveTo(waist * 1.20, hipY + 2, waist * 0.92, hipY + 7, waist * 0.50, hipY + 5);
      ctx.quadraticCurveTo(0, hipY + 2.5, -waist * 0.50, hipY + 5);
      ctx.bezierCurveTo(-waist * 0.92, hipY + 7, -waist * 1.20, hipY + 2, -waist * 1.14, hipY - 3);
    }
    if (female) {
      ctx.bezierCurveTo(-waist * 0.88, hipY - 16, -shoulder * 0.94, hipY - 26, -shoulder * delt, hipY - 40);
    } else {
      ctx.bezierCurveTo(-waist * 1.02, hipY - 14, -shoulder * 1.02, hipY - 24, -shoulder * delt, hipY - 40);
    }
    ctx.closePath();
  };

  torsoPath();
  ctx.fillStyle = bodyColor;
  ctx.fill();
  // Мультяшный контур корпуса: сплошная линия той же толщины, что и
  // конечности. Полупрозрачный вариант читался как тень, а не как край.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.0;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.save();
  torsoPath();
  ctx.clip();

  // Форма: свет сверху-слева, тень по правому боку и под грудью.
  const bodyShade = ctx.createLinearGradient(-shoulder, topY, shoulder * 1.1, hipY);
  bodyShade.addColorStop(0, 'rgba(255,248,236,0.20)');
  bodyShade.addColorStop(0.38, 'rgba(255,255,255,0)');
  bodyShade.addColorStop(1, 'rgba(48,26,14,0.34)');
  ctx.fillStyle = bodyShade;
  ctx.fillRect(-shoulder * 1.4, topY - 8, shoulder * 2.8, hipY - topY + 22);

  // Тень под грудными мышцами
  ctx.fillStyle = 'rgba(90,48,26,0.16)';
  ctx.beginPath();
  ctx.ellipse(-shoulder * 0.42, hipY - 34, shoulder * 0.34, 7.5, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(shoulder * 0.44, hipY - 34, shoulder * 0.34, 7.5, 0.12, 0, Math.PI * 2);
  ctx.fill();

  if (female) {
    // Женская грудь: две крупные мягкие формы с естественным провисом.
    // Рисуем внутри клипа торса, до брони: под доспехом её не видно,
    // на голом теле она читается как анатомия.
    const bustY = hipY - 35;
    const bustX = shoulder * 0.38;
    const bustR = shoulder * 0.48;
    [-1, 1].forEach(sd => {
      const cx = sd * bustX;
      // Тень под грудью — по нижней дуге, чтобы форма читалась объёмом
      ctx.fillStyle = 'rgba(78,40,20,0.34)';
      ctx.beginPath();
      ctx.ellipse(cx, bustY + bustR * 0.70, bustR * 1.00, bustR * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      // Основной объём
      const g = ctx.createRadialGradient(
        cx - sd * bustR * 0.34, bustY - bustR * 0.50, bustR * 0.10,
        cx, bustY + bustR * 0.10, bustR * 1.15);
      g.addColorStop(0, shade(skin, 0.24));
      g.addColorStop(0.55, skin);
      g.addColorStop(1, shade(skin, -0.30));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, bustY, bustR, bustR * 1.00, sd * 0.10, 0, Math.PI * 2);
      ctx.fill();
      // Нижняя складка — тонкая тёмная дуга
      ctx.strokeStyle = 'rgba(88,44,22,0.45)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cx, bustY + bustR * 0.16, bustR * 0.92, bustR * 0.86, sd * 0.10, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      // Блик сверху-сбоку
      ctx.fillStyle = 'rgba(255,250,240,0.30)';
      ctx.beginPath();
      ctx.ellipse(cx - sd * bustR * 0.34, bustY - bustR * 0.46, bustR * 0.30, bustR * 0.22, sd * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    // Линия грудины между формами
    ctx.strokeStyle = 'rgba(96,52,30,0.36)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, hipY - 44);
    ctx.quadraticCurveTo(0, hipY - 34, 0, hipY - 25);
    ctx.stroke();
  }
  if (!eq.body) {
    // Анатомия голого тела: грудина, край рёбер, «кубики» пресса,
    // паховая линия. В лаконичном мультяшном стиле рельеф — это намёк,
    // а не анатомический атлас: тонкие слабые линии читаются как объём,
    // а плотные превращали торс в чертёж.
    const muscleLine = shade(skin, -0.42);
    ctx.strokeStyle = muscleLine;
    ctx.globalAlpha = 0.26;
    ctx.lineWidth = 1.4;
    // Грудина
    ctx.beginPath();
    ctx.moveTo(0, hipY - 47);
    ctx.quadraticCurveTo(-1.2, hipY - 36, 0, hipY - 26);
    ctx.stroke();
    // Ключицы
    ctx.beginPath();
    ctx.moveTo(-shoulder * 0.62, hipY - 46.5);
    ctx.quadraticCurveTo(-shoulder * 0.3, hipY - 43.5, -2, hipY - 44);
    ctx.moveTo(shoulder * 0.62, hipY - 46.5);
    ctx.quadraticCurveTo(shoulder * 0.3, hipY - 43.5, 2, hipY - 44);
    ctx.stroke();
    // Край рёбер
    ctx.beginPath();
    ctx.moveTo(-shoulder * 0.78, hipY - 36);
    ctx.quadraticCurveTo(-shoulder * 0.42, hipY - 30, -3, hipY - 29);
    ctx.moveTo(shoulder * 0.78, hipY - 36);
    ctx.quadraticCurveTo(shoulder * 0.42, hipY - 30, 3, hipY - 29);
    ctx.stroke();
    // Пресс: три пары сегментов
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const y = hipY - 26 + i * 5.4;
      ctx.moveTo(-shoulder * 0.3, y);
      ctx.quadraticCurveTo(0, y + 1.6, shoulder * 0.3, y);
    }
    ctx.moveTo(0, hipY - 26); ctx.lineTo(0, hipY - 10);
    ctx.stroke();
    // Паховые линии
    ctx.beginPath();
    ctx.moveTo(-waist * 0.92, hipY - 10);
    ctx.quadraticCurveTo(-waist * 0.4, hipY - 2, -2, hipY + 1);
    ctx.moveTo(waist * 0.92, hipY - 10);
    ctx.quadraticCurveTo(waist * 0.4, hipY - 2, 2, hipY + 1);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Голая кожа — видно татуировки и раскраску
    drawBodyCosmetics(ctx, glad, shoulder, waist, hipY);
  } else {
    drawBodyArmorDetail(ctx, eq.body, shoulder, waist, hipY);
  }
  // Кровь на корпусе
  drawBloodOnTorso(ctx, glad, shoulder, waist, hipY, a.blood);
  ctx.restore();

  if (!eq.body) {
    // Набедренная повязка: мягкая ткань с естественными складками
    const cloth = '#4a3020';
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(-waist * 1.02, hipY - 5);
    ctx.quadraticCurveTo(0, hipY - 1, waist * 1.02, hipY - 5);
    ctx.quadraticCurveTo(waist * 0.98, hipY + 7, waist * 0.6, hipY + 7.5);
    ctx.quadraticCurveTo(0, hipY + 9, -waist * 0.6, hipY + 7.5);
    ctx.quadraticCurveTo(-waist * 0.98, hipY + 7, -waist * 1.02, hipY - 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(cloth, -0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Складки
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-waist * 0.6, hipY - 1);
    ctx.quadraticCurveTo(-waist * 0.5, hipY + 4, -waist * 0.46, hipY + 7);
    ctx.moveTo(waist * 0.2, hipY - 1.5);
    ctx.quadraticCurveTo(waist * 0.28, hipY + 4, waist * 0.24, hipY + 7.5);
    ctx.stroke();
  }
  ctx.restore();

  // Шея уже нарисована до торса: основание уходит под воротник,
  // поэтому здесь её не дублируем.

  // --- Дальняя рука с оружием ---
  // Расчёт позы (gear, armAngle, bowHand) и отрисовка древкового
  // оружия сделаны выше — до корпуса, чтобы комель уходил за спину.
  if (!armR.lost) {
    ctx.save();
    ctx.translate(lean, 0);
    ctx.translate(shoulder * 0.80, hipY - 44);
    ctx.rotate(armAngle);
    // Рука одной формой: дельта у плеча, узкий локоть, предплечье
    // с утолщением и тонкое запястье. Кисть рисуется отдельно.
    const armW = female ? 11.6 : 14.0;
    // Рука не прямая: локоть вынесен вбок от линии плечо-кисть, поэтому
    // сгиб виден. Профиль толщины сужается на локте (0.66) и снова
    // набирает объём на предплечье (0.94) — именно эта «восьмёрка»
    // читается как рука с суставом, а не как труба.
    const armPts = [
      [-0.6, -1.0],
      [3.2, 8],
      [7.6, 17],
      [9.4, 22],     // локоть
      [11.4, 30],
      [13.6, 38],
      [15.6, 45],
      [16.4, 49]     // кисть
    ];
    const armWs = [armW * 1.00, armW * 1.06, armW * 0.88, armW * 0.66,
      armW * 0.94, armW * 0.78, armW * 0.60, armW * 0.54];
    limbShape(ctx, armPts, armWs, eq.arms ? eq.arms.color : skin);

    const armCol = eq.arms ? eq.arms.color : skin;
    // Складка на сгибе: дуга с внутренней стороны локтя
    ctx.strokeStyle = shadeA(armCol, -0.55, 0.4);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(5.2, 21.4);
    ctx.quadraticCurveTo(7.4, 24.2, 10.4, 23.0);
    ctx.stroke();
    // Блик на двуглавой и на предплечье
    ctx.strokeStyle = shadeA(armCol, 0.45, 0.2);
    ctx.lineWidth = armW * 0.3;
    ctx.beginPath();
    ctx.moveTo(2.6, 6);
    ctx.quadraticCurveTo(5.2, 12, 7.2, 17);
    ctx.stroke();
    ctx.lineWidth = armW * 0.24;
    ctx.beginPath();
    ctx.moveTo(10.6, 29);
    ctx.quadraticCurveTo(12.4, 34, 14.2, 39);
    ctx.stroke();

    drawArmSchoolDetail(ctx, eq.arms, 6, 16);
    // Кисть рисуется отдельно: у древкового оружия она ложится ПОВЕРХ
    // древка, чтобы было видно, что рука его обхватывает.
    const drawFist = (rot) => {
      const hx = 16.4, hy = 49;
      drawHand(ctx, hx, hy, armW, eq.arms ? eq.arms.color : skin, 1, rot);
      drawArmBlood(ctx, armR, hx, hy);
    };

    // Порядок важен: сначала оружие, затем кулак поверх рукояти —
    // иначе оружие висело ПОВЕРХ кисти и казалось приклеенным сбоку.
    let handRot = 0;
    if (eq.weapon && !bowHand) {
      const holdAng = weaponHoldAngle(eq.weapon, gear, a.swing);
      handRot = holdAng - Math.PI * 0.5;
      drawWeaponInHand(ctx, eq.weapon, 16.4, 49, holdAng, 1, 1);
    }

    drawFist(handRot);
    ctx.restore();
  } else {
    drawStump(ctx, shoulder * 0.80, hipY - 44, 11, skin, 'side');
  }

  // --- Лук в руке: держим за рукоять (обмотку), плечи вертикально ---
  if (bowHand && eq.weapon) {
    const bowLen = wVis.len || 48;
    // Короткие луки рисуем крупнее, иначе в бою они теряются в ладони
    const bowScale = Math.max(1.15, Math.min(1.7, 64 / bowLen));
    ctx.save();
    ctx.translate(bowHand.x + 2, bowHand.y + 1);
    // Верхнее плечо уводим вперёд (положительный угол в экранных
    // координатах), чтобы лук не прятался за головой и плечом.
    ctx.rotate(0.16);
    ctx.save();
    ctx.scale(bowScale, bowScale);
    drawWeapon(ctx, eq.weapon);
    ctx.restore();
    // Кисть поверх рукояти: пальцы обхватывают лук
    ctx.fillStyle = eq.arms ? shade(eq.arms.color, 0.1) : skin;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.5, 10, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Пальцы поперёк рукояти
    ctx.strokeStyle = skinDark;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-5, -6);
    ctx.quadraticCurveTo(1, -3, 4, 3);
    ctx.stroke();
    ctx.restore();
  }

  // --- Голова ---
  ctx.save();
  ctx.translate(lean, 0);
  if (!headS.lost) drawHead(ctx, glad, headY + headBob, headR, skin, skinDark, female, a, headS);
  ctx.restore();

  // --- Ближняя рука со щитом ---
  ctx.save();
  ctx.translate(lean, 0);
  const shieldLift = a.block * 0.9;
  if (!armL.lost) {
    ctx.save();
    ctx.translate(-shoulder * 0.80, hipY - 44);
    ctx.rotate(-0.15 - shieldLift + armWalkL);
    const armW = female ? 10.2 : 12.4;
    // Ближняя рука — та же единая форма, что и дальняя: плечо, сужение
    // на локте, предплечье, запястье. Два отрезка с нарисованным поверх
    // «локтем» давали заметный шов на сгибе.
    const armPts = [
      [0.6, -1.0],
      [-3.2, 8],
      [-7.6, 17],
      [-9.4, 22],     // локоть
      [-11.4, 30],
      [-13.6, 38],
      [-15.6, 45],
      [-16.4, 49]     // кисть
    ];
    const armWs = [armW * 1.00, armW * 1.06, armW * 0.88, armW * 0.66,
      armW * 0.94, armW * 0.78, armW * 0.60, armW * 0.54];
    limbShape(ctx, armPts, armWs, eq.arms ? eq.arms.color : skin);

    // Складка на сгибе локтя и блики
    const armColL = eq.arms ? eq.arms.color : skin;
    ctx.strokeStyle = shadeA(armColL, -0.55, 0.4);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-5.2, 21.4);
    ctx.quadraticCurveTo(-7.4, 24.2, -10.4, 23.0);
    ctx.stroke();
    ctx.strokeStyle = shadeA(armColL, 0.45, 0.2);
    ctx.lineWidth = armW * 0.3;
    ctx.beginPath();
    ctx.moveTo(-2.6, 6);
    ctx.quadraticCurveTo(-5.2, 12, -7.2, 17);
    ctx.stroke();
    ctx.lineWidth = armW * 0.24;
    ctx.beginPath();
    ctx.moveTo(-10.6, 29);
    ctx.quadraticCurveTo(-12.4, 34, -14.2, 39);
    ctx.stroke();

    drawArmSchoolDetail(ctx, eq.arms, -6, 16);
    const hx = -16.4, hy = 49;
    // Щит тяжёлый: качается вокруг кисти с запозданием и кренится на ходу.
    // Если в левой руке второй клинок (димахер, пара топоров) — рисуем
    // оружие, а кисть ложится ПОВЕРХ рукояти, как в правой руке.
    // Парный набор («пара топоров») — это сразу два клинка: второй
    // рисуется в левой руке, если она не занята щитом или другим клинком.
    const offWeapon = eq.offhand
      ? (eq.offhand.slot === 'weapon' ? eq.offhand : null)
      : (eq.weapon && eq.weapon.dualPair ? eq.weapon : null);
    if (offWeapon) {
      // Второй клинок повторяет позу правой руки, но зеркально.
      const offAng = weaponHoldAngle(offWeapon, gear, a.swing * 0.9);
      drawWeaponInHand(ctx, offWeapon, hx, hy, offAng, -1, 1);
      drawHand(ctx, hx, hy, armW, eq.arms ? eq.arms.color : skin, -1, -(offAng - Math.PI * 0.5));
      drawArmBlood(ctx, armL, hx, hy);
    } else {
      drawHand(ctx, hx, hy, armW, eq.arms ? eq.arms.color : skin, -1);
      drawArmBlood(ctx, armL, hx, hy);
      if (eq.offhand) {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(shdWalkLag + gear.shdLag + a.walk * 0.06);
        ctx.translate(-hx, -hy);
        drawShield(ctx, eq.offhand, hx, hy);
        ctx.restore();
      }
    }
    ctx.restore();
  } else {
    drawStump(ctx, -shoulder * 0.80, hipY - 44, 11, skin, 'side');
  }
  ctx.restore();

  // --- Вспышка урона ---
  if (a.hurt > 0.01) {
    ctx.globalAlpha = a.hurt * 0.45;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.ellipse(lean, hipY - 30, shoulder * 1.6, 62, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Полупрозрачный цвет из hex
function hexA(hex, a) {
  if (!hex || hex[0] !== '#') return `rgba(255,255,255,${a})`;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ==================== НОГА С КОЛЕНОМ ====================
// Бедро и голень — два отдельных сегмента. Колено уходит вперёд при сгибе,
// стопа поднимается в фазе переноса. Так шаг читается как живой, а не
// как качающийся маятник.
function drawLegSegmented(ctx, geom, w, color) {
  const { hipX, hipY, footX, footY } = geom;
  const lift = geom.lift || 0;

  const midX = (hipX + footX) / 2;
  const midY = (hipY + footY) / 2;
  // Колено: вперёд и чуть вверх. Чем выше поднята стопа — тем сильнее сгиб.
  const kneeX = midX + 3.4 + lift * 7.5;
  const kneeY = midY + 1 - lift * 2.4;

  // Нога — единая форма с профилем: широкое бедро, узкое колено,
  // икра и тонкая щиколотка. Разница толщин важнее, чем длина:
  // именно она читается как мышца, а не как палка.
  const ankleX = kneeX + (footX - kneeX) * 0.90;
  const ankleY = kneeY + (footY - kneeY) * 0.90;
  const pts = [
    [hipX, hipY],
    [hipX + (kneeX - hipX) * 0.55, hipY + (kneeY - hipY) * 0.55],
    [kneeX, kneeY],
    [kneeX + (ankleX - kneeX) * 0.36, kneeY + (ankleY - kneeY) * 0.36],
    [ankleX, ankleY]
  ];
  const ws = [w * 1.46, w * 1.20, w * 0.86, w * 0.90, w * 0.64];
  limbShape(ctx, pts, ws, color);

  // Надколенник
  const kneeAng = Math.atan2(footY - hipY, footX - hipX);
  ctx.fillStyle = shade(color, 0.05);
  ctx.beginPath();
  ctx.ellipse(kneeX, kneeY - w * 0.06, w * 0.36, w * 0.30, kneeAng, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,246,232,0.18)';
  ctx.beginPath();
  ctx.ellipse(kneeX - w * 0.10, kneeY - w * 0.16, w * 0.16, w * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Стопа: пятка, подъём и пальцы
  const shinW = w * 0.50;
  ctx.fillStyle = shade(color, -0.22);
  ctx.beginPath();
  ctx.moveTo(footX - shinW * 0.62, footY - 4.4);
  ctx.quadraticCurveTo(footX + shinW * 0.10, footY - 6.0, footX + shinW * 0.80 + 9, footY - 1.8);
  ctx.quadraticCurveTo(footX + shinW * 0.80 + 10, footY + 3.2, footX + shinW * 0.66 + 7, footY + 3.8);
  ctx.quadraticCurveTo(footX - shinW * 0.10, footY + 4.6, footX - shinW * 0.66, footY + 2.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shadeA(color, -0.55, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Броня ног: поножи/обмотки рисуются по фактической геометрии голени.
// Каждый стиль имеет свой силуэт: жёсткая створка, обмотки, штанина,
// шины на ремнях, лаковые пластины.
const LEG_PLATE_VIS = ['greaves', 'plate', 'gold', 'sandals', 'boots',
  'platelegs', 'irongreaves', 'goldgreaves', 'imperialgreaves', 'titangreaves',
  'splintlegs', 'samurai', 'gaiters', 'hidegreaves'];
const LEG_WRAP_VIS = ['wraps', 'chain', 'scale', 'legwraps', 'puttees', 'baggy',
  'chainlegs', 'scalelegs'];
const LEG_SCHOOL_VIS = ['medieval', 'china', 'rus', 'mongol'];

function drawLegArmorNew(ctx, legs, legColor, geoms) {
  if (!legs) return;
  const vis = legs.vis;
  const plate = LEG_PLATE_VIS.includes(vis);
  const wrap = LEG_WRAP_VIS.includes(vis);
  const school = LEG_SCHOOL_VIS.includes(vis);
  if (!plate && !wrap && !school) return;

  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;

  geoms.forEach(g => {
    if (g.lost) return;
    const kneeX = (g.hipX + g.footX) / 2 + 3.4 + (g.lift || 0) * 7.5;
    const kneeY = (g.hipY + g.footY) / 2 + 1 - (g.lift || 0) * 2.4;

    if (plate || school) {
      // Понож надевается на голень: от колена до стопы
      ctx.save();
      ctx.translate(kneeX, kneeY);
      const ang = Math.atan2(g.footY - kneeY, g.footX - kneeX);
      ctx.rotate(ang);
      const len = Math.hypot(g.footX - kneeX, g.footY - kneeY) * 0.72;
      ctx.fillStyle = shade(legColor, 0.2);
      roundRect(ctx, -2, -8, len, 16, 5);
      ctx.fill(); ctx.stroke();

      if (school) {
        const trim = legs.trim || '#c9a45c';
        if (vis === 'medieval') {
          // Кованая створка с наколенником и ремнём
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          roundRect(ctx, 1, -6, len * 0.55, 4, 2);
          ctx.fill();
          ctx.fillStyle = shade(legColor, 0.3);
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(2, -8, 5.4, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = trim;
          roundRect(ctx, 2, -2, len * 0.8, 3, 1.5);
          ctx.fill();
        } else if (vis === 'china') {
          // Ряды лаковых пластин
          ctx.fillStyle = trim;
          for (let i = 0; i < 3; i++) {
            roundRect(ctx, 1 + i * (len * 0.26), -6, len * 0.2, 3, 1.2);
            ctx.fill();
            roundRect(ctx, 1 + i * (len * 0.26), 3, len * 0.2, 3, 1.2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,0.24)';
          roundRect(ctx, 1, -6, len * 0.5, 2, 1);
          ctx.fill();
        } else if (vis === 'rus') {
          // Кольчужная рябь и медная бляха
          ctx.strokeStyle = shade(legColor, -0.3);
          ctx.lineWidth = 1.1;
          for (let i = 1; i < 5; i++) {
            const x = (len * i) / 5;
            ctx.beginPath();
            ctx.moveTo(x, -7);
            ctx.lineTo(x + 2, 7);
            ctx.stroke();
          }
          ctx.fillStyle = trim;
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(2, 0, 3.2, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        } else {
          // Монгольские кожаные накладки с меховым краем
          ctx.fillStyle = shade(legColor, -0.2);
          roundRect(ctx, 1, -5, len * 0.8, 10, 3);
          ctx.fill();
          ctx.fillStyle = '#b8a888';
          roundRect(ctx, 1, 5, len * 0.8, 3.4, 1.6);
          ctx.fill();
          ctx.fillStyle = trim;
          roundRect(ctx, len * 0.35, -2, 3.4, 4, 1.4);
          ctx.fill();
        }
      } else if (vis === 'platelegs' || vis === 'irongreaves' || vis === 'imperialgreaves'
        || vis === 'titangreaves' || vis === 'greaves') {
        // Кованая створка: наколенник, фаска и ремень под коленом
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        roundRect(ctx, 1.5, -6.4, len * 0.58, 4.4, 2);
        ctx.fill();
        ctx.strokeStyle = shade(legColor, -0.4);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(2, 2);
        ctx.lineTo(len - 2, 2);
        ctx.stroke();
        ctx.fillStyle = shade(legColor, 0.28);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(2, -8, 5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = vis === 'imperialgreaves' || vis === 'titangreaves' ? '#e8c65f' : '#5a3f22';
        roundRect(ctx, 1, -2.4, len * 0.82, 2.8, 1.3);
        ctx.fill();
      } else if (vis === 'goldgreaves') {
        // Золочёные: насечка-завитки по створке
        ctx.fillStyle = 'rgba(255,255,255,0.36)';
        roundRect(ctx, 1.5, -6.4, len * 0.6, 4.2, 2);
        ctx.fill();
        ctx.strokeStyle = '#7a5a1a';
        ctx.lineWidth = 1.2;
        for (let i = 1; i <= 3; i++) {
          const x = (len * i) / 4;
          ctx.beginPath();
          ctx.moveTo(x, -4);
          ctx.quadraticCurveTo(x + 3, 0, x, 4);
          ctx.stroke();
        }
      } else if (vis === 'splintlegs') {
        // Шинные наголенники: кожаная основа и продольные полосы стали
        ctx.fillStyle = '#6a4a2c';
        roundRect(ctx, -2, -8, len, 16, 5);
        ctx.fill(); ctx.stroke();
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = metalFill(ctx, legColor, -10, 10);
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = 1.3;
          roundRect(ctx, 1, i * 4.4 - 1.5, len * 0.86, 3, 1.4);
          ctx.fill(); ctx.stroke();
        }
      } else if (vis === 'samurai') {
        // Лаковые пластины, шнурованные золотом
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? shade(legColor, 0.16) : shade(legColor, -0.06);
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = 1.4;
          roundRect(ctx, 1 + i * (len * 0.21), -7, len * 0.19, 14, 2.4);
          ctx.fill(); ctx.stroke();
        }
        ctx.strokeStyle = legs.trim || '#c9a45c';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          const x = 1 + len * 0.14 + i * (len * 0.24);
          ctx.beginPath();
          ctx.moveTo(x, -7); ctx.lineTo(x + 2, 7);
          ctx.stroke();
        }
      } else if (vis === 'gaiters') {
        // Кожаные гетры: высокие обхваты с пряжками
        ctx.fillStyle = shade(legColor, 0.12);
        roundRect(ctx, -1, -8, len * 0.92, 16, 6);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = legs.trim || '#8a6a3a';
        for (let i = 0; i < 3; i++) {
          roundRect(ctx, 1 + i * (len * 0.28), -6, len * 0.2, 3.4, 1.4);
          ctx.fill();
          roundRect(ctx, 1 + i * (len * 0.28), 2.6, len * 0.2, 3.4, 1.4);
          ctx.fill();
        }
        ctx.strokeStyle = shade(legColor, -0.4);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(2, 0); ctx.lineTo(len * 0.9, 0);
        ctx.stroke();
      } else if (vis === 'hidegreaves') {
        // Кожаные поножи: прошивка и завязки
        ctx.fillStyle = shade(legColor, 0.1);
        roundRect(ctx, -1, -7.4, len * 0.9, 15, 5);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(240,232,208,0.6)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2.6, 2.2]);
        roundRect(ctx, 1, -5.4, len * 0.8, 10.8, 3);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = shade(legColor, -0.42);
        for (let i = 0; i < 2; i++) {
          roundRect(ctx, 2 + i * (len * 0.44), -2, 3.2, 4, 1.2);
          ctx.fill();
        }
      } else if (vis === 'plate' || vis === 'gold') {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        roundRect(ctx, 1, -6, len * 0.5, 4, 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // Обмотки, штанины, кольчуга и чешуя на голени
      if (vis === 'baggy') {
        // Шаровары: свободная штанина с подвязкой у щиколотки
        ctx.save();
        ctx.translate(kneeX, kneeY);
        const ang = Math.atan2(g.footY - kneeY, g.footX - kneeX);
        ctx.rotate(ang);
        const len = Math.hypot(g.footX - kneeX, g.footY - kneeY) * 0.86;
        ctx.fillStyle = shade(legColor, 0.06);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(-4, -10);
        ctx.quadraticCurveTo(len * 0.5, -13, len - 2, -6);
        ctx.quadraticCurveTo(len + 2, 0, len - 2, 6);
        ctx.quadraticCurveTo(len * 0.5, 12, -4, 10);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Складки
        ctx.strokeStyle = shade(legColor, -0.3);
        ctx.lineWidth = 1.4;
        for (let i = 1; i <= 3; i++) {
          const x = (len * i) / 4;
          ctx.beginPath();
          ctx.moveTo(x, -8);
          ctx.quadraticCurveTo(x + 2, 0, x, 8);
          ctx.stroke();
        }
        // Подвязка
        ctx.fillStyle = shade(legColor, -0.5);
        roundRect(ctx, len - 5, -6, 4, 12, 1.6);
        ctx.fill();
        ctx.restore();
        return;
      }
      if (vis === 'puttees') {
        // Портянки: плотные витки ткани, узкая лодыжка
        ctx.save();
        ctx.translate(kneeX, kneeY);
        const ang = Math.atan2(g.footY - kneeY, g.footX - kneeX);
        ctx.rotate(ang);
        const len = Math.hypot(g.footX - kneeX, g.footY - kneeY) * 0.8;
        ctx.fillStyle = shade(legColor, -0.04);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.6;
        roundRect(ctx, -2, -6.5, len, 13, 4.5);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = shade(legColor, -0.34);
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const x = 1 + i * (len / 5);
          ctx.beginPath();
          ctx.moveTo(x, -6);
          ctx.lineTo(x + 3, 6);
          ctx.stroke();
        }
        // Оборка у щиколотки
        ctx.fillStyle = shade(legColor, 0.2);
        roundRect(ctx, len - 4, -7, 5, 14, 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      if (vis === 'chainlegs' || vis === 'chain') {
        // Кольчужные чулки: кольца по голени
        ctx.save();
        ctx.translate(kneeX, kneeY);
        const ang = Math.atan2(g.footY - kneeY, g.footX - kneeX);
        ctx.rotate(ang);
        const len = Math.hypot(g.footX - kneeX, g.footY - kneeY) * 0.78;
        ctx.fillStyle = shade(legColor, -0.05);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.6;
        roundRect(ctx, -2, -6.8, len, 13.6, 4.5);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = shade(legColor, -0.4);
        ctx.lineWidth = 1.1;
        for (let row = 0; row < 5; row++) {
          for (let k = 0; k < 4; k++) {
            ctx.beginPath();
            ctx.arc(1 + k * (len / 4) + (row % 2 ? len / 8 : 0), -5 + row * 2.6, 1.8, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
        return;
      }
      if (vis === 'scalelegs' || vis === 'scale') {
        // Чешуя на голени
        ctx.save();
        ctx.translate(kneeX, kneeY);
        const ang = Math.atan2(g.footY - kneeY, g.footX - kneeX);
        ctx.rotate(ang);
        const len = Math.hypot(g.footX - kneeX, g.footY - kneeY) * 0.78;
        ctx.fillStyle = shade(legColor, -0.05);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.6;
        roundRect(ctx, -2, -6.8, len, 13.6, 4.5);
        ctx.fill(); ctx.stroke();
        for (let row = 0; row < 4; row++) {
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = row % 2 ? shade(legColor, 0.14) : legColor;
            ctx.strokeStyle = shade(legColor, -0.4);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(1 + k * (len / 4) + (row % 2 ? len / 8 : 0), -4.6 + row * 3, 2.6, 0, Math.PI);
            ctx.fill(); ctx.stroke();
          }
        }
        ctx.restore();
        return;
      }
      ctx.strokeStyle = shade(legColor, -0.25);
      ctx.lineWidth = 2.4;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const x = kneeX + (g.footX - kneeX) * t;
        const y = kneeY + (g.footY - kneeY) * t;
        ctx.beginPath();
        ctx.moveTo(x - 7, y - 1);
        ctx.lineTo(x + 7, y + 1);
        ctx.stroke();
      }
    }
  });
}

// Культя: короткий обрубок с тёмной запёкшейся раной
function drawStump(ctx, x, y, w, color, dir) {
  const len = 9;
  let x2 = x, y2 = y;
  if (dir === 'down') { y2 = y + len; }
  else if (dir === 'up') { y2 = y - len; }
  else { x2 = x + (x < 0 ? -len : len) * 0.4; y2 = y + len; }

  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();

  ctx.fillStyle = BLOOD_DARK;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(x2, y2, w * 0.44, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = BLOOD;
  ctx.beginPath();
  ctx.arc(x2, y2, w * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

// Кровь на руке, если конечность повреждена
function drawArmBlood(ctx, state, hx, hy) {
  if (state.lost || state.ratio > 0.55) return;
  const n = state.ratio < 0.25 ? 4 : 2;
  ctx.save();
  ctx.fillStyle = BLOOD;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.7;
    ctx.beginPath();
    ctx.ellipse(hx + Math.cos(ang) * 7, hy + Math.sin(ang) * 6 + 2, 3.2, 4.6, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Кровь на корпусе: пятна зависят от общего урона и повреждённых частей
function drawBloodOnTorso(ctx, glad, shoulder, waist, hipY, extra) {
  const L = glad.limbs;
  let severity = extra || 0;
  if (L) {
    const parts = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
    parts.forEach(k => {
      const s = L[k];
      if (!s) return;
      if (s.lost) severity = Math.max(severity, 0.85);
      else severity = Math.max(severity, (1 - s.hp / Math.max(1, s.max)) * 0.8);
    });
  }
  if (severity < 0.08) return;

  ctx.save();
  ctx.globalAlpha = clamp01(severity) * 0.85;
  ctx.fillStyle = BLOOD;
  const seed = (glad.id || 'x').length + 3;
  for (let i = 0; i < 5; i++) {
    const px = ((seed * (i + 2)) % 17) / 17 * 2 - 1;
    const py = ((seed * (i + 5)) % 13) / 13;
    ctx.beginPath();
    ctx.ellipse(px * shoulder * 0.75, hipY - 42 + py * 38, 4 + py * 5, 6 + py * 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // потёки
  ctx.strokeStyle = BLOOD_DARK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-shoulder * 0.3, hipY - 44);
  ctx.quadraticCurveTo(-shoulder * 0.24, hipY - 20, -shoulder * 0.3, hipY - 6);
  ctx.stroke();
  ctx.restore();
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ==================== ГОЛОВА ====================
function drawHead(ctx, glad, headY, headR, skin, skinDark, female, a, headState) {
  const eq = glad.equip || {};
  const hairC = glad.hairColor || '#4a3018';

  // Черты лица нарисованы в эталонной сетке REF. Масштаб приводит их
  // к текущему радиусу головы, поэтому пропорции можно менять в одном
  // месте, не пересчитывая каждую бровь и ресницу.
  const REF = 26.5;
  const origHeadR = headR;
  const headScale = headR / REF;
  ctx.save();
  ctx.translate(0, headY);
  ctx.scale(headScale, headScale);
  ctx.translate(0, -headY);
  headR = REF;

  // Контур головы тонкий: жирная обводка и была главным источником
  // «мультяшности». Тень делается заливкой, а не линией.
  const SKIN_EDGE = shade(skin, -0.62);

  // Форма лица из FACE_STYLES: набор коэффициентов, а не отдельная
  // геометрия на каждый вариант. Все восемь типов строятся одними
  // кривыми, поэтому лицо не «ломается» при смене пола и телосложения.
  const FS = (typeof faceStyleOf === 'function') ? faceStyleOf(glad) : null;
  // Коэффициенты из FACE_STYLES отклоняются от 1 не больше чем на 25%.
  // На маленькой голове в бою такой разницы почти не видно, поэтому
  // отклонение усиливается: форма должна читаться с первого взгляда,
  // но без гротеска. 2.2 — предел, после которого лица становятся
  // карикатурными.
  const amp = (v) => 1 + (v - 1) * 2.2;
  const fJaw = FS ? amp(FS.jaw) : 1;
  const fChin = FS ? amp(FS.chin) : 1;
  const fCheek = FS ? amp(FS.cheek) : 1;
  const fGap = FS ? amp(FS.eyeGap) : 1;
  const fEye = FS ? FS.eyeSize : 1;
  const fNose = FS ? amp(FS.nose) : 1;
  const fLip = FS ? amp(FS.lip) : 1;
  const fBrow = FS ? amp(FS.brow) : 1;

  // Череп: широкий свод, скулы, сужение к подбородку. Простая окружность
  // читается как мяч, поэтому силуэт строим кривыми.
  // Для лаконичного мультяшного стиля голова круглее, чем у человека:
  // отношение ширины к высоте около 0.93 вместо реалистичных 0.75.
  const HW = headR * 0.93 * (0.62 + 0.38 * fCheek);
  const headPath = () => {
    ctx.beginPath();
    ctx.moveTo(0, headY - headR * 1.07);
    ctx.bezierCurveTo(HW * 0.62, headY - headR * 1.06, HW * 1.02, headY - headR * 0.52, HW * 0.99, headY - headR * 0.02);
    // Скула: выраженность задаётся cheek
    ctx.bezierCurveTo(HW * 0.96 * fCheek, headY + headR * 0.44, HW * 0.66 * fJaw, headY + headR * 0.92,
      HW * 0.30 * fJaw, headY + headR * (1.04 * fChin));
    ctx.bezierCurveTo(HW * 0.10 * fJaw, headY + headR * (1.10 * fChin), -HW * 0.10 * fJaw, headY + headR * (1.10 * fChin),
      -HW * 0.30 * fJaw, headY + headR * (1.04 * fChin));
    ctx.bezierCurveTo(-HW * 0.66 * fJaw, headY + headR * 0.92, -HW * 0.96 * fCheek, headY + headR * 0.44, -HW * 0.99, headY - headR * 0.02);
    ctx.bezierCurveTo(-HW * 1.02, headY - headR * 0.52, -HW * 0.62, headY - headR * 1.06, 0, headY - headR * 1.07);
    ctx.closePath();
  };

  // Ухо: раковина с завитком и мочкой, а не кружок с обводкой.
  const drawEar = (side) => {
    ctx.save();
    ctx.scale(side, 1);
    const ex = HW * 0.99;
    ctx.beginPath();
    ctx.moveTo(ex - 1, headY - 3.4);
    ctx.quadraticCurveTo(ex + 4.6, headY - 5.6, ex + 4.8, headY + 1.6);
    ctx.quadraticCurveTo(ex + 4.9, headY + 8.4, ex + 0.6, headY + 10.4);
    ctx.quadraticCurveTo(ex - 2.4, headY + 9.2, ex - 1.6, headY + 4.2);
    ctx.closePath();
    ctx.fillStyle = shade(skin, -0.06);
    ctx.fill();
    // Ухо обводим тем же контуром, что и голову: иначе оно читается
    // как отдельная наклейка на лице.
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.0 / Math.max(0.5, headScale);
    ctx.stroke();
    // Завиток
    ctx.beginPath();
    ctx.moveTo(ex + 1.8, headY - 1.6);
    ctx.quadraticCurveTo(ex + 3.4, headY + 2.6, ex + 1.2, headY + 6.4);
    ctx.stroke();
    // Мочка
    ctx.fillStyle = shade(skin, -0.2);
    ctx.beginPath();
    ctx.ellipse(ex + 1.4, headY + 8.4, 1.9, 1.4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  drawEar(-1);
  drawEar(1);

  if (female && !eq.head) {
    ctx.fillStyle = '#d9a63f';
    ctx.beginPath(); ctx.arc(HW * 1.03, headY + 10.2, 2.1, 0, Math.PI * 2); ctx.fill();
  }

  headPath();
  ctx.fillStyle = skin;
  ctx.fill();
  // Контур головы — такой же толщины, как у тела: единый стиль рисунка.
  // Голова рисуется в эталонной сетке (масштаб headScale), поэтому
  // толщину делим на этот масштаб — иначе на крупной голове контур
  // выглядел бы тоньше, чем на корпусе.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.0 / Math.max(0.5, headScale);
  ctx.stroke();

  // Объём лица: тень по краю черепа, под скулой и у челюсти.
  ctx.save();
  headPath();
  ctx.clip();

  // Боковая тень (свет падает слева-сверху)
  const sideShade = ctx.createLinearGradient(-headR, headY - headR, headR * 0.5, headY + headR * 0.6);
  sideShade.addColorStop(0, 'rgba(255,240,225,0.16)');
  sideShade.addColorStop(0.42, 'rgba(255,255,255,0)');
  sideShade.addColorStop(1, 'rgba(58,30,16,0.30)');
  ctx.fillStyle = sideShade;
  ctx.fillRect(-headR - 2, headY - headR * 1.2, headR * 2 + 4, headR * 2.4);

  // Впадина под скулой: глубина связана с выраженностью скул — на
  // худом лице она резкая, на круглом почти незаметна. Тень вытянутая
  // и слабая: плотное круглое пятно читалось как румяна.
  ctx.fillStyle = `rgba(96,52,30,${0.05 + 0.055 * fCheek})`;
  ctx.beginPath();
  ctx.ellipse(-headR * 0.52 * fJaw, headY + headR * 0.42, headR * 0.30, headR * 0.30 * fCheek, -0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headR * 0.54 * fJaw, headY + headR * 0.42, headR * 0.30, headR * 0.30 * fCheek, 0.42, 0, Math.PI * 2);
  ctx.fill();

  // Тень под нижней губой и на подбородке
  ctx.fillStyle = 'rgba(96,52,30,0.16)';
  ctx.beginPath();
  ctx.ellipse(0, headY + headR * 0.80 * fChin, headR * 0.30, headR * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Блик на лбу и скуле
  ctx.fillStyle = 'rgba(255,246,232,0.20)';
  ctx.beginPath();
  ctx.ellipse(-headR * 0.20, headY - headR * 0.58, headR * 0.30, headR * 0.17, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-headR * 0.52, headY + headR * 0.06, headR * 0.15, headR * 0.10, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Глухие шлемы полностью закрывают лицо. Венец и капюшон — нет.
  const hidden = eq.head && ['murmillo', 'greathelm', 'horned'].includes(eq.head.vis);

  // Борода и волосы рисуются ДО черт лица: рот, брови, глаза и кровь
  // остаются поверх, поэтому выражение читается в любой бороде и чёлке.
  const beard = female ? 'none' : (glad.beardStyle || 'none');
  if (beard !== 'none' && !hidden) drawBeard(ctx, beard, headY, headR, hairC, skin);
  if (!eq.head && !hidden) drawHair(ctx, glad, headY, headR, hairC);

  if (!hidden) {
    const t = performance.now() / 1000;
    const seed = glad.id ? glad.id.length * 0.37 : 0.6;
    // Эмоция: явно заданная (бой, город) либо выведенная из состояния
    const emo = a.emotion
      || (a.dead > 0.4 ? 'dead' : a.hurt > 0.3 ? 'hurt' : a.victory > 0.5 ? 'happy' : 'idle');

    // Моргание — своё у каждого бойца
    const blinkCycle = 2.8 + (glad.id ? (glad.id.length % 4) * 0.45 : 0.9);
    const bt = (t + seed * 7) % blinkCycle;
    const blink = emo === 'dead' ? 0.1 : (bt > blinkCycle - 0.12 ? 0.1 : 1);

    // Живой взгляд: зрачки чуть гуляют, брови дышат
    const gazeX = Math.sin(t * 0.8 + seed * 9) * 1.4;
    const gazeY = Math.cos(t * 0.55 + seed * 5) * 1.0;
    const browBob = Math.sin(t * 1.6 + seed * 3) * 0.5;

    // Наборы черт: форма лица задаёт череп, а эти коэффициенты — то,
    // что делает лица разными при одинаковом овале.
    const ES = (typeof eyeSetOf === 'function') ? eyeSetOf(glad) : null;
    const NS = (typeof noseSetOf === 'function') ? noseSetOf(glad) : null;
    const BS = (typeof browSetOf === 'function') ? browSetOf(glad) : null;
    const eOpen = ES ? ES.open : 1;
    const eTilt = ES ? ES.tilt : 0;
    const eRound = ES ? ES.round : 0.35;
    const eLid = ES ? ES.lid : 0.25;
    const ePupil = ES ? ES.pupil : 1;

    const eyeW = (emo === 'fear' ? 5.2 : emo === 'angry' ? 4.7 : emo === 'happy' ? 4.3 : 4.6) * fEye;
    const eyeH = (emo === 'fear' ? 5.0 : emo === 'angry' ? 3.0
      : emo === 'hurt' ? 3.2 : emo === 'happy' ? 2.8 : 3.6) * fEye * eOpen;
    const eyeY = headY - 2.4 + (emo === 'fear' ? -0.8 : emo === 'angry' ? 0.6 : 0);
    // Расстояние между зрачками: широко расставленные глаза делают лицо
    // открытым, близко посаженные — настороженным.
    const eyeDX = 8.4 * fGap;

    // Глаз: разрез строится вокруг центра cx/eyeY. Форма задаётся набором:
    // tilt поднимает внешний угол, round делает разрез округлым,
    // lid опускает верхнее веко. Размер по вертикали намеренно меньше
    // горизонтального — человеческий глаз вытянут, а не круглый.
    const drawEye = (cx) => {
      const eh = Math.max(1.0, eyeH * blink);
      const side = cx < 0 ? -1 : 1;
      const outX = cx + side * eyeW;
      const inX = cx - side * eyeW;
      // Все точки разреза считаем вдоль оси «внутренний угол → внешний»,
      // поэтому левый глаз строится ровно так же, как правый, только
      // зеркально. Раньше контрольные точки задавались абсолютными
      // смещениями влево-вправо, и левый глаз выходил перекошенным.
      const ax = (k) => inX + (outX - inX) * k;
      // Наклон: внешний угол выше, внутренний ниже.
      const tiltUp = eTilt * 1.8;
      const outerY = eyeY - tiltUp;
      const innerY = eyeY + tiltUp * 0.7;
      // Верхняя дуга: округлость поднимает её, тяжёлое веко опускает.
      const up = eh * (0.78 + eRound * 0.34) * (1 - eLid * 0.55);
      const low = eh * 0.48;

      const upperPath = () => {
        ctx.moveTo(inX, innerY);
        ctx.quadraticCurveTo(ax(0.34), eyeY - up, ax(0.56), eyeY - up * 0.80);
        ctx.quadraticCurveTo(ax(0.82), eyeY - up * 0.55, outX, outerY);
      };

      ctx.beginPath();
      upperPath();
      // Нижнее веко: мягкая дуга обратно к внутреннему углу
      ctx.quadraticCurveTo(ax(0.68), eyeY + low, ax(0.50), eyeY + low * 0.82);
      ctx.quadraticCurveTo(ax(0.20), eyeY + low * 0.34, inX, innerY);
      ctx.closePath();
      ctx.fillStyle = '#efe6d8';
      ctx.fill();
      // Тень от верхнего века внутри белка
      ctx.save();
      ctx.clip();
      const lidShade = ctx.createLinearGradient(0, eyeY - up, 0, eyeY + low);
      lidShade.addColorStop(0, `rgba(40,22,12,${0.30 + eLid * 0.30})`);
      lidShade.addColorStop(0.55, 'rgba(40,22,12,0.02)');
      lidShade.addColorStop(1, 'rgba(40,22,12,0.10)');
      ctx.fillStyle = lidShade;
      ctx.fillRect(cx - eyeW - 1, eyeY - up - 2, eyeW * 2 + 2, up + low + 4);
      ctx.restore();

      if (blink > 0.5) {
        // Радужка занимает меньше половины разреза — иначе глаз читается
        // как чёрное пятно, а не как глаз.
        const pr = (emo === 'fear' ? 1.7 : emo === 'angry' ? 1.9 : 1.85) * ePupil;
        // Зрачок держим в центре разреза: он не должен уезжать к веку.
        const py = eyeY + (emo === 'angry' ? 0.35 : emo === 'fear' ? -0.35 : 0.0);
        const px = cx + (cx < 0 ? 0.35 : -0.35) + gazeX * 0.35;
        // Радужка: не чёрный кружок, а тёмный ореол вокруг зрачка
        ctx.fillStyle = '#4a3320';
        ctx.beginPath(); ctx.arc(px, py + gazeY * 0.35, pr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#15100a';
        ctx.beginPath(); ctx.arc(px, py + gazeY * 0.35, pr * 0.56, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(px - pr * 0.36, py - pr * 0.42 + gazeY * 0.35, pr * 0.22, 0, Math.PI * 2); ctx.fill();
      }

      // Верхнее веко — та же дуга, что и белок: контур не расходится
      // с формой глаза, поэтому нет двойной линии.
      ctx.strokeStyle = '#33210f';
      ctx.lineWidth = (female ? 1.4 : 1.6) + eLid * 0.7;
      ctx.beginPath();
      upperPath();
      ctx.stroke();
      // Нижнее веко светлее и тоньше
      ctx.strokeStyle = 'rgba(90,52,32,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax(0.16), innerY + low * 0.34);
      ctx.quadraticCurveTo(ax(0.50), eyeY + low * 0.90, ax(0.86), outerY + 0.5);
      ctx.stroke();
      // Мешок/складка под глазом: у тяжёлых век выражен сильнее
      ctx.strokeStyle = `rgba(120,70,42,${0.16 + eLid * 0.26})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax(0.14), eyeY + low + 1.6);
      ctx.quadraticCurveTo(ax(0.55), eyeY + low + 2.2, ax(0.94), eyeY + 1.8);
      ctx.stroke();
    };

    drawEye(-eyeDX);
    drawEye(eyeDX);

    // Крестики вместо глаз у павшего
    if (emo === 'dead') {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.0;
      [-eyeDX, eyeDX].forEach(cx => {
        ctx.beginPath();
        ctx.moveTo(cx - 4, eyeY - 4); ctx.lineTo(cx + 4, eyeY + 4);
        ctx.moveTo(cx + 4, eyeY - 4); ctx.lineTo(cx - 4, eyeY + 4);
        ctx.stroke();
      });
    }

    if (female) {
      ctx.strokeStyle = '#33210f';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeW, eyeY - 1);
      ctx.lineTo(-eyeDX - eyeW - 2.6, eyeY - 3.6);
      ctx.moveTo(eyeDX + eyeW, eyeY - 1);
      ctx.lineTo(eyeDX + eyeW + 2.6, eyeY - 3.6);
      ctx.stroke();
    }

    // Брови: толще у переносицы, тоньше к виску — как растут волосы.
    // Набор BROW_SETS задаёт посадку: gap — от переносицы, inner —
    // поднятость внутреннего края, outer — опущенность внешнего,
    // arch — высота дуги. Эмоция меняет уже готовую форму.
    const bGap = BS ? BS.gap : 1;
    const bInner = BS ? BS.inner : 0;
    const bOuter = BS ? BS.outer : 0;
    const bArch = BS ? BS.arch : 0.4;
    const browIn = 2.6 * fGap * bGap;
    const browOut = 16.5 * fGap * bGap;
    const bInnerY = headY - 6.6 - bInner * 4.2;
    const bOuterY = headY - 10.5 - bOuter * 4.2;
    const browL = { x1: -browOut, y1: bOuterY, x2: -browIn, y2: bInnerY };
    const browR = { x1: browOut, y1: bOuterY, x2: browIn, y2: bInnerY };
    if (emo === 'angry') {
      browL.y1 = headY - 12.2; browL.y2 = headY - 4.2;
      browR.y1 = headY - 12.2; browR.y2 = headY - 4.2;
    } else if (emo === 'fear') {
      browL.y1 = headY - 6.6; browL.y2 = headY - 12.6;
      browR.y1 = headY - 6.6; browR.y2 = headY - 12.6;
    } else if (emo === 'hurt') {
      browL.y1 = headY - 12.8; browL.y2 = headY - 7.2;
      browR.y1 = headY - 9.0; browR.y2 = headY - 5.6;
    } else if (emo === 'happy') {
      browL.y1 = headY - 12.6; browL.y2 = headY - 10.2;
      browR.y1 = headY - 12.6; browR.y2 = headY - 10.2;
    }
    const browColor = shade(hairC, -0.12);
    const drawBrow = (b, innerFirst) => {
      const x0 = innerFirst ? b.x2 : b.x1;
      const y0 = (innerFirst ? b.y2 : b.y1) + browBob;
      const x1 = innerFirst ? b.x1 : b.x2;
      const y1 = (innerFirst ? b.y1 : b.y2) + browBob;
      // Высота дуги: у прямой брови контрольная точка почти на линии,
      // у крутой — заметно выше.
      const archY = Math.min(y0, y1) - 0.6 - bArch * 3.4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, archY, x1, y1);
      ctx.strokeStyle = browColor;
      ctx.lineWidth = (female ? 1.9 : 2.6) * fBrow * (BS ? BS.thick : 1);
      ctx.lineCap = 'round';
      ctx.stroke();
      // Отдельные волоски у внешнего края
      ctx.strokeStyle = shade(hairC, -0.34);
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) {
        const t = 0.62 + i * 0.13;
        const px = x0 + (x1 - x0) * t;
        const py = y0 + (y1 - y0) * t - 0.8;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (x1 > x0 ? 1.5 : -1.5), py - 1.5);
        ctx.stroke();
      }
    };
    drawBrow(browL, false);
    drawBrow(browR, true);
    // Сросшиеся брови: перемычка над переносицей
    if (BS && BS.unibrow) {
      ctx.strokeStyle = browColor;
      ctx.lineWidth = (female ? 1.9 : 2.6) * fBrow * BS.thick * 0.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(browL.x2, browL.y2 + browBob);
      ctx.lineTo(browR.x2, browR.y2 + browBob);
      ctx.stroke();
    }

    // Нос: спинка, крылья и тень под кончиком. Раньше была одна дуга.
    // Длина, ширина крыльев, горбинка и посадка кончика берутся из
    // NOSE_SETS: крючковатый нос на узком лице и курносый на широком —
    // это разные люди даже при одинаковом овале.
    const nLen = NS ? NS.len : 1;
    const nWidth = NS ? NS.width : 1;
    const nBridge = NS ? NS.bridge : 1;
    const nHook = NS ? NS.hook : 0.1;
    const nTip = NS ? NS.tip : 0;
    const nFlare = NS ? NS.flare : 1;
    const noseY0 = headY - 3.2;
    const noseY1 = headY + (6.2 * fNose) * nLen;
    const noseSpan = noseY1 - noseY0;
    // Горбинка: контрольная точка спинки выносится вбок от оси
    const hookX = -1.0 - nHook * 2.2;
    ctx.strokeStyle = 'rgba(112,64,38,0.55)';
    ctx.lineWidth = 1.4 * (0.9 + nBridge * 0.2);
    ctx.beginPath();
    ctx.moveTo(0.6 * nBridge, noseY0);
    ctx.quadraticCurveTo(hookX, noseY0 + noseSpan * 0.5, -1.6 * nBridge, noseY1);
    ctx.stroke();
    // Тень от спинки носа
    ctx.strokeStyle = 'rgba(255,244,230,0.28)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-0.8 * nBridge, noseY0 + 0.6);
    ctx.quadraticCurveTo(hookX - 1.2, noseY0 + noseSpan * 0.5, -2.8 * nBridge, noseY1 - 0.4);
    ctx.stroke();
    // Кончик: опущенный или вздёрнутый
    const tipY = noseY1 + nTip * 1.8;
    ctx.fillStyle = shade(skin, -0.10 - nHook * 0.06);
    ctx.beginPath();
    ctx.ellipse(0, tipY - 0.4, 1.9 * nWidth, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Крылья
    ctx.fillStyle = shade(skin, -0.16);
    ctx.beginPath();
    ctx.ellipse(-3.2 * nWidth, tipY + 0.4, 1.9 * nFlare, 1.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(3.2 * nWidth, tipY + 0.4, 1.9 * nFlare, 1.5, -0.35, 0, Math.PI * 2);
    ctx.fill();
    // Ноздри
    ctx.fillStyle = 'rgba(70,38,22,0.55)';
    ctx.beginPath();
    ctx.ellipse(-2.7 * nWidth, tipY + 0.8, 0.85 * nFlare, 0.6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(2.7 * nWidth, tipY + 0.8, 0.85 * nFlare, 0.6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Тень под носом
    ctx.fillStyle = 'rgba(96,52,30,0.20)';
    ctx.beginPath();
    ctx.ellipse(0, tipY + 2.6, 3.6 * nWidth, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Рот — главный индикатор эмоции. Губы рисуем двумя линиями:
    // верхняя тоньше и темнее, нижняя светлее с бликом. Никаких
    // жирных обводок — они превращали лицо в маску.
    // Ширина губ масштабируется коэффициентом lip: узкий рот на широком
    // лице и крупный на маленьком — это разные люди с первого взгляда.
    const mouthY = headY + 13.6;
    const lipDark = 'rgba(104,48,40,0.85)';
    const lipLight = 'rgba(176,96,84,0.55)';
    // Набор рта: ширина, полнота губ, опущенные уголки, перекос.
    // Он работает поверх формы лица, поэтому «широкий рот» и «тонкие
    // губы» — это два разных человека, а не одно и то же лицо.
    const MS = (typeof mouthSetOf === 'function') ? mouthSetOf(glad) : null;
    const mWidth = MS ? MS.width : 1;
    const mFull = MS ? MS.full : 0.55;
    const mCorner = MS ? MS.corner : 0;
    const mTilt = MS ? MS.tilt : 0;
    const mPhil = MS ? MS.philtrum : 1;
    ctx.save();
    // Масштаб по ширине: форма лица даёт общую ширину, набор рта — свою.
    const mouthScaleX = fLip * mWidth;
    if (mouthScaleX !== 1 || mTilt) {
      ctx.translate(0, mouthY);
      ctx.scale(mouthScaleX, 1);
      if (mTilt) ctx.rotate(mTilt * 0.10);
      ctx.translate(0, -mouthY);
    }
    // Желобок над верхней губой — глубина зависит от набора
    ctx.strokeStyle = `rgba(120,66,42,${0.16 + 0.10 * mPhil})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mouthY - 3.6);
    ctx.lineTo(0, mouthY - 1.4);
    ctx.stroke();
    if (emo === 'dead') {
      ctx.beginPath();
      ctx.ellipse(0, mouthY + 1.4, 4.6, 3.0, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#3a1210';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,14,10,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (emo === 'hurt' || a.hurt > 0.3) {
      // Крик от боли: рот открыт, зубы видны
      const open = 3.2 + Math.sin(t * 14) * 1.1;
      ctx.beginPath();
      ctx.ellipse(0, mouthY + 1.2, 5.6, open, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#5a1a14';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,14,10,0.65)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // Верхние зубы
      ctx.fillStyle = '#efe8da';
      ctx.beginPath();
      ctx.rect(-3.9, mouthY + 1.2 - open, 7.8, 1.7);
      ctx.fill();
      // Язык в глубине
      ctx.fillStyle = 'rgba(150,60,58,0.55)';
      ctx.beginPath();
      ctx.ellipse(0, mouthY + 1.2 + open * 0.45, 3.0, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (emo === 'angry') {
      // Рык: рот приоткрыт, пульсирует
      const open = 3.6 + Math.sin(t * 9 + seed * 4) * 1.5;
      ctx.beginPath();
      ctx.ellipse(0, mouthY + 1.4, 6.2, open, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4a1410';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,14,10,0.65)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = '#efe8da';
      ctx.beginPath();
      ctx.rect(-4.4, mouthY + 1.4 - open, 8.8, 1.8);
      ctx.fill();
      // Напряжённые складки у рта
      ctx.strokeStyle = 'rgba(110,60,36,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6.4, mouthY - 1.6);
      ctx.quadraticCurveTo(-7.6, mouthY + 2.6, -6.2, mouthY + 5.4);
      ctx.moveTo(6.4, mouthY - 1.6);
      ctx.quadraticCurveTo(7.6, mouthY + 2.6, 6.2, mouthY + 5.4);
      ctx.stroke();
    } else if (emo === 'fear') {
      // Испуг: приоткрытый рот + капля пота
      ctx.beginPath();
      ctx.ellipse(0, mouthY + 1.6, 2.9, 3.4 + Math.sin(t * 6) * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4a1410';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,14,10,0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const dropT = (t * 0.9 + seed) % 1;
      ctx.fillStyle = `rgba(150,200,235,${0.75 - dropT * 0.55})`;
      ctx.beginPath();
      ctx.ellipse(headR * 0.82, headY - headR * 0.42 + dropT * 15, 1.9, 2.7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (emo === 'happy') {
      // Улыбка: уголки вверх, нижняя губа чуть видна
      ctx.beginPath();
      ctx.moveTo(-6.4, mouthY - 0.4);
      ctx.quadraticCurveTo(0, mouthY + 4.4, 6.4, mouthY - 0.4);
      ctx.strokeStyle = lipDark;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4.6, mouthY + 1.4);
      ctx.quadraticCurveTo(0, mouthY + 4.0, 4.6, mouthY + 1.4);
      ctx.strokeStyle = lipLight;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    } else if (emo === 'taunt') {
      // Ухмылка набок
      ctx.beginPath();
      ctx.moveTo(-5.6, mouthY);
      ctx.quadraticCurveTo(1, mouthY + 4.2, 7.4, mouthY - 1.4);
      ctx.strokeStyle = lipDark;
      ctx.lineWidth = 1.7;
      ctx.stroke();
    } else if (female) {
      // Полные губы: верхняя с «луком», нижняя с бликом.
      // Полнота берётся из набора рта, поэтому «тонкие губы» у женщины
      // не превращаются в мужской рот.
      const fw = 5.4 + 1.4 * mFull;
      const fb = 2.0 + 1.6 * mFull;
      ctx.beginPath();
      ctx.moveTo(-fw, mouthY + mCorner * 1.6);
      ctx.quadraticCurveTo(-fw * 0.48, mouthY - 1.4 * mFull - 0.6, -1.2, mouthY - 0.6);
      ctx.quadraticCurveTo(0, mouthY - 1.9 * mFull - 0.3, 1.2, mouthY - 0.6);
      ctx.quadraticCurveTo(fw * 0.48, mouthY - 1.4 * mFull - 0.6, fw, mouthY + mCorner * 1.6);
      ctx.quadraticCurveTo(0, mouthY + fb + 1.4, -fw, mouthY + mCorner * 1.6);
      ctx.closePath();
      ctx.fillStyle = 'rgba(168,74,66,0.72)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-fw * 0.8, mouthY + 1.2);
      ctx.quadraticCurveTo(0, mouthY + fb + 1.0, fw * 0.8, mouthY + 1.2);
      ctx.strokeStyle = 'rgba(255,220,210,0.45)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    } else {
      // Спокойный рот: линия губ. Уголки задаёт набор рта:
      // положительный corner — жёстко опущенные, отрицательный — ухмылка.
      const mw = 5.2 + 1.2 * mFull;
      const cw = mCorner * 2.4;
      const thick = 1.1 + 1.3 * mFull;
      ctx.beginPath();
      ctx.moveTo(-mw, mouthY - 0.2 + cw);
      ctx.quadraticCurveTo(0, mouthY + 2.2 * mFull, mw, mouthY - 0.6 + cw);
      ctx.strokeStyle = lipDark;
      ctx.lineWidth = thick;
      ctx.lineCap = 'round';
      ctx.stroke();
      // Верхняя губа: у полного рта видна отдельной дугой
      if (mFull > 0.45) {
        ctx.beginPath();
        ctx.moveTo(-mw * 0.72, mouthY - 0.4 + cw * 0.6);
        ctx.quadraticCurveTo(0, mouthY - 1.4 * mFull, mw * 0.72, mouthY - 0.7 + cw * 0.6);
        ctx.strokeStyle = lipLight;
        ctx.lineWidth = 1.0 + mFull * 0.6;
        ctx.stroke();
      }
      // Тень под нижней губой
      ctx.beginPath();
      ctx.moveTo(-mw * 0.75, mouthY + 1.8);
      ctx.quadraticCurveTo(0, mouthY + 3.4, mw * 0.75, mouthY + 1.6);
      ctx.strokeStyle = 'rgba(120,66,42,0.3)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Кровь на лице при тяжёлом ранении головы
  if (headState && headState.ratio < 0.5) {
    ctx.save();
    ctx.globalAlpha = 0.8 * (1 - headState.ratio);
    ctx.fillStyle = BLOOD;
    ctx.beginPath();
    ctx.ellipse(-12, headY - 12, 5, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(13, headY + 8, 4, 7, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (eq.head) drawHelmet(ctx, eq.head, headY, headR);
  // Возврат из эталонной сетки лица
  ctx.restore();
}

// ==================== БОРОДА ====================
// Борода рисуется ДО черт лица: сначала масса волос, усы, пряди и блик,
// а рот, кровь и шлем ложатся поверх. Поэтому мимика читается даже в
// самой густой бороде. Все стили строятся из одних примитивов, но силуэт
// у каждого свой: окладистая, верди, подкова, якорь, бакенбарды и т.д.
function drawBeard(ctx, style, headY, headR, hairC, skin) {
  const dark = shade(hairC, -0.34);
  const light = shade(hairC, 0.36);
  const mid = hairC;
  const R = headR;

  // Заливка формы с контуром
  const shape = (pathFn, lw) => {
    ctx.beginPath();
    pathFn();
    ctx.fillStyle = mid;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = lw == null ? 2.8 : lw;
    ctx.stroke();
  };

  // Пряди: изогнутые линии, повторяющие направление роста волос
  const strands = (x0, x1, y0, y1, count, curl, w) => {
    ctx.strokeStyle = dark;
    ctx.lineWidth = w || 1.5;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const x = x0 + (x1 - x0) * t;
      const len = (y1 - y0) * (0.6 + 0.4 * Math.sin(t * Math.PI));
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.quadraticCurveTo(x + curl * Math.sin(t * Math.PI), y0 + len * 0.6, x + curl * 0.35, y0 + len);
      ctx.stroke();
    }
  };

  // Затемнение внутри формы: верх у щёк светлее, низ у шеи в тени
  const shadeMass = (pathFn, top, bot) => {
    ctx.save();
    ctx.beginPath();
    pathFn();
    ctx.clip();
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(-R - 24, top - 12, R * 2 + 48, bot - top + 24);
    ctx.restore();
  };

  // Окно рта: в густой бороде оставляем светлое пятно кожи вокруг губ,
  // иначе линия рта теряется в волосах и лицо становится «слепым».
  const mouthGap = (cy, rx, ry) => {
    if (!skin) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Усы держим над линией рта (рот живёт на headY+16..21), поэтому
  // они не «съедают» мимику. Виды: full, walrus, thin, handlebar, horseshoe.
  const moustache = (kind) => {
    const y = headY + 8;
    ctx.fillStyle = mid;
    ctx.strokeStyle = OUTLINE;

    if (kind === 'thin') {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-1, y + 1);
      ctx.quadraticCurveTo(-8, y - 2, -13, y + 2);
      ctx.quadraticCurveTo(-7, y + 4, 0, y + 3);
      ctx.quadraticCurveTo(7, y + 4, 13, y + 2);
      ctx.quadraticCurveTo(8, y - 2, 1, y + 1);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      return;
    }

    if (kind === 'horseshoe') {
      // Усы-подкова: крылья идут вниз по сторонам рта, сам рот открыт
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-1, y);
      ctx.quadraticCurveTo(-9, y - 3, -14, y + 2);
      ctx.quadraticCurveTo(-16, y + 12, -13, y + 21);
      ctx.quadraticCurveTo(-9, y + 22, -7, y + 18);
      ctx.quadraticCurveTo(-10, y + 10, -8, y + 4);
      ctx.quadraticCurveTo(-4, y + 5, 0, y + 4);
      ctx.quadraticCurveTo(4, y + 5, 8, y + 4);
      ctx.quadraticCurveTo(10, y + 10, 7, y + 18);
      ctx.quadraticCurveTo(9, y + 22, 13, y + 21);
      ctx.quadraticCurveTo(16, y + 12, 14, y + 2);
      ctx.quadraticCurveTo(9, y - 3, 1, y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      return;
    }

    // full / walrus / handlebar
    const h = kind === 'walrus' ? 5 : 3.4;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-1, y + 1);
    ctx.quadraticCurveTo(-8, y - 4, -15, y);
    ctx.quadraticCurveTo(-9, y + h + 4, 0, y + h + 3);
    ctx.quadraticCurveTo(9, y + h + 4, 15, y);
    ctx.quadraticCurveTo(8, y - 4, 1, y + 1);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.strokeStyle = light;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-11, y + 1.4);
    ctx.quadraticCurveTo(-6, y + 2.2, -1, y + 3.2);
    ctx.moveTo(11, y + 1.4);
    ctx.quadraticCurveTo(6, y + 2.2, 1, y + 3.2);
    ctx.stroke();

    if (kind === 'handlebar') {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.6;
      [-1, 1].forEach(sd => {
        ctx.beginPath();
        ctx.moveTo(sd * 15, y);
        ctx.quadraticCurveTo(sd * 20, y - 3, sd * 19, y - 8);
        ctx.stroke();
      });
      ctx.fillStyle = mid;
      [-1, 1].forEach(sd => {
        ctx.beginPath();
        ctx.arc(sd * 19, y - 8, 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  // Масса бороды: от бакенбардов по щекам, вокруг челюсти, к подбородку
  const massPath = (bottom, spread, cheekY) => () => {
    ctx.moveTo(-spread, headY + cheekY);
    ctx.quadraticCurveTo(-spread - 2, headY + bottom * 0.55, -spread * 0.5, headY + bottom * 0.88);
    ctx.quadraticCurveTo(-spread * 0.2, headY + bottom * 1.02, 0, headY + bottom);
    ctx.quadraticCurveTo(spread * 0.2, headY + bottom * 1.02, spread * 0.5, headY + bottom * 0.88);
    ctx.quadraticCurveTo(spread + 2, headY + bottom * 0.55, spread, headY + cheekY);
    ctx.quadraticCurveTo(spread * 0.72, headY + cheekY + 7, spread * 0.42, headY + cheekY + 9);
    ctx.quadraticCurveTo(0, headY + cheekY + 14, -spread * 0.42, headY + cheekY + 9);
    ctx.quadraticCurveTo(-spread * 0.72, headY + cheekY + 7, -spread, headY + cheekY);
    ctx.closePath();
  };

  // Окличная борода: почти прямоугольный низ со скруглёнными углами
  const massSquarePath = (bottom, spread, cheekY) => () => {
    ctx.moveTo(-spread, headY + cheekY);
    ctx.quadraticCurveTo(-spread - 2, headY + bottom * 0.6, -spread * 0.82, headY + bottom * 0.92);
    ctx.quadraticCurveTo(-spread * 0.4, headY + bottom * 1.02, 0, headY + bottom);
    ctx.quadraticCurveTo(spread * 0.4, headY + bottom * 1.02, spread * 0.82, headY + bottom * 0.92);
    ctx.quadraticCurveTo(spread + 2, headY + bottom * 0.6, spread, headY + cheekY);
    ctx.quadraticCurveTo(spread * 0.72, headY + cheekY + 7, spread * 0.42, headY + cheekY + 9);
    ctx.quadraticCurveTo(0, headY + cheekY + 14, -spread * 0.42, headY + cheekY + 9);
    ctx.quadraticCurveTo(-spread * 0.72, headY + cheekY + 7, -spread, headY + cheekY);
    ctx.closePath();
  };

  // --- Щетина: мелкая просыпь точек без чёткого края ---
  if (style === 'stubble') {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-R * 0.96, headY + 2);
    ctx.quadraticCurveTo(-R * 0.9, headY + 22, 0, headY + 27);
    ctx.quadraticCurveTo(R * 0.9, headY + 22, R * 0.96, headY + 2);
    ctx.quadraticCurveTo(R * 0.5, headY + 12, 0, headY + 12);
    ctx.quadraticCurveTo(-R * 0.5, headY + 12, -R * 0.96, headY + 2);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = 0.46;
    ctx.fillStyle = mid;
    ctx.fillRect(-R, headY, R * 2, 30);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = dark;
    for (let i = 0; i < 52; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const rr = (i % 7) / 7;
      const px = Math.cos(a) * R * 0.8 * (0.5 + rr * 0.5);
      const py = headY + 13 + Math.sin(a) * 9 + rr * 7;
      ctx.beginPath();
      ctx.arc(px, py, 0.9 + (i % 3) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // --- Только усы ---
  if (style === 'moustache') {
    moustache('handlebar');
    return;
  }

  // --- Козлиная: клин на подбородке и короткие усы ---
  if (style === 'goatee') {
    const p = () => {
      ctx.moveTo(-8, headY + 15);
      ctx.quadraticCurveTo(-7, headY + 30, 0, headY + 38);
      ctx.quadraticCurveTo(7, headY + 30, 8, headY + 15);
      ctx.quadraticCurveTo(0, headY + 20, -8, headY + 15);
      ctx.closePath();
    };
    shape(p);
    strands(-5, 5, headY + 18, headY + 36, 4, 1.6);
    moustache('full');
    return;
  }

  // --- Имперская: усы с закрученными концами и узкая кисточка ---
  if (style === 'imperial') {
    moustache('handlebar');
    shape(() => {
      ctx.moveTo(-5, headY + 20);
      ctx.quadraticCurveTo(-4, headY + 30, 0, headY + 37);
      ctx.quadraticCurveTo(4, headY + 30, 5, headY + 20);
      ctx.quadraticCurveTo(0, headY + 24, -5, headY + 20);
      ctx.closePath();
    }, 2.4);
    strands(-3, 3, headY + 23, headY + 34, 3, 1);
    return;
  }

  // --- Подкова: усы, спускающиеся полосами по сторонам рта ---
  if (style === 'horseshoe') {
    moustache('horseshoe');
    return;
  }

  // --- Ван Дейк: усы и отдельная острая бородка ---
  if (style === 'vandyke') {
    moustache('full');
    const p = () => {
      ctx.moveTo(-9, headY + 17);
      ctx.quadraticCurveTo(-8, headY + 31, 0, headY + 42);
      ctx.quadraticCurveTo(8, headY + 31, 9, headY + 17);
      ctx.quadraticCurveTo(0, headY + 22, -9, headY + 17);
      ctx.closePath();
    };
    shape(p);
    shadeMass(p, headY + 16, headY + 42);
    strands(-6, 6, headY + 20, headY + 39, 5, 1.8);
    return;
  }

  // --- Якорь: тонкие усы, полоски у рта и клин на подбородке ---
  if (style === 'anchor') {
    [-1, 1].forEach(sd => {
      shape(() => {
        ctx.moveTo(sd * 9, headY + 13);
        ctx.quadraticCurveTo(sd * 12, headY + 22, sd * 7, headY + 30);
        ctx.quadraticCurveTo(sd * 5, headY + 26, sd * 6, headY + 18);
        ctx.quadraticCurveTo(sd * 7, headY + 15, sd * 9, headY + 13);
        ctx.closePath();
      }, 2.2);
    });
    shape(() => {
      ctx.moveTo(-6, headY + 22);
      ctx.quadraticCurveTo(-5, headY + 30, 0, headY + 35);
      ctx.quadraticCurveTo(5, headY + 30, 6, headY + 22);
      ctx.quadraticCurveTo(0, headY + 25, -6, headY + 22);
      ctx.closePath();
    }, 2.2);
    moustache('thin');
    return;
  }

  // --- По контуру: узкая полоса по линии челюсти, щёки бритые ---
  if (style === 'chinstrap') {
    const p = () => {
      ctx.moveTo(-R * 0.94, headY - 6);
      ctx.quadraticCurveTo(-R * 1.0, headY + 16, -R * 0.4, headY + 27);
      ctx.quadraticCurveTo(0, headY + 31, R * 0.4, headY + 27);
      ctx.quadraticCurveTo(R * 1.0, headY + 16, R * 0.94, headY - 6);
      ctx.quadraticCurveTo(R * 0.84, headY + 10, R * 0.32, headY + 20);
      ctx.quadraticCurveTo(0, headY + 23, -R * 0.32, headY + 20);
      ctx.quadraticCurveTo(-R * 0.84, headY + 10, -R * 0.94, headY - 6);
      ctx.closePath();
    };
    shape(p, 2.6);
    ctx.strokeStyle = light;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-R * 0.86, headY + 4);
    ctx.quadraticCurveTo(-R * 0.7, headY + 18, -R * 0.2, headY + 24);
    ctx.stroke();
    return;
  }

  // --- Бакенбарды: две широкие «баки», подбородок выбрит ---
  if (style === 'sidewhiskers') {
    [-1, 1].forEach(sd => {
      const p = () => {
        ctx.moveTo(sd * R * 0.5, headY - 14);
        ctx.quadraticCurveTo(sd * (R + 2), headY - 8, sd * (R + 1), headY + 8);
        ctx.quadraticCurveTo(sd * (R - 1), headY + 22, sd * R * 0.52, headY + 19);
        ctx.quadraticCurveTo(sd * R * 0.44, headY + 4, sd * R * 0.5, headY - 14);
        ctx.closePath();
      };
      shape(p);
      ctx.save();
      ctx.beginPath();
      p();
      ctx.clip();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) {
        const x = sd * (R * 0.62 + i * 2.6);
        ctx.beginPath();
        ctx.moveTo(x, headY - 12);
        ctx.quadraticCurveTo(x + sd * 3, headY + 4, x - sd * 1, headY + 17);
        ctx.stroke();
      }
      ctx.restore();
    });
    moustache('full');
    return;
  }

  // --- Короткая окладистая: широкий ровный низ ---
  if (style === 'shortbox') {
    const p = massSquarePath(30, 20, 5);
    shape(p, 3);
    shadeMass(p, headY + 4, headY + 30);
    strands(-14, 14, headY + 14, headY + 27, 7, 1.4);
    mouthGap(headY + 17, 9, 6);
    moustache('full');
    return;
  }

  // --- Верди: широкая борода средней длины с ровным срезом ---
  if (style === 'verdi') {
    const p = massSquarePath(46, 22, 4);
    shape(p, 3);
    shadeMass(p, headY + 3, headY + 46);
    strands(-16, 16, headY + 13, headY + 42, 9, 1.8);
    // Блик по скуле
    ctx.strokeStyle = light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, headY + 12);
    ctx.quadraticCurveTo(-18, headY + 28, -7, headY + 38);
    ctx.stroke();
    mouthGap(headY + 17, 9, 6);
    moustache('full');
    return;
  }

  // --- Гарибальди: большая круглая борода, усы сливаются с массой ---
  if (style === 'garibaldi') {
    const p = massPath(50, 23, 4);
    shape(p, 3);
    shadeMass(p, headY + 3, headY + 50);
    strands(-18, 18, headY + 14, headY + 45, 10, 2.2);
    mouthGap(headY + 18, 9, 6);
    moustache('walrus');
    return;
  }

  // --- Утиный хвост: длинная борода, раздвоенная на два острых конца ---
  if (style === 'ducktail') {
    const p = massPath(44, 20, 5);
    shape(p, 3);
    shadeMass(p, headY + 4, headY + 44);
    strands(-15, 15, headY + 14, headY + 40, 8, 1.8);
    [-1, 1].forEach(sd => {
      shape(() => {
        ctx.moveTo(sd * 11, headY + 34);
        ctx.quadraticCurveTo(sd * 10, headY + 50, sd * 3, headY + 60);
        ctx.quadraticCurveTo(sd * 1.5, headY + 48, sd * 0.5, headY + 40);
        ctx.quadraticCurveTo(sd * 6, headY + 41, sd * 11, headY + 34);
        ctx.closePath();
      }, 2.6);
    });
    mouthGap(headY + 17, 9, 6);
    moustache('full');
    return;
  }

  // --- full / long: полная борода, разница в длине и форме низа ---
  const long = style === 'long';
  const bottom = long ? 58 : 42;
  const spread = long ? 21 : 19;
  const p = massPath(bottom, spread, 5);
  shape(p, 3);
  shadeMass(p, headY + 5, headY + bottom);
  strands(-spread * 0.78, spread * 0.78, headY + 14, headY + bottom * 0.9, 9, long ? 2.2 : 1.5);

  // Блик по левой скуле — объём
  ctx.strokeStyle = light;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-spread * 0.72, headY + 13);
  ctx.quadraticCurveTo(-spread * 0.86, headY + bottom * 0.4, -spread * 0.34, headY + bottom * 0.7);
  ctx.stroke();

  mouthGap(headY + 17, 9, 6);
  moustache('full');

  // Длинная борода: два «языка» на конце и седые пряди
  if (long) {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, headY + bottom * 0.62);
    ctx.quadraticCurveTo(-3, headY + bottom * 0.86, 0, headY + bottom - 1);
    ctx.moveTo(5, headY + bottom * 0.66);
    ctx.quadraticCurveTo(3, headY + bottom * 0.86, 0, headY + bottom - 1);
    ctx.stroke();
    ctx.strokeStyle = shade(hairC, 0.55);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-spread * 0.3, headY + bottom * 0.5);
    ctx.quadraticCurveTo(-spread * 0.2, headY + bottom * 0.75, -spread * 0.06, headY + bottom * 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ==================== ПРИЧЁСКИ ====================
// Волосы рисуются в три слоя: тёмная масса, средний тон, блик.
// Поверх — пряди, которые задают направление и объём.
function hairLayers(ctx, hairC, pathFn, yTop, yBot) {
  pathFn();
  ctx.fillStyle = hairC;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.6;
  ctx.stroke();

  ctx.save();
  pathFn();
  ctx.clip();
  // Тёмный низ — волосы уходят в тень
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.42, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(-60, yTop - 20, 120, yBot - yTop + 40);
  ctx.restore();
}

// Пряди по форме причёски
function hairStrands(ctx, hairC, x0, x1, y0, y1, count, bend) {
  ctx.strokeStyle = shade(hairC, -0.32);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const x = x0 + (x1 - x0) * t;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.quadraticCurveTo(x + bend * (0.5 - t), (y0 + y1) / 2, x + bend * (0.5 - t) * 1.4, y1);
    ctx.stroke();
  }
}

function drawHair(ctx, glad, headY, headR, hairC) {
  const style = glad.hairStyle || 'short';
  const light = shade(hairC, 0.42);

  // Линия роста волос: лоб должен занимать около трети лица. Раньше
  // волосы спускались почти до бровей, и любая стрижка читалась как шапка.
  const cap = () => {
    ctx.beginPath();
    ctx.moveTo(-headR - 1, headY - 7);
    ctx.quadraticCurveTo(-headR - 2, headY - 33, 0, headY - 34);
    ctx.quadraticCurveTo(headR + 2, headY - 33, headR + 1, headY - 7);
    ctx.quadraticCurveTo(headR - 5, headY - 21, headR * 0.42, headY - 25);
    ctx.quadraticCurveTo(0, headY - 27.5, -headR * 0.42, headY - 25);
    ctx.quadraticCurveTo(-headR + 5, headY - 21, -headR - 1, headY - 7);
    ctx.closePath();
  };

  // Блик по куполу — общий для всех причёсок
  const capShine = () => {
    ctx.strokeStyle = light;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(-headR * 0.18, headY - 12, headR * 0.7, Math.PI * 1.12, Math.PI * 1.55);
    ctx.stroke();
  };

  if (style === 'short' || style === 'topknot') {
    hairLayers(ctx, hairC, cap, headY - 36, headY - 2);
    // Короткая стрижка: рваная линия у висков
    ctx.strokeStyle = shade(hairC, -0.28);
    ctx.lineWidth = 1.6;
    [-1, 1].forEach(sd => {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(sd * (headR - 2 - i * 2), headY - 16 + i * 3);
        ctx.quadraticCurveTo(sd * (headR + 1), headY - 8 + i * 3, sd * (headR - 4), headY - 1 + i * 2);
        ctx.stroke();
      }
    });
    capShine();
    if (style === 'topknot') {
      ctx.fillStyle = hairC;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.ellipse(0, headY - 42, 10.5, 9, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Обмотка узла
      ctx.strokeStyle = shade(hairC, -0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, headY - 44); ctx.lineTo(8, headY - 40);
      ctx.moveTo(-8, headY - 39); ctx.lineTo(8, headY - 44);
      ctx.stroke();
      ctx.strokeStyle = light;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(-3, headY - 46, 5, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();
    }
  } else if (style === 'long') {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-headR - 2, headY + 20);
      ctx.quadraticCurveTo(-headR - 6, headY - 36, 0, headY - 36);
      ctx.quadraticCurveTo(headR + 6, headY - 36, headR + 2, headY + 20);
      ctx.quadraticCurveTo(headR + 7, headY + 30, headR - 3, headY + 32);
      ctx.quadraticCurveTo(headR - 6, headY - 12, 0, headY - 16);
      ctx.quadraticCurveTo(-headR + 6, headY - 12, -headR + 3, headY + 32);
      ctx.quadraticCurveTo(-headR - 7, headY + 30, -headR - 2, headY + 20);
      ctx.closePath();
    };
    hairLayers(ctx, hairC, path, headY - 38, headY + 32);
    // Длинные пряди по бокам
    ctx.strokeStyle = shade(hairC, -0.3);
    ctx.lineWidth = 1.6;
    [-1, 1].forEach(sd => {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(sd * (headR + 1 - i * 3), headY - 6 + i * 2);
        ctx.quadraticCurveTo(sd * (headR + 4 - i * 2), headY + 12, sd * (headR - 1 - i * 3), headY + 28 - i * 3);
        ctx.stroke();
      }
    });
    capShine();
  } else if (style === 'ponytail') {
    hairLayers(ctx, hairC, cap, headY - 36, headY - 2);
    capShine();
    // Хвост: несколько прядей, а не один клин
    ctx.fillStyle = hairC;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-headR + 2, headY - 12);
    ctx.quadraticCurveTo(-headR - 18, headY + 2, -headR - 12, headY + 34);
    ctx.quadraticCurveTo(-headR - 2, headY + 18, -headR + 6, headY - 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = shade(hairC, -0.3);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-headR - 4, headY - 2);
    ctx.quadraticCurveTo(-headR - 12, headY + 12, -headR - 7, headY + 28);
    ctx.moveTo(-headR + 1, headY + 1);
    ctx.quadraticCurveTo(-headR - 7, headY + 13, -headR - 3, headY + 26);
    ctx.stroke();
    // Резинка
    ctx.strokeStyle = '#8a3a2a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-headR + 1, headY - 10);
    ctx.lineTo(-headR + 7, headY - 2);
    ctx.stroke();
  } else if (style === 'braids') {
    hairLayers(ctx, hairC, cap, headY - 36, headY - 2);
    capShine();
    // Косы: переплетение «косичкой», а не столбик из овалов
    [-1, 1].forEach(sd => {
      const bx = sd * (headR - 2);
      for (let i = 0; i < 4; i++) {
        const cy = headY + 12 + i * 9;
        const off = (i % 2 ? 2.6 : -2.6);
        ctx.fillStyle = i % 2 ? shade(hairC, 0.1) : hairC;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(bx + off, cy, 5.4, 6.4, off * 0.06, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      // Кисточка на конце
      ctx.fillStyle = shade(hairC, -0.2);
      ctx.beginPath();
      ctx.moveTo(bx - 4, headY + 46);
      ctx.lineTo(bx + 4, headY + 46);
      ctx.lineTo(bx + 1, headY + 54);
      ctx.lineTo(bx - 1, headY + 54);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
  } else if (style === 'bun') {
    hairLayers(ctx, hairC, cap, headY - 36, headY - 2);
    capShine();
    ctx.fillStyle = hairC;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.ellipse(0, headY - 40, 12.5, 11, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = shade(hairC, -0.3);
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(0, headY - 40, 4 + Math.abs(i) * 3, Math.PI * 0.15 + i * 0.4, Math.PI * 1.1 + i * 0.4);
      ctx.stroke();
    }
    ctx.strokeStyle = light;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-3, headY - 43, 6, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
  } else if (style === 'mohawk') {
    // Гребень из отдельных шипов
    ctx.fillStyle = hairC;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    const spikes = 6;
    for (let i = 0; i < spikes; i++) {
      const t = i / (spikes - 1);
      const bx = -9 + t * 20;
      const hgt = 26 + Math.sin(t * Math.PI) * 22;
      ctx.beginPath();
      ctx.moveTo(bx - 3.6, headY - 24);
      ctx.quadraticCurveTo(bx - 1.5, headY - 24 - hgt * 0.7, bx + 1, headY - 24 - hgt);
      ctx.quadraticCurveTo(bx + 3, headY - 24 - hgt * 0.55, bx + 3.6, headY - 24);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = shade(hairC, 0.35);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(bx - 1, headY - 27);
      ctx.quadraticCurveTo(bx, headY - 26 - hgt * 0.6, bx + 0.5, headY - 24 - hgt * 0.9);
      ctx.stroke();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
    }
    // Выбритые виски
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = hairC;
    ctx.beginPath();
    ctx.ellipse(-headR * 0.72, headY - 12, 6, 12, 0.2, 0, Math.PI * 2);
    ctx.ellipse(headR * 0.72, headY - 12, 6, 12, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (style === 'curly') {
    // Кудри: спиральные завитки с бликом внутри каждого
    const curls = [[-13, -22, 8.5], [-4, -30, 8], [6, -30, 8], [14, -21, 8], [-17, -8, 7.5], [17, -7, 7.5], [-9, -16, 7], [3, -19, 7.5]];
    curls.forEach(([cx, cy, r]) => {
      ctx.fillStyle = hairC;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(cx, headY + cy, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = shade(hairC, -0.3);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, headY + cy, r * 0.55, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
      ctx.strokeStyle = light;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, headY + cy - r * 0.25, r * 0.34, Math.PI * 1.05, Math.PI * 1.6);
      ctx.stroke();
    });
  } else if (style === 'dreadlocks') {
    hairLayers(ctx, hairC, cap, headY - 36, headY - 2);
    capShine();
    // Дреды: жгуты с утолщениями
    for (let i = -3; i <= 3; i++) {
      const bx = i * 6.5;
      const len = 26 + Math.abs(i) * 3;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(bx, headY - 12);
      ctx.quadraticCurveTo(bx + i * 0.8, headY + 6, bx + i * 1.2, headY + len);
      ctx.stroke();
      ctx.strokeStyle = hairC;
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.moveTo(bx, headY - 12);
      ctx.quadraticCurveTo(bx + i * 0.8, headY + 6, bx + i * 1.2, headY + len);
      ctx.stroke();
      // Утолщения жгута
      ctx.fillStyle = shade(hairC, 0.12);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(bx + i * 0.8 * k * 0.5, headY - 4 + k * 10, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (style === 'shaved') {
    // Бритая голова: короткая тень и мелкая щетина
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = hairC;
    ctx.beginPath();
    ctx.moveTo(-headR - 1, headY - 4);
    ctx.quadraticCurveTo(-headR - 2, headY - 32, 0, headY - 33);
    ctx.quadraticCurveTo(headR + 2, headY - 32, headR + 1, headY - 4);
    ctx.quadraticCurveTo(0, headY - 16, -headR - 1, headY - 4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = shade(hairC, -0.3);
    for (let i = 0; i < 22; i++) {
      const a = Math.PI + (i / 21) * Math.PI;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * headR * 0.82, headY - 6 + Math.sin(a) * headR * 0.7, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (style === 'crew') {
    // Ёжик: короткая щётка, ровная линия роста, чуть длиннее к макушке
    hairLayers(ctx, hairC, cap, headY - 36, headY - 2);
    ctx.strokeStyle = shade(hairC, -0.34);
    ctx.lineWidth = 1.4;
    for (let i = -5; i <= 5; i++) {
      const x = i * 4.4;
      const topY = headY - 31 + Math.abs(i) * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x + i * 0.5, topY - 3.4);
      ctx.stroke();
    }
    capShine();
  } else if (style === 'slick') {
    // Зачёс назад: волосы уложены назад, линия с пробором и объёмом у лба
    hairLayers(ctx, hairC, () => {
      ctx.beginPath();
      ctx.moveTo(-headR - 2, headY - 3);
      ctx.quadraticCurveTo(-headR - 4, headY - 34, -2, headY - 36);
      ctx.quadraticCurveTo(headR + 3, headY - 35, headR + 2, headY - 4);
      ctx.quadraticCurveTo(headR - 4, headY - 15, 4, headY - 22);
      ctx.quadraticCurveTo(-headR * 0.3, headY - 26, -headR - 2, headY - 3);
      ctx.closePath();
    }, headY - 38, headY - 2);
    // Гребни-дорожки от лба назад
    ctx.strokeStyle = shade(hairC, -0.36);
    ctx.lineWidth = 1.5;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5.4, headY - 24);
      ctx.quadraticCurveTo(i * 7, headY - 31, i * 6, headY - 34);
      ctx.stroke();
    }
    capShine();
  } else if (style === 'parted') {
    // Пробор: пробор сбоку, две массы волос, одна больше другой
    hairLayers(ctx, hairC, cap, headY - 36, headY - 2);
    ctx.strokeStyle = shade(hairC, -0.5);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7, headY - 33);
    ctx.quadraticCurveTo(-6, headY - 20, -8, headY - 6);
    ctx.stroke();
    ctx.strokeStyle = shade(hairC, -0.3);
    ctx.lineWidth = 1.4;
    [-1, 1].forEach(sd => {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-7 + sd * (3 + i * 4), headY - 30);
        ctx.quadraticCurveTo(-6 + sd * (5 + i * 5), headY - 22, -8 + sd * (7 + i * 6), headY - 12);
        ctx.stroke();
      }
    });
    capShine();
  } else if (style === 'fringe') {
    // Чёлка: ровная масса надо лбом с зубчатым краем
    hairLayers(ctx, hairC, () => {
      ctx.beginPath();
      ctx.moveTo(-headR - 1, headY - 2);
      ctx.quadraticCurveTo(-headR - 2, headY - 33, 0, headY - 34);
      ctx.quadraticCurveTo(headR + 2, headY - 33, headR + 1, headY - 2);
      ctx.quadraticCurveTo(headR * 0.6, headY - 12, headR * 0.2, headY - 9);
      ctx.quadraticCurveTo(-headR * 0.3, headY - 6, -headR - 1, headY - 2);
      ctx.closePath();
    }, headY - 36, headY - 2);
    ctx.strokeStyle = shade(hairC, -0.3);
    ctx.lineWidth = 1.4;
    for (let i = -4; i <= 4; i++) {
      const x = i * 4.8;
      ctx.beginPath();
      ctx.moveTo(x, headY - 26);
      ctx.quadraticCurveTo(x + 1, headY - 16, x + 0.5, headY - 10);
      ctx.stroke();
    }
    capShine();
  } else if (style === 'spiky') {
    // Рваные пряди: отдельные острые клинья вверх и в стороны
    ctx.fillStyle = hairC;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.8;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const bx = -headR * 0.86 + t * headR * 1.72;
      const hgt = 12 + Math.sin(t * Math.PI) * 12 + (i % 2 ? 4 : 0);
      ctx.beginPath();
      ctx.moveTo(bx - 5, headY - 22);
      ctx.quadraticCurveTo(bx - 2, headY - 22 - hgt * 0.8, bx + 1, headY - 20 - hgt);
      ctx.quadraticCurveTo(bx + 4, headY - 22 - hgt * 0.5, bx + 5, headY - 21);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // Основа-шапка под прядями
    ctx.save();
    ctx.globalAlpha = 0.9;
    hairLayers(ctx, hairC, cap, headY - 32, headY - 2);
    ctx.restore();
    ctx.strokeStyle = shade(hairC, 0.34);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-12, headY - 28);
    ctx.quadraticCurveTo(0, headY - 34, 12, headY - 27);
    ctx.stroke();
  } else if (style === 'halfup') {
    // Полухвост: волосы собраны у затылка, часть спадает по бокам
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-headR - 2, headY + 14);
      ctx.quadraticCurveTo(-headR - 5, headY - 34, 0, headY - 35);
      ctx.quadraticCurveTo(headR + 5, headY - 34, headR + 2, headY + 14);
      ctx.quadraticCurveTo(headR + 4, headY + 24, headR - 4, headY + 26);
      ctx.quadraticCurveTo(headR - 6, headY - 10, 0, headY - 16);
      ctx.quadraticCurveTo(-headR + 6, headY - 10, -headR + 4, headY + 26);
      ctx.quadraticCurveTo(-headR - 4, headY + 24, -headR - 2, headY + 14);
      ctx.closePath();
    };
    hairLayers(ctx, hairC, path, headY - 37, headY + 26);
    // Хвостик сбоку сзади
    ctx.fillStyle = hairC;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-headR + 1, headY - 8);
    ctx.quadraticCurveTo(-headR - 12, headY + 4, -headR - 6, headY + 24);
    ctx.quadraticCurveTo(-headR + 1, headY + 12, -headR + 6, headY - 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8a3a2a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-headR, headY - 6);
    ctx.lineTo(-headR + 6, headY + 1);
    ctx.stroke();
    capShine();
  } else if (style === 'twinbraids') {
    // Две косы: шапка волос и две плетёные косы по бокам
    hairLayers(ctx, hairC, cap, headY - 36, headY - 2);
    capShine();
    [-1, 1].forEach(sd => {
      const bx = sd * (headR + 1);
      for (let i = 0; i < 5; i++) {
        const cy = headY + 6 + i * 8.4;
        const off = (i % 2 ? 2.4 : -2.4);
        ctx.fillStyle = i % 2 ? shade(hairC, 0.1) : hairC;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(bx + off, cy, 4.8, 5.8, off * 0.08, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      // Ленточка на конце
      ctx.fillStyle = sd > 0 ? '#a83b30' : '#3a6a8a';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bx - 4, headY + 48);
      ctx.lineTo(bx + 4, headY + 47);
      ctx.lineTo(bx + 2, headY + 52);
      ctx.lineTo(bx - 2, headY + 52);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
  } else if (style === 'afro') {
    // Афро: пышное облако из крупных завитков вокруг головы
    ctx.fillStyle = hairC;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, headY - 20, headR + 10, headR + 4, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Кучерявая фактура: кольца по краю облака
    const rings = [];
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (1.05 + (i / 11) * 0.9);
      rings.push([Math.cos(a) * (headR + 8), headY - 20 + Math.sin(a) * (headR + 2)]);
    }
    rings.forEach(([cx, cy]) => {
      ctx.fillStyle = shade(hairC, 0.06);
      ctx.strokeStyle = shade(hairC, -0.4);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.6, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    ctx.strokeStyle = shade(hairC, 0.4);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-headR * 0.4, headY - 34, 8, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
  } else if (style === 'wavy') {
    // Волны: длинные волнистые пряди, мягкий контур с локонами
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-headR - 3, headY + 18);
      ctx.quadraticCurveTo(-headR - 7, headY - 34, 0, headY - 35);
      ctx.quadraticCurveTo(headR + 7, headY - 34, headR + 3, headY + 18);
      ctx.quadraticCurveTo(headR + 8, headY + 24, headR + 1, headY + 28);
      ctx.quadraticCurveTo(headR + 2, headY + 14, headR - 6, headY + 4);
      ctx.quadraticCurveTo(headR - 8, headY - 14, 0, headY - 17);
      ctx.quadraticCurveTo(-headR + 8, headY - 14, -headR + 6, headY + 4);
      ctx.quadraticCurveTo(-headR - 2, headY + 14, -headR - 1, headY + 28);
      ctx.quadraticCurveTo(-headR - 8, headY + 24, -headR - 3, headY + 18);
      ctx.closePath();
    };
    hairLayers(ctx, hairC, path, headY - 37, headY + 28);
    ctx.strokeStyle = shade(hairC, -0.3);
    ctx.lineWidth = 1.5;
    [-1, 1].forEach(sd => {
      for (let i = 0; i < 3; i++) {
        const x0 = sd * (headR - 1 - i * 4);
        ctx.beginPath();
        ctx.moveTo(x0, headY - 10 + i * 2);
        ctx.quadraticCurveTo(x0 + sd * 6, headY + 2, x0 - sd * 2, headY + 12);
        ctx.quadraticCurveTo(x0 + sd * 4, headY + 20, x0 - sd * 1, headY + 27);
        ctx.stroke();
      }
    });
    capShine();
  } else if (style === 'undercut') {
    // Выбритый висок: объём сверху, короткая тень по бокам
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = hairC;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.ellipse(sd * headR * 0.92, headY - 6, 5, 14, sd * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    hairLayers(ctx, hairC, () => {
      ctx.beginPath();
      ctx.moveTo(-headR + 1, headY - 8);
      ctx.quadraticCurveTo(-headR - 1, headY - 34, 0, headY - 35);
      ctx.quadraticCurveTo(headR + 1, headY - 34, headR - 1, headY - 8);
      ctx.quadraticCurveTo(headR - 8, headY - 18, 2, headY - 22);
      ctx.quadraticCurveTo(-headR + 8, headY - 18, -headR + 1, headY - 8);
      ctx.closePath();
    }, headY - 37, headY - 6);
    ctx.strokeStyle = shade(hairC, -0.35);
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 6, headY - 22);
      ctx.quadraticCurveTo(i * 8, headY - 29, i * 7, headY - 33);
      ctx.stroke();
    }
    capShine();
  }
}

// ==================== ШЛЕМЫ ====================
// Металл шлема рисуется градиентом: свет сверху-слева, тень снизу-справа.
// Поверх — заклёпки, кромка и затылочная пластина.
function metalFill(ctx, hc, yTop, yBot) {
  const g = ctx.createLinearGradient(-14, yTop, 16, yBot);
  g.addColorStop(0, shade(hc, 0.34));
  g.addColorStop(0.42, hc);
  g.addColorStop(1, shade(hc, -0.3));
  return g;
}

// Ряд заклёпок по кромке
function rivets(ctx, x0, x1, y, n, color) {
  ctx.fillStyle = color || 'rgba(255,255,255,0.35)';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    ctx.beginPath();
    ctx.arc(x0 + (x1 - x0) * t, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Гребень-плюмаж: объёмная щётка из прядей, а не плоский клин
function helmetCrest(ctx, crest, headY, headR) {
  const topY = headY - headR - 20;
  ctx.fillStyle = crest;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, topY + 6);
  ctx.quadraticCurveTo(-2, topY - 22, 16, topY - 20);
  ctx.quadraticCurveTo(28, topY - 18, 30, topY - 4);
  ctx.quadraticCurveTo(14, topY - 2, 8, topY + 6);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = shade(crest, -0.35);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    ctx.beginPath();
    ctx.moveTo(-4 + t * 8, topY + 5);
    ctx.quadraticCurveTo(6 + t * 14, topY - 8 + t * 4, 12 + t * 18, topY - 18 + t * 12);
    ctx.stroke();
  }
}

// Детали наручей: рисуются в системе руки (предплечье вдоль оси Y).
// У каждого стиля свой силуэт, а не только цвет: обмотки, створки,
// сегменты, кольчуга, чешуя, наплечник, шины, ламелляр.
function drawArmSchoolDetail(ctx, arms, hx, hy) {
  if (!arms) return;
  const vis = arms.vis;
  const KNOWN = ['medieval', 'china', 'rus', 'mongol',
    'leatherguard', 'wraps', 'armwraps', 'hideguard',
    'bronzebracer', 'bracers', 'manica', 'gladmanica', 'vambrace',
    'goldarm', 'titanarm', 'chainsleeve', 'scalearm', 'pauldron',
    'splintarm', 'lamellararm', 'fauldarm'];
  if (!KNOWN.includes(vis)) return;
  const trim = arms.trim || '#c9a45c';
  const col = arms.color || '#8a7a66';
  ctx.save();
  ctx.translate(hx * 0.75, hy - 8);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;

  // --- Ткань и кожа: мягкие силуэты, без металлического блеска ---
  if (vis === 'wraps' || vis === 'armwraps') {
    const fine = vis === 'armwraps';
    // Основа — полоса ткани/ремней вокруг предплечья
    ctx.fillStyle = shade(col, -0.08);
    roundRect(ctx, -6, -7.5, 12, 15, 3);
    ctx.fill();
    // Диагональные витки
    ctx.strokeStyle = fine ? shade(col, 0.24) : shade(col, -0.35);
    ctx.lineWidth = fine ? 1.6 : 2.4;
    for (let i = 0; i < (fine ? 5 : 3); i++) {
      const yy = -6 + i * (fine ? 3 : 4.6);
      ctx.beginPath();
      ctx.moveTo(-6, yy);
      ctx.lineTo(6, yy + (fine ? 2 : 3));
      ctx.stroke();
    }
    // Узел с хвостиком
    ctx.fillStyle = fine ? shade(col, 0.3) : '#e8dcc0';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(5.4, 4, 1.9, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }

  if (vis === 'leatherguard' || vis === 'hideguard') {
    const hard = vis === 'hideguard';
    ctx.fillStyle = hard ? shade(col, 0.14) : col;
    roundRect(ctx, -6, -7, 12, 14, hard ? 2.5 : 3.5);
    ctx.fill(); ctx.stroke();
    if (hard) {
      // Жёсткий щиток: прошивка по периметру и заклёпки
      ctx.strokeStyle = 'rgba(240,232,208,0.7)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2.4, 2]);
      roundRect(ctx, -4.6, -5.6, 9.2, 11.2, 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = trim;
      [-3, 0, 3].forEach(yy => {
        ctx.beginPath(); ctx.arc(0, yy, 1.1, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      // Ремни крест-накрест
      ctx.strokeStyle = shade(col, -0.42);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-5, -6); ctx.lineTo(5, 6);
      ctx.moveTo(5, -6); ctx.lineTo(-5, 6);
      ctx.stroke();
      ctx.fillStyle = trim;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // --- Металлические створки: единая основа, разный декор ---
  if (['bronzebracer', 'bracers', 'vambrace', 'goldarm', 'titanarm', 'fauldarm'].includes(vis)) {
    const big = vis === 'titanarm';
    const w = big ? 15 : 12, h = big ? 17 : 14;
    ctx.fillStyle = metalFill(ctx, col, -h / 2 - 4, h / 2 + 4);
    roundRect(ctx, -w / 2, -h / 2, w, h, big ? 4.5 : 4);
    ctx.fill(); ctx.stroke();
    // Фаска-блик по левому краю
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    roundRect(ctx, -w / 2 + 1.4, -h / 2 + 1.6, 3, h - 3.2, 1.4);
    ctx.fill();

    if (vis === 'bronzebracer') {
      // Две створки и крупные заклёпки
      ctx.strokeStyle = shade(col, -0.4);
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
      ctx.fillStyle = trim;
      [-2.6, 2.6].forEach(yy => {
        ctx.beginPath(); ctx.arc(0, yy, 1.5, 0, Math.PI * 2); ctx.fill();
      });
    } else if (vis === 'bracers') {
      // Гладкая сталь: только фаска и узкий ремень
      ctx.strokeStyle = shade(col, -0.35);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 1.5, h / 2 - 3.4);
      ctx.lineTo(w / 2 - 1.5, h / 2 - 3.4);
      ctx.stroke();
    } else if (vis === 'vambrace') {
      // Толстая створка: два ремня с пряжками
      ctx.fillStyle = '#5a3f22';
      [-1, 1].forEach(sd => {
        roundRect(ctx, -w / 2 - 0.6, sd * (h / 2 - 4.6), w + 1.2, 3, 1.2);
        ctx.fill();
      });
      ctx.fillStyle = trim;
      roundRect(ctx, w / 2 - 3.4, -h / 2 + 3, 2.4, 3, 1);
      ctx.fill();
    } else if (vis === 'goldarm') {
      // Золотая гравировка: завитки и самоцвет
      ctx.strokeStyle = shade(col, -0.5);
      ctx.lineWidth = 1.3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 3, i * 4);
        ctx.quadraticCurveTo(0, i * 4 + 2.6, w / 2 - 3, i * 4);
        ctx.stroke();
      }
      ctx.fillStyle = '#7a1a12';
      ctx.beginPath(); ctx.arc(0, -h / 2 + 3.4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,190,0.9)';
      ctx.beginPath(); ctx.arc(-0.6, -h / 2 + 3, 0.7, 0, Math.PI * 2); ctx.fill();
    } else if (vis === 'titanarm') {
      // Огромные наручи с шипами по краю
      ctx.fillStyle = '#cfd8e0';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.8;
      [-1, 1].forEach(sd => {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(sd * (w / 2 - 1), i * 4.4);
          ctx.lineTo(sd * (w / 2 + 4), i * 4.4 - 2);
          ctx.lineTo(sd * (w / 2 - 1), i * 4.4 - 4);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
      });
    } else {
      // fauldarm: оплечье сверху и гребень по створке
      ctx.fillStyle = shade(col, 0.18);
      ctx.beginPath();
      ctx.moveTo(-w / 2 - 1, -h / 2 + 1);
      ctx.quadraticCurveTo(0, -h / 2 - 6.5, w / 2 + 1, -h / 2 + 1);
      ctx.quadraticCurveTo(0, -h / 2 - 2, -w / 2 - 1, -h / 2 + 1);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2 + 2);
      ctx.lineTo(0, h / 2 - 2);
      ctx.stroke();
      ctx.fillStyle = trim;
      [-1, 1].forEach(sd => {
        ctx.beginPath(); ctx.arc(sd * 3.4, 2.6, 1.2, 0, Math.PI * 2); ctx.fill();
      });
    }
    ctx.restore();
    return;
  }

  // --- Сегментные маники: набор горизонтальных пластин ---
  if (vis === 'manica' || vis === 'gladmanica') {
    const bronze = vis === 'gladmanica';
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = bronze && i % 2 ? trim : shade(col, i % 2 ? 0.16 : -0.04);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      roundRect(ctx, -6, -7 + i * 3.7, 12, 3.3, 1.4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      roundRect(ctx, -5, -6.5 + i * 3.7, 6, 1, 0.5);
      ctx.fill();
    }
    if (bronze) {
      ctx.fillStyle = trim;
      ctx.beginPath(); ctx.arc(0, 0.4, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }

  // --- Кольчужный рукав ---
  if (vis === 'chainsleeve') {
    ctx.fillStyle = shade(col, -0.06);
    roundRect(ctx, -6, -7.5, 12, 15, 4);
    ctx.fill();
    ctx.strokeStyle = shade(col, -0.42);
    ctx.lineWidth = 1.1;
    for (let row = 0; row < 6; row++) {
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.arc(k * 4 + (row % 2 ? 2 : 0), -6 + row * 2.4, 1.7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRect(ctx, -6, -7.5, 12, 15, 4);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // --- Чешуйчатый наруч ---
  if (vis === 'scalearm') {
    ctx.fillStyle = shade(col, -0.05);
    roundRect(ctx, -6, -7.5, 12, 15, 4);
    ctx.fill();
    for (let row = 0; row < 4; row++) {
      for (let k = -1; k <= 1; k++) {
        ctx.fillStyle = row % 2 ? shade(col, 0.14) : col;
        ctx.strokeStyle = shade(col, -0.42);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(k * 4 + (row % 2 ? 2 : 0), -5.4 + row * 3.4, 2.4, 0, Math.PI);
        ctx.fill(); ctx.stroke();
      }
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRect(ctx, -6, -7.5, 12, 15, 4);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // --- Шинный наруч: полосы на кожаной основе ---
  if (vis === 'splintarm') {
    ctx.fillStyle = '#6a4a2c';
    roundRect(ctx, -6, -7.5, 12, 15, 3.5);
    ctx.fill(); ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = metalFill(ctx, col, -8, 8);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4;
      roundRect(ctx, i * 3.7 - 1.3, -6.4, 2.6, 13, 1.2);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = trim;
    ctx.beginPath(); ctx.arc(0, 5.4, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  // --- Ламеллярные рукава: мелкая сетка пластин ---
  if (vis === 'lamellararm') {
    for (let row = 0; row < 4; row++) {
      for (let k = -1; k <= 1; k++) {
        ctx.fillStyle = row % 2 ? shade(col, 0.12) : shade(col, -0.08);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.1;
        roundRect(ctx, k * 4 - 1.9, -7 + row * 3.6, 3.8, 3.2, 1);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(k * 4 - 1.2, -6.4 + row * 3.6, 2.4, 0.8);
      }
    }
    ctx.strokeStyle = shade(col, -0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, -7.2); ctx.lineTo(-6, 7.2);
    ctx.moveTo(6, -7.2); ctx.lineTo(6, 7.2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // --- Наплечник: выпуклая створка сверху плюс наруч ---
  if (vis === 'pauldron') {
    ctx.fillStyle = metalFill(ctx, col, -10, 10);
    // Верхняя выпуклая створка
    ctx.beginPath();
    ctx.moveTo(-8, -3);
    ctx.quadraticCurveTo(-7, -11, 1, -11);
    ctx.quadraticCurveTo(8, -10, 8, -2);
    ctx.quadraticCurveTo(0, 1, -8, -3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-2, -7, 4.4, 2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Наруч ниже
    ctx.fillStyle = shade(col, -0.1);
    roundRect(ctx, -5.5, 0, 11, 8, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = trim;
    roundRect(ctx, -5.5, 4.4, 11, 1.8, 0.8);
    ctx.fill();
    ctx.restore();
    return;
  }

  // --- Школы: Средневековье, Китай, Русь, Монголия ---
  if (vis === 'medieval') {
    // Стальная створка с фаской и ремнём
    ctx.fillStyle = shade(arms.color, 0.22);
    roundRect(ctx, -6, -7, 12, 14, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    roundRect(ctx, -4, -5, 3, 9, 1.5);
    ctx.fill();
    ctx.fillStyle = trim;
    roundRect(ctx, -6, 2, 12, 2.6, 1.2);
    ctx.fill();
  } else if (vis === 'china') {
    // Лаковые пластины с золотыми заклёпками
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? shade(arms.color, -0.1) : shade(arms.color, 0.12);
      roundRect(ctx, -6, -7 + i * 5, 12, 4.4, 1.6);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = trim;
    ctx.beginPath(); ctx.arc(0, -4.8, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 4.8, 1.1, 0, Math.PI * 2); ctx.fill();
  } else if (vis === 'rus') {
    // Кольчужные кольца и медная бляха
    ctx.strokeStyle = shade(arms.color, -0.3);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-6, -5 + i * 5);
      ctx.lineTo(6, -4 + i * 5);
      ctx.stroke();
    }
    ctx.fillStyle = trim;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    // Кожа с меховой опушкой
    ctx.fillStyle = shade(arms.color, -0.12);
    roundRect(ctx, -6, -7, 12, 14, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b8a888';
    roundRect(ctx, -6, -8, 12, 3.4, 1.6);
    ctx.fill();
    ctx.fillStyle = trim;
    roundRect(ctx, -1.6, 1, 3.2, 4, 1.2);
    ctx.fill();
  }
  ctx.restore();
}

// ==================== НОВЫЕ МОДЕЛИ ШЛЕМОВ ====================
// Каждый стиль — свой силуэт, а не перекраска. Возвращает true, если
// шлем отрисован здесь и старая ветка drawHelmet не нужна.
function drawHelmetModel(ctx, vis, helm, headY, headR) {
  const hc = helm.color || '#b0bac4';
  const trim = helm.trim || null;
  const R = headR;

  if (vis === 'headband') {
    // Повязка: узкая полоса на лбу с узлом и хвостиками
    ctx.fillStyle = hc;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-R - 1, headY - 12);
    ctx.quadraticCurveTo(0, headY - 20, R + 1, headY - 12);
    ctx.lineTo(R + 1, headY - 2);
    ctx.quadraticCurveTo(0, headY - 10, -R - 1, headY - 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Шов
    ctx.strokeStyle = shade(hc, -0.35);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(-R + 2, headY - 8);
    ctx.quadraticCurveTo(0, headY - 14, R - 2, headY - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    // Хвостики справа
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    [-1, 1].forEach((k, i) => {
      ctx.beginPath();
      ctx.moveTo(R - 1, headY - 7);
      ctx.quadraticCurveTo(R + 8 + i * 3, headY - 4 + k * 4, R + 4 + i * 4, headY + 8 + k * 3);
      ctx.stroke();
    });
    return true;
  }

  if (vis === 'leathercap') {
    // Кожаный шлем: округлый купол, шнуровка по шву, заклёпки, ремешок
    ctx.fillStyle = metalFill(ctx, hc, headY - 30, headY + 8);
    ctx.beginPath();
    ctx.ellipse(0, headY - 4, R + 2, R * 0.98, 0, Math.PI, 0);
    ctx.lineTo(R + 2, headY + 4);
    ctx.lineTo(-R - 2, headY + 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Центральный шов со шнуровкой
    ctx.strokeStyle = shade(hc, -0.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, headY - R - 1);
    ctx.lineTo(0, headY + 3);
    ctx.stroke();
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const yy = headY - R * 0.72 + i * 7;
      ctx.beginPath();
      ctx.moveTo(-3, yy); ctx.lineTo(3, yy + 4);
      ctx.moveTo(3, yy); ctx.lineTo(-3, yy + 4);
      ctx.stroke();
    }
    // Заклёпки по ободу
    ctx.fillStyle = '#c9a45c';
    rivets(ctx, -R + 2, R - 2, headY + 1, 5, '#c9a45c');
    // Ремешок под подбородок
    ctx.strokeStyle = shade(hc, -0.45);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-R + 1, headY + 3);
    ctx.quadraticCurveTo(0, headY + R * 0.9, R - 1, headY + 3);
    ctx.stroke();
    return true;
  }

  if (vis === 'spangen') {
    // Спангенхельм: купол из 4 клёпаных сегментов, обод и наносник
    ctx.fillStyle = metalFill(ctx, hc, headY - 30, headY + 6);
    ctx.beginPath();
    ctx.ellipse(0, headY - 4, R + 2, R * 1.02, 0, Math.PI, 0);
    ctx.lineTo(R + 2, headY + 4);
    ctx.lineTo(-R - 2, headY + 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Радиальные рёбра каркаса
    ctx.strokeStyle = shade(hc, -0.3);
    ctx.lineWidth = 2.6;
    [-0.62, 0, 0.62].forEach(k => {
      ctx.beginPath();
      ctx.moveTo(0, headY - R - 2);
      ctx.quadraticCurveTo(k * R * 1.1, headY - R * 0.4, k * (R + 1), headY + 2);
      ctx.stroke();
    });
    // Обод
    ctx.fillStyle = trim || shade(hc, -0.12);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    roundRect(ctx, -R - 2, headY - 1, R * 2 + 4, 6, 2);
    ctx.fill(); ctx.stroke();
    rivets(ctx, -R + 1, R - 1, headY + 2, 6, 'rgba(40,32,20,0.65)');
    // Наносник
    ctx.fillStyle = shade(hc, 0.14);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    roundRect(ctx, -2.6, headY - 1, 5.2, 17, 2);
    ctx.fill(); ctx.stroke();
    // Блик
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.45, headY - R * 0.55, 7, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  if (vis === 'thracian') {
    // Фракийский: узкий купол, высокий гребень вдоль головы, широкий назатыльник
    if (helm.crest) helmetCrest(ctx, helm.crest, headY, R);
    // Купол
    ctx.fillStyle = metalFill(ctx, hc, headY - R - 6, headY + R);
    ctx.beginPath();
    ctx.ellipse(0, headY + 1, R + 1, R * 1.06, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Поле-назатыльник сзади: широкий отворот
    ctx.fillStyle = shade(hc, -0.16);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-R - 2, headY + 4);
    ctx.quadraticCurveTo(-R - 12, headY + 14, -R + 4, headY + 18);
    ctx.lineTo(R - 2, headY + 12);
    ctx.quadraticCurveTo(R + 4, headY + 2, R + 2, headY - 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Решётка вместо лица
    ctx.fillStyle = '#241c15';
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, 2 + i * 7, headY - 4, 4.6, 15, 2);
      ctx.fill();
    }
    // Глазная щель
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(-10, headY - 1, 9, 6.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = trim || shade(hc, -0.34);
    roundRect(ctx, -R - 1, headY + R - 3, R * 2 + 2, 4, 2);
    ctx.fill();
    return true;
  }

  if (vis === 'sutton') {
    // Секуторский: полностью глухое лицо, круглые глазницы, без гребня
    ctx.fillStyle = metalFill(ctx, hc, headY - R - 8, headY + R + 4);
    ctx.beginPath();
    ctx.ellipse(0, headY + 1, R + 2, R * 1.1, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Две круглые глазницы с решёткой
    [-1, 1].forEach(sd => {
      ctx.fillStyle = '#1a1410';
      ctx.beginPath();
      ctx.arc(sd * 8, headY - 3, 6.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(hc, -0.25);
      ctx.lineWidth = 1.4;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(sd * 8 + i * 3, headY - 9);
        ctx.lineTo(sd * 8 + i * 3, headY + 3);
        ctx.stroke();
      }
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
    });
    // Выпуклые «брови» над глазницами
    ctx.strokeStyle = shade(hc, 0.2);
    ctx.lineWidth = 2.4;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.arc(sd * 8, headY - 3, 8.6, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    });
    // Клёпаный шов по центру
    ctx.strokeStyle = shade(hc, -0.32);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, headY - R - 4);
    ctx.lineTo(0, headY + R - 2);
    ctx.stroke();
    ctx.fillStyle = trim || shade(hc, -0.34);
    roundRect(ctx, -R - 1, headY + R + 1, R * 2 + 2, 4, 2);
    ctx.fill();
    return true;
  }

  if (vis === 'bascinet') {
    // Бацинет: вытянутый купол, подвижное забрало, кольчужная бармица
    ctx.fillStyle = metalFill(ctx, hc, headY - R - 20, headY + R);
    ctx.beginPath();
    ctx.moveTo(-R - 2, headY + 2);
    ctx.quadraticCurveTo(-R - 3, headY - R * 0.85, -3, headY - R - 14);
    ctx.quadraticCurveTo(0, headY - R - 19, 3, headY - R - 14);
    ctx.quadraticCurveTo(R + 3, headY - R * 0.85, R + 2, headY + 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Забрало-козырёк
    ctx.fillStyle = shade(hc, -0.08);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-R + 1, headY - 2);
    ctx.quadraticCurveTo(0, headY - 12, R - 1, headY - 2);
    ctx.quadraticCurveTo(R - 2, headY + 10, 0, headY + 12);
    ctx.quadraticCurveTo(-R + 2, headY + 10, -R + 1, headY - 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Смотровая щель
    ctx.fillStyle = '#0e0a07';
    roundRect(ctx, -R + 3, headY - 2, R * 2 - 6, 4, 2);
    ctx.fill();
    // Петли забрала
    ctx.fillStyle = trim || '#8a95a0';
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.arc(sd * (R - 2), headY + 6, 2.6, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    // Бармица: кольчуга по бокам
    ctx.strokeStyle = shade(hc, -0.34);
    ctx.lineWidth = 1.2;
    [-1, 1].forEach(sd => {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(sd * (R + 1) - sd * (i % 2) * 2, headY + 4 + i * 4, 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.fillStyle = 'rgba(255,255,255,0.36)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.4, headY - R * 0.6, 6, 10, -0.4, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  if (vis === 'sallet') {
    // Салад: купол с длинным «хвостом» сзади и широким козырьком
    ctx.fillStyle = metalFill(ctx, hc, headY - R - 8, headY + R);
    ctx.beginPath();
    ctx.moveTo(-R - 1, headY - 2);
    ctx.quadraticCurveTo(-R - 3, headY - R * 0.9, 0, headY - R - 8);
    ctx.quadraticCurveTo(R + 3, headY - R * 0.9, R + 1, headY - 2);
    ctx.lineTo(R + 12, headY + 10);
    ctx.quadraticCurveTo(R - 2, headY + 8, -R - 1, headY + 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Козырёк
    ctx.fillStyle = shade(hc, 0.14);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-R + 1, headY - 3);
    ctx.quadraticCurveTo(0, headY - 9, R - 2, headY - 3);
    ctx.lineTo(R + 9, headY + 3);
    ctx.quadraticCurveTo(0, headY + 1, -R + 1, headY - 3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Шов и заклёпки
    ctx.strokeStyle = shade(hc, -0.3);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-R * 0.5, headY - R * 0.75);
    ctx.quadraticCurveTo(0, headY - R * 0.9, R * 0.5, headY - R * 0.75);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.45, headY - R * 0.5, 6, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  if (vis === 'imperialcrown') {
    // Имперский венец: лавровый венок из листьев + ленты
    ctx.fillStyle = metalFill(ctx, hc, headY - 30, headY - 6);
    // Обруч
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    roundRect(ctx, -R - 1, headY - 16, R * 2 + 2, 8, 3);
    ctx.fill(); ctx.stroke();
    // Листья лавра по дуге
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const ang = Math.PI * (1.05 + t * 0.9);
      const lx = Math.cos(ang) * (R + 3);
      const ly = headY - 6 + Math.sin(ang) * (R * 0.95);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(ang + Math.PI / 2 + (i % 2 ? 0.5 : -0.5));
      ctx.fillStyle = i % 2 ? hc : shade(hc, 0.16);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.6, 6, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // Ленты сзади
    ctx.fillStyle = trim || '#c0392b';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.8;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * 4, headY - 10);
      ctx.quadraticCurveTo(sd * 12, headY + 6, sd * 9, headY + 22);
      ctx.lineTo(sd * 5, headY + 20);
      ctx.quadraticCurveTo(sd * 7, headY + 4, sd * 1, headY - 10);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    return true;
  }

  if (vis === 'turban') {
    // Чалма: несколько слоёв ткани витками, узел и свисающий хвост
    ctx.fillStyle = hc;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.ellipse(0, headY - 10, R + 4, R * 0.82, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Витки
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i % 2 ? shade(hc, 0.14) : shade(hc, -0.2);
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.ellipse(0, headY - 16 + i * 5.4, R + 3 - i * 1.2, R * 0.2, -0.06, Math.PI * 1.02, Math.PI * 1.98);
      ctx.stroke();
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    // Узел справа
    ctx.fillStyle = shade(hc, 0.1);
    ctx.beginPath();
    ctx.ellipse(R * 0.75, headY - 6, 5, 4.4, 0.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Хвост ткани
    ctx.fillStyle = shade(hc, -0.12);
    ctx.beginPath();
    ctx.moveTo(R * 0.8, headY - 2);
    ctx.quadraticCurveTo(R + 8, headY + 10, R + 2, headY + 20);
    ctx.lineTo(R - 3, headY + 14);
    ctx.quadraticCurveTo(R + 1, headY + 6, R * 0.7, headY + 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    return true;
  }

  if (vis === 'brimhat') {
    // Шляпа: широкие поля, коническая тулья, шнур с бляхой
    ctx.fillStyle = shade(hc, -0.08);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.ellipse(0, headY - 8, R + 17, 8.5, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Тулья
    ctx.fillStyle = metalFill(ctx, hc, headY - 34, headY - 4);
    ctx.beginPath();
    ctx.moveTo(-R * 0.72, headY - 8);
    ctx.quadraticCurveTo(-R * 0.6, headY - 30, 0, headY - 32);
    ctx.quadraticCurveTo(R * 0.6, headY - 30, R * 0.72, headY - 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Лента вокруг тульи
    ctx.fillStyle = trim || shade(hc, -0.35);
    roundRect(ctx, -R * 0.74, headY - 15, R * 1.48, 5, 2);
    ctx.fill();
    // Бляха
    ctx.fillStyle = '#c9a45c';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, headY - 12.5, 2.8, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Тень от полей на лице
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, headY - 4, R, 6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    return true;
  }

  if (vis === 'furhat') {
    // Треух: меховая шапка с наушниками и медной бляхой
    ctx.fillStyle = metalFill(ctx, hc, headY - 30, headY + 4);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.ellipse(0, headY - 8, R + 2, R * 0.86, 0, Math.PI, 0);
    ctx.lineTo(R + 2, headY + 2);
    ctx.lineTo(-R - 2, headY + 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Меховая опушка
    ctx.fillStyle = trim || '#b8a888';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-R - 4, headY + 1);
    for (let i = 0; i <= 7; i++) {
      const px = -R - 4 + ((R * 2 + 8) * i) / 7;
      ctx.quadraticCurveTo(px + 2, headY + 9, px + 6, headY + 1);
    }
    ctx.lineTo(R + 4, headY - 4);
    ctx.lineTo(-R - 4, headY - 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Наушники
    ctx.fillStyle = shade(hc, -0.12);
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * (R - 2), headY + 1);
      ctx.quadraticCurveTo(sd * (R + 6), headY + 12, sd * (R - 1), headY + 20);
      ctx.quadraticCurveTo(sd * (R - 6), headY + 10, sd * (R - 5), headY + 1);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    // Бляха на лбу
    ctx.fillStyle = '#c9a45c';
    ctx.beginPath();
    ctx.arc(0, headY - 6, 3.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    return true;
  }

  if (vis === 'barbute') {
    // Барбют: высокий колокол, Т-образный вырез, без забрала
    ctx.fillStyle = metalFill(ctx, hc, headY - R - 10, headY + R + 6);
    ctx.beginPath();
    ctx.moveTo(-R - 2, headY + 8);
    ctx.quadraticCurveTo(-R - 3, headY - R * 0.9, 0, headY - R - 8);
    ctx.quadraticCurveTo(R + 3, headY - R * 0.9, R + 2, headY + 8);
    ctx.quadraticCurveTo(0, headY + 14, -R - 2, headY + 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Т-образный вырез
    ctx.fillStyle = '#171310';
    roundRect(ctx, -R + 2, headY - 8, R * 2 - 4, 7, 3);
    ctx.fill();
    roundRect(ctx, -3, headY - 8, 6, 20, 3);
    ctx.fill();
    // Кромка выреза
    ctx.strokeStyle = trim || shade(hc, -0.3);
    ctx.lineWidth = 1.8;
    roundRect(ctx, -R + 2, headY - 8, R * 2 - 4, 7, 3);
    ctx.stroke();
    // Гребень-шов
    ctx.strokeStyle = shade(hc, -0.26);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, headY - R - 6);
    ctx.lineTo(0, headY - 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.42, headY - R * 0.5, 7, 9, -0.4, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  if (vis === 'kabuto') {
    // Кабуто: чаша из пластин, широкий назатыльник, полумесяц на лбу
    ctx.fillStyle = metalFill(ctx, hc, headY - R - 8, headY + 4);
    ctx.beginPath();
    ctx.ellipse(0, headY - 4, R + 2, R * 0.98, 0, Math.PI, 0);
    ctx.lineTo(R + 2, headY + 2);
    ctx.lineTo(-R - 2, headY + 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Пластины-рёбра купола
    ctx.strokeStyle = shade(hc, 0.3);
    ctx.lineWidth = 1.8;
    [-0.66, -0.33, 0, 0.33, 0.66].forEach(k => {
      ctx.beginPath();
      ctx.moveTo(k * (R + 1), headY + 1);
      ctx.quadraticCurveTo(k * R * 0.8, headY - R * 0.5, 0, headY - R - 1);
      ctx.stroke();
    });
    // Назатыльник: слоистые лаковые полосы
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? shade(hc, 0.16) : shade(hc, -0.06);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      roundRect(ctx, -R - 6 - i * 2, headY + 2 + i * 5, (R + 6 + i * 2) * 2, 6, 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = trim || '#c9a45c';
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.arc(k * 8, headY + 5 + i * 5, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Полумесяц (маэдатэ)
    ctx.fillStyle = trim || '#c9a45c';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, headY - R - 6);
    ctx.quadraticCurveTo(0, headY - R - 20, 13, headY - R - 6);
    ctx.quadraticCurveTo(0, headY - R - 12, -13, headY - R - 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.4, headY - R * 0.55, 6, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  return false;
}

function drawHelmet(ctx, helm, headY, headR) {
  const hc = helm.color || '#b0bac4';
  const vis = helm.vis || 'nasal';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4;

  // Новые силуэты шлемов живут в отдельной функции
  if (drawHelmetModel(ctx, vis, helm, headY, headR)) return;

  if (vis === 'hood') {
    // Капюшон: ткань складками, с тенью внутри
    ctx.fillStyle = hc;
    ctx.beginPath();
    ctx.moveTo(-headR - 5, headY + 14);
    ctx.quadraticCurveTo(-headR - 9, headY - 36, 0, headY - 38);
    ctx.quadraticCurveTo(headR + 9, headY - 36, headR + 5, headY + 14);
    ctx.quadraticCurveTo(headR - 2, headY - 8, 0, headY - 10);
    ctx.quadraticCurveTo(-headR + 2, headY - 8, -headR - 5, headY + 14);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Складки ткани
    ctx.strokeStyle = shade(hc, -0.28);
    ctx.lineWidth = 1.8;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 9, headY - 32);
      ctx.quadraticCurveTo(i * 12 + 3, headY - 16, i * 10 + 5, headY + 8);
      ctx.stroke();
    }
    // Тень у лица
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, headY - 2, headR * 0.85, headR * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (vis === 'cap') {
    // Простой колпак: войлок или кожа, с ободом и завязками
    ctx.fillStyle = metalFill(ctx, hc, headY - 24, headY + 4);
    ctx.beginPath();
    ctx.ellipse(0, headY - 4, headR + 2, headR * 0.92, 0, Math.PI, 0);
    ctx.lineTo(headR + 2, headY + 4);
    ctx.lineTo(-headR - 2, headY + 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Обод
    ctx.fillStyle = shade(hc, -0.28);
    roundRect(ctx, -headR - 3, headY - 4, headR * 2 + 6, 7, 3);
    ctx.fill(); ctx.stroke();
    rivets(ctx, -headR + 1, headR - 1, headY - 1, 5, 'rgba(230,220,200,0.7)');
    ctx.fillStyle = helm.trim || '#a9b3bd';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(i * 11, headY - 10, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // Складка макушки
    ctx.strokeStyle = shade(hc, -0.2);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-6, headY - 26);
    ctx.quadraticCurveTo(0, headY - 29, 7, headY - 25);
    ctx.stroke();
    return;
  }

  if (vis === 'nasal') {
    // Кавалерийский шлем с наносником и нащёчниками
    ctx.fillStyle = metalFill(ctx, hc, headY - 26, headY + 6);
    ctx.beginPath();
    ctx.ellipse(0, headY - 6, headR + 3, headR * 0.95, 0, Math.PI, 0);
    ctx.lineTo(headR + 3, headY + 2);
    ctx.lineTo(-headR - 3, headY + 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Нащёчники: две пластины по бокам лица
    [-1, 1].forEach(sd => {
      ctx.fillStyle = shade(hc, -0.1);
      ctx.beginPath();
      ctx.moveTo(sd * (headR - 1), headY - 2);
      ctx.quadraticCurveTo(sd * (headR + 5), headY + 12, sd * (headR - 2), headY + 20);
      ctx.quadraticCurveTo(sd * (headR - 8), headY + 10, sd * (headR - 6), headY - 2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sd * (headR + 1), headY + 2);
      ctx.lineTo(sd * (headR - 2), headY + 16);
      ctx.stroke();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 4;
    });

    // Наносник
    ctx.fillStyle = shade(hc, 0.14);
    roundRect(ctx, -3, headY - 6, 6, 20, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, -2, headY - 4, 2, 14, 1);
    ctx.fill();

    if (helm.trim) {
      ctx.fillStyle = helm.trim;
      roundRect(ctx, -headR - 1, headY - 12, headR * 2 + 2, 4, 2);
      ctx.fill();
      rivets(ctx, -headR + 2, headR - 2, headY - 10, 5, 'rgba(255,255,255,0.5)');
    }
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.beginPath(); ctx.ellipse(-9, headY - 21, 8, 4, -0.5, 0, Math.PI * 2); ctx.fill();
    return;
  }

  if (vis === 'kettle') {
    // Шапель: купол и широкие поля
    ctx.fillStyle = metalFill(ctx, hc, headY - 22, headY + 4);
    ctx.beginPath();
    ctx.ellipse(0, headY - 4, headR + 2, headR * 0.9, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Поля с утолщённой кромкой
    ctx.fillStyle = shade(hc, -0.08);
    ctx.beginPath();
    ctx.ellipse(0, headY + 2, headR + 16, 9, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = shade(hc, 0.22);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, headY + 1, headR + 13, 6.5, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    // Стойка-шишак на макушке
    ctx.fillStyle = shade(hc, 0.2);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(0, headY - 24, 5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.ellipse(-8, headY - 20, 9, 4, -0.4, 0, Math.PI * 2); ctx.fill();
    rivets(ctx, -headR + 4, headR - 4, headY + 3, 6, 'rgba(20,16,12,0.5)');
    return;
  }

  if (vis === 'murmillo') {
    if (helm.crest) helmetCrest(ctx, helm.crest, headY, headR);

    // Гладкий купол с высоким гребнем-перегородкой
    ctx.fillStyle = metalFill(ctx, hc, headY - 4, headY + headR);
    ctx.beginPath();
    ctx.ellipse(0, headY + 2, headR + 3, headR * 1.02, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Пластина-перегородка по центру
    ctx.fillStyle = shade(hc, 0.2);
    ctx.beginPath();
    ctx.moveTo(-4, headY - headR - 2);
    ctx.quadraticCurveTo(0, headY - headR - 12, 4, headY - headR - 2);
    ctx.lineTo(3, headY - 2);
    ctx.lineTo(-3, headY - 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Решётка для глаз
    ctx.fillStyle = '#241c15';
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, 4 + i * 7, headY - 6, 4.5, 15, 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(-10, headY - 2, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Кромка по низу
    ctx.fillStyle = helm.trim || shade(hc, -0.3);
    roundRect(ctx, -headR - 2, headY + headR - 4, headR * 2 + 4, 5, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.ellipse(-12, headY - 18, 8, 5, -0.45, 0, Math.PI * 2); ctx.fill();
    return;
  }

  if (vis === 'greathelm') {
    // Большой шлем: глухой купол, смотровая щель, дыхательные отверстия
    ctx.fillStyle = metalFill(ctx, hc, headY - headR - 12, headY + headR + 6);
    roundRect(ctx, -headR - 3, headY - headR - 12, (headR + 3) * 2, headR * 2 + 16, 9);
    ctx.fill(); ctx.stroke();

    // Верхняя пластина-навершие
    ctx.fillStyle = shade(hc, 0.16);
    ctx.beginPath();
    ctx.moveTo(-headR + 1, headY - headR - 11);
    ctx.quadraticCurveTo(0, headY - headR - 20, headR - 1, headY - headR - 11);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Смотровая щель с тенью
    ctx.fillStyle = '#0e0a07';
    roundRect(ctx, -headR + 2, headY - 5, (headR - 2) * 2, 7, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, -headR + 2, headY - 5, (headR - 2) * 2, 2, 1);
    ctx.fill();

    // Дыхательные отверстия: две колонки
    ctx.fillStyle = '#1a1410';
    [-1, 1].forEach(sd => {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(sd * (headR - 8), headY + 6 + i * 5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Кромка и заклёпки
    ctx.fillStyle = shade(hc, -0.32);
    roundRect(ctx, -headR - 3, headY + headR + 1, (headR + 3) * 2, 4, 2);
    ctx.fill();
    rivets(ctx, -headR + 4, headR - 4, headY - headR - 4, 6, 'rgba(255,255,255,0.4)');

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.5, headY - headR * 0.55, 7, 11, -0.35, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (vis === 'horned') {
    // Рогатый шлем: глухой купол, широкий вырез, два рога
    ctx.fillStyle = metalFill(ctx, hc, headY - headR - 10, headY + headR + 4);
    roundRect(ctx, -headR - 2, headY - headR - 10, (headR + 2) * 2, headR * 2 + 12, 8);
    ctx.fill(); ctx.stroke();

    // Вырез для лица с неровным краем
    ctx.fillStyle = '#1a1410';
    roundRect(ctx, -headR + 3, headY - 6, (headR - 3) * 2, 8, 3);
    ctx.fill();

    // Рога: слоистые, с кольцами роста
    [-1, 1].forEach(sd => {
      ctx.fillStyle = '#f2e6cc';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(sd * (headR - 2), headY - headR - 6);
      ctx.quadraticCurveTo(sd * (headR + 26), headY - headR - 32, sd * (headR + 10), headY - headR - 42);
      ctx.quadraticCurveTo(sd * (headR + 4), headY - headR - 24, sd * (headR - 6), headY - headR - 10);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Кольца на роге
      ctx.strokeStyle = 'rgba(150,120,80,0.75)';
      ctx.lineWidth = 1.6;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        ctx.beginPath();
        ctx.moveTo(sd * (headR - 1 + t * 10), headY - headR - 8 - t * 10);
        ctx.quadraticCurveTo(sd * (headR + 6 + t * 12), headY - headR - 14 - t * 14, sd * (headR + 12 + t * 10), headY - headR - 20 - t * 16);
        ctx.stroke();
      }
      // Основание рога — металлическая розетка
      ctx.fillStyle = shade(hc, -0.15);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(sd * (headR - 3), headY - headR - 7, 5, 3.4, sd * 0.4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });

    rivets(ctx, -headR + 4, headR - 4, headY + headR - 2, 5, 'rgba(255,255,255,0.4)');
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.45, headY - headR * 0.5, 6, 10, -0.35, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (vis === 'crown') {
    // Венец: золотой обруч с зубцами и самоцветами
    ctx.fillStyle = metalFill(ctx, hc, headY - 34, headY - 2);
    ctx.beginPath();
    ctx.moveTo(-headR, headY - 16);
    for (let i = 0; i <= 4; i++) {
      const px = -headR + (i * headR * 2) / 4;
      ctx.lineTo(px, headY - (i % 2 === 0 ? 34 : 22));
    }
    ctx.lineTo(headR, headY - 16);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Обруч
    ctx.fillStyle = shade(hc, -0.2);
    roundRect(ctx, -headR - 1, headY - 18, headR * 2 + 2, 8, 3);
    ctx.fill(); ctx.stroke();
    rivets(ctx, -headR + 3, headR - 3, headY - 14, 6, 'rgba(90,70,20,0.6)');

    // Самоцветы
    ctx.fillStyle = helm.trim || '#c0392b';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, headY - 20, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    [-1, 1].forEach(sd => {
      ctx.fillStyle = '#2e6a9a';
      ctx.beginPath(); ctx.arc(sd * (headR * 0.62), headY - 20, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    // Блик
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.7, headY - 26);
    ctx.lineTo(-headR * 0.5, headY - 30);
    ctx.stroke();
    return;
  }

  if (vis === 'hanhelm') {
    // Ханьский колпак: лаковая шапочка с широким назатыльником и шипом
    ctx.fillStyle = metalFill(ctx, hc, headY - 30, headY + 6);
    ctx.beginPath();
    ctx.moveTo(-headR - 2, headY + 2);
    ctx.quadraticCurveTo(-headR - 4, headY - 26, 0, headY - 30);
    ctx.quadraticCurveTo(headR + 4, headY - 26, headR + 2, headY + 2);
    ctx.quadraticCurveTo(0, headY + 8, -headR - 2, headY + 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Лаковая полоса по низу и золотая кромка
    ctx.fillStyle = helm.trim || '#e2b65a';
    roundRect(ctx, -headR - 2, headY - 4, headR * 2 + 4, 4, 2);
    ctx.fill();
    // Шип на макушке
    ctx.fillStyle = shade(hc, 0.25);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-4, headY - 28);
    ctx.lineTo(0, headY - 40);
    ctx.lineTo(4, headY - 28);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Бархатная кисточка сзади
    ctx.strokeStyle = helm.trim || '#e2b65a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(headR * 0.55 + i * 2, headY - 18);
      ctx.quadraticCurveTo(headR * 0.8 + i * 3, headY - 6, headR * 0.6 + i * 3, headY + 6);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(-9, headY - 20, 7, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (vis === 'rushelm') {
    // Русский шелом: высокий купол с навершием, бармица по бокам
    ctx.fillStyle = metalFill(ctx, hc, headY - 36, headY + 8);
    ctx.beginPath();
    ctx.moveTo(-headR - 1, headY + 1);
    ctx.quadraticCurveTo(-headR - 3, headY - 18, -6, headY - 34);
    ctx.quadraticCurveTo(0, headY - 40, 6, headY - 34);
    ctx.quadraticCurveTo(headR + 3, headY - 18, headR + 1, headY + 1);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Навершие-шишак
    ctx.fillStyle = helm.trim || '#c9a45c';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, headY - 39, 3.2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Кромка-обруч
    ctx.fillStyle = shade(hc, -0.3);
    roundRect(ctx, -headR - 1, headY - 3, headR * 2 + 2, 5, 2);
    ctx.fill();
    // Бармица: кольчужная сетка по бокам
    ctx.strokeStyle = shade(hc, -0.25);
    ctx.lineWidth = 1.3;
    [-1, 1].forEach(sd => {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(sd * (headR - 1), headY + 1 + i * 4);
        ctx.lineTo(sd * (headR - 8), headY + 3 + i * 4);
        ctx.stroke();
      }
    });
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.ellipse(-8, headY - 22, 6, 10, -0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (vis === 'mongolhelm') {
    // Монгольский шлем: купол на кожаной основе, меховой обод, наносник
    ctx.fillStyle = metalFill(ctx, hc, headY - 28, headY + 4);
    ctx.beginPath();
    ctx.ellipse(0, headY - 4, headR + 1, headR * 0.98, 0, Math.PI, 0);
    ctx.lineTo(headR + 1, headY + 3);
    ctx.lineTo(-headR - 1, headY + 3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Меховой обод: рыхлая полоса
    ctx.fillStyle = '#b8a888';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-headR - 3, headY + 3);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const px = -headR - 3 + (headR * 2 + 6) * t;
      ctx.quadraticCurveTo(px + 2, headY + 9, px + 5, headY + 3);
    }
    ctx.lineTo(headR + 3, headY - 2);
    ctx.lineTo(-headR - 3, headY - 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Наносник и кожаный ремешок
    ctx.fillStyle = shade(hc, -0.2);
    roundRect(ctx, -2.5, headY - 2, 5, 16, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = helm.trim || '#5a4a2e';
    roundRect(ctx, -headR - 2, headY - 8, headR * 2 + 4, 4, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.beginPath();
    ctx.ellipse(-9, headY - 18, 7, 5, -0.45, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
}

// ==================== БРОНЯ ТЕЛА ====================
// Материал доспеха зависит от тира: чем выше тир, тем чище металл,
// богаче краситель и больше отделки. Низкие тиры пыльные и латаные.
const ARMOR_TIER_STYLE = {
  1: { grime: '#5a5040', grimeAmt: 0.34, polish: 0.00, trim: null,      ornament: 0 },
  2: { grime: '#57503f', grimeAmt: 0.20, polish: 0.06, trim: '#8a7a5a', ornament: 1 },
  3: { grime: '#4a4638', grimeAmt: 0.09, polish: 0.14, trim: '#a08a5a', ornament: 2 },
  4: { grime: '#3a3a40', grimeAmt: 0.00, polish: 0.24, trim: '#c9a45c', ornament: 3 },
  5: { grime: '#2a2a30', grimeAmt: 0.00, polish: 0.34, trim: '#e8c65f', ornament: 5 }
};

const METAL_VIS = ['mail', 'chain', 'scale', 'dragon', 'lamellar', 'splint',
  'plate', 'lorica', 'imperial', 'bronze', 'manica', 'greaves', 'gold', 'bracers', 'medieval', 'rus',
  // Новые модели: металлические силуэты
  'cuirass', 'bronzemuscle', 'muscleiron', 'gothic', 'lamellariron', 'hauberk',
  'chainlong', 'brigandine', 'bracers', 'vambrace', 'pauldron', 'goldarm', 'titanarm',
  'bronzebracer', 'chainsleeve', 'scalearm', 'gladmanica', 'platelegs', 'irongreaves',
  'goldgreaves', 'imperialgreaves', 'titangreaves', 'chainlegs', 'scalelegs', 'splintlegs', 'samurai',
  'splintarm', 'lamellararm', 'fauldarm'];

function hex2rgb(hex) {
  if (!hex || hex[0] !== '#') return { r: 140, g: 120, b: 100 };
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgb2hex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

function mixColor(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

// Палитра доспеха: базовый тон, тень, блик, отделка и «богатство» тира
function armorPalette(item) {
  if (!item) return null;
  const tier = Math.max(1, Math.min(5, item.tier || 1));
  const st = ARMOR_TIER_STYLE[tier];
  const vis = item.vis || '';
  const metal = METAL_VIS.includes(vis);
  const raw = item.color || '#8a7a66';

  let base;
  if (metal) {
    // Металл: тир добавляет полировку и убирает грязь
    base = mixColor(raw, '#f2f6fa', st.polish * 0.55);
    if (st.grimeAmt > 0) base = mixColor(base, st.grime, st.grimeAmt);
  } else {
    // Ткань и кожа: тир добавляет насыщенности красителю
    base = tier >= 4 ? mixColor(raw, '#fff2d8', st.polish * 0.45)
      : mixColor(raw, '#6a5a44', st.grimeAmt * 0.55);
  }

  const trim = st.trim ? mixColor(st.trim, base, tier === 5 ? 0.12 : 0.34) : shade(base, -0.22);
  return {
    base,
    dark: shade(base, -0.34),
    light: shade(base, 0.32),
    deep: shade(base, -0.55),
    trim,
    tier,
    metal,
    polish: st.polish,
    ornament: st.ornament,
    grime: st.grimeAmt
  };
}

// Фактура материала: штрихи металла, плетение ткани, зерно кожи
function armorTexture(ctx, vis, pal, shoulder, waist, hipY) {
  const top = hipY - 47;
  const h = 44;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-shoulder, top, shoulder * 2, h);
  ctx.clip();

  if (vis === 'mail' || vis === 'chain') {
    // Мелкая «рябь» колец, тем заметнее, чем ниже тир
    ctx.globalAlpha = 0.16 + (1 - pal.tier / 5) * 0.14;
    ctx.fillStyle = pal.deep;
    for (let y = top; y < top + h; y += 3.2) {
      for (let x = -shoulder; x < shoulder; x += 4) {
        const off = (Math.round(y / 3.2) % 2) ? 2 : 0;
        ctx.fillRect(x + off, y, 1.1, 1.1);
      }
    }
  } else if (METAL_VIS.includes(vis)) {
    // Полированный металл: длинные блики вдоль корпуса
    if (pal.polish > 0.05) {
      ctx.globalAlpha = 0.10 + pal.polish * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const x = -shoulder + 6 + i * (shoulder * 2 - 12) / 5;
        ctx.beginPath();
        ctx.moveTo(x, top + 2);
        ctx.lineTo(x + 3, top + h - 4);
        ctx.stroke();
      }
    }
    // Тёмные разводы и забоины у простого металла
    if (pal.grime > 0.05) {
      ctx.globalAlpha = pal.grime * 0.55;
      ctx.fillStyle = pal.deep;
      for (let i = 0; i < 9; i++) {
        const px = -shoulder + ((i * 37) % 100) / 100 * shoulder * 2;
        const py = top + ((i * 53) % 100) / 100 * h;
        ctx.beginPath();
        ctx.ellipse(px, py, 2 + (i % 3), 1.2 + (i % 2), i, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (vis === 'tunic' || vis === 'rags' || vis === 'gambeson' || vis === 'quilted') {
    // Ткань: поперечные нити основы
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1;
    for (let y = top; y < top + h; y += 3) {
      ctx.beginPath();
      ctx.moveTo(-shoulder, y);
      ctx.lineTo(shoulder, y);
      ctx.stroke();
    }
  } else {
    // Кожа: зерно и заломы
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = pal.deep;
    for (let i = 0; i < 26; i++) {
      const px = -shoulder + ((i * 41) % 100) / 100 * shoulder * 2;
      const py = top + ((i * 61) % 100) / 100 * h;
      ctx.beginPath();
      ctx.arc(px, py, 0.9 + (i % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Отделка по тиру: нашивки, заклёпки, гравировка, самоцвет
function armorOrnament(ctx, vis, pal, shoulder, waist, hipY) {
  if (pal.ornament <= 0) return;
  const n = pal.ornament;

  // Кромка по подолу и вороту — со 2-го тира
  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = n >= 4 ? 2.6 : 1.8;
  ctx.beginPath();
  ctx.moveTo(-waist + 1, hipY - 5);
  ctx.quadraticCurveTo(0, hipY - 1, waist - 1, hipY - 5);
  ctx.stroke();
  if (n >= 3) {
    ctx.beginPath();
    ctx.moveTo(-shoulder * 0.86, hipY - 47);
    ctx.quadraticCurveTo(0, hipY - 51, shoulder * 0.86, hipY - 47);
    ctx.stroke();
  }

  // Заклёпки по кромке: 3 → 5 → 8
  const rivetCount = n >= 5 ? 8 : n >= 4 ? 6 : n >= 3 ? 5 : n >= 2 ? 3 : 0;
  if (rivetCount) {
    ctx.fillStyle = n >= 4 ? pal.trim : 'rgba(30,24,16,0.65)';
    for (let i = 0; i < rivetCount; i++) {
      const t = (i + 0.5) / rivetCount;
      const x = -waist + 3 + (waist * 2 - 6) * t;
      ctx.beginPath();
      ctx.arc(x, hipY - 6, n >= 4 ? 1.6 : 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Нашивка/накладка на груди — с 3-го тира
  if (n >= 3) {
    ctx.fillStyle = pal.trim;
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, hipY - 32, n >= 5 ? 8 : 6, n >= 5 ? 9 : 7, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(-2, hipY - 34, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Гравировка по борту — 4-й тир и выше
  if (n >= 4) {
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.85;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * shoulder * 0.62, hipY - 44);
      ctx.quadraticCurveTo(sd * shoulder * 0.9, hipY - 30, sd * shoulder * 0.68, hipY - 10);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const yy = hipY - 40 + i * 11;
        ctx.beginPath();
        ctx.arc(sd * shoulder * 0.72, yy, 1.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  // Самоцвет и золотое сияние — только легендарный
  if (n >= 5) {
    ctx.fillStyle = '#c0392b';
    ctx.strokeStyle = '#7a1a12';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, hipY - 32, 2.6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,190,0.9)';
    ctx.beginPath();
    ctx.arc(-0.8, hipY - 33, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Каждый тип брони рисуется в слои: форма, фактура материала, отделка по тиру.
function drawBodyArmorDetail(ctx, body, shoulder, waist, hipY) {
  const pal = armorPalette(body);
  const c = pal.base;
  const dark = pal.dark;
  const light = pal.light;
  const vis = body.vis;

  // Общая подсветка: слева сверху светлее, справа снизу темнее
  const sheen = (x, y, rx, ry, rot) => {
    ctx.fillStyle = `rgba(255,255,255,${0.14 + pal.polish * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || -0.4, 0, Math.PI * 2);
    ctx.fill();
  };
  // Кромка снизу — тёмная полоса, «подрезающая» силуэт
  const hem = (y, h) => {
    ctx.fillStyle = dark;
    roundRect(ctx, -waist + 1, y, waist * 2 - 2, h || 4, 2);
    ctx.fill();
  };

  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 2.4;

  if (vis === 'mail' || vis === 'chain' || vis === 'chainlong' || vis === 'hauberk') {
    // Кольчуга: плетение «в шахматку» с блеском на кольцах
    const step = 7;
    for (let yy = hipY - 46; yy < hipY; yy += step) {
      for (let xx = -shoulder; xx < shoulder; xx += step) {
        const off = (Math.round((yy - hipY) / step) % 2) ? step / 2 : 0;
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(xx + off, yy, step * 0.34, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.16 + pal.polish * 0.7})`;
    ctx.lineWidth = 1.2;
    for (let yy = hipY - 44; yy < hipY; yy += step * 2) {
      for (let xx = -shoulder + 3; xx < shoulder; xx += step * 2) {
        ctx.beginPath();
        ctx.arc(xx, yy, 2.2, Math.PI * 1.1, Math.PI * 1.7);
        ctx.stroke();
      }
    }
    // Ворот и подол
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-shoulder + 3, hipY - 45);
    ctx.quadraticCurveTo(0, hipY - 40, shoulder - 3, hipY - 45);
    ctx.stroke();
    hem(hipY - 4, 4);

    // Хауберк: кольчужный подшлемник-капюшон поверх плеч
    if (vis === 'hauberk') {
      ctx.fillStyle = shade(c, 0.05);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-shoulder * 0.5, hipY - 44);
      ctx.quadraticCurveTo(0, hipY - 58, shoulder * 0.5, hipY - 44);
      ctx.quadraticCurveTo(shoulder * 0.3, hipY - 40, 0, hipY - 42);
      ctx.quadraticCurveTo(-shoulder * 0.3, hipY - 40, -shoulder * 0.5, hipY - 44);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  } else if (vis === 'scale' || vis === 'dragon') {
    // Чешуя: набегающие ряды с бликом на каждой чешуйке
    for (let row = 0; row < 6; row++) {
      for (let i = -4; i <= 4; i++) {
        const sx = i * 8 + (row % 2 ? 4 : 0);
        const sy = hipY - 46 + row * 8;
        ctx.fillStyle = row % 2 ? shade(c, 0.08) : c;
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(sx, sy, 4.6, 0, Math.PI);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.22 + pal.polish * 0.5})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(sx - 1, sy - 0.5, 2.6, Math.PI * 1.15, Math.PI * 1.65);
        ctx.stroke();
      }
    }
    if (vis === 'dragon') {
      // Чешуя дракона: радужные искры
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(180,255,210,0.5)' : 'rgba(255,220,150,0.45)';
        ctx.beginPath();
        ctx.arc(-shoulder * 0.62 + i * 9, hipY - 32 + (i % 2) * 9, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    hem(hipY - 4, 4);
  } else if (vis === 'lamellar' || vis === 'splint' || vis === 'lamellariron' || vis === 'splintlegs') {
    // Ламелляр: пластины внахлёст, каждая с фаской и заклёпками
    for (let row = 0; row < 6; row++) {
      for (let i = -2; i <= 2; i++) {
        const px = i * 11 - 5;
        const py = hipY - 46 + row * 8;
        ctx.fillStyle = row % 2 ? shade(c, 0.1) : shade(c, -0.06);
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.6;
        roundRect(ctx, px, py, 9, 7.4, 2);
        ctx.fill(); ctx.stroke();
        // Верхняя фаска
        ctx.strokeStyle = `rgba(255,255,255,${0.2 + pal.polish * 0.6})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 1, py + 1.4);
        ctx.lineTo(px + 8, py + 1.4);
        ctx.stroke();
        // Заклёпки
        ctx.fillStyle = 'rgba(30,24,18,0.55)';
        ctx.beginPath(); ctx.arc(px + 2.2, py + 5.4, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(px + 6.8, py + 5.4, 0.9, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Кожаный ремень с бляхой
    ctx.fillStyle = '#5a3f22';
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.8;
    roundRect(ctx, -waist + 1, hipY - 26, waist * 2 - 2, 6, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.trim;
    ctx.beginPath(); ctx.arc(0, hipY - 23, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (vis === 'sleeveless') {
    // Безрукавка: широкие проймы, открытые плечи, V-вырез и шнуровка.
    // Силуэт уже корпуса — видно голые руки по бокам.
    const w2 = shoulder * 0.78;
    ctx.fillStyle = shade(c, -0.06);
    ctx.beginPath();
    ctx.moveTo(-w2, hipY - 44);
    ctx.quadraticCurveTo(-w2 * 0.62, hipY - 47, -w2 * 0.34, hipY - 49);
    ctx.quadraticCurveTo(0, hipY - 36, w2 * 0.34, hipY - 49);
    ctx.quadraticCurveTo(w2 * 0.62, hipY - 47, w2, hipY - 44);
    ctx.quadraticCurveTo(w2 * 0.9, hipY - 26, waist * 0.94, hipY - 2);
    ctx.quadraticCurveTo(0, hipY + 4, -waist * 0.94, hipY - 2);
    ctx.quadraticCurveTo(-w2 * 0.9, hipY - 26, -w2, hipY - 44);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Проймы: тёмные дуги у плеч
    [-1, 1].forEach(sd => {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(sd * w2 * 0.98, hipY - 42);
      ctx.quadraticCurveTo(sd * w2 * 0.52, hipY - 40, sd * w2 * 0.4, hipY - 28);
      ctx.stroke();
    });
    // Шнуровка по V-вырезу
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const yy = hipY - 42 + i * 5;
      const sp = 2.2 + i * 1.4;
      ctx.beginPath();
      ctx.moveTo(-sp, yy); ctx.lineTo(sp, yy + 3.4);
      ctx.moveTo(sp, yy); ctx.lineTo(-sp, yy + 3.4);
      ctx.stroke();
    }
    // Ремень
    ctx.fillStyle = '#5a3f22';
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.6;
    roundRect(ctx, -waist * 0.96, hipY - 12, waist * 1.92, 5.4, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.trim;
    ctx.beginPath(); ctx.arc(0, hipY - 9.4, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    sheen(-8, hipY - 38, 5, 7, -0.4);
  } else if (vis === 'poncho') {
    // Накидка: трапеция с прорезью для головы, свисающие углы и бахрома
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(-shoulder * 0.42, hipY - 50);
    ctx.lineTo(shoulder * 0.42, hipY - 50);
    ctx.lineTo(shoulder * 1.02, hipY - 6);
    ctx.quadraticCurveTo(0, hipY + 8, -shoulder * 1.02, hipY - 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Складки ткани от ворота вниз
    ctx.strokeStyle = shade(c, -0.3);
    ctx.lineWidth = 1.8;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 7, hipY - 46);
      ctx.quadraticCurveTo(i * 11, hipY - 24, i * 15, hipY - 2);
      ctx.stroke();
    }
    // Ворот-прорезь
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, hipY - 48, 7.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Кайма по подолу и бахрома
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-shoulder * 1.0, hipY - 7);
    ctx.quadraticCurveTo(0, hipY + 7, shoulder * 1.0, hipY - 7);
    ctx.stroke();
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.6;
    for (let i = -4; i <= 4; i++) {
      const t = i / 4;
      const px = t * shoulder * 0.96;
      const py = hipY + 5 - t * t * 10;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + t * 2, py + 4);
      ctx.stroke();
    }
    // Пряжка на плече
    ctx.fillStyle = pal.trim;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(-shoulder * 0.34, hipY - 47, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    sheen(6, hipY - 34, 7, 8, -0.3);
  } else if (vis === 'cuirbouilli') {
    // Варёная кожа: жёсткие формованные сегменты с глянцем и заклёпками
    ctx.fillStyle = shade(c, 0.08);
    roundRect(ctx, -waist, hipY - 48, waist * 2, 46, 7);
    ctx.fill(); ctx.stroke();
    // Сегменты: три горизонтальные полосы с фаской
    for (let i = 0; i < 3; i++) {
      const yy = hipY - 44 + i * 13;
      ctx.fillStyle = i % 2 ? shade(c, 0.16) : shade(c, -0.02);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.8;
      roundRect(ctx, -waist + 3, yy, waist * 2 - 6, 11, 4);
      ctx.fill(); ctx.stroke();
      // Глянцевый блик — варёная кожа блестит как лак
      ctx.fillStyle = `rgba(255,246,220,${0.24 + pal.polish * 0.45})`;
      roundRect(ctx, -waist + 6, yy + 1.6, (waist * 2 - 12) * 0.45, 2.4, 1.2);
      ctx.fill();
      // Заклёпки по краю сегмента
      ctx.fillStyle = pal.trim;
      [-0.7, 0.7].forEach(k => {
        ctx.beginPath();
        ctx.arc(k * waist * 0.72, yy + 8, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Осевой шов и наплечные ремни
    ctx.strokeStyle = shade(c, -0.45);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, hipY - 46);
    ctx.lineTo(0, hipY - 4);
    ctx.stroke();
    ctx.fillStyle = '#5a3f22';
    [-1, 1].forEach(sd => {
      roundRect(ctx, sd * shoulder * 0.5 - 3.5, hipY - 50, 7, 9, 2.6);
      ctx.fill();
    });
    sheen(-10, hipY - 34, 6, 8, -0.4);
    hem(hipY - 4, 4);
  } else if (vis === 'bronzemuscle' || vis === 'muscleiron') {
    // Мускульный доспех: анатомические выпуклости, выкованные в металле
    const bronze = vis === 'bronzemuscle';
    ctx.fillStyle = metalFill(ctx, c, hipY - 52, hipY);
    roundRect(ctx, -waist, hipY - 48, waist * 2, 46, 8);
    ctx.fill(); ctx.stroke();
    // Грудные пластины
    [-1, 1].forEach(sd => {
      const g = ctx.createRadialGradient(sd * shoulder * 0.34, hipY - 36, 2, sd * shoulder * 0.34, hipY - 34, 14);
      g.addColorStop(0, shade(c, 0.4));
      g.addColorStop(0.6, c);
      g.addColorStop(1, shade(c, -0.28));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sd * shoulder * 0.34, hipY - 34, 11.5, 9.5, sd * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Сосок-заклёпка
      ctx.fillStyle = shade(c, -0.45);
      ctx.beginPath();
      ctx.arc(sd * shoulder * 0.34, hipY - 33, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // Кубики пресса
    for (let row = 0; row < 2; row++) {
      for (let k = -1; k <= 1; k += 2) {
        const g = ctx.createRadialGradient(k * 5, hipY - 18 - row * 9, 1, k * 5, hipY - 18 - row * 9, 8);
        g.addColorStop(0, shade(c, 0.32));
        g.addColorStop(1, shade(c, -0.22));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(k * 5.4, hipY - 18 - row * 9, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Осевая линия и ключицы
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, hipY - 44);
    ctx.lineTo(0, hipY - 6);
    ctx.stroke();
    ctx.lineWidth = 1.8;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * 2, hipY - 44);
      ctx.quadraticCurveTo(sd * shoulder * 0.5, hipY - 47, sd * shoulder * 0.86, hipY - 42);
      ctx.stroke();
    });
    // Бронза: тёмный патиновый кант по низу
    if (bronze) {
      ctx.strokeStyle = 'rgba(90,120,100,0.55)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-waist + 2, hipY - 5);
      ctx.quadraticCurveTo(0, hipY - 1, waist - 2, hipY - 5);
      ctx.stroke();
    }
    sheen(-12, hipY - 40, 6, 7, -0.4);
  } else if (vis === 'cuirass') {
    // Кираса: две цельные створки с осевым ребром, застёжками и вырезом
    ctx.fillStyle = metalFill(ctx, c, hipY - 52, hipY);
    roundRect(ctx, -waist, hipY - 48, waist * 2, 46, 9);
    ctx.fill(); ctx.stroke();
    // Вырез горловины
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, hipY - 47, 9, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Осевое ребро-гребень
    ctx.strokeStyle = shade(c, 0.45);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, hipY - 43);
    ctx.quadraticCurveTo(2.5, hipY - 26, 0, hipY - 6);
    ctx.stroke();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(2.6, hipY - 42);
    ctx.quadraticCurveTo(5, hipY - 26, 2.4, hipY - 8);
    ctx.stroke();
    // Боковые грани створок
    [-1, 1].forEach(sd => {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sd * waist * 0.98, hipY - 40);
      ctx.quadraticCurveTo(sd * waist * 0.8, hipY - 24, sd * waist * 0.9, hipY - 8);
      ctx.stroke();
      // Застёжки-крючки по краю
      ctx.fillStyle = pal.trim;
      [0.55, 0.8].forEach(k => {
        ctx.beginPath();
        ctx.arc(sd * waist * 0.86, hipY - 46 + k * 42, 1.9, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    sheen(-13, hipY - 38, 7, 10, -0.35);
    hem(hipY - 4, 4);
  } else if (vis === 'gothic') {
    // Готические латы: рифлёная сталь — вертикальные жёлоба и острые грани
    ctx.fillStyle = metalFill(ctx, c, hipY - 52, hipY);
    roundRect(ctx, -waist, hipY - 48, waist * 2, 46, 6);
    ctx.fill(); ctx.stroke();
    // Жёлоба: чередование светлых рёбер и тёмных канавок
    for (let i = -4; i <= 4; i++) {
      const px = i * (waist * 0.22);
      ctx.strokeStyle = i % 2 ? 'rgba(0,0,0,0.34)' : `rgba(255,255,255,${0.28 + pal.polish * 0.4})`;
      ctx.lineWidth = i % 2 ? 2.2 : 1.6;
      ctx.beginPath();
      ctx.moveTo(px * 0.82, hipY - 46);
      ctx.quadraticCurveTo(px, hipY - 26, px * 0.9, hipY - 5);
      ctx.stroke();
    }
    // Острые грани на груди: клиновидный вырез
    ctx.fillStyle = shade(c, -0.4);
    ctx.beginPath();
    ctx.moveTo(-8, hipY - 46);
    ctx.lineTo(0, hipY - 30);
    ctx.lineTo(8, hipY - 46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Наплечные гребни
    [-1, 1].forEach(sd => {
      ctx.fillStyle = shade(c, 0.2);
      ctx.beginPath();
      ctx.moveTo(sd * shoulder * 0.7, hipY - 46);
      ctx.quadraticCurveTo(sd * shoulder * 0.98, hipY - 40, sd * shoulder * 0.86, hipY - 26);
      ctx.quadraticCurveTo(sd * shoulder * 0.78, hipY - 36, sd * shoulder * 0.7, hipY - 46);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    });
    sheen(-12, hipY - 40, 5, 9, -0.3);
    hem(hipY - 4, 4);
  } else if (vis === 'plate' || vis === 'lorica' || vis === 'imperial' || vis === 'bronze'
    || vis === 'pauldron' || vis === 'vambrace' || vis === 'goldarm' || vis === 'titanarm'
    || vis === 'bronzebracer' || vis === 'gladmanica' || vis === 'platelegs'
    || vis === 'irongreaves' || vis === 'goldgreaves' || vis === 'imperialgreaves'
    || vis === 'titangreaves' || vis === 'chainlegs' || vis === 'samurai') {
    // Пластинчатая / чешуйчато-ременная: кираса с рёбрами жёсткости.
    // Линии делаем контрастными: на маленьком спрайте полутон пропадает.
    const edge = pal.deep;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2.6;
    // Осевой шов и рёбра
    ctx.beginPath(); ctx.moveTo(0, hipY - 50); ctx.lineTo(0, hipY - 4); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-shoulder, hipY - 26);
    ctx.quadraticCurveTo(0, hipY - 16, shoulder, hipY - 26);
    ctx.stroke();
    // Боковые рёбра кирасы
    ctx.lineWidth = 2;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * shoulder * 0.55, hipY - 46);
      ctx.quadraticCurveTo(sd * shoulder * 0.8, hipY - 26, sd * shoulder * 0.6, hipY - 6);
      ctx.stroke();
    });
    if (vis === 'lorica' || vis === 'imperial') {
      // Ремни лорики: горизонтальные полосы с заклёпками
      for (let i = 0; i < 4; i++) {
        const yy = hipY - 44 + i * 10;
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-shoulder + 3, yy);
        ctx.quadraticCurveTo(0, yy + 4, shoulder - 3, yy);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.3 + pal.polish * 0.5})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-shoulder + 4, yy - 1.8);
        ctx.quadraticCurveTo(0, yy + 2, shoulder - 4, yy - 1.8);
        ctx.stroke();
        ctx.fillStyle = 'rgba(30,24,16,0.7)';
        [-0.62, -0.3, 0.3, 0.62].forEach(k => {
          ctx.beginPath();
          ctx.arc(shoulder * k, yy + 3 + (1 - Math.abs(k)) * 1.2, 1.3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
    if (vis === 'bronze') {
      // Нагрудные диски-умбоны
      [-1, 1].forEach(sd => {
        ctx.fillStyle = shade(c, 0.2);
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(sd * shoulder * 0.32, hipY - 30, 8, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sd * shoulder * 0.32, hipY - 30, 5, Math.PI * 1.1, Math.PI * 1.7);
        ctx.stroke();
      });
    }
    if (vis === 'plate' || vis === 'imperial') {
      // Кромка ворота
      ctx.strokeStyle = light;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-shoulder * 0.9, hipY - 48);
      ctx.quadraticCurveTo(0, hipY - 52, shoulder * 0.9, hipY - 48);
      ctx.stroke();
    }
    sheen(-9, hipY - 38, 8, 6, -0.4);
    hem(hipY - 5, 4);
  } else if (vis === 'medieval') {
    // Рыцарский доспех: цельная кираса, наплечники и ремень с бляхой
    const edge = pal.deep;
    // Наплечники — две выпуклые створки
    [-1, 1].forEach(sd => {
      ctx.fillStyle = shade(c, 0.18);
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(sd * shoulder * 0.78, hipY - 46, 11, 8, sd * 0.35, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(sd * shoulder * 0.78, hipY - 46, 7, Math.PI * 1.05, Math.PI * 1.6);
      ctx.stroke();
    });
    // Грудная пластина с осевым ребром
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, hipY - 46);
    ctx.quadraticCurveTo(3, hipY - 26, 0, hipY - 8);
    ctx.stroke();
    // Рёбра жёсткости по бокам
    ctx.lineWidth = 1.8;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * shoulder * 0.5, hipY - 44);
      ctx.quadraticCurveTo(sd * shoulder * 0.72, hipY - 24, sd * shoulder * 0.56, hipY - 8);
      ctx.stroke();
    });
    // Латы на животе: две горизонтальные полосы
    for (let i = 0; i < 2; i++) {
      const yy = hipY - 22 + i * 8;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-waist + 3, yy);
      ctx.quadraticCurveTo(0, yy + 3, waist - 3, yy);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-waist + 4, yy - 1.6);
      ctx.quadraticCurveTo(0, yy + 1.4, waist - 4, yy - 1.6);
      ctx.stroke();
    }
    // Ремень и бляха
    ctx.fillStyle = '#5a3f22';
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.6;
    roundRect(ctx, -waist, hipY - 13, waist * 2, 6, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.trim;
    ctx.beginPath(); ctx.arc(0, hipY - 10, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Плюмаж-накидка по цвету отделки на груди
    ctx.fillStyle = hexA(body.trim || '#c0392b', 0.85);
    ctx.beginPath();
    ctx.moveTo(-9, hipY - 46);
    ctx.lineTo(9, hipY - 46);
    ctx.lineTo(6, hipY - 34);
    ctx.lineTo(-6, hipY - 34);
    ctx.closePath();
    ctx.fill();
    sheen(-11, hipY - 36, 7, 9, -0.4);
    hem(hipY - 5, 4);
  } else if (vis === 'china') {
    // Ханьский ламелляр: красный лак, ряды пластин, пояс с драконом
    for (let row = 0; row < 6; row++) {
      for (let i = -3; i <= 3; i++) {
        const px = i * 9 - 4;
        const py = hipY - 46 + row * 8;
        ctx.fillStyle = row % 2 ? shade(c, 0.1) : shade(c, -0.08);
        ctx.strokeStyle = pal.deep;
        ctx.lineWidth = 1.4;
        roundRect(ctx, px, py, 8, 7, 1.6);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = pal.trim;
        ctx.beginPath();
        ctx.arc(px + 4, py + 3.4, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Пояс с золотой накладкой-драконом
    ctx.fillStyle = '#3a2418';
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1.8;
    roundRect(ctx, -waist, hipY - 16, waist * 2, 7, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.trim;
    ctx.beginPath();
    ctx.moveTo(-9, hipY - 12);
    ctx.quadraticCurveTo(-3, hipY - 17, 2, hipY - 12);
    ctx.quadraticCurveTo(6, hipY - 9, 10, hipY - 13);
    ctx.lineTo(10, hipY - 10);
    ctx.quadraticCurveTo(4, hipY - 6, -2, hipY - 9);
    ctx.closePath();
    ctx.fill();
    // Воротник-стойка
    ctx.fillStyle = shade(c, 0.2);
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1.8;
    roundRect(ctx, -12, hipY - 50, 24, 7, 2);
    ctx.fill(); ctx.stroke();
    sheen(-11, hipY - 36, 6, 9, -0.4);
    hem(hipY - 5, 4);
  } else if (vis === 'rus') {
    // Русская кольчуга: плетение с медными вставками и поясом
    const step = 6.4;
    for (let yy = hipY - 46; yy < hipY; yy += step) {
      for (let xx = -shoulder; xx < shoulder; xx += step) {
        const off = (Math.round((yy - hipY) / step) % 2) ? step / 2 : 0;
        ctx.strokeStyle = pal.deep;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(xx + off, yy, step * 0.36, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Медные вставки-бляхи на груди
    ctx.fillStyle = pal.trim;
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1.2;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.ellipse(sd * shoulder * 0.42, hipY - 32, 4.4, 5.4, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    // Ворот и подол
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-shoulder + 3, hipY - 45);
    ctx.quadraticCurveTo(0, hipY - 40, shoulder - 3, hipY - 45);
    ctx.stroke();
    // Ремень
    ctx.fillStyle = '#4a2e1c';
    ctx.lineWidth = 1.6;
    roundRect(ctx, -waist, hipY - 15, waist * 2, 6, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.trim;
    ctx.beginPath(); ctx.arc(0, hipY - 12, 3, 0, Math.PI * 2); ctx.fill();
    sheen(-11, hipY - 38, 6, 8, -0.4);
    hem(hipY - 5, 4);
  } else if (vis === 'mongol') {
    // Монгольский хатанга: кожаная основа, стальные накладки, меховой ворот
    ctx.fillStyle = shade(c, -0.06);
    roundRect(ctx, -waist, hipY - 48, waist * 2, 44, 6);
    ctx.fill();
    // Стальные накладки-полосы
    for (let i = 0; i < 4; i++) {
      const yy = hipY - 44 + i * 10;
      ctx.fillStyle = shade('#9aa6b2', -0.05 + (i % 2) * 0.08);
      ctx.strokeStyle = pal.deep;
      ctx.lineWidth = 1.6;
      roundRect(ctx, -waist + 4, yy, waist * 2 - 8, 7, 3);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      roundRect(ctx, -waist + 6, yy + 1.2, (waist * 2 - 12) * 0.5, 2, 1);
      ctx.fill();
    }
    // Меховой воротник
    ctx.fillStyle = '#b8a888';
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-shoulder * 0.9, hipY - 47);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const px = -shoulder * 0.9 + shoulder * 1.8 * t;
      ctx.quadraticCurveTo(px + 2, hipY - 52, px + 5, hipY - 47);
    }
    ctx.lineTo(shoulder * 0.9, hipY - 42);
    ctx.lineTo(-shoulder * 0.9, hipY - 42);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Пояс с подвесками
    ctx.fillStyle = '#3a2418';
    ctx.strokeStyle = pal.deep;
    ctx.lineWidth = 1.6;
    roundRect(ctx, -waist, hipY - 12, waist * 2, 6, 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1.6;
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * 8, hipY - 7);
      ctx.lineTo(sd * 9, hipY + 1);
      ctx.stroke();
    });
    sheen(-11, hipY - 36, 6, 8, -0.4);
  } else if (vis === 'leather' || vis === 'brigandine' || vis === 'hide') {
    // Кожа: ремни, шнуровка и прошивка по краю
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-shoulder + 2, hipY - 34); ctx.lineTo(shoulder - 2, hipY - 34);
    ctx.moveTo(-shoulder + 2, hipY - 20); ctx.lineTo(shoulder - 2, hipY - 20);
    ctx.stroke();
    // Шнуровка спереди
    ctx.strokeStyle = pal.tier >= 3 ? pal.trim : '#e8dcc0';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const yy = hipY - 40 + i * 10;
      ctx.beginPath();
      ctx.moveTo(-5, yy); ctx.lineTo(5, yy + 5);
      ctx.moveTo(5, yy); ctx.lineTo(-5, yy + 5);
      ctx.stroke();
    }
    // Заклёпки по ремню
    ctx.fillStyle = pal.tier >= 4 ? pal.trim : '#b9a06a';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.arc(i * 9, hipY - 27, 2, 0, Math.PI * 2); ctx.fill();
    }
    if (vis === 'brigandine') {
      // Бригантина: под кожей угадываются пластины
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-shoulder + 6, hipY - 16 + i * 5);
        ctx.lineTo(shoulder - 6, hipY - 16 + i * 5);
        ctx.stroke();
      }
    }
    if (vis === 'hide') {
      // Шкура: неровный мех по краю
      ctx.strokeStyle = shade(c, 0.35);
      ctx.lineWidth = 1.6;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 6, hipY - 47);
        ctx.quadraticCurveTo(i * 6 + 3, hipY - 42, i * 6, hipY - 37);
        ctx.stroke();
      }
    }
    sheen(-10, hipY - 40, 7, 5, -0.4);
    hem(hipY - 5, 4);
  } else if (vis === 'gambeson' || vis === 'quilted') {
    // Стёганка: ромбы прострочки и мягкие валики
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 9, hipY - 46); ctx.lineTo(i * 9, hipY); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Диагональная прострочка — ромбы
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-shoulder + 4, hipY - 40 + i * 11);
      ctx.lineTo(shoulder - 4, hipY - 46 + i * 11);
      ctx.stroke();
    }
    sheen(-9, hipY - 38, 8, 5, -0.4);
    hem(hipY - 5, 4);
  } else if (vis === 'tunic' || vis === 'rags') {
    // Туника: пояс, складки и вышитая кайма
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-shoulder + 4, hipY - 30); ctx.lineTo(shoulder - 4, hipY - 30);
    ctx.stroke();
    ctx.fillStyle = shade(c, 0.2);
    ctx.beginPath();
    ctx.moveTo(-10, hipY - 48); ctx.lineTo(10, hipY - 48); ctx.lineTo(6, hipY - 38); ctx.lineTo(-6, hipY - 38);
    ctx.closePath(); ctx.fill();
    // Складки ткани от пояса вниз
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 7, hipY - 28);
      ctx.quadraticCurveTo(i * 8 + 1, hipY - 16, i * 7 + 2, hipY - 3);
      ctx.stroke();
    }
    // Кайма по подолу
    ctx.strokeStyle = pal.tier >= 3 ? pal.trim : dark;
    ctx.lineWidth = pal.tier >= 3 ? 2.6 : 2.2;
    ctx.beginPath();
    ctx.moveTo(-waist + 2, hipY - 4);
    ctx.quadraticCurveTo(0, hipY, waist - 2, hipY - 4);
    ctx.stroke();
    if (vis === 'rags') {
      // Прорехи и заплатки
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(-shoulder * 0.6 + i * 13, hipY - 34 + (i % 2) * 12, 4, 6, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(210,190,150,0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-shoulder * 0.4, hipY - 30);
      ctx.lineTo(-shoulder * 0.4 + 9, hipY - 30);
      ctx.moveTo(shoulder * 0.3, hipY - 18);
      ctx.lineTo(shoulder * 0.3 + 8, hipY - 18);
      ctx.stroke();
    }
  }

  // Поверх формы — фактура материала и отделка по тиру
  armorTexture(ctx, vis, pal, shoulder, waist, hipY);
  armorOrnament(ctx, vis, pal, shoulder, waist, hipY);
}

// ==================== БРОНЯ НОГ ====================
function drawLegArmor(ctx, legs, legColor, footY, legF, legB, lostL, lostR) {
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  const vis = legs ? legs.vis : 'none';

  if (!lostL) {
    ctx.fillStyle = legs ? shade(legColor, 0.08) : '#4a3020';
    roundRect(ctx, -25, footY - 9, 22, 10, 4); ctx.fill(); ctx.stroke();
  }
  if (!lostR) {
    ctx.fillStyle = legs ? shade(legColor, 0.08) : '#4a3020';
    roundRect(ctx, 3, footY - 9, 22, 10, 4); ctx.fill(); ctx.stroke();
  }
  if (!legs) return;

  if (['greaves', 'plate', 'gold', 'sandals', 'boots'].includes(vis)) {
    ctx.fillStyle = shade(legColor, 0.2);
    if (!lostL) { roundRect(ctx, -22, footY - 26, 16, 18, 4); ctx.fill(); ctx.stroke(); }
    if (!lostR) { roundRect(ctx, 7, footY - 26, 16, 18, 4); ctx.fill(); ctx.stroke(); }
    if (vis === 'plate' || vis === 'gold') {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      if (!lostL) { roundRect(ctx, -20, footY - 24, 4, 12, 2); ctx.fill(); }
      if (!lostR) { roundRect(ctx, 9, footY - 24, 4, 12, 2); ctx.fill(); }
    }
  } else if (vis === 'wraps' || vis === 'chain' || vis === 'scale') {
    ctx.strokeStyle = shade(legColor, -0.25);
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      if (!lostL) { ctx.beginPath(); ctx.moveTo(-22, footY - 22 + i * 6); ctx.lineTo(-6, footY - 20 + i * 6); ctx.stroke(); }
      if (!lostR) { ctx.beginPath(); ctx.moveTo(7, footY - 22 + i * 6); ctx.lineTo(23, footY - 20 + i * 6); ctx.stroke(); }
    }
  }
}

// ==================== ЩИТЫ ====================
function drawShield(ctx, sc, x, y) {
  const c = sc.color || '#a5744a';
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = c;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4;
  const vis = sc.vis || 'round';
  const em = sc.emblem;

  if (vis === 'scutum' || vis === 'tower') {
    const h = vis === 'tower' ? 80 : 66;
    const w = vis === 'tower' ? 34 : 28;
    roundRect(ctx, -w / 2, -h / 2, w, h, vis === 'tower' ? 6 : 9);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(c, -0.3);
    ctx.beginPath(); ctx.arc(0, -2, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0bd5f';
    ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 5, -h / 2 + 6); ctx.lineTo(-w / 2 + 5, h / 2 - 6); ctx.stroke();
    ctx.strokeStyle = shade(c, 0.22);
    ctx.beginPath(); ctx.moveTo(0, -h / 2 + 8); ctx.lineTo(0, h / 2 - 8); ctx.stroke();
    if (em === 'gold') {
      ctx.fillStyle = 'rgba(229,181,79,0.55)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 6);
    }
    if (em === 'lion') {
      ctx.fillStyle = '#e5b54f';
      ctx.beginPath(); ctx.arc(0, 8, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(c, -0.4);
      ctx.beginPath(); ctx.arc(0, 8, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (vis === 'kite') {
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.quadraticCurveTo(24, -30, 20, 2);
    ctx.quadraticCurveTo(14, 24, 0, 40);
    ctx.quadraticCurveTo(-14, 24, -20, 2);
    ctx.quadraticCurveTo(-24, -30, 0, -34);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (em === 'cross') {
      ctx.strokeStyle = '#e5b54f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -26); ctx.lineTo(0, 30);
      ctx.moveTo(-14, -8); ctx.lineTo(14, -8);
      ctx.stroke();
    }
    ctx.fillStyle = shade(c, -0.32);
    ctx.beginPath(); ctx.arc(0, -6, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0bd5f';
    ctx.beginPath(); ctx.arc(0, -6, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  const r = vis === 'buckler' ? 20 : 27;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if (em === 'spikes') {
    ctx.fillStyle = '#d0d8e0';
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * (r - 4), Math.sin(ang) * (r - 4));
      ctx.lineTo(Math.cos(ang) * (r + 9), Math.sin(ang) * (r + 9));
      ctx.lineTo(Math.cos(ang + 0.2) * (r - 4), Math.sin(ang + 0.2) * (r - 4));
      ctx.closePath(); ctx.fill();
    }
  }
  if (em === 'studs') {
    ctx.fillStyle = '#c8d2dc';
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * (r - 7), Math.sin(ang) * (r - 7), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (em === 'mirror') {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(200,215,230,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0.75)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r - 3, 0, Math.PI * 2); ctx.fill();
  }
  if (em === 'lambda') {
    ctx.strokeStyle = '#8a2f28';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-7, 10); ctx.lineTo(0, -12); ctx.lineTo(7, 10);
    ctx.stroke();
  }
  if (em === 'gold') {
    ctx.strokeStyle = '#e5b54f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, r - 3, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.fillStyle = shade(c, -0.32);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c9d3dc';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, r - 5, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
  ctx.restore();
}

// ==================== ОРУЖИЕ ====================
// Угол хвата в руке. Клинок и древко несутся остриём вперёд,
// а лук и арбалет держат иначе: лук — почти вертикально,
// арбалет — ложем вперёд, чуть опустив при ходьбе.
function weaponHoldAngle(w, gear, swing) {
  const v = w.vis || WEAPON_VIS[w.shape] || WEAPON_VIS.gladius;
  if (v.head === 'bow') return -0.34 + (swing || 0) * 0.34;
  if (v.head === 'xbow') return 0.28 - (swing || 0) * 0.28;
  // carry: 0 — оружие стоит вертикально у плеча, 1 — остриём вперёд.
  return (Math.PI * 0.5) * gear.carry + gear.wpnLag;
}

function drawWeapon(ctx, w) {
  const v = w.vis || WEAPON_VIS[w.shape] || WEAPON_VIS.gladius;
  // Парные наборы («пара топоров», «пара кинжалов») больше НЕ дублируются
  // внутри одной кисти: второй клинок рисует левая рука. Здесь всегда
  // один предмет — иначе в руке оказывалось четыре клинка.
  drawWeaponShape(ctx, v, w);
}

// Точка хвата в локальных координатах модели оружия.
// Древко идёт от пятки (y≈32) до головки (-len). Рука ложится на обмотку,
// а пятка и навершие остаются снаружи кулака — иначе кажется, что оружие
// держат за самый кончик. Длинное древко берётся выше: хват рассчитан
// на две руки.
function weaponGripPoint(v) {
  if (!v) return { x: 8, y: 35 };
  const hafted = ['axe', 'mace', 'hammer', 'pick', 'spear', 'trident', 'halberd'].includes(v.head);
  if (!hafted) return { x: 8, y: 35 };
  return { x: 10, y: (v.len || 50) >= 70 ? 15 : 21 };
}

// Оружие в кисти: масштаб, поворот и зеркало для левой руки.
// mirror = 1 — правая рука, -1 — левая (модель отражается, кисть остаётся
// в той же точке, поэтому рукоять не выезжает из кулака).
// WEAPON_HAND_SCALE: оружие в руке уменьшено относительно модели, иначе
// по отношению к телу оно выглядело игрушечно-огромным. Модели при этом
// остаются крупными в иконках инвентаря, где масштаб свой.
const WEAPON_HAND_SCALE = 0.74;

function drawWeaponInHand(ctx, weapon, hx, hy, ang, mirror, scale) {
  const v = weapon.vis || WEAPON_VIS[weapon.shape] || WEAPON_VIS.gladius;
  const g = weaponGripPoint(v);
  const k = (scale || 1) * WEAPON_HAND_SCALE;
  ctx.save();
  ctx.translate(hx, hy);
  if (mirror < 0) ctx.scale(-1, 1);
  ctx.rotate(mirror < 0 ? -ang : ang);
  ctx.scale(k, k);
  ctx.translate(-g.x, -g.y);
  drawWeapon(ctx, weapon);
  ctx.restore();
}

// ==================== ДЕТАЛИ ОРУЖИЯ ====================
// У каждой вещи свой «характер»: обмотка, навершие, обойма у головки,
// темляк, гравировка. Хеш от id стабилен, поэтому модель не мигает.
function weaponHash(w) {
  const s = String((w && (w.id || w.shape)) || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function weaponRng(w) {
  let s = weaponHash(w) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Лёгкий индивидуальный оттенок металла: одна и та же сталь у разных
// кузнецов выглядит по-своему.
function weaponMetalTone(base, w) {
  const rng = weaponRng(w);
  const k = rng();
  const target = k > 0.68 ? '#ffffff' : k > 0.34 ? '#1a1208' : '#ffd8a8';
  return mixColor(base, target, 0.05 + rng() * 0.07);
}

// ==================== ИНДИВИДУАЛЬНЫЙ ПОЧЕРК ====================
// Даже внутри одного типа (топоры, молоты, мечи) предметы не должны
// повторяться. Все параметры детерминированы от id: рисунок стабилен.
function weaponStyle(w) {
  const rng = weaponRng(w);
  const key = String((w && (w.shape || w.id)) || '');
  const tier = (w && w.tier) || 1;
  const r = () => rng();

  const s = {
    tier,
    key,
    // Лезвие топора
    spread: 0.85 + r() * 0.5,      // вынос лезвия вперёд
    topCut: 0.12 + r() * 0.34,     // срез сверху
    botCut: 0.30 + r() * 0.55,     // высота лезвия
    beard: 0,                       // «борода» вниз
    back: 'none',                   // обух: none | hammer | spike | double | beak
    crown: r() > 0.55,              // шип на верхушке древка
    holes: 0,                       // отверстия в лезвии
    edgeSerrated: false,
    // Молот
    headShape: 'block',             // block | octa | round | cylinder | twin
    poll: 'none',                   // none | beak | wedge | spike | flat
    band: r() > 0.45,
    rivets: 0,
    // Булава
    ballR: 13 + r() * 3,
    facets: 0,
    // Обмотка и металл
    wrap: ['#7a5636', '#5a3f22', '#8c4a2a', '#4a3320', '#6b4a2a'][Math.floor(r() * 5)],
    bandColor: null,
    accent: null,
    // Клинок
    width: 1,
    taper: 0.55,
    fuller: tier >= 2,
    wave: 0,
    serr: 0,
    glow: null,
    pommel: 'ball',                 // ball | disc | ring | none
    guardTilt: (r() - 0.5) * 0.12
  };

  // --- Явные «лица» по форме ---
  if (/hatchet|francisca/.test(key)) { s.spread = 0.78; s.topCut = 0.46; s.botCut = 0.42; }
  if (/handaxe|waraxe/.test(key)) { s.spread = 1.0; s.topCut = 0.22; s.botCut = 0.5; }
  if (/bearded|greatbeard/.test(key)) { s.beard = 1; s.botCut = 0.7; }
  if (/broadaxe|bardiche|titanaxe/.test(key)) { s.spread = 1.25; s.topCut = 0.1; s.botCut = 0.72; }
  if (/skullsplitter|execaxe|bloodmoon/.test(key)) { s.spread = 1.15; s.botCut = 0.78; s.holes = 1; }
  if (/labrys/.test(key)) { s.back = 'double'; }
  if (/daneaxe/.test(key)) { s.beard = 0.7; s.spread = 1.1; }
  if (/greatbeard|bardiche|daneaxe/.test(key)) { s.back = 'spike'; }
  if (/execaxe/.test(key)) { s.back = 'hammer'; }
  if (/titanaxe/.test(key)) { s.back = 'beak'; s.holes = 1; }

  if (/blacksmith/.test(key)) s.headShape = 'cylinder';
  else if (/sledge|earthbreaker/.test(key)) s.headShape = 'block';
  else if (/godhammer|doomhammer/.test(key)) s.headShape = 'octa';
  else if (/judge|thunder/.test(key)) s.headShape = 'twin';
  else if (/maul|greathammer|ram/.test(key)) s.headShape = 'block';
  else if (/warhammer/.test(key)) s.headShape = 'octa';
  else s.headShape = r() > 0.5 ? 'block' : 'octa';

  if (/warhammer|ram|maul|greathammer|judge|sledge|thunder|godhammer|doomhammer|earthbreaker/.test(key)) {
    s.poll = /judge/.test(key) ? 'wedge' : /thunder/.test(key) ? 'spike' : 'beak';
  }
  if (/blacksmith/.test(key)) s.poll = 'flat';

  s.rivets = 2 + Math.floor(r() * 3);

  // --- Клинки ---
  if (/flamberge/.test(key)) { s.wave = 1; s.width = 0.92; s.taper = 0.42; }
  else if (/kris/.test(key)) { s.wave = 0.75; s.width = 0.62; }
  else if (/estoc/.test(key)) { s.width = 0.42; s.taper = 0.3; s.fuller = false; }
  else if (/executioner/.test(key)) { s.width = 1.35; s.taper = 0.12; s.fuller = false; s.pommel = 'none'; }
  else if (/falcata|kopis/.test(key)) { s.width = 1.18; s.taper = 0.35; }
  else if (/sabre/.test(key)) { s.width = 0.9; s.taper = 0.45; }
  else if (/shiv/.test(key)) { s.width = 0.5; s.taper = 0.7; s.fuller = false; s.pommel = 'none'; }
  else if (/stiletto|pugio|dirk|sai/.test(key)) { s.width = 0.52; s.taper = 0.5; s.fuller = false; }
  else if (/katar/.test(key)) { s.width = 0.72; s.taper = 0.35; s.pommel = 'none'; }
  else if (/nodachi|claymore|greatsword|zweihander|bastard/.test(key)) { s.width = 1.12; s.taper = 0.4; }
  else if (/nightfang/.test(key)) { s.glow = 'rgba(120,150,220,0.75)'; s.width = 0.8; s.pommel = 'ring'; }
  else if (/serpent/.test(key)) { s.glow = 'rgba(120,230,170,0.55)'; s.serr = 1; }
  else if (/champion|aurelia|imperial/.test(key)) { s.glow = 'rgba(255,215,120,0.5)'; s.width = 1.05; }
  else if (/rusty/.test(key)) { s.width = 1.1; s.taper = 0.62; s.serr = 1; s.fuller = false; }
  else if (/serpent|champion|aurelia/.test(key)) s.pommel = 'disc';
  else s.pommel = r() > 0.6 ? 'ball' : r() > 0.3 ? 'disc' : 'ring';

  if (tier >= 5) s.bandColor = '#e0bd5f';
  else if (tier >= 4) s.bandColor = '#b9a06a';

  return s;
}

// Мелкие детали поверх готовой формы
function weaponDetails(ctx, v, w) {
  const head = v.head;
  const rng = weaponRng(w);
  const metal = v.metal || w.color || '#c8d2dc';
  const grip = v.grip || '#6b4a2a';
  const tier = w.tier || 1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (head === 'blade') {
    // Обмотка рукояти
    const bands = 3 + ((rng() * 3) | 0);
    ctx.strokeStyle = shade(grip, -0.45);
    ctx.lineWidth = 1.7;
    for (let i = 0; i < bands; i++) {
      const y = 31.5 + i * 2.6;
      ctx.beginPath();
      ctx.moveTo(3.8, y + 1.1);
      ctx.lineTo(12.2, y - 1.1);
      ctx.stroke();
    }
    // Навершие с самоцветом у богатых клинков
    ctx.fillStyle = shade(metal, -0.05);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(9, 44, 4.2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (tier >= 4) {
      ctx.fillStyle = tier >= 5 ? '#e8c65f' : '#c0392b';
      ctx.beginPath();
      ctx.arc(9, 44, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Кожаная петля на кисти у тяжёлых клинков
    if (tier >= 3 && rng() > 0.45) {
      ctx.strokeStyle = '#7a5636';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(11, 40);
      ctx.quadraticCurveTo(17, 42, 15, 47);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const hafted = ['axe', 'mace', 'hammer', 'pick', 'spear', 'trident', 'halberd'].includes(head);

  if (hafted) {
    const bands = 3 + ((rng() * 3) | 0);
    // Обмотка у кисти
    ctx.strokeStyle = shade(grip, -0.45);
    ctx.lineWidth = 1.7;
    for (let i = 0; i < bands; i++) {
      const y = 23 + i * 2.9;
      ctx.beginPath();
      ctx.moveTo(4.6, y + 1.3);
      ctx.lineTo(15.4, y - 1.3);
      ctx.stroke();
    }
    // Пятка древка
    ctx.fillStyle = shade(metal, -0.12);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.2;
    roundRect(ctx, 6.4, 33.4, 7.6, 5.2, 2);
    ctx.fill(); ctx.stroke();

    // Обойма-кольцо у головки: видно, что насадка кованая
    const socketY = -v.len + (head === 'mace' ? 16 : head === 'hammer' ? 15 : head === 'pick' ? 17 : 9);
    ctx.fillStyle = shade(metal, 0.08);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRect(ctx, 6.6, socketY, 11.6, 5.2, 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, socketY + 1.5);
    ctx.lineTo(16.8, socketY + 1.5);
    ctx.stroke();

    // Темляк на древковом оружии — с третьего тира
    if (tier >= 3 && (head === 'spear' || head === 'trident' || head === 'halberd')) {
      const tx = 16;
      const ty = socketY + 5;
      ctx.strokeStyle = '#6f2a24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + 5.5, ty + 7, tx + 3, ty + 15);
      ctx.stroke();
      ctx.fillStyle = '#a83b30';
      for (let i = 0; i < 4; i++) {
        const bx = tx + 2.6 + (i % 2 ? 1.4 : -0.4);
        ctx.beginPath();
        ctx.moveTo(bx, ty + 13 + i);
        ctx.lineTo(bx + 2.2, ty + 20 + i * 1.5);
        ctx.lineTo(bx - 1.2, ty + 18 + i);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Заклёпки на головке топора или молота
    if (head === 'axe' || head === 'hammer') {
      ctx.fillStyle = 'rgba(28,22,14,0.65)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(9 + i * 2.6, -v.len + 4 + i * 5, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Гравировка по древку у легендарных
    if (tier >= 5) {
      ctx.strokeStyle = 'rgba(240,214,120,0.55)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const y = -v.len + 22 + i * 16;
        ctx.beginPath();
        ctx.moveTo(11.4, y);
        ctx.lineTo(13.6, y + 6);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (head === 'bow') {
    const h = v.len * 0.62;
    const b = v.len * 0.22;
    // Пучки-глушители на тетиве
    if (rng() > 0.35) {
      ctx.fillStyle = '#d8c9a8';
      [-0.45, 0.45].forEach(k => {
        ctx.beginPath();
        ctx.ellipse(-b - 0.6, h * k, 2.2, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Пропуск для стрелы: кожаная накладка чуть выше рукояти
    ctx.strokeStyle = 'rgba(90,62,36,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-b * 0.4, -6);
    ctx.lineTo(-b * 0.4 + 6, -3);
    ctx.stroke();
    // Темляк на нижнем плече у дорогих луков
    if (tier >= 4) {
      ctx.strokeStyle = '#7a2f28';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-b, h);
      ctx.quadraticCurveTo(-b - 6, h + 6, -b - 3, h + 13);
      ctx.stroke();
      ctx.fillStyle = '#a83b30';
      ctx.beginPath();
      ctx.moveTo(-b - 3, h + 12);
      ctx.lineTo(-b - 7, h + 19);
      ctx.lineTo(-b, h + 16);
      ctx.closePath();
      ctx.fill();
    }
    // Костяные вставки в рукояти у составных
    if (v.recurve) {
      ctx.fillStyle = 'rgba(236,226,198,0.85)';
      ctx.beginPath();
      ctx.ellipse(0.6, 0, 2.4, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (head === 'xbow') {
    const L = v.len * 0.78;
    // Стремя у переднего конца
    ctx.strokeStyle = shade(metal, -0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(L + 4, 12, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // Мушка и целик
    ctx.fillStyle = '#c8d2dc';
    ctx.beginPath();
    ctx.moveTo(L - 6, -6);
    ctx.lineTo(L - 3.6, -12);
    ctx.lineTo(L - 1.2, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(30,24,16,0.8)';
    ctx.fillRect(-14, -8, 3, 4);
    // Кожаный ремень под ложем
    if (tier >= 3) {
      ctx.strokeStyle = '#6b4529';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, 10);
      ctx.quadraticCurveTo(6, 16, 16, 10);
      ctx.stroke();
    }
    // Заклёпки на ложе
    ctx.fillStyle = 'rgba(24,18,12,0.6)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(2 + i * 9, 2, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  ctx.restore();
}

function drawWeaponShape(ctx, v, w) {
  drawWeaponShapeBase(ctx, v, w);
  weaponDetails(ctx, v, w);
}

// Характер клинка: ширина, сужение, дол, зазубрины, волна, свечение.
// Форма берётся из vis и shape, поэтому даже два гладиуса разных тиров
// выглядят по-разному.
function bladeStyle(v, w) {
  const st = weaponStyle(w);
  const tier = st.tier;
  // Мелкая индивидуальность: у каждого клинка свой рисунок
  if (tier >= 3 && !st.serr && !st.wave) {
    const rng = weaponRng(w);
    if (rng() > 0.7) st.notch = 1;
  }
  st.tip = 1;
  return st;
}

// Дол (кровосток) и блик по лезвию
function bladeFuller(ctx, tipX, len, curve, style) {
  const midX = 8 + curve * len * 0.22;
  ctx.strokeStyle = 'rgba(20,16,12,0.32)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(midX - 1.4, 22);
  ctx.quadraticCurveTo(midX - 1.4 + curve * len * 0.16, 28 - len * 0.45, tipX - 2.5, 28 - len * 0.78);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(midX + 0.6, 22);
  ctx.quadraticCurveTo(midX + 0.6 + curve * len * 0.16, 28 - len * 0.45, tipX - 1.4, 28 - len * 0.78);
  ctx.stroke();
}

function drawWeaponShapeBase(ctx, v, w) {
  const metal = weaponMetalTone(v.metal || w.color || '#c8d2dc', w);
  const grip = v.grip || '#6b4a2a';
  const head = v.head;

  ctx.lineCap = 'round';

  if (head === 'blade') {
    const len = v.len;
    const curve = v.curve || 0;
    const st = bladeStyle(v, w);

    // Рукоять
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(7, 30); ctx.lineTo(9, 42); ctx.stroke();
    ctx.strokeStyle = grip;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(7, 30); ctx.lineTo(9, 42); ctx.stroke();

    // Клинок собираем по точкам: так можно и сужать его, и гнуть волной,
    // и делать зазубрины — одной формулой.
    const N = 16;
    const halfW = 5 * st.width;
    const tipX = 6 + curve * len * 0.55;
    const left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = 28 - len * t;
      const wob = st.wave ? Math.sin(t * Math.PI * 4.4) * st.wave * len * 0.030 : 0;
      const cx = 8 + curve * len * 0.5 * t * t + wob;
      // Ширина: сужение к острию, но у «плахи» острие расширяется
      const wf = (1 - st.taper * t) * (t > 0.9 ? st.tip : 1);
      let hw = halfW * Math.max(0.16, wf);
      // Зазубрины на правой кромке
      if (st.serr && i > 3 && i < N - 1 && i % 2 === 0) hw *= 1.32;
      left.push([cx - hw * 0.55, y]);
      right.push([cx + hw, y]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
    // Острие
    ctx.lineTo(tipX + 1, 28 - len - 9 * st.tip);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    ctx.stroke();

    // Свечение легендарной стали
    if (st.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.shadowColor = st.glow;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = st.glow;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(left[2][0] + 1, left[2][1]);
      for (let i = 3; i < left.length - 1; i++) ctx.lineTo(left[i][0] + 1, left[i][1]);
      ctx.stroke();
      ctx.restore();
    }

    // Блик по кромке
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(6, 22);
    ctx.quadraticCurveTo(6 + curve * len * 0.3, 28 - len * 0.5, tipX, 28 - len + 6);
    ctx.stroke();

    // Дол
    if (st.fuller) bladeFuller(ctx, tipX, len, curve, st);

    // Щербина у обуха — след боя
    if (st.notch) {
      ctx.fillStyle = 'rgba(30,24,16,0.5)';
      ctx.beginPath();
      ctx.moveTo(3.4, 28 - len * 0.62);
      ctx.lineTo(6.4, 28 - len * 0.60);
      ctx.lineTo(5.0, 28 - len * 0.54);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = st.bandColor || '#e0bd5f';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    if (v.guard === 'cross2') {
      roundRect(ctx, -10, 22, 38, 8, 3); ctx.fill(); ctx.stroke();
      // Концы крестовины чуть загнуты вниз
      [-10, 24].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, 22); ctx.lineTo(x + 4, 30); ctx.lineTo(x + 4, 22);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      });
    } else if (v.guard === 'disc') {
      ctx.beginPath(); ctx.ellipse(8, 24, 11, 5, st.guardTilt, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(8, 24, 7, 3, st.guardTilt, 0, Math.PI * 2); ctx.stroke();
    } else if (v.guard === 'basket') {
      ctx.beginPath(); ctx.arc(8, 26, 11, Math.PI, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = shade(st.bandColor || '#e0bd5f', -0.15);
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(8, 26, 7, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(2, 26); ctx.lineTo(14, 26); ctx.stroke();
    } else if (v.guard === 'cross') {
      roundRect(ctx, -2, 22, 22, 7, 3); ctx.fill(); ctx.stroke();
    } else {
      // Без гарды — только кожаная втулка, как у фалькаты
      ctx.fillStyle = grip;
      roundRect(ctx, 3, 21, 10, 6, 2); ctx.fill(); ctx.stroke();
    }

    // Навершие: у каждого клинка своё
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    if (st.pommel === 'ball') {
      ctx.fillStyle = st.bandColor || shade('#e0bd5f', -0.15);
      ctx.beginPath(); ctx.arc(9, 44, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (st.pommel === 'disc') {
      ctx.fillStyle = st.bandColor || '#e0bd5f';
      ctx.beginPath(); ctx.ellipse(9, 44, 5.6, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (st.pommel === 'ring') {
      ctx.strokeStyle = st.bandColor || '#e0bd5f';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(9, 45, 4.2, 0, Math.PI * 2); ctx.stroke();
    }
    return;
  }

  if (head === 'axe') {
    const len = v.len;
    const bl = v.bladeW || 1;
    const st = weaponStyle(w);
    const tier = st.tier;

    // Древко
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(9, 32); ctx.lineTo(13, -len); ctx.stroke();
    ctx.strokeStyle = grip;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(9, 32); ctx.lineTo(13, -len); ctx.stroke();
    // Волокна дерева
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(11.4, 28); ctx.lineTo(14.4, -len + 8);
    ctx.stroke();

    const bladeTop = -len + 4;
    const topY = bladeTop + 22 * st.topCut;
    const botY = bladeTop + 20 + 24 * st.botCut;
    const outX = 12 + 28 * bl * st.spread;

    ctx.fillStyle = metal;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    // Обух снизу вверх
    ctx.moveTo(11, botY - 12);
    ctx.lineTo(11, topY);
    // Верхняя грань к носку: почти прямая, чуть выпуклая
    ctx.quadraticCurveTo(12 + 16 * bl * st.spread, topY - 3, outX, topY + 4 + 8 * st.topCut);
    // Кромка: слегка вогнутая вниз к пятке лезвия
    ctx.quadraticCurveTo(outX - 4, (topY + botY) / 2, outX - 2, botY - 2);
    if (st.beard) {
      // «Борода» — выступ вниз за пределы обуха
      ctx.quadraticCurveTo(outX - 8, botY + 8 + 8 * st.beard, 15 + 3 * bl, botY + 6 + 12 * st.beard);
      ctx.quadraticCurveTo(13, botY - 2, 11, botY - 12);
    } else {
      ctx.quadraticCurveTo(outX - 12, botY + 3, 11, botY - 12);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Кромка лезвия светлее — узкая полоса вдоль режущей части
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(outX - 3, topY + 9 + 6 * st.topCut);
    ctx.quadraticCurveTo(outX - 6, (topY + botY) / 2, outX - 4, botY - 6);
    ctx.stroke();

    // Отверстия в лезвии — тяжёлые секиры
    if (st.holes) {
      ctx.fillStyle = 'rgba(22,17,12,0.62)';
      ctx.beginPath();
      ctx.arc(outX - 11, topY + 12, 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (bl > 1.2) {
        ctx.beginPath();
        ctx.arc(outX - 10, topY + 20, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Зазубрины по кромке
    if (st.edgeSerrated || /skullsplitter|bloodmoon/.test(st.key)) {
      ctx.fillStyle = 'rgba(22,17,12,0.55)';
      ctx.beginPath();
      ctx.moveTo(outX - 4, topY + 14);
      ctx.lineTo(outX + 1, topY + 17);
      ctx.lineTo(outX - 4, topY + 20);
      ctx.closePath();
      ctx.fill();
    }

    // Обух с обратной стороны
    if (st.back !== 'none') {
      ctx.fillStyle = shade(metal, st.back === 'double' ? -0.08 : -0.16);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
      if (st.back === 'double') {
        // Вторая лопасть — лабрис
        ctx.beginPath();
        ctx.moveTo(11, topY + 2);
        ctx.quadraticCurveTo(-22 * bl, bladeTop + 6, -16 * bl, botY - 2);
        ctx.quadraticCurveTo(-4, botY - 10, 11, botY - 12);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.32)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-3, topY + 5);
        ctx.quadraticCurveTo(-13 * bl, bladeTop + 12, -11 * bl, botY - 6);
        ctx.stroke();
      } else if (st.back === 'hammer') {
        roundRect(ctx, -8, topY + 2, 20, 18, 4);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        roundRect(ctx, -5, topY + 5, 5, 12, 2);
        ctx.fill();
      } else if (st.back === 'beak') {
        ctx.beginPath();
        ctx.moveTo(11, topY + 2);
        ctx.quadraticCurveTo(-14, bladeTop, -18, topY + 10);
        ctx.quadraticCurveTo(-8, topY + 8, 11, topY + 12);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else {
        // Короткий шип-крюк
        ctx.beginPath();
        ctx.moveTo(11, topY + 3);
        ctx.quadraticCurveTo(-6, bladeTop + 2, -9, topY + 12);
        ctx.quadraticCurveTo(-2, topY + 7, 11, topY + 9);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }

    // Шип на верхушке древка
    if (st.crown) {
      ctx.fillStyle = shade(metal, -0.05);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(9, bladeTop + 6);
      ctx.lineTo(13, -len - 12);
      ctx.lineTo(17, bladeTop + 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // Латунная обойма на древке — по тиру
    if (st.bandColor) {
      ctx.fillStyle = st.bandColor;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.8;
      roundRect(ctx, 6.6, -len + 34, 12.8, 5, 2);
      ctx.fill(); ctx.stroke();
    }
    return;
  }

  if (head === 'mace') {
    const len = v.len;
    const st = weaponStyle(w);
    const wooden = /club|spikedclub/.test(st.key);
    const tier = st.tier;
    const r = st.ballR;

    // Древко: у дубины — сучковатое дерево, у булавы — окованная рукоять
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(9, 32); ctx.lineTo(12, -len); ctx.stroke();
    ctx.strokeStyle = grip;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(9, 32); ctx.lineTo(12, -len); ctx.stroke();
    if (wooden) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(9.6, 24 - i * 8);
        ctx.lineTo(11.4, 20 - i * 8);
        ctx.stroke();
      }
    } else {
      // Кольца обоймы на рукояти
      ctx.fillStyle = shade(metal, -0.15);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      [10, 18].forEach(y => {
        roundRect(ctx, 5.4, y, 11, 4, 2);
        ctx.fill(); ctx.stroke();
      });
    }

    if (v.chain) {
      const spikeBall = /morningstar/.test(st.key);
      ctx.strokeStyle = '#8a8f94';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(12 + (i % 2 ? 4 : -4), -len - 4 - i * 8, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      const cy = -len - 42;
      ctx.fillStyle = metal;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.arc(12, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Фасетки шара
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(12, cy, r * 0.58, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8eef4';
      const n = spikeBall ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const long = spikeBall ? 1 : 0.62;
        ctx.beginPath();
        ctx.moveTo(12 + Math.cos(ang) * (r - 2), cy + Math.sin(ang) * (r - 2));
        ctx.lineTo(12 + Math.cos(ang) * (r - 2 + 8 * long), cy + Math.sin(ang) * (r - 2 + 8 * long));
        ctx.lineTo(12 + Math.cos(ang + 0.24) * (r - 2), cy + Math.sin(ang + 0.24) * (r - 2));
        ctx.closePath(); ctx.fill();
      }
      return;
    }

    ctx.fillStyle = metal;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    if (v.rays) {
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(12 + Math.cos(ang) * (r - 4), -len + Math.sin(ang) * (r - 4));
        ctx.lineTo(12 + Math.cos(ang) * (r + 8), -len + Math.sin(ang) * (r + 8));
        ctx.lineTo(12 + Math.cos(ang + 0.34) * (r - 4), -len + Math.sin(ang + 0.34) * (r - 4));
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (v.flanges) {
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(12 + Math.cos(ang) * (r - 5), -len + Math.sin(ang) * (r - 5));
        ctx.lineTo(12 + Math.cos(ang) * (r + 5), -len + Math.sin(ang) * (r + 5));
        ctx.lineTo(12 + Math.cos(ang + 0.5) * (r - 5), -len + Math.sin(ang + 0.5) * (r - 5));
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    // Головка: у дубины — бочонок, у булавы — шар, у гранёной — многогранник
    if (wooden) {
      ctx.beginPath();
      ctx.ellipse(12, -len, r * 0.9, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1.4;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(12, -len + i * 7, r * 0.82, 2.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.arc(12, -len, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Фасетки
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(12, -len, r * 0.55, r, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(12, -len, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    }

    if (v.skull) {
      ctx.fillStyle = '#e8eef4';
      ctx.beginPath(); ctx.arc(12, -len - 2, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#241c15';
      ctx.beginPath(); ctx.arc(9, -len - 4, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(15, -len - 4, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12, -len + 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(10, -len + 6); ctx.lineTo(11, -len + 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -len + 6); ctx.lineTo(13, -len + 9); ctx.stroke();
    }

    if (v.studs) {
      ctx.fillStyle = '#d0d8e0';
      const n = wooden ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const rr = wooden ? r * 0.95 : r * 0.85;
        ctx.beginPath();
        ctx.arc(12 + Math.cos(ang) * rr, -len + Math.sin(ang) * rr, wooden ? 1.9 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (tier >= 5) {
      ctx.strokeStyle = 'rgba(240,214,120,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(12, -len, r + 2.4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(8, -len - 5, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }

  if (head === 'hammer') {
    const len = v.len;
    const st = weaponStyle(w);
    // Головка уменьшена: в руке она выглядела как кувалда на палке.
    const hw = v.huge ? 24 : v.big ? 19 : 16;
    const gold = st.tier >= 5;
    const hy = -len - 2;

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(9, 32); ctx.lineTo(13, -len); ctx.stroke();
    ctx.strokeStyle = grip;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(9, 32); ctx.lineTo(13, -len); ctx.stroke();
    // Обмотка рукояти
    ctx.strokeStyle = st.wrap;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(8.4, 24 + i * 3.4);
      ctx.lineTo(15.2, 22.6 + i * 3.4);
      ctx.stroke();
    }

    // Клинья в проушине
    ctx.fillStyle = shade(grip, -0.3);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    roundRect(ctx, 10.4, hy + 11, 5, 4, 1.4);
    ctx.fill(); ctx.stroke();

    const grad = ctx.createLinearGradient(13 - hw, hy - 15, 13 + hw, hy + 15);
    grad.addColorStop(0, shade(metal, 0.28));
    grad.addColorStop(0.5, metal);
    grad.addColorStop(1, shade(metal, -0.35));
    ctx.fillStyle = grad;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;

    if (st.headShape === 'cylinder') {
      // Кузнечный молот: круглый боёк с торцом
      ctx.beginPath();
      ctx.ellipse(13, hy, hw * 0.72, 12, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(13, hy, hw * 0.36, 12, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.ellipse(9, hy - 4, hw * 0.2, 4, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (st.headShape === 'octa') {
      // Восьмигранная головка: видно фаски
      ctx.beginPath();
      ctx.moveTo(13 - hw, hy - 8);
      ctx.lineTo(13 - hw * 0.55, hy - 14);
      ctx.lineTo(13 + hw * 0.55, hy - 14);
      ctx.lineTo(13 + hw, hy - 8);
      ctx.lineTo(13 + hw, hy + 8);
      ctx.lineTo(13 + hw * 0.55, hy + 14);
      ctx.lineTo(13 - hw * 0.55, hy + 14);
      ctx.lineTo(13 - hw, hy + 8);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(13 - hw * 0.55, hy - 14); ctx.lineTo(13 - hw * 0.55, hy + 14);
      ctx.moveTo(13 + hw * 0.55, hy - 14); ctx.lineTo(13 + hw * 0.55, hy + 14);
      ctx.stroke();
    } else if (st.headShape === 'twin') {
      // Двойная головка: два бойка с перемычкой
      roundRect(ctx, 13 - hw, hy - 12, hw * 2, 24, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = shade(metal, -0.3);
      roundRect(ctx, 13 - hw - 5, hy - 8, 7, 16, 3);
      ctx.fill(); ctx.stroke();
      roundRect(ctx, 13 + hw - 2, hy - 8, 7, 16, 3);
      ctx.fill(); ctx.stroke();
    } else {
      // Классический прямоугольный боёк
      roundRect(ctx, 13 - hw, hy - 14, hw * 2, 28, 5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(ctx, 13 - hw + 3, hy - 12, hw * 2 - 6, 4, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      roundRect(ctx, 13 - hw + 3, hy + 8, hw * 2 - 6, 5, 2);
      ctx.fill();
    }

    // Противовес с обратной стороны
    if (st.poll !== 'none') {
      ctx.fillStyle = shade(metal, -0.06);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
      if (st.poll === 'beak') {
        ctx.beginPath();
        ctx.moveTo(13 - hw + 2, hy - 11);
        ctx.quadraticCurveTo(13 - hw - 13, hy - 8, 13 - hw - 16, hy + 1);
        ctx.quadraticCurveTo(13 - hw - 9, hy + 5, 13 - hw + 2, hy + 10);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (st.poll === 'wedge') {
        ctx.beginPath();
        ctx.moveTo(13 - hw + 2, hy - 10);
        ctx.lineTo(13 - hw - 14, hy - 4);
        ctx.lineTo(13 - hw - 14, hy + 6);
        ctx.lineTo(13 - hw + 2, hy + 10);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (st.poll === 'spike') {
        ctx.beginPath();
        ctx.moveTo(13 - hw + 2, hy - 7);
        ctx.lineTo(13 - hw - 16, hy);
        ctx.lineTo(13 - hw + 2, hy + 7);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else {
        roundRect(ctx, 13 - hw - 8, hy - 9, 10, 18, 3);
        ctx.fill(); ctx.stroke();
      }
    }

    // Заклёпки на головке
    if (st.headShape !== 'twin' && st.headShape !== 'cylinder') {
      ctx.fillStyle = 'rgba(24,18,12,0.5)';
      for (let i = 0; i < st.rivets; i++) {
        const t = st.rivets === 1 ? 0.5 : i / (st.rivets - 1);
        ctx.beginPath();
        ctx.arc(13 - hw * 0.55 + t * hw * 1.1, hy + 2, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Латунная обойма под головкой
    if (st.bandColor) {
      ctx.fillStyle = st.bandColor;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.8;
      roundRect(ctx, 8, hy + 15, 10, 5, 2);
      ctx.fill(); ctx.stroke();
    }
    if (gold) {
      ctx.strokeStyle = 'rgba(240,214,120,0.85)';
      ctx.lineWidth = 1.6;
      roundRect(ctx, 13 - hw + 1.5, hy - 12.5, hw * 2 - 3, 25, 5);
      ctx.stroke();
    }
    return;
  }

  if (head === 'pick') {
    const len = v.len;
    const key = String((w && (w.shape || w.id)) || '');
    const withHammer = /horsemanpick/.test(key);
    const narrow = /warpick/.test(key);

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(9, 32); ctx.lineTo(12, -len); ctx.stroke();
    ctx.strokeStyle = grip;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(9, 32); ctx.lineTo(12, -len); ctx.stroke();

    ctx.fillStyle = metal;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.4;
    // Клюв: узкий и длинный, у конного — короче и толще
    const beakLen = narrow ? 30 : withHammer ? 26 : 28;
    ctx.beginPath();
    ctx.moveTo(12, -len - 4);
    ctx.quadraticCurveTo(12 + beakLen, -len + 2, 12 + beakLen * 0.85, -len + 20);
    ctx.quadraticCurveTo(12 + beakLen * 0.5, -len + 8, 12, -len + 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Блик по клюву
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(14, -len - 1);
    ctx.quadraticCurveTo(12 + beakLen * 0.8, -len + 4, 12 + beakLen * 0.7, -len + 16);
    ctx.stroke();

    // Обушок: у конного клевца — молоток, у остальных — короткий шип
    ctx.fillStyle = shade(metal, withHammer ? -0.12 : -0.25);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    if (withHammer) {
      roundRect(ctx, -10, -len - 10, 22, 20, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      roundRect(ctx, -7, -len - 7, 5, 14, 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(12, -len - 2);
      ctx.quadraticCurveTo(-10, -len + 2, -8, -len + 14);
      ctx.quadraticCurveTo(0, -len + 8, 12, -len + 10);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    return;
  }

  if (head === 'spear' || head === 'trident' || head === 'halberd') {
    const len = v.len;
    const key = String((w && (w.shape || w.id)) || '');
    const tier = (w && w.tier) || 1;

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(9, 34); ctx.lineTo(14, -len); ctx.stroke();
    ctx.strokeStyle = grip;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(9, 34); ctx.lineTo(14, -len); ctx.stroke();
    // Обмотка древка у кисти — видно, где держать
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(8.2, 26 - i * 3.4);
      ctx.lineTo(13.4, 24.4 - i * 3.4);
      ctx.stroke();
    }

    if (v.vamplate) {
      ctx.fillStyle = shade(grip, 0.25);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(2, 4); ctx.quadraticCurveTo(14, -6, 26, 4);
      ctx.lineTo(20, 20); ctx.lineTo(8, 20);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(6, 10); ctx.quadraticCurveTo(14, 3, 22, 10);
      ctx.stroke();
    }

    ctx.fillStyle = v.tip || '#d6e0ea';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.2;

    if (head === 'trident') {
      const champ = /champion|champ/.test(key);
      const spread = champ ? 13 : 11;
      const tines = champ ? 26 : 24;
      [-spread, 0, spread].forEach((off, idx) => {
        // Средний зубец длиннее боковых
        const extra = idx === 1 ? 6 : 0;
        ctx.beginPath();
        ctx.moveTo(14 + off - 3, -len + 4);
        ctx.lineTo(14 + off, -len - tines - extra);
        ctx.lineTo(14 + off + 3, -len + 4);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Зазубрина на внутренней стороне боковых зубцов
        if (idx !== 1) {
          const s = idx === 0 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(14 + off + s * 2.4, -len - tines * 0.45);
          ctx.lineTo(14 + off + s * 6, -len - tines * 0.35);
          ctx.lineTo(14 + off + s * 2.4, -len - tines * 0.25);
          ctx.closePath();
          ctx.fill();
        }
      });
      // Перекладина с шишечкой
      ctx.beginPath(); ctx.moveTo(3, -len + 2); ctx.lineTo(25, -len + 2); ctx.stroke();
      ctx.fillStyle = shade(v.tip || '#d6e0ea', -0.2);
      ctx.beginPath(); ctx.arc(14, -len + 2, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (head === 'halberd') {
      // Топор-лезвие сбоку
      ctx.beginPath();
      ctx.moveTo(14, -len + 6);
      ctx.quadraticCurveTo(42, -len + 10, 38, -len + 32);
      ctx.quadraticCurveTo(24, -len + 22, 14, -len + 24);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Кромка топора
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(22, -len + 9);
      ctx.quadraticCurveTo(38, -len + 13, 35, -len + 29);
      ctx.stroke();
      // Наконечник
      ctx.fillStyle = v.tip || '#d6e0ea';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(10, -len + 4);
      ctx.lineTo(14, -len - 26);
      ctx.lineTo(18, -len + 4);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Крюк с обратной стороны
      if (/halberd/.test(key)) {
        ctx.fillStyle = shade(v.tip || '#d6e0ea', -0.18);
        ctx.beginPath();
        ctx.moveTo(11, -len + 8);
        ctx.quadraticCurveTo(-2, -len + 12, 0, -len + 24);
        ctx.quadraticCurveTo(4, -len + 16, 11, -len + 18);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    } else {
      const wide = v.wide ? 8 : 5;
      const longTip = /implance|lance/.test(key) ? 34 : 28;
      ctx.beginPath();
      ctx.moveTo(14 - wide, -len + 6);
      ctx.lineTo(14, -len - longTip);
      ctx.lineTo(14 + wide, -len + 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Грань по центру пера
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(14, -len - longTip + 4);
      ctx.lineTo(14, -len + 4);
      ctx.stroke();
      if (v.barb) {
        // Зазубрины гарпуна — по обе стороны
        ctx.fillStyle = v.tip || '#d6e0ea';
        [-1, 1].forEach(s => {
          ctx.beginPath();
          ctx.moveTo(14 + s * wide, -len + 14);
          ctx.lineTo(14 + s * (wide + 8), -len + 20);
          ctx.lineTo(14 + s * (wide - 1), -len + 18);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        });
      }
      if (v.wide) {
        // «Ушки» партизана
        [-1, 1].forEach(s => {
          ctx.beginPath();
          ctx.moveTo(14 + s * wide, -len + 8);
          ctx.quadraticCurveTo(14 + s * (wide + 7), -len + 10, 14 + s * wide, -len + 18);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        });
        ctx.beginPath();
        ctx.arc(14, -len + 12, 4.4, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      if (tier >= 4) {
        // Золотая втулка под пером
        ctx.fillStyle = '#e0bd5f';
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        roundRect(ctx, 9, -len + 4, 11, 6, 2);
        ctx.fill(); ctx.stroke();
      }
    }
    return;
  }

  if (head === 'bow') {
    // Лук рисуется в системе «вперёд = +X», кисть — в рукояти (0,0).
    // Плечи уходят вверх и вниз, дуга выгнута вперёд, тетива натянута назад.
    const h = v.len * 0.62;          // полухорда (высота плеча)
    const b = v.len * 0.22;          // глубина изгиба
    const wood = metal;

    // Тень-контур плеч
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-b, -h);
    ctx.quadraticCurveTo(b, 0, -b, h);
    ctx.stroke();

    // Само дерево плеч: тёплый градиент от рукояти к концам
    const bg = ctx.createLinearGradient(-b, 0, b * 1.1, 0);
    bg.addColorStop(0, shade(wood, -0.28));
    bg.addColorStop(0.55, wood);
    bg.addColorStop(1, shade(wood, 0.18));
    ctx.strokeStyle = bg;
    ctx.lineWidth = 6.4;
    ctx.beginPath();
    ctx.moveTo(-b, -h);
    ctx.quadraticCurveTo(b, 0, -b, h);
    ctx.stroke();

    // Роговые наконечники плеч
    ctx.fillStyle = shade(wood, -0.45);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.4;
    [-1, 1].forEach(sd => {
      ctx.save();
      ctx.translate(-b, sd * h);
      ctx.rotate(sd * -0.5);
      roundRect(ctx, -4, -5, 9, 11, 3);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    });

    // Тетива: в руке лук не натянут, поэтому она идёт прямой линией
    // между концами плеч и лишь слегка провисает к рукояти.
    ctx.strokeStyle = 'rgba(244,238,222,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-b, -h);
    ctx.quadraticCurveTo(-b - v.len * 0.035, 0, -b, h);
    ctx.stroke();

    // Обмотка рукояти
    ctx.strokeStyle = grip;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-1.5, -8);
    ctx.quadraticCurveTo(3, 0, -1.5, 8);
    ctx.stroke();
    ctx.strokeStyle = shade(grip, 0.3);
    ctx.lineWidth = 1.4;
    for (let i = -6; i <= 6; i += 4) {
      ctx.beginPath();
      ctx.moveTo(-2, i);
      ctx.lineTo(2, i + 2.4);
      ctx.stroke();
    }

    // Загнутые вперёд кончики у составного лука
    if (v.recurve) {
      ctx.strokeStyle = wood;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-b, -h);
      ctx.quadraticCurveTo(-b + 7, -h - 8, -b + 17, -h - 5);
      ctx.moveTo(-b, h);
      ctx.quadraticCurveTo(-b + 7, h + 8, -b + 17, h + 5);
      ctx.stroke();
    }
    return;
  }

  if (head === 'xbow') {
    // Арбалет: ложе вперёд по +X, дуга у переднего конца, тетива к ореху.
    const L = v.len * 0.78;
    const t = v.heavy ? 12 : 9;          // толщина ложа
    const w = v.len * 0.30;              // полуразмах дуги
    const wood = grip;

    // Приклад: уходит назад и вниз от заднего среза ложа
    ctx.fillStyle = shade(wood, -0.12);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-18, -t / 2);
    ctx.lineTo(-40, -t / 2 - 2);
    ctx.quadraticCurveTo(-46, 2, -40, 12);
    ctx.lineTo(-18, t / 2 + 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Ложе
    const lg = ctx.createLinearGradient(0, -t / 2, 0, t / 2);
    lg.addColorStop(0, shade(wood, 0.22));
    lg.addColorStop(1, shade(wood, -0.3));
    ctx.fillStyle = lg;
    roundRect(ctx, -20, -t / 2, L + 20, t, 4);
    ctx.fill(); ctx.stroke();

    // Пистолетная рукоять вниз
    ctx.fillStyle = shade(wood, -0.2);
    ctx.beginPath();
    ctx.moveTo(-10, t / 2 - 1);
    ctx.lineTo(-2, t / 2 - 1);
    ctx.lineTo(-5, t / 2 + 20);
    ctx.lineTo(-14, t / 2 + 18);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Дуга: вертикальная, выпуклая вперёд
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = v.heavy ? 11 : 9;
    ctx.beginPath();
    ctx.moveTo(L, -w);
    ctx.quadraticCurveTo(L + 20, 0, L, w);
    ctx.stroke();
    const dg = ctx.createLinearGradient(L, -w, L + 18, w);
    dg.addColorStop(0, shade(metal, 0.25));
    dg.addColorStop(0.5, metal);
    dg.addColorStop(1, shade(metal, -0.3));
    ctx.strokeStyle = dg;
    ctx.lineWidth = v.heavy ? 6.5 : 5;
    ctx.beginPath();
    ctx.moveTo(L, -w);
    ctx.quadraticCurveTo(L + 20, 0, L, w);
    ctx.stroke();

    // Тетива: от концов дуги к ореху (натянута)
    ctx.strokeStyle = 'rgba(240,234,216,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(L, -w);
    ctx.lineTo(L - 26, 0);
    ctx.lineTo(L, w);
    ctx.stroke();

    // Болт в жёлобе: древко и гранёный наконечник
    ctx.strokeStyle = '#d9cdb2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L - 28, -2);
    ctx.lineTo(L + 14, -2);
    ctx.stroke();
    ctx.fillStyle = '#cfd8e0';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(L + 14, -6);
    ctx.lineTo(L + 26, -2);
    ctx.lineTo(L + 14, 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Оперение
    ctx.fillStyle = '#b8a98c';
    ctx.beginPath();
    ctx.moveTo(L - 28, -2);
    ctx.lineTo(L - 34, -7);
    ctx.lineTo(L - 30, -2);
    ctx.lineTo(L - 34, 3);
    ctx.closePath();
    ctx.fill();

    // Спусковой крючок и скоба
    ctx.strokeStyle = '#8a8377';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(-4, t / 2 + 8, 7, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, t / 2 + 2);
    ctx.lineTo(-6, t / 2 + 8);
    ctx.stroke();

    // Магазин повторного арбалета
    if (v.magazine) {
      ctx.fillStyle = shade(metal, -0.15);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.6;
      roundRect(ctx, L * 0.35, -t / 2 - 13, 22, 11, 3);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(L * 0.35 + 5 + i * 6, -t / 2 - 11);
        ctx.lineTo(L * 0.35 + 5 + i * 6, -t / 2 - 4);
        ctx.stroke();
      }
    }
    return;
  }

  ctx.fillStyle = '#f0b183';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.arc(9, 30, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

// ==================== БОЕВЫЕ ПСЫ ====================
// Пёс нарисован в той же мультяшной манере, что и гладиаторы: крупная
// голова, толстые лапы с жирным контуром, короткое мощное тело и два тона
// на объём. Ходьба — диагональные пары лап, как у настоящей собаки.
function drawBattleDog(ctx, dog, x, y, scale = 1, facing = 1, a = {}) {
  const now = performance.now() / 1000;
  const seed = (dog.id || 'dog').length * 0.61;
  const alive = 1 - (a.dead || 0);
  const alpha = a.alpha == null ? 1 : a.alpha;
  const colors = dog.colors || { body: '#6b4a2e', belly: '#a98a63', snout: '#4a3320' };

  const breed = dog.breedId || '';
  const heavy = dog.build === 'heavy';
  const slim = dog.build === 'slim';
  const bw = heavy ? 1.14 : slim ? 0.88 : 1;
  const legW = heavy ? 12 : slim ? 9 : 10.5;
  const floppyEars = breed === 'molossian' || breed === 'molossian2' || breed === 'pug';
  const shortSnout = breed === 'pug' || breed === 'molossian' || breed === 'molossian2';
  const redEyes = breed === 'blackdog';
  const armored = breed === 'warhound';
  const dockedTail = breed === 'molossian' || breed === 'molossian2';

  const breath = (a.breath == null ? 1 : a.breath) * alive;
  const breathY = Math.sin(now * 2.1 + seed) * 1.5 * breath;
  const walkPhase = a.walkPhase || 0;
  const walk = a.walk || 0;
  const bob = -Math.abs(Math.sin(walkPhase)) * 2.4 * walk * alive;
  const bite = Math.max(a.swing || 0, (a.hurt || 0) * 0.55);
  const dead = a.dead || 0;

  const bodyCY = -48;
  const bodyRX = 32 * bw;
  const bodyRY = 17 * bw;

  ctx.save();
  ctx.globalAlpha = alpha;

  // --- Тень ---
  ctx.save();
  ctx.globalAlpha = 0.3 * alpha;
  ctx.fillStyle = '#0a0705';
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * scale, 40 * scale, 10 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- Аура активного пса ---
  if (a.glow > 0.01) {
    const g = ctx.createRadialGradient(x, y - 50 * scale, 4, x, y - 50 * scale, 78 * scale);
    g.addColorStop(0, `rgba(255,214,110,${0.26 * a.glow})`);
    g.addColorStop(1, 'rgba(255,214,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - 46 * scale, 70 * scale, 64 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Точка опоры ---
  ctx.translate(x, y + (breathY + bob) * scale);
  if (dead > 0) {
    ctx.rotate(dead * 1.45 * facing);
    ctx.translate(0, dead * 6);
  }
  ctx.rotate((a.dodge || 0) * 0.12 * facing);
  ctx.translate((a.lunge || 0) * 4, 0);
  ctx.scale(scale * facing, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ---------- Лапы ----------
  const drawLeg = (L) => {
    const sw = Math.sin(walkPhase + L.phase) * 8 * walk;
    const lift = Math.max(0, Math.cos(walkPhase + L.phase)) * 7 * walk;
    const topX = L.x;
    const topY = bodyCY + bodyRY * 0.35;
    const footX = L.x + sw;
    const footY = -2 - lift;
    const kneeX = L.x + sw * 0.35 + (L.back ? -7 : 7);
    const kneeY = (topY + footY) * 0.5 - 1;
    const col = L.far ? shade(colors.body, -0.24) : colors.body;

    limb(ctx, topX, topY, kneeX, kneeY, legW, col);
    limb(ctx, kneeX, kneeY, footX, footY, legW * 0.86, col);

    // Лапа
    ctx.fillStyle = L.far ? shade(colors.snout, -0.06) : shade(colors.snout, 0.1);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.8;
    roundRect(ctx, footX - 6, footY - 3.5, 15, 7.5, 3.5);
    ctx.fill();
    ctx.stroke();

    // Когти
    ctx.strokeStyle = shade(colors.snout, -0.45);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) {
      const cx = footX + 4.5 + i * 3;
      ctx.beginPath();
      ctx.moveTo(cx, footY - 2.2);
      ctx.lineTo(cx + 1.6, footY + 1.6);
      ctx.stroke();
    }
  };

  // Диагональные пары: ближние в противофазе друг другу, дальние — наоборот.
  const legs = [
    { x: -22 * bw, phase: Math.PI, far: true, back: true },
    { x: 20 * bw, phase: 0, far: true, back: false },
    { x: -13 * bw, phase: 0, far: false, back: true },
    { x: 29 * bw, phase: Math.PI, far: false, back: false }
  ];

  legs.filter(L => L.far).forEach(drawLeg);

  // ---------- Хвост ----------
  const wag = Math.sin(now * (3 + (a.victory || 0) * 9) + seed) * (7 + (a.victory || 0) * 9);
  const tailLen = dockedTail ? 0.55 : 1;
  const tailBaseX = -bodyRX * 0.78;
  const tailBaseY = bodyCY - bodyRY * 0.55;
  const tailMidX = -bodyRX * 1.12;
  const tailMidY = bodyCY - bodyRY * 0.2 + wag * 0.25;
  const tailTipX = -bodyRX * (1.42 * tailLen + 0.06);
  const tailTipY = bodyCY - bodyRY * (0.95 * tailLen + 0.1) + wag * 0.6;

  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 11 * bw;
  ctx.beginPath();
  ctx.moveTo(tailBaseX, tailBaseY);
  ctx.quadraticCurveTo(tailMidX, tailMidY, tailTipX, tailTipY);
  ctx.stroke();
  ctx.strokeStyle = colors.body;
  ctx.lineWidth = 7 * bw;
  ctx.beginPath();
  ctx.moveTo(tailBaseX, tailBaseY);
  ctx.quadraticCurveTo(tailMidX, tailMidY, tailTipX, tailTipY);
  ctx.stroke();

  // ---------- Корпус ----------
  ctx.beginPath();
  ctx.ellipse(0, bodyCY, bodyRX, bodyRY, -0.05, 0, Math.PI * 2);
  ctx.fillStyle = colors.body;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4.5;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, bodyCY, bodyRX, bodyRY, -0.05, 0, Math.PI * 2);
  ctx.clip();

  // Тёмная сторона — зад и низ
  ctx.fillStyle = shade(colors.body, -0.24);
  ctx.beginPath();
  ctx.ellipse(-bodyRX * 0.4, bodyCY + bodyRY * 0.35, bodyRX * 0.78, bodyRY * 0.85, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Светлая грудь и живот
  ctx.fillStyle = colors.belly;
  ctx.beginPath();
  ctx.ellipse(bodyRX * 0.12, bodyCY + bodyRY * 0.66, bodyRX * 0.62, bodyRY * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();

  // Блик сверху
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(-bodyRX * 0.05, bodyCY - bodyRY * 0.5, bodyRX * 0.5, bodyRY * 0.3, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // Шрамы от ран
  const hpR = Math.max(0, Math.min(1, (dog.hp == null ? 1 : dog.hp) / Math.max(1, dog.maxHp || 1)));
  if (hpR < 0.7) {
    ctx.strokeStyle = BLOOD;
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = alpha * (1 - hpR);
    for (let i = 0; i < 3; i++) {
      const sx = -bodyRX * 0.35 + i * 11;
      ctx.beginPath();
      ctx.moveTo(sx, bodyCY - bodyRY * 0.45);
      ctx.lineTo(sx + 5, bodyCY + bodyRY * 0.3);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  }
  ctx.restore();

  // ---------- Попона / нагрудник (снаряжение пса) ----------
  // Визуал зависит от item.vis: кожа, кольчуга или бронза. У боевого пса
  // без попоны остаётся его собственный бронзовый нагрудник.
  const dogGear = (dog.equip && dog.equip.doggear) || null;
  drawDogGear(ctx, dogGear, { bodyRX, bodyRY, bodyCY, bw, armored, alpha, seed });

  // ---------- Шея ----------
  const headX = bodyRX * 0.86 + 4;
  const headY = bodyCY - bodyRY * 1.15;
  const headR = heavy ? 22 : slim ? 18 : 20;

  limb(ctx, bodyRX * 0.5, bodyCY - bodyRY * 0.35, headX - 6, headY + headR * 0.5, 16 * bw, colors.body);

  // ---------- Ошейник с шипами ----------
  ctx.save();
  ctx.translate(headX - 11, headY + headR * 0.82);
  ctx.rotate(-0.38);
  ctx.fillStyle = '#7a2f28';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  roundRect(ctx, -9, -6, 20, 12, 4);
  ctx.fill();
  ctx.stroke();
  // Шипы
  ctx.fillStyle = '#c9a45c';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const sx = -6 + i * 6;
    ctx.beginPath();
    ctx.moveTo(sx, -6);
    ctx.lineTo(sx + 3, -11);
    ctx.lineTo(sx + 6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Бляха
  ctx.fillStyle = '#e5b54f';
  ctx.beginPath();
  ctx.arc(0, 5, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // ---------- Голова ----------
  const emo = a.emotion || (dead > 0.4 ? 'dead' : (a.hurt || 0) > 0.3 ? 'hurt'
    : (a.victory || 0) > 0.5 ? 'happy' : 'idle');

  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(bite * 0.1);

  // Уши: торчком или висячие лопухи
  ctx.fillStyle = shade(colors.body, -0.16);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  if (floppyEars) {
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * headR * 0.42, -headR * 0.55);
      ctx.quadraticCurveTo(sd * (headR + 11), -headR * 0.55, sd * (headR + 7), headR * 0.5);
      ctx.quadraticCurveTo(sd * (headR - 2), headR * 0.25, sd * headR * 0.55, -headR * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  } else {
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(sd * headR * 0.3, -headR * 0.72);
      ctx.lineTo(sd * headR * 0.88, -headR * 1.78);
      ctx.lineTo(sd * headR * 1.02, -headR * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Внутренняя часть уха
      ctx.fillStyle = shade(colors.belly, -0.1);
      ctx.beginPath();
      ctx.moveTo(sd * headR * 0.46, -headR * 0.7);
      ctx.lineTo(sd * headR * 0.84, -headR * 1.45);
      ctx.lineTo(sd * headR * 0.9, -headR * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(colors.body, -0.16);
    });
  }

  // Череп
  ctx.beginPath();
  ctx.ellipse(0, 0, headR, headR * 0.94, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.body;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, headR, headR * 0.94, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = shade(colors.body, -0.2);
  ctx.beginPath();
  ctx.ellipse(-headR * 0.58, headR * 0.18, headR * 0.58, headR * 0.86, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.ellipse(headR * 0.1, -headR * 0.5, headR * 0.42, headR * 0.2, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Морда: у молоссов и мопса — приплюснутая, у волкодавов — вытянутая
  const snoutLen = shortSnout ? 17 : 31;
  const snoutH = shortSnout ? 16 : 13;
  const snoutX = headR * 0.52;
  const snoutY = headR * 0.14;

  ctx.beginPath();
  roundRect(ctx, snoutX, snoutY - snoutH / 2, snoutLen, snoutH, snoutH * 0.5);
  ctx.fillStyle = colors.snout;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.4;
  ctx.stroke();

  // Верхняя губа светлее
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.ellipse(snoutX + snoutLen * 0.5, snoutY - snoutH * 0.22, snoutLen * 0.38, snoutH * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Нижняя челюсть открывается при укусе
  ctx.save();
  ctx.translate(snoutX + 1, snoutY + snoutH * 0.3);
  ctx.rotate(bite * 0.38);
  ctx.beginPath();
  roundRect(ctx, 0, -1, snoutLen * 0.88, 8, 4);
  ctx.fillStyle = shade(colors.snout, 0.14);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Пасть: тёмная щель и клыки
  if (bite > 0.12) {
    ctx.fillStyle = '#5a1a14';
    ctx.beginPath();
    ctx.ellipse(snoutX + snoutLen * 0.55, snoutY + snoutH * 0.42,
      snoutLen * 0.3, 2.2 + bite * 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4efe2';
    ctx.beginPath();
    ctx.moveTo(snoutX + snoutLen * 0.28, snoutY + snoutH * 0.34);
    ctx.lineTo(snoutX + snoutLen * 0.36, snoutY + snoutH * 0.34 + 4 + bite * 3);
    ctx.lineTo(snoutX + snoutLen * 0.44, snoutY + snoutH * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(snoutX + snoutLen * 0.62, snoutY + snoutH * 0.34);
    ctx.lineTo(snoutX + snoutLen * 0.7, snoutY + snoutH * 0.34 + 4 + bite * 3);
    ctx.lineTo(snoutX + snoutLen * 0.78, snoutY + snoutH * 0.34);
    ctx.closePath();
    ctx.fill();
  }

  // Нос
  ctx.fillStyle = '#16110d';
  ctx.beginPath();
  ctx.ellipse(snoutX + snoutLen - 1.5, snoutY - 1, 5.4, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(snoutX + snoutLen - 3.4, snoutY - 2.4, 1.6, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Язык при радости
  if (emo === 'happy') {
    ctx.fillStyle = '#c9645c';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(snoutX + snoutLen * 0.62, snoutY + snoutH * 0.55,
      snoutLen * 0.16, 4.4 + Math.sin(now * 7 + seed) * 0.8, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Глаз
  const eyeX = headR * 0.26;
  const eyeY = -headR * 0.24;
  if (emo === 'dead') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(eyeX - 5, eyeY - 5);
    ctx.lineTo(eyeX + 5, eyeY + 5);
    ctx.moveTo(eyeX + 5, eyeY - 5);
    ctx.lineTo(eyeX - 5, eyeY + 5);
    ctx.stroke();
  } else {
    const eyeH = emo === 'angry' ? 5.2 : emo === 'hurt' ? 5.6 : 6.4;
    ctx.fillStyle = '#fffdf6';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY, 6.4, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = redEyes ? '#b3261e' : '#20180f';
    ctx.beginPath();
    ctx.arc(eyeX + 1.6, eyeY + 0.4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(eyeX + 0.6, eyeY - 1.2, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Бровь-рык
  if (emo === 'angry' || bite > 0.3) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(eyeX - 7, eyeY - 9);
    ctx.lineTo(eyeX + 7, eyeY - 5);
    ctx.stroke();
  }

  ctx.restore();

  // ---------- Ближние лапы поверх корпуса ----------
  legs.filter(L => !L.far).forEach(drawLeg);

  // ---------- Вспышка урона ----------
  if ((a.hurt || 0) > 0.01) {
    ctx.globalAlpha = alpha * (a.hurt || 0) * 0.4;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.ellipse(0, bodyCY, bodyRX * 1.05, bodyRY * 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}


// Попона или нагрудник пса. Три разных силуэта, чтобы на песке сразу
// было видно, что именно куплено в кузнице.
function drawDogGear(ctx, item, g) {
  const { bodyRX, bodyRY, bodyCY, bw } = g;

  // Своего нагрудника у боевого пса нет — он «встроен» в породу
  if (!item) {
    if (g.armored) drawDogBarding(ctx, bodyRX, bodyRY, bodyCY, '#9a7a44', 'plain', bw);
    return;
  }

  const vis = item.vis || 'leather';
  if (vis === 'mail') drawDogBarding(ctx, bodyRX, bodyRY, bodyCY, item.color || '#8d99a4', 'mail', bw);
  else if (vis === 'bronze') drawDogBarding(ctx, bodyRX, bodyRY, bodyCY, item.color || '#b08f43', 'bronze', bw);
  else drawDogBarding(ctx, bodyRX, bodyRY, bodyCY, item.color || '#7a5230', 'leather', bw);
}

// Общая геометрия: «седло» на спине, заходящее на бока и грудь
function drawDogBarding(ctx, bodyRX, bodyRY, bodyCY, color, style, bw) {
  ctx.save();

  // Полотно попоны: от холки до крупа, с вырезом под лапы
  ctx.beginPath();
  ctx.moveTo(-bodyRX * 0.92, bodyCY - bodyRY * 0.2);
  ctx.quadraticCurveTo(-bodyRX * 0.7, bodyCY - bodyRY * 1.12, 0, bodyCY - bodyRY * 1.18);
  ctx.quadraticCurveTo(bodyRX * 0.72, bodyCY - bodyRY * 1.12, bodyRX * 0.86, bodyCY - bodyRY * 0.05);
  ctx.quadraticCurveTo(bodyRX * 0.66, bodyCY + bodyRY * 1.0, 0, bodyCY + bodyRY * 1.06);
  ctx.quadraticCurveTo(-bodyRX * 0.7, bodyCY + bodyRY * 1.0, -bodyRX * 0.92, bodyCY - bodyRY * 0.2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.save();
  ctx.clip();

  if (style === 'mail') {
    // Кольчужное плетение: сетка мелких колец
    ctx.strokeStyle = shade(color, -0.35);
    ctx.lineWidth = 1.2;
    const step = 4.2;
    for (let row = -3; row < 12; row++) {
      for (let col = -9; col < 10; col++) {
        const cx = col * step + (row % 2 ? step / 2 : 0);
        const cy = bodyCY - bodyRY * 1.1 + row * step;
        ctx.beginPath();
        ctx.arc(cx, cy, step * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.ellipse(-bodyRX * 0.1, bodyCY - bodyRY * 0.55, bodyRX * 0.5, bodyRY * 0.34, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // Ремни, стягивающие кольчугу
    ctx.fillStyle = shade(color, -0.5);
    ctx.fillRect(-bodyRX * 0.5, bodyCY - bodyRY * 1.1, 5, bodyRY * 2.2);
    ctx.fillRect(bodyRX * 0.32, bodyCY - bodyRY * 1.1, 5, bodyRY * 2.2);
  } else if (style === 'bronze') {
    // Чеканные пластины и шипы
    ctx.fillStyle = shade(color, -0.22);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(-bodyRX * 0.5 + i * bodyRX * 0.45, bodyCY + bodyRY * 0.15,
        bodyRX * 0.22, bodyRY * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,236,180,0.45)';
    ctx.beginPath();
    ctx.ellipse(-bodyRX * 0.15, bodyCY - bodyRY * 0.62, bodyRX * 0.42, bodyRY * 0.26, -0.12, 0, Math.PI * 2);
    ctx.fill();
    // Заклёпки по канту
    ctx.fillStyle = '#e5b54f';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    for (let i = -3; i <= 3; i++) {
      const px = i * bodyRX * 0.26;
      const py = bodyCY - bodyRY * (1.02 - Math.abs(i) * 0.07);
      ctx.beginPath();
      ctx.arc(px, py, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    // Кожа: прошивка по краю и потёртости
    ctx.strokeStyle = shade(color, -0.42);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(-bodyRX * 0.8, bodyCY - bodyRY * 0.25);
    ctx.quadraticCurveTo(-bodyRX * 0.6, bodyCY - bodyRY * 0.95, 0, bodyCY - bodyRY * 1.0);
    ctx.quadraticCurveTo(bodyRX * 0.62, bodyCY - bodyRY * 0.95, bodyRX * 0.74, bodyCY - bodyRY * 0.1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(bodyRX * 0.3, bodyCY + bodyRY * 0.4, bodyRX * 0.3, bodyRY * 0.3, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Шипы на бронзе — поверх полотна, чтобы читались силуэтом
  if (style === 'bronze') {
    ctx.fillStyle = '#cfd8e0';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    [-0.55, 0, 0.55].forEach(k => {
      const sx = bodyRX * k;
      const sy = bodyCY - bodyRY * 0.95;
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy);
      ctx.lineTo(sx, sy - 9);
      ctx.lineTo(sx + 4, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }

  // Нагрудная пластина у всех вариантов — прикрывает грудь от клыков
  ctx.beginPath();
  ctx.ellipse(bodyRX * 0.72, bodyCY + bodyRY * 0.18, bodyRX * 0.22, bodyRY * 0.72, -0.16, 0, Math.PI * 2);
  ctx.fillStyle = shade(color, style === 'leather' ? 0.06 : 0.1);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3.2;
  ctx.stroke();

  ctx.restore();
}

// ==================== ИКОНКИ ПРЕДМЕТОВ ====================
// Габариты модели оружия в её собственной системе координат.
// Нужны, чтобы иконка в кузнице стояла ровно по центру ячейки.
function weaponIconBounds(v) {
  const head = v.head;
  const len = v.len || 48;
  const pad = 6;
  let x0, x1, y0, y1;

  if (head === 'blade') {
    const curve = v.curve || 0;
    const tipX = 6 + curve * len * 0.55;
    x0 = Math.min(3, tipX - 2, -10);
    x1 = Math.max(13, tipX + 3, 28);
    y0 = 28 - len - 9;
    y1 = 49;
  } else if (head === 'axe') {
    const bl = v.bladeW || 1;
    x0 = Math.min(11, -24 * bl);
    x1 = Math.max(12 + 34 * bl, 12);
    y0 = -len;
    y1 = 34;
  } else if (head === 'mace') {
    const reach = v.chain ? 42 + 22 : (v.rays || v.spikes ? 22 : 14);
    x0 = 12 - reach;
    x1 = 12 + reach;
    y0 = -len - reach;
    y1 = 34;
  } else if (head === 'hammer') {
    const hw = v.huge ? 24 : v.big ? 19 : 16;
    x0 = 13 - hw;
    x1 = 13 + hw;
    y0 = -len - 16;
    y1 = 34;
  } else if (head === 'pick') {
    x0 = -10;
    x1 = 40;
    y0 = -len - 4;
    y1 = 34;
  } else if (head === 'spear' || head === 'trident' || head === 'halberd') {
    x0 = 2;
    x1 = head === 'halberd' ? 42 : head === 'trident' ? 25 : 24;
    y0 = -len - 30;
    y1 = 36;
  } else if (head === 'bow') {
    const h = len * 0.62;
    const b = len * 0.22;
    x0 = -b - 9;
    x1 = v.recurve ? 18 : 2;
    y0 = -h - (v.recurve ? 9 : 3);
    y1 = h + (v.recurve ? 9 : 3);
  } else if (head === 'xbow') {
    const L = len * 0.78;
    const w = len * 0.30;
    const t = v.heavy ? 12 : 9;
    x0 = -46;
    x1 = L + 22;
    y0 = -w - 3;
    y1 = t / 2 + 21;
  } else {
    x0 = -len;
    x1 = len;
    y0 = -len;
    y1 = len;
  }

  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function drawItemIcon(ctx, item, x, y, size) {
  if (!item) return;
  ctx.save();
  ctx.translate(x, y);

  if (item.slot === 'weapon') {
    const v = item.vis || WEAPON_VIS[item.shape] || WEAPON_VIS.gladius;
    // Ставим по центру габарита модели, а не по рукояти: у лука,
    // копья и топора рукоять сильно смещена от середины.
    const b = weaponIconBounds(v);
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const diag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
    const sc = (size * 0.88) / Math.max(48, diag);
    ctx.rotate(-Math.PI / 4);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);
    drawWeaponShape(ctx, v, item);
  } else if (item.slot === 'offhand') {
    const sc = size / 92;
    ctx.scale(sc, sc);
    drawShield(ctx, item, 0, 0);
  } else if (item.slot === 'head') {
    const sc = size / 100;
    ctx.scale(sc, sc);
    ctx.translate(0, 6);
    drawHelmet(ctx, item, 0, 30);
  } else if (item.slot === 'body') {
    const sc = size / 120;
    ctx.scale(sc, sc);
    ctx.translate(0, 18);
    const shoulder = 34, waist = 24, hipY = 10;
    // У части моделей силуэт другой: безрукавка уже, накидка шире и мягче.
    const narrow = item.vis === 'sleeveless';
    const wide = item.vis === 'poncho';
    const sw = shoulder * (narrow ? 0.78 : wide ? 1.02 : 1);
    const ww = waist * (narrow ? 0.94 : 1);
    const topY = hipY - (wide ? 52 : 58);
    ctx.beginPath();
    ctx.moveTo(-ww, hipY);
    ctx.quadraticCurveTo(-sw * 1.3, hipY - 40, -sw, topY);
    if (wide) {
      ctx.lineTo(-sw * 0.42, topY - 2);
      ctx.lineTo(-sw * 0.34, topY + 4);
      ctx.lineTo(sw * 0.34, topY + 4);
      ctx.lineTo(sw * 0.42, topY - 2);
      ctx.lineTo(sw, topY);
    } else {
      ctx.quadraticCurveTo(0, topY - 8, sw, topY);
    }
    ctx.quadraticCurveTo(sw * 1.3, hipY - 40, ww, hipY);
    ctx.quadraticCurveTo(0, hipY + (wide ? 8 : 6), -ww, hipY);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    drawBodyArmorDetail(ctx, item, sw, ww, hipY);
    ctx.restore();
    // Накидка и безрукавка: открытые плечи/углы рисуем поверх клипа
    if (narrow) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      [-1, 1].forEach(sd => {
        ctx.beginPath();
        ctx.ellipse(sd * sw * 0.98, topY + 8, 5, 9, sd * 0.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  } else if (item.slot === 'arms') {
    const sc = size / 90;
    ctx.scale(sc, sc);
    ctx.rotate(-0.3);
    limb(ctx, -22, 22, 18, -22, 20, item.color);
    ctx.fillStyle = shade(item.color, 0.16);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    roundRect(ctx, -8, -16, 26, 12, 4);
    ctx.fill(); ctx.stroke();
    // Показываем фактуру наручей на иконке (функция сама отсеивает
    // стили без собственной модели)
    drawArmSchoolDetail(ctx, item, 6, -4);
  } else if (item.slot === 'legs') {
    const sc = size / 100;
    ctx.scale(sc, sc);
    ctx.translate(0, 8);
    [-1, 1].forEach(sd => {
      limb(ctx, sd * 12, -30, sd * 16, 26, 18, item.color);
      ctx.fillStyle = shade(item.color, 0.16);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
      roundRect(ctx, sd * 16 - 12, -22, 24, 34, 5);
      ctx.fill(); ctx.stroke();
      // Новые школы: полосы отделки по поножу
      if (item.vis === 'medieval') {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        roundRect(ctx, sd * 16 - 9, -18, 6, 24, 3);
        ctx.fill();
        ctx.fillStyle = item.trim || '#c0392b';
        roundRect(ctx, sd * 16 - 12, -4, 24, 4, 2);
        ctx.fill();
      } else if (item.vis === 'china') {
        ctx.fillStyle = item.trim || '#e2b65a';
        for (let i = 0; i < 3; i++) {
          roundRect(ctx, sd * 16 - 10, -18 + i * 9, 20, 3.4, 1.4);
          ctx.fill();
        }
      } else if (item.vis === 'rus') {
        ctx.strokeStyle = shade(item.color, -0.3);
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(sd * 16 - 11, -18 + i * 8);
          ctx.lineTo(sd * 16 + 11, -17 + i * 8);
          ctx.stroke();
        }
      } else if (item.vis === 'mongol') {
        ctx.fillStyle = '#b8a888';
        roundRect(ctx, sd * 16 - 12, -6, 24, 6, 3);
        ctx.fill();
      } else if (item.vis === 'puttees' || item.vis === 'legwraps') {
        // Обмотки: косые витки ткани по голени
        ctx.strokeStyle = shade(item.color, -0.32);
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const yy = -18 + i * 7;
          ctx.beginPath();
          ctx.moveTo(sd * 16 - 12, yy);
          ctx.lineTo(sd * 16 + 12, yy + 4);
          ctx.stroke();
        }
      } else if (item.vis === 'gaiters' || item.vis === 'hidegreaves') {
        // Гетры/кожаные поножи: пряжки и прошивка
        ctx.fillStyle = item.trim || '#8a6a3a';
        for (let i = 0; i < 3; i++) {
          roundRect(ctx, sd * 16 - 10, -17 + i * 9, 20, 3.6, 1.6);
          ctx.fill();
        }
        ctx.strokeStyle = shade(item.color, -0.4);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sd * 16, -20); ctx.lineTo(sd * 16, 10);
        ctx.stroke();
      } else if (item.vis === 'baggy') {
        // Шаровары: свободная штанина с подвязкой
        ctx.fillStyle = shade(item.color, 0.1);
        roundRect(ctx, sd * 16 - 14, -20, 28, 26, 9);
        ctx.fill();
        ctx.fillStyle = shade(item.color, -0.45);
        roundRect(ctx, sd * 16 - 13, 4, 26, 5, 2);
        ctx.fill();
      } else if (item.vis === 'splintlegs') {
        // Шинные наголенники: продольные полосы стали
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = i ? shade(item.color, 0.14) : shade(item.color, 0.28);
          roundRect(ctx, sd * 16 - 10, -18 + (i + 1) * 8, 20, 5.4, 2);
          ctx.fill();
        }
      } else if (item.vis === 'samurai') {
        // Лаковые пластины, шнуровка золотом
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i % 2 ? shade(item.color, 0.16) : shade(item.color, -0.06);
          roundRect(ctx, sd * 16 - 11, -18 + i * 9, 22, 7.4, 2);
          ctx.fill();
        }
        ctx.strokeStyle = item.trim || '#c9a45c';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(sd * 16 - 8 + i * 8, -18);
          ctx.lineTo(sd * 16 - 6 + i * 8, 8);
          ctx.stroke();
        }
      } else if (item.vis === 'platelegs' || item.vis === 'irongreaves'
        || item.vis === 'goldgreaves' || item.vis === 'imperialgreaves'
        || item.vis === 'titangreaves' || item.vis === 'greaves') {
        // Кованая створка: фаска и наколенник
        ctx.fillStyle = 'rgba(255,255,255,0.34)';
        roundRect(ctx, sd * 16 - 9, -18, 7, 24, 3);
        ctx.fill();
        ctx.fillStyle = shade(item.color, 0.3);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sd * 16, -20, 6.4, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      } else if (item.vis === 'chainlegs' || item.vis === 'scalelegs') {
        // Кольчуга/чешуя: мелкая рябь по голени
        ctx.strokeStyle = shade(item.color, -0.38);
        ctx.lineWidth = 1.2;
        for (let row = 0; row < 5; row++) {
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.arc(sd * 16 - 7 + k * 7 + (row % 2 ? 3 : 0), -16 + row * 5.4, 2.2, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    });
  } else if (item.slot === 'doggear') {
    // Иконка попоны: полотно в профиль, накинутое на спину — так силуэт
    // читается сразу, а фактура (кожа/кольчуга/бронза) видна вблизи.
    const sc = size / 74;
    ctx.scale(sc, sc);
    const color = item.color || '#7a5230';

    // Полотно: дуга по спине с двумя свесами по бокам
    ctx.beginPath();
    ctx.moveTo(-40, 6);
    ctx.quadraticCurveTo(-34, -26, 0, -30);
    ctx.quadraticCurveTo(34, -26, 40, 6);
    ctx.quadraticCurveTo(30, 24, 14, 22);
    ctx.quadraticCurveTo(0, 12, -14, 22);
    ctx.quadraticCurveTo(-30, 24, -40, 6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4.5;
    ctx.stroke();

    ctx.save();
    ctx.clip();
    if (item.vis === 'mail') {
      ctx.strokeStyle = shade(color, -0.4);
      ctx.lineWidth = 1.3;
      for (let row = -6; row < 8; row++) {
        for (let col = -8; col < 9; col++) {
          ctx.beginPath();
          ctx.arc(col * 9 + (row % 2 ? 4.5 : 0), row * 9 - 8, 3.8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (item.vis === 'bronze') {
      // Чеканные пластины с продольными рёбрами
      ctx.strokeStyle = shade(color, -0.32);
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 14, -30);
        ctx.lineTo(i * 14, 26);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,236,180,0.5)';
      ctx.beginPath();
      ctx.ellipse(-8, -20, 20, 7, -0.12, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = shade(color, -0.45);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(-34, 2);
      ctx.quadraticCurveTo(-28, -20, 0, -24);
      ctx.quadraticCurveTo(28, -20, 34, 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Поперечные ремни и пряжка — узнаваемая деталь упряжи
    ctx.fillStyle = shade(color, -0.5);
    ctx.fillRect(-3, -30, 6, 54);
    ctx.fillStyle = '#e5b54f';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    roundRect(ctx, -8, -4, 16, 13, 3);
    ctx.fill();
    ctx.stroke();

    // Шипы бронзового нагрудника
    if (item.vis === 'bronze') {
      ctx.fillStyle = '#cfd8e0';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      [-24, 24].forEach(sx => {
        ctx.beginPath();
        ctx.moveTo(sx - 5, -24);
        ctx.lineTo(sx, -36);
        ctx.lineTo(sx + 5, -24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
    }
  }

  ctx.restore();
}

function itemTierBadge(item) {
  const t = TIER_INFO[item.tier] || TIER_INFO[1];
  return `<span class="tier-badge" style="color:${t.color};border-color:${t.color}">${t.stars} ${t.name}</span>`;
}

// ---------- Body cosmetics: tattoos and war paint ----------
function drawBodyCosmetics(ctx, glad, shoulder, waist, hipY) {
  const tattoo = glad.tattoo || (glad.cosmetic && glad.cosmetic.tattoo) || 'none';
  const paint = glad.paint || (glad.cosmetic && glad.cosmetic.paint) || 'none';
  if (tattoo === 'none' && paint === 'none') return;

  ctx.save();
  ctx.lineCap = 'round';

  if (tattoo === 'bands') {
    ctx.strokeStyle = 'rgba(38,28,26,0.75)';
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 3; i++) {
      const yy = hipY - 40 + i * 5;
      ctx.beginPath();
      ctx.moveTo(-shoulder * 0.62, yy);
      ctx.quadraticCurveTo(-shoulder * 0.35, yy + 2, -shoulder * 0.12, yy);
      ctx.moveTo(shoulder * 0.62, yy);
      ctx.quadraticCurveTo(shoulder * 0.35, yy + 2, shoulder * 0.12, yy);
      ctx.stroke();
    }
  } else if (tattoo === 'snake') {
    ctx.strokeStyle = 'rgba(30,60,44,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(shoulder * 0.68, hipY - 46);
    ctx.bezierCurveTo(shoulder * 0.4, hipY - 34, shoulder * 0.72, hipY - 22, shoulder * 0.34, hipY - 14);
    ctx.stroke();
    ctx.fillStyle = 'rgba(30,60,44,0.85)';
    ctx.beginPath();
    ctx.arc(shoulder * 0.34, hipY - 14, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (tattoo === 'wings') {
    ctx.strokeStyle = 'rgba(40,32,30,0.7)';
    ctx.lineWidth = 2.2;
    [-1, 1].forEach(s => {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(s * shoulder * 0.1, hipY - 44 + i * 4);
        ctx.quadraticCurveTo(s * shoulder * 0.5, hipY - 46 + i * 8, s * shoulder * 0.85, hipY - 30 + i * 9);
        ctx.stroke();
      }
    });
  } else if (tattoo === 'runes') {
    ctx.strokeStyle = 'rgba(52,34,60,0.8)';
    ctx.lineWidth = 2.2;
    const rx = [-shoulder * 0.34, 0, shoulder * 0.34];
    rx.forEach((x, i) => {
      const yy = hipY - 38 + (i % 2) * 8;
      ctx.beginPath();
      ctx.moveTo(x - 4, yy); ctx.lineTo(x + 4, yy);
      ctx.moveTo(x, yy - 6); ctx.lineTo(x, yy + 6);
      ctx.moveTo(x - 3, yy + 3); ctx.lineTo(x + 3, yy - 3);
      ctx.stroke();
    });
  }

  if (paint === 'war') {
    ctx.strokeStyle = 'rgba(150,40,32,0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-shoulder * 0.5, hipY - 44); ctx.lineTo(-shoulder * 0.2, hipY - 16);
    ctx.moveTo(shoulder * 0.5, hipY - 44); ctx.lineTo(shoulder * 0.2, hipY - 16);
    ctx.stroke();
  } else if (paint === 'ash') {
    ctx.fillStyle = 'rgba(70,66,62,0.35)';
    ctx.beginPath();
    ctx.ellipse(-shoulder * 0.3, hipY - 30, shoulder * 0.4, 16, -0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (paint === 'gold') {
    ctx.strokeStyle = 'rgba(226,182,90,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-shoulder * 0.55, hipY - 42);
    ctx.quadraticCurveTo(0, hipY - 26, shoulder * 0.55, hipY - 42);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-shoulder * 0.4, hipY - 20);
    ctx.quadraticCurveTo(0, hipY - 8, shoulder * 0.4, hipY - 20);
    ctx.stroke();
  }

  ctx.restore();
}
