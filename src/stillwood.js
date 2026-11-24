// A strange door into a wood that does not end.
// The way back walks with you and stays directly behind your head, so turning never shows it.
// The still pond is a scrying pool, not a true mirror: looking down into it shows the door
// that is standing behind you. Seeing that reflection, or seeing the door itself, holds the
// door where it is. Look away from both and it slips behind you again.
import * as THREE from 'three';
import {MOVE,bobY,createRoomWalker,lookStep} from './movement.js';
import {getProp,natureMaterial} from './nature.js';

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
// ---- terrain and placement helpers (pure, seeded: every player gets the same wood) ----
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=t=>t*t*(3-2*t);
// 0..1 value noise on a 14 m lattice; high values are sunny clearings (the ground shader reads the same field)
export function clearField(x,z,seed){
  const u=x/14,v=z/14,iu=Math.floor(u),iv=Math.floor(v),fu=sstep(u-iu),fv=sstep(v-iv),s=seed^0x51ed;
  return lerp(lerp(hash2(iu,iv,s),hash2(iu+1,iv,s),fu),lerp(hash2(iu,iv+1,s),hash2(iu+1,iv+1,s),fu),fv);
}
const CLEAR_AT=0.66;
export function segDist(px,pz,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,t=clamp(((px-ax)*dx+(pz-az)*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(px-ax-dx*t,pz-az-dz*t);
}
// extra independent random numbers for a cell
const hr=(x,z,seed,k)=>hash2(Math.round(x*4)+k*7919,Math.round(z*4)-k*104729,seed+k*15485863);

// ---- props: which baked kinds and how many seed variants, and how many instances each can hold ----
// order = bake order: the things you see first come first
const PROPS=[
  {kind:'fir',n:3,cap:[110,260],far:66,opts:{palette:{leaf:'#3f7058',leaf2:'#72a06f',leafD:'#274a3c'}}},
  {kind:'shrub',n:2,cap:[120,130],far:34,opts:{palette:{leaf:'#4a7a42',leaf2:'#80a652',leafD:'#2d5330'}}},
  {kind:'mossrock',n:2,cap:[50,70],far:44,opts:{palette:{moss:'#4f6e38',moss2:'#78914a',mossD:'#334d2a'}}},
  {kind:'oak',n:2,cap:[60,150],far:66,opts:{palette:{leaf:'#5b8040',leaf2:'#93b055',leafD:'#3d5e30'}}},
  {kind:'tulip',n:1,cap:[110,60],far:26},
  {kind:'daisy',n:1,cap:[110,60],far:26},
  {kind:'slab',n:2,cap:[10,6],far:36,opts:{size:0.9}},
  {kind:'boulder',n:1,cap:[40,60],far:44},
  {kind:'snag',n:1,cap:[40,80],far:66},
];
const BAKE_ORDER=['fir0','shrub0','mossrock0','oak0','tulip0','daisy0','slab0','boulder0','fir1','oak1','shrub1','snag0','fir2','mossrock1','slab1'];
// until a prop's bake lands (or is read from the cache) its slot shows one of these cheap stand-ins
function placeholder(kind){
  const T=THREE,m=(g,x,y,z,c,sx=1,sy=1,sz=1)=>{g.scale(sx,sy,sz);g.translate(x,y,z);return [g,...c]};
  const parts={
    fir:[m(new T.CylinderGeometry(0.1,0.2,1.2,5),0,0.6,0,[0.05,0.03,0.015]),m(new T.ConeGeometry(1.5,3.2,7),0,2.4,0,[0.012,0.05,0.025]),m(new T.ConeGeometry(0.9,2.4,7),0,4.2,0,[0.016,0.07,0.03])],
    oak:[m(new T.CylinderGeometry(0.2,0.34,3,6),0,1.5,0,[0.06,0.04,0.02]),m(new T.IcosahedronGeometry(2,0),0,4.4,0,[0.03,0.09,0.03],1.2,0.9,1.2)],
    snag:[m(new T.CylinderGeometry(0.1,0.35,4.6,5),0,2.3,0,[0.1,0.085,0.07])],
    shrub:[m(new T.IcosahedronGeometry(0.5,0),0,0.28,0,[0.03,0.09,0.03],1,0.6,1)],
    tulip:[m(new T.ConeGeometry(0.22,0.5,5),0,0.25,0,[0.2,0.06,0.05])],
    daisy:[m(new T.ConeGeometry(0.22,0.45,5),0,0.22,0,[0.25,0.24,0.16])],
    mossrock:[m(new T.DodecahedronGeometry(0.5,0),0,0.2,0,[0.07,0.1,0.06],1.2,0.7,1)],
    boulder:[m(new T.DodecahedronGeometry(0.4,0),0,0.14,0,[0.1,0.1,0.09],1.2,0.6,1)],
    slab:[m(new T.CylinderGeometry(0.45,0.5,0.4,6),0,0.2,0,[0.12,0.12,0.1])],
  }[kind];
  const g=mergeParts(parts);
  const n=g.attributes.position.count;
  g.setAttribute('aSw',new THREE.BufferAttribute(new Float32Array(n),1));
  g.setAttribute('aLf',new THREE.BufferAttribute(new Float32Array(n),1));
  return g;
}
// a trunk radius read from the baked mesh: the lower vertices just above the roots
function trunkRadius(g){
  const p=g.attributes.position.array,d=[];
  for(let i=0;i<p.length;i+=3)if(p[i+1]>0.1&&p[i+1]<0.4)d.push(Math.hypot(p[i],p[i+2]));
  if(d.length<6)return 0;
  d.sort((a,b)=>a-b);return d[d.length/10|0];
}
const TRUNK0={fir:0.21,oak:0.35,snag:0.44}; // before the bake: what the baked seeds measure
const TRUNK_PAD={fir:0.55,oak:0.1,snag:0.1};  // a fir's skirt of boughs starts at knee height
const TREE_KINDS=['fir','oak','snag'];

// ground: moss, meadow, leaf litter, a dirt path and a dark wet bank, all from world position so it can follow the player
function groundMaterial(Q,seed,pond){
  const m=Q===0?new THREE.MeshLambertMaterial({color:0xffffff}):new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
  const U={uSeed:{value:seed^0x51ed},uPond:{value:new THREE.Vector3(pond.x,pond.z,pond.r)},uSeg:{value:new THREE.Vector4(0,0,pond.x,pond.z)}};
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,U);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vW;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvW=(modelMatrix*vec4(position,1.0)).xz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vW;uniform float uSeed;uniform vec3 uPond;uniform vec4 uSeg;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float hs(ivec2 c){uint h=(uint(c.x)*374761393u)^(uint(c.y)*668265263u)^uint(int(uSeed));h=(h^(h>>13))*1274126177u;return float(h^(h>>16))/4294967296.0;}
float clearF(vec2 p){vec2 q=p/14.;vec2 i=floor(q),f=q-i;f=f*f*(3.-2.*f);ivec2 c=ivec2(i);
  return mix(mix(hs(c),hs(c+ivec2(1,0)),f.x),mix(hs(c+ivec2(0,1)),hs(c+ivec2(1,1)),f.x),f.y);}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
{
  float cl=smoothstep(${CLEAR_AT-0.1},${CLEAR_AT+0.06},clearF(vW));
  vec3 c=mix(vec3(.075,.150,.055),vec3(.170,.255,.075),cl);
  float mo=vn(vW*.21+3.);c=mix(c,vec3(.035,.095,.045),smoothstep(.5,.78,mo)*.65*(1.-cl));
  float lt=smoothstep(.56,.78,vn(vW*.46+9.));c=mix(c,vec3(.12,.12,.045),lt*.4*(1.-cl));
  float ds=smoothstep(.6,.85,vn(vW*.9+21.));c=mix(c,vec3(.10,.085,.05),ds*.35);
  float gr=.78+.4*vn(vW*3.7)*vn(vW*13.+5.)+.18*(vn(vW*1.3)-.5);c*=gr;
  vec2 ab=uSeg.zw-uSeg.xy;float t=clamp(dot(vW-uSeg.xy,ab)/dot(ab,ab),0.,1.);
  float dp=length(vW-uSeg.xy-ab*t)+ (vn(vW*2.)-.5)*.5;
  c=mix(c,vec3(.115,.085,.05)*(.8+.4*vn(vW*8.)),(1.-smoothstep(.3,.95,dp))*.55);
  float dq=length(vW-uPond.xy)-uPond.z;
  c=mix(c,vec3(.03,.05,.03),(1.-smoothstep(0.,2.6,dq))*.65);
  diffuseColor.rgb=c;
}`);
  };
  m.customProgramCacheKey=()=>'stillground'+Q;
  return m;
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
  const Q=o.low?0:1;
  cam.fov=72;cam.near=0.08;cam.far=160;
  const prevBg=scene.background;
  scene.background=new THREE.Color(0xc5ddd0);
  scene.fog=new THREE.FogExp2(0xc5ddd0,o.low?0.034:0.026);
  group.add(new THREE.HemisphereLight(0xd5eee4,0x4d6038,0.9));
  const sun=new THREE.DirectionalLight(0xfff0d0,1.55);
  sun.position.set(40,55,18);group.add(sun);

  const ground=new THREE.Mesh(new THREE.CircleGeometry(96,28),groundMaterial(Q,seed,pond));
  ground.rotation.x=-Math.PI/2;ground.position.y=0;group.add(ground);
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

  // ---- the wood: one InstancedMesh pair (near and far LOD) per baked kind and seed variant ----
  const UT={value:0};
  const mat=natureMaterial({Q,UT,sway:0.035});
  const fam=(seed%3)*10;
  const holders={};for(const p of PROPS)holders[p.kind]=placeholder(p.kind);
  const slots=[],by={};
  for(const p of PROPS){
    by[p.kind]=[];
    for(let i=0;i<p.n;i++){
      const mk=cap=>{
        const im=new THREE.InstancedMesh(holders[p.kind],mat,Math.ceil(cap*(o.low?0.6:1)));
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.frustumCulled=false;im.count=0;group.add(im);return im;
      };
      const sl={kind:p.kind,i,id:p.kind+i,pseed:fam+i+1,opts:p.opts,far:p.far,near:mk(p.cap[0]),farM:mk(p.cap[1]),
        r:TRUNK0[p.kind]||0,pad:TRUNK_PAD[p.kind]||0,ready:false};
      slots.push(sl);by[p.kind].push(sl);
    }
  }
  const slotById=Object.fromEntries(slots.map(s=>[s.id,s]));
  const dummy=new THREE.Object3D();
  let trees=[],chunkX=1e9,chunkZ=1e9,deadClear=false;
  const treeR=t=>t.s.r*t.k+t.s.pad*Math.min(1.2,t.k);
  const pathAt=(x,z)=>segDist(x,z,0,0,pond.x,pond.z);
  const clearOf=(x,z)=>((x-pond.x)**2+(z-pond.z)**2<(pond.r+2.4)**2)||(x*x+z*z<5*5);
  function trunkAt(x,z){return trees.some(t=>(t.x-x)**2+(t.z-z)**2<(treeR(t)+0.9)**2)}
  const NEAR=o.low?10:18,reach=o.low?1:2;
  function rebuild(cx,cz){
    if(cx===chunkX&&cz===chunkZ)return;
    chunkX=cx;chunkZ=cz;trees=[];
    for(const s of slots){s.near.count=0;s.farM.count=0}
    const mx=cx*16,mz=cz*16,low=!!o.low;
    // put one instance in a slot's near or far mesh by its distance from the chunk centre
    const put=(kind,v,x,y,z,sxz,sy,rot)=>{
      const arr=by[kind],sl=arr[Math.min(arr.length-1,Math.floor(v*arr.length))];
      const d=Math.hypot(x-mx,z-mz);
      if(d>sl.far*(low?0.8:1))return null;
      const far=d>NEAR,im=far?sl.farM:sl.near;
      if(im.count>=im.instanceMatrix.count)return null;
      dummy.position.set(x,y,z);dummy.rotation.set(0,rot,0);dummy.scale.set(sxz,sy,sxz);dummy.updateMatrix();
      im.setMatrixAt(im.count++,dummy.matrix);
      return sl;
    };
    for(let iz=-reach;iz<=reach;iz++)for(let ix=-reach;ix<=reach;ix++){
      const ox=(cx+ix)*16-8,oz=(cz+iz)*16-8;
      for(let j=0;j<5;j++)for(let i=0;i<5;i++){
        const x0=ox+1.6+i*3.2,z0=oz+1.6+j*3.2;
        const R=k=>hr(x0,z0,seed,k);
        const x=x0+(R(1)-0.5)*2.4,z=z0+(R(2)-0.5)*2.4;
        const dPond=Math.hypot(x-pond.x,z-pond.z)-pond.r,dPath=pathAt(x,z),cf=clearField(x,z,seed);
        const clearing=cf>CLEAR_AT,dd=Math.hypot(x-mx,z-mz);
        const thin=dd>NEAR+22?(dd>NEAR+40?0.3:0.55):1; // far trees thin out into the fog
        // trees: mostly fir, some oak, now and then a dead one
        if(!clearing&&!clearOf(x,z)&&dPath>1.7&&R(3)<(low?0.34:0.5)&&R(10)<thin){
          const kv=R(4),kind=kv<0.6?'fir':kv<0.92?'oak':'snag',g=R(6),sc=(kind==='fir'?0.8:0.85)+g*g*0.65;
          const sl=put(kind,R(5),x,0,z,sc*(0.92+R(11)*0.16),sc,R(7)*6.283);
          if(sl)trees.push({x,z,s:sl,k:sc});
        }
        // shrubs: under the trees, thinner in the sun
        const sx=x0+(R(12)-0.5)*3,sz=z0+(R(13)-0.5)*3,dPs=Math.hypot(sx-pond.x,sz-pond.z)-pond.r;
        if(dPs>0.9&&pathAt(sx,sz)>1&&R(14)<(clearing?0.1:0.3)&&R(10)<thin)
          put('shrub',R(15),sx,0,sz,0.75+R(16)*0.8,0.75+R(17)*0.7,R(18)*6.283);
        // flower clumps: meadow clearings, round the pond and beside the path
        const fx=x0+(R(19)-0.5)*3,fz=z0+(R(20)-0.5)*3,dPf=Math.hypot(fx-pond.x,fz-pond.z)-pond.r,pf=pathAt(fx,fz);
        const wf=clearing?0.75:(dPf<6||pf<3.4)?0.45:0.04;
        if(dPf>1&&pf>0.8&&R(21)<wf*(low?0.7:1)){
          const kind=R(22)<0.5?'tulip':'daisy',s=1.1+R(23)*0.8;
          put(kind,R(24),fx,0,fz,s,s,R(25)*6.283);
          if(clearing&&R(26)<0.5){const a=R(27)*6.283,s2=1+R(28)*0.7;put(R(29)<0.5?'tulip':'daisy',R(30),fx+Math.cos(a)*1.1,0,fz+Math.sin(a)*1.1,s2,s2,R(31)*6.283)}
        }
        // loose stones
        const qx=x0+(R(32)-0.5)*3,qz=z0+(R(33)-0.5)*3,dPq=Math.hypot(qx-pond.x,qz-pond.z)-pond.r;
        if(dPq>1.4&&pathAt(qx,qz)>1.1&&R(34)<0.075){
          const s=0.6+R(35)*0.9,mossy=R(36)<0.6;
          put(mossy?'mossrock':'boulder',R(37),qx,-0.2*s,qz,s,s*(0.8+R(38)*0.4),R(39)*6.283);
        }
      }
    }
    // a ring of stones round the water, open where the path arrives
    const toDoor=Math.atan2(-pond.z,-pond.x);
    for(let i=0;i<22;i++){
      const a=i/22*6.283+(hash2(i,3,seed)-0.5)*0.18;
      if(Math.abs(Math.atan2(Math.sin(a-toDoor),Math.cos(a-toDoor)))<0.3)continue;
      const rad=pond.r+0.3+hash2(i,5,seed)*0.7,big=hash2(i,7,seed)<0.3,s=(big?0.65:0.42)+hash2(i,9,seed)*0.4;
      put(hash2(i,11,seed)<0.65?'mossrock':'boulder',hash2(i,13,seed),pond.x+Math.cos(a)*rad,-0.2*s,pond.z+Math.sin(a)*rad,s,s*(0.7+hash2(i,15,seed)*0.3),hash2(i,17,seed)*6.283);
    }
    // stepping stones along the path to the pond
    const L=Math.hypot(pond.x,pond.z),ux=pond.x/L,uz=pond.z/L;
    for(let k=0,d=2.3;d<L-pond.r-0.6;k++,d+=1.7+hash2(k,2,seed)*0.5){
      const lat=(hash2(k,4,seed)-0.5)*0.5;
      put('slab',hash2(k,6,seed),ux*d-uz*lat,-0.07,uz*d+ux*lat,0.85+hash2(k,8,seed)*0.3,0.45,hash2(k,10,seed)*6.283);
    }
    for(const s of slots){s.near.instanceMatrix.needsUpdate=true;s.farM.instanceMatrix.needsUpdate=true}
  }
  // bake in idle slices, one prop at a time; each lands in its InstancedMesh pair as soon as it is ready
  const bake={t0:performance.now(),ms:0,done:0,total:BAKE_ORDER.length,cached:0,log:[]};
  const applyProp=(sl,p)=>{
    sl.near.geometry=p.near;sl.farM.geometry=p.far;sl.ready=true;
    const r=trunkRadius(p.near);if(r>0&&TRUNK0[sl.kind])sl.r=r;
    sl.tris=[p.near.attributes.position.count/3,p.far.attributes.position.count/3];
  };
  (async()=>{
    for(const id of BAKE_ORDER){
      if(deadClear)return;
      const sl=slotById[id];
      try{
        const t=performance.now(),p=await getProp(sl.kind,sl.pseed,Object.assign({sliceMs:5},sl.opts));
        if(deadClear)return;
        applyProp(sl,p);bake.done++;if(p.stats&&p.stats.cached)bake.cached++;bake.log.push([id,Math.round(performance.now()-t)]);
      }catch(e){console.warn('still wood bake',id,e);bake.done++}
    }
    bake.ms=performance.now()-bake.t0;S.ready=true;
  })();

  const door=makeDoor();group.add(door);
  const S={t:0,yaw:0,pitch:0,bloom:0.18,seed,pinned:false,hold:0,said:0,doorX:0,doorZ:4.2,doorFace:0,ready:false,bake};
  const walker=createRoomWalker({o,eye:EYE,x:0,z:0,collide:b=>{
    for(const t of trees){
      const dx=b.x-t.x,dz=b.z-t.z,d=Math.hypot(dx,dz),m=0.32+treeR(t);
      if(d<m&&d>1e-4){b.x=t.x+dx/d*m;b.z=t.z+dz/d*m}
    }
  }});
  const b=walker.b;
  S.WK=walker;
  // what is on screen: instances x triangles of the LOD each one uses
  S.stats=()=>{
    let near=0,far=0,n=0,f=0;
    for(const s of slots){
      const nt=s.near.geometry.attributes.position.count/3,ft=s.farM.geometry.attributes.position.count/3;
      near+=s.near.count*nt;far+=s.farM.count*ft;n+=s.near.count;f+=s.farM.count;
    }
    return {tris:Math.round(near+far),nearTris:Math.round(near),farTris:Math.round(far),nearInst:n,farInst:f,trees:trees.length,ready:S.ready,bake};
  };
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
    water.material.uniforms.uTime.value=S.t;UT.value=S.t;
    cam.position.set(b.x,EYE+b.y+bobY(b,walker.scale),b.z);
    cam.rotation.set(S.pitch,-S.yaw,0,'YXZ');
    prevX=b.x;prevZ=b.z;
  };
  onClear(()=>{
    deadClear=true;scene.background=prevBg;rt.dispose();
    const gs=new Set([ground.geometry,...Object.values(holders)]);
    for(const s of slots){gs.add(s.near.geometry);gs.add(s.farM.geometry);s.near.dispose();s.farM.dispose()}
    for(const g of gs)g.dispose();
    mat.dispose();ground.material.dispose();water.geometry.dispose();water.material.dispose();
    beam.geometry.dispose();beam.material.dispose();
  });
  return S;
}
