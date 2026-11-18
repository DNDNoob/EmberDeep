// npc_hair.js - hair as locks: the reusable hair system of the NPC kit (see docs/npc-kit.md, "Hair").
//
// Hair is not one smooth slab. It is a union of LOCKS: tapered tubes (round cones along a polyline) that overlap like layered tufts,
// with S-shaped paths along the growth direction and tips that thin into points. A part (beard, moustache, brow, fringe) builds its
// lock list, merges it with a small smooth-min and gets two things back besides the shape:
//   - eval(x,y,z)      the distance field of all locks (cheap: every lock has a padded bounding box)
//   - info(x,y,z,o)    for the nearest lock: o = [u, v, id]  u = metres along the hair from its root, v = metres across the lock
//                      (signed offset from its axis along the lateral axis), id = hash 0..1 of the lock. These are baked per vertex
//                      into the mesh's band attribute (vBand in the shader), where the hair material turns them into fine strands:
//                      noise stretched along u, varying across v, anisotropic highlight along the flow, root/tip tinting.
//   - rootT(x,y,z)     0 at the root .. 1 at the tip of the nearest lock (paint: roots darker, tips lighter/yellower)
import {smin, smoothstep} from './sculpt.js';

export const rng = seed => { let s = (seed | 0) >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const cl = (v, a, b) => Math.min(b, Math.max(a, v));

// list: [{pts: [[x,y,z]...], rad: [r...] (same length), id?: 0..1}]
export function lockSet(list, o = {}) {
  const k = o.k ?? 0.002, ref = o.ref || [1, 0, 0];
  const L = list.map((l, i) => {
    const n = l.pts.length, X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n), R = new Float64Array(n), U = new Float64Array(n);
    let x0 = 9, y0 = 9, z0 = 9, x1 = -9, y1 = -9, z1 = -9, rm = 0;
    for (let j = 0; j < n; j++) {
      X[j] = l.pts[j][0]; Y[j] = l.pts[j][1]; Z[j] = l.pts[j][2]; R[j] = l.rad[j]; rm = Math.max(rm, R[j]);
      if (j) U[j] = U[j - 1] + Math.hypot(X[j] - X[j - 1], Y[j] - Y[j - 1], Z[j] - Z[j - 1]);
      x0 = Math.min(x0, X[j]); x1 = Math.max(x1, X[j]); y0 = Math.min(y0, Y[j]); y1 = Math.max(y1, Y[j]); z0 = Math.min(z0, Z[j]); z1 = Math.max(z1, Z[j]);
    }
    const pad = rm + 2 * k + (o.pad ?? 0.002);
    return {n, X, Y, Z, R, U, len: U[n - 1] || 1e-6, x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad, z0: z0 - pad, z1: z1 + pad, id: l.id ?? ((i * 0.6180339887) % 1)};
  });
  const best = {l: null, seg: 0, h: 0, d: 1e9};
  function ev(x, y, z, track) {
    let d = 1e9; if (track) best.d = 1e9;
    for (let q = 0; q < L.length; q++) {
      const l = L[q];
      if (x < l.x0 || x > l.x1 || y < l.y0 || y > l.y1 || z < l.z0 || z > l.z1) continue;
      let ld = 1e9, ls = 0, lh = 0;
      const X = l.X, Y = l.Y, Z = l.Z, R = l.R;
      for (let i = 0, m = l.n - 1; i < m; i++) {
        const ax = X[i], ay = Y[i], az = Z[i], bx = X[i + 1] - ax, by = Y[i + 1] - ay, bz = Z[i + 1] - az, px = x - ax, py = y - ay, pz = z - az;
        const b2 = bx * bx + by * by + bz * bz, h = b2 > 1e-14 ? cl((px * bx + py * by + pz * bz) / b2, 0, 1) : 0;
        const dx = px - h * bx, dy = py - h * by, dz = pz - h * bz, dd = Math.sqrt(dx * dx + dy * dy + dz * dz) - (R[i] + (R[i + 1] - R[i]) * h);
        if (dd < ld) { ld = dd; ls = i; lh = h; }
      }
      d = smin(d, ld, k);
      if (track && ld < best.d) { best.d = ld; best.l = l; best.seg = ls; best.h = lh; }
    }
    return d;
  }
  const eval_ = (x, y, z) => ev(x, y, z, false);
  // nearest lock: o = [u, v, id]; returns false when no lock is near
  function info(x, y, z, o) {
    ev(x, y, z, true);
    const l = best.l; if (!l) { o[0] = 0; o[1] = 0; o[2] = 0; return false; }
    const i = best.seg, h = best.h, sl = l.U[i + 1] - l.U[i];
    o[0] = l.U[i] + h * sl;
    const tx = l.X[i + 1] - l.X[i], ty = l.Y[i + 1] - l.Y[i], tz = l.Z[i + 1] - l.Z[i], tl = Math.hypot(tx, ty, tz) || 1;
    // lateral axis = tangent x ref, normalised; v = offset of the point from the axis along it
    let bx = ty * ref[2] - tz * ref[1], by = tz * ref[0] - tx * ref[2], bz = tx * ref[1] - ty * ref[0]; const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
    const cx = l.X[i] + h * (l.X[i + 1] - l.X[i]), cy = l.Y[i] + h * (l.Y[i + 1] - l.Y[i]), cz = l.Z[i] + h * (l.Z[i + 1] - l.Z[i]);
    o[1] = (x - cx) * bx + (y - cy) * by + (z - cz) * bz; o[2] = l.id; o.t = o[0] / l.len; o.d = best.d; void tl;
    return true;
  }
  return {eval: eval_, info, locks: L, count: L.length, rootT: (x, y, z) => { const o = [0, 0, 0]; info(x, y, z, o); return o.t ?? 0; }};
}

// radius profile of a lock: thin at the root (it grows out of the skin), full in the first third, then tapering to a point at the tip.
// R = peak radius, tip = radius at the end (a round cap makes the last millimetre pointed), s in 0..1
export const lockRadius = (s, R, tip = 0.0004, root = 0.45, taper = 0.5) => (R * (root + (1 - root) * smoothstep(0, 0.18, s))) * (1 - (1 - tip / R) * Math.pow(smoothstep(taper, 1, s), 1.15)) ;

// Surface points of `field` (negative inside) found by marching along -X at the given (y, z) samples. Each sample starts its search
// near the previous x (bracket +-bracket, bisection), so a path of 50 samples costs ~600 field evaluations, not 10000.
// Returns {pts, nor} (outward normals from the field gradient); samples that miss the surface are skipped.
export function traceSurface(field, yz, o = {}) {
  const x0 = o.x0 ?? 0.26, br = o.bracket ?? 0.014, e = 0.0007, pts = [], nor = [];
  let xp = null;
  for (const [y, z] of yz) {
    let lo, hi, ok = false;
    if (xp !== null) { hi = xp + br; lo = xp - br; ok = field(hi, y, z) > 0 && field(lo, y, z) < 0; }
    if (!ok) { // full march from the front
      let a = x0; hi = null;
      for (let t = x0; t > -0.05; t -= 0.002) { if (field(t, y, z) < 0) { lo = t; hi = t + 0.002; break; } }
      if (hi === null) continue;
    }
    for (let i = 0; i < 11; i++) { const m = (lo + hi) / 2; if (field(m, y, z) < 0) lo = m; else hi = m; }
    xp = (lo + hi) / 2;
    const d0 = field(xp, y, z), gx = field(xp + e, y, z) - d0, gy = field(xp, y + e, z) - d0, gz = field(xp, y, z + e) - d0, l = Math.hypot(gx, gy, gz) || 1;
    pts.push([xp, y, z]); nor.push([gx / l, gy / l, gz / l]);
  }
  return {pts, nor};
}

// Build a lock polyline from a surface trace: offset along the normal (`off`, + = outward), radius profile, optional wisp (free) end.
export function lockFromTrace(w, o = {}) {
  const n = w.pts.length, off = o.off ?? 0, R = o.R ?? 0.004, tip = o.tip ?? 0.0004, root = o.root ?? 0.45, taper = o.taper ?? 0.5;
  const pts = [], rad = [];
  for (let i = 0; i < n; i++) {
    const s = n > 1 ? i / (n - 1) : 0, p = w.pts[i], nr = w.nor[i], f = off * (0.3 + 0.7 * smoothstep(0, 0.2, s)) - (o.sink ?? 0.9 * R) * (1 - smoothstep(0, 0.14, s));   // roots are buried in the skin: no stubby ends poking out
    pts.push([p[0] + nr[0] * f, p[1] + nr[1] * f, p[2] + nr[2] * f]); rad.push(lockRadius(s, R, tip, root, taper));
  }
  return {pts, rad, id: o.id};
}

// Free curve lock from a function path(s) s in 0..1 -> [x,y,z], n samples.
export function lockFromPath(path, o = {}) {
  const n = o.n ?? 14, R = o.R ?? 0.003, tip = o.tip ?? 0.0003, pts = [], rad = [];
  for (let i = 0; i < n; i++) { const s = i / (n - 1); pts.push(path(s)); rad.push(lockRadius(s, R, tip, o.root ?? 0.5, o.taper ?? 0.45)); }
  return {pts, rad, id: o.id};
}

// Wisps from a lock's last part: `count` thin locks that leave the parent at s0 and fan out sideways, ending past it.
export function tipWisps(lock, r, o = {}) {
  const n = lock.pts.length, s0 = o.s0 ?? 0.62, count = o.count ?? 2, out = [], i0 = Math.floor(s0 * (n - 1));
  for (let c = 0; c < count; c++) {
    const side = (c % 2 ? 1 : -1) * (0.5 + r()), spread = (o.spread ?? 0.012) * side, ext = 1 + (o.extend ?? 0.12) * r(), Rw = (o.R ?? 0.0016) * (0.8 + 0.5 * r());
    const pts = [], rad = [], m = n - i0;
    for (let j = 0; j < m; j++) {
      const s = j / (m - 1), p = lock.pts[i0 + j], tp = lock.pts[Math.min(n - 1, i0 + j + 1)], bp = lock.pts[Math.max(0, i0 + j - 1)];
      const tx = tp[0] - bp[0], ty = tp[1] - bp[1], tz = tp[2] - bp[2];
      const g = Math.pow(s, 1.3);
      pts.push([p[0] + tx * (ext - 1) * g * 1.2 + (o.outX ?? 0.2) * Math.abs(spread) * g, p[1] + ty * (ext - 1) * g * 1.2, p[2] + spread * g]);
      rad.push(lockRadius(s, Rw, 0.0002, 1, 0.3));
    }
    out.push({pts, rad, id: (r() + 0.37) % 1});
  }
  return out;
}

/* =====================================================================================
   HAIR CARDS (v11): curved ribbons textured with a procedural strand atlas, alpha tested in the hair shader (game.js, material 14).
   The solid inner mass (a low envelope) keeps skin from showing through; cards give the strands and the broken silhouette.
   ===================================================================================== */
// Strand atlas: 4 variants side by side, each a 128 x 512 tile (u across the card, v along it, root at v = 0). Returns {data: Uint8Array RGBA, w, h, tiles}.
// 0 dense clump (strands converge to a point), 1 wispy tip (strands fan out and end at different lengths), 2 sparse (a few thin curly strands), 3 ragged (blunt, uneven ends).
export const ATLAS_TILES = 4;
export function hairAtlas(size = 512, seed = 7) {
  const W = size, H = size, tw = W / ATLAS_TILES, data = new Uint8Array(W * H * 4), r = rng(seed);
  const TONES = [[0.94, 0.93, 0.89, 0.36], [0.76, 0.76, 0.74, 0.25], [0.56, 0.56, 0.55, 0.16], [0.93, 0.84, 0.62, 0.12], [0.38, 0.38, 0.38, 0.12]];
  const tone = () => { let t = r(), a = 0; for (const c of TONES) { a += c[3]; if (t <= a) return c; } return TONES[0]; };
  for (let i = 0; i < W * H; i++) { data[i * 4] = 205; data[i * 4 + 1] = 203; data[i * 4 + 2] = 196; data[i * 4 + 3] = 0; }
  const spec = [
    {n: 80, hw: 0.85, x0: () => 0.5 + (r() + r() - 1) * 0.47, len: x0 => 0.97 - 0.55 * Math.pow(Math.abs(x0 - 0.5) * 2, 1.4) - 0.04 * r(), conv: 0.6, wob: 0.025},
    {n: 30, hw: 0.9, x0: () => 0.22 + 0.56 * r(), len: () => 0.5 + 0.5 * r(), conv: -0.55, wob: 0.045},
    {n: 12, hw: 0.8, x0: () => 0.12 + 0.76 * r(), len: () => 0.55 + 0.45 * r(), conv: -0.1, wob: 0.07},
    {n: 66, hw: 0.9, x0: () => 0.5 + (r() + r() - 1) * 0.47, len: () => 0.6 + 0.38 * r(), conv: 0.15, wob: 0.03}
  ];
  spec.forEach((sp, ti) => {
    const ox = ti * tw, strands = [];
    for (let k = 0; k < sp.n; k++) strands.push({x0: sp.x0(), ph: r() * 6.28, f: 2 + 4 * r(), len: 0, t: tone(), hwK: 0.8 + 0.5 * r(), bri: 0.58 + 0.52 * r(), drift: (r() - 0.5) * 0.1});
    for (const s of strands) s.len = sp.len(s.x0);
    strands.sort((a, b) => a.bri - b.bri);
    for (const s of strands) {
      for (let y = 0; y < H; y++) {
        const v = y / (H - 1); if (v > s.len) break;
        const taper = 1 - 0.8 * Math.pow(Math.max(0, (v - (s.len - 0.3)) / 0.3), 1.2);      // thin out over the last 30% of its own length
        const xc = (s.x0 + (0.5 - s.x0) * sp.conv * Math.pow(v, 1.5) + s.drift * v + sp.wob * Math.sin(s.ph + s.f * v * 3.14) * (0.3 + v)) * (tw - 8) + 4;
        const hw = Math.max(0.3, sp.hw * s.hwK * taper), b = s.bri * (0.9 + 0.1 * Math.sin(s.ph * 3 + v * 9));
        for (let px = Math.floor(xc - hw - 1); px <= Math.ceil(xc + hw + 1); px++) {
          if (px < 3 || px >= tw - 3) continue;
          const cov = Math.max(0, Math.min(1, hw + 0.5 - Math.abs(px + 0.5 - xc)));
          if (cov <= 0) continue;
          const o = ((y) * W + ox + px) * 4, a0 = data[o + 3] / 255, a1 = a0 + cov * (1 - a0), wgt = cov / Math.max(1e-6, a0 * (1 - cov) + cov);
          for (let c = 0; c < 3; c++) data[o + c] = Math.round(data[o + c] * (1 - wgt) + 255 * Math.min(1, s.t[c] * b) * wgt);
          data[o + 3] = Math.round(a1 * 255);
        }
      }
    }
  });
  return {data, w: W, h: H, tiles: ATLAS_TILES};
}

// Card collector. ribbon(pts, nor, o): a strip along the polyline `pts` (n >= 2 points), lying on the surface whose normals are `nor`.
// o: {w: half width in m (number or s => m), variant 0..3, lift (m the tip stands off the surface), root (paint 0..1 at the root), tip (paint at the tip), ao (0..1),
//     round (0..1: how much the shading normal bends across the card so it reads as a lock, default 0.55), keep (LOD level 0: always kept, 1: dropped first)}
// build(lods): [{keep, segStep, wScale}] -> one mesh per LOD (stride 9 + .band = (u across 0..1, v along 0..1, 2 + variant)).
export class Cards {
  constructor() { this.list = []; this.volN = null; }   // volN(x,y,z) -> unit outward normal of the underlying hair volume: cards are lit with it (soft, one-mass shading)
  ribbon(pts, nor, o = {}) { if (pts.length >= 2) this.list.push({pts, nor, o}); }
  get count() { return this.list.length; }
  build(lods = [{keep: 1, segStep: 1, wScale: 1}], seed = 3) {
    return lods.map(L => {
      const V = [], B = [], r = rng(seed + 17);
      for (const c of this.list) {
        const pri = c.o.keep ?? 1, rk = r();   // pri 0: always (silhouette cards); otherwise kept with probability L.keep
        if (pri !== 0 && rk > L.keep) continue;
        let idx = []; const n = c.pts.length;
        for (let i = 0; i < n; i += Math.max(1, L.segStep)) idx.push(i);
        if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
        const m = idx.length, P = idx.map(i => c.pts[i]), N = idx.map(i => c.nor[i]), s = P.map((_, k) => idx[k] / (n - 1));
        const Lf = [], Rt = [];
        for (let k = 0; k < m; k++) {
          const a = P[Math.max(0, k - 1)], b = P[Math.min(m - 1, k + 1)];
          let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
          const nn = N[k]; let bx = ty * nn[2] - tz * nn[1], by = tz * nn[0] - tx * nn[2], bz = tx * nn[1] - ty * nn[0]; const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
          const sk = s[k], hw = (typeof c.o.w === 'function' ? c.o.w(sk) : (c.o.w ?? 0.004)) * L.wScale, lf = (c.o.lift ?? 0) * sk * sk, p = P[k];
          const q = [p[0] + nn[0] * lf, p[1] + nn[1] * lf, p[2] + nn[2] * lf], rd = c.o.round ?? 0.55;
          let nl = norm(nn[0] - bx * rd, nn[1] - by * rd, nn[2] - bz * rd), nr = norm(nn[0] + bx * rd, nn[1] + by * rd, nn[2] + bz * rd);
          if (this.volN) { const vn = this.volN(p[0], p[1], p[2]), kv = c.o.vol ?? 0.78, bl = (a, b) => norm(a[0] * (1 - kv) + b[0] * kv, a[1] * (1 - kv) + b[1] * kv, a[2] * (1 - kv) + b[2] * kv); nl = bl(nl, vn); nr = bl(nr, vn); }
          Lf.push({p: [q[0] - bx * hw, q[1] - by * hw, q[2] - bz * hw], n: nl}); Rt.push({p: [q[0] + bx * hw, q[1] + by * hw, q[2] + bz * hw], n: nr});
        }
        const pr = c.o.root ?? 0.5, pt = c.o.tip ?? 0.1, ao = c.o.ao ?? 1, vz = 2 + (c.o.variant ?? 0);
        const push = (v, u, sk) => { const t = Math.min(1, sk * 1.6), ad = ao * (0.8 + 0.2 * smoothstep(0, 0.5, sk)); V.push(v.p[0], v.p[1], v.p[2], v.n[0], v.n[1], v.n[2], pr + (pt - pr) * t, 0, ad); B.push(u, sk, vz); };
        for (let k = 0; k < m - 1; k++) {
          push(Lf[k], 0, s[k]); push(Rt[k], 1, s[k]); push(Rt[k + 1], 1, s[k + 1]);
          push(Lf[k], 0, s[k]); push(Rt[k + 1], 1, s[k + 1]); push(Lf[k + 1], 0, s[k + 1]);
        }
      }
      const out = new Float32Array(V); out.stride = 9; out.band = new Float32Array(B); out.cards = true; return out;
    });
  }
}
const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
