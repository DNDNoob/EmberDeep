// Requires Playwright. LIFT_BROWSER can point to a locally installed Chromium browser.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';

const {chromium}=createRequire(import.meta.url)('playwright');
const server=await serve(fileURLToPath(new URL('../',import.meta.url)));
const browser=await chromium.launch({executablePath:process.env.LIFT_BROWSER||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const context=await browser.newContext({viewport:{width:420,height:280}});
  await context.addInitScript(()=>{
    localStorage.setItem('emberdeep.quality','"low"');window.__norender=true;
    window.requestAnimationFrame=fn=>{window.nextFrame=fn};
    window.tick=()=>{for(let i=0;i<12;i++)nextFrame(window.testClock=(window.testClock??performance.now())+32)};
    window.useLift=()=>{
      window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'e',bubbles:true}));
      window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',key:'e',bubbles:true}));
    };
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
    for(let i=0;i<180;i++){
      const ready=await Promise.all(pages.map(page=>page.evaluate(source=>{
        tick();return Function(`return (${source})`)()(__game);
      },condition.toString())));
      if(ready.every(Boolean))return;
      await new Promise(resolve=>setTimeout(resolve,65));
    }
    throw Error(label+' timed out');
  }
  const host=await open();
  await until('Host lobby',g=>g.hub.lobbyReady);
  const code=await host.evaluate(()=>{document.getElementById('hostBtn').click();return __game.MP.code});
  const guest=await open('&room='+code);
  await until('Connection',g=>g.hub.lobbyReady&&g.MP.peers.size===1&&(g.MP.host||g.MP.hostId));
  await Promise.all(pages.map(page=>page.evaluate(()=>{__game.hub.place(0,-8.6,0,0);tick()})));
  await host.evaluate(()=>{
    useLift();
    if(__game.activeStation!=='lift')throw Error('The lobby terminal did not open');
    document.getElementById('liftDestination').requestSubmit();
  });
  await until('Host departure from the lobby',g=>g.state==='play'&&g.R.depth===1);
  await until('Both riders present on floor 1',g=>[...g.MP.peers.values()].every(p=>p.run&&p.d===1));
  async function openFloorTerminal(page){
    await page.evaluate(()=>{
      const g=__game;g.P.yaw=g.F.lift.yaw+Math.atan2(1.09,1.33);g.P.pitch=0;
      useLift();
      if(g.activeStation!=='lift')throw Error('The docked lift terminal did not open');
    });
  }
  await openFloorTerminal(guest);
  const draft=await guest.evaluate(()=>{
    const g=__game,field=document.getElementById('liftDepth');
    const send=g.MP.room.send;
    // The departure must carry the destination even if the separate selection update has yet to reach the host.
    g.MP.room.send=function(message,to){if(message.k!=='liftPick')return send.call(this,message,to)};
    field.value=3;field.dispatchEvent(new Event('input'));
    g.mpRecv({k:'liftSelection',depth:2,max:40,deepest:1,by:'Host'},g.MP.hostId);
    return field.valueAsNumber;
  });
  assert.equal(draft,3,'A delayed shared selection must not overwrite the number being entered');
  await host.evaluate(()=>__game.pause());
  await guest.evaluate(()=>document.getElementById('liftDestination').requestSubmit());
  await until('Guest departure with the host paused aboard',g=>g.state==='play'&&g.R.depth===3);
  await until('Both riders present on floor 3',g=>[...g.MP.peers.values()].every(p=>p.run&&p.d===3));
  await openFloorTerminal(host);
  await host.evaluate(()=>{
    const lobby=document.getElementById('liftLobby');
    if(lobby.disabled)throw Error('The lift terminal stayed busy after docking');
    lobby.click();
  });
  await until('Host departure back to the lobby',g=>g.state==='title'&&!g.hub.riding&&g.hub.boarded&&g.MP.on);
  assert.deepEqual(errors,[]);
  console.log('Host and guest terminal departures, delayed selection, a paused rider, and return to the lobby passed.');
}finally{await browser.close();server.close()}
