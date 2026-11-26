// node tools/boss_test.mjs [--shots DIR] [--q low|medium|high]
// Checks the bosses: every fifth floor is an arena with the right boss in it, every boss fights (changes state, throws hazards at you,
// can hurt you), can be beaten, and beating one opens the way down, pays out and records a trophy. --shots saves a screenshot of each.
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

const where = await pg.evaluate(() => {
  const g = window.__game, out = [];
  for (const d of [4, 5, 6, 10, 15, 50, 55, 105]) { const a = g.bossAt(d); out.push([d, a ? a.i : -1, a ? a.cyc : -1]); }
  const F = g.genFloor('BOSS1', 5), m = F.shades.filter(s => s.type === 6);
  return {out, kind: F.kind, n: m.length, main: m.filter(s => s.role === 'main').length, others: F.shades.filter(s => s.type !== 6).length,
    shards: F.items.filter(i => i.type === 'shard').length, safe: !!F.safe, name: F.name, open: F.g.filter(v => v === 0).length,
    same: JSON.stringify(F.shades) === JSON.stringify(g.genFloor('BOSS1', 5).shades)};
});
check(JSON.stringify(where.out) === JSON.stringify([[4, -1, -1], [5, 0, 0], [6, -1, -1], [10, 1, 0], [15, 2, 0], [50, 9, 0], [55, 0, 1], [105, 0, 2]]), 'bosses guard floors 5, 10 ... 50, then come round again ' + JSON.stringify(where.out));
check(where.kind === 'arena' && where.main === 1 && where.others === 0 && where.shards === 0 && !where.safe && where.open > 180, 'floor 5 is an open arena (' + where.name + ') with only King Ratbag and his subjects in it');
check(where.same, 'the same arena for the same seed');

await pg.evaluate(() => {
  window.__arena = (i, cyc = 0) => {
    const g = window.__game;g.startRun('BOSSRUN', 5 * (i + 1) + 50 * cyc, true);const P = g.P, F = g.F;
    P.hp = 99; P.inv = 0; P.ward = 0; P.fuel = 100;
    return F; };
  window.__run = (n, fn) => { const g = window.__game; for (let k = 0; k < n; k++) { g.update(1 / 30); if (fn) fn(k); if (g.state === 'dead') break; } };
});
// every boss: wakes when you come close, does several different things, makes hazards, and lands a blow
const fights = await pg.evaluate(() => {
  const g = window.__game, out = [];
  for (let i = 0; i < 10; i++) {
    const F = window.__arena(i), P = g.P, m = g.bMain(), states = new Set(), kinds = new Set();let woke = false, hurt = 0, hz = 0;
    P.x = m.x; P.z = m.z + 3; g.onTileChange();
    let h0 = P.hp;
    window.__run(900, k => { if (P.hp < h0) hurt++; P.hp = 50; h0 = 50; if (g.BS.started) woke = true; states.add(m.state); for (const h of g.BS.hz) kinds.add(h.k); hz = Math.max(hz, g.BS.hz.length);
      if (k % 150 === 0) { P.x = m.x + Math.cos(k) * 2.2; P.z = m.z + Math.sin(k) * 2.2; P.x = Math.max(1.5, Math.min(F.W - 1.5, P.x)); P.z = Math.max(1.5, Math.min(F.H - 1.5, P.z)); g.onTileChange(); }
      if (g.BS.dance) for (const n of g.BS.dance.notes) n.j = n.j || null; });
    out.push({i, name: g.BOSSES[i].name, woke, states: [...states].sort((a, b) => a - b), kinds: [...kinds], hurtMe: hurt > 0, hurt, card: document.body.innerText.includes(g.BOSSES[i].name)});
    g.BS.dance = null;
  }
  return out;
});
for (const f of fights) check(f.woke && f.states.length >= (f.i === 1 ? 2 : 3) && (f.kinds.length >= 1 || f.i === 0) && (f.hurtMe || f.i === 1),
  f.name + ' wakes, fights (states ' + f.states + '; hazards ' + f.kinds + ') and hurts you (' + f.hurt + ' hits in 30 s)');

// a boss can be beaten: hit it until it falls; the way down opens, gems and a trophy
const win = await pg.evaluate(() => {
  const g = window.__game, out = [];
  localStorage.removeItem('emberdeep.trophies');
  for (const i of [0, 2, 5, 8, 9]) {
    const F = window.__arena(i), P = g.P;g.bossStart();const w0 = g.wallet;
    for (let k = 0; k < 4000 && !g.BS.won; k++) {
      P.hp = 99; P.inv = 0;
      const t = F.shades.find(s => s.type === 6 && !s.dead && s.x > 0 && (s.role === 'main' || s.role === 'part' || s.role === 'decoy'));
      if (t) g.wApply({i: F.shades.indexOf(t), d: 3}, g.potMe ? g.potMe() : 'me');
      g.update(1 / 30);
    }
    out.push({i, won: g.BS.won, shards: P.shards, gems: g.wallet - w0, parts: F.shades.filter(s => s.type === 6 && s.role === 'part').length});
  }
  return {out, tro: JSON.parse(localStorage.getItem('emberdeep.trophies') || '{}')};
});
for (const w of win.out) check(w.won && w.shards >= 3 && w.gems >= 20, 'boss ' + w.i + ' can be beaten: the seal breaks and it pays ' + w.gems + ' gems' + (w.parts ? ' (every piece of the Gloop had to die)' : ''));
check(Object.keys(win.tro).length === 5 && win.tro.rat && win.tro.rat.n === 1, 'each win records a trophy ' + JSON.stringify(win.tro));

// the Boogie Man: weapons do nothing, the dance does
const dance = await pg.evaluate(() => {
  const g = window.__game, F = window.__arena(1), P = g.P, m = g.bMain();g.bossStart();
  const hp0 = m.hp;g.wApply({i: F.shades.indexOf(m), d: 10}, 'me');const afterHit = m.hp;
  let started = false, t0 = 0;for (let k = 0; k < 200 && !g.BS.dance; k++) g.update(1 / 30);started = !!g.BS.dance;
  // press every note on time
  const D = g.BS.dance;let hits = 0;const real = performance.now;
  for (const n of D.notes.slice(0, 12)) { performance.now = () => (D.t0 + n.t) * 1000; if (g.danceKey(['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'][n.lane])) hits++; }
  // then miss the rest: the groove runs dry and he zaps you
  const hpB = P.hp;P.inv = 0;performance.now = () => (D.t0 + D.ch.len + 0.3) * 1000;g.update(1 / 30);const zapped = P.hp < hpB;
  performance.now = real;
  const moved = (() => { const x = P.x; g.update(1 / 30); return P.x !== x; })();
  return {hp0, afterHit, started, after: m.hp, hits, zapped, moved, judged: D.notes.filter(n => n.j === 'perfect').length};
});
check(dance.afterHit === dance.hp0, 'weapons do not hurt the Boogie Man');
check(dance.zapped, 'miss too many arrows and he zaps you');
check(dance.started && dance.judged >= 10 && dance.after < dance.hp0 - 20, 'a dance-off starts, and arrows hit on the beat hurt him (' + dance.hp0 + ' -> ' + dance.after + ')');
// tougher the second time round
const tough = await pg.evaluate(() => { const g = window.__game;const a = g.genFloor('X', 5).shades.find(s => s.role === 'main'), b = g.genFloor('X', 55).shades.find(s => s.role === 'main');return [a.hpMax, b.hpMax]; });
check(tough[1] > tough[0] * 1.5, 'the second time round a boss has more health (' + tough + ')');
// fists on a boss floor
const fist = await pg.evaluate(() => { const g = window.__game, F = window.__arena(0), P = g.P, m = g.bMain();g.smith.eq = '';P.x = m.x; P.z = m.z + 1.2; P.yaw = -Math.PI / 2; g.onTileChange(); const h = m.hp; g.W.cd = 0; g.wPunch(); return [h, m.hp]; });
check(fist[1] < fist[0], 'with no weapon you can still punch a boss (' + fist + ')');

if (A.shots) {
  for (let i = 0; i < 10; i++) {
    await pg.evaluate(i => { const g = window.__game, F = window.__arena(i), P = g.P, m = g.bMain(); g.bossStart(); P.x = m.x; P.z = m.z + 2.6; P.yaw = -Math.PI / 2; P.pitch = 0.05; g.onTileChange(); window.__run(i === 1 ? 110 : 40, () => { P.hp = 99; }); }, i);
    await shot('boss' + i);
  }
}
check(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
