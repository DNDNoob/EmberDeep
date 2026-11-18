// node tools/door_rotation_test.mjs  -- checks the strange-door rotation (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch(),pg=await b.newPage(),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)};
// 1. real registry: every floor holds ONE COPY of each type (distinct kinds), min(N,doorCountFor(depth)) doors, sequence continues floor to floor
const r1=await pg.evaluate(()=>{
  const G=window.__game,ord=G.doorOrder(),N=ord.length,out={bad:[],floors:0,hist:{},short:0,perDepth:{},diff:0,order:ord,sample:[]};
  for(let s=0;s<30;s++){const seed='seed'+s;let last=null;
    for(let d=1;d<=20;d++){
      const f=G.genFloor(seed,d),f2=G.genFloor(seed,d);out.floors++;
      const ks=f.sdoors.map(q=>q.kind);
      if(JSON.stringify(f.sdoors.map(q=>[q.tx,q.ty,q.kind,q.look]))!==JSON.stringify(f2.sdoors.map(q=>[q.tx,q.ty,q.kind,q.look])))out.diff++;
      out.hist[ks.length]=(out.hist[ks.length]||0)+1;const want=Math.min(N,G.doorCountFor(d));out.perDepth[d]=ks.length;
      if(ks.length!==want){out.short++;out.bad.push(seed+' d'+d+' count '+ks.length+' != '+want)}
      if(new Set(ks).size!==ks.length)out.bad.push(seed+' d'+d+' duplicate kinds '+ks);
      for(let i=1;i<ks.length;i++)if(ord.indexOf(ks[i])!==(ord.indexOf(ks[i-1])+1)%N)out.bad.push(seed+' d'+d+' inner seq '+ks);
      if(ks.length){if(last!==null&&ord[(last+1)%N]!==ks[0])out.bad.push(seed+' d'+d+' seq skip/repeat '+ord[last]+'->'+ks[0]);last=ord.indexOf(ks[ks.length-1])}else last=null;
      if(s===0&&d<=8)out.sample.push('d'+d+': '+ks.join(','));
    }}
  return out});
console.log('T1 floors',r1.floors,'door-count histogram',JSON.stringify(r1.hist),'floors short of min(N,doorCountFor)',r1.short,'nondeterministic',r1.diff);
console.log('T1 doors per depth',JSON.stringify(r1.perDepth));console.log(r1.sample.join('\n'));
if(r1.bad.length)bad('T1 '+r1.bad.slice(0,5).join('; '));if(r1.diff)bad('T1 nondeterministic');if(r1.short)bad('T1 '+r1.short+' floors placed wrong door count');
// 2. synthetic registries
for(const N of [1,2,5,6,10,13]){
  const r=await pg.evaluate(N=>{const G=window.__game,ord=Array.from({length:N},(_,i)=>'t'+(i+1)),o={bad:[],pat:[]};
    for(let s=0;s<20;s++){const seed='syn'+s;let last=null;
      for(let d=1;d<=25;d++){const p=G.doorPlan(seed,d,ord),k=p.kinds;
        if(new Set(k).size!==k.length)o.bad.push('dup '+seed+' d'+d);
        if(k.length!==Math.min(N,G.doorCountFor(d)))o.bad.push('count '+seed+' d'+d);
        if(last!==null&&ord[(last+1)%N]!==k[0])o.bad.push('gap '+seed+' d'+d);
        for(let i=1;i<k.length;i++)if(ord.indexOf(k[i])!==(ord.indexOf(k[i-1])+1)%N)o.bad.push('inner '+seed+' d'+d);
        last=ord.indexOf(k[k.length-1]);
        if(s===0&&N===10)o.pat.push('d'+d+':'+k.join(','));}}
    return o},N);
  console.log('T2 N='+N,r.bad.length?r.bad.slice(0,5):'ok');if(r.bad.length)bad('T2 N='+N);
  if(N===10)console.log(r.pat.slice(0,10).join('\n'));
}
const p10=await pg.evaluate(()=>{const G=window.__game,ord=Array.from({length:10},(_,i)=>'t'+(i+1));
  for(let s=0;s<50;s++)for(let d=1;d<=18;d++){const a=G.doorPlan('p'+s,d,ord).kinds,b=G.doorPlan('p'+s,d+1,ord).kinds,c=G.doorPlan('p'+s,d+2,ord).kinds;
    if(a.length===5&&b.length===5&&c.length===5){const base=ord.indexOf(a[0]);if(base===0||base===5)return {s,d,a,b,c}}}return null});
console.log('T2 1-5/6-10/1-5 sample',JSON.stringify(p10));
if(!p10||p10.a[0]===p10.b[0]||p10.a[0]!==p10.c[0])bad('T2 pattern');
// 4. smoke
const sm=await pg.evaluate(async()=>{
  const G=window.__game,res={};
  for(const kind of ['galaxy','kiln','fall','mirror']){
    let found=null;
    for(let s=0;s<40&&!found;s++)for(let d=1;d<=6&&!found;d++){const f=G.genFloor('smoke'+s,d);if(f.sdoors.length&&f.sdoors[0].kind===kind)found=['smoke'+s,d]}
    if(!found){res[kind]='no floor';continue}
    G.startRun(found[0],found[1],true);
    const D=G.F.sdoors[0];if(!D||D.kind!==kind){res[kind]='startRun floor mismatch';continue}
    G.sdoorOpen(D);await new Promise(r=>setTimeout(r,300));
    res[kind]={state:G.state,used:D.used,active:!!G.ROOMS.active,seed:found}}
  return res});
console.log('T4 smoke',JSON.stringify(sm));
for(const k in sm){const v=sm[k];if(typeof v==='string'||v.state!=='room'||!v.used)bad('T4 '+k)}
if(errs.length){console.log('console errors:',errs.slice(0,5));bad('console errors')}
await b.close();console.log(fails?'FAILED':'ALL PASSED');process.exit(fails?1:0);
