// node tools/lift_cold_ride_test.mjs [--depth 25]
// A player who walks straight from the bunk room into the lift, never standing still long enough for the lobby to prepare anything,
// and rides deep. Nothing may compile a shader "on the spot" during that ride (drawing a material for the first time, which stalls
// the page until the GPU driver is done): every program must come from a background compile (renderer.compile / compileAsync).
// Headless Chromium has no parallel shader compile, so the ride itself is slow here; what this checks is where programs come from.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const arg = (k, d) => {const i = process.argv.indexOf('--' + k);return i < 0 ? d : process.argv[i + 1]};
const DEPTH = +arg('depth', 25);
const srv = await serve(root), b = await chromium.launch(), errs = [];
let fails = 0;
const check = (ok, what) => {console.log((ok ? 'ok   ' : 'FAIL ') + what);if (!ok) fails++};
try {
  const pg = await (await b.newContext({viewport: {width: 480, height: 270}})).newPage();
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.addInitScript(() => {
    localStorage.setItem('emberdeep.quality', JSON.stringify('high'));localStorage.setItem('emberdeep.deepest', JSON.stringify(60));
    const C = window.__cold = {inCompile: 0, spot: 0, bg: 0, rec: false};
    const P = WebGL2RenderingContext.prototype, f = P.linkProgram;
    P.linkProgram = function (...a) {if (C.rec) {if (C.inCompile) C.bg++; else C.spot++}return f.apply(this, a)};
  });
  await pg.goto(srv.url + 'index.html');
  await pg.waitForFunction(() => window.__game?.hub?.lobbyReady, null, {timeout: 300000});
  // mark the background compiles: the synchronous part of compile / compileAsync is where their programs are created
  await pg.evaluate(() => {const r = window.__game.renderer, C = window.__cold;
    for (const k of ['compile', 'compileAsync']) {const f = r[k].bind(r);r[k] = (...a) => {C.inCompile++;try {return f(...a)} finally {C.inCompile--}}}});
  const go = await pg.evaluate(d => {const G = window.__game, dd = document.getElementById('liftDepth'), C = window.__cold;
    G.hub.place(0, -8.6, 0, 0);G.openStation('lift');dd.max = 99;dd.value = d;dd.dispatchEvent(new Event('input'));C.rec = true;
    document.getElementById('liftDestination').dispatchEvent(new Event('submit', {cancelable: true}));return G.hub.riding}, DEPTH);
  check(go, 'the lift leaves at once for depth ' + DEPTH);
  for (let i = 0; i < 3000; i++) {if (await pg.evaluate(() => window.__game.state === 'play')) break;await pg.waitForTimeout(200)}
  const r = await pg.evaluate(() => ({...window.__cold, depth: window.__game.R.depth, state: window.__game.state}));
  check(r.state === 'play' && r.depth === DEPTH, 'it arrives (' + r.state + ', depth ' + r.depth + ')');
  check(r.spot === 0, 'no shader compiled on the spot during the ride (' + r.spot + ' on the spot, ' + r.bg + ' in the background)');
  check(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
} finally {await b.close();srv.close()}
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
