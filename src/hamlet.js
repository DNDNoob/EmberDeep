// A strange door into a blocky little village. The day is short.
// Villagers run the paths until the sun sets, and then something comes out of the dark.
// A chest in the square holds an obsidian-glass sword. Each hit takes one limb.
import * as THREE from 'three';
import {MOVE,bobY,createRoomWalker,lookStep} from './movement.js';
import {crossedDoor} from './stillwood.js';

const EYE=1.6;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const NAMES=['Pebble','Miso','Clover','Juniper','Bramble','Butter'];
const SHIRTS=[0xe25b45,0x3cb8b0,0xf0c14a,0x7d6bdc,0xef8f6b,0x5aa2e6];

function mulberry(a){
  return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
}

export function hamletRoom({group,scene,cam,o,A,finish,onClear,seed=7}){
  const rnd=mulberry((seed*1e6)|0);
  cam.fov=72;cam.near=0.08;cam.far=180;
  const sky=new THREE.Color(0x8ecaf2);
  scene.background=sky;
  scene.fog=new THREE.Fog(0x8ecaf2,28,78);
  const hemi=new THREE.HemisphereLight(0xcfe8ff,0x3e6a32,0.72);
  const sunL=new THREE.DirectionalLight(0xfff1cf,1.7);
  group.add(hemi,sunL);
  const amb=new THREE.AmbientLight(0x243044,0.15);group.add(amb);

  const grass=new THREE.MeshStandardMaterial({color:0x63a84a,roughness:1});
  const dirt=new THREE.MeshStandardMaterial({color:0x8a6a3e,roughness:1});
  const leaf=new THREE.MeshStandardMaterial({color:0x2f8f45,roughness:0.9});
  const wood=new THREE.MeshStandardMaterial({color:0x6b4630,roughness:0.86});
  const dark=new THREE.MeshStandardMaterial({color:0x241910,roughness:0.9});
  const glass=new THREE.MeshStandardMaterial({color:0xffe3a0,emissive:0xffc56a,emissiveIntensity:0.85,roughness:0.25});
  const stone=new THREE.MeshStandardMaterial({color:0xb7b1a4,roughness:0.95});
  const skinM=new THREE.MeshStandardMaterial({color:0xffd2b8,roughness:0.7});
  const legM=new THREE.MeshStandardMaterial({color:0x3a342c,roughness:0.85});
  const eyeM=new THREE.MeshStandardMaterial({color:0x1b1a22,roughness:0.4});
  const gold=new THREE.MeshStandardMaterial({color:0xf0c14a,emissive:0xc9892a,emissiveIntensity:0.45,roughness:0.4,metalness:0.4});
  const obsid=new THREE.MeshStandardMaterial({color:0x1a2430,roughness:0.15,metalness:0.55,emissive:0x173047,emissiveIntensity:0.7});
  const monsterM=new THREE.MeshStandardMaterial({color:0x2a2433,roughness:0.7});
  const gore=new THREE.MeshStandardMaterial({color:0x6a2030,roughness:0.55});

  const ground=new THREE.Mesh(new THREE.BoxGeometry(36,0.4,40),grass);
  ground.position.set(0,-0.2,-12);group.add(ground);
  const boxes=[];
  const box=(mat,w,h,d,x,y,z,parent)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z);(parent||group).add(m);return m;
  };
  // blocky lawn and a dirt lane from the door to the square
  for(let i=0;i<18;i++){
    const z=-1.2-i*1.15;
    box(dirt,1.5,0.08,1.05,(i%3-1)*0.15,0.04,z);
  }
  function house(x,z,w,d,wall,roof){
    const g=new THREE.Group();g.position.set(x,0,z);group.add(g);
    const wallM=new THREE.MeshStandardMaterial({color:wall,roughness:0.92});
    const roofM=new THREE.MeshStandardMaterial({color:roof,roughness:0.75});
    box(wallM,w,2.15,d,0,1.08,0,g);
    box(roofM,w+0.55,0.42,d+0.55,0,2.32,0,g);
    box(roofM,w*0.62,0.32,d*0.62,0,2.66,0,g);
    box(dark,0.62,1.25,0.1,0,0.66,d/2+0.02,g);
    box(glass,0.46,0.42,0.08,-w*0.28,1.45,d/2+0.05,g);
    box(glass,0.46,0.42,0.08,w*0.28,1.45,d/2+0.05,g);
    boxes.push({x,z,hw:w/2+0.25,hd:d/2+0.25});
  }
  function tree(x,z,h){
    box(wood,0.38,h,0.38,x,h/2,z);
    box(leaf,1.5,1.15,1.5,x,h+0.2,z);
    box(leaf,1.05,0.8,1.05,x,h+0.9,z);
    boxes.push({x,z,hw:0.45,hd:0.45});
  }
  const spots=[[-8,-8,3.4,3.2,0xf4efe4,0xc4554a],[-8,-18,3.2,3.4,0xf7e27a,0x4c8fd6],[8,-10,3.6,3.1,0xf2d2c4,0x5e8f4a],[7,-20,3.1,3.3,0xd7ecf5,0xe07a3d],[-1,-22,3.3,2.8,0xf6f1e4,0x8d6cc2]];
  for(const s of spots)if(rnd()>0.15)house(s[0],s[1],s[2],s[3],s[4],s[5]);
  for(const t of [[-12,-6,1.7],[12,-6,1.5],[-13,-16,2],[-12,-24,1.6],[13,-16,1.8],[12,-24,1.5],[-4,-26,1.4],[6,-26,1.7]])tree(t[0],t[1],t[2]);
  // the square, the sign, the chest
  box(stone,6.2,0.1,6.2,0,0.05,-14);
  box(wood,0.16,1.3,0.16,-1.15,0.65,-3.1);
  box(wood,1.5,0.7,0.12,-1.15,1.45,-3.1);
  const signMat=(()=>{
    const cv=document.createElement('canvas');cv.width=256;cv.height=96;
    const c=cv.getContext('2d');c.fillStyle='#6a432c';c.fillRect(0,0,256,96);
    c.strokeStyle='#e7c48a';c.lineWidth=8;c.strokeRect(8,8,240,80);
    c.fillStyle='#fff6df';c.font='700 54px Georgia, serif';c.textAlign='center';c.textBaseline='middle';
    c.fillText('HAMLET',128,50);
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({map:tex});
  })();
  box(signMat,1.28,0.48,0.06,-1.15,1.45,-3.02);
  const chest=new THREE.Group();chest.position.set(2.15,0,-13.2);group.add(chest);
  box(wood,0.85,0.48,0.55,0,0.28,0,chest);
  const lid=box(gold,0.9,0.16,0.58,0,0.56,0,chest);
  lid.geometry.translate(0,-0.08,-0.29);lid.position.y=0.64;lid.position.z=-0.29;
  const chestLight=new THREE.PointLight(0xffc56a,2.2,6,2);chestLight.position.set(2.15,0.8,-13.2);group.add(chestLight);

  const sun=new THREE.Mesh(new THREE.SphereGeometry(1.5,18,12),new THREE.MeshBasicMaterial({color:0xfff3c4}));
  group.add(sun);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(0.7,14,10),new THREE.MeshBasicMaterial({color:0xdfe7ff}));
  moon.visible=false;group.add(moon);

  function person(color){
    const g=new THREE.Group();group.add(g);
    const shirt=new THREE.MeshStandardMaterial({color,roughness:0.75});
    const add=(mat,w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);return m};
    const l1=add(legM,0.14,0.42,0.16,-0.1,0.28,0);
    const l2=add(legM,0.14,0.42,0.16,0.1,0.28,0);
    add(shirt,0.46,0.48,0.28,0,0.78,0);
    add(skinM,0.32,0.3,0.3,0,1.2,0);
    add(eyeM,0.06,0.06,0.04,-0.08,1.24,0.16);
    add(eyeM,0.06,0.06,0.04,0.08,1.24,0.16);
    return {g,l1,l2};
  }
  const folks=[];
  const path=[[0,-4],[0,-10],[-5,-14],[5,-14],[0,-18],[-6,-22],[3.2,-16],[0,-14]];
  for(let i=0;i<5;i++){
    const p=person(SHIRTS[i]);
    const wp=(rnd()*path.length)|0;
    folks.push({...p,name:NAMES[i],x:path[wp][0],z:path[wp][1],wp,dead:false,fear:0});
    p.g.position.set(path[wp][0],0,path[wp][1]);
  }

  const mon=new THREE.Group();mon.name='hamlet-night';group.add(mon);mon.visible=false;
  const limb=(w,h,d,x,y,z)=>{const m=box(monsterM,w,h,d,x,y,z,mon);return m};
  const parts={
    legR:limb(0.2,0.7,0.2,-0.16,0.4,0),
    legL:limb(0.2,0.7,0.2,0.16,0.4,0),
    armR:limb(0.16,0.85,0.16,-0.42,1.15,0.05),
    armL:limb(0.16,0.9,0.16,0.44,1.12,-0.02),
  };
  limb(0.55,0.7,0.36,0,1.15,0);
  const head=limb(0.4,0.38,0.36,0,1.7,0.06);
  const jaw=limb(0.28,0.12,0.22,0.05,1.48,0.22);
  box(gore,0.08,0.08,0.06,-0.1,1.74,0.24,mon);
  box(gore,0.08,0.08,0.06,0.1,1.74,0.24,mon);
  box(monsterM,0.1,0.28,0.1,-0.12,1.95,0,mon);
  box(monsterM,0.1,0.26,0.1,0.14,1.92,0.02,mon);
  const monLight=new THREE.PointLight(0xff3344,0,7,2);mon.add(monLight);
  const order=['legR','legL','armR','armL'];
  const lost=[];

  const door=new THREE.Group();door.position.set(0,0,3.35);door.rotation.y=Math.PI;group.add(door);
  box(wood,0.16,2.3,0.18,-0.7,1.15,0,door);
  box(wood,0.16,2.3,0.18,0.7,1.15,0,door);
  box(wood,1.55,0.18,0.18,0,2.25,0,door);
  box(dark,1.15,2.05,0.08,0,1.1,0,door);
  box(glass,0.7,1.15,0.06,0,1.25,0.08,door);
  const doorLight=new THREE.PointLight(0xffd2a0,1.3,5,2);doorLight.position.set(0,1.4,2.8);group.add(doorLight);

  const sword=new THREE.Group();sword.visible=false;group.add(sword);
  box(obsid,0.08,0.92,0.16,0,0.7,0,sword);
  box(gold,0.16,0.08,0.22,0,0.28,0,sword);
  box(wood,0.06,0.28,0.08,0,0.12,0,sword);

  const S={t:0,yaw:0,pitch:0,bloom:0.35,seed,night:false,sword:false,limbs:4,dead:false,said:0,cool:0,bite:0,vx:0,vz:0,
    mx:10,mz:-21,doorX:0,doorZ:3.35,doorFace:0};
  const inside=(x,z)=>boxes.some(c=>Math.abs(x-c.x)<c.hw&&Math.abs(z-c.z)<c.hd);
  const walker=createRoomWalker({o,eye:EYE,x:0,z:0,collide:b=>{
    for(const c of boxes){
      const x=clamp(b.x,c.x-c.hw,c.x+c.hw),z=clamp(b.z,c.z-c.hd,c.z+c.hd);
      let dx=b.x-x,dz=b.z-z,d=Math.hypot(dx,dz);
      if(d<0.36){if(d<1e-4){dx=0;dz=1;d=1}b.x=x+dx/d*0.36;b.z=z+dz/d*0.36}
    }
    b.x=clamp(b.x,-15.2,15.2);b.z=clamp(b.z,-27,4.6);
  }});
  const b=walker.b;
  const poseMon=()=>{mon.position.set(S.mx,S.dead?0.15:0,S.mz);if(!S.dead)mon.rotation.y=Math.atan2(b.x-S.mx,b.z-S.mz)};
  const syncParts=()=>{
    order.forEach((k,i)=>{if(parts[k])parts[k].visible=i<S.limbs});
    mon.visible=S.night;sword.visible=S.sword&&!S.dead;
    if(S.sword)lid.rotation.x=-1.15;
    if(S.dead){mon.rotation.x=1.2;mon.position.y=0.2}
  };
  const moveTo=(x,z,tx,tz,sp)=>{
    let dx=tx-x,dz=tz-z,l=Math.hypot(dx,dz);
    if(l<0.04)return {x,z,dx:0,dz:0};
    dx/=l;dz/=l;
    let nx=x+dx*sp,nz=z+dz*sp;
    if(inside(nx,nz)){
      if(!inside(x+dx*sp,z))nz=z;
      else if(!inside(x,z+dz*sp))nx=x;
      else return {x,z,dx,dz};
    }
    return {x:nx,z:nz,dx,dz};
  };

  S.snap=()=>({sd:seed,x:+b.x.toFixed(2),z:+b.z.toFixed(2),y:+b.y.toFixed(2),yaw:+S.yaw.toFixed(3),pitch:+S.pitch.toFixed(3),t:+S.t.toFixed(2),night:S.night?1:0,sword:S.sword?1:0,limbs:S.limbs,dead:S.dead?1:0,mx:+S.mx.toFixed(2),mz:+S.mz.toFixed(2)});
  S.apply=q=>{
    if(![q.x,q.z,q.y,q.yaw,q.pitch].every(Number.isFinite))return;
    S.yaw=q.yaw;S.pitch=clamp(q.pitch,-MOVE.roomPitch,MOVE.roomPitch);
    if(Number.isFinite(q.t))S.t=q.t;
    S.night=!!q.night;S.sword=!!q.sword;S.limbs=q.limbs|0;S.dead=!!q.dead;
    if(Number.isFinite(q.mx))S.mx=q.mx;if(Number.isFinite(q.mz))S.mz=q.mz;
    sword.visible=S.sword&&!S.dead;mon.visible=S.night;syncParts();
    walker.watch(0.1,q.x,q.z,clamp(q.y,0,3));
  };
  S.update=(dt,input)=>{
    S.t+=dt;
    const elev=1.22-S.t*0.062;
    const az=0.35+S.t*0.02;
    const sy=Math.sin(elev)*34;
    sun.position.set(Math.cos(az)*40,sy,-14);
    sunL.position.copy(sun.position);
    sun.visible=sy>-1;
    moon.visible=elev<0.15;
    moon.position.set(-Math.cos(az)*36,8+Math.max(0,-elev)*20,-10);
    const day=clamp(elev/1.05,0,1),dusk=clamp(1-day,0,1),nightK=clamp(-elev/0.35,0,1);
    sky.setRGB(0.56*day+0.85*dusk*(1-nightK)+0.04*nightK,0.78*day+0.42*dusk*(1-nightK)+0.06*nightK,0.95*day+0.22*dusk*(1-nightK)+0.12*nightK);
    if(scene.fog)scene.fog.color.copy(sky);
    hemi.intensity=0.25+0.55*day;
    sunL.intensity=sy>0?1.55*day:0;
    amb.intensity=0.05+0.55*nightK;
    if(!A.watching){
      lookStep(S,dt,input.lx,input.ly,MOVE.roomPitch);
      const ox=b.x,oz=b.z;
      walker.step(dt,input,S.yaw);
      if(!S.night&&elev<0.06){
        S.night=true;mon.visible=true;monLight.intensity=3.2;
        S.said=2;o.say('The sun is down. Something is in the village.',3.6);o.tone(70,1.2,'sawtooth',0.12,0,-40);
      }
      // villagers
      for(const v of folks){
        if(v.dead)continue;
        const fright=S.night&&!S.dead&&Math.hypot(v.x-S.mx,v.z-S.mz)<14;
        let tx,tz;
        if(fright){tx=v.x+(v.x-S.mx);tz=v.z+(v.z-S.mz);tx=clamp(tx,-12,12);tz=clamp(tz,-24,-4)}
        else{const q=path[v.wp];tx=q[0];tz=q[1];if(Math.hypot(v.x-tx,v.z-tz)<0.4)v.wp=(v.wp+1+(rnd()*2|0))%path.length}
        const step=moveTo(v.x,v.z,tx,tz,(fright?5.4:3.6)*dt);
        v.x=step.x;v.z=step.z;
        v.g.position.set(v.x,0,v.z);
        if(step.dx||step.dz)v.g.rotation.y=Math.atan2(step.dx,step.dz);
        const sw=Math.sin(S.t*11+v.wp)*0.35;
        v.l1.rotation.x=sw;v.l2.rotation.x=-sw;
        if(S.night&&!S.dead&&Math.hypot(v.x-S.mx,v.z-S.mz)<0.85){
          v.dead=true;v.g.rotation.x=1.25;v.g.position.y=0.15;
          o.say(v.name+' goes down.',1.6);o.tone(180,0.25,'square',0.05);
        }
      }
      // the thing
      if(S.night&&!S.dead){
        let tx=b.x,tz=b.z,best=1e9,prey=null;
        for(const v of folks)if(!v.dead){const d=Math.hypot(v.x-S.mx,v.z-S.mz);if(d<best){best=d;prey=v}}
        if(prey&&best<16){tx=prey.x;tz=prey.z}
        const step=moveTo(S.mx,S.mz,tx,tz,6.6*dt);
        S.mx=clamp(step.x,-14,14);S.mz=clamp(step.z,-26,2);
        poseMon();
        monLight.position.set(0,1.6,0.2);
        const bob=Math.sin(S.t*8)*0.08;
        if(parts.armL.visible)parts.armL.rotation.x=bob;
        if(parts.armR.visible)parts.armR.rotation.x=-bob;
        if(Math.hypot(b.x-S.mx,b.z-S.mz)<0.95&&b.y<1.2){
          if(S.bite<=0){
            S.bite=1.15;
            if(o.damage()){finish({k:'dead',why:'hamlet'});return}
            o.say('It reaches you.',1.4);
          }
        }
      }
      if(S.cool>0)S.cool-=dt;
      if(S.bite>0)S.bite-=dt;
      const press=!!input.press&&!S.wasP;S.wasP=!!input.press;
      const alt=!!input.alternate&&!S.wasA;S.wasA=!!input.alternate;
      const chestD=Math.hypot(b.x-2.15,b.z+13.2);
      if(!S.sword&&press&&chestD<1.7){
        S.sword=true;sword.visible=true;lid.rotation.x=-1.15;
        chestLight.intensity=0.4;
        o.say('Obsidian glass. Cold as a window at night.',3.2);o.sfx('shard');
      }
      const facing=(()=>{const dx=S.mx-b.x,dz=S.mz-b.z,d=Math.hypot(dx,dz);if(d<0.2)return false;
        const f=[Math.sin(S.yaw),-Math.cos(S.yaw)];return (f[0]*dx+f[1]*dz)/d>0.35})();
      if(S.sword&&S.night&&!S.dead&&(alt||press)&&S.cool<=0&&facing&&Math.hypot(b.x-S.mx,b.z-S.mz)<2.35){
        S.cool=0.48;S.limbs--;o.tone(520,0.12,'square',0.07,0,180);o.sfx('spike');
        const key=order[lost.length];
        if(key&&parts[key]){parts[key].visible=false;lost.push(key)}
        if(S.limbs<=0){
          S.dead=true;mon.rotation.x=1.2;mon.position.y=0.2;monLight.intensity=0.2;
          o.say('It comes apart. The door home is behind you.',3.6);o.sfx('shard');
        }else o.say(S.limbs===3?'A limb comes off.':S.limbs+' left.',1.3);
      }
      if(b.y<1.3&&crossedDoor(ox,oz,b.x,b.z,{x:S.doorX,z:S.doorZ,face:S.doorFace},0.62)){
        finish({k:S.dead?'win':'leave',why:'hamlet'});return;
      }
      if(S.said===0&&S.t>0.8){S.said=1;o.say('A bright little village. The sun is already low.',4)}
      const cut=o.control?o.control('alternate'):'Q';
      const use=o.control?o.control('press'):'E';
      const hint=S.dead?'The door home is behind you.':S.sword&&S.night?'Face it and '+cut+' to cut. Each hit takes a limb.':S.night?'The chest in the square holds a sword.':chestD<3?'The chest. '+use+' to open it.':'The way home is behind you. The sun will not wait.';
      o.hud('<small>'+hint+'</small>');
    }else o.hud('<small>'+(A.label||'')+'</small>');
    syncParts();
    const swing=S.cool>0.2?Math.sin((0.48-S.cool)*14):0.4;
    sword.position.set(b.x+Math.sin(S.yaw)*0.45+Math.cos(S.yaw)*0.28,0.85+b.y,b.z-Math.cos(S.yaw)*0.45+Math.sin(S.yaw)*0.28);
    sword.rotation.set(swing,-S.yaw,0.2);
    cam.position.set(b.x,EYE+b.y+bobY(b,walker.scale),b.z);
    cam.rotation.set(S.pitch,-S.yaw,0,'YXZ');
    S.vx=b.x;S.vz=b.z;
  };
  onClear(()=>{scene.fog=null});
  return S;
}
