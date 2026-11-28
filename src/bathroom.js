// A strange door into a bathroom. The door locks behind you: sit down and wipe until the paper comes back white, then you may leave.
// Wipe again too soon after the last wipe and the paper comes back red (it hurts, and it does not count); three red wipes cost a heart.
// Controls: walk with the usual controls; Use (E / X / tap) sits down on the toilet, wipes while seated, and opens the door once you are
// clean; Back (Esc / B) stands up. A watcher sees the same visit from the snapshots (position, whether you are seated, the paper).
import * as THREE from 'three';
import {MOVE,bobY,createRoomWalker,lookStep,crouchOffset} from './movement.js';

const EYE=1.6,SEAT_EYE=1.12;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
// the room: x from -1.3 to 1.3, z from 0 (the door wall) to -3.2 (the toilet wall)
export const LOO={halfW:1.3,depth:3.2,toilet:{x:0,z:-2.78},sitFrom:1.15,gentle:0.7,clean:0.04,redsToHurt:3};
// the rules, apart from the drawing, so they can be tested on their own. rand() is the visit's own dice.
export function looGame(rand){
  const G={left:0.85+rand()*0.15,last:-9,reds:0,wipes:0,redTotal:0,paper:null,done:false};
  // one wipe at time t (seconds): what the paper shows, and whether it counted
  G.wipe=t=>{
    if(G.done)return {k:'clean'};
    const quick=t-G.last<LOO.gentle;G.last=t;G.wipes++;
    if(quick){G.reds++;G.redTotal++;const hurt=G.reds>=LOO.redsToHurt;if(hurt)G.reds=0;G.paper={k:'red',amt:0.75};return {k:'red',hurt}}
    const amt=Math.min(1,G.left*1.25);
    G.left=Math.max(0,G.left-(0.1+rand()*0.08));
    if(G.left<LOO.clean){G.left=0;G.done=true}
    G.paper=G.done?{k:'white',amt:0}:{k:'brown',amt};   // the last wipe is the one that comes back white
    return {k:G.done?'done':'brown',amt};
  };
  return G;
}
const WHITE=[0.95,0.94,0.9],BROWN=[0.36,0.22,0.09],RED=[0.82,0.1,0.12];
const paperCol=p=>!p?WHITE:p.k==='red'?WHITE.map((c,i)=>lerp(c,RED[i],p.amt)):WHITE.map((c,i)=>lerp(c,BROWN[i],clamp(p.amt,0,1)));

function canvasTex(w,h,draw,rep){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1])}
  t.anisotropy=4;return t;
}
const tiles=(base,line,n)=>canvasTex(256,256,(x,w,h)=>{
  x.fillStyle=base;x.fillRect(0,0,w,h);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const v=Math.sin(i*12.9898+j*78.233)*43758.5453%1;x.fillStyle=`rgba(255,255,255,${0.03+Math.abs(v)*0.05})`;x.fillRect(i*w/n+2,j*h/n+2,w/n-4,h/n-4)}
  x.strokeStyle=line;x.lineWidth=3;for(let i=0;i<=n;i++){x.beginPath();x.moveTo(i*w/n,0);x.lineTo(i*w/n,h);x.stroke();x.beginPath();x.moveTo(0,i*h/n);x.lineTo(w,i*h/n);x.stroke()}
});

export function bathroomRoom({group,scene,cam,o,A,finish,onClear,seed=7}){
  let a=seed>>>0||1;const rand=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const G=looGame(rand);
  cam.fov=72;cam.near=0.05;cam.far=30;
  const prevBg=scene.background;scene.background=new THREE.Color(0x0c0c0e);
  const {halfW:hw,depth:dp}=LOO,H=2.5;
  const std=(c,r=0.6,m=0,extra={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...extra});
  const box=(w,h,d,x,y,z,mat,parent=group)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m};
  // shell: tiled floor, tiled walls to shoulder height and paint above, a plain ceiling
  const floorMat=new THREE.MeshStandardMaterial({map:tiles('#d9d6cc','#9c978a',6),roughness:0.35});floorMat.map.repeat.set(2,2.5);floorMat.map.wrapS=floorMat.map.wrapT=THREE.RepeatWrapping;
  const wallTile=new THREE.MeshStandardMaterial({map:tiles('#7fb2b0','#4f7c7a',8),roughness:0.3});wallTile.map.wrapS=wallTile.map.wrapT=THREE.RepeatWrapping;
  const paint=std(0xd8d2bf,0.9);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(hw*2,dp),floorMat);floor.rotation.x=-Math.PI/2;floor.position.set(0,0,-dp/2);group.add(floor);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(hw*2,dp),std(0xe8e4d8,0.95));ceil.rotation.x=Math.PI/2;ceil.position.set(0,H,-dp/2);group.add(ceil);
  const wall=(w,x,z,ry)=>{const t=new THREE.Mesh(new THREE.PlaneGeometry(w,1.4),wallTile.clone());t.material.map=wallTile.map.clone();t.material.map.repeat.set(w/0.6,1.4/0.6);t.material.map.needsUpdate=true;
    t.position.set(x,0.7,z);t.rotation.y=ry;group.add(t);
    const p=new THREE.Mesh(new THREE.PlaneGeometry(w,H-1.4),paint);p.position.set(x,1.4+(H-1.4)/2,z);p.rotation.y=ry;group.add(p);
    const trim=box(ry%Math.PI===0?w:0.03,0.05,ry%Math.PI===0?0.03:w,x,1.41,z,std(0x3c5e5c,0.4));trim.rotation.y=0}
  wall(hw*2,0,-dp,0);wall(hw*2,0,0,Math.PI);wall(dp,-hw,-dp/2,Math.PI/2);wall(dp,hw,-dp/2,-Math.PI/2);
  // the door you came in by (behind you at the start), with a lock light over it: red until you are clean
  const door=new THREE.Group();door.position.set(0,0,-0.02);group.add(door);
  box(0.9,2.05,0.05,0,1.025,0,std(0xe9e4d6,0.55),door);box(0.08,2.15,0.08,-0.49,1.075,0,std(0xbdb6a5,0.5),door);box(0.08,2.15,0.08,0.49,1.075,0,std(0xbdb6a5,0.5),door);box(1.06,0.08,0.08,0,2.15,0,std(0xbdb6a5,0.5),door);
  box(0.1,0.03,0.04,0.33,1.0,-0.05,std(0xc9c9cc,0.25,0.9),door);
  const lockMat=new THREE.MeshStandardMaterial({color:0x330000,emissive:0xff2a1a,emissiveIntensity:2});
  const lock=box(0.16,0.07,0.03,0,2.32,-0.03,lockMat,door);
  const lockLight=new THREE.PointLight(0xff3a2a,0.6,3,2);lockLight.position.set(0,2.25,-0.3);group.add(lockLight);
  // the toilet: bowl, seat, tank and a flush handle, against the far wall facing the door
  const T=LOO.toilet,porc=std(0xf4f2ec,0.18,0.02);
  const bowl=new THREE.Mesh(new THREE.CylinderGeometry(0.21,0.15,0.4,24),porc);bowl.scale.z=1.25;bowl.position.set(T.x,0.2,T.z+0.08);group.add(bowl);
  const seatG=new THREE.TorusGeometry(0.19,0.035,10,28);const seat=new THREE.Mesh(seatG,std(0xf7f5ef,0.3));seat.rotation.x=Math.PI/2;seat.scale.y=1.25;seat.position.set(T.x,0.42,T.z+0.08);group.add(seat);
  const water=new THREE.Mesh(new THREE.CircleGeometry(0.15,20),std(0x9fc4cf,0.05,0,{transparent:true,opacity:0.85}));water.rotation.x=-Math.PI/2;water.scale.y=1.25;water.position.set(T.x,0.36,T.z+0.08);group.add(water);
  const lid=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.03,24),std(0xf7f5ef,0.3));lid.scale.z=1.25;lid.position.set(T.x,0.68,T.z-0.18);lid.rotation.x=-1.35;group.add(lid);
  box(0.48,0.4,0.2,T.x,0.82,T.z-0.3,porc);box(0.5,0.05,0.22,T.x,1.04,T.z-0.3,porc);
  const handle=box(0.09,0.025,0.025,T.x-0.17,0.96,T.z-0.19,std(0xcfcfd4,0.2,0.95));
  // the paper roll on the left wall, the sink and mirror on the right, a little bin
  const roll=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.11,20),std(0xfbfaf6,0.8));roll.rotation.z=Math.PI/2;roll.position.set(-hw+0.1,0.72,T.z+0.2);group.add(roll);
  box(0.02,0.02,0.16,-hw+0.04,0.72,T.z+0.2,std(0xcfcfd4,0.2,0.95));
  const sheet=box(0.002,0.12,0.11,-hw+0.165,0.63,T.z+0.2,std(0xfbfaf6,0.85));
  const sinkMat=std(0xf4f2ec,0.15);
  box(0.42,0.12,0.5,hw-0.24,0.86,-1.45,sinkMat);box(0.08,0.8,0.08,hw-0.24,0.4,-1.45,sinkMat);
  box(0.03,0.16,0.03,hw-0.06,0.99,-1.45,std(0xcfcfd4,0.15,0.95));box(0.14,0.025,0.025,hw-0.12,1.07,-1.45,std(0xcfcfd4,0.15,0.95));
  const mirror=new THREE.Mesh(new THREE.PlaneGeometry(0.55,0.7),new THREE.MeshStandardMaterial({color:0xaab8be,roughness:0.06,metalness:0.35}));mirror.rotation.y=-Math.PI/2;mirror.position.set(hw-0.025,1.55,-1.45);group.add(mirror);
  box(0.02,0.76,0.61,hw-0.005,1.55,-1.45,std(0x8a7a5a,0.5));
  const bin=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.09,0.28,16,1,true),std(0x9aa0a4,0.35,0.7,{side:THREE.DoubleSide}));bin.position.set(-hw+0.2,0.14,-2.0);group.add(bin);
  // the sign that names the game, over the toilet
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.28),new THREE.MeshStandardMaterial({map:canvasTex(512,160,(x,w,h)=>{
    x.fillStyle='#f3efe2';x.fillRect(0,0,w,h);x.strokeStyle='#2c4b62';x.lineWidth=8;x.strokeRect(8,8,w-16,h-16);
    x.fillStyle='#2c4b62';x.textAlign='center';x.font='bold 58px Georgia';x.fillText('PLEASE WIPE',w/2,72);x.font='600 40px Georgia';x.fillText('THOROUGHLY · GENTLY',w/2,128)}),roughness:0.6}));
  sign.position.set(0,1.75,-dp+0.01);group.add(sign);
  // light: one buzzing tube over the toilet (where to look first), a softer fill by the door
  const tube=box(0.9,0.04,0.12,0,H-0.03,-2.1,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xf3f8ff,emissiveIntensity:2.2}));
  const key=new THREE.PointLight(0xf1f6ff,9,6,2);key.position.set(0,H-0.2,-2.2);group.add(key);
  const fill=new THREE.PointLight(0xffe7c4,2.5,5,2);fill.position.set(0,H-0.3,-0.6);group.add(fill);
  group.add(new THREE.HemisphereLight(0xe8eef0,0x6a6458,0.35));
  // the paper you hold up after each wipe (in front of the camera, seated)
  const paperTex=canvasTex(128,128,(x,w,h)=>{x.fillStyle='#fff';x.fillRect(0,0,w,h);for(let i=0;i<600;i++){x.fillStyle=`rgba(0,0,0,${Math.random()*0.06})`;x.fillRect(Math.random()*w,Math.random()*h,2,2)}
    x.strokeStyle='rgba(0,0,0,.12)';x.setLineDash([3,4]);x.beginPath();x.moveTo(0,4);x.lineTo(w,4);x.moveTo(0,h-4);x.lineTo(w,h-4);x.stroke()});
  const paperMat=new THREE.MeshBasicMaterial({map:paperTex,color:new THREE.Color(...WHITE)});
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(0.14,0.13,6,6),paperMat);
  {const p=paper.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)*40)*0.004+Math.cos(p.getY(i)*35)*0.004);p.needsUpdate=true}
  paper.visible=false;scene.add(paper);onClear(()=>{scene.remove(paper);paper.geometry.dispose();paperMat.dispose();paperTex.dispose()});

  const S={t:0,yaw:0,pitch:-0.05,bloom:0.22,seed,sit:false,anim:0,said:0,G,stand:null,flush:0,redMsg:0};
  const walker=S.walker=createRoomWalker({o,eye:EYE,x:0,z:-0.65,collide:b=>{
    b.x=clamp(b.x,-hw+0.25,hw-0.25);b.z=clamp(b.z,-dp+0.28,-0.28);
    const dx=b.x-T.x,dz=b.z-(T.z+0.02),d=Math.hypot(dx,dz),m=0.5;if(d<m&&d>1e-4){b.x=T.x+dx/d*m;b.z=T.z+0.02+dz/d*m}
    if(b.x>hw-0.72&&b.z<-1.05&&b.z>-1.85)b.x=hw-0.72;
  }});
  const b=walker.b;
  const nearToilet=()=>Math.hypot(b.x-T.x,b.z-T.z)<LOO.sitFrom;
  const nearDoor=()=>b.z>-1.0&&Math.abs(b.x)<0.7;
  const showPaper=()=>{const c=paperCol(G.paper);paperMat.color.setRGB(c[0],c[1],c[2]);S.anim=1};
  function wipe(){
    if(!S.sit||G.done)return;
    const r=G.wipe(S.t);showPaper();
    o.noise(0.18,0.12,2600,0.8);o.noise(0.12,0.08,1400,0.6);
    if(r.k==='red'){o.tone(392,0.25,'sawtooth',0.06,0,-150);o.tone(330,0.3,'square',0.04,0.08,-120);
      if(r.hurt){if(o.damage&&o.damage()){finish({k:'dead',why:'bathroom'});return true}o.hurtFx&&o.hurtFx()}}
    else if(r.k==='done'){o.tone(784,0.2,'triangle',0.06);o.tone(1046,0.3,'triangle',0.06,0.12);o.noise(0.1,0.15,1200,2,0.3);   // and the lock clicks open
      lockMat.emissive.setHex(0x2aff5a);lock.material.color.setHex(0x003300);lockLight.color.setHex(0x3aff6a)}
    return false;
  }
  function sit(on){
    if(on===S.sit)return;S.sit=on;
    if(on){S.stand={x:b.x,z:b.z,yaw:S.yaw,pitch:S.pitch};S.yaw=Math.PI;S.pitch=-0.12;o.noise(0.15,0.05,700,0.6)}
    else{
      if(G.done&&!S.flush){S.flush=1;o.noise(1.6,0.22,500,0.5);o.noise(1.2,0.1,2400,0.7);o.tone(180,1.2,'sine',0.05,0.1,-90)}
      const q=S.stand||{x:0,z:-1.8,yaw:Math.PI,pitch:0};walker.watch(0,q.x,q.z,0);b.x=q.x;b.z=q.z;S.yaw=q.yaw;S.pitch=q.pitch;paper.visible=false}
  }
  S.controlMode=()=>S.sit?'read':'walk';
  S.tap=()=>{if(A.watching)return false;if(S.sit){wipe();return true}return false};
  S.snap=()=>({sd:seed,x:+b.x.toFixed(2),z:+b.z.toFixed(2),y:+b.y.toFixed(2),yaw:+S.yaw.toFixed(3),pitch:+S.pitch.toFixed(3),sit:S.sit?1:0,left:+G.left.toFixed(3),done:G.done?1:0,pk:G.paper?G.paper.k:'',pa:G.paper?+G.paper.amt.toFixed(2):0,w:G.wipes});
  S.apply=q=>{
    if(![q.x,q.z,q.y,q.yaw,q.pitch].every(Number.isFinite))return;
    S.yaw=q.yaw;S.pitch=clamp(q.pitch,-MOVE.roomPitch,MOVE.roomPitch);S.sit=!!q.sit;G.left=+q.left||0;G.done=!!q.done;
    if(q.w!==S.wSeen){S.wSeen=q.w;G.paper=q.pk?{k:q.pk,amt:+q.pa||0}:null;if(G.paper)showPaper()}
    if(G.done){lockMat.emissive.setHex(0x2aff5a);lockLight.color.setHex(0x3aff6a)}
    walker.watch(0.1,q.x,q.z,clamp(q.y,0,3));
  };
  S.update=(dt,input)=>{
    S.t+=dt;
    if(!A.watching){
      const press=!!input.press&&!S.wasP;S.wasP=!!input.press;
      const bk=!!input.back&&!S.wasB;S.wasB=!!input.back;
      if(S.sit){
        lookStep(S,dt,input.lx,input.ly,MOVE.roomPitch);S.yaw=clamp(S.yaw,Math.PI-1.1,Math.PI+1.1);
        if(press&&wipe())return;
        if(bk||Math.hypot(input.mx||0,input.my||0)>0.6&&S.t-(S.sitT||0)>0.5)sit(false);
      }else{
        lookStep(S,dt,input.lx,input.ly,MOVE.roomPitch);walker.step(dt,input,S.yaw);
        if(press&&nearToilet()&&!G.done){sit(true);S.sitT=S.t}
        else if(press&&nearDoor()){
          if(G.done){finish({k:'win',why:'bathroom',reds:G.redTotal});return}
          o.tone(110,0.2,'square',0.05);o.noise(0.25,0.12,600,1);   // the handle rattles: locked
        }
      }
      if(S.said===0&&S.t>0.4){S.said=1;o.noise(0.12,0.2,900,2);o.tone(220,0.08,'square',0.05,0.05)}   // the bolt clicks shut behind you
    }
    // no instructions (door rooms are discovered, not explained): only a watcher's name label
    o.hud(A.watching?'<small>'+(A.label||'')+'</small>':'');
    // the camera, seated or walking
    if(S.sit){cam.position.set(T.x,SEAT_EYE,T.z+0.12)}
    else cam.position.set(b.x,EYE+b.y+bobY(b,walker.scale)-crouchOffset(b,EYE),b.z);
    cam.rotation.set(S.pitch,-S.yaw,0,'YXZ');
    if(S.sit&&G.paper){
      S.anim=Math.max(0,S.anim-dt*0.9);const k=S.anim>0.75?(1-S.anim)/0.25:1;   // it rises into view after each wipe
      paper.visible=true;cam.updateMatrixWorld();
      const p=new THREE.Vector3(0.0,-0.13-0.25*(1-k),-0.38).applyMatrix4(cam.matrixWorld);paper.position.copy(p);paper.quaternion.copy(cam.quaternion);paper.rotateZ(0.12);
    }else paper.visible=false;
    sheet.scale.y=1+Math.sin(S.t*0.7)*0.03;
    const flick=1+(Math.sin(S.t*47)>0.97?-0.5:0)*(Math.sin(S.t*0.31)>0.6?1:0);key.intensity=9*flick;tube.material.emissiveIntensity=2.2*flick;
    if(!A.watching&&Math.floor(S.t*0.5)!==Math.floor((S.t-dt)*0.5))o.tone(120,0.5,'sine',0.006);   // the tube's hum
  };
  onClear(()=>{scene.background=prevBg;paper.visible=false});
  return S;
}
