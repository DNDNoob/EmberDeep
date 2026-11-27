// Requires Playwright. Use --screenshots to save the dock and controls in shots/.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';
import {landingMazeZ,liftGateZ,mountLiftDock} from '../src/lift-dock.js';

const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const screenshots=process.argv.includes('--screenshots');
const srv=await serve(root);
const browser=await chromium.launch({executablePath:process.env.LIFT_BROWSER||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  if(screenshots)await mkdir(new URL('../shots/',import.meta.url),{recursive:true});
  const page=await browser.newPage({viewport:{width:1100,height:650}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text())});
  await page.addInitScript(({mazeZ,quality})=>{
    localStorage.setItem('emberdeep.quality',JSON.stringify(quality));
    window.__norender=true;
    window.requestAnimationFrame=frame=>{window.nextFrame=frame};
    window.tick=(n=1,draw=false)=>{
      window.__norender=!draw;
      for(let i=0;i<n;i++)nextFrame(window.testClock=(window.testClock??performance.now())+32);
    };
    window.walk=(key,until,max=160)=>{
      __game.keys[key]=true;
      try{for(let i=0;i<max&&!until();i++)tick()}
      finally{__game.keys[key]=false}
      if(!until())throw Error('Could not walk to the next checkpoint');
    };
    window.cabinPosition=()=>{
      const {x,z,fx,fz}=__game.F.lift,p=__game.P,s=0.9/1.62;
      return {x:((p.z-z)*fx-(p.x-x)*fz)/s,z:mazeZ-((p.x-x)*fx+(p.z-z)*fz)/s};
    };
    const link=WebGL2RenderingContext.prototype.linkProgram;
    window.shaderLinks=0;
    WebGL2RenderingContext.prototype.linkProgram=function(program){window.shaderLinks++;return link.call(this,program)};
  },{mazeZ:landingMazeZ,quality:process.env.LIFT_QUALITY||'medium'});
  await page.goto(srv.url+'index.html');
  await page.waitForFunction(()=>window.__game?.hub,null,{timeout:90000});
  const malformed=await page.evaluate(source=>{
    const mount=Function(`return (${source})`)(),g=__game;
    const problems=[];
    for(const seed of ['ALPHA','EMBER9','DOOR42','NIGHTMINE'])for(let depth=1;depth<=40;depth++){
      const floor=g.genFloor(seed,depth),{W,H,start}=floor,original=floor.g.slice();
      const before=g.bfs(floor.g,W,H,start.tx,start.ty),dock=mount(floor,before);
      const after=g.bfs(floor.g,W,H,start.tx,start.ty);
      if(!dock||after[dock.tz*W+dock.tx]<0||original.some((tile,i)=>tile===0&&before[i]<0&&after[i]>=0))problems.push({seed,depth});
    }
    return problems;
  },mountLiftDock.toString());
  assert.deepEqual(malformed,[],'Discovery of a lift dock should leave sealed areas sealed');
  let lobbyReady=false;
  for(let i=0;i<220&&!lobbyReady;i++){
    lobbyReady=await page.evaluate(()=>{tick(16);return __game.hub.lobbyReady});
    if(lobbyReady)break;
    await page.waitForTimeout(100);
  }
  assert.ok(lobbyReady,'The lobby should be ready before boarding the lift');
  const shot=async name=>{
    if(!screenshots)return;
    await page.evaluate(()=>tick(1,true));
    await page.screenshot({path:fileURLToPath(new URL('../shots/'+name,import.meta.url))});
  };
  const arrive=async(depth,capture=false)=>{
    let docked=false;
    for(let i=0;i<70&&!docked;i++){
      docked=await page.evaluate(()=>{
        for(let i=0;i<24&&__game.state==='title';i++)tick();
        return __game.state==='play';
      });
      if(!docked)await page.waitForTimeout(80);
    }
    assert.ok(docked,'Lift should dock at floor '+depth);
    const gate=await page.evaluate(gateZ=>{
      const g=__game,{yaw,fx,fz}=g.F.lift;
      const d=(cabinPosition().z-gateZ)*0.9/1.62;
      const gx=g.P.x+fx*d,gz=g.P.z+fz*d;
      window.dockSnapshot={floor:g.F,car:g.scene.getObjectByName('Docked lift'),mesh:g.scene.children.find(o=>Array.isArray(o.material))};
      g.P.yaw=yaw;g.P.pitch=0;
      const closed=g.solidAt(gx,gz);
      tick(18);
      return {closed,open:!g.solidAt(gx,gz)};
    },liftGateZ);
    assert.deepEqual(gate,{closed:true,open:true});
    if(capture&&screenshots){
      await page.evaluate(()=>{window.liftShotFuel=__game.P.fuel;__game.P.fuel=0;__game.P.pitch=0.4});
      await shot('lift-interior-lit.png');
      await page.evaluate(()=>{__game.P.fuel=liftShotFuel;__game.P.pitch=0});
      await shot('lift-open-gate.png');
    }
    await page.evaluate(()=>{
      walk('KeyW',()=>cabinPosition().z < -11.65);
      tick(1,true);
    });
    if(capture&&screenshots){
      await page.screenshot({path:fileURLToPath(new URL('../shots/lift-bridge-approach.png',import.meta.url))});
    }
    const arrived=await page.evaluate(()=>{
      const g=__game;
      const gl=g.renderer.getContext(),sample=new Uint8Array(60*36*4),frames=[];
      const render=g.renderer.render;
      let drewMaze=false,drewShaft=false;
      g.renderer.render=function(scene,camera){
        drewMaze||=scene===g.scene;drewShaft||=scene===g.hub.scene;
        return render.call(this,scene,camera);
      };
      try{
        g.keys.KeyW=true;
        for(let i=0;i<20;i++){
          const before=shaderLinks;
          drewMaze=drewShaft=false;
          tick(1,true);
          gl.readPixels((gl.drawingBufferWidth>>1)-30,(gl.drawingBufferHeight>>1)-18,60,36,gl.RGBA,gl.UNSIGNED_BYTE,sample);
          let total=0;
          for(let j=0;j<sample.length;j+=4)total+=sample[j]+sample[j+1]+sample[j+2];
          frames.push({drewMaze,drewShaft,light:total/(sample.length*0.75),links:shaderLinks-before});
          if(cabinPosition().z < -12.75)break;
        }
      }finally{
        g.keys.KeyW=false;
        g.renderer.render=render;
      }
      const sameDock=g.scene.getObjectByName('Docked lift')===dockSnapshot.car&&g.F===dockSnapshot.floor&&dockSnapshot.mesh.parent===g.scene;
      return {depth:g.R.depth,fade:+getComputedStyle(document.getElementById('fade')).opacity,
        loading:!document.getElementById('loading').hidden,sameDock,crossed:cabinPosition().z< -12.75,frames};
    });
    const {frames,...status}=arrived;
    assert.deepEqual(status,{depth,fade:0,loading:false,sameDock:true,crossed:true});
    assert.ok(frames.every(f=>f.drewMaze&&!f.drewShaft),`The renderer switched scenes at the threshold: ${JSON.stringify(frames)}`);
    assert.ok(frames.every(f=>f.light>5),`A dark frame appeared at the threshold: ${JSON.stringify(frames)}`);
    assert.ok(frames.every(f=>f.links===0),`A new maze shader linked at the threshold: ${JSON.stringify(frames)}`);
    if(capture&&screenshots)await page.screenshot({path:fileURLToPath(new URL('../shots/lift-bridge-crossed.png',import.meta.url))});
  };
  const choose=async depth=>page.evaluate(depth=>{
    const g=__game;
    g.hub.place(0,-8.6,0,0);g.openStation('lift');
    document.getElementById('liftDepth').value=depth;
    document.getElementById('liftDestination').requestSubmit();
    if(!g.hub.riding)throw Error('The lobby lift did not depart');
  },depth);
  const board=async()=>page.evaluate(()=>{
    const g=__game,d=g.F.lift;
    g.P.yaw=d.yaw;g.P.pitch=0;
    walk('KeyS',()=>cabinPosition().z>=-8.4);
    const p=cabinPosition();
    g.P.yaw=d.yaw+Math.atan2(1.09-p.x,p.z+9.93);
    tick(1,true);
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'e',bubbles:true}));
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',key:'e',bubbles:true}));
    tick(1,true);
    return {active:g.activeStation,visible:getComputedStyle(document.getElementById('title')).visibility,
      lobby:!document.getElementById('liftLobby').hidden,gl:g.renderer.getContext().getError()};
  });
  const travel=async depth=>page.evaluate(depth=>{
    const g=__game;
    if(depth===0)document.getElementById('liftLobby').click();
    else{document.getElementById('liftDepth').value=depth;document.getElementById('liftDestination').requestSubmit()}
    if(g.state!=='title'||!g.hub.riding)throw Error('The docked lift did not depart');
  },depth);
  await choose(1);
  await arrive(1,true);
  const seed=await page.evaluate(()=>{
    const g=__game;window.firstFloor=g.F;
    g.P.shards=2;g.P.keys=1;g.R.score=549;
    walk('KeyW',()=>cabinPosition().z< -14.1);
    g.P.yaw+=Math.PI;
    return g.R.seed;
  });
  await shot('maze-lift-dock.png');
  const expectedPanel={active:'lift',visible:'visible',lobby:true,gl:0};
  assert.deepEqual(await board(),expectedPanel);
  await shot('maze-lift-controls.png');
  await page.evaluate(()=>{
    __game.P.yaw=__game.F.lift.yaw;
    walk('KeyW',()=>__game.activeStation===null);
    if(__game.state!=='play')throw Error('Leaving the terminal changed scenes');
  });
  assert.deepEqual(await board(),expectedPanel);
  await travel(3);
  await arrive(3);
  assert.deepEqual(await board(),expectedPanel);
  await travel(1);
  await arrive(1);
  assert.deepEqual(await page.evaluate(()=>({same:__game.F===firstFloor,shards:__game.P.shards,keys:__game.P.keys,score:__game.R.score,seed:__game.R.seed})),
    {same:true,shards:2,keys:1,score:549,seed});
  assert.deepEqual(await board(),expectedPanel);
  await travel(0);
  const lobby=await page.evaluate(()=>{
    for(let i=0;i<650&&__game.hub.riding;i++)tick();
    const g=__game;
    return {state:g.state,riding:g.hub.riding,y:g.menuPosition.y,boarded:g.hub.boarded,score:g.R.score};
  });
  assert.deepEqual(lobby,{state:'title',riding:false,y:0,boarded:true,score:549},errors.slice(0,4).join('\n'));
  await page.evaluate(()=>{
    const g=__game,p=g.menuPosition;g.hub.place(p.x,p.z,Math.PI,0);
    walk('KeyW',()=>g.menuPosition.z>-3);
    g.hub.place(0,-8.6,Math.PI,0);
  });
  await shot('lift-returned-to-lobby.png');
  await choose(1);
  await arrive(1);
  assert.equal(await page.evaluate(()=>__game.F===firstFloor&&__game.P.shards===2),true);
  assert.deepEqual(errors,[]);
  console.log('Dock, walk-away controls, downward and upward trips, lobby return, and floor progress passed.');
}finally{await browser.close();srv.close()}
