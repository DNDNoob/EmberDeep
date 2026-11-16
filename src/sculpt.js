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
// opts.normalSdf: optional second field used only for normals (bump detail finer than the grid).
// opts.cull(cx,cy,cz): optional predicate, true drops a triangle (hidden caps etc).
// Returns Float32Array [px,py,pz,nx,ny,nz]* of non-indexed triangles, wound to agree with the normals.
export function sculpt(sdf, bounds, cell, opts = {}) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const F = new Float32Array(nx * ny * nz);
  for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++)
    F[o] = sdf(x0 + i * cell, y0 + j * cell, z0 + k * cell);
  const sx = 1, sy = nx, sz = nx * ny;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1, cid = new Int32Array(cx * cy * cz).fill(-1);
  const VP = []; // unique vertex positions
  // one vertex per cell that straddles the surface: the mean of the edge crossings
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
  // smooth normals from central differences of the field
  const nf = opts.normalSdf || sdf, eps = cell * 0.45, nv = VP.length / 3, VN = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const x = VP[v * 3], y = VP[v * 3 + 1], z = VP[v * 3 + 2];
    let gx = nf(x + eps, y, z) - nf(x - eps, y, z), gy = nf(x, y + eps, z) - nf(x, y - eps, z), gz = nf(x, y, z + eps) - nf(x, y, z - eps);
    const l = 1 / (Math.hypot(gx, gy, gz) || 1);
    VN[v * 3] = gx * l; VN[v * 3 + 1] = gy * l; VN[v * 3 + 2] = gz * l;
  }
  // one quad per sign-changing grid edge, shared by the four cells around it
  const out = [];
  const tri = (a, b, c) => {
    const ax = VP[a * 3], ay = VP[a * 3 + 1], az = VP[a * 3 + 2];
    const ux = VP[b * 3] - ax, uy = VP[b * 3 + 1] - ay, uz = VP[b * 3 + 2] - az, wx = VP[c * 3] - ax, wy = VP[c * 3 + 1] - ay, wz = VP[c * 3 + 2] - az;
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    if (opts.cull && opts.cull((ax + VP[b * 3] + VP[c * 3]) / 3, (ay + VP[b * 3 + 1] + VP[c * 3 + 1]) / 3, (az + VP[b * 3 + 2] + VP[c * 3 + 2]) / 3)) return;
    if (fx * fx + fy * fy + fz * fz < 1e-16) return; // degenerate sliver
    const dn = fx * (VN[a * 3] + VN[b * 3] + VN[c * 3]) + fy * (VN[a * 3 + 1] + VN[b * 3 + 1] + VN[c * 3 + 1]) + fz * (VN[a * 3 + 2] + VN[b * 3 + 2] + VN[c * 3 + 2]);
    const o = dn < 0 ? [a, c, b] : [a, b, c];
    for (const v of o) out.push(VP[v * 3], VP[v * 3 + 1], VP[v * 3 + 2], VN[v * 3], VN[v * 3 + 1], VN[v * 3 + 2]);
  };
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const dd = (p, q) => (VP[p * 3] - VP[q * 3]) ** 2 + (VP[p * 3 + 1] - VP[q * 3 + 1]) ** 2 + (VP[p * 3 + 2] - VP[q * 3 + 2]) ** 2;
    if (dd(a, c) <= dd(b, d)) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
  };
  const C = (i, j, k) => cid[i + j * cx + k * cx * cy];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const b = i * sx + j * sy + k * sz, s0 = F[b] < 0;
    if (i < nx - 1 && (F[b + sx] < 0) !== s0) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k));
    if (j < ny - 1 && (F[b + sy] < 0) !== s0) quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1));
    if (k < nz - 1 && (F[b + sz] < 0) !== s0) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k));
  }
  return new Float32Array(out);
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
