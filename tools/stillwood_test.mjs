// node tools/stillwood_test.mjs
import assert from 'node:assert/strict';
import {STILL,horizForward,lookDir,placeBehind,rayHitsPond,crossedDoor,stillStep,pondSpawnDue,pondSpawnAt,clearField,segDist} from '../src/stillwood.js';

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

// A new pond is due after about 500 ft (152.4 m) from the newest one, not before.
{const last={x:3,z:-16,r:5.5};
  assert.ok(Math.abs(STILL.pondEvery-152.4)<1e-9);
  assert.equal(pondSpawnDue(3,-16-150,last),false);
  assert.equal(pondSpawnDue(3,-16-153,last),true);
  assert.equal(pondSpawnDue(3+120,-16+100,last),true);
  assert.equal(pondSpawnDue(3,-16,last),false);
}
// The next pond is 25-35 m ahead within ~15 degrees of facing, deterministic from seed+index+position+yaw, clear of existing ponds.
{for(const yaw of [0,1.3,-2.4,3.0]){
    const a=pondSpawnAt({seed:7,index:1,x:10,z:-170,yaw,ponds:[]}),b=pondSpawnAt({seed:7,index:1,x:10,z:-170,yaw,ponds:[]});
    assert.deepEqual(a,b,'same inputs give the same pond');
    const d=Math.hypot(a.x-10,a.z+170),f=horizForward(yaw),dot=((a.x-10)*f[0]+(a.z+170)*f[1])/d;
    assert.ok(d>=24.9&&d<=35.1,'distance '+d);
    assert.ok(Math.acos(Math.min(1,dot))<0.2,'angle off facing '+Math.acos(dot));
    assert.ok(a.r>=4.8&&a.r<=6.0&&a.i===1&&a.fx===10&&a.fz===-170);
  }
  const x=pondSpawnAt({seed:7,index:1,x:0,z:0,yaw:0,ponds:[]}),y=pondSpawnAt({seed:8,index:1,x:0,z:0,yaw:0,ponds:[]}),w=pondSpawnAt({seed:7,index:2,x:0,z:0,yaw:0,ponds:[]});
  assert.notDeepEqual(x,y);assert.notDeepEqual(x,w);
  // an existing pond in the way turns it aside
  const f0=pondSpawnAt({seed:7,index:3,x:0,z:0,yaw:0,ponds:[]});
  const f1=pondSpawnAt({seed:7,index:3,x:0,z:0,yaw:0,ponds:[{x:f0.x,z:f0.z,r:5.5}]});
  assert.ok(Math.hypot(f1.x-f0.x,f1.z-f0.z)>5.5+f0.r+7,'moved clear of the old pond');
}
// The meadow field is seeded and in 0..1; the path distance is a segment distance.
{const a=clearField(12.3,-4.5,7);assert.equal(a,clearField(12.3,-4.5,7));assert.ok(a>=0&&a<=1);
  assert.notEqual(a,clearField(12.3,-4.5,8));
  assert.ok(Math.abs(segDist(0,5,0,0,10,0)-5)<1e-9&&Math.abs(segDist(-3,4,0,0,10,0)-5)<1e-9);}
console.log('stillwood rules ok');
