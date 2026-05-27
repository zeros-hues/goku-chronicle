import {
  SEP_R, ALI_R, COH_R, SEP_W, ALI_W, COH_W,
  CURSOR_R, CURSOR_W, MARGIN,
  FISH_COUNT_JAN, FISH_COUNT_DEC,
  PRED_SCALE_JAN, PRED_SCALE_DEC,
  RIPPLE_MAX, RIPPLE_SPEED, RIPPLE_MAX_R,
} from './constants';

export interface Fish {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;       // smoothed heading (radians, 0 = right)
  scale: number;       // 1.0 = default size
  depth: number;       // 0 = deep background, 1 = near surface
  wigglePhase: number;
  wiggleSpeed: number; // rad/s
  isPredator: boolean;
  maxSpeed: number;
  minSpeed: number;
}

export interface Ripple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
}

/* ── Deterministic hash (no Math.random dependency) ─────── */
function dHash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function makeRng(seed: number) {
  let i = 0;
  return () => dHash(seed * 7919 + (i++) * 3571);
}

/* ── Day-of-year helpers ─────────────────────────────────── */
export function getDayOfYear(d: Date): number {
  return Math.floor(
    (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000
  ) + 1;
}

function yearProgress(): number {
  return Math.min((getDayOfYear(new Date()) - 1) / 364, 1);
}

/* ── Init (deterministic per calendar day) ──────────────── */
export function initFish(w: number, h: number): Fish[] {
  const progress = yearProgress();
  const normalN  = Math.round(FISH_COUNT_JAN - progress * (FISH_COUNT_JAN - FISH_COUNT_DEC));
  const rng      = makeRng(getDayOfYear(new Date()));

  const fish: Fish[] = [];

  for (let i = 0; i < normalN; i++) {
    const ang = rng() * Math.PI * 2;
    const spd = 0.65 + rng() * 0.75;
    fish.push({
      id: i,
      x: MARGIN + rng() * (w - MARGIN * 2),
      y: MARGIN + rng() * (h - MARGIN * 2),
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      angle: ang,
      scale: 0.52 + rng() * 0.55,
      depth: rng(),
      wigglePhase: rng() * Math.PI * 2,
      wiggleSpeed: 2.6 + rng() * 2.0,
      isPredator: false,
      maxSpeed: 1.2 + rng() * 0.55,
      minSpeed: 0.45,
    });
  }

  // Predator — grows across the year
  const predAng = rng() * Math.PI * 2;
  fish.push({
    id: 99,
    x: MARGIN + rng() * (w - MARGIN * 2),
    y: MARGIN + rng() * (h - MARGIN * 2),
    vx: Math.cos(predAng) * 0.55,
    vy: Math.sin(predAng) * 0.55,
    angle: predAng,
    scale: PRED_SCALE_JAN + progress * (PRED_SCALE_DEC - PRED_SCALE_JAN),
    depth: 0.55 + progress * 0.35,
    wigglePhase: 0,
    wiggleSpeed: 1.6 + progress * 0.4,
    isPredator: true,
    maxSpeed: 0.75 + progress * 0.30,
    minSpeed: 0.22,
  });

  return fish;
}

/* ── Boids update ────────────────────────────────────────── */
function cap(x: number, y: number, maxLen: number): [number, number] {
  const m = Math.sqrt(x * x + y * y);
  return m > maxLen ? [x / m * maxLen, y / m * maxLen] : [x, y];
}

export function updateFish(
  fish: Fish[],
  dt: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cursorActive: boolean,
): void {
  const s = dt * 60; // normalize to 60fps

  for (const f of fish) {
    let fx = 0, fy = 0;

    if (!f.isPredator) {
      let sx = 0, sy = 0, sc = 0;
      let ax = 0, ay = 0, ac = 0;
      let cohX = 0, cohY = 0, cc = 0;

      for (const o of fish) {
        if (o.id === f.id || o.isPredator) continue;
        const dx = f.x - o.x, dy = f.y - o.y;
        const d  = Math.sqrt(dx * dx + dy * dy);

        if (d < SEP_R && d > 0.5) { sx += dx / d; sy += dy / d; sc++; }
        if (d < ALI_R)            { ax += o.vx;   ay += o.vy;   ac++; }
        if (d < COH_R)            { cohX += o.x;  cohY += o.y;  cc++; }
      }

      if (sc > 0) { fx += sx / sc * SEP_W;              fy += sy / sc * SEP_W; }
      if (ac > 0) { fx += (ax / ac - f.vx) * ALI_W;     fy += (ay / ac - f.vy) * ALI_W; }
      if (cc > 0) {
        const dx = cohX / cc - f.x, dy = cohY / cc - f.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d > 0) { fx += dx / d * COH_W; fy += dy / d * COH_W; }
      }
    }

    // Cursor avoidance
    if (cursorActive) {
      const dx = f.x - cx, dy = f.y - cy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < CURSOR_R && d > 0.5) {
        const str = (1 - d / CURSOR_R) * CURSOR_W;
        fx += dx / d * str;
        fy += dy / d * str;
      }
    }

    // Soft boundary steering
    if (f.x < MARGIN)          fx += (MARGIN - f.x)          / MARGIN * 1.8;
    if (f.x > w - MARGIN)      fx -= (f.x - (w - MARGIN))    / MARGIN * 1.8;
    if (f.y < MARGIN)          fy += (MARGIN - f.y)          / MARGIN * 1.8;
    if (f.y > h - MARGIN)      fy -= (f.y - (h - MARGIN))    / MARGIN * 1.8;

    [fx, fy] = cap(fx, fy, 0.072);
    f.vx += fx * s;
    f.vy += fy * s;

    const spd = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    if (spd > f.maxSpeed)  { f.vx = f.vx / spd * f.maxSpeed; f.vy = f.vy / spd * f.maxSpeed; }
    if (spd < f.minSpeed && spd > 0) { f.vx = f.vx / spd * f.minSpeed; f.vy = f.vy / spd * f.minSpeed; }

    f.x += f.vx * s;
    f.y += f.vy * s;

    // Smooth heading toward velocity
    const ta = Math.atan2(f.vy, f.vx);
    let da = ta - f.angle;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    f.angle += da * Math.min(0.10 * s, 0.14);

    // Wrap edges
    const pad = 130;
    if (f.x < -pad)      f.x = w + pad;
    else if (f.x > w + pad) f.x = -pad;
    if (f.y < -pad)      f.y = h + pad;
    else if (f.y > h + pad) f.y = -pad;
  }
}

/* ── Ripples ─────────────────────────────────────────────── */
export function updateRipples(ripples: Ripple[], dt: number): void {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.r    += RIPPLE_SPEED * dt * 60;
    rp.alpha = Math.max(0, 1 - rp.r / rp.maxR);
    if (rp.alpha < 0.01) ripples.splice(i, 1);
  }
}

export function spawnRipple(ripples: Ripple[], x: number, y: number): void {
  if (ripples.length >= RIPPLE_MAX) ripples.shift();
  ripples.push({
    x, y,
    r: 3,
    maxR: RIPPLE_MAX_R + Math.random() * 25,
    alpha: 0.65,
  });
}
