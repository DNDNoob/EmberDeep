// node tools/stillwood_room_test.mjs -- the still wood in a built index.html: second pond after a 1000 ft walk, scrying at the new pond, snap/apply of ponds
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const br=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await br.newPage({viewport:{width:640,height:360}}),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);
await pg.waitForFunction(()=>window.__game&&window.__game.previewRoom);
await pg.evaluate(()=>{const G=window.__game;G.startRun('PONDS',1,true);if(!G.previewRoom('stillwood',7))throw new Error('no room')});
const r=await pg.evaluate(()=>{
  const G=window.__game,R=G.ROOMS,S=R.state(),Z={mx:0,my:0,lx:0,ly:0},o={};
  o.p0=S.ponds().length;
  S.WK.b.x=0;S.WK.b.z=-16-250;for(let i=0;i<5;i++)R.update(1/60,Z);o.afterNear=S.ponds().length;
  S.WK.b.z=-16-316;S.yaw=0;R.update(1/60,Z);const ps=S.ponds();o.afterFar=ps.length;
  const p=ps[ps.length-1];o.pond=p;o.dist=Math.hypot(p.x-S.WK.b.x,p.z-S.WK.b.z);
  // circle the new pond looking down at the water until the real door enters the view edge
  const H=S.H,R0=p.r+2.5;let th=Math.PI/2,seenWater=false,directAt=null,steps=0;
  S.pitch=-0.4;S.pinned=false;
  
  const face=()=>{const dx=p.x-S.WK.b.x,dz=p.z-S.WK.b.z;S.yaw=Math.atan2(dx,-dz);S.pitch=-Math.atan2(S.WK.b.y+1.6-p.wy,Math.hypot(dx,dz)-1)};
  const Rf=p.r+1.2;th=Math.PI/2;
  // too far from the water to freeze it, however long you look
  S.WK.b.x=p.x+(p.r+9)*Math.cos(th);S.WK.b.z=p.z+(p.r+9)*Math.sin(th);S.WK.b.y=H(S.WK.b.x,S.WK.b.z);face();for(let i=0;i<90;i++)R.update(1/60,Z);o.farFrozen=S.pinned;
  // at the bank a glance does nothing; a steady look does
  S.WK.b.x=p.x+Rf*Math.cos(th);S.WK.b.z=p.z+Rf*Math.sin(th);S.WK.b.y=H(S.WK.b.x,S.WK.b.z);face();for(let i=0;i<10;i++)R.update(1/60,Z);o.glance=S.pinned;
  for(let i=0;i<40;i++)R.update(1/60,Z);
  th=Math.PI/2;S.WK.b.x=p.x+R0*Math.cos(th);S.WK.b.z=p.z+R0*Math.sin(th);S.WK.b.y=H(S.WK.b.x,S.WK.b.z);face();for(let i=0;i<10;i++)R.update(1/60,Z);
  o.water=S.water;o.pinnedWater=S.pinned;o.glanceUp=(()=>{S.pitch=0.3;S.__keep=1;for(let i=0;i<20;i++)R.update(1/60,Z);const v=S.pinned;S.pitch=-0.4;for(let i=0;i<10;i++)R.update(1/60,Z);return v})();
  for(;steps<900&&!S.direct;steps++){th-=0.01;S.WK.b.x=p.x+R0*Math.cos(th);S.WK.b.z=p.z+R0*Math.sin(th);S.WK.b.y=H(S.WK.b.x,S.WK.b.z);face();R.update(1/60,Z);if(S.water)seenWater=true;(o.tr=o.tr||[]).push(steps%60==0?[steps,S.water,S.pinned,+S.fill.toFixed(2),Math.round(S.doorX),Math.round(S.doorZ),Math.round(S.WK.b.x),Math.round(S.WK.b.z)]:0)}
  o.seenWater=seenWater;o.direct=S.direct;o.pinnedAtDirect=S.pinned;o.steps=steps;
  // turn and walk through the door
  const dx=S.doorX-S.WK.b.x,dz=S.doorZ-S.WK.b.z,d=Math.hypot(dx,dz);
  S.yaw=Math.atan2(dx,-dz);o.doorDist=d;
  for(let i=0;i<Math.ceil(d/0.05)+60;i++){S.WK.b.x+=dx/d*0.05;S.WK.b.z+=dz/d*0.05;S.WK.b.y=H(S.WK.b.x,S.WK.b.z);R.update(1/60,Z)}
  o.after=G.state?G.state:null;
  o.pinned=true;
  const q=S.snap();o.snapPonds=q.po.length;
  // a guest applying the snapshot sees the same ponds
  o.same=JSON.stringify(q.po)===JSON.stringify(S.ponds().map(p=>[p.x,p.z,p.r,p.fx,p.fz,p.i]));
  // a fourth pond retires the oldest (max 3)
  for(let k=0;k<3;k++){const l=S.ponds().pop();S.WK.b.x=l.x;S.WK.b.z=l.z-320;S.yaw=0;R.update(1/60,Z)}
  o.max=S.ponds().length;o.stats=S.stats();delete o.stats.bake;
  return o;
});
console.log(JSON.stringify(r));
assert.equal(r.p0,1);assert.equal(r.afterNear,1,'no pond before 1000 ft');assert.equal(r.afterFar,2,'a pond after 1000 ft');
assert.ok(r.dist>=24.9&&r.dist<=35.1);assert.equal(r.farFrozen,false,'a distant pond does not freeze it');assert.equal(r.glance,false,'a glance does not freeze it');assert.ok(r.seenWater&&r.pinnedWater,'looking down at the water holds the door');assert.equal(r.glanceUp,false,'looking away releases the door');assert.equal(r.direct,true,'circling brings the real door into view');assert.ok(r.steps>20,'not instant');
assert.equal(r.snapPonds,2);assert.ok(r.same);assert.equal(r.max,3);
assert.deepEqual(errs,[]);
console.log('stillwood room ok');await br.close();
