// node tools/lift_perf.mjs [--depths 1,3,6,15] [--reps 2] [--sw both|yes|no] [--keep] [--json out.json]
// Measures frame hitches during a solo lobby lift ride (pre-depart, riding, docking/enterRun, post-arrival).
// Builds an UNMINIFIED copy of the game with a sourcemap into a temp dir (index.html in the repo is untouched), serves it,
// records rAF deltas + longtasks + WebGL compile/link/upload timings, and samples the main thread with the CDP Profiler to
// name the functions behind every frame >33 ms (file:line mapped back through the sourcemap).
// Headless Chromium uses a software GPU: trust JS spikes and shader link counts, not absolute GPU time.
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,symlinkSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {serve} from './serve.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:(process.argv[i+1]&&!process.argv[i+1].startsWith('--')?process.argv[i+1]:true)};
const DEPTHS=String(arg('depths','1,3,6,15')).split(',').map(Number),REPS=+arg('reps',2),SW=arg('sw','both'),WAIT_POST=3000;

// ---- unminified build + sourcemap, outside the repo
const site=join(tmpdir(),'lift_perf_site');rmSync(site,{recursive:true,force:true});mkdirSync(site,{recursive:true});
const r0=await build({entryPoints:[join(root,'src/game.js')],absWorkingDir:root,bundle:true,format:'iife',minify:false,sourcemap:'external',outfile:join(site,'bundle.js'),write:false,target:'es2020',legalComments:'none',
  define:{__KIT_HASH__:JSON.stringify('liftperf')},alias:{'three/addons':'./node_modules/three/examples/jsm'}});
const js=r0.outputFiles.find(f=>f.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script'),map=JSON.parse(r0.outputFiles.find(f=>f.path.endsWith('.map')).text);
writeFileSync(join(site,'index.html'),readFileSync(join(root,'src/shell.html'),'utf8').replace('/*BUNDLE*/',()=>js));
if(existsSync(join(root,'music')))symlinkSync(join(root,'music'),join(site,'music'));
// bundle line/col (0-based, page-document coordinates) -> source file:line through the sourcemap
const shellSrc=readFileSync(join(root,'src/shell.html'),'utf8'),firstBundleLine=shellSrc.slice(0,shellSrc.indexOf('/*BUNDLE*/')).split('\n').length-1;
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const segs=[];{
  let sf=0,sl=0,sc=0;
  map.mappings.split(';').forEach((ln,gl)=>{let gc=0;segs[gl]=[];if(!ln)return;for(const s of ln.split(',')){const v=[];let sh=0,val=0;for(const ch of s){let d=B64.indexOf(ch);const cont=d&32;d&=31;val+=d<<sh;if(cont)sh+=5;else{v.push(val&1?-(val>>1):val>>1);val=0;sh=0}}
    gc+=v[0];if(v.length>=4){sf+=v[1];sl+=v[2];sc+=v[3];segs[gl].push([gc,sf,sl,sc])}}});
}
function orig(line,col){
  const row=segs[line-firstBundleLine];if(!row||!row.length)return null;
  let best=row[0];for(const s of row){if(s[0]<=col)best=s;else break}
  return map.sources[best[1]].replace(/^.*?(src\/|node_modules\/)/,'$1')+':'+(best[2]+1);
}

// ---- page-side instrumentation
const INIT=()=>{
  const L=window.__lp={rec:false,lastLong:0,frames:[],long:[],gl:[],links:[],phase:'idle',phaseAt:[],uploads:{n:0,ms:0}};
  const now=()=>performance.now();
  L.setPhase=p=>{L.phase=p;L.phaseAt.push([p,now()])};
  let last=0;
  const tick=t=>{requestAnimationFrame(tick);if(L.rec&&last)L.frames.push([t,t-last,L.phase]);last=t};
  requestAnimationFrame(tick);
  try{new PerformanceObserver(l=>{for(const e of l.getEntries()){L.lastLong=e.startTime+e.duration;if(L.rec)L.long.push([e.startTime,e.duration,L.phase])}}).observe({type:'longtask',buffered:false})}catch(e){}
  for(const C of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){if(!C)continue;const P=C.prototype;
    const wrap=(name,kind)=>{const f=P[name];if(!f||f.__w)return;const w=function(...a){const s=now();const r=f.apply(this,a);const d=now()-s;
      if(L.rec){if(kind==='up'){L.uploads.n++;L.uploads.ms+=d;if(d>=2)L.gl.push([s,d,name,L.phase])}
        else L.gl.push([s,d,name,L.phase]);if(name==='linkProgram'){Error.stackTraceLimit=40;L.links.push([s,L.phase,new Error().stack,d])}}return r};w.__w=1;P[name]=w};
    for(const n of ['compileShader','linkProgram','getProgramParameter','getShaderParameter','validateProgram'])wrap(n,'c');
    for(const n of ['texImage2D','texSubImage2D','texStorage2D','bufferData','bufferSubData','generateMipmap','compressedTexImage2D'])wrap(n,'up');
  }
};

const pct=(a,p)=>a.length?a[Math.min(a.length-1,Math.floor(p*a.length))]:0;
function stats(ds){const s=[...ds].sort((a,b)=>a-b);return {n:s.length,med:pct(s,.5),p95:pct(s,.95),p99:pct(s,.99),max:s.length?s[s.length-1]:0,o33:s.filter(x=>x>33).length,o50:s.filter(x=>x>50).length}}
const f1=x=>x.toFixed(1);

async function findSeed(pg,depth,wantSw){
  return pg.evaluate(([depth,wantSw])=>{const G=window.__game;
    for(let i=0;i<400;i++){const seed='LP'+i+'X';let f;try{f=G.genFloor(seed,depth)}catch(e){continue}
      const has=!!(f.sdoors&&f.sdoors.some(d=>d.kind==='stillwood'));if(has===wantSw)return {seed,kinds:(f.sdoors||[]).map(d=>d.kind)}}
    return null},[depth,wantSw]);
}

async function scenario(ctx,srv,depth,wantSw,rep){
  const pg=await ctx.newPage(),errs=[];
  await pg.setViewportSize({width:+arg('w',320),height:+arg('h',180)});
  pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.addInitScript(INIT);
  await pg.goto(srv.url+'index.html');
  await pg.waitForFunction(()=>window.__game?.hub?.lobbyReady,null,{timeout:120000});
  await pg.evaluate(()=>window.__game.hub.place(0,10));
  // let the idle-time NPC mesh bake finish (it is cached in IndexedDB for later pages of the same context, as for a returning player)
  for(let i=0;i<300;i++){await pg.waitForTimeout(1000);if(await pg.evaluate(()=>window.__game.keeperSaved()))break}
  await pg.waitForTimeout(3000);
  const found=await findSeed(pg,depth,wantSw);
  if(!found){await pg.close();return {skip:'no seed'}}
  const cdp=await pg.context().newCDPSession(pg);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:200});
  const progKey=()=>window.__game.renderer.info.programs.map(p=>(p.name||'?')+'|'+(p.cacheKey.length>400?p.cacheKey.slice(0,400):p.cacheKey));
  const preProg=await pg.evaluate(progKey),preLinks=preProg.length;
  await pg.evaluate(seed=>{document.getElementById('seedIn').value=seed;window.__lp.setPhase('pre');window.__lp.rec=true},found.seed);
  await cdp.send('Profiler.start');const startAt=await pg.evaluate(()=>performance.now());
  await pg.waitForTimeout(1500); // pre-depart baseline in the lobby
  const departed=await pg.evaluate(([depth])=>{const G=window.__game;G.hub.place(0,-8.6,0,0);
    const d=document.getElementById('liftDepth');
    return new Promise(res=>setTimeout(()=>{G.openStation('lift');d.value=depth;
      document.getElementById('liftDestination').dispatchEvent(new Event('submit',{cancelable:true}));
      const ok=G.hub.riding;if(ok)window.__lp.setPhase('ride');res(ok)},200))},[depth]);
  if(!departed){await cdp.send('Profiler.stop');await pg.close();return {skip:'could not depart',errs}}
  // Walk through the gate once the car is docked in the playable scene.
  const t0=Date.now();let arrivedAt=0;
  while(Date.now()-t0<400000){
    if(!arrivedAt&&await pg.evaluate(()=>window.__game.state==='play')){
      arrivedAt=Date.now();
      await pg.evaluate(()=>{
        const G=window.__game;window.__lp.setPhase('post');G.P.yaw=G.F.lift.yaw;G.keys.KeyW=true;
        setTimeout(()=>{G.keys.KeyW=false},1600);
      });
    }
    if(arrivedAt&&Date.now()-arrivedAt>WAIT_POST)break;
    await pg.waitForTimeout(40);
  }
  await pg.evaluate(()=>{window.__game.keys.KeyW=false});
  const prof=(await cdp.send('Profiler.stop')).profile;
  const data=await pg.evaluate(()=>{const L=window.__lp;L.rec=false;return {frames:L.frames,long:L.long,gl:L.gl,links:L.links.map(l=>[l[0],l[1],l[2],l[3]]),uploads:L.uploads,phaseAt:L.phaseAt,
    programs:window.__game.renderer.info.programs.length,state:window.__game.state}});
  data.progNames=await pg.evaluate(progKey);
  await pg.close();
  return {found,depth,sw:wantSw,rep,errs:errs.slice(0,3),prof,startAt,data,preLinks,preProg,arrived:!!arrivedAt};
}

// ---- profile attribution: every frame gets its main-thread samples split into JS vs GPU/compile wait ("(program)", getProgramInfoLog, ...)
const WAITFN=/^(\(program\)|getProgramInfoLog|getShaderInfoLog|getProgramParameter|getShaderParameter|linkProgram|compileShader|\(garbage collector\))$/;
function attribute(res){
  const {prof,startAt,data}=res;const nodes=new Map(prof.nodes.map(n=>[n.id,n]));const parent=new Map();
  for(const n of prof.nodes)for(const c of n.children||[])parent.set(c,n.id);
  const off=startAt*1000-prof.startTime; // profile us + off = page performance.now() us (aligned at Profiler.start; a few ms of error)
  const times=[];let t=prof.startTime;for(let i=0;i<prof.samples.length;i++){t+=prof.timeDeltas[i];times.push(t)}
  const nameOf=n=>{const c=n.callFrame;if(!c.url)return c.functionName||'(native)';
    const loc=orig(c.lineNumber,c.columnNumber)||('bundle:'+c.lineNumber);return (c.functionName||'(anon)')+' '+loc};
  const perFrame=[];let lo=0;
  for(const [ft,fd,ph] of data.frames){
    const a=(ft-fd)*1000-off,b=ft*1000-off;
    const self=new Map(),incl=new Map();let idle=0,js=0,wait=0,gc=0;
    while(lo<times.length&&times[lo]<a)lo++;
    for(let i=lo;i<times.length&&times[i]<=b;i++){
      const dt=(prof.timeDeltas[i+1]||200)/1000;const n=nodes.get(prof.samples[i]),fn=n.callFrame.functionName;
      if(fn==='(idle)'){idle+=dt;continue}
      if(WAITFN.test(fn)){if(fn==='(garbage collector)')gc+=dt;else wait+=dt;continue}
      js+=dt;const sn=nameOf(n);self.set(sn,(self.get(sn)||0)+dt);
      const seen=new Set();for(let id=n.id;id;id=parent.get(id)){const k=nameOf(nodes.get(id));if(seen.has(k))continue;seen.add(k);incl.set(k,(incl.get(k)||0)+dt)}}
    perFrame.push({t:ft,d:fd,ph,idle,js,wait,gc,self,incl});
  }
  return {perFrame};
}

const srv=await serve(site);
const br=await chromium.launch(),ctx=await br.newContext();
const all=[];
try{
  for(const depth of DEPTHS)for(const sw of (SW==='both'?[false,true]:[SW==='yes']))for(let rep=1;rep<=REPS;rep++){
    let r;try{r=await scenario(ctx,srv,depth,sw,rep)}catch(e){console.log(`depth ${depth} sw=${sw} rep ${rep}: scenario failed: ${String(e).split('\n')[0]}`);continue}
    if(r.skip){console.log(`depth ${depth} sw=${sw} rep ${rep}: ${r.skip}`,r.errs||'');continue}
    const A=attribute(r);all.push({r,A});
    const byPh={},jsPh={};for(const f of A.perFrame){(byPh[f.ph]=byPh[f.ph]||[]).push(f.d);(jsPh[f.ph]=jsPh[f.ph]||[]).push(f.js)}
    const linksPh={};for(const [,ph] of r.data.links)linksPh[ph]=(linksPh[ph]||0)+1;
    const linkWho=new Map();for(const [,ph,st] of r.data.links){const fr=[];for(const m of st.matchAll(/at (?:(\S+) )?\(?https?:\/\/[^:]+:\d+\/index\.html:(\d+):(\d+)/g)){const o=orig(+m[2]-1,+m[3]-1);if(o&&/^src\//.test(o))fr.push((m[1]||'?')+' '+o)}
      const k=ph+' <- '+fr.slice(0,3).join(' <- ');linkWho.set(k,(linkWho.get(k)||0)+1)}
    r.linkWho=linkWho;
    const pre=new Map();for(const k of r.preProg)pre.set(k,(pre.get(k)||0)+1);const added=new Map();for(const k of r.data.progNames){if(pre.get(k)>0)pre.set(k,pre.get(k)-1);else added.set(k.split('|')[0]+' '+k.slice(0,0),(added.get(k.split('|')[0]+' ')||0)+1);(r.addedKeys=r.addedKeys||[]).push(k)}
    if(process.argv.includes('--keys'))for(const k of r.addedKeys||[])console.log('   +',k.slice(0,300));
    console.log('  programs added during ride/dock/post, by three.js program name:',[...added].map(([k,v])=>k+(v>1?' x'+v:'')).join(', '));
    console.log(`\n=== depth ${depth}  stillwood-seed=${sw} (${r.found.seed} doors:${r.found.kinds.join(',')||'none'})  rep ${rep}  arrived=${r.arrived}  programs before=${r.preLinks} after=${r.data.programs}  linkProgram calls by phase ${JSON.stringify(linksPh)}`);
    if(r.errs.length)console.log('  page errors:',r.errs);
    console.log('  phase   | wall frame ms: n  med  p95  p99  max  >33 >50 | JS-only ms: p95  max  >16 >33 | longtasks n/ms | GL compile+link ms | GL upload ms');
    for(const ph of ['pre','ride','dock','post']){const s=stats(byPh[ph]||[]),j=stats(jsPh[ph]||[]);
      const lt=r.data.long.filter(l=>l[2]===ph),ltm=lt.reduce((a,l)=>a+l[1],0);
      const cl=r.data.gl.filter(g=>g[3]===ph&&/compile|link|Parameter|validate/.test(g[2])).reduce((a,g)=>a+g[1],0);
      const up=r.data.gl.filter(g=>g[3]===ph&&!/compile|link|Parameter|validate/.test(g[2])).reduce((a,g)=>a+g[1],0);
      const j16=(jsPh[ph]||[]).filter(x=>x>16).length;
      console.log(`  ${ph.padEnd(7)} | ${String(s.n).padStart(5)} ${f1(s.med).padStart(6)} ${f1(s.p95).padStart(6)} ${f1(s.p99).padStart(6)} ${f1(s.max).padStart(7)} ${String(s.o33).padStart(4)} ${String(s.o50).padStart(4)} | ${f1(j.p95).padStart(6)} ${f1(j.max).padStart(6)} ${String(j16).padStart(4)} ${String(j.o33).padStart(4)} | ${lt.length}/${f1(ltm)} | ${f1(cl)} | ${f1(up)}`)}
    const big=[...A.perFrame].filter(f=>f.js>16).sort((a,b)=>b.js-a.js).slice(0,6);
    console.log('  worst JS frames (wall ms, phase, JS ms, GPU/compile-wait ms, GC ms; top self fns):');
    for(const f of big)console.log(`    ${f1(f.d).padStart(7)} ${f.ph.padEnd(5)} js=${f1(f.js)} wait=${f1(f.wait)} gc=${f1(f.gc)}  `+[...f.self].sort((x,y)=>y[1]-x[1]).slice(0,3).map(([n,ms])=>`${n} ${f1(ms)}`).join(' | '));
    console.log('  linkProgram callers (phase <- game stack):');for(const [k,v] of [...linkWho].sort((a,b)=>b[1]-a[1]).slice(0,10))console.log('    '+String(v).padStart(3)+'x '+k);
    for(const f of big.slice(0,3))console.log(`    frame ${f1(f.d)}ms (${f.ph}) inclusive game fns: `+[...f.incl].filter(([k])=>/src\//.test(k)).sort((a,b)=>b[1]-a[1]).slice(0,9).map(([k,v])=>k+' '+f1(v)).join(' | '));
    const rideT=r.data.phaseAt.find(p=>p[0]==='ride')?.[1]||0,dockT=r.data.phaseAt.find(p=>p[0]==='dock')?.[1]||1e12;
    console.log('  linkProgram timeline (s since depart): '+r.data.links.map(l=>((l[0]-rideT)/1000).toFixed(1)+(l[1]==='dock'?'d':'')).join(' '));
    const glTop=r.data.gl.filter(g=>g[1]>=8).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if(glTop.length)console.log('  slowest GL calls:',glTop.map(g=>`${g[2]} ${f1(g[1])}ms@${g[3]}`).join(', '));
  }
  // ---- aggregate: JS time inside frames whose JS part is >16 ms (real main-thread hitches), per phase, and compile waits
  for(const ph of ['ride','dock','post']){
    const self=new Map(),incl=new Map();let n=0,jsMs=0,wait=0;
    for(const {A} of all)for(const f of A.perFrame){if(f.ph!==ph||f.js<=16)continue;n++;jsMs+=f.js;wait+=f.wait;for(const [k,v] of f.self)self.set(k,(self.get(k)||0)+v);for(const [k,v] of f.incl)incl.set(k,(incl.get(k)||0)+v)}
    const compileWait=all.reduce((a,{A})=>a+A.perFrame.filter(f=>f.ph===ph).reduce((x,f)=>x+f.wait,0),0);
    console.log(`\n=== AGGREGATE phase=${ph} over ${all.length} runs: ${n} frames with JS>16 ms (${f1(jsMs)} ms JS); total GPU/compile wait in phase ${f1(compileWait)} ms`);
    console.log('  top self:');for(const [k,v] of [...self].sort((a,b)=>b[1]-a[1]).slice(0,10))console.log('   '+f1(v).padStart(8)+' ms  '+k);
    console.log('  top inclusive (game code):');for(const [k,v] of [...incl].filter(([k])=>/src\//.test(k)).sort((a,b)=>b[1]-a[1]).slice(0,14))console.log('   '+f1(v).padStart(8)+' ms  '+k);
  }
  const j=arg('json',null);if(j&&j!==true)writeFileSync(j,JSON.stringify(all.map(({r,A})=>({depth:r.depth,sw:r.sw,rep:r.rep,gl:r.data.gl,links:r.data.links,frames:A.perFrame.map(f=>({t:f.t,d:f.d,ph:f.ph,js:f.js,wait:f.wait,gc:f.gc,top:[...f.incl].filter(([k])=>/src\//.test(k)).sort((a,b)=>b[1]-a[1]).slice(0,6)}))}))));
}finally{await br.close();srv.close();if(!arg('keep',false))rmSync(site,{recursive:true,force:true})}
