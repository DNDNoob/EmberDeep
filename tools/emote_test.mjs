// node tools/emote_test.mjs
// Dance emotes: T starts a dance and moves on to the next, walking stops it, and the other players see it. Two players ride down to
// floor 1 together; the host dances; the guest must see the host's dance, and see it end when the host walks off.
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
  const dance=await host.evaluate(()=>{const g=__game;g.P.vx=g.P.vz=0;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',key:'t',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyT',key:'t',bubbles:true}));const a=g.EMO.id;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT',key:'t',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyT',key:'t',bubbles:true}));
    return {a,b:g.EMO.id,chat:document.activeElement&&document.activeElement.tagName}});
  check(dance.a===0&&dance.b===1,'T starts a dance, and T again moves on to the next ('+JSON.stringify(dance)+')');
  check(dance.chat!=='INPUT','and T no longer opens the chat box (that is Enter)');
  check(await until('The guest sees it',g=>g.MP.host||[...g.MP.peers.values()].some(p=>p.emote&&p.emote.id===1)),'the other player sees the dance');
  await host.evaluate(()=>{__game.keys.KeyW=true});
  check(await until('It stops',g=>g.MP.host?g.EMO.id==null:[...g.MP.peers.values()].every(p=>!p.emote)),'walking off stops it, for everyone');
  await host.evaluate(()=>{__game.keys.KeyW=false});
  check(!errors.length,'no page errors '+errors.slice(0,3).join(' | '));
}finally{await browser.close();server.close()}
console.log(fails?fails+' FAILED':'all passed');
process.exit(fails?1:0);
