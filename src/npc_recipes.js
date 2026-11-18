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
  id: 'keeper-v13', seed: 4242,
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
    {part: 'brows', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'moustache', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'beard', frame: 'J', mat: 'hair', col: 'white', col2: 'whiteDeep', drape: [-0.015, -0.13]},
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
    const H = K.head({age: 0.9, brow: 1.25, jaw: 1.0, ears: 1.05, nose: {len: 1.1, width: 1.05, droop: 0.9, bulb: 1.15}, tris: [1650, 700, 190], cell: 0.0038});
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
    const grip = K.hand({pose: 'grip', side: -1, gripR: this.gripR ?? 0.0092, age: 1.2, tris: [1300, 600, 100], cell: 0.0017});
    const rest = K.hand({pose: 'rest', side: 1, age: 1.2, curl: 1.15, tris: [1300, 600, 100], cell: 0.0017});
    const sleeveCull = sp => { const c = sp.cull; sp.cull = (x, y, z) => (c && c(x, y, z)) || x < -0.032; return sp; };
    // pinned-on props (frame U): brooch on the stole's lappet, pouch and key ring on the belt. up = world up in U coordinates (U leans by rig.lean).
    const upU = [Math.sin(this.rig.lean), Math.cos(this.rig.lean), 0];
    const bodySurf = (x, y, z) => Math.min(D.torsoSolid(x, y, z), Math.max(skirtInU(x, y, z), y - 0.05));
    const onBody = (surf, theta, y, yMid) => { // surface point at azimuth theta (from +x towards +z) and height y; normal taken at yMid so hanging things follow the skirt's slope
      const c = Math.cos(theta), s = Math.sin(theta), hit = yy => K.surfacePoint(surf, [0.3 * c, yy, 0.3 * s], [-c, 0, -s], 0, 0.3), a = hit(y), m = hit(yMid ?? y);
      return {P: a.P, n: m.n};
    };
    const bro = (() => { const hit = K.surfacePoint(D.stoleOuter, [0.3, 0.2, -0.07], [-1, 0, 0], 0, 0.3); return K.brooch(hit.P, hit.n, upU, {}); })();
    const pk = onBody(bodySurf, 1.31, -0.012, -0.04), kk = onBody(bodySurf, 0.42, -0.012, -0.04);
    const pouch = K.pouch(pk.P, pk.n, upU, bodySurf, {size: 1.25}), keys = K.keyRing(kk.P, kk.n, upU, bodySurf, {size: 1.5, tris: [280, 160, 40], cell: 0.0014});
    const [e0, e1] = D.ends;
    const brw = K.brows(H, {size: 1.15, droop: 1.1}), mou = K.moustache(H, {size: 1.2, droop: 1.35}), brd = K.beard(H, {length: 0.34, width: 1.12, thick: 0.009, fork: 0, chest: robeInBeard});
    // v11: robe and sleeves are cloth simulations (src/npc_cloth.js) laid out loose round the body SDF; the SDF garments above stay as fields (stole, beard, props rest on them)
    const cd = clothDress(B, {off: this.rig.waist, R: K.rotZ(this.rig.lean), skirtBase: skirt.base, ease: 0.012, hang: 0.03, nu: 72, rowsUp: 18, rowsLow: 32, folds: 12, gather: 0.1, bend: 0.25, rag: skirt.lift, seed: 3,
      sleeves: [{arm: 0, pouch: 0.044, nu: 24, rows: 26}, {arm: 1, pouch: 0.038, nu: 24, rows: 26}],
      stole: {nu: 44, rows: 22, gap: 0.024, edge: 0.3, yoke: 0.13, lappet: 0.3, width: 0.46}});
    const cloth = clothParts(cd, {wearTop: WEAR_TOP, wearSkirt: WEAR_SKIRT, rag: skirt.lift, hem: {cells: 25, rows: 6}, cuff: {cells: 8, rows: 3}, placket: {motif: 2}, stole: {motif: 3, border: 0.018}, wearStole: WEAR_STOLE, cord: {knot: -2}});
    const {torso: _t, sleeve0: _s0, sleeve1: _s1, cuff0: _c0, cuff1: _c1, sash: _sa, stole: _st, ...Drest} = D.parts;
    return {
      parts: {...cloth, ...Drest, brooch: bro, pouch, keys,
        head: H, ears: K.ears(H, {tris: [650, 400, 60], cell: 0.0015}), hair: K.hairCap(H, {crown: 0.128, tris: [450, 260, 60], cell: 0.0065}), brows: brw, moustache: mou, browCards: {cardsDirect: brw.cardsPart.cardsDirect}, mousCards: {cardsDirect: mou.cardsPart.cardsDirect}, beardCards: {cardsDirect: brd.cardsPart.cardsDirect},
        neck: K.neck(H, {tris: [260, 150, 40], cell: 0.0035}), beard: brd, gripHand: sleeveCull(grip), restHand: sleeveCull(rest)},
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
