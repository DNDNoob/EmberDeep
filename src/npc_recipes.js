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

/* ---------- The Keeper: old robed shopkeeper, white beard, lantern staff ---------- */
// Arm joint centres in U coords (waist origin): shoulder, elbow, wrist, and radii of the bare arm [deltoid, elbow, wrist].
const ARMS = [
  {S: [0, 0.325, 0.105], E: [0.07, 0.115, 0.17], W: [0.225, 0.15, 0.18], r: [0.03, 0.026, 0.018], back: 0.034},   // staff arm (+Z)
  {S: [0, 0.325, -0.105], E: [0.0, 0.12, -0.165], W: [0.105, 0.04, -0.075], r: [0.03, 0.026, 0.018], back: 0.024} // hand resting on the sash
];
export const KEEPER = {
  id: 'keeper-v7', seed: 4242,
  // Human proportions (see docs/npc-kit.md): the head is built at its natural size and drawn at headScale; the torso is
  // stretched (len) and the skirt (legs) raised so the figure is ~7.25 heads tall with shoulders about 2.7 head widths wide.
  proportions: {headScale: 0.6, frames: ['H', 'J'], height: 0.93},   // height: uniform scale of the whole figure and its props (crown 1.03 m * 0.93 = 0.96 m)
  palette: {
    skin: [0.8, 0.6, 0.47], skinDeep: [0.66, 0.34, 0.28],
    robe: [0.36, 0.1, 0.07], robeDeep: [0.24, 0.06, 0.05],
    gold: [0.8, 0.58, 0.18], goldDeep: [0.55, 0.36, 0.1],
    white: [0.9, 0.9, 0.86], whiteDeep: [0.66, 0.64, 0.6],
    sclera: [0.86, 0.82, 0.74], iris: [0.42, 0.26, 0.12], pupil: [0.02, 0.015, 0.012]
  },
  rig: {waist: [0, 0.52, 0], lean: -0.15, neck: [0.005, 0.418, 0], jaw: 0.003, drape: {follow: 0.3, push: 0.012}},
  parts: [
    {part: 'skirt', frame: 'B', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'hem', frame: 'B', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'torso', frame: 'U', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'sleeve0', frame: 'U', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'sleeve1', frame: 'U', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'sash', frame: 'U', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'cuff0', frame: 'U', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'cuff1', frame: 'U', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'neck', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep', drape: [-0.04, -0.17]},
    {part: 'head', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'ears', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'hair', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'brows', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'moustache', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'beard', frame: 'J', mat: 'hair', col: 'white', col2: 'whiteDeep', drape: [-0.015, -0.13]},
    {part: 'gripHand', frame: 'grip', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'restHand', frame: 'rest', mat: 'skin', col: 'skin', col2: 'skinDeep'}
  ],
  // Body first, clothes over it (docs/npc-kit.md): the body is only an SDF; the garments are the meshes.
  body: {y: {neck: 0.418}, stoop: 0.05, belly: 0.5, narrow: 1.0, waistNarrow: 0.86, arms: ARMS},
  garments: [
    {type: 'robe', ease: 0.012, hang: 0.03, collar: {r: 0.037}},
    {type: 'sleeve', arm: 0, tris: [470, 170], cell: 0.0062, ease: 0.011, bell: 0.07, folds: 1.2, cuff: {len: 0.028}},
    {type: 'sleeve', arm: 1, tris: [470, 170], cell: 0.0062, ease: 0.011, bell: 0.064, folds: 1.2, cuff: {len: 0.028}},
    {type: 'sash', y: 0.017, h: 0.027, thick: 0.006}
  ],
  eyes: {frame: 'H', sclera: 'sclera', iris: 'iris', pupil: 'pupil', lid: 'skin', lid2: 'skinDeep'},
  build() {
    const U = {off: this.rig.waist, R: K.rotZ(this.rig.lean)};
    const H = K.head({age: 0.9, brow: 1.25, jaw: 1.0, ears: 1.05, nose: {len: 1.1, width: 1.05, droop: 0.9, bulb: 1.15}, tris: [1000, 380]});
    const skirt = K.robeSkirt({height: 0.57, waist: 0.097, aspect: 1.12, cell: 0.0075, tris: [760, 260]});
    const B = K.body(this.body), D = K.dress(B, this.garments.map(g => g.type === 'robe' ? {...g, tris: [680, 250], cell: 0.0075} : g)), torso = D.parts.torso;
    const skirtBody = (x, y, z) => skirt.sdf(x, y, z) / 0.8;
    const hem = K.trimBand(skirtBody, (x, y, z) => y - 0.042, {thick: 0.007, bounds: [-0.25, -0.01, -0.25, 0.25, 0.06, 0.25], cell: 0.0048, tris: [200, 70], cull: (x, y) => y < 0.0035});
    // hide what the other parts cover: the skirt top inside the torso, the torso bottom inside the skirt
    const torsoInB = K.inChild(D.torsoBase, U.off, U.R), skirtInU = K.inParent(skirt.sdf, U.off, U.R);
    const skirtCull = skirt.cull, torsoCull = torso.cull;
    skirt.cull = (x, y, z) => skirtCull(x, y, z) || hem.covers(x, y, z) || (y > 0.48 && torsoInB(x, y, z) < -0.004);
    torso.cull = (x, y, z) => torsoCull(x, y, z) || (y < 0.0 && skirtInU(x, y, z) < -0.004);
    // the beard hangs from the jaw frame (head units, scale 0.6) and blends into the drape frame D (neck pivot, follows the head 30%):
    // express the robe in beard coordinates so the beard can rest on the cloth
    const hs = this.proportions.headScale, dk = this.rig.drape.follow * (this.rig.headTilt ?? 0.12), cD = Math.cos(dk), sD = Math.sin(dk);
    const nxy = [this.rig.neck[0] + this.rig.drape.push, this.rig.neck[1], this.rig.neck[2]];
    const robeInBeard = (x, y, z) => D.torsoBase(nxy[0] + hs * (cD * x - sD * y), nxy[1] + hs * (sD * x + cD * y), nxy[2] + hs * z) / hs;
    const grip = K.hand({pose: 'grip', side: -1, gripR: 0.0135, age: 1.2});
    const rest = K.hand({pose: 'rest', side: 1, age: 1.2, curl: 1.15});
    const sleeveCull = sp => { const c = sp.cull; sp.cull = (x, y, z) => (c && c(x, y, z)) || x < -0.032; return sp; };
    const [e0, e1] = D.ends;
    return {
      parts: {skirt, hem, ...D.parts,
        head: H, ears: K.ears(H), hair: K.hairCap(H, {crown: 0.128}), brows: K.brows(H, {size: 1.15, droop: 1.1}), moustache: K.moustache(H, {size: 1.1}),
        neck: K.neck(H), beard: K.beard(H, {length: 0.3, width: 1.25, thick: 0.009, fork: 1, tris: [520, 190], chest: robeInBeard}), gripHand: sleeveCull(grip), restHand: sleeveCull(rest)},
      eyes: {r: H.eye.r, iris: 0.5, open: 12, low: -24, arch: 9, lidT: 0.0021},
      anchors: {
        eye: [H.eye.x, H.eye.y, H.eye.z],
        // staff hand: thumb up, palm facing the body, held axis vertical (hand Z -> down)
        gripAt: e0.at, gripR: K.rotX(Math.PI / 2), gripAxis: grip.grip,
        // resting hand: along the forearm, back of the hand facing forward
        restAt: e1.at, restR: K.basis(e1.dir, [0.9, 0.25, -0.35]),
        gem: [0.1, 0.02, 0]
      }
    };
  }
};
