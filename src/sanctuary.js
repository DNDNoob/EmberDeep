import * as THREE from 'three';

export const SANCTUARY_HEIGHT = 2.05;
const ROOM_WIDTH = 7, ROOM_DEPTH = 5;
const MAP_WIDTH = 2.55, MAP_HEIGHT = 1.48;
const MAP_X = 130, MAP_Y = 152, MAP_SIZE = 208;

// Reserve a path before placing pockets or strange doors into its walls.
export function findSanctuaryEntrance(g, W, H, safe, distances) {
  let entrance;
  const sealed = i => g[i] === 2 || (g[i] === 0 && distances[i] < 0);
  for (let x = 1; x < W - 1; x++) {
    for (let z = H - 1; z > 0; z--) {
      const i = z * W + x;
      if (g[i] !== 1) {
        if (g[i] === 0 && distances[i] >= 0) {
          const cost = (H - 1 - z) * 6 + Math.abs(safe.tx - x);
          if (!entrance || cost < entrance.cost) entrance = {x, z, cost};
        }
        break;
      }
      // The passage has an open side only where that side is already reachable.
      if (sealed(i - 1) || sealed(i + 1)) break;
    }
  }
  return entrance;
}

// Append the room without moving any existing maze coordinates.
export function attachSanctuary(floor, entrance) {
  const {W, H, g, safe} = floor;
  const front = H + 1, back = front + ROOM_DEPTH;
  const left = Math.max(1, Math.min(W - ROOM_WIDTH - 1, entrance.x - (ROOM_WIDTH >> 1)));
  const right = left + ROOM_WIDTH;
  const height = back + 1;
  const grid = new Uint8Array(W * height).fill(1);
  grid.set(g);
  grid[safe.ty * W + safe.tx] = 0;
  const mask = new Uint8Array(W * height);
  for (let z = entrance.z + 1; z < front; z++) {
    grid[z * W + entrance.x] = 0;
    mask[z * W + entrance.x] = 1;
  }
  for (let z = front; z < back; z++) {
    grid.fill(0, z * W + left, z * W + right);
    mask.fill(1, z * W + left, z * W + right);
  }

  const booth = (type, label, x, z, nx, color) => ({type, label, x, z, nx, nz:0, yaw:nx * Math.PI / 2, color});
  const booths = [
    booth('brewer', 'The Brewer', left + 0.74, front + 1.42, 1, '#75b9a1'),
    booth('smith', 'Blacksmith', right - 0.74, front + 1.42, -1, '#e89b69'),
    booth('pat', 'Pat Sajak', right - 0.87, front + 3.76, -1, '#c197dc'),
  ];
  const room = {left, right, front, back, booths, entrance, mapX:(left + right) / 2};
  const x = left + 1.56, z = front + 3.55;
  const tx = Math.floor(x), ty = Math.floor(z);
  grid[ty * W + tx] = 4;
  const keeper = floor.npcs.find(npc => npc.type === 'keeper');
  Object.assign(keeper, {x:x + 0.73, z:z + 0.25});
  Object.assign(safe, {x, z, tx, ty, room});

  const inTunnel = (tx, tz) => tx === entrance.x && tz > entrance.z;
  const removed = new Set();
  const props = floor.props.filter(p => {
    // Clear wall hangings and furniture that used to face the approach.
    const nearX = Math.abs(p.x - entrance.x - 0.5) < 0.75;
    if (!nearX || p.z < entrance.z + 0.78) return true;
    removed.add(p.x + ',' + p.z);
    return false;
  });
  floor.sconces = floor.sconces.filter(q => !inTunnel(Math.floor(q.lx) + q.dx, Math.floor(q.lz) + q.dz));
  floor.discs = floor.discs.filter(([px, pz]) => !removed.has(px + ',' + pz));
  floor.props = props;

  for (const b of booths) {
    // The sides of each booth and its work surface leave the center open.
    for (const offset of [-0.48, -0.13, 0.22, 0.57]) {
      floor.discs.push([b.x + b.nx * offset, b.z - 0.82, 0.055],
        [b.x + b.nx * offset, b.z + 0.82, 0.055]);
    }
    floor.discs.push([b.x + b.nx * 0.45, b.z + b.nx * 0.57, 0.22]);
  }
  const pat = booths.find(b => b.type === 'pat');
  const wx = pat.x, wz = pat.z - 0.32, nx = pat.nx;
  safe.wheel = {x:wx, z:wz, nx, nz:0, yaw:pat.yaw, pat:[wx + nx * 0.24, wz - nx * 0.56],
    discs:[[wx - nx * 0.03, wz, 0.24], [wx, wz - 0.38, 0.07], [wx, wz + 0.38, 0.07]]};

  floor.mazeH = H;
  Object.assign(floor, {H:height, g:grid, safeMask:mask});
  for (const key of ['panelAt', 'pocketMask', 'seen']) {
    const expanded = new Uint8Array(W * height);
    expanded.set(floor[key]);
    floor[key] = expanded;
  }
}

function canvasPanel(width, height, worldWidth, worldHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth, worldHeight),
    new THREE.MeshBasicMaterial({map, toneMapped:false}));
  return {mesh, ctx, map};
}

// Keep exactly one display in the playable scene. Lift previews build floor
// meshes and decor independently and never take ownership of the live board.
export function createSanctuaryDisplay() {
  const group = new THREE.Group();
  group.name = 'Keeper’s Sanctuary displays';
  const board = canvasPanel(448, 260, MAP_WIDTH, MAP_HEIGHT);
  board.mesh.name = 'Live Maze Map';
  board.mesh.rotation.y = Math.PI;
  group.add(board.mesh);
  const signs = new Map();
  let currentFloor, lastDraw = -Infinity;

  function sign(label, tint) {
    if (signs.has(label)) return signs.get(label);
    const panel = canvasPanel(192, 24, 1.46, 0.18);
    const {ctx} = panel;
    ctx.fillStyle = '#251d19';
    ctx.fillRect(0, 0, 192, 24);
    ctx.strokeStyle = tint;
    ctx.strokeRect(1.5, 1.5, 189, 21);
    ctx.fillStyle = tint;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label.toUpperCase(), 96, 17);
    panel.mesh.name = label;
    group.add(panel.mesh);
    signs.set(label, panel.mesh);
    return panel.mesh;
  }

  function draw(floor, depth, peers) {
    const {W, H, g, pocketMask, safeMask} = floor;
    const {ctx:c, map} = board;
    c.fillStyle = '#122224';
    c.fillRect(0, 0, 448, 260);
    c.strokeStyle = '#668780';
    c.strokeRect(3.5, 3.5, 441, 253);
    c.fillStyle = '#e8ce98';
    c.font = 'bold 20px monospace';
    c.fillText('LIVE MAZE MAP', 24, 29);
    c.textAlign = 'right';
    c.font = 'bold 13px monospace';
    c.fillText('DEPTH ' + depth, 423, 27);
    c.textAlign = 'left';
    c.fillStyle = '#0c171a';
    c.fillRect(18, 41, 224, 209);
    c.fillStyle = '#355657';
    c.fillRect(253, 44, 1, 156);
    const step = Math.min(MAP_SIZE / W, 192 / H);
    const x0 = MAP_X - W * step / 2, z0 = MAP_Y - H * step / 2;
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (g[i] === 1 || pocketMask[i]) continue;
        c.fillStyle = g[i] === 2 ? '#dc9760' : safeMask[i] ? '#aa8551' : g[i] === 3 ? '#41615e' : '#688a81';
        c.fillRect(Math.floor(x0 + x * step), Math.floor(z0 + z * step), Math.ceil(step), Math.ceil(step));
      }
    }
    c.fillStyle = '#91b7ae';
    c.font = 'bold 13px monospace';
    c.fillText('PLAYERS IN THE MAZE', 268, 57);
    const rows = 7;
    for (const [i, peer] of peers.entries()) {
      const x = x0 + peer.x * step, y = z0 + peer.z * step;
      const tint = peer.down ? '#aca99c' : peer.hex;
      const label = i + 1;
      c.beginPath();
      c.arc(x, y, 7.5, 0, Math.PI * 2);
      c.fillStyle = '#10191b';
      c.fill();
      c.strokeStyle = tint;
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = '#ffffff';
      c.font = 'bold 9px monospace';
      c.textAlign = 'center';
      c.fillText(label, x, y + 3);
      c.textAlign = 'left';
      if (i >= rows) continue;
      c.fillStyle = tint;
      c.font = 'bold 12px monospace';
      c.fillText(label, 268, 80 + i * 18);
      c.fillStyle = '#e0e9d8';
      c.fillText(peer.name, 290, 80 + i * 18, 134);
    }
    c.font = '12px monospace';
    c.fillStyle = '#a5b8ae';
    if (!peers.length) c.fillText('No other players here', 268, 82, 153);
    if (peers.length > rows) c.fillText('+' + (peers.length - rows) + ' more', 268, 213);
    c.fillStyle = '#aa8551';
    c.fillRect(268, 230, 9, 9);
    c.fillStyle = '#e8ce98';
    c.fillText('Sanctuary', 284, 239);
    c.lineWidth = 1;
    map.needsUpdate = true;
  }

  function update(floor, depth, visible, x, z, time, getPeers) {
    const room = floor.safe?.room;
    group.visible = !!room && visible && Math.hypot(x - room.mapX, z - room.back) < 12;
    if (!group.visible) return;
    if (currentFloor !== floor) {
      currentFloor = floor;
      lastDraw = -Infinity;
      board.mesh.position.set(room.mapX, 1.15, room.back - 0.096);
      for (const b of room.booths) {
        const mesh = sign(b.label, b.color);
        mesh.rotation.y = b.yaw;
        mesh.position.set(b.x + b.nx * 0.626, 1.44, b.z);
      }
    }
    if (time - lastDraw < 0.12) return;
    lastDraw = time;
    draw(floor, depth, getPeers(floor));
  }
  return {group, update};
}
