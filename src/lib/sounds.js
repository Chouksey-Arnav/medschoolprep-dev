// ─────────────────────────────────────────────────────────────────────────────
// Sounds — Web Audio API (no external dependency, works offline)
// Generates pleasant UI sounds programmatically.
// ─────────────────────────────────────────────────────────────────────────────
let ctx = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(frequency, duration, type = 'sine', volume = 0.18, attack = 0.01, decay = 0.1) {
  try {
    const c = getCtx();
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, c.currentTime);
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(volume, c.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  } catch(e) { /* Audio not supported */ }
}

function chord(freqs, duration, volume = 0.12) {
  freqs.forEach((f, i) => setTimeout(() => tone(f, duration, 'sine', volume), i * 30));
}

export const SFX = {
  correct:  () => chord([523, 659, 784], 0.4, 0.1),         // C-E-G major chord
  wrong:    () => tone(220, 0.3, 'sawtooth', 0.08),          // Low buzzy tone
  levelUp:  () => { chord([523,659,784,1047], 0.6, 0.1); setTimeout(() => tone(1047, 0.5, 'sine', 0.12), 200); },
  xp:       () => tone(880, 0.15, 'sine', 0.08),             // Quick high ping
  flip:     () => tone(440, 0.08, 'triangle', 0.05),         // Subtle card flip
  bell:     () => { tone(880, 0.8, 'sine', 0.15, 0.01, 0.7); setTimeout(() => tone(1100, 0.5, 'sine', 0.08), 100); },
  achieve:  () => { [523,659,784,988,1047].forEach((f,i) => setTimeout(() => tone(f, 0.3, 'sine', 0.1), i*60)); },
  click:    () => tone(660, 0.05, 'triangle', 0.04),
  select:   () => tone(520, 0.08, 'sine', 0.05),
};

let sfxEnabled = true;
export const setSFX = (v) => { sfxEnabled = v; };
export const play  = (name) => { if (sfxEnabled && SFX[name]) SFX[name](); };
