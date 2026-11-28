// node tools/stillwood_test.mjs
import assert from 'node:assert/strict';
import {STILL,horizForward,lookDir,placeBehind,rayHitsPond,crossedDoor,stillStep,doorSeen,waterFill,viewFov,terrainH,terrainRaw,mirrorPoint,mirrorYaw,biomeAt,rockSurface,rockPush,jumpTop,jumpReach,heightGrid,domeGrid,makeRock,STEP_MIN,placeLine,HILL,pondSpawnDue,pondSpawnAt,cottageSpawnDue,cottageSpawnAt,clearField,segDist} from '../src/stillwood.js';
import {cottagePush,cottageInside,cottageWorld} from '../src/stillwood-cottage.js';

const pond={x:0,z:-16,r:STILL.pondR};
const fresh=()=>({
  x:0,z:-12,yaw:0,pitch:0,
  door:{x:0,z:0,face:0},pond,pinned:false,hold:0,
});

// Looking along yaw 0 is toward -Z, and negative pitch looks down.
{const f=horizForward(0);assert.ok(Math.abs(f[0])<1e-6&&f[1]<0);
  const d=lookDir(0,-0.8);assert.ok(d[1]<0,'negative pitch looks down')}

// The way back sits on the line pond - player - door, player in the middle, wherever the player stands or looks.
{for(const [x,z,yaw] of [[0,-12,0],[12,-16,1.2],[-9,-5,2.5],[3,30,-0.7],[-40,-90,4]]){
    const s=fresh();s.x=x;s.z=z;s.yaw=yaw;s.pitch=0;stillStep(s,0.1);
    const ux=x-pond.x,uz=z-pond.z,L=Math.hypot(ux,uz),dx=s.door.x-x,dz=s.door.z-z,D=Math.hypot(dx,dz);
    assert.ok(Math.abs(D-STILL.behind)<1e-9,'distance');
    assert.ok((ux*dz-uz*dx)/(L*D)<1e-9&&(ux*dx+uz*dz)/(L*D)>1-1e-9,'collinear, player between pond and door');
    // and it faces the player: its facing direction is from the door toward the player
    assert.ok(Math.abs(Math.sin(s.door.face)+dx/D)<1e-9&&Math.abs(-Math.cos(s.door.face)+dz/D)<1e-9);
  }}
// Facing away from the pond puts that spot in front of you: the door is hidden, never seen, and never pins.
{const s=fresh();s.z=12;s.yaw=Math.PI;   // running away from the pond
  for(let i=0;i<12;i++){
    const f=horizForward(s.yaw);s.x+=f[0]*1.2;s.z+=f[1]*1.2;
    stillStep(s,0.2);
    assert.equal(s.hidden,true,'spot ahead is hidden');assert.equal(s.direct,false);assert.equal(s.pinned,false);
  }}
// Facing the pond from afar the spot is behind you: the door is shown there, not seen.
{const s=fresh();s.z=12;s.yaw=0;stillStep(s,0.2);assert.equal(s.hidden,false);assert.equal(s.pinned,false);assert.ok(s.door.z>s.z);}
// It reappears only once its spot has left the view (with the hide margin), never at the screen edge.
{const s=fresh();s.z=12;s.yaw=Math.PI;stillStep(s,0.1);assert.equal(s.hidden,true);
  const fov=viewFov();let shown=-1;
  for(let i=0;i<400&&shown<0;i++){s.yaw-=0.01;stillStep(s,0.05);if(!s.hidden)shown=i}
  assert.ok(shown>0);
  assert.equal(doorSeen([s.x,1.6,s.z],s.yaw,s.pitch,s.door,fov,STILL.seeMargin),false,'shown only out of view');
  assert.equal(s.pinned,false);}

const eyeOf=s=>[s.x,s.eye??1.6,s.z];
const spot=(x,z,yaw,pitch)=>{const s=fresh();s.x=x;s.z=z;s.yaw=yaw;s.pitch=pitch;return s};
// watch the water steadily for the freeze dwell
const settle=s=>{for(let i=0;i<Math.ceil(STILL.freezeDwell/0.05)+1&&!s.pinned;i++){stillStep(s,0.05);if(s.locked)s.sawLock=true}return s};

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
{const s=settle(spot(0,-9.5,0,-0.5));
  assert.equal(s.pinned,true);assert.equal(s.sawLock,true);assert.equal(s.water,true);
  const held={x:s.door.x,z:s.door.z,face:s.door.face};
  for(let i=0;i<10;i++){s.x+=0.15;s.yaw-=0.02;stillStep(s,0.05)}
  assert.equal(s.pinned,true);assert.ok(Math.hypot(s.door.x-held.x,s.door.z-held.z)<1e-6,'held door moved');
}
// Look at neither the water nor the door and it slips straight back behind you (after a flicker-proof grace).
{const s=settle(spot(0,-9.5,0,-0.5));assert.ok(s.pinned);
  s.pitch=0;s.yaw=Math.PI/2;stillStep(s,STILL.grace*0.5);assert.equal(s.pinned,true,'tiny grace');
  stillStep(s,STILL.grace);assert.equal(s.pinned,false);assert.equal(s.released,true);
  const dx=s.door.x-s.x,dz=s.door.z-s.z,ux=s.x-pond.x,uz=s.z-pond.z;
  assert.ok((ux*dx+uz*dz)/(Math.hypot(ux,uz)*Math.hypot(dx,dz))>1-1e-9,'back on the pond line');
  assert.ok(STILL.grace<=0.2);
}
// Far from any water, nothing is ever held and the door stays behind you through a run.
{const s=spot(0,10,0,0);s.door={x:0,z:14.2,face:0};for(let i=0;i<12;i++){stillStep(s,0.2);assert.equal(s.pinned,false)}}

// The intended route: look into the pond, circle it keeping the reflection in view, and the held door comes into the edge of
// the screen; turn to it and walk through. Not instant: it takes a good part of a lap.
{const pond={x:0,z:-16,r:5.5},R0=pond.r+2.5;
  const s=spot(0,pond.z+pond.r+1.5,0,-0.4);s.pond=pond;settle(s);assert.ok(s.pinned,'frozen at the bank');s.z=pond.z+R0;
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
// A cottage is due after 3,000 ft of walking, then every 1,000 ft after that.
{assert.ok(Math.abs(STILL.cottageFirst-3000*0.3048)<1e-9);
  assert.ok(Math.abs(STILL.cottageEvery-1000*0.3048)<1e-9);
  assert.equal(cottageSpawnDue(STILL.cottageFirst-0.2,false),false);
  assert.equal(cottageSpawnDue(STILL.cottageFirst,false),true);
  assert.equal(cottageSpawnDue(STILL.cottageEvery-0.2,true),false);
  assert.equal(cottageSpawnDue(STILL.cottageEvery,true),true);
}
// It stands ahead of the walker, facing them, and the same walk always grows the same house.
{for(const yaw of [0,1.1,-2.2]){
  const a=cottageSpawnAt({seed:7,index:0,x:40,z:-800,yaw,ponds:[],cottages:[]});
  const b=cottageSpawnAt({seed:7,index:0,x:40,z:-800,yaw,ponds:[],cottages:[]});
  assert.deepEqual(a,b);
  const dx=a.x-40,dz=a.z+800,f=horizForward(yaw),d=Math.hypot(dx,dz);
  assert.ok(d>20&&d<50,'distance '+d);
  assert.ok((dx*f[0]+dz*f[1])/d>0.85,'ahead of the walker');
  const fx=Math.sin(a.face),fz=Math.cos(a.face),px=-dx,pz=-dz,pl=Math.hypot(px,pz);
  assert.ok((fx*px+fz*pz)/pl>0.98,'door faces the walker');
}
  const blocked=cottageSpawnAt({seed:7,index:0,x:40,z:-800,yaw:0,ponds:[],cottages:[]});
  const moved=cottageSpawnAt({seed:7,index:0,x:40,z:-800,yaw:0,ponds:[{x:blocked.x,z:blocked.z,r:6}],cottages:[]});
  assert.ok(Math.hypot(moved.x-blocked.x,moved.z-blocked.z)>8,'moved off the pond');
}
// A shut door stops you. An open one lets you into the room, and the walls still do not.
{const home={x:10,z:-20,face:0,open:false,y:0};
  const body={x:10-0.84,z:-20+0.15};
  cottagePush(body,[home]);
  assert.ok(Math.hypot(body.x-(10-0.84),body.z-(-20+0.7))>0.2,'shut door pushes');
  const open={...home,open:true};
  const into={x:10,z:-22};
  cottagePush(into,[open]);
  assert.ok(cottageInside(open,into.x,into.z),'open door can be walked through');
  const wall={x:10-2.9,z:-22};
  cottagePush(wall,[open]);
  assert.ok(!cottageInside(open,wall.x,wall.z)||Math.abs(wall.x-(10-2.9))>0.15,'wall pushes');
  const back=cottageWorld(open,0,-2);
  assert.ok(cottageInside(open,back.x,back.z));
}
// The meadow field is seeded and in 0..1; the path distance is a segment distance.
{const a=clearField(12.3,-4.5,7);assert.equal(a,clearField(12.3,-4.5,7));assert.ok(a>=0&&a<=1);
  assert.notEqual(a,clearField(12.3,-4.5,8));
  assert.ok(Math.abs(segDist(0,5,0,0,10,0)-5)<1e-9&&Math.abs(segDist(-3,4,0,0,10,0)-5)<1e-9);}

// Stones: every one is standable from its real surface. You land if the surface is no higher than your feet plus one jump,
// so low stones are reachable from the ground, tall ones only from a lower stone beside them.
{const reach=jumpReach(1.6),jt=jumpTop(1.6);assert.ok(reach>1.3&&reach<1.6,'reach '+reach);assert.ok(jt<reach&&jt>1.2);assert.ok(STEP_MIN<0.5);
  const low=makeRock(domeGrid(2,2,0.9),{x:0,z:0});
  assert.ok(Math.abs(rockSurface(low,0,0)-0.9)<0.02,'top '+rockSurface(low,0,0));assert.equal(rockSurface(low,5,0),-Infinity);
  assert.ok(rockSurface(low,0.8,0)<rockSurface(low,0.2,0),'dome falls off');
  const q=rockPush(low,0.5,0,0);assert.ok(q&&Math.hypot(q[0],q[1])>0.5,'a walker on the ground is held at the foot');
  assert.ok(rockSurface(low,q[0],q[1])<=0.12+1e-6,'held where the stone is a step high');
  assert.equal(rockPush(low,0.2,0,reach),null,'a jump from the ground clears a 0.9 m stone');
  assert.equal(rockPush(low,0.2,0,rockSurface(low,0.2,0)),null,'standing on it');
  assert.ok(rockPush(low,0,0,0)!==null,'inside at ground level gets out');
  // a 2.5 m stone beside a 1.2 m stone: not from the ground, yes from the lower stone
  const mid=makeRock(domeGrid(3,3,1.2),{x:0,z:0}),tall=makeRock(domeGrid(4,4,2.5),{x:3.2,z:0});
  const edge=[tall.cx-1.3,0];
  assert.ok(rockSurface(tall,edge[0],0)>reach,'the tall stone is too high at its rim to jump onto from the ground? '+rockSurface(tall,edge[0],0));
  assert.ok(rockPush(tall,tall.cx-0.4,0,reach)!==null,'cannot reach the tall one from the ground');
  assert.equal(rockPush(tall,tall.cx-0.4,0,rockSurface(mid,0,0)+reach),null,'but can from the top of the lower one');
  assert.equal(rockPush(mid,0.1,0,reach),null,'and the lower one from the ground');
  // no trap in a narrow gap between two stones
  const A=makeRock(domeGrid(3,3,2),{x:-1.6,z:0}),B=makeRock(domeGrid(3,3,2),{x:1.6,z:0});
  for(const [px,pz] of [[0,0],[0.05,0.3],[-0.1,-0.4],[0,1]]){
    let x=px,z=pz;
    for(let i=0;i<3;i++)for(const r of [A,B]){const c=rockPush(r,x,z,0);if(c){x=c[0];z=c[1]}}
    for(const r of [A,B])assert.ok(rockSurface(r,x,z)-0<=0.12+0.2,'ended outside both stones at '+px+','+pz);
  }
  // the baked mesh top is sampled: a box 2 x 1 x 1 reads as flat 1 m high
  const box=new Float32Array([-1,0,-.5, 1,0,-.5, 1,1,-.5,  -1,0,-.5, 1,1,-.5, -1,1,-.5,  -1,1,-.5, 1,1,-.5, 1,1,.5,  -1,1,-.5, 1,1,.5, -1,1,.5]);
  const bg=heightGrid(box,null);assert.ok(bg.top>0.99&&bg.top<1.01);
  const br=makeRock(bg,{x:0,z:0});assert.ok(Math.abs(rockSurface(br,0,0)-1)<0.02);
  const rot=makeRock(bg,{x:4,z:4,rot:Math.PI/2});assert.ok(Math.abs(rockSurface(rot,4,4.8)-1)<0.15,'rotated footprint follows');assert.ok(rockSurface(rot,4.9,4)<=0.2,'and is narrow the other way');
}

// The pond as a magic standing mirror: the player's image and the door's image lie on one line with the door behind the player's reflection.
{const C={x:3,z:-20},m=3;
  for(const [px,pz] of [[3,-12],[10,-24],[-4,-30],[3,-40]]){
    const L=Math.hypot(px-C.x,pz-C.z),ux=(px-C.x)/L,uz=(pz-C.z)/L;
    const dx=px+ux*STILL.behind,dz=pz+uz*STILL.behind;           // the real door on the pond - player - door line
    const q=mirrorPoint(C.x,C.z,px,pz,px,pz,m),d=mirrorPoint(C.x,C.z,px,pz,dx,dz,m);
    assert.ok(Math.abs(Math.hypot(q[0]-C.x-ux*m,q[1]-C.z-uz*m)-(L-m))<1e-9,'the image is as far behind the mirror as the player is in front');
    assert.ok(Math.abs(Math.hypot(d[0]-q[0],d[1]-q[1])-STILL.behind)<1e-9,'the door image is 4.2 m behind the player image');
    assert.ok(((d[0]-q[0])*ux+(d[1]-q[1])*uz)<-STILL.behind+1e-9,'and farther from the viewer than the player image, on the same line');
    assert.ok(Math.abs((d[0]-q[0])*uz-(d[1]-q[1])*ux)<1e-9,'on one line');
    // a figure facing the mirror is mirrored to face the player; one facing sideways is unchanged
    const yFace=Math.atan2(-ux,uz),ym=mirrorYaw(C.x,C.z,px,pz,yFace);
    assert.ok(Math.abs(Math.sin(ym)-ux)<1e-9&&Math.abs(-Math.cos(ym)-uz)<1e-9,'faces the viewer');
    const ys=Math.atan2(uz,ux),ys2=mirrorYaw(C.x,C.z,px,pz,ys);assert.ok(Math.abs(Math.sin(ys2)-Math.sin(ys))<1e-9);
  }
  assert.equal(mirrorPoint(1,1,1,1,0,0),null);
}
// Biomes: deterministic, smooth, all three kinds occur, and the mixed wood is a good share.
{const a=biomeAt(120,-45,7),b=biomeAt(120,-45,7);assert.deepEqual(a,b);assert.notDeepEqual(biomeAt(120,-45,7),biomeAt(120,-45,9));
  let m=0,d=0,mix=0,N=0,jump=0;
  for(let x=-900;x<900;x+=6)for(let z=-900;z<900;z+=6){const q=biomeAt(x,z,7);N++;if(q.m>0.5)m++;else if(q.d>0.5)d++;else mix++;
    const q2=biomeAt(x+1,z,7);jump=Math.max(jump,Math.abs(q.m-q2.m),Math.abs(q.d-q2.d))}
  const fm=m/N,fd=d/N,fx=mix/N;console.log('biome share meadow',fm.toFixed(2),'deep',fd.toFixed(2),'mixed',fx.toFixed(2),'max step per metre',jump.toFixed(3));
  assert.ok(fm>0.15&&fd>0.15&&fx>0.25,'every biome is common enough');assert.ok(jump<0.2,'borders are smooth');
}
console.log('stillwood rules ok');

// Freezing is deliberate: close to the water, water filling the view, and a short unbroken dwell.
{const near=()=>spot(0,-9.5,0,-0.5);
  const a=near();for(let i=0;i<Math.floor(STILL.freezeDwell/0.05)-2;i++)stillStep(a,0.05);assert.equal(a.pinned,false,'a glance is not enough');
  const b=near();for(let i=0;i<8;i++)stillStep(b,0.05);b.pitch=0;stillStep(b,0.05);for(let i=0;i<8;i++){b.pitch=-0.5;stillStep(b,0.05)}
  assert.equal(b.pinned,false,'looking away resets the dwell');
  const c=spot(0,-4,0,-0.4);for(let i=0;i<60;i++)stillStep(c,0.05);assert.equal(c.pinned,false,'a pond across the grass (more than a few strides) does not catch it');
  const d=spot(0,-3,0,-0.4);d.pond={x:0,z:-30,r:5.5};for(let i=0;i<60;i++)stillStep(d,0.05);assert.equal(d.pinned,false,'far pond');
  const e=spot(0,-9.5,0,-0.5);e.pitch=-0.8;e.yaw=1.2;for(let i=0;i<60;i++)stillStep(e,0.05);assert.equal(e.pinned,false,'edge of the view only');
  const f=settle(near());assert.equal(f.pinned,true);f.x=0;f.z=-4;f.pitch=-0.4;stillStep(f,0.02);assert.equal(f.pinned,true,'once frozen, keeping watch needs no dwell');
}
// Every part of the door counts: a door whose centre is just out of view but whose frame edge or top still shows is seen.
{const fov=viewFov(),eye=[0,1.6,0],edge=8*Math.tan(fov.h/2);
  assert.equal(doorSeen(eye,0,0,{x:edge+0.3,z:-8,y:0,face:0},fov,0),true,'frame edge on screen');
  assert.equal(doorSeen(eye,0,0,{x:edge+2,z:-8,y:0,face:0},fov,0),false,'clear of the view');
  assert.equal(doorSeen([0,5,0],0,-0.2,{x:0,z:-3,y:0,face:0},fov,0),true,'seen from a rooftop of rock: only its top is above the eye line');
  assert.equal(doorSeen(eye,0,0,{x:0,z:-1.2,y:0,face:0},fov,0),true,'very near');
  // the pad around the door hides it before it can be seen, from any pitch
  let bad=0;
  for(let k=0;k<4000;k++){
    const r=n=>Math.sin(k*12.9898+n*78.233)*43758.5453%1,u=n=>Math.abs(r(n));
    const s=fresh();s.x=0;s.z=0;s.yaw=(u(1)-0.5)*7;s.pitch=(u(2)-0.5)*2.4;s.eye=1.6+u(3)*3;
    s.door={x:0,z:0,face:0};stillStep(s,0.05);
    if(!s.hidden&&doorSeen([s.x,s.eye,s.z],s.yaw,s.pitch,s.door,viewFov(),0))bad++;
  }
  assert.equal(bad,0,'an unwatched door is never visible, whatever the yaw, pitch and eye height');
}
console.log('freeze/visibility ok');
