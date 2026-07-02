/* Happy Chicken! — a tiny egg-laying game for little kids.
   Vanilla JavaScript. No dependencies, no storage, no network calls, no tracking.
   All sounds are synthesized with the Web Audio API; all art is inline SVG.

   The feel: a flat blue screen. Each press, the chicken lays an egg where she
   is and hops to a new random spot, so eggs scatter across the whole screen.
   Every N eggs, the batch hatches into chicks sitting in their cracked shells. */

'use strict';

// ---------------------------------------------------------------- config

const CONFIG = {
  hatchThreshold: 5,    // eggs laid before the batch hatches (2-10)
  hatchStaggerMs: 260,  // delay between each egg in a batch hatching
  hatchlingStayMs: 2600,// how long a hatched chick sits in its shell
  layCooldownMs: 90,    // debounce so multi-touch still feels good
  hopArea: { minX: 14, maxX: 86, minY: 24, maxY: 72 }, // % of screen the chicken roams
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
  chickenX: 68,    // chicken position in stage %
  chickenY: 34,
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

const OUTLINE = '#3A3126';

const EGG_SVG = `
<svg viewBox="0 0 60 74">
  <path d="M30 4C13 4 4 26 4 44a26 26 0 0 0 52 0C56 26 47 4 30 4Z"
        fill="#F7F2BC" stroke="${OUTLINE}" stroke-width="5"/>
  <path class="crack" d="M16 40 l8 6 -6 7 9 5 -4 8"
        stroke="${OUTLINE}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

// a chick sitting inside the cracked bottom half of its egg
const HATCHLING_SVG = `
<svg viewBox="0 0 120 132">
  <path d="M48 32 C46 18 60 14 63 26 C68 15 80 20 76 32 C67 27 56 27 48 32 Z"
        fill="#DE3244" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="60" cy="58" r="31" fill="#FFE23F" stroke="${OUTLINE}" stroke-width="5.5"/>
  <path d="M33 54 L15 61 L34 68 Z" fill="#FFC93C" stroke="${OUTLINE}" stroke-width="4.5" stroke-linejoin="round"/>
  <circle cx="45" cy="52" r="4.5" fill="${OUTLINE}"/>
  <path d="M24 80 L36 68 L48 80 L60 68 L72 80 L84 68 L96 80 A36 34 0 0 1 24 80 Z"
        fill="#F7F2BC" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
</svg>`;

// the empty top of the shell, flung off as the egg opens
const SHELL_TOP_SVG = `
<svg viewBox="0 0 70 62">
  <path d="M10 42 L20 28 L30 42 L40 28 L50 42 A20 18 0 0 1 10 42 Z"
        fill="#F7F2BC" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
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
  eggCountEl.textContent = String(state.totalEggsLaid).padStart(3, '0');
  chickCountEl.textContent = String(state.totalChicksHatched).padStart(3, '0');
}

function bumpPill(pill) {
  pill.classList.remove('bump');
  void pill.offsetWidth; // restart the animation
  pill.classList.add('bump');
}

// ---------------------------------------------------------------- gameplay

// Hop the chicken to a new random spot (both axes — she roams the whole screen).
function hopChicken() {
  const a = CONFIG.hopArea;
  // Keep each hop a decent jump so it always reads as movement.
  let x, y, tries = 0;
  do {
    x = a.minX + Math.random() * (a.maxX - a.minX);
    y = a.minY + Math.random() * (a.maxY - a.minY);
    tries += 1;
  } while (tries < 8 && Math.hypot(x - state.chickenX, y - state.chickenY) < 18);
  state.chickenX = x;
  state.chickenY = y;
  chickenEl.style.left = x + '%';
  chickenEl.style.top = y + '%';
}

function layEgg() {
  const now = performance.now();
  if (now - state.lastLayAt < CONFIG.layCooldownMs) return;
  state.lastLayAt = now;

  state.totalEggsLaid += 1;
  state.eggsInCurrentBatch += 1;

  chickenEl.classList.remove('lay');
  void chickenEl.offsetWidth;
  chickenEl.classList.add('lay');
  setTimeout(() => chickenEl.classList.remove('lay'), 460);

  // The egg appears just under where the chicken is right now...
  const egg = document.createElement('div');
  egg.className = 'egg pop';
  egg.innerHTML = EGG_SVG;
  egg.style.left = state.chickenX + '%';
  egg.style.top = Math.min(state.chickenY + 9, 92) + '%';
  egg.style.transform = 'translate(-50%, -50%) rotate(' + (Math.random() * 20 - 10).toFixed(1) + 'deg)';
  eggLayer.appendChild(egg);

  // ...and she hops away to a fresh spot, leaving eggs scattered behind.
  hopChicken();

  state.batchEggs.push(egg);
  AudioFX.lay();
  updateHud();
  bumpPill(eggPill);

  if (state.eggsInCurrentBatch >= state.hatchThreshold) {
    const eggs = state.batchEggs;
    state.batchEggs = [];
    state.eggsInCurrentBatch = 0; // next taps start a fresh batch right away
    const gen = state.generation;
    setTimeout(() => hatchBatch(eggs, gen), 600);
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
          spawnShellTop(x, y);
          spawnHatchling(x, y, gen);
          state.totalChicksHatched += 1;
          AudioFX.cheep();
          updateHud();
          bumpPill(chickPill);
        }, 320);
      }, 620);
    }, i * CONFIG.hatchStaggerMs);
  });
}

// A chick pops up sitting in its cracked shell, bounces, then fades away.
function spawnHatchling(x, y, gen) {
  const chick = document.createElement('div');
  chick.className = 'hatchling pop bounce';
  chick.innerHTML = HATCHLING_SVG;
  chick.style.left = x + '%';
  chick.style.top = y + '%';
  chickLayer.appendChild(chick);

  setTimeout(() => {
    if (gen !== state.generation) { chick.remove(); return; }
    chick.classList.add('fade');
    setTimeout(() => chick.remove(), 550);
  }, CONFIG.hatchlingStayMs);
}

function spawnShellTop(x, y) {
  const shell = document.createElement('div');
  shell.className = 'shell-top';
  shell.innerHTML = SHELL_TOP_SVG;
  shell.style.left = x + '%';
  shell.style.top = y + '%';
  const dir = Math.random() < 0.5 ? -1 : 1;
  shell.style.setProperty('--dx', (dir * (34 + Math.random() * 26)) + 'px');
  shell.style.setProperty('--dy', (-40 - Math.random() * 24) + 'px');
  fxLayer.appendChild(shell);
  setTimeout(() => shell.remove(), 750);
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

// The screen stays alive: every so often the chicken takes a little hop
// on her own (no egg — eggs only come from presses).
function scheduleIdleHop() {
  setTimeout(() => {
    if (state.started && !state.paused) hopChicken();
    scheduleIdleHop();
  }, 9000 + Math.random() * 9000);
}

// ---------------------------------------------------------------- go!

thresholdBtns.forEach((b) => {
  b.classList.toggle('active', parseInt(b.dataset.n, 10) === state.hatchThreshold);
});
updateHud();
scheduleBlink();
scheduleFlap();
scheduleIdleHop();
