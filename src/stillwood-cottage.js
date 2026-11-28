// A thatched cottage for the still wood. Lambert, so it takes the same sun as the trees.
// The doorway is a real opening: shut until someone stands at it, then it swings out.
import * as THREE from 'three';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 7);

function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

const mats = {
  stone: lambert(0x6d675e),
  stoneDark: lambert(0x4e4943),
  moss: lambert(0x4c6a3c),
  mossDeep: lambert(0x34502e),
  plaster: lambert(0xc8c0ae),
  plasterDamp: lambert(0xa9b49a),
  timber: lambert(0x5c3e28),
  timberDark: lambert(0x2a2118),
  thatch: lambert(0xc4a15c),
  glass: lambert(0xffc27a, { emissive: 0xff9a3c, emissiveIntensity: 0.65, transparent: true, opacity: 0.72 }),
  iron: lambert(0x2c2e30),
  floor: lambert(0x6b4a2e),
  cloth: lambert(0x6e3b34),
  clothPale: lambert(0xcbb892),
  fire: lambert(0xff8a3a, { emissive: 0xff6a1a, emissiveIntensity: 0.9 }),
  smoke: lambert(0xd5ddd4, { transparent: true, opacity: 0.35, depthWrite: false }),
};

function box(parent, material, w, h, d, x, y, z, rotY = 0) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function thatch(width, eaveY, eaveZ, ridgeY, ridgeZ) {
  const geo = new THREE.BufferGeometry();
  const sx = 1;
  const sz = 1;
  const pos = [];
  const idx = [];
  for (let iz = 0; iz <= sz; iz++) {
    const v = iz / sz;
    for (let ix = 0; ix <= sx; ix++) {
      const u = ix / sx;
      pos.push((u - 0.5) * width, eaveY + (ridgeY - eaveY) * v, eaveZ + (ridgeZ - eaveZ) * v);
    }
  }
  idx.push(0, 1, 2, 1, 3, 2);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  let up = 0;
  for (let i = 0; i < n.count; i++) up += n.getY(i);
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
  const depth = 4.6;
  const halfW = 2.9;
  const owned = [];

  box(group, mats.stoneDark, 6.4, 0.45, 5.3, 0, 0.02, -depth / 2);
  box(group, mats.plaster, 0.22, wall, depth, -halfW, wall / 2 + 0.16, -depth / 2);
  box(group, mats.plasterDamp, 0.22, wall, depth, halfW, wall / 2 + 0.16, -depth / 2);
  box(group, mats.plaster, 5.8, wall, 0.22, 0, wall / 2 + 0.16, -depth);
  const wallBase = 0.16, wallTop = wallBase + wall;
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

  const door = new THREE.Group();
  door.position.set(-1.28, 0.16, 0.2);
  box(door, mats.timber, 0.9, 1.92, 0.06, 0.45, 0.96, 0);
  box(door, mats.timberDark, 0.78, 0.06, 0.07, 0.45, 0.55, 0.02);
  box(door, mats.timberDark, 0.78, 0.06, 0.07, 0.45, 1.35, 0.02);
  box(door, mats.iron, 0.08, 0.08, 0.08, 0.78, 1.0, 0.05);
  group.add(door);

  box(group, mats.glass, 0.92, 0.72, 0.04, 1.15, 1.55, 0.08);
  box(group, mats.timberDark, 0.96, 0.04, 0.05, 1.15, 1.55, 0.12);
  box(group, mats.timber, 1.08, 0.08, 0.1, 1.15, 1.96, 0.1);
  box(group, mats.timber, 1.08, 0.08, 0.1, 1.15, 1.14, 0.1);

  const eaveY = wall + 0.08;
  const ridgeZ = -depth / 2;
  const front = thatch(6.5, eaveY, 0.58, ridgeY, ridgeZ);
  const back = thatch(6.5, eaveY, -depth - 0.58, ridgeY, ridgeZ);
  owned.push(front.geometry, back.geometry);
  group.add(front, back);
  box(group, mats.timberDark, 6.5, 0.16, 0.28, 0, ridgeY + 0.08, ridgeZ);

  const chimney = new THREE.Group();
  chimney.position.set(-1.7, 0, -3.15);
  for (let i = 0; i < 5; i++) {
    const s = 0.56 - i * 0.025;
    box(chimney, i % 2 ? mats.stone : mats.stoneDark, s, 0.48, s * 0.86, 0, 3.78 + i * 0.46, 0);
  }
  group.add(chimney);

  box(group, mats.floor, 5.35, 0.08, 4.15, 0, 0.16, -2.28);
  for (let i = 0; i < 6; i++) box(group, mats.timberDark, 5.2, 0.015, 0.04, 0, 0.2, -0.55 - i * 0.6);
  box(group, mats.timber, 0.14, 0.16, 4.2, -1.5, 2.48, -2.3);
  box(group, mats.timber, 0.14, 0.16, 4.2, 1.2, 2.48, -2.3);
  box(group, mats.stone, 1.05, 1.15, 0.55, -1.7, 0.7, -4.05);
  box(group, mats.stoneDark, 0.7, 0.7, 0.2, -1.7, 0.5, -3.8);
  const flame = box(group, mats.fire, 0.42, 0.18, 0.16, -1.7, 0.28, -3.72);
  box(group, mats.timber, 1.4, 0.08, 0.8, 0.5, 0.78, -2.0);
  box(group, mats.timberDark, 0.08, 0.7, 0.08, 0.0, 0.42, -1.7);
  box(group, mats.timberDark, 0.08, 0.7, 0.08, 1.0, 0.42, -1.7);
  box(group, mats.timberDark, 0.08, 0.7, 0.08, 0.0, 0.42, -2.3);
  box(group, mats.timberDark, 0.08, 0.7, 0.08, 1.0, 0.42, -2.3);
  box(group, mats.clothPale, 0.9, 0.02, 0.5, 0.5, 0.83, -2.0);
  box(group, mats.timber, 1.05, 0.28, 1.7, 1.95, 0.32, -3.55);
  box(group, mats.cloth, 0.95, 0.12, 1.55, 1.95, 0.5, -3.55);
  box(group, mats.clothPale, 0.42, 0.1, 0.28, 1.85, 0.6, -2.9);
  box(group, mats.timberDark, 0.7, 0.4, 0.42, -2.1, 0.32, -0.85);

  const smokeN = low ? 6 : 12;
  const puffGeo = new THREE.SphereGeometry(1, 6, 5);
  owned.push(puffGeo);
  const puffs = Array.from({ length: smokeN }, (_, i) => {
    const material = mats.smoke.clone();
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
      door.rotation.y = doorAngle;
      flame.scale.y = 0.18 * (0.85 + Math.sin(time * 9) * 0.2);
      for (let i = 0; i < puffs.length; i++) {
        const puff = puffs[i];
        puff.life = (puff.life + dt * 0.18) % 1;
        const life = puff.life;
        const drift = life * life * 0.85;
        puff.mesh.position.set(
          -1.7 + Math.sin(time * 0.7 + i * 1.7) * drift,
          5.95 + life * 2.6,
          -3.15 + Math.cos(time * 0.55 + i) * drift * 0.65,
        );
        puff.mesh.scale.setScalar(0.07 + life * 0.42);
        puff.material.opacity = (1 - life) * (1 - life) * 0.5;
      }
    },
    dispose() {
      for (const g of owned) g.dispose();
    },
  };
}
