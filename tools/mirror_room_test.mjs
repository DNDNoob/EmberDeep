// node tools/mirror_room_test.mjs  -- plays the one-way mirror room through its endings (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch(),pg=await b.newPage(),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)};
// open a mirror door on a fresh run; returns after the room has started
const setup=`window.__open=()=>{const G=window.__game;if(G.state==='room')G.roomLeave();if(G.state!=='play')G.startRun('mirror'+Math.random(),2,true);
  const D=G.F.sdoors[0];D.kind='mirror';D.look='mirror';D.used=false;window.__says=[];window.__ends=[];G.sdoorOpen(D);return G.state};
 window.__run=(t,cb)=>{const G=window.__game,S=G.ROOMS.state(),I={l:0,r:0,d:0,rot:0,drop:0,lx:0,ly:0};let n=0;while(S.t<t&&n++<20000&&G.state==='room'){if(cb)cb(S,I);G.ROOMS.update(1/60,I)}return S.t}`;
await pg.evaluate(setup);
const info=()=>pg.evaluate(()=>{const G=window.__game;return{state:G.state,hp:G.P.hp,gems:G.R.gems,toast:document.getElementById('toast').textContent,title:document.getElementById('deadTitle').textContent}});
// (a) thumb
{await pg.evaluate(()=>window.__open());const g0=(await info()).gems;
 await pg.evaluate(()=>{window.__run(34);window.__game.ROOMS.state().pick(2);window.__run(120)});
 const r=await info();console.log('a thumb',JSON.stringify(r),'gems before',g0);
 if(r.state!=='play')bad('a state '+r.state);if(r.hp<=0)bad('a hp');if(r.gems<=g0)bad('a gems');if(r.toast!=='You got lucky son.')bad('a toast '+r.toast)}
// (b) spray
{await pg.evaluate(()=>window.__open());await pg.evaluate(()=>{window.__run(34);window.__game.ROOMS.state().pick(1);window.__run(120)});
 const r=await info();console.log('b spray',JSON.stringify(r));if(r.state!=='dead'||r.hp>0)bad('b not dead')}
// (c) no choice
{await pg.evaluate(()=>window.__open());const t=await pg.evaluate(()=>{window.__run(200);return window.__game.ROOMS.state()?window.__game.ROOMS.state().t:-1});
 const r=await info();console.log('c idle',JSON.stringify(r));if(r.state!=='dead'||r.hp>0)bad('c not dead')}
// (d) looking away is slower than staring
const brk=async yaw=>{await pg.evaluate(()=>window.__open());return pg.evaluate(yaw=>{const S=window.__game.ROOMS.state();S.yaw=yaw;S.pitch=0;window.__run(130,(S)=>{S.yaw=yaw;S.pitch=0});return S.bt},yaw)};
{const stare=await brk(0),away=await brk(Math.PI);console.log('d break time stare',stare,'away',away);if(!(stare>0)||!(away>stare+8))bad('d away not slower: '+stare+' vs '+away)}
// the choice only unlocks after the smashing has started, and keyboard select needs left/right then confirm
{await pg.evaluate(()=>window.__open());const r=await pg.evaluate(()=>{const S=window.__game.ROOMS.state();window.__run(20);const early=S.ch;const I={l:0,r:0,d:0,rot:0,drop:0,lx:0,ly:0};window.__run(33);
   const G=window.__game;G.ROOMS.update(1/60,Object.assign({},I,{drop:1}));G.ROOMS.update(1/60,I);const noSel=S.ch;
   G.ROOMS.update(1/60,Object.assign({},I,{r:1}));G.ROOMS.update(1/60,I);G.ROOMS.update(1/60,Object.assign({},I,{rot:1}));G.ROOMS.update(1/60,I);return{early,noSel,ch:S.ch,sel:S.sel}});
 console.log('keyboard',JSON.stringify(r));if(r.early!==0||r.noSel!==0||r.ch!==2)bad('keyboard choice')}
// (e) watcher: snapshot round trip and garbage
{const r=await pg.evaluate(()=>{const G=window.__game,R=G.ROOMS;G.roomLeave&&0;const out={};
   G.startRun('mirrorw',2,true);const D=G.F.sdoors[0];D.kind='mirror';D.look='mirror';D.used=false;G.sdoorOpen(D);
   const S=R.state();let I={l:0,r:0,d:0,rot:0,drop:0,lx:0,ly:0};while(S.t<36)R.update(1/60,I);S.pick(2);while(S.t<40)R.update(1/60,I);
   const q=R.snap();out.q=q;R.abort();G.roomLeave();
   try{R.watch('mirror',q);const W=R.state();out.wt=W.t;out.wch=W.ch;out.watching=R.watching;
     for(const g of [{t:'x'},{t:NaN,yaw:Infinity},{yaw:{},pitch:'a',sel:9,ch:7,ct:-5,bt:'z',sm:null},null,5,'s',{t:1e9,sm:1e9},{t:-50}])R.sync(g);
     R.update(1/60,{l:0,r:0,d:0,rot:0,drop:0,lx:0,ly:0});out.t2=R.state().t;out.snap2=R.snap();out.ok=true}catch(e){out.err=String(e)}
   R.abort();return out});
 console.log('e watcher',JSON.stringify({wt:r.wt,wch:r.wch,watching:r.watching,t2:r.t2,err:r.err}));
 if(r.err||!r.ok)bad('e threw '+r.err);if(!(Math.abs(r.wt-r.q.t)<0.3))bad('e t round trip '+r.wt+' vs '+r.q.t);if(r.wch!==2)bad('e choice not replayed');if(!isFinite(r.t2))bad('e garbage broke time')}
// a mirror door is visible in the registry order
{const o=await pg.evaluate(()=>window.__game.doorOrder());console.log('order',o.join(','));if(o.join()!=='galaxy,kiln,fall,mirror')bad('registry order')}
if(errs.length){console.log('console errors:',errs.slice(0,5));bad('console errors')}
await b.close();console.log(fails?'FAILED':'ALL PASSED');process.exit(fails?1:0);
