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
const ARMS = [
  {S: [0, 0.215, 0.118], E: [0.07, 0.11, 0.16], W: [0.19, 0.17, 0.17], r: [0.042, 0.045, 0.057], back: 0.034},  // staff arm (+Z)
  {S: [0, 0.215, -0.118], E: [0.03, 0.09, -0.15], W: [0.086, 0.06, -0.064], r: [0.042, 0.045, 0.054], back: 0.024} // hand resting on the sash
];
export const KEEPER = {
  id: 'keeper-v2', seed: 4242,
  palette: {
    skin: [0.8, 0.6, 0.47], skinDeep: [0.66, 0.34, 0.28],
    robe: [0.36, 0.1, 0.07], robeDeep: [0.24, 0.06, 0.05],
    gold: [0.8, 0.58, 0.18], goldDeep: [0.55, 0.36, 0.1],
    white: [0.9, 0.9, 0.86], whiteDeep: [0.66, 0.64, 0.6],
    sclera: [0.86, 0.82, 0.74], iris: [0.42, 0.26, 0.12], pupil: [0.02, 0.015, 0.012]
  },
  rig: {waist: [0, 0.48, 0], lean: -0.15, neck: [0.005, 0.295, 0], jaw: 0.005},
  parts: [
    {part: 'skirt', frame: 'B', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'hem', frame: 'B', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'torso', frame: 'U', mat: 'cloth', col: 'robe', col2: 'robeDeep'},
    {part: 'sash', frame: 'U', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'cuff0', frame: 'U', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'cuff1', frame: 'U', mat: 'trim', col: 'gold', col2: 'goldDeep'},
    {part: 'head', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'hair', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'brows', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'moustache', frame: 'H', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'beard', frame: 'J', mat: 'hair', col: 'white', col2: 'whiteDeep'},
    {part: 'gripHand', frame: 'grip', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'restHand', frame: 'rest', mat: 'skin', col: 'skin', col2: 'skinDeep'}
  ],
  eyes: {frame: 'H', sclera: 'sclera', iris: 'iris', pupil: 'pupil', lid: 'skin', lid2: 'skinDeep'},
  build() {
    const U = {off: this.rig.waist, R: K.rotZ(this.rig.lean)};
    const H = K.head({age: 0.9, brow: 1.25, jaw: 1.0, ears: 1.05, nose: {len: 1.1, width: 1.05, droop: 0.9, bulb: 1.15}, eye: {x: 0.071, y: 0.088, z: 0.031, r: 0.0112}});
    const skirt = K.robeSkirt({height: 0.53});
    const torso = K.robeTorso({arms: ARMS, waist: 0.095});
    const skirtBody = (x, y, z) => skirt.sdf(x, y, z) / 0.8;
    const hem = K.trimBand(skirtBody, (x, y, z) => y - 0.042, {thick: 0.007, bounds: [-0.25, -0.01, -0.25, 0.25, 0.06, 0.25], cell: 0.0048, tris: [200, 70], cull: (x, y) => y < 0.0035});
    // hide what the other parts cover: the skirt top inside the torso, the torso bottom inside the skirt
    const torsoInB = K.inChild(torso.body, U.off, U.R), skirtInU = K.inParent(skirt.sdf, U.off, U.R);
    const skirtCull = skirt.cull, torsoCull = torso.cull;
    skirt.cull = (x, y, z) => skirtCull(x, y, z) || hem.covers(x, y, z) || (y > 0.44 && torsoInB(x, y, z) < -0.004);
    torso.cull = (x, y, z) => torsoCull(x, y, z) || (y < 0.0 && skirtInU(x, y, z) < -0.004);
    const grip = K.hand({pose: 'grip', side: -1, gripR: 0.0135, age: 1.2});
    const rest = K.hand({pose: 'rest', side: 1, age: 1.2, curl: 1.15});
    const sleeveCull = sp => { const c = sp.cull; sp.cull = (x, y, z) => (c && c(x, y, z)) || x < -0.032; return sp; };
    const [e0, e1] = torso.ends;
    return {
      parts: {skirt, hem, torso, sash: torso.trims.sash, cuff0: torso.trims.cuffs[0], cuff1: torso.trims.cuffs[1],
        head: H, hair: K.hairCap(H, {crown: 0.128}), brows: K.brows(H, {size: 1.15, droop: 1.1}), moustache: K.moustache(H, {size: 1.1}),
        beard: K.beard(H, {length: 0.2, fork: 1}), gripHand: sleeveCull(grip), restHand: sleeveCull(rest)},
      eyes: {r: H.eye.r, iris: 0.5, open: 9, low: -25, arch: 9},
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
