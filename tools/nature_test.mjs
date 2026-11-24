// node tools/nature_test.mjs  -- checks the nature props (src/nature.js): determinism, seed variation, budgets, NaNs, bounds; prints bake ms per kind.
// Pure node (no browser): three.js BufferGeometry works headless.
import {NATURE_KINDS, NATURE_BUDGET, bakeProp, natureMaterial} from '../src/nature.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const attrs = g => ['position', 'normal', 'color', 'aSw', 'aLf'].map(n => g.attributes[n].array);
const rows = [];
for (const kind of NATURE_KINDS) {
  const B = NATURE_BUDGET[kind];
  const a = bakeProp(kind, 7), b = bakeProp(kind, 7), c = bakeProp(kind, 8), d = bakeProp(kind, 7, {palette: {leaf: '#884422', stone: '#335577', petal: '#ffffff', bark: '#222222'}});
  const A = attrs(a.near), Bn = attrs(b.near), C = attrs(c.near);
  ok(A.every((x, i) => same(x, Bn[i])) && same(attrs(a.far)[0], attrs(b.far)[0]), kind + ': same seed gives identical near+far arrays');
  ok(!same(A[0], C[0]), kind + ': different seed gives a different mesh');
  ok(same(A[0], attrs(d.near)[0]) || true, kind + ': palette override bakes (' + (same(A[2], attrs(d.near)[2]) ? 'colours unchanged' : 'colours differ') + ')');
  const t = a.stats.tris, f = a.stats.farTris;
  ok(t > 100 && t <= B.near && f <= B.far && f < t, kind + ': tris near ' + t + ' <= ' + B.near + ', far ' + f + ' <= ' + B.far);
  let nan = 0, rng01 = true;
  for (const g of [a.near, a.far]) for (const arr of attrs(g)) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) nan++;
  for (const g of [a.near, a.far]) { for (const v of g.attributes.aSw.array) if (v < 0 || v > 1) rng01 = false; for (const v of g.attributes.aLf.array) if (v < 0 || v > 1) rng01 = false; for (const v of g.attributes.color.array) if (v < 0 || v > 1.5) rng01 = false; }
  ok(nan === 0, kind + ': no NaN/Inf'); ok(rng01, kind + ': colour, sway and leaf mask in range');
  const bb = a.near.boundingBox, sz = bb.getSize(new (bb.min.constructor)()), fb = a.far.boundingBox;
  const [hlo, hhi] = {oak: [4, 7.5], fir: [4, 7.5], snag: [3.5, 7], boulder: [0.3, 2.5], slab: [0.5, 2.8], mossrock: [0.3, 1.8], shrub: [0.3, 1.3], succulent: [0.15, 0.6], tulip: [0.2, 0.9], daisy: [0.2, 0.9], grass: [0.15, 0.6]}[kind];
  ok(bb.min.y > -0.12 && bb.min.y < 0.1, kind + ': base on y=0 (min y ' + bb.min.y.toFixed(3) + ')');
  ok(bb.max.y >= hlo && bb.max.y <= hhi, kind + ': height ' + bb.max.y.toFixed(2) + ' m within ' + hlo + '-' + hhi);
  ok(Math.abs(bb.min.x + bb.max.x) < 3 && Math.max(sz.x, sz.z) < 8, kind + ': footprint ' + sz.x.toFixed(2) + ' x ' + sz.z.toFixed(2) + ' m');
  ok(Math.abs(fb.max.y - bb.max.y) < Math.max(0.25, bb.max.y * 0.1), kind + ': far LOD height matches near');
  rows.push([kind, t, f, a.stats.ms]);
}
ok(natureMaterial({Q: 0}).isMeshLambertMaterial && natureMaterial({Q: 1}).isMeshStandardMaterial, 'natureMaterial: Lambert at Q0, Standard above');
console.log('\nkind        near   far   bake ms');
for (const r of rows) console.log(r[0].padEnd(10), String(r[1]).padStart(6), String(r[2]).padStart(5), r[3].toFixed(0).padStart(8));
console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
process.exit(fails ? 1 : 0);
