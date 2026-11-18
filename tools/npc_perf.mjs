// node tools/npc_perf.mjs [--file index.html] [--seconds 8] [--dist 1.05] [--q high]
// CPU time per frame spent building the Keeper (buildNpc) and what the character submits to the GPU, measured in the studio corridor.
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = {file: resolve(root, 'index.html'), seconds: '8', dist: '1.05', q: 'high', turn: '0'};
for (let i = 2; i < process.argv.length; i += 2) A[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const b = await chromium.launch(), pg = await (await b.newContext({viewport: {width: 640, height: 360}})).newPage();
pg.setDefaultTimeout(600000);
await pg.addInitScript(q => localStorage.setItem('emberdeep.quality', JSON.stringify(q)), A.q);
await pg.goto(pathToFileURL(resolve(A.file)).href);
await pg.waitForFunction(() => window.__game && window.__game.studio, null, {timeout: 120000});
await pg.addStyleTag({content: '#hud,#map,#prompt,#toast,#chat,#touch,#fps,#roomHud{display:none!important}'});
await pg.evaluate(o => window.__game.studio(o), {type: 'keeper', dist: +A.dist, turn: +A.turn, aimY: 0.7, camY: 0.7, headLock: false, open: false});
const r = await pg.evaluate(sec => new Promise(res => {
  const g = window.__game, T = g.NPC_T; let f0 = 0;
  const wait = () => { if (performance.now() - t0 < 3000) return requestAnimationFrame(wait); // warm up: bake, shaders
    T.ms = 0; T.n = 0; T.up = 0; const t1 = performance.now(); let frames = 0;
    const f = () => { frames++; if (performance.now() - t1 < sec * 1000) return requestAnimationFrame(f);
      res({frames, ms: T.ms, n: T.n, perCall: T.ms / Math.max(1, T.n), upload: T.up / Math.max(1, frames), chN: g.CH.n, tris: T.tris, draws: T.draws}); };
    requestAnimationFrame(f); };
  const t0 = performance.now(); requestAnimationFrame(wait);
}), +A.seconds);
r.benchMsPerBuildNpc = await pg.evaluate(() => { const g = window.__game; g.benchNpc(200); return g.benchNpc(2000); }); // pure CPU cost of posing the Keeper, no rendering
console.log(JSON.stringify(r));
await b.close();
