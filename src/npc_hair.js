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
