// keeper_sculpt.js - The Keeper as blended distance fields, meshed once with naive surface nets.
//
// The model is cut into a few rigid parts, one per frame that buildNpc() already animates:
//   skirt   (frame B)  robe from hem to waist, hem trim split off as gold
//   torso   (frame U)  chest, shoulders, bell sleeves, sash, collar and cowl in one melted surface
//   head    (frame H)  skull, brow, cheekbones, nose, ears, sunken eye sockets, neck: one surface
//   hair    (frame H)  white fringe, bushy brows, moustache
//   beard   (frame H)  moves with the jaw
//   gripHand / restHand  hands with smin-blended fingers, wrapped round the staff / resting on the sash
// Units are metres in each frame's local axes: +X forward, +Y up, +Z to the side.
// Every part is built once per LOD (cell sizes below) and cached.
import {sculpt, partition, smin, smax, ssub, smoothstep, sdSphere, sdEllipsoid, sdRoundCone, sdCapsule, fbm, noise, worley, setSeed} from './sculpt.js';

// grid pitch per part, metres. Fine near the player, coarse beyond ~6 m (about a third of the triangles).
const CELL = [
  {head: 0.0105, hair: 0.0125, beard: 0.0125, skirt: 0.026, torso: 0.019, hand: 0.0058},
  {head: 0.0165, hair: 0.019, beard: 0.019, skirt: 0.036, torso: 0.028, hand: 0.0085}
];
const D = Math.PI / 180, cl = (v, a, b) => Math.min(b, Math.max(a, v));
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

/* ---------- skirt: one flowing cone with baked folds ---------- */
function skirtSdf(x, y, z) {
  const t = cl(y / 0.5, 0, 1), rho = Math.hypot(x, z);
  if (rho > 0.26) return rho - 0.2;
  const a = Math.atan2(z, x);
  // silhouette: flared hem, soft S-curve up to the waist, a rolled hem edge
  let R = 0.092 + 0.083 * Math.pow(1 - t, 1.35) + 0.012 * smoothstep(0.12, 0, y) + 0.007 * Math.exp(-(((y - 0.022) / 0.02) ** 2));
  // long vertical folds that wander, deeper and wider near the hem
  const fa = 10 * a + 1.4 * Math.sin(3 * a + y * 5) + 2.6 * fbm(Math.cos(a) * 2, Math.sin(a) * 2, y * 3, 2);
  R *= 1 + (0.022 + 0.045 * (1 - t)) * Math.sin(fa) + 0.012 * (worley(Math.cos(a) * 2.4, y * 6, Math.sin(a) * 2.4) - 0.5);
  let d = (rho - R) * 0.8;
  d = smax(d, y - 0.53, 0.01);
  return smax(d, -y, 0.003);
}

/* ---------- torso: chest + shoulders + sleeves + sash + collar ---------- */
const S1 = [0, 0.215, 0.118], E1 = [0.07, 0.11, 0.16], W1 = [0.19, 0.17, 0.17];     // staff arm (matches the classic pose)
const S2 = [0, 0.215, -0.118], E2 = [0.03, 0.09, -0.15], W2 = [0.092, 0.058, -0.06]; // resting arm
const F1 = norm3([W1[0] - E1[0], W1[1] - E1[1], W1[2] - E1[2]]), F2 = norm3([W2[0] - E2[0], W2[1] - E2[1], W2[2] - E2[2]]);
const END1 = [W1[0] - 0.034 * F1[0], W1[1] - 0.034 * F1[1], W1[2] - 0.034 * F1[2]];
const END2 = [W2[0] - 0.024 * F2[0], W2[1] - 0.024 * F2[1], W2[2] - 0.024 * F2[2]];
const sleeve = (x, y, z, S, E, N, r0, r1, r2) => smin(sdRoundCone(x, y, z, S[0], S[1], S[2], E[0], E[1], E[2], r0, r1), sdRoundCone(x, y, z, E[0], E[1], E[2], N[0], N[1], N[2], r1, r2), 0.03);
function sashD(x, y, z) { // revolved rounded rectangle: the gold waist band
  const rho = Math.hypot(x, z * 0.94) - 0.09, q1 = Math.abs(rho) - 0.013 + 0.006, q2 = Math.abs(y - 0.017) - 0.027 + 0.006;
  return Math.hypot(Math.max(q1, 0), Math.max(q2, 0)) + Math.min(Math.max(q1, q2), 0) - 0.006;
}
function torsoSdf(x, y, z) {
  let d = smin(sdEllipsoid(x, y - 0.14, z, 0.08, 0.145, 0.108), sdEllipsoid(x + 0.035, y - 0.245, z, 0.085, 0.04, 0.115), 0.04);
  d = smin(d, sleeve(x, y, z, S1, E1, END1, 0.042, 0.045, 0.057), 0.035);
  d = smin(d, sleeve(x, y, z, S2, E2, END2, 0.042, 0.045, 0.054), 0.035);
  d = smin(d, sashD(x, y, z), 0.012);
  d = smin(d, sdEllipsoid(x, y - 0.268, z, 0.052, 0.02, 0.058), 0.02);            // collar roll
  d = smin(d, sdEllipsoid(x + 0.052, y - 0.255, z, 0.05, 0.042, 0.078), 0.04);    // bunched cowl at the back
  d = ssub(d, sdSphere(x - (END1[0] + 0.03 * F1[0]), y - (END1[1] + 0.03 * F1[1]), z - (END1[2] + 0.03 * F1[2]), 0.042), 0.004); // sleeve mouths
  d = ssub(d, sdSphere(x - (END2[0] + 0.026 * F2[0]), y - (END2[1] + 0.026 * F2[1]), z - (END2[2] + 0.026 * F2[2]), 0.04), 0.004);
  if (d < 0.03) { // soft drapery: folds wandering down from the shoulders, fading near the sash
    const a = Math.atan2(z, x), m = smoothstep(0.04, 0.12, y);
    d += 0.0042 * m * (Math.sin(11 * a + 4 * fbm(x * 18, y * 9, z * 18, 2)) + 0.5 * fbm(x * 40, y * 40, z * 40, 2));
  }
  return d;
}
// Gold trim (hem, sash, cuffs) is painted in the shader from local position, so its edges stay crisp at any grid size.
// These constants hand the cuff geometry to that shader.
const v3 = v => `vec3(${v.map(q => q.toFixed(5)).join(',')})`;
export const KEEPER_TRIM_GLSL = `const vec3 cE1=${v3(END1)},cF1=${v3(F1)},cE2=${v3(END2)},cF2=${v3(F2)};`;

/* ---------- head: one surface from skull, brow, cheeks, nose, ears, with carved sockets ---------- */
function headSdf(x, y, z) {
  const zs = Math.abs(z);
  let d = smin(sdEllipsoid(x - 0.005, y - 0.092, z, 0.083, 0.092, 0.079), sdEllipsoid(x - 0.03, y - 0.05, z, 0.058, 0.058, 0.056), 0.04);
  d = smin(d, sdSphere(x - 0.056, y - 0.07, zs - 0.046, 0.02), 0.022);                                           // cheekbones
  d = smin(d, sdCapsule(x, y, zs, 0.075, 0.107, 0, 0.068, 0.111, 0.05, 0.0125), 0.025);                          // brow ridge
  d = smin(d, sdRoundCone(x, y, zs, 0.078, 0.095, 0, 0.103, 0.053, 0, 0.009, 0.0135), 0.02);                    // nose
  d = smin(d, sdSphere(x - 0.091, y - 0.047, zs - 0.012, 0.0085), 0.012);                                         // nostril wings
  d = smin(d, sdEllipsoid(x, y - 0.08, zs - 0.08, 0.016, 0.027, 0.01), 0.012);                                    // ears
  d = smin(d, sdRoundCone(x, y, z, 0, 0.02, 0, -0.005, -0.07, 0, 0.036, 0.042), 0.03);                           // neck
  d = ssub(d, sdSphere(x - 0.088, y - 0.086, zs - 0.034, 0.0175), 0.012);                                          // eye sockets
  d = ssub(d, sdSphere(x - 0.052, y - 0.036, zs - 0.054, 0.02), 0.03);                                            // hollow cheeks (old face)
  d = ssub(d, sdEllipsoid(x - 0.006, y - 0.08, zs - 0.092, 0.008, 0.014, 0.008), 0.006);                          // ear concha
  return d + 0.0022 * fbm(x * 60, y * 60, z * 60, 2);
}

/* ---------- hair, brows and moustache (white, strandy) ---------- */
function hairSdf(x, y, z) {
  const zs = Math.abs(z);
  let d = sdEllipsoid(x + 0.03, y - 0.07, z, 0.08, 0.088, 0.088);
  d = smin(d, sdRoundCone(x, y, z, -0.05, 0.02, 0, -0.058, -0.07, 0, 0.05, 0.036), 0.03);                         // hair falling behind the neck
  d = smax(d, y - 0.133, 0.03);                                                                                  // bald crown
  d = smin(d, sdRoundCone(x, y, zs, 0.089, 0.105, 0.004, 0.075, 0.113, 0.05, 0.0095, 0.0105), 0.012);           // bushy brows
  d = smin(d, sdRoundCone(x, y, zs, 0.075, 0.113, 0.05, 0.062, 0.123, 0.068, 0.0105, 0.004), 0.01);
  d = smin(d, sdRoundCone(x, y, zs, 0.092, 0.04, 0.004, 0.08, 0.032, 0.034, 0.014, 0.011), 0.01);               // moustache
  d = smin(d, sdRoundCone(x, y, zs, 0.08, 0.032, 0.034, 0.062, 0.012, 0.056, 0.011, 0.006), 0.01);
  if (d < 0.02) d += 0.0035 * Math.sin(40 * Math.atan2(z, x + 0.03) + 25 * y + 4 * fbm(x * 30, y * 30, z * 30, 2));
  return d;
}

/* ---------- beard: tapered locks with a cleft at the tip ---------- */
function beardSdf(x, y, z) {
  const t = cl(-y / 0.215, 0, 1), tt = Math.pow(t, 1.3);
  const cx = 0.052 + 0.04 * tt + 0.004 * Math.sin(t * 9), wx = 0.04 * Math.pow(1 - t, 0.9) + 0.01, wz = 0.054 * Math.pow(1 - t, 1.05) + 0.011;
  const ux = (x - cx) / wx, uz = (z + 0.006 * Math.sin(t * 7)) / wz;
  let d = (Math.hypot(ux, uz) - 1) * Math.min(wx, wz) * 0.9;
  d = smin(d, sdEllipsoid(x - 0.045, y + 0.004, z, 0.05, 0.042, 0.056), 0.03);
  d = smax(d, y - 0.02, 0.02);
  d = smax(d, -(y + 0.218), 0.02);
  if (t > 0.55) d = ssub(d, Math.max(Math.abs(z) - 0.0035, Math.abs(y + 0.2) - 0.05, Math.abs(x - cx) - 0.05), 0.006); // forked tip
  if (d < 0.02) {
    const a = Math.atan2(uz, ux);
    d += 0.002 * Math.sin(a * 7 + t * 14 + 4 * fbm(x * 25, y * 12, z * 25, 2)) + 0.0015 * (worley(x * 90, y * 34, z * 90) - 0.5);
  }
  return d;
}

/* ---------- hands (local frame: fingers along +X for the resting hand, staff along +Y for the grip) ---------- */
function chain(x, y, z, pts, r0, r1, k) {
  let d = 9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], ra = r0 + (r1 - r0) * i / (pts.length - 1), rb = r0 + (r1 - r0) * (i + 1) / (pts.length - 1);
    d = smin(d, sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb), k);
  }
  return d;
}
const RR = 0.0178; // finger arc radius round the staff (shaft 0.013 + half a finger)
const arc = (th0, th1, y0, y1, n) => Array.from({length: n}, (_, i) => { const u = i / (n - 1), th = (th0 + (th1 - th0) * u) * D; return [RR * Math.cos(th), y0 + (y1 - y0) * u, RR * Math.sin(th)]; });
const GRIP = [ // index, middle, ring, pinky: start angle, end angle, y, drop, radius
  [152, -18, 0.0165, -0.004, 0.0058], [148, -14, 0.0045, -0.004, 0.0059], [150, -4, -0.0075, -0.004, 0.0056], [152, 14, -0.0185, -0.003, 0.0047]
].map(f => ({pts: arc(f[0], f[1], f[2], f[2] + f[3], 5), r: f[4]}));
const THUMB = [[-0.026, 0.016, -0.012], ...arc(215, 318, 0.027, 0.032, 5)];
function gripSdf(x, y, z) {
  let d = sdEllipsoid(x + 0.03, y + 0.001, z - 0.004, 0.017, 0.031, 0.022);                  // palm behind the staff
  d = smin(d, sdRoundCone(x, y, z, -0.085, -0.014, 0.0, -0.03, -0.002, 0.0, 0.017, 0.024), 0.02); // wrist, runs into the sleeve
  for (const f of GRIP) d = smin(d, chain(x, y, z, f.pts, f.r, f.r * 0.86, 0.004), 0.006);
  d = smin(d, chain(x, y, z, THUMB, 0.0078, 0.0052, 0.004), 0.008);
  return d + 0.0006 * fbm(x * 220, y * 220, z * 220, 1);
}
const FINGERS = [ // z of the knuckle, length, curl
  [0.0165, 0.030, 0.8], [0.0055, 0.034, 1], [-0.0055, 0.031, 1.1], [-0.0165, 0.024, 1.25]
];
function restSdf(x, y, z) {
  let d = sdEllipsoid(x, y, z, 0.022, 0.0085, 0.021);                                           // palm
  d = smin(d, sdRoundCone(x, y, z, -0.075, 0.0, 0.0, -0.012, 0.0, 0.0, 0.0155, 0.0185), 0.012);  // wrist
  for (const f of FINGERS) {
    const L = f[1], c = f[2], kx = 0.02, p = [[kx, 0, f[0]], [kx + L * 0.38, -0.0012 * c, f[0] * 1.02], [kx + L * 0.7, -0.005 * c, f[0] * 1.04], [kx + L, -0.011 * c, f[0] * 1.06]];
    d = smin(d, chain(x, y, z, p, 0.0059, 0.0046, 0.003), 0.007);
  }
  d = smin(d, chain(x, y, z, [[0.002, -0.001, -0.02], [0.016, -0.002, -0.032], [0.03, -0.004, -0.035]], 0.0078, 0.0054, 0.004), 0.01); // thumb (on -Z)
  return d + 0.0006 * fbm(x * 220, y * 220, z * 220, 1);
}

/* ---------- build and cache ---------- */
const cache = [null, null];
export const keeperStats = {ms: [0, 0], verts: [0, 0], parts: {}};
export function getKeeperSculpt(lod) {
  if (cache[lod]) return cache[lod];
  const t0 = performance.now(), c = CELL[lod], P = {};
  setSeed(4242);
  const skirt = sculpt(skirtSdf, [-0.21, -0.02, -0.21, 0.21, 0.55, 0.21], c.skirt, {cull: (x, y) => y < 0.0035});
  P.skirt = skirt;
  P.torso = sculpt(torsoSdf, [-0.16, -0.045, -0.25, 0.27, 0.33, 0.25], c.torso);
  P.head = sculpt(headSdf, [-0.11, -0.1, -0.11, 0.13, 0.2, 0.11], c.head, {cull: (x, y) => y < -0.045});
  P.hair = sculpt(hairSdf, [-0.13, -0.09, -0.11, 0.1, 0.16, 0.11], c.hair, {cull: (x, y, z) => headSdf(x, y, z) < -0.002}); // drop the part buried in the skull
  P.beard = sculpt(beardSdf, [-0.03, -0.24, -0.09, 0.14, 0.04, 0.09], c.beard, {cull: (x, y, z) => headSdf(x, y, z) < -0.003});
  P.grip = sculpt(gripSdf, [-0.1, -0.045, -0.04, 0.04, 0.055, 0.04], c.hand);
  P.rest = sculpt(restSdf, [-0.09, -0.03, -0.05, 0.07, 0.03, 0.05], c.hand);
  let n = 0;
  for (const k in P) { const v = P[k].length / 6; keeperStats.parts[k + lod] = v; n += v; }
  keeperStats.ms[lod] = performance.now() - t0; keeperStats.verts[lod] = n;
  // frames for the hands, expressed in the upper-body frame U
  const f = F2, up = [0.9, 0.2, -0.35], dotp = up[0] * f[0] + up[1] * f[1] + up[2] * f[2];
  const Y = norm3([up[0] - dotp * f[0], up[1] - dotp * f[1], up[2] - dotp * f[2]]), Z = [f[1] * Y[2] - f[2] * Y[1], f[2] * Y[0] - f[0] * Y[2], f[0] * Y[1] - f[1] * Y[0]];
  P.restR = [f[0], Y[0], Z[0], f[1], Y[1], Z[1], f[2], Y[2], Z[2]];
  P.restAt = W2; P.gripAt = W1;
  P.mouth = [0.083, 0.086, 0.034];
  return cache[lod] = P;
}
