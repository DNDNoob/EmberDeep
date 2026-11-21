// node tools/stillwood_test.mjs
import assert from 'node:assert/strict';
import {STILL,horizForward,lookDir,placeBehind,rayHitsPond,crossedDoor,stillStep} from '../src/stillwood.js';

const pond={x:0,z:-16,r:STILL.pondR};
const fresh=()=>({
  x:0,z:-12,yaw:0,pitch:0,
  door:{x:0,z:0,face:0},pond,pinned:false,hold:0,
});

// Looking along yaw 0 is toward -Z, and negative pitch looks down.
{const f=horizForward(0);assert.ok(Math.abs(f[0])<1e-6&&f[1]<0);
  const d=lookDir(0,-0.8);assert.ok(d[1]<0,'negative pitch looks down')}

// The door stays behind a running player and never enters the forward view.
{const s=fresh();
  for(let i=0;i<12;i++){
    const f=horizForward(s.yaw);
    s.x+=f[0]*1.2;s.z+=f[1]*1.2;
    stillStep(s,0.2);
    const dx=s.door.x-s.x,dz=s.door.z-s.z;
    const dot=(f[0]*dx+f[1]*dz)/Math.hypot(dx,dz);
    assert.ok(dot<-0.95,'door slipped into view while running, dot '+dot);
    assert.equal(s.pinned,false);
  }}

// Looking down into the pond pins the door, and turning does not drag it.
{const s=fresh();s.x=0;s.z=-12;s.pitch=-0.9;stillStep(s,0.05);
  assert.equal(s.down,true);assert.equal(s.pinned,true);
  const held={x:s.door.x,z:s.door.z,face:s.door.face};
  s.pitch=0;
  for(let i=0;i<8;i++){s.yaw+=0.2;stillStep(s,0.1)}
  assert.equal(s.pinned,true);
  assert.ok(Math.hypot(s.door.x-held.x,s.door.z-held.z)<1e-6,'pinned door moved');
}

// A full turn toward the frozen door, slower than the grace, keeps it and counts as seeing it.
{const s=fresh();s.z=-12;s.pitch=-0.9;stillStep(s,0.05);assert.ok(s.pinned);
  s.pitch=0;const steps=14;
  for(let i=0;i<steps;i++){s.yaw+=Math.PI/steps;stillStep(s,1.1/steps)}
  assert.equal(s.pinned,true);
  assert.equal(s.direct,true);
}

// Looking away from both the pond and the door lets it slip behind you again.
{const s=fresh();s.z=-12;s.pitch=-0.9;stillStep(s,0.05);
  s.pitch=0;s.yaw=0.4;
  stillStep(s,STILL.grace+0.05);
  assert.equal(s.pinned,false);
  const f=horizForward(s.yaw),dx=s.door.x-s.x,dz=s.door.z-s.z;
  assert.ok((f[0]*dx+f[1]*dz)/Math.hypot(dx,dz)<-0.95);
}

// The pond ray misses if you are looking level, and hits when you look down from the bank.
{const eye=[0,1.6,-12];
  assert.equal(rayHitsPond(eye,lookDir(0,0),pond),null);
  const hit=rayHitsPond(eye,lookDir(0,-0.9),pond);
  assert.ok(hit&&(hit.x-pond.x)**2+(hit.z-pond.z)**2<pond.r*pond.r);
}

// Walking through the pinned opening counts; passing beside it does not.
{const door={x:0,z:0,face:0};
  assert.equal(crossedDoor(0,-1.2,0,1.2,door),true);
  assert.equal(crossedDoor(2,-1.2,2,1.2,door),false);
  assert.equal(crossedDoor(0,-1.2,0,-0.2,door),false);
}

// placeBehind with a trunk in the way steps the door further back, still behind the player.
{const p=placeBehind(0,0,0,4.2,(x,z)=>z>3&&z<6&&Math.abs(x)<1);
  assert.ok(p.z>=6);assert.ok(Math.abs(p.x)<2);
}

console.log('stillwood rules ok');
