import assert from 'node:assert/strict';
import {CASTLE_GALLERY,carveCastle,castleBlocked,castleGround,castleHeadroom,
  castleHatchAt,isCastleDepth,startCastleHatch,stepCastleLadder,castleTunnelAt,drawCastlePerimeterWall} from '../src/abandoned-castle.js';
import {newBody,stepMove} from '../src/movement.js';

assert(isCastleDepth(13));
assert(isCastleDepth(29));
assert(!isCastleDepth(14));

const castle=carveCastle(new Uint8Array(41*41).fill(1),41,()=>0.75);
assert.equal(castle.stairs.length,4);
assert.equal(castle.ladders.length,2);
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
  const treads=[];
  for(let angle=Math.PI/2+.13;angle<Math.PI*2-.09;angle+=.11){
    treads.push([stair.x+radius*Math.cos(angle),stair.z+radius*Math.sin(angle)]);
  }
  for(const tread of treads)walkTo(...tread);
  walkTo(stair.x+1.97,stair.z-.13);
  walkTo(stair.x+2.34,stair.z-.13);
  assert.equal(body.y,CASTLE_GALLERY,'the spiral stair connects to the gallery');
  walkTo(stair.x+1.97,stair.z-.13);
  for(const tread of treads.toReversed())walkTo(...tread);
  walkTo(stair.x+.14,stair.z+radius);
  for(let i=0;i<30;i++)stepMove(body,dt,{fwd:0,fx:1,fz:0},world);
  assert.equal(body.y,0,'the spiral stair returns to the ground floor');
}

for(const ladder of castle.ladders){
  const body=newBody({x:ladder.x+ladder.nx*.68,z:ladder.z+ladder.nz*.68});
  const up=()=>stepCastleLadder(castle,body,dt,-ladder.nx,-ladder.nz);
  const down=()=>stepCastleLadder(castle,body,dt,ladder.nx,ladder.nz);
  assert(up());
  for(let i=0;i<34;i++)up();
  const stopped=body.y;
  assert(stopped>0&&stopped<CASTLE_GALLERY);
  stepCastleLadder(castle,body,dt,0,0);
  assert.equal(body.y,stopped,'letting go of movement holds the current rung');
  down();
  assert(body.y<stopped,'a player can reverse on the ladder');
  while(body.castleLadder)up();
  assert.equal(body.y,CASTLE_GALLERY);
  assert.equal(castleGround(castle,body.x,body.z,body.y,0),CASTLE_GALLERY);
  assert(!castleBlocked(castle,body.x,body.z,body.y,1.04,.22));
  assert(!down(),'walking on the landing does not start descending');
  body.x=ladder.x-ladder.nx*.20;
  body.z=ladder.z-ladder.nz*.20;
  assert(down());
  while(body.castleLadder)down();
  assert.equal(body.y,0);
  assert(!castleBlocked(castle,body.x,body.z,body.y,1.04,.22));
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

// Search at sub-tile resolution with the real collision radius and every trapdoor open.
// Each wing must still connect the north and south galleries if the other routes are omitted.
function reachable(layout,allowed,start=[174,19],goal=[36,147]){
  const queue=[start],seen=new Set([start.join(',')]);
  for(let i=0;i<queue.length;i++){
    const [x,z]=queue[i];
    if(x===goal[0]&&z===goal[1])return true;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,nz=z+dz,key=nx+','+nz,wx=nx/10,wz=nz/10;
      if(seen.has(key)||!allowed(wx,wz)||castleGround(layout,wx,wz,CASTLE_GALLERY,1.5)!==CASTLE_GALLERY||
        castleBlocked(layout,wx,wz,CASTLE_GALLERY,1.04,.22))continue;
      seen.add(key);queue.push([nx,nz]);
    }
  }
  return false;
}
for(const rng of [()=>0.2,()=>0.8]){
  const layout=carveCastle(new Uint8Array(41*41).fill(1),41,rng);
  for(const hatch of layout.hatches)startCastleHatch(hatch,1);
  assert(reachable(layout,(x,z)=>z<3||z>13.7||x<8.5),'the west wing connects both galleries');
  assert(reachable(layout,(x,z)=>z<3||z>13.7||x>13.9),'the east wing connects both galleries');
  assert(reachable(layout,(x,z)=>z<3||z>13.7||x>8.8&&x<10.9),'the central bridge connects both galleries');
  assert(layout.upperBounds.x1>39&&layout.upperBounds.z1>39);
  assert(layout.tunnelTiles.size>350,'the tunnels form a substantial second layer');
  const far=[385,385];
  for(const start of [[181,80],[100,171],[162,171]]){
    assert(castleTunnelAt(layout,start[0]/10,start[1]/10));
    assert(reachable(layout,castleTunnelAt.bind(null,layout),start,far),'every keep entrance reaches the far chamber through enclosed tunnels');
  }
  assert.equal(castleGround(layout,38.5,38.5,0,0),0,'the upper tunnels do not replace the lower maze floor');
  assert(castleHeadroom(layout,38.5,38.5,CASTLE_GALLERY,.22)<4,'distant passages have a stone roof');
  const wall=[];
  drawCastlePerimeterWall(layout,points=>wall.push(points),[[18,0,7],[18,0,9],[18,4.35,9],[18,4.35,7]],[-1,0,0],[[0,1],[1,1],[1,0],[0,0]],0);
  const covered=(y,z)=>wall.some(([lo,_,hi])=>lo[1]<y&&hi[1]>y&&lo[2]<z&&hi[2]>z);
  assert(covered(1,8)&&!covered(2.8,8)&&covered(4,8),'the doorway cuts only the upper part of the old keep wall');
}
console.log('Castle stairs, ladders, trapdoors, and the connected, enclosed upper tunnel network passed.');
