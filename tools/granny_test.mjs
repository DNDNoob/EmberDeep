// node tools/granny_test.mjs [--shots DIR]
// Checks Granny (creature type 5): she turns up on about one floor in twenty without moving anything else, calls out for sugar,
// shuffles after you, puffs perfume that makes you woozy, kisses you for a heart, and can be beaten. --shots saves screenshots.
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
  const g = window.__game;let n = 0, has = 0, det = true, far = true;
  for (let k = 0; k < 800; k++) { const seed = 'GR' + k, d = 1 + (k % 12), F = g.genFloor(seed, d); if (F.back) continue; n++;
    const f = F.shades.filter(s => s.type === 5);
    if (f.length) { has++; if (F.dist[Math.floor(f[0].z) * F.W + Math.floor(f[0].x)] <= 12) far = false; }
    if (JSON.stringify(f) !== JSON.stringify(g.genFloor(seed, d).shades.filter(s => s.type === 5))) det = false; }
  return {n, has, det, far};
});
check(spawn.has / spawn.n > 0.03 && spawn.has / spawn.n < 0.075, 'Granny turns up on about one floor in twenty (' + spawn.has + ' of ' + spawn.n + ')');
check(spawn.det && spawn.far, 'always the same floors for a seed, and she starts far from you');

await pg.evaluate(() => { window.__setup = () => {
  const g = window.__game, P = g.P;g.startRun('GRRUN', 2, true);const F = g.F;
  let s0;for (let y = 2; y < F.H - 2 && !s0; y++) for (let x = 2; x < F.W - 8; x++) { let ok = true; for (let k = 0; k < 7; k++) { const i = y * F.W + x + k; if (F.g[i] || F.safeMask[i]) ok = false; } if (ok) { s0 = [x, y]; break; } }
  P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.yaw = 0; P.pitch = 0; P.hp = 3; P.inv = 0; P.ward = 0; g.onTileChange(); window.__s0 = s0;
  for (const s of F.shades) { s.x = s.z = -99; s.dead = true; }
  const f = {type: 5, x: P.x + 4, z: P.z, gx: s0[0] + 4, gy: s0[1], px: -1, py: -1, state: 0, stun: 0, think: 0, vis: false, frozen: false, ph: 0, d: 99, snd: 0, ft: 0, fs: 0, say: 0.1};
  F.shades.push(f); window.__f = f;
  return f; }; });
const r = await pg.evaluate(() => {
  const g = window.__game, P = g.P, f = window.__setup(), s0 = window.__s0;
  const seen = new Set();let wooze = 0, hurtAt = -1, toast = '', hugged = false;
  for (let k = 0; k < 450; k++) { g.update(1 / 30); seen.add(f.state); wooze = Math.max(wooze, g.P.woozy || 0); if (!toast && /sugar/.test(document.getElementById('toast').textContent)) toast = document.getElementById('toast').textContent; if (g.P.hug) hugged = true; if (hurtAt < 0 && g.P.hp < 3) hurtAt = k / 30; if (!g.P.hug) { P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; } }
  return {hugged, states: [...seen].sort(), wooze, hurtAt, toast, dist: Math.hypot(f.x - P.x, f.z - P.z)};
});
check(/Come give granny some sugar/.test(r.toast), 'she calls out: ' + r.toast);
check(r.states.includes(1) && r.states.includes(2), 'she comes for you and puffs her perfume (states ' + r.states + ')');
check(r.wooze > 3, 'the perfume makes you woozy');
check(r.hugged, 'she grabs you in a hug when she reaches you');
check(r.hurtAt > 0, 'if you do not struggle, she smothers you (after ' + r.hurtAt.toFixed(1) + ' s)');
const mash = await pg.evaluate(() => {
  const g = window.__game, f = window.__setup(), P = g.P; P.hp = 3; P.inv = 0; P.hug = null; f.down = 0; f.dead = false; f.stun = 0; f.state = 1; f.ft = 0; f.calm = 0;
  f.x = P.x + 0.3; f.z = P.z; P.woozy = 0;
  let grabbed = false;for (let k = 0; k < 30 && !P.hug; k++) g.update(1 / 30); grabbed = !!P.hug; const fs = f.state;
  // struggle: about five clicks a second
  for (let k = 0; k < 120 && P.hug; k++) { if (k % 6 === 0) { const e = new MouseEvent('mousedown', {button: 0}); g.grannyMash(); } g.update(1 / 30); }
  return {grabbed, fs, free: !P.hug, hp: P.hp, gstate: f.state, gstun: f.stun};
});
check(mash.grabbed && mash.fs === 3, 'grabbed: she holds you (and you cannot move)');
check(mash.free && mash.hp === 3 && mash.gstun > 0, 'clicking fast enough breaks you free, unharmed, and leaves her staggered');
const wz = await pg.evaluate(() => { const g = window.__game, P = g.P; window.__setup(); window.__f.x = -99; window.__f.dead = true; P.woozy = 5; const y0 = P.yaw; const m0 = g.P.woozy; for (let k = 0; k < 30; k++) g.update(1 / 30); return {drift: Math.abs(P.yaw - y0), left: P.woozy}; });
check(wz.drift > 0.05 && wz.left < 5, 'woozy: your view drifts, and it wears off');
const far = await pg.evaluate(() => { const g = window.__game, f = window.__setup(); g.P.woozy = 0; f.state = 2; f.ft = 0.9; f.puffed = false; f.stun = 0; f.x = g.P.x + 3.5; f.z = g.P.z; for (let k = 0; k < 30; k++) g.update(1 / 30); return g.P.woozy; });
check(far === 0, 'the perfume only reaches those close to her');
const kill = await pg.evaluate(() => {
  const g = window.__game, f = window.__setup(), P = g.P; g.smith.own.hammer = true; g.smith.eq = 'hammer'; g.smith.p1.hammer = 0; g.smith.p2.hammer = -1; g.smith.xp.hammer = g.wXpFor(8);
  let n = 0; while (!(f.down > 0) && n++ < 20) { f.x = P.x + 1; f.z = P.z; f.stun = 0; f.state = 0; f.ft = 5; P.yaw = 0; g.W.cd = 0; g.wAttack(); }
  return {down: f.down > 0, n};
});
check(kill.down, 'she can be beaten off (' + kill.n + ' blows of a maul)');

await pg.evaluate(() => { const g = window.__game, f = window.__setup(), P = g.P; P.woozy = 0; f.down = 0; f.dead = false; f.x = P.x + 1.3; f.z = P.z; f.stun = 0; P.yaw = 0; P.pitch = -0.1; g.smith.eq = '';
  window.__hold = setInterval(() => { f.state = 1; f.ft = 99; f.x = P.x + 1.3; f.z = P.z; }, 10); });
await shot('01-granny-coming');
await pg.evaluate(() => { clearInterval(window.__hold); const g = window.__game, f = window.__f, P = g.P; window.__hold = setInterval(() => { f.state = 2; f.ft = 99; f.puffed = true; f.x = P.x + 1.3; f.z = P.z; }, 10); P.woozy = 4; });
await shot('02-granny-perfume');
await pg.evaluate(() => { clearInterval(window.__hold); const g = window.__game, f = window.__f, P = g.P; P.woozy = 0; f.down = 0; f.dead = false; f.stun = 0; f.x = P.x + 0.42; f.z = P.z; f.face = Math.PI; window.__hold = setInterval(() => { f.state = 3; f.ft = 99; }, 10); P.hug = {i: g.F.shades.indexOf(f), t: 2.2, prog: 0.45, last: 0.1}; P.pitch = 0; });
await shot('03-hugged');
await pg.evaluate(() => { clearInterval(window.__hold); window.__game.P.hug = null; });
check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
