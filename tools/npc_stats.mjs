// node tools/npc_stats.mjs [recipeName]  -- bakes a recipe in Node (no browser) and prints the triangle
// budget per part and LOD, raw surface-net size and bake time. Vertices posed per frame = 3 x triangles.
// Recipes are the exports of src/npc_recipes.js (default KEEPER). --obj DIR also writes each near part as .obj.
import * as R from '../src/npc_recipes.js';
import {bakeRecipe} from '../src/npc_kit.js';
import {writeFileSync, mkdirSync} from 'node:fs';
const name = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'KEEPER';
const oi = process.argv.indexOf('--obj'), objDir = oi > 0 ? process.argv[oi + 1] : null;
const rec = R[name];
if (!rec) { console.log('no recipe', name, 'have', Object.keys(R).join(', ')); process.exit(1); }
const b = bakeRecipe(rec);
console.log(`${rec.id}: bake ${b.stats.ms} ms`);
const NL = b.nLod;
console.log('part'.padEnd(12), 'raw'.padStart(7), ...Array.from({length: NL}, (_, i) => ['near', 'mid', 'far'][i === NL - 1 && NL > 1 ? 2 : i].padStart(7)), 'ms'.padStart(6));
for (const [k, v] of Object.entries(b.stats.parts)) console.log(k.padEnd(12), String(v.raw).padStart(7), ...Array.from({length: NL}, (_, i) => String(v.lods[Math.min(i, v.lods.length - 1)]).padStart(7)), String(v.ms).padStart(6));
for (let i = 0; i < NL; i++) console.log(`LOD ${i}: ${b.stats.tris[i]} triangles = ${b.stats.tris[i] * 3} vertices (incl. eyes)`);
if (objDir) {
  mkdirSync(objDir, {recursive: true});
  for (const [k, m] of Object.entries(b.parts)) {
    const M = m[0], L = [];
    for (let i = 0; i < M.length; i += 9) L.push(`v ${M[i]} ${M[i + 1]} ${M[i + 2]}`);
    for (let i = 0; i < M.length / 9; i += 3) L.push(`f ${i + 1} ${i + 2} ${i + 3}`);
    writeFileSync(`${objDir}/${k}.obj`, L.join('\n'));
  }
}
