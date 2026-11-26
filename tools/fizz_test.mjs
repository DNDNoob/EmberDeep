// node tools/fizz_test.mjs [--shots DIR]
// Checks the Fizzler (creature type 4): it turns up on about one floor in ten without moving anything else, hunts, shakes itself up,
// sprays foam that fills your fizz meter until it costs a heart, and can be beaten to death. --shots saves screenshots.
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = {shots: '', q: 'low'};
for (let i = 2; i < process.argv.length; i++) A[process.argv[i].replace(/^--/, '')] = process.argv[++i];
if (A.shots) mkdirSync(A.shots, {recursive: true});
const b = await chromium.launch();
const pg = await (await b.newContext({viewport: {width: 1280, height: 720}})).newPage(), errs = [];
pg.setDefaultTimeout(600000);
pg.on('pageerror', e => errs.push(String(e)));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.addInitScript(q => { localStorage.setItem('emberdeep.quality', JSON.stringify(q)); }, A.q);
await pg.goto(pathToFileURL(resolve(root, 'index.html')).href);
await pg.waitForFunction(() => window.__game && window.__game.startRun, null, {timeout: 120000});
const frames = n => pg.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async name => { if (A.shots) { await frames(3); await pg.screenshot({path: resolve(A.shots, name + '.png')}); console.log('  shot', name); } };
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

const spawn = await pg.evaluate(() => {
  const g = window.__game;let n = 0, has = 0, det = true, far = true, first = null;
  for (let k = 0; k < 400; k++) { const seed = 'FZ' + k, d = 1 + (k % 12), F = g.genFloor(seed, d); if (F.back) continue; n++;
    const f = F.shades.filter(s => s.type === 4);
    if (f.length) { has++; if (!first) first = [seed, d]; if (F.dist[Math.floor(f[0].z) * F.W + Math.floor(f[0].x)] <= 12) far = false; }
    if (JSON.stringify(f) !== JSON.stringify(g.genFloor(seed, d).shades.filter(s => s.type === 4))) det = false; }
  return {n, has, det, far, first};
});
check(spawn.has / spawn.n > 0.06 && spawn.has / spawn.n < 0.14, 'a Fizzler turns up on about one floor in ten (' + spawn.has + ' of ' + spawn.n + ')');
check(spawn.det && spawn.far, 'always the same floors for a seed, and it starts far from you');

// a fight in a corridor
const r = await pg.evaluate(() => {
  const g = window.__game, P = g.P;g.startRun('FZRUN', 2, true);const F = g.F;
  let s0;for (let y = 2; y < F.H - 2 && !s0; y++) for (let x = 2; x < F.W - 8; x++) { let ok = true; for (let k = 0; k < 7; k++) { const i = y * F.W + x + k; if (F.g[i] || F.safeMask[i]) ok = false; } if (ok) { s0 = [x, y]; break; } }
  P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.yaw = 0; P.pitch = 0; P.hp = 3; P.inv = 0; P.ward = 0; g.onTileChange();
  for (const s of F.shades) { s.x = s.z = -99; s.dead = true; }
  const f = {type: 4, x: P.x + 4, z: P.z, gx: s0[0] + 4, gy: s0[1], px: -1, py: -1, state: 0, stun: 0, think: 0, vis: false, frozen: false, ph: 0, d: 99, snd: 0, ft: 0, fs: 0};
  F.shades.push(f); window.__f = f;
  const seen = new Set(), fizz = [];let hurtAt = -1;
  for (let k = 0; k < 360; k++) { g.update(1 / 30); seen.add(f.state); fizz.push(g.P.fizz || 0); if (hurtAt < 0 && g.P.hp < 3) hurtAt = k / 30; P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; }
  return {states: [...seen].sort(), maxFizz: Math.max(...fizz), hurtAt, hp: g.P.hp, dist: Math.hypot(f.x - P.x, f.z - P.z)};
});
check(r.states.includes(1) && r.states.includes(3) && r.states.includes(2), 'it hunts you, shakes itself up and sprays (states ' + r.states + ')');
check(r.maxFizz > 0.5, 'the foam fills your fizz meter (' + r.maxFizz.toFixed(2) + ')');
check(r.hurtAt > 0 && r.hp < 3, 'a full fizz meter costs a heart (after ' + r.hurtAt.toFixed(1) + ' s)');
const safe = await pg.evaluate(() => { const g = window.__game, f = window.__f; g.P.fizz = 0; g.P.hp = 3; f.state = 2; f.ft = 1; f.face = Math.PI; g.P.x = f.x + 1.5; g.P.z = f.z; g.onTileChange(); for (let k = 0; k < 20; k++) g.update(1 / 30); return g.P.fizz; });
check(safe < 0.05, 'the spray only fizzes what is in front of the nozzle');
const kill = await pg.evaluate(() => {
  const g = window.__game, f = window.__f, P = g.P; g.smith.own.hammer = true; g.smith.eq = 'hammer'; g.smith.p1.hammer = 0; g.smith.p2.hammer = -1; g.smith.xp.hammer = g.wXpFor(8);
  let n = 0; while (!(f.down > 0) && n++ < 20) { f.x = P.x + 1; f.z = P.z; f.stun = 0; f.state = 1; f.ft = 5; P.yaw = 0; g.W.cd = 0; g.wAttack(); }
  return {down: f.down > 0, n};
});
check(kill.down, 'it can be beaten to death (' + kill.n + ' blows of a maul)');

await pg.evaluate(() => { const g = window.__game, f = window.__f, P = g.P; f.down = 0; f.dead = false; f.x = P.x + 1.4; f.z = P.z + 0.15; f.state = 3; f.ft = 99; f.stun = 0; f.face = Math.PI; P.yaw = 0; P.pitch = -0.12; P.fizz = 0; g.smith.eq = ''; window.__hold = setInterval(() => { f.state = 3; f.ft = 99; }, 10); });
await shot('01-fizzler-shaking');
await pg.evaluate(() => { clearInterval(window.__hold); const g = window.__game, f = window.__f; window.__hold = setInterval(() => { f.state = 2; f.ft = 99; f.face = Math.PI; }, 10); g.P.fizz = 0.7; g.P.fizzT = 99; });
await shot('02-fizzler-spraying');
await pg.evaluate(() => clearInterval(window.__hold));
check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
