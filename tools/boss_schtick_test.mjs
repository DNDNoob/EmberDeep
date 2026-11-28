// node tools/boss_schtick_test.mjs [--shots DIR]
// Every boss but the Boogie Man has a trick: weapons barely scratch it while it is guarded, and working its trick (cheese in a trap,
// a heat lamp, a brine barrel, an open window, the shell game, a bowling ball, a gong, the cranks, a floodgate) lands a heavy blow
// and leaves it stunned and open. --shots saves a screenshot of each trick at work.
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
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

await pg.evaluate(() => {
  window.__arena = i => { const g = window.__game;g.startRun('SCH', 5 * (i + 1), true);const P = g.P;P.hp = 99;P.inv = 0;g.bossStart();for (let k = 0; k < 3; k++) g.update(1 / 30);return g.F; };
  window.__run = n => { const g = window.__game; for (let k = 0; k < n; k++) { g.P.hp = 99; g.P.inv = 0; g.update(1 / 30); } };
  window.__me = () => (window.__game.MP.on ? window.__game.MP.id : 'me');
});
const r = await pg.evaluate(() => {
  const g = window.__game, out = {};
  const blow = (i, setup, n = 150) => { const F = window.__arena(i), m = g.bMain();m.stun = 0;
    // armor: a weapon blow on the guarded boss
    const h0 = m.hp;g.wApply({i: F.shades.indexOf(m), d: 10}, 'me');const armor = h0 - m.hp;m.hp = h0;
    const before = m.hp;setup(F, m);window.__run(n);return {armor: +armor.toFixed(2), blow: +((before - m.hp) / m.hpMax).toFixed(3), stun: +m.stun.toFixed(1), open: g.bossArmor(m)}; };
  const prop = k => g.BP.props.filter(p => p.kind === k);
  // the rat: cheese in a trap
  out.rat = blow(0, (F, m) => { const t = prop('trap')[0];g.BP.items.push({id: 99, kind: 'cheese', x: 0, z: 0, holder: window.__me()});g.bpAct(t.i, window.__me());m.x = t.x + 2;m.z = t.z;m.state = 1; }, 120);
  // the gloop: lands under a lit lamp
  out.gloop = blow(2, (F, m) => { const l = prop('lamp')[0];g.bpAct(l.i, window.__me());m.x = l.x + 0.3;m.z = l.z;m.state = 2;m.t = 0.05;m.vx = m.vz = 0; }, 20);
  // the dill: brine on the floor
  out.dill = blow(3, (F, m) => { const br = prop('barrel')[0];g.bpAct(br.i, window.__me());const h = g.BS.hz.find(q => q.brine);m.x = h.x;m.z = h.z; }, 10);
  // Mother Tallow: an open window's draft
  out.tallow = blow(4, (F, m) => { const w = prop('window')[0];g.bpAct(w.i, window.__me());m.x = w.x + w.ex * 3;m.z = w.z; }, 10);
  // the mimic: found in the shell game
  out.mimic = blow(5, (F, m) => { m.state = 6;m.t = 5;const h = m.hp;g.wApply({i: F.shades.indexOf(m), d: 1}, 'me'); }, 10);
  // the vacuum: a bowling ball held in his suction
  out.vac = blow(6, (F, m) => { const P = g.P;g.BP.items.push({id: 98, kind: 'ball', x: 0, z: 0, holder: window.__me()});P.x = m.x + 3;P.z = m.z;m.face = 0;m.state = 3;m.t = 3;g.onTileChange(); }, 5);
  // the mime: the gong right beside him
  out.mime = blow(7, (F, m) => { const gg = prop('gong')[0];m.x = gg.x + 1;m.z = gg.z;g.bpAct(gg.i, window.__me()); }, 3);
  // the clock: all three cranks wound
  out.cuckoo = blow(8, (F, m) => { for (const c of prop('crank')) for (let k = 0; k < 3; k++) g.bpAct(c.i, window.__me()); }, 5);
  // the heart: over a grate when its floodgate opens
  out.heart = blow(9, (F, m) => { const gr = prop('grate')[0], lv = prop('lever').find(q => q.ex === gr.ex);m.x = gr.x;m.z = gr.z;m.stun = 99;g.bpAct(lv.i, window.__me()); }, 60);
  // the rat ignores you for the cheese
  { const F = window.__arena(0), m = g.bMain(), t = g.BP.props.find(p => p.kind === 'trap');t.st = 1;m.x = t.x + 3;m.z = t.z;m.state = 1;g.P.x = m.x;g.P.z = m.z - 2;const d0 = Math.hypot(m.x - t.x, m.z - t.z);window.__run(20);out.ratSeeks = [d0, Math.hypot(m.x - t.x, m.z - t.z)]; }
  // pickups appear, and you take one by walking over it
  { const F = window.__arena(0);window.__run(250);const it = g.BP.items.find(q => !q.holder);out.items = g.BP.items.length;if (it) { g.P.x = it.x;g.P.z = it.z;g.onTileChange();window.__run(2); }out.carry = g.BP.carry; }
  return out;
});
for (const k of ['rat', 'gloop', 'dill', 'tallow', 'mimic', 'vac', 'mime', 'cuckoo', 'heart']) {
  const v = r[k];check(v.armor < 1 && v.blow >= 0.1 && v.stun > 0 && v.open >= 1, k + ': weapons barely scratch it (' + v.armor + ' of 10), its trick lands ' + Math.round(v.blow * 100) + '% and opens it to full damage (' + JSON.stringify(v) + ')');
}
check(r.ratSeeks[1] < r.ratSeeks[0] - 1, 'King Ratbag goes for a baited trap (' + r.ratSeeks.map(x => x.toFixed(1)) + ' m)');
check(r.items > 0 && r.carry === 'cheese', 'cheese turns up, and you pick it up by walking over it (' + r.items + ', ' + r.carry + ')');
if (A.shots) {
  for (const i of [0, 2, 3, 4, 6, 7, 8, 9]) {
    await pg.evaluate(i => { const g = window.__game, F = window.__arena(i), m = g.bMain(), P = g.P;for (const p of g.BP.props) { if (p.kind !== 'grate') g.bpAct(p.i, window.__me()); }
      P.x = F.W / 2;P.z = F.H - 3;P.yaw = -Math.PI / 2;P.pitch = -0.1;g.onTileChange();window.__run(20); }, i);
    await pg.waitForTimeout(600);await pg.screenshot({path: resolve(A.shots, 'trick' + i + '.png')});
  }
}
check(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
