// A strange door into a wood that does not end.
// The way back walks with you and stays directly behind your head, so turning never shows it.
// The still pond is a scrying pool, not a true mirror: looking down into it shows the door
// that is standing behind you. Seeing that reflection, or seeing the door itself, holds the
// door where it is. Look away from both and it slips behind you again.
import * as THREE from 'three';
import {MOVE,bobY,createRoomWalker,lookStep} from './movement.js';

const EYE=1.6;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

export const STILL={
  behind:4.2, doorHalf:0.52, doorH:2.2, pondR:5.5,
  grace:2.15, seeDot:0.6, lookDown:-0.28, waterY:0.045,
};

export function horizForward(yaw){
  return [Math.sin(yaw), -Math.cos(yaw)];
}
// Matches the room camera: cam.rotation.set(pitch, -yaw, 0, 'YXZ'). Negative pitch looks down.
export function lookDir(yaw,pitch){
  const cp=Math.cos(pitch),sp=Math.sin(pitch);
  return [Math.sin(yaw)*cp, sp, -Math.cos(yaw)*cp];
}
export function placeBehind(x,z,yaw,dist=STILL.behind,blocked){
  const f=horizForward(yaw);
  let d=dist,px=x-f[0]*d,pz=z-f[1]*d;
  if(blocked){
    for(let i=0;i<8&&blocked(px,pz);i++){d+=0.65;px=x-f[0]*d;pz=z-f[1]*d}
    if(blocked(px,pz)){px+=-f[1]*1.5;pz+=f[0]*1.5}
  }
  return {x:px,z:pz,face:yaw};
}
export function rayHitsPond(eye,dir,pond,waterY=STILL.waterY){
  if(dir[1]>=-0.05)return null;
  const t=(waterY-eye[1])/dir[1];
  if(t<0.15||t>30)return null;
  const x=eye[0]+dir[0]*t,z=eye[2]+dir[2]*t;
  if((x-pond.x)**2+(z-pond.z)**2>pond.r*pond.r)return null;
  return {x,z,t};
}
export function doorSeen(eye,dir,door,minDot=STILL.seeDot){
  const vx=door.x-eye[0],vy=1.15-eye[1],vz=door.z-eye[2];
  const d=Math.hypot(vx,vy,vz);
  if(d<0.35||d>16)return false;
  return (dir[0]*vx+dir[1]*vy+dir[2]*vz)/d>minDot;
}
// True when the segment from (x0,z0) to (x1,z1) passes through the doorway.
export function crossedDoor(x0,z0,x1,z1,door,half=STILL.doorHalf){
  const nx=Math.sin(door.face),nz=-Math.cos(door.face);
  const d0=(x0-door.x)*nx+(z0-door.z)*nz;
  const d1=(x1-door.x)*nx+(z1-door.z)*nz;
  if(d0*d1>=0||Math.abs(d0)<1e-6&&Math.abs(d1)<1e-6)return false;
  const t=d0/(d0-d1);
  const x=x0+(x1-x0)*t,z=z0+(z1-z0)*t;
  const side=(x-door.x)*(-nz)+(z-door.z)*nx;
  return Math.abs(side)<=half;
}
// One simulation step. s = {x,z,yaw,pitch,door:{x,z,face},pond:{x,z,r},pinned,hold}
export function stillStep(s,dt){
  const eye=[s.x,s.eye??EYE,s.z];
  const dir=lookDir(s.yaw,s.pitch);
  const down=s.pitch<(s.lookDown??STILL.lookDown)&&!!rayHitsPond(eye,dir,s.pond,s.waterY??STILL.waterY);
  const direct=doorSeen(eye,dir,s.door,s.seeDot??STILL.seeDot);
  const sees=down||direct;
  if(sees){s.hold=s.grace??STILL.grace;s.pinned=true}
  else if(s.pinned){s.hold-=dt;if(s.hold<=0){s.pinned=false;s.hold=0}}
  if(!s.pinned){
    const p=placeBehind(s.x,s.z,s.yaw,s.behind??STILL.behind,s.blocked);
    s.door.x=p.x;s.door.z=p.z;s.door.face=p.face;
  }
  s.down=down;s.direct=direct;s.sees=sees;
  return s;
}

function hash2(x,z,seed){
  let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^(seed|0);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}
function pineGeometry(){
  const g=new THREE.CylinderGeometry(0.11,0.16,1.15,5);
  g.translate(0,0.58,0);
  const a=new THREE.ConeGeometry(1.15,2.4,6),b=new THREE.ConeGeometry(0.82,1.8,6);
  a.translate(0,2.15,0);b.translate(0,3.15,0);
  return mergeParts([[g,0.36,0.24,0.12],[a,0.16,0.38,0.18],[b,0.22,0.48,0.24]]);
}
function fernGeometry(){
  const g=new THREE.ConeGeometry(0.55,0.7,5);
  g.translate(0,0.28,0);
  return mergeParts([[g,0.28,0.46,0.2]]);
}
function mergeParts(parts){
  let n=0;
  for(const [g] of parts)n+=g.attributes.position.count;
  const pos=new Float32Array(n*3),col=new Float32Array(n*3);
  let o=0;
  for(const [g,r,gc,b] of parts){
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      pos[(o+i)*3]=p.getX(i);pos[(o+i)*3+1]=p.getY(i);pos[(o+i)*3+2]=p.getZ(i);
      col[(o+i)*3]=r;col[(o+i)*3+1]=gc;col[(o+i)*3+2]=b;
    }
    o+=p.count;g.dispose();
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));
  out.setAttribute('color',new THREE.BufferAttribute(col,3));
  out.computeVertexNormals();
  return out;
}
function makeDoor(){
  const root=new THREE.Group();
  const wood=new THREE.MeshStandardMaterial({color:0x6a4a2c,roughness:0.86});
  const dark=new THREE.MeshStandardMaterial({color:0x2a2118,roughness:0.9});
  const leaf=new THREE.MeshStandardMaterial({color:0x3d6a48,roughness:0.75,emissive:0x143022,emissiveIntensity:0.45});
  const glow=new THREE.MeshStandardMaterial({color:0xd7ffe8,emissive:0xb6ffd2,emissiveIntensity:0.8,roughness:0.35});
  const box=(w,h,d,x,y,z,mat)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z);root.add(m);return m;
  };
  box(0.14,2.25,0.16,-0.62,1.12,0,wood);
  box(0.14,2.25,0.16,0.62,1.12,0,wood);
  box(1.38,0.16,0.16,0,2.2,0,wood);
  box(1.1,2.02,0.06,0,1.08,0,dark);
  box(0.92,1.7,0.05,0,1.12,0.04,leaf);
  box(0.34,0.7,0.04,0,1.35,0.07,glow);
  const light=new THREE.PointLight(0xd8ffc8,1.4,7,2);
  light.position.set(0,1.3,0.3);root.add(light);
  return root;
}

export function stillwoodRoom({group,scene,cam,renderer,o,A,finish,onClear,seed=7}){
  const pond={x:((seed%5)-2)*2.2,z:-16,r:STILL.pondR};
  cam.fov=72;cam.near=0.08;cam.far=160;
  const prevBg=scene.background;
  scene.background=new THREE.Color(0xc5ddd0);
  scene.fog=new THREE.FogExp2(0xc5ddd0,o.low?0.034:0.026);
  group.add(new THREE.HemisphereLight(0xd5eee4,0x3d4e2c,0.85));
  const sun=new THREE.DirectionalLight(0xfff0d0,1.55);
  sun.position.set(40,55,18);group.add(sun);

  const ground=new THREE.Mesh(new THREE.CircleGeometry(96,28),new THREE.MeshStandardMaterial({color:0x3e5a34,roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=0;group.add(ground);
  const pathMat=new THREE.MeshStandardMaterial({color:0x6d7a52,roughness:1});
  for(let i=1;i<=5;i++){
    const stone=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,0.08,6),pathMat);
    stone.position.set(pond.x*i/6,0.04,pond.z*i/6);group.add(stone);
  }
  const rockMat=new THREE.MeshStandardMaterial({color:0x8a9084,roughness:0.95});
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2,rock=new THREE.Mesh(new THREE.DodecahedronGeometry(0.28+((i*5)%3)*0.06,0),rockMat);
    rock.position.set(pond.x+Math.cos(a)*(pond.r+0.45),0.12,pond.z+Math.sin(a)*(pond.r+0.45));
    rock.scale.y=0.6;group.add(rock);
  }
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.55,9,8,1,true),
    new THREE.MeshBasicMaterial({color:0xe7fff4,transparent:true,opacity:0.1,side:THREE.DoubleSide,depthWrite:false}));
  beam.position.set(pond.x,4.5,pond.z);group.add(beam);

  const rt=new THREE.WebGLRenderTarget(o.low?256:512,o.low?256:512);
  const scryCam=new THREE.PerspectiveCamera(48,1,0.12,80);
  const water=new THREE.Mesh(new THREE.CircleGeometry(pond.r,48),new THREE.ShaderMaterial({
    transparent:false,fog:false,toneMapped:true,
    uniforms:{uScry:{value:rt.texture},uTime:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform sampler2D uScry;uniform float uTime;varying vec2 vUv;
      void main(){
        vec2 uv=vUv;
        uv.x+=0.012*sin(uv.y*38.0+uTime*1.3);
        uv.y+=0.012*sin(uv.x*34.0-uTime);
        vec3 refl=texture2D(uScry,uv).rgb;
        float rim=smoothstep(0.36,0.5,length(vUv-0.5));
        vec3 col=mix(refl*vec3(0.78,0.95,0.88),vec3(0.12,0.2,0.15),rim*0.72);
        gl_FragColor=vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
  }));
  water.rotation.x=-Math.PI/2;water.position.set(pond.x,STILL.waterY,pond.z);group.add(water);

  const pines=new THREE.InstancedMesh(pineGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9}),o.low?180:360);
  const ferns=new THREE.InstancedMesh(fernGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),o.low?220:480);
  pines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ferns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(pines,ferns);
  const dummy=new THREE.Object3D();
  let trees=[],chunkX=1e9,chunkZ=1e9;
  const clearOf=(x,z)=>((x-pond.x)**2+(z-pond.z)**2<(pond.r+2.4)**2)||(x*x+z*z<5*5);
  function trunkAt(x,z){return trees.some(t=>(t.x-x)**2+(t.z-z)**2<(t.r+0.9)**2)}
  function rebuild(cx,cz){
    if(cx===chunkX&&cz===chunkZ)return;
    chunkX=cx;chunkZ=cz;trees=[];
    let np=0,nf=0;
    const reach=o.low?1:2;
    for(let iz=-reach;iz<=reach;iz++)for(let ix=-reach;ix<=reach;ix++){
      const ox=(cx+ix)*16,oz=(cz+iz)*16;
      for(let j=0;j<5;j++)for(let i=0;i<5;i++){
        const x=ox+1.6+i*3.2,z=oz+1.6+j*3.2;
        const h=hash2(Math.round(x*4),Math.round(z*4),seed);
        if(clearOf(x,z)){
          if(h>0.72&&nf<ferns.count){
            dummy.position.set(x,0,z);dummy.scale.setScalar(0.7+h);dummy.rotation.y=h*6;
            dummy.updateMatrix();ferns.setMatrixAt(nf++,dummy.matrix);
          }
          continue;
        }
        if(h<0.38)continue;
        const sc=0.75+h*0.7;
        if(np<pines.count){
          dummy.position.set(x,0,z);dummy.rotation.y=h*12;dummy.scale.set(sc,0.85+h*0.5,sc);
          dummy.updateMatrix();pines.setMatrixAt(np++,dummy.matrix);
          trees.push({x,z,r:0.42*sc});
        }
        if(h>0.55&&nf<ferns.count){
          dummy.position.set(x+1.1*(h-0.5),0,z-0.8);dummy.scale.setScalar(0.55+h*0.4);dummy.rotation.y=h*4;
          dummy.updateMatrix();ferns.setMatrixAt(nf++,dummy.matrix);
        }
      }
    }
    dummy.scale.set(0,0,0);dummy.updateMatrix();
    for(;np<pines.count;np++)pines.setMatrixAt(np,dummy.matrix);
    for(;nf<ferns.count;nf++)ferns.setMatrixAt(nf,dummy.matrix);
    pines.instanceMatrix.needsUpdate=true;ferns.instanceMatrix.needsUpdate=true;
    pines.computeBoundingSphere();ferns.computeBoundingSphere();
  }

  const door=makeDoor();group.add(door);
  const S={t:0,yaw:0,pitch:0,bloom:0.18,seed,pinned:false,hold:0,said:0,doorX:0,doorZ:4.2,doorFace:0};
  const walker=createRoomWalker({o,eye:EYE,x:0,z:0,collide:b=>{
    for(const t of trees){
      const dx=b.x-t.x,dz=b.z-t.z,d=Math.hypot(dx,dz),m=0.32+t.r;
      if(d<m&&d>1e-4){b.x=t.x+dx/d*m;b.z=t.z+dz/d*m}
    }
  }});
  const b=walker.b;
  let prevX=b.x,prevZ=b.z;
  const poseDoor=()=>{
    door.position.set(S.doorX,0,S.doorZ);
    door.rotation.y=Math.PI-S.doorFace;
  };
  rebuild(0,0);
  Object.assign(S,placeBehind(0,0,0,STILL.behind,trunkAt));
  S.doorX=S.x;S.doorZ=S.z;S.doorFace=S.face;poseDoor();

  S.snap=()=>({sd:seed,x:+b.x.toFixed(2),z:+b.z.toFixed(2),y:+b.y.toFixed(2),yaw:+S.yaw.toFixed(3),pitch:+S.pitch.toFixed(3),dx:+S.doorX.toFixed(2),dz:+S.doorZ.toFixed(2),face:+S.doorFace.toFixed(3),pin:S.pinned?1:0});
  S.apply=q=>{
    if(![q.x,q.z,q.y,q.yaw,q.pitch,q.dx,q.dz,q.face].every(Number.isFinite))return;
    S.yaw=q.yaw;S.pitch=clamp(q.pitch,-MOVE.roomPitch,MOVE.roomPitch);
    S.doorX=q.dx;S.doorZ=q.dz;S.doorFace=q.face;S.pinned=!!q.pin;
    walker.watch(0.1,q.x,q.z,clamp(q.y,0,3));
  };
  S.frame=()=>{
    const eyeY=EYE+b.y+bobY(b,walker.scale);
    scryCam.position.set(b.x,eyeY,b.z);
    scryCam.lookAt(S.doorX,1.15,S.doorZ);
    scryCam.updateMatrixWorld();
    water.visible=false;
    const prev=renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene,scryCam);
    renderer.setRenderTarget(prev);
    water.visible=true;
  };
  S.update=(dt,input)=>{
    S.t+=dt;
    if(!A.watching){
      lookStep(S,dt,input.lx,input.ly,MOVE.roomPitch);
      const ox=b.x,oz=b.z;
      walker.step(dt,input,S.yaw);
      rebuild(Math.round(b.x/16),Math.round(b.z/16));
      const sim={
        x:b.x,z:b.z,yaw:S.yaw,pitch:S.pitch,eye:EYE+b.y,
        door:{x:S.doorX,z:S.doorZ,face:S.doorFace},
        pond,pinned:S.pinned,hold:S.hold,blocked:trunkAt,
      };
      stillStep(sim,dt);
      S.pinned=sim.pinned;S.hold=sim.hold;S.doorX=sim.door.x;S.doorZ=sim.door.z;S.doorFace=sim.door.face;
      if(S.pinned&&b.y<1.4&&crossedDoor(ox,oz,b.x,b.z,sim.door)){
        finish({k:'leave',why:'stillwood'});return;
      }
      if(sim.down&&S.said<2){S.said=2;o.say('The water holds the door where it stands.',3.5);o.tone(494,0.45,'sine',0.04,0,-180)}
      else if(!S.pinned&&S.said===2){S.said=3;o.say('It is behind you again.',2.5)}
      else if(S.said===0&&S.t>0.8){S.said=1;o.say('The way back will not stay where you can look.',4.5)}
      const near=Math.hypot(b.x-pond.x,b.z-pond.z)<pond.r+3;
      const hint=A.watching?A.label:S.pinned?'The door is held. Turn and walk through it.':near?'Look down into the water.':'The way back stays behind you.';
      o.hud('<small>'+hint+'</small>');
      if(near&&!A.watching&&Math.floor(S.t)%5===0&&S.t%5<dt)o.tone(880+Math.sin(S.t)*40,0.12,'sine',0.015);
    }else o.hud('<small>'+(A.label||'')+'</small>');
    poseDoor();
    ground.position.x=b.x;ground.position.z=b.z;
    water.material.uniforms.uTime.value=S.t;
    cam.position.set(b.x,EYE+b.y+bobY(b,walker.scale),b.z);
    cam.rotation.set(S.pitch,-S.yaw,0,'YXZ');
    prevX=b.x;prevZ=b.z;
  };
  onClear(()=>{scene.background=prevBg;rt.dispose()});
  return S;
}
