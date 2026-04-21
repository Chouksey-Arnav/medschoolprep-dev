// ─────────────────────────────────────────────────────────────────────────────
// canvas-confetti — Celebration effects for achievements
// ─────────────────────────────────────────────────────────────────────────────
import confetti from 'canvas-confetti';

const BLUE   = ['#2d7fff','#5da0ff','#93c5fd'];
const GREEN  = ['#10b981','#34d399','#6ee7b7'];
const GOLD   = ['#f59e0b','#fbbf24','#fcd34d'];
const MULTI  = [...BLUE,...GREEN,...GOLD,'#8b5cf6','#f43f5e'];

/** Burst for completing a lesson (+XP) */
export function celebrateXP() {
  confetti({ particleCount: 35, spread: 55, origin: { y: 0.7 }, colors: BLUE, scalar: 0.8, ticks: 100 });
}

/** Big burst for leveling up */
export function celebrateLevelUp() {
  const opts = { spread: 80, origin: { y: 0.5 }, colors: MULTI, scalar: 1.1 };
  confetti({ ...opts, particleCount: 80, angle: 60 });
  setTimeout(() => confetti({ ...opts, particleCount: 80, angle: 120 }), 150);
}

/** Cannon for perfect quiz score (100%) */
export function celebratePerfect() {
  const end = Date.now() + 2200;
  const fire = () => {
    confetti({ particleCount: 5, angle: 60, spread: 50, origin: { x: 0 }, colors: GREEN, ticks: 200 });
    confetti({ particleCount: 5, angle: 120, spread: 50, origin: { x: 1 }, colors: GOLD, ticks: 200 });
    if (Date.now() < end) requestAnimationFrame(fire);
  };
  fire();
}

/** Star burst for unlocking an achievement */
export function celebrateAchievement() {
  confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: MULTI, shapes: ['star'], scalar: 1.2, ticks: 200 });
}

/** Subtle rain for unit mastery */
export function celebrateMastery() {
  confetti({ particleCount: 60, spread: 90, origin: { y: 0.3 }, colors: GREEN, gravity: 0.8, ticks: 250 });
}

/** Streak milestone (7 day, 30 day) */
export function celebrateStreak() {
  const fire = (angle, origin) =>
    confetti({ particleCount: 50, angle, spread: 60, origin, colors: ['#f59e0b','#fbbf24','#f97316'], ticks: 200 });
  fire(60,  { x: 0,   y: 0.6 });
  setTimeout(() => fire(120, { x: 1,   y: 0.6 }), 100);
  setTimeout(() => fire(90,  { x: 0.5, y: 0.4 }), 200);
}
