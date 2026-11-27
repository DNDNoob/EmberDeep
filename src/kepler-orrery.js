import * as THREE from 'three';
import {BINARY,PLANETS,binaryPolar,orbitalPosition,orbitPolar} from './kepler-system.js';

// Left rock wall sits near x = -20.6; the observation window is the far wall at x ≈ +21, z = 4.
// Table radius is 1.34, so the center is just clear of the stone that knobs into the room.
const X=-18.62,Z=4,REACH=1.58;
const DAY=1.15,SIM=0.5/24;
const STATION={a:0.493,e:0.018,period:110.93,phase:0.9,tilt:0.18};
const BELT={a:1.18,e:0.01,period:420,phase:0.4};
const SPEEDS=[1,4,12];
const TELESCOPE_MAG=0.9;
export {TELESCOPE_MAG};

const rockShader=new THREE.ShaderMaterial({
  vertexShader:`varying vec3 vN;varying vec3 vL;void main(){vL=position;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`varying vec3 vN;varying vec3 vL;
    void main(){
      if(length(vL.yz)<0.4&&vL.x>-0.06) discard;
      float lit=0.28+0.72*max(dot(normalize(vN),normalize(vec3(0.25,1.0,0.35))),0.0);
      float grit=fract(sin(dot(vL,vec3(12.9,78.2,37.1)))*43758.5);
      gl_FragColor=vec4(mix(vec3(0.32,0.27,0.24),vec3(0.55,0.48,0.4),grit)*lit,1.0);
    }`
});

function flat([r,theta],tilt=0){
  // The disk stays on the wood. Bodies sit high enough that a tilted moon
  // or the asteroid's belly never crosses the tabletop.
  return new THREE.Vector3(r*Math.cos(theta),0.62+Math.sin(tilt)*r*0.22,r*Math.sin(theta));
}

function add3(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function sub3(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross3(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function scale3(a,s){return [a[0]*s,a[1]*s,a[2]*s];}
function norm3(a){const l=Math.hypot(a[0],a[1],a[2])||1;return scale3(a,1/l);}

// Lobby glass, from the Mind Vault: Obera stays centered and large enough
// to read, and the vault's spin rolls the view around that aim.
const WINDOW_TINTS=[
  [1,0.945,0.824],[1,0.541,0.271],[0.718,0.788,0.839],[0.902,0.827,0.682],
  [0.624,0.816,0.749],[0.957,0.937,0.894],[0.620,0.714,0.788],[0.831,0.537,0.361]
];

export function windowSky(time){
  const t=(time||0)*DAY*SIM,spin=(time||0)*0.35*SIM;
  const station=orbitalPosition(orbitPolar(STATION,t),STATION.tilt);
  const [mora,osi]=binaryPolar(t).map(polar=>orbitalPosition(polar));
  const [yuron,sollel,obera]=PLANETS.map(planet=>orbitalPosition(orbitPolar(planet,t),planet.tilt));
  const moons=[[4.4,2.1,0.3],[6.8,5.4,0.9],[9.6,11.5,1.15]].map(([orbit,period,incl])=>{
    const th=(t/period)*Math.PI*2+incl*2,R=orbit*0.026,lz=Math.sin(th)*R;
    return add3(obera,[Math.cos(th)*R,-Math.sin(incl)*lz,Math.cos(incl)*lz]);
  });
  const places=[mora,osi,yuron,sollel,obera,...moons];
  const radii=[0.055,0.032,0.022,0.034,0.026,0.32*0.026,0.24*0.026,0.4*0.026];
  const kinds=[1,1,0,2,4,3,3,3];
  let forward=norm3(sub3(obera,station));
  let right=cross3([0,1,0],forward);
  if(dot3(right,right)<1e-8)right=cross3([1,0,0],forward);
  right=norm3(right);
  const up=norm3(cross3(forward,right));
  const cs=Math.cos(spin),sn=Math.sin(spin);
  const rolledRight=add3(scale3(right,cs),scale3(up,sn));
  const rolledUp=add3(scale3(up,cs),scale3(right,-sn));
  const mag=TELESCOPE_MAG;
  const bodies=places.map((p,i)=>{
    const rel=sub3(p,station),depth=dot3(rel,forward);
    if(depth<0.02)return {x:0,y:0,r:0,kind:0,depth,tint:WINDOW_TINTS[i]};
    return {
      x:dot3(rel,rolledRight)/depth*mag,
      y:dot3(rel,rolledUp)/depth*mag,
      r:radii[i]/depth*mag,
      kind:kinds[i],
      depth,
      tint:WINDOW_TINTS[i]
    };
  }).sort((a,b)=>b.depth-a.depth);
  return {mag,roll:spin,station,forward,right:rolledRight,up:rolledUp,bodies};
}

function wire(parent,color,radius,sample){
  const pts=[];
  for(let i=0;i<96;i++)pts.push(sample(i/96));
  const curve=new THREE.CatmullRomCurve3(pts,true,'catmullrom',0.05);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,96,radius,5,true),new THREE.MeshStandardMaterial({
    color,metalness:0.82,roughness:0.3,emissive:color,emissiveIntensity:0.22
  }));
  parent.add(mesh);
}

function sphere(parent,radius,color,basic){
  const material=basic
    ? new THREE.MeshBasicMaterial({color})
    : new THREE.MeshStandardMaterial({color,roughness:0.55,metalness:0.08,emissive:color,emissiveIntensity:0.12});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,24,16),material);
  parent.add(mesh);
  return mesh;
}

function plate(){
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#1c1612';ctx.fillRect(0,0,512,128);
  ctx.strokeStyle='#c6a15a';ctx.lineWidth=8;ctx.strokeRect(10,10,492,108);
  ctx.fillStyle='#f3e6c8';ctx.textAlign='center';ctx.font='600 46px Georgia, serif';
  ctx.fillText('KEPLER-47',256,62);
  ctx.fillStyle='#c6a15a';ctx.font='500 22px Georgia, serif';
  ctx.fillText('ORRERY  ·  3 MARCH 2356',256,98);
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.18,0.02),new THREE.MeshBasicMaterial({map}));
  mesh.position.set(1.33,0.67,0);
  mesh.rotation.y=Math.PI/2;
  return mesh;
}

function control(group,brass,z){
  const frame=new THREE.Mesh(new THREE.BoxGeometry(0.21,0.042,0.31),brass);
  frame.position.set(1.13,0.81,z);
  group.add(frame);
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=160;
  const ctx=canvas.getContext('2d');
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  const face=new THREE.Mesh(new THREE.PlaneGeometry(0.29,0.19),new THREE.MeshBasicMaterial({map}));
  face.position.y=0.022;
  face.rotation.set(-Math.PI/2,0,Math.PI/2);
  frame.add(face);
  return {face,draw(label,lit){
    ctx.fillStyle=lit?'#60401d':'#251b14';ctx.fillRect(0,0,256,160);
    ctx.strokeStyle='#be9553';ctx.lineWidth=4;ctx.strokeRect(8,8,240,144);
    ctx.fillStyle='#ffe7bb';ctx.font='bold 46px "Segoe UI", sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,128,81);
    map.needsUpdate=true;
  }};
}

export function createKeplerOrrery(){
  const group=new THREE.Group();
  group.position.set(X,0,Z);
  const timber=new THREE.MeshStandardMaterial({color:0x2a211c,roughness:0.78});
  const brass=new THREE.MeshStandardMaterial({color:0xc6a15a,metalness:0.86,roughness:0.28});
  const top=new THREE.Mesh(new THREE.CylinderGeometry(1.34,1.34,0.08,40),timber);
  top.position.y=0.74;group.add(top);
  const lip=new THREE.Mesh(new THREE.TorusGeometry(1.34,0.016,8,48),brass);
  lip.rotation.x=Math.PI/2;lip.position.y=0.78;group.add(lip);
  for(let k=0;k<6;k++){
    const a=(k/6)*Math.PI*2;
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,0.7,6),new THREE.MeshStandardMaterial({color:0x4b3930,roughness:0.84}));
    leg.position.set(Math.cos(a)*1.05,0.35,Math.sin(a)*1.05);group.add(leg);
  }
  group.add(plate());
  let time=0,paused=false,speed=0,drawnTime;
  const pause=control(group,brass,0.34),rate=control(group,brass,0),reset=control(group,brass,-0.34);
  pause.face.userData.orreryId='pause';
  rate.face.userData.orreryId='speed';
  reset.face.userData.orreryId='reset';
  function drawControls(){
    pause.draw(paused?'RESUME':'PAUSE',paused);
    rate.draw('SPEED '+SPEEDS[speed]+'×',speed!==0);
  }
  drawControls();reset.draw('RESET',false);
  const lamp=new THREE.PointLight(0xffc27a,16,7,2);
  lamp.position.y=1.7;group.add(lamp);
  const cord=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.7,6),brass);
  cord.position.y=2.15;group.add(cord);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(0.26,0.18,16,1,true),new THREE.MeshStandardMaterial({
    color:0xf2bb66,emissive:0x9c4c16,emissiveIntensity:0.85,roughness:0.55,side:THREE.DoubleSide
  }));
  shade.position.y=1.72;group.add(shade);

  const model=new THREE.Group();
  model.position.y=0.84;model.scale.setScalar(0.78);group.add(model);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.2,0.028,48),new THREE.MeshStandardMaterial({color:0x161311,roughness:0.55,metalness:0.4}));
  base.position.y=-0.02;model.add(base);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(1.16,0.012,6,56),brass);
  rim.rotation.x=Math.PI/2;rim.position.y=-0.004;model.add(rim);

  const A=sphere(model,0.055,0xfff1d2,true);
  const B=sphere(model,0.032,0xff8a45,true);
  const b=sphere(model,0.022,0xb7c9d6,false);
  const d=sphere(model,0.034,0xe6d3ae,false);
  const c=sphere(model,0.026,0x9fd0bf,false);
  const rings=new THREE.Mesh(new THREE.RingGeometry(1.6,5.4,64),new THREE.MeshBasicMaterial({
    color:0xd7c4a1,side:THREE.DoubleSide,transparent:true,opacity:0.72,depthWrite:false
  }));
  rings.rotation.x=Math.PI/2-0.5;rings.scale.setScalar(0.034);d.add(rings);

  const moons=[[4.4,0.32,2.1,0.3,0xf4efe4,'Obera I','m0'],[6.8,0.24,5.4,0.9,0x9eb6c9,'Obera II','m1'],[9.6,0.4,11.5,1.15,0xd4895c,'Obera III','m2']].map(([orbit,size,period,incl,color,name,id])=>{
    const pivot=new THREE.Group();pivot.rotation.x=incl;c.add(pivot);
    const mesh=sphere(pivot,size*0.026,color,true);
    return {pivot,mesh,orbit,period,phase:incl*2,name,id};
  });

  const station=new THREE.Group();station.scale.setScalar(0.16);model.add(station);
  const rock=new THREE.IcosahedronGeometry(1,2);
  const pos=rock.getAttribute('position'),v=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i);
    v.multiplyScalar(1+0.08*Math.sin(v.x*8+v.y*3)*Math.cos(v.z*6));
    pos.setXYZ(i,v.x,v.y,v.z);
  }
  rock.computeVertexNormals();
  station.add(new THREE.Mesh(rock,rockShader));
  const bay=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,1.0,16,1,true),new THREE.MeshBasicMaterial({color:0xf0c48a,side:THREE.BackSide}));
  bay.rotation.z=Math.PI/2;bay.position.x=0.4;station.add(bay);
  const cap=new THREE.Mesh(new THREE.CircleGeometry(0.34,12),new THREE.MeshBasicMaterial({color:0xf0c48a}));
  cap.position.x=-0.02;cap.rotation.y=Math.PI/2;station.add(cap);

  const put=(mesh,p)=>mesh.position.copy(p);
  wire(model,0xf3e2b8,0.004,u=>flat(binaryPolar(u*BINARY.period)[0]));
  wire(model,0xe07a3d,0.004,u=>flat(binaryPolar(u*BINARY.period)[1]));
  PLANETS.forEach((planet,i)=>wire(model,[0x9eb6c9,0xd7c4a1,0x7fbea8][i],0.007,
    u=>flat(orbitPolar(planet,u*planet.period),planet.tilt)));
  wire(model,0xc6a15a,0.005,u=>{
    const p=flat(orbitPolar(STATION,u*STATION.period),STATION.tilt);
    p.y+=0.22;
    return p;
  });

  const beltInner=1.06,beltOuter=1.32;
  const dust=new THREE.Mesh(new THREE.RingGeometry(beltInner,beltOuter,80),new THREE.MeshBasicMaterial({
    color:0xc5d2dc,side:THREE.DoubleSide,transparent:true,opacity:0.38,depthWrite:false
  }));
  dust.rotation.x=-Math.PI/2;dust.position.y=0.6;model.add(dust);
  const gravelGeo=new THREE.IcosahedronGeometry(1,0);
  const gravelMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.86,metalness:0.04});
  const gravel=new THREE.InstancedMesh(gravelGeo,gravelMat,200);
  const bit=new THREE.Object3D(),tint=new THREE.Color();
  const bits=[];
  let seed=47;
  const rnd=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return ((seed>>>0)%10000)/10000};
  for(let i=0;i<200;i++){
    bits.push({r:beltInner+(beltOuter-beltInner)*Math.sqrt(0.12+0.88*rnd()),th:rnd()*Math.PI*2,y:0.6+(rnd()-0.5)*0.05,s:0.004+rnd()*0.008,spin:rnd()*6});
    tint.set(rnd()>0.7?'#e8eef2':rnd()>0.4?'#b7a898':'#7f8c96');
    gravel.setColorAt(i,tint);
  }
  if(gravel.instanceColor)gravel.instanceColor.needsUpdate=true;
  model.add(gravel);
  const beltBody=sphere(model,0.018,0xd5ddd8,false);
  const beltHit=new THREE.Mesh(new THREE.TorusGeometry((beltInner+beltOuter)/2,0.07,6,40),new THREE.MeshBasicMaterial({visible:false}));
  beltHit.rotation.x=Math.PI/2;beltHit.position.y=0.6;beltHit.userData.orreryId='belt';model.add(beltHit);

  function tag(text){
    const canvas=document.createElement('canvas');
    canvas.width=256;canvas.height=64;
    const ctx=canvas.getContext('2d');
    ctx.font='600 40px Georgia, serif';
    ctx.fillStyle='#ffe7c2';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(text,128,34);
    const map=new THREE.CanvasTexture(canvas);
    map.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false}));
    sprite.scale.set(0.34,0.085,1);
    model.add(sprite);
    return sprite;
  }
  const tags=[
    [A,tag('Mora'),0.1],
    [B,tag('Osi'),0.08],
    [b,tag(PLANETS[0].name),0.07],
    [d,tag(PLANETS[1].name),0.1],
    [c,tag(PLANETS[2].name),0.08],
    [station,tag('Mind Vault'),0.28],
    [beltBody,tag('Kuiper belt'),0.06]
  ];
  for(const moon of moons)tags.push([moon.mesh,tag(moon.name),0.05]);

  const picks=[pause.face,rate.face,reset.face];
  function mark(mesh,id,radius){
    const hit=new THREE.Mesh(new THREE.SphereGeometry(radius,8,6),new THREE.MeshBasicMaterial({visible:false}));
    hit.userData.orreryId=id;
    mesh.add(hit);
    picks.push(hit);
  }
  mark(A,'A',0.09);mark(B,'B',0.06);mark(b,'b',0.05);mark(d,'d',0.08);mark(c,'c',0.06);
  mark(station,'station',1.15);mark(beltBody,'belt',0.05);
  for(const moon of moons)mark(moon.mesh,moon.id,0.018);
  picks.push(beltHit);
  const foci={A,B,b,d,c,station,belt:beltBody,m0:moons[0].mesh,m1:moons[1].mesh,m2:moons[2].mesh};
  const reaches={A:0.32,B:0.24,b:0.18,d:0.42,c:0.2,station:0.62,belt:0.16,m0:0.1,m1:0.09,m2:0.11};
  const names={A:'Mora',B:'Osi',station:'Mind Vault',belt:'Kuiper belt',m0:'Obera I',m1:'Obera II',m2:'Obera III'};
  for(const planet of PLANETS)names[planet.id]=planet.name;
  const focusV=new THREE.Vector3(),local=new THREE.Vector3();

  const origin=new THREE.Vector3();
  const planets=[b,d,c];
  return {
    group,
    inReach(body){return Math.hypot(body.x-X,body.z-Z)<=3.25},
    controlLabel(id){
      if(id==='pause')return paused?'resume orbits':'pause orbits';
      if(id==='speed')return 'change orbit speed ('+SPEEDS[speed]+'×)';
      if(id==='reset')return 'reset orbits';
      return '';
    },
    press(id){
      if(id==='pause')paused=!paused;
      else if(id==='speed')speed=(speed+1)%SPEEDS.length;
      else if(id==='reset'){time=0;speed=0}
      else return false;
      drawControls();
      return true;
    },
    block(body){
      const dx=body.x-X,dz=body.z-Z;
      if(dx*dx+dz*dz>=REACH*REACH)return;
      const d=Math.hypot(dx,dz)||1;
      body.x=X+(dx/d)*REACH;body.z=Z+(dz/d)*REACH;
    },
    animate(dt=0){
      if(!paused)time+=dt*SPEEDS[speed];
      if(time===drawnTime)return;
      drawnTime=time;
      const t=time*DAY*SIM;
      const [primary,secondary]=binaryPolar(t);
      put(A,flat(primary));
      put(B,flat(secondary));
      PLANETS.forEach((planet,i)=>put(planets[i],flat(orbitPolar(planet,t),planet.tilt)));
      station.position.copy(flat(orbitPolar(STATION,t),STATION.tilt));
      station.position.y+=0.22;
      station.rotation.y=time*0.35*SIM;
      model.localToWorld(origin.set(0,0,0));
      b.up.set(0,1,0);b.lookAt(origin);
      for(const moon of moons){
        const th=(t/moon.period)*Math.PI*2+moon.phase;
        const R=moon.orbit*0.026;
        moon.mesh.position.set(Math.cos(th)*R,0,Math.sin(th)*R);
      }
      const spin=time*0.05*SIM;
      for(let i=0;i<bits.length;i++){
        const item=bits[i];
        const th=item.th+spin;
        bit.position.set(Math.cos(th)*item.r,item.y,Math.sin(th)*item.r);
        bit.rotation.set(item.spin,th,0);
        bit.scale.setScalar(item.s);
        bit.updateMatrix();
        gravel.setMatrixAt(i,bit.matrix);
      }
      gravel.instanceMatrix.needsUpdate=true;
      put(beltBody,flat(orbitPolar(BELT,t*0.35)));
      beltBody.position.y=0.68;
      for(const [obj,sprite,lift] of tags){
        obj.getWorldPosition(local);
        model.worldToLocal(local);
        local.y+=lift;
        sprite.position.copy(local);
      }
    },
    pick(raycaster){
      const hit=raycaster.intersectObjects(picks,false)[0];
      return hit?.object.userData.orreryId||null;
    },
    focus(id){
      (foci[id]||c).getWorldPosition(focusV);
      return focusV;
    },
    reach(id){return reaches[id]||0.2},
    name(id){return names[id]||'the system'},
    fillWindow(uniforms){
      const sky=windowSky(time);
      uniforms.uMag.value=sky.mag;
      uniforms.uRoll.value=sky.roll;
      if(uniforms.uTime)uniforms.uTime.value=(time||0)*SIM;
      uniforms.uStation.value.set(sky.station[0],sky.station[1],sky.station[2]);
      uniforms.uForward.value.set(sky.forward[0],sky.forward[1],sky.forward[2]);
      uniforms.uRight.value.set(sky.right[0],sky.right[1],sky.right[2]);
      uniforms.uUp.value.set(sky.up[0],sky.up[1],sky.up[2]);
      for(let i=0;i<8;i++){
        const b=sky.bodies[i];
        uniforms.uBody.value[i].set(b.x,b.y,b.r,b.kind);
        uniforms.uTint.value[i].set(b.tint[0],b.tint[1],b.tint[2]);
      }
    }
  };
}
