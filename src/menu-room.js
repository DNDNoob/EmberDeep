import * as THREE from 'three';
import {bobY, createRoomWalker, lookBy, lookStep} from './movement.js';
import {createArchiveHall, worldSign} from './archive-hall.js';
import {buildAsteroidLobby} from './asteroid-lobby.js';
import {createMineLanding,createMineRockGap,createShaftHead,landingMazeZ} from './mine-shaft.js';

const portals=[
  {id:'doors',x:-15.35,name:'Door Archive',color:0xb9c4ff},
  {id:'floors',x:-6.55,name:'Floor Archive',color:0x9de1c9},
  {id:'mobs',x:6.55,name:'Mob Archive',color:0xf3b29b},
  {id:'glitches',x:15.35,name:'Glitch Archive',color:0xd9b3f9}
];
const wallZ=-7,eye=1.62,floorMin=8.2,floorMax=17;
const liftGateZ=-10.75,landingEntranceZ=landingMazeZ-0.8,liftExitHalfWidth=0.47;
const terminalWidth=4.5,terminalHeight=2.98;
const screenWidth=900,screenHeight=596;
const clamp=THREE.MathUtils.clamp;
export const onLiftPlatform=({x,z})=>Math.abs(x)<1.66&&z<wallZ-0.3&&z>liftGateZ;

export function createMenuRoom(renderer,{sfx,asset,activate,enterLanding,sampleFloor,prepareLanding,landingGlimpse,passingLook,onLeavePanel,createVisitor}){
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x14121d);
  scene.fog=new THREE.Fog(0x17151f,24,64);
  const lobby=new THREE.Group();scene.add(lobby);
  const camera=new THREE.PerspectiveCamera(61,1,0.06,77);
  const view={yaw:0,pitch:0};
  const cube=new THREE.BoxGeometry();
  const material=(color,options)=>new THREE.MeshStandardMaterial({color,roughness:0.78,...options});
  const stone=material(0x5b5965),dark=material(0x272530),iron=material(0x383540,{metalness:0.52});
  const brass=material(0xa68152,{metalness:0.44}),runner=material(0x572924),black=material(0x171620);
  const gold=new THREE.MeshBasicMaterial({color:0xeab379});
  const green=new THREE.MeshBasicMaterial({color:0x86d8b3});
  const keyMaterial=material(0x6e7880,{roughness:0.57});
  const keyGeometry=new THREE.BoxGeometry(0.18,0.035,0.105);
  const proxy=new THREE.MeshBasicMaterial({visible:false});
  const hallTargets=[],targets=[],terminals={},galleries=new Map();
  const visitors=new Map(),stationLabels={};
  const zero={mx:0,my:0,lx:0,ly:0};
  let ride=null,focus=null,panel=null,guest=null,hosting=false,channel=null;
  let sharedSettings=null;
  let sharedTexture=null,defaultSettingsTexture=null;
  let sharedLift=null,liftAway=false;

  function box(parent,mat,x,y,z,w,h,d){
    const mesh=new THREE.Mesh(cube,mat);
    mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
  }
  function light(parent,color,power,x,y,z,range){
    const lamp=new THREE.PointLight(color,power,range);
    lamp.position.set(x,y,z);parent.add(lamp);
  }
  function target(parent,entry,x,y,z,w,h,d){
    const mesh=box(parent,proxy,x,y,z,w,h,d);
    mesh.userData.entry=entry;hallTargets.push(mesh);targets.push(mesh);
  }
  function mounted(parent,text,x,y,z,w,h,options={}){
    const mount=new THREE.Group();
    mount.position.set(x,y,z);mount.rotation.y=options.reverse?Math.PI:0;parent.add(mount);
    box(mount,iron,0,0,-0.047,w+0.11,h+0.11,0.095);
    return worldSign(mount,text,0,0,0.005,w,h,options);
  }
  const walker=createRoomWalker({eye,x:0,z:13.1,speedMul:()=>0.76,o:{sfx},collide(b){
    if(ride){
      b.x=clamp(b.x,-1.58,1.58);
      b.z=Math.min(b.z,-7.4);
      if(ride.gate<1){
        b.z=Math.max(b.z,liftGateZ+0.35);
      }else if(!ride.onLanding&&Math.abs(b.x)>liftExitHalfWidth){
        b.z=Math.max(b.z,liftGateZ+0.23);
      }else if(b.z<liftGateZ-0.12){
        ride.onLanding=true;
        b.x=clamp(b.x,-liftExitHalfWidth,liftExitHalfWidth);
        b.z=Math.max(b.z,landingEntranceZ-0.06);
      }else if(b.z>=liftGateZ)ride.onLanding=false;
      return;
    }
    b.x=clamp(b.x,-20.1,20.1);b.z=Math.min(14.55,b.z);
    if(b.z>=wallZ)channel=null;
    else {
      channel??=!liftAway&&Math.abs(b.x)<1.71?'lift':portals.find(portal=>Math.abs(b.x-portal.x)<2.04);
      if(channel==='lift'){
        b.x=clamp(b.x,-1.63,1.63);b.z=Math.max(-10.27,b.z);
      }else if(channel){
        b.x=clamp(b.x,channel.x-2.03,channel.x+2.03);
        b.z=Math.max(wallZ+(galleries.get(channel.id)?.end||-10)+0.34,b.z);
      }else b.z=wallZ;
    }
    for(const desk of Object.values(terminals)){
      if(Math.abs(b.x-desk.x)<2.48&&b.z>desk.z-0.45&&b.z<desk.z+0.57)b.z=desk.z+0.57;
    }
  }});

  scene.add(new THREE.HemisphereLight(0xddd5f9,0x877075,1.22));
  light(lobby,0xffcc96,132,0,3.47,1,21);
  light(lobby,0xffb585,74,-17.9,2.32,3.8,15);
  light(lobby,0x83b7ef,111,18.3,3.8,4,18);
  light(lobby,0xc3b4f4,163,0,7.9,4,30);
  box(lobby,dark,0,-0.19,3.97,41.1,0.35,21.94);
  box(lobby,stone,0,2.29,15.03,41.4,4.62,0.18);
  buildAsteroidLobby(lobby);

  const tiles=new THREE.InstancedMesh(cube,stone,680);
  const tile=new THREE.Object3D(),shade=new THREE.Color();
  let count=0;
  function slab(x,y,z,w,h,d){
    const v=0.61+0.31*Math.abs(Math.sin(count*24.521));
    tile.position.set(x,y,z);tile.scale.set(w,h,d);tile.updateMatrix();
    tiles.setMatrixAt(count,tile.matrix);tiles.setColorAt(count++,shade.setRGB(v,v,v));
  }
  for(let z=-6.48;z<15;z+=1.18)for(let x=-20; x<20.5;x+=1.2)slab(x,-0.043,z,1.18,0.09,1.16);
  tiles.count=count;lobby.add(tiles);
  box(lobby,runner,0,0.02,3.83,2.72,0.035,21.75);
  for(const x of [-1.34,1.34])box(lobby,brass,x,0.043,3.83,0.025,0.015,21.75);
  for(let z=-4.7;z<=12;z+=2.8)box(lobby,brass,0,0.048,z,0.22,0.012,0.22).rotation.y=Math.PI/4;

  const openings=[...portals.map(p=>({x:p.x,half:2.3})),{x:0,half:1.9}].sort((a,b)=>a.x-b.x);
  let edge=-20.73;
  for(const {x,half} of openings){
    const start=x-half,end=x+half;
    box(lobby,stone,(edge+start)/2,2.24,wallZ-0.05,start-edge,4.49,0.35);
    box(lobby,stone,x,3.87,wallZ-0.08,half*2,1.24,0.35);
    box(lobby,brass,x,3.26,wallZ+0.11,half*2+0.2,0.13,0.33);
    for(const side of [-1,1]){
      box(lobby,iron,x+side*half,1.66,wallZ+0.1,0.18,3.33,0.43);
    }
    edge=end;
  }
  box(lobby,stone,(edge+20.73)/2,2.24,wallZ-0.05,20.73-edge,4.49,0.35);
  for(const portal of portals){
    portal.sign=mounted(lobby,[portal.name,'0 discovered'],portal.x,3.72,wallZ+0.173,4.18,0.66,{
      color:'#'+portal.color.toString(16),font:'600 122px Georgia',subFont:'500 49px "Segoe UI"'
    });
    mounted(lobby,'ENTRANCE HALL',portal.x,3.28,wallZ-0.256,3.4,0.47,{font:'600 85px Georgia',reverse:true});
    for(const x of [-1.94,1.94])box(lobby,new THREE.MeshBasicMaterial({color:portal.color}),portal.x+x,1.48,wallZ+0.255,0.038,2.82,0.025);
  }
  // The nameplate is masonry-mounted, with individual fasteners and a carved border.
  box(lobby,brass,0,4.01,wallZ+0.192,6.35,0.86,0.14);
  worldSign(lobby,'DOOR SIMULATOR',0,4.01,wallZ+0.271,6.17,0.73,{
    background:'#342522',border:'#b28a5e',font:'bold 173px Georgia',color:'#ffdda6'
  });
  for(const x of [-3.08,3.08])for(const y of [3.68,4.34])box(lobby,gold,x,y,wallZ+0.28,0.047,0.047,0.04);
  mounted(lobby,'DESCENT LIFT',0,3.47,wallZ+0.28,2.26,0.32,{font:'bold 105px Georgia'});
  const boardingLabel=mounted(lobby,['BOARD LIFT','Select a floor inside'],2.63,1.62,wallZ+0.16,1.15,0.37,{
    font:'700 86px Georgia',subFont:'500 47px "Segoe UI"'
  });

  for(const [id,x,z,name,sub] of [
    ['settings',-9.35,-3.5,'Settings','Run setup · audio · graphics'],
    ['guide',9.35,-3.5,'Field Guide','Controls · records · achievements']
  ]){
    const settings=id==='settings';
    const w=settings?2.45:terminalWidth,h=settings?1.52:terminalHeight,y=settings?1.66:1.92;
    terminals[id]={x,y,z,w,h};
    box(lobby,iron,x,0.51,z-0.33,w*.70,1.03,0.58);
    box(lobby,brass,x,0.075,z-0.15,w*.82,0.15,0.86);
    box(lobby,iron,x,y,z-0.46,w+0.55,h+0.39,0.84);
    box(lobby,brass,x,y,z-0.13,w+0.25,h+0.22,0.25);
    box(lobby,black,x,y,z-0.021,w+0.045,h+0.045,0.039);
    const screen=worldSign(lobby,[name,'READY  /  '+sub],x,y,z+0.012,w,h,{
      color:id==='settings'?'#a9e5d7':'#f4d9ab',background:'#101b20',border:'#345453',
      font:'600 57px monospace',subFont:'500 20px monospace'
    });
    stationLabels[id]={name,sub,screen,text:''};
    const panelBase=box(lobby,iron,x,0.49,z+0.27,w*.80,0.17,0.61);
    panelBase.rotation.x=0.06;
    const keys=new THREE.InstancedMesh(keyGeometry,keyMaterial,56);
    for(let i=0;i<56;i++){
      const row=Math.floor(i/14);
      const key=new THREE.Matrix4().makeScale(w/terminalWidth,1,1);
      key.setPosition(x+(i%14-6.5)*0.214*w/terminalWidth,0.596-row*0.008,z+0.08+row*0.126);
      keys.setMatrixAt(i,key);
    }
    lobby.add(keys);
    for(const side of [-1,1])for(let i=0;i<10;i++){
      box(lobby,black,x+side*(w/2+.22),y-.45+i*0.095,z-0.025,0.12,0.039,0.036);
    }
    box(lobby,settings?green:gold,x+w*.45,y-h/2-.13,z+0.012,0.071,0.041,0.024);
    target(lobby,{station:id},x,y,z+0.025,w,h,0.04);
  }
  mounted(lobby,['ENTRANCE HALL','WASD or left stick to walk · E, X or click to interact'],0,1.65,14.916,5,0.69,{
    font:'600 74px Georgia',subFont:'500 35px "Segoe UI"',reverse:true
  });

  const overhead=[];
  const cabin=new THREE.Group(),well=new THREE.Group();
  scene.add(createShaftHead(),well,cabin);
  const shaftZ=-8.9;
  box(cabin,iron,0,-0.14,shaftZ,3.67,0.27,4.02);
  for(let x=-1.65;x<1.75;x+=0.24)box(cabin,brass,x,0.008,shaftZ,0.018,0.023,3.92);
  // A cage made of rails and a cable frame leaves the moving landings in view.
  box(cabin,iron,0,3.17,shaftZ,3.77,0.16,0.22);
  box(cabin,brass,0,3.26,shaftZ,0.28,0.16,0.34);
  box(cabin,iron,0,11.0,shaftZ,0.062,15.64,0.062);
  box(cabin,gold,-1.43,2.89,shaftZ-0.71,0.25,0.085,0.26);
  light(cabin,0xffc78e,21,-1.42,2.82,shaftZ-0.68,7.2);
  for(const x of [-1.74,1.74]){
    for(const z of [shaftZ-1.86,shaftZ+1.86])box(cabin,iron,x,1.59,z,0.14,3.19,0.15);
    for(const z of [shaftZ-0.92,shaftZ+0.92])box(cabin,iron,x,0.49,z,0.072,0.96,0.078);
    box(cabin,brass,x,0.96,shaftZ,0.092,0.095,3.83);
    box(cabin,iron,x,0.46,shaftZ,0.065,0.063,3.83);
    box(cabin,iron,x,3.16,shaftZ,0.13,0.13,3.87);
  }
  const exitGates=[];
  for(const side of [-1,1]){
    for(const y of [0.24,0.94])box(cabin,y>0.5?brass:iron,side*1.29,y,liftGateZ,0.93,0.079,0.095);
    box(cabin,iron,side*0.85,0.49,liftGateZ,0.075,0.98,0.083);
    const gate=new THREE.Group();
    gate.position.set(side*0.85,0,liftGateZ);cabin.add(gate);
    for(const y of [0.24,0.94])box(gate,y>0.5?brass:iron,-side*0.42,y,0,0.84,0.075,0.086);
    box(gate,iron,-side*0.79,0.56,0,0.055,0.8,0.074);
    exitGates.push({gate,side});
  }
  const cage=new THREE.Group();
  cabin.add(cage);cage.position.z=wallZ-0.05;cage.visible=false;
  for(const x of [-1.71,-0.56,0.56,1.71])box(cage,iron,x,0.48,0,0.059,0.96,0.071);
  for(const y of [0.12,0.52,0.94])box(cage,brass,0,y,0,3.59,0.065,0.10);
  const awayGate=cage.clone();scene.add(awayGate);
  for(let i=0;i<5;i++){
    const x=(i-2)*0.48;
    overhead.push({
      lobby:mounted(scene,'',x,2.99,wallZ+0.241,0.41,0.36,{font:'700 150px monospace'}),
      cab:mounted(cabin,'',x,2.81,-10.39,0.41,0.36,{font:'700 150px monospace'})
    });
  }
  const liftDesk={x:1.09,y:1.45,z:-9.93,w:1.15,h:0.83};
  terminals.lift=liftDesk;
  box(cabin,iron,liftDesk.x,0.51,liftDesk.z-0.16,0.76,1.04,0.37);
  box(cabin,iron,liftDesk.x,liftDesk.y,liftDesk.z-0.13,liftDesk.w+0.15,liftDesk.h+0.16,0.23);
  box(cabin,brass,liftDesk.x,liftDesk.y,liftDesk.z-0.032,liftDesk.w+0.085,liftDesk.h+0.085,0.053);
  const liftLabel=worldSign(cabin,['SELECT FLOOR','DESCENT CONTROL'],liftDesk.x,liftDesk.y,liftDesk.z+0.012,liftDesk.w,liftDesk.h,{
    font:'700 54px monospace',subFont:'600 31px monospace',background:'#101b20',border:'#3c6c64',color:'#a9e5d7'
  });
  stationLabels.lift={screen:liftLabel,text:''};
  box(cabin,green,liftDesk.x+0.51,liftDesk.y-0.48,liftDesk.z,0.071,0.027,0.028);
  target(cabin,{lift:true},liftDesk.x,liftDesk.y,liftDesk.z+0.025,liftDesk.w,liftDesk.h,0.07);
  const shaftSections=[];
  for(let i=0;i<5;i++){
    const section=createMineLanding({height:floorMin,sampleFloor,numberSign:(parent,z)=>
      mounted(parent,'',0,3.33,z,1.72,0.39,{font:'bold 96px monospace',subFont:'500 43px monospace'})});
    well.add(section.group);shaftSections.push(section);
  }
  const sleeves=[];
  for(let i=0;i<shaftSections.length;i++){const sleeve=createMineRockGap();well.add(sleeve.group);sleeves.push(sleeve)}
  well.visible=false;
  let indication=null;
  function indicators(depth){
    if(depth===indication)return;
    indication=depth;
    const start=Math.max(0,depth-2);
    overhead.forEach(({lobby,cab},i)=>{
      const n=start+i,label=n===0?'L':String(n);
      lobby.setLabel(label,n===depth);cab.setLabel(label,n===depth);
    });
  }
  indicators(0);
  function liftMode(guestName,willHost){
    guest=guestName;hosting=willHost;
    if(ride)return;
    liftLabel.setLabel(guest?.ready?['JOIN RUN',guest.name]:
      sharedLift?['FLOOR '+sharedLift.depth,sharedLift.pending?'DEPARTING':sharedLift.by?sharedLift.by+' selected':'SHARED DESTINATION']:
      ['SELECT FLOOR',hosting?'HOST FOR FRIENDS':'DESCENT CONTROL']);
  }
  function setSharedLift(selection,away){
    if(liftAway!==away){
      liftAway=away;awayGate.visible=away;
      if(!ride)cabin.visible=!away;
      if(away&&channel==='lift'){channel=null;walker.b.z=wallZ+0.05}
      boardingLabel.setLabel(away?['LIFT AWAY','Floor '+selection.depth]:['BOARD LIFT','Select a floor inside']);
    }
    if(sharedLift!==selection){sharedLift=selection;liftMode(guest,hosting)}
  }
  function engageLift(depth,seed,group=null){
    if(ride||liftAway||!onLiftPlatform(walker.b))return false;
    const solo=!group?.follow;
    ride={depth,travel:0,extra:0,speed:0,seed,group,task:prepareLanding(seed,depth),docked:false,gate:0,onLanding:false,
      count:solo?3:0,countAt:0,warm:1,calm:solo?0.45:0,shown:!solo,stretch:new Float64Array(depth+1),settle:new Uint8Array(depth+1)};
    cage.visible=true;
    if(!solo)well.visible=true;
    liftLabel.setLabel(ride.count?['3','FLOOR '+depth]:['FLOOR '+depth,'PREPARING MAZE'],true,0);
    indicators(1);sfx(ride.count?'ding':'door');
    return true;
  }
  function floorDist(n){
    let d=0;
    for(let i=1;i<=n;i++)d+=floorMin+ride.stretch[i];
    return d;
  }
  function tickCountdown(dt){
    if(ride.count<=0)return;
    ride.countAt+=dt;
    if(ride.countAt<1)return;
    ride.countAt-=1;ride.count--;
    if(ride.count>0){sfx('ding');liftLabel.setLabel([String(ride.count),'FLOOR '+ride.depth],true,(3-ride.count)/3)}
  }
  function tickLift(dt,previousZ){
    if(!ride)return;
    if(ride.docked){
      ride.gate=Math.min(1,ride.gate+dt/0.42);
      const swing=THREE.MathUtils.smoothstep(ride.gate,0,1)*Math.PI/2;
      for(const {gate,side} of exitGates)gate.rotation.y=-side*swing;
      if(previousZ>landingEntranceZ&&walker.b.z<=landingEntranceZ){
        enterLanding(ride.depth,ride.seed,ride.task.floor,{x:walker.b.x,z:walker.b.z,yaw:view.yaw,pitch:view.pitch},ride.group?.id);
      }
      return;
    }
    const following=!!ride.group?.follow;
    // The count is only the numbers and the ding. Loading starts after the car is released.
    if(!following&&ride.count>0){
      tickCountdown(dt);
      if(!ride.shown){ride.shown=true;well.visible=true}
      placeShaft(true);
      return;
    }
    if(ride.settle)for(let i=1;i<ride.settle.length;i++)if(ride.settle[i]===2)ride.settle[i]=1;
    if(!following&&ride.count<=0&&ride.task&&!ride.task.ready)ride.task.advance();
    let arriving;
    if(following){
      const motion=ride.group.follow();
      if(!motion)return;
      if(motion.gaps&&ride.stretch)for(let i=0;i<ride.stretch.length&&i<motion.gaps.length;i++)ride.stretch[i]=motion.gaps[i];
      const k=1-Math.exp(-Math.min(dt,0.055)*8);
      const destination=floorDist(ride.depth);
      ride.travel+=(motion.travel-ride.travel)*k;
      arriving=motion.docked&&ride.task.ready&&destination-ride.travel<0.04;
      if(arriving)ride.travel=destination;
    }else{
      const step=Math.min(dt,0.055);
      const destination=floorDist(ride.depth);
      const cruise=THREE.MathUtils.clamp(Math.max(destination,floorMin)/18,2.4,5);
      let next=1,acc=0;
      while(next<=ride.depth&&acc+floorMin+ride.stretch[next]<=ride.travel+0.04){acc+=floorMin+ride.stretch[next];next++}
      next=Math.min(next,ride.depth);
      if(next<ride.depth&&ride.settle[next]===0&&landingGlimpse(ride.seed,next,false))ride.settle[next]=1;
      const loaded=next<ride.depth?ride.settle[next]===1:!!(ride.task&&ride.task.ready&&(!ride.group||ride.group.ready()));
      const open=Math.max(0,floorMax-floorMin-ride.stretch[next]);
      const closing=loaded||open<=0;
      const desired=closing?Math.min(cruise,Math.sqrt(2*1.6*Math.max(0,destination-ride.travel))):cruise;
      const prev=ride.speed;
      ride.speed=prev+THREE.MathUtils.clamp(desired-prev,-2.1*step,2.1*step);
      const movement=Math.max(0,(prev+ride.speed)*0.5*step);
      if(!loaded&&open>0){
        const copy=Math.min(open,Math.max(movement,step*3.2));
        ride.stretch[next]+=copy;ride.travel+=copy;
      }else ride.travel=Math.min(floorDist(ride.depth),ride.travel+movement);
      const destNow=floorDist(ride.depth);
      arriving=loaded&&next===ride.depth&&destNow-ride.travel<=0.03;
      if(arriving)ride.travel=destNow;
    }
    let passed=0,cursor=0;
    while(passed<ride.depth&&cursor+floorMin+ride.stretch[passed+1]<=ride.travel+0.2){cursor+=floorMin+ride.stretch[passed+1];passed++}
    indicators(Math.max(1,Math.min(ride.depth,passed+1)));
    cabin.position.y=-ride.travel;
    lobby.visible=cabin.position.y>-4.5;
    const destination=floorDist(ride.depth);
    const progress=Math.round(Math.min(0.99,(ride.travel/Math.max(destination,1))*0.68+(ride.task?ride.task.progress:1)*0.32)*100);
    if(progress!==ride.progress){
      ride.progress=progress;
      liftLabel.setLabel(['FLOOR '+ride.depth,'DESCENDING  '+progress+'%'],true,progress/100);
    }
    placeShaft(true);
    if(arriving){
      ride.docked=true;
      liftLabel.setLabel(['FLOOR '+ride.depth,'WALK INTO MAZE'],true,1);
      sfx('descend');
    }
    function placeShaft(dress){
      let budget=dress?1:0,acc=0,base=0;
      while(base<ride.depth&&acc+floorMin+ride.stretch[base+1]<=ride.travel){acc+=floorMin+ride.stretch[base+1];base++}
      base=Math.max(0,base-1);
      for(let number=base;number<base+shaftSections.length;number++){
        const section=shaftSections[number%shaftSections.length];
        const y=number===0?0:-floorDist(Math.min(number,ride.depth));
        section.group.position.y=number>ride.depth?y-(number-ride.depth)*floorMin:y;
        section.group.visible=number<=ride.depth;
        const destined=number===ride.depth&&ride.task.model;
        const showMouth=number>0&&number<=ride.depth&&!destined;
        const glimpse=showMouth?landingGlimpse(ride.seed,number,false):null;
        const look=number===ride.depth&&ride.task.floor?ride.task.floor:(showMouth?passingLook(number):null);
        if(budget>0&&section.update(ride.seed,number,look))budget--;
        section.setMaze(destined?ride.task.model:glimpse);
        const sleeve=sleeves[number%shaftSections.length];
        if(number>=1&&number<=ride.depth)sleeve.resize(-floorDist(number-1),ride.stretch[number]);
        else sleeve.resize(0,0);
      }
    }
  }
  function resetLift(){
    ride?.task.dispose();
    ride=null;lobby.visible=true;cabin.position.y=0;well.visible=cage.visible=false;
    cabin.visible=!liftAway;
    for(const {gate} of exitGates)gate.rotation.y=0;
    indicators(0);liftMode(guest,hosting);
  }
  function reset(){
    resetLift();
    channel=null;
    Object.assign(walker.b,{x:0,z:13.1,y:0,vx:0,vz:0,vy:0,jumpQ:0,bob:0});
    view.yaw=view.pitch=0;
  }
  function syncArchives(groups){
    for(const portal of portals){
      const entries=groups[portal.id],known=entries.filter(e=>e.data).length;
      const old=galleries.get(portal.id);
      if(old?.known===known)continue;
      old?.dispose();
      const hall=createArchiveHall(portal.id,entries,asset);
      hall.group.position.set(portal.x,0,wallZ-6.55);lobby.add(hall.group);
      galleries.set(portal.id,{...hall,known});
      portal.sign.setLabel([portal.name,known+' / '+entries.length+' discovered']);
    }
    targets.splice(0,targets.length,...hallTargets,...[...galleries.values()].flatMap(hall=>hall.targets));
    scene.updateMatrixWorld(true);
  }

  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),worldPoint=new THREE.Vector3();
  function aim(x=0,y=0){
    raycaster.setFromCamera(pointer.set(x,y),camera);
    for(const hit of raycaster.intersectObjects(targets,false)){
      const entry=hit.object.userData.entry;
      if(entry.lift&&(ride||walker.b.z>wallZ-0.3||hit.distance>4.3))continue;
      if(entry.station&&walker.b.z<=terminals[entry.station].z+0.06)continue;
      if(ride&&!entry.lift)continue;
      if(entry.kind){
        const portal=portals.find(p=>p.id===entry.kind);
        if(walker.b.z>=wallZ+0.05||Math.abs(walker.b.x-portal.x)>=2.3||hit.distance>6.2)continue;
      }
      if(hit.distance<= (entry.station?8.5:6.2))return entry;
    }
    return null;
  }
  const panelCorners=[[-1,1],[1,1],[1,-1],[-1,-1]].map(([x,y])=>[x*terminalWidth/2,y*terminalHeight/2]);
  const stationForm=document.getElementById('title');
  function projectPanel(width,height,id,form){
    const desk=terminals[id];
    const w=desk.w||terminalWidth,h=desk.h||terminalHeight;
    const projected=panelCorners.map(([x,y])=>{
      worldPoint.set(desk.x+x*w/terminalWidth,desk.y+y*h/terminalHeight,desk.z+0.015);
      worldPoint.applyMatrix4(camera.matrixWorldInverse);
      if(worldPoint.z>=-camera.near)return null;
      worldPoint.applyMatrix4(camera.projectionMatrix);
      return [(worldPoint.x+1)*width/2,(1-worldPoint.y)*height/2];
    });
    if(projected.some(point=>!point)||projected.every(([x])=>x<0)||projected.every(([x])=>x>width)||
      projected.every(([,y])=>y<0)||projected.every(([,y])=>y>height)){
      form.style.visibility='hidden';return false;
    }
    const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=projected;
    const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3;
    const dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
    const det=dx1*dy2-dx2*dy1;
    if(!Number.isFinite(det)||Math.abs(det)<0.001){form.style.visibility='hidden';return false}
    // A projective transform pins all four corners of the native form to the display.
    const u=(dx3*dy2-dx2*dy3)/det,v=(dx1*dy3-dx3*dy1)/det;
    const logicalWidth=width<620?480:screenWidth,logicalHeight=width<620?318:screenHeight;
    form.style.width=logicalWidth+'px';
    form.style.height=logicalHeight+'px';
    form.style.transform=`matrix3d(${(x1-x0+u*x1)/logicalWidth},${(y1-y0+u*y1)/logicalWidth},0,${u/logicalWidth},${(x3-x0+v*x3)/logicalHeight},${(y3-y0+v*y3)/logicalHeight},0,${v/logicalHeight},0,0,1,0,${x0},${y0},0,1)`;
    form.style.visibility='visible';
    return true;
  }
  function pose(){
    const {x,y,z}=walker.b;
    camera.position.set(x,eye+y+bobY(walker.b,walker.scale)+cabin.position.y,z);
    camera.rotation.set(view.pitch,-view.yaw,0,'YXZ');camera.updateMatrixWorld();
  }
  function syncVisitors(peers,dt,time){
    const seen=new Set(),users={};
    for(const peer of peers){
      const p=peer.hub;
      if(ride?p.ride!==ride.group?.id:!!p.ride)continue;
      const parent=ride?cabin:lobby;
      seen.add(peer.id);
      let visitor=visitors.get(peer.id);
      if(!visitor){
        const model=createVisitor(peer);
        model.position.set(p.x,p.y,p.z);parent.add(model);
        visitor={model,yaw:peer.hub.yaw,pace:0,frame:-1};visitors.set(peer.id,visitor);
      }
      const {model}=visitor,k=Math.min(1,dt*13);
      if(model.parent!==parent){parent.add(model);model.position.set(p.x,p.y,p.z)}
      const stride=clamp(Math.hypot(p.x-model.position.x,p.z-model.position.z)*4,0,1);
      model.position.x+=(p.x-model.position.x)*k;model.position.y+=(p.y-model.position.y)*k;model.position.z+=(p.z-model.position.z)*k;
      visitor.yaw+=Math.atan2(Math.sin(p.yaw-visitor.yaw),Math.cos(p.yaw-visitor.yaw))*k;
      model.rotation.y=Math.PI/2-visitor.yaw;
      visitor.pace+=dt*(stride*10+0.1);
      const frame=Math.floor(time*18);
      if(frame!==visitor.frame){visitor.frame=frame;model.userData.pose(time,stride,visitor.pace)}
      if(p.station&&!users[p.station])users[p.station]=peer.name;
    }
    for(const [id,{model}] of visitors)if(!seen.has(id)){
      model.removeFromParent();model.geometry.dispose();model.material.dispose();visitors.delete(id);
    }
    for(const [id,label] of Object.entries(stationLabels)){
      if(id==='lift')continue;
      const name=users[id]||'';
      if(label.text===name)continue;
      label.text=name;
      if(name)label.screen.setLabel([label.name,name+' at terminal']);
      else label.screen.setLabel([label.name,'READY  /  '+label.sub]);
    }
  }
  function update(dt,input=zero,elapsed=dt){
    lookStep(view,dt,input.lx,input.ly);
    const previousZ=walker.b.z;
    walker.step(dt,input,view.yaw);
    tickLift(Math.min(elapsed,0.25),previousZ);
    pose();if(ride)cabin.updateMatrixWorld(true);
    if(panel){
      const desk=terminals[panel];
      if(panel==='lift'&&!onLiftPlatform(walker.b)||walker.b.z<=desk.z+0.08||
        Math.hypot(walker.b.x-desk.x,walker.b.z-desk.z)>(panel==='lift'?4:6.5))onLeavePanel();
    }
    focus=aim();
  }
  function render(exposure,time){
    const width=innerWidth,height=innerHeight;
    const aspect=width/height;
    const baseFov=Math.min(105,Math.max(61,THREE.MathUtils.radToDeg(2*Math.atan(0.78/aspect))));
    const open=ride?.docked?THREE.MathUtils.smoothstep(ride.gate,0,1):0;
    const fov=THREE.MathUtils.lerp(baseFov,Math.max(72,baseFov),open);
    if(camera.aspect!==aspect||camera.fov!==fov){
      camera.aspect=aspect;
      camera.fov=fov;
      camera.updateProjectionMatrix();
    }
    pose();
    const sharedVisible=sharedSettings&&!sharedSettings.hidden;
    if(sharedVisible){
      if(ride||walker.b.z<=terminals.settings.z+0.08)sharedSettings.style.visibility='hidden';
      else if(!projectPanel(width,height,'settings',sharedSettings)&&panel==='settings')onLeavePanel();
    }
    if(panel&&!(sharedVisible&&panel==='settings')&&!projectPanel(width,height,panel,stationForm))onLeavePanel();
    if(!ride)for(const hall of galleries.values())hall.animate(time,camera.position);
    renderer.toneMappingExposure=exposure;renderer.setRenderTarget(null);renderer.render(scene,camera);
  }
  return {update,render,syncArchives,syncVisitors,liftMode,setSharedLift,engageLift,reset,resetLift,
    sharedSettings(screen,display){
      sharedSettings=screen;
      sharedTexture=new THREE.CanvasTexture(display);
      sharedTexture.colorSpace=THREE.SRGBColorSpace;
      defaultSettingsTexture=stationLabels.settings.screen.material.map;
    },
    updateSettingsDisplay(active,changed){
      const material=stationLabels.settings.screen.material;
      material.map=active?sharedTexture:defaultSettingsTexture;
      if(changed)sharedTexture.needsUpdate=true;
    },
    settingsInReach(position){
      const desk=terminals.settings;
      const dz=position.z-desk.z,dx=Math.max(0,Math.abs(position.x-desk.x)-desk.w/2);
      return dz>0&&Math.abs(position.y)<1.5&&Math.hypot(dx,dz)<=1.524;
    },
    get boarded(){return !liftAway&&onLiftPlatform(walker.b)},
    get riding(){return !!ride},
    get liftMotion(){return ride&&{travel:ride.travel,extra:0,docked:ride.docked,gaps:Array.from(ride.stretch)}},
    get aimed(){return !!focus},
    get position(){return {x:walker.b.x,z:walker.b.z,y:cabin.position.y,depth:indication,docked:!!ride?.docked}},
    get presence(){return {x:walker.b.x,y:walker.b.y,z:walker.b.z,yaw:view.yaw,station:panel,ride:ride?.group?.id,ready:!!ride?.task.ready}},
    look:(dx,dy)=>lookBy(view,dx,dy),focusPanel:id=>{
      if(!id){panel=null;return}
      stationForm.style.visibility='hidden';
      panel=id;
    },
    interact(){
      if(focus)activate(focus);
      else if(walker.b.z<wallZ-0.3&&Math.abs(walker.b.x)<1.66)activate({lift:true});
    },
    tap(x,y){
      const hit=aim(x,y);
      if(!hit)return false;
      activate(hit);return true;
    }};
}
