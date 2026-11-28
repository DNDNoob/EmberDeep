// node tools/maze_gpu_bench.mjs
// Rough cost of each part of a maze frame at High quality: draws the same view repeatedly with one feature switched off at a time
// (ambient occlusion, bloom, FXAA, the torch's shadow, all shadow updates, everything but the scene pass) and prints the median ms.
// Headless Chromium draws on the CPU, so the numbers are only good for comparing the parts with each other, not for real frame rates.
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();const pg = await (await b.newContext({viewport:{width:640,height:360}})).newPage();
pg.on('pageerror',e=>console.log('ERR',String(e)));
await pg.addInitScript(() => { localStorage.setItem('emberdeep.quality', JSON.stringify('high'))});
await pg.goto(new URL('../index.html',import.meta.url).href);
await pg.waitForFunction(() => window.__game && window.__game.startRun, null, {timeout: 120000});
await pg.evaluate(()=>{window.__norender=true;window.__game.startRun('PERF1',15,true)});
await pg.waitForFunction(()=>window.__game.state==='play',null,{timeout:120000});
await pg.waitForTimeout(2000);
const r=await pg.evaluate(()=>{const g=window.__game,K=g.perf,r=g.renderer,gl=r.getContext();
  g.perf.rs=1;g.render(0);
  const bench=(label,n=6)=>{for(let i=0;i<2;i++){g.render(i*0.016)};gl.finish();const t=performance.now();for(let i=0;i<n;i++){g.render(i*0.016);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4))}return [label,((performance.now()-t)/n).toFixed(1)]};
  const cfg={
   full:()=>{},
   noGTAO:()=>{K.gtao.enabled=false},
   noBloom:()=>{K.bloom.enabled=false},
   noFXAA:()=>{K.fxaa.enabled=false},
   torch512:()=>{K.torchLight.shadow.mapSize.set(512,512);K.torchLight.shadow.map?.dispose();K.torchLight.shadow.map=null},
   noShadowUpd:()=>{r.shadowMap.autoUpdate=false},
   sceneOnly:()=>{K.composer.passes.forEach((p,i)=>p.enabled=i===0)},
   gtao6:()=>{K.gtao.updateGtaoMaterial({samples:6})},
 };
 const reset=()=>{K.gtao.enabled=K.bloom.enabled=K.fxaa.enabled=true;K.composer.passes.forEach(p=>p.enabled=true);r.shadowMap.autoUpdate=true;
   if(K.torchLight.shadow.mapSize.x!==1024){K.torchLight.shadow.mapSize.set(1024,1024);K.torchLight.shadow.map?.dispose();K.torchLight.shadow.map=null}K.gtao.updateGtaoMaterial({samples:12})};
 const res={};for(const k in cfg)res[k]=[];
 for(let rep=0;rep<3;rep++)for(const k in cfg){reset();cfg[k]();res[k].push(+bench(k,5)[1])}
 reset();
 const out=Object.entries(res).map(([k,v])=>{v.sort((a,b)=>a-b);return [k,v[1]]});
 return out});
console.log(r.map(x=>x.join(': ')).join('\n'));
await b.close();
