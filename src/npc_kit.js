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
import {rng, lockSet, traceSurface, lockFromTrace, lockFromPath, tipWisps} from './npc_hair.js';
import {sculptGen, simplifyGen, flattenGen, smin, smax, ssub, smoothstep, sdSphere, sdEllipsoid, sdRoundCone, sdCapsule, sdBox, fbm, noise, worley, setSeed} from './sculpt.js';

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
export const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
export const mul3 = (a, b) => [a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8], a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8], a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]];
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

/* ---------- neck: skin column from under the jaw down into the robe's neckline (frame H, draw it with drape so it stays upright) ---------- */
// Same cone as the head's own neck stub (top 34 mm radius, 40 mm lower; head units), continued down with a trapezius flare.
// Meshed only below the head's own stub (they overlap by 1 cm), so the neck joins the head without a gap or a double surface.
// Use recipe rig drape so the lower end stays on the torso when the head turns or nods. p: {len (head units below the pivot), r (scale), tris}
export function neck(H, p = {}) {
  const len = p.len ?? 0.2, r = p.r ?? 1, nk = p.neck ?? 1;
  const sdf = (x, y, z) => {
    const az = Math.abs(z);
    let d = sdRoundCone(x, y, z, -0.004, 0.02, 0, -0.008, -0.07, 0, 0.034 * nk * r, 0.04 * nk * r);
    d = smin(d, sdRoundCone(x, y, z, -0.008, -0.07, 0, -0.016, -len, 0, 0.04 * nk * r, 0.056 * nk * r), 0.02);
    // sternocleidomastoid cords from behind the ear to the collarbones, and the Adam's apple
    d = smin(d, sdCapsule(x, y, az, -0.026, -0.03, 0.03 * nk, 0.016, -0.15, 0.015, 0.012), 0.012);
    d = smin(d, sdSphere(x - 0.036 * nk, y + 0.07, z, 0.011), 0.014);
    return d + 0.0004 * fbm(x * 45, y * 45, z * 45, 2);
  };
  return {sdf, bounds: [-0.09, -len - 0.02, -0.09, 0.09, -0.03, 0.09], cell: p.cell || 0.0045, tris: p.tris || [220, 90],
    cull: (x, y, z) => y > -0.035 || H.sdf(x, y, z) < -0.002, project: 0.002,
    paint: (x, y, z, o) => { o[0] = 0.5 * smoothstep(-0.07, -len, y); o[1] = 0.6; }};
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
  const HW = 0.0205, HL = 0.0335;   // half breadth (a) and half length (v) of the outline, kit metres at es = 1
  function sdf(x, y, z) {
    const dx = x - px, dy = y - cy, dz = Math.abs(z) - pz;
    const v0 = -dx * st + dy * ct, f = dx * ct + dy * st;
    const a = (-f * cp + dz * sp) / es, w = (f * sp + dz * cp) / es, v = v0 / es;
    if (Math.abs(v) > 0.05 || a < -0.02 || a > 0.05 || Math.abs(w) > 0.05) return 0.02 * es;   // bounding box
    const ea = a - HW, aw = HW * (1 + 0.2 * v / HL * (v > 0 ? 1 : 0.6)), r0 = Math.hypot(ea / aw, v / HL);   // egg outline, wider at the top
    const q = (r0 - 1) * 0.018;                                                                              // signed-ish distance to the outline
    // the helix is a C that starts at the crus above the tragus (a ridge entering the concha), arcs over the top and down the back to the lobe. It does
    // NOT run down the front edge: there the ear merges with the head (no rim, no step), so the rim fades out below the crus at the front
    const fadeF = Math.max(smoothstep(0.003, 0.0125, v), smoothstep(0.004, 0.014, a));
    const curl = (0.0038 + 0.0012 * smoothstep(-0.005, 0.02, v) + 0.0008 * smoothstep(0.0, 0.03, a)) * (0.15 + 0.85 * fadeF);   // rim thicker at the top and back
    let d = Math.hypot(q, w - 0.0046 * (0.45 + 0.55 * fadeF) - 0.0010 * smoothstep(0, 0.03, v)) - curl;       // helix: the rolled rim
    const bowl = 0.0058 * Math.exp(-(((a - 0.0115) / 0.0078) ** 2 + ((v + 0.006) / 0.0125) ** 2));            // concha dips below the scapha
    const fa = smoothstep(-0.001, 0.012, a);   // the plate grows out of the head: no thickness at the very front
    const plate = smax(q + 0.002, Math.abs(w - (0.0028 * fa - 0.0004) + bowl * fa) - (0.0006 + 0.0011 * fa), 0.0012);
    d = smin(d, plate, 0.0016);
    // antihelix Y: stem from the lower concha rim up, forking into superior and inferior crura
    const ah = Math.min(sdCapsule(a, v, w, 0.022, -0.011, 0.0065, 0.0155, 0.004, 0.0075, 0.0033),
      Math.min(sdCapsule(a, v, w, 0.0155, 0.004, 0.0075, 0.0135, 0.021, 0.0065, 0.0028), sdCapsule(a, v, w, 0.0155, 0.004, 0.0075, 0.006, 0.0125, 0.0066, 0.0026)));
    d = smin(d, ah, 0.0018);
    d = smin(d, sdCapsule(a, v, w, 0.0015, 0.0085, 0.0045, 0.0125, 0.0062, 0.0058, 0.0021), 0.0015);          // crus of the helix: the rim's root, entering the concha above the tragus
    d = smin(d, sdEllipsoid(a - 0.0055, v + 0.0015, w - 0.0052, 0.0048, 0.0062, 0.0030), 0.0022);              // tragus: a small flap in front of the canal, flush with the head at its front
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

/* ---------- eyebrows: bushy tufts that sit on the brow ridge and droop at the outer end (locks, see npc_hair.js) ---------- */
// p: {size, droop, lift, tufts (per brow), seed}
export function brows(H, p = {}) {
  const E = H.eye, s = p.size ?? 1, droop = p.droop ?? 0.6, lift = p.lift ?? 0, rr = rng(p.seed ?? 5), n = p.tufts ?? 13;
  // the chain runs just in front of the brow ridge, so about half of each tuft stands proud of the skin
  const pts = [[E.x + 0.0235, E.y + 0.02 + lift, 0.008], [E.x + 0.021, E.y + 0.0245 + lift, E.z - 0.007], [E.x + 0.016, E.y + 0.026 + lift, E.z + 0.007], [E.x + 0.006, E.y + 0.021 + lift - 0.009 * droop, E.z + 0.021]];
  const base = c => { const f = c * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return lerp3(pts[i], pts[i + 1], f - i); };
  const locks = [];
  for (const side of [-1, 1]) for (let j = 0; j < n; j++) {
    const c = (j + 0.2 + 0.6 * rr()) / n, P = base(c), len = (0.0085 + 0.006 * Math.sin(Math.PI * Math.min(1, c * 1.1 + 0.1)) + 0.004 * rr()) * s;
    // inner hairs grow up and out, the outer ones sweep out and down
    const a = (0.25 + 1.45 * c + 0.2 * (rr() - 0.5)) , up = Math.cos(a) - 0.55 * Math.max(0, c - 0.55) * 1.2 * droop, out = Math.sin(a), fw = 0.25 + 0.2 * rr();
    const R = (0.0013 + 0.0004 * rr()) * s, ph = rr() * 6.28;
    locks.push(lockFromPath(t => [P[0] + fw * len * t * 0.5 - 0.0004 * (1 - t) - 0.0008 * s * (1 - t), P[1] + up * len * t + 0.0016 * Math.sin(t * 3 + ph) * t - 0.0008 * (1 - t), side * (P[2] + out * len * t + 0.0008 * Math.sin(t * 4 + ph) * t)], {n: 7, R, tip: 0.0002, root: 0.9, taper: 0.35}));
  }
  const LS = lockSet(locks, {k: 0.0008, pad: 0.002, ref: [1, 0, 0]}), skinD = H.sdf, tmp = [0, 0, 0];
  const inner = (x, y, z) => { const zs = Math.abs(z); return chain(x, y, zs, pts, 0.0034 * s, 0.003 * s, 0.006) + 0.0005; };   // a low base so the tufts grow from a dense bed
  const fat = f => (x, y, z) => smin(inner(x, y, z), LS.eval(x, y, z) - f, 0.002);
  const sdf = (x, y, z) => smin(inner(x, y, z), LS.eval(x, y, z), 0.0012);
  const bounds = [E.x - 0.015, E.y, -E.z - 0.035, E.x + 0.035, E.y + 0.045, E.z + 0.035];
  return {sdf, bounds, cell: p.cell || 0.0013, tris: [(p.tris || [450, 200, 60])[0]], lods: (p.tris || [450, 200, 60]).slice(1).map((t, i) => ({sdf: fat(0.0006 + 0.0008 * i), cell: 0.0022 + 0.0008 * i, tris: [t]})),
    cull: (x, y, z) => H.sdf(x, y, z) < -0.0015, project: 0.0008, ao: 0.004, aoFloor: 0.6, locks: LS,
    band: (x, y, z, o) => { const zs = Math.abs(z); o[0] = zs * 0.9 - y * 0.4; o[1] = y * 0.9 + zs * 0.4; o[2] = 1 - smoothstep(0.0003, 0.0035, skinD(x, y, z)); },
    paint: (x, y, z, o) => { LS.info(x, y, z, tmp); o[0] = cl(0.35 * (1 - smoothstep(0, 0.25, tmp.t ?? 0)) + 0.1 * smoothstep(0.0003, 0.0015, tmp.d) + 0.12 * (tmp[2] - 0.5), 0, 1); }};
}

/* ---------- moustache: grows from the upper lip, droops past the mouth corners into the beard ---------- */
// Locks fan out from the philtrum (parted there, a gap under the nose) and sweep over the lip corners, tips hanging separately.
// p: {size, droop, locks (per side), seed}
export function moustache(H, p = {}) {
  const nt = H.noseTip, m = H.mouth, s = p.size ?? 1, droop = p.droop ?? 1, rr = rng(p.seed ?? 9), n = p.locks ?? 7;
  // starts ~4 mm below the nose base (a philtrum gap), rides on the upper lip, droops over the mouth corners; the mouth slit and lower lip stay free
  const pts = [[m[0] + 0.005, m[1] + 0.0085, 0.0035], [m[0] + 0.004, m[1] + 0.0055, 0.015], [m[0] - 0.002, m[1] - 0.003 * droop, 0.027], [m[0] - 0.01, m[1] - 0.019 * droop, 0.034]];
  const ext = [pts[3][0] - 0.004, pts[3][1] - 0.01 * droop, pts[3][2] + 0.002], P5 = [...pts, ext];
  const base = c => { const f = c * (P5.length - 1), i = Math.min(P5.length - 2, Math.floor(f)); return lerp3(P5[i], P5[i + 1], f - i); };
  const locks = [];
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    const u = (i + 0.15 + 0.7 * rr()) / n, len = 0.62 + 0.38 * Math.pow(u, 0.7) + 0.06 * rr(), ph = rr() * 6.28, R = (0.0021 + 0.0007 * Math.sin(Math.PI * u) + 0.0005 * rr()) * s;
    locks.push(lockFromPath(t => {
      const b = base(t * len), g = Math.pow(t, 1.2), sm = t * t * (3 - 2 * t);
      return [b[0] + 0.0014 * s * (u - 0.5) * 2 * sm + 0.0006 * s * Math.sin(t * 5 + ph), b[1] + (0.0032 - 0.0068 * u) * s * sm - 0.0075 * u * u * g * droop, side * (b[2] + 0.0012 * Math.sin(t * 7 + ph) * sm + 0.003 * (u - 0.5) * g)];
    }, {n: 11, R, tip: 0.0002, root: 0.85, taper: 0.5}));
  }
  const LS = lockSet(locks, {k: 0.0011, pad: 0.002}), skinD = H.sdf, tmp = [0, 0, 0];
  const bed = (x, y, z) => chain(x, y, Math.abs(z), pts, 0.0036 * s, 0.002 * s, 0.003) + 0.0006;
  const fat = f => (x, y, z) => smin(bed(x, y, z), LS.eval(x, y, z) - f, 0.002);
  const sdf = (x, y, z) => smin(bed(x, y, z), LS.eval(x, y, z), 0.0014);
  const T = p.tris || [750, 300, 70];
  return {sdf, bounds: [m[0] - 0.035, m[1] - 0.04, -0.055, nt[0] + 0.01, nt[1] - 0.008, 0.055], cell: p.cell || 0.0017, tris: [T[0]], lods: T.slice(1).map((t, i) => ({sdf: fat(0.0008 + 0.0012 * i), cell: 0.0028 + 0.001 * i, tris: [t]})),
    cull: (x, y, z) => H.sdf(x, y, z) < -0.002, project: 0.001, ao: 0.005, aoFloor: 0.6, locks: LS,
    band: (x, y, z, o) => { const zs = Math.abs(z); o[0] = zs * 0.9 - y * 0.6; o[1] = y * 0.9 + zs * 0.6; o[2] = 1 - smoothstep(0.0003, 0.004, skinD(x, y, z)); },
    paint: (x, y, z, o) => { LS.info(x, y, z, tmp); o[0] = cl(0.3 * (1 - smoothstep(0, 0.2, tmp.t ?? 0)) + 0.12 * smoothstep(0.0004, 0.002, tmp.d) + 0.12 * (tmp[2] - 0.5), 0, 1); }};
}

/* ---------- beard: hugs the jaw and cheeks (grows out of the face), then falls in tapered locks ---------- */
// p: {length (m below the chin), width, thick, fork (0 none .. 1), cheekLine (how high it climbs the cheek)}
export function beard(H, p = {}) {
  const L = p.length ?? 0.2, W = p.width ?? 1, th = p.thick ?? 0.007, fork = p.fork ?? 1, E = H.eye, m = H.mouth;
  const cheekY = E.y - 0.033 + (p.cheekLine ?? 0);
  // p.chest(x,y,z): distance to the clothes below the beard, in this part's own coordinates (negative inside). The hanging mass is then
  // carried out onto the cloth: its centre follows the chest profile (found by marching along +X at z = 0) so the beard rests ON the robe
  // instead of sinking into it, and whatever still lies inside the cloth is cut away.
  const chest = p.chest, gap = p.gap ?? 0.004, PY = [], PS = 0.01;
  if (chest) for (let y = 0.02; y > -L - 0.05; y -= PS) { let x = 0.3; while (x > -0.1 && chest(x, y, 0) > 0) x -= 0.002; PY.push(x); }
  { const mx = PY.map((v, i) => { let m = -1e9; for (let k = -4; k <= 4; k++) m = Math.max(m, PY[cl(i + k, 0, PY.length - 1)] - 0.0006 * k * k); return m; });   // smooth envelope (no stair where the stole edge ends)
    for (let r = 0; r < 3; r++) for (let i = 1; i < mx.length - 1; i++) mx[i] = (mx[i - 1] + 2 * mx[i] + mx[i + 1]) / 4;
    for (let i = 0; i < PY.length; i++) PY[i] = mx[i]; }
  const chestX = y => { const f = cl((0.02 - y) / PS, 0, PY.length - 1.001), i = Math.floor(f), t = f - i; return PY[i] * (1 - t) + PY[i + 1] * t; };
  const lockPh = (x, y, z, a, t) => Math.sin(a * 3 + t * 5 + 6.5 * (fbm(x * 9, y * 6, z * 9, 2) - 0.5) + 6 * z);   // 3-4 big wavy locks, domain-warped
  function core(x, y, z) {
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
    let cx = m[0] - 0.024 + 0.035 * tt + 0.005 * Math.sin(t * 5 + 0.6);
    const wx = 0.040 * Math.pow(1 - t, 0.75) + 0.004, wz = W * (0.058 * Math.pow(1 - t, 0.85) + 0.006);   // broad at the jaw, tapering to a gently pointed end
    if (chest) cx = Math.max(cx, chestX(y) + gap + wx * 0.75);
    const ux = (x - cx) / wx, uz = (z + 0.005 * Math.sin(t * 7)) / wz;
    let h = (Math.hypot(ux, uz) - 1) * Math.min(wx, wz) * 0.9;
    h += 0.0085 * lockPh(x, y, z, Math.atan2(uz, ux), t) * smoothstep(0.0, 0.2, t) * smoothstep(m[1] - 0.012, m[1] - 0.03, y);   // big wavy locks, only on the hanging mass
    h = smax(h, y - (m[1] - 0.0185), 0.008);
    h = smax(h, -(y + L + 0.012), 0.03);
    d = smin(d, h, 0.012);
    if (chest) d = smax(d, -(chest(x, y, z) - gap * 0.5), 0.004);
    if (fork > 0 && t > 0.55) d = ssub(d, Math.max(Math.abs(z) - 0.0035 * fork, Math.abs(y + L * 0.93) - L * 0.25, Math.abs(x - cx) - 0.05), 0.006);
    if (d < 0.015) {
      const a = Math.atan2(uz, ux);
      // a few large wavy locks (domain-warped, low frequency) with only a whisper of fine grain; shallow valleys between the locks
      d += 0.0007 * (fbm(x * 60, y * 25, z * 60, 1) - 0.5);
    }
    return d;
  }
  // ---- locks (npc_hair.js): the smooth envelope above is the inner mass (inset by `inset`); layered locks lie on its surface ----
  const inset = p.inset ?? 0.0032, rr = rng(p.seed ?? 17), zMax = 0.06 * W, locks = [];
  const root = (z0, y0) => surfacePoint(core, [0.3, y0, z0], [-1, 0, 0], 0, 0.36);
  // half width of the beard at each height (rows of 5 mm), so a lock can keep its relative position across the mass while it narrows
  const ZY0 = cheekY + 0.004, ZS = 0.005, zExt = [];
  for (let y = ZY0; y > -L - 0.03; y -= ZS) {
    let w = 0.004; for (let z = 0.1; z > 0.004; z -= 0.003) { let hit = false; for (let x = 0.04; x < 0.14 && !hit; x += 0.004) hit = core(x, y, z) < 0; if (hit) { w = z; break; } }
    zExt.push(w);
  }
  for (let r = 0; r < 2; r++) for (let i = 1; i < zExt.length - 1; i++) zExt[i] = (zExt[i - 1] + 2 * zExt[i] + zExt[i + 1]) / 4;
  const halfW = y => { const f = cl((ZY0 - y) / ZS, 0, zExt.length - 1.001), i = Math.floor(f); return zExt[i] + (zExt[i + 1] - zExt[i]) * (f - i); };
  const yRoot = z0 => { const a = Math.abs(z0); return m[1] - 0.022 + (cheekY - 0.014 - (m[1] - 0.022)) * smoothstep(0.02, 0.046, a); };
  // one lock: relative position zeta (-1..1) across the beard, root height y0 down to yEnd, S-curve of amplitude amp (m) and wavelength wl
  const addLock = (zeta, y0, yEnd, o, wisps) => {
    const yz = []; const st = o.step ?? 0.006;
    for (let y = y0; y > yEnd; y -= st) { const s = (y0 - y) / (y0 - yEnd); yz.push([y, zeta * (1 - (o.drift ?? 0.1) * s) * halfW(y) * (o.fill ?? 0.94) + o.amp * Math.sin((y0 - y) / o.wl * 2 * Math.PI + o.phase) * smoothstep(0, 0.25, s)]); }
    const tr = traceSurface(core, yz); if (tr.pts.length < 4) return;
    const lk = lockFromTrace(tr, o); locks.push(lk); if (wisps) for (const q of tipWisps(lk, rr, wisps)) locks.push(q);
  };
  // layer 1: the full-length under-layer, one lock per ~8 mm across the jaw, centre longest (defines the silhouette)
  const nA = Math.round(p.locks ?? 14);
  for (let i = 0; i < nA; i++) {
    const zeta = (i + 0.5) / nA * 2 - 1 + (rr() - 0.5) * 0.04, y0 = yRoot(zeta * zMax) - rr() * 0.006;
    const yEnd = -L * (0.78 + 0.22 * (1 - zeta * zeta) * (0.85 + 0.3 * rr()));
    addLock(zeta, y0, yEnd, {amp: 0.005 + 0.004 * rr(), wl: 0.06 + 0.05 * rr(), phase: rr() * 6.28, off: 0, R: (0.0052 + 0.0012 * rr()) * (0.8 + 0.2 * W), taper: 0.5, tip: 0.0005}, {s0: 0.7, count: 1 + (rr() < 0.5 ? 1 : 0), spread: 0.01, extend: 0.1, R: 0.0017});
  }
  // layer 2: shorter tufts that start lower on the chin and lie over the first layer (their blunt ends step over it)
  const nB = Math.round(p.tufts ?? 15);
  for (let i = 0; i < nB; i++) {
    const zeta = ((i + rr() * 0.8) / nB * 2 - 1) * 0.8, y0 = -0.004 - rr() * 0.07 * L / 0.3 - (Math.abs(zeta) > 0.5 ? 0.01 : 0);
    const yEnd = y0 - L * (0.22 + 0.3 * rr()) * (1 - 0.35 * Math.abs(zeta));
    addLock(zeta, y0, yEnd, {step: 0.005, amp: 0.004 + 0.004 * rr(), wl: 0.05 + 0.05 * rr(), phase: rr() * 6.28, off: 0.0022, R: (0.0043 + 0.0012 * rr()) * (0.8 + 0.2 * W), root: 0.8, taper: 0.4, tip: 0.0004}, {s0: 0.62, count: 2, spread: 0.009, extend: 0.14, R: 0.0014});
  }
  // layer 3: a few loose wisps near the edge and the tip, standing a little off the mass
  for (let i = 0; i < (p.wisps ?? 8); i++) {
    const zeta = (i % 2 ? 1 : -1) * (0.3 + 0.6 * rr()) * 0.8, y0 = -0.02 - rr() * 0.12 * L / 0.3;
    addLock(zeta, y0, y0 - L * (0.25 + 0.25 * rr()), {step: 0.005, amp: 0.004, wl: 0.05 + 0.03 * rr(), phase: rr() * 6.28, off: 0.004, R: 0.0022 + 0.0008 * rr(), root: 0.6, taper: 0.3, tip: 0.0003});
  }
  const LS = lockSet(locks, {k: 0.0014, pad: 0.003});
  function sdf(x, y, z) {
    let d = smin(core(x, y, z) + inset * (1 - smoothstep(cheekY - 0.05, cheekY - 0.012, y)), LS.eval(x, y, z), 0.002);   // the inset fades out on the cheek, so a thin stubble shell remains there
    if (chest) d = smax(d, -(chest(x, y, z) - gap * 0.5), 0.004);
    return d;
  }
  const skinD = H.sdf, tmp = [0, 0, 0], fat = f => (x, y, z) => { let d = smin(core(x, y, z) + inset, LS.eval(x, y, z) - f, 0.004); if (chest) d = smax(d, -(chest(x, y, z) - gap * 0.5), 0.004); return d; };
  return {sdf, bounds: [-0.02, -L - 0.04, -0.1, chest ? 0.24 : 0.14, cheekY + 0.01, 0.1], cell: p.cell || 0.0055, tris: [(p.tris || [4500, 1200, 200])[0]],
    lods: (p.tris || [4500, 1200, 200]).slice(1).map((t, i) => ({sdf: fat(0.0012 + 0.003 * i), cell: 0.0034 + 0.0018 * i, tris: [t]})),
    cull: (x, y, z) => H.sdf(x, y, z) < -0.002, project: 0.003, locks: LS,
    // band = (u along the hair, v across the lock + per-lock offset, skin proximity 0..1 for the root fade)
    ao: 0.006, aoFloor: 0.62,
    // continuous flow coordinates: u runs down the beard, v across it relative to the beard's width (locks follow lines of constant v, so strands converge towards the tip like real hair)
    band: (x, y, z, o) => { o[0] = -y; o[1] = z / Math.max(0.004, halfW(y)) * 0.045; o[2] = 1 - smoothstep(0.0005, 0.007, skinD(x, y, z)); },
    paint: (x, y, z, o) => {
      LS.info(x, y, z, tmp); const t = tmp.t ?? 0, valley = smoothstep(0.0008, 0.0035, tmp.d);
      o[0] = cl(0.4 * (1 - smoothstep(0, 0.1, t)) + 0.14 * valley + 0.14 * (tmp[2] - 0.5), 0, 1);   // darker roots and valleys, a little variation per lock
    }};
}

/* =====================================================================================
   HANDS  (frame: wrist at the origin, fingers along +X, back of the hand +Y, thumb on side*Z)
   ===================================================================================== */
// Anatomical hand (ANSUR II hand length 195 mm / breadth 90 mm for older men, scaled to the figure: 1 real mm = MM figure metres).
// Frame: wrist at the origin, fingers along +X, back of the hand +Y, the thumb on side*Z.
// Rig: four fingers with three phalanges (knuckle position, phalanx lengths and tapering radii from ANSUR / hand-anatomy data),
// a thumb from the side of the palm (CMC joint, metacarpal + two phalanges, own thenar pad), nails, veins and tendons on the back.
// Pose = JOINT ANGLES, so any NPC can pose a hand:
//   handAngles(pose, opts) -> {f: [[mcp, pip, dip, spreadDeg] x4 (index..little)], t: [[yaw, pitch] x3 (metacarpal, proximal, distal)]}
//   flexion angles are in radians, positive = curling towards the palm (-Y); thumb yaw is cumulative (positive = away from the index
//   finger), pitch negative = towards the palm. hand({angles}) takes any such object; 'rest' | 'grip' | 'point' come from handAngles.
//   hand() returns the part spec plus .nails (a second spec: draw it in a lighter, pinker colour), .joints (joint positions in
//   hand coordinates, for pose code) and .grip = [x,y] of the held axis (along hand Z) for 'grip'.
// p: {pose, side:+1|-1 (which Z the thumb is on), size, age (knuckles, veins), gripR (radius of what it holds, figure metres), curl, spread, angles}
const MM = 0.000608;   // figure metres per real mm (head height 233.5 mm real = 0.142 m figure)
const FING = [ // MCP centre (x, z mm), phalanx lengths mm, radius at base / middle / distal mm, natural spread (deg, + towards the thumb)
  {x: 98, z: 33, L: [40, 23, 18], r: [10, 8.6, 7.4], sp: 6}, {x: 100, z: 11, L: [44, 27, 20], r: [10.5, 9, 7.6], sp: 1},
  {x: 95, z: -11, L: [41, 26, 19], r: [9.6, 8.3, 7.2], sp: -3}, {x: 86, z: -31, L: [33, 19, 17], r: [8.6, 7.4, 6.6], sp: -9}];
const THUMB = {c: [12, -9, 29], L: [46, 32, 26], r: [10, 8.8, 7.6, 6.6]};   // CMC joint (x, y, z mm); metacarpal, proximal, distal; radii at the joints
const KY = 1.8 * MM;   // height of the finger axis above the palm mid-plane
// ---- grip planning: everything is derived from the radius of the held rod (gR, figure metres) ----
// The rod is a straight line in hand coordinates: it passes below the knuckles at a height such that the first phalanx leaves the knuckle
// at about 65 deg round the rod, and is slightly diagonal because the knuckle line is (x of index 98 mm, little finger 86 mm). Every finger
// is a closed loop: its joints lie on the circle (rod centre in the finger's own plane, radius = rod + 0.7 finger radius), the chord of each
// phalanx on that circle gives the joint flexion (mcp ~ 75, pip ~ 95, dip ~ 55 deg for a 15 mm rod). The thumb comes from the web the other way
// round and is solved by a small IK so its tip presses on the middle phalanx of the index finger without entering the fingers or the rod.
const fkFinger = (i, a, side) => {
  const F = FING[i], [mcp, pip, dip, sp] = a, psi = sp * D2R, K = [F.x * MM, KY, side * F.z * MM], pts = [K], ang = [mcp, pip, dip];
  let phi = 0;
  F.L.forEach((L, j) => { phi -= ang[j]; const P = pts[j]; pts.push([P[0] + L * MM * Math.cos(phi) * Math.cos(psi), P[1] + L * MM * Math.sin(phi), P[2] + side * L * MM * Math.cos(phi) * Math.sin(psi)]); });
  return pts;
};
const fkThumb = (t, side) => {
  const pts = [THUMB.c.map((v, k) => v * MM * (k === 2 ? side : 1))]; let Y = 0, T = 0;
  THUMB.L.forEach((L, j) => { Y += t[j][0]; T += t[j][1]; const P = pts[j]; pts.push([P[0] + L * MM * Math.cos(T) * Math.cos(Y), P[1] + L * MM * Math.sin(T), P[2] + side * L * MM * Math.cos(T) * Math.sin(Y)]); });
  return pts;
};
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], t = cl(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1); return [Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t, p[2] - a[2] - dz * t), t]; };
const gripCache = new Map();
export function gripPlan(gR = 0.0105, side = 1) {
  const key = gR + '/' + side; if (gripCache.has(key)) return gripCache.get(key);
  const rm = FING.map(F => (F.r[0] + F.r[1] + F.r[2]) / 3 * MM), Rn = rm.map(r => gR + 0.7 * r), TH0 = 74 * D2R;
  const cy = KY - Rn.reduce((s, v) => s + v, 0) / 4 * Math.sin(TH0);
  // rod centre x per finger plane, then a straight line x = a + b z through them (z is the signed finger z)
  const zs = FING.map(F => side * F.z * MM), cxs = FING.map((F, i) => F.x * MM - Math.sqrt(Math.max(0, Rn[i] ** 2 - (KY - cy) ** 2))), n = 4;
  const mz = zs.reduce((s, v) => s + v, 0) / n, mx = cxs.reduce((s, v) => s + v, 0) / n;
  const b = zs.reduce((s, z, i) => s + (z - mz) * (cxs[i] - mx), 0) / zs.reduce((s, z) => s + (z - mz) ** 2, 0), a0 = mx - b * mz;
  const f = [], R = [];
  FING.forEach((F, i) => {
    const Cx = a0 + b * zs[i], dx = F.x * MM - Cx, dy = KY - cy, Rf = Math.hypot(dx, dy); R.push(Rf);
    let th = Math.atan2(dy, dx); const dirs = [];
    for (const L of F.L) { const dth = 2 * Math.asin(Math.min(1, L * MM / (2 * Rf))); dirs.push(th - dth / 2 - Math.PI / 2); th -= dth; }
    f.push([-dirs[0], dirs[0] - dirs[1], dirs[1] - dirs[2], 0]);
  });
  const rod = {p: [a0, cy, 0], d: norm3([b, 0, 1]), alpha: Math.atan(b)};
  // thumb IK: tip on the outside of the index finger's middle phalanx (75 deg below the rod centre), no penetration of fingers or rod
  const fing = f.map((a, i) => fkFinger(i, a, side)), Ci = [a0 + b * zs[0], cy, zs[0]], rt = THUMB.r.map(v => v * MM);
  const ang = -75 * D2R, tr = R[0] + rm[0] + 0.55 * rt[3], target = [Ci[0] + tr * Math.cos(ang), Ci[1] + tr * Math.sin(ang), side * (FING[0].z + FING[1].z) / 2 * MM * 0.8 + side * 0.002];
  const rd = rod.d, dRod = p => { const w = [p[0] - rod.p[0], p[1] - rod.p[1], p[2] - rod.p[2]], u = w[0] * rd[0] + w[1] * rd[1] + w[2] * rd[2]; return Math.hypot(w[0] - u * rd[0], w[1] - u * rd[1], w[2] - u * rd[2]); };
  const cost = t => {
    const P = fkThumb(t, side); let c = 0;
    c += 40 * ((P[3][0] - target[0]) ** 2 + (P[3][1] - target[1]) ** 2 + (P[3][2] - target[2]) ** 2) / (MM * MM * 100);
    for (let j = 0; j < 3; j++) for (let u = 0; u <= 6; u++) {
      const q = lerp3(P[j], P[j + 1], u / 6), r = rt[j] + (rt[j + 1] - rt[j]) * u / 6;
      c += 3 * Math.max(0, gR + r * 0.75 - dRod(q)) ** 2 / (MM * MM);
      fing.forEach((pts, i) => { if (j === 2 && u > 4 && i === 0) return; for (let k = 0; k < 3; k++) { const [d, tt] = segDist(q, pts[k], pts[k + 1]), rf = FING[i].r[k] * MM; c += 3 * Math.max(0, r * 0.7 + rf * 0.85 - d) ** 2 / (MM * MM); } });
    }
    for (let j = 0; j < 3; j++) c += 0.002 * (t[j][0] ** 2 + t[j][1] ** 2);
    return c;
  };
  let best = [[0.1, -0.9], [-0.1, -0.5], [-0.3, -0.3]], bc = cost(best), seed = 7, rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5;
  for (let it = 0, st = 0.5; it < 2500; it++) {
    if (it % 400 === 399) st *= 0.5;
    const cand = best.map(q => [cl(q[0] + rnd() * st, -1.2, 1.2), cl(q[1] + rnd() * st, -1.5, 0.5)]), cc = cost(cand);
    if (cc < bc) { bc = cc; best = cand; }
  }
  const tp = fkThumb(best, side), plan = {f, t: best, rod, R, theta0: TH0, thumbTip: tp[3], thumbErr: Math.hypot(tp[3][0] - target[0], tp[3][1] - target[1], tp[3][2] - target[2]) / MM};
  gripCache.set(key, plan); return plan;
}
export function handAngles(pose = 'rest', o = {}) {
  const curl = o.curl ?? 1, spread = o.spread ?? 1, gR = o.gripR ?? 0.0105;
  const rest = () => ({f: FING.map((f, i) => [(0.3 + 0.06 * i) * curl, (0.42 + 0.07 * i) * curl, (0.3 + 0.05 * i) * curl, f.sp * spread * 0.7]), t: [[0.62, -0.3], [-0.12, -0.35 * curl], [-0.08, -0.3 * curl]]});
  if (pose === 'rest') return rest();
  if (pose === 'grip') { const g = gripPlan(gR, o.side ?? 1); return {f: g.f, t: o.thumb || g.t}; }
  if (pose === 'point') { const g = rest(); g.f[0] = [0.06, 0.05, 0.03, 4]; for (let i = 1; i < 4; i++) g.f[i] = [1.35, 1.7, 1.0, 0]; g.t = [[0.35, -0.4], [-0.1, -0.2], [-0.05, -0.1]]; return g; }
  throw new Error('handAngles: unknown pose ' + pose);
}
export function hand(p = {}) {
  const pose = p.pose || 'rest', side = p.side ?? 1, S = p.size ?? 1, age = p.age ?? 1, gR = p.gripR ?? 0.0105;
  const A = p.angles || handAngles(pose, {curl: p.curl, spread: p.spread, gripR: gR, thumb: p.thumb, side});
  // forward kinematics: finger joints and thumb joints in hand coordinates (figure metres at size 1)
  const fingers = FING.map((F, i) => ({pts: fkFinger(i, A.f[i], side), r: [...F.r.map(r => r * MM), F.r[2] * MM * 0.82]}));
  const th = {pts: fkThumb(A.t, side), r: THUMB.r.map(v => v * MM)};
  const plan = pose === 'grip' ? gripPlan(gR, side) : null, rod = plan && plan.rod;
  const rodD = rod ? (x, y, z) => { const w0 = x - rod.p[0], w1 = y - rod.p[1], w2 = z - rod.p[2], u = w0 * rod.d[0] + w2 * rod.d[2]; return Math.hypot(w0 - u * rod.d[0], w1, w2 - u * rod.d[2]); } : null;
  const seg = (x, y, z, a, b, r1, r2) => sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r1, r2);
  // veins and tendons on the back of the hand: polylines in the (x, z) plane (mm -> m), raised ridges
  const V = [[[94, 24], [70, 20], [48, 15], [26, 11], [0, 8]], [[96, 4], [72, 2], [50, 4], [28, 1], [0, 2]], [[90, -22], [64, -17], [42, -11], [20, -6], [0, -2]], [[66, 30], [44, 24], [26, 17], [8, 12]]]
    .map(l => l.map(q => [q[0] * MM, q[1] * MM * side]));
  const T = [[98, 33], [100, 11], [95, -11], [86, -31]].map(q => [[q[0] * MM, q[1] * MM * side], [28 * MM, (q[1] * 0.5 - 2) * MM * side]]);
  const CREASE = [[[88, 22], [70, 20], [52, 15], [38, 9], [24, 4], [10, 2]], [[96, -28], [82, -22], [66, -12], [52, -6], [40, 3]], [[98, 18], [92, 6], [88, -8], [88, -26]]].map(l => l.map(q => [q[0] * MM, q[1] * MM * side]));
  const ridge = (x, z, L, w) => { let m = 9; for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = cl(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1); m = Math.min(m, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return Math.exp(-(m * m) / (w * w)); };
  function sdf(X, Y, Z) {
    const x = X / S, y = Y / S, z = Z / S;
    // palm: a tapered, slightly domed slab (60 mm wide at the wrist, 90 mm at the knuckles)
    const t = cl(x / (100 * MM), 0, 1), hw = (31 + 14 * t) * MM, az = Math.abs(z), wz = z * (45 * MM / hw);
    let d = sdBox(x - 52 * MM, y - 1.2 * MM * (1 - (az / hw) ** 2) + 0.5 * MM, wz, 50 * MM, 11.5 * MM, 45 * MM * 0.97, 7 * MM);
    d = smin(d, sdRoundCone(x, y, z, -0.06, 0, 0, 0.004, 0, 0, 0.0158, 0.0156), 0.012);                       // wrist into the sleeve
    // thenar pad (ball of the thumb) and the hypothenar edge
    d = smin(d, sdEllipsoid(x - 31 * MM, y + 7 * MM, z - side * 20 * MM, 32 * MM, 12 * MM, 18 * MM), 0.009);
    d = smin(d, sdEllipsoid(x - 37 * MM, y + 3.5 * MM, z + side * 29 * MM, 27 * MM, 10 * MM, 12 * MM), 0.008);
    if (!pose.startsWith('g')) d = smax(d, -sdEllipsoid(x - 62 * MM, y + 15 * MM, z - side * 2 * MM, 24 * MM, 5.5 * MM, 17 * MM), 0.006);   // slight cup of the palm between the pads
    // wrist: oval, narrower than the palm, with the ulnar styloid (a bump on the little-finger side at the back) and the radial one
    d = smin(d, sdEllipsoid(x - 2 * MM, y - 5.5 * MM, z + side * 20 * MM, 7 * MM, 5 * MM, 5 * MM), 0.005);
    d = smin(d, sdEllipsoid(x - 4 * MM, y - 3 * MM, z - side * 20 * MM, 6 * MM, 4 * MM, 4 * MM), 0.005);
    if (rod) { // the rod lies in a channel across the palm, and the palm heel rolls up round its far side
      const o = gR + 0.0035, ox = rod.p[0] - o * 0.97, oy = rod.p[1] - o * 0.25, L = 0.025;
      d = smin(d, sdCapsule(x, y, z, ox - rod.d[0] * L, oy, -rod.d[2] * L, ox + rod.d[0] * L, oy, rod.d[2] * L, 0.0042), 0.007);
      d = smax(d, gR * 1.0 - rodD(x, y, z), 0.004);
    }
    // fingers: tapering segments, knuckle bumps at every joint (bigger with age)
    for (const f of fingers) {
      let df = 9;
      for (let j = 0; j < 3; j++) df = smin(df, seg(x, y, z, f.pts[j], f.pts[j + 1], f.r[j], f.r[j + 1]), 0.0012);
      for (let j = 0; j < 3; j++) {
        const P = f.pts[j]; let ux = 0, uy = 1;
        if (j > 0) { const q = f.pts[j - 1], dx = P[0] - q[0], dy = P[1] - q[1], l = Math.hypot(dx, dy) || 1; ux = -dy / l; uy = dx / l; }
        df = smin(df, sdSphere(x - P[0] - ux * f.r[j] * 0.32, y - P[1] - uy * f.r[j] * 0.32, z - P[2], f.r[j] * (j === 0 ? 0.98 : 0.9) * (1 + (j === 0 ? 0.2 : 0.12) * age)), 0.003);
      }
      d = smin(d, df, 0.005);
    }
    { let dt = 9; // thumb: metacarpal, two phalanges, knuckles at the MCP and IP joints
      for (let j = 0; j < 3; j++) dt = smin(dt, seg(x, y, z, th.pts[j], th.pts[j + 1], th.r[j], th.r[j + 1]), 0.002);
      for (let j = 1; j < 3; j++) dt = smin(dt, sdSphere(x - th.pts[j][0], y - th.pts[j][1] - th.r[j] * 0.15, z - th.pts[j][2], th.r[j] * (0.95 + 0.1 * age)), 0.003);
      d = smin(d, dt, 0.006); }
    // (no raised nail plate: its sub-millimetre ridge made normals sweep through every orientation inside a pixel, which sparkled)
    if (d < 0.005 && y > 0) { // back of the hand: metacarpal ridges fanning to the knuckles with sunken valleys between, veins on top
      let v = 0; for (const l of V) v = Math.max(v, ridge(x, z, l, 2.1 * MM)); let tn = 0, tw = 0; for (const l of T) { tn = Math.max(tn, ridge(x, z, l, 3.6 * MM)); tw = Math.max(tw, ridge(x, z, l, 8 * MM)); }
      const m = age * smoothstep(0, 0.004, y) * smoothstep(0.1, 0.07, x) * smoothstep(0.02, 0.05, x);
      d -= (0.0011 * v + 0.0011 * tn) * m; d += 0.0009 * (1 - tw) * m;
    }
    return (d + 0.00035 * fbm(x * 260, y * 260, z * 260, 1)) * S;
  }
  // nails: a slightly raised oval plate on the back of each distal phalanx. It is part of the hand's own surface (smooth-min), so the
  // normals stay smooth (a separate thin shell gave chrome-looking glints on real GPUs) and the colour comes from the paint channel.
  const nails = fingers.map(f => ({a: f.pts[2], b: f.pts[3], r: f.r[2], w: f.r[3] * 0.62})).concat([{a: th.pts[2], b: th.pts[3], r: th.r[2], w: th.r[3] * 0.66}]);
  const nailPlate = (x, y, z) => {
    let d = 9;
    for (const n of nails) {
      const ax = n.b[0] - n.a[0], ay = n.b[1] - n.a[1], az = n.b[2] - n.a[2], L = Math.hypot(ax, ay, az), ux = ax / L, uy = ay / L, uz = az / L;
      let vx = -uy, vy = ux; if (vy < 0) { vx = -vx; vy = -vy; }   // v: the back of the finger (up)
      const wx = -uz * vy, wy = uz * vx, wz = ux * vy - uy * vx;
      const px = x - n.a[0] - ux * L * 0.58, py = y - n.a[1] - uy * L * 0.58, pz = z - n.a[2] - uz * L * 0.58;
      d = Math.min(d, sdEllipsoid(px * ux + py * uy + pz * uz, px * vx + py * vy - n.r * 0.88, px * wx + py * wy + pz * wz, L * 0.5, 0.0011, n.w));
    }
    return d;
  };
  const tips = fingers.map(f => f.pts[3]).concat([th.pts[3]]);
  const paint = (x, y, z, o) => { // knuckles and fingertips ruddier, veins a touch darker; wrinkle mask on every joint and the back of the hand
    let k = 0, m = 0; const q = [x / S, y / S, z / S];
    for (const t of tips) k = Math.max(k, gauss(q[0], q[1], q[2], t, 0.007));
    for (const f of fingers) { k = Math.max(k, 0.5 * gauss(q[0], q[1], q[2], f.pts[0], 0.006)); for (let j = 0; j < 3; j++) m = Math.max(m, gauss(q[0], q[1], q[2], f.pts[j], 0.0055)); }
    for (let j = 1; j < 3; j++) m = Math.max(m, gauss(q[0], q[1], q[2], th.pts[j], 0.0055));
    let v = 0; if (y > 0) for (const l of V) v = Math.max(v, ridge(q[0], q[2], l, 2.4 * MM));
    const nm = x / S > 0.06 ? smoothstep(0.0019, 0.0006, nailPlate(q[0], q[1], q[2])) : 0;   // nails: lighter than the skin (paint below 0 extrapolates away from col2)
    let cr = 0; if (y < 0) for (const l of CREASE) cr = Math.max(cr, ridge(q[0], q[2], l, 1.5 * MM));   // palm creases: thenar arc, proximal and distal transverse
    o[0] = Math.min(1, k * 0.7 + v * 0.3 + cr * 0.45) * (1 - nm); o[1] = Math.min(1, age * (0.9 * m + 0.45 * smoothstep(0.0, 0.004, y) * smoothstep(0.09, 0.03, x)) + cr * 0.9);
  };
  const b = [-0.07, -0.07, -0.06, 0.145, 0.045, 0.065].map(v => v * S);
  return {sdf, paint, joints: {fingers: fingers.map(f => f.pts), thumb: th.pts}, bounds: b, cell: p.cell || 0.0024 * S, tris: p.tris || [520, 190], project: 0.0015,
    // grip: the held axis in hand coordinates (point on it, unit direction, angle from hand Z about Y) so the pose code can stand it upright
    grip: rod ? {p: rod.p.map(v => v * S), d: rod.d, alpha: rod.alpha} : null};
}

/* =====================================================================================
   ROBES
   ===================================================================================== */
// Long skirt from the floor to the waist (frame B). p: {height, hem (radius at the floor), waist (radius), folds (count),
// depth (fold depth), seed}. The bottom 3.5 mm is culled (stands on the floor).
// Worn, ragged hem as a function lift(x, z) = how high the bottom edge stands off the floor: slow noise (amp), plus `notches` frayed V-cuts
// (width in radians, depth in metres) placed by a seeded hash. rag = {amp, notches, depth, width, seed}; omit for a clean hem.
export function hemLift(rag) {
  if (!rag) return () => 0;
  const amp = rag.amp ?? 0.005, n = rag.notches ?? 6, dep = rag.depth ?? 0.014, wid = rag.width ?? 0.075, sd = rag.seed ?? 1, N = [];
  for (let k = 0; k < n; k++) { const h1 = noise(k * 7.31 + sd, 1.7, 3.3), h2 = noise(k * 3.77 + 9.1, sd, 5.1); N.push([(k + h1 * 0.8) / n * Math.PI * 2 - Math.PI, wid * (0.6 + 0.8 * h2), dep * (0.45 + 0.55 * noise(k * 5.9, 2.2, sd))]); }
  return (x, z) => {
    const a = Math.atan2(z, x), ca = Math.cos(a), sa = Math.sin(a);
    let L = amp * cl(0.5 + 1.2 * fbm(ca * 3.1 + sd, sa * 3.1, 11.3, 3), 0, 1);
    for (const [c, w, d] of N) { let da = Math.abs(a - c); da = Math.min(da, Math.PI * 2 - da); if (da < w) L += d * Math.pow(1 - da / w, 1.6); }
    return L;
  };
}
// Fabric wear as a paint value 0..1 (blend towards col2): slow colour variation (vary, freq per m) plus dirt that builds up towards the floor
// (dirt strength, dirtY = height where it fades out). Use it in a part's paint: o[0] = wear(x, y, z).
export function wearPaint(p = {}) {
  const vary = p.vary ?? 0.3, fq = p.freq ?? 7, dirt = p.dirt ?? 0, dy = p.dirtY ?? 0.16, sd = p.seed ?? 0;
  return (x, y, z) => cl(vary * cl(0.5 + 1.1 * fbm(x * fq + sd, y * fq * 0.8, z * fq, 3), 0, 1) + (dirt ? dirt * smoothstep(dy, 0, y) * (0.55 + 0.45 * noise(x * 38 + sd, y * 12, z * 38)) : 0), 0, 1);
}
export function robeSkirt(p = {}) {
  const Hh = p.height ?? 0.53, hem = p.hem ?? 0.175, waist = p.waist ?? 0.092, nf = p.folds ?? 10, dep = p.depth ?? 1, asp = p.aspect ?? 1; // aspect: top is wider front-to-back (belly), fading to round at the hem
  const lift = hemLift(p.rag);   // worn hem: how far the bottom edge rises off the floor at (x, z)
  const rh = (x, z, t) => Math.hypot(x / (1 + (asp - 1) * smoothstep(0.45, 0.92, t)), z);
  function base(x, y, z) { // smooth silhouette, used for trim bands
    const t = cl(y / (Hh - 0.03), 0, 1), rho = rh(x, z, t);
    return rho - (waist + (hem - waist) * Math.pow(1 - t, 1.35) + 0.012 * smoothstep(0.12, 0, y));
  }
  function sdf(x, y, z) {
    const t = cl(y / (Hh - 0.03), 0, 1), rho = rh(x, z, t);
    if (rho > hem * 1.5) return rho - hem * 1.2;
    const a = Math.atan2(z, x), ca = Math.cos(a), sa = Math.sin(a);
    let R = waist + (hem - waist) * Math.pow(1 - t, 1.35) + 0.012 * smoothstep(0.12, 0, y);
    // gravity folds: round tubular ridges between sharp valleys, widths vary with angle and height, deeper towards the hem,
    // calm at the waist where the cloth is gathered under the sash
    const fa = nf * a + 1.4 * Math.sin(3 * a + y * 5) + 2.6 * fbm(ca * 2, sa * 2, y * 3, 2);
    const ridge = Math.pow(0.5 + 0.5 * Math.cos(fa), 0.7) * 2 - 1;
    const amp = dep * (0.012 + 0.085 * Math.pow(1 - t, 1.5));
    const fb = 2.1 * nf * a + 7 * fbm(ca * 3, sa * 3, y * 4 + 3, 2);
    const small = dep * 0.014 * (1 - t) * smoothstep(0.05, 0.4, t) * Math.sin(fb);                       // narrow folds between the big ones
    const pinch = dep * 0.006 * smoothstep(0.78, 0.9, t) * Math.sin(26 * a + 5 * fbm(ca * 4, sa * 4, y * 9, 1));   // radial pinch folds under the sash
    R *= 1 + amp * ridge + small + pinch + dep * 0.012 * (worley(ca * 2.4, y * 6, sa * 2.4) - 0.5);
    // the hem rests on the floor: it flares and breaks in a few folds on the ground, never the same height twice
    R += dep * smoothstep(0.06, 0, y) * (0.006 + 0.012 * Math.max(0, fbm(ca * 2.2, sa * 2.2, 7.3, 2)));
    // front opening: the left panel overlaps the right, a step and a groove from the waist to the floor
    { const w = smoothstep(0, 0.06, x), sd = z - 0.034 * (0.6 + 0.4 * t), step = smoothstep(-0.004, 0.004, sd); R += w * dep * (0.0035 * step - 0.0022 * Math.exp(-(sd * sd) / 0.000006) * smoothstep(0.0, 0.1, y)); }
    let d = (rho - R) * 0.8;
    d = smax(d, y - Hh, 0.01);
    return smax(d, 0.45 * lift(x, z) - y, 0.003);
  }
  return {sdf, base, bounds: [-hem * 1.3, -0.02, -hem * 1.3, hem * 1.3, Hh + 0.02, hem * 1.3], cell: p.cell || 0.012, tris: p.tris || [480, 180, 180], cull: (x, y, z) => y < 0.0035 + 0.45 * lift(x, z), project: 0.004, lift};
}

// A band of trim (hem, sash, cuff) laid over a cloth surface: the shell between `out` and `out+thick` outside
// base(x,y,z), inside region(x,y,z) < 0. Returns a part spec; also give the cloth part cull: spec.covers so the
// hidden cloth under the band is dropped.
// Embroidery (shader pattern, no textures): p.motif = 1 ember flames | 2 Greek key | 3 key on cloth (stole border) | 4 polished metal | 5 leather, drawn by the
// `trim`/`cloth` shaders from a per-vertex band coordinate (u, v, motif; v is NOT clamped, so it stays linear across big triangles). p.uv(x,y,z,out) sets out = [s, v]: s runs along the band (0..1 once round a closed loop),
// v 0..1 across it. p.cells = how many motif cells fit along s (an integer for a closed loop, so the pattern closes without a seam).
// p.rib = height (m) of a raised piping along the band edges (changes the silhouette a little, the rest is paint).
export function bandCoords(motif, cells, uv, closed = true) {
  return {band: (x, y, z, o) => { uv(x, y, z, o); o[0] *= cells; o[2] = motif; }, bandWrap: closed ? cells : 0};
}
export const constBand = motif => ({band: (x, y, z, o) => { o[0] = 0; o[1] = 0.5; o[2] = motif; }, bandWrap: 0});
export function trimBand(base, region, p = {}) {
  const thick = p.thick ?? 0.005, inset = p.inset ?? 0.002, round = p.round ?? 0.003, ripple = p.ripple ?? 0, rib = p.rib ?? 0;
  const sdf = (x, y, z) => {
    const rg = region(x, y, z);
    let d = smax(Math.abs(base(x, y, z) - (thick - inset) / 2) - (thick + inset) / 2 - (rib ? rib * Math.exp(-(rg * rg) / 0.000012) : 0), rg, round);
    if (ripple && d < 0.006) d += ripple * Math.sin(Math.atan2(z, x) * 40);
    return d;
  };
  // the inner face of the band is buried in the cloth: never mesh it
  const cull = (x, y, z) => base(x, y, z) < 0.0006 || (p.cull && p.cull(x, y, z));
  const bc = p.motif ? bandCoords(p.motif, p.cells || 1, p.uv, p.closed !== false) : {};
  return {sdf, bounds: p.bounds, cell: p.cell || 0.0042, tris: p.tris || [160, 60], cull, project: 0.002, ao: p.ao, ...bc,
    covers: (x, y, z) => region(x, y, z) < -0.0015 && Math.abs(base(x, y, z)) < (p.coverTol ?? 0.006)};
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
   BODY FIRST, CLOTHES OVER IT  (frame U: origin at the waist, +X forward, +Y up, +Z to the side)
   body()  builds an anatomical figure as SDFs from ANTHRO ratios: it is never meshed (except where skin shows).
   dress() builds the garments as shells over it: robe = torso offset by `ease` that hangs straight down from the belly,
           sleeves = tubes around the arm SDFs widening to bell mouths, sash and cuffs = raised bands on those shells.
   ===================================================================================== */
// p: {unit (head height in figure metres, default HEAD_H*0.6), stoop (forward shear of the upper body per m), belly 0..1,
//     narrow (chest width factor), waistNarrow, ratios:{...ANTHRO overrides}, y:{chest, ribs, belly, pelvis, shoulder, neck},
//     arms:[{S,E,W,r:[deltoid, elbow, wrist], back}] in U coords (joint centres; arms stay rigid and separate)}
export function body(p = {}) {
  const u = p.unit ?? HEAD_H * 0.6, o = p.ratios || {}, g = k => (o[k] ?? ANTHRO[k]) * u;
  const Y = {chest: 0.235, ribs: 0.135, belly: 0.03, pelvis: -0.05, shoulder: 0.335, neck: 0.4, ...(p.y || {})};
  const stoop = p.stoop ?? 0, belly = p.belly ?? 0, nx = 0.005;
  const cw = g('chestBreadth') / 2 * (p.narrow ?? 1), cd = g('chestDepth') / 2, ww = g('waistBreadth') / 2 * (p.waistNarrow ?? p.narrow ?? 1), wd = g('waistDepth') / 2, hw = g('hipBreadth') / 2;
  const sw = Math.max(...p.arms.map(a => Math.abs(a.S[2]))), nr = g('neckRadius') * 0.6;   // neck circumference is taken at the Adam's apple; the neck column is ~0.6 of that radius
  const torso = (x, y, z, noNeck) => { // ribcage, belly, pelvis, neck and trapezius slopes; no arms (noNeck: the clothed torso, trapezius starts at the neck base)
    const xs = x - stoop * Math.max(0, y - 0.03), az = Math.abs(z);
    let d = sdEllipsoid(xs, y - Y.chest, z, cd, 0.095, cw);
    d = smin(d, sdEllipsoid(xs, y - Y.ribs, z, cd * 0.98, 0.1, ww * 1.0), 0.05);
    d = smin(d, sdEllipsoid(xs - 0.012 * belly, y - Y.belly, z, wd + 0.03 * belly, 0.075, ww * 1.02), 0.04);
    d = smin(d, sdEllipsoid(x, y - Y.pelvis, z, wd * 1.05, 0.07, hw), 0.04);
    if (!noNeck) d = smin(d, sdRoundCone(xs, y, az, nx, Y.neck - 0.1, 0, nx, Y.neck, 0, nr * 1.05, nr), 0.03);
    // trapezius: a slope from the neck (high, near the ear line) down to the acromion (ANSUR cervicale is ~5 cm above the shoulder joint), not a flat shelf
    d = smin(d, sdRoundCone(xs, y, az, nx + 0.004, noNeck ? Y.neck - 0.062 : Y.neck - 0.03, 0.026, 0, Y.shoulder - 0.014, sw - 0.012, noNeck ? 0.034 : 0.026, 0.03), 0.03);
    d = smin(d, sdCapsule(xs, y, az, 0.026, Y.shoulder + 0.022, 0.014, 0.004, Y.shoulder - 0.004, sw - 0.02, 0.0075), 0.014);   // clavicle: from the notch to the acromion
    return d;
  };
  const arms = p.arms.map(a => {
    const F = norm3([a.W[0] - a.E[0], a.W[1] - a.E[1], a.W[2] - a.E[2]]), bk = a.back ?? 0.03, end = [a.W[0] - bk * F[0], a.W[1] - bk * F[1], a.W[2] - bk * F[2]];
    const r = a.r || [g('upperArmRadius') * 0.85, g('elbowRadius') * 0.8, g('wristRadius') * 0.7];
    const sdf = (x, y, z) => smin(sdRoundCone(x, y, z, a.S[0], a.S[1], a.S[2], a.E[0], a.E[1], a.E[2], r[0], r[1]), sdRoundCone(x, y, z, a.E[0], a.E[1], a.E[2], a.W[0], a.W[1], a.W[2], r[1], r[2]), 0.012);
    return {...a, F, end, r, sdf};
  });
  // the whole body: arms are separate pieces with only a small blend at the shoulder, so there is an armpit gap
  const sdf = (x, y, z) => { let d = torso(x, y, z); for (const a of arms) d = smin(d, a.sdf(x, y, z), 0.01); return d; };
  const torsoCloth = (x, y, z) => torso(x, y, z, true);
  return {sdf, torso, torsoCloth, arms, Y, stoop, belly, dims: {cw, cd, ww, wd, hw, sw, nr}, unit: u};
}

// Garments over a body. list: [{type:'robe', ease, hang, folds, collar:{y,r,t}, bounds?, tris?}, {type:'sleeve', arm, ease, bell, folds, cuff:{len,thick}},
//   {type:'sash', y, h, thick}]. Returns {parts:{torso, sleeve0.., sash, cuff0..}, ends:[{at,end,dir,r}], torsoBase, sleeveBase[]}.
// Layering: every shell is a separate part (its own mesh); each culls what lies inside another shell, so the join between
// sleeve and robe is a real crease, darkened by paint and baked AO taken from the other shell.
export function dress(B, list) {
  const robe = list.find(g => g.type === 'robe') || {}, sash = list.find(g => g.type === 'sash'), sleeves = list.filter(g => g.type === 'sleeve');
  const ease = robe.ease ?? 0.012, hang = robe.hang ?? B.Y.belly, co = robe.collar || {};
  const cy = co.y ?? B.Y.neck - 0.04, ct = co.t ?? 0.011, nxp = 0.005 + B.stoop * (cy - 0.03);
  // smooth torso cloth: body offset by ease; below `hang` the cross-section is carried straight down (no clinging to the belly)
  // neckline: the robe stops at the base of the neck (cervicale / collarbones) with an oval scoop, V-ish at the front, and a
  // folded collar band rolled round its edge. The neck itself is skin (recipe part `neck`, K.neck()), not cloth.
  const nl = {x: nxp + (co.dx ?? 0.022), y: (co.ny ?? B.Y.neck - 0.045), rx: co.rx ?? 0.066, ry: co.ry ?? 0.076, rz: co.rz ?? 0.054};
  const bowl = (x, y, z) => sdEllipsoid(x - nl.x, y - nl.y, z, nl.rx, nl.ry, nl.rz);
  const base = (x, y, z) => {
    const d0 = B.torsoCloth(x, Math.max(y, hang), z) - ease;
    let d = smax(d0, -bowl(x, y, z), 0.01);                                         // neckline scoop
    const band = smax(Math.abs(bowl(x, y, z) - 0.002) - ct * 0.62, d0 - 0.004, 0.004);   // collar band: a rolled edge standing ~6 mm off the cloth
    d = smin(d, band, 0.006);
    d = smin(d, sdEllipsoid(x + 0.052 - B.stoop * 0.3, y - nl.y + 0.045, z, 0.042, 0.03, 0.07), 0.035); // cowl bunched at the back, below the neck
    return smax(d, -(y + 0.012), 0.004);
  };
  const sl = sleeves.map(sg => {
    // Loose fabric hanging from the shoulder seam under gravity: the sleeve's top follows the arm line with a small ease, the cloth
    // below the arm hangs down (the centre line of the tube drops by `hang(t)` along world up, the radius grows by the same amount), most
    // at the bell mouth. So the underside is much lower than the top, instead of a tube concentric with the arm.
    const a = B.arms[sg.arm], e = sg.ease ?? 0.006, bell = sg.bell ?? 0.034, nf = sg.folds ?? 1, up = norm3(sg.up || [0, 1, 0]);
    const rw = a.r[2] + bell, LF = Math.hypot(a.W[0] - a.E[0], a.W[1] - a.E[1], a.W[2] - a.E[2]);
    const dE = sg.hangElbow ?? 0.013, dEnd = (rw - a.r[2] - e) * (sg.hang ?? 0.8), dM = dE + (dEnd - dE) * 0.35;
    const lp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t], drop = (p, d) => [p[0] - up[0] * d, p[1] - up[1] * d, p[2] - up[2] * d];
    const Mp = lp(a.E, a.end, 0.55), nS = a.S, nE = drop(a.E, dE), nM = drop(Mp, dM), nEnd = drop(a.end, dEnd), dS = 0.004;
    const rS = a.r[0] + e * 1.6, rE = a.r[1] + e * 1.3 + dE, rM = lp([a.r[1]], [a.r[2]], 0.55)[0] + e * 1.3 + dM + bell * 0.25, rEnd = rw;
    const nS2 = drop(nS, dS);
    const sb = (x, y, z) => smin(smin(sdRoundCone(x, y, z, nS2[0], nS2[1], nS2[2], nE[0], nE[1], nE[2], rS + dS, rE), sdRoundCone(x, y, z, nE[0], nE[1], nE[2], nM[0], nM[1], nM[2], rE, rM), 0.03),
      sdRoundCone(x, y, z, nM[0], nM[1], nM[2], nEnd[0], nEnd[1], nEnd[2], rM, rEnd), 0.03);
    const bis = norm3([(a.S[0] - a.E[0]) / Math.hypot(a.S[0] - a.E[0], a.S[1] - a.E[1], a.S[2] - a.E[2]) + a.F[0], (a.S[1] - a.E[1]) / Math.hypot(a.S[0] - a.E[0], a.S[1] - a.E[1], a.S[2] - a.E[2]) + a.F[1], (a.S[2] - a.E[2]) / Math.hypot(a.S[0] - a.E[0], a.S[1] - a.E[1], a.S[2] - a.E[2]) + a.F[2]]);   // into the bend of the elbow
    const fold = (x, y, z, d) => { // folds: soft noise, compression creases on the inner elbow, cloth gathered under it, hanging folds along the underside that open into the bell
      if (d > 0.03) return d;
      const ex = x - a.E[0], ey = y - a.E[1], ez = z - a.E[2], de = Math.hypot(ex, ey, ez);
      const t = ex * a.F[0] + ey * a.F[1] + ez * a.F[2], tn = cl(t / LF, 0, 1);
      let rx = ex - t * a.F[0], ry = ey - t * a.F[1], rz = ez - t * a.F[2]; const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      const under = cl(-(rx * up[0] + ry * up[1] + rz * up[2]), -1, 1), inner = smoothstep(-0.3, 0.8, rx * bis[0] + ry * bis[1] + rz * bis[2]);
      d += nf * 0.0035 * (fbm(x * 26, y * 26, z * 26, 2) - 0.5) * 2;
      const crook = Math.exp(-(de * de) / 0.0022);
      d += nf * 0.0046 * Math.sin(70 * t + 5 * fbm(x * 12, y * 12, z * 12, 2)) * crook * (0.3 + 0.7 * inner);   // compression folds at the inner elbow
      d -= nf * 0.005 * crook * inner;                                                                       // the gathered cloth bulges out there
      d -= nf * 0.011 * Math.exp(-((x - a.E[0] + 0.01) ** 2 + (y - a.E[1] + 0.03) ** 2 + (z - a.E[2]) ** 2) / 0.0012);   // cloth sagging under the elbow
      const ang = Math.atan2(rz - 0.3 * ry * a.F[2], -ry), wv = 3 * fbm(x * 9, y * 9, z * 9, 2);   // angle round the arm measured from straight down
      const toEnd = (a.end[0] - x) * a.F[0] + (a.end[1] - y) * a.F[1] + (a.end[2] - z) * a.F[2];
      d += nf * (0.0022 + 0.09 * (rw - a.r[2] - e)) * smoothstep(0.03, 0.05, toEnd) * (Math.pow(0.5 + 0.5 * Math.cos(5 * ang + wv + 10 * t), 0.8) * 2 - 1) * smoothstep(0.02, 0.5, tn) * (0.3 + 0.7 * tn) * (0.3 + 0.7 * smoothstep(-0.3, 0.9, under));
      // upper sleeve: looser, non-cylindrical volume (cloth hangs off the back/underside) and diagonal drag folds running shoulder -> elbow
      const LU = Math.hypot(a.S[0] - a.E[0], a.S[1] - a.E[1], a.S[2] - a.E[2]), us = cl(-t / LU, 0, 1), uw = smoothstep(0.05, 0.25, us) * (1 - smoothstep(0.85, 1.0, us));
      if (t < 0 && uw > 0) {
        const sag = smoothstep(-0.2, 0.9, under) * (0.6 + 0.4 * Math.sin(2 * ang + 1.3));
        d -= nf * 0.007 * uw * sag * (0.5 + 0.5 * Math.sin(3.1 * us * Math.PI));
        const dg = ang * 3 - us * 9 + 2.2 * fbm(x * 7, y * 7, z * 7, 2);                                       // helical phase: folds slope from the shoulder down to the elbow
        d += nf * 0.0042 * uw * (Math.pow(0.5 + 0.5 * Math.cos(dg), 1.4) * 2 - 1) * (0.5 + 0.5 * smoothstep(-0.5, 0.8, under));
      }
      return d;
    };
    // the mouth: a clean flat cut across the tube (along the last segment's axis Fm, which tilts down with the hang) and a hollow with a
    // ~6 mm wall; the gold cuff band sits over the cut edge. (A sphere carve left ragged shards that showed as black marks.)
    const cEnd = nEnd, Fm = norm3([nEnd[0] - nM[0], nEnd[1] - nM[1], nEnd[2] - nM[2]]);
    const mouth = (x, y, z, d) => {
      const vx = x - cEnd[0], vy = y - cEnd[1], vz = z - cEnd[2], t = vx * Fm[0] + vy * Fm[1] + vz * Fm[2], rad = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - t * t));
      return smax(smax(d, t - 0.012, 0.002), -Math.max(rad - (rw - 0.006), -(t + 0.07)), 0.003);
    };
    const cloth = (x, y, z) => fold(x, y, z, sb(x, y, z)), sdf = (x, y, z) => mouth(x, y, z, cloth(x, y, z));
    return {sg, a, sb, sdf, cloth, rw, cEnd, Fm};
  });
  const sleeveMin = (x, y, z) => { let d = 9; for (const s of sl) d = Math.min(d, s.sb(x, y, z)); return d; };
  const torsoFold = (x, y, z) => {
    let d = base(x, y, z);
    if (d < 0.03) {
      const m = smoothstep((sash ? sash.y + sash.h : 0.045) + 0.01, (sash ? sash.y + sash.h : 0.045) + 0.07, y) * smoothstep(B.Y.shoulder + 0.01, B.Y.shoulder - 0.07, y), a = Math.atan2(z, x - nxp);
      // gravity folds hanging from the shoulders and chest (tubular, varying width), radial pinch folds around the sash, front overlap
      const f = robe.folds ?? 1, yn = nxp, wv = 4 * fbm(x * 18, y * 9, z * 18, 2) + 1.2 * Math.sin(5 * y + 2 * a);
      d += f * 0.0075 * m * (Math.pow(0.5 + 0.5 * Math.cos(9 * a + wv), 0.75) * 2 - 1 + 0.5 * fbm(x * 40, y * 40, z * 40, 2) + 0.4 * Math.sin(17 * a + 3 * wv));
      const sy = sash ? sash.y : 0.017, sh = sash ? sash.h : 0.027;
      { const dy = y - sy; d += f * 0.0055 * (smoothstep(sh + 0.004, sh + 0.022, dy) * smoothstep(sh + 0.09, sh + 0.05, dy) + smoothstep(-sh - 0.004, -sh - 0.02, dy) * smoothstep(-sh - 0.08, -sh - 0.05, dy)) * Math.sin(28 * a + 6 * fbm(x * 20, y * 20, z * 20, 1)); }  // cinch pinch above and below the sash
      { const w = smoothstep(nxp, nxp + 0.05, x), sd = z - 0.03 * smoothstep(B.Y.neck - 0.07, sy + 0.05, y) * 1.0 - 0.004, st = smoothstep(-0.004, 0.004, sd); d -= w * (0.0032 * st - 0.0022 * Math.exp(-(sd * sd) / 0.000006) * smoothstep(sy - 0.03, sy + 0.04, y)); }
      d -= f * 0.0035 * Math.exp(-((x - nxp - 0.03) ** 2 + (y - (B.Y.shoulder - 0.02)) ** 2) / 0.003) * (Math.abs(z) > 0.04 ? Math.sin(40 * (y + 0.5 * z)) : 0);
      { const sz = B.arms[0] ? Math.abs(B.arms[0].S[2]) : 0.11, az2 = Math.abs(z), t = cl(((az2 - sz) * -0.075 + (y - B.Y.shoulder) * -0.12) / (0.075 * 0.075 + 0.12 * 0.12), 0, 1), px = az2 - sz + 0.075 * t, py = y - B.Y.shoulder + 0.12 * t;
        d += f * 0.0032 * Math.exp(-(px * px + py * py) / 0.00018) * smoothstep(0.0, 0.03, x - nxp + 0.06); }   // soft fold from the shoulder point down towards the chest
    }
    return d;
  };
  const crease = (x, y, z, other) => smoothstep(0.014, -0.002, other(x, y, z));  // 0..1 near the other shell
  const parts = {}, ends = [];
  parts.torso = {sdf: torsoFold, bounds: robe.bounds || [-0.16, -0.05, -0.2, 0.2, B.Y.neck + 0.06, 0.2], cell: robe.cell || 0.0095, tris: robe.tris || [620, 230], project: 0.004,
    aoSdf: (x, y, z) => Math.min(torsoFold(x, y, z), sleeveMin(x, y, z) + 0.002), paint: (x, y, z, o) => { o[0] = cl(0.85 * crease(x, y, z, sleeveMin) + (robe.wear ? robe.wear(x, y, z) : 0), 0, 1); },
    cull: (x, y, z) => sleeveMin(x, y, z) < -0.003};
  const trims = {};
  if (sash) {
    const sy = sash.y, sh = sash.h;
    const sashMotif = sash.motif ? {motif: sash.motif, cells: Math.round(2 * Math.PI * 0.1 / (2 * sh * (sash.cellAspect ?? 1))), uv: (x, y, z, o) => { o[0] = Math.atan2(z, x) / (2 * Math.PI) + 0.5; o[1] = (y - (sy - sh)) / (2 * sh); }} : {};
    trims.sash = trimBand(torsoFold, (x, y, z) => Math.abs(y - sy) - sh, {...sashMotif, rib: sash.rib, thick: sash.thick ?? 0.006, coverTol: 0.011, bounds: [-0.14, sy - sh - 0.01, -0.14, 0.14, sy + sh + 0.01, 0.14], tris: sash.tris || [130, 50], cell: sash.cell ?? 0.0042});
    parts.sash = trims.sash;
  }
  sl.forEach((s, i) => {
    const {a, sb, sg, cloth, cEnd, Fm} = s, cf = sg.cuff, sdf0 = s.sdf;
    // armhole seam: a thin welt where the sleeve meets the robe (raised, and darkened below)
    const seam = (x, y, z) => Math.exp(-(((base(x, y, z) - 0.003) / 0.0026) ** 2)), sdf = (x, y, z) => { const d = sdf0(x, y, z); return d < 0.012 ? d - 0.0015 * seam(x, y, z) : d; };
    parts['sleeve' + i] = {sdf, bounds: [Math.min(a.S[0], a.E[0], a.W[0]) - 0.11, Math.min(a.S[1], a.E[1], a.W[1]) - 0.11, Math.min(a.S[2], a.E[2], a.W[2]) - 0.11,
      Math.max(a.S[0], a.E[0], a.W[0]) + 0.11, Math.max(a.S[1], a.E[1], a.W[1]) + 0.11, Math.max(a.S[2], a.E[2], a.W[2]) + 0.11], cell: sg.cell || 0.0075, tris: sg.tris || [380, 150], project: 0.004,
      aoSdf: (x, y, z) => Math.min(sdf(x, y, z), base(x, y, z) + 0.002), paint: (x, y, z, o) => { o[0] = cl(Math.max(0.85 * crease(x, y, z, base), 0.95 * seam(x, y, z)) + (sg.wear ? sg.wear(x, y, z) : 0), 0, 1); },
      cull: (x, y, z) => base(x, y, z) < -0.004};
    if (cf) {
      // cuff band coordinates: angle round the mouth axis, position along it
      const Fb = Math.abs(Fm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], b1 = norm3([Fm[1] * Fb[2] - Fm[2] * Fb[1], Fm[2] * Fb[0] - Fm[0] * Fb[2], Fm[0] * Fb[1] - Fm[1] * Fb[0]]), b2 = [Fm[1] * b1[2] - Fm[2] * b1[1], Fm[2] * b1[0] - Fm[0] * b1[2], Fm[0] * b1[1] - Fm[1] * b1[0]], clen = (cf.len ?? 0.028) + 0.014;
      const cuffMotif = cf.motif ? {motif: cf.motif, cells: Math.round(2 * Math.PI * s.rw / (clen * (cf.cellAspect ?? 1))), uv: (x, y, z, o) => {
        const vx = x - cEnd[0], vy = y - cEnd[1], vz = z - cEnd[2], t = vx * Fm[0] + vy * Fm[1] + vz * Fm[2], rx = vx - t * Fm[0], ry = vy - t * Fm[1], rz = vz - t * Fm[2];
        o[0] = Math.atan2(rx * b2[0] + ry * b2[1] + rz * b2[2], rx * b1[0] + ry * b1[1] + rz * b1[2]) / (2 * Math.PI) + 0.5; o[1] = (t + (cf.len ?? 0.028)) / clen; }} : {};
      const cuff = trimBand(cloth, (x, y, z) => { const t = (x - cEnd[0]) * Fm[0] + (y - cEnd[1]) * Fm[1] + (z - cEnd[2]) * Fm[2], vx = x - cEnd[0], vy = y - cEnd[1], vz = z - cEnd[2], rad = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - t * t)); return Math.max(-(cf.len ?? 0.028) - t, t - 0.014, rad - (s.rw + 0.025)); },   // radial cap: a bare slab would cut through the chest cloth
        {...cuffMotif, rib: cf.rib, thick: cf.thick ?? 0.005, coverTol: 0.011, bounds: [cEnd[0] - 0.115, cEnd[1] - 0.115, cEnd[2] - 0.115, cEnd[0] + 0.115, cEnd[1] + 0.115, cEnd[2] + 0.115], tris: cf.tris || [80, 30], cell: cf.cell ?? 0.0042, ao: 0.005});
      parts['cuff' + i] = cuff; const c0 = parts['sleeve' + i].cull; parts['sleeve' + i].cull = (x, y, z) => c0(x, y, z) || cuff.covers(x, y, z);
    }
    ends[i] = {at: a.W, end: a.end, dir: a.F, r: s.rw};
  });
  // Stole / mantle: a separate cloth shell over the robe and the sleeve caps: a yoke over the shoulders (front dips into a V, back and
  // sides lower over the arms) and two lappets hanging down the chest, with an embroidered border (stole.motif) along every free edge.
  // {type:'stole', gap, thick, yoke (hem height at the front/back), zc/w (lappet centre and width), y0 (lappet bottom), lower (field of the skirt in U coords),
  //  border (width of the embroidered edge), wear, tris, cell}. Returns parts.stole, stoleSolid (for a beard to rest on) and stoleOuter (outer surface field, to pin a brooch on).
  let stoleSolid = null, stoleOuter = null;
  const stg = list.find(g => g.type === 'stole');
  if (stg) {
    const gap = stg.gap ?? 0.007, th = stg.thick ?? 0.005, zc = stg.zc ?? 0.07, pw = stg.w ?? 0.045, y0 = stg.y0 ?? 0.075, yc0 = stg.yoke ?? B.Y.chest - 0.02, bw = stg.border ?? 0.018, lower = stg.lower;
    const under = (x, y, z) => { let d = base(x, y, z); d = Math.min(d, sleeveMin(x, y, z)); if (lower) d = Math.min(d, Math.max(lower(x, y, z), y - 0.05)); return d; };
    const ycut = (x, z) => { const az = Math.abs(z); return yc0 + 0.045 * smoothstep(0.06, 0.15, az) - 0.022 * smoothstep(0.0, -0.08, x) + 0.075 * smoothstep(0.05, 0.015, az) * smoothstep(0.0, 0.05, x) + 0.004 * Math.sin(az * 90 + x * 40); };
    const rY = (x, y, z) => Math.max(ycut(x, z) - y, Math.abs(z) - 0.165);
    const rP = (x, y, z) => Math.max(Math.abs(Math.abs(z) - zc) - pw / 2, 0.012 - x, y - (yc0 + 0.06), y0 + 0.004 * Math.sin(Math.abs(z) * 160) - y, 0.8 * (base(x, y, z) - sleeveMin(x, y, z)));   // the lappets lie on the chest: not on a forearm that crosses in front of it
    const region = (x, y, z) => Math.min(rY(x, y, z), rP(x, y, z));
    const outer = (x, y, z) => under(x, y, z) - gap - th;
    const shell = (x, y, z) => {
      let d = Math.abs(under(x, y, z) - gap - th / 2) - th / 2;
      if (d < 0.02) d -= 0.0016 * (0.5 + 0.5 * Math.sin(Math.abs(z) * 120 + 5 * fbm(x * 14, y * 9, z * 14, 2))) * smoothstep(yc0 + 0.02, y0, y);   // hanging folds in the lappets
      return d;
    };
    const sdf = (x, y, z) => {
      const rg = region(x, y, z);
      let d = smax(shell(x, y, z), rg, 0.003);
      return smax(d, -(bowl(x, y, z) - 0.016), 0.004);        // neck opening, a little wider than the scoop so the collar roll shows
    };
    const cw = bw;   // one motif cell as wide as the border
    const uv = (x, y, z, o) => {
      const e = 0.0025, r0 = region(x, y, z), gy = region(x, y + e, z) - region(x, y - e, z), gz = region(x, y, z + e) - region(x, y, z - e), gl = Math.hypot(gy, gz) || 1;
      o[0] = (-gz / gl * y + gy / gl * z) / cw; o[1] = -r0 / bw;
    };
    stoleSolid = (x, y, z) => smax(outer(x, y, z), region(x, y, z), 0.003);
    stoleOuter = outer;
    parts.stole = {sdf, bounds: [-0.14, y0 - 0.02, -0.22, 0.19, B.Y.neck + 0.03, 0.22], cell: stg.cell || 0.0035, tris: stg.tris || [900, 400, 150], project: 0.003, ao: 0.014,
      aoSdf: (x, y, z) => Math.min(sdf(x, y, z), under(x, y, z) + 0.001), paint: (x, y, z, o) => { o[0] = stg.wear ? stg.wear(x, y, z) : 0; },
      cull: (x, y, z) => outer(x, y, z) < -0.6 * th,   // only the outer face: the inner one is hidden against the robe
      ...(stg.motif ? bandCoords(stg.motif, 1, uv, false) : {})};
    trims.stole = parts.stole;
  }
  const tc = parts.torso.cull; parts.torso.cull = (x, y, z) => tc(x, y, z) || (trims.sash && trims.sash.covers(x, y, z));
  const torsoSolid = (x, y, z) => B.torsoCloth(x, Math.max(y, hang), z) - ease;   // the cloth without the neckline scoop (what a beard rests on)
  return {parts, ends, torsoBase: base, torsoSolid, stoleSolid, stoleOuter, sleeveBase: sl.map(s => s.sb)};
}

/* =====================================================================================
   PINNED-ON PROPS  (rigid parts on the waist/chest frame: brooch, pouch, key ring)
   They are placed on a body surface by a frame at point P: lz along the outward normal n, ly = `up` projected onto the surface (so
   hanging things follow the skirt's slope), lx along the surface. P and n come from surfacePoint().
   ===================================================================================== */
// March along dir from o (t0..t1) until sdf < 0, then bisect: the point where the field crosses zero, and its normal. null if nothing is hit.
export function surfacePoint(sdf, o, dir, t0 = 0, t1 = 0.4) {
  const at = t => sdf(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t);
  let a = t0, b = -1;
  for (let i = 0; i <= 160; i++) { const t = t0 + (t1 - t0) * i / 160; if (at(t) < 0) { b = t; break; } a = t; }
  if (b < 0) return null;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (at(m) < 0) b = m; else a = m; }
  const P = [o[0] + dir[0] * b, o[1] + dir[1] * b, o[2] + dir[2] * b], e = 0.0015;
  return {P, n: surfaceNormal(sdf, P, e)};
}
export const surfaceNormal = (sdf, P, e = 0.0015) => norm3([sdf(P[0] + e, P[1], P[2]) - sdf(P[0] - e, P[1], P[2]), sdf(P[0], P[1] + e, P[2]) - sdf(P[0], P[1] - e, P[2]), sdf(P[0], P[1], P[2] + e) - sdf(P[0], P[1], P[2] - e)]);
// local frame at P: returns to(x,y,z) -> shared [lx, ly, lz]
function localFrame(P, n, up) {
  const nn = norm3(n), d = up[0] * nn[0] + up[1] * nn[1] + up[2] * nn[2], uy = norm3([up[0] - d * nn[0], up[1] - d * nn[1], up[2] - d * nn[2]]);
  const t = [uy[1] * nn[2] - uy[2] * nn[1], uy[2] * nn[0] - uy[0] * nn[2], uy[0] * nn[1] - uy[1] * nn[0]], o = [0, 0, 0];
  return (x, y, z) => { const a = x - P[0], b = y - P[1], c = z - P[2]; o[0] = a * t[0] + b * t[1] + c * t[2]; o[1] = a * uy[0] + b * uy[1] + c * uy[2]; o[2] = a * nn[0] + b * nn[1] + c * nn[2]; return o; };
}
const sdTorusY = (x, y, z, R, r) => Math.hypot(Math.hypot(x, z) - R, y) - r;   // ring round the Y axis
const cube = (P, h) => [P[0] - h, P[1] - h, P[2] - h, P[0] + h, P[1] + h, P[2] + h];

// Round metal clasp / brooch pinned on the cloth at P with outward normal n. p: {r, cell, tris}. Polished metal (motif 4); the boss is paint 1 (col2: a garnet).
export function brooch(P, n, up, p = {}) {
  const R = p.r ?? 0.0115, L = localFrame(P, n, up);
  const sdf = (x, y, z) => {
    const q = L(x, y, z), lx = q[0], ly = q[1], lz = q[2], r = Math.hypot(lx, ly);
    let d = Math.max(r - R, Math.abs(lz - 0.0018) - 0.0027);                                             // the disc, a little off the cloth
    d = smin(d, Math.max(Math.abs(r - (R - 0.0011)) - 0.0012, Math.abs(lz - 0.0038) - 0.0032), 0.0007); // raised rim
    d = d + 0.0003 * (r < R - 0.003 ? Math.sin(r * 700) : 0);                                          // turned groove
    d = smin(d, sdSphere(lx, ly, lz - 0.0046, 0.0046), 0.0012);                                          // boss
    const a = Math.atan2(ly, lx);
    for (let k = 0; k < 6; k++) { const c = k * Math.PI / 3 + 0.3; d = smin(d, sdSphere(lx - 0.0066 * Math.cos(c), ly - 0.0066 * Math.sin(c), lz - 0.0042, 0.0013), 0.0004); }
    return d;
  };
  const boss = (x, y, z) => { const q = L(x, y, z); return Math.hypot(q[0], q[1], q[2] - 0.0046); };
  return {sdf, bounds: cube(P, R + 0.01), cell: p.cell || 0.0009, tris: p.tris || [260, 130, 50], project: 0.0008, ao: 0.006,
    paint: (x, y, z, o) => { o[0] = boss(x, y, z) < 0.0038 ? 1 : 0; }, ...constBand(4)};
}

// A small leather pouch hanging from the belt: gathered neck with a drawstring, a flap over the upper half, flat back lying on the body
// (surf: field of the body in the same coordinates). P = where it is tied on (below the belt), n = outward normal, up = world up in these coordinates.
export function pouch(P, n, up, surf, p = {}) {
  const L = localFrame(P, n, up), k = p.size ?? 1;
  const sdf = (x, y, z) => {
    const q = L(x, y, z), lx = q[0] / k, ly = q[1] / k, lz = q[2] / k;
    let d = sdEllipsoid(lx, ly + 0.027, lz - 0.0115, 0.0215, 0.0275, 0.0125);                              // the sack
    d = smin(d, sdEllipsoid(lx, ly - 0.002, lz - 0.0075, 0.0105, 0.009, 0.0072), 0.008);                    // gathered neck
    const hem = -0.036 + 0.0065 * (lx / 0.022) ** 2;                                                         // flap: a slightly bigger shell over the upper part, scalloped hem
    d = smin(d, smax(sdEllipsoid(lx, ly + 0.027, lz - 0.0118, 0.0224, 0.0285, 0.0133), hem - ly, 0.0012), 0.0008);
    if (ly > -0.012) d += 0.0009 * Math.sin(Math.atan2(lz - 0.0072, lx) * 9) * smoothstep(-0.012, 0.0, ly);   // gathers
    d = smin(d, sdTorusY(lx, ly + 0.002 - 0.0, lz - 0.0072, 0.0098, 0.0012), 0.0008);                      // drawstring round the neck
    d = smin(d, sdCapsule(lx, ly, lz, 0.004, -0.003, 0.0165, 0.0062, -0.015, 0.0178, 0.0012), 0.0008);       // tie ends
    d = smin(d, sdCapsule(lx, ly, lz, -0.003, -0.003, 0.0165, -0.0052, -0.013, 0.0176, 0.0012), 0.0008);
    d = smax(d * k, -(surf(x, y, z) - 0.0012), 0.0025);                                                    // flat back on the body
    return d;
  };
  const paint = (x, y, z, o) => { const q = L(x, y, z); o[0] = Math.min(1, 0.55 * smoothstep(-0.016, -0.055, q[1] / k) + 0.25 * fbm(x * 90, y * 90, z * 90, 2) + 0.3); o[1] = 0; };
  return {sdf, bounds: cube([P[0] + up[0] * -0.02 * k, P[1] + up[1] * -0.02 * k, P[2] + up[2] * -0.02 * k], 0.06 * k), cell: p.cell || 0.0016, tris: p.tris || [320, 160, 60], project: 0.0012, ao: 0.008, paint, ...constBand(5)};
}

// A ring of old keys hanging from a hook at P (ring plane parallel to the body). p: {keys: 3, ring radius}
export function keyRing(P, n, up, surf, p = {}) {
  const L0 = localFrame(P, n, up), k = p.size ?? 1, o3 = [0, 0, 0], L = (x, y, z) => { const q = L0(x, y, z); o3[0] = q[0] / k; o3[1] = q[1] / k; o3[2] = q[2] / k; return o3; };   // k scales the whole ring about the hook
  const RR = p.ringR ?? 0.0075, wr = 0.0016, yc = -0.0095, zc = 0.0085;
  const KEYS = [{a: -0.38, len: 0.036, dz: -0.0024, sg: 1}, {a: 0.06, len: 0.031, dz: 0.0, sg: -1}, {a: 0.44, len: 0.039, dz: 0.0024, sg: 1}];
  const key = (lx, ly, lz, K) => {
    const c = Math.cos(K.a), s = Math.sin(K.a), px = lx, py = ly - (yc - RR);               // pivot at the bottom of the ring
    const w = px * c - py * s, u = -(px * s + py * c), z = lz - zc - K.dz;                  // u runs down the key, w across
    let d = sdTorusY(w, z, u - 0.0036, 0.0036, 0.0013);                                         // bow (ring head), hooked over the ring (axis along z)
    d = smin(d, sdCapsule(w, u, z, 0, 0.0070, 0, 0, K.len, 0, 0.0015), 0.0008);                 // shaft
    d = smin(d, sdSphere(w, u - 0.0098, z, 0.0021), 0.0006);                                    // collar
    const bw = K.sg * 0.0036;                                                                   // bit with a notch
    let bit = sdBox(w - bw, u - (K.len - 0.0042), z, 0.0034, 0.0042, 0.0011, 0.0004);
    bit = Math.max(bit, -sdBox(w - bw * 1.35, u - (K.len - 0.006), z, 0.0013, 0.0017, 0.003));
    return smin(d, bit, 0.0006);
  };
  const sdf = (x, y, z) => {
    const q = L(x, y, z), lx = q[0], ly = q[1], lz = q[2];
    let d = sdTorusY(lx, lz - zc, ly - yc, RR, wr);                                              // the ring: axis along lz
    d = smin(d, sdCapsule(lx, ly, lz, 0, 0.004, zc, 0, yc + RR, zc, 0.0015), 0.0008);             // staple at the belt
    for (const K of KEYS) d = smin(d, key(lx, ly, lz, K), 0.0005);
    return smax(d * k, -(surf(x, y, z) - 0.0006), 0.002);
  };
  return {sdf, bounds: cube([P[0] - up[0] * 0.03 * k, P[1] - up[1] * 0.03 * k, P[2] - up[2] * 0.03 * k], 0.06 * k), cell: p.cell || 0.00085 * Math.max(1, k * 0.8), tris: p.tris || [420, 200, 80], project: 0.0006, ao: 0.005,
    paint: (x, y, z, o) => { o[0] = 0.5 * smoothstep(0.0, -0.03, L(x, y, z)[1]); o[1] = 0; }, ...constBand(4)};
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
  // closing: rotate the lid edge from `open` down to just past the lower lid
  const shut = open + arch - low + 4 * D2R;
  const mk = hi => {   // hi: finer grids for the near LOD
  const ball = orient(gridMesh(hi ? 12 : 9, hi ? 7 : 5, (u, v) => sph(r, (v - 0.5) * 0.85 * Math.PI, (u - 0.5) * 1.5 * Math.PI), (u, v, o) => { o[2] = 1 - 0.55 * Math.abs(u - 0.5) * 2; }));
  // iris: a slightly domed disc (the cornea) over the front of the ball; paint 1 at the pupil, a dark limbal ring
  const ia = Math.asin(ir);
  const iris = orient(gridMesh(hi ? 12 : 10, 3, (u, v) => { const t = v * ia, a = u * 2 * Math.PI, rr = r * (1.012 + 0.03 * Math.cos(t / ia * Math.PI / 2)); return [rr * Math.cos(t), rr * Math.sin(t) * Math.sin(a), rr * Math.sin(t) * Math.cos(a)]; },
    (u, v, o) => { o[0] = v < 0.4 ? 1 : 0; o[1] = v > 0.9 ? 1 : 0; }));
  // upper lid: a shell slightly bigger than the ball over the top, with a rolled edge; edge elevation arches over the iris
  const lidPos = (rad, u, e0) => { const a = (u - 0.5) * 2 * 100 * D2R, e = e0 + arch * (1 - ((u - 0.5) * 2) ** 2); return {a, e}; };
  const lid = orient(gridMesh(hi ? 14 : 9, 6, (u, v) => {
    const {a, e} = lidPos(0, u, open);
    // v: 0 = back over the top, 4/6 = the edge outer side, 1 = the inner lip touching the ball
    const rows = [[85 * D2R, r + lt], [55 * D2R, r + lt], [35 * D2R, r + lt * 1.05], [12 * D2R, r + lt], [0, r + lt * 0.75], [-2.5 * D2R, r + lt * 0.15], [-1 * D2R, r * 0.985]];
    const k = Math.round(v * 6), [de, rad] = rows[k], ee = k === 0 ? de : e + de;
    return sph(rad, Math.min(ee, 88 * D2R), a * (k === 0 ? 0.9 : 1) * sp / 0.86);
  }, (u, v, o) => { o[0] = v > 0.6 ? 0.75 : 0.15; o[2] = v > 0.75 ? 0.45 : 1; }));
  const lower = orient(gridMesh(hi ? 14 : 9, 4, (u, v) => {
    const a = (u - 0.5) * 2 * 100 * D2R, e = low - arch * 0.4 * (1 - ((u - 0.5) * 2) ** 2);
    const rows = [[-80 * D2R, r + lt], [-30 * D2R, r + lt], [0, r + lt * 0.8], [1.5 * D2R, r + lt * 0.2], [0.5 * D2R, r * 0.985]];
    const [de, rad] = rows[Math.round(v * 4)];
    return sph(rad, Math.max(-88 * D2R, v === 0 ? de : e + de), a);
  }, (u, v, o) => { o[0] = v > 0.5 ? 0.6 : 0.2; o[2] = v > 0.7 ? 0.6 : 1; }));
  // sanitize: the iris cap has zero-area triangles at its pole
  return {ball: sanitize(ball), iris: sanitize(iris), lid: sanitize(lid), lower: sanitize(lower)};
  };
  const hi = mk(true);
  return {...hi, lo: mk(false), r, lidAngle: blink => -(1 - blink) * shut};
}

/* =====================================================================================
   BAKING AND CACHING
   ===================================================================================== */
// Bake one part spec -> [nearMesh, farMesh] (stride 8 Float32Arrays).
// Mesh hygiene (stride 9): drop non-finite and degenerate triangles, renormalise normals, replace unusable normals with the
// face normal. A zero or NaN normal on real GPUs becomes NaN in the shader, and NaN in an HDR target blooms into white squares.
export function sanitize(M, minArea = 1e-10) {
  const out = new Float32Array(M.length), bo = M.band ? new Float32Array(M.length / 9 * 3) : null; let o = 0, dropped = 0;
  for (let i = 0; i < M.length; i += 27) {
    let ok = true;
    for (let k = 0; k < 27 && ok; k++) ok = Number.isFinite(M[i + k]);
    const ux = M[i + 9] - M[i], uy = M[i + 10] - M[i + 1], uz = M[i + 11] - M[i + 2], wx = M[i + 18] - M[i], wy = M[i + 19] - M[i + 1], wz = M[i + 20] - M[i + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx, fl = Math.hypot(fx, fy, fz);
    if (!ok || fl < 2 * minArea) { dropped++; continue; }
    for (let v = 0; v < 3; v++) {
      const b = i + v * 9, l = Math.hypot(M[b + 3], M[b + 4], M[b + 5]);
      if (bo) for (let k = 0; k < 3; k++) bo[o / 9 * 3 + k] = M.band[b / 9 * 3 + k];
      for (let k = 0; k < 9; k++) out[o + k] = M[b + k];
      if (l > 1e-4) { out[o + 3] /= l; out[o + 4] /= l; out[o + 5] /= l; } else { out[o + 3] = fx / fl; out[o + 4] = fy / fl; out[o + 5] = fz / fl; }
      o += 9;
    }
  }
  const r = out.slice(0, o); r.stride = 9; r.dropped = dropped; if (bo) r.band = bo.slice(0, o / 9 * 3); return r;
}

// Generator: yields during the heavy loops so bakeRecipeIdle can spread the work over many ticks. tris: [near, mid, far] (any length):
// each LOD is simplified from the previous one, so the cheaper LODs are decimated versions of the finest.
export function* bakePartGen(spec, seed = 1) {
  setSeed(seed);
  const guard = function* (g) { let r; while (!(r = g.next()).done) { yield; setSeed(seed); } return r.value; }; // noise seed is global: restore it after every pause
  const raw = yield* guard(sculptGen(spec.sdf, spec.bounds, spec.cell, {cull: spec.cull}));
  const fo = {paint: spec.paint || (() => {}), project: spec.project ?? spec.cell * 0.5, normalSdf: spec.normalSdf, aoSdf: spec.aoSdf, band: spec.band, bandWrap: spec.bandWrap, eps: 0.0006, ao: spec.ao ?? 0.012, aoFloor: spec.aoFloor};
  const out = []; let m = raw;
  for (const t of spec.tris) { m = yield* guard(simplifyGen(m, t)); out.push(sanitize(yield* guard(flattenGen(m, spec.sdf, fo)))); }
  out.raw = raw.T.length / 3;
  // spec.lods: [{sdf?, cell?, tris:[n]}, ...] LODs that are meshed from their own (coarser, thicker) field instead of simplifying the previous one.
  // Thin tubes (hair locks) cannot be simplified below a floor (every collapse breaks the link condition), so hair gets fatter fields for mid/far.
  if (spec.lods) for (const ls of spec.lods) {
    const sub = {...spec, ...ls, lods: null}, rawL = yield* guard(sculptGen(sub.sdf, sub.bounds, sub.cell, {cull: sub.cull}));
    let mL = rawL; for (const t of sub.tris) { mL = yield* guard(simplifyGen(mL, t)); out.push(sanitize(yield* guard(flattenGen(mL, sub.sdf, {...fo, normalSdf: sub.normalSdf, aoSdf: sub.aoSdf})))); }
  }
  return out;
}
export function bakePart(spec, seed = 1) {
  const t0 = performance.now(), g = bakePartGen(spec, seed); let r;
  while (!(r = g.next()).done);
  r.value.ms = performance.now() - t0; return r.value;
}

// Bake a whole recipe (see src/npc_recipes.js). recipe.build() returns {parts:{name: spec}, eyes, anchors}.
// Cached by recipe.id; the result lists per-part meshes for every LOD and the stats.
// bakeRecipe() finishes synchronously; bakeRecipeIdle() bakes in slices of a few ms per tick (call it at load so no frame
// stalls for long), and a later bakeRecipe() simply finishes whatever is left.
const CACHE = new Map();
function start(recipe) {
  let st = CACHE.get(recipe.id);
  if (!st) {
    const built = recipe.build();
    st = {res: {recipe, nLod: 1, parts: {}, eyes: built.eyes ? eyeRig(built.eyes) : null, anchors: built.anchors || {}, stats: {parts: {}, tris: [], ms: 0}},
      names: Object.keys(built.parts), todo: Object.keys(built.parts), built, seed: recipe.seed ?? 1, done: false, cur: null};
    CACHE.set(recipe.id, st);
  }
  return st;
}
// run the bake for about `budget` ms (Infinity = to the end)
function advance(st, budget) {
  const end = performance.now() + budget;
  while (!st.done) {
    if (!st.cur) { const name = st.todo.shift(); st.cur = {name, gen: bakePartGen(st.built.parts[name], st.seed + st.names.indexOf(name)), ms: 0}; }
    const t0 = performance.now(), r = st.cur.gen.next(); st.cur.ms += performance.now() - t0;
    if (r.done) finishPart(st, st.cur.name, r.value, st.cur.ms), st.cur = null;
    if (performance.now() >= end) break;
  }
}
function finishPart(st, name, m, ms) {
  const {res} = st; m.ms = ms;
  res.parts[name] = m; res.stats.ms += ms; res.nLod = Math.max(res.nLod, m.length);
  res.stats.parts[name] = {raw: m.raw, lods: m.map(x => x.length / 27), near: m[0].length / 27, far: m[m.length - 1].length / 27, ms: Math.round(ms)};
  if (st.todo.length) return;
  st.done = true; st.built = null; res.stats.ms = Math.round(res.stats.ms);
  const E = res.eyes;
  for (let lod = 0; lod < res.nLod; lod++) {
    res.stats.tris[lod] = 0;
    for (const q of res.recipe.parts) if (res.parts[q.part]) res.stats.tris[lod] += res.parts[q.part][Math.min(lod, res.parts[q.part].length - 1)].length / 27;
    if (E) res.stats.tris[lod] += 2 * (E.ball.length + E.iris.length + E.lid.length + E.lower.length) / 27;
  }
}
export function bakeRecipe(recipe) {
  const st = start(recipe);
  advance(st, Infinity);
  return st.res;
}
export function bakeRecipeIdle(recipe, done) {
  const st = start(recipe);
  const tick = () => { if (st.done) { if (done) done(st.res); return; } advance(st, 6); setTimeout(tick, 10); };
  setTimeout(tick, 0);
}
