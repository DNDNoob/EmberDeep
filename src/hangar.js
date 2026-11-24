// The ship hangar behind the lobby's back wall: big glass windows, a locked blast door and one parked spaceship.
// Everything is generated in code at load time (canvas textures drawn from math, merged primitives, a lofted hull).
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const WALL_Z=15.03;                 // centre of the lobby stone wall (0.18 thick)
export const WINDOWS=[{x0:-6.4,x1:-0.7,y0:1.15,y1:4.25},{x0:0.7,x1:6.4,y0:1.15,y1:4.25}];
export const DOOR={x:-15.35,w:2.6,h:3.3};
const HALF=21,ZMIN=15.12,ZMAX=42,TOP=14;   // hangar volume (world coordinates)
const SHIP={x:10.4,y:2.9,z:33,yaw:0.8,scale:0.95};

// Rectangles [x0,x1,y0,y1] that make up the back wall around the window and door openings.
export function wallRects(bottom,top,half){
  const holes=[...WINDOWS,{x0:DOOR.x-DOOR.w/2,x1:DOOR.x+DOOR.w/2,y0:bottom,y1:DOOR.h}].sort((a,b)=>a.x0-b.x0);
  const out=[];let x=-half;
  for(const h of holes){
    if(h.x0>x)out.push([x,h.x0,bottom,top]);
    if(h.y0>bottom)out.push([h.x0,h.x1,bottom,h.y0]);
    out.push([h.x0,h.x1,h.y1,top]);
    x=h.x1;
  }
  out.push([x,half,bottom,top]);
  return out;
}

const rngOf=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
function canvasTex(w,h,draw,{repeat=false,aniso=4}={}){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=aniso;
  if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// ---------- textures ----------
function wallTexture(){
  return canvasTex(512,512,(g,w,h)=>{
    const r=rngOf(5);
    g.fillStyle='#69727d';g.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=32){ // corrugation ribs
      const s=g.createLinearGradient(x,0,x+32,0);
      s.addColorStop(0,'rgba(255,255,255,.16)');s.addColorStop(.5,'rgba(0,0,0,.0)');s.addColorStop(1,'rgba(0,0,0,.26)');
      g.fillStyle=s;g.fillRect(x,0,32,h);
    }
    for(let i=0;i<5000;i++){g.fillStyle=`rgba(${r()<.5?0:255},${r()<.5?0:255},${r()<.5?0:255},${r()*.05})`;g.fillRect(r()*w,r()*h,1+r()*3,1+r()*5)}
    g.fillStyle='rgba(20,22,28,.55)';g.fillRect(0,0,w,5);g.fillRect(0,h/2-2,w,4);
    g.fillStyle='rgba(180,190,200,.25)';g.fillRect(0,5,w,2);g.fillRect(0,h/2+2,w,2);
    for(let x=8;x<w;x+=64)for(const y of [14,h/2-12,h/2+14,h-12]){g.fillStyle='rgba(30,32,38,.7)';g.beginPath();g.arc(x,y,2.4,0,7);g.fill()}
    for(let i=0;i<22;i++){ // rust and grime streaks
      const x=r()*w,len=60+r()*220,gr=g.createLinearGradient(0,0,0,len);
      gr.addColorStop(0,'rgba(90,60,36,.0)');gr.addColorStop(.3,'rgba(90,60,36,.17)');gr.addColorStop(1,'rgba(40,30,25,0)');
      g.fillStyle=gr;g.save();g.translate(x,r()*h);g.fillRect(0,0,3+r()*8,len);g.restore();
    }
  },{repeat:true,aniso:8});
}
function plateTexture(){
  return canvasTex(256,256,(g,w,h)=>{
    const r=rngOf(9);
    g.fillStyle='#c9ced4';g.fillRect(0,0,w,h);
    for(let i=0;i<2200;i++){g.fillStyle=`rgba(0,0,0,${r()*.05})`;g.fillRect(r()*w,r()*h,2,2)}
    g.strokeStyle='rgba(40,46,56,.8)';g.lineWidth=2;g.strokeRect(1,1,w-2,h-2);
    g.lineWidth=1;g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.stroke();
    for(const [x,y] of [[10,10],[w-10,10],[10,h-10],[w-10,h-10],[w/2,10],[w/2,h-10]]){g.fillStyle='rgba(50,54,62,.8)';g.beginPath();g.arc(x,y,2,0,7);g.fill()}
  },{repeat:true,aniso:8});
}
function floorTexture(){
  const w=1536,h=928,px=w/(2*HALF),sx=x=>(x+HALF)*px,sz=z=>(z-ZMIN)*px;
  return canvasTex(w,h,(g)=>{
    const r=rngOf(21);
    g.fillStyle='#4f545b';g.fillRect(0,0,w,h);
    for(let i=0;i<26000;i++){const v=r()*60+60|0;g.fillStyle=`rgba(${v},${v+3},${v+8},${r()*.12})`;g.fillRect(r()*w,r()*h,1+r()*3,1+r()*3)}
    for(let i=0;i<40;i++){ // oil stains
      const x=r()*w,y=r()*h,rad=10+r()*38,gr=g.createRadialGradient(x,y,0,x,y,rad);
      gr.addColorStop(0,'rgba(14,16,20,.35)');gr.addColorStop(1,'rgba(14,16,20,0)');g.fillStyle=gr;g.fillRect(x-rad,y-rad,rad*2,rad*2);
    }
    g.strokeStyle='rgba(15,17,22,.6)';g.lineWidth=2; // slab joints
    for(let x=-HALF;x<=HALF;x+=4){g.beginPath();g.moveTo(sx(x),0);g.lineTo(sx(x),h);g.stroke()}
    for(let z=ZMIN;z<=ZMAX;z+=4){g.beginPath();g.moveTo(0,sz(z));g.lineTo(w,sz(z));g.stroke()}
    const hazard=(x0,y0,x1,y1)=>{
      g.save();g.beginPath();g.rect(x0,y0,x1-x0,y1-y0);g.clip();g.fillStyle='#d8aa2a';g.fillRect(x0,y0,x1-x0,y1-y0);
      g.fillStyle='#1b1c20';for(let k=-(y1-y0);k<x1-x0+(y1-y0);k+=34){g.beginPath();g.moveTo(x0+k,y1);g.lineTo(x0+k+17,y1);g.lineTo(x0+k+17+(y1-y0),y0);g.lineTo(x0+k+(y1-y0),y0);g.fill()}
      g.restore();
    };
    hazard(0,0,w,px*0.55);hazard(0,h-px*0.55,w,h);
    hazard(0,0,px*0.55,h);hazard(w-px*0.55,0,w,h);
    const cx=sx(SHIP.x),cy=sz(SHIP.z); // landing pad
    g.strokeStyle='#e0b53a';g.lineWidth=px*0.34;g.beginPath();g.arc(cx,cy,px*9.4,0,7);g.stroke();
    g.strokeStyle='#e9ecef';g.lineWidth=px*0.13;g.beginPath();g.arc(cx,cy,px*8.4,0,7);g.stroke();
    g.setLineDash([px*0.9,px*0.6]);g.beginPath();g.arc(cx,cy,px*6.6,0,7);g.stroke();g.setLineDash([]);
    g.lineWidth=px*0.12;g.beginPath();g.moveTo(cx-px*9,cy);g.lineTo(cx+px*9,cy);g.moveTo(cx,cy-px*9);g.lineTo(cx,cy+px*9);g.stroke();
    g.fillStyle='rgba(235,238,240,.82)';g.font=`bold ${px*2.6}px sans-serif`;g.textAlign='center';g.textBaseline='middle';
    g.font=`bold ${px*1.7}px sans-serif`;g.save();g.translate(cx,sz(17.1));g.rotate(Math.PI);g.fillText('BAY 3',0,0);g.restore();
    g.strokeStyle='#4aa37f';g.lineWidth=px*0.2; // walkway lane
    g.strokeRect(sx(-19.4),sz(16.6),sx(-7)-sx(-19.4),sz(40.4)-sz(16.6));
    g.fillStyle='#4aa37f';g.font=`bold ${px*0.9}px sans-serif`;g.fillText('FOOT TRAFFIC',sx(-13.2),sz(18));
  },{aniso:8});
}
function hullTexture(){
  return canvasTex(1024,512,(g,w,h)=>{
    const r=rngOf(33);
    g.fillStyle='#dfe2e5';g.fillRect(0,0,w,h);
    // u: 0 nose..1 tail, v: 0 = starboard side, .25 top, .5 port side, .75 belly
    for(let i=0;i<70;i++){ // per-panel tone variation
      const x=r()*w,y=r()*h,pw=40+r()*140,ph=30+r()*90;g.fillStyle=`rgba(${r()<.5?0:255},${r()<.5?0:255},${r()<.5?0:255},${.03+r()*.05})`;g.fillRect(x,y,pw,ph);
    }
    g.fillStyle='#8a929a';g.fillRect(0,h*.58,w,h*.34);                       // dark belly
    g.fillStyle='#2f9fa6';for(const c of [.1,.4])g.fillRect(w*.12,h*c,w*.78,h*.028); // livery stripes
    g.fillStyle='#e07a2e';for(const c of [.1,.4]){g.beginPath();g.moveTo(w*.12,h*c-2);g.lineTo(w*.3,h*c-2);g.lineTo(w*.26,h*c+h*.03+2);g.lineTo(w*.12,h*c+h*.03+2);g.fill()}
    g.fillStyle='#e07a2e';g.fillRect(w*.04,0,w*.045,h*.5);g.fillRect(w*.04,h*.5,w*.045,h*.5); // nose band
    g.strokeStyle='rgba(38,44,54,.75)';g.lineWidth=1.5;
    for(let x=w*.07;x<w;x+=40+r()*50){g.beginPath();g.moveTo(x,0);g.lineTo(x+(r()-.5)*6,h);g.stroke()}
    for(const y of [.06,.14,.2,.3,.36,.45,.52,.6,.7,.8,.9]){g.beginPath();g.moveTo(0,h*y);g.lineTo(w,h*y);g.stroke()}
    for(let i=0;i<90;i++){g.fillStyle='rgba(40,46,56,.5)';g.beginPath();g.arc(r()*w,r()*h,1.5,0,7);g.fill()} // rivets
    for(let i=0;i<14;i++){g.fillStyle='rgba(30,34,40,.7)';g.fillRect(w*(.3+r()*.5),h*(r()<.5?.19:.69)+r()*40,26,6)} // vents
    g.fillStyle='rgba(30,34,40,.9)';g.font='bold 34px sans-serif';g.textAlign='left';
    g.fillText('EK-4471',w*.42,h*.082);g.save();g.translate(w*.42+110,0);g.scale(-1,1);g.fillText('EK-4471',0,h*.382);g.restore();
    for(let i=0;i<30;i++){const x=r()*w,gr=g.createLinearGradient(0,0,0,150);gr.addColorStop(0,'rgba(60,50,40,.12)');gr.addColorStop(1,'rgba(60,50,40,0)');g.fillStyle=gr;g.save();g.translate(x,r()*h);g.fillRect(0,0,4,150);g.restore()}
  },{repeat:false,aniso:8});
}
function doorTexture(ty=0.42){
  return canvasTex(512,650,(g,w,h)=>{
    g.fillStyle='#6a737e';g.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=64){g.fillStyle='rgba(0,0,0,.35)';g.fillRect(0,y,w,4);g.fillStyle='rgba(255,255,255,.1)';g.fillRect(0,y+4,w,2)}
    g.fillStyle='#d8aa2a';g.fillRect(0,0,w,56);g.fillRect(0,h-56,w,56);
    g.fillStyle='#1b1c20';for(let x=-60;x<w;x+=56){for(const y of [0,h-56]){g.beginPath();g.moveTo(x,y+56);g.lineTo(x+28,y+56);g.lineTo(x+84,y);g.lineTo(x+56,y);g.fill()}}
    g.fillStyle='rgba(230,232,236,.9)';g.font='bold 120px sans-serif';g.textAlign='center';g.fillText('HANGAR',w/2,h*ty);
    g.font='bold 52px sans-serif';g.fillText('AUTHORIZED ONLY',w/2,h*ty+70);
    g.fillStyle='#cc2d2d';g.fillRect(w*.3,h*(ty-0.15),w*.4,10);
    g.fillStyle='rgba(20,22,28,.7)';g.fillRect(w/2-3,60,6,h-120);
  },{aniso:8});
}
function glowTexture(){
  return canvasTex(64,64,(g,w,h)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,w,h)},{aniso:1});
}

// ---------- geometry bags: everything with one material merges into one draw ----------
function boxGeo(w,h,d,tile){
  const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv,dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let i=0;i<24;i++){const [a,b]=dims[i>>2];uv.setXY(i,uv.getX(i)*a/tile,uv.getY(i)*b/tile)}
  return g;
}
function makeBag(){
  const lists=new Map(),q=new THREE.Quaternion(),e=new THREE.Euler(),m=new THREE.Matrix4(),one=new THREE.Vector3(1,1,1);
  const put=(name,geo,x=0,y=0,z=0,rx=0,ry=0,rz=0,s=one)=>{
    geo=geo.index?geo.toNonIndexed():geo;
    geo.applyMatrix4(m.compose(new THREE.Vector3(x,y,z),q.setFromEuler(e.set(rx,ry,rz)),s));
    if(!lists.has(name))lists.set(name,[]);
    lists.get(name).push(geo);
  };
  return {
    put,
    box:(name,x,y,z,w,h,d,tile=4,ry=0,rz=0,rx=0)=>put(name,boxGeo(w,h,d,tile),x,y,z,rx,ry,rz),
    cyl:(name,x,y,z,r0,r1,len,rx=0,ry=0,rz=0,seg=12)=>put(name,new THREE.CylinderGeometry(r0,r1,len,seg),x,y,z,rx,ry,rz),
    // cylinder between two points
    rod:(name,a,b,r,seg=8)=>{
      const v=new THREE.Vector3().subVectors(b,a),len=v.length(),qq=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());
      const eu=new THREE.Euler().setFromQuaternion(qq);
      put(name,new THREE.CylinderGeometry(r,r,len,seg),(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,eu.x,eu.y,eu.z);
    },
    flush:(parent,mats)=>{
      for(const [name,list] of lists){
        const mesh=new THREE.Mesh(mergeGeometries(list,false),mats[name]);
        mesh.matrixAutoUpdate=false;parent.add(mesh);list.forEach(g=>g.dispose());
      }
    }
  };
}

// Glass with a fresnel rim and a couple of faint reflection streaks.
function glassMaterial({color,opacity,rim=0.5,streak=0.1,tint=new THREE.Color(0x7fd0e0),side=THREE.FrontSide}){
  const m=new THREE.MeshStandardMaterial({color,roughness:0.08,metalness:0,transparent:true,opacity,depthWrite:false,side});
  m.onBeforeCompile=sh=>{
    sh.uniforms.uTint={value:tint};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vGl;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGl=position.xy;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vGl;\nuniform vec3 uTint;')
      .replace('#include <opaque_fragment>',`
        float fr=pow(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),3.0);
        float band=smoothstep(0.0,0.06,fract(vGl.x*0.22+vGl.y*0.34))*(1.0-smoothstep(0.06,0.16,fract(vGl.x*0.22+vGl.y*0.34)));
        float band2=smoothstep(0.0,0.03,fract(vGl.x*0.22+vGl.y*0.34+0.37))*(1.0-smoothstep(0.03,0.06,fract(vGl.x*0.22+vGl.y*0.34+0.37)));
        float k=${rim.toFixed(2)}*fr+${streak.toFixed(2)}*(band+0.6*band2);
        outgoingLight+=uTint*k;
        diffuseColor.a=clamp(diffuseColor.a+k*0.9,0.0,1.0);
        #include <opaque_fragment>`);
  };
  return m;
}

// ---------- the ship ----------
function hullGeometry(){
  const N=64,M=36,pos=[],uv=[],idx=[];
  const prof=s=>{
    const q=Math.min(s/0.34,1);
    let g=Math.pow(Math.sin(q*Math.PI/2),0.78);
    if(s>0.7){const t=(s-0.7)/0.3;g*=1-0.38*t*t*(3-2*t)}
    return g;
  };
  for(let i=0;i<=N;i++){
    const s=i/N,g=prof(s),x=7.8-15*s;
    const W=1.62*g*(1+0.1*Math.sin(Math.min(s,.8)*Math.PI/.8)),H=0.98*g,Hb=0.74*g;
    for(let j=0;j<=M;j++){
      const a=j/M*Math.PI*2,c=Math.cos(a),sn=Math.sin(a),n=2.7;
      const px=Math.sign(c)*Math.pow(Math.abs(c),2/n),py=Math.sign(sn)*Math.pow(Math.abs(sn),2/n);
      let y=py*(py>0?H:Hb);
      if(py>0&&Math.abs(px)<0.18)y+=0.07*g; // dorsal ridge
      pos.push(x,y,px*W);uv.push(s,j/M);
    }
  }
  for(let i=0;i<N;i++)for(let j=0;j<M;j++){
    const a=i*(M+1)+j,b=a+M+1;idx.push(a,a+1,b,a+1,b+1,b);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  // the loft winds outward-facing on the other side; flip so normals point out
  const n=g.attributes.normal;for(let i=0;i<n.count;i++)n.setXYZ(i,-n.getX(i),-n.getY(i),-n.getZ(i));
  g.setIndex(idx.map((v,k,a)=>k%3===1?a[k+1]:k%3===2?a[k-1]:v));
  return g;
}
function wingGeometry(side,thick=0.15){
  const p=[[2.3,1.0],[-3.3,5.7],[-4.9,5.6],[-5.9,1.3]];
  const sh=new THREE.Shape();p.forEach(([x,z],i)=>{const y=-side*z;i?sh.lineTo(x,y):sh.moveTo(x,y)});
  const g=new THREE.ExtrudeGeometry(sh,{depth:thick,bevelEnabled:true,bevelThickness:0.04,bevelSize:0.05,bevelSegments:1,curveSegments:1});
  g.rotateX(-Math.PI/2);
  return g;
}
function finGeometry(){
  const sh=new THREE.Shape();
  [[-3.2,0.2],[-5.9,3.3],[-7.0,3.3],[-6.6,0.1]].forEach(([x,y],i)=>i?sh.lineTo(x,y):sh.moveTo(x,y));
  const g=new THREE.ExtrudeGeometry(sh,{depth:0.1,bevelEnabled:true,bevelThickness:0.03,bevelSize:0.03,bevelSegments:1});
  g.translate(0,0,-0.05);return g;
}
function nozzleGeometry(){
  const pts=[[0.5,0],[0.66,0.35],[0.7,1.6],[0.58,2.0],[0.7,2.35],[0.9,2.85],[0.84,2.85],[0.62,2.2],[0.0,2.1]].map(([r,y])=>new THREE.Vector2(r,y));
  const g=new THREE.LatheGeometry(pts,18);g.rotateZ(Math.PI/2);return g;
}

function buildShip(glowMap){
  const ship=new THREE.Group(),bag=makeBag();
  const mats={
    hull:new THREE.MeshStandardMaterial({map:Object.assign(hullTexture(),{flipY:false}),roughness:0.42,metalness:0.3}),
    plate:new THREE.MeshStandardMaterial({map:null,color:0xc4c9cf,roughness:0.5,metalness:0.3}),
    dark:new THREE.MeshStandardMaterial({color:0x6a737e,roughness:0.5,metalness:0.2,emissive:0x20262e,side:THREE.DoubleSide}),
    steel:new THREE.MeshStandardMaterial({color:0xaab3bd,roughness:0.35,metalness:0.4,emissive:0x1a1e24}),
    accent:new THREE.MeshStandardMaterial({color:0xe07a2e,roughness:0.5,metalness:0.2}),
    teal:new THREE.MeshStandardMaterial({color:0x2f9fa6,roughness:0.45,metalness:0.2}),
  };
  const pl=plateTexture();pl.repeat.set(0.5,0.5);mats.plate.map=pl;
  const hull=new THREE.Mesh(hullGeometry(),mats.hull);ship.add(hull);

  // canopy: tinted glass bubble with dark ribs
  const glass=glassMaterial({color:0x13262e,opacity:0.62,rim:0.55,streak:0.4,tint:new THREE.Color(0x8fe3f0)});
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(1,28,16),glass);
  canopy.scale.set(2.2,0.46,0.86);canopy.position.set(4.3,0.7,0);canopy.renderOrder=3;ship.add(canopy);
  for(const dx of [-1.5,-0.7,0.1,0.9,1.6]){
    const k=Math.sqrt(1-(dx/2.2)**2);
    bag.put('dark',new THREE.TorusGeometry(1,0.028,5,18,Math.PI),4.3+dx,0.7,0,0,Math.PI/2,0,new THREE.Vector3(0.86*k+0.01,0.46*k+0.01,1));
  }
  bag.box('dark',4.3,0.7+0.46,0,4.2,0.04,0.05,4);

  // wings, fins, engines
  for(const side of [1,-1]){
    const wg=wingGeometry(side);
    bag.put('plate',wg,0,-0.27,0);
    bag.cyl('dark',-3.9,-0.12,side*5.7,0.13,0.09,2.2,0,0,Math.PI/2,10);                 // wingtip pod
    bag.box('accent',-1.0,-0.17,side*3.4,0.9,0.02,0.5,4);               // wing stripe
    bag.put('plate',finGeometry(),0,0.3,side*1.25,side*0.34,0,0);
    bag.put('dark',nozzleGeometry(),-4.9,-0.05,side*1.1);
    bag.cyl('steel',-4.4,-0.05,side*1.1,0.74,0.74,0.25,0,0,Math.PI/2,18);
    bag.box('dark',2.6,-0.25,side*1.5,0.9,0.22,0.1,4,0.0);             // side intake
    bag.box('teal',-2.2,0.88,side*0.6,2.2,0.04,0.34,4);                // dorsal accent
  }
  bag.put('dark',nozzleGeometry(),-5.7,0.55,0,0,0,0,new THREE.Vector3(1,0.55,0.55)); // small central nozzle
  bag.cyl('dark',-7.18,0,0,0.98,0.98,0.1,0,0,Math.PI/2,20);
  bag.cyl('steel',8.7,-0.05,0,0.03,0.07,1.8,0,0,Math.PI/2,6);          // nose probe
  bag.cyl('steel',7.7,0.0,0,0.08,0.08,0.2,0,0,Math.PI/2,6);
  bag.box('dark',0.2,1.0,0,0.5,0.14,0.8,4);                            // sensor housing
  bag.cyl('steel',-1.6,1.12,0.3,0.02,0.02,1.0,0.0,0,0.3,5);            // antenna
  bag.cyl('steel',-0.4,-0.78,0,0.28,0.28,0.12,0,0,0,14);               // belly hatch
  bag.box('dark',1.0,-0.74,0,3.6,0.05,1.2,4);                          // keel panel

  // landing gear down to the floor (ship origin is 2.5 m above it)
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  bag.rod('steel',V(4.9,-0.55,0),V(4.9,-2.35,0),0.07);
  bag.cyl('dark',4.9,-1.0,0,0.12,0.12,0.8,0,0,0,10);
  bag.cyl('dark',4.9,-2.44,0,0.34,0.38,0.12,0,0,0,14);
  for(const side of [1,-1]){
    bag.rod('steel',V(-2.6,-0.5,side*1.0),V(-2.6,-2.35,side*2.4),0.09);
    bag.rod('dark',V(-2.6,-0.9,side*1.2),V(-2.6,-1.7,side*1.95),0.13);
    bag.rod('steel',V(-1.3,-0.5,side*1.0),V(-2.6,-1.9,side*2.2),0.04);
    bag.cyl('dark',-2.6,-2.44,side*2.4,0.42,0.46,0.12,0,0,0,14);
  }
  bag.flush(ship,mats);

  // engine glow: faint discs plus soft additive sprites
  const glowMat=new THREE.MeshBasicMaterial({color:0x6fbaff,transparent:true,opacity:0.55,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
  const sprites=[];
  for(const [z,y,r,x] of [[1.1,-0.05,0.62,-7.0],[-1.1,-0.05,0.62,-7.0],[0,0.55,0.34,-7.35]]){
    const d=new THREE.Mesh(new THREE.CircleGeometry(r,16),glowMat);d.rotation.y=-Math.PI/2;d.position.set(x+(z===0?0:0.05)-(x===-7.0?0.0:0),y,z);ship.add(d);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0x6aa8ff,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
    s.scale.setScalar(r*4.2);s.position.set(d.position.x-0.35,y,z);ship.add(s);sprites.push(s);
  }

  // running lights
  const lights=[];
  const lamp=(x,y,z,color,kind)=>{
    const m=new THREE.MeshBasicMaterial({color,fog:false}),mesh=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),m);
    mesh.position.set(x,y,z);ship.add(mesh);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
    sp.scale.setScalar(0.9);sp.position.copy(mesh.position);ship.add(sp);
    lights.push({m,sp,color:new THREE.Color(color),kind});
  };
  lamp(-4.2,-0.1,5.85,0x35ff7a,'nav');lamp(-4.2,-0.1,-5.85,0xff3030,'nav');
  lamp(-7.2,1.0,0,0xffffff,'tail');
  lamp(0.2,1.12,0,0xff4040,'beacon');lamp(0.5,-0.82,0,0xff4040,'beacon2');
  lamp(-4.2,0.16,5.85,0xffffff,'strobe');lamp(-4.2,0.16,-5.85,0xffffff,'strobe');
  return {group:ship,mats,glow:glowMat,sprites,lights,
    update(t){
      glowMat.opacity=0.5+0.07*Math.sin(t*3.1)+0.04*Math.sin(t*7.7);
      sprites.forEach((s,i)=>{s.material.opacity=0.42+0.06*Math.sin(t*2.3+i)});
      for(const l of lights){
        let k=1;
        if(l.kind==='beacon')k=Math.sin(t*3.6)>0.55?1:0.08;
        else if(l.kind==='beacon2')k=Math.sin(t*3.6+Math.PI)>0.55?1:0.08;
        else if(l.kind==='strobe'){const p=t%1.7;k=(p<0.07||(p>0.2&&p<0.27))?1:0}
        else if(l.kind==='nav')k=0.85;
        else k=0.8;
        l.m.color.copy(l.color).multiplyScalar(0.25+0.75*k);
        if(l.kind==='strobe')l.m.visible=k>0;
        l.sp.material.opacity=k*0.8;
      }
    }};
}

// ---------- the hangar ----------
export function buildHangar(parent){
  const root=new THREE.Group();parent.add(root);
  const glowMap=glowTexture();
  const wallTex=wallTexture(),floorTex=floorTexture();
  const mats={
    wall:new THREE.MeshStandardMaterial({map:wallTex,roughness:0.62,metalness:0.2}),
    floor:new THREE.MeshStandardMaterial({map:floorTex,roughness:0.5,metalness:0.1}),
    truss:new THREE.MeshStandardMaterial({color:0x3a414b,roughness:0.55,metalness:0.45}),
    ceil:new THREE.MeshStandardMaterial({color:0x22262d,roughness:0.8}),
    yellow:new THREE.MeshStandardMaterial({color:0xd0a02a,roughness:0.55,metalness:0.2}),
    crate:new THREE.MeshStandardMaterial({color:0x6a5a44,roughness:0.8}),
    pipe:new THREE.MeshStandardMaterial({color:0x8c929a,roughness:0.4,metalness:0.6}),
    red:new THREE.MeshStandardMaterial({color:0xa23a32,roughness:0.5,metalness:0.3}),
    strip:new THREE.MeshBasicMaterial({color:0xe9f3ff,fog:true}),
    stripW:new THREE.MeshBasicMaterial({color:0xffe2b0,fog:true}),
    rubber:new THREE.MeshStandardMaterial({color:0x15161a,roughness:0.9}),
  };
  const bag=makeBag(),B=bag.box;
  const D=ZMAX-ZMIN,cz=(ZMIN+ZMAX)/2;
  // floor, ceiling, walls
  bag.put('floor',new THREE.PlaneGeometry(HALF*2,D),0,0,cz,-Math.PI/2,0,0);
  B('ceil',0,TOP+0.1,cz,HALF*2,0.2,D,4);
  B('wall',0,TOP/2,ZMAX+0.1,HALF*2,TOP,0.2,4);
  for(const s of [-1,1])B('wall',s*(HALF+0.1),TOP/2,cz,0.2,TOP,D,4);
  for(const [x0,x1,y0,y1] of wallRects(0,TOP,HALF+0.2))B('wall',(x0+x1)/2,(y0+y1)/2,ZMIN+0.12,x1-x0,y1-y0,0.24,4);
  // pilasters and rails
  for(let z=ZMIN+4;z<ZMAX;z+=5)for(const s of [-1,1]){B('truss',s*(HALF-0.25),TOP/2,z,0.5,TOP,0.5,4);B('truss',s*(HALF-0.3),3.6,z,0.7,0.22,D*0+5,4)}
  for(let x=-HALF+3;x<HALF;x+=6)B('truss',x,TOP/2,ZMAX-0.25,0.5,TOP,0.5,4);
  for(const y of [4.2,9.4])B('truss',0,y,ZMAX-0.1,HALF*2,0.3,0.3,4);
  // yellow safety line at the base of the walls
  B('yellow',0,0.18,ZMAX-0.02,HALF*2,0.16,0.04,4);
  for(const s of [-1,1])B('yellow',s*(HALF-0.01),0.18,cz,0.04,0.16,D,4);
  // roof trusses
  for(let z=ZMIN+2.5;z<ZMAX;z+=5){
    B('truss',0,TOP-0.35,z,HALF*2,0.35,0.4,4);B('truss',0,TOP-2.0,z,HALF*2,0.3,0.34,4);
    const n=28,seg=HALF*2/n;
    for(let i=0;i<n;i++){
      const x0=-HALF+i*seg,up=i%2===0,len=Math.hypot(seg,1.65);
      bag.box('truss',x0+seg/2,TOP-1.18,z,len,0.16,0.2,4,0,up?Math.atan2(1.65,seg):-Math.atan2(1.65,seg));
    }
  }
  for(let x=-HALF+3;x<HALF;x+=6)B('truss',x,TOP-0.7,cz,0.3,0.3,D,4);
  // light strips under the trusses + a few lamp housings
  const stripGlow=[];
  for(const x of [-14,-5,5,14])for(let z=ZMIN+5;z<ZMAX;z+=10){
    B('truss',x,TOP-2.35,z,0.9,0.12,4.2,4);B('strip',x,TOP-2.43,z,0.5,0.05,3.8,4);
    stripGlow.push([x,z]);
  }
  for(const s of [-1,1])for(let z=ZMIN+3;z<ZMAX;z+=5)B('stripW',s*(HALF-0.52),9.8,z,0.08,0.24,2.4,4);
  // the big bay door on the back wall
  const doorMat=new THREE.MeshStandardMaterial({map:doorTexture(0.17),roughness:0.6,metalness:0.25});
  const bay=new THREE.Mesh(new THREE.PlaneGeometry(14,10),doorMat);bay.position.set(0,5,ZMAX-0.01);bay.rotation.y=Math.PI;root.add(bay);
  B('truss',0,10.2,ZMAX-0.12,14.8,0.4,0.3,4);for(const s of [-1,1])B('truss',s*7.2,5,ZMAX-0.12,0.4,10,0.3,4);
  // catwalk across the back wall
  B('truss',0,5.0,ZMAX-1.0,HALF*2-1,0.14,1.8,4);B('yellow',0,6.0,ZMAX-1.9,HALF*2-1,0.07,0.07,4);B('yellow',0,5.5,ZMAX-1.9,HALF*2-1,0.05,0.05,4);
  for(let x=-HALF+1;x<=HALF-1;x+=2.5)B('yellow',x,5.55,ZMAX-1.9,0.06,1.1,0.06,4);
  // pipes and fuel lines along the walls
  for(const y of [1.0,1.45,2.4])bag.cyl('pipe',0,y,ZMAX-0.55,0.09,0.09,HALF*2-1,0,0,Math.PI/2,10);
  for(let x=-HALF+3;x<HALF;x+=6)for(const y of [1.0,1.45,2.4])bag.cyl('pipe',x,y,ZMAX-0.55,0.14,0.14,0.14,0,0,Math.PI/2,10);
  for(const s of [-1,1])for(const y of [1.2,2.2])bag.cyl('pipe',s*(HALF-0.5),y,cz,0.1,0.1,D-1,Math.PI/2,0,0,10);
  for(const x of [-13,12])bag.cyl('red',x,1.5,ZMAX-0.45,0.16,0.16,3,0,0,0,10);
  // props: crates, cart, tug, fuel tanks, bollards
  const cr=[[-18,0.7,19,1.4,1.4,1.4],[-18,2.05,19,1.2,1.3,1.2],[-16.3,0.55,19.4,1.1,1.1,1.1],[16,0.7,37,1.4,1.4,1.4],[17.6,0.55,37.4,1.1,1.1,1.1],[16.4,1.9,37,1.1,1.3,1.1],[-19,0.7,38,1.5,1.4,1.5]];
  for(const [x,y,z,w,h,d] of cr)B('crate',x,y,z,w,h,d,1.5,(x*3)%1);
  bag.cyl('red',-7,1.0,29,0.9,0.9,3.4,0,0,Math.PI/2,18);B('truss',-7,0.4,29,3.2,0.3,1.0,4);
  for(const x of [-8.3,-5.7])for(const z of [28.5,29.5])bag.cyl('rubber',x,0.25,z,0.25,0.25,0.18,0,0,Math.PI/2,10);
  B('yellow',-12,0.7,22,2.6,0.9,1.4,4);B('yellow',-12.6,1.45,22,1.2,0.7,1.3,4);B('truss',-12.6,1.55,21.32,1.0,0.5,0.04,4);
  for(const x of [-13,-11])for(const z of [21.4,22.6])bag.cyl('rubber',x,0.3,z,0.3,0.3,0.2,Math.PI/2,0,0,10);
  for(const x of [-12,-4,-14])for(const z of [30,33])bag.cyl('yellow',x,0.5,z,0.1,0.1,1.0,0,0,0,8);
  bag.flush(root,mats);

  // overhead bridge crane (drifts slowly)
  const crane=new THREE.Group();root.add(crane);
  const cb=makeBag();
  cb.box('truss',0,11.2,0,HALF*2,0.7,0.8,4);cb.box('yellow',0,11.6,0,HALF*2-2,0.06,0.9,4);
  cb.box('truss',-6,10.7,0,2.0,0.6,1.4,4);cb.rod('pipe',new THREE.Vector3(-6,10.4,0),new THREE.Vector3(-6,6.3,0),0.03);
  cb.box('red',-6,6.1,0,0.5,0.4,0.4,4);cb.box('truss',-6,5.8,0,0.2,0.3,0.3,4);
  for(const s of [-1,1])cb.box('truss',s*(HALF-0.9),11.2,0,0.9,0.9,1.4,4);
  cb.flush(crane,mats);
  for(const s of [-1,1]){const r=new THREE.Mesh(boxGeo(0.4,0.5,D,4),mats.truss);r.position.set(s*(HALF-0.9),10.55,cz);root.add(r)}
  crane.position.z=22;

  // hazy light shafts under the lamps (cheap additive cones)
  const shaftMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    uniforms:{c:{value:new THREE.Color(0.55,0.65,0.8)}},
    vertexShader:'varying vec3 n;varying vec3 v;varying float k;void main(){n=normalMatrix*normal;vec4 m=modelViewMatrix*vec4(position,1.);v=-m.xyz;k=clamp(uv.y,0.,1.);gl_Position=projectionMatrix*m;}',
    fragmentShader:'uniform vec3 c;varying vec3 n;varying vec3 v;varying float k;void main(){float f=pow(abs(dot(normalize(n),normalize(v))),2.5);gl_FragColor=vec4(c*f*k*k*0.11,1.);}'});
  for(const [x,z] of [[-5,22],[5,22],[-5,32],[5,32]]){
    const m=new THREE.Mesh(new THREE.ConeGeometry(4.6,TOP-2.6,24,1,true),shaftMat);
    m.position.set(x,(TOP-2.6)/2+0.1,z);m.renderOrder=2;root.add(m);
  }

  // the ship
  const ship=buildShip(glowMap);
  ship.group.scale.setScalar(SHIP.scale);ship.group.position.set(SHIP.x,SHIP.y,SHIP.z);ship.group.rotation.y=SHIP.yaw;root.add(ship.group);
  root.updateMatrixWorld(true);
  // fuel hose from a wall hydrant, across the floor, to a belly port on the ship
  const port=ship.group.localToWorld(new THREE.Vector3(-0.4,-0.78,0.0));
  const hose=new THREE.CatmullRomCurve3([new THREE.Vector3(-HALF+0.6,1.0,ZMAX-3),new THREE.Vector3(-8,0.1,33),new THREE.Vector3(0,0.08,30),new THREE.Vector3(port.x-1.5,0.1,port.z+1.2),new THREE.Vector3(port.x-0.6,0.6,port.z+0.3),port]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(hose,48,0.07,6),mats.rubber));

  // two real lights: cool overhead wash on the ship and a warm fill
  const keyLight=new THREE.PointLight(0xcfe3ff,330,26,2);keyLight.position.set(7,TOP-3,30);root.add(keyLight);
  const fill=new THREE.PointLight(0xffc99a,110,18,2);fill.position.set(14,6,33);root.add(fill);

  return {
    root,ship,
    update(t){
      ship.update(t);
      crane.position.z=24+3*Math.sin(t*0.05);
    },
    stats(){let tri=0,calls=0;root.traverse(o=>{if(o.isMesh){calls++;const g=o.geometry;tri+=(g.index?g.index.count:g.attributes.position.count)/3}});return {tri,calls}}
  };
}

// ---------- window frames and the locked blast door (lobby side) ----------
export function buildHangarFront(parent){
  const mats={
    frame:new THREE.MeshStandardMaterial({color:0x4a4858,roughness:0.55,metalness:0.2,emissive:0x16151c}),
    brass:new THREE.MeshStandardMaterial({color:0xa68152,roughness:0.5,metalness:0.44}),
    door:new THREE.MeshStandardMaterial({color:0x7a828c,roughness:0.55,metalness:0.1,emissive:0x1c1f24}),
    doorDark:new THREE.MeshStandardMaterial({color:0x3a3e46,roughness:0.6,metalness:0.1,emissive:0x101216}),
    hazard:new THREE.MeshStandardMaterial({map:doorTexture(),roughness:0.6,metalness:0,emissive:0x383c44}),
    black:new THREE.MeshStandardMaterial({color:0x12151a,roughness:0.5}),
  };
  const bag=makeBag(),B=bag.box,zf=WALL_Z-0.09; // lobby-facing stone face
  for(const w of WINDOWS){
    const cx=(w.x0+w.x1)/2,ww=w.x1-w.x0,hh=w.y1-w.y0,cy=(w.y0+w.y1)/2;
    const t=0.16;
    B('frame',cx,w.y1+t/2,zf-0.03,ww+0.5,t,0.2);B('frame',cx,w.y0-t/2,zf-0.03,ww+0.5,t,0.2);
    for(const s of [-1,1])B('frame',cx+s*(ww/2+t/2),cy,zf-0.03,t,hh+0.35,0.2);
    B('brass',cx,w.y0-t-0.04,zf-0.1,ww+0.7,0.08,0.34);                 // sill
    B('frame',cx,cy+0.55,zf-0.02,ww,0.07,0.12);                          // transom
    for(const f of [1/3,2/3])B('frame',w.x0+ww*f,cy,zf-0.02,0.07,hh,0.12);
    for(const s of [-1,1])for(const y of [w.y0-0.08,w.y1+0.08])B('brass',cx+s*(ww/2+0.08),y,zf-0.14,0.07,0.07,0.04);
  }
  // blast door
  const dx=DOOR.x,dw=DOOR.w,dh=DOOR.h;
  B('frame',dx,dh+0.14,zf-0.03,dw+0.7,0.28,0.22);
  for(const s of [-1,1])B('frame',dx+s*(dw/2+0.16),dh/2,zf-0.03,0.32,dh,0.22);
  B('brass',dx,dh+0.33,zf-0.07,dw+0.8,0.08,0.3);
  B('door',dx,dh/2,WALL_Z+0.03,dw,dh,0.16,2);                              // the leaf, flush in the opening
  B('doorDark',dx,dh-0.1,zf-0.09,dw+0.6,0.14,0.14);                        // top rail and hangers
  for(const s of [-1,1]){B('doorDark',dx+s*0.8,dh-0.22,zf-0.09,0.25,0.2,0.12)}
  B('doorDark',dx,0.05,zf-0.06,dw+0.3,0.1,0.12);                             // floor track
  // hazard chevrons on the leading edge
  const haz=new THREE.Mesh(new THREE.PlaneGeometry(dw-0.1,dh-0.12),mats.hazard);haz.position.set(dx,dh/2,WALL_Z-0.0765);haz.rotation.y=Math.PI;
  // keypad and indicator housing
  const kx=dx+dw/2+0.95;
  B('frame',kx,1.45,zf-0.05,0.5,0.8,0.1);B('black',kx,1.62,zf-0.108,0.34,0.2,0.02);
  for(let i=0;i<9;i++)B('brass',kx-0.1+(i%3)*0.1,1.4-Math.floor(i/3)*0.09,zf-0.108,0.07,0.05,0.02);
  bag.flush(parent,mats);
  parent.add(haz);

  // red lamp in a cage above the door, plus a dim red status light on the keypad
  const lampMat=new THREE.MeshBasicMaterial({color:0xff2418}),lamp=new THREE.Mesh(new THREE.SphereGeometry(0.17,14,10),lampMat);
  lamp.position.set(dx,dh+0.62,zf-0.2);parent.add(lamp);
  const cage=makeBag();cage.box('frame',dx,dh+0.62,zf-0.12,0.5,0.46,0.12);
  for(const s of [-1,1])cage.box('brass',dx+s*0.24,dh+0.62,zf-0.26,0.03,0.4,0.03);
  cage.box('brass',dx,dh+0.84,zf-0.26,0.5,0.03,0.03);cage.box('brass',dx,dh+0.4,zf-0.26,0.5,0.03,0.03);
  cage.flush(parent,mats);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0xff2a1a,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  glow.scale.setScalar(1.1);glow.position.copy(lamp.position);glow.position.z-=0.1;parent.add(glow);
  const led=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.04,0.02),new THREE.MeshBasicMaterial({color:0xff3322}));led.position.set(kx,1.62,zf-0.12);parent.add(led);
  const redLight=new THREE.PointLight(0xff2a1a,4,6,2);redLight.position.set(dx,dh+0.4,zf-0.9);parent.add(redLight);
  const sign=canvasTex(512,128,(g,w,h)=>{
    g.fillStyle='#1b1d22';g.fillRect(0,0,w,h);g.strokeStyle='#d8aa2a';g.lineWidth=6;g.strokeRect(5,5,w-10,h-10);
    g.fillStyle='#e8e2d0';g.font='bold 52px sans-serif';g.textAlign='center';g.fillText('HANGAR 3',w/2,58);
    g.fillStyle='#ff5a48';g.font='bold 34px sans-serif';g.fillText('LOCKED',w/2,104);
  });
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.6,0.4),new THREE.MeshBasicMaterial({map:sign}));
  plate.position.set(dx,dh+1.3,zf-0.03);plate.rotation.y=Math.PI;parent.add(plate);

  // window glass
  const glass=glassMaterial({color:0x9cc4d4,opacity:0.1,rim:0.55,streak:0.22,tint:new THREE.Color(0x9fdcf0),side:THREE.DoubleSide});
  for(const w of WINDOWS){
    const g=new THREE.Mesh(new THREE.PlaneGeometry(w.x1-w.x0,w.y1-w.y0),glass);
    g.position.set((w.x0+w.x1)/2,(w.y0+w.y1)/2,WALL_Z);g.rotation.y=Math.PI;g.renderOrder=5;parent.add(g);
  }
  return {
    update(t){
      const k=0.5+0.5*Math.sin(t*2.1);
      lampMat.color.setRGB(0.35+0.65*k,0.05+0.07*k,0.04+0.04*k);
      glow.material.opacity=0.2+0.5*k;redLight.intensity=0.8+4*k;
      led.material.color.setRGB(0.5+0.5*(Math.sin(t*4.2)>0?1:0.3),0.1,0.08);
    },
    door:{x:dx,y:dh/2,z:zf,w:dw,h:dh}
  };
}
