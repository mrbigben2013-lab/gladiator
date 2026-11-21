// ==================== ПРОМЫСЕЛ: РЫБАЛКА И ОХОТА ====================
// Мини-игра «поймай момент»: метка бегает по полосе, нужно нажать в
// зелёной зоне. Три удачных раза — улов. Награда скромная: примерно
// половина золота среднего боя, чтобы промысел не заменял арену.
const WORK = {
  type: 'fishing',
  running: false,
  pos: 0,
  dir: 1,
  speed: 0.85,
  zone: [0.40, 0.60],
  caught: 0,
  attempts: 0,
  flash: 0,
  flashKind: '',
  msg: '',
  raf: null,
  ts: 0
};

function workDef() { return WORK_TYPES[WORK.type] || WORK_TYPES.fishing; }

function renderWork() {
  const tabs = document.getElementById('work-tabs');
  if (tabs) {
    tabs.innerHTML = Object.values(WORK_TYPES).map(w =>
      `<button class="work-tab ${WORK.type === w.id ? 'on' : ''}" onclick="setWorkType('${w.id}')">
        <span class="wt-ico">${w.icon}</span>
        <span class="wt-name">${w.name}</span>
        <span class="wt-sub">${w.desc}</span>
        <span class="wt-pay">до ${w.gold}з</span>
      </button>`).join('');
  }
  const fg = document.getElementById('fishing-gold');
  if (fg) fg.textContent = STATE.gold;
  const hint = document.getElementById('work-hint');
  if (hint) hint.textContent = workDef().hint + ' • удачных попыток: ' + WORK.caught + '/' + workDef().need;
  const btn = document.getElementById('work-btn');
  if (btn) btn.textContent = WORK.running ? 'Подсекать!' : (WORK.caught ? 'Продолжить' : 'Начать');
  startWorkAnim();
  drawWorkFrame(0);
}

function setWorkType(id) {
  if (WORK.running) return;
  if (!WORK_TYPES[id]) return;
  WORK.type = id;
  WORK.caught = 0;
  WORK.attempts = 0;
  WORK.msg = '';
  sfx('click');
  renderWork();
}

function startWorkAnim() {
  if (WORK.raf) return;
  WORK.ts = 0;
  const step = ts => {
    if (STATE.currentLocation !== 'fishing') { WORK.raf = null; WORK.ts = 0; return; }
    const dt = WORK.ts ? Math.min((ts - WORK.ts) / 1000, 0.05) : 0.016;
    WORK.ts = ts;
    updateWork(dt);
    drawWorkFrame(dt);
    WORK.raf = requestAnimationFrame(step);
  };
  WORK.raf = requestAnimationFrame(step);
}

function stopWorkAnim() {
  if (WORK.raf) cancelAnimationFrame(WORK.raf);
  WORK.raf = null;
  WORK.ts = 0;
  WORK.running = false;
}

function updateWork(dt) {
  if (!WORK.running) return;
  WORK.pos += WORK.dir * WORK.speed * dt;
  if (WORK.pos >= 1) { WORK.pos = 1; WORK.dir = -1; }
  if (WORK.pos <= 0) { WORK.pos = 0; WORK.dir = 1; }
  if (WORK.flash > 0) WORK.flash = Math.max(0, WORK.flash - dt * 2.2);
}

function workAction() {
  const def = workDef();
  if (!WORK.running) {
    WORK.running = true;
    WORK.pos = 0;
    WORK.dir = 1;
    WORK.caught = 0;
    WORK.attempts = 0;
    WORK.msg = 'Ждите нужного мгновения…';
    // Чем больше попыток, тем шире окно — новичку не так обидно
    WORK.zone = [0.40, 0.60];
    sfx('click');
    renderWork();
    return;
  }
  WORK.attempts++;
  const inZone = WORK.pos >= WORK.zone[0] && WORK.pos <= WORK.zone[1];
  if (inZone) {
    WORK.caught++;
    WORK.flash = 1;
    WORK.flashKind = 'good';
    sfx('coin');
    if (WORK.caught >= def.need) {
      WORK.running = false;
      const gold = def.gold;
      STATE.gold += gold;
      const who = STATE.roster[0];
      if (who) { who.xp += def.xp; applyLevelUps(who); }
      STATE.day++;
      WORK.msg = `Улов! +${gold} золота${who ? ', ' + who.name + ' +' + def.xp + ' опыта' : ''}`;
      addToast(`${def.icon} ${def.name}: +${gold} золота`);
      sfx('levelup');
      updateUI();
      if (typeof Save !== 'undefined') Save.autosave();
    } else {
      WORK.msg = `Есть! ${WORK.caught}/${def.need}`;
    }
  } else {
    WORK.flash = 1;
    WORK.flashKind = 'bad';
    sfx('miss');
    WORK.msg = 'Сорвалось…';
    // Неудача сужает окно чуть-чуть, но не больше предела
    WORK.zone = [WORK.zone[0] + 0.02, WORK.zone[1] - 0.02];
    if (WORK.zone[1] - WORK.zone[0] < 0.1) WORK.zone = [0.45, 0.55];
  }
  renderWork();
}

// Пробел — действие промысла
document.addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  if (STATE.currentLocation !== 'fishing') return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  workAction();
});

function drawWorkFrame(dt) {
  const cv = document.getElementById('workCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const def = workDef();
  const fishing = def.id === 'fishing';
  const t = performance.now() / 1000;

  ctx.clearRect(0, 0, W, H);

  // Фон: море или лес
  if (fishing) {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, '#4a6a86');
    sky.addColorStop(1, '#c9a97a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.5);
    const sea = ctx.createLinearGradient(0, H * 0.42, 0, H);
    sea.addColorStop(0, '#3a6a8a');
    sea.addColorStop(1, '#1e3a52');
    ctx.fillStyle = sea;
    ctx.fillRect(0, H * 0.42, W, H * 0.58);
    // Волны
    ctx.strokeStyle = 'rgba(200,230,245,0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = H * 0.5 + i * 20;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const yy = y + Math.sin((x * 0.02) + t * 1.2 + i) * 3;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Лодка
    ctx.fillStyle = '#6a4a2e';
    ctx.beginPath();
    ctx.moveTo(W * 0.18, H * 0.62);
    ctx.quadraticCurveTo(W * 0.30, H * 0.74, W * 0.44, H * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c9b48a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.31, H * 0.63);
    ctx.lineTo(W * 0.31, H * 0.36);
    ctx.stroke();
    // Леска и поплавок
    const bobX = W * 0.31 + 60 + Math.sin(t * 1.4) * 6;
    const bobY = H * 0.66 + Math.sin(t * 2.2) * 4;
    ctx.strokeStyle = 'rgba(230,240,250,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(W * 0.31, H * 0.36);
    ctx.quadraticCurveTo(bobX, H * 0.46, bobX, bobY);
    ctx.stroke();
    ctx.fillStyle = WORK.running ? '#e5b54f' : '#c05040';
    ctx.beginPath();
    ctx.arc(bobX, bobY, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, '#6a8a5a');
    sky.addColorStop(1, '#d8c48a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.55);
    // Деревья
    for (let i = 0; i < 7; i++) {
      const x = 40 + i * (W - 80) / 7 + Math.sin(i * 3.1) * 14;
      const h = H * (0.22 + (i % 3) * 0.05);
      ctx.fillStyle = '#3a5236';
      ctx.beginPath();
      ctx.moveTo(x, H * 0.60 - h);
      ctx.lineTo(x - 34, H * 0.60);
      ctx.lineTo(x + 34, H * 0.60);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4a3520';
      ctx.fillRect(x - 5, H * 0.58, 10, 16);
    }
    ctx.fillStyle = '#4a6a3a';
    ctx.fillRect(0, H * 0.58, W, H * 0.42);
    ctx.fillStyle = 'rgba(30,50,25,0.25)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(W * (0.12 + i * 0.2), H * 0.86, 60, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Кусты, из которых выходит зверь
    ctx.fillStyle = '#2e4a2c';
    ctx.beginPath();
    ctx.ellipse(W * 0.62, H * 0.66, 90, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    if (WORK.running) {
      const px = W * 0.62 + Math.sin(t * 2) * 8;
      ctx.fillStyle = '#7a5230';
      ctx.beginPath();
      ctx.ellipse(px, H * 0.64, 26, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a20';
      ctx.beginPath();
      ctx.arc(px + 24, H * 0.60, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5a3a20';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + 28, H * 0.575); ctx.lineTo(px + 34, H * 0.545);
      ctx.moveTo(px + 20, H * 0.575); ctx.lineTo(px + 16, H * 0.545);
      ctx.stroke();
    }
    // Лучник
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(W * 0.24, H * 0.60, 8, 34);
    ctx.beginPath();
    ctx.arc(W * 0.244, H * 0.585, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Полоса «поймай момент» ---
  const barX = W * 0.10;
  const barW = W * 0.80;
  const barY = H * 0.90;
  const barH = 18;
  ctx.fillStyle = 'rgba(10,10,12,0.6)';
  ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 8);
  ctx.fillStyle = '#20262e';
  ctx.fillRect(barX, barY, barW, barH);
  // Зона
  const zx = barX + barW * WORK.zone[0];
  const zw = barW * (WORK.zone[1] - WORK.zone[0]);
  const zoneGrad = ctx.createLinearGradient(zx, 0, zx + zw, 0);
  zoneGrad.addColorStop(0, 'rgba(120,200,120,0.45)');
  zoneGrad.addColorStop(0.5, 'rgba(150,230,150,0.9)');
  zoneGrad.addColorStop(1, 'rgba(120,200,120,0.45)');
  ctx.fillStyle = zoneGrad;
  ctx.fillRect(zx, barY, zw, barH);
  // Метка
  const mx = barX + barW * WORK.pos;
  ctx.fillStyle = WORK.running ? '#fff3c4' : '#8a8a92';
  ctx.fillRect(mx - 3, barY - 7, 6, barH + 14);
  ctx.fillStyle = 'rgba(255,243,196,0.35)';
  ctx.beginPath();
  ctx.arc(mx, barY + barH / 2, 13, 0, Math.PI * 2);
  ctx.fill();

  // Вспышка результата
  if (WORK.flash > 0) {
    ctx.fillStyle = WORK.flashKind === 'good'
      ? `rgba(150,230,150,${WORK.flash * 0.20})`
      : `rgba(220,90,70,${WORK.flash * 0.20})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Сообщение
  ctx.fillStyle = 'rgba(240,232,210,0.92)';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  if (WORK.msg) ctx.fillText(WORK.msg, W / 2, H * 0.18);
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(220,215,200,0.75)';
  ctx.fillText(`${def.name} • ${WORK.caught}/${def.need} • награда до ${def.gold}з`, W / 2, H * 0.12);
  ctx.textAlign = 'left';
}

