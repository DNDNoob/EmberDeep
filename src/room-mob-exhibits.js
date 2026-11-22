import * as THREE from 'three';
import {gooseModel,mooseModel} from './moose-defense.js';

const skinMat=color=>new THREE.MeshStandardMaterial({color,roughness:0.84});

function part(parent,geo,mat,x,y,z,sx,sy,sz){
  const mesh=new THREE.Mesh(geo,mat);
  mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);
  return mesh;
}

// A glass-case stand-in for the parlor thing: grey, hunched, lamp eyes. Feet at y=0.
function guestModel(){
  const root=new THREE.Group();
  const skin=skinMat(0x6c6762),dark=skinMat(0x1b1a18),tooth=skinMat(0xe8dcc0);
  const eyeMat=new THREE.MeshBasicMaterial({color:0xffd070});
  const ball=new THREE.SphereGeometry(1,12,8);
  const hips=new THREE.Group();hips.position.y=0.48;root.add(hips);
  part(hips,ball,skin,0,0,0,0.16,0.11,0.12);
  const torso=new THREE.Group();torso.position.y=0.06;torso.rotation.x=0.62;hips.add(torso);
  part(torso,ball,skin,0,0.26,0,0.16,0.28,0.13);
  for(let i=0;i<4;i++){
    const spike=part(torso,ball,dark,0,0.1+i*0.1,-0.1,0.025,0.045,0.07);
    spike.rotation.x=-0.9;
  }
  const neck=new THREE.Group();neck.position.set(0,0.48,0.02);neck.rotation.x=0.45;torso.add(neck);
  const head=new THREE.Group();head.position.y=0.14;head.rotation.x=-0.4;neck.add(head);
  part(head,ball,skin,0,0.05,0.05,0.11,0.13,0.16);
  part(head,ball,dark,0,0.12,0.02,0.1,0.03,0.08);
  const jaw=new THREE.Group();jaw.position.set(0,-0.02,0.06);head.add(jaw);
  part(jaw,ball,skin,0,-0.02,0.05,0.08,0.035,0.1);
  for(let i=0;i<5;i++)part(jaw,ball,tooth,(i-2)*0.02,0.005,0.1,0.008,0.012,0.02);
  for(const s of [-1,1])part(head,ball,eyeMat,s*0.045,0.06,0.14,0.022,0.018,0.016);
  const arms=[];
  for(const s of [-1,1]){
    const upper=new THREE.Group();upper.position.set(s*0.18,0.36,0.02);torso.add(upper);
    part(upper,ball,skin,0,-0.14,0,0.04,0.15,0.04);
    const fore=new THREE.Group();fore.position.y=-0.28;upper.add(fore);
    part(fore,ball,skin,0,-0.13,0.02,0.03,0.14,0.03);
    part(fore,ball,dark,0,-0.26,0.04,0.02,0.02,0.045);
    arms.push({upper,fore,s});
  }
  for(const s of [-1,1]){
    part(hips,ball,skin,s*0.07,-0.2,0,0.055,0.2,0.05);
    part(hips,ball,dark,s*0.07,-0.4,0.05,0.045,0.04,0.08);
  }
  root.scale.setScalar(1.02);
  root.userData.pose=time=>{
    const step=Math.sin(time*2.2);
    torso.rotation.x=0.58+Math.sin(time*1.3)*0.04;
    head.rotation.y=Math.sin(time*0.7)*0.35;
    jaw.rotation.x=0.12+0.28*Math.max(0,Math.sin(time*3.1));
    for(const arm of arms){
      arm.upper.rotation.x=-0.15+arm.s*step*0.35;
      arm.upper.rotation.z=arm.s*0.15;
      arm.fore.rotation.x=-0.4;
    }
    const glow=0.75+0.25*Math.sin(time*2);
    eyeMat.color.setRGB(1.15*glow,0.72*glow,0.22*glow);
  };
  return root;
}

// Two hooded teenagers, slumped the way they sit in the picture house.
function teenPack(){
  const root=new THREE.Group();
  const ball=new THREE.SphereGeometry(1,12,8);
  const box=new THREE.BoxGeometry(1,1,1);
  const figures=[];
  const hoods=[0xc4722a,0x2a8a88];
  for(const [index,x] of [[0,-0.28],[1,0.3]]){
    const hood=skinMat(hoods[index]),cloth=skinMat(0x1c2433),flesh=skinMat(index?0xc48a62:0x8a5a3c);
    const figure=new THREE.Group();figure.position.x=x;root.add(figure);
    part(figure,box,cloth,-0.06,0.28,-0.08,0.07,0.42,0.08);
    part(figure,box,cloth,0.06,0.28,-0.08,0.07,0.42,0.08);
    const torso=new THREE.Group();torso.position.set(0,0.55,0);torso.rotation.x=0.42;figure.add(torso);
    part(torso,box,hood,0,0.22,0,0.34,0.36,0.18);
    const neck=new THREE.Group();neck.position.set(0,0.4,-0.02);neck.rotation.x=-0.35;torso.add(neck);
    const head=new THREE.Group();neck.add(head);
    part(head,ball,flesh,0,0.1,0,0.1,0.11,0.1);
    part(head,ball,hood,0,0.12,0.02,0.12,0.1,0.11);
    const phone=part(torso,box,new THREE.MeshBasicMaterial({color:0x9ec4ff}),0,0.02,-0.16,0.06,0.1,0.012);
    phone.rotation.x=-0.6;
    const arms=[];
    for(const s of [-1,1]){
      const arm=new THREE.Group();arm.position.set(s*0.2,0.32,0);torso.add(arm);
      part(arm,box,hood,0,-0.12,0,0.07,0.24,0.07);
      arms.push(arm);
    }
    figures.push({torso,head,phone,arms});
  }
  root.scale.setScalar(1.06);
  root.userData.pose=time=>{
    for(const [i,figure] of figures.entries()){
      const t=time+i;
      figure.torso.rotation.x=0.4+Math.sin(t*0.6)*0.03;
      figure.head.rotation.y=Math.sin(t*0.4)*0.2;
      figure.head.rotation.x=-0.15+Math.sin(t*0.8)*0.04;
      figure.phone.material.color.setRGB(0.45+0.15*Math.sin(t*3),0.65,1);
      figure.arms.forEach((arm,n)=>arm.rotation.x=-0.7-n*0.15);
    }
  };
  return root;
}

function marched(model,scale,flying,lift=0){
  model.scale.setScalar(scale);
  model.position.y=lift;
  model.userData.exhibitPose=(time)=>model.userData.pose(time,false,flying);
  return model;
}

export function roomMobExhibit(id){
  const group=new THREE.Group();
  const model=id==='guest'?guestModel():id==='teens'?teenPack():
    id==='moose'?mooseModel(false):id==='mother'?gooseModel():id==='goose'?gooseModel():null;
  if(!model)return group;
  if(id==='moose'){
    model.scale.setScalar(0.52);
    model.userData.exhibitPose=time=>model.userData.pose(time,1,0);
  }else if(id==='goose')marched(model,0.8,true,0.2);
  else if(id==='mother')marched(model,1.28,false);
  group.add(model);
  group.userData.pose=(time)=>model.userData.exhibitPose?model.userData.exhibitPose(time):model.userData.pose?.(time);
  group.userData.pose(0);
  return group;
}
