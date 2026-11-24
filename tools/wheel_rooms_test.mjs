// node tools/wheel_rooms_test.mjs [--q low|medium|high]
// "The wheel waits outside the door": a player behind a strange door is never touched by the wheel. Results are queued and replayed in
// order on the way out, effect clocks pause, floor creatures skip the player, roulette seats only people in the maze, and the new
// multiplayer flag bits do not collide with `unseen`.
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = {q: 'low'};
for (let i = 2; i < process.argv.length; i++) A[process.argv[i].replace(/^--/, '')] = process.argv[++i];
const b = await chromium.launch();
const pg = await (await b.newContext({viewport: {width: 1280, height: 720}})).newPage(), errs = [];
pg.setDefaultTimeout(600000);
pg.on('pageerror', e => errs.push(String(e)));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.addInitScript(q => { localStorage.setItem('emberdeep.quality', JSON.stringify(q)); localStorage.setItem('emberdeep.wallet', '200'); }, A.q);
await pg.goto(pathToFileURL(resolve(root, 'index.html')).href);
await pg.waitForFunction(() => window.__game && window.__game.startRun, null, {timeout: 120000});
const frames = n => pg.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

await pg.evaluate(() => {
  const g = window.__game;
  for (const seed of ['WHEEL1', 'WHEEL2', 'WHEEL3', 'WHEEL4']) { g.startRun(seed, 2, true); if (g.F.safe && g.F.safe.wheel) break; }
  const w = g.F.safe.wheel, P = g.P;
  P.x = w.x + w.nx * 1.25; P.z = w.z + w.nz * 1.25; P.yaw = Math.atan2(w.z - P.z, w.x - P.x); g.onTileChange();
  // land a given slice as if someone else spun it
  window.__land = (i, by = 'Aaron', mine = false, coin = 0) => {
    const W = g.wof, TAU = Math.PI * 2, S = TAU / 22, a = W.angle, base = a - (((a % TAU) + TAU) % TAU) + TAU * 6;
    W.done = true;
    g.wofBegin({d: g.R.depth, i, c: coin, a0: a, a1: base + i * S + 0.18, dur: 12, n: by}, mine);
    W.t = W.plan.dur + 1; g.update(0.016);
  };
  window.__reset = () => { g.fx.curl = 0; g.fx.plague = 0; g.wofQ.length = 0; g.wofClear(); g.fx.moon = g.fx.fat = g.fx.pug = g.fx.rat = g.fx.tin = g.fx.loud = g.fx.bob = g.fx.pox = g.fx.hedge = 0; g.fx.frozen = null; g.fx.dying = false; g.wofQ.length = 0; g.P.away = false; g.P.down = false; g.P.hp = 3; };
});

// 1. a result that lands behind a door is queued, not applied; it replays on the way out
await pg.evaluate(() => { const g = window.__game; window.__reset(); g.P.away = true; window.__land(14); });
let r = await pg.evaluate(() => { const g = window.__game; return {moon: g.fx.moon, q: g.wofQ.map(q => q.i), ann: !!document.querySelector('#announce.on, #announce:not([hidden])') && document.getElementById('announce').textContent}; });
check(r.moon === 0 && r.q.length === 1 && r.q[0] === 14, 'Moonwalk landed behind a door is queued, not applied (' + JSON.stringify(r.q) + ')');
await pg.evaluate(() => { const g = window.__game; g.P.away = false; for (let i = 0; i < 60 * 3; i++) g.update(1 / 60); });
await pg.waitForTimeout(2200);
r = await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 3; i++) g.update(1 / 60); return {moon: g.fx.moon, q: g.wofQ.length}; });
check(r.moon > 50 && r.q === 0, 'back in the maze the queued Moonwalk happens (' + r.moon.toFixed(0) + ' s left)');

// order, spacing and the cap of three
await pg.evaluate(() => { const g = window.__game; window.__reset(); g.P.away = true; for (const i of [2, 3, 4, 15]) window.__land(i); });
r = await pg.evaluate(() => window.__game.wofQ.map(q => q.i));
check(r.join() === '3,4,15', 'only the three most recent results are kept (' + r.join() + ')');
await pg.evaluate(() => { const g = window.__game; g.P.away = false; for (let i = 0; i < 60 * 2; i++) g.update(1 / 60); });
await pg.waitForTimeout(2000);
r = await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 1; i++) g.update(1 / 60); return {rat: g.fx.rat > 0, fat: g.fx.fat > 0, bob: g.fx.bob > 0, left: g.wofQ.length}; });
check(r.rat && !r.fat && !r.bob && r.left === 2, 'replays are spaced out, oldest first (' + JSON.stringify(r) + ')');
await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 9; i++) g.update(1 / 60); });
await pg.waitForTimeout(2000);
await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 9; i++) g.update(1 / 60); });
await pg.waitForTimeout(2000);
r = await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60; i++) g.update(1 / 60); return {fat: g.fx.fat > 0, bob: g.fx.bob > 0, left: g.wofQ.length}; });
check(r.fat && r.bob && r.left === 0, 'all of them eventually play (' + JSON.stringify(r) + ')');
// the queue is cleared by wofClear
await pg.evaluate(() => { const g = window.__game; window.__reset(); g.P.away = true; window.__land(3); g.P.away = false; });
await pg.evaluate(() => window.__game.wofClear());
check(await pg.evaluate(() => window.__game.wofQ.length === 0), 'wofClear empties the queue');

// 2. effect clocks pause while away
r = await pg.evaluate(() => { const g = window.__game; window.__reset(); g.fx.fat = 100; g.fx.moon = 50; g.P.away = true; for (let i = 0; i < 60 * 5; i++) g.update(1 / 60); const a = {fat: g.fx.fat, moon: g.fx.moon}; g.P.away = false; for (let i = 0; i < 60 * 5; i++) g.update(1 / 60); return {a, fat: g.fx.fat}; });
check(r.a.fat === 100 && r.a.moon === 50, 'effect clocks stand still while away');
check(r.fat < 96, 'and resume when you step out (' + r.fat.toFixed(1) + ')');
// plague cough damage waits too
r = await pg.evaluate(() => { const g = window.__game; window.__reset(); g.fx.dying = true; g.fx.dyT = 0.2; g.P.away = true; const hp = g.P.hp; for (let i = 0; i < 60 * 3; i++) g.update(1 / 60); const kept = g.P.hp === hp && g.fx.dying; g.P.away = false; return kept; });
check(r, 'plague damage does not tick while away');
// hearing aids and tinnitus muted while away (the gain target)
r = await pg.evaluate(() => { const g = window.__game; window.__reset(); g.fx.loud = 30; g.fx.loudN = 2; g.P.away = true; g.wofTick(0.016); return {awayOff: !document.body.classList.contains('hedgehog')}; });
check(r.awayOff, 'wheel body state is switched off while away');
await pg.evaluate(() => { window.__reset(); });

// 3. the Tickle Monster does not go after a player behind a door
r = await pg.evaluate(() => {
  const g = window.__game, w = g.F.safe.wheel; window.__reset(); g.wofClear(); g.fx.tickled = 0;
  g.P.x = w.x + w.nx * 1.3; g.P.z = w.z + w.nz * 1.3; g.P.away = true;
  window.__land(10);   // he arrives next to the wheel while you are behind a door
  const T = g.tk; if (!T) return {none: true};
  T.pause = 0;
  const x0 = T.x, z0 = T.z; let caught = false;
  for (let i = 0; i < 60 * 8; i++) { g.update(1 / 60); if (g.fx.tickled > 0) caught = true; }
  const moved = Math.hypot(T.x - x0, T.z - z0);
  g.P.away = false;
  return {caught, moved, tg: T.tg};
});
check(!r.none && !r.caught && r.moved < 0.5, 'Tickle Monster: ignores a player behind a door and loiters (moved ' + (r.moved || 0).toFixed(2) + ' m)');
r = await pg.evaluate(() => { const g = window.__game, T = g.tk; let caught = false; T.pause = 0; for (let i = 0; i < 60 * 12; i++) { g.update(1 / 60); if (g.fx.tickled > 0) { caught = true; break; } } return caught; });
check(r, 'Tickle Monster: goes for the player again once they are back in the maze');
// a peer who is away is skipped too, an in-maze peer is not
r = await pg.evaluate(() => {
  const g = window.__game; window.__reset(); g.wofClear(); g.MP.on = true;
  const f = away => g.mpRecv({k: 'p', d: g.R.depth, a: [g.P.x + 3, g.P.z, 0, 0, 0, 80, 4 | (away ? 8 : 0), 3]}, 'pal');
  f(true); const awayList = g.tkTargets().map(q => q.id); f(false); const upList = g.tkTargets().map(q => q.id);
  g.MP.on = false; g.MP.peers.clear();
  return {awayList, upList};
});
check(!r.awayList.includes('pal') && r.upList.includes('pal') && r.upList.includes('me'), 'Tickle targets skip an away peer (' + JSON.stringify(r) + ')');

// 4. a bomb does not throw a player behind a door
r = await pg.evaluate(() => {
  const g = window.__game; window.__reset(); g.wofClear(); const w = g.F.safe.wheel;
  g.P.x = w.x + w.nx * 2; g.P.z = w.z + w.nz * 2; g.P.away = true; window.__land(21);
  for (let i = 0; i < 60 * 8; i++) g.update(1 / 60);
  const flew = g.fx.flyT > 0, pat = g.F.npcs.find(n => n.type === 'pat'), scorch = !!g.bomb || true;
  g.P.away = false; return {flew, vx: Math.hypot(g.P.vx, g.P.vz)};
});
check(!r.flew, 'Bomb: a player behind a door is not thrown');

// 5. Russian roulette seats only players in the maze
r = await pg.evaluate(() => {
  const g = window.__game; window.__reset(); g.wofClear(); g.MP.on = true; g.MP.host = true;
  const f = (id, away) => g.mpRecv({k: 'p', d: g.R.depth, a: [g.P.x + 1, g.P.z, 0, 0, 0, 80, 4 | (away ? 8 : 0), 3]}, id);
  f('here', false); f('gone', true);
  g.P.away = false; g.rrStart();
  const seats = g.rr && g.rr.seats.map(s => s.id).sort();
  g.rr = null; g.fx.frozen = null; if (g.brk && g.brk.active) g.brk.stop(true);
  return {seats};
});
check(r.seats && r.seats.length === 2 && !r.seats.includes('gone') && r.seats.includes('here'), 'Roulette: the away peer is not seated (' + JSON.stringify(r.seats) + ')');
r = await pg.evaluate(() => {
  const g = window.__game; g.P.away = true; g.rrStart();
  const seats = g.rr && g.rr.seats.map(s => s.id); const frozen = g.fx.frozen, brk = !!(g.brk && g.brk.active);
  g.rr = null; g.fx.frozen = null; g.P.away = false; return {seats, frozen, brk};
});
check(r.seats && !r.seats.includes('me') && !r.seats.includes(undefined) && !r.frozen && !r.brk && r.seats.length === 1, 'Roulette: an away host runs the table but does not sit, and nothing opens (' + JSON.stringify(r) + ')');
r = await pg.evaluate(() => {
  const g = window.__game; g.MP.peers.delete('here'); g.mpRecv({k: 'p', d: g.R.depth, a: [g.P.x + 1, g.P.z, 0, 0, 0, 80, 4 | 8, 3]}, 'gone');
  g.P.away = true; g.rrStart(); const none = !g.rr; g.P.away = false; return none;
});
check(r, 'Roulette: with nobody in the maze there is no game');
// a guest who is away and hears the table: nothing opens, a note waits for them
r = await pg.evaluate(() => {
  const g = window.__game; window.__reset(); g.MP.host = false; g.MP.guest = true; g.MP.wantJoin = true; g.MP.hostId = 'host'; g.P.away = true;
  const s = {seats: [{id: 'host', name: 'H', col: [1, 1, 1]}], n: 3, live: 1, pos: 0, turn: 0, spun: false, phase: 'aim', phT: 25, ver: 1, loser: -1, ev: 'deal'};
  g.mpRecv({k: 'rr', s}, 'host');
  const opened = !!(g.brk && g.brk.active) || g.fx.frozen === 'roulette';
  g.mpRecv({k: 'rr', s: {...s, phase: 'end', ver: 9, ev: 'end'}}, 'host');
  const q = g.wofQ.map(x => x.msg);
  g.MP.guest = false; g.MP.wantJoin = false; g.MP.on = false; g.MP.peers.clear(); g.P.away = false; return {opened, q};
});
check(!r.opened && r.q.length === 1 && /missed a round of Russian roulette/.test(r.q[0] || ''), 'Roulette: an away guest is not pulled in and is told afterwards (' + JSON.stringify(r) + ')');

// 6. nothing can freeze you or open a break behind a door
r = await pg.evaluate(() => { const g = window.__game; window.__reset(); g.P.away = true; window.__land(0, 'Me', true); const f = g.fx.frozen, brk = !!(g.brk && g.brk.active); g.P.away = false; return {f, brk, q: g.wofQ.length}; });
check(!r.f && !r.brk && r.q === 1, 'Walmart landed behind a door freezes nothing (queued)');
await pg.evaluate(() => { window.__reset(); });

// 7. position flags: what is sent decodes to the same thing, and nothing collides with `unseen` (32) or the older flags (1..16)
const rt = await pg.evaluate(() => {
  const g = window.__game, out = {}; g.MP.on = true;
  const cases = {
    pug: f => f.pug = 100, rat: f => f.rat = 100, plague: f => f.plague = 100, hedge: f => f.hedge = 100, curl1: f => { f.hedge = 100; f.curl = 1; },
    curl2: f => { f.hedge = 100; f.curl = 2; }, fat: f => f.fat = 100, pox: f => f.pox = 100, bob: f => f.bob = 100, frozen: f => f.frozen = 'x', none: () => {}};
  for (const [name, set] of Object.entries(cases)) {
    window.__reset(); set(g.fx); g.P.unseen = false;
    const flags = g.mpPosFlags(); g.mpRecv({k: 'p', d: g.R.depth, a: [1, 1, 0, 0, 0, 80, flags, 3]}, 'rt_' + name);
    const q = g.MP.peers.get('rt_' + name); out[name] = {flags, unseen: q.unseen, form: q.form, fat: !!q.fat, pox: !!q.pox, frz: !!q.frz, bob: !!q.bob, hedge: !!q.hedge, curl: q.curl, away: q.away};
  }
  window.__reset(); g.P.unseen = true; const fl = g.mpPosFlags(); g.mpRecv({k: 'p', d: g.R.depth, a: [1, 1, 0, 0, 0, 80, fl, 3]}, 'rt_unseen');
  out.unseen = {flags: fl, ...g.MP.peers.get('rt_unseen')}; out.unseen = {flags: fl, unseen: out.unseen.unseen, form: out.unseen.form, fat: !!out.unseen.fat, pox: !!out.unseen.pox, frz: !!out.unseen.frz, bob: !!out.unseen.bob, hedge: !!out.unseen.hedge};
  g.P.unseen = false; g.MP.on = false; g.MP.peers.clear(); return out;
});
check((rt.unseen.flags & ~2) === (32 | 4) && rt.unseen.unseen && !rt.unseen.fat && !rt.unseen.pox && !rt.unseen.frz && !rt.unseen.bob && !rt.unseen.hedge && !rt.unseen.form, 'bit 32 is `unseen` and only that');
check(['pug', 'rat', 'plague', 'hedge', 'curl1', 'curl2', 'fat', 'pox', 'bob', 'frozen', 'none'].every(k => rt[k].unseen === false && rt[k].away === false), 'no wheel flag reads back as `unseen` or `away`');
check(rt.pug.form === 1 && rt.rat.form === 2 && rt.plague.form === 3, 'body forms round-trip (pug, rat, plague rat)');
check(rt.hedge.hedge && rt.curl1.curl === 1 && rt.curl2.curl === 2 && rt.fat.fat && rt.pox.pox && rt.frozen.frz && rt.bob.bob, 'hedgehog, curl, fat, pox, frozen and bobblehead round-trip');
check(Object.values(rt).every(v => (v.flags & 15) === 4 || v.flags === 4 || (v.flags & 15) === 6), 'the low flags (down, safe, run, away, mounted) are untouched');
check(rt.frozen.flags & 2, 'a frozen player still reads as safe');

// 8. a real door room (solo): the spin keeps going, resolves on time, and the result waits
await pg.evaluate(() => { const g = window.__game; window.__reset(); g.wofClear(); g.MP.on = false; g.MP.peers.clear(); });
const solo = await pg.evaluate(async () => {
  const g = window.__game; const ok = g.previewRoom('kiln', 3); if (!ok) return {ok};
  const W = g.wof, TAU = Math.PI * 2, S = TAU / 22, a = W.angle, i = 15, base = a - (((a % TAU) + TAU) % TAU) + TAU * 6;
  W.done = true; g.wofBegin({d: g.R.depth, i, c: 0, a0: a, a1: base + i * S + 0.18, dur: 12, n: 'Aaron'}, false);
  W.t = W.plan.dur + 0.5;
  return {ok, state: g.state};
});
check(solo.ok && solo.state === 'room', 'a kiln-room visit is open');
await frames(60);
const inRoom = await pg.evaluate(() => { const g = window.__game; return {done: g.wof.done, bob: g.fx.bob, q: g.wofQ.map(q => q.i), state: g.state}; });
check(inRoom.done && inRoom.bob === 0 && inRoom.q.join() === '15' && inRoom.state === 'room', 'solo: the spin still finishes inside a room and the result is queued (' + JSON.stringify(inRoom) + ')');
await pg.evaluate(() => { window.__game.fx.moon = 40; });
await pg.waitForTimeout(1500);
check(await pg.evaluate(() => window.__game.fx.moon === 40), 'solo: effect clocks do not run in a room');
await pg.evaluate(() => window.__game.roomLeave());
await frames(5);
await pg.waitForTimeout(4500); await frames(10);
const out = await pg.evaluate(() => { const g = window.__game; return {state: g.state, bob: g.fx.bob, q: g.wofQ.length}; });
check(out.state === 'play' && out.bob > 0 && out.q === 0, 'solo: stepping back out plays the queued result (' + JSON.stringify(out) + ')');

if (errs.length) { console.log('console errors:'); for (const e of errs) console.log('  ' + e); fails++; }
await b.close();
console.log(fails ? fails + ' failed' : 'all passed');
process.exitCode = fails ? 1 : 0;
