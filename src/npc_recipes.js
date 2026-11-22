// npc_recipes.js - characters as recipes for the NPC kit (src/npc_kit.js). See docs/npc-kit.md.
//
// A recipe is plain data plus one build() function:
//   id        cache key (change it when the shape changes, so nothing stale is reused)
//   seed      noise seed for the folds, strands and pores
//   palette   named colours [r,g,b] (linear-ish 0..1, like the rest of game.js)
//   parts     what to draw: {part (key in build().parts), frame, mat, col, col2, at?, R?}
//               frame: B (feet, turns with the body), U (upper body: waist, lean, breathing), H (head: tracks the
//                      player, nods), J (jaw: H moved down while talking), or a custom frame the pose code makes
//               mat:   skin | cloth | hair | trim | eye | wood | metal | glow   (shader material, see MAT in game.js)
//               col/col2: palette names; the part's paint channel blends col -> col2 per vertex
//   eyes      {frame, sclera, iris, pupil, lid, lid2} palette names for the eye rig
//   rig       numbers the pose code needs (waist height, lean, neck offset, jaw travel)
//   build()   returns {parts: {name: partSpec}, eyes: eyeRig params, anchors: {...}} using the kit builders.
//             Runs once (cached), at load, in plain JS: no THREE, no DOM, so `node tools/npc_stats.mjs` can bake it.
import * as K from './npc_kit.js';
import {clothDress, clothParts} from './npc_cloth.js';
import {anthro} from './anthro.js';
import {smin, smax, sdEllipsoid} from './sculpt.js';

/* ---------- The Keeper: old robed shopkeeper, white beard, lantern staff ---------- */
// Arm joint centres in U coords (waist origin): shoulder, elbow, wrist, and radii of the bare arm [deltoid, elbow, wrist].
const UP = [Math.sin(-0.15), Math.cos(-0.15), 0];   // world up in U coordinates (the upper body leans by rig.lean)
const ARMS = [
  {S: [0.004, 0.314, 0.104], E: [0.07, 0.115, 0.17], W: [0.225, 0.15, 0.18], r: [0.034, 0.026, 0.018], back: 0.034},   // staff arm (+Z)
  {S: [0.004, 0.314, -0.104], E: [0.0, 0.12, -0.165], W: [0.105, 0.04, -0.075], r: [0.034, 0.026, 0.018], back: 0.024} // hand resting on the sash
];
// worn fabric: slow colour variation everywhere, dirt towards the floor on the skirt
const WEAR_TOP = K.wearPaint({vary: 0.28, freq: 8, seed: 11}), WEAR_STOLE = K.wearPaint({vary: 0.35, freq: 9, seed: 5}), WEAR_SKIRT = K.wearPaint({vary: 0.28, freq: 6, dirt: 0.85, dirtY: 0.16, seed: 3});
const RAG = {amp: 0.005, notches: 6, depth: 0.016, width: 0.07, seed: 2};   // frayed hem: noise on the edge height plus a few V-shaped notches
export const KEEPER = {
  id: 'keeper-v15', seed: 4242,
  // Human proportions (see docs/npc-kit.md): the head is built at its natural size and drawn at headScale; the torso is
  // stretched (len) and the skirt (legs) raised so the figure is ~7.25 heads tall with shoulders about 2.7 head widths wide.
  proportions: {headScale: 0.6, frames: ['H', 'J'], height: 0.93},   // height: uniform scale of the whole figure and its props (crown 1.03 m * 0.93 = 0.96 m)
  palette: {
    skin: [0.8, 0.6, 0.47], skinDeep: [0.66, 0.34, 0.28],
    robe: [0.33, 0.06, 0.055], robeDeep: [0.2, 0.035, 0.04],
    gold: [0.8, 0.58, 0.18], goldDeep: [0.55, 0.36, 0.1],
    white: [0.74, 0.73, 0.69], whiteDeep: [0.36, 0.35, 0.34],
    robeDirt: [0.17, 0.075, 0.05], cord: [0.1, 0.06, 0.04], cordTip: [0.6, 0.42, 0.14], stole: [0.04, 0.05, 0.13], stoleDeep: [0.015, 0.02, 0.06],
    brass: [0.62, 0.47, 0.2], brassDeep: [0.36, 0.25, 0.1], garnet: [0.55, 0.04, 0.06], leather: [0.34, 0.19, 0.09], leatherDeep: [0.16, 0.085, 0.045],
    nail: [0.84, 0.66, 0.58], nailDeep: [0.74, 0.52, 0.46], sclera: [0.86, 0.82, 0.74], iris: [0.42, 0.26, 0.12], pupil: [0.02, 0.015, 0.012]
  },
  rig: {waist: [0, 0.52, 0], lean: -0.15, neck: [0.009, 0.414, 0], jaw: 0.003, drape: {follow: 0.3, push: 0.012}},
  parts: [
    {part: 'skirt', frame: 'B', mat: 'cloth', col: 'robe', col2: 'robeDirt'},
    {part: 'hem', frame: 'B', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'placket', frame: 'B', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'torso', frame: 'U', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'sleeve0', frame: 'arm0', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'sleeve1', frame: 'U', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'cord', frame: 'U', mat: 'cloth', col: 'cord', col2: 'cordTip'},
    {part: 'tassels', frame: 'B', mat: 'cloth', col: 'cord', col2: 'cordTip'},
    {part: 'cuff0', frame: 'arm0', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'cuff1', frame: 'U', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'stole', frame: 'U', mat: 'cloth', col: 'stole', col2: 'stoleDeep'},
    {part: 'brooch', frame: 'U', mat: 'trim', col: 'brass', col2: 'garnet'},
    {part: 'pouch', frame: 'U', mat: 'cloth', col: 'leather', col2: 'leatherDeep'},
    {part: 'keys', frame: 'U', mat: 'trim', col: 'brass', col2: 'brassDeep'},
    {part: 'neck', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep', drape: [-0.04, -0.17]},
    {part: 'head', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'ears', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'hair', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'hairShells', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep', cards: true},
    {part: 'brows', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'moustache', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'beard', frame: 'J', mat: 'hair', col: 'white', col2: 'whiteDeep', drape: [-0.015, -0.13]},
    {part: 'beardShells', frame: 'J', mat: 'hair', col: 'white', col2: 'whiteDeep', drape: [-0.015, -0.13], cards: true},
    {part: 'browCards', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep', cards: true},
    {part: 'mousCards', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep', cards: true},
    {part: 'beardCards', frame: 'J', mat: 'hair', col: 'white', col2: 'whiteDeep', drape: [-0.015, -0.13], cards: true},
    {part: 'gripHand', frame: 'grip', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'restHand', frame: 'rest', mat: 'skin', col: 'skin', col2: 'skinDeep'}
  ],
  // Body first, clothes over it (docs/npc-kit.md): the body is only an SDF; the garments are the meshes.
  body: {y: {neck: 0.414, shoulder: 0.33}, stoop: 0.065, belly: 0.5, narrow: 1.0, waistNarrow: 0.86, arms: ARMS},
  garments: [
    {type: 'robe', ease: 0.012, hang: 0.03, collar: {r: 0.037}, tris: [1000, 480, 120], cell: 0.0058, wear: WEAR_TOP},
    {type: 'sleeve', arm: 0, tris: [1000, 420, 100], cell: 0.0042, ease: 0.006, pouch: 0.05, drop: 0.05, up: UP, folds: 1.3, wear: WEAR_TOP, cuff: {len: 0.028, tris: [170, 80, 30], cell: 0.0034, motif: 1, rib: 0.0014}},
    {type: 'sleeve', arm: 1, tris: [900, 400, 100], cell: 0.0042, ease: 0.006, pouch: 0.043, drop: 0.04, up: UP, folds: 1.1, wear: WEAR_TOP, cuff: {len: 0.028, tris: [170, 80, 30], cell: 0.0034, motif: 1, rib: 0.0014}},
    {type: 'sash', y: 0.017, h: 0.018, thick: 0.007, tris: [200, 90, 40], cell: 0.0042, motif: 2, rib: 0.0014},
    {type: 'stole', gap: 0.011, thick: 0.001, y0: 0.075, border: 0.018, motif: 3, wear: WEAR_STOLE, tris: [700, 330, 80], cell: 0.0046}
  ],
  eyes: {frame: 'H', sclera: 'sclera', iris: 'iris', pupil: 'pupil', lid: 'skin', lid2: 'skinDeep'},
  build() {
    const U = {off: this.rig.waist, R: K.rotZ(this.rig.lean)};
    const H = K.head({age: 0.9, brow: 1.25, jaw: 1.0, ears: 1.05, neck: 1.5, nose: {len: 1.1, width: 1.05, droop: 0.9, bulb: 1.15}, tris: [1650, 700, 190], cell: 0.0038});
    const skirt = K.robeSkirt({height: 0.57, waist: 0.097, aspect: 1.12, cell: 0.0058, tris: [1100, 450, 120], rag: RAG});
    skirt.paint = (x, y, z, o) => { o[0] = WEAR_SKIRT(x, y, z); };
    const lowerInU = K.inParent(skirt.base, U.off, U.R);
    const B = K.body(this.body), D = K.dress(B, this.garments.map(g => g.type === 'stole' ? {...g, lower: lowerInU} : g)), torso = D.parts.torso;
    const skirtBody = (x, y, z) => skirt.sdf(x, y, z) / 0.8;
    const lift = skirt.lift, HEMH = 0.042;
    const hem = K.trimBand(skirtBody, (x, y, z) => Math.max(y - HEMH, lift(x, z) + 0.0025 - y), {thick: 0.007, rib: 0.0016, coverTol: 0.011, bounds: [-0.25, -0.01, -0.25, 0.25, 0.06, 0.25], cell: 0.0035, tris: [300, 120, 50], cull: (x, y, z) => y < 0.0035 + 0.45 * lift(x, z),
      motif: 1, cells: Math.round(2 * Math.PI * 0.17 / HEMH), uv: (x, y, z, o) => { o[0] = Math.atan2(z, x) / (2 * Math.PI) + 0.5; o[1] = (y - lift(x, z)) / (HEMH - lift(x, z)); }});
    // hide what the other parts cover: the skirt top inside the torso, the torso bottom inside the skirt
    const torsoInB = K.inChild(D.torsoBase, U.off, U.R), skirtInU = K.inParent(skirt.sdf, U.off, U.R);
    const skirtCull = skirt.cull, torsoCull = torso.cull;
    skirt.cull = (x, y, z) => skirtCull(x, y, z) || hem.covers(x, y, z) || (y > 0.48 && torsoInB(x, y, z) < -0.004);
    torso.cull = (x, y, z) => torsoCull(x, y, z) || (y < 0.0 && skirtInU(x, y, z) < -0.004);
    // the beard hangs from the jaw frame (head units, scale 0.6) and blends into the drape frame D (neck pivot, follows the head 30%):
    // express the robe in beard coordinates so the beard can rest on the cloth
    const hs = this.proportions.headScale, dk = this.rig.drape.follow * (this.rig.headTilt ?? 0.12), cD = Math.cos(dk), sD = Math.sin(dk);
    const nxy = [this.rig.neck[0] + this.rig.drape.push, this.rig.neck[1], this.rig.neck[2]];
    const torsoSolidAll = (x, y, z) => Math.min(D.torsoSolid(x, y, z), D.stoleSolid(x, y, z));
    const robeInBeard = (x, y, z) => torsoSolidAll(nxy[0] + hs * (cD * x - sD * y), nxy[1] + hs * (sD * x + cD * y), nxy[2] + hs * z) / hs;
    const grip = K.hand({pose: 'grip', side: -1, gripR: this.gripR ?? 0.0092, age: 1.2, tris: [1300, 600, 100], cell: 0.002});
    const rest = K.hand({pose: 'rest', side: 1, age: 1.2, curl: 1.15, tris: [1300, 600, 100], cell: 0.002});
    const sleeveCull = sp => { const c = sp.cull; sp.cull = (x, y, z) => (c && c(x, y, z)) || x < -0.032; return sp; };
    // pinned-on props (frame U): brooch on the stole's lappet, pouch and key ring on the belt. up = world up in U coordinates (U leans by rig.lean).
    const upU = [Math.sin(this.rig.lean), Math.cos(this.rig.lean), 0];
    const bodySurf = (x, y, z) => Math.min(D.torsoSolid(x, y, z), Math.max(skirtInU(x, y, z), y - 0.05));
    const onBody = (surf, theta, y, yMid) => { // surface point at azimuth theta (from +x towards +z) and height y; normal taken at yMid so hanging things follow the skirt's slope
      const c = Math.cos(theta), s = Math.sin(theta), hit = yy => K.surfacePoint(surf, [0.3 * c, yy, 0.3 * s], [-c, 0, -s], 0, 0.3), a = hit(y), m = hit(yMid ?? y);
      return {P: a.P, n: m.n};
    };
    const bro = (() => { const hit = K.surfacePoint(D.stoleOuter, [0.3, 0.2, -0.07], [-1, 0, 0], 0, 0.3); return K.brooch(hit.P, hit.n, upU, {cell: 0.0013}); })();
    const pk = onBody(bodySurf, 1.31, -0.012, -0.04), kk = onBody(bodySurf, 0.42, -0.012, -0.04);
    const pouch = K.pouch(pk.P, pk.n, upU, bodySurf, {size: 1.25, cell: 0.0025}), keys = K.keyRing(kk.P, kk.n, upU, bodySurf, {size: 1.5, tris: [280, 160, 40], cell: 0.002});
    const [e0, e1] = D.ends;
    const hcap = K.hairCap(H, {crown: 0.128, tris: [450, 260, 60], cell: 0.0065});
    const brw = K.brows(H, {size: 1.15, droop: 1.1}), mou = K.moustache(H, {size: 1.2, droop: 1.35}), brd = K.beard(H, {length: 0.34, width: 1.12, thick: 0.009, fork: 0, chest: robeInBeard, tipsOnly: true});
    // v11: robe and sleeves are cloth simulations (src/npc_cloth.js) laid out loose round the body SDF; the SDF garments above stay as fields (stole, beard, props rest on them)
    const cd = clothDress(B, {off: this.rig.waist, R: K.rotZ(this.rig.lean), skirtBase: skirt.base, ease: 0.012, hang: 0.03, nu: 72, rowsUp: 18, rowsLow: 32, folds: 12, gather: 0.1, bend: 0.25, rag: skirt.lift, seed: 3,
      sleeves: [{arm: 0, pouch: 0.044, nu: 24, rows: 26}, {arm: 1, pouch: 0.038, nu: 24, rows: 26}],
      stole: {nu: 44, rows: 22, gap: 0.031, edge: 0.3, yoke: 0.13, lappet: 0.3, width: 0.46}});
    const cloth = clothParts(cd, {wearTop: WEAR_TOP, wearSkirt: WEAR_SKIRT, rag: skirt.lift, hem: {cells: 25, rows: 6}, cuff: {cells: 8, rows: 3}, placket: {motif: 2}, stole: {motif: 3, border: 0.018}, wearStole: WEAR_STOLE, cord: {knot: -2}});
    const {torso: _t, sleeve0: _s0, sleeve1: _s1, cuff0: _c0, cuff1: _c1, sash: _sa, stole: _st, ...Drest} = D.parts;
    return {
      parts: {...cloth, ...Drest, brooch: bro, pouch, keys,
        head: H, ears: K.ears(H, {tris: [650, 400, 60], cell: 0.0015}), hair: hcap, hairShells: hcap.shells, brows: brw, moustache: mou, browCards: {cardsDirect: brw.cardsPart.cardsDirect}, mousCards: {cardsDirect: mou.cardsPart.cardsDirect}, beardCards: {cardsDirect: brd.cardsPart.cardsDirect},
        neck: K.neck(H, {tris: [320, 180, 50], cell: 0.0035, neck: 1.5}), beard: brd, beardShells: brd.shells, gripHand: sleeveCull(grip), restHand: sleeveCull(rest)},
      eyes: {r: H.eye.r, iris: 0.5, open: 12, low: -24, arch: 9, lidT: 0.0021},
      anchors: {
        eye: [H.eye.x, H.eye.y, H.eye.z],
        // staff hand: thumb up, palm facing the body, held axis vertical (hand Z -> down)
        gripAt: e0.at, gripR: K.mul3(K.rotX(Math.PI / 2), K.rotY(-grip.grip.alpha)), gripAxis: grip.grip.p,   // hand Z -> down, tilted so the (slightly diagonal) rod is vertical
        // resting hand: along the forearm, back of the hand facing forward
        restAt: e1.at, restR: K.basis(e1.dir, [0.9, 0.25, -0.35]),
        shoulder0: ARMS[0].S,
        gem: [0.1, 0.02, 0]
      }
    };
  }
};

/* ---------- Ilse the Mapmaker: standing, teal coat, auburn hair, rolled map ---------- */
const FEM = anthro('female', 'p50').ratios;
const ILSE_UP = [Math.sin(0.05), Math.cos(0.05), 0];
const ILSE_ARMS = [
  {S: [0.006, 0.30, 0.088], E: [0.055, 0.14, 0.12], W: [0.145, 0.22, 0.04], r: [0.026, 0.02, 0.014], back: 0.024},  // map arm, elbow low, wrist up
  {S: [0.006, 0.30, -0.088], E: [0.0, 0.16, -0.155], W: [0.045, 0.09, -0.1], r: [0.026, 0.02, 0.014], back: 0.02} // fist at the belt
];
const ILSE_LEGS = [
  {pts: [[0.008, 0.46, 0.055], [0.018, 0.25, 0.06], [0.01, 0.048, 0.062], [0.105, 0.02, 0.064]], r: [0.05, 0.038, 0.028, 0.022]},
  {pts: [[0.008, 0.46, -0.055], [0.006, 0.25, -0.06], [0.01, 0.048, -0.062], [0.105, 0.02, -0.064]], r: [0.05, 0.038, 0.028, 0.022]}
];
const WEAR_ILSE = K.wearPaint({vary: 0.18, freq: 7, dirt: 0.35, dirtY: 0.22, seed: 17});
export const ILSE = {
  id: 'ilse-v5', seed: 7701,
  proportions: {headScale: 0.56, frames: ['H', 'J'], height: 0.96},
  palette: {
    skin: [0.90, 0.68, 0.54], skinDeep: [0.70, 0.38, 0.32],
    coat: [0.07, 0.34, 0.36], coatDeep: [0.03, 0.16, 0.18],
    cream: [0.86, 0.78, 0.62], creamDeep: [0.55, 0.46, 0.32],
    cloth: [0.16, 0.13, 0.11], clothDeep: [0.08, 0.06, 0.05],
    boot: [0.28, 0.16, 0.08], bootDeep: [0.12, 0.07, 0.04],
    hair: [0.48, 0.16, 0.06], hairDeep: [0.20, 0.06, 0.03],
    brass: [0.72, 0.52, 0.18], brassDeep: [0.40, 0.26, 0.08],
    nail: [0.92, 0.72, 0.64], nailDeep: [0.78, 0.52, 0.48],
    sclera: [0.92, 0.9, 0.86], iris: [0.16, 0.42, 0.28], pupil: [0.02, 0.015, 0.012]
  },
  rig: {waist: [0, 0.48, 0], lean: 0.05, neck: [0.004, 0.37, 0], jaw: 0.003, headTilt: 0.03, drape: {follow: 0.2, push: 0.006}},
  parts: [
    {part: 'trousers', frame: 'B', mat: 'cloth', col: 'cloth', col2: 'clothDeep'},
    {part: 'boots', frame: 'B', mat: 'cloth', col: 'boot', col2: 'bootDeep'},
    {part: 'bootCuff', frame: 'B', mat: 'trim', col: 'cream', col2: 'creamDeep'},
    {part: 'torso', frame: 'U', mat: 'cloth', col: 'coat', col2: 'coatDeep'},
    {part: 'sleeve0', frame: 'U', mat: 'cloth', col: 'coat', col2: 'coatDeep'},
    {part: 'sleeve1', frame: 'U', mat: 'cloth', col: 'coat', col2: 'coatDeep'},
    {part: 'cuff0', frame: 'U', mat: 'trim', col: 'cream', col2: 'creamDeep'},
    {part: 'cuff1', frame: 'U', mat: 'trim', col: 'cream', col2: 'creamDeep'},
    {part: 'belt', frame: 'U', mat: 'trim', col: 'brass', col2: 'brassDeep'},
    {part: 'neck', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep', drape: [-0.04, -0.15]},
    {part: 'head', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'ears', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'hair', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep'},
    {part: 'hairShells', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep', cards: true},
    {part: 'tail', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep'},
    {part: 'tie', frame: 'H', mat: 'trim', col: 'cream', col2: 'creamDeep'},
    {part: 'brows', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep'},
    {part: 'browCards', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep', cards: true},
    {part: 'mapHand', frame: 'map', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'hipHand', frame: 'hip', mat: 'skin', col: 'skin', col2: 'skinDeep'}
  ],
  body: {ratios: FEM, y: {neck: 0.37, shoulder: 0.30}, stoop: 0.01, belly: 0.06, narrow: 0.88, waistNarrow: 0.72, arms: ILSE_ARMS},
  garments: [
    {type: 'robe', ease: 0.014, hang: -0.02, hemY: -0.2, folds: 0.35, collar: {rx: 0.042, ry: 0.048, rz: 0.04}, bounds: [-0.22, -0.24, -0.2, 0.2, 0.48, 0.2], tris: [900, 380, 110], cell: 0.0055, wear: WEAR_ILSE},
    {type: 'sleeve', arm: 0, tris: [420, 180, 55], cell: 0.0046, ease: 0.005, pouch: 0.012, drop: 0.012, up: ILSE_UP, folds: 0.4, wear: WEAR_ILSE, cuff: {len: 0.018, tris: [100, 44, 18], cell: 0.0032}},
    {type: 'sleeve', arm: 1, tris: [400, 170, 50], cell: 0.0046, ease: 0.005, pouch: 0.01, drop: 0.01, up: ILSE_UP, folds: 0.35, wear: WEAR_ILSE, cuff: {len: 0.018, tris: [100, 44, 18], cell: 0.0032}},
    {type: 'sash', y: 0.012, h: 0.011, thick: 0.005, tris: [150, 64, 24], cell: 0.0038, motif: 2, rib: 0.001}
  ],
  eyes: {frame: 'H', sclera: 'sclera', iris: 'iris', pupil: 'pupil', lid: 'skin', lid2: 'skinDeep'},
  build() {
    const H = K.head({age: 0.12, brow: 0.55, jaw: 0.84, chin: 0.88, ears: 0.9, neck: 0.95, nose: {len: 0.86, width: 0.8, droop: 0.08, bulb: 0.78}, cheek: {bone: 0.55, sag: 0.02}, tris: [1900, 780, 210], cell: 0.0031});
    const B = K.body(this.body), D = K.dress(B, this.garments);
    const legs = K.legwear({legs: ILSE_LEGS, ease: 0.004, bootEase: 0.007, bootRise: 0.16, seat: {c: [0.01, 0.44, 0], r: [0.05, 0.035, 0.07]}, tris: [640, 260, 80], cell: 0.0048, bootTris: [680, 260, 70], bootCell: 0.0032, wear: WEAR_ILSE});
    const hcap = K.hairCap(H, {full: true, hang: 0.05, thick: 0.016, tris: [860, 340, 90], cell: 0.0034});
    const brw = K.brows(H, {size: 0.8, droop: 0.1, lift: 0.005});
    const grip = K.hand({pose: 'grip', side: -1, gripR: 0.012, age: 0.1, size: 0.9, tris: [800, 340, 90], cell: 0.0019});
    const hip = K.hand({pose: 'rest', side: 1, age: 0.1, size: 0.9, curl: 2.1, tris: [800, 340, 90], cell: 0.0019});
    const hideWrist = sp => { sp.cull = (x, y, z) => x < -0.016; return sp; };
    const [e0, e1] = D.ends;
    const {sash, ...Drest} = D.parts;
    const tie = {sdf: (x, y, z) => sdEllipsoid(x + 0.055, y - 0.1, z, 0.01, 0.012, 0.016), bounds: [-0.08, 0.08, -0.025, -0.03, 0.125, 0.025], cell: 0.0026, tris: [80, 36, 14], paint: (x, y, z, o) => { o[0] = 0.2; }};
    return {
      parts: {trousers: legs.trousers, boots: legs.boots, bootCuff: legs.cuffs, ...Drest, belt: sash,
        head: H, ears: K.ears(H, {size: 0.92, tris: [480, 220, 60], cell: 0.0017}), hair: hcap, hairShells: hcap.shells,
        tail: K.hairTail(H, {pts: [[-0.05, 0.105, 0], [-0.072, 0.03, 0.01], [-0.088, -0.07, 0.016], [-0.092, -0.17, 0.01]], r0: 0.022, r1: 0.007, tris: [320, 140, 40], cell: 0.0038}),
        tie, brows: brw, browCards: {cardsDirect: brw.cardsPart.cardsDirect},
        neck: K.neck(H, {tris: [240, 110, 36], cell: 0.0036, neck: 0.95}),
        mapHand: hideWrist(grip), hipHand: hideWrist(hip)},
      eyes: {r: H.eye.r, iris: 0.52, open: 20, low: -14, arch: 6, lidT: 0.0016},
      anchors: {
        eye: [H.eye.x, H.eye.y, H.eye.z],
        mapAt: e0.at, mapR: K.mul3(K.rotX(Math.PI / 2), K.rotY(-grip.grip.alpha)), scroll: grip.grip,
        hipAt: e1.at, hipR: K.basis(e1.dir, [0.15, 0.95, 0.2])
      }
    };
  }
};

/* ---------- Brakk: seated, wounded, open helm, leather and a short beard ---------- */
const MALE = anthro('male', 'p50').ratios;
const BRAKK_LEAN = 0.07;
const BRAKK_UP = [Math.sin(BRAKK_LEAN), Math.cos(BRAKK_LEAN), 0];
const BRAKK_ARMS = [
  {S: [0.0, 0.28, 0.11], E: [0.1, 0.16, 0.16], W: [0.2, 0.14, 0.1], r: [0.038, 0.028, 0.02], back: 0.02},   // hand on the good thigh
  {S: [0.0, 0.28, -0.12], E: [0.02, 0.24, -0.2], W: [0.16, 0.3, -0.12], r: [0.038, 0.028, 0.02], back: 0.016}  // fist on the raised knee, elbow out
];
const BRAKK_LEGS = [
  {pts: [[0.02, 0.15, 0.07], [0.2, 0.17, 0.09], [0.34, 0.05, 0.1], [0.44, 0.028, 0.1]], r: [0.058, 0.046, 0.034, 0.028]},
  {pts: [[0.02, 0.15, -0.07], [0.14, 0.36, -0.1], [0.3, 0.09, -0.12], [0.4, 0.034, -0.12]], r: [0.06, 0.048, 0.034, 0.028]}
];
const WEAR_BRAKK = K.wearPaint({vary: 0.32, freq: 6, dirt: 0.7, dirtY: 0.22, seed: 29});
// A short solid wrap just under the knee. A thin shell shredded; a long one read as a pad.
function bandageWrap(A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len, uy = dy / len, uz = dz / len, R = 0.056, t0 = 0.7, t1 = 0.94;
  const midT = (t0 + t1) * 0.5, half = (t1 - t0) * 0.5;
  const sdf = (x, y, z) => {
    const vx = x - A[0], vy = y - A[1], vz = z - A[2], along = vx * ux + vy * uy + vz * uz;
    const t = along / len;
    const rad = Math.hypot(vx - ux * along, vy - uy * along, vz - uz * along);
    let d = rad - R;
    d = smax(d, Math.abs(t - midT) - half, 0.012);
    if (d < 0.016) d += 0.0016 * Math.sin(t * 40);
    return d;
  };
  const mid = [A[0] + ux * len * midT, A[1] + uy * len * midT, A[2] + uz * len * midT];
  return {sdf, bounds: [mid[0] - 0.1, mid[1] - 0.1, mid[2] - 0.1, mid[0] + 0.1, mid[1] + 0.1, mid[2] + 0.1], cell: 0.0032, tris: [220, 90, 30], project: 0.0016,
    paint: (x, y, z, o) => {
      const t = ((x - A[0]) * ux + (y - A[1]) * uy + (z - A[2]) * uz) / len;
      o[0] = 0.15 + 0.5 * Math.exp(-((t - midT) * (t - midT)) / 0.004);
    }};
}
export const BRAKK = {
  id: 'brakk-v6', seed: 8811,
  proportions: {headScale: 0.62, frames: ['H', 'J'], height: 1},
  palette: {
    skin: [0.72, 0.5, 0.38], skinDeep: [0.5, 0.26, 0.2],
    leather: [0.34, 0.2, 0.1], leatherDeep: [0.16, 0.09, 0.05],
    cloth: [0.22, 0.21, 0.17], clothDeep: [0.1, 0.09, 0.07],
    iron: [0.45, 0.47, 0.5], ironDeep: [0.16, 0.17, 0.19],
    boot: [0.16, 0.1, 0.06], bootDeep: [0.08, 0.05, 0.03],
    hair: [0.28, 0.14, 0.07], hairDeep: [0.1, 0.05, 0.03],
    band: [0.84, 0.8, 0.72], bandDeep: [0.55, 0.32, 0.24],
    nail: [0.7, 0.5, 0.42], nailDeep: [0.5, 0.32, 0.26],
    sclera: [0.84, 0.78, 0.7], iris: [0.32, 0.22, 0.12], pupil: [0.02, 0.012, 0.01]
  },
  rig: {waist: [0, 0.16, 0], lean: BRAKK_LEAN, neck: [0.01, 0.34, 0], jaw: 0.0036, headTilt: -0.02, drape: {follow: 0.25, push: 0.006}},
  parts: [
    {part: 'trousers', frame: 'B', mat: 'cloth', col: 'cloth', col2: 'clothDeep'},
    {part: 'boots', frame: 'B', mat: 'cloth', col: 'boot', col2: 'bootDeep'},
    {part: 'bandage', frame: 'B', mat: 'cloth', col: 'band', col2: 'bandDeep'},
    {part: 'torso', frame: 'U', mat: 'cloth', col: 'leather', col2: 'leatherDeep'},
    {part: 'sleeve0', frame: 'U', mat: 'cloth', col: 'cloth', col2: 'clothDeep'},
    {part: 'sleeve1', frame: 'U', mat: 'cloth', col: 'cloth', col2: 'clothDeep'},
    {part: 'belt', frame: 'U', mat: 'trim', col: 'leather', col2: 'leatherDeep'},
    {part: 'pauldrons', frame: 'U', mat: 'trim', col: 'iron', col2: 'ironDeep'},
    {part: 'neck', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep', drape: [-0.03, -0.12]},
    {part: 'head', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'ears', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'hair', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep'},
    {part: 'brows', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep'},
    {part: 'browCards', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep', cards: true},
    {part: 'moustache', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep'},
    {part: 'mousCards', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep', cards: true},
    {part: 'beard', frame: 'J', mat: 'hair', col: 'hair', col2: 'hairDeep', drape: [-0.008, -0.05]},
    {part: 'beardCards', frame: 'J', mat: 'hair', col: 'hair', col2: 'hairDeep', drape: [-0.008, -0.05], cards: true},
    {part: 'helm', frame: 'H', mat: 'trim', col: 'iron', col2: 'ironDeep'},
    {part: 'kneeHand', frame: 'knee', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'woundHand', frame: 'wound', mat: 'skin', col: 'skin', col2: 'skinDeep'}
  ],
  body: {ratios: MALE, y: {neck: 0.34, shoulder: 0.26, pelvis: -0.01}, stoop: 0.03, belly: 0.22, narrow: 1.08, waistNarrow: 0.95, arms: BRAKK_ARMS},
  garments: [
    {type: 'robe', ease: 0.007, hang: 0.04, folds: 0.28, tris: [560, 240, 70], cell: 0.006, wear: WEAR_BRAKK},
    {type: 'sleeve', arm: 0, tris: [360, 150, 46], cell: 0.005, ease: 0.006, pouch: 0.008, drop: 0.008, up: BRAKK_UP, folds: 0.3, wear: WEAR_BRAKK},
    {type: 'sleeve', arm: 1, tris: [360, 150, 46], cell: 0.005, ease: 0.006, pouch: 0.008, drop: 0.008, up: BRAKK_UP, folds: 0.3, wear: WEAR_BRAKK},
    {type: 'sash', y: 0.0, h: 0.016, thick: 0.007, tris: [140, 60, 22], cell: 0.004, motif: 5, rib: 0.0012}
  ],
  eyes: {frame: 'H', sclera: 'sclera', iris: 'iris', pupil: 'pupil', lid: 'skin', lid2: 'skinDeep'},
  build() {
    const H = K.head({age: 0.7, brow: 1.2, jaw: 1.06, ears: 1.0, neck: 1.2, nose: {len: 1.02, width: 1.05, droop: 0.4, bulb: 1.0}, tris: [1900, 780, 210], cell: 0.0031});
    const B = K.body(this.body), D = K.dress(B, this.garments);
    const legs = K.legwear({legs: BRAKK_LEGS, ease: 0.004, bootEase: 0.008, bootRise: 0.1, seat: {c: [0.02, 0.13, 0], r: [0.08, 0.045, 0.1]}, tris: [720, 280, 80], cell: 0.0046, bootTris: [560, 220, 60], bootCell: 0.0032, wear: WEAR_BRAKK});
    const wound = BRAKK_LEGS[1];
    const band = bandageWrap(wound.pts[0], wound.pts[1]);
    const hcap = K.hairCap(H, {crown: 0.105, front: 0.015, hang: 0.006, thick: 0.006, tris: [220, 90, 30], cell: 0.005});
    const brw = K.brows(H, {size: 1.05, droop: 0.85});
    const mou = K.moustache(H, {size: 1.05, droop: 0.7});
    const brd = K.beard(H, {length: 0.045, width: 0.9, thick: 0.005, fork: 0, cheekLine: -0.008, tris: [420, 180, 50], cell: 0.0036});
    const helm = K.helm(H, {tris: [720, 300, 80], cell: 0.0028});
    const knee = K.hand({pose: 'rest', side: -1, age: 0.85, size: 1.02, curl: 0.85, tris: [800, 320, 80], cell: 0.0019});
    const woundH = K.hand({pose: 'rest', side: 1, age: 0.85, size: 1.02, curl: 1.55, tris: [800, 320, 80], cell: 0.0019});
    const hideWrist = sp => { sp.cull = (x, y, z) => x < -0.014; return sp; };
    const [e0, e1] = D.ends;
    const {sash, ...Drest} = D.parts;
    return {
      parts: {trousers: legs.trousers, boots: legs.boots, bandage: band, ...Drest, belt: sash,
        pauldrons: K.pauldrons(BRAKK_ARMS, {rx: 0.052, ry: 0.02, rz: 0.058, lift: 0.01, tris: [240, 90, 30]}),
        head: H, ears: K.ears(H, {tris: [420, 190, 50], cell: 0.0017}), hair: hcap,
        brows: brw, browCards: {cardsDirect: brw.cardsPart.cardsDirect},
        moustache: mou, mousCards: {cardsDirect: mou.cardsPart.cardsDirect},
        beard: brd, beardCards: {cardsDirect: brd.cardsPart.cardsDirect},
        helm, neck: K.neck(H, {tris: [200, 90, 32], cell: 0.0038, neck: 1.15}),
        kneeHand: hideWrist(knee), woundHand: hideWrist(woundH)},
      eyes: {r: H.eye.r, iris: 0.48, open: 12, low: -20, arch: 8, lidT: 0.002},
      anchors: {
        eye: [H.eye.x, H.eye.y, H.eye.z],
        lamp: helm.lamp,
        kneeAt: e0.at, kneeR: K.basis(e0.dir, [0.15, 0.95, 0.1]),
        woundAt: e1.at, woundR: K.basis(e1.dir, [0.1, 0.95, -0.15])
      }
    };
  }
};

