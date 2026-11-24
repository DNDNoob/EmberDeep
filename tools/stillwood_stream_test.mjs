// node tools/stillwood_stream_test.mjs -- sprint ~300 m through the still wood: content is generated well ahead of the walker and no frame does a big chunk of work
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
await pg.evaluate(()=>{const G=window.__game;G.startRun('SPRINT',1,true);if(!G.previewRoom('stillwood',7))throw new Error('no room')});
for(let i=0;i<900;i++){if(await pg.evaluate(()=>{const S=window.__game.ROOMS.state();window.__game.ROOMS.update(1/60,{mx:0,my:0,lx:0,ly:0});return S.ready}))break;await pg.waitForTimeout(250)}
const r=await pg.evaluate(()=>{
  const R=window.__game.ROOMS,S=R.state(),b=S.WK.b,o={};
  for(let i=0;i<240;i++)R.update(1/60,{mx:0,my:0,lx:0,ly:0});        // settle: the streaming catches up while standing
  const dirs=[[0,-1],[1,0],[0.7,0.7]];o.runs=[];
  for(const [dx,dz] of dirs){
    S.yaw=Math.atan2(dx,-dz);const ts=[],gens=[],aheads=[],x0=b.x,z0=b.z;let asm0=S.stream().asm,px=b.x,pz=b.z,lx=b.x,lz=b.z,ddx=dx,ddz=dz,path=0;
    for(let i=0;i<60*45;i++){
      b.stam=100;b.winded=false;
      if(i%45===0){if(Math.hypot(b.x-lx,b.z-lz)<4)S.yaw+=0.9;lx=b.x;lz=b.z}   // a tree in the way: turn a little
      const t0=performance.now();R.update(1/60,{mx:0,my:-1,lx:0,ly:0,sprint:true});ts.push(performance.now()-t0);
      const mv=Math.hypot(b.x-px,b.z-pz);if(mv>0.02){ddx=(b.x-px)/mv;ddz=(b.z-pz)/mv}path+=mv;px=b.x;pz=b.z;
      const st=S.stream();gens.push(st.gen(ddx,ddz));aheads.push(st.asmd(ddx,ddz));
    }
    const dist=path;ts.sort((a,c)=>c-a);
    o.runs.push({dist:+dist.toFixed(0),worst:+ts[0].toFixed(1),p99:+ts[Math.floor(ts.length*0.01)].toFixed(1),med:+ts[Math.floor(ts.length/2)].toFixed(2),
      genMin:Math.min(...gens),aheadMin:+Math.min(...aheads.slice(30)).toFixed(0),asm:S.stream().asm-asm0,queue:S.stream().queue});
  }
  o.stats=S.stats();delete o.stats.bake;o.kinds=S.byKind();return o;
});
console.log(JSON.stringify(r));
for(const q of r.runs){
  assert.ok(q.dist>=250,'sprinted '+q.dist+' m');
  assert.ok(q.genMin>=60,'generated at least 60 m ahead at every frame: '+q.genMin);   // fog hides everything past about 66 m
  assert.ok(q.aheadMin>=54,'assembled chunks at least 54 m ahead at every frame: '+q.aheadMin);
  assert.ok(q.worst<25,'worst frame of update work '+q.worst+' ms');
  assert.ok(q.p99<9,'p99 '+q.p99+' ms');
}
assert.deepEqual(errs,[]);
console.log('stillwood stream test ok');await br.close();
