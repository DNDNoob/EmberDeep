// npc_kit.js - a small kit for sculpting NPCs from distance fields.
//
// How it fits together (see docs/npc-kit.md for the how-to):
//   part builders  head(), brows(), hairCap(), moustache(), beard(), hand(), robeSkirt(), robeTorso(), trimBand()
//                  each returns a PART SPEC: {sdf, bounds, cell, tris:[near, far], cull?, paint?, project?}
//                  plus landmarks other parts need (eye centres, sleeve ends, the staff axis...).
//   eyeRig()       parametric eyeballs, irises and eyelids (not SDF: lids must rotate to blink).
//   bakeRecipe()   turns a character recipe (plain data, see src/npc_recipes.js) into cached meshes:
//                  surface nets on a fine grid -> quadric simplification to the part's triangle budget
//                  (near LOD) -> further to the far budget -> flat arrays with SDF normals and paint.
//
// Conventions: metres, each part in its own frame: +X forward (the way the face looks), +Y up, +Z to the
// character's side. Mesh layout is stride 9: position xyz, normal xyz, paint (0 = colour, 1 = second colour),
// detail mask (0..1, drives wrinkles / fine bump in the shader), baked ambient occlusion (1 = open).
// game.js poses these with emitS().
import {ANTHRO, HEAD_H} from './anthro.js';
import {sculptIndexed, simplify, flatten, smin, smax, ssub, smoothstep, sdSphere, sdEllipsoid, sdRoundCone, sdCapsule, sdBox, fbm, noise, worley, setSeed} from './sculpt.js';

const D2R = Math.PI / 180, cl = (v, a, b) => Math.min(b, Math.max(a, v));
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const gauss = (x, y, z, c, r) => Math.exp(-(((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2) / (r * r)));
export {norm3};
// Evaluate a field that lives in another frame. A child frame sits at `off` with rotation R (row-major 3x3,
// columns = child axes in parent coords), exactly like subF(parent, off, R) in game.js.
//   inChild(childSdf, off, R)  -> field of the child, in parent coordinates
//   inParent(parentSdf, off, R) -> field of the parent, in child coordinates
export const inChild = (sdf, off, R) => (x, y, z) => { const a = x - off[0], b = y - off[1], c = z - off[2]; return sdf(R[0] * a + R[3] * b + R[6] * c, R[1] * a + R[4] * b + R[7] * c, R[2] * a + R[5] * b + R[8] * c); };
export const inParent = (sdf, off, R) => (x, y, z) => sdf(off[0] + R[0] * x + R[1] * y + R[2] * z, off[1] + R[3] * x + R[4] * y + R[5] * z, off[2] + R[6] * x + R[7] * y + R[8] * z);
export const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
export const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
// Rotation whose X axis is `fwd` and whose Y axis is as close as possible to `up` (columns X, Y, Z).
export function basis(fwd, up) {
  const f = norm3(fwd), dp = up[0] * f[0] + up[1] * f[1] + up[2] * f[2], Y = norm3([up[0] - dp * f[0], up[1] - dp * f[1], up[2] - dp * f[2]]);
  const Z = [f[1] * Y[2] - f[2] * Y[1], f[2] * Y[0] - f[0] * Y[2], f[0] * Y[1] - f[1] * Y[0]];
  return [f[0], Y[0], Z[0], f[1], Y[1], Z[1], f[2], Y[2], Z[2]];
}

// Smooth chain of tapered capsules through points pts, radius r0 at the first point to r1 at the last.
export function chain(x, y, z, pts, r0, r1, k) {
  let d = 9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], ra = r0 + (r1 - r0) * i / (pts.length - 1), rb = r0 + (r1 - r0) * (i + 1) / (pts.length - 1);
    d = smin(d, sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb), k);
  }
  return d;
}

/* =====================================================================================
   HEAD  (frame H: origin at the top of the neck; the old face() layout, head centre ~ (0.005,0.085,0))
   ===================================================================================== */
// p: {age 0..1, jaw 0.8..1.2 (width), chin, nose:{len, width, droop, bulb}, brow 0..1.5 (heaviness),
//     cheek:{bone, sag}, ears (size), eye:{x,y,z (centre, z = half spacing), r}, skull:[rx,ry,rz], neck}
export function head(p = {}) {
  const age = p.age ?? 0.8, jaw = p.jaw ?? 1, brow = p.brow ?? 1, ears = p.ears ?? 1, chin = p.chin ?? 1;
  const nose = {len: 1, width: 1, droop: 0.5, bulb: 1, ...(p.nose || {})}, cheek = {bone: 1, sag: age, ...(p.cheek || {})};
  const E = {x: 0.0735, y: 0.088, z: ANTHRO.interpupillary / 2 * HEAD_H, r: ANTHRO.eyeball / 2 * HEAD_H, ...(p.eye || {})};   // eyeball 24 mm, IPD 64 mm (ANTHRO)
  const sk = p.skull || [0.083, 0.09, 0.075], neck = p.neck ?? 1;
  const nb = [E.x + 0.013, E.y + 0.008];                                         // nose root, between the eyes
  const nt = [E.x + 0.012 + 0.022 * nose.len, E.y - 0.037 * nose.len - 0.004 * nose.droop]; // nose tip
  const ex = E.x, ey = E.y, ez = E.z, er = E.r;
  const mouthY = nt[1] - 0.029, mouthX = nt[0] - 0.016;
  // the bony mass: cranium, face block, jaw; exported for parts that wrap the head (hair, beard)
  const skull = (x, y, z) => smin(sdEllipsoid(x + 0.004, y - 0.1, z, sk[0], sk[1], sk[2]), sdEllipsoid(x - 0.034, y - 0.058, z, 0.055, 0.062, 0.058 * jaw), 0.04);
  // skull plus jaw, no ears or nose: what a beard or a hood wraps
  const jawSdf = (x, y, z) => smin(skull(x, y, z), sdRoundCone(x, y, Math.abs(z), -0.004, 0.05, 0.05 * jaw, mouthX - 0.004, mouthY - 0.028 * chin, 0.012, 0.02, 0.016 * chin), 0.03);
  function sdf(x, y, z) {
    const zs = Math.abs(z);
    let d = jawSdf(x, y, z);
    d = smin(d, sdEllipsoid(x - 0.052, y - 0.128, z, 0.035, 0.026, 0.05), 0.03);                                     // frontal bossing
    // heavy brow ridge, thickest over the inner eye, ending at the temple
    d = smin(d, sdCapsule(x, y, zs, ex + 0.014, ey + 0.016, 0.008, ex + 0.004, ey + 0.017, ez + 0.017, 0.0085 * brow), 0.016);
    d = smin(d, sdSphere(x - (ex + 0.009), y - (ey + 0.012), zs - 0.012, 0.009 * brow), 0.012);                     // glabella / brow knot
    // cheekbones and the sagging cheek pad below them (old: lower and further forward)
    d = smin(d, sdSphere(x - (ex - 0.012), y - (ey - 0.02), zs - (ez + 0.015), 0.015 * cheek.bone), 0.02);
    d = smin(d, sdEllipsoid(x - (ex + 0.003), y - (ey - 0.042 - 0.006 * cheek.sag), zs - (ez + 0.004), 0.013, 0.017, 0.016), 0.012);
    // nose: a narrow bridge from between the brows, a bulbous tip, flared wings
    d = smin(d, sdRoundCone(x, y, zs, nb[0], nb[1], 0, nt[0] - 0.002, nt[1] + 0.006, 0, 0.0058 * nose.width, 0.0085 * nose.width), 0.006);
    d = smin(d, sdSphere(x - nt[0], y - nt[1], zs, 0.0095 * nose.bulb * nose.width), 0.008);
    d = smin(d, sdSphere(x - (nt[0] - 0.011), y - (nt[1] - 0.003), zs - 0.0105 * nose.width, 0.0068 * nose.width), 0.007);
    // upper lip and mouth (mostly under the moustache)
    d = smin(d, sdEllipsoid(x - (mouthX - 0.002), y - (mouthY + 0.007), z, 0.009, 0.009, 0.019), 0.012);
    d = smin(d, sdEllipsoid(x - (mouthX - 0.003), y - (mouthY - 0.006), z, 0.008, 0.006, 0.015), 0.006);         // lower lip
    d = ssub(d, sdEllipsoid(x - mouthX - 0.004, y - mouthY, z, 0.006, 0.0016, 0.016), 0.002);                     // mouth slit
    // ears are their own part (ears(H) below), not blended into the head, so they keep a rim and a bowl
    d = smin(d, sdRoundCone(x, y, z, -0.004, 0.02, 0, -0.008, -0.07, 0, 0.034 * neck, 0.04 * neck), 0.03);         // neck
    // carve: eye sockets (the eyeball fills them), orbital hollow, temples, nasolabial folds, under-eye bags
    d = ssub(d, sdSphere(x - ex, y - ey, zs - ez, er * 1.04), 0.003);
    d = smin(d, sdEllipsoid(x - (ex + 0.002), y - (ey - er * 1.02), zs - ez, er * 0.9, er * 0.32, er * 1.15), 0.003); // lower orbital rim closes the socket under the lid
    d = ssub(d, sdEllipsoid(x - (ex + 0.013), y - (ey + 0.002), zs - (ez - 0.001), 0.004, 0.007, 0.0145), 0.008);   // shallow hollow round the lids (was a deep 6 mm pit: the dark ring)
    d = ssub(d, sdSphere(x - 0.04, y - (ey + 0.01), zs - 0.082, 0.014), 0.012 * (0.5 + age));
    if (age > 0) {
      // fold from the nose wing down past the mouth corner
      d = ssub(d, sdCapsule(x, y, zs, nt[0] - 0.011, nt[1] - 0.004, 0.019 * nose.width, mouthX - 0.004, mouthY - 0.012, 0.026, 0.0028 * age), 0.004);
      // a soft bag under each eye, with the tear trough above it
      d = smin(d, sdEllipsoid(x - (ex + 0.008), y - (ey - 0.0175), zs - ez, 0.004, 0.004 * (0.6 + age * 0.6), 0.011), 0.004);
    }
    return d + 0.0005 * fbm(x * 45, y * 45, z * 45, 2);
  }
  // paint: 1 = ruddy/shadow colour. Red nose and cheeks, darker sockets and lips, ear rims.
  const paint = (x, y, z, o) => {
    const zs = Math.abs(z);
    o[0] = cl(0.8 * gauss(x, y, zs, [nt[0], nt[1], 0], 0.016) + 0.45 * gauss(x, y, zs, [ex + 0.006, ey - 0.03, ez + 0.012], 0.017) +
      0.2 * gauss(x, y, zs, [ex + 0.006, ey, ez], 0.011) + 0.5 * gauss(x, y, zs, [ex + 0.004, ey - 0.002, ez - 0.0135], 0.0035) + 0.5 * gauss(x, y, zs, [mouthX, mouthY, 0], 0.01) + 0.35 * gauss(x, y, zs, [0.006, ey + 0.012, 0.085], 0.012), 0, 1);
    // detail mask: forehead lines, crow's feet, under the eyes
    o[1] = cl(age * (smoothstep(ey + 0.022, ey + 0.035, y) * smoothstep(0.05, 0.075, x) * smoothstep(0.06, 0.03, zs) +
      gauss(x, y, zs, [ex - 0.002, ey, ez + 0.018], 0.01) + 0.7 * gauss(x, y, zs, [ex + 0.008, ey - 0.016, ez], 0.009)), 0, 1);
  };
  return {
    sdf, skull, jawSdf, paint, bounds: [-0.11, -0.1, -0.11, 0.135, 0.2, 0.11], cell: p.cell || 0.0056, tris: p.tris || [1250, 460],
    cull: (x, y) => y < -0.045, project: 0.003,
    eye: E, noseTip: nt, noseRoot: nb, mouth: [mouthX, mouthY, 0], age
  };
}

/* ---------- ears: a separate small SDF part (both ears), anatomically placed ---------- */
// Sizes come from ANTHRO (ratios of head height): length 0.27, breadth 0.55 of length, ~20 mm protrusion at the rim.
// Ear space: pivot = the front edge of the ear on the skull at ear mid-height. `a` runs backwards along the ear plate, `v`
// up along the (back-tilted) long axis, `w` out of the plate. The plate is swung out about the pivot by `flare`, so the front
// stays on the skull and the rear rim stands off it. Pieces: helix (a rolled C-shaped rim, thicker over the top and back),
// scapha/fossa plate, concha bowl (recessed, leading to the canal), antihelix Y ridge (stem plus two crura), tragus, antitragus,
// soft lobe, and a wall (root) joining the concha to the skull.  p: {size, x (front edge), y (centre height), flare, tilt}
export function ears(H, p = {}) {
  const es = (p.size ?? 1) * (1 + 0.1 * H.age) * ANTHRO.earLength * HEAD_H / 0.066 * 0.78;   // 0.78: the helix rim and lobe add to the nominal outline, so total extent = ANTHRO.earLength
  const px = p.x ?? 0.01, cy = p.y ?? 0.075, fl = p.flare ?? ANTHRO.earFlare, tl = p.tilt ?? ANTHRO.earTilt;
  const ct = Math.cos(tl), st = Math.sin(tl), cp = Math.cos(fl), sp = Math.sin(fl);
  let lo = 0.04, hi = 0.12; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (H.skull(px, cy, m) < 0) lo = m; else hi = m; }
  const pz = lo - 0.002;   // sink the front edge into the skull a little
  const HW = 0.018, HL = 0.0335;   // half breadth (a) and half length (v) of the outline, kit metres at es = 1
  function sdf(x, y, z) {
    const dx = x - px, dy = y - cy, dz = Math.abs(z) - pz;
    const v0 = -dx * st + dy * ct, f = dx * ct + dy * st;
    const a = (-f * cp + dz * sp) / es, w = (f * sp + dz * cp) / es, v = v0 / es;
    if (Math.abs(v) > 0.05 || a < -0.02 || a > 0.05 || Math.abs(w) > 0.05) return 0.02 * es;   // bounding box
    const ea = a - HW, aw = HW * (1 + 0.2 * v / HL * (v > 0 ? 1 : 0.6)), r0 = Math.hypot(ea / aw, v / HL);   // egg outline, wider at the top
    const q = (r0 - 1) * 0.018;                                                                              // signed-ish distance to the outline
    const curl = 0.0038 + 0.0012 * smoothstep(-0.005, 0.02, v) + 0.0008 * smoothstep(0.0, 0.03, a);          // rim thicker at the top and back
    let d = Math.hypot(q, w - 0.0046 - 0.0010 * smoothstep(0, 0.03, v)) - curl;                                // helix: the rolled rim, a C round the plate
    const bowl = 0.0058 * Math.exp(-(((a - 0.0115) / 0.0078) ** 2 + ((v + 0.006) / 0.0125) ** 2));            // concha dips below the scapha
    const plate = smax(q + 0.002, Math.abs(w - 0.0028 + bowl) - 0.0017, 0.0012);
    d = smin(d, plate, 0.0016);
    // antihelix Y: stem from the lower concha rim up, forking into superior and inferior crura
    const ah = Math.min(sdCapsule(a, v, w, 0.022, -0.011, 0.0065, 0.0155, 0.004, 0.0075, 0.0033),
      Math.min(sdCapsule(a, v, w, 0.0155, 0.004, 0.0075, 0.0135, 0.021, 0.0065, 0.0028), sdCapsule(a, v, w, 0.0155, 0.004, 0.0075, 0.006, 0.0125, 0.0066, 0.0026)));
    d = smin(d, ah, 0.0018);
    d = smin(d, sdEllipsoid(a - 0.0025, v + 0.001, w - 0.0045, 0.0055, 0.0072, 0.0042), 0.0016);               // tragus, a flap over the canal
    d = smin(d, sdEllipsoid(a - 0.0135, v + 0.0185, w - 0.0043, 0.0045, 0.0045, 0.003), 0.0015);              // antitragus
    const lobe = sdEllipsoid(a - 0.0135, v + 0.0285, w - 0.0012, 0.0078, 0.0092, 0.0036);                      // soft earlobe
    d = smin(d, lobe, 0.003);
    d = smin(d, sdCapsule(a, v, w, 0.004, -0.001, -0.016, 0.0125, 0.0015, -0.0006, 0.0085), 0.004);            // wall: concha to skull
    d = smin(d, sdCapsule(a, v, w, 0.004, -0.024, -0.012, 0.012, -0.027, -0.0015, 0.0055), 0.003);            // lobe attaches to the cheek at the front
    return d * es;
  }
  return {sdf, bounds: [-0.06, 0.02, -0.12, 0.04, 0.135, 0.12], cell: p.cell || 0.0021, tris: p.tris || [560, 200],
    cull: (x, y, z) => H.sdf(x, y, z) < -0.0008, project: 0.0012, ao: 0.006,
    paint: (x, y, z, o) => {   // pinker rim and lobe, darker bowl
      const dx = x - px, dy = y - cy, dz = Math.abs(z) - pz, f = dx * ct + dy * st, a = (-f * cp + dz * sp) / es, v = (-dx * st + dy * ct) / es;
      o[0] = 0.3 + 0.5 * Math.exp(-(((a - 0.0115) / 0.008) ** 2 + ((v + 0.006) / 0.012) ** 2)) + 0.2 * smoothstep(-0.02, -0.03, v); o[1] = 0; }};
}

/* ---------- hair on the head: a fringe round the back and sides, bald crown (horseshoe) ---------- */
// p: {thick, crown (height of the bald line), front (x where the hair stops), hang (hair below the skull at the back)}
export function hairCap(H, p = {}) {
  const thick = p.thick ?? 0.009, crown = p.crown ?? 0.128, front = p.front ?? 0.03, hang = p.hang ?? 0.03;
  function sdf(x, y, z) {
    let d = H.skull(x, y, z) - thick;
    d = smin(d, sdRoundCone(x, y, z, -0.055, 0.04, 0, -0.06, 0.03 - hang * 2, 0, 0.045, 0.03 + hang * 0.2), 0.03);
    d = smax(d, y - crown - 0.03 * smoothstep(0.0, -0.08, x), 0.02);              // bald line rises towards the back
    d = smax(d, x - front + 0.02 * smoothstep(0.07, 0.11, y), 0.015);              // nothing on the face
    d = smax(d, -(y - 0.035), 0.02);
    d = smax(d, 0.07 - Math.hypot(x - 0.005, (y - 0.08) * 0.8) - (Math.abs(z) < 0.06 ? 0.06 : 0), 0.001) ; // clear the ears
    if (d < 0.015) d += 0.0028 * Math.sin(55 * Math.atan2(z, x + 0.02) + 30 * y + 4 * fbm(x * 30, y * 30, z * 30, 2)) + 0.002 * fbm(x * 60, y * 20, z * 60, 2);
    return d;
  }
  return {sdf, bounds: [-0.13, -0.06, -0.1, 0.07, 0.17, 0.1], cell: p.cell || 0.007, tris: p.tris || [340, 120], cull: (x, y, z) => H.sdf(x, y, z) < -0.001, project: 0.003,
    paint: (x, y, z, o) => { o[0] = smoothstep(0.06, 0.12, y) * 0.5; }};
}

/* ---------- eyebrows: bushy tufts that sit on the brow ridge and droop at the outer end ---------- */
export function brows(H, p = {}) {
  const E = H.eye, s = p.size ?? 1, droop = p.droop ?? 0.6, lift = p.lift ?? 0;
  // the chain runs just in front of the brow ridge, so about half of each tuft stands proud of the skin
  const pts = [[E.x + 0.0235, E.y + 0.02 + lift, 0.008], [E.x + 0.021, E.y + 0.0245 + lift, E.z - 0.007], [E.x + 0.016, E.y + 0.026 + lift, E.z + 0.007], [E.x + 0.006, E.y + 0.021 + lift - 0.009 * droop, E.z + 0.021]];
  function sdf(x, y, z) {
    const zs = Math.abs(z);
    let d = chain(x, y, zs, pts, 0.0062 * s, 0.0058 * s, 0.006);
    if (d < 0.01) {
      // hairs sweep outwards and down: shallow ridges along that direction, and a slightly ragged edge
      const u = zs * 0.9 - y * 0.4;
      d += 0.0006 * Math.sin(u * 1500 + 6 * fbm(x * 90, y * 90, z * 90, 1)) + 0.0009 * fbm(x * 180, y * 140, zs * 110, 2);
    }
    return d;
  }
  return {sdf, bounds: [E.x - 0.015, E.y, -E.z - 0.035, E.x + 0.035, E.y + 0.04, E.z + 0.035], cell: p.cell || 0.0018, tris: p.tris || [200, 80],
    cull: (x, y, z) => H.sdf(x, y, z) < -0.0015, project: 0.0015};
}

/* ---------- moustache: grows from the upper lip, droops past the mouth corners into the beard ---------- */
export function moustache(H, p = {}) {
  const nt = H.noseTip, m = H.mouth, s = p.size ?? 1, droop = p.droop ?? 1;
  // starts ~4 mm below the nose base (a philtrum gap), rides on the upper lip, droops over the mouth corners; the mouth slit and lower lip stay free
  const pts = [[m[0] + 0.005, m[1] + 0.0085, 0.0035], [m[0] + 0.004, m[1] + 0.0055, 0.015], [m[0] - 0.002, m[1] - 0.003 * droop, 0.027], [m[0] - 0.01, m[1] - 0.019 * droop, 0.034]];
  function sdf(x, y, z) {
    const zs = Math.abs(z);
    let d = chain(x, y, zs, pts, 0.0066 * s, 0.0032 * s, 0.004);
    if (d < 0.01) d += 0.0011 * Math.sin((zs * 0.8 - y * 0.6) * 1400 + 5 * fbm(x * 80, y * 80, z * 80, 1)) + 0.001 * fbm(x * 200, y * 200, zs * 100, 1);
    return d;
  }
  return {sdf, bounds: [m[0] - 0.035, m[1] - 0.04, -0.055, nt[0] + 0.01, nt[1] - 0.008, 0.055], cell: p.cell || 0.0022, tris: p.tris || [300, 110],
    cull: (x, y, z) => H.sdf(x, y, z) < -0.002, project: 0.002};
}

/* ---------- beard: hugs the jaw and cheeks (grows out of the face), then falls in tapered locks ---------- */
// p: {length (m below the chin), width, thick, fork (0 none .. 1), cheekLine (how high it climbs the cheek)}
export function beard(H, p = {}) {
  const L = p.length ?? 0.2, W = p.width ?? 1, th = p.thick ?? 0.007, fork = p.fork ?? 1, E = H.eye, m = H.mouth;
  const cheekY = E.y - 0.033 + (p.cheekLine ?? 0);
  function sdf(x, y, z) {
    const zs = Math.abs(z);
    // shell over the lower face: offset of the head surface, kept below the cheek line and in front of the ears
    // thickness fades to nothing towards the cheek line (the shell sinks into the skin: sparse, soft edge); full thickness under the chin
    const yTop = cheekY - 0.02 * smoothstep(0.03, 0.0, x) + 0.006 * smoothstep(0.015, 0.03, zs) - 0.012 * smoothstep(0.012, 0.0, zs);
    const thE = (th + 0.0012) * smoothstep(0, 0.035, yTop - y) * (0.6 + 0.4 * smoothstep(m[1], m[1] - 0.05, y)) - 0.0012;
    let d = H.jawSdf(x, y, z) - thE;
    d = smax(d, zs - 0.06, 0.01);
    d = smax(d, y - yTop - 0.004, 0.004);
    d = smax(d, -(x - 0.002), 0.01);
    d = smax(d, y - (m[1] - 0.0135) - 0.05 * smoothstep(0.02, 0.036, zs), 0.003); // under the lip in front, up to the cheek at the sides
    // the hanging mass: a tapered, slightly wavy cone below the chin
    const t = cl(-(y - 0.0) / L, 0, 1), tt = Math.pow(t, 1.25);
    const cx = m[0] - 0.024 + 0.035 * tt + 0.004 * Math.sin(t * 9), wx = (0.034 * Math.pow(1 - t, 0.9) + 0.008), wz = W * (0.05 * Math.pow(1 - t, 1.1) + 0.009);
    const ux = (x - cx) / wx, uz = (z + 0.005 * Math.sin(t * 7)) / wz;
    let h = (Math.hypot(ux, uz) - 1) * Math.min(wx, wz) * 0.9;
    h = smax(h, y - (m[1] - 0.0185), 0.008);
    h = smax(h, -(y + L + 0.005), 0.02);
    d = smin(d, h, 0.012);
    if (fork > 0 && t > 0.55) d = ssub(d, Math.max(Math.abs(z) - 0.0035 * fork, Math.abs(y + L * 0.93) - L * 0.25, Math.abs(x - cx) - 0.05), 0.006);
    if (d < 0.015) {
      const a = Math.atan2(uz, ux);
      d += 0.0022 * Math.sin(a * 9 + t * 16 + 4 * fbm(x * 25, y * 12, z * 25, 2)) + 0.0014 * (worley(x * 90, y * 30, z * 90) - 0.5);
    }
    return d;
  }
  return {sdf, bounds: [-0.02, -L - 0.03, -0.1, 0.14, cheekY + 0.01, 0.1], cell: p.cell || 0.0055, tris: p.tris || [540, 200],
    cull: (x, y, z) => H.sdf(x, y, z) < -0.002, project: 0.003,
    paint: (x, y, z, o) => { o[0] = 0.55 * smoothstep(-0.02, -L, y); }};
}

/* =====================================================================================
   HANDS  (frame: wrist at the origin, fingers along +X, back of the hand +Y, thumb on side*Z)
   ===================================================================================== */
// p: {pose:'rest'|'grip'|'point', side:+1|-1 (which Z the thumb is on), size, age (knuckles), gripR (radius of what it holds),
//     curl (extra curl for 'rest'), spread}
// Returns the spec plus .grip = [x,y] of the held axis (along Z) for 'grip'.
const FING = [ // z of the knuckle (thumb side positive), phalanx lengths, radius
  {z: 0.0128, L: [0.023, 0.0145, 0.0115], r: 0.0049}, {z: 0.0043, L: [0.025, 0.016, 0.0125], r: 0.0051},
  {z: -0.0043, L: [0.0235, 0.0155, 0.012], r: 0.0048}, {z: -0.0123, L: [0.0185, 0.0115, 0.0105], r: 0.0042}];
export function hand(p = {}) {
  const pose = p.pose || 'rest', side = p.side ?? 1, S = p.size ?? 1, age = p.age ?? 1, gR = p.gripR ?? 0.013, spread = p.spread ?? 1;
  const kx = 0.05, ky = 0.0015;
  const fingers = FING.map((f, i) => {
    const K = [kx - Math.abs(f.z - 0.004) * 0.25, ky, f.z * side], pts = [K];
    if (pose === 'grip' || (pose === 'point' && i > 0)) {
      // wrap round an axis along Z under the knuckles: every joint sits on a circle of radius gR + finger radius
      const Rf = (pose === 'grip' ? gR : 0.004) + f.r, C = [kx, ky - Rf];
      let th = Math.PI / 2;
      for (const L of f.L) { th -= 2 * Math.asin(Math.min(1, L / (2 * Rf))) * 0.97; pts.push([C[0] + Rf * Math.cos(th) - (K[0] - kx) * 0, C[1] + Rf * Math.sin(th), K[2] * (1 + 0.04 * pts.length)]); }
    } else {
      const base = pose === 'point' ? [0.05, 0.05, 0.02] : [0.3 + 0.06 * i, 0.42 + 0.07 * i, 0.3 + 0.05 * i].map(c => c * (p.curl ?? 1));
      let phi = pose === 'point' ? 0.05 : -0.05, P0 = K;
      f.L.forEach((L, j) => { phi -= base[j]; P0 = [P0[0] + L * Math.cos(phi), P0[1] + L * Math.sin(phi), P0[2] + side * (f.z * side) * 0.08 * spread]; pts.push(P0); });
    }
    return {pts, r: f.r};
  });
  // thumb: from the heel of the palm, forward and across
  let thumb;
  if (pose === 'grip') {
    const Rt = gR + 0.0058, C = [kx, ky - gR - 0.005];
    thumb = [[0.014, -0.004, side * 0.016], [0.03, -0.012, side * 0.024]];
    for (const a of [-150, -105, -62]) thumb.push([C[0] + Rt * Math.cos(a * D2R), C[1] + Rt * Math.sin(a * D2R), side * 0.0215]);
  } else if (pose === 'point') thumb = [[0.014, -0.004, side * 0.016], [0.032, -0.012, side * 0.02], [0.046, -0.014, side * 0.012], [0.056, -0.011, side * 0.006]];
  else thumb = [[0.012, -0.003, side * 0.017], [0.03, -0.008, side * 0.027], [0.044, -0.012, side * 0.031], [0.055, -0.016, side * 0.03]];
  function sdf(X, Y, Z) {
    const x = X / S, y = Y / S, z = Z / S;
    // palm: a rounded slab, wider at the knuckles, with the back of the hand slightly domed
    const w = 0.0155 + 0.006 * cl(x / kx, 0, 1);
    let d = sdBox(x - 0.027, y + 0.0005 + 0.0015 * Math.abs(z) / 0.02, z, 0.024, 0.0068, w, 0.0055);
    d = smin(d, sdRoundCone(x, y, z, -0.06, 0, 0, 0.004, 0, 0, 0.0155, 0.0148), 0.012);                         // wrist into the sleeve
    d = smin(d, sdEllipsoid(x - 0.016, y + 0.006, z - side * 0.011, 0.016, 0.0075, 0.011), 0.008);             // thumb muscle
    for (const f of fingers) {
      d = smin(d, chain(x, y, z, f.pts, f.r, f.r * 0.8, 0.002), 0.004);
      for (let j = 0; j < 3; j++) d = smin(d, sdSphere(x - f.pts[j][0], y - f.pts[j][1] - 0.0008, z - f.pts[j][2], f.r * (1.02 + 0.08 * age)), 0.003); // knuckles
    }
    d = smin(d, chain(x, y, z, thumb, 0.0068, 0.0048, 0.003), 0.006);
    return (d + 0.0004 * fbm(x * 260, y * 260, z * 260, 1)) * S;
  }
  const tips = fingers.map(f => f.pts[3]).concat([thumb[thumb.length - 1]]);
  const paint = (x, y, z, o) => { // knuckles and fingertips a little redder, like old hands
    let k = 0; for (const t of tips) k = Math.max(k, gauss(x / S, y / S, z / S, t, 0.007));
    for (const f of fingers) k = Math.max(k, 0.5 * gauss(x / S, y / S, z / S, f.pts[0], 0.006));
    o[0] = k * 0.7;
  };
  const b = [-0.07, -0.05, -0.05, 0.11, 0.035, 0.05].map(v => v * S);
  return {sdf, paint, bounds: b, cell: p.cell || 0.0026 * S, tris: p.tris || [380, 130], project: 0.0015, grip: pose === 'grip' ? [kx * S, (ky - gR - 0.0049) * S] : null};
}

/* =====================================================================================
   ROBES
   ===================================================================================== */
// Long skirt from the floor to the waist (frame B). p: {height, hem (radius at the floor), waist (radius), folds (count),
// depth (fold depth), seed}. The bottom 3.5 mm is culled (stands on the floor).
export function robeSkirt(p = {}) {
  const Hh = p.height ?? 0.53, hem = p.hem ?? 0.175, waist = p.waist ?? 0.092, nf = p.folds ?? 10, dep = p.depth ?? 1;
  function base(x, y, z) { // smooth silhouette, used for trim bands
    const t = cl(y / (Hh - 0.03), 0, 1), rho = Math.hypot(x, z);
    return rho - (waist + (hem - waist) * Math.pow(1 - t, 1.35) + 0.012 * smoothstep(0.12, 0, y));
  }
  function sdf(x, y, z) {
    const t = cl(y / (Hh - 0.03), 0, 1), rho = Math.hypot(x, z);
    if (rho > hem * 1.5) return rho - hem * 1.2;
    const a = Math.atan2(z, x);
    let R = waist + (hem - waist) * Math.pow(1 - t, 1.35) + 0.012 * smoothstep(0.12, 0, y);
    const fa = nf * a + 1.4 * Math.sin(3 * a + y * 5) + 2.6 * fbm(Math.cos(a) * 2, Math.sin(a) * 2, y * 3, 2);
    R *= 1 + dep * ((0.02 + 0.042 * (1 - t)) * Math.sin(fa) + 0.01 * (worley(Math.cos(a) * 2.4, y * 6, Math.sin(a) * 2.4) - 0.5));
    let d = (rho - R) * 0.8;
    d = smax(d, y - Hh, 0.01);
    return smax(d, -y, 0.003);
  }
  return {sdf, base, bounds: [-hem * 1.3, -0.02, -hem * 1.3, hem * 1.3, Hh + 0.02, hem * 1.3], cell: p.cell || 0.012, tris: p.tris || [480, 180], cull: (x, y) => y < 0.0035, project: 0.004};
}

// A band of trim (hem, sash, cuff) laid over a cloth surface: the shell between `out` and `out+thick` outside
// base(x,y,z), inside region(x,y,z) < 0. Returns a part spec; also give the cloth part cull: spec.covers so the
// hidden cloth under the band is dropped.
export function trimBand(base, region, p = {}) {
  const thick = p.thick ?? 0.005, inset = p.inset ?? 0.002, round = p.round ?? 0.003, ripple = p.ripple ?? 0;
  const sdf = (x, y, z) => {
    let d = smax(Math.abs(base(x, y, z) - (thick - inset) / 2) - (thick + inset) / 2, region(x, y, z), round);
    if (ripple && d < 0.006) d += ripple * Math.sin(Math.atan2(z, x) * 40);
    return d;
  };
  // the inner face of the band is buried in the cloth: never mesh it
  const cull = (x, y, z) => base(x, y, z) < 0.0006 || (p.cull && p.cull(x, y, z));
  return {sdf, bounds: p.bounds, cell: p.cell || 0.0042, tris: p.tris || [160, 60], cull, project: 0.002,
    covers: (x, y, z) => region(x, y, z) < -0.0015 && Math.abs(base(x, y, z)) < 0.006};
}

// Upper body (frame U): chest, shoulders, bell sleeves, collar and cowl in one surface, soft folds.
// p: {arms:[{S,E,W,r:[shoulder,elbow,mouth]}...] in U coords, chest:[rx,ry,rz], sash:{y,h}, cuffLen}
// Returns the cloth spec plus trims {sash, cuffs:[...]} and sleeve ends {ends:[{at,dir,r}]} for placing hands.
export function robeTorso(p) {
  const len = p.len ?? 1; // vertical stretch of chest, collar and cowl (1 = the original short torso)
  const ch = p.chest || [0.08, 0.145 * len, 0.108], sash = p.sash || {y: 0.017, h: 0.027}, waist = p.waist ?? 0.094;
  const arms = p.arms.map(a => {
    const F = norm3([a.W[0] - a.E[0], a.W[1] - a.E[1], a.W[2] - a.E[2]]), end = [a.W[0] - (a.back ?? 0.03) * F[0], a.W[1] - (a.back ?? 0.03) * F[1], a.W[2] - (a.back ?? 0.03) * F[2]];
    return {...a, F, end};
  });
  const sleeve = (x, y, z, a) => smin(sdRoundCone(x, y, z, a.S[0], a.S[1], a.S[2], a.E[0], a.E[1], a.E[2], a.r[0], a.r[1]), sdRoundCone(x, y, z, a.E[0], a.E[1], a.E[2], a.end[0], a.end[1], a.end[2], a.r[1], a.r[2]), 0.03);
  function body(x, y, z) {
    let d = smin(sdEllipsoid(x, y - 0.14 * len, z, ch[0], ch[1], ch[2]), sdEllipsoid(x + 0.035, y - 0.245 * len, z, 0.085, 0.04, ch[2] * 1.06), 0.04);
    for (const a of arms) d = smin(d, sleeve(x, y, z, a), 0.035);
    d = smin(d, sdEllipsoid(x, y - sash.y, z, waist * 0.98, sash.h * 1.7, waist), 0.03); // waist, as wide as the skirt top so the sash can wrap both
    d = smin(d, sdEllipsoid(x, y - 0.268 * len, z, 0.052, 0.02, 0.058), 0.02);            // collar roll
    d = smin(d, sdEllipsoid(x + 0.052, y - 0.255 * len, z, 0.05, 0.042, 0.078), 0.04);    // cowl bunched at the back
    for (const a of arms) d = ssub(d, sdSphere(x - (a.end[0] + 0.03 * a.F[0]), y - (a.end[1] + 0.03 * a.F[1]), z - (a.end[2] + 0.03 * a.F[2]), a.r[2] * 0.76), 0.004); // sleeve mouths
    return d;
  }
  function sdf(x, y, z) {
    let d = body(x, y, z);
    if (d < 0.03) { // drapery from the shoulders, calm near the sash so the band sits flat
      const a = Math.atan2(z, x), m = smoothstep(sash.y + sash.h + 0.01, sash.y + sash.h + 0.07, y);
      d += 0.0045 * m * (Math.sin(11 * a + 4 * fbm(x * 18, y * 9, z * 18, 2)) + 0.5 * fbm(x * 40, y * 40, z * 40, 2));
    }
    return d;
  }
  const trims = {
    sash: trimBand(body, (x, y, z) => Math.abs(y - sash.y) - sash.h, {thick: 0.006, bounds: [-0.13, sash.y - sash.h - 0.01, -0.13, 0.13, sash.y + sash.h + 0.01, 0.13], tris: [170, 60], cell: 0.0042}),
    cuffs: arms.map(a => trimBand(body, (x, y, z) => { const t = (x - a.end[0]) * a.F[0] + (y - a.end[1]) * a.F[1] + (z - a.end[2]) * a.F[2]; const vx = x - a.end[0], vy = y - a.end[1], vz = z - a.end[2], rad = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - t * t)); return Math.max(-0.028 - t, t - 0.016, rad - (a.r[2] + 0.025)); },   // radial cap: without it the slab cut a band across the chest
      {thick: 0.005, bounds: [a.end[0] - 0.075, a.end[1] - 0.075, a.end[2] - 0.075, a.end[0] + 0.075, a.end[1] + 0.075, a.end[2] + 0.075], tris: [110, 40], cell: 0.0042}))
  };
  const covers = (x, y, z) => trims.sash.covers(x, y, z) || trims.cuffs.some(c => c.covers(x, y, z));
  return {sdf, body, trims, ends: arms.map(a => ({at: a.W, end: a.end, dir: a.F, r: a.r[2]})),
    bounds: [-0.16, -0.045, -0.25, 0.27, 0.33 * len + 0.02, 0.25], cell: p.cell || 0.0105, tris: p.tris || [650, 240], cull: covers, project: 0.004};
}

/* =====================================================================================
   EYES  (parametric: eyeball, iris with pupil, upper lid that rotates to blink, lower lid)
   ===================================================================================== */
// Meshes are centred on the eye (emit them at H.eye with z = +-E.z). The upper lid closes by a rotation about Z:
//   lidAngle(blink) gives the angle for blink 1 (open) .. 0 (shut).
// p: {r, iris (fraction of r, about 0.52 for a real eye), open (deg of elevation where the upper lid edge rests;
//     lower = sleepier), low (deg of the lower lid edge), lidT (lid thickness), arch (deg, how much the lid edge arches)}
function gridMesh(nu, nv, pos, paint) { // (nu+1)x(nv+1) grid of points -> stride 8 triangles, normals from the grid
  const P = [], N = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(pos(i / nu, j / nv));
  const at = (i, j) => P[cl(j, 0, nv) * (nu + 1) + cl(i, 0, nu)];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const a = at(i + 1, j), b = at(i - 1, j), c = at(i, j + 1), d = at(i, j - 1);
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    N.push(norm3([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]));
  }
  const out = [], o2 = [0, 0, 1];
  const put = k => { const q = P[k]; let n = N[k]; if (!n[0] && !n[1] && !n[2]) n = norm3(q); o2[0] = 0; o2[1] = 0; o2[2] = 1; if (paint) paint(k % (nu + 1) / nu, Math.floor(k / (nu + 1)) / nv, o2); out.push(q[0], q[1], q[2], n[0], n[1], n[2], o2[0], o2[1], o2[2]); };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
    put(a); put(b); put(c); put(a); put(c); put(d);
  }
  const m = new Float32Array(out); m.stride = 9; return m;
}
function orient(m, outward) { // make the winding agree with the stored normals (or flip normals to face `outward`)
  for (let i = 0; i < m.length; i += 27) {
    const ux = m[i + 9] - m[i], uy = m[i + 10] - m[i + 1], uz = m[i + 11] - m[i + 2], wx = m[i + 18] - m[i], wy = m[i + 19] - m[i + 1], wz = m[i + 20] - m[i + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    if (fx * m[i + 3] + fy * m[i + 4] + fz * m[i + 5] < 0) for (let q = 0; q < 9; q++) { const t = m[i + 9 + q]; m[i + 9 + q] = m[i + 18 + q]; m[i + 18 + q] = t; }
  }
  return m;
}
export function eyeRig(p = {}) {
  const r = p.r ?? 0.0115, ir = p.iris ?? 0.5, open = (p.open ?? 16) * D2R, low = (p.low ?? -24) * D2R, lt = p.lidT ?? 0.0016, arch = (p.arch ?? 9) * D2R, sp = 0.86;
  const sph = (rad, e, a) => [rad * Math.cos(e) * Math.cos(a), rad * Math.sin(e), rad * Math.cos(e) * Math.sin(a)];
  // only the front of the ball can ever show; the back is inside the head
  const ball = orient(gridMesh(9, 5, (u, v) => sph(r, (v - 0.5) * 0.85 * Math.PI, (u - 0.5) * 1.5 * Math.PI), (u, v, o) => { o[2] = 1 - 0.55 * Math.abs(u - 0.5) * 2; }));
  // iris: a slightly domed disc (the cornea) over the front of the ball; paint 1 at the pupil, a dark limbal ring
  const ia = Math.asin(ir);
  const iris = orient(gridMesh(10, 3, (u, v) => { const t = v * ia, a = u * 2 * Math.PI, rr = r * (1.012 + 0.03 * Math.cos(t / ia * Math.PI / 2)); return [rr * Math.cos(t), rr * Math.sin(t) * Math.sin(a), rr * Math.sin(t) * Math.cos(a)]; },
    (u, v, o) => { o[0] = v < 0.4 ? 1 : 0; o[1] = v > 0.9 ? 1 : 0; }));
  // upper lid: a shell slightly bigger than the ball over the top, with a rolled edge; edge elevation arches over the iris
  const lidPos = (rad, u, e0) => { const a = (u - 0.5) * 2 * 100 * D2R, e = e0 + arch * (1 - ((u - 0.5) * 2) ** 2); return {a, e}; };
  const lid = orient(gridMesh(9, 6, (u, v) => {
    const {a, e} = lidPos(0, u, open);
    // v: 0 = back over the top, 4/6 = the edge outer side, 1 = the inner lip touching the ball
    const rows = [[85 * D2R, r + lt], [55 * D2R, r + lt], [35 * D2R, r + lt * 1.05], [12 * D2R, r + lt], [0, r + lt * 0.75], [-2.5 * D2R, r + lt * 0.15], [-1 * D2R, r * 0.985]];
    const k = Math.round(v * 6), [de, rad] = rows[k], ee = k === 0 ? de : e + de;
    return sph(rad, Math.min(ee, 88 * D2R), a * (k === 0 ? 0.9 : 1) * sp / 0.86);
  }, (u, v, o) => { o[0] = v > 0.6 ? 0.75 : 0.15; o[2] = v > 0.75 ? 0.45 : 1; }));
  const lower = orient(gridMesh(9, 4, (u, v) => {
    const a = (u - 0.5) * 2 * 100 * D2R, e = low - arch * 0.4 * (1 - ((u - 0.5) * 2) ** 2);
    const rows = [[-80 * D2R, r + lt], [-30 * D2R, r + lt], [0, r + lt * 0.8], [1.5 * D2R, r + lt * 0.2], [0.5 * D2R, r * 0.985]];
    const [de, rad] = rows[Math.round(v * 4)];
    return sph(rad, Math.max(-88 * D2R, v === 0 ? de : e + de), a);
  }, (u, v, o) => { o[0] = v > 0.5 ? 0.6 : 0.2; o[2] = v > 0.7 ? 0.6 : 1; }));
  // closing: rotate the lid edge from `open` down to just past the lower lid
  const shut = open + arch - low + 4 * D2R;
  // sanitize: the iris cap has zero-area triangles at its pole
  return {ball: sanitize(ball), iris: sanitize(iris), lid: sanitize(lid), lower: sanitize(lower), r, lidAngle: blink => -(1 - blink) * shut};
}

/* =====================================================================================
   BAKING AND CACHING
   ===================================================================================== */
// Bake one part spec -> [nearMesh, farMesh] (stride 8 Float32Arrays).
// Mesh hygiene (stride 9): drop non-finite and degenerate triangles, renormalise normals, replace unusable normals with the
// face normal. A zero or NaN normal on real GPUs becomes NaN in the shader, and NaN in an HDR target blooms into white squares.
export function sanitize(M, minArea = 1e-10) {
  const out = new Float32Array(M.length); let o = 0, dropped = 0;
  for (let i = 0; i < M.length; i += 27) {
    let ok = true;
    for (let k = 0; k < 27 && ok; k++) ok = Number.isFinite(M[i + k]);
    const ux = M[i + 9] - M[i], uy = M[i + 10] - M[i + 1], uz = M[i + 11] - M[i + 2], wx = M[i + 18] - M[i], wy = M[i + 19] - M[i + 1], wz = M[i + 20] - M[i + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx, fl = Math.hypot(fx, fy, fz);
    if (!ok || fl < 2 * minArea) { dropped++; continue; }
    for (let v = 0; v < 3; v++) {
      const b = i + v * 9, l = Math.hypot(M[b + 3], M[b + 4], M[b + 5]);
      for (let k = 0; k < 9; k++) out[o + k] = M[b + k];
      if (l > 1e-4) { out[o + 3] /= l; out[o + 4] /= l; out[o + 5] /= l; } else { out[o + 3] = fx / fl; out[o + 4] = fy / fl; out[o + 5] = fz / fl; }
      o += 9;
    }
  }
  const r = out.slice(0, o); r.stride = 9; r.dropped = dropped; return r;
}

export function bakePart(spec, seed = 1) {
  setSeed(seed);
  const t0 = performance.now();
  const raw = sculptIndexed(spec.sdf, spec.bounds, spec.cell, {cull: spec.cull});
  const t1 = performance.now();
  const near = simplify(raw, spec.tris[0]), far = simplify(near, spec.tris[1]);
  const fo = {paint: spec.paint || (() => {}), project: spec.project ?? spec.cell * 0.5, normalSdf: spec.normalSdf, eps: 0.0006, ao: spec.ao ?? 0.012};
  const out = [sanitize(flatten(near, spec.sdf, fo)), sanitize(flatten(far, spec.sdf, fo))];
  out.ms = performance.now() - t0; out.netsMs = t1 - t0; out.raw = raw.T.length / 3;
  return out;
}

// Bake a whole recipe (see src/npc_recipes.js). recipe.build() returns {parts:{name: spec}, eyes, anchors}.
// Cached by recipe.id; the result lists per-part meshes for both LODs and the stats.
// bakeRecipe() finishes synchronously; bakeRecipeIdle() bakes one part per tick (call it at load so no frame
// stalls for long), and a later bakeRecipe() simply finishes whatever is left.
const CACHE = new Map();
function start(recipe) {
  let st = CACHE.get(recipe.id);
  if (!st) {
    const built = recipe.build();
    st = {res: {recipe, parts: {}, eyes: built.eyes ? eyeRig(built.eyes) : null, anchors: built.anchors || {}, stats: {parts: {}, tris: [0, 0], ms: 0}},
      names: Object.keys(built.parts), todo: Object.keys(built.parts), built, seed: recipe.seed ?? 1, done: false};
    CACHE.set(recipe.id, st);
  }
  return st;
}
function step(st) {
  const name = st.todo.shift(), {res} = st, m = bakePart(st.built.parts[name], st.seed + st.names.indexOf(name));
  res.parts[name] = m; res.stats.ms += m.ms;
  res.stats.parts[name] = {raw: m.raw, near: m[0].length / 27, far: m[1].length / 27, ms: Math.round(m.ms), nets: Math.round(m.netsMs)};
  if (st.todo.length) return;
  st.done = true; st.built = null; res.stats.ms = Math.round(res.stats.ms);
  const E = res.eyes;
  for (const lod of [0, 1]) {
    for (const q of res.recipe.parts) if (res.parts[q.part]) res.stats.tris[lod] += res.parts[q.part][lod].length / 27;
    if (E) res.stats.tris[lod] += 2 * (E.ball.length + E.iris.length + E.lid.length + E.lower.length) / 27;
  }
}
export function bakeRecipe(recipe) {
  const st = start(recipe);
  while (!st.done) step(st);
  return st.res;
}
export function bakeRecipeIdle(recipe, done) {
  const st = start(recipe);
  const tick = () => { if (st.done) { if (done) done(st.res); return; } step(st); setTimeout(tick, 16); };
  setTimeout(tick, 0);
}
