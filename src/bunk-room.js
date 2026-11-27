import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {worldSign} from './archive-hall.js';

export const BUNK_DOOR={x:-20.65,z:8.65,half:1.03,height:2.52};
const WIDTH=5.8,DEPTH=6.35,HEIGHT=2.85,RADIUS=0.28;
export const BUNK_SPAWN={x:BUNK_DOOR.x-5.35,z:BUNK_DOOR.z+0.3,yaw:Math.PI/2};
export function isBunkPosition(x,z){
  return x<BUNK_DOOR.x&&x>=BUNK_DOOR.x-DEPTH&&Math.abs(z-BUNK_DOOR.z)<WIDTH/2;
}

export function createBunkRoom(sfx){
  const group=new THREE.Group();group.name='Bunk room';
  group.position.set(BUNK_DOOR.x,0,BUNK_DOOR.z);group.rotation.y=-Math.PI/2;
  const cube=new THREE.BoxGeometry();
  const mat=(color,metalness=0)=>new THREE.MeshStandardMaterial({color,metalness,roughness:0.86});
  const panel=mat(0x55594e),trim=mat(0x343b39,0.4),ceiling=mat(0x343932);
  const floor=mat(0x4a3e35),matting=mat(0x3c5652),wood=mat(0x875d3d);
  const mattress=mat(0xb9a58a),linen=mat(0xd7c8af),blanket=mat(0x3e6a64),lockers=mat(0x536963,0.2);
  const lens=new THREE.MeshBasicMaterial({color:0xffdda3}),signal=new THREE.MeshBasicMaterial({color:0xf6b859});
  const pieces=new Map();
  function box(parent,material,x,y,z,w,h,d){
    if(!pieces.has(parent))pieces.set(parent,new Map());
    const batches=pieces.get(parent);
    if(!batches.has(material))batches.set(material,[]);
    batches.get(material).push(cube.clone().scale(w,h,d).translate(x,y,z));
  }
  const half=WIDTH/2,doorHalf=BUNK_DOOR.half;
  box(group,floor,0,-0.11,(DEPTH-0.5)/2,WIDTH+0.2,0.22,DEPTH+0.5);
  box(group,matting,0,0.013,3.22,1.48,0.026,4.76);
  for(const x of [-0.72,0.72])box(group,trim,x,0.027,3.22,0.035,0.015,4.76);
  box(group,ceiling,0,HEIGHT+0.07,DEPTH/2,WIDTH+0.22,0.14,DEPTH+0.24);
  box(group,panel,0,HEIGHT/2,DEPTH,WIDTH+0.15,HEIGHT,0.16);
  for(const side of [-1,1]){
    box(group,panel,side*half,HEIGHT/2,DEPTH/2,0.16,HEIGHT,DEPTH+0.3);
    box(group,trim,side*(half-0.1),0.13,DEPTH/2,0.08,0.25,DEPTH);
    for(const z of [1.28,3.15,5.13])box(group,trim,side*(half-0.09),1.45,z,0.09,2.75,0.065);
    box(group,panel,side*(half+doorHalf)/2,HEIGHT/2,0,half-doorHalf,HEIGHT,0.58);
    box(group,trim,side*doorHalf,BUNK_DOOR.height/2,0,0.13,BUNK_DOOR.height+0.16,0.69);
  }
  box(group,trim,0,2.72,0,doorHalf*2+0.14,0.32,0.7);
  box(group,trim,0,0.01,-0.025,doorHalf*2,0.035,0.77);
  const door=new THREE.Group();door.name='Bunk room door';group.add(door);
  box(door,trim,0,1.27,0,doorHalf*2+0.06,2.53,0.15);
  box(door,lockers,0,1.3,0.085,doorHalf*2-0.18,2.19,0.028);
  for(const y of [0.62,1.88])box(door,trim,0,y,0.107,doorHalf*2-0.17,0.046,0.026);
  box(door,wood,-0.74,1.13,0.16,0.13,0.31,0.11);
  const status=worldSign(group,['ENTRANCE HALL','PREPARING LOBBY'],1.89,1.78,0.31,1.35,0.43,{
    background:'#192628',border:'#8a7855',color:'#f0d8a9',font:'600 46px monospace',subFont:'600 33px monospace'
  });
  box(group,signal,1.31,2.17,0.32,0.15,0.035,0.04);
  const name=worldSign(group,'BUNK ROOM',0,2.73,-0.37,1.45,0.23,{
    background:'#242b29',border:'#7d7055',font:'700 89px monospace'
  });name.rotation.y=Math.PI;

  // One stacked bunk with a ladder and a row of lockers across the aisle.
  const bedX=-2.03,bedZ=3.9;
  for(const x of [-2.6,-1.45])for(const z of [2.59,5.21])box(group,trim,x,1.26,z,0.08,2.52,0.08);
  for(const y of [0.52,1.66]){
    box(group,trim,bedX,y-0.04,bedZ,1.31,0.11,2.66);
    box(group,mattress,bedX,y+0.07,bedZ,1.16,0.15,2.52);
    box(group,blanket,bedX,y+0.157,bedZ-0.3,1.18,0.052,1.68);
    box(group,blanket,-1.454,y+0.02,bedZ-0.3,0.045,0.29,1.66);
    box(group,linen,bedX,y+0.208,4.9,0.8,0.135,0.43);
    box(group,trim,-1.45,y+0.35,4.14,0.05,0.055,1.97);
  }
  for(const z of [2.85,3.25])box(group,trim,-1.4,0.94,z,0.052,1.88,0.052);
  for(const y of [0.29,0.58,0.87,1.16,1.45,1.74])box(group,wood,-1.37,y,3.05,0.075,0.072,0.43);
  for(const z of [3.15,3.93,4.71,5.49]){
    box(group,trim,2.48,0.07,z,0.72,0.13,0.73);
    box(group,lockers,2.48,1.04,z,0.69,1.82,0.74);
    box(group,trim,2.124,1.47,z,0.03,0.077,0.27);
    box(group,wood,2.088,1.08,z+0.21,0.066,0.17,0.049);
    for(const y of [1.68,1.76,1.84])box(group,trim,2.125,y,z,0.03,0.025,0.34);
  }
  for(const z of [1.81,4.74]){
    box(group,trim,0,2.78,z,1.7,0.12,0.29);
    box(group,lens,0,2.705,z,1.52,0.045,0.2);
    const lamp=new THREE.PointLight(0xffd2a0,13,7,1.6);lamp.position.set(0,2.53,z);group.add(lamp);
  }
  for(const [parent,batches] of pieces)for(const [material,geometries] of batches){
    parent.add(new THREE.Mesh(mergeGeometries(geometries),material));
  }

  let inside=true,ready=false,opening=0;
  function update(dt,body){
    if(!ready||opening===1)return;
    if(opening===0){
      if(Math.abs(body.x-BUNK_DOOR.x)>1.6||Math.abs(body.z-BUNK_DOOR.z)>doorHalf+0.18)return;
      sfx('door');
    }
    opening=Math.min(1,opening+dt/0.48);
    door.position.x=THREE.MathUtils.smoothstep(opening,0,1)*(2*doorHalf+0.17);
  }
  function collide(body){
    let depth=BUNK_DOOR.x-body.x,side=body.z-BUNK_DOOR.z;
    const canPass=opening===1&&Math.abs(side)<=doorHalf-RADIUS;
    if(!inside&&(!canPass||depth< -0.62))return false;
    if(canPass&&depth< -0.62){inside=false;return false}
    if(depth>=0)inside=true;
    depth=THREE.MathUtils.clamp(depth,canPass?-0.65:RADIUS,DEPTH-RADIUS);
    side=THREE.MathUtils.clamp(side,-half+RADIUS,half-RADIUS);
    if(depth>2.26&&depth<5.56)side=Math.max(side,-1.07);
    if(depth>2.48&&depth<6.07)side=Math.min(side,1.84);
    body.x=BUNK_DOOR.x-depth;body.z=BUNK_DOOR.z+side;
    return true;
  }
  return {group,update,collide,place(x,z){inside=isBunkPosition(x,z)},
    setStatus(label,progress){status.setLabel(['ENTRANCE HALL',label],true,progress)},
    unlock(){ready=true;signal.color.setHex(0x8ce8a6);status.setLabel(['ENTRANCE HALL','UNLOCKED'])},
    get opening(){return opening>0},
    get open(){return opening===1}
  };
}
