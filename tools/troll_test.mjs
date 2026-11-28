// node tools/troll_test.mjs [--shots DIR]
// Checks the Troll (creature type 9): only past floor 20 and only now and then, lots of health, he lumbers after you and clubs you
// (club up first, then a heart and a knock back), and when you are just the other side of a wall he beats on it until it breaks.
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
const shot = async name => { if (A.shots) { await frames(4); await pg.screenshot({path: resolve(A.shots, name + '.png')}); console.log('  shot', name); } };
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

const spawn = await pg.evaluate(() => {
  const g = window.__game;let shallow = 0, n = 0, has = 0, det = true;
  for (let k = 0; k < 500; k++) { const seed = 'TR' + k, d = 1 + (k % 40), F = g.genFloor(seed, d);if (F.back || F.boss) continue;
    const t = F.shades.filter(s => s.type === 9);
    if (d <= 20) { if (t.length) shallow++; continue; }
    n++; if (t.length) has++;
    if (k < 60 && JSON.stringify(t) !== JSON.stringify(g.genFloor(seed, d).shades.filter(s => s.type === 9))) det = false; }
  return {shallow, n, has, det};
});
check(!spawn.shallow, 'never on floors 1 to 20');
check(spawn.has / spawn.n > 0.05 && spawn.has / spawn.n < 0.22, 'past floor 20, now and then (' + spawn.has + ' of ' + spawn.n + ' floors)');
check(spawn.det, 'always the same floors for a seed');

await pg.evaluate(() => { window.__setup = () => {
  const g = window.__game, P = g.P;g.startRun('TRRUN', 21, true);const F = g.F;
  for (const s of F.shades) { s.x = s.z = -99; s.dead = true; }
  const t = {type: 9, x: 0, z: 0, gx: 0, gy: 0, px: -1, py: -1, state: 0, stun: 0, think: 0, vis: false, frozen: false, ph: 0, d: 99, snd: 0, ft: 0, fs: 0, rad: 0.42};
  t.hp = t.hpMax = g.wMaxHp ? g.wMaxHp(t) : 0; F.shades.push(t);
  P.hp = 3; P.inv = 0; P.ward = 0; P.fuel = 100; return t; }; });

const club = await pg.evaluate(() => {
  const g = window.__game, P = g.P, F = g.F, t = window.__setup();
  let s0;for (let y = 2; y < F.H - 2 && !s0; y++) for (let x = 2; x < F.W - 8; x++) { let ok = true; for (let k = 0; k < 7; k++) { const i = y * F.W + x + k; if (F.g[i] || F.safeMask[i]) ok = false; } if (ok) { s0 = [x, y]; break; } }
  P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.yaw = 0; g.onTileChange(); t.x = P.x + 5; t.z = P.z; t.hp = t.hpMax = 200;
  const seen = new Set();let hurtAt = -1, raisedFirst = false, knock = 0;
  for (let k = 0; k < 30 * 30 && hurtAt < 0; k++) { const x0 = P.x; g.update(1 / 30); seen.add(t.state); if (t.state === 2) raisedFirst = true;
    if (P.hp < 3) { hurtAt = k / 30; knock = Math.hypot(P.vx, P.vz); } else { P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.vx = P.vz = 0; } }
  return {states: [...seen].sort(), hurtAt, raisedFirst, knock};
});
check(club.states.includes(1), 'he lumbers after you');
check(club.hurtAt > 0 && club.raisedFirst, 'he raises the club, then brings it down for a heart (after ' + club.hurtAt.toFixed(1) + ' s)');
check(club.knock > 3, 'and knocks you flying (' + club.knock.toFixed(1) + ' m/s)');

const hp = await pg.evaluate(() => { const g = window.__game, t = window.__setup(); return t.hpMax; });
check(hp > 60, 'he has lots of health (' + Math.round(hp) + ', a shade has about 13 down here)');

const wall = await pg.evaluate(() => {
  const g = window.__game, P = g.P, t = window.__setup(), F = g.F, W = F.W;
  let pick = null;
  for (let y = 2; y < F.H - 2 && !pick; y++) for (let x = 2; x < W - 2 && !pick; x++) {
    if (F.g[y * W + x] !== 1 || g.pkWhy(x, y)) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]]) { const a = [x - dx, y - dz], c = [x + dx, y + dz];
      if (F.g[a[1] * W + a[0]] || F.g[c[1] * W + c[0]] || F.safeMask[a[1] * W + a[0]] || F.safeMask[c[1] * W + c[0]]) continue;
      const d = g.bfs(F.g, W, F.H, a[0], a[1]); if (d[c[1] * W + c[0]] > 14) { pick = {w: [x, y], a, c}; break; } } }
  if (!pick) return {none: true};
  P.x = pick.c[0] + 0.5; P.z = pick.c[1] + 0.5; g.onTileChange(); t.x = pick.a[0] + 0.5; t.z = pick.a[1] + 0.5; t.state = 1;
  const seen = new Set();let broke = -1, hits = 0, prev = 0;
  for (let k = 0; k < 30 * 30 && broke < 0; k++) { g.update(1 / 30); seen.add(t.state); if (t.bash) { if (t.bash[4] > prev) hits = t.bash[4]; prev = t.bash[4]; }
    P.x = pick.c[0] + 0.5; P.z = pick.c[1] + 0.5; P.vx = P.vz = 0; P.inv = 9; if (F.g[pick.w[1] * W + pick.w[0]] === 0) broke = k / 30; }
  return {broke, states: [...seen].sort(), hits, rec: (g.R.pk[g.R.depth] || []).some(q => q[0] === pick.w[0] && q[1] === pick.w[1])};
});
check(!wall.none, 'found a wall with a long way round to test against');
check(wall.states.includes(3) && wall.broke > 0, 'he beats on the wall between you and breaks through (' + (wall.hits + 1) + ' blows, ' + wall.broke.toFixed(1) + ' s)');
check(wall.rec, 'and the hole stays, like a pickaxe hole');

if (A.shots) {
  await pg.evaluate(() => { const g = window.__game, P = g.P, F = g.F, t = window.__setup();
    let s0;for (let y = 2; y < F.H - 2 && !s0; y++) for (let x = 2; x < F.W - 8; x++) { let ok = true; for (let k = 0; k < 7; k++) { const i = y * F.W + x + k; if (F.g[i] || F.safeMask[i]) ok = false; } if (ok) { s0 = [x, y]; break; } }
    P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.yaw = 0; P.pitch = 0.05; g.onTileChange(); t.x = P.x + 2.2; t.z = P.z; t.face = Math.PI; t.stun = 99; window.__t = t; });
  await shot('troll-walk');
  await pg.evaluate(() => { window.__t.state = 2; }); await shot('troll-club-up');
}
check(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
