// node tools/moose_room_test.mjs -- tower defense, both endings, Keeper supplies, and the pet.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {Matrix4,Vector3} from 'three';
import {mooseDefenseGame,MOOSE_ACH,MOOSE_GRID,MOOSE_ROUNDS,MOOSE_TOWER_PRICE,MOOSE_SPIKE_PRICE,MOOSE_SYRUP_PRICE} from '../src/moose-defense.js';
import {TABLE_HEIGHT,TABLE_SCALE} from '../src/moose-arcade.js';

const sites=[[65,69,50,84],[66,70],[68,72]];
const {cols,rows,path}=MOOSE_GRID;
assert.equal(new Set(path).size,path.length,'the path does not reuse tiles');
assert.ok(!path.slice(1).some((i,n)=>Math.abs(i%cols-path[n]%cols)+Math.abs(Math.floor(i/cols)-Math.floor(path[n]/cols))!==1),
  'consecutive path tiles share one edge');
const rules=mooseDefenseGame();
const reject=()=>assert.fail('Invalid placement must not charge the player');
assert.equal(rules.build(path[0],reject),false);
assert.equal(rules.spike(sites[0][0],reject),false);
assert.equal(rules.build(sites[0][0],()=>false),false,'a tower requires gems');
assert.equal(rules.spike(path.at(-1),()=>false),false,'buying spikes requires gems');
assert.ok(rules.spike(path.at(-1),cost=>cost===MOOSE_SPIKE_PRICE),'the last path square accepts spikes');
assert.equal(rules.spike(path.at(-1),reject),false);
assert.equal(rules.syrup(sites[0][0],reject),false);
assert.equal(rules.syrup(path.at(-1),reject),false);
assert.equal(rules.syrup(path[0],()=>false),false);
assert.ok(rules.syrup(path[0],cost=>cost===MOOSE_SYRUP_PRICE));
assert.equal(rules.spike(path[0],reject),false);
rules.launch();rules.step(.8);
assert.ok(rules.slow>0&&rules.geese[0].slow>0,'every animal crossing the syrup slows down');
assert.equal(rules.hp,MOOSE_ROUNDS[0].hp,'syrup deals no damage');
assert.equal(rules.geese[0].hp,8);
rules.step(25);
assert.ok(!rules.syrups.has(path[0])&&rules.traps.size===0,'crossed syrup is used up at the end of the round');
let funds=12;
const campaign=mooseDefenseGame(),spend=cost=>{
  assert.equal(cost,MOOSE_TOWER_PRICE);
  if(funds<cost)return false;
  funds-=cost;return true;
};
const hitTypes=new Set();
sites.forEach((plan,r)=>{
  for(const site of plan)assert.ok(campaign.build(site,spend));
  assert.ok(campaign.launch());
  assert.equal(campaign.round,r);
  assert.equal(campaign.geese.length,r+1);
  for(let i=0;i<1000&&campaign.phase==='run';i++){
    campaign.step(.05);
    for(const hit of campaign.hits)hitTypes.add(hit.goose?'feathers':'blood');
  }
  assert.equal(campaign.cleared,r+1,'an affordable plan survives each round even at a low frame rate');
  assert.equal(campaign.phase,r<2?'break':'revive');
  funds+=MOOSE_ROUNDS[r].gems;
});
assert.deepEqual([...hitTypes].sort(),['blood','feathers']);
assert.equal(campaign.launch(),false,'revival must complete before collecting the pet');
for(let i=0;i<180;i++)campaign.step(1/60);
assert.equal(campaign.phase,'win');
const weak=mooseDefenseGame();
for(const site of [13,14,27,28])assert.ok(weak.build(site,()=>true));
weak.launch();
for(let i=0;i<1000&&weak.phase==='run';i++)weak.step(.05);
assert.equal(weak.phase,'lose','a poor layout can lose even with four towers');
const bossSites=[[65,77,50,20,49,64],[92,76],[62,79]];
function qualifyForBoss(){
  const game=mooseDefenseGame();
  let balance=18;
  for(const [round,plan] of bossSites.entries()){
    for(const site of plan)assert.ok(game.build(site,price=>{
      if(balance<price)return false;
      balance-=price;return true;
    }));
    assert.equal(game.bonus,false,'the bonus stays hidden before the third round ends');
    game.launch();game.step(25);
    balance+=MOOSE_ROUNDS[round].gems;
  }
  assert.equal(game.phase,'break');
  assert.ok(game.bonus&&game.distance<=(path.length-1)/2);
  return game;
}
const bonusLoss=qualifyForBoss();
bonusLoss.towers.clear();
assert.ok(bonusLoss.launch());
bonusLoss.step(25);
assert.equal(bonusLoss.phase,'win','losing the bonus preserves the moose victory');
assert.equal(bonusLoss.bonusWon,false);
const bonusSkip=qualifyForBoss();
assert.ok(bonusSkip.skipBonus());
bonusSkip.step(4);
assert.equal(bonusSkip.phase,'win','players can take the moose without fighting the bonus boss');
const crossedGoose=mooseDefenseGame();
Object.assign(crossedGoose,{phase:'break',round:1,cleared:2});
crossedGoose.launch();
crossedGoose.geese[0].distance=(path.length-1)/2+.1;
crossedGoose.spike(path[0],()=>true);crossedGoose.hp=1;
crossedGoose.step(1/60);
assert.equal(crossedGoose.phase,'revive','a goose past halfway blocks the bonus even if the moose falls early');

const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1120,height:700}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.addInitScript(()=>{
    window.__norender=true;
    window.requestAnimationFrame=()=>0;
    localStorage.setItem('emberdeep.quality','"high"');
  });
  await page.goto(new URL('../index.html',import.meta.url).href);
  const move=(dt,input={})=>page.evaluate(({dt,input})=>{
    const g=__game;
    for(let i=0;i<Math.round(dt*60);i++)g.ROOMS.update(1/60,input);
    g.resize();g.renderer.toneMappingExposure=1;g.ROOMS.render();
    document.getElementById('fade').style.opacity=g.ROOMS.fade();
    const gl=g.renderer.getContext();
    if(gl.getError()!==0)throw new Error('Room WebGL error');
  },{dt,input});
  async function tabletop(capture=false){
    if(capture){
      await move(.23,{my:-1});
      await page.evaluate(()=>__game.ROOMS.look(0,.30));
      await shot('moose-arcade-button-panel.png');
      await page.evaluate(()=>__game.ROOMS.look(0,-.30));
    }
    await move(capture?.19:.42,{my:-1});
    await page.getByRole('button',{name:'Play tabletop'}).click();
    await move(.56);
    assert.ok(await page.evaluate(()=>__game.ROOMS.state().table));
  }
  async function open(focus=true){
    await page.evaluate(()=>{
      const g=__game,door=g.F.sdoors.find(d=>d.kind==='moose')||g.F.sdoors[0];
      door.kind='moose';door.look='moose';door.used=false;g.sdoorOpen(door);
      if(g.ROOMS.kind!=='moose')throw new Error('Could not enter Mosquito Outpost');
    });
    await move(.78);
    if(focus)await tabletop();
  }
  async function shot(name){
    if(!process.env.MOOSE_PREVIEWS)return;
    await page.evaluate(()=>{
      const g=__game;g.resize();g.renderer.toneMappingExposure=1;
      if(g.state==='room')g.ROOMS.render();else{
        document.getElementById('hurt').style.opacity=0;
        g.render(3);g.drawHUD();g.drawMap();
      }
      if(g.P.mounted)document.getElementById('toast').style.opacity=0;
    });
    await page.screenshot({path:resolve(process.env.MOOSE_PREVIEWS,name),animations:'disabled'});
  }
  async function roomKey(key){
    await page.keyboard.down(key);
    await page.evaluate(()=>__game.ROOMS.update(1/60,__game.roomInput()));
    await page.keyboard.up(key);
    await page.evaluate(()=>__game.ROOMS.update(1/60,__game.roomInput()));
  }
  async function selectTile(index){
    const {width,height}=page.viewportSize();
    const {view,projection}=await page.evaluate(()=>{
      const cam=__game.ROOMS.cam;
      return {view:cam.matrixWorldInverse.toArray(),projection:cam.projectionMatrix.toArray()};
    });
    const col=index%cols,row=Math.floor(index/cols);
    const point=new Vector3((col-(cols-1)/2)*TABLE_SCALE,TABLE_HEIGHT+.034*TABLE_SCALE,(row-(rows-1)/2)*TABLE_SCALE);
    point.applyMatrix4(new Matrix4().fromArray(view)).applyMatrix4(new Matrix4().fromArray(projection));
    await page.mouse.click((point.x+1)*width/2,(1-point.y)*height/2);
    assert.ok((await page.locator('.moose-tile').textContent()).startsWith(String.fromCharCode(65+row)+(col+1)+' · '),
      'click selects the intended tile');
  }
  async function walkToExit(capture=false){
    const [x,z]=await page.evaluate(()=>__game.ROOMS.snap().arcade);
    await move(Math.abs(3.87-x)/4.07,{mx:Math.sign(3.87-x)});
    await move((z+3.03)/4.07,{my:-1});
    await move(.95,{mx:-1});
    if(capture)await shot('moose-arcade-exit-door.png');
    await move(.36,{my:-1});
    assert.ok(await page.getByRole('button',{name:'Exit arcade'}).isVisible(),'the physical exit responds when approached');
  }
  async function endRound(){
    await page.evaluate(()=>{
      const room=__game.ROOMS,state=room.state();
      for(let i=0;i<1500&&state.phase==='run';i++)room.update(1/60,{});
      if(state.phase==='run')throw new Error('Round did not finish');
    });
    await move(0);
  }
  await page.evaluate(()=>__game.startRun('OUTPOST',2,true));
  await open(false);
  await walkToExit(true);
  await roomKey('e');
  assert.deepEqual(await page.evaluate(()=>[__game.state,!!__game.ACH.mooseLose,__game.P.moose]),['play',false,false],
    'leaving before playing gives neither a pet nor the loss achievement');
  assert.match(await page.locator('#toast').textContent(),/forfeited Mosquito Outpost/);
  await open(false);
  assert.ok(await page.getByText('Approach the table to play').isVisible());
  assert.equal(await page.getByRole('button',{name:'Start round 1'}).count(),0);
  await shot('moose-arcade-arrival.png');
  await move(.36,{my:-1});
  await page.evaluate(()=>__game.ROOMS.look(Math.PI,0));
  await shot('moose-arcade-entrance-door.png');
  await page.evaluate(()=>__game.ROOMS.look(-Math.PI,0));
  await move(.36,{my:1});
  await move(.40,{lx:-1});
  await shot('moose-arcade-canadian-ranger.png');
  await move(.80,{lx:1});
  await shot('moose-arcade-uncle-sam.png');
  await move(.40,{lx:-1});
  await tabletop(true);
  const track=page.locator('#outpostTrack');
  const trackColor=()=>track.evaluate(el=>el.style.getPropertyValue('--track-color'));
  assert.match(await trackColor(),/hsl\(120 /);
  await roomKey('Space');
  await move(4.65);
  assert.match(await trackColor(),/hsl\((3\d|4\d)/);
  const before=await page.evaluate(()=>__game.ROOMS.snap());
  await roomKey('Backspace');
  await move(.45,{mx:1});
  const walking=await page.evaluate(()=>__game.ROOMS.snap());
  assert.equal(walking.arcade[5],false);
  assert.ok(walking.arcade[0]>before.arcade[0]+1,'the player can walk after leaving the table');
  assert.ok(walking.d>before.d,'the wave continues while the player walks around');
  await shot('moose-arcade-round-running.png');
  await roomKey('e');
  await move(3.65);
  assert.ok(await track.isVisible(),'the track bar is visible after returning to the table');
  assert.match(await trackColor(),/hsl\(0 /);
  assert.match(await page.locator('.moose-track output').textContent(),/^5\d%$/);
  await shot('moose-arcade-track-progress.png');
  await move(14);
  await shot('moose-defense-loss.png');
  await roomKey('Space');
  await roomKey('e');
  assert.ok(await page.getByText('Step away and use the exit door to return to the maze.').isVisible());
  await page.getByRole('button',{name:'Step away'}).click();
  await walkToExit();
  await roomKey('e');
  assert.deepEqual(await page.evaluate(()=>({lost:!!__game.ACH.mooseLose,pet:__game.P.moose,state:__game.state})),
    {lost:true,pet:false,state:'play'});
  assert.equal(await page.locator('#achToast b').textContent(),MOOSE_ACH.mooseLose.title);
  await open();
  await roomKey('Space');
  await move(1);
  await page.getByRole('button',{name:'Step away'}).click();
  await walkToExit();
  assert.equal(await page.evaluate(()=>__game.ROOMS.state().phase),'run');
  await page.getByRole('button',{name:'Exit arcade'}).click();
  assert.equal(await page.evaluate(()=>__game.state),'play');
  assert.match(await page.locator('#toast').textContent(),/forfeited Mosquito Outpost/);

  await page.evaluate(price=>{
    const g=__game;g.wallet=price;g.openTalk({type:'keeper',ph:0});
    g.talk.sel=g.talk.opts.findIndex(option=>option.label==='Spike trap');
    if(g.talk.sel<0)throw new Error('Keeper has no spikes');
    g.pickTalk();g.pickTalk();g.closeTalk();
  },MOOSE_SPIKE_PRICE);
  assert.deepEqual(await page.evaluate(()=>[__game.wallet,__game.P.spikeTraps]),[0,1]);
  await page.evaluate(()=>{__game.wallet=12});
  assert.ok(await page.evaluate(()=>__game.previewRoom('moose',7)));
  await tabletop();
  await roomKey('ArrowRight');
  await roomKey('q');
  assert.equal(await page.evaluate(()=>__game.P.spikeTraps),0);
  await roomKey('ArrowUp');
  await roomKey('q');
  assert.ok((await page.locator('.moose-stats').textContent()).includes('7 gems'));
  await selectTile(path[0]);
  await roomKey('z');
  assert.match(await page.locator('.moose-tile').textContent(),/Maple syrup/);
  assert.match(await page.locator('.moose-stats').textContent(),/4 gems/);
  assert.equal(await page.evaluate(()=>__game.wallet),12,'buying in preview leaves the real wallet alone');
  await page.evaluate(()=>__game.roomLeave());
  assert.equal(await page.evaluate(()=>__game.P.spikeTraps),1,'preview restores inventory');
  await page.evaluate(()=>{__game.wallet=20});
  await open();
  const panel=page.locator('#moosePanel');
  await selectTile(path[4]);
  assert.ok(await panel.getByRole('button',{name:/Build tower/}).isDisabled());
  await panel.getByRole('button',{name:/Lay spikes/}).click();
  assert.equal(await page.evaluate(()=>__game.P.spikeTraps),0);
  assert.equal(await page.evaluate(()=>__game.wallet),20,'placing a Keeper trap never charges twice');
  await selectTile(path.at(-1));
  await panel.getByRole('button',{name:'Lay spikes · 5 gems'}).click();
  assert.equal(await page.evaluate(()=>__game.wallet),15,'outpost spikes can be purchased directly with gems');
  await selectTile(path[1]);
  await panel.getByRole('button',{name:'Pour syrup · 3 gems'}).click();
  assert.equal(await page.evaluate(()=>__game.wallet),12,'syrup spends the shared wallet');
  for(const [round,plan] of sites.entries()){
    for(const site of plan){
      await selectTile(site);
      assert.ok(await panel.getByRole('button',{name:/Lay spikes/}).isDisabled());
      await panel.getByRole('button',{name:/Build tower/}).click();
    }
    assert.equal(await page.evaluate(()=>__game.wallet),[0,0,2][round],'towers spend the same wallet used for gems');
    if(round===0){await move(.10);await shot('moose-grid-build.png')}
    await panel.getByRole('button',{name:'Start round '+(round+1)}).click();
    if(round===0){
      await move(1.1);
      await shot('moose-outpost-geese-syrup.png');
      const impacts=new Set();
      for(let n=0;n<2&&impacts.size<2;n++){
        const impact=await page.evaluate(seen=>{
          const room=__game.ROOMS,s=room.state();
          for(let i=0;i<1000&&s.phase==='run';i++){
            room.update(1/60,{});
            const h=s.hits.find(hit=>!seen.includes(hit.goose));
            if(h)return h.goose?'feathers':'blood';
          }
        },[...impacts].map(i=>i==='feathers'));
        assert.ok(impact,'both kinds of impacts occur in the room');
        impacts.add(impact);
        await move(.13);await shot('moose-outpost-'+impact+'.png');
      }
    }
    if(round===2){
      await move(5);
      const firing=await page.evaluate(()=>{
        const r=__game.ROOMS,s=r.state();
        for(let i=0;i<300&&s.phase==='run'&&!s.shots.some(shot=>shot.age>.09&&shot.age<.18);i++)r.update(1/60,{});
        return s.shots.some(shot=>shot.age>.09&&shot.age<.18);
      });
      assert.ok(firing,'towers launch visible mosquito projectiles');
      await shot('moose-grid-round-three.png');
    }
    await endRound();
    assert.deepEqual(await page.evaluate(()=>[__game.wallet,__game.R.gems,__game.ROOMS.state().phase]),
      [[6,6,'break'],[8,14,'break'],[14,26,'revive']][round]);
    assert.equal(await page.evaluate(()=>__game.P.moose),false,'no pet during the rounds or revival');
  }
  assert.equal(await panel.getByRole('button',{name:'Collect moose and leave'}).count(),0);
  await move(1.38);
  await shot('moose-grid-revival.png');
  await move(1.6);
  assert.ok(await page.evaluate(()=>__game.ROOMS.snap().flagT>=1.5),'the winning flag is the American flag');
  await shot('moose-defense-win.png');
  await panel.getByRole('button',{name:'Step away'}).click();
  await walkToExit();
  await page.getByRole('button',{name:'Exit arcade'}).click();
  assert.deepEqual(await page.evaluate(()=>({won:!!__game.ACH.mooseWin,pet:__game.P.moose,state:__game.state})),
    {won:true,pet:true,state:'play'});
  assert.equal(await page.locator('#achToast b').textContent(),MOOSE_ACH.mooseWin.title);

  await page.keyboard.press('r');
  assert.ok(await page.evaluate(()=>__game.P.mounted));
  await page.evaluate(()=>{
    const g=__game,F=g.F,P=g.P;
    const open=(x,z)=>x>0&&z>0&&x<F.W-1&&z<F.H-1&&F.g[z*F.W+x]===0&&!F.safeMask[z*F.W+x]&&!F.pocketMask[z*F.W+x];
    let spot;
    for(let z=1;z<F.H-1&&!spot;z++)for(let x=2;x<F.W-5&&!spot;x++)
      if([-1,0,1,2,3,4].every(dx=>open(x+dx,z)))spot=[x,z];
    if(!spot)throw new Error('No open hall for pet test');
    const [x,z]=spot;
    window.testHall=spot;
    P.x=x+.5;P.z=z+.5;P.yaw=0;P.pitch=-.32;P.inSafe=false;P.inv=100;
    document.getElementById('toast').style.opacity=0;
    g.onTileChange();F.shades.length=0;
    F.shades.push({type:0,x:x-.5,z:z+.5,gx:x-1,gy:z,px:x-2,py:z,face:0,state:1,stun:0,ph:0,think:0,d:1});
  });
  const trapDamage=await page.evaluate(()=>{
    const g=__game,p=g.P,old=g.F.traps,ph=(.5-g.R.time%2.8+2.8)%2.8;
    p.hp=3;p.inv=p.ward=0;
    g.F.traps=[{x:p.x,z:p.z,ph,up:false}];
    g.update(1/60);
    const mounted=p.hp;
    p.mounted=false;g.update(1/60);
    const dismounted=p.hp;
    g.F.traps=old;p.mounted=true;p.inv=100;
    return [mounted,dismounted];
  });
  assert.deepEqual(trapDamage,[3,2],'active maze spikes hurt on foot but leave a rider untouched');
  const speedRatio=await page.evaluate(()=>{
    const g=__game,p=g.P,x=p.x,z=p.z;
    const distance=mounted=>{
      Object.assign(p,{x,z,vx:0,vz:0,mounted,chill:0});
      g.onTileChange();g.keys.KeyW=true;
      for(let i=0;i<27;i++)g.update(1/60);
      delete g.keys.KeyW;
      return p.x-x;
    };
    const walk=distance(false),ride=distance(true);
    p.x=x;p.z=z;p.vx=p.vz=0;g.onTileChange();
    const s=g.F.shades[0];
    Object.assign(s,{x:x-1,z,gx:Math.floor(x)-1,gy:Math.floor(z),state:1,stun:0});
    return ride/walk;
  });
  assert.ok(Math.abs(speedRatio-1.25)<.015,'the mount increases measured maze speed by 25 percent');
  await shot('moose-pet-mounted.png');
  await page.keyboard.press('g');
  const sacrifice=await page.evaluate(()=>{
    const g=__game,s=g.F.shades[0],lure=s.mooseLure;
    if(!lure?.active)throw new Error('An active pursuer is still hunting the player');
    window.testMoose={s,lure};
    const gap=()=>Math.hypot(s.x-lure.x,s.z-lure.z);
    const initial=gap();
    let traveled=0;
    for(let i=0;i<45;i++){
      const {x,z}=lure;
      g.update(1/60);
      traveled+=Math.hypot(lure.x-x,lure.z-z);
    }
    g.P.pitch=-.11;
    return {owned:g.P.moose,mounted:g.P.mounted,forward:lure.x-g.P.x,pursuing:s.mooseLure?.active,
      speed:traveled/.75,gapGained:gap()-initial,hp:lure.hp};
  });
  assert.equal(sacrifice.owned,false);
  assert.equal(sacrifice.mounted,false);
  assert.ok(sacrifice.forward>.25&&sacrifice.pursuing);
  assert.ok(sacrifice.speed>4.9&&sacrifice.gapGained>1&&sacrifice.hp===3,'the released moose pulls away from a chasing Shade');
  await page.evaluate(()=>{__game.F.shades.length=0});
  await shot('moose-pet-lure.png');
  const health=await page.evaluate(()=>{
    const g=__game,{lure,s}=window.testMoose;
    g.F.shades.length=0;
    const initial=lure.hp;
    for(let i=0;i<720;i++)g.update(1/60);
    const roaming=lure.active&&lure.step>lure.path.length;
    g.F.shades.push(s);
    const contact=()=>{
      Object.assign(s,{x:lure.x,z:lure.z,gx:lure.tx,gy:lure.tz,state:1,stun:0});
      g.update(1/60);return lure.hp;
    };
    const first=contact(),blocked=contact(),hits=[first];
    for(let i=0;i<2;i++){
      s.stun=2;
      for(let j=0;j<54;j++)g.update(1/60);
      hits.push(contact());
    }
    const stopped=!lure.active;
    for(let i=0;i<30;i++)g.update(1/60);
    return {initial,roaming,blocked,hits,stopped,releasedPursuer:!s.mooseLure};
  });
  assert.deepEqual(health,{initial:3,roaming:true,blocked:2,hits:[2,1,0],stopped:true,releasedPursuer:true});
  await page.evaluate(()=>{__game.wallet=18});
  await open();
  for(const [round,plan] of bossSites.entries()){
    assert.equal(await panel.getByText(/Mother Goose/).count(),0,'Mother Goose stays hidden during the three ordinary rounds');
    for(const site of plan){
      await selectTile(site);
      await panel.getByRole('button',{name:/Build tower/}).click();
    }
    await panel.getByRole('button',{name:'Start round '+(round+1)}).click();
    await endRound();
  }
  await move(3);
  await shot('moose-outpost-bonus-unlocked.png');
  await panel.getByRole('button',{name:'Start bonus round 4'}).click();
  await move(2);
  assert.ok(await panel.getByRole('progressbar',{name:'Mother Goose health'}).isVisible());
  await shot('moose-outpost-mother-goose.png');
  await endRound();
  assert.equal(await page.evaluate(()=>__game.ROOMS.state().phase),'hatch');
  await move(2.08);
  await shot('moose-outpost-golden-egg.png');
  await move(4);
  assert.ok(await panel.getByText('Step away and use the exit door to return to the maze.').isVisible());
  await panel.getByRole('button',{name:'Step away'}).click();
  await walkToExit();
  await page.getByRole('button',{name:'Exit arcade'}).click();
  const scout=await page.evaluate(()=>{
    const g=__game,{F,P}=g;
    const [x,z]=window.testHall,scout=F.scout;
    if(!scout)return null;
    Object.assign(P,{x:x+.5,z:z+.5,yaw:0,pitch:-.09,inSafe:false,inv:100});
    Object.assign(scout,{x:P.x,z:P.z,yaw:0,path:[]});
    g.onTileChange();
    const tile=z*F.W+x+3;F.seen[tile]=0;
    const mob={type:0,x:x+3.5,z:z+.5,gx:x+3,gy:z,face:0,state:0,stun:10,ph:0,think:0,vis:false};
    F.shades=[mob];
    for(let i=0;i<32;i++)g.update(1/60);
    Object.assign(mob,{x:x+4.3,z:z+.78});
    document.getElementById('achToast').style.opacity=0;
    g.drawMap();g.drawHUD();
    return {moose:P.moose,advanced:scout.x-P.x>.7,mapped:!!F.seen[tile]&&!!scout.mapped[tile],marked:scout.contacts.includes(mob)};
  });
  assert.deepEqual(scout,{moose:true,advanced:true,mapped:true,marked:true});
  assert.match(await page.locator('#scoutLine').textContent(),/1 hostile marked/);
  await shot('moose-outpost-turbo-maze.png');
  await page.evaluate(()=>__game.loadFloor(2));
  assert.equal(await page.evaluate(()=>!!__game.F.scout),false,'the scout expires when leaving the floor');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>__game.previewRoom('moose',7)));
  await move(.78);
  await tabletop();
  const release=page.getByRole('button',{name:'Start round 1'});
  assert.ok(await release.isVisible());
  const box=await release.boundingBox();
  assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=390&&box.y+box.height<=844);
  await shot('moose-defense-mobile.png');
  await page.evaluate(()=>{
    const g=__game;g.roomLeave();g.P.moose=g.P.mounted=true;
    const [x,z]=window.testHall;
    Object.assign(g.P,{x:x+.5,z:z+.5,yaw:0,inSafe:false});
    g.onTileChange();
    Object.assign(g.MP,{on:true,guest:true,host:false,wantJoin:true,hostId:'test-host',
      room:{send(message,to){if(message.k==='mooseLure'&&to==='test-host')window.mooseRequest=message}}});
  });
  await page.keyboard.press('g');
  const acknowledged=await page.evaluate(()=>{
    const g=__game,request=window.mooseRequest;
    if(!request||!g.P.moose||!g.P.mounted)return false;
    const result={k:'mooseResult',d:request.d,q:request.q,ok:true};
    g.mpRecv(result,'other-peer');
    if(!g.P.moose)return false;
    g.mpRecv(result,'test-host');
    return !g.P.moose&&!g.P.mounted&&!g.P.moosePending;
  });
  assert.ok(acknowledged,'a guest consumes the pet only after the host accepts the sacrifice');
  assert.deepEqual(errors,[]);
  console.log('Outpost rounds, gem purchases, syrup, geese, damage effects, achievements, and maze moose speed, immunity, roaming, and hearts passed.');
}finally{
  await browser.close();
}
