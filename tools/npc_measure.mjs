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
