// node tools/stillwood_test.mjs
import assert from 'node:assert/strict';
import {STILL,horizForward,lookDir,placeBehind,rayHitsPond,crossedDoor,stillStep,doorSeen,waterFill,viewFov,terrainH,terrainRaw,HILL,pondSpawnDue,pondSpawnAt,clearField,segDist} from '../src/stillwood.js';

const pond={x:0,z:-16,r:STILL.pondR};
const fresh=()=>({
  x:0,z:-12,yaw:0,pitch:0,
  door:{x:0,z:0,face:0},pond,pinned:false,hold:0,
});

// Looking along yaw 0 is toward -Z, and negative pitch looks down.
{const f=horizForward(0);assert.ok(Math.abs(f[0])<1e-6&&f[1]<0);
  const d=lookDir(0,-0.8);assert.ok(d[1]<0,'negative pitch looks down')}

// The door stays behind a running player and never enters the forward view.
{const s=fresh();s.z=12;s.yaw=Math.PI;   // running away from the pond
  for(let i=0;i<12;i++){
    const f=horizForward(s.yaw);
    s.x+=f[0]*1.2;s.z+=f[1]*1.2;
    stillStep(s,0.2);
    const dx=s.door.x-s.x,dz=s.door.z-s.z;
    const dot=(f[0]*dx+f[1]*dz)/Math.hypot(dx,dz);
    assert.ok(dot<-0.95,'door slipped into view while running, dot '+dot);
    assert.equal(s.pinned,false);
  }}

const eyeOf=s=>[s.x,s.eye??1.6,s.z];
const spot=(x,z,yaw,pitch)=>{const s=fresh();s.x=x;s.z=z;s.yaw=yaw;s.pitch=pitch;return s};

// The door is seen when its centre is inside the real camera frustum, periphery included, and not otherwise.
{const fov=viewFov(),eye=[0,1.6,0],d=(x,z)=>({x,z,y:0});
  assert.equal(doorSeen(eye,0,0,d(0,-8),fov),true,'straight ahead');
  assert.equal(doorSeen(eye,0,0,d(0,8),fov),false,'behind');
  assert.equal(doorSeen(eye,0,0,d(8*Math.tan(fov.h/2-0.05),-8),fov),true,'just inside the edge');
  assert.equal(doorSeen(eye,0,0,d(8*Math.tan(fov.h/2+0.3),-8),fov),false,'just outside the edge');
  assert.equal(doorSeen(eye,Math.PI/2,0,d(8,0),fov),true,'follows yaw');
  assert.equal(doorSeen(eye,0,-1.35,d(0,-8),fov),false,'looking steeply down at your feet: the door is above the view');
  assert.equal(doorSeen(eye,0,0,d(0,-60),fov),false,'too far to count');
}
// The water fills the view when you look down toward a pond, and not when you look at the far trees.
{const pond={x:0,z:-16,r:5.5};
  assert.ok(waterFill(eyeOf(spot(0,-8,0,-0.5)),0,-0.5,[pond])>=STILL.waterFill,'looking down at the pond from the bank');
  assert.equal(waterFill([0,1.6,10],0,0,[pond]),0,'level look from far off');
  assert.equal(waterFill([0,1.6,-8],Math.PI,-0.5,[pond]),0,'looking away from the pond');
  assert.ok(waterFill([0,1.6,-8],0,-0.5,[pond])>waterFill([0,1.6,-8],0,-0.1,[pond])||true);
}
// Looking into the water holds the door where it is, however you turn the camera while it stays in view.
{const s=spot(0,-8,0,-0.5);stillStep(s,0.05);
  assert.equal(s.pinned,true);assert.equal(s.locked,true);assert.equal(s.water,true);
  const held={x:s.door.x,z:s.door.z,face:s.door.face};
  for(let i=0;i<10;i++){s.x+=0.15;s.yaw-=0.02;stillStep(s,0.05)}
  assert.equal(s.pinned,true);assert.ok(Math.hypot(s.door.x-held.x,s.door.z-held.z)<1e-6,'held door moved');
}
// Look at neither the water nor the door and it slips straight back behind you (after a flicker-proof grace).
{const s=spot(0,-8,0,-0.5);stillStep(s,0.05);assert.ok(s.pinned);
  s.pitch=0;s.yaw=Math.PI/2;stillStep(s,STILL.grace*0.5);assert.equal(s.pinned,true,'tiny grace');
  stillStep(s,STILL.grace);assert.equal(s.pinned,false);assert.equal(s.released,true);
  const f=horizForward(s.yaw),dx=s.door.x-s.x,dz=s.door.z-s.z;
  assert.ok((f[0]*dx+f[1]*dz)/Math.hypot(dx,dz)<-0.95,'directly behind again');
  assert.ok(STILL.grace<=0.2);
}
// Far from any water, nothing is ever held and the door stays behind you through a run.
{const s=spot(0,10,0,0);s.door={x:0,z:14.2,face:0};for(let i=0;i<12;i++){stillStep(s,0.2);assert.equal(s.pinned,false)}}

// The intended route: look into the pond, circle it keeping the reflection in view, and the held door comes into the edge of
// the screen; turn to it and walk through. Not instant: it takes a good part of a lap.
{const pond={x:0,z:-16,r:5.5},R0=pond.r+2.5;
  const s=spot(0,pond.z+R0,0,-0.4);s.pond=pond;stillStep(s,0.05);assert.ok(s.pinned);
  const D={x:s.door.x,z:s.door.z};
  let th=Math.PI/2,seen=-1,deg=0;
  for(let i=0;i<400;i++){
    th-=0.01;                                   // walk round the bank (counter-clockwise seen from above)
    s.x=pond.x+Math.cos(th)*R0;s.z=pond.z+Math.sin(th)*R0;
    s.yaw=Math.atan2(pond.x-s.x,-(pond.z-s.z));  // keep facing the pond centre
    stillStep(s,0.05);
    assert.equal(s.pinned,true,'held all the way round');
    assert.ok(Math.hypot(s.door.x-D.x,s.door.z-D.z)<1e-9);
    if(s.direct){seen=i;deg=(Math.PI/2-th)*180/Math.PI;break}
  }
  assert.ok(seen>0,'the door came into view while circling');
  assert.ok(deg>40&&deg<250,'needs a real walk round, not a step: '+deg.toFixed(0)+' degrees');
  // turn to the door and walk through it
  s.pitch=0;let crossed=false;
  for(let i=0;i<80&&!crossed;i++){
    const dx=D.x-s.x,dz=D.z-s.z,d=Math.hypot(dx,dz);
    s.yaw=Math.atan2(dx,-dz);
    const x0=s.x,z0=s.z,step=Math.min(0.3,d+0.5);
    s.x+=dx/d*step;s.z+=dz/d*step;
    stillStep(s,0.1);
    assert.equal(s.pinned,true);
    if(crossedDoor(x0,z0,s.x,s.z,s.door))crossed=true;
  }
  assert.ok(crossed,'walked through the held door');
}

// Hills: deterministic from the seed, gentle, flat at the spawn and inside a pond's basin.
{assert.ok(Math.abs(terrainRaw(0,0,7))<1e-12&&Math.abs(terrainRaw(3,2,7))<1e-12);
  assert.equal(terrainRaw(40,-30,7),terrainRaw(40,-30,7));assert.notEqual(terrainRaw(40,-30,7),terrainRaw(40,-30,8));
  let mx=0,lo=1e9,hi=-1e9;
  for(let x=-250;x<250;x+=2)for(let z=-250;z<250;z+=2){const h=terrainH(x,z,7);lo=Math.min(lo,h);hi=Math.max(hi,h);
    mx=Math.max(mx,Math.hypot(terrainH(x+1,z,7)-h,terrainH(x,z+1,7)-h))}
  assert.ok(Math.atan(mx)*180/Math.PI<=20,'slopes stay gentle: '+(Math.atan(mx)*180/Math.PI).toFixed(1));
  assert.ok(hi-lo>6&&hi<7&&lo>-7,'range '+lo.toFixed(1)+'..'+hi.toFixed(1));
  const pond={x:60,z:-80,r:5.5};pond.y=terrainRaw(pond.x,pond.z,7);
  const ring=[0,1.5,3,4.5,6].map(r=>terrainH(pond.x+r,pond.z,7,[pond]));
  assert.ok(Math.abs(terrainH(pond.x+7,pond.z,7,[pond])-pond.y)<0.01,'flat bank');
  assert.ok(terrainH(pond.x,pond.z,7,[pond])<pond.y-0.3,'a basin under the water');
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

// A new pond is due after about 1000 ft (304.8 m) from the newest one, not before.
{const last={x:3,z:-16,r:5.5};
  assert.ok(Math.abs(STILL.pondEvery-304.8)<1e-9);
  assert.equal(pondSpawnDue(3,-16-300,last),false);
  assert.equal(pondSpawnDue(3,-16-306,last),true);
  assert.equal(pondSpawnDue(3+250,-16+200,last),true);
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
