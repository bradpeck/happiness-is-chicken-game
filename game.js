/* Happy Chicken! — a tiny egg-laying game for little kids.
   Vanilla JavaScript. No dependencies, no storage, no network calls, no tracking.
   All sounds are synthesized with the Web Audio API; all art is inline SVG.

   The feel: a flat blue screen. Each press, the chicken lays an egg where she
   is and hops to a new random spot, so eggs scatter across the whole screen.
   Every N eggs, the batch hatches: each chick leaps out of its shell, does
   tiny peep-jumps across the screen flapping its wings, and hops off stage.

   Milestones: the 10th, 50th, 100th, 250th, 500th and 1000th egg is golden
   and hatches a neon-colored chick, announced with a banner and collected
   as a badge on the left side of the screen. */

'use strict';

// ---------------------------------------------------------------- config

const CONFIG = {
  hatchThreshold: 5,    // eggs laid before the batch hatches (2-10)
  hatchStaggerMs: 260,  // delay between each egg in a batch hatching
  sitInShellMs: 950,    // how long a hatched chick sits in its shell
  journeyMsPerPct: 55,  // peep-jump speed: ms per % of screen crossed
  layCooldownMs: 90,    // debounce so multi-touch still feels good
  hopArea: { minX: 14, maxX: 86, minY: 24, maxY: 72 }, // % of screen the chicken roams
};

// Milestone tiers: hatch this many chicks, get a golden egg whose chick
// is a neon color. Every egg hatches in the order it was laid, so the
// Nth egg laid is always the Nth chick hatched.
const TIERS = [
  { n: 10,   color: '#3BFF3B' }, // neon green
  { n: 25,   color: '#FFB700' }, // sunny yellow
  { n: 50,   color: '#FF4FD8' }, // neon pink
  { n: 75,   color: '#00D7FF' }, // bright cyan
  { n: 100,  color: '#FFA51E' }, // neon orange
  { n: 150,  color: '#FF6B6B' }, // coral red
  { n: 250,  color: '#B44BFF' }, // neon purple
  { n: 500,  color: '#25F0DC' }, // neon aqua
  { n: 1000, color: '#2E5BFF' }, // electric blue
];

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
  earnedTiers: new Set(),
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
const collectionEl = document.getElementById('collection');
const tierBanner = document.getElementById('tier-banner');
const tierBannerNum = document.getElementById('tier-banner-num');

// ---------------------------------------------------------------- art

const OUTLINE = '#3A3126';
const EGG_CREAM = '#F7F2BC';
const EGG_GOLD = '#FFD84A';

function eggSVG(golden) {
  const fill = golden ? EGG_GOLD : EGG_CREAM;
  const stars = golden ? `
  <path class="twinkle" d="M20 24 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 z" fill="#FFFBE0"/>
  <path class="twinkle t2" d="M38 42 l2.5 5 5 2.5 -5 2.5 -2.5 5 -2.5 -5 -5 -2.5 5 -2.5 z" fill="#FFFBE0"/>` : '';
  return `
<svg viewBox="0 0 60 74">
  <path d="M30 4C13 4 4 26 4 44a26 26 0 0 0 52 0C56 26 47 4 30 4Z"
        fill="${fill}" stroke="${OUTLINE}" stroke-width="5"/>
  <path class="crack" d="M16 40 l8 6 -6 7 9 5 -4 8"
        stroke="${OUTLINE}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  ${stars}
</svg>`;
}

// a little chick of its own: round body, tiny comb, wing that can flap
function chickSVG(color) {
  return `
<svg viewBox="0 0 100 112">
  <g class="chick-legs" stroke="${OUTLINE}" stroke-width="4.5" stroke-linecap="round" fill="none">
    <path d="M42 78 L38 97 M38 97 l-8 6 M38 97 l7 8"/>
    <path d="M60 78 L64 97 M64 97 l-7 8 M64 97 l8 6"/>
  </g>
  <circle cx="50" cy="50" r="30" fill="${color}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M40 24 C39 14 50 12 52 20 C56 12 65 16 62 25 C55 21 47 21 40 24 Z"
        fill="#DE3244" stroke="${OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M24 46 L8 52 L25 59 Z" fill="#FFC93C" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="36" cy="44" r="4" fill="${OUTLINE}"/>
  <path class="chick-wing" d="M62 44
    a10 10 0 0 1 18 6
    a10 10 0 0 1 4 16
    a10 10 0 0 1 -15 10
    q-11 -6 -12 -17
    q-1 -10 5 -15 z"
    fill="${color}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
</svg>`;
}

// the cracked bottom half of the egg, left behind when the chick leaps out
function shellBottomSVG(golden) {
  const fill = golden ? EGG_GOLD : EGG_CREAM;
  return `
<svg viewBox="0 0 96 62">
  <path d="M8 24 L20 12 L32 24 L44 12 L56 24 L68 12 L80 24 A36 30 0 0 1 8 24 Z"
        fill="${fill}" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
</svg>`;
}

// the empty top of the shell, flung off as the egg opens
function shellTopSVG(golden) {
  const fill = golden ? EGG_GOLD : EGG_CREAM;
  return `
<svg viewBox="0 0 70 62">
  <path d="M10 42 L20 28 L30 42 L40 28 L50 42 A20 18 0 0 1 10 42 Z"
        fill="${fill}" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
</svg>`;
}

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
  peep() {  // one tiny chirp for the peep-jumps
    this.tone(1700 + Math.random() * 400, 2200, 0.06, 'sine', 0.12, 0);
  },
  // A happy little original song for golden-egg hatches (~3s):
  // a bouncy melody with a soft bass line, ending on two chick cheeps.
  song() {
    const B = 0.14; // one beat, in seconds
    // [frequency, startBeat, lengthBeats]
    const MELODY = [
      [523, 0, 1], [659, 1, 1], [784, 2, 1], [1047, 3, 2],   // do mi so DO!
      [880, 5, 1], [1047, 6, 1], [784, 7, 2],                // la DO so~
      [698, 9, 1], [880, 10, 1], [784, 11, 1], [659, 12, 2], // fa la so mi~
      [587, 14, 1], [659, 15, 1], [523, 16, 2.5],            // re mi do~
    ];
    const BASS = [
      [262, 0, 1.5], [196, 4, 1.5], [175, 9, 1.5], [196, 12, 1.5], [262, 16, 2],
    ];
    MELODY.forEach(([f, at, len]) => {
      this.tone(f, f, len * B * 0.9, 'triangle', 0.2, at * B);
    });
    BASS.forEach(([f, at, len]) => {
      this.tone(f, f, len * B * 0.9, 'sine', 0.12, at * B);
    });
    // two proud little cheeps to finish
    this.tone(1600, 2100, 0.06, 'sine', 0.14, 19 * B);
    this.tone(1800, 2300, 0.06, 'sine', 0.14, 20 * B);
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

// ---------------------------------------------------------------- tiers

function buildCollection() {
  TIERS.forEach((tier) => {
    const slot = document.createElement('div');
    slot.className = 'tier-slot';
    slot.dataset.n = String(tier.n);
    slot.innerHTML = chickSVG(tier.color);
    collectionEl.appendChild(slot);
  });
}

function refreshCollection() {
  Array.from(collectionEl.children).forEach((slot) => {
    slot.classList.toggle('earned', state.earnedTiers.has(parseInt(slot.dataset.n, 10)));
  });
}

function showTierBanner(tier, gen) {
  tierBanner.style.color = tier.color;
  tierBanner.style.borderColor = tier.color;
  tierBannerNum.textContent = tier.n + '!';
  tierBanner.hidden = false;
  tierBanner.classList.remove('show', 'hide');
  void tierBanner.offsetWidth;
  tierBanner.classList.add('show');
  setTimeout(() => {
    if (gen !== state.generation) return;
    tierBanner.classList.add('hide');
    setTimeout(() => { tierBanner.hidden = true; }, 550);
  }, 3100); // banner stays up for the length of the milestone song
}

function celebrateTier(tier, x, y, gen) {
  state.earnedTiers.add(tier.n);
  refreshCollection();
  showTierBanner(tier, gen);
  spawnSparks(x, y, tier.color);
  spawnSparks(x, y, '#FFFFFF');
  AudioFX.song();
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

  // Every egg hatches in lay order, so egg #N is hatch #N: if this egg
  // is a milestone, it is laid golden and will hatch the tier chick.
  const tier = TIERS.find((t) => t.n === state.totalEggsLaid);

  chickenEl.classList.remove('lay');
  void chickenEl.offsetWidth;
  chickenEl.classList.add('lay');
  setTimeout(() => chickenEl.classList.remove('lay'), 460);

  // The egg appears just under where the chicken is right now...
  const egg = document.createElement('div');
  egg.className = 'egg pop' + (tier ? ' golden' : '');
  egg.innerHTML = eggSVG(!!tier);
  if (tier) egg.dataset.tier = String(tier.n);
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
          openEgg(egg, gen);
        }, 320);
      }, 620);
    }, i * CONFIG.hatchStaggerMs);
  });
}

// The egg opens: shell top flies off, the chick sits in the bottom shell
// for a beat, then leaps out and peep-jumps off the stage.
function openEgg(egg, gen) {
  const x = parseFloat(egg.style.left);
  const y = parseFloat(egg.style.top);
  const tierN = egg.dataset.tier ? parseInt(egg.dataset.tier, 10) : null;
  const tier = tierN ? TIERS.find((t) => t.n === tierN) : null;
  egg.remove();

  spawnSparks(x, y, tier ? tier.color : '#FFF6C9');
  spawnShellTop(x, y, !!tier);
  spawnChick(x, y, tier, gen);

  state.totalChicksHatched += 1;
  AudioFX.cheep();
  updateHud();
  bumpPill(chickPill);

  if (tier) celebrateTier(tier, x, y, gen);
}

function spawnChick(x, y, tier, gen) {
  const color = tier ? tier.color : '#FFE23F';

  // chick first, shell after — the shell paints over the chick's bottom
  const chick = document.createElement('div');
  chick.className = 'chick-out pop sitting' + (tier ? ' glow' : '');
  chick.innerHTML = chickSVG(color);
  chick.style.left = x + '%';
  chick.style.top = (y - 1.5) + '%';
  if (tier) chick.style.setProperty('--glow', tier.color);
  chickLayer.appendChild(chick);

  const shell = document.createElement('div');
  shell.className = 'shell-bottom';
  shell.innerHTML = shellBottomSVG(!!tier);
  shell.style.left = x + '%';
  shell.style.top = (y + 2.5) + '%';
  chickLayer.appendChild(shell);

  // 1) sit in the shell for a beat...
  setTimeout(() => {
    if (gen !== state.generation) { chick.remove(); shell.remove(); return; }

    // 2) ...leap out and land beside the shell (shell fades away)...
    const exitRight = x < 50 ? false : true; // head for the nearest edge
    const landX = x + (exitRight ? 7 : -7);
    chick.classList.remove('sitting');
    chick.classList.add('leap');
    if (exitRight) chick.classList.add('face-right');
    chick.style.left = landX + '%';
    chick.style.top = (y + 1.5) + '%';
    AudioFX.peep();

    shell.classList.add('fade');
    setTimeout(() => shell.remove(), 550);

    // 3) ...then peep-jump off the stage, flapping its little wings.
    setTimeout(() => {
      if (gen !== state.generation) { chick.remove(); return; }
      const exitX = exitRight ? 112 : -12;
      const dist = Math.abs(exitX - landX);
      const ms = Math.max(2000, dist * CONFIG.journeyMsPerPct);
      chick.classList.remove('leap');
      chick.classList.add('journey');
      chick.style.transition = 'left ' + ms + 'ms linear, top ' + ms + 'ms linear';
      requestAnimationFrame(() => { chick.style.left = exitX + '%'; });

      // tiny peeps along the way
      [700, 1600, 2600].forEach((t) => {
        if (t < ms) setTimeout(() => { if (gen === state.generation) AudioFX.peep(); }, t);
      });

      setTimeout(() => chick.remove(), ms + 400);
    }, 430);
  }, CONFIG.sitInShellMs);
}

function spawnShellTop(x, y, golden) {
  const shell = document.createElement('div');
  shell.className = 'shell-top';
  shell.innerHTML = shellTopSVG(golden);
  shell.style.left = x + '%';
  shell.style.top = y + '%';
  const dir = Math.random() < 0.5 ? -1 : 1;
  shell.style.setProperty('--dx', (dir * (34 + Math.random() * 26)) + 'px');
  shell.style.setProperty('--dy', (-40 - Math.random() * 24) + 'px');
  fxLayer.appendChild(shell);
  setTimeout(() => shell.remove(), 750);
}

function spawnSparks(x, y, color) {
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.style.left = x + '%';
    s.style.top = y + '%';
    if (color) s.style.borderColor = color;
    const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
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
  state.earnedTiers.clear();
  eggLayer.textContent = '';
  chickLayer.textContent = '';
  fxLayer.textContent = '';
  tierBanner.hidden = true;
  refreshCollection();
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
buildCollection();
updateHud();
scheduleBlink();
scheduleFlap();
scheduleIdleHop();
