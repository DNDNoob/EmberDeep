// node tools/npc_export_glb.mjs [RECIPE] [--out DIR] [--hands grip|rest]  -- bakes a recipe in Node (no browser) and writes
// binary glTF files for inspecting every part in Blender (File > Import > glTF 2.0):
//   DIR/keeper.glb       near LOD, rest pose (head straight, no breathing), one mesh/node per part
//   DIR/keeper-far.glb   far LOD
// Each mesh carries POSITION, NORMAL, COLOR_0 (the part's palette colour blended by its paint channel, i.e. the albedo the
// game shader starts from) and custom attributes _MATID (shader material id: skin 12, cloth 13, hair 14, trim 15, eye 8),
// _DETAIL (wrinkle / bump mask) and _AO (baked occlusion). Materials are plain MeshStandardMaterials named after the recipe
// material (skin, cloth, hair, trim, eye, wood). The figure faces +Z (glTF front), metres, y up, feet on y = 0.
// The pose maths mirrors humanoidFrames / drawRecipe / emitS in src/game.js (no breathing, nod, blink or talking).
import * as R from '../src/npc_recipes.js';
import {bakeRecipe} from '../src/npc_kit.js';
import {writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const name = args[0] && !args[0].startsWith('--') ? args[0] : 'KEEPER';
const outDir = flag('out') || '/mnt/project-files/emberdeep/blender';
const rec = R[name];
if (!rec) { console.log('no recipe', name, 'have', Object.keys(R).join(', ')); process.exit(1); }

const m3 = (a, b) => [a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]];
const rZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const fpt = (f, v) => [f.p[0] + f.R[0] * v[0] + f.R[1] * v[1] + f.R[2] * v[2], f.p[1] + f.R[3] * v[0] + f.R[4] * v[1] + f.R[5] * v[2], f.p[2] + f.R[6] * v[0] + f.R[7] * v[1] + f.R[8] * v[2]];
const subF = (f, off, Rm) => ({p: fpt(f, off), R: Rm ? m3(f.R, Rm) : f.R});
const MATID = {skin: 12, cloth: 13, hair: 14, trim: 15, eye: 8, wood: 6, metal: 4, glow: 7};

const baked = bakeRecipe(rec), A = baked.anchors, pal = rec.palette, pr = rec.proportions, rig = rec.rig;
const S = pr?.height || 1, hs = pr ? pr.headScale : 1, scOf = fn => S * (pr?.frames.includes(fn) ? hs : 1);
const wa = rig.waist, ne = rig.neck, ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const Bf = {p: [0, 0, 0], R: ID};
const U = subF(Bf, [wa[0] * S, wa[1] * S, wa[2] * S], rZ(rig.lean));
const tilt = rig.headTilt ?? 0.12;
const H = subF(U, [ne[0] * S, ne[1] * S, ne[2] * S], rZ(tilt));
const fr = {B: Bf, U, H, J: H};
if (rig.drape) fr.D = subF(U, [(ne[0] + rig.drape.push) * S, ne[1] * S, ne[2] * S], rZ(tilt * rig.drape.follow));
if (A.gripAt) { const g = A.gripAt; fr.grip = {p: fpt(U, [g[0] * S, g[1] * S, g[2] * S]), R: m3(Bf.R, A.gripR)}; }
if (A.restAt) fr.rest = subF(U, A.restAt.map(v => v * S), A.restR);

// emitS port: returns {pos, nrm, col, mid, det, ao} in game axes (x fwd), before the glTF axis swap
function place(mesh, f, c, col, col2, matId, R2, sc, dr) {
  const n = mesh.length / 9, o = {pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), col: new Float32Array(n * 3), mid: new Float32Array(n), det: new Float32Array(n), ao: new Float32Array(n)};
  const Rm = R2 ? m3(f.R, R2) : f.R, cs = [c[0] * sc, c[1] * sc, c[2] * sc], p = fpt(f, cs);
  let R3, p3, y0 = 0, iy = 0;
  if (dr) { R3 = R2 ? m3(dr.f.R, R2) : dr.f.R; p3 = fpt(dr.f, cs); y0 = dr.y0; iy = 1 / (dr.y1 - dr.y0); }
  for (let k = 0; k < n; k++) {
    const i = k * 9, x = mesh[i], y = mesh[i + 1], z = mesh[i + 2], nx = mesh[i + 3], ny = mesh[i + 4], nz = mesh[i + 5], w = mesh[i + 6];
    let X = p[0] + sc * (Rm[0] * x + Rm[1] * y + Rm[2] * z), Y = p[1] + sc * (Rm[3] * x + Rm[4] * y + Rm[5] * z), Z = p[2] + sc * (Rm[6] * x + Rm[7] * y + Rm[8] * z);
    let NX = Rm[0] * nx + Rm[1] * ny + Rm[2] * nz, NY = Rm[3] * nx + Rm[4] * ny + Rm[5] * nz, NZ = Rm[6] * nx + Rm[7] * ny + Rm[8] * nz;
    if (dr) {
      let t = (y - y0) * iy; t = t < 0 ? 0 : t > 1 ? 1 : t; t = t * t * (3 - 2 * t);
      if (t > 0) {
        const X2 = p3[0] + sc * (R3[0] * x + R3[1] * y + R3[2] * z), Y2 = p3[1] + sc * (R3[3] * x + R3[4] * y + R3[5] * z), Z2 = p3[2] + sc * (R3[6] * x + R3[7] * y + R3[8] * z);
        const a = R3[0] * nx + R3[1] * ny + R3[2] * nz, b = R3[3] * nx + R3[4] * ny + R3[5] * nz, cc = R3[6] * nx + R3[7] * ny + R3[8] * nz;
        X += (X2 - X) * t; Y += (Y2 - Y) * t; Z += (Z2 - Z) * t; NX += (a - NX) * t; NY += (b - NY) * t; NZ += (cc - NZ) * t;
        const il = 1 / (Math.hypot(NX, NY, NZ) || 1); NX *= il; NY *= il; NZ *= il;
      }
    }
    o.pos.set([X, Y, Z], k * 3); o.nrm.set([NX, NY, NZ], k * 3);
    o.col.set([col[0] + (col2[0] - col[0]) * w, col[1] + (col2[1] - col[1]) * w, col[2] + (col2[2] - col[2]) * w], k * 3);
    o.mid[k] = matId; o.det[k] = mesh[i + 7]; o.ao[k] = mesh[i + 8];
  }
  return o;
}

function parts(lod) {
  const list = [];
  for (const q of rec.parts) {
    const f = fr[q.frame], m = baked.parts[q.part]; if (!f || !m) continue;
    list.push({name: q.part, mat: q.mat, ...place(m[Math.min(lod, m.length - 1)], f, q.at || [0, 0, 0], pal[q.col], pal[q.col2 || q.col], MATID[q.mat], q.R, scOf(q.frame), q.drape && fr.D ? {f: fr.D, y0: q.drape[0], y1: q.drape[1]} : null)});
  }
  const E = baked.eyes, ec = rec.eyes;
  if (E && fr[ec.frame]) {
    const a = A.eye, es = scOf(ec.frame);
    for (const [side, z] of [['L', a[2]], ['R', -a[2]]]) for (const [k, cn, c2n, mat] of [['ball', ec.sclera, ec.sclera, 'eye'], ['iris', ec.iris, ec.pupil, 'eye'], ['lid', ec.lid, ec.lid2, 'skin'], ['lower', ec.lid, ec.lid2, 'skin']])
      list.push({name: `eye${side}_${k}`, mat, ...place((lod > 1 ? E.lo : E)[k], fr[ec.frame], [a[0], a[1], z], pal[cn], pal[c2n], MATID[mat], null, es, null)});
  }
  // staff: primitive in the game (a few segments); here one tapered cylinder plus the lantern, so the figure reads in context
  if (fr.grip && A.gripAxis) {
    const sp = fpt(fr.grip, [A.gripAxis[0] * S, A.gripAxis[1] * S, (A.gripAxis[2] || 0) * S]), wood = [0.3, 0.2, 0.12], N = 12, pos = [], nrm = [], col = [];
    const ring = (y, r) => Array.from({length: N}, (_, i) => { const a = i / N * Math.PI * 2; return [sp[0] + r * Math.cos(a), y, sp[2] + r * Math.sin(a), Math.cos(a), 0, Math.sin(a)]; });
    const r0 = ring(0, 0.0135 * S), r1 = ring(1.0 * S, 0.011 * S);
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; for (const v of [r0[i], r0[j], r1[j], r0[i], r1[j], r1[i]]) { pos.push(v[0], v[1], v[2]); nrm.push(v[3], v[4], v[5]); col.push(...wood); } }
    const n = pos.length / 3;
    list.push({name: 'staff', mat: 'wood', pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), mid: new Float32Array(n).fill(6), det: new Float32Array(n), ao: new Float32Array(n).fill(1)});
  }
  return list;
}

// ---- minimal GLB writer ----
function glb(list) {
  const bin = [], views = [], acc = [], mats = [], matIx = {}, meshes = [], nodes = [];
  let off = 0;
  const addBuf = (arr, target) => { // arr: typed array; returns bufferView index
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), pad = (4 - b.length % 4) % 4;
    bin.push(b, Buffer.alloc(pad)); views.push({buffer: 0, byteOffset: off, byteLength: b.length, ...(target ? {target} : {})}); off += b.length + pad; return views.length - 1;
  };
  const addAcc = (arr, ct, type, withMinMax) => {
    const o = {bufferView: addBuf(arr, 34962), componentType: ct, count: arr.length / {SCALAR: 1, VEC3: 3}[type], type};
    if (withMinMax) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], arr[i + k]); mx[k] = Math.max(mx[k], arr[i + k]); } o.min = mn; o.max = mx; }
    acc.push(o); return acc.length - 1;
  };
  let tris = 0, verts = 0; const stats = [];
  for (const P of list) {
    const n = P.pos.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { // game (x fwd, y up, z side) -> glTF (+Z front): (x,y,z) -> (-z, y, x), a proper rotation
      pos.set([-P.pos[i * 3 + 2], P.pos[i * 3 + 1], P.pos[i * 3]], i * 3); nrm.set([-P.nrm[i * 3 + 2], P.nrm[i * 3 + 1], P.nrm[i * 3]], i * 3);
    }
    if (!(P.mat in matIx)) { matIx[P.mat] = mats.length; mats.push({name: P.mat, pbrMetallicRoughness: {baseColorFactor: [1, 1, 1, 1], metallicFactor: P.mat === 'metal' ? 0.8 : 0, roughnessFactor: P.mat === 'skin' ? 0.6 : P.mat === 'trim' ? 0.35 : 0.85}}); }
    const attrs = {POSITION: addAcc(pos, 5126, 'VEC3', true), NORMAL: addAcc(nrm, 5126, 'VEC3'), COLOR_0: addAcc(P.col, 5126, 'VEC3'), _MATID: addAcc(P.mid, 5126, 'SCALAR'), _DETAIL: addAcc(P.det, 5126, 'SCALAR'), _AO: addAcc(P.ao, 5126, 'SCALAR')};
    meshes.push({name: P.name, primitives: [{attributes: attrs, material: matIx[P.mat], mode: 4}]}); nodes.push({name: P.name, mesh: meshes.length - 1});
    tris += n / 3; verts += n; stats.push([P.name, n / 3]);
  }
  const json = {asset: {version: '2.0', generator: 'EmberDeep tools/npc_export_glb.mjs'}, scene: 0, scenes: [{name: rec.id, nodes: nodes.map((_, i) => i)}], nodes, meshes, materials: mats, accessors: acc, bufferViews: views, buffers: [{byteLength: off}]};
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const body = Buffer.concat(bin), total = 12 + 8 + js.length + 8 + body.length, h = Buffer.alloc(20);
  h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8); h.writeUInt32LE(js.length, 12); h.writeUInt32LE(0x4E4F534A, 16);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(body.length, 0); h2.writeUInt32LE(0x004E4942, 4);
  return {buf: Buffer.concat([h, js, h2, body]), tris, verts, stats};
}

mkdirSync(outDir, {recursive: true});
const base = name === 'KEEPER' ? 'keeper' : name.toLowerCase();
for (const [lod, file] of [[0, base + '.glb'], [2, base + '-far.glb']]) {
  const g = glb(parts(lod)), path = resolve(outDir, file);
  writeFileSync(path, g.buf);
  console.log(`${path}  ${(g.buf.length / 1024).toFixed(0)} KB  ${g.tris} triangles  ${g.verts} vertices  ${g.stats.length} meshes`);
  if (lod === 0) console.log('  ' + g.stats.map(s => `${s[0]} ${s[1]}`).join(', '));
}
