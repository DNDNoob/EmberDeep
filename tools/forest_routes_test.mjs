// node tools/forest_routes_test.mjs (requires a built index.html)
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.LIFT_BROWSER||undefined,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage();
  await page.addInitScript(()=>{window.__norender=true;window.requestAnimationFrame=()=>0});
  await page.goto(new URL('../index.html',import.meta.url).href);
  await page.waitForFunction(()=>window.__game,null,{polling:100});
  const generation=await page.evaluate(()=>{
    const G=window.__game,issues=[];
    for(const depth of [7,23])for(let i=0;i<24;i++){
      const seed='CREEK'+i,F=G.genFloor(seed,depth),{g,W,H,start,exit,forestRoutes:routes}=F;
      const label=`${depth}/${seed}`;
      if(routes.roots.length!==2)issues.push(`${label} has ${routes.roots.length} shortcuts`);
      const closed=g.slice();
      for(const root of routes.roots)closed[root.tz*W+root.tx]=1;
      if(F.door){
        const key=F.items.find(p=>p.type==='key');
        if(G.bfs(closed,W,H,start.tx,start.ty)[key.ty*W+key.tx]<0)issues.push(`${label} has a key behind a shortcut`);
        closed[F.door.ty*W+F.door.tx]=0;
      }
      const paths=G.bfs(closed,W,H,start.tx,start.ty);
      if(paths[exit.ty*W+exit.tx]<=0)issues.push(`${label} has no exit route without crouching`);
      for(const item of F.items.filter(p=>p.type==='shard')){
        if(paths[item.ty*W+item.tx]<0)issues.push(`${label} has a shard behind a shortcut`);
      }
      for(const {tx,tz,dx,dz} of routes.roots){
        const target=(tz+dz)*W+tx+dx;
        if(G.bfs(closed,W,H,tx-dx,tz-dz)[target]<6||G.bfs(g,W,H,tx-dx,tz-dz)[target]!==2){
          issues.push(`${label} has a shortcut that does not bypass a detour`);
        }
      }
    }
    return issues;
  });
  assert.deepEqual(generation,[]);
  console.log('48 generated floors have two optional crouch shortcuts and reachable objectives');

  const result=await page.evaluate(()=>{
    const G=window.__game,{P,keys}=G;
    G.startRun('CREEK',7,true);
    const pursuer=G.F.shades[0];
    G.F.shades.length=0;
    const {creek,roots,oak,arch}=G.F.forestRoutes;
    const tick=(count,each=()=>{})=>{for(let i=0;i<count;i++){G.update(1/120);each()}};
    const place=(x,z,y=0,yaw=0)=>{
      for(const key of ['KeyW','KeyS','KeyX','Space'])keys[key]=false;
      Object.assign(P,{x,z,y,yaw,pitch:0,vx:0,vz:0,vy:0,inv:100,chill:0,jumpQ:0,crouched:false,crouchBlend:0});
      G.onTileChange();
    };
    place(creek.mid-1.6,creek.bridge);
    keys.KeyW=true;
    let bridgeMin=0,bridgeMax=0;
    tick(134,()=>{bridgeMin=Math.min(bridgeMin,P.y);bridgeMax=Math.max(bridgeMax,P.y)});
    const bridge=[P.x-creek.mid,bridgeMin,bridgeMax];

    const wetZ=creek.z0+3.5;
    place(creek.mid,wetZ);
    tick(56);
    const bed=P.y,wet=P.inWater;
    keys.KeyW=true;
    tick(28);
    const wade=[bed,wet,P.x-creek.mid];
    tick(120);
    wade.push(P.y,P.inWater);

    const center=creek.stones[1];
    place(center.x-1.65,center.z);
    keys.KeyW=true;keys.Space=true;
    tick(1);keys.Space=false;
    let jumpHeight=P.y;
    tick(73,()=>{jumpHeight=Math.max(jumpHeight,P.y)});
    const jump=[P.x-center.x,P.y,center.y,jumpHeight,P.inWater];

    const {x,z,dx,dz}=roots[0],yaw=Math.atan2(dz,dx);
    place(x-dx*1.23,z-dz*1.23,0,yaw);
    const along=()=>((P.x-x)*dx+(P.z-z)*dz);
    keys.KeyW=true;tick(100);
    const stand=[along(),document.getElementById('prompt').textContent];
    keys.KeyX=true;tick(54);
    const under=[along(),P.crouched,document.getElementById('prompt').textContent];
    Object.assign(pursuer,{x:x-dx*.81,z:z-dz*.81,gx:Math.floor(x-dx*.81),gy:Math.floor(z-dz*.81),state:1,think:0});
    G.F.shades.push(pursuer);
    const hp=P.hp;
    P.inv=0;keys.KeyW=false;tick(36);
    const lostPursuer=pursuer.state===0&&P.hp===hp&&((pursuer.x-x)*dx+(pursuer.z-z)*dz)<-.5;
    G.F.shades.length=0;
    keys.KeyX=keys.KeyW=false;tick(5);
    const staysLow=P.crouched;
    keys.KeyW=true;tick(90);
    const exited=[along(),P.crouched];

    place(oak.x-.8,oak.z);
    keys.KeyW=true;tick(45);
    const oakBlock=P.x-oak.x;
    keys.Space=true;tick(1);keys.Space=false;tick(73);
    const oakJump=P.x-oak.x;
    place(arch.x,arch.z-1,0,Math.PI/2);
    keys.KeyW=true;tick(85);
    return {bridge,wade,jump,stand,under,lostPursuer,staysLow,exited,oakBlock,oakJump,archWalk:P.z-arch.z};
  });
  const {bridge,wade,jump,stand,under,lostPursuer,staysLow,exited,oakBlock,oakJump,archWalk}=result;
  assert.ok(bridge[0]>1.35&&bridge[1]>=0&&bridge[2]>.04,JSON.stringify(result));
  assert.ok(wade[0]<-.22&&wade[1]&&wade[2]>.2&&wade[2]<.4&&wade[3]===0&&!wade[4],JSON.stringify(result));
  assert.ok(Math.abs(jump[0])<.13&&Math.abs(jump[1]-jump[2])<.04&&jump[3]>.4&&!jump[4],JSON.stringify(result));
  assert.ok(stand[0]<-.43&&stand[1]==='Hold X to crouch',JSON.stringify(result));
  assert.ok(Math.abs(under[0])<.3&&under[1]&&under[2]==='Hidden under the roots',JSON.stringify(result));
  assert.ok(lostPursuer&&staysLow&&exited[0]>.68&&!exited[1],JSON.stringify(result));
  assert.ok(oakBlock<-.28&&oakJump>.28&&archWalk>.6,JSON.stringify(result));
  console.log('Real player movement crosses the creek, clears the oak, passes the arch, and loses a pursuer under the roots');
}finally{
  await browser.close();
}
