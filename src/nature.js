// nature.js - ten seeded SDF-sculpted nature props: oak, fir, snag, boulder, slab, mossrock, shrub, succulent, tulip, daisy.
// Same (kind, seed, opts) always gives the same mesh (multiplayer safe). Each prop bakes to two LODs (near/far) of non-indexed
// BufferGeometry, origin at the base centre on y=0, +y up, metres, with attributes: position, normal, color (linear: region colour x
// mottling x baked AO), aSw (sway weight 0..1) and aLf (leaf/petal mask for rim + fake subsurface). See docs/procedural-art.md.
import * as THREE from 'three';
import {sdEllipsoid, sdRoundCone, sdSphere, smin, smax, ssub, smoothstep, noise, fbm, worley, setSeed, sculptGen, simplifyGen, flattenGen} from './sculpt.js';
import {loadBake, saveBake} from './npc_cache.js';

export const NATURE_KINDS = ['oak', 'fir', 'snag', 'boulder', 'slab', 'mossrock', 'shrub', 'succulent', 'tulip', 'daisy'];
const KIT_HASH = typeof __KIT_HASH__ !== 'undefined' ? __KIT_HASH__ : 'dev';
// triangle budgets {near, far}
export const NATURE_BUDGET = {
  oak: {near: 6800, far: 1400}, fir: {near: 6800, far: 1400}, snag: {near: 6800, far: 1400},
  boulder: {near: 2400, far: 480}, slab: {near: 2400, far: 480}, mossrock: {near: 2400, far: 480},
  shrub: {near: 2400, far: 480}, succulent: {near: 2400, far: 480}, tulip: {near: 2400, far: 480}, daisy: {near: 2400, far: 480},
};

/* ---------- small helpers ---------- */
const hashStr = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const fract = x => x - Math.floor(x);
const ihash = (i, s) => fract(Math.sin(i * 127.1 + s * 311.7) * 43758.5453);
const TAU = Math.PI * 2;
const srgb2lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const lin2srgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
function hex2rgb(h) { if (Array.isArray(h)) return h; if (typeof h === 'string') h = parseInt(h.replace('#', ''), 16); return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; }
function rgb2hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function hsl2rgb([h, s, l]) {
  const f = (p, q, t) => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
}
// colour scratch helpers (linear rgb in o[0..2])
const setc = (o, c) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; };
const mixc = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; };
const mixo = (o, b, t) => mixc(o, o, b, t);
const mulo = (o, k) => { o[0] *= k; o[1] *= k; o[2] *= k; };
const normalize3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Palette: default sRGB hexes, optional override per key, seeded hue/sat/lightness jitter, stored linear.
function makePalette(base, R, over, jit) {
  const P = {};
  for (const k of Object.keys(base)) {
    const src = over && over[k] !== undefined ? over[k] : base[k];
    if (Array.isArray(src) && Array.isArray(src[0])) { P[k] = src.map(c => jitter(hex2rgb(c), R, jit)); continue; }   // list of colours (strata)
    if (Array.isArray(src) && typeof src[0] === 'string') { P[k] = src.map(c => jitter(hex2rgb(c), R, jit)); continue; }
    P[k] = jitter(hex2rgb(src), R, jit);
  }
  return P;
}
function jitter(rgb, R, jit) {
  const [h, s, l] = rgb2hsl(rgb), a = R() - 0.5, b = R() - 0.5, c = R() - 0.5;
  const o = hsl2rgb([h + a * jit, clamp(s * (1 + b * 0.25), 0, 1), clamp(l * (1 + c * 0.2), 0, 1)]);
  return [srgb2lin(o[0]), srgb2lin(o[1]), srgb2lin(o[2])];
}

/* ---------- geometry helpers ---------- */
// segment (tapered capsule) with a bounding sphere so far ones can be skipped
function mkSeg(a, b, ra, rb, k = 0.12) {
  return {ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], ra, rb, k, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, cz: (a[2] + b[2]) / 2,
    br: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(ra, rb)};
}
function segsSdf(segs) {
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], bd = Math.hypot(x - s.cx, y - s.cy, z - s.cz) - s.br;
      if (bd > d + s.k) continue;
      const sd = sdRoundCone(x, y, z, s.ax, s.ay, s.az, s.bx, s.by, s.bz, s.ra, s.rb);
      d = d >= 1e8 ? sd : smin(d, sd, s.k);
    }
    return d;
  };
}
function segsBounds(segs, margin, ground = true) {
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (const s of segs) {
    const r = Math.max(s.ra, s.rb) + margin;
    x0 = Math.min(x0, s.ax - r, s.bx - r); x1 = Math.max(x1, s.ax + r, s.bx + r);
    y0 = Math.min(y0, s.ay - r, s.by - r); y1 = Math.max(y1, s.ay + r, s.by + r);
    z0 = Math.min(z0, s.az - r, s.bz - r); z1 = Math.max(z1, s.az + r, s.bz + r);
  }
  if (ground) y0 = Math.min(y0, -margin);
  return [x0, y0, z0, x1, y1, z1];
}
const growBounds = (b, m) => [b[0] - m, b[1] - m, b[2] - m, b[3] + m, b[4] + m, b[5] + m];
// orthonormal frame with ez = dir, ey as close to `up` as possible
function frame(dir, up) {
  const ez = normalize3(dir);
  let ey = [up[0] - ez[0] * dot3(up, ez), up[1] - ez[1] * dot3(up, ez), up[2] - ez[2] * dot3(up, ez)];
  if (Math.hypot(...ey) < 1e-4) ey = [1, 0, 0];
  ey = normalize3(ey);
  return {ex: cross(ey, ez), ey, ez};
}
const seg2 = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
const scaled = (f, s) => (x, y, z) => f(x / s, y / s, z / s) * s;
const randDir = R => { const z = R() * 2 - 1, a = R() * TAU, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)]; };
// ground clip: solid only above y=-gb, and cull the cap, so the base sits cleanly on y=0
const groundClip = (d, y, cell) => Math.max(d, -(y + cell * 0.6));
const groundCull = cell => y => y < -cell * 0.15;

/* ============================================================================================================================
   Recipes. Each takes (R, pal, opts) and returns {parts:[...], ao?:sdf, aoReach}.
   part = {sdf, bounds, cell, w (triangle share weight), cull(x,y,z), shade(x,y,z,nx,ny,nz,ao,o)} ; shade fills o[0..2]=linear rgb, o[3]=sway, o[4]=leaf mask
   ============================================================================================================================ */

/* ---------- 1. oak ---------- */
const PAL_OAK = {bark: '#54402f', bark2: '#80695a', leaf: '#456d28', leaf2: '#6b9334', leafD: '#2a4c1f'};
function oak(R, P, opts) {
  const th = 1.7 + R() * 0.7, lx = (R() - 0.5) * 0.5, lz = (R() - 0.5) * 0.5, r0 = 0.3 + R() * 0.08, r1 = 0.19 + R() * 0.04;
  const segs = [], blobs = [];
  segs.push(mkSeg([0, -0.3, 0], [lx, th, lz], r0, r1, 0.2));
  const nr = 4 + (R() * 3 | 0), ra0 = R() * TAU;
  for (let i = 0; i < nr; i++) { const a = ra0 + i * TAU / nr + (R() - 0.5) * 0.6, len = 0.55 + R() * 0.4; segs.push(mkSeg([Math.cos(a) * 0.1, 0.55, Math.sin(a) * 0.1], [Math.cos(a) * len, 0.0, Math.sin(a) * len], 0.15, 0.05, 0.25)); }
  const nl = 3 + (R() * 3 | 0), la = R() * TAU;
  for (let i = 0; i < nl; i++) {
    const a = la + i * TAU / nl + (R() - 0.5) * 0.8, el = 0.5 + R() * 0.55, len = 1.0 + R() * 0.8;
    const p1 = [lx + Math.cos(a) * Math.cos(el) * len, th + Math.sin(el) * len * 0.9, lz + Math.sin(a) * Math.cos(el) * len];
    segs.push(mkSeg([lx, th - 0.1, lz], p1, 0.16, 0.1));
    const nc = 1 + (R() < 0.65 ? 1 : 0);
    for (let c = 0; c < nc; c++) {
      const a2 = a + (nc === 1 ? (R() - 0.5) * 0.6 : (c ? 1 : -1) * (0.3 + R() * 0.5)), el2 = el + (R() - 0.3) * 0.4, len2 = 0.8 + R() * 0.7;
      const p2 = [p1[0] + Math.cos(a2) * Math.cos(el2) * len2, p1[1] + Math.sin(el2) * len2, p1[2] + Math.sin(a2) * Math.cos(el2) * len2];
      segs.push(mkSeg(p1, p2, 0.1, 0.045));
      blobs.push([p2[0], p2[1] + 0.35, p2[2], 0.8 + R() * 0.35]);
      if (R() < 0.7) blobs.push([p2[0] + (R() - 0.5) * 1.2, p2[1] + 0.9 + R() * 0.5, p2[2] + (R() - 0.5) * 1.2, 0.65 + R() * 0.3]);
    }
  }
  blobs.push([lx, th + 1.9 + R() * 0.4, lz, 1.0 + R() * 0.25]);
  for (let i = 0; i < 2; i++) blobs.push([lx + (R() - 0.5) * 1.8, th + 1.3 + R() * 0.6, lz + (R() - 0.5) * 1.8, 0.8 + R() * 0.25]);
  const ph = [R() * 50, R() * 50, R() * 50];
  const trunkD = segsSdf(segs);
  const blobsD = (x, y, z) => { let d = 1e9; for (let i = 0; i < blobs.length; i++) { const b = blobs[i]; const bd = Math.hypot(x - b[0], y - b[1], z - b[2]) - b[3]; d = d > 1e8 ? bd : smin(d, bd, 0.3); } return d; };
  const canopy = (x, y, z) => {
    const d0 = blobsD(x, y, z);
    if (d0 > 0.62 || d0 < -0.62) return d0;
    const wx = x + 0.55 * (noise(x * 0.9 + ph[0], y * 0.9, z * 0.9) - 0.5), wy = y + 0.4 * (noise(x * 0.9, y * 0.9 + ph[1], z * 0.9) - 0.5), wz = z + 0.55 * (noise(x * 0.9, y * 0.9, z * 0.9 + ph[2]) - 0.5);
    let d = blobsD(wx, wy, wz);
    d -= 0.34 * fbm(x * 3.0 + ph[1], y * 3.0, z * 3.0, 2);
    d -= 0.1 * (1 - Math.abs(2 * noise(x * 5.5, y * 5.5 + ph[2], z * 5.5) - 1));
    d -= 0.17 * (1 - smoothstep(0.05, 0.6, worley(x * 2.7 + ph[0], y * 2.7, z * 2.7)));   // leaf clumps: bumps break the silhouette
    return d;
  };
  const trunk = (x, y, z) => {
    let d = trunkD(x, y, z);
    if (d < 0.15) d -= 0.045 * fbm(x * 7 + ph[0], y * 2.2, z * 7, 2);
    return d;
  };
  const cell = 0.06, tb = segsBounds(segs, 0.15);
  const cb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const b of blobs) for (let i = 0; i < 3; i++) { cb[i] = Math.min(cb[i], b[i] - b[3] - 0.9); cb[i + 3] = Math.max(cb[i + 3], b[i] + b[3] + 0.9); }
  const gc = groundCull(cell);
  const yTop = cb[4];
  const trunkPart = {
    sdf: (x, y, z) => groundClip(trunk(x, y, z), y, cell), bounds: growBounds(tb, cell * 2), cell, w: 1.0,
    cull: (x, y, z) => gc(y) || blobsD(x, y, z) < -0.55,
    shade(x, y, z, nx, ny, nz, ao, o) {
      const f = fbm(x * 9 + ph[0], y * 2.4, z * 9, 2), r = noise(x * 14, y * 3, z * 14 + ph[1]);
      mixc(o, P.bark, P.bark2, clamp(0.35 + f * 1.6 + (r - 0.5) * 0.5 + ny * 0.1, 0, 1));
      mulo(o, (0.8 + 0.35 * noise(x * 3, y * 3, z * 3)) * Math.pow(ao, 1.1));
      o[3] = y > th + 0.4 ? 0.12 : 0; o[4] = 0;
    },
  };
  const canopyPart = {
    sdf: canopy, bounds: cb, cell: 0.13, w: 4.5,
    shade(x, y, z, nx, ny, nz, ao, o) {
      const lump = 0.6 * noise(x * 4.3, y * 4.3 + ph[0], z * 4.3) + 0.4 * noise(x * 11, y * 11, z * 11 + ph[1]), big = fbm(x * 1.1, y * 1.1, z * 1.1 + ph[2], 2);
      const t = clamp(0.5 + 0.7 * ny + (lump - 0.5) * 0.9 + (y - th - 1) * 0.07, 0, 1);
      if (t < 0.5) mixc(o, P.leafD, P.leaf, t * 2); else mixc(o, P.leaf, P.leaf2, (t - 0.5) * 2);
      const cw = worley(x * 2.7 + ph[0], y * 2.7, z * 2.7); mulo(o, 0.7 + 0.5 * (1 - smoothstep(0.05, 0.6, cw)));
      o[0] *= 1 + big * 0.5; o[2] *= 1 - big * 0.3;
      mulo(o, Math.pow(ao, 1.25) * (0.75 + 0.5 * smoothstep(th, yTop, y)));
      o[3] = 0.2 + 0.8 * smoothstep(th + 0.5, yTop, y); o[4] = 1;
    },
  };
  const aoSdf = (x, y, z) => Math.min(trunkD(x, y, z), blobsD(x, y, z));
  return {parts: [trunkPart, canopyPart], ao: aoSdf, aoReach: 0.55, aoFloor: 0.3};
}

/* ---------- 2. fir ---------- */
const PAL_FIR = {bark: '#5e4733', leaf: '#244a35', leaf2: '#3d6c4a', leafD: '#14301f'};
function fir(R, P) {
  const H = 5.3 + R() * 1.7, nt = 6 + (R() * 3 | 0), R0 = 1.5 + R() * 0.4, y0 = 1.0 + R() * 0.4, tiers = [];
  for (let i = 0; i < nt; i++) {
    const f = i / (nt - 1), apex = y0 + 0.55 + f * (H - y0 - 1.2);
    const Ri = R0 * Math.pow(1 - f * 0.9, 0.9) + 0.12, drop = 0.88 - 0.3 * f + 0.25 * R();
    tiers.push({apex, R: Ri, drop, lobes: 7 + (R() * 5 | 0), ph: R() * TAU, sd: R() * 20, lo: apex - drop - 0.25, hi: apex + 0.25});
  }
  const ph = R() * 30, th = 0.03;
  const tierD = (T, x, y, z) => {
    const dy = y > T.hi ? y - T.hi : y < T.lo ? T.lo - y : 0;
    if (dy > 0.25) return dy;
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const tt = fract(T.lobes * a / TAU + T.ph), lobe = Math.pow(1 - Math.abs(2 * tt - 1), 1.6);
    const tooth = Math.abs(2 * fract(T.lobes * 4 * a / TAU + T.ph * 3) - 1);
    const Rt = T.R * (0.7 + 0.26 * lobe + 0.1 * tooth + 0.2 * (noise(Math.cos(a) * 2.1 + T.sd, Math.sin(a) * 2.1, T.sd) - 0.5));
    const my = T.apex - 0.28 * T.drop, by = T.apex - T.drop * (0.8 + 0.4 * lobe) - 0.12 * tooth * smoothstep(0.5, 1, r / T.R);
    let d = Math.min(seg2(r, y, 0, T.apex - 0.02, Rt * 0.5, my), seg2(r, y, Rt * 0.5, my, Rt, by)) - (0.13 + 0.04 * (1 - r / (Rt + 0.01)));
    d += 0.05 * Math.cos(T.lobes * 2 * a + T.ph) * smoothstep(0.1, 0.5, r / Rt);
    d -= 0.04 * fbm(x * 4 + T.sd, y * 4, z * 4, 2);
    return d;
  };
  const tiersSd = (x, y, z) => { let d = 1e9; for (const T of tiers) d = Math.min(d, tierD(T, x, y, z)); return d; };
  const trunkSeg = [mkSeg([0, -0.3, 0], [0, H, 0], 0.24, 0.025, 0.1)];
  const trunkD = segsSdf(trunkSeg);
  const tcell = 0.085, ccell = 0.06, Rmax = R0 + 0.6, gc = groundCull(ccell);
  const trunkPart = {
    sdf: (x, y, z) => groundClip(trunkD(x, y, z) - 0.025 * fbm(x * 8 + ph, y * 2, z * 8, 2), y, ccell),
    bounds: [-0.5, -0.1, -0.5, 0.5, H + 0.2, 0.5], cell: ccell, w: 0.7,
    cull: (x, y, z) => gc(y) || tiersSd(x, y, z) < -0.1,
    shade(x, y, z, nx, ny, nz, ao, o) {
      setc(o, P.bark); mulo(o, (1.1 + 0.6 * noise(x * 10, y * 2, z * 10)) * Math.pow(ao, 0.6)); o[3] = 0; o[4] = 0;
    },
  };
  const tierPart = {
    sdf: tiersSd, bounds: [-Rmax, y0 - 0.5, -Rmax, Rmax, H + 0.3, Rmax], cell: tcell, farCell: tcell * 2.0, w: 3.0,
    shade(x, y, z, nx, ny, nz, ao, o) {
      const r = Math.hypot(x, z), fy = (y - y0) / (H - y0);
      const t = clamp(0.35 + 0.5 * ny + (noise(x * 5, y * 5, z * 5 + ph) - 0.5) * 0.7 + smoothstep(0.3, 1.4, r) * 0.15 * (1 - fy), 0, 1);
      if (t < 0.45) mixc(o, P.leafD, P.leaf, t / 0.45); else mixc(o, P.leaf, P.leaf2, (t - 0.45) / 0.55);
      mulo(o, Math.pow(ao, 1.3) * (0.85 + 0.3 * fy));
      o[3] = 0.25 + 0.75 * smoothstep(0.1, 1.4, r) * (0.5 + 0.5 * fy); o[4] = 1;
    },
  };
  return {parts: [trunkPart, tierPart], ao: (x, y, z) => Math.min(trunkD(x, y, z), tiersSd(x, y, z)), aoReach: 0.5, aoFloor: 0.25, projectK: 0};
}

/* ---------- 3. snag (dead twisted tree) ---------- */
const PAL_SNAG = {bark: '#5a5249', bark2: '#9a9284', dark: '#2a2420', wood: '#b9a98c'};
function snag(R, P) {
  const H = 4.2 + R() * 1.6, tw = (R() < 0.5 ? -1 : 1) * (0.9 + R() * 1.1), lobes = 2 + (R() * 2 | 0), r0 = 0.3 + R() * 0.07;
  const leanx = (R() - 0.5) * 0.9, leanz = (R() - 0.5) * 0.9, ph = R() * TAU, nz = R() * 40;
  const ctr = y => { const t = y / H; return [leanx * t * t + 0.12 * Math.sin(y * 1.2 + ph) * t, leanz * t * t + 0.12 * Math.cos(y * 1.1 + ph) * t]; };
  const rad = y => r0 * Math.pow(1 - 0.7 * clamp(y / H, 0, 1), 1.1) * (1 + 0.9 * Math.exp(-y / 0.4));
  const brk = [(R() - 0.5) * 0.6, (R() - 0.5) * 0.6];
  // branches: random walks of 3 segments
  const segs = [];
  const nb = 5 + (R() * 3 | 0);
  for (let i = 0; i < nb; i++) {
    const hy = H * (0.3 + 0.5 * (i + R() * 0.7) / nb), c = ctr(hy), a = R() * TAU;
    let dir = normalize3([Math.cos(a), 0.2 + R() * 0.5, Math.sin(a)]), p = [c[0] + Math.cos(a) * rad(hy) * 0.6, hy, c[1] + Math.sin(a) * rad(hy) * 0.6];
    let rr = Math.max(0.075, rad(hy) * 0.55), segn = 3 + (R() * 2 | 0);
    const len = 0.45 + R() * 0.5;
    for (let s = 0; s < segn; s++) {
      dir = normalize3([dir[0] + (R() - 0.5) * 0.9, dir[1] + (R() - 0.45) * 0.6, dir[2] + (R() - 0.5) * 0.9]);
      const q = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len], r2 = Math.max(0.05, rr * 0.62);
      segs.push(mkSeg(p, q, rr, r2, 0.06));
      if (s === 1 && R() < 0.7) { const d2 = normalize3([-dir[2] + (R() - 0.5), dir[1] * 0.5 + 0.3, dir[0] + (R() - 0.5)]); segs.push(mkSeg(q, [q[0] + d2[0] * len * 0.8, q[1] + d2[1] * len * 0.8, q[2] + d2[2] * len * 0.8], Math.max(0.05, r2 * 0.8), 0.05, 0.05)); }
      p = q; rr = r2;
    }
  }
  const bd = segsSdf(segs);
  const kc = Math.min(1.8, H * 0.35), kn = normalize3([Math.cos(ph * 3), 0, Math.sin(ph * 3)]);
  const trunk = (x, y, z) => {
    const c = ctr(y), px = x - c[0], pz = z - c[1], cs = Math.cos(tw * y), sn = Math.sin(tw * y);
    const bx = cs * px - sn * pz, bz = sn * px + cs * pz, r = Math.hypot(px, pz), th = Math.atan2(bz, bx);
    const lobe = 0.13 * Math.cos(lobes * th) + 0.06 * Math.cos((lobes * 2 + 1) * th + y * 0.7);
    let d = (r - rad(y) * (1 + lobe)) * 0.78;
    // broken, splintered top
    const ty = H + 0.4 * (px * brk[0] + pz * brk[1]) / 0.3 + 0.28 * (noise(x * 9 + nz, z * 9, y * 2) - 0.5);
    d = smax(d, y - ty, 0.03);
    // hollow knot
    d = ssub(d, sdSphere(x - kn[0] * rad(kc) * 1.0 - c[0], y - kc, z - kn[2] * rad(kc) * 1.0 - c[1], 0.17), 0.06);
    return d;
  };
  const sd = (x, y, z) => {
    let d = trunk(x, y, z);
    if (segs.length) { const e = bd(x, y, z); d = smin(d, e, 0.07); }
    if (d < 0.15) { const cs = Math.cos(tw * y), sn = Math.sin(tw * y); d += 0.032 * (1 - Math.abs(2 * noise((cs * x - sn * z) * 9, y * 1.2, (sn * x + cs * z) * 9 + nz) - 1)) - 0.016; }
    return d;
  };
  const cell = 0.055, b = segsBounds(segs, 0.15); b[0] = Math.min(b[0], -0.7); b[2] = Math.min(b[2], -0.7); b[3] = Math.max(b[3], 0.7); b[5] = Math.max(b[5], 0.7); b[4] = Math.max(b[4], H + 0.5);
  const gc = groundCull(cell);
  const part = {
    sdf: (x, y, z) => groundClip(sd(x, y, z), y, cell), bounds: growBounds(b, cell * 2), cell, w: 1, cull: (x, y, z) => gc(y),
    shade(x, y, z, nx, ny, nz2, ao, o) {
      const cs = Math.cos(tw * y), sn = Math.sin(tw * y);
      const rg = 1 - Math.abs(2 * noise((cs * x - sn * z) * 9, y * 1.2, (sn * x + cs * z) * 9 + nz) - 1), w = fbm(x * 2.5, y * 1.6, z * 2.5 + nz, 2) + 0.5;
      mixc(o, P.bark, P.bark2, clamp(rg * 0.7 + (w - 0.5) * 0.9 + ny * 0.15 - 0.15, 0, 1));
      if (y > H - 0.5 && Math.hypot(x, z) < 0.35) mixo(o, P.wood, 0.5);
      mixo(o, P.dark, clamp((1 - rg) * 0.5 - 0.1 + (1 - ao) * 0.5, 0, 0.8));
      mulo(o, (0.8 + 0.4 * noise(x * 4, y * 4, z * 4)) * Math.pow(ao, 0.9));
      o[3] = 0.35 * clamp((Math.hypot(x, z) - 0.5) / 1.4, 0, 1) * smoothstep(1.5, H, y); o[4] = 0;
    },
  };
  return {parts: [part], ao: sd, aoReach: 0.4, aoFloor: 0.2};
}

/* ---------- 4. boulder (rounded granite) ---------- */
const PAL_BOULDER = {stone: '#7f7c77', stone2: '#a29d94', dark: '#46433f', lichen: '#9ba37a', lichen2: '#c49a52'};
function boulder(R, P, opts) {
  const size = opts.size || (0.7 + 1.7 * Math.pow(R(), 1.3)), s = size / 2.1;
  const rx = 0.9 + R() * 0.3, ry = 0.55 + R() * 0.3, rz = 0.8 + R() * 0.3, cy = ry * 0.78;
  const planes = [];
  for (let i = 0; i < 5; i++) { const n = randDir(R); if (n[1] < -0.2) n[1] = -n[1] * 0.3; planes.push({n: normalize3(n), off: 0.62 + R() * 0.22}); }
  const ph = [R() * 50, R() * 50, R() * 50];
  const f = (x, y, z) => {
    let d = sdEllipsoid(x, y - cy, z, rx, ry, rz);
    for (const p of planes) d = smax(d, p.n[0] * x + p.n[1] * (y - cy) + p.n[2] * z - p.off, 0.22);
    if (d > 0.5) return d;
    d -= 0.3 * fbm(x * 1.5 + ph[0], y * 1.5, z * 1.5, 3);
    d -= 0.07 * fbm(x * 4 + ph[1], y * 4, z * 4, 2);
    const w = worley(x * 3.1 + ph[2], y * 3.1, z * 3.1);
    d += 0.05 * smoothstep(0.32, 0.0, w) - 0.015 * smoothstep(0.55, 0.3, w);
    return d * 0.85;
  };
  const sdf = scaled(f, s), cell = Math.max(0.035, s * 0.055), ext = 1.5 * s, gc = groundCull(cell);
  const part = {
    sdf: (x, y, z) => groundClip(sdf(x, y, z), y, cell), bounds: [-ext * 1.1, -cell * 3, -ext * 1.1, ext * 1.1, cy * s + ry * s * 1.5, ext * 1.1], cell, w: 1, cull: (x, y, z) => gc(y),
    shade(x, y, z, nx, ny, nz, ao, o) {
      const u = x / s, v = y / s, w = z / s;
      const sp = noise(u * 22, v * 22, w * 22 + ph[0]), big = fbm(u * 2, v * 2, w * 2 + ph[1], 3) + 0.5;
      mixc(o, P.stone, P.stone2, clamp(big * 1.1 + (sp - 0.5) * 0.5 - 0.15, 0, 1));
      mixo(o, P.dark, clamp((0.5 - sp) * 1.2 + (1 - ao) * 0.5, 0, 0.55));
      const lc = noise(u * 3.2 + ph[2], v * 3.2, w * 3.2) + 0.25 * noise(u * 14, v * 14, w * 14) + ny * 0.25 - 0.4;
      if (lc > 0.5) mixo(o, noise(u * 7, v * 7 + 3, w * 7) > 0.6 ? P.lichen2 : P.lichen, clamp((lc - 0.5) * 5, 0, 0.75));
      mulo(o, Math.pow(ao, 1.0) * (0.9 + 0.25 * ny)); o[3] = 0; o[4] = 0;
    },
  };
  return {parts: [part], ao: sdf, aoReach: 0.12 * size, aoFloor: 0.3};
}

/* ---------- 5. slab (layered sedimentary outcrop) ---------- */
const PAL_SLAB = {strata: ['#8c8274', '#a79d88', '#6c6760', '#b5ab98'], rust: '#80583c', dark: '#3e3832', moss: '#6b7a3c'};
function slab(R, P, opts) {
  const size = opts.size || (1.3 + 1.3 * Math.pow(R(), 1.2)), s = size / 2.0;
  const ax = 0.85 + R() * 0.5, az = 0.85 + R() * 0.5, planes = [];
  const ns = 6 + (R() * 3 | 0);
  for (let i = 0; i < ns; i++) { const a = i * TAU / ns + (R() - 0.5) * 0.6, t = (R() - 0.5) * 0.3; planes.push([Math.cos(a) * Math.cos(t), -Math.sin(t), Math.sin(a) * Math.cos(t), 0.55 + R() * 0.3]); }
  for (let i = 0; i < 3; i++) { const n = normalize3([(R() - 0.5) * 0.35, 1, (R() - 0.5) * 0.35]); planes.push([n[0], n[1], n[2], 1.0 + R() * 0.3]); }
  const lh = 0.17 + R() * 0.08, loff = R(), ph = [R() * 50, R() * 50, R() * 50], sd0 = R() * 99;
  const cracks = []; for (let i = 0; i < 2; i++) { const a = R() * TAU; cracks.push([Math.cos(a), Math.sin(a), (R() - 0.5) * 0.7, R() * 20]); }
  const layerOf = yy => Math.floor((yy + loff) / lh);
  const f = (x, y, z) => {
    const px = x / ax, pz = z / az;
    let d = -1e9;
    for (const p of planes) d = smax(d, p[0] * px + p[1] * y + p[2] * pz - p[3], 0.05);
    d *= 0.9;
    if (d > 0.35) return d;
    const q = (y + loff + 0.14 * fbm(x * 1.2 + ph[2], y * 0.6, z * 1.2, 2)) / lh, idx = Math.floor(q), fr = q - idx;
    // weathered strata: each bed recedes by its own amount, eroded unevenly along its length, with a softened (not sawtooth) lip
    const hardness = 0.25 + 1.5 * ihash(idx, sd0 + 5), ero = 0.35 + 1.3 * noise(x * 3 + ph[0], idx * 1.7, z * 3);
    d += 0.05 * hardness * ero * smoothstep(0.0, 0.85, fr) * (1 - 0.35 * smoothstep(0.85, 1, fr)) + 0.04 * (ihash(idx, sd0) - 0.5);
    d -= 0.03 * (1 - Math.abs(2 * noise(x * 2.5 + ph[0], y * 9, z * 2.5) - 1)) - 0.02 * fbm(x * 9, y * 9, z * 9, 2);
    d -= 0.1 * fbm(x * 2 + ph[1], y * 2, z * 2, 2);
    for (const c of cracks) {   // narrow shallow tapering fissures: warped path, width tapers with height, carve depth capped
      const path = c[0] * x + c[1] * z - c[2] + 0.16 * fbm(y * 1.6 + c[3], x * 1.3, z * 1.3, 2);
      const w = 0.05 * smoothstep(0.12, 0.6, y) * (1 - smoothstep(0.85, 1.5, y)) * (0.6 + 0.8 * noise(y * 3 + c[3], 3, 3));
      const dep = 0.1 + 0.08 * noise(y * 2 + c[3], 5, 5), cr = Math.max(Math.abs(path) - w, -(d + dep));
      d = smax(d, -cr, 0.02);
    }
    return d;
  };
  const sdf = scaled(f, s), cell = Math.max(0.035, s * 0.05), ext = 1.6 * s, gc = groundCull(cell);
  const part = {
    sdf: (x, y, z) => groundClip(sdf(x, y, z), y, cell), bounds: [-ext * ax, -cell * 3, -ext * az, ext * ax, 1.8 * s, ext * az], cell, w: 1, cull: (x, y, z) => gc(y),
    shade(x, y, z, nx, ny, nz, ao, o) {
      const u = x / s, v = y / s, w = z / s, q = (v + loff) / lh, idx = Math.floor(q), fr = q - idx;
      const pick = ihash(idx, sd0 + 3), k = Math.min(3, Math.floor(pick * P.strata.length)), c1 = P.strata[k];
      setc(o, c1);
      mixo(o, P.strata[(k + 1) % P.strata.length], clamp((noise(u * 4, v * 14, w * 4 + ph[2]) - 0.5) * 1.5 + 0.2, 0, 0.6));
      if (ihash(idx, sd0 + 9) > 0.8) mixo(o, P.rust, 0.55);
      mixo(o, P.dark, clamp((1 - fr) * 0.35 * (1 - ny) + (1 - ao) * 0.5, 0, 0.6));
      const st = noise(u * 8, v * 1.2, w * 8 + ph[0]);   // vertical rust / water streaks
      mixo(o, P.dark, clamp((0.4 - st) * 0.8, 0, 0.35) * (1 - ny));
      if (ny > 0.55) mixo(o, P.moss, clamp((noise(u * 3, v * 3, w * 3 + ph[1]) - 0.5) * 2.0 * (ny - 0.5) * 2, 0, 0.6));
      mulo(o, (0.88 + 0.25 * noise(u * 18, v * 18, w * 18)) * Math.pow(ao, 1.0)); o[3] = 0; o[4] = 0;
    },
  };
  return {parts: [part], ao: sdf, aoReach: 0.1 * size, aoFloor: 0.3};
}

/* ---------- 6. mossrock ---------- */
const PAL_MOSSROCK = {stone: '#77746d', stone2: '#9c978c', dark: '#3f3d39', moss: '#3c5e27', moss2: '#5d8230', mossD: '#25421c'};
function mossrock(R, P, opts) {
  const size = opts.size || (0.8 + 1.2 * Math.pow(R(), 1.2)), s = size / 2.4, ph = [R() * 50, R() * 50, R() * 50];
  const n = 2 + (R() * 3 | 0), st = [];
  st.push({x: 0, z: 0, rx: 0.95 + R() * 0.2, ry: 0.55 + R() * 0.2, rz: 0.8 + R() * 0.2});
  for (let i = 1; i < n; i++) { const a = R() * TAU, dd = 0.85 + R() * 0.5, sc = 0.42 + R() * 0.3; st.push({x: Math.cos(a) * dd, z: Math.sin(a) * dd, rx: sc * (0.8 + R() * 0.5), ry: sc * (0.6 + R() * 0.4), rz: sc * (0.8 + R() * 0.5)}); }
  const planes = []; for (let i = 0; i < 3; i++) { const nn = randDir(R); nn[1] = Math.abs(nn[1]) * 0.5; planes.push({n: normalize3(nn), off: 0.7 + R() * 0.2}); }
  const base0 = (x, y, z) => { let d = 1e9; for (const t of st) { const e = sdEllipsoid(x - t.x, y - t.ry * 0.72, z - t.z, t.rx, t.ry, t.rz); d = d > 1e8 ? e : smin(d, e, 0.25); } return d; };
  const moss = (x, y, z) => {
    const e = 0.03, gx = base0(x + e, y, z) - base0(x - e, y, z), gy = base0(x, y + e, z) - base0(x, y - e, z), gz = base0(x, y, z + e) - base0(x, y, z - e);
    const up = gy / (Math.hypot(gx, gy, gz) || 1);
    return smoothstep(0.28, 0.7, up + 0.4 * fbm(x * 2.5 + ph[0], y * 2.5, z * 2.5, 2) + 0.1);
  };
  const f = (x, y, z) => {
    let d = base0(x, y, z);
    if (d > 0.4) return d;
    for (const p of planes) d = smax(d, p.n[0] * x + p.n[1] * y + p.n[2] * z - p.off * 1.3, 0.2);
    d -= 0.22 * fbm(x * 1.7 + ph[1], y * 1.7, z * 1.7, 3);
    d += 0.035 * smoothstep(0.3, 0, worley(x * 3 + ph[2], y * 3, z * 3));
    if (d < 0.18) { const m = moss(x, y, z); d -= m * (0.075 + 0.04 * noise(x * 11, y * 11, z * 11)); }
    return d * 0.88;
  };
  const sdf = scaled(f, s), cell = Math.max(0.035, s * 0.055), ext = 2.0 * s, gc = groundCull(cell);
  const part = {
    sdf: (x, y, z) => groundClip(sdf(x, y, z), y, cell), bounds: [-ext, -cell * 3, -ext, ext, 1.6 * s, ext], cell, w: 1, cull: (x, y, z) => gc(y),
    shade(x, y, z, nx, ny, nz, ao, o) {
      const u = x / s, v = y / s, w = z / s, m = moss(u, v, w);
      const sp = noise(u * 20, v * 20, w * 20);
      mixc(o, P.stone, P.stone2, clamp(fbm(u * 2, v * 2, w * 2 + ph[1], 3) * 1.2 + 0.5 + (sp - 0.5) * 0.4, 0, 1));
      mixo(o, P.dark, clamp((0.5 - sp) * 0.9 + (1 - ao) * 0.5, 0, 0.5));
      const mm = smoothstep(0.35, 0.75, m);
      if (mm > 0) {
        const t = clamp(noise(u * 8, v * 8, w * 8 + ph[0]) * 1.3 + (ny - 0.5) * 0.4, 0, 1), c = [0, 0, 0];
        if (t < 0.5) mixc(c, P.mossD, P.moss, t * 2); else mixc(c, P.moss, P.moss2, (t - 0.5) * 2);
        mixo(o, c, mm);
      }
      mulo(o, Math.pow(ao, 1.0) * (0.92 + 0.2 * ny)); o[3] = 0; o[4] = 0.3 * mm;
    },
  };
  return {parts: [part], ao: sdf, aoReach: 0.12 * size, aoFloor: 0.3};
}

/* ---------- 7. shrub ---------- */
const PAL_SHRUB = {leaf: '#37692f', leaf2: '#5c9238', leafD: '#1f4426', stem: '#5a4630', berry: '#b3262d'};
function shrub(R, P, opts) {
  const sc = opts.size ? opts.size / 1.0 : 1, Rs = (0.38 + R() * 0.18) * sc, Hs = (0.6 + R() * 0.3) * sc, nb = 44 + (R() * 14 | 0);
  const ph = [R() * 40, R() * 40, R() * 40], blobs = [], segs = [];
  for (let i = 0; i < nb; i++) {
    let d = randDir(R); if (d[1] < 0.02) d[1] = -d[1] * 0.4 + 0.02;
    const rr = 0.45 + R() * 0.55, c = [d[0] * Rs * rr, Hs * 0.5 + d[1] * Hs * 0.55 * rr, d[2] * Rs * rr], r = (0.1 + R() * 0.07) * sc;
    c[1] = Math.max(c[1], r * 0.75 + 0.04 * sc);
    const n = normalize3([c[0] / Rs, (c[1] - Hs * 0.45) / Hs, c[2] / Rs]), fr = frame(n, [0, 1, 0]);
    blobs.push({c, r, fr, tint: R(), s: [r * 1.1, r * 0.8, r * 1.0]});
  }
  const nt = 7 + (R() * 3 | 0);
  for (let i = 0; i < nt; i++) { const b = blobs[(i * 4 + (R() * 3 | 0)) % blobs.length]; segs.push(mkSeg([(R() - 0.5) * 0.08, -0.05, (R() - 0.5) * 0.08], [b.c[0] * 0.8, b.c[1] * 0.85, b.c[2] * 0.8], 0.032 * sc, 0.024 * sc, 0.05)); }
  const twD = segsSdf(segs);
  const blobD = (b, x, y, z) => {
    const dx = x - b.c[0], dy = y - b.c[1], dz = z - b.c[2], f = b.fr;
    return sdEllipsoid(dx * f.ex[0] + dy * f.ex[1] + dz * f.ex[2], dx * f.ey[0] + dy * f.ey[1] + dz * f.ey[2], dx * f.ez[0] + dy * f.ez[1] + dz * f.ez[2], b.s[0], b.s[1], b.s[2]);
  };
  const leaves = (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < blobs.length; i++) { const b = blobs[i], bd = Math.hypot(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r * 1.2; if (bd > d + 0.05) continue; const e = blobD(b, x, y, z); d = d > 1e8 ? e : smin(d, e, 0.045); }
    return d;
  };
  const sdf = (x, y, z) => {
    let d = smin(leaves(x, y, z), twD(x, y, z), 0.03);
    if (d < 0.05) d -= 0.012 * (1 - Math.abs(2 * noise(x * 20 + ph[0], y * 20, z * 20) - 1));
    return d;
  };
  const cell = 0.028 * sc, ext = Rs + 0.3 * sc, gc = groundCull(cell);
  const nearest = (x, y, z) => { let bi = 0, bd = 1e9; for (let i = 0; i < blobs.length; i++) { const b = blobs[i], d = Math.hypot(x - b.c[0], y - b.c[1], z - b.c[2]) / b.r; if (d < bd) { bd = d; bi = i; } } return [bi, bd]; };
  const part = {
    sdf: (x, y, z) => groundClip(sdf(x, y, z), y, cell), bounds: [-ext, -cell * 3, -ext, ext, Hs + 0.35 * sc, ext], cell, w: 1, cull: (x, y, z) => gc(y),
    shade(x, y, z, nx, ny, nz, ao, o) {
      const [bi, bd] = nearest(x, y, z);
      if (bd > 1.35 && y < Hs * 0.35) { setc(o, P.stem); mulo(o, (0.8 + 0.4 * noise(x * 30, y * 8, z * 30)) * ao); o[3] = 0; o[4] = 0; return; }
      const b = blobs[bi], t = clamp(b.tint * 0.6 + 0.2 + ny * 0.25 + (noise(x * 14, y * 14, z * 14 + ph[1]) - 0.5) * 0.5, 0, 1);
      if (t < 0.45) mixc(o, P.leafD, P.leaf, t / 0.45); else mixc(o, P.leaf, P.leaf2, (t - 0.45) / 0.55);
      mulo(o, Math.pow(ao, 1.3) * (0.8 + 0.4 * clamp(y / Hs, 0, 1)));
      o[3] = 0.25 + 0.75 * clamp(y / (Hs + 0.2), 0, 1); o[4] = 1;
    },
  };
  return {parts: [part], ao: sdf, aoReach: 0.12 * sc, aoFloor: 0.25};
}

/* ---------- 8. succulent (agave / aloe rosette) ---------- */
const PAL_SUCC = {leaf: '#4a8a78', leaf2: '#9cc98a', tip: '#7a3a44', edge: '#c9d9a2'};
function succulent(R, P, opts) {
  const n = 11 + (R() * 5 | 0), sc = opts.size ? opts.size / 0.8 : 1, Lmax = (0.4 + R() * 0.15) * sc, ph = [R() * 40, R() * 40], curlK = 0.4 + R() * 0.5, a0 = R() * TAU, leaves = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), th = a0 + i * 2.39996323, phi = 0.2 + 1.15 * Math.pow(t, 0.8) + (R() - 0.5) * 0.1;
    const dir = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
    const up = [0, Math.sin(phi), 0], inw = [-Math.cos(th) * Math.cos(phi), 0, -Math.sin(th) * Math.cos(phi)];
    const fr = frame(dir, [up[0] + inw[0], up[1] + inw[1], up[2] + inw[2]]);
    const L = Lmax * (0.5 + 0.5 * Math.sin(Math.PI * (0.2 + 0.8 * t))) * (0.9 + R() * 0.2);
    const b = [Math.cos(th) * 0.015 * sc, 0.02 * sc, Math.sin(th) * 0.015 * sc];
    leaves.push({b, fr, L, curl: curlK * (0.3 + 0.8 * t) / (L + 0.1), t, wd: 0.95 + R() * 0.3, cx: b[0] + dir[0] * L / 2, cy: b[1] + dir[1] * L / 2, cz: b[2] + dir[2] * L / 2, br: L * 0.65 + 0.1 * sc});
  }
  const local = (l, x, y, z, out) => {
    const dx = x - l.b[0], dy = y - l.b[1], dz = z - l.b[2], f = l.fr;
    out[0] = dx * f.ex[0] + dy * f.ex[1] + dz * f.ex[2]; out[1] = dx * f.ey[0] + dy * f.ey[1] + dz * f.ey[2]; out[2] = dx * f.ez[0] + dy * f.ez[1] + dz * f.ez[2];
  };
  const q = [0, 0, 0];
  const leafD = (l, x, y, z) => {
    local(l, x, y, z, q);
    const u = clamp(q[2] / l.L, 0, 1), wp = (0.28 + 0.72 * Math.sin(Math.PI * Math.pow(u, 0.5))) * l.wd, ly = q[1] + l.curl * q[2] * q[2];
    return sdRoundCone(q[0] / (2.1 * wp), ly * 1.9, q[2], 0, 0, 0, 0, 0, l.L, 0.085 * sc, 0.02 * sc) * 0.4;
  };
  const sdf = (x, y, z) => {
    let d = sdEllipsoid(x, y - 0.03 * sc, z, 0.05 * sc, 0.06 * sc, 0.05 * sc);
    for (let i = 0; i < n; i++) { const l = leaves[i], bd = Math.hypot(x - l.cx, y - l.cy, z - l.cz) - l.br; if (bd > d + 0.04) continue; d = smin(d, leafD(l, x, y, z), 0.015); }
    return d;
  };
  const cell = 0.017 * sc, ext = Lmax * 1.15 + 0.05, gc = groundCull(cell);
  const part = {
    sdf: (x, y, z) => groundClip(sdf(x, y, z), y, cell), bounds: [-ext, -cell * 3, -ext, ext, Lmax * 1.1 + 0.1, ext], cell, w: 1, cull: (x, y, z) => gc(y),
    shade(x, y, z, nx, ny, nz, ao, o) {
      let bi = 0, bd = 1e9; for (let i = 0; i < n; i++) { const d = leafD(leaves[i], x, y, z); if (d < bd) { bd = d; bi = i; } }
      const l = leaves[bi]; local(l, x, y, z, q); const u = clamp(q[2] / l.L, 0, 1);
      mixc(o, P.leaf, P.leaf2, clamp(1 - l.t * 1.3 + (noise(x * 6, y * 6, z * 6 + ph[0]) - 0.5) * 0.4, 0, 1));
      mulo(o, 0.88 + 0.2 * Math.sin(q[0] * 90 / sc) * 0.5);   // faint ribbing along the leaf
      mixo(o, P.tip, smoothstep(0.82, 0.97, u));
      mixo(o, P.edge, clamp(smoothstep(0.55, 1.0, Math.abs(q[0]) / (0.03 * sc + 0.1 * sc * Math.sin(Math.PI * Math.pow(u, 0.5)))) * 0.35, 0, 0.35));
      mulo(o, Math.pow(ao, 1.2)); o[3] = 0.15 + 0.4 * u * l.t; o[4] = 0.75;
    },
  };
  return {parts: [part], ao: sdf, aoReach: 0.07 * sc, aoFloor: 0.25};
}

/* ---------- flowers (tulip, daisy): each stem and each head is its own small part at its own cell size ---------- */
const PAL_TULIP = {petal: ['#d8283a', '#f2c230', '#e86aa0', '#8a3fb0', '#f08030'], petal2: '#ffffff', stem: '#4f8a3a', leaf: '#4a8845', inner: '#3a1020'};
const PAL_DAISY = {petal: '#f6f3ea', disc: '#ebb81c', disc2: '#a8660c', stem: '#5a8f3c', leaf: '#4c8a3d', tint: '#e6b8c8'};
// stem: 3-segment curve from base to head; returns {pts, segs}
function stemCurve(R, base, hx, hy, hz, r0, r1) {
  const bend = [(R() - 0.5) * 0.08, (R() - 0.5) * 0.08], pts = [base];
  for (let i = 1; i <= 3; i++) { const t = i / 3, w = Math.sin(t * Math.PI) * 0.5; pts.push([base[0] + (hx - base[0]) * t * t * (3 - 2 * t) + bend[0] * w, base[1] + (hy - base[1]) * t, base[2] + (hz - base[2]) * t * t * (3 - 2 * t) + bend[1] * w]); }
  const segs = [];
  for (let i = 0; i < 3; i++) segs.push(mkSeg(pts[i], pts[i + 1], r0 + (r1 - r0) * i / 3, r0 + (r1 - r0) * (i + 1) / 3, 0.01));
  return {pts, segs};
}
// flat strap/lance leaf from p0 along dir with arch
function mkBlade(p0, dir, L, hw, ht, arch, fatten) {
  const fr = frame(dir, [0, 1, 0]);
  const b = {p: p0, fr, L, hw, ht, arch, cx: p0[0] + fr.ez[0] * L * 0.5, cy: p0[1] + fr.ez[1] * L * 0.5, cz: p0[2] + fr.ez[2] * L * 0.5, br: L * 0.6 + hw};
  return b;
}
const bq = [0, 0, 0];
function bladeD(b, x, y, z) {
  const dx = x - b.p[0], dy = y - b.p[1], dz = z - b.p[2], f = b.fr;
  const lx = dx * f.ex[0] + dy * f.ex[1] + dz * f.ex[2], ly = dx * f.ey[0] + dy * f.ey[1] + dz * f.ey[2], lz = dx * f.ez[0] + dy * f.ez[1] + dz * f.ez[2];
  const u = clamp(lz / b.L, 0, 1), wp = 0.35 + 0.65 * Math.sin(Math.PI * Math.pow(u, 0.6)), yy = ly + b.arch * lz * lz;
  const r = b.ht;
  return sdRoundCone(lx * (r / (b.hw * wp + 1e-4)), yy, lz, 0, 0, 0, 0, 0, b.L, r, r * 0.35) * (b.hw * wp / r > 1 ? 1 : 0.5 + 0.5 * (b.hw * wp / r)) ;
}
function bladesSdf(blades, k) { return (x, y, z) => { let d = 1e9; for (const b of blades) { const bd = Math.hypot(x - b.cx, y - b.cy, z - b.cz) - b.br; if (bd > d + k) continue; const e = bladeD(b, x, y, z); d = d > 1e8 ? e : smin(d, e, k); } return d; }; }
function boundsOfPts(pts, m) { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const p of pts) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], p[i] - m); b[i + 3] = Math.max(b[i + 3], p[i] + m); } return b; }

// head frame: ey along the head axis, rolled about it; the world<->unit-space map for prototype heads is  p = tip + hs * (lx*ex + ly*ey + lz*ez)
function headFrame(axis, roll) {
  const f0 = frame(axis, [0, 0, 1]), ex = f0.ey, ey = f0.ez, ez = f0.ex, c = Math.cos(roll), sn = Math.sin(roll);
  return {ex: [0, 1, 2].map(q => c * ex[q] + sn * ez[q]), ey, ez: [0, 1, 2].map(q => -sn * ex[q] + c * ez[q])};
}
const headWorld = (fr, tip, hs, local) => (x, y, z) => {
  const dx = (x - tip[0]) / hs, dy = (y - tip[1]) / hs, dz = (z - tip[2]) / hs;
  return local(dx * fr.ex[0] + dy * fr.ex[1] + dz * fr.ex[2], dx * fr.ey[0] + dy * fr.ey[1] + dz * fr.ey[2], dx * fr.ez[0] + dy * fr.ez[1] + dz * fr.ez[2]) * hs;
};
const toLocal = (fr, tip, hs, x, y, z) => {
  const dx = (x - tip[0]) / hs, dy = (y - tip[1]) / hs, dz = (z - tip[2]) / hs;
  return [dx * fr.ex[0] + dy * fr.ex[1] + dz * fr.ex[2], dx * fr.ey[0] + dy * fr.ey[1] + dz * fr.ey[2], dx * fr.ez[0] + dy * fr.ez[1] + dz * fr.ez[2]];
};
// tulip head in unit space: 3 outer + 3 inner cupped petals, rounded tips, walls ~0.01 thick
function tulipHead(lx, ly, lz) {
  const th = Math.atan2(lz, lx), c3 = Math.cos(3 * th);
  let dO = sdEllipsoid(lx, ly - 0.048, lz, 0.031, 0.052, 0.031);
  dO = smax(dO, ly - (0.088 + 0.014 * c3), 0.007);
  let dI = sdEllipsoid(lx, ly - 0.05, lz, 0.027, 0.05, 0.027);
  dI = smax(dI, ly - (0.08 - 0.013 * c3), 0.007);
  let d = smin(dO, dI, 0.006);
  d = smax(d, -sdEllipsoid(lx, ly - 0.058, lz, 0.0165, 0.056, 0.0165), 0.004);
  d += 0.0022 * smoothstep(0.1, 0.9, -c3) * smoothstep(0.03, 0.07, ly);   // shallow seams between outer petals
  return d;
}

function tulip(R, P, opts) {
  const n = 3 + (R() * 4 | 0), parts = [], sc = opts.size ? opts.size / 0.45 : 1, colA = P.petal[R() * P.petal.length | 0], colB = P.petal[R() * P.petal.length | 0], mixed = R() < 0.3;
  const rcl = 0.1 * sc + 0.03 * n;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * rcl, base = [Math.cos(a) * rr, -0.01, Math.sin(a) * rr];
    const h = (0.28 + R() * 0.24) * sc, lean = 0.05 + R() * 0.07, la = a + (R() - 0.5) * 1.2;
    const hx = base[0] + Math.cos(la) * lean * sc, hz = base[2] + Math.sin(la) * lean * sc, hy = h;
    const st = stemCurve(R, base, hx, hy, hz, 0.0115 * sc, 0.01 * sc);
    const tip = st.pts[3], tan = normalize3([tip[0] - st.pts[2][0], tip[1] - st.pts[2][1], tip[2] - st.pts[2][2]]);
    const blades = [];
    const nbld = 2, ba = R() * TAU;
    for (let k = 0; k < nbld; k++) {
      const bb = ba + k * 2.4 + (R() - 0.5) * 0.4, dir = [Math.cos(bb) * 0.55, 0.85, Math.sin(bb) * 0.55];
      blades.push(mkBlade([base[0], 0.004, base[2]], dir, (0.2 + R() * 0.12) * sc, 0.028 * sc, 0.0095 * sc, 0));
      blades[blades.length - 1].arch = (0.15 + 0.2 * R()) / blades[blades.length - 1].L;
    }
    const sdfB = bladesSdf(blades, 0.01), sdfS = segsSdf(st.segs);
    const ptsAll = [...st.pts, ...blades.flatMap(b => [b.p, [b.p[0] + b.fr.ez[0] * b.L, b.p[1] + b.fr.ez[1] * b.L - b.arch * b.L * b.L, b.p[2] + b.fr.ez[2] * b.L]])];
    const cellS = 0.0078 * sc, gc = groundCull(cellS);
    const bs = boundsOfPts(ptsAll, 0.05 * sc); bs[1] = Math.min(bs[1], -cellS * 3);
    const stemPart = {
      sdf: (x, y, z) => groundClip(smin(sdfS(x, y, z), sdfB(x, y, z), 0.01), y, cellS), bounds: bs, cell: cellS, w: 1.0, cull: (x, y, z) => gc(y),
      shade(x, y, z, nx, ny, nz, ao, o) {
        const isLeaf = bladesNear(blades, x, y, z);
        mixc(o, isLeaf ? P.leaf : P.stem, isLeaf ? P.stem : P.leaf, isLeaf ? 0 : 0.2);
        mulo(o, (0.85 + 0.3 * noise(x * 40, y * 40, z * 40)) * Math.pow(ao, 1.0) * (0.85 + 0.3 * clamp(y / h, 0, 1)));
        o[3] = isLeaf ? 0.2 + 0.5 * clamp(y / (0.25 * sc), 0, 1) : 0.8 * Math.pow(clamp(y / h, 0, 1), 1.5); o[4] = isLeaf ? 0.6 : 0.2;
      },
    };
    parts.push(stemPart);
    const colour = mixed && i % 2 ? colB : colA, pc = P.petal.indexOf(colour), pcol = pc >= 0 ? colour : colA, hs = sc * (1.3 + R() * 0.25), roll = R() * TAU;
    const fr = headFrame(tan, roll), inst = {key: 'head', fr, tip, hs};
    parts.push({
      inst, sdf: headWorld(fr, tip, hs, tulipHead), cell: 0.0033 * hs, w: 2.4,
      shade(x, y, z, nx, ny, nz, ao, o) {
        const [lx, ly, lz] = toLocal(fr, tip, hs, x, y, z), th = Math.atan2(lz, lx), c3 = Math.cos(3 * th);
        setc(o, pcol);
        mixo(o, P.petal2, clamp((ly - 0.07) * 7 + 0.12 * c3, 0, 0.3));
        mulo(o, (0.82 + 0.4 * (0.5 + 0.5 * Math.sin(th * 12 + noise(x * 30, y * 30, z * 30) * 3))) * (0.6 + 0.6 * clamp(ly * 8 + 0.2, 0, 1)));
        mixo(o, P.stem, clamp((0.012 - ly) * 30, 0, 0.9));
        mulo(o, Math.pow(ao, 1.0)); o[3] = 0.85; o[4] = 1;
      },
    });
  }
  const protos = {head: {sdf: tulipHead, bounds: [-0.06, -0.025, -0.06, 0.06, 0.12, 0.06], cell: 0.0033, farCell: 0.0066, farInflate: 0.003, share: 0.62}};
  return {parts, protos, aoReach: 0.025 * sc, aoFloor: 0.3};
}
function bladesNear(blades, x, y, z) { let db = 1e9, ds = 1e9; for (const b of blades) db = Math.min(db, bladeD(b, x, y, z)); return db < 0.004; }

function daisy(R, P, opts) {
  const np = 20 + (R() * 7 | 0), petalLen = 0.026 + R() * 0.005, sector = TAU / np;
  const daisyHead = (lx, ly, lz) => {
    const r = Math.hypot(lx, lz);
    let d = sdEllipsoid(lx, ly - 0.002, lz, 0.021, 0.0125, 0.021);
    if (r < 0.078) {
      const th = Math.atan2(lz, lx), am = ((th % sector) + sector) % sector - sector / 2, px = r * Math.cos(am), pz = r * Math.sin(am), yy = ly + 2.2 * r * r - 0.003;
      d = smin(d, sdEllipsoid(px - 0.036 - petalLen * 0.2, yy, pz, petalLen + 0.012, 0.0048, 0.0078) * 0.75, 0.004);
    }
    return d;
  };
  const n = 3 + (R() * 3 | 0), parts = [], sc = opts.size ? opts.size / 0.5 : 1, rcl = 0.1 * sc + 0.025 * n, tinted = R() < 0.25;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * rcl, base = [Math.cos(a) * rr, -0.01, Math.sin(a) * rr];
    const h = (0.25 + R() * 0.3) * sc, lean = 0.07 + R() * 0.1, la = a + (R() - 0.5) * 1.0;
    const hx = base[0] + Math.cos(la) * lean * sc, hz = base[2] + Math.sin(la) * lean * sc;
    const st = stemCurve(R, base, hx, h, hz, 0.0068 * sc, 0.006 * sc);
    const tip = st.pts[3], tan = normalize3([tip[0] - st.pts[2][0] + (R() - 0.5) * 0.2, tip[1] - st.pts[2][1], tip[2] - st.pts[2][2] + (R() - 0.5) * 0.2]);
    const blades = [], nbl = 2 + (R() * 2 | 0), ba = R() * TAU;
    for (let k = 0; k < nbl; k++) {
      const bb = ba + k * 2.1 + (R() - 0.5) * 0.5, hh = 0.02 + R() * 0.12 * sc, dir = [Math.cos(bb) * 0.8, 0.55, Math.sin(bb) * 0.8];
      const f = (hh - 0) / h, sp = st.pts[1];
      blades.push(mkBlade([base[0] + (hx - base[0]) * f * 0.5, Math.max(0, hh), base[2] + (hz - base[2]) * f * 0.5], dir, (0.09 + R() * 0.07) * sc, 0.016 * sc, 0.0045 * sc, 0));
      blades[blades.length - 1].arch = (0.25 + 0.3 * R()) / blades[blades.length - 1].L;
    }
    const sdfB = bladesSdf(blades, 0.006), sdfS = segsSdf(st.segs), cellS = 0.005 * sc, gc = groundCull(cellS);
    const ptsAll = [...st.pts, ...blades.flatMap(b => [b.p, [b.p[0] + b.fr.ez[0] * b.L, b.p[1] + b.fr.ez[1] * b.L - b.arch * b.L * b.L, b.p[2] + b.fr.ez[2] * b.L]])];
    const bs = boundsOfPts(ptsAll, 0.04 * sc); bs[1] = Math.min(bs[1], -cellS * 3);
    parts.push({
      sdf: (x, y, z) => groundClip(smin(sdfS(x, y, z), sdfB(x, y, z), 0.006), y, cellS), bounds: bs, cell: cellS, w: 1.0, cull: (x, y, z) => gc(y),
      shade(x, y, z, nx, ny, nz, ao, o) {
        const isLeaf = bladesNear(blades, x, y, z);
        setc(o, isLeaf ? P.leaf : P.stem); mulo(o, (0.85 + 0.3 * noise(x * 40, y * 40, z * 40)) * Math.pow(ao, 1.0) * (0.85 + 0.3 * clamp(y / h, 0, 1)));
        o[3] = isLeaf ? 0.25 + 0.4 * clamp(y / (0.2 * sc), 0, 1) : 0.8 * Math.pow(clamp(y / h, 0, 1), 1.5); o[4] = isLeaf ? 0.6 : 0.15;
      },
    });
    const ax = normalize3([tan[0] + Math.cos(la) * 0.3, tan[1] + 0.05, tan[2] + Math.sin(la) * 0.3]), hs = sc * (0.85 + R() * 0.3), roll = R() * TAU;
    const fr = headFrame(ax, roll), tint = tinted;
    parts.push({
      inst: {key: 'head', fr, tip, hs}, sdf: headWorld(fr, tip, hs, daisyHead), cell: 0.0036 * hs, w: 2.4,
      shade(x, y, z, nx, ny, nz, ao, o) {
        const [lx, ly, lz] = toLocal(fr, tip, hs, x, y, z), r = Math.hypot(lx, lz);
        if (r < 0.026 && ly > -0.004) { const w = worley(lx * 260, lz * 260, ly * 100); mixc(o, P.disc, P.disc2, clamp(smoothstep(0.1, 0.9, w) * 0.5 + r * 10, 0, 1)); mulo(o, 0.9 + 0.3 * (0.5 - Math.abs(w - 0.5))); o[3] = 0.8; o[4] = 0.3; mulo(o, Math.pow(ao, 0.8)); return; }
        setc(o, P.petal); if (tint) mixo(o, P.tint, clamp((r - 0.03) * 30, 0, 0.6) * (ly < -0.002 ? 1 : 0.4));
        mulo(o, (0.88 + 0.2 * Math.sin(Math.atan2(lz, lx) * np * 3)) * (0.8 + 0.3 * clamp((r - 0.02) * 20, 0, 1)));
        mixo(o, P.disc2, clamp((0.034 - r) * 30, 0, 0.5));
        mulo(o, Math.pow(ao, 0.9)); o[3] = 0.9; o[4] = 1;
      },
    });
  }
  const protos = {head: {sdf: daisyHead, bounds: [-0.078, -0.05, -0.078, 0.078, 0.045, 0.078], cell: 0.0036, farCell: 0.007, farInflate: 0.004, share: 0.6}};
  return {parts, protos, aoReach: 0.02 * sc, aoFloor: 0.35};
}

const RECIPES = {
  oak: [oak, PAL_OAK, 0.04], fir: [fir, PAL_FIR, 0.03], snag: [snag, PAL_SNAG, 0.02],
  boulder: [boulder, PAL_BOULDER, 0.03], slab: [slab, PAL_SLAB, 0.02], mossrock: [mossrock, PAL_MOSSROCK, 0.03],
  shrub: [shrub, PAL_SHRUB, 0.04], succulent: [succulent, PAL_SUCC, 0.03], tulip: [tulip, PAL_TULIP, 0.02], daisy: [daisy, PAL_DAISY, 0.02],
};

/* ============================================================================================================================
   Baking
   ============================================================================================================================ */
const optSig = opts => { const o = {}; for (const k of Object.keys(opts || {}).sort()) if (k !== 'sliceMs' && k !== 'budget' && opts[k] !== undefined) o[k] = opts[k]; const s = JSON.stringify(o); return s === '{}' ? '' : hashStr(s).toString(36); };
export const propKey = (kind, seed, opts) => 'nature-' + kind + '-' + seed + (optSig(opts) ? '-' + optSig(opts) : '');

function allocate(raws, weights, total) {
  const n = raws.length, t = new Array(n).fill(0), fixed = new Array(n).fill(false);
  for (let it = 0; it < 4; it++) {
    let left = total, ws = 0;
    for (let i = 0; i < n; i++) if (fixed[i]) left -= t[i]; else ws += weights[i] * Math.pow(raws[i], 0.7);
    let changed = false;
    for (let i = 0; i < n; i++) if (!fixed[i]) { t[i] = Math.max(24, left * weights[i] * Math.pow(raws[i], 0.7) / ws); if (raws[i] <= t[i]) { t[i] = raws[i]; fixed[i] = true; changed = true; } }
    if (!changed) break;
  }
  return t;
}

// Generator: yields during the bake. Returns {near, far, stats} where near/far are {pos,nor,col,sw,lf} typed arrays.
export function* bakePropGen(kind, seed = 1, opts = {}) {
  const rec = RECIPES[kind]; if (!rec) throw new Error('nature: unknown kind ' + kind);
  const t0 = performance.now(), S = hashStr(kind + ':' + seed) | 0, R = mulberry(S);
  const budget = Object.assign({}, NATURE_BUDGET[kind], opts.budget);
  const run = function* (g) { for (;;) { setSeed(S); const r = g.next(); if (r.done) return r.value; yield; } };
  const P = makePalette(rec[1], R, opts.palette, opts.jitter ?? rec[2]);
  setSeed(S);
  const r = rec[0](R, P, opts), parts = r.parts, raws = [];
  const meshes = [];
  const EMPTY = () => ({P: new Float32Array(0), T: new Int32Array(0)});
  for (const p of parts) { const tq = performance.now(); const m = p.inst ? EMPTY() : dropSmall(yield* run(sculptGen(p.sdf, p.bounds, p.cell, {cull: p.cull})), 40); meshes.push(m); yield; }
  // prototypes: a repeated part (a flower head) is sculpted once in its own unit space, simplified once, and carried to each instance by a rigid transform + scale
  const protos = r.protos || {}, pm = {}, farRe = [];
  const xform = (m, inst) => {
    const P2 = new Float32Array(m.P.length), {fr, tip, hs} = inst;
    for (let i = 0; i < m.P.length; i += 3) { const x = m.P[i], y = m.P[i + 1], z = m.P[i + 2]; for (let q = 0; q < 3; q++) P2[i + q] = tip[q] + hs * (x * fr.ex[q] + y * fr.ey[q] + z * fr.ez[q]); }
    return {P: P2, T: m.T};
  };
  for (const key of Object.keys(protos)) {
    const pr = protos[key], ni = parts.filter(p => p.inst && p.inst.key === key).length;
    if (!ni) continue;
    const nT = Math.max(60, budget.near * pr.share / ni), fT = Math.max(24, budget.far * pr.share / ni);
    let m, ng = Infinity, nc = pr.cell;
    for (let tries = 0; tries < 3 && ng > nT * 1.01 + 2; tries++, nc *= 1.12) {   // thin cups stall the simplifier: sculpt a touch coarser and retry
      m = dropSmall(yield* run(sculptGen(pr.sdf, pr.bounds, nc, {})), 40);
      if (m.T.length / 3 > nT) m = yield* run(simplifyGen(m, nT));
      ng = m.T.length / 3;
    }
    let fm, got = Infinity, cell = pr.farCell;
    const fs = (x, y, z) => pr.sdf(x, y, z) - pr.farInflate;
    for (let tries = 0; tries < 4 && got > fT * 1.01 + 2; tries++, cell *= 1.3) {
      fm = dropSmall(yield* run(sculptGen(fs, pr.bounds, cell, {})), 20);
      if (fm.T.length / 3 > fT) fm = yield* run(simplifyGen(fm, fT));
      got = fm.T.length / 3;
    }
    pm[key] = {near: m, far: fm}; yield;
  }
  const instN = parts.reduce((a, p) => a + (p.inst ? pm[p.inst.key].near.T.length / 3 : 0), 0), instF = parts.reduce((a, p) => a + (p.inst ? pm[p.inst.key].far.T.length / 3 : 0), 0);
  const tMesh = performance.now();
  // simplify parts one by one, hardest (thin sheets) first; whatever a part cannot shed (they stall at a floor) is taken out of the others' share
  const order = parts.map((_, k) => k).filter(k => !parts[k].inst).sort((a, b) => (parts[b].farCell ? 1 : 0) - (parts[a].farCell ? 1 : 0));
  const fit = function* (srcs, total, make) {
    const out = new Array(srcs.length), rawN = srcs.map(m => m.T.length / 3); let left = total;
    const wt = k => (parts[k].w || 1) * Math.pow(rawN[k], 0.7);
    let rest = order.reduce((a, k) => a + wt(k), 0);
    for (const k of order) {
      const t = Math.max(14, left * wt(k) / rest);
      out[k] = rawN[k] <= t ? srcs[k] : yield* make(k, t);
      left -= out[k].T.length / 3; rest -= wt(k); yield;
    }
    // parts that stalled above their share leave the total over budget: trim the rest (largest first) by the excess
    let excess = order.reduce((a, k) => a + out[k].T.length / 3, 0) - total;
    for (const k of [...order].sort((a, b) => out[b].T.length - out[a].T.length)) {
      if (excess <= 0) break;
      const cur = out[k].T.length / 3, t = Math.max(14, cur - excess);
      if (t < cur) { out[k] = yield* run(simplifyGen(out[k], t)); excess -= cur - out[k].T.length / 3; }
    }
    return out;
  };
  const nearM = yield* fit(meshes, budget.near - instN, function* (k, t) { return yield* run(simplifyGen(meshes[k], t)); });
  parts.forEach((p, k) => { if (p.inst) nearM[k] = xform(pm[p.inst.key].near, p.inst); });
  const nt = order.reduce((a, k) => a + nearM[k].T.length / 3, 0);
  const coarse = function* (k, t) {   // re-sculpt coarser (inflated a little so thin parts survive), simplify; retry coarser while over budget
    const p = parts[k]; let cell = p.farCell || p.cell * 1.8, m, got = Infinity;
    const fs = (p.farInflate ?? p.cell * 0.3) ? (x, y, z) => p.sdf(x, y, z) - (p.farInflate ?? p.cell * 0.3) : p.sdf;
    for (let tries = 0; tries < 4 && got > t * 1.01 + 2; tries++, cell *= 1.35) {
      m = dropSmall(yield* run(sculptGen(fs, p.bounds, cell, {cull: p.cull})), 20);
      if (m.T.length / 3 > t) m = yield* run(simplifyGen(m, t));
      got = m.T.length / 3;
    }
    farRe.push(k); return m;
  };
  const farM = nt <= budget.far - instF ? nearM.slice() : yield* fit(nearM, budget.far - instF, function* (k, t) {
    // thin sheets (petals, skirts) cannot be collapsed far enough, so they go straight to a coarser sculpt; the rest simplify the near mesh and fall back to it when they stall
    if (parts[k].farCell) return yield* coarse(k, t);
    const m = yield* run(simplifyGen(nearM[k], t));
    return m.T.length / 3 > t * 1.01 + 2 ? yield* coarse(k, t) : m;
  });
  parts.forEach((p, k) => { if (p.inst) { farM[k] = xform(pm[p.inst.key].far, p.inst); farRe.push(k); } });
  const finish = function* (ms, re) {
    const outs = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], m = ms[i];
      if (!m.T.length) continue;
      const fl = yield* run(flattenGen(m, p.sdf, {paint: () => {}, ao: r.aoReach, aoSdf: r.ao || p.sdf, aoFloor: r.aoFloor, eps: p.cell * 0.3, project: re && re.includes(i) ? 0 : p.cell * (r.projectK ?? 0.6)}));
      const nv = fl.length / 9, col = new Float32Array(nv * 3), sw = new Float32Array(nv), lf = new Float32Array(nv), done = new Uint8Array(m.P.length / 3), cv = new Float32Array(m.P.length), swv = new Float32Array(done.length), lfv = new Float32Array(done.length), o = [0, 0, 0, 0, 0], T = m.T;
      setSeed(S);
      for (let k = 0; k < nv; k++) {
        const vi = T[k];
        if (!done[vi]) {
          const b = k * 9; p.shade(fl[b], fl[b + 1], fl[b + 2], fl[b + 3], fl[b + 4], fl[b + 5], fl[b + 8], o);
          cv[vi * 3] = o[0]; cv[vi * 3 + 1] = o[1]; cv[vi * 3 + 2] = o[2]; done[vi] = 1;
          swv[vi] = o[3]; lfv[vi] = o[4];
        }
        col[k * 3] = cv[vi * 3]; col[k * 3 + 1] = cv[vi * 3 + 1]; col[k * 3 + 2] = cv[vi * 3 + 2]; sw[k] = swv[vi]; lf[k] = lfv[vi];
        if ((k & 4095) === 4095) yield;
      }
      outs.push({fl, col, sw, lf, nv});
    }
    let nv = 0; for (const o of outs) nv += o.nv;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), sw = new Float32Array(nv), lf = new Float32Array(nv);
    let off = 0;
    for (const o of outs) {
      for (let k = 0; k < o.nv; k++) { const b = k * 9, q = (off + k) * 3; pos[q] = o.fl[b]; pos[q + 1] = o.fl[b + 1]; pos[q + 2] = o.fl[b + 2]; nor[q] = o.fl[b + 3]; nor[q + 1] = o.fl[b + 4]; nor[q + 2] = o.fl[b + 5]; }
      col.set(o.col, off * 3); sw.set(o.sw, off); lf.set(o.lf, off); off += o.nv;
    }
    return {pos, nor, col, sw, lf};
  };
  const t1 = performance.now();
  const near = yield* finish(nearM, []), t2 = performance.now(), far = yield* finish(farM, farRe);
  const t3 = performance.now();
  return {near, far, stats: {tris: near.pos.length / 9, farTris: far.pos.length / 9, ms: t3 - t0, meshMs: tMesh - t0, simpMs: t1 - tMesh, sculptMs: t1 - t0, nearMs: t2 - t1, farMs: t3 - t2, rawTris: raws.reduce((a, b) => a + b, 0)}};
}

// drop tiny disconnected floaters (noise islands) so the simplifier is not stuck holding them at their minimum size
function dropSmall(m, minTris) {
  const nv = m.P.length / 3, par = new Int32Array(nv).map((_, i) => i), T = m.T;
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let i = 0; i < T.length; i += 3) { const a = find(T[i]), b = find(T[i + 1]), c = find(T[i + 2]); if (a !== b) par[b] = a; const a2 = find(a); if (a2 !== c) par[c] = a2; }
  const cnt = new Int32Array(nv);
  for (let i = 0; i < T.length; i += 3) cnt[find(T[i])]++;
  const keep = []; for (let i = 0; i < T.length; i += 3) if (cnt[find(T[i])] >= minTris) keep.push(T[i], T[i + 1], T[i + 2]);
  return keep.length === T.length ? m : {P: m.P, T: Int32Array.from(keep)};
}
const drain = g => { let r; while (!(r = g.next()).done); return r.value; };
export function toGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.col, 3)); g.setAttribute('aSw', new THREE.BufferAttribute(a.sw, 1)); g.setAttribute('aLf', new THREE.BufferAttribute(a.lf, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
const wrap = r => ({near: toGeometry(r.near), far: toGeometry(r.far), stats: r.stats, raw: r});
export function bakeProp(kind, seed = 1, opts = {}) { return wrap(drain(bakePropGen(kind, seed, opts))); }

const memo = new Map();
// Async, cached: IndexedDB (key 'nature-<kind>-<seed>[-<opts>]:<kit hash>', so only the newest kit version per prop is kept), else bake in slices of ~opts.sliceMs.
export function getProp(kind, seed = 1, opts = {}) {
  const key = propKey(kind, seed, opts);
  if (memo.has(key)) return memo.get(key);
  const p = (async () => {
    const full = key + ':' + KIT_HASH, hit = await loadBake(full);
    if (hit && hit.near && hit.far && hit.v === 1) return wrap({near: hit.near, far: hit.far, stats: Object.assign({}, hit.stats, {cached: true})});
    const g = bakePropGen(kind, seed, opts), slice = opts.sliceMs ?? 8;
    let r, ts = performance.now();
    while (!(r = g.next()).done) if (performance.now() - ts > slice) { await new Promise(res => setTimeout(res, 0)); ts = performance.now(); }
    saveBake(full, {v: 1, near: r.value.near, far: r.value.far, stats: r.value.stats});
    return wrap(r.value);
  })();
  memo.set(key, p);
  return p;
}

/* ============================================================================================================================
   Material: vertex colours + sway (same aSw/uTime scheme as forest.js); Q>0 adds a fresnel rim and fake subsurface on leaf/petal verts.
   ============================================================================================================================ */
export function natureMaterial({Q = 1, UT, sway = 0.03} = {}) {
  const uT = UT || {value: 0};
  const patch = sh => {
    sh.uniforms.uTime = uT; sh.uniforms.uSway = {value: sway};
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSw;attribute float aLf;uniform float uTime;uniform float uSway;' + (Q > 0 ? 'varying float vLf;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (Q > 0 ? 'vLf=aLf;\n' : '') +
        '{\n#ifdef USE_INSTANCING\nfloat ph=instanceMatrix[3].x*1.7+instanceMatrix[3].z*2.3;\n#else\nfloat ph=modelMatrix[3].x*1.7+modelMatrix[3].z*2.3;\n#endif\n' +
        'float k=aSw*(sin(uTime*1.3+ph+position.y*.8)*.7+sin(uTime*3.1+ph*1.7+position.x*3.)*.3)*uSway;transformed.x+=k;transformed.z+=k*.6;}');
    if (Q > 0) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLf;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' +
        '{vec3 V=normalize(vViewPosition);vec3 N=normalize(vNormal);float fr=pow(1.-clamp(dot(N,V),0.,1.),3.);\n' +
        'totalEmissiveRadiance+=diffuseColor.rgb*fr*(.08+.3*vLf);\n' +
        'totalEmissiveRadiance+=diffuseColor.rgb*vec3(.9,1.,.5)*vLf*.06;\n' +
        '#if NUM_DIR_LIGHTS>0\nvec3 Ld=directionalLights[0].direction;float tr=pow(clamp(dot(Ld,-V),0.,1.),2.)*(.4+.6*(1.-abs(dot(N,Ld))));\n' +
        'totalEmissiveRadiance+=diffuseColor.rgb*vec3(1.,.95,.6)*directionalLights[0].color*tr*vLf*.5;\n#endif\n}');
  };
  const m = Q === 0 ? new THREE.MeshLambertMaterial({vertexColors: true}) : new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.88, metalness: 0});
  m.onBeforeCompile = patch; m.customProgramCacheKey = () => 'nature' + (Q > 0 ? 1 : 0);
  return m;
}
