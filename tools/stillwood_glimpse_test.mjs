// node tools/stillwood_glimpse_test.mjs -- an unwatched door is never on screen: jump on and off stones with random yaws/pitches, check the real camera frustum
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
await pg.evaluate(()=>{const G=window.__game;G.startRun('GLIMPSE',1,true);if(!G.previewRoom('stillwood',7))throw new Error('no room')});
for(let i=0;i<900;i++){
  if(await pg.evaluate(()=>{const S=window.__game.ROOMS.state();window.__game.ROOMS.update(1/60,{mx:0,my:0,lx:0,ly:0});return S.ready}))break;
  await pg.waitForTimeout(250);
}
const r=await pg.evaluate(()=>{
  const R=window.__game.ROOMS,S=R.state(),b=S.WK.b,cam=S.cam,o={frames:0,checked:0,bad:[],jumps:0,airFrames:0};
  let seed=12345;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const all=S.rockList().filter(r=>r.stand);o.rocks=all.length;
  // door box corners projected with the real camera matrices: any corner strictly inside the frustum counts as on screen
  const onScreen=()=>{
    cam.updateMatrixWorld();const m=cam.matrixWorldInverse.elements,p=cam.projectionMatrix.elements;
    const dx=S.doorX,dz=S.doorZ,dy=S.H(dx,dz),c=Math.cos(S.doorFace),s=Math.sin(S.doorFace);
    for(const u of [-0.52,0.52])for(const w of [-0.1,0.1])for(const h of [0,2.2]){
      const x=dx+c*u+s*w,y=dy+h,z=dz+s*u-c*w;
      const vx=m[0]*x+m[4]*y+m[8]*z+m[12],vy=m[1]*x+m[5]*y+m[9]*z+m[13],vz=m[2]*x+m[6]*y+m[10]*z+m[14];
      const cx=p[0]*vx+p[4]*vy+p[8]*vz,cy=p[1]*vx+p[5]*vy+p[9]*vz,cw=-vz;
      if(cw>0.03&&Math.abs(cx)<cw&&Math.abs(cy)<cw)return true;
    }
    return false;
  };
  const trees=S.treeList();
  for(const rk of all.slice(0,10))for(let run=0;run<6;run++){
    const a=rnd()*6.283,d0=rk.rb+2.5+rnd()*2;
    b.x=rk.cx+Math.cos(a)*d0;b.z=rk.cz+Math.sin(a)*d0;b.y=S.H(b.x,b.z);b.vy=0;b.vx=b.vz=0;
    S.pinned=false;S.yaw=Math.atan2(-Math.cos(a),Math.sin(a))+(rnd()-0.5)*2;S.pitch=(rnd()-0.5)*1.6;
    let tyaw=S.yaw,tp=S.pitch;
    for(let i=0;i<320;i++){
      if(i%25===0){tyaw=S.yaw+(rnd()-0.5)*5;tp=(rnd()-0.5)*2.2}      // random turns and pitches, also mid-air
      S.yaw+=(tyaw-S.yaw)*0.2;S.pitch+=(tp-S.pitch)*0.2;
      const d=Math.hypot(b.x-rk.cx,b.z-rk.cz),air=b.y>S.G(b.x,b.z)+0.05;
      const jump=i%37===5||(d<rk.rb+1.5&&!air&&rnd()<0.2);
      if(jump)o.jumps++;
      if(air)o.airFrames++;
      R.update(1/60,{mx:0,my:i%90<60?-1:0,lx:0,ly:0,jump});
      o.frames++;
      if(S.pinned)continue;
      if(S.doorShown()){o.checked++;if(onScreen())o.bad.push({i,rock:+rk.top.toFixed(2),air,yaw:+S.yaw.toFixed(2),pitch:+S.pitch.toFixed(2),y:+b.y.toFixed(2)})}
    }
  }
  o.hiddenFrames=o.frames-o.checked;
  return o;
});
console.log(JSON.stringify({...r,bad:r.bad.slice(0,5),nbad:r.bad.length}));
assert.ok(r.rocks>=3&&r.jumps>=40&&r.airFrames>200,'the sweep jumped around stones');
assert.equal(r.bad.length,0,'an unwatched door was on screen: '+JSON.stringify(r.bad.slice(0,5)));
assert.deepEqual(errs,[],errs.join('\n'));
await br.close();console.log('glimpse test ok');
