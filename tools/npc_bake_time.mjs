// node tools/npc_bake_time.mjs  -- Keeper load times in the browser: cold (bake, then stored in IndexedDB) and warm (primed from the cache on a second page load).
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
const {chromium} = createRequire(import.meta.url)('playwright');
const file = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 640, height: 360}});
const run = async label => {
  const pg = await ctx.newPage(); pg.setDefaultTimeout(600000); const errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(() => localStorage.setItem('emberdeep.quality', JSON.stringify('high')));
  await pg.goto(pathToFileURL(file).href);
  await pg.waitForFunction(() => window.__game && window.__game.keeperReady, null, {timeout: 120000});
  const r = await pg.evaluate(async () => { const g = window.__game; await g.keeperLoad(); const t0 = performance.now(); const ok = g.keeperReady(); const ms = performance.now() - t0; await new Promise(r => setTimeout(r, 2500)); const idb = await new Promise(res => { const t = performance.now(), o = indexedDB.open('emberdeep-npc', 1); o.onsuccess = () => { const q = o.result.transaction('bakes').objectStore('bakes').getAll(); q.onsuccess = () => res(Math.round(performance.now() - t)); q.onerror = () => res(-1); }; o.onerror = () => res(-1); }); return {ready: ok, ms: Math.round(ms), hit: g.KEEPER_T.hit, primeMs: Math.round(g.KEEPER_T.load * 10) / 10, readMs: Math.round(g.KEEPER_T.readMs), saved: g.keeperSaved(), idleReadMs: idb, tris: g.keeperStats.tris}; });
  console.log(label, JSON.stringify(r), errs.length ? 'errors: ' + errs.slice(0, 3).join(' | ') : 'no console errors');
  await pg.close();
};
await run('cold:'); await run('warm:'); await b.close();
