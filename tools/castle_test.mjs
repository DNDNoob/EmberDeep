import assert from 'node:assert/strict';
import {CASTLE_GALLERY,carveCastle,castleBlocked,castleGround,castleHeadroom,
  castleHatchAt,isCastleDepth,startCastleHatch} from '../src/abandoned-castle.js';
import {newBody,stepMove} from '../src/movement.js';

assert(isCastleDepth(13));
assert(isCastleDepth(29));
assert(!isCastleDepth(14));

const castle=carveCastle(new Uint8Array(41*41).fill(1),41,()=>0.75);
const dt=1/60;
for(const stair of castle.stairs){
  const radius=1.34;
  const body=newBody({x:stair.x+.14,z:stair.z+radius});
  const world={
    blocked:(x,z)=>castleBlocked(castle,x,z,body.y,1.04,.22),
    groundAt:(x,z)=>castleGround(castle,x,z,body.y,0),
    ceilingAt:(x,z)=>castleHeadroom(castle,x,z,body.y,.22)-1.04,
    snap:.118,
  };
  const walkTo=(x,z)=>{
    for(let n=0;n<90;n++){
      const dx=x-body.x,dz=z-body.z,distance=Math.hypot(dx,dz);
      if(distance<.04)return;
      stepMove(body,dt,{fwd:1,fx:dx/distance,fz:dz/distance},world);
    }
    assert.fail(`Blocked walking to (${x}, ${z}) from (${body.x}, ${body.y}, ${body.z})`);
  };
  for(let angle=Math.PI/2+.13;angle<Math.PI*2-.09;angle+=.11){
    walkTo(stair.x+radius*Math.cos(angle),stair.z+radius*Math.sin(angle));
  }
  walkTo(stair.x+1.97,stair.z-.13);
  walkTo(stair.x+1.97,2.02);
  assert.equal(body.y,CASTLE_GALLERY,'the spiral stair connects to the gallery');
}

for(const [index,hatch] of castle.hatches.entries()){
  const x=(hatch.x0+hatch.x1)/2,z=(hatch.z0+hatch.z1)/2;
  assert.equal(castleHatchAt(castle,x,z),index);
  assert.equal(castleGround(castle,x,z,CASTLE_GALLERY,0),CASTLE_GALLERY);
  assert(startCastleHatch(hatch,1));
  assert(!startCastleHatch(hatch,1.1),'a second step cannot restart an opening hatch');
  assert.equal(castleGround(castle,x,z,CASTLE_GALLERY,1.1),CASTLE_GALLERY);
  assert.equal(castleGround(castle,x,z,CASTLE_GALLERY,1.5),0);
  assert.equal(castleGround(castle,x,z,0,1.5),0,'the landing is on the lower floor');
  assert.equal(castleGround(castle,x,z,CASTLE_GALLERY,5),CASTLE_GALLERY);
}
console.log('Castle depth rotation, both stair routes, and trapdoor timing passed.');
