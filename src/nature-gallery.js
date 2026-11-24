// Gallery page for the nature props (separate esbuild entry, not part of index.html). Built by tools/nature_gallery.mjs.
// window.__gal.setView('lineup'|'trees'|'rocks'|'plants'|'seeds'|'far'|'flowers') lays props out and frames the camera; tools/nature_shot.mjs screenshots each.
import * as THREE from 'three';
import {NATURE_KINDS, bakeProp, natureMaterial} from './nature.js';

const qs = new URLSearchParams(location.search), Q = +(qs.get('q') ?? 2);
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(W, H);
renderer.shadowMap.enabled = Q > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.body.style.margin = '0'; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(), FOG = 0xb9c6cc;
scene.background = new THREE.Color(FOG); scene.fog = new THREE.FogExp2(FOG, 0.018);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xaec4e6, 0x4a4a3a, Q > 0 ? 1.0 : 1.3); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a8, Q > 0 ? 2.6 : 2.4); sun.position.set(-9, 12, 7); sun.target.position.set(0, 0, 0);
sun.castShadow = Q > 0; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60; sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
// ground
{
  const g = new THREE.PlaneGeometry(120, 60, 120, 60); g.rotateX(-Math.PI / 2);
  const c = new Float32Array(g.attributes.position.count * 3), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const n = (Math.sin(p.getX(i) * 1.3) * Math.sin(p.getZ(i) * 1.1) + Math.sin(p.getX(i) * 3.7 + p.getZ(i) * 2.9)) * 0.012; c[i * 3] = 0.06 + n; c[i * 3 + 1] = 0.1 + n; c[i * 3 + 2] = 0.045 + n * 0.5; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, Q === 0 ? new THREE.MeshLambertMaterial({vertexColors: true}) : new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1}));
  m.receiveShadow = true; scene.add(m);
}
const UT = {value: 0}, mat = natureMaterial({Q, UT});
const cache = new Map(), baked = [];
const get = (kind, seed) => { const k = kind + seed; if (!cache.has(k)) { const r = bakeProp(kind, seed); cache.set(k, r); baked.push({kind, seed, ...r.stats}); } return cache.get(k); };
let group = null;
const WID = {oak: 4.6, fir: 3.4, snag: 2.8, boulder: 2.4, slab: 2.4, mossrock: 2.4, shrub: 1.5, succulent: 1.1, tulip: 0.9, daisy: 0.9};
function place(items) {
  if (group) { scene.remove(group); }
  group = new THREE.Group();
  for (const it of items) {
    const r = get(it.kind, it.seed), geo = it.lod === 'far' ? r.far : r.near;
    const im = new THREE.InstancedMesh(geo, mat, 1);
    im.setMatrixAt(0, new THREE.Matrix4().makeRotationY(it.rot || 0).setPosition(it.x, 0, it.z)); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  }
  scene.add(group);
}
function row(kinds, seed, z, lod, gap = 0) {
  const xs = []; let x = 0; for (const k of kinds) { xs.push(x + WID[k] / 2); x += WID[k] + gap; }
  return kinds.map((k, i) => ({kind: k, seed, x: xs[i] - x / 2, z, lod, w: WID[k]}));
}
const VIEWS = {
  lineup() { const a = row(NATURE_KINDS, 3, -1.5), b = row(NATURE_KINDS, 11, 4.5); place([...a, ...b]); cam([0, 4.6, 21], [0, 1.6, 1.0], 42); },
  far() { const a = row(NATURE_KINDS, 3, -2, 'near'), b = row(NATURE_KINDS, 3, 3.5, 'far'); place([...a, ...b]); cam([0, 4.6, 21], [0, 1.6, 0.8], 42); },
  trees() { const a = row(['oak', 'fir', 'snag'], 3, 0, 'near', 1.5), b = row(['oak', 'fir', 'snag'], 21, 7, 'near', 1.5); place([...a, ...b]); cam([0, 3.2, 22], [0, 2.7, 2.5], 34); },
  rocks() { const a = row(['boulder', 'slab', 'mossrock'], 3, 0, 'near', 1.2), b = row(['boulder', 'slab', 'mossrock'], 21, 4.2, 'near', 1.2); place([...a, ...b]); cam([0, 3.2, 13], [0, 0.8, 2], 36); },
  plants() { const a = row(['shrub', 'succulent'], 3, 0, 'near', 0.6), b = row(['shrub', 'succulent'], 21, 2.5, 'near', 0.6); place([...a, ...b]); cam([0, 1.7, 6.2], [0, 0.35, 1.2], 34); },
  flowers() { const a = row(['tulip', 'daisy'], 3, 0, 'near', 0.5), b = row(['tulip', 'daisy'], 21, 1.7, 'near', 0.5); place([...a, ...b]); cam([0, 1.0, 3.6], [0, 0.22, 0.8], 32); },
  seeds() {
    const it = []; NATURE_KINDS.forEach((k, ki) => { for (let s = 0; s < 4; s++) it.push({kind: k, seed: 100 + s * 7 + ki, x: (s - 1.5) * (WID[k] + 0.4) * (ki < 3 ? 1 : 0.9), z: ki * 5.0 - 22, lod: 'near'}); });
    // trees at the back, small things front: scale spacing per kind so the sheet is readable
    place(it); cam([0, 16, 20], [0, 0.5, -9], 50);
  },
};
function cam(p, t, fov) { camera.position.set(...p); camera.lookAt(...t); camera.fov = fov; camera.updateProjectionMatrix(); }
window.__gal = {
  baked, kinds: NATURE_KINDS, THREE,
  setView(name) { VIEWS[name](); renderer.render(scene, camera); return baked.length; },
  setCamera(p, t, fov) { cam(p, t, fov); renderer.render(scene, camera); },
  place(items) { place(items); },
  render() { renderer.render(scene, camera); },
  views: Object.keys(VIEWS), ready: true,
};
VIEWS.lineup(); renderer.render(scene, camera);
