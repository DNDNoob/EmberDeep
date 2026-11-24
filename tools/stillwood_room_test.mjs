// node tools/stillwood_room_test.mjs -- the still wood in a built index.html: second pond after a 500 ft walk, scrying at the new pond, snap/apply of ponds
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
await pg.evaluate(()=>{const G=window.__game;G.startRun('PONDS',1,true);if(!G.previewRoom('stillwood',7))throw new Error('no room')});
const r=await pg.evaluate(()=>{
  const G=window.__game,R=G.ROOMS,S=R.state(),Z={mx:0,my:0,lx:0,ly:0},o={};
  o.p0=S.ponds().length;
  S.WK.b.x=0;S.WK.b.z=-16-100;for(let i=0;i<5;i++)R.update(1/60,Z);o.afterNear=S.ponds().length;
  S.WK.b.z=-16-156;S.yaw=0;R.update(1/60,Z);const ps=S.ponds();o.afterFar=ps.length;
  const p=ps[ps.length-1];o.pond=p;o.dist=Math.hypot(p.x-S.WK.b.x,p.z-S.WK.b.z);
  // stand on the bank of the new pond and look down: the door is pinned
  S.WK.b.x=p.x;S.WK.b.z=p.z+p.r+0.8;S.yaw=0;S.pitch=-0.9;for(let i=0;i<5;i++)R.update(1/60,Z);
  o.pinned=S.pinned;
  const q=S.snap();o.snapPonds=q.po.length;
  // a guest applying the snapshot sees the same ponds
  o.same=JSON.stringify(q.po)===JSON.stringify(S.ponds().map(p=>[p.x,p.z,p.r,p.fx,p.fz,p.i]));
  // a fourth pond retires the oldest (max 3)
  for(let k=0;k<3;k++){const l=S.ponds().pop();S.WK.b.x=l.x;S.WK.b.z=l.z-160;S.yaw=0;R.update(1/60,Z)}
  o.max=S.ponds().length;o.stats=S.stats();delete o.stats.bake;
  return o;
});
console.log(JSON.stringify(r));
assert.equal(r.p0,1);assert.equal(r.afterNear,1,'no pond before 500 ft');assert.equal(r.afterFar,2,'a pond after 500 ft');
assert.ok(r.dist>=24.9&&r.dist<=35.1);assert.equal(r.pinned,true,'looking into the new pond pins the door');
assert.equal(r.snapPonds,2);assert.ok(r.same);assert.equal(r.max,3);
assert.deepEqual(errs,[]);
console.log('stillwood room ok');await br.close();
