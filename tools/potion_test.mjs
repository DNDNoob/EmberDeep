// node tools/potion_test.mjs [--shots DIR] [--q low|medium|high]
// Checks the Brewer and the potions in a built index.html: the recipe book (124 potions, 4 tiers, buffs and debuffs, each tier from the one below),
// the Brewer and his cauldron beside the Keeper, ingredients in the maze, brewing from the menu, and every potion drunk and thrown
// (on a player and on monsters) without errors, with spot checks that the effects do what they say. --shots saves screenshots.
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

// ---- the recipe book
const book = await pg.evaluate(() => {
  const g = window.__game, P = g.POTIONS, tiers = [0, 0, 0, 0, 0];let below = true, roundTrip = true;
  for (let i = 1; i <= 124; i++) { const p = P[i]; tiers[p.tier]++;
    if (p.recipe && p.tier > 1 && !p.recipe.every(r => P[r].tier === p.tier - 1)) below = false;
    if (p.recipe) { const ix = id => g.INGREDIENTS.findIndex(q => q.id === id), a = p.tier === 1 ? {ing: ix(p.recipe[0])} : {pot: p.recipe[0]}, c = p.tier === 1 ? {ing: ix(p.recipe[1])} : {pot: p.recipe[1]};
      if (g.brew(a, c) !== i || g.brew(c, a) !== i) roundTrip = false; } }
  const missingFx = []; for (let i = 1; i <= 124; i++) if (!g.PFX[i]) missingFx.push(i);
  const monText = []; for (let i = 1; i <= 124; i++) if (!P[i].mon || !P[i].you) monText.push(i);
  return {n: P.length - 1, tiers, below, roundTrip, missingFx, monText, sludge: g.brew({ing: 0}, {pot: 99})};
});
check(book.n === 124, '124 named potions');
check(book.tiers.slice(1).join() === '48,36,26,14', 'tiers 1-4: ' + book.tiers.slice(1).join(', '));
check(book.below, 'every tier 2-4 recipe mixes two potions of the tier below');
check(book.roundTrip, 'every recipe brews its potion, in either order');
check(book.sludge === 40, 'the named recipe book alone falls back to Murky Sludge (blends cover the rest)');
check(!book.missingFx.length, 'every potion has an effect' + (book.missingFx.length ? ' (missing ' + book.missingFx + ')' : ''));
check(!book.monText.length, 'every potion says what it does to you and to a monster');

// ---- ingredients in the maze
const ing = await pg.evaluate(() => {
  const g = window.__game, out = {counts: [], kinds: new Set(), bad: 0, det: true, byBiome: {}};
  for (const seed of ['ING1', 'ING2']) for (let d = 1; d <= 12; d++) {
    const F = g.genFloor(seed, d), L = F.items.filter(i => i.type === 'ingr'), F2 = g.genFloor(seed, d);
    out.counts.push(L.length);
    if (JSON.stringify(L) !== JSON.stringify(F2.items.filter(i => i.type === 'ingr'))) out.det = false;
    for (const it of L) { out.kinds.add(it.ing); const i = it.ty * F.W + it.tx; if (F.g[i] !== 0 || F.safeMask[i] || Math.floor(it.x) !== it.tx || Math.floor(it.z) !== it.ty) out.bad++;
      const k = F.bi; (out.byBiome[k] = out.byBiome[k] || {}); out.byBiome[k][it.ing] = (out.byBiome[k][it.ing] || 0) + 1; }
  }
  out.kinds = [...out.kinds].sort((a, b) => a - b);
  return out;
});
check(Math.min(...ing.counts) >= 5 && Math.max(...ing.counts) <= 18, 'every floor has 5-18 ingredients (' + Math.min(...ing.counts) + '-' + Math.max(...ing.counts) + ')');
check(!ing.bad, 'ingredients lie on open floor tiles, outside the sanctuary');
check(ing.det, 'ingredient placement is the same every time for a seed and depth');
check(ing.kinds.length >= 10, 'ten or more kinds lie about the maze (' + ing.kinds.length + ')');
const top = (bi, id) => { const m = ing.byBiome[bi]; if (!m) return true; const best = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return +best[0] === id; };
check(top(2, 3) && top(3, 2), 'the Frostvault is richest in frost lichen and the Cinder Warrens in ember salt');

// ---- the Brewer in the sanctuary
const br = await pg.evaluate(() => {
  const g = window.__game;let seed;
  for (seed of ['BREW1', 'BREW2', 'BREW3', 'BREW4', 'BREW5']) { g.startRun(seed, 2, true); if (g.F.safe) break; }
  const F = g.F, n = F.npcs.find(q => q.type === 'brewer'), k = F.npcs.find(q => q.type === 'keeper'), w = F.safe.wheel, c = F.safe.brew;
  const P = g.P; P.x = F.safe.x - (c.cx - F.safe.x) * 0.1; P.z = F.safe.z; P.yaw = Math.atan2(c.cz - P.z, c.cx - P.x); P.pitch = -0.15; g.onTileChange();
  const ci = Math.floor(c.cz) * F.W + Math.floor(c.cx), bi = Math.floor(n.z) * F.W + Math.floor(n.x);
  return {seed, has: !!n, dk: Math.hypot(n.x - k.x, n.z - k.z), dw: Math.hypot(c.cx - w.x, c.cz - w.z), inSafe: F.safeMask[ci] === 1 && F.safeMask[bi] === 1, open: F.g[ci] === 0 && F.g[bi] === 0, cd: Math.hypot(c.cx - n.x, c.cz - n.z)};
});
check(br.has, 'the Brewer stands in the sanctuary');
check(br.dk < 1.7, 'he stands beside the Keeper (' + br.dk.toFixed(2) + ' m)');
check(br.dw > 1.2, 'his cauldron is clear of the wheel (' + br.dw.toFixed(2) + ' m)');
check(br.inSafe && br.open, 'the Brewer and his cauldron are inside the sanctuary, on open floor');
check(br.cd > 0.3 && br.cd < 0.6, 'the cauldron is at his side');
await frames(6);
await shot('01-brewer');

// ---- brewing from his menu
const menu = await pg.evaluate(() => {
  const g = window.__game, T = g.pot, n = g.F.npcs.find(q => q.type === 'brewer'), ix = id => g.INGREDIENTS.findIndex(q => q.id === id);
  T.bag.fill(0); T.belt = []; T.bag[ix('moss')] = 1; T.bag[ix('water')] = 1;
  g.P.x = n.x - 0.7; g.P.z = n.z; g.onTileChange();
  g.openTalk(n); const name = document.getElementById('talkName').textContent;
  const pick = label => { const i = g.talk.opts.findIndex(o => o.label === label); if (i < 0) return false; g.talk.sel = i; g.pickTalk(); return true; };
  const a = pick('Brew a potion'), b = pick('Cave Moss'), c = pick('Still Water');
  const line = document.getElementById('talkText').textContent;
  const r = {name, a, b, c, line, belt: T.belt.map(q => [q.id, q.n]), bag: T.bag.reduce((x, y) => x + y, 0), book: T.book.has(1)};
  // two Mending Tonics make a tier-2? no: Regeneration is Mending Tonic + Calm Tea
  T.belt = [{id: 1, n: 1}, {id: 15, n: 1}]; g.moveTalk(0); pick('Brew a potion'); pick('Mending Tonic'); pick('Calm Tea');
  r.t2 = T.belt.map(q => q.id);
  T.belt = [{id: 1, n: 6}, {id: 2, n: 1}, {id: 3, n: 1}, {id: 4, n: 1}, {id: 5, n: 1}, {id: 6, n: 1}]; T.bag[0] = 2; g.moveTalk(0);
  pick('Brew a potion'); pick('Glowcap'); pick('Glowcap');
  r.full = document.getElementById('talkText').textContent; r.bagAfterFull = T.bag[0]; r.beltLen = T.belt.length;
  pick('Recipe book'); r.bookRows = g.talk.opts.filter(o => o.info).length;
  g.closeTalk();
  return r;
});
check(menu.name.includes('Brewer'), 'talking to him opens the Brewer\'s menu');
check(menu.a && menu.b && menu.c, 'Brew, then pick two things you carry');
check(menu.belt.length === 1 && menu.belt[0][0] === 1 && menu.bag === 0, 'Cave Moss + Still Water makes a Mending Tonic and uses them up');
check(menu.book, 'the recipe goes in the book');
check(menu.t2.includes(48), 'two tier-1 potions make a tier-2 (Regeneration)');
check(menu.beltLen === 7 && menu.bagAfterFull === 0, 'with all six hot-bar slots taken, a new potion waits in your bag');
check(menu.bookRows >= 2, 'the recipe book lists what you have brewed (' + menu.bookRows + ')');
await shot('02-brewer-menu');

// ---- picking up an ingredient
const pick = await pg.evaluate(() => {
  const g = window.__game, it = g.F.items.find(i => i.type === 'ingr' && !i.got);
  if (!it) return {none: true};
  const before = g.pot.bag[it.ing]; g.P.x = it.x; g.P.z = it.z; g.P.y = 0; g.onTileChange(); g.update(1 / 60);
  return {got: it.got, gain: g.pot.bag[it.ing] - before};
});
check(!pick.none && pick.got && pick.gain === 1, 'walking over an ingredient puts it in your bag');

// a look at an ingredient on the floor
await pg.evaluate(() => { const g = window.__game, F = g.F, it = F.items.find(i => i.type === 'ingr' && !i.got);
  if (it) { const d = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(q => F.g[(it.ty + q[1]) * F.W + it.tx + q[0]] === 0) || [1, 0]; g.P.x = it.x + d[0] * 0.8; g.P.z = it.z + d[1] * 0.8; g.P.yaw = Math.atan2(it.z - g.P.z, it.x - g.P.x); g.P.pitch = -0.6; g.onTileChange(); } });
await shot('03-ingredient');

// ---- helpers inside the page: a clean slate, and a monster in front of you
await pg.evaluate(() => {
  const g = window.__game;
  window.__clean = () => { if (g.state !== 'play') { g.startRun('REVIVE', 3, true); }   // a monster may have got us between checks: start again
    const T = g.pot; T.ps = {}; T.holdK = ''; T.zones = []; T.proj = []; T.stop = 0; T.apo = null; T.pnd = 0; T.slv = null;
    for (const k of ['pug', 'rat', 'plague', 'fat', 'loud', 'tin', 'pox', 'moon', 'bob', 'tickled', 'stag', 'hedge']) g.fx[k] = 0; g.fx.dying = false;
    g.P.hp = 3; g.P.inv = 0; g.P.ward = 0; g.P.chill = 0; g.P.fuel = 60; g.P.down = false; g.R.hpBonus = 0;
    g.pot.thick = 0; g.pot.aegis = 0; g.pot.hex = 0; g.pot.pm = {}; g.P.woozy = 0; g.fx.moon = 0; g.P.fizz = 0;
    for (const n of g.F.npcs || []) if (n.type === 'lurk') { n.x = -1; n.aggro = 0; }   // the lurk is not a potion target: keep it out of these checks
    for (const s of g.F.shades) { s.pe = null; s.pk = null; s.pmag = null; s.stun = 0; s.pv = 0; s.dead = false; s.down = 0; s.bleed = s.burnD = null; s.hpMax = 0; } };
  window.__spot = () => { const F = g.F; for (let y = 2; y < F.H - 2; y++) for (let x = 2; x < F.W - 6; x++) { let ok = true; for (let k = 0; k < 5; k++) { const i = y * F.W + x + k; if (F.g[i] || F.safeMask[i] || F.pocketMask[i]) ok = false; } if (ok) return [x, y]; } return null; };
  window.__stage = () => { const s = window.__spot(), P = g.P, sh = g.F.shades.filter(q => q.type !== 3);
    P.x = s[0] + 0.5; P.z = s[1] + 0.5; P.y = 0; P.vy = 0; P.yaw = 0; P.pitch = -0.05; g.onTileChange();
    sh.forEach((m, i) => { if (i === 0) { m.x = s[0] + 2.5; m.z = s[1] + 0.5; } else { m.x = s[0] + 3.4; m.z = s[1] + 0.5 + (i > 1 ? 0.01 * i : 0); } m.gx = Math.floor(m.x); m.gy = Math.floor(m.z); m.px = -1; m.state = 0; m.stun = 0; m.dead = false; });
    return sh[0]; };
});

// ---- drink every potion
const drunk = await pg.evaluate(() => {
  const g = window.__game, bad = [], R = {};
  for (let id = 1; id <= 124; id++) {
    if (id === 97 || id === 98) continue;   // World Key descends, Pandemonium spins the wheel: checked on their own
    window.__clean(); window.__stage();
    try {
      g.pot.belt = [{id, n: 1}]; g.pot.sel = 0; const hp0 = g.P.hp, x0 = g.P.x;
      g.potDrink();
      for (let k = 0; k < 20; k++) g.update(1 / 30);
      R[id] = {ps: Object.keys(g.pot.ps).filter(k => g.pot.ps[k] > 0), hold: g.pot.holdK, hp: g.P.hp, hp0, dx: g.P.x - x0, belt: g.pot.belt.length, max: 3 + (g.up.heart | 0) + (g.R.hpBonus | 0), fx: {pug: g.fx.pug, hedge: g.fx.hedge}};
    } catch (e) { bad.push(id + ': ' + e.message); }
  }
  window.__clean();
  return {bad, R};
});
check(!drunk.bad.length, 'drinking each potion runs without an error' + (drunk.bad.length ? ' (' + drunk.bad.slice(0, 4).join('; ') + ')' : ''));
const D = drunk.R;
check(D[3].ps.includes('quick'), 'Quickstep: faster');
check(D[5].ps.includes('hold') && D[5].hold === 'ice', 'Frostbite: frozen solid');
check(D[21].ps.includes('invis'), 'Fade: invisible');
check(D[19].fx.pug > 0, 'Pug Juice: a pug');
check(D[38].dx > 1, 'Blink: teleported forward (' + D[38].dx.toFixed(2) + ' m)');
check(D[89].ps.includes('life'), 'Second Life is waiting');
check(D[92].max === D[92].hp && D[92].ps.includes('undying'), 'Elixir of Life: one more heart, all of them full, and undying for a while');
check(D[74].ps.includes('phase'), 'Void Cloak: walk through walls');
check(D[3].belt === 0, 'a drunk potion is gone from the belt');

// ---- protections
const prot = await pg.evaluate(() => {
  const g = window.__game, r = {};
  window.__clean(); g.pot.ps.stoneskin = 90; g.hurt(null); r.stone = [g.P.hp, g.pot.ps.stoneskin > 0];
  window.__clean(); g.pot.ps.life = 999; g.P.hp = 1; g.hurt(null); r.life = [g.P.hp, g.state];
  window.__clean(); g.pot.ps.invuln = 5; g.hurt(null); r.inv = g.P.hp;
  window.__clean(); g.pot.ps.immune = 100; g.pot.belt = [{id: 5, n: 1}]; g.potDrink(); r.immune = g.pot.ps.hold > 0;
  window.__clean();
  return r;
});
check(prot.stone[0] === 3 && !prot.stone[1], 'Stoneskin takes the next blow, then is gone');
check(prot.life[0] >= 3 && prot.life[1] !== 'dead', 'Second Life brings you back with full hearts');
check(prot.inv === 3, 'invulnerable: no harm');
check(!prot.immune, 'the Panacea keeps a bad potion off you');

// ---- every potion thrown at a monster (and at your own feet)
const thrown = await pg.evaluate(() => {
  const g = window.__game, bad = [], R = {};
  for (let id = 1; id <= 124; id++) {
    if (id === 97 || id === 98) continue;
    window.__clean(); const s = window.__stage();
    try {
      g.potLand({k: 'pt', id, x: s.x, z: s.z, w: 't', by: 'me', yaw: 0}, true);
      R[id] = {pe: s.pe ? Object.keys(s.pe) : [], dead: !!s.dead, x: s.x, stun: s.stun, zones: g.pot.zones.map(z => z.k)};
      for (let k = 0; k < 30; k++) g.update(1 / 30);
      R[id].pv = s.pv | 0; R[id].x1 = s.x; R[id].after = s.pe ? Object.keys(s.pe) : [];
    } catch (e) { bad.push(id + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  }
  window.__clean();
  return {bad, R};
});
check(!thrown.bad.length, 'every potion thrown at a monster runs without an error' + (thrown.bad.length ? ' (' + thrown.bad.slice(0, 3).join('; ') + ')' : ''));
const T = thrown.R, has = (id, k) => T[id] && T[id].pe.includes(k);
check(has(5, 'ice') && (T[5].pv & 31) === 1, 'Frostbite freezes a monster (and it shows)');
check(has(13, 'sleep'), 'Sleep Dust puts it to sleep');
check(has(19, 'pug') && (T[19].pv & 31) === 6, 'Pug Juice turns it into a pug');
check(has(27, 'harm'), 'Wisp Bane on a shade takes the chill out of its touch');
check(T[74].dead, 'Void Cloak sinks a monster through the floor');
check(has(76, 'stone'), 'Stone Garden turns it to stone');
check(has(77, 'pet'), 'Beastmaster makes it a pet');
check(T[57].zones.includes('web') && T[81].zones.includes('fort') && T[78].zones.includes('plague') && T[83].zones.includes('hedge'), 'Web Bomb, Fortress, Black Death and Hedge Wall leave a zone');
check(has(42, 'ice') && has(42, 'dfz'), 'Deep Freeze');
check(T[73].x < 0 || T[73].stun > 0, 'Sunburst banishes or stuns it');

// ---- behaviours over time
const beh = await pg.evaluate(() => {
  const g = window.__game, r = {}, P = g.P;
  const run = n => { for (let k = 0; k < n; k++) g.update(1 / 30); };
  // a pet follows you around and never hurts you
  window.__clean(); let s = window.__stage(); s.pe = {pet: 60}; s.pk = {own: 'me'}; P.x += 0; const d0 = Math.hypot(s.x - P.x, s.z - P.z);
  s.x = P.x + 4; s.gx = Math.floor(s.x); run(90); r.pet = [d0, Math.hypot(s.x - P.x, s.z - P.z), P.hp];
  // a pug walks right into you and does nothing
  window.__clean(); s = window.__stage(); s.pe = {pug: 60}; s.x = P.x + 0.3; s.state = 1; run(30); r.pug = P.hp;
  // a burning monster runs away from you
  window.__clean(); s = window.__stage(); const a = Math.hypot(s.x - P.x, s.z - P.z); s.pe = {burn: 3}; run(45); r.flee = [a, Math.hypot(s.x - P.x, s.z - P.z)];
  // a fortress keeps a monster out
  window.__clean(); s = window.__stage(); g.potLand({id: 81, x: P.x, z: P.z, w: 't', by: 'me', yaw: 0}, true); s.x = P.x + 0.5; s.state = 1; run(60);
  r.fort = [Math.hypot(s.x - P.x, s.z - P.z), P.hp];
  // time stop: monsters stand still
  window.__clean(); s = window.__stage(); s.state = 1; const x0 = s.x; g.potLand({id: 95, x: P.x, z: P.z, w: 'd', by: 'me', yaw: 0}, true); run(30); r.stop = [x0, s.x, g.pot.stop];
  window.__clean(); g.update(1/30);
  // a thrown bottle flies, lands and splashes
  s = window.__stage(); P.yaw = 0; P.pitch = 0; g.pot.belt = [{id: 13, n: 1}]; g.pot.sel = 0; g.potThrow(); const fly = g.pot.proj.length; run(30);
  r.thr = [fly, g.pot.proj.length, s.pe ? Object.keys(s.pe) : [], g.pot.belt.length];
  window.__clean();
  return r;
});
check(beh.pet[1] < 1.6 && beh.pet[2] === 3, 'a pet comes to you and never hurts you (' + beh.pet[1].toFixed(2) + ' m)');
check(beh.pug === 3, 'a monster turned into a pug is harmless');
check(beh.flee[1] > beh.flee[0], 'a burning monster runs away (' + beh.flee[0].toFixed(1) + ' -> ' + beh.flee[1].toFixed(1) + ' m)');
check(beh.fort[0] > 1.6 && beh.fort[1] === 3, 'a Fortress keeps monsters out (' + beh.fort[0].toFixed(2) + ' m)');
check(Math.abs(beh.stop[1] - beh.stop[0]) < 0.01 && beh.stop[2] > 0, 'Time Stop: monsters stand still');
check(beh.thr[0] === 1 && beh.thr[1] === 0 && beh.thr[2].includes('sleep') && beh.thr[3] === 0, 'a thrown Sleep Dust flies, shatters on the monster and puts it to sleep');

// ---- World Key and Pandemonium
const wk = await pg.evaluate(async () => {
  const g = window.__game; window.__clean(); const d = g.R.depth;
  g.pot.belt = [{id: 98, n: 1}]; g.pot.sel = 0; g.potDrink(); const pnd = g.pot.pnd;
  g.wof.done = true; g.wof.win = 0; g.update(1 / 30); const spun = !g.wof.done;
  g.wof.done = true; g.pot.pnd = 0;
  g.pot.belt = [{id: 97, n: 1}]; g.potDrink();
  await new Promise(r => setTimeout(r, 4000));
  for (let k = 0; k < 200 && g.state !== 'play'; k++) await new Promise(r => setTimeout(r, 100));
  return {pnd, spun, d0: d, d1: g.R.depth};
});
check(wk.pnd === 3 && wk.spun, 'Pandemonium spins the wheel, three times');
check(wk.d1 === wk.d0 + 1, 'the World Key takes you down a floor');



// ---- blends: every pair brews something
const bl = await pg.evaluate(() => {
  const g = window.__game, r = {sludge: 0, bad: 0, tierBad: [], uniq: new Set()};
  for (let i = 0; i < 14; i++) for (let j = i; j < 14; j++) { const id = g.brewAny({ing: i}, {ing: j}); if (id === 40) r.sludge++; if (!g.potInfo(id) || g.potInfo(id).tier !== 1) r.bad++; r.uniq.add(id); }
  for (let a = 1; a <= 124; a++) for (let b = a; b <= 124; b++) { const id = g.brewAny({pot: a}, {pot: b}), p = g.potInfo(id), ta = g.POTIONS[a].tier, tb = g.POTIONS[b].tier, want = ta === tb ? Math.min(4, ta + 1) : Math.ceil((ta + tb) / 2);
    if (!p || p.tier !== want) r.tierBad.push(a + '+' + b); }
  r.t11 = g.potInfo(g.brewAny({pot: 3}, {pot: 4})).tier; r.t33 = g.potInfo(g.brewAny({pot: 71}, {pot: 72})).tier; r.t44 = g.potInfo(g.brewAny({pot: 91}, {pot: 99})).tier;
  const s = g.potInfo(g.brewAny({ing: 0}, {ing: 0}));
  const up = g.potInfo(g.brewAny({pot: 3}, {pot: 71}));
  const deep = g.potInfo(g.brewAny({pot: up.id}, {pot: 91}));
  return {t: [r.t11, r.t33, r.t44], sludge: r.sludge, bad: r.bad, uniq: r.uniq.size, tierBad: r.tierBad.slice(0, 5), same: [s.name, s.boost], up: [up.name, up.tier], deep: [deep.name, deep.tier, deep.parts.length], ingPot: g.brewAny({ing: 0}, {pot: 3})};
});
check(bl.sludge === 0 && bl.bad === 0 && bl.uniq > 80, 'all 105 pairs of ingredients brew a potion (' + bl.uniq + ' different ones)');
check(bl.t.join() === '2,4,4', 'two potions of a tier always make the next tier up (1+1 -> ' + bl.t[0] + ', 3+3 -> ' + bl.t[1] + ', 4+4 -> ' + bl.t[2] + ')');
check(!bl.tierBad.length, 'same tiers go up one, different tiers give the middle, rounded up' + (bl.tierBad.length ? ' (' + bl.tierBad + ')' : ''));
check(bl.same[0] === 'Potent Glow Draught' && bl.same[1] === 1.5, 'the same ingredient twice is a boosted potion (' + bl.same[0] + ')');
check(bl.up[1] === 2 && bl.up[0] === 'Strong Swift Storm Brew', 'tier 1 + tier 3 makes a tier-2 blend of both, with its own name (' + bl.up[0] + ')');
check(bl.deep[1] === 3 && bl.deep[2] === 2, 'a blend of a blend keeps two effects (' + bl.deep[0] + ')');
check(bl.ingPot === 40, 'an ingredient and a potion do not mix: Murky Sludge');

const names = await pg.evaluate(() => { const g = window.__game, seen = new Set(g.POTIONS.filter(Boolean).map(p => p.name));let n = 0, dup = 0;
  for (let t = 1; t <= 4; t++) for (let lv = 0; lv < 5; lv++) for (let a = 1; a <= 124; a++) for (let b = 0; b <= 124; b++) { if (b && b <= a) continue;
    const p = g.potInfo(1000000 + ((t * 5 + lv) * 125 + a) * 125 + b); if (!p) continue; n++; if (seen.has(p.name)) dup++; seen.add(p.name); }
  return {n, dup}; });
check(names.n > 80000 && names.dup === 0, 'every one of the ' + names.n + ' possible blends has its own name');
const blendUse = await pg.evaluate(() => {
  const g = window.__game, bad = [];let n = 0;
  const ids = [];for (let a = 1; a <= 124; a += 3) for (let b = a + 1; b <= 124; b += 13) ids.push(g.brewAny({pot: a}, {pot: b}));
  for (const id of ids) { if ([97, 98].some(q => (g.potInfo(id).parts || [id]).includes(q))) continue; n++;
    window.__clean(); const s = window.__stage();
    try { g.pot.belt = [{id, n: 2}]; g.pot.sel = 0; g.potDrink(); g.potLand({k: 'pt', id, x: s.x, z: s.z, w: 't', by: 'me', yaw: 0}, true); for (let k = 0; k < 10; k++) g.update(1 / 30); }
    catch (e) { bad.push(g.potInfo(id).name + ': ' + e.message); } }
  window.__clean(); g.pot.belt = [{id: g.brewAny({ing: 0}, {ing: 0}), n: 1}]; g.potDrink();
  const quick = g.pot.ps.glow; window.__clean();
  return {n, bad, quick};
});
check(!blendUse.bad.length, blendUse.n + ' blends drunk and thrown without an error' + (blendUse.bad.length ? ' (' + blendUse.bad.slice(0, 3).join('; ') + ')' : ''));
check(blendUse.quick > 60 * 1.4, 'a boosted blend lasts longer (Potent Glow Draught: ' + Math.round(blendUse.quick) + ' s)');


// ---- ingredients stay with you from run to run; potions do not
const keep = await pg.evaluate(() => {
  const g = window.__game, T = g.pot, it = g.F.items.find(i => i.type === 'ingr' && !i.got);
  T.bag.fill(0); T.bag[5] = 2; T.belt = [{id: 3, n: 1}];
  if (it) { g.P.x = it.x; g.P.z = it.z; g.P.y = 0; g.onTileChange(); g.update(1 / 60); }
  const want = T.bag.slice(), saved = JSON.parse(localStorage.getItem('emberdeep.brewBag') || 'null');
  g.startRun('KEEP1', 1, true);
  return {want, saved, after: T.bag.slice(), belt: T.belt.length};
});
check(JSON.stringify(keep.saved) === JSON.stringify(keep.want), 'picking up an ingredient saves your bag');
check(JSON.stringify(keep.after) === JSON.stringify(keep.want) && keep.belt === 0, 'a new run keeps your ingredients (and starts with an empty belt)');


// ---- tiers that matter, buffs and debuffs kept apart, and the new potions
const tiers = await pg.evaluate(() => {
  const g = window.__game, r = {};
  const drinkQuick = id => { window.__clean(); window.__stage(); g.pot.belt = [{id, n: 1}]; g.pot.sel = 0; g.potDrink(); return {t: g.pot.ps.quick, m: g.pot.pm.quick || 1}; };
  r.t1 = drinkQuick(3); r.t3 = drinkQuick(g.brewAny({pot: g.brewAny({pot: 3}, {pot: 3})}, {pot: g.brewAny({pot: 101}, {pot: 101})}));
  r.t3p = g.potInfo(g.brewAny({pot: g.brewAny({pot: 3}, {pot: 3})}, {pot: g.brewAny({pot: 101}, {pot: 101})}));
  r.t3p = {tier: r.t3p.tier, name: r.t3p.name};
  // a buff and a debuff never share a bottle
  let mixed = 0, n = 0;
  for (let a = 1; a <= 124; a++) for (let b = a; b <= 124; b++) { const p = g.potInfo(g.brewAny({pot: a}, {pot: b})); n++; if (p.mix && p.parts.some(q => g.POTIONS[q].debuff !== p.debuff)) mixed++; }
  for (let i = 0; i < 14; i++) for (let j = i; j < 14; j++) { const p = g.potInfo(g.brewAny({ing: i}, {ing: j})); n++; if (p.mix && p.parts.some(q => g.POTIONS[q].debuff !== p.debuff)) mixed++; }
  r.mixed = mixed; r.n = n;
  const qm = g.potInfo(g.brewAny({pot: 3}, {pot: 4})); r.qm = {debuff: qm.debuff, parts: qm.parts};
  r.debuffs = g.POTIONS.filter(p => p && p.debuff).length; r.buffs = g.POTIONS.filter(p => p && !p.debuff).length;
  r.text = [g.POTIONS[3].you, g.POTIONS[42].you];
  // new ones
  window.__clean(); g.pot.belt = [{id: 104, n: 1}]; g.potDrink(); g.hurt(null); r.thick = [g.P.hp, g.pot.thick];
  window.__clean(); g.pot.belt = [{id: 117, n: 1}]; g.potDrink(); g.hurt(null); r.hex = g.P.hp;
  window.__clean(); let s = window.__stage(); g.potLand({id: 115, x: s.x, z: s.z, w: 't', by: 'me'}, true); s.hpMax = 6; s.hp = 6; g.wApply({i: g.F.shades.indexOf(s), d: 1}, 'me'); r.vuln = 6 - s.hp;
  window.__clean(); s = window.__stage(); for (const o of g.F.shades) if (o !== s) o.stun = 99; g.potLand({id: 119, x: s.x, z: s.z, w: 't', by: 'me'}, true); const d0 = Math.hypot(s.x - g.P.x, s.z - g.P.z); s.stun = 0; for (let k = 0; k < 40; k++) g.update(1 / 30); r.fear = [d0, Math.hypot(s.x - g.P.x, s.z - g.P.z)];
  window.__clean(); g.pot.belt = [{id: 3, n: 1}, {id: 5, n: 1}, {id: 114, n: 1}]; g.pot.sel = 2; g.potDrink(); r.butter = g.pot.belt.length;
  window.__clean(); for (const o of g.F.shades) { o.stun = 999; o.x = o.z = -99; }   // nothing left to wander into you while the next checks run
  return r;
});
check(tiers.t3p.tier === 3 && tiers.t3.t > tiers.t1.t * 2 && tiers.t3.m > tiers.t1.m * 1.5, 'a tier-3 haste blend lasts over twice as long and is much faster than a tier-1 Quickstep (' + Math.round(tiers.t1.t) + ' s x' + tiers.t1.m + ' vs ' + Math.round(tiers.t3.t) + ' s x' + tiers.t3.m.toFixed(2) + ')');
check(tiers.mixed === 0, 'no potion carries both a buff and a debuff (' + tiers.n + ' mixes checked)');
check(!tiers.qm.debuff && tiers.qm.parts.join() === '3', 'Quickstep + Molasses: the debuff boils off, leaving haste');
check(tiers.buffs >= 70 && tiers.debuffs >= 35, 'more buffs (' + tiers.buffs + ') and debuffs (' + tiers.debuffs + ')');
check(/9 s/.test(tiers.text[1]), 'descriptions show the tier\'s stronger numbers (' + tiers.text[1] + ')');
check(tiers.thick[0] === 3 && tiers.thick[1] === 1, 'Thick Hide: a wound only chills you');
check(tiers.hex === 1, 'Witchfire Hex: the next wound costs two hearts');
check(tiers.vuln === 2, 'Weakling Brew thrown: the monster takes double damage');
check(tiers.fear[1] > tiers.fear[0] + 1, 'Nightmare Draught thrown: the monster flees');
check(tiers.butter === 1, 'Butterfingers: you drop another potion');

// ---- the inventory and the hot bar
const inv = await pg.evaluate(() => {
  const g = window.__game, T = g.pot; window.__clean();
  T.belt = [{id: 3, n: 2}, {id: 13, n: 1}, {id: 48, n: 1}]; T.sel = 0; T.bag.fill(0); T.bag[0] = 3; T.bag[8] = 1; T.hudK = ''; g.update(1 / 60);
  const hot = document.querySelectorAll('#belt .s').length, empty = document.querySelectorAll('#belt .s.e').length;
  const key = c => window.dispatchEvent(new KeyboardEvent('keydown', {code: c, shiftKey: false}));
  const up = c => window.dispatchEvent(new KeyboardEvent('keyup', {code: c}));
  key('KeyI'); up('KeyI');
  const open = g.state === 'talk' && !!g.talk?.inv && !document.getElementById('inv').classList.contains('hidden');
  const cards = document.querySelectorAll('#inv .c').length, beltHidden = document.getElementById('belt').style.display === 'none';
  key('ArrowRight'); up('ArrowRight'); const det = document.querySelector('#inv .det .nm')?.textContent;
  key('Enter'); up('Enter'); const sel = T.sel;
  window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ArrowLeft', shiftKey: true})); up('ArrowLeft');
  const moved = T.belt.map(b => b.id).join();
  key('ArrowDown'); up('ArrowDown'); const ingDet = document.querySelector('#inv .det .nm')?.textContent;
  return {hot, empty, open, cards, beltHidden, det, sel, moved, ingDet};
});
check(inv.hot === 6 && inv.empty === 3, 'the hot bar always shows six slots (three empty here)');
check(inv.open && inv.cards === 20 && inv.beltHidden, 'I opens the inventory: 6 belt slots and 14 ingredients');
check(inv.det === 'Sleep Dust' && inv.sel === 1, 'arrows move the focus, Enter makes a potion the active one');
check(inv.moved === '13,3,48', 'Shift+left moves a potion along the belt');
check(inv.ingDet === 'Glowcap', 'down goes to the ingredients, with where they are found and what they brew');
await shot('07-inventory');
const invClose = await pg.evaluate(() => { const g = window.__game; window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape'})); window.dispatchEvent(new KeyboardEvent('keyup', {code: 'Escape'}));
  return {state: g.state, hidden: document.getElementById('inv').classList.contains('hidden')}; });
check(invClose.state === 'play' && invClose.hidden, 'Esc closes it');

// ---- pictures: the belt, a frozen shade, a pug, a splash
await pg.evaluate(() => { const g = window.__game; window.__clean(); const s = window.__stage(); g.pot.belt = [{id: 5, n: 2}, {id: 19, n: 1}, {id: 43, n: 1}, {id: 73, n: 1}, {id: 100, n: 1}]; g.pot.sel = 0;
  const sh = g.F.shades.filter(q => q.type === 0); if (sh[0]) { sh[0].x = g.P.x + 1.8; sh[0].z = g.P.z - 0.25; sh[0].pe = {ice: 99}; sh[0].pv = 1; }
  if (sh[1]) { sh[1].x = g.P.x + 2.2; sh[1].z = g.P.z + 0.3; sh[1].pe = {pug: 99}; sh[1].pv = 6; } else if (s) { s.pe = {pug: 99}; }
  g.pot.hudK = ''; });
await frames(4);
await shot('04-frozen-and-pug');
await pg.evaluate(() => { const g = window.__game; g.pot.ps.fire = 20; for (let k = 0; k < 12; k++) g.update(1 / 30); });
await shot('05-dragonfire');
await pg.evaluate(() => { const g = window.__game; g.pot.ps.fire = 0; g.potLand({id: 57, x: g.P.x + 1.6, z: g.P.z, w: 't', by: 'me', yaw: 0}, true); g.potLand({id: 81, x: g.P.x + 3, z: g.P.z, w: 't', by: 'me', yaw: 0}, true); for (let k = 0; k < 8; k++) g.update(1 / 30); });
await shot('06-zones');

check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
