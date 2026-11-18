// node tools/movement_test.mjs  -- the shared movement system (src/movement.js): maze numbers, rooms match the maze in eye-heights, look-only / none rooms (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch(),pg=await b.newPage({viewport:{width:1280,height:720}}),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)},ok=(c,m)=>{if(!c)bad(m);else console.log('ok  ',m)};
const near=(a,b,tol)=>Math.abs(a-b)<=Math.abs(b)*tol;
const EYE_MAZE=0.62;
// ---- (a) the maze: an open floor, then walk, sprint and jump for fixed time steps ----
const maze=await pg.evaluate(()=>{
  const G=window.__game,P=G.P,F=()=>G.F,o={};G.startRun('mv1',1,true);
  const f=G.F;f.g.fill(0);for(const k of ['pillars','discs','npcs','traps','shades','items'])f[k]=[];f.safe=null;f.safeMask.fill(0);f.door=null;
  const reset=()=>{for(const k in G.keys)G.keys[k]=false;P.x=3.5;P.z=Math.floor(f.H/2)+0.5;P.yaw=0;P.pitch=0;P.y=0;P.vy=0;P.vx=P.vz=0;P.stam=100;P.winded=false;P.chill=0;P.inv=99;P.jumpQ=0;P.hp=3;P.fuel=100};
  const run=(n,cb)=>{for(let i=0;i<n;i++){if(cb)cb(i);G.update(1/60)}};
  reset();G.keys.KeyW=true;run(60);o.walk=P.x-3.5;
  reset();G.keys.KeyW=true;G.keys.ShiftLeft=true;run(60);o.sprint=P.x-3.5;o.stamAfter=P.stam;
  reset();let hi=0,air=0;G.keys.Space=true;run(80,i=>{if(i>0)G.keys.Space=false});
  reset();hi=0;air=0;G.keys.Space=true;for(let i=0;i<80;i++){G.update(1/60);G.keys.Space=false;hi=Math.max(hi,P.y);if(P.y>0)air++}o.apex=hi;o.air=air;
  reset();G.keys.Space=true;G.keys.KeyW=true;G.keys.ShiftLeft=true;G.update(1/60);G.keys.Space=false;o.airSpeed=P.airSpeed;
  reset();G.keys.KeyW=true;P.chill=5;run(60);o.chill=P.x-3.5;
  return o});
console.log('maze',JSON.stringify(maze));
ok(near(maze.walk,2.7,0.02),'maze walk 2.7/s '+maze.walk);ok(near(maze.sprint,4.3,0.02),'maze sprint 4.3/s '+maze.sprint);ok(maze.stamAfter<75&&maze.stamAfter>65,'maze sprint drains stamina '+maze.stamAfter);
ok(near(maze.apex,3.5*3.5/22,0.06),'maze jump apex '+maze.apex);ok(maze.air>=36&&maze.air<=40,'maze air time frames '+maze.air);ok(near(maze.airSpeed,4.3*1.18,0.01),'maze sprint-jump air speed '+maze.airSpeed);ok(near(maze.chill,2.7*0.55,0.03),'maze chill slows '+maze.chill);
// ---- (b) rooms, in eye-heights per second ----
const mazeWalkEH=maze.walk/EYE_MAZE,mazeSprintEH=maze.sprint/EYE_MAZE,mazeApexEH=maze.apex/EYE_MAZE;
async function room(kind,place){
  return pg.evaluate(([kind,place])=>{
    const G=window.__game,R=G.ROOMS,P=G.P,o={},Z={mx:0,my:0,press:0,lx:0,ly:0};
    if(G.state==='room')G.roomLeave();if(G.state!=='play')G.startRun('mv'+kind,2,true);
    const D=G.F.sdoors[0];D.kind=kind;D.look=kind;D.used=false;G.sdoorOpen(D);R.start(kind,G.roomEnd,7);
    const S=R.state(),U=(n,i)=>{for(let k=0;k<n;k++)R.update(1/60,Object.assign({},Z,i||{}))};
    for(const t of ['kiln','mirror'])if(R.kind!==kind)throw new Error('room '+R.kind);
    // let the opening fade and settle, put the player on open floor
    const at=()=>{P.stam=100;P.winded=false;P.chill=0;S.px=place.x;S.pz=place.z;S.yaw=place.yaw;S.pitch=0};
    at();U(2);
    at();U(place.n,{my:-1});o.walk=Math.hypot(S.px-place.x,S.pz-place.z)/(place.n/60);
    at();U(place.n,{my:-1,sprint:1});o.sprint=Math.hypot(S.px-place.x,S.pz-place.z)/(place.n/60);o.stam=P.stam;
    at();U(30);let hi=0,air=0;U(1,{jump:1});for(let i=0;i<90;i++){U(1);hi=Math.max(hi,S.jy);if(S.jy>0.001)air++}o.apex=hi;o.air=air;
    // jumping straight into the wall or ceiling never leaves the room
    o.state=G.state;o.eye=place.eye;return o},[kind,place]);
}
const rk=await room('kiln',{x:-5,z:5,yaw:Math.PI/2,n:30,eye:1.6});console.log('kiln',JSON.stringify(rk));
const rm=await room('mirror',{x:0,z:2.6,yaw:0,n:20,eye:1.6});console.log('mirror',JSON.stringify(rm));
for(const [n,r] of [['kiln',rk],['mirror',rm]]){
  ok(near(r.walk/r.eye,mazeWalkEH,0.04),n+' walk in eye-heights '+(r.walk/r.eye).toFixed(3)+' vs maze '+mazeWalkEH.toFixed(3));
  ok(near(r.sprint/r.eye,mazeSprintEH,0.04),n+' sprint in eye-heights '+(r.sprint/r.eye).toFixed(3)+' vs maze '+mazeSprintEH.toFixed(3));
  ok(near(r.apex/r.eye,mazeApexEH,0.06),n+' jump apex in eye-heights '+(r.apex/r.eye).toFixed(3)+' vs maze '+mazeApexEH.toFixed(3));
  ok(Math.abs(r.air-maze.air)<=2,n+' air time frames '+r.air+' vs maze '+maze.air);
  ok(r.stam<95,n+' sprint spends the shared stamina '+r.stam);ok(r.state==='room',n+' still in the room');
}
// ---- (c) the exceptions: galaxy looks only, fall does nothing ----
const ex=await pg.evaluate(()=>{
  const G=window.__game,R=G.ROOMS,Z={mx:0,my:0,press:0,lx:0,ly:0},o={};
  if(G.state==='room')G.roomLeave();
  // the same room twice, once with walking input and once with none: where the camera ends up must be identical
  const cam=(kind,inp,n)=>{R.start(kind,()=>{},3);const S=R.state();for(let i=0;i<n;i++)R.update(1/60,Object.assign({},Z,inp));const p=[R.cam.position.x,R.cam.position.y,R.cam.position.z,S.yaw];R.abort();return p};
  for(const kind of ['galaxy','fall']){
    const a=cam(kind,{},60),m=cam(kind,{mx:1,my:-1,jump:1,sprint:1},60),t=cam(kind,{lx:1},60);o[kind+'Mode']=R.mode(kind);
    o[kind+'Moved']=Math.hypot(a[0]-m[0],a[1]-m[1],a[2]-m[2]);o[kind+'Turn']=t[3]-a[3];
  }
  o.kilnMode=R.mode('kiln');o.mirrorMode=R.mode('mirror');o.newMode=R.mode('some-future-room');return o});
console.log('exceptions',JSON.stringify(ex));
ok(ex.galaxyMode==='look'&&ex.fallMode==='none'&&ex.kilnMode==='walk'&&ex.mirrorMode==='walk'&&ex.newMode==='walk','modes: galaxy look, fall none, everything else walks');
ok(ex.galaxyMoved<1e-6,'galaxy does not move '+ex.galaxyMoved);ok(Math.abs(ex.galaxyTurn)>0.5,'galaxy still turns '+ex.galaxyTurn);
ok(ex.fallMoved<0.05,'fall takes no control '+ex.fallMoved);
ok(!errs.length,'no page errors '+errs.slice(0,3).join(' | '));
console.log(fails?'FAILED':'ALL PASSED');await b.close();process.exit(fails?1:0);
