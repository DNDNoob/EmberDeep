// node tools/crawl_test.mjs [--shots DIR]
// Checks the spider (floors ending in 9), the face slugs (floors ending in 4), Web-Be-Gone, and being downed in co-op:
// where they turn up, the web meter and its slowdown, being wrapped tight and eaten, the spider leveling up when killed or fed,
// slugs blinding you and being peeled off, a slug kill waking two more, and a downed player helped up onto half a heart.
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
  const g = window.__game, out = {spider: true, slug: true, none: true, det: true};
  for (let k = 0; k < 40; k++) for (const d of [3, 4, 9, 14, 19, 21, 24, 29, 34, 39]) {
    const seed = 'CR' + k, F = g.genFloor(seed, d);
    const sp = F.shades.filter(s => s.type === 10), sl = F.shades.filter(s => s.type === 8);
    if (d % 10 === 9 && !(sp.length === 1 && sp[0].lv === 1)) out.spider = false;
    if (d % 10 === 4 && !(sl.length === g.SLUG.pool && sl.filter(s => !s.pool).length === g.SLUG.start)) out.slug = false;
    if (d % 10 !== 9 && d % 10 !== 4 && (sp.length || sl.length)) out.none = false;
    if (k < 6 && JSON.stringify(F.shades.filter(s => s.type === 8 || s.type === 10)) !== JSON.stringify(g.genFloor(seed, d).shades.filter(s => s.type === 8 || s.type === 10))) out.det = false;
  }
  return out;
});
check(spawn.spider, 'every floor ending in 9 has one level-1 spider (9, 19, 29, 39: dark, cave and forest floors alike)');
check(spawn.slug, 'every floor ending in 4 has its slugs, from floor 4 on (the Backrooms on 4 and 24, the Archive on 14)');
check(spawn.none && spawn.det, 'no crawlers on other floors, and the same for a seed');

// the very first ones: floor 4 (the Backrooms) and floor 9, with the mobs just as the floor made them, from a real run
const first = await pg.evaluate(() => {
  const g = window.__game, P = g.P, out = {};
  for (const [d, type] of [[4, 8], [9, 10], [14, 8], [19, 10]]) {
    g.startRun('FIRST' + d, d, true);const F = g.F;
    const mine = F.shades.filter(s => s.type === type && !s.pool);
    const m = mine[0];if (!m) { out[d] = 'none'; continue; }
    for (const s of F.shades) if (s !== m && s.type !== 3) { s.x = s.z = -99; s.dead = true; }
    // stand two cells from it, somewhere open, and wait
    let spot = null;for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = Math.floor(m.x) + dx, z = Math.floor(m.z) + dz;
      if (x > 0 && z > 0 && x < F.W - 1 && z < F.H - 1 && !F.g[z * F.W + x] && !F.safeMask[z * F.W + x]) { spot = [x + 0.5, z + 0.5]; break; } }
    if (!spot) { out[d] = 'no spot'; continue; }
    P.x = spot[0]; P.z = spot[1]; P.hp = 9; P.inv = 0; P.web = 0; P.slugs = []; g.onTileChange();
    let got = false;for (let k = 0; k < 30 * 20 && !got; k++) { g.update(1 / 30); P.x = spot[0]; P.z = spot[1]; P.vx = P.vz = 0; P.hp = 9; got = type === 8 ? P.slugs.length > 0 : P.web > 5; }
    out[d] = (F.back ? 'back ' : F.archive ? 'archive ' : F.kind + ' ') + (got ? 'ok' : 'never reached you');
  }
  return out;
});
for (const d of [4, 9, 14, 19]) check(/ok$/.test(first[d]), 'floor ' + d + ': the ' + (d % 10 === 4 ? 'slugs' : 'spider') + ' turn up and come for you (' + first[d] + ')');

// a straight run of open floor to stand in, everything else cleared away
await pg.evaluate(() => { window.__setup = (depth, type) => {
  const g = window.__game, P = g.P;g.startRun('CRRUN', depth, true);const F = g.F;
  let s0;for (let y = 2; y < F.H - 2 && !s0; y++) for (let x = 2; x < F.W - 8; x++) { let ok = true; for (let k = 0; k < 7; k++) { const i = y * F.W + x + k; if (F.g[i] || F.safeMask[i]) ok = false; } if (ok) { s0 = [x, y]; break; } }
  P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.yaw = 0; P.pitch = 0; P.hp = 3; P.inv = 0; P.ward = 0; P.web = 0; P.slugs = []; P.ko = 0; P.half = false; g.onTileChange(); window.__s0 = s0;
  const mine = F.shades.filter(s => s.type === type);
  for (const s of F.shades) if (s.type !== type) { s.x = s.z = -99; s.dead = true; }
  return mine; }; });

const sp = await pg.evaluate(() => {
  const g = window.__game, P = g.P, [s] = window.__setup(9, 10), s0 = window.__s0;
  s.x = P.x + 2; s.z = P.z; s.state = 0; s.stun = 0; s.calm = 0;
  const hold = () => { P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.vx = P.vz = 0; P.inv = 99; P.hp = 3; P.fuel = 100; };   // nothing else gets to hurt you here
  let webbed = -1, mul = 1, used = true, states = new Set(), hud = '';
  for (let k = 0; k < 30 * 70 && g.state === 'play'; k++) { g.update(1 / 30); hold(); states.add(s.state);
    if (webbed < 0 && P.web > 0) webbed = k / 30;
    if (P.web > 40 && P.web < 60) { mul = g.webMul(); hud = g.crawl.el.textContent; }
    if (P.web >= 100) used = used && !g.canUse?.(); }
  return {webbed, mul, hud, states: [...states].sort(), state: g.state, lv: s.lv, web: P.web};
});
check(sp.webbed > 0, 'the spider runs you down and starts spinning (after ' + sp.webbed.toFixed(1) + ' s)');
check(sp.mul < 0.8 && /Webbed/.test(sp.hud), 'half-webbed you are much slower (x' + sp.mul.toFixed(2) + '), and the meter says so: ' + sp.hud);
check(sp.states.includes(2) && sp.states.includes(3) && sp.states.includes(4), 'wrapped tight, it goes off and comes back for you (states ' + sp.states + ')');
check(sp.state === 'dead' && sp.lv === 6, 'and eats you: the run ends and it gains five levels (now ' + sp.lv + ', ' + sp.state + ', web ' + Math.round(sp.web) + ', states ' + sp.states + ')');

const pot = await pg.evaluate(() => {
  const g = window.__game, P = g.P, [s] = window.__setup(9, 10);
  s.x = s.z = -99; s.dead = true; P.web = 70;
  g.potLand({id: 31, w: 'd', x: P.x, z: P.z, by: 'me'}, true); const drunk = P.web;
  P.web = 100; const locked = g.webMul();
  const pt = g.potions ? 1 : 0;
  return {drunk, locked, name: (window.__game.POTIONS || [])[31]?.name};
});
check(pot.drunk === 0, 'Web-Be-Gone dissolves the webs');
check(pot.locked < 0.3, 'wrapped tight you barely move at all');

const kill = await pg.evaluate(() => {
  const g = window.__game, P = g.P, [s] = window.__setup(19, 10);
  s.x = P.x + 1; s.z = P.z; s.stun = 5; const i = g.F.shades.indexOf(s), hp0 = s.hpMax || 0;
  g.wApply({i, d: 999}, 'me'); const down = s.down > 0, lv = s.lv;
  for (let k = 0; k < 30 * 6; k++) g.update(1 / 30);
  return {down, lv, back: s.x > 0, hp: s.hp};
});
check(kill.down && kill.lv === 2 && kill.back, 'killed, it comes back somewhere else a level higher (level ' + kill.lv + ')');

const sl = await pg.evaluate(() => {
  const g = window.__game, P = g.P, all = window.__setup(14, 8), s0 = window.__s0;
  const out = all.filter(s => !s.pool); for (const s of out.slice(1)) { s.x = s.z = -99; s.pool = 1; }
  const s = out[0]; s.x = P.x + 1.2; s.z = P.z; s.stun = 0; s.calm = 0;
  let on = false;for (let k = 0; k < 30 * 8 && !on; k++) { g.update(1 / 30); P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; on = P.slugs.length > 0; }
  for (let k = 0; k < 5; k++) g.update(1 / 30);
  const blind = +g.crawl.slug.style.opacity, hud = g.crawl.el.textContent;
  const peeled = g.slugPeel(), back = s.x > 0 && s.stun > 0;
  const live0 = all.filter(q => !q.pool && !q.ride).length;
  g.wApply({i: g.F.shades.indexOf(s), d: 999}, 'me');
  const live1 = all.filter(q => !q.pool && !q.ride && q.x > 0).length;
  return {on, blind, hud, peeled, back, live0, live1, left: P.slugs.length};
});
check(sl.on && sl.blind > 0.8, 'a slug crawls up onto your face and you cannot see (' + sl.hud + ')');
check(sl.peeled && sl.left === 0 && sl.back, 'pressing the button peels it off, and it lands dazed in front of you');
check(sl.live1 === sl.live0 + 1, 'kill one and two more crawl out (' + sl.live0 + ' -> ' + sl.live1 + ')');
const many = await pg.evaluate(() => {
  const g = window.__game, F = g.F;
  for (let k = 0; k < 40; k++) { const s = F.shades.find(q => q.type === 8 && !q.pool && !q.ride && q.x > 0); if (!s) break; g.wApply({i: F.shades.indexOf(s), d: 999}, 'me'); }
  const live = F.shades.filter(q => q.type === 8 && !q.pool && !q.ride && q.x > 0).length, n = F.shades.length;
  g.MP.guest = true; g.MP.hostId = 'h'; const wj = g.MP.wantJoin; g.MP.wantJoin = true; F.shades.length = n - 5; g.MP.peers.set('h', {id: 'h', run: true, d: g.R.depth});
  g.mpRecv({k: 'slx', d: g.R.depth, n}, 'h'); const synced = F.shades.length === n;
  g.MP.guest = false; g.MP.hostId = null; g.MP.wantJoin = wj; g.MP.peers.delete('h');
  return {live, synced};
});
check(many.live > 30, 'no limit: forty kills later there are ' + many.live + ' slugs out');
check(many.synced, 'the others are told about the new ones');
const pile = await pg.evaluate(() => {
  const g = window.__game, P = g.P, F = g.F, s0 = window.__s0;P.slugs = [];P.inv = 0;
  const out = F.shades.filter(q => q.type === 8 && !q.pool && !q.ride).slice(0, 6);
  for (const q of out) { q.x = P.x + 0.3; q.z = P.z; q.stun = 0; q.calm = 0; }
  for (let k = 0; k < 30 * 3; k++) { g.update(1 / 30); P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.inv = 0; }
  const n = P.slugs.length;P.slugs = [];return n;
});
check(pile > 3, 'no limit on your face either: ' + pile + ' slugs piled on at once');
await shot('slug');

const ko = await pg.evaluate(() => {
  const g = window.__game, P = g.P, MP = g.MP;window.__setup(3, 99);
  MP.on = true; const pal = {id: 'pal', name: 'Pal', run: true, down: false, d: g.R.depth, x: P.x + 0.8, z: P.z, seen: performance.now(), col: [1, 1, 1]};MP.peers.set('pal', pal);
  P.hp = 1; P.inv = 0; g.hurt(null); const down = P.ko > 25 && g.state === 'play' && !P.down;
  for (let k = 0; k < 30 * 3; k++) { pal.seen = performance.now(); g.update(1 / 30); }
  const ticking = P.ko < 28 && P.ko > 25, hud = g.crawl.el.textContent;
  g.mpRecv({k: 'kup', d: g.R.depth}, 'pal'); const up = !P.ko && P.half && P.hp === 1, mul = g.webMul();
  g.drawHUD && g.drawHUD(); const half = document.getElementById('hearts').innerHTML.includes('half');
  P.hp = 2; g.update(1 / 30); const healed = !P.half && P.hp === 1;
  P.inv = 0; g.hurt(null); const again = P.ko > 0;
  for (let k = 0; k < 30 * 32; k++) { pal.seen = performance.now(); g.update(1 / 30); }
  const out = P.down;
  MP.peers.delete('pal'); MP.on = false; P.down = false;
  window.__setup(3, 99); P.hp = 1; P.inv = 0; g.hurt(null); const solo = g.state === 'dead';
  return {down, ticking, hud, up, mul, half, healed, again, out, solo};
});
check(ko.down && ko.ticking, 'in co-op your last heart puts you down, not out (' + ko.hud + ')');
check(ko.up && ko.mul < 0.5, 'a friend helps you up on half a heart, and you limp');
check(ko.half, 'the hearts show half a heart');
check(ko.healed, 'healing gets you walking properly again');
check(ko.again && ko.out, 'nobody comes in 30 s, and you are out like before');
check(ko.solo, 'playing alone, your last heart still ends the run');

check(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
