import * as THREE from 'three';
import {bobY, createRoomWalker, lookBy, lookStep,crouchOffset} from './movement.js';
import {createArchiveHall, worldSign} from './archive-hall.js';
import {buildAsteroidLobby,TELESCOPE_PANEL} from './asteroid-lobby.js';
import {createKeplerOrrery} from './kepler-orrery.js';
import {NEWS} from './news.js';
import {BOSSES} from './bosses.js';
import {createLightPool} from './light-pool.js';
import {DOOR,WALL_Z,buildHangar,buildHangarFront,wallRects} from './hangar.js';
import {BUNK_DOOR,BUNK_SPAWN,createBunkRoom,isBunkPosition} from './bunk-room.js';
import {createLiftBay,createLiftPassage,createMineLanding,createMineRockGap,createShaftHead} from './mine-shaft.js';
import {liftEye as eye,liftGateZ,liftCabinZ as shaftZ,liftCabinLamps,landingMazeZ} from './lift-dock.js';

const portals=[
  {id:'doors',x:-15.35,name:'Door Archive',color:0xb9c4ff},
  {id:'floors',x:-6.55,name:'Floor Archive',color:0x9de1c9},
  {id:'mobs',x:6.55,name:'Mob Archive',color:0xf3b29b},
  {id:'glitches',x:15.35,name:'Glitch Archive',color:0xd9b3f9}
];
const wallZ=-7,floorMin=8.2,floorMax=17;
const terminalWidth=4.5,terminalHeight=2.98;
const TROPHY={x:-15.35,z:14.62};
const screenWidth=900,screenHeight=596;
const clamp=THREE.MathUtils.clamp;
export const onLiftPlatform=({x,z})=>Math.abs(x)<1.66&&z<wallZ-0.3&&z>liftGateZ;

export function createMenuRoom(renderer,{sfx,asset,activate,enterLanding,arriveLobby,mazeFov,sampleFloor,prepareLanding,landingGlimpse,passingLook,onLeavePanel,createVisitor}){
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x14121d);
  scene.fog=new THREE.Fog(0x17151f,24,64);
  const lobby=new THREE.Group();scene.add(lobby);
  const bunk=createBunkRoom(sfx),bunkScene=new THREE.Scene();
  bunkScene.background=scene.background;
  bunkScene.add(bunk.group,new THREE.HemisphereLight(0xddd5f9,0x877075,1.22));
  let lobbyReady=false,bunkAttached=false,hangar,hangarFront,skyMat;
  const camera=new THREE.PerspectiveCamera(61,1,0.06,77);
  const view={yaw:BUNK_SPAWN.yaw,pitch:0};
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
  let orrery;
  const newsKey='emberdeep.newsSeen',newsStamp=NEWS[0].date+' '+NEWS[0].title;
  let newsSeen=false;
  try{newsSeen=localStorage.getItem(newsKey)===newsStamp}catch{}
  const newsIdle=()=>['Update Log',(newsSeen?'LATEST':'NEW')+'  /  '+NEWS[0].title];
  let active=true,study=null,studyYaw=0,studyPitch=0.28,studyDist=0.3,orreryAim=null;
  const orreryHint=document.createElement('div');
  orreryHint.style.cssText='position:fixed;left:0;right:0;bottom:22px;text-align:center;color:#ffe4bd;font:15px "Segoe UI",sans-serif;text-shadow:0 2px 6px #000;pointer-events:none;z-index:6';
  document.body.appendChild(orreryHint);

  function box(parent,mat,x,y,z,w,h,d){
    const mesh=new THREE.Mesh(cube,mat);
    mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
  }
  function light(parent,color,power,x,y,z,range){
    const lamp=new THREE.PointLight(color,power,range);
    lamp.position.set(x,y,z);parent.add(lamp);
  }
  // The point-light count must stay fixed or three.js relinks every lit material (see light-pool.js: 8 real lights stand in for all lamps).
  // The pool is created up front, and any lamp that is about to be compiled or drawn is swept into it first, so ride, dock and
  // compile all see the same count.
  let lights=null,lightT=null;
  function pool(){lights??=createLightPool(scene,8);return lights}
  // hide an object's own lamps while it compiles (they belong to the pool once it is in the scene)
  const withoutLamps=(object,fn)=>{const off=[];object.traverse(o=>{if(o.isPointLight&&o.visible){o.visible=false;off.push(o)}});try{return fn()}finally{for(const o of off)o.visible=true}};
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
  const walker=createRoomWalker({eye,x:BUNK_SPAWN.x,z:BUNK_SPAWN.z,speedMul:()=>0.76,o:{sfx},collide(b){
    if(ride){
      b.x=clamp(b.x,-1.58,1.58);
      b.z=clamp(b.z,liftGateZ+0.35,-7.4);
      return;
    }
    if(bunk.collide(b))return;
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
      const f=desk.f||1,d=f*(b.z-desk.z);
      if(Math.abs(b.x-desk.x)<2.48&&d>-0.45&&d<0.57)b.z=desk.z+f*0.57;
    }
    if(Math.abs(b.x-TROPHY.x)<2.45&&b.z>TROPHY.z-0.75)b.z=TROPHY.z-0.75;
    orrery?.block(b);
    const panel=TELESCOPE_PANEL;
    if(Math.abs(b.z-panel.z)<panel.w*0.5+0.15&&b.x>panel.x-0.42)b.x=panel.x-0.42;
  }});

  scene.add(new THREE.HemisphereLight(0xddd5f9,0x877075,1.22));
  light(lobby,0xffcc96,132,0,3.47,1,21);
  light(lobby,0xffb585,74,-17.9,2.32,3.8,15);
  light(lobby,0x83b7ef,111,18.3,3.8,4,18);
  light(lobby,0xc3b4f4,163,0,7.9,4,30);
  box(lobby,dark,0,-0.19,3.97,41.1,0.35,21.94);
  for(const [x0,x1,y0,y1] of wallRects(-0.02,4.6,20.7))box(lobby,stone,(x0+x1)/2,(y0+y1)/2,WALL_Z,x1-x0,y1-y0,0.18);
  target(lobby,{locked:'hangar'},DOOR.x,DOOR.h/2,WALL_Z-0.12,DOOR.w,DOOR.h,0.1);
  const lobbyBuilders=[()=>{skyMat=buildAsteroidLobby(lobby)},()=>{hangarFront=buildHangarFront(lobby)},()=>{hangar=buildHangar(lobby)},
    ()=>{orrery=createKeplerOrrery();lobby.add(orrery.group)}];

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

  // The computers stand against the back wall (z 15) and face into the room (f=-1); the lift desk faces +z.
  for(const [id,x,z,name,sub] of [
    ['settings',-9.35,13.95,'Settings','Run setup · audio · graphics'],
    ['guide',9.35,13.95,'Field Guide','Controls · records · achievements'],
    ['news',15.35,13.95,'Update Log','What\'s new in Door Simulator']
  ]){
    const settings=id==='settings',f=-1;
    const w=terminalWidth,h=terminalHeight,y=1.92;
    terminals[id]={x,y,z,w,h,f};
    const desk=new THREE.Group();
    desk.position.set(x,0,z);desk.rotation.y=Math.PI;lobby.add(desk);
    box(desk,iron,0,0.51,-0.33,w*.70,1.03,0.58);
    box(desk,brass,0,0.075,-0.15,w*.82,0.15,0.86);
    box(desk,iron,0,y,-0.46,w+0.55,h+0.39,0.84);
    box(desk,brass,0,y,-0.13,w+0.25,h+0.22,0.25);
    box(desk,black,0,y,-0.021,w+0.045,h+0.045,0.039);
    const screen=worldSign(desk,id==='news'?newsIdle():[name,'READY  /  '+sub],0,y,0.012,w,h,{
      color:id==='settings'?'#a9e5d7':id==='news'?'#bcd9f4':'#f4d9ab',background:'#101b20',border:'#345453',
      font:'600 57px monospace',subFont:'500 20px monospace'
    });
    stationLabels[id]={name,sub,screen,text:'',idle:id==='news'?newsIdle:null};
    const panelBase=box(desk,iron,0,0.49,0.27,w*.80,0.17,0.61);
    panelBase.rotation.x=0.06;
    const keys=new THREE.InstancedMesh(keyGeometry,keyMaterial,56);
    for(let i=0;i<56;i++){
      const row=Math.floor(i/14);
      const key=new THREE.Matrix4();
      key.setPosition((i%14-6.5)*0.214,0.596-row*0.008,0.08+row*0.126);
      keys.setMatrixAt(i,key);
    }
    desk.add(keys);
    for(const side of [-1,1])for(let i=0;i<10;i++){
      box(desk,black,side*(w/2+.22),y-.45+i*0.095,-0.025,0.12,0.039,0.036);
    }
    box(desk,settings?green:gold,w*.45,y-h/2-.13,0.012,0.071,0.041,0.024);
    target(desk,{station:id},0,y,0.025,w,h,0.04);
  }

  // The trophy case stands against the back wall, facing into the room: one place for each boss, dark until that boss falls.
  const trophyCase=new THREE.Group(),trophySlots=[];
  trophyCase.position.set(TROPHY.x,0,TROPHY.z);trophyCase.rotation.y=Math.PI;lobby.add(trophyCase);
  box(trophyCase,iron,0,1.25,-0.32,4.3,2.5,0.12);box(trophyCase,brass,0,2.55,-0.2,4.4,0.12,0.36);
  for(const y of [0.08,1.08])box(trophyCase,dark,0,y+0.04,-0.12,4.3,0.12,0.42);
  for(const x of [-2.15,2.15])box(trophyCase,iron,x,1.25,-0.12,0.1,2.5,0.42);
  mounted(trophyCase,'TROPHIES',0,2.3,-0.25,1.7,0.28,{font:'bold 150px Georgia'});
  light(trophyCase,0xffd9a8,9,0,2.1,0.9,5);
  const dim=material(0x2c2a33),cupMat=new THREE.MeshStandardMaterial({color:0xe0b25a,metalness:0.8,roughness:0.3});
  const cupGeo=new THREE.CylinderGeometry(0.11,0.05,0.16,14),stemGeo=new THREE.CylinderGeometry(0.025,0.025,0.1,8),baseGeo=new THREE.CylinderGeometry(0.08,0.09,0.04,14),gemGeo=new THREE.OctahedronGeometry(0.06);
  BOSSES.forEach((b,i)=>{
    const x=(i%5-2)*0.82,y=i<5?1.2:0.2,slot=new THREE.Group();slot.position.set(x,y,-0.1);trophyCase.add(slot);
    const gem=new THREE.MeshBasicMaterial({color:new THREE.Color(b.col)});
    const parts=[new THREE.Mesh(baseGeo,cupMat),new THREE.Mesh(stemGeo,cupMat),new THREE.Mesh(cupGeo,cupMat),new THREE.Mesh(gemGeo,gem)];
    parts[0].position.y=0.02;parts[1].position.y=0.09;parts[2].position.y=0.22;parts[3].position.y=0.38;parts.forEach(m=>slot.add(m));
    const plate=worldSign(slot,['???',''],0,0.7,-0.21,0.74,0.2,{font:'600 60px Georgia',subFont:'500 46px "Segoe UI"',background:'#1d1a24',border:'#6d5a40'});
    plate.position.set(0,0.64,-0.06);
    trophySlots.push({b,parts,cupMat,plate,gem,got:null});
  });
  function setTrophies(T,override=false){
    for(const q of trophySlots){
      const e=T&&T[q.b.id],earned=!!(e&&e.n>0),got=earned||override;
      const key=earned?e.n+'/'+e.best:override?'override':'';if(q.got===key)continue;q.got=key;
      q.parts.forEach((m,k)=>{m.material=got?(k===3?q.gem:cupMat):dim;m.visible=got||k<3});
      q.plate.setLabel(got?[q.b.name,earned?'Beaten '+e.n+'x  ·  deepest '+e.best:'Admin Override']:['???','Waits on floor '+(5*(BOSSES.indexOf(q.b)+1))],got);
    }
  }
  setTrophies(null);

  const overhead=[];
  const cabin=new THREE.Group(),well=new THREE.Group();
  scene.add(createShaftHead(),well,cabin);
  box(cabin,iron,0,-0.14,shaftZ,3.67,0.27,4.02);
  for(let x=-1.65;x<1.75;x+=0.24)box(cabin,brass,x,0.008,shaftZ,0.018,0.023,3.92);
  // A cage made of rails and a cable frame leaves the moving landings in view.
  box(cabin,iron,0,3.17,shaftZ,3.77,0.16,0.22);
  box(cabin,brass,0,3.26,shaftZ,0.28,0.16,0.34);
  box(cabin,iron,0,11.0,shaftZ,0.062,15.64,0.062);
  const lens=new THREE.MeshBasicMaterial({color:liftCabinLamps.color});
  for(const x of liftCabinLamps.sides){
    box(cabin,iron,x,3.04,shaftZ,0.09,0.26,0.18);
    box(cabin,iron,x,2.91,shaftZ,0.32,0.12,1.52);
    box(cabin,lens,x,2.84,shaftZ,0.25,0.045,1.37);
    light(cabin,liftCabinLamps.color,17,x,liftCabinLamps.y,shaftZ,6.6);
  }
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
  function canWarmLift(){
    const {x,z,vx,vz}=walker.b;
    return lobbyReady&&!ride&&Math.hypot(x-liftDesk.x,z-liftDesk.z)<8&&Math.hypot(vx,vz)<0.1;
  }
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
  function createDockModel(){
    const model=new THREE.Group(),parked=cabin.clone(false),gates=[];
    model.name='Docked lift';
    for(const child of cabin.children){
      if(child.isLight||child===liftLabel||child.material===proxy||overhead.some(({cab})=>cab.parent===child))continue;
      const copy=child.clone();
      const gate=exitGates.find(entry=>entry.gate===child);
      if(gate)gates.push({mesh:copy,side:gate.side});
      if(child===cage)copy.visible=true;
      parked.add(copy);
    }
    model.add(parked,createLiftPassage(),createLiftBay());
    const sign=worldSign(model,['LIFT'],0,1.97,landingMazeZ-0.025,1.35,0.34,{font:'700 145px monospace'});
    sign.rotation.y=Math.PI;
    const screen=worldSign(model,['SELECT FLOOR','LIFT CONTROLS'],liftDesk.x,liftDesk.y,liftDesk.z+0.012,liftDesk.w,liftDesk.h,{
      font:'700 54px monospace',subFont:'600 31px monospace',background:'#101b20',border:'#3c6c64',color:'#a9e5d7'
    });
    return {model,screen,setGate(progress){
      const swing=THREE.MathUtils.smoothstep(progress,0,1)*Math.PI/2;
      for(const {mesh,side} of gates)mesh.rotation.y=-side*swing;
    }};
  }
  const shaftSections=[];
  for(let i=0;i<5;i++){
    const section=createMineLanding({height:floorMin,sampleFloor,numberSign:(parent,z)=>
      mounted(parent,'',0,3.33,z,1.72,0.39,{font:'bold 96px monospace',subFont:'500 43px monospace'})});
    section.group.traverse(child=>child.layers.set(i+1));
    camera.layers.enable(i+1);
    well.add(section.group);shaftSections.push(section);
  }
  const sleeves=[];
  for(let i=0;i<shaftSections.length;i++){
    const sleeve=createMineRockGap();
    sleeve.group.traverse(child=>child.layers.set(i+1));
    well.add(sleeve.group);sleeves.push(sleeve);
  }
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
    }
    if(sharedLift!==selection){sharedLift=selection;liftMode(guest,hosting)}
  }
  function engageLift(depth,seed,group=null,from=0,departure=null){
    if(!lobbyReady||ride||liftAway||!onLiftPlatform(walker.b)||depth===from)return false;
    const solo=!group?.follow;
    const stops=Math.abs(depth-from),direction=Math.sign(depth-from);
    ride={depth,from,stops,direction,departure,travel:0,extra:0,speed:0,seed,group,
      task:depth===0?null:prepareLanding(seed,depth),docked:false,
      count:solo?3:0,countAt:0,warm:1,shown:!solo,stretch:new Float64Array(stops+1),settle:new Uint8Array(stops+1)};
    cabin.position.y=-from*floorMin;
    bunk.group.visible=false;
    lobby.visible=from===0;
    cage.visible=true;
    if(!solo)well.visible=true;
    liftLabel.setLabel(ride.count?['3',destinationLabel(depth)]:[destinationLabel(depth),'PREPARING LIFT'],true,0);
    indicators(from);sfx(ride.count?'ding':'door');
    return true;
  }
  const destinationLabel=depth=>depth===0?'LOBBY':'FLOOR '+depth;
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
    if(ride.count>0){sfx('ding');liftLabel.setLabel([String(ride.count),destinationLabel(ride.depth)],true,(3-ride.count)/3)}
  }
  function tickLift(dt){
    if(!ride)return;
    const following=!!ride.group?.follow;
    // The count is only the numbers and the ding. Loading starts after the car is released.
    if(!following&&ride.count>0){
      tickCountdown(dt);
      if(!ride.shown){ride.shown=true;well.visible=true}
      placeShaft(true);
      return;
    }
    if(ride.settle)for(let i=1;i<ride.settle.length;i++)if(ride.settle[i]===2)ride.settle[i]=1;
    if(ride.task&&!ride.task.ready)ride.task.advance();
    else if(ride.warm<ride.stops)landingGlimpse(ride.seed,ride.from+ride.direction*ride.warm++,true);
    const ready=(!ride.task||ride.task.warmArrival())&&(!ride.group||following||ride.group.ready());
    let arriving;
    if(following){
      const motion=ride.group.follow();
      if(!motion)return;
      if(motion.gaps&&ride.stretch)for(let i=0;i<ride.stretch.length&&i<motion.gaps.length;i++)ride.stretch[i]=motion.gaps[i];
      const k=1-Math.exp(-Math.min(dt,0.055)*8);
      const destination=floorDist(ride.stops);
      ride.travel+=(motion.travel-ride.travel)*k;
      arriving=motion.docked&&ready&&destination-ride.travel<0.04;
      if(arriving)ride.travel=destination;
    }else{
      const step=Math.min(dt,0.055);
      const destination=floorDist(ride.stops);
      // an express car: top speed grows with the distance, so a deep ride takes seconds, not a minute (it still waits for loading)
      const cruise=THREE.MathUtils.clamp(Math.max(destination,floorMin)/4.5,2.4,70),accel=Math.max(2.1,cruise/1.4),brake=Math.max(1.6,cruise/2.2);
      let next=1,acc=0;
      while(next<=ride.stops&&acc+floorMin+ride.stretch[next]<=ride.travel+0.04){acc+=floorMin+ride.stretch[next];next++}
      next=Math.min(next,ride.stops);
      if(next<ride.stops&&ride.settle[next]===0&&landingGlimpse(ride.seed,ride.from+ride.direction*next,false))ride.settle[next]=1;
      const loaded=next<ride.stops?ride.settle[next]===1:ready;
      const open=Math.max(0,floorMax-floorMin-ride.stretch[next]);
      const closing=loaded||open<=0;
      const desired=closing?Math.min(cruise,Math.sqrt(2*brake*Math.max(0,destination-ride.travel))):cruise;
      const prev=ride.speed;
      ride.speed=prev+THREE.MathUtils.clamp(desired-prev,-accel*step,accel*step);
      const movement=Math.max(0,(prev+ride.speed)*0.5*step);
      if(!loaded&&open>0){
        const copy=Math.min(open,Math.max(movement,step*3.2));
        ride.stretch[next]+=copy;ride.travel+=copy;
      }else ride.travel=Math.min(floorDist(ride.stops),ride.travel+movement);
      const destNow=floorDist(ride.stops);
      arriving=loaded&&next===ride.stops&&destNow-ride.travel<=0.03;
      if(arriving)ride.travel=destNow;
    }
    let passed=0,cursor=0;
    while(passed<ride.stops&&cursor+floorMin+ride.stretch[passed+1]<=ride.travel+0.2){cursor+=floorMin+ride.stretch[passed+1];passed++}
    indicators(ride.from+ride.direction*Math.min(ride.stops,passed+1));
    cabin.position.y=rideY(ride.travel);
    lobby.visible=cabin.position.y>-4.5;
    const destination=floorDist(ride.stops);
    ride.remaining=destination-ride.travel;
    const progress=Math.round(Math.min(0.99,(ride.travel/Math.max(destination,1))*0.68+(ride.task?ride.task.progress:1)*0.32)*100);
    if(progress!==ride.progress){
      ride.progress=progress;
      liftLabel.setLabel([destinationLabel(ride.depth),(ride.direction>0?'DESCENDING':'ASCENDING')+'  '+progress+'%'],true,progress/100);
    }
    placeShaft(true);
    if(arriving){
      ride.docked=true;
      if(ride.depth===0){arriveLobby(ride.group?.id);return}
      sfx('descend');
      enterLanding(ride.depth,ride.seed,ride.task.floor,{...walker.b,...view},ride.group?.id);
    }
    function placeShaft(dress){
      let budget=dress?1:0,acc=0,base=0;
      while(base<ride.stops&&acc+floorMin+ride.stretch[base+1]<=ride.travel){acc+=floorMin+ride.stretch[base+1];base++}
      base=Math.max(0,base-1);
      for(let stop=base;stop<base+shaftSections.length;stop++){
        const number=ride.from+ride.direction*stop,slot=stop%shaftSections.length;
        const section=shaftSections[slot];
        const y=rideY(floorDist(Math.min(stop,ride.stops))+Math.max(0,stop-ride.stops)*floorMin);
        section.group.position.y=y;
        section.group.visible=stop<=ride.stops;
        const destined=stop===ride.stops&&ride.task?.model||stop===0&&ride.departure;
        const showMouth=number>0&&stop<=ride.stops&&!destined;
        const glimpse=showMouth?landingGlimpse(ride.seed,number,false):null;
        const look=number===ride.depth&&ride.task?.floor||number>0&&passingLook(number)||null;
        if(budget>0&&section.update(ride.seed,number,look))budget--;
        section.setMaze(destined||glimpse,!!destined);
        const sleeve=sleeves[slot];
        if(stop>=1&&stop<=ride.stops)sleeve.resize(Math.max(y,rideY(floorDist(stop-1))),ride.stretch[stop]);
        else sleeve.resize(0,0);
      }
    }
  }
  // Subtract the added gaps from the lobby end so an upward trip docks flush with the hall.
  function rideY(travel){
    const start=ride.direction<0?-ride.depth*floorMin-floorDist(ride.stops):-ride.from*floorMin;
    return start-ride.direction*travel;
  }
  function resetLift(){
    ride?.task?.dispose();
    ride?.departure?.removeFromParent();
    ride?.departure?.children[0].geometry.dispose();
    ride=null;lobby.visible=true;bunk.group.visible=true;cabin.position.y=0;well.visible=cage.visible=false;
    cabin.visible=!liftAway;
    for(const {gate} of exitGates)gate.rotation.y=0;
    indicators(0);liftMode(guest,hosting);
  }
  function reset(){
    resetLift();
    channel=null;
    Object.assign(walker.b,{x:0,z:13.1,y:0,vx:0,vz:0,vy:0,jumpQ:0,bob:0});
    bunk.place(walker.b.x,walker.b.z);
    view.yaw=view.pitch=0;
    study=null;orreryAim=null;orreryHint.textContent='';
  }
  // the lobby is only the active view on the title screen; elsewhere it shows no hint and ignores the orrery keys
  function setActive(on){active=!!on;if(!active){study=null;orreryAim=null;orreryHint.textContent=''}}
  function syncArchives(groups,override=false){
    for(const portal of portals){
      const entries=groups[portal.id],known=entries.filter(e=>e.data).length;
      const old=galleries.get(portal.id);
      const discovered=entries.filter(e=>e.discovered).length;
      if(old?.known===known&&old.discovered===discovered)continue;
      old?.dispose();
      const hall=createArchiveHall(portal.id,entries,asset);
      hall.group.position.set(portal.x,0,wallZ-6.55);lobby.add(hall.group);
      galleries.set(portal.id,{...hall,known,discovered});
      portal.sign.setLabel([portal.name,known+' / '+entries.length+(override?' available':' discovered')]);
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
      if(entry.station&&(terminals[entry.station].f||1)*(walker.b.z-terminals[entry.station].z)<=0.06)continue;
      if(ride&&!entry.lift)continue;
      if(entry.kind){
        const portal=portals.find(p=>p.id===entry.kind);
        if(walker.b.z>=wallZ+0.05||Math.abs(walker.b.x-portal.x)>=2.3||hit.distance>(entry.playClip?3.4:6.2))continue;
      }
      if(hit.distance<= (entry.station?8.5:6.2))return entry;
    }
    return null;
  }
  const panelCorners=[[-1,1],[1,1],[1,-1],[-1,-1]].map(([x,y])=>[x*terminalWidth/2,y*terminalHeight/2]);
  const stationForm=document.getElementById('title');
  function projectPanel(width,height,id,form,viewCamera=camera,model=null){
    const desk=terminals[id];
    const w=desk.w||terminalWidth,h=desk.h||terminalHeight;
    const projected=panelCorners.map(([x,y])=>{
      worldPoint.set(desk.x+(desk.f||1)*x*w/terminalWidth,desk.y+y*h/terminalHeight,desk.z+(desk.f||1)*0.015);
      if(model)model.localToWorld(worldPoint);
      worldPoint.applyMatrix4(viewCamera.matrixWorldInverse);
      if(worldPoint.z>=-viewCamera.near)return null;
      worldPoint.applyMatrix4(viewCamera.projectionMatrix);
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
  function beginStudy(id){
    const anchor=orrery.focus(id);
    if(!study)studyYaw=Math.atan2(anchor.x-camera.position.x,anchor.z-camera.position.z);
    studyPitch=study?studyPitch:0.28;
    studyDist=orrery.reach(id);
    study=id;
  }
  function pickOrrery(){
    return active&&!ride&&orrery?.inReach(walker.b)?orrery.pick(raycaster):null;
  }
  function pose(){
    if(study){
      const anchor=orrery.focus(study);
      const cp=Math.cos(studyPitch),sp=Math.sin(studyPitch);
      camera.position.set(anchor.x+Math.sin(studyYaw)*cp*studyDist,anchor.y+sp*studyDist,anchor.z+Math.cos(studyYaw)*cp*studyDist);
      camera.lookAt(anchor);
      if(camera.near!==0.008){camera.near=0.008;camera.updateProjectionMatrix()}
      camera.updateMatrixWorld();
      return;
    }
    if(camera.near!==0.06){camera.near=0.06;camera.updateProjectionMatrix()}
    const {x,y,z}=walker.b;
    camera.position.set(x,eye+y+bobY(walker.b,walker.scale)-crouchOffset(walker.b,eye)+(ride?cabin.position.y:0),z);
    camera.rotation.set(view.pitch,-view.yaw,0,'YXZ');camera.updateMatrixWorld();
  }
  function watchLift(motion){
    if(!lobbyReady||ride)return;
    if(!motion){
      if(cabin.position.y!==0||well.visible){
        cabin.position.y=0;well.visible=cage.visible=awayGate.visible=false;lobby.visible=true;
        cabin.visible=!liftAway;
      }
      return;
    }
    const y=motion.y??-(motion.travel||0)-(motion.extra||0);
    const gone=y<-3.2;
    cabin.visible=true;well.visible=true;cage.visible=y<-0.15;awayGate.visible=gone;
    cabin.position.y=y;
    // The hall stays put for whoever did not board. Only the car and its riders drop.
    if(gone&&channel==='lift'){channel=null;walker.b.z=Math.max(walker.b.z,wallZ+0.05)}
  }
  function syncVisitors(peers,dt,time){
    const seen=new Set(),users={};
    for(const peer of peers){
      const p=peer.hub;
      // In the car, only the people who boarded are in here. From the hall, riders
      // stay visible inside the cabin so a departure doesn't blink them out.
      if(ride&&p.ride!==ride.group?.id)continue;
      const parent=(ride||p.ride)?cabin:isBunkPosition(p.x,p.z)?(bunkAttached?scene:bunkScene):lobby;
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
      else label.screen.setLabel(label.idle?label.idle():[label.name,'READY  /  '+label.sub]);
    }
  }
  function update(dt,input=zero,elapsed=dt){
    if(study){
      studyYaw-=input.lx*dt*2.2;
      studyPitch=clamp(studyPitch-input.ly*dt*2.2,-1.05,1.15);
    }else lookStep(view,dt,input.lx,input.ly);
    if(!study){bunk.update(dt,walker.b);walker.step(dt,input,view.yaw)}
    tickLift(Math.min(elapsed,0.25));
    if(active&&!ride)orrery?.animate(dt);
    pose();if(ride)cabin.updateMatrixWorld(true);
    if(!lobbyReady){focus=null;return}
    if(panel){
      const desk=terminals[panel];
      if(panel==='lift'&&!onLiftPlatform(walker.b)||(desk.f||1)*(walker.b.z-desk.z)<=0.08||
        Math.hypot(walker.b.x-desk.x,walker.b.z-desk.z)>(panel==='lift'?4:6.5))onLeavePanel();
    }
    focus=aim();
    raycaster.setFromCamera(pointer.set(0,0),camera);
    orreryAim=pickOrrery();
    const control=orreryAim&&orrery.controlLabel(orreryAim);
    orreryHint.textContent=!active?'':control?`E: ${control}`:study
      ? `Close view of ${orrery.name(study)}. Click another body to go there. Scroll to move closer. Q walks again.`
      : orreryAim ? `E: look closer at ${orrery.name(orreryAim)}` : '';
  }
  function animateLobby(time,view){
    if(!ride)for(const hall of galleries.values())hall.animate(time,view.position);
    orrery.animate();
    hangar.update(time||0);hangarFront.update(time||0);
    if(skyMat?.uniforms){
      skyMat.uniforms.uTime.value=time||0;
      if(skyMat.uniforms.uBody)orrery.fillWindow(skyMat.uniforms);
    }
  }
  function render(exposure,time,mazeExposure=exposure){
    const width=innerWidth,height=innerHeight;
    const aspect=width/height;
    const baseFov=Math.min(105,Math.max(61,THREE.MathUtils.radToDeg(2*Math.atan(0.78/aspect))));
    const approach=ride?.task?.arrivalReady?1-THREE.MathUtils.smoothstep(ride.remaining??2,0,1.4):0;
    const fov=THREE.MathUtils.lerp(baseFov,mazeFov,approach);
    if(camera.aspect!==aspect||camera.fov!==fov){
      camera.aspect=aspect;
      camera.fov=fov;
      camera.updateProjectionMatrix();
    }
    pose();
    if(!lobbyReady||(!bunkAttached&&isBunkPosition(walker.b.x,walker.b.z)&&!bunk.opening)){
      renderer.toneMappingExposure=exposure;renderer.setRenderTarget(null);renderer.render(bunkScene,camera);
      return;
    }
    if(!bunkAttached){
      scene.add(bunk.group);bunkAttached=true;
      pool().rescan();lights.update(camera,0.35);
    }
    const sharedVisible=sharedSettings&&!sharedSettings.hidden;
    if(sharedVisible){
      if(ride||terminals.settings.f*(walker.b.z-terminals.settings.z)<=0.08)sharedSettings.style.visibility='hidden';
      else if(!projectPanel(width,height,'settings',sharedSettings)&&panel==='settings')onLeavePanel();
    }
    if(panel&&!(sharedVisible&&panel==='settings')&&!projectPanel(width,height,panel,stationForm))stationForm.style.visibility='hidden';
    animateLobby(time,camera);
    pose();
    pool();
    lights.update(camera,Math.min(0.1,Math.max(0,(time||0)-(lightT??(time||0)))));lightT=time||0;
    renderer.toneMappingExposure=THREE.MathUtils.lerp(exposure,mazeExposure,approach);renderer.setRenderTarget(null);renderer.render(scene,camera);
  }
  function markNewsSeen(){
    if(newsSeen)return;
    newsSeen=true;
    try{localStorage.setItem(newsKey,newsStamp)}catch{}
    const label=stationLabels.news;
    if(!label.text)label.screen.setLabel(newsIdle());
  }
  addEventListener('keydown',e=>{
    if(!active||!study)return;
    if(e.code==='KeyQ'||e.code==='Escape'||e.code==='Backspace')study=null;
  });
  addEventListener('wheel',e=>{
    if(!active||!study)return;
    const min=orrery.reach(study)*0.45,max=Math.max(1.6,orrery.reach(study)*8);
    studyDist=clamp(studyDist*(e.deltaY>0?1.1:0.9),min,max);
  },{passive:true});
  return {get scene(){return scene},get camera(){return camera},update,render,markNewsSeen,get newsUnseen(){return !newsSeen},syncArchives,syncVisitors,watchLift,liftMode,setSharedLift,engageLift,reset,resetLift,setActive,
    get lobbyReady(){return lobbyReady},get bunkDoorOpen(){return bunk.open},
    canWarmLift,
    buildLobbyStep(){const build=lobbyBuilders.shift();if(!build)return false;build();return true},
    setLobbyStatus:bunk.setStatus,
    unlockLobby(){
      lobbyReady=true;bunk.unlock();
    },
    drawLobbyWarmFrame(exposure,time){
      const view=camera.clone();view.position.set(BUNK_DOOR.x+0.72,eye,BUNK_DOOR.z);
      view.lookAt(0,eye,BUNK_DOOR.z);view.updateMatrixWorld();
      animateLobby(time,view);
      pool().rescan();lights.update(view,0.35);
      renderer.toneMappingExposure=exposure;renderer.setRenderTarget(null);renderer.render(scene,view);
    },
    createDockModel,
    projectDockPanel(viewCamera,model){return projectPanel(innerWidth,innerHeight,'lift',stationForm,viewCamera,model)},
    dockPanelReach(p,yaw,pitch){
      const dx=liftDesk.x-p.x,dy=liftDesk.y-p.eyeY,dz=liftDesk.z-p.z,dist=Math.hypot(dx,dy,dz);
      return p.z>liftDesk.z+0.1&&dist<2.65&&
        (dx*Math.sin(yaw)-dz*Math.cos(yaw))*Math.cos(pitch)+dy*Math.sin(pitch)>dist*0.72;
    },
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
      const dz=desk.f*(position.z-desk.z),dx=Math.max(0,Math.abs(position.x-desk.x)-desk.w/2);
      return dz>0&&Math.abs(position.y)<1.5&&Math.hypot(dx,dz)<=1.524;
    },
    get boarded(){return !liftAway&&onLiftPlatform(walker.b)},
    get riding(){return !!ride},
    get lightPeak(){let n=0;scene.traverseVisible(o=>{if(o.isPointLight)n++});return n},
    compileLobby(){
      const hidden=!well.visible;
      const bunkPreview=bunk.group.clone();
      for(const child of [...bunkPreview.children])if(child.isLight)bunkPreview.remove(child);
      scene.add(bunkPreview);
      well.visible=true;
      camera.updateMatrixWorld();
      pool().rescan();
      try{return renderer.compileAsync(scene,camera).catch(()=>renderer.compile(scene,camera))}
      finally{scene.remove(bunkPreview);if(hidden)well.visible=false}
    },
    // compile an off-screen landing or glimpse against the shaft's lights so its first sight in a ride costs nothing
    compileObject(object){
      const hidden=!well.visible;
      well.visible=true;
      camera.updateMatrixWorld();
      let result=null;
      pool().rescan();
      try{result=withoutLamps(object,()=>renderer.compileAsync?renderer.compileAsync(object,camera,scene):(renderer.compile(object,camera,scene),null))}catch(e){}
      if(hidden)well.visible=false;
      return result;
    },
    get liftMotion(){return ride&&{travel:ride.travel,y:cabin.position.y,extra:0,docked:ride.docked,gaps:Array.from(ride.stretch)}},
    get hangarStats(){return hangar?.stats()},
    get aimed(){return !!(focus||orreryAim)},
    setSkyTime(t){if(skyMat&&skyMat.uniforms)skyMat.uniforms.uTime.value=t},
    get skyTime(){return skyMat&&skyMat.uniforms?skyMat.uniforms.uTime.value:0},
    get position(){return {x:walker.b.x,z:walker.b.z,y:cabin.position.y,depth:indication,docked:!!ride?.docked}},
    get presence(){return {x:walker.b.x,y:walker.b.y,z:walker.b.z,yaw:view.yaw,station:panel,ride:ride?.group?.id,ready:!!ride&&(!ride.task||ride.task.arrivalReady)}},
    place(x,z,yaw=0,pitch=0){Object.assign(walker.b,{x,z,vx:0,vz:0});bunk.place(x,z);view.yaw=yaw;view.pitch=pitch},
    look:(dx,dy)=>{
      if(study){
        studyYaw-=dx;
        studyPitch=clamp(studyPitch-dy,-1.05,1.15);
        return;
      }
      lookBy(view,dx,dy);
    },focusPanel:id=>{
      if(!id){panel=null;return}
      stationForm.style.visibility='hidden';
      panel=id;
    },
    interact(){
      if(!lobbyReady)return;
      if(focus){activate(focus);return}
      if(orreryAim&&orrery.press(orreryAim))return;
      if(study){
        if(orreryAim&&orreryAim!==study)beginStudy(orreryAim);
        else if(!orreryAim)study=null;
        return;
      }
      if(orreryAim){beginStudy(orreryAim);return}
      if(walker.b.z<wallZ-0.3&&Math.abs(walker.b.x)<1.66)activate({lift:true});
    },
    setTrophies,
    tap(x,y){
      if(!lobbyReady)return false;
      const hit=aim(x,y);
      if(hit){activate(hit);return true}
      raycaster.setFromCamera(pointer.set(x,y),camera);
      const id=pickOrrery();
      if(!id)return false;
      if(!orrery.press(id))beginStudy(id);
      return true;
    }};
}
