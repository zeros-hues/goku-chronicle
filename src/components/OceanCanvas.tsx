'use client';

import { useEffect, useRef } from 'react';
import { Renderer, Program, Triangle, Mesh } from 'ogl';

const VERT = /* glsl */ `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;

/* ── Noise helpers ──────────────────────────────────────── */
float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float val = 0.0;
  float amp = 0.5;
  float tot = 0.0;
  mat2 rot = mat2(0.8660, 0.5, -0.5, 0.8660);
  for (int i = 0; i < 6; i++) {
    val += amp * smoothNoise(p);
    tot += amp;
    p    = rot * p * 2.13 + vec2(3.7, -1.9);
    amp *= 0.48;
  }
  return val / tot;
}

/* ── Fish SDF helpers ───────────────────────────────────── */
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/* Ellipse SDF — semi-axes (rx, ry) */
float sdEllipse(vec2 p, vec2 r) {
  vec2 q = abs(p) / r;
  float l = length(q);
  return (l - 1.0) * min(r.x, r.y) / max(l, 0.0001);
}

/*
  Fish in local space: body center at origin, swimming left→right (+x).
  wiggle: tail/body undulation driven by sin(time).
  Returns signed distance — negative = inside fish.
*/
float fishSDF(vec2 p, float wiggle) {
  /* Body — elongated ellipse */
  float body = sdEllipse(p, vec2(0.072, 0.028));

  /* Tail fork — two rotated ellipses behind the body */
  float tailAngle = 0.42 + wiggle * 0.35;
  mat2 rotUp   = mat2(cos( tailAngle), -sin( tailAngle),
                      sin( tailAngle),  cos( tailAngle));
  mat2 rotDown = mat2(cos(-tailAngle), -sin(-tailAngle),
                      sin(-tailAngle),  cos(-tailAngle));

  vec2 tailOrigin = p + vec2(0.068, 0.0);
  float tailUp   = sdEllipse(rotUp   * tailOrigin, vec2(0.038, 0.014));
  float tailDown = sdEllipse(rotDown * tailOrigin, vec2(0.038, 0.014));
  float tail = min(tailUp, tailDown);

  /* Blend body + tail smoothly */
  return smin(body, tail, 0.012);
}

/* ── Render one fish ────────────────────────────────────── */
/* pos: world-space center, size: scale, speed: swim speed, phase: time offset */
vec3 drawFish(vec2 uv, vec3 col, vec2 pos, float size, float wiggle, float depth) {
  /* Transform UV to fish-local space */
  vec2 lp = (uv - pos) / size;

  float d = fishSDF(lp, wiggle);

  if (d > 0.025) return col; /* far outside — skip */

  /* Fish body color — warm terracotta, deeper = darker */
  vec3 fishCol = mix(
    vec3(0.72, 0.46, 0.30),
    vec3(0.58, 0.36, 0.22),
    depth
  );
  /* Belly highlight */
  fishCol = mix(fishCol, vec3(0.88, 0.76, 0.62), clamp(-lp.y * 3.5 + 0.3, 0.0, 0.45));

  /* Subtle fin stripe */
  float stripe = smoothstep(0.004, 0.0, abs(lp.y - 0.006) - 0.004) * step(lp.x, 0.02) * step(-0.04, lp.x);
  fishCol = mix(fishCol, fishCol * 0.78, stripe * 0.5);

  /* Eye — small dark circle near head */
  float eye = length(lp - vec2(-0.040, -0.006)) - 0.007;
  fishCol = mix(fishCol, vec3(0.18, 0.12, 0.08), smoothstep(0.002, -0.002, eye));
  /* Eye highlight */
  float eyeHL = length(lp - vec2(-0.042, -0.008)) - 0.003;
  fishCol = mix(fishCol, vec3(0.95, 0.92, 0.86), smoothstep(0.001, -0.001, eyeHL));

  /* Anti-aliased edge blend */
  float alpha = smoothstep(0.018, -0.004, d);
  /* Depth-based opacity: distant fish are more transparent */
  alpha *= mix(0.72, 0.38, depth);

  return mix(col, fishCol, alpha);
}

/* ── Main ───────────────────────────────────────────────── */
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.2;

  float t = u_time * 0.055;

  /* ── Ocean domain warping ─────────────────────────────── */
  vec2 q = vec2(
    fbm(p + vec2(0.00, 0.00) + t * vec2( 0.13, -0.05)),
    fbm(p + vec2(5.20, 1.30) + t * vec2(-0.06,  0.11))
  );
  vec2 r = vec2(
    fbm(p + 1.9 * q + vec2(1.70, 9.20) + t * vec2( 0.09, -0.07)),
    fbm(p + 1.9 * q + vec2(8.30, 2.80) + t * vec2(-0.05,  0.08))
  );
  float f = fbm(p + 2.2 * r + t * 0.025);
  f = clamp(f, 0.0, 1.0);

  /* ── Ocean color ──────────────────────────────────────── */
  vec3 cLight  = vec3(0.962, 0.946, 0.879);
  vec3 cMid    = vec3(0.930, 0.902, 0.825);
  vec3 cDeep   = vec3(0.848, 0.812, 0.724);
  vec3 cShadow = vec3(0.780, 0.740, 0.645);
  vec3 cAccent = vec3(0.718, 0.458, 0.278);

  vec3 col;
  col  = mix(cMid,    cLight,  clamp(f * 2.0 - 0.20, 0.0, 1.0));
  col  = mix(col,     cDeep,   clamp(1.0 - f * 2.2, 0.0, 1.0) * 0.65);
  col  = mix(col,     cShadow, clamp(pow(1.0 - f, 4.0) * 0.55, 0.0, 1.0));

  float warpMag = length(q) + length(r) * 0.5;
  col += cAccent * clamp(warpMag * 0.12 - 0.08, 0.0, 0.07);

  /* ── Paper grain ──────────────────────────────────────── */
  float grain = (hash(uv * vec2(1800.0, 1400.0) + t * 0.15) - 0.5) * 0.022;
  col += grain;

  /* ── Fish ─────────────────────────────────────────────── */
  float T = u_time;

  /* Fish 1 — mid-depth, medium size, steady pace */
  {
    float spd   = 0.048;
    float xBase = mod(T * spd + 0.00, 1.0 + 0.22) - 0.11;
    float yBase = 0.54 + sin(T * 0.31 + 0.0) * 0.06;
    float wig   = sin(T * 4.8 + 0.0) * 0.22;
    col = drawFish(uv, col, vec2(xBase, yBase), 0.95, wig, 0.20);
  }

  /* Fish 2 — shallow, small, quicker */
  {
    float spd   = 0.065;
    float xBase = mod(T * spd + 0.38, 1.0 + 0.22) - 0.11;
    float yBase = 0.68 + sin(T * 0.44 + 1.7) * 0.05;
    float wig   = sin(T * 5.6 + 1.7) * 0.25;
    col = drawFish(uv, col, vec2(xBase, yBase), 0.70, wig, 0.05);
  }

  /* Fish 3 — deep, large, slow */
  {
    float spd   = 0.032;
    float xBase = mod(T * spd + 0.72, 1.0 + 0.22) - 0.11;
    float yBase = 0.36 + sin(T * 0.22 + 3.1) * 0.07;
    float wig   = sin(T * 3.9 + 3.1) * 0.18;
    col = drawFish(uv, col, vec2(xBase, yBase), 1.20, wig, 0.55);
  }

  /* Fish 4 — mid, tiny, darting */
  {
    float spd   = 0.082;
    float xBase = mod(T * spd + 0.55, 1.0 + 0.22) - 0.11;
    float yBase = 0.60 + sin(T * 0.58 + 4.4) * 0.04;
    float wig   = sin(T * 6.2 + 4.4) * 0.28;
    col = drawFish(uv, col, vec2(xBase, yBase), 0.55, wig, 0.12);
  }

  /* Fish 5 — lower half, medium */
  {
    float spd   = 0.041;
    float xBase = mod(T * spd + 0.18, 1.0 + 0.22) - 0.11;
    float yBase = 0.28 + sin(T * 0.36 + 2.3) * 0.06;
    float wig   = sin(T * 4.3 + 2.3) * 0.20;
    col = drawFish(uv, col, vec2(xBase, yBase), 0.85, wig, 0.40);
  }

  /* ── Vignette ─────────────────────────────────────────── */
  vec2 vc = uv - vec2(0.5, 0.5);
  float vignette = 1.0 - dot(vc, vc * vec2(0.8, 1.2)) * 0.55;
  float topLeft  = 1.0 + (1.0 - uv.x) * 0.06 + uv.y * 0.04;
  col *= vignette * topLeft;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export default function OceanCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const renderer = new Renderer({
      alpha:     false,
      antialias: false,
      powerPreference: 'low-power',
    });
    const gl = renderer.gl;
    gl.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    wrap.appendChild(gl.canvas);

    const program = new Program(gl, {
      vertex:   VERT,
      fragment: FRAG,
      uniforms: {
        u_time:       { value: 0 },
        u_resolution: { value: [wrap.clientWidth, wrap.clientHeight] },
      },
    });

    const geometry = new Triangle(gl);
    const mesh     = new Mesh(gl, { geometry, program });

    function resize() {
      const w = wrap!.clientWidth;
      const h = wrap!.clientHeight;
      renderer.setSize(w, h);
      (program.uniforms as Record<string, { value: unknown }>).u_resolution.value = [w, h];
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let start = 0;

    function tick(ts: number) {
      raf = requestAnimationFrame(tick);
      if (!start) start = ts;
      (program.uniforms as Record<string, { value: unknown }>).u_time.value = (ts - start) * 0.001;
      renderer.render({ scene: mesh });
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}
      aria-hidden="true"
    />
  );
}
