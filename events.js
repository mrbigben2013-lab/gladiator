// ==================== СЛУЧАЙНЫЕ СОБЫТИЯ ====================
// Событие может случиться после боя. Иногда это подарок, иногда удар в спину.
// Игрок видит карточку, читает текст и (если это выбор) решает.
//
// Всё построено на «эффектах» — маленьких операциях над STATE.
// Так проще добавлять новые события в data.js, не трогая логику.

const EVENTS_RUNTIME = {
  pending: null,      // событие, ждущее показа
  queue: [],
  lastId: null,
  lastAt: 0,
  seen: {},           // сколько раз видели событие — чтобы не повторялось подряд
  history: []         // последние 12 событий для журнала
};

// Шанс, что после боя случится что-то ещё. Не каждый бой — чтобы не надоедало.
const EVENT_CHANCE = 0.42;
const EVENT_COOLDOWN_BATTLES = 1;

function eventsAllFighters() {
  return (STATE.roster || []).filter(g => g && g.hp > 0)
    .concat((STATE.dogs || []).filter(d => d && d.hp > 0));
}

function eventPickWeighted(pool) {
  const total = pool.reduce((s, e) => s + (e.weight || 5), 0);
  let r = Math.random() * total;
  for (const e of pool) {
    r -= (e.weight || 5);
    if (r <= 0) return e;
  }
  return pool[pool.length - 1];
}

// Кандидаты фильтруются по состоянию игры: не предлагаем то, что бессмысленно.
function eventCandidates() {
  const alive = eventsAllFighters();
  const gold = STATE.gold || 0;
  const wounded = (STATE.roster || []).some(g => g.hp < g.maxHp);
  const hasMagic = (STATE.roster || []).some(g => g.magic);

  return EVENTS.filter(e => {
    if (e.id === 'healer_gift' || e.id === 'healer_offer') return wounded;
    if (e.id === 'betrayal') return alive.length > 1;
    if (e.id === 'dog_found') return (STATE.dogs || []).length < 3;
    if (e.id === 'blacksmith') return (STATE.inventory || []).length < 40;
    if (e.id === 'magic_awakening') return !hasMagic;
    if (e.id === 'mercenary') return gold >= 120;
    if (e.id === 'healer_offer') return gold >= 90 && wounded;
    if (e.id === 'injury') return alive.length > 0;
    if (e.id === 'fever') return alive.length > 0;
    return true;
  });
}

// Может ли событие случиться сейчас
function eventsCanTrigger() {
  if (STATE.gameOver) return false;
  if (STATE.battleCount == null) STATE.battleCount = 0;
  const since = STATE.battleCount - (STATE.lastEventBattle || -99);
  return since > EVENT_COOLDOWN_BATTLES;
}

function rollEvent(forceId) {
  if (forceId) {
    const e = EVENTS.find(x => x.id === forceId);
    return e ? JSON.parse(JSON.stringify(e)) : null;
  }
  if (!eventsCanTrigger()) return null;
  if (Math.random() > EVENT_CHANCE) return null;

  let pool = eventCandidates();
  // Не повторяем то же самое дважды подряд
  const filtered = pool.filter(e => e.id !== EVENTS_RUNTIME.lastId);
  if (filtered.length) pool = filtered;
  if (!pool.length) return null;

  return JSON.parse(JSON.stringify(eventPickWeighted(pool)));
}

// ==================== ПРИМЕНЕНИЕ ЭФФЕКТОВ ====================
// Возвращает массив строк — что именно произошло, для журнала.
function applyEventEffects(effects, ctx) {
  const log = [];
  const roster = (STATE.roster || []).filter(g => g.hp > 0);
  const dogs = (STATE.dogs || []).filter(d => d.hp > 0);
  const all = roster.concat(dogs);

  (effects || []).forEach(fx => {
    // --- Золото ---
    if (fx.gold) {
      const before = STATE.gold;
      STATE.gold = Math.max(0, STATE.gold + fx.gold);
      const diff = STATE.gold - before;
      log.push(`${diff >= 0 ? '+' : ''}${diff} золота`);
    }
    if (fx.goldPct) {
      const before = STATE.gold;
      STATE.gold = Math.max(0, Math.round(STATE.gold * (1 + fx.goldPct)));
      log.push(`${STATE.gold - before} золота`);
    }

    // --- Слава ---
    if (fx.fame) {
      STATE.fame = Math.max(0, (STATE.fame || 0) + fx.fame);
      log.push(`${fx.fame >= 0 ? '+' : ''}${fx.fame} славы`);
    }

    // --- Лечение ---
    if (fx.healAll) {
      let healed = 0;
      all.forEach(g => {
        const before = g.hp;
        g.hp = Math.min(g.maxHp, g.hp + Math.round(g.maxHp * fx.healAll));
        healed += g.hp - before;
      });
      if (healed > 0) log.push(`вылечено ${healed} HP`);
    }
    if (fx.hpPct) {
      let hurt = 0;
      all.forEach(g => {
        const before = g.hp;
        g.hp = Math.max(1, Math.round(g.hp * (1 + fx.hpPct)));
        hurt += before - g.hp;
      });
      if (hurt > 0) log.push(`потеряно ${hurt} HP`);
    }

    // --- Опыт ---
    if (fx.xpAll) {
      all.forEach(g => {
        g.xp = (g.xp || 0) + fx.xpAll;
        if (typeof applyLevelUps === 'function') applyLevelUps(g);
      });
      log.push(`+${fx.xpAll} опыта каждому`);
    }

    // --- Повреждение конечности ---
    if (fx.limbDamage && all.length) {
      const victim = all[Math.floor(Math.random() * all.length)];
      const limbs = LIMB_DEFS.filter(l => {
        const s = victim.limbs && victim.limbs[l.id];
        return s && !s.lost;
      });
      if (limbs.length) {
        const limb = limbs[Math.floor(Math.random() * limbs.length)];
        const s = victim.limbs[limb.id];
        s.hp = Math.max(1, Math.round(s.hp - s.max * fx.limbDamage));
        log.push(`${victim.name}: ${limb.name.toLowerCase()} повреждена`);
      }
    }

    // --- Потеря бойца ---
    // Гладиаторы больше не уходят из отряда по событиям: отряд — это
    // собственность игрока, распоряжаться ей может только он сам.
    // Событие, которое раньше забирало бойца, теперь просто пугает:
    // боец получает травму, но остаётся в лудусе.
    if (fx.loseWeakest && roster.length) {
      const weakest = roster.slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      if (weakest) {
        const dmg = Math.max(1, Math.round(weakest.maxHp * 0.35));
        weakest.hp = Math.max(1, weakest.hp - dmg);
        log.push(`${weakest.name} сильно пострадал, но остался в отряде`);
      }
    }

    // --- Бесплатный пёс ---
    if (fx.freeDog) {
      if (typeof refreshKennel === 'function' && !(STATE.kennelStock || []).length) refreshKennel();
      const breed = typeof DOG_BREEDS !== 'undefined'
        ? DOG_BREEDS[Math.floor(Math.random() * DOG_BREEDS.length)] : null;
      if (breed && (STATE.dogs || []).length < 3 && typeof makeDog === 'function') {
        const dog = makeDog(breed);
        STATE.dogs.push(dog);
        if (STATE.squad.length < 3) STATE.squad.push(dog.id);
        log.push(`🐕 ${dog.name} (${breed.name}) присоединяется`);
      }
    }

    // --- Бесплатный предмет ---
    if (fx.freeItem) {
      const pool = ITEMS_DB.filter(i => i.tier >= 3 && !i.bossItem);
      if (pool.length) {
        const it = pool[Math.floor(Math.random() * pool.length)];
        STATE.inventory.push({ ...it, uid: 'ev_' + Math.random().toString(36).substr(2, 9) });
        log.push(`получен предмет: ${it.name}`);
      }
    }

    // --- Пробуждение магии ---
    if (fx.awakenMagic) {
      const target = (STATE.roster || []).find(g => !g.magic && g.hp > 0) || STATE.roster[0];
      if (target) {
        const school = MAGIC_LIST[Math.floor(Math.random() * MAGIC_LIST.length)];
        target.magic = school.id;
        target.aiRole = 'mage';
        log.push(`✨ ${target.name} открывает школу «${school.name}»`);
      }
    }
  });

  return log;
}

// ==================== ПОКАЗ ====================
function eventColor(type) {
  if (type === 'good') return '#7fd18f';
  if (type === 'bad') return '#ff8a7a';
  return '#e5b54f';
}

function eventTypeLabel(type) {
  if (type === 'good') return 'Добрая весть';
  if (type === 'bad') return 'Дурная весть';
  return 'Выбор';
}

// Вызывается после боя. Возвращает true, если событие показано
// (тогда результат боя уже не надо показывать сразу).
function triggerPostBattleEvent() {
  const ev = rollEvent();
  if (!ev) return false;
  EVENTS_RUNTIME.pending = ev;
  return true;
}

function showEventModal(ev) {
  const modal = document.getElementById('event-modal');
  const body = document.getElementById('event-body');
  if (!modal || !body) return false;

  const color = eventColor(ev.type);
  const hasChoices = ev.type === 'choice' && Array.isArray(ev.choices);

  body.innerHTML = `
    <div class="ev-head" style="border-color:${color}">
      <span class="ev-icon">${ev.icon || '📜'}</span>
      <div class="ev-titles">
        <span class="ev-type" style="color:${color}">${eventTypeLabel(ev.type)}</span>
        <h2>${ev.title}</h2>
      </div>
    </div>
    <p class="ev-text">${ev.text}</p>
    <div class="ev-actions">
      ${hasChoices
        ? ev.choices.map((c, i) => {
            const affordable = !c.cost || (STATE.gold || 0) >= c.cost;
            return `<button class="ev-choice" ${affordable ? '' : 'disabled'} onclick="resolveEventChoice(${i})">
              <span class="evc-label">${c.label}</span>
              ${c.cost ? `<span class="evc-cost">💰 ${c.cost}</span>` : ''}
            </button>`;
          }).join('')
        : `<button class="ev-choice primary" onclick="resolveEventChoice(-1)">Принять</button>`
      }
    </div>
  `;
  modal.style.display = 'flex';
  sfx(ev.type === 'bad' ? 'error' : 'levelup');
  return true;
}

function resolveEventChoice(idx) {
  const ev = EVENTS_RUNTIME.pending;
  if (!ev) return;
  const modal = document.getElementById('event-modal');
  if (modal) modal.style.display = 'none';

  let effects = ev.effects || [];
  let resultText = '';

  if (idx >= 0 && Array.isArray(ev.choices)) {
    const choice = ev.choices[idx];
    if (!choice) return;
    if (choice.cost && (STATE.gold || 0) < choice.cost) {
      addToast('Не хватает золота');
      return;
    }
    if (choice.cost) STATE.gold -= choice.cost;
    effects = choice.effects || [];
    resultText = choice.result || '';
  }

  const log = applyEventEffects(effects);

  // История
  EVENTS_RUNTIME.lastId = ev.id;
  EVENTS_RUNTIME.lastAt = Date.now();
  STATE.battleCount = STATE.battleCount || 0;
  STATE.lastEventBattle = STATE.battleCount;
  EVENTS_RUNTIME.seen[ev.id] = (EVENTS_RUNTIME.seen[ev.id] || 0) + 1;
  EVENTS_RUNTIME.history.unshift({
    id: ev.id, title: ev.title, icon: ev.icon, type: ev.type,
    log: log.slice(), result: resultText, at: Date.now()
  });
  if (EVENTS_RUNTIME.history.length > 12) EVENTS_RUNTIME.history.pop();
  EVENTS_RUNTIME.pending = null;

  // Показываем последствия
  const parts = [];
  if (resultText) parts.push(resultText);
  if (log.length) parts.push(log.join(' • '));
  if (parts.length) addToast(parts.join(' — '));

  if (typeof updateUI === 'function') updateUI();
  if (typeof Save !== 'undefined') Save.autosave();
  if (typeof checkGameOver === 'function') checkGameOver();
  if (typeof refreshCurrentScreen === 'function') refreshCurrentScreen();
}

// Журнал событий — для экрана города
function renderEventHistory(rootId) {
  const el = document.getElementById(rootId);
  if (!el) return;
  const hist = EVENTS_RUNTIME.history;
  if (!hist.length) {
    el.innerHTML = '<div class="empty-hint">Пока тихо. Рим ждёт.</div>';
    return;
  }
  el.innerHTML = hist.map(h => `
    <div class="evh-row ${h.type}">
      <span class="evh-icon">${h.icon || '📜'}</span>
      <div class="evh-body">
        <span class="evh-title">${h.title}</span>
        <span class="evh-log">${h.result || h.log.join(' • ') || '—'}</span>
      </div>
    </div>
  `).join('');
}
