// node tools/floor_variety_test.mjs  -- checks the floor types and per-floor variants (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Depth 7 changed on purpose: depths 7, 15, 23... used to be caves and are now Dark Forest floors, which use the maze generator (so the layout, items and doors differ from the old cave).
// Its checksums were re-recorded; all were re-recorded again when the fourth strange door (mirror) joined the registry and again for the fifth (the picture house), since door kinds per floor rotate through it (layouts match with it removed); every other depth still matches the build from before floor types existed.
// layout checksums recorded from the build before floor types and variants existed (FULL: every field; NOPROPS: ignoring prop types and their collision discs, which follow the biome)
const FULL={"ALPHA:1":"1d0b7f1c","ALPHA:2":"fe9d5483","ALPHA:3":"30efb6de","ALPHA:4":"46e6aa8","ALPHA:5":"7570deca","K7M2QX:1":"80a21696","K7M2QX:2":"e52f1c20","K7M2QX:3":"d50fcf0f","K7M2QX:4":"bb68c848","K7M2QX:5":"c8bfcce7","EMBER9:1":"590d0375","EMBER9:2":"eb55fb07","EMBER9:3":"9aa4cc1d","EMBER9:4":"4a69df91","EMBER9:5":"9c9f8b2e","ZZZZZZ:1":"8154a411","ZZZZZZ:2":"f5efd186","ZZZZZZ:3":"e9f704ac","ZZZZZZ:4":"cac948f1","ZZZZZZ:5":"3435f043","DOOR42:1":"51f79ea6","DOOR42:2":"390cb842","DOOR42:3":"7f4436b7","DOOR42:4":"b5f4f457","DOOR42:5":"45b55c41"},NOPROPS={"ALPHA:1":"f18b792d","ALPHA:2":"9981cdf0","ALPHA:3":"5af3b241","ALPHA:4":"1bc8672","ALPHA:5":"8208564c","ALPHA:6":"b7a339fa","ALPHA:7":"9f7c7850","ALPHA:8":"c040b598","ALPHA:9":"edc4f867","ALPHA:10":"56f3a744","ALPHA:11":"779732e","ALPHA:12":"71d64aee","K7M2QX:1":"48abfe14","K7M2QX:2":"9cfce336","K7M2QX:3":"91b43725","K7M2QX:4":"b9f2b156","K7M2QX:5":"b113fcbd","K7M2QX:6":"1d8fecf8","K7M2QX:7":"6431090f","K7M2QX:8":"5ae49ad","K7M2QX:9":"1ee6132f","K7M2QX:10":"d536ce63","K7M2QX:11":"dee5734f","K7M2QX:12":"d01b22f","EMBER9:1":"172d51dc","EMBER9:2":"2b1209e","EMBER9:3":"4666955c","EMBER9:4":"14c38ba5","EMBER9:5":"b24952a9","EMBER9:6":"a44b2fef","EMBER9:7":"e236a3cd","EMBER9:8":"fdabee2f","EMBER9:9":"9a2db94f","EMBER9:10":"dd4a2799","EMBER9:11":"9df33347","EMBER9:12":"c3f71f26","ZZZZZZ:1":"8a326035","ZZZZZZ:2":"9d4b711b","ZZZZZZ:3":"a032af44","ZZZZZZ:4":"a54549a7","ZZZZZZ:5":"4fece310","ZZZZZZ:6":"ecd16c6e","ZZZZZZ:7":"2d5c68d9","ZZZZZZ:8":"b552f8c","ZZZZZZ:9":"fbe262d9","ZZZZZZ:10":"204be735","ZZZZZZ:11":"11cd9539","ZZZZZZ:12":"90355a3e","DOOR42:1":"4b55e713","DOOR42:2":"d303ccf9","DOOR42:3":"bf710aed","DOOR42:4":"75a4adca","DOOR42:5":"72210711","DOOR42:6":"e914b156","DOOR42:7":"63a78873","DOOR42:8":"a9d74083","DOOR42:9":"55003e82","DOOR42:10":"99d1fcca","DOOR42:11":"327fb50d","DOOR42:12":"3cff6284"};
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)},ok=(c,m)=>{if(!c)bad(m);else console.log('ok  ',m)};
const open=async(q,query)=>{
  const pg=await b.newPage({viewport:{width:640,height:360}}),errs=[];
  pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,300))});
  await pg.addInitScript(([q])=>{window.__norender=true;localStorage.setItem('emberdeep.quality',JSON.stringify(q))},[q]);
  await pg.goto(pathToFileURL(root+'/index.html').href+(query||''));await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
  return {pg,errs};
};
const {pg,errs}=await open('low');
const ev=(f,a)=>pg.evaluate(f,a);
// ---- layouts unchanged
const sums=await ev(()=>{const G=window.__game,out={};
  // the Wheel of Misfortune and Pat Sajak are placed without drawing from the floor's rng; leaving them out shows nothing else moved
  const skip=new Set(['bi','biome','base','name','variant','litter','stone','wet','fogK','ambK','ambT','torchT','tex','seen','dist','wheel']);
  const hs=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)};
  for(const s of ['ALPHA','K7M2QX','EMBER9','ZZZZZZ','DOOR42'])for(let d=1;d<=12;d++){const F=G.genFloor(s,d);
    for(const nt of [0,1])out[s+':'+d+(nt?':nt':'')]=hs(JSON.stringify(F,(k,v)=>k==='npcs'?v.filter(n=>n.type!=='pat'):skip.has(k)||(nt&&k==='discs')||(nt&&k==='t'&&typeof v==='string'&&/^(urn|shroom|ice|ember|barrel|bones|crate|sack|log|stump|fern)$/.test(v))?undefined:v instanceof Uint8Array||v instanceof Int16Array||v instanceof Int32Array?Array.from(v):v))}
  return out});
let badL=[];for(const k in FULL)if(sums[k]!==FULL[k])badL.push(k);
ok(badL.length===0,'grid, items, doors and props identical to main for 5 seeds x depths 1-5'+(badL.length?' ('+badL.join(',')+')':''));
badL=[];for(const k in NOPROPS)if(sums[k+':nt']!==NOPROPS[k])badL.push(k);
ok(badL.length===0,'layout identical to main for 5 seeds x depths 1-12 (ignoring prop types)'+(badL.length?' ('+badL.join(',')+')':''));
// ---- biomes
const B=await ev(()=>{const G=window.__game;return {n:G.BIOMES.length,names:G.BIOMES.map(b=>b.name),base:G.BIOMES.map(b=>b.base),
  early:[1,2,3,4,5].map(d=>G.biomeIx(d)),old:[1,2,3,4,5].map(d=>(d-1-Math.floor(d/4))%4),
  rot:Array.from({length:14},(_,i)=>G.biomeIx(i+1))}});
ok(B.n===9&&B.names[4]==='The Humming Rooms'&&B.names[8]==='The Dark Forest','nine biomes, Humming Rooms stays at index 4, the Dark Forest is 8');
ok(B.names[5]==='The Bone Galleries'&&B.names[6]==='The Rustworks'&&B.names[7]==='The Glimmer Veins','new biome names');
ok(JSON.stringify(B.early)===JSON.stringify(B.old),'depths 1-5 use the same biomes as before');
const seen=await ev(()=>{const G=window.__game,s=new Set(),k=new Set();for(let d=1;d<=40;d++){const f=G.genFloor('ROT',d);s.add(f.bi);k.add(f.kind+':'+f.bi)}return [...s].sort()});
ok(JSON.stringify(seen)==='[0,1,2,3,4,5,6,7,8]','rotation reaches every biome ('+seen+')');
const rot=await ev(()=>{const O=[0,1,2,3,5,6,7];return Array.from({length:60},(_,i)=>window.__game.biomeIx(i+1)===O[(i-Math.floor((i+1)/4))%7]).every(Boolean)});
ok(rot,'biomeIx follows ORDER[(depth-1-floor(depth/4)) % 7]');
const bases=await ev(()=>{const G=window.__game;return G.BIOMES.every((b,i)=>b.base===[0,3,6,9,13,17,20,23,26][i])});
ok(bases,'every biome has an explicit base surface layer');
// ---- variants
const V=await ev(()=>{const G=window.__game;
  const a=G.genFloor('VARSEED',6),a2=G.genFloor('VARSEED',6);
  const ixs=new Set(),seeds=new Set();for(let i=0;i<40;i++){const f=G.genFloor('S'+i,6);ixs.add(f.variant.ix);seeds.add(f.variant.seed)}
  const lay=[];for(let i=0;i<4;i++)lay.push(G.genFloor('VARSEED',6,{bi:5,ix:i}).g.join(''));
  return {same:JSON.stringify(a.variant)===JSON.stringify(a2.variant)&&JSON.stringify(a.tex)===JSON.stringify(a2.tex),ixs:[...ixs],seeds:seeds.size,layoutSame:lay.every(x=>x===lay[0]),
    four:G.VARIANTS.length===9&&G.VARIANTS.every(v=>v.length===4&&new Set(v.map(x=>x.name)).size===4),
    base:G.VARIANTS.map(v=>v[0].tex===0)}});
ok(V.same,'variant is deterministic per seed and depth');
ok(V.ixs.length===4,'all four variants turn up across seeds ('+V.ixs+')');
ok(V.seeds>=35,'noise seed jitter differs between floors ('+V.seeds+' of 40)');
ok(V.four&&V.base.every(Boolean),'nine biomes x four named variants, variant 0 is the classic one');
ok(V.layoutSame,'variant never changes the maze layout');
// ---- every biome x variant loads and renders, low then medium
const renderAll=async(pg,errs,label,flat)=>{
  const before=errs.length;let n=0;
  for(let bi=0;bi<8;bi++)for(let ix=0;ix<4;ix++){
    const r=await pg.evaluate(([bi,ix])=>{const G=window.__game;G.startRun('RND'+bi,bi===4?8:6,true);G.loadFloor(bi===4?8:6,{bi,ix});G.resize();G.render(1+bi);G.renderer.getContext().finish();
      return {name:G.F.biome.name,v:G.F.variant.name,mats:G.worldMats.size,surfs:G.SURFS.size(),err:G.renderer.getContext().getError()}},[bi,ix]);
    n++;
    if(r.err)bad(label+' GL error '+r.err+' on '+r.name+' / '+r.v);
    if(r.mats>14||r.surfs>14)bad(label+' resources grow: '+r.mats+' materials, '+r.surfs+' surfaces after '+r.name+' / '+r.v);
  }
  ok(errs.length===before,label+': '+n+' biome x variant floors render without page errors or shader errors'+(errs.length>before?' -> '+errs.slice(before,before+3).join(' | '):''));
};
await renderAll(pg,errs,'low quality');
await pg.close();
{const m=await open('medium');await renderAll(m.pg,m.errs,'medium quality');await m.pg.close()}
// ---- toast, ?depth=N
{const m=await open('low','?depth=6');
  const r=await m.pg.evaluate(()=>{const G=window.__game;const before=localStorage.getItem('emberdeep.deepest');G.startRun();
    const t1=document.getElementById('toast').textContent;const d=G.R.depth,ix=G.F.variant.ix,nm=G.F.name,vn=G.F.variant.name;
    return {before,d,ix,nm,vn,t1,after:localStorage.getItem('emberdeep.deepest'),url:G.URL_DEPTH,
      tag:(()=>{for(let s=0;s<30;s++){const f=G.genFloor('T'+s,6);if(f.variant.ix){G.R.seed='T'+s;G.startRun('T'+s,6,true);return {t:document.getElementById('toast').textContent,n:G.F.name,v:G.F.variant.name}}}})()}});
  ok(r.d===6&&r.url===6,'?depth=6 starts a new run at depth 6');
  ok(r.after===r.before,'?depth does not raise the saved deepest record ('+r.before+' -> '+r.after+')');
  ok(r.t1==='Depth 6: '+r.nm+(r.ix?' ('+r.vn+')':''),'arrival toast: '+r.t1);
  ok(r.tag&&r.tag.t==='Depth 6: '+r.tag.n+' ('+r.tag.v+')','toast names a non-plain variant: '+(r.tag&&r.tag.t));
  ok(!(r.tag&&r.tag.n.includes('(')),'F.name has no variant suffix');
  ok(m.errs.length===0,'no page errors with ?depth'+(m.errs.length?' '+m.errs[0]:''));
  await m.pg.close();
}
{const m=await open('low','?depth=99');const d=await m.pg.evaluate(()=>window.__game.URL_DEPTH);ok(d===0,'?depth=99 is ignored');await m.pg.close()}
await b.close();
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
