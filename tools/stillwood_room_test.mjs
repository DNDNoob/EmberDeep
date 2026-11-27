// Run after npm run build. Set STILLWOOD_SHOTS to a directory to capture the pool sequence.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';

const shots=process.env.STILLWOOD_SHOTS;
if(shots)mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'],
});

try{
  const page=await browser.newPage({viewport:{width:shots?1280:640,height:shots?720:360}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  await page.addInitScript(quality=>{
    window.__norender=true;
    localStorage.setItem('emberdeep.quality',JSON.stringify(quality));
  },process.env.STILLWOOD_QUALITY??'medium');
  await page.goto(new URL('../index.html',import.meta.url).href);
  await page.waitForFunction(()=>window.__game?.previewRoom);
  await page.evaluate(()=>{
    const G=window.__game;
    G.startRun('PONDS',1,true);
    if(!G.previewRoom('stillwood',7))throw new Error('no room');
    const R=G.ROOMS,S=R.state(),b=S.WK.b;
    const tick=(n=1,input={})=>{
      for(let i=0;i<n&&R.active;i++)R.update(1/60,{mx:0,my:0,lx:0,ly:0,...input});
    };
    const place=(x,z,yaw,pitch)=>{
      Object.assign(b,{x,z,y:S.G(x,z),vx:0,vy:0,vz:0});
      Object.assign(S,{yaw,pitch});
    };
    const facePool=p=>place(p.x,p.z+p.r+1.2,0,-0.5);
    window.poolTest={R,S,b,tick,place,facePool};
    tick(280);
  });
  await page.waitForFunction(()=>window.poolTest.S.ready,{},{timeout:120000});
  const capture=async name=>{
    if(!shots)return;
    await page.evaluate(()=>window.poolTest.R.render());
    await page.screenshot({path:join(shots,name+'.png')});
  };

  const start=await page.evaluate(()=>{
    const {S,tick,b}=window.poolTest;
    const spawn={ponds:S.ponds().length,distance:S.distance,door:S.doorShown(),snapshot:S.snap()};
    tick(20,{my:-1});
    const outward=S.distance;
    tick(20,{my:1});
    spawn.walkedBack=S.distance>outward&&Math.hypot(b.x,b.z)<outward;
    tick(5);
    S.distance=304.7;
    tick(30);
    spawn.beforeThreshold=S.ponds().length;
    return spawn;
  });
  assert.equal(start.ponds,0);
  assert.equal(start.distance,0);
  assert.equal(start.door,false);
  assert.equal(start.walkedBack,true,'backtracking adds to the distance walked');
  assert.equal(start.beforeThreshold,0,'standing still cannot cross the distance threshold');
  await capture('forest-before-1000-feet');

  const glimpse=await page.evaluate(()=>{
    const {S,tick,facePool,R}=window.poolTest;
    tick(5,{my:-1});
    const [first]=S.ponds();
    facePool(first);
    tick(10);
    R.render();
    return {distance:S.distance,count:S.ponds().length,reflected:S.ghosts().door[0],door:S.doorShown(),spent:S.spentPond};
  });
  assert.ok(glimpse.distance>=304.8&&glimpse.distance<305.1);
  assert.equal(glimpse.count,1);
  assert.equal(glimpse.reflected,true);
  assert.equal(glimpse.door,false);
  assert.equal(glimpse.spent,null);
  await capture('first-pool-glimpse');

  const gone=await page.evaluate(()=>{
    const {S,tick,R,facePool}=window.poolTest;
    S.yaw=Math.PI;
    tick(32);
    facePool(S.ponds()[0]);
    tick();
    R.render();
    return {spent:S.spentPond,pinned:S.pinned,unlocked:S.unlocked,door:S.doorShown(),reflected:S.ghosts().door[0],snapshot:S.snap()};
  });
  assert.equal(gone.spent,0);
  assert.equal(gone.pinned,false);
  assert.equal(gone.unlocked,false);
  assert.equal(gone.door,false);
  assert.equal(gone.reflected,false);
  await capture('first-pool-door-gone');

  const second=await page.evaluate(()=>{
    const {S,tick,place,facePool,R}=window.poolTest;
    const [first]=S.ponds();
    place(first.x,first.z+first.r+1.2,Math.PI,0);
    tick(20);
    facePool(first);
    tick(60);
    const revisited=S.pinned||S.unlocked;
    place(first.x,first.z-300,0,0);
    tick();
    const near=S.ponds().length;
    place(first.x,first.z-306,0,0);
    tick();
    const ponds=S.ponds(),next=ponds.at(-1);
    facePool(next);
    tick(10);
    const glance=S.pinned;
    tick(30);
    R.render();
    return {revisited,near,count:ponds.length,glance,spent:S.spentPond,pinned:S.pinned,unlocked:S.unlocked,door:S.doorShown(),reflected:S.ghosts().door[0],snapshot:S.snap()};
  });
  assert.equal(second.revisited,false,'the spent pool cannot unlock the exit');
  assert.equal(second.near,1);
  assert.equal(second.count,2);
  assert.equal(second.glance,false);
  assert.equal(second.spent,0);
  assert.equal(second.pinned,true);
  assert.equal(second.unlocked,true);
  assert.equal(second.door,true);
  assert.equal(second.reflected,true);

  await page.evaluate(()=>{
    const {S,b,tick}=window.poolTest;
    S.yaw=Math.atan2(S.doorX-b.x,b.z-S.doorZ);
    S.pitch=0;
    tick();
  });
  await capture('second-pool-door-unlocked');
  assert.equal(await page.evaluate(()=>{
    const {R,tick}=window.poolTest;
    tick(100,{my:-1});
    return R.active;
  }),false,'the unlocked door can be walked through');

  const watch=await page.evaluate(({start,gone,second})=>{
    const {R,tick}=window.poolTest;
    R.watch('stillwood',start.snapshot);
    const s=R.state();
    const initial=s.ponds().length===0&&!s.doorShown();
    R.sync(gone.snapshot);tick();
    const spent=s.ponds().length===1&&s.spentPond===0&&!s.doorShown();
    R.sync(second.snapshot);tick();
    const unlocked=s.ponds().length===2&&s.pinned&&s.doorShown();
    R.sync(start.snapshot);tick();
    const reset=s.ponds().length===0&&!s.doorShown();
    return {initial,spent,unlocked,reset};
  },{start,gone,second});
  assert.deepEqual(watch,{initial:true,spent:true,unlocked:true,reset:true});
  assert.deepEqual(errors,[]);
  console.log('stillwood room ok');
}finally{
  await browser.close();
}
