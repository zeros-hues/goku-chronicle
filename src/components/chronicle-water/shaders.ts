export const VERT = /* glsl */`
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/* ══════════════════════════════════════════════════════════

  REFLECTIVE ARCHITECTURAL POOL — fragment shader

  Visual model (top-down view):
    ┌────────────────────────────────────┐
    │  CEILING / SKYLIGHT                │   ← reflected on surface
    │    warm cream (Chronicle paper)    │
    └──────────────────────────────────┬─┘
                                       │
                         [water surface]  ← wave normals control Fresnel mix
                                       │
    ┌──────────────────────────────────┴─┐
    │  POOL FLOOR (dark polished stone)  │   ← refracted view through water
    │    caustic light dances on stone   │
    └────────────────────────────────────┘

  Layer compositing:
    col = mix(floorLayer + caustics, ceilingReflection, fresnel)
    col = mix(col, col * tint, tintAmt)     ← subtle water tint
    col += specular + edgeHighlight          ← surface optics

══════════════════════════════════════════════════════════ */
export const FRAG = /* glsl */`
precision highp float;

uniform float     u_time;
uniform vec2      u_resolution;
uniform sampler2D u_waveTex;
uniform vec2      u_waveRes;

/* Pool floor */
uniform vec3  u_stone;       /* dark stone base color             */
uniform float u_stoneRough;  /* texture roughness 0-1             */

/* Ceiling reflection */
uniform vec3  u_skyHigh;     /* bright center of ceiling          */
uniform vec3  u_skyLow;      /* darker edges / periphery          */
uniform float u_reflectStr;  /* how hard the ceiling reflects     */

/* Caustic light (refracted sunlight on stone) */
uniform vec3  u_causticCol;
uniform float u_causticStr;

/* Optics */
uniform float u_refraction;  /* floor UV displacement scale       */
uniform vec3  u_tint;        /* water column tint color           */
uniform float u_tintAmt;     /* tint strength                     */

/* Atmosphere */
uniform float u_haze;
uniform float u_specular;

/* ── Noise ─────────────────────────────────────────── */
float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float sn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),             hash(i + vec2(1,0)), u.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.50;
  mat2 rot = mat2(0.866, 0.5, -0.5, 0.866);
  for (int i = 0; i < 5; i++) {
    v += a * sn(p);
    p  = rot * p * 2.08 + vec2(5.2, 1.3);
    a *= 0.50;
  }
  return v;
}

/* ── Caustic light (on the pool floor) ─────────────── */
float causticPat(vec2 uv, float t) {
  /* Three fbm layers at different scales / drift velocities.
     They interfere: only where all three are high do we get
     bright caustic spots — the rest stays quiet.            */
  float c1 = fbm(uv * 3.20 + vec2( t * 0.082, -t * 0.060));
  float c2 = fbm(uv * 5.90 + vec2(-t * 0.052,  t * 0.088) + 3.71);
  float c3 = fbm(uv * 2.10 + vec2( t * 0.038, -t * 0.032) + 7.33);

  float merged = c1 * 0.44 + c2 * 0.36 + c3 * 0.20;
  /* Power law sharpens the peaks into distinct bright spots */
  return pow(max(0.0, merged - 0.285) * 1.50, 2.6);
}

/* ── Polished stone floor texture ───────────────────── */
vec3 stoneLayer(vec2 uv) {
  /* Large-scale slab variation */
  float n1 = fbm(uv * 2.8) * 0.5 + 0.5;
  /* Fine surface grain */
  float n2 = sn(uv * 32.0 + 1.7) * 0.5 + 0.5;

  float n = mix(n1, n2, u_stoneRough * 0.38);
  /* Dark stone: base is near-black, subtle brightness variation */
  return u_stone * (0.82 + n * 0.28);
}

/* ── Ceiling reflection gradient ────────────────────── */
/* The ceiling above the pool is warm cream (Chronicle paper).
   The reflection is brightest looking straight up (center),
   dimmer near the edges (glancing angles).                  */
vec3 ceilingRefl(vec2 uv, float t) {
  vec2 centered = uv - 0.5;
  /* Slight asymmetry gives impression of non-infinite space */
  float d = length(centered * vec2(1.0, 0.88));
  vec3 sky = mix(u_skyHigh, u_skyLow, smoothstep(0.0, 0.68, d));

  /* Very slow cloud/environment drift — just enough to feel alive */
  float drift = sn(uv * 1.6 + t * vec2(0.006, 0.004)) * 0.032;
  return sky + drift;
}

/* ── Main ────────────────────────────────────────────── */
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t  = u_time;

  /* ── Wave height + gradient (surface normal) ─────────
     Texture encodes height as [0,1] → decode to [-1,1]   */
  float h = texture2D(u_waveTex, uv).r * 2.0 - 1.0;

  vec2 tx  = 1.0 / u_waveRes;
  float hL = texture2D(u_waveTex, uv - vec2(tx.x, 0.0)).r * 2.0 - 1.0;
  float hR = texture2D(u_waveTex, uv + vec2(tx.x, 0.0)).r * 2.0 - 1.0;
  float hD = texture2D(u_waveTex, uv - vec2(0.0, tx.y)).r * 2.0 - 1.0;
  float hU = texture2D(u_waveTex, uv + vec2(0.0, tx.y)).r * 2.0 - 1.0;
  /* Surface gradient — tells us which way the surface is tilted */
  vec2 grad = vec2(hR - hL, hU - hD) * 0.5;

  /* ── Layer 1: Pool floor ──────────────────────────────
     Refraction: looking through water at the floor.
     The surface normal bends the view → floor appears shifted. */
  vec2 refractUV = uv + grad * u_refraction;
  vec3 stone     = stoneLayer(refractUV);

  /* ── Caustic light on the floor ──────────────────────
     Sunlight refracts through the surface and creates
     dancing bright patches on the stone floor.            */
  float cPat   = causticPat(refractUV, t);
  vec3 caustic = u_causticCol * cPat * u_causticStr;

  vec3 poolFloor = stone + caustic;

  /* ── Layer 2: Ceiling reflection ─────────────────────
     The water surface acts as a mirror.
     Reflection UV shifts OPPOSITE to refraction
     (the reflection comes from the other direction).       */
  vec2 reflUV = uv - grad * u_reflectStr * 2.4;
  vec3 ceiling = ceilingRefl(reflUV, t);

  /* ── Fresnel mixing: floor vs ceiling ────────────────
     Physically: a flat surface at near-normal incidence
     is mostly transparent (see floor). When the surface
     tilts (wave), it becomes more mirror-like (see ceiling).

     For top-down architectural pool, base reflectivity ~6%.
     Wave slopes push it toward 60% at maximum tilt.        */
  float gLen    = length(grad);
  float fresnel = 0.06 + pow(clamp(gLen * 3.0, 0.0, 1.0), 1.5) * 0.54;

  /* Composite: mostly floor in calm regions, ceiling in wave peaks */
  vec3 col = mix(poolFloor, ceiling, fresnel);

  /* ── Water column tint ────────────────────────────────
     Very shallow pool: tiny amount of muted teal added.
     Shifts warm stone + cream toward the signature Chronicle
     editorial blue-green without overwhelming either layer. */
  col *= mix(vec3(1.0), u_tint, u_tintAmt);

  /* ── Surface optics ───────────────────────────────────

     Specular: wave crests catch direct overhead light.
     Color matches warm Chronicle cream (not harsh white). */
  float spec = pow(max(0.0, h), 2.8) * u_specular;
  col += vec3(0.93, 0.90, 0.84) * spec;

  /* Micro-specular: sharp bright lines on wave edges.
     Creates the "glittering" quality of real pool water.  */
  float edgeSp = gLen * gLen * 0.22;
  col += vec3(0.82, 0.86, 0.90) * edgeSp;

  /* ── Slow ambient flow ────────────────────────────────
     Large-scale current: keeps the surface alive when
     no cursor is active. Independent of ripple physics.   */
  float flow = fbm(uv * 1.5 + t * vec2(0.014, 0.010)) * 0.5 + 0.5;
  col += u_tint * pow(flow, 3.5) * 0.018;

  /* ── Suspended particles ──────────────────────────────
     Microscopic dust floating in the water column.
     Very sparse — just enough to feel atmospheric.        */
  vec2 pd = uv * vec2(22.0, 16.0) + t * vec2(0.005, 0.0038);
  float ph = hash(vec2(floor(pd.x), floor(pd.y)));
  if (ph > 0.974) {
    float pDist = length(fract(pd) - 0.5);
    col += vec3(0.78, 0.82, 0.86) * smoothstep(0.22, 0.0, pDist) * 0.035;
  }

  /* ── Depth haze (perspective) ─────────────────────────
     Far end of pool (screen top) is hazier — depth cue.
     Blends toward reflection to maintain brightness.       */
  float farness = 1.0 - uv.y;
  col = mix(col, ceiling * 0.78, u_haze * pow(farness, 2.4) * 0.40);

  /* ── Near-edge grounding ──────────────────────────────
     Bottom of screen (near edge) is slightly more present.
     Creates sense of physical scale and foreground/background. */
  col += vec3(0.018, 0.022, 0.028) * pow(uv.y, 4.0) * 0.14;

  /* ── Vignette ─────────────────────────────────────────
     Darker edges focus attention to center pool area.     */
  vec2 vc = uv - 0.5;
  float vg = 1.0 - dot(vc, vc * vec2(0.72, 1.28)) * 0.90;
  col *= clamp(vg, 0.0, 1.0);

  /* ── Overhead light gradient ──────────────────────────
     Top is slightly brighter (light source above / skylight). */
  col *= 1.0 + (1.0 - uv.y) * 0.040;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
