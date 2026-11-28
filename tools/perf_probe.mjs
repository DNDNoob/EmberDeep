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


// ---- unminified build + sourcemap, outside the repo
const site=join(tmpdir(),'perf_probe_site');rmSync(site,{recursive:true,force:true});mkdirSync(site,{recursive:true});
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


// node tools/perf_probe.mjs [--depth 15] [--maze 20] [--w 640] [--h 360]
// Where the main thread goes: boot to a usable lobby, the lobby idling, the lift (open the panel, pick a floor, ride, arrive), and
// a stretch of real maze play. For each phase: frame times, long tasks, and the functions that took the most main-thread time
// (self and inclusive, mapped back to src/ through the sourcemap). Headless Chromium uses a software GPU: trust the JS, not GPU time.
const INIT=()=>{
  const L=window.__pp={ph:'boot',frames:[],long:[],marks:[]};
  const now=()=>performance.now();L.set=p=>{L.ph=p;L.marks.push([p,now()])};
  let last=0;const tick=t=>{requestAnimationFrame(tick);if(last)L.frames.push([t,t-last,L.ph]);last=t};requestAnimationFrame(tick);
  try{new PerformanceObserver(l=>{for(const e of l.getEntries())L.long.push([e.startTime,e.duration,L.ph])}).observe({type:'longtask',buffered:true})}catch(e){}
};
const DEPTH=+arg('depth',15),MAZE=+arg('maze',20);
const srv=await serve(site);
const br=await chromium.launch();const ctx=await br.newContext();const pg=await ctx.newPage();
await pg.setViewportSize({width:+arg('w',640),height:+arg('h',360)});
const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
await pg.addInitScript(INIT);
const cdp=await ctx.newCDPSession(pg);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:250});
await cdp.send('Profiler.start');
const t0=Date.now();
await pg.goto(srv.url+'index.html');
await pg.waitForFunction(()=>window.__game?.hub?.lobbyReady,null,{timeout:300000});
const bootMs=Date.now()-t0;
await pg.evaluate(()=>{window.__pp.set('lobby');window.__game.hub.place(0,-6)});
await pg.waitForTimeout(+arg('lobby',15)*1000);
const warm=await pg.evaluate(()=>JSON.stringify(window.__game.pipelineWarm()));
// the lift: walk on, open the panel, pick a floor, go
await pg.evaluate(()=>{window.__pp.set('liftui');const G=window.__game;G.hub.place(0,-8.6,0,0);G.openStation('lift')});
await pg.waitForTimeout(1500);
const seed=await pg.evaluate(d=>{const G=window.__game,dd=document.getElementById('liftDepth');window.__pp.set('ride');dd.value=d;dd.dispatchEvent(new Event('input'));
  document.getElementById('liftDestination').dispatchEvent(new Event('submit',{cancelable:true}));return G.hub.riding},DEPTH);
const tr=Date.now();while(Date.now()-tr<300000){if(await pg.evaluate(()=>window.__game.state==='play'))break;await pg.waitForTimeout(100)}
const rideMs=Date.now()-tr;
// the maze: walk and turn like a player
await pg.evaluate(()=>{window.__pp.set('maze');const G=window.__game;G.P.yaw=G.F.lift?G.F.lift.yaw:0;G.keys.KeyW=true;
  window.__walk=setInterval(()=>{G.P.yaw+=(Math.random()-0.5)*1.2;G.keys.ShiftLeft=Math.random()<0.4},700)});
await pg.waitForTimeout(MAZE*1000);
await pg.evaluate(()=>{clearInterval(window.__walk);window.__game.keys.KeyW=false;window.__pp.set('end')});
const prof=(await cdp.send('Profiler.stop')).profile;
const data=await pg.evaluate(()=>{const L=window.__pp;return {frames:L.frames,long:L.long,marks:L.marks,info:{calls:window.__game.renderer.info.render.calls,tris:window.__game.renderer.info.render.triangles,progs:window.__game.renderer.info.programs.length,geos:window.__game.renderer.info.memory.geometries,tex:window.__game.renderer.info.memory.textures},depth:window.__game.R.depth,shades:window.__game.F.shades.length}});
const startAt=0;
// ---- attribution per phase
const nodes=new Map(prof.nodes.map(n=>[n.id,n]));const parent=new Map();for(const n of prof.nodes)for(const c of n.children||[])parent.set(c,n.id);
const nameOf=n=>{const c=n.callFrame;if(!c.url)return c.functionName||'(native)';const loc=orig(c.lineNumber,c.columnNumber)||('bundle:'+c.lineNumber);return (c.functionName||'(anon)')+' '+loc};
// align profile time to page time using the first mark (page performance.now at 'lobby' vs wall): approximate with phase marks only
const ph=data.marks;const phaseAtUs=[];let tt=prof.startTime;const times=[];for(let i=0;i<prof.samples.length;i++){tt+=prof.timeDeltas[i];times.push(tt)}
// performance.now() origin = navigation start; profile clock is monotonic us. Align: the profile started before goto, so the first page
// sample is at navigation; use the offset that maps the 'lobby' mark onto the sample timeline via the boot duration.
const off=times[0]; // us
const per=new Map();
const phaseOf=us=>{const ms=(us-off)/1000;let p='boot';for(const [n,t] of ph)if(ms>=t)p=n;return p};
for(let i=0;i<times.length;i++){const n=nodes.get(prof.samples[i]),fn=n.callFrame.functionName;const dt=(prof.timeDeltas[i+1]||250)/1000;
  const p=phaseOf(times[i]);let P=per.get(p);if(!P){P={self:new Map(),incl:new Map(),idle:0,busy:0,gc:0,prog:0};per.set(p,P)}
  if(fn==='(idle)'){P.idle+=dt;continue}if(fn==='(garbage collector)'){P.gc+=dt;continue}if(fn==='(program)'){P.prog+=dt;continue}
  P.busy+=dt;const sn=nameOf(n);P.self.set(sn,(P.self.get(sn)||0)+dt);
  const seen=new Set();for(let id=n.id;id;id=parent.get(id)){const k=nameOf(nodes.get(id));if(seen.has(k))continue;seen.add(k);P.incl.set(k,(P.incl.get(k)||0)+dt)}}
const pct=(a,p)=>a.length?a[Math.min(a.length-1,Math.floor(p*a.length))]:0,f1=x=>x.toFixed(1);
console.log(`boot to usable lobby ${bootMs} ms; ride ${rideMs} ms; lobby warm ${warm}; maze depth ${data.depth}, ${data.shades} creatures; renderer`,data.info);
for(const p of ['boot','lobby','liftui','ride','maze']){
  const fr=data.frames.filter(f=>f[2]===p).map(f=>f[1]).sort((a,b)=>a-b),lt=data.long.filter(l=>l[2]===p);
  const P=per.get(p);if(!P)continue;
  console.log(`\n=== ${p}: frames n=${fr.length} med ${f1(pct(fr,.5))} p95 ${f1(pct(fr,.95))} max ${f1(fr[fr.length-1]||0)} >50ms ${fr.filter(x=>x>50).length} | long tasks ${lt.length} total ${f1(lt.reduce((a,l)=>a+l[1],0))} ms, worst ${f1(Math.max(0,...lt.map(l=>l[1])))} | JS ${f1(P.busy)} ms, GC ${f1(P.gc)}, program/GPU ${f1(P.prog)}, idle ${f1(P.idle)}`);
  console.log('  top self:');for(const [k,v] of [...P.self].sort((a,b)=>b[1]-a[1]).slice(0,+arg('top',14)))console.log('   '+f1(v).padStart(9)+'  '+k);
  console.log('  top inclusive (src):');for(const [k,v] of [...P.incl].filter(([k])=>/src\//.test(k)).sort((a,b)=>b[1]-a[1]).slice(0,+arg('top',14)))console.log('   '+f1(v).padStart(9)+'  '+k);
}
if(errs.length)console.log('errors',errs.slice(0,3));
await br.close();srv.close();
