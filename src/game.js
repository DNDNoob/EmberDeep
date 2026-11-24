import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {makeSurfaces} from './textures.js';
import {openRoom,newRoomCode,cleanCode} from './net.js';
import {createVoice} from './voice.js';
import {guidePath,guideBeacon,GUIDE_RANGE} from './guide.js';
import {createRooms,kilnGame,KILN,DOOR_KINDS} from './rooms.js';
import {animalHitEffects,mooseModel,scoutGooseModel,MOOSE_ACH,MOOSE_SPIKE_PRICE} from './moose-defense.js';
import {ROOM_MOBS} from './room-mobs.js';
import {roomMobExhibit} from './room-mob-exhibits.js';
import {roomActions,roomControlLabel} from './room-controls.js';
import {bakeRecipe,bakeRecipeIdle,bakeIsDone,bakeStarted,bakeExport,bakePrime,KIT_HASH} from './npc_kit.js';
import {loadBake,saveBake,cacheStats} from './npc_cache.js';
import {hairAtlas,ATLAS_TILES} from './npc_hair.js';
import {KEEPER} from './npc_recipes.js';
import {createBabyFace,createFallVoid} from './babyface.js';
import {pickVariant,VARIANTS} from './variants.js';
import {createForest,coreFaces,INSET,CORE_H} from './forest.js';
import {MOVE,stepMove,lookStep,lookBy,bobY,noclipDest} from './movement.js';
import {lurkStep} from './lurk.js';
import {initAmbience,updateAmbience,amb} from './ambience.js';
import {initMusic,useStore,updateMusic,setVolumes,getVolumes,onVolumes,music} from './music.js';
import {createMenuRoom,onLiftPlatform} from './menu-room.js';
import {createSettingsScreen,createTerminalSession} from './shared-terminal.js';
import {landingMazeZ} from './mine-shaft.js';
import {NEWS} from './news.js';
import {floorDiorama,lenticularDoor} from './archive-hall.js';
import {wheelModel,planSpin,spinAngle,pegPush,sliceAt,WOF_SLICES,WOF_N,WOF_W} from './wheel.js';
import {announce,statusStrip,tints,coinFlip,breakUI} from './wheel-screens.js';
import {createBreaks} from './wheel-breaks.js';

const $ = id => document.getElementById(id);
const canvas = $('gl');
const lsGet=(k,d)=>{try{const v=localStorage.getItem('emberdeep.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem('emberdeep.'+k,JSON.stringify(v))}catch(e){}};
const SAFE=+lsGet('safe',0)||0, WANT_GTX=!!lsGet('gtx',false);
const QSET=lsGet('quality','auto');
const IS_TOUCH=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches);
let Q=SAFE?0:QSET==='low'?0:QSET==='medium'?1:QSET==='high'?2:(IS_TOUCH?1:2);
let renderer=null;
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:Q===0&&!SAFE,alpha:false,stencil:false,powerPreference:WANT_GTX&&!SAFE?'high-performance':'default'});
}catch(e){renderer=null}
if(!renderer){
  document.body.innerHTML = '<div class="panel"><h2>WebGL2 is not available</h2><div class="sub">Open this page in a current Chrome, Edge or Firefox with hardware acceleration turned on.</div></div>';
  throw new Error('no webgl2');
}
const gl=renderer.getContext();
if(Q>0&&!gl.getExtension('EXT_color_buffer_float')&&!gl.getExtension('EXT_color_buffer_half_float'))Q=0;
/* ---------- utilities ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function randSeed(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=c[Math.random()*c.length|0];return s}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
let archiveRun=null;
const runSaveKeys=new Set(['wallet','up','ach','best','deepest']);
const store={
  get:lsGet,
  set(k,v){if(!archiveRun||!runSaveKeys.has(k))lsSet(k,v)}
};

/* ---------- constants ---------- */
// World scale: a 1.75 m man is ~0.956 m tall here (the Keeper), i.e. 0.546 world metres per real metre. A human eye sits at ~0.93 of
// stature, so the player's eye height is the Keeper's eye height (0.9 m). It used to be 0.62 m: the camera was at the Keeper's
// chest, which made every NPC look a head taller than the player. Single source for the camera, NPC head tracking and avatars.
const WALL_H=1.25, EYE=0.9, PR=0.22, CAM_TOP=WALL_H-0.09;   // CAM_TOP: the camera never rises into the ceiling (a jump peaks at 0.56 m)
const AV=EYE/0.84;   // scale of the humanoid player avatars: the avatar's eyes are at 0.84*scale, so they sit at EYE
const BIOMES=[
  {base:0,name:'The Old Stonework', wall:[1.0,0.92,0.82], floor:[0.9,0.85,0.8],  ceil:[0.7,0.65,0.6],   torch:[1.0,0.72,0.42], amb:[0.012,0.012,0.02], stone:[0.44,0.4,0.34], spec:[0.12,0.2,0.05], wet:0.5},
  {base:3,name:'Mossgrown Halls',   wall:[0.7,0.95,0.7],  floor:[0.65,0.85,0.6], ceil:[0.5,0.65,0.5],   torch:[1.0,0.8,0.5],   amb:[0.008,0.02,0.012], stone:[0.3,0.36,0.27], spec:[0.08,0.16,0.05], wet:0.9},
  {base:6,name:'The Frostvault',    wall:[0.7,0.85,1.1],  floor:[0.75,0.9,1.1],  ceil:[0.55,0.65,0.85], torch:[0.95,0.88,0.8], amb:[0.012,0.018,0.035], stone:[0.5,0.62,0.72], spec:[0.75,0.6,0.3], wet:0.3},
  {base:9,name:'Cinder Warrens',    wall:[1.15,0.65,0.5], floor:[1.0,0.6,0.5],   ceil:[0.8,0.45,0.4],   torch:[1.0,0.6,0.3],   amb:[0.03,0.008,0.004], stone:[0.24,0.2,0.19], spec:[0.3,0.22,0.08], wet:0.0},
  {base:13,name:'The Humming Rooms', wall:[1,1,0.8],     floor:[0.8,0.75,0.5],  ceil:[0.9,0.9,0.8],    torch:[1.0,0.93,0.7],  amb:[0.21,0.19,0.105], stone:[0.6,0.58,0.5], spec:[0.03,0.02,0.05], wet:0.35},
  {base:17,name:'The Bone Galleries', wall:[1.0,0.95,0.84], floor:[0.9,0.84,0.72], ceil:[0.75,0.68,0.58], torch:[1.0,0.78,0.5],  amb:[0.016,0.014,0.012], stone:[0.55,0.5,0.42], spec:[0.1,0.14,0.04], wet:0.15},
  {base:20,name:'The Rustworks',      wall:[0.95,0.85,0.78], floor:[0.85,0.8,0.75], ceil:[0.7,0.64,0.6],  torch:[1.0,0.7,0.4],   amb:[0.014,0.011,0.01], stone:[0.34,0.27,0.22], spec:[0.5,0.55,0.35], wet:0.7},
  {base:23,name:'The Glimmer Veins',  wall:[0.8,0.85,1.05], floor:[0.8,0.85,1.0],  ceil:[0.6,0.65,0.85], torch:[0.98,0.86,0.72], amb:[0.012,0.016,0.03], stone:[0.28,0.3,0.36], spec:[0.4,0.45,0.25], wet:0.35},
  {base:26,name:'The Dark Forest',   wall:[0.7,0.9,0.7],  floor:[0.8,0.85,0.75], ceil:[0,0,0],        torch:[1.0,0.76,0.46], amb:[0.005,0.012,0.009], stone:[0.3,0.28,0.24], spec:[0.05,0.16,0.04], wet:0.45},
];
const ITEM={
  shard:{cell:0,col:[0.35,0.9,1.0], size:0.36},
  gem:  {cell:1,col:[1.0,0.8,0.25], size:0.24},
  oil:  {cell:2,col:[1.0,0.55,0.15],size:0.32},
  flash:{cell:3,col:[0.8,0.9,1.0],  size:0.30},
  chest:{cell:1,col:[1.0,0.8,0.25], size:0.42},
  key:  {cell:9,col:[1.0,0.85,0.35],size:0.34},
  heart:{cell:4,col:[1.0,0.25,0.3], size:0.30},
};

/* ---------- maze generation ---------- */
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
function bfs(g,W,H,sx,sy){
  const d=new Int16Array(W*H).fill(-1), q=new Int32Array(W*H); let qh=0,qt=0;
  d[sy*W+sx]=0; q[qt++]=sy*W+sx;
  while(qh<qt){
    const c=q[qh++], cx=c%W, cy=(c/W)|0, nd=d[c]+1;
    for(let k=0;k<4;k++){
      const nx=cx+DIRS[k][0], ny=cy+DIRS[k][1];
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      const n=ny*W+nx;
      if(g[n]===0&&d[n]<0){d[n]=nd;q[qt++]=n}
    }
  }
  return d;
}
// every floor that is not a Humming Rooms floor moves on to the next biome
const ORDER=[0,1,2,3,5,6,7];
function biomeIx(depth){return ORDER[(depth-1-Math.floor(depth/4))%ORDER.length]}
function floorKind(depth){if(depth>=4&&depth%4===0)return 'back';if(depth>=7&&depth%8===7)return 'forest';if(depth>=3&&depth%4===3)return 'cave';if(depth>=5&&depth%4===1)return 'dark';return 'maze'}
function genFloor(seedStr,depth,look){
  const rng=mulberry32(hashStr(seedStr+'#'+depth));
  const ri=n=>(rng()*n)|0;
  let kind=floorKind(depth);
  const cw=Math.min(8+depth,20), ch=cw, W=cw*2+1, H=ch*2+1;
  const idx=(x,y)=>y*W+x;
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=ri(i+1);const t=a[i];a[i]=a[j];a[j]=t}return a};
  let g=null,stx=1,sty=1,cells=[];
  if(kind==='cave'){
    // cellular-automata cavern: keep the largest connected pocket
    for(let attempt=0;attempt<12&&!g;attempt++){
      let a=new Uint8Array(W*H);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++)a[idx(x,y)]=(x===0||y===0||x===W-1||y===H-1||rng()<0.42)?1:0;
      for(let it=0;it<4;it++){
        const b=new Uint8Array(W*H);
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){
          if(x===0||y===0||x===W-1||y===H-1){b[idx(x,y)]=1;continue}
          let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)n+=a[idx(x+dx,y+dy)];
          b[idx(x,y)]=n>=5?1:0;
        }
        a=b;
      }
      const lab=new Int32Array(W*H);let bestL=0,bestN=0,L=0;
      for(let i=0;i<W*H;i++){
        if(a[i]||lab[i])continue;
        L++;let n=0;const q=[i];lab[i]=L;
        while(q.length){const c=q.pop();n++;const cx=c%W,cy=(c/W)|0;
          for(const d of DIRS){const ni=idx(cx+d[0],cy+d[1]);if(!a[ni]&&!lab[ni]){lab[ni]=L;q.push(ni)}}}
        if(n>bestN){bestN=n;bestL=L}
      }
      if(bestN<W*H*0.3)continue;
      for(let i=0;i<W*H;i++)if(lab[i]!==bestL)a[i]=1;
      g=a;
    }
    if(g){
      const open=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(!g[idx(x,y)])open.push([x,y]);
      const st=open[ri(open.length)];stx=st[0];sty=st[1];
      cells=open.filter(c=>(c[0]+c[1])%2===0);
    }else kind='maze';
  }
  if(kind==='back'){
    // liminal office: a lattice of partitions, wide halls with square columns, and dead-straight corridors
    g=new Uint8Array(W*H);
    for(let x=0;x<W;x++){g[idx(x,0)]=1;g[idx(x,H-1)]=1}
    for(let y=0;y<H;y++){g[idx(0,y)]=1;g[idx(W-1,y)]=1}
    for(let y=2;y<H-2;y+=2)for(let x=2;x<W-2;x+=2){
      if(rng()<0.62){g[idx(x,y)]=1;for(const d of DIRS)if(rng()<0.44)g[idx(x+d[0],y+d[1])]=1}
    }
    const halls=3+(depth>>2);
    for(let n=0;n<halls;n++){
      const rw=3+ri(3),rh=3+ri(2),rx=ri(cw-rw+1),ry=ri(ch-rh+1);
      for(let y=ry*2+1;y<=(ry+rh-1)*2+1;y++)for(let x=rx*2+1;x<=(rx+rw-1)*2+1;x++)g[idx(x,y)]=((x&1)===0&&(y&1)===0&&((x>>1)&1)===0&&((y>>1)&1)===0)?1:0;
    }
    for(let n=0;n<2;n++){const r=ri(ch)*2+1;for(let x=1;x<W-1;x++)g[idx(x,r)]=0;const c=ri(cw)*2+1;for(let y=1;y<H-1;y++)g[idx(c,y)]=0}
    {const lab=new Int32Array(W*H);let bestL=0,bestN=0,Ln=0;
      for(let i=0;i<W*H;i++){
        if(g[i]||lab[i])continue;
        Ln++;let n=0;const q=[i];lab[i]=Ln;
        while(q.length){const c=q.pop();n++;const cx=c%W,cy=(c/W)|0;
          for(const d of DIRS){const ni=idx(cx+d[0],cy+d[1]);if(!g[ni]&&!lab[ni]){lab[ni]=Ln;q.push(ni)}}}
        if(n>bestN){bestN=n;bestL=Ln}
      }
      for(let i=0;i<W*H;i++)if(lab[i]!==bestL)g[i]=1;}
    for(let cy=0;cy<ch;cy++)for(let cx=0;cx<cw;cx++)if(!g[idx(cx*2+1,cy*2+1)])cells.push([cx*2+1,cy*2+1]);
    const stc=cells[ri(cells.length)];stx=stc[0];sty=stc[1];
  }
  if(kind!=='cave'&&kind!=='back'){
    g=new Uint8Array(W*H).fill(1);
    const vis=new Uint8Array(cw*ch);
    const sx=ri(cw), sy=ri(ch);
    const st=[[sx,sy]]; vis[sy*cw+sx]=1; g[idx(sx*2+1,sy*2+1)]=0;
    while(st.length){
      const cx=st[st.length-1][0], cy=st[st.length-1][1], opts=[];
      for(const d of DIRS){const nx=cx+d[0],ny=cy+d[1];if(nx>=0&&ny>=0&&nx<cw&&ny<ch&&!vis[ny*cw+nx])opts.push(d)}
      if(!opts.length){st.pop();continue}
      const d=opts[ri(opts.length)];
      g[idx(cx*2+1+d[0],cy*2+1+d[1])]=0; g[idx((cx+d[0])*2+1,(cy+d[1])*2+1)]=0;
      vis[(cy+d[1])*cw+cx+d[0]]=1; st.push([cx+d[0],cy+d[1]]);
    }
    // braid: open up most of the dead ends so there are loops to escape through
    for(let cy=0;cy<ch;cy++)for(let cx=0;cx<cw;cx++){
      const tx=cx*2+1,ty=cy*2+1,closed=[];let open=0;
      for(const d of DIRS){
        if(g[idx(tx+d[0],ty+d[1])]===0)open++;
        else{const nx=cx+d[0],ny=cy+d[1];if(nx>=0&&ny>=0&&nx<cw&&ny<ch)closed.push(d)}
      }
      if(open===1&&closed.length&&rng()<0.82){const d=closed[ri(closed.length)];g[idx(tx+d[0],ty+d[1])]=0}
    }
    // a few open chambers
    const nRooms=Math.min(1+(depth>>1),5);
    for(let i=0;i<nRooms;i++){
      const rw=2+ri(2),rh=2+ri(2),rx=ri(cw-rw+1),ry=ri(ch-rh+1);
      for(let y=ry*2+1;y<=(ry+rh-1)*2+1;y++)for(let x=rx*2+1;x<=(rx+rw-1)*2+1;x++)g[idx(x,y)]=0;
    }
    stx=sx*2+1; sty=sy*2+1;
    for(let cy=0;cy<ch;cy++)for(let cx=0;cx<cw;cx++)cells.push([cx*2+1,cy*2+1]);
  }
  // sanctuary: a 3x3 safe room around a brazier (tile value 4). Creatures never enter it.
  let safe=null;
  if(kind==='cave'||kind==='back'){
    const sc=[];
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      let ok=Math.abs(x-stx)+Math.abs(y-sty)>3;
      for(let dy=-1;dy<=1&&ok;dy++)for(let dx=-1;dx<=1;dx++)if(g[idx(x+dx,y+dy)]){ok=false;break}
      if(ok)sc.push([x,y]);
    }
    if(sc.length){const c=sc[ri(sc.length)];safe={tx:c[0],ty:c[1]}}
  }else{
    const rx=ri(cw-1),ry=ri(ch-1);
    for(let y=ry*2+1;y<=ry*2+3;y++)for(let x=rx*2+1;x<=rx*2+3;x++)g[idx(x,y)]=0;
    safe={tx:rx*2+2,ty:ry*2+2};
  }
  const safeMask=new Uint8Array(W*H);
  if(safe){
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)safeMask[idx(safe.tx+dx,safe.ty+dy)]=1;
    g[idx(safe.tx,safe.ty)]=4;safe.x=safe.tx+0.5;safe.z=safe.ty+0.5;
    cells=cells.filter(c=>g[idx(c[0],c[1])]===0);
  }
  // pillars: free-standing columns in chambers, stalagmites in caverns (tile value 3)
  const pillars=[];
  if(kind==='cave'){
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      if(g[idx(x,y)]||(x+y)%2===0||(x===stx&&y===sty))continue;
      let ok=true;for(let dy=-1;dy<=1&&ok;dy++)for(let dx=-1;dx<=1;dx++)if(g[idx(x+dx,y+dy)]){ok=false;break}
      if(ok&&rng()<0.07){g[idx(x,y)]=3;pillars.push([x+0.5,y+0.5])}
    }
  }else if(kind!=='back')for(let y=2;y<H-2;y+=2)for(let x=2;x<W-2;x+=2)if(g[idx(x,y)]===0&&rng()<0.6){g[idx(x,y)]=3;pillars.push([x+0.5,y+0.5])}
  const d0=bfs(g,W,H,stx,sty);
  // exit = farthest spot from the start
  let ex=stx,ey=sty,best=-1;
  for(const c of cells){const dd=d0[idx(c[0],c[1])];if(dd>best){best=dd;ex=c[0];ey=c[1]}}
  let cand=cells.filter(c=>!(c[0]===stx&&c[1]===sty)&&!(c[0]===ex&&c[1]===ey));
  // shards: spread out with farthest-point sampling on walking distance
  const minD=new Int32Array(W*H).fill(1e9);
  const addField=(x,y)=>{const f=bfs(g,W,H,x,y);for(let i=0;i<f.length;i++)if(f[i]>=0&&f[i]<minD[i])minD[i]=f[i]};
  addField(stx,sty);addField(ex,ey);
  const items=[];
  const put=(type,c)=>items.push({type,tx:c[0],ty:c[1],x:c[0]+0.5,z:c[1]+0.5,got:false,ph:rng()*6.28});
  for(let s=0;s<3;s++){
    let bi=0,bv=-1;
    for(let i=0;i<cand.length;i++){const v=minD[idx(cand[i][0],cand[i][1])]+rng()*2;if(v>bv){bv=v;bi=i}}
    const c=cand.splice(bi,1)[0];put('shard',c);addField(c[0],c[1]);
  }
  shuffle(cand);
  // creatures start well away from the player. type 0 shade, 1 stalker, 2 wisp
  const shades=[];
  let far=cand.filter(c=>d0[idx(c[0],c[1])]>12);
  if(far.length<8)far=cand.filter(c=>d0[idx(c[0],c[1])]>6);
  far=far.filter(c=>!safeMask[idx(c[0],c[1])]);
  const spawn=(type,n)=>{for(let i=0;i<n&&far.length;i++){const c=far.splice(ri(far.length),1)[0];
    shades.push({type,x:c[0]+0.5,z:c[1]+0.5,gx:c[0],gy:c[1],px:-1,py:-1,state:0,stun:0,think:rng()*0.2,vis:false,frozen:false,ph:rng()*6.28,d:99,snd:0})}};
  if(kind==='back'){spawn(0,Math.max(1,Math.min(Math.floor(depth*0.3),4)));spawn(3,1+(depth>=12?1:0))}
  else{
    spawn(0,Math.min(1+Math.floor((depth-1)*0.6),7));
    spawn(1,depth>=3?1+(depth>=7?1:0)+(depth>=11?1:0):0);
    spawn(2,depth>=2?1+(depth>=6?1:0):0);
  }
  for(const q of shades)if(q.type===3){q.hid=6+rng()*6;q.hx=q.x;q.hz=q.z;q.x=-99;q.z=-99}
  let pool=cand.filter(c=>d0[idx(c[0],c[1])]>2);
  const nCells=cw*ch;
  const take=(type,n)=>{for(let i=0;i<n&&pool.length;i++)put(type,pool.pop())};
  take('oil',Math.round((Math.round(nCells/20)+1)*(kind==='dark'?1.5:1)));
  take('flash',1+(depth>3?1:0));
  if(depth>1&&rng()<0.6)take('heart',1);
  // corridor tiles: exactly two open neighbours, opposite each other
  const corr=[];
  if(kind!=='cave'&&kind!=='back')for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    if(g[idx(x,y)]||safeMask[idx(x,y)]||((x&1)===(y&1)))continue;
    const l=g[idx(x-1,y)],r=g[idx(x+1,y)],u=g[idx(x,y-1)],dn=g[idx(x,y+1)];
    if((!l&&!r&&u&&dn)||(l&&r&&!u&&!dn))corr.push([x,y]);
  }
  // one locked gate that seals off part of the floor; its key is always on the near side
  let door=null;
  if(kind!=='cave'&&kind!=='back'&&depth>=2){
    let total=0;for(let i=0;i<W*H;i++)if(!g[i])total++;
    for(const c of shuffle(corr.slice())){
      const di=idx(c[0],c[1]);
      if(d0[di]<4)continue;
      g[di]=2;
      const f=bfs(g,W,H,stx,sty);let reach=0;for(let i=0;i<W*H;i++)if(f[i]>=0)reach++;
      const behind=total-1-reach;
      const ki=(!safe||f[idx(safe.tx-1,safe.ty)]>=0)&&behind>=total*0.08&&behind<=total*0.5?pool.findIndex(q=>f[idx(q[0],q[1])]>5):-1;
      if(ki<0){g[di]=0;continue}
      put('key',pool.splice(ki,1)[0]);
      door={tx:c[0],ty:c[1],ax:g[idx(c[0]-1,c[1])]!==1?0:1};
      // a little reward waiting behind the gate
      let bonus=0;
      for(let i=pool.length-1;i>=0&&bonus<3;i--){if(f[idx(pool[i][0],pool[i][1])]<0){put(bonus===0?'oil':bonus===1?'flash':'heart',pool.splice(i,1)[0]);bonus++}}
      break;
    }
  }
  // friendly faces: the Keeper tends every sanctuary, and a wanderer sometimes waits in the maze
  const npcs=[];
  if(safe)npcs.push({type:'keeper',x:safe.x+0.62,z:safe.z+0.62,ph:rng()*6.28,used:false});
  // the Wheel of Misfortune stands in a sanctuary corner with no passage beside it (away from the Keeper when it can), Pat Sajak at its side.
  // Placed without drawing from rng so the rest of the floor is the same as before.
  if(safe){
    const closed=(cx,cz)=>g[idx(safe.tx+2*cx,safe.ty+cz)]===1&&g[idx(safe.tx+cx,safe.ty+2*cz)]===1;
    const c=[[-1,-1],[1,-1],[-1,1]].find(q=>closed(q[0],q[1]))||[-1,-1];
    const wx=safe.x+c[0]*1.1,wz=safe.z+c[1]*1.1,nx=-c[0]*Math.SQRT1_2,nz=-c[1]*Math.SQRT1_2;   // n: the way the wheel faces (into the room)
    safe.wheel={x:wx,z:wz,nx,nz,yaw:Math.atan2(nx,nz),pat:[wx+nz*0.56+nx*0.24,wz-nx*0.56+nz*0.24],
      discs:[[wx-nx*0.03,wz-nz*0.03,0.24],[wx+nz*0.38,wz-nx*0.38,0.07],[wx-nz*0.38,wz+nx*0.38,0.07]]};   // the stand's middle and both posts, for collision
  }
  {const r=rng(),wt=depth===1?'map':r<0.4?'map':r<0.75?'delver':null;
    if(wt&&pool.length){const c=pool.pop(),w={type:wt,x:c[0]+0.5,z:c[1]+0.5,ph:rng()*6.28,used:false,gift:ri(3),tip:ri(6)};
      for(const d of DIRS)if(g[idx(c[0]+d[0],c[1]+d[1])]===1){w.ox=d[0]*0.27;w.oz=d[1]*0.27;w.wy=Math.atan2(-d[1],-d[0]);break}
      npcs.push(w)}}
  take('gem',Math.round(nCells/6));
  // spike traps
  const traps=[];
  if(depth>=2){
    let tc;
    if(kind==='cave'){tc=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(!g[idx(x,y)]&&!safeMask[idx(x,y)]&&(x+y)%2===1&&d0[idx(x,y)]>4)tc.push([x,y])}
    else tc=corr.filter(c=>d0[idx(c[0],c[1])]>3&&g[idx(c[0],c[1])]===0&&!(door&&Math.abs(c[0]-door.tx)+Math.abs(c[1]-door.ty)<=2));
    shuffle(tc);
    const n=Math.min(2+depth,14);
    for(let i=0;i<n&&i<tc.length;i++)traps.push({tx:tc[i][0],ty:tc[i][1],x:tc[i][0]+0.5,z:tc[i][1]+0.5,ph:rng()*2.8,up:false});
  }
  // wall torches and rubble
  const sconces=[],rubble=[];
  if(kind!=='dark'&&kind!=='back'){
    const sc=[];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){if(g[idx(x,y)]!==0)continue;
      for(const d of DIRS)if(g[idx(x+d[0],y+d[1])]===1){sc.push([x,y,d[0],d[1]]);break}}
    shuffle(sc);const maxS=Math.round(nCells/(kind==='cave'?30:16));
    for(const c of sc){
      if(sconces.length>=maxS)break;
      const px=c[0]+0.5+c[2]*0.44,pz=c[1]+0.5+c[3]*0.44;
      if(Math.hypot(px-stx-0.5,pz-sty-0.5)<2||sconces.some(q=>Math.hypot(q.x-px,q.z-pz)<5.5))continue;
      sconces.push({x:px,z:pz,dx:c[2],dz:c[3],lx:c[0]+0.5+c[2]*0.2,lz:c[1]+0.5+c[3]*0.2,ph:rng()*6.28});
    }
  }
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    if(kind==='back'||g[idx(x,y)]!==0||rng()>0.16)continue;
    for(const d of DIRS)if(g[idx(x+d[0],y+d[1])]===1){
      const n=1+ri(3);
      for(let k=0;k<n;k++){const along=(rng()-0.5)*0.8,off=0.36+rng()*0.08;
        rubble.push({x:x+0.5+(d[0]?d[0]*off:along),z:y+0.5+(d[1]?d[1]*off:along),s:0.04+rng()*0.07,r:rng()*6.28,sy:0.5+rng()*0.6})}
      break;
    }
  }
  // fluorescent panels over the humming rooms
  const panels=[],panelAt=new Uint8Array(W*H);
  if(kind==='back')for(const c of cells)if(rng()<0.72){const bad=rng()<0.13;panelAt[idx(c[0],c[1])]=bad?2:1;panels.push({x:c[0]+0.5,z:c[1]+0.5,ph:c[0]*1.7+c[1]*2.3,bad})}
  // noclip pockets: a wall you can walk through, hiding a scrap of somewhere else
  const pocketMask=new Uint8Array(W*H),phantoms=[],pockets=[];
  if(kind!=='back'){
    const pc=[];
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      if(g[idx(x,y)]!==1)continue;
      let open=null,walls=0;
      for(const d of DIRS){const v=g[idx(x+d[0],y+d[1])];if(v===1)walls++;else if(v===0)open=d}
      if(walls!==3||!open)continue;
      const ai=idx(x+open[0],y+open[1]);
      if(safeMask[ai]||(x+open[0]===stx&&y+open[1]===sty)||d0[ai]<4)continue;
      if(door&&Math.abs(x-door.tx)+Math.abs(y-door.ty)<=2)continue;
      pc.push([x,y,open[0],open[1]]);
    }
    shuffle(pc);
    const want=(rng()<0.4?1:0)+(depth>=6&&rng()<0.3?1:0);
    for(let n=0;n<want&&n<pc.length;n++){
      const c=pc[n],i=idx(c[0],c[1]);
      if(pockets.some(q=>Math.abs(q.tx-c[0])+Math.abs(q.ty-c[1])<4))continue;
      g[i]=0;pocketMask[i]=1;
      phantoms.push({tx:c[0],ty:c[1],dx:c[2],dz:c[3]});pockets.push({tx:c[0],ty:c[1],x:c[0]+0.5,z:c[1]+0.5,found:false});
      items.push({type:'chest',tx:c[0],ty:c[1],x:c[0]+0.5,z:c[1]+0.5,got:false,ph:rng()*6.28});
    }
  }
  // room dressing: things in corners, banners and chains on walls, stalactites in caverns
  const props=[],discs=[];
  {const busy=new Set(),used=new Set(),bix=biomeIx(depth);
    for(const n of npcs)busy.add(idx(Math.floor(n.x),Math.floor(n.z)));
    for(const tr of traps)busy.add(idx(tr.tx,tr.ty));
    busy.add(idx(stx,sty));busy.add(idx(ex,ey));
    const special=['urn','shroom','ice','ember','urn','bones','barrel','ice'][bix];
    const types=kind==='back'?['boxes','boxes','cabinet','cabinet','plant','chair','chair']:kind==='forest'?['log','log','stump','stump','fern','shroom','sack','bones','fern']:kind==='cave'?['bones','bones','sack',special,special,special,'urn']:['barrel','barrel','crate','crate','urn','sack','bones',special,special];
    const RAD={log:0.13,stump:0.14,barrel:0.13,crate:0.15,urn:0.09,sack:0.11,ice:0.08,ember:0.11,boxes:0.15,cabinet:0.14,plant:0.08,chair:0.13};
    const cands=[];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      const i=idx(x,y);if(g[i]!==0||safeMask[i]||pocketMask[i]||busy.has(i))continue;
      if(phantoms.some(q=>q.tx+q.dx===x&&q.ty+q.dz===y))continue;
      if(door&&Math.abs(x-door.tx)+Math.abs(y-door.ty)<=1)continue;
      cands.push([x,y,g[idx(x+1,y)]===1?1:g[idx(x-1,y)]===1?-1:0,g[idx(x,y+1)]===1?1:g[idx(x,y-1)]===1?-1:0]);
    }
    shuffle(cands);
    const maxC=Math.round(nCells/5),maxW=Math.round(nCells/7);let nc=0,nw=0;
    for(const c of cands){
      const x=c[0],y=c[1],wx=c[2],wz=c[3],i=idx(x,y);
      if(wx&&wz){
        if(nc>=maxC||used.has(i-1)||used.has(i+1)||used.has(i-W)||used.has(i+W))continue;
        const t=types[ri(types.length)],sc=0.85+rng()*0.3,px=x+0.5+wx*0.31,pz=y+0.5+wz*0.31;
        props.push({t,x:px,z:pz,r:rng()*6.28,s:sc,v:rng()<0.45?1:0});
        if(RAD[t])discs.push([px,pz,RAD[t]*sc]);
        used.add(i);nc++;
      }else if((wx||wz)&&nw<maxW&&kind!=='back'){
        const dx=wx,dz=wx?0:wz;
        if(kind!=='cave'&&rng()<0.4){
          const bx=x+0.5+dx*0.5,bz=y+0.5+dz*0.5;
          if(sconces.some(q=>Math.hypot(q.x-bx,q.z-bz)<0.9))continue;
          props.push({t:'banner',x:bx,z:bz,r:Math.atan2(-dz,-dx),s:1,v:rng()<0.5?1:0});
        }else props.push({t:'chain',x:x+0.5+dx*0.38+(rng()-0.5)*0.1,z:y+0.5+dz*0.38+(rng()-0.5)*0.1,r:rng()*6.28,s:1,v:ri(3)});
        nw++;
      }else if(kind==='cave'&&!wx&&!wz&&rng()<0.14)props.push({t:'stal',x:x+0.5+(rng()-0.5)*0.5,z:y+0.5+(rng()-0.5)*0.5,r:rng()*6.28,s:0.7+rng()*0.6,v:0});
    }}
  // a forest keeps no banners or chains: nothing to hang them on
  if(kind==='forest')for(let i=props.length-1;i>=0;i--)if(props[i].t==='banner'||props[i].t==='chain')props.splice(i,1);
  // strange doors: set into a wall, and what is behind one is never the maze. They draw on their own
  // dice so that the rest of the floor stays the same as it always was for a seed.
  const sdoors=[];
  {const dr=mulberry32(hashStr(seedStr+'#doors'+depth)),dc=[];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
      const i=idx(x,y);
      if(g[i]!==0||safeMask[i]||pocketMask[i]||d0[i]<3||(x===ex&&y===ey))continue;
      if(traps.some(q=>q.tx===x&&q.ty===y)||npcs.some(q=>Math.floor(q.x)===x&&Math.floor(q.z)===y))continue;
      if(door&&Math.abs(x-door.tx)+Math.abs(y-door.ty)<=1)continue;
      for(const d of DIRS){
        if(g[idx(x+d[0],y+d[1])]!==1)continue;
        const px=x+0.5+d[0]*0.5,pz=y+0.5+d[1]*0.5;
        if(sconces.some(q=>Math.hypot(q.x-px,q.z-pz)<0.85)||props.some(q=>Math.hypot(q.x-px,q.z-pz)<0.66))continue;
        dc.push([x,y,d[0],d[1],px,pz]);
      }
    }
    for(let i=dc.length-1;i>0;i--){const j=(dr()*(i+1))|0;const t=dc[i];dc[i]=dc[j];dc[j]=t}
    const plan=doorPlan(seedStr,depth),want=plan.count;
    const place=gap=>{for(const c of dc){
      if(sdoors.length>=want)break;
      if(sdoors.some(q=>Math.abs(q.tx-c[0])+Math.abs(q.ty-c[1])<gap))continue;
      sdoors.push({tx:c[0],ty:c[1],dx:c[2],dz:c[3],x:c[4],z:c[5],r:Math.atan2(-c[3],-c[2]),kind:plan.kinds[sdoors.length],used:false,ph:dr()*6.28});
    }};
    place(6);if(sdoors.length<want)place(3);
    // every door wears a look. A disguise kind (the trap) picks one with the door rng AFTER placement so positions and kinds never move.
    const own=doorDisguises();
    for(const D of sdoors){const k=DOOR_KINDS[D.kind]||{};D.look=k.disguise?(own[(dr()*own.length)|0]||'wood'):(k.look||'wood')}}
  // someone who looks like a neighbor, and is not one. Drawn last, from its own dice and a spare cell, so the rest of the floor stays the same as it always was for a seed.
  if(depth>=2){const lr=mulberry32(hashStr(seedStr+'#lurk'+depth)),ok=pool.filter(c=>!traps.some(q=>q.tx===c[0]&&q.ty===c[1])&&!sdoors.some(q=>q.tx===c[0]&&q.ty===c[1]));
    if(lr()<0.7&&ok.length){const c=ok[(lr()*ok.length)|0],guise=lr()<0.4?'delver':'map';
      npcs.push({type:'lurk',guise,x:c[0]+0.5,z:c[1]+0.5,ph:lr()*6.28,gift:0,tip:0,
        gx:c[0],gy:c[1],px:-1,py:-1,stare:0,aggro:false,face:lr()*6.28,hitT:0,used:true})}}
  // face down an open corridor at the start
  let yaw=0;
  for(const d of DIRS){if(g[idx(stx+d[0],sty+d[1])]===0){yaw=Math.atan2(d[1],d[0]);break}}
  const bi=look&&look.bi!=null?look.bi:kind==='back'?4:kind==='forest'?8:biomeIx(depth);
  // looks are drawn last, from their own dice, so nothing above ever moves
  const vr=mulberry32(hashStr(seedStr+'#var#'+depth)),variant=pickVariant(vr,bi,look&&look.ix),B=BIOMES[bi];
  const litter=[];
  if(variant.rubbleK>1&&kind!=='back'){
    const spots=[];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=idx(x,y);if(g[i]!==0||safeMask[i]||pocketMask[i]||(x===stx&&y===sty)||(x===ex&&y===ey))continue;
      for(const d of DIRS)if(g[idx(x+d[0],y+d[1])]===1){spots.push([x,y,d]);break}}
    const n=Math.min(spots.length,Math.round(nCells/10*(variant.rubbleK-1)));
    for(let k=0;k<n;k++){const j=k+((vr()*(spots.length-k))|0),c=spots[j];spots[j]=spots[k];spots[k]=c;
      const m=1+((vr()*3)|0),off=0.3+vr()*0.12;
      for(let q=0;q<m;q++){const along=(vr()-0.5)*0.8;
        litter.push({x:c[0]+0.5+(c[2][0]?c[2][0]*off:along),z:c[1]+0.5+(c[2][1]?c[2][1]*off:along),s:0.04+vr()*0.08,r:vr()*6.28,sy:0.5+vr()*0.6})}}
  }
  const stone=[B.stone[0]*variant.stone[0],B.stone[1]*variant.stone[1],B.stone[2]*variant.stone[2]];
  const forest=bi===8;
  // Pat joins after props and items are placed, so he changes nothing else about the floor
  if(safe&&safe.wheel)npcs.push({type:'pat',x:safe.wheel.pat[0],z:safe.wheel.pat[1],ph:(safe.tx*7.31+safe.ty*3.7)%6.28,used:true});
  return {W,H,g,cw,ch,kind:forest?'forest':kind==='forest'?'maze':kind,dark:kind==='dark',back:kind==='back',base:B.base,variant,litter,stone,wet:clamp(B.wet*variant.wetK,0,1),fogK:variant.fogK,ambK:variant.ambK,ambT:variant.ambT,torchT:variant.torch,tex:{v:variant.tex,seed:variant.seed,tint:variant.tint},panels,panelAt,pocketMask,phantoms,pockets,blk:0,boT:22+rng()*25,props,discs,safe,safeMask,npcs,reveal:false,door,sdoors,traps,pillars,sconces,rubble,frames:[],start:{tx:stx,ty:sty,yaw},exit:{tx:ex,ty:ey,x:ex+0.5,z:ey+0.5},items,shades,
          seen:new Uint8Array(W*H),dist:d0,bi,biome:B,...(forest?{forest:true,fo:{seed:seedStr,depth}}:{}),
          name:kind==='cave'?'The Hollow':kind==='dark'?'The Black Hush':BIOMES[bi].name};
}
function trapExt(tr,time){const t=(time+tr.ph)%2.8;return t<0.12?t/0.12:t<1.0?1:t<1.2?1-(t-1)/0.2:0}

/* ---------- Three.js scene, lights and materials ---------- */
const POST=Q>=1, NORMALMAP=Q>=1, SHADOWS=Q>=2?2:Q>=1?1:0;
const NPOOL=Q>=2?10:Q>=1?8:6, NSHAD=Q>=2?2:0;
renderer.setClearColor(0x000000,1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled=SHADOWS>0;
renderer.shadowMap.type=Q>=2?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(72,1,0.03,60);
scene.add(camera);
scene.fog=new THREE.FogExp2(0x000000,0.062);
const ambLight=new THREE.AmbientLight(0xffffff,1);scene.add(ambLight);
if(Q>=1&&!SAFE){
  const pm=new THREE.PMREMGenerator(renderer);
  scene.environment=pm.fromScene(new RoomEnvironment(),0.04).texture;
  scene.environmentIntensity=0.05;pm.dispose();
}
const torchLight=new THREE.PointLight(0xffffff,0,8,1.0);
if(SHADOWS){torchLight.castShadow=true;torchLight.shadow.mapSize.set(Q>=2?1024:512,Q>=2?1024:512);torchLight.shadow.camera.near=0.04;torchLight.shadow.camera.far=9;torchLight.shadow.bias=-0.003;torchLight.shadow.normalBias=0.025;torchLight.shadow.camera.layers.enable(1)}
scene.add(torchLight);
const flashLight=new THREE.PointLight(0xd9edff,0,9,1);scene.add(flashLight);
const poolLights=[],shadLights=[];
for(let i=0;i<NPOOL;i++){const l=new THREE.PointLight(0xffffff,0,4,1.25);scene.add(l);poolLights.push(l)}
for(let i=0;i<NSHAD;i++){const l=new THREE.PointLight(0xffffff,0,4,1.25);l.castShadow=true;l.shadow.mapSize.set(512,512);l.shadow.camera.near=0.05;l.shadow.camera.far=8;l.shadow.bias=-0.004;l.shadow.normalBias=0.03;l.shadow.autoUpdate=false;l.shadow.camera.layers.enable(1);l.userData.key='';scene.add(l);shadLights.push(l)}
// flames are not points: cap how hot a surface right next to one can get, and let light fade out more gently toward its reach
THREE.ShaderChunk.lights_pars_begin=THREE.ShaderChunk.lights_pars_begin
  .replace('max( pow( lightDistance, decayExponent ), 0.01 )','max( pow( lightDistance, decayExponent ), 0.6 )')
  .replace('pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) )','pow2( saturate( 1.0 - pow2( lightDistance / cutoffDistance ) ) )');
const UT={value:0};
const NOISE_GLSL=`
float wHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float wNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(wHash(i),wHash(i+vec2(1.0,0.0)),f.x),mix(wHash(i+vec2(0.0,1.0)),wHash(i+vec2(1.0,1.0)),f.x),f.y);}
`;
// world surfaces: parallax depth from the normal map's alpha, fine grain, puddles, flickering panels
function worldMaterial(o){
  const tex=SAFE?null:SURFS.get(o.layer,o.tex);
  const emU={value:o.panel?(Q===0?1.3:2.6):(Q===0?1.6:3.4)};
  const mapChunk=THREE.ShaderChunk.map_fragment.replace(/vMapUv/g,'pUv')+'\nfloat wEm=clamp(1.0-2.0*sampledDiffuseColor.a,0.0,1.0);float wRough=clamp(2.0*sampledDiffuseColor.a-1.0,0.0,1.0);diffuseColor.a=1.0;\n';
  const flicker=o.bad?'{float ph=floor(vWPos.x)*1.7+floor(vWPos.z)*2.3;if(sin(uTime*31.0+ph)+sin(uTime*47.7+ph*2.0)<0.4)wEmis*=0.08;}':'';
  if(Q===0){
    const m=new THREE.MeshLambertMaterial({map:tex?tex.map:null,color:SAFE?(o.kind===1?0x6a655c:o.kind===3?0x80501e:0x6b6b6b):0xffffff,side:THREE.DoubleSide});
    m.userData.panel=!!o.panel;m.userData.em=emU;
    if(tex)m.onBeforeCompile=sh=>{
      sh.uniforms.uTime=UT;sh.uniforms.uEmK=emU;
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWPos=position;');
      sh.fragmentShader=sh.fragmentShader
        .replace('#include <common>','#include <common>\nvarying vec3 vWPos;uniform float uTime;uniform float uEmK;')
        .replace('#include <map_fragment>','vec2 pUv=vMapUv;\n'+mapChunk)
        .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n{float wEmis=wEm*uEmK;${flicker}totalEmissiveRadiance+=diffuseColor.rgb*wEmis;}`);
    };
    m.customProgramCacheKey=()=>'wl'+(o.bad?1:0);
    return m;
  }
  const m=new THREE.MeshStandardMaterial({map:tex.map,normalMap:tex.nrm,roughness:1,metalness:0,side:THREE.DoubleSide});
  m.userData.panel=!!o.panel;m.userData.em=emU;
  const steps=Q>=2?12:1;
  m.onBeforeCompile=sh=>{
    sh.uniforms.uTime=UT;sh.uniforms.uWet={value:o.wet||0};sh.uniforms.uEmK=emU;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;varying vec3 vWNor;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvWPos=position;vWNor=normal;');
    const nrmChunk=THREE.ShaderChunk.normal_fragment_maps.replace(/vNormalMapUv/g,'pUv');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vWPos;varying vec3 vWNor;uniform float uTime;uniform float uWet;uniform float uEmK;'+NOISE_GLSL)
      .replace('#include <map_fragment>',`
  vec2 pUv=vMapUv;float wDist=distance(vWPos,cameraPosition);float pud=0.0;
  {vec3 Ng=normalize(vWNor);
    vec3 Tw=abs(Ng.x)>0.5?vec3(0.0,0.0,1.0):vec3(1.0,0.0,0.0);
    vec3 Bw=abs(Ng.y)>0.5?vec3(0.0,0.0,1.0):vec3(0.0,-1.0,0.0);
    ${o.panel||o.phantom?'':`if(wDist<9.0){
      vec3 Vw=(cameraPosition-vWPos)/wDist;
      vec3 vt=vec3(dot(Vw,Tw),dot(Vw,Bw),abs(dot(Vw,Ng)));
      float sc=${o.depth.toFixed(3)}*(abs(Ng.y)>0.5?0.5:1.0)*smoothstep(9.0,6.0,wDist);
      vec2 full=-vt.xy/max(vt.z,0.3)*sc;vec2 gx=dFdx(vMapUv),gy=dFdy(vMapUv);
      ${steps>1?`float lh=1.0/${steps}.0,cur=0.0,d=textureGrad(normalMap,pUv,gx,gy).a,pd=d;vec2 st=full*lh;
      for(int i=0;i<${steps};i++){if(cur>=d)break;pUv+=st;cur+=lh;pd=d;d=textureGrad(normalMap,pUv,gx,gy).a;}
      float pa=d-cur,pb=pd-(cur-lh);pUv-=st*clamp(pa/(pa-pb-1e-5),0.0,1.0);`
      :`pUv+=full*textureGrad(normalMap,pUv,gx,gy).a;`}
    }`}
  }
  ${mapChunk}
  ${o.panel?'':`if(wDist<3.0){vec2 dp=vec2(vWPos.x+vWPos.y*0.71,vWPos.z+vWPos.y*0.93);
    diffuseColor.rgb*=1.0+(wNoise(dp*61.0)*0.6+wNoise(dp*137.0)*0.4-0.5)*0.16*smoothstep(3.0,1.0,wDist);}`}
  ${o.phantom?'diffuseColor.rgb*=0.86+0.14*sin(uTime*2.3+vWPos.y*11.0+(vWPos.x+vWPos.z)*5.0);':''}
  ${o.kind===1?'if(uWet>0.0){pud=smoothstep(0.6,0.7,wNoise(vWPos.xz*0.9))*uWet*smoothstep(0.25,0.6,texture2D(normalMap,pUv).a+0.25);diffuseColor.rgb*=mix(1.0,0.5,pud);}':''}
`)
      .replace('#include <roughnessmap_fragment>','float roughnessFactor=mix(max(wRough,0.05),0.05,pud);')
      .replace('#include <normal_fragment_maps>',`vec3 flatN=normal;\n${nrmChunk}\nnormal=normalize(mix(normal,flatN,pud*0.9));`)
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\n{float wEmis=wEm*uEmK;${flicker}totalEmissiveRadiance+=diffuseColor.rgb*wEmis;}`);
  };
  m.customProgramCacheKey=()=>'w'+[o.kind,o.panel?1:0,o.phantom?1:0,o.bad?1:0,steps,o.depth].join(',');
  return m;
}
const worldMats=new Map();
// after a floor is built, free the surfaces and materials it did not ask for so GPU memory stays flat
function sweepWorld(){
  for(const [k,m] of worldMats)if(!m.userData.used){m.dispose();worldMats.delete(k)}else m.userData.used=false;
  SURFS.sweep();
}
function getWorldMat(F,k){
  const office=k>=10,kd=k%10,panel=kd===4||kd===6,B=F.biome,stoneFr=kd===7;
  const base=office?13:stoneFr?0:F.base,tex=office||kd===3||panel||stoneFr?null:F.tex;
  const layer=kd===3?12:base+(panel?3:kd===5||stoneFr?0:kd);
  const kind=kd===3?3:panel?2:kd===5||stoneFr?0:kd;
  const wet=kind===1?(office?0.25:F.kind==='cave'?1:F.wet):0;
  const gl2=office?BIOMES[4].spec:B.spec,g=kind===3?0.15:gl2[kind];
  const key=[layer,kd,wet,tex?SURFS.key(tex):''].join(':');
  let m=worldMats.get(key);
  if(!m){m=worldMaterial({layer,kind,panel,bad:kd===6,phantom:kd===5,wet,tex,depth:layer===13?0.02:layer===14?0.025:layer>=15&&layer<17?0.03:0.06});worldMats.set(key,m)}
  m.userData.used=true;
  return m;
}
// characters, creatures and decor: painted procedural materials on top of physically based shading
const MAT_GLSL=`
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){return n3(p)*0.6+n3(p*2.3)*0.3+n3(p*5.1)*0.1;}
// Embroidery motifs from a per-vertex band coordinate (npc_kit trimBand 'band', stole borders): b.x = cell coordinate along the band
// (one motif per unit, an integer count round a closed loop), b.y = 2*motif + v with v 0..1 across the band. Pattern only, no textures.
float sdSegE(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0));}
float covE(float d,float aa){return clamp(0.5-d/aa,0.0,1.0);}
// returns (ink, border line). motif 1 = rows of ember flames with a bright core, 2 and 3 = Greek key (meander); aa = one pixel in cell units
vec2 embroidery(vec2 b,float motif,float aa){
  float v=b.y,fu=fract(b.x),x=fu-0.5;vec2 r=vec2(0.0);
  r.y=covE(min(abs(v-0.075),abs(v-0.925))-0.03,aa);
  if(motif<1.5){
    float t=clamp((v-0.16)/0.68,0.0,1.0),w=0.36*sin(3.14159*pow(t,0.6))*(1.0-0.45*t),c=0.12*sin(t*2.6+1.0)*t;
    float d=max(abs(x-c)-w,max(0.16-v,v-0.84));
    float t2=clamp((t-0.08)/0.55,0.0,1.0),w2=0.5*0.36*sin(3.14159*pow(t2,0.6))*(1.0-0.45*t2),dc=max(abs(x-c*0.9)-w2,max(0.2-v,v-0.55));
    r.x=covE(d,aa)*(1.0-covE(dc,aa));
    float xe=fu<0.5?fu:fu-1.0;r.x=max(r.x,covE(abs(xe)+abs(v-0.5)*1.2-0.085,aa)); // a bead between flames
  }else{
    vec2 g=vec2(fu,clamp((v-0.17)/0.66,0.0,1.0));float d=sdSegE(g,vec2(0.0,0.1),vec2(1.0,0.1));
    d=min(d,sdSegE(g,vec2(0.1,0.1),vec2(0.1,0.9)));d=min(d,sdSegE(g,vec2(0.1,0.9),vec2(0.9,0.9)));d=min(d,sdSegE(g,vec2(0.9,0.9),vec2(0.9,0.3)));
    d=min(d,sdSegE(g,vec2(0.9,0.3),vec2(0.4,0.3)));d=min(d,sdSegE(g,vec2(0.4,0.3),vec2(0.4,0.65)));d=min(d,sdSegE(g,vec2(0.4,0.65),vec2(0.65,0.65)));
    r.x=covE((d-0.06)*0.66,aa)*step(0.17,v)*step(v,0.83);
  }
  return r;
}
`;
let HAIR_TEX=null;
function hairTex(){ // procedural strand atlas for hair cards (npc_hair.js), generated once at load
  if(HAIR_TEX)return HAIR_TEX;const a=hairAtlas(512);
  const t=new THREE.DataTexture(a.data,a.w,a.h,THREE.RGBAFormat,THREE.UnsignedByteType);t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=4;t.needsUpdate=true;return HAIR_TEX=t}
function paintedMaterial(glowBase){
  if(Q===0)return new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,emissive:new THREE.Color(glowBase,glowBase,glowBase)});
  const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.7,metalness:0,side:THREE.DoubleSide});
  m.onBeforeCompile=sh=>{
    sh.uniforms.uGlowBase={value:glowBase};sh.uniforms.uStrand={value:hairTex()};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 aLoc;varying vec4 vLoc;attribute vec3 aBand;varying vec3 vBand;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvLoc=aLoc;vBand=aBand;');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec4 vLoc;varying vec3 vBand;uniform float uGlowBase;uniform sampler2D uStrand;float hh1(float x){return fract(sin(x*12.9898)*43758.5453);}float mRough=0.7;float mMetal=0.0;float mGlow=0.0;float mRim=0.0;float mSss=0.0;float mRimK=0.0;float mBump=0.0;float mAux=0.0;float mCh=0.0;float mWeave=1.0;float mEmb=0.0;vec3 mTan=vec3(0.0);float mKK=0.0;float mHairH=0.0;'+MAT_GLSL)
      .replace('#include <lights_physical_pars_fragment>',()=>THREE.ShaderChunk.lights_physical_pars_fragment.replace('vec3 irradiance = dotNL * directLight.color;',
        // cheap subsurface look: wrapped diffuse that lets light bleed past the terminator, tinted red where it fades
        `float nlS=dot(geometryNormal,directLight.direction);
	vec3 irradiance=directLight.color*(mSss>0.001?pow(saturate((nlS+mSss)/(1.0+mSss)),2.0)*mix(vec3(1.0),vec3(1.0,0.5,0.34),mSss*(1.0-saturate(nlS*3.0))):vec3(dotNL));`).replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        // hair: dim Kajiya-Kay anisotropic highlight, a streak across the strands (tangent mTan from the flow coordinates)
        `if(mKK>0.0){vec3 Hh=normalize(directLight.direction+geometryViewDir);float th=dot(mTan,Hh),sn=sqrt(max(1.0-th*th,0.0));reflectedLight.directSpecular+=min(directLight.color,vec3(4.0))*pow(sn,40.0)*saturate(dotNL*3.0)*mKK*0.035*vec3(1.0,0.94,0.82);}
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );`))
      .replace('#include <color_fragment>',`
  {vec3 alb=vColor.rgb,q=vLoc.xyz;int m=int(floor(vLoc.w+0.002));mAux=fract(vLoc.w+0.002)*1.1;
    float fine=clamp(1.6-vViewPosition.z*0.45,0.0,1.0); // vViewPosition.z is the distance: fade fine detail out with it
    float mott=fbm3(q*34.0);
    float mo=floor(vBand.z+0.5);vec2 emb=vec2(0.0);{float fwB=max(fwidth(vBand.x),fwidth(vBand.y))*0.9;if((m==13||m==15)&&mo>0.5&&mo<3.5)emb=embroidery(vBand.xy,mo,max(fwB,0.004))*step(-0.001,vBand.y)*step(vBand.y,1.001);}
    // weave: fade by how many radians of the 1500 rad/m pattern fall in one pixel; above ~1 rad/px it aliases into moire, so it dissolves into plain cloth
    float wPh1=q.y*1500.0,wPh2=(q.x+q.z)*1500.0,wFade=1.0-smoothstep(0.7,1.5,max(fwidth(wPh1),fwidth(wPh2)));
    mWeave=wFade;
    if(m==1){alb*=0.92+0.16*mott;mRough=0.55;mSss=0.2;mRimK=0.02;}
    else if(m==12){ // sculpted skin (npc_kit): colour variation comes painted per vertex, mAux marks wrinkle areas
      alb*=0.9+0.2*mott;
      alb=mix(alb,alb*vec3(1.06,0.9,0.86),smoothstep(0.45,0.75,fbm3(q*90.0))*0.5); // blotches and age spots
      mRough=0.66;mSss=0.28;mRimK=0.015;mBump=1.0;
    }else if(m==13){ // sculpted cloth: folds are in the geometry, so the shader only adds weave, nap and sheen
      float folds=n3(vec3(q.x*55.0,q.y*5.0,q.z*55.0));
      float weave=sin(q.y*1500.0)*sin((q.x+q.z)*1500.0);
      alb*=(0.88+0.2*folds)*(0.93+0.14*mott)*(1.0+0.06*weave*fine*wFade);mRough=0.88;mRimK=0.09;mBump=1.0;
      if(!gl_FrontFacing)alb*=0.5; // simulated cloth is a single sheet: its inside (sleeve mouths, hem) is darker
      if(mo>2.5&&mo<3.5){ // stole: gold meander border worked into the cloth
        float th=max(emb.x,emb.y);mEmb=th;alb=mix(alb,vec3(0.82,0.6,0.2)*(0.78+0.3*n3(q*400.0)),th);mRough=mix(0.9,0.45,th);mMetal=0.3*th;
      }else if(mo>4.5){ // leather: grain, no weave
        float gr=fbm3(q*210.0);alb*=0.8+0.4*gr;alb*=1.0-0.35*smoothstep(0.55,0.75,n3(q*520.0));mRough=0.55;mRimK=0.02;mSss=0.0;
      }
    }else if(m==15){ // sculpted trim: gold thread embroidery, a running pattern of stitched diamonds
      float a=atan(q.z,q.x)*40.0,st=abs(fract(a+q.y*120.0)-0.5)+abs(fract(q.y*160.0)-0.5);
      if(mo>3.5){ // polished metal (brooch, keys): flat colour, faint wear
        alb*=0.85+0.3*fbm3(q*300.0);mRough=0.32;mMetal=0.75;mRimK=0.03;
      }else{
        alb*=(0.82+0.3*smoothstep(0.35,0.45,st*(mo>0.5?0.0:1.0)+(mo>0.5?0.4:0.0)))*(0.9+0.2*mott);mRough=0.42;mMetal=0.35;mRimK=0.03;
        if(mo>0.5){ // embroidered band: dark ember ink over gold thread, border lines and beads
          float ink=max(emb.x,emb.y);mEmb=ink;alb=mix(alb,vec3(0.36,0.05,0.03)*(0.8+0.4*n3(q*300.0)),ink*0.93);mMetal=0.35*(1.0-0.75*ink);mRough=mix(0.42,0.8,ink);
        }
      }
      mBump=1.0;
    }else if(m==14){ // sculpted hair (npc_hair.js): fine strands from the baked flow coordinates vBand = (u along the hair, v across the lock, skin proximity)
      bool shell=vBand.z>5.5;bool card=vBand.z>1.5&&!shell;
      vec2 fl=card?vec2(vBand.y,vBand.x):vBand.xy;if(shell){float vv0=-vLoc.y;fl=vec2(vv0,vLoc.z+0.35*vLoc.x);}float sk=(card||shell)?0.0:clamp(vBand.z,0.0,1.0);
      float fwv=max(fwidth(fl.y),1e-6),fwu=max(fwidth(fl.x),1e-6);
      // cycles per pixel of the two strand layers: fade each out before it aliases, towards its mean (no shimmer or moire at range)
      float f1=1.0/0.0017,f2=1.0/0.00065;
      float fd1=1.0-smoothstep(0.25,0.75,fwv*f1),fd2=1.0-smoothstep(0.25,0.75,fwv*f2);
      if(shell){ // shell hair: strands carved out of stacked offset shells (h = shell height 0..1), thinner and fewer towards the outer shells
        float h=vBand.z-6.0,vv=-vLoc.y;
        float uu=vLoc.z+0.35*vLoc.x+0.0024*sin(vv*23.0+vLoc.z*70.0)+0.0016*sin(vv*61.0+vLoc.x*55.0);
        float xs=uu*1150.0,id=floor(xs),fr=fract(xs)-0.5,fw=fwidth(xs);
        float r1=hh1(id),r2=hh1(id+17.3),r3=hh1(id+41.7),hs2=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
        float len=(0.4+0.6*r1)*(0.82+0.18*sin(vv*31.0+r3*6.28));
        float rad=(0.36+0.18*r2)*(1.0-0.8*clamp(h/max(len,0.15),0.0,1.0));
        float tone=r3;
        if(fw>0.9){float cv=clamp((1.0-h)/0.6,0.0,1.0)*0.62*(1.0-0.5*h);if(hs2>cv)discard;tone=0.4;}
        else{if(h>len||abs(fr)>rad+(hs2-0.5)*0.06)discard;}
        vec3 tc=tone<0.42?vec3(0.95,0.94,0.9):tone<0.68?vec3(0.78):tone<0.84?vec3(0.56):tone<0.93?vec3(0.93,0.82,0.58):vec3(0.4);
        alb*=tc*(0.62+0.6*h)*1.05;alb=min(alb,vec3(0.62));mRough=0.7;mRimK=0.006;mBump=0.0;mHairH=0.0;
      }else
      if(card){ // hair card: strand atlas (4 tiles of 128x512: u across the card, v along it), alpha tested, mip-compensated so distant cards do not vanish
        float tile=floor(vBand.z-1.5);vec2 auv=vec2((tile+0.03+vBand.x*0.94)*0.25,vBand.y);
        vec4 st=texture2D(uStrand,auv);vec2 dxa=dFdx(auv)*512.0,dya=dFdy(auv)*512.0;float lod=0.5*log2(max(max(dot(dxa,dxa),dot(dya,dya)),1.0));
        float ca=st.a*(1.0+0.3*lod);float hs=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
        float ed=abs(vBand.x*2.0-1.0);if(ca<mix(0.3,0.5,smoothstep(0.6,0.95,vBand.y))+0.16*smoothstep(0.55,1.0,ed)+0.22*smoothstep(0.75,1.0,vBand.y)+(hs-0.5)*0.16)discard;
        alb*=st.rgb*0.78;alb=min(alb,vec3(0.62));mRough=0.7;mRimK=0.006;mBump=0.0;mHairH=0.0;
      }else{
      float vw=fl.y+0.0011*(n3(vec3(fl.x*55.0,fl.y*140.0,2.0))-0.5)*fd1;      // strands wander a little along their length
      float s1=n3(vec3(vw*f1,fl.x*f1*0.07,3.1)),s2=n3(vec3(vw*f2,fl.x*f2*0.055,7.7));
      float strand=clamp(0.5+(mix(0.5,s1,fd1)*0.55+mix(0.5,s2,fd2)*0.45-0.5)*2.6,0.0,1.0); // 0..1, mean 0.5, stretched (value noise is low contrast)
      mHairH=(strand-0.5)*(0.35+0.65*fd1);
      float yel=smoothstep(0.5,0.85,n3(vec3(fl.y*f1*0.3,fl.x*24.0,11.0))),dk=smoothstep(0.78,0.97,mix(0.5,s2,fd2));
      alb*=(0.74+0.5*strand)*(1.0-0.22*dk);
      alb*=mix(vec3(1.0),vec3(1.05,0.97,0.78),yel*0.7);                          // yellowed strands among the white
      alb=mix(alb,vec3(0.52,0.42,0.38)*(0.8+0.4*strand),sk*0.55);                 // roots: stubble grey-brown where the hair meets skin
      alb=min(alb,vec3(0.54));mRough=0.78;mRimK=0.008;mBump=1.0;
      }
      // flow direction in view space (dP/du from the screen derivatives of u and v) for the anisotropic highlight
      vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);float ux=dFdx(fl.x),uy=dFdy(fl.x),vx=dFdx(fl.y),vy=dFdy(fl.y),det=ux*vy-uy*vx;
      if(abs(det)>1e-12){vec3 tt=(dpx*vy-dpy*vx)/det;float tl=length(tt);if(tl>1e-9){mTan=tt/tl;mKK=(card||shell)?1.0:(1.0-sk)*(1.0-smoothstep(0.3,0.8,fwv*f1));}}
    }
    else if(m==2){
      float folds=n3(vec3(q.x*55.0,q.y*5.0,q.z*55.0));
      float weave=sin(q.y*1500.0)*sin((q.x+q.z)*1500.0);
      alb*=(0.8+0.26*folds)*(0.93+0.14*mott)*(1.0+0.07*weave*fine);mRough=0.95;mRimK=0.03;
    }else if(m==3){
      float bl=fbm3(q*50.0),scr=smoothstep(0.78,0.84,n3(vec3(q.x*260.0,q.y*22.0,q.z*260.0)));
      alb*=0.72+0.45*bl;alb=mix(alb,alb*1.5+0.03,scr*0.5*fine);mRough=0.5;
    }else if(m==4){
      float br=n3(vec3(q.x*26.0,q.y*420.0,q.z*26.0)),rust=smoothstep(0.6,0.82,fbm3(q*40.0));
      alb*=0.82+0.28*br*fine;alb=mix(alb,vec3(0.3,0.15,0.07),rust*0.5);mRough=mix(0.32,0.9,rust);mMetal=mix(0.55,0.0,rust);
    }else if(m==5){
      float st=n3(vec3(q.x*150.0,q.y*8.0,q.z*150.0));alb*=0.68+0.55*st;mRough=0.42;
    }else if(m==6){
      float gr=n3(vec3(q.x*80.0,q.y*6.0,q.z*80.0)),pl=smoothstep(0.42,0.5,abs(fract(atan(q.z,q.x)*1.9+0.5)-0.5));
      alb*=(0.7+0.36*gr)*(0.72+0.28*pl);mRough=0.78;
    }else if(m==7){mGlow=1.0;}
    else if(m==8){mRough=0.12;}
    else if(m==9){
      float sp=fbm3(q*60.0),cr=smoothstep(0.035,0.0,abs(n3(q*13.0)-0.5));
      alb*=0.72+0.45*sp;alb*=1.0-cr*0.5;mRough=0.88;
    }else if(m==10){
      float wv=n3(vec3(q.x*40.0,q.y*9.0,q.z*40.0));alb*=0.7+0.5*wv;mRough=1.0;mRim=1.0;
    }else if(m==11){mRough=0.1;mGlow=0.55;}
    mCh=m==12?0.9:(m>=13&&m<=15)?1.0:(m==8?0.5:0.0);
    diffuseColor.rgb=pow(max(alb,vec3(0.0)),vec3(2.2));
    if(m==7)diffuseColor.rgb*=0.1;
  }`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
  if(mBump>0.5){ // real bump from a procedural height (metres), so pores, weave and strands catch the light without any triangles
    vec3 q=vLoc.xyz;int m=int(floor(vLoc.w+0.002));float fn=clamp(1.6-vViewPosition.z*0.45,0.0,1.0);float hh=0.0;
    if(m==12){hh=0.00012*n3(q*380.0)+mAux*0.0005*(1.0-abs(n3(vec3(q.x*70.0,q.y*330.0,q.z*70.0))*2.0-1.0));} // pores, and creases where the mesh asks for them
    else if(m==13||m==15){hh=0.0006*(n3(q*160.0)-0.5)+0.0003*fn*mWeave*sin(q.y*1500.0)*sin((q.x+q.z)*1500.0)+0.0005*mEmb;}
    else if(m==14){hh=0.00045*mHairH;}
    vec2 dh=vec2(dFdx(hh),dFdy(hh))*fn;
    vec3 sX=dFdx(-vViewPosition),sY=dFdy(-vViewPosition),R1=cross(sY,normal),R2=cross(normal,sX);
    float fDet=dot(sX,R1)*faceDirection;
    vec3 pb=dh.x*R1+dh.y*R2;float pl=length(pb),pm=0.6*abs(fDet);if(pl>pm)pb*=pm/pl; // bound the tilt: derivatives on sub-pixel triangles and silhouettes are huge
    vec3 nb=abs(fDet)*normal-sign(fDet)*pb;if(dot(nb,nb)>0.1*fDet*fDet&&fDet*fDet>1e-30)normal=normalize(nb); // never normalize a (near) zero vector: NaN would bloom into white squares
  }`)
      .replace('#include <lights_physical_fragment>','#include <lights_physical_fragment>\nif(mCh>0.75||(mMetal<0.1&&mRough>0.7))material.specularF90=0.1; // sculpted characters: no grazing-angle Fresnel at silhouettes (silver slivers on fingertips and rims that bloom into white glints)')
      .replace('#include <roughnessmap_fragment>','float roughnessFactor=mRough;')
      .replace('#include <metalnessmap_fragment>','float metalnessFactor=mMetal;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
  {vec3 ec=pow(max(vColor.rgb,vec3(0.0)),vec3(2.2));
    totalEmissiveRadiance+=ec*(mGlow*1.6+uGlowBase+(mCh>0.75?0.3:0.0)); // 0.2: faint fill so a hand's torch shadow on the robe is dark red, not black holes
    if(mRimK>0.0){float fr=pow(saturate(1.0-abs(dot(normalize(normal),normalize(vViewPosition)))),3.0);totalEmissiveRadiance+=ec*fr*mRimK;} // soft fresnel rim / cloth sheen
    if(mRim>0.5){float rim=pow(saturate(1.0-abs(dot(normalize(normal),normalize(vViewPosition)))),3.0);totalEmissiveRadiance+=ec*rim*rim*1.6;}}`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\n  {uvec3 nb3=floatBitsToUint(gl_FragColor.rgb);bvec3 bad=equal(nb3&uvec3(0x7f800000u),uvec3(0x7f800000u));gl_FragColor.rgb=any(bad)?vec3(0.0):clamp(gl_FragColor.rgb,vec3(0.0),vec3(mCh>0.95?3.0:mCh>0.75?2.0:mCh>0.25?5.0:12.0));} // isnan() can be optimised away on ANGLE/D3D; test the exponent bits (NaN and Inf) instead. // firefly clamp: specular spikes on slivers and silhouettes bloom into squares (see docs/npc-kit.md); sculpted characters (12-15) are held to 3.0, eyes 5.0');
  };
  m.customProgramCacheKey=()=>'painted';
  return m;
}
function paintedMesh(buf,dynamic,glowBase){
  const ib=new THREE.InterleavedBuffer(buf,13);if(dynamic)ib.setUsage(THREE.DynamicDrawUsage);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.InterleavedBufferAttribute(ib,3,0));
  g.setAttribute('normal',new THREE.InterleavedBufferAttribute(ib,3,3));
  g.setAttribute('color',new THREE.InterleavedBufferAttribute(ib,3,6));
  g.setAttribute('aLoc',new THREE.InterleavedBufferAttribute(ib,4,9));
  g.setDrawRange(0,0);
  const mesh=new THREE.Mesh(g,paintedMaterial(glowBase));
  mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.ib=ib;
  scene.add(mesh);return mesh;
}
/* ---------- procedural textures ---------- */
function makeSpriteTexture(){
  const C=128,cv=document.createElement('canvas');cv.width=C*8;cv.height=C*8;
  const x=cv.getContext('2d');x.scale(2,2);
  const cell=(i,fn)=>{x.save();x.translate((i%4)*C,(i>>2)*C);x.beginPath();x.rect(0,0,C,C);x.clip();fn();x.restore()};
  // 0 shard
  cell(0,()=>{const g=x.createLinearGradient(40,10,90,118);g.addColorStop(0,'#ffffff');g.addColorStop(0.5,'#7fe9ff');g.addColorStop(1,'#1b6fa8');
    x.fillStyle=g;x.beginPath();x.moveTo(64,8);x.lineTo(96,50);x.lineTo(72,120);x.lineTo(40,62);x.closePath();x.fill();
    x.fillStyle='rgba(255,255,255,0.55)';x.beginPath();x.moveTo(64,8);x.lineTo(66,60);x.lineTo(40,62);x.closePath();x.fill();
    x.strokeStyle='rgba(255,255,255,0.8)';x.lineWidth=2;x.beginPath();x.moveTo(64,8);x.lineTo(96,50);x.lineTo(72,120);x.lineTo(40,62);x.closePath();x.stroke()});
  // 1 gem
  cell(1,()=>{const g=x.createLinearGradient(30,30,98,98);g.addColorStop(0,'#fff6c9');g.addColorStop(0.5,'#ffc93a');g.addColorStop(1,'#b46a00');
    x.fillStyle=g;x.beginPath();x.moveTo(64,18);x.lineTo(108,60);x.lineTo(64,112);x.lineTo(20,60);x.closePath();x.fill();
    x.fillStyle='rgba(255,255,255,0.5)';x.beginPath();x.moveTo(64,18);x.lineTo(84,60);x.lineTo(44,60);x.closePath();x.fill()});
  // 2 oil flask
  cell(2,()=>{x.fillStyle='#6b4a2a';x.fillRect(54,14,20,14);
    x.fillStyle='rgba(220,235,255,0.5)';x.fillRect(52,26,24,26);
    const g=x.createRadialGradient(56,78,4,64,82,40);g.addColorStop(0,'#ffe2a0');g.addColorStop(0.6,'#f08a1c');g.addColorStop(1,'#8a3a05');
    x.fillStyle=g;x.beginPath();x.arc(64,82,36,0,7);x.fill();
    x.strokeStyle='rgba(255,255,255,0.6)';x.lineWidth=3;x.beginPath();x.arc(64,82,36,0,7);x.stroke()});
  // 3 flash bomb
  cell(3,()=>{x.strokeStyle='rgba(255,255,255,0.95)';x.lineWidth=5;x.lineCap='round';
    for(let i=0;i<8;i++){const a=i*Math.PI/4,r0=30,r1=i%2?46:58;x.beginPath();x.moveTo(64+Math.cos(a)*r0,64+Math.sin(a)*r0);x.lineTo(64+Math.cos(a)*r1,64+Math.sin(a)*r1);x.stroke()}
    const g=x.createRadialGradient(58,58,2,64,64,26);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#8fc4ff');
    x.fillStyle=g;x.beginPath();x.arc(64,64,24,0,7);x.fill()});
  // 4 heart
  cell(4,()=>{const g=x.createLinearGradient(30,20,100,110);g.addColorStop(0,'#ff9a9a');g.addColorStop(0.4,'#ff3b4b');g.addColorStop(1,'#8a0c1c');
    x.fillStyle=g;x.beginPath();x.moveTo(64,110);x.bezierCurveTo(8,70,14,22,44,22);x.bezierCurveTo(58,22,64,34,64,40);
    x.bezierCurveTo(64,34,70,22,84,22);x.bezierCurveTo(114,22,120,70,64,110);x.fill()});
  // 5 shade
  cell(5,()=>{const g=x.createLinearGradient(0,8,0,128);g.addColorStop(0,'#3a2c58');g.addColorStop(0.5,'#1c1430');g.addColorStop(1,'rgba(16,10,28,0)');
    x.fillStyle=g;x.beginPath();x.moveTo(64,6);x.bezierCurveTo(98,8,102,50,104,80);x.lineTo(112,128);x.lineTo(16,128);x.lineTo(24,80);
    x.bezierCurveTo(26,50,30,8,64,6);x.fill();
    x.strokeStyle='rgba(170,130,255,0.55)';x.lineWidth=2.5;x.beginPath();x.moveTo(24,84);x.bezierCurveTo(26,50,30,8,64,6);x.bezierCurveTo(98,8,102,50,104,84);x.stroke();
    x.fillStyle='#07040c';x.beginPath();x.ellipse(64,44,22,26,0,0,7);x.fill();
    for(const ex of[54,74]){const e=x.createRadialGradient(ex,42,0,ex,42,9);e.addColorStop(0,'#ffffff');e.addColorStop(0.4,'rgba(255,255,255,0.9)');e.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=e;x.fillRect(ex-10,32,20,20)}});
  // 6 beam
  cell(6,()=>{const g=x.createLinearGradient(14,0,114,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(0.5,'rgba(255,255,255,0.9)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(14,0,100,128);
    x.globalCompositeOperation='destination-in';
    const v=x.createLinearGradient(0,0,0,128);v.addColorStop(0,'rgba(0,0,0,0.25)');v.addColorStop(1,'rgba(0,0,0,1)');
    x.fillStyle=v;x.fillRect(0,0,128,128);x.globalCompositeOperation='source-over'});
  // 7 soft glow
  cell(7,()=>{const g=x.createRadialGradient(64,64,0,64,64,62);g.addColorStop(0,'rgba(255,255,255,0.85)');g.addColorStop(0.35,'rgba(255,255,255,0.3)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,C,C)});
  // 8 stalker: a pale stone figure
  cell(8,()=>{const g=x.createLinearGradient(0,0,0,128);g.addColorStop(0,'#d6d0c4');g.addColorStop(1,'#5d5850');
    x.fillStyle=g;x.beginPath();x.moveTo(46,44);x.lineTo(82,44);x.lineTo(100,128);x.lineTo(28,128);x.closePath();x.fill();
    x.beginPath();x.ellipse(64,28,20,24,0,0,7);x.fill();
    x.fillStyle='rgba(0,0,0,0.25)';x.fillRect(62,50,3,78);
    x.strokeStyle='rgba(40,36,30,0.7)';x.lineWidth=1.5;x.beginPath();x.moveTo(50,70);x.lineTo(58,86);x.lineTo(52,100);x.moveTo(80,60);x.lineTo(74,78);x.stroke();
    x.fillStyle='#050404';x.beginPath();x.ellipse(56,26,5,7,0,0,7);x.ellipse(72,26,5,7,0,0,7);x.fill();
    x.beginPath();x.ellipse(64,42,4,6,0,0,7);x.fill()});
  // 9 key
  cell(9,()=>{x.strokeStyle='#ffd35a';x.lineWidth=10;x.lineCap='round';
    x.beginPath();x.arc(40,64,20,0,7);x.stroke();
    x.beginPath();x.moveTo(60,64);x.lineTo(112,64);x.moveTo(96,64);x.lineTo(96,86);x.moveTo(110,64);x.lineTo(110,82);x.stroke();
    x.strokeStyle='rgba(255,255,255,0.6)';x.lineWidth=3;x.beginPath();x.arc(40,64,20,3.6,5.2);x.stroke()});
  // 10 spikes
  cell(10,()=>{for(let i=0;i<4;i++){const cx=18+i*31;const g=x.createLinearGradient(cx-12,0,cx+12,0);g.addColorStop(0,'#e8ecf2');g.addColorStop(0.5,'#9aa2ae');g.addColorStop(1,'#3d424b');
    x.fillStyle=g;x.beginPath();x.moveTo(cx,4);x.lineTo(cx+13,128);x.lineTo(cx-13,128);x.closePath();x.fill()}});
  // 11 wisp flame
  cell(11,()=>{const g=x.createRadialGradient(64,80,2,64,74,46);g.addColorStop(0,'#ffffff');g.addColorStop(0.35,'#9fd2ff');g.addColorStop(1,'rgba(40,90,255,0)');
    x.fillStyle=g;x.beginPath();x.moveTo(64,6);x.bezierCurveTo(96,50,108,76,96,100);x.bezierCurveTo(84,124,44,124,32,100);x.bezierCurveTo(20,76,36,48,64,6);x.fill()});
  const tex=new THREE.CanvasTexture(cv);
  tex.flipY=false;tex.premultiplyAlpha=true;tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
  return tex;
}
const SURFS=makeSurfaces(renderer,Q>=2?1024:Q>=1?512:256,NORMALMAP), spriteTex=makeSpriteTexture();

/* ---------- world mesh ---------- */
let worldMesh=null,forestGrp=null;
const FOREST=createForest({UT,Q,shadows:SHADOWS>0});
function buildMesh(F,preview=false){
  const v=[],{W,H,g}=F,Y=WALL_H;
  const quad=(p,n,uv,layer)=>{for(const i of[0,1,2,0,2,3])v.push(p[i][0],p[i][1],p[i][2],n[0],n[1],n[2],uv[i][0],uv[i][1],layer)};
  const wall=(x,y)=>x<0||y<0||x>=W||y>=H||g[y*W+x]===1;
  const fr=F.forest;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(g[y*W+x]===1)continue;
    const pk=F.pocketMask[y*W+x]?10:0;
    const fu=[[x/2,y/2],[(x+1)/2,y/2],[(x+1)/2,(y+1)/2],[x/2,(y+1)/2]];
    quad([[x,0,y],[x+1,0,y],[x+1,0,y+1],[x,0,y+1]],[0,1,0],fu,1+pk);
    // a forest has no ceiling at all, only black sky (the noclip pockets keep theirs); its walls are the undergrowth cores built below
    if(!fr||pk)quad([[x,Y,y],[x+1,Y,y],[x+1,Y,y+1],[x,Y,y+1]],[0,-1,0],fu,(pk?4:F.panelAt[y*W+x]===2?6:F.panelAt[y*W+x]?4:2)+pk);
    if(fr&&!pk)continue;
    if(wall(x+1,y))quad([[x+1,0,y],[x+1,0,y+1],[x+1,Y,y+1],[x+1,Y,y]],[-1,0,0],[[y,1],[y+1,1],[y+1,0],[y,0]],pk);
    if(wall(x-1,y))quad([[x,0,y],[x,0,y+1],[x,Y,y+1],[x,Y,y]],[1,0,0],[[y,1],[y+1,1],[y+1,0],[y,0]],pk);
    if(wall(x,y+1))quad([[x,0,y+1],[x+1,0,y+1],[x+1,Y,y+1],[x,Y,y+1]],[0,0,-1],[[x,1],[x+1,1],[x+1,0],[x,0]],pk);
    if(wall(x,y-1))quad([[x,0,y],[x+1,0,y],[x+1,Y,y],[x,Y,y]],[0,0,1],[[x,1],[x+1,1],[x+1,0],[x,0]],pk);
  }
  if(fr){
    // occluding undergrowth core: each wall face sits INSET into its tile, with floor laid under the gap, and runs on past its tile edge at inside corners
    const vt=1-CORE_H/Y,under=new Set();
    for(const c of FOREST.faces(F)){
      const {tx,ty,dx,dz}=c,k=ty*W+tx;
      if(!under.has(k)){under.add(k);const fu=[[tx/2,ty/2],[(tx+1)/2,ty/2],[(tx+1)/2,(ty+1)/2],[tx/2,(ty+1)/2]];quad([[tx,0,ty],[tx+1,0,ty],[tx+1,0,ty+1],[tx,0,ty+1]],[0,1,0],fu,1)}
      if(dx){const px=(dx>0?tx+1:tx)-dx*INSET,z0=ty-c.e0,z1=ty+1+c.e1;quad([[px,0,z0],[px,0,z1],[px,CORE_H,z1],[px,CORE_H,z0]],[dx,0,0],[[z0,1],[z1,1],[z1,vt],[z0,vt]],0)}
      else{const pz=(dz>0?ty+1:ty)-dz*INSET,x0=tx-c.e0,x1=tx+1+c.e1;quad([[x0,0,pz],[x1,0,pz],[x1,CORE_H,pz],[x0,CORE_H,pz]],[0,0,dz],[[x0,1],[x1,1],[x1,vt],[x0,vt]],0)}
    }
  }
  // walls that are not really there
  for(const q of F.phantoms){
    const x=q.tx,y=q.ty;
    if(q.dx===1)quad([[x+1,0,y],[x+1,0,y+1],[x+1,Y,y+1],[x+1,Y,y]],[1,0,0],[[y,1],[y+1,1],[y+1,0],[y,0]],5);
    else if(q.dx===-1)quad([[x,0,y],[x,0,y+1],[x,Y,y+1],[x,Y,y]],[-1,0,0],[[y,1],[y+1,1],[y+1,0],[y,0]],5);
    else if(q.dz===1)quad([[x,0,y+1],[x+1,0,y+1],[x+1,Y,y+1],[x,Y,y+1]],[0,0,1],[[x,1],[x+1,1],[x+1,0],[x,0]],5);
    else quad([[x,0,y],[x+1,0,y],[x+1,Y,y],[x,Y,y]],[0,0,-1],[[x,1],[x+1,1],[x+1,0],[x,0]],5);
  }
  // boxes for the gate and its stone frame
  const UNIT=[[0,1],[1,1],[1,0],[0,0]];
  const box=(x0,y0,z0,x1,y1,z1,lx,lz)=>{
    const ux=lx===3?UNIT:[[z0,1-y0/Y],[z1,1-y0/Y],[z1,1-y1/Y],[z0,1-y1/Y]];
    const uz=lz===3?UNIT:[[x0,1-y0/Y],[x1,1-y0/Y],[x1,1-y1/Y],[x0,1-y1/Y]];
    quad([[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]],[1,0,0],ux,lx);
    quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],[-1,0,0],ux,lx);
    quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1],uz,lz);
    quad([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],[0,0,-1],uz,lz);
    quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0],[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],0);
  };
  const gate=(D,closed)=>{
    // u runs along the corridor, w across it. In the forest the frame is old stone, as tall as the hedge on either side.
    const FR=fr?7:0,YG=fr?CORE_H:Y;
    const b=(u0,y0,w0,u1,y1,w1,door)=>D.ax===0?box(D.tx+u0,y0,D.ty+w0,D.tx+u1,y1,D.ty+w1,door?3:FR,0)
                                               :box(D.tx+w0,y0,D.ty+u0,D.tx+w1,y1,D.ty+u1,0,door?3:FR);
    b(0.34,0,0,0.66,YG,0.14,false);b(0.34,0,0.86,0.66,YG,1,false);b(0.34,1.04,0.14,0.66,YG,0.86,false);
    if(closed)b(0.40,0,0.14,0.60,1.04,0.86,true);
  };
  if(F.door)gate(F.door,true);
  for(const D of F.frames)gate(D,false);
  // sort the triangles by surface kind, make every one face the way its normal points, and hand them to Three.js
  const nV=v.length/9,tris=[];for(let i=0;i<nV;i+=3)tris.push(i);
  tris.sort((a,b)=>v[a*9+8]-v[b*9+8]);
  const pos=new Float32Array(nV*3),nor=new Float32Array(nV*3),uv=new Float32Array(nV*2),mats=[];
  const geo=new THREE.BufferGeometry();let o=0,curK=-1,gStart=0;
  for(const t of tris){
    const k=v[t*9+8];
    if(k!==curK){if(curK>=0)geo.addGroup(gStart,o-gStart,mats.length-1);curK=k;gStart=o;mats.push(getWorldMat(F,k))}
    const a=t*9,b=a+9,c=a+18;
    const ux=v[b]-v[a],uy=v[b+1]-v[a+1],uz=v[b+2]-v[a+2],wx=v[c]-v[a],wy=v[c+1]-v[a+1],wz=v[c+2]-v[a+2];
    const flip=(uy*wz-uz*wy)*v[a+3]+(uz*wx-ux*wz)*v[a+4]+(ux*wy-uy*wx)*v[a+5]<0;
    for(const s of flip?[a,c,b]:[a,b,c]){
      pos[o*3]=v[s];pos[o*3+1]=v[s+1];pos[o*3+2]=v[s+2];nor[o*3]=v[s+3];nor[o*3+1]=v[s+4];nor[o*3+2]=v[s+5];uv[o*2]=v[s+6];uv[o*2+1]=v[s+7];o++;
    }
  }
  if(curK>=0)geo.addGroup(gStart,o-gStart,mats.length-1);
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,mats);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
  // A passing landing only needs this mesh. Do not touch the playable world.
  if(preview)return mesh;
  mesh.matrixAutoUpdate=false;
  if(worldMesh){scene.remove(worldMesh);worldMesh.geometry.dispose()}
  worldMesh=mesh;scene.add(worldMesh);
  if(forestGrp){FOREST.dispose(forestGrp);forestGrp=null}
  if(fr&&!preview){forestGrp=FOREST.build(F);scene.add(forestGrp);F.fo.stats=forestGrp.userData.stats}
  for(const l of shadLights)l.userData.key='';
}
function buildSdf(){}
/* ---------- 3D prop meshes ---------- */
function lathe(prof,seg){
  const v=[];
  for(let i=0;i<prof.length-1;i++){
    const r0=prof[i][0],y0=prof[i][1],r1=prof[i+1][0],y1=prof[i+1][1];
    let nr=y1-y0,ny=-(r1-r0);const nl=Math.hypot(nr,ny)||1;nr/=nl;ny/=nl;
    for(let k=0;k<seg;k++){
      const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
      const A=[r0*c0,y0,r0*s0,nr*c0,ny,nr*s0],B=[r0*c1,y0,r0*s1,nr*c1,ny,nr*s1],C=[r1*c1,y1,r1*s1,nr*c1,ny,nr*s1],Dd=[r1*c0,y1,r1*s0,nr*c0,ny,nr*s0];
      for(const q of[A,B,C,A,C,Dd])v.push(q[0],q[1],q[2],q[3],q[4],q[5],1,1,1);
    }
  }
  return new Float32Array(v);
}
function octa(){
  const P=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],v=[];
  for(const sx of[0,1])for(const sy of[2,3])for(const sz of[4,5]){
    const a=P[sx],b=P[sy],c=P[sz],n=[a[0]+b[0]+c[0],a[1]+b[1]+c[1],a[2]+b[2]+c[2]],l=Math.hypot(n[0],n[1],n[2]);
    for(const q of[a,b,c])v.push(q[0],q[1],q[2],n[0]/l,n[1]/l,n[2]/l,1,1,1);
  }
  return new Float32Array(v);
}
function cube(){
  const v=[],f=(n,a,b)=>{const p=(s,t)=>[n[0]+a[0]*s+b[0]*t,n[1]+a[1]*s+b[1]*t,n[2]+a[2]*s+b[2]*t];
    for(const q of[p(-1,-1),p(1,-1),p(1,1),p(-1,-1),p(1,1),p(-1,1)])v.push(q[0]*0.5,q[1]*0.5,q[2]*0.5,n[0],n[1],n[2],1,1,1)};
  f([1,0,0],[0,1,0],[0,0,1]);f([-1,0,0],[0,1,0],[0,0,1]);f([0,1,0],[1,0,0],[0,0,1]);f([0,-1,0],[1,0,0],[0,0,1]);f([0,0,1],[1,0,0],[0,1,0]);f([0,0,-1],[1,0,0],[0,1,0]);
  return new Float32Array(v);
}
const MESH_DATA={
  shade:lathe([[0.31,0],[0.28,0.22],[0.21,0.55],[0.17,0.76],[0.2,0.84],[0.215,0.95],[0.17,1.05],[0.07,1.11],[0,1.12]],14),
  stalker:lathe([[0.25,0],[0.25,0.06],[0.18,0.1],[0.2,0.5],[0.22,0.72],[0.1,0.8],[0.085,0.84],[0.13,0.9],[0.14,1.0],[0.1,1.08],[0,1.1]],12),
  pillar:lathe([[0.27,0],[0.27,0.08],[0.2,0.14],[0.2,1.1],[0.27,1.17],[0.27,1.25]],14),
  cone:lathe([[0.065,0],[0,1]],8),
  bowl:lathe([[0.08,0],[0.25,0.1],[0.29,0.17],[0.23,0.17],[0.2,0.11],[0,0.09]],14),
  npc:lathe([[0.29,0],[0.26,0.04],[0.2,0.4],[0.19,0.66],[0.24,0.74],[0.23,0.8],[0.13,0.84],[0.15,0.9],[0.16,0.99],[0.13,1.07],[0.06,1.14],[0,1.17]],14),
  octa:octa(),cube:cube()
};
/* ---------- characters: jointed low-poly figures, posed on the CPU every frame ---------- */
const CH={buf:new Float32Array(13*90000),n:0,cap:90000,cones:{}};
const DEC={buf:new Float32Array(13*260000),n:0,cap:260000};
let TB=CH;const ZERO3=[0,0,0];
function sphereMesh(seg,rings){
  const v=[],pt=(i,j)=>{const th=j/rings*Math.PI,ph=i/seg*Math.PI*2,s=Math.sin(th);return [s*Math.cos(ph),Math.cos(th),s*Math.sin(ph)]};
  for(let j=0;j<rings;j++)for(let i=0;i<seg;i++){const a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);
    for(const q of[a,b,c,a,c,d])v.push(q[0],q[1],q[2],q[0],q[1],q[2])}
  return new Float32Array(v);
}
function coneMesh(k){
  const key=Math.round(k*20);if(CH.cones[key])return CH.cones[key];
  const v=[],seg=10,sl=1-k;
  for(let i=0;i<seg;i++){
    const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
    const A=[c0,0,s0,c0,sl,s0],B=[c1,0,s1,c1,sl,s1],C=[k*c1,1,k*s1,c1,sl,s1],D=[k*c0,1,k*s0,c0,sl,s0];
    for(const q of[A,B,C,A,C,D])v.push(...q);
    v.push(0,0,0,0,-1,0,c0,0,s0,0,-1,0,c1,0,s1,0,-1,0, 0,1,0,0,1,0,k*c0,1,k*s0,0,1,0,k*c1,1,k*s1,0,1,0);
  }
  return CH.cones[key]=new Float32Array(v);
}
const SPH_HI=sphereMesh(14,10),SPH_LO=sphereMesh(8,6);
const BOX6=(()=>{const c=cube(),o=new Float32Array(c.length/9*6);for(let i=0,j=0;i<c.length;i+=9)for(let k=0;k<6;k++)o[j++]=c[i+k];return o})();
const m3=(a,b)=>[a[0]*b[0]+a[1]*b[3]+a[2]*b[6],a[0]*b[1]+a[1]*b[4]+a[2]*b[7],a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
                 a[3]*b[0]+a[4]*b[3]+a[5]*b[6],a[3]*b[1]+a[4]*b[4]+a[5]*b[7],a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
                 a[6]*b[0]+a[7]*b[3]+a[8]*b[6],a[6]*b[1]+a[7]*b[4]+a[8]*b[7],a[6]*b[2]+a[7]*b[5]+a[8]*b[8]];
// local axes: +X forward, +Y up, +Z to the side
const rYaw=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,1,0,s,0,c]};
const rZ=a=>{const c=Math.cos(a),s=Math.sin(a);return [c,-s,0,s,c,0,0,0,1]};
const rX=a=>{const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0,c,-s,0,s,c]};
const fpt=(f,v)=>[f.p[0]+f.R[0]*v[0]+f.R[1]*v[1]+f.R[2]*v[2],f.p[1]+f.R[3]*v[0]+f.R[4]*v[1]+f.R[5]*v[2],f.p[2]+f.R[6]*v[0]+f.R[7]*v[1]+f.R[8]*v[2]];
const subF=(f,off,R)=>({p:fpt(f,off),R:R?m3(f.R,R):f.R});
function emit(mesh,f,c,s,col,R2){
  const cnt=mesh.length/6,T=TB;if(T.n+cnt>T.cap)return;
  const R=R2?m3(f.R,R2):f.R,p=fpt(f,c),b=T.buf,lo=f.lo||ZERO3;let o=T.n*13;
  const s0=s[0],s1=s[1],s2=s[2],i0=1/s0,i1=1/s1,i2=1/s2,c0=col[0],c1=col[1],c2=col[2],mat=col[3]||0;
  const l0=c[0]+lo[0],l1=c[1]+lo[1],l2=c[2]+lo[2];
  for(let i=0;i<mesh.length;i+=6){
    const x=mesh[i]*s0,y=mesh[i+1]*s1,z=mesh[i+2]*s2;
    let nx=mesh[i+3]*i0,ny=mesh[i+4]*i1,nz=mesh[i+5]*i2;const l=1/(Math.hypot(nx,ny,nz)||1);nx*=l;ny*=l;nz*=l;
    b[o++]=p[0]+R[0]*x+R[1]*y+R[2]*z;b[o++]=p[1]+R[3]*x+R[4]*y+R[5]*z;b[o++]=p[2]+R[6]*x+R[7]*y+R[8]*z;
    b[o++]=R[0]*nx+R[1]*ny+R[2]*nz;b[o++]=R[3]*nx+R[4]*ny+R[5]*nz;b[o++]=R[6]*nx+R[7]*ny+R[8]*nz;
    b[o++]=c0;b[o++]=c1;b[o++]=c2;b[o++]=l0+x;b[o++]=l1+y;b[o++]=l2+z;b[o++]=mat;
  }
  T.n+=cnt;
}
const ball=(f,c,s,col,lo)=>emit(lo?SPH_LO:SPH_HI,f,c,typeof s==='number'?[s,s,s]:s,col);
const slab=(f,c,s,col,R2)=>emit(BOX6,f,c,s,col,R2);
function seg(f,a,b,r0,r1,col){
  let dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];const len=Math.hypot(dx,dy,dz)||1e-4;dx/=len;dy/=len;dz/=len;
  let ax=-dz,ay=0,az=dx;const al=Math.hypot(ax,az);
  if(al<1e-3){ax=1;az=0}else{ax/=al;az/=al}
  const zx=ay*dz-az*dy,zy=az*dx-ax*dz,zz=ax*dy-ay*dx;
  emit(coneMesh(r1/r0),f,a,[r0,len,r0],col,[ax,dx,zx,ay,dy,zy,az,dz,zz]);
}
function limb(f,A,B,C,r0,r1,r2,colU,colL,colEnd,rEnd){
  seg(f,A,B,r0,r1,colU);ball(f,A,r0,colU,true);ball(f,B,r1,colL,true);seg(f,B,C,r1,r2,colL);
  if(colEnd)ball(f,C,rEnd||r2*1.25,colEnd,true);
}
// the face is laid out on a head whose centre sits at (0.005,0.085,0) in the head frame
function face(H,o){
  const sk=o.skin,bl=o.blink,es=o.eyeS||1,ey=o.eyeY||0.085;
  ball(H,[0.005,0.085,0],[0.085,0.095,0.082],sk);
  for(const z of[-0.034,0.034]){
    ball(H,[0.073,ey,z],[0.012,0.022*es*bl,0.017*es],[0.96,0.95,0.92,8],true);
    ball(H,[0.081,ey-0.001,z*0.97],[0.007,0.015*es*bl,0.0105*es],[o.iris[0],o.iris[1],o.iris[2],8],true);
    ball(H,[0.0855,ey-0.001,z*0.97],[0.004,0.008*es*bl,0.0055*es],[0.03,0.02,0.02,8],true);
    slab(H,[0.079+(o.browOut||0),ey+0.033*es+(o.browUp||0),z],[0.012,o.browH||0.007,0.034],o.brow,rX((z>0?1:-1)*(o.browTilt||0)));
    if(o.ears)ball(H,[0.0,0.08,z*2.45],[0.016,0.026,0.011],sk,true);
  }
  ball(H,[0.089,ey-0.027,0],o.nose||[0.015,0.017,0.013],[sk[0]*0.93,sk[1]*0.88,sk[2]*0.86,1],true);
  if(o.mouth)slab(H,[0.08,0.034,0],[0.008,0.006+(o.talk||0),o.mouthW||0.03],o.mouth);
}
let PROBE_SYNC=false;const NPC_CLASSIC=new URLSearchParams(location.search).get('npc')==='classic',ONE3=[1,1,1];
let KEEPER_WARM=false,KEEPER_SAVED=false;const KEEPER_CACHE_KEY=KEEPER.id+':'+KIT_HASH,KT0=performance.now(),KEEPER_T={load:-1,hit:false},KEEPER_LOAD=NPC_CLASSIC?null:loadBake(KEEPER_CACHE_KEY).then(pl=>{try{const t1=performance.now();if(pl)KEEPER_T.hit=bakePrime(KEEPER,pl);KEEPER_T.load=performance.now()-t1;KEEPER_T.readMs=cacheStats.readMs}catch(e){console.error(e)}});
let STUDIO=null; // set by __game.studio(): fixed camera, frozen gameplay, for NPC screenshots
/* ---------- sculpted NPCs (src/npc_kit.js + src/npc_recipes.js) ---------- */
// material names used by recipes -> shader material ids in paintedMaterial()
const MAT={skin:12,cloth:13,hair:14,trim:15,eye:8,wood:6,metal:4,glow:7};
// emit() for kit meshes (stride 9): the paint channel blends col -> col2 per vertex, baked occlusion darkens it,
// the detail mask rides in the fraction of the material id (wrinkles, fine bump). R2 rotates the mesh inside the
// frame, c places it.
function emitS(mesh,f,c,col,col2,mat,R2,sc,dr){
  const cnt=mesh.length/9,T=TB;if(T.n+cnt>T.cap)return;
  const W=T.w||13,bnd=mesh.band;
  sc=sc||1;const R=R2?m3(f.R,R2):f.R,cs=sc===1?c:[c[0]*sc,c[1]*sc,c[2]*sc],p=fpt(f,cs),b=T.buf,lo=f.lo||ZERO3;let o=T.n*W;
  const c0=col[0],c1=col[1],c2=col[2],d0=col2[0]-c0,d1=col2[1]-c1,d2=col2[2]-c2;
  const l0=c[0]+lo[0],l1=c[1]+lo[1],l2=c[2]+lo[2];
  // drape: vertices below dr.y0 blend towards a second frame (dr.f) that follows the head only partly, so a long beard
  // keeps hanging on the chest instead of swinging with the head (linear blend skinning, full weight at dr.y1)
  let R3=null,p3=null,y0=0,iy=0;
  if(dr){R3=R2?m3(dr.f.R,R2):dr.f.R;p3=fpt(dr.f,cs);y0=dr.y0;iy=1/(dr.y1-dr.y0)}
  for(let i=0;i<mesh.length;i+=9){
    const x=mesh[i],y=mesh[i+1],z=mesh[i+2],nx=mesh[i+3],ny=mesh[i+4],nz=mesh[i+5],w=mesh[i+6],ao=mesh[i+8];
    let X=p[0]+sc*(R[0]*x+R[1]*y+R[2]*z),Y=p[1]+sc*(R[3]*x+R[4]*y+R[5]*z),Z=p[2]+sc*(R[6]*x+R[7]*y+R[8]*z);
    let NX=R[0]*nx+R[1]*ny+R[2]*nz,NY=R[3]*nx+R[4]*ny+R[5]*nz,NZ=R[6]*nx+R[7]*ny+R[8]*nz;
    if(dr){let k=(y-y0)*iy;k=k<0?0:k>1?1:k;k=k*k*(3-2*k);
      if(k>0){const X2=p3[0]+sc*(R3[0]*x+R3[1]*y+R3[2]*z),Y2=p3[1]+sc*(R3[3]*x+R3[4]*y+R3[5]*z),Z2=p3[2]+sc*(R3[6]*x+R3[7]*y+R3[8]*z);
        const A=R3[0]*nx+R3[1]*ny+R3[2]*nz,B=R3[3]*nx+R3[4]*ny+R3[5]*nz,C=R3[6]*nx+R3[7]*ny+R3[8]*nz;
        X+=(X2-X)*k;Y+=(Y2-Y)*k;Z+=(Z2-Z)*k;NX+=(A-NX)*k;NY+=(B-NY)*k;NZ+=(C-NZ)*k;
        const il=1/(Math.hypot(NX,NY,NZ)||1);NX*=il;NY*=il;NZ*=il}}
    b[o++]=X;b[o++]=Y;b[o++]=Z;b[o++]=NX;b[o++]=NY;b[o++]=NZ;
    const ao2=ao;
    b[o++]=(c0+d0*w)*ao2;b[o++]=(c1+d1*w)*ao2;b[o++]=(c2+d2*w)*ao2;b[o++]=l0+x;b[o++]=l1+y;b[o++]=l2+z;b[o++]=mat+0.82*mesh[i+7];
    if(W===16){const k=i/9*3;b[o++]=bnd?bnd[k]:0;b[o++]=bnd?bnd[k+1]:0;b[o++]=bnd?bnd[k+2]:0}
  }
  T.n+=cnt;
}
// Standard humanoid frames for a recipe: B at the feet, U at the waist (lean + breathing), H at the neck
// (tracks the player, nods, idles), J = H moved down by the jaw while talking.
function humanoidFrames(rec,n,B,t,ph,breath,nod,jaw){
  const rig=rec.rig,S=rec.proportions&&rec.proportions.height||1,wa=rig.waist,ne=rig.neck; // S: overall figure scale (proportions.height)
  const U=subF(B,[wa[0]*S,wa[1]*S,wa[2]*S],rZ(rig.lean));
  const H=subF(U,[ne[0]*S,(ne[1]+breath)*S,ne[2]*S],m3(m3(rYaw(n.hy),rZ(n.hp+(rig.headTilt??0.12)+nod)),rX(Math.sin(t*0.5+ph)*0.03)));
  const fr={B,U:{p:fpt(U,[0,breath*S,0]),R:U.R},U0:U,H,J:subF(H,[0,-jaw*(rig.jaw/0.006)*S,0])};
  // D: head origin, but turning and nodding only a fraction as much as the head (what a hanging beard follows)
  if(rig.drape){const k=rig.drape.follow;fr.D=subF(U,[(ne[0]+rig.drape.push)*S,(ne[1]+breath)*S,ne[2]*S],m3(rYaw(n.hy*k),rZ((n.hp+(rig.headTilt??0.12)+nod)*k)))}
  return fr;
}
// ---- GPU posing for sculpted recipes ----
// Each baked rigid part is uploaded once as a static BufferGeometry (same 13-float layout and the same emitS maths as the old CPU
// path, written with an identity frame) and drawn with a per-group model matrix built from the frame {p,R} and the figure scale.
// Parts that share a frame are merged into one geometry (B: skirt, hem; U: torso, sleeves, sash, cuffs; H: head, ears, hair, brows,
// eyeballs, irises, lower lids; ...). Eyelids get their own group (matrix = H * rotate about the eye axis). Drape parts (neck, beard)
// blend between two frames per vertex, so they run a small vertex-shader blend (uRel = frame1^-1 * frame2) with a private material.
const GPU_RIGS=new Set();
const NPC_T={ms:0,n:0,tris:0,draws:0}; // CPU time spent in buildNpc, and what the sculpted characters submit to the GPU
function gpuGroups(baked){
  if(baked.groups)return baked.groups;
  const rec=baked.recipe,pal=rec.palette,G=new Map(),ec=rec.eyes,E=baked.eyes;
  const grp=(key,frame,drape,cards)=>{let g=G.get(key);if(!g)G.set(key,g=({key,frame,drape:drape||null,items:[],lid:false,cards:!!cards}));return g};
  for(const q of rec.parts){const m=baked.parts[q.part];if(!m)continue;
    const dr=q.drape&&rec.rig.drape;
    grp(q.cards?'c:'+(dr?q.part:q.frame):dr?'d:'+q.part:q.frame,q.frame,dr?{y0:q.drape[0],y1:q.drape[1]}:null,q.cards).items.push({m,c:q.at||ZERO3,col:pal[q.col],col2:pal[q.col2||q.col],mat:MAT[q.mat],R:q.R||null})}
  if(E&&ec){const a=baked.anchors.eye;
    for(const [key,fields,lid] of[[ec.frame,['ball','iris','lower'],false],['lid:'+ec.frame,['lid'],true]]){const g=grp(key,ec.frame);g.lid=lid;
      for(const z of[-a[2],a[2]])for(const fl of fields){
        const mat=fl==='lid'||fl==='lower'?MAT.skin:MAT.eye,c1=fl==='ball'?ec.sclera:fl==='iris'?ec.iris:ec.lid,c2=fl==='ball'?ec.sclera:fl==='iris'?ec.pupil:ec.lid2;
        g.items.push({m:[E[fl],E.lo[fl],E.lo[fl]],c:[a[0],a[1],z],col:pal[c1],col2:pal[c2],mat,R:null})}}}
  return baked.groups=[...G.values()];
}
function gpuGeo(baked,g,lod){
  const key=g.key+':'+lod;baked.geo=baked.geo||{};if(baked.geo[key])return baked.geo[key];
  // parts are arrays of LOD meshes; eye meshes are single meshes
  let n=0;const items=g.items.map(it=>{const mesh=Array.isArray(it.m)?it.m[Math.min(lod,it.m.length-1)]:it.m;n+=mesh.length/9;return {...it,mesh}});
  const tmp={buf:new Float32Array(16*n),n:0,cap:n,w:16},keep=TB,F0={p:[0,0,0],R:ID3,lo:ZERO3};TB=tmp;
  for(const it of items)emitS(it.mesh,F0,it.c,it.col,it.col2,it.mat,it.R,1,null);
  TB=keep;
  const ib=new THREE.InterleavedBuffer(tmp.buf,16),geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.InterleavedBufferAttribute(ib,3,0));geo.setAttribute('normal',new THREE.InterleavedBufferAttribute(ib,3,3));
  geo.setAttribute('color',new THREE.InterleavedBufferAttribute(ib,3,6));geo.setAttribute('aLoc',new THREE.InterleavedBufferAttribute(ib,4,9));geo.setAttribute('aBand',new THREE.InterleavedBufferAttribute(ib,3,13));
  geo.computeBoundingSphere();geo.boundingSphere.radius=geo.boundingSphere.radius*1.25+0.1; // drape parts and lids move
  geo.userData.tris=n/3;return baked.geo[key]=geo;
}
// vertex-shader blend between the part's frame and a second frame (see drape in emitS): u.uRel = inverse(frame1) * frame2, u.uDr = (y0, y1, 1/(y1-y0))
function drapeMaterials(){
  const u={uRel:{value:new THREE.Matrix4()},uDr:{value:new THREE.Vector3()}},m=paintedMaterial(0.012),prev=m.onBeforeCompile;
  const dk=nm=>`float ${nm}=clamp((position.y-uDr.x)*uDr.z,0.0,1.0);${nm}=${nm}*${nm}*(3.0-2.0*${nm});`;
  const patch=(sh,withN)=>{sh.uniforms.uRel=u.uRel;sh.uniforms.uDr=u.uDr;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uRel;uniform vec3 uDr;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n'+dk('dkP')+'transformed=mix(transformed,(uRel*vec4(transformed,1.0)).xyz,dkP);');
    if(withN)sh.vertexShader=sh.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n'+dk('dkN')+'objectNormal=normalize(mix(objectNormal,mat3(uRel)*objectNormal,dkN));')};
  m.onBeforeCompile=sh=>{if(prev)prev(sh);patch(sh,true)};m.customProgramCacheKey=()=>'painted-drape'+Q;
  const dm=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),ds=new THREE.MeshDistanceMaterial();
  dm.onBeforeCompile=sh=>patch(sh,false);ds.onBeforeCompile=sh=>patch(sh,false);dm.customProgramCacheKey=()=>'dr-depth';ds.customProgramCacheKey=()=>'dr-dist';
  return {u,m,dm,ds};
}
function disposeGpuRig(owner){
  const rig=owner.gpuRig;if(!rig)return;
  for(const x of rig.groups){
    for(const mesh of x.meshes)if(mesh)scene.remove(mesh);
    if(x.mat){x.mat.m.dispose();x.mat.dm.dispose();x.mat.ds.dispose()}
  }
  GPU_RIGS.delete(rig);delete owner.gpuRig;
}
function gpuRig(owner,baked){
  let R=owner.gpuRig;if(R&&R.baked===baked)return R;
  disposeGpuRig(owner);
  R={baked,groups:baked.recipe&&gpuGroups(baked).map(g=>({g,meshes:[],mat:null})),hide(){for(const x of this.groups)for(const m of x.meshes)if(m)m.visible=false}};
  for(const x of R.groups)if(x.g.drape)x.mat=drapeMaterials();
  owner.gpuRig=R;GPU_RIGS.add(R);return R;
}
function setMat4(M,f,sc,R2){ // M = [sc*R | p] for frame f, optionally with R2 applied inside (lid rotation about the eye axis)
  const R=R2?m3(f.R,R2):f.R,e=M.elements;
  e[0]=R[0]*sc;e[1]=R[3]*sc;e[2]=R[6]*sc;e[3]=0;e[4]=R[1]*sc;e[5]=R[4]*sc;e[6]=R[7]*sc;e[7]=0;e[8]=R[2]*sc;e[9]=R[5]*sc;e[10]=R[8]*sc;e[11]=0;e[12]=f.p[0];e[13]=f.p[1];e[14]=f.p[2];e[15]=1;
}
// Draw every part of a baked recipe into its frame, then the eyes (upper lids rotate to blink).
// Scale: proportions.height scales the whole figure; proportions.headScale additionally scales the head frames.
function drawRecipe(baked,lod,fr,blink,owner){
  const rec=baked.recipe,pr=rec.proportions,hs=pr?pr.headScale:1,S=pr&&pr.height||1,scOf=fn=>S*(pr&&pr.frames.includes(fn)?hs:1);
  const rig=gpuRig(owner,baked),E=baked.eyes;
  for(const x of rig.groups){const g=x.g,f=fr[g.frame];if(!f)continue;
    if(g.cards&&Q===0)continue; // low quality: no alpha cards, the solid mass carries the hair
    const l=Math.min(lod,baked.nLod-1);let mesh=x.meshes[l];
    if(!mesh){mesh=new THREE.Mesh(gpuGeo(baked,g,l),x.mat?x.mat.m:charMesh.material);
      mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=false;mesh.castShadow=!g.cards;mesh.receiveShadow=true;
      if(x.mat){mesh.customDepthMaterial=x.mat.dm;mesh.customDistanceMaterial=x.mat.ds}
      scene.add(mesh);x.meshes[l]=mesh}
    const sc=scOf(g.frame);
    if(g.lid){const a=baked.anchors.eye,ang=E.lidAngle(blink),c=Math.cos(ang),s=Math.sin(ang);
      // rotate about the axis through the eye centre: R = Rz(ang), pivot (a0,a1): matrix = H * T(pivot) * Rz * T(-pivot)
      setMat4(mesh.matrixWorld,f,sc,[c,-s,0,s,c,0,0,0,1]);
      const e=mesh.matrixWorld.elements,tx=a[0]-(c*a[0]-s*a[1]),ty=a[1]-(s*a[0]+c*a[1]);
      // translation of T(pivot)*Rz*T(-pivot) is (tx,ty,0) in frame units, i.e. scaled by sc along the frame axes
      const R=f.R;e[12]=f.p[0]+sc*(R[0]*tx+R[1]*ty);e[13]=f.p[1]+sc*(R[3]*tx+R[4]*ty);e[14]=f.p[2]+sc*(R[6]*tx+R[7]*ty)}
    else setMat4(mesh.matrixWorld,f,sc,null);
    if(x.mat&&fr.D){const f1=f,f2=fr.D,R1=f1.R,R2=f2.R,u=x.mat.u,e=u.uRel.value.elements,d=g.drape;
      const rel=[R1[0]*R2[0]+R1[3]*R2[3]+R1[6]*R2[6],R1[0]*R2[1]+R1[3]*R2[4]+R1[6]*R2[7],R1[0]*R2[2]+R1[3]*R2[5]+R1[6]*R2[8],
                 R1[1]*R2[0]+R1[4]*R2[3]+R1[7]*R2[6],R1[1]*R2[1]+R1[4]*R2[4]+R1[7]*R2[7],R1[1]*R2[2]+R1[4]*R2[5]+R1[7]*R2[8],
                 R1[2]*R2[0]+R1[5]*R2[3]+R1[8]*R2[6],R1[2]*R2[1]+R1[5]*R2[4]+R1[8]*R2[7],R1[2]*R2[2]+R1[5]*R2[5]+R1[8]*R2[8]];
      const dx=(f2.p[0]-f1.p[0])/sc,dy=(f2.p[1]-f1.p[1])/sc,dz=(f2.p[2]-f1.p[2])/sc;
      e[0]=rel[0];e[1]=rel[3];e[2]=rel[6];e[3]=0;e[4]=rel[1];e[5]=rel[4];e[6]=rel[7];e[7]=0;e[8]=rel[2];e[9]=rel[5];e[10]=rel[8];e[11]=0;
      e[12]=R1[0]*dx+R1[3]*dy+R1[6]*dz;e[13]=R1[1]*dx+R1[4]*dy+R1[7]*dz;e[14]=R1[2]*dx+R1[5]*dy+R1[8]*dz;e[15]=1;
      u.uDr.value.set(d.y0,d.y1,1/(d.y1-d.y0))}
    else if(x.mat)x.mat.u.uDr.value.set(1e9,1e9+1,1); // no second frame: stay rigid
    mesh.visible=true;NPC_T.tris+=mesh.geometry.userData.tris;NPC_T.draws++}
}
// ?npc=classic keeps the old primitive Keeper for comparison
// The Keeper: recipe KEEPER in src/npc_recipes.js, posed here; the staff and lantern stay primitive.
let GRIP_DBG=null;
function buildKeeperSculpt(n,B,t,ph,breath,br,blink,jaw,nod,out,lod){
  const K=bakeRecipe(KEEPER),A=K.anchors,fr=humanoidFrames(KEEPER,n,B,t,ph,breath,nod,jaw),U=fr.U0;
  const S=KEEPER.proportions.height||1,q3=(x,y,z)=>[x*S,y*S,z*S]; // props are authored at 1:1 and scaled with the figure
  const wood=[0.3,0.2,0.12,6];
  // The grip is locked: the staff stands on the floor and the hand sits at a fixed point of the figure's base frame (U0 has no breathing),
  // so the hand never slides along the rod. The arm absorbs the torso's breathing instead: the sleeve/arm frame 'arm0' is U turned about
  // the shoulder so the wrist stays on the hand (one-bone aim, an error of a mm or two at the cuff).
  const g=A.gripAt,hw=fpt(U,q3(g[0],g[1],g[2]));
  fr.grip={p:hw,R:m3(B.R,A.gripR)};
  {const s0=fpt(fr.U,q3(...A.shoulder0)),w0=fpt(fr.U,q3(g[0],g[1],g[2])),a=[w0[0]-s0[0],w0[1]-s0[1],w0[2]-s0[2]],b=[hw[0]-s0[0],hw[1]-s0[1],hw[2]-s0[2]],la=Math.hypot(...a),lb=Math.hypot(...b);
    const ax=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sn=Math.hypot(...ax)/(la*lb),cs=(a[0]*b[0]+a[1]*b[1]+a[2]*b[2])/(la*lb);
    let Q=ID3;if(sn>1e-9){const k=[ax[0]/(sn*la*lb),ax[1]/(sn*la*lb),ax[2]/(sn*la*lb)],C=1-cs;
      Q=[cs+k[0]*k[0]*C,k[0]*k[1]*C-k[2]*sn,k[0]*k[2]*C+k[1]*sn,k[1]*k[0]*C+k[2]*sn,cs+k[1]*k[1]*C,k[1]*k[2]*C-k[0]*sn,k[2]*k[0]*C-k[1]*sn,k[2]*k[1]*C+k[0]*sn,cs+k[2]*k[2]*C]}
    const d=[fr.U.p[0]-s0[0],fr.U.p[1]-s0[1],fr.U.p[2]-s0[2]];
    fr.arm0={p:[s0[0]+Q[0]*d[0]+Q[1]*d[1]+Q[2]*d[2],s0[1]+Q[3]*d[0]+Q[4]*d[1]+Q[5]*d[2],s0[2]+Q[6]*d[0]+Q[7]*d[1]+Q[8]*d[2]],R:m3(Q,fr.U.R)};
    // wrist drift of the sleeve mouth relative to the hand, for tools/npc_grip.mjs
    const wc=fpt(fr.arm0,q3(g[0],g[1],g[2]));GRIP_DBG={hand:hw,wrist:wc,staffY:0,cuffErr:Math.hypot(wc[0]-hw[0],wc[1]-hw[1],wc[2]-hw[2])}}
  fr.rest=subF(fr.U,q3(...A.restAt),A.restR);
  drawRecipe(K,lod,fr,blink,n);
  ball(fr.U,q3(...A.gem),0.012*S,[0.7,0.28,0.08,7],true); // belt gem: a faint warm glint, no light of its own
  const sp=fpt(fr.grip,[A.gripAxis[0]*S,A.gripAxis[1]*S,(A.gripAxis[2]||0)*S]),SB={p:[sp[0],0,sp[2]],R:B.R};GRIP_DBG.rodPoint=sp;GRIP_DBG.rodBase=SB.p;
  const sg=(a,b,r0,r1,col)=>seg(SB,q3(...a),q3(...b),r0*S,r1*S,col),sb=(c,r,col)=>ball(SB,q3(...c),typeof r==='number'?r*S:r.map(v=>v*S),col,true),sl=(c,z,col)=>slab(SB,q3(...c),q3(...z),col);
  sg([0,0,0],[0.003,0.34,-0.002],0.0092,0.0086,wood);sg([0.003,0.34,-0.002],[-0.002,0.68,0.003],0.0086,0.0079,wood);sg([-0.002,0.68,0.003],[0,1.0,0],0.0079,0.0075,wood);   // staff radius = KEEPER grip hand gripR
  sb([0.003,0.34,-0.002],[0.011,0.02,0.011],wood);sb([-0.002,0.68,0.003],[0.0098,0.018,0.0098],wood);
  sg([0,1.0,0],[0.07,1.06,0],0.0095,0.008,wood);
  sg([0.07,1.06,0],[0.07,1.0,0],0.004,0.004,[0.15,0.14,0.13,4]);
  sl([0.07,0.955,0],[0.05,0.012,0.05],[0.16,0.15,0.14,4]);sl([0.07,0.885,0],[0.05,0.012,0.05],[0.16,0.15,0.14,4]);
  for(const q of[[-1,-1],[1,-1],[-1,1],[1,1]])sl([0.07+q[0]*0.021,0.92,q[1]*0.021],[0.006,0.07,0.006],[0.16,0.15,0.14,4]);
  sb([0.07,0.918,0],0.018,[3.0,1.5,0.4,7]);
  out.lantern=fpt(SB,q3(0.07,0.918,0));
  out.top=1.05*S;
}
function buildNpc(n,t,ex,ey,ez,dtR){
  const dxp=ex-n.x,dzp=ez-n.z,dist=Math.hypot(dxp,dzp),toP=Math.atan2(dzp,dxp);
  const kind=n.type==='lurk'?(n.guise==='delver'?'delver':'map'):n.type;
  const seated=kind==='delver';
  if(n.yaw===undefined){
    n.hy=0;n.hp=0;
    if(seated){ // sit with the back to a wall when there is one
      n.yaw=n.wy!==undefined?n.wy:toP;
    }else n.yaw=kind==='keeper'&&F.safe?Math.atan2(F.safe.z-n.z,F.safe.x-n.x):toP;
  }
  if(!Number.isFinite(n.hy))n.hy=0;
  if(!Number.isFinite(n.hp))n.hp=0;
  const wrap=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a};
  if(kind==='keeper'&&dist<30)keeperWarm();
  const talking=talk&&talk.npc===n;
  let diff=wrap(toP-n.yaw);
  if(!seated&&!n.lock&&dist<5&&(Math.abs(diff)>0.45||talking)){const st=Math.sign(diff)*Math.min(Math.abs(diff),2.6*dtR);n.yaw+=st;diff-=st}
  const lim=seated?1.25:1.0,wantY=n.lockHead?0:dist<6?clamp(diff,-lim,lim):Math.sin(t*0.4+n.ph)*0.35;
  const headY0=seated?0.62:kind==='keeper'?0.968*(KEEPER.proportions.height||1):0.84,wantP=dist<6?clamp(Math.atan2(ey-headY0,Math.max(dist,0.3)),-0.45,0.4):0;
  const k=Math.min(1,dtR*6);n.hy+=(wantY-n.hy)*k;n.hp+=(wantP-n.hp)*k;
  if(n.pose){n.hy=n.pose[0];n.hp=n.pose[1]}
  const ph=n.ph,br=Math.sin(t*1.7+ph),breath=br*0.004;
  const blink=STUDIO&&STUDIO.blink!=null?STUDIO.blink:STUDIO&&STUDIO.open?1:((t*0.23+ph)%1)<0.035?0.12:1;
  const nod=talking?Math.sin(t*5.5)*0.05:0,jaw=talking?Math.max(0,Math.sin(t*9))*0.006:0;
  const B={p:[n.x+(n.ox||0),(n.fall||0)*0.07+(n.oy||0),n.z+(n.oz||0)],R:n.fall?m3(rYaw(n.yaw),rZ(n.fall*1.48)):rYaw(n.yaw)};   // fall: a plague victim, lying on its back
  const out={top:1,lantern:null};
  if(kind==='keeper'&&!NPC_CLASSIC&&dist<14&&keeperReady())buildKeeperSculpt(n,B,t,ph,breath,br,blink,jaw,nod,out,STUDIO&&STUDIO.lod!=null?STUDIO.lod:Q>=1?(dist<6?0:dist<9.5?1:2):(dist<8?1:2)); // near / mid / far; low quality never uses the near LOD
  else if(kind==='keeper'){
    const robe=[0.36,0.1,0.07,2],robeD=[0.24,0.07,0.06,2],gold=[0.8,0.58,0.18,2],skin=[0.8,0.6,0.47,1],white=[0.9,0.9,0.86,5],wood=[0.3,0.2,0.12,6];
    seg(B,[0,0,0],[0,0.05,0],0.178,0.172,gold);
    seg(B,[0,0.05,0],[0,0.5,0],0.172,0.092,robe);
    const U=subF(B,[0,0.48,0],rZ(-0.15));
    seg(U,[0,-0.01,0],[0,0.045,0],0.1,0.098,gold);
    ball(U,[0.1,0.02,0],0.02,[2.2,0.9,0.25,7],true);
    ball(U,[0,0.14+breath,0],[0.08,0.14,0.108],robe);
    ball(U,[-0.035,0.245+breath,0],[0.085,0.04,0.115],robeD);
    // staff arm
    const sw=br*0.01;
    const S1=[0,0.215+breath,0.118],E1=[0.07,0.11+breath,0.16],W1=[0.19,0.17+sw,0.17];
    limb(U,S1,E1,W1,0.04,0.045,0.062,robe,robe,skin,0.028);
    seg(U,[W1[0]-0.03,W1[1]-0.008,W1[2]-0.002],[W1[0]-0.02,W1[1]-0.005,W1[2]-0.001],0.064,0.065,gold);
    const hw=fpt(U,W1),SB={p:[hw[0],0,hw[2]],R:B.R};
    seg(SB,[0,0,0],[0,1.0,0],0.013,0.011,wood);
    seg(SB,[0,1.0,0],[0.07,1.06,0],0.011,0.009,wood);
    seg(SB,[0.07,1.06,0],[0.07,1.0,0],0.004,0.004,[0.15,0.14,0.13,4]);
    slab(SB,[0.07,0.955,0],[0.05,0.012,0.05],[0.16,0.15,0.14,4]);slab(SB,[0.07,0.885,0],[0.05,0.012,0.05],[0.16,0.15,0.14,4]);
    for(const q of[[-1,-1],[1,-1],[-1,1],[1,1]])slab(SB,[0.07+q[0]*0.021,0.92,q[1]*0.021],[0.006,0.07,0.006],[0.16,0.15,0.14,4]);
    ball(SB,[0.07,0.918,0],0.018,[3.0,1.5,0.4,7],true);
    out.lantern=fpt(SB,[0.07,0.918,0]);
    // resting arm, hand tucked at the sash
    limb(U,[0,0.215+breath,-0.118],[0.03,0.09+breath,-0.15],[0.1,0.06,-0.06],0.04,0.045,0.06,robe,robe,skin,0.028);
    seg(U,[0,0.25+breath,0],[0.005,0.3+breath,0],0.032,0.03,skin);
    const H=subF(U,[0.005,0.295+breath,0],m3(m3(rYaw(n.hy),rZ(n.hp+0.12+nod)),rX(Math.sin(t*0.5+ph)*0.03)));
    face(H,{skin,blink,iris:[0.55,0.3,0.1],brow:white,browH:0.012,browTilt:0.25,browOut:0.004,eyeS:0.85,nose:[0.02,0.022,0.016],talk:jaw});
    ball(H,[-0.03,0.07,0],[0.075,0.088,0.089],white);
    ball(H,[0,0.08,0.083],[0.016,0.026,0.011],skin,true);ball(H,[0,0.08,-0.083],[0.016,0.026,0.011],skin,true);
    ball(H,[0.06,0.03,0.022],[0.022,0.012,0.026],white,true);ball(H,[0.06,0.03,-0.022],[0.022,0.012,0.026],white,true);
    ball(H,[0.045,0.0,0],[0.045,0.045,0.062],white);
    seg(H,[0.05,-0.01-jaw,0],[0.085,-0.21-jaw,0],0.048,0.01,white);
    out.top=1.0;
  }else if(kind==='map'){
    const S=0.94,v=(x,y,z)=>[x*S,y*S,z*S];
    const teal=[0.08,0.4,0.42,2],tealD=[0.05,0.27,0.3,2],cream=[0.86,0.8,0.66,2],leg=[0.2,0.14,0.11,2],boot=[0.36,0.21,0.1,3],belt=[0.3,0.17,0.08,3],
          hair=[0.55,0.2,0.07,5],skin=[0.92,0.71,0.57,1],must=[0.9,0.62,0.14,2];
    const sway=Math.sin(t*0.9+ph)*0.006;
    for(const z of[-1,1]){
      const hip=v(0,0.45,z*0.052),knee=v(0.012*z,0.25,z*0.058),ank=v(0,0.05,z*0.062);
      seg(B,hip,knee,0.047*S,0.038*S,leg);ball(B,knee,0.04*S,boot,true);seg(B,knee,ank,0.04*S,0.03*S,boot);
      seg(B,v(0.012*z,0.235,z*0.058),v(0.012*z,0.262,z*0.058),0.043*S,0.045*S,cream);
      ball(B,v(0.03,0.028,z*0.064),[0.062*S,0.03*S,0.036*S],boot,true);
    }
    const U=subF(B,v(sway,0.45,0),rX(sway*2));
    ball(U,v(0,0.02,0),[0.07*S,0.06*S,0.088*S],tealD);
    seg(U,v(0,-0.1,0),v(0,0.07,0),0.118*S,0.076*S,teal);
    seg(U,v(0,-0.1,0),v(0,-0.08,0),0.121*S,0.117*S,cream);
    seg(U,v(0,0.045,0),v(0,0.075,0),0.081*S,0.079*S,belt);
    slab(U,v(0.078,0.06,0),[0.012*S,0.03*S,0.03*S],[0.85,0.68,0.25,4]);
    ball(U,v(0,0.17+breath,0),[0.064*S,0.115*S,0.088*S],teal);
    slab(U,v(-0.01,0.0,0.105),[0.06*S,0.07*S,0.03*S],belt);slab(U,v(-0.01,0.025,0.122),[0.062*S,0.03*S,0.008*S],[0.4,0.25,0.12,3]);
    seg(U,v(0.02,0.27,-0.07),v(-0.01,0.03,0.1),0.011*S,0.011*S,belt);
    seg(U,v(0,0.245+breath,0),v(0,0.275+breath,0),0.055*S,0.045*S,must);
    seg(U,v(-0.04,0.255+breath,0.02),v(-0.085,0.12+breath,0.03+sway*3),0.02*S,0.012*S,must);
    // arm holding the rolled map up in front
    const lift=talking?0.03+Math.sin(t*3)*0.01:0;
    const W1=v(0.15,0.2+lift+breath,0.05);
    limb(U,v(0,0.225+breath,0.1),v(0.045,0.1+breath,0.135),W1,0.03*S,0.027*S,0.023*S,cream,cream,skin,0.026*S);
    seg(U,[W1[0]+0.005,W1[1]-0.07*S,W1[2]-0.03*S],[W1[0]+0.012,W1[1]+0.1*S,W1[2]+0.035*S],0.019*S,0.019*S,[0.9,0.84,0.66]);
    seg(U,[W1[0]+0.008,W1[1]+0.0*S,W1[2]],[W1[0]+0.009,W1[1]+0.02*S,W1[2]+0.007*S],0.0205*S,0.0205*S,[0.7,0.15,0.12,2]);
    // other hand on the hip
    limb(U,v(0,0.225+breath,-0.1),v(-0.03,0.1+breath,-0.185),v(0.03,0.035,-0.1),0.03*S,0.027*S,0.023*S,cream,cream,skin,0.026*S);
    seg(U,v(0,0.27+breath,0),v(0.003,0.31+breath,0),0.027*S,0.026*S,skin);
    const H=subF(U,v(0.003,0.305+breath,0),m3(m3(rYaw(n.hy),rZ(n.hp+nod)),rX(Math.sin(t*0.6+ph)*0.05)));
    const HS={p:H.p,R:H.R.map(q=>q*S)};
    face(HS,{skin,blink,iris:[0.15,0.5,0.3],brow:[0.4,0.15,0.06,5],browH:0.005,browTilt:-0.1,eyeS:1.3,nose:[0.011,0.012,0.01],mouth:[0.72,0.3,0.28],mouthW:0.02,talk:jaw});
    ball(HS,[-0.014,0.1,0],[0.092,0.092,0.091],hair);
    ball(HS,[0.058,0.15,0.012],[0.04,0.028,0.07],hair);
    ball(HS,[0.03,0.09,0.078],[0.03,0.07,0.02],hair,true);ball(HS,[0.03,0.09,-0.078],[0.03,0.07,0.02],hair,true);
    ball(HS,[-0.085,0.16,0],0.036,hair);
    seg(HS,[-0.095,0.15,0],[-0.14+sway*2,-0.04,sway*6],0.03,0.01,hair);
    seg(HS,[-0.09,0.145,0],[-0.1,0.13,0],0.033,0.033,must);
    out.top=0.98;
  }else if(n.type==='delver'){
    const lea=[0.4,0.24,0.12,3],leaD=[0.27,0.16,0.09,3],iron=[0.42,0.44,0.48,4],ironD=[0.25,0.26,0.29,4],skin=[0.78,0.56,0.44,1],beard=[0.42,0.22,0.1,5],
          cloth=[0.3,0.3,0.24,2],band=[0.88,0.86,0.8,2],boot=[0.22,0.14,0.09,3];
    // legs stretched out on the floor, one of them bandaged
    limb(B,[0.02,0.1,0.08],[0.27,0.075,0.1],[0.5,0.05,0.11],0.062,0.052,0.042,cloth,cloth,null);
    ball(B,[0.52,0.075,0.11],[0.04,0.07,0.045],boot,true);seg(B,[0.4,0.058,0.105],[0.5,0.05,0.11],0.05,0.046,boot);
    limb(B,[0.02,0.1,-0.08],[0.25,0.19,-0.1],[0.44,0.05,-0.125],0.062,0.052,0.042,cloth,cloth,null);
    ball(B,[0.47,0.07,-0.128],[0.04,0.07,0.045],boot,true);seg(B,[0.37,0.1,-0.115],[0.44,0.05,-0.125],0.05,0.046,boot);
    for(const q of[0.3,0.48,0.66]){const a=[0.02+0.23*q,0.1+0.09*q,-0.08-0.02*q],b2=[a[0]+0.045,a[1]+0.018,a[2]-0.004];seg(B,a,b2,0.066-q*0.008,0.065-q*0.008,band)}
    ball(B,[0.15,0.2,-0.092],[0.02,0.012,0.02],[0.55,0.08,0.06],true);
    ball(B,[0,0.1,0],[0.11,0.085,0.13],leaD);
    const U=subF(B,[-0.02,0.11,0],rZ(0.2));
    ball(U,[0,0.17+breath,0],[0.105,0.15,0.135],lea);
    seg(U,[0,0.03,0],[0,0.075,0],0.123,0.128,[0.2,0.12,0.07,3]);slab(U,[0.12,0.052,0],[0.02,0.045,0.05],iron);
    seg(U,[0.03,0.3,0.1],[0.06,0.05,-0.1],0.014,0.014,[0.2,0.12,0.07,3]);
    for(const z of[-1,1])ball(U,[0,0.275+breath,z*0.135],[0.065,0.045,0.07],iron);
    // one hand on the good knee, the other clamped over the wound
    limb(U,[0,0.26+breath,0.14],[0.11,0.12,0.19],[0.27,0.06,0.12],0.05,0.045,0.04,cloth,leaD,skin,0.04);
    const grip=Math.sin(t*2.1+ph)*0.004;
    limb(U,[0,0.26+breath,-0.14],[0.1,0.13+grip,-0.2],[0.22,0.13+grip,-0.1],0.05,0.045,0.04,cloth,leaD,skin,0.04);
    seg(U,[0,0.3+breath,0],[0.01,0.35+breath,0],0.045,0.042,skin);
    const H=subF(U,[0.01,0.34+breath,0],m3(m3(rYaw(n.hy),rZ(n.hp-0.2+nod+Math.sin(t*0.8+ph)*0.03)),rX(0.06)));
    const HS={p:H.p,R:H.R.map(q=>q*1.08)};
    face(HS,{skin,blink,iris:[0.3,0.22,0.12],brow:beard,browH:0.011,browTilt:0.3,browUp:-0.008,eyeS:0.8,eyeY:0.08,nose:[0.024,0.024,0.021],ears:true,talk:jaw});
    ball(HS,[0.0,0.128,0],[0.096,0.072,0.094],iron);
    seg(HS,[0.0,0.098,0],[0.0,0.113,0],0.099,0.097,ironD);
    seg(HS,[0,0.19,0],[0,0.215,0],0.02,0.008,ironD);
    slab(HS,[0.094,0.15,0],[0.02,0.035,0.03],ironD);ball(HS,[0.107,0.15,0],0.012,[2.6,1.9,0.6,7],true);
    ball(HS,[0.045,0.0,0],[0.062,0.07,0.082],beard);
    ball(HS,[0.07,0.035,0.028],[0.025,0.014,0.03],beard,true);ball(HS,[0.07,0.035,-0.028],[0.025,0.014,0.03],beard,true);
    seg(HS,[0.06,-0.04-jaw,0.03],[0.085,-0.15-jaw,0.035],0.026,0.008,beard);seg(HS,[0.06,-0.04-jaw,-0.03],[0.085,-0.15-jaw,-0.035],0.026,0.008,beard);
    slab(HS,[0.088,-0.1-jaw,0.034],[0.02,0.014,0.02],iron);slab(HS,[0.088,-0.1-jaw,-0.034],[0.02,0.014,0.02],iron);
    // pickaxe and pack on the floor beside him
    seg(B,[0.0,0.018,0.27],[0.42,0.018,0.36],0.014,0.012,[0.33,0.21,0.11,6]);
    seg(B,[0.42,0.02,0.36],[0.39,0.03,0.5],0.02,0.004,iron);seg(B,[0.42,0.02,0.36],[0.45,0.03,0.22],0.02,0.004,iron);
    ball(B,[-0.03,0.07,-0.27],[0.09,0.075,0.08],[0.33,0.27,0.16,2]);seg(B,[-0.03,0.13,-0.27],[-0.03,0.16,-0.27],0.05,0.035,[0.24,0.19,0.11,3]);
    out.top=0.72;out.lamp=fpt(HS,[0.107,0.15,0]);
  }else if(n.type==='pat'){
    // Pat Sajak: a small man (about three and a half feet tall) in a sharp navy suit, red tie and silver hair, presenting the wheel
    const S=0.6,v=(x,y,z)=>[x*S,y*S,z*S];
    const suit=[0.11,0.13,0.27,2],suitD=[0.06,0.07,0.16,2],shirt=[0.93,0.93,0.9,2],tie=[0.72,0.07,0.1,2],shoe=[0.05,0.04,0.04,4],
          skin=[0.92,0.7,0.57,1],hair=[0.8,0.78,0.76,5],card=[0.96,0.9,0.72,2];
    const sway=Math.sin(t*0.9+ph)*0.006,dead=!!n.fall;
    // which hand is on the wheel's side
    const W0=F&&F.safe&&F.safe.wheel,sd=W0?(Math.hypot(fpt(B,[0,0,0.3])[0]-W0.x,fpt(B,[0,0,0.3])[2]-W0.z)<Math.hypot(fpt(B,[0,0,-0.3])[0]-W0.x,fpt(B,[0,0,-0.3])[2]-W0.z)?1:-1):1;
    const present=dead?0:!WOF.done?1:0.35+0.3*Math.max(0,Math.sin(t*0.6+ph)),bounce=!WOF.done?Math.abs(Math.sin(t*6))*0.01:0;
    for(const z of[-1,1]){
      const hip=v(0,0.45,z*0.055),knee=v(0.012,0.25,z*0.058),ank=v(0,0.06,z*0.06);
      seg(B,hip,knee,0.052*S,0.044*S,suit);ball(B,knee,0.044*S,suit,true);seg(B,knee,ank,0.044*S,0.038*S,suit);
      ball(B,v(0.035,0.032,z*0.06),[0.072*S,0.034*S,0.04*S],shoe,true);
    }
    const U=subF(B,v(sway,0.45+bounce,0),rX(sway*2));
    seg(U,v(0,-0.1,0),v(0,0.08,0),0.12*S,0.088*S,suit);                       // jacket skirt
    seg(U,v(0,0.04,0),v(0,0.07,0),0.09*S,0.088*S,suitD);                       // waist seam
    ball(U,v(0,0.17+breath,0),[0.072*S,0.122*S,0.098*S],suit);                // chest
    slab(U,v(0.064,0.205+breath,0),[0.012*S,0.058*S,0.03*S],shirt,rZ(0.12));  // shirt front
    slab(U,v(0.074,0.185+breath,0),[0.008*S,0.072*S,0.011*S],tie,rZ(0.12));
    ball(U,v(0.072,0.25+breath,0),[0.014*S,0.014*S,0.016*S],tie,true);
    for(const z of[-1,1])slab(U,v(0.062,0.2+breath,z*0.037),[0.01*S,0.068*S,0.016*S],suitD,m3(rX(-z*0.38),rZ(0.12)));   // lapels
    slab(U,v(0.066,0.215+breath,-sd*0.06),[0.006*S,0.012*S,0.016*S],shirt);    // pocket square
    for(const z of[-1,1])ball(U,v(-0.005,0.24+breath,z*0.096),[0.052*S,0.042*S,0.05*S],suit,true);
    // presenting arm: out towards the wheel, palm open
    const lift=present*0.11;
    const E1=v(0.05,0.14+lift*0.6+breath,sd*0.17),W1=v(0.1+0.04*present,0.12+lift*1.4+breath,sd*(0.22+0.07*present));
    limb(U,v(0,0.23+breath,sd*0.1),E1,W1,0.034*S,0.03*S,0.025*S,suit,suit,null);
    seg(U,[W1[0]-0.01*S,W1[1]-0.004*S,W1[2]-sd*0.014*S],W1,0.027*S,0.026*S,shirt);
    ball(U,[W1[0]+0.012*S,W1[1]+0.004*S,W1[2]+sd*0.012*S],[0.026*S,0.012*S,0.03*S],skin,true);
    // the other hand holds the cue cards at the chest
    const W2=v(0.13,0.13+breath,-sd*0.05);
    limb(U,v(0,0.23+breath,-sd*0.1),v(0.03,0.11+breath,-sd*0.15),W2,0.034*S,0.03*S,0.025*S,suit,suit,skin,0.028*S);
    slab(U,[W2[0]+0.012*S,W2[1]+0.04*S,W2[2]],[0.004*S,0.05*S,0.036*S],card,rZ(-0.25));
    seg(U,v(0,0.262+breath,0),v(0,0.288+breath,0),0.036*S,0.034*S,shirt);    // collar
    seg(U,v(0,0.27+breath,0),v(0.003,0.31+breath,0),0.03*S,0.028*S,skin);
    const H=subF(U,v(0.003,0.305+breath,0),m3(m3(rYaw(n.hy),rZ(n.hp+nod+(dead?0.4:0))),rX(Math.sin(t*0.6+ph)*0.04)));
    const K=S*1.25,HS={p:H.p,R:H.R.map(q=>q*K)};                              // a big friendly head on a small man
    face(HS,{skin,blink:dead?0.05:blink,iris:[0.35,0.45,0.62],brow:[0.62,0.6,0.58,5],browH:0.008,browTilt:-0.18,browUp:0.004,eyeS:1.05,nose:[0.017,0.019,0.016],ears:true,
      mouth:[0.45,0.12,0.12],mouthW:0.034,talk:jaw+(!WOF.done?Math.max(0,Math.sin(t*7))*0.006:0.003)});
    slab(HS,[0.083,0.041,0],[0.004,0.004,0.028],[0.98,0.97,0.94,5]);           // the grin
    ball(HS,[0.07,0.05,0.045],[0.012,0.008,0.014],[0.95,0.6,0.5,1],true);ball(HS,[0.07,0.05,-0.045],[0.012,0.008,0.014],[0.95,0.6,0.5,1],true);
    ball(HS,[-0.014,0.122,0],[0.087,0.052,0.089],hair);                         // silver hair, neatly parted
    ball(HS,[-0.05,0.075,0],[0.055,0.07,0.088],hair,true);
    for(const z of[-1,1])ball(HS,[-0.008,0.092,z*0.076],[0.042,0.032,0.02],hair,true);
    ball(HS,[0.04,0.148,0.018],[0.04,0.018,0.066],hair);
    slab(HS,[0.0,0.17,-0.035],[0.06,0.004,0.004],[0.55,0.53,0.5,5]);            // the part
    out.top=0.6;
  }else if(n.type==='sales'){
    // The timeshare salesman: teal polo with the collar popped, khakis, loafers, a lanyard, sunglasses up on his gelled hair, a clipboard,
    // and the other hand always making a point
    const S=0.97,v=(x,y,z)=>[x*S,y*S,z*S];
    const polo=[0.06,0.55,0.52,2],poloD=[0.04,0.4,0.38,2],khaki=[0.72,0.62,0.44,2],shoe=[0.32,0.18,0.09,4],skin=[0.9,0.7,0.55,1],hair=[0.32,0.2,0.1,6],
          board=[0.55,0.38,0.2,6],paper=[0.96,0.96,0.92,2],lan=[0.1,0.2,0.7,2],glass=[0.03,0.03,0.04,8];
    const w=n.walk||0,mv=n.mv||0,sw=Math.sin(w)*mv,bob=Math.abs(Math.cos(w))*0.018*mv,pitch=n.pitch?1:0;
    for(const z of[-1,1]){
      const st=sw*z,hip=v(0,0.45,z*0.055),knee=v(0.012+0.09*st,0.25+0.03*Math.max(0,st),z*0.06),ank=v(0.17*st,0.05+0.06*Math.max(0,-st),z*0.064);
      seg(B,hip,knee,0.05*S,0.042*S,khaki);ball(B,knee,0.042*S,khaki,true);seg(B,knee,ank,0.042*S,0.036*S,khaki);
      ball(B,[ank[0]+0.03*S,ank[1]-0.02*S,ank[2]],[0.068*S,0.03*S,0.036*S],shoe,true);
    }
    const U=subF(B,v(0,0.45+bob,0),m3(rYaw(sw*0.12),rZ(-0.06*mv+0.03*pitch*Math.sin(t*3))));
    seg(U,v(0,-0.1,0),v(0,0.07,0),0.118*S,0.08*S,khaki);
    seg(U,v(0,0.04,0),v(0,0.075,0),0.082*S,0.08*S,[0.2,0.12,0.06,3]);                                   // belt
    ball(U,v(0,0.16+breath,0),[0.068*S,0.12*S,0.096*S],polo);
    for(const z of[-1,1])slab(U,v(0.02,0.285+breath,z*0.03),[0.03*S,0.022*S,0.014*S],poloD,rX(z*0.6));  // popped collar
    slab(U,v(0.066,0.24+breath,0),[0.006*S,0.04*S,0.012*S],poloD);
    for(const z of[-1,1])seg(U,v(0.04,0.27+breath,z*0.03),v(0.072,0.14+breath,z*0.004),0.004*S,0.004*S,lan);  // lanyard
    slab(U,v(0.074,0.11+breath,0),[0.004*S,0.03*S,0.022*S],paper);slab(U,v(0.0762,0.12+breath,0),[0.002*S,0.008*S,0.018*S],[0.8,0.1,0.1,2]);
    for(const z of[-1,1])ball(U,v(-0.005,0.235+breath,z*0.096),[0.05*S,0.04*S,0.05*S],polo,true);
    // clipboard arm and the pointing, persuading arm
    const W1=v(0.15,0.12+breath,0.08);
    limb(U,v(0,0.225+breath,0.1),v(0.03,0.11+breath,0.15),W1,0.034*S,0.03*S,0.024*S,polo,skin,skin,0.026*S);
    slab(U,[W1[0]+0.02*S,W1[1]+0.03*S,W1[2]-0.03*S],[0.006*S,0.075*S,0.055*S],board,rZ(-0.5));
    slab(U,[W1[0]+0.026*S,W1[1]+0.03*S,W1[2]-0.03*S],[0.003*S,0.065*S,0.047*S],paper,rZ(-0.5));
    const g=pitch?Math.sin(t*4):Math.sin(t*1.5)*0.3,W2=v(0.17+0.04*g,0.2+0.06*Math.abs(g)+breath,-0.13-0.03*g);
    limb(U,v(0,0.225+breath,-0.1),v(0.05,0.13+breath,-0.17),W2,0.034*S,0.03*S,0.024*S,polo,skin,skin,0.026*S);
    seg(U,W2,[W2[0]+0.04*S,W2[1]+0.01*S,W2[2]],0.006*S,0.005*S,skin);                                   // the finger, making a point
    seg(U,v(0,0.27+breath,0),v(0.003,0.31+breath,0),0.03*S,0.028*S,skin);
    const H=subF(U,v(0.003,0.305+breath,0),m3(m3(rYaw(n.hy||0),rZ((n.hp||0)+0.05)),rX(Math.sin(t*(pitch?2.2:0.7)+ph)*0.05)));
    const HS={p:H.p,R:H.R.map(q=>q*S)};
    face(HS,{skin,blink,iris:[0.25,0.4,0.3],brow:hair,browH:0.008,browTilt:-0.2,browUp:0.006,eyeS:1,nose:[0.018,0.019,0.016],ears:true,mouth:[0.5,0.14,0.14],mouthW:0.036,talk:pitch?Math.max(0,Math.sin(t*10))*0.012:0.003});
    slab(HS,[0.083,0.04,0],[0.004,0.005,0.03],[0.99,0.99,0.97,5]);                                    // a very white smile
    ball(HS,[-0.01,0.12,0],[0.09,0.058,0.092],hair);ball(HS,[0.03,0.16,0],[0.06,0.03,0.07],hair);        // gelled
    for(const z of[-1,1])slab(HS,[0.03,0.178,z*0.03],[0.02,0.008,0.022],glass);slab(HS,[0.035,0.18,0],[0.004,0.004,0.012],glass);  // sunglasses up top
    out.top=S;
  }else if(n.type==='tickle'){
    // The Tickle Monster: a sleazy old man, hunched, bald on top with a grey comb-over and mullet, open trench coat, sunglasses, gold chain,
    // both hands out in front pumping and wiggling like he is already tickling someone
    const S=0.97,v=(x,y,z)=>[x*S,y*S,z*S];
    const coat=[0.55,0.46,0.3,2],coatD=[0.38,0.31,0.2,2],pants=[0.32,0.22,0.15,2],shoe=[0.9,0.88,0.84,4],tank=[0.9,0.88,0.74,2],stain=[0.68,0.6,0.38,2],
          skin=[0.84,0.64,0.54,1],hair=[0.76,0.75,0.73,5],gold=[1.0,0.78,0.22,4],glass=[0.03,0.03,0.04,8],fur=[0.8,0.78,0.76,5],spot=[0.62,0.44,0.34,1];
    const w=n.walk||0,mv=n.mv||0,sw=Math.sin(w)*mv,bob=Math.abs(Math.cos(w))*0.02*mv,gig=n.gig||0,shake=Math.sin(t*26)*0.014*gig,reach=n.reach==null?0.5:n.reach;
    for(const z of[-1,1]){
      const st=sw*z,hip=v(0,0.45,z*0.055),knee=v(0.012+0.09*st,0.25+0.03*Math.max(0,st),z*0.06),ank=v(0.17*st,0.05+0.06*Math.max(0,-st),z*0.064);
      seg(B,hip,knee,0.05*S,0.042*S,pants);ball(B,knee,0.042*S,pants,true);seg(B,knee,ank,0.042*S,0.05*S,pants);   // flares
      ball(B,[ank[0]+0.03*S,ank[1]-0.02*S,ank[2]],[0.066*S,0.03*S,0.036*S],shoe,true);
    }
    const U=subF(B,v(0,0.45+bob+shake,0),m3(rYaw(sw*0.15),rZ(-0.14*mv-0.16)));   // an old man's stoop
    // the coat: skirt to the knee, open down the front
    for(const z of[-1,1])seg(U,v(-0.012,0.05,z*0.05),v(-0.02-0.04*mv,-0.24,z*0.075),0.075*S,0.1*S,coat);
    seg(U,v(-0.03,0.05,0),v(-0.06-0.05*mv,-0.24,0),0.07*S,0.1*S,coatD);
    ball(U,v(-0.012,0.17+breath,0),[0.07*S,0.128*S,0.104*S],coat);
    slab(U,v(0.056,0.15+breath,0),[0.016*S,0.09*S,0.045*S],tank);
    ball(U,v(0.07,0.11,0.015),[0.006*S,0.018*S,0.015*S],stain,true);
    for(let i=0;i<9;i++)ball(U,v(0.072,0.22+((i*7)%5)*0.007+breath,((i*5)%9-4)*0.006),0.004*S,fur,true);       // chest hair
    for(let i=0;i<7;i++){const a=(i/6-0.5)*2.2;ball(U,v(0.07+Math.cos(a)*0.004,0.245-Math.cos(a)*0.03+breath,Math.sin(a)*0.04),0.004*S,gold,true)}
    ball(U,v(0.075,0.212+breath,0),0.008*S,gold,true);
    for(const z of[-1,1]){slab(U,v(0.05,0.17+breath,z*0.06),[0.014*S,0.11*S,0.02*S],coatD,rX(z*0.18));slab(U,v(0.0,0.29+breath,z*0.05),[0.03*S,0.035*S,0.012*S],coatD,rX(z*0.5))} // lapels, popped collar
    // arms out in front, fingers going
    for(const z of[-1,1]){
      const pump=Math.sin(t*11+(z>0?0:Math.PI)),r=reach*(0.75+0.25*pump);   // hands take turns jabbing forward
      const Sh=v(0,0.23+breath,z*0.11),E=v(0.07+0.05*r,0.15+0.05*r,z*0.17),Wr=v(0.13+0.13*r,0.16+0.07*r+Math.sin(t*14+z)*0.014,z*(0.13-0.03*r)+Math.cos(t*11+z)*0.008);
      limb(U,Sh,E,Wr,0.04*S,0.036*S,0.03*S,coat,coat,null);
      ball(U,Wr,[0.026*S,0.022*S,0.03*S],skin,true);
      for(let f=0;f<4;f++){const fz=Wr[2]+(f-1.5)*0.012*S,wig=Math.sin(t*24+f*1.7+z)*0.03;seg(U,[Wr[0]+0.015*S,Wr[1],fz],[Wr[0]+0.05*S,Wr[1]+(wig-0.008)*S,fz+wig*0.2*S],0.007*S,0.005*S,skin)}
      ball(U,[Wr[0]-0.004,Wr[1]+0.012*S,Wr[2]],0.006*S,spot,true);
    }
    seg(U,v(0,0.27+breath,0),v(0.003,0.31+breath,0),0.03*S,0.028*S,skin);
    const H=subF(U,v(0.003,0.305+breath,0),m3(m3(rYaw(n.hy||0),rZ((n.hp||0)+0.08+Math.sin(t*13)*0.06*gig)),rX(Math.sin(t*0.8+ph)*0.05)));
    const HS={p:H.p,R:H.R.map(q=>q*S)};
    face(HS,{skin,blink,iris:[0.3,0.25,0.18],brow:hair,browH:0.012,browTilt:-0.3,eyeS:1,nose:[0.02,0.02,0.017],ears:true,mouth:[0.4,0.1,0.1],mouthW:0.034,talk:0.006+gig*Math.max(0,Math.sin(t*18))*0.012});
    for(const z of[-1,1])slab(HS,[0.088,0.088,z*0.033],[0.006,0.017,0.024],glass);slab(HS,[0.09,0.093,0],[0.004,0.004,0.012],gold);   // sunglasses
    slab(HS,[0.09,0.058,0],[0.006,0.006,0.03],[0.6,0.58,0.56,5]);                                             // thin grey moustache
    for(const z of[-1,1])ball(HS,[-0.02,0.08,z*0.07],[0.06,0.04,0.03],hair,true);                            // grey fringe over the ears
    ball(HS,[-0.055,0.08,0],[0.045,0.06,0.08],hair,true);
    for(let k=0;k<4;k++)seg(HS,[0.0,0.172,0.05-k*0.004],[0.05-k*0.01,0.168,-0.055+k*0.01],0.004,0.004,hair); // the comb-over, four strands
    seg(HS,[-0.07,0.07,0],[-0.11,-0.07,0],0.045,0.022,hair);                                                  // a thin grey mullet
    ball(HS,[0.02,0.17,0.03],0.01,spot,true);ball(HS,[-0.02,0.16,-0.04],0.008,spot,true);                    // liver spots
    for(const z of[-1,1]){ball(HS,[0.05,0.03,z*0.05],[0.03,0.035,0.03],skin,true);                            // jowls
      slab(HS,[0.085,0.11,z*0.034],[0.008,0.007,0.026],hair,rX(z*0.25))}                                     // bushy grey brows over the shades
    ball(HS,[0.098,0.06,0],[0.016,0.018,0.016],[0.88,0.55,0.48,1],true);                                    // a red old nose
    for(const z of[-1,1])seg(HS,[0.086,0.072,z*0.05],[0.08,0.064,z*0.062],0.002,0.002,[0.6,0.42,0.34,1]);   // crow's feet
    out.top=S;
  }
  return out;
}
/* ---------- creatures in the same jointed style ---------- */
const facingMoose=s=>s.mooseLure?.active||MP.guest&&s.mooseFollowing;
function buildShade(s,t,ex,ez){
  const chase=s.state===1&&s.stun<=0,tp=Math.atan2(ez-s.z,ex-s.x),fa=chase&&!facingMoose(s)?tp:(s.face||0);
  const y=0.06+Math.sin(s.ph)*0.03;
  const c=s.stun>0?[0.3,0.36,0.5,10]:chase?[0.34,0.08,0.12,10]:[0.2,0.14,0.33,10],cd=[c[0]*0.6,c[1]*0.6,c[2]*0.6,10];
  const bone=[0.74,0.72,0.64,9];
  const lean=chase?-0.3:-0.08,B={p:[s.x,y,s.z],R:m3(rYaw(fa),rZ(lean)),lo:[s.ph,0,0]};
  const sw=t*2.2+s.ph;
  seg(B,[0,0.16,0],[0,0.8,0],0.2,0.1,c);
  // ragged hem that trails behind
  for(let i=0;i<9;i++){
    const a=i/9*Math.PI*2,r=0.185,w=Math.sin(sw+i*1.7)*0.03,dr=chase?0.14:0.05;
    seg(B,[Math.cos(a)*r,0.2,Math.sin(a)*r],[Math.cos(a)*(r+0.03)-dr+w,-0.04-((i*7)%3)*0.035,Math.sin(a)*(r+0.03)+w],0.062,0.008,i%2?c:cd);
  }
  ball(B,[0,0.8,0],[0.1,0.07,0.17],c);
  const H=subF(B,[0.01,0.86,0],rZ(-lean*0.7+Math.sin(sw*0.5)*0.05));
  ball(H,[0,0.1,0],[0.115,0.13,0.115],c);
  seg(H,[-0.04,0.15,0],[-0.15,0.27,0],0.075,0.012,cd);
  ball(H,[0.05,0.085,0],[0.075,0.092,0.086],[0,0,0,0]);
  // long arms: hanging at rest, reaching when it hunts
  const rch=chase?1:0,gr=Math.sin(t*7+s.ph)*0.02*rch;
  for(const z of[-1,1]){
    const S=[0,0.8,z*0.16],E=rch?[0.2,0.7,z*0.2]:[0.03,0.58,z*0.22],W=rch?[0.44,0.8+gr*z,z*0.12]:[0.1,0.4+Math.sin(sw+z)*0.015,z*0.2];
    seg(B,S,E,0.055,0.05,c);ball(B,E,0.05,c,true);
    seg(B,E,[E[0]+(W[0]-E[0])*0.45,E[1]+(W[1]-E[1])*0.45,E[2]+(W[2]-E[2])*0.45],0.05,0.06,cd);
    seg(B,E,W,0.017,0.014,bone);
    for(let k=-1;k<=1;k++){const dx=W[0]-E[0],dy=W[1]-E[1],l=Math.hypot(dx,dy)||1;
      seg(B,W,[W[0]+dx/l*0.1,W[1]+dy/l*0.1-0.02-(rch?0:0.02),W[2]+k*0.028],0.009,0.002,bone)}
  }
  return {eyes:[fpt(H,[0.118,0.1,0.034]),fpt(H,[0.118,0.1,-0.034])],chase};
}
function buildStalker(s,t,ex,ez){
  const tp=facingMoose(s)?s.face||0:Math.atan2(ez-s.z,ex-s.x),k=s.stun>0?0.6:1;
  const st=[0.62*k,0.6*k,0.55*k,9],sd=[0.4*k,0.39*k,0.36*k,9],hole=[0.03,0.03,0.03,0];
  const pose=(Math.floor(s.x*3.1)+Math.floor(s.z*5.3))&3;
  const B={p:[s.x,0,s.z],R:rYaw(tp),lo:[0.3,0,0.7]};
  seg(B,[0,0,0],[0,0.04,0],0.215,0.21,sd);
  seg(B,[0,0.04,0],[0,0.56,0],0.2,0.105,st);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2+0.3;seg(B,[Math.cos(a)*0.19,0.03,Math.sin(a)*0.19],[Math.cos(a)*0.1,0.56,Math.sin(a)*0.1],0.03,0.014,sd)}
  const U=subF(B,[0,0.54,0],rZ(pose>=2?-0.22:-0.05));
  ball(U,[0,0.14,0],[0.09,0.15,0.125],st);
  seg(U,[0,0.0,0],[0,0.035,0],0.108,0.106,sd);
  const tilt=pose===3?0.35:pose===0?-0.25:0;
  const H=subF(U,[0,0.3,0],m3(rZ(tilt*0.6),rX(pose===3?0.3:0)));
  seg(U,[0,0.26,0],[0,0.31,0],0.035,0.033,st);
  ball(H,[0.005,0.09,0],[0.085,0.1,0.082],st);
  ball(H,[-0.02,0.1,0],[0.09,0.105,0.09],sd);
  seg(H,[-0.06,0.08,0],[-0.1,-0.12,0],0.06,0.03,sd);
  for(const z of[-0.034,0.034])ball(H,[0.076,0.095,z],[0.012,0.02,0.017],hole,true);
  ball(H,[0.09,0.065,0],[0.014,0.018,0.012],st,true);
  ball(H,[0.078,0.03,0],pose>=2?[0.012,0.03,0.022]:[0.008,0.006,0.02],hole,true);
  const arms=[
    [[0.13,-0.06,0.17],[0.1,0.1,0.045]],   // hands over the face
    [[0.05,-0.08,0.17],[0.07,-0.2,0.15]],  // arms at the sides
    [[0.2,-0.04,0.17],[0.42,0.02,0.1]],    // reaching for you
    [[0.08,0.1,0.25],[0.2,0.28,0.2]],      // raised to strike
  ];
  for(const z of[-1,1]){
    const A=(pose===1&&z>0)?arms[2]:arms[pose],S=[0,0.24,z*0.13],E=[A[0][0],0.24+A[0][1],z*A[0][2]],W=[A[1][0],0.24+A[1][1],z*A[1][2]];
    limb(U,S,E,W,0.042,0.036,0.03,st,st,st,0.034);
    if(pose>=1&&!(pose===1&&z<0))for(let q=-1;q<=1;q++){const dx=W[0]-E[0],dy=W[1]-E[1],l=Math.hypot(dx,dy)||1;seg(U,W,[W[0]+dx/l*0.08,W[1]+dy/l*0.08,W[2]+q*0.025],0.011,0.003,sd)}
  }
}
function buildWatcher(s,t,ex,ez){
  const tp=facingMoose(s)?s.face||0:Math.atan2(ez-s.z,ex-s.x),c=[0.022,0.022,0.027,9],k=WALL_H*0.95/1.2;
  const B={p:[s.x,0,s.z],R:rYaw(tp),lo:[0.3,0,0.7]};
  for(const z of[-1,1])limb(B,[0,0.62*k,z*0.04],[0.025,0.31*k,z*0.045],[0,0.01,z*0.045],0.028,0.021,0.016,c,c,c,0.02);
  const U=subF(B,[0,0.61*k,0],rZ(-0.05+Math.sin(t*0.6+s.ph)*0.025));
  seg(U,[0,0,0],[0,0.37*k,0],0.045,0.058,c);
  seg(U,[0,0.36*k,0],[0.01,0.45*k,0],0.02,0.017,c);
  const H=subF(U,[0.012,0.5*k,0],rX(Math.sin(t*0.23+s.ph)*0.18+0.2));
  ball(H,[0,0,0],[0.046,0.068*k,0.046],c);
  for(const z of[-1,1])limb(U,[0,0.35*k,z*0.072],[0.012,0.03*k,z*0.088],[0.035,-0.3*k,z*0.082],0.021,0.016,0.012,c,c,c,0.017);
  return [fpt(H,[0.043,0.012,-0.018]),fpt(H,[0.043,0.012,0.018])];
}
function buildHand(t,ex,ey,ez,yaw,pitch){
  const sw=Math.sin(P.bob)*0.006,up=Math.abs(Math.cos(P.bob))*0.007+Math.sin(t*1.3)*0.002-Math.min(0.03,Math.max(-0.03,P.vy*0.006));
  const f={p:[ex,ey,ez],R:m3(rYaw(yaw),rZ(pitch*0.85)),lo:[0.2,0.4,0.6]};
  const skin=[0.74,0.54,0.42,1],lea=[0.3,0.2,0.12,3],wood=[0.36,0.23,0.12,6],rag=[0.13,0.1,0.08,2],iron=[0.16,0.15,0.15,4];
  const h=[0.205,-0.172+up,0.185+sw],tip=[0.224,-0.07+up,0.172+sw];
  seg(f,[0.02,-0.34+up,0.3+sw],[0.17,-0.195+up,0.2+sw],0.034,0.024,lea);
  seg(f,[0.165,-0.2+up,0.203+sw],[0.19,-0.18+up,0.192+sw],0.027,0.023,iron);
  ball(f,h,[0.024,0.022,0.024],skin);
  for(let i=0;i<4;i++)ball(f,[h[0]+0.014,h[1]-0.014+i*0.0095,h[2]-0.008],[0.011,0.006,0.016],skin,true);
  ball(f,[h[0]-0.004,h[1]+0.018,h[2]-0.014],[0.009,0.012,0.009],skin,true);
  seg(f,[h[0]-0.004,h[1]-0.05,h[2]+0.002],tip,0.007,0.008,wood);
  seg(f,[tip[0]-0.002,tip[1]-0.012,tip[2]],[tip[0]+0.002,tip[1]+0.012,tip[2]],0.011,0.0135,rag);ball(f,[tip[0]+0.002,tip[1]+0.014,tip[2]],[0.013,0.01,0.013],rag,true);
  seg(f,[tip[0]-0.002,tip[1]-0.016,tip[2]],[tip[0]-0.002,tip[1]-0.011,tip[2]],0.0125,0.0125,iron);
  return fpt(f,[tip[0]+0.003,tip[1]+0.045,tip[2]]);
}
/* ---------- static decor: pillars, brazier, rubble, sconces and room dressing ---------- */
const M6={};function mesh6(k){if(M6[k])return M6[k];const c=MESH_DATA[k],o=new Float32Array(c.length/9*6);for(let i=0,j=0;i<c.length;i+=9)for(let q=0;q<6;q++)o[j++]=c[i+q];return M6[k]=o}
function buildProp(pr,F){
  const f={p:[pr.x,0,pr.z],R:rYaw(pr.r),lo:[pr.x*0.37,0,pr.z*0.37]},S=pr.s,st=F.stone;
  const wood=[0.42,0.26,0.13,6],woodD=[0.27,0.17,0.09,6],iron=[0.2,0.2,0.22,4],bone=[0.82,0.78,0.66,9];
  switch(pr.t){
  case 'barrel':{
    seg(f,[0,0,0],[0,0.09*S,0],0.1*S,0.126*S,wood);seg(f,[0,0.09*S,0],[0,0.2*S,0],0.126*S,0.126*S,wood);seg(f,[0,0.2*S,0],[0,0.29*S,0],0.126*S,0.1*S,wood);
    for(const y of[0.05,0.145,0.24])seg(f,[0,(y-0.008)*S,0],[0,(y+0.008)*S,0],0.129*S*(y===0.145?1:0.9),0.129*S*(y===0.145?1:0.9),iron);
    seg(f,[0,0.29*S,0],[0,0.292*S,0],0.09*S,0.088*S,woodD);
    if(pr.v)ball(f,[0.02,0.31*S,0.02],[0.05,0.03,0.05],[0.3,0.3,0.25,2]);
    break}
  case 'crate':{
    const h=0.22*S;slab(f,[0,h/2,0],[h,h,h],wood);
    for(const a of[-1,1])for(const b2 of[-1,1])slab(f,[a*h*0.5,h/2,b2*h*0.5],[0.03,h+0.012,0.03],woodD);
    slab(f,[0,h+0.004,0],[h+0.02,0.012,0.035],woodD);slab(f,[0,h+0.004,0],[0.035,0.012,h+0.02],woodD);
    if(pr.v){const f2={p:fpt(f,[0.02,h+0.01,-0.01]),R:m3(f.R,rYaw(0.5)),lo:f.lo};const h2=0.14*S;slab(f2,[0,h2/2,0],[h2,h2,h2],woodD);slab(f2,[0,h2+0.003,0],[h2+0.012,0.008,0.03],wood)}
    break}
  case 'urn':{
    const cl=pr.v?[0.5,0.3,0.2,9]:[0.36,0.4,0.42,9],tr=pr.v?[0.8,0.7,0.5,9]:[0.75,0.55,0.2,9];
    seg(f,[0,0,0],[0,0.1*S,0],0.045*S,0.09*S,cl);seg(f,[0,0.1*S,0],[0,0.19*S,0],0.09*S,0.07*S,cl);seg(f,[0,0.19*S,0],[0,0.245*S,0],0.07*S,0.036*S,cl);
    seg(f,[0,0.245*S,0],[0,0.275*S,0],0.036*S,0.055*S,cl);seg(f,[0,0.115*S,0],[0,0.135*S,0],0.09*S,0.088*S,tr);
    break}
  case 'sack':{
    const cl=[0.5,0.42,0.28,2];ball(f,[0,0.085*S,0],[0.1*S,0.095*S,0.09*S],cl);seg(f,[0,0.16*S,0],[0.01,0.21*S,0],0.03*S,0.045*S,cl);seg(f,[0,0.165*S,0],[0,0.175*S,0],0.034*S,0.034*S,[0.25,0.16,0.08,3]);
    ball(f,[0.13*S,0.05*S,0.05],[0.07*S,0.055*S,0.065*S],cl);
    break}
  case 'bones':{
    ball(f,[0,0.05,0],[0.05,0.048,0.043],bone);ball(f,[0.03,0.028,0],[0.03,0.022,0.03],bone,true);
    for(const z of[-0.018,0.018])ball(f,[0.042,0.055,z],[0.012,0.014,0.012],[0.04,0.03,0.03,0],true);
    ball(f,[0.05,0.036,0],[0.006,0.01,0.007],[0.04,0.03,0.03,0],true);
    for(const b2 of[[0.1,-0.08,0.5],[-0.09,0.07,2.1],[0.02,0.13,1.2]]){const a=b2[2],x=b2[0],z=b2[1],dx=Math.cos(a)*0.075,dz=Math.sin(a)*0.075;
      seg(f,[x-dx,0.012,z-dz],[x+dx,0.012,z+dz],0.009,0.009,bone);ball(f,[x-dx,0.014,z-dz],0.015,bone,true);ball(f,[x+dx,0.014,z+dz],0.015,bone,true)}
    for(let i=0;i<4;i++)seg(f,[-0.06+i*0.012,0.0,-0.06-i*0.02],[-0.02+i*0.012,0.07-i*0.008,-0.06-i*0.02],0.006,0.004,bone);
    break}
  case 'shroom':{
    for(let i=0;i<5;i++){const a=i*2.3+pr.r,r=i?0.05+((i*37)%5)*0.018:0,h=(0.07+((i*53)%7)*0.015)*S,x=Math.cos(a)*r,z=Math.sin(a)*r;
      seg(f,[x,0,z],[x+0.006,h,z],0.012,0.009,[0.8,0.8,0.7,1]);ball(f,[x+0.006,h,z],[0.035*S,0.018*S,0.035*S],pr.v?(F.forest?[0.1,0.55,0.48,7]:[0.25,1.5,1.2,7]):[0.75,0.2,0.12,1]);}
    break}
  case 'log':{
    const cl=[0.2,0.13,0.08,6],mo=[0.08,0.2,0.06,9];
    seg(f,[-0.2*S,0.075,0],[0.2*S,0.08,0.01],0.08*S,0.07*S,cl);ball(f,[-0.2*S,0.075,0],[0.012,0.075*S,0.075*S],[0.4,0.32,0.22,6],true);
    ball(f,[0.03,0.14*S,0],[0.1*S,0.025,0.05],mo,true);if(pr.v)seg(f,[0.05,0.1,0],[0.12,0.2,0.07],0.02,0.008,cl);
    break}
  case 'stump':{
    const cl=[0.22,0.14,0.08,6];
    seg(f,[0,0,0],[0,0.24*S,0],0.13*S,0.1*S,cl);ball(f,[0,0.245*S,0],[0.1*S,0.01,0.1*S],[0.42,0.34,0.24,6],true);
    for(let i=0;i<3;i++){const a=i*2.1+pr.r;seg(f,[Math.cos(a)*0.08,0.01,Math.sin(a)*0.08],[Math.cos(a)*0.2,0.01,Math.sin(a)*0.2],0.03,0.006,cl)}
    if(pr.v)ball(f,[0.09,0.2*S,0.03],[0.05,0.02,0.04],[0.08,0.2,0.06,9],true);
    break}
  case 'fern':{
    for(let i=0;i<7;i++){const a=i*0.9+pr.r,l=0.2+((i*37)%5)*0.025;seg(f,[0,0.02,0],[Math.cos(a)*l,0.1+l*0.3,Math.sin(a)*l],0.012,0.004,[0.06,0.2,0.07,2])}
    break}
  case 'ice':{
    for(let i=0;i<5;i++){const a=i*1.9+pr.r,r=i?0.06+((i*29)%4)*0.015:0,h=(i?0.12+((i*41)%6)*0.03:0.3)*S,x=Math.cos(a)*r,z=Math.sin(a)*r;
      seg(f,[x,0,z],[x+Math.cos(a)*h*0.3*(i?1:0),h,z+Math.sin(a)*h*0.3*(i?1:0)],0.04*S,0.002,[0.55,0.82,1.0,8]);}
    break}
  case 'ember':{
    ball(f,[0,0.05,0],[0.11*S,0.07*S,0.09*S],[0.12,0.1,0.1,9]);ball(f,[0.09,0.035,0.06],[0.06,0.045,0.05],[0.12,0.1,0.1,9]);
    for(let i=0;i<5;i++){const a=i*1.4;ball(f,[Math.cos(a)*0.07,0.07+((i*3)%2)*0.02,Math.sin(a)*0.06],[0.022,0.012,0.018],[2.4,0.7,0.15,7],true)}
    break}
  case 'banner':{
    const col=pr.v?[0.5,0.1,0.08,2]:[0.1,0.2,0.42,2],tr=[0.82,0.66,0.25,2];
    seg(f,[0.03,1.0,-0.24],[0.03,1.0,0.24],0.012,0.012,wood);ball(f,[0.03,1.0,-0.24],0.02,iron,true);ball(f,[0.03,1.0,0.24],0.02,iron,true);
    slab(f,[0.025,0.74,0],[0.012,0.5,0.36],col);slab(f,[0.027,0.98,0],[0.014,0.03,0.36],tr);
    slab(f,[0.033,0.76,0],[0.006,0.13,0.13],tr,rX(Math.PI/4));slab(f,[0.036,0.76,0],[0.006,0.07,0.07],col,rX(Math.PI/4));
    for(const z of[-0.12,0,0.12])seg(f,[0.025,0.49,z],[0.025,0.4+Math.abs(z)*0.3,z],0.06,0.004,col);
    break}
  case 'chain':{
    const n=5+pr.v*3;
    for(let i=0;i<n;i++){const y=WALL_H-i*0.055;if(i%2)slab(f,[0,y-0.03,0],[0.008,0.06,0.03],iron);else slab(f,[0,y-0.03,0],[0.03,0.06,0.008],iron)}
    const yb=WALL_H-n*0.055;seg(f,[0,yb,0],[0,yb-0.03,0],0.03,0.022,iron);seg(f,[0,yb-0.03,0],[0.03,yb-0.07,0],0.008,0.003,iron);
    break}
  case 'boxes':{
    const cb=[0.6,0.45,0.28,2],tp=[0.74,0.66,0.48,2];
    slab(f,[0,0.1*S,0],[0.24*S,0.2*S,0.2*S],cb);slab(f,[0,0.2*S+0.001,0],[0.245*S,0.004,0.04],tp);
    const f2={p:fpt(f,[0.015,0.2*S,0.01]),R:m3(f.R,rYaw(0.4)),lo:f.lo};
    slab(f2,[0,0.07*S,0],[0.17*S,0.14*S,0.15*S],cb);slab(f2,[0,0.14*S+0.001,0],[0.175*S,0.004,0.035],tp);
    if(pr.v){const f3={p:fpt(f,[0.19*S,0,0.08]),R:m3(f.R,rYaw(-0.6)),lo:f.lo};slab(f3,[0,0.06,0],[0.13,0.12,0.12],cb);slab(f3,[0,0.121,0],[0.135,0.004,0.03],tp)}
    break}
  case 'cabinet':{
    const mt=[0.46,0.48,0.45,4],fr=[0.54,0.56,0.53,4],dk=[0.16,0.16,0.16,4];
    slab(f,[0,0.3*S,0],[0.2*S,0.6*S,0.24*S],mt);
    for(let i=0;i<3;i++){const y=(0.105+i*0.195)*S,out=(pr.v&&i===1)?0.05:0;
      slab(f,[0.1*S+0.003+out,y,0],[0.006+out*2,0.17*S,0.21*S],fr);slab(f,[0.1*S+0.012+out*2,y+0.04*S,0],[0.008,0.012,0.07*S],dk)}
    break}
  case 'plant':{
    const pot=[0.5,0.27,0.17,9],lf=pr.v?[0.36,0.3,0.12,2]:[0.14,0.3,0.12,2];
    seg(f,[0,0,0],[0,0.13*S,0],0.05*S,0.075*S,pot);seg(f,[0,0.12*S,0],[0,0.13*S,0],0.066*S,0.066*S,[0.12,0.09,0.06,9]);
    seg(f,[0,0.12*S,0],[0,0.3*S,0],0.009,0.006,[0.3,0.2,0.1,6]);
    for(let i=0;i<7;i++){const a=i*0.9+pr.r,h=(0.24+((i*37)%5)*0.04)*S,r=(pr.v?0.14:0.1)*S;seg(f,[0,(0.14+i*0.02)*S,0],[Math.cos(a)*r,pr.v?h*0.7:h+0.1*S,Math.sin(a)*r],0.022*S,0.003,lf)}
    break}
  case 'chair':{
    const fb=[0.17,0.19,0.26,2],mt=[0.1,0.1,0.11,4];
    for(let i=0;i<5;i++){const a=i*1.2566;seg(f,[0,0.035,0],[Math.cos(a)*0.11*S,0.014,Math.sin(a)*0.11*S],0.012,0.01,mt)}
    seg(f,[0,0.03,0],[0,0.2*S,0],0.013,0.013,mt);
    slab(f,[0,0.215*S,0],[0.19*S,0.035*S,0.19*S],fb);
    seg(f,[-0.09*S,0.22*S,0],[-0.1*S,0.3*S,0],0.012,0.012,mt);
    slab(f,[-0.1*S,0.39*S,0],[0.028*S,0.2*S,0.18*S],fb);
    break}
  case 'stal':{
    const sc=[st[0]*0.9,st[1]*0.9,st[2]*0.9,9];
    for(let i=0;i<3;i++){const a=i*2.1+pr.r,r=i?0.12:0,h=(i?0.18+i*0.07:0.42)*S;seg(f,[Math.cos(a)*r,WALL_H,Math.sin(a)*r],[Math.cos(a)*r,WALL_H-h,Math.sin(a)*r],0.07*S*(i?0.7:1),0.004,sc)}
    break}
  }
}
/* ---------- strange door looks ----------
   A door has a KIND (what happens when it opens: DOOR_KINDS) and a LOOK (how its leaf is drawn: DOOR_LOOKS).
   Behaviour (rooms, room names, network messages) always follows D.kind; drawing and the keyhole glow follow D.look.
   See docs/strange-doors.md for adding a room kind and its door look.
   A floor holds only ONE COPY of each door type, so its doors are all different kinds. Types rotate through DOOR_KINDS in registry order,
   floor after floor (doorPlan): a floor gets min(types, doorCountFor(depth)) consecutive types, each floor carrying on where the last stopped. Nothing else to edit.
   Any kind marked {disguise:true} (the trap) automatically passes as every look owned by a non-disguise kind,
   including ones added later: genFloor picks one with the door's seeded rng, so every player agrees on it.
   'wood' is the plain fallback for an unknown look. Stone jambs, lintel and the "used" state are shared code below. */
const DOOR_LOOKS={
  wood:{
    leaf(f,D,c){
      slab(f,[0.02,0.515,0],[0.03,1.03,0.5],[0.3,0.17,0.08,6]);
      for(const z of[-0.125,0.125])slab(f,[0.036,0.515,z],[0.004,1.0,0.012],[0.1,0.06,0.03,6]);
      for(const y of[0.2,0.82])slab(f,[0.037,y,0],[0.008,0.05,0.5],c.band);
      doorKnob(f,[0.5,0.42,0.2,4]);
    },
    glow:null
  },
  galaxy:{
    leaf(f,D,c){
      slab(f,[0.02,0.515,0],[0.03,1.03,0.5],[0.012,0.012,0.022,0]);
      const r=doorRng(D,'galaxy');
      for(let i=0;i<34;i++){
        const z=(r()-0.5)*0.44,y=0.05+r()*0.93,big=r()<0.14,s=big?0.011+r()*0.008:0.004+r()*0.006,t=r();
        const col=t<0.18?[0.7,0.82,1.0,7]:t<0.3?[1.0,0.9,0.7,7]:[1.0,1.0,1.0,7];
        ball(f,[0.036,y,z],[0.003,s,s],col,true);
      }
      doorKnob(f,[0.16,0.16,0.19,4]);
    },
    glow(D,t){const a=0.45+0.25*Math.sin(t*3.1+D.ph)*Math.sin(t*7.7+D.ph);return[0.55,0.6,1.0,a]}
  },
  kiln:{
    leaf(f,D,c){
      slab(f,[0.02,0.515,0],[0.03,1.03,0.5],[0.03,0.025,0.03,0]);
      const r=doorRng(D,'kiln'),COLS=5,ROWS=10,cell=0.1,
        pal=[[0.7,0.38,0.03],[0.03,0.5,0.45],[0.65,0.06,0.36],[0.06,0.16,0.7],[0.38,0.64,0.05],[0.7,0.14,0.08]],
        // glass-kiln shapes as cell offsets [col,row]: bar, block, tee, two bends, two hooks
        SH=[[[0,0],[1,0],[2,0],[3,0]],[[0,0],[1,0],[0,1],[1,1]],[[0,0],[1,0],[2,0],[1,1]],[[0,0],[1,0],[1,1],[2,1]],[[1,0],[2,0],[0,1],[1,1]],[[0,0],[0,1],[0,2],[1,2]],[[1,0],[1,1],[1,2],[0,2]]],
        grid=new Array(COLS*ROWS).fill(-2);
      for(let k=0;k<COLS*ROWS;k++){
        if(grid[k]!==-2)continue;
        const cx=k%COLS,cy=(k/COLS)|0;let placed=false;
        for(let tries=0;tries<6&&!placed;tries++){
          const sh=SH[(r()*SH.length)|0],rot=(r()*4)|0;
          let cells=sh.map(p=>{let x=p[0],y=p[1];for(let q=0;q<rot;q++){const t=x;x=-y;y=t}return[x,y]});
          const mx=Math.min(...cells.map(p=>p[0])),my=Math.min(...cells.map(p=>p[1]));
          cells=cells.map(p=>[p[0]-mx,p[1]-my]);
          // anchor the first cell in scan order (lowest row, then lowest column) on this empty cell
          cells.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);const a0=cells[0];
          const ok=cells.every(p=>{const x=cx+p[0]-a0[0],y=cy+p[1]-a0[1];return x>=0&&x<COLS&&y>=0&&y<ROWS&&grid[y*COLS+x]===-2});
          if(ok){const col=(r()*pal.length)|0;for(const p of cells)grid[(cy+p[1]-a0[1])*COLS+cx+p[0]-a0[0]]=col;placed=true}
        }
        if(!placed)grid[k]=(r()*pal.length)|0;
      }
      for(let k=0;k<COLS*ROWS;k++){
        const cx=k%COLS,cy=(k/COLS)|0,z=(cx-(COLS-1)/2)*cell,y=0.065+cy*cell,d=0.012+r()*0.014,hole=r()<0.07;
        const j=0.9+r()*0.2,p=hole?[0.05,0.04,0.05]:pal[grid[k]];
        slab(f,[0.035+d/2,y,z],[d,cell*0.9,cell*0.9],[Math.min(1,p[0]*j),Math.min(1,p[1]*j),Math.min(1,p[2]*j),hole?0:0]);
      }
      doorKnob(f,[0.55,0.46,0.22,4]);
    },
    glow(D,t){return[1.0,0.5,0.15,0.4+0.2*Math.sin(t*13+D.ph)]}
  },
  mirror:{
    leaf(f,D,c){
      const fr=[0.07,0.045,0.03,6];
      slab(f,[0.02,0.515,0],[0.03,1.03,0.5],fr);
      slab(f,[0.04,0.52,0],[0.012,0.9,0.4],[0.04,0.03,0.02,6]);
      slab(f,[0.0465,0.52,0],[0.006,0.86,0.37],[0.36,0.41,0.48,11]);
      for(const y of[0.07,0.97])for(const z of[-0.22,0.22])ball(f,[0.042,y,z],0.02,[0.55,0.42,0.18,4],true);
      for(const y of[0.025,1.005])ball(f,[0.042,y,0],[0.012,0.02,0.07],[0.5,0.38,0.16,4],true);
      slab(f,[0.0505,0.56,0.02],[0.003,0.62,0.035],[0.62,0.67,0.74,11],rX(0.35));
      const r=doorRng(D,'mirror');
      for(let i=0;i<14;i++){const z=(r()-0.5)*0.34,y=0.1+r()*0.84,s=0.006+r()*0.016,e=r()<0.5?z*0.5:z;ball(f,[0.0505,y,e],[0.002,s,s*(0.6+r()*0.8)],[0.2,0.18,0.15,3],true)}
      doorKnob(f,[0.6,0.62,0.68,4]);
    },
    glow(D,t){return[0.85,0.92,1.0,0.32+0.2*Math.sin(t*1.3+D.ph)*Math.sin(t*0.6+D.ph*2)]}
  },
  theater:{
    // red velvet, padded in buttons, a marquee of bulbs over a ticket-stub keyhole
    leaf(f,D,c){
      slab(f,[0.02,0.515,0],[0.03,1.03,0.5],[0.34,0.04,0.07,0]);
      for(let row=0;row<4;row++)for(let col=0;col<3;col++){const y=0.1+row*0.2,z=(col-1)*0.15,odd=(row&1)?0.075:0;
        ball(f,[0.04,y+0.02,z+odd*(col===2?-1:1)],[0.014,0.075,0.07],[0.5,0.06,0.1,0],true)}
      slab(f,[0.04,0.93,0],[0.012,0.1,0.46],[0.06,0.045,0.04,4]);
      for(let i=0;i<7;i++)ball(f,[0.049,0.93,-0.2+i*0.0667],[0.005,0.014,0.014],[1,0.82,0.4,7],true);
      slab(f,[0.043,0.4,0.17],[0.006,0.07,0.04],[0.9,0.75,0.4,4]);
      doorKnob(f,[0.8,0.65,0.25,4]);
    },
    glow(D,t){return[1.0,0.32,0.4,0.42+0.22*Math.sin(t*4+D.ph)]}
  },
  moose:{
    leaf(f,D){
      slab(f,[.022,.515,0],[.04,1.03,.5],[.105,.18,.18,6]);
      slab(f,[.049,.66,0],[.023,.35,.37],[.24,.36,.33,4]);
      for(const side of [-1,1]){
        slab(f,[.065,.72,side*.092],[.013,.035,.15],[.86,.63,.28,4],rX(side*.53));
        for(const j of [0,1,2])slab(f,[.066,.79+j*.025,side*(.078+j*.028)],[.012,.13,.019],[.86,.63,.28,4],rX(side*.20));
      }
      ball(f,[.066,.64,0],[.011,.09,.062],[.85,.62,.25,4],true);
      doorKnob(f,[.57,.78,.61,4]);
    },
    glow(D,t){return[.45,.84,.66,.45+.15*Math.sin(t*3+D.ph)]}
  },
  monoliths:{
    leaf(f,D){
      slab(f,[0.02,0.515,0],[0.04,1.03,0.5],[0.115,0.09,0.16,0]);
      slab(f,[0.045,0.60,0],[0.04,0.49,0.29],[0.32,0.29,0.38,0]);
      for(const side of [-1,1]){
        slab(f,[0.071,0.73,side*0.08],[0.023,0.035,0.1],[0.52,0.47,0.58,0]);
        slab(f,[0.079,0.68,side*0.08],[0.009,0.021,0.056],[0.16,0.08,0.23,0]);
      }
      slab(f,[0.084,0.615,0],[0.05,0.16,0.065],[0.48,0.42,0.52,0]);
      slab(f,[0.071,0.49,0],[0.014,0.017,0.13],[0.13,0.10,0.19,0]);
      doorKnob(f,[0.7,0.48,0.94,4]);
    },
    glow(D,t){return[0.72,0.46,1,0.43+0.14*Math.sin(t*2+D.ph)]}
  },
  stillwood:{
    leaf(f,D){
      slab(f,[0.02,0.515,0],[0.04,1.03,0.5],[0.16,0.28,0.16,6]);
      slab(f,[0.045,0.55,0],[0.02,0.78,0.36],[0.28,0.18,0.1,6]);
      slab(f,[0.058,0.62,0],[0.012,0.42,0.22],[0.45,0.78,0.62,11]);
      for(let i=0;i<5;i++){
        const z=-0.16+i*0.08;
        seg(f,[0.05,0.95,z],[0.07,0.2+((i*3)%4)*0.08,z+(i-2)*0.01],0.012,0.004,[0.2,0.36,0.18,6]);
      }
      doorKnob(f,[0.55,0.72,0.48,4]);
    },
    glow(D,t){return[0.45,0.9,0.62,0.38+0.16*Math.sin(t*1.7+D.ph)]}
  },
  hamlet:{
    leaf(f,D){
      slab(f,[0.02,0.52,0],[0.04,1.04,0.52],[0.72,0.28,0.22,6]);
      slab(f,[0.045,0.55,0],[0.02,0.78,0.36],[0.95,0.86,0.62,6]);
      slab(f,[0.06,0.95,0],[0.012,0.22,0.22],[0.35,0.7,0.95,11]);
      slab(f,[0.06,0.62,-0.16],[0.012,0.18,0.16],[0.98,0.78,0.3,11]);
      slab(f,[0.06,0.62,0.16],[0.012,0.18,0.16],[0.45,0.78,0.42,11]);
      doorKnob(f,[0.95,0.78,0.28,4]);
    },
    glow(D,t){return[1,0.72,0.35,0.42+0.12*Math.sin(t*2+D.ph)]}
  },
};
const DOOR_EXPLORE_PER_MIN=150;
const doorOrder=()=>Object.keys(DOOR_KINDS);
// doors on a floor: k doors spread over a floor mean a runner must uncover ~1/(k+1) of it to meet one, and a minute of running uncovers ~DOOR_EXPLORE_PER_MIN new tiles
const doorCountFor=depth=>{const cw=Math.min(8+depth,20);return Math.max(2,Math.ceil(2*cw*cw/DOOR_EXPLORE_PER_MIN)-1)};
// which kind each door slot on a floor gets: one copy of each type, so min(types, doorCountFor(depth)) DISTINCT kinds, taken consecutively from the registry
// and carrying on where the previous floor stopped (start point = per-seed offset + doors of earlier floors). Deterministic from (seed, depth, registry).
const doorPlan=(seedStr,depth,order=doorOrder())=>{
  const N=order.length;if(!N)return{kinds:[],count:0};
  let cur=hashStr(seedStr+'#doorrot')%N;for(let d=1;d<depth;d++)cur+=Math.min(N,doorCountFor(d));
  const n=Math.min(N,doorCountFor(depth)),kinds=[];for(let i=0;i<n;i++)kinds.push(order[(cur+i)%N]);
  return{kinds,count:n}};
const doorLookOf=D=>DOOR_LOOKS[D.look]?D.look:DOOR_LOOKS[(DOOR_KINDS[D.kind]||{}).look]?DOOR_KINDS[D.kind].look:'wood';
// the looks a trap door may wear: every look owned by a non-disguise kind
const doorDisguises=()=>{const o=[];for(const k in DOOR_KINDS){const l=DOOR_KINDS[k].look;if(!DOOR_KINDS[k].disguise&&l&&DOOR_LOOKS[l]&&!o.includes(l))o.push(l)}return o};
// same for every player and every rebuild: seeded from the door itself
const doorRng=(D,s)=>mulberry32(hashStr(s+'#'+D.tx+','+D.ty+','+Math.round(D.ph*1e4)));
function doorKnob(f,col){
  seg(f,[0.04,0.5,0.17],[0.075,0.5,0.17],0.012,0.012,[0.13,0.12,0.12,4]);ball(f,[0.08,0.5,0.17],0.026,col,true);slab(f,[0.038,0.4,0.17],[0.004,0.05,0.022],[0.01,0.01,0.01,4]);
}
function buildStrangeDoor(f,D,st,dk){
  const band=[0.13,0.12,0.12,4];
  for(const z of[-0.3,0.3])slab(f,[0.035,0.52,z],[0.09,1.04,0.1],st);
  slab(f,[0.035,1.08,0],[0.09,0.1,0.7],st);slab(f,[0.045,1.15,0],[0.07,0.06,0.2],dk);
  if(!D.used)DOOR_LOOKS[doorLookOf(D)].leaf(f,D,{st,dk,band});
  else{
    slab(f,[0.02,0.515,0],[0.03,1.03,0.5],[0.06,0.05,0.045,6]);
    for(const z of[-0.125,0.125])slab(f,[0.036,0.515,z],[0.004,1.0,0.012],[0.1,0.06,0.03,6]);
    for(const y of[0.2,0.82])slab(f,[0.037,y,0],[0.008,0.05,0.5],band);
    slab(f,[0.04,0.55,0],[0.006,0.9,0.05],dk,rX(0.6));slab(f,[0.04,0.55,0],[0.006,0.9,0.05],dk,rX(-0.6));
  }
}
function buildStatic(F){
  TB=DEC;DEC.n=0;
  const st=[...F.stone,9],dk=[st[0]*0.8,st[1]*0.8,st[2]*0.8,9],iron=[0.1,0.09,0.085,4];
  const I=(x,z,yaw)=>({p:[x,0,z],R:rYaw(yaw||0),lo:[x*0.61,0,z*0.61]});
  if(!F.forest)for(const q of F.pillars)emit(mesh6('pillar'),I(q[0],q[1]),ZERO3,[1,1,1],st);
  if(F.safe){const f=I(F.safe.x,F.safe.z);emit(mesh6('pillar'),f,ZERO3,[1.15,0.3,1.15],st);emit(mesh6('bowl'),f,[0,0.375,0],[1,1,1],iron)}
  for(const r of F.rubble.concat(F.litter||[]))emit(mesh6('octa'),I(r.x,r.z,r.r),[0,r.s*r.sy*0.6,0],[r.s*1.4,r.s*r.sy,r.s],dk);
  for(const q of F.sconces){const f=I(q.x,q.z);
    if(F.forest){ // an old iron lantern hung from a leaning wooden post
      const wd=[0.2,0.13,0.08,6],gl=[1.0,0.62,0.25,7],ax=q.dx?0.2:0.045,az=q.dz?0.2:0.045,lx=-q.dx*0.17,lz=-q.dz*0.17;
      slab(f,[0,0.45,0],[0.055,0.9,0.055],wd);slab(f,[lx/2,0.87,lz/2],[Math.max(ax,0.045)*0.95,0.035,Math.max(az,0.045)*0.95],wd);
      slab(f,[lx,0.8,lz],[0.01,0.1,0.01],iron);slab(f,[lx,0.6,lz],[0.07,0.016,0.07],iron);slab(f,[lx,0.665,lz],[0.052,0.095,0.052],gl);
      slab(f,[lx,0.725,lz],[0.082,0.02,0.082],iron);slab(f,[lx,0.745,lz],[0.04,0.02,0.04],iron);
      for(const a of[-1,1])for(const b of[-1,1])slab(f,[lx+a*0.028,0.665,lz+b*0.028],[0.008,0.1,0.008],iron);
    }else{slab(f,[0,0.72,0],[0.05,0.2,0.05],iron);slab(f,[-q.dx*0.07,0.82,-q.dz*0.07],[0.12,0.04,0.12],iron)}}
  for(const pr of F.props)buildProp(pr,F);
  for(const D of F.sdoors){
    const f={p:[D.x,0,D.z],R:rYaw(D.r),lo:[D.x*0.37,0,D.z*0.37]};
    buildStrangeDoor(f,D,st,dk);
  }
  TB=CH;
  upload(decorMesh,DEC);
}
/* ---------- sprites ---------- */
const MAXS=900, SV=10;
const sprData=new Float32Array(MAXS*6*SV);
const sprIB=new THREE.InterleavedBuffer(sprData,SV);sprIB.setUsage(THREE.DynamicDrawUsage);
const sprGeo=new THREE.BufferGeometry();
sprGeo.setAttribute('position',new THREE.InterleavedBufferAttribute(sprIB,3,0));
sprGeo.setAttribute('uv',new THREE.InterleavedBufferAttribute(sprIB,2,3));
sprGeo.setAttribute('aCol',new THREE.InterleavedBufferAttribute(sprIB,4,5));
sprGeo.setAttribute('aAdd',new THREE.InterleavedBufferAttribute(sprIB,1,9));
sprGeo.setDrawRange(0,0);
const sprMat=new THREE.ShaderMaterial({
  uniforms:{uTex:{value:spriteTex},uHdr:{value:POST?2.4:1}},
  vertexShader:`attribute vec4 aCol;attribute float aAdd;varying vec2 vUV;varying vec4 vCol;varying float vAdd;varying float vFog;
void main(){vUV=uv;vCol=aCol;vAdd=aAdd;vFog=1.0-smoothstep(5.0,17.0,distance(position,cameraPosition));
  gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D uTex;uniform float uHdr;varying vec2 vUV;varying vec4 vCol;varying float vAdd;varying float vFog;
void main(){vec4 c=texture2D(uTex,vUV);float k=vCol.a*vFog;
  gl_FragColor=vec4(c.rgb*vCol.rgb*(k*mix(1.0,uHdr,vAdd)),c.a*k*(1.0-vAdd));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  transparent:true,depthWrite:false,side:THREE.DoubleSide,
  blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
const sprMesh=new THREE.Mesh(sprGeo,sprMat);sprMesh.frustumCulled=false;sprMesh.renderOrder=10;scene.add(sprMesh);
const sprList=[];
function spr(x,y,z,w,h,cell,r,g,b,a,add){sprList.push({x,y,z,w,h,cell,r,g,b,a,add,d:0})}
// drifting dust motes that catch the torchlight
const DUST=[];{const dr=mulberry32(99);for(let i=0;i<(Q>=2?90:Q>=1?45:0);i++)DUST.push([dr()*8,dr()*1.15+0.05,dr()*8,dr()*6.28,0.006+dr()*0.008])}

/* ---------- game state ---------- */
let state='title';           // title | play | pause | trans | dead
let F=null;                  // current floor
const P={pick:0,spikeTraps:0,moose:false,mounted:false,y:0,vy:0,vx:0,vz:0,airSpeed:2.7,jumpQ:0,keys:0,x:0,z:0,yaw:0,pitch:0,hp:3,fuel:100,stam:100,winded:false,flash:1,ward:0,shards:0,inv:0,bob:0,tx:-1,ty:-1,stepPh:0};
const R={seed:'',depth:1,score:0,time:0,gems:0,wind:false,pk:{},guide:0};
const mooseLures=new Map(),mooseVisuals=[],mooseHeartMaps=[];
const MOOSE_LURE_SPEED=5.2;
let mooseEffects;
function openMooseHall(x,z){
  const i=z*F.W+x;
  return x>=0&&z>=0&&x<F.W&&z<F.H&&F.g[i]===0&&!F.safeMask[i]&&!F.pocketMask[i];
}
function mooseRoute(x,z,yaw){
  const sx=Math.floor(x),sz=Math.floor(z),start=sz*F.W+sx;
  if(sx<0||sz<0||sx>=F.W||sz>=F.H||F.g[start]!==0)return [];
  const facing=[Math.cos(yaw),Math.sin(yaw)];
  const dirs=[...DIRS].sort((a,b)=>(b[0]-a[0])*facing[0]+(b[1]-a[1])*facing[1]);
  const first=dirs.find(([dx,dz])=>openMooseHall(sx+dx,sz+dz));
  if(!first)return [];
  const next=(sz+first[1])*F.W+sx+first[0];
  const prev=new Int32Array(F.g.length).fill(-1),depth=new Uint8Array(F.g.length),queue=[next];
  prev[start]=start;prev[next]=start;depth[next]=1;
  let last=next;
  for(let i=0;i<queue.length;i++){
    const at=queue[i],tx=at%F.W,tz=(at/F.W)|0;
    if(depth[at]>depth[last])last=at;
    if(depth[at]===10)break;
    for(const [dx,dz] of dirs){
      const nx=tx+dx,nz=tz+dz,j=nz*F.W+nx;
      if(!openMooseHall(nx,nz)||prev[j]>=0)continue;
      prev[j]=at;depth[j]=depth[at]+1;queue.push(j);
    }
  }
  const path=[];
  for(let at=last;at!==start;at=prev[at])path.push([at%F.W+.5,((at/F.W)|0)+.5]);
  if(path.length)path.push([sx+.5,sz+.5]);
  return path.reverse();
}
function startMooseLure(id,x,z,yaw,path=mooseRoute(x,z,yaw)){
  if(path.length<2||mooseLures.has(id))return false;
  const tx=Math.floor(x),tz=Math.floor(z),dist=bfs(F.g,F.W,F.H,tx,tz);
  const lure={x,z,yaw,path,step:0,tx,tz,dist,active:true,hp:3,inv:0,deathT:.25,visits:new Map(),previousTile:-1};
  mooseLures.set(id,lure);
  const targets=mpTargets();
  for(const s of F.shades){
    const chasing=s.type===3?F.blk===2&&id==='':s.state===1;
    const d=dist[Math.floor(s.z)*F.W+Math.floor(s.x)];
    const prey=mpNearest(targets,s.x,s.z);
    if(chasing&&d>=0&&d<=14&&prey&&!prey.inSafe&&(prey.loc?'':prey.p.id)===id)s.mooseLure=lure;
  }
  if(MIM.st===1&&MIM.vic===(id||MP.id))MIM.mooseLure=lure;
  sfx('moose');
  return true;
}
function finishMooseSacrifice(){
  P.moose=P.mounted=false;
  say('The zombie moose bellows and charges down the hall.',3);
}
function useMoose(sacrifice=false){
  if(state!=='play'||loading||P.down||P.grab||!P.moose||(P.moosePending&&performance.now()<P.moosePending.until))return false;
  if(!sacrifice){P.mounted=!P.mounted;say(P.mounted?'You mount the zombie moose.':'You dismount.',1.8);return true}
  const path=mooseRoute(P.x,P.z,P.yaw);
  if(path.length<2||P.inSafe){say('Face an open hall to send the moose away.',2.5);return false}
  if(MP.guest){
    const q=++mooseRequest;
    P.moosePending={q,depth:R.depth,until:performance.now()+3500};
    mpSend({k:'mooseLure',q,d:R.depth,x:P.x,z:P.z,yaw:P.yaw},MP.hostId);
  }else if(startMooseLure('',P.x,P.z,P.yaw,path))finishMooseSacrifice();
  else return false;
  return true;
}
let mooseRequest=0;
function clearMooseLures(){
  for(const lure of mooseLures.values())lure.active=false;
  mooseLures.clear();
  mooseEffects?.clear();
}
function nextMooseHall(lure){
  const {tx,tz,visits,previousTile}=lure;
  const options=DIRS.filter(([dx,dz])=>openMooseHall(tx+dx,tz+dz))
    .map(([dx,dz])=>({x:tx+dx,z:tz+dz,id:(tz+dz)*F.W+tx+dx}));
  options.sort((a,b)=>Number(a.id===previousTile)-Number(b.id===previousTile)
    ||(visits.get(a.id)||0)-(visits.get(b.id)||0));
  const next=options[0];
  return next?[next.x+.5,next.z+.5]:null;
}
function sprayMooseHit(x,z){
  mooseEffects??=animalHitEffects(scene,.43);
  mooseEffects.burst(x,.41,z);
}
function mooseLureTick(dt){
  mooseEffects?.update(dt);
  for(const [id,lure] of mooseLures){
    if(MP.guest){
      const k=Math.min(1,dt*14);
      lure.x+=(lure.nx-lure.x)*k;lure.z+=(lure.nz-lure.z)*k;
      continue;
    }
    if(!lure.active){
      if((lure.deathT-=dt)<=0)mooseLures.delete(id);
      continue;
    }
    lure.inv=Math.max(0,lure.inv-dt);
    // Carry the remaining movement through corners so a turn doesn't cost a frame of speed.
    let remaining=MOOSE_LURE_SPEED*dt;
    while(remaining>0){
      const p=lure.path[lure.step]??(lure.next??=nextMooseHall(lure));
      if(!p)break;
      const dx=p[0]-lure.x,dz=p[1]-lure.z,d=Math.hypot(dx,dz);
      if(d>.012)lure.yaw=Math.atan2(dz,dx);
      if(d<=remaining){lure.x=p[0];lure.z=p[1];lure.step++;lure.next=null;remaining-=d}
      else{lure.x+=dx/d*remaining;lure.z+=dz/d*remaining;remaining=0}
      const x=Math.floor(lure.x),z=Math.floor(lure.z);
      if(x!==lure.tx||z!==lure.tz){
        const tile=z*F.W+x;
        lure.previousTile=lure.tz*F.W+lure.tx;
        lure.visits.set(tile,(lure.visits.get(tile)||0)+1);
        lure.tx=x;lure.tz=z;lure.dist=bfs(F.g,F.W,F.H,x,z);
      }
    }
  }
}
function followMoose(creature,dt,speed){
  const lure=creature.mooseLure;
  if(!lure?.active){if(lure)creature.mooseLure=null;return false}
  const x=Math.floor(creature.x),z=Math.floor(creature.z),i=z*F.W+x,d=lure.dist[i];
  if(!(d>=0))return false;
  let gx=x+.5,gz=z+.5,best=d;
  if(d===0){gx=lure.x;gz=lure.z}
  else if(Math.hypot(creature.x-gx,creature.z-gz)<.08||creature.gx!==x||creature.gy!==z){
    for(const [dx,dz] of DIRS){
      const j=(z+dz)*F.W+x+dx,nd=lure.dist[j];
      if(nd>=0&&nd<best&&F.g[j]===0&&!F.safeMask[j]&&!F.pocketMask[j]){
        gx=x+dx+.5;gz=z+dz+.5;best=nd;
      }
    }
  }
  creature.gx=Math.floor(gx);creature.gy=Math.floor(gz);
  const dx=gx-creature.x,dz=gz-creature.z,length=Math.hypot(dx,dz);
  if(length>.001){
    const step=Math.min(1,speed*dt/length);
    creature.face=Math.atan2(dz,dx);creature.x+=dx*step;creature.z+=dz*step;
  }
  if(d<=1&&lure.inv===0&&Math.hypot(creature.x-lure.x,creature.z-lure.z)<.42&&los(creature.x,creature.z,lure.x,lure.z)){
    lure.hp--;lure.inv=.85;sprayMooseHit(lure.x,lure.z);
    if(lure.hp===0){
      lure.active=false;
      if(Math.hypot(P.x-lure.x,P.z-lure.z)<14)say('The zombie moose has fallen.',2.5);
    }
  }
  return true;
}
function mooseHeartMap(hp){
  if(!mooseHeartMaps[hp]){
    const art=document.createElement('canvas');art.width=144;art.height=48;
    const ctx=art.getContext('2d');
    ctx.font='bold 41px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=5;
    for(let i=0;i<3;i++){
      const x=26+i*46;ctx.strokeStyle='#261611';ctx.fillStyle=i<hp?'#ff5868':'#69565c';
      ctx.strokeText('♥',x,26);ctx.fillText('♥',x,26);
    }
    const map=new THREE.CanvasTexture(art);map.colorSpace=THREE.SRGBColorSpace;
    mooseHeartMaps[hp]=map;
  }
  return mooseHeartMaps[hp];
}
function drawMoose(t,title){
  let used=0;
  const place=(x,y,z,yaw,speed,scale=.36,hp=0)=>{
    let model=mooseVisuals[used];
    if(!model){model=mooseModel(true);scene.add(model);mooseVisuals.push(model)}
    model.scale.setScalar(scale);
    model.visible=true;model.userData.pose(t,speed);
    model.position.set(x,y,z);model.rotation.y=Math.PI/2-yaw;used++;
    let hearts=model.userData.hearts;
    if(hp&&!hearts){
      hearts=new THREE.Sprite(new THREE.SpriteMaterial({map:mooseHeartMap(hp),depthWrite:false,toneMapped:false}));
      hearts.position.y=2.57;hearts.scale.set(1.4,.47,1);model.add(hearts);model.userData.hearts=hearts;
    }
    if(hearts){hearts.visible=hp>0;if(hp)hearts.material.map=mooseHeartMap(hp)}
  };
  if(!title){
    if(P.mounted&&!P.down&&!P.away)place(P.x,P.y,P.z,P.yaw,Math.min(1,Math.hypot(P.vx,P.vz)/2),.41);
    for(const peer of MP.peers.values())if(peer.mounted&&mpDrawn(peer))place(peer.rx,peer.ry,peer.rz,peer.ryaw,Math.min(1,peer.spd/2),.41);
    for(const lure of mooseLures.values())if(lure.hp>0)place(lure.x,0,lure.z,lure.yaw,1,.36,lure.hp);
  }
  for(let i=used;i<mooseVisuals.length;i++)mooseVisuals[i].visible=false;
}
let scoutVisual;
function activateScout(){
  F.scout={x:P.x,z:P.z,yaw:P.yaw,scanT:0,planT:0,alertT:0,path:[],contacts:[],
    mapped:new Uint8Array(F.g.length)};
}
function scoutPath(s){
  const {W,H,g,dist,pocketMask}=F;
  const start=Math.floor(s.z)*W+Math.floor(s.x),queue=[start],prev=new Map([[start,-1]]);
  let best=-Infinity,target=start;
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);
  for(let n=0;n<queue.length;n++){
    const i=queue[n],x=i%W,z=Math.floor(i/W),d=dist[i];
    if(i!==start&&d>=1&&d<=8){
      const forward=(x+.5-P.x)*fx+(z+.5-P.z)*fz;
      const score=(F.seen[i]?0:9)+forward*.65-Math.abs(d-5)*.52;
      if(score>best){best=score;target=i}
    }
    for(const [dx,dz] of DIRS){
      const nx=x+dx,nz=z+dz,j=nz*W+nx;
      if(nx<0||nz<0||nx>=W||nz>=H||g[j]!==0||pocketMask[j]||prev.has(j)||dist[j]<0||dist[j]>10)continue;
      prev.set(j,i);queue.push(j);
    }
  }
  const path=[];
  for(let i=target;i!==start;i=prev.get(i))path.push([i%W+.5,Math.floor(i/W)+.5]);
  return path.reverse();
}
function scoutTick(dt){
  const s=F.scout;
  if(!s||P.down||P.away)return;
  const distance=F.dist[Math.floor(s.z)*F.W+Math.floor(s.x)];
  if(Math.hypot(s.x-P.x,s.z-P.z)>12||distance<0||distance>12){
    s.x=P.x;s.z=P.z;s.path=[];s.planT=0;
  }
  if(!s.path.length&&(s.planT-=dt)<=0){s.planT=.24;s.path=scoutPath(s)}
  const next=s.path[0];
  if(next){
    const [x,z]=next,dx=x-s.x,dz=z-s.z,d=Math.hypot(dx,dz),step=4.4*dt;
    if(solidAt(x,z))s.path=[];
    else if(d<=step){s.x=x;s.z=z;s.path.shift()}
    else{s.x+=dx/d*step;s.z+=dz/d*step;s.yaw=Math.atan2(dz,dx)}
  }
  s.alertT=Math.max(0,s.alertT-dt);
  if((s.scanT-=dt)>0)return;
  s.scanT=.19;
  const sx=Math.floor(s.x),sz=Math.floor(s.z);
  for(let z=Math.max(0,sz-4);z<=Math.min(F.H-1,sz+4);z++)for(let x=Math.max(0,sx-4);x<=Math.min(F.W-1,sx+4);x++){
    const i=z*F.W+x;
    if(F.g[i]===0&&!F.seen[i]&&!F.pocketMask[i]&&Math.hypot(x+.5-s.x,z+.5-s.z)<4.5&&los(s.x,s.z,x+.5,z+.5))
      s.mapped[i]=F.seen[i]=1;
  }
  const tracked=F.shades.filter(m=>m.x>=0&&Math.hypot(m.x-s.x,m.z-s.z)<5.5&&los(s.x,s.z,m.x,m.z));
  if(MP.on&&MIM.st===1&&Math.hypot(MIM.x-s.x,MIM.z-s.z)<5.5&&los(s.x,s.z,MIM.x,MIM.z))tracked.push(MIM);
  if(!s.alertT&&tracked.some(m=>!s.contacts.includes(m))){
    s.alertT=2.5;sfx('scout');
  }
  s.contacts=tracked;
}
function drawScout(t,title){
  const s=F?.scout;
  if(!s||title||P.down){if(scoutVisual)scoutVisual.visible=false;return}
  if(!scoutVisual){scoutVisual=scoutGooseModel();scoutVisual.scale.setScalar(.43);scene.add(scoutVisual)}
  scoutVisual.visible=true;
  scoutVisual.position.set(s.x,.76+Math.sin(t*6)*.045,s.z);
  scoutVisual.rotation.y=Math.PI/2-s.yaw;
  scoutVisual.userData.pose(t);
}
/* ---------- lasting upgrades, bought from the Keeper with gems ---------- */
const UPG=[
  {k:'heart',name:'Vitality',desc:'One more heart',cost:[15,30,50]},
  {k:'lamp',name:'Lamp oil',desc:'Your torch burns 15% slower',cost:[10,20,35]},
  {k:'lungs',name:'Deep lungs',desc:'Sprinting costs 20% less stamina',cost:[10,20,35]},
  {k:'band',name:'Bandolier',desc:'Start every run with one more flash bomb',cost:[12,24,40]},
  {k:'boots',name:'Swift boots',desc:'Move 6% faster',cost:[15,35]},
  {k:'powder',name:'Bright powder',desc:'Flash bombs reach farther and stun longer',cost:[14,28]},
  {k:'purse',name:'Lucky purse',desc:'Loose gems are sometimes worth double',cost:[12,26,44]},
  {k:'wind',name:'Second wind',desc:'Once each run, a killing blow leaves you on one heart',cost:[60]},
];
const up=Object.assign({heart:0,lamp:0,lungs:0,band:0,boots:0,powder:0,purse:0,wind:0},store.get('up',null)||{});
let wallet=Math.max(0,+store.get('wallet',0)||0);
const maxHp=()=>3+(up.heart|0);
const plLevel=()=>1+UPG.reduce((a,u)=>a+(up[u.k]|0),0);
const ROMAN=['','I','II','III','IV'];
let nearNpc=null,talk=null,padHold=0;
const NPC={
  keeper:{name:'The Keeper',col:[0.3,0.19,0.11],eye:[1.0,0.6,0.2],h:1},
  map:{name:'Ilse the Mapmaker',col:[0.16,0.34,0.4],eye:[0.7,1.0,0.95],h:0.94},
  delver:{name:'Brakk, a wounded delver',col:[0.4,0.36,0.3],eye:[1.0,0.95,0.8],h:0.72},
  pat:{name:'Pat Sajak',col:[0.11,0.13,0.27],eye:[0.4,0.55,0.8],h:0.6},
};
const KEEPER_LINES=['Sit. The fire keeps them out. Gems feed the fire, and the fire remembers you.','Still breathing? Good. Warm your hands and show me what you found.','Every hall below is hungrier than the last. Spend well.','The dark forgets its dead. I do not. What will you carry down?'];
const PAT_LINES=['Welcome to the Wheel of Misfortune! Ten gems a spin, and everybody down here lives with the result.','Big money, big money... well. Big something.','Step right up! I have hosted a lot of wheels, and this is by far the meanest.','No vowels to buy down here. Just ten gems and a dream.'];
const DELVER_TIPS=['The pale statues only walk when you look away. Keep your eyes on them and back off.','Blue wisps do not bite. They drink your flame, and that is worse.','A running jump clears a spike plate. Do not stand and think about it.','When your torch dies they smell you from much farther off.','The chime turns low and warm once the seal is broken. Follow it down.','Shades lose interest if you break their line of sight twice.'];
const clearPrompt=()=>{hudCache.prompt='';$('prompt').textContent=''};
function openTalk(n){
  if(state!=='play')return;
  if(TS&&Math.hypot(TS.x-P.x,TS.z-P.z)<3.5&&(!FX.pitchDone||n.type==='keeper')){say(FX.pitchDone?'The Keeper will not trade while that salesman is hovering.':'Salesman: "Ah ah ah, I am not finished!"',2.5);sfx('seal');return}
  state='talk';talk={npc:n,sel:0,line:null,opts:[]};
  if(document.pointerLockElement){talk.relock=true;document.exitPointerLock()}
  clearPrompt();$('talk').classList.remove('hidden');
  touch.mx=touch.my=0;touch.stickId=null;touch.lookId=null;touch.jump=false;$('stickBase').style.display=$('stickKnob').style.display='none';
  sfx('pick');buildTalk();
}
function closeTalk(){
  if(state!=='talk')return;
  const re=talk&&talk.relock;talk=null;state='play';padHold=performance.now()+350;P.jumpQ=0;
  $('talk').classList.add('hidden');
  if(re&&!touch.on)lock();
}
function buildTalk(){
  const n=talk.npc,T=NPC[n.type],o=[];
  let text='';
  if(n.type==='keeper'){
    text=talk.line||KEEPER_LINES[(R.depth+(n.ph*10|0))%KEEPER_LINES.length];
    const fc=4+2*(n.sold|0);
    o.push({head:'Supplies for this run',label:'Flash bomb',sub:'One more flash bomb',cost:fc+' gems',off:wallet<fc,fn:()=>{wallet-=fc;store.set('wallet',wallet);n.sold=(n.sold|0)+1;P.flash++;sfx('key');talk.line='Burn it bright. Then run.'}});
    o.push({label:'Flask of oil',sub:'Refill your torch',cost:'4 gems',off:wallet<4||P.fuel>=95,fn:()=>{wallet-=4;store.set('wallet',wallet);P.fuel=100;lowFuelSaid=false;sfx('oil');talk.line='Fill it to the lip. The dark is thirsty.'}});
    o.push({label:'Ward stone',sub:P.ward?'Already carried':'Soaks up the next blow, then crumbles',cost:'10 gems',off:wallet<10||!!P.ward,fn:()=>{wallet-=10;store.set('wallet',wallet);P.ward=1;sfx('key');talk.line='Keep it close. It only works once.'}});
    o.push({label:'Spike trap',sub:P.spikeTraps+' carried · damages the moose in Mosquito Outpost',cost:MOOSE_SPIKE_PRICE+' gems',off:wallet<MOOSE_SPIKE_PRICE,fn:()=>{
      wallet-=MOOSE_SPIKE_PRICE;store.set('wallet',wallet);P.spikeTraps++;sfx('key');talk.line='Set these ahead of the moose.';
    }});
    if(P.hp<maxHp())o.push({label:'Mend a wound',sub:'Restore one heart',cost:'6 gems',off:wallet<6,fn:()=>{wallet-=6;store.set('wallet',wallet);P.hp++;sfx('pick');talk.line='There. Try to keep the rest of your blood inside.'}});
    const u0=o.length;
    for(const u of UPG){
      const lv=up[u.k]|0,max=u.cost.length;
      if(lv>=max){o.push({label:u.name+' '+ROMAN[lv],sub:u.desc+' (complete)',cost:'',off:true});continue}
      const c=u.cost[lv];
      o.push({label:u.name+' '+ROMAN[lv+1],sub:u.desc,cost:c+' gems',off:wallet<c,fn:()=>{
        wallet-=c;up[u.k]=lv+1;store.set('up',up);store.set('wallet',wallet);
        if(u.k==='heart')P.hp=Math.min(maxHp(),P.hp+1);
        if(u.k==='band')P.flash++;
        sfx('key');talk.line='Done. You are level '+plLevel()+' now. It will hold, even past death.'}});
    }
    o[u0].head='Lasting upgrades';
  }else if(n.type==='map'){
    text=n.used?'It is all on your map now. Mind the corners.':'I have walked every hall of this floor twice. Hold out your map and I will mark what matters.';
    if(!n.used)o.push({label:'Mark the shards and the way down',sub:'Shows them on your map',cost:'free',fn:()=>{n.used=true;F.reveal=true;sfx('shard')}});
  }else if(n.type==='pat'){
    const busy=!WOF.done;
    text=talk.line||(busy?'Round and round she goes, and where she stops... well, you will all find out together.':PAT_LINES[(R.depth+Math.floor(R.time/20))%PAT_LINES.length]);
    o.push({label:'Spin the Wheel of Misfortune',sub:busy?'The wheel is still turning':'Twelve fates. Whatever it lands on happens.',cost:'10 gems',off:busy||wallet<10,fn:()=>{closeTalk();wofSpinStart()}});
  }else{
    text=n.used?DELVER_TIPS[n.tip%DELVER_TIPS.length]:'Took a claw to the leg. I am done going down. Take this, it is no use to me now.';
    if(!n.used)o.push({label:'Take the gift',sub:['A flash bomb','A flask of oil','A pouch of 8 gems'][n.gift],cost:'free',fn:()=>{
      n.used=true;if(n.gift===0)P.flash++;else if(n.gift===1){P.fuel=Math.min(100,P.fuel+50);lowFuelSaid=false}else{wallet+=8;store.set('wallet',wallet)}sfx('gem')}});
  }
  o.push({label:'Leave',sub:'',cost:'',leave:true,fn:closeTalk});
  talk.opts=o;if(talk.sel>=o.length)talk.sel=o.length-1;
  $('talkName').textContent=T.name;$('talkText').textContent=text;
  $('talkPurse').textContent='● '+wallet+' gems · Level '+plLevel();
  const box=$('talkOpts');box.innerHTML='';
  o.forEach((q,i)=>{if(q.head){const h=document.createElement('div');h.className='tgrp';h.textContent=q.head;box.appendChild(h)}
    const d=document.createElement('div');d.className='opt'+(i===talk.sel?' sel':'')+(q.off?' off':'');
    d.innerHTML='<span>'+(i<9?(i+1)+'. ':'')+q.label+(q.sub?'<small>'+q.sub+'</small>':'')+'</span><span class="cost">'+q.cost+'</span>';
    d.addEventListener('click',e=>{e.stopPropagation();talk.sel=i;pickTalk()});box.appendChild(d)});
  const se=box.querySelector('.sel');if(se&&se.scrollIntoView)se.scrollIntoView({block:'nearest'});
  $('talkHint').textContent=touch.on?'Tap a choice':pad.id?'D-pad or stick to choose · A to pick · B to leave':'Up and Down to choose · Enter to pick · Esc to leave';
}
function pickTalk(){
  if(!talk)return;const q=talk.opts[talk.sel];if(!q)return;
  if(q.off||!q.fn){sfx('seal');return}
  q.fn();if(talk)buildTalk();
}
function moveTalk(d){if(!talk)return;const n=talk.opts.length;talk.sel=(talk.sel+d+n)%n;buildTalk()}
function act(){if(loading||FX.frozen)return;if(P.down){mpCycle();return}if(state==='play'&&nearNpc)openTalk(nearNpc);else if(state==='play'&&nearDoor)sdoorOpen(nearDoor,true);else useFlash()}

/* ---------- the Wheel of Misfortune ---------- */
// Pat Sajak stands beside the wheel in every sanctuary. A spin costs 10 gems. The result is drawn when the spin starts and the disc is planned to
// stop on it (src/wheel.js), and the outcome is read back from that final angle, so the slice under the pointer is always what happens.
// The spin is sent to everyone ({k:'wof'}): players on this floor watch the same wheel turn, players elsewhere hear about it, and when it stops
// every client applies the result. Outcomes the brief gives to "every user" run on every client; the ones it gives to "the user"/"the spinner"
// (Walmart, Ad Break, Black Plague, First Thanksgiving) run on the spinner. The Tickle Monster is run by the host (or a solo player) and streamed.
const WOF_DESC=['Go stand in line.','And now, a word from our sponsor.','Everyone is a pug for two minutes.','Everyone is a large rat for two minutes.',
  'Everyone gains 200 pounds and moves ten times slower.','A coin decides. Heads: everyone gains 200 pounds.','Everyone loses this run\'s gems and supplies.',
  'Every sound is ten times louder.','A ringing in everyone\'s ears for a minute.','The spinner is a plague rat. Anyone who comes near dies slowly.',
  'He giggles. He is coming for each of you.','The spinner has smallpox. It is catching.',
  'Take a number.','Please read and accept the updated terms.','Everyone\'s controls are reversed for a minute.','Everyone\'s head is three times bigger for two minutes.',
  'Every torch on the floor goes out. The shades heard that.','He has a few minutes of your time. Everyone\'s time.',
  'The spinner is a hedgehog for two minutes. Z (LB): curl up and nothing can hurt you. X (R3): roll at super speed.',
  'The spinner starts over. From the very beginning.','Everyone pull up a chair.','Take cover. Or don\'t. It won\'t help.'];
const WOF_SCALE=0.66;   // the model is built a little large; this fits the banner under the 1.25 m ceiling
const WOF={plan:null,t:0,angle:0,flap:0,flapV:0,peg:0,result:-1,coin:0,mine:false,here:false,done:true,win:0,by:'',grp:null,chat:0};
const FX={flyT:0,flyB:0,spin:0,hedge:0,curl:0,moon:0,bob:0,pitch:0,pitchDone:false,pitchLine:-1,pug:0,rat:0,last:null,plague:0,fat:0,loud:0,tin:0,dying:false,dyT:0,pox:0,poxNear:0,poxC:4,stag:0,tickled:0,frozen:null};
const FX_TIMERS=['hedge','moon','bob','pug','rat','plague','fat','loud','tin','pox','tickled','stag'];
const FX_DUR={hedge:120,moon:60,bob:120,form:120,fat:120,loud:30,tin:60,plague:120,pox:300,tickled:3};
let TK=null,TS=null,wofOut=null,tinNode=null,BRK=null;
// the first-person breaks (Walmart, the ad) are their own little 3D scenes, drawn instead of the maze while they run
const brk=()=>BRK||(BRK=createBreaks(renderer,{ui:breakUI,onBeep:k=>{if(!ac)return;if(k==='ding'){tone(880,0.5,'sine',0.12);tone(660,0.8,'sine',0.1,0.28)}else tone(2350,0.08,'square',0.06)}}));
const wofForm=()=>FX.hedge>0?4:FX.plague>0?3:FX.pug>0&&FX.rat>0?(FX.last==='rat'?2:1):FX.rat>0?2:FX.pug>0?1:0;   // 0 you, 1 pug, 2 rat, 3 plague rat
const wofSpeed=()=>(FX.hedge>0&&FX.curl===2?3.2:1)*(FX.fat>0?0.1:1)*(FX.tickled>0?0.3:1)*(FX.stag>0?0.35:1);
const wofEye=()=>wofForm()===4?(FX.curl?0.3:0.38):[1,0.42,0.55,0.55][wofForm()];
const wofLive=()=>state!=='title'&&state!=='dead';
// "The wheel waits outside the door": a player inside a door room is never touched by the wheel. Results that land meanwhile are queued
// here and happen, in order, when they step back into the maze. World things (the Tickle Monster, a bomb) keep going but skip them.
const wofAway=()=>P.away||state==='room';
const WOQ=[];let WOQ_T=0,wofWasAway=false;
const WOQ_MAX=3;
function wofQueue(r){WOQ.push(r);if(WOQ.length>WOQ_MAX)WOQ.shift();WOQ_T=Math.max(WOQ_T,1.5)}

function wofSpinStart(){
  if(!F||!F.safe||!F.safe.wheel||!WOF.done||wallet<10)return;
  wallet-=10;store.set('wallet',wallet);sfx('gem');
  const i=(Math.random()*WOF_N)|0,plan=planSpin(i,WOF.angle);
  const m={k:'wof',d:R.depth,i,c:Math.random()<0.5?1:0,a0:plan.from,a1:plan.to,dur:plan.dur,n:myName()};
  mpSend(m);wofBegin(m,true);
}
function wofBegin(m,mine){
  WOF.plan={from:m.a0,to:m.a1,dur:m.dur};WOF.t=0;WOF.coin=m.c?1:0;WOF.mine=mine;WOF.by=mine?myName():String(m.n||'Someone').slice(0,16);
  WOF.here=!!(F&&F.safe&&F.safe.wheel&&m.d===R.depth);WOF.done=false;WOF.chat=0;WOF.angle=m.a0;WOF.peg=Math.floor(m.a0/WOF_W);
  if(mine)say('Pat: "Big money! Big money!"',3);
  else if(WOF.here)say(WOF.by+' spins the Wheel of Misfortune!',3);
  else mpSys(WOF.by+' is spinning the Wheel of Misfortune...');
}
const PAT_CHAT=['Pat: "Round and round she goes!"','Pat: "Ooh, she is slowing down..."','Pat: "Here it comes..."'];
function wofTickSpin(dt){
  if(WOF.done){
    WOF.win=Math.max(0,WOF.win-dt);
    if(Math.abs(WOF.flap)>1e-4||Math.abs(WOF.flapV)>1e-4){WOF.flapV+=(-140*WOF.flap-7*WOF.flapV)*dt;WOF.flap+=WOF.flapV*dt}
    return;
  }
  WOF.t+=dt;const pl=WOF.plan;
  if(WOF.here){
    const a=spinAngle(pl,WOF.t),push=pegPush(a);WOF.angle=a;
    if(push>=0){WOF.flap=push*0.85;WOF.flapV=0}
    else{WOF.flapV+=(-140*WOF.flap-7*WOF.flapV)*dt;WOF.flap+=WOF.flapV*dt}
    const pg=Math.floor((a-0.11)/WOF_W);
    if(pg!==WOF.peg){WOF.peg=pg;const w=F.safe.wheel,d=Math.hypot(w.x-P.x,w.z-P.z);if(d<12&&!wofAway())tone(2100+Math.random()*200,0.025,'square',0.09*Math.max(0.15,1-d/12))}   // the flapper's clack
    const k=Math.floor(WOF.t/pl.dur*4);
    if(k>WOF.chat&&k<=3){WOF.chat=k;if(!wofAway()&&Math.hypot(F.safe.wheel.x-P.x,F.safe.wheel.z-P.z)<8)say(PAT_CHAT[k-1],2.2)}
  }
  if(WOF.t>=pl.dur+0.9){
    WOF.done=true;WOF.win=4;
    if(WOF.here)WOF.angle=pl.to;
    wofResolve();
  }
}
function wofResolve(){
  const i=sliceAt(WOF.plan.to),sl=WOF_SLICES[i];WOF.result=i;
  mpSys(WOF.by+' landed on '+sl.name);
  if(!wofLive())return;
  const r={i,coin:WOF.coin,mine:WOF.mine,by:WOF.by};
  wofWorld(r);   // the floor itself carries on whatever you are doing
  if(wofAway()){wofQueue(r);return}   // you are behind a door: this waits for you
  wofPersonal(r);
}
// what the wheel does to the floor (host-run entities, the bomb); nothing here touches the local body
function wofWorld(r){
  switch(r.i){
    case 10:if(!MP.guest)tkSpawn();break;
    case 16:if(!MP.guest&&F)for(const s of F.shades)if(s.type===0&&s.x>0&&!s.dead){s.state=1;s.calm=0}break;   // the shades come looking
    case 17:FX.pitch=0;FX.pitchDone=false;FX.pitchLine=-1;if(!MP.guest)tsSpawn();break;
    case 20:if(!MP.guest)setTimeout(()=>{if(wofLive()&&!RR)rrStart()},1500);break;
    case 21:bombDrop();break;
  }
}
// what the wheel does to you
function wofPersonal(r){
  const i=r.i,sl=WOF_SLICES[i],mine=r.mine,coin=r.coin;
  const desc=i===7&&FX.loud>0?`Another pair on top of the last. Everything is now ${Math.pow(10,(FX.loudN||1)+1).toLocaleString()}x louder.`:WOF_DESC[i];
  announce(sl.name.toUpperCase()+'!',(mine?'':r.by+' spun. ')+desc,sl.col);
  if(ac){tone(392,0.32,'sawtooth',0.09,0.1,-12);tone(370,0.32,'sawtooth',0.09,0.45,-12);tone(349,0.32,'sawtooth',0.09,0.8,-12);tone(330,1.1,'sawtooth',0.09,1.15,-40)} // sad trombone
  switch(i){
    case 0:if(mine)wofScene('walmart');break;
    case 1:if(mine)wofScene('ad');break;
    case 2:FX.pug=FX_DUR.form;FX.last='pug';break;
    case 3:FX.rat=FX_DUR.form;FX.last='rat';break;
    case 4:FX.fat=FX_DUR.fat;break;
    case 5:coinFlip(coin===1,()=>{if(coin===1&&wofLive())FX.fat=FX_DUR.fat});break;
    case 6:wofLoseAll();break;
    case 7:FX.loudN=FX.loud>0?(FX.loudN||1)+1:1;FX.loud=FX_DUR.loud;break;   // they compound: each pair on top of the last is another 10x, and the clock starts over
    case 8:FX.tin=FX_DUR.tin;break;
    case 9:if(mine){FX.plague=FX_DUR.plague;FX.dying=false}break;
    case 11:if(mine){FX.pox=FX_DUR.pox;FX.poxC=3}break;
    case 12:if(mine)wofScene('dmv');break;
    case 13:if(mine)wofScene('terms');break;
    case 14:FX.moon=FX_DUR.moon;break;
    case 15:FX.bob=FX_DUR.bob;break;
    case 16:wofLightsOut();break;
    case 18:if(mine){FX.hedge=FX_DUR.hedge;setTimeout(()=>say(touch.on?'You are a hedgehog. CURL: nothing can hurt you. ROLL: super speed.':'You are a hedgehog. Hold Z to curl up (nothing can hurt you). Hold X to roll at super speed.',6),2500)}break;
    case 19:if(mine)wofScene('birth');break;
  }
}
// back in the maze: results that landed while you were behind a door happen now, one at a time, spaced out so breaks and banners do not overlap
function wofReplayTick(dt){
  if(!WOQ.length){WOQ_T=0;return}
  if(FX.frozen||RR||termsEl||(BRK&&BRK.active)||(WOQ.busy&&performance.now()<WOQ.busy))return;
  WOQ_T-=dt;if(WOQ_T>0)return;
  const r=WOQ.shift();
  if(r.msg){say(r.msg,4);WOQ_T=3;return}
  say('While you were inside, '+(r.mine?'you':r.by)+' spun the wheel...',2.4);
  WOQ.busy=performance.now()+2000;
  setTimeout(()=>{
    if(!wofLive())return;
    if(wofAway()){WOQ.unshift(r);return}
    wofPersonal(r);
  },1800);
  WOQ_T=7;   // room for the banner, and for whatever a break takes
}
// "Nothing": every gem found on this run is taken back out of the purse, and every supply bought or found for it is gone
function wofLoseAll(){
  const g=R.gems|0;wallet=Math.max(0,wallet-g);store.set('wallet',wallet);R.gems=0;
  const had=P.flash+(P.ward|0)+(P.spikeTraps|0)+(R.xray>0?1:0)+(R.guide>0?1:0);
  P.flash=0;P.ward=0;P.spikeTraps=0;R.xray=0;R.guide=0;
  setTimeout(()=>say(`You lose ${g} gem${g===1?'':'s'} and ${had?'all your supplies':'nothing else, you had nothing'}.`,4),1800);
}
function wofScene(kind){
  if(wofAway())return;   // never a break behind a door
  if(state==='talk')closeTalk();
  FX.frozen=kind;P.vx=P.vz=0;
  const end=()=>{FX.frozen=null;if(wofLive()&&!touch.on&&!document.pointerLockElement)say('Click to return to the maze',4)};
  if((kind==='ad'||kind==='terms')&&document.pointerLockElement){usingLock=false;document.exitPointerLock()}   // free the cursor for Skip Ad and I Agree
  if(kind==='terms')termsDialog(end);
  else brk().start(kind,end);
}
function wofClear(){
  for(const k of FX_TIMERS)FX[k]=0;FX.flyT=0;BOMB=null;FX.dying=false;FX.poxNear=0;FX.frozen=null;TK=null;TS=null;RR=null;FX.pitchDone=false;FX.pitch=0;WOQ.length=0;WOQ_T=0;WOQ.busy=0;rrMissed=false;closeTerms();
  if(BRK)BRK.stop(true);statusStrip([]);tints({});wofAudio();
}
/* sounds: the hearing aids sit after the master volume; the ringing goes through it */
function wofAudio(){
  if(!ac||!wofOut)return;
  if(FX.loud<=0)FX.loudN=0;
  const away=wofAway(),loud=FX.loud>0&&!away?Math.pow(10,Math.min(FX.loudN||1,6)):1;if(wofOut._v!==loud){wofOut._v=loud;wofOut.gain.setTargetAtTime(loud,ac.currentTime,0.12)}
  if(FX.tin>0&&!away&&!tinNode){
    const o=ac.createOscillator(),o2=ac.createOscillator(),g=ac.createGain();o.frequency.value=7900;o2.frequency.value=7911;g.gain.value=0;
    o.connect(g);o2.connect(g);g.connect(master);o.start();o2.start();g.gain.setTargetAtTime(0.11,ac.currentTime,0.5);tinNode={o,o2,g};
  }else if((FX.tin<=0||away)&&tinNode){const q=tinNode;tinNode=null;q.g.gain.setTargetAtTime(0,ac.currentTime,0.4);setTimeout(()=>{try{q.o.stop();q.o2.stop()}catch(e){}},2500)}
}
// a breathy old man's "hee-hee-hee", placed in stereo
function giggle(x,z,vol,pitch){
  if(!ac)return;const dx=x-P.x,dz=z-P.z,d=Math.hypot(dx,dz);if(d>16)return;
  const k=(vol||1)*Math.max(0.12,1-d/16),pan=d<0.3?0:clamp((dx*-Math.sin(P.yaw)+dz*Math.cos(P.yaw))/d,-1,1),n=4+(Math.random()*3|0),f0=(pitch||1)*(430+Math.random()*90);
  for(let i=0;i<n;i++){
    const t=ac.currentTime+i*0.12,o=ac.createOscillator(),bp=ac.createBiquadFilter(),g=ac.createGain(),fi=f0*(1-i*0.035);
    o.type='sawtooth';o.frequency.setValueAtTime(fi*1.15,t);o.frequency.exponentialRampToValueAtTime(fi*0.78,t+0.1);
    bp.type='bandpass';bp.frequency.value=1300+i*60;bp.Q.value=2.2;
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.4*k,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+0.1);
    o.connect(bp);bp.connect(g);let out=g;
    if(ac.createStereoPanner){const p=ac.createStereoPanner();p.pan.value=pan;g.connect(p);out=p}
    out.connect(sfxBus);o.start(t);o.stop(t+0.12);
    const s=ac.createBufferSource(),f=ac.createBiquadFilter(),ng=ac.createGain();s.buffer=noiseBuf;f.type='bandpass';f.frequency.value=2600;f.Q.value=1;
    ng.gain.setValueAtTime(0.12*k,t);ng.gain.exponentialRampToValueAtTime(0.0001,t+0.09);s.connect(f);f.connect(ng);ng.connect(sfxBus);s.start(t,Math.random()*0.5);s.stop(t+0.1);
  }
}
function cough(){if(!ac)return;noise(0.22,0.3,650,1.3);tone(190,0.16,'sawtooth',0.1,0,-80);tone(170,0.16,'sawtooth',0.09,0.26,-70)}

/* ---------- the Tickle Monster ---------- */
// walk a visitor one step along the maze towards (gx,gz): a distance field from the target's tile, refreshed each second or when it moves on
function mazeStep(o,gx,gz,dt,speed){
  const cx=Math.floor(o.x),cz=Math.floor(o.z),tx=Math.floor(gx),tz=Math.floor(gz);
  if(cx!==tx||cz!==tz){
    const key=tz*F.W+tx;o.dfT=(o.dfT||0)-dt;
    if(!o.df||o.dfK!==key||o.dfT<=0){o.df=bfs(F.g,F.W,F.H,tx,tz);o.dfK=key;o.dfT=1}
    const here=o.df[cz*F.W+cx];let bd=here<0?1e9:here,bn=null;
    for(const q of DIRS){const nx=cx+q[0],nz=cz+q[1];if(nx<0||nz<0||nx>=F.W||nz>=F.H)continue;const nd=o.df[nz*F.W+nx];if(nd>=0&&nd<bd){bd=nd;bn=[nx,nz]}}
    if(bn){gx=bn[0]+0.5;gz=bn[1]+0.5}
  }
  const dx=gx-o.x,dz=gz-o.z,dl=Math.hypot(dx,dz)||1,sp=speed*dt;
  o.x+=dx/dl*Math.min(sp,dl);o.z+=dz/dl*Math.min(sp,dl);o.yaw=Math.atan2(dz,dx);o.mv=Math.min(1,(o.mv||0)+dt*4);
}
// a guest just follows where the host says the visitor is
function followNet(o,dt){
  const k=Math.min(1,dt*10);o.x+=(o.tx-o.x)*k;o.z+=(o.tz-o.z)*k;
  let dy=o.tyaw-o.yaw;while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;o.yaw+=dy*k;
}

// touch: two hold buttons, CURL and ROLL, shown only while you are a hedgehog
let hedgeBtns=false;
function hedgeButtons(){
  if(hedgeBtns||!$('touch'))return;hedgeBtns=true;
  const st=document.createElement('style');st.textContent='#tCurl,#tRoll{bottom:calc(212px + env(safe-area-inset-bottom));width:60px;height:60px;font-size:11px}#tCurl{right:calc(24px + env(safe-area-inset-right))}#tRoll{right:calc(92px + env(safe-area-inset-right))}body:not(.hedgehog) #tCurl,body:not(.hedgehog) #tRoll{display:none}';
  document.head.appendChild(st);
  for(const [id,label,key] of[['tCurl','CURL','curl'],['tRoll','ROLL','roll']]){
    const b=document.createElement('div');b.id=id;b.className='tbtn';b.textContent=label;
    const on=e=>{e.preventDefault();e.stopPropagation();touch[key]=true},off=e=>{e.preventDefault();touch[key]=false};
    b.addEventListener('touchstart',on,{passive:false});b.addEventListener('touchend',off);b.addEventListener('touchcancel',off);
    $('touch').appendChild(b);
  }
}

/* ---------- Russian Roulette ---------- */
// Everyone in the run is pulled to one table. The revolver has a chamber for each player plus one more empty, and one round:
// n players, n+1 empty chambers. Each player gets one turn: spin the cylinder (once, if they want), then pull the trigger.
// Click, and it passes on; the round fires, and that player dies and the game ends. If it goes all the way round, everyone walks away.
// The host (or a solo player) owns the table; the others send what they want to do and draw what the host says.
let RR=null,rrMissed=false;
const rrMe=()=>MP.on?MP.id:'me';
const RR_TURN=25;   // seconds to decide before the table decides for you
function rrStart(){
  const seats=[];   // only players in the maze sit down; anyone behind a door misses it
  if(!wofAway())seats.push({id:rrMe(),name:myName(),col:MP.on?MP_COLS[hashStr(MP.id||'')%MP_COLS.length]:[0.62,0.32,0.2]});
  if(MP.on)for(const p of MP.peers.values())if(p.run&&mpFresh(p)&&!p.away)seats.push({id:p.id,name:p.name,col:p.col});
  if(!seats.length){mpSys('Nobody was in the maze to sit at the roulette table. The chairs stay empty.');return}
  seats.sort((a,b)=>a.id<b.id?-1:1);
  const n=seats.length+2;
  rrSet({seats,n,live:(Math.random()*n)|0,pos:(Math.random()*n)|0,turn:0,spun:false,phase:'aim',phT:RR_TURN,ver:1,loser:-1,ev:'deal'});
}
function rrSet(s){
  RR=s;mpSend({k:'rr',s});rrShow();
}
function rrShow(){   // join the table (or keep sitting at it) and react to what just happened
  if(!RR||!wofLive())return;
  if(wofAway()||!RR.seats.some(q=>q.id===rrMe())){   // not at the table: nothing opens until it is over
    if(wofAway())rrMissed=true;
    if(RR.phase==='end')rrEnd();
    return;
  }
  if(state==='talk')closeTalk();
  if(FX.frozen!=='roulette'){FX.frozen='roulette';if(document.pointerLockElement){usingLock=false;document.exitPointerLock()}brk().start('roulette',()=>{},{rr:()=>RR,me:rrMe(),act:rrAct})}
  if(ac){if(RR.ev==='spin')for(let i=0;i<14;i++)tone(1400+Math.random()*300,0.02,'square',0.05,i*0.06);
    else if(RR.ev==='click')tone(900,0.05,'square',0.12);
    else if(RR.ev==='bang'){noise(1.2,1,1400,0.5);noise(0.6,0.9,250,0.7);tone(60,0.9,'sawtooth',0.4,0,-30)}}
  if(RR.phase==='end')rrEnd();
}
function rrAct(a){
  if(!RR||RR.phase!=='aim'||RR.seats[RR.turn].id!==rrMe())return;
  if(MP.guest)mpSend({k:'rra',a},MP.hostId);else rrApply(a,rrMe());
}
function rrApply(a,from){   // host side
  const r=RR;if(!r||r.phase!=='aim'||r.seats[r.turn].id!==from)return;
  if(a==='spin'&&!r.spun)rrSet({...r,pos:(Math.random()*r.n)|0,spun:true,ver:r.ver+1,ev:'spin'});
  else if(a==='shoot'){const bang=r.pos===r.live;rrSet({...r,phase:bang?'bang':'click',phT:bang?3.5:2.2,loser:bang?r.turn:-1,ver:r.ver+1,ev:bang?'bang':'click'})}
}
function rrTick(dt){
  if(!RR||MP.guest)return;
  const r=RR;r.phT-=dt;
  if(r.phase==='aim'){
    if(MP.on&&r.seats[r.turn].id!==rrMe()&&!MP.peers.has(r.seats[r.turn].id))r.phT=0;   // gone: their turn is taken for them
    if(r.phT<=0)rrApply('shoot',r.seats[r.turn].id);
  }else if(r.phT<=0){
    if(r.phase==='click'){const turn=r.turn+1;
      if(turn>=r.seats.length)rrSet({...r,phase:'done',phT:4,ver:r.ver+1,ev:'done'});
      else rrSet({...r,turn,pos:(r.pos+1)%r.n,spun:false,phase:'aim',phT:RR_TURN,ver:r.ver+1,ev:'pass'})}
    else if(r.phase==='bang'||r.phase==='done')rrSet({...r,phase:'end',ver:r.ver+1,ev:'end'});
  }
}
function rrEnd(){
  const r=RR;RR=null;
  if(BRK&&BRK.kind==='roulette')BRK.stop(true);
  if(FX.frozen==='roulette')FX.frozen=null;
  if(!r||!wofLive())return;
  if(!r.seats.some(q=>q.id===rrMe())){   // you were not at the table
    if(rrMissed){rrMissed=false;const m='You missed a round of Russian roulette at the table.';if(wofAway())wofQueue({msg:m});else say(m,4)}
    return;
  }
  const lost=r.loser>=0&&r.seats[r.loser]&&r.seats[r.loser].id===rrMe();
  if(lost){say('You lost at Russian roulette.',4);P.ward=0;P.hp=1;P.inv=0;R.wind=true;hurt(null)}   // no ward, no second wind
  else{say(r.loser>=0?r.seats[r.loser].name+' lost at Russian roulette.':'Everyone survived. This time.',4);if(!touch.on&&!document.pointerLockElement)setTimeout(()=>say('Click to return to the maze',4),4200)}
}
const rrValid=s=>s&&Array.isArray(s.seats)&&s.seats.length>0&&s.seats.length<=16&&Number.isInteger(s.n)&&s.n===s.seats.length+2&&
  [s.live,s.pos,s.turn].every(v=>Number.isInteger(v)&&v>=0)&&s.live<s.n&&s.pos<s.n&&s.turn<s.seats.length&&['aim','click','bang','done','end'].includes(s.phase);

/* ---------- Bomb ---------- */
// A bomb drops from the ceiling in front of the wheel, its fuse fizzes for three seconds, and the sanctuary goes up: a flash, a boom,
// the whole room shakes, a scorch mark is left on the floor, the Keeper and Pat are knocked flat (they get back up), shades nearby
// are blown away, and every player on the floor is thrown away from the blast, the nearer the harder, bouncing down the halls.
// Every client sees the same bomb at the same moment (the wheel result arrives together); each one throws its own player.
let BOMB=null,scorch=null;
function bombDrop(){
  const w=F&&F.safe&&F.safe.wheel;
  if(!w||!WOF.here){setTimeout(()=>{if(wofLive()&&!wofAway()){say('Somewhere above you, something goes BOOM.',3);noise(1.2,0.25,90,0.6);pkShake=Math.max(pkShake,0.4)}},3500);return}
  BOMB={x:w.x+w.nx*1.0,z:w.z+w.nz*1.0,t:0,beep:0,done:false};
}
function bombTick(dt){
  const B0=BOMB;
  if(FX.flyT>0){FX.flyT-=dt;   // thrown: you tumble; each landing bounces you on, a little less each time
    if(P.y<=0&&P.vy<=0&&FX.flyB>0){FX.flyB--;const k=0.5;P.vy=3.2*k+FX.flyB*0.6;P.y=0.0001;P.vx*=0.6;P.vz*=0.6;sfx('step');rumble(120,0.5,0.4)}
    if(FX.flyT<=0)FX.flyT=0}
  if(F)for(const n of F.npcs)if(n.knock>0){
    n.knock-=dt;const u=Math.min(1,(6-n.knock)/0.7);
    if(u<1){n.ox=(n.kox||0)+n.kvx*u;n.oz=(n.koz||0)+n.kvz*u;n.oy=Math.sin(u*Math.PI)*0.35;n.fall=Math.max(0.001,u)}
    else{n.oy=0;n.fall=n.knock>1?1:Math.max(0,n.knock);if(n.knock<=1){const k=Math.min(1,dt*2);n.ox+=((n.kox||0)-n.ox)*k;n.oz+=((n.koz||0)-n.oz)*k}}
    if(n.knock<=0){n.knock=0;n.fall=0;n.oy=0;n.ox=n.kox||0;n.oz=n.koz||0;n.lock=false}
  }
  if(!B0)return;
  B0.t+=dt;
  const fuse=3,d=Math.hypot(B0.x-P.x,B0.z-P.z);
  if(B0.t<fuse){B0.beep-=dt;if(B0.beep<=0){B0.beep=Math.max(0.12,0.55-B0.t*0.15);if(d<14&&!wofAway())tone(1500,0.05,'square',0.07*Math.max(0.2,1-d/14))}
    if(Math.random()<0.5&&d<14&&!wofAway())noise(0.06,0.03*Math.max(0.2,1-d/14),5000,3);return}
  if(!B0.done){B0.done=true;bombBoom(B0,d)}
  if(B0.t>fuse+3)BOMB=null;
}
function bombBoom(B0,d){
  const away=wofAway(),k=away?0:Math.max(0,1-d/9);
  if(away&&wofLive())say('Somewhere beyond the door, something goes BOOM.',3);
  if(away)noise(1.4,0.12,70,0.5);   // a muffled thud through the wall
  else{
    noise(1.6,0.9*Math.max(0.25,k),110,0.5);noise(0.9,0.7*Math.max(0.2,k),700,0.6);tone(42,1.6,'sawtooth',0.45*Math.max(0.25,k),0,-22);
    pkShake=Math.max(pkShake,0.5+k*1.5);rumble(400,1,1);
    if(d<10)breakUI.flash(1);
  }
  // the scorch mark stays for the rest of the floor
  if(!scorch){scorch=new THREE.Mesh(new THREE.CircleGeometry(1,40),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.55,depthWrite:false}));scorch.rotation.x=-Math.PI/2;scene.add(scorch)}
  scorch.position.set(B0.x,0.006,B0.z);scorch.scale.setScalar(1.3);scorch.visible=true;scorch.userData.depth=R.depth;
  // you: thrown away from the blast
  if(!P.down&&wofLive()&&!FX.frozen&&!away&&d<9){
    let ax=P.x-B0.x,az=P.z-B0.z,al=Math.hypot(ax,az);if(al<0.05){const a=Math.random()*Math.PI*2;ax=Math.cos(a);az=Math.sin(a);al=1}
    const v=3+9*k;P.vx=ax/al*v;P.vz=az/al*v;P.vy=2.6+2.2*k;P.y=0.0001;P.airSpeed=v;FX.flyT=2.5;FX.flyB=2;FX.spin=(Math.random()<0.5?-1:1)*(5+6*k);
    if(FX.curl!==1)say(k>0.5?'BOOM! You are airborne.':'The blast knocks you off your feet.',2.5);
  }
  // the Keeper and Pat go flat, then get back up
  if(F)for(const n of F.npcs){if(n.fall&&!n.knock)continue;const dx=n.x-B0.x,dz=n.z-B0.z,dd=Math.hypot(dx,dz)||0.1;if(dd>4)continue;
    n.kox=n.kox??(n.ox||0);n.koz=n.koz??(n.oz||0);const v=0.5+0.6*(1-dd/4);n.kvx=dx/dd*v;n.kvz=dz/dd*v;n.knock=6;n.lock=true;if(nearNpc===n)nearNpc=null;if(talk&&talk.npc===n)closeTalk()}
  // shades too close are blown away
  if(F&&!MP.guest)for(const s of F.shades)if(s.x>0&&!s.dead&&Math.hypot(s.x-B0.x,s.z-B0.z)<4)banish(s,true);
}
function bombDraw(t){
  if(scorch)scorch.visible=!!F&&scorch.userData.depth===R.depth&&state!=='title';
  const B0=BOMB;if(!B0)return;
  if(B0.t<3){ // falling, then sitting there fizzing
    const y=Math.max(0.14,1.15-B0.t*4.5),sq=y<=0.14?1+Math.sin(B0.t*30)*0.03:1,f={p:[B0.x,y,B0.z],R:rYaw(B0.t*0.3)};
    ball(f,[0,0,0],[0.14*sq,0.14/sq,0.14*sq],[0.05,0.05,0.06,4]);ball(f,[0.05,0.06,0.05],0.03,[0.6,0.6,0.65,4],true);
    seg(f,[0,0.13,0],[0,0.17,0],0.035,0.035,[0.3,0.3,0.32,4]);
    const fl=0.09*(1-B0.t/3)+0.02;seg(f,[0,0.17,0],[0.03,0.17+fl,0.01],0.006,0.005,[0.75,0.62,0.4,6]);
    const sp=fpt(f,[0.03,0.17+fl,0.01]);spr(sp[0],sp[1],sp[2],0.12,0.12,7,1.0,0.7,0.2,1,1);spr(sp[0],sp[1]+0.02,sp[2],0.05,0.05,11,1,0.9,0.5,1,1);
  }else{ // the fireball, the smoke, and the bits flying out
    const u=B0.t-3;
    if(u<0.9){const r=0.5+u*3.2,a=1-u/0.9;spr(B0.x,0.5,B0.z,r*2,r*2,7,1.0,0.55,0.15,a,1);spr(B0.x,0.45,B0.z,r*1.2,r*1.2,7,1.0,0.9,0.6,a,1)}
    for(let i=0;i<14;i++){const a=i*2.4,r=(0.4+u*1.1)*(0.7+(i%3)*0.2),y=0.3+u*0.25+(i%4)*0.1;spr(B0.x+Math.cos(a)*r,y,B0.z+Math.sin(a)*r,0.6+u*0.4,0.6+u*0.4,7,0.12,0.11,0.1,Math.max(0,0.5-u*0.17),0)}
    if(u<1.4)for(let i=0;i<18;i++){const a=i*1.9,v=2.5+(i%5)*0.6,x=B0.x+Math.cos(a)*v*u,z=B0.z+Math.sin(a)*v*u,y=Math.max(0.03,0.2+3*u-5.5*u*u);
      ball({p:[x,y,z],R:rYaw(a+u*9)},[0,0,0],[0.035,0.025,0.03],[0.35,0.32,0.28,9],true)}
  }
}

/* ---------- Lights Out ---------- */
function wofLightsOut(){
  P.fuel=0;lowFuelSaid=true;sfx('powerdown');noise(0.5,0.25,900,1.5);
  setTimeout(()=>say('Every torch on the floor is out. Something heard the hiss.',4),1500);
}

/* ---------- the Timeshare Salesman ---------- */
// He walks up to each player in turn and will not stop talking until he has finished his pitch. Until you have heard it you cannot
// talk to anyone else, and the Keeper will not trade with you while he is hovering nearby. The host walks him; everyone hears him.
const PITCH=['"Hi there! Got a minute? Of course you do."','"Picture this: a sanctuary. YOUR sanctuary. Fifty-two weeks a year."','"Brazier included. Keeper sold separately."',
  '"The shades are a seasonal community. Very quiet in the off season."','"I can only offer this rate today, and only to you."','"Fourteen thousand gems, or one easy payment of everything you own."',
  '"I am not supposed to do this, but I like you."','"Sign here, here, and... here. Think it over. I will be around."'];
const PITCH_LINE=3.2,PITCH_LEN=PITCH.length*PITCH_LINE;
const tsNew=(x,z)=>({x,z,tx:x,tz:z,yaw:0,tyaw:0,t:200,tg:null,heard:{},prog:{},walk:0,mv:0,net:0,age:0,pitching:false,
  n:{type:'sales',x,z,ph:2.3,used:true,lock:true,yaw:0,hy:0,hp:0}});
function tsSpawn(){
  if(!F)return;const w=F.safe&&F.safe.wheel;
  TS=tsNew(w?w.x+w.nx*0.9:P.x+0.8,w?w.z+w.nz*0.9:P.z);
}
function tsTick(dt){
  const T0=TS;if(!T0)return;
  if(MP.guest){T0.age+=dt;if(T0.age>3){TS=null;return}followNet(T0,dt)}
  else{
    T0.t-=dt;
    const L=tkTargets().filter(q=>!T0.heard[q.id]),waiting=tkTargets(true).some(q=>q.away&&!T0.heard[q.id]);
    if(T0.t<=0||!L.length&&!waiting){TS=null;mpSend({k:'ts',d:R.depth,end:1});say('The salesman leaves his card on the floor and moves on.',3.5);return}
    let tg=L.find(q=>q.id===T0.tg);
    if(!tg&&L.length){L.sort((a,b)=>Math.hypot(a.x-T0.x,a.z-T0.z)-Math.hypot(b.x-T0.x,b.z-T0.z));tg=L[0];T0.tg=tg.id}
    if(!tg){T0.tg=null;T0.pitching=false;T0.mv=Math.max(0,T0.mv-dt*4)}   // the only one left is behind a door: he loiters
    else{
      const d=Math.hypot(tg.x-T0.x,tg.z-T0.z);
      T0.pitching=d<1.3;
      if(d>0.75)mazeStep(T0,tg.x,tg.z,dt,2.0);else{T0.mv=Math.max(0,T0.mv-dt*4);T0.yaw=Math.atan2(tg.z-T0.z,tg.x-T0.x)}
      if(T0.pitching){T0.prog[tg.id]=(T0.prog[tg.id]||0)+dt;if(T0.prog[tg.id]>=PITCH_LEN+0.5){T0.heard[tg.id]=true;T0.tg=null}}
    }
    T0.net-=dt;if(T0.net<=0&&MP.on){T0.net=0.1;mpSend({k:'ts',d:R.depth,x:r3(T0.x),z:r3(T0.z),y:r3(T0.yaw),m:r3(T0.mv),p:T0.pitching?1:0})}
  }
  T0.walk+=dt*T0.mv*8;
  // your side of it: the pitch plays while he is in your face
  if(!FX.pitchDone&&wofLive()&&!P.down&&!wofAway()&&Math.hypot(T0.x-P.x,T0.z-P.z)<1.4){
    FX.pitch+=dt;const k=Math.min(PITCH.length-1,Math.floor(FX.pitch/PITCH_LINE));
    if(k!==FX.pitchLine){FX.pitchLine=k;say('Salesman: '+PITCH[k],PITCH_LINE+0.3);talkBlip(T0.x,T0.z)}
    if(FX.pitch>=PITCH_LEN){FX.pitchDone=true;setTimeout(()=>say('You now own one fourteen-thousandth of a sanctuary. Probably.',3.5),PITCH_LINE*1000)}
  }
}
function talkBlip(x,z){if(!ac)return;const d=Math.hypot(x-P.x,z-P.z);for(let i=0;i<5;i++)tone(170+Math.random()*90,0.07,'sawtooth',0.05*Math.max(0.2,1-d/8),i*0.09+Math.random()*0.03,30)}

/* ---------- Terms & Conditions ---------- */
let termsEl=null;
function closeTerms(){if(termsEl){termsEl.remove();termsEl=null}}
function termsDialog(onDone){
  closeTerms();
  const LAW=['By spinning the Wheel of Misfortune ("the Wheel"), you ("the Spinner") agree to be bound by these Terms, any future Terms, and Terms that were already in effect before you were born.',
    'The Spinner acknowledges that the Wheel is provided "as is", "as spun", and "as it lands", without warranty of fortune, express or implied.',
    'Gems paid to the Wheel are non-refundable, non-transferable, and, upon reflection, gone.',
    'The Keeper is not affiliated with the Wheel, Pat Sajak, or any outcome thereof, and wishes that to be clearly understood.',
    'The Spinner consents to being turned into a pug, a rat, or a heavier version of themselves, at the Wheel\'s sole discretion.',
    'Shades are independent contractors. The Wheel accepts no liability for their conduct, appetite, or punctuality.',
    'Any ringing in the ears is a feature of the Service and not a defect of the Spinner.',
    'The Wheel may share your data with: the Keeper, the shades, the Tickle Monster, and a man who sells timeshares.',
    'In the event of a dispute, the Spinner agrees to binding arbitration, conducted in the dark, at depth forty.',
    'Section 7(b) is hereby repealed. Section 7(b) did not exist. Section 7(b) is reinstated.',
    'The Spinner waives the right to complain about the Walmart line, the ad, or the DMV, in this life or the next.',
    'These Terms are governed by the laws of the Ember Deep and, where those are silent, by vibes.'];
  let page=1;
  const el=document.createElement('div');termsEl=el;
  el.style.cssText='position:fixed;inset:0;z-index:35;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-family:Georgia,serif';
  const draw=()=>{
    const paras=[];for(let i=0;i<(page===1?44:30);i++){const n=i%LAW.length;paras.push(`<p><b>${page}.${i+1}</b> ${LAW[(n*5+page)%LAW.length]}</p>`)}
    el.innerHTML=`<div style="width:min(620px,92vw);max-height:84vh;display:flex;flex-direction:column;background:#f6f1e4;color:#2a2418;border-radius:6px;box-shadow:0 10px 40px #000;overflow:hidden">
      <div style="padding:16px 22px;background:#e9e1c8;border-bottom:1px solid #c9bea0"><div style="font:700 20px Georgia,serif">${page===1?'Terms & Conditions':'Updated Terms & Conditions'}</div>
      <div style="font:13px Arial,sans-serif;color:#6a5e44;margin-top:4px">Wheel of Misfortune · Page ${page} of 2 · Please scroll to the bottom to continue</div></div>
      <div class="wofTc" style="overflow-y:scroll;padding:4px 22px;font-size:14px;line-height:1.5;flex:1">${paras.join('')}<p style="text-align:center;color:#8a7e60">— end of page ${page} —</p></div>
      <div style="padding:12px 22px;border-top:1px solid #c9bea0;display:flex;align-items:center;gap:12px;font:14px Arial,sans-serif">
        ${page===2?'<label style="flex:1"><input type="checkbox" class="wofCk"> I have read and understood the updated terms</label>':'<span style="flex:1;color:#6a5e44">Scroll down to accept</span>'}
        <button class="wofOk" disabled style="font:700 15px Arial,sans-serif;padding:9px 22px;border:0;border-radius:4px;background:#b8b0a0;color:#fff">I Agree</button></div></div>`;
    const tc=el.querySelector('.wofTc'),ok=el.querySelector('.wofOk'),ck=el.querySelector('.wofCk');
    const upd=()=>{const read=tc.scrollTop+tc.clientHeight>=tc.scrollHeight-4,go=read&&(!ck||ck.checked);ok.disabled=!go;ok.style.background=go?'#2a6ad0':'#b8b0a0';ok.style.cursor=go?'pointer':'default'};
    tc.addEventListener('scroll',upd);if(ck)ck.addEventListener('change',upd);
    ok.addEventListener('click',e=>{e.stopPropagation();if(ok.disabled)return;sfx('pick');if(page===1){page=2;draw()}else{closeTerms();onDone()}});
    el.addEventListener('keydown',e=>e.stopPropagation());
  };
  draw();document.body.appendChild(el);
}
function tkSpawn(){
  if(!F)return;const w=F.safe&&F.safe.wheel;
  const x=w?w.x+w.nx*0.9:P.x+0.8,z=w?w.z+w.nz*0.9:P.z;
  TK={x,z,yaw:0,t:150,tg:null,pause:1.6,walk:0,mv:0,gig:1,last:{},df:null,dfK:-1,dfT:0,net:0,gT:0,age:0,
    n:{type:'tickle',x,z,ph:1.7,used:true,lock:true,yaw:0,hy:0,hp:0}};
}
// who a floor-wide creature can go after: players standing in the maze. Anyone behind a door is out of reach (and, with away, listed apart).
function tkTargets(away){
  const L=[];
  if(!P.down&&wofLive()&&!FX.frozen){if(!wofAway())L.push({id:'me',x:P.x,z:P.z});else if(away)L.push({id:'me',x:P.x,z:P.z,away:true})}
  if(MP.on)for(const p of MP.peers.values()){
    if(p.d!==R.depth||p.down||p.frz||!p.run||!mpFresh(p))continue;
    if(p.away){if(away)L.push({id:p.id,x:p.x,z:p.z,away:true});continue}
    if(mpDrawn(p))L.push({id:p.id,x:p.x,z:p.z});
  }
  return L;
}
function tkTick(dt){
  const T0=TK;if(!T0)return;
  if(MP.guest){
    T0.age+=dt;if(T0.age>3){TK=null;return}
    followNet(T0,dt);
  }else{
    T0.t-=dt;
    if(T0.t<=0){TK=null;mpSend({k:'tk',d:R.depth,end:1});say('The Tickle Monster wanders off, giggling.',3);return}
    if(T0.pause>0){T0.pause-=dt;T0.mv=Math.max(0,T0.mv-dt*4);T0.gig=1}
    else{
      const L=tkTargets();let tg=L.find(q=>q.id===T0.tg);
      if(!tg&&L.length){L.sort((a,b)=>((T0.last[a.id]||-99)-(T0.last[b.id]||-99))||(Math.hypot(a.x-T0.x,a.z-T0.z)-Math.hypot(b.x-T0.x,b.z-T0.z)));tg=L[0];T0.tg=tg.id}
      if(!tg)T0.mv=Math.max(0,T0.mv-dt*4);
      else{
        const d=Math.hypot(tg.x-T0.x,tg.z-T0.z);
        if(d<0.42){T0.last[tg.id]=R.time;T0.tg=null;T0.pause=2.6;T0.gig=1;T0.gT=0}   // got one: a giggling fit, then the next player
        else{
          mazeStep(T0,tg.x,tg.z,dt,2.3);T0.gig=Math.max(0.15,T0.gig-dt);
        }
      }
    }
    T0.net-=dt;if(T0.net<=0&&MP.on){T0.net=0.1;mpSend({k:'tk',d:R.depth,x:r3(T0.x),z:r3(T0.z),y:r3(T0.yaw),m:r3(T0.mv),g:r3(T0.gig),p:T0.pause>0?1:0,t:Math.round(T0.t)})}
  }
  T0.walk+=dt*T0.mv*9;
  T0.gT-=dt;if(T0.gT<=0){T0.gT=T0.pause>0?0.75:1.2+Math.random()*1.4;giggle(T0.x,T0.z,T0.pause>0?1.3:0.9)}
  // caught: you are tickled, which slows you right down
  if(!P.down&&wofLive()&&!wofAway()&&!FX.frozen&&FX.curl!==1&&Math.hypot(T0.x-P.x,T0.z-P.z)<0.5){   // a curled hedgehog cannot be tickled
    if(FX.tickled<=0){say('Hee hee! He is tickling you! You can barely move.',2.5);giggle(P.x,P.z,1.1,1.5)}
    FX.tickled=FX_DUR.tickled;
  }
}

/* ---------- every frame ---------- */
function wofTick(dt){
  wofTickSpin(dt);
  if(!wofLive()){wofWasAway=false;if(FX.tin||FX.loud||TK||TS||FX.moon||FX.bob||FX.frozen||FX.pug||FX.rat||FX.plague||FX.fat||FX.pox||FX.dying)wofClear();return}
  const away=wofAway();
  if(away!==wofWasAway){wofWasAway=away;if(away){tints({});statusStrip([]);document.body.classList.remove('hedgehog');wofAudio()}else WOQ_T=Math.max(WOQ_T,1.5)}
  if(!away)for(const k of FX_TIMERS)if(FX[k]>0)FX[k]=Math.max(0,FX[k]-dt);   // the clocks wait outside the door
  tkTick(dt);tsTick(dt);rrTick(dt);bombTick(dt);
  if(!away)wofReplayTick(dt);
  // the hedgehog: hold Z (pad LB, touch CURL) to curl into a ball of spines, X (pad R3, touch ROLL) to roll
  FX.curl=!away&&FX.hedge>0&&!P.down&&!FX.frozen?((keys.KeyZ||pad.curl||touch.curl)?1:(keys.KeyX||pad.roll||touch.roll)?2:0):0;
  document.body.classList.toggle('hedgehog',FX.hedge>0&&!away);if(FX.hedge>0&&!away)hedgeButtons();
  if(FX.curl===1){P.inv=Math.max(P.inv,0.25);P.vx*=0.8;P.vz*=0.8}
  if(F&&!MP.guest){   // spines hurt: a shade that runs into a curled hedgehog recoils, stunned
    const balls=[];if(FX.curl===1)balls.push([P.x,P.z]);
    if(MP.on)for(const p of MP.peers.values())if(p.hedge&&p.curl===1&&p.d===R.depth&&mpDrawn(p))balls.push([p.x,p.z]);
    for(const b of balls)for(const s of F.shades)if(s.x>0&&!s.dead&&s.type!==3&&s.stun<=0&&(s.x-b[0])**2+(s.z-b[1])**2<0.6*0.6){s.stun=2.5;s.state=0;s.calm=6;sfx('spike')}
  }
  // the plague rat: anyone or anything that comes near starts to die, slowly
  const carriers=[];
  if(FX.plague>0&&!P.down&&!away)carriers.push([P.x,P.z]);
  if(MP.on)for(const p of MP.peers.values())if(p.form===3&&p.d===R.depth&&mpDrawn(p))carriers.push([p.x,p.z]);
  const near=(x,z,r)=>carriers.some(c=>(c[0]-x)**2+(c[1]-z)**2<r*r);
  if(F&&carriers.length){
    if(!FX.dying&&FX.plague<=0&&!P.down&&!away&&near(P.x,P.z,1.4)){FX.dying=true;FX.dyT=6;say('You caught the Black Plague. You are dying, slowly.',4);cough()}
    for(const n of F.npcs)if(!n.sick&&!n.fall&&near(n.x+(n.ox||0),n.z+(n.oz||0),1.4))n.sick=16;
    if(!MP.guest)for(const s of F.shades)if(!s.dead&&!s.sick&&s.x>0&&near(s.x,s.z,1.4))s.sick=10;
  }
  if(F){
    for(const n of F.npcs){
      if(n.sick>0&&!n.fall){n.sick-=dt;if(n.sick<=0){n.fall=0.001;n.lock=true;if(nearNpc===n)nearNpc=null;if(talk&&talk.npc===n)closeTalk();if(Math.hypot(n.x-P.x,n.z-P.z)<10)cough()}}
      else if(n.fall&&n.fall<1&&!n.knock)n.fall=Math.min(1,n.fall+dt*1.5);
    }
    if(!MP.guest)for(const s of F.shades)if(s.sick>0&&!s.dead){s.sick-=dt;if(s.sick<=0){s.dead=true;const close=Math.hypot(s.x-P.x,s.z-P.z)<10;banish(s,!close)}}
  }
  if(FX.dying){
    if(P.down){FX.dying=false}
    else if(FX.curl!==1&&!away){FX.dyT-=dt;if(FX.dyT<=0){FX.dyT=6;cough();P.ward=0;P.inv=0;hurt(null);if(state==='dead')return}}
  }
  // smallpox: stand next to someone who has it for a second and you have it too
  if(FX.pox<=0&&!P.down&&!away&&MP.on){
    let c=false;for(const p of MP.peers.values())if(p.pox&&p.d===R.depth&&mpDrawn(p)&&(p.x-P.x)**2+(p.z-P.z)**2<1.6*1.6){c=true;break}
    FX.poxNear=c?FX.poxNear+dt:Math.max(0,FX.poxNear-dt);
    if(FX.poxNear>1){FX.pox=FX_DUR.pox;FX.poxNear=0;FX.poxC=2;say('Smallpox. Someone breathed on you.',4)}
  }
  if(FX.pox>0&&!P.down&&!away){FX.poxC-=dt;if(FX.poxC<=0){FX.poxC=5+Math.random()*5;cough();FX.stag=0.8}}
  // what is on you right now
  const L=[],f=wofForm();
  if(f===4)L.push([FX.curl===1?'Hedgehog: curled up':FX.curl===2?'Hedgehog: rolling':(touch.on?'Hedgehog':'Hedgehog · Z curl · X roll'),FX.hedge]);
  else if(f)L.push([['','Pug','Rat','Plague rat'][f],f===3?FX.plague:f===2?FX.rat:FX.pug]);
  if(FX.fat>0)L.push(['+200 lbs',FX.fat]);
  if(FX.loud>0)L.push([FX.loudN>1?`Hearing aids x${FX.loudN} (${Math.pow(10,FX.loudN).toLocaleString()}x louder)`:'Hearing aids',FX.loud]);
  if(FX.tin>0)L.push(['Tinnitus',FX.tin]);
  if(FX.dying)L.push(['Dying of the plague',null]);
  if(FX.pox>0)L.push(['Smallpox',FX.pox]);
  if(FX.moon>0)L.push(['Moonwalk',FX.moon]);
  if(FX.bob>0)L.push(['Bobblehead',FX.bob]);
  if(FX.tickled>0)L.push(['Tickled',null]);
  if(TS)L.push(['Timeshare salesman about',null]);
  if(TK)L.push(['Tickle Monster loose',TK.t]);
  if(away)L.length=0;
  statusStrip(L);
  if(!away)tints({plague:FX.dying?0.9:FX.plague>0?0.45:0,tickle:FX.tickled>0?0.8:0,pox:FX.pox>0?0.55:0,fat:FX.fat>0?0.6:0});
  wofAudio();
}
function wofDraw(t,ex,ey,ez,dtR){
  const w=F&&F.safe&&F.safe.wheel,show=!!w&&state!=='title';
  if(!WOF.grp){if(!show)return;WOF.grp=wheelModel();scene.add(WOF.grp)}
  WOF.grp.visible=show;
  if(show){WOF.grp.position.set(w.x,0,w.z);WOF.grp.rotation.y=w.yaw;WOF.grp.scale.setScalar(WOF_SCALE);WOF.grp.userData.pose(WOF.here||WOF.done?WOF.angle:WOF.angle,WOF.flap,t,!WOF.done&&WOF.here?'spin':WOF.win>0?'win':'idle')}
  bombDraw(t);
  if(TS){const n=TS.n;n.x=TS.x;n.z=TS.z;n.yaw=TS.yaw;n.walk=TS.walk;n.mv=TS.mv;n.pitch=TS.pitching;buildNpc(n,t,ex,ey,ez,dtR)}
  if(TK){const n=TK.n;n.x=TK.x;n.z=TK.z;n.yaw=TK.yaw;n.walk=TK.walk;n.mv=TK.mv;n.gig=TK.gig;n.reach=TK.pause>0?1:0.7;buildNpc(n,t,ex,ey,ez,dtR)}
  // sickly green around everything that is dying
  if(F)for(const n of F.npcs)if(n.sick>0&&!n.fall){const y=0.5+Math.sin(t*2+n.ph)*0.1;spr(n.x+(n.ox||0),y,n.z+(n.oz||0),0.5,0.5,7,0.4,0.9,0.2,0.35,1)}
  if(F&&!MP.guest)for(const s of F.shades)if(s.sick>0&&!s.dead&&s.x>0)spr(s.x,0.6,s.z,0.7,0.7,7,0.4,0.9,0.2,0.4,1);
}
// pug, large rat or plague rat. self: the first-person body (no back of the head in the way, the muzzle hangs under the camera).
// Returns where the torch is held (in the mouth).
// the hedgehog: a spiny brown dome on a pale face with a long pointed snout. curl 1: a tight ball of spines (nothing can hurt you);
// curl 2: the same ball, rolling. self: the first-person view (snout and paws, or a ring of spines framing the view when curled).
const SPINES=(()=>{const L=[];for(let i=0;i<90;i++){const y=1-(i+0.5)/90*2,r=Math.sqrt(1-y*y),a=i*2.39996;L.push([Math.cos(a)*r,y,Math.sin(a)*r])}return L})();
function buildHedgehog(p,t,self){
  const curl=p.curl||0,mv=Math.min(1,(p.spd||0)/2.7),w=p.walk||0,sw=Math.sin(w*1.4)*mv;
  const spine=[0.36,0.26,0.17,5],tip=[0.86,0.8,0.66,5],belly=[0.82,0.7,0.54,5],black=[0.04,0.03,0.03,8],skinP=[0.86,0.66,0.6,1],wood=[0.36,0.23,0.12,6];
  const B={p:[p.rx,Math.max(0,p.ry||0),p.rz],R:rYaw(p.ryaw)};
  if(self){
    const H={p:[p.rx,Math.min(CAM_TOP,EYE*wofEye()+(p.ry||0)),p.rz],R:m3(rYaw(p.ryaw),rZ(clamp(p.rpitch||0,-0.9,0.9)))};
    if(curl){ // tucked in: your own spines bristle round the edges of the view, and spin when you roll
      const spin=curl===2?(p.walk||0)*2.2:Math.sin(t*20)*0.03;
      for(let i=0;i<28;i++){const a=i/28*Math.PI*2+spin,c=Math.cos(a),s=Math.sin(a),r0=0.2,r1=0.12+0.02*((i*7)%3);
        seg(H,[0.16,s*r0*0.75,c*r0],[0.19,s*r1*0.75,c*r1],0.008,0.001,i%3?spine:tip)}
      return {torch:fpt(H,[0.22,-0.1,0.12])};
    }
    const Hk={p:fpt(H,[0.04,-0.05,0]),R:H.R};
    seg(Hk,[0.03,-0.01,0],[0.17,-0.035,0],0.04,0.012,belly);ball(Hk,[0.175,-0.035,0],0.014,black,true);       // the snout
    for(const z of[-1,1]){const st=sw*z;seg(B,[0.2,0.1,z*0.06],[0.21+0.05*st,0.01,z*0.065],0.022,0.018,belly);ball(B,[0.22+0.05*st,0.012,z*0.065],[0.02,0.01,0.018],skinP,true)}
    const tp=[0.2,-0.07,0.12];seg(Hk,[0.12,-0.05,0.02],tp,0.006,0.008,wood);return {torch:fpt(Hk,[tp[0],tp[1]+0.015,tp[2]])};
  }
  if(curl){ // a tight ball, spines out; rolling turns it over and over
    const r=0.15,roll=curl===2?-(p.walk||0)*2.2:0,shiver=curl===1?Math.sin(t*30)*0.004:0;
    const C={p:fpt(B,[0,r+0.01+shiver,0]),R:m3(B.R,rZ(roll))};
    ball(C,[0,0,0],r,spine);
    for(let i=0;i<SPINES.length;i++){const d=SPINES[i];seg(C,[d[0]*r*0.9,d[1]*r*0.9,d[2]*r*0.9],[d[0]*(r+0.075),d[1]*(r+0.075),d[2]*(r+0.075)],0.014,0.002,i%3?spine:tip)}
    if(curl===1)ball(C,[0.13,-0.06,0],0.014,black,true);                                                      // a nose poking out
    return {torch:fpt(B,[0.1,0.33,0.1])};
  }
  const bob=Math.abs(Math.cos(w*1.4))*0.01*mv,U={p:fpt(B,[0,bob,0]),R:B.R};
  ball(U,[0.02,0.12,0],[0.2,0.1,0.14],belly);                                                                    // pale underside
  ball(U,[-0.01,0.16,0],[0.2,0.13,0.15],spine);                                                                  // the spiny back
  for(let i=0;i<SPINES.length;i++){const d=SPINES[i];if(d[1]<-0.05||d[0]>0.75)continue;
    const c=[-0.01+d[0]*0.18,0.16+d[1]*0.11,d[2]*0.135],e=[-0.01+d[0]*0.26-0.05,0.16+d[1]*0.18+0.02,d[2]*0.2];
    seg(U,c,e,0.013,0.002,i%3?spine:tip)}
  for(const [x,z] of[[0.11,1],[0.11,-1],[-0.1,1],[-0.1,-1]]){const st=(x>0?sw:-sw)*(z>0?1:-1);
    seg(U,[x,0.08,z*0.07],[x+0.05*st,0.01,z*0.075],0.022,0.018,belly);ball(U,[x+0.05*st+0.01,0.012,z*0.075],[0.022,0.01,0.018],skinP,true)}
  const H=subF(U,[0.17,0.13,0],rZ(clamp(p.rpitch||0,-0.5,0.5)*0.5));
  ball(H,[0,0,0],[0.075,0.07,0.075],belly);
  seg(H,[0.04,-0.01,0],[0.13,-0.03,0],0.04,0.012,belly);ball(H,[0.135,-0.03,0],0.014,black,true);              // the pointed snout
  for(const z of[-1,1]){ball(H,[0.045,0.025,z*0.042],0.013,black,true);ball(H,[-0.01,0.06,z*0.05],[0.014,0.02,0.012],skinP,true)}
  const ta=[0.11,-0.04,-0.07],tb=[0.13,0.05,0.11];seg(H,ta,tb,0.008,0.01,wood);                                 // the torch, in its mouth
  return {torch:fpt(H,[tb[0],tb[1]+0.02,tb[2]])};
}
function buildCritter(p,t,form,self){
  if(form===4)return buildHedgehog(p,t,self);
  const pug=form===1,K=pug?1:1.3,mv=Math.min(1,(p.spd||0)/2.7),w=p.walk||0,sw=Math.sin(w*1.2)*mv;
  const fur=pug?[0.84,0.68,0.46,5]:form===3?[0.2,0.18,0.15,5]:[0.48,0.46,0.44,5],furD=pug?[0.7,0.54,0.34,5]:form===3?[0.13,0.12,0.1,5]:[0.36,0.34,0.33,5];
  const black=[0.06,0.05,0.05,5],pink=[0.92,0.6,0.62,1],eyeC=form===3?[2.4,0.2,0.1,7]:[0.03,0.02,0.02,8],wood=[0.36,0.23,0.12,6];
  const bob=Math.abs(Math.cos(w*1.2))*0.012*mv;
  const B={p:[p.rx,Math.max(0,p.ry||0)+bob,p.rz],R:rYaw(p.ryaw)},v=(x,y,z)=>[x*K,y*K,z*K];
  const fat=p.fat?1.35:1;
  if(!self){ball(B,v(0,0.2,0),[0.19*K,0.12*K*fat,0.12*K*fat],fur);ball(B,v(0.1,0.21,0),[0.1*K,0.12*K,0.11*K*fat],pug?furD:fur)}
  for(const [x,z] of self?[[0.2,1],[0.2,-1]]:[[0.12,1],[0.12,-1],[-0.12,1],[-0.12,-1]]){const st=(x>0?sw:-sw)*(z>0?1:-1);
    seg(B,v(x,0.16,z*0.075),v(x+0.06*st,0.02,z*0.08),0.035*K,0.03*K,fur);ball(B,v(x+0.06*st+0.01,0.018,z*0.08),[0.03*K,0.016*K,0.026*K],pug?furD:pink,true)}
  if(self){}
  else if(pug){ball(B,v(-0.19,0.3,0),0.032*K,fur,true);ball(B,v(-0.16,0.34,0.02),0.028*K,fur,true);ball(B,v(-0.13,0.33,-0.01),0.024*K,furD,true)}   // curly tail
  else{let pr=v(-0.18,0.18,0);for(let k=1;k<=6;k++){const q=v(-0.18-k*0.06,0.18-k*0.022,Math.sin(t*3+k*0.8)*0.025*k);seg(B,pr,q,(0.02-k*0.0025)*K,(0.02-(k+1)*0.0025)*K,pink);pr=q}}
  if(p.pox&&!self)for(let i=0;i<6;i++)ball(B,v(((i*37)%30-15)*0.01,0.26+((i*13)%7)*0.006,((i*23)%20-10)*0.01),0.012*K,[0.8,0.12,0.1,1],true);
  // head: on the player it follows the camera so the muzzle stays at the bottom of the view
  const H=self?{p:[p.rx,Math.min(CAM_TOP,EYE*wofEye()+(p.ry||0)),p.rz],R:m3(rYaw(p.ryaw),rZ(clamp(p.rpitch||0,-0.9,0.9)))}
                 :subF(B,v(0.2,0.29,0),rZ(clamp(p.rpitch||0,-0.5,0.5)*0.6));
  const Hk=self?{p:fpt(H,[0.04*K,-0.05*K,0]),R:H.R}:H;
  if(pug){
    if(!self){ball(Hk,[0,0,0],[0.11*K,0.1*K,0.12*K],fur);for(const z of[-1,1]){ball(Hk,[0.07*K,0.03*K,z*0.05*K],0.027*K,[0.95,0.95,0.92,8],true);ball(Hk,[0.09*K,0.03*K,z*0.05*K],0.016*K,eyeC,true)}}
    if(!self)for(const z of[-1,1])ball(Hk,[0.0,0.08*K,z*0.1*K],[0.03*K,0.05*K,0.02*K],black,true);                          // ears
    ball(Hk,[0.1*K,-0.03*K,0],[0.05*K,0.045*K,0.07*K],black);                                                    // the flat black muzzle
    ball(Hk,[0.135*K,-0.01*K,0],[0.012*K,0.012*K,0.02*K],[0.02,0.02,0.02,8],true);
    slab(Hk,[0.12*K,-0.075*K,0.01*K],[0.012*K,0.025*K,0.016*K],pink);                                           // tongue
  }else{
    if(!self){ball(Hk,[0,0,0],[0.09*K,0.08*K,0.085*K],fur);for(const z of[-1,1])ball(Hk,[0.05*K,0.03*K,z*0.045*K],0.014*K,eyeC,true)}
    if(!self)for(const z of[-1,1])ball(Hk,[-0.02*K,0.07*K,z*0.07*K],[0.012*K,0.04*K,0.035*K],pink,true);                 // round ears
    seg(Hk,[0.05*K,-0.01*K,0],[0.17*K,-0.04*K,0],0.05*K,0.02*K,furD);ball(Hk,[0.175*K,-0.04*K,0],0.016*K,pink,true);  // snout and nose
    for(const z of[-1,1])for(const a of[-0.4,0,0.4])seg(Hk,[0.16*K,-0.035*K,z*0.012*K],[0.15*K,(-0.035+a*0.05)*K,z*0.13*K],0.002*K,0.001*K,[0.9,0.9,0.85,5]);  // whiskers
    for(const z of[-1,1])slab(Hk,[0.16*K,-0.065*K,z*0.006*K],[0.006*K,0.014*K,0.005*K],[0.96,0.9,0.6,5]);        // front teeth
  }
  // the torch, carried in the mouth
  const ta=[0.1*K,-0.05*K,-0.09*K],tb=[0.13*K,0.04*K,0.13*K];
  if(self){const tp=[0.2*K,-0.06*K,0.12*K];seg(Hk,[0.11*K,-0.06*K,0.02*K],tp,0.006,0.008,wood);return {torch:fpt(Hk,[tp[0],tp[1]+0.015,tp[2]])}}
  seg(Hk,ta,tb,0.008,0.01,wood);
  return {torch:fpt(Hk,[tb[0],tb[1]+0.02,tb[2]])};
}
/* ---------- loading transitions ---------- */
let loading=null;
function showLoading(title,stages){
  $('loadingTitle').textContent=title;
  $('loadingPhase').textContent=stages[0][0];
  $('loadingBar').value=0;
  $('loading').hidden=false;
  loading={stages,index:0,at:performance.now()+100};
}
function closeLoading(){
  loading=null;
  $('loading').hidden=true;
}
function advanceLoading(now){
  if(!loading||now<loading.at)return;
  const transition=loading,{stages,index}=transition;
  if(index===stages.length){closeLoading();return}
  try{stages[index][1]()}catch(error){
    closeLoading();
    roomLeave();
    if(state==='trans')state='play';
    $('fade').style.opacity=0;
    console.error('Could not load the new area',error);
    say('Could not load the new area.',4);
    return;
  }
  if(loading!==transition)return;
  transition.index++;
  transition.at=performance.now()+120;
  $('loadingBar').value=100*transition.index/stages.length;
  $('loadingPhase').textContent=stages[transition.index]?.[0]||'Ready';
}
/* ---------- strange doors (the rooms themselves are in src/rooms.js) ---------- */
let nearDoor=null;
const ROOMS=createRooms(renderer,{post:POST,low:Q===0,ao:Q>=2,
  say:(t,s)=>say(t,s),tone:(...a)=>tone(...a),noise:(...a)=>noise(...a),rumble:(...a)=>rumble(...a),
  hud:h=>{const el=$('roomHud');if(el.innerHTML!==h)el.innerHTML=h},
  hurtFx:()=>{const h=$('hurt');h.style.transition='none';h.style.opacity=1;requestAnimationFrame(()=>{h.style.transition='opacity .9s';h.style.opacity=0})},
  audio:()=>{initAudio();return ac?{ac,master,noise:noiseBuf}:null},
  // one blow from the room: true when it would be the killing one (the caller then ends the room with a death), otherwise it costs a heart as any creature's hit does
  damage:()=>{if(!P.ward&&P.hp<=1&&!(up.wind&&!R.wind))return true;hurt(null);return false},
  hearts:()=>'♥'.repeat(Math.max(0,P.hp))+'<span style="opacity:.4">'+'♥'.repeat(Math.max(0,maxHp()-P.hp))+'</span>',
  gems:n=>{wallet+=n;R.gems+=n;store.set('wallet',wallet)},sfx:n=>sfx(n),
  mooseSpikes:()=>P.spikeTraps,useMooseSpike:()=>{if(P.spikeTraps<1)return false;P.spikeTraps--;return true},
  mooseGems:()=>previewStamina?.mooseGems??wallet,
  mooseTableFocus:on=>{
    document.body.classList.toggle('moose-table',on);mouseL=false;
    if(on){
      mooseWalkLock=document.pointerLockElement===canvas;
      if(mooseWalkLock){usingLock=false;document.exitPointerLock()}
    }else if(mooseWalkLock&&!touch.on&&!pad.id)lock();
  },
  spendMooseGems:n=>{
    if(previewStamina){
      if(previewStamina.mooseGems<n)return false;
      previewStamina.mooseGems-=n;
    }else{
      if(wallet<n)return false;
      wallet-=n;store.set('wallet',wallet);
    }
    return true;
  },
  rewardMooseGems:n=>{if(previewStamina)previewStamina.mooseGems+=n;else{wallet+=n;R.gems+=n;store.set('wallet',wallet)}},
  sta:P,speedMul:()=>moveMul(),lungs:()=>up.lungs|0,   // rooms share the player's stamina and the boots / cold modifiers
  mob:(id,seed)=>rememberRoomMob(id,seed),

  control:roomControl,
  inputDevice:roomInputDevice,
  hint:k=>{
    const device=roomInputDevice(),press=roomControl('press');
    if(k==='monoliths')return 'Follow the path and walk through the doorway';
    if(k==='galaxy')return roomControl('look');
    if(k==='mirror')return device==='touch'?'Tap an option':roomControl('navigateHorizontal')+' choose · '+press+' confirm';
    if(k==='mpick'||k==='mspray'||k==='muse')return device==='touch'?'Tap '+(k==='mpick'?'Pick up':k==='mspray'?'Spray':'Use'):device==='controller'?press:press+' or click';
    return device==='touch'?'Tap a console button or aim and tap Use':'Aim at a console button and press '+press+(device==='keyboard'?' or click':'');
  }});
// a fallen player rides along with the friend they follow, into that friend's strange door too
let RW=null,rvT=0;const NOIN={mx:0,my:0,press:0,lx:0,ly:0};let mouseL=false,mooseRelock=false,mooseWalkLock=false;
function roomWatch(showProgress=true){
  const f=MP.on&&P.down&&(state==='play'||state==='pause')?MP.peers.get(MP.follow):null,rv=f&&f.away&&f.d===R.depth&&f.rv&&f.rv.d===R.depth&&performance.now()-f.rv.at<2000?f.rv:null;
  if(rv){
    if(!ROOMS.watching||!RW||RW.id!==f.id||RW.w!==rv.w){
      if(showProgress){
        showLoading('Entering room',[['Preparing the spectator view',()=>roomWatch(false)]]);
        return;
      }
      ROOMS.watch(rv.w,rv.q);RW={id:f.id,w:rv.w};document.body.classList.add('rwatch');$('fade').style.transition='none';
    }
    const nm=f.name.replace(/[<>&"']/g,''),lb=`Watching ${nm} · ${DOOR_KINDS[rv.w]?.name||'a strange door'}`+(mpAlive().length>1?' · E to switch':'');
    ROOMS.label=lb;if(rv.w!=='kiln'){const el=$('roomHud'),h=`<small>${lb}</small>`;if(el.innerHTML!==h)el.innerHTML=h}
  }else if(RW||ROOMS.watching){
    if(ROOMS.watching)ROOMS.abort();
    RW=null;document.body.classList.remove('rwatch');
    if(state!=='room'){$('fade').style.transition='opacity .4s';$('fade').style.opacity=0}
  }
}
function sdoorOpen(D,showProgress=false){
  if(loading||state!=='play'||D.used||P.down||P.grab)return;
  D.used=true;nearDoor=null;clearPrompt();RW=null;document.body.classList.remove('rwatch');
  mpSend({k:'sd',d:R.depth,i:F.sdoors.indexOf(D),w:D.kind});
  sfx('door');
  const seed=hashStr(R.seed+'#theater'+R.depth+','+D.tx+','+D.ty);
  remember('doors',D.kind,{seed,depth:R.depth,look:doorLookOf(D),tx:D.tx,ty:D.ty,ph:D.ph,stone:F.stone.slice()});
  if(!showProgress)buildStatic(F);
  beginRoom(D.kind,roomEnd,seed,showProgress);
}
function beginRoom(kind,onEnd,seed,showProgress=false){
  const door=DOOR_KINDS[kind]||{};
  state='room';P.away=true;P.vx=P.vz=0;mapBig=false;
  document.body.classList.add('inroom');
  document.body.classList.toggle('room-look-only',door.mode==='look');
  document.body.classList.toggle('room-cinematic',door.mode==='none');
  document.body.classList.toggle('room-no-use',door.touchUse===false);
  if(door.css)document.body.classList.add(door.css);
  if(kind==='moose')mooseRelock=document.pointerLockElement===canvas;
  $('tFlash').textContent=door.action||'USE';$('tJump').textContent='JUMP';
  $('fade').style.transition='none';$('fade').style.opacity=1;
  if(showProgress)showLoading('Entering room',[
    ['Opening the strange door',()=>buildStatic(F)],
    ['Preparing the room',()=>ROOMS.start(kind,onEnd,seed)]
  ]);
  else ROOMS.start(kind,onEnd,seed);
}
let previewStamina=null;
function previewRoom(kind,seed=7){
  if(!Object.hasOwn(DOOR_KINDS,kind)||MP.on||P.down||P.grab)return false;
  if(previewStamina)roomLeave();
  if(state!=='play')return false;
  previewStamina={stam:P.stam,winded:P.winded,spikeTraps:P.spikeTraps,mooseGems:wallet};
  clearPrompt();
  beginRoom(kind,roomClose,seed);
  return true;
}
// leave whatever room we are in without its ending, because the floor itself is changing
function roomLeave(){
  if(state!=='room')return;
  ROOMS.abort();roomClose();
}
function roomClose(){
  if(previewStamina){
    const {stam,winded,spikeTraps}=previewStamina;
    Object.assign(P,{stam,winded,spikeTraps});previewStamina=null;
  }
  roomPauseHide(false);
  P.away=false;state='play';document.body.classList.remove('inroom','moose-table','room-look-only','room-cinematic','room-no-use','room-choice',...Object.values(DOOR_KINDS).flatMap(door=>door.css?[door.css]:[]));mouseL=false;ROOMS.untap();
  $('tFlash').textContent='FLASH';
  $('fade').style.transition='opacity .4s';$('fade').style.opacity=0;
  if(mooseRelock){mooseRelock=false;if(!touch.on)lock()}
}
/* ---------- burning eyes: after the mirror, for the rest of that floor, the creatures show through a wall or around a corner ---------- */
const XR={list:[],t:0,pool:null};
const xrayOn=()=>R.xray>0&&R.xray===R.depth&&!!F;
// how many wall cells the straight line between two points passes through (a grid walk), not counting the cell you stand in or the one it stands in
function wallsBetween(x0,z0,x1,z1){
  let tx=Math.floor(x0),ty=Math.floor(z0);const ex=Math.floor(x1),ey=Math.floor(z1),dx=x1-x0,dz=z1-z0,sx=dx>0?1:-1,sz=dz>0?1:-1,ax=dx===0?1e9:Math.abs(1/dx),az=dz===0?1e9:Math.abs(1/dz);
  let mx=dx===0?1e9:(dx>0?tx+1-x0:x0-tx)*ax,mz=dz===0?1e9:(dz>0?ty+1-z0:z0-ty)*az,n=0,g=0;
  while((tx!==ex||ty!==ey)&&g++<80){if(mx<mz){tx+=sx;mx+=ax}else{ty+=sz;mz+=az}if((tx!==ex||ty!==ey)&&solidAt(tx+0.5,ty+0.5))n++}
  return n;
}
// every hostile thing within about 12 tiles that you cannot see straight on, but that has at most one wall in the way or is six steps away round a corner
function xrayTick(dt){
  XR.t-=dt;if(XR.t>0)return;XR.t=0.1;XR.list.length=0;
  if(!xrayOn()||state==='title'||P.down)return;
  const c=[];for(const s of F.shades)if(s.x>0)c.push([s.x,s.z,s.type]);
  if(MP.on&&MIM.st!==0&&MIM.rx>0)c.push([MIM.rx,MIM.rz,9]);
  for(const m of c){
    const d=Math.hypot(m[0]-P.x,m[1]-P.z);if(d>12||d<0.6||los(P.x,P.z,m[0],m[1]))continue;
    const tx=Math.floor(m[0]),ty=Math.floor(m[1]),ds=F.dist&&tx>=0&&ty>=0&&tx<F.W&&ty<F.H?F.dist[ty*F.W+tx]:-1;
    if(wallsBetween(P.x,P.z,m[0],m[1])<=1||(ds>=0&&ds<=6))XR.list.push({x:m[0],z:m[1],t:m[2],d});
  }
}
// drawn as a glowing figure that ignores depth, so a wall does not hide it
function xrayDraw(t){
  if(!XR.pool){
    const cv=document.createElement('canvas');cv.width=64;cv.height=128;const g=cv.getContext('2d');
    const gr=g.createLinearGradient(0,10,0,124);gr.addColorStop(0,'rgba(255,70,20,0.5)');gr.addColorStop(1,'rgba(255,40,10,0.14)');
    g.shadowColor='rgba(255,90,20,1)';g.shadowBlur=14;g.fillStyle=gr;g.strokeStyle='rgba(255,120,45,0.7)';g.lineWidth=2;
    g.beginPath();g.ellipse(32,25,11,13,0,0,7);g.fill();g.stroke();g.beginPath();g.moveTo(12,56);g.quadraticCurveTo(32,34,52,56);g.quadraticCurveTo(48,90,45,122);g.lineTo(19,122);g.quadraticCurveTo(16,90,12,56);g.closePath();g.fill();g.stroke();
    g.shadowBlur=0;g.fillStyle='rgba(255,210,120,0.95)';g.fillRect(26,22,3,4);g.fillRect(36,22,3,4);
    const tex=new THREE.CanvasTexture(cv);XR.pool=[];
    for(let i=0;i<16;i++){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false}));sp.renderOrder=999;sp.visible=false;sp.frustumCulled=false;scene.add(sp);XR.pool.push(sp)}
  }
  const on=xrayOn()&&state!=='title';
  for(let i=0;i<XR.pool.length;i++){const sp=XR.pool[i],m=on&&XR.list[i];
    if(!m){sp.visible=false;continue}
    sp.visible=true;sp.position.set(m.x,0.95,m.z);sp.scale.set(m.t===1?1.0:0.9,m.t===1?2.3:1.9,1);sp.material.opacity=0.5+0.25*Math.sin(t*3.2+i*1.7)}
}
function roomEnd(res){
  const fall=res.k==='dead'&&res.why==='fall';
  if(res.k==='warp'){
    const n=1+(Math.random()*3|0);
    P.away=false;document.body.classList.remove('inroom','room-look-only');
    mpSend({k:'warp',d:R.depth+n});mpSys(myName()+' was thrown '+n+(n>1?' floors':' floor')+' down by a collapsing star, and took everyone along');
    descend(n,'The black hole throws you '+n+(n>1?' floors':' floor')+' down');
    return;
  }
  roomClose();
  if(res.why==='moose'){
    const win=res.k==='win',id=win?'mooseWin':'mooseLose',entry=MOOSE_ACH[id];
    if(!res.beforePlay)achieve(id,entry.title,entry.desc);
    if(win){
      P.moose=true;sfx('shard');
      if(res.drone){activateScout();say('Turbo 6000 G is scouting and marking creatures on this floor.',6)}
      else say(touch.on?'Zombie moose earned · RIDE to mount · LURE to sacrifice':'Zombie moose earned · R or D-pad up to ride · G or D-pad down to sacrifice',6);
    }
    else say(res.forfeited?'You forfeited Mosquito Outpost and returned to the maze.':'The moose got through. You return to the maze.',3);
    return;
  }
  if(res.k==='maze-exit'){
    P.x=F.exit.x;P.z=F.exit.z;P.y=0;P.vx=P.vy=P.vz=0;P.pitch=0;
    onTileChange();sfx('noclip');
    return;
  }
  if(res.why==='hamlet'){
    if(res.k==='win'){
      achieve('hamlet','Limb from limb','Cut the night thing apart with an obsidian-glass sword');
      say('You step back through. The village keeps the dark.',3.5);
      sfx('door');
    }else if(res.k==='dead'){
      mpSend({k:'sdr',r:'hamlet'});mpSys(myName()+' was taken by the thing in the village');
      P.hp=0;$('deadTitle').textContent='THE NIGHT TAKES YOU';die();
    }else{
      say('You leave the village with the sun behind you.',3);
      sfx('door');
    }
    return;
  }
  if(res.why==='stillwood'){
    achieve('stillwood','Held in the water','Saw the door behind you in a still pond, and walked back out');
    say('You step back through. The wood does not follow.',3.5);
    sfx('door');
    return;
  }
  if(res.why==='theater'){
    if(res.k==='win'){
      R.score+=60*R.depth;P.inv=2;R.guide=R.depth;GD.have=false;GD.key='';sfx('shard');
      achieve('knowledge','Knowledge is power','Silenced the peasants of the picture house');
      say('A light shines at the end of the tunnel. It will guide you for the rest of this floor.',5);
      mpSend({k:'sdr',r:'theater'});mpSys(myName()+' silenced the picture house');
    }else if(res.k==='leave')say('You slip back out. The door swings shut behind you.',3);
    else{
      mpSend({k:'sdr',r:'theater-dead'});mpSys(myName()+' was roasted to death by teenagers');
      P.hp=0;$('deadTitle').textContent='YOU ARE COOKED';die();
      if(MP.on)say('The picture house was merciless. Your friends can still bring you back on the next floor.',5);
    }
    return;
  }
  if(res.k==='win'&&res.why==='mirror'){
    const g=2+R.depth;wallet+=g;R.gems+=g;R.score+=40*R.depth;store.set('wallet',wallet);
    R.xray=R.depth;XR.t=0;say('You got lucky son.',4.5);sfx('shard');setTimeout(()=>{if(R.xray>0&&R.xray===R.depth&&state==='play')say('Your eyes still burn. Something about the dark looks thinner.',4.5)},4700);
    mpSend({k:'sdr',r:'lucky'});mpSys(myName()+' hid behind a mirror and got lucky');
    return;
  }
  if(res.k==='win'){
    R.score+=80*R.depth;P.pick++;P.inv=2;
    say('The kiln lets you go. It leaves you a pickaxe: one swing, one wall.',5);sfx('shard');
    mpSend({k:'sdr',r:'esc'});mpSys(myName()+' beat the glass kiln');
    return;
  }
  const mir=res.why==='mirror';
  mpSend({k:'sdr',r:mir?'mirror':fall?'fall':'kiln'});mpSys(myName()+(mir?' was eaten by the thing behind the mirror':fall?' opened a door and fell to their death':' was buried in the glass kiln'));
  P.hp=0;
  $('deadTitle').textContent=mir?'IT SAW YOU LOOKING':fall?'THE PIT TAKES YOU':'THE KILN KEEPS YOU';
  die();
  if(MP.on)say(mir?'The glass gave way. Your friends can still bring you back on the next floor.':fall?'There was no floor. Your friends can still bring you back on the next floor.':'The kiln filled up. Your friends can still bring you back on the next floor.',5);
}
// the mirror room's touch buttons say nothing about the can until you are looking at it or holding it
function mirrorBtns(){
  if(ROOMS.kind!=='mirror')return;
  document.body.classList.toggle('room-choice',ROOMS.controlMode()==='choice');
  const action=ROOMS.state()?.touchAction;
  if(action)setText('tFlash',action);
}
let roomDevice='';
function roomInputDevice(){
  if(roomDevice&&!(roomDevice==='controller'&&!pad.id))return roomDevice;
  return pad.id?'controller':touch.on?'touch':'keyboard';
}
function roomControl(action){return roomControlLabel(action,roomInputDevice())}
function roomInput(){
  const mode=state==='room'?ROOMS.controlMode():'walk',table=mode==='table',choice=mode==='choice';
  const ax=(a,b)=>(a?1:0)-(b?1:0);
  const actions=roomActions(keys,pad.roomButtons,{mode,mouse:mouseL,touchPress:touch.act,touchJump:touch.jump});
  return {...actions,
    mx:clamp(ax(keys.KeyD,keys.KeyA)+pad.mx+touch.mx,-1,1),
    my:clamp(ax(keys.KeyS||keys.ArrowDown&&!choice&&!table,keys.KeyW||keys.ArrowUp&&!choice&&!table)+pad.my+touch.my,-1,1),
    press:actions.press||(state==='title'&&!!keys.Enter)||(state==='room'&&ROOMS.kind==='theater'&&!!keys.KeyV),
    sprint:actions.sprint||Math.hypot(touch.mx,touch.my)>0.94,
    lx:(choice||table?0:ax(keys.ArrowRight,keys.ArrowLeft))+pad.lx*MOVE.padTurn,
    ly:pad.ly};
}
let doorMsgT=0, tipTimers=[];
let mapBig=false, usingLock=false, pausedAt=0, flashT=0, sealMsgT=0, lowFuelSaid=false, pingT=0, beatT=0;
let sens=store.get('sens',1);
$('sens').value=sens;
$('sens').addEventListener('input',e=>{sens=+e.target.value;store.set('sens',sens);document.querySelectorAll('.sensP').forEach(o=>o.value=sens)});
document.querySelectorAll('.sensP').forEach(el=>{el.value=sens;el.addEventListener('input',()=>{sens=+el.value;store.set('sens',sens);$('sens').value=sens;document.querySelectorAll('.sensP').forEach(o=>o.value=sens)})});
$('startSel').addEventListener('change',e=>store.set('startDepth',+e.target.value));
let bright=clamp(+store.get('bright',1.3)||1.3,0.6,3);
function setBright(v,quiet){bright=clamp(v,0.6,3);store.set('bright',bright);document.querySelectorAll('.brightS').forEach(el=>el.value=bright);if(!quiet)say('Brightness '+Math.round(bright/1.3*100)+'%',1)}
document.querySelectorAll('.brightS').forEach(el=>{el.value=bright;el.addEventListener('input',e=>setBright(+e.target.value,true))});
$('qSel').value=QSET;
$('qSel').addEventListener('change',e=>{lsSet('quality',e.target.value);lsSet('safe',0);location.reload()});
// the pause-panel copies save the same way but never reload: that would throw the run away
const gfxNote=()=>document.querySelector('#pause .gfxNote').classList.remove('hidden');
document.querySelectorAll('.qSelP').forEach(el=>{el.value=QSET;el.addEventListener('change',()=>{lsSet('quality',el.value);lsSet('safe',0);$('qSel').value=el.value;document.querySelectorAll('.qSelP').forEach(o=>o.value=el.value);gfxNote()})});
document.querySelectorAll('.gtxP').forEach(el=>{el.checked=WANT_GTX;el.addEventListener('change',()=>{lsSet('gtx',el.checked);lsSet('safe',0);$('gtx').checked=el.checked;document.querySelectorAll('.gtxP').forEach(o=>o.checked=el.checked);gfxNote()})});
$('gtx').checked=WANT_GTX;
$('gtx').addEventListener('change',e=>{lsSet('gtx',e.target.checked);lsSet('safe',0);location.reload()});

function solidAt(x,z){const tx=Math.floor(x),ty=Math.floor(z);return tx<0||ty<0||tx>=F.W||ty>=F.H||(F.g[ty*F.W+tx]&3)===1||F.g[ty*F.W+tx]===2}
let panelLvl=1;
function torchRadius(fu){if(fu===undefined)fu=state==='title'?100:P.fuel;return (1.6+6.0*Math.sqrt(Math.max(0,fu)/100))*(F.dark?0.5:1)*(F.back?0.45:1)}
function blocked(x,z){return solidAt(x-PR,z-PR)||solidAt(x+PR,z-PR)||solidAt(x-PR,z+PR)||solidAt(x+PR,z+PR)}
function mazeCell(x,z){
  if(!F||x<0||z<0||x>=F.W||z>=F.H)return 2;
  if(F.door&&F.door.tx===x&&F.door.ty===z)return 2;
  const g=F.g[z*F.W+x];
  if(g===2)return 2;
  if((g&3)===1)return 1;
  return 0;
}
function los(x0,z0,x1,z1){
  const dx=x1-x0,dz=z1-z0,l=Math.hypot(dx,dz),n=Math.ceil(l/0.2);
  for(let i=1;i<n;i++){const t=i/n;if(solidAt(x0+dx*t,z0+dz*t))return false}
  return true;
}
function loadFloor(depth,look){
  installFloor(depth,genFloor(R.seed,depth,look));
}
function installFloor(depth,nextFloor,prepared=false){
  R.depth=depth;
  if(!archiveRun&&depth>deepest&&!(URL_DEPTH&&depth===R.startDepth)){deepest=depth;store.set('deepest',deepest)}
  if(F?.npcs)for(const npc of F.npcs)disposeGpuRig(npc);
  R.xray=0;R.guide=0;GD.have=false;GD.key='';F=nextFloor;TK=null;WOF.here=false;panelLvl=1;P.grab=null;clearMooseLures();mimicReset();
  if(!prepared){buildMesh(F);buildStatic(F);buildSdf(F)}
  sweepWorld();if(F.npcs&&F.npcs.some(q=>q.type==='keeper'))keeperWarm();
  P.x=F.start.tx+0.5;P.z=F.start.ty+0.5;P.yaw=F.start.yaw;P.pitch=0;P.shards=0;P.tx=-1;P.ty=-1;
  P.y=0;P.vy=0;P.vx=0;P.vz=0;P.keys=0;P.jumpQ=0;P.inSafe=false;P.unseen=false;nearNpc=nearDoor=null;
  sealMsgT=0;doorMsgT=0;
  onTileChange();
  pkReapply();
  if(MP.guest&&MP.hostId)mpSend({k:'pkq',d:depth},MP.hostId);
  glReset();
}
function onTileChange(){
  P.tx=Math.floor(P.x);P.ty=Math.floor(P.z);
  F.dist=bfs(F.g,F.W,F.H,P.tx,P.ty);
  if(F.pocketMask[P.ty*F.W+P.tx]){const q=F.pockets.find(q=>q.tx===P.tx&&q.ty===P.ty);
    if(q&&!q.found){q.found=true;if(state==='play')sfx('noclip')}}
  const rad=F.dark?2:5;
  for(let y=P.ty-rad;y<=P.ty+rad;y++)for(let x=P.tx-rad;x<=P.tx+rad;x++){
    if(x<0||y<0||x>=F.W||y>=F.H)continue;
    const i=y*F.W+x;
    if(F.g[i]===1||F.g[i]===2||F.seen[i]||(F.pocketMask[i]&&i!==P.ty*F.W+P.tx))continue;
    if(los(P.x,P.z,x+0.5,y+0.5))F.seen[i]=1;
  }
}
// ?depth=N lets a new run begin at any depth from 1 to 40 without touching the saved record
const URL_DEPTH=(()=>{const d=+new URLSearchParams(location.search).get('depth');return d>=1&&d<=40?Math.floor(d):0})();
let deepest=Math.max(1,+store.get('deepest',1)||1,+((store.get('best',null)||{}).depth)||1);
function fillStartSel(){
  const sel=$('startSel'),want=clamp(+store.get('startDepth',1)||1,1,deepest);
  sel.innerHTML='';
  for(let d=1;d<=deepest;d++){const o=document.createElement('option');o.value=d;
    o.textContent='Depth '+d+(d===deepest&&d>1?' (deepest reached)':'');sel.appendChild(o)}
  sel.value=want;$('depthLbl').hidden=deepest<2;
}
const floorTag=()=>F.name+(F.variant.ix?` (${F.variant.name})`:'');
function loadFloorWithProgress(title,seed,depth,enter){
  let nextFloor;
  showLoading(title,[
    ['Generating the maze',()=>{nextFloor=genFloor(seed,depth)}],
    ['Building the floor',()=>enter(nextFloor)]
  ]);
}
function startRun(seed,depth,force,showProgress=false,onReady){
  if(MP.guest&&!force){mpJoinClick();return}
  const sd=force?depth:clamp(depth||URL_DEPTH||+$('startSel').value||1,1,Math.max(deepest,URL_DEPTH));
  seed=(seed||randSeed()).toUpperCase();
  if(showProgress){
    initAudio();
    loadFloorWithProgress('Starting game',seed,sd,floor=>{
      enterRun(seed,sd,floor);
      if(onReady)onReady();
    });
  }else enterRun(seed,sd,genFloor(seed,sd));
}
function startFromMenu(seed,depth){
  if(!loading)startRun(seed,depth,false,true);
}
function enterRun(seed,sd,floor,landing,liftTrip){
  if(seed===autoSeed&&!$('seedIn').value.trim()){autoSeed=randSeed();reWarm=true}
  if(loading?.kind==='shaft')closeLoading(); // an unfinished title warm-up must not hold the doors shut or rebuild the world later
  roomLeave();$('deadTitle').textContent='THE DARK TAKES YOU';wofClear();WOF.done=true;WOF.plan=null;WOF.flap=0;
  showHub(false);
  if(!archiveRun)hub.reset();
  P.down=false;
  R.seed=seed;R.pk={};P.pick=0;P.spikeTraps=0;P.moose=P.mounted=false;P.moosePending=null;R.score=0;R.time=0;R.gems=0;R.startDepth=sd;
  P.hp=maxHp();P.fuel=100;P.stam=100;P.winded=false;P.flash=1+Math.floor((sd-1)/3)+(up.band|0);P.ward=0;R.wind=false;P.inv=0;P.chill=0;lowFuelSaid=false;
  installFloor(sd,floor,!!landing);
  if(landing){
    Object.assign(P,landing);
    onTileChange();
  }
  state='play';
  rememberFloor();
  ['title','pause','dead','talk'].forEach(id=>$(id).classList.add('hidden'));talk=null;
  $('hud').classList.remove('hidden');$('map').classList.remove('hidden');
  if(!archiveRun){say(sd>1?`Depth ${sd}: ${floorTag()}`:'Find 3 shards to break the seal',4);showTips()}
  initAudio();
  if(liftTrip)for(const [message,from] of sharedLift.waiting.splice(0))mpRecv(message,from);
  if(MP.host)mpSendRun(undefined,liftTrip);
}
const TIPS={2:['Spikes ahead: time them, or jump with Space','A locked gate needs its key. Blue wisps drink your torch.'],
  3:['An open cavern. Something here only moves when you look away.'],
  5:['Your torch barely reaches here. Follow the chime.']};
function showTips(){
  tipTimers.forEach(clearTimeout);tipTimers=[];
  const t=TIPS[R.depth];if(!t)return;const d=R.depth;
  t.forEach((msg,i)=>tipTimers.push(setTimeout(()=>{if(state==='play'&&R.depth===d)say(msg,4)},4200+i*4600)));
}
function toTitle(){
  if(archiveRun){finishArchive();return}
  if(loading)closeLoading();
  endWallClip();
  roomLeave();glFallEnd();GL.queued=null;
  if(MP.on)mpLeave(false);
  state='title';
  ['pause','dead','hud','map','talk'].forEach(id=>$(id).classList.add('hidden'));talk=null;clearPrompt();
  $('toast').style.opacity=0;
  showHub(true);
  showBest();
  if(document.pointerLockElement){usingLock=false;document.exitPointerLock()}
}
function showBest(){
  fillStartSel();
  const b=store.get('best',null);
  $('bestLine').textContent=(b?`Best run: depth ${b.depth}, ${b.score} points · `:'')+`Level ${plLevel()} · ${wallet} gems banked`;
}
function pause(){
  if(state!=='play')return;
  state='pause';pausedAt=performance.now();mpPausePanel();
  $('pause').classList.remove('hidden');
}
function resume(withLock){
  if(roomPaused){roomPauseHide(withLock);return}
  if(state!=='pause')return;
  state='play';$('pause').classList.add('hidden');
  if(withLock)lock();
}
/* ---------- Esc in the lobby / a door room: a small box, or the pause panel with settings. Only this player's input is held. ---------- */
let lobbyPaused=false,roomPaused=false;
function freeInput(){for(const k in keys)keys[k]=false;mouseL=false}
function lobbyPauseShow(){
  if(lobbyPaused||state!=='title'||activeStation||loading||touch.on||archiveRun)return;
  lobbyPaused=true;pausedAt=performance.now();freeInput();
  $('lobbyPause').classList.remove('hidden');
  if(document.pointerLockElement){usingLock=false;document.exitPointerLock()}
}
function lobbyPauseHide(withLock){
  if(!lobbyPaused)return;
  lobbyPaused=false;$('lobbyPause').classList.add('hidden');
  if(withLock&&!touch.on)lock();
}
function roomPauseShow(){
  if(roomPaused||state!=='room'||archiveRun||touch.on||onMooseTable())return;
  const mode=ROOMS.controlMode();
  if(mode==='table'||mode==='read')return;
  roomPaused=true;pausedAt=performance.now();freeInput();
  mpPausePanel();document.querySelector('#pause .gfxNote').classList.add('hidden');
  $('pause').classList.remove('hidden');
}
function roomPauseHide(withLock){
  if(!roomPaused)return;
  roomPaused=false;$('pause').classList.add('hidden');
  if(withLock&&state==='room'&&!touch.on)lock();
}
function lock(){
  try{const p=canvas.requestPointerLock({unadjustedMovement:true});
    if(p&&p.catch)p.catch(()=>{try{const q=canvas.requestPointerLock();if(q&&q.catch)q.catch(()=>{})}catch(e){}})}
  catch(e){try{canvas.requestPointerLock()}catch(e2){}}
}
let toastTimer=0;
function say(t,secs){const el=$('toast');el.textContent=t;el.style.opacity=1;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.opacity=0,(secs||2.5)*1000)}

function die(){
  if(archiveRun){state='dead';queueMicrotask(finishArchive);return}
  if(loading)closeLoading();
  endWallClip();
  roomLeave();GL.queued=null;R.xray=0;R.guide=0;
  if(MP.on&&!MP.wiping){mpDown();return}
  state='dead';clearPrompt();
  mpDeadPanel();
  if(document.pointerLockElement)document.exitPointerLock();
  const b=store.get('best',null);
  const isBest=!b||R.depth>b.depth||(R.depth===b.depth&&R.score>b.score);
  if(isBest)store.set('best',{depth:R.depth,score:R.score});
  const m=Math.floor(R.time/60),s=Math.floor(R.time%60);
  $('deadStats').innerHTML=`Reached depth <b>${R.depth}</b>${R.startDepth>1?' (started at '+R.startDepth+')':''} &nbsp;·&nbsp; ${F.name}<br>Score <b>${R.score}</b> &nbsp;·&nbsp; ${R.gems} gems &nbsp;·&nbsp; ${m}:${String(s).padStart(2,'0')}<br>Seed <b>${R.seed}</b>${isBest?'<br><span style="color:#ffc27a">New best run</span>':''}`;
  $('dead').classList.remove('hidden');
  sfx('die');
}
function descend(n,why){
  if(archiveRun){finishArchive();return}
  n=n||1;roomLeave();
  state='trans';
  const bonus=why?0:100*R.depth+Math.round(P.fuel);
  R.score+=bonus;
  sfx('descend');
  const depth=R.depth+n;
  loadFloorWithProgress('Descending to depth '+depth,R.seed,depth,floor=>{
    P.fuel=Math.min(100,P.fuel+25);lowFuelSaid=false;
    if(P.down){P.down=false;P.hp=maxHp();P.fuel=Math.max(P.fuel,50);P.inv=2;say('You rise again',2)}
    installFloor(depth,floor);
    rememberFloor();
    $('fade').style.transition='';$('fade').style.opacity=0;
    say((why?why+'. ':'')+`Depth ${R.depth}: ${floorTag()}`,why?5:3.5);showTips();
    state='play';
  });
}
function useFlash(){
  if(P.flash<=0){say('No flash bombs',1.2);return}
  P.flash--;flashT=1;
  const fx=$('flashfx');fx.style.transition='none';fx.style.opacity=0.85;
  requestAnimationFrame(()=>{fx.style.transition='opacity .7s';fx.style.opacity=0});
  let n=0;
  for(const s of F.shades)if(s.type===3&&s.x>0&&Math.hypot(s.x-P.x,s.z-P.z)<9&&los(P.x,P.z,s.x,s.z)){banish(s,true);n++}
  n+=flashStun(P.x,P.z,up.powder|0);
  if(MP.guest)mpSend({k:'fl',d:R.depth,x:P.x,z:P.z,p:up.powder|0},MP.hostId);
  sfx('flash');rumble(120,0.2,0.7);
  if(n)say(n>1?`${n} creatures stunned`:'Stunned',1.5);
}
function flashStun(x,z,lv){
  lv=clamp(lv|0,0,2);let n=0;
  for(const s of F.shades){
    if(s.type===3)continue;
    if(Math.hypot(s.x-x,s.z-z)<6.5+1.25*lv&&los(x,z,s.x,s.z)){s.stun=4.5+1.5*lv;if(s.type!==1)s.state=0;n++}
  }
  n+=mimicFlash(x,z);
  return n;
}
function openDoor(quiet){
  if(!F.door)return;
  P.keys=Math.max(0,P.keys-1);F.doorOpen=true;F.g[F.door.ty*F.W+F.door.tx]=0;F.frames.push(F.door);F.door=null;buildMesh(F);buildSdf(F);onTileChange();F.pkMemo=null;pkReapply();
  if(!quiet){sfx('door');say('The gate grinds open',2.5)}
}
/* ---------- achievements: a tiny generic list, kept in localStorage (emberdeep.ach: id -> time first earned) ---------- */
const ACH_DEFS={knowledge:{title:'Knowledge is power',desc:'Silence the peasants of the picture house'},...MOOSE_ACH};
const ACH=(()=>{const a=store.get('ach',{});return a&&typeof a==='object'&&!Array.isArray(a)?a:{}})();
function achLine(){const got=Object.keys(ACH_DEFS).filter(k=>ACH[k]);$('achLine').textContent=got.length?'Achievements: '+got.map(k=>ACH_DEFS[k].title).join(' · '):''}
// the toast shows every time it is earned; the time it was first earned is kept
function achieve(id,title,desc){
  if(archiveRun)return;
  if(!ACH[id]){ACH[id]=Date.now();store.set('ach',ACH)}
  const el=$('achToast');el.innerHTML='<small>ACHIEVEMENT</small><b>'+title+'</b>'+(desc?'<span>'+desc+'</span>':'');el.classList.add('on');
  clearTimeout(achTimer);achTimer=setTimeout(()=>el.classList.remove('on'),5200);achLine();
}
let achTimer=0;
/* ---------- the guiding light: after the picture house, for the rest of that floor, a light at the end of the tunnel ----------
   It points down the shortest walkable route (the shut gate counts as a wall, unless you hold its key) to the nearest shard, or to the
   way down once every shard is yours, and rests at the farthest tile of that route you can see in a straight line. It glides on as you approach. */
const GD={have:false,x:0,z:0,gx:0,gz:0,key:'',t:0,target:null,beacon:null,len:0};
function guideCompute(){
  const W=F.W,H=F.H;let g=F.g;
  if(F.door&&P.keys>0){g=F.g.slice();g[F.door.ty*W+F.door.tx]=0}
  const dp=bfs(g,W,H,P.tx,P.ty);
  let cand=P.shards>=3?[{tx:F.exit.tx,ty:F.exit.ty,k:'exit'}]:F.items.filter(it=>!it.got&&it.type==='shard').map(it=>({tx:it.tx,ty:it.ty,k:'shard'}));
  let reach=cand.filter(c=>dp[c.ty*W+c.tx]>=0);
  // the shards may all lie behind the gate: then the key is the next thing to find
  if(!reach.length&&F.door&&P.keys<1){reach=F.items.filter(it=>!it.got&&it.type==='key'&&dp[it.ty*W+it.tx]>=0).map(it=>({tx:it.tx,ty:it.ty,k:'key'}))}
  if(!reach.length){GD.have=false;GD.target=GD.beacon=null;return}
  reach.sort((a,b)=>dp[a.ty*W+a.tx]-dp[b.ty*W+b.tx]);
  const tg=reach[0],path=guidePath(bfs,g,W,H,P.tx,P.ty,tg.tx,tg.ty);
  if(!path){GD.have=false;return}
  const b=guideBeacon(path,P.x,P.z,los,GUIDE_RANGE);
  GD.target=tg;GD.beacon={tx:b[0],ty:b[1]};GD.len=path.length-1;GD.gx=b[0]+0.5;GD.gz=b[1]+0.5;
  if(!GD.have){GD.x=GD.gx;GD.z=GD.gz;GD.have=true}
}
const guideOn=()=>R.guide>0&&R.guide===R.depth&&!!F&&state!=='title';
function guideTick(dt){
  if(!guideOn()||P.down){GD.have=false;GD.key='';return}
  GD.t-=dt;
  const key=P.tx+','+P.ty+','+P.shards+','+P.keys+','+(F.door?1:0)+','+F.items.reduce((n,i)=>n+(i.got?1:0),0);
  if(key!==GD.key||GD.t<=0){GD.key=key;GD.t=0.3;guideCompute()}
  if(GD.have){const k=1-Math.exp(-dt/0.13);GD.x+=(GD.gx-GD.x)*k;GD.z+=(GD.gz-GD.z)*k}   // glides over about 0.4 s
}
function guideInfo(){return {on:guideOn(),have:GD.have,target:GD.target&&{tx:GD.target.tx,ty:GD.target.ty,k:GD.target.k},beacon:GD.beacon&&{tx:GD.beacon.tx,ty:GD.beacon.ty},x:GD.x,z:GD.z,gx:GD.gx,gz:GD.gz,len:GD.len}}
/* ---------- the kiln pickaxe: one swing, one wall, for good ---------- */
let pkShake=0;const pkFx=[];
// why a wall tile may not be broken: '' when it may. The outer border, the gate (and its stone frame), strange doors, the sanctuary,
// noclip pockets and anyone standing in a nook stay as they are, and while the gate is shut nothing may join its two sides.
function pkWhy(tx,ty){
  if(!F||!Number.isInteger(tx)||!Number.isInteger(ty))return 'bad';
  const W=F.W,H=F.H;
  if(tx<1||ty<1||tx>W-2||ty>H-2)return 'border';
  if(F.g[ty*W+tx]!==1)return 'notwall';
  const near=(x,y,r)=>Math.abs(x-tx)<=r&&Math.abs(y-ty)<=r;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=(ty+dy)*W+tx+dx;if(F.safeMask[i]||F.pocketMask[i])return 'kept'}
  if(F.door&&near(F.door.tx,F.door.ty,1))return 'gate';
  for(const D of F.frames)if(near(D.tx,D.ty,1))return 'gate';
  for(const D of F.sdoors)if(near(D.tx+D.dx,D.ty+D.dz,1))return 'door';
  for(const n of F.npcs)if(near(Math.floor(n.x),Math.floor(n.z),1))return 'kept';
  if(!DIRS.some(d=>F.g[(ty+d[1])*W+tx+d[0]]===0))return 'sealed';
  if(F.door){
    const k=tx+','+ty;F.pkMemo=F.pkMemo||new Map();
    if(!F.pkMemo.has(k)){
      const a=bfs(F.g,W,H,F.start.tx,F.start.ty);F.g[ty*W+tx]=0;const b=bfs(F.g,W,H,F.start.tx,F.start.ty);F.g[ty*W+tx]=1;
      let join=false;for(let i=0;i<W*H;i++)if(a[i]<0&&b[i]>=0&&i!==ty*W+tx){join=true;break}
      F.pkMemo.set(k,join);
    }
    if(F.pkMemo.get(k))return 'gate';
  }
  return '';
}
// the wall tile you are looking at, from the player along the view direction (pitch is ignored)
function pkAim(){
  const cx=Math.cos(P.yaw),cz=Math.sin(P.yaw);
  for(let t=0.1;t<=1.6;t+=0.05){
    const x=P.x+cx*t,z=P.z+cz*t;
    if(!solidAt(x,z))continue;
    const tx=Math.floor(x),ty=Math.floor(z);
    return {tx,ty,ok:pkWhy(tx,ty)===''};
  }
  return null;
}
// open the tile for good: floor and ceiling come back with the mesh, and everything that walks the maze sees the new way
function pkOpen(tx,ty){
  const i=ty*F.W+tx;F.g[i]=0;
  const cxm=tx+0.5,czm=ty+0.5;
  F.sconces=F.sconces.filter(q=>!(Math.floor(q.lx)+q.dx===tx&&Math.floor(q.lz)+q.dz===ty));
  F.props=F.props.filter(q=>Math.max(Math.abs(q.x-cxm),Math.abs(q.z-czm))>0.66);
  const r=mulberry32(hashStr(R.seed+'#pick'+R.depth+','+tx+','+ty));
  for(let k=0;k<7;k++)F.rubble.push({x:tx+0.15+r()*0.7,z:ty+0.15+r()*0.7,s:0.05+r()*0.08,r:r()*6.28,sy:0.5+r()*0.6});
  F.pkMemo=null;F.md=null;F.mdKey='';MIM.vdKey='';
  buildMesh(F);buildStatic(F);buildSdf(F);
  F.seen[i]=1;onTileChange();F.seen[i]=1;
}
function pkRecord(tx,ty){const a=R.pk[R.depth]||(R.pk[R.depth]=[]);if(!a.some(q=>q[0]===tx&&q[1]===ty)&&a.length<64)a.push([tx,ty])}
// a break from a friend, the host's list, or the record of this floor. Everything is checked first.
function pkApply(x,y,quiet){
  if(!Number.isInteger(x)||!Number.isInteger(y)||pkWhy(x,y))return false;
  pkOpen(x,y);pkRecord(x,y);pkFx.push(...pkDebris(x,y));
  if(!quiet){const d=Math.hypot(x+0.5-P.x,y+0.5-P.z);if(d<12){const v=clamp(1-d/12,0.2,1);noise(0.3,0.45*v,500,0.8);tone(90,0.25,'sawtooth',0.18*v,0,-50);pkShake=Math.max(pkShake,0.5*v)}}
  return true;
}
// after a floor is rebuilt (or its gate opens) the holes already made for this floor come back
function pkReapply(){for(const q of (R.pk[R.depth]||[]).slice())if(Number.isInteger(q[0])&&Number.isInteger(q[1])&&!pkWhy(q[0],q[1])){pkOpen(q[0],q[1])}}
function pkDebris(tx,ty){
  const o=[],t0=performance.now(),r=Math.random;
  for(let k=0;k<26;k++){const a=r()*6.283,v=0.4+r()*1.3;o.push({x:tx+0.5,y:0.3+r()*0.9,z:ty+0.5,vx:Math.cos(a)*v,vy:r()*1.4,vz:Math.sin(a)*v,s:0.03+r()*0.09,dust:k>=10,t0,life:0.7+r()*0.9})}
  return o;
}
function pkFxDraw(){
  const now=performance.now();
  for(let i=pkFx.length-1;i>=0;i--){
    const q=pkFx[i],t=(now-q.t0)/1000;
    if(t>q.life){pkFx.splice(i,1);continue}
    const f=t/q.life,x=q.x+q.vx*t*(1-f*0.5),z=q.z+q.vz*t*(1-f*0.5),y=Math.max(0.02,q.y+q.vy*t-2.6*t*t);
    if(q.dust)spr(x,y+0.1*f,z,q.s*(2+f*5),q.s*(2+f*5),7,0.55,0.5,0.44,0.5*(1-f),0);
    else spr(x,y,z,q.s,q.s,7,0.32,0.28,0.25,1-f*0.4,0);
  }
}
function usePick(){
  if(state!=='play'||P.pick<=0||P.down||P.away||P.grab)return;
  const a=pkAim();
  if(!a)return;
  if(!a.ok){say('This wall will not break',1.6);sfx('step');return}
  pkApply(a.tx,a.ty,true);
  P.pick--;P.inv=Math.max(P.inv,0.4);
  mpSend({k:'pk',d:R.depth,x:a.tx,y:a.ty});
  noise(0.5,0.7,380,0.7);noise(0.25,0.5,1800,1);tone(70,0.4,'sawtooth',0.3,0,-40);tone(180,0.08,'square',0.25,0.03,-100);tone(1400,0.12,'triangle',0.12,0.01,-800);
  pkShake=1;rumble(260,0.9,0.6);
  say('The wall gives way. The pick crumbles in your hands.',3.5);
  mpSys(myName()+' broke through a wall');
}
function setBlk(v){
  if(v===1){F.blk=1;F.boT=1.7;sfx('powerdown')}
  else if(v===2){
    F.blk=2;F.boT=6+Math.random()*4;say('The lights are out. Keep moving.',3);
    for(const s of F.shades){if(s.type===0&&!MP.guest&&s.d>=0&&s.d<=14)s.state=1;else if(s.type===3&&s.x<0)s.hid=0}
  }else{
    F.blk=0;F.boT=40+Math.random()*40;sfx('powerup');
    for(const s of F.shades)if(s.type===3&&s.x>0)banish(s,true);
  }
}
function hurt(s){
  if(P.ward){P.ward=0;P.inv=1.6;if(s){s.stun=2.5;s.calm=9;s.state=0}sfx('seal');say('Your ward stone shatters',2);return}
  P.hp--;P.inv=1.6;if(s){s.stun=2.5;s.calm=9;s.state=0}
  if(P.hp<=0&&up.wind&&!R.wind){R.wind=true;P.hp=1;P.inv=3;say('Second wind. You are still standing.',3)}
  try{if(touch.on&&navigator.vibrate)navigator.vibrate(90)}catch(e){}
  rumble(260,0.9,0.6);
  const h=$('hurt');h.style.transition='none';h.style.opacity=1;
  requestAnimationFrame(()=>{h.style.transition='opacity .9s';h.style.opacity=0});
  sfx('hurt');
  if(P.hp<=0)die();
}
function collect(it){
  it.got=true;
  switch(it.type){
    case 'shard':P.shards++;R.score+=50;sfx('shard');
      say(P.shards>=3?'The seal is broken. Find the way down.':`Shard ${P.shards} of 3`,2.5);break;
    case 'gem':R.score+=10*R.depth;R.gems++;wallet++;if(Math.random()<0.15*(up.purse|0)){R.gems++;wallet++;say('Lucky find: 2 gems',1.2)}store.set('wallet',wallet);sfx('gem');break;
    case 'oil':P.fuel=Math.min(100,P.fuel+35);lowFuelSaid=false;sfx('oil');break;
    case 'flash':P.flash++;sfx('pick');break;
    case 'chest':wallet+=8;R.gems+=8;R.score+=60*R.depth;store.set('wallet',wallet);sfx('shard');say('You slipped through the wall. A hidden cache: 8 gems',4);break;
    case 'key':P.keys++;sfx('key');say('You found the gate key',2.5);break;
    case 'heart':if(P.hp<maxHp())P.hp++;else R.score+=25;sfx('pick');break;
  }
  mpSend({k:'got',d:R.depth,i:F.items.indexOf(it)});
}

/* ---------- multiplayer: one player hosts, friends join with ?room=CODE ----------
   Every client builds the same maze from the shared seed, so only small updates travel:
   where each player is, what the creatures are doing (the host runs them), and events
   such as a pickup, a gate, a descent. See src/net.js for the connection itself. */
const MP_COLS=[[0.31,0.76,0.97],[0.51,0.82,0.45],[0.78,0.45,0.9],[1.0,0.72,0.3],[0.97,0.42,0.62],[0.35,0.85,0.75],[1.0,0.92,0.42],[0.62,0.6,1.0]];
const MP={on:false,host:false,guest:false,local:false,room:null,code:'',id:'',hostId:null,peers:new Map(),run:null,wantJoin:false,wiping:false,pt:0,mt:0,follow:null};
const myName=()=>String(store.get('name','')||'').trim().slice(0,16)||'Delver';
const toHex=c=>'#'+c.map(v=>Math.round(clamp(v,0,1)*255).toString(16).padStart(2,'0')).join('');
const r2=v=>Math.round(v*100)/100, r3=v=>Math.round(v*1000)/1000;
const wrapA=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a};
function mpSend(m,to){if(MP.on&&MP.room)MP.room.send(m,to)}
function mpLink(){
  const url=new URL(location.href);
  url.search='';
  url.hash='';
  url.searchParams.set('room',MP.code);
  if(MP.local)url.searchParams.set('net','local');
  return url.href;
}
function mpPeer(id){
  let p=MP.peers.get(id);
  if(!p){const c=MP_COLS[hashStr(id||'')%MP_COLS.length];p={id,name:'Delver',col:c,hex:toHex(c),d:0,run:false,down:false,inv:0,walk:0,spd:0,fu:100};MP.peers.set(id,p)}
  return p;
}
const hostName=()=>{const h=MP.peers.get(MP.hostId);return h?h.name:'the host'};
function mpOpen(code){
  MP.code=code;MP.on=true;MP.local=new URLSearchParams(location.search).get('net')==='local';
  resetSharedLift();
  const room=openRoom(code,MP.local);MP.room=room;MP.id=room.id;
  room.onPeerJoin=id=>{mpPeer(id);mpSend({k:'hi',n:myName(),h:MP.host},id);if(MP.host)mpSend(mpCfg(),id);if(VOX.send)room.addStream(VOX.send,id);mpTitle()};
  room.onPeerLeave=id=>mpGone(id);
  room.onPeerStream=(st,id)=>{if(MP.room===room){initAudio();VOX.attach(id,st)}};
  room.onBinary=(buf,meta,from)=>{if(MP.room===room&&from)try{mpBinary(buf,meta||{},from)}catch(e){console.warn('emberdeep clip',e)}};
  if(VOX.send)room.addStream(VOX.send);
  room.onMessage=(m,from)=>{if(!m||!from||MP.room!==room)return;try{mpRecv(m,from)}catch(e){console.warn('emberdeep net',e)}};
}
function mpLeave(endIfDown){
  if(MP.room)try{MP.room.leave()}catch(e){}
  Object.assign(MP,{room:null,on:false,host:false,guest:false,hostId:null,run:null,wantJoin:false,code:'',follow:null});
  clearMooseLures();P.moosePending=null;
  for(const id of MP.peers.keys())VOX.detach(id);
  MP.peers.clear();
  terminalSession.reset();
  resetSharedLift();
  if(hub.riding)hub.reset();
  if(chatOpen)chatClose(false);chatLog.textContent='';
  try{const u=new URL(location.href);if(u.searchParams.has('room')){u.searchParams.delete('room');u.searchParams.delete('net');history.replaceState(null,'',u)}}catch(e){}
  if(P.down){P.down=false;if(endIfDown&&state!=='title'&&state!=='dead')die()}
  mpTitle();
}
// the host button: open a room, start a run, copy the invite link
function mpHost(depth,seed=$('seedIn').value.trim(),landing){
  if(loading)return;
  if(MP.on)mpLeave(false);
  MP.host=true;MP.guest=false;
  mpOpen(newRoomCode());
  let copied;
  try{copied=navigator.clipboard.writeText(mpLink()).then(()=>true,()=>false)}catch(e){copied=Promise.resolve(false)}
  const announce=()=>copied.then(ok=>say(ok?'Invite link copied. Send it to your friends.':'Room '+MP.code+'. Press Esc for the invite link.',4));
  if(landing){enterRun(seed,depth,landing.floor,landing.pose);announce()}
  else{startRun(seed,depth,depth!==undefined,true,announce);lock()}
}
// opened from an invite link: connect straight away, start when the player clicks Join
function mpPrepareJoin(code){
  MP.guest=true;MP.host=false;
  mpOpen(code);
  mpTitle();
}
function mpJoinClick(){
  MP.wantJoin=true;initAudio();
  if(MP.run){mpApplyRun(MP.run);lock()}
  else say('Still looking for the host. Keep this page open.',2.5);
}
function mpSendRun(to,liftTrip){
  if(!MP.host||!F)return;
  const got=[];F.items.forEach((it,i)=>{if(it.got)got.push(i)});
  mpSend({k:'run',seed:R.seed,d:R.depth,sd:R.startDepth,t:r2(R.time),got,door:F.doorOpen?1:0,sdo:F.sdoors.map(q=>q.used?1:0),pk:(R.pk[R.depth]||[]).slice(0,64),sh:P.shards,ke:P.keys,blk:F.blk|0,liftTrip},to);
}
function mpApplyRun(r){
  startRun(r.seed,r.d,true,true,()=>{
    mpRestoreRun(r);
    const host=MP.peers.get(MP.hostId);
    if(!host||host.d!==R.depth||!Number.isFinite(host.x)||!Number.isFinite(host.z)||host.away)return;
    const spot=mpBeside(host.x,host.z,host.yaw||0);
    if(!spot)return;
    Object.assign(P,spot);onTileChange();
  });
}
// stand next to a friend instead of the floor's far entrance, so joining doesn't look like vanishing
function mpBeside(x,z,yaw){
  const spots=[[0.75,0],[-0.75,0],[0,0.75],[0,-0.75],[1.15,0.45],[-1.15,-0.45],[1.2,-0.3]];
  for(const [ox,oz] of spots){
    const nx=x+ox,nz=z+oz;
    if(!blocked(nx,nz))return {x:nx,z:nz,yaw,pitch:0};
  }
  return null;
}
function mpRestoreRun(r){
  R.startDepth=r.sd;R.time=r.t;
  for(const i of r.got||[]){const it=F.items[i];if(it)it.got=true}
  if(r.door&&F.door)openDoor(true);
  if(Array.isArray(r.sdo)){r.sdo.forEach((u,i)=>{if(u&&F.sdoors[i])F.sdoors[i].used=true});buildStatic(F)}
  if(Array.isArray(r.pk))for(const q of r.pk.slice(0,64))if(Array.isArray(q))pkApply(q[0],q[1],true);
  P.shards=r.sh|0;P.keys=r.ke|0;
  if(F.back&&r.blk)F.blk=r.blk;
  say(`You joined ${hostName()}'s game`,3);
}
function mpGone(id){
  const p=MP.peers.get(id);MP.peers.delete(id);VOX.detach(id);
  if(p&&p.greeted&&state!=='title'){say(p.name+' left',2.5);mpSys(p.name+' left')}
  if(MP.guest&&id===MP.hostId){
    MP.hostId=null;MP.run=null;
    terminalSession.reset();
    if(hub.riding){mpLeave(false);return}
    resetSharedLift();
    if(state==='title'||!MP.wantJoin){if(loading)closeLoading();mpTitle()}
    else{say('The host left. The maze is yours alone now.',4);mpLeave(true)}
  }else mpTitle();
}
function mpDown(){
  P.down=true;P.hp=0;clearPrompt();sfx('die');rumble(300,1,0.8);
  say('You have fallen. Reach the next floor together and you rise again.',5);
}
function mpDescend(n,why){
  if(state==='pause')$('pause').classList.add('hidden');
  roomPauseHide(false);
  if(state==='talk'){$('talk').classList.add('hidden');talk=null}
  descend(n,why);
}
function mpRecv(m,from){
  const p=mpPeer(from),fromHost=from===MP.hostId;
  p.seen=performance.now();
  const inRun=state!=='title'&&state!=='dead'&&!(MP.guest&&!MP.wantJoin);
  const here=m.d===R.depth;
  if(state==='title'&&hub.riding&&sharedLift.trip&&m.d===sharedLift.trip.depth&&sharedLift.trip.members.includes(from)
    &&['got','pk','door','sd'].includes(m.k)&&sharedLift.waiting.length<256){
    sharedLift.waiting.push([m,from]);return;
  }
  switch(m.k){
    case 'hub':{
      const a=m.a;
      if(!Array.isArray(a)||a.length!==4||!a.every(Number.isFinite))return;
      const [x,y,z,yaw]=a;
      if(Math.abs(x)>21||y< -10000||y>3||z< -34||z>16||Math.abs(yaw)>1e4)return;
      const station=['settings','guide','news','lift'].includes(m.station)?m.station:null;
      let ride=null;
      if(m.ride&&sharedLift.trip&&m.ride===sharedLift.trip.id){
        ride=m.ride;
        if(!sharedLift.trip.members.includes(from))sharedLift.trip.members.push(from);
      }
      p.hub={x,y,z,yaw,station,ride,ready:!!m.ready,at:performance.now()};
      if(validLiftDepth(m.deepest))p.deepest=m.deepest;
      if(MP.host)terminalSession.expire();
      break;}
    case 'terminalSelect':
      if(MP.host)terminalSession.select(from,m);
      break;
    case 'terminalState':
      if(MP.guest&&fromHost)terminalSession.update(m.session,m.revision);
      break;
    case 'liftPick':
      if(MP.host)selectLiftDepth(from,m.depth);
      break;
    case 'liftDepart':
      if(MP.host)requestLiftDeparture(from,m.shortcut===true);
      break;
    case 'liftSelection':
      if(fromHost&&validLiftDepth(m.depth)&&validLiftDepth(m.max)&&m.depth<=m.max&&!sharedLift.trip){
        const reached=validLiftDepth(m.deepest)&&m.deepest<=m.max?m.deepest:1;
        sharedLift.selection={depth:m.depth,max:m.max,deepest:reached,by:String(m.by||'').slice(0,16),pending:!!m.pending};
        updateLiftScreen();
      }
      break;
    case 'liftStart':
      if(fromHost)startSharedLift(m);
      break;
    case 'liftMotion':
      if(fromHost&&sharedLift.trip?.id===m.id&&[m.travel,m.extra].every(Number.isFinite)){
        const previous=sharedLift.trip.motion;
        if(previous&&(m.travel<previous.travel||m.extra<previous.extra||previous.docked&&!m.docked))return;
        sharedLift.trip.motion={travel:m.travel,extra:m.extra,docked:!!m.docked,gaps:Array.isArray(m.gaps)?m.gaps:null};
        if(m.docked)updateLiftScreen();
      }
      break;
    case 'liftAbort':
      if(fromHost&&sharedLift.trip?.id===m.id){
        hub.resetLift();resetSharedLift();mpTitle();
      }
      break;
    case 'hi':
      p.name=String(m.n||'Delver').slice(0,16);
      if(m.h&&MP.guest&&(!MP.hostId||MP.hostId===from)){MP.hostId=from;p.host=true}
      if(!p.greeted){p.greeted=true;if(inRun)say(p.name+' joined',2.5);mpSys(p.name+' joined');if(MP.host&&state!=='title'&&state!=='dead')mpSendRun(from)}
      if(MP.host){
        terminalSession.sync();
        if(!sharedLift.trip)publishLiftSelection(from);
        else if(hub.riding)mpSend({k:'liftStart',...sharedLift.trip.packet},from);
      }
      mpTitle();break;
    case 'run':{
      if(!fromHost)return;
      MP.run=m;
      const sameTrip=!!(m.liftTrip&&sharedLift.trip&&m.liftTrip===sharedLift.trip.id);
      // Same trip and already aboard: the landing walk enters the maze. Don't restart it.
      if(MP.wantJoin&&!hub.riding&&!sameTrip)mpApplyRun(m);
      // Anyone still in the hall gets the lift back, so they can catch up.
      if(!hub.riding&&sharedLift.trip){
        sharedLift.trip=null;sharedLift.pending=0;hub.watchLift(null);updateLiftScreen();
      }
      mpTitle();break;}
    case 'p':{
      const a=m.a;if(!Array.isArray(a))return;
      p.hub=null;
      p.d=m.d;p.x=+a[0];p.z=+a[1];p.y=+a[2];p.yaw=+a[3];p.pitch=+a[4];p.fu=+a[5];p.down=!!(a[6]&1);p.safe=!!(a[6]&2);p.run=!!(a[6]&4);p.away=!!(a[6]&8);p.mounted=!!(a[6]&16);p.unseen=!!(a[6]&32);p.hp=a[7];p.form=a[6]>>6&3;p.fat=!!(a[6]&256);p.pox=!!(a[6]&512);p.frz=!!(a[6]&1024);p.bob=!!(a[6]&2048);p.hedge=!!(a[6]&4096);p.curl=a[6]&8192?1:a[6]&16384?2:0;
      if(p.rx===undefined||p.rd!==p.d||Math.hypot(p.x-p.rx,p.z-p.rz)>3){p.rx=p.x;p.rz=p.z;p.ry=p.y;p.ryaw=p.yaw;p.rpitch=p.pitch;p.rd=p.d}
      break;}
    case 'm':{
      if(!fromHost||!inRun||!here)return;
      const e=m.t-R.time;if(Math.abs(e)>1)R.time=m.t;else R.time+=e*0.2;
      if(F.back&&(m.b|0)!==(F.blk|0))setBlk(m.b|0);
      let j=0;const a=m.s||[],following=new Set(Array.isArray(m.ml)?m.ml:[]);
      for(const s of F.shades){
        if(s.type===3)continue;
        if(j+5>=a.length)break;
        s.mooseFollowing=following.has(j/6);
        s.nx=a[j];s.nz=a[j+1];s.face=a[j+2];s.state=a[j+3];s.stun=a[j+4];s.frozen=!!a[j+5];j+=6;
        s.gx=Math.floor(s.nx);s.gy=Math.floor(s.nz);s.px=-1;
        if(s.x<0||Math.hypot(s.nx-s.x,s.nz-s.z)>2.5){s.x=s.nx;s.z=s.nz}
      }
      if(Array.isArray(m.mi)){const q=m.mi;Object.assign(MIM,{x:+q[0],z:+q[1],face:+q[2],st:q[3]|0,as:String(q[4]||''),vic:String(q[5]||'')});if(MIM.st===2||MIM.st===3){if(Math.abs(MIM.t-q[6])>0.3)MIM.t=+q[6]}}
      const ids=new Set();
      if(Array.isArray(m.moose))for(const q of m.moose.slice(0,32)){
        if(!Array.isArray(q)||typeof q[0]!=='string'||q.length<4||!q.slice(1,4).every(Number.isFinite))continue;
        const [id,x,z,yaw,hearts]=q,hp=Number.isInteger(hearts)?Math.max(0,Math.min(3,hearts)):3;ids.add(id);
        let lure=mooseLures.get(id);
        if(!lure){lure={x,z};mooseLures.set(id,lure);if(hp&&Math.hypot(x-P.x,z-P.z)<15)sfx('moose')}
        if(hp<lure.hp)sprayMooseHit(x,z);
        Object.assign(lure,{nx:x,nz:z,yaw,hp,active:hp>0});
      }
      for(const id of mooseLures.keys())if(!ids.has(id))mooseLures.delete(id);
      break;}
    case 'mooseLure':{
      if(!MP.host||!inRun||!here||!p.run||p.down||p.away||p.safe||!Number.isSafeInteger(m.q))return;
      const near=[m.x,m.z,m.yaw].every(Number.isFinite)&&Math.hypot(m.x-p.x,m.z-p.z)<1.5;
      if(p.mooseRequest!==m.q){p.mooseRequest=m.q;p.mooseResult=near&&startMooseLure(from,m.x,m.z,m.yaw)}
      mpSend({k:'mooseResult',d:R.depth,q:m.q,ok:p.mooseResult},from);
      break;}
    case 'mooseResult':
      if(!fromHost||!inRun||P.moosePending?.q!==m.q||P.moosePending?.depth!==m.d)return;
      P.moosePending=null;
      if(m.ok)finishMooseSacrifice();else say('Face an open hall and try again.',2);
      break;
    case 'got':{
      if(!inRun||!here)return;
      const it=F.items[m.i];if(!it||it.got)return;
      it.got=true;
      if(it.type==='shard'){P.shards++;sfx('shard');say(P.shards>=3?`${p.name} found the last shard. Find the way down.`:`${p.name} found a shard (${P.shards} of 3)`,2.5)}
      else if(it.type==='key'){P.keys++;sfx('key');say(p.name+' found the gate key',2.5)}
      break;}
    case 'door':if(inRun&&here&&F.door)openDoor(false);break;
    case 'sd':{
      if(!inRun||!here)return;
      const D=F.sdoors[m.i];if(!D||D.used)return;
      D.used=true;if(nearDoor===D)nearDoor=null;buildStatic(F);
      say(p.name+' opened a strange door',2.5);mpSys(p.name+' opened '+(DOOR_KINDS[m.w]?.name||'a strange door'));
      break;}
    case 'rv':if(m.q&&typeof m.q==='object'&&typeof m.w==='string'&&Object.hasOwn(DOOR_KINDS,m.w)){p.rv={w:m.w,q:m.q,d:m.d,at:performance.now()};if(RW&&RW.id===from&&RW.w===m.w)ROOMS.sync(m.q)}break;
    case 'sdr':if(inRun)say(m.r==='theater'?p.name+' silenced the picture house':m.r==='theater-dead'?p.name+' was roasted to death by teenagers':m.r==='esc'?p.name+' beat the glass kiln':m.r==='fall'?p.name+' fell to their death':m.r==='lucky'?p.name+' hid behind a mirror and got lucky':m.r==='mirror'?p.name+' was eaten by the thing behind the mirror':p.name+' was buried in the glass kiln',3);break;
    case 'warp':{
      const n=(m.d|0)-R.depth;
      if(inRun&&state!=='trans'&&n>=1&&n<=3)mpDescend(n,p.name+' woke a black hole. It throws you all '+n+(n>1?' floors':' floor')+' down');
      break;}
    case 'down':if(inRun&&state!=='trans'&&m.d===R.depth+1){say(p.name+' found the way down',2);mpDescend()}break;
    case 'pk':
      if(!inRun||!here||p.down||state==='trans')return;
      if(pkApply(m.x,m.y,false)){say(p.name+' broke through a wall',2.5);mpSys(p.name+' broke through a wall')}
      break;
    case 'pks':
      if(!fromHost||!inRun||!here||!Array.isArray(m.t))return;
      for(const q of m.t.slice(0,64))if(Array.isArray(q))pkApply(q[0],q[1],true);
      break;
    case 'pkq':if(MP.host&&inRun&&here&&m.d===R.depth&&(R.pk[R.depth]||[]).length)mpSend({k:'pks',d:R.depth,t:R.pk[R.depth].slice(0,64)},from);break;
    case 'fl':if(MP.host&&inRun&&here)flashStun(+m.x,+m.z,+m.p);break;
    case 'hit':
      if(!fromHost||!inRun||P.down||P.away||state==='trans')return;
      if(m.w==='drain'){P.fuel=Math.max(0,P.fuel-22);sfx('drain');say('A wisp drinks your flame',2)}
      else if(m.w==='chill'){P.chill=3.5;P.inv=1.6;sfx('drain');rumble(180,0.5,0.3);say('The shade chills you. Deeper down, its touch wounds.',2.6)}
      else if(P.inv<=0)hurt(null);
      break;
    case 'chat':{const t=String(m.t||'').slice(0,200);if(t){chatLine(p.name,p.hex,t);if(!chatOpen&&state==='play')sfx('pick')}break}
    case 'cfg':if(fromHost){MP.prox=!!m.prox;MP.mimicOn=!!m.mimic;mpVoiceUI()}break;
    case 'say':if(fromHost&&inRun&&typeof m.key==='string')mimicSay(m.key);break;
    case 'eat':if(fromHost&&inRun)mimicEat();break;
    case 'gl':glRecv(m,p);break;
    case 'wipe':if(fromHost&&inRun){MP.wiping=true;die();MP.wiping=false}break;
    case 'wof':{if(!inRun)break;const ok=Number.isInteger(m.i)&&m.i>=0&&m.i<WOF_N&&[m.a0,m.a1,m.dur].every(Number.isFinite)&&m.dur>3&&m.dur<30&&m.a1>m.a0&&m.a1-m.a0<400&&sliceAt(m.a1)===m.i;
      if(ok&&WOF.done)wofBegin(m,false);break}
    case 'rr':if(fromHost&&inRun&&rrValid(m.s)&&(!RR||m.s.ver>RR.ver||m.s.seats.length!==RR.seats.length)){RR=m.s;rrShow()}break;
    case 'rra':if(MP.host&&RR&&(m.a==='spin'||m.a==='shoot'))rrApply(m.a,from);break;
    case 'ts':{if(!fromHost||!inRun||m.d!==R.depth)break;if(m.end){TS=null;break}
      if(![m.x,m.z,m.y].every(Number.isFinite))break;
      if(!TS)TS=tsNew(m.x,m.z);
      TS.tx=m.x;TS.tz=m.z;TS.tyaw=m.y;TS.mv=+m.m||0;TS.pitching=!!m.p;TS.age=0;break}
    case 'tk':{if(!fromHost||!inRun||m.d!==R.depth)break;if(m.end){TK=null;break}
      if(![m.x,m.z,m.y].every(Number.isFinite))break;
      if(!TK)TK={x:m.x,z:m.z,yaw:m.y,walk:0,mv:0,gig:0,pause:0,t:0,gT:0,age:0,last:{},n:{type:'tickle',x:m.x,z:m.z,ph:1.7,used:true,lock:true,yaw:0,hy:0,hp:0}};
      TK.tx=m.x;TK.tz=m.z;TK.tyaw=m.y;TK.mv=+m.m||0;TK.gig=+m.g||0;TK.pause=m.p?1:0;TK.t=+m.t||0;TK.age=0;break}
  }
}
// the host's view of everyone the creatures can hunt
function mpTargets(){
  const T=[];
  if(!P.down)T.push({x:P.x,z:P.z,yaw:P.yaw,fuel:P.fuel,inSafe:P.inSafe||P.away||!!FX.frozen,inv:P.inv,loc:true,tx:P.tx,ty:P.ty});
  if(MP.host)for(const p of MP.peers.values())
    if(p.run&&!p.down&&p.d===R.depth&&p.x!==undefined&&mpFresh(p))T.push({x:p.x,z:p.z,yaw:p.yaw,fuel:p.fu,inSafe:p.safe,inv:p.inv,loc:false,p,tx:Math.floor(p.x),ty:Math.floor(p.z)});
  return T;
}
// path distance from every tile to the nearest player
function mpDist(T){
  if(T.length===1&&T[0].loc)return F.dist;
  const key=T.map(t=>t.tx+','+t.ty).join(';')+(F.door?'d':'');
  if(F.mdKey===key&&F.md)return F.md;
  const W=F.W,H=F.H,g=F.g,d=new Int16Array(W*H).fill(-1),q=new Int32Array(W*H);let qh=0,qt=0;
  for(const t of T){if(t.tx<0||t.ty<0||t.tx>=W||t.ty>=H)continue;const i=t.ty*W+t.tx;if(d[i]<0){d[i]=0;q[qt++]=i}}
  while(qh<qt){
    const c=q[qh++],cx=c%W,cy=(c/W)|0,nd=d[c]+1;
    for(let k=0;k<4;k++){const nx=cx+DIRS[k][0],ny=cy+DIRS[k][1];if(nx<0||ny<0||nx>=W||ny>=H)continue;const n=ny*W+nx;if(g[n]===0&&d[n]<0){d[n]=nd;q[qt++]=n}}
  }
  F.mdKey=key;F.md=d;return d;
}
function mpNearest(T,x,z){let b=null,bd=1e9;for(const t of T){const d=(t.x-x)**2+(t.z-z)**2;if(d<bd){bd=d;b=t}}return b}
function mpWatched(T,s){
  for(const t of T){
    const eu=Math.hypot(s.x-t.x,s.z-t.z);if(eu>=9||eu>=torchRadius(t.fuel)+0.5)continue;
    const facing=((s.x-t.x)*Math.cos(t.yaw)+(s.z-t.z)*Math.sin(t.yaw))/Math.max(eu,0.001);
    if(facing>0.55&&los(s.x,s.z,t.x,t.z))return true;
  }
  return false;
}
function mpTouching(T,s){for(const t of T)if(!t.inSafe&&Math.hypot(s.x-t.x,s.z-t.z)<0.5)return t;return null}
function mpHit(t,w){if(w!=='drain')t.p.inv=1.6;mpSend({k:'hit',w},t.p.id)}
function mpFollowShade(s,dt){
  if(s.nx===undefined)return;
  const dx=s.nx-s.x,dz=s.nz-s.z,k=Math.min(1,dt*12);
  s.x+=dx*k;s.z+=dz*k;
  if(s.stun>0)s.stun-=dt;
}
// after you fall, the camera rides along with a friend who is still standing
function mpAlive(){return [...MP.peers.values()].filter(p=>p.run&&!p.down&&p.d===R.depth&&p.rx!==undefined&&mpFresh(p))}
function mpSpectate(){
  const L=mpAlive(),f=L.find(p=>p.id===MP.follow)||L[0];
  MP.follow=f?f.id:null;
  if(!f)return;
  P.x=f.rx;P.z=f.rz;P.y=0;P.yaw=f.ryaw;P.pitch=f.rpitch*0.6;P.fuel=f.fu;P.inSafe=f.safe;
  if(Math.floor(P.x)!==P.tx||Math.floor(P.z)!==P.ty)onTileChange();
}
function mpCycle(){const L=mpAlive();if(L.length<2)return;const i=L.findIndex(p=>p.id===MP.follow);MP.follow=L[(i+1)%L.length].id}
// flags packed into a[6] of the per-frame position message: 1 down, 2 safe, 4 run, 8 away, 16 mounted, 32 unseen,
// 64+128 wheel form, 256 fat, 512 pox, 1024 frozen, 2048 bobblehead, 4096 hedgehog, 8192/16384 curl (1 / 2)
const mpPosFlags=()=>(P.down?1:0)|(P.inSafe||P.away||FX.frozen?2:0)|4|(P.away?8:0)|(P.mounted?16:0)|(P.unseen?32:0)|((wofForm()<4?wofForm():0)<<6)|(FX.fat>0?256:0)|(FX.pox>0?512:0)|(FX.frozen?1024:0)|(FX.bob>0?2048:0)|(FX.hedge>0?4096:0)|(FX.curl===1?8192:FX.curl===2?16384:0);
const mpFresh=p=>performance.now()-(p.seen||0)<15000;
const mpShown=p=>MP.on&&p.run&&!p.away&&!p.unseen&&p.d===R.depth&&p.rx!==undefined&&state!=='title'&&mpFresh(p);
function sendHubPresence(to){
  const {x,y,z,yaw,station,ride,ready}=hub.presence;
  mpSend({k:'hub',a:[r3(x),r3(y),r3(z),r3(wrapA(yaw))],station,ride,ready,deepest},to);
}
function mpTick(raw){
  if(!MP.on)return;
  if(MP.host){terminalSession.expire();tickSharedLift()}
  const dt=Math.min(raw,0.25);
  mimicTick(dt);
  for(const p of MP.peers.values()){
    if(p.x===undefined)continue;
    const k=Math.min(1,dt*12),ox=p.rx,oz=p.rz;
    p.rx+=(p.x-p.rx)*k;p.rz+=(p.z-p.rz)*k;p.ry+=(p.y-p.ry)*k;
    p.ryaw+=wrapA(p.yaw-p.ryaw)*k;p.rpitch+=(p.pitch-p.rpitch)*k;
    const sp=dt>0?Math.hypot(p.rx-ox,p.rz-oz)/dt:0;p.spd+=(sp-p.spd)*Math.min(1,dt*8);p.walk+=p.spd*dt*5.5;
    if(p.inv>0)p.inv-=raw;
  }
  // a quiet host for 15 seconds has gone (closed the tab or lost the connection)
  if(MP.guest&&MP.hostId){const h=MP.peers.get(MP.hostId);if(h&&!mpFresh(h)){mpGone(MP.hostId);if(!MP.on)return}}
  if(state==='title'){
    MP.pt-=raw;
    if(MP.pt<=0){
      MP.pt=0.1;
      sendHubPresence();
      if(MP.host&&sharedLift.trip&&hub.liftMotion)publishLiftMotion();
    }
    return;
  }
  if(state==='dead'||(MP.guest&&!MP.wantJoin))return;
  MP.pt-=raw;
  if(MP.pt<=0){
    MP.pt=1/15;
    mpSend({k:'p',d:R.depth,a:[r3(P.x),r3(P.z),r3(P.y),r3(P.yaw),r3(P.pitch),Math.round(P.fuel),mpPosFlags(),P.hp]});
  }
  rvT-=raw;
  if(state==='room'&&rvT<=0&&MP.peers.size){rvT=0.1;const q=ROOMS.snap();if(q)mpSend({k:'rv',d:R.depth,w:ROOMS.kind,q})}
  if(MP.host&&state!=='trans'){
    MP.mt-=raw;
    if(MP.mt<=0){
      MP.mt=0.1;
      const a=[],ml=[];
      for(const s of F.shades){
        if(s.type===3)continue;
        if(facingMoose(s))ml.push(a.length/6);
        a.push(r2(s.x),r2(s.z),r2(s.face||0),s.state|0,r2(Math.max(0,s.stun||0)),s.frozen?1:0);
      }
      const M=MIM;
      const moose=[...mooseLures].map(([id,l])=>[id,r2(l.x),r2(l.z),r2(l.yaw),l.hp]);
      mpSend({k:'m',d:R.depth,t:r2(R.time),b:F.blk|0,s:a,moose,ml,mi:[r2(M.x),r2(M.z),r2(M.face),M.st,M.as,M.vic,r2(M.t)]});
    }
    // everyone is down: the run is over for the whole room
    if(P.down&&!mpAlive().length){mpSend({k:'wipe'});MP.wiping=true;die();MP.wiping=false}
  }
}
// friends drawn in the maze, built from the same jointed parts as everyone else
function buildPlayer(p,t,rev,et){
  if(p.hedge&&!rev)return buildHedgehog(p,t,false);
  if(p.form&&!rev)return buildCritter(p,t,p.form,false);
  rev=rev||0;et=et||0;
  const c=p.col,cloak=[c[0]*0.72,c[1]*0.72,c[2]*0.72,2],cloakD=[c[0]*0.42,c[1]*0.42,c[2]*0.42,2];
  const leg=[0.22,0.17,0.13,2],boot=[0.3,0.19,0.1,3],belt=[0.3,0.17,0.08,3],skin=[0.86,0.65,0.5,1],wood=[0.36,0.23,0.12,6],rag=[0.13,0.1,0.08,2];
  const S=AV,v=(x,y,z)=>[x*S,y*S,z*S],ph=hashStr(p.id)%100;
  const mv=Math.min(1,p.spd/2.7),w=p.walk,sw=Math.sin(w)*mv,bob=Math.abs(Math.cos(w))*0.018*mv,breath=Math.sin(t*1.7+ph)*0.004;
  const B={p:[p.rx,Math.max(0,p.ry),p.rz],R:rYaw(p.ryaw)};
  for(const z of[-1,1]){
    const st=sw*z;
    const hip=v(0,0.45,z*0.052),knee=v(0.012+0.09*st,0.25+0.03*Math.max(0,st),z*0.058),ank=v(0.17*st,0.05+0.06*Math.max(0,-st),z*0.062);
    seg(B,hip,knee,0.047*S,0.038*S,leg);ball(B,knee,0.04*S,leg,true);seg(B,knee,ank,0.04*S,0.03*S,boot);
    ball(B,[ank[0]+0.03,ank[1]-0.02,ank[2]],[0.062*S,0.03*S,0.036*S],boot,true);
  }
  const U=subF(B,v(0,0.45+bob,0),m3(rYaw(sw*0.12),rZ(-0.06*mv)));
  ball(U,v(0,0.02,0),[0.075*S,0.06*S,0.09*S],cloakD);
  seg(U,v(0,-0.1,0),v(0,0.07,0),0.12*S,0.078*S,cloak);
  seg(U,v(0,0.045,0),v(0,0.075,0),0.083*S,0.081*S,belt);
  if(rev<=0)ball(U,v(0,0.17+breath,0),[0.066*S,0.115*S,0.09*S],cloak);
  if(p.fat&&rev<=0){ball(U,v(0.05,0.05,0),[0.15*S,0.15*S,0.17*S],cloak);ball(U,v(0.0,0.19+breath,0),[0.11*S,0.12*S,0.15*S],cloak);for(const z of[-1,1])ball(B,v(0,0.36,z*0.07),[0.08*S,0.1*S,0.07*S],cloakD)}   // 200 extra pounds
  else mimicMaw(U,v,S,rev,t,et,cloak);
  ball(U,v(-0.035,0.2+breath,0),[0.055*S,0.12*S,0.095*S],cloakD);
  const la=-sw*0.09;
  limb(U,v(0,0.225+breath,-0.1),v(-0.01+la*0.6,0.11+breath,-0.135),v(0.02+la,0.01,-0.115),0.03*S,0.027*S,0.023*S,cloak,cloak,skin,0.026*S);
  const W1=v(0.16,0.17+breath,0.12);
  limb(U,v(0,0.225+breath,0.1),v(0.05,0.11+breath,0.15),W1,0.03*S,0.027*S,0.023*S,cloak,cloak,skin,0.026*S);
  const tb=[W1[0]+0.004,W1[1]-0.05,W1[2]],tt=[W1[0]+0.03,W1[1]+0.13,W1[2]];
  seg(U,tb,tt,0.011,0.013,wood);ball(U,tt,[0.02,0.018,0.02],rag,true);
  seg(U,v(0,0.27+breath,0),v(0.003,0.31+breath,0),0.027*S,0.026*S,skin);
  const H=subF(U,v(0.003-0.03*rev,0.305+breath+0.02*rev,0),rev?m3(rZ(rev*1.05),rX(rev*0.35+Math.sin(t*23)*0.04*rev)):rZ(clamp(p.rpitch,-0.6,0.6)*0.7));
  const bk=p.bob?3:1,HS={p:H.p,R:H.R.map(q=>q*S*bk)};   // Bobblehead: the head grows from the neck and wobbles
  if(p.bob){const w=m3(rZ(Math.sin(t*6+ph)*0.25),rX(Math.sin(t*4.3+ph)*0.2));HS.R=m3(HS.R,w)}
  face(HS,{skin,blink:((t*0.23+ph*0.01)%1)<0.035?0.12:1,iris:[0.3,0.25,0.18],brow:[0.25,0.16,0.1,5],browH:0.006,eyeS:1.1,nose:[0.012,0.013,0.011],mouth:[0.6,0.32,0.3],mouthW:0.022});
  ball(HS,[-0.03,0.1,0],[0.088,0.1,0.094],cloak);
  ball(HS,[-0.05,0.04,0],[0.07,0.07,0.09],cloakD,true);
  if(p.pox)for(let i=0;i<7;i++)ball(HS,[0.075+((i*3)%4)*0.004,0.03+((i*7)%9)*0.011,((i*5)%11-5)*0.011],0.007,[0.82,0.12,0.1,1],true);   // smallpox
  return {torch:fpt(U,[tt[0],tt[1]+0.035,tt[2]])};
}
// the chest splits like a pair of doors: a ring of teeth, a red throat, and tentacles that reach
function mimicMaw(U,v,S,rev,t,et,cloak){
  const flesh=[0.55,0.06,0.1,1],dark=[0.9,0.04,0.03,7],bone=[0.86,0.82,0.7,9],tent=[0.5,0.12,0.24,1],tentD=[0.32,0.06,0.15,1];
  for(const sd of[-1,1]){const D=subF(U,v(0.01,0.17,sd*0.085),rYaw(-sd*rev*1.5));ball(D,[0.03,0,-sd*0.045*S],[0.058*S,0.112*S,0.046*S],cloak)}
  ball(U,v(0.005,0.17,0),[0.05*S,0.105*S,0.075*S],flesh);
  ball(U,v(0.03,0.17,0),[0.03*S,0.07*S,0.045*S],dark,true);
  const n=14;
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2,c=Math.cos(a),sn=Math.sin(a),o=v(0.05,0.17+0.1*sn,0.07*c),tip=v(0.075+0.02*rev,0.17+0.1*sn*(1-0.55*rev),0.07*c*(1-0.55*rev));
    seg(U,o,v(0.085+0.03*rev,0.17+0.1*sn*(1-0.6*rev),0.07*c*(1-0.6*rev)),0.016*S,0.0015,bone)}
  const L=rev*(0.22+0.3*Math.min(1,et*1.5));
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2+0.4,oy=Math.sin(a)*0.05,oz=Math.cos(a)*0.035,sp=0.5+0.2*(i%3);
    let prev=v(0.04,0.17+oy,oz);
    for(let k=1;k<=8;k++){const f=k/8,w=Math.sin(t*7+i*1.7+f*4)*0.07*f;
      const curl=Math.sin(f*3.2+t*5+i)*0.35*f;
      const q=[0.04*S+L*f*(1-0.25*f*f),(0.17+oy)*S+(Math.sin(a)*sp*f+Math.cos(a)*curl)*L+w*L,oz*S+(Math.cos(a)*sp*f-Math.sin(a)*curl)*L];
      seg(U,prev,q,(0.03-0.024*(k-1)/8)*S,(0.03-0.024*k/8)*S,k%2?tent:tentD);prev=q}
    ball(U,prev,0.008,tentD,true);
  }
}
const mpDrawn=p=>mpShown(p)&&!p.down&&!(P.down&&p.id===MP.follow);
function mpDrawPlayers(t,ex,ez,fwx,fwz){
  if(!MP.on)return;
  for(const p of MP.peers.values()){
    if(!mpDrawn(p))continue;
    if((p.rx-ex)**2+(p.rz-ez)**2>18*18||(p.rx-ex)*fwx+(p.rz-ez)*fwz<-1.5)continue;
    const rp=p.glRep&&p.glRep.h[Math.floor(p.glRep.i)],sv=rp&&[p.rx,p.rz,p.ryaw,p.ry];
    if(rp){p.rx=rp[0];p.rz=rp[1];p.ryaw=rp[2];p.ry=rp[3]}
    if(p.mounted)p.ry+=.35;
    const q=buildPlayer(p,t).torch;
    if(p.mounted)p.ry-=.35;
    if(rp){p.rx=sv[0];p.rz=sv[1];p.ryaw=sv[2];p.ry=sv[3]}
    if(p.fu>0){const k=0.55+0.45*Math.sqrt(p.fu/100),fl=1+Math.sin(t*13+p.walk)*0.08+Math.sin(t*29.3)*0.06;
      spr(q[0],q[1]+0.02,q[2],0.07*k*fl,0.12*k*fl,11,1.0,0.6,0.2,1,1);
      spr(q[0],q[1]+0.015,q[2],0.05*k,0.085*k,11,1.0,0.85,0.45,0.9,1);
      spr(q[0],q[1],q[2],0.5*k,0.5*k,7,1.0,0.5,0.15,0.25*fl,1)}
  }
}
// a friend's torch lights the walls around them
function mpLights(lights,ex,ez,B){
  if(!MP.on)return;
  for(const p of MP.peers.values()){
    if(!mpDrawn(p)||!(p.fu>0))continue;
    const cy=Math.cos(p.ryaw),sy=Math.sin(p.ryaw),x=p.rx+cy*0.17-sy*0.15,z=p.rz+sy*0.17+cy*0.15,d=(x-ex)**2+(z-ez)**2;
    if(d<220)lights.push([d-2,x,0.8+p.ry,z,B.torch,1.5*(0.3+0.7*Math.sqrt(p.fu/100)),Math.max(2.5,torchRadius(p.fu)*0.9)]);
  }
}
const tagEls=new Map(),tagV=new THREE.Vector3();
function mpTags(){
  for(const [id,el] of tagEls)if(id!=='~m'&&!MP.peers.has(id)){el.remove();tagEls.delete(id)}
  {let el=tagEls.get('~m');if(!el){el=document.createElement('div');el.className='ptag';document.body.appendChild(el);tagEls.set('~m',el)}
    const nm=MP.on&&state==='play'?mimicTagName():null;let vis=!!nm;
    if(vis){const dd=Math.hypot(MIM.rx-P.x,MIM.rz-P.z);if(dd>14||(dd>1.2&&!los(P.x,P.z,MIM.rx,MIM.rz)))vis=false}
    if(vis){tagV.set(MIM.rx,1.08*AV/0.94,MIM.rz).project(camera);if(tagV.z>1||Math.abs(tagV.x)>1.1||Math.abs(tagV.y)>1.1)vis=false}
    if(!vis)el.style.display='none';
    else{el.style.display='';const lb=(MIM.voice&&!MIM.voice.done?'🔊 ':'')+nm;if(el.textContent!==lb)el.textContent=lb;
      const as=MP.peers.get(MIM.as);el.style.color=as?as.hex:toHex(MP_COLS[hashStr(MIM.as||'')%MP_COLS.length]);
      el.style.transform=`translate(${((tagV.x+1)/2*innerWidth).toFixed(1)}px,${((1-tagV.y)/2*innerHeight).toFixed(1)}px) translate(-50%,-100%)`}}
  const show=MP.on&&state==='play';
  for(const p of MP.peers.values()){
    let el=tagEls.get(p.id);
    if(!el){el=document.createElement('div');el.className='ptag';document.body.appendChild(el);tagEls.set(p.id,el)}
    let vis=show&&mpDrawn(p);
    if(vis){const dd=Math.hypot(p.rx-P.x,p.rz-P.z);if(dd>14||(dd>1.2&&!los(P.x,P.z,p.rx,p.rz)))vis=false}
    if(vis){tagV.set(p.rx,1.08*AV/0.94+p.ry,p.rz).project(camera);if(tagV.z>1||Math.abs(tagV.x)>1.1||Math.abs(tagV.y)>1.1)vis=false}
    if(!vis){if(el.style.display!=='none')el.style.display='none';continue}
    el.style.display='';
    const label=(VOX.speaking(p.id)?'🔊 ':'')+p.name;
    if(el.textContent!==label)el.textContent=label;
    el.style.color=p.hex;
    el.style.transform=`translate(${((tagV.x+1)/2*innerWidth).toFixed(1)}px,${((1-tagV.y)/2*innerHeight).toFixed(1)}px) translate(-50%,-100%)`;
  }
}
function mpHudLine(){
  if(!MP.on)return '';
  const n=[...MP.peers.values()].filter(p=>p.run&&mpFresh(p)).length+1;
  let s=`Room ${MP.code} · ${n} player${n>1?'s':''}`;
  if(VOX.stream)s+=VOX.on?' · 🎙 talking':voiceMode==='ptt'?(touch.on?' · hold TALK':' · hold C to talk'):'';
  if(!touch.on)s+=' · Enter to chat';
  if(P.down){const f=MP.peers.get(MP.follow);s+=f?` · watching ${f.name}`+(mpAlive().length>1?' (E to switch)':''):' · fallen'}
  return s;
}
// the title, pause and game-over screens in a shared game
function mpTitle(){
  const g=MP.on&&MP.guest,n=[...MP.peers.values()].length+1;
  $('hostBtn').hidden=g;$('soloBtn').hidden=!g;$('seedLbl').hidden=g;
  $('depthLbl').hidden=g||deepest<2;
  hub.liftMode(g?{ready:!!MP.run,name:MP.run?hostName():'Room '+MP.code}:null,MP.host);
  updateLiftScreen();
  $('hubInvite').hidden=!MP.host;
  $('hubInviteLink').value=MP.host?mpLink():'';
  $('hostBtn').textContent=MP.host?'STOP HOSTING':'HOST FOR FRIENDS';
  $('hostBtn').setAttribute('aria-pressed',String(MP.host));
  $('mpJoinLine').textContent=g?(MP.run?`${hostName()} is at depth ${MP.run.d}. ${n} player${n>1?'s':''} in room ${MP.code}.`:`Room ${MP.code} · ${n} in the lobby. Follow the host to the lift.`):
    MP.host?`Room ${MP.code} · ${n} in the lobby`:'';
}
function mpPausePanel(){
  $('mpPause').hidden=!MP.on;mpVoiceUI();
  if(!MP.on)return;
  $('mpLinkIn').value=mpLink();
  const L=[myName()+' (you)'+(MP.host?' · host':'')];
  for(const p of MP.peers.values())L.push(p.name+(p.id===MP.hostId?' · host':'')+(p.down?' · fallen':p.run&&p.d!==R.depth?' · depth '+p.d:''));
  $('mpList').textContent=L.join('   ·   ');
}
function mpDeadPanel(){
  const g=MP.on&&MP.guest;
  $('againBtn').hidden=g;$('retryBtn').hidden=g;
  $('mpDeadLine').textContent=g?`Waiting for ${hostName()} to start again…`:MP.on?'Starting again takes everyone in the room with you.':'';
}
$('nameIn').value=store.get('name','')||'';
$('nameIn').addEventListener('input',()=>{store.set('name',$('nameIn').value.trim().slice(0,16));if(MP.on)mpSend({k:'hi',n:myName(),h:MP.host})});
$('hostBtn').addEventListener('click',()=>{
  if(MP.host){mpLeave(false);return}
  MP.host=true;MP.guest=false;mpOpen(newRoomCode());
  mpTitle();
});
$('hubInviteCopy').addEventListener('click',()=>{
  const input=$('hubInviteLink');
  input.select();
  try{navigator.clipboard.writeText(input.value).catch(()=>document.execCommand('copy'))}
  catch(e){document.execCommand('copy')}
});
$('soloBtn').addEventListener('click',()=>mpLeave(false));
$('copyBtn').addEventListener('click',()=>{const el=$('mpLinkIn');try{navigator.clipboard.writeText(el.value).then(()=>say('Invite link copied',2),()=>{el.select();document.execCommand('copy')})}catch(e){el.select();try{document.execCommand('copy')}catch(e2){}}});

/* ---------- chat: text in a box, voices in the maze ---------- */
const VOX=createVoice(()=>ac);
let voiceMode=['off','ptt','open'].includes(store.get('voice','off'))?store.get('voice','off'):'off';
MP.prox=!!store.get('prox',true);MP.mimicOn=!!store.get('mimic',true);
function mpCfg(){return {k:'cfg',prox:MP.prox,mimic:MP.mimicOn}}
// turn the microphone on or off for this room
async function mpVoiceSet(mode){
  voiceMode=mode;store.set('voice',mode);
  document.querySelectorAll('.voiceSel').forEach(el=>el.value=mode);
  if(mode==='off'){if(VOX.send&&MP.room)MP.room.removeStream(VOX.send);VOX.disable();return}
  initAudio();
  const had=!!VOX.stream;
  if(!await VOX.enable(mode)){say('No microphone, or permission was refused',3);document.querySelectorAll('.voiceSel').forEach(el=>el.value='off');voiceMode='off';return}
  if(!had&&MP.on&&MP.room)MP.room.addStream(VOX.send);
  if(!had)say(mode==='ptt'?'Voice on: hold C to talk':'Voice on: your microphone is open',3);
}
function mpVoiceTick(dt){
  if(!MP.on){if(VOX.on)VOX.transmit(false);return}
  const live=state==='play'||state==='pause'||state==='talk';
  const want=!!VOX.stream&&live&&!chatOpen&&(voiceMode==='open'||(voiceMode==='ptt'&&(keys.KeyC||touch.talk)));
  if(want!==VOX.on)VOX.transmit(want);
  VOX.tick(dt);
  for(const p of MP.peers.values())VOX.place(p.id,mpEar(p.rx,p.rz,p.d,p.run&&mpFresh(p)));
}
// how loud a voice at (x,z) on depth d sounds to you
function mpEar(x,z,d,present){
  if(!MP.prox||state==='title')return {gain:present||state==='title'?1:0.8,pan:0,muffle:false};
  if(!present||d!==R.depth||x===undefined||!F)return {gain:0,pan:0,muffle:false};
  const tx=Math.floor(x),tz=Math.floor(z),pd=tx>=0&&tz>=0&&tx<F.W&&tz<F.H?F.dist[tz*F.W+tx]:-1;
  const eu=Math.hypot(x-P.x,z-P.z),dd=pd<0?(eu<1.5?eu:99):Math.max(eu,pd*0.9);
  const gain=Math.pow(clamp(1-(dd-1.5)/17,0,1),1.6);
  const pan=eu<0.3?0:clamp(Math.sin(Math.atan2(z-P.z,x-P.x)-P.yaw),-1,1)*0.75;
  return {gain,pan,muffle:eu>1.2&&!los(P.x,P.z,x,z)};
}
// text chat
let chatOpen=false;
const chatLog=$('chatLog'),chatIn=$('chatIn');
function chatLine(name,col,text){
  const d=document.createElement('div');
  if(name){const b=document.createElement('b');b.textContent=name+': ';b.style.color=col;d.appendChild(b)}else d.className='sys';
  d.appendChild(document.createTextNode(text));
  d.dataset.t=performance.now();
  chatLog.appendChild(d);
  while(chatLog.children.length>40)chatLog.firstChild.remove();
  chatLog.scrollTop=chatLog.scrollHeight;
}
const mpSys=t=>{if(MP.on)chatLine('','',t)};
function chatOpenBox(){
  if(!MP.on||chatOpen)return;
  chatOpen=true;for(const k in keys)keys[k]=false;
  $('chat').classList.add('open');chatIn.value='';chatIn.focus();
}
function chatClose(send){
  if(!chatOpen)return;
  const t=chatIn.value.trim().slice(0,200);
  chatOpen=false;$('chat').classList.remove('open');chatIn.blur();
  if(send&&t){mpSend({k:'chat',t});chatLine(myName(),'#ffc27a',t)}
  if(state==='play'&&!touch.on)lock();
}
chatIn.addEventListener('keydown',e=>{e.stopPropagation();if(e.code==='Enter'||e.code==='NumpadEnter')chatClose(true);else if(e.code==='Escape')chatClose(false)});
chatIn.addEventListener('blur',()=>{if(chatOpen)setTimeout(()=>{if(chatOpen&&document.activeElement!==chatIn)chatClose(false)},0)});
function chatTick(){
  const now=performance.now();
  document.body.classList.toggle('mp',MP.on);document.body.classList.toggle('voice',!!VOX.stream&&voiceMode==='ptt');
  $('chat').hidden=(!MP.on&&!(GL.chatT>0))||state==='title';
  for(const d of chatLog.children){const age=(now-d.dataset.t)/1000,o=chatOpen?1:clamp(1-(age-12)/3,0,1);if(d.style.opacity!==String(o))d.style.opacity=o}
}
function mpVoiceUI(){
  const host=MP.on&&MP.host;
  $('hostOpts').hidden=!host;$('brainOpts').hidden=!host;
  document.querySelectorAll('.proxChk').forEach(el=>{el.checked=MP.prox;el.disabled=MP.on&&!MP.host});$('mimicChk').checked=MP.mimicOn;
  $('brainLine').textContent=BRAIN.on?(BRAIN.ok===true?'Local AI is answering.':BRAIN.ok===false?'Local AI is not answering; the mimic picks lines itself.':'Waiting for the first clip.'):'';
  $('guestOpts').textContent=MP.on&&MP.guest?`Host settings: voices ${MP.prox?'fade with distance':'carry everywhere'}, mimic ${MP.mimicOn?'on':'off'}.`:'';
}
useStore(store);
onVolumes(v=>VOX.setVolumes({voices:v.voices,mic:v.mic}));
document.querySelectorAll('.volSl').forEach(el=>{const k=el.dataset.bus,sync=()=>{el.value=Math.round(getVolumes()[k]*100)};sync();
  el.addEventListener('input',()=>{setVolumes({[k]:el.value/100});document.querySelectorAll('.volSl[data-bus='+k+']').forEach(o=>{if(o!==el)o.value=el.value})});el.addEventListener('pointerdown',()=>{if(!ac)initAudio();sync()})});
document.querySelectorAll('.voiceSel').forEach(el=>{el.value=voiceMode;el.addEventListener('change',()=>mpVoiceSet(el.value))});
document.querySelectorAll('.proxChk').forEach(el=>{el.checked=MP.prox;el.addEventListener('change',()=>{
  // a room setting: only the host decides; a guest's box just shows the host's choice
  if(MP.on&&!MP.host){el.checked=MP.prox;say('Only the host can change this',2);return}
  MP.prox=el.checked;store.set('prox',MP.prox);document.querySelectorAll('.proxChk').forEach(o=>o.checked=MP.prox);mpSend(mpCfg())})});
$('mimicChk').addEventListener('change',()=>{MP.mimicOn=$('mimicChk').checked;store.set('mimic',MP.mimicOn);mpSend(mpCfg())});

/* ---------- the mimic: wears a player's face, speaks with their recorded voice ----------
   Each player's own browser cuts what they say (only while their mic is live) into short clips
   and shares them with the room. The host moves the mimic: it takes the look and name of one
   player, creeps toward another, and now and then plays one of the first player's clips from
   where it stands. When it reaches its victim, its chest splits open. */
const CLIPS=new Map();   // player id -> [{key,buf,len,peak,text}]
let clipN=0;
function clipAdd(id,c){
  let L=CLIPS.get(id);if(!L){L=[];CLIPS.set(id,L)}
  if(L.some(q=>q.key===c.key))return;
  L.push(c);while(L.length>12)L.shift();
}
VOX.onClip=(buf,len,peak,type)=>{
  if(!MP.on||!MP.mimicOn||buf.byteLength>200000)return;
  const c={key:MP.id+':'+(++clipN),buf,len:r2(len),peak:r2(peak),type};
  clipAdd(MP.id,c);
  MP.room.sendBinary(buf,{c:'clip',key:c.key,len:c.len,peak:c.peak,type});
  mimicHear(MP.id,c);
};
function mpBinary(buf,meta,from){
  if(meta.c==='clip'&&typeof meta.key==='string'&&meta.key.startsWith(from+':')&&buf&&buf.byteLength<=200000){
    const c={key:meta.key,buf:buf instanceof ArrayBuffer?buf:buf.buffer,len:+meta.len||0,peak:+meta.peak||0,type:meta.type};
    clipAdd(from,c);mimicHear(from,c);
  }
}
// Optional: the host's own local AI (Andrew's AI-Router) listens to each clip and picks lines.
// POST {url}/transcribe with the clip's audio returns {text}; POST {url}/pick with the clips and
// the moment returns {key}. Anything that fails just falls back to the built-in choice.
// the service moved from port 7792 to 7794; a saved old default follows it
const BRAIN={on:!!store.get('brain',false),url:String(store.get('brainUrl','http://127.0.0.1:7794/emberdeep')).replace('127.0.0.1:7792/','127.0.0.1:7794/'),next:'',busy:false,ok:null};
function mimicHear(id,c){
  if(!MP.host||!BRAIN.on)return;
  fetch(BRAIN.url+'/transcribe',{method:'POST',headers:{'Content-Type':c.type||'audio/webm'},body:c.buf.slice(0)})
    .then(r=>r.ok?r.json():null).then(j=>{if(j&&typeof j.text==='string'){c.text=j.text.slice(0,200);BRAIN.ok=true}}).catch(()=>{BRAIN.ok=false});
}
function mimicAsk(id){
  const L=(CLIPS.get(id)||[]).filter(c=>c.text);
  if(!BRAIN.on||BRAIN.busy||L.length<2)return;
  const as=id===MP.id?myName():(MP.peers.get(id)||{name:'Delver'}).name,vp=MP.peers.get(MIM.vic);
  const body={as,victim:MIM.vic===MP.id?myName():(vp?vp.name:'someone'),depth:R.depth,dark:F.back&&F.blk===2,
    distance:r2(MIM.vic===MP.id?Math.hypot(MIM.x-P.x,MIM.z-P.z):vp?Math.hypot(MIM.x-vp.x,MIM.z-vp.z):99),last:MIM.lastKey,
    clips:L.map(c=>({key:c.key,text:c.text,seconds:c.len}))};
  BRAIN.busy=true;
  fetch(BRAIN.url+'/pick',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(r=>r.ok?r.json():null).then(j=>{if(j&&typeof j.key==='string')BRAIN.next=j.key}).catch(()=>{BRAIN.ok=false}).finally(()=>{BRAIN.busy=false});
}
function mimicPick(id){
  const L=CLIPS.get(id);if(!L||!L.length)return null;
  if(BRAIN.next){const c=L.find(q=>q.key===BRAIN.next);BRAIN.next='';if(c)return c}
  // otherwise favour longer, louder clips and avoid repeating the last one
  const pool=L.filter(c=>c.key!==MIM.lastKey);const P2=pool.length?pool:L;
  let tot=0;const w=P2.map(c=>{const v=0.3+Math.min(c.len,3)+c.peak*4;tot+=v;return v});
  let r=Math.random()*tot;for(let i=0;i<P2.length;i++){r-=w[i];if(r<=0)return P2[i]}
  return P2[P2.length-1];
}
const MIM={x:-99,z:-99,rx:-99,rz:-99,face:0,rface:0,st:0,as:'',vic:'',t:0,hid:53,sayT:5,gx:0,gy:0,px:-1,py:-1,walk:0,spd:0,lastKey:'',vd:null,vdKey:'',voice:null,depth:0};
// st: 0 hidden, 1 stalking, 2 revealing (eating), 3 recoiling from a flash
function mimicReset(){Object.assign(MIM,{x:-99,z:-99,rx:-99,rz:-99,st:0,hid:40+Math.random()*33,t:0,vd:null,vdKey:'',as:'',vic:'',mooseLure:null})}
const tid=t=>t.loc?MP.id:t.p.id;
function mimicHost(dt,TG){
  const M=MIM;
  if(!archiveMimic()&&(!MP.on||!MP.mimicOn)){if(M.st)mimicReset();return}
  if(M.depth!==R.depth){M.depth=R.depth;mimicReset()}
  const ids=TG.map(tid),speakers=ids.filter(id=>(CLIPS.get(id)||[]).length);
  if(M.st===0){
    M.hid-=dt;
    if(M.hid>0||TG.length<2||!speakers.length)return;
    // wear the face of someone who has spoken, and hunt someone else
    M.as=speakers[(Math.random()*speakers.length)|0];
    const others=ids.filter(id=>id!==M.as);M.vic=others[(Math.random()*others.length)|0];
    const MD=mpDist(TG);let best=null;
    for(let k=0;k<200;k++){const x=1+(Math.random()*(F.W-2)|0),y=1+(Math.random()*(F.H-2)|0),i=y*F.W+x;
      if(F.g[i]||F.safeMask[i]||F.pocketMask[i])continue;const d=MD[i];if(d>=12&&d<=26){best=[x,y];break}if(d>8&&!best)best=[x,y]}
    if(!best){M.hid=5;return}
    Object.assign(M,{x:best[0]+0.5,z:best[1]+0.5,gx:best[0],gy:best[1],px:-1,py:-1,st:1,t:0,sayT:4+Math.random()*4});
    return;
  }
  M.t+=dt;
  if(M.st===3){if(M.t>0.7){M.st=0;M.x=M.z=-99;M.hid=24+Math.random()*16}return}
  const V=TG.find(t=>tid(t)===M.vic);
  if(M.st===2){if(M.t>1.6){mimicReset()}return}
  if(followMoose(M,dt,2.65))return;
  if(!V){const others=TG.filter(t=>tid(t)!==M.as);if(!others.length){mimicReset();return}M.vic=tid(others[(Math.random()*others.length)|0]);return}
  // path toward the victim
  const key=V.tx+','+V.ty+(F.door?'d':'');
  if(M.vdKey!==key){M.vdKey=key;M.vd=bfs(F.g,F.W,F.H,V.tx,V.ty)}
  const cx=Math.floor(M.x),cz=Math.floor(M.z),d=M.vd[cz*F.W+cx],eu=Math.hypot(M.x-V.x,M.z-V.z);
  const sp=V.inSafe?0:d>=0&&d<=7?2.5:2.15;
  let gx=M.gx+0.5,gz=M.gy+0.5;
  const direct=d>=0&&d<=1&&!V.inSafe;
  if(direct){gx=V.x;gz=V.z;M.gx=cx;M.gy=cz}
  const dx=gx-M.x,dz=gz-M.z,l=Math.hypot(dx,dz),step=sp*dt;
  if(sp>0){
    if(l<=step+0.001){
      M.x=gx;M.z=gz;
      if(!direct){let bn=null,bd=d<0?1e9:d;
        for(const k of DIRS){const nx=cx+k[0],ny=cz+k[1];if(nx<0||ny<0||nx>=F.W||ny>=F.H)continue;const i=ny*F.W+nx;if(F.g[i]||F.safeMask[i]||F.pocketMask[i])continue;const nd=M.vd[i];if(nd>=0&&nd<bd){bd=nd;bn=[nx,ny]}}
        if(bn){M.px=cx;M.py=cz;M.gx=bn[0];M.gy=bn[1]}}
    }else{M.x+=dx/l*step;M.z+=dz/l*step;M.face=Math.atan2(dz,dx)}
  }else if(eu>0.01)M.face=Math.atan2(V.z-M.z,V.x-M.x);
  // talk: more often as it closes in; ask the local AI for the next line a moment early
  M.sayT-=dt;
  if(M.sayT<1.5&&!BRAIN.next)mimicAsk(M.as);
  if(M.sayT<=0&&!(M.voice&&!M.voice.done)){
    const c=mimicPick(M.as);
    if(c){M.lastKey=c.key;mpSend({k:'say',key:c.key});mimicSay(c.key)}
    M.sayT=(d>=0&&d<=10?3.5:6)+Math.random()*5;
  }
  // close enough: the chest opens
  if(eu<1.25&&!V.inSafe&&(V.loc?P.inv<=0:V.inv<=0)){
    M.st=2;M.t=0;M.face=Math.atan2(V.z-M.z,V.x-M.x);
    if(V.loc)mimicEat();else mpSend({k:'eat'},V.p.id);
  }
}
function mimicFlash(x,z){
  if(MIM.st!==1||Math.hypot(MIM.x-x,MIM.z-z)>=6.5||!los(x,z,MIM.x,MIM.z))return 0;
  MIM.st=3;MIM.t=0;return 1;
}
// play one of the disguise's clips from where the mimic stands
function mimicSay(key){
  for(const [id,L] of CLIPS){const c=L.find(q=>q.key===key);if(c){
    // never replay a player's own recorded voice back to them (MIM.voice stays untouched)
    if(id===MP.id||key.startsWith(MP.id+':'))return;
    VOX.playClip(key,c.buf,mpEar(MIM.rx,MIM.rz,R.depth,true)).then(h=>{MIM.voice=h});return}}
}
// you are the one it reached
function mimicEat(){
  if(P.down||P.grab||state==='title'||state==='dead')return;
  P.grab={t:0,x:MIM.rx>0?MIM.rx:P.x+Math.cos(P.yaw),z:MIM.rx>0?MIM.rz:P.z+Math.sin(P.yaw)};for(const k in keys)keys[k]=false;
  roomPauseHide(false);
  if(state==='pause'){$('pause').classList.add('hidden');state='play'}
  if(state==='talk'){$('talk').classList.add('hidden');talk=null;state='play'}
  if(chatOpen)chatClose(false);
  sfx('scare');rumble(1400,1,1);try{if(touch.on&&navigator.vibrate)navigator.vibrate([200,60,400])}catch(e){}
}
function mimicGrabTick(dt){
  const G=P.grab;G.t+=dt;
  if(MIM.st===2&&MIM.rx>0){G.x=MIM.rx;G.z=MIM.rz}
  const want=Math.atan2(G.z-P.z,G.x-P.x);
  P.yaw+=wrapA(want-P.yaw)*Math.min(1,dt*14);P.pitch+=(0.05-P.pitch)*Math.min(1,dt*10);
  // dragged in
  const dd=Math.hypot(G.x-P.x,G.z-P.z);
  if(dd>0.75&&dd<3&&G.t>0.35){const k=Math.min(1,dt*3)*(1-0.75/dd),nx=P.x+(G.x-P.x)*k,nz=P.z+(G.z-P.z)*k;if(!blocked(nx,nz)){P.x=nx;P.z=nz}}
  const s=$('scare');s.style.opacity=clamp(G.t*2.5,0,1)*(0.55+0.45*Math.sin(G.t*40));
  if(G.t>=1.45){
    P.grab=null;s.style.opacity=0;
    const who=MIM.as===MP.id?'your':(MP.peers.get(MIM.as)||{name:'a friend'}).name+"'s";
    P.hp=0;
    if(MP.on){mpDown();say(`The mimic wore ${who} face.`,5);mpSys(myName()+' was taken by the mimic')}else die();
  }
}
// the mimic's look on every screen: the disguise, or the thing underneath
function mimicDraw(t,ex,ez){
  const M=MIM;if(M.st===0||M.rx<0||(!MP.on&&!archiveMimic()))return;
  if((M.rx-ex)**2+(M.rz-ez)**2>18*18)return;
  const as=MP.peers.get(M.as),col=as?as.col:MP_COLS[hashStr(M.as||'')%MP_COLS.length];
  const rev=M.st===2?clamp(M.t/0.45,0,1):M.st===3?Math.sin(clamp(M.t/0.7,0,1)*Math.PI)*0.7:0;
  const q=buildPlayer({id:M.as+'~',col,rx:M.rx,ry:0,rz:M.rz,ryaw:M.rface,rpitch:0,spd:M.spd,walk:M.walk},t,rev,M.st===2?M.t:0);
  if(rev<0.5){const k=1,fl=1+Math.sin(t*13)*0.08;
    spr(q.torch[0],q.torch[1]+0.02,q.torch[2],0.07*k*fl,0.12*k*fl,11,1.0,0.6,0.2,1,1);
    spr(q.torch[0],q.torch[1],q.torch[2],0.5*k,0.5*k,7,1.0,0.5,0.15,0.22*fl,1)}
  else spr(M.rx,0.6,M.rz,1.6,1.6,7,0.6,0.02,0.05,0.35*rev,1);
}
function mimicTick(dt){
  const M=MIM;
  if(M.st===0||M.x<0){M.rx=M.rz=-99;return}
  if(M.rx<0||Math.hypot(M.x-M.rx,M.z-M.rz)>2.5){M.rx=M.x;M.rz=M.z;M.rface=M.face}
  const k=Math.min(1,dt*12),ox=M.rx,oz=M.rz;
  M.rx+=(M.x-M.rx)*k;M.rz+=(M.z-M.rz)*k;M.rface+=wrapA(M.face-M.rface)*k;
  const sp=dt>0?Math.hypot(M.rx-ox,M.rz-oz)/dt:0;M.spd+=(sp-M.spd)*Math.min(1,dt*8);M.walk+=M.spd*dt*5.5;
  if(MP.guest)M.t+=dt;
  if(M.voice&&!M.voice.done)VOX.placeClip(M.voice,mpEar(M.rx,M.rz,R.depth,true));
}
function mimicTagName(){const M=MIM;if(M.st!==1)return null;return M.as===MP.id?myName():(MP.peers.get(M.as)||{name:'Delver'}).name}
$('brainChk').checked=BRAIN.on;$('brainUrl').value=BRAIN.url;
$('brainChk').addEventListener('change',()=>{BRAIN.on=$('brainChk').checked;store.set('brain',BRAIN.on);BRAIN.ok=null;if(BRAIN.on&&MP.host)for(const [id,L] of CLIPS)for(const c of L)if(!c.text)mimicHear(id,c)});
$('brainUrl').addEventListener('change',()=>{BRAIN.url=$('brainUrl').value.trim().replace(/\/+$/,'');store.set('brainUrl',BRAIN.url);BRAIN.ok=null});

/* ---------- input ---------- */
const keys={};
addEventListener('keydown',e=>{
  if(loading){if(e.code==='Tab'||e.code==='Enter'||e.code==='Space')e.preventDefault();return}
  if(state==='title'&&activeStation){
    if(e.code==='Escape'){e.preventDefault();closeStation();return}
    const scroll={ArrowUp:-60,ArrowDown:60,PageUp:-300,PageDown:300}[e.code];
    if(scroll&&scrollNews(scroll)){e.preventDefault();return}
    if(e.code==='Tab'){
      const controls=stationControls(),first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&e.target===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&e.target===last){e.preventDefault();first.focus()}
      return;
    }
  }
  const roomMode=state==='room'?ROOMS.controlMode():'';
  if(roomMode&&!e.repeat)roomDevice='keyboard';
  if(archiveRun&&(e.code==='KeyT'||e.code==='Escape'&&state==='room'&&roomMode!=='table'&&roomMode!=='read')){
    e.preventDefault();finishArchive();return;
  }
  if(e.target?.matches?.('select, input')){
    const walking=state==='title'&&activeStation&&/^Key[WASD]$/.test(e.code);
    const editing=e.target.matches('input[type=text]:not([readonly]), input[type=number]');
    if(!walking||editing)return;
  }
  if(state==='title'&&(e.code==='Tab'||e.target?.closest?.('button')&&(e.code==='Enter'||e.code==='Space')))return;
  if(e.target===$('archiveBack')&&(e.code==='Enter'||e.code==='Space'))return;
  if(state==='room'&&(e.code==='Tab'||e.target?.closest?.('button')&&['Enter','NumpadEnter','Space'].includes(e.code)))return;
  if(lobbyPaused||roomPaused){
    const go=['Enter','NumpadEnter','KeyP'].includes(e.code)||(lobbyPaused&&e.code==='Space')||(e.code==='Escape'&&performance.now()-pausedAt>300);
    if(go||e.code==='Tab'||e.code==='Space')e.preventDefault();
    if(e.repeat)return;
    if(go){if(lobbyPaused)lobbyPauseHide(true);else roomPauseHide(false)}
    else if(roomPaused&&e.code==='KeyT')toTitle();
    return;
  }
  if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(roomMode==='table'&&['Backspace','Enter','NumpadEnter','Escape'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  keys[e.code]=true;
  initAudio();
  if(e.code==='KeyF'){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{})}
  if(e.code==='KeyV'&&!(state==='room'&&ROOMS.kind==='theater'))toggleMute();   // in the picture house V is your voice when there is no microphone
  if(e.code==='BracketRight')setBright(bright+0.15);
  if(e.code==='BracketLeft')setBright(bright-0.15);
  if(state==='title'){
    if(e.code==='KeyE'||e.code==='Enter'){e.preventDefault();hub.interact()}
  }
  else if(state==='play'){
    if(e.code==='Space')P.jumpQ=MOVE.jumpBuffer;
    if(e.code==='KeyE')act();
    if(e.code==='KeyQ')usePick();
    if(e.code==='KeyR')useMoose();
    if(e.code==='KeyG')useMoose(true);
    if(e.code==='KeyM'||e.code==='Tab')mapBig=!mapBig;
    if(e.code==='Escape'||e.code==='KeyP')pause();
    if((e.code==='Enter'||e.code==='NumpadEnter'||e.code==='KeyT')&&MP.on){e.preventDefault();chatOpenBox()}
  }else if(state==='room'){
    if((e.code==='KeyT'||roomMode!=='table'&&(e.code==='Enter'||e.code==='NumpadEnter'))&&MP.on){e.preventDefault();chatOpenBox()}
  }else if(state==='talk'){
    if(e.code==='Escape'||e.code==='KeyQ')closeTalk();
    else if(e.code==='ArrowUp'||e.code==='KeyW')moveTalk(-1);
    else if(e.code==='ArrowDown'||e.code==='KeyS')moveTalk(1);
    else if(e.code==='Enter'||e.code==='KeyE'||e.code==='Space')pickTalk();
    else if(/^Digit[1-9]$/.test(e.code)){const i=+e.code.slice(5)-1;if(talk&&i<talk.opts.length){talk.sel=i;pickTalk()}}
  }else if(state==='pause'){
    if(e.code==='Enter'||e.code==='KeyP'||(e.code==='Escape'&&performance.now()-pausedAt>300))resume(false);
    if(e.code==='KeyT')toTitle();
  }else if(state==='dead'){
    if(e.code==='Enter')startFromMenu();
    if(e.code==='KeyR')startFromMenu(R.seed,R.startDepth);
    if(e.code==='KeyT')toTitle();
  }
});
addEventListener('keyup',e=>{keys[e.code]=false});
const lobbyHadLock=()=>state==='title'&&(usingLock||!!document.pointerLockElement);
addEventListener('blur',()=>{const lobby=lobbyHadLock();for(const k in keys)keys[k]=false;mouseL=false;pause();if(lobby)lobbyPauseShow()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){const lobby=lobbyHadLock();pause();if(lobby)lobbyPauseShow()}});
document.addEventListener('mousemove',e=>{
  const drag=(state==='title'||state==='room')&&(e.buttons&2);
  if(loading||lobbyPaused||roomPaused||!['title','play','room'].includes(state)||(!drag&&document.pointerLockElement!==canvas))return;
  const mx=e.movementX,my=e.movementY;
  if(!isFinite(mx)||!isFinite(my)||Math.abs(mx)>600||Math.abs(my)>600)return;
  if(state==='title'){hub.look(mx*MOVE.mouse*sens,my*MOVE.mouse*sens);return}
  if(state==='room'){if(mx||my)roomDevice='keyboard';ROOMS.look(mx*MOVE.mouse*sens,my*MOVE.mouse*sens);return}
  if(glLook(mx*MOVE.mouse*sens,-my*MOVE.mouse*sens))return;
  if(FX.frozen){if(BRK)BRK.look(mx*MOVE.mouse*sens,my*MOVE.mouse*sens);return}
  lookBy(P,mx*MOVE.mouse*sens,my*MOVE.mouse*sens,MOVE.pitch);
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas)usingLock=true;
  else if(usingLock){
    usingLock=false;
    if(state==='title')lobbyPauseShow();
    else if(state==='room')roomPauseShow();
    else pause();
  }
});
const onMooseTable=()=>state==='room'&&ROOMS.kind==='moose'&&ROOMS.state()?.table;
document.addEventListener('pointerdown',e=>{
  if(state==='room')roomDevice=e.pointerType==='touch'?'touch':'keyboard';
});
$('roomHud').addEventListener('click',e=>{
  const choice=e.target.closest('button[data-room-choice]');
  if(state==='room'&&choice)ROOMS.choose(Number(choice.dataset.roomChoice));
});
canvas.addEventListener('click',e=>{
  if(loading)return;
  if(lobbyPaused){lobbyPauseHide(true);return}
  if(state==='title'){
    initAudio();
    if(document.pointerLockElement)hub.interact();
    else if(hub.tap(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2))return;
    else if(!document.pointerLockElement&&!touch.on){closeStation();lock()}
  }else if((state==='play'||state==='room'&&!onMooseTable())&&!document.pointerLockElement)lock();
});
const selectMooseTile=e=>ROOMS.tap(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);
canvas.addEventListener('pointerdown',e=>{
  if(!loading&&onMooseTable()&&e.button===0)selectMooseTile(e);
});
canvas.addEventListener('mousedown',e=>{if(loading)return;if(state==='room'&&!onMooseTable()&&e.button===0)mouseL=true;if(state!=='play'||document.pointerLockElement!==canvas)return;if(e.button===0)act();else if(e.button===2)P.jumpQ=MOVE.jumpBuffer});
addEventListener('mouseup',e=>{if(e.button===0)mouseL=false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('resumeBtn').addEventListener('click',()=>resume(true));
$('lobbyPause').addEventListener('click',()=>{initAudio();lobbyPauseHide(true)});
$('againBtn').addEventListener('click',()=>{startFromMenu();lock()});
// touch controls
const touch={on:false,mx:0,my:0,jump:false,stickId:null,lookId:null,tapId:null,sx:0,sy:0,lx:0,ly:0};
function enableTouch(){
  if(touch.on)return;touch.on=true;document.body.classList.add('touch');
  const upd=()=>{$('rotHint').textContent=innerHeight>innerWidth?'Turn your phone sideways for a wider view':''};
  upd();addEventListener('resize',upd);
}
if(window.matchMedia&&matchMedia('(pointer:coarse)').matches)enableTouch();
addEventListener('touchstart',()=>{enableTouch();if(state==='room')roomDevice='touch';initAudio()},{passive:true});
{
  const layer=$('touch'),base=$('stickBase'),knob=$('stickKnob'),SR=52;
  const sceneTaps=new Map();
  const setStick=(x,y)=>{
    let dx=x-touch.sx,dy=y-touch.sy;const l=Math.hypot(dx,dy);
    if(l>SR){dx*=SR/l;dy*=SR/l}
    knob.style.left=(touch.sx+dx)+'px';knob.style.top=(touch.sy+dy)+'px';
    const m=Math.min(l,SR)/SR,dead=0.14;
    if(m<dead){touch.mx=touch.my=0}else{touch.mx=dx/SR/m*((m-dead)/(1-dead));touch.my=dy/SR/m*((m-dead)/(1-dead))}
  };
  const endStick=()=>{touch.stickId=null;touch.mx=touch.my=0;base.style.display=knob.style.display='none'};
  layer.addEventListener('touchstart',e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      const dragToLook=state==='title'||onMooseTable();
      if(dragToLook)sceneTaps.set(t.identifier,[t.clientX,t.clientY]);
      // in the kiln hall a tap right on a button within reach presses it
      if(state==='room'&&!dragToLook&&touch.tapId===null&&ROOMS.tap(t.clientX/innerWidth*2-1,1-t.clientY/innerHeight*2)){touch.tapId=t.identifier;continue}
      if(touch.stickId===null&&t.clientX<innerWidth*0.45&&!(state==='room'&&ROOMS.controlMode()==='look')){
        touch.stickId=t.identifier;touch.sx=t.clientX;touch.sy=t.clientY;
        base.style.left=knob.style.left=t.clientX+'px';base.style.top=knob.style.top=t.clientY+'px';
        base.style.display=knob.style.display='block';
      }else if(touch.lookId===null){touch.lookId=t.identifier;touch.lx=t.clientX;touch.ly=t.clientY}
    }
  },{passive:false});
  layer.addEventListener('touchmove',e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      const start=sceneTaps.get(t.identifier);
      if(start&&Math.hypot(t.clientX-start[0],t.clientY-start[1])>12)sceneTaps.delete(t.identifier);
      if(t.identifier===touch.stickId)setStick(t.clientX,t.clientY);
      else if(t.identifier===touch.lookId){
        if(state==='title')hub.look((t.clientX-touch.lx)*MOVE.touchX*sens,(t.clientY-touch.ly)*MOVE.touchY*sens);
        if(state==='room')ROOMS.look((t.clientX-touch.lx)*MOVE.touchX*sens,(t.clientY-touch.ly)*MOVE.touchY*sens);
        if(state==='play'&&!glLook((t.clientX-touch.lx)*MOVE.touchX*sens,-(t.clientY-touch.ly)*MOVE.touchY*sens))lookBy(P,(t.clientX-touch.lx)*MOVE.touchX*sens,(t.clientY-touch.ly)*MOVE.touchY*sens,MOVE.pitch)
        touch.lx=t.clientX;touch.ly=t.clientY;
      }
    }
  },{passive:false});
  const end=e=>{
    for(const t of e.changedTouches){
      if(t.identifier===touch.stickId)endStick();
      else if(t.identifier===touch.lookId)touch.lookId=null;
      else if(t.identifier===touch.tapId){touch.tapId=null;ROOMS.untap()}
      if(sceneTaps.delete(t.identifier)&&e.type==='touchend'){
        if(state==='title')hub.tap(t.clientX/innerWidth*2-1,1-t.clientY/innerHeight*2);
        else if(onMooseTable())selectMooseTile(t);
      }
    }
  };
  layer.addEventListener('touchend',end);layer.addEventListener('touchcancel',end);
  const btn=(id,down,up)=>{const el=$(id);
    el.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();el.classList.add('on');down()},{passive:false});
    const u=e=>{e.preventDefault();e.stopPropagation();el.classList.remove('on');if(up)up()};
    el.addEventListener('touchend',u);el.addEventListener('touchcancel',u);
    el.addEventListener('touchmove',e=>{e.preventDefault();e.stopPropagation()},{passive:false});};
  btn('tJump',()=>{touch.jump=true;if(state==='play')P.jumpQ=MOVE.jumpBuffer},()=>{touch.jump=false});
  btn('tFlash',()=>{
    touch.act=true;
    if(state==='play')act();
    else if(state==='title')hub.interact();
  },()=>{touch.act=false});
  btn('tPause',()=>{touch.jump=false;endStick();touch.lookId=null;touch.tapId=null;ROOMS.untap();pause()});
  btn('tMap',()=>{mapBig=!mapBig});
  btn('tPick',()=>{usePick()});
  btn('tMoose',()=>{useMoose()});
  btn('tLure',()=>{useMoose(true)});
  btn('tTalk',()=>{touch.talk=true},()=>{touch.talk=false});
  btn('tChat',()=>{chatOpenBox()});
  $('quitBtn').addEventListener('click',toTitle);
  $('retryBtn').addEventListener('click',()=>startFromMenu(R.seed,R.startDepth));
  document.addEventListener('contextmenu',e=>{if(touch.on)e.preventDefault()});
}
// optional gamepad
// Xbox-style controller (standard mapping): sticks move and look, A jump, X/B/RT flash,
// LT/LB/left-stick click sprint, Y map, Start pause, Back quits to title from a menu
const pad={mx:0,my:0,lx:0,ly:0,sprint:false,jump:false,prev:[],roomButtons:[],gp:null,id:''};
function pickPad(){
  const list=navigator.getGamepads?navigator.getGamepads():[];let best=null;
  for(const g of list){if(!g||!g.connected||g.buttons.length<10||g.axes.length<4)continue;if(g.mapping==='standard')return g;if(!best)best=g}
  return best;
}
function rumble(ms,strong,weak){
  try{const a=pad.gp&&pad.gp.vibrationActuator;if(a&&a.playEffect)a.playEffect('dual-rumble',{duration:ms,strongMagnitude:strong,weakMagnitude:weak})}catch(e){}
}
function pollPad(){
  pad.mx=pad.my=pad.lx=pad.ly=0;pad.sprint=false;pad.jump=false;pad.roomButtons.length=0;
  const gp=pickPad();pad.gp=gp;
  if(!gp){if(pad.id){pad.id='';$('padLine').textContent='';pad.prev=[]}return}
  if(pad.id!==gp.id){pad.id=gp.id;initAudio();
    $('padLine').innerHTML='Controller connected. <b>Left stick</b> move · <b>Right stick</b> look · <b>A</b> jump · <b>X</b> or <b>RT</b> flash · <b>LT</b> or click left stick to sprint · <b>Y</b> map · <b>RB</b> pickaxe · <b>Start</b> pause';
    if(state==='play')say('Controller connected',2)}
  const B=i=>{const b=gp.buttons[i];return !!b&&(b.pressed||b.value>0.4)};
  if(loading){pad.prev=gp.buttons.map((_,i)=>B(i));return}
  if(state==='room'||state==='title')pad.roomButtons=gp.buttons.map((_,i)=>B(i));
  const hit=i=>B(i)&&!pad.prev[i];
  const curve=v=>{const a=Math.abs(v);if(a<0.2)return 0;const k=(a-0.2)/0.8;return Math.sign(v)*k};
  pad.mx=curve(gp.axes[0]||0);pad.my=curve(gp.axes[1]||0);
  const lx=curve(gp.axes[2]||0),ly=curve(gp.axes[3]||0);
  pad.lx=lx*(0.45+0.55*Math.abs(lx))*sens;pad.ly=ly*(0.45+0.55*Math.abs(ly))*sens;
  if(state==='room'&&(pad.roomButtons.some(Boolean)||pad.mx||pad.my||lx||ly))roomDevice='controller';
  if(lobbyPaused||roomPaused){
    if(hit(0)||hit(9)||(lobbyPaused&&hit(1)))lobbyPaused?lobbyPauseHide(false):roomPauseHide(false);
    else if(roomPaused&&hit(8))toTitle();
    for(let i=0;i<gp.buttons.length;i++)pad.prev[i]=B(i);
    return;
  }
  if(state==='play'){
    if(archiveRun&&hit(8)){finishArchive();pad.prev[8]=true;return}
    pad.jump=B(0)&&performance.now()>padHold;
    pad.curl=FX.hedge>0&&B(4);pad.roll=FX.hedge>0&&B(11);   // the hedgehog borrows LB and the right stick click
    if(B(6)||(B(4)&&!(FX.hedge>0)))pad.sprint=true;
    if(hit(10))pad.sprintLatch=!pad.sprintLatch;
    if(Math.hypot(pad.mx,pad.my)<0.3)pad.sprintLatch=false;
    if(pad.sprintLatch)pad.sprint=true;
    if(hit(2)||hit(1)||hit(7))act();
    if(hit(5))usePick();
    if(hit(12))useMoose();
    if(hit(13))useMoose(true);
    if(hit(3))mapBig=!mapBig;
    if(hit(9))pause();
    if(hit(14))setBright(bright-0.15);
    if(hit(15))setBright(bright+0.15);
  }else if(state==='title'){
    pad.sprint=B(6)||B(4);
    if(activeStation){
      if(hit(1)||hit(8))closeStation();
      else if(hit(0)||hit(2)){
        const controls=stationControls();
        (controls.includes(document.activeElement)?document.activeElement:controls[0])?.click();
      }
      else if((hit(12)||hit(13))&&scrollNews(hit(12)?-90:90));
      else if(hit(12)||hit(13)){
        const controls=stationControls(),i=controls.indexOf(document.activeElement);
        controls[i<0?0:(i+(hit(12)?-1:1)+controls.length)%controls.length]?.focus();
      }else if(hit(14)||hit(15))adjustStationControl(hit(14)?-1:1);
    }else{
      if(hit(2)||hit(7)||hit(9))hub.interact();
    }
  }
  else if(state==='room'&&archiveRun&&hit(8))finishArchive();
  else if(state==='talk'){
    const sy=(gp.axes[1]||0)>0.6?1:(gp.axes[1]||0)<-0.6?-1:0;
    if(hit(12)||(sy<0&&pad.psy!==-1))moveTalk(-1);else if(hit(13)||(sy>0&&pad.psy!==1))moveTalk(1);
    pad.psy=sy;
    if(hit(0)||hit(2))pickTalk();else if(hit(1)||hit(9))closeTalk();
  }
  else if(state==='pause'){if(hit(0)||hit(9))resume(false);else if(hit(8))toTitle()}
  else if(state==='dead'){if(hit(0)||hit(9))startFromMenu();else if(hit(2))startFromMenu(R.seed,R.startDepth);else if(hit(8)||hit(1))toTitle()}
  for(let i=0;i<gp.buttons.length;i++)pad.prev[i]=B(i);
}
addEventListener('gamepadconnected',()=>{});

/* ---------- audio (all synthesized) ---------- */
let ac=null,master=null,sfxBus=null,CHASE={n:0,near:99},muted=store.get('muted',false),noiseBuf=null;
function initAudio(){
  if(ac){if(ac.state==='suspended')ac.resume();return}
  try{
    ac=new (window.AudioContext||window.webkitAudioContext)();
    master=ac.createGain();master.gain.value=muted?0:0.55;wofOut=ac.createGain();wofOut.connect(ac.destination);master.connect(wofOut); // wofOut: the Hearing Aids boost
    noiseBuf=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);
    const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const buses=initMusic(ac,master,store);sfxBus=buses.sfx;
    initAmbience(ac,buses.ambience,noiseBuf);
    // low ambient drone
    for(const[f,v]of[[55,0.05],[82.6,0.03],[110.7,0.015]]){const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(sfxBus);o.start()}
  }catch(e){ac=null}
}
// fluorescent buzz and the air handling of the humming rooms
let humG=null,hvG=null,humB=-1,hvB=-1;
function setHum(){
  if(!ac)return;
  const on=F&&F.back&&state!=='title'&&state!=='dead';
  const b=on?0.02*panelLvl:0,h=on?0.1:0;
  if(!humG){
    if(!on)return;
    humG=ac.createGain();humG.gain.value=0;humG.connect(sfxBus);
    const o=ac.createOscillator(),hp=ac.createBiquadFilter();o.type='sawtooth';o.frequency.value=120;hp.type='highpass';hp.frequency.value=700;o.connect(hp);hp.connect(humG);o.start();
    const o2=ac.createOscillator(),g2=ac.createGain();o2.frequency.value=60;g2.gain.value=1.6;o2.connect(g2);g2.connect(humG);o2.start();
    hvG=ac.createGain();hvG.gain.value=0;hvG.connect(sfxBus);
    const n=ac.createBufferSource(),lp=ac.createBiquadFilter();n.buffer=noiseBuf;n.loop=true;lp.type='lowpass';lp.frequency.value=210;n.connect(lp);lp.connect(hvG);n.start();
  }
  if(b!==humB){humB=b;humG.gain.setTargetAtTime(b,ac.currentTime,0.02)}
  if(h!==hvB){hvB=h;hvG.gain.setTargetAtTime(h,ac.currentTime,0.5)}
}
function toggleMute(){muted=!muted;store.set('muted',muted);if(master)master.gain.value=muted?0:0.55;say(muted?'Sound off':'Sound on',1)}
function tone(freq,dur,type,vol,when,slide,pan){
  if(!ac)return;
  const t=ac.currentTime+(when||0),o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(freq,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+dur);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol||0.2,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g);let out=g;
  if(pan&&ac.createStereoPanner){const p=ac.createStereoPanner();p.pan.value=clamp(pan,-1,1);g.connect(p);out=p}
  out.connect(sfxBus);o.start(t);o.stop(t+dur+0.05);
}
function noise(dur,vol,freq,q){
  if(!ac)return;
  const t=ac.currentTime,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
  s.buffer=noiseBuf;s.loop=true;f.type='bandpass';f.frequency.value=freq;f.Q.value=q||1;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f);f.connect(g);g.connect(sfxBus);s.start(t,Math.random()*0.5);s.stop(t+dur+0.02);
}
function sfx(n){
  switch(n){
    case 'scare':tone(70,1.4,'sawtooth',0.55,0,-30);tone(466,1.1,'square',0.22,0,-260);tone(493,1.1,'sawtooth',0.22,0.02,-300);
      tone(1250,0.6,'sawtooth',0.18,0.05,-900);noise(1.3,0.7,1600,0.6);noise(0.5,0.6,300,0.8);break;
    case 'step':if(F&&F.back)noise(0.12,0.1,110+Math.random()*50,0.8);else noise(0.09,0.12,260+Math.random()*120,1.2);break;
    case 'watch':tone(196,1.8,'sine',0.05);tone(207.6,1.8,'sine',0.05);break;
    case 'gone':noise(0.4,0.07,1700,0.7);tone(240,0.5,'sine',0.04,0,-120);break;
    case 'powerdown':tone(120,1.5,'sawtooth',0.1,0,-98);noise(0.12,0.2,2600,2);break;
    case 'powerup':noise(0.1,0.25,3000,2);tone(45,0.5,'sawtooth',0.1,0,80);break;
    case 'knock':{const pan=Math.random()*2-1,n=2+((Math.random()*3)|0);for(let i=0;i<n;i++)tone(74,0.13,'sine',0.11,i*0.27,-22,pan);break}
    case 'noclip':tone(520,0.6,'sine',0.08,0,-320);tone(780,0.6,'sine',0.05,0.05,-480);noise(0.45,0.08,5200,4);break;
    case 'gem':tone(1320,0.12,'triangle',0.12);tone(1760,0.16,'triangle',0.1,0.06);break;
    case 'shard':[660,880,1320,1760].forEach((f,i)=>tone(f,0.5,'sine',0.14,i*0.09));break;
    case 'oil':tone(330,0.25,'triangle',0.15,0,220);noise(0.3,0.08,900,2);break;
    case 'pick':tone(740,0.12,'square',0.06);tone(988,0.2,'square',0.06,0.08);break;
    case 'flash':noise(0.6,0.4,2400,0.6);tone(1800,0.5,'sine',0.15,0,-1500);break;
    case 'hurt':tone(160,0.35,'sawtooth',0.25,0,-100);noise(0.25,0.3,400,1);break;
    case 'growl':tone(70,0.8,'sawtooth',0.14,0,40);break;
    case 'moose':tone(104,.95,'triangle',.34,0,-43);tone(185,.68,'sawtooth',.10,.09,-103);tone(244,.48,'triangle',.09,.18,-128);noise(.54,.09,500,1);break;
    case 'scout':tone(780,.09,'sine',.027);tone(1040,.12,'sine',.022,.09);break;
    case 'seal':tone(110,0.4,'square',0.08,0,-30);break;
    case 'descend':[440,330,247,165].forEach((f,i)=>tone(f,0.6,'triangle',0.14,i*0.12));break;
    case 'ding':tone(1046,0.22,'sine',0.16);tone(1568,0.32,'sine',0.11,0.07);break;
    case 'die':tone(220,1.6,'sawtooth',0.2,0,-180);break;
    case 'jump':tone(190,0.13,'sine',0.07,0,140);break;
    case 'spike':noise(0.07,0.22,3200,3);break;
    case 'door':tone(90,0.8,'sawtooth',0.14,0,-40);noise(0.7,0.2,300,1);break;
    case 'key':tone(1046,0.15,'triangle',0.12);tone(1568,0.3,'triangle',0.12,0.1);break;
    case 'drain':tone(900,0.6,'sine',0.16,0,-720);break;
    case 'scrape':noise(0.2,0.12,140,2);break;
    case 'beat':tone(58,0.14,'sine',0.35);tone(52,0.16,'sine',0.25,0.17);break;
  }
}

/* ---------- the watcher: seen at the far end of a corridor, gone when you look back ---------- */
function banish(s,quiet){s.x=-99;s.z=-99;s.hid=10+Math.random()*14;s.seen=0;if(!quiet)sfx('gone')}
function watcher(s,dt,pfx,pfz){
  s.vis=false;
  const bo=F.blk===2;
  if(s.x<0){
    s.hid-=dt;
    if(s.hid>0||P.inSafe)return;
    s.hid=0.8;
    for(let k=0;k<8;k++){
      const a=P.yaw+(Math.random()-0.5)*(bo?6.28:0.9),r=bo?5+Math.random()*4:6.5+Math.random()*7;
      const x=Math.floor(P.x+Math.cos(a)*r),z=Math.floor(P.z+Math.sin(a)*r);
      if(x<1||z<1||x>=F.W-1||z>=F.H-1)continue;
      const i=z*F.W+x;
      if(F.g[i]!==0||F.safeMask[i]||!los(P.x,P.z,x+0.5,z+0.5))continue;
      s.x=x+0.5;s.z=z+0.5;s.gx=x;s.gy=z;s.seen=0;s.life=10+Math.random()*8;
      if(!bo)sfx('watch');
      return;
    }
    return;
  }
  if(P.inSafe){banish(s,true);return}
  const dx=s.x-P.x,dz=s.z-P.z,eu=Math.hypot(dx,dz);
  if(bo){
    // with the lights out it comes for you, slowly
    let gx=s.gx+0.5,gz=s.gy+0.5;
    if(eu<1.3){gx=P.x;gz=P.z}
    const mx=gx-s.x,mz=gz-s.z,l=Math.hypot(mx,mz),step=1.9*dt;
    if(l<=step+0.001){
      if(eu>=1.3){
        s.x=gx;s.z=gz;
        const cx=s.gx,cz=s.gy;let bd=F.dist[cz*F.W+cx];if(bd<0)bd=1e9;
        for(const k of DIRS){const nx=cx+k[0],nz=cz+k[1],i=nz*F.W+nx;if(F.g[i]||F.safeMask[i]||F.pocketMask[i])continue;const nd=F.dist[i];if(nd>=0&&nd<bd){bd=nd;s.gx=nx;s.gy=nz}}
      }
    }else{s.x+=mx/l*step;s.z+=mz/l*step}
    if(eu<0.5&&P.inv<=0){hurt(null);banish(s,true)}
    return;
  }
  const watched=(dx*pfx+dz*pfz)/Math.max(eu,0.001)>0.75&&los(P.x,P.z,s.x,s.z);
  if(watched)s.seen+=dt;else s.life-=dt;
  if(eu<3.2)banish(s,false);
  else if(!watched&&(s.seen>0.5||s.life<=0))banish(s,true);
}
/* ---------- update ---------- */
// speed modifiers shared by the maze and the rooms: the cold slows you, boots speed you up
const moveMul=()=>(P.chill>0?0.55:1)*(1+0.06*(up.boots|0))*wofSpeed();
// A sprint clip does not pop you through. You are caught in the stone, the air goes, then you are shoved out.
let wallClip=null;
function endWallClip(){
  if(!wallClip)return;
  wallClip=null;
  const f=$('fade').style;f.transition='opacity .35s';f.opacity='0';
}
function beginWallClip(dest,vx,vz,yaw){
  if(wallClip)return false;
  const x=(Math.floor(P.x)+Math.floor(dest.x))*0.5+0.5,z=(Math.floor(P.z)+Math.floor(dest.z))*0.5+0.5;
  wallClip={x,z,hx:x,hz:z,dx:dest.x,dz:dest.z,vx,vz,yaw,t:0,hold:0.7,shove:0.26};
  P.x=x;P.z=z;P.vx=P.vz=P.vy=0;P.y=0;P.wallTouch=true;P.unseen=true;
  if(yaw!=null)P.yaw=yaw;
  const f=$('fade').style;f.transition='none';f.opacity='0.55';
  tone(52,0.9,'sine',0.2,0,-18);noise(0.75,0.22,110,0.4);tone(140,0.16,'sine',0.05,0.28,-30);
  return true;
}
function wallClipTick(dt){
  const C=wallClip;if(!C)return;
  C.t+=dt;
  const f=$('fade').style;f.transition='none';
  if(C.t<C.hold){
    C.hx=C.x;C.hz=C.z;
    f.opacity=String(0.42+0.48*Math.sin(C.t/C.hold*Math.PI*3)**2);
  }else{
    const u=clamp((C.t-C.hold)/C.shove,0,1),e=u*u*(3-2*u);
    C.hx=C.x+(C.dx-C.x)*e;C.hz=C.z+(C.dz-C.z)*e;
    f.opacity=String(0.9*(1-u));
    if(u>=1){
      P.x=C.dx;P.z=C.dz;P.vx=C.vx;P.vz=C.vz;P.y=0;
      if(C.yaw!=null)P.yaw=C.yaw;
      wallClip=null;
      f.transition='opacity .3s';f.opacity='0';
      sfx('noclip');onTileChange();
      return;
    }
  }
  P.x=C.hx;P.z=C.hz;P.vx=P.vz=P.vy=0;P.y=0;
}
function update(dt){
  R.time+=dt;xrayTick(dt);guideTick(dt);mooseLureTick(dt);scoutTick(dt);
  // in a shared game the world keeps going while you pause or talk, but you stand still
  if(P.grab)mimicGrabTick(dt);
  const ctl=state==='play'&&!P.grab&&!GL.fall&&!(GL.rb&&!GL.rb.fwd)&&!FX.frozen&&FX.curl!==1;
  if(P.down)mpSpectate();
  else{
  // look and move: the shared movement system (src/movement.js), the same one the rooms use
  lookStep(P,dt,ctl?(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0)+pad.lx*MOVE.padTurn:0,ctl?pad.ly:0,MOVE.pitch);
  if(wallClip)wallClipTick(dt);
  else{
  const moon=FX.moon>0?-1:1;   // Moonwalk: forward is backward, left is right
  const fwd=moon*(ctl?((keys.KeyW||keys.ArrowUp)?1:0)-((keys.KeyS||keys.ArrowDown)?1:0)-pad.my-touch.my:0);
  const str=moon*(ctl?(keys.KeyD?1:0)-(keys.KeyA?1:0)+pad.mx+touch.mx:0);
  const ev=stepMove(P,dt,{fwd,str,fx:Math.cos(P.yaw),fz:Math.sin(P.yaw),ctl,
    jump:FX.fat<=0&&(keys.Space||pad.jump||touch.jump),sprint:keys.ShiftLeft||keys.ShiftRight||pad.sprint||Math.hypot(touch.mx,touch.my)>0.94},
    {scale:1,speedMul:moveMul()*(P.mounted?1.25:1),lungs:up.lungs|0,blocked});
  if(ev.jumped)sfx('jump');
  if(ev.landed>0||ev.step)sfx('step');
  if(ctl&&ev.ground&&(ev.blockedX||ev.blockedZ)){
    if(!P.wallTouch){
      P.wallTouch=true;
      const full=MOVE.sprint*(1+0.06*(up.boots|0))*(P.mounted?1.25:1);
      const dest=!ev.sprint||P.chill>0?null:noclipDest({x:P.x,z:P.z,hitVX:ev.hitVX,hitVZ:ev.hitVZ,sprint:true,fullSpeed:full,roll:Math.random(),cell:mazeCell,W:F.W,H:F.H});
      if(dest&&!blocked(dest.x,dest.z)){
        remember('glitches','clip',encounterSnapshot());
        beginWallClip(dest,ev.hitVX,ev.hitVZ);
      }
    }
  }else P.wallTouch=false;
  }
  for(const q of F.pillars){const ddx=P.x-q[0],ddz=P.z-q[1],dd=Math.hypot(ddx,ddz),m=0.2+PR;if(dd<m&&dd>1e-4){P.x=q[0]+ddx/dd*m;P.z=q[1]+ddz/dd*m}}
  if(F.safe){const ddx=P.x-F.safe.x,ddz=P.z-F.safe.z,dd=Math.hypot(ddx,ddz),m=0.3+PR;if(dd<m&&dd>1e-4){P.x=F.safe.x+ddx/dd*m;P.z=F.safe.z+ddz/dd*m}}
  for(const q of F.discs){const ddx=P.x-q[0],ddz=P.z-q[1],dd=Math.hypot(ddx,ddz),m=q[2]+PR;if(dd<m&&dd>1e-4){const nx2=q[0]+ddx/dd*m,nz2=q[1]+ddz/dd*m;if(!blocked(nx2,nz2)){P.x=nx2;P.z=nz2}}}
  if(F.safe&&F.safe.wheel)for(const q of F.safe.wheel.discs){const ddx=P.x-q[0],ddz=P.z-q[1],dd=Math.hypot(ddx,ddz),m=q[2]+PR;if(dd<m&&dd>1e-4){const nx2=q[0]+ddx/dd*m,nz2=q[1]+ddz/dd*m;if(!blocked(nx2,nz2)){P.x=nx2;P.z=nz2}}}
  for(const n of F.npcs){if(n.fall)continue;const X=n.x+(n.ox||0),Z=n.z+(n.oz||0),ddx=P.x-X,ddz=P.z-Z,dd=Math.hypot(ddx,ddz),m=0.16+PR;if(dd<m&&dd>1e-4){const nx2=X+ddx/dd*m,nz2=Z+ddz/dd*m;if(!blocked(nx2,nz2)){P.x=nx2;P.z=nz2}}}
  if(wallClip){P.x=wallClip.hx;P.z=wallClip.hz;P.vx=P.vz=P.vy=0;P.y=0}
  if(Math.floor(P.x)!==P.tx||Math.floor(P.z)!==P.ty)onTileChange();
  // torch
  // sanctuary: the brazier feeds the torch and nothing hunts you here
  {const inS=F.safeMask[P.ty*F.W+P.tx]===1;
    if(inS!==P.inSafe){P.inSafe=inS;if(inS){say('A sanctuary. Nothing can follow you here.',3);sfx('descend')}}
    if(inS){P.fuel=Math.min(100,P.fuel+9*dt);P.stam=Math.min(100,P.stam+25*dt);P.chill=Math.min(P.chill,0.3);lowFuelSaid=false}
    else if(!F.back)P.fuel=Math.max(0,P.fuel-0.85*(1-0.15*(up.lamp|0))*dt);}
  // who is close enough to talk to
  {let best=null,bd=1.45;
    for(const n of F.npcs){if(n.type==='lurk'||n.fall)continue;const d=Math.hypot(n.x-P.x,n.z-P.z);if(d<bd&&los(P.x,P.z,n.x,n.z)){bd=d;best=n}}
    let nd=null;
    if(!best&&ctl){let dd=0.72;for(const D of F.sdoors){if(D.used)continue;const d=Math.hypot(D.x-P.x,D.z-P.z);if(d<dd&&(D.x-P.x)*Math.cos(P.yaw)+(D.z-P.z)*Math.sin(P.yaw)>d*0.45){dd=d;nd=D}}}
    if(best!==nearNpc||nd!==nearDoor){nearNpc=best;nearDoor=nd;if(state!=='room')$('tFlash').textContent=best?'TALK':nd?'OPEN':'FLASH'}
    const pt=!best&&!nd&&state==='play'&&P.pick>0&&!P.down&&!P.away&&!P.grab?pkAim():null;
    if(state!=='room')setText('prompt',best?(touch.on?'TALK':pad.id?'X':'E')+': speak with '+NPC[best.type].name:nd?(touch.on?'OPEN':pad.id?'X':'E')+': open the strange door':pt?pt.ok?(touch.on?'PICK':pad.id?'RB':'Q')+': break through this wall':'This wall will not break':'');}
  if(P.fuel<20&&!lowFuelSaid){lowFuelSaid=true;say(P.fuel<=0?'Your torch is out':'Your torch is guttering. Find oil.',3)}
  if(P.inv>0)P.inv-=dt;
  if(P.chill>0){P.chill-=dt;$('chill').style.opacity=clamp(P.chill/1.2,0,1)}else if(P.chill<0||P.chill===0&&$('chill').style.opacity!=='0'){P.chill=0;$('chill').style.opacity='0'}
  if(flashT>0)flashT=Math.max(0,flashT-dt*1.6);
  // pickups
  for(const it of F.items){
    if(it.got||P.y<-0.2)continue;
    const dx=it.x-P.x,dz=it.z-P.z;
    if(dx*dx+dz*dz<0.2)collect(it);
  }
  // exit
  sealMsgT-=dt;
  if(Math.hypot(F.exit.x-P.x,F.exit.z-P.z)<0.42&&P.y>-0.2){
    if(P.shards>=3){mpSend({k:'down',d:R.depth+1});descend();return}
    if(sealMsgT<=0){sealMsgT=3;const n=3-P.shards;say(`The seal holds. ${n} shard${n>1?'s':''} to go.`,2.5);sfx('seal')}
  }
  // locked gate
  doorMsgT-=dt;
  if(F.door){
    const ddx=F.door.tx+0.5-P.x,ddz=F.door.ty+0.5-P.z;
    if(ddx*ddx+ddz*ddz<0.92*0.92){
      if(P.keys>0){openDoor(false);mpSend({k:'door',d:R.depth})}
      else if(doorMsgT<=0){doorMsgT=3;say('Locked. The key is somewhere on this side.',2.5);sfx('seal')}
    }
  }
  // spike traps
  for(const tr of F.traps){
    const e=trapExt(tr,R.time);
    if(e>0.5){
      if(!tr.up){tr.up=true;if(Math.abs(tr.x-P.x)+Math.abs(tr.z-P.z)<6)sfx('spike')}
      if(P.inv<=0&&!P.away&&!P.mounted&&P.y<0.22&&P.y>-0.2&&Math.abs(tr.x-P.x)<0.42&&Math.abs(tr.z-P.z)<0.42){hurt(null);if(state==='dead')return}
    }else tr.up=false;
  }
  } // end of the living player's turn
  wofTick(dt);if(state==='dead')return;
  // the humming rooms: lights that fail, knocking in the walls, a map that will not hold
  if(F.back){
    if(!MP.guest){
      F.boT-=dt;
      if(F.blk===0&&F.boT<=0)setBlk(1);
      else if(F.blk===1&&F.boT<=0)setBlk(2);
      else if(F.blk===2&&F.boT<=0)setBlk(0);
    }
    panelLvl=F.blk===2?0:F.blk===1?((Math.sin(R.time*38)+Math.sin(R.time*61.3)>0.3)?1:0.12):0.97+0.03*Math.sin(R.time*113);
    F.knT=(F.knT===undefined?12+Math.random()*14:F.knT)-dt;
    if(F.knT<=0){F.knT=16+Math.random()*24;sfx('knock')}
    F.fgT=(F.fgT||0)-dt;
    if(F.fgT<=0){F.fgT=1;for(let k=0;k<30;k++){const x=(Math.random()*F.W)|0,y=(Math.random()*F.H)|0;if(Math.max(Math.abs(x-P.tx),Math.abs(y-P.ty))>6)F.seen[y*F.W+x]=0}}
  }else panelLvl=1;
  // creatures. A solo player or the host runs them for everyone in the room, hunting whoever
  // is closest; a guest only follows what the host sends. Watchers are private to each player.
  let chasing=0,nearest=99;
  const pfx=Math.cos(P.yaw),pfz=Math.sin(P.yaw);
  const TG=MP.guest?null:mpTargets(), MD=MP.guest?null:mpDist(TG);
  for(const s of F.shades){
    if(s.dead){s.x=s.z=-99;s.state=0;s.vis=false;continue}
    rememberMob(s.type,s);
    s.ph+=dt*3;
    if(s.type===3){if(!P.down&&!followMoose(s,dt,1.9)){watcher(s,dt,pfx,pfz);if(state==='dead')return}continue}
    const cx=Math.floor(s.x),cz=Math.floor(s.z);
    const dl=F.dist[cz*F.W+cx];
    if(MP.guest){
      mpFollowShade(s,dt);
      s.think=(s.think||0)-dt;
      if(s.think<=0){s.think=0.2;s.vis=Math.hypot(s.x-P.x,s.z-P.z)<9&&los(s.x,s.z,P.x,P.z)}
      if(s.stun<=0&&s.state===1&&dl>=0&&dl<=14&&(s.type===0||(s.type===1&&!s.frozen&&dl<=8))){chasing++;if(dl<nearest)nearest=dl;
        if(s.type===1){s.snd=(s.snd||0)-dt;if(s.snd<=0){s.snd=0.45;sfx('scrape')}}}
      continue;
    }
    if(s.stun>0){s.stun-=dt;continue}
    if(followMoose(s,dt,s.type===1?3.15:2.95)){s.frozen=false;continue}
    const d=MD[cz*F.W+cx];s.d=d;
    const T=mpNearest(TG,s.x,s.z);
    const eu=T?Math.hypot(s.x-T.x,s.z-T.z):99, tDark=!!T&&T.fuel<=0;
    const chaseSpeed=Math.min(2.95+R.depth*0.06,3.6)+(tDark?0.35:0);
    s.think-=dt;
    if(s.think<=0){
      s.think=0.2;
      const tv=!!T&&eu<9&&los(s.x,s.z,T.x,T.z);
      s.vis=T&&T.loc?tv:!P.down&&Math.hypot(s.x-P.x,s.z-P.z)<9&&los(s.x,s.z,P.x,P.z);
      if(s.type===0){
        if(s.state===0){if((d>=0&&d<=8&&tv)||(d>=0&&d<=2)||(tDark&&d>=0&&d<=12)){s.state=1;if(dl>=0&&dl<=14)sfx('growl')}}
        else if(d<0||d>14)s.state=0;
      }else if(s.type===1)s.state=(d>=0&&d<=45)?1:0;
      else{if(s.state===0){if(d>=0&&d<=9)s.state=1}else if(d<0||d>13)s.state=0}
      if(s.calm>0){s.calm-=0.2;s.state=0}
      if(!T||T.inSafe)s.state=0;
    }
    let sp;
    if(s.type===0){sp=s.state===1?chaseSpeed:1.15;if(s.state===1&&(TG.length<2||(dl>=0&&dl<=14))){chasing++;if(dl>=0&&dl<nearest)nearest=dl}}
    else if(s.type===1){
      // a stalker is stone while someone's torchlight is on it and they are facing it
      s.frozen=mpWatched(TG,s);
      if(s.frozen||s.state===0)continue;
      sp=3.15;
      if(dl>=0&&dl<=8){chasing++;if(dl<nearest)nearest=dl;s.snd-=dt;if(s.snd<=0){s.snd=0.45;sfx('scrape')}}
    }else sp=s.state===1?2.95:1.4;
    let gx=s.gx+0.5,gz=s.gy+0.5;
    const direct=!!T&&s.state===1&&d>=0&&d<=1&&!T.inSafe;
    if(direct){gx=T.x;gz=T.z;s.gx=cx;s.gy=cz}
    const dx=gx-s.x,dz=gz-s.z,l=Math.hypot(dx,dz),step=sp*dt;
    if(l<=step+0.001){
      s.x=gx;s.z=gz;
      if(!direct){
        const opts=[];let bestN=null,bestD=d<0?1e9:d;
        for(const k of DIRS){
          const nx2=cx+k[0],ny2=cz+k[1];
          if(nx2<0||ny2<0||nx2>=F.W||ny2>=F.H||F.g[ny2*F.W+nx2]||F.safeMask[ny2*F.W+nx2]||F.pocketMask[ny2*F.W+nx2])continue;
          const nd=MD[ny2*F.W+nx2];
          if(nd>=0&&nd<bestD){bestD=nd;bestN=[nx2,ny2]}
          if(!(nx2===s.px&&ny2===s.py))opts.push([nx2,ny2]);
        }
        let next=null;
        if(s.state===1)next=bestN;
        else next=opts.length?opts[(Math.random()*opts.length)|0]:(s.px>=0?[s.px,s.py]:null);
        if(next){s.px=cx;s.py=cz;s.gx=next[0];s.gy=next[1]}
      }
    }else{s.x+=dx/l*step;s.z+=dz/l*step;s.face=Math.atan2(dz,dx)}
    const hitT=mpTouching(TG,s);
    if(hitT){
      if(s.type===2){
        // a wisp drinks some of the torch and flits away
        if(hitT.loc){P.fuel=Math.max(0,P.fuel-22);sfx('drain');say('A wisp drinks your flame',2)}else mpHit(hitT,'drain');
        for(let tries=0;tries<60;tries++){
          const rx=1+(Math.random()*(F.W-2)|0),ry=1+(Math.random()*(F.H-2)|0),rd=MD[ry*F.W+rx];
          if(F.g[ry*F.W+rx]===0&&!F.safeMask[ry*F.W+rx]&&!F.pocketMask[ry*F.W+rx]&&(rd>10||(tries>40&&rd>4))){s.x=rx+0.5;s.z=ry+0.5;s.gx=rx;s.gy=ry;s.px=-1;break}
        }
        s.state=0;s.stun=1.5;
      }else if(hitT.inv<=0){
        if(R.depth<2&&s.type===0){
          // on the first floor a shade only chills you: slowed for a few seconds, no damage
          s.stun=3;s.state=0;s.calm=9;
          if(hitT.loc){P.chill=3.5;P.inv=1.6;sfx('drain');rumble(180,0.5,0.3);say('The shade chills you. Deeper down, its touch wounds.',2.6)}
          else mpHit(hitT,'chill');
        }else if(hitT.loc){hurt(s);if(state==='dead')return}
        else{s.stun=2.5;s.calm=9;s.state=0;mpHit(hitT,'hurt')}
      }
    }
  }
  lurkTick(dt);if(state==='dead')return;
  if(TG)mimicHost(dt,TG);
  if(archiveMimic())mimicTick(dt);
  if(MP.on&&MIM.st)rememberMob('mimic',MIM);
  // heartbeat when hunted
  CHASE.n=chasing;CHASE.near=nearest;
  if(chasing){beatT-=dt;if(beatT<=0){beatT=clamp(0.35+nearest*0.05,0.4,1.0);sfx('beat')}}
  glTick(dt,chasing);
  // homing chime toward the nearest shard, or the exit once the seal is broken
  pingT-=dt;
  if(pingT<=0){
    pingT=1.5;
    let tx=null,tz=null,bd=1e9;
    if(P.shards>=3){tx=F.exit.x;tz=F.exit.z;bd=Math.hypot(tx-P.x,tz-P.z)}
    else for(const it of F.items){if(it.got||it.type!=='shard')continue;const dd=Math.hypot(it.x-P.x,it.z-P.z);if(dd<bd){bd=dd;tx=it.x;tz=it.z}}
    if(tx!==null&&bd<16){
      const k=1-bd/16,rx=-Math.sin(P.yaw),rz=Math.cos(P.yaw);
      const pan=((tx-P.x)*rx+(tz-P.z)*rz)/Math.max(bd,0.5);
      const base=P.shards>=3?523:880;
      tone(base,0.35,'sine',0.02+0.2*k*k,0,0,pan);tone(base*1.5,0.3,'sine',0.01+0.1*k*k,0.07,0,pan);
    }
  }
}

function lurkTick(dt){
  if(!F||P.away||!F.npcs)return;
  for(const n of F.npcs){
    if(n.type!=='lurk'||n.x<0)continue;
    const r=lurkStep(n,dt,{x:P.x,z:P.z,yaw:P.yaw,down:!!P.down||state!=='play'},{
      los:(x,z)=>los(P.x,P.z,x,z),
      open:(x,z)=>x>0&&z>0&&x<F.W-1&&z<F.H-1&&F.g[z*F.W+x]===0&&!F.safeMask[z*F.W+x]&&!F.pocketMask[z*F.W+x],
      rand:()=>Math.random(),
    });
    if(n.aggro&&!n.said){n.said=1;sfx('growl');say('It noticed you looking.',2.4)}
    if(r.looking)rememberMob('lurk',n);
    if(n.face!=null)n.yaw=n.face;
    if(r.hurt&&state==='play'&&!P.down&&P.inv<=0&&!P.away)hurt(null);
  }
}

/* ---------- fake glitches: things that look like bugs and are not ---------- */
// Every one of these is deliberate. They are rare, they happen only on your own screen, and they
// never start while something is hunting you, so they unsettle without ever costing a life.
// __game.glitch('freeze'|'rubber'|'rubberfwd'|'replay'|'hud'|'tpose'|'hole'|'fall'|'loop'|'clip') forces one for testing.
const GL={cd:60,used:{},frz:0,frzAfter:null,buzz:null,hist:[],histT:0,rb:null,rbN:0,figs:[],hole:null,fall:null,loop:null,
  ghosts:[],walked:null,queued:null,qT:0,peerH:new Map(),hudOv:{},hudSeq:null,chatT:0,dip:0,netEl:null,netT:0};
function glReset(){
  endWallClip();
  glFallEnd();glClearFreeze();GL.queued=null;
  GL.cd=F.back?28+Math.random()*30:55+Math.random()*60;GL.used={};GL.frz=0;GL.frzAfter=null;GL.hist=[];GL.rb=null;
  GL.figs=[];GL.ghosts=[];GL.fall=null;GL.loop=null;GL.hudOv={};GL.hudSeq=null;GL.dip=0;GL.walked=new Uint8Array(F.W*F.H);
  glHoleOff();
  GL.loop=null;GL.archiveRewind=null;
  for(const p of MP.peers.values())p.glRep=null;
}
const glOpen=(x,y)=>x>0&&y>0&&x<F.W-1&&y<F.H-1&&F.g[y*F.W+x]===0&&!F.safeMask[y*F.W+x]&&!F.pocketMask[y*F.W+x];
const glTrapAt=(x,y)=>F.traps.some(tr=>tr.tx===x&&tr.ty===y)||(F.door&&F.door.tx===x&&F.door.ty===y);
function glNet(text,secs){
  if(!GL.netEl){const el=document.createElement('div');el.style.cssText='position:fixed;left:50%;top:38px;transform:translateX(-50%);font:13px system-ui,sans-serif;letter-spacing:.06em;color:#9fe3c4;text-shadow:0 1px 3px #000;pointer-events:none;z-index:6;white-space:nowrap';document.body.appendChild(el);GL.netEl=el}
  GL.netEl.textContent=text;GL.netEl.style.display=text?'block':'none';GL.netT=secs||0;
}
// is the moment right? nothing hunting, nothing open, feet on the ground
function glCalm(chasing){
  return state==='play'&&!P.down&&!P.away&&!P.grab&&!P.inSafe&&!chasing&&R.depth>=2&&!chatOpen&&P.y===0&&
    GL.frz<=0&&!GL.rb&&!GL.fall&&!GL.loop&&!GL.figs.length&&!GL.hole&&!GL.hudSeq;
}
function glTick(dt,chasing){
  if(!F||state==='title')return;
  if(GL.queued){   // a console-queued glitch waits for play, then a beat so you see it begin
    if(state!=='play')GL.qT=0.6;
    else if((GL.qT-=dt)<=0){const k=GL.queued;GL.queued=null;if(!glStart(k,true))console.log(GL_NOPE)}
  }
  if(GL.netT>0){GL.netT-=dt;if(GL.netT<=0)glNet('')}
  if(GL.chatT>0)GL.chatT-=dt;
  if(!BABY&&!GL.prep&&R.depth>=3){GL.prep=1;window.requestIdleCallback?requestIdleCallback(glFallBuild,{timeout:9000}):setTimeout(glFallBuild,3000)}   // build the face while nobody is looking
  // a short memory of where you have been, for the rubber band and the fall
  GL.histT-=dt;
  if(GL.histT<=0){GL.histT=0.1;GL.hist.push([P.x,P.z,P.yaw]);if(GL.hist.length>40)GL.hist.shift();
    for(const p of MP.peers.values()){if(p.rx===undefined)continue;let h=GL.peerH.get(p.id);if(!h){h=[];GL.peerH.set(p.id,h)}
      if(!p.glRep){h.push([p.rx,p.rz,p.ryaw,p.ry]);if(h.length>30)h.shift()}}}
  if(P.tx>=0&&GL.walked)GL.walked[P.ty*F.W+P.tx]=1;
  if(GL.dip>0){GL.dip-=dt;panelLvl*=0.04}
  glRubberTick(dt);glHudTick(dt);glFigTick(dt);glHoleTick(dt);glFallTick(dt);glLoopTick(dt,chasing);
  for(const g of GL.ghosts){g.t-=dt;if(Math.hypot(g.x-P.x,g.z-P.z)<1.8)g.t=Math.min(g.t,0.05)}
  GL.ghosts=GL.ghosts.filter(g=>g.t>0);
  for(const p of MP.peers.values())if(p.glRep){p.glRep.i+=dt*10;if(p.glRep.i>=p.glRep.h.length)p.glRep=null}
  if(GL.archiveRewind){
    GL.archiveRewind.i+=dt*10;
    if(GL.archiveRewind.i>=GL.archiveRewind.h.length)GL.archiveRewind=null;
  }
  // the director: every so often, if the moment is right, something goes wrong
  if(archiveRun)return;
  if(!glCalm(chasing)){if(chasing)GL.cd=Math.max(GL.cd,8);return}
  GL.cd-=dt;
  if(GL.cd>0)return;
  const opts=[['freeze',3],['rubber',3],['hud',4],['tpose',2],['hole',2.5]];
  if(R.depth>=3)opts.push(['fall',1]);
  if(MP.on&&mpAlive().length)opts.push(['replay',2]);
  const ok=opts.filter(o=>(GL.used[o[0]]|0)<(o[0]==='hud'?2:1));
  let sum=0;for(const o of ok)sum+=o[1];
  let r=Math.random()*sum,pick=null;for(const o of ok){r-=o[1];if(r<=0){pick=o[0];break}}
  if(pick&&glStart(pick)){GL.used[pick]=(GL.used[pick]|0)+1;GL.cd=F.back?35+Math.random()*35:60+Math.random()*70}
  else GL.cd=6;
}
const GL_NOPE='not here: step away from the exit or traps and try again';
// console test hook: starts now, or queues until the game is back in play
function glTest(k){
  if(state==='play')return glStart(k,true)?'started':GL_NOPE;
  if(state==='pause'||state==='trans'){GL.queued=k;GL.qT=0.6;return 'queued: click Resume and it starts'}
  return 'not now: start a run first';
}
function glStart(k,forced,snapshot){
  if(state!=='play')return false;
  if(snapshot?.rubber){
    GL.rb=structuredClone(snapshot.rubber);
    glNet('Reconnecting…',GL.rb.fwd?1.2:1.7);
    return true;
  }
  if(snapshot?.rewind){
    GL.archiveRewind={h:snapshot.rewind,i:0};
    glNet('Reconnecting…',1.5);
    return true;
  }
  if(snapshot?.hud)return glHud(snapshot.hud);
  const started=glStartEffect(k,forced);
  if(started&&k!=='replay'&&!archiveRun){
    const rubber=k==='rubber'||k==='rubberfwd'?structuredClone(GL.rb):undefined;
    remember('glitches',rubber?.fwd?'rubberfwd':k,{...encounterSnapshot(),rubber,
      hud:k==='hud'?GL.hudEvent:undefined});
  }
  return started;
}
function glStartEffect(k,forced){
  switch(k){
    case 'freeze':return glFreeze();
    case 'rubber':return glRubber(GL.rbN%2===1);
    case 'rubberfwd':return glRubber(true);
    case 'replay':return glReplay();
    case 'hud':return glHud();
    case 'tpose':return glFigure('tpose');
    case 'hole':return glHole();
    case 'fall':return glFall();
    case 'loop':return glLoopTry(forced);
    case 'clip':return glClipForce();
  }
  return false;
}

/* 1. the game hangs: the picture locks, the sound sticks, and when it lets go something has changed */
function glFreeze(){
  GL.frz=1.1+Math.random()*0.6;
  // decide the aftermath now, so any rebuild happens inside the hitch where nobody can see it
  const r=Math.random();
  GL.frzAfter=r<0.45&&glWallBehind()?'wall':r<0.85?'figure':'turned';
  if(ac&&!muted){
    const n=Math.floor(ac.sampleRate*0.065),b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<n;i++){const t=i/ac.sampleRate;d[i]=0.5*((t*120)%1-0.5)+0.35*Math.sin(t*55*6.283)+0.25*(Math.random()*2-1)}
    const s=ac.createBufferSource(),g=ac.createGain();s.buffer=b;s.loop=true;g.gain.value=0.13;s.connect(g);g.connect(ac.destination);s.start();
    GL.buzz=s;master.gain.setValueAtTime(0,ac.currentTime);
  }
  return true;
}
// wall up the way you came, but only where the floor stays in one piece
function glWallBehind(){
  const H=GL.hist;if(H.length<12)return false;
  const W=F.W;
  for(let back=8;back<H.length;back++){
    const q=H[H.length-1-back],tx=Math.floor(q[0]),ty=Math.floor(q[1]);
    if(Math.abs(tx-P.tx)+Math.abs(ty-P.ty)<2)continue;
    if(!glOpen(tx,ty)||glTrapAt(tx,ty)||(tx===F.exit.tx&&ty===F.exit.ty)||(tx===F.start.tx&&ty===F.start.ty))return false;
    if(F.items.some(it=>!it.got&&it.tx===tx&&it.ty===ty))return false;
    if(F.npcs.some(n=>Math.floor(n.x)===tx&&Math.floor(n.z)===ty))return false;
    if(F.sdoors&&F.sdoors.some(D=>D.tx===tx&&D.ty===ty))return false;
    const i=ty*W+tx,before=bfs(F.g,W,F.H,P.tx,P.ty);let nb=0;for(let j=0;j<before.length;j++)if(before[j]>=0)nb++;
    F.g[i]=1;
    const after=bfs(F.g,W,F.H,P.tx,P.ty);let na=0;for(let j=0;j<after.length;j++)if(after[j]>=0)na++;
    if(na!==nb-1){F.g[i]=0;return false}
    buildMesh(F);F.dist=after;F.seen[i]=0;
    return true;
  }
  return false;
}
function glClearFreeze(){
  if(GL.buzz){try{GL.buzz.stop()}catch(e){}GL.buzz=null;if(master)master.gain.setValueAtTime(muted?0:0.55,ac.currentTime)}
}
function glUnfreeze(){
  glClearFreeze();
  const a=GL.frzAfter;GL.frzAfter=null;
  if(a==='figure'&&!glFigure('pale'))P.yaw+=Math.PI;
  else if(a==='turned')P.yaw+=Math.PI;
}

/* 2. rubber-banding: snapped back like a lag spike, and the second time, snapped forward */
function glRubber(fwd){
  if(GL.hist.length<25)return false;
  let dest=null;
  if(fwd){
    // somewhere you have not been yet, a fair walk away, with nothing waiting there
    const C=[];
    for(let y=1;y<F.H-1;y++)for(let x=1;x<F.W-1;x++){
      const d=F.dist[y*F.W+x];if(d<10||d>26||!glOpen(x,y)||F.seen[y*F.W+x]||glTrapAt(x,y))continue;
      if((x===F.exit.tx&&y===F.exit.ty)||F.shades.some(s=>Math.hypot(s.x-x-0.5,s.z-y-0.5)<6))continue;
      C.push([x+0.5,y+0.5]);
    }
    if(!C.length)return false;
    dest=C[(Math.random()*C.length)|0];
  }
  GL.rbN++;
  GL.rb={t:0,fwd,dest,from:[P.x,P.z,P.yaw],a:GL.hist[GL.hist.length-6],b:GL.hist[GL.hist.length-13],stage:0};
  glNet(MP.on?`Reconnecting to ${myName()}…`:'Reconnecting…',fwd?1.2:1.7);
  return true;
}
function glRubberTick(dt){
  const B=GL.rb;if(!B)return;
  B.t+=dt;
  const snap=(x,z,yaw)=>{if(blocked(x,z))return;P.x=x;P.z=z;if(yaw!==undefined)P.yaw=yaw;P.vx=P.vz=0;onTileChange()};
  if(!B.fwd){
    if(B.stage===0&&B.t>0.22){B.stage=1;snap(B.a[0],B.a[1])}
    else if(B.stage===1&&B.t>0.5){B.stage=2;snap(B.b[0],B.b[1])}
    else if(B.stage===2&&B.t>0.62){B.stage=3;snap(B.a[0],B.a[1])}
    else if(B.stage===3&&B.t>0.75){B.stage=4;snap(B.b[0],B.b[1]);glTellRoom(B.from);GL.rb=null}
    return;
  }
  if(B.stage===0&&B.t>0.35){
    B.stage=1;snap(B.dest[0],B.dest[1]);glTellRoom(B.from);
    // your own footsteps carry on from where you were
    for(let i=0;i<6;i++)setTimeout(()=>{if(state!=='play'||!ac)return;noise(0.12,0.06*(1-i/7),F.back?120:240+Math.random()*80,1)},420+i*480);
    GL.rb=null;
  }
}
// friends see a copy of you left standing where you were, torch flame stuck mid-flicker
function glTellRoom(from){if(MP.on&&!P.unseen)mpSend({k:'gl',w:'rb',d:R.depth,x:r2(from[0]),z:r2(from[1]),yaw:r2(from[2])})}
function glRecv(m,p){
  if(p.unseen)return;
  if(m.w==='rb'&&m.d===R.depth&&state!=='title'&&state!=='dead'&&isFinite(+m.x)&&isFinite(+m.z))
    GL.ghosts.push({x:+m.x,z:+m.z,yaw:+m.yaw||0,col:p.col,id:p.id,t:7+Math.random()*3});
}
// multiplayer only: a friend in front of you rewinds two seconds and walks it again
function glReplay(){
  let best=null,bd=13;
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);
  for(const p of mpAlive()){if(p.unseen)continue;const d=Math.hypot(p.rx-P.x,p.rz-P.z),h=GL.peerH.get(p.id);
    if(d<bd&&h&&h.length>=20&&((p.rx-P.x)*fx+(p.rz-P.z)*fz)/Math.max(d,0.1)>0.5&&los(P.x,P.z,p.rx,p.rz)){bd=d;best=p}}
  if(!best)return false;
  best.glRep={h:GL.peerH.get(best.id).slice(-20),i:0};
  remember('glitches','replay',{...encounterSnapshot(),rewind:best.glRep.h.map(pose=>pose.slice())});
  glNet(`Reconnecting to ${best.name}…`,1.5);
  return true;
}

/* 3. the HUD lies */
const GL_LINES=()=>[`The seal holds. ${4+((Math.random()*3)|0)} shards to go.`,'A sanctuary. Nothing can follow you here.','You rise again',`Depth ${R.depth}: ${F.name}`,'Your torch is out'];
function glGarble(s){const c='▒░█▓';let o='';for(const ch of s){const r=Math.random();o+=r<0.1?c[(Math.random()*4)|0]:r<0.14?ch+ch:r<0.17?'':ch}return o}
function glHud(event){
  if(!event)event=randomHudEvent();
  GL.hudEvent=event;
  if(event.seq)GL.hudSeq={t:0,...event.seq};
  else if(event.toast)say(event.toast,2.4);
  else{
    // A fake chat line uses the local display name in multiplayer.
    const nm=MP.on?myName():'Delver',col=MP.on?toHex(MP_COLS[hashStr(MP.id||'')%MP_COLS.length]):'#8f8a80';
    GL.chatT=15;chatLine(nm,col,event.chat);
    sfx('pick');
  }
  return true;
}
function randomHudEvent(){
  const r=Math.random();
  if(r<0.4){
    const wrong=['Depth 0','Depth -1','Depth '+(-R.depth),'Depth ∞','Depth '+(R.depth+Math.floor(20+Math.random()*60))][(Math.random()*5)|0];
    return {seq:{end:2.4,k:'depthLine',a:wrong}};
  }
  if(r<0.62)return {seq:{end:2,k:'shards',a:P.shards>=2?'◆ '+P.shards+' / 4 shards':'◆ '+(P.shards+1)+' / 3 shards'}};
  if(r<0.8){const lines=GL_LINES();return {toast:glGarble(lines[(Math.random()*lines.length)|0])}}
  return {chat:['is anyone else down here','hello?','i can hear you walking','which way did you go'][(Math.random()*4)|0]};
}
function glHudTick(dt){
  const S=GL.hudSeq;if(!S)return;
  S.t+=dt;
  if(S.t>=S.end){GL.hudSeq=null;GL.hudOv={};return}
  const on=Math.sin(S.t*23)+Math.sin(S.t*7.3)>0.2;
  GL.hudOv={};if(on)GL.hudOv[S.k]=S.a;
}

/* 4. a stiff figure, arms out, sliding and always turned to you. Look away and it is gone */
function glFigure(kind){
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);let spot=null;
  for(let d=2.6;d<6.5;d+=0.25){const x=P.x+fx*d,z=P.z+fz*d;if(solidAt(x,z)||blocked(x,z))break;if(d>=3.2)spot=[x,z]}
  if(!spot)return false;
  let col;
  const L=MP.on?mpAlive():[];
  if(kind==='pale')col=[0.92,0.9,0.84];
  else if(L.length)col=L[(Math.random()*L.length)|0].col;
  else col=MP_COLS[hashStr(myName())%MP_COLS.length];
  GL.figs.push({kind,x:spot[0],z:spot[1],sx:spot[0],sz:spot[1],yaw:0,col,t:0,seen:0,away:0,tick:0});
  if(kind==='tpose')noise(0.3,0.05,4200,3);
  return true;
}
function glFigTick(dt){
  for(const f of GL.figs){
    f.t+=dt;
    const dx=P.x-f.x,dz=P.z-f.z,d=Math.hypot(dx,dz),fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);
    const inView=d<12&&(-dx*fx-dz*fz)/Math.max(d,0.01)>0.6&&los(P.x,P.z,f.x,f.z);
    if(inView){f.seen+=dt;f.away=0}else f.away+=dt;
    // moves and turns in jerky steps, as if its updates arrive late
    f.tick-=dt;
    if(f.tick<=0){f.tick=0.16;f.yaw=Math.atan2(dz,dx);
      if(f.kind==='tpose'&&d>1.4){const k=0.5*0.16/d,nx=f.x+dx*k,nz=f.z+dz*k;if(!blocked(nx,nz)){f.sx=nx;f.sz=nz}}}
    f.x=f.sx;f.z=f.sz;
    if((f.seen>0.2&&f.away>0.3)||f.away>4||f.t>14){f.dead=true}
    else if(d<1.35){f.dead=true;noise(0.25,0.06,1700,0.7)}
  }
  GL.figs=GL.figs.filter(f=>!f.dead);
}
function buildTpose(f,t){
  // drawn 'fullbright', evenly lit from nowhere, like a model whose lighting never loaded
  const c=f.col,k=f.kind==='pale'?0.32:0.4,FB=11,cloak=[c[0]*k,c[1]*k,c[2]*k,FB],cloakD=[c[0]*k*0.6,c[1]*k*0.6,c[2]*k*0.6,FB];
  const pale=f.kind==='pale',leg=pale?cloakD:[0.13,0.1,0.08,FB],boot=pale?cloakD:[0.16,0.1,0.05,FB],skin=pale?[0.36,0.35,0.33,FB]:[0.42,0.32,0.25,FB];
  const S=AV,v=(x,y,z)=>[x*S,y*S,z*S];
  const B={p:[f.x,0,f.z],R:rYaw(f.yaw)};
  for(const z of[-1,1]){
    const hip=v(0,0.45,z*0.052),knee=v(0.012,0.25,z*0.058),ank=v(0,0.05,z*0.062);
    seg(B,hip,knee,0.047*S,0.038*S,leg);ball(B,knee,0.04*S,leg,true);seg(B,knee,ank,0.04*S,0.03*S,boot);
    ball(B,[ank[0]+0.03,ank[1]-0.02,ank[2]],[0.062*S,0.03*S,0.036*S],boot,true);
  }
  const U=subF(B,v(0,0.45,0),ID3);
  ball(U,v(0,0.02,0),[0.075*S,0.06*S,0.09*S],cloakD);
  seg(U,v(0,-0.1,0),v(0,0.07,0),0.12*S,0.078*S,cloak);
  ball(U,v(0,0.17,0),[0.066*S,0.115*S,0.09*S],cloak);
  ball(U,v(-0.035,0.2,0),[0.055*S,0.12*S,0.095*S],cloakD);
  // arms dead straight out to the sides, palms down, the default pose of a model with no animation
  for(const z of[-1,1])limb(U,v(0,0.225,z*0.1),v(0,0.225,z*0.26),v(0,0.225,z*0.41),0.03*S,0.027*S,0.023*S,cloak,cloak,skin,0.026*S);
  seg(U,v(0,0.27,0),v(0,0.31,0),0.027*S,0.026*S,skin);
  const H=subF(U,v(0,0.305,0),ID3),HS={p:H.p,R:H.R.map(q=>q*S)};
  face(HS,{skin,blink:1,iris:pale?[0.05,0.05,0.05]:[0.3,0.25,0.18],brow:[0.25,0.16,0.1,5],browH:0.006,eyeS:pale?1.4:1.1,nose:[0.012,0.013,0.011],mouth:[0.6,0.32,0.3],mouthW:0.022});
  ball(HS,[-0.03,0.1,0],[0.088,0.1,0.094],cloak);
  ball(HS,[-0.05,0.04,0],[0.07,0.07,0.09],cloakD,true);
}
function glDraw(t,ex,ez,fwx,fwz){
  for(const f of GL.figs)buildTpose(f,t);
  const rewind=GL.archiveRewind;
  if(rewind){
    const [rx,rz,ryaw,ry]=rewind.h[Math.floor(rewind.i)];
    const p={id:'archive',col:MP_COLS[2],rx,rz,ryaw,ry,rpitch:0,spd:1.5,walk:t*8};
    const {torch:q}=buildPlayer(p,t);
    spr(q[0],q[1],q[2],0.38,0.38,7,1,0.5,0.15,0.45,1);
  }
  // the copy of a friend left behind by a rubber band, flame frozen mid-flicker
  for(const g of GL.ghosts){
    if((g.x-ex)**2+(g.z-ez)**2>18*18||(g.x-ex)*fwx+(g.z-ez)*fwz<-1.5)continue;
    const q=buildPlayer({id:g.id,col:g.col,rx:g.x,rz:g.z,ry:0,ryaw:g.yaw,rpitch:0,spd:0,walk:0},1.234).torch;
    spr(q[0],q[1]+0.02,q[2],0.07,0.12,11,1.0,0.6,0.2,1,1);spr(q[0],q[1],q[2],0.5,0.5,7,1.0,0.5,0.15,0.25,1);
  }
}

/* 5. a wall that never loaded: through the gap, a grey floor that goes on forever and one lit doorway */
const holeMat=new THREE.ShaderMaterial({
  uniforms:{uN:{value:new THREE.Vector3()},uC:{value:new THREE.Vector3()},uA:{value:1}},
  vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`varying vec3 vW;uniform vec3 uN,uC;uniform float uA;
  void main(){
    vec3 d=normalize(vW-cameraPosition);
    float fy=cameraPosition.y-1.3;
    vec3 col=mix(vec3(0.075),vec3(0.095),clamp(d.y*2.5,0.0,1.0));
    if(d.y<-0.001){float tt=(cameraPosition.y-fy)/(-d.y);vec2 p=(cameraPosition+d*tt).xz;vec2 g=abs(fract(p*0.5)-0.5);
      float line=smoothstep(0.47,0.5,max(g.x,g.y));float fade=exp(-tt*0.025);col=mix(vec3(0.075),mix(vec3(0.07),vec3(0.035),line),fade);}
    float dn=dot(d,-uN);
    if(dn>0.01){vec3 dc=uC-uN*45.0;float tt=dot(dc-cameraPosition,-uN)/dn;vec3 q=cameraPosition+d*tt;
      vec3 sd=vec3(-uN.z,0.0,uN.x);float u=dot(q-dc,sd),v=q.y-fy;
      if(abs(u)<0.7&&v>0.0&&v<2.3)col=vec3(1.0,0.86,0.58)*0.9;
      else col+=vec3(0.5,0.4,0.25)*0.08*exp(-length(vec2(u,v-1.1))*0.6);}
    gl_FragColor=vec4(col*uA,1.0);
  }`,
  fog:false,side:THREE.DoubleSide
});
function glHole(){
  // a wall face a few steps ahead, square to the view
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);let best=null,bs=-1;
  for(let y=P.ty-7;y<=P.ty+7;y++)for(let x=P.tx-7;x<=P.tx+7;x++){
    if(x<1||y<1||x>=F.W-1||y>=F.H-1||F.g[y*F.W+x]!==0)continue;
    for(const k of DIRS){
      const wx=x+k[0],wy=y+k[1];if(F.g[wy*F.W+wx]!==1)continue;
      if(F.sdoors&&F.sdoors.some(D=>D.tx===x&&D.ty===y&&D.dx===k[0]&&D.dz===k[1]))continue;
      const cx=x+0.5+k[0]*0.5,cz=y+0.5+k[1]*0.5,dx=cx-P.x,dz=cz-P.z,d=Math.hypot(dx,dz);
      if(d<3.2||d>7.5)continue;
      const facing=(k[0]*dx+k[1]*dz)/d,ahead=(dx*fx+dz*fz)/d;
      if(facing<0.55||ahead<0.8||!los(P.x,P.z,x+0.5,y+0.5))continue;
      const sc=ahead*facing+Math.random()*0.1;if(sc>bs){bs=sc;best={x,y,k,cx,cz}}
    }
  }
  if(!best)return false;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(1,WALL_H),holeMat);
  const n=[-best.k[0],0,-best.k[1]];
  m.position.set(best.cx+n[0]*0.004,WALL_H/2,best.cz+n[2]*0.004);
  m.rotation.y=Math.atan2(n[0],n[2]);
  holeMat.uniforms.uN.value.set(n[0],0,n[2]);holeMat.uniforms.uC.value.set(best.cx,WALL_H/2,best.cz);holeMat.uniforms.uA.value=1;
  scene.add(m);GL.hole={m,cx:best.cx,cz:best.cz,t:0,pop:0};
  return true;
}
function glHoleOff(){if(GL.hole){scene.remove(GL.hole.m);GL.hole.m.geometry.dispose();GL.hole=null}}
function glHoleTick(dt){
  const h=GL.hole;if(!h)return;
  h.t+=dt;
  const d=Math.hypot(h.cx-P.x,h.cz-P.z);
  // walk up to it and it pops in, after a stutter
  if(d<1.9&&!h.pop)h.pop=0.3;
  if(h.pop){h.pop-=dt;h.m.visible=Math.sin(h.pop*90)>0;if(h.pop<=0){glHoleOff();return}}
  if(h.t>45)glHoleOff();
}

/* 6. falling through the floor, out of the underside of the maze, down a black void to a giant baby, and into its mouth */
// Sink through the stone, hang a beat, then fall (gently, to a terminal speed) while the camera eases to look down
// at the face. The mouth opens as you near it; you drop in, the screen goes dark, and you wake at the start.
const FALL={hang:1.6,tFall:5.2,vt:19,tau:1.4,wake:8.4,pitch:-1.35,gridY:-5,far:420};
FALL.dist=FALL.vt*(FALL.tFall-FALL.tau*(1-Math.exp(-FALL.tFall/FALL.tau)));   // metres from where you hang to the lips
let BABY=null,VOID=null;
function glFallBuild(){   // built once, kept for every later fall
  if(BABY)return true;
  try{BABY=createBabyFace(THREE,{quality:Q});VOID=createFallVoid(THREE,{quality:Q})}catch(e){BABY=VOID=null;console.warn('glFallBuild failed',e);return false}
  return true;
}
// mouse and touch look during the fall only nudge the view
function glLook(dyaw,dpitch){const L=GL.fall;if(!L)return false;P.yaw+=dyaw*0.3;L.li=clamp(L.li+dpitch*0.3,-0.25,0.25);return true}
function glFall(){
  if(glTrapAt(P.tx,P.ty)||Math.hypot(F.exit.x-P.x,F.exit.z-P.z)<2||!glFallBuild())return false;
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw),g=BABY.group;
  GL.fall={t:0,li:0,fx,fz,x0:P.x,z0:P.z,far:camera.far,ao:gtaoPass&&gtaoPass.enabled,sy:0,coo:0,wind:0};
  P.vx=P.vz=0;P.inv=99;
  // the head lies face-up: its forehead points the way you were looking, so it is the right way up on screen
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-fz,0,fx),new THREE.Vector3(fx,0,fz),new THREE.Vector3(0,1,0)));
  GL.fall.lipY=EYE-0.95-FALL.dist;                                          // camera height as it crosses the lips
  scene.add(g,VOID.group);camera.far=FALL.far;camera.updateProjectionMatrix();if(gtaoPass)gtaoPass.enabled=false;
  BABY.update(0,{camPos:camera.position,open:0,t:0,fade:0});VOID.update(0,{camPos:camera.position,t:0,fade:0,gridY:FALL.gridY});
  renderer.compile(scene,camera);
  tone(70,2.6,'sine',0.12,0.3,-40);noise(0.25,0.08,2400,3);
  return true;
}
// tear everything down; safe to call at any time, whatever stage the fall is in
function glFallEnd(waking){
  const L=GL.fall;GL.fall=null;
  if(BABY&&BABY.group.parent)scene.remove(BABY.group);
  if(VOID&&VOID.group.parent)scene.remove(VOID.group);
  if(!L)return;
  camera.far=L.far;camera.updateProjectionMatrix();if(gtaoPass)gtaoPass.enabled=L.ao;
  const f=$('fade').style;f.transition='';if(!waking)f.opacity=0;
  P.y=0;P.vy=0;P.pitch=0;if(P.inv>50)P.inv=0;
}
function glFallTick(dt){
  const L=GL.fall;if(!L)return;
  L.t+=dt;const t=L.t,sm=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
  const tf=Math.max(0,t-FALL.hang),k=FALL.tau;
  if(t<0.9)P.y=-0.85*(t/0.9)**2;                 // sink slowly through the stone
  else if(t<FALL.hang)P.y=-0.85-0.05*(t-0.9);    // hang for a moment just under it, looking at the underside
  else P.y=-0.95-FALL.vt*(tf-k*(1-Math.exp(-tf/k)));   // then drop, up to a terminal speed
  const vy=tf>0?FALL.vt*(1-Math.exp(-tf/k)):0;
  // look down at the face: ease the pitch, with a slow sway, and let the player's own input push a little
  if(t>1.45)P.pitch+=(FALL.pitch-0.17*sm(3.5,6.4,t)+L.li+0.035*Math.sin(t*1.7)-P.pitch)*(1-Math.exp(-dt*1.8));
  const cam=glFallCam||(glFallCam=new THREE.Vector3());cam.set(P.x,EYE+P.y,P.z);
  // where the face is: under you at first, sliding so that its mouth is directly beneath you when you reach it
  const e=sm(0,FALL.tFall,tf),mouthD=(-BABY.mouth[1])*BABY.scale,lipD=BABY.lipZ*BABY.scale;
  BABY.group.position.set(L.x0+L.fx*mouthD*e,L.lipY-lipD,L.z0+L.fz*mouthD*e);
  const toLip=cam.y-L.lipY;                                    // metres still to fall to the lips
  const open=0.10+0.90*sm(55,6,toLip)+(tf>0?0.05*Math.sin(t*5)*sm(60,30,toLip):0);
  const fade=sm(1.5,3.2,t);
  BABY.update(dt,{camPos:cam,open:t>FALL.hang+FALL.tFall+0.6?Math.max(0,1-(t-FALL.hang-FALL.tFall-0.6)*2):open,t,fade});
  VOID.update(dt,{camPos:cam,t,fade:sm(0.9,1.6,t),gridY:FALL.gridY,px:renderer.getPixelRatio()});
  // sound: wind that rises with speed, a coo as the face wakes, a giggle as the mouth opens, a rising coo at the gape
  if(vy>0&&t>L.wind){L.wind=t+0.45;noise(0.9,0.06+0.07*vy/FALL.vt,200+vy*22,0.6)}
  if(tf>1.2&&L.coo<1){L.coo=1;tone(392,0.5,'sine',0.05,0,+90,-0.2);tone(588,0.5,'sine',0.02,0,+130,-0.2)}
  if(tf>2.6&&L.coo<2){L.coo=2;[440,523,587,523,659,740].forEach((f,i)=>tone(f,0.11,'sine',0.06,i*0.12,f*0.08,(i%2?0.3:-0.3)))}
  if(tf>FALL.tFall-0.9&&L.coo<3){L.coo=3;tone(330,0.9,'sine',0.07,0,+330);tone(660,0.9,'sine',0.025,0.02,+500)}
  const tl=FALL.hang+FALL.tFall;                              // the moment you pass the lips
  if(t>tl-0.3&&!L.dark){L.dark=1;const f=$('fade').style;f.transition='opacity .5s ease-in';f.opacity=1}
  if(t>tl+0.6&&!L.gulp){L.gulp=1;tone(95,0.3,'sine',0.28,0,-45);noise(0.2,0.2,300,1.4);tone(70,0.4,'sine',0.2,0.32,-30)}
  if(t>FALL.wake){
    // wake at the start of the floor. The map remembers only the path you walked
    glFallEnd(true);
    P.x=F.start.tx+0.5;P.z=F.start.ty+0.5;P.yaw=F.start.yaw;P.pitch=0;P.y=0;P.vy=0;P.inv=2;
    if(GL.walked)for(let i=0;i<F.seen.length;i++)F.seen[i]=GL.walked[i];
    $('fade').style.opacity=1;
    onTileChange();tone(48,0.4,'sine',0.3);noise(0.2,0.2,200,1);
    say('Something enormous giggles, far beneath the floor.',4);
    setTimeout(()=>{$('fade').style.opacity=0},400);
  }
}
let glFallCam=null;

/* 7. the humming rooms: a long hall that quietly puts you back at its start */
function glLoopTry(forced){
  if(!F.back&&!forced)return false;
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw),ax=Math.abs(fx)>Math.abs(fz)?0:1,dir=Math.sign(ax?fz:fx)||1;
  if(!forced&&Math.abs(ax?fz:fx)<0.85)return false;
  const at=(s)=>ax?glOpen(P.tx,P.ty+s*dir):glOpen(P.tx+s*dir,P.ty);
  let n=0;while(n<14&&at(n+1))n++;
  if(n<9)return false;
  const p0=ax?P.ty:P.tx;
  GL.loop={ax,dir,a:p0+1*dir,b:p0+6*dir,pass:0,fig:null};
  return true;
}
function glLoopTick(dt,chasing){
  if(!GL.loop){
    if(!archiveRun&&F.back&&!GL.used.loop&&GL.cd<25&&glCalm(chasing)&&(Math.abs(P.vx)+Math.abs(P.vz))>1&&glStart('loop')){GL.used.loop=1}
    return;
  }
  const Lp=GL.loop,pos=Lp.ax?P.z:P.x,cross=Lp.ax?P.x:P.z,rel=(pos-(Lp.b+0.5))*Lp.dir;
  // turned back past the start, wandered off sideways, or something is coming: let go
  const side=Math.abs(cross-((Lp.ax?P.tx:P.ty)+0.5));
  if(chasing||(pos-(Lp.a+0.5))*Lp.dir<-2.5||side>0.9||state!=='play'){glLoopEnd();return}
  if(rel>0&&Lp.pass<4){
    const j=5*Lp.dir,nx=Lp.ax?P.x:P.x-j,nz=Lp.ax?P.z-j:P.z;
    if(blocked(nx,nz)){glLoopEnd();return}
    P.x=nx;P.z=nz;onTileChange();Lp.pass++;GL.dip=0.09;
    for(let i=0;i<GL.hist.length;i++){if(Lp.ax)GL.hist[i][1]-=j;else GL.hist[i][0]-=j}
    if(Lp.pass===2){
      // the third time through, one light in the hall is dead
      for(const q of F.panels){const u=Lp.ax?q.z:q.x,w=Lp.ax?q.x:q.z;if(Math.abs(w-cross)<1.2&&u>=Math.min(Lp.a,Lp.b)-1&&u<=Math.max(Lp.a,Lp.b)+2){q.dead=true}}
      sfx('powerdown');
    }
    if(Lp.pass===3){
      // the fourth time, something is standing at the far end
      const fx=Lp.ax?P.tx+0.5:Lp.b+3*Lp.dir+0.5,fz=Lp.ax?Lp.b+3*Lp.dir+0.5:P.ty+0.5;
      if(!blocked(fx,fz)){GL.figs.push({kind:'pale',x:fx,z:fz,sx:fx,sz:fz,yaw:0,col:[0.92,0.9,0.84],t:-6,seen:0,away:-8,tick:0});Lp.fig=true}
    }
  }else if(rel>0&&Lp.pass>=4&&rel>1.5)glLoopEnd();
}
function glClipForce(){
  if(!F)return false;
  for(let i=0;i<8;i++){
    const a=P.yaw+i*Math.PI/4;
    const dest=noclipDest({x:P.x,z:P.z,hitVX:Math.cos(a)*MOVE.sprint,hitVZ:Math.sin(a)*MOVE.sprint,sprint:true,fullSpeed:MOVE.sprint*0.9,roll:0,chance:1,cell:mazeCell,W:F.W,H:F.H});
    if(dest&&!blocked(dest.x,dest.z))return beginWallClip(dest,Math.cos(a)*MOVE.sprint,Math.sin(a)*MOVE.sprint,a);
  }
  return false;
}
function glLoopEnd(){if(!GL.loop)return;for(const q of F.panels)q.dead=false;GL.loop=null}

/* ---------- render ---------- */
let rs=1,rsCeil=1,fAcc=0,fN=0,goodSecs=0,lastRaise=-99,clock=0,fpsShown=0;
let composer=null,fxaaPass=null,bloomPass=null,gtaoPass=null,viewKey='';
const charMesh=paintedMesh(CH.buf,true,0.012),decorMesh=paintedMesh(DEC.buf,false,0);
const LURK={buf:new Float32Array(13*24000),n:0,cap:24000};
const lurkMesh=paintedMesh(LURK.buf,true,0.012);
lurkMesh.name='lurk-body';
lurkMesh.castShadow=false;
const lurkShadeMat=new THREE.MeshBasicMaterial({color:0x000000,colorWrite:!SHADOWS,depthWrite:false,transparent:!SHADOWS,opacity:SHADOWS?1:0.82});
const lurkShadow=new THREE.Group();
function lurkBox(w,h,d,x,y,z){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),lurkShadeMat);
  m.position.set(x,y,z);m.castShadow=!!SHADOWS;m.layers.set(SHADOWS?1:0);lurkShadow.add(m);return m;
}
const lurkArmL=lurkBox(0.16,0.78,0.14,-0.38,0.72,0.08);
const lurkArmR=lurkBox(0.16,0.82,0.14,0.4,0.68,-0.04);
lurkBox(0.46,0.62,0.3,0,0.78,0);
lurkBox(0.34,0.36,0.32,0.04,1.22,0.12);
lurkBox(0.08,0.26,0.08,-0.12,1.48,0.06);
lurkBox(0.08,0.24,0.08,0.14,1.46,0);
lurkBox(0.22,0.1,0.26,-0.4,0.28,0.2);
lurkBox(0.22,0.1,0.26,0.42,0.24,0.16);
lurkBox(0.14,0.55,0.14,-0.12,0.28,0);
lurkBox(0.14,0.5,0.14,0.14,0.26,0.04);
lurkBox(0.12,0.16,0.42,0,0.62,-0.32);
lurkBox(0.22,0.12,0.2,0.06,1.02,0.28);
lurkShadow.visible=false;lurkShadow.name='lurk-shadow';scene.add(lurkShadow);
function poseLurkShadow(n,t){
  lurkShadow.visible=true;
  lurkShadow.position.set(n.x+(n.ox||0),SHADOWS?0:0.02,n.z+(n.oz||0));
  lurkShadow.rotation.y=-(n.yaw||n.face||0);
  const k=n.aggro?1.15:0.4;
  lurkArmL.rotation.z=Math.sin(t*3+(n.ph||0))*k;
  lurkArmR.rotation.z=-Math.sin(t*3.3+(n.ph||0))*k;
  lurkShadow.scale.set(1.28,SHADOWS?1.28:0.045,1.28);
}
// the torch hand is lit by its own flame, so it never blows out against the light it carries
const HB={buf:new Float32Array(13*6000),n:0,cap:6000};
const handMat=new THREE.ShaderMaterial({
  uniforms:{uAmb:{value:new THREE.Vector3()},uTorch:{value:new THREE.Vector3()},uTip:{value:new THREE.Vector3()}},
  vertexShader:`attribute vec3 color;varying vec3 vN;varying vec3 vC;varying vec3 vP;
void main(){vN=normal;vC=color;vP=position;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform vec3 uAmb;uniform vec3 uTorch;uniform vec3 uTip;varying vec3 vN;varying vec3 vC;varying vec3 vP;
void main(){vec3 alb=pow(max(vC,vec3(0.0)),vec3(2.2));vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;
  float nl=max(dot(N,normalize(uTip-vP)),0.0)*0.8+0.2;
  gl_FragColor=vec4(alb*(uAmb+uTorch*nl),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,side:THREE.DoubleSide});
const handMesh=(()=>{
  const ib=new THREE.InterleavedBuffer(HB.buf,13);ib.setUsage(THREE.DynamicDrawUsage);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.InterleavedBufferAttribute(ib,3,0));
  g.setAttribute('normal',new THREE.InterleavedBufferAttribute(ib,3,3));
  g.setAttribute('color',new THREE.InterleavedBufferAttribute(ib,3,6));
  g.setDrawRange(0,0);
  const m=new THREE.Mesh(g,handMat);m.frustumCulled=false;m.userData.ib=ib;scene.add(m);return m;
})();
function upload(mesh,T){
  const ib=mesh.userData.ib;ib.clearUpdateRanges();ib.addUpdateRange(0,T.n*13);ib.needsUpdate=true;mesh.geometry.setDrawRange(0,T.n);
}
if(POST){
  const rt=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType});
  composer=new EffectComposer(renderer,rt);
  composer.addPass(new RenderPass(scene,camera));
  if(Q>=2){
    gtaoPass=new GTAOPass(scene,camera,4,4);
    gtaoPass.blendIntensity=1.0;
    gtaoPass.updateGtaoMaterial({radius:0.3,distanceExponent:1.4,thickness:1.2,scale:1.25,samples:12,distanceFallOff:1,screenSpaceRadius:false});
    const ov=gtaoPass.overrideVisibility.bind(gtaoPass);
    gtaoPass.overrideVisibility=function(){ov();sprMesh.visible=false};
    composer.addPass(gtaoPass);
  }
  bloomPass=new UnrealBloomPass(new THREE.Vector2(4,4),0.5,0.55,1.0);composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  fxaaPass=new ShaderPass(FXAAShader);composer.addPass(fxaaPass);
}
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),maxPx=2560*1440;
  let pr=dpr*rs;if(w*h*pr*pr>maxPx)pr=Math.sqrt(maxPx/(w*h));
  const key=w+'x'+h+'@'+pr.toFixed(3);if(key===viewKey)return;viewKey=key;
  renderer.setPixelRatio(pr);renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  if(composer){composer.setPixelRatio(pr);composer.setSize(w,h);fxaaPass.material.uniforms.resolution.value.set(1/(w*pr),1/(h*pr))}
}
function adapt(rawDt){
  if(state!=='play'||rawDt>1.5)return;
  fAcc+=rawDt;fN++;clock+=rawDt;
  if(fAcc<1)return;
  const fps=fN/fAcc;fAcc=0;fN=0;fpsShown=fps;
  if(fps<48&&rs>0.5){
    if(clock-lastRaise<6)rsCeil=Math.max(0.5,rs-0.1);
    rs=Math.max(0.5,rs-0.1);goodSecs=0;
  }else if(fps>=57){
    goodSecs++;
    if(goodSecs>=4&&rs<rsCeil-0.001){rs=Math.min(rsCeil,rs+0.1);goodSecs=0;lastRaise=clock}
  }else goodSecs=0;
}
const AMB_ZERO=[0,0,0],ID3=[1,0,0,0,1,0,0,0,1];
const WHITE=[1,1,1],METAL=[0.6,0.62,0.68,4],SCONCE_COL=[1.0,0.5,0.18],PANEL_COL=[1.0,0.95,0.72];
// light levels, tuned by eye against the old renderer
const LK={torch:5.6,pool:3.6,shad:3.8,amb:4,flash:9,env:0.05};
function render(t){
  resize();
  if(!F){renderer.clear();return}
  UT.value=t;
  const title=state==='title';
  const SC=STUDIO&&STUDIO.cam;
  const yaw=SC?SC.yaw:P.yaw, pitch=SC?SC.pitch:title?0:P.pitch;
  const riding=P.mounted&&!P.down&&!P.away;
  const ex=SC?SC.x:P.x, ez=SC?SC.z:P.z, ey=SC?SC.y:Math.min(CAM_TOP,EYE*(title?1:wofEye())+(title?0:P.y+bobY(P,1)+(riding?.16:0)));
  {const cp=Math.cos(pitch);camera.position.set(ex,ey,ez);camera.lookAt(ex+cp*Math.cos(yaw),ey+Math.sin(pitch),ez+cp*Math.sin(yaw))}
  if(FX.flyT>0&&!title){const k=Math.min(1,FX.flyT/1.2);camera.rotateZ(Math.sin(t*FX.spin)*0.5*k);camera.rotateX(Math.cos(t*FX.spin*0.7)*0.25*k)}   // tumbling through the air
  if(FX.bob>0&&!title){camera.rotateZ(Math.sin(t*2.3)*0.06);camera.rotateX(Math.sin(t*1.7)*0.03)}
  if(FX.tickled>0&&!title){const k=0.025;camera.position.x+=(Math.random()-0.5)*k;camera.position.y+=(Math.random()-0.5)*k;camera.position.z+=(Math.random()-0.5)*k}
  if(pkShake>0){const k=0.05*pkShake;camera.position.x+=(Math.random()-0.5)*k;camera.position.y+=(Math.random()-0.5)*k;camera.position.z+=(Math.random()-0.5)*k;pkShake=Math.max(0,pkShake-0.03)}
  if(P.grab){const k=0.012+0.02*Math.min(1,P.grab.t);camera.position.x+=(Math.random()-0.5)*k;camera.position.y+=(Math.random()-0.5)*k;camera.position.z+=(Math.random()-0.5)*k}
  const B=F.biome;
  const fwx=Math.cos(yaw),fwz=Math.sin(yaw),rx=-fwz,rz=fwx;
  const flick=1+Math.sin(t*11)*0.02+Math.sin(t*23.7)*0.015+Math.sin(t*5.3)*0.02;
  const torchR=torchRadius()*flick;
  // the torch is held low in the right hand, so shadows swing as you turn
  const L={ex,ey,ez,B,torchR,tx:ex+rx*0.2+fwx*0.04,ty:ey-0.14,tz:ez+rz*0.2+fwz*0.04};
  if(solidAt(L.tx,L.tz)){L.tx=ex;L.tz=ez}
  {const pl=F.back?0.05+0.95*panelLvl:1;
    const aK=F.ambK||1;
    const aT=F.ambT||[1,1,1],a0=B.amb[0]*aK*aT[0],a1=B.amb[1]*aK*aT[1],a2=B.amb[2]*aK*aT[2];
    L.amb=F.dark?AMB_ZERO:F.back?[a0*pl,a1*pl,a2*pl]:[a0,a1,a2];
    L.fog=[a0*2.2*pl,a1*2.2*pl,a2*2.2*pl];scene.fog.density=0.062*(F.fogK||1);
    if(F.forest){L.fog=[a0*0.4,a1*0.4,a2*0.4];scene.fog.density=0.062*1.3*(F.fogK||1)}
    {const ak=F.back?2.5:LK.amb;ambLight.color.setRGB(L.amb[0]*ak,L.amb[1]*ak,L.amb[2]*ak)}
    scene.fog.color.setRGB(L.fog[0],L.fog[1],L.fog[2]);
    if(scene.environment)scene.environmentIntensity=F.dark?0.01:F.back?0.3*pl:F.forest?0.012:LK.env;}
  torchLight.position.set(L.tx,L.ty,L.tz);
  {const tt=F.torchT||[1,1,1];torchLight.color.setRGB(B.torch[0]*tt[0],B.torch[1]*tt[1],B.torch[2]*tt[2])}
  torchLight.distance=torchR*1.2;
  torchLight.intensity=LK.torch*flick*(0.3+0.7*torchR/7.6)*(F.back?0.5:1);
  flashLight.position.set(ex,ey,ez);flashLight.intensity=flashT*LK.flash;
  // nearest coloured lights: [dist2, x,y,z, colour, strength, radius]
  const lights=[];
  for(const it of F.items){if(it.got||it.type==='chest')continue;const d=(it.x-ex)**2+(it.z-ez)**2;if(d<140)lights.push([d,it.x,0.45,it.z,ITEM[it.type].col,it.type==='gem'?0.5:1.0,2.6])}
  const open=P.shards>=3&&!title;
  const exCol=open?[0.4,1.0,0.6]:[1.0,0.2,0.15];
  lights.push([(F.exit.x-ex)**2+(F.exit.z-ez)**2-4,F.exit.x,0.5,F.exit.z,exCol,1.5,3.2]);
  for(const s of F.shades)if(s.type===2){const d=(s.x-ex)**2+(s.z-ez)**2;if(d<140)lights.push([d,s.x,0.55,s.z,[0.35,0.6,1.0],1.3,3.0])}
  if(F.back&&panelLvl>0.01){const near=[];
    for(const q of F.panels){const d=(q.x-ex)**2+(q.z-ez)**2;if(d<90)near.push([d,q])}
    near.sort((a,b)=>a[0]-b[0]);
    for(let i=0;i<near.length&&i<7;i++){const q=near[i][1],k=(q.dead?0:panelLvl)*(q.bad&&Math.sin(t*31+q.ph)+Math.sin(t*47.7+q.ph*2)<0.4?0.1:1);
      lights.push([near[i][0]+1,q.x,1.12,q.z,PANEL_COL,0.85*k,4.4])}}
  for(const q of F.pockets){const d=(q.x-ex)**2+(q.z-ez)**2;if(d<140)lights.push([d,q.x,1.0,q.z,PANEL_COL,q.found?1.1:0.55,2.3])}
  for(const q of F.sconces){const d=(q.lx-ex)**2+(q.lz-ez)**2;if(d<200){
    const fl=1+Math.sin(t*9+q.ph)*0.07+Math.sin(t*17.3+q.ph*2)*0.05;q.fl=fl;
    lights.push([d-6,q.lx,F.forest?0.68:0.9,q.lz,SCONCE_COL,1.25*fl,4.6,'s'+q.lx+','+q.lz])}}
  if(F.safe){const d=(F.safe.x-ex)**2+(F.safe.z-ez)**2;if(d<400){
    const fl=1+Math.sin(t*8.3)*0.08+Math.sin(t*19.1)*0.05;F.safe.fl=fl;
    lights.push([d-30,F.safe.x,0.85,F.safe.z,[1.0,0.56,0.2],2.3*fl,7.5,'safe'])}}
  for(const n of F.npcs){if(n.type==='keeper')continue;const d=(n.x-ex)**2+(n.z-ez)**2;if(d<140)lights.push([d-3,n.x,n.type==='delver'?0.5:0.95,n.z,[1.0,0.85,0.6],0.75,2.8])}
  if(GD.have&&guideOn()&&!title){const gd=(GD.x-ex)**2+(GD.z-ez)**2;lights.push([gd-10,GD.x,0.65,GD.z,[1.0,0.93,0.8],1.9,6.5])}
  mpLights(lights,ex,ez,B);
  lights.sort((a,b)=>a[0]-b[0]);
  // the nearest fixed flames get real shadows; everything else shares a pool of plain lights
  {const used=new Set();
    if(shadLights.length){
      const st=lights.filter(q=>q[7]).slice(0,shadLights.length),keys=new Set(st.map(q=>q[7]));
      for(const l of shadLights)if(l.userData.key&&!keys.has(l.userData.key))l.userData.key='';
      for(const q of st){
        let l=shadLights.find(s=>s.userData.key===q[7]);
        if(!l){l=shadLights.find(s=>!s.userData.key);if(!l)continue;l.userData.key=q[7];l.position.set(q[1],q[2],q[3]);l.shadow.needsUpdate=true}
        l.color.setRGB(q[4][0],q[4][1],q[4][2]);l.intensity=q[5]*LK.shad;l.distance=q[6]*1.15;used.add(q);
      }
      for(const l of shadLights)if(!l.userData.key)l.intensity=0;
    }
    let i=0;
    for(const q of lights){if(i>=poolLights.length)break;if(used.has(q))continue;
      const l=poolLights[i++];l.position.set(q[1],q[2],q[3]);l.color.setRGB(q[4][0],q[4][1],q[4][2]);l.intensity=q[5]*LK.pool;l.distance=q[6]*1.15}
    for(;i<poolLights.length;i++)poolLights[i].intensity=0;}
  for(const m of worldMats.values())if(m.userData.panel)m.userData.em.value=(Q===0?1.3:2.6)*(F.back?panelLvl:1);

  // traps and crystals are posed into the same buffer as the characters
  const flat={p:[0,0,0],R:ID3,lo:ZERO3};
  sprList.length=0;
  CH.n=0;for(const r of GPU_RIGS)r.hide();NPC_T.tris=0;NPC_T.draws=0;
  for(const tr of F.traps){
    if((tr.x-ex)**2+(tr.z-ez)**2>16*16)continue;
    const h=0.04+trapExt(tr,R.time)*0.44;
    for(const o2 of[[-0.22,-0.22],[0.22,-0.22],[-0.22,0.22],[0.22,0.22],[0,0]])emit(mesh6('cone'),flat,[tr.x+o2[0],0,tr.z+o2[1]],[1,h,1],METAL);
  }
  for(const it of F.items){
    if(it.got||(it.type!=='shard'&&it.type!=='gem'))continue;
    if((it.x-ex)**2+(it.z-ez)**2>18*18)continue;
    const y=0.44+Math.sin(t*2.2+it.ph)*0.05,c=ITEM[it.type].col,sh=it.type==='shard';
    emit(mesh6('octa'),{p:[it.x,sh?y:y-0.12,it.z],R:rYaw((sh?t*1.4:t*2)+it.ph),lo:ZERO3},ZERO3,sh?[0.1,0.23,0.1]:[0.075,0.09,0.075],[c[0],c[1],c[2],11]);
  }
  {const dtR=Math.min(0.1,Math.max(0,t-(CH.lt||t)));CH.lt=t;
  LURK.n=0;lurkShadow.visible=false;
  for(const n of F.npcs){
    const d2=(n.x-ex)**2+(n.z-ez)**2;if(d2>16*16)continue;
    const lurk=n.type==='lurk';
    if(lurk&&d2<144)poseLurkShadow(n,t);
    if((n.x-ex)*fwx+(n.z-ez)*fwz<-1.5)continue;
    if(lurk)TB=LURK;
    const tN=performance.now();const o=buildNpc(n,t,ex,ey,ez,dtR);NPC_T.ms+=performance.now()-tN;NPC_T.n++;
    if(lurk)TB=CH;
    if(o.lantern){const q=o.lantern,fl=1+Math.sin(t*10+n.ph)*0.1;spr(q[0],q[1]+0.012,q[2],0.045*fl,0.07*fl,11,1.0,0.6,0.2,1,1);spr(q[0],q[1],q[2],0.5,0.5,7,1.0,0.5,0.15,0.3,1)}
    if(o.lamp){const q=o.lamp;spr(q[0],q[1],q[2],0.22,0.22,7,1.0,0.75,0.3,0.4,1)}
    if(!lurk&&!n.used&&n.type!=='keeper'){const y=o.top+0.08+Math.sin(t*3+n.ph)*0.03,X=n.x+(n.ox||0),Z=n.z+(n.oz||0);spr(X,y,Z,0.08,0.08,7,1.0,0.85,0.4,1,1);spr(X,y,Z,0.32,0.32,7,1.0,0.7,0.2,0.3,1)}
  }
  wofDraw(t,ex,ey,ez,dtR);}
  drawMoose(t,title||!!STUDIO);drawScout(t,title||!!STUDIO);mpDrawPlayers(t,ex,ez,fwx,fwz);mimicDraw(t,ex,ez);glDraw(t,ex,ez,fwx,fwz);
  if(F.safe&&(F.safe.x-ex)**2+(F.safe.z-ez)**2<22*22){
    const fl=F.safe.fl||1,X=F.safe.x,Z=F.safe.z;
    spr(X,0.72,Z,0.42*fl,0.62*fl,11,1.0,0.55,0.16,1,1);
    spr(X+Math.sin(t*5.1)*0.05,0.66,Z+Math.cos(t*4.3)*0.05,0.3,0.42,11,1.0,0.75,0.3,0.9,1);
    spr(X,0.75,Z,1.9,1.9,7,1.0,0.42,0.1,0.32*fl,1);
    for(let i=0;i<4;i++){const a=((t*0.35+i*0.25)%1);spr(X+Math.sin(i*2.4+t)*0.12*a,0.8+a*0.9,Z+Math.cos(i*1.7+t)*0.12*a,0.025,0.025,7,1.0,0.6,0.2,1-a,1)}
  }
  for(const s of F.shades){
    const d2=(s.x-ex)**2+(s.z-ez)**2;if(d2>18*18||s.type===2)continue;
    if((s.x-ex)*fwx+(s.z-ez)*fwz<-1.5)continue;
    if(s.type===3){const e=buildWatcher(s,t,ex,ez);if(F.blk===2)for(const q of e)spr(q[0],q[1],q[2],0.045,0.045,7,0.95,0.92,0.8,1,1)}
    else if(s.type===1)buildStalker(s,t,ex,ez);
    else{
      const o=buildShade(s,t,ex,ez);
      if(s.stun<=0){
        const ec=o.chase?[1.0,0.22,0.15]:[0.75,0.65,1.0];
        for(const e of o.eyes)spr(e[0],e[1],e[2],0.075,0.075,7,ec[0],ec[1],ec[2],1,1);
        if(o.chase)spr(s.x,0.6,s.z,1.5,1.5,7,0.8,0.05,0.1,0.25,1);
      }
    }
  }

  upload(charMesh,CH);
  upload(lurkMesh,LURK);
  // the torch in your hand, drawn close to the eye so it never pokes through a wall
  HB.n=0;
  if(!title&&state!=='dead'&&!P.down){
    const fm=wofForm();
    TB=HB;const q=fm?buildCritter({rx:P.x,rz:P.z,ry:P.y,ryaw:yaw,rpitch:pitch,walk:P.bob,spd:Math.hypot(P.vx,P.vz),fat:FX.fat>0,pox:FX.pox>0,curl:FX.curl},t,fm,true).torch:buildHand(t,ex,ey,ez,yaw,pitch);TB=CH;
    const hk=0.3,b=HB.buf;
    for(let i=0;i<HB.n;i++){const o=i*13;b[o]=ex+(b[o]-ex)*hk;b[o+1]=ey+(b[o+1]-ey)*hk;b[o+2]=ez+(b[o+2]-ez)*hk}
    const hx=ex+(q[0]-ex)*hk,hy=ey+(q[1]-ey)*hk,hz=ez+(q[2]-ez)*hk,lit=P.fuel>0;
    let ar=L.amb[0]*4,ag=L.amb[1]*4,ab=L.amb[2]*4;
    for(let i=0;i<lights.length&&i<4;i++){const l=lights[i],k=Math.max(0,1-Math.sqrt(Math.max(l[0],0))/l[6]);ar+=l[4][0]*l[5]*k*k*0.5;ag+=l[4][1]*l[5]*k*k*0.5;ab+=l[4][2]*l[5]*k*k*0.5}
    handMat.uniforms.uAmb.value.set(ar+0.01,ag+0.01,ab+0.012);
    handMat.uniforms.uTorch.value.set(lit?B.torch[0]*5:0,lit?B.torch[1]*5:0,lit?B.torch[2]*5:0);
    handMat.uniforms.uTip.value.set(hx,hy,hz);
    if(lit){const k=(0.55+0.45*Math.sqrt(P.fuel/100))*hk,fl=1+Math.sin(t*13)*0.08+Math.sin(t*29.3)*0.06;
      spr(hx,hy,hz,0.05*k*fl,0.085*k*fl,11,1.0,0.6,0.2,1,1);
      spr(hx+Math.sin(t*7.1)*0.004*hk,hy-0.008*hk,hz+Math.cos(t*6.3)*0.004*hk,0.036*k,0.06*k,11,1.0,0.85,0.45,0.9,1);
      spr(hx,hy,hz,0.3*k,0.3*k,7,1.0,0.5,0.15,0.22*fl,1);}
  }
  upload(handMesh,HB);
  // sprites
  for(const it of F.items){
    if(it.got)continue;
    const d2=(it.x-ex)**2+(it.z-ez)**2;if(d2>18*18)continue;
    const I=ITEM[it.type],y=0.42+Math.sin(t*2.2+it.ph)*0.05,c=I.col;
    spr(it.x,y,it.z,I.size*2.6,I.size*2.6,7,c[0],c[1],c[2],0.4,1);
    if(it.type!=='shard'&&it.type!=='gem')spr(it.x,y,it.z,I.size,I.size,I.cell,1,1,1,1,0);
  }
  { const pulse=0.75+Math.sin(t*3)*0.25;
    spr(F.exit.x,WALL_H/2,F.exit.z,0.8,WALL_H,6,exCol[0],exCol[1],exCol[2],pulse,1);
    spr(F.exit.x,0.25,F.exit.z,1.3,0.9,7,exCol[0],exCol[1],exCol[2],0.6,1); }
  if(GD.have&&guideOn()&&!title){const pu=0.85+0.15*Math.sin(t*2.1),gd=Math.hypot(GD.x-ex,GD.z-ez);
    // a soft shaft and halo that carry down a long corridor, a small bright core; it dims a little as you walk into it
    const near=clamp(gd/2.5,0.25,1);
    spr(GD.x,WALL_H/2,GD.z,0.9,WALL_H,6,1.0,0.94,0.8,0.38*pu*near,1);
    spr(GD.x,0.62,GD.z,1.5,1.5,7,1.0,0.93,0.78,0.5*pu*near,1);
    spr(GD.x,0.62,GD.z,0.34,0.34,7,1.0,0.98,0.9,0.95*near,1);}
  for(const s of F.shades){
    if(s.type!==2||(s.x-ex)**2+(s.z-ez)**2>18*18)continue;
    const y=0.56+Math.sin(s.ph)*0.03,a=s.stun>0?0.35:1;
    spr(s.x,y,s.z,1.3,1.3,7,0.25,0.45,1.0,0.5*a,1);spr(s.x,y+Math.sin(s.ph*2.3)*0.03,s.z,0.42,0.6,11,1,1,1,a,1);
  }
  for(const q of F.sconces){
    if((q.x-ex)**2+(q.z-ez)**2>20*20)continue;
    const fo=F.forest?0.17:0.07,fy=F.forest?0.67:0.93,fx=q.x-q.dx*fo,fz=q.z-q.dz*fo,fl=q.fl||1;
    spr(fx,fy,fz,F.forest?0.09*fl:0.15*fl,F.forest?0.15*fl:0.24*fl,11,1.0,0.55,0.16,1,1);
    spr(fx,fy,fz,0.8,0.8,7,1.0,0.42,0.1,0.3*fl,1);
    if(Q>0&&(q.x-ex)**2+(q.z-ez)**2<81)for(let i=0;i<3;i++){const a=(t*0.4+i*0.33+q.ph)%1;spr(fx+Math.sin(i*2.4+t*1.3+q.ph)*0.06*a,fy+0.05+a*0.45,fz+Math.cos(i*1.7+t+q.ph)*0.06*a,0.018,0.018,7,1.0,0.6,0.2,(1-a)*0.9,1)}
  }
  if(flashT>0){const k=1-flashT,rr=0.4+k*5.5;
    for(let i=0;i<18;i++){const a=i/18*6.283+k;spr(ex+Math.cos(a)*rr,0.25+((i*7)%5)*0.16,ez+Math.sin(a)*rr,0.25,0.25,7,0.8,0.9,1.0,flashT*0.8,1)}}
  pkFxDraw();xrayDraw(t);
  for(const m of DUST){
    const px=ex+((m[0]+Math.sin(t*0.21+m[3])*0.4-ex)%8+12)%8-4,pz=ez+((m[2]+Math.cos(t*0.17+m[3])*0.4-ez)%8+12)%8-4;
    const py=0.05+((m[1]+t*0.012+Math.sin(t*0.3+m[3])*0.05)%1.15);
    const k=clamp(1-Math.hypot(px-ex,pz-ez)/Math.min(torchR,4),0,1);
    if(k>0.02)spr(px,py,pz,m[4]*2.4,m[4]*2.4,7,B.torch[0],B.torch[1],B.torch[2],k*0.5,1);
  }
  if(F.forest&&F.fo.n){
    const P2=F.fo.n,fv=F.variant.fo;
    for(const q of P2.flies){if((q.x-ex)**2+(q.z-ez)**2>64)continue;
      const fx=q.x+Math.sin(t*q.sp+q.ph)*0.3,fy=q.y+Math.sin(t*q.sp*1.7+q.ph*2)*0.1,fz=q.z+Math.cos(t*q.sp*0.8+q.ph)*0.3,bl=0.5+0.5*Math.sin(t*(1.2+q.sp)+q.ph*3);
      spr(fx,fy,fz,0.045,0.045,7,0.75,1,0.4,0.95*bl,1);spr(fx,fy,fz,0.2,0.2,7,0.5,1,0.3,0.3*bl,1)}
    if(fv.glow>0)for(const q of P2.shrooms){if((q.x-ex)**2+(q.z-ez)**2<30)spr(q.x,0.07,q.z,0.32*q.sx,0.32*q.sx,7,0.3,0.9,0.8,0.05*fv.glow,1)}
  }
  // a strange door gives itself away at the keyhole: cold starlight, kiln glow, or nothing at all
  for(const D of F.sdoors){
    if(D.used||(D.x-ex)**2+(D.z-ez)**2>64)continue;
    const gl=DOOR_LOOKS[doorLookOf(D)].glow;if(!gl)continue;
    const c=Math.cos(D.r),s=Math.sin(D.r),kx=D.x+c*0.05-s*0.17,kz=D.z+s*0.05+c*0.17,q=gl(D,t);
    spr(kx,0.4,kz,0.09,0.09,7,q[0],q[1],q[2],q[3],1);
  }
  const n=Math.min(sprList.length,MAXS);
  for(const s of sprList)s.d=(s.x-ex)**2+(s.z-ez)**2;
  sprList.sort((a,b)=>b.d-a.d);
  let o=0;
  for(let i=0;i<n;i++){
    const s=sprList[i],hw=s.w/2,hh=s.h/2;
    const u0=(s.cell%4)/4+0.002,u1=(s.cell%4+1)/4-0.002,v0=(s.cell>>2)/4+0.002,v1=((s.cell>>2)+1)/4-0.002;
    const xl=s.x-rx*hw,zl=s.z-rz*hw,xr=s.x+rx*hw,zr=s.z+rz*hw,yb=s.y-hh,yt=s.y+hh;
    const vv=[[xl,yb,zl,u0,v1],[xr,yb,zr,u1,v1],[xr,yt,zr,u1,v0],[xl,yb,zl,u0,v1],[xr,yt,zr,u1,v0],[xl,yt,zl,u0,v0]];
    for(const q of vv){sprData[o++]=q[0];sprData[o++]=q[1];sprData[o++]=q[2];sprData[o++]=q[3];sprData[o++]=q[4];
      sprData[o++]=s.r;sprData[o++]=s.g;sprData[o++]=s.b;sprData[o++]=s.a;sprData[o++]=s.add}
  }

  sprIB.clearUpdateRanges();sprIB.addUpdateRange(0,o);sprIB.needsUpdate=true;sprGeo.setDrawRange(0,n*6);
  renderer.toneMappingExposure=Math.pow(bright/1.3,1.6);
  if(composer)composer.render();else renderer.render(scene,camera);
}

/* ---------- self-check: is the picture actually there? ---------- */
let titleFrames=0;
function gpuName(){try{const e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}catch(e){return 'unknown'}}
function selfCheck(){
  const px=new Uint8Array(16*16*4);
  try{gl.readPixels((canvas.width>>1)-8,Math.round(canvas.height*0.1),16,16,gl.RGBA,gl.UNSIGNED_BYTE,px)}catch(e){}
  let mx=0;for(let i=0;i<px.length;i+=4)mx=Math.max(mx,px[i],px[i+1],px[i+2]);
  const err=gl.getError();
  if(mx>=3){$('diag').textContent=(SAFE?'Compatibility graphics · ':['Low','Medium','High'][Q]+' graphics · ')+gpuName();return}
  if(Q>0){lsSet('quality','low');location.reload();return}
  if(!SAFE){lsSet('safe',1);location.reload();return}
  $('diag').innerHTML='<span style="color:#ff9a6a">The graphics driver is drawing a black picture (code '+err+'). Please send this line to Claude: '+gpuName()+'</span>';
}
/* ---------- HUD + map ---------- */
const hudCache={};
function setText(id,v){if(hudCache[id]!==v){hudCache[id]=v;$(id).textContent=v}}
function setHTML(id,v){if(hudCache[id]!==v){hudCache[id]=v;$(id).innerHTML=v}}
function setW(id,p){const v=Math.round(p)+'%';if(hudCache[id]!==v){hudCache[id]=v;$(id).style.width=v}}
function drawHUD(){
  setText('depthName',F.name);
  setText('depthLine',GL.hudOv.depthLine||'Depth '+R.depth);
  setText('scoreLine','Score '+R.score);
  setText('seedLine','Seed '+R.seed);
  setHTML('hearts','♥'.repeat(Math.max(0,P.hp))+'<i>'+'♥'.repeat(Math.max(0,maxHp()-Math.max(0,P.hp)))+'</i>');
  setW('fuelFill',P.fuel);setW('stamFill',P.stam);
  setText('shards',GL.hudOv.shards||'◆ '+P.shards+' / 3 shards');
  setText('flashes','✦ '+P.flash+' flash'+(P.flash===1?'':'es')+(P.pick>0?'   ⛏ '+P.pick:''));
  document.body.classList.toggle('haspick',P.pick>0&&state==='play');
  document.body.classList.toggle('hasmoose',P.moose&&!P.down&&state==='play');
  setText('tMoose',P.mounted?'DISMOUNT':'RIDE');
  const lure=mooseLures.get(MP.guest?MP.id:'');
  const pet=P.moose?(P.mounted?'Riding zombie moose · +25% speed':'Zombie moose')+
    (touch.on?'':pad.id?' · ↑ ride / ↓ lure':' · R ride / G lure'):
    lure?.hp>0?'Released moose '+ '♥'.repeat(lure.hp)+'♡'.repeat(3-lure.hp):'';
  setText('mooseLine',[P.spikeTraps?P.spikeTraps+' spike trap'+(P.spikeTraps===1?'':'s'):'',pet].filter(Boolean).join(' · '));
  const scout=F?.scout;
  setText('scoutLine',scout?'Turbo 6000 G · '+(scout.contacts.length?scout.contacts.length+' hostile'+(scout.contacts.length===1?'':'s')+' marked':'scouting'):'');
  setText('keysLine',(P.keys?'⚷ gate key':'')+(P.ward?(P.keys?' · ':'')+'◈ ward stone':''));
  setText('embers','● '+wallet+(wallet===1?' gem':' gems')+' · Level '+plLevel());
  setText('mpLine',mpHudLine());
  setText('fps',fpsShown?Math.round(fpsShown)+' fps · '+Math.round(rs*100)+'% res':'');
}
const mapCv=$('map'),mctx=mapCv.getContext('2d');let mapMode='';
function drawMap(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const size=mapBig?Math.round(Math.min(innerHeight*0.82,innerWidth*(touch.on?0.9:0.6),760)):(touch.on?130:190);
  const mode=size+':'+dpr;
  if(mode!==mapMode){mapMode=mode;mapCv.width=mapCv.height=Math.round(size*dpr);mapCv.style.width=mapCv.style.height=size+'px';mapCv.classList.toggle('big',mapBig)}
  const c=mctx;c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,size,size);c.fillStyle='rgba(8,6,10,'+(mapBig?0.9:0.7)+')';c.fillRect(0,0,size,size);
  let ts,ox,oy;
  if(mapBig){ts=size/Math.max(F.W,F.H);ox=(size-F.W*ts)/2;oy=(size-F.H*ts)/2}
  else{ts=touch.on?7:9;ox=size/2-P.x*ts;oy=size/2-P.z*ts}
  const x0=Math.max(0,Math.floor(-ox/ts)),x1=Math.min(F.W-1,Math.ceil((size-ox)/ts));
  const y0=Math.max(0,Math.floor(-oy/ts)),y1=Math.min(F.H-1,Math.ceil((size-oy)/ts));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const i=y*F.W+x;
    if(!F.seen[i])continue;
    c.fillStyle=F.safeMask[i]?'#c79a4e':F.scout?.mapped[i]?'#40696d':'#7d7263';
    c.fillRect(ox+x*ts,oy+y*ts,ts+0.5,ts+0.5);
  }
  if(F.door){const D=F.door,W2=F.W;if(F.seen[D.ty*W2+D.tx-1]||F.seen[D.ty*W2+D.tx+1]||F.seen[(D.ty-1)*W2+D.tx]||F.seen[(D.ty+1)*W2+D.tx]){c.fillStyle='#b5762a';c.fillRect(ox+D.tx*ts,oy+D.ty*ts,ts,ts)}}
  for(const D of F.sdoors)if(F.seen[D.ty*F.W+D.tx]){c.fillStyle=D.used?'#4a4038':'#c58bff';c.fillRect(ox+(D.tx+0.5+D.dx*0.5)*ts-ts*0.25,oy+(D.ty+0.5+D.dz*0.5)*ts-ts*0.25,ts*0.5,ts*0.5)}
  c.fillStyle='#c0392b';
  for(const tr of F.traps)if(F.seen[tr.ty*F.W+tr.tx])c.fillRect(ox+(tr.tx+0.3)*ts,oy+(tr.ty+0.3)*ts,ts*0.4,ts*0.4);
  const dot=(x,z,r,col)=>{c.fillStyle=col;c.beginPath();c.arc(ox+x*ts,oy+z*ts,r,0,7);c.fill()};
  if(F.seen[F.exit.ty*F.W+F.exit.tx]||F.reveal){c.fillStyle=P.shards>=3?'#5dff9a':'#ff4a3a';c.fillRect(ox+F.exit.tx*ts,oy+F.exit.ty*ts,ts,ts)}
  for(const it of F.items){
    if(it.got||(!F.seen[it.ty*F.W+it.tx]&&!(F.reveal&&it.type==='shard')))continue;
    dot(it.x,it.z,(it.type==='shard'||it.type==='key')?Math.max(3,ts*0.4):Math.max(1.6,ts*0.22),it.type==='shard'?'#7fe9ff':it.type==='key'?'#ffd35a':it.type==='oil'?'#ff9a2e':it.type==='gem'?'#ffd84a':it.type==='heart'?'#ff5a6a':'#ffffff');
  }
  if(F.safe&&F.seen[F.safe.ty*F.W+F.safe.tx+1])dot(F.safe.x,F.safe.z,Math.max(2.5,ts*0.3),'#ff8a2a');
  for(const n of F.npcs)if(F.seen[Math.floor(n.z)*F.W+Math.floor(n.x)]){c.fillStyle=n.type==='lurk'&&n.aggro?'#ff2a4a':n.type==='keeper'?'#ffe0a0':'#8ff0d0';c.fillRect(ox+n.x*ts-2.5,oy+n.z*ts-2.5,5,5)}
  for(const s of F.shades)if(s.vis)dot(s.x,s.z,Math.max(3,ts*0.4),s.type===1?'#e6e0d2':s.type===2?'#5aa8ff':s.state===1?'#ff2a4a':'#a07cff');
  for(const p of MP.peers.values()){if(!mpShown(p))continue;
    c.save();c.translate(ox+p.rx*ts,oy+p.rz*ts);c.rotate(p.ryaw);c.fillStyle=p.down?'#777':p.hex;
    c.beginPath();c.moveTo(5,0);c.lineTo(-3.5,3.5);c.lineTo(-1.5,0);c.lineTo(-3.5,-3.5);c.closePath();c.fill();c.restore()}
  if(!P.down){
  c.save();c.translate(ox+P.x*ts,oy+P.z*ts);c.rotate(P.yaw);
  c.fillStyle='#ffc27a';c.beginPath();c.moveTo(6,0);c.lineTo(-4,4);c.lineTo(-2,0);c.lineTo(-4,-4);c.closePath();c.fill();c.restore();
  }
  if(F.back&&!F.scout){
    const S2=mapCv.width,tk=Math.floor(R.time*7),r=k=>{const v=Math.sin(tk*12.9898+k*78.233)*43758.5453;return v-Math.floor(v)};
    c.setTransform(1,0,0,1,0,0);
    if(F.blk===2){c.fillStyle='#050406';c.fillRect(0,0,S2,S2)}
    else if(r(0)<0.4||F.blk===1)for(let i=0;i<3;i++){const y=Math.floor(r(1+i)*S2),h=Math.floor(3+r(4+i)*S2*0.09),dx=Math.floor((r(7+i)-0.5)*S2*0.3);c.drawImage(mapCv,0,y,S2,h,dx,y,S2,h)}
    c.fillStyle='rgba(255,240,170,0.45)';for(let i=0;i<(F.blk===2?90:36);i++)c.fillRect(Math.random()*S2,Math.random()*S2,2*dpr,dpr);
  }
  if(F.scout){
    const scout=F.scout;
    dot(scout.x,scout.z,Math.max(2.5,ts*.3),'#52eeff');
    for(const m of scout.contacts){
      const x=ox+m.x*ts,z=oy+m.z*ts,r=Math.max(3.4,ts*.42);
      c.strokeStyle='#ff6477';c.lineWidth=1.5;c.beginPath();
      c.moveTo(x,z-r);c.lineTo(x+r,z);c.lineTo(x,z+r);c.lineTo(x-r,z);c.closePath();c.stroke();
    }
  }
}

/* ---------- main loop ---------- */
let last=performance.now(),wasPlaying=false;
function step(now){
  const raw=Math.max(0,(now-last)/1000);last=now;
  const dt=Math.min(raw,0.05);
  pollPad();
  if(lobbyPaused&&(state!=='title'||activeStation||loading||touch.on))lobbyPauseHide(false);
  if(roomPaused&&(state!=='room'||touch.on))roomPauseHide(false);
  if(loading){mpTick(raw);return raw}
  const moving=state==='play'||state==='room'||state==='title';
  if(moving!==wasPlaying){wasPlaying=moving;document.body.classList.toggle('playing',wasPlaying)}
  roomWatch();
  if(state==='room'){if(!roomPaused)ROOMS.update(dt,roomInput());else if(MP.on)ROOMS.update(dt,NOIN);if(state==='room'){$('fade').style.opacity=ROOMS.fade();$('roomCross').classList.toggle('on',ROOMS.aimed());mirrorBtns()}}
  else if(ROOMS.watching){ROOMS.update(dt,NOIN);$('fade').style.opacity=ROOMS.fade()}
  const live=()=>state==='play'||(MP.on&&(state==='pause'||state==='talk'||state==='room'));
  // a fake hang: nothing moves for you, though the room carries on
  if(GL.frz>0){GL.frz-=raw;if(GL.frz<=0)glUnfreeze();mpTick(raw);return raw}
  if(live()&&!STUDIO){
    // a host whose tab is in the background still runs the creatures, in catch-up steps
    if(raw>0.1&&MP.host&&document.hidden){let left=Math.min(raw,1);while(left>0&&live()){const s=Math.min(left,0.05);update(s);left-=s}}
    else update(dt);
  }
  else if(state==='title'){
    hub.update(dt,lobbyPaused?NOIN:roomInput(),raw);
    if(sharedLift.trip&&!hub.riding)hub.watchLift(sharedLift.trip.motion);
    else if(!hub.riding)hub.watchLift(null);
    if(shaftQueue.length&&raw<0.02&&!hub.riding)shaftQueue.shift()();
    else if(warmed&&warmed.left>0&&raw<0.02&&!hub.riding){warmed.task.advance();warmed.left--}
    hub.syncVisitors(MP.on?[...MP.peers.values()].filter(p=>p.hub&&now-p.hub.at<15000):[],dt,now/1000);
    updateSettingsScreen();
    $('hubCross').classList.toggle('ready',hub.aimed);
  }
  else if(state==='room'&&!STUDIO)wofTick(dt);   // solo: update() sleeps behind a door, but the wheel and the floor's creatures do not
  mpTick(raw);
  return raw;
}
function frame(now){
  try{frameBody(now)}catch(error){console.error(error)}
  requestAnimationFrame(frame);
}
function frameBody(now){
  advanceLoading(now);
  const raw=step(now);
  if(loading&&loading.index<loading.stages.length)return;
  mpVoiceTick(Math.min(raw,0.1));chatTick();
  if(state==='play'&&!STUDIO&&!loading)adapt(raw);
  setHum();updateAmbience(Math.min(raw,0.1),{F,state,hold:GL.frz>0||!!GL.fall||P.away});
  updateMusic(Math.min(raw,0.1),{F,state,lift:state==='title'&&hub.riding,chasing:CHASE.n,nearest:CHASE.near,inRoom:state==='room'||ROOMS.watching||ROOMS.active,voiceActive:MP.on&&[...MP.peers.keys()].some(id=>VOX.speaking(id))});
  if(GL.frz<=0){
    if(!window.__norender){
      if(state==='title'){
        resize();hub.render(Math.sqrt(bright/1.3),now/1000);
        if(++titleFrames===20)selfCheck();
      }
      else if((state==='room'||ROOMS.watching)&&ROOMS.active){resize();renderer.toneMappingExposure=1;ROOMS.render()}
      else if(FX.frozen&&BRK&&BRK.active&&state!=='room'){resize();renderer.toneMappingExposure=1;BRK.render(raw)}
      else render(now/1000);
    }
    if(state!=='title'){drawHUD();if(state!=='room'&&!ROOMS.watching)drawMap()}
    mpTags();
  }
}
setInterval(()=>{
  if(!document.hidden)return;
  const now=performance.now();
  advanceLoading(now);
  if((MP.host||MP.on&&state==='title')&&now-last>200)step(now);
},100);
/* ---------- entrance hall and discovery archives ---------- */
const archiveCatalog={
  doors:{title:'Door Archive',action:'Enter',hint:'Open strange doors during a descent to record them.',entries:Object.fromEntries(
    Object.entries(DOOR_KINDS).map(([id,door])=>[id,door.name[0].toUpperCase()+door.name.slice(1)]))},
  floors:{title:'Floor Archive',action:'Explore',hint:'Reach a floor type during a descent to record it.',entries:{
    maze:'Stone Maze',cave:'The Hollow',back:'The Humming Rooms',dark:'The Black Hush',forest:'The Dark Forest'}},
  mobs:{title:'Mob Archive',action:'Encounter',hint:'Spot creatures during a descent, in the maze or behind a strange door, to record them.',entries:{
    0:'Shade',1:'Stalker',2:'Wisp',3:'Watcher',mimic:'Mimic',lurk:'Wrong Shadow',
    ...Object.fromEntries(Object.entries(ROOM_MOBS).map(([id,mob])=>[id,mob.name]))}},
  glitches:{title:'Glitch Archive',action:'Replay',hint:'Experience anomalies during a descent to record them.',entries:{
    freeze:'Frozen Frame',rubber:'Rubber Band',rubberfwd:'Fast Forward',replay:'Player Rewind',
    hud:'Corrupted HUD',tpose:'Rigid Figure',hole:'Unloaded Wall',fall:'Falling Through the World',loop:'Repeating Hall',
    clip:'Passed Through a Wall'}}
};
const archive=Object.fromEntries(Object.keys(archiveCatalog).map(kind=>{
  const saved=store.get('archive.'+kind,{});
  return [kind,saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{}];
}));
const hub=createMenuRoom(renderer,{sfx,asset:exhibitAsset,activate:useMenuAsset,enterLanding:startFromLanding,
  sampleFloor:memoFloor,prepareLanding:preparedLanding,landingGlimpse,passingLook,onLeavePanel:()=>closeStation(),createVisitor:buildHubVisitor});
const board=$('title');
const stationPanels=[...document.querySelectorAll('[data-station-panel]')];
$('newsList').replaceChildren(...NEWS.map(post=>{
  const item=document.createElement('article'),when=document.createElement('time'),head=document.createElement('h2'),text=document.createElement('p');
  when.textContent=post.date;head.textContent=post.title;text.textContent=post.body;
  item.append(when,head,text);return item;
}));
const scrollNews=dy=>{if(activeStation!=='news')return false;board.scrollBy({top:dy});return true};
let activeStation=null;
const sharedLift={selection:null,pending:0,trip:null,waiting:[]};
const terminalPlayerName=id=>id===MP.id?myName():MP.peers.get(id)?.name||'Delver';
const terminalSession=createTerminalSession({
  playerId:()=>MP.id,playerName:terminalPlayerName,
  canReach(id){
    const p=id===MP.id?(state==='title'&&!hub.riding&&hub.presence):MP.peers.get(id)?.hub;
    return !!p&&(p.at===undefined||performance.now()-p.at<15000)&&hub.settingsInReach(p);
  },
  publish:(session,revision)=>mpSend({k:'terminalState',session,revision}),
  apply:applySharedSetting,
  read:()=>settingsScreen.read(),
});
const settingsScreen=createSettingsScreen(board,{
  close:closeStation,enabled:()=>hub.settingsInReach(hub.presence),
  select(key,value,highlight){
    if(!MP.on||activeStation!=='settings')return;
    const action={k:'terminalSelect',key,value,highlight,initial:settingsScreen.read()};
    if(MP.host)terminalSession.select(MP.id,action);
    else if(MP.hostId){sendHubPresence(MP.hostId);mpSend(action,MP.hostId)}
  },
});
hub.sharedSettings(settingsScreen.screen,settingsScreen.display);

const liftFloorLimit=()=>Math.max(40,deepest);
const defaultLiftFloor=()=>URL_DEPTH||+$('startSel').value||1;
const validLiftDepth=depth=>Number.isSafeInteger(depth)&&depth>=1;
const partyDeepestFloor=()=>Math.max(deepest,...[...MP.peers.values()].map(peer=>peer.deepest||1));

function resetSharedLift(){
  Object.assign(sharedLift,{selection:MP.host?{depth:defaultLiftFloor(),max:liftFloorLimit(),deepest,by:''}:null,pending:0,trip:null,waiting:[]});
  hub.setSharedLift(sharedLift.selection,false);
}

function updateLiftScreen(){
  const selection=sharedLift.selection;
  // The cabin stays in the world while a car is away. watchLift moves it for anyone still in the hall.
  hub.setSharedLift(selection,false);
  if(activeStation!=='lift')return;
  const field=$('liftDepth'),go=$('liftGo');
  const joining=!!(MP.guest&&MP.run&&!sharedLift.trip);
  field.max=selection?.max||liftFloorLimit();
  if(joining){
    field.value=MP.run.d;
    field.disabled=$('liftDeepest').disabled=true;
    go.disabled=false;
    go.textContent='Join floor '+MP.run.d;
    $('liftDeepest').textContent='Deepest reached · '+(selection?.deepest||deepest);
    $('liftRunType').textContent=hostName()+' is on this floor. You will arrive beside them.';
    return;
  }
  go.textContent='Descend';
  if(MP.on&&selection&&field.valueAsNumber!==selection.depth)field.value=selection.depth;
  $('liftDeepest').textContent='Deepest reached · '+(MP.on?selection?.deepest||deepest:deepest);
  $('liftRunType').textContent=MP.on?(selection?.pending?'Departing · riders on the platform go together':
    selection?.by?selection.by+' selected floor '+selection.depth:'Shared destination · all aboard ride together'):'Solo descent';
  // A guest can still press Descend; the click explains itself if the host has not answered yet.
  field.disabled=go.disabled=$('liftDeepest').disabled=!!(MP.on&&selection?.pending);
}

function publishLiftSelection(to){
  if(!sharedLift.selection)return;
  mpSend({k:'liftSelection',...sharedLift.selection},to);
  if(!to)updateLiftScreen();
}

function aboardSharedLift(id){
  if(id===MP.id)return state==='title'&&hub.boarded&&!hub.riding;
  const p=MP.peers.get(id)?.hub;
  return !!p&&!p.ride&&onLiftPlatform(p);
}

function selectLiftDepth(id,depth){
  const max=sharedLift.selection?.max||liftFloorLimit();
  if(state!=='title'||sharedLift.pending||sharedLift.trip||!aboardSharedLift(id)||!validLiftDepth(depth)||depth>max)return;
  sharedLift.selection={...sharedLift.selection,depth,max,by:terminalPlayerName(id)};
  publishLiftSelection();
}

function requestLiftDeparture(id,shortcut=false){
  if(state!=='title'||sharedLift.pending||sharedLift.trip||!aboardSharedLift(id))return;
  sharedLift.pending=performance.now()+420;
  sharedLift.selection={...sharedLift.selection,pending:true};
  if(shortcut){
    const reached=partyDeepestFloor();
    sharedLift.selection.depth=sharedLift.selection.deepest=reached;
    sharedLift.selection.max=Math.max(40,reached);
    sharedLift.selection.by=terminalPlayerName(id);
  }
  publishLiftSelection();
}

function startSharedLift(packet){
  if(state!=='title'||sharedLift.trip||typeof packet.id!=='string'||typeof packet.seed!=='string'||
    !validLiftDepth(packet.depth)||!validLiftDepth(packet.max)||packet.depth>packet.max||
    !Array.isArray(packet.members)||!packet.members.includes(packet.pilot))return;
  const {id,depth,max,seed,pilot,members}=packet;
  const trip={id,depth,pilot,members,packet,motion:null,started:performance.now()};
  sharedLift.trip=trip;
  sharedLift.pending=0;
  sharedLift.selection={...sharedLift.selection,depth,max};
  MP.host=pilot===MP.id;
  MP.guest=!MP.host;
  MP.hostId=MP.host?null:pilot;
  MP.wantJoin=false;
  // Anyone actually standing on the platform rides, even if their last pose
  // had not reached the host when the member list was sealed.
  if(state==='title'&&hub.boarded&&!hub.riding){
    if(!members.includes(MP.id))members.push(MP.id);
    const ready=()=>members.every(member=>{
      if(member===MP.id)return true;
      const peer=MP.peers.get(member),pose=peer?.hub;
      if(pose?.ride===id)return pose.ready||!mpFresh(peer);
      return performance.now()-trip.started>1700;
    });
    hub.engageLift(depth,seed,MP.host?{id,ready}:{id,follow:()=>trip.motion});
    closeStation();
  }
  mpTitle();
  if(MP.host){
    mpSend({k:'hi',n:myName(),h:true});
    if(!hub.riding){
      mpSend({k:'liftAbort',id});resetSharedLift();publishLiftSelection();
    }
  }
  sendHubPresence();
}

function tickSharedLift(){
  if(state==='title'&&!sharedLift.trip&&!sharedLift.pending&&sharedLift.selection){
    const reached=partyDeepestFloor();
    if(reached!==sharedLift.selection.deepest){
      const max=Math.max(40,reached);
      sharedLift.selection={...sharedLift.selection,deepest:reached,max,depth:Math.min(sharedLift.selection.depth,max)};
      publishLiftSelection();
    }
  }
  if(!sharedLift.pending||performance.now()<sharedLift.pending)return;
  sharedLift.pending=0;
  const members=[MP.id,...MP.peers.keys()].filter(aboardSharedLift);
  if(!members.length){
    sharedLift.selection={...sharedLift.selection,pending:false};
    publishLiftSelection();
    return;
  }
  const {depth,max}=sharedLift.selection;
  const seed=liftSeed();
  // The run must be hosted by someone on the platform. Keep the current
  // host whenever they are among the riders.
  const packet={id:newRoomCode(),depth,max,seed,pilot:members[0],members};
  mpSend({k:'liftStart',...packet});
  startSharedLift(packet);
}

function publishLiftMotion(){
  const motion=hub.liftMotion;
  if(motion&&sharedLift.trip)mpSend({k:'liftMotion',id:sharedLift.trip.id,...motion});
}

function sendLiftAction(message){
  if(MP.host){
    if(message.k==='liftPick')selectLiftDepth(MP.id,message.depth);
    else requestLiftDeparture(MP.id,message.shortcut);
  }else if(MP.hostId){
    sendHubPresence(MP.hostId);
    mpSend(message,MP.hostId);
  }
}

function applySharedSetting(key,value){
  const control=settingsScreen.source[key];
  if(!control)return;
  if(control.type==='checkbox')control.checked=value;
  else control.value=value;
  if(key==='qSel'||key==='gtx'){
    lsSet(key==='qSel'?'quality':'gtx',value);lsSet('safe',0);
    return;
  }
  control.dispatchEvent(new Event(control.matches('select')||control.type==='checkbox'?'change':'input'));
}

function updateSettingsScreen(){
  const session=terminalSession.session,interactive=MP.on&&activeStation==='settings';
  const changed=settingsScreen.render({
    visible:MP.on&&(interactive||!!session),interactive,session,
    ownerName:session?terminalPlayerName(session.owner):'',
    near:hub.settingsInReach(hub.presence),
  });
  hub.updateSettingsDisplay(MP.on&&!!session,changed);
  board.classList.toggle('hidden',!activeStation||interactive);
}

function remember(kind,id,data){
  if(archiveRun||!Object.hasOwn(archiveCatalog[kind].entries,id)||Object.hasOwn(archive[kind],id))return;
  archive[kind][id]=data;
  store.set('archive.'+kind,archive[kind]);
}
function rememberFloor(){
  remember('floors',F.kind,{seed:R.seed,depth:R.depth,label:floorTag()});
}
function encounterSnapshot(){
  return {seed:R.seed,depth:R.depth,pose:[P.x,P.z,P.yaw,P.pitch],gate:F.doorOpen,breaks:R.pk[R.depth]?.slice(),blackout:F.blk};
}
function rememberMob(id,mob){
  if(archiveRun||P.down||state!=='play'||Object.hasOwn(archive.mobs,id))return;
  const x=mob.x,z=mob.z,dx=x-P.x,dz=z-P.z,d=Math.hypot(dx,dz);
  if(x<0||d>9||dx*Math.cos(P.yaw)+dz*Math.sin(P.yaw)<d*0.52||!los(P.x,P.z,x,z))return;
  remember('mobs',id,{...encounterSnapshot(),mob:[x,z]});
}
function rememberRoomMob(id,seed){
  const spec=ROOM_MOBS[id];
  if(!spec||state!=='room')return;
  const door=archive.doors[spec.room]||{};
  const roomSeed=Number.isInteger(seed)?seed>>>0:Number.isInteger(door.seed)?door.seed>>>0:0;
  remember('mobs',id,{
    seed:roomSeed,depth:R.depth||door.depth||1,room:spec.room,
    pose:[P.x,P.z,P.yaw,P.pitch],gate:!!F?.doorOpen,breaks:R.pk?.[R.depth]?.slice(),blackout:F?.blk||0,
    look:door.look,tx:door.tx,ty:door.ty,ph:door.ph,stone:door.stone||F?.stone?.slice()
  });
}
function refreshHub(){
  hub.syncArchives(Object.fromEntries(Object.entries(archiveCatalog).map(([kind,catalog])=>[kind,
    Object.entries(catalog.entries).map(([id,name])=>({kind,id,name,data:archive[kind][id]}))])));
}
function showHub(on){
  closeStation();
  if(!on)settingsScreen.screen.hidden=true;
  $('menuHub').hidden=!on;
  hub.setActive(on);
  document.body.classList.toggle('hub-room',on);
  if(on&&reWarm&&state==='title'&&!loading){reWarm=false;retargetShaft()}
  if(on){refreshHub();$('tFlash').textContent='USE'}
  else $('tFlash').textContent='FLASH';
}
function openStation(id){
  if(state!=='title'||loading||hub.riding)return;
  activeStation=id;
  board.toggleAttribute('data-lift',id==='lift');
  hub.focusPanel(id);
  initAudio();
  if(document.pointerLockElement){usingLock=false;document.exitPointerLock()}
  $('stationTitle').textContent=id==='settings'?'Settings':id==='lift'?'Descent Control':id==='news'?'Update Log':'Field Guide';
  if(id==='news')hub.markNewsSeen();
  if(id==='lift'){
    $('liftDepth').value=sharedLift.selection?.depth||defaultLiftFloor();
    updateLiftScreen();
  }
  for(const panel of stationPanels)panel.hidden=panel.dataset.stationPanel!==id;
  board.classList.remove('hidden');
  board.scrollTop=0;
  document.body.classList.add('hub-panel');
  updateSettingsScreen();
}
function stationControls(){
  const surface=MP.on&&activeStation==='settings'?settingsScreen.screen:board;
  return [...surface.querySelectorAll('button, select, input')].filter(el=>!el.disabled&&el.getClientRects().length);
}
function adjustStationControl(direction){
  const el=document.activeElement;
  if(el.tagName==='SELECT'){
    el.selectedIndex=clamp(el.selectedIndex+direction,0,el.options.length-1);
    el.dispatchEvent(new Event('change'));
  }else if(el.type==='range'||el.type==='number'){
    if(direction<0)el.stepDown();else el.stepUp();
    el.dispatchEvent(new Event('input'));
  }
}
function closeStation(){
  const previous=activeStation;
  activeStation=null;
  hub.focusPanel(null);
  board.classList.add('hidden');
  document.body.classList.remove('hub-panel');
  if(previous&&(board.contains(document.activeElement)||settingsScreen.screen.contains(document.activeElement)))document.activeElement.blur();
  updateSettingsScreen();
}
function useMenuAsset(entry){
  if(state!=='title'||loading)return;
  initAudio();
  if(entry.station){openStation(entry.station);return}
  if(entry.lift){
    if(!hub.boarded||hub.riding)return;
    openStation('lift');
    return;
  }
  if(entry.data&&!MP.on)startArchive(entry.kind,entry.id,entry.data);
}
function startFromLanding(depth,seed,floor,position,tripId){
  if(loading||state!=='title')return;
  const {tx,ty,yaw}=floor.start,fx=Math.cos(yaw),fz=Math.sin(yaw);
  const side=position.x*EYE/1.62,forward=(landingMazeZ-position.z)*EYE/1.62-0.5;
  const pose={x:tx+0.5+fx*forward-fz*side,z:ty+0.5+fz*forward+fx*side,
    yaw:yaw+position.yaw,pitch:clamp(position.pitch,-MOVE.pitch,MOVE.pitch)};
  if(tripId){
    if(MP.host)publishLiftMotion();
    if(MP.guest)MP.wantJoin=true;
  }
  const fade=$('fade');
  if(!fade){enterRun(seed,depth,floor,pose,tripId);return}
  fade.style.transition='opacity .16s';
  fade.style.opacity='1';
  setTimeout(()=>{
    enterRun(seed,depth,floor,pose,tripId);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      fade.style.transition='opacity .28s';
      fade.style.opacity='0';
    }));
  },170);
}
function buildHubVisitor(peer){
  const pose={id:peer.id,col:peer.col,rx:0,ry:0,rz:0,ryaw:0,rpitch:0,spd:0,walk:0};
  const avatar=exhibitModel((time,stride)=>{pose.spd=stride*2.7;buildPlayer(pose,time)},true);
  const animate=avatar.userData.pose;
  avatar.userData.pose=(time,stride,pace)=>{pose.walk=pace;animate(time,stride)};
  avatar.scale.setScalar(1.62/EYE);
  return avatar;
}
function landingGeometry(floor){
  const source=worldMesh.geometry,{position,normal,uv}=source.attributes;
  const {tx,ty,yaw}=floor.start,fx=Math.cos(yaw),fz=Math.sin(yaw);
  const ex=tx+0.5-fx*0.5,ez=ty+0.5-fz*0.5;
  const points=[],normals=[],coords=[],geometry=new THREE.BufferGeometry();
  for(const group of source.groups){
    const start=points.length/3;
    for(let i=group.start;i<group.start+group.count;i+=3){
      let min=Infinity,max=-Infinity,maxSide=0;
      for(let j=i;j<i+3;j++){
        const x=position.getX(j)-ex,z=position.getZ(j)-ez,d=x*fx+z*fz;
        min=Math.min(min,d);max=Math.max(max,d);
        maxSide=Math.max(maxSide,Math.abs(-x*fz+z*fx));
      }
      if(min< -0.001||max<0.001||min>18||maxSide>8)continue;
      for(let j=i;j<i+3;j++){
        points.push(position.getX(j),position.getY(j),position.getZ(j));
        normals.push(normal.getX(j),normal.getY(j),normal.getZ(j));
        coords.push(uv.getX(j),uv.getY(j));
      }
    }
    if(points.length/3>start)geometry.addGroup(start,points.length/3-start,group.materialIndex);
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));
  const group=new THREE.Group(),mesh=new THREE.Mesh(geometry,worldMesh.material);
  group.name='Prepared maze entrance';
  const angle=yaw+Math.PI/2,k=1.62/EYE;
  mesh.rotation.y=angle;mesh.scale.setScalar(k);
  mesh.position.set(-k*(Math.cos(angle)*ex+Math.sin(angle)*ez),0,-k*(-Math.sin(angle)*ex+Math.cos(angle)*ez));
  group.add(mesh);
  return group;
}
const glimpseCache=new Map(),glimpseProto=new Map();
const lookMemo=new Map();
function passingLook(depth){
  const hit=lookMemo.get(depth);
  if(hit)return hit;
  const kind=floorKind(depth);
  const bi=kind==='back'?4:kind==='forest'?8:biomeIx(depth);
  const B=BIOMES[bi];
  const look={kind:kind==='forest'?'forest':kind,forest:kind==='forest',dark:kind==='dark',back:kind==='back',
    stone:B.stone,name:kind==='cave'?'The Hollow':kind==='dark'?'The Black Hush':B.name,biome:B,base:B.base,wet:B.wet};
  lookMemo.set(depth,look);
  return look;
}
function glimpseSurf(depth,turn){
  const kind=floorKind(depth);
  const bi=kind==='back'?4:kind==='forest'?8:biomeIx(depth);
  return bi+':'+kind+':'+turn;
}
function buildGlimpseProto(depth,turn){
  const surf=glimpseSurf(depth,turn);
  const hit=glimpseProto.get(surf);
  if(hit)return hit;
  const kind=floorKind(depth);
  const forest=kind==='forest';
  const W=5,H=6,g=new Uint8Array(W*H).fill(1);
  for(let y=1;y<=2;y++)for(let x=1;x<=3;x++)g[y*W+x]=0;
  g[3*W+2]=0;g[4*W+2]=0;
  if(turn===0)g[4*W+1]=0;else if(turn===2)g[4*W+3]=0;
  const look={...passingLook(depth),W,H,g,forest,
    tex:{v:0,seed:0,tint:[1,1,1]},
    panelAt:new Uint8Array(W*H),pocketMask:new Uint8Array(W*H),phantoms:[],door:null,frames:[]};
  const proto=buildMesh(look,true);
  const tx=2,ty=1,yaw=Math.PI/2,fx=Math.cos(yaw),fz=Math.sin(yaw);
  const ex=tx+0.5-fx*0.5,ez=ty+0.5-fz*0.5,angle=yaw+Math.PI/2,k=1.62/EYE;
  proto.rotation.y=angle;proto.scale.setScalar(k);
  proto.position.set(-k*(Math.cos(angle)*ex+Math.sin(angle)*ez),0,-k*(-Math.sin(angle)*ex+Math.cos(angle)*ez));
  proto.userData.floor=look;
  glimpseProto.set(surf,proto);
  return proto;
}
// The mouth of a floor the car only passes. Surfaces are shared by biome, so a landing does not bake a new texture.
function landingGlimpse(seed,depth,build=true){
  const key=seed+'#'+depth;
  const hit=glimpseCache.get(key);
  if(hit)return hit;
  const turn=hashStr(seed+'#mouth'+depth)%3;
  if(!build&&!glimpseProto.has(glimpseSurf(depth,turn)))return null;
  const proto=buildGlimpseProto(depth,turn);
  const group=new THREE.Group();
  group.name='Passing floor';group.add(proto.clone());group.userData.floor=proto.userData.floor;
  glimpseCache.set(key,group);
  return group;
}
const floorMemo=new Map();
function memoFloor(seed,depth,look){
  const key=seed+'#'+depth+'#'+(look?((look.bi??'')+':'+(look.ix??'')):'');
  let floor=floorMemo.get(key);
  if(!floor){floor=genFloor(seed,depth,look);floorMemo.set(key,floor)}
  return floor;
}
function prepareLanding(seed,depth){
  let stage=0;
  const task={floor:null,model:null,progress:0,ready:false,
    advance(){
      if(task.ready)return;
      if(stage===0){task.floor=genFloor(seed,depth);task.progress=0.2}
      else if(stage===1){buildMesh(task.floor);task.progress=0.45}
      else if(stage===2){task.model=landingGeometry(task.floor);task.progress=0.6}
      else if(stage===3){buildStatic(task.floor);buildSdf(task.floor);task.progress=0.8}
      else if(stage===4){task.progress=1;task.ready=true}
      else return;
      stage++;
    },
    dispose(){
      if(task.model){task.model.removeFromParent();if(task.model.children[0])task.model.children[0].geometry.dispose()}
    }
  };
  return task;
}
let warmed=null,shaftQueue=[];
// the seed a lift ride uses while the seed field is blank; a new one is rolled once a run starts from it, so each ride is a new maze
let autoSeed=randSeed(),reWarm=false;
const liftSeed=()=>($('seedIn').value.trim()||autoSeed).toUpperCase();
function preparedLanding(seed,depth){
  if(warmed&&warmed.seed===seed&&warmed.depth===depth&&warmed.task){
    const task=warmed.task;warmed.left=0;warmed.task=null;return task;
  }
  return prepareLanding(seed,depth);
}
function rememberShaft(seed,depth){
  warmed?.task?.dispose();
  const task=prepareLanding(seed,depth);
  warmed={seed,depth,task,left:5};
}
function startShaftWarm(){
  if(state!=='title')return;
  const seed=liftSeed();
  const depth=defaultLiftFloor();
  if(!$('liftDepth').value)$('liftDepth').value=depth;
  const stages=[],seen=new Set();
  for(let n=1;n<=4;n++)for(let turn=0;turn<3;turn++){
    const surf=glimpseSurf(n,turn);
    if(seen.has(surf))continue;
    seen.add(surf);
    const floor=n,mouth=turn;
    stages.push(['Opening landing '+n,()=>buildGlimpseProto(floor,mouth)]);
  }
  rememberShaft(seed,depth);
  for(let i=0;i<5;i++)stages.push(['Preparing the maze',()=>warmed.task.advance()]);
  warmed.left=0;
  stages.push(['Lighting the shaft',()=>hub.primeShaft()]);
  for(let n=5;n<=10;n++)for(let turn=0;turn<3;turn++){
    const surf=glimpseSurf(n,turn);
    if(seen.has(surf))continue;
    seen.add(surf);
    const floor=n,mouth=turn;
    shaftQueue.push(()=>buildGlimpseProto(floor,mouth));
  }
  showLoading('Opening the entrance hall',stages);
  loading.kind='shaft';
}
function retargetShaft(){
  if(state!=='title'||hub.riding||loading)return;
  const seed=liftSeed();
  const typed=+$('liftDepth').value;
  const depth=Number.isInteger(typed)&&typed>=1?typed:defaultLiftFloor();
  if(warmed?.task&&warmed.seed===seed&&warmed.depth===depth)return;
  rememberShaft(seed,depth);
}
function departFromLift(shortcut=false){
  if(state!=='title'||activeStation!=='lift'||!hub.boarded||loading)return;
  if(MP.guest&&MP.run&&!sharedLift.trip){
    if(!MP.hostId){say('Still looking for the host. Keep this page open.',2.5);return}
    closeStation();mpJoinClick();return;
  }
  if(MP.on&&!MP.host&&!MP.hostId){say('Still looking for the host. Keep this page open.',2.5);return}
  if(MP.on&&shortcut){sendLiftAction({k:'liftDepart',shortcut:true});return}
  const depth=shortcut?deepest:$('liftDepth').valueAsNumber;
  if(!Number.isInteger(depth)||depth<1||depth>+$('liftDepth').max)return;
  if(MP.on){sendLiftAction({k:'liftDepart'});return}
  const seed=liftSeed();
  if(hub.engageLift(depth,seed))closeStation();
}
$('liftDestination').addEventListener('submit',event=>{
  event.preventDefault();
  departFromLift();
});
$('liftDeepest').addEventListener('click',()=>departFromLift(true));
$('liftDepth').addEventListener('input',()=>{
  const depth=$('liftDepth').valueAsNumber;
  if(MP.on&&activeStation==='lift'&&hub.boarded&&validLiftDepth(depth)&&depth<=+$('liftDepth').max)sendLiftAction({k:'liftPick',depth});
  retargetShaft();
});
$('seedIn').addEventListener('change',retargetShaft);
let exhibitBuffer=null;
function exhibitModel(draw,animated=false){
  exhibitBuffer??={buf:new Float32Array(13*60000),n:0,cap:60000};
  function bake(time,stride){
    const previous=TB;
    exhibitBuffer.n=0;
    TB=exhibitBuffer;
    try{draw(time,stride)}finally{TB=previous}
  }
  bake(0,0);
  const vertices=new THREE.InterleavedBuffer(exhibitBuffer.buf.slice(0,exhibitBuffer.n*13),13);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(vertices,3,0));
  geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(vertices,3,3));
  geometry.setAttribute('color',new THREE.InterleavedBufferAttribute(vertices,3,6));
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.76,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,mat);
  if(animated){
    vertices.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.pose=(time,stride)=>{
      bake(time,stride);
      vertices.array.set(exhibitBuffer.buf.subarray(0,Math.min(vertices.array.length,exhibitBuffer.n*13)));
      geometry.setDrawRange(0,Math.min(vertices.count,exhibitBuffer.n));
      vertices.needsUpdate=true;
    };
  }
  return mesh;
}
function followInCase(group,pose,float=false){
  const viewer=new THREE.Vector3();
  let last=0,frame=-1,pace=0;
  group.userData.animateExhibit=(time,position)=>{
    group.parent.worldToLocal(viewer.copy(position));
    const dt=Math.min(0.12,Math.max(0,time-last));
    last=time;
    if(viewer.z<0.05||viewer.lengthSq()>55)return;
    const nextX=clamp(viewer.x*0.3,-0.43,0.43);
    const speed=Math.min(1,dt*(float?3.0:5.0));
    const previous=group.position.x;
    group.position.x+=(nextX-group.position.x)*speed;
    group.position.z+=(0.13-group.position.z)*speed;
    const stride=clamp(Math.abs(group.position.x-previous)/Math.max(dt,0.001),0,1);
    pace+=dt*(2.4+stride*7);
    group.position.y=0.97+(float?0.09:0.012+0.025*stride)*Math.sin(pace);
    const yaw=clamp(Math.atan2(viewer.x-group.position.x,viewer.z),-1.36,1.36);
    group.rotation.y+=(yaw-group.rotation.y)*speed;
    group.rotation.z=(float?0.09:0.035*stride)*Math.cos(pace);
    const tick=Math.floor(time*24);
    if(frame!==tick){frame=tick;pose(time,stride)}
  };
  return group;
}
function exhibitAsset({kind,id,data}){
  if(kind==='floors')return floorDiorama(genFloor(data.seed,data.depth));
  if(kind==='doors'){
    let look=data?.look||DOOR_KINDS[id].look;
    const disguises=DOOR_KINDS[id].disguise?doorDisguises():[];
    if(!look)look=disguises[(data?.seed??hashStr(id))%disguises.length]||'wood';
    const door={kind:id,tx:data?.tx??1,ty:data?.ty??1,ph:data?.ph??0.5};
    const color=data?.stone||[0.33,0.30,0.34];
    const model=skin=>exhibitModel(()=>buildStrangeDoor({p:ZERO3,R:rYaw(Math.PI/2)},
      {...door,look:skin},[...color,9],[...color.map(v=>v*0.8),9]));
    if(!data||disguises.length<2)return model(look);
    const skins=disguises.filter(skin=>skin!==look);
    skins.splice(Math.ceil(skins.length/2),0,look);
    return lenticularDoor(skins.map(model));
  }
  if(kind==='mobs'&&ROOM_MOBS[id]){
    const model=roomMobExhibit(id);
    return followInCase(model,time=>model.userData.pose?.(time));
  }
  const group=new THREE.Group();
  if(id==='2'){
    const glow=new THREE.Mesh(new THREE.IcosahedronGeometry(0.11,2),new THREE.MeshBasicMaterial({color:0x8dd0ff}));
    glow.position.y=0.66;group.add(glow);
    const light=new THREE.PointLight(0x519dff,4.5,1.5);light.position.copy(glow.position);group.add(light);
    const halo=new THREE.Mesh(new THREE.SphereGeometry(0.2,16,10),
      new THREE.MeshBasicMaterial({color:0x3789ff,transparent:true,opacity:0.23,depthWrite:false,blending:THREE.AdditiveBlending}));
    halo.position.copy(glow.position);group.add(halo);
    return followInCase(group,(time)=>{
      glow.rotation.y=time*1.9;glow.rotation.z=time*0.72;
      halo.scale.setScalar(1+0.16*Math.sin(time*5));
      light.intensity=4.4+0.8*Math.sin(time*5);
    },true);
  }
  const mob={x:0,z:0,face:Math.PI/2,ph:0,state:0,stun:0};
  const player={id:'exhibit',col:[0.55,0.26,0.31],rx:0,ry:0,rz:0,ryaw:Math.PI/2,rpitch:0,spd:0,walk:0};
  let eyes=[];
  const model=exhibitModel((time,stride)=>{
    mob.ph=Math.sin(time*2.2)*0.8;
    if(id==='0')eyes=buildShade(mob,time,0,4).eyes;
    else if(id==='1')buildStalker(mob,time,0,4);
    else if(id==='3')eyes=buildWatcher(mob,time,0,4);
    else if(id==='lurk')buildNpc({type:'lurk',guise:'map',x:0,z:0,ph:0.4,yaw:Math.PI/2,hy:0,hp:0,used:true},time,0,1.2,4,0.016);
    else{
      player.walk=time*7;player.spd=stride;player.rpitch=Math.sin(time*2.0)*0.17;
      buildPlayer(player,time,0.62+0.11*Math.sin(time*2.1),0.9);
    }
  },true);
  group.add(model);
  if(id==='lurk'){
    const mat=new THREE.MeshBasicMaterial({color:0x07060a});
    const slab=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,0.03,z);m.scale.y=0.08;group.add(m);return m};
    slab(0.5,1.1,0.34,0.72,0,0.05);
    slab(0.16,0.9,0.16,0.28,0,0.22);
    slab(0.16,0.95,0.16,1.05,0,-0.08);
    slab(0.22,0.2,0.28,0.55,0,0.48);
    slab(0.14,0.45,0.4,0.7,0,-0.38);
  }
  const lights=eyes.map(eye=>{
    const light=new THREE.Mesh(new THREE.SphereGeometry(0.014,8,6),new THREE.MeshBasicMaterial({color:id==='3'?0xffefb9:0xc4a5ff}));
    light.position.set(...eye);group.add(light);
    return light;
  });
  return followInCase(group,(time,stride)=>{
    model.userData.pose(time,stride);
    lights.forEach((light,i)=>light.position.set(...eyes[i]));
  });
}
function startArchive(kind,id,data){
  if(loading||state!=='title'||MP.on||archiveRun)return;
  if(document.pointerLockElement){usingLock=false;document.exitPointerLock()}
  archiveRun={kind,id,wallet,up:{...up}};
  showLoading('Opening the '+archiveCatalog[kind].title,[['Preparing the replay',()=>{
    try{
      const roomReplay=kind==='doors'||!!data?.room;
      const seed=roomReplay?'ARCHIVE':data.seed,floor=genFloor(seed,data.depth);
      enterRun(seed,data.depth,floor);
      $('archiveBack').hidden=false;
      if(roomReplay){
        previewStamina={stam:P.stam,winded:P.winded,spikeTraps:P.spikeTraps,mooseGems:wallet};
        beginRoom(kind==='doors'?id:data.room,finishArchive,data.seed);
      }else if(kind==='mobs'||kind==='glitches'){
        restoreEncounter(data);
        if(kind==='mobs')replayMob(id,data);
        else if(!glStart(id,true,data))say('This anomaly could not be restored in this layout.',4);
      }
    }catch(error){
      finishArchive();
      throw error;
    }
  }]]);
}
function restoreEncounter(data){
  if(data.gate&&F.door)openDoor(true);
  for(const tile of data.breaks||[])pkApply(tile[0],tile[1],true);
  F.blk=data.blackout||0;
  F.shades=[];
  const [x,z,yaw,pitch]=data.pose;
  if(!blocked(x,z)){Object.assign(P,{x,z,yaw,pitch});onTileChange()}
  P.inSafe=F.safeMask[P.ty*F.W+P.tx]===1;
}
function replayMob(id,data){
  const [x,z]=data.mob;
  const gx=Math.floor(x),gy=Math.floor(z);
  if(id==='mimic'){
    Object.assign(MIM,{x,z,gx,gy,st:1,depth:R.depth,as:'archive',vic:MP.id,sayT:Infinity});
  }else if(id==='lurk'){
    const n={type:'lurk',guise:'map',x,z,ph:1.1,used:true,gx,gy,px:-1,py:-1,stare:0,aggro:false,face:0,hitT:0,yaw:0};
    const i=F.npcs.findIndex(q=>q.type==='lurk');
    if(i>=0)F.npcs[i]=n;else F.npcs.push(n);
  }else{
    F.shades.push({type:Number(id),x,z,gx,gy,px:-1,py:-1,state:0,stun:0,think:0,vis:false,
      frozen:false,ph:0,d:99,snd:0,hid:0,seen:0,life:16});
  }
}
const archiveMimic=()=>archiveRun?.kind==='mobs'&&archiveRun.id==='mimic';
function finishArchive(){
  if(!archiveRun)return;
  const {wallet:bank,up:upgrades}=archiveRun;
  wallet=bank;
  Object.assign(up,upgrades);
  glReset();
  glNet('');
  GL.chatT=0;
  chatLog.textContent='';
  mimicReset();
  $('scare').style.opacity=0;
  $('chill').style.opacity=0;
  $('hurt').style.opacity=0;
  $('archiveBack').hidden=true;
  archiveRun=null;
  toTitle();
}
$('closeStation').addEventListener('click',()=>closeStation());
$('archiveBack').addEventListener('click',finishArchive);

// Initialize game state without recording a visit to the default floor.
R.seed=randSeed();loadFloor(1);showBest();achLine();showHub(true);mpTitle();
{const rc=cleanCode(new URLSearchParams(location.search).get('room'));if(rc)mpPrepareJoin(rc)}
// NPC photo studio for tools/npc_shot.mjs. Moves (or spawns) one NPC into a straight corridor far from
// braziers, sconces and glowing items, freezes gameplay, and fixes the camera. Lit only by the player's
// torch and the floor's ambient light, which is what the player sees in most of the maze.
// o: {type:'keeper'|'map'|'delver', seed, depth, dist (m, camera to NPC), turn (deg, NPC yaw away from camera),
//     target [along, side] (look at this corridor point instead of straight along it), camY (camera height, default the game's eye height), aimY (height to look at), headLock, open (no blink), lat (sideways shift of the camera, m)}
function studio(o){
  o=Object.assign({type:'keeper',seed:'STUDIO1',depth:2,dist:1.1,turn:0,camY:EYE,aimY:null,headLock:false,open:true},o||{});
  const key=o.seed+'/'+o.depth;
  if(!STUDIO||STUDIO.key!==key||state!=='play'){STUDIO=null;startRun(o.seed,o.depth,true);
    F.shades.length=0;for(const id of['title','pause','dead','talk'])$(id).classList.add('hidden');STUDIO={key,spot:null}}
  rs=1;rsCeil=1;
  if(!STUDIO.spot){ // a straight run of open floor, dim and empty
    const W=F.W,g=F.g,free=(x,y)=>x>0&&y>0&&x<W-1&&y<F.H-1&&g[y*W+x]===0&&!F.safeMask[y*W+x]&&!F.traps.some(q=>q.tx===x&&q.ty===y)&&!F.props.some(q=>Math.floor(q.x)===x&&Math.floor(q.z)===y)&&!F.items.some(q=>!q.got&&Math.floor(q.x)===x&&Math.floor(q.z)===y);
    const far=(x,z)=>F.sconces.every(q=>Math.hypot(q.lx-x,q.lz-z)>4.5)&&(!F.safe||Math.hypot(F.safe.x-x,F.safe.z-z)>9)&&Math.hypot(F.exit.x-x,F.exit.z-z)>6&&F.items.every(q=>q.got||q.type==='chest'||Math.hypot(q.x-x,q.z-z)>3.5);
    let best=null,bs=-1;
    for(let y=1;y<F.H-1;y++)for(let x=1;x<W-1;x++)for(const d of DIRS){
      let ok=true;for(let k=-1;k<=4&&ok;k++)ok=free(x+d[0]*k,y+d[1]*k);if(!ok)continue;
      const X=x+0.5,Z=y+0.5,sc=Math.min(9,...F.sconces.map(q=>Math.hypot(q.lx-X,q.lz-Z)))+Math.min(9,F.safe?Math.hypot(F.safe.x-X,F.safe.z-Z)-4:9)+(far(X,Z)?20:0);
      if(sc>bs){bs=sc;best={x:X,z:Z,dx:d[0],dz:d[1]}}}
    if(!best)throw new Error('studio: no quiet corridor on '+key+', try another seed');
    STUDIO.spot=best;
  }
  const S=STUDIO.spot;
  let n=F.npcs.find(q=>q.type===o.type);
  if(!n){n={type:o.type,ph:1.3,used:true,gift:0,tip:0};F.npcs.push(n)}
  for(const q of F.npcs)if(q!==n){q.x=-50;q.z=-50}
  n.x=S.x;n.z=S.z;n.ox=0;n.oz=0;n.lock=true;n.lockHead=!!o.headLock;n.hy=0;n.hp=0;n.pose=o.pose||null; // pose [yaw,pitch]: fixed head angles for checking extremes
  n.yaw=Math.atan2(S.dz,S.dx)+o.turn*Math.PI/180;
  const lat=o.lat||0,cx=S.x+S.dx*o.dist-S.dz*lat,cz=S.z+S.dz*o.dist+S.dx*lat,aim=o.level?o.camY:o.aimY==null?(o.type==='delver'?0.55:0.8):o.aimY;
  STUDIO.cam={x:cx,z:cz,y:o.camY,yaw:Math.atan2(-S.dz,-S.dx),pitch:Math.atan2(aim-o.camY,o.dist)};
  if(o.target){ // look at a point given in corridor coordinates [along, side] (aimY = its height), e.g. the staff hand
    const tx=S.x+S.dx*o.target[0]-S.dz*o.target[1],tz=S.z+S.dz*o.target[0]+S.dx*o.target[1];
    STUDIO.cam.yaw=Math.atan2(tz-cz,tx-cx);STUDIO.cam.pitch=Math.atan2(aim-o.camY,Math.hypot(tx-cx,tz-cz))}
  STUDIO.open=o.open;STUDIO.blink=o.blink;STUDIO.lod=o.lod;P.x=cx;P.z=cz;
  return {spot:S,cam:STUDIO.cam,Q};
}
// The sculpted Keeper: baked lazily (keeperWarm, called when a floor with the Keeper loads and when the player is within 30 m) in idle slices; until it is done the
// classic Keeper is drawn. A finished bake is stored in IndexedDB (src/npc_cache.js, keyed by recipe id + kit source hash) and primed from there on later loads.
function keeperSave(){if(KEEPER_SAVED||!bakeIsDone(KEEPER))return;KEEPER_SAVED=true;if(bakeRecipe(KEEPER).cached)return;const pl=bakeExport(KEEPER);if(pl)saveBake(KEEPER_CACHE_KEY,pl)}
function keeperWarm(){if(NPC_CLASSIC||KEEPER_WARM)return;KEEPER_WARM=true;(KEEPER_LOAD||Promise.resolve()).then(()=>{if(bakeIsDone(KEEPER))return;try{bakeRecipeIdle(KEEPER,()=>keeperSave())}catch(e){console.error(e)}})}
function keeperReady(){if(bakeIsDone(KEEPER))return true;if(STUDIO||PROBE_SYNC){bakeRecipe(KEEPER);keeperSave();return true}keeperWarm();return false}
// grip locking check for tools/npc_grip.mjs: builds the Keeper at the given times (optionally talking) and reports where the hand holds the rod
function gripProbe(ts,talking){PROBE_SYNC=true;const n=F.npcs.find(q=>q.type==='keeper'),save=talk,res=[];if(talking)talk={npc:n};
  for(const t of ts){buildNpc(n,t,P.x,0.7,P.z,0.016);res.push({t,...GRIP_DBG})}talk=save;return res}
function benchNpc(iters){PROBE_SYNC=true;const n=F.npcs.find(q=>q.type==='keeper');const e=[P.x,0.7,P.z];buildNpc(n,1,e[0],e[1],e[2],0.016);let t0=performance.now();
  for(let i=0;i<iters;i++){CH.n=0;buildNpc(n,1+i*0.016,e[0],e[1],e[2],0.016)}return (performance.now()-t0)/iters}
window.__game={wofQ:WOQ,tkTargets,rrStart,wofClear,wofTick,mpPosFlags,wof:WOF,fx:FX,get tk(){return TK},get bomb(){return BOMB},get rr(){return RR},set rr(v){RR=v},rrAct,get ts(){return TS},get brk(){return BRK},set tk(v){TK=v},wofSpinStart,wofResolve,wofBegin,NEWS,openStation,get activeStation(){return activeStation},hub,get lobbyPaused(){return lobbyPaused},get roomPaused(){return roomPaused},simLockLost(){if(document.pointerLockElement){document.exitPointerLock();return}usingLock=true;document.dispatchEvent(new Event("pointerlockchange"))},music,get menuPosition(){return hub.position},previewRoom,keeperReady:()=>{PROBE_SYNC=true;return keeperReady()},keeperLoad:()=>KEEPER_LOAD,KEEPER_T,keeperSaved:()=>KEEPER_SAVED,gripProbe,studio,benchNpc,NPC_T,GPU_RIGS,get CH(){return CH},bakeRecipe,KEEPER,get keeperStats(){return bakeRecipe(KEEPER).stats},guideInfo,guideCompute,GD,achieve,ACH,amb,roomInput,XR,xrayTick,wallsBetween,update,render,drawHUD,drawMap,camera,scene,get BABY(){return BABY},get Q(){return Q},mpRecv,blocked,solidAt,onTileChange,pkWhy,pkApply,pkAim,usePick,pkReapply,doorPlan,doorCountFor,doorOrder,flashStun,collect,get watching(){return RW},roomLeave,DOOR_LOOKS,DOOR_KINDS,buildStatic,glitch:glTest,setSkyTime:t=>hub.setSkyTime(t),get skyTime(){return hub.skyTime},hubLook:(dyaw,dpitch)=>hub.look(dyaw,dpitch),hubRender:t=>{if(t!=null)hub.setSkyTime(t);hub.render(1,t??hub.skyTime)},hubStep:(dt,inp)=>hub.update(dt,inp||{},dt),pause,resume,GL,ROOMS,sdoorOpen,kilnGame,KILN,roomEnd,MP,mpHost,hurt,keys,MIM,CLIPS,VOX,mpVoiceSet,chatOpenBox,chatClose,mimicEat,surfPreview(i,nrm,p){const t=SURFS.get(i,p),rt=nrm?t.rtN:t.rtA,n=rt.width,px=new Uint8Array(n*n*4);renderer.readRenderTargetPixels(rt,0,0,n,n,px);const c=document.createElement('canvas');c.width=c.height=n;const x=c.getContext('2d'),im=x.createImageData(n,n);im.data.set(px);if(!nrm)for(let k=3;k<px.length;k+=4)im.data[k]=255;else for(let k=0;k<px.length;k+=4){im.data[k]=im.data[k+1]=im.data[k+2]=255-px[k+3];im.data[k+3]=255}x.putImageData(im,0,0);return c.toDataURL('image/jpeg',0.9)},get wallet(){return wallet},set wallet(v){wallet=v},up,openTalk,closeTalk,pickTalk,moveTalk,get talk(){return talk},get nearNpc(){return nearNpc},act,genFloor,bfs,loadFloor,get F(){return F},FOREST,get forestGrp(){return forestGrp},BIOMES,VARIANTS,biomeIx,floorKind,pickVariant,SURFS,worldMats,get URL_DEPTH(){return URL_DEPTH},renderer,resize,get state(){return state},get rs(){return rs},get panelLvl(){return panelLvl},watcher,banish,startRun,useFlash,P,R,touch};
if(state==='title')startShaftWarm();
requestAnimationFrame(frame);
