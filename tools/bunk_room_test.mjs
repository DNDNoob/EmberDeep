// Requires Playwright. Use --screenshots to capture the locked room and open doorway.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {BUNK_DOOR,BUNK_SPAWN} from '../src/bunk-room.js';
import {serve} from './serve.mjs';

const {chromium}=createRequire(import.meta.url)('playwright');
const server=await serve(fileURLToPath(new URL('../',import.meta.url)));
const browser=await chromium.launch({executablePath:process.env.LIFT_BROWSER||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const screenshots=process.argv.includes('--screenshots');
try{
  if(screenshots)await mkdir(new URL('../shots/',import.meta.url),{recursive:true});
  const page=await browser.newPage({viewport:{width:1100,height:650}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text())});
  await page.addInitScript(quality=>{
    localStorage.setItem('emberdeep.quality',JSON.stringify(quality));
    window.requestAnimationFrame=frame=>{window.nextFrame=frame};
    window.tick=(n=1,draw=false)=>{
      window.__norender=!draw;
      for(let i=0;i<n;i++)nextFrame(window.testClock=(window.testClock??performance.now())+32);
    };
  },process.env.LIFT_QUALITY||'medium');
  await page.goto(server.url+'index.html');
  await page.waitForFunction(()=>window.__game?.hub,null,{timeout:90000});
  const spawn=await page.evaluate(()=>{
    const g=__game,p=g.menuPosition;
    const compile=g.renderer.compileAsync;
    g.renderer.compileAsync=function(object,...args){
      if(object!==g.hub.scene)return compile.call(this,object,...args);
      this.compileAsync=compile;
      const hold=new Promise(resolve=>{window.finishHallCompile=resolve});
      return Promise.all([compile.call(this,object,...args),hold]);
    };
    let drewBunk=false,drawCalls=0;
    const render=g.renderer.render;
    g.renderer.render=function(scene,camera){
      const result=render.call(this,scene,camera);
      if(scene!==g.hub.scene&&scene.getObjectByName('Bunk room')){
        drewBunk=true;drawCalls=this.info.render.calls;
      }
      return result;
    };
    tick(1,true);g.renderer.render=render;
    if(drawCalls>22)throw Error('The bunk room should batch static props');
    return {x:p.x,z:p.z,drewBunk,locked:!g.hub.lobbyReady,overlay:!document.getElementById('loading').hidden};
  });
  assert.deepEqual(spawn,{x:BUNK_SPAWN.x,z:BUNK_SPAWN.z,drewBunk:true,locked:true,overlay:false});
  async function shot(name){
    if(!screenshots)return;
    await page.evaluate(()=>tick(1,true));
    await page.screenshot({path:fileURLToPath(new URL('../shots/'+name,import.meta.url))});
  }
  await shot('bunk-room-locked.png');
  const held=await page.evaluate(()=>{
    __game.keys.KeyW=true;tick(75);__game.keys.KeyW=false;
    return {x:__game.menuPosition.x,locked:!__game.hub.lobbyReady,door:__game.hub.bunkDoorOpen};
  });
  assert.ok(held.x>BUNK_SPAWN.x&&held.x<BUNK_DOOR.x,'The player should walk up to the locked door');
  assert.ok(held.locked&&!held.door,'Walking should not push past the locked door');
  let deferred=false;
  for(let i=0;i<100&&!deferred;i++){
    deferred=await page.evaluate(()=>{tick();return typeof window.finishHallCompile==='function'});
    if(!deferred)await page.waitForTimeout(40);
  }
  assert.ok(deferred,'The lobby should start its graphics warm-up');
  assert.equal(await page.evaluate(()=>__game.hub.lobbyReady||__game.hub.bunkDoorOpen),false);
  await page.evaluate(()=>window.finishHallCompile());
  let ready=false;
  for(let i=0;i<160&&!ready;i++){
    ready=await page.evaluate(()=>{tick(12);return __game.hub.lobbyReady});
    if(!ready)await page.waitForTimeout(80);
  }
  assert.ok(ready,'Lobby warm-up should finish and unlock the door');
  assert.equal(await page.evaluate(()=>__game.liftCache().length),0,'Maze preparation should wait until the player leaves the bunk room');
  const exit=await page.evaluate(door=>{
    const g=__game;
    tick(20);
    const open=g.hub.bunkDoorOpen;
    g.keys.KeyW=true;tick(34);g.keys.KeyW=false;
    return {x:g.menuPosition.x,open,hangar:!!g.hub.hangarStats,threshold:door.x};
  },BUNK_DOOR);
  assert.ok(exit.open&&exit.hangar&&exit.x>exit.threshold+1,'The player should walk straight into the prepared lobby');
  await page.evaluate(({x,z})=>__game.hub.place(x-3.55,z,Math.PI/2,0),BUNK_DOOR);
  await shot('bunk-room-open-lobby.png');
  const crossedBack=await page.evaluate(door=>{
    const g=__game;
    g.hub.place(door.x+1.25,door.z,Math.PI/2,0);
    g.keys.KeyS=true;tick(27);g.keys.KeyS=false;
    return g.menuPosition.x<door.x-1;
  },BUNK_DOOR);
  assert.ok(crossedBack,'The open door should also allow reentry');
  assert.deepEqual(errors,[]);
  console.log('Playable bunk spawn, locked door during graphics warm-up, and walkable lobby connection passed.');
}finally{await browser.close();server.close()}
