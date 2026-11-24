// node tools/stillwood_shot.mjs [prefix] [seed]  -- renders the still wood to shots/stillwood/<prefix>-*.png (needs a built index.html)
// views: a start, b pond, c canopy, d start on low quality. Prefix 'before' only takes a and b.
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const prefix=process.argv[2]||'after',seed=+(process.argv[3]||7);
mkdirSync(root+'/shots/stillwood',{recursive:true});
const {biomeAt,biomeN}=await import('../src/stillwood.js');
// a spot of a biome: nearest to the spawn that is at least r0 away, with a view direction toward more of the same
const spot=(f,r0=45)=>{let best=null;for(let r=r0;r<400&&!best;r+=6)for(let a=0;a<6.283;a+=0.05){const x=Math.cos(a)*r,z=Math.sin(a)*r;if(f(biomeAt(x,z,seed),x,z)){best={x:+x.toFixed(1),z:+z.toFixed(1)};break}}return best};
const mead=spot(b=>b.m>0.99),deep=spot(b=>b.d>0.99);
// a border: where the meadow gives way, looking from the meadow side toward the trees
let bord=spot((b)=>b.m>0.5&&b.m<0.56&&b.d<0.01,30),bYaw=0;
if(bord){let bx=0,bz=0,bn=biomeN(bord.x,bord.z,seed);for(let a=0;a<6.283;a+=0.1){const n=biomeN(bord.x+Math.cos(a)*6,bord.z+Math.sin(a)*6,seed);if(n>bn){bn=n;bx=Math.cos(a);bz=Math.sin(a)}}bYaw=Math.atan2(bx,-bz);bord={x:+(bord.x-bx*7).toFixed(1),z:+(bord.z-bz*7).toFixed(1)}}
console.log('meadow',mead,'deep',deep,'border',bord);
const VIEWS={
  a:{q:'high',x:0,z:-1.5,yaw:0.0,pitch:0.02},
  b:{q:'high',x:0.2,z:-6.2,yaw:0.0,pitch:-0.1},
  c:{q:'high',x:-3,z:-3,yaw:0.9,pitch:0.4},
  d:{q:'low',x:0,z:-1.5,yaw:0.0,pitch:0.02},
  e:{q:'high',x:4,z:-1,yaw:-0.5,pitch:-0.12},          // grass and breeze at ground level
  f:{q:'high',x:0.4,z:-9.0,yaw:0.0,pitch:-0.45},         // the pond close up
  g:{q:'high',walk:{x:0,z:-332},look:{dx:0,dz:0,back:9,pitch:-0.12}}, // the second pond after a long walk
  h:{q:'low',x:0.2,z:-6.2,yaw:0.0,pitch:-0.1},
  k:{q:'high',x:-23,z:-9,yaw:0,pitch:0.05},   // a big boulder outcrop
  l:{q:'high',find:'hill'},   // a view across the hills from a rise
  m:{q:'high',find:'circle'}, // circling the pond: the reflection, then the real door at the edge of the screen
  n:{q:'high',...mead,yaw:0.6,pitch:0.02},        // a meadow
  o:{q:'high',...deep,yaw:0.6,pitch:0.02},        // the deep wood
  p:{q:'high',...bord,yaw:bYaw,pitch:0.02},       // a border: meadow into trees
  q:{q:'high',find:'stand'},                       // standing on a boulder
  w:{q:'high',find:'line'},                        // the door in line: pond behind the camera, the door ahead, you in between
  v:{q:'low',...mead,yaw:0.6,pitch:0.02},         // the meadow on low quality
  x:{q:'low',...deep,yaw:0.6,pitch:0.02},         // the deep wood on low quality
  // the held door seen in the water from four sides of the first pond (door stands 4.2 m behind the player)
  r:{q:'high',x:0,z:-9.6,yaw:0,pitch:-0.75,pin:true},
  s:{q:'high',x:0,z:-22.4,yaw:Math.PI,pitch:-0.75,pin:true},
  t:{q:'high',x:6.6,z:-16,yaw:-Math.PI/2,pitch:-0.75,pin:true},
  u:{q:'high',x:-6.6,z:-16,yaw:Math.PI/2,pitch:-0.75,pin:true},
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
    let dxx=x-Math.sin(yaw)*4.2,dzz=z+Math.cos(yaw)*4.2,pin=V.pin?1:0;
    if(V.find==='rock'){
      const rk=S.rockList().filter(r=>Math.hypot(r.x,r.z)>12).sort((a,b)=>b.r-a.r)[0];
      if(rk){const d=Math.hypot(rk.x,rk.z),ux=rk.x/d,uz=rk.z/d;x=rk.x-ux*(rk.r+8);z=rk.z-uz*(rk.r+8);yaw=Math.atan2(ux,-uz);pitch=0.0}
    }
    if(V.find==='stand'){
      for(let i=0;i<3;i++)R.update(1/60,Z);
      const rk=S.rockList().filter(r=>r.stand&&r.top>0.8&&Math.hypot(r.x,r.z)>8).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
      if(rk){x=rk.x;z=rk.z;yaw=Math.atan2(-rk.x,rk.z);pitch=-0.3;window.__stand=rk}
    }
    if(V.find==='line'){
      const pd=S.ponds()[0];x=pd.x;z=pd.z+pd.r+3;yaw=Math.PI;pitch=0.0;
    }
    if(V.find==='hill'){
      let best=null,low=null;
      for(let r=35;r<=70;r+=5)for(let a=0;a<6.28;a+=0.2){const px=Math.cos(a)*r,pz=Math.sin(a)*r,h=S.H(px,pz);if(!best||h>best.h)best={px,pz,h};if(!low||h<low.h)low={px,pz,h}}
      x=best.px;z=best.pz;yaw=Math.atan2(low.px-x,-(low.pz-z));pitch=-0.08;
    }
    if(V.find==='circle'){
      const pd=S.ponds()[0],R0=pd.r+2.5;let th=Math.PI/2;
      const Z0={mx:0,my:0,lx:0,ly:0};
      S.WK.b.x=pd.x+Math.cos(th)*R0;S.WK.b.z=pd.z+Math.sin(th)*R0;S.yaw=0;S.pitch=-0.4;
      for(let i=0;i<30;i++)R.update(1/60,Z0);
      let extra=0,n=0;
      while(n++<400&&extra<4){
        th-=0.012;S.WK.b.x=pd.x+Math.cos(th)*R0;S.WK.b.z=pd.z+Math.sin(th)*R0;S.WK.b.y=S.H(S.WK.b.x,S.WK.b.z);S.yaw=Math.atan2(pd.x-S.WK.b.x,-(pd.z-S.WK.b.z));S.pitch=-Math.atan2(S.WK.b.y+1.6-pd.wy,R0-1);
        R.update(1/60,Z0);if(S.direct)extra++;
      }
      x=S.WK.b.x;z=S.WK.b.z;yaw=S.yaw;pitch=S.pitch;window.__circle={deg:(Math.PI/2-th)*180/Math.PI,direct:S.direct,pinned:S.pinned};
    }
    if(V.find==='line'){dxx=x;dzz=z+4.2;pin=1;V.face=0}
    const ap=()=>{if(V.find!=='circle')S.apply({x,z,y:S.G(x,z),yaw,pitch,dx:dxx,dz:dzz,face:V.face??yaw,pin})};
    ap();
    for(let i=0;i<30;i++)R.update(1/60,Z);
    ap();
    for(let i=0;i<200;i++)R.update(1/60,Z);   // mist, ripples and wind settle
    S.yaw=yaw;S.pitch=pitch;R.update(0.0001,Z);
    R.render();
  },V);
  await pg.waitForTimeout(300);
  await pg.screenshot({path:`${root}/shots/stillwood/${prefix}-${k}.png`});
  const info=await pg.evaluate(()=>{const S=window.__game.ROOMS.state();return S.stats?S.stats():{}});delete info.bake;
  if(process.env.KINDS)console.log(JSON.stringify(await pg.evaluate(()=>window.__game.ROOMS.state().byKind())));
  console.log(k,JSON.stringify(info),JSON.stringify(await pg.evaluate(()=>window.__circle||null)),'rs',await pg.evaluate(()=>window.__game.rs));
  await ctx.close();
}
await br.close();
if(errs.length){console.log('ERRORS',errs.slice(0,5));process.exitCode=1}
