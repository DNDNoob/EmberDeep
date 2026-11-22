// usage: node render.js <module.js> <fnName> <orig.png> <outPrefix> [w]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [mod, fn, orig, out, wArg] = process.argv.slice(2);
  const w = +(wArg || 192);
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 2560, height: 720 } });
  const code = fs.readFileSync(mod, 'utf8').replace(/export function/g, 'function');
  const o64 = fs.readFileSync(orig).toString('base64');
  await pg.setContent('<body style="margin:0;background:#000"><canvas id=c width=2560 height=720></canvas></body>');
  const r = await pg.evaluate(async ({ code, fn, o64, w }) => {
    const f = new Function(code + `;return ${fn};`)();
    const t0 = performance.now(); const cv = f(w); const dt = performance.now() - t0;
    const c = document.getElementById('c'), x = c.getContext('2d');
    x.imageSmoothingEnabled = false; x.drawImage(cv, 0, 0, 1280, 720);
    const im = new Image(); im.src = 'data:image/png;base64,' + o64; await im.decode();
    return { dt, size: [cv.width, cv.height], im: [im.width, im.height], pix: c.toDataURL('image/png') , o64 };
  }, { code, fn, o64, w });
  console.log('gen ms', r.dt.toFixed(1), r.size);
  // pixel-only
  await pg.setViewport && 0;
  const pix = await pg.evaluate(() => { const c = document.getElementById('c'); const t = document.createElement('canvas'); t.width = 1280; t.height = 720; t.getContext('2d').drawImage(c, 0, 0); return t.toDataURL('image/png'); });
  fs.writeFileSync(out + '-pixel.png', Buffer.from(pix.split(',')[1], 'base64'));
  // compare
  const cmp = await pg.evaluate(async ({ o64, label }) => {
    const c = document.getElementById('c'), x = c.getContext('2d');
    const im = new Image(); im.src = 'data:image/png;base64,' + o64; await im.decode();
    const pxc = document.createElement('canvas'); pxc.width = 1280; pxc.height = 720; pxc.getContext('2d').drawImage(c, 0, 0, 1280, 720, 0, 0, 1280, 720);
    x.imageSmoothingEnabled = false; x.clearRect(0, 0, 2560, 720);
    x.drawImage(im, 0, 0, 1280, 720); x.drawImage(pxc, 1280, 0);
    x.font = 'bold 20px monospace'; x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(0, 0, 2560, 30); x.fillRect(0,0,0,0);
    x.fillStyle = '#fff'; x.fillText(label[0], 10, 22); x.fillText(label[1], 1290, 22);
    return c.toDataURL('image/png');
  }, { o64, label: process.env.LABELS ? JSON.parse(process.env.LABELS) : ['original 1280x720', 'pixel'] });
  fs.writeFileSync(out + '-compare.png', Buffer.from(cmp.split(',')[1], 'base64'));
  await b.close();
})();
