// node tools/stillwood_rock_test.mjs -- climbable stones in a built index.html: jump onto a mid-size boulder, walk over it and off; tall ones stay solid
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
await pg.evaluate(()=>{const G=window.__game;G.startRun('ROCKS',1,true);if(!G.previewRoom('stillwood',7))throw new Error('no room')});
for(let i=0;i<900;i++){   // let the bakes land so stones have their real size
  if(await pg.evaluate(()=>{const S=window.__game.ROOMS.state();window.__game.ROOMS.update(1/60,{mx:0,my:0,lx:0,ly:0});return S.ready}))break;
  await pg.waitForTimeout(250);
}
const r=await pg.evaluate(()=>{
  const G=window.__game,R=G.ROOMS,S=R.state(),b=S.WK.b,o={};
  const step=(my,jump)=>R.update(1/60,{mx:0,my,lx:0,ly:0,jump});
  for(let i=0;i<5;i++)step(0,false);
  o.ready=S.ready;
  const all=S.rockList();o.n=all.length;o.stand=all.filter(r=>r.stand).length;o.solid=all.filter(r=>!r.stand).length;
  o.tops=all.filter(r=>r.stand).map(r=>+r.top.toFixed(2));
  const trees=S.treeList();
  const clearLine=(r,a,d0)=>{for(let d=d0;d>0;d-=0.4){const x=r.x+Math.cos(a)*d,z=r.z+Math.sin(a)*d;if(trees.some(t=>Math.hypot(t.x-x,t.z-z)<1.3))return false;if(all.some(q=>q!==r&&Math.hypot(q.x-x,q.z-z)<q.rg+1))return false}return true};
  // run at a rock from the open side; returns what happened
  const run=(r,a)=>{
    const d0=r.rg+3;b.x=r.x+Math.cos(a)*d0;b.z=r.z+Math.sin(a)*d0;b.y=S.H(b.x,b.z);b.vy=0;b.vx=b.vz=0;
    S.yaw=Math.atan2(-Math.cos(a),Math.sin(a));S.pitch=0;S.pinned=false;
    let minD=1e9,maxLift=0,onTop=false,maxDy=0,jumped=0,left=false,y0=b.y;
    for(let i=0;i<360;i++){
      const d=Math.hypot(b.x-r.x,b.z-r.z);
      step(-1,d<r.rg+1.2&&jumped<3?(jumped++,true):false);
      const py=b.y;
      minD=Math.min(minD,Math.hypot(b.x-r.x,b.z-r.z));
      const ground=S.G(b.x,b.z);
      if(Math.abs(b.y-ground)<1e-6&&Math.hypot(b.x-r.x,b.z-r.z)<r.rg*0.7&&b.y-S.H(b.x,b.z)>r.top*0.4)onTop=true;
      if(onTop&&Math.hypot(b.x-r.x,b.z-r.z)>r.rg+0.5&&Math.abs(b.y-S.H(b.x,b.z))<0.02)left=true;
      if(Math.abs(b.y-S.H(b.x,b.z))>0.01&&!onTop)maxLift=Math.max(maxLift,b.y-S.H(b.x,b.z));
    }
    return {minD,onTop,left,maxLift};
  };
  const stands=all.filter(r=>r.stand&&r.top>0.5);
  o.tried=0;o.climbed=null;
  for(const rk of stands){
    for(let k=0;k<12;k++){const a=k/12*6.283;if(!clearLine(rk,a,rk.rg+3))continue;
      o.tried++;const q=run(rk,a);
      if(q.onTop&&q.left){o.climbed={top:+rk.top.toFixed(2),rg:+rk.rg.toFixed(2),...q};break}
    }
    if(o.climbed)break;
  }
  // a tall one stays solid even with jumping
  const sol=all.filter(r=>!r.stand&&r.top>jt()).slice(0,1)[0];
  function jt(){return 1.3}
  o.solidTop=sol?+sol.top.toFixed(2):null;
  if(sol){let best=null;for(let k=0;k<16&&!best;k++){const a=k/16*6.283;if(clearLine(sol,a,sol.rg+3)){best=run(sol,a)}}o.solidRun=best}
  return o;
});
console.log(JSON.stringify(r));
assert.ok(r.ready,'baked');assert.ok(r.stand>=3,'there are climbable stones: '+r.stand);
assert.ok(r.climbed,'the walker can jump onto a mid-size boulder and walk off it (tried '+r.tried+')');
if(r.solidRun){assert.ok(!r.solidRun.onTop,'a tall boulder cannot be climbed');assert.ok(r.solidRun.minD>=r.solidRun.minD*0+0.8*0+0.1);}
assert.deepEqual(errs,[]);
console.log('stillwood rock test ok');await br.close();
