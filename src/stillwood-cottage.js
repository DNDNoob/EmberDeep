// A thatched cottage for the still wood. Lambert, so it takes the same sun as the trees.
// The doorway is a real opening: shut until someone stands at it, then it swings out.
import * as THREE from 'three';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 7);
const logGeo = new THREE.CylinderGeometry(0.11, 0.13, 1, 6);

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra });
}

const mats = {
  stone: std(0x6d675e, { side: THREE.DoubleSide }),
  stoneDark: std(0x4e4943, { side: THREE.DoubleSide }),
  moss: std(0x4c6a3c),
  mossDeep: std(0x34502e),
  plaster: std(0xc8c0ae, { side: THREE.DoubleSide }),
  plasterDamp: std(0xa9b49a, { side: THREE.DoubleSide }),
  timber: std(0x5c3e28, { roughness: 0.84, side: THREE.DoubleSide }),
  timberDark: std(0x2a2118, { roughness: 0.88, side: THREE.DoubleSide }),
  thatch: std(0xffffff, { vertexColors: true, roughness: 1, side: THREE.DoubleSide, flatShading: true }),
  thatchSolid: std(0xc4a15c, { roughness: 1, side: THREE.DoubleSide }),
  glass: std(0xffc27a, { emissive: 0xff9a3c, emissiveIntensity: 0.7, roughness: 0.25, transparent: true, opacity: 0.55 }),
  iron: std(0x2c2e30, { roughness: 0.45, metalness: 0.55 }),
  bark: std(0x3a3128, { roughness: 0.95 }),
  floor: std(0x6b4a2e, { roughness: 0.88 }),
  cloth: std(0x6e3b34, { roughness: 0.96 }),
  clothPale: std(0xcbb892, { roughness: 0.94 }),
  fire: std(0xff8a3a, { emissive: 0xff6a1a, emissiveIntensity: 1.5, roughness: 0.5 }),
  gable: std(0xa9b49a, { side: THREE.DoubleSide, roughness: 0.95 }),
};

function put(parent, geo, material, w, h, d, x, y, z, rotY = 0) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function box(parent, material, w, h, d, x, y, z, rotY = 0) {
  return put(parent, unitBox, material, w, h, d, x, y, z, rotY);
}
function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function thatchPlane(width, eave, ridge) {
  const geo = new THREE.BufferGeometry();
  const sx = 8, sz = 6;
  const pos = [], col = [], idx = [];
  const straw = new THREE.Color(0xd2b074), gold = new THREE.Color(0xb48a46), shade = new THREE.Color(0x8a6840), tmp = new THREE.Color();
  for (let iz = 0; iz <= sz; iz++) {
    const v = iz / sz;
    for (let ix = 0; ix <= sx; ix++) {
      const u = ix / sx;
      pos.push((u - 0.5) * width, eave.y + (ridge.y - eave.y) * v, eave.z + (ridge.z - eave.z) * v);
      tmp.copy(iz % 2 === 0 ? straw : gold);
      if (iz === 0) tmp.lerp(shade, 0.4);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let iz = 0; iz < sz; iz++) {
    for (let ix = 0; ix < sx; ix++) {
      const a = iz * (sx + 1) + ix;
      idx.push(a, a + 1, a + sx + 1, a + 1, a + sx + 2, a + sx + 1);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const normals = geo.attributes.normal;
  let up = 0;
  for (let i = 0; i < normals.count; i++) up += normals.getY(i);
  if (up < 0) {
    const id = geo.index;
    for (let i = 0; i < id.count; i += 3) {
      const b = id.getX(i + 1);
      id.setX(i + 1, id.getX(i + 2));
      id.setX(i + 2, b);
    }
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, mats.thatch);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Solids in cottage-local metres. The front door is separate so it can open.
export const COTTAGE_WALLS = [
  { minX: -3.15, maxX: -2.68, minZ: -4.85, maxZ: 0.35 },
  { minX: 2.68, maxX: 3.15, minZ: -4.85, maxZ: 0.35 },
  { minX: -2.9, maxX: 2.9, minZ: -4.9, maxZ: -4.38 },
  { minX: -2.95, maxX: -1.42, minZ: -0.2, maxZ: 0.22 },
  { minX: -0.22, maxX: 2.95, minZ: -0.2, maxZ: 0.22 },
  { minX: -2.25, maxX: -1.15, minZ: -4.35, maxZ: -3.45 },
  { minX: -0.2, maxX: 1.25, minZ: -2.55, maxZ: -1.45 },
  { minX: 1.4, maxX: 2.5, minZ: -4.25, maxZ: -2.85 },
  { minX: -2.45, maxX: -1.75, minZ: -1.15, maxZ: -0.55 },
  { minX: 2.75, maxX: 4.4, minZ: -2.15, maxZ: -0.45 },
];
export const COTTAGE_DOOR = { minX: -1.46, maxX: -0.18, minZ: -0.12, maxZ: 0.42 };

export function cottageLocal(c, x, z) {
  const dx = x - c.x, dz = z - c.z, cos = Math.cos(c.face), sin = Math.sin(c.face);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}
export function cottageWorld(c, x, z) {
  const cos = Math.cos(c.face), sin = Math.sin(c.face);
  return { x: c.x + x * cos + z * sin, z: c.z - x * sin + z * cos };
}
export function onCottagePad(c, x, z) {
  const p = cottageLocal(c, x, z);
  return p.x > -3.6 && p.x < 3.6 && p.z > -5.3 && p.z < 1.6;
}
export function cottageInside(c, x, z) {
  const p = cottageLocal(c, x, z);
  return p.x > -2.55 && p.x < 2.55 && p.z > -4.35 && p.z < 0.15;
}
export function cottageDoorWorld(c) {
  return cottageWorld(c, -0.84, 0.7);
}

function overlaps(x, z, box, radius) {
  return x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius;
}
function eject(x, z, box, radius) {
  const minX = box.minX - radius, maxX = box.maxX + radius, minZ = box.minZ - radius, maxZ = box.maxZ + radius;
  if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) return null;
  const left = x - minX, right = maxX - x, back = z - minZ, fore = maxZ - z;
  const m = Math.min(left, right, back, fore);
  if (m === left) return { x: minX, z };
  if (m === right) return { x: maxX, z };
  if (m === back) return { x, z: minZ };
  return { x, z: maxZ };
}

export function cottagePush(body, cottages, radius = 0.28) {
  for (let pass = 0; pass < 3; pass++) {
    for (const c of cottages) {
      let p = cottageLocal(c, body.x, body.z);
      const boxes = c.open ? COTTAGE_WALLS : COTTAGE_WALLS.concat(COTTAGE_DOOR);
      for (const box of boxes) {
        const out = eject(p.x, p.z, box, radius);
        if (!out) continue;
        const w = cottageWorld(c, out.x, out.z);
        body.x = w.x;
        body.z = w.z;
        p = cottageLocal(c, body.x, body.z);
      }
    }
  }
}

export function createCottage(low = false) {
  const group = new THREE.Group();
  const wall = 2.42;
  const ridgeY = 4.28;
  const halfW = 2.9;
  const depth = 4.6;
  const owned = [];

  box(group, mats.stoneDark, 6.4, 0.28, 5.3, 0, 0.1, -depth / 2);
  for (let i = 0; i < 22; i++) {
    const along = i / 22;
    const side = i % 2 === 0 ? 1 : -1;
    const edge = i < 16;
    const x = edge ? (along * 16 - 5.2) * 0.55 : side * (halfW + 0.15);
    const z = edge ? side * (depth / 2 + 0.15) - depth / 2 : -((i - 16) / 6) * depth;
    const ww = 0.42 + hash(i) * 0.28;
    const hh = 0.22 + hash(i + 3) * 0.16;
    box(group, i % 3 === 0 ? mats.moss : mats.stone, ww, hh, 0.34 + hash(i + 5) * 0.16, x, 0.22 + hh / 2, z, hash(i + 9) * 0.4);
  }

  box(group, mats.plaster, 0.22, wall, depth, -halfW, wall / 2 + 0.16, -depth / 2);
  box(group, mats.plasterDamp, 0.22, wall, depth, halfW, wall / 2 + 0.16, -depth / 2);
  box(group, mats.plaster, 5.8, wall, 0.22, 0, wall / 2 + 0.16, -depth);

  const wallBase = 0.16;
  const wallTop = wallBase + wall;
  const piers = [
    [-2.9, -1.4, wallBase, wallTop],
    [-0.28, 0.62, wallBase, wallTop],
    [1.68, 2.9, wallBase, wallTop],
    [-1.4, -0.28, 2.14, wallTop],
    [0.62, 1.68, wallBase, 1.14],
    [0.62, 1.68, 1.96, wallTop],
  ];
  for (const [x0, x1, y0, y1] of piers) {
    box(group, mats.plaster, x1 - x0, y1 - y0, 0.22, (x0 + x1) / 2, (y0 + y1) / 2, 0);
  }
  box(group, mats.timber, 0.1, 2.0, 0.16, -1.4, 1.16, 0.04);
  box(group, mats.timber, 0.1, 2.0, 0.16, -0.28, 1.16, 0.04);
  box(group, mats.timber, 1.22, 0.1, 0.16, -0.84, 2.14, 0.04);

  for (const side of [-1, 1]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, wall + 0.16, 0, 0, wall + 0.16, -depth, 0, ridgeY - 0.12, -depth / 2], 3));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();
    owned.push(geo);
    const end = new THREE.Mesh(geo, mats.gable);
    end.position.x = side * (halfW - 0.02);
    end.castShadow = true;
    end.receiveShadow = true;
    group.add(end);
  }

  const door = new THREE.Group();
  door.position.set(-1.28, 0.16, 0.2);
  box(door, mats.timber, 0.9, 1.92, 0.06, 0.45, 0.96, 0);
  box(door, mats.timberDark, 0.78, 0.06, 0.07, 0.45, 0.55, 0.02);
  box(door, mats.timberDark, 0.78, 0.06, 0.07, 0.45, 1.35, 0.02);
  box(door, mats.iron, 0.08, 0.08, 0.08, 0.78, 1.0, 0.05);
  group.add(door);

  box(group, mats.glass, 0.92, 0.72, 0.04, 1.15, 1.55, 0.08);
  box(group, mats.timberDark, 0.04, 0.76, 0.05, 1.15, 1.55, 0.12);
  box(group, mats.timberDark, 0.96, 0.04, 0.05, 1.15, 1.55, 0.12);
  box(group, mats.timber, 1.08, 0.08, 0.1, 1.15, 1.96, 0.1);
  box(group, mats.timber, 1.08, 0.08, 0.1, 1.15, 1.14, 0.1);

  for (const x of [-halfW, halfW]) {
    box(group, mats.timber, 0.16, wall + 0.2, 0.16, x, wall / 2 + 0.2, 0.08);
    box(group, mats.timber, 0.16, wall + 0.2, 0.16, x, wall / 2 + 0.2, -depth);
  }
  box(group, mats.timber, 6.15, 0.14, 0.16, 0, wall + 0.2, 0.1);
  box(group, mats.timber, 0.12, 1.5, 0.1, -2.15, 1.7, 0.16, 0.55);
  box(group, mats.timber, 0.12, 1.5, 0.1, 2.15, 1.7, 0.16, -0.55);

  const eaveY = wall + 0.08;
  const ridgeZ = -depth / 2;
  const frontEave = new THREE.Vector3(0, eaveY, 0.58);
  const backEave = new THREE.Vector3(0, eaveY, -depth - 0.58);
  const ridgePt = new THREE.Vector3(0, ridgeY, ridgeZ);
  const front = thatchPlane(6.5, frontEave, ridgePt);
  const back = thatchPlane(6.5, backEave, ridgePt);
  owned.push(front.geometry, back.geometry);
  group.add(front, back);

  const span = 6.55;
  const foot = 0.36;
  const run = Math.abs(ridgeZ - frontEave.z);
  const yFoot = ridgeY - foot * ((ridgeY - eaveY) / run) + 0.015;
  const roll = new THREE.BufferGeometry();
  const x0 = -span / 2, x1 = span / 2;
  roll.setAttribute('position', new THREE.Float32BufferAttribute([
    x0, ridgeY + 0.16, ridgeZ, x0, yFoot, ridgeZ + foot, x0, yFoot, ridgeZ - foot,
    x1, ridgeY + 0.16, ridgeZ, x1, yFoot, ridgeZ + foot, x1, yFoot, ridgeZ - foot,
  ], 3));
  roll.setIndex([0, 1, 2, 3, 5, 4, 0, 3, 1, 1, 3, 4, 0, 2, 3, 2, 5, 3]);
  roll.computeVertexNormals();
  owned.push(roll);
  const rollMesh = new THREE.Mesh(roll, mats.thatchSolid);
  rollMesh.castShadow = true;
  group.add(rollMesh);
  box(group, mats.timberDark, 6.6, 0.08, 0.1, 0, eaveY - 0.06, frontEave.z);
  box(group, mats.timberDark, 6.6, 0.08, 0.1, 0, eaveY - 0.06, backEave.z);

  const pitch = Math.atan2(ridgeY - eaveY, run);
  for (const [x, v, frontSide] of [[-1.4, 0.42, true], [1.1, 0.62, true], [0.2, 0.5, false]]) {
    const z0 = frontSide ? frontEave.z : backEave.z;
    const z = z0 + (ridgeZ - z0) * v;
    const y = eaveY + (ridgeY - eaveY) * v + 0.02;
    const pad = box(group, mats.mossDeep, 0.9, 0.04, 0.46, x, y, z);
    pad.rotation.x = frontSide ? pitch : -pitch;
  }

  const chimney = new THREE.Group();
  chimney.position.set(-1.7, 0, -3.15);
  const chimneyBase = 3.78;
  for (let i = 0; i < 5; i++) {
    const s = 0.56 - i * 0.025;
    box(chimney, i % 2 ? mats.stone : mats.stoneDark, s, 0.48, s * 0.86, 0, chimneyBase + i * 0.46, 0);
  }
  const collar = box(chimney, mats.iron, 0.92, 0.05, 0.72, 0, chimneyBase - 0.04, 0.02);
  collar.rotation.x = -pitch;
  group.add(chimney);

  box(group, mats.floor, 5.35, 0.08, 4.15, 0, 0.1, -2.28);
  for (let i = 0; i < 8; i++) box(group, mats.timberDark, 5.2, 0.015, 0.04, 0, 0.145, -0.45 - i * 0.5);
  box(group, mats.timber, 0.14, 0.16, 4.2, -1.5, 2.48, -2.3);
  box(group, mats.timber, 0.14, 0.16, 4.2, 1.2, 2.48, -2.3);
  box(group, mats.timberDark, 5.2, 0.1, 0.1, 0, 2.52, -0.4);
  box(group, mats.timberDark, 5.2, 0.1, 0.1, 0, 2.52, -4.2);

  box(group, mats.stone, 1.05, 1.15, 0.55, -1.7, 0.7, -4.05);
  box(group, mats.stoneDark, 0.7, 0.7, 0.2, -1.7, 0.5, -3.8);
  const flame = box(group, mats.fire, 0.42, 0.18, 0.16, -1.7, 0.28, -3.72);
  const hearth = new THREE.PointLight(0xff9a3c, low ? 1.4 : 2.4, 7, 2);
  hearth.position.set(-1.7, 0.7, -3.55);
  group.add(hearth);
  box(group, mats.iron, 0.5, 0.04, 0.28, -1.7, 0.2, -3.55);

  box(group, mats.timber, 1.4, 0.08, 0.8, 0.5, 0.78, -2.0);
  box(group, mats.timberDark, 0.08, 0.7, 0.08, 0.0, 0.42, -1.7);
  box(group, mats.timberDark, 0.08, 0.7, 0.08, 1.0, 0.42, -1.7);
  box(group, mats.timberDark, 0.08, 0.7, 0.08, 0.0, 0.42, -2.3);
  box(group, mats.timberDark, 0.08, 0.7, 0.08, 1.0, 0.42, -2.3);
  box(group, mats.clothPale, 0.9, 0.02, 0.5, 0.5, 0.83, -2.0);
  put(group, unitCyl, mats.timber, 0.16, 0.45, 0.16, 0.15, 0.32, -2.55);
  put(group, unitCyl, mats.timber, 0.16, 0.45, 0.16, 0.9, 0.32, -1.5);

  box(group, mats.timber, 1.05, 0.28, 1.7, 1.95, 0.32, -3.55);
  box(group, mats.cloth, 0.95, 0.12, 1.55, 1.95, 0.5, -3.55);
  box(group, mats.clothPale, 0.42, 0.1, 0.28, 1.85, 0.6, -2.9);
  box(group, mats.timberDark, 0.7, 0.4, 0.42, -2.1, 0.32, -0.85);
  box(group, mats.timber, 0.28, 0.9, 0.9, -2.45, 1.35, -2.4);
  box(group, mats.stone, 0.12, 0.16, 0.12, -2.45, 1.7, -2.15);
  box(group, mats.iron, 0.1, 0.14, 0.1, -2.45, 1.55, -2.55);

  const shed = new THREE.Group();
  shed.position.set(3.55, 0, -1.3);
  box(shed, mats.timber, 0.12, 1.7, 0.12, -0.7, 0.85, 0.7);
  box(shed, mats.timber, 0.12, 1.7, 0.12, 0.7, 0.85, 0.7);
  box(shed, mats.timber, 0.12, 1.35, 0.12, -0.7, 0.67, -0.7);
  box(shed, mats.timber, 0.12, 1.35, 0.12, 0.7, 0.67, -0.7);
  const shedRoof = thatchPlane(1.9, new THREE.Vector3(0, 1.78, 0.95), new THREE.Vector3(0, 1.4, -0.85));
  owned.push(shedRoof.geometry);
  shed.add(shedRoof);
  for (let i = 0; i < 6; i++) {
    const log = put(shed, logGeo, mats.bark, 1, 1.15, 1, -0.15 + (i % 2) * 0.12, 0.16 + i * 0.18, 0);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i % 2) * 0.15;
  }
  group.add(shed);

  put(group, unitCyl, mats.timber, 0.28, 0.42, 0.28, 2.15, 0.28, 1.35);
  box(group, mats.iron, 0.04, 0.16, 0.28, 2.15, 0.62, 1.35, 0.4);

  box(group, mats.timberDark, 0.08, 1.7, 0.08, -1.7, 0.85, 1.55);
  const lamp = new THREE.PointLight(0xffb15a, low ? 0 : 1.4, 6, 2);
  lamp.position.set(-1.7, 1.62, 1.55);
  group.add(lamp);
  box(group, mats.iron, 0.16, 0.22, 0.16, -1.7, 1.55, 1.55);
  box(group, mats.glass, 0.1, 0.12, 0.1, -1.7, 1.55, 1.55);

  for (let i = 0; i < 5; i++) box(group, mats.stone, 0.7, 0.08, 0.45, -0.85, 0.08, 0.55 + i * 0.48);
  for (let i = 0; i < 7; i++) {
    const x = -2.2 + hash(i + 30) * 1.2;
    const z = 1.8 + hash(i + 40) * 1.4;
    box(group, mats.mossDeep, 0.35, 0.28 + hash(i) * 0.25, 0.08, x, 0.2, z, hash(i) * 2);
    box(group, mats.moss, 0.28, 0.22, 0.08, x + 0.08, 0.16, z + 0.06, hash(i) + 1);
  }
  for (let i = 0; i < 5; i++) {
    box(group, mats.moss, 0.18, 0.45 + i * 0.08, 0.12, -2.55, 0.4 + i * 0.15, -0.4 + i * 0.15, 0.3);
  }

  const smokeN = low ? 8 : 18;
  const puffGeo = new THREE.SphereGeometry(1, low ? 6 : 8, low ? 5 : 6);
  owned.push(puffGeo);
  const puffs = Array.from({ length: smokeN }, (_, i) => {
    const material = new THREE.MeshBasicMaterial({ color: 0xc9d0c8, transparent: true, opacity: 0.4, depthWrite: false });
    owned.push(material);
    const mesh = new THREE.Mesh(puffGeo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    return { mesh, material, life: i / smokeN };
  });

  let doorAngle = 0;
  return {
    group,
    step(dt, time, open) {
      const target = open ? 1.15 : 0;
      doorAngle += (target - doorAngle) * (1 - Math.exp(-dt * 4.2));
      if (Math.abs(target - doorAngle) < 0.004) doorAngle = target;
      door.rotation.y = doorAngle;
      flame.scale.y = 0.18 * (0.85 + Math.sin(time * 9) * 0.2);
      hearth.intensity = (low ? 1.4 : 2.4) * (0.85 + Math.sin(time * 11) * 0.15);
      const mouthX = chimney.position.x, mouthZ = chimney.position.z;
      for (let i = 0; i < puffs.length; i++) {
        const puff = puffs[i];
        puff.life = (puff.life + dt * 0.18) % 1;
        const life = puff.life;
        const drift = life * life * 0.85;
        puff.mesh.position.set(
          mouthX + Math.sin(time * 0.7 + i * 1.7) * drift,
          5.95 + life * 2.6,
          mouthZ + Math.cos(time * 0.55 + i) * drift * 0.65,
        );
        puff.mesh.scale.setScalar(0.07 + life * 0.42);
        puff.material.opacity = (1 - life) * (1 - life) * 0.55;
        puff.material.color.set(life < 0.2 ? 0xb7b2a8 : 0xd5ddd4);
      }
    },
    dispose() {
      for (const g of owned) g.dispose();
    },
  };
}
