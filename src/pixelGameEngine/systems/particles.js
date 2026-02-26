import { camera } from '../world.js';
import { blendPixel } from '../renderer.js';
import { paletteRGBA, LOGICAL_W, LOGICAL_H, WORLD_OFFSET_Y } from '../config.js';

const MAX_PARTICLES = 256;
const _particles = Array.from({ length: MAX_PARTICLES }, () => ({
  active: false, x: 0, y: 0, vx: 0, vy: 0,
  life: 0, maxLife: 1, color: 20, gravity: 0, size: 1,
}));

// Shared particle property initializer used by both the normal and
// eviction paths of emitParticle.
export function _initParticle(p, x, y, vx, vy, life, colorIdx, gravity, size) {
  p.active = true;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.maxLife = life;
  p.color = colorIdx; p.gravity = gravity; p.size = size;
}

export function emitParticle(x, y, vx, vy, life, colorIdx, gravity = 0, size = 1) {
  // Fast path: find an inactive slot.
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!_particles[i].active) {
      _initParticle(_particles[i], x, y, vx, vy, life, colorIdx, gravity, size);
      return;
    }
  }
  // Eviction path: overwrite the particle closest to expiry.
  let oldest = null, minLife = Infinity;
  for (const p of _particles) {
    if (p.active && p.life < minLife) { minLife = p.life; oldest = p; }
  }
  if (oldest) _initParticle(oldest, x, y, vx, vy, life, colorIdx, gravity, size);
}

const _BURST_PRESETS = {
  footstep: { n:3,  cols:[11,12,23],     vxR:18, vyR:8,  vyBase:-18, life:0.22, g:80,   sz:1 },
  portal:   { n:10, cols:[25,19,18,16],  vxR:38, vyR:38, vyBase:-28, life:0.75, g:0,    sz:1 },
  hit:      { n:7,  cols:[26,27,7,20],   vxR:55, vyR:55, vyBase:-40, life:0.40, g:90,   sz:1 },
  coin:     { n:6,  cols:[7,20,5,12],    vxR:28, vyR:28, vyBase:-55, life:0.55, g:140,  sz:1 },
  sparkle:  { n:5,  cols:[19,20,17,25],  vxR:14, vyR:14, vyBase:-10, life:0.55, g:0,    sz:1 },
  smoke:    { n:4,  cols:[22,23,24,13],  vxR:10, vyR:6,  vyBase:-22, life:0.90, g:-12,  sz:2 },
  levelup:  { n:16, cols:[7,20,25,17,27],vxR:60, vyR:60, vyBase:-60, life:1.0,  g:30,   sz:1 },
  chest:    { n:12, cols:[7,5,4,20,3],   vxR:40, vyR:40, vyBase:-50, life:0.70, g:120,  sz:1 },
};

export function emitBurst(x, y, preset) {
  const p = _BURST_PRESETS[preset];
  if (!p) { console.warn('Unknown particle preset:', preset); return; }
  for (let i = 0; i < p.n; i++) {
    const vx  = (Math.random() - 0.5) * 2 * p.vxR;
    const vy  = p.vyBase + (Math.random() - 0.5) * p.vyR;
    const col = p.cols[Math.floor(Math.random() * p.cols.length)];
    const lf  = p.life * (0.6 + Math.random() * 0.8);
    emitParticle(x, y, vx, vy, lf, col, p.g, p.sz);
  }
}

export function updateParticles(delta) {
  for (const p of _particles) {
    if (!p.active) continue;
    p.life -= delta;
    if (p.life <= 0) { p.active = false; continue; }
    p.vy += p.gravity * delta;
    p.x  += p.vx * delta;
    p.y  += p.vy * delta;
  }
}

// Particles are world-space; clip to world region.
export function renderParticles() {
  for (const p of _particles) {
    if (!p.active) continue;
    const alpha = Math.max(0, p.life / p.maxLife);
    if (alpha < 0.04) continue;
    const [sx, sy] = camera.toScreen(p.x | 0, p.y | 0);
    const c = paletteRGBA[p.color];
    const s = p.size | 0;
    const x0 = Math.max(0, sx),             x1 = Math.min(LOGICAL_W, sx + s);
    const y0 = Math.max(WORLD_OFFSET_Y, sy), y1 = Math.min(LOGICAL_H, sy + s);
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++)
        blendPixel(px, py, c[0], c[1], c[2], alpha);
  }
}
