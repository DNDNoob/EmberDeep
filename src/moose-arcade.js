import * as THREE from 'three';
import {drawCanadianRanger} from './art/canadian-ranger.js';
import {drawUncleSam} from './art/uncle-sam.js';
import {bobY,createRoomWalker,lookStep,MOVE} from './movement.js';

export const TABLE_SCALE=.42,TABLE_HEIGHT=1.06,EYE=1.61;
const HALF_W=6.55,HALF_D=5.5,HEIGHT=3.65,TABLE_W=3.34,TABLE_D=2.09;
const PANEL_W=1.24,PANEL_FRONT=2.59;
const clamp=THREE.MathUtils.clamp;

// wall murals are drawn once (192x108 pixel art) and reused when the room is re-entered
let muralCanvases=null;
const getMurals=()=>muralCanvases||(muralCanvases=[drawCanadianRanger(),drawUncleSam()]);

export function outpostArcade(room,o,onClear){
  const walls=new THREE.Group();room.add(walls);
  const roof=new THREE.Group();room.add(roof);
  const box=new THREE.BoxGeometry(1,1,1);
  const mat=(color,roughness=.83,emissive=0)=>new THREE.MeshStandardMaterial({color,roughness,emissive});
  const floor=mat(0x2a353e),wall=mat(0x233b43),dark=mat(0x121e26),wood=mat(0x604432,.61);
  const edge=mat(0x9b7046,.49),gold=mat(0xfec580,.55,0x8a420b),teal=mat(0x78e8de,.52,0x326f71);
  const brass=mat(0xb08751,.43),red=mat(0xbc604b,.65,0x482218);
  const put=(parent,m,x,y,z,w,h,d)=>{
    const mesh=new THREE.Mesh(box,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
  };
  put(room,floor,0,-.09,0,HALF_W*2,.18,HALF_D*2);
  const rug=mat(0x414449);
  put(room,rug,0,.008,0,8.45,.016,5.72);
  for(const sign of [-1,1]){
    put(room,edge,sign*4.16,.017,0,.035,.008,5.65);
    put(room,edge,0,.017,sign*2.77,8.33,.008,.038);
    put(walls,wall,sign*HALF_W,HEIGHT/2,0,.20,HEIGHT,HALF_D*2);
    put(walls,dark,sign*(HALF_W-.11),.48,0,.10,.96,HALF_D*2);
    put(walls,wood,sign*(HALF_W-.17),.96,0,.14,.092,HALF_D*2);
    put(walls,dark,0,HEIGHT/2,sign*HALF_D,HALF_W*2,HEIGHT,.20);
    put(walls,wood,0,.96,sign*(HALF_D-.12),HALF_W*2,.092,.14);
  }
  put(roof,dark,0,HEIGHT+.09,0,HALF_W*2,.18,HALF_D*2);
  for(const x of [-4.6,0,4.6])put(roof,wood,x,HEIGHT-.11,0,.14,.22,HALF_D*2);
  for(const x of [-3.76,3.76]){
    put(walls,brass,x,3.34,-.5,.16,.35,.16);
    put(walls,dark,x,3.13,-.5,.80,.19,.32);
    put(walls,gold,x,3.03,-.5,.71,.02,.26);
    const glow=new THREE.PointLight(0xffbc80,16,8,2);glow.position.set(x,2.96,-.5);walls.add(glow);
  }

  const platform=new THREE.Group();room.add(platform);
  put(platform,wood,0,.75,0,TABLE_W*2,.32,TABLE_D*2);
  put(platform,dark,0,.57,0,TABLE_W*2-.19,.06,TABLE_D*2-.19);
  for(const sx of [-1,1])for(const sz of [-1,1]){
    put(platform,wood,sx*2.83,.34,sz*1.65,.29,.68,.29);
    put(platform,dark,sx*2.83,.055,sz*1.65,.37,.11,.37);
  }
  for(const sign of [-1,1]){
    put(platform,edge,0,.92,sign*(TABLE_D-.10),TABLE_W*2,.18,.22);
    put(platform,edge,sign*(TABLE_W-.09),.92,0,.18,.18,TABLE_D*2);
    put(platform,teal,0,.81,sign*(TABLE_D+.013),TABLE_W*2-.3,.042,.022);
    put(platform,teal,sign*(TABLE_W+.013),.81,0,.022,.042,TABLE_D*2-.28);
  }
  const label=(parent,text,x,y,z,width,height,color='#ffcb86')=>{
    const art=document.createElement('canvas');art.width=1024;art.height=160;
    const ink=art.getContext('2d');ink.fillStyle='#0b1d25';ink.fillRect(0,0,1024,160);
    ink.fillStyle=color;ink.textAlign='center';ink.textBaseline='middle';
    ink.font='bold 91px Georgia';ink.fillText(text,512,82,975);
    const map=new THREE.CanvasTexture(art);map.colorSpace=THREE.SRGBColorSpace;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map}));
    sign.position.set(x,y,z);parent.add(sign);return sign;
  };
  const controls=new THREE.Group();platform.add(controls);
  controls.position.set(0,1.04,2.29);controls.rotation.x=.14;
  put(controls,wood,0,-.087,0,PANEL_W*2,.24,.56);
  put(controls,brass,0,.035,0,PANEL_W*2,.025,.56);
  put(controls,dark,0,.052,0,PANEL_W*2-.06,.024,.50);
  const disk=new THREE.CylinderGeometry(1,1,1,24),ball=new THREE.SphereGeometry(1,20,12);
  const round=(geometry,material,x,y,z,w,h)=>{
    const piece=new THREE.Mesh(geometry,material);piece.position.set(x,y,z);piece.scale.set(w,h,w);controls.add(piece);
  };
  round(disk,brass,-.91,.072,-.026,.153,.039);
  round(disk,dark,-.91,.159,-.026,.035,.17);
  round(ball,red,-.91,.258,-.026,.087,.087);
  const buttons=[[teal,'TOWER'],[red,'SPIKES'],[gold,'SYRUP'],[teal,'START']];
  buttons.forEach(([color,text],i)=>{
    const x=-.51+i*.48;
    round(disk,brass,x,.079,-.04,.124,.046);
    round(disk,color,x,.114,-.04,.096,.052);
    label(controls,text,x,.067,.157,.32,.059).rotation.x=-Math.PI/2;
  });
  for(const x of [-1.15,1.15])for(const z of [-.20,.20])round(disk,brass,x,.067,z,.021,.02);

  put(walls,edge,0,2.97,-5.34,4.9,.75,.11);
  label(walls,'MOSQUITO OUTPOST',0,2.97,-5.274,4.76,.65);
  put(walls,teal,0,2.54,-5.267,4.42,.034,.047);
  for(const sign of [-1,1]){
    const entry=sign>0,door=new THREE.Group();walls.add(door);
    door.position.set(0,0,sign*(HALF_D-.12));door.rotation.y=entry?Math.PI:0;
    put(door,dark,0,1.06,0,1.55,2.14,.16);
    put(door,wood,0,1.05,.076,1.31,2.04,.09);
    for(const x of [-.74,.74])put(door,edge,x,1.10,.075,.115,2.20,.23);
    put(door,edge,0,2.15,.078,1.59,.13,.24);
    put(door,brass,0,.039,.093,1.30,.078,.20);
    put(door,dark,0,1.48,.128,.80,.46,.043);
    put(door,entry?gold:teal,0,1.49,.153,.69,.35,.022);
    put(door,brass,.41,.99,.148,.16,.29,.04);
    put(door,dark,.36,.99,.175,.27,.058,.045);
    put(door,edge,0,2.36,.035,1.21,.29,.145);
    label(door,entry?'ENTRANCE':'EXIT',0,2.36,.116,1.09,.200,entry?'#ffcb86':'#91f2ca');
  }

  for(const x of [-4.71,4.71]){
    put(walls,dark,x,.99,-4.79,.94,1.98,.88);
    put(walls,wood,x,.91,-4.19,.96,.23,.37);
    put(walls,edge,x,1.43,-4.35,.77,.72,.08);
    put(walls,teal,x,1.50,-4.296,.58,.43,.026);
    put(walls,red,x-.16,1.05,-4.11,.075,.05,.075);
    put(walls,gold,x+.12,1.05,-4.11,.075,.05,.075);
    put(walls,gold,x,1.92,-4.33,.79,.095,.055);
  }

  const murals=getMurals(),muralTex=[];onClear(()=>{for(const t of muralTex)t.dispose()});
  for(const [i,side] of [-1,1].entries()){
    const frame=put(walls,wood,side*6.405,2.18,-.43,.15,2.51,5.18);
    const image=new THREE.Mesh(new THREE.PlaneGeometry(4.98,2.32),new THREE.MeshBasicMaterial({color:0x527275}));
    image.position.set(side*6.313,frame.position.y,frame.position.z);
    image.rotation.y=-side*Math.PI/2;walls.add(image);
    put(walls,gold,side*6.26,3.40,-.43,.025,.045,4.94);
    const tex=new THREE.CanvasTexture(murals[i]);
    tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.colorSpace=THREE.SRGBColorSpace;
    muralTex.push(tex);
    image.material.color.setHex(0xffffff);image.material.map=tex;image.material.needsUpdate=true;
  }
  const fill=new THREE.HemisphereLight(0xc7e8f5,0x624433,1.34);room.add(fill);
  const board=new THREE.Group();board.scale.setScalar(TABLE_SCALE);board.position.y=TABLE_HEIGHT;room.add(board);
  const walker=createRoomWalker({o,eye:EYE,x:0,z:4.46,speedMul:()=>.58,ceilingAt:()=>1.28,collide:b=>{
    b.x=clamp(b.x,-HALF_W+.32,HALF_W-.32);b.z=clamp(b.z,-HALF_D+.32,HALF_D-.32);
    const x=TABLE_W+.29,z=TABLE_D+.29,dx=x-Math.abs(b.x),dz=z-Math.abs(b.z);
    if(dx>0&&dz>0){if(dx<dz)b.x=Math.sign(b.x||1)*x;else b.z=Math.sign(b.z||1)*z}
    const side=PANEL_W+.29-Math.abs(b.x),front=PANEL_FRONT+.29-b.z;
    if(b.z>=z&&side>0&&front>0){
      if(side<front)b.x=Math.sign(b.x||1)*(PANEL_W+.29);else b.z=PANEL_FRONT+.29;
    }
    const cabinet=Math.abs(b.x)-4.71,across=.76-Math.abs(cabinet),depth=-3.76-b.z;
    if(across>0&&depth>0){
      if(across<depth)b.x=Math.sign(b.x)*(4.71+Math.sign(cabinet||1)*.76);else b.z=-3.76;
    }
  }});
  return {board,roof,walker,near(){
    const {x,z}=walker.b;
    return Math.hypot(Math.max(0,Math.abs(x)-TABLE_W),Math.max(0,Math.abs(z)-TABLE_D))<1.38;
  },atExit(){
    const {x,z}=walker.b;
    return Math.abs(x)<1.04&&z<-HALF_D+1.20;
  }};
}

export function outpostCamera(cam,arcade,S){
  return ()=>{
    const {walker,roof}=arcade,b=walker.b;
    cam.fov=62;
    cam.position.set(b.x,EYE+b.y+bobY(b,walker.scale),b.z);
    cam.rotation.set(S.pitch,-S.yaw,0,'YXZ');
    roof.visible=cam.position.y<HEIGHT-.24;
  };
}

export function walkOutpost(arcade,S,input,dt){
  lookStep(S,dt,input.lx||0,input.ly||0,MOVE.roomPitch);
  arcade.walker.step(dt,input,S.yaw);
}
