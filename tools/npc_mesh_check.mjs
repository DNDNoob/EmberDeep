// node tools/npc_mesh_check.mjs [recipeName]  -- scans every baked mesh of a recipe (both LODs, plus the eye rig) for what
// turns into NaN on a real GPU: non-finite values, zero-length or non-unit normals, normals facing against their triangle,
// degenerate (zero-area) triangles. Prints what bakePart's sanitize() already dropped or repaired, and exits 1 on any
// remaining problem.
import * as R from '../src/npc_recipes.js';
import {bakeRecipe} from '../src/npc_kit.js';
const rec = R[process.argv[2] || 'KEEPER'], b = bakeRecipe(rec);
let bad = 0;
function scan(name, M, dropped) {
  let nan = 0, zeroN = 0, nonUnit = 0, degen = 0, flip = 0, tiny = 0;
  for (let i = 0; i < M.length; i += 27) {
    for (let k = 0; k < 27; k++) if (!Number.isFinite(M[i + k])) nan++;
    const ux = M[i + 9] - M[i], uy = M[i + 10] - M[i + 1], uz = M[i + 11] - M[i + 2], wx = M[i + 18] - M[i], wy = M[i + 19] - M[i + 1], wz = M[i + 20] - M[i + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx, fl = Math.hypot(fx, fy, fz);
    if (fl < 2e-10) degen++; else if (fl < 2e-8) tiny++;
    let dp = 0;
    for (let v = 0; v < 3; v++) {
      const o = i + v * 9, l = Math.hypot(M[o + 3], M[o + 4], M[o + 5]);
      if (l < 1e-4) zeroN++; else if (Math.abs(l - 1) > 1e-3) nonUnit++;
      dp += fx * M[o + 3] + fy * M[o + 4] + fz * M[o + 5];
    }
    if (dp < 0) flip++;
  }
  const prob = nan + zeroN + nonUnit + degen;
  bad += prob;
  console.log(name.padEnd(14), String(M.length / 27).padStart(5), 'tris', `NaN ${nan} zeroN ${zeroN} nonUnitN ${nonUnit} degenerate ${degen} (sub-mm2 ${tiny}) windingVsNormal ${flip}`, dropped ? ` [bake dropped ${dropped} tris]` : '', prob ? 'PROBLEM' : 'ok');
}
for (const [k, m] of Object.entries(b.parts)) { scan(k + ' near', m[0], m[0].dropped); scan(k + ' far', m[1], m[1].dropped); }
const E = b.eyes;
if (E) for (const k of ['ball', 'iris', 'lid', 'lower']) scan('eye.' + k, E[k]);
console.log(bad ? `${bad} problems` : 'all meshes clean');
process.exit(bad ? 1 : 0);
