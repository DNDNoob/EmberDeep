// sculpt.js - math-sculpted meshes: signed distance fields, smooth blending, naive surface nets.
//
// Idea (borrowed from the Abyssal Garden project): instead of gluing capsules and ellipsoids
// together, describe a shape as a distance function, blend the pieces with a smooth minimum so
// they melt into one surface, add noise displacement for folds and strands, then mesh the result
// once at load time. The mesh comes out in the exact layout `emit()` in game.js wants:
// a non-indexed Float32Array, 6 floats per vertex (position xyz, normal xyz).
//
// Everything works in plain numbers (no vector objects) so the SDFs stay cheap to evaluate.

/* ---------- distance primitives (all take the sample point first) ---------- */
export const sdSphere = (x, y, z, r) => Math.hypot(x, y, z) - r;
// Ellipsoid: the usual "good enough" approximation, exact on the surface's zero set.
export function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
// Tapered capsule (round cone) from a (radius r1) to b (radius r2), after Inigo Quilez.
export function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az, l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
export const sdCapsule = (px, py, pz, ax, ay, az, bx, by, bz, r) => sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r, r);
// Rounded box of half extents (hx,hy,hz) and corner radius r.
export function sdBox(x, y, z, hx, hy, hz, r = 0) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/* ---------- boolean ops ---------- */
// Polynomial smooth minimum: a union whose seam is rounded over a width k.
export function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export const smax = (a, b, k) => -smin(-a, -b, k);   // smooth intersection
export const sub = (a, b) => Math.max(a, -b);         // hard subtraction a minus b
export const ssub = (a, b, k) => smax(a, -b, k);      // smooth subtraction (carves soft sockets)
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- seeded noise ---------- */
let SEED = 1337;
export const setSeed = s => { SEED = s | 0; };
function hash(ix, iy, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177) ^ SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Smooth value noise in [0,1].
export function noise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
           l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
// Fractal sum, centred on 0 (range about -0.5..0.5).
export function fbm(x, y, z, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * (noise(x * f, y * f, z * f) - 0.5) * 2; a *= 0.5; f *= 2.03; }
  return s * 0.5;
}
// Worley F1: distance to the nearest jittered feature point, 3x3x3 neighbourhood. Roughly 0..1.
export function worley(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let best = 9;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, cz = iz + k;
    const dx = cx + hash(cx, cy, cz) - x, dy = cy + hash(cy, cz, cx + 7) - y, dz = cz + hash(cz, cx + 3, cy) - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/* ---------- naive surface nets ---------- */
// sdf(x,y,z) -> signed distance (negative inside). bounds=[x0,y0,z0,x1,y1,z1] must enclose the
// shape with a cell or two to spare. cell = grid pitch in the same units as the SDF.
// opts.cull(cx,cy,cz): optional predicate on a triangle centroid, true drops it (hidden caps, parts buried in others).
// Returns an indexed mesh {P: Float32Array xyz, T: Int32Array triangles}, wound outward.
// Far from the surface the field is sampled once per 4x4x4 block (narrow band), which is most of the grid.
export function sculptIndexed(sdf, bounds, cell, opts = {}) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const F = new Float32Array(nx * ny * nz), BS = 4, safe = BS * cell * 0.87 * 1.6; // block half diagonal, with slack for non-exact fields
  for (let bk = 0; bk < nz; bk += BS) for (let bj = 0; bj < ny; bj += BS) for (let bi = 0; bi < nx; bi += BS) {
    const ek = Math.min(nz, bk + BS), ej = Math.min(ny, bj + BS), ei = Math.min(nx, bi + BS);
    const dc = sdf(x0 + (bi + (ei - bi - 1) / 2) * cell, y0 + (bj + (ej - bj - 1) / 2) * cell, z0 + (bk + (ek - bk - 1) / 2) * cell);
    const far = Math.abs(dc) > safe;
    for (let k = bk; k < ek; k++) for (let j = bj; j < ej; j++) for (let i = bi, o = i + j * nx + k * nx * ny; i < ei; i++, o++)
      F[o] = far ? dc : sdf(x0 + i * cell, y0 + j * cell, z0 + k * cell);
  }
  const sx = 1, sy = nx, sz = nx * ny;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1, cid = new Int32Array(cx * cy * cz).fill(-1);
  const VP = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const b = i * sx + j * sy + k * sz;
    cv[0] = F[b]; cv[1] = F[b + sx]; cv[2] = F[b + sy]; cv[3] = F[b + sx + sy];
    cv[4] = F[b + sz]; cv[5] = F[b + sx + sz]; cv[6] = F[b + sy + sz]; cv[7] = F[b + sx + sy + sz];
    let mask = 0; for (let n = 0; n < 8; n++) if (cv[n] < 0) mask |= 1 << n;
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, cnt = 0;
    for (let e = 0; e < 12; e++) {
      const a = E[e][0], c = E[e][1], va = cv[a], vc = cv[c];
      if ((va < 0) === (vc < 0)) continue;
      const t = va / (va - vc);
      px += (a & 1) + ((c & 1) - (a & 1)) * t; py += ((a >> 1) & 1) + (((c >> 1) & 1) - ((a >> 1) & 1)) * t; pz += ((a >> 2) & 1) + (((c >> 2) & 1) - ((a >> 2) & 1)) * t;
      cnt++;
    }
    cid[i + j * cx + k * cx * cy] = VP.length / 3;
    VP.push(x0 + (i + px / cnt) * cell, y0 + (j + py / cnt) * cell, z0 + (k + pz / cnt) * cell);
  }
  const T = [];
  const tri = (a, b, c) => {
    if (opts.cull && opts.cull((VP[a * 3] + VP[b * 3] + VP[c * 3]) / 3, (VP[a * 3 + 1] + VP[b * 3 + 1] + VP[c * 3 + 1]) / 3, (VP[a * 3 + 2] + VP[b * 3 + 2] + VP[c * 3 + 2]) / 3)) return;
    T.push(a, b, c);
  };
  const dd = (p, q) => (VP[p * 3] - VP[q * 3]) ** 2 + (VP[p * 3 + 1] - VP[q * 3 + 1]) ** 2 + (VP[p * 3 + 2] - VP[q * 3 + 2]) ** 2;
  // the quad's winding follows the sign change along its grid edge, so the surface comes out consistently oriented
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    if (dd(a, c) <= dd(b, d)) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
  };
  const C = (i, j, k) => cid[i + j * cx + k * cx * cy];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const b = i * sx + j * sy + k * sz, s0 = F[b] < 0;
    if ((F[b + sx] < 0) !== s0) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), !s0);
    if ((F[b + sy] < 0) !== s0) quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), !s0);
    if ((F[b + sz] < 0) !== s0) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), !s0);
  }
  return {P: new Float32Array(VP), T: new Int32Array(T)};
}

/* ---------- quadric error mesh simplification (Garland-Heckbert edge collapse) ---------- */
// Reduces an indexed mesh to about `target` triangles, spending them where the shape bends:
// a nose keeps its triangles, a flat robe panel loses them. Boundary edges (from culling) are pinned
// by extra constraint planes. Collapses that would flip a triangle or pinch the mesh are refused.
// Returns a new {P, T}. Cost is roughly O(n log n); a 20k-triangle part takes a few tens of ms.
export function simplify(mesh, target, opts = {}) {
  const P = Float64Array.from(mesh.P), T = Int32Array.from(mesh.T), nv = P.length / 3, ntri = T.length / 3;
  if (ntri <= target) return {P: new Float32Array(P), T: new Int32Array(T)};
  const Q = new Float64Array(nv * 10), alive = new Uint8Array(ntri).fill(1), vdead = new Uint8Array(nv), ver = new Uint32Array(nv);
  const VT = Array.from({length: nv}, () => []);
  const addQ = (v, a, b, c, d, w) => {
    const o = v * 10;
    Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
    Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d; Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
  };
  const fn = (a, b, c, out) => { // unnormalised face normal
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    out[0] = uy * wz - uz * wy; out[1] = uz * wx - ux * wz; out[2] = ux * wy - uy * wx; return out;
  };
  const n3 = [0, 0, 0], edgeCount = new Map(), ek = (a, b) => a < b ? a * nv + b : b * nv + a;
  for (let t = 0; t < ntri; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    VT[a].push(t); VT[b].push(t); VT[c].push(t);
    fn(a, b, c, n3); const l = Math.hypot(n3[0], n3[1], n3[2]);
    if (l < 1e-18) continue;
    const nx = n3[0] / l, ny = n3[1] / l, nz = n3[2] / l, d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]), w = l * 0.5;
    addQ(a, nx, ny, nz, d, w); addQ(b, nx, ny, nz, d, w); addQ(c, nx, ny, nz, d, w);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = ek(p, q); const e = edgeCount.get(k); edgeCount.set(k, e ? [e[0] + 1, t] : [1, t]); }
  }
  // pin open borders with planes perpendicular to their face
  for (const [k, [cnt, t]] of edgeCount) {
    if (cnt !== 1) continue;
    const a = Math.floor(k / nv), b = k % nv;
    fn(T[t * 3], T[t * 3 + 1], T[t * 3 + 2], n3);
    const ex = P[b * 3] - P[a * 3], ey = P[b * 3 + 1] - P[a * 3 + 1], ez = P[b * 3 + 2] - P[a * 3 + 2];
    let px = ey * n3[2] - ez * n3[1], py = ez * n3[0] - ex * n3[2], pz = ex * n3[1] - ey * n3[0];
    const l = Math.hypot(px, py, pz); if (l < 1e-18) continue; px /= l; py /= l; pz /= l;
    const d = -(px * P[a * 3] + py * P[a * 3 + 1] + pz * P[a * 3 + 2]), w = (ex * ex + ey * ey + ez * ez) * 20;
    addQ(a, px, py, pz, d, w); addQ(b, px, py, pz, d, w);
  }
  const qerr = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const qs = new Float64Array(10), cand = [0, 0, 0, 0];
  const evalEdge = (a, b) => {
    for (let i = 0; i < 10; i++) qs[i] = Q[a * 10 + i] + Q[b * 10 + i];
    // optimal point: solve the 3x3 system, fall back to the endpoints and midpoint when it is ill-conditioned
    const A = qs[0], B = qs[1], C = qs[2], D = qs[4], E = qs[5], F = qs[7];
    const det = A * (D * F - E * E) - B * (B * F - E * C) + C * (B * E - D * C);
    let best = Infinity;
    const L2 = (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
    const tryP = (x, y, z) => { const e = qerr(qs, x, y, z); if (e < best) { best = e; cand[0] = x; cand[1] = y; cand[2] = z; } };
    if (Math.abs(det) > 1e-12 * (A + D + F + 1e-30) ** 3) {
      const r0 = -qs[3], r1 = -qs[6], r2 = -qs[8];
      const x = (r0 * (D * F - E * E) - B * (r1 * F - E * r2) + C * (r1 * E - D * r2)) / det;
      const y = (A * (r1 * F - E * r2) - r0 * (B * F - E * C) + C * (B * r2 - r1 * C)) / det;
      const z = (A * (D * r2 - r1 * E) - B * (B * r2 - r1 * C) + r0 * (B * E - D * C)) / det;
      // only trust it near the edge
      const mx = (P[a * 3] + P[b * 3]) / 2, my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2, mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2;
      if ((x - mx) ** 2 + (y - my) ** 2 + (z - mz) ** 2 < L2) tryP(x, y, z);
    }
    tryP(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]); tryP(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]);
    tryP((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
    // a small length term keeps triangles from turning into long slivers on flat areas
    cand[3] = Math.max(best, 0) + L2 * L2 * (opts.lengthBias ?? 0.02);
    return cand;
  };
  // binary min-heap of edges, with lazy deletion through per-vertex version stamps
  let hc = [], ha = [], hb = [], hva = [], hvb = [], hp = [];
  const push = (a, b) => {
    const c = evalEdge(a, b);
    let i = hc.length; hc.push(c[3]); ha.push(a); hb.push(b); hva.push(ver[a]); hvb.push(ver[b]); hp.push(c[0], c[1], c[2]);
    while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; swap(i, p); i = p; }
  };
  const swap = (i, j) => {
    let t = hc[i]; hc[i] = hc[j]; hc[j] = t; t = ha[i]; ha[i] = ha[j]; ha[j] = t; t = hb[i]; hb[i] = hb[j]; hb[j] = t;
    t = hva[i]; hva[i] = hva[j]; hva[j] = t; t = hvb[i]; hvb[i] = hvb[j]; hvb[j] = t;
    for (let q = 0; q < 3; q++) { t = hp[i * 3 + q]; hp[i * 3 + q] = hp[j * 3 + q]; hp[j * 3 + q] = t; }
  };
  const r = [0, 0, 0, 0, 0, 0, 0, 0];
  const pop = () => {
    const n = hc.length - 1; swap(0, n);
    r[0] = hc[n]; r[1] = ha[n]; r[2] = hb[n]; r[3] = hva[n]; r[4] = hvb[n]; r[5] = hp[n * 3]; r[6] = hp[n * 3 + 1]; r[7] = hp[n * 3 + 2];
    hc.pop(); ha.pop(); hb.pop(); hva.pop(); hvb.pop(); hp.length -= 3;
    let i = 0; const m = hc.length;
    for (;;) { const l = 2 * i + 1, rr = l + 1; let s = i; if (l < m && hc[l] < hc[s]) s = l; if (rr < m && hc[rr] < hc[s]) s = rr; if (s === i) break; swap(i, s); i = s; }
    return r;
  };
  for (const k of edgeCount.keys()) push(Math.floor(k / nv), k % nv);
  const mark = new Uint32Array(nv), seen = new Uint32Array(nv); let stamp = 0;
  const nbr = (v, m, out) => { if (out) out.length = 0; for (const t of VT[v]) if (alive[t]) for (let q = 0; q < 3; q++) { const w = T[t * 3 + q]; if (w !== v && m[w] !== stamp) { m[w] = stamp; if (out) out.push(w); } } };
  const nlist = [];
  const isBorder = (a, b) => { let c = 0; for (const t of VT[a]) if (alive[t]) { const x = T[t * 3], y = T[t * 3 + 1], z = T[t * 3 + 2]; if (x === b || y === b || z === b) c++; } return c === 1; };
  const o3 = [0, 0, 0], m3 = [0, 0, 0];
  let live = ntri;
  while (live > target && hc.length) {
    pop(); const a = r[1], b = r[2], px = r[5], py = r[6], pz = r[7];
    if (vdead[a] || vdead[b] || ver[a] !== r[3] || ver[b] !== r[4]) continue;
    // link condition: the two ends may share only the two vertices opposite the edge
    stamp++; nbr(a, mark); nbr(b, seen, nlist); let common = 0; for (const w of nlist) if (mark[w] === stamp) common++;
    if (common > (isBorder(a, b) ? 1 : 2)) continue;
    // refuse flips: every surviving triangle must keep facing the same way
    let ok = true;
    for (const v of [a, b]) for (const t of VT[v]) {
      if (!alive[t]) continue;
      const i0 = T[t * 3], i1 = T[t * 3 + 1], i2 = T[t * 3 + 2];
      if ((i0 === a || i1 === a || i2 === a) && (i0 === b || i1 === b || i2 === b)) continue;
      fn(i0, i1, i2, o3);
      const s0 = P[v * 3], s1 = P[v * 3 + 1], s2 = P[v * 3 + 2]; P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz;
      fn(i0, i1, i2, m3); P[v * 3] = s0; P[v * 3 + 1] = s1; P[v * 3 + 2] = s2;
      const lo = Math.hypot(o3[0], o3[1], o3[2]), lm = Math.hypot(m3[0], m3[1], m3[2]);
      if (lm < 1e-20 || (o3[0] * m3[0] + o3[1] * m3[1] + o3[2] * m3[2]) < 0.25 * lo * lm) { ok = false; break; }
    }
    if (!ok) continue;
    // collapse b into a
    P[a * 3] = px; P[a * 3 + 1] = py; P[a * 3 + 2] = pz;
    for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
    for (const t of VT[b]) {
      if (!alive[t]) continue;
      const i0 = T[t * 3], i1 = T[t * 3 + 1], i2 = T[t * 3 + 2];
      if (i0 === a || i1 === a || i2 === a) { alive[t] = 0; live--; continue; }
      for (let q = 0; q < 3; q++) if (T[t * 3 + q] === b) T[t * 3 + q] = a;
      VT[a].push(t);
    }
    vdead[b] = 1; VT[b] = []; ver[a]++;
    VT[a] = VT[a].filter(t => alive[t]);
    stamp++; nbr(a, mark, nlist); for (const w of nlist.slice()) push(a, w); // only edges touching a changed cost; the rest of the heap stays valid
  }
  // compact
  const remap = new Int32Array(nv).fill(-1), OP = [], OT = [];
  for (let t = 0; t < ntri; t++) if (alive[t]) for (let q = 0; q < 3; q++) {
    const v = T[t * 3 + q]; if (remap[v] < 0) { remap[v] = OP.length / 3; OP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } OT.push(remap[v]);
  }
  return {P: new Float32Array(OP), T: new Int32Array(OT)};
}

// Indexed mesh -> the flat layout emit() wants: non-indexed triangles, `stride` floats per vertex:
// position xyz, normal xyz (from the SDF gradient, so shading stays smooth however coarse the triangles),
// then with opts.paint (stride 9): colour blend 0..1 and detail mask 0..1 from opts.paint(x,y,z,out2), and baked
// ambient occlusion 0..1 marched along the normal through the field (opts.ao = reach in metres, 0 = off).
// opts.project: pull each vertex back onto the surface first (undoes the smoothing error of simplification).
export function flatten(mesh, sdf, opts = {}) {
  const {P, T} = mesh, nv = P.length / 3, nf = opts.normalSdf || sdf, af = opts.aoSdf || sdf, eps = opts.eps || 0.0008, stride = opts.paint ? 9 : 6, aoR = opts.ao || 0;
  const V = new Float32Array(nv * stride), pp = [0, 0];
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    for (let it = 0; it < (opts.project ? 2 : 0); it++) {
      const d = sdf(x, y, z), gx = sdf(x + eps, y, z) - sdf(x - eps, y, z), gy = sdf(x, y + eps, z) - sdf(x, y - eps, z), gz = sdf(x, y, z + eps) - sdf(x, y, z - eps);
      const g2 = (gx * gx + gy * gy + gz * gz) / (4 * eps * eps); if (g2 < 1e-6) break;
      const s = Math.max(-opts.project, Math.min(opts.project, d / g2)) / (2 * eps);
      x -= gx * s; y -= gy * s; z -= gz * s;
    }
    let gx = nf(x + eps, y, z) - nf(x - eps, y, z), gy = nf(x, y + eps, z) - nf(x, y - eps, z), gz = nf(x, y, z + eps) - nf(x, y, z - eps);
    const l = 1 / (Math.hypot(gx, gy, gz) || 1), o = v * stride;
    V[o] = x; V[o + 1] = y; V[o + 2] = z; V[o + 3] = gx * l; V[o + 4] = gy * l; V[o + 5] = gz * l;
    if (stride === 9) {
      pp[0] = 0; pp[1] = 0; opts.paint(x, y, z, pp); V[o + 6] = pp[0]; V[o + 7] = pp[1];
      let occ = 0, w = 1;
      if (aoR > 0) for (let i = 1; i <= 5; i++) { const h = aoR * i / 5, q = af(x + V[o + 3] * h, y + V[o + 4] * h, z + V[o + 5] * h); occ += w * Math.max(0, h - q) / aoR; w *= 0.7; }
      V[o + 8] = Math.max(0.25, 1 - 0.9 * occ);
    }
  }
  const out = new Float32Array(T.length * stride);
  for (let i = 0; i < T.length; i++) out.set(V.subarray(T[i] * stride, T[i] * stride + stride), i * stride);
  out.stride = stride;
  return out;
}

// Old one-shot interface: surface nets straight to the flat 6-float layout.
export function sculpt(sdf, bounds, cell, opts = {}) {
  return flatten(sculptIndexed(sdf, bounds, cell, opts), sdf, {normalSdf: opts.normalSdf, eps: cell * 0.45});
}

// Split a mesh into colour groups by triangle centroid: fn(cx,cy,cz) -> group index.
// Used to paint one smooth surface with several materials (robe vs gold trim) so emit() can colour each.
export function partition(mesh, n, fn) {
  const g = Array.from({ length: n }, () => []);
  for (let i = 0; i < mesh.length; i += 18) {
    const k = fn((mesh[i] + mesh[i + 6] + mesh[i + 12]) / 3, (mesh[i + 1] + mesh[i + 7] + mesh[i + 13]) / 3, (mesh[i + 2] + mesh[i + 8] + mesh[i + 14]) / 3);
    if (k >= 0) for (let q = 0; q < 18; q++) g[k].push(mesh[i + q]);
  }
  return g.map(a => new Float32Array(a));
}
