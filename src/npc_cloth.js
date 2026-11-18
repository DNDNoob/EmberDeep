// npc_cloth.js - load-time cloth simulation (position based dynamics, Verlet) for garments, reusable for any NPC. See docs/npc-kit.md, "Cloth".
//
// Pipeline: a garment is a triangulated grid of rings (nu points round, nv rows), laid out loose around the posed body (robeRings, sleeveRings).
// The rest lengths come from that layout (times `gather` for cloth that is wider than the body it hangs on), then gravity, stretch / shear /
// bending constraints, pinned vertices (neckline, shoulder seam, sash line) and collisions against SDF colliders (the body, an underskirt, the
// floor) settle it. Output goes through the normal part path: meshFromGrid() makes LOD meshes (stride 9 + band) with paint, baked AO and
// band coordinates for the embroidery shader. All in plain JS (no THREE/DOM) so Node tools can bake it, sliced by yielding from the generators.
import {smoothstep, noise, fbm} from './sculpt.js';
const cl = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- collider from any SDF: sampled once on a grid (narrow band), then trilinear lookups with gradient ---------- */
export class SdfGrid {
  constructor(sdf, bounds, cell) {
    this.b = bounds; this.c = cell; this.sdf = sdf;
    this.nx = Math.ceil((bounds[3] - bounds[0]) / cell) + 1; this.ny = Math.ceil((bounds[4] - bounds[1]) / cell) + 1; this.nz = Math.ceil((bounds[5] - bounds[2]) / cell) + 1;
    this.F = new Float32Array(this.nx * this.ny * this.nz).fill(1);
  }
  *fill() {
    const {nx, ny, nz, c, F, sdf} = this, [x0, y0, z0] = this.b, BS = 4, safe = BS * c * 0.87 * 1.6; let tick = 0;
    for (let bk = 0; bk < nz; bk += BS) for (let bj = 0; bj < ny; bj += BS) for (let bi = 0; bi < nx; bi += BS) {
      if ((++tick & 63) === 0) yield;
      const ek = Math.min(nz, bk + BS), ej = Math.min(ny, bj + BS), ei = Math.min(nx, bi + BS);
      const dc = sdf(x0 + (bi + (ei - bi - 1) / 2) * c, y0 + (bj + (ej - bj - 1) / 2) * c, z0 + (bk + (ek - bk - 1) / 2) * c), far = Math.abs(dc) > safe;
      for (let k = bk; k < ek; k++) for (let j = bj; j < ej; j++) for (let i = bi, o = i + j * nx + k * nx * ny; i < ei; i++, o++) F[o] = far ? dc : sdf(x0 + i * c, y0 + j * c, z0 + k * c);
    }
  }
  // distance at (x,y,z); g (optional, length 3) receives the gradient. Outside the box: 1 (far).
  query(x, y, z, g) {
    const {nx, ny, c, F} = this, fx = (x - this.b[0]) / c, fy = (y - this.b[1]) / c, fz = (z - this.b[2]) / c;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= this.nz - 1) { if (g) g[0] = g[1] = g[2] = 0; return 1; }
    const i = fx | 0, j = fy | 0, k = fz | 0, tx = fx - i, ty = fy - j, tz = fz - k, o = i + j * nx + k * nx * ny, sy = nx, sz = nx * ny;
    const a = F[o], b = F[o + 1], d = F[o + sy], e = F[o + sy + 1], f = F[o + sz], h = F[o + sz + 1], m = F[o + sy + sz], n = F[o + sy + sz + 1];
    const x00 = a + (b - a) * tx, x10 = d + (e - d) * tx, x01 = f + (h - f) * tx, x11 = m + (n - m) * tx, y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
    if (g) {
      g[0] = ((b - a) * (1 - ty) + (e - d) * ty) * (1 - tz) / c + ((h - f) * (1 - ty) + (n - m) * ty) * tz / c;
      g[1] = (x10 - x00) * (1 - tz) / c + (x11 - x01) * tz / c; g[2] = (y1 - y0) / c;
    }
    return y0 + (y1 - y0) * tz;
  }
}

/* ---------- the simulation ---------- */
export class Cloth {
  // P: Float64Array xyz (initial = rest layout), nu/nv/closed: grid topology (vertex i + j*nu), rest scales: gather(i, j) multiplies the rest length of horizontal edges
  constructor(P, nu, nv, o = {}) {
    this.nu = nu; this.nv = nv; this.n = nu * nv; this.closed = o.closed !== false;
    this.x = Float64Array.from(P); this.p = Float64Array.from(P); this.w = new Float64Array(this.n).fill(1);
    this.layer = new Uint8Array(this.n);   // collider mask per vertex
    const ci = [], cj = [], cr = [], ck = [], P0 = P, nU = this.closed ? nu : nu - 1;
    const add = (a, b, k, sc = 1) => { ci.push(a); cj.push(b); cr.push(sc * Math.hypot(P0[a * 3] - P0[b * 3], P0[a * 3 + 1] - P0[b * 3 + 1], P0[a * 3 + 2] - P0[b * 3 + 2])); ck.push(k); };
    const id = (i, j) => (((i % nu) + nu) % nu) + j * nu, gu = o.gather || (() => 1), kb = o.bend ?? 0.12, ks = o.shear ?? 0.45;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nU; i++) {
      const g = gu(i, j);
      add(id(i, j), id(i + 1, j), 1, g);
      if (j + 1 < nv) { add(id(i, j), id(i, j + 1), 1); add(id(i, j), id(i + 1, j + 1), ks, g); add(id(i + 1, j), id(i, j + 1), ks, g); }
      if (kb > 0) { if (this.closed || i + 2 < nu) add(id(i, j), id(i + 2, j), kb, g * gu(i + 1, j)); if (j + 2 < nv) add(id(i, j), id(i, j + 2), kb); }
    }
    this.ci = Int32Array.from(ci); this.cj = Int32Array.from(cj); this.cr = Float64Array.from(cr); this.ck = Float64Array.from(ck);
    this.pins = []; this.colliders = [];
  }
  pin(i, p) { this.w[i] = 0; this.x[i * 3] = this.p[i * 3] = p[0]; this.x[i * 3 + 1] = this.p[i * 3 + 1] = p[1]; this.x[i * 3 + 2] = this.p[i * 3 + 2] = p[2]; }
  // collider: {query(x,y,z,g) -> d, thick, mu, mask}; floor: {y}
  *run(o = {}) {
    const steps = o.steps ?? 100, iters = o.iters ?? 8, dt = o.dt ?? 1 / 60, g = (o.gravity ?? 9.8) * dt * dt, damp = o.damp ?? 0.985, floor = o.floor, fth = o.floorThick ?? 0.002;
    const {x, p, w, ci, cj, cr, ck, n, layer} = this, nc = ci.length, gr = [0, 0, 0], cols = this.colliders;
    for (let s = 0; s < steps; s++) {
      if (s % 6 === 5) yield;
      const ramp = Math.min(1, (s + 1) / 12);
      for (let i = 0; i < n; i++) {
        if (w[i] === 0) continue;
        const o3 = i * 3;
        for (let k = 0; k < 3; k++) { const v = (x[o3 + k] - p[o3 + k]) * damp; p[o3 + k] = x[o3 + k]; x[o3 + k] += v; }
        x[o3 + 1] -= g * ramp;
      }
      for (let it = 0; it < iters; it++) {
        for (let c = 0; c < nc; c++) {
          const a = ci[c] * 3, b = cj[c] * 3, wa = w[ci[c]], wb = w[cj[c]], ws = wa + wb; if (ws === 0) continue;
          const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d < 1e-9) continue;
          const k = ck[c] * (d - cr[c]) / (d * ws);
          x[a] += wa * k * dx; x[a + 1] += wa * k * dy; x[a + 2] += wa * k * dz; x[b] -= wb * k * dx; x[b + 1] -= wb * k * dy; x[b + 2] -= wb * k * dz;
        }
        for (let i = 0; i < n; i++) {
          if (w[i] === 0) continue;
          const o3 = i * 3;
          if (floor !== undefined && x[o3 + 1] < floor + fth) { x[o3 + 1] = floor + fth; const m = 0.6; p[o3] += (x[o3] - p[o3]) * m; p[o3 + 2] += (x[o3 + 2] - p[o3 + 2]) * m; }
          for (let q = 0; q < cols.length; q++) {
            const C = cols[q]; if (!(C.mask & (1 << layer[i]))) continue;
            const d = C.query(x[o3], x[o3 + 1], x[o3 + 2], gr); if (d >= C.thick) continue;
            const gl = Math.hypot(gr[0], gr[1], gr[2]); if (gl < 1e-6) continue;
            const push = (C.thick - d) / gl, nx = gr[0] / gl, ny = gr[1] / gl, nz = gr[2] / gl;
            x[o3] += nx * push; x[o3 + 1] += ny * push; x[o3 + 2] += nz * push;
            // friction: remove a share of the tangential velocity (move the previous position along with the surface)
            const vx = x[o3] - p[o3], vy = x[o3 + 1] - p[o3 + 1], vz = x[o3 + 2] - p[o3 + 2], vn = vx * nx + vy * ny + vz * nz, mu = C.mu ?? 0.4;
            p[o3] += (vx - vn * nx) * mu; p[o3 + 1] += (vy - vn * ny) * mu; p[o3 + 2] += (vz - vn * nz) * mu;
          }
        }
      }
    }
  }
}

/* ---------- output: grid -> LOD meshes ---------- */
// X: positions (xyz per vertex) of an nu x nv grid; rows [j0, j1] and columns all (closed) form the part. opts:
//   paint(x,y,z,o) -> o[0]; band(i,j,x,y,z,o) -> o = [u, v, motif]; stride k for LODs; ao strength; flip: swap the winding; outward(x,y,z)->[nx,ny,nz] to orient normals
// Returns {mesh (stride 9 with .band), ...}
export function meshFromGrid(X, nu, nv, closed, o = {}) {
  const j0 = o.j0 ?? 0, j1 = o.j1 ?? nv - 1, si = o.si ?? 1, sj = o.sj ?? 1, nU = closed ? nu : nu - 1;
  // vertex normals and cavity from the full grid
  const N = o.N || gridNormals(X, nu, nv, closed, o.outward), AO = o.AO || gridAO(X, N, nu, nv, closed, o.aoK ?? 70);
  const cols = [], rows = [];
  for (let i = 0; i < nu; i += si) cols.push(i);
  if (!closed && cols[cols.length - 1] !== nu - 1) cols.push(nu - 1);
  for (let j = j0; j <= j1; j += sj) rows.push(j);
  if (rows[rows.length - 1] !== j1) rows.push(j1);
  const V = [], B = [], tmp = [0, 0, 0], cut = o.cut;
  const put = (i, j, u) => {
    const q = (i % nu) * 1 + j * nu, x = X[q * 3], y = X[q * 3 + 1], z = X[q * 3 + 2];
    tmp[0] = 0; tmp[1] = 0; if (o.paint) o.paint(x, y, z, tmp, i, j);
    V.push(x, y, z, N[q * 3], N[q * 3 + 1], N[q * 3 + 2], tmp[0], 0, cl(AO[q] * (o.aoMul ?? 1), 0.25, 1));
    if (o.band) { tmp[0] = 0; tmp[1] = 0; tmp[2] = 0; o.band(i, j, x, y, z, tmp, u); B.push(tmp[0], tmp[1], tmp[2]); } else B.push(0, 0, 0);
  };
  const nc = closed ? cols.length : cols.length - 1;
  for (let a = 0; a < rows.length - 1; a++) for (let b = 0; b < nc; b++) {
    const i0 = cols[b], i1 = closed && b + 1 === cols.length ? nu : cols[b + 1], r0 = rows[a], r1 = rows[a + 1];
    if (cut && cut(i0, i1, r0, r1)) continue;
    // u of the second column of a wrapped quad is i1 (= nu at the seam) so band u stays continuous inside each triangle
    const quad = o.flip ? [[i0, r0], [i0, r1], [i1, r1], [i0, r0], [i1, r1], [i1, r0]] : [[i0, r0], [i1, r0], [i1, r1], [i0, r0], [i1, r1], [i0, r1]];
    for (const [i, j] of quad) put(i, j, i);
  }
  const m = new Float32Array(V); m.stride = 9; m.band = new Float32Array(B); return m;
}
export function gridNormals(X, nu, nv, closed, outward) {
  const N = new Float64Array(nu * nv * 3), at = (i, j) => (((i % nu) + nu) % nu) + j * nu;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const ia = closed ? i - 1 : Math.max(0, i - 1), ib = closed ? i + 1 : Math.min(nu - 1, i + 1), a = at(ia, j), b = at(ib, j), c = at(i, Math.max(0, j - 1)), d = at(i, Math.min(nv - 1, j + 1));
    const ux = X[b * 3] - X[a * 3], uy = X[b * 3 + 1] - X[a * 3 + 1], uz = X[b * 3 + 2] - X[a * 3 + 2], vx = X[d * 3] - X[c * 3], vy = X[d * 3 + 1] - X[c * 3 + 1], vz = X[d * 3 + 2] - X[c * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const q = at(i, j) * 3; N[q] = nx; N[q + 1] = ny; N[q + 2] = nz;
  }
  if (outward) { let s = 0; for (let k = 0; k < nu * nv; k++) { const t = outward(X[k * 3], X[k * 3 + 1], X[k * 3 + 2]); s += N[k * 3] * t[0] + N[k * 3 + 1] * t[1] + N[k * 3 + 2] * t[2]; } if (s < 0) for (let k = 0; k < N.length; k++) N[k] = -N[k]; }
  return N;
}
// baked ambient occlusion from the cavity: how far a point lies below the mean of its grid neighbours, along the normal (valleys of folds darken)
export function gridAO(X, N, nu, nv, closed, K = 70) {
  const AO = new Float32Array(nu * nv), at = (i, j) => (((i % nu) + nu) % nu) + j * nu;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    let sx = 0, sy = 0, sz = 0, c = 0;
    for (const [di, dj] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ii = i + di, jj = j + dj; if (jj < 0 || jj >= nv || (!closed && (ii < 0 || ii >= nu))) continue;
      const q = at(ii, jj) * 3; sx += X[q]; sy += X[q + 1]; sz += X[q + 2]; c++;
    }
    const q = at(i, j) * 3, cav = c ? ((sx / c - X[q]) * N[q] + (sy / c - X[q + 1]) * N[q + 1] + (sz / c - X[q + 2]) * N[q + 2]) : 0;
    AO[at(i, j)] = cl(1 - K * Math.max(0, cav) * 1.0 + 4 * Math.min(0, cav) * 0, 0.4, 1);
  }
  return AO;
}

/* =====================================================================================
   GARMENTS: robe (neckline to floor) and bell sleeves, laid out loose around a K.body() figure, simulated, then split into parts
   ===================================================================================== */
const rot = (R, p) => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
const rotT = (R, p) => [R[0] * p[0] + R[3] * p[1] + R[6] * p[2], R[1] * p[0] + R[4] * p[1] + R[7] * p[2], R[2] * p[0] + R[5] * p[1] + R[8] * p[2]];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// o: {off, R (frame U in B: p_B = off + R p_U), skirtBase (B coords field of the smooth skirt), ease, hang, nu, rowsUp, rowsLow, folds, gather, seed, wearTop, wearSkirt, rag (hemLift fn),
//     sleeves: [{arm, pouch, nu, rows, gather}], hem: {cells, motif}, cuff: {cells, motif}, placket: {motif, cells}, iters, steps, floorY}
// Returns {parts: {torso, skirt, hem, placket, sleeve0, cuff0, ...}}: part specs for the baker ({gen}: generator returning LOD meshes).
export function clothDress(B, o) {
  const off = o.off, R = o.R, toB = p => { const q = rot(R, p); return [q[0] + off[0], q[1] + off[1], q[2] + off[2]]; }, toU = p => rotT(R, [p[0] - off[0], p[1] - off[1], p[2] - off[2]]);
  const ease = o.ease ?? 0.012, hang = o.hang ?? 0.03, nu = o.nu ?? 72, nUp = o.rowsUp ?? 18, nLow = o.rowsLow ?? 32, nv = nUp + nLow, floorY = o.floorY ?? 0, nf = o.folds ?? 12;
  const state = {done: false, res: null};
  let bodyGrid = null, X = null, robe = null, sleeves = [];
  const gather = o.gather ?? 0.06;
  // ---- skirt silhouette table: radius of the smooth skirt at (azimuth, height) in B coordinates ----
  const sb = o.skirtBase, NA = 48, NY = 40, YH = 0.58, rTab = new Float32Array(NA * NY);
  const marchR = (phi, y) => { const c = Math.cos(phi), s = Math.sin(phi); let lo = 0.0, hi = 0.35; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (sb(c * m, y, s * m) < 0) lo = m; else hi = m; } return (lo + hi) / 2; };
  const rAt = (phi, y) => {
    let fa = ((phi / (2 * Math.PI)) % 1 + 1) % 1 * NA, fy = cl(y / YH, 0, 1) * (NY - 1); const a0 = Math.floor(fa) % NA, a1 = (a0 + 1) % NA, y0 = Math.min(NY - 2, Math.floor(fy)), ta = fa - Math.floor(fa), ty = fy - y0;
    const g = (a, j) => rTab[a * NY + j];
    return (g(a0, y0) * (1 - ta) + g(a1, y0) * ta) * (1 - ty) + (g(a0, y0 + 1) * (1 - ta) + g(a1, y0 + 1) * ta) * ty;
  };
  const ulow = [0, 0, 0];
  // ---- robe layout (in B coordinates) ----
  function layoutRobe() {
    const F = (x, y, z) => B.torsoCloth(x, Math.max(y, hang), z) - ease, cx = 0.015, yTop = B.Y.neck - 0.06;
    const P = new Float64Array(nu * nv * 3), rows = [];
    for (let i = 0; i < nu; i++) {
      const th = i / nu * 2 * Math.PI, c = Math.cos(th), s = Math.sin(th);
      let lo = 0, hi = 0.35; for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (F(cx + c * m, yTop, s * m) < 0) lo = m; else hi = m; }
      let rho = (lo + hi) / 2, y = yTop; const poly = [[rho, y]];
      const e = 0.0008;
      for (let it = 0; it < 400 && y > 0; it++) {
        const px = cx + c * rho, pz = s * rho;
        let gx = F(px + e, y, pz) - F(px - e, y, pz), gy = F(px, y + e, pz) - F(px, y - e, pz), gz = F(px, y, pz + e) - F(px, y, pz - e);
        const gr = gx * c + gz * s, gl = Math.hypot(gr, gy) || 1; let tr = gy / gl, ty = -gr / gl; if (ty > 0) { tr = -tr; ty = -ty; }
        rho += tr * 0.004; y += ty * 0.004;
        for (let q = 0; q < 2; q++) { const qx = cx + c * rho, qz = s * rho, d = F(qx, y, qz), g2x = F(qx + e, y, qz) - F(qx - e, y, qz), g2y = F(qx, y + e, qz) - F(qx, y - e, qz), g2z = F(qx, y, qz + e) - F(qx, y, qz - e), gg = (g2x * g2x + g2y * g2y + g2z * g2z) / (4 * e * e) || 1; const sc = d / gg / (2 * e); rho -= (g2x * c + g2z * s) * sc; y -= g2y * sc; }
        poly.push([rho, y]);
      }
      // resample the walk at equal arc length to nUp rows, the last one exactly at y = 0 (the waist, where the torso part ends)
      const last = poly[poly.length - 1]; if (last[1] < 0 && poly.length > 1) { const p0 = poly[poly.length - 2], t = p0[1] / (p0[1] - last[1]); poly[poly.length - 1] = [p0[0] + (last[0] - p0[0]) * t, 0]; }
      const cum = [0]; for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
      for (let j = 0; j < nUp; j++) {
        const t = j / (nUp - 1) * cum[cum.length - 1]; let k = 1; while (k < cum.length - 1 && cum[k] < t) k++;
        const f = (t - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1), r = poly[k - 1][0] + (poly[k][0] - poly[k - 1][0]) * f, yy = poly[k - 1][1] + (poly[k][1] - poly[k - 1][1]) * f;
        let pr = r;
        const sw = smoothstep(0.55, 1, j / (nUp - 1)); pr += 0.0022 * sw * Math.sin(26 * th + 4 * j * 0.3);   // pinch folds gathering towards the sash
        const pu = [cx + c * pr, yy, s * pr], pb = toB(pu); P[(i + j * nu) * 3] = pb[0]; P[(i + j * nu) * 3 + 1] = pb[1]; P[(i + j * nu) * 3 + 2] = pb[2];
      }
    }
    // lower rows: from the waist ring down to the floor along the skirt silhouette, with seeded pleats growing towards the hem
    const yW = off[1], nFlat = 3, nSl = nLow - nFlat;
    for (let i = 0; i < nu; i++) {
      const th = i / nu * 2 * Math.PI, q0 = (i + (nUp - 1) * nu) * 3, wx = P[q0], wz = P[q0 + 2], phi = Math.atan2(wz, wx), ca = Math.cos(phi), sa = Math.sin(phi);
      const yWr = P[q0 + 1];
      for (let k = 1; k <= nLow; k++) {
        const j = nUp - 1 + k, flat = k > nSl, s = flat ? 1 : k / nSl, y = flat ? floorY + 0.003 : yWr * (1 - s) + floorY * s, ys = flat ? 0.003 : y;
        const rr = rAt(phi, Math.min(ys, YH - 0.02)) + 0.004;
        const w = smoothstep(0, 0.22, s), tx = rr * ca, tz = rr * sa;
        let X0 = wx * (1 - w) + tx * w, Z0 = wz * (1 - w) + tz * w;
        // pleats: tubular ridges whose width varies with angle and height, deeper towards the hem; noisy phase so no two folds match
        const fa = nf * phi + 1.4 * Math.sin(3 * phi + y * 5) + 2.6 * fbm(ca * 2, sa * 2, y * 3 + (o.seed ?? 0), 2), ridge = Math.pow(0.5 + 0.5 * Math.cos(fa), 0.75) * 2 - 1;
        const pf = smoothstep(0.03, 0.2, Math.abs(Math.atan2(sa, ca) - 0)), A = (0.003 + (o.pleat ?? 0.03) * Math.pow(s, 0.95)) * smoothstep(0, 0.12, s) * (0.25 + 0.75 * pf) , fb = 2.1 * nf * phi + 7 * fbm(ca * 3, sa * 3, y * 4 + 3, 2), small = 0.006 * s * smoothstep(0.1, 0.5, s) * Math.sin(fb);
        let dr = A * ridge + small;
        if (flat) { const m = k - nSl; dr = 0.008 * m + 0.004 * m * fbm(ca * 2.2, sa * 2.2, 7.3, 2) + 0.003 * ridge; }
        const rn = Math.hypot(X0, Z0) || 1;
        P[(i + j * nu) * 3] = X0 + X0 / rn * dr; P[(i + j * nu) * 3 + 1] = y; P[(i + j * nu) * 3 + 2] = Z0 + Z0 / rn * dr;
      }
    }
    return P;
  }
  // ---- sleeve layout (B coordinates): rings along the arm S -> E -> end, a bell opening from the elbow ----
  function layoutSleeve(sg) {
    const a = B.arms[sg.arm], nuS = sg.nu ?? 22, nvS = sg.rows ?? 26, pts = [a.S, a.E, a.end, [a.end[0] + a.F[0] * 0.006, a.end[1] + a.F[1] * 0.006, a.end[2] + a.F[2] * 0.006]];
    const seg = [], cum = [0]; for (let k = 1; k < pts.length; k++) { seg.push(Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2])); cum.push(cum[k - 1] + seg[k - 1]); }
    const total = cum[cum.length - 1], bell = sg.pouch ?? 0.05, P = new Float64Array(nuS * nvS * 3), axis = [];
    const up = norm(rot(R, [Math.sin(-0.0), 1, 0]));   // world up in B is y; ring zero angle points down (gravity) so the bell starts hanging
    for (let j = 0; j < nvS; j++) {
      const t = j / (nvS - 1) * total; let k = 1; while (k < pts.length - 1 && cum[k] < t) k++;
      const f = (t - cum[k - 1]) / seg[k - 1], p0 = pts[k - 1], p1 = pts[k], c = [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f];
      const T = norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]), s = t / total, sE = cum[1] / total;
      const ra = a.r[0] + (a.r[1] - a.r[0]) * Math.min(1, s / sE) * (s < sE ? 1 : 0) + (s >= sE ? a.r[1] + (a.r[2] - a.r[1]) * (s - sE) / (1 - sE) : 0);
      const wb = smoothstep(sE - 0.05, 1, s), rad = ra + 0.018 + (bell - 0.018 - a.r[2]) * Math.pow(wb, 1.4) + 0.0;
      const cB = toB(c), Tb = norm(rot(R, T)); let e1 = cross(Tb, [1, 0, 0]); if (Math.hypot(...e1) < 0.3) e1 = cross(Tb, [0, 0, 1]); e1 = norm(e1); const e2 = cross(Tb, e1);
      // orient e1 to point down in world (-y)
      let dn = [0, -1, 0]; const dd = dn[0] * e1[0] + dn[1] * e1[1] + dn[2] * e1[2], dd2 = dn[0] * e2[0] + dn[1] * e2[1] + dn[2] * e2[2]; const ang0 = Math.atan2(dd2, dd);
      axis.push(cB);
      for (let i = 0; i < nuS; i++) {
        const th = ang0 + i / nuS * 2 * Math.PI, ct = Math.cos(th), st = Math.sin(th), r2 = rad * (1 + 0.04 * Math.sin(5 * th + j * 0.5));
        const q = (i + j * nuS) * 3; P[q] = cB[0] + (e1[0] * ct + e2[0] * st) * r2; P[q + 1] = cB[1] + (e1[1] * ct + e2[1] * st) * r2; P[q + 2] = cB[2] + (e1[2] * ct + e2[2] * st) * r2;
      }
    }
    void up;
    return {P, nuS, nvS, axis, sg};
  }
  const toUArr = (P, n) => { const Q = new Float64Array(n * 3); for (let k = 0; k < n; k++) { const u = toU([P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]); Q[k * 3] = u[0]; Q[k * 3 + 1] = u[1]; Q[k * 3 + 2] = u[2]; } return Q; };
  function* ensure() {
    if (state.done) return;
    if (state.running) { while (!state.done) yield; return; }
    state.running = true;
    // 1. colliders
    bodyGrid = new SdfGrid(B.sdf, [-0.19, -0.14, -0.27, 0.30, 0.43, 0.27], o.gridCell ?? 0.0075); yield* bodyGrid.fill();
    const bodyCol = (thick, mask) => ({thick, mask, mu: 0.5, query: (x, y, z, g) => { const u = toU([x, y, z]), d = bodyGrid.query(u[0], u[1], u[2], g); if (g) { const w = rot(R, [g[0], g[1], g[2]]); g[0] = w[0]; g[1] = w[1]; g[2] = w[2]; } return d; }});
    // the robe rests exactly on the torso cloth field (no arms: the sleeves are separate), so stole and props that follow that field stay clear of it
    const Fr = (x, y, z) => B.torsoCloth(x, Math.max(y, hang), z) - ease;
    const robeGrid = new SdfGrid(Fr, [-0.19, -0.14, -0.27, 0.30, 0.43, 0.27], o.gridCell ?? 0.0075); yield* robeGrid.fill();
    const robeCol = (thick, mask) => ({thick, mask, mu: 0.5, query: (x, y, z, g) => { const u = toU([x, y, z]), d = robeGrid.query(u[0], u[1], u[2], g); if (g) { const w = rot(R, [g[0], g[1], g[2]]); g[0] = w[0]; g[1] = w[1]; g[2] = w[2]; } return d; }});
    for (let a = 0; a < NA; a++) for (let j = 0; j < NY; j++) rTab[a * NY + j] = marchR(a / NA * 2 * Math.PI, j / (NY - 1) * YH);
    yield;
    const under = (thick, mask, inset = 0) => ({thick, mask, mu: 0.4, query: (x, y, z, g) => {
      if (y > off[1] - 0.02) { if (g) g[0] = g[1] = g[2] = 0; return 1; }
      const r = Math.hypot(x, z) || 1e-6, phi = Math.atan2(z, x), R0 = rAt(phi, y) - inset, d = r - R0;
      if (g) { const dy = (rAt(phi, Math.min(YH, y + 0.01)) - rAt(phi, Math.max(0, y - 0.01))) / 0.02; g[0] = x / r; g[1] = -dy; g[2] = z / r; }
      return d;
    }});
    // 2. robe
    const P = layoutRobe(); X = P;
    const gu = (i, j) => j < nUp - 1 ? 1 : 1 + gather * smoothstep(0, 1, (j - nUp + 1) / (nLow - 3)) ** 1.2 * (0.8 + 0.4 * noise(i * 0.7, j * 0.2, 3.3));
    robe = new Cloth(P, nu, nv, {gather: gu, bend: o.bend ?? 0.2});
    robe.colliders.push(robeCol(0.001, 1), under(0.004, 1));
    for (let i = 0; i < nu; i++) { robe.pin(i, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); const q = (i + (nUp - 1) * nu) * 3; robe.pin(i + (nUp - 1) * nu, [P[q], P[q + 1], P[q + 2]]); }
    yield* robe.run({steps: o.steps ?? 90, iters: o.iters ?? 8, floor: floorY});
    // 3. sleeves
    for (const sg of o.sleeves) {
      const L = layoutSleeve(sg), cs = new Cloth(L.P, L.nuS, L.nvS, {gather: () => 1 + (sg.gather ?? 0), bend: 0.1});
      for (let r = 0; r < 2; r++) for (let i = 0; i < L.nuS; i++) { const q = (i + r * L.nuS) * 3; cs.pin(i + r * L.nuS, [L.P[q], L.P[q + 1], L.P[q + 2]]); }
      // diameter springs keep the rings open (cloth would otherwise flatten into a hanging sheet)
      const ci = [], cj = [], cr = [], ck = [], half = L.nuS / 2;
      for (let j = 2; j < L.nvS; j++) for (let i = 0; i < half; i++) { const a = i + j * L.nuS, b = i + half + j * L.nuS; ci.push(a); cj.push(b); cr.push(Math.hypot(L.P[a * 3] - L.P[b * 3], L.P[a * 3 + 1] - L.P[b * 3 + 1], L.P[a * 3 + 2] - L.P[b * 3 + 2]) * 0.8); ck.push(0.06); }
      cs.ci = Int32Array.from([...cs.ci, ...ci]); cs.cj = Int32Array.from([...cs.cj, ...cj]); cs.cr = Float64Array.from([...cs.cr, ...cr]); cs.ck = Float64Array.from([...cs.ck, ...ck]);
      cs.colliders.push(bodyCol(0.016, 1), under(0.016, 1));
      yield* cs.run({steps: o.sleeveSteps ?? 80, iters: o.iters ?? 8, floor: floorY});
      sleeves.push({L, cs});
    }
    state.done = true;
  }
  return {ensure, parts: null, internals: () => ({X, robe, sleeves, nu, nv, nUp, nLow, toU, toB, R, off}), nu, nv, nUp, nLow, state, nf, toU, toB};
}

// Part specs for the baker from a clothDress() object. Each returns {gen}: bakePartGen runs gen() (it triggers the shared simulation once) and gets one mesh per LOD.
// o: {wearTop, wearSkirt (paint fns), rag (hem lift fn), hem: {cells, rows}, cuff: {cells, rows}, placket: {motif, cells}, lods: [{si, sj}, ...]}
export function clothParts(cd, o) {
  const LODS = o.lods || [{si: 1, sj: 1}, {si: 2, sj: 2}, {si: 4, sj: 3}];
  const cache = {};
  const prep = () => {
    if (cache.ok) return cache;
    const I = cd.internals(), {robe, sleeves, nu, nv, nUp, toU, R, off} = I, Xb = robe.x;
    const Xu = new Float64Array(Xb.length); for (let k = 0; k < nu * nv; k++) { const u = toU([Xb[k * 3], Xb[k * 3 + 1], Xb[k * 3 + 2]]); Xu[k * 3] = u[0]; Xu[k * 3 + 1] = u[1]; Xu[k * 3 + 2] = u[2]; }
    const radial = (x, y, z) => [x - 0.015, 0, z];
    const NU = gridNormals(Xu, nu, nv, true, radial), AOu = gridAO(Xu, NU, nu, nv, true, o.aoK ?? 60);
    const NB = gridNormals(Xb, nu, nv, true, (x, y, z) => [x, 0, z]), AOb = gridAO(Xb, NB, nu, nv, true, o.aoK ?? 60);
    const sl = sleeves.map(({L, cs}) => {
      const Xs = new Float64Array(cs.x.length); for (let k = 0; k < L.nuS * L.nvS; k++) { const u = toU([cs.x[k * 3], cs.x[k * 3 + 1], cs.x[k * 3 + 2]]); Xs[k * 3] = u[0]; Xs[k * 3 + 1] = u[1]; Xs[k * 3 + 2] = u[2]; }
      const ax = L.axis.map(toU);
      const outw = (x, y, z) => { let b = 1e9, r = [1, 0, 0]; for (let k = 0; k < ax.length - 1; k++) { const a = ax[k], c = ax[k + 1], dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], t = cl(((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1), px = a[0] + dx * t - x, py = a[1] + dy * t - y, pz = a[2] + dz * t - z, d = px * px + py * py + pz * pz; if (d < b) { b = d; r = [-px, -py, -pz]; } } return r; };
      const N = gridNormals(Xs, L.nuS, L.nvS, true, outw);
      return {L, X: Xs, N, AO: gridAO(Xs, N, L.nuS, L.nvS, true, o.aoK ?? 60)};
    });
    return Object.assign(cache, {ok: true, I, Xu, Xb, NU, AOu, NB, AOb, sl});
  };
  const hemRows = o.hem?.rows ?? 6, cuffRows = o.cuff?.rows ?? 3, nuC = cd.nu, nvC = cd.nv, nUp = cd.nUp;
  const mk = fn => ({gen: function* () { yield* cd.ensure(); yield; const C = prep(); yield; return LODS.map(L => fn(C, L)); }});
  const parts = {};
  const jHem = nvC - 1 - hemRows;
  parts.torso = mk((C, L) => meshFromGrid(C.Xu, nuC, nvC, true, {j0: 0, j1: nUp - 1, si: L.si, sj: L.sj, N: C.NU, AO: C.AOu, paint: o.wearTop ? (x, y, z, t) => { t[0] = o.wearTop(x, y, z); } : null}));
  const plRows = [nUp, jHem], plOn = !!o.placket;
  parts.skirt = mk((C, L) => meshFromGrid(C.Xb, nuC, nvC, true, {j0: nUp - 1, j1: jHem, si: L.si, sj: L.sj, N: C.NB, AO: C.AOb, paint: o.wearSkirt ? (x, y, z, t) => { t[0] = o.wearSkirt(x, y, z); } : null,
    cut: plOn ? (i0, i1, r0, r1) => r0 >= plRows[0] - 1 && ((i0 === 0 && i1 > 0 && i1 <= L.si) || i1 === nuC) : null}));
  const cells = o.hem?.cells ?? 25, rag = o.rag;
  parts.hem = mk((C, L) => meshFromGrid(C.Xb, nuC, nvC, true, {j0: jHem, j1: nvC - 1, si: L.si, sj: L.sj, N: C.NB, AO: C.AOb, aoMul: 0.95,
    paint: (x, y, z, t) => { t[0] = 0.1 + 0.25 * smoothstep(0.1, 0, y); },
    band: (i, j, x, y, z, t) => { t[0] = i / nuC * cells; t[1] = 1 - (j - jHem) / (nvC - 1 - jHem); t[2] = o.hem?.motif ?? 1; },
    cut: rag ? (i0, i1, r0, r1) => { if (r1 !== nvC - 1) return false; const q = ((i0 + i1) / 2 % nuC) * 3 * 0 ; void q; const ii = Math.floor((i0 + i1) / 2) % nuC, k = (ii + r1 * nuC) * 3; return rag(C.Xb[k], C.Xb[k + 2]) > 0.0085; } : null}));
  if (plOn) parts.placket = mk((C, L) => {
    const cols = [-L.si, 0, L.si], idx = c => ((c % nuC) + nuC) % nuC;
    // custom small grid: 3 columns, rows nUp..jHem
    const rows = []; for (let j = nUp; j <= jHem; j += L.sj) rows.push(j); if (rows[rows.length - 1] !== jHem) rows.push(jHem);
    const V = [], Bd = [], len = [0];
    for (let a = 1; a < rows.length; a++) { const p = idx(0) + rows[a] * nuC, q = idx(0) + rows[a - 1] * nuC; len.push(len[a - 1] + Math.hypot(C.Xb[p * 3] - C.Xb[q * 3], C.Xb[p * 3 + 1] - C.Xb[q * 3 + 1], C.Xb[p * 3 + 2] - C.Xb[q * 3 + 2])); }
    const cellL = o.placket.cell ?? 0.034, lift = 0.0006;
    const put = (a, c) => { const k = idx(c) + rows[a] * nuC, x = C.Xb[k * 3], y = C.Xb[k * 3 + 1], z = C.Xb[k * 3 + 2]; V.push(x + C.NB[k * 3] * lift, y + C.NB[k * 3 + 1] * lift, z + C.NB[k * 3 + 2] * lift, C.NB[k * 3], C.NB[k * 3 + 1], C.NB[k * 3 + 2], 0.05, 0, Math.min(1, C.AOb[k] + 0.05)); Bd.push(len[a] / cellL, (c + L.si) / (2 * L.si), o.placket.motif ?? 2); };
    for (let a = 0; a < rows.length - 1; a++) for (let b = 0; b < 2; b++) { const c0 = cols[b], c1 = cols[b + 1]; put(a, c0); put(a, c1); put(a + 1, c1); put(a, c0); put(a + 1, c1); put(a + 1, c0); }
    const m = new Float32Array(V); m.stride = 9; m.band = new Float32Array(Bd); return m;
  });
  const nuS = (o.sleeveNu ?? 24);
  for (let s = 0; s < (o.sleeveCount ?? 2); s++) {
    const nvS = o.sleeveRows ?? 26, jc = nvS - 1 - cuffRows, ccells = o.cuff?.cells ?? 8;
    parts['sleeve' + s] = mk((C, L) => { const S = C.sl[s]; return meshFromGrid(S.X, nuS, nvS, true, {j0: 0, j1: jc, si: L.si, sj: L.sj, N: S.N, AO: S.AO, paint: o.wearTop ? (x, y, z, t) => { t[0] = o.wearTop(x, y, z); } : null}); });
    parts['cuff' + s] = mk((C, L) => { const S = C.sl[s]; return meshFromGrid(S.X, nuS, nvS, true, {j0: jc, j1: nvS - 1, si: L.si, sj: 1, N: S.N, AO: S.AO, aoMul: 0.95, paint: (x, y, z, t) => { t[0] = 0.1; },
      band: (i, j, x, y, z, t) => { t[0] = i / nuS * ccells; t[1] = (j - jc) / (nvS - 1 - jc); t[2] = o.cuff?.motif ?? 1; }}); });
  }
  return parts;
}
