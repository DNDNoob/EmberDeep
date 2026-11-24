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
};
const want=prefix==='before'?['a','b']:Object.keys(VIEWS);
const br=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errs=[];
for(const k of want){
  const V=VIEWS[k];
  const ctx=await br.newContext({viewport:{width:1600,height:900},deviceScaleFactor:2});
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
    const G=window.__game,R=G.ROOMS,S=R.state();
    S.apply({x:V.x,z:V.z,y:0,yaw:V.yaw,pitch:V.pitch,dx:0,dz:V.z+4.2,face:V.yaw,pin:0});
    const Z={mx:0,my:0,lx:0,ly:0};
    for(let i=0;i<30;i++)R.update(1/60,Z);
    S.apply({x:V.x,z:V.z,y:0,yaw:V.yaw,pitch:V.pitch,dx:0,dz:V.z+4.2,face:V.yaw,pin:0});
    R.update(1/60,Z);
    S.yaw=V.yaw;S.pitch=V.pitch;R.update(0.0001,Z);
    R.render();
  },V);
  await pg.waitForTimeout(300);
  await pg.screenshot({path:`${root}/shots/stillwood/${prefix}-${k}.png`});
  const info=await pg.evaluate(()=>{const S=window.__game.ROOMS.state();return S.stats?S.stats():{}});delete info.bake;
  console.log(k,JSON.stringify(info));
  await ctx.close();
}
await br.close();
if(errs.length){console.log('ERRORS',errs.slice(0,5));process.exitCode=1}
