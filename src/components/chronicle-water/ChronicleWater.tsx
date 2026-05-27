'use client';

import { useEffect, useRef } from 'react';
import { Renderer, Program, Triangle, Mesh, Texture } from 'ogl';
import { VERT, FRAG } from './shaders';
import { getSeasonalParams } from './temporal';
import { GW, GH, CURSOR_RADIUS as CURSOR_R } from './constants';

export default function ChronicleWater() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ── Canvas size ──────────────────────────────────── */
    let W = container.clientWidth;
    let H = container.clientHeight;

    /* ── Wave simulation state (local to this effect) ───
       All state lives inside the effect closure so multiple
       instances don't share data and cleanup is trivial.   */
    const N   = GW * GH;
    const wH  = new Float32Array(N);   // height field
    const wV  = new Float32Array(N);   // velocity field
    const TEX = new Uint8Array(N * 4); // RGBA texture upload buffer
    for (let i = 3; i < N * 4; i += 4) TEX[i] = 255; // alpha = 255

    let simTime  = 0;
    const sp     = getSeasonalParams(); // seasonal params, fixed for this session

    /* Ambient injection state */
    let lastInject = 0;

    /* ── Wave step ──────────────────────────────────────
       Classic pressure-wave propagation on a 2D grid.
       Each cell is driven toward the mean of its neighbours.
       Damping prevents energy build-up.                    */
    function stepWave(dt: number): void {
      const step = Math.min(dt * 60, 1.4); // cap for tab-hidden recovery
      simTime += dt;

      /* Ambient current injection — keeps water alive.
         3 injection points orbit slowly around the grid,
         creating the living current-field feel.            */
      const injectInterval = 1.0 / (sp.turbulence * 12 + 0.001);
      if (simTime - lastInject > injectInterval) {
        lastInject = simTime;
        const t = simTime;
        for (let k = 0; k < 3; k++) {
          const phase = k * 2.094 + t * 0.07; // 2π/3 spacing, slowly rotates
          const r  = 0.28 + 0.18 * Math.sin(t * 0.05 + k * 1.7);
          const cx = 0.5 + r * Math.cos(phase);
          const cy = 0.5 + r * Math.sin(phase * 0.83);
          const gx = Math.round(Math.min(Math.max(cx, 0.02), 0.98) * (GW - 1));
          const gy = Math.round(Math.min(Math.max(cy, 0.02), 0.98) * (GH - 1));
          if (gx > 0 && gx < GW - 1 && gy > 0 && gy < GH - 1) {
            wH[gy * GW + gx] += Math.sin(t * 0.22 + k * 3.1) * sp.turbulence * 2.0;
          }
        }
      }

      /* Wave propagation */
      const { damping } = sp;
      for (let y = 1; y < GH - 1; y++) {
        for (let x = 1; x < GW - 1; x++) {
          const i   = y * GW + x;
          const avg = (wH[i - 1] + wH[i + 1] + wH[i - GW] + wH[i + GW]) * 0.25;
          wV[i]    += (avg - wH[i]) * step;
          wV[i]    *= damping;
          wH[i]    += wV[i];
          /* Soft ceiling — prevents blow-up, gives surface-tension feel */
          if (wH[i] >  1.0) { wH[i] =  1.0; wV[i] *= -0.35; }
          if (wH[i] < -1.0) { wH[i] = -1.0; wV[i] *= -0.35; }
        }
      }

      /* Absorbing boundaries */
      for (let x = 0; x < GW; x++) {
        wH[x] = 0; wV[x] = 0;
        wH[(GH - 1) * GW + x] = 0; wV[(GH - 1) * GW + x] = 0;
      }
      for (let y = 0; y < GH; y++) {
        wH[y * GW] = 0; wV[y * GW] = 0;
        wH[y * GW + GW - 1] = 0; wV[y * GW + GW - 1] = 0;
      }

      /* Encode: height [-1,1] → RGBA uint8 [0,255] */
      for (let i = 0; i < N; i++) {
        const v = Math.round((wH[i] * 0.5 + 0.5) * 255);
        TEX[i * 4]     = v;
        TEX[i * 4 + 1] = v;
        TEX[i * 4 + 2] = v;
      }
    }

    /* ── Cursor force injection ──────────────────────────
       Injects height at a radial zone, with a slight
       elongation in the direction of movement — this creates
       the "finger dragging through water" wake shape.       */
    function injectForce(
      cssX: number, cssY: number,
      dirX: number, dirY: number,  // normalised cursor direction
      force: number,
    ): void {
      const gx = Math.round((cssX / W) * GW);
      const gy = Math.round((cssY / H) * GH);

      for (let dy = -CURSOR_R; dy <= CURSOR_R; dy++) {
        for (let dx = -CURSOR_R; dx <= CURSOR_R; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx < 1 || nx >= GW - 1 || ny < 1 || ny >= GH - 1) continue;

          /* Elongated ellipse: 1.6× along movement, 0.65× perpendicular */
          const along = dx * dirX + dy * dirY;
          const perp  = dx * (-dirY) + dy * dirX;
          const ed    = Math.sqrt((along / 1.6) ** 2 + (perp / 0.65) ** 2);

          if (ed < CURSOR_R) {
            const falloff = Math.pow(1 - ed / CURSOR_R, 1.6);
            wH[ny * GW + nx] += force * falloff;
          }
        }
      }
    }

    /* ── OGL setup ───────────────────────────────────────
       WebGL renderer → wave texture → GLSL program.        */
    const renderer = new Renderer({
      alpha:           false,
      antialias:       false,
      powerPreference: 'high-performance',
    });
    const gl = renderer.gl;
    gl.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(gl.canvas);

    /* Wave height texture: 200×160 RGBA uint8, LINEAR filtered,
       uploaded every frame from the CPU simulation buffer.  */
    const waveTex = new Texture(gl, {
      image:           TEX,
      width:           GW,
      height:          GH,
      type:            gl.UNSIGNED_BYTE,
      format:          gl.RGBA,
      internalFormat:  gl.RGBA,
      generateMipmaps: false,
      minFilter:       gl.LINEAR,
      magFilter:       gl.LINEAR,
      wrapS:           gl.CLAMP_TO_EDGE,
      wrapT:           gl.CLAMP_TO_EDGE,
    });

    /* GLSL program — all seasonal uniforms set once at mount */
    const program = new Program(gl, {
      vertex:   VERT,
      fragment: FRAG,
      uniforms: {
        u_time:       { value: 0 },
        u_resolution: { value: [W, H] },
        u_waveTex:    { value: waveTex },
        u_waveRes:    { value: [GW, GH] },

        u_stone:      { value: sp.stone     as [number,number,number] },
        u_stoneRough: { value: sp.stoneRough },
        u_skyHigh:    { value: sp.skyHigh   as [number,number,number] },
        u_skyLow:     { value: sp.skyLow    as [number,number,number] },
        u_reflectStr: { value: sp.reflectStr },

        u_causticCol: { value: sp.causticCol as [number,number,number] },
        u_causticStr: { value: sp.causticStr },

        u_refraction: { value: sp.refraction },
        u_tint:       { value: sp.tintColor  as [number,number,number] },
        u_tintAmt:    { value: sp.tintAmt },

        u_haze:       { value: sp.haze },
        u_specular:   { value: sp.specular },
      },
    });

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    /* ── Resize ───────────────────────────────────────── */
    function resize() {
      W = container!.clientWidth;
      H = container!.clientHeight;
      renderer.setSize(W, H);
      (program.uniforms as Record<string, { value: unknown }>).u_resolution.value = [W, H];
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    /* ── Mouse ────────────────────────────────────────── */
    const mouse = { x: 0, y: 0, px: 0, py: 0, inside: false };

    function onMove(e: MouseEvent): void {
      const rect = gl.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (mouse.inside) {
        const vx = x - mouse.px;
        const vy = y - mouse.py;
        const speed = Math.sqrt(vx * vx + vy * vy);

        if (speed > 1.2) {
          // Force: linear with speed, capped — slow finger = gentle
          const force = Math.min(speed * 0.020, 0.45);
          // Normalised direction for elongated wake
          const dirX = vx / speed, dirY = vy / speed;
          injectForce(x, y, dirX, dirY, force);
        }
      }

      mouse.px = mouse.x; mouse.py = mouse.y;
      mouse.x  = x; mouse.y = y;
      mouse.inside = true;
    }
    function onLeave(): void { mouse.inside = false; }

    gl.canvas.addEventListener('mousemove', onMove);
    gl.canvas.addEventListener('mouseleave', onLeave);

    /* ── Render loop ───────────────────────────────────── */
    let raf  = 0;
    let prev = 0;
    const u  = program.uniforms as Record<string, { value: unknown }>;

    function tick(ms: number): void {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((ms - prev) / 1000, 0.05);
      prev = ms;

      stepWave(dt);

      // Push updated height field to GPU
      waveTex.image      = TEX;
      waveTex.needsUpdate = true;

      u.u_time.value = ms * 0.001;
      renderer.render({ scene: mesh });
    }
    raf = requestAnimationFrame(tick);

    /* ── Cleanup ──────────────────────────────────────── */
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.canvas.removeEventListener('mousemove', onMove);
      gl.canvas.removeEventListener('mouseleave', onLeave);
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    />
  );
}
