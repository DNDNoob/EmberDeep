// node tools/theater_room_test.mjs  -- the picture house: door, story states, mic rules, insults, exit, achievement, guiding light, YouTube path (stubbed) (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import http from 'node:http';
import {heardPhrase,INSULTS,THEATER_VIDEOS,TH} from '../src/theater.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)},ok=(c,m)=>{if(!c)bad(m);else console.log('ok  ',m)};
// ---- pure bits
ok(heardPhrase('Silence, peasants!')&&heardPhrase('silence pheasants')&&heardPhrase('SILENCE PLEASANTS')&&heardPhrase('silent present')&&heardPhrase('be silent peasantry'),'phrase matcher takes the phrase and its usual mis-hearings');
ok(!heardPhrase('silence')&&!heardPhrase('peasants')&&!heardPhrase('hello there')&&!heardPhrase(''),'phrase matcher needs both words');
ok(INSULTS.length===15&&new Set(INSULTS).size===15,'exactly the 15 approved insults');
ok(THEATER_VIDEOS.length>=3&&THEATER_VIDEOS.every(v=>/^[A-Za-z0-9_-]{11}$/.test(v.id)&&v.title&&v.by),'allow-list entries are well formed ('+THEATER_VIDEOS.length+')');
ok(Math.abs(TH.TEEN_RANGE-3.05)<1e-9&&TH.YELL>TH.SPEAK*3,'10 ft is 3.05 m and a yell is well above speech');
const b=await chromium.launch(),pg=await b.newPage({viewport:{width:1280,height:720}}),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
await pg.evaluate(()=>{
  const G=window.__game,R=G.ROOMS,Z={mx:0,my:0,press:0,lx:0,ly:0};window.T={G,R,Z};
  T.S=()=>R.state();
  T.open=(seed)=>{G.startRun(seed||'th1',1,true);R.theaterOpts.noMic=true;G.P.hp=9;const D=G.F.sdoors[0];D.kind='theater';G.sdoorOpen(D);return T.S()};
  T.run=(n,inp)=>{for(let i=0;i<n&&G.state==='room';i++)R.update(1/60,Object.assign({},Z,inp||{}))};
  T.tp=(x,z)=>{const S=T.S();S.px=S.vx=x;S.pz=S.vz=z;S.ux=S.uz=0};
  T.nearTeen=(i)=>{const t=T.S().teens[i];T.tp(t.x,t.z+0.75)};   // the gap just behind a seat
});
const ev=(f,...a)=>pg.evaluate(f,...a);
// 1. registry
let r=await ev(()=>{const G=T.G,o={};o.kind=!!G.DOOR_KINDS.theater&&G.DOOR_KINDS.theater.look==='theater';o.look=typeof G.DOOR_LOOKS.theater.leaf==='function'&&typeof G.DOOR_LOOKS.theater.glow==='function';o.order=G.doorOrder().includes('theater');
  o.n=G.doorOrder().length;let hit=0,looks=0;for(let s=0;s<30;s++)for(let d=1;d<=12;d++){const f=G.genFloor('rot'+s,d);for(const D of f.sdoors)if(D.kind==='theater'){hit++;if(D.look==='theater')looks++}}o.hit=hit;o.looks=looks;return o});
console.log(JSON.stringify(r));ok(r.kind&&r.look&&r.order,'theater registered in DOOR_LOOKS and DOOR_KINDS');ok(r.hit>0&&r.looks===r.hit,'the rotation places theater doors ('+r.hit+') wearing the theater look');
// 2. entering
r=await ev(()=>{const S=T.open('th1');return {state:T.G.state,kind:T.R.kind,st:S.st,n:S.teens.length,tv:S.tv,why:S.why,yt:!!document.getElementById('theaterYT'),np:!!document.getElementById('theaterNow')&&document.getElementById('theaterNow').style.display,pos:[S.px,S.pz],near:S.nearest(),hp:T.G.P.hp}});
console.log(JSON.stringify(r));ok(r.state==='room'&&r.kind==='theater'&&r.st==='calm','entering the picture house starts it calm');ok(r.n>=5&&r.n<=7,'5 to 7 teenagers ('+r.n+')');
ok(r.tv==='reel'&&!r.yt,'no YouTube reachable (file:): the house reel plays ('+r.why+') and no iframe exists');ok(r.near>TH.TEEN_RANGE,'the entrance is out of range of every teen ('+r.near.toFixed(2)+' m)');
// 3. calm stays calm
r=await ev(()=>{const S=T.S();T.nearTeen(0);T.run(60*60,{});return {st:S.st,hp:T.G.P.hp,pos:[S.px,S.pz],d:S.nearest()}});
console.log(JSON.stringify(r));ok(r.st==='calm'&&r.hp===9,'60 s next to a teen with no sound: still calm, no damage (nearest '+r.d.toFixed(2)+' m)');
// 4. speaking out of range
r=await ev(()=>{const S=T.S();T.tp(-3.5,7.1);T.R.theaterTest({level:0.3});T.run(60*4,{});const o={st:S.st,d:S.nearest()};T.R.theaterTest({level:0});return o});
ok(r.st==='calm','speaking from '+r.d.toFixed(1)+' m away (beyond 10 ft) does nothing');
r=await ev(()=>{const S=T.S();T.nearTeen(1);T.R.theaterTest({level:0.02});T.run(60*3,{});return S.st});
ok(r==='calm','a murmur below the speech threshold does nothing even up close');
// 5. speaking within 10 ft: everyone turns in the same frame
r=await ev(()=>{const S=T.S();T.nearTeen(2);S.test.level=0.2;const o={};let n=0;
  while(S.st==='calm'&&n++<600)T.R.update(1/60,T.Z);
  o.frames=n;o.st=S.st;o.dt=n/60;
  // in that very frame every head already faces the player, and every teen has said huh
  o.yaws=S.teens.map(t=>Math.abs((t.head.rotation.y+t.torso.rotation.y)-t.lookYaw));
  const eyeDir=S.teens.map(t=>Math.abs(t.lookYaw-Math.atan2(-(S.vx-t.x),-(S.vz-t.z))));o.eyeErr=Math.max(...eyeDir);
  o.huh=S.bubbles.filter(b=>b.el.textContent==='huh?').length;o.entLocked=S.entLocked;o.glow=S.teens.map(t=>t.eg.material.opacity);
  T.run(20,{});o.afterGlow=S.teens.map(t=>t.eg.material.opacity);
  T.R.theaterTest({level:0});T.run(40,{});o.mid=S.st;T.run(30,{});o.att=S.st;return o});
console.log(JSON.stringify(r));ok(r.st==='huh'&&r.frames>=14&&r.frames<=20,'sustained speech (~0.25 s) within range starts "huh" ('+r.frames+' frames)');
ok(Math.max(...r.yaws)<0.02&&r.eyeErr<0.02,'all heads face the player in the very same frame (max yaw error '+Math.max(...r.yaws).toFixed(3)+')');
ok(r.huh===r.yaws.length,'every teen has a "huh?" bubble ('+r.huh+')');ok(r.entLocked,'the entrance slams shut');ok(r.afterGlow.every(v=>v>0.5),'eyes glow phone-blue');
ok(r.mid==='huh'&&r.att==='attack','"huh" lasts about 1.2 s, then the attack begins');
// the entrance will not open now
r=await ev(()=>{const S=T.S();T.tp(-3.5,7.7);T.run(5,{});return {room:T.G.state,over:S.over}});ok(r.room==='room'&&!r.over,'the slammed entrance does not let you out');
// 6. insults hurt over time, only the approved lines
r=await ev(()=>{const S=T.S();T.tp(-3.5,6.5);const hp0=T.G.P.hp,seen=new Set();let n=0;
  for(let i=0;i<60*12;i++){T.R.update(1/60,T.Z);for(const bb of S.bubbles)seen.add(bb.el.textContent)}
  return {hp0,hp:T.G.P.hp,insults:S.insults,seen:[...seen],st:S.st}});
console.log(JSON.stringify(r));ok(r.hp0-r.hp>=3&&r.hp0-r.hp===r.insults,'insults cost a heart each over time ('+r.hp0+' -> '+r.hp+' after '+r.insults+' insults in 12 s)');
ok(r.seen.filter(t=>t!=='huh?').every(t=>t==='waaah'||INSULTS.includes(t)),'only approved insults appear '+JSON.stringify(r.seen));
// 7. right words but too quiet, wrong words loud, then the real thing
r=await ev(()=>{const S=T.S();T.G.P.hp=9;S.insT=99;T.R.theaterTest({level:0.05});T.run(60*3,{});T.R.theaterTest({heard:'silence peasants'});const o={quiet:S.st,hint:S.hint,jeer:S.bubbles.some(b=>b.el.textContent==="we can't HEAR you")};
  T.R.theaterTest({level:0.4});T.run(30,{});T.R.theaterTest({heard:'hello there everyone'});o.wrong=S.st;
  T.R.theaterTest({heard:'silence'});o.half=S.st;return o});
ok(r.quiet==='attack'&&r.hint==='Yell it!'&&r.jeer,'the right words too quietly: still under attack, "Yell it!" hint and a jeer');ok(r.wrong==='attack'&&r.half==='attack','loud but wrong words (or half the phrase) do nothing');
r=await ev(()=>{const S=T.S();T.R.theaterTest({heard:'Silence, peasants!'});T.run(2,{});const o={st:S.st,sign:[S.signFace.material.color.r,S.signFace.material.color.g],unlocked:S.unlocked,cry:S.bubbles.filter(b=>b.el.className.includes('cry')).length};
  const hp=T.G.P.hp;S.test.level=0;T.run(60*12,{});o.hpSame=T.G.P.hp===hp;o.stillCrying=S.st;return o});
console.log(JSON.stringify(r));ok(r.st==='crying','the yelled phrase makes them cry');ok(r.sign[1]>1&&r.sign[0]<0.5&&r.unlocked,'the EXIT sign is green and the door is unlocked');
ok(r.cry>=5,'crying bubbles from every teen');
const vis=await ev(()=>{const S=T.S();T.run(30,{});return {tears:S.teens.every(t=>t.tears.filter(q=>q.m.visible).length>=6),mouth:S.teens.every(t=>!t.strand.visible),sign:S.signFace.material.color.g>1&&S.signFace.material.color.r<0.5,light:S.signLight.color.g>S.signLight.color.r}});
ok(vis.tears&&vis.mouth&&vis.sign&&vis.light,'crying visuals follow the state: tear drops shown, drool gone, EXIT face and light green '+JSON.stringify(vis));ok(r.hpSame&&r.stillCrying==='crying','damage stops for good');
// 8. other ways to win: no speech recogniser (sustained yell), no microphone at all (hold V)
r=await ev(()=>{const o={};
  T.open('th2');let S=T.S();T.nearTeen(0);S.test.level=0.2;T.run(60,{});S.test.level=0;T.run(120,{});
  T.R.theaterTest({noSR:true,level:0.3});T.run(40,{});o.shortYell=S.st;T.R.theaterTest({level:0.05});T.run(200,{});T.R.theaterTest({level:0.3});T.run(70,{});o.longYell=S.st;
  T.open('th3');S=T.S();T.nearTeen(0);T.run(1,{});S.test.level=0.2;T.run(30,{});S.test.level=null;T.run(2,{});o.vstate=S.st;
  T.run(100,{});o.v0=S.st;T.run(20,{talk:1});o.vShort=S.st;T.run(30,{});T.run(70,{talk:1});o.vLong=S.st;return o});
console.log(JSON.stringify(r));ok(r.shortYell==='attack'&&r.longYell==='crying','without speech recognition a yell must hold ~1 s');ok(r.vstate==='huh'||r.vstate==='attack','speech triggers the teens');ok(r.v0==='attack'&&r.vShort==='attack'&&r.vLong==='crying','no microphone: a short V press talks, holding V for 1 s yells the phrase');
// 9. dying here is the normal death
r=await ev(()=>{T.open('th4');const S=T.S();T.G.P.hp=1;T.nearTeen(0);S.test.level=0.2;T.run(60,{});S.test.level=0;T.run(60*8,{});return {state:T.G.state,hp:T.G.P.hp,title:document.getElementById('deadTitle').textContent}});
console.log(JSON.stringify(r));ok(r.state==='dead'&&r.hp<=0,'the player can die in the picture house ('+r.title+')');
ok(await ev(()=>!document.getElementById('theaterLayer')&&!document.getElementById('theaterNow')),'death cleans up the DOM');
// 10. locked exit, leaving by the entrance while calm, spectators, cleanup
r=await ev(()=>{const o={};T.open('th5');let S=T.S();T.tp(5.7,-6.5);T.run(5,{});o.locked=T.G.state==='room'&&!S.over;
  T.tp(-3.5,7.7);T.run(60,{});o.left=T.G.state;o.used=T.G.F.sdoors[0].used;o.layer=!!document.getElementById('theaterLayer');return o});
ok(r.locked,'the locked side exit does not open');ok(r.left==='play'&&r.used&&!r.layer,'leaving by the entrance while calm: back in the maze, door used, DOM cleaned up');
r=await ev(()=>{const o={};T.G.startRun('th6',1,true);T.R.watch('theater',{x:0,z:3,yw:0,pt:0,st:'calm'});const S=T.S();o.watching=T.R.watching;o.tv=S.tv;o.yt=!!document.getElementById('theaterYT');
  T.R.sync({x:1,z:2,yw:0.2,pt:0,st:'huh'});T.R.update(1/60,T.Z);o.st=S.st;o.huh=S.bubbles.length;T.R.update(1/60,T.Z);
  T.R.sync({st:'crying'});T.R.update(1/60,T.Z);o.cry=S.st;T.R.abort();o.gone=!document.getElementById('theaterLayer');return o});
ok(r.watching&&r.tv==='reel'&&!r.yt&&r.st==='huh'&&r.cry==='crying'&&r.gone,'spectators see the reel (no iframe), follow the story, and clean up');
// 11. win through the side door: achievement, perk
r=await ev(()=>{const o={};T.open('th7');const S=T.S();T.G.P.hp=9;T.nearTeen(3);S.test.level=0.2;T.run(60,{});S.test.level=0;T.run(100,{});T.R.theaterTest({level:0.4});T.run(10,{});T.R.theaterTest({heard:'silence peasants'});
  T.run(60,{});T.tp(5.7,-6.5);T.run(120,{});
  o.state=T.G.state;o.guide=T.G.R.guide;o.depth=T.G.R.depth;o.ach=JSON.parse(localStorage.getItem('emberdeep.ach')||'{}');o.toast=document.getElementById('achToast').className+'|'+document.getElementById('achToast').textContent;
  o.t0=o.ach.knowledge;T.G.achieve('knowledge','Knowledge is power','x');o.t1=JSON.parse(localStorage.getItem('emberdeep.ach')).knowledge;o.keys=Object.keys(o.ach);
  o.score=T.G.R.score;o.hp=T.G.P.hp;return o});
console.log(JSON.stringify(r));ok(r.state==='play'&&r.guide===r.depth,'walking out through the unlocked exit wins: back in the maze with the guide on');
ok(typeof r.t0==='number'&&r.t0===r.t1&&r.keys.join()==='knowledge','"Knowledge is power" stored once in emberdeep.ach and the first time is kept ('+r.keys+')');ok(r.toast.includes('on')&&r.toast.includes('Knowledge is power'),'the achievement banner shows');
// 12. the guiding light
r=await ev(()=>{const G=T.G,F=G.F,P=G.P,o={};for(let i=0;i<5;i++)G.update(1/60);
  const gi=G.guideInfo();o.on=gi.on;o.have=gi.have;
  // independent expectation: the nearest shard by walking distance
  const d=G.bfs(F.g,F.W,F.H,P.tx,P.ty);const sh=F.items.filter(i=>i.type==='shard'&&!i.got).map(i=>({tx:i.tx,ty:i.ty,d:d[i.ty*F.W+i.tx]})).filter(s=>s.d>=0).sort((a,b)=>a.d-b.d);
  o.expect=[sh[0].tx,sh[0].ty];o.target=[gi.target.tx,gi.target.ty];o.kind=gi.target.k;o.beacon=gi.beacon;
  const dt=G.bfs(F.g,F.W,F.H,gi.target.tx,gi.target.ty);o.bd=dt[gi.beacon.ty*F.W+gi.beacon.tx];o.pd=dt[P.ty*F.W+P.tx];
  o.sees=true;{const x1=gi.beacon.tx+0.5,z1=gi.beacon.ty+0.5,n=Math.ceil(Math.hypot(x1-P.x,z1-P.z)/0.2);for(let k=1;k<n;k++){const t=k/n;if(G.solidAt(P.x+(x1-P.x)*t,P.z+(z1-P.z)*t))o.sees=false}}
  o.range=Math.hypot(gi.beacon.tx+0.5-P.x,gi.beacon.ty+0.5-P.z);
  // is it the farthest visible tile along the route? walk the route and check nothing beyond it is in view and in range
  const path=[];{let x=P.tx,y=P.ty;while(dt[y*F.W+x]>0){path.push([x,y]);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<F.W&&ny<F.H&&dt[ny*F.W+nx]===dt[y*F.W+x]-1){x=nx;y=ny;break}}}path.push([x,y])}
  o.len=path.length-1;o.gdist=G.guideInfo().len;
  // advance: stand on the beacon tile; it must move on (or sit on the target)
  const b0=gi.beacon;P.x=b0.tx+0.5;P.z=b0.ty+0.5;G.onTileChange();G.update(1/60);const g2=G.guideInfo();o.moved=g2.beacon.tx!==b0.tx||g2.beacon.ty!==b0.ty||(g2.beacon.tx===g2.target.tx&&g2.beacon.ty===g2.target.ty);
  o.glideStart=Math.hypot(g2.x-g2.gx,g2.z-g2.gz);for(let i=0;i<8;i++)G.update(1/60);const g3=G.guideInfo();o.glideMid=Math.hypot(g3.x-g3.gx,g3.z-g3.gz);for(let i=0;i<60;i++)G.update(1/60);const g4=G.guideInfo();o.glideEnd=Math.hypot(g4.x-g4.gx,g4.z-g4.gz);
  // the target keeps getting closer as we follow the beacon
  let steps=0,last=1e9,mono=true,reached=false;const tg0=G.guideInfo().target;for(;steps<60;steps++){const gg=G.guideInfo();if(!gg.have||!gg.target)break;if(gg.target.tx!==tg0.tx||gg.target.ty!==tg0.ty){reached=true;break}const dd=G.bfs(F.g,F.W,F.H,gg.target.tx,gg.target.ty)[P.ty*F.W+P.tx];if(dd>last)mono=false;last=dd;if(dd===0)break;
    P.x=gg.beacon.tx+0.5;P.z=gg.beacon.ty+0.5;G.onTileChange();G.update(1/60)}
  o.mono=mono;o.steps=steps;o.reached=reached||last===0;
  // collecting shards: the target changes; all three: the exit
  const t0=G.guideInfo().target;
  for(const it of F.items)if(it.type==='shard'&&!it.got)G.collect(it);
  P.x=F.start.tx+0.5;P.z=F.start.ty+0.5;G.onTileChange();G.update(1/60);const ge=G.guideInfo();o.exitK=ge.target&&ge.target.k;o.exitTile=ge.target&&[ge.target.tx,ge.target.ty];o.exit=[F.exit.tx,F.exit.ty];o.shards=P.shards;
  return o});
console.log(JSON.stringify(r));
ok(r.on&&r.have&&r.kind==='shard'&&r.target.join()===r.expect.join(),'the light targets the nearest shard by walking distance '+r.target);
ok(r.bd<r.pd&&r.bd>=0,'the beacon is further along the route to the shard ('+r.pd+' -> '+r.bd+')');ok(r.sees&&r.range<=14.01,'the beacon is in straight line of sight and within 14 tiles ('+r.range.toFixed(1)+')');
ok(r.moved,'standing at the beacon, it moves on ahead');ok(r.glideStart>0.3&&r.glideMid<r.glideStart&&r.glideEnd<0.02,'it glides to the new spot instead of jumping ('+r.glideStart.toFixed(2)+' -> '+r.glideMid.toFixed(2)+' -> '+r.glideEnd.toFixed(3)+')');
ok(r.mono&&r.reached,'following the beacon leads to the shard ('+r.steps+' hops)');ok(r.shards>=3&&r.exitK==='exit'&&r.exitTile.join()===r.exit.join(),'with every shard collected the light points at the exit');
r=await ev(()=>{const G=T.G,o={};o.before=G.R.guide;G.loadFloor(2);for(let i=0;i<5;i++)G.update(1/60);o.after=G.R.guide;const gi=G.guideInfo();o.on=gi.on;o.have=gi.have;return o});
ok(r.before>0&&r.after===0&&!r.on&&!r.have,'the perk is gone on the next floor');
// the shut gate: the light never routes through it
r=await ev(()=>{const G=T.G;let o={tested:0,bad:0};for(let s=0;s<40;s++){G.startRun('gate'+s,2+(s%4),true);const F=G.F;if(!F.door)continue;G.R.guide=G.R.depth;G.GD.have=false;G.guideCompute();const gi=G.guideInfo();if(!gi.have)continue;o.tested++;
  const d=G.bfs(F.g,F.W,F.H,G.P.tx,G.P.ty);if(d[gi.target.ty*F.W+gi.target.tx]<0)o.bad++}return o});
ok(r.tested>0&&r.bad===0,'with a gate shut the light only targets what is reachable ('+r.tested+' floors)');
// 13. the YouTube path, against a stub of the IFrame API served over http
{
  const html=readFileSync(root+'/index.html'),srv=http.createServer((q,s)=>{s.setHeader('content-type','text/html');s.end(html)});await new Promise(res=>srv.listen(0,'127.0.0.1',res));
  const url='http://127.0.0.1:'+srv.address().port+'/';
  const stub=mode=>`window.__yt={players:[],calls:[],mode:'${mode}'};
    window.YT={Player:function(el,cfg){const p=this,Y=window.__yt;Y.cfg=cfg;Y.players.push(p);const f=document.createElement('iframe');f.src='about:blank';el.replaceWith(f);
      ['playVideo','pauseVideo','mute','unMute','destroy'].forEach(n=>p[n]=()=>Y.calls.push(n));
      p.setVolume=v=>Y.calls.push('vol'+v);
      p.loadVideoById=o=>{Y.calls.push('load:'+o.videoId);Y.last=o.videoId;if(Y.mode==='error')setTimeout(()=>cfg.events.onError({data:150}),30)};
      setTimeout(()=>{cfg.events.onReady({target:p});setTimeout(()=>{if(Y.mode==='error')cfg.events.onError({data:150});else cfg.events.onStateChange({data:1})},50)},30)}};
    setTimeout(()=>window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady(),20);`;
  for(const mode of ['ok','error','blocked']){
    const pg2=await b.newPage({viewport:{width:1280,height:720}}),e2=[];pg2.on('pageerror',e=>e2.push(String(e)));
    await pg2.route('https://www.youtube.com/iframe_api',rt=>mode==='blocked'?rt.abort():rt.fulfill({contentType:'text/javascript',body:stub(mode)}));
    await pg2.addInitScript(()=>{window.__norender=true});
    await pg2.goto(url);await pg2.waitForFunction(()=>window.__game&&window.__game.genFloor);
    await pg2.evaluate(()=>{const G=__game;G.startRun('yt1',1,true);G.ROOMS.theaterOpts.noMic=true;const D=G.F.sdoors[0];D.kind='theater';G.sdoorOpen(D)});
    await pg2.waitForTimeout(mode==='blocked'?600:700);
    const o=await pg2.evaluate(()=>{const S=__game.ROOMS.state(),y=window.__yt||{},now=document.getElementById('theaterNow'),a=now&&now.querySelector('a');
      let drawn='n/a';if(S.tv==='yt'){const R=__game.ROOMS;R.render();const w=document.getElementById('theaterYT');drawn=w?w.style.visibility+'|'+w.style.transform.slice(0,24):'nowrap'}
      return {tv:S.tv,why:S.why,np:S.np&&S.np.id,cfg:y.cfg&&{host:y.cfg.host,pv:y.cfg.playerVars,vid:y.cfg.videoId},href:a&&a.href,rel:a&&a.rel,target:a&&a.target,nowShown:now&&now.style.display,calls:(y.calls||[]).slice(0,12),iframe:!!document.querySelector('#theaterYT iframe'),drawn}});
    console.log(mode,JSON.stringify(o));
    if(mode==='ok'){
      const list=THEATER_VIDEOS.map(v=>v.id);
      ok(o.tv==='yt'&&list.includes(o.np)&&o.cfg.vid===o.np,'stubbed API: playback starts with an allow-listed id ('+o.np+')');
      ok(o.cfg.host==='https://www.youtube-nocookie.com'&&o.cfg.pv.controls===0&&o.cfg.pv.disablekb===1&&o.cfg.pv.fs===0&&o.cfg.pv.rel===0&&o.cfg.pv.iv_load_policy===3&&o.cfg.pv.modestbranding===1&&o.cfg.pv.playsinline===1,'player is created on youtube-nocookie with no controls, keys, fullscreen or suggestions');
      ok(o.href==='https://youtu.be/'+o.np&&o.rel==='noopener'&&o.target==='_blank'&&o.nowShown==='block','the "Now playing" live link is a real https://youtu.be link that opens in a new tab with rel=noopener');
      ok(/^visible\|matrix3d/.test(o.drawn),'the iframe is laid over the screen with a perspective matrix3d ('+o.drawn+')');
      ok(await pg2.evaluate(()=>{const w=document.getElementById('theaterYT'),f=w.querySelector('iframe');return getComputedStyle(w).pointerEvents==='none'&&getComputedStyle(f).pointerEvents==='none'&&+getComputedStyle(w).zIndex<+getComputedStyle(document.getElementById('roomHud')).zIndex}),'the iframe never takes pointer events and sits below the HUD');
      // ended: next allow-listed id; looking away hides it; leaving removes it
      await pg2.evaluate(()=>{const S=__game.ROOMS.state();window.__yt.cfg.events.onStateChange({data:0})});await pg2.waitForTimeout(100);
      const nx=await pg2.evaluate(()=>({last:window.__yt.last}));ok(list.includes(nx.last)&&nx.last!==o.np,'when a video ends it moves on to the next allow-listed id ('+nx.last+')');
      const hid=await pg2.evaluate(()=>{const S=__game.ROOMS.state(),R=__game.ROOMS;S.yaw=S.vyaw=Math.PI;R.render();return document.getElementById('theaterYT').style.visibility});ok(hid==='hidden','hidden when the screen is behind you');
      const gone=await pg2.evaluate(()=>{__game.ROOMS.abort();return !document.getElementById('theaterYT')&&!document.getElementById('theaterNow')&&!document.getElementById('theaterLayer')&&!document.querySelector('iframe')});ok(gone,'the iframe and the link are removed when the room ends');
    }else if(mode==='error'){
      ok(o.tv==='reel'&&!o.iframe&&o.nowShown!=='block','every id erroring falls back to the house reel ('+o.why+')');
    }else ok(o.tv==='reel'&&o.why==='script','the API script failing to load falls back to the house reel');
    ok(e2.length===0,mode+': no page errors '+e2.join('|'));
    await pg2.close();
  }
  srv.close();
}
ok(errs.length===0,'no console errors '+errs.slice(0,3).join(' | '));
console.log(fails?fails+' FAILED':'ALL PASSED');await b.close();process.exit(fails?1:0);
