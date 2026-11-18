// node tools/npc_grip.mjs [--file index.html] [--talk]  -- checks that the Keeper's staff hand stays locked on the rod.
// Builds the Keeper at many animation times (idle breathing; --talk adds the talking state) through window.__game.gripProbe and prints,
// per sample, where the hand holds the rod along the staff axis (world Y of the rod point, the foot is on the floor) and sideways, plus the
// drift of the sleeve mouth (cuffErr) against the hand. Spread of the along-axis value must be < 1 mm. Exits 1 on failure.
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), fi = argv.indexOf('--file');
const file = fi >= 0 ? resolve(argv[fi + 1]) : resolve(root, 'index.html');
const b = await chromium.launch(), pg = await b.newPage();
await pg.goto(pathToFileURL(file).href);
await pg.waitForFunction(() => window.__game && window.__game.studio, null, {timeout: 120000});
await pg.evaluate(() => window.__game.studio({type: 'keeper', dist: 1.1}));
const ts = Array.from({length: 40}, (_, i) => i * 0.37);
let bad = false;
for (const talking of [false, true]) {
  const r = await pg.evaluate(([ts, tk]) => window.__game.gripProbe(ts, tk), [ts, talking]);
  const ys = r.map(s => s.rodPoint[1]), lat = r.map(s => Math.hypot(s.rodPoint[0] - s.rodBase[0], s.rodPoint[2] - s.rodBase[2])), ce = r.map(s => s.cuffErr);
  const sp = a => (Math.max(...a) - Math.min(...a)) * 1000;
  // hand position relative to the rod foot, in the horizontal plane (the rod is vertical, foot planted)
  const hx = r.map(s => Math.hypot(s.hand[0] - s.rodBase[0], s.hand[2] - s.rodBase[2]));
  console.log(`${talking ? 'talking' : 'idle   '}: grip height on rod ${(ys[0] * 1000).toFixed(1)} mm, spread over ${ts.length} times ${sp(ys).toFixed(3)} mm; sideways offset spread ${sp(hx).toFixed(3)} mm; sleeve mouth vs hand drift max ${(Math.max(...ce) * 1000).toFixed(2)} mm`);
  if (sp(ys) > 1 || sp(hx) > 1) bad = true;
}
await b.close();
process.exit(bad ? 1 : 0);
