// node tools/smith_test.mjs [--shots DIR] [--q low|medium|high]
// Checks the Blacksmith and his weapons in a built index.html: where he stands, forging, the skill paths and augments (and that they are
// kept), each of the five weapons hurting monsters in its own way, monsters dying and coming back, and the new mouse controls.
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
await pg.addInitScript(q => { localStorage.setItem('emberdeep.quality', JSON.stringify(q)); localStorage.setItem('emberdeep.wallet', '2000'); }, A.q);
await pg.goto(pathToFileURL(resolve(root, 'index.html')).href);
await pg.waitForFunction(() => window.__game && window.__game.startRun, null, {timeout: 120000});
const frames = n => pg.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const shot = async name => { if (A.shots) { await frames(3); await pg.screenshot({path: resolve(A.shots, name + '.png')}); console.log('  shot', name); } };
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// ---- where he stands, across many sanctuaries
const place = await pg.evaluate(() => {
  const g = window.__game, r = {n: 0, bad: []};
  for (const seed of ['SM1', 'SM2', 'SM3', 'SM4', 'SM5', 'SM6']) for (let d = 1; d <= 8; d++) {
    const F = g.genFloor(seed, d);if (!F.safe) continue;r.n++;
    const sm = F.npcs.find(n => n.type === 'smith'), S = F.safe;if (!sm) { r.bad.push(seed + d + ' none'); continue; }
    const others = F.npcs.filter(n => n !== sm && ['keeper', 'pat', 'brewer'].includes(n.type));
    const things = [[S.smith.ax, S.smith.az, 'anvil'], [sm.x, sm.z, 'smith']];
    for (const [x, z, what] of things) { const i = Math.floor(z) * F.W + Math.floor(x); if (F.g[i] !== 0 || F.safeMask[i] !== 1) r.bad.push(seed + d + ' ' + what + ' off floor'); }
    for (const o of others) if (Math.hypot(o.x - sm.x, o.z - sm.z) < 0.6 || Math.hypot(o.x - S.smith.ax, o.z - S.smith.az) < 0.5) r.bad.push(seed + d + ' crowds ' + o.type);
    if (S.wheel && Math.hypot(S.wheel.x - S.smith.ax, S.wheel.z - S.smith.az) < 1) r.bad.push(seed + d + ' wheel');
    if (S.brew && Math.hypot(S.brew.cx - S.smith.ax, S.brew.cz - S.smith.az) < 1) r.bad.push(seed + d + ' cauldron');
  }
  return r;
});
check(place.n > 10 && !place.bad.length, 'the Blacksmith and his anvil stand in every sanctuary (' + place.n + '), in their own corner' + (place.bad.length ? ' (' + place.bad.slice(0, 4) + ')' : ''));

const info = await pg.evaluate(() => {
  const g = window.__game;for (const s of ['SM1', 'SM2', 'SM3']) { g.startRun(s, 2, true); if (g.F.safe) break; }
  const F = g.F, n = F.npcs.find(q => q.type === 'smith'), P = g.P, S = F.safe;
  const dx = S.x - n.x, dz = S.z - n.z, d = Math.hypot(dx, dz);P.x = n.x + dx / d * 0.9; P.z = n.z + dz / d * 0.9; P.yaw = Math.atan2(n.z - P.z, n.x - P.x); P.pitch = -0.1; g.onTileChange();
  return {ok: !!n};
});
await frames(8);
await shot('01-blacksmith');

// ---- the forge menu, and weapons that level up as you fight
const menu = await pg.evaluate(() => {
  const g = window.__game, n = g.F.npcs.find(q => q.type === 'smith'), r = {};
  for (const w of g.WEAPONS) { g.smith.own[w.id] = false; g.smith.xp[w.id] = 0; g.smith.p1[w.id] = -1; g.smith.p2[w.id] = -1; } g.smith.eq = '';
  g.P.x = n.x - 0.7; g.P.z = n.z; g.onTileChange(); g.wallet = 2000;
  g.openTalk(n); r.name = document.getElementById('talkName').textContent;
  const pick = l => { const i = g.talk.opts.findIndex(o => o.label === l || o.label.startsWith(l)); if (i < 0) return false; g.talk.sel = i; g.pickTalk(); return true; };
  const labels = () => g.talk.opts.map(o => o.label);
  r.forgeRows = g.talk.opts.filter(o => /^Forge the /.test(o.label)).length;
  const w0 = g.wallet; pick('Forge the Ashen Blade'); r.cost = w0 - g.wallet; r.own = g.smith.own.sword; r.eq = g.smith.eq;
  r.page1 = labels(); r.lvl1 = g.wLevelOf(g.smith.xp.sword).L;
  // fighting earns XP: hits and kills
  g.wGainXp('sword', 20); g.wReward(0); r.xpAfter = g.smith.xp.sword;
  r.hud = (document.querySelector('#belt .w .lv') || {}).textContent;
  // reach level 4: a path to choose from five
  g.wGainXp('sword', g.wXpFor(4) - g.smith.xp.sword); r.lvl4 = g.wLevelOf(g.smith.xp.sword).L; r.choice4 = g.wChoice('sword');
  g.talk.bm = 'w:sword'; g.talk.sel = 0; g.pickTalk(); pick('Back'); pick('Ashen Blade');
  r.paths = g.talk.opts.filter(o => /^(Keen Edge|Bloodletting|Flurry|Whirlwind|Parry)$/.test(o.label)).length;
  pick('Keen Edge'); r.p1 = g.smith.p1.sword; r.rank4 = g.wRanks('sword').R[0];
  g.wGainXp('sword', g.wXpFor(8) - g.smith.xp.sword); r.rank8 = g.wRanks('sword').R[0];
  // level 10: another path from the other four, or a mutation of the first
  g.wGainXp('sword', g.wXpFor(10) - g.smith.xp.sword); r.choice10 = g.wChoice('sword'); pick('Back'); pick('Ashen Blade');
  r.second = g.talk.opts.filter(o => /^Second path: /.test(o.label)).length; r.mut = g.talk.opts.some(o => /^Mutation: Shatter/.test(o.label));
  pick('Mutation: Shatter'); r.aug = g.wRanks('sword').A[0];
  g.wGainXp('sword', g.wXpFor(12) - g.smith.xp.sword); r.rank12 = g.wRanks('sword').R[0];
  r.saved = JSON.parse(localStorage.getItem('emberdeep.smith'));
  r.dmg1 = g.wStats('sword').dmg;
  pick('Back'); for (const nm of ['Stonebreaker Maul', 'Rustwind Crossbow', 'Thornwood Spear', 'Ember Censer']) { pick('Forge the ' + nm); pick('Back'); }
  r.owned = g.WEAPONS.filter(w => g.smith.own[w.id]).length;
  g.closeTalk();
  return r;
});
check(menu.name.includes('Blacksmith'), 'talking to him opens the Blacksmith\'s menu');
check(menu.forgeRows === 5, 'five weapons to forge');
check(menu.cost === 15 && menu.own && menu.eq === 'sword' && menu.lvl1 === 1, 'forging the Ashen Blade costs 15 gems and puts it in your hand, at level 1');
check(menu.xpAfter > 20, 'hits and kills earn the weapon XP (' + menu.xpAfter + ')');
check(menu.lvl4 === 4 && menu.choice4 === 1 && menu.paths === 5, 'at level 4 the Blacksmith offers five paths to choose from');
check(menu.p1 === 0 && menu.rank4 === 1 && menu.rank8 === 5, 'the chosen path ranks up with every level, to 5 at level 8');
check(menu.choice10 === 2 && menu.second === 4 && menu.mut, 'at level 10: a second path from the other four, or a mutation of the first');
check(menu.aug && menu.rank12 === 7, 'the mutation fits the augment and adds two more ranks');
check(menu.saved && menu.saved.own.sword && menu.saved.p1.sword === 0 && menu.saved.p2.sword === 5 && menu.saved.xp.sword > 0, 'weapons, XP and choices are saved');
check(menu.owned === 5, 'all five weapons forged');
const kept = await pg.evaluate(() => { const g = window.__game; g.startRun('KEEPW', 6, true); return {own: g.smith.own.sword, lv: g.wLevelOf(g.smith.xp.sword).L}; });
check(kept.own && kept.lv === 12, 'they are still yours, at the same level, in a new run');
const hudEl = await pg.evaluate(() => { const g = window.__game; g.update(1 / 30); const e = document.querySelector('#belt .w.on'); return e ? e.querySelector('.lv').textContent + '|' + e.title : ''; });
check(/^12\|.*level 12/.test(hudEl), 'the hot bar shows the weapon\'s level and XP (' + hudEl + ')');

// ---- combat helpers
await pg.evaluate(() => {
  const g = window.__game;
  window.__spot = () => { const F = g.F; for (let y = 2; y < F.H - 2; y++) for (let x = 2; x < F.W - 8; x++) { let ok = true; for (let k = 0; k < 7; k++) { const i = y * F.W + x + k; if (F.g[i] || F.safeMask[i] || F.pocketMask[i]) ok = false; } if (ok) return [x, y]; } return null; };
  window.__arena = (dist, type = 0) => { const s0 = window.__spot(), P = g.P; P.x = s0[0] + 0.5; P.z = s0[1] + 0.5; P.y = 0; P.yaw = 0; P.pitch = 0; P.hp = 3; P.inv = 0; P.ward = 0; g.onTileChange();
    let m = null; for (const s of g.F.shades) { s.pe = null; s.bleed = s.burnD = null; s.down = 0; if (s.type === 3) continue; s.x = s0[0] + 6.5; s.z = s0[1] + 0.5; s.stun = 9; }
    m = g.F.shades.find(s => s.type === type) || g.F.shades.find(s => s.type !== 3);
    m.x = P.x + dist; m.z = P.z; m.gx = Math.floor(m.x); m.gy = Math.floor(m.z); m.px = -1; m.stun = 0; m.state = 0; m.dead = false; m.hpMax = 0; m.hitT = 0; m.markT = 0;
    g.W.cd = 0; g.W.parryT = 0; g.W.safeT = 0; return m; };
  // a weapon with a path at a rank (levels 4-8 rank a path 1-5); an augment means the mutation at level 10+
  window.__equip = (id, L = [0, 0, 0, 0, 0], Au = [0, 0, 0, 0, 0]) => { g.smith.own[id] = true; g.smith.eq = id; const k = L.findIndex(v => v > 0), mut = Au.some(Boolean);
    g.smith.p1[id] = k; g.smith.p2[id] = mut && k >= 0 ? 5 : -1; g.smith.xp[id] = g.wXpFor(k < 0 ? 1 : mut ? 10 : 3 + L[k]); };
});
const fight = await pg.evaluate(() => {
  const g = window.__game, r = {};
  const run = n => { for (let k = 0; k < n; k++) g.update(1 / 30); };
  // each weapon at level 0 hurts a shade in reach
  for (const [id, d] of [['sword', 1], ['hammer', 1], ['spear', 1.8], ['censer', 1.3], ['crossbow', 5]]) {
    window.__equip(id); const m = window.__arena(d); g.wAttack(); run(id === 'crossbow' ? 15 : 1);
    r[id] = {hp: m.hp, max: m.hpMax, x: m.x, d};
  }
  // the maul knocks back; the spear reaches further than the sword
  window.__equip('hammer'); let m = window.__arena(0.9); const x0 = m.x; g.wAttack(); r.knock = m.x - x0;
  window.__equip('sword'); m = window.__arena(1.8); g.wAttack(); r.swordFar = m.hpMax ? m.hp : 'untouched';
  // bleeding keeps hurting
  window.__equip('sword', [0, 3, 0, 0, 0]); m = window.__arena(1); g.wAttack(); const h1 = m.hp; run(45); r.bleed = [h1, m.hp];
  // the censer's light sears a shade harder than a pale statue
  window.__equip('censer'); m = window.__arena(1, 0); g.wAttack(); r.lightShade = m.hpMax - m.hp;
  m = window.__arena(1, 1); g.W.cd = 0; g.wAttack(); r.lightStatue = m.hpMax ? m.hpMax - m.hp : 0;
  // killing: the monster is gone, you get gems, and it comes back later
  window.__equip('hammer', [5, 0, 0, 0, 0]); m = window.__arena(1); const w0 = g.wallet; let n = 0;
  while (!(m.down > 0) && n++ < 10) { g.W.cd = 0; m.stun = 0; m.x = g.P.x + 1; m.z = g.P.z; g.wAttack(); }
  r.kill = {down: m.down > 0, x: m.x, gems: g.wallet - w0};
  m.down = 0.05; run(3); r.back = {x: m.x, hp: m.hp, max: m.hpMax};
  // parry: a blow right after a swing is blocked; the maul's bulwark sometimes shrugs one off
  window.__equip('sword', [0, 0, 0, 0, 3]); m = window.__arena(1); g.wAttack(); g.P.inv = 0; g.hurt(m); r.parry = [g.P.hp, m.stun > 0];
  g.W.parryT = 0; g.P.inv = 0; g.P.hp = 3; g.hurt(m); r.noParry = g.P.hp;
  // the spear lunges you forward
  window.__equip('spear', [0, 0, 0, 3, 0]); m = window.__arena(3); const px = g.P.x; g.wAttack(); r.lunge = g.P.x - px;
  // a blast bolt hurts what is beside its target
  window.__equip('crossbow', [0, 0, 0, 3, 0]); m = window.__arena(4); const o = g.F.shades.find(s => s !== m && s.type !== 3);
  m.stun = 5; if (o) { o.x = m.x + 0.3; o.z = m.z + 0.3; o.stun = 5; o.hpMax = 0; o.down = 0; o.dead = false; } g.wAttack(); run(15); r.blast = o && o.hpMax > 0 && o.hp < o.hpMax;
  window.__equip('sword');
  return r;
});
for (const id of ['sword', 'hammer', 'spear', 'censer', 'crossbow']) check(fight[id].max > 0 && fight[id].hp < fight[id].max, 'the ' + id + ' wounds a monster ' + fight[id].d + ' m away (' + (fight[id].max - fight[id].hp).toFixed(1) + ' of ' + fight[id].max.toFixed(1) + ')');
check(fight.knock > 0.3, 'the maul knocks a monster back (' + fight.knock.toFixed(2) + ' m)');
check(fight.swordFar === 'untouched', 'the sword cannot reach 1.8 m; the spear can');
check(fight.bleed[1] < fight.bleed[0] - 0.5, 'Bloodletting: the wound keeps bleeding (' + fight.bleed.map(v => v.toFixed(1)).join(' -> ') + ')');
check(fight.lightShade > fight.lightStatue * 1.5, 'the censer sears a shade much harder than a pale statue (' + fight.lightShade.toFixed(1) + ' vs ' + fight.lightStatue.toFixed(1) + ')');
check(fight.kill.down && fight.kill.x < 0 && fight.kill.gems >= 2, 'a monster killed is gone and pays gems (+' + fight.kill.gems + ')');
check(fight.back.x > 0 && fight.back.hp === fight.back.max, '...and comes back later, somewhere else, whole');
check(fight.parry[0] === 3 && fight.parry[1] && fight.noParry === 2, 'Parry: a blow right after a swing is blocked and the attacker stunned');
check(fight.lunge > 0.5, 'Lunge: the spear carries you forward (' + fight.lunge.toFixed(2) + ' m)');
check(fight.blast, 'Blast Bolts hurt what is beside the target');

// ---- every weapon with every path and augment maxed: no errors over a fight
const maxed = await pg.evaluate(() => {
  const g = window.__game, bad = [];
  for (const w of g.WEAPONS) { window.__equip(w.id, [5, 5, 5, 5, 5], [1, 1, 1, 1, 1]);
    try { for (let k = 0; k < 8; k++) { const m = window.__arena(1 + (k % 3)); g.W.cd = 0; g.wAttack(); for (let q = 0; q < 12; q++) g.update(1 / 30); g.hurt(m); g.P.hp = 3; } } catch (e) { bad.push(w.id + ': ' + e.message); } }
  window.__equip('sword', [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]);
  return bad;
});
check(!maxed.length, 'every weapon, fully upgraded with all augments, fights without an error' + (maxed.length ? ' (' + maxed.join('; ') + ')' : ''));

// ---- controls: left click attacks, right click flashes, E no longer flashes
const ctl = await pg.evaluate(() => {
  const g = window.__game, r = {};window.__equip('sword'); const m = window.__arena(1);
  g.P.flash = 3; g.W.cd = 0; g.clickL(); r.attacked = g.W.cd > 0; r.flashL = g.P.flash;
  g.clickR(); r.flashR = g.P.flash;
  window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyE'})); window.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyE'})); r.flashE = g.P.flash;
  g.smith.eq = 'sword'; window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyY'})); window.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyY'})); r.cycled = g.smith.eq;
  g.smith.eq = 'sword'; return r;
});
check(ctl.attacked && ctl.flashL === 3, 'left click attacks with the weapon in hand (no flash)');
check(ctl.flashR === 2, 'right click throws a flash bomb');
check(ctl.flashE === 2, 'E no longer flashes');
check(ctl.cycled !== 'sword', 'Y switches weapons');


// ---- weapons on the hot bar, and the crosshair
const hb = await pg.evaluate(() => {
  const g = window.__game;window.__equip('sword'); window.__arena(3); g.pot.hudK = ''; g.update(1 / 30);
  const slots = [...document.querySelectorAll('#belt .w')], on = document.querySelector('#belt .w.on'), xh = document.getElementById('xhair');
  const r = {n: slots.length, on: on && on.dataset.w, xh: xh.style.display};
  const ham = slots.find(s => s.dataset.w === 'hammer'); ham.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); g.update(1 / 30);
  r.after = g.smith.eq;r.onAfter = document.querySelector('#belt .w.on')?.dataset.w;
  g.W.cd = 0; g.wAttack(); g.update(1 / 30); r.cd = document.querySelector('#belt .w.on .cd').style.height;
  g.smith.eq = ''; g.update(1 / 30); r.xhOff = xh.style.display;
  window.__equip('crossbow'); g.update(1 / 30); r.dot = xh.querySelector('.d').style.display;
  return r;
});
check(hb.n === 5 && hb.on === 'sword', 'the five weapons sit on the hot bar, the one in hand lit up');
check(hb.after === 'hammer' && hb.onAfter === 'hammer', 'clicking a weapon on the hot bar takes it in hand');
check(parseFloat(hb.cd) > 0, 'the slot shows the weapon recovering after a swing (' + hb.cd + ')');
check(hb.xh === 'block' && hb.xhOff === 'none' && hb.dot === 'block', 'a crosshair shows while a weapon is in hand (with a centre dot for the crossbow)');
await pg.evaluate(() => { const g = window.__game; window.__equip('sword'); window.__arena(2).stun = 99; g.pot.belt = [{id: 3, n: 1}, {id: 13, n: 2}]; g.pot.hudK = ''; g.W.swing = 0; g.update(1 / 30); });
await shot('07-hotbar-crosshair');
// pictures: a swing at a wounded shade, and the crossbow
await pg.evaluate(() => { const g = window.__game; window.__equip('sword'); const m = window.__arena(1.3); m.stun = 99; g.W.cd = 0; g.wAttack(); g.P.pitch = -0.05; });
await frames(2); await shot('02-sword-swing');
await pg.evaluate(() => { const g = window.__game; window.__equip('hammer'); window.__arena(1.3).stun = 99; g.W.swing = 0; });
await shot('03-maul');
await pg.evaluate(() => { const g = window.__game; window.__equip('crossbow'); window.__arena(4).stun = 99; g.W.swing = 0; g.W.cd = 0; g.wAttack(); });
await frames(2); await shot('04-crossbow');
await pg.evaluate(() => { const g = window.__game; window.__equip('censer'); window.__arena(1.3).stun = 99; g.W.swing = 0; });
await shot('05-censer');
await pg.evaluate(() => { const g = window.__game; window.__equip('spear'); window.__arena(1.6).stun = 99; g.W.swing = 0; });
await shot('06-spear');

check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close();
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
