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


// every spin is different: how many turns, how long, how it slows; and the last results rarely come straight back
const vary = await pg.evaluate(() => {
  const g = window.__game, turns = new Set(), durs = [], es = [];let wrong = 0;
  for (let k = 0; k < 400; k++) { const i = (Math.random() * 23) | 0, p = g.planSpin(i, Math.random() * 50); if (g.sliceAt(p.to) !== i) wrong++;
    turns.add(Math.floor((p.to - p.from) / (Math.PI * 2))); durs.push(p.dur); es.push(p.e); }
  const recent = [], seen = new Array(23).fill(0);let again = 0, back3 = 0;
  for (let k = 0; k < 2000; k++) { const i = g.pickSlice(recent, 23); seen[i]++; if (recent[recent.length - 1] === i) again++; if (recent.slice(-3).includes(i)) back3++; recent.push(i); if (recent.length > 6) recent.shift(); }
  return {wrong, turns: turns.size, dmin: Math.min(...durs), dmax: Math.max(...durs), emin: Math.min(...es), emax: Math.max(...es), again: again / 2000, back3: back3 / 2000, minSeen: Math.min(...seen)};
});
check(vary.wrong === 0, 'every planned spin still lands on its slice');
check(vary.turns >= 6 && vary.dmax - vary.dmin > 8 && vary.emax - vary.emin > 2, 'spins vary: ' + vary.turns + ' different turn counts, ' + vary.dmin.toFixed(1) + '-' + vary.dmax.toFixed(1) + ' s, coast curves ' + vary.emin.toFixed(1) + '-' + vary.emax.toFixed(1));
check(vary.again < 0.01 && vary.back3 < 0.04 && vary.minSeen > 40, 'results rarely repeat (same as last: ' + (vary.again * 100).toFixed(1) + '%, one of the last three: ' + (vary.back3 * 100).toFixed(1) + '%), and every slice still comes up');

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
check(spin.plan.dur >= 9, 'the spin takes a while (' + spin.plan.dur.toFixed(1) + ' s)');
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

await pg.evaluate(() => { window.__wofPlan = (i, a) => { const TAU = Math.PI * 2, W = TAU / 23, base = a - (((a % TAU) + TAU) % TAU) + TAU * 6; return {from: a, to: base + i * W + 0.18, dur: 12}; }; });
// every slice lands on itself, many times over (the slice under the pointer is what happens)
const consistency = await pg.evaluate(async () => {
  const g = window.__game, W = g.wof; let bad = 0;
  for (let k = 0; k < 600; k++) {
    const i = k % 23; W.done = true; W.angle = Math.random() * 1000;
    g.wofBegin({d: g.R.depth, i, c: 0, ...(() => { const p = window.__wofPlan(i, W.angle); return {a0: p.from, a1: p.to, dur: p.dur}; })(), n: 'T'}, false);
    W.t = W.plan.dur + 1; g.update(0.016); if (W.result !== i) bad++;
  }
  return bad;
}).catch(e => 'error ' + e.message);
await pg.waitForTimeout(1800); await pg.evaluate(() => { const g = window.__game; g.rr = null; if (g.brk) g.brk.stop(true); g.fx.frozen = null; });
check(consistency === 0, 'result always matches the slice the wheel was planned to land on (' + consistency + ' mismatches)');

// each outcome
const outcome = async (i, opts = {}) => pg.evaluate(([i, o]) => {
  const g = window.__game, W = g.wof, F = g.fx;
  if (o.reset) { F.loudN = 0; for (const k of ['hedge', 'moon', 'bob', 'pug', 'rat', 'plague', 'fat', 'loud', 'tin', 'pox', 'tickled', 'stag']) F[k] = 0; F.dying = false; g.tk = null; g.ts = null; g.cg = null; g.rr = null; if (g.brk) g.brk.stop(true); F.frozen = null; }
  g.P.hp = 50; g.P.inv = 1e6;   // keep the tester alive through hours of shades
  Object.assign(g.R, o.R || {}); Object.assign(g.P, o.P || {}); if (o.wallet != null) g.wallet = o.wallet;
  W.done = true; const p = window.__wofPlan(i, W.angle);
  g.wofBegin({d: g.R.depth, i, c: o.coin || 0, a0: p.from, a1: p.to, dur: p.dur, n: 'Tester'}, !!o.mine);
  W.t = p.dur + 1; g.update(0.016);
  return {fx: {...F, frozen: F.frozen}, wallet: g.wallet, gems: g.R.gems, flash: g.P.flash, ward: g.P.ward, tk: !!g.tk, result: W.result,
    ann: document.querySelector('#wofAnn b')?.textContent, state: g.state, screen: document.body.classList.contains('wofbreak'), coin: document.getElementById('wofCoin')?.style.display};
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
r = await outcome(7, {}); r = await outcome(7, {}); check(r.fx.loudN === 3 && r.fx.loud > 25, 'Hearing Aids: they compound (x' + r.fx.loudN + ', ' + r.ann + ')');
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
r = await outcome(12, {reset: true, mine: true}); check(r.fx.frozen === 'dmv' && r.screen, 'DMV: the spinner waits for their number');
for (const t of [3, 25, 34, 39]) { await pg.evaluate(t => window.__game.brk.seek(t), t); await shot('14-dmv-' + t); }
await pg.evaluate(() => window.__game.brk.stop());
check(await pg.evaluate(() => !window.__game.fx.frozen), 'DMV: you are let go at the end');
r = await outcome(13, {reset: true, mine: true}); check(r.fx.frozen === 'terms', 'Terms & Conditions: the spinner has to accept them');
await shot('15-terms');
const terms = await pg.evaluate(() => {
  const g = window.__game, ok = () => document.querySelector('.wofOk'), tc = () => document.querySelector('.wofTc');
  const before = ok().disabled; tc().scrollTop = 1e6; tc().dispatchEvent(new Event('scroll')); const after = ok().disabled; ok().click();
  const page2 = /Updated/.test(document.body.innerText); tc().scrollTop = 1e6; tc().dispatchEvent(new Event('scroll')); const needCk = ok().disabled;
  const ck = document.querySelector('.wofCk'); if (!ck) return {before, after, page2, needCk, free: false, html: document.querySelector('.wofTc') && document.querySelector('.wofTc').scrollHeight}; ck.checked = true; ck.dispatchEvent(new Event('change')); ok().click();
  return {before, after, page2, needCk, free: !g.fx.frozen};
});
check(terms.before && !terms.after, 'Terms: I Agree unlocks only at the bottom');
check(terms.page2 && terms.needCk && terms.free, 'Terms: then a second page, with a checkbox, then you are free');
r = await outcome(14, {reset: true}); check(r.fx.moon > 55 && r.fx.moon <= 60, 'Moonwalk: reversed controls for a minute');
const moon = await pg.evaluate(() => { const g = window.__game, P = g.P; P.vx = P.vz = 0; g.keys.KeyW = true; for (let i = 0; i < 20; i++) g.update(1 / 60); g.keys.KeyW = false; return P.vx * Math.cos(P.yaw) + P.vz * Math.sin(P.yaw); });
check(moon < -0.1, 'Moonwalk: W walks you backwards (' + moon.toFixed(2) + ')');
r = await outcome(15, {reset: true}); check(r.fx.bob > 100, 'Bobblehead: big heads for two minutes');
r = await outcome(16, {reset: true, P: {fuel: 80}}); check(await pg.evaluate(() => window.__game.P.fuel) < 1, 'Lights Out: your torch is out');
r = await outcome(17, {reset: true}); check(await pg.evaluate(() => !!window.__game.ts), 'Timeshare Salesman: he arrives');
const pitch = await pg.evaluate(() => { const g = window.__game, P = g.P, pat = g.F.npcs.find(n => n.type === 'pat'); P.x = pat.x + 0.6; P.z = pat.z; g.onTileChange();
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  const near = Math.hypot(g.ts.x - P.x, g.ts.z - P.z); g.openTalk(pat); const blocked = g.state !== 'talk'; if (g.state === 'talk') g.closeTalk();
  for (let i = 0; i < 60 * 30; i++) g.update(1 / 60);
  g.openTalk(pat); const free = g.state === 'talk'; if (free) g.closeTalk();
  return {near, blocked, done: g.fx.pitchDone, free}; });
check(pitch.near < 1.4, 'Timeshare Salesman: he walks right up to you');
check(pitch.blocked, 'Timeshare Salesman: you cannot talk to anyone mid-pitch');
check(pitch.done && pitch.free, 'Timeshare Salesman: after the full pitch you can talk again');
await pg.evaluate(() => { const g = window.__game, P = g.P, T = g.ts; if (T) { P.x = T.x + 1.1; P.z = T.z + 0.3; P.yaw = Math.atan2(T.z - P.z, T.x - P.x); P.pitch = 0; } });
await shot('16-salesman');
r = await outcome(18, {reset: true, mine: false}); check(r.fx.hedge === 0, 'Hedgehog: only the spinner becomes one');
r = await outcome(18, {reset: true, mine: true}); check(r.fx.hedge > 100, 'Hedgehog: the spinner is a hedgehog for two minutes');
await pg.evaluate(() => { const g = window.__game, P = g.P; P.pitch = -0.5; g.onTileChange(); });
await shot('17-hedgehog-first-person');
const hedge = await pg.evaluate(() => {
  const g = window.__game, P = g.P, k = g.keys, step = n => { for (let i = 0; i < n; i++) g.update(1 / 60); };
  P.inv = 0; P.hp = 3; P.ward = 0; P.vx = P.vz = 0;
  // curled: no walking, and a shade that runs into you is the one that gets hurt
  k.KeyZ = true; k.KeyW = true; const x0 = P.x, z0 = P.z; step(30); const moved = Math.hypot(P.x - x0, P.z - z0);
  const s = g.F.shades.find(q => q.type === 0) || g.F.shades[0]; let stunned = null;
  if (s) { s.x = P.x + 0.2; s.z = P.z; s.state = 1; s.stun = 0; s.dead = false; step(40); stunned = s.stun > 0; }
  const hp = P.hp, curl = g.fx.curl;
  k.KeyZ = false; k.KeyW = false;
  // rolling: super speed
  // rolling: super speed, measured down the open corridor the floor starts you in
  const go = (key) => { P.x = g.F.start.tx + 0.5; P.z = g.F.start.ty + 0.5; P.yaw = g.F.start.yaw; P.vx = P.vz = 0; g.onTileChange(); if (key) k[key] = true; k.KeyW = true; step(12); const v = Math.hypot(P.vx, P.vz); k.KeyW = false; if (key) k[key] = false; return v; };
  const walk = go(null); k.KeyX = true; step(1); const rcurl = g.fx.curl; k.KeyX = false; const fast = go('KeyX');
  if (s) { s.x = -99; s.z = -99; }
  return {moved, stunned, hp, curl, fast, rcurl, walk};
});
check(hedge.curl === 1 && hedge.moved < 0.05, 'Hedgehog: Z curls you up and you stay put');
check(hedge.hp === 3, 'Hedgehog: curled up, nothing hurts you');
check(hedge.stunned !== false, 'Hedgehog: a shade that touches the spines is stunned');
check(hedge.rcurl === 2 && hedge.fast > hedge.walk * 2.5, 'Hedgehog: X rolls at super speed (' + hedge.fast.toFixed(1) + ' m/s, walking ' + hedge.walk.toFixed(1) + ')');
await pg.evaluate(() => { const g = window.__game; g.keys.KeyZ = true; g.P.pitch = 0; });
await shot('18-hedgehog-curled-view');
await pg.evaluate(() => { window.__game.keys.KeyZ = false; });
r = await outcome(19, {reset: true, mine: true}); check(r.fx.frozen === 'birth' && r.screen, 'Circle of Life: the spinner is born again');
for (const t of [3, 7.5, 13, 16.5, 20]) { await pg.evaluate(t => window.__game.brk.seek(t), t); await shot('19-birth-' + t); }
await pg.evaluate(() => window.__game.brk.seek(30)); await frames(3);
check(await pg.evaluate(() => !window.__game.fx.frozen), 'Circle of Life: back in the maze afterwards');
// Bomb: it falls, fizzes, goes off, and throws you
await pg.evaluate(() => { for (const n of window.__game.F.npcs) { n.fall = 0; n.sick = 0; n.lock = false; } });   // Pat died of the plague above; bring him back
await pg.evaluate(() => { const g = window.__game, P = g.P, w = g.F.safe.wheel; P.x = w.x + w.nx * 1.6 + w.nz * 0.3; P.z = w.z + w.nz * 1.6 - w.nx * 0.3; P.yaw = Math.atan2(w.z - P.z, w.x - P.x); P.pitch = -0.2; g.onTileChange(); });
r = await outcome(21, {reset: true}); check(await pg.evaluate(() => !!window.__game.bomb), 'Bomb: a bomb drops in front of the wheel');
await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 1.5; i++) g.update(1 / 60); }); await shot('23-bomb-fuse');
const boom = await pg.evaluate(() => { const g = window.__game, P = g.P, x0 = P.x, z0 = P.z, pat = g.F.npcs.find(n => n.type === 'pat');
  for (let i = 0; i < 60 * 1.6; i++) g.update(1 / 60); const fly = g.fx.flyT, knocked = pat.knock > 0;
  for (let i = 0; i < 60 * 1.2; i++) g.update(1 / 60); const moved = Math.hypot(P.x - x0, P.z - z0);
  return {fly, knocked, moved}; });
await shot('24-bomb-boom');
check(boom.fly > 0 && boom.moved > 1.5, 'Bomb: the blast throws you (' + boom.moved.toFixed(1) + ' m)');
check(boom.knocked, 'Bomb: Pat is knocked flat');
check(await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 7; i++) g.update(1 / 60); const pat = g.F.npcs.find(n => n.type === 'pat'); return !pat.knock && !pat.fall; }), 'Bomb: and gets back up');
// Crunch Gremlin: chases you for a minute and takes a bite
r = await outcome(22, {reset: true}); check(await pg.evaluate(() => !!window.__game.cg && window.__game.cg.t > 55), 'Crunch Gremlin: it shows up for a minute');
const cg = await pg.evaluate(() => { const g = window.__game, P = g.P, w = g.F.safe.wheel; P.x = w.x + w.nx * 1.8; P.z = w.z + w.nz * 1.8; P.hp = 3; P.inv = 0; P.ward = 0; g.onTileChange();
  let bit = false; for (let i = 0; i < 60 * 8; i++) { g.update(1 / 60); if (P.hp < 3) { bit = true; break; } P.inv = 0; }
  return {bit, hp: P.hp}; });
check(cg.bit, 'Crunch Gremlin: it catches you and takes a bite (' + cg.hp + ' hearts left)');
await pg.evaluate(() => { const g = window.__game, P = g.P, C = g.cg; g.P.hp = 50; g.P.inv = 1e6; if (C) { P.x = C.x + 1.0; P.z = C.z + 0.3; P.yaw = Math.atan2(C.z - P.z, C.x - P.x); P.pitch = -0.15; C.chew = 3; } });
await shot('25-crunch-gremlin');
check(await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 62; i++) g.update(1 / 60); return !g.cg; }), 'Crunch Gremlin: gone after a minute');
// Russian roulette: with a friend at the table there are 4 chambers (2 players, 3 empty, 1 round)
const rr2 = await pg.evaluate(async () => { const g = window.__game; g.MP.on = true;
  const send = () => g.mpRecv({k: 'p', d: g.R.depth, a: [g.P.x + 1, g.P.z, 0, 0, 0, 80, 4, 3]}, 'friend1'); send(); window.__rrIv = setInterval(send, 200);
  return true; });
r = await outcome(20, {reset: true}); await pg.waitForTimeout(2200); await frames(2);
const two = await pg.evaluate(() => { const g = window.__game, R = g.rr; return R && {n: R.n, seats: R.seats.length, frozen: g.fx.frozen}; });
check(two && two.seats === 2 && two.n === 4, 'Russian roulette: n players, n+1 empty chambers and one round (' + JSON.stringify(two) + ')');
await shot('20-roulette-table');
await pg.evaluate(() => { clearInterval(window.__rrIv); const g = window.__game; g.MP.on = false; g.MP.peers.clear(); const R = g.rr; if (R) { R.phase = 'done'; R.phT = 0; } g.update(0.016); });
check(await pg.evaluate(() => !window.__game.rr && !window.__game.fx.frozen), 'Russian roulette: the table breaks up when the game is over');
// alone at the table: spin, then a click, and you walk away
r = await outcome(20, {reset: true}); await pg.waitForTimeout(2200); await frames(2);
const solo = await pg.evaluate(() => { const g = window.__game, R = g.rr; if (!R) return null; const out = {n: R.n, mine: R.seats[R.turn].id === 'me'};
  g.rrAct('spin'); out.spun = g.rr.spun; g.rr.pos = (g.rr.live + 1) % g.rr.n; g.rrAct('shoot'); out.after = g.rr.phase; return out; });
check(solo && solo.n === 3 && solo.mine && solo.spun && solo.after === 'click', 'Russian roulette: you can spin, then pull the trigger (' + JSON.stringify(solo) + ')');
await shot('21-roulette-mine');
await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 7; i++) g.update(1 / 60); });
check(await pg.evaluate(() => !window.__game.rr && window.__game.state === 'play'), 'Russian roulette: an empty chamber and everyone lives');
// and the round: you die
r = await outcome(20, {reset: true}); await pg.waitForTimeout(2200);
await pg.evaluate(() => { const g = window.__game; g.P.hp = 3; g.P.inv = 0; g.rr.pos = g.rr.live; g.rrAct('shoot'); });
await frames(2); await shot('22-roulette-bang');
await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 5; i++) g.update(1 / 60); });
check(await pg.evaluate(() => window.__game.state === 'dead'), 'Russian roulette: if you lose, you die');
if (errs.length) { console.log('console errors:'); for (const e of errs) console.log('  ' + e); fails++; }
await b.close();
console.log(fails ? fails + ' failed' : 'all passed');
process.exitCode = fails ? 1 : 0;
