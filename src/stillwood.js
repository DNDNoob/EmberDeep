// A strange door into a wood that does not end.
// The way back walks with you and stays directly behind your head, so turning never shows it.
// The still pond is a scrying pool, not a true mirror: looking down into it shows the door
// that is standing behind you. Seeing that reflection, or seeing the door itself, holds the
// door where it is. Look away from both and it slips behind you again.
import * as THREE from 'three';
import {MOVE,bobY,createRoomWalker,lookStep,scaleFor} from './movement.js';
import {getProp,natureMaterial} from './nature.js';

const EYE=1.6;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

export const STILL={
  behind:4.2, doorHalf:0.52, doorH:2.2, pondR:5.5, pondEvery:304.8, pondMax:3,
  grace:0.15, seeMargin:0.03, hidePad:0.3, waterY:0.045,
  vfov:72*Math.PI/180, waterReach:25, waterFill:2/9,
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
// The way back sits on the line pond - you - door, with you in the middle: `dist` metres from you, directly away from the pond.
// Standing on the pond centre (no line) it falls back to straight behind your head.
export function placeLine(x,z,pond,yaw,dist=STILL.behind,blocked){
  if(!pond)return placeBehind(x,z,yaw,dist,blocked);
  let ux=x-pond.x,uz=z-pond.z;const L=Math.hypot(ux,uz);
  if(L<0.3)return placeBehind(x,z,yaw,dist,blocked);
  ux/=L;uz/=L;
  let d=dist,px=x+ux*d,pz=z+uz*d;
  if(blocked){
    for(let i=0;i<8&&blocked(px,pz);i++){d+=0.65;px=x+ux*d;pz=z+uz*d}
    if(blocked(px,pz)){d=dist;px=x+ux*d-uz*1.5;pz=z+uz*d+ux*1.5}
  }
  return {x:px,z:pz,face:Math.atan2(-ux,uz)};   // a door faces along its `face` yaw: toward you, so the opposite of the pond-to-door bearing
}
export function nearestOf(ponds,x,z){
  let m=1e9,q=null;for(const p of ponds||[]){const d=Math.hypot(x-p.x,z-p.z)-p.r;if(d<m){m=d;q=p}}return q;
}
// ---- boulders you can climb: a stone whose top is within a jump becomes a dome you can land on and walk off ----
// highest top (m above the ground at its foot) the walker's jump clears, less a margin; scales with the room walker like the jump does
export const jumpTop=(eye=EYE)=>0.9*MOVE.jumpV*MOVE.jumpV/(2*MOVE.gravity)*scaleFor(eye);
const JUMP_TOP=jumpTop(EYE);
export const STEP_MIN=0.35;     // lower than this and a stone is just stepped over
// absolute height of a climbable stone's dome at (x,z), or -Infinity outside it. rock: {x,z,rg,y0,top}
export function rockSurface(r,x,z){
  const q=((x-r.x)**2+(z-r.z)**2)/(r.rg*r.rg);
  return q>=1?-Infinity:r.y0+r.top*Math.sqrt(1-q);
}
// A body with feet at `y` cannot rise onto the dome by walking more than `tol`: push it back to the radius where the dome is that high.
export function rockPush(r,bx,bz,y,tol=0.12){
  const dx=bx-r.x,dz=bz-r.z,d=Math.hypot(dx,dz);
  if(d>=r.rg)return null;
  const surf=rockSurface(r,bx,bz);
  if(surf-y<=tol)return null;
  const yn=y+tol-r.y0,ds=yn<=0?r.rg:r.rg*Math.sqrt(Math.max(0,1-(yn/r.top)**2));
  if(d>=ds)return null;
  if(d<1e-4)return [r.x+ds,bz];
  return [r.x+dx/d*ds,r.z+dz/d*ds];
}
// ---- biomes: a smooth seeded field of ~90 m patches. m = meadow weight, d = deep-wood weight (both 0 in the mixed wood) ----
export const BIOME={len:90,mLo:0.34,mHi:0.47,dLo:0.53,dHi:0.66};
export function biomeN(x,z,seed){
  return vnoise(x/BIOME.len,z/BIOME.len,seed^0xb10e)*0.86+vnoise(x/40+7.3,z/40-3.1,seed^0x2f1d)*0.14;
}
export function biomeAt(x,z,seed){
  const n=biomeN(x,z,seed);
  return {m:1-sstep01((n-BIOME.mLo)/(BIOME.mHi-BIOME.mLo)),d:sstep01((n-BIOME.dLo)/(BIOME.dHi-BIOME.dLo))};
}
export function rayHitsPond(eye,dir,pond,waterY=STILL.waterY,maxT=30){
  if(dir[1]>=-0.05)return null;
  const wy=pond.wy??waterY;
  const t=(wy-eye[1])/dir[1];
  if(t<0.15||t>maxT)return null;
  const x=eye[0]+dir[0]*t,z=eye[2]+dir[2]*t;
  if((x-pond.x)**2+(z-pond.z)**2>pond.r*pond.r)return null;
  return {x,z,t};
}
// Camera field of view as {v,h} radians for a vertical fov and an aspect ratio.
export function viewFov(vfov=STILL.vfov,aspect=16/9){return {v:vfov,h:2*Math.atan(Math.tan(vfov/2)*aspect)}}
const wrapA=a=>{a%=Math.PI*2;return a>Math.PI?a-Math.PI*2:a<-Math.PI?a+Math.PI*2:a};
// Is the door on screen? Its centre must lie inside the real camera frustum, periphery included (margin in radians).
export function doorSeen(eye,yaw,pitch,door,fov=viewFov(),margin=STILL.seeMargin){
  const vx=door.x-eye[0],vz=door.z-eye[2],vy=(door.y||0)+1.15-eye[1],hd=Math.hypot(vx,vz);
  if(hd<1.0)return true;           // standing at the doorway
  if(hd>45)return false;
  const dy=wrapA(Math.atan2(vx,-vz)-yaw),el=Math.atan2(vy,hd);
  return Math.abs(dy)<fov.h/2+margin&&Math.abs(el-pitch)<fov.v/2+margin;
}
// Fraction of a 3x3 fan of view rays (spread over most of the screen) that strike pond water within `reach` metres.
export function waterFill(eye,yaw,pitch,ponds,fov=viewFov(),reach=STILL.waterReach){
  let hit=0;
  for(const ox of [-0.6,0,0.6])for(const oy of [-0.6,0,0.6]){
    const dir=lookDir(yaw+ox*fov.h/2,clamp(pitch+oy*fov.v/2,-1.5,1.5));
    for(const p of ponds)if(rayHitsPond(eye,dir,p,STILL.waterY,reach)){hit++;break}
  }
  return hit/9;
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
// One simulation step. s = {x,z,eye,yaw,pitch,aspect?,door:{x,z,y?,face},ponds:[{x,z,r,wy?}] (or pond),pinned,hold}
// The door is frozen in world space exactly while the player SEES it: either its reflection (the water fills part of the view:
// at least waterFill of the view rays strike a pond within waterReach) or the real door inside the camera frustum.
// The instant neither holds (after a tiny grace against flicker) it slips back directly behind the player.
export function stillStep(s,dt){
  const ponds=s.ponds||[s.pond],eye=[s.x,s.eye??EYE,s.z],fov=s.fov||viewFov(STILL.vfov,s.aspect||16/9),margin=s.seeMargin??STILL.seeMargin;
  const fill=waterFill(eye,s.yaw,s.pitch,ponds,fov,s.waterReach??STILL.waterReach);
  const water=fill>=(s.waterFill??STILL.waterFill)-1e-9;
  s.locked=false;s.released=false;s.direct=false;s.hidden=false;
  if(s.pinned){
    // frozen in place while you see its reflection or the door itself
    s.direct=doorSeen(eye,s.yaw,s.pitch,s.door,fov,margin);
    if(water||s.direct)s.hold=s.grace??STILL.grace;
    else{s.hold-=dt;if(s.hold<=0){s.pinned=false;s.hold=0;s.released=true}}
  }
  if(!s.pinned){
    // free: pond, you and the door in a straight line with you in the middle
    const p=placeLine(s.x,s.z,nearestOf(ponds,s.x,s.z),s.yaw,s.behind??STILL.behind,s.blocked);
    s.door.x=p.x;s.door.z=p.z;s.door.face=p.face;
    if(s.groundAt)s.door.y=s.groundAt(p.x,p.z);
    // a spot on screen hides the door (never counted as seen) until it leaves the view: it cannot pop in ahead of you
    s.hidden=doorSeen(eye,s.yaw,s.pitch,s.door,fov,margin+(s.hidePad??STILL.hidePad));
    if(water&&!s.hidden){s.pinned=true;s.locked=true;s.hold=s.grace??STILL.grace}
  }
  s.fill=fill;s.water=water;s.sees=water||s.direct;
  return s;
}

// A new pond is due once the player is a long walk (500 ft) from the newest one.
export function pondSpawnDue(px,pz,last,every=STILL.pondEvery){
  return Math.hypot(px-last.x,pz-last.z)>=every;
}
// Where the next pond appears: 25-35 m ahead of the player, in a seeded direction within about 15 degrees of where they face,
// turned aside if it would crowd an existing pond. Pure and seeded: the host's result is what guests receive.
export function pondSpawnAt({seed,index,x,z,yaw,ponds=[]}){
  const h1=hash2(index,17,seed),h2=hash2(index,29,seed),h3=hash2(index,43,seed),r=4.8+h3*1.2;
  let ang=yaw+(h2-0.5)*0.5,px=0,pz=0;
  for(let k=0;k<6;k++){
    const f=horizForward(ang),dist=25+10*h1;
    px=x+f[0]*dist;pz=z+f[1]*dist;
    if(!ponds.some(p=>Math.hypot(px-p.x,pz-p.z)<p.r+r+8))break;
    ang+=0.7;
  }
  const q=v=>Math.round(v*100)/100;
  return {x:q(px),z:q(pz),r:q(r),i:index,fx:q(x),fz:q(z)};
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
// ---- hills: a smooth seeded height field, flattened round the spawn and into a basin under every pond (same maths runs in the ground shader) ----
export const HILL={amp1:4.6,len1:64,amp2:1.3,len2:30,flat0:5,flat1:14,pondFlat0:1.5,pondFlat1:9,dish:0.35};
const sstep01=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t)};
function vnoise(u,v,s){
  const iu=Math.floor(u),iv=Math.floor(v),fu=sstep01(u-iu),fv=sstep01(v-iv);
  return lerp(lerp(hash2(iu,iv,s),hash2(iu+1,iv,s),fu),lerp(hash2(iu,iv+1,s),hash2(iu+1,iv+1,s),fu),fv);
}
// terrain before any pond is carved in (the level a pond is set at)
export function terrainRaw(x,z,seed){
  const h=(vnoise(x/HILL.len1,z/HILL.len1,seed^0x7a11)-0.5)*2*HILL.amp1+(vnoise(x/HILL.len2,z/HILL.len2,seed^0x3c9d)-0.5)*2*HILL.amp2;
  return h*sstep01((Math.hypot(x,z)-HILL.flat0)/(HILL.flat1-HILL.flat0));
}
// ponds: [{x,z,r,y}]  y = water level reference (terrainRaw at the centre)
export function terrainH(x,z,seed,ponds=[]){
  let h=terrainRaw(x,z,seed);
  for(const p of ponds){
    const d=Math.hypot(x-p.x,z-p.z);
    h+=(p.y-h)*(1-sstep01((d-(p.r+HILL.pondFlat0))/(HILL.pondFlat1-HILL.pondFlat0)));
    h-=HILL.dish*(1-sstep01((d-(p.r-2))/2.2));
  }
  return h;
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
// cap = [near, far]; far = farthest distance (m) an instance is drawn; near = distance (m) inside which the near LOD is used
const PROPS=[
  {kind:'fir',n:3,cap:[90,260],far:66,near:15,opts:{palette:{leaf:'#3f7058',leaf2:'#72a06f',leafD:'#274a3c'}}},
  {kind:'shrub',n:2,cap:[110,130],far:34,near:14,opts:{palette:{leaf:'#4a7a42',leaf2:'#80a652',leafD:'#2d5330'}}},
  {kind:'mossrock',n:2,cap:[60,70],far:44,near:15,opts:{palette:{moss:'#4f6e38',moss2:'#78914a',mossD:'#334d2a'}}},
  {kind:'oak',n:2,cap:[50,150],far:66,near:15,opts:{palette:{leaf:'#5b8040',leaf2:'#93b055',leafD:'#3d5e30'}}},
  {kind:'grass',n:3,cap:[110,200],far:26,near:9,opts:{palette:{base:'#3a5c2c',leaf:'#74a03c',tip:'#c6d062'}}},
  {kind:'tulip',n:1,cap:[110,60],far:26,near:12},
  {kind:'daisy',n:1,cap:[110,60],far:26,near:12},
  {kind:'reed',bake:'grass',n:2,cap:[40,40],far:44,near:14,opts:{tall:true}},
  {kind:'slab',n:2,cap:[24,12],far:36,near:18,opts:{size:0.9}},
  {kind:'boulder',n:1,cap:[40,60],far:44,near:15},
  {kind:'bigrock',bake:'boulder',n:2,cap:[14,30],far:90,near:26,opts:{size:4.5,budget:{near:5000,far:900}}},
  {kind:'bigmoss',bake:'mossrock',n:1,cap:[10,20],far:90,near:26,opts:{size:4.5,budget:{near:5000,far:900},palette:{moss:'#4f6e38',moss2:'#78914a',mossD:'#334d2a'}}},
  {kind:'snag',n:1,cap:[40,80],far:66,near:15},
];
const ROCKY=new Set(['bigrock','bigmoss','boulder','mossrock']);
const BAKE_ORDER=['fir0','shrub0','mossrock0','oak0','grass0','tulip0','daisy0','reed0','slab0','bigrock0','boulder0','fir1','grass1','oak1','shrub1','bigmoss0','snag0','fir2','mossrock1','reed1','bigrock1','grass2','slab1'];
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
    bigrock:[m(new T.DodecahedronGeometry(1.8,0),0,1.1,0,[0.1,0.1,0.09],1.1,0.7,1)],
    bigmoss:[m(new T.DodecahedronGeometry(1.8,0),0,1.0,0,[0.07,0.1,0.06],1.2,0.65,1)],
    boulder:[m(new T.DodecahedronGeometry(0.4,0),0,0.14,0,[0.1,0.1,0.09],1.2,0.6,1)],
    grass:[m(new T.ConeGeometry(0.14,0.32,5),0,0.16,0,[0.05,0.12,0.03])],
    reed:[m(new T.ConeGeometry(0.12,1.2,5),0,0.6,0,[0.06,0.12,0.04])],
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

// a polar grid in the XZ plane that is fine near the player and coarse far away; the vertex shader lifts it onto the hills
function groundGeometry(){
  const rings=[0];let r=0,step=0.45;while(r<98){r+=step;step*=1.05;rings.push(r)}
  const seg=96,pos=[0,0,0],idx=[];
  for(let k=1;k<rings.length;k++)for(let j=0;j<seg;j++){const a=j/seg*Math.PI*2;pos.push(Math.cos(a)*rings[k],0,Math.sin(a)*rings[k])}
  const v=(k,j)=>k===0?0:1+(k-1)*seg+(j%seg);
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<seg;j++){
    if(k===0)idx.push(0,v(1,j+1),v(1,j));
    else idx.push(v(k,j),v(k,j+1),v(k+1,j),v(k,j+1),v(k+1,j+1),v(k+1,j));
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(pos.map((_,i)=>i%3===1?1:0),3));g.setIndex(idx);
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),200);return g;
}
// ground: moss, meadow, leaf litter, dirt paths and sandy muddy banks, all from world position so it can follow the player; up to 3 ponds
function groundMaterial(Q,seed,U3){
  const m=Q===0?new THREE.MeshLambertMaterial({color:0xffffff}):new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
  const U=Object.assign({uSeed:{value:(seed^0x51ed)|0},uSeedA:{value:(seed^0x7a11)|0},uSeedB:{value:(seed^0x3c9d)|0},uSeedC:{value:(seed^0xb10e)|0},uSeedD:{value:(seed^0x2f1d)|0}},U3);
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,U);
    const TERR=`uniform int uSeedA;uniform int uSeedB;uniform vec4 uPondsT[3];
float hsI(ivec2 c,int sd){uint h=(uint(c.x)*374761393u)^(uint(c.y)*668265263u)^uint(sd);h=(h^(h>>13))*1274126177u;return float(h^(h>>16))/4294967296.0;}
float vnI(vec2 q,int sd){vec2 i=floor(q),f=q-i;f=f*f*(3.-2.*f);ivec2 c=ivec2(i);return mix(mix(hsI(c,sd),hsI(c+ivec2(1,0),sd),f.x),mix(hsI(c+ivec2(0,1),sd),hsI(c+ivec2(1,1),sd),f.x),f.y);}
float terrH(vec2 p){
  float h=(vnI(p/${HILL.len1.toFixed(1)},uSeedA)-.5)*2.*${HILL.amp1.toFixed(2)}+(vnI(p/${HILL.len2.toFixed(1)},uSeedB)-.5)*2.*${HILL.amp2.toFixed(2)};
  float t=clamp((length(p)-${HILL.flat0.toFixed(1)})/${(HILL.flat1-HILL.flat0).toFixed(1)},0.,1.);h*=t*t*(3.-2.*t);
  for(int i=0;i<3;i++){vec4 q=uPondsT[i];float d=length(p-q.xy);
    float u=clamp((d-(q.z+${HILL.pondFlat0.toFixed(1)}))/${(HILL.pondFlat1-HILL.pondFlat0).toFixed(1)},0.,1.);h+=(q.w-h)*(1.-u*u*(3.-2.*u));
    float v=clamp((d-(q.z-2.))/2.2,0.,1.);h-=${HILL.dish.toFixed(2)}*(1.-v*v*(3.-2.*v));}
  return h;}`;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vW;\n'+TERR)
      .replace('#include <beginnormal_vertex>',`vec3 objectNormal;{vec2 w0=(modelMatrix*vec4(position,1.0)).xz;float e=.7;
  objectNormal=normalize(vec3(terrH(w0-vec2(e,0.))-terrH(w0+vec2(e,0.)),2.*e,terrH(w0-vec2(0.,e))-terrH(w0+vec2(0.,e))));}`)
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvW=(modelMatrix*vec4(position,1.0)).xz;transformed.y+=terrH(vW);');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vW;uniform int uSeed;uniform int uSeedC;uniform int uSeedD;uniform vec3 uPonds[3];uniform vec4 uSegs[3];
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float hs(ivec2 c){uint h=(uint(c.x)*374761393u)^(uint(c.y)*668265263u)^uint(uSeed);h=(h^(h>>13))*1274126177u;return float(h^(h>>16))/4294967296.0;}
float hsB(ivec2 c,int sd){uint h=(uint(c.x)*374761393u)^(uint(c.y)*668265263u)^uint(sd);h=(h^(h>>13))*1274126177u;return float(h^(h>>16))/4294967296.0;}
float vnB(vec2 q,int sd){vec2 i=floor(q),f=q-i;f=f*f*(3.-2.*f);ivec2 c=ivec2(i);return mix(mix(hsB(c,sd),hsB(c+ivec2(1,0),sd),f.x),mix(hsB(c+ivec2(0,1),sd),hsB(c+ivec2(1,1),sd),f.x),f.y);}
float clearF(vec2 p){vec2 q=p/14.;vec2 i=floor(q),f=q-i;f=f*f*(3.-2.*f);ivec2 c=ivec2(i);
  return mix(mix(hs(c),hs(c+ivec2(1,0)),f.x),mix(hs(c+ivec2(0,1)),hs(c+ivec2(1,1)),f.x),f.y);}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
{
  float bn=vnB(vW/${BIOME.len.toFixed(1)},uSeedC)*.86+vnB(vW/40.+vec2(7.3,-3.1),uSeedD)*.14;
  float sp=smoothstep(8.,24.,length(vW));
  float bm=(1.-smoothstep(${BIOME.mLo},${BIOME.mHi},bn))*sp,bd=smoothstep(${BIOME.dLo},${BIOME.dHi},bn)*sp;
  float cl=smoothstep(${CLEAR_AT-0.1}+.2*bd,${CLEAR_AT+0.06}+.2*bd,clearF(vW));cl=max(cl*(1.-.7*bd),bm);
  vec3 c=mix(vec3(.075,.150,.055),vec3(.170,.255,.075),cl);
  c=mix(c,vec3(.255,.305,.085),bm*.55);c=mix(c,vec3(.050,.085,.036),bd*.7);
  float mo=vn(vW*.21+3.);c=mix(c,vec3(.035,.095,.045),smoothstep(.5,.78,mo)*.65*(1.-cl));
  float lt=smoothstep(.56,.78,vn(vW*.46+9.));lt=max(lt,bd*smoothstep(.3,.65,vn(vW*.55+4.)));c=mix(c,vec3(.12,.10,.045),lt*(.4+.35*bd)*(1.-cl));
  float ds=smoothstep(.6,.85,vn(vW*.9+21.));c=mix(c,vec3(.10,.085,.05),ds*.35);
  float gr=.78+.4*vn(vW*3.7)*vn(vW*13.+5.)+.18*(vn(vW*1.3)-.5);c*=gr;
  float dq=1e9,dp=1e9;
  for(int i=0;i<3;i++){
    dq=min(dq,length(vW-uPonds[i].xy)-uPonds[i].z);
    vec4 sg=uSegs[i];vec2 ab=sg.zw-sg.xy;float t=clamp(dot(vW-sg.xy,ab)/max(dot(ab,ab),1e-3),0.,1.);
    dp=min(dp,length(vW-sg.xy-ab*t));
  }
  dp+=(vn(vW*2.)-.5)*.5;
  c=mix(c,vec3(.115,.085,.05)*(.8+.4*vn(vW*8.)),(1.-smoothstep(.3,.95,dp))*.55);
  c=mix(c,vec3(.03,.05,.03),(1.-smoothstep(0.,2.6,dq))*.55);
  c=mix(c,vec3(.19,.16,.095)*(.85+.3*vn(vW*10.)),(1.-smoothstep(.05,.55+.35*vn(vW*1.5),dq))*.6);
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
  const Q=o.low?0:1,low=!!o.low;
  const lvl=p=>{p.y=terrainRaw(p.x,p.z,seed);p.wy=p.y-0.04;return p};
  let ponds=[lvl({x:((seed%5)-2)*2.2,z:-16,r:STILL.pondR,i:0,fx:0,fz:0})];
  const H=(x,z)=>terrainH(x,z,seed,ponds);
  cam.fov=72;cam.near=0.08;cam.far=160;
  const prevBg=scene.background;
  const FOG=0xc5ddd0,fogD=low?0.034:0.026;
  scene.background=new THREE.Color(FOG);
  scene.fog=new THREE.FogExp2(FOG,fogD);
  group.add(new THREE.HemisphereLight(0xd5eee4,0x4d6038,0.9));
  const sun=new THREE.DirectionalLight(0xfff0d0,1.55);
  sun.position.set(40,55,18);group.add(sun);
  const FOGC=new THREE.Color(FOG);

  // ---- pond bookkeeping shared by ground, placement and the water ----
  const GU={uPondsT:{value:[0,1,2].map(()=>new THREE.Vector4(1e5,1e5,1,0))},uPonds:{value:[0,1,2].map(()=>new THREE.Vector3(1e5,1e5,1))},uSegs:{value:[0,1,2].map(()=>new THREE.Vector4(1e5,1e5,1e5+1,1e5))}};
  const ground=new THREE.Mesh(groundGeometry(),groundMaterial(Q,seed,GU));
  ground.frustumCulled=false;group.add(ground);
  const pondDist=(x,z)=>{let m=1e9;for(const p of ponds){const d=Math.hypot(x-p.x,z-p.z)-p.r;if(d<m)m=d}return m};
  const pathDist=(x,z)=>{let m=1e9;for(const p of ponds)m=Math.min(m,segDist(x,z,p.fx,p.fz,p.x,p.z));return m};
  const nearestPond=(x,z)=>{let m=1e9,q=ponds[0];for(const p of ponds){const d=Math.hypot(x-p.x,z-p.z)-p.r;if(d<m){m=d;q=p}}return q};

  const rt=new THREE.WebGLRenderTarget(low?256:512,low?256:512);
  const scryCam=new THREE.PerspectiveCamera(48,1,0.12,80);
  const TW={value:0};  // water clock, shared by every pond's material

  // a pond's dressing: water, light shaft, lily pads and flowers, drifting motes. Three slots; pond index i uses slot i%3.
  const moteTex=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),gr=g.createRadialGradient(16,16,0,16,16,16);
    gr.addColorStop(0,'rgba(255,255,235,1)');gr.addColorStop(0.35,'rgba(230,255,200,0.5)');gr.addColorStop(1,'rgba(230,255,200,0)');g.fillStyle=gr;g.fillRect(0,0,32,32);
    const t=new THREE.CanvasTexture(c);return t})();
  const waterVS=`varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
  const waterFS=`uniform sampler2D uScry;uniform float uTime;uniform vec2 uCenter;uniform float uR;uniform vec4 uRip[4];uniform vec3 uFog;uniform float uFogD;uniform float uQ;uniform vec2 uYaw;uniform float uClear;uniform float uShim;
    varying vec2 vUv;varying vec3 vW;
    float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    void main(){
      vec2 rel=vW.xz-uCenter;float d=length(rel)/uR;
      vec3 Vv=cameraPosition-vW;float dist=length(Vv);vec3 V=Vv/dist;
      float rp=0.;vec2 rd=vec2(0.);
      for(int i=0;i<4;i++){vec4 r=uRip[i];float age=uTime-r.z;
        if(age>0.&&age<4.5){vec2 q=vW.xz-r.xy;float dq=length(q);float rad=age*0.85;float e=(dq-rad)*5.;
          float w=exp(-e*e)*r.w*(1.-age/4.5)*sin((dq-rad)*20.);rp+=w;rd+=q/(dq+1e-3)*w;}}
      // wave normal: two drifting sine fields; its xz slope refracts the image
      vec2 wv=vec2(sin(vW.x*3.1+uTime*.9)+sin(vW.z*2.3-uTime*.7)+.5*sin(vW.x*7.3+vW.z*5.1+uTime*1.7),sin(vW.z*3.7+uTime*.8)+sin(vW.x*2.9-uTime*1.1)+.5*sin(vW.z*6.7-vW.x*4.3+uTime*1.5));
      float calm=1.-.85*uClear;
      // the door image is laid out for the viewer: far side of the pond is up, and your right stays on the right, whatever side you stand
      vec2 fw=uYaw,rt=vec2(-fw.y,fw.x);
      vec2 suv=vec2(1.-(dot(rel,rt)/(2.*uR)+.5),dot(rel,fw)/(2.*uR)+.5);
      suv=(suv-.5)*(1.+.25*(1.-uClear))+.5+(wv*.011+rd*.05)*calm;
      vec3 scry=texture2D(uScry,suv).rgb*vec3(.8,.97,.9);
      scry=mix(scry,scry*(.65+.5*vn(vW.xz*5.+uTime*.4)),(1.-uClear)*.5);
      float steep=smoothstep(.1,.55,V.y),fr=pow(1.-clamp(V.y,0.,1.),4.);
      float shallow=smoothstep(.55,1.,d);
      vec3 col=mix(vec3(.018,.06,.055),vec3(.15,.19,.095),shallow);
      if(uQ>.5){
        vec2 p=vW.xz*1.3;float c1=sin(p.x*6.+sin(p.y*4.+uTime*.6)*1.5+uTime*.5)*sin(p.y*5.-uTime*.4+sin(p.x*3.)*2.);
        float cau=pow(clamp(c1*.5+.5,0.,1.),5.);col+=vec3(.28,.34,.17)*cau*shallow*(.5+.5*vn(vW.xz*2.+uTime*.2));
      }
      vec3 treeC=mix(vec3(.045,.1,.07),uFog,.5);
      vec3 skyc=mix(treeC,uFog*1.02,smoothstep(.0,.22,V.y+(vn(vW.xz*.7)-.5)*.06));
      float sw=(mix(.12,.36,steep)*(1.-uClear)+uClear*mix(.6,.98,steep))*(1.-smoothstep(.82,1.,d)*.55);
      col=mix(col,scry,sw);
      col=mix(col,skyc,clamp(fr*(1.-steep)*.95,0.,.9));
      col+=vec3(.24,.3,.27)*rp*.45;
      col+=vec3(.35,.5,.38)*uShim*exp(-pow((d-(1.-uShim)*1.15)*6.,2.))*.7+vec3(.1,.16,.12)*uShim*.35;
      col=mix(col,vec3(.3,.38,.26),smoothstep(.97,1.,d)*.3);
      float fogf=1.-exp(-uFogD*uFogD*dist*dist);col=mix(col,uFog,fogf);
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }`;
  const padGeo=new THREE.CircleGeometry(0.3,12,0.5,5.3);padGeo.rotateX(-Math.PI/2);
  const cupGeo=new THREE.ConeGeometry(0.075,0.1,7,1,true);cupGeo.rotateX(Math.PI);cupGeo.translate(0,0.05,0);
  const padMat=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide}),cupMat=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
  const waterGeo=new THREE.CircleGeometry(1,low?32:56);
  const PADS=low?7:13,MOTES=low?6:14;
  const pslots=[0,1,2].map(k=>{
    const g=new THREE.Group();g.visible=false;group.add(g);
    const mat=new THREE.ShaderMaterial({transparent:false,fog:false,toneMapped:true,
      uniforms:{uScry:{value:rt.texture},uTime:TW,uCenter:{value:new THREE.Vector2()},uR:{value:5},uRip:{value:[0,1,2,3].map(()=>new THREE.Vector4(0,0,-99,0))},uFog:{value:new THREE.Vector3(FOGC.r,FOGC.g,FOGC.b)},uFogD:{value:fogD},uQ:{value:Q},uYaw:{value:new THREE.Vector2(0,-1)},uClear:{value:0},uShim:{value:0}},
      vertexShader:waterVS,fragmentShader:waterFS});
    const water=new THREE.Mesh(waterGeo,mat);water.rotation.x=-Math.PI/2;g.add(water);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.55,9,8,1,true),
      new THREE.MeshBasicMaterial({color:0xe7fff4,transparent:true,opacity:0.1,side:THREE.DoubleSide,depthWrite:false}));
    beam.position.y=4.5;g.add(beam);
    const pads=new THREE.InstancedMesh(padGeo,padMat,PADS),cups=new THREE.InstancedMesh(cupGeo,cupMat,PADS);
    pads.frustumCulled=cups.frustumCulled=false;pads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cups.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col=new THREE.Color();
    for(let i=0;i<PADS;i++){pads.setColorAt(i,col.setRGB(0.12+0.06*(i%3),0.3+0.07*(i%4),0.1));cups.setColorAt(i,i%2?col.setRGB(1,0.82,0.9):col.setRGB(1,1,0.92))}
    g.add(pads,cups);
    const mp=new Float32Array(MOTES*3),mg=new THREE.BufferGeometry();mg.setAttribute('position',new THREE.BufferAttribute(mp,3));
    const motes=new THREE.Points(mg,new THREE.PointsMaterial({map:moteTex,size:0.16,transparent:true,opacity:0.85,depthWrite:false,blending:THREE.AdditiveBlending,color:0xeaffc0}));
    motes.frustumCulled=false;g.add(motes);
    return {g,mat,water,beam,pads,cups,motes,mp,pond:null,rip:0,nextDrip:0,lastWalk:-9,pads0:[]};
  });
  const dummy=new THREE.Object3D();
  function assignPond(p){
    const sl=pslots[p.i%3];sl.pond=p;sl.g.visible=true;sl.g.position.set(p.x,p.wy,p.z);
    sl.water.scale.set(p.r,p.r,1);sl.mat.uniforms.uCenter.value.set(p.x,p.z);sl.mat.uniforms.uR.value=p.r;
    for(const r of sl.mat.uniforms.uRip.value)r.set(0,0,-99,0);
    sl.nextDrip=S?S.t+1.5:1.5;
    sl.pads0=[];
    for(let i=0;i<PADS;i++){const a=hash2(p.i*31+i,3,seed)*6.283,rr=p.r*(0.45+0.5*hash2(p.i*31+i,5,seed)),s=0.65+0.7*hash2(p.i*31+i,7,seed);
      // none across the path's landing
      const toFrom=Math.atan2(p.fz-p.z,p.fx-p.x);if(Math.abs(Math.atan2(Math.sin(a-toFrom),Math.cos(a-toFrom)))<0.3&&rr>p.r*0.7)continue;
      sl.pads0.push({x:Math.cos(a)*rr,z:Math.sin(a)*rr,s,rot:hash2(p.i*31+i,9,seed)*6.283,ph:hash2(p.i*31+i,11,seed)*6.283,cup:hash2(p.i*31+i,13,seed)<0.42,i});}
    for(let i=0;i<MOTES;i++){sl.mp[i*3]=0}
  }
  function setPonds(list){
    ponds=list.map(lvl);
    for(const sl of pslots){sl.pond=null;sl.g.visible=false}
    GU.uPondsT.value.forEach(v=>v.set(1e5,1e5,1,0));GU.uPonds.value.forEach(v=>v.set(1e5,1e5,1));GU.uSegs.value.forEach(v=>v.set(1e5,1e5,1e5+1,1e5));
    ponds.forEach((p,k)=>{assignPond(p);GU.uPondsT.value[k].set(p.x,p.z,p.r,p.y);GU.uPonds.value[k].set(p.x,p.z,p.r);GU.uSegs.value[k].set(p.fx,p.fz,p.x,p.z)});
    chunkX=1e9;
  }
  function pushRip(sl,x,z,amp){const R=sl.mat.uniforms.uRip.value;R[sl.rip++%4].set(x,z,TW.value,amp)}
  function updatePonds(dt,b,moving){
    TW.value=S.t;
    const fy=horizForward(S.yaw),clr=S.pinned?1:S.water?0.5:0.15,shim=Math.max(0,S.shim||0);
    for(const sl of pslots){const u=sl.mat.uniforms;u.uYaw.value.set(fy[0],fy[1]);u.uClear.value=clr;u.uShim.value=shim}
    for(const sl of pslots){
      const p=sl.pond;if(!p)continue;
      if(S.t>sl.nextDrip){const h=hash2(Math.floor(S.t*7),p.i,seed),h2=hash2(Math.floor(S.t*5),p.i+9,seed),a=h*6.283,rr=Math.sqrt(h2)*p.r*0.75;
        pushRip(sl,p.x+Math.cos(a)*rr,p.z+Math.sin(a)*rr,0.7);sl.nextDrip=S.t+2.6+hash2(Math.floor(S.t),p.i+3,seed)*3.5}
      const dx=b.x-p.x,dz=b.z-p.z,dd=Math.hypot(dx,dz);
      if(moving&&dd<p.r+1.3&&dd>p.r-0.8&&S.t-sl.lastWalk>0.45){sl.lastWalk=S.t;pushRip(sl,p.x+dx/dd*(p.r-0.15),p.z+dz/dd*(p.r-0.15),0.9)}
      const wy=0;
      for(let k=0;k<sl.pads0.length;k++){
        const d=sl.pads0[k],bob=Math.sin(S.t*0.9+d.ph)*0.006;
        dummy.position.set(d.x,wy+0.008+bob,d.z);dummy.rotation.set(Math.sin(S.t*0.7+d.ph)*0.03,d.rot+Math.sin(S.t*0.15+d.ph)*0.2,Math.cos(S.t*0.6+d.ph)*0.03);dummy.scale.setScalar(d.s);dummy.updateMatrix();
        sl.pads.setMatrixAt(k,dummy.matrix);
        if(d.cup){dummy.position.y+=0.01;dummy.scale.setScalar(d.s*(0.9+0.1*Math.sin(S.t*0.5+d.ph)));dummy.updateMatrix();sl.cups.setMatrixAt(k,dummy.matrix)}
        else{dummy.scale.setScalar(0);dummy.updateMatrix();sl.cups.setMatrixAt(k,dummy.matrix)}
      }
      sl.pads.count=sl.cups.count=sl.pads0.length;sl.pads.instanceMatrix.needsUpdate=sl.cups.instanceMatrix.needsUpdate=true;
      // motes drift in slow loops above the water
      for(let i=0;i<MOTES;i++){const h=hash2(i,p.i+5,seed),h2=hash2(i,p.i+7,seed),h3=hash2(i,p.i+11,seed),t=S.t*(0.08+0.07*h3)+h*40;
        sl.mp[i*3]=p.x+Math.cos(t*1.3+h*6)*p.r*(0.2+0.75*h2);sl.mp[i*3+1]=0.5+0.9*h3+Math.sin(S.t*0.6+h*20)*0.18;sl.mp[i*3+2]=p.z+Math.sin(t+h2*6)*p.r*(0.2+0.75*h);
        // positions are world-space: the slot group sits at the pond, so make them local
        sl.mp[i*3]-=p.x;sl.mp[i*3+2]-=p.z}
      sl.motes.geometry.attributes.position.needsUpdate=true;
    }
  }

  // ---- the wood: one InstancedMesh pair (near and far LOD) per baked kind and seed variant ----
  const UT={value:0};
  // wind: trees lean from the trunk as bodies (crowns move most) with a few cm of coherent clump drift; shrubs and grass sway outright; rocks never move
  const M={
    fir:natureMaterial({Q,UT,sway:0,bend:0.007,clump:0.024,dip:0.05}),
    oak:natureMaterial({Q,UT,sway:0,bend:0.0055,clump:0.011}),
    snag:natureMaterial({Q,UT,sway:0,bend:0.004}),
    shrub:natureMaterial({Q,UT,sway:0.07,bend:0.02}),
    grass:natureMaterial({Q,UT,sway:0.06,bend:0.03}),
    reed:natureMaterial({Q,UT,sway:0.05,bend:0.09}),
    flower:natureMaterial({Q,UT,sway:0.06,bend:0.03}),
    rock:natureMaterial({Q,UT,sway:0}),
  };
  const matOf={bigrock:M.rock,bigmoss:M.rock,fir:M.fir,oak:M.oak,snag:M.snag,shrub:M.shrub,grass:M.grass,reed:M.reed,tulip:M.flower,daisy:M.flower,mossrock:M.rock,boulder:M.rock,slab:M.rock};
  const fam=(seed%3)*10;
  const holders={};for(const p of PROPS)holders[p.kind]=placeholder(p.kind);
  const slots=[],by={};
  for(const p of PROPS){
    by[p.kind]=[];
    for(let i=0;i<p.n;i++){
      const mk=cap=>{
        const im=new THREE.InstancedMesh(holders[p.kind],matOf[p.kind],Math.ceil(cap*(low?0.6:1)));
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.frustumCulled=false;im.count=0;group.add(im);return im;
      };
      const sl={kind:p.kind,bake:p.bake||p.kind,i,id:p.kind+i,pseed:fam+i+1,opts:p.opts,far:p.far,nearR:p.near,near:mk(p.cap[0]),farM:mk(p.cap[1]),
        r:TRUNK0[p.kind]||0,pad:TRUNK_PAD[p.kind]||0,fp:1.8,ready:false};
      slots.push(sl);by[p.kind].push(sl);
    }
  }
  const slotById=Object.fromEntries(slots.map(s=>[s.id,s]));
  let trees=[],rocks=[],chunkX=1e9,chunkZ=1e9,deadClear=false,S=null;
  const treeR=t=>t.s.r*t.k+t.s.pad*Math.min(1.2,t.k);
  const clearOf=(x,z)=>x*x+z*z<25||pondDist(x,z)<2.4;
  function trunkAt(x,z){return trees.some(t=>(t.x-x)**2+(t.z-z)**2<(treeR(t)+0.9)**2)}
  const NEAR=low?10:15,reach=low?1:2;
  function rebuild(cx,cz){
    if(cx===chunkX&&cz===chunkZ)return;
    chunkX=cx;chunkZ=cz;trees=[];rocks=[];
    for(const s of slots){s.near.count=0;s.farM.count=0}
    const mx=cx*16,mz=cz*16;
    // put one instance in a slot's near or far mesh by its distance from the chunk centre
    const put=(kind,v,x,y,z,sxz,sy,rot)=>{
      const arr=by[kind],sl=arr[Math.min(arr.length-1,Math.floor(v*arr.length))];
      const d=Math.hypot(x-mx,z-mz);
      if(d>sl.far*(low?0.75:1))return null;
      const far=d>sl.nearR*(low?0.7:1),im=far?sl.farM:sl.near;
      if(im.count>=im.instanceMatrix.count)return null;
      let gy=H(x,z);
      if(sl.pad>0||TRUNK0[kind]){const e=0.6,gr=Math.max(Math.abs(H(x+e,z)-H(x-e,z)),Math.abs(H(x,z+e)-H(x,z-e)))/(2*e);gy-=0.06+0.45*gr}
      dummy.position.set(x,y+gy,z);dummy.rotation.set(0,rot,0);dummy.scale.set(sxz,sy,sxz);dummy.updateMatrix();
      im.setMatrixAt(im.count++,dummy.matrix);
      return sl;
    };
    // big boulders and outcrops first, so everything else keeps clear of them; sparse, and never on the spawn, a pond or a path
    const bio=(x,z)=>{const b=biomeAt(x,z,seed),sp=sstep01((Math.hypot(x,z)-8)/16),pd=sstep01((pondDist(x,z)-2)/9),k=sp*pd;return [b.m*sp,b.d*k]};
    // a stone you can step over has no collider; a climbable one is a dome you can land on; the rest are solid
    const addRock=(sl,x,z,sxz,sy,y)=>{
      if(!sl||!sl.ready||!sl.hh)return;
      const top=y+sl.hh*sy;if(top<STEP_MIN)return;
      const rg=sl.fp*sxz*0.85;
      rocks.push({x,z,rg,r:rg*0.96,y0:H(x,z),top,stand:top<=JUMP_TOP});
    };
    const bigRocks=[];
    const rockBlock=(x,z,m)=>{for(const r of bigRocks)if(Math.hypot(x-r.x,z-r.z)<r.r+m)return true;return false};
    for(let iz=-reach;iz<=reach;iz++)for(let ix=-reach;ix<=reach;ix++){
      const ox=(cx+ix)*16-8,oz=(cz+iz)*16-8;
      for(let j=0;j<5;j++)for(let i=0;i<5;i++){
        const x0=ox+1.6+i*3.2,z0=oz+1.6+j*3.2,R=k=>hr(x0,z0,seed,k);
        const x=x0+(R(101)-0.5)*3,z=z0+(R(102)-0.5)*3,dp=pondDist(x,z);
        if(R(103)>=(dp<16?0.03:0.011)*(low?0.7:1))continue;
        const sc=0.65+R(104)*0.8,fp=1.9*sc;
        if(dp<fp+2.5||pathDist(x,z)<fp+1.2||Math.hypot(x,z)<9+fp)continue;
        const big={x,z,r:fp,sc,rot:R(105)*6.283,sink:0.3+0.5*R(106),v:R(107),moss:R(108)<0.4};
        if(rockBlock(x,z,fp*0.6))continue;
        bigRocks.push(big);
        if(R(109)<0.5){      // an outcrop: a few smaller ones leaning on it
          const n=2+(R(110)*2|0);
          for(let k=0;k<n;k++){
            const a=R(111+k*3)*6.283,sc2=sc*(0.35+R(112+k*3)*0.35),fp2=1.9*sc2,d=fp*0.8+fp2*0.7,sx=x+Math.cos(a)*d,sz=z+Math.sin(a)*d;
            if(pondDist(sx,sz)<fp2+2||pathDist(sx,sz)<fp2+1)continue;
            bigRocks.push({x:sx,z:sz,r:fp2,sc:sc2,rot:R(113+k*3)*6.283,sink:0.2+0.4*R(114+k*3),v:R(115+k*3),moss:R(116+k*3)<0.4});
          }
        }
      }
    }
    for(const r of bigRocks){
      const sl=put(r.moss?'bigmoss':'bigrock',r.v,r.x,-r.sink*r.sc*1.4,r.z,r.sc,r.sc*(0.85+0.3*((r.v*7)%1)),r.rot);
      addRock(sl,r.x,r.z,r.sc,r.sc*(0.85+0.3*((r.v*7)%1)),-r.sink*r.sc*1.4);
    }
    for(let iz=-reach;iz<=reach;iz++)for(let ix=-reach;ix<=reach;ix++){
      const ox=(cx+ix)*16-8,oz=(cz+iz)*16-8;
      for(let j=0;j<5;j++)for(let i=0;i<5;i++){
        const x0=ox+1.6+i*3.2,z0=oz+1.6+j*3.2;
        const R=k=>hr(x0,z0,seed,k);
        const x=x0+(R(1)-0.5)*2.4,z=z0+(R(2)-0.5)*2.4;
        const dPath=pathDist(x,z),cf=clearField(x,z,seed);
        const [bm,bd]=bio(x,z);
        const clearing=(cf>CLEAR_AT+0.2*bd&&bd<0.6)||bm>0.5,dd=Math.hypot(x-mx,z-mz);
        // far trees thin out into the fog, sooner in the dense wood so it does not cost more than the rest
        const thin=dd>NEAR+13-9*bd?(dd>NEAR+28-14*bd?0.28-0.12*bd:0.5-0.2*bd):1;
        // trees: mostly fir, some oak, now and then a dead one
        const pt=(low?0.32:0.44)*(1+0.5*bd)*(low?1-0.45*bd:1)*(1-bm);
        const lone=bm>0.55&&R(3)>0.988&&dd<NEAR+20;       // a rare lone oak standing in the open
        if(!clearOf(x,z)&&dPath>1.7&&((!clearing&&R(3)<pt)||lone)&&R(10)<thin&&!rockBlock(x,z,0.9)){
          const kv=lone?0.7:bd>0.3?R(4)*0.85:R(4),kind=kv<0.6?'fir':kv<0.92?'oak':'snag',g=R(6),sc=(kind==='fir'?0.8:0.85)+g*g*0.65;
          const sl=put(kind,R(5),x,0,z,sc*(0.92+R(11)*0.16),sc,R(7)*6.283);
          if(sl)trees.push({x,z,s:sl,k:sc});
        }
        // shrubs: under the trees, thinner in the sun
        const sx=x0+(R(12)-0.5)*3,sz=z0+(R(13)-0.5)*3;
        if(pondDist(sx,sz)>0.9&&pathDist(sx,sz)>1&&R(14)<(clearing?0.1:0.26)*(1+0.5*bd)*(low?1-0.4*bd:1)*(1-0.85*bm)&&R(10)<thin&&!rockBlock(sx,sz,0.4))
          put('shrub',R(15),sx,0,sz,0.75+R(16)*0.8,0.75+R(17)*0.7,R(18)*6.283);
        // flower clumps: meadow clearings, round the ponds and beside the paths
        const fx=x0+(R(19)-0.5)*3,fz=z0+(R(20)-0.5)*3,dPf=pondDist(fx,fz),pf=pathDist(fx,fz);
        const [fm,fd]=bio(fx,fz),wf=Math.max(clearing?0.7:(dPf<6||pf<3.4)?0.45:0.04,fm*0.8)*(1-0.9*fd);
        if(dPf>1&&pf>0.8&&R(21)<wf*(low?0.7:1)){
          const kind=R(22)<0.5?'tulip':'daisy',s=1.1+R(23)*0.8;
          put(kind,R(24),fx,0,fz,s,s,R(25)*6.283);
          if((clearing||fm>0.5)&&R(26)<0.5+0.15*fm){const a=R(27)*6.283,s2=1+R(28)*0.7;put(R(29)<0.5?'tulip':'daisy',R(30),fx+Math.cos(a)*1.1,0,fz+Math.sin(a)*1.1,s2,s2,R(31)*6.283);
            if(fm>0.5&&R(120)<0.35){const a2=a+2.1+R(121),s3=0.9+R(122)*0.7;put(R(123)<0.5?'tulip':'daisy',R(124),fx+Math.cos(a2)*1.5,0,fz+Math.sin(a2)*1.5,s3,s3,R(125)*6.283)}}
        }
        // grass clumps: thick in meadows and on pond banks, sparse under the trees
        const [gm,gd]=bio(x0,z0);
        for(let g=0;g<(gm>0.5?5:4);g++){
          const kk=g<4?80+g*6:140+g*6,gx=x0+(hr(x0,z0,seed,kk)-0.5)*3.2,gz=z0+(hr(x0,z0,seed,kk+1)-0.5)*3.2,dpg=pondDist(gx,gz);
          const inMeadow=clearField(gx,gz,seed)>CLEAR_AT-0.05;
          const wg=Math.max(inMeadow?0.95:dpg<4.5?0.85:0.3,gm*0.86)*(1-0.85*gd*(dpg<4.5?0.5:1));
          if(dpg>0.5&&pathDist(gx,gz)>0.6&&hr(x0,z0,seed,kk+2)<wg*(low?0.55:1)){
            const s=2.4+hr(x0,z0,seed,kk+3)*1.6;
            put('grass',hr(x0,z0,seed,kk+4),gx,0,gz,s,s*(0.8+hr(x0,z0,seed,kk+5)*0.6),hr(x0,z0,seed,kk+6)*6.283);
          }
        }
        // loose stones
        const qx=x0+(R(32)-0.5)*3,qz=z0+(R(33)-0.5)*3;
        const [qm,qd]=bio(qx,qz);
        if(pondDist(qx,qz)>1.4&&pathDist(qx,qz)>1.1&&R(34)<0.075*(1+1.3*qd)*(1-0.45*qm)){
          const s=0.6+R(35)*0.9,mossy=R(36)<0.6+0.3*qd,sy=s*(0.8+R(38)*0.4);
          addRock(put(mossy?'mossrock':'boulder',R(37),qx,-0.2*s,qz,s,sy,R(39)*6.283),qx,qz,s,sy,-0.2*s);
        }
      }
    }
    for(const pd of ponds){
      const pi=pd.i*53;
      // a ring of stones round the water, open where the path arrives
      const toFrom=Math.atan2(pd.fz-pd.z,pd.fx-pd.x);
      for(let i=0;i<22;i++){
        const a=i/22*6.283+(hash2(i+pi,3,seed)-0.5)*0.18;
        if(Math.abs(Math.atan2(Math.sin(a-toFrom),Math.cos(a-toFrom)))<0.3)continue;
        const rad=pd.r+0.3+hash2(i+pi,5,seed)*0.7,big=hash2(i+pi,7,seed)<0.3,s=(big?0.65:0.42)+hash2(i+pi,9,seed)*0.4;
        put(hash2(i+pi,11,seed)<0.65?'mossrock':'boulder',hash2(i+pi,13,seed),pd.x+Math.cos(a)*rad,-0.2*s,pd.z+Math.sin(a)*rad,s,s*(0.7+hash2(i+pi,15,seed)*0.3),hash2(i+pi,17,seed)*6.283);
      }
      // reeds and cattails along the margin
      for(let i=0;i<(low?9:16);i++){
        const a=hash2(i+pi,21,seed)*6.283;
        if(Math.abs(Math.atan2(Math.sin(a-toFrom),Math.cos(a-toFrom)))<0.35)continue;
        const rad=pd.r-0.25+hash2(i+pi,23,seed)*1.3,s=0.85+hash2(i+pi,25,seed)*0.7;
        put('reed',hash2(i+pi,27,seed),pd.x+Math.cos(a)*rad,0,pd.z+Math.sin(a)*rad,s,s*(0.9+hash2(i+pi,29,seed)*0.3),hash2(i+pi,31,seed)*6.283);
      }
      // stepping stones along the path from where the way began
      const dx=pd.x-pd.fx,dz=pd.z-pd.fz,L=Math.hypot(dx,dz)||1,ux=dx/L,uz=dz/L;
      for(let k=0,d=2.3;d<L-pd.r-0.6;k++,d+=1.7+hash2(k+pi,2,seed)*0.5){
        const lat=(hash2(k+pi,4,seed)-0.5)*0.5;
        put('slab',hash2(k+pi,6,seed),pd.fx+ux*d-uz*lat,-0.07,pd.fz+uz*d+ux*lat,0.85+hash2(k+pi,8,seed)*0.3,0.45,hash2(k+pi,10,seed)*6.283);
      }
    }
    for(const s of slots){s.near.instanceMatrix.needsUpdate=true;s.farM.instanceMatrix.needsUpdate=true}
  }
  // bake in idle slices, one prop at a time; each lands in its InstancedMesh pair as soon as it is ready
  const bake={t0:performance.now(),ms:0,done:0,total:BAKE_ORDER.length,cached:0,log:[]};
  const applyProp=(sl,p)=>{
    sl.near.geometry=p.near;sl.farM.geometry=p.far;sl.ready=true;
    const r=trunkRadius(p.near);if(r>0&&TRUNK0[sl.kind])sl.r=r;
    if(ROCKY.has(sl.kind)){if(!p.near.boundingBox)p.near.computeBoundingBox();const bb=p.near.boundingBox;sl.fp=(bb.max.x-bb.min.x+bb.max.z-bb.min.z)/4;sl.hh=bb.max.y;chunkX=1e9}
    sl.tris=[p.near.attributes.position.count/3,p.far.attributes.position.count/3];
  };
  (async()=>{
    for(const id of BAKE_ORDER){
      if(deadClear)return;
      const sl=slotById[id];
      try{
        const t=performance.now(),p=await getProp(sl.bake,sl.pseed,Object.assign({sliceMs:5},sl.opts));
        if(deadClear)return;
        applyProp(sl,p);bake.done++;if(p.stats&&p.stats.cached)bake.cached++;bake.log.push([id,Math.round(performance.now()-t)]);
      }catch(e){console.warn('still wood bake',id,e);bake.done++}
    }
    bake.ms=performance.now()-bake.t0;S.ready=true;
  })();

  const door=makeDoor();group.add(door);
  S={t:0,yaw:0,pitch:0,bloom:0.18,seed,pinned:false,hold:0,said:0,doorX:0,doorZ:4.2,doorFace:0,ready:false,bake,mist:0,shim:0,water:false,direct:false,fill:0};
  S.ponds=()=>ponds.map(p=>({...p}));
  S.dims=()=>slots.filter(s=>s.ready).map(s=>{const g=s.near.geometry;if(!g.boundingBox)g.computeBoundingBox();const b=g.boundingBox;return {id:s.id,w:+(b.max.x-b.min.x).toFixed(2),h:+(b.max.y-b.min.y).toFixed(2),y0:+b.min.y.toFixed(2),d:+(b.max.z-b.min.z).toFixed(2)}});
  S.byKind=()=>{const o={};for(const s of slots){const nt=s.near.geometry.attributes.position.count/3,ft=s.farM.geometry.attributes.position.count/3;const a=o[s.kind]||(o[s.kind]={near:0,far:0,ni:0,fi:0});a.near+=Math.round(s.near.count*nt);a.far+=Math.round(s.farM.count*ft);a.ni+=s.near.count;a.fi+=s.farM.count}return o};
  S.H=H;S.rockList=()=>rocks.map(r=>({...r}));
  S.treeList=()=>trees.map(t=>({x:t.x,z:t.z,kind:t.s.kind,k:t.k}));
  // ground for the walker: the hills plus the top of every climbable stone
  const G=(x,z)=>{
    let g=H(x,z);
    for(const r of rocks){if(!r.stand)continue;const y=rockSurface(r,x,z);if(y>g)g=y}
    return g;
  };
  S.G=G;
  const blockedAt=(x,z)=>trunkAt(x,z)||rocks.some(r=>(r.x-x)**2+(r.z-z)**2<(r.rg+0.9)**2);
  const walker=createRoomWalker({o,eye:EYE,x:0,z:0,groundAt:G,snap:0.7,collide:b=>{
    for(const t of trees){
      const dx=b.x-t.x,dz=b.z-t.z,d=Math.hypot(dx,dz),m=0.32+treeR(t);
      if(d<m&&d>1e-4){b.x=t.x+dx/d*m;b.z=t.z+dz/d*m}
    }
    for(const t of rocks){
      if(t.stand){const q=rockPush(t,b.x,b.z,b.y);if(q){b.x=q[0];b.z=q[1]}continue}
      const dx=b.x-t.x,dz=b.z-t.z,d=Math.hypot(dx,dz),m=0.32+t.r;
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
    return {tris:Math.round(near+far),nearTris:Math.round(near),farTris:Math.round(far),nearInst:n,farInst:f,trees:trees.length,rocks:rocks.length,ponds:ponds.length,ready:S.ready,bake};
  };
  const poseDoor=()=>{
    door.position.set(S.doorX,H(S.doorX,S.doorZ),S.doorZ);
    door.rotation.y=Math.PI-S.doorFace;
  };
  setPonds(ponds);
  rebuild(0,0);
  Object.assign(S,placeBehind(0,0,0,STILL.behind,trunkAt));
  S.doorX=S.x;S.doorZ=S.z;S.doorFace=S.face;poseDoor();

  const addPond=np=>{
    const list=[...ponds,np];while(list.length>STILL.pondMax)list.shift();
    setPonds(list);rebuild(Math.round(b.x/16),Math.round(b.z/16));
  };
  S.snap=()=>({sd:seed,x:+b.x.toFixed(2),z:+b.z.toFixed(2),y:+b.y.toFixed(2),yaw:+S.yaw.toFixed(3),pitch:+S.pitch.toFixed(3),dx:+S.doorX.toFixed(2),dz:+S.doorZ.toFixed(2),face:+S.doorFace.toFixed(3),pin:S.pinned?1:0,
    po:ponds.map(p=>[p.x,p.z,p.r,p.fx,p.fz,p.i])});
  S.apply=q=>{
    if(![q.x,q.z,q.y,q.yaw,q.pitch,q.dx,q.dz,q.face].every(Number.isFinite))return;
    S.yaw=q.yaw;S.pitch=clamp(q.pitch,-MOVE.roomPitch,MOVE.roomPitch);
    camY=null;S.doorX=q.dx;S.doorZ=q.dz;S.doorFace=q.face;S.pinned=!!q.pin;
    if(Array.isArray(q.po)&&q.po.length>=1&&q.po.length<=STILL.pondMax){
      const list=q.po.filter(a=>Array.isArray(a)&&a.length>=6&&a.slice(0,6).every(Number.isFinite)).map(a=>({x:a[0],z:a[1],r:clamp(a[2],3,8),fx:a[3],fz:a[4],i:Math.max(0,a[5]|0)}));
      const same=list.length===ponds.length&&list.every((p,k)=>p.i===ponds[k].i&&p.x===ponds[k].x&&p.z===ponds[k].z);
      if(list.length&&!same){setPonds(list);S.mist=2.4}
    }
    walker.watch(0.1,q.x,q.z,clamp(q.y,-12,14));
  };
  let scryFlip=0,camY=null;
  S.frame=()=>{
    // the scrying image only matters when water is in view and you look toward it: skip it otherwise
    const near=nearestPond(b.x,b.z),nd=Math.hypot(b.x-near.x,b.z-near.z)-near.r;
    if(S.pitch>0.05&&nd>6||nd>40)return;
    if((scryFlip^=1)&&S.pitch>-0.5&&nd>3)return;
    const eyeY=EYE+camY+bobY(b,walker.scale);
    scryCam.position.set(b.x,eyeY,b.z);
    scryCam.lookAt(S.doorX,H(S.doorX,S.doorZ)+1.15,S.doorZ);
    scryCam.updateMatrixWorld();
    for(const sl of pslots)sl.water.visible=false;
    const prev=renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene,scryCam);
    renderer.setRenderTarget(prev);
    for(const sl of pslots)sl.water.visible=true;
  };
  S.update=(dt,input)=>{
    S.t+=dt;let moving=false;
    if(!A.watching){
      lookStep(S,dt,input.lx,input.ly,MOVE.roomPitch);
      const ox=b.x,oz=b.z;
      walker.step(dt,input,S.yaw);
      moving=Math.hypot(b.x-ox,b.z-oz)>dt*0.4;
      rebuild(Math.round(b.x/16),Math.round(b.z/16));
      // another pond, a long walk on
      const last=ponds[ponds.length-1];
      if(pondSpawnDue(b.x,b.z,last)){
        addPond(pondSpawnAt({seed,index:last.i+1,x:b.x,z:b.z,yaw:S.yaw,ponds}));
        S.mist=2.4;
        o.tone(392,0.6,'sine',0.03,0,-90);
      }
      const sim={
        x:b.x,z:b.z,yaw:S.yaw,pitch:S.pitch,eye:EYE+b.y,aspect:cam.aspect||16/9,
        door:{x:S.doorX,z:S.doorZ,y:H(S.doorX,S.doorZ),face:S.doorFace},
        ponds,pinned:S.pinned,hold:S.hold,blocked:blockedAt,groundAt:H,
      };
      stillStep(sim,dt);
      S.pinned=sim.pinned;S.hold=sim.hold;S.doorX=sim.door.x;S.doorZ=sim.door.z;S.doorFace=sim.door.face;
      S.water=sim.water;S.direct=sim.direct;S.fill=sim.fill;S.hidden=sim.hidden;
      if(S.pinned&&b.y-G(b.x,b.z)<1.4&&crossedDoor(ox,oz,b.x,b.z,sim.door)){
        finish({k:'leave',why:'stillwood'});return;
      }
      // a quiet cue when the door becomes watched or lets go
      if(sim.locked){S.shim=1.2;o.tone(494,0.5,'sine',0.03,0,-160);o.tone(740,0.7,'sine',0.014,0.1);}
      else if(sim.released){o.tone(330,0.4,'sine',0.018,0,90);}
      const near=pondDist(b.x,b.z)<14;
      o.hud(A.watching?'<small>'+(A.label||'')+'</small>':'');   // no instructions: the room is discovered, not explained
      if(near&&!A.watching&&Math.floor(S.t)%5===0&&S.t%5<dt)o.tone(880+Math.sin(S.t)*40,0.12,'sine',0.015);
    }else{
      o.hud('<small>'+(A.label||'')+'</small>');
      moving=true;
    }
    S.shim=Math.max(0,(S.shim||0)-dt);
    if(S.mist>0){S.mist=Math.max(0,S.mist-dt);scene.fog.density=fogD*(1+1.1*Math.sin(Math.PI*S.mist/2.4))}
    poseDoor();door.visible=!S.hidden;
    ground.position.x=b.x;ground.position.z=b.z;
    UT.value=S.t;
    updatePonds(dt,b,moving);
    // the eye follows the feet smoothly on the ground (stepping onto or off a stone does not pop) and exactly in the air
    if(camY===null||b.y>G(b.x,b.z)+0.05||Math.abs(b.y-camY)>3)camY=b.y;else camY+=(b.y-camY)*Math.min(1,dt*16);
    cam.position.set(b.x,EYE+camY+bobY(b,walker.scale),b.z);
    cam.rotation.set(S.pitch,-S.yaw,0,'YXZ');
  };
  onClear(()=>{
    deadClear=true;scene.background=prevBg;rt.dispose();
    const gs=new Set([ground.geometry,padGeo,cupGeo,waterGeo,...Object.values(holders)]);
    for(const s of slots){gs.add(s.near.geometry);gs.add(s.farM.geometry);s.near.dispose();s.farM.dispose()}
    for(const g of gs)g.dispose();
    for(const m of Object.values(M))m.dispose();
    ground.material.dispose();padMat.dispose();cupMat.dispose();moteTex.dispose();
    for(const sl of pslots){sl.mat.dispose();sl.beam.geometry.dispose();sl.beam.material.dispose();sl.motes.geometry.dispose();sl.motes.material.dispose();sl.pads.dispose();sl.cups.dispose()}
  });
  return S;
}
