// Verify both input devices against the shared actions and the room state machines.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {roomActions} from '../src/room-controls.js';

const actions=(mode,keys={},pressed=[])=>roomActions(keys,Object.assign([],Object.fromEntries(pressed.map(i=>[i,true]))),{mode});
for(const [action,key,button] of [
  ['press','KeyE',2],['back','Escape',1],['alternate','KeyQ',3],['tool','KeyZ',5],
  ['start','Enter',9],['navUp','ArrowUp',12],['navDown','ArrowDown',13],['navLeft','ArrowLeft',14],['navRight','ArrowRight',15],
]){
  assert.ok(actions('table',{[key]:true})[action]);
  assert.ok(actions('table',{},[button])[action]);
}
assert.ok(actions('walk',{KeyX:true}).crouch&&actions('walk',{ControlLeft:true}).crouch);
assert.ok(actions('walk',{},[13]).crouch&&!actions('table',{},[13]).crouch&&!actions('choice',{},[13]).crouch);
assert.ok(roomActions({},[],{mode:'walk',touchCrouch:true}).crouch);
assert.ok(actions('walk',{Space:true}).jump&&actions('walk',{},[0]).jump);
assert.ok(!actions('table',{Space:true},[0]).jump&&!actions('table',{Space:true},[0]).start);
assert.ok(!actions('walk',{Enter:true,KeyQ:true},[3,9]).start);
assert.ok(actions('walk',{},[6]).sprint&&actions('walk',{},[10]).sprint);
assert.ok(actions('choice',{},[14]).navLeft&&!actions('walk',{},[14]).navLeft);
assert.ok(roomActions({},[],{mode:'walk',touchPress:true}).press);
assert.ok(roomActions({},[],{mode:'walk',touchJump:true}).jump);

const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.LIFT_BROWSER||undefined});
const build=new URL('../index.html',import.meta.url);
try{
  const page=await browser.newPage({viewport:{width:1120,height:700}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.__norender=true;
    window.requestAnimationFrame=fn=>{window.nextGameFrame=fn;return 0};
    window.pressedPad=[];
    window.mockPad=false;
    Object.defineProperty(navigator,'getGamepads',{value:()=>window.mockPad?[{
      id:'Test controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],
      buttons:Array.from({length:16},(_,i)=>({pressed:window.pressedPad.includes(i),value:+window.pressedPad.includes(i)})),
    }]:[]});
    localStorage.setItem('emberdeep.quality','"high"');
  });
  await page.goto(build.href);
  await page.evaluate(()=>{
    __game.startRun('ROOMCONTROLS',2,true);
    __game.wallet=30;
    window.controlFrame=window.nextGameFrame;
    window.controlTime=performance.now();
    window.controls=(buttons=[],frames=1)=>{
      window.mockPad=true;window.pressedPad=buttons;
      for(let i=0;i<frames;i++){window.controlTime+=1000/60;window.controlFrame(window.controlTime)}
    };
  });
  async function open(kind){
    await page.evaluate(kind=>{
      const g=__game,r=g.ROOMS;
      if(g.state==='room')g.roomLeave();
      r.theaterOpts.noMic=true;
      if(!g.previewRoom(kind,kind==='mirror'?777:7))throw new Error('Cannot preview '+kind);
      if(kind==='theater')r.theaterTest({reel:true});
      const idle={mx:0,my:0,lx:0,ly:0};
      for(let i=0;i<46;i++)r.update(1/60,idle);
      document.getElementById('fade').style.opacity=r.fade();
    },kind);
  }
  async function screenshot(name){
    if(!process.env.ROOM_CONTROL_PREVIEWS)return;
    await page.evaluate(()=>{__game.resize();__game.renderer.toneMappingExposure=1;__game.ROOMS.render()});
    await page.screenshot({path:resolve(process.env.ROOM_CONTROL_PREVIEWS,name),animations:'disabled'});
  }
  const pad=async buttons=>{
    await page.evaluate(buttons=>{window.controls(buttons);window.controls()},buttons);
  };
  await open('kiln');
  await pad([]);
  assert.match(await page.locator('#roomHud').textContent(),/press X/);
  await screenshot('room-controls-kiln.png');

  await open('mirror');
  await page.evaluate(()=>{
    const r=__game.ROOMS,s=r.state();
    Object.assign(s,s.canAim);
    r.update(1/60,{press:true});r.update(1/60,{});
    if(!s.held)throw new Error('Could not pick up the mirror spray can');
    while(s.t<s.mir.CHOICE+.2)r.update(1/60,{});
  });
  assert.equal(await page.evaluate(()=>__game.ROOMS.controlMode()),'choice');
  await pad([15]);
  assert.equal(await page.locator('[data-room-choice="1"]').getAttribute('aria-pressed'),'true');
  await screenshot('room-controls-mirror.png');
  await pad([0]);
  assert.equal(await page.evaluate(()=>__game.ROOMS.state().ch),0);
  await pad([2]);
  assert.equal(await page.evaluate(()=>__game.ROOMS.state().ch),2);

  await open('theater');
  await pad([2]);
  const theaterHud=page.locator('#roomHud');
  assert.match(await theaterHud.textContent(),/Hold X to speak.*yell/i);
  await screenshot('room-controls-theater.png');
  await page.evaluate(()=>{
    const s=__game.ROOMS.state();
    Object.assign(s,{st:'attack',insults:2,hint:'Yell it!',hintT:3});
    s.hudNow();
  });
  assert.match(await theaterHud.textContent(),/SILENCE, PEASANTS/);
  assert.match(await theaterHud.textContent(),/Yell it!/);
  await screenshot('theater-yell-hint-mic-off.png');
  for(const mic of ['asking','ok']){
    await page.evaluate(mic=>{
      const s=__game.ROOMS.state();
      s.mic=mic;s.hudNow();
    },mic);
    assert.doesNotMatch(await theaterHud.textContent(),/yell|silence, peasants/i);
  }
  await screenshot('theater-yell-hint-mic-on.png');
  await page.evaluate(()=>{
    const s=__game.ROOMS.state();
    s.st='calm';s.hudNow();
  });
  assert.match(await theaterHud.textContent(),/Microphone listening/);
  assert.doesNotMatch(await theaterHud.textContent(),/yell/i);

  await open('galaxy');
  await pad([]);
  assert.match(await page.locator('#roomHud').textContent(),/Right stick/);
  await screenshot('room-controls-galaxy.png');

  await open('moose');
  await page.evaluate(()=>{for(let i=0;i<27;i++)__game.ROOMS.update(1/60,{my:-1})});
  await pad([2]);
  assert.equal(await page.evaluate(()=>__game.ROOMS.controlMode()),'table');
  await pad([15]); // Center path tile, beside the initial snow tile.
  await page.evaluate(()=>{for(let i=0;i<36;i++)__game.ROOMS.update(1/60,{})});
  assert.match(await page.locator('.moose-hint').textContent(),/X tower.*Y spikes.*RB syrup.*Menu start.*B back/);
  await screenshot('room-controls-outpost.png');
  await pad([0]);
  assert.equal(await page.evaluate(()=>__game.ROOMS.state().phase),'build');
  await pad([9]);
  assert.equal(await page.evaluate(()=>__game.ROOMS.state().phase),'run');
  await pad([1]);
  assert.equal(await page.evaluate(()=>__game.ROOMS.controlMode()),'walk');
  assert.deepEqual(errors,[]);

  const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await mobile.addInitScript(()=>{
    window.requestAnimationFrame=fn=>{window.nextGameFrame=fn;return 0};
    window.__norender=true;
  });
  await mobile.goto(build.href);
  await mobile.evaluate(()=>{
    const g=__game,r=g.ROOMS;
    g.startRun('TOUCHCONTROLS',2,true);
    g.previewRoom('mirror',777);
    const s=r.state();
    Object.assign(s,s.canAim);
    r.update(1/60,{press:true});
    while(s.t<s.mir.CHOICE+.2)r.update(1/60,{});
    window.nextGameFrame(performance.now());
    g.resize();g.renderer.toneMappingExposure=1;r.render();
  });
  assert.match(await mobile.locator('#roomHud').textContent(),/Tap an option/);
  assert.equal(await mobile.locator('#tJump').textContent(),'JUMP');
  assert.ok(await mobile.locator('#tFlash').isHidden());
  if(process.env.ROOM_CONTROL_PREVIEWS){
    await mobile.screenshot({path:resolve(process.env.ROOM_CONTROL_PREVIEWS,'room-controls-touch.png'),animations:'disabled'});
  }
  await mobile.getByRole('button',{name:/Suck your thumb/}).tap();
  assert.equal(await mobile.evaluate(()=>__game.ROOMS.state().ch),2);
  console.log('Shared keyboard, standard gamepad, and touch actions passed across the room controls.');
}finally{
  await browser.close();
}
