// node tools/npc_shot.mjs [options]  -- screenshots one NPC at standard angles under the same light.
// Needs a built index.html (npm run build). Rendering is software GL here, so each shot takes a while.
//
//   --npc keeper|map|delver   which NPC (map = Ilse, delver = Brakk)          default keeper
//   --views front,34,wide,side,portrait                                       default front,34,wide
//   --out DIR                 where PNGs go                                     default ./shots
//   --prefix NAME             file names are NAME-VIEW.png                      default the npc type
//   --scale 1|2               deviceScaleFactor (1 for quick checks, 2 final)   default 1
//   --size 1280x720           viewport                                          default 1280x720
//   --q low|medium|high       game quality setting (low = Q0, Lambert)          default high
//   --query 'npc=classic'     extra URL query (e.g. the classic Keeper)
//   --seed STUDIO1 --depth 2  floor the studio corridor is picked from
//   --file index.html         which build to load (default the repo's index.html)
//   --pose YAW,PITCH          fixed head angles in radians (check beard/neck at extremes)
//   --blink 0..1              force the eyelids (1 open, 0 shut)
//   --lod N                   force the LOD (0 near, 1 mid, 2 far) to check what far players see
//   --hud                     keep the HUD visible (hidden by default)
//   --stats                   print character vertex counts and sculpt time
//
// Each view calls window.__game.studio(), which moves the NPC into a quiet corridor lit only by the
// player's torch and ambient light, freezes gameplay and fixes the camera.
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const A = {file: resolve(root, 'index.html'), npc: 'keeper', views: 'front,34,wide', out: resolve(root, 'shots'), prefix: '', scale: '1', size: '1280x720', q: 'high', query: '', seed: 'STUDIO1', depth: '2'};
const flags = new Set();
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  if (k === 'hud' || k === 'stats') flags.add(k); else A[k] = process.argv[++i];
}
const seated = A.npc === 'delver';
// standard views: camera distance (m), NPC turn away from camera (deg), camera height, look-at height
const VIEWS = {
  front:    {dist: 1.05, turn: 0,   aimY: seated ? 0.5 : 0.8},
  '34':     {dist: 1.15, turn: 38,  aimY: seated ? 0.45 : 0.78, headLock: true},
  full:     {dist: 1.75,  turn: 0,   aimY: seated ? 0.4 : 0.52, camY: seated ? 0.5 : 0.6},
  full34:   {dist: 1.75,  turn: 38,  aimY: seated ? 0.4 : 0.52, camY: seated ? 0.5 : 0.6, headLock: true},
  profile:  {dist: 0.45, turn: 90,  aimY: 0.9, camY: 0.9, headLock: true},   // head and shoulders from the side (neck and collar)
  side:     {dist: 1.1,  turn: 90,  aimY: seated ? 0.45 : 0.8, headLock: true},
  wide:     {dist: 3.2,  turn: 15,  aimY: seated ? 0.35 : 0.5},
  face:     {dist: 0.38, turn: 0,   aimY: seated ? 0.62 : 0.95, camY: seated ? 0.62 : 0.95},
  hands:    {dist: 0.5,  turn: 20,  aimY: seated ? 0.3 : 0.6, camY: seated ? 0.45 : 0.7},
  ear:      {dist: 0.2,  turn: 90,  aimY: seated ? 0.62 : 0.93, camY: seated ? 0.62 : 0.93, headLock: true},
  ear34:    {dist: 0.24, turn: 55,  aimY: seated ? 0.62 : 0.94, camY: seated ? 0.62 : 0.94, headLock: true},
  closeup:  {dist: 0.2,  turn: 0,   aimY: 0.9, camY: 0.9},
  beard:    {dist: 0.3, turn: 0,   aimY: 0.86, camY: 0.88},   // close-up of the beard and moustache (aim is divided by 0.93 for the Keeper)
  beard34:  {dist: 0.3, turn: 35,  aimY: 0.86, camY: 0.88, headLock: true},
  chest:    {dist: 0.55, turn: 0,   aimY: 0.88, camY: 0.88},
  chest34:  {dist: 0.55, turn: 40,  aimY: 0.88, camY: 0.88, headLock: true},
  chestside:{dist: 0.55, turn: 90,  aimY: 0.88, camY: 0.88, headLock: true},
  hip:      {dist: 0.42, turn: 35,  aimY: 0.46, camY: 0.5, lat: 0.04},
  chestclose:{dist: 0.34, turn: 25, aimY: 0.86, camY: 0.88},
  robe:     {dist: 0.8,  turn: 25,  aimY: 0.5,  camY: 0.5},
  hem:      {dist: 0.6,  turn: 30,  aimY: 0.12, camY: 0.2},
  // the staff hand (hand: camera at azimuth az / elevation el / radius r round it; az 0 = camera on the corridor side the NPC looks to). F: from the front, B: from outside, behind the hand (turn -90 shows the NPC's staff side), T: from above, P: from below
  gripF:    {turn: 20,  hand: {az: 0, el: 8, r: 0.32}},
  gripB:    {turn: -90, hand: {az: 0, el: 8, r: 0.3}},
  gripT:    {turn: 20,  hand: {az: 0, el: 72, r: 0.24}},
  sleeve:   {turn: 25,  hand: {az: 32, el: 8, r: 0.3}},    // the staff arm's hanging sleeve and cuff from the front-left
  sleeveS:  {turn: -50, hand: {az: 10, el: 4, r: 0.42}},   // the same from the staff side
  gripP:    {turn: 20,  hand: {az: 0, el: -60, r: 0.26}},
  gripclose:{dist: 0.28, turn: 0,   aimY: 0.58, camY: 0.6},
  restclose:{dist: 0.28, turn: 0,   aimY: 0.48, camY: 0.5},
  cam:      {dist: 1.3,  turn: 20,  level: true},   // the player's own camera height (camY defaults to EYE) looking straight ahead
  portrait: {dist: 0.62, turn: 0,   aimY: seated ? 0.62 : 0.94, camY: seated ? 0.62 : 0.94},   // face at face height, for detail
};
// the Keeper's recipe height is 0.93: aim and camera heights of standing views follow it
if (A.npc === 'keeper') for (const o of Object.values(VIEWS)) { o.aimY = +(o.aimY * 0.93).toFixed(3); if (o.lat) o.lat = +(o.lat * 0.93).toFixed(3); if (o.camY) o.camY = +(o.camY * 0.93).toFixed(3); }
const [w, h] = A.size.split('x').map(Number);
mkdirSync(A.out, {recursive: true});
const b = await chromium.launch();
const ctx = await b.newContext({viewport: {width: w, height: h}, deviceScaleFactor: +A.scale});
const pg = await ctx.newPage(), errs = [];
pg.setDefaultTimeout(600000); // software GL at 2x can take minutes per frame
pg.on('pageerror', e => errs.push(String(e)));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.addInitScript(q => { localStorage.setItem('emberdeep.quality', JSON.stringify(q)); }, A.q);
await pg.goto(pathToFileURL(resolve(A.file)).href + (A.query ? '?' + A.query : ''));
await pg.waitForFunction(() => window.__game && window.__game.studio, null, {timeout: 120000});
if (!flags.has('hud')) await pg.addStyleTag({content: '#hud,#map,#prompt,#toast,#chat,#touch,#fps,#roomHud{display:none!important}'});
const frames = n => pg.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// the Keeper's staff hand in the corridor frame (B: x forward, z to the staff side; grip anchor (0.225, 0.15, 0.18) x figure height 0.93)
function handView(o) {
  const t = o.turn * Math.PI / 180, S = 0.93, hx = 0.225 * S, hz = 0.18 * S, hy = 0.67 * S, h = o.hand, az = h.az * Math.PI / 180, el = h.el * Math.PI / 180;
  const along = hx * Math.cos(t) - hz * Math.sin(t), side = hx * Math.sin(t) + hz * Math.cos(t);
  return {...o, hand: undefined, dist: along + h.r * Math.cos(el) * Math.cos(az), lat: side + h.r * Math.cos(el) * Math.sin(az), camY: hy + h.r * Math.sin(el), aimY: hy, target: [along, side]};
}
for (const v of A.views.split(',')) {
  const o = VIEWS[v] && VIEWS[v].hand ? handView(VIEWS[v]) : VIEWS[v];
  if (!o) { console.log('unknown view', v); continue; }
  const t0 = Date.now();
  const r = await pg.evaluate(o => window.__game.studio(o), {type: A.npc, seed: A.seed, depth: +A.depth, ...o, ...(A.lod != null ? {lod: +A.lod} : {}), ...(A.blink != null ? {blink: +A.blink} : {}), ...(A.pose ? {pose: A.pose.split(',').map(Number), headLock: true} : {})});
  await frames(+A.scale > 1 ? 3 : 6); // head tracking settles, shaders compile
  const file = resolve(A.out, `${A.prefix || A.npc}-${v}.png`);
  await pg.screenshot({path: file, timeout: 600000});
  console.log(file, `Q${r.Q}`, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (flags.has('stats')) console.log('stats', JSON.stringify(await pg.evaluate(() => ({ch: window.__game.CH.n, sculpt: window.__game.keeperStats}))));
if (errs.length) { console.log('console errors:'); for (const e of errs) console.log('  ' + e); process.exitCode = 1; }
await b.close();
