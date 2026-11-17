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
  side:     {dist: 1.1,  turn: 90,  aimY: seated ? 0.45 : 0.8, headLock: true},
  wide:     {dist: 3.2,  turn: 15,  aimY: seated ? 0.35 : 0.5},
  face:     {dist: 0.38, turn: 0,   aimY: seated ? 0.62 : 0.95, camY: seated ? 0.62 : 0.95},
  hands:    {dist: 0.5,  turn: 20,  aimY: seated ? 0.3 : 0.6, camY: seated ? 0.45 : 0.7},
  ear:      {dist: 0.2,  turn: 90,  aimY: seated ? 0.62 : 0.93, camY: seated ? 0.62 : 0.93, headLock: true},
  ear34:    {dist: 0.24, turn: 55,  aimY: seated ? 0.62 : 0.94, camY: seated ? 0.62 : 0.94, headLock: true},
  closeup:  {dist: 0.2,  turn: 0,   aimY: 0.9, camY: 0.9},
  chest:    {dist: 0.55, turn: 0,   aimY: 0.88, camY: 0.88},
  chest34:  {dist: 0.55, turn: 40,  aimY: 0.88, camY: 0.88, headLock: true},
  chestside:{dist: 0.55, turn: 90,  aimY: 0.88, camY: 0.88, headLock: true},
  robe:     {dist: 0.8,  turn: 25,  aimY: 0.5,  camY: 0.5},
  hem:      {dist: 0.6,  turn: 30,  aimY: 0.12, camY: 0.2},
  gripF:    {dist: 0.3,  turn: 0,   aimY: 0.6,  camY: 0.62, lat: 0.17},
  gripB:    {dist: 0.3,  turn: 180, aimY: 0.6,  camY: 0.62, lat: -0.17},
  gripT:    {dist: 0.12, turn: 0,   aimY: 0.6,  camY: 0.9,  lat: 0.17},
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
for (const v of A.views.split(',')) {
  const o = VIEWS[v];
  if (!o) { console.log('unknown view', v); continue; }
  const t0 = Date.now();
  const r = await pg.evaluate(o => window.__game.studio(o), {type: A.npc, seed: A.seed, depth: +A.depth, ...o, ...(A.pose ? {pose: A.pose.split(',').map(Number), headLock: true} : {})});
  await frames(+A.scale > 1 ? 3 : 6); // head tracking settles, shaders compile
  const file = resolve(A.out, `${A.prefix || A.npc}-${v}.png`);
  await pg.screenshot({path: file, timeout: 600000});
  console.log(file, `Q${r.Q}`, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
if (flags.has('stats')) console.log('stats', JSON.stringify(await pg.evaluate(() => ({ch: window.__game.CH.n, sculpt: window.__game.keeperStats}))));
if (errs.length) { console.log('console errors:'); for (const e of errs) console.log('  ' + e); process.exitCode = 1; }
await b.close();
