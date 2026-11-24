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
  const all=S.rockList();o.n=all.length;o.stand=all.filter(r=>r.stand).length;
  const trees=S.treeList();
  const clearLine=(r,a,d0)=>{for(let d=d0;d>0;d-=0.4){const x=r.cx+Math.cos(a)*d,z=r.cz+Math.sin(a)*d;if(trees.some(t=>Math.hypot(t.x-x,t.z-z)<1.3))return false;if(all.some(q=>q!==r&&Math.hypot(q.cx-x,q.cz-z)<q.rb+q.rb*0.2+1))return false}return true};
  // run at a stone from an open side, jumping when close; did we end up standing on it, and could we walk off?
  const run=(r,a)=>{
    const d0=r.rb+3;b.x=r.cx+Math.cos(a)*d0;b.z=r.cz+Math.sin(a)*d0;b.y=S.H(b.x,b.z);b.vy=0;b.vx=b.vz=0;
    S.yaw=Math.atan2(-Math.cos(a),Math.sin(a));S.pitch=0;S.pinned=false;
    let minD=1e9,onTop=false,left=false,jumped=0,maxLift=0;
    for(let i=0;i<420;i++){
      const d=Math.hypot(b.x-r.cx,b.z-r.cz);
      const air=b.y>S.G(b.x,b.z)+0.05;
      step(air&&d<r.rb*0.5?1:-1,d<r.rb*0.6+1.4&&jumped<3?(jumped++,true):false);   // jump near, then brake in the air so a small stone is not overflown
      const dd=Math.hypot(b.x-r.cx,b.z-r.cz);minD=Math.min(minD,dd);
      if(Math.abs(b.y-S.G(b.x,b.z))<1e-6&&b.y-S.H(b.x,b.z)>r.top*0.4&&dd<r.rb)onTop=true;
      if(onTop&&dd>r.rb+0.3&&Math.abs(b.y-S.H(b.x,b.z))<0.02)left=true;
      maxLift=Math.max(maxLift,b.y-S.H(b.x,b.z));
    }
    return {minD,onTop,left,maxLift};
  };
  // every stone low enough for a jump from the ground (with a clear run-up) must be landable
  const lows=all.filter(r=>r.top>0.45&&r.top<=1.25);
  o.lows=lows.length;o.lowTried=0;o.lowOk=0;o.lowFail=[];
  for(const rk of lows.slice(0,14)){
    let tried=false,ok=false;
    for(let k=0;k<12&&!ok;k++){const a=k/12*6.283;if(!clearLine(rk,a,rk.rb+3))continue;tried=true;const q=run(rk,a);if(q.onTop)ok=true}
    if(tried){o.lowTried++;if(ok)o.lowOk++;else o.lowFail.push({top:+rk.top.toFixed(2),rb:+rk.rb.toFixed(2)})}
  }
  o.climbed=o.lowOk>0;o.pops=S.pops||0;
  // a tall one stays out of reach from the ground
  const sol=all.filter(r=>r.top>2).slice(0,1)[0];
  o.solidTop=sol?+sol.top.toFixed(2):null;
  if(sol){let best=null;for(let k=0;k<16&&!best;k++){const a=k/16*6.283;if(clearLine(sol,a,sol.rb+3)){best=run(sol,a)}}o.solidRun=best}
  return o;
});
console.log(JSON.stringify(r));
assert.ok(r.ready,'baked');assert.ok(r.stand>=3,'there are low stones: '+r.stand);
assert.ok(r.lowTried>=3,'enough low stones with a clear run-up: '+r.lowTried);
assert.ok(r.lowOk>=r.lowTried*0.85,'low stones can be landed on from the ground: '+r.lowOk+'/'+r.lowTried+' '+JSON.stringify(r.lowFail));
assert.ok(!r.pops,'never needed the stuck-in-a-stone fallback: '+r.pops);
assert.deepEqual(errs,[]);
console.log('stillwood rock test ok');await br.close();
