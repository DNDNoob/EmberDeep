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
  freezeReach:12, freezeFill:0.4, freezeN:5, freezeSpan:0.8, freezeDwell:0.5,
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
// how high one jump lifts the feet (m): scales with the room walker like the jump does. Landing needs a surface no higher than feet + this.
export const jumpReach=(eye=EYE)=>MOVE.jumpV*MOVE.jumpV/(2*MOVE.gravity)*scaleFor(eye);
// highest top (m above the ground at its foot) a standing jump clears, less a hair
export const jumpTop=(eye=EYE)=>0.97*jumpReach(eye);
const JUMP_TOP=jumpTop(EYE);
export const STEP_MIN=0.35;     // lower than this and a stone is just stepped over
// ---- every stone is standable: its real top is sampled from the baked mesh into a small height grid (per variant) ----
// pos: Float32Array of xyz triples (triangle list, or indexed when `index` is given). Returns {x0,z0,cw,cd,N,h,top,w,d}.
export function heightGrid(pos,index,N=0){
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(let i=0;i<pos.length;i+=3){x0=Math.min(x0,pos[i]);x1=Math.max(x1,pos[i]);z0=Math.min(z0,pos[i+2]);z1=Math.max(z1,pos[i+2])}
  const w=x1-x0,d=z1-z0;if(!N)N=Math.max(12,Math.min(40,Math.ceil(Math.max(w,d)/0.12)));
  const cw=w/N||1,cd=d/N||1,h=new Float32Array(N*N);let top=0;
  const tri=(ax,ay,az,bx,by,bz,cx,cy,cz)=>{
    const i0=Math.max(0,Math.floor((Math.min(ax,bx,cx)-x0)/cw)),i1=Math.min(N-1,Math.floor((Math.max(ax,bx,cx)-x0)/cw));
    const j0=Math.max(0,Math.floor((Math.min(az,bz,cz)-z0)/cd)),j1=Math.min(N-1,Math.floor((Math.max(az,bz,cz)-z0)/cd));
    const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
      const px=x0+(i+0.5)*cw,pz=z0+(j+0.5)*cd;
      let y=-1e9;
      if(Math.abs(den)>1e-12){
        const l1=((bz-cz)*(px-cx)+(cx-bx)*(pz-cz))/den,l2=((cz-az)*(px-cx)+(ax-cx)*(pz-cz))/den,l3=1-l1-l2;
        if(l1>=-1e-6&&l2>=-1e-6&&l3>=-1e-6)y=l1*ay+l2*by+l3*cy;
      }
      if(y>h[j*N+i])h[j*N+i]=y;
    }
  };
  const n=index?index.length:pos.length/3;
  for(let t=0;t<n;t+=3){
    const a=index?index[t]*3:t*3,b=index?index[t+1]*3:(t+1)*3,c=index?index[t+2]*3:(t+2)*3;
    tri(pos[a],pos[a+1],pos[a+2],pos[b],pos[b+1],pos[b+2],pos[c],pos[c+1],pos[c+2]);
  }
  for(let i=0;i<pos.length;i+=3){   // slivers that miss every cell centre still count in the cell they sit in
    const ci=Math.min(N-1,Math.max(0,Math.floor((pos[i]-x0)/cw))),cj=Math.min(N-1,Math.max(0,Math.floor((pos[i+2]-z0)/cd)));
    if(pos[i+1]>h[cj*N+ci])h[cj*N+ci]=pos[i+1];
  }
  for(let i=0;i<h.length;i++)if(h[i]>top)top=h[i];
  return {x0,z0,cw,cd,N,h,top,w,d};
}
// an ellipsoid dome (half-width w/2, depth d/2, height hgt) as a grid: for tests
export function domeGrid(w,d,hgt,N=24){
  const h=new Float32Array(N*N);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const u=((i+0.5)/N-0.5)*2,v=((j+0.5)/N-0.5)*2,q=u*u+v*v;h[j*N+i]=q<1?hgt*Math.sqrt(1-q):0}
  return {x0:-w/2,z0:-d/2,cw:w/N,cd:d/N,N,h,top:hgt,w,d};
}
// a placed stone: grid + pose. y0 = ground height at its foot, yo = vertical offset (negative when sunk), rot about Y, sxz/sy scale.
export function makeRock(grid,{x,z,rot=0,sxz=1,sy=1,y0=0,yo=0}){
  const c=Math.cos(rot),s=Math.sin(rot),lcx=grid.x0+grid.w/2,lcz=grid.z0+grid.d/2;
  const cx=x+(lcx*c+lcz*s)*sxz,cz=z+(-lcx*s+lcz*c)*sxz;
  return {x,z,rot,sxz,sy,y0,yo,grid,cx,cz,rb:0.5*Math.hypot(grid.w,grid.d)*sxz+0.3,top:yo+grid.top*sy,c,s};
}
// absolute height of the stone's top surface at (x,z), or -Infinity beyond its footprint (bilinear between grid cells)
export function rockSurface(r,x,z){
  const dx=x-r.x,dz=z-r.z,g=r.grid;
  const lx=(dx*r.c-dz*r.s)/r.sxz,lz=(dx*r.s+dz*r.c)/r.sxz;
  const u=(lx-g.x0)/g.cw-0.5,v=(lz-g.z0)/g.cd-0.5;
  if(u<-1||v<-1||u>g.N||v>g.N)return -Infinity;
  const i=Math.floor(u),j=Math.floor(v),fu=u-i,fv=v-j,N=g.N;
  const at=(a,b)=>a<0||b<0||a>=N||b>=N?0:g.h[b*N+a];
  const hl=(at(i,j)*(1-fu)+at(i+1,j)*fu)*(1-fv)+(at(i,j+1)*(1-fu)+at(i+1,j+1)*fu)*fv;
  return r.y0+r.yo+hl*r.sy;
}
// A body with feet at `y` cannot walk up more than `tol` onto a stone: if the surface under it is higher, push it outward
// (away from the stone's middle) to the nearest spot where it is not. Airborne bodies above the surface are not touched.
export function rockPush(r,bx,bz,y,tol=0.12){
  if((bx-r.cx)**2+(bz-r.cz)**2>r.rb*r.rb)return null;
  if(rockSurface(r,bx,bz)-y<=tol)return null;
  let dx=bx-r.cx,dz=bz-r.cz;const d0=Math.hypot(dx,dz);
  if(d0<1e-4){dx=1;dz=0}else{dx/=d0;dz/=d0}
  for(let t=d0;t<r.rb+0.6;t+=0.06){
    const px=r.cx+dx*t,pz=r.cz+dz*t;
    if(rockSurface(r,px,pz)-y<=tol)return [px,pz];
  }
  return [r.cx+dx*(r.rb+0.6),r.cz+dz*(r.rb+0.6)];
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
// Points that cover the whole door (a box: frame width, thickness, height): corners, edge midpoints and the middle.
const DOOR_T=0.14;
export function doorPoints(door){
  const fc=door.face||0,c=Math.cos(fc),sn=Math.sin(fc),y0=door.y||0,pts=[];
  for(const u of [-STILL.doorHalf,0,STILL.doorHalf])for(const w of [-DOOR_T,0,DOOR_T])for(const h of [0,STILL.doorH/2,STILL.doorH]){
    pts.push([door.x+c*u+sn*w,y0+h,door.z+sn*u-c*w]);
  }
  return pts;
}
// Is any part of the door on screen? Every point of its box is tested against the real camera frustum (margin in radians).
export function doorSeen(eye,yaw,pitch,door,fov=viewFov(),margin=STILL.seeMargin){
  const hd=Math.hypot(door.x-eye[0],door.z-eye[2]);
  if(hd<1.6)return true;           // standing at (or very near) the doorway
  if(hd>45)return false;
  const f=lookDir(yaw,pitch),rx=Math.cos(yaw),rz=Math.sin(yaw);   // right = (cos yaw, 0, sin yaw)
  const ux=-Math.sin(pitch)*Math.sin(yaw),uy=Math.cos(pitch),uz=Math.sin(pitch)*Math.cos(yaw);
  for(const p of doorPoints(door)){
    const vx=p[0]-eye[0],vy=p[1]-eye[1],vz=p[2]-eye[2];
    const zc=vx*f[0]+vy*f[1]+vz*f[2];if(zc<=0.02)continue;
    const xc=vx*rx+vz*rz,yc=vx*ux+vy*uy+vz*uz;
    if(Math.abs(Math.atan2(xc,zc))<fov.h/2+margin&&Math.abs(Math.atan2(yc,zc))<fov.v/2+margin)return true;
  }
  return false;
}
// The 3x3 fan of view rays (spread over most of the screen): the fraction that strike pond water within `reach` metres,
// and whether the centre ray does.
export function waterRays(eye,yaw,pitch,ponds,fov=viewFov(),reach=STILL.waterReach,n=3,span=0.6){
  let hit=0,centre=false;const mid=(n-1)/2;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const ox=(i-mid)/mid*span,oy=(j-mid)/mid*span;
    const dir=lookDir(yaw+ox*fov.h/2,clamp(pitch+oy*fov.v/2,-1.5,1.5));
    for(const p of ponds)if(rayHitsPond(eye,dir,p,STILL.waterY,reach)){hit++;if(i===mid&&j===mid)centre=true;break}
  }
  return {fill:hit/(n*n),centre};
}
export function waterFill(eye,yaw,pitch,ponds,fov=viewFov(),reach=STILL.waterReach){return waterRays(eye,yaw,pitch,ponds,fov,reach).fill}
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
// One simulation step. s = {x,z,eye,yaw,pitch,aspect?,door:{x,z,y?,face},ponds:[{x,z,r,wy?}] (or pond),pinned,hold,dwell}
// The door is frozen in world space while the player SEES it: its reflection or the real door inside the camera frustum.
// Freezing is deliberate: the pond must be close (freezeReach) and fill the view (centre ray on water and at least freezeFill of the
// fan) for a short unbroken dwell. Once frozen it holds while any water (waterFill within waterReach) or the door is in view, with no dwell.
// The instant neither holds (after a tiny grace against flicker) it slips back directly behind the player.
// (s.eye, yaw and pitch must be the pose the camera will actually render with this frame.)
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
    s.dwell=0;
  }
  if(!s.pinned){
    // free: pond, you and the door in a straight line with you in the middle
    const p=placeLine(s.x,s.z,nearestOf(ponds,s.x,s.z),s.yaw,s.behind??STILL.behind,s.blocked);
    s.door.x=p.x;s.door.z=p.z;s.door.face=p.face;
    if(s.groundAt)s.door.y=s.groundAt(p.x,p.z);
    // any part of the spot on screen hides the door (never counted as seen) until it leaves the view: it cannot pop in ahead of you
    s.hidden=doorSeen(eye,s.yaw,s.pitch,s.door,fov,margin+(s.hidePad??STILL.hidePad));
    const wr=waterRays(eye,s.yaw,s.pitch,ponds,fov,s.freezeReach??STILL.freezeReach,STILL.freezeN,STILL.freezeSpan);
    const want=wr.centre&&wr.fill>=(s.freezeFill??STILL.freezeFill)-1e-9&&!s.hidden;
    s.dwell=want?(s.dwell||0)+dt:0;
    if(s.dwell>=(s.freezeDwell??STILL.freezeDwell)-1e-9){s.pinned=true;s.locked=true;s.hold=s.grace??STILL.grace;s.dwell=0}
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
export const HILL={amp1:4.6,len1:64,amp2:1.3,len2:30,flat0:5,flat1:14,pondFlat0:1.5,pondFlat1:9,dish:0.35,rag:1.6};
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
    const d=Math.hypot(x-p.x,z-p.z)-HILL.rag*(vnoise(x/3.5,z/3.5,seed^0x1357)-0.5);   // an irregular shoreline
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
  {kind:'fir',n:3,cap:[90,260],far:60,near:12.5,opts:{palette:{leaf:'#3f7058',leaf2:'#72a06f',leafD:'#274a3c'}}},
  {kind:'shrub',n:2,cap:[110,130],far:34,near:14,opts:{palette:{leaf:'#4a7a42',leaf2:'#80a652',leafD:'#2d5330'}}},
  {kind:'mossrock',n:2,cap:[60,70],far:44,near:15,opts:{palette:{moss:'#4f6e38',moss2:'#78914a',mossD:'#334d2a'}}},
  {kind:'oak',n:2,cap:[50,150],far:60,near:13,opts:{palette:{leaf:'#5b8040',leaf2:'#93b055',leafD:'#3d5e30'}}},
  {kind:'grass',n:3,cap:[110,200],far:24,near:9,opts:{palette:{base:'#3a5c2c',leaf:'#74a03c',tip:'#c6d062'}}},
  {kind:'tulip',n:1,cap:[110,60],far:24,near:10},
  {kind:'daisy',n:1,cap:[110,60],far:24,near:10},
  {kind:'reed',bake:'grass',n:2,cap:[40,40],far:44,near:14,opts:{tall:true}},
  {kind:'slab',n:2,cap:[24,12],far:36,near:18,opts:{size:0.9}},
  {kind:'boulder',n:1,cap:[40,60],far:44,near:15},
  {kind:'bigrock',bake:'boulder',n:2,cap:[14,30],far:66,near:22,opts:{size:4.5,budget:{near:5000,far:900}}},
  {kind:'bigmoss',bake:'mossrock',n:1,cap:[10,20],far:66,near:22,opts:{size:4.5,budget:{near:5000,far:900},palette:{moss:'#4f6e38',moss2:'#78914a',mossD:'#334d2a'}}},
  {kind:'snag',n:1,cap:[40,80],far:60,near:14},
];
const REFL_SKIP=new Set(['grass','tulip','daisy','slab','reed']);
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
const TERR_GLSL=`uniform int uSeedA;uniform int uSeedB;uniform int uSeedP;uniform vec4 uPondsT[3];
float hsI(ivec2 c,int sd){uint h=(uint(c.x)*374761393u)^(uint(c.y)*668265263u)^uint(sd);h=(h^(h>>13))*1274126177u;return float(h^(h>>16))/4294967296.0;}
float vnI(vec2 q,int sd){vec2 i=floor(q),f=q-i;f=f*f*(3.-2.*f);ivec2 c=ivec2(i);return mix(mix(hsI(c,sd),hsI(c+ivec2(1,0),sd),f.x),mix(hsI(c+ivec2(0,1),sd),hsI(c+ivec2(1,1),sd),f.x),f.y);}
float terrH(vec2 p){
  float h=(vnI(p/${HILL.len1.toFixed(1)},uSeedA)-.5)*2.*${HILL.amp1.toFixed(2)}+(vnI(p/${HILL.len2.toFixed(1)},uSeedB)-.5)*2.*${HILL.amp2.toFixed(2)};
  float t=clamp((length(p)-${HILL.flat0.toFixed(1)})/${(HILL.flat1-HILL.flat0).toFixed(1)},0.,1.);h*=t*t*(3.-2.*t);
  for(int i=0;i<3;i++){vec4 q=uPondsT[i];float d=length(p-q.xy)-${HILL.rag.toFixed(2)}*(vnI(p/3.5,uSeedP)-.5);
    float u=clamp((d-(q.z+${HILL.pondFlat0.toFixed(1)}))/${(HILL.pondFlat1-HILL.pondFlat0).toFixed(1)},0.,1.);h+=(q.w-h)*(1.-u*u*(3.-2.*u));
    float v=clamp((d-(q.z-2.))/2.2,0.,1.);h-=${HILL.dish.toFixed(2)}*(1.-v*v*(3.-2.*v));}
  return h;}`;
// ground: moss, meadow, leaf litter, dirt paths and sandy muddy banks, all from world position so it can follow the player; up to 3 ponds
function groundMaterial(Q,seed,U3){
  const m=Q===0?new THREE.MeshLambertMaterial({color:0xffffff}):new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
  const U=Object.assign({uSeed:{value:(seed^0x51ed)|0},uSeedA:{value:(seed^0x7a11)|0},uSeedB:{value:(seed^0x3c9d)|0},uSeedP:{value:(seed^0x1357)|0},uSeedC:{value:(seed^0xb10e)|0},uSeedD:{value:(seed^0x2f1d)|0}},U3);
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,U);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vW;varying float vH;\n'+TERR_GLSL)
      .replace('#include <beginnormal_vertex>',`vec3 objectNormal;{vec2 w0=(modelMatrix*vec4(position,1.0)).xz;float e=.7;
  objectNormal=normalize(vec3(terrH(w0-vec2(e,0.))-terrH(w0+vec2(e,0.)),2.*e,terrH(w0-vec2(0.,e))-terrH(w0+vec2(0.,e))));}`)
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvW=(modelMatrix*vec4(position,1.0)).xz;transformed.y+=terrH(vW);vH=transformed.y;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vW;varying float vH;uniform vec4 uPondsT[3];uniform int uSeedP;uniform int uSeed;uniform int uSeedC;uniform int uSeedD;uniform vec3 uPonds[3];uniform vec4 uSegs[3];
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
  float hA=1e9,dn=1e9,dp=1e9;
  for(int i=0;i<3;i++){
    vec4 q=uPondsT[i];if(length(vW-q.xy)<q.z+9.){hA=min(hA,vH-(q.w-.04));dn=min(dn,length(vW-q.xy)-q.z-${HILL.rag.toFixed(2)}*(vnB(vW/3.5,uSeedP)-.5));}
    vec4 sg=uSegs[i];vec2 ab=sg.zw-sg.xy;float t=clamp(dot(vW-sg.xy,ab)/max(dot(ab,ab),1e-3),0.,1.);
    dp=min(dp,length(vW-sg.xy-ab*t));
  }
  dp+=(vn(vW*2.)-.5)*.5;
  c=mix(c,vec3(.115,.085,.05)*(.8+.4*vn(vW*8.)),(1.-smoothstep(.3,.95,dp))*.55);
  // the bank: height above the water decides it, so it follows the irregular shore. Dark mud at the waterline, a pale silt rim, mossy damp above.
  float nb=vn(vW*2.2)-.5;
  c=mix(c,vec3(.03,.05,.03),(1.-smoothstep(.2,2.4,dn+nb*.8))*.4);
  c=mix(c,vec3(.19,.16,.095)*(.85+.3*vn(vW*10.)),smoothstep(-.1,.15,dn+nb*.2)*(1.-smoothstep(.3,.75,dn+nb*.3))*.5);
  float wet=1.-smoothstep(.0,.6,dn+nb*.25);
  c=mix(c,vec3(.045,.036,.024)*(.8+.5*vn(vW*9.)),wet*.85);
  diffuseColor.rgb=c;
}`);
  };
  m.customProgramCacheKey=()=>'stillground'+Q;
  return m;
}

// ---- the pond as a magic standing mirror (pure) ----
// Reflect the ground point (x,z) through the vertical plane that stands m metres from the pond centre (cx,cz) toward the player at (px,pz) and faces them:
// with the player 4.2 m in front of the door on the pond - player - door line, the door's image lands 4.2 m behind the player's image.
export function mirrorPoint(cx,cz,px,pz,x,z,m=0){
  let ux=px-cx,uz=pz-cz;const L=Math.hypot(ux,uz);if(L<1e-6)return null;ux/=L;uz/=L;
  const k=2*((x-cx)*ux+(z-cz)*uz-m);   // m: how far from the pond's middle toward the player the mirror stands
  return [x-k*ux,z-k*uz];
}
// the same reflection for a yaw (heading) so a mirrored figure turns the way a reflection does
export function mirrorYaw(cx,cz,px,pz,yaw){
  let ux=px-cx,uz=pz-cz;const L=Math.hypot(ux,uz);if(L<1e-6)return yaw;ux/=L;uz/=L;
  const hx=Math.sin(yaw),hz=-Math.cos(yaw),k=2*(hx*ux+hz*uz);
  return Math.atan2(hx-k*ux,-(hz-k*uz));
}
// a plain traveller (feet at y 0, eye at 1.6) that exists only in the reflection pass: legs swing from the hips with `walk`
function makeBody(Q){
  const mat=c=>Q===0?new THREE.MeshLambertMaterial({color:c,emissive:c,emissiveIntensity:0.25}):new THREE.MeshStandardMaterial({color:c,roughness:0.9,metalness:0,emissive:c,emissiveIntensity:0.25});
  const root=new THREE.Group(),cloak=mat(0x56765f),cloth=mat(0x7a6a46),skin=mat(0xd8b48c),boot=mat(0x2c2218),trim=mat(0xb8c8a0);
  const box=(w,h,d,x,y,z,m,par=root)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);par.add(o);return o};
  const legs=[-1,1].map(sd=>{const g=new THREE.Group();g.position.set(sd*0.1,0.88,0);root.add(g);box(0.15,0.62,0.17,0,-0.31,0,cloth,g);box(0.16,0.2,0.24,0,-0.76,-0.03,boot,g);return g});
  box(0.44,0.6,0.26,0,1.2,0,cloak);box(0.5,0.12,0.3,0,1.5,0,cloak);box(0.3,0.5,0.04,0,1.2,-0.14,trim);
  box(0.5,0.5,0.22,0,0.9,0.1,cloak);                                   // the cloak hangs behind
  const arms=[-1,1].map(sd=>{const g=new THREE.Group();g.position.set(sd*0.3,1.46,0);root.add(g);box(0.11,0.56,0.13,0,-0.28,0,cloak,g);box(0.1,0.1,0.11,0,-0.6,0,skin,g);return g});
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.125,10,8),skin);head.position.set(0,1.64,0);root.add(head);
  box(0.28,0.1,0.28,0,1.74,0.01,cloak);
  root.userData={legs,arms};
  root.traverse(o=>o.layers.set(1));
  return root;
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

  // the water mirrors the real scene: the main camera is mirrored about the pond's water plane and drawn into this target (reduced resolution)
  const reflH=low?176:288;
  const rt=new THREE.WebGLRenderTarget(Math.round(reflH*16/9),reflH,{depthBuffer:true});
  const vcam=new THREE.PerspectiveCamera();vcam.layers.enable(1);   // layer 1: things that exist only in the reflection (the player's double, the door's image)
  const texM=new THREE.Matrix4(),reflU={value:texM};
  const TW={value:0};  // water clock, shared by every pond's material

  // a pond's dressing: water, light shaft, lily pads and flowers, drifting motes. Three slots; pond index i uses slot i%3.
  const moteTex=(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),gr=g.createRadialGradient(16,16,0,16,16,16);
    gr.addColorStop(0,'rgba(255,255,235,1)');gr.addColorStop(0.35,'rgba(230,255,200,0.5)');gr.addColorStop(1,'rgba(230,255,200,0)');g.fillStyle=gr;g.fillRect(0,0,32,32);
    const t=new THREE.CanvasTexture(c);return t})();
  const waterVS=`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
  // depth comes from the real terrain under the water (same maths as the ground), so the shoreline is soft and follows the bank, the bed shows
  // through the shallows and fades to dark in the middle; the mirror image is the planar reflection, tinted and darkened.
  const waterFS=TERR_GLSL+`uniform sampler2D uRefl;uniform mat4 uTex;uniform float uReflOn;uniform float uTime;uniform vec2 uCenter;uniform float uR;uniform vec4 uRip[4];uniform vec3 uFog;uniform float uFogD;uniform float uQ;uniform float uShim;
    varying vec3 vW;
    float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    float wave(vec2 p,float t){return vn(p*1.7+vec2(t*.06,t*.04))*.5+vn(p*4.3+vec2(-t*.09,t*.07))*.3+vn(p*11.+vec2(t*.17,-t*.13))*.2;}
    void main(){
      vec2 p=vW.xz;
      float depth=vW.y-terrH(p);
      if(depth<.003)discard;
      vec3 Vv=cameraPosition-vW;float dist=length(Vv);vec3 V=Vv/dist;
      float rp=0.;vec2 rd=vec2(0.);
      for(int i=0;i<4;i++){vec4 r=uRip[i];float age=uTime-r.z;
        if(age>0.&&age<4.5){vec2 q=p-r.xy;float dq=length(q);float rad=age*0.85;float e=(dq-rad)*5.;
          float w=exp(-e*e)*r.w*(1.-age/4.5)*sin((dq-rad)*20.);rp+=w;rd+=q/(dq+1e-3)*w;}}
      // surface normal: broad swell + fine ripples (noise slopes) + the rings
      float e=.1,w0=wave(p,uTime),wx=wave(p+vec2(e,0.),uTime),wz=wave(p+vec2(0.,e),uTime);
      vec2 sl=vec2(w0-wx,w0-wz)/e*.045+vec2(sin(p.x*3.1+uTime*.9)+.5*sin(p.x*7.3+p.y*5.1+uTime*1.7),sin(p.y*3.7+uTime*.8)+.5*sin(p.y*6.7-p.x*4.3+uTime*1.5))*.012+rd*.05;
      vec3 N=normalize(vec3(sl.x,1.,sl.y));
      float cosv=clamp(dot(N,V),0.,1.);
      // mirror image
      vec4 pc=uTex*vec4(vW,1.);vec2 ruv=pc.xy/pc.w+N.xz*.07/(1.+dist*.08);
      vec3 treeC=mix(vec3(.045,.1,.07),uFog,.5);
      vec3 refl=uReflOn>.5?texture2D(uRefl,ruv).rgb*vec3(.8,.93,.86):mix(treeC,uFog,.6);
      // what lies under the surface: the bed (silt, stones) seen through the shallows, nothing but dark in the middle
      vec2 bp=p+N.xz*.18;
      float st=smoothstep(.6,.7,vn(bp*6.5+3.)),sj=vn(bp*2.7+7.);
      vec3 bedC=mix(vec3(.06,.05,.03),vec3(.12,.105,.065),sj);bedC=mix(bedC,vec3(.3,.29,.26)*(.7+.5*vn(bp*19.)),st*.75);
      float lite=.55+.45*vn(bp*1.3+uTime*.03);
      if(uQ>.5){vec2 q2=p*1.3;float c1=sin(q2.x*6.+sin(q2.y*4.+uTime*.6)*1.5+uTime*.5)*sin(q2.y*5.-uTime*.4+sin(q2.x*3.)*2.);lite+=pow(clamp(c1*.5+.5,0.,1.),5.)*.5*(1.-smoothstep(.1,.9,depth));}
      vec3 tr=exp(-depth*vec3(2.3,1.05,1.5)*3.6);
      vec3 body=mix(vec3(.010,.036,.032),bedC*lite*vec3(.95,1.,.85),tr);
      float F=mix(.2,1.,pow(1.-cosv,3.));F*=mix(.55,1.,smoothstep(.0,.5,depth));
      vec3 col=mix(body,refl,F);
      // sun glints on the fine ripples
      vec3 L=normalize(vec3(40.,55.,18.));vec3 Rv=reflect(-V,N);float sd=max(dot(Rv,L),0.);
      col+=vec3(1.,.96,.82)*(pow(sd,220.)*2.4+pow(sd,26.)*.12)*(.6+.4*vn(p*14.+uTime*.8));
      // a little scum and foam along the waterline
      float band=smoothstep(.0,.02,depth)*(1.-smoothstep(.02,.06+.09*vn(p*4.2+1.),depth));
      float flk=.5+.5*vn(p*17.+uTime*.05);
      col=mix(col,vec3(.62,.66,.46)*(.7+.3*flk),band*.55);
      col=mix(col,vec3(.35,.4,.2),smoothstep(.55,.8,vn(p*2.6+9.))*(1.-smoothstep(.0,.35,depth))*.4);
      col+=vec3(.24,.3,.27)*rp*.45;
      col+=vec3(.35,.5,.38)*uShim*exp(-pow((length(p-uCenter)/uR-(1.-uShim)*1.15)*6.,2.))*.7+vec3(.1,.16,.12)*uShim*.35;
      float fogf=1.-exp(-uFogD*uFogD*dist*dist);col=mix(col,uFog,fogf);
      gl_FragColor=vec4(col,smoothstep(.003,.06,depth));
      #include <colorspace_fragment>
    }`;
  const padGeo=new THREE.CircleGeometry(0.3,12,0.5,5.3);padGeo.rotateX(-Math.PI/2);
  const cupGeo=new THREE.ConeGeometry(0.075,0.1,7,1,true);cupGeo.rotateX(Math.PI);cupGeo.translate(0,0.05,0);
  const padMat=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide}),cupMat=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
  const waterGeo=new THREE.CircleGeometry(1,low?32:56);
  const PADS=low?7:13,MOTES=low?6:14;
  const pslots=[0,1,2].map(k=>{
    const g=new THREE.Group();g.visible=false;group.add(g);
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,toneMapped:true,
      uniforms:{uRefl:{value:rt.texture},uTex:reflU,uReflOn:{value:0},uTime:TW,uCenter:{value:new THREE.Vector2()},uR:{value:5},uRip:{value:[0,1,2,3].map(()=>new THREE.Vector4(0,0,-99,0))},uFog:{value:new THREE.Vector3(FOGC.r,FOGC.g,FOGC.b)},uFogD:{value:fogD},uQ:{value:Q},uShim:{value:0},
        uSeedA:{value:(seed^0x7a11)|0},uSeedB:{value:(seed^0x3c9d)|0},uSeedP:{value:(seed^0x1357)|0},uPondsT:GU.uPondsT},
      vertexShader:waterVS,fragmentShader:waterFS});
    const water=new THREE.Mesh(waterGeo,mat);water.rotation.x=-Math.PI/2;water.renderOrder=2;g.add(water);
    const pads=new THREE.InstancedMesh(padGeo,padMat,PADS),cups=new THREE.InstancedMesh(cupGeo,cupMat,PADS);
    pads.frustumCulled=cups.frustumCulled=false;pads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cups.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col=new THREE.Color();
    for(let i=0;i<PADS;i++){pads.setColorAt(i,col.setRGB(0.12+0.06*(i%3),0.3+0.07*(i%4),0.1));cups.setColorAt(i,i%2?col.setRGB(1,0.82,0.9):col.setRGB(1,1,0.92))}
    g.add(pads,cups);
    const mp=new Float32Array(MOTES*3),mg=new THREE.BufferGeometry();mg.setAttribute('position',new THREE.BufferAttribute(mp,3));
    const motes=new THREE.Points(mg,new THREE.PointsMaterial({map:moteTex,size:0.16,transparent:true,opacity:0.85,depthWrite:false,blending:THREE.AdditiveBlending,color:0xeaffc0}));
    motes.frustumCulled=false;g.add(motes);
    return {g,mat,water,pads,cups,motes,mp,pond:null,rip:0,nextDrip:0,lastWalk:-9,pads0:[]};
  });
  const dummy=new THREE.Object3D();
  function assignPond(p){
    const sl=pslots[p.i%3];sl.pond=p;sl.g.visible=true;sl.g.position.set(p.x,p.wy,p.z);
    sl.water.scale.set(p.r*1.5,p.r*1.5,1);sl.mat.uniforms.uCenter.value.set(p.x,p.z);sl.mat.uniforms.uR.value=p.r;
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
    invalidate(true);
  }
  function pushRip(sl,x,z,amp){const R=sl.mat.uniforms.uRip.value;R[sl.rip++%4].set(x,z,TW.value,amp)}
  function updatePonds(dt,b,moving){
    TW.value=S.t;
    const shim=Math.max(0,S.shim||0);
    for(const sl of pslots)sl.mat.uniforms.uShim.value=shim;
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
  let trees=[],rocks=[],deadClear=false,S=null;
  const treeR=t=>t.s.r*t.k+t.s.pad*Math.min(1.2,t.k);
  const clearOf=(x,z)=>x*x+z*z<25||pondDist(x,z)<2.4;
  function trunkAt(x,z){return trees.some(t=>(t.x-x)**2+(t.z-z)**2<(treeR(t)+0.9)**2)}
  const NEAR=low?10:15,AR=low?5:6;    // AR: chunks (16 m) generated round the player, so every prop's far distance is covered before it can be seen
  const bio=(x,z)=>{const b=biomeAt(x,z,seed),sp=sstep01((Math.hypot(x,z)-8)/16),pd=sstep01((pondDist(x,z)-2)/9),k=sp*pd;return [b.m*sp,b.d*k]};
  // ---- streaming: each 16 m chunk is generated once into a list of placed instances, cached, and assembled into the instanced meshes ----
  const cache=new Map(),candCache=new Map(),bigCache=new Map();
  let pondRecs=[];
  const mkRec=(kind,v,x,y,z,sxz,sy,rot,extra)=>{
    const arr=by[kind],sl=arr[Math.min(arr.length-1,Math.floor(v*arr.length))];
    let gy=H(x,z);
    if(sl.pad>0||TRUNK0[kind]){const e=0.6,gr=Math.max(Math.abs(H(x+e,z)-H(x-e,z)),Math.abs(H(x,z+e)-H(x,z-e)))/(2*e);gy-=0.06+0.45*gr}
    dummy.position.set(x,y+gy,z);dummy.rotation.set(0,rot,0);dummy.scale.set(sxz,sy,sxz);dummy.updateMatrix();
    const r={sl,x,z,m:Float32Array.from(dummy.matrix.elements),th:0,bd:0,tk:0,rk:null};
    if(extra)Object.assign(r,extra);
    if(r.rk===1)r.rk={x,z,sxz,sy,y,rot};
    return r;
  };
  // big boulder candidates of one chunk (cached): never on the spawn, a pond or a path; a candidate gives way to a nearby higher-priority one
  function candsOf(kx,kz){
    const key=kx+','+kz;let c=candCache.get(key);if(c)return c;
    c=[];const ox=kx*16-8,oz=kz*16-8;
    for(let j=0;j<5;j++)for(let i=0;i<5;i++){
      const x0=ox+1.6+i*3.2,z0=oz+1.6+j*3.2,R=k=>hr(x0,z0,seed,k);
      const x=x0+(R(101)-0.5)*3,z=z0+(R(102)-0.5)*3,dp=pondDist(x,z);
      if(R(103)>=(dp<16?0.03:0.011)*(low?0.7:1))continue;
      const sc=0.65+R(104)*0.8,fp=1.9*sc;
      if(dp<fp+2.5||pathDist(x,z)<fp+1.2||Math.hypot(x,z)<9+fp)continue;
      const big={x,z,r:fp,sc,rot:R(105)*6.283,sink:0.3+0.5*R(106),v:R(107),moss:R(108)<0.4,sat:[]};
      if(R(109)<0.5){      // an outcrop: a few smaller ones leaning on it
        const n=2+(R(110)*2|0);
        for(let k=0;k<n;k++){
          const a=R(111+k*3)*6.283,sc2=sc*(0.35+R(112+k*3)*0.35),fp2=1.9*sc2,d=fp*0.8+fp2*0.7,sx=x+Math.cos(a)*d,sz=z+Math.sin(a)*d;
          if(pondDist(sx,sz)<fp2+2||pathDist(sx,sz)<fp2+1)continue;
          big.sat.push({x:sx,z:sz,r:fp2,sc:sc2,rot:R(113+k*3)*6.283,sink:0.2+0.4*R(114+k*3),v:R(115+k*3),moss:R(116+k*3)<0.4});
        }
      }
      c.push(big);
    }
    candCache.set(key,c);return c;
  }
  function bigsOf(kx,kz){
    const key=kx+','+kz;let c=bigCache.get(key);if(c)return c;
    const mine=candsOf(kx,kz),others=[];
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const o of candsOf(kx+dx,kz+dz))others.push(o);
    c=[];
    for(const a of mine){
      let ok=true;
      for(const o of others)if(o!==a&&o.v>a.v&&Math.hypot(a.x-o.x,a.z-o.z)<(a.r+o.r)*0.8){ok=false;break}
      if(!ok)continue;
      c.push(a,...a.sat);
    }
    bigCache.set(key,c);return c;
  }
  function genChunk(kx,kz){
    const recs=[],emit=(kind,v,x,y,z,sxz,sy,rot,extra)=>{const r=mkRec(kind,v,x,y,z,sxz,sy,rot,extra);recs.push(r);return r};
    const bigRocks=[];
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const o of bigsOf(kx+dx,kz+dz))bigRocks.push(o);
    const rockBlock=(x,z,m)=>{for(const r of bigRocks)if(Math.hypot(x-r.x,z-r.z)<r.r+m)return true;return false};
    for(const r of bigsOf(kx,kz)){
      const sy=r.sc*(0.85+0.3*((r.v*7)%1));
      emit(r.moss?'bigmoss':'bigrock',r.v,r.x,-r.sink*r.sc*1.4,r.z,r.sc,sy,r.rot,{rk:1});
    }
    {
      const ox=kx*16-8,oz=kz*16-8;
      for(let j=0;j<5;j++)for(let i=0;i<5;i++){
        const x0=ox+1.6+i*3.2,z0=oz+1.6+j*3.2;
        const R=k=>hr(x0,z0,seed,k);
        const x=x0+(R(1)-0.5)*2.4,z=z0+(R(2)-0.5)*2.4;
        const dPath=pathDist(x,z),cf=clearField(x,z,seed);
        const [bm,bd]=bio(x,z);
        const clearing=(cf>CLEAR_AT+0.2*bd&&bd<0.6)||bm>0.5,dd=0;
        // far trees thin out into the fog (decided when the chunk is assembled, by distance): th is this instance's lot
        // trees: mostly fir, some oak, now and then a dead one
        const pt=(low?0.32:0.44)*(1+0.5*bd)*(low?1-0.45*bd:1)*(1-bm);
        const lone=bm>0.55&&R(3)>0.988; // a rare lone oak standing in the open
        if(!clearOf(x,z)&&dPath>1.7&&((!clearing&&R(3)<pt)||lone)&&!rockBlock(x,z,0.9)){
          const kv=lone?0.7:bd>0.3?R(4)*0.85:R(4),kind=kv<0.6?'fir':kv<0.92?'oak':'snag',g=R(6),sc=(kind==='fir'?0.8:0.85)+g*g*0.65;
          emit(kind,R(5),x,0,z,sc*(0.92+R(11)*0.16),sc,R(7)*6.283,{th:R(10),bd,tk:sc});
        }
        // shrubs: under the trees, thinner in the sun
        const sx=x0+(R(12)-0.5)*3,sz=z0+(R(13)-0.5)*3;
        if(pondDist(sx,sz)>0.9&&pathDist(sx,sz)>1&&R(14)<(clearing?0.1:0.26)*(1+0.5*bd)*(low?1-0.4*bd:1)*(1-0.85*bm)&&!rockBlock(sx,sz,0.4))
          emit('shrub',R(15),sx,0,sz,0.75+R(16)*0.8,0.75+R(17)*0.7,R(18)*6.283,{th:R(10),bd});
        // flower clumps: meadow clearings, round the ponds and beside the paths
        const fx=x0+(R(19)-0.5)*3,fz=z0+(R(20)-0.5)*3,dPf=pondDist(fx,fz),pf=pathDist(fx,fz);
        const [fm,fd]=bio(fx,fz),wf=Math.max(clearing?0.7:(dPf<6||pf<3.4)?0.45:0.04,fm*0.8)*(1-0.9*fd);
        if(dPf>1&&pf>0.8&&R(21)<wf*(low?0.7:1)){
          const kind=R(22)<0.5?'tulip':'daisy',s=1.1+R(23)*0.8;
          emit(kind,R(24),fx,0,fz,s,s,R(25)*6.283);
          if((clearing||fm>0.5)&&R(26)<0.5+0.15*fm){const a=R(27)*6.283,s2=1+R(28)*0.7;emit(R(29)<0.5?'tulip':'daisy',R(30),fx+Math.cos(a)*1.1,0,fz+Math.sin(a)*1.1,s2,s2,R(31)*6.283);
            if(fm>0.5&&R(120)<0.35){const a2=a+2.1+R(121),s3=0.9+R(122)*0.7;emit(R(123)<0.5?'tulip':'daisy',R(124),fx+Math.cos(a2)*1.5,0,fz+Math.sin(a2)*1.5,s3,s3,R(125)*6.283)}}
        }
        // grass clumps: thick in meadows and on pond banks, sparse under the trees
        const [gm,gd]=bio(x0,z0);
        for(let g=0;g<(gm>0.5?5:4);g++){
          const kk=g<4?80+g*6:140+g*6,gx=x0+(hr(x0,z0,seed,kk)-0.5)*3.2,gz=z0+(hr(x0,z0,seed,kk+1)-0.5)*3.2,dpg=pondDist(gx,gz);
          const inMeadow=clearField(gx,gz,seed)>CLEAR_AT-0.05;
          const wg=Math.max(inMeadow?0.95:dpg<4.5?0.85:0.3,gm*0.86)*(1-0.85*gd*(dpg<4.5?0.5:1));
          if(dpg>0.5&&pathDist(gx,gz)>0.6&&hr(x0,z0,seed,kk+2)<wg*(low?0.55:1)){
            const s=2.4+hr(x0,z0,seed,kk+3)*1.6;
            emit('grass',hr(x0,z0,seed,kk+4),gx,0,gz,s,s*(0.8+hr(x0,z0,seed,kk+5)*0.6),hr(x0,z0,seed,kk+6)*6.283);
          }
        }
        // loose stones
        const qx=x0+(R(32)-0.5)*3,qz=z0+(R(33)-0.5)*3;
        const [qm,qd]=bio(qx,qz);
        if(pondDist(qx,qz)>1.4&&pathDist(qx,qz)>1.1&&R(34)<0.075*(1+1.3*qd)*(1-0.45*qm)){
          const s=0.6+R(35)*0.9,mossy=R(36)<0.6+0.3*qd,sy=s*(0.8+R(38)*0.4);
          const rotQ=R(39)*6.283;
          emit(mossy?'mossrock':'boulder',R(37),qx,-0.2*s,qz,s,sy,rotQ,{rk:1});
        }
      }
    }
    return recs;
  }
  // everything round a pond that is not chunk-bound: the ring of stones, reeds, stepping stones
  function genPondRecs(){
    const recs=[],emitP=(kind,v,x,y,z,sxz,sy,rot,extra)=>{recs.push(mkRec(kind,v,x,y,z,sxz,sy,rot,extra))};
    for(const pd of ponds){
      const pi=pd.i*53;
      // a ring of stones round the water, open where the path arrives
      const toFrom=Math.atan2(pd.fz-pd.z,pd.fx-pd.x);
      for(let i=0;i<22;i++){
        const a=i/22*6.283+(hash2(i+pi,3,seed)-0.5)*0.18;
        if(Math.abs(Math.atan2(Math.sin(a-toFrom),Math.cos(a-toFrom)))<0.3)continue;
        const rad=pd.r+0.3+hash2(i+pi,5,seed)*0.7,big=hash2(i+pi,7,seed)<0.3,s=(big?0.65:0.42)+hash2(i+pi,9,seed)*0.4;
        emitP(hash2(i+pi,11,seed)<0.65?'mossrock':'boulder',hash2(i+pi,13,seed),pd.x+Math.cos(a)*rad,-0.2*s,pd.z+Math.sin(a)*rad,s,s*(0.7+hash2(i+pi,15,seed)*0.3),hash2(i+pi,17,seed)*6.283);
      }
      // reeds and cattails along the margin
      for(let i=0;i<(low?9:16);i++){
        const a=hash2(i+pi,21,seed)*6.283;
        if(Math.abs(Math.atan2(Math.sin(a-toFrom),Math.cos(a-toFrom)))<0.35)continue;
        const rad=pd.r-0.25+hash2(i+pi,23,seed)*1.3,s=0.85+hash2(i+pi,25,seed)*0.7;
        emitP('reed',hash2(i+pi,27,seed),pd.x+Math.cos(a)*rad,0,pd.z+Math.sin(a)*rad,s,s*(0.9+hash2(i+pi,29,seed)*0.3),hash2(i+pi,31,seed)*6.283);
      }
      // stepping stones along the path from where the way began
      const dx=pd.x-pd.fx,dz=pd.z-pd.fz,L=Math.hypot(dx,dz)||1,ux=dx/L,uz=dz/L;
      for(let k=0,d=2.3;d<L-pd.r-0.6;k++,d+=1.7+hash2(k+pi,2,seed)*0.5){
        const lat=(hash2(k+pi,4,seed)-0.5)*0.5;
        emitP('slab',hash2(k+pi,6,seed),pd.fx+ux*d-uz*lat,-0.07,pd.fz+uz*d+ux*lat,0.85+hash2(k+pi,8,seed)*0.3,0.45,hash2(k+pi,10,seed)*6.283);
      }
    }
    return recs;
  }
  const offs=[];for(let dz=-AR-1;dz<=AR+1;dz++)for(let dx=-AR-1;dx<=AR+1;dx++){const d=Math.hypot(dx,dz);if(d<=AR+0.6)offs.push([dx,dz,d])}
  offs.sort((a,b)=>a[2]-b[2]);
  let curCX=1e9,curCZ=1e9,queue=[],dirty=true,lastAsm=0,dirX=0,dirZ=0;
  const gen=(kx,kz)=>{const key=kx+','+kz;if(!cache.has(key))cache.set(key,genChunk(kx,kz))};
  // which chunks are still missing round (cx,cz), the ones ahead of the walker first
  function plan(cx,cz){
    queue=[];
    for(const [dx,dz,d] of offs)if(!cache.has((cx+dx)+','+(cz+dz)))queue.push([cx+dx,cz+dz,d-0.7*(dx*dirX+dz*dirZ)]);
    queue.sort((a,b)=>a[2]-b[2]);
    if(cache.size>AR*AR*16){for(const k of cache.keys()){const [x,z]=k.split(',').map(Number);if(Math.hypot(x-cx,z-cz)>AR+3)cache.delete(k)}}
  }
  // generate chunks for up to `ms` milliseconds (always at least one if any is missing)
  function pump(ms){
    const t0=performance.now();let n=0;
    while(queue.length&&(n===0||performance.now()-t0<ms)){const q=queue.shift();gen(q[0],q[1]);n++}
    if(n)dirty=true;return n;
  }
  function assemble(cx,cz){
    chunkAsm.n++;aheadMax=0;
    trees=[];rocks=[];
    for(const s of slots){s.near.count=0;s.farM.count=0}
    const mx=cx*16,mz=cz*16;
    const place=r=>{
      const sl=r.sl,d=Math.hypot(r.x-mx,r.z-mz);
      if(d>sl.far*(low?0.68:1))return;
      if(r.th>0){const bd=r.bd,thin=d>NEAR+13-9*bd?(d>NEAR+28-14*bd?0.28-0.12*bd:0.5-0.2*bd):1;if(r.th>=thin)return}
      const far=d>sl.nearR*(low?0.62:1),im=far?sl.farM:sl.near;
      if(im.count>=im.instanceMatrix.count)return;
      im.instanceMatrix.array.set(r.m,im.count*16);im.count++;
      const pr=(r.x-b.x)*dirX+(r.z-b.z)*dirZ;if(pr>aheadMax)aheadMax=pr;
      if(r.tk&&d<48)trees.push({x:r.x,z:r.z,s:sl,k:r.tk});
      if(r.rk&&d<40&&sl.ready&&sl.grid){
        const k=r.rk,rr=makeRock(sl.grid,{x:k.x,z:k.z,rot:k.rot,sxz:k.sxz,sy:k.sy,y0:H(k.x,k.z),yo:k.y});
        if(rr.top>=STEP_MIN){rr.stand=rr.top<=JUMP_TOP;rocks.push(rr)}
      }
    };
    asmKeys=new Set();
    for(const [dx,dz] of offs){const k=(cx+dx)+','+(cz+dz),rec=cache.get(k);if(rec){asmKeys.add(k);for(const r of rec)place(r)}}
    for(const r of pondRecs)place(r);
    for(const s of slots){s.near.instanceMatrix.needsUpdate=true;s.farM.instanceMatrix.needsUpdate=true}
    dirty=false;lastAsm=performance.now();chunkAsm.ahead=aheadMax;
  }
  const chunkAsm={n:0,ahead:0};let aheadMax=0,asmKeys=new Set();
  // called every frame with where the walker is: new chunk -> replan and recentre; spare milliseconds -> generate ahead
  function rebuild(cx,cz,vx=0,vz=0,ms=3,sync=false){
    const L=Math.hypot(vx,vz);if(L>0.5){dirX=vx/L;dirZ=vz/L}
    const moved=cx!==curCX||cz!==curCZ;
    if(moved){curCX=cx;curCZ=cz;plan(cx,cz);
      // the ring you can see right now is made before the frame ends; the rest is spread over the next frames
      for(const [dx,dz,d] of offs){if(d>2.2)break;gen(cx+dx,cz+dz)}
      plan(cx,cz);dirty=true}
    if(sync){while(queue.length)gen(...queue.shift())}else pump(ms);
    if(moved||(dirty&&performance.now()-lastAsm>150))assemble(cx,cz);
  }
  // after a change to the ponds or to a baked prop: regenerate (ponds) or reassemble (bakes)
  function invalidate(all){
    if(all){cache.clear();candCache.clear();bigCache.clear();pondRecs=genPondRecs();curCX=1e9}
    dirty=true;lastAsm=0;
  }
  // bake in idle slices, one prop at a time; each lands in its InstancedMesh pair as soon as it is ready
  const bake={t0:performance.now(),ms:0,done:0,total:BAKE_ORDER.length,cached:0,log:[]};
  const applyProp=(sl,p)=>{
    sl.near.geometry=p.near;sl.farM.geometry=p.far;sl.ready=true;
    const r=trunkRadius(p.near);if(r>0&&TRUNK0[sl.kind])sl.r=r;
    if(ROCKY.has(sl.kind)){if(!p.near.boundingBox)p.near.computeBoundingBox();const bb=p.near.boundingBox;sl.fp=(bb.max.x-bb.min.x+bb.max.z-bb.min.z)/4;sl.hh=bb.max.y;const gp=p.near.attributes.position;sl.grid=heightGrid(gp.array.length===gp.count*3?gp.array:Float32Array.from({length:gp.count*3},(_,i)=>gp.array[i]),p.near.index?p.near.index.array:null)}
    invalidate(false)
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
  // reflection-only figures (layer 1): the player's double and the door's image
  const ghostBody=makeBody(Q),ghostDoor=makeDoor();
  ghostDoor.traverse(o=>{if(o.isLight)o.intensity=0});ghostDoor.traverse(o=>o.layers.set(1));
  ghostBody.visible=ghostDoor.visible=false;group.add(ghostBody,ghostDoor);
  S={t:0,yaw:0,pitch:0,bloom:0.18,seed,pinned:false,hold:0,said:0,doorX:0,doorZ:4.2,doorFace:0,ready:false,bake,mist:0,shim:0,water:false,direct:false,fill:0};
  S.ponds=()=>ponds.map(p=>({...p}));
  S.dims=()=>slots.filter(s=>s.ready).map(s=>{const g=s.near.geometry;if(!g.boundingBox)g.computeBoundingBox();const b=g.boundingBox;return {id:s.id,w:+(b.max.x-b.min.x).toFixed(2),h:+(b.max.y-b.min.y).toFixed(2),y0:+b.min.y.toFixed(2),d:+(b.max.z-b.min.z).toFixed(2)}});
  S.byKind=()=>{const o={};for(const s of slots){const nt=s.near.geometry.attributes.position.count/3,ft=s.farM.geometry.attributes.position.count/3;const a=o[s.kind]||(o[s.kind]={near:0,far:0,ni:0,fi:0});a.near+=Math.round(s.near.count*nt);a.far+=Math.round(s.farM.count*ft);a.ni+=s.near.count;a.fi+=s.farM.count}return o};
  S.stream=()=>({asm:chunkAsm.n,queue:queue.length,cache:cache.size,ahead:chunkAsm.ahead,
    // metres ahead (along dx,dz) before the first chunk that has not been generated
    asmd:(dx,dz)=>{const L=Math.hypot(dx,dz)||1;for(let t=0;t<300;t+=6){const kx=Math.round((b.x+dx/L*t)/16),kz=Math.round((b.z+dz/L*t)/16);if(!asmKeys.has(kx+','+kz))return t}return 300},
    gen:(dx,dz)=>{const L=Math.hypot(dx,dz)||1;for(let t=0;t<300;t+=6){const kx=Math.round((b.x+dx/L*t)/16),kz=Math.round((b.z+dz/L*t)/16);if(!cache.has(kx+','+kz))return t}return 300}});
  S.cam=cam;S.doorShown=()=>door.visible;
  S.H=H;S.rockList=()=>rocks.map(r=>({...r}));
  S.treeList=()=>trees.map(t=>({x:t.x,z:t.z,kind:t.s.kind,k:t.k}));
  // ground for the walker: the hills plus the top of every climbable stone
  const G=(x,z)=>{
    let g=H(x,z);
    for(const r of rocks){if((x-r.cx)**2+(z-r.cz)**2>r.rb*r.rb)continue;const y=rockSurface(r,x,z);if(y>g)g=y}
    return g;
  };
  S.G=G;
  const blockedAt=(x,z)=>trunkAt(x,z)||rocks.some(r=>(r.cx-x)**2+(r.cz-z)**2<(r.rb+0.9)**2);
  const walker=createRoomWalker({o,eye:EYE,x:0,z:0,groundAt:G,snap:0.7,collide:b=>{
    for(const t of trees){
      const dx=b.x-t.x,dz=b.z-t.z,d=Math.hypot(dx,dz),m=0.32+treeR(t);
      if(d<m&&d>1e-4){b.x=t.x+dx/d*m;b.z=t.z+dz/d*m}
    }
    // stones: a body only gets onto one it can reach (feet + a small step); two passes so a gap between stones cannot trap it
    for(let pass=0;pass<3;pass++){
      let moved=false;
      for(const t of rocks){const q=rockPush(t,b.x,b.z,b.y);if(q){b.x=q[0];b.z=q[1];moved=true}}
      if(!moved)break;
      for(const t of trees){
        const dx=b.x-t.x,dz=b.z-t.z,d=Math.hypot(dx,dz),m=0.32+treeR(t);
        if(d<m&&d>1e-4){b.x=t.x+dx/d*m;b.z=t.z+dz/d*m}
      }
    }
    // last resort: still inside a stone after all that, so stand on it instead of being stuck
    for(const t of rocks){const y=rockSurface(t,b.x,b.z);if(y-b.y>0.2){b.y=y;b.vy=0;S.pops=(S.pops||0)+1}}
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
  rebuild(0,0,0,0,0,false);
  Object.assign(S,placeBehind(0,0,0,STILL.behind,trunkAt));
  S.doorX=S.x;S.doorZ=S.z;S.doorFace=S.face;poseDoor();

  const addPond=np=>{
    const list=[...ponds,np];while(list.length>STILL.pondMax)list.shift();
    setPonds(list);rebuild(Math.round(b.x/16),Math.round(b.z/16),b.vx,b.vz);
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
  let camY=null;
  const frustum=new THREE.Frustum(),pm=new THREE.Matrix4(),sph=new THREE.Sphere(),plane=new THREE.Plane(),clipV=new THREE.Vector4(),qv=new THREE.Vector4();
  const cp=new THREE.Vector3(),cq=new THREE.Quaternion(),cs=new THREE.Vector3(),fw=new THREE.Vector3(),tg=new THREE.Vector3(),nrm=new THREE.Vector3(0,1,0),pt=new THREE.Vector3();
  S.refl={ms:0,tris:0,on:false,frames:0,pond:-1};S.ghosts=()=>({body:[ghostBody.visible,ghostBody.position.x,ghostBody.position.y,ghostBody.position.z],door:[ghostDoor.visible,ghostDoor.position.x,ghostDoor.position.y,ghostDoor.position.z]});
  let walkPh=0,lastWX=0,lastWZ=0,reflFlip=0;
  S.frame=()=>{
    cam.updateMatrixWorld();
    // is a pond on screen? no water in view: no reflection pass at all
    pm.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);frustum.setFromProjectionMatrix(pm);
    cam.matrixWorld.decompose(cp,cq,cs);
    let prim=null,best=1e9;
    for(const sl of pslots){const p=sl.pond;if(!p)continue;sph.set(pt.set(p.x,p.wy,p.z),p.r*1.5);if(!frustum.intersectsSphere(sph))continue;
      const d=Math.hypot(cp.x-p.x,cp.z-p.z)-p.r;if(d<best&&d<70&&cp.y>p.wy+0.1){best=d;prim=sl}}
    for(const sl of pslots)sl.mat.uniforms.uReflOn.value=sl===prim?1:0;
    S.refl.on=!!prim;if(!prim)return;
    if(low&&(reflFlip^=1))return;                 // low quality: a new reflection every other frame
    const pd=prim.pond,wy=pd.wy,T0=performance.now();
    // the double and the door's image stand where an upright mirror set in the pond would show them (see mirrorPoint)
    const mm=pd.r*0.55,qp=mirrorPoint(pd.x,pd.z,b.x,b.z,b.x,b.z,mm),qd=mirrorPoint(pd.x,pd.z,b.x,b.z,S.doorX,S.doorZ,mm);
    const show=!!qp&&Math.hypot(b.x-pd.x,b.z-pd.z)>1.2;
    ghostBody.visible=ghostDoor.visible=show;
    if(show){
      const mv=Math.hypot(b.x-lastWX,b.z-lastWZ);lastWX=b.x;lastWZ=b.z;walkPh+=mv*2.6;
      const sw=Math.sin(walkPh)*Math.min(0.7,mv*30);
      ghostBody.position.set(qp[0],H(qp[0],qp[1])+Math.max(0,b.y-H(b.x,b.z)),qp[1]);
      ghostBody.rotation.y=-mirrorYaw(pd.x,pd.z,b.x,b.z,S.yaw);
      const ud=ghostBody.userData.legs,ua=ghostBody.userData.arms;ud[0].rotation.x=sw;ud[1].rotation.x=-sw;ua[0].rotation.x=-sw*0.8;ua[1].rotation.x=sw*0.8;
      ghostDoor.position.set(qd[0],H(qd[0],qd[1]),qd[1]);
      ghostDoor.rotation.y=Math.PI-mirrorYaw(pd.x,pd.z,b.x,b.z,S.doorFace);
    }
    // mirror the camera about the water plane y=wy
    const asp=cam.aspect||16/9,rw=Math.round(reflH*asp);if(rt.width!==rw)rt.setSize(rw,reflH);
    vcam.position.set(cp.x,2*wy-cp.y,cp.z);
    fw.set(0,0,-1).applyQuaternion(cq);vcam.up.set(0,1,0).applyQuaternion(cq);vcam.up.y*=-1;
    tg.set(cp.x+fw.x,2*wy-(cp.y+fw.y),cp.z+fw.z);vcam.lookAt(tg);
    vcam.fov=cam.fov;vcam.aspect=asp;vcam.near=cam.near;vcam.far=cam.far;vcam.updateProjectionMatrix();vcam.updateMatrixWorld();
    // oblique near plane: nothing below the water is drawn into the mirror
    plane.setFromNormalAndCoplanarPoint(nrm,pt.set(0,wy,0));plane.applyMatrix4(vcam.matrixWorldInverse);
    clipV.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    const pe=vcam.projectionMatrix.elements;
    qv.x=(Math.sign(clipV.x)+pe[8])/pe[0];qv.y=(Math.sign(clipV.y)+pe[9])/pe[5];qv.z=-1;qv.w=(1+pe[10])/pe[14];
    clipV.multiplyScalar(2/clipV.dot(qv));
    pe[2]=clipV.x;pe[6]=clipV.y;pe[10]=clipV.z+1-0.003;pe[14]=clipV.w;
    texM.set(0.5,0,0,0.5,0,0.5,0,0.5,0,0,0.5,0.5,0,0,0,1);texM.multiply(vcam.projectionMatrix);texM.multiply(vcam.matrixWorldInverse);
    // draw: without the water itself, and with the real door replaced by its mirrored image
    const vis=pslots.map(sl=>sl.g.visible),dv=door.visible,cnt=slots.map(sl=>[sl.near.count,sl.farM.count]);
    // keep the mirror cheap: no ground cover in it, and only the nearer part of the far LOD (the rest is fogged out anyway)
    slots.forEach(sl=>{if(REFL_SKIP.has(sl.kind)){sl.near.count=0;sl.farM.count=0}else sl.farM.count=Math.ceil(sl.farM.count*0.55)});
    for(const sl of pslots)sl.g.visible=false;door.visible=false;
    const prev=renderer.getRenderTarget();
    renderer.setRenderTarget(rt);renderer.clear();renderer.render(scene,vcam);renderer.setRenderTarget(prev);
    pslots.forEach((sl,i)=>{sl.g.visible=vis[i]});door.visible=dv;slots.forEach((sl,i)=>{sl.near.count=cnt[i][0];sl.farM.count=cnt[i][1]});
    S.refl.ms=performance.now()-T0;S.refl.tris=renderer.info.render.triangles;S.refl.frames++;S.refl.pond=pd.i;
  };
  // the camera pose this frame will render with; the door's visibility is decided from exactly this pose
  const poseCam=dt=>{
    if(camY===null||b.y>G(b.x,b.z)+0.05||Math.abs(b.y-camY)>3)camY=b.y;else camY+=(b.y-camY)*Math.min(1,dt*16);
    cam.position.set(b.x,EYE+camY+bobY(b,walker.scale),b.z);
    cam.rotation.set(S.pitch,-S.yaw,0,'YXZ');
  };
  S.update=(dt,input)=>{
    S.t+=dt;let moving=false;
    if(!A.watching){
      lookStep(S,dt,input.lx,input.ly,MOVE.roomPitch);
      const ox=b.x,oz=b.z;
      walker.step(dt,input,S.yaw);
      moving=Math.hypot(b.x-ox,b.z-oz)>dt*0.4;
      rebuild(Math.round(b.x/16),Math.round(b.z/16),b.vx,b.vz);
      // another pond, a long walk on
      const last=ponds[ponds.length-1];
      if(pondSpawnDue(b.x,b.z,last)){
        addPond(pondSpawnAt({seed,index:last.i+1,x:b.x,z:b.z,yaw:S.yaw,ponds}));
        S.mist=2.4;
        o.tone(392,0.6,'sine',0.03,0,-90);
      }
      poseCam(dt);
      const sim={
        x:b.x,z:b.z,yaw:S.yaw,pitch:S.pitch,eye:cam.position.y,aspect:cam.aspect||16/9,
        door:{x:S.doorX,z:S.doorZ,y:H(S.doorX,S.doorZ),face:S.doorFace},
        ponds,pinned:S.pinned,hold:S.hold,dwell:S.dwell||0,blocked:blockedAt,groundAt:H,
      };
      stillStep(sim,dt);
      S.pinned=sim.pinned;S.hold=sim.hold;S.dwell=sim.dwell;S.doorX=sim.door.x;S.doorZ=sim.door.z;S.doorFace=sim.door.face;
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
    if(A.watching)poseCam(dt);
  };
  onClear(()=>{
    deadClear=true;scene.background=prevBg;rt.dispose();ghostBody.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});ghostDoor.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});
    const gs=new Set([ground.geometry,padGeo,cupGeo,waterGeo,...Object.values(holders)]);
    for(const s of slots){gs.add(s.near.geometry);gs.add(s.farM.geometry);s.near.dispose();s.farM.dispose()}
    for(const g of gs)g.dispose();
    for(const m of Object.values(M))m.dispose();
    ground.material.dispose();padMat.dispose();cupMat.dispose();moteTex.dispose();
    for(const sl of pslots){sl.mat.dispose();sl.motes.geometry.dispose();sl.motes.material.dispose();sl.pads.dispose();sl.cups.dispose()}
  });
  return S;
}
