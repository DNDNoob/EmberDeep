// node tools/kiln_arcade_test.mjs  -- the walkable kiln arcade: walking, collision, buttons, rules, watcher snapshots, layout (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch(),pg=await b.newPage({viewport:{width:1280,height:720}}),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)},ok=(c,m)=>{if(!c)bad(m);else console.log('ok  ',m)};
// helpers live in the page: open a room of a given kind and drive it with fixed steps
await pg.evaluate(()=>{
  const G=window.__game,R=G.ROOMS,Z={mx:0,my:0,press:0,lx:0,ly:0};window.T={G,R,Z,res:null};
  T.open=(kind,seed)=>{G.startRun(seed||'kt',1,true);const D=G.F.sdoors[0];D.kind=kind;T.res=null;
    // the real roomEnd would rebuild the run; capture the result of the room instead
    R.start(kind,r=>{T.res=r});G.state;return true};
  T.run=(n,inp)=>{for(let i=0;i<n&&!T.res;i++)R.update(1/60,Object.assign({},Z,inp||{}))};
  T.at=(i,x,z)=>{const S=R.state(),p=S.bp[i];S.px=S.vx=x;S.pz=S.vz=z;const dx=p[0]-x,dz=p[2]-z;S.yaw=S.vyaw=Math.atan2(dx,-dz);S.pitch=S.vpitch=Math.atan2(p[1]-1.6,Math.hypot(dx,dz))};
  T.press=(i,n,x,z)=>{T.at(i,x===undefined?0:x,z===undefined?1.5:z);T.run(1,{press:1});const aim=R.state().aim;T.run(n||1,{press:1});T.run(1,{press:0});return aim};
});
const ev=(f,...a)=>pg.evaluate(f,...a);
await ev(()=>{T.G.startRun('kt',1,true);T.G.sdoorOpen(Object.assign(T.G.F.sdoors[0],{kind:'kiln'}))});
// 1. walking and collision
let r=await ev(()=>{const S=T.R.state(),o={};o.start=[S.px,S.pz];
  T.run(60,{my:-1});o.fwd=[S.px,S.pz];            // forward from the back, facing -z
  T.run(30,{mx:1});o.right=[S.px,S.pz];
  S.px=0;T.run(600,{my:-1});o.stopped=[S.px,S.pz];       // into the console
  S.px=0;S.pz=2;T.run(900,{mx:-1});o.wallL=S.px;T.run(900,{mx:1});o.wallR=S.px;
  S.px=0;S.pz=2;S.yaw=Math.PI;T.run(900,{my:-1});o.back=S.pz;  // turned round, walk "forward" to the back wall
  S.yaw=0;S.px=0;S.pz=-3;T.run(5,{});S.pz=-0.2;T.run(2,{});o.inside=S.pz;S.pz=-6;S.px=0;T.run(5,{});o.cab=[S.px,S.pz];
  S.px=3;S.pz=-6.5;T.run(5,{});o.door=S.pz;return o});
console.log(JSON.stringify(r));
ok(Math.abs(r.start[1]-6.2)<0.01&&Math.abs(r.start[0])<0.01,'enters at the back');
ok(r.fwd[1]<r.start[1]-1,'forward walks toward the kiln');ok(r.right[0]>0.5,'strafes right');
ok(r.stopped[1]>=1.3&&r.stopped[1]<3,'the console stops the player ('+r.stopped[1].toFixed(2)+')');
ok(r.wallL>=-5.69&&r.wallL<=-5.5&&r.wallR<=5.69&&r.wallR>=5.5,'side walls stop the player');ok(r.back<=6.69&&r.back>6.4,'back wall stops the player');
ok(r.inside<=-1.2||r.inside>=1.3,'pushed out of the console ('+r.inside.toFixed(2)+')');ok(r.cab[1]>-5.6,'the kiln cabinet stops the player ('+r.cab[1].toFixed(2)+')');
// 2. nothing before the first press, old keys do nothing
r=await ev(()=>{T.open('kiln','a1');const S=T.R.state(),K=S.K,p0=JSON.stringify([K.piece.x,K.piece.y,K.piece.c]),a0=K.ashT,o={};
  T.run(600,{});o.idle=JSON.stringify([K.piece.x,K.piece.y,K.piece.c])===p0&&K.ashT===a0&&!S.started;
  T.run(300,{l:1,r:1,d:1,rot:1,drop:1,press:0});o.old=JSON.stringify([K.piece.x,K.piece.y,K.piece.c])===p0&&!S.started;
  T.at(2,0,6);T.run(10,{press:1});o.far=!S.started;T.run(1,{press:0});   // pressing at nothing does nothing
  return o});
ok(r.idle,'stones and ash wait for the first press');ok(r.old,'old direct keys (l r d rot drop) no longer steer');ok(r.far,'pressing at nothing starts nothing');
// 3. each button does the right thing
r=await ev(()=>{const o={};T.open('kiln','a2');const S=T.R.state(),K=S.K;
  K.piece={c:[[0,0],[1,0],[2,0]],col:1,x:2,y:12};K.next=K.next;K.fallT=0;
  const aims=[];
  let x0=K.piece.x;aims.push(T.press(0,1));o.left=K.piece.x-x0;
  x0=K.piece.x;aims.push(T.press(1,1));o.right=K.piece.x-x0;
  const c0=JSON.stringify(K.piece.c);aims.push(T.press(2,1));o.rot=JSON.stringify(K.piece.c)!==c0;
  K.piece={c:[[0,0],[1,0]],col:1,x:2,y:12};K.fallT=0;let y0=K.piece.y;T.at(3,0,1.5);T.run(1,{press:1});T.run(30,{press:1});o.soft=y0-K.piece.y;o.softAim=S.held;T.run(1,{press:0});
  const y1=K.piece.y;T.run(30,{});o.slow=y1-K.piece.y;     // released: back to the slow fall
  K.piece={c:[[0,0],[1,0]],col:1,x:2,y:12};const pieceN=K.next;const g0=K.g.reduce((a,v)=>a+(v?1:0),0);aims.push(T.press(4,1));o.slam=K.g.reduce((a,v)=>a+(v?1:0),0)-g0;
  o.aims=aims;return o});
console.log(JSON.stringify(r));
ok(JSON.stringify(r.aims)==='[0,1,2,4]','aiming from 2 m (z=1.5) picks buttons 0,1,2,4 '+JSON.stringify(r.aims));
ok(r.left===-1,'LEFT moves one cell left');ok(r.right===1,'RIGHT moves one cell right');ok(r.rot,'TURN rotates');
ok(r.soft>=8&&r.softAim===3,'holding FASTER soft-drops ('+r.soft+')');ok(r.slow<=1,'release returns to the slow fall ('+r.slow+')');ok(r.slam===2,'SLAM locks the stone');
// auto-repeat and lock-on
r=await ev(()=>{T.open('kiln','a3');const S=T.R.state(),K=S.K;K.piece={c:[[0,0]],col:1,x:3,y:12};K.fallT=0;
  T.at(0,0,1.5);T.run(1,{press:1});const x1=K.piece.x;T.run(30,{press:1});const x2=K.piece.x;
  // slide the aim onto another button while holding: stays locked on LEFT
  T.at(4,0,1.5);T.run(30,{press:1});return {x1,x2,x3:K.piece.x,held:S.held}});
ok(r.x1===2&&r.x2===0&&r.x3===0&&r.held===0,'holding LEFT repeats to the wall and stays locked on that button '+JSON.stringify(r));
// 4. a win and a loss through button presses only, same end results as before
r=await ev(async()=>{const o={};
  for(const mode of ['win','dead']){T.open('kiln','w'+mode);const S=T.R.state(),K=S.K;
    if(mode==='win'){K.cleared=KILN_need()-1;
      // set up one row that a vertical bar of one cell completes: fill row 2 except column 3
      for(let x=0;x<K.W;x++)K.g[2*K.W+x]=x===3?0:2;for(let x=0;x<K.W;x++)K.g[3*K.W+x]=0;K.piece={c:[[0,0]],col:1,x:3,y:10};K.fallT=0}
    else{for(let y=0;y<K.H-3;y++)for(let x=0;x<K.W;x++)K.g[y*K.W+x]=(x+y)%2?2:3;for(let y=0;y<K.H-3;y++)K.g[y*K.W+(y%K.W)]=0;K.piece={c:[[0,0],[1,0]],col:1,x:2,y:K.H-3};K.fallT=0}
    T.press(4,1);T.run(400,{});o[mode]=[T.res&&T.res.k,T.res&&T.res.why,K.over,S.endT>0]}
  return o;function KILN_need(){return T.G.KILN.need}});
console.log(JSON.stringify(r));
ok(r.win[0]==='win'&&r.win[1]==='kiln','win through a SLAM calls the end callback {k:win,why:kiln}');
ok(r.dead[0]==='dead'&&r.dead[1]==='kiln','a full kiln calls {k:dead,why:kiln}');
// ash waits, then rises after the first press
r=await ev(()=>{T.open('kiln','a4');const S=T.R.state(),K=S.K,a=K.ashT;T.press(2,1);const a1=K.ashT;T.run(120,{});return {a,a1,a2:K.ashT,ash:T.G.KILN.ash}});
ok(r.a===r.ash&&r.ash>=20&&r.a2<r.a1,'ash timer ~22s, starts counting after the first press '+JSON.stringify(r));
// 5. snapshot round trip on a watching instance, and garbage
r=await ev(()=>{const o={};T.open('kiln','a5');const S=T.R.state();T.at(3,0.7,1.5);T.run(1,{press:1});T.run(5,{press:1});
  const q=JSON.parse(JSON.stringify(T.R.snap()));o.q={x:q.x,z:q.z,yw:q.yw,pt:q.pt,am:q.am,hd:q.hd,st:q.st};const mine={px:S.px,pz:S.pz,yaw:S.yaw,pitch:S.pitch};
  T.R.abort();T.R.watch('kiln',q);const W=T.R.state();
  for(let i=0;i<120;i++)T.R.update(1/60,T.Z);
  o.pos=[+(W.vx-mine.px).toFixed(2),+(W.vz-mine.pz).toFixed(2),+(W.vyaw-mine.yaw).toFixed(2),+(W.vpitch-mine.pitch).toFixed(2)];o.am=W.aim;o.hd=W.held;o.st=W.started;o.watching=T.R.watching;
  // the watcher produces no input and runs no rules
  const K=W.K,p0=JSON.stringify(K.piece);T.R.update(5,{mx:1,press:1});o.rules=JSON.stringify(K.piece)===p0;
  // smoothing: a new snapshot moves the view gradually
  T.R.sync(Object.assign({},q,{x:q.x+1,yw:q.yw+0.5}));const a0=W.vx;T.R.update(1/60,T.Z);o.smooth=W.vx>a0&&W.vx<q.x+1;
  const junk=[{},{x:'a',z:null,yw:NaN,pt:Infinity,am:'x',hd:1.5,st:'yes'},{x:1e30,z:-1e30,yw:1e30,pt:-1e30,am:99,hd:-7,st:5},{x:[],z:{},yw:'1',pt:[1],am:null,hd:undefined},{g:5,p:7,n:'x',cl:'a',a:'z',f:3,o:'bogus',x:NaN}];
  o.junk=0;for(const j of junk){try{T.R.sync(j);for(let i=0;i<3;i++)T.R.update(1/60,T.Z);o.junk++}catch(e){o.err=String(e)}}
  o.fin=[W.vx,W.vz,W.vyaw,W.vpitch].every(Number.isFinite)&&Math.abs(W.vx)<=6.001&&Math.abs(W.vz)<=7.001&&Math.abs(W.vpitch)<=1.2001&&W.aim>=-1&&W.aim<5&&W.held>=-1&&W.held<5;
  // an old client: no new fields at all
  const old=Object.assign({},q);for(const k of ['x','z','yw','pt','am','hd','st'])delete old[k];T.R.sync(old);T.R.update(1/60,T.Z);o.old=Number.isFinite(W.vx);
  T.R.abort();return o});
console.log(JSON.stringify(r));
ok(r.watching,'watching flag');ok(Math.abs(r.pos[0])<0.05&&Math.abs(r.pos[1])<0.05&&Math.abs(r.pos[2])<0.05&&Math.abs(r.pos[3])<0.05,'watcher view converges to the player pose '+r.pos);
ok(r.am===3&&r.hd===3&&r.st===true,'watcher sees aim, held and started');ok(r.rules,'watcher runs no rules');ok(r.smooth,'watcher camera is smoothed');
ok(r.junk===5&&!r.err,'garbage snapshots do not throw '+(r.err||''));ok(r.fin,'garbage leaves the pose finite and in range');ok(r.old,'snapshot without the new fields is fine');
// 6. layout: the whole glass box stays on screen while aiming at each button, from a natural standing spot
//    (on a portrait phone the two outer buttons only have to keep it fully in view vertically: the screen is too narrow to turn that far and keep it)
for(const [w,h,zs] of [[1280,720,[1.35,1.55,1.8]],[1920,1080,[1.35,1.55,1.8]],[390,844,[1.35,1.55,1.8]],[844,390,[1.35,1.55,1.8]]]){
  r=await ev(([w,h,zs])=>{T.open('kiln','a6');const S=T.R.state(),cam=T.R.cam,d=S.dims,o={worst:0,miss:[]};cam.aspect=w/h;
    for(const z of zs)for(let i=0;i<5;i++){T.at(i,0,z);S.frame();cam.updateProjectionMatrix();cam.updateMatrixWorld();cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      let m=0;for(const sx of [-1,1])for(const y of [d.BY+0.4,d.BY+d.bh]){const v=cam.position.clone().set(sx*d.bw/2,y,d.KZ).project(cam);m=Math.max(m,Math.abs(v.y),w<h&&(i===0||i===4)?0:Math.abs(v.x))}
      o.worst=Math.max(o.worst,m);if(m>1)o.miss.push([i,z,+m.toFixed(2)]);
      T.run(1,{});if(S.aim!==i)o.miss.push(['aim',i,z,S.aim])}
    return o},[w,h,zs]);
  ok(r.worst<=1&&!r.miss.length,`box fully on screen ${w}x${h} (worst ndc ${r.worst.toFixed(2)}) ${JSON.stringify(r.miss.slice(0,4))}`);
}
// 7. galaxy and fall still run to the end
r=await ev(()=>{const o={};for(const k of ['galaxy','fall']){T.open(k,'g'+k);T.run(60*40,{lx:0.2});o[k]=T.res&&T.res.k}return o});
console.log(JSON.stringify(r));ok(r.galaxy==='warp','galaxy finishes (warp)');ok(r.fall==='dead','fall finishes (dead)');
if(errs.length){console.log('console errors:',errs.slice(0,5));bad('console errors')}
await b.close();console.log(fails?'FAILED':'ALL PASSED');process.exit(fails?1:0);
