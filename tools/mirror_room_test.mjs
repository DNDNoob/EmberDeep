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
// open a mirror door on a fresh run (optionally with a given seed); __run fast-forwards the room, __grab walks the crosshair to the can and takes it
const setup=`window.__open=seed=>{const G=window.__game;if(G.state==='room')G.roomLeave();if(G.state!=='play')G.startRun('mirror'+Math.random(),2,true);
  const D=G.F.sdoors[0];D.kind='mirror';D.look='mirror';D.used=false;document.getElementById('toast').textContent='';G.sdoorOpen(D);if(seed!==undefined)G.ROOMS.start('mirror',G.roomEnd,seed);return G.state};
 window.__I=o=>Object.assign({mx:0,my:0,press:0,lx:0,ly:0},o||{});
 window.__seen=new Set();window.__U=I=>{window.__game.ROOMS.update(1/60,I);window.__seen.add(document.getElementById('roomHud').textContent+'|'+document.getElementById('toast').textContent)};
 window.__run=(t,cb)=>{const G=window.__game,S=G.ROOMS.state(),I=window.__I();let n=0;while(S.t<t&&n++<20000&&G.state==='room'){if(cb)cb(S,I);window.__U(I)}return S.t};
 window.__tap=(o)=>{window.__U(window.__I(o));window.__U(window.__I())};
 window.__walk=(n,o)=>{for(let i=0;i<n&&window.__game.state==='room';i++)window.__U(window.__I(o))};
 window.__hop=(o,n)=>{const R=window.__game.ROOMS,S=R.state();let lo=9,hi=0;window.__U(window.__I(Object.assign({jump:1},o)));for(let i=0;i<n;i++){window.__U(window.__I(o));lo=Math.min(lo,R.cam.position.y);hi=Math.max(hi,R.cam.position.y)}return{lo,hi,x:S.px,z:S.pz}};
 window.__enter=S=>{window.__at(0,-1.4,0,0);return window.__hop({my:-1},80)}
 window.__at=(x,z,yaw,pitch)=>{const S=window.__game.ROOMS.state();S.px=x;S.pz=z;S.ux=S.uz=0;window.__look(yaw,pitch)};
 window.__look=(yaw,pitch)=>{const S=window.__game.ROOMS.state();S.yaw=yaw;S.pitch=pitch};
 window.__grab=()=>{const S=window.__game.ROOMS.state();window.__look(S.canAim.yaw,S.canAim.pitch);window.__tap({press:1});return S.held}`;
await pg.evaluate(setup);
const info=()=>pg.evaluate(()=>{const G=window.__game;return{state:G.state,hp:G.P.hp,gems:G.R.gems,xray:G.R.xray,depth:G.R.depth,toast:document.getElementById('toast').textContent,title:document.getElementById('deadTitle').textContent}});
// (a) no words before you hold the can: the toast never changes in the first 30 seconds
{await pg.evaluate(()=>window.__open());const r=await pg.evaluate(()=>{const T=document.getElementById('toast'),seen=new Set();window.__run(30,()=>seen.add(T.textContent));return[...seen]});
 console.log('a silent',JSON.stringify(r));if(r.length!==1||r[0]!=='')bad('a text before the can: '+JSON.stringify(r))}
// (b) aiming: away shows nothing, at the can shows "Pick up", pressing away does nothing, pressing at it takes it
{await pg.evaluate(()=>window.__open());const r=await pg.evaluate(()=>{const S=window.__game.ROOMS.state(),H=document.getElementById('roomHud'),o={};
   window.__look(0,0.02);window.__run(S.t+0.5);o.awayHud=H.textContent;o.awayAim=S.aim;window.__tap({press:1});o.awayHeld=S.held;
   window.__look(S.canAim.yaw,S.canAim.pitch);window.__run(S.t+0.2);o.atHud=H.textContent;o.atAim=S.aim;o.btn=S.btn.join();
   window.__look(S.canAim.yaw+0.5,S.canAim.pitch);window.__run(S.t+0.1);o.offAim=S.aim;
   window.__look(S.canAim.yaw,S.canAim.pitch);window.__run(S.t+0.1);window.__tap({press:1});o.held=S.held;o.canVis=S.can.visible;window.__run(S.t+0.6);o.heldHud=H.textContent;o.handVis=S.hand.visible;return o});
 console.log('b aim',JSON.stringify(r));
 if(r.awayHud!==''||r.awayAim||r.awayHeld)bad('b prompt/pickup while looking away');if(!r.atAim||!/Pick up/.test(r.atHud))bad('b no prompt at the can');if(r.offAim)bad('b aim too wide');
 if(!r.held||r.canVis||!r.handVis)bad('b pickup');if(!/Spray/.test(r.heldHud)||/Pick up/.test(r.heldHud))bad('b held hud')}
// (c) spraying before the smashing: a splat on the glass, nothing else
{await pg.evaluate(()=>window.__open(777));const r=await pg.evaluate(()=>{const G=window.__game,S=G.ROOMS.state(),o={};window.__grab();window.__run(S.t+1);
   window.__look(0,0.1);window.__run(S.t+0.2);window.__tap({press:1});o.n1=S.splats.length;window.__run(S.t+0.1);window.__tap({press:1});o.n2=S.splats.length;window.__run(S.t+1.2);window.__tap({press:1});o.n3=S.splats.length;
   window.__run(S.mir.SMASH-4);o.sm=S.sm;o.ch=S.ch;o.bt=S.bt;o.state=G.state;o.sel=S.sel;o.hurt=G.P.hp;return o});
 console.log('c early spray',JSON.stringify(r));if(r.n1!==1||r.n2!==1||r.n3!==2)bad('c splats/cooldown '+[r.n1,r.n2,r.n3]);if(r.sm!==0||r.ch!==0||r.bt>=0||r.state!=='room')bad('c something happened')}
// (d) the thumb: nothing ends by itself any more; you are free in the room
{await pg.evaluate(()=>window.__open());
 const r=await pg.evaluate(()=>{const G=window.__game,S=G.ROOMS.state();window.__grab();window.__run(S.mir.CHOICE+0.3);S.pick(2);window.__run(S.ct+12.5);window.__look(1.5,0);window.__run(S.t+0.1);const o={fr:S.fr,hud:document.getElementById('roomHud').textContent};window.__run(S.t+90);o.state=G.state;o.toast=document.getElementById('toast').textContent;o.gb=S.gb;return o});
 console.log('d thumb',JSON.stringify(r));if(!r.fr)bad('d not free');if(r.state!=='room')bad('d auto finished '+r.state);if(/glass|break/i.test(r.hud))bad('d hint tells about the glass '+r.hud);if(r.gb>=0)bad('d glass broke by itself')}
// (e) spraying the monster still kills you
{await pg.evaluate(()=>window.__open());await pg.evaluate(()=>{const S=window.__game.ROOMS.state();window.__grab();window.__run(S.mir.CHOICE+0.3);window.__game.ROOMS.state().pick(1);window.__run(S.t+120)});
 const r=await info();console.log('e spray',JSON.stringify(r));if(r.state!=='dead'||r.hp>0)bad('e not dead');if(r.xray)bad('e xray after death')}
// (f) never taking the can: it breaks through on its own
{await pg.evaluate(()=>window.__open());await pg.evaluate(()=>{window.__run(200)});
 const r=await info();console.log('f idle',JSON.stringify(r));if(r.state!=='dead'||r.hp>0)bad('f not dead')}
// looking away is slower than staring
const brk=async yaw=>{await pg.evaluate(()=>window.__open(5));return pg.evaluate(yaw=>{const S=window.__game.ROOMS.state();S.yaw=yaw;S.pitch=0;window.__run(130,(S)=>{S.yaw=yaw;S.pitch=0});return S.bt},yaw)};
{const stare=await brk(0),away=await brk(Math.PI);console.log('g break time stare',stare,'away',away);if(!(stare>0)||!(away>stare+8))bad('g away not slower: '+stare+' vs '+away)}
// the choice only unlocks after the smashing has started (and only once you hold the can); keyboard select needs left/right then confirm
{await pg.evaluate(()=>window.__open());const r=await pg.evaluate(()=>{const G=window.__game,S=G.ROOMS.state();window.__grab();window.__run(S.mir.SMASH-3);const early=S.live;window.__run(S.mir.CHOICE+0.3);
   const noSel=(()=>{window.__tap({press:1});return S.ch})();
   window.__tap({mx:1});const mv=S.sel;window.__tap({sr:1});const s1=S.sel;window.__tap({sl:1});const s0=S.sel;window.__tap({tab:1});const st=S.sel;window.__tap({press:1});return{early,noSel,ch:S.ch,sel:S.sel,mv,s1,s0,st}});
 console.log('keyboard',JSON.stringify(r));if(r.early||r.noSel!==0||r.ch!==2||r.mv!==-1||r.s1!==1||r.s0!==0||r.st!==1)bad('keyboard choice')
 {const k=await pg.evaluate(()=>{window.__open();const S=window.__game.ROOMS.state();window.__grab();window.__run(S.mir.CHOICE+0.3);window.__tap({k2:1});return S.ch});if(k!==2)bad('key 2 picks thumb '+k)}}

// (k) walking: the view moves, walls and the intact glass stop you, the stool and crates are solid
{await pg.evaluate(()=>window.__open(5));const r=await pg.evaluate(()=>{const G=window.__game,R=G.ROOMS,S=R.state(),o={};
   window.__look(0,0);const c0=R.cam.position.x+','+R.cam.position.z;window.__walk(30,{my:-1});o.moved=S.pz;o.camMoved=c0!==R.cam.position.x+','+R.cam.position.z;
   window.__walk(400,{my:-1});o.glass=S.pz;o.camZ=R.cam.position.z;window.__walk(400,{mx:-1});o.left=S.px;window.__walk(400,{mx:1});o.right=S.px;
   window.__at(0,0.1,Math.PI,0);window.__walk(500,{my:-1});o.back=S.pz;
   window.__at(0,0.1,0,0);window.__walk(40,{my:-1,mx:1});o.strafe=[S.px>0.1,S.pz<0.1];
   window.__at(S.canC[0],0.5,0,0);window.__walk(200,{my:-1});o.stool=Math.hypot(S.px-S.canC[0],S.pz-S.canC[2]);
   o.eye=R.cam.position.y;return o});
 console.log('k walk',JSON.stringify(r));if(!(r.moved<0.1)||!r.camMoved)bad('k did not move');if(r.glass<-1.75||r.glass>-1.65)bad('k glass '+r.glass);if(r.left<-2.09)bad('k wall L '+r.left);if(r.right>2.09||r.right<0)bad('k wall R '+r.right);if(r.back>2.6)bad('k back wall '+r.back);if(!r.strafe[0]||!r.strafe[1])bad('k strafe');if(r.stool<0.2)bad('k stool '+r.stool);if(r.eye<1.5||r.eye>1.7)bad('k eye '+r.eye)}
// (l) walk up to the can and pick it up from the new spot
{await pg.evaluate(()=>window.__open(777));const r=await pg.evaluate(()=>{const R=window.__game.ROOMS,S=R.state(),o={};window.__at(-0.6,1.0,0,0);window.__look(S.canAim.yaw,S.canAim.pitch);window.__walk(40,{my:-1});window.__look(S.canAim.yaw,S.canAim.pitch);
   window.__run(S.t+0.1);o.aim=S.aim;o.tg=S.tg;o.hud=document.getElementById('roomHud').textContent;o.far=(()=>{window.__at(-0.6,2.0,-1.0,0.3);window.__run(S.t+0.1);return S.aim})();
   window.__look(S.canAim.yaw,S.canAim.pitch);window.__at(S.px,S.pz,S.canAim.yaw,S.canAim.pitch);window.__at(-0.2,0.2,S.canAim.yaw,S.canAim.pitch);window.__look(S.canAim.yaw,S.canAim.pitch);window.__run(S.t+0.1);window.__tap({press:1});o.held=S.held;return o});
 console.log('l pickup',JSON.stringify(r));if(!r.aim||r.tg!=='can'||!/Pick up/.test(r.hud)||!r.held)bad('l pickup after walking');if(r.far)bad('l aim far')}
// (m) after the thumb: 3 blows break the glass, you can walk into the parlor
const free=`window.__free=(seed)=>{window.__open(seed);const S=window.__game.ROOMS.state();window.__grab();window.__run(S.mir.CHOICE+0.3);S.pick(2);window.__run(S.ct+12.5);return S}`;
await pg.evaluate(free);
{const r=await pg.evaluate(()=>{const G=window.__game,R=G.ROOMS,H=document.getElementById('roomHud'),o={};
   o.blind=(()=>{window.__open(31);const S2=R.state();window.__grab();window.__run(S2.mir.CHOICE+0.3);S2.pick(2);window.__run(S2.ct+3);const a=S2.pz;window.__look(0,0);window.__walk(30,{my:-1});const slow=a-S2.pz;
     window.__open(31);const S3=R.state();window.__grab();window.__run(S3.mir.CHOICE+0.3);S3.pick(2);window.__run(S3.ct+12.5);const b=S3.pz;window.__look(0,0);window.__walk(30,{my:-1});return[slow,b-S3.pz]})();
   const S4=window.__free(31);window.__at(0,-0.6,0,0.05);window.__run(S4.t+0.1);o.glassHud=H.textContent;o.tg=S4.tg;
   window.__tap({press:1});o.b1=S4.fb;window.__run(S4.t+0.3);window.__tap({press:1});o.b2=S4.fb;o.brokeEarly=S4.gb>=0;window.__run(S4.t+0.3);window.__tap({press:1});o.b3=S4.fb;o.gb=S4.gb>=0;o.state=G.state;
   window.__run(S4.t+0.3);o.shards=S4.shards.visible;
   // the sill: walking into the frame only blocks; a jump while moving forward carries you into the parlor, and a jump back returns you
   window.__at(0,-1.0,0,0);window.__walk(200,{my:-1});o.blockZ=S4.pz;o.blockSt=S4.st;
   window.__walk(60,{my:0});
   window.__at(0,-1.4,0,0);const h=window.__hop({my:-1},80);o.hop=h;o.z=S4.pz;o.st=S4.st;o.eyeAfter=R.cam.position.y;o.apex=h.hi-h.lo;
   window.__walk(200,{my:-1});o.far=S4.pz;window.__walk(200,{mx:1});o.wallX=S4.px;
   window.__at(0,-3.0,Math.PI,0);window.__walk(200,{my:-1});o.backBlock=S4.pz;const h2=window.__hop({my:-1},80);o.back=S4.pz;o.hop2=h2;
   window.__at(0,-1.4,0,0);let mx=0;window.__hop({my:-1},12);for(let i=0;i<90;i++){window.__U(window.__I({jump:1}));mx=Math.max(mx,R.cam.position.y)}o.maxEye=mx;
   o.state2=G.state;return o});
 console.log('m break',JSON.stringify(r));
 if(!(r.blind[0]<r.blind[1]*0.8&&r.blind[0]>0))bad('m blind not slower '+r.blind);if(r.tg!=='glass'||/break|glass/i.test(r.glassHud))bad('m aim/prompt '+r.tg+' '+r.glassHud);if(r.b1!==1||r.b2!==2||r.brokeEarly)bad('m blows '+[r.b1,r.b2]);if(r.b3!==3||!r.gb||!r.shards)bad('m third blow');if(r.state!=='room'||r.state2!=='room')bad('m ended');
 if(!(r.blockZ>-1.72)||r.blockSt)bad('m walked over the sill '+r.blockZ+' '+r.blockSt);if(!(r.z<-2.4)||!r.st)bad('m jump did not carry through '+r.z);if(!(r.apex>0.6&&r.apex<1.0)||Math.abs(r.eyeAfter-1.6)>0.1)bad('m jump arc '+r.apex+' '+r.eyeAfter);
 if(!(r.backBlock<-2.3))bad('m walked back over the sill '+r.backBlock);if(!(r.back>-1.75))bad('m jump back '+r.back);if(!(r.maxEye<3.3))bad('m head through the ceiling '+r.maxEye);
 if((await pg.evaluate(()=>[...window.__seen])).some(t=>/break/i.test(t)))bad('m text about breaking');if(r.far<-6.6)bad('m parlor wall '+r.far);if(r.wallX>3.5)bad('m side wall '+r.wallX)}
// (n) leaving by the door after walking back from the parlor wins
{const g0=(await info()).gems;const r=await pg.evaluate(()=>{const G=window.__game,R=G.ROOMS,S=window.__free(32),H=document.getElementById('roomHud'),o={};
   window.__at(0,-0.6,0,0.05);for(let i=0;i<3;i++){window.__tap({press:1});window.__run(S.t+0.3)}window.__enter(S);o.in=S.st;
   window.__at(-0.4,1.0,Math.PI,0);window.__run(S.t+0.1);o.hud=H.textContent;o.tg=S.tg;window.__tap({press:1});window.__run(S.t+1.5);o.state=G.state;o.toast=document.getElementById('toast').textContent;return o});
 const i2=await info();console.log('n leave',JSON.stringify(r),i2.gems-g0);if(!r.in)bad('n did not step in');if(r.tg!=='door'||!/Leave/.test(r.hud))bad('n leave prompt '+r.hud);if(r.state!=='play'||r.toast!=='You got lucky son.')bad('n not won '+r.state+' '+r.toast);if(!(i2.xray>0))bad('n xray');if(i2.gems-g0<=0)bad('n gems')}
// (o) the eggs: the lamp reveals the watcher (once-only knock, no prompt on the little mirror); the monster's door is locked; the book pays 5 gems once; leaving after all still wins
{const g0=(await info()).gems;const r=await pg.evaluate(()=>{const G=window.__game,R=G.ROOMS,S=window.__free(33),H=document.getElementById('roomHud'),T=document.getElementById('toast'),o={};
   window.__at(0,-0.6,0,0.05);for(let i=0;i<3;i++){window.__tap({press:1});window.__run(S.t+0.3)}window.__enter(S);o.in=S.st;
   const m=S.mini,n=m[0]<-3?[1,0]:m[0]>3?[-1,0]:[0,1],yw=Math.atan2(-n[0],n[1]);
   // the little mirror itself says nothing, lit or dark
   window.__at(m[0]+n[0]*1.2,m[1]+n[1]*1.2,yw,-0.05);window.__run(S.t+0.5);o.mTg=S.tg;o.mHud=H.textContent;o.rv0=S.reveal();
   // the lamp: aim from a metre away
   const L=S.lampAt,sx=L[0]<0?1:-1,lyaw=Math.atan2(-sx,0);
   window.__at(L[0]+sx*1.0,L[1],lyaw,-0.1);window.__run(S.t+0.2);o.lTg=S.tg;o.lHud=H.textContent;
   window.__at(L[0]+sx*2.5,L[1],lyaw,-0.1);window.__run(S.t+0.2);o.lFar=S.tg;
   window.__at(L[0]+sx*1.0,L[1],lyaw,-0.1);window.__run(S.t+0.2);window.__tap({press:1});window.__run(S.t+1.0);o.off=S.lamp;o.rvOff=S.reveal();o.lHud2=H.textContent;
   // up close in the dark it knocks, once
   window.__at(m[0]+n[0]*1.2,m[1]+n[1]*1.2,yw,-0.05);window.__run(S.t+2.0);o.knock1=S.knocks||0;
   window.__at(m[0]+n[0]*3,m[1]+n[1]*3,yw,-0.05);window.__run(S.t+0.5);window.__at(m[0]+n[0]*1.0,m[1]+n[1]*1.0,yw,-0.05);window.__run(S.t+1.5);o.knock2=S.knocks||0;
   // lamp back on: opaque again
   window.__at(L[0]+sx*1.0,L[1],lyaw,-0.1);window.__run(S.t+0.2);window.__tap({press:1});window.__run(S.t+1.0);o.on=S.lamp;o.rvOn=S.reveal();
   window.__tap({press:1});window.__run(S.t+1.0);o.rvOff2=S.reveal();window.__tap({press:1});window.__run(S.t+1.0);o.knock3=S.knocks||0;
   // the monster's door: "Open" when aimed, and it is locked
   const DX=S.layout.DX;window.__at(DX,-6.2,0,0);window.__run(S.t+0.2);o.dTg=S.tg;o.dHud=H.textContent;const rot0=S.door.rotation.y;
   T.textContent='';window.__tap({press:1});o.say=T.textContent;window.__run(S.t+0.3);window.__tap({press:1});o.locks1=S.locks;window.__run(S.t+1.5);window.__tap({press:1});o.locks2=S.locks;window.__run(S.t+1.5);o.rot=[rot0,S.door.rotation.y];
   window.__at(DX,-4.8,0,0);window.__run(S.t+0.2);o.dFar=S.tg;
   const b=S.book;window.__at(b[0],b[1]+1.0,0,0);window.__look(0,-Math.atan2(0.8,1.0));window.__run(S.t+0.1);o.bTg=S.tg;o.bHud=H.textContent;
   const g2=G.R.gems,w2=G.wallet;window.__tap({press:1});o.read=H.textContent;o.gained=G.R.gems-g2;o.walletGain=G.wallet-w2;o.toast=T.textContent;
   window.__tap({press:1});o.closed=H.textContent;window.__tap({press:1});window.__tap({press:1});o.gained2=G.R.gems-g2;
   window.__at(-0.4,1.0,Math.PI,0);window.__run(S.t+0.1);window.__tap({press:1});window.__run(S.t+1.5);o.state=G.state;o.seen=[...window.__seen];return o});
 const i2=await info();console.log('o eggs',JSON.stringify(Object.assign({},r,{read:r.read.slice(0,40),seen:r.seen.length})),i2.gems-g0);
 if(!r.in)bad('o not in');if(r.mTg==='tiny'||r.mHud!==''||r.rv0>0.02)bad('o mirror prompt/reveal while lit '+r.mTg+' '+r.mHud+' '+r.rv0);
 if(r.lTg!=='lamp'||!/Turn off/.test(r.lHud)||!/E or click/.test(r.lHud))bad('o lamp prompt '+r.lTg+' '+r.lHud);if(r.lFar==='lamp')bad('o lamp prompt too far');
 if(r.off!==0||!(r.rvOff>0.95)||!/Turn on/.test(r.lHud2))bad('o lamp off '+r.off+' '+r.rvOff+' '+r.lHud2);if(r.knock1!==1||r.knock2!==1||r.knock3!==1)bad('o knock '+[r.knock1,r.knock2,r.knock3]);
 if(r.on!==1||!(r.rvOn<0.05)||!(r.rvOff2>0.95))bad('o lamp back on '+r.on+' '+r.rvOn+' '+r.rvOff2);
 if(r.dTg!=='mdoor'||!/Open/.test(r.dHud))bad('o door prompt '+r.dTg+' '+r.dHud);if(r.say!=="It's locked.")bad('o locked text '+r.say);if(r.locks1!==1||r.locks2!==2)bad('o door cooldown '+[r.locks1,r.locks2]);if(Math.abs(r.rot[1]-r.rot[0])>1e-6)bad('o door moved '+r.rot);if(r.dFar==='mdoor')bad('o door prompt too far');
 if(r.bTg!=='book'||!/Read/.test(r.bHud))bad('o book prompt '+r.bTg+r.bHud);if(r.gained!==5||r.walletGain!==5)bad('o book gems '+r.gained);if(!/Thank you for not looking/.test(r.read))bad('o note text');if(r.closed.includes('Thank you'))bad('o not closed');if(r.gained2!==5)bad('o book paid twice '+r.gained2);if(r.toast!=='+5 gems tucked in the book.')bad('o toast '+r.toast);
 if(r.seen.some(t=>/break/i.test(t)))bad('o text about breaking');if(r.state!=='play')bad('o not won after eggs');if(i2.gems-g0!==5+2+i2.depth)bad('o gems total '+(i2.gems-g0))}
// (q) controls: Space jumps and no longer interacts (E does), the jump has the maze's arc, a snapshot carries the lamp and the jump
{const r=await pg.evaluate(()=>{const G=window.__game,R=G.ROOMS,o={};window.__open(41);const S=R.state();
   G.keys.Space=true;const a=G.roomInput();G.keys.Space=false;G.keys.KeyE=true;const b=G.roomInput();G.keys.KeyE=false;o.space=[a.press,a.jump];o.e=[b.press,b.jump];
   window.__look(S.canAim.yaw,S.canAim.pitch);window.__run(S.t+0.2);window.__tap({jump:1});o.heldBySpace=S.held;window.__walk(60,{});
   const e0=R.cam.position.y;let hi=0,air=0;window.__U(window.__I({jump:1}));for(let i=0;i<60;i++){window.__U(window.__I());hi=Math.max(hi,R.cam.position.y-e0);if(S.jy>0.01)air++}o.apex=hi;o.air=air;o.land=R.cam.position.y-e0;
   window.__grab();o.heldByE=S.held;
   const S2=window.__free(42);window.__at(0,-0.6,0,0.05);for(let i=0;i<3;i++){window.__tap({press:1});window.__run(S2.t+0.3)}window.__enter(S2);const L=S2.lampAt,sx=L[0]<0?1:-1;window.__at(L[0]+sx,L[1],Math.atan2(-sx,0),-0.1);window.__run(S2.t+0.2);window.__tap({press:1});window.__run(S2.t+0.5);
   window.__U(window.__I({jump:1}));window.__walk(8,{});const q=R.snap();o.snap=[q.lo,q.jy,q.kn];
   G.roomLeave();R.abort();R.watch('mirror',q);const W=R.state();for(let i=0;i<40;i++)R.update(1/60,window.__I());o.w=[W.lamp,W.reveal()>0.9,W.jy>0.05];
   for(const g of [{lo:7,jy:'x',kn:'z'},{lo:'a',jy:1e9},{jy:-4,lo:null},{jy:NaN}]){R.sync(g)}for(let i=0;i<60;i++)R.update(1/60,window.__I());o.ok=isFinite(W.jy)&&W.jy>=0&&W.jy<=2;R.abort();return o});
 console.log('q controls',JSON.stringify(r));
 if(r.space[0]||!r.space[1])bad('q Space should jump, not press '+r.space);if(!r.e[0])bad('q E should press '+r.e);if(r.heldBySpace)bad('q Space picked up the can');if(!r.heldByE)bad('q E did not pick up');
 if(!(r.apex>1.35&&r.apex<1.6)||!(r.air>=30&&r.air<=45)||Math.abs(r.land)>0.08)bad('q jump arc '+r.apex+' '+r.air+' '+r.land);if(r.snap[0]!==0||!(r.snap[1]>0))bad('q snap '+r.snap);if(r.w[0]!==0||!r.w[1])bad('q watcher lamp '+r.w);if(!r.ok)bad('q garbage jump')}
// (p) every seed places the little mirror on a wall and builds without throwing
{const r=await pg.evaluate(()=>{const G=window.__game,out=new Set();let bad=0;for(let sd=1;sd<=40;sd++){window.__open(sd);const S=G.ROOMS.state(),m=S.mini;if(!m||!(Math.abs(m[0])===3.7||m[1]===-6.8))bad++;else out.add(Math.abs(m[0])===3.7?(m[0]<0?'L':'R'):'F')}G.ROOMS.abort();return{bad,sides:[...out].sort()}});
 console.log('p mini',JSON.stringify(r));if(r.bad)bad('p placement');if(r.sides.length<2)bad('p sides '+r.sides)}
// (h) seeds: different visits differ, the same seed matches, a watcher follows the seed it is sent
{const r=await pg.evaluate(()=>{const G=window.__game,out={n:new Set(),door:new Set(),wall:new Set(),seat:new Set(),roles:new Set(),sv:new Set()};
   const get=sd=>{window.__open(sd);const S=G.ROOMS.state();return{cast:JSON.stringify(S.cast),lay:JSON.stringify(S.layout),n:S.cast.length,S}};
   const A=get(11),B=get(12),A2=get(11);out.sameSeed=A.cast===A2.cast&&A.lay===A2.lay;out.diff=A.cast!==B.cast&&A.lay!==B.lay;
   for(let sd=1;sd<=60;sd++){const g=get(sd),S=g.S;out.n.add(g.n);out.door.add(S.layout.DX);out.wall.add(S.layout.wall);out.seat.add(S.layout.seat);for(const c of S.cast){out.roles.add(c.role);if(c.sv)out.sv.add(c.sv)}
     if(S.mir.ENTER<16.7||S.mir.ENTER>18.3||S.mir.K.length!==g.n)out.badTime=[sd,S.mir.ENTER];for(let i=0;i<40;i++)G.ROOMS.update(1/60,window.__I())}
   // a watcher built for one seed is rebuilt when a snapshot of another arrives
   window.__open(21);const Sa=G.ROOMS.state();window.__run(8);const qa=G.ROOMS.snap();window.__open(22);const Sb=G.ROOMS.state();window.__run(8);const qb=G.ROOMS.snap();const cb=JSON.stringify(Sb.cast);
   G.roomLeave();G.ROOMS.abort();G.ROOMS.watch('mirror',qa);const W1=G.ROOMS.state();out.w1=W1.seed===21&&JSON.stringify(W1.cast)===JSON.stringify(Sa.cast);
   G.ROOMS.sync(qb);const W2=G.ROOMS.state();out.w2=W2.seed===22&&JSON.stringify(W2.cast)===cb;out.wt=W2.t;
   for(const bad_ of [{sd:'x'},{sd:1.5},{sd:-3},{sd:1e12},{sd:NaN},{sd:null}]){const o=G.ROOMS.state();G.ROOMS.sync(Object.assign({},qb,bad_));if(G.ROOMS.state()!==o)out.rebuiltOnJunk=true}
   G.ROOMS.abort();return{sameSeed:out.sameSeed,diff:out.diff,n:[...out.n].sort(),door:[...out.door],wall:out.wall.size,seat:[...out.seat],roles:[...out.roles],sv:[...out.sv],badTime:out.badTime,w1:out.w1,w2:out.w2,wt:out.wt,rebuiltOnJunk:out.rebuiltOnJunk}});
 console.log('h seeds',JSON.stringify(r));
 if(!r.sameSeed)bad('h same seed differs');if(!r.diff)bad('h seeds equal');if(r.n.join()!=='2,3,4')bad('h cast sizes '+r.n);if(r.door.length<3)bad('h doors '+r.door);if(r.wall<4)bad('h wallpapers');if(r.seat.length<2)bad('h seats');if(r.roles.length<4)bad('h roles');if(r.sv.length<4)bad('h variants '+r.sv);if(r.badTime)bad('h timing '+r.badTime);
 if(!r.w1||!r.w2)bad('h watcher seed '+r.w1+' '+r.w2);if(r.rebuiltOnJunk)bad('h junk seed rebuilt the room')}
// (i) watcher: snapshot round trip and garbage
{const r=await pg.evaluate(()=>{const G=window.__game,R=G.ROOMS;const out={};
   G.startRun('mirrorw',2,true);const D=G.F.sdoors[0];D.kind='mirror';D.look='mirror';D.used=false;G.sdoorOpen(D);
   const S=R.state();window.__grab();window.__run(S.mir.CHOICE+0.4);window.__look(0,0.1);S.pick(2);window.__run(S.t+4);
   const q=R.snap();out.q=q;R.abort();G.roomLeave();
   try{R.watch('mirror',q);const W=R.state();out.wt=W.t;out.wch=W.ch;out.watching=R.watching;out.held=W.held;
     for(const g of [{t:'x'},{t:NaN,yaw:Infinity},{yaw:{},pitch:'a',sel:9,ch:7,ct:-5,bt:'z',sm:null,hd:'y',sp:'q'},{sp:[[1,2],[NaN,0,0,0],[9,9,9,9],5,null]},{em:9,et:'x',eb:-3,fb:99,px:'z',pz:1e9,bp:'q'},{em:2,et:1e9,eb:7,fb:-1},{em:3,et:5,eb:1,fb:3,px:0,pz:-5},null,5,'s',{t:1e9,sm:1e9},{t:-50}])R.sync(g);
     R.update(1/60,{mx:0,my:0,press:0,lx:0,ly:0});out.t2=R.state().t;out.snap2=R.snap();out.ok=true}catch(e){out.err=String(e)}
   R.abort();return out});
 console.log('i watcher',JSON.stringify({wt:r.wt,wch:r.wch,held:r.held,watching:r.watching,t2:r.t2,err:r.err}));
 if(r.err||!r.ok)bad('i threw '+r.err);if(!(Math.abs(r.wt-r.q.t)<0.3))bad('i t round trip '+r.wt+' vs '+r.q.t);if(r.wch!==2||!r.held)bad('i choice not replayed');if(!isFinite(r.t2))bad('i garbage broke time')}
// (j) the burning eyes: a creature behind one wall shows, behind two and far does not, and a straight line of sight is left to the normal view
{const r=await pg.evaluate(()=>{const G=window.__game;G.startRun('xray-fixed',2,true);const F=G.F,W=F.W,H=F.H,out={};
   G.R.xray=G.R.depth;const at=(px,pz,mx,mz)=>{G.P.x=px;G.P.z=pz;G.P.down=false;G.onTileChange();F.shades.length=0;F.shades.push({type:0,x:mx,z:mz,state:0,stun:0});G.XR.t=0;G.xrayTick(0);return G.XR.list.length};
   const open=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&F.g[y*W+x]===0;let one=null,two=null,near=null,vis=null,far=null;
   for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){if(!open(x,y))continue;
     for(let dx=1;dx<=12;dx++){const x2=x+dx;if(!open(x2,y))continue;const px=x+0.5,pz=y+0.5,mx=x2+0.5,w=G.wallsBetween(px,pz,mx,pz),clear=!(()=>{for(let i=1;i<dx*5;i++)if(G.solidAt(px+(mx-px)*i/(dx*5),pz))return true;return false})();
       G.P.x=px;G.P.z=pz;G.onTileChange();const ds=F.dist[y*W+x2];
       if(!one&&w===1&&dx<=4)one=[px,pz,mx,pz];if(!two&&w>=2&&dx<=8&&(ds<0||ds>6))two=[px,pz,mx,pz];if(!far&&w===1&&dx>=13)far=[px,pz,mx,pz];if(!vis&&clear&&dx>=3)vis=[px,pz,mx,pz]}}
   out.found=[!!one,!!two,!!vis];
   if(one)out.one=at(...one);if(two)out.two=at(...two);if(vis)out.vis=at(...vis);
   // a mob 13+ tiles away through a single wall is too far: build it by hand on an open row
   out.xrayOff=(()=>{G.R.xray=0;const n=one?at(...one):-1;G.R.xray=G.R.depth;return n})();
   // around a corner within six steps counts even with two walls in the line
   let corner=null;for(let y=1;y<H-1&&!corner;y++)for(let x=1;x<W-1&&!corner;x++){if(!open(x,y))continue;G.P.x=x+0.5;G.P.z=y+0.5;G.onTileChange();
     for(let y2=Math.max(1,y-5);y2<Math.min(H-1,y+6)&&!corner;y2++)for(let x2=Math.max(1,x-5);x2<Math.min(W-1,x+6);x2++){if(!open(x2,y2))continue;const ds=F.dist[y2*W+x2];if(ds<2||ds>6)continue;
       const mx=x2+0.5,mz=y2+0.5;if(G.wallsBetween(x+0.5,y+0.5,mx,mz)>=2){let ok=true;const n=40;for(let i=1;i<n;i++)if(G.solidAt(x+0.5+(mx-x-0.5)*i/n,y+0.5+(mz-y-0.5)*i/n)){ok=false;break}if(!ok){corner=[x+0.5,y+0.5,mx,mz];break}}}}
   if(corner)out.corner=at(...corner);out.cornerFound=!!corner;return out});
 console.log('j xray',JSON.stringify(r));
 if(!r.found[0]||!r.found[1])bad('j no test geometry '+r.found);if(r.one!==1)bad('j one wall not shown');if(r.two!==0)bad('j two walls shown');if(r.vis!==0)bad('j straight line flagged');if(r.xrayOff!==0)bad('j shown without the reward');if(r.cornerFound&&r.corner!==1)bad('j corner not shown')}
// New kinds can be appended without changing the order of existing doors.
{const o=await pg.evaluate(()=>window.__game.doorOrder());console.log('order',o.join(','));if(o.slice(0,6).join()!=='galaxy,kiln,fall,mirror,theater,monoliths')bad('registry order')}
if(errs.length){console.log('console errors:',errs.slice(0,5));bad('console errors')}
await b.close();console.log(fails?'FAILED':'ALL PASSED');process.exit(fails?1:0);
