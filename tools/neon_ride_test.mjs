// node tools/neon_ride_test.mjs [--shots DIR]
// Checks the Neon Run (the dark-ride door): the course and its cutouts come from the seed, the prizes get better with the score, the
// cart rolls the whole course by itself and stops at the prize counter, a shot at a cutout scores (an astronaut costs), and riding it
// through a real door pays out the prize for the score. A marksman bot aims at every alien, saucer and the big one as they come up.
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = {shots: '', q: 'high'};
for (let i = 2; i < process.argv.length; i++) A[process.argv[i].replace(/^--/, '')] = process.argv[++i];
if (A.shots) mkdirSync(A.shots, {recursive: true});
const b = await chromium.launch();
const pg = await (await b.newContext({viewport: {width: 1280, height: 720}})).newPage(), errs = [];
pg.setDefaultTimeout(900000);
pg.on('pageerror', e => errs.push(String(e)));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.addInitScript(q => { localStorage.setItem('emberdeep.quality', JSON.stringify(q)); }, A.q);
await pg.goto(pathToFileURL(resolve(root, 'index.html')).href);
await pg.waitForFunction(() => window.__game && window.__game.startRun, null, {timeout: 120000});
const frames = n => pg.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async name => { if (A.shots) { await frames(4); await pg.screenshot({path: resolve(A.shots, name + '.png')}); console.log('  shot', name); } };
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// open a real Neon Run door on some floor
const door = await pg.evaluate(() => {
  const g = window.__game;
  for (let k = 0; k < 60; k++) for (let d = 1; d <= 12; d++) { const seed = 'NEON' + k, F = g.genFloor(seed, d); const D = (F.sdoors || []).find(q => q.kind === 'neonride'); if (D) return {seed, d}; }
  return null;
});
check(!!door, 'the Neon Run turns up as a strange door (' + JSON.stringify(door) + ')');
await pg.evaluate(({seed, d}) => {
  const g = window.__game, P = g.P;g.startRun(seed, d, true);
  const D = g.F.sdoors.find(q => q.kind === 'neonride');P.x = D.x + D.dx * 0.5;P.z = D.z + D.dz * 0.5;g.onTileChange();
  for (const s of g.F.shades) { s.x = s.z = -99; s.dead = true; }
  window.__before = {wallet: g.wallet, flash: P.flash};
  g.sdoorOpen(D, true);
}, door);
await pg.waitForFunction(() => window.__game.state === 'room' && window.__game.ROOMS.kind === 'neonride', null, {timeout: 60000});
const course = await pg.evaluate(() => { const S = window.__game.ROOMS.state(), C = S.course;
  return {L: Math.round(C.L), n: C.targets.length, kinds: C.targets.reduce((a, t) => (a[t.kind] = (a[t.kind] || 0) + 1, a), {}), seed: S.seed}; });
check(course.L > 150 && course.n > 30 && course.kinds.alien > 15 && course.kinds.saucer > 2 && course.kinds.astronaut > 1 && course.kinds.boss === 1,
  'a long course with plenty to shoot: ' + JSON.stringify(course));
await shot('neon-01-start');

// the marksman: every frame, look at the nearest standing alien, saucer or boss in front, and pull the trigger when on it
const ride = await pg.evaluate(() => new Promise(done => {
  const g = window.__game, R = g.ROOMS, S = R.state(), cam = R.cam, v = cam.position.clone();
  const out = {start: S.s, moved: 0, score0: 0, firstHit: -1, frames: 0, astro: 0};
  let k = 0, shotAstro = false;
  const step = () => {
    for (let n = 0; n < 6 && !S.ended; n++) {
      k++;const t = k / 30;
      // pick a target
      let best = null, bd = 1e9;
      for (const P of S.panels) { if (P.hit || P.up < 0.9) continue; const kind = P.t.kind;
        if (kind === 'astronaut' && shotAstro) continue;
        const w = P.front.getWorldPosition(v.clone()), d = w.distanceTo(cam.position) - (kind === 'astronaut' ? 100 : 0);   // the first astronaut it sees, it shoots (to check the penalty)
        if (d < bd && d < 18) { bd = d; best = {P, w}; } }
      let press = false;
      if (best) {
        const dx = best.w.x - cam.position.x, dy = best.w.y - cam.position.y, dz = best.w.z - cam.position.z;
        const head = cam.rotation.y + S.yaw, want = Math.atan2(-dx, -dz);
        S.yaw = head - want; while (S.yaw > Math.PI) S.yaw -= 2 * Math.PI; while (S.yaw < -Math.PI) S.yaw += 2 * Math.PI;
        S.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        press = (k % 2) === 0;
        if (best.P.t.kind === 'astronaut' && out.astroId === undefined) { out.astroBefore = S.score; out.astroId = best.P.t.id; }
      }
      const before = S.score;
      R.update(1 / 30, {press, lx: 0, ly: 0, mx: 0, my: 0});
      if (out.astroId !== undefined && !shotAstro && S.hits.includes(out.astroId)) { shotAstro = true; out.astro = S.score - before + (S.score - before > 0 ? 0 : 0); out.astroDelta = S.score - before; }
      if (S.score > before && out.firstHit < 0) out.firstHit = t;
    }
    out.frames = k;
    if (S.ended || k > 30 * 200) { out.moved = S.s - out.start; out.L = S.course.L; out.ended = S.ended; out.score = S.score; out.tier = S.tier; out.time = k / 30; out.hits = S.hits.length; done(out); return; }
    requestAnimationFrame(step);
  };
  step();
}));
check(ride.ended && Math.abs(ride.moved - ride.L) < 1.5, 'the cart rolls the whole course by itself and stops at the prize counter (' + ride.time.toFixed(0) + ' s)');
check(ride.time > 50 && ride.time < 110, 'the ride lasts about a minute and a quarter');
check(ride.firstHit > 0, 'a shot at a cutout scores (first hit after ' + ride.firstHit.toFixed(1) + ' s)');
check(ride.astroDelta < 0, 'shooting an astronaut costs points (' + ride.astroDelta + ')');
check(ride.score >= 600 && ride.tier >= 4, 'a sharp shot gets one of the top prizes (' + ride.score + ' points, prize ' + ride.tier + ', ' + ride.hits + ' boards down)');
await shot('neon-03-prize');

// step out at the counter: the prize is paid
const paid = await pg.evaluate(() => new Promise(done => {
  const g = window.__game, R = g.ROOMS;let k = 0;
  const step = () => { k++; R.update(1 / 30, {press: k > 50 && k % 2 === 0}); if (g.state !== 'room' || k > 200) { done({state: g.state, wallet: g.wallet - window.__before.wallet, flash: g.P.flash - window.__before.flash, toast: document.getElementById('toast')?.textContent || ''}); return; } requestAnimationFrame(step); };
  step();
}));
check(paid.state === 'play' && paid.wallet >= 40 && paid.flash >= 3, 'stepping out pays the prize (' + paid.wallet + ' gems, ' + paid.flash + ' flash bombs): ' + paid.toast);

if (A.shots) {
  // a mid-ride view, for the eye
  await pg.evaluate(() => window.__game.previewRoom('neonride', 11));
  // roll on until a cutout stands close, look at it, then shoot it
  await pg.evaluate(() => { const R = window.__game.ROOMS, S = R.state(), cam = R.cam;
    for (let i = 0; i < 30 * 40; i++) { R.update(1 / 30, {}); const P = S.panels.find(P => P.up > 0.95 && !P.hit && P.t.kind === 'alien' && P.front.getWorldPosition(cam.position.clone()).distanceTo(cam.position) < 6.5); if (P) { window.__P = P; break; } }
    const P = window.__P, w = P.front.getWorldPosition(cam.position.clone()), dx = w.x - cam.position.x, dz = w.z - cam.position.z;
    S.yaw = cam.rotation.y + S.yaw - Math.atan2(-dx, -dz); S.pitch = Math.atan2(w.y - cam.position.y, Math.hypot(dx, dz)); R.update(0.001, {}); });
  await shot('neon-02-ride');
  await pg.evaluate(() => { const R = window.__game.ROOMS, S = R.state(), cam = R.cam, P = window.__P;
    for (let i = 0; i < 40 && !P.hit; i++) { const w = P.front.getWorldPosition(cam.position.clone()), dx = w.x - cam.position.x, dz = w.z - cam.position.z;
      S.yaw = cam.rotation.y + S.yaw - Math.atan2(-dx, -dz); S.pitch = Math.atan2(w.y - cam.position.y, Math.hypot(dx, dz)); R.update(1 / 60, {press: i % 2 === 0}); }
    for (let i = 0; i < 8; i++) R.update(1 / 60, {}); });
  await shot('neon-02b-hit');
  await pg.evaluate(() => window.__game.roomLeave());
}
const watch = await pg.evaluate(() => { const g = window.__game, R = g.ROOMS;
  R.watch('neonride', {sd: 1234, s: 60, t: 22, yaw: 0.4, pitch: -0.1, sc: 125, h: [0, 1, 2], e: 0});R.update(1 / 30, {});
  const S = R.state(), out = {s: S.s, score: S.score, down: S.panels.filter(P => P.hit).length};R.abort();return out; });
check(Math.abs(watch.s - 60) < 0.01 && watch.score === 125 && watch.down === 3, 'a watcher rebuilds the same ride and follows the rider (' + JSON.stringify(watch) + ')');
check(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
