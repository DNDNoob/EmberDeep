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
  return new THREE.Vector3(r*Math.cos(theta),0.3+Math.sin(tilt)*r*0.22,r*Math.sin(theta));
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

  const moons=[[4.4,0.32,2.1,0.3],[6.8,0.24,5.4,0.9],[9.6,0.4,11.5,1.15]].map(([orbit,size,period,incl])=>{
    const pivot=new THREE.Group();pivot.rotation.x=incl;c.add(pivot);
    const mesh=sphere(pivot,size*0.026,0xf4efe4,true);
    return {pivot,mesh,orbit,period,phase:incl*2};
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
  wire(model,0xc6a15a,0.005,u=>{const [r,nu]=polar(0.493,0.018,110.93,0.9,u*110.93);return flat(r,nu,0.18);});

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
      station.rotation.y=time*0.35;
      model.localToWorld(origin.set(0,0,0));
      b.up.set(0,1,0);b.lookAt(origin);
      for(const moon of moons){
        const th=(t/moon.period)*Math.PI*2+moon.phase;
        const R=moon.orbit*0.026;
        moon.mesh.position.set(Math.cos(th)*R,0,Math.sin(th)*R);
      }
    }
  };
}
