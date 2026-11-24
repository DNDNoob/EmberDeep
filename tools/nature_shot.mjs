// node tools/nature_shot.mjs [--scale 1|2] [--out shots/nature] [--views lineup,trees,...] [--size 1600x900]
// Renders the gallery (run tools/nature_gallery.mjs first; this script runs it if the page is missing) with software GL.
import {createRequire} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {mkdirSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = {scale: '1', out: resolve(root, 'shots/nature'), views: 'lineup,trees,rocks,plants,flowers,seeds,seeds2,seeds3,far', size: '1600x900'};
for (let i = 2; i < process.argv.length; i += 2) A[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
execFileSync('node', [resolve(root, 'tools/nature_gallery.mjs')], {stdio: 'inherit'});
mkdirSync(A.out, {recursive: true});
const [w, h] = A.size.split('x').map(Number);
const b = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const shot = async (q, view, name) => {
  const pg = await b.newPage({viewport: {width: w, height: h}, deviceScaleFactor: +A.scale}), errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await pg.goto(pathToFileURL(resolve(root, 'tools/nature-gallery.html')).href + '?q=' + q);
  await pg.waitForFunction(() => window.__gal && window.__gal.ready, null, {timeout: 120000});
  await pg.evaluate(v => window.__gal.setView(v), view);
  await pg.screenshot({path: resolve(A.out, name + '.png')});
  const st = await pg.evaluate(() => window.__gal.baked.map(b => b.kind + ':' + b.seed + ' ' + b.tris + '/' + b.farTris + ' ' + b.ms.toFixed(0) + 'ms').join('\n'));
  console.log(name, errs.length ? errs : 'ok'); await pg.close(); return st;
};
for (const v of A.views.split(',')) await shot(2, v, v);
if (A.q0 !== 'no') await shot(0, 'lineup', 'lineup_q0');
await b.close();
