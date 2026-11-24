// node tools/stillwood_shot.mjs [prefix] [seed]  -- renders the still wood to shots/stillwood/<prefix>-*.png (needs a built index.html)
// views: a start, b pond, c canopy, d start on low quality. Prefix 'before' only takes a and b.
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const prefix=process.argv[2]||'after',seed=+(process.argv[3]||7);
mkdirSync(root+'/shots/stillwood',{recursive:true});
const VIEWS={
  a:{q:'high',x:0,z:-1.5,yaw:0.0,pitch:0.02},
  b:{q:'high',x:0.2,z:-6.2,yaw:0.0,pitch:-0.1},
  c:{q:'high',x:-3,z:-3,yaw:0.9,pitch:0.4},
  d:{q:'low',x:0,z:-1.5,yaw:0.0,pitch:0.02},
  e:{q:'high',x:4,z:-1,yaw:-0.5,pitch:-0.12},          // grass and breeze at ground level
  f:{q:'high',x:0.4,z:-9.0,yaw:0.0,pitch:-0.45},         // the pond close up
  g:{q:'high',walk:{x:0,z:-176},look:{dx:0,dz:0,back:9,pitch:-0.12}}, // the second pond after a long walk
  h:{q:'low',x:0.2,z:-6.2,yaw:0.0,pitch:-0.1},
};
const want=prefix==='before'?['a','b']:(process.argv[4]?process.argv[4].split(''):Object.keys(VIEWS));
const br=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errs=[];
for(const k of want){
  const V=VIEWS[k];
  const ctx=await br.newContext({viewport:{width:1280,height:720},deviceScaleFactor:2});
  const pg=await ctx.newPage();
  pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.addInitScript(q=>{window.__norender=true;localStorage.setItem('emberdeep.quality',JSON.stringify(q))},V.q);
  await pg.goto(pathToFileURL(root+'/index.html').href);
  await pg.waitForFunction(()=>window.__game&&window.__game.previewRoom);
  await pg.evaluate(seed=>{const G=window.__game;G.startRun('SHOT',1,true);if(!G.previewRoom('stillwood',seed))throw new Error('no room')},seed);
  // let the async bakes land (cold: tens of seconds under swiftshader)
  const t0=Date.now();
  for(let i=0;i<600;i++){
    const ready=await pg.evaluate(()=>{const S=window.__game.ROOMS.state();return S.ready===undefined?true:S.ready});
    if(ready)break;
    await pg.evaluate(()=>window.__game.ROOMS.update(1/60,{mx:0,my:0,lx:0,ly:0}));
    await pg.waitForTimeout(250);
  }
  console.log(k,'ready after',((Date.now()-t0)/1000).toFixed(1)+'s');
  await pg.evaluate(V=>{
    const G=window.__game,R=G.ROOMS,S=R.state(),Z={mx:0,my:0,lx:0,ly:0};
    let x=V.x,z=V.z,yaw=V.yaw||0,pitch=V.pitch;
    if(V.walk){
      S.WK.b.x=V.walk.x;S.WK.b.z=V.walk.z;S.yaw=0;
      for(let i=0;i<10;i++)R.update(1/60,Z);
      const p=S.ponds().pop();
      // stand back from the new pond on the line from the walker toward it, looking at it
      const dx=p.x-V.walk.x,dz=p.z-V.walk.z,L=Math.hypot(dx,dz);
      x=p.x-dx/L*(p.r+V.look.back);z=p.z-dz/L*(p.r+V.look.back);yaw=Math.atan2(dx,-dz);pitch=V.look.pitch;
    }
    S.apply({x,z,y:0,yaw,pitch,dx:0,dz:z+4.2,face:yaw,pin:0});
    for(let i=0;i<30;i++)R.update(1/60,Z);
    S.apply({x,z,y:0,yaw,pitch,dx:0,dz:z+4.2,face:yaw,pin:0});
    for(let i=0;i<200;i++)R.update(1/60,Z);   // mist, ripples and wind settle
    S.yaw=yaw;S.pitch=pitch;R.update(0.0001,Z);
    R.render();
  },V);
  await pg.waitForTimeout(300);
  await pg.screenshot({path:`${root}/shots/stillwood/${prefix}-${k}.png`});
  const info=await pg.evaluate(()=>{const S=window.__game.ROOMS.state();return S.stats?S.stats():{}});delete info.bake;
  console.log(k,JSON.stringify(info),'rs',await pg.evaluate(()=>window.__game.rs));
  await ctx.close();
}
await br.close();
if(errs.length){console.log('ERRORS',errs.slice(0,5));process.exitCode=1}
