// node tools/neon_party_test.mjs
// The Neon Run in a shared game: whoever opens its door pulls the others onto the ride with them. Two players ride the lift to
// floor 1 together; the host opens a Neon Run door; the guest must be pulled into the same ride (same course, the seat behind),
// each sees the other's cart, a cutout the host shoots down falls for the guest too (and scores only for the host), and each
// sees the other's score.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';

const {chromium}=createRequire(import.meta.url)('playwright');
const server=await serve(fileURLToPath(new URL('../',import.meta.url)));
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let fails=0;
const check=(ok,what)=>{console.log((ok?'ok   ':'FAIL ')+what);if(!ok)fails++};
try{
  const context=await browser.newContext({viewport:{width:420,height:280}});
  await context.addInitScript(()=>{
    localStorage.setItem('emberdeep.quality','"low"');window.__norender=true;
    window.requestAnimationFrame=fn=>{window.nextFrame=fn};
    window.tick=(n=12)=>{for(let i=0;i<n;i++)nextFrame(window.testClock=(window.testClock??performance.now())+32)};
  });
  const pages=[],errors=[];
  async function open(query=''){
    const page=await context.newPage();pages.push(page);
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(server.url+'index.html?net=local'+query);
    await page.waitForFunction(()=>window.__game?.hub,null,{timeout:90000});
    return page;
  }
  async function until(label,condition){
    for(let i=0;i<240;i++){
      const ready=await Promise.all(pages.map(page=>page.evaluate(source=>{tick();return Function(`return (${source})`)()(__game)},condition.toString())));
      if(ready.every(Boolean))return true;
      await new Promise(resolve=>setTimeout(resolve,65));
    }
    console.log('timed out: '+label);return false;
  }
  const host=await open();
  await until('Host lobby',g=>g.hub.lobbyReady);
  const code=await host.evaluate(()=>{document.getElementById('hostBtn').click();return __game.MP.code});
  const guest=await open('&room='+code);
  await until('Connection',g=>g.hub.lobbyReady&&g.MP.peers.size===1&&(g.MP.host||g.MP.hostId));
  await Promise.all(pages.map(page=>page.evaluate(()=>{__game.hub.place(0,-8.6,0,0);tick()})));
  await host.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'e',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',key:'e',bubbles:true}));
    document.getElementById('liftDestination').requestSubmit()});
  check(await until('Both on floor 1',g=>g.state==='play'&&g.R.depth===1&&[...g.MP.peers.values()].every(p=>p.run&&p.d===1)),'both players ride down to floor 1 together');
  // the host opens a Neon Run door
  await host.evaluate(()=>{const g=__game;for(const s of g.F.shades){s.x=s.z=-99;s.dead=true}
    g.sdoorOpen({kind:'neonride',look:'neon',tx:2,ty:2,dx:1,dz:0,x:2.5,z:2.5,ph:0,used:false})});
  check(await until('Both on the ride',g=>g.state==='room'&&g.ROOMS.kind==='neonride'),'the guest is pulled onto the ride along with the host');
  const seats=await Promise.all(pages.map(p=>p.evaluate(()=>{const g=__game,S=g.ROOMS.state();return {me:g.NR.party&&g.NR.party.me,n:g.NR.party&&g.NR.party.seats.length,seed:S.seed,s:S.s,others:S.others?S.others.length:-1}})));
  check(seats[0].me===0&&seats[1].me===1&&seats[0].n===2&&seats[1].n===2,'the host has the front seat and the guest the one behind ('+JSON.stringify(seats)+')');
  check(seats[0].seed===seats[1].seed,'both ride the same course');
  check(seats[0].s>seats[1].s,'the guest\'s cart is behind the host\'s');
  check(seats[0].others===1&&seats[1].others===1,'each sees the other\'s cart');
  // roll until a cutout stands up in front of the host, and shoot it
  await until('Cutouts up',g=>{const S=g.ROOMS.state();return S.t>4&&S.panels.some(P=>P.up>0.95&&!P.hit&&P.t.kind!=='astronaut')});
  const shot=await host.evaluate(()=>{const g=__game,R=g.ROOMS,S=R.state(),cam=R.cam;
    for(let i=0;i<120;i++){const P=S.panels.filter(P=>P.up>0.95&&!P.hit&&P.t.kind==='alien').sort((a,b)=>a.front.getWorldPosition(cam.position.clone()).distanceTo(cam.position)-b.front.getWorldPosition(cam.position.clone()).distanceTo(cam.position))[0];
      if(!P)return {id:-1};
      const w=P.front.getWorldPosition(cam.position.clone()),dx=w.x-cam.position.x,dz=w.z-cam.position.z;
      S.yaw=cam.rotation.y+S.yaw-Math.atan2(-dx,-dz);S.pitch=Math.atan2(w.y-cam.position.y,Math.hypot(dx,dz));R.update(1/60,{press:i%2===0});
      if(P.hit)return {id:P.t.id,score:S.score}}
    return {id:-2}});
  check(shot.id>=0&&shot.score>0,'the host shoots a cutout down and scores ('+JSON.stringify(shot)+')');
  const seen=await until('The guest sees it fall',g=>g.MP.host||g.ROOMS.state().panels.some(P=>P.hit));
  const guestSide=await guest.evaluate(id=>{const g=__game,S=g.ROOMS.state(),P=S.panels.find(P=>P.t.id===id),host=[...g.NR.peers.values()][0];return {down:!!(P&&P.hit),score:S.score,hostScore:host?host.sc:-1}},shot.id);
  check(seen&&guestSide.down,'the cutout falls for the guest too');
  check(guestSide.score===0,'and it scores only for the one who shot it (guest has '+guestSide.score+')');
  check(guestSide.hostScore===shot.score||await (async()=>{await until('score',g=>true);return (await guest.evaluate(()=>[...__game.NR.peers.values()][0].sc))===shot.score})(),'the guest sees the host\'s score');
  check(!errors.length,'no page errors '+errors.slice(0,3).join(' | '));
}finally{await browser.close();server.close()}
console.log(fails?fails+' FAILED':'all passed');
process.exit(fails?1:0);
