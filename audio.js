// ==================== ЗВУК ====================
// Всё синтезируется через Web Audio API — внешних файлов нет.
const SFX = (() => {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let musicTimer = null;
  let musicStep = 0;
  let unlocked = false;

  const state = {
    sfx: true,
    music: true,
    volume: 0.55
  };

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = state.volume;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!unlocked) {
      unlocked = true;
      if (state.music) fadeMusic(0.055, 3);
    }
  }

  function fadeMusic(to, sec) {
    if (!musicBus) return;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now);
    musicBus.gain.linearRampToValueAtTime(to, now + sec);
  }

  // ---------- примитивы ----------
  function tone(opt) {
    const c = ensure();
    if (!c || !state.sfx) return;
    const {
      freq = 440, to = null, type = 'sine', dur = 0.2, gain = 0.08,
      attack = 0.005, bus = null, detune = 0, delay = 0
    } = opt;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  let noiseBuf = null;
  function noiseBuffer(c) {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(c.sampleRate * 1.2);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function noise(opt) {
    const c = ensure();
    if (!c || !state.sfx) return;
    const {
      dur = 0.2, gain = 0.12, type = 'bandpass', freq = 900, q = 1,
      to = null, attack = 0.004, delay = 0
    } = opt;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(freq, t0);
    if (to) flt.frequency.exponentialRampToValueAtTime(Math.max(60, to), t0 + dur);
    flt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---------- библиотека звуков ----------
  const bank = {
    click() {
      tone({ freq: 720, to: 560, type: 'triangle', dur: 0.06, gain: 0.035 });
    },
    open() {
      tone({ freq: 320, to: 520, type: 'sine', dur: 0.14, gain: 0.05 });
    },
    close() {
      tone({ freq: 460, to: 300, type: 'sine', dur: 0.12, gain: 0.04 });
    },
    hover() {
      tone({ freq: 900, type: 'sine', dur: 0.03, gain: 0.012 });
    },
    step() {
      noise({ dur: 0.1, gain: 0.05, type: 'lowpass', freq: 420, to: 180, q: 0.8 });
    },
    move() {
      noise({ dur: 0.16, gain: 0.055, type: 'bandpass', freq: 620, to: 340, q: 1.1 });
    },
    swing() {
      noise({ dur: 0.16, gain: 0.06, type: 'highpass', freq: 700, to: 2200, q: 0.7 });
    },
    hit() {
      noise({ dur: 0.13, gain: 0.14, type: 'lowpass', freq: 1500, to: 260, q: 1 });
      tone({ freq: 150, to: 58, type: 'sine', dur: 0.18, gain: 0.13 });
      noise({ dur: 0.07, gain: 0.07, type: 'bandpass', freq: 2400, q: 2 });
    },
    crit() {
      noise({ dur: 0.2, gain: 0.17, type: 'lowpass', freq: 2200, to: 200, q: 1.2 });
      tone({ freq: 190, to: 50, type: 'sawtooth', dur: 0.28, gain: 0.12 });
      tone({ freq: 1180, to: 420, type: 'triangle', dur: 0.12, gain: 0.05 });
    },
    limb() {
      noise({ dur: 0.26, gain: 0.2, type: 'bandpass', freq: 1900, to: 320, q: 0.9 });
      tone({ freq: 240, to: 44, type: 'square', dur: 0.3, gain: 0.1 });
      tone({ freq: 640, to: 120, type: 'sawtooth', dur: 0.22, gain: 0.06, delay: 0.03 });
    },
    block() {
      tone({ freq: 1320, type: 'triangle', dur: 0.1, gain: 0.09 });
      tone({ freq: 1970, type: 'triangle', dur: 0.13, gain: 0.055, delay: 0.005 });
      noise({ dur: 0.09, gain: 0.08, type: 'highpass', freq: 2600, q: 2 });
    },
    miss() {
      noise({ dur: 0.2, gain: 0.055, type: 'highpass', freq: 900, to: 3400, q: 0.6 });
    },
    bow() {
      tone({ freq: 1500, to: 520, type: 'sine', dur: 0.14, gain: 0.05 });
      noise({ dur: 0.1, gain: 0.04, type: 'bandpass', freq: 1800, q: 2 });
    },
    death() {
      tone({ freq: 220, to: 46, type: 'sawtooth', dur: 0.85, gain: 0.11 });
      noise({ dur: 0.5, gain: 0.08, type: 'lowpass', freq: 700, to: 120, q: 0.8, delay: 0.05 });
    },
    victory() {
      [0, 4, 7, 12].forEach((s, i) => {
        tone({ freq: 262 * Math.pow(2, s / 12), type: 'triangle', dur: 0.55, gain: 0.07, delay: i * 0.13 });
      });
      tone({ freq: 196, type: 'sine', dur: 1.2, gain: 0.05, delay: 0.1 });
    },
    defeat() {
      [12, 7, 3, 0].forEach((s, i) => {
        tone({ freq: 196 * Math.pow(2, s / 12), type: 'triangle', dur: 0.7, gain: 0.06, delay: i * 0.17 });
      });
    },
    coin() {
      tone({ freq: 1760, type: 'triangle', dur: 0.09, gain: 0.055 });
      tone({ freq: 2340, type: 'triangle', dur: 0.12, gain: 0.04, delay: 0.05 });
    },
    heal() {
      [0, 5, 9].forEach((s, i) => {
        tone({ freq: 392 * Math.pow(2, s / 12), type: 'sine', dur: 0.5, gain: 0.045, delay: i * 0.1 });
      });
    },
    levelup() {
      [0, 4, 7, 11, 12].forEach((s, i) => {
        tone({ freq: 330 * Math.pow(2, s / 12), type: 'triangle', dur: 0.4, gain: 0.055, delay: i * 0.09 });
      });
    },
    round() {
      tone({ freq: 110, type: 'sine', dur: 1.4, gain: 0.075 });
      tone({ freq: 220, type: 'sine', dur: 1.1, gain: 0.035 });
      tone({ freq: 165, type: 'triangle', dur: 0.9, gain: 0.03, delay: 0.02 });
      noise({ dur: 0.4, gain: 0.035, type: 'lowpass', freq: 1200, to: 300, q: 0.7 });
    },
    error() {
      tone({ freq: 180, to: 130, type: 'square', dur: 0.16, gain: 0.05 });
    },
    // ---------- тренировка: ритм ----------
    beat() {
      noise({ dur: 0.07, gain: 0.06, type: 'lowpass', freq: 420, to: 180, q: 0.9 });
    },
    beatStrong() {
      noise({ dur: 0.1, gain: 0.1, type: 'lowpass', freq: 520, to: 160, q: 1 });
      tone({ freq: 96, to: 62, type: 'sine', dur: 0.18, gain: 0.09 });
    },
    rhythmHit() {
      tone({ freq: 880, to: 1180, type: 'triangle', dur: 0.09, gain: 0.05 });
      noise({ dur: 0.08, gain: 0.09, type: 'bandpass', freq: 1800, q: 1.6 });
    },
    rhythmMiss() {
      tone({ freq: 220, to: 140, type: 'square', dur: 0.14, gain: 0.045 });
      noise({ dur: 0.12, gain: 0.05, type: 'lowpass', freq: 700, to: 260, q: 0.8 });
    },
    melody1() { tone({ freq: 523.25, type: 'sine', dur: 0.22, gain: 0.026 }); },
    melody2() { tone({ freq: 587.33, type: 'sine', dur: 0.22, gain: 0.026 }); },
    melody3() { tone({ freq: 659.25, type: 'sine', dur: 0.22, gain: 0.026 }); },
    melody4() { tone({ freq: 783.99, type: 'sine', dur: 0.22, gain: 0.026 }); }
  };

  function play(name) {
    if (!state.sfx) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    const fn = bank[name];
    if (fn) fn();
  }

  // ---------- фоновая музыка ----------
  // Дорийский лад, медленные аккорды, тихая лира сверху.
  const CHORDS = [
    [146.83, 174.61, 220.00],   // Dm
    [116.54, 146.83, 174.61],   // Bb
    [174.61, 220.00, 261.63],   // F
    [130.81, 164.81, 196.00]    // C
  ];
  const PENTA = [587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66];

  function padNote(freq, dur, gain) {
    const c = ctx;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const osc2 = c.createOscillator();
    const g = c.createGain();
    const flt = c.createBiquadFilter();
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 2.002;
    osc2.detune.value = 4;
    flt.type = 'lowpass';
    flt.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(flt);
    osc2.connect(flt);
    flt.connect(g);
    g.connect(musicBus);
    osc.start(t0);
    osc2.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc2.stop(t0 + dur + 0.05);
  }

  function musicTick() {
    if (!ctx || !state.music) return;
    const chord = CHORDS[musicStep % CHORDS.length];
    const dur = 5.2;
    chord.forEach((f, i) => padNote(f / (i === 0 ? 2 : 1), dur, i === 0 ? 0.05 : 0.028));
    // редкая нота лиры
    if (Math.random() < 0.72) {
      const n = PENTA[Math.floor(Math.random() * PENTA.length)];
      const c = ctx;
      const t0 = c.currentTime + 0.8 + Math.random() * 2.6;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = n;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.022, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
      osc.connect(g);
      g.connect(musicBus);
      osc.start(t0);
      osc.stop(t0 + 2.5);
    }
    musicStep++;
  }

  function startMusic() {
    if (!state.music) return;
    ensure();
    if (musicTimer) return;
    musicTick();
    musicTimer = setInterval(musicTick, 5200);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (musicBus) fadeMusic(0.0001, 0.8);
  }

  function toggleSfx() {
    state.sfx = !state.sfx;
    if (sfxBus) sfxBus.gain.value = state.sfx ? 0.9 : 0;
    if (state.sfx) play('click');
    return state.sfx;
  }

  function toggleMusic() {
    state.music = !state.music;
    if (state.music) { startMusic(); fadeMusic(0.055, 2); }
    else stopMusic();
    return state.music;
  }

  // Разблокировка по первому действию пользователя
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
    window.addEventListener(ev, () => {
      unlock();
      if (state.music) startMusic();
    }, { once: true, passive: true });
  });

  // Универсальный клик по кнопкам интерфейса
  document.addEventListener('click', e => {
    const t = e.target.closest('button, .loc-card, .recruit-card, .item-card, .glad-row');
    if (!t || t.disabled) return;
    play('click');
  }, true);

  return { play, startMusic, stopMusic, toggleSfx, toggleMusic, unlock, state };
})();

// Короткий хелпер: безопасный вызов
function sfx(name) { try { SFX.play(name); } catch (e) {} }

// Кнопки в шапке
function toggleSfx() {
  const on = SFX.toggleSfx();
  const btn = document.getElementById('btn-sfx');
  if (btn) { btn.textContent = on ? '🔊' : '🔇'; btn.classList.toggle('off', !on); }
  addToastSafe(on ? 'Звуки включены' : 'Звуки выключены');
}

function toggleMusic() {
  const on = SFX.toggleMusic();
  const btn = document.getElementById('btn-music');
  if (btn) { btn.textContent = on ? '🎵' : '🎶'; btn.classList.toggle('off', !on); }
  addToastSafe(on ? 'Музыка включена' : 'Музыка выключена');
}

function addToastSafe(msg) {
  try { if (typeof addToast === 'function') addToast(msg); } catch (e) {}
}
