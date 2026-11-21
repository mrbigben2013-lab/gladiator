// ==================== ТРЕНИРОВКА: РИТМ-МИНИ-ИГРА ====================
// Тренировка больше не «ждёт таймер». Боец работает в ритм: на экране
// четыре дорожки, метки бегут к линии удара. Нажимайте нужную клавишу
// (A S D F) или кнопку в момент удара — каждый точный удар добавляет
// один такт к прогрессу. Промах и пропуск сбрасывают серию и отнимают такт.
// Первый уровень — 2 минуты чистого ритма, каждый следующий — на минуту больше.
let trainingRaf = null;
let trainingTs = 0;

const TRAIN_KEYS = [
  { code: 'KeyA', key: 'A', lane: 0 },
  { code: 'KeyS', key: 'S', lane: 1 },
  { code: 'KeyD', key: 'D', lane: 2 },
  { code: 'KeyF', key: 'F', lane: 3 }
];
const TRAIN_BASE_MS = 2 * 60 * 1000;   // 1-й уровень — 2 минуты
const TRAIN_STEP_MS = 60 * 1000;       // +1 минута за каждый следующий уровень
const TRAIN_BEAT_MS = 620;             // длительность такта
const TRAIN_WINDOW_MS = 190;           // окно попадания до/после линии удара

function trainingNeedMs(level) {
  return TRAIN_BASE_MS + Math.max(0, (level || 1) - 1) * TRAIN_STEP_MS;
}

function trainState(id) {
  return (STATE.training || {})[id] || null;
}

function trainProgress(id) {
  const t = trainState(id);
  if (!t) return null;
  return clamp01(t.prog / Math.max(1, t.need));
}

function trainRemaining(id) {
  const t = trainState(id);
  if (!t) return null;
  return Math.max(0, t.need - t.prog);
}

function isTraining(id) {
  return !!trainState(id);
}

function fmtTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Состояние текущей мини-игры. В сейв не попадает: незавершённая
// тренировка после загрузки просто ждёт, пока её продолжат.
const TRAIN_GAME = {
  id: null,
  running: false,
  lane: 0,
  beat: 0,
  beatStart: 0,
  nextBeatAt: 0,
  combo: 0,
  best: 0,
  hits: 0,
  misses: 0,
  flash: 0,
  laneFlash: [0, 0, 0, 0],
  raf: null,
  lastTs: 0
};

// Завершение тренировки: выдаём уровень и очки характеристик
function finishTraining(id) {
  const g = STATE.roster.find(x => x.id === id);
  if (!STATE.training) STATE.training = {};
  delete STATE.training[id];
  if (TRAIN_GAME.id === id) stopTrainingGame();
  if (!g) return;
  const need = Math.max(0, xpToNext(g.level) - g.xp);
  g.xp += need;
  const ups = applyLevelUps(g);
  sfx('levelup');
  addToast(`🎉 ${g.name} завершает тренировку — уровень ${g.level}! +${ups * 2} очк.`);
  updateUI();
  renderTraining();
  if (typeof Save !== 'undefined') Save.autosave();
}

// Совместимость со старыми вызовами: тренировки больше не идут по часам
function checkTrainings() { return false; }

function renderTraining() {
  const el = document.getElementById('training-list');
  if (!el) return;
  if (!STATE.roster.length) {
    el.innerHTML = `<div class="empty-hint">Некого тренировать.</div>`;
    stopTrainingAnim();
    return;
  }

  el.innerHTML = STATE.roster.map(g => {
    const need = xpToNext(g.level);
    const xpPct = Math.min(100, (g.xp / need) * 100);
    const t = trainState(g.id);
    const busy = !!t;
    const prog = busy ? trainProgress(g.id) : 0;
    const left = busy ? trainRemaining(g.id) : 0;

    let action;
    if (busy) {
      const active = TRAIN_GAME.id === g.id && TRAIN_GAME.running;
      action = `<div class="tr-training">
           <div class="tr-train-bar"><i style="width:${Math.round(prog * 100)}%"></i></div>
           <span class="tr-train-lbl">🥁 ${fmtTime(left)} ритма • ${Math.round(prog * 100)}%</span>
           <div class="tr-btns">
             <button class="mini-btn ${active ? '' : 'primary'}" onclick="startTrainingGame('${g.id}')">${active ? 'идёт' : 'Продолжить'}</button>
             <button class="mini-btn" onclick="cancelTraining('${g.id}')">Прервать</button>
           </div>
         </div>`;
    } else {
      action = `<button class="mini-btn primary" onclick="trainGlad('${g.id}')">Тренировать • ${TRAINING_COST}з</button>`;
    }

    return `<div class="train-row ${busy ? 'busy' : ''}">
      <div class="tr-info">
        <span class="tr-name">${g.name}</span>
        <span class="tr-hp">ур. ${g.level} • опыт ${g.xp}/${need} • норма ${fmtTime(trainingNeedMs(g.level))}</span>
      </div>
      <div class="tr-bar"><i style="width:${xpPct}%;background:#7f9ad1"></i></div>
      ${action}
    </div>`;
  }).join('');

  const tg = document.getElementById('training-gold');
  if (tg) tg.textContent = STATE.gold;
  startTrainingAnim();
  renderTrainGamePanel();
}

// ---------- панель мини-игры ----------
function renderTrainGamePanel() {
  const box = document.getElementById('train-game');
  if (!box) return;
  if (!TRAIN_GAME.id || !trainState(TRAIN_GAME.id)) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  const g = STATE.roster.find(x => x.id === TRAIN_GAME.id);
  const prog = trainProgress(TRAIN_GAME.id) || 0;
  box.style.display = 'block';
  box.innerHTML = `
    <div class="tg-head">
      <span class="tg-name">🥁 ${g ? g.name : 'Боец'}</span>
      <span class="tg-prog">${Math.round(prog * 100)}% • осталось ${fmtTime(trainRemaining(TRAIN_GAME.id))}</span>
    </div>
    <div class="tg-bar"><i style="width:${Math.round(prog * 100)}%"></i></div>
    <div class="tg-pads">
      ${TRAIN_KEYS.map(k => `<button class="tg-pad" data-lane="${k.lane}" onclick="trainHitLane(${k.lane})">
        <b>${k.key}</b><span>удар</span>
      </button>`).join('')}
    </div>
    <div class="tg-stats">
      <span>серия: <b id="tg-combo">${TRAIN_GAME.combo}</b></span>
      <span>лучшая: <b id="tg-best">${TRAIN_GAME.best}</b></span>
      <span>промахов: <b id="tg-miss">${TRAIN_GAME.misses}</b></span>
    </div>
  `;
}

function trainPadFlash(lane, kind) {
  const pads = document.querySelectorAll('#train-game .tg-pad');
  const pad = pads[lane];
  if (!pad) return;
  pad.classList.remove('hit', 'miss');
  void pad.offsetWidth;
  pad.classList.add(kind);
}

// ---------- запуск / остановка ----------
function startTrainingGame(id) {
  const t = trainState(id);
  if (!t) return;
  if (TRAIN_GAME.id && TRAIN_GAME.id !== id) {
    // Одновременно работает только один боец
    stopTrainingGame();
  }
  TRAIN_GAME.id = id;
  TRAIN_GAME.running = true;
  TRAIN_GAME.lane = Math.floor(Math.random() * TRAIN_KEYS.length);
  TRAIN_GAME.beat = 0;
  TRAIN_GAME.nextBeatAt = 0;
  TRAIN_GAME.lastTs = 0;
  renderTrainGamePanel();
  startTrainingAnim();
  addToast('Ритм пошёл. Бейте в такт!');
}

function stopTrainingGame(silent) {
  TRAIN_GAME.running = false;
  TRAIN_GAME.id = null;
  TRAIN_GAME.combo = 0;
  renderTrainGamePanel();
  if (!silent) renderTraining();
}

function cancelTraining(id) {
  const t = trainState(id);
  if (!t) return;
  if (!confirm('Прервать тренировку? Заплаченные деньги не вернутся.')) return;
  if (!STATE.training) STATE.training = {};
  delete STATE.training[id];
  if (TRAIN_GAME.id === id) stopTrainingGame(true);
  sfx('error');
  renderTraining();
  addToast('Тренировка прервана.');
  if (typeof Save !== 'undefined') Save.autosave();
}

// ---------- ритм ----------
function trainBeatStep(now) {
  const g = TRAIN_GAME;
  const t = trainState(g.id);
  if (!t) { stopTrainingGame(true); return; }
  g.beatStart = now;
  g.nextBeatAt = now + TRAIN_BEAT_MS;
  // Паттерн: иногда та же дорожка, иногда соседняя — так живее
  if (g.beat > 0 && Math.random() < 0.35) {
    g.lane = (g.lane + (Math.random() < 0.5 ? 1 : -1) + 4) % 4;
  } else {
    g.lane = Math.floor(Math.random() * 4);
  }
  g.beat++;
  // Музыка: сильная доля каждые четыре такта
  try {
    if (g.beat % 4 === 1) sfx('beatStrong'); else sfx('beat');
    sfx('melody' + (g.lane + 1));
  } catch (e) {}
}

// Нажатие: клавиша или кнопка. Возвращает true при точном ударе.
function trainHitLane(lane) {
  const g = TRAIN_GAME;
  if (!g.running || !g.id) return false;
  const t = trainState(g.id);
  if (!t) return false;
  const now = performance.now();
  // Насколько близко метка к линии удара
  const until = Math.abs(g.nextBeatAt - now);
  if (lane === g.lane && until <= TRAIN_WINDOW_MS) {
    g.hits++;
    g.combo++;
    g.best = Math.max(g.best, g.combo);
    g.flash = 1;
    g.laneFlash[lane] = 1;
    t.prog = Math.min(t.need, t.prog + TRAIN_BEAT_MS);
    sfx('rhythmHit');
    trainPadFlash(lane, 'hit');
    // Такт закрыт — сразу выдаём следующий, чтобы не было двойных попаданий
    trainBeatStep(now);
    const comboEl = document.getElementById('tg-combo');
    const bestEl = document.getElementById('tg-best');
    if (comboEl) comboEl.textContent = g.combo;
    if (bestEl) bestEl.textContent = g.best;
    if (t.prog >= t.need) finishTraining(g.id);
    return true;
  }
  // Промах: не та дорожка или слишком рано/поздно
  g.misses++;
  g.combo = 0;
  t.prog = Math.max(0, t.prog - TRAIN_BEAT_MS);
  sfx('rhythmMiss');
  trainPadFlash(lane, 'miss');
  const comboEl = document.getElementById('tg-combo');
  const missEl = document.getElementById('tg-miss');
  if (comboEl) comboEl.textContent = g.combo;
  if (missEl) missEl.textContent = g.misses;
  return false;
}

// Пропуск ноты: не нажали вовремя
function trainMissBeat() {
  const g = TRAIN_GAME;
  const t = trainState(g.id);
  if (!t) { stopTrainingGame(true); return; }
  g.misses++;
  g.combo = 0;
  t.prog = Math.max(0, t.prog - TRAIN_BEAT_MS);
  sfx('rhythmMiss');
  const comboEl = document.getElementById('tg-combo');
  const missEl = document.getElementById('tg-miss');
  if (comboEl) comboEl.textContent = g.combo;
  if (missEl) missEl.textContent = g.misses;
}

// Клавиатура: A S D F во время мини-игры
document.addEventListener('keydown', e => {
  if (!TRAIN_GAME.running) return;
  if (STATE.currentLocation !== 'training') return;
  const k = TRAIN_KEYS.find(x => x.code === e.code);
  if (!k) return;
  e.preventDefault();
  trainHitLane(k.lane);
});

// ---------- отрисовка ----------
function startTrainingAnim() {
  if (trainingRaf) return;
  trainingTs = 0;
  const step = ts => {
    if (STATE.currentLocation !== 'training') { trainingRaf = null; trainingTs = 0; return; }
    const dt = trainingTs ? Math.min((ts - trainingTs) / 1000, 0.05) : 0.016;
    trainingTs = ts;
    drawTrainingFrame(dt, ts);
    trainingRaf = requestAnimationFrame(step);
  };
  trainingRaf = requestAnimationFrame(step);
}

function stopTrainingAnim() {
  if (trainingRaf) cancelAnimationFrame(trainingRaf);
  trainingRaf = null;
  trainingTs = 0;
}

function drawTrainingFrame(dt, ts) {
  const cv = document.getElementById('trainingCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const t = performance.now() / 1000;
  const g = TRAIN_GAME;

  // Ритм: если мини-игра идёт, следим за тактами
  if (g.running && g.id) {
    const now = ts || performance.now();
    if (!g.nextBeatAt) trainBeatStep(now);
    else if (now > g.nextBeatAt + TRAIN_WINDOW_MS + 60) {
      // Ноту пропустили
      trainMissBeat();
      trainBeatStep(now);
    }
  }

  ctx.clearRect(0, 0, W, H);

  // Небо и стена лудуса
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#3a4a5e');
  sky.addColorStop(1, '#b08a5a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.62);

  // Стена с арками
  ctx.fillStyle = '#6a5238';
  ctx.fillRect(0, H * 0.34, W, H * 0.28);
  for (let i = 0; i < 9; i++) {
    const ax = 20 + i * (W - 40) / 9;
    ctx.fillStyle = 'rgba(30,20,12,0.7)';
    ctx.beginPath();
    ctx.moveTo(ax, H * 0.60);
    ctx.lineTo(ax, H * 0.44);
    ctx.quadraticCurveTo(ax + 22, H * 0.36, ax + 44, H * 0.44);
    ctx.lineTo(ax + 44, H * 0.60);
    ctx.closePath();
    ctx.fill();
  }

  // Двор: утоптанная земля
  const gr = ctx.createLinearGradient(0, H * 0.60, 0, H);
  gr.addColorStop(0, '#9a7f56');
  gr.addColorStop(1, '#5a4630');
  ctx.fillStyle = gr;
  ctx.fillRect(0, H * 0.60, W, H * 0.40);

  // Трава по краям
  ctx.fillStyle = 'rgba(92,120,64,0.5)';
  ctx.beginPath();
  ctx.ellipse(W * 0.08, H * 0.94, W * 0.12, H * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(W * 0.94, H * 0.9, W * 0.1, H * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  const groundY = H * 0.86;

  // --- Боец бьёт по щиту ---
  const fighter = g.id ? STATE.roster.find(x => x.id === g.id) : STATE.roster[0];
  const swingPhase = g.running ? (1 - Math.min(1, Math.abs(g.nextBeatAt - (ts || performance.now())) / TRAIN_BEAT_MS)) : (t * 0.9) % 1;
  const swing = g.running ? Math.max(0, Math.sin(swingPhase * Math.PI)) : Math.max(0, Math.sin(((t * 0.9) % 1) * Math.PI * 2));
  if (fighter) {
    drawBattleBrother(ctx, fighter, W * 0.30, groundY, 1.05, 1, {
      walk: 0, swing, breath: 1.2, emotion: 'angry'
    });
  }

  // Щит-мишень
  const sx = W * 0.52;
  const sy = groundY - H * 0.26;
  ctx.fillStyle = '#6a4a2a';
  ctx.beginPath(); ctx.ellipse(sx, sy, 46, 54, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(sx, sy, 40, 48, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#c9a45c';
  ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2); ctx.fill();

  // --- Дорожки ритма ---
  const laneX0 = W * 0.60;
  const laneW = W * 0.36;
  const laneH = 26;
  const laneGap = 12;
  const top = H * 0.20;

  ctx.textAlign = 'left';
  for (let i = 0; i < 4; i++) {
    const y = top + i * (laneH + laneGap);
    const active = g.running && i === g.lane;
    // Дорожка
    ctx.fillStyle = active ? 'rgba(229,181,79,0.16)' : 'rgba(20,14,10,0.55)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(laneX0, y, laneW, laneH, 8) : ctx.rect(laneX0, y, laneW, laneH);
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(229,181,79,0.6)' : 'rgba(120,100,74,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Клавиша слева
    ctx.fillStyle = active ? '#e5b54f' : '#8a7a68';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(TRAIN_KEYS[i].key, laneX0 - 18, y + laneH * 0.68);

    // Линия удара
    const hitX = laneX0 + laneW - 26;
    ctx.strokeStyle = 'rgba(240,224,184,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hitX, y + 2);
    ctx.lineTo(hitX, y + laneH - 2);
    ctx.stroke();

    // Метка бежит к линии удара
    if (g.running && i === g.lane) {
      const p = clamp01(1 - (g.nextBeatAt - (ts || performance.now())) / TRAIN_BEAT_MS);
      const mx = laneX0 + 16 + (hitX - laneX0 - 16) * p;
      const near = Math.abs(g.nextBeatAt - (ts || performance.now())) <= TRAIN_WINDOW_MS;
      ctx.fillStyle = near ? '#fff3c4' : '#e5b54f';
      ctx.beginPath();
      ctx.arc(mx, y + laneH / 2, near ? 11 : 8, 0, Math.PI * 2);
      ctx.fill();
      if (near) {
        ctx.strokeStyle = 'rgba(255,243,196,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, y + laneH / 2, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Вспышка на попадании
  if (g.flash > 0) {
    g.flash = Math.max(0, g.flash - dt * 4);
    ctx.fillStyle = `rgba(255,240,190,${g.flash * 0.16})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Подписи
  ctx.fillStyle = 'rgba(240,224,184,0.85)';
  ctx.font = 'bold 12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  if (g.running) {
    const prog = g.id ? trainProgress(g.id) : 0;
    ctx.fillText(`серия ${g.combo} • прогресс ${Math.round((prog || 0) * 100)}%`, W * 0.78, H * 0.12);
  } else {
    ctx.fillText('выберите бойца и нажмите «Тренировать»', W * 0.78, H * 0.12);
  }
  ctx.fillText('ритм ударов', W * 0.78, H - 10);
  ctx.textAlign = 'left';
}

function trainGlad(id) {
  const g = STATE.roster.find(x => x.id === id);
  if (!g) return;
  if (isTraining(id)) return addToast(`${g.name} уже тренируется.`);
  if (STATE.gold < TRAINING_COST) return alert('Недостаточно золота!');

  STATE.gold -= TRAINING_COST;
  if (!STATE.training) STATE.training = {};
  STATE.training[id] = { prog: 0, need: trainingNeedMs(g.level) };

  sfx('click');
  updateUI();
  renderTraining();
  startTrainingGame(id);
  addToast(`${g.name} выходит на площадку: ${fmtTime(trainingNeedMs(g.level))} чистого ритма.`);
  if (typeof Save !== 'undefined') Save.autosave();
}

