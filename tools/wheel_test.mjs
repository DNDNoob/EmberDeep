// node tools/wheel_test.mjs [--shots DIR] [--q low|medium|high]
// Checks the Wheel of Misfortune in a built index.html: the wheel and Pat stand in the sanctuary, a spin from Pat's menu turns the wheel in
// the world and lands on the slice it planned, and each of the twelve outcomes does what it says. With --shots it also saves screenshots.
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
await pg.addInitScript(q => { localStorage.setItem('emberdeep.quality', JSON.stringify(q)); localStorage.setItem('emberdeep.wallet', '200'); }, A.q);
await pg.goto(pathToFileURL(resolve(root, 'index.html')).href);
await pg.waitForFunction(() => window.__game && window.__game.startRun, null, {timeout: 120000});
const frames = n => pg.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async name => { if (A.shots) { await frames(3); await pg.screenshot({path: resolve(A.shots, name + '.png')}); console.log('  shot', name); } };
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// a floor with a sanctuary; stand in it facing the wheel
const info = await pg.evaluate(() => {
  const g = window.__game;
  for (const seed of ['WHEEL1', 'WHEEL2', 'WHEEL3', 'WHEEL4']) { g.startRun(seed, 2, true); if (g.F.safe && g.F.safe.wheel) break; }
  const F = g.F, w = F.safe.wheel, P = g.P, pat = F.npcs.find(n => n.type === 'pat');
  P.x = w.x + w.nx * 1.25 - w.nz * 0.25; P.z = w.z + w.nz * 1.25 + w.nx * 0.25; P.yaw = Math.atan2(w.z - P.z, w.x - P.x); P.pitch = -0.08; g.onTileChange();
  return {wheel: w, pat: pat && {x: pat.x, z: pat.z}, safe: {x: F.safe.x, z: F.safe.z}};
});
check(!!info.pat, 'Pat Sajak stands in the sanctuary');
check(Math.hypot(info.pat.x - info.wheel.x, info.pat.z - info.wheel.z) < 0.9, 'Pat is next to the wheel');
await frames(4);
await shot('01-wheel-idle');
await pg.evaluate(() => { const g = window.__game, P = g.P, w = g.F.safe.wheel; P.x = w.x + w.nx * 2.05; P.z = w.z + w.nz * 2.05; P.yaw = Math.atan2(w.z - P.z, w.x - P.x); P.pitch = 0.12; g.onTileChange(); });
await shot('01b-wheel-wide');
await pg.evaluate(() => { const g = window.__game, P = g.P, w = g.F.safe.wheel; P.x = w.x + w.nx * 1.25 - w.nz * 0.25; P.z = w.z + w.nz * 1.25 + w.nx * 0.25; P.yaw = Math.atan2(w.z - P.z, w.x - P.x); P.pitch = -0.08; g.onTileChange(); });

// spin from Pat's menu
const spin = await pg.evaluate(() => {
  const g = window.__game, pat = g.F.npcs.find(n => n.type === 'pat');
  const before = g.wallet;
  g.openTalk(pat); const talkText = document.getElementById('talkText').textContent;
  g.pickTalk();          // first option: spin
  return {before, after: g.wallet, talkText, done: g.wof.done, state: g.state, plan: g.wof.plan, modal: !!document.querySelector('#wofOverlay:not([hidden])')};
});
check(spin.after === spin.before - 10, 'a spin costs 10 gems');
check(spin.state === 'play' && !spin.done, 'the wheel spins in the world and you keep control');
check(!spin.modal, 'no spin modal');
check(spin.plan.dur >= 12, 'the spin takes a while (' + spin.plan.dur.toFixed(1) + ' s)');
await pg.evaluate(() => { window.__game.wof.t = window.__game.wof.plan.dur * 0.3; });
await frames(2);
const mid = await pg.evaluate(() => ({a: window.__game.wof.angle, f: window.__game.wof.flap}));
check(mid.a > spin.plan.from, 'the disc turns');
await shot('02-wheel-spinning');
// let it stop
await pg.evaluate(() => { window.__game.wof.t = window.__game.wof.plan.dur + 0.85; });
await frames(6);
const land = await pg.evaluate(() => { const W = window.__game.wof; return {done: W.done, result: W.result, angle: W.angle, to: W.plan.to}; });
check(land.done && Math.abs(land.angle - land.to) < 1e-9, 'the wheel stops where it was planned');
await shot('03-wheel-result');

await pg.evaluate(() => { window.__wofPlan = (i, a) => { const TAU = Math.PI * 2, W = TAU / 12, base = a - (((a % TAU) + TAU) % TAU) + TAU * 6; return {from: a, to: base + i * W + 0.3, dur: 12}; }; });
// every slice lands on itself, many times over (the slice under the pointer is what happens)
const consistency = await pg.evaluate(async () => {
  const g = window.__game, W = g.wof; let bad = 0;
  for (let k = 0; k < 600; k++) {
    const i = k % 12; W.done = true; W.angle = Math.random() * 1000;
    g.wofBegin({d: g.R.depth, i, c: 0, ...(() => { const p = window.__wofPlan(i, W.angle); return {a0: p.from, a1: p.to, dur: p.dur}; })(), n: 'T'}, false);
    W.t = W.plan.dur + 1; g.update(0.016); if (W.result !== i) bad++;
  }
  return bad;
}).catch(e => 'error ' + e.message);
check(consistency === 0, 'result always matches the slice the wheel was planned to land on (' + consistency + ' mismatches)');

// each outcome
const outcome = async (i, opts = {}) => pg.evaluate(([i, o]) => {
  const g = window.__game, W = g.wof, F = g.fx;
  if (o.reset) { for (const k of ['pug', 'rat', 'plague', 'fat', 'loud', 'tin', 'pox', 'tickled', 'stag']) F[k] = 0; F.dying = false; g.tk = null; }
  Object.assign(g.R, o.R || {}); Object.assign(g.P, o.P || {}); if (o.wallet != null) g.wallet = o.wallet;
  W.done = true; const p = window.__wofPlan(i, W.angle);
  g.wofBegin({d: g.R.depth, i, c: o.coin || 0, a0: p.from, a1: p.to, dur: p.dur, n: 'Tester'}, !!o.mine);
  W.t = p.dur + 1; g.update(0.016);
  return {fx: {...F, frozen: F.frozen}, wallet: g.wallet, gems: g.R.gems, flash: g.P.flash, ward: g.P.ward, tk: !!g.tk, result: W.result,
    ann: document.querySelector('#wofAnn b')?.textContent, screen: document.body.classList.contains('wofbreak'), coin: document.getElementById('wofCoin')?.style.display};
}, [i, opts]);
let r;
r = await outcome(0, {mine: true}); check(r.fx.frozen === 'walmart' && r.screen, 'Walmart: the spinner is in the checkout line and frozen');
await frames(2); await shot('04-walmart');
await pg.waitForTimeout(9000); await shot('05-walmart-later');

await pg.evaluate(() => window.__game.brk.stop());
r = await outcome(0, {mine: false}); check(!r.fx.frozen, 'Walmart only takes the spinner');
await pg.evaluate(() => import('data:text/javascript,'));
r = await outcome(1, {mine: true}); check(r.fx.frozen === 'ad' && r.screen, 'Ad Break: the spinner watches the ad');
await pg.waitForTimeout(1000); await shot('06-ad-start');
await pg.waitForTimeout(5500);
const skip = await pg.evaluate(() => { const s = document.getElementById('wofSkip'); const lit = s.classList.contains('lit'); s.click(); return {lit, still: !!window.__game.brk.active}; });
check(skip.lit, 'Skip Ad lights up after 5 seconds'); check(skip.still, 'Skip Ad does nothing');
await shot('07-ad-skip-lit');
await pg.waitForTimeout(7000); await shot('07b-ad-product');
await pg.waitForTimeout(6000); await shot('07c-ad-fan');
await pg.waitForTimeout(6500); await shot('07d-ad-end');
await pg.evaluate(() => window.__game.brk.stop());
r = await outcome(2, {reset: true}); check(r.fx.pug > 100, 'Dog Days: you are a pug for 2 minutes');
await pg.evaluate(() => { const g = window.__game, P = g.P; P.pitch = -0.6; });
await shot('08-pug-first-person');
await pg.evaluate(() => { window.__game.P.pitch = -0.08; });
r = await outcome(3, {reset: true}); check(r.fx.rat > 100, 'Ratatouille: you are a rat for 2 minutes');
await pg.evaluate(() => { window.__game.P.pitch = -0.6; });
await shot('09-rat-first-person');
await pg.evaluate(() => { window.__game.P.pitch = -0.08; });
r = await outcome(4, {reset: true}); check(r.fx.fat > 100, 'Biggest Loser: +200 lb, 10x slower');
const speed = await pg.evaluate(() => { const g = window.__game, P = g.P; P.vx = P.vz = 0; g.keys.KeyW = true; for (let i = 0; i < 30; i++) g.update(1 / 60); g.keys.KeyW = false; return Math.hypot(P.vx, P.vz); });
check(speed > 0 && speed < 0.5, 'Biggest Loser: walking speed is about a tenth (' + speed.toFixed(2) + ' m/s)');
r = await outcome(5, {reset: true, coin: 1}); check(r.coin === 'block', 'Double or Nothing: the coin is tossed on screen');
await pg.waitForTimeout(1300); await shot('10-coin');
await pg.waitForTimeout(4500);
check(await pg.evaluate(() => window.__game.fx.fat > 100), 'Double or Nothing: heads means everyone gains 200 lb');
r = await outcome(5, {reset: true, coin: 0}); await pg.waitForTimeout(5500);
check(await pg.evaluate(() => window.__game.fx.fat === 0), 'Double or Nothing: tails means nothing happens');
r = await outcome(6, {reset: true, R: {gems: 12}, wallet: 50, P: {flash: 3, ward: 1, spikeTraps: 2}});
check(r.wallet === 38 && r.gems === 0 && r.flash === 0 && r.ward === 0, 'Nothing: run gems and supplies are gone (wallet 50 -> ' + r.wallet + ')');
r = await outcome(7, {reset: true}); check(r.fx.loud > 25, 'Hearing Aids: louder for a while');
r = await outcome(8, {reset: true}); check(r.fx.tin > 55 && r.fx.tin <= 60, 'Tinnitus: one minute of ringing');
r = await outcome(9, {reset: true, mine: true}); check(r.fx.plague > 100, 'Black Plague: the spinner is a plague rat');
const plague = await pg.evaluate(() => { const g = window.__game, pat = g.F.npcs.find(n => n.type === 'pat'); g.P.x = pat.x + 0.5; g.P.z = pat.z; for (let i = 0; i < 60 * 18; i++) g.update(1 / 60); return {sick: pat.sick, fall: pat.fall}; });
check(plague.fall > 0, 'Black Plague: Pat, standing next to the rat, dies slowly');
await shot('11-plague');
r = await outcome(10, {reset: true}); check(r.tk, 'Tickle Monster: he appears');
const tk = await pg.evaluate(() => { const g = window.__game; let caught = false;
  const P = g.P; const w = g.F.safe.wheel; P.x = w.x + w.nx * 1.3; P.z = w.z + w.nz * 1.3; g.onTileChange();
  for (let i = 0; i < 60 * 6; i++) { g.update(1 / 60); if (g.fx.tickled > 0) { caught = true; break; } }
  return {caught, x: g.tk && g.tk.x, z: g.tk && g.tk.z}; });
check(tk.caught, 'Tickle Monster: he catches and tickles you');
const slowed = await pg.evaluate(() => { const g = window.__game, P = g.P; P.vx = P.vz = 0; g.keys.KeyW = true; for (let i = 0; i < 20; i++) g.update(1 / 60); g.keys.KeyW = false; return Math.hypot(P.vx, P.vz); });
check(slowed < 1.2, 'Tickle Monster: being tickled slows you (' + slowed.toFixed(2) + ' m/s)');
await pg.evaluate(() => { const g = window.__game, P = g.P, T = g.tk; if (T) { P.x = T.x + Math.cos(0.3) * 1.2; P.z = T.z + Math.sin(0.3) * 1.2; P.yaw = Math.atan2(T.z - P.z, T.x - P.x); P.pitch = 0; T.pause = 3; } });
await shot('12-tickle-monster');
r = await outcome(11, {reset: true, mine: true}); check(r.fx.pox > 290, 'First Thanksgiving: the spinner has smallpox');
await shot('13-smallpox');
if (errs.length) { console.log('console errors:'); for (const e of errs) console.log('  ' + e); fails++; }
await b.close();
console.log(fails ? fails + ' failed' : 'all passed');
process.exitCode = fails ? 1 : 0;
