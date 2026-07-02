/* Happy Chicken! — a tiny egg-laying game for little kids.
   Vanilla JavaScript. No dependencies, no storage, no network calls, no tracking.
   All sounds are synthesized with the Web Audio API; all art is inline SVG. */

'use strict';

// ---------------------------------------------------------------- config

const CONFIG = {
  hatchThreshold: 5,   // eggs laid before the batch hatches (2-10)
  hatchStaggerMs: 260, // delay between each egg in a batch hatching
  eggSettleMs: 450,    // time an egg takes to roll to its resting spot
  chickHopMs: 1300,    // chick celebration hops before walking away
  chickWalkMs: 5200,   // time for a chick to waddle off screen
  layCooldownMs: 90,   // debounce so multi-touch still feels good
};

// Allow ?hatch=N in the URL for a quick override without editing files.
const urlHatch = parseInt(new URLSearchParams(location.search).get('hatch'), 10);
if (urlHatch >= 2 && urlHatch <= 10) CONFIG.hatchThreshold = urlHatch;

// ---------------------------------------------------------------- state

const state = {
  totalEggsLaid: 0,
  eggsInCurrentBatch: 0,
  totalChicksHatched: 0,
  hatchThreshold: CONFIG.hatchThreshold,
  soundEnabled: true,
  paused: false,   // true while the settings overlay is open
  started: false,  // becomes true after the start screen is dismissed
  lastLayAt: 0,
  batchEggs: [],   // egg elements in the current (unhatched) batch
  generation: 0,   // bumped on reset so stale timers do nothing
};

// ---------------------------------------------------------------- dom

const stage = document.getElementById('stage');
const chickenEl = document.getElementById('chicken');
const eggLayer = document.getElementById('egg-layer');
const chickLayer = document.getElementById('chick-layer');
const fxLayer = document.getElementById('fx-layer');
const eggCountEl = document.getElementById('egg-count');
const chickCountEl = document.getElementById('chick-count');
const eggPill = document.getElementById('egg-pill');
const chickPill = document.getElementById('chick-pill');
const soundBtn = document.getElementById('sound-btn');
const fsBtn = document.getElementById('fs-btn');
const gearBtn = document.getElementById('gear-btn');
const startOverlay = document.getElementById('start-overlay');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose = document.getElementById('settings-close');
const resetBtn = document.getElementById('reset-btn');
const resetConfirm = document.getElementById('reset-confirm');
const resetYes = document.getElementById('reset-yes');
const resetNo = document.getElementById('reset-no');
const thresholdBtns = Array.from(document.querySelectorAll('.threshold-btn'));

// ---------------------------------------------------------------- art

const EGG_SVG = `
<svg viewBox="0 0 60 74">
  <path d="M30 4C13 4 4 26 4 44a26 26 0 0 0 52 0C56 26 47 4 30 4Z"
        fill="#FFFDF7" stroke="#E3DCCB" stroke-width="3"/>
  <ellipse cx="21" cy="26" rx="6" ry="9" fill="#FFFFFF"/>
  <path class="crack" d="M16 40 l8 6 -6 7 9 5 -4 8"
        stroke="#C9BFA8" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

const CHICK_SVG = `
<svg viewBox="0 0 90 100">
  <g stroke="#F79D2C" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M36 78 v13 M36 91 l-7 5 M36 91 l7 5"/>
    <path d="M56 78 v13 M56 91 l-7 5 M56 91 l7 5"/>
  </g>
  <path d="M38 20 q3 -10 9 -3 q6 -8 10 2" stroke="#EFC93D" stroke-width="4"
        fill="none" stroke-linecap="round"/>
  <circle cx="46" cy="48" r="32" fill="#FFE45E" stroke="#EFC93D" stroke-width="3"/>
  <ellipse cx="26" cy="55" rx="12" ry="9" fill="#F8D43C"/>
  <path d="M74 44 l14 6 -14 7 z" fill="#F79D2C"/>
  <circle cx="62" cy="40" r="4.5" fill="#33302A"/>
  <circle cx="63.5" cy="38.5" r="1.5" fill="#FFFFFF"/>
</svg>`;

// ---------------------------------------------------------------- audio

const AudioFX = {
  ctx: null,
  noiseBuf: null,

  // Create/resume the context. Must be called from a user gesture on iOS.
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (err) {
      this.ctx = null;
    }
  },

  tone(f0, f1, dur, type, vol, delay) {
    if (!state.soundEnabled || !this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (err) { /* audio is never worth crashing over */ }
  },

  noise(dur, vol, delay) {
    if (!state.soundEnabled || !this.ctx) return;
    try {
      if (!this.noiseBuf) {
        const len = Math.floor(this.ctx.sampleRate * 0.2);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      const t0 = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      src.buffer = this.noiseBuf;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(gain).connect(this.ctx.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    } catch (err) { /* ignore */ }
  },

  lay() {   // a happy little "b-gawk!"
    this.tone(480, 200, 0.08, 'triangle', 0.22, 0);
    this.tone(300, 640, 0.12, 'triangle', 0.18, 0.07);
  },
  crack() { // shell tap
    this.noise(0.07, 0.25, 0);
    this.tone(220, 90, 0.06, 'square', 0.1, 0);
  },
  cheep() { // baby chick chirp
    this.tone(1500, 2100, 0.07, 'sine', 0.2, 0);
    this.tone(1900, 1350, 0.09, 'sine', 0.16, 0.1);
  },
};

// ---------------------------------------------------------------- hud

function updateHud() {
  eggCountEl.textContent = state.totalEggsLaid;
  chickCountEl.textContent = state.totalChicksHatched;
}

function bumpPill(pill) {
  pill.classList.remove('bump');
  void pill.offsetWidth; // restart the animation
  pill.classList.add('bump');
}

// ---------------------------------------------------------------- gameplay

// Point (in stage %) just under the chicken, where eggs appear.
function chickenSpot() {
  const s = stage.getBoundingClientRect();
  const c = chickenEl.getBoundingClientRect();
  return {
    x: ((c.left + c.width * 0.45) - s.left) / s.width * 100,
    y: ((c.top + c.height * 0.9) - s.top) / s.height * 100,
  };
}

// Resting spot on the grass for the i-th egg of a batch.
function slotFor(i) {
  const n = state.hatchThreshold;
  return {
    x: 10 + ((i + 0.5) / n) * 80 + (Math.random() * 4 - 2),
    y: 79 + Math.random() * 9,
  };
}

function layEgg() {
  const now = performance.now();
  if (now - state.lastLayAt < CONFIG.layCooldownMs) return;
  state.lastLayAt = now;

  state.totalEggsLaid += 1;
  const index = state.eggsInCurrentBatch;
  state.eggsInCurrentBatch += 1;

  chickenEl.classList.remove('lay');
  void chickenEl.offsetWidth;
  chickenEl.classList.add('lay');
  setTimeout(() => chickenEl.classList.remove('lay'), 420);

  const egg = document.createElement('div');
  egg.className = 'egg pop';
  egg.innerHTML = EGG_SVG;
  const start = chickenSpot();
  egg.style.left = start.x + '%';
  egg.style.top = start.y + '%';
  eggLayer.appendChild(egg);

  const slot = slotFor(index);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    egg.style.left = slot.x + '%';
    egg.style.top = slot.y + '%';
  }));

  state.batchEggs.push(egg);
  AudioFX.lay();
  updateHud();
  bumpPill(eggPill);

  if (state.eggsInCurrentBatch >= state.hatchThreshold) {
    const eggs = state.batchEggs;
    state.batchEggs = [];
    state.eggsInCurrentBatch = 0; // next taps start a fresh batch right away
    const gen = state.generation;
    setTimeout(() => hatchBatch(eggs, gen), CONFIG.eggSettleMs + 250);
  }
}

function hatchBatch(eggs, gen) {
  eggs.forEach((egg, i) => {
    setTimeout(() => {
      if (gen !== state.generation) return;
      egg.classList.add('wobble');
      setTimeout(() => {
        if (gen !== state.generation) return;
        egg.classList.add('cracking');
        AudioFX.crack();
        setTimeout(() => {
          if (gen !== state.generation) return;
          const x = parseFloat(egg.style.left);
          const y = parseFloat(egg.style.top);
          egg.remove();
          spawnSparks(x, y);
          spawnChick(x, y, gen);
          state.totalChicksHatched += 1;
          AudioFX.cheep();
          updateHud();
          bumpPill(chickPill);
        }, 320);
      }, 620);
    }, i * CONFIG.hatchStaggerMs);
  });
}

function spawnChick(x, y, gen) {
  const chick = document.createElement('div');
  chick.className = 'chick pop hop';
  chick.innerHTML = CHICK_SVG;
  chick.style.left = x + '%';
  chick.style.top = y + '%';
  const exitX = x < 50 ? -12 : 112; // waddle off the nearest edge
  if (exitX < x) chick.classList.add('face-left');
  chickLayer.appendChild(chick);

  setTimeout(() => {
    if (gen !== state.generation) { chick.remove(); return; }
    chick.classList.remove('hop');
    chick.classList.add('walk');
    chick.style.transition = 'left ' + CONFIG.chickWalkMs + 'ms linear';
    requestAnimationFrame(() => { chick.style.left = exitX + '%'; });
    setTimeout(() => chick.remove(), CONFIG.chickWalkMs + 400);
  }, CONFIG.chickHopMs);
}

function spawnSparks(x, y) {
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.style.left = x + '%';
    s.style.top = y + '%';
    const angle = (i / 6) * Math.PI * 2;
    s.style.setProperty('--dx', (Math.cos(angle) * (28 + Math.random() * 20)) + 'px');
    s.style.setProperty('--dy', (Math.sin(angle) * (24 + Math.random() * 16) - 12) + 'px');
    fxLayer.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

function resetGame() {
  state.generation += 1;
  state.totalEggsLaid = 0;
  state.eggsInCurrentBatch = 0;
  state.totalChicksHatched = 0;
  state.batchEggs = [];
  eggLayer.textContent = '';
  chickLayer.textContent = '';
  fxLayer.textContent = '';
  updateHud();
}

// ---------------------------------------------------------------- input

function handlePress() {
  AudioFX.unlock();
  if (!state.started) { startGame(); return; }
  if (state.paused) return;
  layEgg();
}

function onStagePress(event) {
  if (event.target.closest && event.target.closest('.ui')) return;
  handlePress();
}

if (window.PointerEvent) {
  stage.addEventListener('pointerdown', onStagePress);
} else {
  stage.addEventListener('touchstart', (e) => { e.preventDefault(); onStagePress(e); }, { passive: false });
  stage.addEventListener('mousedown', onStagePress);
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.key !== ' ') return;
  // Let a focused button behave like a button.
  if (e.target && e.target.closest && e.target.closest('button')) return;
  e.preventDefault(); // stop the page from scrolling
  if (e.repeat) return;
  handlePress();
});

// ---------------------------------------------------------------- start screen

function startGame() {
  if (state.started) return;
  state.started = true;
  startOverlay.classList.add('hide');
  setTimeout(() => { startOverlay.hidden = true; }, 400);
}

if (window.PointerEvent) {
  startOverlay.addEventListener('pointerdown', handlePress);
} else {
  startOverlay.addEventListener('touchstart', (e) => { e.preventDefault(); handlePress(); }, { passive: false });
  startOverlay.addEventListener('mousedown', handlePress);
}

// ---------------------------------------------------------------- sound toggle

soundBtn.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  soundBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
  soundBtn.setAttribute('aria-pressed', String(state.soundEnabled));
  if (state.soundEnabled) {
    AudioFX.unlock();
    AudioFX.cheep(); // tiny confirmation
  }
});

// ---------------------------------------------------------------- fullscreen

const fsRoot = document.documentElement;
if (!fsRoot.requestFullscreen && !fsRoot.webkitRequestFullscreen) {
  fsBtn.hidden = true; // e.g. iPhone Safari has no fullscreen API
}

fsBtn.addEventListener('click', () => {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const request = fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
      Promise.resolve(request.call(fsRoot)).catch(() => {});
    }
  } catch (err) { /* fullscreen denied — no big deal */ }
});

// ---------------------------------------------------------------- settings

function openSettings() {
  state.paused = true;
  settingsOverlay.hidden = false;
  hideResetConfirm();
}

function closeSettings() {
  settingsOverlay.hidden = true;
  state.paused = false;
  hideResetConfirm();
}

function hideResetConfirm() {
  resetConfirm.hidden = true;
  resetBtn.hidden = false;
}

gearBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('pointerdown', (e) => {
  if (e.target === settingsOverlay) closeSettings(); // tap outside card closes
});

thresholdBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.hatchThreshold = parseInt(btn.dataset.n, 10);
    thresholdBtns.forEach((b) => b.classList.toggle('active', b === btn));
  });
});

resetBtn.addEventListener('click', () => {
  resetBtn.hidden = true;
  resetConfirm.hidden = false;
});
resetNo.addEventListener('click', hideResetConfirm);
resetYes.addEventListener('click', () => {
  resetGame();
  closeSettings();
});

// ---------------------------------------------------------------- idle life

function scheduleBlink() {
  setTimeout(() => {
    chickenEl.classList.add('blink');
    setTimeout(() => chickenEl.classList.remove('blink'), 180);
    scheduleBlink();
  }, 1800 + Math.random() * 3200);
}

function scheduleFlap() {
  setTimeout(() => {
    if (!state.paused) {
      chickenEl.classList.add('flap');
      setTimeout(() => chickenEl.classList.remove('flap'), 750);
    }
    scheduleFlap();
  }, 7000 + Math.random() * 8000);
}

// ---------------------------------------------------------------- go!

thresholdBtns.forEach((b) => {
  b.classList.toggle('active', parseInt(b.dataset.n, 10) === state.hatchThreshold);
});
updateHud();
scheduleBlink();
scheduleFlap();
