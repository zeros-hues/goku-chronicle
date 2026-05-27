'use client';

import { useEffect, useRef } from 'react';
import { Fish, Ripple, initFish, updateFish, updateRipples, spawnRipple } from './ecosystem';
import { FISH_L, FISH_W, RIPPLE_SPAWN_D } from './constants';

/* ── Deterministic hash (caustics positioning) ──────────── */
function dh(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/* ══════════════════════════════════════════════════════════
   BACKGROUND + CAUSTICS
══════════════════════════════════════════════════════════ */
function drawWater(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Base — deep water gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0,    '#0f2d42');  // lighter at top (light entering water)
  bg.addColorStop(0.35, '#0a2235');
  bg.addColorStop(1,    '#061520');  // darkest depth
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle horizontal depth bands
  const band = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.75);
  band.addColorStop(0, 'rgba(20, 80, 110, 0.0)');
  band.addColorStop(0.5, 'rgba(15, 65, 95, 0.12)');
  band.addColorStop(1, 'rgba(8, 40, 65, 0.0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);
}

function drawCaustics(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  // Large slow caustic patches
  for (let i = 0; i < 22; i++) {
    const bx = dh(i * 7.31) * w;
    const by = dh(i * 13.71) * h;
    const ox = Math.sin(t * 0.17 + i * 2.3) * 68 + Math.cos(t * 0.11 + i * 1.7) * 44;
    const oy = Math.cos(t * 0.20 + i * 1.9) * 55 + Math.sin(t * 0.13 + i * 2.8) * 38;
    const x  = ((bx + ox) % w + w) % w;
    const y  = ((by + oy) % h + h) % h;
    const r  = 22 + dh(i * 3.71) * 34;

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,   'rgba(95, 195, 220, 0.09)');
    g.addColorStop(0.45,'rgba(65, 155, 195, 0.04)');
    g.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sharper bright sparkles
  for (let i = 0; i < 14; i++) {
    const bx = dh(i * 17.1 + 50) * w;
    const by = dh(i * 9.41 + 50) * h;
    const ox = Math.sin(t * 0.31 + i * 3.1) * 38 + Math.cos(t * 0.26 + i * 2.2) * 28;
    const oy = Math.cos(t * 0.27 + i * 2.7) * 32 + Math.sin(t * 0.22 + i * 1.9) * 25;
    const x  = ((bx + ox) % w + w) % w;
    const y  = ((by + oy) % h + h) % h;
    const r  = 5 + dh(i * 5.3 + 50) * 11;

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,   'rgba(170, 235, 255, 0.14)');
    g.addColorStop(0.5, 'rgba(110, 195, 225, 0.06)');
    g.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ══════════════════════════════════════════════════════════
   RIPPLES
══════════════════════════════════════════════════════════ */
function drawRipples(ctx: CanvasRenderingContext2D, ripples: Ripple[]): void {
  for (const rp of ripples) {
    for (let k = 0; k < 3; k++) {
      const rr = rp.r * (1 - k * 0.22);
      if (rr <= 1) continue;
      const a = rp.alpha * (1 - k * 0.28) * 0.55;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(155, 215, 235, ${a})`;
      ctx.lineWidth   = (1.8 - k * 0.5);
      ctx.stroke();
    }
  }
}

/* ══════════════════════════════════════════════════════════
   FISH DRAWING — top-view koi/tuna silhouette
══════════════════════════════════════════════════════════ */
function drawFish(ctx: CanvasRenderingContext2D, f: Fish, t: number): void {
  const L = FISH_L * f.scale;
  const W = FISH_W * f.scale;

  // Tail wiggle proportional to speed
  const spd    = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
  const wAmt   = 0.18 + (spd / f.maxSpeed) * 0.82;
  const wiggle = Math.sin(t * f.wiggleSpeed + f.wigglePhase) * wAmt;
  // Tail sweeps perpendicular to heading (y-axis in local space)
  const tw = wiggle * W * 0.72;

  // Depth rendering: surface fish = high contrast graphite; deep = bluer, more transparent
  const alpha = 0.40 + f.depth * 0.50;

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.angle);
  ctx.globalAlpha = alpha;

  /* ── Soft drop shadow (fish casts shadow on seafloor) ── */
  ctx.save();
  ctx.globalAlpha = alpha * 0.22;
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = '#000';
  // Shadow body
  const shadowBody = new Path2D();
  shadowBody.moveTo(L + 3, 3);
  shadowBody.bezierCurveTo(L * 0.68 + 3, -W * 0.52 + 3, L * 0.28 + 3, -W + 3, -L * 0.40 + 3, -W * 0.40 + 3);
  shadowBody.bezierCurveTo(-L * 0.54 + 3, -W * 0.22 + 3, -L * 0.60 + 3, -W * 0.12 + 3, -L * 0.62 + 3, 3);
  shadowBody.bezierCurveTo(-L * 0.60 + 3, W * 0.12 + 3, -L * 0.54 + 3, W * 0.22 + 3, -L * 0.40 + 3, W * 0.40 + 3);
  shadowBody.bezierCurveTo(L * 0.28 + 3, W + 3, L * 0.68 + 3, W * 0.52 + 3, L + 3, 3);
  ctx.fill(shadowBody);
  ctx.restore();

  /* ── Pectoral fins (behind body) ───────────────────── */
  const finAlpha = 0.78;
  const finR = Math.round(lerp(16, 24, f.depth));
  const finG = Math.round(lerp(22, 32, f.depth));
  const finB = Math.round(lerp(36, 52, f.depth));
  const finColor = `rgba(${finR},${finG},${finB},${finAlpha})`;

  // Upper pectoral
  ctx.beginPath();
  ctx.moveTo(L * 0.20, -W * 0.86);
  ctx.bezierCurveTo(
    L * 0.06,  -W * 1.62,
    -L * 0.16, -W * 1.70,
    -L * 0.12, -W * 0.76,
  );
  ctx.closePath();
  ctx.fillStyle = finColor;
  ctx.fill();

  // Lower pectoral
  ctx.beginPath();
  ctx.moveTo(L * 0.20, W * 0.86);
  ctx.bezierCurveTo(
    L * 0.06,  W * 1.62,
    -L * 0.16, W * 1.70,
    -L * 0.12, W * 0.76,
  );
  ctx.closePath();
  ctx.fillStyle = finColor;
  ctx.fill();

  /* ── Tail lobes ─────────────────────────────────────── */
  const tailR = Math.round(lerp(12, 18, f.depth));
  const tailG = Math.round(lerp(16, 24, f.depth));
  const tailB = Math.round(lerp(26, 40, f.depth));

  // Upper lobe
  ctx.beginPath();
  ctx.moveTo(-L * 0.61, tw * 0.12);
  ctx.bezierCurveTo(
    -L * 0.78, -W * 0.06 + tw * 0.40,
    -L * 0.97, -W * 0.52 + tw * 0.82,
    -L * 1.18, -W * 0.42 + tw,
  );
  ctx.bezierCurveTo(
    -L * 0.98, -W * 0.20 + tw * 0.42,
    -L * 0.76, -W * 0.06 + tw * 0.18,
    -L * 0.61, tw * 0.12,
  );
  ctx.fillStyle = `rgb(${tailR},${tailG},${tailB})`;
  ctx.fill();

  // Lower lobe
  ctx.beginPath();
  ctx.moveTo(-L * 0.61, tw * 0.12);
  ctx.bezierCurveTo(
    -L * 0.78,  W * 0.06 + tw * 0.40,
    -L * 0.97,  W * 0.52 + tw * 0.82,
    -L * 1.18,  W * 0.42 + tw,
  );
  ctx.bezierCurveTo(
    -L * 0.98,  W * 0.20 + tw * 0.42,
    -L * 0.76,  W * 0.06 + tw * 0.18,
    -L * 0.61, tw * 0.12,
  );
  ctx.fillStyle = `rgb(${tailR},${tailG},${tailB})`;
  ctx.fill();

  /* ── Body ───────────────────────────────────────────── */
  const bodyPath = new Path2D();
  bodyPath.moveTo(L, 0);

  // Upper edge: head → body widest → peduncle
  bodyPath.bezierCurveTo(L * 0.70, -W * 0.52, L * 0.28, -W,    -L * 0.40, -W * 0.40);
  bodyPath.bezierCurveTo(-L * 0.53, -W * 0.22, -L * 0.59, -W * 0.12, -L * 0.62, 0);

  // Lower edge (mirror): peduncle → body widest → head
  bodyPath.bezierCurveTo(-L * 0.59,  W * 0.12, -L * 0.53,  W * 0.22, -L * 0.40, W * 0.40);
  bodyPath.bezierCurveTo(L * 0.28,   W,        L * 0.70,   W * 0.52, L, 0);

  // Body fill — dark graphite; slightly more blue-gray for deep fish
  const bodyGrad = ctx.createLinearGradient(0, -W, 0, W);
  const dr = Math.round(lerp(14, 24, f.depth));
  const dg = Math.round(lerp(19, 32, f.depth));
  const db = Math.round(lerp(30, 50, f.depth));
  bodyGrad.addColorStop(0,    `rgb(${dr},     ${dg},     ${db})`);
  bodyGrad.addColorStop(0.20, `rgb(${dr + 8}, ${dg + 9}, ${db + 12})`);
  bodyGrad.addColorStop(0.38, `rgb(${dr + 14},${dg + 15},${db + 20})`); // dorsal ridge
  bodyGrad.addColorStop(0.50, `rgb(${dr + 10},${dg + 11},${db + 15})`);
  bodyGrad.addColorStop(0.62, `rgb(${dr + 7}, ${dg + 8}, ${db + 11})`);
  bodyGrad.addColorStop(1,    `rgb(${dr - 4}, ${dg - 3}, ${db + 2})`);
  ctx.fillStyle = bodyGrad;
  ctx.fill(bodyPath);

  // Subtle specular highlight (light refracting through water surface)
  ctx.save();
  ctx.clip(bodyPath);
  const spec = ctx.createLinearGradient(0, -W * 0.5, 0, W * 0.5);
  spec.addColorStop(0,    'rgba(70, 120, 165, 0.0)');
  spec.addColorStop(0.25, 'rgba(95, 148, 188, 0.10)');
  spec.addColorStop(0.42, 'rgba(110, 162, 200, 0.15)'); // peak
  spec.addColorStop(0.60, 'rgba(80, 130, 175, 0.07)');
  spec.addColorStop(1,    'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = spec;
  ctx.fillRect(-L, -W * 1.5, L * 2, W * 3);
  ctx.restore();

  /* ── Eye ────────────────────────────────────────────── */
  const ex = L * 0.67, ey = -W * 0.26, er = W * 0.20;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(5, 8, 16, ${0.72 + f.depth * 0.22})`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ex - er * 0.32, ey - er * 0.32, er * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(175, 210, 240, 0.42)';
  ctx.fill();

  ctx.restore();
}

/* ══════════════════════════════════════════════════════════
   VIGNETTE
══════════════════════════════════════════════════════════ */
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.28, w * 0.5, h * 0.5, h * 0.88);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(2, 10, 18, 0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ══════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════ */
export default function ChronicleSea() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;
    const dpr = window.devicePixelRatio || 1;

    /* Fish + ripple state */
    let fish: Fish[]    = [];
    let ripples: Ripple[] = [];

    /* Cursor state (ref, no re-render) */
    const mouse = { x: -9999, y: -9999, active: false, lx: 0, ly: 0 };

    /* ── Resize ──────────────────────────────────────── */
    function resize() {
      W = container!.clientWidth;
      H = container!.clientHeight;
      canvas!.width  = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width  = W + 'px';
      canvas!.style.height = H + 'px';
      ctx!.scale(dpr, dpr);
      fish = initFish(W, H);
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    /* ── Mouse ───────────────────────────────────────── */
    function onMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      const dx = nx - mouse.lx, dy = ny - mouse.ly;
      if (Math.sqrt(dx * dx + dy * dy) > RIPPLE_SPAWN_D) {
        spawnRipple(ripples, nx, ny);
        mouse.lx = nx;
        mouse.ly = ny;
      }
      mouse.x = nx;
      mouse.y = ny;
      mouse.active = true;
    }
    function onLeave() { mouse.active = false; }

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    /* ── Render loop ─────────────────────────────────── */
    let raf = 0;
    let prevT = 0;

    function tick(ms: number) {
      raf = requestAnimationFrame(tick);
      const dt   = Math.min((ms - prevT) / 1000, 0.05); // cap dt (tab hidden etc.)
      prevT = ms;
      const t = ms * 0.001;

      updateFish(fish, dt, W, H, mouse.x, mouse.y, mouse.active);
      updateRipples(ripples, dt);

      ctx!.clearRect(0, 0, W, H);
      drawWater(ctx!, W, H);
      drawCaustics(ctx!, W, H, t);
      drawRipples(ctx!, ripples);

      // Sort: deep fish first (drawn behind surface fish)
      const sorted = [...fish].sort((a, b) => a.depth - b.depth);
      for (const f of sorted) drawFish(ctx!, f, t);

      drawVignette(ctx!, W, H);
    }
    raf = requestAnimationFrame(tick);

    /* ── Cleanup ─────────────────────────────────────── */
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
