// node tools/lift_compile_test.mjs [--depths 3,9] [--w 320] [--h 180] [--timeout 600] [--root dir-with-index.html]
// A lift ride must not link any new WebGL program: the lobby warms the whole in-game pipeline (world surfaces, characters, post chain,
// shadows) while it idles. Per depth, in a fresh page: wait for the lobby's landing cache and pipeline warm-up to finish, snapshot
// renderer.info.programs, ride to the depth, walk into the maze, wait 3 s, and fail if any program key or linkProgram call appeared.
// Headless Chromium uses a software GPU, but program counts are deterministic, which is what this checks.
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {serve} from './serve.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:(process.argv[i+1]&&!process.argv[i+1].startsWith('--')?process.argv[i+1]:true)};
const DEPTHS=String(arg('depths','3,9')).split(',').map(Number),LIMIT=+arg('timeout',600)*1000;

const INIT=()=>{
  const C=window.__lc={links:0,phase:'boot',byPhase:{}};
  const P=window.WebGL2RenderingContext.prototype,f=P.linkProgram;
  P.linkProgram=function(...a){C.links++;C.byPhase[C.phase]=(C.byPhase[C.phase]||0)+1;return f.apply(this,a)};
};
const keys=()=>window.__game.renderer.info.programs.map(p=>(p.name||'?')+'|'+p.cacheKey);

async function scenario(br,srv,depth){
  const ctx=await br.newContext(),pg=await ctx.newPage(),errs=[];
  await pg.setViewportSize({width:+arg('w',320),height:+arg('h',180)});
  pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.addInitScript(INIT);
  await pg.goto(srv.url+'index.html');
  await pg.waitForFunction(()=>window.__game?.hub?.lobbyReady,null,{timeout:180000});
  await pg.evaluate(()=>window.__game.hub.place(0,10));
  // the depth the rider will pick: the lobby caches floors 1 to 5 plus this one
  await pg.evaluate(d=>{const f=document.getElementById('liftDepth');f.value=d;f.dispatchEvent(new Event('input'))},depth);
  const t0=Date.now();let ready=false,st=null;
  while(Date.now()-t0<LIMIT){
    st=await pg.evaluate(d=>{const G=window.__game,c=G.liftCache();return {cache:c.length,all:c.length>0&&c.every(e=>e.ready&&e.compiled),sel:c.some(e=>e.depth===d),warm:G.pipelineWarm?G.pipelineWarm():{done:true,baseline:true}}},depth);
    if(st.all&&st.sel&&st.warm.done){ready=true;break}
    await pg.waitForTimeout(500);
  }
  console.log(`depth ${depth}: lobby ready=${ready} after ${((Date.now()-t0)/1000).toFixed(1)} s`,JSON.stringify(st));
  if(!ready){await ctx.close();return {fail:'lobby never finished warming'}}
  await pg.waitForTimeout(1500);
  const pre=await pg.evaluate(keys),preLinks=await pg.evaluate(()=>window.__lc.links);
  // ride
  await pg.evaluate(()=>{window.__lc.phase='ride'});
  const departed=await pg.evaluate(d=>{const G=window.__game;G.hub.place(0,-8.6,0,0);
    return new Promise(res=>setTimeout(()=>{G.openStation('lift');document.getElementById('liftDepth').value=d;
      document.getElementById('liftDestination').dispatchEvent(new Event('submit',{cancelable:true}));res(G.hub.riding)},200))},depth);
  if(!departed){await ctx.close();return {fail:'could not depart'}}
  const t1=Date.now();let arrivedAt=0;
  while(Date.now()-t1<400000){
    if(!arrivedAt&&await pg.evaluate(()=>window.__game.state==='play')){
      arrivedAt=Date.now();
      await pg.evaluate(()=>{
        const G=window.__game;window.__lc.phase='arrive';G.P.yaw=G.F.lift.yaw;G.keys.KeyW=true;
        setTimeout(()=>{G.keys.KeyW=false},1600);
      });
    }
    if(arrivedAt&&Date.now()-arrivedAt>3000)break;
    await pg.waitForTimeout(40);
  }
  await pg.evaluate(()=>{window.__game.keys.KeyW=false});
  const post=await pg.evaluate(keys),st2=await pg.evaluate(()=>({links:window.__lc.links,by:window.__lc.byPhase,state:window.__game.state,depth:window.__game.R.depth,peak:window.__game.hub.lightPeak}));
  await ctx.close();
  if(arg('dump',false))for(const k of pre.filter(k=>/dr-dist|strata/.test(k)))console.log('   pre '+JSON.stringify(k.slice(0,330)));
  const have=new Map();for(const k of pre)have.set(k,(have.get(k)||0)+1);
  const added=[];for(const k of post){if(have.get(k)>0)have.set(k,have.get(k)-1);else added.push(k)}
  return {arrived:!!arrivedAt&&st2.state==='play',added,links:st2.links-preLinks,by:st2.by,programs:[pre.length,post.length],errs,peak:st2.peak};
}

const srv=await serve(arg('root',root)),br=await chromium.launch();
let bad=0;
try{
  for(const depth of DEPTHS){
    const r=await scenario(br,srv,depth);
    if(r.fail){console.log(`FAIL depth ${depth}: ${r.fail}`);bad++;continue}
    console.log(`depth ${depth}: arrived=${r.arrived} programs ${r.programs[0]} -> ${r.programs[1]}  new keys=${r.added.length}  peakLights=${r.peak}  linkProgram calls during ride/dock/arrival=${r.links} ${JSON.stringify(r.by)}`);
    for(const k of r.added)console.log('   + '+(arg('dump',false)?JSON.stringify(k.slice(0,330)):(k.length>260?k.slice(0,40)+' ... '+k.slice(-90):k)));
    if(r.errs.length)console.log('   page errors:',r.errs.slice(0,3));
    if(!r.arrived||r.added.length||r.links){console.log(`FAIL depth ${depth}`);bad++}else console.log(`ok depth ${depth}`);
  }
}finally{await br.close();srv.close()}
if(bad){console.log(bad+' scenario(s) failed');process.exit(1)}
console.log('Lift rides link no new programs.');
