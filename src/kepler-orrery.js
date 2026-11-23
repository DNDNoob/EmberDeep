import * as THREE from 'three';

// Left rock wall sits near x = -20.6; the observation window is the far wall at x ≈ +21, z = 4.
// Table radius is 1.34, so the center is just clear of the stone that knobs into the room.
const X=-18.62,Z=4,REACH=1.58;
const MA=0.957,MB=0.342,M=MA+MB;
const DAY=1.15;

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

function solve(M0,e){let E=M0;for(let i=0;i<6;i++)E=M0+e*Math.sin(E);return E;}
function polar(a,e,period,phase,t){
  const E=solve((2*Math.PI*t)/period+phase,e);
  const nu=Math.atan2(Math.sqrt(1-e*e)*Math.sin(E),Math.cos(E)-e);
  return [a*(1-e*Math.cos(E)),nu];
}
function flat(r,theta,tilt){
  // The disk stays on the wood. Bodies sit high enough that a tilted moon
  // or the asteroid's belly never crosses the tabletop.
  return new THREE.Vector3(r*Math.cos(theta),0.62+Math.sin(tilt)*r*0.22,r*Math.sin(theta));
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
  mesh.position.set(1.22,0.9,0);
  mesh.rotation.y=Math.PI/2;
  return mesh;
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
  wire(model,0xf3e2b8,0.004,u=>{
    const [r,nu]=polar(0.08145,0.0288,7.4483648,0,u*7.4483648);
    return flat(r*MB/M,nu,0);
  });
  wire(model,0xe07a3d,0.004,u=>{
    const [r,nu]=polar(0.08145,0.0288,7.4483648,0,u*7.4483648);
    return flat(r*MA/M,nu+Math.PI,0);
  });
  wire(model,0x9eb6c9,0.007,u=>{const [r,nu]=polar(0.2877,0.021,49.4643,0.4,u*49.4643);return flat(r,nu,0.04);});
  wire(model,0xd7c4a1,0.007,u=>{const [r,nu]=polar(0.6992,0.024,187.366,1.1,u*187.366);return flat(r,nu,0.12);});
  wire(model,0x7fbea8,0.007,u=>{const [r,nu]=polar(0.9638,0.044,303.227,2.2,u*303.227);return flat(r,nu,0.05);});
  wire(model,0xc6a15a,0.005,u=>{const [r,nu]=polar(0.493,0.018,110.93,0.9,u*110.93);const p=flat(r,nu,0.18);p.y+=0.22;return p;});

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
    [b,tag('Yuron'),0.07],
    [d,tag('Sollel'),0.1],
    [c,tag('Obera'),0.08],
    [station,tag('Mind Vault'),0.28],
    [beltBody,tag('Kuiper belt'),0.06]
  ];
  for(const moon of moons)tags.push([moon.mesh,tag(moon.name),0.05]);

  const picks=[];
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
  const names={A:'Mora',B:'Osi',b:'Yuron',d:'Sollel',c:'Obera',station:'Mind Vault',belt:'Kuiper belt',m0:'Obera I',m1:'Obera II',m2:'Obera III'};
  const focusV=new THREE.Vector3(),local=new THREE.Vector3();

  const origin=new THREE.Vector3();
  return {
    group,
    block(body){
      const dx=body.x-X,dz=body.z-Z;
      if(dx*dx+dz*dz>=REACH*REACH)return;
      const d=Math.hypot(dx,dz)||1;
      body.x=X+(dx/d)*REACH;body.z=Z+(dz/d)*REACH;
    },
    animate(time){
      const t=time*DAY;
      const [rb,nub]=polar(0.08145,0.0288,7.4483648,0.2,t);
      put(B,flat(rb*MA/M,nub,0));
      put(A,flat(rb*MB/M,nub+Math.PI,0));
      const planets=[[b,0.2877,0.021,49.4643,0.4,0.04],[d,0.6992,0.024,187.366,1.1,0.12],[c,0.9638,0.044,303.227,2.2,0.05]];
      for(const [mesh,a,e,period,phase,tilt] of planets){
        const [r,nu]=polar(a,e,period,phase,t);
        put(mesh,flat(r,nu,tilt));
      }
      const [rs,nus]=polar(0.493,0.018,110.93,0.9,t);
      station.position.copy(flat(rs,nus,0.18));
      station.position.y+=0.22;
      station.rotation.y=time*0.35;
      model.localToWorld(origin.set(0,0,0));
      b.up.set(0,1,0);b.lookAt(origin);
      for(const moon of moons){
        const th=(t/moon.period)*Math.PI*2+moon.phase;
        const R=moon.orbit*0.026;
        moon.mesh.position.set(Math.cos(th)*R,0,Math.sin(th)*R);
      }
      const spin=time*0.05;
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
      const [rbelt,nubelt]=polar(1.18,0.01,420,0.4,t*0.35);
      put(beltBody,flat(rbelt,nubelt,0));
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
    name(id){return names[id]||'the system'}
  };
}
