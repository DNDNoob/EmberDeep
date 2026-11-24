// node tools/nature_gallery.mjs  -- bundles src/nature-gallery.js into tools/nature-gallery.html (gitignored; not part of index.html)
import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = await build({entryPoints: [root + '/src/nature-gallery.js'], bundle: true, format: 'iife', minify: false, write: false, target: 'es2020', define: {__KIT_HASH__: JSON.stringify('gallery')}});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
writeFileSync(root + '/tools/nature-gallery.html', '<!doctype html><meta charset="utf-8"><title>nature props</title><body style="margin:0;background:#000"><script>' + js + '</script>');
console.log('tools/nature-gallery.html', (js.length / 1024).toFixed(0) + ' KB');
