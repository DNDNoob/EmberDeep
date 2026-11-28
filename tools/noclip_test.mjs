// node tools/noclip_test.mjs
import assert from 'node:assert/strict';
import {noclipDest,MOVE} from '../src/movement.js';

const W=9,H=9;
// 0 open, 1 wall, 2 gate
const g=[
  2,2,2,2,2,2,2,2,2,
  2,0,0,1,0,0,0,0,2,
  2,0,0,1,0,0,0,0,2,
  2,0,0,2,0,0,0,0,2,
  2,0,0,1,1,0,0,0,2,
  2,0,0,0,0,0,1,0,2,
  2,0,0,0,0,0,1,1,2,
  2,0,0,0,0,0,0,0,2,
  2,2,2,2,2,2,2,2,2,
];
const cell=(x,z)=>g[z*W+x];
const full=MOVE.sprint;

// A sprint straight into a wall cell lands in the open cell beyond it.
{const d=noclipDest({x:2.8,z:1.5,hitVX:full,hitVZ:0,sprint:true,fullSpeed:full,roll:0,cell,W,H});
  assert.deepEqual(d,{x:4.5,z:1.5})}

// One roll per impact: a miss stays put, and a graze below full speed does not count.
assert.equal(noclipDest({x:2.8,z:1.5,hitVX:full,hitVZ:0,sprint:true,fullSpeed:full,roll:0.5,cell,W,H}),null);
assert.equal(noclipDest({x:2.8,z:1.5,hitVX:full,hitVZ:0,sprint:true,fullSpeed:full,roll:0.04,cell,W,H}),null);
assert.equal(noclipDest({x:2.8,z:1.5,hitVX:full*0.4,hitVZ:0,sprint:true,fullSpeed:full,roll:0,cell,W,H}),null);
assert.equal(noclipDest({x:2.8,z:1.5,hitVX:full,hitVZ:0,sprint:false,fullSpeed:full,roll:0,cell,W,H}),null);

// The locked gate is never a shortcut, and a wall with no open cell beyond it is not either.
assert.equal(noclipDest({x:2.8,z:3.5,hitVX:full,hitVZ:0,sprint:true,fullSpeed:full,roll:0,cell,W,H}),null);
assert.equal(noclipDest({x:5.2,z:6.5,hitVX:full,hitVZ:0,sprint:true,fullSpeed:full,roll:0,cell,W,H}),null);

// The larger axis is the one that clips, so a diagonal shove still picks a real wall.
{const d=noclipDest({x:1.5,z:4.2,hitVX:0.2,hitVZ:-full,sprint:true,fullSpeed:full,roll:0.06,cell,W,H});
  assert.equal(d,null)} // open floor to the north, not a wall
{const d=noclipDest({x:4.5,z:3.8,hitVX:0,hitVZ:full,sprint:true,fullSpeed:full,roll:0,cell,W,H});
  assert.deepEqual(d,{x:4.5,z:5.5})}

console.log('noclip rules ok');
