// node tools/stillwood_birds_test.mjs
import assert from 'node:assert/strict';
import {spawnBird,stepBird} from '../src/stillwood-birds.js';

const ground=()=>0;
const open=()=>true;
const ctx=(x=0,z=0)=>({x,z,yaw:0,ground,open});

const fly=spawnBird(0,3);
const x0=fly.x;
for(let t=0;t<2;t+=0.05)stepBird(fly,0.05,ctx());
assert.ok(Math.hypot(fly.x-x0,fly.z-0)>1,'a swallow covers ground while it is on the wing');
assert.equal(fly.mode,'fly');

const land=spawnBird(8,5);
land.mode='land';land.until=8;land.lx=land.x+2;land.lz=land.z;land.y=4;
for(let t=0;t<8;t+=0.05)stepBird(land,0.05,ctx(land.lx,land.lz+30));
assert.equal(land.mode,'perch','it comes down onto the grass');
assert.ok(Math.hypot(land.x-land.lx,land.z-land.lz)<1.2);
assert.ok(land.y<0.4);
assert.equal(land.fold,1);

const sit=land.until;
stepBird(land,0.2,ctx(land.x,land.z+40));
assert.equal(land.mode,'perch');
assert.ok(land.until<sit);

land.until=0.05;
stepBird(land,0.1,ctx(land.x,land.z+40));
assert.equal(land.mode,'launch','after sitting it lifts off');

const far=spawnBird(1,9);
far.x=200;far.z=0;
stepBird(far,0.05,ctx(0,0));
assert.ok(Math.hypot(far.x,far.z)<90,'a bird that leaves the wood is set back near you');

const kinds=new Set([0,4,7].map(i=>spawnBird(i,1).kind));
assert.equal(kinds.size,3);
