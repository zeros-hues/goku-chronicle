/* Seasonal parameters for a reflective architectural pool.
   The pool has three visual layers:
     1. Dark polished stone floor (visible through shallow water)
     2. Warm cream ceiling / skylight reflected on the water surface
     3. Very subtle muted-teal water tint linking the two layers         */

export interface SeasonalParams {
  /* Pool floor material */
  stone:      [number, number, number]; // dark granite/slate base
  stoneRough: number;                   // texture roughness 0-1

  /* Surface reflection: the sky/ceiling above the pool */
  skyHigh:    [number, number, number]; // center of reflected ceiling
  skyLow:     [number, number, number]; // reflected edges / horizon

  /* Caustic light (refracted sunlight dancing on the floor) */
  causticCol: [number, number, number]; // light color
  causticStr: number;                   // brightness

  /* Wave physics */
  turbulence: number;   // ambient wave energy injection
  damping:    number;   // energy retention per frame (<1)

  /* Optics */
  refraction: number;   // how much floor shifts under ripples
  reflectStr: number;   // how strongly ceiling reflects

  /* Water column tint */
  tintColor:  [number, number, number];
  tintAmt:    number;

  /* Atmosphere */
  haze:       number;   // far-end depth haze
  specular:   number;   // wave crest highlight strength
}

/* ── Season anchor presets ─────────────────────────────── */

// Jan — brighter, cleaner, airy. Stone almost luminous with softer caustics.
const WINTER: SeasonalParams = {
  stone:      [0.048, 0.055, 0.074],
  stoneRough: 0.19,
  skyHigh:    [0.918, 0.896, 0.845],  // warm Chronicle paper
  skyLow:     [0.562, 0.575, 0.615],
  causticCol: [0.958, 0.888, 0.720],
  causticStr: 0.062,
  turbulence: 0.0040, damping: 0.9920,
  refraction: 0.0088, reflectStr: 0.038,
  tintColor:  [0.50, 0.70, 0.84], tintAmt: 0.034,
  haze: 0.132, specular: 0.092,
};

// Apr — building energy, caustics growing, more active surface.
const SPRING: SeasonalParams = {
  stone:      [0.044, 0.051, 0.070],
  stoneRough: 0.22,
  skyHigh:    [0.908, 0.885, 0.835],
  skyLow:     [0.548, 0.565, 0.610],
  causticCol: [0.968, 0.898, 0.735],
  causticStr: 0.092,
  turbulence: 0.0092, damping: 0.9886,
  refraction: 0.0118, reflectStr: 0.042,
  tintColor:  [0.46, 0.68, 0.82], tintAmt: 0.046,
  haze: 0.090, specular: 0.128,
};

// Jul — richest light. Darkest stone, brightest caustics, strongest tint.
const SUMMER: SeasonalParams = {
  stone:      [0.036, 0.042, 0.062],
  stoneRough: 0.26,
  skyHigh:    [0.928, 0.902, 0.850],
  skyLow:     [0.530, 0.555, 0.608],
  causticCol: [0.982, 0.912, 0.745],
  causticStr: 0.145,
  turbulence: 0.0188, damping: 0.9850,
  refraction: 0.0162, reflectStr: 0.050,
  tintColor:  [0.40, 0.66, 0.82], tintAmt: 0.068,
  haze: 0.060, specular: 0.165,
};

// Oct — calmer heavier movement, warmer amber light, deeper atmosphere.
const AUTUMN: SeasonalParams = {
  stone:      [0.040, 0.048, 0.068],
  stoneRough: 0.23,
  skyHigh:    [0.902, 0.878, 0.828],
  skyLow:     [0.545, 0.560, 0.605],
  causticCol: [0.962, 0.875, 0.688],
  causticStr: 0.072,
  turbulence: 0.0058, damping: 0.9908,
  refraction: 0.0098, reflectStr: 0.036,
  tintColor:  [0.48, 0.66, 0.80], tintAmt: 0.050,
  haze: 0.162, specular: 0.100,
};

// Dec — stillest water. Darkest stone. Softest reflections. Contemplative.
const DECEMBER: SeasonalParams = {
  stone:      [0.028, 0.034, 0.055],
  stoneRough: 0.17,
  skyHigh:    [0.855, 0.835, 0.800],
  skyLow:     [0.505, 0.520, 0.568],
  causticCol: [0.905, 0.850, 0.705],
  causticStr: 0.038,
  turbulence: 0.0018, damping: 0.9945,
  refraction: 0.0072, reflectStr: 0.032,
  tintColor:  [0.50, 0.66, 0.79], tintAmt: 0.026,
  haze: 0.210, specular: 0.062,
};

/* ── Interpolation ──────────────────────────────────────── */
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function lv(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function lp(a: SeasonalParams, b: SeasonalParams, t: number): SeasonalParams {
  const s = t * t * (3 - 2 * t); // smoothstep
  return {
    stone:      lv(a.stone,      b.stone,      s),
    stoneRough: lerp(a.stoneRough, b.stoneRough, s),
    skyHigh:    lv(a.skyHigh,    b.skyHigh,    s),
    skyLow:     lv(a.skyLow,     b.skyLow,     s),
    causticCol: lv(a.causticCol, b.causticCol, s),
    causticStr: lerp(a.causticStr,  b.causticStr,  s),
    turbulence: lerp(a.turbulence,  b.turbulence,  s),
    damping:    lerp(a.damping,     b.damping,     s),
    refraction: lerp(a.refraction,  b.refraction,  s),
    reflectStr: lerp(a.reflectStr,  b.reflectStr,  s),
    tintColor:  lv(a.tintColor,  b.tintColor,  s),
    tintAmt:    lerp(a.tintAmt,     b.tintAmt,     s),
    haze:       lerp(a.haze,        b.haze,        s),
    specular:   lerp(a.specular,    b.specular,    s),
  };
}

/* ── Public API ─────────────────────────────────────────── */
export function getDayOfYear(d: Date): number {
  return (
    Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1
  );
}

export function getSeasonalParams(): SeasonalParams {
  const t  = Math.min((getDayOfYear(new Date()) - 1) / 364, 1);
  const BP = [0, 0.22, 0.47, 0.73, 0.97, 1.0] as const;
  const SS = [WINTER, SPRING, SUMMER, AUTUMN, DECEMBER, WINTER] as const;

  let idx = SS.length - 2;
  for (let i = 0; i < BP.length - 1; i++) {
    if (t >= BP[i] && t < BP[i + 1]) { idx = i; break; }
  }
  return lp(SS[idx], SS[idx + 1], (t - BP[idx]) / (BP[idx + 1] - BP[idx]));
}
