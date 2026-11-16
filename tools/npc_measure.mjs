// node tools/npc_measure.mjs [recipeName]  -- head-to-body proportions of a humanoid recipe, in world units (metres).
// Head height = chin to crown of the skull (hair excluded); total = soles to the highest hair/skull point, in the standing pose.
import * as R from '../src/npc_recipes.js';
import {bakeRecipe} from '../src/npc_kit.js';
const rec = R[process.argv[2] || 'KEEPER'], b = bakeRecipe(rec);
const Sh = rec.proportions?.height ?? 1, sc = (rec.proportions ? rec.proportions.headScale : 1) * Sh, rig = rec.rig, lean = rig.lean;
const nx = Sh * (rig.waist[0] + rig.neck[0] * Math.cos(lean) - rig.neck[1] * Math.sin(lean)), ny = Sh * (rig.waist[1] + rig.neck[0] * Math.sin(lean) + rig.neck[1] * Math.cos(lean));
const headTilt = rig.headTilt ?? 0.12, ct = Math.cos(lean + headTilt), st = Math.sin(lean + headTilt);
let top = -9, chin = 9, wid = 0, hairTop = -9;
const E = b.parts.ears ? b.parts.ears[0] : null;
const H = b.parts.head[0], Hh = b.parts.hair ? b.parts.hair[0] : null;
for (let i = 0; i < H.length; i += 9) { const x = H[i], y = H[i + 1], z = Math.abs(H[i + 2]); top = Math.max(top, y); if (x > 0.03 && z < 0.03) chin = Math.min(chin, y); if (y > 0.05) wid = Math.max(wid, z); }
if (E) for (let i = 0; i < E.length; i += 9) wid = Math.max(wid, Math.abs(E[i + 2]));
if (Hh) for (let i = 0; i < Hh.length; i += 9) hairTop = Math.max(hairTop, Hh[i + 1]);
const wy = (y, x = 0) => ny + sc * (x * st + y * ct);   // head-local -> world height (head tilted by lean + tilt)
const headH = (top - chin) * sc, total = wy(Math.max(top, hairTop), 0.0);
console.log(`${rec.id}: head scale ${sc} (height ${Sh})`);
console.log(`head chin-to-crown ${headH.toFixed(4)}  head width ${(2 * wid * sc).toFixed(4)}`);
console.log(`crown height ${total.toFixed(4)}  (neck top ${ny.toFixed(3)})  => ${(total / headH).toFixed(2)} heads tall`);

// ---- compare with the human reference (src/anthro.js). Ratios are to head height (chin to crown of the skull), in head-local units.
import {ANTHRO} from '../src/anthro.js';
const Hh0 = top - chin, bbox = M => { const b = [9, 9, 9, -9, -9, -9]; for (let i = 0; i < M.length; i += 9) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], M[i + k]); b[k + 3] = Math.max(b[k + 3], M[i + k]); } return b; };
const rows = [];
const add = (name, v, ref, tol) => rows.push([name, v, ref, tol]);
if (E) {
  const eb = bbox(E), ez = [], hz = Math.max(...Array.from({length: H.length / 9}, (_, i) => Math.abs(H[i * 9 + 2])).filter((_, i) => H[i * 9 + 1] > 0.05 && H[i * 9 + 1] < 0.12 && Math.abs(H[i * 9]) < 0.05));
  add('ear length', (eb[4] - eb[1]) / Hh0, ANTHRO.earLength, 0.04);
  add('ear breadth / length', (Math.max(...Array.from({length: E.length / 9}, (_, i) => E[i * 9])) - Math.min(...Array.from({length: E.length / 9}, (_, i) => E[i * 9]))) / (eb[4] - eb[1]) * 0.8, 0.55, 0.1);
  add('ear protrusion from skull', (eb[5] - hz) / Hh0, ANTHRO.earProtrusion, 0.03);
}
const er = b.anchors.eye;
add('interpupillary', 2 * er[2] / Hh0, ANTHRO.interpupillary, 0.02);
if (b.eyes) { add('eyeball diameter', 2 * b.eyes.r / Hh0, ANTHRO.eyeball, 0.012); add('iris diameter', 2 * b.eyes.r * (rec.build().eyes.iris ?? 0.5) / Hh0, ANTHRO.iris, 0.012); }
add('head breadth (skull, no ears)', 2 * Math.max(...Array.from({length: H.length / 9}, (_, i) => Math.abs(H[i * 9 + 2])).filter((_, i) => H[i * 9 + 1] > 0.05 && H[i * 9 + 1] < 0.12 && Math.abs(H[i * 9]) < 0.05)) / Hh0, ANTHRO.headBreadth, 0.06);
console.log('\nmeasure'.padEnd(32), 'actual'.padStart(7), 'ref'.padStart(7), 'tol'.padStart(6), ' ok');
for (const [n, v, r, t] of rows) console.log(n.padEnd(31), v.toFixed(3).padStart(7), r.toFixed(3).padStart(7), ('+-' + t).padStart(6), Math.abs(v - r) <= t ? ' ok' : ' OFF');
