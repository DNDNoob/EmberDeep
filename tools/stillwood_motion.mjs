// node tools/stillwood_motion.mjs [seed]  -- contact sheets of the wind: 6 frames 0.15 s apart of a close oak and a close fir -> shots/stillwood/motion-*.png
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const seed=+(process.argv[2]||7);
const br=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await br.newPage({viewport:{width:640,height:480},deviceScaleFactor:1});
const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);
await pg.waitForFunction(()=>window.__game&&window.__game.previewRoom);
await pg.evaluate(seed=>{const G=window.__game;G.startRun('MOTION',1,true);G.previewRoom('stillwood',seed)},seed);
await pg.waitForFunction(()=>window.__game.ROOMS.state().ready,null,{timeout:200000});
const sheets={};
for(const kind of ['oak','fir']){
  const frames=[];
  const t=await pg.evaluate(kind=>{
    const R=window.__game.ROOMS,S=R.state(),Z={mx:0,my:0,lx:0,ly:0};
    const tr=S.treeList().filter(t=>t.kind===kind&&Math.hypot(t.x,t.z)>8&&Math.hypot(t.x,t.z)<26).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
    // stand 8 m away on the side nearest the start, looking at the crown
    const d=Math.hypot(tr.x,tr.z),ux=tr.x/d,uz=tr.z/d,x=tr.x-ux*8,z=tr.z-uz*8,yaw=Math.atan2(ux,-uz);
    S.apply({x,z,y:0,yaw,pitch:0.42,dx:x,dz:z+4,face:yaw,pin:0});
    for(let i=0;i<20;i++)R.update(1/60,Z);
    return {x,z,yaw,tree:tr};
  },kind);
  for(let f=0;f<6;f++){
    await pg.evaluate(t=>{const R=window.__game.ROOMS,S=R.state(),Z={mx:0,my:0,lx:0,ly:0};
      S.apply({x:t.x,z:t.z,y:0,yaw:t.yaw,pitch:0.42,dx:t.x,dz:t.z+4,face:t.yaw,pin:0});R.update(0.15,Z);S.yaw=t.yaw;S.pitch=0.42;R.render()},t);
    await pg.waitForTimeout(150);
    frames.push((await pg.screenshot({type:'png'})).toString('base64'));
  }
  sheets[kind]=frames;
}
const sheet=await br.newPage({viewport:{width:1920,height:960}});
for(const kind of Object.keys(sheets)){
  await sheet.setContent('<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(3,640px);gap:0">'+sheets[kind].map(b=>`<img width=640 height=480 src="data:image/png;base64,${b}">`).join('')+'</body>');
  await sheet.screenshot({path:`${root}/shots/stillwood/motion-${kind}.png`});
}
console.log('errors',errs);await br.close();
