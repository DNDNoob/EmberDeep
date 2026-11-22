// node tools/npc_gallery.mjs OUTDIR  -- rest-pose raster of ILSE and BRAKK (and the Keeper if --keeper).
// Writes PNGs. No browser. Poses parts the same way humanoidFrames / drawRecipe do at rest.
import {mkdirSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {KEEPER, ILSE, BRAKK} from '../src/npc_recipes.js';
import {bakeRecipe} from '../src/npc_kit.js';

const outDir = process.argv[2] || 'shots';
mkdirSync(outDir, {recursive: true});
const withKeeper = process.argv.includes('--keeper');
const cast = withKeeper ? [['keeper', KEEPER], ['ilse', ILSE], ['brakk', BRAKK]] : [['ilse', ILSE], ['brakk', BRAKK]];

const mul = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const m3 = (a, b) => [a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]];
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function framesOf(rec, A) {
  const S = rec.proportions?.height || 1, hs = rec.proportions?.headScale || 1, rig = rec.rig;
  const RU = rotZ(rig.lean), waist = rig.waist.map(v => v * S);
  const neck = add(waist, mul(RU, rig.neck.map(v => v * S)));
  const tilt = (rig.headTilt ?? 0.12) + rig.lean;
  const RH = rotZ(tilt);
  const sc = fn => S * (rec.proportions?.frames?.includes(fn) ? hs : 1);
  const F = {B: {p: [0, 0, 0], R: I, sc: S}, U: {p: waist, R: RU, sc: S}, H: {p: neck, R: RH, sc: sc('H')}, J: {p: neck, R: RH, sc: sc('J')}};
  const hand = (name, at, R) => { if (!at) return; F[name] = {p: add(waist, mul(RU, at.map(v => v * S))), R: m3(RU, R), sc: S}; };
  hand('map', A.mapAt, A.mapR); hand('hip', A.hipAt, A.hipR);
  hand('knee', A.kneeAt, A.kneeR); hand('wound', A.woundAt, A.woundR);
  hand('grip', A.gripAt, A.gripR); hand('rest', A.restAt, A.restR);
  return F;
}

const COL = {
  skin: [228, 176, 140], cloth: [70, 92, 96], hair: [90, 48, 28], trim: [196, 164, 78], eye: [230, 230, 220]
};
function colorOf(rec, part) {
  const q = rec.parts.find(p => p.part === part);
  if (!q) return [180, 180, 180];
  const c = rec.palette[q.col] || [0.6, 0.6, 0.6];
  const m = COL[q.mat] || [c[0] * 255, c[1] * 255, c[2] * 255];
  return [c[0] * 220 + 20, c[1] * 220 + 16, c[2] * 200 + 16].map((v, i) => Math.min(255, v * 0.65 + m[i] * 0.15));
}

function raster(rec, baked, view, file) {
  const W = 900, H = 1100, zb = new Float32Array(W * H).fill(1e9), img = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { img[i * 3] = 18; img[i * 3 + 1] = 16; img[i * 3 + 2] = 20; }
  const A = baked.anchors, FR = framesOf(rec, A);
  const seated = rec === BRAKK;
  const tgt = view.tgt || [0.05, seated ? 0.36 : 0.55, 0];
  const dist = view.dist, yaw = view.yaw * Math.PI / 180, el = view.el * Math.PI / 180;
  const eye = [tgt[0] + dist * Math.cos(el) * Math.cos(yaw), tgt[1] + dist * Math.sin(el), tgt[2] + dist * Math.cos(el) * Math.sin(yaw)];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nz = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
  const f = nz(sub(tgt, eye)), right = nz(cr(f, [0, 1, 0])), u = cr(right, f), fov = Math.tan((view.fov || 22) * Math.PI / 180);
  const proj = p => { const d = sub(p, eye), z = dot(d, f); return [W / 2 + (dot(d, right) / z / fov) * H / 2, H / 2 - (dot(d, u) / z / fov) * H / 2, z]; };
  const L1 = nz([0.4, 0.85, 0.35]), L2 = nz([-0.6, 0.15, -0.5]);
  const ev = nz(sub(eye, tgt));
  function draw(mesh, frame, col) {
    if (!mesh || !frame) return;
    const n = mesh.length / 9, P = [], N = [];
    for (let i = 0; i < n; i++) {
      const x = mesh[i * 9], y = mesh[i * 9 + 1], z = mesh[i * 9 + 2];
      const sc = frame.sc, R = frame.R;
      P.push([frame.p[0] + sc * (R[0] * x + R[1] * y + R[2] * z), frame.p[1] + sc * (R[3] * x + R[4] * y + R[5] * z), frame.p[2] + sc * (R[6] * x + R[7] * y + R[8] * z)]);
      const nx = mesh[i * 9 + 3], ny = mesh[i * 9 + 4], nzv = mesh[i * 9 + 5];
      N.push(nz([R[0] * nx + R[1] * ny + R[2] * nzv, R[3] * nx + R[4] * ny + R[5] * nzv, R[6] * nx + R[7] * ny + R[8] * nzv]));
    }
    for (let t = 0; t < n; t += 3) {
      const v = [t, t + 1, t + 2].map(i => ({p: proj(P[i]), l: 0.16 + Math.max(0, dot(N[i], ev)) * 0.22 + Math.max(0, dot(N[i], L1)) * 0.7 + Math.max(0, dot(N[i], L2)) * 0.22}));
      const [a, b, c] = v;
      if (a.p[2] <= 0.02 || b.p[2] <= 0.02 || c.p[2] <= 0.02) continue;
      const mnx = Math.max(0, Math.floor(Math.min(a.p[0], b.p[0], c.p[0]))), mxx = Math.min(W - 1, Math.ceil(Math.max(a.p[0], b.p[0], c.p[0])));
      const mny = Math.max(0, Math.floor(Math.min(a.p[1], b.p[1], c.p[1]))), mxy = Math.min(H - 1, Math.ceil(Math.max(a.p[1], b.p[1], c.p[1])));
      const den = (b.p[1] - c.p[1]) * (a.p[0] - c.p[0]) + (c.p[0] - b.p[0]) * (a.p[1] - c.p[1]);
      if (Math.abs(den) < 1e-9) continue;
      for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) {
        const l0 = ((b.p[1] - c.p[1]) * (x - c.p[0]) + (c.p[0] - b.p[0]) * (y - c.p[1])) / den;
        const l1 = ((c.p[1] - a.p[1]) * (x - c.p[0]) + (a.p[0] - c.p[0]) * (y - c.p[1])) / den, l2 = 1 - l0 - l1;
        if (l0 < -0.001 || l1 < -0.001 || l2 < -0.001) continue;
        const z = l0 * a.p[2] + l1 * b.p[2] + l2 * c.p[2], id = y * W + x;
        if (z >= zb[id]) continue;
        zb[id] = z; const li = l0 * a.l + l1 * b.l + l2 * c.l;
        img[id * 3] = Math.min(255, col[0] * li); img[id * 3 + 1] = Math.min(255, col[1] * li); img[id * 3 + 2] = Math.min(255, col[2] * li);
      }
    }
  }
  for (const q of rec.parts) {
    const m = baked.parts[q.part]; if (!m) continue;
    const mesh = m[0]; if (mesh.cards && q.part.includes('Card')) continue; // cards are thin; the solid hair carries the read here
    draw(mesh, FR[q.frame], colorOf(rec, q.part));
  }
  if (baked.eyes && A.eye) {
    const e = A.eye, hf = FR.H;
    for (const z of [-e[2], e[2]]) {
      const place = {p: [hf.p[0] + hf.sc * (hf.R[0] * e[0] + hf.R[1] * e[1] + hf.R[2] * z), hf.p[1] + hf.sc * (hf.R[3] * e[0] + hf.R[4] * e[1] + hf.R[5] * z), hf.p[2] + hf.sc * (hf.R[6] * e[0] + hf.R[7] * e[1] + hf.R[8] * z)], R: hf.R, sc: hf.sc};
      draw(baked.eyes.ball, place, [230, 224, 210]);
      draw(baked.eyes.iris, place, [40, 120, 70]);
      draw(baked.eyes.lid, place, colorOf(rec, 'head'));
      draw(baked.eyes.lower, place, colorOf(rec, 'head'));
    }
  }
  if (A.scroll && FR.map) {
    const g = A.scroll, p0 = [g.p[0] - g.d[0] * 0.11, g.p[1] - g.d[1] * 0.11, g.p[2] - g.d[2] * 0.11], p1 = [g.p[0] + g.d[0] * 0.13, g.p[1] + g.d[1] * 0.13, g.p[2] + g.d[2] * 0.13];
    draw(cylinder(p0, p1, 0.012, 12), FR.map, [214, 196, 150]);
    const tie = cylinder([g.p[0] - g.d[0] * 0.012, g.p[1] - g.d[1] * 0.012, g.p[2] - g.d[2] * 0.012], [g.p[0] + g.d[0] * 0.012, g.p[1] + g.d[1] * 0.012, g.p[2] + g.d[2] * 0.012], 0.015, 10);
    draw(tie, FR.map, [150, 42, 36]);
  }
  const ppm = Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), Buffer.from(img)]);
  const ppmPath = file + '.ppm';
  writeFileSync(ppmPath, ppm);
  const py = spawnSync('python3', ['-c', `from PIL import Image; Image.open(${JSON.stringify(ppmPath)}).save(${JSON.stringify(file)})`]);
  if (py.status) throw new Error(py.stderr.toString());
  console.log(file);
}

function cylinder(a, b, r, seg) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 1, ax = d.map(v => v / L);
  let t = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = [ax[1] * t[2] - ax[2] * t[1], ax[2] * t[0] - ax[0] * t[2], ax[0] * t[1] - ax[1] * t[0]];
  const ul = Math.hypot(...u) || 1; u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
  const ring = (p, nrm) => {
    const o = [];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, c = Math.cos(a0), s = Math.sin(a0);
      o.push(p[0] + (u[0] * c + v[0] * s) * r, p[1] + (u[1] * c + v[1] * s) * r, p[2] + (u[2] * c + v[2] * s) * r, nrm[0], nrm[1], nrm[2], 0, 0, 1);
    }
    return o;
  };
  const A = ring(a, [-ax[0], -ax[1], -ax[2]]), B = ring(b, ax);
  const m = [];
  const push = (i, j, k, src) => { for (const q of [i, j, k]) m.push(...src.slice(q * 9, q * 9 + 9)); };
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    push(i, j, i, A); // rough caps, normals are axial which is fine for a prop
    push(i, j, j, B);
    // side quads with radial normals
    const sideN = (k) => {
      const a0 = k / seg * Math.PI * 2, c = Math.cos(a0), s = Math.sin(a0);
      return [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
    };
    const vert = (p, k) => {
      const n = sideN(k), a0 = k / seg * Math.PI * 2, c = Math.cos(a0), s = Math.sin(a0);
      return [p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r, n[0], n[1], n[2], 0, 0, 1];
    };
    const s00 = vert(a, i), s01 = vert(a, j), s11 = vert(b, j), s10 = vert(b, i);
    m.push(...s00, ...s11, ...s01, ...s00, ...s10, ...s11);
  }
  return new Float32Array(m);
}

const VIEWS = [
  {name: 'front', yaw: 0, el: 8, dist: 1.65, fov: 22},
  {name: 'threeq', yaw: 42, el: 10, dist: 1.5, fov: 24},
  {name: 'face', yaw: 22, el: 2, dist: 0.42, fov: 16}
];
for (const [name, rec] of cast) {
  console.log('bake', rec.id);
  const baked = bakeRecipe(rec);
  const neckY = (rec.rig.waist[1] + rec.rig.neck[1] * Math.cos(rec.rig.lean)) * (rec.proportions?.height || 1);
  const seated = rec === BRAKK;
  for (const view of VIEWS) {
    const v = {...view, tgt: view.name === 'face' ? [0.03, neckY + (seated ? 0.02 : 0.04) * (rec.proportions?.headScale || 1), 0] : [0.02, seated ? neckY - 0.12 : 0.48, 0]};
    raster(rec, baked, v, `${outDir}/${name}-${view.name}.png`);
  }
}
