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
import {NEON_PRIZES,neonTier} from './neon-ride.js';
import {EMOTES,emotePose,BPM as EMOTE_BPM} from './emotes.js';
import {animalHitEffects,mooseModel,scoutGooseModel,MOOSE_ACH,MOOSE_SPIKE_PRICE} from './moose-defense.js';
import {stillwoodWarm,stillwoodWarmState} from './stillwood.js';
import {ROOM_MOBS} from './room-mobs.js';
import {roomMobExhibit} from './room-mob-exhibits.js';
import {roomActions,roomControlLabel} from './room-controls.js';
import {CAMERA_VIEWS,cameraViewRig,nextCameraView} from './camera-view.js';
import {bakeRecipe,bakeRecipeIdle,bakeIsDone,bakeStarted,bakeExport,bakePrime,KIT_HASH} from './npc_kit.js';
import {loadBake,saveBake,cacheStats} from './npc_cache.js';
import {hairAtlas,ATLAS_TILES} from './npc_hair.js';
import {KEEPER} from './npc_recipes.js';
import {createBabyFace,createFallVoid} from './babyface.js';
import {pickVariant,VARIANTS} from './variants.js';
import {ARCHIVE_DEPTH,ARCHIVE_CEILING,ARCHIVE_CORRIDOR,ARCHIVE_BODY,BALCONY_Y,LIBRARIAN,isArchiveDepth,carveArchive,archiveGround,archiveBlocked,archiveHeadroom,archiveMobBlocked,archiveLowOpening,archiveHidden,drawArchive,drawLibrarian} from './forgotten-archive.js';
import {createForest,CORE_H,warmForest} from './forest.js';
import {carveForestRoutes,creekBanks,forestGround,forestSubmerged,forestRootAt,forestRootTile,forestCover,forestBlocked,
  ROOT_CLEARANCE,drawCreekTerrain,drawForestGround,drawForestRoutes} from './forest-routes.js';
import {MOVE,stepMove,lookStep,lookBy,bobY,crouchOffset,noclipDest} from './movement.js';
import {lurkStep} from './lurk.js';
import {initAmbience,updateAmbience,amb} from './ambience.js';
import {initMusic,useStore,updateMusic,setVolumes,getVolumes,onVolumes,music} from './music.js';
import {createMenuRoom,onLiftPlatform} from './menu-room.js';
import {isBunkPosition} from './bunk-room.js';
import {appearanceChoice,appearanceField,normalizeAppearance} from './player-appearance.js';
import {createSettingsScreen,createTerminalSession} from './shared-terminal.js';
import {landingMazeZ,liftEye,liftGateTime,liftMouthLamp,liftCabinLamps,mountLiftDock,dockPosition,inDockAnnex} from './lift-dock.js';
import {NEWS} from './news.js';
import {findSanctuaryEntrance,attachSanctuary,createSanctuaryDisplay,SANCTUARY_HEIGHT} from './sanctuary.js';
import {floorDiorama,lenticularDoor} from './archive-hall.js';
import {GLITCH_ARCHIVE} from './glitch-catalog.js';
import {wheelModel,planSpin,spinAngle,pegPush,sliceAt,pickSlice,WOF_SLICES,WOF_N,WOF_W} from './wheel.js';
import {announce,statusStrip,tints,coinFlip,breakUI} from './wheel-screens.js';
import {createBreaks} from './wheel-breaks.js';
import {WEAPONS,WEAPON} from './weapons.js';
import {BOSSES,bossAt,bossHp,bossSpeed,bossGems,danceChart,judge} from './bosses.js';
import {INGREDIENTS,POTIONS,SLUDGE,hex3,brew,brewAny,potInfo,recipeText,DEBUFF,MAX_ID,TIER_K,TIER_M} from './potions.js';

const $ = id => document.getElementById(id);
const canvas = $('gl');
const lsGet=(k,d)=>{try{const v=localStorage.getItem('emberdeep.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem('emberdeep.'+k,JSON.stringify(v))}catch(e){}};
const SAFE=+lsGet('safe',0)||0, WANT_GTX=!!lsGet('gtx',false);
const QSET=lsGet('quality','auto');
const IS_TOUCH=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches);
let Q=SAFE?0:QSET==='low'?0:QSET==='medium'?1:QSET==='high'?2:(IS_TOUCH?1:2);
function gameViewport(scale){
  const width=Math.max(1,innerWidth),height=Math.max(1,innerHeight);
  const pixelRatio=Math.min(Math.min(window.devicePixelRatio||1,2)*scale,Math.sqrt(2560*1440/(width*height)));
  return {width,height,pixelRatio};
}
let renderer=null;
try{
  const {width,height,pixelRatio}=gameViewport(1);
  canvas.width=Math.floor(width*pixelRatio);canvas.height=Math.floor(height*pixelRatio);
  renderer=new THREE.WebGLRenderer({canvas,antialias:Q===0&&!SAFE,alpha:false,stencil:false,powerPreference:WANT_GTX&&!SAFE?'high-performance':'default'});
  if(pixelRatio!==1)renderer.setDrawingBufferSize(width,height,pixelRatio);
}catch(e){renderer=null}
// Reading a shader's log forces the driver to finish compiling it right there, freezing the frame. Leave it to ?debug, so shaders
// compile in parallel (renderer.compileAsync, behind the loading screens) instead of stalling the first frames of play.
if(renderer)renderer.debug.checkShaderErrors=/[?&]debug\b/.test(location.search);
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
const runSaveKeys=new Set(['wallet','up','ach','best','deepest','brewBag','smith']);
const store={
  get:lsGet,
  set(k,v){if(!archiveRun||!runSaveKeys.has(k))lsSet(k,v)}
};

/* ---------- constants ---------- */
// World scale: a 1.75 m man is ~0.956 m tall here (the Keeper), i.e. 0.546 world metres per real metre. A human eye sits at ~0.93 of
// stature, so the player's eye height is the Keeper's eye height (0.9 m). It used to be 0.62 m: the camera was at the Keeper's
// chest, which made every NPC look a head taller than the player. Single source for the camera, NPC head tracking and avatars.
const WALL_H=1.25, EYE=0.9, PR=0.22, CAM_TOP=WALL_H-0.09;   // CAM_TOP: the camera never rises into the ceiling (a jump peaks at 0.56 m)
const liftScale=EYE/liftEye;
const AV=EYE/0.84;   // scale of the humanoid player avatars: the avatar's eyes are at 0.84*scale, so they sit at EYE
const defaultPlayerColor=[0.62,0.32,0.2];
let playerLook=normalizeAppearance(store.get('appearance',0));
function setPlayerLook(look){playerLook=look;store.set('appearance',look)}
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
  {base:0,name:'Forgotten Archive',wall:[1.24,1.02,0.72],floor:[1.06,0.9,0.68],ceil:[0.86,0.77,0.61],torch:[1,0.81,0.57],amb:[0.072,0.055,0.038],stone:[0.58,0.42,0.28],spec:[0.11,0.12,0.04],wet:0},
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
function floorKind(depth){if(bossAt(depth))return 'arena';if(isArchiveDepth(depth))return 'archive';if(depth>=4&&depth%4===0)return 'back';if(depth>=7&&depth%8===7)return 'forest';if(depth>=3&&depth%4===3)return 'cave';if(depth>=5&&depth%4===1)return 'dark';return 'maze'}
function genFloor(seedStr,depth,look){
  const rng=mulberry32(hashStr(seedStr+'#'+depth));
  const ri=n=>(rng()*n)|0;
  let kind=floorKind(depth);
  const BA=kind==='arena'?bossAt(depth):null;   // a boss floor: one open arena
  const cw=BA?8:Math.min(8+depth,20), ch=cw, W=cw*2+1, H=ch*2+1;
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
  if(kind==='arena'){
    // the boss's arena: one big open hall, walls all round, you come in at the south end and the way down is at the north end
    g=new Uint8Array(W*H).fill(1);
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)g[idx(x,y)]=0;
    stx=cw;sty=H-2;
    for(let y=1;y<H-1;y+=2)for(let x=1;x<W-1;x+=2)cells.push([x,y]);
  }
  if(kind!=='cave'&&kind!=='back'&&kind!=='arena'){
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
  const archive=kind==='archive'?carveArchive(g,W,mulberry32(hashStr(seedStr+'#archive'+depth))):null;
  let forestRoutes=null;
  const reserved=(x,z)=>archive?.reserved(x,z)||forestRoutes?.reserved(x,z);
  if(archive){
    [stx,sty]=archive.start;
    cells=cells.filter(([x,z])=>!reserved(x,z));
  }
  // sanctuary: a 3x3 safe room around a brazier (tile value 4). Creatures never enter it.
  let safe=null;
  if(kind==='arena'){}
  else if(kind==='cave'||kind==='back'){
    const sc=[];
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      let ok=Math.abs(x-stx)+Math.abs(y-sty)>3;
      for(let dy=-1;dy<=1&&ok;dy++)for(let dx=-1;dx<=1;dx++)if(g[idx(x+dx,y+dy)]){ok=false;break}
      if(ok)sc.push([x,y]);
    }
    if(sc.length){const c=sc[ri(sc.length)];safe={tx:c[0],ty:c[1]}}
  }else{
    const rx=ri(cw-1),ry=archive?5+ri(ch-6):ri(ch-1);
    for(let y=ry*2+1;y<=ry*2+3;y++)for(let x=rx*2+1;x<=rx*2+3;x++)g[idx(x,y)]=0;
    safe={tx:rx*2+2,ty:ry*2+2};
  }
  const safeMask=new Uint8Array(W*H);
  if(safe){
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)safeMask[idx(safe.tx+dx,safe.ty+dy)]=1;
    g[idx(safe.tx,safe.ty)]=4;safe.x=safe.tx+0.5;safe.z=safe.ty+0.5;
    cells=cells.filter(c=>g[idx(c[0],c[1])]===0);
  }
  if(kind==='forest'&&(look?.bi==null||look.bi===8)){
    forestRoutes=carveForestRoutes(g,W,H,[stx,sty],safe,bfs,mulberry32(hashStr(seedStr+'#creek'+depth)));
    stx=forestRoutes.creek.x0+1;sty=forestRoutes.creek.z0+3;
    cells=cells.filter(([x,z])=>!reserved(x,z));
  }
  // pillars: free-standing columns in chambers, stalagmites in caverns (tile value 3)
  const pillars=[];
  if(kind==='cave'){
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      if(g[idx(x,y)]||(x+y)%2===0||(x===stx&&y===sty))continue;
      let ok=true;for(let dy=-1;dy<=1&&ok;dy++)for(let dx=-1;dx<=1;dx++)if(g[idx(x+dx,y+dy)]){ok=false;break}
      if(ok&&rng()<0.07){g[idx(x,y)]=3;pillars.push([x+0.5,y+0.5])}
    }
  }else if(kind==='arena'){for(const c of bossPillars(BA.i,W,H)){g[idx(c[0],c[1])]=3;pillars.push([c[0]+0.5,c[1]+0.5])}}
  else if(kind!=='back')for(let y=2;y<H-2;y+=2)for(let x=2;x<W-2;x+=2)if(!reserved(x,y)&&g[idx(x,y)]===0&&rng()<0.6){g[idx(x,y)]=3;pillars.push([x+0.5,y+0.5])}
  const d0=bfs(g,W,H,stx,sty);
  // exit = farthest spot from the start
  let ex=stx,ey=sty,best=-1;
  for(const c of cells){const dd=d0[idx(c[0],c[1])];if(dd>best){best=dd;ex=c[0];ey=c[1]}}
  if(BA){ex=cw;ey=1}
  let cand=cells.filter(c=>!(c[0]===stx&&c[1]===sty)&&!(c[0]===ex&&c[1]===ey));
  // shards: spread out with farthest-point sampling on walking distance
  const minD=new Int32Array(W*H).fill(1e9);
  const addField=(x,y)=>{const f=bfs(g,W,H,x,y);for(let i=0;i<f.length;i++)if(f[i]>=0&&f[i]<minD[i])minD[i]=f[i]};
  addField(stx,sty);addField(ex,ey);
  const items=[];
  const put=(type,c)=>items.push({type,tx:c[0],ty:c[1],x:c[0]+0.5,z:c[1]+0.5,got:false,ph:rng()*6.28});
  for(let s=0;s<(BA?0:3);s++){
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
  if(BA){}
  else if(archive){
    const x=10.5,z=archive.aisle;
    shades.push({type:LIBRARIAN,x,z,gx:Math.floor(x),gy:Math.floor(z),px:-1,py:-1,state:0,stun:0,think:0,vis:false,ph:0,d:99,snd:0,face:Math.PI});
    spawn(0,3);spawn(2,1);
  }
  else if(kind==='back'){spawn(0,Math.max(1,Math.min(Math.floor(depth*0.3),4)));spawn(3,1+(depth>=12?1:0))}
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
  if(BA)take('oil',BA.i===4?5:2);   // the arena: a little more oil (a lot more where Mother Tallow blows out your torch)
  if(depth>1&&rng()<0.6)take('heart',1);
  // corridor tiles: exactly two open neighbours, opposite each other
  const corr=[];
  if(kind!=='cave'&&kind!=='back'&&!BA)for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    if(reserved(x,y)||g[idx(x,y)]||safeMask[idx(x,y)]||((x&1)===(y&1)))continue;
    const l=g[idx(x-1,y)],r=g[idx(x+1,y)],u=g[idx(x,y-1)],dn=g[idx(x,y+1)];
    if((!l&&!r&&u&&dn)||(l&&r&&!u&&!dn))corr.push([x,y]);
  }
  // one locked gate that seals off part of the floor; its key is always on the near side
  let door=null,sanctuaryEntrance;
  if(kind!=='cave'&&kind!=='back'&&!BA&&depth>=2){
    let total=0;for(let i=0;i<W*H;i++)if(!g[i])total++;
    for(const c of shuffle(corr.slice())){
      const di=idx(c[0],c[1]);
      if(d0[di]<4)continue;
      g[di]=2;
      const f=bfs(g,W,H,stx,sty);let reach=0;for(let i=0;i<W*H;i++)if(f[i]>=0)reach++;
      const behind=total-1-reach;
      const ki=(!safe||f[idx(safe.tx-1,safe.ty)]>=0)&&behind>=total*0.08&&behind<=total*0.5?pool.findIndex(q=>f[idx(q[0],q[1])]>5):-1;
      if(ki<0){g[di]=0;continue}
      if(safe){
        sanctuaryEntrance=findSanctuaryEntrance(g,W,H,safe,f);
        if(!sanctuaryEntrance){g[di]=0;continue}
      }
      put('key',pool.splice(ki,1)[0]);
      door={tx:c[0],ty:c[1],ax:g[idx(c[0]-1,c[1])]!==1?0:1};
      // a little reward waiting behind the gate
      let bonus=0;
      for(let i=pool.length-1;i>=0&&bonus<3;i--){if(f[idx(pool[i][0],pool[i][1])]<0){put(bonus===0?'oil':bonus===1?'flash':'heart',pool.splice(i,1)[0]);bonus++}}
      break;
    }
  }
  if(safe&&!sanctuaryEntrance)sanctuaryEntrance=findSanctuaryEntrance(g,W,H,safe,d0);
  const sanctuaryApproach=(x,y)=>sanctuaryEntrance&&x===sanctuaryEntrance.x&&y>sanctuaryEntrance.z;
  // friendly faces: the Keeper tends every sanctuary, and a wanderer sometimes waits in the maze
  const npcs=[];
  if(safe)npcs.push({type:'keeper',x:safe.x+0.62,z:safe.z+0.62,ph:rng()*6.28,used:false});
  // the Wheel of Misfortune stands in a sanctuary corner with no passage beside it (away from the Keeper when it can), Pat Sajak at its side.
  // Placed without drawing from rng so the rest of the floor is the same as before.
  if(safe&&!sanctuaryEntrance){
    const closed=(cx,cz)=>g[idx(safe.tx+2*cx,safe.ty+cz)]===1&&g[idx(safe.tx+cx,safe.ty+2*cz)]===1;
    const c=[[-1,-1],[1,-1],[-1,1]].find(q=>closed(q[0],q[1]))||[-1,-1];
    const wx=safe.x+c[0]*1.1,wz=safe.z+c[1]*1.1,nx=-c[0]*Math.SQRT1_2,nz=-c[1]*Math.SQRT1_2;   // n: the way the wheel faces (into the room)
    safe.wheel={x:wx,z:wz,nx,nz,yaw:Math.atan2(nx,nz),pat:[wx+nz*0.56+nx*0.24,wz-nx*0.56+nz*0.24],
      discs:[[wx-nx*0.03,wz-nz*0.03,0.24],[wx+nz*0.38,wz-nx*0.38,0.07],[wx-nz*0.38,wz+nx*0.38,0.07]]};   // the stand's middle and both posts, for collision
  }
  {const r=rng(),wt=depth===1?'map':r<0.4?'map':r<0.75?'delver':null;
    if(wt&&pool.length&&!BA){const c=pool.pop(),w={type:wt,x:c[0]+0.5,z:c[1]+0.5,ph:rng()*6.28,used:false,gift:ri(3),tip:ri(6)};
      for(const d of DIRS)if(g[idx(c[0]+d[0],c[1]+d[1])]===1){w.ox=d[0]*0.27;w.oz=d[1]*0.27;w.wy=Math.atan2(-d[1],-d[0]);break}
      npcs.push(w)}}
  take('gem',Math.round(nCells/6));
  // spike traps
  const traps=[];
  if(depth>=2&&!BA){
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
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){if(reserved(x,y)||g[idx(x,y)]!==0)continue;
      for(const d of DIRS)if(g[idx(x+d[0],y+d[1])]===1){sc.push([x,y,d[0],d[1]]);break}}
    shuffle(sc);const maxS=BA?14:Math.round(nCells/(kind==='cave'?30:16));
    for(const c of sc){
      if(sconces.length>=maxS)break;
      const px=c[0]+0.5+c[2]*0.44,pz=c[1]+0.5+c[3]*0.44;
      if(Math.hypot(px-stx-0.5,pz-sty-0.5)<2||sconces.some(q=>Math.hypot(q.x-px,q.z-pz)<(BA?3.6:5.5)))continue;
      sconces.push({x:px,z:pz,dx:c[2],dz:c[3],lx:c[0]+0.5+c[2]*0.2,lz:c[1]+0.5+c[3]*0.2,ph:rng()*6.28});
    }
  }
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    if(kind==='back'||reserved(x,y)||g[idx(x,y)]!==0||rng()>0.16)continue;
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
  if(kind!=='back'&&!BA){
    const pc=[];
    for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
      if(reserved(x,y)||g[idx(x,y)]!==1)continue;
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
      if(sanctuaryApproach(c[0],c[1])||sanctuaryApproach(c[0]-1,c[1])||sanctuaryApproach(c[0]+1,c[1]))continue;
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
      const i=idx(x,y);if(reserved(x,y)||g[i]!==0||safeMask[i]||pocketMask[i]||busy.has(i))continue;
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
      if(reserved(x,y)||g[i]!==0||safeMask[i]||pocketMask[i]||d0[i]<3||(x===ex&&y===ey))continue;
      if(traps.some(q=>q.tx===x&&q.ty===y)||npcs.some(q=>Math.floor(q.x)===x&&Math.floor(q.z)===y))continue;
      if(door&&Math.abs(x-door.tx)+Math.abs(y-door.ty)<=1)continue;
      for(const d of DIRS){
        if(g[idx(x+d[0],y+d[1])]!==1)continue;
        if(sanctuaryApproach(x+d[0],y+d[1]))continue;
        const px=x+0.5+d[0]*0.5,pz=y+0.5+d[1]*0.5;
        if(sconces.some(q=>Math.hypot(q.x-px,q.z-pz)<0.85)||props.some(q=>Math.hypot(q.x-px,q.z-pz)<0.66))continue;
        dc.push([x,y,d[0],d[1],px,pz]);
      }
    }
    for(let i=dc.length-1;i>0;i--){const j=(dr()*(i+1))|0;const t=dc[i];dc[i]=dc[j];dc[j]=t}
    const plan=doorPlan(seedStr,depth),want=BA?0:plan.count;
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
  if(depth>=2&&!BA){const lr=mulberry32(hashStr(seedStr+'#lurk'+depth)),ok=pool.filter(c=>!traps.some(q=>q.tx===c[0]&&q.ty===c[1])&&!sdoors.some(q=>q.tx===c[0]&&q.ty===c[1]));
    if(lr()<0.7&&ok.length){const c=ok[(lr()*ok.length)|0],guise=lr()<0.4?'delver':'map';
      npcs.push({type:'lurk',guise,x:c[0]+0.5,z:c[1]+0.5,ph:lr()*6.28,gift:0,tip:0,
        gx:c[0],gy:c[1],px:-1,py:-1,stare:0,aggro:false,face:lr()*6.28,hitT:0,used:true})}}
  // face down an open corridor at the start
  let yaw=0;
  for(const d of DIRS){if(g[idx(stx+d[0],sty+d[1])]===0){yaw=Math.atan2(d[1],d[0]);break}}
  if(archive)yaw=0;
  if(BA)yaw=-Math.PI/2;   // into the arena, toward the boss
  const bi=archive?9:look&&look.bi!=null?look.bi:BA?BOSSES[BA.i].bi:kind==='back'?4:kind==='forest'?8:biomeIx(depth);
  // looks are drawn last, from their own dice, so nothing above ever moves
  const vr=mulberry32(hashStr(seedStr+'#var#'+depth)),variant=pickVariant(vr,bi,look&&look.ix),B=BIOMES[bi];
  const litter=[];
  if(variant.rubbleK>1&&kind!=='back'&&!archive){
    const spots=[];
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=idx(x,y);if(g[i]!==0||safeMask[i]||pocketMask[i]||reserved(x,y)||(x===stx&&y===sty)||(x===ex&&y===ey))continue;
      for(const d of DIRS)if(g[idx(x+d[0],y+d[1])]===1){spots.push([x,y,d]);break}}
    const n=Math.min(spots.length,Math.round(nCells/10*(variant.rubbleK-1)));
    for(let k=0;k<n;k++){const j=k+((vr()*(spots.length-k))|0),c=spots[j];spots[j]=spots[k];spots[k]=c;
      const m=1+((vr()*3)|0),off=0.3+vr()*0.12;
      for(let q=0;q<m;q++){const along=(vr()-0.5)*0.8;
        litter.push({x:c[0]+0.5+(c[2][0]?c[2][0]*off:along),z:c[1]+0.5+(c[2][1]?c[2][1]*off:along),s:0.04+vr()*0.08,r:vr()*6.28,sy:0.5+vr()*0.6})}}
  }
  const stone=[B.stone[0]*variant.stone[0],B.stone[1]*variant.stone[1],B.stone[2]*variant.stone[2]];
  const forest=bi===8;
  // ingredients for the Brewer, from their own dice so nothing else moves
  potSeedIngredients(seedStr,depth,g,W,H,safeMask,pocketMask,items,[[stx,sty],[ex,ey]],d0,bi,nCells,reserved);
  fizzPlace(seedStr,depth,g,W,H,safeMask,pocketMask,d0,shades,kind);
  if(BA)bossSpawn(BA,W,H,shades);
  critterPlace(seedStr,depth,g,W,H,safeMask,pocketMask,d0,shades,kind);
  trollPlace(seedStr,depth,g,W,H,safeMask,pocketMask,d0,shades,kind);   // the troll, past floor 20, now and then   // the spider (floors ending in 9) and the slugs (ending in 4)
  grannyPlace(seedStr,depth,g,W,H,safeMask,pocketMask,d0,shades,kind);   // Granny, about one floor in twenty   // the Fizzler, about one floor in ten
  const floor={W,H,g,cw,ch,kind:forest?'forest':kind==='forest'?'maze':kind,dark:kind==='dark',back:kind==='back',base:B.base,variant,litter,stone,wet:clamp(B.wet*variant.wetK,0,1),fogK:variant.fogK,ambK:variant.ambK,ambT:variant.ambT,torchT:variant.torch,tex:{v:variant.tex,seed:variant.seed,tint:variant.tint},panels,panelAt,pocketMask,phantoms,pockets,blk:0,boT:22+rng()*25,props,discs,safe,safeMask,npcs,reveal:false,door,sdoors,traps,pillars,sconces,rubble,frames:[],start:{tx:stx,ty:sty,yaw},exit:{tx:ex,ty:ey,x:ex+0.5,z:ey+0.5},items,shades,
          seen:new Uint8Array(W*H),dist:d0,bi,biome:B,...(forest?{forest:true,fo:{seed:seedStr,depth}}:{}),
          ...(BA?{boss:BA,music:'silent'}:{}),   // no floor music in an arena: the fight brings its own
          name:BA?BOSSES[BA.i].arena:kind==='cave'?'The Hollow':kind==='dark'?'The Black Hush':BIOMES[bi].name};
  if(forestRoutes){
    floor.forestRoutes=forestRoutes;
    const {creek:c,arch,oak}=forestRoutes;
    const nearBank=creekBanks(c,c.bridge)[0]-.52;
    for(const [x,z,dx,dz] of [[nearBank,c.bridge-.72,0,1],[oak.x-.69,oak.z+.52,1,0],[arch.x+.93,arch.z-.57,-1,0]]){
      sconces.push({x,z,dx,dz,lx:x-dx*.22,lz:z-dz*.22,ph:x+z});
    }
  }
  if(archive){
    floor.archive=archive;
    for(const z of [3.04,7.06])items.push({type:'gem',tx:7,ty:Math.floor(z),x:7.16,z,y:BALCONY_Y,got:false,ph:z});
  }
  if(sanctuaryEntrance){
    attachSanctuary(floor,sanctuaryEntrance);
    floor.dist=bfs(floor.g,W,floor.H,stx,sty);
  }
  // The residents join after the rest of the floor has been placed.
  if(safe?.wheel)npcs.push({type:'pat',x:safe.wheel.pat[0],z:safe.wheel.pat[1],ph:(safe.tx*7.31+safe.ty*3.7)%6.28,used:true,
    yaw:Math.atan2(safe.wheel.nz,safe.wheel.nx)});
  potPlaceBrewer(safe,npcs);smithPlace(safe,npcs);
  return floor;
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
const scene=new THREE.Scene(),forestSky=new THREE.Color(0x111d29);
const camera=new THREE.PerspectiveCamera(72,1,0.03,60);
scene.add(camera);
scene.fog=new THREE.FogExp2(0x000000,0.062);
const ambLight=new THREE.AmbientLight(0xffffff,1);scene.add(ambLight);
function prepareMazeLighting(){
  if(Q<1||SAFE||scene.environment)return;
  const pm=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  try{
    scene.environment=pm.fromScene(room,0.04).texture;
    scene.environmentIntensity=0.05;
  }finally{room.dispose();pm.dispose()}
}
const torchLight=new THREE.PointLight(0xffffff,0,8,1.0);
// the torch's shadow cube: 768 per face at High (was 1024, ~40% fewer shadow pixels to draw six times over; PCF softening hides the difference)
if(SHADOWS){torchLight.castShadow=true;torchLight.shadow.mapSize.set(Q>=2?768:512,Q>=2?768:512);torchLight.shadow.camera.near=0.04;torchLight.shadow.camera.far=9;torchLight.shadow.bias=-0.003;torchLight.shadow.normalBias=0.025;torchLight.shadow.camera.layers.enable(1)}
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
    sh.uniforms.uTime=UT;sh.uniforms.uWet={value:o.wet||0};sh.uniforms.uEmK=emU;sh.uniforms.uPDepth={value:o.depth};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;varying vec3 vWNor;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvWPos=position;vWNor=normal;');
    const nrmChunk=THREE.ShaderChunk.normal_fragment_maps.replace(/vNormalMapUv/g,'pUv');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vWPos;varying vec3 vWNor;uniform float uTime;uniform float uWet;uniform float uEmK;uniform float uPDepth;'+NOISE_GLSL)
      .replace('#include <map_fragment>',`
  vec2 pUv=vMapUv;float wDist=distance(vWPos,cameraPosition);float pud=0.0;
  {vec3 Ng=normalize(vWNor);
    vec3 Tw=abs(Ng.x)>0.5?vec3(0.0,0.0,1.0):vec3(1.0,0.0,0.0);
    vec3 Bw=abs(Ng.y)>0.5?vec3(0.0,0.0,1.0):vec3(0.0,-1.0,0.0);
    ${o.panel||o.phantom?'':`if(wDist<9.0){
      vec3 Vw=(cameraPosition-vWPos)/wDist;
      vec3 vt=vec3(dot(Vw,Tw),dot(Vw,Bw),abs(dot(Vw,Ng)));
      float sc=uPDepth*(abs(Ng.y)>0.5?0.5:1.0)*smoothstep(9.0,6.0,wDist);
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
  m.customProgramCacheKey=()=>'w'+[o.kind,o.panel?1:0,o.phantom?1:0,o.bad?1:0,steps].join(',');   // the parallax depth is a uniform: one program serves every depth
  return m;
}
const worldMats=new Map();
const creekMaterial=new THREE.MeshStandardMaterial({color:0x336766,roughness:.53,metalness:.08,emissive:0x142321,emissiveIntensity:.42});
creekMaterial.onBeforeCompile=shader=>{
  shader.uniforms.creekTime=UT;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vCreek;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvCreek=position.xz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vCreek;uniform float creekTime;')
    .replace('#include <color_fragment>',`#include <color_fragment>
      float w1=sin(vCreek.y*32.-creekTime*4.4+sin(vCreek.x*6.+vCreek.y*2.)*1.15);
      float w2=sin(vCreek.y*6.+vCreek.x*3.9-creekTime*1.1);
      float patches=.5+.5*sin(vCreek.x*15.+vCreek.y*3.+w2*2.1);
      float ripple=smoothstep(.79,.99,w1)*smoothstep(.15,.84,patches);
      diffuseColor.rgb*=.83+.28*ripple+.12*w2;
      diffuseColor.rgb+=vec3(.035,.067,.060)*ripple;
    `);
};
creekMaterial.customProgramCacheKey=()=>'forest-creek';
// Keep the installed floor and the reusable shaft previews textured across runs.
function sweepWorld(){
  const keep=new Set(worldMesh.material);
  for(const mesh of glimpseProto.values())for(const material of mesh.material)keep.add(material);
  for(const [key,material] of worldMats)if(!keep.has(material)){
    material.dispose();worldMats.delete(key);
  }
  SURFS.sweep(new Set([...keep].map(material=>material.map)));
}
function getWorldMat(F,k){
  if(k===8&&F.forestRoutes)return creekMaterial;
  const office=k>=10,kd=k%10,panel=kd===4||kd===6,B=F.biome,stoneFr=kd===7;
  const base=office?13:stoneFr?0:F.base,tex=office||kd===3||panel||stoneFr?null:F.tex;
  const layer=kd===3?12:base+(panel?3:kd===5||stoneFr?0:kd);
  const kind=kd===3?3:panel?2:kd===5||stoneFr?0:kd;
  const wet=kind===1?(office?0.25:F.kind==='cave'?1:F.wet):0;
  const gl2=office?BIOMES[4].spec:B.spec,g=kind===3?0.15:gl2[kind];
  const key=[layer,kd,wet,tex?SURFS.key(tex):''].join(':');
  let m=worldMats.get(key);
  if(!m){m=worldMaterial({layer,kind,panel,bad:kd===6,phantom:kd===5,wet,tex,depth:layer===13?0.02:layer===14?0.025:layer>=15&&layer<17?0.03:0.06});worldMats.set(key,m)}
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
const sanctuaryDisplay=createSanctuaryDisplay();
sanctuaryDisplay.group.visible=false;
scene.add(sanctuaryDisplay.group);
function buildMesh(F,preview=false){
  const v=[],{W,H,g}=F,Y=F.archive?ARCHIVE_CEILING:WALL_H;
  if(F.start&&!F.lift&&!archiveRun)F.lift=mountLiftDock(F,bfs(g,W,H,F.start.tx,F.start.ty));
  const dock=F.lift;
  const quad=(p,n,uv,layer)=>{for(const i of[0,1,2,0,2,3])v.push(p[i][0],p[i][1],p[i][2],n[0],n[1],n[2],uv[i][0],uv[i][1],layer)};
  const wall=(x,y)=>x<0||y<0||x>=W||y>=H?!(dock&&x===dock.tx-dock.fx&&y===dock.tz-dock.fz):g[y*W+x]===1;
  const fr=F.forest,room=F.safe?.room;
  const topAt=(x,z)=>room&&F.safeMask[z*W+x]&&z>=room.front?SANCTUARY_HEIGHT:
    F.archive&&!F.archive.reserved(x,z)?ARCHIVE_CORRIDOR:Y;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(g[y*W+x]===1)continue;
    const indoor=room&&F.safeMask[y*W+x];
    const tall=indoor&&y>=room.front;
    const top=topAt(x,y);
    const pk=F.pocketMask[y*W+x]?10:0;
    const fu=[[x/2,y/2],[(x+1)/2,y/2],[(x+1)/2,(y+1)/2],[x/2,(y+1)/2]];
    if(!F.forestRoutes||!drawForestGround(F.forestRoutes.creek,x,y,quad)){
      quad([[x,0,y],[x+1,0,y],[x+1,0,y+1],[x,0,y+1]],[0,1,0],fu,1+pk);
    }
    // The sky is open above the hedges. Only pockets and the sanctuary keep a ceiling.
    if(!fr||pk||indoor)quad([[x,top,y],[x+1,top,y],[x+1,top,y+1],[x,top,y+1]],[0,-1,0],fu,(pk?4:F.panelAt[y*W+x]===2?6:F.panelAt[y*W+x]?4:2)+pk);
    if(fr&&!pk&&!indoor)continue;
    const uvTop=1-top/Y;
    if(F.archive&&dock&&x===dock.tx&&y===dock.tz){
      const bottom=WALL_H,uv=[[0,1-bottom/Y],[1,1-bottom/Y],[1,uvTop],[0,uvTop]];
      if(dock.fx){
        const edge=x+(dock.fx<0?1:0);
        quad([[edge,bottom,y],[edge,bottom,y+1],[edge,top,y+1],[edge,top,y]],[dock.fx,0,0],uv,0);
      }else{
        const edge=y+(dock.fz<0?1:0);
        quad([[x,bottom,edge],[x+1,bottom,edge],[x+1,top,edge],[x,top,edge]],[0,0,dock.fz],uv,0);
      }
    }
    if(wall(x+1,y))quad([[x+1,0,y],[x+1,0,y+1],[x+1,top,y+1],[x+1,top,y]],[-1,0,0],[[y,1],[y+1,1],[y+1,uvTop],[y,uvTop]],pk);
    if(wall(x-1,y))quad([[x,0,y],[x,0,y+1],[x,top,y+1],[x,top,y]],[1,0,0],[[y,1],[y+1,1],[y+1,uvTop],[y,uvTop]],pk);
    if(wall(x,y+1))quad([[x,0,y+1],[x+1,0,y+1],[x+1,top,y+1],[x,top,y+1]],[0,0,-1],[[x,1],[x+1,1],[x+1,uvTop],[x,uvTop]],pk);
    if(F.archive){
      for(const [dx,dz] of DIRS){
        if(x+dx<0||x+dx>=W||y+dz<0||y+dz>=H||wall(x+dx,y+dz))continue;
        const lower=topAt(x+dx,y+dz);
        if(lower>=top)continue;
        const uv=[[0,1-lower/Y],[1,1-lower/Y],[1,uvTop],[0,uvTop]];
        if(dx){
          const edge=x+(dx>0?1:0);
          quad([[edge,lower,y],[edge,lower,y+1],[edge,top,y+1],[edge,top,y]],[-dx,0,0],uv,0);
        }else{
          const edge=y+(dz>0?1:0);
          quad([[x,lower,edge],[x+1,lower,edge],[x+1,top,edge],[x,top,edge]],[0,0,-dz],uv,0);
        }
      }
    }
    if(wall(x,y-1)||tall&&y===room.front&&!F.archive){
      const bottom=wall(x,y-1)?0:Y;
      quad([[x,bottom,y],[x+1,bottom,y],[x+1,top,y],[x,top,y]],[0,0,1],[[x,1-bottom/Y],[x+1,1-bottom/Y],[x+1,uvTop],[x,uvTop]],pk);
    }
  }
  if(F.forestRoutes)drawCreekTerrain(F.forestRoutes.creek,quad);
  let hedges=null;
  if(fr){
    const faces=FOREST.faces(F),under=new Set();
    hedges=FOREST.hedge(F,faces);
    if(F.fo)F.fo.hedgeTris=hedges.reduce((n,part)=>n+part.data.p.length/9,0);
    // Soil extends just under the rounded hedge so the base never opens onto the sky.
    for(const {tx,ty} of faces){
      const k=ty*W+tx;
      if(under.has(k))continue;
      under.add(k);
      const fu=[[tx/2,ty/2],[(tx+1)/2,ty/2],[(tx+1)/2,(ty+1)/2],[tx/2,(ty+1)/2]];
      quad([[tx,0,ty],[tx+1,0,ty],[tx+1,0,ty+1],[tx,0,ty+1]],[0,1,0],fu,1);
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
  const hedgeVertices=hedges?.reduce((n,part)=>n+part.data.p.length/3,0)||0,total=nV+hedgeVertices;
  const pos=new Float32Array(total*3),nor=new Float32Array(total*3),uv=new Float32Array(total*2),mats=[];
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
  if(hedgeVertices){
    const colors=new Float32Array(total*3),sway=new Float32Array(total);
    let cursor=nV;
    for(const part of hedges){
      const n=part.data.p.length/3;
      pos.set(part.data.p,cursor*3);nor.set(part.data.n,cursor*3);
      colors.set(part.data.c,cursor*3);sway.set(part.data.w,cursor);
      geo.addGroup(cursor,n,mats.length);mats.push(part.material);
      cursor+=n;
    }
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geo.setAttribute('aSw',new THREE.BufferAttribute(sway,1));
  }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,mats);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
  // A passing landing only needs this mesh. Do not touch the playable world.
  if(preview)return mesh;
  installWorldMesh(F,mesh);
}
function installWorldMesh(F,mesh,deferCleanup=false){
  mesh.matrixAutoUpdate=false;
  if(worldMesh){
    const previous=worldMesh;
    scene.remove(previous);
    if(deferCleanup)afterLiftFrame(()=>previous.geometry.dispose());else previous.geometry.dispose();
  }
  worldMesh=mesh;scene.add(worldMesh);
  if(forestGrp){
    const previous=forestGrp;
    previous.removeFromParent();forestGrp=null;
    if(deferCleanup)afterLiftFrame(()=>FOREST.dispose(previous));else FOREST.dispose(previous);
  }
  if(F.forest){forestGrp=FOREST.build(F);scene.add(forestGrp);F.fo.stats=forestGrp.userData.stats}
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
    {const wx=R[0]*nx+R[1]*ny+R[2]*nz,wy=R[3]*nx+R[4]*ny+R[5]*nz,wz=R[6]*nx+R[7]*ny+R[8]*nz,il=1/(Math.hypot(wx,wy,wz)||1);b[o++]=wx*il;b[o++]=wy*il;b[o++]=wz*il}   // unit normals even in a scaled frame (the AO pass reads them raw)
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
    const pt=dead?0:WOF.party||0,shout=pt>0&&pt<PAT_PARTY.shout||!dead&&WOF.yell>0,dance=pt>=PAT_PARTY.shout&&pt<PAT_PARTY.end,bt=(pt-PAT_PARTY.shout)*4,sh=Math.sin(bt*Math.PI);
    const present=dead?0:!WOF.done?1:0.35+0.3*Math.max(0,Math.sin(t*0.6+ph)),bounce=!WOF.done?Math.abs(Math.sin(t*6))*0.01:shout?Math.min(1,(pt||1)*5)*0.02:dance?Math.abs(sh)*0.04:0;
    for(const z of[-1,1]){
      // the shuffle: one foot kicks out and back while the other slides, swapping every beat
      const kk=dance?Math.max(0,z*sh):0,sl=dance?Math.sin(bt*Math.PI*0.5)*0.03:0;
      const hip=v(0,0.45,z*0.055),knee=v(0.012+0.16*kk,0.25+0.1*kk,z*(0.058+0.03*kk)+sl),ank=v(0.22*kk-0.05*(dance?1-kk:0),0.06+0.14*kk,z*(0.06+0.09*kk)+sl);
      seg(B,hip,knee,0.052*S,0.044*S,suit);ball(B,knee,0.044*S,suit,true);seg(B,knee,ank,0.044*S,0.038*S,suit);
      ball(B,[ank[0]+0.035*S,ank[1]-0.028*S,ank[2]],[0.072*S,0.034*S,0.04*S],shoe,true);
    }
    const U=subF(B,v(sway,0.45+bounce,0),dance?m3(rX(sway*2+sh*0.12),rYaw(0.45*Math.sin(bt*Math.PI*0.5))):shout?rZ(0.18*Math.min(1,(pt||1)*5)):rX(sway*2));
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
    let E1=v(0.05,0.14+lift*0.6+breath,sd*0.17),W1=v(0.1+0.04*present,0.12+lift*1.4+breath,sd*(0.22+0.07*present));
    // shouting: both fists in the air. dancing: arms pumping to the beat
    const pump=z=>dance?Math.max(0,z*sh):0;
    if(shout){E1=v(0.02,0.33,sd*0.16);W1=v(0.04,0.47+Math.sin(t*14)*0.01,sd*0.17)}
    else if(dance){E1=v(0.07,0.15+0.05*pump(sd),sd*0.16);W1=v(0.17,0.16+0.2*pump(sd),sd*0.12)}
    limb(U,v(0,0.23+breath,sd*0.1),E1,W1,0.034*S,0.03*S,0.025*S,suit,suit,null);
    seg(U,[W1[0]-0.01*S,W1[1]-0.004*S,W1[2]-sd*0.014*S],W1,0.027*S,0.026*S,shirt);
    ball(U,[W1[0]+0.012*S,W1[1]+0.004*S,W1[2]+sd*0.012*S],[0.026*S,0.012*S,0.03*S],skin,true);
    // the other hand holds the cue cards at the chest
    const W2=shout?v(0.04,0.47+Math.cos(t*14)*0.01,-sd*0.17):dance?v(0.17,0.16+0.2*pump(-sd),-sd*0.12):v(0.13,0.13+breath,-sd*0.05);
    limb(U,v(0,0.23+breath,-sd*0.1),shout?v(0.02,0.33,-sd*0.16):dance?v(0.07,0.15,-sd*0.15):v(0.03,0.11+breath,-sd*0.15),W2,0.034*S,0.03*S,0.025*S,suit,suit,skin,0.028*S);
    slab(U,[W2[0]+0.012*S,W2[1]+0.04*S,W2[2]],[0.004*S,0.05*S,0.036*S],card,rZ(-0.25));
    seg(U,v(0,0.262+breath,0),v(0,0.288+breath,0),0.036*S,0.034*S,shirt);    // collar
    seg(U,v(0,0.27+breath,0),v(0.003,0.31+breath,0),0.03*S,0.028*S,skin);
    const H=subF(U,v(0.003,0.305+breath,0),m3(m3(rYaw(dance?n.hy*0.3:n.hy),rZ(n.hp+nod+(dead?0.4:0)+(shout?0.45:0)+(dance?0.08*Math.abs(sh):0))),rX(Math.sin(t*0.6+ph)*0.04+(dance?Math.sin(bt*Math.PI)*0.12:0))));
    const K=S*1.25,HS={p:H.p,R:H.R.map(q=>q*K)};                              // a big friendly head on a small man
    face(HS,{skin,blink:dead?0.05:blink,iris:[0.35,0.45,0.62],brow:[0.62,0.6,0.58,5],browH:0.008,browTilt:-0.18,browUp:0.004,eyeS:1.05,nose:[0.017,0.019,0.016],ears:true,
      mouth:[0.45,0.12,0.12],mouthW:0.034,talk:WOF.yell>0&&!dead?0.006+Math.abs(Math.sin(t*13))*0.016:shout?0.018:dance?0.008:jaw+(!WOF.done?Math.max(0,Math.sin(t*7))*0.006:0.003)});
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
  }else if(n.type==='crunch'){
    // The Crunch Gremlin: a short, stout cave gremlin in rust-orange hide, a heavy stone jaw that grinds, a pretzel in each fist,
    // and a trail of crumbs behind it
    const S=0.66,v=(x,y,z)=>[x*S,y*S,z*S];
    const hide=[0.76,0.33,0.12,5],hideD=[0.55,0.22,0.08,5],belly=[0.9,0.62,0.36,5],stone=[0.48,0.47,0.45,9],stoneD=[0.34,0.33,0.32,9],tooth=[0.92,0.9,0.8,9],
          eyeW=[0.98,0.9,0.4,7],pupil=[0.05,0.03,0.02,8],pretz=[0.62,0.36,0.12,6],salt=[0.98,0.98,0.95,9],claw=[0.25,0.18,0.12,4];
    const w=n.walk||0,mv=n.mv||0,sw=Math.sin(w)*mv,bob=Math.abs(Math.cos(w))*0.03*mv,chew=n.chew||0,jaw=0.02+Math.max(0,Math.sin(t*(chew?16:5)))*(chew?0.09:0.035);
    for(const z of[-1,1]){const st=sw*z;   // short thick legs, waddling
      const hip=v(0,0.32,z*0.11),ft=v(0.1*st,0.04,z*0.13);seg(B,hip,ft,0.08*S,0.065*S,hideD);ball(B,[ft[0]+0.03*S,ft[1]-0.01*S,ft[2]],[0.1*S,0.05*S,0.07*S],hideD,true);
      for(const c of[-1,0,1])seg(B,[ft[0]+0.1*S,0.02*S,ft[2]+c*0.03*S],[ft[0]+0.14*S,0.01*S,ft[2]+c*0.035*S],0.012*S,0.004*S,claw)}
    const U=subF(B,v(0,0.3+bob,0),m3(rYaw(sw*0.2),rZ(-0.12*mv+Math.sin(t*2.2)*0.03)));
    ball(U,v(0,0.22,0),[0.26*S,0.27*S,0.27*S],hide);                                    // the round barrel of a body
    ball(U,v(0.1,0.17,0),[0.18*S,0.2*S,0.21*S],belly);
    for(let i=0;i<7;i++){const a=i*0.9;ball(U,v(-0.08+Math.cos(a)*0.12,0.3+Math.sin(a*1.7)*0.12,Math.sin(a)*0.18),0.03*S,hideD,true)}   // knobbly warts
    // stubby arms, a pretzel in each fist, taking turns going to the mouth
    for(const z of[-1,1]){const lift=Math.max(0,Math.sin(t*3+(z>0?0:Math.PI)))*(chew?1:0.5);
      const Sh=v(0.02,0.36,z*0.25),E=v(0.12,0.26+lift*0.08,z*0.31),Wr=v(0.24+lift*0.04,0.3+lift*0.2,z*(0.24-lift*0.1));
      limb(U,Sh,E,Wr,0.07*S,0.06*S,0.05*S,hide,hide,hideD,0.065*S);
      const P0=subF(U,[Wr[0]+0.04*S,Wr[1]+0.03*S,Wr[2]],rX(z*0.6));                     // a pretzel: three loops
      seg(P0,[0,0,-0.05*S],[0,0.06*S,0],0.014*S,0.014*S,pretz);seg(P0,[0,0.06*S,0],[0,0,0.05*S],0.014*S,0.014*S,pretz);seg(P0,[0,0,-0.05*S],[0,0,0.05*S],0.014*S,0.014*S,pretz);
      ball(P0,[0,0.035*S,-0.025*S],0.006*S,salt,true);ball(P0,[0,0.03*S,0.03*S],0.006*S,salt,true)}
    // the head sits low on the shoulders: heavy brow, little yellow eyes, and a stone jaw that grinds
    const H=subF(U,v(0.12,0.48,0),m3(rYaw((n.hy||0)*0.6),rZ((n.hp||0)*0.5+0.05)));
    ball(H,v(0,0,0),[0.16*S,0.13*S,0.17*S],hide);
    slab(H,v(0.12,0.06,0),[0.05*S,0.03*S,0.15*S],hideD,rZ(-0.25));                       // the brow
    for(const z of[-1,1]){ball(H,v(0.14,0.03,z*0.065),[0.03*S,0.03*S,0.03*S],eyeW,true);ball(H,v(0.165,0.03,z*0.065),[0.012*S,0.016*S,0.012*S],pupil,true);
      ball(H,v(-0.02,0.1,z*0.15),[0.03*S,0.07*S,0.03*S],hideD,true)}                  // ears like horns
    ball(H,v(0.17,-0.01,0),[0.035*S,0.03*S,0.04*S],hideD,true);                          // a snub nose
    const J=subF(H,v(0.04,-0.06-jaw,0),rZ(-jaw*1.2));                                     // the stone jaw
    slab(J,v(0.08,-0.03,0),[0.12*S,0.05*S,0.15*S],stone);slab(J,v(0.08,-0.06,0),[0.11*S,0.02*S,0.14*S],stoneD);
    for(let i=0;i<6;i++)slab(J,v(0.17,0.03,-0.1+i*0.04),[0.012*S,0.025*S,0.012*S],tooth);
    slab(H,v(0.14,-0.06,0),[0.06*S,0.02*S,0.14*S],stone);for(let i=0;i<5;i++)slab(H,v(0.18,-0.08,-0.08+i*0.04),[0.01*S,0.02*S,0.012*S],tooth);
    out.top=0.62*S;
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
  }else if(n.type==='brewer')potBuildBrewer(n,B,t,ph,breath,blink,talking,out);
  else if(n.type==='smith')smithBuild(n,B,t,ph,breath,blink,talking,out);
  return out;
}
/* ---------- creatures in the same jointed style ---------- */
const facingMoose=s=>s.mooseLure?.active||MP.guest&&s.mooseFollowing;
function buildLibrarian(s,t,exhibit=false){
  const y=exhibit||!F?.archive?0:archiveGround(F.archive,s.x,s.z,0);
  drawLibrarian({p:[s.x,y,s.z],R:rYaw(s.face??Math.PI)},s,t,{slab,seg,ball,rZ});
}
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
  // a plain white restroom door with a little blue sign
  bathroom:{
    leaf(f,D){
      slab(f,[0.02,0.52,0],[0.04,1.04,0.5],[0.92,0.9,0.84,6]);
      slab(f,[0.045,0.52,0],[0.012,0.9,0.4],[0.86,0.84,0.78,6]);
      slab(f,[0.06,0.86,0],[0.012,0.1,0.12],[0.25,0.5,0.95,11]);
      ball(f,[0.066,0.885,-0.035],0.016,[1.2,1.2,1.3,11],true);ball(f,[0.066,0.885,0.035],0.016,[1.2,1.2,1.3,11],true);
      slab(f,[0.066,0.84,-0.035],[0.004,0.03,0.014],[1.2,1.2,1.3,11]);slab(f,[0.066,0.84,0.035],[0.004,0.03,0.022],[1.2,1.2,1.3,11]);
      doorKnob(f,[0.8,0.8,0.85,4]);
    },
    glow(D,t){return[0.6,0.8,1,0.3+0.1*Math.sin(t*2.6+D.ph)]}
  },
  // a black door outlined in buzzing pink and blue neon tubes, a little ray gun in lime over the knob
  neon:{
    leaf(f,D){
      slab(f,[0.02,0.52,0],[0.04,1.04,0.5],[0.05,0.03,0.08,6]);
      for(const z of[-0.22,0.22])slab(f,[0.05,0.52,z],[0.012,0.96,0.016],[2.4,0.5,2.1,11]);
      for(const y of[0.06,0.98])slab(f,[0.05,y,0],[0.012,0.016,0.46],[0.5,2.2,2.6,11]);
      slab(f,[0.055,0.7,-0.08],[0.01,0.05,0.12],[1.4,2.4,0.4,11]);slab(f,[0.055,0.66,-0.12],[0.01,0.06,0.03],[1.4,2.4,0.4,11]);
      doorKnob(f,[0.7,0.7,0.8,4]);
    },
    glow(D,t){const k=Math.sin(t*31+D.ph)>0.94?0.25:1;return[1,0.35,0.9,(0.45+0.1*Math.sin(t*3+D.ph))*k]}
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
  // a boss arena has no strange doors, so it takes none from the rotation: the next floor carries on where the last one stopped
  const per=d=>bossAt(d)?0:Math.min(N,doorCountFor(d));
  let cur=hashStr(seedStr+'#doorrot')%N;for(let d=1;d<depth;d++)cur+=per(d);
  const n=per(depth),kinds=[];for(let i=0;i<n;i++)kinds.push(order[(cur+i)%N]);
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
  const room=F.safe?.room;
  if(room){
    const wood=[0.29,0.16,0.082,6], edge=[0.46,0.27,0.12,6], brass=[0.54,0.32,0.13,4];
    for(const booth of room.booths){
      const f=I(booth.x,booth.z,-booth.yaw);
      const cloth=booth.type==='brewer'?[0.05,0.26,0.17,2]:booth.type==='smith'?[0.37,0.11,0.055,2]:[0.24,0.065,0.29,2];
      for(const side of [-1,1]){
        slab(f,[side*0.82,0.73,0.57],[0.10,1.46,0.10],wood);
        slab(f,[side*0.82,0.73,-0.57],[0.10,1.46,0.10],wood);
        slab(f,[side*0.82,0.25,0],[0.065,0.45,1.15],wood);
        slab(f,[side*0.82,0.06,0.57],[0.15,0.12,0.15],brass);
      }
      for(let i=-4;i<=4;i++)slab(f,[i*0.18,1.02,-0.59],[0.177,0.96,0.06],wood);
      slab(f,[0,1.54,0],[1.86,0.09,1.28],wood);
      slab(f,[0,1.44,0.57],[1.77,0.23,0.10],cloth);
      slab(f,[0,1.31,0.575],[1.77,0.035,0.10],edge);
      slab(f,[-0.57,0.31,0.45],[0.50,0.59,0.27],wood);
      slab(f,[-0.57,0.62,0.45],[0.53,0.065,0.32],edge);
    }
    const frame=I(room.mapX,room.back);
    slab(frame,[0,1.15,-0.05],[2.76,1.69,0.09],wood);
    for(const side of [-1,1]){
      slab(frame,[side*1.325,1.15,-0.105],[0.075,1.65,0.035],brass);
      slab(frame,[0,1.15+side*0.79,-0.105],[2.65,0.065,0.035],brass);
    }
  }
  for(const r of F.rubble.concat(F.litter||[]))emit(mesh6('octa'),I(r.x,r.z,r.r),[0,r.s*r.sy*0.6,0],[r.s*1.4,r.s*r.sy,r.s],dk);
  for(const q of F.sconces){const f=I(q.x,q.z);
    if(F.forest){ // an old iron lantern hung from a leaning wooden post
      const wd=[0.2,0.13,0.08,6],gl=[1.0,0.62,0.25,7],ax=q.dx?0.2:0.045,az=q.dz?0.2:0.045,lx=-q.dx*0.17,lz=-q.dz*0.17;
      slab(f,[0,0.45,0],[0.055,0.9,0.055],wd);slab(f,[lx/2,0.87,lz/2],[Math.max(ax,0.045)*0.95,0.035,Math.max(az,0.045)*0.95],wd);
      slab(f,[lx,0.8,lz],[0.01,0.1,0.01],iron);slab(f,[lx,0.6,lz],[0.07,0.016,0.07],iron);slab(f,[lx,0.665,lz],[0.052,0.095,0.052],gl);
      slab(f,[lx,0.725,lz],[0.082,0.02,0.082],iron);slab(f,[lx,0.745,lz],[0.04,0.02,0.04],iron);
      for(const a of[-1,1])for(const b of[-1,1])slab(f,[lx+a*0.028,0.665,lz+b*0.028],[0.008,0.1,0.008],iron);
    }else{slab(f,[0,0.72,0],[0.05,0.2,0.05],iron);slab(f,[-q.dx*0.07,0.82,-q.dz*0.07],[0.12,0.04,0.12],iron)}}
  if(F.archive)drawArchive(F.archive,I,{slab,seg,rZ,rX});
  if(F.forestRoutes)drawForestRoutes(F.forestRoutes,I,{slab,seg,ball,emit,mesh6,rZ});
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
const R={seed:'',depth:1,score:0,time:0,gems:0,wind:false,pk:{},guide:0,mirror:false};
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
const maxHp=()=>3+(up.heart|0)+(R.hpBonus|0)+(ps('titan')?1:0);
const plLevel=()=>1+UPG.reduce((a,u)=>a+(up[u.k]|0),0);
const ROMAN=['','I','II','III','IV'];
let nearNpc=null,talk=null,padHold=0;
const NPC={
  keeper:{name:'The Keeper',col:[0.3,0.19,0.11],eye:[1.0,0.6,0.2],h:1},
  map:{name:'Ilse the Mapmaker',col:[0.16,0.34,0.4],eye:[0.7,1.0,0.95],h:0.94},
  delver:{name:'Brakk, a wounded delver',col:[0.4,0.36,0.3],eye:[1.0,0.95,0.8],h:0.72},
  pat:{name:'Pat Sajak',col:[0.11,0.13,0.27],eye:[0.4,0.55,0.8],h:0.6},
  smith:{name:'Gorrum the Blacksmith',col:[0.3,0.18,0.09],eye:[1.0,0.6,0.3],h:1},
  brewer:{name:'Old Fennick, the Brewer',col:[0.2,0.14,0.32],eye:[0.5,1.0,0.6],h:0.95},
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
  touch.mx=touch.my=0;touch.stickId=null;touch.lookId=null;touch.jump=touch.crouch=false;$('stickBase').style.display=$('stickKnob').style.display='none';
  sfx('pick');buildTalk();
}
function closeTalk(){
  if(state!=='talk')return;
  const re=talk&&talk.relock;talk=null;state='play';padHold=performance.now()+350;P.jumpQ=0;
  $('talk').classList.add('hidden');if(INV.el)INV.el.classList.add('hidden');POT.hudK='';
  if(re&&!touch.on)lock();
}
function buildTalk(){
  if(talk.inv){invBuild();return}
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
  }else if(n.type==='brewer'){
    text=potTalk(o);
  }else if(n.type==='smith'){
    text=smithTalk(o);
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
function act(flash=true){if(loading||FX.frozen)return;emoteStop();if(P.down){mpCycle();return}if(state==='play'&&helpStart())return;if(state==='play'&&F&&F.boss&&bpUse())return;if(floorLiftInReach())openStation('lift');else if(state==='play'&&nearNpc)openTalk(nearNpc);else if(state==='play'&&nearDoor)sdoorOpen(nearDoor,true);else if(flash)useFlash()}
// mouse: left click attacks with a weapon in hand (or talks / opens when you have none), right click flashes
function clickL(){if(state!=='play')return;emoteStop();if(P.down){mpCycle();return}if(floorLiftInReach())act(false);else if(wHeld()&&!nearNpc&&!nearDoor)wAttack();else if(F&&F.boss&&!nearNpc&&!nearDoor)wPunch();else act(false)}
function clickR(){if(state!=='play')return;emoteStop();if(P.down){mpCycle();return}if(!loading&&!FX.frozen)useFlash()}

/* ---------- the Wheel of Misfortune ---------- */
// Pat Sajak stands beside the wheel in every sanctuary. A spin costs 10 gems. The result is drawn when the spin starts and the disc is planned to
// stop on it (src/wheel.js), and the outcome is read back from that final angle, so the slice under the pointer is always what happens.
// The spin is sent to everyone ({k:'wof'}): players on this floor watch the same wheel turn, players elsewhere hear about it, and when it stops
// every client applies the result. Outcomes the brief gives to "every user" run on every client; the ones it gives to "the user"/"the spinner"
// (Walmart, Black Plague, First Thanksgiving) run on the spinner; Ad Break and the DMV take everyone in the game. The Tickle Monster is run by the host (or a solo player) and streamed.
const WOF_DESC=['Go stand in line.','And now, a word from our sponsor. Everyone has to watch.','Everyone is a pug for two minutes.','Everyone is a large rat for two minutes.',
  'Everyone gains 200 pounds and moves ten times slower.','A coin decides. Heads: everyone gains 200 pounds.','Everyone loses this run\'s gems and supplies.',
  'Every sound is ten times louder.','A ringing in everyone\'s ears for a minute.','The spinner is a plague rat. Anyone who comes near dies slowly.',
  'He giggles. He is coming for each of you.','The spinner has smallpox. It is catching.',
  'Everyone take a number.','Please read and accept the updated terms.','Everyone\'s controls are reversed for a minute.','Everyone\'s head is three times bigger for two minutes.',
  'Every torch on the floor goes out. The shades heard that.','He has a few minutes of your time. Everyone\'s time.',
  'The spinner is a hedgehog for two minutes. Z (LB): curl up and nothing can hurt you. X (R3): roll at super speed.',
  'The spinner starts over. From the very beginning.','Everyone pull up a chair.','Take cover. Or don\'t. It won\'t help.','It loves crunchy baked goods. You look crunchy.'];
const WOF_SCALE=0.66;   // the model is built a little large; this fits the banner under the 1.25 m ceiling
const WOF={recent:[],party:0,plan:null,t:0,angle:0,flap:0,flapV:0,peg:0,result:-1,coin:0,mine:false,here:false,done:true,win:0,by:'',grp:null,chat:0};
const FX={baby:0,cryT:0,flyT:0,flyB:0,spin:0,hedge:0,curl:0,moon:0,bob:0,pitch:0,pitchDone:false,pitchLine:-1,pug:0,rat:0,last:null,plague:0,fat:0,loud:0,tin:0,dying:false,dyT:0,pox:0,poxNear:0,poxC:4,stag:0,tickled:0,frozen:null};
const FX_TIMERS=['baby','hedge','moon','bob','pug','rat','plague','fat','loud','tin','pox','tickled','stag'];
const FX_DUR={baby:120,hedge:120,moon:60,bob:120,form:120,fat:120,loud:30,tin:60,plague:120,pox:300,tickled:3};
let TK=null,TS=null,wofOut=null,tinNode=null,BRK=null;
// the first-person breaks (Walmart, the ad) are their own little 3D scenes, drawn instead of the maze while they run
const brk=()=>BRK||(BRK=createBreaks(renderer,{ui:breakUI,onBeep:k=>{if(!ac)return;if(k==='ding'){tone(880,0.5,'sine',0.12);tone(660,0.8,'sine',0.1,0.28)}else tone(2350,0.08,'square',0.06)}}));
const wofForm=()=>FX.baby>0?5:FX.hedge>0?4:FX.plague>0?3:FX.pug>0&&FX.rat>0?(FX.last==='rat'?2:1):FX.rat>0?2:FX.pug>0?1:0;   // 0 you, 1 pug, 2 rat, 3 plague rat, 4 hedgehog, 5 a crawling baby
const wofSpeed=()=>(FX.baby>0?0.5:1)*(FX.hedge>0&&FX.curl===2?3.2:1)*(FX.fat>0?0.1:1)*(FX.tickled>0?0.3:1)*(FX.stag>0?0.35:1);
const wofEye=()=>wofForm()===4?(FX.curl?0.3:0.38):[1,0.42,0.55,0.55,0.38,0.4][wofForm()];
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
  const i=pickSlice(WOF.recent,WOF_N),plan=planSpin(i,WOF.angle);
  const m={k:'wof',d:R.depth,i,c:Math.random()<0.5?1:0,a0:plan.from,a1:plan.to,dur:plan.dur,e:plan.e,n:myName()};
  mpSend(m);wofBegin(m,true);
}
function wofBegin(m,mine){
  WOF.plan={from:m.a0,to:m.a1,dur:m.dur,e:Number.isFinite(m.e)&&m.e>=1.5&&m.e<=6?m.e:3.2};WOF.t=0;WOF.coin=m.c?1:0;WOF.mine=mine;WOF.by=mine?myName():String(m.n||'Someone').slice(0,16);
  WOF.here=!!(F&&F.safe&&F.safe.wheel&&m.d===R.depth);WOF.done=false;WOF.chat=0;WOF.angle=m.a0;WOF.peg=Math.floor(m.a0/WOF_W);
  if(mine)say('Pat: "Big money! Big money!"',3);
  else if(WOF.here)say(WOF.by+' spins the Wheel of Misfortune!',3);
  else mpSys(WOF.by+' is spinning the Wheel of Misfortune...');
}
// Pat's celebration: 1.3 s shout, then about 5 s of shuffling to his own beat
const PAT_PARTY={shout:1.3,end:6.6};
function patParty(dt){
  const t0=WOF.party;WOF.party+=dt;const t=WOF.party,w=F&&F.safe&&F.safe.wheel;
  const d=w?Math.hypot(w.x-P.x,w.z-P.z):99,k=Math.max(0,1-d/16);
  if(t0<0.05&&t>=0.05&&k>0){
    if(d<10)say('Pat: "WOOOOO-HOOOOO! WHAT A SPIN!"',2.8);
    if(ac){tone(330,0.55,'sawtooth',0.14*k,0,520);tone(495,0.55,'square',0.05*k,0,780);tone(880,0.5,'sawtooth',0.12*k,0.6,-260);noise(0.9,0.05*k,1500,0.8)}
  }
  if(t>=PAT_PARTY.shout&&t<PAT_PARTY.end&&k>0&&ac){   // a little shuffle beat: kick, hat, kick, hat
    const b0=Math.floor((t0-PAT_PARTY.shout)*4),b1=Math.floor((t-PAT_PARTY.shout)*4);
    if(b1>b0&&b1>=0){if(b1%2===0)tone(70,0.12,'sine',0.3*k,0,-30);else noise(0.05,0.12*k,7000,2);if(b1%4===3)tone(392+(b1%8===7?131:0),0.1,'square',0.04*k)}
  }
  if(t>=PAT_PARTY.end)WOF.party=0;
}
// ...and now and then, for no reason at all, Pat lets out an enormous yell. The times come from the floor's seed and the shared
// clock, so everyone on the floor hears the same yell at the same moment.
function patYellTick(dt){
  WOF.yell=Math.max(0,(WOF.yell||0)-dt);
  if(!F||!F.safe||!F.safe.wheel)return;
  const pat=F.npcs.find(n=>n.type==='pat');if(!pat||pat.fall)return;
  const key=R.seed+'#'+R.depth;
  if(WOF.yKey!==key){WOF.yKey=key;WOF.yRng=mulberry32(hashStr(R.seed+'#yell#'+R.depth));WOF.yAt=25+WOF.yRng()*50}
  while(R.time>=WOF.yAt){
    const late=R.time-WOF.yAt;WOF.yAt+=45+WOF.yRng()*75;
    if(late<1.5)patYell(pat);
  }
}
const PAT_YELL='Hey! Hey! Spin my wheel! Spin it!';
// Pat's voice: the browser's speech synthesizer, as deep and as loud as it goes, with a man's voice when the system has one
let patVoice;
function patSpeak(k){
  const S=window.speechSynthesis;if(!S||typeof SpeechSynthesisUtterance==='undefined')return false;
  if(patVoice===undefined){const L=S.getVoices().filter(v=>/^en/i.test(v.lang));if(L.length)patVoice=L.find(v=>/\b(male|david|daniel|fred|alex|george|mark|guy|ryan|james|tom)\b/i.test(v.name)&&!/female/i.test(v.name))||L[0]||null}
  const u=new SpeechSynthesisUtterance(PAT_YELL);
  if(patVoice)u.voice=patVoice;u.lang='en-US';u.pitch=0.55;u.rate=1.15;u.volume=clamp(k*(getVolumes().sfx??1),0,1);
  try{S.cancel();S.speak(u);return true}catch(e){return false}
}
function patYell(pat){
  WOF.yell=3;
  const d=Math.hypot(pat.x-P.x,pat.z-P.z),k=Math.max(0.5,1-d/40);
  if(d<12)say('Pat: "'+PAT_YELL.toUpperCase()+'"',3);
  rumble(400,0.6,0.5);
  if(muted)return;
  if(patSpeak(k))return;
  if(!ac||!sfxBus)return;   // no speech on this browser: the wordless yell instead
  // a big chesty man's yell: a buzzing voice at about 130 Hz, shaped into "AAH" by two vowel filters, with a rasp of breath
  const t=ac.currentTime,dur=1.7,out=ac.createGain();
  out.gain.setValueAtTime(0.0001,t);out.gain.exponentialRampToValueAtTime(1.6*k,t+0.06);out.gain.setValueAtTime(1.6*k,t+dur-0.45);out.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-10;comp.ratio.value=4;out.connect(comp);comp.connect(sfxBus);
  const vox=ac.createOscillator(),vox2=ac.createOscillator(),vib=ac.createOscillator(),vg=ac.createGain();
  vox.type='sawtooth';vox2.type='square';
  for(const o of[vox,vox2]){o.frequency.setValueAtTime(118,t);o.frequency.exponentialRampToValueAtTime(172,t+0.25);o.frequency.setValueAtTime(172,t+1.1);o.frequency.exponentialRampToValueAtTime(110,t+dur)}
  vox2.detune.value=-1200;vib.frequency.value=6.5;vg.gain.value=5;vib.connect(vg);vg.connect(vox.frequency);vg.connect(vox2.frequency);
  const mix=ac.createGain();mix.gain.value=1;vox.connect(mix);const m2=ac.createGain();m2.gain.value=0.35;vox2.connect(m2);m2.connect(mix);
  for(const [f,q,g] of[[760,6,1.4],[1180,7,0.9],[2600,9,0.35]]){const bp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;const gg=ac.createGain();gg.gain.value=g;mix.connect(bp);bp.connect(gg);gg.connect(out)}
  const ns=ac.createBufferSource();ns.buffer=noiseBuf;ns.loop=true;const nf=ac.createBiquadFilter();nf.type='bandpass';nf.frequency.value=1400;nf.Q.value=0.8;const ng=ac.createGain();ng.gain.value=0.25;
  ns.connect(nf);nf.connect(ng);ng.connect(out);
  for(const o of[vox,vox2,vib])o.start(t);ns.start(t);for(const o of[vox,vox2,vib])o.stop(t+dur+0.05);ns.stop(t+dur+0.05);
}
const PAT_CHAT=['Pat: "Round and round she goes!"','Pat: "Ooh, she is slowing down..."','Pat: "Here it comes..."'];
function wofTickSpin(dt){
  if(WOF.done){
    WOF.win=Math.max(0,WOF.win-dt);
    if(WOF.party>0)patParty(dt);
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
  WOF.recent.push(i);if(WOF.recent.length>6)WOF.recent.shift();   // every player saw the same spin, so everyone keeps the same history
  // every so often Pat is overjoyed with the result: a shout of jubilee, then a shuffle dance (the same spins on every screen)
  WOF.party=Math.floor(WOF.plan.to*997)%5===0&&WOF.here?0.001:0;
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
    case 22:if(!MP.guest)cgSpawn();break;
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
    case 1:wofScene('ad');break;   // everyone in the game sits through the ad
    case 2:FX.pug=FX_DUR.form;FX.last='pug';break;
    case 3:FX.rat=FX_DUR.form;FX.last='rat';break;
    case 4:FX.fat=FX_DUR.fat;break;
    case 5:coinFlip(coin===1,()=>{if(coin===1&&wofLive())FX.fat=FX_DUR.fat});break;
    case 6:wofLoseAll();break;
    case 7:FX.loudN=FX.loud>0?(FX.loudN||1)+1:1;FX.loud=FX_DUR.loud;break;   // they compound: each pair on top of the last is another 10x, and the clock starts over
    case 8:FX.tin=FX_DUR.tin;break;
    case 9:if(mine){FX.plague=FX_DUR.plague;FX.dying=false}break;
    case 11:if(mine){FX.pox=FX_DUR.pox;FX.poxC=3}break;
    case 12:wofScene('dmv');break;   // and everyone takes a number
    case 13:if(mine)wofScene('terms');break;
    case 14:FX.moon=FX_DUR.moon;break;
    case 15:FX.bob=FX_DUR.bob;break;
    case 16:wofLightsOut();break;
    case 18:if(mine){FX.hedge=FX_DUR.hedge;setTimeout(()=>say(touch.on?'You are a hedgehog. CURL: nothing can hurt you. ROLL: super speed.':'You are a hedgehog. Hold Z to curl up (nothing can hurt you). Hold X to roll at super speed.',6),2500)}break;
    case 19:if(mine)wofScene('birth',()=>{if(!wofLive())return;FX.baby=FX_DUR.baby;FX.cryT=2;say('Congratulations, it is a baby. You can only crawl.',4)});break;
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
function wofScene(kind,after){
  if(wofAway())return;   // never a break behind a door
  if(state==='talk')closeTalk();
  FX.frozen=kind;P.vx=P.vz=0;
  const end=()=>{FX.frozen=null;if(after)after();if(wofLive()&&!touch.on&&!document.pointerLockElement)say('Click to return to the maze',4)};
  if((kind==='ad'||kind==='terms')&&document.pointerLockElement){usingLock=false;document.exitPointerLock()}   // free the cursor for Skip Ad and I Agree
  if(kind==='terms')termsDialog(end);
  else brk().start(kind,end);
}
function wofClear(){
  for(const k of FX_TIMERS)FX[k]=0;FX.flyT=0;BOMB=null;CG=null;FX.dying=false;FX.poxNear=0;FX.frozen=null;TK=null;TS=null;RR=null;FX.pitchDone=false;FX.pitch=0;WOQ.length=0;WOQ_T=0;WOQ.busy=0;rrMissed=false;closeTerms();
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

/* ---------- the Crunch Gremlin ---------- */
// A short, stout cave gremlin that loves crunchy baked goods, and players look crunchy. For one minute it chases whoever it has not
// bitten lately, crunching and munching. A bite costs a heart, then it chews for a few seconds and goes after the next player.
// Run by the host and streamed, like the Tickle Monster.
let CG=null;
const CG_LINES=['"Crunch, crunch, crunch!"','"Munch munch munch!"','"You look CRUNCHY."','"Crunchy crunchy delver!"','"Come here, little biscuit!"'];
const cgNew=(x,z)=>({x,z,tx:x,tz:z,yaw:0,tyaw:0,t:60,tg:null,last:{},walk:0,mv:0,chew:0,net:0,age:0,sayT:1,
  n:{type:'crunch',x,z,ph:3.1,used:true,lock:true,yaw:0,hy:0,hp:0}});
function cgSpawn(){if(!F)return;const w=F.safe&&F.safe.wheel;CG=cgNew(w?w.x+w.nx*0.9:P.x+0.8,w?w.z+w.nz*0.9:P.z);CG.chew=1.5}
function crunchSound(x,z,big){if(!ac)return;const d=Math.hypot(x-P.x,z-P.z);if(d>15)return;const k=Math.max(0.15,1-d/15)*(big?1.6:1);
  for(let i=0;i<(big?5:3);i++){const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime+i*0.13+Math.random()*0.03;
    s.buffer=noiseBuf;f.type='bandpass';f.frequency.value=1800+Math.random()*1500;f.Q.value=0.9;g.gain.setValueAtTime(0.3*k,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.07);
    s.connect(f);f.connect(g);g.connect(sfxBus);s.start(t,Math.random()*0.5);s.stop(t+0.08)}
  tone(95,0.25,'sawtooth',0.07*k,0,-30)}
function cgTick(dt){
  const T0=CG;if(!T0)return;
  if(MP.guest){T0.age+=dt;if(T0.age>3){CG=null;return}followNet(T0,dt)}
  else{
    T0.t-=dt;
    if(T0.t<=0){CG=null;mpSend({k:'cg',d:R.depth,end:1});say('The Crunch Gremlin waddles off with its pretzels.',3);return}
    if(T0.chew>0){T0.chew-=dt;T0.mv=Math.max(0,T0.mv-dt*4)}
    else{
      const L=tkTargets();let tg=L.find(q=>q.id===T0.tg);
      if(!tg&&L.length){L.sort((a,b)=>((T0.last[a.id]||-99)-(T0.last[b.id]||-99))||(Math.hypot(a.x-T0.x,a.z-T0.z)-Math.hypot(b.x-T0.x,b.z-T0.z)));tg=L[0];T0.tg=tg.id}
      if(!tg)T0.mv=Math.max(0,T0.mv-dt*4);
      else if(Math.hypot(tg.x-T0.x,tg.z-T0.z)<0.45){T0.last[tg.id]=R.time;T0.tg=null;T0.chew=3;if(tg.id==='me')cgBitten();else mpSend({k:'cgb'},tg.id)}
      else mazeStep(T0,tg.x,tg.z,dt,2.15);
    }
    T0.net-=dt;if(T0.net<=0&&MP.on){T0.net=0.1;mpSend({k:'cg',d:R.depth,x:r3(T0.x),z:r3(T0.z),y:r3(T0.yaw),m:r3(T0.mv),c:T0.chew>0?1:0,t:Math.round(T0.t)})}
  }
  T0.walk+=dt*T0.mv*10;
  T0.sayT-=dt;if(T0.sayT<=0){T0.sayT=2.2+Math.random()*1.5;crunchSound(T0.x,T0.z,T0.chew>0);
    if(Math.hypot(T0.x-P.x,T0.z-P.z)<7)say('Crunch Gremlin: '+CG_LINES[(Math.random()*CG_LINES.length)|0],2)}
}
function cgBitten(){
  if(P.down||!wofLive()||FX.frozen)return;
  crunchSound(P.x,P.z,true);
  if(FX.curl===1){say('CRUNCH! The gremlin bites down on spines and spits you out.',3);return}   // a curled hedgehog is not on the menu
  say('CRUNCH! The gremlin takes a bite out of you. It drops some pretzel crumbs.',3);hurt(null);if(F&&state!=='dead')potLoot(P.x,P.z,'ingr',2,13);
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
  wofTickSpin(dt);patYellTick(dt);
  if(!wofLive()){wofWasAway=false;if(FX.tin||FX.loud||TK||TS||CG||FX.moon||FX.bob||FX.frozen||FX.pug||FX.rat||FX.plague||FX.fat||FX.pox||FX.dying)wofClear();return}
  const away=wofAway();
  if(away!==wofWasAway){wofWasAway=away;if(away){tints({});statusStrip([]);document.body.classList.remove('hedgehog');wofAudio()}else WOQ_T=Math.max(WOQ_T,1.5)}
  if(!away)for(const k of FX_TIMERS)if(FX[k]>0)FX[k]=Math.max(0,FX[k]-dt);   // the clocks wait outside the door
  tkTick(dt);tsTick(dt);rrTick(dt);bombTick(dt);cgTick(dt);
  if(!away)wofReplayTick(dt);
  // the hedgehog: hold Z (pad LB, touch CURL) to curl into a ball of spines, X (pad R3, touch ROLL) to roll
  // a baby cries now and then: a wail that wavers and falls
  if(FX.baby>0&&!away&&!P.down){FX.cryT-=dt;if(FX.cryShow>0)FX.cryShow-=dt;if(FX.cryT<=0){FX.cryT=7+Math.random()*9;FX.cryShow=1.4;for(let i=0;i<3;i++){tone(520-i*30,0.35,'sawtooth',0.035,i*0.42,-160);tone(1040-i*60,0.3,'triangle',0.02,i*0.42,-300)}}}
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
  if(f===5)L.push(['Baby: crawling',FX.baby]);
  if(f===4)L.push([FX.curl===1?'Hedgehog: curled up':FX.curl===2?'Hedgehog: rolling':(touch.on?'Hedgehog':'Hedgehog · Z curl · X roll'),FX.hedge]);
  else if(f&&f<4)L.push([['','Pug','Rat','Plague rat'][f],f===3?FX.plague:f===2?FX.rat:FX.pug]);
  if(FX.fat>0)L.push(['+200 lbs',FX.fat]);
  if(FX.loud>0)L.push([FX.loudN>1?`Hearing aids x${FX.loudN} (${Math.pow(10,FX.loudN).toLocaleString()}x louder)`:'Hearing aids',FX.loud]);
  if(FX.tin>0)L.push(['Tinnitus',FX.tin]);
  if(FX.dying)L.push(['Dying of the plague',null]);
  if(FX.pox>0)L.push(['Smallpox',FX.pox]);
  if(FX.moon>0)L.push(['Moonwalk',FX.moon]);
  if(FX.bob>0)L.push(['Bobblehead',FX.bob]);
  if(R.mirror)L.push(['Mirror on the back of your head',null]);
  if(FX.tickled>0)L.push(['Tickled',null]);
  if(TS)L.push(['Timeshare salesman about',null]);
  if(CG)L.push(['Crunch Gremlin loose',CG.t]);
  if(TK)L.push(['Tickle Monster loose',TK.t]);
  potStatus(L);
  if(away)L.length=0;
  statusStrip(L);
  if(!away)tints({plague:FX.dying?0.9:FX.plague>0?0.45:0,tickle:FX.tickled>0?0.8:0,pox:FX.pox>0?0.55:0,fat:FX.fat>0?0.6:0});
  wofAudio();
}
// build the wheel with the floor (so its shaders compile behind the loading screen, not the first time you walk into a sanctuary)
function wofModel(floor=F){
  const w=floor&&floor.safe&&floor.safe.wheel;if(!w)return;
  if(!WOF.grp){WOF.grp=wheelModel();scene.add(WOF.grp)}
  WOF.grp.visible=true;WOF.grp.position.set(w.x,0,w.z);WOF.grp.rotation.y=w.yaw;WOF.grp.scale.setScalar(WOF_SCALE);
}
function wofDraw(t,ex,ey,ez,dtR){
  const w=F&&F.safe&&F.safe.wheel,show=!!w&&state!=='title';
  if(!WOF.grp){if(!show)return;wofModel()}
  WOF.grp.visible=show;
  if(show){WOF.grp.position.set(w.x,0,w.z);WOF.grp.rotation.y=w.yaw;WOF.grp.scale.setScalar(WOF_SCALE);WOF.grp.userData.pose(WOF.here||WOF.done?WOF.angle:WOF.angle,WOF.flap,t,!WOF.done&&WOF.here?'spin':WOF.win>0?'win':'idle')}
  bombDraw(t);
  if(CG){const n=CG.n;n.x=CG.x;n.z=CG.z;n.yaw=CG.yaw;n.walk=CG.walk;n.mv=CG.mv;n.chew=CG.chew>0;buildNpc(n,t,ex,ey,ez,dtR);
    if(CG.mv>0.3&&Math.random()<0.3)spr(CG.x-Math.cos(CG.yaw)*0.15,0.03,CG.z-Math.sin(CG.yaw)*0.15,0.05,0.05,7,0.8,0.55,0.25,0.8,0)}   // crumbs
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
// the Circle of Life: born again as a baby who can only crawl. Self: your own chubby hands patting the floor at the bottom of the view,
// one of them clutching the torch. Seen by others: a crawling baby in a onesie and a diaper, with a pacifier and a curl of hair.
function buildBaby(p,t,self){
  const mv=Math.min(1,(p.spd||0)/1.5),w=(p.walk||0)*1.6,sw=Math.sin(w)*mv,c=p.col||[0.62,0.32,0.2];
  const skin=[0.95,0.74,0.62,1],cheek=[1,0.55,0.55,1],onesie=[0.55+c[0]*0.4,0.62+c[1]*0.35,0.7+c[2]*0.3,2],diaper=[0.96,0.96,0.93,2],dark=[0.05,0.04,0.04,8],wood=[0.36,0.23,0.12,6],paci=[0.4,0.75,0.95,4],hair=[0.55,0.38,0.2,5];
  if(self){
    skin[0]*=0.55;skin[1]*=0.55;skin[2]*=0.55;onesie[0]*=0.55;onesie[1]*=0.55;onesie[2]*=0.55;   // right by the torch: darker, or the flame washes them out
    const H={p:[p.rx,Math.min(CAM_TOP,EYE*wofEye()+(p.ry||0)),p.rz],R:m3(rYaw(p.ryaw),rZ(clamp(p.rpitch||0,-0.9,0.9)))};
    // the left hand pats down in front, hand over hand; the right holds the torch up and wobbles (low in the view, like the torch hand)
    const lift=Math.max(0,Math.sin(w))*0.025*mv,reach=Math.cos(w)*0.03*mv;
    seg(H,[0.1,-0.17,-0.13],[0.22+reach,-0.11+lift,-0.09],0.03,0.026,onesie);ball(H,[0.235+reach,-0.11+lift,-0.09],[0.03,0.021,0.027],skin,true);
    for(let i=0;i<4;i++)ball(H,[0.262+reach,-0.113+lift,-0.105+i*0.011],0.007,skin,true);   // tiny fingers
    const wob=Math.sin(t*5)*0.006;
    seg(H,[0.1,-0.17,0.14],[0.2,-0.1+wob,0.1],0.03,0.026,onesie);ball(H,[0.21,-0.095+wob,0.1],0.027,skin,true);
    const tb=[0.215,-0.1+wob,0.1],tt=[0.24,-0.01+wob,0.095];seg(H,tb,tt,0.007,0.008,wood);
    return {torch:fpt(H,[tt[0],tt[1]+0.03,tt[2]])};
  }
  const bob=Math.abs(Math.cos(w))*0.012*mv,B={p:[p.rx,Math.max(0,p.ry||0)+bob,p.rz],R:rYaw(p.ryaw)};
  ball(B,[0,0.2,0],[0.15,0.09,0.1],onesie);                                       // the body, on all fours
  ball(B,[-0.13,0.2,0],[0.09,0.085,0.1],diaper);ball(B,[-0.16,0.24,0],0.012,[0.9,0.85,0.4,4],true);   // the diaper and its pin
  for(const z of[-1,1]){const st=sw*z;
    limb(B,[0.1,0.24,z*0.08],[0.13+0.04*st,0.12,z*0.1],[0.16+0.07*st,0.015,z*0.09],0.035,0.03,0.026,onesie,skin,skin,0.03);   // arms
    limb(B,[-0.12,0.18,z*0.06],[-0.06-0.05*st,0.035,z*0.07],[-0.22-0.03*st,0.05,z*0.065],0.04,0.035,0.03,onesie,onesie,skin,0.032)}   // knees down, feet up behind
  const H=subF(B,[0.21,0.28,0],rZ(clamp(p.rpitch||0,-0.4,0.4)*0.5+0.15));
  ball(H,[0,0,0],0.1,skin);ball(H,[-0.02,0.08,0],[0.04,0.03,0.04],hair,true);ball(H,[0.01,0.11,0.01],[0.012,0.03,0.012],hair,true);
  for(const z of[-1,1]){ball(H,[0.085,0.02,z*0.035],0.013,dark,true);ball(H,[0.08,-0.025,z*0.055],[0.02,0.014,0.02],cheek,true);ball(H,[0,0.0,z*0.098],[0.02,0.03,0.012],skin,true)}
  const cry=(FX.cryShow||0)>0&&self===false&&p.id===(MP.on?MP.id:'me');
  if(cry)ball(H,[0.095,-0.04,0],[0.006,0.022,0.026],dark,true);
  else{ball(H,[0.1,-0.04,0],[0.012,0.018,0.018],paci,true);slab(H,[0.108,-0.04,0],[0.004,0.03,0.035],paci)}   // the pacifier
  const tb=[0.18,0.08,0.09],tt=[0.22,0.3,0.1];seg(B,tb,tt,0.009,0.011,wood);     // the torch, in a fist
  return {torch:fpt(B,[tt[0],tt[1]+0.02,tt[2]])};
}
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
  if(form===5)return buildBaby(p,t,self);
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
/* ---------- the Brewer: ingredients, brewing, and 100 potions to drink or throw (data and recipes in src/potions.js) ---------- */
// Ingredients lie about every maze (placed from their own dice, so the rest of the floor never moves). The Brewer stands by the Keeper in
// every sanctuary and turns two of anything into a potion: two ingredients make tier 1, two tier-1 potions make tier 2, and so on to tier 4.
// Potions ride on a six-slot belt: drink one (H, pad Back, touch DRINK) or throw it (B, middle click, pad B, touch THROW).
// A thrown potion shatters where it lands. Everything the splash reaches gets the effect: players get the drink effect, monsters their own.
// Networking: the user sends {k:'pt'} and every client applies what lands on itself; the host (or a solo player) applies what lands on
// monsters, and streams the visible result (pv) with the creature positions.
const BELT_MAX=6,SPLASH=1.8,ING_N=INGREDIENTS.length,AUTO_BREW_COST=100;
// ingredients are kept from run to run (saved); potions on the belt are lost with the run
const POT={bag:(b=>Array.from({length:ING_N},(_,i)=>Math.max(0,Math.floor(+(Array.isArray(b)?b[i]:0)||0))))(store.get('brewBag',null)),belt:[],sel:0,ps:{},holdK:'',proj:[],zones:[],fx:[],hist:[],histT:0,book:new Set(store.get('brewBook',[]).filter(i=>potInfo(i))),k:1,m:1,pm:{},thick:0,aegis:0,hex:0,rotT:0,
  pnd:0,apo:null,stop:0,hicT:3,snzT:6,regT:15,fireT:0,stormT:0,plT:0,slv:null,hudK:'',dom:null,tapT:0};
const ps=k=>(POT.ps[k]||0)>0;
// psSet stretches a timed effect by the tier (POT.k) and remembers how strong it is (POT.m), so a tier-3 Quickstep is faster as well as longer
const psSet=(k,t)=>{t*=POT.k;POT.pm[k]=Math.max((POT.ps[k]||0)>0?POT.pm[k]||1:1,POT.m);POT.ps[k]=Math.max(POT.ps[k]||0,t)};
const pmag=k=>(POT.ps[k]||0)>0?POT.pm[k]||1:1;
const potMe=()=>MP.on?MP.id:'me';
const potSaveBag=()=>store.set('brewBag',POT.bag);
function potReset(run){
  if(run){POT.belt=[];POT.sel=0}
  POT.pm={};POT.thick=0;POT.aegis=0;POT.hex=0;POT.blurK='';
  POT.ps={};POT.holdK='';POT.proj=[];POT.zones=[];POT.fx=[];POT.hist=[];POT.apo=null;POT.stop=0;POT.pnd=0;POT.slv=null;
  canvas.style.filter='';
}
// ---- player status
const BAD=DEBUFF;   // what the Panacea keeps off you: every debuff
function potHold(k,t){
  if(k==='ice'&&ps('warm'))return;
  if(ps('berserk')&&k!=='sleep'&&k!=='dream')return;
  POT.holdK=k;psSet('hold',t);
}
const potHeld=()=>ps('hold');
const potSpeed=()=>(ps('quick')?1+0.3*pmag('quick'):1)*(ps('wind')?1+0.4*pmag('wind'):1)*(ps('qsilver')?1+0.5*pmag('qsilver'):1)*(ps('molasses')?1/(1+pmag('molasses')):1)*(ps('stoneskin')?0.8:1)*
  (ps('lead')?1/(1+0.43*pmag('lead')):1)*(ps('huge')||ps('wyrm')||ps('titan')?0.9:1)*(ps('tslow')?1/(1+pmag('tslow')):1)*(ps('godspeed')?1.3:1);
const potJump=()=>ps('lead')?0:ps('moon')?1.25:ps('wind')||ps('feather')||ps('pixie')?1.2:1;
const potGrav=()=>ps('moon')?0.22:ps('feather')||ps('pixie')?0.42:1;
const potEye=()=>ps('tiny')||ps('pixie')?0.45:ps('huge')||ps('wyrm')||ps('drake')||ps('titan')?1.25:1;
const potTorch=()=>(ps('glow')?1+0.7*pmag('glow'):1)*(ps('daybreak')?1.4:1)*(ps('lantern')?1.3:1)*(ps('cat')?1+0.5*pmag('cat'):1)*(ps('night')?0.3:1);
function potFlags(){
  const f=(k,b)=>ps(k)?b:0;
  return f('invis',1)|f('shadow',2)|f('loud',4)|f('hush',8)|f('wbane',16)|f('wlure',32)|f('repel',64)|f('banish',128)|f('mirror',256)|f('storm',512)|
    f('stare',1024)|f('medusa',2048)|f('decoy',4096)|(ps('huge')||ps('wyrm')||ps('drake')?16384:0)|(ps('fire')||ps('wyrm')?32768:0)|f('drake',65536)|f('ignored',131072);
}
// how far a monster notices this target, as a factor: 0 invisible, 0.5 in shadow ink, 2 loud...
const potSk=T=>{const f=T.pf|0;if(f&(1|131072))return 0;return (f&2?0.5:1)*(f&8?0.7:1)*(f&4?2:1)*(f&4096?3:1)};
function potHurt(s){   // true when a potion took the blow instead of you
  if(ps('phantom')&&Math.random()<0.5){if(s){s.stun=Math.max(s.stun,1);s.state=0}P.inv=0.8;say('It passes right through you',1.2);return true}
  if(POT.aegis>0&&ps('aegis')){POT.aegis--;P.inv=1.6;if(s){s.stun=Math.max(s.stun,2.5);s.state=0}sfx('seal');say('Aegis holds ('+POT.aegis+' left)',1.5);return true}
  if(POT.thick>0){POT.thick--;P.inv=1.6;P.chill=Math.max(P.chill,2);if(s){s.stun=Math.max(s.stun,2);s.state=0}sfx('drain');say('Your thick hide takes it: only a chill',1.6);return true}
  if(ps('invuln')||ps('hold')&&POT.holdK==='stone'){if(s){s.stun=Math.max(s.stun,2);s.state=0}sfx('seal');return true}
  if(s&&ps('mirror')){s.stun=6;s.state=0;s.calm=6;sfx('seal');say('Your mirror skin throws it back',1.6);P.inv=1;return true}
  if(s&&ps('banish')&&s.type===0){banish(s,false);say('Banished at a touch',1.6);return true}
  if(ps('stoneskin')){POT.ps.stoneskin=0;P.inv=1.6;if(s){s.stun=2.5;s.state=0;s.calm=6}sfx('seal');say('Your stone skin cracks, but holds',2);return true}
  return false;
}
function potDying(){   // P.hp just hit 0: a second life or the elixir keeps you up
  if(ps('undying')){P.hp=1;P.inv=1.5;return true}
  if(ps('life')){POT.ps.life=0;P.hp=maxHp();P.inv=3;say('Second Life: you come back, whole',3);sfx('shard');return true}
  return false;
}
function potCure(){
  for(const k of['hold','molasses','lead','slick','loud','fury','hic','sneeze','decoy','wlure','tslow','blur','weak','sap','night','rot','doom'])POT.ps[k]=0;POT.hex=0;
  for(const k of['pug','rat','plague','fat','loud','tin','pox','moon','bob','tickled','stag'])FX[k]=0;
  FX.dying=false;P.chill=0;P.woozy=0;P.fizz=0;
}

// ---- belt and bag
const beltCount=()=>POT.belt.reduce((a,b)=>a+b.n,0);
function beltAdd(id,n=1){
  const q=POT.belt.find(b=>b.id===id);if(q){q.n+=n;return true}
  POT.belt.push({id,n});return true;   // past the six hot-bar slots, potions wait in your bag (see the inventory)
}
function beltTake(i){
  const q=POT.belt[i];if(!q)return 0;const id=q.id;
  if(--q.n<=0){POT.belt.splice(i,1);if(i<POT.sel)POT.sel--;if(POT.sel>=Math.min(BELT_MAX,POT.belt.length))POT.sel=Math.max(0,Math.min(BELT_MAX,POT.belt.length)-1)}
  return id;
}
const canUse=()=>state==='play'&&!P.down&&!(P.ko>0)&&!webLocked()&&!P.away&&!loading&&!FX.frozen&&!P.grab;
function potDrink(i){
  if(i!==undefined&&i<BELT_MAX)POT.sel=i;const k=i!==undefined?i:POT.sel;
  if(!canUse())return;
  if(!POT.belt.length){say(nearPotHint(),2);return}
  if(potHeld()&&POT.holdK!=='sneeze'){say('You can\'t move to drink',1.2);return}
  const id=beltTake(k);if(!id)return;
  const p=potInfo(id);
  tone(300,0.12,'sine',0.1,0,-80);tone(260,0.12,'sine',0.1,0.15,-80);tone(220,0.16,'sine',0.1,0.3,-60);
  say('You drink the '+p.name+'. '+p.you,3.2);
  const m={k:'pt',d:R.depth,id,x:r3(P.x),z:r3(P.z),w:'d',by:potMe(),yaw:r3(P.yaw)};
  if(potParts(id).some(q=>PFX[q]&&PFX[q].A))mpSend(m);
  potLand(m,true);
}
const nearPotHint=()=>'No potions. The Brewer by the Keeper makes them from what you find in the maze.';
function potThrow(i){
  if(i!==undefined&&i<BELT_MAX)POT.sel=i;const k=i!==undefined?i:POT.sel;
  if(!canUse())return;
  if(!POT.belt.length){say(nearPotHint(),2);return}
  if(potHeld()){say('You can\'t move to throw',1.2);return}
  if(!POT.belt[k])return;const id=ps('arch')?POT.belt[k].id:beltTake(k);if(!id)return;
  const cp=Math.cos(P.pitch),sp=6.2,eyeY=playerEye();
  const q={id,x:P.x+Math.cos(P.yaw)*0.25,y:eyeY-0.1,z:P.z+Math.sin(P.yaw)*0.25,vx:Math.cos(P.yaw)*cp*sp+P.vx*0.5,vy:Math.sin(P.pitch)*sp+1.4,vz:Math.sin(P.yaw)*cp*sp+P.vz*0.5,t:0,mine:true,rot:0};
  if(solidAt(q.x,q.z)){q.x=P.x;q.z=P.z}
  POT.proj.push(q);noise(0.15,0.08,900,1);
  mpSend({k:'pth',d:R.depth,id,a:[r3(q.x),r3(q.y),r3(q.z),r3(q.vx),r3(q.vy),r3(q.vz)]});
}
function potProjTick(dt){
  for(let i=POT.proj.length-1;i>=0;i--){
    const q=POT.proj[i];q.t+=dt;q.rot+=dt*14;
    const n=3;let land=null;
    for(let k=0;k<n&&!land;k++){
      const h=dt/n,ox=q.x,oz=q.z;
      q.vy-=9*h;q.x+=q.vx*h;q.y+=q.vy*h;q.z+=q.vz*h;
      if(q.y>WALL_H-0.05){q.y=WALL_H-0.05;q.vy=-Math.abs(q.vy)*0.3}
      if(solidAt(q.x,q.z)){land=[ox,oz];break}
      if(q.y<=0.03){land=[q.x,q.z];break}
      if(q.mine&&q.t>0.08){
        for(const s of F.shades)if(s.x>0&&!s.dead&&q.y<1.0&&(s.x-q.x)**2+(s.z-q.z)**2<0.35*0.35){land=[q.x,q.z];break}
        if(!land&&MP.on)for(const p of MP.peers.values())if(p.d===R.depth&&mpDrawn(p)&&q.y<1.1&&(p.x-q.x)**2+(p.z-q.z)**2<0.3*0.3){land=[q.x,q.z];break}
      }
    }
    if(!land&&q.t>4)land=[q.x,q.z];
    if(land){
      POT.proj.splice(i,1);
      if(q.mine){
        potBurst(land[0],Math.max(0.05,Math.min(q.y,1)),land[1],hex3(potInfo(q.id).col));
        const m={k:'pt',d:R.depth,id:q.id,x:r3(land[0]),z:r3(land[1]),w:'t',by:potMe(),yaw:r3(P.yaw)};
        // the Swap Draught needs everyone to agree which creature it was
        if(potParts(q.id).includes(70)){let bi=-1,bd=SPLASH;F.shades.forEach((s,j)=>{if(s.x>0&&!s.dead&&s.type!==3){const d=Math.hypot(s.x-m.x,s.z-m.z);if(d<bd){bd=d;bi=j}}});m.si=bi;m.ux=r3(P.x);m.uz=r3(P.z)}
        mpSend(m);potLand(m,true);
      }
    }
  }
}
function potBurst(x,y,z,c,n=26,big=1){
  noise(0.35,0.16,2600,1.2);tone(1900+Math.random()*300,0.18,'triangle',0.05,0,-600);
  for(let i=0;i<n;i++){const a=Math.random()*6.283,u=Math.random()*2.2*big;
    POT.fx.push({x,y,z,vx:Math.cos(a)*u,vy:0.8+Math.random()*2.4*big,vz:Math.sin(a)*u,t:0,life:0.6+Math.random()*0.6,c,s:0.05+Math.random()*0.06})}
  POT.fx.push({x,y:0.06,z,ring:SPLASH*big,t:0,life:0.6,c});
}

// ---- landing: who gets what
const potMons=(x,z,r,sight)=>MP.guest||!F?[]:F.shades.filter(s=>s.x>0&&!s.dead&&s.type!==3&&!(s.type===6&&s.role!=='add')&&Math.hypot(s.x-x,s.z-z)<r&&(!sight||los(x,z,s.x,s.z)));
const meIn=(c,r,sight=true)=>!P.down&&!P.away&&!!F&&Math.hypot(P.x-c.x,P.z-c.z)<r&&(!sight||los(c.x,c.z,P.x,P.z));
const notUser=c=>!(c.drink&&c.mine);
const pe=(s,k,t)=>{t*=POT.k;s.pe=s.pe||{};const g=s.pmag||(s.pmag={});g[k]=Math.max(s.pe[k]>0?g[k]||1:1,POT.m);s.pe[k]=Math.max(s.pe[k]||0,t)};
const smag=(s,k)=>s.pe&&s.pe[k]>0&&s.pmag?s.pmag[k]||1:1;
const pk=s=>s.pk||(s.pk={});
const potParts=id=>{const p=potInfo(id);return !p?[]:p.mix?p.parts:[id]};
// a blend lands as each of its effects in turn, boosted (POT.k stretches every duration it sets)
function potLand(m,mine){
  const p=potInfo(m.id);if(!p||!F)return;
  if(!p.mix){POT.k=p.k;POT.m=p.m;try{potLand1(m,mine,false)}finally{POT.k=1;POT.m=1}return}
  if(!mine&&m.w!=='d')potBurst(m.x,0.1,m.z,hex3(p.col));
  for(const q of p.parts){POT.k=p.k;POT.m=p.m;try{potLand1(Object.assign({},m,{id:q}),mine,true)}finally{POT.k=1;POT.m=1}}
}
function potLand1(m,mine,quiet){
  const fx=PFX[m.id];if(!fx||!F)return;
  const c={id:m.id,x:m.x,z:m.z,by:m.by,mine,host:!MP.guest,drink:m.w==='d',yaw:m.yaw||0,m};
  if(m.rv||m.id===14&&!c.drink&&P.down&&MP.on){   // Smelling Salts get a fallen friend back on their feet, beside whoever used them
    if(P.down&&!mine){P.down=false;P.hp=1;P.inv=2.5;P.x=c.x;P.z=c.z;onTileChange();say('Smelling salts! You are back on your feet.',3);sfx('shard')}
    if(m.rv)return;
  }
  if(m.id===14&&!c.drink&&!mine&&P.ko>0&&Math.hypot(P.x-c.x,P.z-c.z)<SPLASH)koUp();   // and a downed one
  if(!mine&&!c.drink&&!quiet)potBurst(c.x,0.1,c.z,hex3(potInfo(m.id).col));
  if(c.drink&&!mine&&!fx.A)return;
  const you=()=>{if(BAD.has(m.id)&&ps('immune')){say('The Panacea keeps it off you',1.6);return}fx.u&&fx.u(c)};
  if(fx.A){if(c.drink&&mine&&!fx.Aonly)you();fx.A(c,you);if(c.drink&&mine)return;}
  else if(c.drink){if(mine)you();return}
  else{
    if(meIn(c,SPLASH))you();
    if(c.host)for(const s of potMons(c.x,c.z,SPLASH,true))fx.m&&fx.m(s,c);
    if(c.host&&F.boss)bossPotion(c);
  }
  if(mine&&fx.gems&&!c.drink)for(const s of F.shades)if(s.x>0&&!s.dead&&s.type!==3&&Math.hypot(s.x-c.x,s.z-c.z)<(fx.gr||SPLASH))potLoot(s.x,s.z,'gem',fx.gems);
}
// loot that only the user sees and picks up (never sent: its index is local)
function potLoot(x,z,type,n,ing){
  for(let i=0;i<n;i++){
    let tx=Math.floor(x),tz=Math.floor(z);
    for(let k=0;k<12;k++){const a=Math.random()*6.283,r=0.2+Math.random()*0.9,nx=Math.floor(x+Math.cos(a)*r),nz=Math.floor(z+Math.sin(a)*r);
      if(nx>0&&nz>0&&nx<F.W-1&&nz<F.H-1&&F.g[nz*F.W+nx]===0){tx=nx;tz=nz;break}}
    const ox=(Math.random()-0.5)*0.5,oz=(Math.random()-0.5)*0.5;
    F.items.push({type,ing,tx,ty:tz,x:tx+0.5+ox,z:tz+0.5+oz,got:false,ph:Math.random()*6.28,loc:true});
  }
}
// put a monster on the nearest open floor to (x,z)
function potPlace(s,x,z){
  const W=F.W;let bx=-1,bz=-1,bd=1e9;
  const cx=Math.floor(x),cz=Math.floor(z);
  for(let r=0;r<6&&bx<0;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
    const nx=cx+dx,nz=cz+dz;if(nx<1||nz<1||nx>=W-1||nz>=F.H-1)continue;const i=nz*W+nx;
    if(F.g[i]||F.safeMask[i]||F.pocketMask[i])continue;const d=Math.hypot(nx+0.5-x,nz+0.5-z);if(d<bd){bd=d;bx=nx;bz=nz}}
  if(bx<0)return;
  const ins=bd<0.71;s.x=ins?Math.min(bx+0.95,Math.max(bx+0.05,x)):bx+0.5;s.z=ins?Math.min(bz+0.95,Math.max(bz+0.05,z)):bz+0.5;s.gx=bx;s.gy=bz;s.px=-1;s.ag=null;
}
function potFar(s,minD){   // somewhere well away from everyone
  const MD=mpDist(mpTargets());
  for(let tries=0;tries<80;tries++){
    const rx=1+(Math.random()*(F.W-2)|0),ry=1+(Math.random()*(F.H-2)|0),i=ry*F.W+rx;
    if(F.g[i]===0&&!F.safeMask[i]&&!F.pocketMask[i]&&!inArchiveAlcove(rx+0.5,ry+0.5)&&(MD[i]>minD||tries>60&&MD[i]>4)){potPlace(s,rx+0.5,ry+0.5);return}
  }
}
function potKill(s,quiet){s.dead=true;banish(s,quiet);s.pe=null}
function potBanish(s){if(s.pe&&s.pe.nob>0){s.stun=Math.max(s.stun,3);return}if(s.type===0||s.type===3)banish(s,false);else{s.stun=Math.max(s.stun,8);potFar(s,12)}}
// a player in the radius is pushed away from the middle (shockwaves, the black hole)
function potShove(c,r,k,up){
  if(!meIn(c,r,false)||!notUser(c))return;
  const dx=P.x-c.x,dz=P.z-c.z,d=Math.hypot(dx,dz)||1;
  P.vx+=dx/d*k;P.vz+=dz/d*k;if(up){P.vy=up;P.y=Math.max(P.y,0.001)}
  POT.slv={vx:dx/d*k,vz:dz/d*k,t:0.5};
}
// ---- what each potion does. u: to a player it lands on (or who drinks it). m: to a monster in the splash (run by the host).
// A: an area potion (replaces the plain splash; c.drink when it was drunk, notUser(c) leaves the drinker out). gems: the user's loot per monster.
const mHold=(s,k,t)=>{if(k==='ice'&&s.pe&&s.pe.warm)return;pe(s,k,t);s.state=0};
const potZone=(k,c,r,t,o)=>{t*=POT.k;POT.zones.push(Object.assign({k,x:c.x,z:c.z,r,t,T:t,by:c.by,id:c.id},o||{}))};
const youHold=(k,t,msg)=>{potHold(k,t);if(msg)say(msg,2)};
function potRandom(c,list){   // Chaos Draught: a random tier 1-2 effect on everything in reach
  const pool=[];for(let i=1;i<=70;i++)if(i!==40&&i!==60&&i!==70&&i!==38&&PFX[i]&&!PFX[i].A)pool.push(i);
  if(meIn(c,8))({...PFX[pool[(Math.random()*pool.length)|0]]}).u?.(c);
  for(const s of list)PFX[pool[(Math.random()*pool.length)|0]].m?.(s,c);
}
function potRewind(){
  const h=POT.hist.find(q=>R.time-q.t>=9.5)||POT.hist[POT.hist.length-1];
  if(!h){say('Nothing to rewind to',1.5);return}
  P.x=h.x;P.z=h.z;P.hp=Math.max(P.hp,h.hp);P.fuel=Math.max(P.fuel,h.fuel);P.vx=P.vz=0;onTileChange();
  sfx('noclip');say('Ten seconds back',2);
}
function potToSanctuary(){
  const s=F.safe;if(s){P.x=s.x+0.55;P.z=s.z-0.05}else{P.x=F.start.tx+0.5;P.z=F.start.ty+0.5}
  P.vx=P.vz=0;P.y=0;onTileChange();sfx('noclip');
}
function potBlink(d){
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);let k=0;
  for(let s=0.1;s<=d;s+=0.1){if(blocked(P.x+fx*s,P.z+fz*s))break;k=s}
  P.x+=fx*k;P.z+=fz*k;onTileChange();sfx('noclip');
}
const PFX={
  1:{u:()=>{P.hp=Math.min(maxHp(),P.hp+Math.max(1,Math.round(POT.m)));sfx('pick')},m:s=>{s.stun=0}},
  2:{u:()=>{P.fuel=100;lowFuelSaid=false;sfx('oil')},m:(s)=>{if(s.type===2){potFar(s,10);s.stun=2;pe(s,'calm',20)}else pe(s,'glow',40)}},
  3:{u:()=>psSet('quick',45),m:s=>pe(s,'fast',30)},
  4:{u:()=>psSet('molasses',20),m:s=>pe(s,'slow',20)},
  5:{u:()=>youHold('ice',3,'Frozen solid!'),m:s=>mHold(s,'ice',6)},
  6:{u:()=>{if(P.ward){P.ward=0;say('The flames eat your ward stone',2)}else{P.inv=0;hurt(null)}},m:s=>{pe(s,'burn',4)}},
  7:{u:()=>psSet('glow',60),m:s=>pe(s,'glow',60)},
  8:{u:()=>psSet('shadow',45),m:s=>pe(s,'invis',30)},
  9:{u:()=>psSet('feather',45),m:s=>pe(s,'drift',25)},
  10:{u:()=>psSet('lead',25),m:s=>{if(s.type===2)mHold(s,'stuck',10);else pe(s,'heavy',30)}},
  11:{u:()=>youHold('web',3,'Webbed!'),m:s=>mHold(s,'web',8)},
  12:{u:()=>psSet('slick',25),m:s=>{pe(s,'fast',15);pe(s,'lost',15)}},
  13:{u:()=>youHold('sleep',4,'So... sleepy...'),m:s=>mHold(s,'sleep',12)},
  14:{u:c=>{POT.ps.hold=0;POT.ps.molasses=0;P.chill=0;if(c.drink&&MP.on)mpSend({k:'pt',d:R.depth,id:14,x:r3(P.x),z:r3(P.z),w:'t',by:potMe(),rv:1})},
      m:(s,c)=>{for(const k of['sleep','dream','ice','web','stuck'])if(s.pe)delete s.pe[k];s.stun=0;s.calm=0;s.state=1;pe(s,'fast',10)}},
  15:{u:()=>psSet('calm',60),m:s=>pe(s,'calm',15)},
  16:{u:()=>psSet('fury',20),m:s=>{pe(s,'frenzy',20);s.state=1;s.calm=0}},
  17:{u:()=>psSet('tiny',60),m:s=>pe(s,'tiny',30)},
  18:{u:()=>psSet('huge',60),m:s=>pe(s,'huge',30)},
  19:{u:()=>{FX.pug=60;FX.last='pug'},m:s=>pe(s,'pug',60)},
  20:{u:()=>{FX.rat=60;FX.last='rat'},m:s=>{pe(s,'rat',60)}},
  21:{u:()=>psSet('invis',20),m:s=>pe(s,'invis',30)},
  22:{u:()=>psSet('xray',30),m:s=>pe(s,'reveal',60)},
  23:{u:()=>psSet('hush',60),m:s=>pe(s,'hush',60)},
  24:{u:()=>psSet('loud',30),m:s=>pe(s,'loud',30)},
  25:{u:()=>psSet('stoneskin',90),m:s=>mHold(s,'stone',10)},
  26:{u:()=>psSet('stare',30),m:s=>pe(s,'stare',30)},
  27:{u:()=>psSet('wbane',60),m:s=>{if(s.type===2)potKill(s,false);else pe(s,'harm',30)}},
  28:{u:()=>psSet('wlure',30),m:s=>pe(s,'wlure',30)},
  29:{u:()=>psSet('decoy',30),m:s=>pe(s,'decoy',20)},
  30:{u:()=>psSet('repel',30),m:s=>pe(s,'repel',30)},
  31:{u:()=>webClear(),m:s=>pe(s,'unsilk',20)},   // Web-Be-Gone
  32:{u:()=>psSet('sneeze',30),m:s=>pe(s,'sneeze',30)},
  33:{u:()=>psSet('bouncy',60),m:s=>{pe(s,'fast',15);pe(s,'lost',15)}},
  34:{u:()=>psSet('magnet',30),A:(c)=>{
      if(c.drink)return;
      if(meIn(c,SPLASH))psSet('magnet',30);
      for(const s of potMons(c.x,c.z,6,false)){pe(s,'clump',3);Object.assign(pk(s),{cx:c.x,cz:c.z})}}},
  35:{u:()=>psSet('gems',120),m:s=>{s.stun=Math.max(s.stun,4)},gems:3},
  36:{u:()=>psSet('warm',120),m:s=>{pe(s,'warm',120);if(s.pe.ice)delete s.pe.ice}},
  37:{u:()=>{for(let y=-8;y<=8;y++)for(let x=-8;x<=8;x++){const tx=P.tx+x,ty=P.ty+y;if(tx>=0&&ty>=0&&tx<F.W&&ty<F.H&&x*x+y*y<=64)F.seen[ty*F.W+tx]=1}psSet('xray',6);tone(1400,0.4,'sine',0.08);tone(1400,0.4,'sine',0.04,0.4)},m:s=>pe(s,'lost',20)},
  38:{u:()=>potBlink(4*POT.m),m:(s,c)=>{const dx=s.x-c.x,dz=s.z-c.z,d=Math.hypot(dx,dz)||1,k=4*POT.m;potPlace(s,s.x+dx/d*k,s.z+dz/d*k)}},
  39:{u:()=>{if(P.ward){P.ward=0;say('Your ward stone crumbles to sand',2)}},m:s=>pe(s,'weak',60)},
  40:{u:()=>{say('It tastes of nothing much.',1.5)},m:s=>pe(s,'sludge',15)},
  // ---- tier 2
  41:{u:()=>psSet('wind',45),m:s=>{pe(s,'zip',15);pe(s,'lost',15)}},
  42:{u:()=>{youHold('ice',6,'Frozen to the bone!');psSet('molasses',14)},m:s=>{mHold(s,'ice',15);pe(s,'dfz',15)}},
  43:{u:()=>psSet('fire',20),m:s=>{pe(s,'burn',6);pe(s,'fireaura',6)}},
  44:{u:()=>{psSet('daybreak',45);psSet('repel',45)},m:s=>{pe(s,'glow',30);s.stun=Math.max(s.stun,3);for(const o of potMons(s.x,s.z,3,true))if(o.type===0)o.stun=Math.max(o.stun,5)}},
  45:{u:()=>psSet('invis',30),m:s=>{pe(s,'invis',30);pe(s,'lost',30)}},
  46:{u:()=>{youHold('sleep',6,'A deep, dreamless sleep...');POT.wake='heal'},m:s=>mHold(s,'sleep',30)},
  47:{u:()=>{psSet('berserk',30);POT.ps.hold=0},m:s=>{pe(s,'berserk',20);s.calm=0}},
  48:{u:()=>{psSet('regen',120);POT.regT=15},m:s=>pe(s,'rec',60)},
  49:{u:()=>youHold('stone',10,'Gargoyle skin: nothing can hurt you, and you cannot move'),m:s=>mHold(s,'stone',30)},
  50:{u:()=>psSet('medusa',30),m:s=>{for(const o of potMons(s.x,s.z,4,true))mHold(o,'stone',10)}},
  51:{u:()=>psSet('huge',60),m:s=>{pe(s,'huge',20);mHold(s,'stuck',20)}},
  52:{u:()=>{psSet('pixie',60);psSet('tiny',60)},m:s=>{pe(s,'tiny',30);pe(s,'drift',30)}},
  53:{u:()=>{FX.pug=60;FX.last='pug';psSet('ignored',60)},m:(s,c)=>{pe(s,'pug',60);pe(s,'pet',60);pk(s).own=c.by}},
  54:{u:()=>{FX.plague=60;FX.dying=false},m:s=>{pe(s,'plague',45)}},
  55:{u:()=>{psSet('invis',30);psSet('hush',30)},m:s=>pe(s,'ghost',30)},
  56:{A:(c)=>{
      potBurst(c.x,0.5,c.z,[1,1,0.4],40,2);tone(60,0.9,'sawtooth',0.3,0,-30);noise(0.8,0.5,200,0.6);pkShake=Math.max(pkShake,0.6);
      potShove(c,4,6,2);
      for(const s of potMons(c.x,c.z,4,false)){const dx=s.x-c.x,dz=s.z-c.z,d=Math.hypot(dx,dz)||1;potPlace(s,s.x+dx/d*2,s.z+dz/d*2);s.stun=Math.max(s.stun,3);s.state=0}}},
  57:{A:(c)=>{potZone('web',c,2,10)}},
  58:{u:()=>psSet('banish',30),m:s=>potBanish(s)},
  59:{A:(c)=>{
      if(c.drink){for(const s of potMons(c.x,c.z,12,false)){pe(s,'pet',20);pk(s).own=c.by}return}
      const L=potMons(c.x,c.z,SPLASH,true);if(meIn(c,SPLASH))psSet('decoy',20);
      if(!L.length)return;const ld=L[0];pe(ld,'lead',20);pe(ld,'harm',20);
      for(const s of potMons(ld.x,ld.z,10,false))if(s!==ld){pe(s,'follow',20);pk(s).ldr=F.shades.indexOf(ld)}}},
  60:{u:()=>{potToSanctuary();say('Back in the sanctuary',2)},m:s=>potFar(s,15)},
  61:{u:()=>{F.seen.fill(1);psSet('xray',40);psSet('allmon',40)},m:s=>pe(s,'reveal',120)},
  62:{u:()=>{psSet('midas',60);psSet('magnet',60)},m:s=>mHold(s,'gold',15),gems:4},
  63:{u:()=>{if(P.ward){P.ward=0;say('Your ward stone dissolves',2)}POT.ps.stoneskin=0},m:s=>pe(s,'weak3',60)},
  64:{u:()=>psSet('lantern',120),m:(s,c)=>{if(s.type===2){pe(s,'pet',120);pe(s,'calm',120);pk(s).own=c.by}else pe(s,'glow',30)}},
  65:{u:()=>{FX.hedge=60;setTimeout(()=>say(touch.on?'A hedgehog! CURL: nothing can hurt you. ROLL: super speed.':'A hedgehog! Hold Z to curl up, X to roll.',4),1500)},m:s=>pe(s,'spines',30)},
  66:{u:()=>psSet('moon',30),m:s=>mHold(s,'float',10)},
  67:{A:(c)=>{
      if(c.drink){for(const s of potMons(c.x,c.z,6,false))pe(s,'tslow',20);if(c.mine)psSet('syrup',20);return}
      if(meIn(c,SPLASH))psSet('tslow',15);
      for(const s of potMons(c.x,c.z,SPLASH,true))pe(s,'tslow',30)}},
  68:{u:()=>psSet('mirror',30),m:s=>pe(s,'mirror',30)},
  69:{u:()=>psSet('hearth',120),m:s=>pe(s,'harm',60)},
  70:{A:(c)=>{
      const m=c.m;
      if(c.drink){   // swap with the nearest creature
        let best=null,bd=10;for(const s of F.shades)if(s.x>0&&!s.dead&&s.type!==3){const d=Math.hypot(s.x-P.x,s.z-P.z);if(d<bd&&los(P.x,P.z,s.x,s.z)){bd=d;best=s}}
        if(!c.mine)return;
        if(!best){say('Nothing near enough to swap with',2);return}
        const i=F.shades.indexOf(best),bx=best.x,bz=best.z;
        mpSend({k:'pt',d:R.depth,id:70,x:r3(bx),z:r3(bz),w:'t',by:potMe(),si:i,ux:r3(P.x),uz:r3(P.z),sw:1});
        if(!MP.guest)potPlace(best,P.x,P.z);
        P.x=bx;P.z=bz;onTileChange();sfx('noclip');return;
      }
      const s=F.shades[m.si];
      if(c.mine&&s&&s.x>0&&m.ux!=null&&!m.sw){P.x=s.x;P.z=s.z;onTileChange();sfx('noclip')}
      if(c.host&&s&&s.x>0&&m.ux!=null)potPlace(s,+m.ux,+m.uz);}},
  // ---- tier 3
  71:{A:(c)=>{
      if(c.drink){if(c.mine)psSet('storm',30);return}
      tone(120,0.5,'sawtooth',0.2,0,800);noise(0.5,0.4,4000,1);
      const L=potMons(c.x,c.z,8,true);for(const s of L){s.stun=Math.max(s.stun,6);s.state=0;POT.fx.push({bolt:[c.x,c.z,s.x,s.z],t:0,life:0.5})}
      if(meIn(c,3))youHold('ice',1,'Zap!')}},
  72:{A:(c)=>{
      potBurst(c.x,0.4,c.z,[0.75,0.95,1],50,3.3);tone(2400,1.2,'sine',0.12,0,-2000);
      if(meIn(c,6,false)&&notUser(c))youHold('ice',ps('warm')?0:20,ps('warm')?'':'Absolute zero!');
      for(const s of potMons(c.x,c.z,6,false))mHold(s,'ice',20)}},
  73:{A:(c)=>{
      flashT=1;potBurst(c.x,0.6,c.z,[1,0.97,0.75],60,4);sfx('flash');
      for(const s of F.shades){if(s.x<0||s.dead||Math.hypot(s.x-c.x,s.z-c.z)>14||!los(c.x,c.z,s.x,s.z))continue;
        if(s.type===3)banish(s,true);else if(c.host){if(s.type===0)potBanish(s);else{s.stun=Math.max(s.stun,6);s.state=0}}}}},
  74:{u:()=>{psSet('phase',10);say('You can walk through walls. Mind where you are when it ends.',3)},m:s=>potKill(s,false)},
  75:{u:()=>{psSet('wyrm',45);say('You are a drake! Fire pours from your jaws.',3)},m:s=>pe(s,'dragon',30)},
  76:{A:(c)=>{for(const s of potMons(c.x,c.z,14,true))mHold(s,'stone',45);potBurst(c.x,0.5,c.z,[0.6,0.6,0.55],40,3)}},
  77:{A:(c)=>{const L=potMons(c.x,c.z,14,false).sort((a,b)=>Math.hypot(a.x-c.x,a.z-c.z)-Math.hypot(b.x-c.x,b.z-c.z)).slice(0,3);
      for(const s of L){pe(s,'pet',120);pk(s).own=c.by;s.stun=0}}},
  78:{A:(c)=>{potZone('plague',c,2.5,20)}},
  79:{u:()=>potRewind(),m:s=>{const h=s.hist&&s.hist[0];if(h)potPlace(s,h[0],h[1])}},
  80:{u:()=>{youHold('dream',8,'You dream of the whole floor...');psSet('invuln',8);F.seen.fill(1);psSet('allmon',20)},m:s=>mHold(s,'dream',60)},
  81:{A:(c)=>{potZone('fort',c,1.7,30)}},
  82:{A:(c)=>{potZone('hole',c,6,4)}},
  83:{A:(c)=>{const k=c.drink?1.4:0;potZone('hedge',{x:c.x+Math.cos(c.yaw)*k,z:c.z+Math.sin(c.yaw)*k,by:c.by,id:83},1.2,30)}},
  84:{A:(c)=>{
      if(c.drink&&c.mine){psSet('repel',60);psSet('lantern',120)}
      for(const s of potMons(c.x,c.z,1e4,false))if(s.type===2){pe(s,'pet',120);pe(s,'calm',120);pk(s).own=c.by}}},
  85:{u:()=>{},A:(c)=>{const k=c.drink?1.2:0;potZone('portal',{x:c.x+Math.cos(c.yaw)*k,z:c.z+Math.sin(c.yaw)*k,by:c.by,id:85},0.55,20)},Aonly:true},
  86:{A:(c)=>{
      potBurst(c.x,0.3,c.z,[0.85,0.85,1],40,3);tone(80,1,'sine',0.3,0,-40);
      if(meIn(c,6,false)&&notUser(c)){P.vy=5.5;P.y=Math.max(P.y,0.001);POT.slam=1}
      for(const s of potMons(c.x,c.z,6,false)){mHold(s,'float',1.2);s.stun=Math.max(s.stun,5)}}},
  87:{u:()=>{psSet('gold3',90);psSet('hearth',90);psSet('magnet',90);P.fuel=100},m:s=>mHold(s,'gold',20),gems:5},
  88:{u:()=>{F.seen.fill(1);F.reveal=true;psSet('allmon',9999);psSet('xray',60)},m:s=>pe(s,'reveal',9999)},
  89:{u:()=>{psSet('life',9999);say('Second Life: if you fall on this floor, you come back',3)},m:s=>pe(s,'nob',60)},
  90:{A:(c)=>{potBurst(c.x,0.5,c.z,[1,0.3,1],50,4);potRandom(c,potMons(c.x,c.z,8,false))},Aonly:true},
  // ---- tier 4
  91:{A:(c)=>{
      flashT=0.7;potBurst(c.x,0.5,c.z,[1,0.85,0.3],60,4);sfx('shard');
      const L=F.shades.filter(s=>s.x>0&&!s.dead&&s.type!==3&&Math.hypot(s.x-c.x,s.z-c.z)<14&&los(c.x,c.z,s.x,s.z));
      if(c.mine)for(const s of L)potLoot(s.x,s.z,'gem',3);
      if(c.host)for(const s of L){mHold(s,'gold',1.5);pk(s).gone=1}},Aonly:true},
  92:{u:()=>{R.hpBonus=(R.hpBonus|0)+1;P.hp=maxHp();psSet('undying',60);psSet('invuln',3);sfx('shard');say('Elixir of Life: +1 heart for this run, and you cannot die for a minute',3.5)},m:s=>{s.pe=null;pe(s,'nob',120)}},
  93:{A:(c)=>{
      flashT=1;potBurst(c.x,0.5,c.z,[1,0.1,0.05],70,5);tone(40,3,'sawtooth',0.4,0,-15);noise(2.5,0.6,150,0.5);pkShake=1;
      say('Apocalypse. The floor is burning.',4);
      if(!P.down&&!P.away)setTimeout(()=>{if(state==='play'&&!P.down){P.inv=0;hurt(null)}},600);
      if(c.host)POT.apo={t:0,n:0,T:20}},Aonly:true},
  94:{u:()=>psSet('arch',60),m:s=>{s.stun=Math.max(s.stun,20);s.state=0}},
  95:{A:(c)=>{POT.stop=10;say('Time stops.',2.5);tone(900,1.5,'sine',0.12,0,-850)},Aonly:true},
  96:{u:()=>{psSet('drake',60);psSet('wyrm',60);say('Dragon Ascension! Your fire burns shades away.',3)},m:s=>potKill(s,false)},
  97:{A:(c)=>{if(c.mine&&state==='play'){mpSend({k:'down',d:R.depth+1});descend(1,'The World Key turns')}},Aonly:true},
  98:{A:(c)=>{if(c.mine){POT.pnd=3;say('Pandemonium! The wheel spins itself. Three times.',3.5)}},Aonly:true},
  99:{u:()=>{potCure();psSet('immune',180);POT.ps.hold=0;sfx('shard')},m:s=>{s.pe=null;s.stun=0}},
  100:{A:(c)=>{say('The Lord of the Deep: every monster on the floor answers to '+(c.mine?'you':'them'),3);
      for(const s of potMons(c.x,c.z,1e4,false)){pe(s,'pet',120);pk(s).own=c.by;s.stun=0}},Aonly:true},
  // ---- more buffs
  101:{u:()=>psSet('lungs',45),m:s=>pe(s,'fast',20)},
  102:{u:()=>psSet('cat',60),m:s=>pe(s,'keen',30)},
  103:{u:()=>psSet('lucky',90),m:s=>pe(s,'dodge',20)},
  104:{u:()=>{POT.thick=Math.max(POT.thick,Math.round(2*POT.m));say('Thick Hide: the next '+POT.thick+' wounds will only chill you',2.5)},m:s=>pe(s,'tough',30)},
  105:{u:()=>psSet('qsilver',40),m:s=>pe(s,'zip',20)},
  106:{u:()=>{P.hp=Math.min(maxHp(),P.hp+Math.round(2*POT.m));psSet('bwine',60);POT.regT=10;sfx('pick')},m:s=>{s.hp=s.hpMax||s.hp;s.bleed=s.burnD=null}},
  107:{u:()=>{psSet('hawk',60);psSet('xray',60)},m:s=>pe(s,'keen',30)},
  108:{u:()=>{psSet('titan',60);P.hp=Math.min(maxHp(),P.hp+1);say('Titan\'s Draught: +1 heart while it lasts',2.5)},m:s=>{pe(s,'huge',60);if(s.hpMax>0){s.hpMax*=2;s.hp*=2}else{s.hpMax=wMaxHp(s)*2;s.hp=s.hpMax}}},
  109:{u:()=>{psSet('aegis',120);POT.aegis=Math.max(POT.aegis,Math.round(3*POT.m/TIER_M[3]))},m:s=>pe(s,'steady',30)},
  110:{u:()=>psSet('phantom',60),m:s=>pe(s,'dodge',30)},
  111:{u:()=>{P.hp=maxHp();for(const [k,t] of[['qsilver',180],['glow',180],['bwine',180],['ambro',180]])psSet(k,t);POT.aegis=Math.max(POT.aegis,2);psSet('aegis',180);P.fuel=100;sfx('shard')},
      m:s=>{pe(s,'zip',30);pe(s,'tough',30);if(s.hpMax>0)s.hp=s.hpMax}},
  112:{A:(c)=>{
      if(c.drink){if(c.mine)psSet('godspeed',30);for(const s of potMons(c.x,c.z,1e4,false))pe(s,'tslow',30);say('Godspeed: the whole floor slows to a crawl',2.5)}
      else{for(const s of potMons(c.x,c.z,SPLASH,true))pe(s,'zip',30);if(meIn(c,SPLASH))psSet('godspeed',30)}}},
  // ---- more debuffs (drink them and suffer; throw them and the monster suffers)
  113:{u:()=>psSet('blur',20),m:s=>{pe(s,'lost',20);pe(s,'slow',20)}},
  114:{u:()=>{const o=POT.belt.map((b,i)=>i).filter(i=>i!==POT.sel);if(o.length){const i=o[(Math.random()*o.length)|0],nm=potInfo(POT.belt[i].id).name;beltTake(i);say('Butterfingers! You drop your '+nm,2.5);sfx('spike')}else say('Butterfingers! Luckily you had nothing else to drop',2)},
      m:(s,c)=>{s.stun=Math.max(s.stun,3);if(c.mine)potLoot(s.x,s.z,'gem',1)}},
  115:{u:()=>psSet('weak',30),m:s=>{pe(s,'vuln',20);pk(s).vm=Math.max(pk(s).vm||0,2)}},
  116:{u:()=>psSet('sap',25),m:s=>pe(s,'exhaust',25)},
  117:{u:()=>{POT.hex=Math.max(POT.hex,1);say('Hexed! Your next wound will cost two hearts',2.5)},m:s=>{pe(s,'vuln',20);pk(s).vm=Math.max(pk(s).vm||0,2.5)}},
  118:{u:()=>{youHold('web',4,'Vines wrap your legs!');psSet('molasses',10)},m:s=>{mHold(s,'web',10);pe(s,'slow',20)}},
  119:{u:()=>psSet('night',15),m:s=>pe(s,'fear',15)},
  120:{u:()=>{psSet('rot',30);POT.rotT=10},m:s=>{s.bleed={dps:1*POT.m,t:15*POT.k}}},
  121:{u:()=>{youHold('ice',5,'A grave chill freezes you');psSet('molasses',15)},m:s=>{mHold(s,'ice',20);pe(s,'vuln',20);pk(s).vm=Math.max(pk(s).vm||0,4)}},
  122:{u:()=>{FX.moon=Math.max(FX.moon,30*POT.k);P.woozy=Math.max(P.woozy||0,30*POT.k)},m:s=>{pe(s,'berserk',30);s.calm=0}},
  123:{A:(c)=>{
      if(c.drink){if(c.mine){F.seen.fill(0);psSet('night',20);say('Oblivion: you forget everything you have seen',3)}return}
      potBurst(c.x,0.5,c.z,[0.1,0.1,0.15],50,3);tone(50,1.5,'sine',0.25,0,-20);
      for(const s of potMons(c.x,c.z,8,false))potKill(s,false);
      for(const s of F.shades)if(s.type===3&&s.x>0&&Math.hypot(s.x-c.x,s.z-c.z)<8)banish(s,true);
      if(meIn(c,SPLASH))psSet('night',20)}},
  124:{A:(c)=>{
      if(c.drink){if(c.mine){psSet('doom',30);psSet('decoy',30);say('Doomed! Everything on the floor is coming for you',3)}return}
      potBurst(c.x,0.4,c.z,[0.4,0,0.05],50,3.5);tone(70,1.2,'sawtooth',0.2,0,-30);
      for(const s of potMons(c.x,c.z,10,false)){s.bleed={dps:3*POT.m/TIER_M[4],t:10*POT.k/TIER_K[4]};pe(s,'slow',10/TIER_K[4])}
      if(meIn(c,SPLASH))psSet('doom',30)}},
};
// ---- monsters under a potion (host only). Returns true when the potion moved this creature this frame (the usual hunt is skipped).
const PM_HOLD=['ice','web','sleep','dream','stone','gold','stuck','float'];
const potHarmless=s=>{const e=s.pe;return !!e&&!!(e.pug||e.rat||e.plague||e.ghost||e.pet||e.harm||e.lead||e.drift&&e.tiny)};
const potOwner=id=>{if(id===potMe())return P.down||P.away?null:P;const p=MP.peers.get(id);return p&&p.d===R.depth&&mpDrawn(p)?p:null};
function potAway(s,dt,sp,fx,fz){
  if(!s.ag||Math.hypot(s.ag[0]-s.x,s.ag[1]-s.z)<0.05){
    const cx=Math.floor(s.x),cz=Math.floor(s.z);let best=null,bd=-1;
    for(const k of DIRS){const nx=cx+k[0],nz=cz+k[1];if(nx<0||nz<0||nx>=F.W||nz>=F.H)continue;const i=nz*F.W+nx;if(F.g[i]||F.safeMask[i]||F.pocketMask[i])continue;
      const d=Math.hypot(nx+0.5-fx,nz+0.5-fz)+Math.random()*0.4;if(d>bd){bd=d;best=[nx+0.5,nz+0.5]}}
    s.ag=best||[cx+0.5,cz+0.5];
  }
  const dx=s.ag[0]-s.x,dz=s.ag[1]-s.z,l=Math.hypot(dx,dz)||1,st=Math.min(l,sp*dt);
  s.x+=dx/l*st;s.z+=dz/l*st;s.face=Math.atan2(dz,dx);
}
function potGo(s,x,z,dt,sp){mazeStep(s,x,z,dt,sp);s.face=s.yaw;s.ag=null}
function potMon(s,dt,TG,MD){
  if(s.pst===undefined)s.pst=0;
  // keep ten seconds of where it has been, for the Hourglass
  s.htT=(s.htT||0)-dt;if(s.htT<=0){s.htT=1;(s.hist||(s.hist=[])).push([s.x,s.z]);if(s.hist.length>11)s.hist.shift()}
  const e=s.pe;
  if(POT.stop>0){s.pv=e?potPv(s):0;s.pst=s.stun;return true}
  if(!e){s.pmul=s.stared||1;s.stared=0;s.pv=0;s.pst=Math.max(0,s.stun-dt);return false}
  for(const k in e){e[k]-=dt;if(e[k]<=0){delete e[k];
    if(k==='burn')s.stun=Math.max(s.stun,3);
    if(k==='sick'){potKill(s,Math.hypot(s.x-P.x,s.z-P.z)>10);return true}
    if(k==='gold'&&s.pk&&s.pk.gone){s.pk.gone=0;potBanish(s);s.pe=null;return true}}}
  const pkk=s.pk||{};
  // a stun that just landed lasts longer on a corroded creature and shorter on a regenerating one
  if(s.stun>s.pst+0.05){const k=(e.weak3?3:e.weak?2:1)*(e.rec?0.5:1);if(k!==1)s.stun=s.pst+(s.stun-s.pst)*k}
  s.pst=Math.max(0,s.stun-dt);
  s.pmul=(e.slow?1/(1+smag(s,'slow')):1)*(e.heavy?1/(1+0.67*smag(s,'heavy')):1)*(e.tslow?1/(1+1.5*smag(s,'tslow')):1)*(e.tiny?0.5:1)*(e.huge?0.7:1)*(e.fast?1+0.3*smag(s,'fast'):1)*(e.frenzy?1+0.4*smag(s,'frenzy'):1)*(e.zip?1+0.5*smag(s,'zip'):1)*(e.sludge?0.85:1)*(e.drift?0.7:1)*
    (e.exhaust?(Math.sin(R.time*2.5+s.ph)>0?1:0.1):1)*(e.hic?(Math.sin(R.time*5+s.ph)>0.2?1.6:0.15):1)*(s.stared||1);s.stared=0;
  s.pv=potPv(s);
  if(e.lost||e.calm||e.lead||e.drift&&e.tiny)s.calm=Math.max(s.calm||0,0.4);
  if(e.frenzy){s.state=1;s.calm=0}
  if(e.sick===undefined&&e.plague)for(const o of F.shades)if(o!==s&&o.x>0&&!o.dead&&o.type!==3&&!(o.pe&&o.pe.sick)&&Math.hypot(o.x-s.x,o.z-s.z)<1.4)pe(o,'sick',8);
  if(e.fireaura)for(const o of F.shades)if(o!==s&&o.x>0&&!o.dead&&o.type!==3&&Math.hypot(o.x-s.x,o.z-s.z)<0.8)o.stun=Math.max(o.stun,3);
  if(e.dfz&&e.burn){potKill(s,false);return true}   // fire shatters a deep freeze for good
  for(const k of PM_HOLD)if(e[k]){s.state=0;return true}
  if(e.sneeze>0){s.snz=(s.snz||3)-dt;if(s.snz<=0){s.snz=3+Math.random()*4;s.snzH=0.7;if(Math.hypot(s.x-P.x,s.z-P.z)<12)noise(0.25,0.15,1800,1.5)}if(s.snzH>0){s.snzH-=dt;return true}}
  if(e.stare&&mpWatched(TG,s))return true;
  if(e.steady)s.stun=0;
  if(e.keen){s.state=1;s.calm=0}
  if(s.stun>0)return false;
  if(e.fear){const T=mpNearest(TG,s.x,s.z);if(T&&Math.hypot(T.x-s.x,T.z-s.z)<14){potAway(s,dt,3,T.x,T.z);return true}}
  const ph=(r)=>{const T=mpNearest(TG,s.x,s.z);return T&&Math.hypot(T.x-s.x,T.z-s.z)<r?T:null};
  if(e.burn){const T=ph(30);potAway(s,dt,3.2,T?T.x:s.x+1,T?T.z:s.z);return true}
  if(e.rat){const T=ph(10);if(T){potAway(s,dt,3,T.x,T.z);return true}}
  if(e.pet){
    const o=potOwner(pkk.own);if(!o){delete e.pet;return false}
    const d=Math.hypot(o.x-s.x,o.z-s.z);if(d>1.1)potGo(s,o.x,o.z,dt,d>4?3.6:2.8);
    s.state=0;return true;
  }
  if(e.follow){const L=F.shades[pkk.ldr];if(L&&L.x>0&&!L.dead&&L.pe&&L.pe.lead){if(Math.hypot(L.x-s.x,L.z-s.z)>1)potGo(s,L.x,L.z,dt,2.4);return true}delete e.follow}
  if(e.clump&&pkk.cx!=null){if(Math.hypot(pkk.cx-s.x,pkk.cz-s.z)>0.4)potGo(s,pkk.cx,pkk.cz,dt,4);return true}
  if(e.berserk||e.dragon){   // goes for the other monsters instead
    let best=null,bd=15;for(const o of F.shades)if(o!==s&&o.x>0&&!o.dead&&o.type!==3){const d=Math.hypot(o.x-s.x,o.z-s.z);if(d<bd){bd=d;best=o}}
    if(best){if(bd<0.55){if(e.dragon)pe(best,'burn',4);else best.stun=Math.max(best.stun,4);s.stun=0.6}else potGo(s,best.x,best.z,dt,3.4);return true}
  }
  // drawn to: a wisp lure (wisps), a decoy (everything)
  for(const o of F.shades){
    if(o===s||o.x<0||o.dead||!o.pe)continue;
    const d=Math.hypot(o.x-s.x,o.z-s.z);
    if(o.pe.decoy&&d<14){if(d<0.55){o.stun=Math.max(o.stun,2);s.calm=3;s.stun=1}else potGo(s,o.x,o.z,dt,3);return true}
    if(o.pe.wlure&&s.type===2&&d<20){if(d>0.6)potGo(s,o.x,o.z,dt,2.8);return true}
    if((o.pe.repel||o.pe.spines)&&d<3){potAway(s,dt,2.6,o.x,o.z);if(o.pe.spines&&d<0.6){s.stun=2;sfx('spike')}return true}
  }
  if(TG)for(const T of TG){
    const f=T.pf|0,d=Math.hypot(T.x-s.x,T.z-s.z);
    if(f&32&&s.type===2&&d<20&&d>0.6){potGo(s,T.x,T.z,dt,2.8);return true}
    if(f&64&&s.type!==1&&d<3){potAway(s,dt,2.8,T.x,T.z);return true}
  }
  return false;
}
// what a guest needs to draw: a look code (low 5 bits) and some flags
function potPv(s){
  const e=s.pe;if(!e)return 0;
  const c=e.ice?1:e.web?2:e.sleep||e.dream?3:e.stone?4:e.gold?5:e.pug?6:e.rat?7:e.plague?8:e.invis?9:e.ghost?10:e.burn?11:e.float?12:0;
  return c|(e.glow?32:0)|(e.tiny?64:e.huge?128:0)|(e.reveal||e.loud?256:0)|(e.spines?512:0)|(e.pet?1024:0)|(e.dragon?2048:0);
}
// a monster touching a player: true when a potion means it does no harm
function potTouch(s,T){
  const f=T.pf|0,e=s.pe;
  if(e&&e.tiny&&!e.drift){s.stun=2;s.state=0;if(T.loc){P.chill=Math.max(P.chill,2.5);sfx('drain')}else mpHit(T,'chill');return true}
  if(potHarmless(s)){s.stun=Math.max(s.stun,1);s.state=0;return true}
  if(e&&e.mirror){s.stun=4;s.state=0;sfx('seal');for(const o of potMons(s.x,s.z,3,true))if(o!==s&&o.type===s.type)o.stun=Math.max(o.stun,4);return true}
  if(s.type===2&&f&16){potKill(s,false);return true}
  if(f&128&&s.type===0){potBanish(s);return true}
  if(f&(256|512)){s.stun=6;s.state=0;s.calm=6;sfx(f&512?'spike':'seal');return true}
  return false;
}
// the players' own potion powers that act on monsters (host): stares, shoves, storms, dragon fire
function potPowers(dt,TG){
  if(!TG)return;
  for(const T of TG){
    const f=T.pf|0;if(!(f&(1024|2048|16384|32768|65536|512)))continue;
    const fx=Math.cos(T.yaw||0),fz=Math.sin(T.yaw||0);
    for(const s of F.shades){
      if(s.x<0||s.dead||s.type===3)continue;
      const dx=s.x-T.x,dz=s.z-T.z,d=Math.hypot(dx,dz);if(d>10)continue;
      const facing=(dx*fx+dz*fz)/Math.max(d,0.01);
      if(f&(1024|2048)&&facing>0.75&&los(T.x,T.z,s.x,s.z)){if(f&2048)mHold(s,'stone',0.4);else s.stared=0.35}
      if(f&16384&&d<0.75){potPlace(s,s.x+dx/(d||1)*1.4,s.z+dz/(d||1)*1.4);s.stun=Math.max(s.stun,1.5);s.state=0}
      if(f&512&&d<1.1&&s.stun<=0){s.stun=4;s.state=0;sfx('spike')}
      if(f&(32768|65536)&&d<2.8&&facing>0.8&&los(T.x,T.z,s.x,s.z)){if(f&65536&&(s.type===0)){potBanish(s)}else pe(s,'burn',3)}
    }
  }
}
// ---- zones that sit on the floor for a while: webs, fortresses, hedges, black holes, portals, plague clouds
const potSafeAt=(x,z)=>POT.zones.some(q=>q.k==='fort'&&Math.hypot(x-q.x,z-q.z)<q.r);
function potZones(dt){
  for(let i=POT.zones.length-1;i>=0;i--){
    const q=POT.zones[i];q.t-=dt;const age=q.T-q.t;
    const inMe=!P.down&&!P.away&&Math.hypot(P.x-q.x,P.z-q.z)<q.r;
    if(q.k==='web'){if(inMe&&!(POT.ps.hold>0.3))potHold('web',Math.min(0.6,q.t));if(!MP.guest)for(const s of potMons(q.x,q.z,q.r,false))mHold(s,'web',Math.min(1,q.t))}
    else if(q.k==='fort'||q.k==='hedge'){
      if(!MP.guest)for(const s of potMons(q.x,q.z,q.r+0.3,false)){const dx=s.x-q.x,dz=s.z-q.z,d=Math.hypot(dx,dz)||1;potPlace(s,q.x+dx/d*(q.r+0.45),q.z+dz/d*(q.r+0.45));s.state=0;s.calm=2;if(q.k==='hedge'){s.stun=Math.max(s.stun,1.5);sfx('spike')}}
    }else if(q.k==='hole'){
      const pull=age<2.6;
      if(inMe&&q.by!==potMe()||!P.down&&q.by!==potMe()&&Math.hypot(P.x-q.x,P.z-q.z)<q.r){
        const dx=q.x-P.x,dz=q.z-P.z,d=Math.hypot(dx,dz)||1;
        if(pull){const k=Math.min(d,2.4*dt);if(!blocked(P.x+dx/d*k,P.z))P.x+=dx/d*k;if(!blocked(P.x,P.z+dz/d*k))P.z+=dz/d*k}
        else if(!q.flung){potShove({x:q.x,z:q.z,drink:false},q.r,7,4)}
      }
      if(!MP.guest)for(const s of potMons(q.x,q.z,q.r,false)){
        if(pull){const dx=q.x-s.x,dz=q.z-s.z,d=Math.hypot(dx,dz)||1;if(d>0.3)potPlace(s,s.x+dx/d*Math.min(d,3*dt),s.z+dz/d*Math.min(d,3*dt));s.stun=Math.max(s.stun,0.3)}
        else if(!q.flung){const a=Math.random()*6.283;potPlace(s,q.x+Math.cos(a)*4,q.z+Math.sin(a)*4);s.stun=Math.max(s.stun,4)}
      }
      if(!pull&&!q.flung){q.flung=true;potBurst(q.x,0.5,q.z,[0.5,0.2,0.6],50,3);tone(50,0.8,'sawtooth',0.3,0,60)}
    }else if(q.k==='portal'){
      if(inMe&&Math.hypot(P.x-q.x,P.z-q.z)<0.45){potToSanctuary();say('The portal spits you out in the sanctuary',2.5)}
      if(!MP.guest)for(const s of potMons(q.x,q.z,0.45,false))potFar(s,15);
    }else if(q.k==='plague'){
      if(inMe){q.hT=(q.hT||1)-dt;if(q.hT<=0){q.hT=3;cough();P.inv=0;hurt(null);if(state==='dead')return}}
      if(!MP.guest)for(const s of potMons(q.x,q.z,q.r,false))if(!(s.pe&&s.pe.sick))pe(s,'sick',5);
    }
    if(q.t<=0)POT.zones.splice(i,1);
  }
}
// ---- the user's own side, every frame
function potTick(dt){
  if(!F)return;
  if(state!=='play'&&state!=='talk'&&state!=='pause'&&state!=='room')return;
  for(const k in POT.ps)if(POT.ps[k]>0){POT.ps[k]-=dt;if(POT.ps[k]<=0){POT.ps[k]=0;potEnded(k)}}
  if(POT.stop>0){POT.stop=Math.max(0,POT.stop-dt);canvas.style.filter=POT.stop>0?'grayscale(.85) contrast(1.1)':''}
  potProjTick(dt);potZones(dt);
  for(let i=POT.fx.length-1;i>=0;i--){const q=POT.fx[i];q.t+=dt;if(q.vx!==undefined){q.vy-=6*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;if(q.y<0.02){q.y=0.02;q.vy*=-0.3;q.vx*=0.6;q.vz*=0.6}}if(q.t>=q.life)POT.fx.splice(i,1)}
  if(POT.fx.length>500)POT.fx.splice(0,POT.fx.length-500);
  POT.histT-=dt;if(POT.histT<=0){POT.histT=0.5;POT.hist.push({x:P.x,z:P.z,hp:P.hp,fuel:P.fuel,t:R.time});if(POT.hist.length>24)POT.hist.shift()}
  if(!P.down){
    if(ps('hearth')||ps('gold3'))P.fuel=100;
    if(ps('warm'))P.chill=0;
    if(ps('fury')||ps('berserk')||ps('lungs')||ps('qsilver')||ps('ambro')){P.stam=100;P.winded=false}
    if(ps('sap')){P.stam=Math.max(0,P.stam-30*dt);if(P.stam<5)P.winded=true}
    if(ps('hawk')){POT.hawkT=(POT.hawkT||0)-dt;if(POT.hawkT<=0){POT.hawkT=0.5;const r=Math.round(6*pmag('hawk'));for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){const tx=P.tx+x,ty=P.ty+y;if(tx>=0&&ty>=0&&tx<F.W&&ty<F.H&&x*x+y*y<=r*r)F.seen[ty*F.W+tx]=1}}}
    if(ps('rot')){POT.rotT-=dt;if(POT.rotT<=0){POT.rotT=10;if(P.hp>1){P.hp--;P.inv=0.3;sfx('hurt');say('The rotgut gnaws at you',1.2)}}}
    {const b=ps('blur')?'blur(3px)':'';if(POT.blurK!==b){POT.blurK=b;if(!POT.stop)canvas.style.filter=b}}
    if(ps('regen')||ps('bwine')){POT.regT-=dt;if(POT.regT<=0){POT.regT=15/Math.max(pmag('regen'),pmag('bwine'));if(P.hp<maxHp()){P.hp++;sfx('pick')}}}
    if(ps('hic')){POT.hicT-=dt;if(POT.hicT<=0){POT.hicT=1.5+Math.random()*2.5;if(P.y<=0){P.vy=2.3;P.y=0.001;tone(700,0.08,'sine',0.1,0,300)}}}
    if(ps('sneeze')){POT.snzT-=dt;if(POT.snzT<=0){POT.snzT=5+Math.random()*4;potHold('sneeze',0.7);noise(0.3,0.25,1700,1.3);tone(500,0.2,'sawtooth',0.08,0,-200);say('Achoo!',0.8)}}
    if(ps('magnet'))for(const it of F.items){if(it.got||it.type==='shard'||it.type==='key'||it.type==='chest')continue;const dx=P.x-it.x,dz=P.z-it.z,d=Math.hypot(dx,dz);if(d<4.5*pmag('magnet')&&d>0.05){const k=Math.min(d,3*dt);it.x+=dx/d*k;it.z+=dz/d*k}}
    if(ps('fire')||ps('wyrm')){POT.fireT-=dt;if(POT.fireT<=0){POT.fireT=0.03;const a=P.yaw+(Math.random()-0.5)*0.5,u=3+Math.random()*2,y=Math.min(CAM_TOP,EYE*potEye())-0.15;
      POT.fx.push({x:P.x+Math.cos(P.yaw)*0.25,y,z:P.z+Math.sin(P.yaw)*0.25,vx:Math.cos(a)*u,vy:0.3+Math.random()*0.6,vz:Math.sin(a)*u,t:0,life:0.45,c:ps('drake')?[1,0.25,0.05]:[1,0.42,0.08],s:0.08,fire:1})}}
    if(ps('storm')){POT.stormT-=dt;if(POT.stormT<=0){POT.stormT=0.15;const a=Math.random()*6.283;POT.fx.push({x:P.x+Math.cos(a)*0.3,y:0.3+Math.random()*0.6,z:P.z+Math.sin(a)*0.3,vx:0,vy:0,vz:0,t:0,life:0.15,c:[0.7,0.8,1],s:0.12})}}
    if(POT.slam&&P.y<=0&&P.vy<=0){POT.slam=0;potHold('ice',1.2);pkShake=0.6;tone(70,0.4,'sine',0.3);say('Slammed down!',1.2)}
    if(potHeld()&&POT.holdK==='sleep'&&P.hp<=0)POT.ps.hold=0;
  }
  // Apocalypse (host): one monster after another burns away
  if(POT.apo&&!MP.guest){POT.apo.t+=dt;const L=F.shades.filter(s=>s.x>0&&!s.dead&&s.type!==3);
    if(POT.apo.t>=POT.apo.T||!L.length){for(const s of L)potKill(s,true);POT.apo=null}
    else{const due=Math.floor(POT.apo.t/POT.apo.T*(POT.apo.n+L.length))-POT.apo.n;for(let i=0;i<due&&i<L.length;i++){const s=L[i];potBurst(s.x,0.5,s.z,[1,0.3,0.1],20);potKill(s,false);POT.apo.n++}}}
  // Pandemonium: three free spins in a row
  if(POT.pnd>0&&WOF.done&&WOF.win<=2&&state==='play'){POT.pnd--;const i=pickSlice(WOF.recent,WOF_N),plan=planSpin(i,WOF.angle);
    const m={k:'wof',d:R.depth,i,c:Math.random()<0.5?1:0,a0:plan.from,a1:plan.to,dur:Math.min(plan.dur,6),e:plan.e,n:myName()};
    m.a1=plan.to;mpSend(m);wofBegin(m,true)}
  potHud();
}
function potEnded(k){
  if(k==='titan')P.hp=Math.min(P.hp,maxHp());
  if(k==='hold'){if(POT.wake==='heal'){POT.wake='';P.hp=maxHp();say('You wake up whole',2);sfx('pick')}POT.holdK=''}
  if(k==='phase'&&solidAt(P.x,P.z)){   // shoved out of the wall to the nearest floor
    let bx=Math.floor(P.x),bz=Math.floor(P.z),bd=1e9;
    for(let r=1;r<8&&bd===1e9;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){const x=Math.floor(P.x)+dx,z=Math.floor(P.z)+dz;if(x<0||z<0||x>=F.W||z>=F.H||F.g[z*F.W+x])continue;const d=dx*dx+dz*dz;if(d<bd){bd=d;bx=x;bz=z}}
    P.x=bx+0.5;P.z=bz+0.5;onTileChange();say('The wall pushes you out',2);
  }
  const p=POT_NAMES[k];if(p&&state==='play')say(p+' wears off',1.6);
}
const POT_NAMES={quick:'Quickstep',wind:'Windrunner',invis:'Invisibility',fire:'Dragonfire',wyrm:'Wyrm Form',drake:'Dragon Ascension',phase:'Void Cloak',
  mirror:'Mirror Skin',storm:'Storm Flask',berserk:'Berserk',medusa:'Medusa Gaze',undying:'The Elixir\'s protection',immune:'The Panacea',arch:'The Archmage\'s Draught',moon:'Moon Gravity',tiny:'Shrinking',huge:'Growth'};
const PS_LABEL=[['hold',()=>({ice:'Frozen',web:'Webbed',sleep:'Asleep',dream:'Dreaming',stone:'Gargoyle skin',sneeze:'Sneezing'}[POT.holdK]||'Held')],
  ['quick','Quickstep'],['wind','Windrunner'],['molasses','Slowed'],['lead','Lead belly'],['feather','Featherfall'],['moon','Moon gravity'],['pixie','Pixie'],['slick','Slick'],
  ['glow','Glowing'],['shadow','Shadow ink'],['invis','Invisible'],['hush','Silent'],['loud','Loudmouth'],['fury','Fury'],['berserk','Berserk'],['calm','Calm'],['tiny','Tiny'],['huge','Huge'],
  ['xray','Sight through walls'],['gems','Gem sense'],['midas','Midas touch'],['gold3','Golden hour'],['magnet','Magnetic'],['warm','Warm'],['wbane','Wisp bane'],['wlure','Wisps love you'],
  ['decoy','Smells like dinner'],['repel','Repellent'],['hic','Hiccups'],['sneeze','Sneezing powder'],['bouncy','Bouncy'],['stare','Statue stare'],['medusa','Medusa gaze'],['regen','Regenerating'],
  ['stoneskin','Stone skin'],['mirror','Mirror skin'],['hearth','Warm hearth'],['banish','Banishing touch'],['ignored','Puppy love'],['storm','Storm'],['phase','Void cloak'],['fire','Fire breath'],
  ['wyrm','Wyrm form'],['drake','Dragon ascension'],['life','Second life'],['undying','Undying'],['invuln','Invulnerable'],['arch','Archmage'],['immune','Panacea'],['lantern','Wisp lantern'],
  ['daybreak','Daybreak'],['syrup','Time syrup'],['tslow','Slow motion'],['allmon','Ghost light'],
  ['lungs','Iron lungs'],['cat','Catseye'],['lucky','Lucky'],['qsilver','Quicksilver'],['bwine','Bloodwine'],['hawk','Hawk\'s eye'],['titan','Titan'],['aegis','Aegis'],['phantom','Phantom step'],
  ['ambro','Ambrosia'],['godspeed','Godspeed'],['blur','Blurred'],['weak','Weakened'],['sap','Sapped'],['night','Nightmare'],['rot','Poisoned'],['doom','Doomed']];
function potStatus(L){
  if(POT.thick>0)L.push(['Thick hide ('+POT.thick+')',null]);if(POT.hex>0)L.push(['Hexed',null]);
  for(const [k,n] of PS_LABEL)if(ps(k))L.push([typeof n==='function'?n():n,POT.ps[k]>900?null:POT.ps[k]]);
  if(POT.stop>0)L.push(['Time stopped',POT.stop]);
}
// ---- ingredients in the maze. Called from genFloor with its own dice, after everything else is placed.
const ING_W=(()=>{   // weights by biome index (0 Old Stonework ... 8 Dark Forest)
  const base={glowcap:3,moss:2,water:2,bat:1,silk:0.8,bone:0.6,rust:0.6,ember:0.5,frost:0.5,glimmer:0.5};
  const boost=[{ember:0.6,frost:0.6,rust:0.4,glimmer:0.4,bone:0.4},{moss:4,water:1.5},{frost:5},{ember:5},{pretzel:2.5,water:1,rust:1},{bone:5},{rust:5,water:1},{glimmer:5},{glowcap:3,moss:2,bat:2}];
  return boost.map(b=>INGREDIENTS.map(g=>(base[g.id]||0)+(b[g.id]||0)));
})();
function potSeedIngredients(seedStr,depth,g,W,H,safeMask,pocketMask,items,skip,d0,bi,nCells,reserved){
  const r=mulberry32(hashStr(seedStr+'#brew#'+depth)),idx=(x,y)=>y*W+x;
  const taken=new Set(items.map(it=>idx(it.tx,it.ty)));for(const q of skip)taken.add(idx(q[0],q[1]));
  const spots=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=idx(x,y);if(g[i]!==0||safeMask[i]||pocketMask[i]||taken.has(i)||reserved(x,y)||d0[i]<3)continue;
    let walls=0,wd=null;for(const d of DIRS)if(g[idx(x+d[0],y+d[1])]===1){walls++;wd=wd||d}
    spots.push([x,y,walls,wd])}
  const n=Math.min(spots.length,Math.min(18,5+Math.round(nCells/18)+Math.floor(depth/3)));
  const wt=ING_W[clamp(bi|0,0,8)];
  for(let k=0;k<n;k++){
    const j=k+((r()*(spots.length-k))|0),c=spots[j];spots[j]=spots[k];spots[k]=c;
    const w=wt.map((v,i)=>INGREDIENTS[i].id==='silk'&&c[2]>=3?v+5:v);
    let tot=w.reduce((a,b)=>a+b,0),pick=r()*tot,ing=0;for(;ing<w.length-1;ing++){pick-=w[ing];if(pick<=0)break}
    const off=c[3]?0.22:0,ph=r()*6.28;
    items.push({type:'ingr',ing,tx:c[0],ty:c[1],x:c[0]+0.5+(c[3]?c[3][0]*off:Math.cos(ph)*0.15),z:c[1]+0.5+(c[3]?c[3][1]*off:Math.sin(ph)*0.15),got:false,ph});
  }
}
// the Brewer and his cauldron stand in the sanctuary corner beside the Keeper that the wheel did not take
function potPlaceBrewer(safe,npcs){
  if(!safe)return;
  const booth=safe.room?.booths.find(b=>b.type==='brewer');
  const wc=safe.wheel?[Math.sign(safe.wheel.x-safe.x),Math.sign(safe.wheel.z-safe.z)]:[-1,-1];
  const c=[[1,-1],[-1,1]].find(q=>!(q[0]===wc[0]&&q[1]===wc[1]))||[1,-1];
  const bx=booth?.x??safe.x+c[0]*1.0,bz=booth?.z??safe.z+c[1]*0.6;
  const cx=booth?bx+0.43:safe.x+c[0]*1.0,cz=booth?bz:safe.z+c[1]*1.05;
  safe.brew={x:bx,z:bz,cx,cz,disc:[cx,cz,0.19]};
  npcs.push({type:'brewer',x:bx,z:bz,ph:(safe.tx*3.17+safe.ty*5.3)%6.28,used:true,lock:true,
    yaw:booth?Math.atan2(booth.nz,booth.nx):Math.atan2(safe.z-bz,safe.x-bx)});
}
function potCollide(){
  const b=F.safe&&F.safe.brew;if(!b)return;const q=b.disc,dx=P.x-q[0],dz=P.z-q[1],d=Math.hypot(dx,dz),m=q[2]+PR;
  if(d<m&&d>1e-4){const nx=q[0]+dx/d*m,nz=q[1]+dz/d*m;if(!blocked(nx,nz)){P.x=nx;P.z=nz}}
}
const BREWER_LINES=['Two of anything makes something. Usually something.','Bring me what the maze drops. Mushrooms, salts, wings, the dust off a shade. Two at a time.',
  'Potions brew into potions. The deeper the brew, the stranger the drink.','Mind which way you throw. A bottle does not care who it lands on.','I have brewed a hundred things in this pot. Most of them were not soup.'];

// the Brewer: a stooped old alchemist in a patched robe and a pointed hat, goggles up on his brow, stirring his cauldron
function potBuildBrewer(n,B,t,ph,breath,blink,talking,out){
  const robe=[0.1,0.24,0.15,2],robeD=[0.06,0.16,0.1,2],patch=[0.42,0.3,0.12,2],apron=[0.4,0.26,0.14,3],skin=[0.86,0.66,0.52,1],white=[0.92,0.92,0.9,5],
        hat=[0.16,0.08,0.3,2],band=[0.75,0.55,0.18,4],brass=[0.78,0.58,0.22,4],wood=[0.35,0.22,0.12,6],iron=[0.07,0.07,0.08,4];
  const b=F.safe&&F.safe.brew,stir=t*1.6+ph;
  // where the cauldron is in his own frame
  let cl=[0.25,0,0.35];if(b){const dx=b.cx-B.p[0],dz=b.cz-B.p[2],c=Math.cos(n.yaw),s=Math.sin(n.yaw);cl=[c*dx+s*dz,0,-s*dx+c*dz]}
  seg(B,[0,0,0],[0,0.47,0],0.16,0.1,robe);
  for(let i=0;i<8;i++){const a=i/8*6.283;seg(B,[Math.cos(a)*0.15,0.03,Math.sin(a)*0.15],[Math.cos(a)*0.1,0.4,Math.sin(a)*0.1],0.028,0.012,i%2?robe:robeD)}
  slab(B,[0.13,0.2,0.05],[0.012,0.05,0.04],patch,rZ(0.12));
  slab(B,[0.11,0.28,0],[0.02,0.17,0.075],apron,rZ(0.18));
  const a=-0.32,toB=v=>{const c=Math.cos(a),s=Math.sin(a);return [c*v[0]-s*v[1],0.45+s*v[0]+c*v[1],v[2]]};   // the hunched upper body, as points in the body frame
  const U=subF(B,[0,0.45,0],rZ(a));
  seg(U,[0,-0.02,0],[0,0.04,0],0.1,0.097,[0.3,0.18,0.08,3]);
  for(let i=0;i<5;i++)ball(U,[0.06*Math.cos(i*0.6-1.2),0.01,0.095*Math.sin(i*0.6-1.2)],0.014,[[1.4,0.3,0.2,7],[0.3,1.4,0.5,7],[0.4,0.6,1.6,7],[1.5,1.2,0.3,7],[1.1,0.3,1.4,7]][i],true);
  ball(U,[0,0.14+breath,0],[0.085,0.14,0.112],robe);
  ball(U,[-0.03,0.25+breath,0],[0.08,0.045,0.12],robeD);
  // the stirring arm reaches the ladle into the pot
  const pot=[cl[0],0.27,cl[2]],tip=[pot[0]+Math.cos(stir)*0.05,0.27,pot[2]+Math.sin(stir)*0.05],sh=toB([0,0.22+breath,Math.sign(cl[2]||1)*0.115]);
  const dx=tip[0]-sh[0],dz=tip[2]-sh[2],dl=Math.hypot(dx,dz)||1,hand=[sh[0]+dx/dl*Math.min(0.24,dl*0.6),0.36,sh[2]+dz/dl*Math.min(0.24,dl*0.6)];
  const el=[(sh[0]+hand[0])/2+0.02,(sh[1]+hand[1])/2-0.06,(sh[2]+hand[2])/2];
  limb(B,sh,el,hand,0.04,0.036,0.026,robe,robe,skin,0.026);
  seg(B,[hand[0],hand[1]+0.05,hand[2]],tip,0.008,0.007,wood);ball(B,tip,0.02,wood,true);
  // the other hand holds up a little flask, and shakes it while he talks
  const sh2=toB([0,0.22+breath,-Math.sign(cl[2]||1)*0.115]),wv=talking?Math.sin(t*7)*0.03:0,h2=[sh2[0]+0.17,0.42+wv+(talking?0.05:0),sh2[2]*0.7];
  limb(B,sh2,[sh2[0]+0.06,0.36,sh2[2]*1.1],h2,0.04,0.036,0.026,robe,robe,skin,0.026);
  const fc=POT.lastCol||[0.4,1.6,0.6];
  ball(B,[h2[0]+0.01,h2[1]+0.045,h2[2]],0.03,[fc[0]*1.6,fc[1]*1.6,fc[2]*1.6,7]);seg(B,[h2[0]+0.01,h2[1]+0.07,h2[2]],[h2[0]+0.01,h2[1]+0.1,h2[2]],0.01,0.009,[0.7,0.85,0.9,8]);
  seg(U,[0,0.25+breath,0],[0.02,0.3+breath,0],0.03,0.028,skin);
  const H=subF(U,[0.02,0.295+breath,0],m3(m3(rYaw(n.hy||0),rZ((n.hp||0)+0.32+(talking?Math.sin(t*5.5)*0.05:0))),rX(Math.sin(t*0.5+ph)*0.04)));
  face(H,{skin,blink,iris:[0.3,0.55,0.25],brow:white,browH:0.014,browTilt:0.3,browOut:0.006,eyeS:0.9,nose:[0.03,0.028,0.022],ears:true,talk:talking?Math.max(0,Math.sin(t*9))*0.008:0});
  ball(H,[-0.02,0.08,0.07],[0.04,0.05,0.03],white,true);ball(H,[-0.02,0.08,-0.07],[0.04,0.05,0.03],white,true);
  ball(H,[0.06,0.03,0],[0.04,0.03,0.06],white);seg(H,[0.06,0.0-(talking?0.006:0),0],[0.07,-0.2,0.0],0.055,0.012,white);   // beard
  ball(H,[0.075,0.04,0.025],[0.02,0.008,0.03],white,true);ball(H,[0.075,0.04,-0.025],[0.02,0.008,0.03],white,true);       // moustache
  for(const z of[-0.034,0.034]){seg(H,[0.07,0.145,z],[0.088,0.145,z],0.02,0.02,brass);ball(H,[0.089,0.145,z],[0.004,0.015,0.015],[0.4,1.3,0.6,7],true)}
  seg(H,[-0.08,0.14,0],[0.07,0.145,0],0.088,0.088,[0.25,0.15,0.08,3]);
  seg(H,[0,0.16,0],[0,0.172,0],0.17,0.165,hat);seg(H,[0,0.172,0],[0,0.2,0],0.1,0.098,band);
  seg(H,[0,0.2,0],[-0.03,0.34,0],0.098,0.05,hat);seg(H,[-0.03,0.34,0],[-0.12,0.42,0.02],0.05,0.004,hat);
  ball(H,[0.04,0.24,0.07],0.012,[1.6,1.4,0.5,7],true);ball(H,[-0.02,0.3,-0.05],0.009,[1.6,1.4,0.5,7],true);
  out.top=0.95;
  // the cauldron
  if(b){
    const C={p:[b.cx,0,b.cz],R:rYaw(0)};
    for(let i=0;i<3;i++){const q=i/3*6.283+0.4;seg(C,[Math.cos(q)*0.14,0.12,Math.sin(q)*0.14],[Math.cos(q)*0.17,0,Math.sin(q)*0.17],0.016,0.012,iron)}
    for(let i=0;i<5;i++){const q=i/5*6.283;seg(C,[Math.cos(q)*0.08,0.01,Math.sin(q)*0.08],[Math.cos(q+0.4)*0.02,0.08,Math.sin(q+0.4)*0.02],0.018,0.01,wood)}
    ball(C,[0,0.2,0],[0.17,0.12,0.17],iron);
    seg(C,[0,0.26,0],[0,0.29,0],0.15,0.16,iron);
    const lc=POT.lastCol||[0.35,1.4,0.5];
    ball(C,[0,0.285,0],[0.14,0.008,0.14],[lc[0]*1.8,lc[1]*1.8,lc[2]*1.8,7],true);
    out.cauldron=[b.cx,0.29,b.cz,lc];
  }
}
function potCauldronFx(q,t){
  const [x,y,z,c]=q;
  spr(x,y+0.02,z,0.42,0.18,7,c[0],c[1],c[2],0.55,1);
  spr(x,0.05,z,0.18,0.16,11,1,0.55,0.15,0.9,1);spr(x,0.06,z,0.5,0.4,7,1,0.45,0.1,0.3,1);
  for(let i=0;i<5;i++){const k=(t*0.6+i*0.21)%1,a=i*2.3;spr(x+Math.cos(a)*0.07,y+0.02+k*0.35,z+Math.sin(a)*0.07,0.03*(1-k*0.5),0.03*(1-k*0.5),7,c[0],c[1],c[2],(1-k)*0.8,1)}
}

// ---- the Brewer's menu
function potThings(skip){
  const L=[];
  POT.bag.forEach((n,i)=>{const m=n-(skip&&skip.ing===i?1:0);if(m>0)L.push({ing:i,label:INGREDIENTS[i].name,sub:m+' carried · '+INGREDIENTS[i].where})});
  POT.belt.forEach(b=>{const m=b.n-(skip&&skip.pot===b.id?1:0);if(m>0){const p=potInfo(b.id);L.push({pot:b.id,label:p.name,sub:'Tier '+p.tier+' '+(p.debuff?'debuff':'buff')+' · '+m+' carried'+(p.mix?' · a blend of '+p.of:'')})}});
  return L;
}
const thingName=x=>x.ing!=null?INGREDIENTS[x.ing].name:potInfo(x.pot).name;
function potFinishBrew(id){
  potSaveBag();store.set('brewBook',[...POT.book]);POT.lastCol=hex3(potInfo(id).col);
  if(F.safe&&F.safe.brew)potBurst(F.safe.brew.cx,0.3,F.safe.brew.cz,POT.lastCol,18,0.6);
}
function potBrew(a,b){
  const id=brewAny(a,b),take=x=>{if(x.ing!=null)POT.bag[x.ing]--;else{const i=POT.belt.findIndex(q=>q.id===x.pot);beltTake(i)}};
  const back=x=>{if(x.ing!=null)POT.bag[x.ing]++;else beltAdd(x.pot)};
  take(a);take(b);
  if(!beltAdd(id)){back(a);back(b);sfx('seal');return 'Your belt is full. Drink or throw something first.'}
  const p=potInfo(id),fresh=!POT.book.has(id);
  POT.book.add(id);potFinishBrew(id);
  if(id===SLUDGE){tone(110,0.5,'sawtooth',0.1,0,-40);return (a.ing!=null)!==(b.ing!=null)?'An ingredient and a potion do not mix. Murky Sludge.':'Murky Sludge. Well, it is something.'}
  [523,659,784].forEach((f,i)=>tone(f*(1+p.tier*0.12),0.3,'triangle',0.1,i*0.1));
  return (fresh?(p.mix?'A new blend! ':'A new recipe! '):'')+p.name+' ('+(p.debuff?'a debuff, for throwing; ':'a buff; ')+'tier '+p.tier+'). '+(p.debuff?p.mon:p.you);
}
function potAutoBrew(){
  let brewed=0,lastId;
  const bag=POT.bag;
  for(let a=0;a<bag.length;a++){
    const pairs=Math.floor(bag[a]/2);
    if(pairs){
      lastId=brewAny({ing:a},{ing:a});beltAdd(lastId,pairs);POT.book.add(lastId);
      bag[a]-=pairs*2;brewed+=pairs;
    }
    if(bag[a]===0)continue;
    const b=bag.findIndex((n,i)=>i>a&&n>0);
    if(b<0)break;
    lastId=brewAny({ing:a},{ing:b});beltAdd(lastId);POT.book.add(lastId);
    bag[a]--;bag[b]--;brewed++;
  }
  if(!brewed)return 'You need at least two ingredients.';
  potFinishBrew(lastId);sfx('pick');
  return 'Brewed '+brewed+(brewed===1?' potion.':' potions.')+(bag.some(n=>n>0)?' One ingredient left over.':'');
}
function potHintFor(){
  const known=POT.book,hint=new Set(store.get('brewHints',[]));
  for(let tier=1;tier<=4;tier++)for(const p of POTIONS){if(!p||p.tier!==tier||!p.recipe||known.has(p.id)||hint.has(p.id))continue;
    if(tier===1||p.recipe.every(r=>known.has(r)||hint.has(r))){hint.add(p.id);store.set('brewHints',[...hint]);return p}}
  return null;
}
const potNamed=()=>[...POT.book].filter(i=>i<=MAX_ID).length;
// what the tier does, and which kind of potion it is, for the menus
const potKind=p=>p.debuff?'<span style="color:#ff8a7a">Debuff: throw it at monsters</span>':'<span style="color:#8aff9a">Buff: drink it</span>';
const potKindT=p=>p.debuff?'Debuff (throw it)':'Buff (drink it)';
const potTierT=p=>'Tier '+p.tier+(p.k>1?': lasts '+(Math.round(p.k*10)/10)+'x, '+(Math.round(p.m*10)/10)+'x as strong':'');
function potTalk(o){
  const b=talk.bm||'main';let text;
  if(b==='main'){
    text=talk.line||BREWER_LINES[(R.depth+(talk.npc.ph*10|0))%BREWER_LINES.length];
    const things=potThings(),nIng=POT.bag.reduce((a,c)=>a+c,0);
    o.push({head:'The cauldron',label:'Brew a potion',sub:things.length&&(things.length>1||(things[0].ing!=null?POT.bag[things[0].ing]:1)>1)?'Mix two things you carry ('+nIng+' ingredient'+(nIng===1?'':'s')+', '+beltCount()+' potion'+(beltCount()===1?'':'s')+')':'You need two things to mix. Ingredients lie about the maze.',cost:'',
      off:things.reduce((a,x)=>a+(x.ing!=null?POT.bag[x.ing]:POT.belt.find(q=>q.id===x.pot).n),0)<2,fn:()=>{talk.bm='pick1';talk.sel=0;talk.line=null}});
    const named=potNamed(),blends=POT.book.size-named;
    o.push({label:'Recipe book',sub:named+' of '+MAX_ID+' potions brewed'+(blends?', and '+blends+(blends===1?' blend':' blends'):''),cost:'',fn:()=>{talk.bm='book';talk.sel=0}});
    o.push({label:'Buy a hint',sub:'He tells you a recipe you do not know yet',cost:'3 gems',off:wallet<3,fn:()=>{const p=potHintFor();if(!p){talk.line='You know everything I know.';return}
      wallet-=3;store.set('wallet',wallet);sfx('gem');talk.line='Try this: '+recipeText(p)+'. That makes '+p.name+'.'}});
    if(up.autoBrew){
      const count=Math.floor(nIng/2);
      o.push({label:'Auto Brew',sub:count?'Brew '+count+(count===1?' potion':' potions')+' from your ingredients':'You need at least two ingredients',
        cost:'',off:!count,fn:()=>{talk.line=potAutoBrew()}});
    }else{
      o.push({label:'Unlock Auto Brew',sub:'Brew all your ingredients in one batch',cost:AUTO_BREW_COST+' gems',off:wallet<AUTO_BREW_COST,fn:()=>{
        if(up.autoBrew||wallet<AUTO_BREW_COST)return;
        wallet-=AUTO_BREW_COST;up.autoBrew=1;store.set('wallet',wallet);store.set('up',up);
        sfx('gem');talk.line='Auto Brew unlocked. Bring me your ingredients and I can brew them all at once.';
      }});
    }
  }else if(b==='pick1'||b==='pick2'){
    const first=b==='pick2'?talk.a:null;
    text=first?'And with the '+thingName(first)+'?':'What goes in first?';
    o.push({label:'Back',sub:'',cost:'',fn:()=>{talk.bm=first?'pick1':'main';talk.sel=0}});
    for(const x of potThings(first))o.push({label:x.label,sub:x.sub,cost:x.pot?'T'+potInfo(x.pot).tier:'',fn:()=>{
      if(!first){talk.a=x;talk.bm='pick2';talk.sel=1;return}
      talk.line=potBrew(first,x);talk.bm='main';talk.sel=0;talk.a=null}});
  }else{
    text=POT.book.size?'Everything you have brewed, and how.':'Nothing brewed yet. Bring me two things.';
    o.push({label:'Back',sub:'',cost:'',fn:()=>{talk.bm='main';talk.sel=0}});
    const hint=new Set(store.get('brewHints',[]));
    for(const p of POTIONS){if(!p)continue;const k=POT.book.has(p.id);if(!k&&!hint.has(p.id))continue;
      o.push({label:p.name+(k?'':' (not brewed yet)'),sub:potKindT(p)+' · '+recipeText(p)+' · Drink: '+p.you+' · Thrown: '+p.mon,cost:'T'+p.tier,info:true})}
    const bl=[...POT.book].filter(i=>i>100).map(potInfo).filter(Boolean).sort((a,b)=>a.tier-b.tier||a.name.localeCompare(b.name));
    bl.forEach((p,i)=>o.push({head:i?undefined:'Blends',label:p.name,sub:potKindT(p)+' · Drink: '+p.you+' · Thrown: '+p.mon,cost:'T'+p.tier,info:true}));
  }
  return text;
}
// ---- drawing
// little 3D ingredients on the floor, one look per kind
function potIngModel(it,t){
  const g=INGREDIENTS[it.ing],B={p:[it.x,0,it.z],R:rYaw(it.ph).map(q=>q*1.6)};
  switch(g.id){
    case 'glowcap':for(let i=0;i<3;i++){const x=[0,0.04,-0.03][i],z=[0,0.025,0.035][i],h=[0.06,0.04,0.035][i];seg(B,[x,0,z],[x,h,z],0.007,0.006,[0.85,0.85,0.75,5]);ball(B,[x,h,z],[0.028*h/0.06+0.006,0.012,0.028*h/0.06+0.006],[0.5,2.2,1.1,7],true)}break;
    case 'moss':for(let i=0;i<5;i++)ball(B,[Math.cos(i*1.3)*0.04,0.01,Math.sin(i*1.3)*0.04],[0.035,0.018,0.03],[0.22,0.5+0.05*i,0.16,5],true);break;
    case 'ember':for(let i=0;i<4;i++)slab(B,[Math.cos(i*1.7)*0.03,0.012,Math.sin(i*1.7)*0.03],[0.014,0.012,0.012],[2.4,0.8,0.2,7],rZ(i*0.7));break;
    case 'frost':for(let i=0;i<4;i++){ball(B,[Math.cos(i*1.6)*0.035,0.006,Math.sin(i*1.6)*0.035],[0.03,0.006,0.026],[0.75,0.95,1.25,9],true);seg(B,[Math.cos(i*1.6)*0.035,0.005,Math.sin(i*1.6)*0.035],[Math.cos(i*1.6)*0.04,0.04,Math.sin(i*1.6)*0.04],0.005,0.001,[1.1,1.4,1.8,7])}break;
    case 'bone':seg(B,[-0.05,0.012,0],[0.05,0.012,0],0.009,0.009,[0.92,0.88,0.78,9]);for(const x of[-0.055,0.055])for(const z of[-0.01,0.01])ball(B,[x,0.013,z],0.012,[0.92,0.88,0.78,9],true);ball(B,[0.01,0.008,0.04],[0.03,0.01,0.025],[0.95,0.93,0.85,9],true);break;
    case 'rust':for(let i=0;i<5;i++)slab(B,[Math.cos(i*1.25)*0.04,0.004,Math.sin(i*1.25)*0.04],[0.02,0.003,0.015],[0.62,0.3,0.12,4],rX(i*0.3));break;
    case 'glimmer':for(let i=0;i<3;i++){const a=i*2.1;slab(B,[Math.cos(a)*0.02,0.035,Math.sin(a)*0.02],[0.011,0.035,0.011],[1.2,0.7,2.2,7],m3(rZ(Math.cos(a)*0.35),rX(Math.sin(a)*0.35)))}break;
    case 'silk':ball(B,[0,0.02,0],[0.035,0.022,0.03],[0.95,0.95,0.95,5],true);for(let i=0;i<3;i++)seg(B,[0,0.03,0],[Math.cos(i*2)*0.1,0.002,Math.sin(i*2)*0.1],0.002,0.001,[0.95,0.95,0.95,5]);break;
    case 'water':seg(B,[0,0,0],[0,0.06,0],0.018,0.018,[0.4,0.7,1.3,8]);seg(B,[0,0.06,0],[0,0.075,0],0.008,0.008,[0.6,0.8,1,8]);ball(B,[0,0.08,0],0.008,[0.5,0.35,0.2,6],true);break;
    case 'bat':for(const z of[-1,1])slab(B,[0,0.008,z*0.035],[0.03,0.003,0.035],[0.25,0.17,0.2,5],rX(z*0.3));ball(B,[0,0.01,0],[0.015,0.012,0.012],[0.2,0.15,0.15,5],true);break;
    case 'shade':ball(B,[0,0.01,0],[0.045,0.014,0.04],[0.9,0.5,1.4,7],true);break;
    case 'wisp':seg(B,[0,0,0],[0,0.05,0],0.016,0.016,[0.6,1.2,2.6,7]);ball(B,[0,0.057,0],0.008,[0.5,0.35,0.2,6],true);break;
    case 'statue':slab(B,[0,0.015,0],[0.03,0.015,0.022],[0.66,0.64,0.58,9],rZ(0.5));slab(B,[0.04,0.008,0.02],[0.014,0.008,0.012],[0.6,0.58,0.53,9],rX(0.6));break;
    case 'pretzel':for(let i=0;i<5;i++)seg(B,[Math.cos(i*1.4)*0.035,0.006,Math.sin(i*1.4)*0.035],[Math.cos(i*1.4+0.5)*0.05,0.006,Math.sin(i*1.4+0.5)*0.05],0.006,0.006,[0.62,0.36,0.12,6]);break;
  }
}
function potDraw3D(t,ex,ez,fwx,fwz){
  for(const it of F.items){
    if(it.got||it.type!=='ingr')continue;
    const d2=(it.x-ex)**2+(it.z-ez)**2;if(d2>14*14||(it.x-ex)*fwx+(it.z-ez)*fwz<-1)continue;
    potIngModel(it,t);
  }
  for(const q of POT.proj){
    const c=hex3(potInfo(q.id).col),B={p:[q.x,q.y,q.z],R:m3(rYaw(q.rot*0.3),rZ(q.rot))};
    ball(B,[0,0,0],0.034,[c[0]*1.4,c[1]*1.4,c[2]*1.4,7]);seg(B,[0,0.025,0],[0,0.06,0],0.012,0.01,[0.75,0.88,0.95,8]);ball(B,[0,0.065,0],0.011,[0.5,0.35,0.2,6],true);
  }
  for(const q of POT.zones){
    if((q.x-ex)**2+(q.z-ez)**2>18*18)continue;
    const Z={p:[q.x,0,q.z],R:rYaw(0)},k=Math.min(1,(q.T-q.t)*3,q.t*2);
    if(q.k==='fort')for(let i=0;i<14;i++){const a=i/14*6.283;slab(Z,[Math.cos(a)*q.r,0.22*k,Math.sin(a)*q.r],[0.12,0.22*k+0.001,0.2],[0.5,0.48,0.43,9],rYaw(-a))}
    if(q.k==='hedge')for(let i=0;i<20;i++){const a=i/20*6.283;seg(Z,[Math.cos(a)*q.r,0,Math.sin(a)*q.r],[Math.cos(a)*(q.r+0.05),0.45*k,Math.sin(a)*(q.r+0.05)],0.03,0.002,[0.45,0.3,0.15,6]);
      seg(Z,[Math.cos(a)*q.r,0.2*k,Math.sin(a)*q.r],[Math.cos(a)*(q.r+0.25),0.25*k,Math.sin(a)*(q.r+0.25)],0.015,0.001,[0.55,0.38,0.2,6])}
  }
}
function potDrawSpr(t,ex,ez){
  for(const it of F.items){
    if(it.got||it.type!=='ingr')continue;
    const d2=(it.x-ex)**2+(it.z-ez)**2;if(d2>18*18)continue;
    const c=INGREDIENTS[it.ing].col,pl=0.6+0.4*Math.sin(t*2.5+it.ph);
    spr(it.x,0.1,it.z,0.5,0.5,7,c[0],c[1],c[2],0.45*pl,1);
    if(((t*0.9+it.ph)%1.6)<0.2)spr(it.x,0.16,it.z,0.08,0.08,7,1,1,1,0.95,1);   // a glint now and then   // a glint now and then
  }
  for(const q of POT.proj){const c=hex3(potInfo(q.id).col);spr(q.x,q.y,q.z,0.2,0.2,7,c[0],c[1],c[2],0.6,1)}
  for(const q of POT.fx){
    const k=1-q.t/q.life;
    if(q.ring){const rr=q.ring*(0.3+0.7*q.t/q.life);for(let i=0;i<16;i++){const a=i/16*6.283;spr(q.x+Math.cos(a)*rr,0.06,q.z+Math.sin(a)*rr,0.22,0.22,7,q.c[0],q.c[1],q.c[2],0.6*k,1)}continue}
    if(q.bolt){const [x0,z0,x1,z1]=q.bolt;for(let i=0;i<=8;i++){const f=i/8,j=(Math.random()-0.5)*0.25;spr(x0+(x1-x0)*f+j,0.6+(Math.random()-0.5)*0.3,z0+(z1-z0)*f-j,0.12,0.12,7,0.7,0.8,1,k,1)}continue}
    const fs=q.s*(q.fire?1+q.t*2.5:1);spr(q.x,q.y,q.z,fs,fs*(q.fire?1.3:1),q.fire?11:7,q.c[0],q.c[1],q.c[2],q.fire?k*0.55:k,1);
  }
  for(const q of POT.zones){
    if((q.x-ex)**2+(q.z-ez)**2>20*20)continue;
    const k=Math.min(1,q.t*2);
    if(q.k==='web')for(let i=0;i<10;i++){const a=i/10*6.283+0.3,r=q.r*((i*7)%5+1)/5.5;spr(q.x+Math.cos(a)*r,0.15+((i*3)%4)*0.25,q.z+Math.sin(a)*r,0.6,0.6,7,0.95,0.95,0.95,0.22*k,1)}
    else if(q.k==='plague')for(let i=0;i<12;i++){const a=i/12*6.283+t*0.2,r=q.r*(0.3+0.6*((i*5)%7)/7);spr(q.x+Math.cos(a)*r,0.3+0.3*Math.sin(t+i),q.z+Math.sin(a)*r,0.9,0.9,7,0.35,0.6,0.15,0.25*k,1)}
    else if(q.k==='hole'){spr(q.x,0.6,q.z,1.2,1.2,7,0.05,0,0.08,0.9*k,0);for(let i=0;i<10;i++){const a=t*4+i*0.63,r=0.3+((t*1.3+i*0.1)%1)*1.6;spr(q.x+Math.cos(a)*r,0.6,q.z+Math.sin(a)*r,0.1,0.1,7,0.6,0.3,0.9,0.8*k,1)}}
    else if(q.k==='portal'){for(let i=0;i<14;i++){const a=t*2+i/14*6.283;spr(q.x+Math.cos(a)*0.4,0.5+Math.sin(a)*0.4,q.z,0.12,0.12,7,0.4,1,1,0.9*k,1)}spr(q.x,0.5,q.z,0.8,0.8,7,0.3,0.9,1,0.5*k,1)}
    else if(q.k==='fort')spr(q.x,0.3,q.z,q.r*2.4,0.8,7,0.9,0.75,0.4,0.15*k,1);
  }
}
// a creature under a potion. pre: true when it was drawn here instead (a pug, a rat, unseen). post: recolour/resize what was just drawn.
function potMonPre(s,t){
  const pv=s.pv|0,c=pv&31;
  if(pv&1024)spr(s.x,(s.type===2?0.85:1.05)+Math.sin(t*3+s.ph)*0.03,s.z,0.1,0.1,7,1,0.4,0.6,0.9,1);   // a pet: a little pink heart-glow
  if(c===9){if(Math.sin(t*7+s.ph)>0.6)spr(s.x,0.5,s.z,0.5,0.9,7,0.7,0.7,0.9,0.08,1);return true}
  if(c>=6&&c<=8){s.wk=(s.wk||0)+0.1;buildCritter({rx:s.x,rz:s.z,ry:0,ryaw:s.face||0,walk:s.wk,spd:2},t,c-5,false);return true}
  return false;
}
const PV_COL={1:[0.7,0.9,1.25],4:[0.62,0.6,0.56],5:[1.6,1.15,0.3],10:[0.75,0.85,1.1],11:[1.3,0.55,0.25]};
function potMonPost(s,n0,k0,t){
  const pv=s.pv|0,c=pv&31,W=CH.w||13,b=CH.buf,sz=pv&64?0.5:pv&128?1.5:1,fy=c===12?0.45:0;
  const tint=PV_COL[c]||(pv&2048?[1.3,0.45,0.3]:null);
  if(tint||sz!==1||fy){
    for(let i=n0;i<CH.n;i++){const o=i*W;
      if(sz!==1){b[o]=s.x+(b[o]-s.x)*sz;b[o+1]*=sz;b[o+2]=s.z+(b[o+2]-s.z)*sz}
      b[o+1]+=fy;
      if(tint){const l=(b[o+6]+b[o+7]+b[o+8])/3+0.12;b[o+6]=tint[0]*l;b[o+7]=tint[1]*l;b[o+8]=tint[2]*l;if(c===5)b[o+12]=4;if(c===4||c===1)b[o+12]=9}}
    for(let i=k0;i<sprList.length;i++){const q=sprList[i];if(sz!==1){q.x=s.x+(q.x-s.x)*sz;q.y*=sz;q.z=s.z+(q.z-s.z)*sz}q.y+=fy;if(c===4||c===5||c===1)q.a=0}
  }
  if(c===2)for(let i=0;i<5;i++)spr(s.x+Math.cos(i*1.3)*0.15,0.2+i*0.15,s.z+Math.sin(i*1.3)*0.15,0.4,0.4,7,0.95,0.95,0.95,0.25,1);
  if(c===3)for(let i=0;i<3;i++){const k=(t*0.5+i/3)%1;spr(s.x+k*0.2,0.9*sz+k*0.4,s.z,0.07*(1-k*0.4),0.07*(1-k*0.4),7,0.8,0.8,1,1-k,1)}
  if(c===11||pv&2048)for(let i=0;i<4;i++){const k=(t*1.5+i/4)%1;spr(s.x+Math.sin(i*2+t*3)*0.12,0.2+k*0.8,s.z+Math.cos(i*2+t*3)*0.12,0.14,0.2,11,1,0.55,0.15,1-k,1)}
  if(pv&32)spr(s.x,0.55*sz,s.z,1.4,1.4,7,1,0.95,0.6,0.35,1);
  if(pv&512)for(let i=0;i<8;i++){const a=i/8*6.283;spr(s.x+Math.cos(a)*0.22,0.4+Math.sin(i*2.1)*0.15,s.z+Math.sin(a)*0.22,0.05,0.05,7,0.6,0.45,0.25,1,0)}
}
const potSeen=s=>!!((s.pv|0)&(32|256))||ps('allmon')||ps('xray')&&Math.hypot(s.x-P.x,s.z-P.z)<12;
const potRevealed=s=>!!((s.pv|0)&256);

// ---- the belt on screen
function potHud(){
  if(!POT.dom){
    const st=document.createElement('style');
    st.textContent='#belt{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;text-shadow:0 1px 3px #000;font-size:11px;color:#ddd;z-index:5}'+
      '#belt .hbar{display:flex;gap:10px;align-items:flex-end}#belt .wl{display:flex;gap:4px}#belt .wl:empty,#belt .wl:empty+.sep{display:none}#belt .sep{width:1px;align-self:stretch;background:rgba(255,255,255,.25)}'+
      '#belt .w{position:relative;width:44px;height:48px;border-radius:8px;background:rgba(40,28,18,.6);border:1px solid rgba(255,210,150,.25);pointer-events:auto;cursor:pointer;overflow:hidden}'+
      '#belt .w.on{border-color:#ffb36b;box-shadow:0 0 10px rgba(255,160,80,.55)}#belt .w svg{position:absolute;left:6px;top:4px}#belt .w i{position:absolute;left:3px;bottom:1px;font-style:normal;font-size:8px;opacity:.7}'+
      '#belt .w .cd{position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(0,0,0,.55)}'+
      '#belt .w .lv{position:absolute;right:3px;top:1px;font-size:10px;color:#ffd9a0;font-weight:bold;text-shadow:0 1px 2px #000}#belt .w .lv.ch{color:#7dff9a}'+
      '#belt .w .xp{position:absolute;left:0;bottom:0;height:3px;background:linear-gradient(90deg,#ffb36b,#ffe08a);z-index:1}'+
      '#xhair{position:fixed;left:50%;top:50%;width:0;height:0;pointer-events:none;z-index:4;display:none}#xhair b{position:absolute;background:rgba(255,240,220,.85);box-shadow:0 0 2px #000}'+
      '#xhair .d{left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%}'+
      '#belt .sl{display:flex;gap:6px}#belt .s{position:relative;width:40px;height:48px;border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18);pointer-events:auto;cursor:pointer}'+
      '#belt .s.on{border-color:#ffd88a;box-shadow:0 0 10px rgba(255,200,120,.5)}#belt .s.e{opacity:.4;border-style:dashed;cursor:default}#belt .s svg{position:absolute;left:8px;top:5px}#belt .s b{position:absolute;right:3px;bottom:1px;font-size:11px;color:#fff}'+
      '#belt .s i{position:absolute;left:3px;top:1px;font-style:normal;font-size:9px;opacity:.6}#belt .nm{font-size:12px;color:#ffe8c0}body.inroom #belt,body.rwatch #belt{display:none}'+
      '#potov{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .25s;z-index:2}'+
      '#tDrink,#tThrow{bottom:calc(212px + env(safe-area-inset-bottom));width:58px;height:58px;font-size:11px}#tDrink{left:calc(24px + env(safe-area-inset-left))}#tThrow{left:calc(92px + env(safe-area-inset-left))}body:not(.hasbelt) #tDrink,body:not(.hasbelt) #tThrow{display:none}';
    document.head.appendChild(st);
    const d=document.createElement('div');d.id='belt';d.innerHTML='<div class="nm"></div><div class="hbar"><div class="wl"></div><div class="sep"></div><div class="sl"></div></div><div class="hi"></div>';document.body.appendChild(d);
    const xh=document.createElement('div');xh.id='xhair';xh.innerHTML='<b class="d"></b><b class="t"></b><b class="bt"></b><b class="l"></b><b class="r"></b>';document.body.appendChild(xh);
    const ov=document.createElement('div');ov.id='potov';document.body.appendChild(ov);
    d.addEventListener('pointerdown',e=>{const w=e.target.closest('.w');if(w){e.preventDefault();e.stopPropagation();SMITH.eq=SMITH.eq===w.dataset.w&&touch.on?'':w.dataset.w;smithSave();sfx('key');POT.hudK='';return}
      const s=e.target.closest('.s');if(!s||s.classList.contains('e'))return;e.preventDefault();e.stopPropagation();const i=+s.dataset.i;if(touch.on&&POT.sel===i&&performance.now()-POT.tapT<400)potDrink(i);POT.sel=i;POT.tapT=performance.now();POT.hudK=''});
    if($('touch'))for(const [id,label,fn] of[['tDrink','DRINK',()=>potDrink()],['tThrow','THROW',()=>potThrow()]]){
      const b=document.createElement('div');b.id=id;b.className='tbtn';b.textContent=label;
      b.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();fn()},{passive:false});$('touch').appendChild(b)}
    POT.dom={d,ov,xh,nm:d.querySelector('.nm'),sl:d.querySelector('.sl'),wl:d.querySelector('.wl'),hi:d.querySelector('.hi')};
  }
  const D=POT.dom,show=(state==='play'||state==='talk'&&!(talk&&talk.inv))&&!P.down;
  const nIng=POT.bag.reduce((a,b)=>a+b,0);
  document.body.classList.toggle('hasbelt',show&&POT.belt.length>0&&touch.on);
  const own=WEAPONS.filter(w=>SMITH.own[w.id]).map(w=>w.id);
  const key=[show,state,POT.sel,POT.belt.length,nIng,touch.on,!!pad.id,SMITH.eq,own.join('+'),...POT.belt.map(b=>b.id+'x'+b.n)].join();
  if(key!==POT.hudK){
    POT.hudK=key;D.d.style.display=show?'flex':'none';
    if(POT.sel>=POT.belt.length)POT.sel=Math.max(0,POT.belt.length-1);
    const cur=POT.belt[POT.sel];
    D.nm.textContent=cur?potInfo(cur.id).name+(potInfo(cur.id).debuff?' (debuff: throw it) — '+potInfo(cur.id).mon:' — '+potInfo(cur.id).you):'';
    D.sl.innerHTML=Array.from({length:BELT_MAX},(_,i)=>POT.belt[i]||null).map((b,i)=>{if(!b)return '<div class="s e" data-i="'+i+'"><i>'+(touch.on||pad.id?'':i+1)+'</i></div>';const c=potInfo(b.id).col;return '<div class="s'+(i===POT.sel?' on':'')+'" data-i="'+i+'"><i>'+(touch.on||pad.id?'':i+1)+'</i>'+
      '<svg width="24" height="36" viewBox="0 0 24 36"><rect x="9" y="1" width="6" height="5" rx="1" fill="#8a5a30"/><rect x="9.5" y="5" width="5" height="7" fill="rgba(220,240,255,.5)"/>'+
      '<circle cx="12" cy="23" r="10" fill="'+c+'" stroke="rgba(255,255,255,.6)" stroke-width="1.2"/><ellipse cx="8.5" cy="19.5" rx="2.5" ry="3.5" fill="rgba(255,255,255,.45)"/></svg>'+(b.n>1?'<b>'+b.n+'</b>':'')+'</div>'}).join('');
    D.wl.innerHTML=own.map((id,i)=>{const q=wLevelOf(SMITH.xp[id]),ch=wChoice(id);return '<div class="w'+(SMITH.eq===id?' on':'')+'" data-w="'+id+'" title="'+WEAPON[id].name+' · level '+q.L+(q.need?' · '+Math.floor(q.into)+'/'+q.need+' XP':'')+(ch?' · a choice waits at the Blacksmith':'')+'">'+WICON[id]+
      '<i>'+(SMITH.eq===id?'IN HAND':'')+'</i><b class="lv'+(ch?' ch':'')+'">'+q.L+(ch?'!':'')+'</b><div class="xp" style="width:'+(q.need?(q.into/q.need*100).toFixed(0):100)+'%"></div><div class="cd"></div></div>'}).join('');
    const extra=POT.belt.slice(BELT_MAX).reduce((a,b)=>a+b.n,0);
    D.hi.textContent=(extra?'+'+extra+' more in your bag · ':'')+(nIng?'⚗ '+nIng+' ingredient'+(nIng===1?'':'s')+' · ':'')+(POT.belt.length?(touch.on?'tap a bottle · DRINK · THROW · BAG':pad.id?'D-pad ← → choose · Back drink · B throw · R3 inventory':'1-6 choose · H drink · B throw · I inventory'):(touch.on?'BAG: inventory':pad.id?'R3: inventory':'I: inventory'))+(own.length>1?(touch.on?' · tap a weapon to hold it':' · Y switch weapon'):'');
  }
  // the weapon's cooldown on its slot, and the crosshair while one is in hand
  const held=wHeld(),cdEl=held&&D.wl.querySelector('.w.on .cd');
  if(cdEl){const f=W.cd>0?Math.min(1,W.cd/Math.max(0.05,wStats(held).cd)):0,h=(f*100).toFixed(0)+'%';if(cdEl.style.height!==h)cdEl.style.height=h}
  const xOn=!!held&&state==='play'&&!P.down&&!P.hug&&!FX.frozen&&!(mazeExternalView&&(cameraView==='second'||EMO.id!=null)),xh=D.xh;
  if(xh.style.display!==(xOn?'block':'none'))xh.style.display=xOn?'block':'none';
  if(xOn){const sh=WEAPON[held].kind==='shot',g=(sh?5:7)+12*W.swing+(W.cd>0?2:0),L=sh?7:5,key2=held+'|'+g.toFixed(1);
    if(xh.dataset.k!==key2){xh.dataset.k=key2;const q=(c,css)=>xh.querySelector(c).style.cssText=css;
      q('.t','left:-1px;top:'+(-g-L)+'px;width:2px;height:'+L+'px');q('.bt','left:-1px;top:'+g+'px;width:2px;height:'+L+'px');
      q('.l','top:-1px;left:'+(-g-L)+'px;height:2px;width:'+L+'px');q('.r','top:-1px;left:'+g+'px;height:2px;width:'+L+'px');xh.querySelector('.d').style.display=sh?'block':'none'}}
  const k=ps('hold')?POT.holdK:'',bg=k==='ice'?'radial-gradient(ellipse at center,rgba(170,220,255,.08) 40%,rgba(170,220,255,.55))':k==='web'?'radial-gradient(ellipse at center,rgba(255,255,255,0) 40%,rgba(240,240,240,.5))':
    k==='sleep'||k==='dream'?'rgba(10,0,30,.82)':k==='stone'?'radial-gradient(ellipse at center,rgba(120,115,105,.1) 40%,rgba(120,115,105,.6))':
    ps('invis')?'radial-gradient(ellipse at center,rgba(180,190,255,0) 55%,rgba(180,190,255,.25))':ps('phase')?'radial-gradient(ellipse at center,rgba(60,20,90,0) 50%,rgba(60,20,90,.45))':'';
  if(D.ov.dataset.k!==bg){D.ov.dataset.k=bg;D.ov.style.background=bg;D.ov.style.opacity=bg?1:0}
}
function potHide(){if(POT.dom){POT.dom.d.style.display='none';POT.dom.xh.style.display='none';POT.dom.ov.style.opacity=0;POT.dom.ov.dataset.k='';POT.hudK=''}document.body.classList.remove('hasbelt');canvas.style.filter=''}

/* ---------- the inventory: everything you carry on one screen (I, pad R3, touch BAG) ---------- */
// It borrows the talk state, so you stand still while it is open (and in a shared game the world keeps going, as it does when you talk).
// Focus runs over a grid: the six belt slots on top, then the fourteen ingredients in two rows of seven.
const INV={el:null,focus:0};
const invPC=()=>Math.max(BELT_MAX,Math.ceil(POT.belt.length/BELT_MAX)*BELT_MAX),invPR=()=>invPC()/BELT_MAX;   // potion cells: the hot bar row, then rows of extras
const invRC=i=>{const pc=invPC();return i<pc?[(i/BELT_MAX)|0,i%BELT_MAX]:[invPR()+(((i-pc)/7)|0),(i-pc)%7]};
const invIx=(r,c)=>{const pr=invPR();return r<pr?r*BELT_MAX+Math.min(c,BELT_MAX-1):invPC()+(r-pr)*7+Math.min(c,6)};
function invOpen(){
  if(state!=='play'||P.down||P.away||loading||FX.frozen)return;
  state='talk';talk={inv:true,sel:0,opts:[]};
  if(document.pointerLockElement){talk.relock=true;document.exitPointerLock()}
  clearPrompt();touch.mx=touch.my=0;touch.stickId=null;touch.lookId=null;touch.jump=touch.crouch=false;$('stickBase').style.display=$('stickKnob').style.display='none';
  INV.focus=Math.min(POT.sel,BELT_MAX-1);sfx('pick');invBuild();potHud();
}
function invNav(dx,dy){
  let [r,c]=invRC(INV.focus);r=clamp(r+dy,0,invPR()+1);c=clamp(c+dx,0,r<invPR()?BELT_MAX-1:6);
  INV.focus=invIx(r,c);invBuild();
}
function invMove(d){   // move the focused potion along the belt
  const i=INV.focus,j=i+d;if(i>=invPC()||!POT.belt[i]||j<0||j>=POT.belt.length)return;
  const b=POT.belt;[b[i],b[j]]=[b[j],b[i]];if(POT.sel===i)POT.sel=j;else if(POT.sel===j)POT.sel=i;
  INV.focus=j;POT.hudK='';sfx('pick');invBuild();
}
function invUse(throwIt){
  const i=INV.focus;if(i>=invPC()||!POT.belt[i]){sfx('seal');return}
  closeTalk();if(throwIt)potThrow(i);else potDrink(i);
}
const invCss=()=>{const st=document.createElement('style');st.textContent=
  '#inv{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(860px,96vw);max-height:92vh;overflow:auto;box-sizing:border-box;z-index:20;'+
  'background:rgba(14,10,8,.93);border:1px solid rgba(255,200,140,.28);border-radius:14px;padding:16px 18px;color:#e8dccb;font-size:13px;box-shadow:0 10px 40px rgba(0,0,0,.6)}'+
  '#inv.hidden{display:none}#inv h3{margin:0;font:600 20px Georgia,serif;letter-spacing:.08em;color:#ffd9a0}#inv .ih{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}'+
  '#inv .ih span{opacity:.75}#inv .cols{display:grid;grid-template-columns:1fr 250px;gap:16px}@media(max-width:720px){#inv .cols{grid-template-columns:1fr}}'+
  '#inv h4{margin:12px 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c9a97a;font-weight:600}#inv h4:first-child{margin-top:0}'+
  '#inv .row{display:grid;gap:6px}#inv .belt{grid-template-columns:repeat(6,1fr)}#inv .ings{grid-template-columns:repeat(7,1fr)}'+
  '#inv .c{position:relative;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.04);min-height:64px;padding:4px 3px 3px;text-align:center;cursor:pointer;box-sizing:border-box}'+
  '#inv .c.f{border-color:#ffd88a;box-shadow:0 0 0 1px #ffd88a,0 0 12px rgba(255,200,120,.35);background:rgba(255,210,140,.08)}#inv .c.act:after{content:"ACTIVE";position:absolute;left:0;right:0;bottom:-1px;font-size:8px;letter-spacing:.1em;color:#ffd88a}'+
  '#inv .c.e{opacity:.45}#inv .c i{position:absolute;left:4px;top:2px;font-style:normal;font-size:9px;opacity:.55}#inv .c b{position:absolute;right:4px;top:2px;font-size:11px;color:#fff}'+
  '#inv .c small{display:block;font-size:9.5px;line-height:1.15;opacity:.85;margin-top:2px}#inv .dot{width:22px;height:22px;border-radius:50%;margin:6px auto 0;box-shadow:inset -3px -3px 6px rgba(0,0,0,.45),0 0 8px currentColor}'+
  '#inv .det{margin-top:8px;min-height:74px;border-radius:9px;background:rgba(0,0,0,.3);padding:8px 10px;line-height:1.45}#inv .det .nm{font-size:15px;color:#ffe6c0}#inv .det .t{color:#ffd88a;font-size:11px;margin-left:6px}'+
  '#inv .btns{margin-top:6px;display:flex;gap:6px;flex-wrap:wrap}#inv button{font:inherit;font-size:12px;color:#ffe6c0;background:rgba(255,200,140,.12);border:1px solid rgba(255,200,140,.35);border-radius:7px;padding:4px 10px;cursor:pointer}'+
  '#inv button:disabled{opacity:.35;cursor:default}#inv .sup div{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)}#inv .sup div span:last-child{color:#fff}'+
  '#inv .ifx{font-size:12px;line-height:1.6}#inv .hint{margin-top:10px;font-size:11px;opacity:.6;text-align:center}#tInv{left:calc(24px + env(safe-area-inset-left));top:calc(150px + env(safe-area-inset-top));width:54px;height:54px;font-size:11px}';
  document.head.appendChild(st)};
function invBuild(){
  if(!INV.el){invCss();INV.el=document.createElement('div');INV.el.id='inv';INV.el.className='hidden';document.body.appendChild(INV.el);
    INV.el.addEventListener('click',e=>{e.stopPropagation();const c=e.target.closest('[data-f]'),bt=e.target.closest('button[data-a]');
      if(bt){const a=bt.dataset.a;if(a==='drink')invUse(false);else if(a==='throw')invUse(true);else if(a==='l')invMove(-1);else if(a==='r')invMove(1);else if(a==='set'){POT.sel=INV.focus;POT.hudK='';sfx('pick');invBuild()}else if(a==='close')closeTalk();return}
      if(c){INV.focus=+c.dataset.f;invBuild()}});}
  INV.focus=Math.min(INV.focus,invPC()+ING_N-1);
  const el=INV.el,f=INV.focus,hex=a=>'rgb('+a.map(v=>Math.round(Math.min(1,v)*255)).join(',')+')';
  // the belt
  const PC=invPC();let belt='';for(let i=0;i<PC;i++){const b=POT.belt[i],p=b&&potInfo(b.id);
    belt+='<div class="c'+(i===f?' f':'')+(b?'':' e')+(b&&i===POT.sel?' act':'')+'" data-f="'+i+'"><i>'+(i<BELT_MAX?i+1:'bag')+'</i>'+(b&&b.n>1?'<b>×'+b.n+'</b>':'')+
      (p?'<div class="dot" style="background:'+p.col+';color:'+p.col+'"></div><small>'+p.name+'</small>':'<div class="dot" style="background:none;border:1px dashed rgba(255,255,255,.3);box-shadow:none"></div><small>empty</small>')+'</div>'}
  let ings='';INGREDIENTS.forEach((g,k)=>{const i=PC+k,n=POT.bag[k];
    ings+='<div class="c'+(i===f?' f':'')+(n?'':' e')+'" data-f="'+i+'">'+(n?'<b>×'+n+'</b>':'')+'<div class="dot" style="background:'+hex(g.col)+';color:'+hex(g.col)+'"></div><small>'+g.name+'</small></div>'});
  // details of what has focus
  let det='';
  if(f<PC){const b=POT.belt[f],p=b&&potInfo(b.id);
    det=p?'<div><span class="nm">'+p.name+'</span> '+potKind(p)+'<span class="t">'+potTierT(p)+(b.n>1?' · '+b.n+' carried':'')+(f>=BELT_MAX?' · in your bag (move it into slots 1-6 to use it from the hot bar)':'')+'</span></div>'+(p.mix?'<div><b>A blend of</b> '+p.of+'</div>':'')+'<div><b>Drink:</b> '+p.you+'</div><div><b>Thrown at a monster:</b> '+p.mon+'</div>'+
      '<div class="btns"><button data-a="drink">Drink (H)</button><button data-a="throw">Throw (B)</button><button data-a="set"'+(f===POT.sel||f>=BELT_MAX?' disabled':'')+'>Make active (Enter)</button><button data-a="l"'+(f>0?'':' disabled')+'>◀ Move</button><button data-a="r"'+(f<POT.belt.length-1?'':' disabled')+'>Move ▶</button></div>'
      :'<div class="nm">Empty slot</div><div>The Brewer, beside the Keeper in every sanctuary, brews two things you carry into a potion. It goes here.</div>';
  }else{const k=f-PC,g=INGREDIENTS[k],id=g.id,uses=[];let hidden=0;
    for(const p of POTIONS){if(!p||p.tier!==1||!p.recipe||!p.recipe.includes(id))continue;if(POT.book.has(p.id)){const o=p.recipe[0]===id?p.recipe[1]:p.recipe[0];uses.push(p.name+' (with '+(o===id?'another':INGREDIENTS.find(q=>q.id===o).name)+')')}else hidden++}
    det='<div><span class="nm">'+g.name+'</span><span class="t">'+POT.bag[k]+' carried</span></div><div><b>Found:</b> '+g.where+'</div><div><b>Brews:</b> '+(uses.length?uses.join(', '):'nothing you know of yet')+(hidden?' · and '+hidden+' recipe'+(hidden>1?'s':'')+' still to find':'')+'. Any other pair makes a blend.</div>';
  }
  // supplies and what is on you
  const row=(a,b)=>'<div><span>'+a+'</span><span>'+b+'</span></div>';
  const sup=row('Hearts','♥ '+P.hp+' / '+maxHp())+row('Torch',Math.round(P.fuel)+'%')+row('Flash bombs',P.flash)+row('Ward stone',P.ward?'yes':'—')+row('Gate keys',P.keys||'—')+
    row('Weapon',wHeld()?WEAPON[wHeld()].name+' · level '+wLevelOf(SMITH.xp[wHeld()]).L+(wLevelOf(SMITH.xp[wHeld()]).need?' ('+Math.floor(wLevelOf(SMITH.xp[wHeld()]).into)+'/'+wLevelOf(SMITH.xp[wHeld()]).need+' XP)':'')+(wChoice(wHeld())?' · choice waiting':''):'—')+
    row('Pickaxe',P.pick>0?P.pick+' swings':'—')+row('Spike traps',P.spikeTraps||'—')+row('Shards',P.shards+' / 3')+row('Gems this run',R.gems|0)+row('Ingredients',POT.bag.reduce((a,b)=>a+b,0))+row('Recipes known',potNamed()+' / '+MAX_ID+(POT.book.size>potNamed()?' + '+(POT.book.size-potNamed())+' blends':''));
  const L=[];potStatus(L);
  const fl=[['Pug',FX.pug],['Rat',FX.rat],['Plague rat',FX.plague],['Hedgehog',FX.hedge],['+200 lbs',FX.fat],['Moonwalk',FX.moon],['Bobblehead',FX.bob],['Smallpox',FX.pox],['Tinnitus',FX.tin]];
  for(const [n,v] of fl)if(v>0)L.push([n,v]);
  const fx=L.length?L.map(([n,t])=>n+(t?' <span style="opacity:.6">'+Math.ceil(t)+'s</span>':'')).join('<br>'):'<span style="opacity:.6">Nothing right now</span>';
  el.innerHTML='<div class="ih"><h3>INVENTORY</h3><span>● '+wallet+' gems · Level '+plLevel()+'</span></div><div class="cols"><div>'+
    '<h4>Potion belt · your hot bar'+(PC>BELT_MAX?' (first row) · the rest is in your bag':'')+'</h4><div class="row belt">'+belt+'</div>'+(f<PC?'<div class="det">'+det+'</div>':'')+
    '<h4>Ingredients</h4><div class="row ings">'+ings+'</div>'+(f>=PC?'<div class="det">'+det+'</div>':'')+
    '</div><div><h4>Supplies</h4><div class="sup">'+sup+'</div><h4>On you</h4><div class="ifx">'+fx+'</div></div></div>'+
    '<div class="hint">'+(touch.on?'Tap to choose · <button data-a="close">Close</button>':pad.id?'Stick or D-pad choose · A make active · Back drink · Y throw · LB / RB move · B close':'Arrows choose · Enter make active · H drink · B throw · Shift+← → move · I or Esc close')+'</div>';
  el.classList.remove('hidden');
  talk.opts=Array.from({length:PC+ING_N},(_,i)=>({fn:i<BELT_MAX?()=>{if(POT.belt[i]){POT.sel=i;POT.hudK='';sfx('pick')}}:()=>{}}));talk.sel=f;
}
function invKey(e){
  const c=e.code;
  if(c==='Escape'||c==='KeyI'||c==='KeyQ'||c==='Tab'){e.preventDefault();closeTalk();return}
  if(e.shiftKey&&(c==='ArrowLeft'||c==='KeyA')){invMove(-1);return}
  if(e.shiftKey&&(c==='ArrowRight'||c==='KeyD')){invMove(1);return}
  if(c==='ArrowLeft'||c==='KeyA')invNav(-1,0);else if(c==='ArrowRight'||c==='KeyD')invNav(1,0);
  else if(c==='ArrowUp'||c==='KeyW')invNav(0,-1);else if(c==='ArrowDown'||c==='KeyS')invNav(0,1);
  else if(c==='Enter'||c==='KeyE'||c==='Space'){talk.sel=INV.focus;pickTalk()}
  else if(c==='KeyH')invUse(false);else if(c==='KeyB')invUse(true);
  else if(/^Digit[1-6]$/.test(c)){INV.focus=+c.slice(5)-1;invBuild()}
}
function invPad(hit,gp){
  const sx=(gp.axes[0]||0)>0.6?1:(gp.axes[0]||0)<-0.6?-1:0,sy=(gp.axes[1]||0)>0.6?1:(gp.axes[1]||0)<-0.6?-1:0;
  if(hit(12)||sy<0&&pad.psy!==-1)invNav(0,-1);else if(hit(13)||sy>0&&pad.psy!==1)invNav(0,1);
  if(hit(14)||sx<0&&pad.psx!==-1)invNav(-1,0);else if(hit(15)||sx>0&&pad.psx!==1)invNav(1,0);
  pad.psy=sy;pad.psx=sx;
  if(hit(4))invMove(-1);if(hit(5))invMove(1);
  if(hit(0)||hit(2)){talk.sel=INV.focus;pickTalk()}else if(hit(8))invUse(false);else if(hit(3))invUse(true);else if(hit(1)||hit(9)||hit(11))closeTalk();
}
// little hot-bar pictures of each weapon
const WICON={
  sword:'<svg width="32" height="40" viewBox="0 0 32 40"><path d="M25 3 L14 22 L17 24 L28 5 Z" fill="#d8d8de" stroke="#fff" stroke-width=".6"/><rect x="9" y="22" width="11" height="3" rx="1" transform="rotate(30 14 24)" fill="#c9a24a"/><rect x="9" y="25" width="3" height="9" rx="1" transform="rotate(30 10 29)" fill="#6a4423"/></svg>',
  hammer:'<svg width="32" height="40" viewBox="0 0 32 40"><rect x="14" y="10" width="3.5" height="27" rx="1" fill="#7a4e28" transform="rotate(20 16 24)"/><rect x="8" y="4" width="18" height="10" rx="2" fill="#8a8f99" stroke="#cfd3da" stroke-width=".8" transform="rotate(20 16 9)"/></svg>',
  crossbow:'<svg width="32" height="40" viewBox="0 0 32 40"><rect x="14.5" y="8" width="3" height="28" rx="1" fill="#a0703a"/><path d="M3 15 Q16 4 29 15" stroke="#555" stroke-width="2.4" fill="none"/><path d="M3 15 L16 20 L29 15" stroke="#eee" stroke-width=".8" fill="none"/><path d="M16 3 L14 9 L18 9 Z" fill="#ccc"/></svg>',
  spear:'<svg width="32" height="40" viewBox="0 0 32 40"><rect x="15" y="9" width="2.4" height="30" rx="1" fill="#7a5a34" transform="rotate(25 16 24)"/><path d="M23 1 L19 11 L24 12 Z" fill="#d8d8de" stroke="#fff" stroke-width=".5"/></svg>',
  censer:'<svg width="32" height="40" viewBox="0 0 32 40"><path d="M16 2 Q14 10 16 18" stroke="#d0a050" stroke-width="1.4" stroke-dasharray="2 1.5" fill="none"/><circle cx="16" cy="25" r="8" fill="#b9822e" stroke="#ffd080" stroke-width="1"/><circle cx="16" cy="25" r="3.5" fill="#ffb040"/><circle cx="16" cy="25" r="6" fill="rgba(255,170,60,.35)"/></svg>'};
function potSel(d){if(!POT.belt.length)return;POT.sel=(POT.sel+d+POT.belt.length)%POT.belt.length;POT.hudK='';sfx('pick')}


/* ---------- the Blacksmith and his weapons (data in src/weapons.js) ---------- */
// He works an anvil in the last free corner of every sanctuary. Weapons, path levels and augments are bought with gems and kept forever.
// Left click (pad RT, touch ATTACK) attacks with the weapon in hand; Y switches weapons. Monsters now have health: weapons wound them in
// their own ways (bleeding, burning, pinning, knocking into walls...) and a monster that dies comes back somewhere else a while later.
// Networking: the attacker works out what it hit and sends {k:'wh'} to the host, who owns monster health; the host streams health back.
const SMITH=(()=>{const s=store.get('smith',null)||{},o={own:{},xp:{},p1:{},p2:{},eq:''};
  for(const w of WEAPONS){const id=w.id;o.own[id]=!!(s.own&&s.own[id]);o.xp[id]=Math.max(0,+((s.xp||{})[id])||0);
    o.p1[id]=clamp(Number.isInteger((s.p1||{})[id])?s.p1[id]:-1,-1,4);o.p2[id]=clamp(Number.isInteger((s.p2||{})[id])?s.p2[id]:-1,-1,5);if(o.p2[id]===o.p1[id])o.p2[id]=-1;
    // from the old system (levels and augments bought with gems): every gem spent becomes 6 XP on that weapon
    if(!s.v2&&s.lv&&s.lv[id]){let g=0;(s.lv[id]||[]).forEach(l=>{for(let k=0;k<clamp(l|0,0,5);k++)g+=[4,7,11,16,22][k]});(s.aug&&s.aug[id]||[]).forEach(a=>{if(a)g+=25});o.xp[id]+=g*6}}
  o.eq=o.own[s.eq]?s.eq:'';o.v2=1;return o})();
const smithSave=()=>store.set('smith',SMITH);
const W={cd:0,swing:0,swingT:0.3,n:0,parryT:0,safeT:0,auraT:1,pulseT:6,shots:[],hint:false};
// ---- weapon levels: every weapon earns XP from fighting (damage dealt, more for a kill). Levels 1-3 sharpen it; at level 4 you choose
// one of its five paths at the Blacksmith, and it ranks up with each level to 8; at level 10 you choose a second path from the other
// four, or a mutation of the first (its augment, borrowed from another weapon, and two more ranks). Every level adds 5% damage.
const WMAX=15,W_PATH_AT=4,W_SECOND_AT=10;
const wNeed=L=>30+25*(L-1);   // XP from level L to the next
function wLevelOf(xp){let L=1;xp=Math.max(0,xp||0);while(L<WMAX&&xp>=wNeed(L)){xp-=wNeed(L);L++}return {L,into:xp,need:L<WMAX?wNeed(L):0}}
function wRanks(id){
  const L=wLevelOf(SMITH.xp[id]).L,p1=SMITH.p1[id],p2=SMITH.p2[id],R=[0,0,0,0,0],A=[false,false,false,false,false];
  if(p1>=0){R[p1]=clamp(L-(W_PATH_AT-1),0,5);if(p2===5&&L>=W_SECOND_AT){A[p1]=true;R[p1]+=clamp(L-W_SECOND_AT,0,2)}}
  if(p2>=0&&p2<5&&L>=W_SECOND_AT)R[p2]=clamp(L-(W_SECOND_AT-1),0,5);
  return {L,R,A};
}
const wStats=id=>{const q=wRanks(id),st=WEAPON[id].stats(q.R,q.A);st.dmg*=1+0.05*(q.L-1);if(st.jav)st.jav.every=Math.max(1,st.jav.every);return st};
// 1: a path to choose (level 4), 2: a second path or a mutation (level 10), 0: nothing waiting
const wChoice=id=>{const L=wLevelOf(SMITH.xp[id]).L;return L>=W_PATH_AT&&!(SMITH.p1[id]>=0)?1:L>=W_SECOND_AT&&!(SMITH.p2[id]>=0)?2:0};
function wGainXp(id,a){
  if(!id||!SMITH.own[id]||!(a>0)||archiveRun)return;
  const L0=wLevelOf(SMITH.xp[id]).L;SMITH.xp[id]+=a;const L1=wLevelOf(SMITH.xp[id]).L;
  if(!W.saveT)W.saveT=setTimeout(()=>{W.saveT=0;smithSave()},1500);POT.hudK='';
  if(L1>L0){smithSave();[659,880,1175].forEach((f,i)=>tone(f,0.25,'triangle',0.1,i*0.09));
    say(WEAPON[id].name+' reached level '+L1+'!'+(L1===W_PATH_AT?' Visit the Blacksmith to choose its path.':L1===W_SECOND_AT?' Visit the Blacksmith: a second path, or a mutation.':''),3.2)}
}
const W_KILL_XP={0:12,1:20,2:8,4:18,5:16,8:4,9:80,10:22};
const wXpFor=L=>{let x=0;for(let k=1;k<L;k++)x+=wNeed(k);return x};   // total XP to reach level L
const wHeld=()=>SMITH.eq&&SMITH.own[SMITH.eq]?SMITH.eq:'';
const wMaxHp=s=>s.type===6?s.hpMax||10:s.type===10?SPI.hp(s.lv||1)*(1+0.06*Math.max(0,R.depth-1)):s.type===8?2:s.type===9?TROLL.hp*(1+0.06*Math.max(0,R.depth-1)):(s.type===1?10:s.type===2?3:s.type===4?8:s.type===5?7:6)*(1+0.06*Math.max(0,R.depth-1));
function wCycle(){
  const L=WEAPONS.filter(w=>SMITH.own[w.id]).map(w=>w.id);if(!L.length){say('No weapons yet. The Blacksmith in the sanctuary forges them.',2.5);return}
  const i=L.indexOf(SMITH.eq);SMITH.eq=L[(i+1)%L.length];smithSave();sfx('key');say(WEAPON[SMITH.eq].name+' in hand',1.5);
}
// ---- attacking
function wAttack(){
  const id=wHeld();if(!id||!canUse()||potHeld()||W.cd>0||FX.curl===1)return;
  if(FX.baby>0){if(!W.babyT||R.time-W.babyT>3){W.babyT=R.time;say('Your hands are too small to hold it.',1.6)}return}
  const w=WEAPON[id],st=wStats(id);
  W.cd=st.cd;W.n++;W.swing=1;W.swingT=Math.min(0.35,st.cd*0.8);W.kind=id;
  const dbl=st.every&&W.n%st.every===0?2:1;
  if(w.kind==='shot'){
    wShoot(st,0);if(st.shot.extraEvery&&W.n%st.shot.extraEvery===0)wShoot(st,0.06);
    tone(220,0.12,'triangle',0.12,0,-120);noise(0.12,0.12,2400,2);return;
  }
  noise(0.16,0.13,id==='hammer'?500:1400,0.8);
  const spin=Math.random()<(st.spin||0),arc=(spin?360:st.arc)*Math.PI/360,fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);
  if(st.lunge){potBlinkSafe(st.lunge);if(st.lungeSafe)W.safeT=0.4}
  if(st.step)potBlinkSafe(st.step);
  const T=[];
  for(const s of F.shades){
    if(s.x<0||s.dead)continue;
    const dx=s.x-P.x,dz=s.z-P.z,d=Math.hypot(dx,dz),sr=s.rad||0;if(d>st.range+0.25+sr||d<0.01)continue;
    const a=Math.acos(clamp((dx*fx+dz*fz)/d,-1,1));if(a>arc+(sr?Math.atan2(sr,d):0)&&d>0.45+sr)continue;
    if(!los(P.x,P.z,s.x,s.z))continue;T.push([d,s]);
  }
  T.sort((a,b)=>a[0]-b[0]);
  const hits=[];
  for(const [,s] of st.multi||spin?T:T.slice(0,1)){
    if(s.type===3){banish(s,false);continue}   // watchers are your own; a blow sends one away
    hits.push(wHit(st,s,dbl));wSpark(s.x,0.55,s.z,w.col);
  }
  if(spin){wRing(P.x,P.z,st.range,st.spinStun?'#fff4c0':w.col);if(st.spinStun)for(const [,s] of T)if(s.type===0)hits.push({i:F.shades.indexOf(s),d:0,st:1.5})}
  if(st.jav&&W.n%st.jav.every===0)wShoot({dmg:st.jav.dmg,stun:0.3,kb:0.2,shot:{speed:15,pierce:1,blast:st.jav.blast,blastFrac:0.6}},0,true);
  if(hits.length){wSend(hits);tone(id==='hammer'?70:140,0.12,'square',0.12,0,-40);if(id==='hammer')pkShake=Math.max(pkShake,0.35)}
  if(st.parry)W.parryT=st.parry;
  if(st.fuel&&hits.length){P.fuel=Math.min(100,P.fuel+st.fuel*hits.length);lowFuelSaid=false}
}
function potBlinkSafe(d){const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);let k=0;for(let s=0.05;s<=d;s+=0.05){if(blocked(P.x+fx*s,P.z+fz*s))break;k=s}P.x+=fx*k;P.z+=fz*k;onTileChange()}
// one blow against one monster, worked out on the attacker's side (it can see stuns, frost and marks), applied by the host
function wHit(st,s,dbl=1){
  const c=(s.pv|0)&31,stone=s.type===1||c===1||c===4||c===5,dazed=s.stun>0||stone,lit=s.type===0||s.type===2;
  let d=st.dmg*dbl*(dazed?st.shatter||1:1)*(lit?st.light||1:1)*(ps('weak')?0.5:1);
  const dx=s.x-P.x,dz=s.z-P.z,l=Math.hypot(dx,dz)||1;
  const h={i:F.shades.indexOf(s),d:Math.round(d*100)/100,st:st.stun||0,kb:st.kb||0,dx:r3(dx/l),dz:r3(dz/l)};
  if(st.bleed)h.bl=st.bleed;if(st.burn)h.bu=st.burn;
  const mk=(st.mark||0)||(st.markOnBleed&&st.bleed?4:0)||(st.markShade&&s.type===0?5:0);if(mk){h.mk=mk;h.mb=st.markBonus||0.15}
  if(st.root&&Math.random()<st.root){h.rt=st.rootT;if(st.rootQuake)h.rq=1}
  if(st.smoke){h.sm=st.smoke;if(st.slowSmoke)h.sl=st.smoke}
  if(st.quakeR){h.qr=st.quakeR;h.qt=st.quakeT;if(st.quakeSmoke)h.qs=1}
  if(st.killShards)h.ks=st.killShards;if(st.killBlast)h.kx=st.killBlast;if(st.wallStun)h.ws=st.wallStun;if(st.wallPin)h.wp=st.wallPin;
  return h;
}
function wSend(hits){
  if(!hits.some(h=>h.ddr))wGainXp(wHeld(),hits.reduce((a,h)=>a+(+h.d||0),0));
  if(MP.guest)mpSend({k:'wh',d:R.depth,h:hits},MP.hostId);
  else for(const h of hits)wApply(h,potMe());
}
// ---- the host: health, knockback, wounds and death
function wApply(h,by){
  const s=F.shades[h.i];if(!s||s.x<0||s.dead||s.type===3||s.down>0)return;
  if(!(s.hpMax>0)){s.hpMax=wMaxHp(s);s.hp=s.hpMax}
  if(s.type===6){if(s.immune&&!h.ddr){if(by===potMe()&&(BS.said.imm||0)<R.time-4){BS.said.imm=R.time;say('It does not even flinch. He only respects the dance.',2.2)}return}if(!bossStruck(s))return}
  const e=s.pe||{};if(e.dodge&&Math.random()<0.5){s.hpShow=1;return}   // Lucky Clover / Phantom Step on a monster: half the blows miss
  const dmg=+h.d*(s.markT>0?1+(s.markB||0):1)*(e.tough?0.5:1)*(e.vuln?(s.pk&&s.pk.vm||2):1)*bossArmor(s);
  const big=s.type===6&&s.role!=='add';   // a boss shrugs off most of a stun and cannot be shoved or pinned
  s.hp-=dmg;s.hitT=0.25;s.hpShow=4;
  if(h.st)s.stun=Math.max(s.stun,big?Math.min(+h.st,0.25):+h.st);if(s.type!==1&&s.type!==6&&h.st)s.state=0;
  if(h.kb>0&&(h.dx||h.dz)&&!big){   // knockback, and a slam if a wall gets in the way
    let k=0;for(let q=0.05;q<=h.kb;q+=0.05){const x=s.x+h.dx*q,z=s.z+h.dz*q,tx=Math.floor(x),tz=Math.floor(z);if(tx<0||tz<0||tx>=F.W||tz>=F.H||F.g[tz*F.W+tx]||F.safeMask[tz*F.W+tx])break;k=q}
    if(k>0)potPlace(s,s.x+h.dx*k,s.z+h.dz*k);
    if(k<h.kb-0.06){if(h.ws)s.stun=Math.max(s.stun,(+h.st||0)+ +h.ws);if(h.wp)mHold(s,'web',+h.wp)}
  }
  if(h.bl)s.bleed={dps:+h.bl,t:4};if(h.bu)s.burnD={dps:+h.bu,t:3};
  if(h.mk){pe(s,'reveal',+h.mk);s.markT=+h.mk;s.markB=+h.mb||0.15}
  if(h.rt&&!big){mHold(s,'web',+h.rt);if(h.rq)for(const o of potMons(s.x,s.z,1.3,false))if(o!==s)o.stun=Math.max(o.stun,1.5)}
  if(h.sm){pe(s,'lost',+h.sm);if(h.sl)pe(s,'slow',+h.sm)}
  if(h.qr)for(const o of potMons(s.x,s.z,+h.qr,false)){o.stun=Math.max(o.stun,+h.qt||1);if(h.qs)pe(o,'lost',3)}
  s.killer=by;s.ks=+h.ks||0;s.kx=+h.kx||0;
  if(s.hp<=0)wKill(s);
}
function wKill(s){
  if(s.type===6){bossKill(s);return}
  const burning=!!s.burnD,x=s.x,z=s.z,by=s.killer,near=Math.hypot(x-P.x,z-P.z)<14;
  if(near){potBurst(x,0.5,z,s.type===2?[0.4,0.6,1]:s.type===1?[0.7,0.68,0.62]:[0.45,0.25,0.6],30,1);tone(110,0.5,'sawtooth',0.12,0,-80);noise(0.4,0.15,700,0.8)}
  s.x=s.z=-99;s.state=0;s.pe=null;s.bleed=s.burnD=null;s.markT=0;s.down=40+Math.random()*30;s.hp=0;
  if(s.type===10){s.down=4;s.lv=(s.lv||1)+1;spiSync=1;if(near)say('The spider curls up... then skitters off into the dark. It will be back, bigger.',3.5)}   // level up, back soon
  if(s.type===8){s.down=0;slugSplit(s)}   // one gone, two more
  if(s.ks)for(const o of potMons(x,z,1.6,false))wApply({i:F.shades.indexOf(o),d:s.ks,st:0.5,kb:0.3,dx:r3((o.x-x)/(Math.hypot(o.x-x,o.z-z)||1)),dz:r3((o.z-z)/(Math.hypot(o.x-x,o.z-z)||1))},by);
  if(s.kx&&burning)for(const o of potMons(x,z,1.4,false))wApply({i:F.shades.indexOf(o),d:s.kx,st:0.8},by);
  if(by===potMe())wReward(s.type);else if(by)mpSend({k:'wk',d:R.depth,t:s.type},by);
}
function wReward(type){
  wGainXp(wHeld(),W_KILL_XP[type]||10);
  const g=type===9?12:type===1?3:type===2?1:type===4?4:type===5?3:2;wallet+=g;R.gems+=g;R.score+=25*R.depth;store.set('wallet',wallet);sfx('gem');
  say('Slain! +'+g+' gem'+(g>1?'s':''),1.4);
}
// the host's per-frame wound ticks, and monsters coming back
function wMonTick(dt){
  for(const s of F.shades){
    if(s.down>0){s.down-=dt;s.x=s.z=-99;if(s.down<=0){s.down=0;s.hp=s.hpMax=wMaxHp(s);potFar(s,14);s.stun=0;s.state=0}continue}
    if(s.x<0||s.dead)continue;
    if(s.hitT>0)s.hitT-=dt;if(s.hpShow>0)s.hpShow-=dt;if(s.markT>0)s.markT-=dt;
    let dps=0;
    if(s.bleed){dps+=s.bleed.dps;s.bleed.t-=dt;if(s.bleed.t<=0)s.bleed=null}
    if(s.burnD){dps+=s.burnD.dps;s.burnD.t-=dt;if(s.burnD.t<=0)s.burnD=null}
    if(dps>0&&s.hpMax>0){s.hp-=dps*dt;s.hpShow=Math.max(s.hpShow,1);if(s.hp<=0)wKill(s)}
  }
}
// ---- the player's own side each frame: cooldowns, the aura, bolts in flight, and what blocks a blow
function wTick(dt){
  W.cd=Math.max(0,W.cd-dt);W.swing=Math.max(0,W.swing-dt/W.swingT);W.parryT=Math.max(0,W.parryT-dt);W.safeT=Math.max(0,W.safeT-dt);
  const id=wHeld();
  if(id&&state==='play'&&!P.down){
    const st=wStats(id);
    if((W.hold&&document.pointerLockElement===canvas||touch.atk)&&W.cd<=0&&!nearNpc&&!nearDoor)wAttack();   // hold to keep swinging
    if(st.aura){W.auraT-=dt;if(W.auraT<=0){W.auraT=1;const hs=[];for(const s of F.shades)if(s.x>0&&!s.dead&&s.type!==3&&Math.hypot(s.x-P.x,s.z-P.z)<1.1)hs.push({i:F.shades.indexOf(s),d:st.aura});if(hs.length)wSend(hs)}}
    if(st.auraPulse){W.pulseT-=dt;if(W.pulseT<=0){W.pulseT=st.auraPulse;const hs=[];for(const s of F.shades)if(s.x>0&&!s.dead&&s.type!==3&&Math.hypot(s.x-P.x,s.z-P.z)<1.8)hs.push({i:F.shades.indexOf(s),d:0,st:1.5});wRing(P.x,P.z,1.8,'#ffc070');if(hs.length)wSend(hs)}}
  }
  for(let i=W.shots.length-1;i>=0;i--){
    const q=W.shots[i];let end=false;
    for(let k=0;k<3&&!end;k++){
      const h=dt/3;q.x+=q.vx*h;q.z+=q.vz*h;q.t+=h;
      if(solidAt(q.x,q.z)||q.t>q.life){end=true;break}
      for(const s of F.shades){
        if(s.x<0||s.dead||q.hit.has(s)||Math.hypot(s.x-q.x,s.z-q.z)>0.35+(s.rad||0))continue;
        q.hit.add(s);if(s.type===3){banish(s,false);continue}
        const st=q.st,last=q.left<=0;const hh=wHit(st,s);hh.dx=r3(q.vx/q.sp);hh.dz=r3(q.vz/q.sp);
        if(last&&st.shot.pinLast){hh.rt=1.5}
        const hits=[hh];wSpark(s.x,0.55,s.z,'#ffe0a0');
        if(st.shot.blast)wBlast(q,st,hits,s);
        wSend(hits);tone(180,0.08,'square',0.08);
        if(q.left--<=0){end=true;break}
      }
    }
    if(end){if(q.st.shot.blast&&!q.blasted)wBlast(q,q.st,null,null);W.shots.splice(i,1)}
  }
}
function wBlast(q,st,hits,skip){
  q.blasted=true;const r=st.shot.blast,out=hits||[];wRing(q.x,q.z,r,'#ff9040');noise(0.25,0.18,600,0.8);
  for(const s of F.shades)if(s!==skip&&s.x>0&&!s.dead&&s.type!==3&&Math.hypot(s.x-q.x,s.z-q.z)<r){const h={i:F.shades.indexOf(s),d:r3(st.dmg*st.shot.blastFrac),st:0.4};if(st.burn)h.bu=st.burn;out.push(h)}
  if(!hits&&out.length)wSend(out);
}
function wShoot(st,off,jav){
  const a=P.yaw+off,sp=st.shot.speed,y=playerEye()-0.12;
  W.shots.push({x:P.x+Math.cos(a)*0.2,y,z:P.z+Math.sin(a)*0.2,vx:Math.cos(a)*sp,vz:Math.sin(a)*sp,sp,t:0,life:(st.range||14)/sp,left:st.shot.pierce|0,hit:new Set(),st,jav:!!jav});
}
// true when the weapon (a parry, a lunge, the maul's bulwark) takes a blow instead of you
function wHurt(s){
  const id=wHeld();if(!id)return false;const st=wStats(id);
  if(W.parryT>0||W.safeT>0){
    if(s){s.stun=Math.max(s.stun,2.5);s.state=0;s.calm=6}
    if(W.parryT>0&&st.parryQuake){wRing(P.x,P.z,1.6,'#fff');const hs=[];for(const o of F.shades)if(o.x>0&&!o.dead&&o.type!==3&&Math.hypot(o.x-P.x,o.z-P.z)<1.6){const dx=o.x-P.x,dz=o.z-P.z,l=Math.hypot(dx,dz)||1;hs.push({i:F.shades.indexOf(o),d:0,st:2,kb:0.8,dx:r3(dx/l),dz:r3(dz/l)})}if(hs.length)wSend(hs)}
    tone(1800,0.2,'triangle',0.12);tone(1200,0.3,'triangle',0.08,0.05);say(W.parryT>0?'Parried!':'Untouchable!',1.2);P.inv=1;return true;
  }
  if(st.block&&Math.random()<st.block){
    if(s){s.stun=Math.max(s.stun,1.5);if(st.blockBurn)wSend([{i:F.shades.indexOf(s),d:0,bu:1}])}
    tone(300,0.2,'square',0.1);say('You shrug it off',1.2);P.inv=1;return true;
  }
  return false;
}
// ---- little effects
function wSpark(x,y,z,col){const c=hex3(col);for(let i=0;i<10;i++){const a=Math.random()*6.283,u=1+Math.random()*2;POT.fx.push({x,y,z,vx:Math.cos(a)*u,vy:1+Math.random()*2,vz:Math.sin(a)*u,t:0,life:0.35,c,s:0.05})}}
function wRing(x,z,r,col){POT.fx.push({x,y:0.08,z,ring:r,t:0,life:0.45,c:hex3(col)})}
// the weapon in your left hand, drawn with the torch hand (squeezed toward the eye, so it never pokes through a wall)
function wDrawHand(t,ex,ey,ez,yaw,pitch){
  const id=wHeld();if(!id)return;
  const sw=Math.sin(P.bob)*0.006,up=Math.abs(Math.cos(P.bob))*0.007-Math.min(0.03,Math.max(-0.03,P.vy*0.006));
  const f={p:[ex,ey,ez],R:m3(rYaw(yaw),rZ(pitch*0.85)),lo:[0.2,0.4,0.6]};
  const skin=[0.74,0.54,0.42,1],lea=[0.3,0.2,0.12,3];
  const h=[0.2,-0.16+up,-0.16+sw];
  seg(f,[0.02,-0.33+up,-0.29+sw],[h[0]-0.03,h[1]-0.02,h[2]-0.01],0.034,0.024,lea);ball(f,h,[0.024,0.022,0.024],skin);
  wDrawHeldWeapon(t,id,f,h);
}
function wDrawHeldWeapon(t,id,f,h){
  const lea=[0.3,0.2,0.12,3],steel=[0.75,0.76,0.8,4],dark=[0.2,0.18,0.17,4],wood=[0.4,0.26,0.13,6],brass=[0.8,0.6,0.25,4];
  const p=W.swing,e=p*p*(3-2*p),up=h[1]+0.16,sw=h[2]+0.16;
  const dir=(a,b,c)=>{const l=Math.hypot(a,b,c);return [a/l,b/l,c/l]},at=(d,k)=>[h[0]+d[0]*k,h[1]+d[1]*k,h[2]+d[2]*k];
  if(id==='sword'){
    const d=dir(0.55+0.4*e,1-1.6*e,0.25+0.5*e);
    seg(f,at(d,-0.025),at(d,0.025),0.009,0.009,lea);slab(f,at(d,0.03),[0.005,0.005,0.024],brass);seg(f,at(d,0.034),at(d,0.15),0.008,0.002,[0.62,0.63,0.68,4]);
  }else if(id==='hammer'){
    const d=dir(0.5+0.8*e,1-1.4*e,0.2);
    seg(f,at(d,-0.02),at(d,0.11),0.007,0.007,wood);const hd=at(d,0.12);slab(f,hd,[0.022,0.017,0.034],dark);
  }else if(id==='crossbow'){
    const k=0.02*e,c=[0.24-k,-0.15+up+e*0.01,-0.08+sw];
    seg(f,[c[0]-0.12,c[1]-0.02,c[2]],[c[0]+0.06,c[1],c[2]],0.013,0.011,wood);
    seg(f,[c[0]+0.05,c[1],c[2]-0.07],[c[0]+0.03,c[1],c[2]+0.07],0.006,0.006,dark);
    seg(f,[c[0]+0.03,c[1]+0.004,c[2]-0.07],[c[0]-0.02,c[1]+0.006,c[2]],0.0015,0.0015,[0.9,0.9,0.85,5]);seg(f,[c[0]+0.03,c[1]+0.004,c[2]+0.07],[c[0]-0.02,c[1]+0.006,c[2]],0.0015,0.0015,[0.9,0.9,0.85,5]);
    if(W.cd<0.1)seg(f,[c[0]-0.02,c[1]+0.012,c[2]],[c[0]+0.09,c[1]+0.012,c[2]],0.003,0.003,steel);
  }else if(id==='spear'){
    const th=0.16*e,a=[0.12+th,-0.2+up,-0.12+sw],b=[0.5+th,-0.1+up,-0.06+sw];
    seg(f,a,b,0.007,0.007,wood);seg(f,b,[b[0]+0.07,b[1]+0.017,b[2]+0.009],0.014,0.001,steel);
  }else if(id==='censer'){
    const sa=Math.sin(t*2.2)*0.25+(1-2*e)*0.9*(p>0?1:0),L=0.06,c=[h[0]+Math.sin(sa)*0.05,h[1]-L*Math.cos(sa*0.5),h[2]+Math.sin(sa)*0.06];
    for(let i=1;i<6;i++){const k=i/6;ball(f,[h[0]+(c[0]-h[0])*k,h[1]+(c[1]-h[1])*k,h[2]+(c[2]-h[2])*k],0.004,brass,true)}
    ball(f,c,0.02,brass);ball(f,[c[0],c[1]+0.008,c[2]],[0.014,0.005,0.014],[2.4,1.1,0.3,7],true);
    return fpt(f,c);
  }
  return null;
}
// bolts in flight, health bars and the hit flash (spr and CH primitives, drawn with the creatures)
function wDraw(t,ex,ez,rx,rz){
  for(const q of W.shots){const B={p:[q.x,q.y,q.z],R:rYaw(Math.atan2(q.vz,q.vx))};
    if(q.jav){seg(B,[-0.35,0,0],[0.1,0,0],0.012,0.012,[0.5,0.9,1.4,7]);seg(B,[0.1,0,0],[0.2,0,0],0.02,0.001,[0.8,1.4,2,7]);spr(q.x,q.y,q.z,0.3,0.3,7,0.5,0.8,1,0.5,1)}
    else{seg(B,[-0.2,0,0],[0.1,0,0],0.006,0.006,[0.4,0.26,0.13,6]);seg(B,[0.1,0,0],[0.15,0,0],0.012,0.001,[0.75,0.76,0.8,4])}}
  for(const s of F.shades){
    if(s.x<0||s.dead||!(s.hpShow>0)||(s.x-ex)**2+(s.z-ez)**2>12*12||s.type===6&&s.role!=='add')continue;
    const pc=clamp(MP.guest?(s.hpPct|0)/100:s.hp/(s.hpMax||1),0,1),y=s.type===2?0.88:s.type===1?1.08:s.type===3?1.15:1.19,w=0.44,a=Math.min(1,s.hpShow);
    // a small bar facing the camera, made of two glowing slabs (sprites are too soft for a crisp bar)
    // just under the 1.25 m ceiling, nudged toward you so a hood does not hide it
    const B={p:[s.x-rz*0.25,y,s.z+rx*0.25],R:rYaw(Math.atan2(-rx,rz))},o=(1-pc)*w/2,k=a;
    slab(B,[0.012,0,0],[0.008,0.03,w/2+0.015],[0.02,0.02,0.02,8]);
    if(pc>0)slab(B,[-0.004,0,-o],[0.008,0.02,w/2*pc],[(pc>0.5?0.5:2)*k,(pc>0.5?2:pc>0.25?1.2:0.3)*k,0.2*k,7]);
  }
}
// ---- the Blacksmith: a burly, bald smith in a leather apron, striking a glowing bar on his anvil
function smithPlace(safe,npcs){
  if(!safe)return;
  const booth=safe.room?.booths.find(b=>b.type==='smith');
  const used=[[1,1]];if(safe.wheel)used.push([Math.sign(safe.wheel.x-safe.x),Math.sign(safe.wheel.z-safe.z)]);if(safe.brew)used.push([Math.sign(safe.brew.cx-safe.x),Math.sign(safe.brew.cz-safe.z)]);
  const c=[[-1,-1],[1,-1],[-1,1]].find(q=>!used.some(u=>u[0]===q[0]&&u[1]===q[1]));if(!booth&&!c)return;
  const bx=booth?.x??safe.x+c[0]*0.58,bz=booth?.z??safe.z+c[1]*1.0;
  const ax=booth?bx-0.45:safe.x+c[0]*1.03,az=booth?bz:safe.z+c[1]*1.0;
  safe.smith={x:bx,z:bz,ax,az,disc:[ax,az,0.18]};
  npcs.push({type:'smith',x:bx,z:bz,ph:(safe.tx*5.13+safe.ty*2.9)%6.28,used:true,lock:true,
    yaw:booth?Math.atan2(booth.nz,booth.nx):Math.atan2(safe.z-bz,safe.x-bx)});
}
function smithCollide(){
  const b=F.safe&&F.safe.smith;if(!b)return;const q=b.disc,dx=P.x-q[0],dz=P.z-q[1],d=Math.hypot(dx,dz),m=q[2]+PR;
  if(d<m&&d>1e-4){const nx=q[0]+dx/d*m,nz=q[1]+dz/d*m;if(!blocked(nx,nz)){P.x=nx;P.z=nz}}
}
function smithBuild(n,B,t,ph,breath,blink,talking,out){
  const skin=[0.7,0.48,0.34,1],apron=[0.3,0.18,0.09,3],shirt=[0.3,0.26,0.22,2],pants=[0.18,0.16,0.15,2],boot=[0.14,0.1,0.07,3],hair=[0.08,0.07,0.06,5],
        iron=[0.12,0.12,0.13,4],wood=[0.38,0.24,0.12,6];
  const b=F.safe&&F.safe.smith;let al=[0.45,0,0];
  if(b){const dx=b.ax-B.p[0],dz=b.az-B.p[2],c=Math.cos(n.yaw),s=Math.sin(n.yaw);al=[c*dx+s*dz,0,-s*dx+c*dz]}
  // strikes the bar every 1.6 s (unless he is talking to you)
  const cyc=talking?0.2:((t*0.62+ph)%1),raise=cyc<0.75?Math.sin(cyc/0.75*Math.PI*0.5):1-(cyc-0.75)/0.25,hitNow=!talking&&cyc>0.97;
  for(const z of[-1,1]){
    seg(B,[0,0.46,z*0.07],[0.01,0.24,z*0.08],0.062,0.052,pants);ball(B,[0.01,0.24,z*0.08],0.052,pants,true);seg(B,[0.01,0.24,z*0.08],[0,0.06,z*0.085],0.052,0.045,pants);
    ball(B,[0.04,0.035,z*0.085],[0.08,0.04,0.05],boot,true);
  }
  const U=subF(B,[0,0.46,0],rZ(-0.08));
  seg(U,[0,-0.04,0],[0,0.06,0],0.13,0.12,[0.22,0.14,0.07,3]);
  ball(U,[0,0.17+breath,0],[0.1,0.15,0.15],shirt);
  slab(U,[0.1,0.1,0],[0.02,0.2,0.11],apron,rZ(0.05));
  for(const z of[-1,1])ball(U,[0,0.28+breath,z*0.15],[0.07,0.06,0.07],shirt,true);
  // where the anvil's face is, in his frame; the hammer arm comes down on it
  const top=[al[0]-0.02,0.3,al[2]],side=Math.sign(al[2]||1);
  const sh=fpt({p:[0,0.46,0],R:rZ(-0.08)},[0,0.28+breath,side*0.15]),hand=[sh[0]+0.16+0.05*raise,0.42+0.3*raise,sh[2]+(top[2]-sh[2])*0.6];
  limb(B,sh,[sh[0]+0.08,sh[1]-0.08+0.12*raise,sh[2]+(hand[2]-sh[2])*0.5],hand,0.05,0.045,0.035,skin,skin,skin,0.035);
  const hd=[hand[0]+0.06+0.05*(1-raise),hand[1]+0.02-0.12*(1-raise),hand[2]];
  seg(B,hand,hd,0.01,0.01,wood);slab(B,hd,[0.03,0.025,0.025],iron);
  // tongs holding the bar
  const sh2=fpt({p:[0,0.46,0],R:rZ(-0.08)},[0,0.28+breath,-side*0.15]),h2=[sh2[0]+0.18,0.36,sh2[2]+(top[2]-sh2[2])*0.45];
  limb(B,sh2,[sh2[0]+0.1,0.32,sh2[2]],h2,0.05,0.045,0.035,skin,skin,skin,0.035);
  seg(B,h2,top,0.006,0.005,iron);
  seg(U,[0,0.3+breath,0],[0.01,0.35+breath,0],0.05,0.048,skin);
  const H=subF(U,[0.01,0.345+breath,0],m3(m3(rYaw(n.hy||0),rZ((n.hp||0)+0.05)),rX(Math.sin(t*0.5+ph)*0.03)));
  const HS={p:H.p,R:H.R.map(q=>q*1.08)};
  face(HS,{skin,blink,iris:[0.3,0.22,0.15],brow:hair,browH:0.014,browTilt:-0.15,browOut:0.006,eyeS:0.9,nose:[0.024,0.024,0.02],ears:true,talk:talking?Math.max(0,Math.sin(t*9))*0.008:0});
  ball(HS,[0.06,0.0,0],[0.05,0.07,0.075],hair);ball(HS,[0.075,0.04,0],[0.02,0.01,0.04],hair,true);   // a thick black beard and moustache
  for(const z of[-1,1])ball(HS,[0.0,0.06,z*0.075],[0.03,0.04,0.012],hair,true);
  ball(HS,[0.0,0.13,0],[0.082,0.05,0.084],[skin[0]*1.05,skin[1]*1.05,skin[2]*1.05,1]);                  // bald and shining
  out.top=1.0;
  if(b){
    const A={p:[b.ax,0,b.az],R:rYaw(n.yaw)};
    seg(A,[0,0,0],[0,0.18,0],0.09,0.06,iron);slab(A,[0,0.22,0],[0.1,0.04,0.065],iron);
    seg(A,[0.1,0.22,0],[0.2,0.23,0],0.04,0.004,iron);slab(A,[-0.11,0.23,0],[0.03,0.03,0.05],iron);
    const glow=0.8+0.2*Math.sin(t*3);
    slab(A,[0,0.27,0],[0.06,0.008,0.012],[2.6*glow,0.9*glow,0.25,7]);
    out.anvil=[b.ax,0.28,b.az,hitNow];
  }
}
function smithFx(q,t){
  const [x,y,z,hit]=q;spr(x,y,z,0.35,0.2,7,1,0.45,0.1,0.5,1);
  if(hit&&(W.clangT||0)<t-0.4){W.clangT=t;const d=Math.hypot(x-P.x,z-P.z);if(d<10){const k=1-d/10;tone(1650,0.35,'triangle',0.09*k);tone(2470,0.25,'sine',0.05*k);noise(0.08,0.12*k,5000,3)}
    for(let i=0;i<14;i++){const a=Math.random()*6.283,u=0.6+Math.random()*1.6;POT.fx.push({x,y,z,vx:Math.cos(a)*u,vy:1.2+Math.random()*1.6,vz:Math.sin(a)*u,t:0,life:0.5,c:[1,0.6,0.2],s:0.025})}}
}
const SMITH_LINES=['Steel does not care what it cuts. Pick one and I will make it sing.','Bring me gems and I will bring you an edge.','A blade is only half the work. The rest is how you swing it.','Down there, they only respect what hurts them.'];
function smithTalk(o){
  const b=talk.bm||'main';let text;
  const lvTxt=id=>{const q=wLevelOf(SMITH.xp[id]);return 'Level '+q.L+(q.need?' · '+Math.floor(q.into)+'/'+q.need+' XP':' (max)')};
  const pathTxt=id=>{const w=WEAPON[id],r=wRanks(id),a=SMITH.p1[id],c=SMITH.p2[id],L=[];
    if(a>=0)L.push(w.paths[a].name+' '+r.R[a]+(c===5?' + mutation':''));if(c>=0&&c<5)L.push(w.paths[c].name+' '+r.R[c]);return L.join(' · ')};
  if(b==='main'){
    text=talk.line||SMITH_LINES[(R.depth+(talk.npc.ph*10|0))%SMITH_LINES.length];
    WEAPONS.forEach((w,i)=>{
      const own=SMITH.own[w.id],eq=SMITH.eq===w.id,ch=own&&wChoice(w.id);
      if(own)o.push({head:i?undefined:'Your weapons',label:w.name+(eq?' (in hand)':'')+(ch?' — a choice is waiting!':''),sub:lvTxt(w.id)+(pathTxt(w.id)?' · '+pathTxt(w.id):''),cost:'',fn:()=>{talk.bm='w:'+w.id;talk.sel=0;talk.line=null}});
      else o.push({head:i?undefined:'Your weapons',label:'Forge the '+w.name,sub:w.blurb,cost:w.cost+' gems',off:wallet<w.cost,fn:()=>{
        wallet-=w.cost;store.set('wallet',wallet);SMITH.own[w.id]=true;if(!SMITH.eq)SMITH.eq=w.id;smithSave();sfx('key');
        talk.line='There. The '+w.name+'. It learns as you fight with it: bring it back at level '+W_PATH_AT+' and we will choose its path.';talk.bm='w:'+w.id;talk.sel=0}});
    });
  }else{
    const id=b.slice(2),w=WEAPON[id],q=wLevelOf(SMITH.xp[id]),r=wRanks(id),ch=wChoice(id),p1=SMITH.p1[id],p2=SMITH.p2[id];
    text=talk.line||(ch===1?'Level '+q.L+'. Time to decide what this '+w.name+' becomes. Choose its path.':ch===2?'Level '+q.L+'. It can learn a second path now, or I can push the one it has somewhere stranger.':w.blurb+(SMITH.eq===id?' It is in your hand.':''));
    o.push({label:'Back',sub:'',cost:'',fn:()=>{talk.bm='main';talk.sel=0;talk.line=null}});
    o.push({label:SMITH.eq===id?'Put it away':'Take it in hand',sub:SMITH.eq===id?'Fight bare-handed':'Left click attacks with it',cost:'',fn:()=>{SMITH.eq=SMITH.eq===id?'':id;smithSave();sfx('pick');talk.line=null}});
    o.push({head:'Progress',label:lvTxt(id),sub:q.need?(q.L<W_PATH_AT?'Path choice at level '+W_PATH_AT:q.L<W_SECOND_AT?'Second choice at level '+W_SECOND_AT:'+5% damage with every level')+'. Earn XP by fighting with it.':'Fully forged.',cost:'',off:true,fn:()=>{}});
    if(p1>=0){const P1=w.paths[p1];o.push({head:'Paths',label:P1.name+' — rank '+r.R[p1]+'/'+(p2===5?7:5),sub:'Each rank: '+P1.per+(r.A[p1]?' · Mutation: '+P1.aug.text:''),cost:'',off:true,fn:()=>{}})}
    if(p2>=0&&p2<5){const P2=w.paths[p2];o.push({label:P2.name+' — rank '+r.R[p2]+'/5',sub:'Each rank: '+P2.per,cost:'',off:true,fn:()=>{}})}
    if(ch===1)w.paths.forEach((P,k)=>o.push({head:k?undefined:'Choose a path (level '+W_PATH_AT+')',label:P.name,sub:'Ranks up with every level from '+W_PATH_AT+' to 8. Each rank: '+P.per,cost:'',fn:()=>{
      SMITH.p1[id]=k;smithSave();sfx('shard');talk.line=P.name+'. A good choice. It grows with every level now.'}}));
    if(ch===2){let first=true;w.paths.forEach((P,k)=>{if(k===p1)return;o.push({head:first?'Level '+W_SECOND_AT+': a second path, or a mutation':undefined,label:'Second path: '+P.name,sub:'Ranks up with every level from '+W_SECOND_AT+' to 14. Each rank: '+P.per,cost:'',fn:()=>{
        SMITH.p2[id]=k;smithSave();sfx('shard');talk.line=P.name+' as well. It will take some getting used to.'}});first=false});
      const P1=w.paths[p1],A=P1.aug;o.push({label:'Mutation: '+A.name+' (from the '+WEAPON[A.from].name+')',sub:A.text+' And '+P1.name+' keeps growing: two more ranks, at levels 11 and 12.',cost:'',fn:()=>{
        SMITH.p2[id]=5;smithSave();sfx('shard');talk.line='Hold still... there. '+A.name+'. I have never seen steel do that.'}});}
    if(p1>=0)o.push({head:'Rework',label:'Reforge its paths',sub:'Clear its path choices (it keeps its level and XP) and choose again.',cost:'40 gems',off:wallet<40,fn:()=>{
      wallet-=40;store.set('wallet',wallet);SMITH.p1[id]=-1;SMITH.p2[id]=-1;smithSave();sfx('key');talk.sel=0;talk.line='Melted down and hammered flat. Choose again.'}});
  }
  return text;
}


/* ---------- the Fizzler: a walking two-litre bottle of cola that sprays you until you fizz away (creature type 4) ---------- */
// About one floor in ten has one (its own dice, so nothing else on the floor moves). It waddles after you, and when it is close it shakes
// itself up and blasts a cone of foam: standing in the foam fills your fizz meter, and a full meter costs a heart. It can be stunned,
// beaten, potioned and killed like the rest. The host runs it; the state (0 roam, 1 hunt, 2 spray, 3 shake) streams with the others,
// so guests see the shaking and the spray, and the host sends each sprayed guest its share of fizz ({k:'fz'}).
const FIZZ={range:2.6,cone:0.55,shake:0.8,spray:1.7,rest:3,rate:0.55};
function fizzPlace(seedStr,depth,g,W,H,safeMask,pocketMask,d0,shades,kind){
  if(kind==='back'||kind==='arena')return;
  const r=mulberry32(hashStr(seedStr+'#fizz#'+depth));if(r()>=0.1)return;
  const spots=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(!g[i]&&!safeMask[i]&&!pocketMask[i]&&d0[i]>12)spots.push([x,y])}
  if(!spots.length)return;const c=spots[(r()*spots.length)|0];
  shades.push({type:4,x:c[0]+0.5,z:c[1]+0.5,gx:c[0],gy:c[1],px:-1,py:-1,state:0,stun:0,think:0,vis:false,frozen:false,ph:r()*6.28,d:99,snd:0,ft:0,fs:0});
}
// the host's turn for a Fizzler (after potions and stuns have had their say)
function fizzTick(s,dt,TG,MD){
  const T=mpNearest(TG,s.x,s.z),cx=Math.floor(s.x),cz=Math.floor(s.z),d=MD?MD[cz*F.W+cx]:-1;
  const eu=T?Math.hypot(T.x-s.x,T.z-s.z):99,sk=T?potSk(T):1;
  s.ft=(s.ft||0)-dt;s.fs=(s.fs||0)-dt;
  if(s.state===3){   // shaking itself up
    s.face=T?Math.atan2(T.z-s.z,T.x-s.x):s.face;
    if(s.ft<=0){s.state=2;s.ft=FIZZ.spray;if(Math.hypot(s.x-P.x,s.z-P.z)<14){noise(0.25,0.4,3000,0.6);tone(900,0.3,'sine',0.1,0,-500)}}
    return;
  }
  if(s.state===2){   // spraying: everyone in the cone gets fizzed
    if(T){const want=Math.atan2(T.z-s.z,T.x-s.x);let df=want-(s.face||0);while(df>Math.PI)df-=Math.PI*2;while(df<-Math.PI)df+=Math.PI*2;s.face=(s.face||0)+Math.sign(df)*Math.min(Math.abs(df),1.2*dt)}
    for(const t of TG){
      if(t.inSafe)continue;const dx=t.x-s.x,dz=t.z-s.z,dd=Math.hypot(dx,dz);
      if(dd>FIZZ.range||dd<0.01)continue;
      const fx=Math.cos(s.face),fz=Math.sin(s.face);if((dx*fx+dz*fz)/dd<Math.cos(FIZZ.cone)||!los(s.x,s.z,t.x,t.z))continue;
      const amt=FIZZ.rate*dt*(1.2-dd/FIZZ.range*0.6);
      if(t.loc)fizzMe(amt);else{t.p.fzAcc=(t.p.fzAcc||0)+amt;if(t.p.fzAcc>0.08){mpSend({k:'fz',a:r3(t.p.fzAcc)},t.p.id);t.p.fzAcc=0}}
    }
    if(s.ft<=0){s.state=1;s.ft=FIZZ.rest}
    return;
  }
  // roaming and hunting: it waddles, slower than you
  const hunt=!!T&&!T.inSafe&&d>=0&&d<=11*Math.max(sk,0.15)&&(s.calm||0)<=0;
  s.state=hunt?1:0;
  if(hunt){
    if(eu<FIZZ.range*0.85&&s.ft<=0&&los(s.x,s.z,T.x,T.z)){s.state=3;s.ft=FIZZ.shake;s.face=Math.atan2(T.z-s.z,T.x-s.x);if(Math.hypot(s.x-P.x,s.z-P.z)<14)fizzRattle();return}
    if(eu>0.9){mazeStep(s,T.x,T.z,dt,2.1*(s.pmul||1));s.face=s.yaw}
  }else{
    if(!s.wg||Math.hypot(s.wg[0]-s.x,s.wg[1]-s.z)<0.3||s.fs<=0){
      s.fs=6;for(let k=0;k<20;k++){const x=cx+((Math.random()*9)|0)-4,z=cz+((Math.random()*9)|0)-4;if(x>0&&z>0&&x<F.W-1&&z<F.H-1&&!F.g[z*F.W+x]&&!F.safeMask[z*F.W+x]&&!F.pocketMask[z*F.W+x]){s.wg=[x+0.5,z+0.5];break}}
    }
    if(s.wg){mazeStep(s,s.wg[0],s.wg[1],dt,1.1*(s.pmul||1));s.face=s.yaw}
  }
  if(s.calm>0)s.calm-=dt;
  s.gx=Math.floor(s.x);s.gy=Math.floor(s.z);s.px=-1;
  s.snd-=dt;if(s.snd<=0){s.snd=1.4+Math.random();if(Math.hypot(s.x-P.x,s.z-P.z)<9)noise(0.5,0.05,5200,1.5)}   // a constant faint fizz
}
// you, getting fizzed
function fizzMe(a){
  if(P.down||P.away||state!=='play')return;
  if(P.inv>0&&P.fizz>=1)return;
  P.fizz=Math.min(1,(P.fizz||0)+a);P.fizzT=0.4;
  if(Math.random()<0.25)noise(0.12,0.08,4200+Math.random()*2000,2);
  if(P.fizz>=1){P.fizz=0.35;P.inv=0;say('You fizz over!',1.6);hurt(null)}
}
function fizzRattle(){if(!ac)return;for(let i=0;i<8;i++)noise(0.05,0.12,1200+i*120,3);tone(140,0.7,'square',0.04,0,60)}
function fizzPlayerTick(dt){
  if(P.fizzT>0)P.fizzT-=dt;else if(P.fizz>0)P.fizz=Math.max(0,P.fizz-0.12*dt);
  if(!FIZZ.el){   // foam creeping up from the bottom of the screen: lots of small soft bubbles over a brown wash
    FIZZ.el=document.createElement('div');let bg='';const r=mulberry32(7);
    for(let i=0;i<46;i++){const x=(r()*100).toFixed(1),y=(72+r()*30).toFixed(1),sz=(1.2+r()*3.2).toFixed(1),a=(0.35+r()*0.4).toFixed(2);
      bg+=`radial-gradient(circle at ${x}% ${y}%,rgba(255,250,238,${a}) 0,rgba(255,248,235,${(a*0.5).toFixed(2)}) ${sz*0.6}%,transparent ${sz}%),`}
    FIZZ.el.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;transition:opacity .2s;background:'+bg+'linear-gradient(to top,rgba(120,60,22,.6),rgba(120,60,22,.15) 30%,rgba(120,60,22,0) 50%)';
    document.body.appendChild(FIZZ.el)}
  const o=state==='play'&&!P.down?Math.min(1,(P.fizz||0)*1.2):0;if(Math.abs((+FIZZ.el.style.opacity||0)-o)>0.02)FIZZ.el.style.opacity=o.toFixed(2);
}
// the bottle: a two-litre of cola with stubby arms and legs, a plain orange label with an angry face on it, and a cap that pops off to spray
function buildFizz(s,t,ex,ez){
  const st=s.state|0,shake=st===3?Math.sin(t*60)*0.05:0,spray=st===2,walk=(s.wk=(s.wk||0)+(st<2?0.12:0));
  const fa=s.face||0,B={p:[s.x+shake*Math.cos(t*47),0.06+Math.abs(Math.sin(walk*3))*0.02,s.z+shake*Math.sin(t*53)],R:m3(rYaw(fa),rZ(st===2?0.25:st===3?Math.sin(t*41)*0.12:-0.05)).map(q=>q*1.5),lo:[s.ph,0,0]};   // a big bottle: about 1.1 m
  const cola=[0.22,0.08,0.03,8],plastic=[0.5,0.35,0.25,8],label=[0.72,0.38,0.08,7],white=[0.78,0.76,0.7,7],cap=[0.85,0.85,0.82,4],skin=[0.3,0.14,0.06,8],black=[0.03,0.02,0.02,8];
  // legs and petal feet
  for(const z of[-1,1]){const sw=Math.sin(walk*3+(z>0?0:Math.PI))*0.05;seg(B,[0,0.12,z*0.06],[sw,0.0,z*0.075],0.025,0.02,skin);ball(B,[sw+0.02,0.005,z*0.075],[0.04,0.015,0.03],skin,true)}
  for(let i=0;i<5;i++){const a=i/5*6.283;ball(B,[Math.cos(a)*0.06,0.11,Math.sin(a)*0.06],[0.045,0.04,0.045],plastic,true)}
  // the bottle, in bands of one radius: the label is part of the wall, not a skin wrapped round it (a skin just off the surface reads
  // as a crevice to the ambient-occlusion pass at high quality, which darkened the whole label)
  seg(B,[0,0.12,0],[0,0.27,0],0.115,0.115,cola);seg(B,[0,0.27,0],[0,0.37,0],0.115,0.115,label);seg(B,[0,0.37,0],[0,0.385,0],0.115,0.115,white);
  seg(B,[0,0.385,0],[0,0.41,0],0.115,0.115,label);seg(B,[0,0.41,0],[0,0.5,0],0.115,0.115,cola);
  seg(B,[0,0.5,0],[0,0.62,0],0.115,0.04,cola);seg(B,[0,0.62,0],[0,0.68,0],0.04,0.038,plastic);
  if(!spray)seg(B,[0,0.68,0],[0,0.715,0],0.045,0.045,cap);           // the cap pops off when it sprays
  // an angry face on the label
  const fx=0.116;for(const z of[-1,1]){ball(B,[fx,0.345,z*0.035],[0.008,0.018,0.014],white,true);ball(B,[fx+0.004,0.343,z*0.033],[0.006,0.01,0.008],black,true);
    slab(B,[fx+0.002,0.37,z*0.035],[0.004,0.004,0.02],black,rX(z*0.5))}
  slab(B,[fx+0.002,0.305,0],[0.004,spray?0.016:0.006,0.03],black);
  // stubby arms, waving when it shakes
  for(const z of[-1,1]){const up=st===3?0.12+Math.sin(t*30+z)*0.05:0.02;seg(B,[0,0.42,z*0.11],[0.06,0.33+up,z*0.17],0.02,0.018,skin);ball(B,[0.06,0.33+up,z*0.17],0.022,skin,true)}
  // bubbles rising inside, and foam when it sprays
  for(let i=0;i<6;i++){const k=(t*0.8+i/6+s.ph)%1;const p=fpt(B,[Math.cos(i*2.1)*0.07,0.14+k*0.45,Math.sin(i*2.1)*0.07]);spr(p[0],p[1],p[2],0.035,0.035,7,1,0.8,0.5,0.6*(1-k),1)}
  if(spray){const tip=fpt(B,[0,0.72,0]),dir=[Math.cos(fa),Math.sin(fa)];
    for(let i=0;i<14;i++){const k=((t*3+i/14)%1),r=k*FIZZ.range,j=(Math.sin(i*7.3+t*9))*0.25*k;
      spr(tip[0]+dir[0]*r-dir[1]*j,tip[1]-k*0.35+Math.sin(i*3+t*11)*0.05,tip[2]+dir[1]*r+dir[0]*j,0.1+k*0.25,0.1+k*0.25,7,1,0.96,0.88,0.75*(1-k*0.6),0)}}
  return fpt(B,[0.12,0.345,0]);
}


/* ---------- Granny (creature type 5): "Come give granny some sugar!" ---------- */
// About one floor in twenty (her own dice, nothing else moves). She shuffles after you with her arms wide, calling out for sugar, and
// when she is close she gives you a puff of her perfume: you go woozy (the view swims, you drift and slow down). If she then reaches
// you, she plants a big kiss on you, and that costs a heart. The host runs her (state 0 roam, 1 hunt, 2 puff) and sends each guest who
// breathes the perfume a {k:'gw'}; her voice is each player's own speech synthesizer, louder the closer she is.
const GRAN={puff:0.9,rest:4,cloud:1.9,wooze:6,hug:4.5,press:0.075,leak:0.12,line:'Come give granny some sugar!'};
function grannyPlace(seedStr,depth,g,W,H,safeMask,pocketMask,d0,shades,kind){
  if(kind==='back'||kind==='arena')return;
  const r=mulberry32(hashStr(seedStr+'#granny#'+depth));if(r()>=0.05)return;
  const spots=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(!g[i]&&!safeMask[i]&&!pocketMask[i]&&d0[i]>12)spots.push([x,y])}
  if(!spots.length)return;const c=spots[(r()*spots.length)|0];
  shades.push({type:5,x:c[0]+0.5,z:c[1]+0.5,gx:c[0],gy:c[1],px:-1,py:-1,state:0,stun:0,think:0,vis:false,frozen:false,ph:r()*6.28,d:99,snd:0,ft:0,fs:0});
}
function grannyTick(s,dt,TG,MD){
  const T=mpNearest(TG,s.x,s.z),cx=Math.floor(s.x),cz=Math.floor(s.z),d=MD?MD[cz*F.W+cx]:-1;
  const eu=T?Math.hypot(T.x-s.x,T.z-s.z):99,sk=T?potSk(T):1;
  s.ft=(s.ft||0)-dt;s.fs=(s.fs||0)-dt;
  if(s.state===3){   // hugging someone: she holds on until they break free (or are smothered)
    if(s.ft<=0){s.state=0;s.stun=Math.max(s.stun,2);s.calm=4}
    return;
  }
  if(s.state===2){   // a puff of perfume: everyone in the cloud goes woozy
    if(T)s.face=Math.atan2(T.z-s.z,T.x-s.x);
    if(!s.puffed&&s.ft<GRAN.puff*0.5){s.puffed=true;
      for(const t of TG){if(t.inSafe||Math.hypot(t.x-s.x,t.z-s.z)>GRAN.cloud||!los(s.x,s.z,t.x,t.z))continue;if(t.loc)grannyWoozy();else mpSend({k:'gw'},t.p.id)}}
    if(s.ft<=0){s.state=1;s.ft=GRAN.rest;s.puffed=false}
    return;
  }
  const hunt=!!T&&!T.inSafe&&d>=0&&d<=12*Math.max(sk,0.15)&&(s.calm||0)<=0;
  s.state=hunt?1:0;
  if(hunt){
    if(eu<1.5&&s.ft<=0&&los(s.x,s.z,T.x,T.z)){s.state=2;s.ft=GRAN.puff;s.puffed=false;return}
    if(eu>0.35)mazeStep(s,T.x,T.z,dt,1.75*(s.pmul||1));s.face=s.yaw;
    if(eu<0.5&&T.inv<=0&&!(T.loc?P.hug:T.p.hug)){   // she got you: a big hug, and you must struggle free
      const dx=s.x-T.x,dz=s.z-T.z,l=Math.hypot(dx,dz)||1;potPlace(s,T.x+dx/l*0.42,T.z+dz/l*0.42);s.face=Math.atan2(-dz,-dx);
      s.state=3;s.ft=GRAN.hug+1.5;
      if(T.loc)grannyGrab(s);else{T.p.hug=true;setTimeout(()=>{if(T.p)T.p.hug=false},(GRAN.hug+1.5)*1000);mpSend({k:'gg',i:F.shades.indexOf(s)},T.p.id)}
    }
  }else{
    if(!s.wg||Math.hypot(s.wg[0]-s.x,s.wg[1]-s.z)<0.3||s.fs<=0){
      s.fs=7;for(let k=0;k<20;k++){const x=cx+((Math.random()*9)|0)-4,z=cz+((Math.random()*9)|0)-4;if(x>0&&z>0&&x<F.W-1&&z<F.H-1&&!F.g[z*F.W+x]&&!F.safeMask[z*F.W+x]&&!F.pocketMask[z*F.W+x]){s.wg=[x+0.5,z+0.5];break}}
    }
    if(s.wg){mazeStep(s,s.wg[0],s.wg[1],dt,0.9*(s.pmul||1));s.face=s.yaw}
  }
  if(s.calm>0)s.calm-=dt;
  s.gx=Math.floor(s.x);s.gy=Math.floor(s.z);s.px=-1;
}
// every client: she calls out now and then, if you are near enough to hear her
let granVoice;
function grannyVoiceTick(dt){
  if(!F||state!=='play'||P.down)return;
  for(const s of F.shades){
    if(s.type!==5||s.x<0||s.dead||s.down>0)continue;
    s.say=(s.say===undefined?2+Math.random()*4:s.say)-dt;
    if(s.say>0)continue;s.say=6+Math.random()*6;
    const d=Math.hypot(s.x-P.x,s.z-P.z);if(d>18)continue;
    const k=Math.max(0.15,1-d/18);
    if(d<10)say('Granny: "'+GRAN.line+'"',2.6);
    s.talkT=2.2;
    if(muted)continue;
    const S=window.speechSynthesis;
    if(S&&typeof SpeechSynthesisUtterance!=='undefined'){
      if(S.speaking)continue;
      if(granVoice===undefined){const L=S.getVoices().filter(v=>/^en/i.test(v.lang));if(L.length)granVoice=L.find(v=>/female|zira|samantha|victoria|karen|susan|hazel|moira|tessa|fiona|kate|serena/i.test(v.name))||L[0]||null}
      const u=new SpeechSynthesisUtterance(GRAN.line);if(granVoice)u.voice=granVoice;u.lang='en-US';u.pitch=1.45;u.rate=0.82;u.volume=clamp(k*(getVolumes().sfx??1),0,1);
      try{S.speak(u)}catch(e){}
    }else if(ac)for(let i=0;i<5;i++)tone(330+Math.random()*60,0.18,'triangle',0.08*k,i*0.2,40);
  }
}
// the hug: click (Space, E, pad A, tap) as fast as you can to fill the bar before time runs out, or be smothered in grandma rolls
function grannyGrab(s){
  if(P.hug||P.down||state!=='play')return;
  P.hug={i:F.shades.indexOf(s),t:GRAN.hug,prog:0.15,last:0};P.vx=P.vz=0;
  grannyKiss();say('Granny has you in a big hug! CLICK as fast as you can to break free!',3);
  if(ac){tone(220,0.6,'sine',0.12,0,-60);noise(0.5,0.2,400,0.7)}
}
function grannyMash(){
  const h=P.hug;if(!h)return false;
  h.prog=Math.min(1,h.prog+GRAN.press);h.last=0.12;
  if(ac)tone(300+h.prog*500,0.06,'square',0.05);
  if(h.prog>=1)grannyFree(true);
  return true;
}
function grannyHugTick(dt){
  const h=P.hug;if(!h)return;
  if(P.down||state==='dead'){P.hug=null;return}
  h.t-=dt;h.last=Math.max(0,h.last-dt);h.prog=Math.max(0,h.prog-GRAN.leak*dt);P.vx=P.vz=0;
  const s=F.shades[h.i];if(s&&s.x>0){P.yaw=Math.atan2(s.z-P.z,s.x-P.x);P.pitch=Math.max(-0.2,Math.min(0.1,P.pitch))}
  if(h.t<=0)grannyFree(false);
}
function grannyFree(ok){
  const h=P.hug;if(!h)return;P.hug=null;
  const s=F.shades[h.i];
  if(ok){say('You wriggle free!',1.8);P.inv=1.5;if(ac){tone(660,0.15,'triangle',0.1);tone(880,0.2,'triangle',0.1,0.1)}}
  else{say('Smothered in grandma rolls...',3);if(ac)tone(90,1.2,'sine',0.2,0,-40);P.ward=0;P.inv=0;P.hp=Math.min(P.hp,1);hurt(null)}
  if(MP.guest)mpSend({k:'gf',d:R.depth,i:h.i},MP.hostId);else if(s)grannyLet(s,P.x,P.z);
}
function grannyLet(s,x,z){   // she lets go and staggers back
  if(!s||s.type!==5)return;s.state=0;s.ft=GRAN.rest;s.stun=Math.max(s.stun,3);s.calm=5;
  const dx=s.x-x,dz=s.z-z,l=Math.hypot(dx,dz)||1;potPlace(s,s.x+dx/l*0.8,s.z+dz/l*0.8);
}
function grannyHugHud(){
  if(!GRAN.hugEl){const e=document.createElement('div');e.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:6;display:none';
    e.innerHTML='<div class="gv" style="position:absolute;inset:0"></div><div style="position:absolute;left:50%;top:62%;transform:translateX(-50%);text-align:center;color:#fff;text-shadow:0 2px 6px #000;font:700 28px Georgia,serif">'+
      '<div class="gt">BREAK FREE!</div><div class="gs" style="font:600 14px system-ui;opacity:.85;margin:4px 0 8px"></div>'+
      '<div style="width:min(420px,80vw);height:18px;border:2px solid #fff;border-radius:10px;overflow:hidden;background:rgba(0,0,0,.5)"><div class="gb" style="height:100%;width:0;background:linear-gradient(90deg,#ff7ab8,#ffe08a)"></div></div></div>';
    document.body.appendChild(e);GRAN.hugEl=e}
  const e=GRAN.hugEl,h=P.hug;
  if(!h||state!=='play'){if(e.style.display!=='none')e.style.display='none';return}
  e.style.display='block';
  const left=Math.max(0,h.t/GRAN.hug),squeeze=1-left;
  e.querySelector('.gb').style.width=(h.prog*100).toFixed(0)+'%';
  e.querySelector('.gt').style.transform='scale('+(1+(h.last>0?0.12:0))+')';
  e.querySelector('.gs').textContent=(touch.on?'Tap the screen':pad.id?'Mash A':'Click (or Space)')+' as fast as you can · '+h.t.toFixed(1)+' s';
  e.querySelector('.gv').style.background='radial-gradient(ellipse at center,rgba(240,170,150,0) '+(55-45*squeeze).toFixed(0)+'%,rgba(235,160,140,.85) '+(85-35*squeeze).toFixed(0)+'%,rgba(120,60,50,.95) 100%)';
}
// woozy: the view swims, you drift off line and slow down
function grannyWoozy(){
  if(P.down||state!=='play')return;
  if(ps('immune')){say('The Panacea clears the perfume right away',1.6);return}
  const was=P.woozy>0;P.woozy=GRAN.wooze;
  if(!was)say('Oof, that perfume... everything is swimming',2.4);
  if(ac){noise(0.6,0.15,6000,0.7);tone(600,0.8,'sine',0.06,0,-250)}
}
function grannyKiss(){
  say('Granny plants a big wet kiss on you!',2.4);
  if(ac){noise(0.12,0.3,2500,4);tone(900,0.12,'sine',0.1,0.05,-500)}
  P.kissT=2.5;
}
function grannyPlayerTick(dt){
  grannyHugTick(dt);grannyHugHud();
  if(P.woozy>0){P.woozy=Math.max(0,P.woozy-dt);if(!P.down&&state==='play'&&!potHeld())P.yaw+=Math.sin(R.time*1.1)*0.55*dt*Math.min(1,P.woozy)}
  if(P.kissT>0)P.kissT=Math.max(0,P.kissT-dt);
  if(!GRAN.el){GRAN.el=document.createElement('div');GRAN.el.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;transition:opacity .3s;background:radial-gradient(ellipse at center,rgba(255,170,220,0) 40%,rgba(255,150,210,.45) 100%)';document.body.appendChild(GRAN.el);
    GRAN.kiss=document.createElement('div');GRAN.kiss.textContent='💋';GRAN.kiss.style.cssText='position:fixed;left:58%;top:38%;font-size:140px;pointer-events:none;z-index:4;opacity:0;transition:opacity .4s;transform:rotate(-14deg)';document.body.appendChild(GRAN.kiss)}
  const live=state==='play'&&!P.down,o=live?Math.min(1,(P.woozy||0)/2):0;if(Math.abs((+GRAN.el.style.opacity||0)-o)>0.02)GRAN.el.style.opacity=o.toFixed(2);
  const ko=live&&P.kissT>0?Math.min(1,P.kissT):0;if(Math.abs((+GRAN.kiss.style.opacity||0)-ko)>0.02)GRAN.kiss.style.opacity=ko.toFixed(2);
}
/* ---------- dance emotes (src/emotes.js) ---------- */
// T starts a dance, T again moves on to the next one; walking, jumping, using, attacking or anything that takes you out of play stops it.
// In first person the camera swings round to face you while you dance. Everyone in the game sees it ({k:'emo'}), and you hear a beat.
const EMO={id:null,t0:0,last:-1,beat:-1,btn:null};
function emoteNext(){
  if(state!=='play'||P.down||P.ko>0||P.away||P.eaten>0||FX.frozen||P.hug||P.grab||P.mounted||FX.baby>0||FX.hedge>0||wofForm()||webLocked())return false;
  const id=EMO.id==null?(EMO.last+1)%EMOTES.length:(EMO.id+1)%EMOTES.length;
  EMO.id=id;EMO.last=id;EMO.t0=R.time;EMO.beat=-1;
  say(EMOTES[id].name+'  ·  '+(touch.on?'DANCE':'T')+' for the next one, move to stop',2.2);
  mpSend({k:'emo',e:id});
  return true;
}
function emoteStop(){
  if(EMO.id==null)return;
  EMO.id=null;mpSend({k:'emo',e:-1});
}
function emoteTick(dt){
  if(EMO.btn)EMO.btn.classList.toggle('on',EMO.id!=null);
  if(EMO.id==null)return;
  if(state!=='play'||P.down||P.ko>0||P.away||P.eaten>0||FX.frozen||P.hug||P.grab||Math.hypot(P.vx,P.vz)>0.25||P.y>0.03||webLocked()){emoteStop();return}
  // the beat: a kick on every beat, a hat between, and a little bass line that changes with the dance
  const b=Math.floor((R.time-EMO.t0)*EMOTE_BPM/60*2);
  if(b!==EMO.beat&&ac){EMO.beat=b;const on=b%2===0,bars=[[55,55,65,49],[49,49,73,49],[62,62,55,69],[55,82,65,73],[73,65,55,49],[65,73,82,73]][EMO.id];
    if(on){tone(60,0.18,'sine',0.12,0,-40);tone(bars[(b/2|0)%4],0.22,'sawtooth',0.03,0,-10)}else noise(0.04,0.03,7000,2)}
}
function emoteButton(){
  if(EMO.btn||!$('touch'))return;
  const b=document.createElement('div');b.id='tDance';b.className='tbtn';b.textContent='DANCE';
  b.style.cssText='bottom:calc(282px + env(safe-area-inset-bottom));right:calc(24px + env(safe-area-inset-right));width:60px;height:60px;font-size:11px';
  b.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();emoteNext()},{passive:false});
  $('touch').appendChild(b);EMO.btn=b;
}
emoteButton();
/* ---------- the Silk Spinner (creature type 10), the face slugs (creature type 8), and being downed ---------- */
// Floors ending in 9 have a spider. It is little at first, but if it catches you it starts spinning silk around you, and the silk
// stays: the more of it, the slower you go (P.web, 0-100, shown as a meter). Only Web-Be-Gone dissolves it. At 100 you are wrapped
// tight and cannot move at all; the spider scuttles off to make room in its larder and comes back for you. A friend who reaches you
// first can cut you loose (back down to half). If the spider gets there first it eats you, and it gains five levels. Kill it and it
// curls up, then comes back somewhere else a level higher: bigger, quicker, and quicker at spinning. Its level is the host's, sent
// to everyone ({k:'spl'}); the silk on each player is that player's own, spun while a spinning spider is right beside them.
// Floors ending in 4 have slugs. A slug that reaches you crawls up your leg and onto your face, and you cannot see. Press U (pad Y,
// or the PEEL button) to peel one off; it lands in front of you, dazed. Kill one and two more crawl out somewhere else: the floor
// keeps a pool of them (SLUG.pool), most waiting off the map, and a kill wakes two of them up; once those are all awake, a kill
// makes two brand new ones. There is no limit.
// Downed (co-op only): losing your last heart while a friend is still standing on the floor puts you down for 30 s instead of out.
// A friend can help you up (E beside you, 2.5 s); you get up on half a heart and can only limp until you are healed to a whole one.
// Nobody comes in time, and you are out like before (spectating until the next floor).
const SPI={lock:100,rate:l=>7+1.6*l,speed:l=>Math.min(1.3+0.12*l,3.6),size:l=>Math.min(0.62+0.07*l,2.4),hp:l=>4+1.5*l,retreat:l=>Math.max(4,9-0.25*l),hunt:16};
const SLUG={pool:20,start:3,hunt:10,speed:()=>Math.min(0.55+0.012*R.depth,0.95)};
const KO={time:30,help:2.5,free:2};
let koSkip=false,spiSync=0;
const webLocked=()=>(P.web||0)>=SPI.lock||(P.eaten||0)>0;
const webMul=()=>(P.ko>0?0:1)*(1-0.72*Math.min(1,(P.web||0)/SPI.lock))*(P.half?0.42:1);
function critterPlace(seedStr,depth,g,W,H,safeMask,pocketMask,d0,shades,kind){
  if(kind==='arena')return;
  const spider=depth%10===9,slug=depth%10===4;if(!spider&&!slug)return;   // floors 4, 24, 44... are always the Backrooms: the slugs live there too
  const r=mulberry32(hashStr(seedStr+'#crawl#'+depth));
  const spots=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(!g[i]&&!safeMask[i]&&!pocketMask[i]&&d0[i]>(spider?14:8))spots.push([x,y])}
  if(!spots.length)return;
  const mk=(type,ex)=>{const c=spots[(r()*spots.length)|0];return Object.assign({type,x:c[0]+0.5,z:c[1]+0.5,gx:c[0],gy:c[1],px:-1,py:-1,state:0,stun:0,think:0,vis:false,frozen:false,ph:r()*6.28,d:99,snd:0,ft:0,fs:0},ex)};
  if(spider)shades.push(mk(10,{lv:1}));
  if(slug)for(let k=0;k<SLUG.pool;k++){const o=mk(8,{});if(k>=SLUG.start){o.pool=1;o.x=o.z=-99}shades.push(o)}
}
const tWeb=t=>t.loc?(P.web||0):(t.p.web||0);
function crawlWander(s,dt,sp){
  const cx=Math.floor(s.x),cz=Math.floor(s.z);
  if(!s.wg||Math.hypot(s.wg[0]-s.x,s.wg[1]-s.z)<0.3||s.fs<=0){
    s.fs=7;for(let k=0;k<20;k++){const x=cx+((Math.random()*9)|0)-4,z=cz+((Math.random()*9)|0)-4;if(x>0&&z>0&&x<F.W-1&&z<F.H-1&&!F.g[z*F.W+x]&&!F.safeMask[z*F.W+x]&&!F.pocketMask[z*F.W+x]){s.wg=[x+0.5,z+0.5];break}}
  }
  if(s.wg){mazeStep(s,s.wg[0],s.wg[1],dt,sp);s.face=s.yaw}
}
// the host: the spider hunts, spins, and when someone is wrapped tight it goes off and comes back for them
function spiderTick(s,dt,TG,MD){
  const lv=s.lv||1,sp=SPI.speed(lv)*(s.pmul||1),nos=!!(s.pe&&s.pe.unsilk>0);
  s.ft=(s.ft||0)-dt;s.fs=(s.fs||0)-dt;if(s.calm>0)s.calm-=dt;s.rad=0.22*SPI.size(lv);
  const free=TG.filter(t=>!t.inSafe),locked=free.filter(t=>tWeb(t)>=SPI.lock);
  if(s.state===3){   // off to clear a corner of its larder
    if(s.wg)mazeStep(s,s.wg[0],s.wg[1],dt,sp);s.face=s.yaw;
    if(s.ft<=0)s.state=4;
  }else if(s.state===4){   // and back for its meal
    const T=mpNearest(locked,s.x,s.z);
    if(!T)s.state=0;
    else{mazeStep(s,T.x,T.z,dt,sp*1.15);s.face=s.yaw;if(Math.hypot(T.x-s.x,T.z-s.z)<0.6)spiderEat(s,T)}
  }else if(locked.length&&(s.calm||0)<=0){
    const T=mpNearest(locked,s.x,s.z);s.state=3;s.ft=SPI.retreat(lv);s.wg=null;
    for(let k=0;k<60;k++){const x=Math.floor(T.x)+((Math.random()*19)|0)-9,z=Math.floor(T.z)+((Math.random()*19)|0)-9,i=z*F.W+x;   // a short way off, so it is never gone long
      if(x>0&&z>0&&x<F.W-1&&z<F.H-1&&!F.g[i]&&!F.safeMask[i]&&!F.pocketMask[i]&&Math.hypot(x+0.5-T.x,z+0.5-T.z)>5){s.wg=[x+0.5,z+0.5];break}}
  }else{
    const T=mpNearest(free.filter(t=>tWeb(t)<SPI.lock),s.x,s.z),cx=Math.floor(s.x),cz=Math.floor(s.z),d=MD?MD[cz*F.W+cx]:-1;
    const eu=T?Math.hypot(T.x-s.x,T.z-s.z):99;
    if(T&&d>=0&&d<=SPI.hunt*Math.max(potSk(T),0.15)&&(s.calm||0)<=0){
      if(s.state===2&&(eu>1.2||nos))s.state=1;
      else if(eu<0.55&&!nos)s.state=2;
      else if(s.state!==2)s.state=1;
      if(eu>(s.state===2?0.32:0.25))mazeStep(s,T.x,T.z,dt,sp*(s.state===2?1.1:1));
      s.face=s.state===2?Math.atan2(T.z-s.z,T.x-s.x):s.yaw;
    }else{s.state=0;crawlWander(s,dt,sp*0.55)}
  }
  s.gx=Math.floor(s.x);s.gy=Math.floor(s.z);s.px=-1;
}
function spiderEat(s,T){
  if(T.loc)spiderEaten();else mpSend({k:'spe',d:R.depth},T.p.id);
  s.lv=(s.lv||1)+5;s.hp=s.hpMax=wMaxHp(s);s.state=0;s.calm=10;spiSync=1;
  if(Math.hypot(s.x-P.x,s.z-P.z)<16&&!T.loc)say('The spider feeds... and grows. It is level '+s.lv+' now.',3.5);
}
// the one being eaten: wrapped up for a moment, then gone
function spiderEaten(){
  if(P.eaten>0||P.down||state!=='play')return;
  P.eaten=2.6;P.web=SPI.lock;P.ko=0;say('The spider wraps you up and drags you into the dark...',3);
  if(ac){noise(1.2,0.25,1800,0.8);tone(140,1.6,'sawtooth',0.12,0,-90)}
}
// the host: a slug crawls at whoever is nearest, and climbs up their face when it reaches them
function slugTick(s,dt,TG,MD){
  const sp=SLUG.speed()*(s.pmul||1);s.fs=(s.fs||0)-dt;if(s.calm>0)s.calm-=dt;
  const T=mpNearest(TG.filter(t=>!t.inSafe),s.x,s.z),cx=Math.floor(s.x),cz=Math.floor(s.z),d=MD?MD[cz*F.W+cx]:-1;
  const eu=T?Math.hypot(T.x-s.x,T.z-s.z):99;
  if(T&&d>=0&&d<=SLUG.hunt*Math.max(potSk(T),0.15)&&(s.calm||0)<=0){
    s.state=1;if(eu>0.25)mazeStep(s,T.x,T.z,dt,sp);s.face=s.yaw;
    if(eu<0.45&&T.inv<=0){   // no limit on how many can pile onto one face
      const i=F.shades.indexOf(s);s.ride=1;s.rideBy=T.loc?'me':T.p.id;s.x=s.z=-99;s.state=0;
      if(T.loc)slugOn(i);else mpSend({k:'slc',d:R.depth,i},T.p.id);
      return;
    }
  }else{s.state=0;crawlWander(s,dt,sp*0.5)}
  s.gx=Math.floor(s.x);s.gy=Math.floor(s.z);s.px=-1;
}
// a slug riding someone who has gone (left, fallen, off the floor) drops off where it can
function slugRideCheck(s){
  if(s.rideBy==='me'){if(!P.down&&(P.slugs||[]).includes(F.shades.indexOf(s)))return;s.ride=0;potFar(s,6);return}
  const p=MP.peers.get(s.rideBy);
  if(p&&p.run&&!p.down&&p.d===R.depth&&mpFresh(p))return;
  s.ride=0;if(p&&Number.isFinite(p.x)&&p.d===R.depth)potPlace(s,p.x,p.z);else potFar(s,6);s.stun=2;
}
function slugDrop(s,x,z){
  if(!s||s.type!==8)return;s.ride=0;s.pool=0;s.rideBy=null;potPlace(s,x,z);s.stun=Math.max(s.stun,3);s.state=0;s.calm=4;
}
// a slug killed: it is gone for good, and two more crawl out somewhere else
// a new slug on the end of the list (guests add the same ones when the host says how many there are: {k:'slx'})
function slugNew(){const q={type:8,x:-99,z:-99,gx:0,gy:0,px:-1,py:-1,state:0,stun:0,think:0,vis:false,frozen:false,ph:Math.random()*6.28,d:99,snd:0,ft:0,fs:0};F.shades.push(q);return q}
function slugSplit(s){
  s.pool=1;s.ride=0;s.x=s.z=-99;let n=0;
  for(const q of F.shades){if(n>=2)break;if(q.type!==8||!q.pool||q===s)continue;q.pool=0;q.hp=q.hpMax=wMaxHp(q);q.stun=1.5;q.state=0;potFar(q,8);n++}
  for(;n<2;n++){const q=slugNew();q.hp=q.hpMax=wMaxHp(q);q.stun=1.5;potFar(q,8)}   // no more waiting: brand new ones (there is no limit)
  if(MP.on)mpSend({k:'slx',d:R.depth,n:F.shades.length});
  if(Math.hypot(s.x-P.x,s.z-P.z)<16||n)say(n?'Splat! Somewhere in the dark, '+(n>1?'two more':'another')+' crawl'+(n>1?'':'s')+' out.':'Splat!',2.4);
}
// everyone: a slug climbs onto your face
function slugOn(i){
  if(!P.slugs)P.slugs=[];
  if(P.down||state!=='play'){if(!MP.guest)slugDrop(F.shades[i],P.x,P.z);else mpSend({k:'slf',d:R.depth,i,x:r3(P.x),z:r3(P.z)},MP.hostId);return}
  if(!P.slugs.includes(i))P.slugs.push(i);
  say(P.slugs.length>1?'Another slug! You cannot see a thing!':'A slug crawls up your leg and onto your face! '+slugKey()+' to peel it off.',3);
  if(ac){noise(0.5,0.18,500,0.6);tone(180,0.4,'sine',0.06,0,-60)}
}
const slugKey=()=>touch.on?'Tap PEEL':pad.id?'Press Y':'Press U';
function slugPeel(){
  if(!P.slugs||!P.slugs.length||state!=='play'||P.down)return false;
  const i=P.slugs.pop(),x=P.x+Math.cos(P.yaw)*1.1,z=P.z+Math.sin(P.yaw)*1.1;
  if(MP.guest)mpSend({k:'slf',d:R.depth,i,x:r3(x),z:r3(z)},MP.hostId);else slugDrop(F.shades[i],x,z);
  if(ac){noise(0.18,0.3,900,1.5);tone(320,0.12,'sine',0.08,0,-200)}
  say(P.slugs.length?'Peeled one off! '+P.slugs.length+' to go.':'You peel the slug off. Ugh.',1.6);
  return true;
}
// Web-Be-Gone, on you
function webClear(){
  if(P.eaten>0)return;
  const had=(P.web||0)>0;P.web=0;if(POT.ps.hold>0)POT.ps.hold=0;
  say(had?'The webs fizz and dissolve away!':'Nothing sticky on you. You smell faintly of matches.',2);
  if(had&&ac){noise(0.6,0.15,5000,1.2);tone(900,0.3,'sine',0.05,0,-500)}
}
// ---- downed (co-op)
function koHelpers(){
  if(!MP.on)return 0;let n=0;
  for(const p of MP.peers.values())if(p.run&&!p.down&&!(p.ko>0)&&!p.away&&p.d===R.depth&&mpFresh(p))n++;
  return n;
}
function koTry(){
  if(koSkip||P.ko>0||P.eaten>0||!F||!koHelpers())return false;
  P.ko=KO.time;P.hp=0;P.half=false;P.hug=null;P.vx=P.vz=0;if(P.slugs)P.slugs.length=0;
  say('You are down! A friend can help you up. Hang on...',4);
  sfx('hurt');rumble(300,1,0.8);
  if(ac)tone(110,1.4,'sine',0.18,0,-50);
  return true;
}
function koUp(){   // a friend got you up: half a heart, and a limp
  if(!(P.ko>0))return;
  P.ko=0;P.hp=1;P.half=true;P.inv=3;
  say('Back on your feet... just. You can only limp until you are healed.',4);
  if(ac){tone(440,0.2,'triangle',0.1);tone(660,0.3,'triangle',0.1,0.15)}
}
// helping a friend: E beside someone who is down (help them up) or wrapped tight (cut them loose), then stay close
function helpTarget(){
  if(!MP.on||state!=='play'||P.down||P.ko>0||webLocked())return null;
  let best=null,bd=1.4;
  for(const p of MP.peers.values()){
    if(!mpShown(p)||p.down||!(p.ko>0||p.web>=SPI.lock))continue;
    const d=Math.hypot(p.x-P.x,p.z-P.z);if(d<bd){bd=d;best=p}
  }
  return best;
}
function helpStart(){
  const p=helpTarget();if(!p)return false;
  P.help={id:p.id,t:0,ko:p.ko>0};say(p.ko>0?'You crouch beside '+p.name+'...':'You start cutting '+p.name+' loose...',1.5);
  return true;
}
function helpTick(dt){
  const h=P.help;if(!h)return;
  const p=MP.peers.get(h.id);
  if(!p||P.down||P.ko>0||state!=='play'||!mpShown(p)||Math.hypot(p.x-P.x,p.z-P.z)>1.8||!(h.ko?p.ko>0:p.web>=SPI.lock)){P.help=null;return}
  h.t+=dt;P.vx=P.vz=0;
  if(h.t>=(h.ko?KO.help:KO.free)){
    P.help=null;mpSend({k:h.ko?'kup':'unweb',d:R.depth},p.id);
    say(h.ko?'You help '+p.name+' to their feet.':'You cut '+p.name+' loose!',2.2);sfx('pick');
  }else if(Math.random()<dt*6&&ac)noise(0.05,0.06,h.ko?600:3000,2);
}
function helpPrompt(){
  const k=touch.on?'USE':pad.id?'X':'E';
  if(P.help){const p=MP.peers.get(P.help.id),f=P.help.t/(P.help.ko?KO.help:KO.free);return (P.help.ko?'Helping ':'Cutting ')+(p?p.name:'')+(P.help.ko?' up':' loose')+'... '+Math.round(f*100)+'%'}
  const p=helpTarget();if(!p)return '';
  return k+': '+(p.ko>0?'help '+p.name+' up ('+Math.ceil(p.ko)+' s)':'cut '+p.name+' loose');
}
// ---- every client, every frame: the silk on you, the slugs on your face, being downed, and the overlays for them
const CRAWL={};
function crawlPlayerTick(dt){
  if(!P.slugs)P.slugs=[];
  if(CRAWL.f!==F){CRAWL.f=F;P.web=0;P.slugs.length=0;P.eaten=0;P.help=null}
  if(!F)return;
  const live=state==='play'&&!P.down;
  if(P.down){P.web=0;P.slugs.length=0;P.ko=0;P.eaten=0;P.half=false;P.help=null}
  if(live){
    // being eaten
    if(P.eaten>0){P.eaten-=dt;P.vx=P.vz=0;if(P.eaten<=0){P.eaten=0;P.web=0;say('Eaten by the spider.',4);koSkip=true;try{die()}finally{koSkip=false}return}}
    // a spinning spider right beside you wraps you up
    else if(!(P.ko>0)&&!P.inSafe){
      for(const s of F.shades){if(s.type!==10||s.x<0||s.dead||s.state!==2||s.stun>0||Math.hypot(s.x-P.x,s.z-P.z)>0.85)continue;
        const was=P.web||0;P.web=Math.min(SPI.lock,was+SPI.rate(s.lv||1)*dt*(ps('immune')?0:1));
        if(was<1&&P.web>=1)say('A spider is spinning silk around you! Get away from it!',3);
        if(was<SPI.lock&&P.web>=SPI.lock){say('You are wrapped tight and cannot move!'+(MP.on?' Only a friend can cut you loose.':''),4);if(ac)tone(90,1,'sawtooth',0.12,0,-30)}
        CRAWL.spin=(CRAWL.spin||0)-dt;if(CRAWL.spin<=0&&ac){CRAWL.spin=0.22;noise(0.12,0.05,6000,3)}
        break}
    }
    // downed: the clock runs down, and nobody coming means you are out
    if(P.ko>0){P.ko-=dt;P.hp=0;P.vx=P.vz=0;if(P.ko<=0||!koHelpers()){P.ko=0;say('Nobody came in time...',3);koSkip=true;try{die()}finally{koSkip=false}return}}
    // the limp: half a heart until something heals you
    if(P.half&&P.hp>1){P.half=false;P.hp-=1;say('You can walk properly again.',2)}
    if(P.half&&!P.ko){CRAWL.limp=(CRAWL.limp||0)+dt*Math.min(1,Math.hypot(P.vx,P.vz));}
    helpTick(dt);
  }
  // the host tells everyone how big the spider has grown
  if(MP.on&&!MP.guest&&live){CRAWL.splT=(CRAWL.splT||0)-dt;if(spiSync||CRAWL.splT<=0){CRAWL.splT=3;spiSync=0;
    const a=[];F.shades.forEach((s,i)=>{if(s.type===10)a.push([i,s.lv||1])});if(a.length)mpSend({k:'spl',d:R.depth,a});
    if(F.shades.some(q=>q.type===8))mpSend({k:'slx',d:R.depth,n:F.shades.length})}}
  crawlHud(live);
}
function crawlHud(live){
  if(!CRAWL.el){
    const mk=(css)=>{const e=document.createElement('div');e.style.cssText='position:fixed;pointer-events:none;'+css;document.body.appendChild(e);return e};
    CRAWL.web=mk('inset:0;z-index:3;opacity:0;background-size:cover;background-position:center');CRAWL.web.style.backgroundImage='url('+webArt()+')';
    CRAWL.slug=mk('inset:-6%;z-index:5;opacity:0;background-size:100% 100%');CRAWL.slug.style.backgroundImage='url('+slugArt()+')';
    CRAWL.ko=mk('inset:0;z-index:4;display:none;background:radial-gradient(ellipse at center,rgba(60,0,0,0) 30%,rgba(90,0,0,.85) 100%)');
    CRAWL.el=mk('left:50%;bottom:120px;transform:translateX(-50%);z-index:7;text-align:center;color:#fff;text-shadow:0 2px 6px #000;font:700 15px system-ui;display:none');
    CRAWL.el.innerHTML='<div class="ct"></div><div style="width:min(300px,70vw);height:12px;margin:5px auto 0;border:2px solid #fff;border-radius:8px;overflow:hidden;background:rgba(0,0,0,.5)"><div class="cb" style="height:100%;width:0"></div></div>';
    if($('touch')){const b=document.createElement('div');b.id='tPeel';b.className='tbtn';b.textContent='PEEL';b.style.cssText='bottom:calc(212px + env(safe-area-inset-bottom));right:calc(160px + env(safe-area-inset-right));width:64px;height:64px;font-size:12px;display:none';
      b.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();slugPeel()},{passive:false});$('touch').appendChild(b);CRAWL.peel=b}
  }
  const web=live?(P.web||0)/SPI.lock:0,n=live?P.slugs.length:0,ko=live&&P.ko>0;
  const wo=Math.min(0.92,web*0.95);if(Math.abs((+CRAWL.web.style.opacity||0)-wo)>0.01)CRAWL.web.style.opacity=wo.toFixed(2);
  const so=n?Math.min(1,0.9+0.05*n):0;if(Math.abs((+CRAWL.slug.style.opacity||0)-so)>0.01)CRAWL.slug.style.opacity=so;
  if(n)CRAWL.slug.style.transform='translate('+(Math.sin(R.time*0.7)*1.5).toFixed(2)+'%,'+(Math.cos(R.time*0.5)*1.2+(n>1?0:9)).toFixed(2)+'%) scale('+(n>1?1.08:1)+') rotate('+(Math.sin(R.time*0.4)*3).toFixed(1)+'deg)';
  const kd=ko?'block':'none';if(CRAWL.ko.style.display!==kd)CRAWL.ko.style.display=kd;
  if(CRAWL.peel){const pd=n?'flex':'none';if(CRAWL.peel.style.display!==pd)CRAWL.peel.style.display=pd}
  let txt='',f=0,col='';
  if(ko){txt='DOWNED: '+Math.ceil(P.ko)+' s. Hang on for a friend!';f=P.ko/KO.time;col='#ff4040'}
  else if(live&&P.eaten>0){txt='The spider has you...';f=1;col='#ffffff'}
  else if(n){txt=n+' slug'+(n>1?'s':'')+' on your face! '+slugKey()+' to peel '+(n>1?'one':'it')+' off';f=0}
  else if(web>0){txt=(web>=1?'WRAPPED TIGHT':'Webbed')+': '+Math.round(web*100)+'%'+(web>=1?(MP.on?'. Wait for a friend to cut you loose!':''):'. Web-Be-Gone dissolves it.');f=web;col='linear-gradient(90deg,#e8e8f0,#ffffff)'}
  else if(live&&P.half){txt='Limping on half a heart: find healing';f=0}
  const show=!!txt;if((CRAWL.el.style.display==='block')!==show)CRAWL.el.style.display=show?'block':'none';
  if(show){const t=CRAWL.el.querySelector('.ct');if(t.textContent!==txt)t.textContent=txt;const b=CRAWL.el.querySelector('.cb');b.parentNode.style.display=f>0?'block':'none';b.style.width=(f*100).toFixed(0)+'%';if(col)b.style.background=col}
}
// the art for the overlays, painted once: silk across the view, and the underside of a slug
function webArt(){
  const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.strokeStyle='rgba(240,240,250,0.75)';x.lineCap='round';
  for(const [cx,cy,sp] of[[0,0,1],[512,0,1],[0,512,1],[512,512,1],[256,-40,0.7],[-40,256,0.6],[552,300,0.6]]){
    const sp0=Math.atan2(256-cy,256-cx),N=9;
    for(let i=0;i<N;i++){const a=sp0+(i/(N-1)-0.5)*1.9*sp;x.lineWidth=1.6;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(a)*300,cy+Math.sin(a)*300);x.stroke()}
    for(let r=26;r<290;r+=22+r*0.08){x.lineWidth=1;x.beginPath();for(let i=0;i<N;i++){const a=sp0+(i/(N-1)-0.5)*1.9*sp,rr=r*(1+((i*7)%3)*0.02);const px=cx+Math.cos(a)*rr,py=cy+Math.sin(a)*rr;if(i)x.quadraticCurveTo(cx+Math.cos(a-0.12)*rr*0.95,cy+Math.sin(a-0.12)*rr*0.95,px,py);else x.moveTo(px,py)}x.stroke()}
  }
  for(let i=0;i<40;i++){x.fillStyle='rgba(255,255,255,0.5)';x.beginPath();x.arc(Math.random()*512,Math.random()*512,1+Math.random()*1.5,0,6.28);x.fill()}
  return c.toDataURL();
}
function slugArt(){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.fillStyle='rgba(0,0,0,0)';x.fillRect(0,0,256,256);
  const g=x.createRadialGradient(128,138,10,128,128,150);g.addColorStop(0,'#5e5428');g.addColorStop(0.6,'#3c3416');g.addColorStop(0.92,'#241e0c');g.addColorStop(1,'rgba(40,34,14,0)');
  x.fillStyle=g;x.beginPath();x.ellipse(128,128,150,140,0,0,6.28);x.fill();
  for(let i=0;i<26;i++){x.strokeStyle='rgba(30,26,8,'+(0.06+0.1*Math.random())+')';x.lineWidth=2+Math.random()*6;x.beginPath();const y=20+i*8.5;x.moveTo(20,y+Math.sin(i)*4);x.bezierCurveTo(90,y+10,170,y-10,236,y+Math.cos(i)*4);x.stroke()}
  for(let i=0;i<160;i++){x.fillStyle='rgba('+(30+Math.random()*40|0)+','+(28+Math.random()*30|0)+',10,'+(0.25+Math.random()*0.35)+')';x.beginPath();x.arc(20+Math.random()*216,20+Math.random()*216,1+Math.random()*4,0,6.28);x.fill()}
  for(let i=0;i<22;i++){x.fillStyle='rgba(230,240,200,'+(0.12+Math.random()*0.25)+')';x.beginPath();x.ellipse(30+Math.random()*196,30+Math.random()*196,2+Math.random()*9,1+Math.random()*4,Math.random()*3,0,6.28);x.fill()}
  return c.toDataURL();
}
// ---- the models
// The spider: a round dark abdomen with pale chevrons, a smaller head with eight glowing red eyes and two fangs, eight jointed legs
// that ripple as it runs. Bigger with every level. When it spins it rears its abdomen up and silk spills from it.
function buildSpider(s,t,ex,ez){
  const k=SPI.size(s.lv||1),st=s.state|0,run=st===1||st===3||st===4,spin=st===2,stun=s.stun>0;
  const gait=(s.wk=(s.wk||0)+(run?0.32:st===0?0.12:spin?0.18:0)*(stun?0:1));
  const B={p:[s.x,0.045*k,s.z],R:rYaw(s.face||0),lo:[s.ph,0,0]},v=(x,y,z)=>[x*k,y*k,z*k];
  const dark=[0.035,0.028,0.03,3],hair=[0.06,0.045,0.04,2],pale=[0.7,0.66,0.58,2],eye=stun?[0.3,0.1,0.1,1]:[2.2,0.25,0.15,7],fang=[0.35,0.28,0.2,4];
  const ab=subF(B,v(-0.16,0.07+(spin?0.05:0),0),rZ(spin?-0.6:-0.15));
  ball(ab,[0,0,0],[0.16*k,0.12*k,0.13*k],dark);
  for(let i=0;i<3;i++)slab(ab,v(0.02-i*0.06,0.1-i*0.012,0),[0.012*k,0.005*k,(0.06-i*0.012)*k],pale);
  ball(B,v(0,0.06,0),[0.08*k,0.06*k,0.075*k],hair);                       // the head and thorax
  for(const z of[-1,1]){ball(B,v(0.075,0.085,z*0.022),0.013*k,eye,true);ball(B,v(0.08,0.07,z*0.04),0.01*k,eye,true);ball(B,v(0.065,0.1,z*0.012),0.008*k,eye,true);ball(B,v(0.07,0.095,z*0.035),0.007*k,eye,true);
    seg(B,v(0.08,0.04,z*0.018),v(0.11,0.0,z*0.012),0.008*k,0.003*k,fang)}
  for(let i=0;i<4;i++)for(const z of[-1,1]){
    const ph=gait*3+i*1.6+(z>0?Math.PI:0),lift=run||spin?Math.max(0,Math.sin(ph))*0.05:0,sw=run?Math.cos(ph)*0.05:0;
    const ax=0.04-i*0.035,fx=ax+0.06-i*0.06+sw,hip=v(ax,0.06,z*0.05),knee=v(ax+0.02-i*0.015,0.16+lift,z*(0.16+i*0.012)),foot=v(fx,-0.04+lift*0.5,z*(0.26+i*0.01));
    seg(B,hip,knee,0.014*k,0.011*k,hair);seg(B,knee,foot,0.011*k,0.005*k,dark)
  }
  if(!stun)for(const z of[-1,1]){const p=fpt(B,v(0.08,0.08,z*0.03));spr(p[0],p[1],p[2],0.05*k,0.05*k,7,1.0,0.15,0.1,0.35,1)}
  if(spin){const p=fpt(ab,v(-0.16,0,0));for(let i=0;i<5;i++){const a=t*7+i*1.3;spr(p[0]+Math.cos(a)*0.12,p[1]+0.1+((t*1.5+i*0.2)%1)*0.35,p[2]+Math.sin(a)*0.12,0.03,0.03,7,1,1,1,0.75,1)}}
}
// the slug: a long, glistening olive-brown body that ripples as it crawls, with two eye stalks waving on top
function buildSlug(s,t,ex,ez){
  const w=(s.wk=(s.wk||0)+(s.state===1?0.06:0.02)*(s.stun>0?0:1)),B={p:[s.x,0,s.z],R:rYaw(s.face||0),lo:[s.ph,0,0]};
  const body=[0.2,0.17,0.07,8],belly=[0.3,0.27,0.14,2],eye=[0.03,0.03,0.03,8];
  for(let i=0;i<6;i++){const x=0.09-i*0.04,r=0.035-Math.abs(i-1.5)*0.004,y=0.03+Math.sin(w*6-i*0.9)*0.006;ball(B,[x,y,Math.sin(w*3-i*0.6)*0.006],[0.03,r*0.9,r],body)}
  ball(B,[0.0,0.012,0],[0.13,0.012,0.04],belly,true);
  for(const z of[-1,1]){const tip=[0.15+Math.sin(t*2+z)*0.01,0.1+Math.sin(t*3+z*2)*0.01,z*0.025];seg(B,[0.11,0.05,z*0.012],tip,0.006,0.004,body);ball(B,tip,0.009,eye,true)}
}
// what the others look like: lying down when they are down, silk wrapped round them, slugs on their face
function crawlDrawPeer(p,t){
  const H=EYE+(p.ry||0);
  const web=Math.min(1,(p.web||0)/SPI.lock),n=Math.round(web*14);
  if(n){const F0={p:[p.rx,0,p.rz],R:rYaw(p.ryaw||0)},silk=[0.92,0.92,0.95,5];
    for(let i=0;i<n;i++){const a=i*2.39,b=a+1.9+(i%3)*0.4,y0=0.15+((i*0.37)%1)*(p.ko>0?0.2:H*0.85),y1=y0+0.08+((i*0.53)%1)*0.2,r=p.ko>0?0.25:0.2;
      seg(F0,[Math.cos(a)*r,y0,Math.sin(a)*r],[Math.cos(b)*r,y1,Math.sin(b)*r],0.008,0.008,silk)}
    if(web>=1)ball(F0,[0,H*0.5,0],[0.22,H*0.52,0.22],[0.85,0.85,0.88,2])}
  if(p.slugs>0&&!(p.ko>0)){const c=Math.cos(p.ryaw||0),s=Math.sin(p.ryaw||0);const B={p:[p.rx+c*0.1,H-0.03,p.rz+s*0.1],R:m3(rYaw(p.ryaw||0),rZ(1.3))};
    for(let i=0;i<p.slugs;i++)ball(B,[(i/3|0)*0.03,0,((i%3)-1)*0.05],[0.09,0.035,0.035],[0.2,0.17,0.07,8])}
}
/* ---------- the Troll (creature type 9) ---------- */
// Past floor 20, about one floor in eight (his own dice, nothing else moves). A big, slow, hunched brute with a club and a great deal of
// health. He lumbers after you; when he is close he heaves the club up over his head (you can see it coming) and brings it down: a heart,
// and you are knocked flying. When you are near but the way round to you is long, he stops at the wall between and beats on it, three to six
// heavy blows, until it gives way. The hole stays, like a pickaxe hole ({k:'tpk'}).
// The host runs him: 0 wander, 1 hunt, 2 club raised, 3 beating on a wall, 4 getting his club back.
const TROLL={from:21,odds:0.125,speed:1.55,wander:0.6,hunt:18,smell:8,windup:0.8,recover:1.3,reach:1.5,swing:1.5,save:6,hp:40};
function trollPlace(seedStr,depth,g,W,H,safeMask,pocketMask,d0,shades,kind){
  if(depth<TROLL.from||kind==='back'||kind==='arena')return;
  const r=mulberry32(hashStr(seedStr+'#troll#'+depth));if(r()>=TROLL.odds)return;
  const spots=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(!g[i]&&!safeMask[i]&&!pocketMask[i]&&d0[i]>16)spots.push([x,y])}
  if(!spots.length)return;const c=spots[(r()*spots.length)|0];
  shades.push({type:9,x:c[0]+0.5,z:c[1]+0.5,gx:c[0],gy:c[1],px:-1,py:-1,state:0,stun:0,think:0,vis:false,frozen:false,ph:r()*6.28,d:99,snd:0,ft:0,fs:0,rad:0.42});
}
// a wall next to him that would cut the way to you short by a good deal, in your direction, and that can be broken
function trollWall(s,T,MD){
  const W=F.W,cx=Math.floor(s.x),cz=Math.floor(s.z),dh=MD[cz*W+cx];
  if(dh<0&&dh!==-1)return null;
  let best=null,bd=1e9;
  for(const [dx,dz] of DIRS){
    const wx=cx+dx,wz=cz+dz,bx=cx+2*dx,bz=cz+2*dz;
    if(bx<1||bz<1||bx>W-2||bz>F.H-2||F.g[wz*W+wx]!==1||F.g[bz*W+bx]!==0)continue;
    if((T.x-s.x)*dx+(T.z-s.z)*dz<=0.3)continue;
    const db=MD[bz*W+bx];if(db<0||(dh>=0&&db>dh-TROLL.save))continue;
    if(pkWhy(wx,wz))continue;
    if(db<bd){bd=db;best=[wx,wz,dx,dz]}
  }
  return best;
}
function trollTick(s,dt,TG,MD){
  s.ft=(s.ft||0)-dt;s.fs=(s.fs||0)-dt;if(s.calm>0)s.calm-=dt;if(s.bashCd>0)s.bashCd-=dt;
  const free=TG.filter(t=>!t.inSafe),T=mpNearest(free,s.x,s.z),cx=Math.floor(s.x),cz=Math.floor(s.z),d=MD?MD[cz*F.W+cx]:-1;
  const eu=T?Math.hypot(T.x-s.x,T.z-s.z):99,sk=T?Math.max(potSk(T),0.15):1,sp=TROLL.speed*(s.pmul||1);
  if(s.state===2){   // the club goes up...
    if(T)s.face=turnTo(s.face||0,Math.atan2(T.z-s.z,T.x-s.x),2.5*dt);
    if(s.ft<=0){   // ...and comes down
      s.state=4;s.ft=TROLL.recover;
      const fx=Math.cos(s.face),fz=Math.sin(s.face);let hit=false;
      for(const t of free){const dx=t.x-s.x,dz=t.z-s.z,l=Math.hypot(dx,dz);if(l>TROLL.reach||(dx*fx+dz*fz)<l*0.3||t.inv>0||!los(s.x,s.z,t.x,t.z))continue;
        hit=true;if(t.loc)trollClubbed(dx/(l||1),dz/(l||1));else{t.p.inv=1.6;mpSend({k:'hit',w:'club',dx:r3(dx/(l||1)),dz:r3(dz/(l||1))},t.p.id)}}
      trollThud(s.x+fx*0.8,s.z+fz*0.8,hit?1:0.8);
      if(hit)s.calm=2.5;
    }
    return;
  }
  if(s.state===4){if(s.ft<=0)s.state=1;return}
  if(s.state===3){   // beating on a wall
    const b=s.bash,i=b?b[1]*F.W+b[0]:-1;
    if(!b||F.g[i]!==1||!T||eu>TROLL.smell*2.2*sk){s.state=1;s.bash=null;s.bashCd=3;return}
    if(eu<TROLL.reach&&los(s.x,s.z,T.x,T.z)){s.state=1;s.bash=null;return}   // you came round to him
    mazeStep(s,cx+0.5,cz+0.5,dt,0.8);s.face=turnTo(s.face||0,Math.atan2(b[3],b[2]),4*dt);
    if(s.ft<=0){b[4]++;s.ft=TROLL.swing;trollThud(b[0]+0.5,b[1]+0.5,1);
      if(b[4]>=b[5]){pkApply(b[0],b[1],false);mpSend({k:'tpk',d:R.depth,x:b[0],y:b[1]});s.bash=null;s.state=1;s.bashCd=5;
        if(Math.hypot(b[0]+0.5-P.x,b[1]+0.5-P.z)<14)say('CRASH! The troll smashes straight through the wall!',3)}}
    return;
  }
  const near=!!T&&eu<TROLL.smell*sk,hunt=!!T&&(s.calm||0)<=0&&(d>=0&&d<=TROLL.hunt*sk||near);
  if(hunt){
    s.state=1;
    if(eu<1.15&&los(s.x,s.z,T.x,T.z)&&T.inv<=0){s.state=2;s.ft=TROLL.windup;s.face=Math.atan2(T.z-s.z,T.x-s.x);trollRoar(s);return}
    if(near&&!(s.bashCd>0)&&MD&&(d<0||d>eu*2+4)){const w=trollWall(s,T,MD);
      if(w){let n=3+((Math.random()*4)|0);if(n===s.lastN)n=n>=6?3:n+1;s.lastN=n;s.bash=[w[0],w[1],w[2],w[3],0,n];s.state=3;s.ft=TROLL.swing*0.8;return}}
    if(eu>0.6)mazeStep(s,T.x,T.z,dt,sp);s.face=s.yaw;
  }else{s.state=0;crawlWander(s,dt,TROLL.wander*(s.pmul||1))}
  s.gx=Math.floor(s.x);s.gy=Math.floor(s.z);s.px=-1;
}
// the one he hits
function trollClubbed(dx,dz){
  if(P.inv>0||P.down||P.ko>0||state!=='play')return;
  say('WHAM! The troll\'s club sends you flying!',2.5);
  P.vx+=dx*7;P.vz+=dz*7;P.vy=2.2;P.y=Math.max(P.y,0.001);FX.stag=Math.max(FX.stag||0,1);pkShake=Math.max(pkShake,0.9);
  hurt(null);
}
function trollThud(x,z,k){
  const d=Math.hypot(x-P.x,z-P.z);if(d>16)return;const v=clamp(1-d/16,0.1,1)*k;
  noise(0.35,0.5*v,260,0.7);tone(55,0.45,'sine',0.35*v,0,-25);pkShake=Math.max(pkShake,0.45*v);if(d<5)rumble(160,0.6*v,0.4*v);
}
function trollRoar(s){const d=Math.hypot(s.x-P.x,s.z-P.z);if(d>14||!ac)return;const v=1-d/14;tone(85,0.7,'sawtooth',0.14*v,0,-20);tone(62,0.8,'sawtooth',0.12*v,0.05,-15);noise(0.6,0.12*v,700,0.6)}
// every client: his footsteps shake the floor, the club on a wall booms, and he grunts when it goes up
function trollClientTick(dt){
  if(!F||state!=='play')return;
  for(const s of F.shades){
    if(s.type!==9||s.x<0||s.dead)continue;
    const st=s.state|0,d=Math.hypot(s.x-P.x,s.z-P.z);
    if(MP.guest){if(st===2&&s.lastSt!==2)trollRoar(s);if(st===4&&s.lastSt===2)trollThud(s.x+Math.cos(s.face||0)*0.8,s.z+Math.sin(s.face||0)*0.8,0.8);
      if(st===3){s.bc=(s.bc===undefined?TROLL.swing*0.8:s.bc)-dt;if(s.bc<=0){s.bc=TROLL.swing;trollThud(s.x+Math.cos(s.face||0),s.z+Math.sin(s.face||0),1)}}else s.bc=undefined}
    s.lastSt=st;
    if((st===1||st===0)&&s.stun<=0&&d<12){s.stepT=(s.stepT||0)-dt*(st===1?1:0.5);if(s.stepT<=0){s.stepT=0.55;const v=1-d/12;tone(48,0.18,'sine',0.22*v,0,-10);noise(0.08,0.08*v,150,1);if(d<4)pkShake=Math.max(pkShake,0.08*v)}}
  }
}
// the troll: big, hunched and gray-green, with a jutting jaw, two tusks, a great lump of a nose, little yellow eyes under a heavy brow,
// a hide loincloth, and a knotted club in his right hand: hanging when he walks, up over his head before he swings, down when he hits.
function buildTroll(s,t,ex,ez){
  const st=s.state|0,walk=(s.wk=(s.wk||0)+(st===1?0.055:st===0?0.03:0)*(s.stun>0?0:1)),sw=Math.sin(walk*3)*(st<=1?0.09:0);
  const B={p:[s.x,Math.abs(Math.sin(walk*3))*0.012,s.z],R:rYaw(s.face||0),lo:[s.ph,0,0]};
  const skin=[0.2,0.27,0.14,2],dark=[0.13,0.17,0.09,2],hide=[0.3,0.19,0.1,2],wood=[0.3,0.18,0.08,6],tusk=[0.9,0.86,0.72,4],nail=[0.2,0.18,0.14,3];
  for(const z of[-1,1]){const k=z>0?sw:-sw;
    seg(B,[0,0.46,z*0.13],[k*0.6+0.02,0.22,z*0.15],0.085,0.07,skin);seg(B,[k*0.6+0.02,0.22,z*0.15],[k+0.03,0.05,z*0.15],0.07,0.06,skin);
    ball(B,[k+0.07,0.035,z*0.15],[0.1,0.04,0.075],dark,true)}
  slab(B,[0.02,0.46,0],[0.17,0.1,0.21],hide);slab(B,[0.12,0.36,0],[0.03,0.1,0.14],hide);
  const lean=st===2?-0.12:st===3||st===4?0.28:0.18,U=subF(B,[0,0.5,0],rZ(-lean));
  ball(U,[0.02,0.2,0],[0.22,0.26,0.27],skin);ball(U,[0.1,0.12,0],[0.17,0.18,0.22],skin);                  // chest and belly
  ball(U,[-0.02,0.4,0],[0.2,0.12,0.3],dark);                                                              // the hump of his shoulders
  const H=subF(U,[0.17,0.43,0],rZ(lean*0.8-0.05));
  ball(H,[0,0,0],[0.12,0.11,0.12],skin);slab(H,[0.06,0.05,0],[0.05,0.025,0.11],dark);                      // head and heavy brow
  ball(H,[0.13,-0.005,0],[0.06,0.055,0.045],dark);ball(H,[0.08,-0.07,0],[0.09,0.05,0.1],skin);            // nose, jaw
  for(const z of[-1,1]){seg(H,[0.13,-0.07,z*0.055],[0.15,-0.01,z*0.06],0.014,0.004,tusk);ball(H,[0.02,0.03,z*0.125],[0.025,0.045,0.015],dark,true)}
  if(s.stun<=0)for(const z of[-1,1]){const p=fpt(H,[0.1,0.025,z*0.045]);spr(p[0],p[1],p[2],0.022,0.022,7,1.0,0.85,0.2,1,1)}
  // the left arm hangs, knuckles low
  const L0=[0.02,0.33,-0.29],L1=[0.12+(-sw)*0.5,0.0,-0.34],L2=[0.18+(-sw),-0.24,-0.33];
  seg(U,L0,L1,0.075,0.06,skin);seg(U,L1,L2,0.06,0.055,skin);ball(U,L2,[0.07,0.06,0.06],dark,true);
  // poses for the right arm: [arm angle, club angle] hanging, up over the shoulder (club laid back under the ceiling), and down on the blow
  const IDLE=[-1.35,-1.65],UP=[0.7,2.9],HIT=[-0.35,-0.55],mix=(p,q,k)=>[p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k];
  let pose=st===2?UP:st===4?HIT:IDLE;
  if(st===3){const ph=((t%TROLL.swing)+TROLL.swing)%TROLL.swing/TROLL.swing;pose=ph<0.75?mix(HIT,UP,ph/0.75):mix(UP,HIT,(ph-0.75)/0.25)}
  if(st===2)pose=mix(IDLE,UP,Math.min(1,(s.upK=Math.min(1,(s.upK||0)+0.12))));else s.upK=0;
  const sh=[0.02,0.33,0.29],ang=pose[0],hand=[sh[0]+Math.cos(ang)*0.36,sh[1]+Math.sin(ang)*0.36,0.33],el=[sh[0]+Math.cos(ang-0.5)*0.19,sh[1]+Math.sin(ang-0.5)*0.19,0.33];
  seg(U,sh,el,0.075,0.06,skin);seg(U,el,hand,0.06,0.055,skin);ball(U,hand,[0.065,0.06,0.06],dark,true);
  const ca=pose[1],tip=[hand[0]+Math.cos(ca)*0.52,hand[1]+Math.sin(ca)*0.52,0.33];
  seg(U,hand,tip,0.03,0.085,wood);
  for(let i=0;i<3;i++){const f=0.6+i*0.15,p=[hand[0]+Math.cos(ca)*0.52*f,hand[1]+Math.sin(ca)*0.52*f,0.33+(i-1)*0.06];ball(U,p,0.03,nail,true)}
}
// Granny: a small, stooped old lady in a lavender floral dress and a pink cardigan, white hair in a bun, big glasses, pearls,
// a handbag on one arm and a perfume atomizer in the other hand. Arms wide when she is coming for you; the atomizer up when she puffs.
function buildGranny(s,t,ex,ez){
  const st=s.state|0,walk=(s.wk=(s.wk||0)+(st===1?0.09:st===0?0.05:0)),puff=st===2,hug=st===1;
  const tp=Math.atan2(ez-s.z,ex-s.x),fa=hug||puff?tp:st===3?(s.face||0):(s.face||0);
  const B={p:[s.x,Math.abs(Math.sin(walk*3))*0.008,s.z],R:rYaw(fa),lo:[s.ph,0,0]},S=0.85,v=(x,y,z)=>[x*S,y*S,z*S];
  const dress=[0.62,0.52,0.78,2],dot=[0.95,0.85,0.95,2],card=[0.95,0.62,0.72,2],skin=[0.93,0.76,0.66,1],hair=[0.95,0.95,0.97,5],shoe=[0.2,0.14,0.1,3],
        pearl=[1,1,0.95,8],bag=[0.45,0.18,0.12,3],gold=[0.85,0.65,0.25,4],glass=[0.7,0.85,1.0,8],lip=[0.85,0.1,0.2,1],perf=[1.4,0.6,1.1,7];
  for(const z of[-1,1]){const sw=Math.sin(walk*3+(z>0?0:Math.PI))*0.04;
    seg(B,v(0,0.3,z*0.05),v(sw,0.05,z*0.055),0.03*S,0.025*S,[0.85,0.72,0.62,2]);ball(B,v(sw+0.025,0.025,z*0.055),[0.05*S,0.022*S,0.032*S],shoe,true)}
  seg(B,v(0,0.12,0),v(0,0.52,0),0.17*S,0.11*S,dress);                                                 // the skirt
  for(let i=0;i<10;i++){const a=i*0.63,h=0.16+((i*7)%5)*0.07,r=(0.165-((i*7)%5)*0.012)*S;ball(B,[Math.cos(a)*r,h*S,Math.sin(a)*r],0.012*S,dot,true)}
  const U=subF(B,v(0,0.5,0),rZ(-0.28));                                                                 // stooped
  ball(U,v(0,0.12,0),[0.09*S,0.13*S,0.12*S],card);
  for(let i=0;i<5;i++)ball(U,v(0.085,0.2-i*0.012,(i-2)*0.018),0.008*S,pearl,true);
  for(const z of[-1,1])ball(U,v(0,0.21,z*0.1),[0.05*S,0.04*S,0.05*S],card,true);
  // arms: wide open when she comes for you; the atomizer raised when she puffs; the bag on the other arm
  const wrap=st===3;
  const R1=wrap?v(0.26,0.2+Math.sin(t*9)*0.01,0.05):hug?v(0.2,0.25+Math.sin(t*5)*0.02,0.24):puff?v(0.22,0.33,0.06):v(0.1,0.06,0.13);
  limb(U,v(0,0.21,0.1),wrap?v(0.14,0.2,0.2):hug?v(0.08,0.19,0.2):v(0.06,0.1,0.14),R1,0.03*S,0.026*S,0.02*S,card,card,skin,0.024*S);
  ball(U,[R1[0]+0.02*S,R1[1]+0.03*S,R1[2]],[0.022*S,0.04*S,0.022*S],perf,true);ball(U,[R1[0]-0.03*S,R1[1]+0.01*S,R1[2]],[0.02*S,0.02*S,0.02*S],[0.9,0.3,0.5,2],true);
  const L1=wrap?v(0.26,0.2+Math.cos(t*9)*0.01,-0.05):hug?v(0.2,0.25+Math.cos(t*5)*0.02,-0.24):v(0.08,0.07,-0.14);
  limb(U,v(0,0.21,-0.1),wrap?v(0.14,0.2,-0.2):hug?v(0.08,0.19,-0.2):v(0.05,0.12,-0.15),L1,0.03*S,0.026*S,0.02*S,card,card,skin,0.024*S);
  if(!hug&&!wrap){slab(U,[L1[0],L1[1]-0.07*S,L1[2]],[0.04*S,0.04*S,0.018*S],bag);seg(U,[L1[0]-0.02*S,L1[1]-0.03*S,L1[2]],[L1[0]+0.02*S,L1[1]-0.03*S,L1[2]],0.004,0.004,gold)}
  seg(U,v(0,0.24,0),v(0.01,0.29,0),0.03*S,0.028*S,skin);
  const H=subF(U,v(0.01,0.285,0),m3(rYaw(0),rZ(0.25+(st===1?Math.sin(t*3)*0.05:0))));
  const HS={p:H.p,R:H.R.map(q=>q*S)},talking=(s.talkT||0)>0;if(talking)s.talkT-=1/60;
  face(HS,{skin,blink:((t*0.3+s.ph)%1)<0.04?0.1:1,iris:[0.4,0.55,0.75],brow:hair,browH:0.006,browTilt:0.25,eyeS:0.85,nose:[0.016,0.018,0.014],ears:true,mouth:lip,mouthW:hug?0.014:0.026,talk:talking?Math.max(0,Math.sin(t*10))*0.008:0});
  ball(HS,[0.087,0.034,0],[0.008,hug?0.012:0.007,hug?0.014:0.026],lip,true);                           // puckered for a kiss
  for(const z of[-1,1]){seg(HS,[0.09,0.085,z*0.034],[0.092,0.085,z*0.034],0.022,0.022,gold);ball(HS,[0.093,0.085,z*0.034],[0.002,0.018,0.018],glass,true)}
  ball(HS,[-0.01,0.12,0],[0.088,0.06,0.09],hair);ball(HS,[-0.07,0.13,0],[0.04,0.045,0.045],hair);            // white hair, in a bun
  for(const z of[-1,1])ball(HS,[0.05,0.045,z*0.06],[0.02,0.015,0.015],[1,0.6,0.62,1],true);                 // rosy cheeks
  // the perfume cloud
  if(puff||(s.cloudT||0)>0){
    if(puff)s.cloudT=1.6;else s.cloudT-=1/60;
    const a=Math.min(1,s.cloudT);for(let i=0;i<10;i++){const q=(t*0.4+i/10)%1,ang=i*0.63+t*0.3,r=0.3+q*GRAN.cloud*0.8;
      spr(s.x+Math.cos(ang)*r,0.4+Math.sin(i*2+t)*0.25,s.z+Math.sin(ang)*r,0.5+q*0.5,0.5+q*0.5,7,1,0.6,0.85,0.22*a*(1-q*0.5),1)}
  }
  return null;
}

/* ---------- the bosses (creature type 6): every fifth floor is an open arena with a boss in it (src/bosses.js says which) ---------- */
// The boss and its helpers are ordinary creatures in F.shades (so weapons, flashes, potions, health bars and the network all reach them),
// with role 'main' (the boss), 'part' (a piece that has to die too: the Gloop's children) or 'add' / 'decoy' (minions). Every slot exists
// from the start (made by genFloor, so host and guests agree on the list) and waits off the map, dead, until it is needed.
// The host runs the fights. What a boss throws at you (bolts, shockwaves, puddles, walls only a mime can see...) is a hazard: the host
// makes it and sends it ({k:'bz'}), and every player simulates the same hazard and checks it against themselves. The fight starts when
// someone comes close ({k:'bst'}) and ends when every 'main' and 'part' is dead ({k:'bd'}): the seal breaks, gems, ingredients and a trophy.
const BS={hz:[],nid:0,started:false,won:false,wake:0,el:null,card:null,cardT:0,dance:null,beat:0,mus:0,dust:0,reveal:0,frz:null,said:{},goo:0,cool:0,lastHit:0};
const BADD={rat:{hp:2.5,rad:0.2,sp:2.5},candle:{hp:3,rad:0.18,sp:1.5},ember:{hp:2,rad:0.18,sp:2.1}};
// decorative columns, fixed per boss (the arena is 17 x 17 tiles: walls on the edge, open inside)
function bossPillars(i,W,H){
  const c=(W-1)/2,L=[];
  if(i===0||i===2||i===4)for(const [x,y] of[[4,4],[W-5,4],[4,H-5],[W-5,H-5]])L.push([x,y]);
  if(i===5)for(const [x,y] of[[3,c],[W-4,c]])L.push([x,y]);
  if(i===8||i===9)for(const [x,y] of[[3,3],[W-4,3],[3,H-4],[W-4,H-4]])L.push([x,y]);
  return L;
}
function bossSpawn(BA,W,H,shades){
  const D=BOSSES[BA.i],hp=bossHp(BA.i,BA.cyc),mk=(role,o)=>({type:6,boss:BA.i,role,x:-99,z:-99,gx:0,gy:0,px:-1,py:-1,state:0,stun:0,think:0,vis:false,frozen:false,
    ph:shades.length*1.7,d:99,snd:0,face:Math.PI/2,t:0,c1:2,c2:3,c3:5,dead:true,...o});
  const cx=W/2,cz=H/2-1;
  shades.push(mk('main',{x:cx,z:cz,dead:false,hp,hpMax:hp,rad:D.rad,size:1,immune:D.id==='boogie'}));
  const k=1+0.6*BA.cyc;
  if(D.id==='gloop'){for(let i=0;i<2;i++)shades.push(mk('part',{size:0.6,rad:0.45,hp:Math.round(50*k),hpMax:Math.round(50*k)}));
    for(let i=0;i<4;i++)shades.push(mk('part',{size:0.35,rad:0.27,hp:Math.round(20*k),hpMax:Math.round(20*k)}))}
  const adds=D.id==='rat'?['rat',6]:D.id==='tallow'?['candle',4]:D.id==='heart'?['ember',6]:null;
  if(adds)for(let i=0;i<adds[1];i++){const a=BADD[adds[0]];shades.push(mk('add',{kind:adds[0],rad:a.rad,hp:a.hp*k,hpMax:a.hp*k,size:1}))}
  if(D.id==='mimic')for(let i=0;i<3;i++)shades.push(mk('decoy',{rad:0.45,hp:1,hpMax:1,size:1}));
}
const bMain=()=>F&&F.boss?F.shades.find(q=>q.type===6&&q.role==='main'):null;
const bDef=()=>BOSSES[F.boss.i];
const bSpd=s=>bossSpeed(F.boss.cyc)*(s.pe&&s.pe.slow>0?0.55:1)*(s.pe&&s.pe.zip>0?1.3:1)*(POT.stop>0?0:1);
const angD=(a,b)=>{let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d};
const turnTo=(a,b,k)=>{a=a||0;const d=angD(a,b);return a+Math.sign(d)*Math.min(Math.abs(d),k)};
const bMe=()=>MP.on?MP.id:'me';
const bWho=t=>t.loc?bMe():t.p.id;
function bSet(s,st,t){s.state=st;s.t=t||0}
// move a boss through the open arena: walls on the edge and the columns stop it; true when it ran into something
function bMove(s,vx,vz,dt){
  const r=s.rad||0.3;let nx=s.x+vx*dt,nz=s.z+vz*dt,hit=0;
  const lo=1+r,hx=F.W-1-r,hz=F.H-1-r;
  if(nx<lo){nx=lo;hit|=1}if(nx>hx){nx=hx;hit|=1}if(nz<lo){nz=lo;hit|=2}if(nz>hz){nz=hz;hit|=2}
  for(const q of F.pillars){const dx=nx-q[0],dz=nz-q[1],d=Math.hypot(dx,dz),m=r+0.24;if(d<m&&d>1e-4){nx=q[0]+dx/d*m;nz=q[1]+dz/d*m;hit|=4}}
  s.x=nx;s.z=nz;s.gx=Math.floor(nx);s.gy=Math.floor(nz);s.px=-1;return hit;
}
function bToward(s,T,sp,dt,stop=0){
  const dx=T.x-s.x,dz=T.z-s.z,d=Math.hypot(dx,dz)||1e-4;s.face=turnTo(s.face,Math.atan2(dz,dx),5*dt);
  if(d>stop)bMove(s,dx/d*sp,dz/d*sp,dt);return d;
}
const bDist=(s,t)=>Math.hypot(t.x-s.x,t.z-s.z);
const bAim=(s,t)=>Math.atan2(t.z-s.z,t.x-s.x);
// a blow from a boss: the local player takes it here, a guest is told
function bHit(t){
  if(!t||t.inSafe||t.inv>0)return false;
  if(t.loc){if(P.inv>0||P.down||P.away||state!=='play')return false;hurt(null)}else mpHit(t,'hurt');
  return true;
}
function bFuel(t,a,why){if(t.loc)bFuelMe(a,why);else mpSend({k:'bfx',w:'fuel',a,why},t.p.id)}
function bFuelMe(a,why){P.fuel=Math.max(0,P.fuel-a);sfx('drain');if(why)say(why,1.8)}
// a hazard: made by the host, simulated by everyone
function bzAdd(h){if(MP.guest||!F||!F.boss)return;h.id=++BS.nid;h.t=0;if(MP.on)mpSend({k:'bz',d:R.depth,h});BS.hz.push(h)}
function bShot(s,a,o){const sp=o.sp||4.5;bzAdd({k:'shot',x:r3(s.x+Math.cos(a)*(s.rad+0.1)),z:r3(s.z+Math.sin(a)*(s.rad+0.1)),y:o.y||0.5,vx:r3(Math.cos(a)*sp),vz:r3(Math.sin(a)*sp),r:o.r||0.12,life:o.life||4,c:o.c||[1,0.6,0.2],fx:o.fx||'',sz:o.sz||1,pool:o.pool||null})}
function bAdds(kind,n,near){
  let k=0;
  for(const s of F.shades){if(k>=n)break;if(s.type!==6||s.role!=='add'||s.kind!==kind||!s.dead)continue;
    let x=near?near.x:0,z=near?near.z:0;
    if(!near){const e=(Math.random()*4)|0,u=2+Math.random()*(F.W-4);x=e<2?(e?F.W-1.6:1.6):u;z=e<2?u:(e===2?1.6:F.H-1.6)}
    else{const a=Math.random()*6.283;x+=Math.cos(a)*0.8;z+=Math.sin(a)*0.8}
    s.x=clamp(x,1.4,F.W-1.4);s.z=clamp(z,1.4,F.H-1.4);s.dead=false;s.hp=s.hpMax;s.state=1;s.stun=0.6;s.t=0;s.pe=null;s.bleed=s.burnD=null;k++}
  return k;
}
function bShake(k,x,z){if(Math.hypot(x-P.x,z-P.z)<9)pkShake=Math.max(pkShake,k)}
// a boss part or a minion has died (the host, from wKill)
function bossKill(s){
  const x=s.x,z=s.z,D=BOSSES[s.boss],near=Math.hypot(x-P.x,z-P.z)<14,col=hex3(D.col);
  if(near){potBurst(x,0.4,z,s.role==='decoy'?[0.75,0.7,0.6]:col,s.role==='main'?60:24,s.role==='main'?2:1);tone(s.role==='main'?70:160,0.5,'sawtooth',0.12,0,-60);noise(0.4,0.15,700,0.8)}
  s.x=s.z=-99;s.dead=true;s.hp=0;s.state=0;s.pe=null;s.bleed=s.burnD=null;s.markT=0;s.down=0;s.hpShow=0;
  if(s.role==='add'){if(s.killer===potMe()&&Math.random()<0.5){wallet++;R.gems++;store.set('wallet',wallet)}return}
  if(s.role==='decoy')return;
  if(D.id==='gloop'&&s.size>0.3){   // the Gloop splits into two smaller ones
    const kids=F.shades.filter(q=>q.type===6&&q.role==='part'&&q.dead&&!q.born&&Math.abs(q.size-(s.size>0.9?0.6:0.35))<0.01).slice(0,2);
    kids.forEach((q,j)=>{const a=(s.face||0)+(j?1.6:-1.6);q.x=clamp(x+Math.cos(a)*0.6,1.5,F.W-1.5);q.z=clamp(z+Math.sin(a)*0.6,1.5,F.H-1.5);q.dead=false;q.born=true;q.hp=q.hpMax;q.state=3;q.t=0.6;q.stun=0;q.c1=2+j});
    if(near)say(s.size>0.9?'The Gloop splits in two!':'It splits again!',1.6);
  }
  if(!F.shades.some(q=>q.type===6&&!q.dead&&(q.role==='main'||q.role==='part'))){mpSend({k:'bd',d:R.depth});bossWin()}
}
// a thrown potion: a boss shrugs off its magic, but the glass and the brew still burn (stronger brews hurt more)
function bossPotion(c){
  for(const s of F.shades){if(s.type!==6||s.role==='add'||s.dead||s.x<0||Math.hypot(s.x-c.x,s.z-c.z)>SPLASH+(s.rad||0))continue;
    if(s.immune)continue;wApply({i:F.shades.indexOf(s),d:Math.round((2+2*(POT.m||1))*10)/10,st:0.2},c.by||potMe())}
}
// how much more a boss takes when it is open to it (dazed on a wall, overheated, caught out...)
const bossVuln=s=>s.type===6?s.vulnK||1:1;
// the fight has started: the title card
function bossStart(quiet){
  if(BS.started||!F||!F.boss)return;BS.started=true;
  const m=bMain();if(m&&!MP.guest&&m.state===0)bSet(m,1,0.5);
  if(m&&!MP.guest){const n=Math.max(1,mpTargets().length),k=1+0.75*(n-1);for(const q of F.shades)if(q.type===6&&(q.role==='main'||q.role==='part')){q.hpMax=Math.round(q.hpMax*k);q.hp=q.hpMax}}   // +75% for each extra player
  if(!MP.guest&&!quiet)mpSend({k:'bst',d:R.depth});
  const D=bDef();bossCard(D.name,D.hint+(F.boss.cyc?'  ·  round '+(F.boss.cyc+1):''));
  tone(55,1.6,'sawtooth',0.18,0,-20);tone(82,1.6,'sawtooth',0.12,0.05,-25);noise(1.2,0.12,300,0.5);rumble(400,0.6,0.6);
  if(D.id!=='mime')setTimeout(()=>{if(F&&F.boss&&!BS.won)say(D.taunt,2.2)},1600);
  {const d0=R.depth;setTimeout(()=>{if(F&&F.boss&&R.depth===d0&&!BS.won&&D.id!=='boogie')say(D.hint+'.',4)},4200)}
}
function bossWin(){
  if(BS.won||!F||!F.boss)return;BS.won=true;BS.hz.length=0;BS.dance=null;BS.frz=null;danceHide();
  const B=F.boss,D=BOSSES[B.i],g=bossGems(B.i,B.cyc);
  for(const q of F.shades)if(q.type===6&&q.role!=='main'){q.dead=true;q.x=q.z=-99}
  P.shards=3;wallet+=g;R.gems+=g;R.score+=1000*(B.i+1)*(1+B.cyc);store.set('wallet',wallet);
  const rare=[9,10,11,12],got=[];for(let k=0;k<3;k++){const i=rare[(Math.random()*rare.length)|0];POT.bag[i]++;got.push(INGREDIENTS[i].name)}potSaveBag();POT.hudK='';
  if(!archiveRun){const T=bossTrophies(),e=T[D.id]||{n:0,best:0};e.n++;e.best=Math.max(e.best,R.depth);T[D.id]=e;store.set('trophies',T);hub.setTrophies?.(T,adminOverride)}
  [523,659,784,1046].forEach((f,i)=>{tone(f,0.5,'triangle',0.12,i*0.14);tone(f/2,0.6,'sine',0.08,i*0.14)});
  wGainXp(wHeld(),80+25*B.i);
  bossCard(D.name+' is defeated!','+'+g+' gems  ·  '+got.join(', ')+'  ·  a trophy for the lobby');
  say('The seal is broken. The way down is open.',5);
}
const bossTrophies=()=>{const t=store.get('trophies',{});return t&&typeof t==='object'&&!Array.isArray(t)?t:{}};
// a new floor: forget the last fight
function bossReset(){bpReset();BS.dcam=null;BS.groove=100;BS.hz.length=0;BS.started=false;BS.won=false;BS.wake=0;BS.dance=null;BS.frz=null;BS.dust=0;BS.reveal=0;BS.goo=0;BS.cool=0;BS.said={};danceHide();if(BS.el)BS.el.style.display='none'}

// ---- the host's turn for a boss creature (instead of the usual chase; after the shade loop's dead check)
function bossTick(s,dt,TG){
  if(s.pe)for(const k in s.pe){s.pe[k]-=dt;if(s.pe[k]<=0)delete s.pe[k]}
  if(s.role==='main'||s.role==='part')s.hpShow=5;
  if(s.vt>0){s.vt-=dt;if(s.vt<=0)s.vulnK=1}
  const T0=TG.filter(t=>!t.inSafe&&t.x>0);
  if(!BS.started){
    BS.wake+=dt;
    if(T0.some(t=>bDist(s,t)<6.5)||BS.wake>9&&T0.length)bossStart();
    return;
  }
  if(BS.won)return;
  if(s.stun>0){s.stun-=dt;return}
  if(!T0.length)return;
  const T=mpNearest(T0,s.x,s.z);
  if(s.role==='add'){addTick(s,dt,T0,T);return}
  if(s.role==='decoy')return;   // the Mimic moves its decoys itself
  s.t-=dt;s.c1-=dt;s.c2-=dt;s.c3-=dt;
  BTICK[s.boss](s,dt,T0,T);
}
// minions: rats nip you, candlelings snuff your torch, embers burst on you
function addTick(s,dt,T0,T){
  const a=BADD[s.kind],sp=a.sp*bSpd(s);
  if(s.kind==='candle'){const w=BP.props.find(p=>p.kind==='window'&&p.st===1);if(w){const g={x:w.x+w.ex*0.6,z:w.z};if(bToward(s,g,sp*1.3,dt,0)<0.5){w.st=0;w.t=0;BP.dirty=true;noise(0.2,0.15,1200,1)}return}}   // they hurry to shut an open window
  bToward(s,T,sp,dt,0);
  for(const t of T0)if(bDist(s,t)<s.rad+0.28){
    if(s.kind==='candle')bFuel(t,25,'A candleling snuffs at your torch');else bHit(t);
    s.killer=null;bossKill(s);return;
  }
}
// what each boss does (the host): T0 everyone it can hunt, T the nearest
const BTICK=[
  // 0 King Ratbag: chases, rears up and charges in a straight line (a wall dazes him), bites, and squeals for his subjects
  (s,dt,T0,T)=>{
    const sp=bSpd(s);
    switch(s.state){
      case 1:{
        const bait=ratBait(s);
        if(bait){const d2=bToward(s,bait,2.5*sp,dt,0);if(d2<0.45){bait.st=2;bait.t=9;BP.dirty=true;bpSound('snap',bait);mpSend({k:'bfx2',w:'snap'});say('SNAP! Ratbag is caught in his own trap!',2);bSet(s,4,0.1);bossBlow(s,0.12,4.5,1.8)}break}   // he cannot resist cheese
        const d=bToward(s,T,1.9*sp,dt,s.rad+0.15);
        if(!s.sum1&&s.hp<s.hpMax*0.7||s.sum1&&!s.sum2&&s.hp<s.hpMax*0.4){if(s.sum1)s.sum2=1;else s.sum1=1;bSet(s,6,1.1);return}
        if(d<s.rad+0.75&&s.c2<=0){bSet(s,5,0.42);return}
        if(d>2&&s.c1<=0&&los(s.x,s.z,T.x,T.z)){bSet(s,2,0.85/Math.min(sp,1.3));return}
        break}
      case 2:s.face=turnTo(s.face,bAim(s,T),2.6*dt);if(s.t<=0){bSet(s,3,2.6);s.hitSet={}}break;
      case 3:{const v=7.2*sp,hit=bMove(s,Math.cos(s.face)*v,Math.sin(s.face)*v,dt);
        for(const t of T0){const w=bWho(t);if(!s.hitSet[w]&&bDist(s,t)<s.rad+0.32){s.hitSet[w]=1;bHit(t)}}
        if(hit){bSet(s,4,2.3);s.vulnK=0.5;s.vt=2.3;s.c1=3.5+Math.random()*2;bzAdd({k:'ring',x:r3(s.x),z:r3(s.z),v:3.5,max:2.2,w:0.16,hh:0.22,c:[0.6,0.5,0.4]})}
        else if(s.t<=0){bSet(s,1);s.c1=2.5}
        break}
      case 4:if(s.t<=0)bSet(s,1);break;
      case 5:if(s.t<=0){for(const t of T0)if(bDist(s,t)<s.rad+0.7&&Math.abs(angD(s.face,bAim(s,t)))<1)bHit(t);s.c2=1.5;bSet(s,1)}break;
      case 6:if(s.t<=0){bAdds('rat',3);bSet(s,1)}break;
    }
  },
  // 1 The Boogie Man: weapons do nothing; dance-offs (src/bosses.js charts), round after round, until he drops
  (s,dt,T0,T)=>{
    s.face=turnTo(s.face,bAim(s,T),2*dt);
    const cx=F.W/2,cz=F.H/2-1;if(Math.hypot(s.x-cx,s.z-cz)>0.3)bMove(s,(cx-s.x)*0.8,(cz-s.z)*0.8,dt);
    // each round: your dance (every arrow you hit hurts him), then his (every arrow is an attack: hit it to dodge). States 1 a breather,
    // 2 your dance, 3 "my turn", 4 his dance.
    const go=part=>{const seed=(Math.random()*1e9)|0,ch=danceChart(seed,s.round+(part==='him'?1:0));bzAdd({k:'ddr',seed,round:s.round,part,delay:2.4,life:2.4+ch.len+1});return 2.4+ch.len+1.2};
    if(s.state===1&&s.t<=0){s.round=(s.round|0)+1;bSet(s,2,go('you'))}
    else if(s.state===2&&s.t<=0)bSet(s,3,1.6);
    else if(s.state===3&&s.t<=0)bSet(s,4,go('him'));
    else if(s.state===4&&s.t<=0)bSet(s,1,2.2);
  },
  // 2 The Gloop (and every piece of it): hops after you, splats a shockwave and a puddle; the big one leaps onto you
  (s,dt,T0,T)=>{
    const sp=bSpd(s),big=s.size>0.9;
    switch(s.state){
      case 1:if(s.t<=0){const d=bDist(s,T),a=bAim(s,T),hop=Math.min(Math.max(d-s.rad*0.5,0.4),1.6+1.4*s.size);s.face=a;s.vx=Math.cos(a)*hop/0.6;s.vz=Math.sin(a)*hop/0.6;bSet(s,2,0.6)}break;
      case 2:bMove(s,s.vx*sp,s.vz*sp,dt);if(s.t<=0){
        for(const t of T0)if(bDist(s,t)<s.rad+0.25)bHit(t);
        if(s.size>0.5)bzAdd({k:'ring',x:r3(s.x),z:r3(s.z),v:3,max:0.8+1.4*s.size,w:0.14,hh:0.2,c:[0.4,1,0.3]});
        bzAdd({k:'pool',x:r3(s.x),z:r3(s.z),r:0.3+0.45*s.size,life:7,c:[0.25,0.75,0.15],fx:'goo'});bSet(s,3,0.35)}break;
      case 3:if(s.t<=0){
        if(big&&s.c1<=0){s.c1=6.5;s.lx=T.x;s.lz=T.z;bzAdd({k:'mark',x:r3(T.x),z:r3(T.z),r:1.25,delay:1.4,c:[0.4,1,0.3],ring:3.2});bSet(s,4,0.5)}
        else bSet(s,1,(0.55-0.25*(1-s.size))/Math.min(sp,1.4))}break;
      case 4:if(s.t<=0){s.vx=(s.lx-s.x)/0.9;s.vz=(s.lz-s.z)/0.9;s.face=Math.atan2(s.vz,s.vx);bSet(s,5,0.9)}break;
      case 5:bMove(s,s.vx,s.vz,dt);if(s.t<=0){bzAdd({k:'pool',x:r3(s.x),z:r3(s.z),r:1.1,life:8,c:[0.25,0.75,0.15],fx:'goo'});bShake(0.6,s.x,s.z);bSet(s,3,0.9)}break;
      default:bSet(s,1,0.4);
    }
  },
  // 3 The Big Dill: a freezing aura (everyone works that out themselves), seed spit, and a roll that bounces off the walls. Pickled at half health.
  (s,dt,T0,T)=>{
    const sp=bSpd(s),pk=s.hp<s.hpMax*0.5;s.frozen=pk;
    if(pk&&!s.pkd){s.pkd=1;bSet(s,6,1.4);return}
    switch(s.state){
      case 1:{bToward(s,T,1.35*sp*(pk?1.2:1),dt,1.2);
        if(s.c1<=0){bSet(s,2,0.6);s.c1=3.2}
        else if(s.c2<=0&&bDist(s,T)>1.5){bSet(s,3,0.7);s.c2=7}
        break}
      case 2:s.face=turnTo(s.face,bAim(s,T),3*dt);if(s.t<=0){const n=pk?7:5;for(let i=0;i<n;i++)bShot(s,s.face+(i-(n-1)/2)*0.22,{sp:4.6,r:0.1,c:[0.85,0.95,0.6],fx:'chill',y:0.7,pool:pk?{r:0.4,life:5,c:[0.6,0.7,0.2],fx:'goo'}:null});bSet(s,1)}break;
      case 3:s.face=turnTo(s.face,bAim(s,T),3*dt);if(s.t<=0){const v=(pk?6.4:5.4)*sp;s.vx=Math.cos(s.face)*v;s.vz=Math.sin(s.face)*v;s.bn=0;s.hitSet={};s.pT=0;bSet(s,4,4.5)}break;
      case 4:{const h=bMove(s,s.vx,s.vz,dt);
        if(h){if(h&1)s.vx=-s.vx;if(h&2)s.vz=-s.vz;if(h&4){s.vx=-s.vx;s.vz=-s.vz}s.bn++;s.hitSet={};bShake(0.3,s.x,s.z);
          if(s.bn===1||s.bn===3){const a=bAim(s,T),v=Math.hypot(s.vx,s.vz);s.vx=Math.cos(a)*v;s.vz=Math.sin(a)*v}}
        s.face=Math.atan2(s.vz,s.vx);
        for(const t of T0){const w=bWho(t);if(!s.hitSet[w]&&bDist(s,t)<0.62){s.hitSet[w]=1;bHit(t)}}
        if(pk){s.pT-=dt;if(s.pT<=0){s.pT=0.35;bzAdd({k:'pool',x:r3(s.x),z:r3(s.z),r:0.45,life:6,c:[0.6,0.7,0.2],fx:'goo'})}}
        if(s.bn>=3||s.t<=0){bSet(s,5,1);s.vulnK=0.5;s.vt=1}
        break}
      case 5:if(s.t<=0)bSet(s,1);break;
      case 6:if(s.t<=0){bSet(s,1);s.c1=0.5}break;
    }
  },
  // 4 Mother Tallow: blows your torch out, lobs hot wax, sends candlelings; she melts as she is hurt
  (s,dt,T0,T)=>{
    const sp=bSpd(s);
    switch(s.state){
      case 1:{bToward(s,T,1.05*sp,dt,1.4);
        if(!s.sum1&&s.hp<s.hpMax*0.6||s.sum1&&!s.sum2&&s.hp<s.hpMax*0.3){if(s.sum1)s.sum2=1;else s.sum1=1;bSet(s,5,1.2);return}
        if(s.c1<=0&&bDist(s,T)<6){bSet(s,2,0.9);s.c1=6.5}
        else if(s.c2<=0){bSet(s,4,0.7);s.c2=4}
        break}
      case 2:s.face=turnTo(s.face,bAim(s,T),2.5*dt);if(s.t<=0){bzAdd({k:'cone',fx:'snuff',x:r3(s.x),z:r3(s.z),yaw:r3(s.face),cone:0.5,len:6,life:1.5});bSet(s,3,1.5)}break;
      case 3:if(s.t<=0)bSet(s,1);break;
      case 4:if(s.t<=0){for(const t of T0.slice(0,3))for(let k=0;k<(T0.length>1?1:3);k++){const a=Math.random()*6.283,r=k?0.7+Math.random()*1.3:0;
          bzAdd({k:'mark',x:r3(clamp(t.x+Math.cos(a)*r,1.5,F.W-1.5)),z:r3(clamp(t.z+Math.sin(a)*r,1.5,F.H-1.5)),r:0.75,delay:1.25+k*0.2,c:[1,0.85,0.5],pool:{r:0.65,life:8,c:[0.95,0.88,0.65],fx:'goo'}})}
        bSet(s,1)}break;
      case 5:if(s.t<=0){bAdds('candle',2);bSet(s,1)}break;
    }
  },
  // 5 The Grand Mimic: hops, lashes its tongue (and reels you in), spits coins, then shuts and shuffles with its decoys: find the real one
  (s,dt,T0,T)=>{
    const sp=bSpd(s),dec=F.shades.filter(q=>q.type===6&&q.role==='decoy');
    switch(s.state){
      case 1:{bToward(s,T,1.6*sp,dt,1.1);
        if(s.c3<=0){bSet(s,5,3.6);s.c3=13;mimicShuffleStart(s,dec);return}
        if(s.c1<=0&&bDist(s,T)<3.6){bSet(s,2,0.55);s.c1=3.4}
        else if(s.c2<=0){bSet(s,4,0.5);s.c2=5}
        break}
      case 2:s.face=turnTo(s.face,bAim(s,T),4*dt);if(s.t<=0){bzAdd({k:'line',x:r3(s.x),z:r3(s.z),yaw:r3(s.face),len:3.8,w:0.22,life:0.45,pull:1,ow:s.rad+0.45});bSet(s,3,0.5)}break;
      case 3:if(s.t<=0)bSet(s,1);break;
      case 4:if(s.t<=0){for(let i=0;i<10;i++)bShot(s,s.face+(Math.random()-0.5)*1.6,{sp:3.5+Math.random()*2.5,r:0.09,c:[1,0.8,0.25],y:0.35,life:3});bSet(s,1)}break;
      case 5:mimicShuffle(s,dec,dt);if(s.t<=0){bSet(s,6,9);for(const q of dec)q.state=6}break;
      case 6:if(s.t<=0||s.found){mimicReveal(s,dec)}break;
    }
  },
  // 6 Sir Suckalot: sucks you toward his nozzle (and spits you out), overheats after, blasts dust and debris
  (s,dt,T0,T)=>{
    const sp=bSpd(s);
    switch(s.state){
      case 1:{bToward(s,T,1.6*sp,dt,1.6);
        if(s.c1<=0){bSet(s,2,0.8);s.c1=8}
        else if(s.c2<=0){bSet(s,5,0.6);s.c2=5.5}
        break}
      case 2:s.face=turnTo(s.face,bAim(s,T),3*dt);if(s.t<=0){bzAdd({k:'cone',fx:'pull',x:r3(s.x),z:r3(s.z),yaw:r3(s.face),cone:0.6,len:8,life:3.4,ow:s.rad+0.35});bSet(s,3,3.4)}break;
      case 3:s.face=turnTo(s.face,bAim(s,T),0.9*dt);if(s.t<=0){bSet(s,4,2.8);s.vulnK=0.5;s.vt=2.8}break;
      case 4:if(s.t<=0)bSet(s,1);break;
      case 5:if(s.t<=0){bzAdd({k:'dust',x:r3(s.x),z:r3(s.z),r:3.4,life:0.5});for(let i=0;i<8;i++)bShot(s,i/8*6.283+Math.random()*0.3,{sp:4,r:0.1,c:[0.7,0.6,0.5],y:0.3,life:2.5});bSet(s,1)}break;
    }
  },
  // 7 The Mime: silent. Boxes you in with walls you cannot see, hauls you in on a rope that is not there, shoots an invisible bow, pushes a wall
  (s,dt,T0,T)=>{
    const sp=bSpd(s),d=bDist(s,T);
    switch(s.state){
      case 1:{bToward(s,T,1.7*sp,dt,1.6);
        if(s.c1<=0){bSet(s,2,0.9);s.c1=9}
        else if(s.c2<=0&&d>2.2){bSet(s,3,0.7);s.c2=6}
        else if(s.c3<=0){bSet(s,Math.random()<0.5?5:7,0.8);s.c3=3.5}
        else if(d<s.rad+0.6&&!(s.bt>0)){bHit(T);s.bt=1.5}
        if(s.bt>0)s.bt-=dt;
        break}
      case 2:s.face=turnTo(s.face,bAim(s,T),4*dt);if(s.t<=0){const h=0.85,x=T.x,z=T.z,W=(a,b,c,e)=>bzAdd({k:'wall',x0:r3(a),z0:r3(b),x1:r3(c),z1:r3(e),life:5.5});
        W(x-h,z-h,x+h,z-h);W(x+h,z-h,x+h,z+h);W(x+h,z+h,x-h,z+h);W(x-h,z+h,x-h,z-h);bSet(s,1)}break;
      case 3:s.face=turnTo(s.face,bAim(s,T),4*dt);if(s.t<=0){bzAdd({k:'cone',fx:'tug',x:r3(s.x),z:r3(s.z),yaw:r3(s.face),cone:0.4,len:7,life:1.8,ow:s.rad+0.4});bSet(s,4,1.8)}break;
      case 4:s.face=turnTo(s.face,bAim(s,T),2*dt);for(const t of T0)if(bDist(s,t)<s.rad+0.5&&bHit(t)){bSet(s,1);break}if(s.t<=0)bSet(s,1);break;
      case 5:s.face=turnTo(s.face,bAim(s,T),5*dt);if(s.t<=0){bShot(s,s.face,{sp:8.5,r:0.08,c:[0.9,0.9,1],y:0.75,life:2,sz:0.4});bSet(s,6,0.4)}break;
      case 6:if(s.t<=0)bSet(s,1);break;
      case 7:if(s.t<=0){const a=s.face,nx=-Math.sin(a),nz=Math.cos(a),x=s.x+Math.cos(a)*0.7,z=s.z+Math.sin(a)*0.7;
        bzAdd({k:'pwall',x0:r3(x-nx*1.6),z0:r3(z-nz*1.6),x1:r3(x+nx*1.6),z1:r3(z+nz*1.6),vx:r3(Math.cos(a)*1.7),vz:r3(Math.sin(a)*1.7),life:5});bSet(s,8,1.2)}break;
      case 8:if(s.t<=0)bSet(s,1);break;
    }
  },
  // 8 The Cuckoo Clock: a swinging pendulum, rolling gears, flung springs, and on the hour: freeze, or else
  (s,dt,T0,T)=>{
    const sp=bSpd(s);
    const pa=s.face+Math.sin(R.time*2.4)*0.9;   // the swing follows the shared clock, so everyone sees it where it hits
    for(const t of T0){const d=bDist(s,t);if(d<s.rad+1.25&&d>s.rad*0.5&&Math.abs(angD(pa,bAim(s,t)))<0.28&&!(s.pT>0)){if(bHit(t))s.pT=1}}
    if(s.pT>0)s.pT-=dt;
    switch(s.state){
      case 1:{bToward(s,T,0.75*sp,dt,1.5);
        if(s.c3<=0){bSet(s,4,1.3);s.c3=11+Math.random()*3;s.hour=(s.hour|0)%3+1}
        else if(s.c1<=0){bSet(s,2,0.7);s.c1=4.5}
        else if(s.c2<=0){bSet(s,3,0.6);s.c2=6}
        break}
      case 2:s.face=turnTo(s.face,bAim(s,T),3*dt);if(s.t<=0){for(const t of T0.length>1?T0:[T,T,T]){const a=bAim(s,t)+(Math.random()-0.5)*0.7;
        bzAdd({k:'roll',x:r3(s.x+Math.cos(a)*0.6),z:r3(s.z+Math.sin(a)*0.6),vx:r3(Math.cos(a)*3.4*sp),vz:r3(Math.sin(a)*3.4*sp),r:0.27,life:6})}bSet(s,1)}break;
      case 3:if(s.t<=0){for(const t of T0)for(let k=0;k<2;k++){const a=Math.random()*6.283,r=k*1.2;bzAdd({k:'mark',x:r3(clamp(t.x+Math.cos(a)*r,1.5,F.W-1.5)),z:r3(clamp(t.z+Math.sin(a)*r,1.5,F.H-1.5)),r:0.7,delay:1.2+k*0.25,c:[0.9,0.75,0.4]})}bSet(s,1)}break;
      case 4:if(s.t<=0){const dur=0.9*s.hour+1.2;bzAdd({k:'freeze',life:dur,n:s.hour});bSet(s,5,dur);s.vulnK=0.5;s.vt=dur}break;
      case 5:if(s.t<=0)bSet(s,1);break;
    }
  },
  // 9 The Ember Heart: shockwaves on its beat (jump them), fireballs, eruptions under your feet, embers; at half health the floor itself erupts
  (s,dt,T0,T)=>{
    const sp=bSpd(s),p2=s.hp<s.hpMax*0.5;s.frozen=p2;
    if(p2){s.tl=(s.tl||5)-dt;if(s.tl<=0){s.tl=5.5;for(let k=0;k<9;k++){const x=2+((Math.random()*(F.W-4))|0),z=2+((Math.random()*(F.H-4))|0);bzAdd({k:'mark',x:x+0.5,z:z+0.5,r:0.55,delay:1.5,c:[1,0.35,0.05],sq:1})}}}
    switch(s.state){
      case 1:{bToward(s,T,0.9*sp,dt,2);
        if(!s.sum1&&s.hp<s.hpMax*0.66||s.sum1&&!s.sum2&&s.hp<s.hpMax*0.33){if(s.sum1)s.sum2=1;else s.sum1=1;bSet(s,5,1.2);return}
        if(s.c1<=0){bSet(s,2,0.55);s.c1=p2?3.2:4.2}
        else if(s.c2<=0){bSet(s,3,0.6);s.c2=p2?2.6:3.4}
        else if(s.c3<=0){bSet(s,4,0.5);s.c3=7;s.er=p2?4:3;s.erT=0}
        break}
      case 2:if(s.t<=0){bzAdd({k:'ring',x:r3(s.x),z:r3(s.z),v:3.1*sp,max:9,w:0.17,hh:0.28,c:[1,0.4,0.08]});if(p2)s.ring2=0.75;bSet(s,1)}break;
      case 3:s.face=turnTo(s.face,bAim(s,T),4*dt);if(s.t<=0){const n=p2?5:3;for(const t of T0){const a=bAim(s,t);for(let i=0;i<n;i++)bShot(s,a+(i-(n-1)/2)*0.18,{sp:5,r:0.14,c:[1,0.5,0.1],y:0.6,fx:'burn',sz:1.4})}bSet(s,1)}break;
      case 4:if(s.t<=0)bSet(s,1);break;
      case 5:if(s.t<=0){bAdds('ember',3,s);bSet(s,1)}break;
    }
    if(s.ring2>0){s.ring2-=dt;if(s.ring2<=0)bzAdd({k:'ring',x:r3(s.x),z:r3(s.z),v:3.1*sp,max:9,w:0.17,hh:0.28,c:[1,0.4,0.08]})}
    if(s.er>0){s.erT-=dt;if(s.erT<=0){s.erT=0.45;s.er--;for(const t of T0)bzAdd({k:'mark',x:r3(t.x),z:r3(t.z),r:0.7,delay:1,c:[1,0.4,0.05],pillar:1})}}
  },
];
// ---- the Mimic's shell game
function mimicShuffleStart(s,dec){
  const cx=F.W/2,cz=F.H/2-1,o=Math.random()*6.283,all=[s,...dec];
  s.slots=all.map((q,i)=>[cx+Math.cos(o+i*Math.PI/2)*3,cz+Math.sin(o+i*Math.PI/2)*3]);
  all.forEach((q,i)=>{q.slot=i;if(q!==s){q.x=s.x;q.z=s.z;q.dead=false;q.hp=1;q.state=5;q.stun=0}});
  s.found=false;s.swapT=0.5;
}
function mimicShuffle(s,dec,dt){
  const all=[s,...dec.filter(q=>!q.dead)];
  s.swapT-=dt;if(s.swapT<=0&&s.t>0.8){s.swapT=0.55;const a=all[(Math.random()*all.length)|0],b=all[(Math.random()*all.length)|0];if(a!==b){const k=a.slot;a.slot=b.slot;b.slot=k}}
  for(const q of all){const g=s.slots[q.slot],dx=g[0]-q.x,dz=g[1]-q.z,d=Math.hypot(dx,dz);if(d>0.02){const v=Math.min(d,5*dt);q.x+=dx/d*v;q.z+=dz/d*v;q.face=Math.atan2(dz,dx)}q.gx=Math.floor(q.x);q.gy=Math.floor(q.z)}
  for(const q of all)if(q!==s)q.state=5;
}
function mimicReveal(s,dec){
  for(const q of dec)if(!q.dead){q.killer=null;bossKill(q)}
  const hit=s.found;bSet(s,1);s.c1=1.5;s.found=false;if(hit)bossBlow(s,0.14,4,1.8);
}
// a blow lands on a boss creature (the host, from wApply): the Mimic's decoys and its hiding
function bossStruck(s){
  if(s.role==='decoy'){if(!s.dead){const D=F.shades.find(q=>q.type===6&&q.role==='main');s.killer=null;const x=s.x,z=s.z;bossKill(s);
    if(D)for(let i=0;i<5;i++)bShot({x,z,rad:0.2},bAim({x,z},mpNearest(mpTargets(),x,z)||{x:x+1,z})+(i-2)*0.3,{sp:4,r:0.09,c:[1,0.8,0.25],y:0.35,life:2.5})}return false}
  if(s.role==='main'&&BOSSES[s.boss].id==='mimic'&&s.state===6)s.found=true;
  return true;
}

// ---- every boss has a trick (its "schtick"): props in the arena to use against it, and carried things (cheese, bowling balls).
// Weapons only scratch a guarded boss (BOSSES[i].armor); working the trick lands a heavy blow (bossBlow) and leaves it stunned and
// open for a few seconds. The host owns the props and the pickups: players ask with {k:'bpa'}, the host applies it and streams the
// whole lot back ({k:'bsx'}) when anything changes, and once a second anyway.
const BP={props:[],items:[],nid:0,dirty:false,syncT:0,near:null,carry:null,spawnT:3};
const bMeId=()=>MP.on?MP.id:'me';
// fixed spots in the 17 x 17 arena (center 8.5, 7.5): [kind, x, z, extra]
const BPROPS={
  rat:()=>[['trap',3.5,7.5],['trap',13.5,7.5],['trap',8.5,3.2],['trap',8.5,12.2]],
  gloop:()=>[['lamp',6.4,5.3],['lamp',10.6,5.3],['lamp',6.4,10.2],['lamp',10.6,10.2]],
  dill:()=>[['barrel',2.1,4.2,[1,0.6]],['barrel',14.9,4.2,[-1,0.6]],['barrel',2.1,11.2,[1,-0.6]],['barrel',14.9,11.2,[-1,-0.6]]],
  tallow:()=>[['window',1.08,4.8,1],['window',1.08,10.4,1],['window',15.92,4.8,-1],['window',15.92,10.4,-1]],
  mime:()=>[['gong',8.5,11.2],['horn',1.35,7.5,1],['horn',15.65,7.5,-1]],
  cuckoo:()=>[['crank',1.3,8.2,1],['crank',15.7,8.2,-1],['crank',8.5,1.3,0]],
  heart:()=>[['grate',5.2,5.2,0],['grate',11.8,5.2,1],['grate',5.2,10.2,2],['grate',11.8,10.2,3],['lever',1.35,5.2,0],['lever',15.65,5.2,1],['lever',1.35,10.2,2],['lever',15.65,10.2,3]],
};
const BPLABEL={trap:p=>BP.carry==='cheese'&&p.st===0?'bait the trap with cheese':p.st===1?'the trap is baited':p.st===2?'the trap is sprung':'(bring cheese)',
  lamp:p=>p.st===1?'the lamp is lit':p.cd>0?'the lamp is cooling':'switch on the heat lamp',barrel:p=>p.st?'the barrel is empty':'tip the brine barrel',
  window:p=>p.st?'the window is open':'throw open the window',gong:p=>p.cd>0?'the gong still rings':'strike the gong',horn:p=>p.cd>0?'the horn is spent':'blow the air horn',
  crank:p=>'wind the crank ('+Math.round(p.w*100)+'%)',lever:p=>p.cd>0?'the floodgate is resetting':'open the floodgate',grate:()=>''};
function bpReset(){
  BP.props.length=0;BP.items.length=0;BP.carry=null;BP.near=null;BP.spawnT=3;BP.dirty=false;
  if(!F||!F.boss)return;const f=BPROPS[BOSSES[F.boss.i].id];if(!f)return;
  f(F.W,F.H).forEach((q,i)=>BP.props.push({i,kind:q[0],x:q[1],z:q[2],ex:q[3],st:0,t:0,cd:0,w:0,used:0}));
}
// the host: one heavy blow from the trick, then a few seconds stunned and wide open
// after a trick lands the boss is wary for a while: the same trick will not work on it again until it lets its guard down
const BOSS_REC=cyc=>22+4*Math.min(cyc,5);
const bWary=s=>!!s&&s.rec>0;
function bossBlow(s,frac,vt,k){
  frac=Math.max(frac,0.1);vt=Math.min(vt,4);k=1;   // every trick is worth about a tenth of the boss, and opens it for a few seconds at full damage
  if(MP.guest||!s||s.dead||s.rec>0)return;
  const cyc=F.boss.cyc;s.rec=BOSS_REC(cyc);s.hp-=frac*s.hpMax/(1+0.25*cyc);s.hitT=0.35;s.hpShow=5;
  s.stun=Math.max(s.stun,vt);s.vt=vt;s.vulnK=k||1.6;
  if(Math.hypot(s.x-P.x,s.z-P.z)<14){tone(90,0.5,'sawtooth',0.18,0,-50);noise(0.4,0.2,600,0.6);bShake(0.5,s.x,s.z)}
  potBurst(s.x,0.6,s.z,hex3(BOSSES[s.boss].col),40,1.5);
  if(s.hp<=0)wKill(s);
}
// how much of a weapon's blow gets through: the boss's armor, unless something has opened it up
function bossArmor(s){
  if(s.type!==6||s.role==='add'||s.role==='decoy')return 1;
  if(s.vt>0)return s.vulnK||1.6;
  return BOSSES[s.boss].armor??1;
}
// a player uses a prop (the host decides; who = the player's id, at)
function bpAct(i,who,at){
  const p=BP.props[i];if(!p||!F||!F.boss||BS.won)return;const m=bMain();if(!m)return;
  if(at&&Math.hypot(at.x-p.x,at.z-p.z)>1.5)return;
  const held=BP.items.find(q=>q.holder===who);
  switch(p.kind){
    case 'trap':if(p.st===0&&held&&held.kind==='cheese'){BP.items.splice(BP.items.indexOf(held),1);p.st=1;bpSound('bait',p)}break;
    case 'lamp':if(p.st===0&&p.cd<=0){p.st=1;p.t=9;bpSound('lamp',p)}break;
    case 'barrel':if(p.st===0){p.st=1;p.t=20;const d=p.ex,l=Math.hypot(d[0],d[1]);bzAdd({k:'pool',x:r3(p.x+d[0]/l*1.6),z:r3(p.z+d[1]/l*1.6),r:1.15,life:16,c:[0.45,0.62,0.18],fx:'goo',brine:1});bpSound('barrel',p)}break;
    case 'window':if(p.st===0){p.st=1;p.t=9;p.used=0;bpSound('window',p)}break;
    case 'gong':case 'horn':if(p.cd<=0&&!bWary(m)){p.cd=p.kind==='gong'?9:12;bpSound(p.kind,p);
      if(Math.hypot(m.x-p.x,m.z-p.z)<(p.kind==='gong'?4.6:3.8)){bossBlow(m,0.11,4.5,2);mpSend({k:'bfx2',w:'shock'});BP.shock=R.time}}break;
    case 'crank':p.w=Math.min(1,p.w+0.34);bpSound('crank',p);break;
    case 'lever':if(p.cd<=0){p.cd=7;const g=BP.props.find(q=>q.kind==='grate'&&q.ex===p.ex);if(g){g.t=0.9;g.st=1;bpSound('lever',p)}}break;
  }
  BP.dirty=true;
}
// a player picks up a carried thing
function bpTake(id,who){const it=BP.items.find(q=>q.id===id);if(!it||it.holder||BP.items.some(q=>q.holder===who))return;it.holder=who;BP.dirty=true}
function bpSound(k,p){
  const d=Math.hypot(p.x-P.x,p.z-P.z);if(d>16)return;const v=1-d/16;
  if(k==='bait'){tone(660,0.1,'triangle',0.06*v);tone(880,0.1,'triangle',0.05*v,0.08)}
  else if(k==='snap'){noise(0.12,0.4*v,2200,1);tone(70,0.4,'square',0.2*v,0,-40)}
  else if(k==='lamp'){tone(120,0.6,'sawtooth',0.04*v,0,30);noise(0.1,0.1*v,4000,2)}
  else if(k==='barrel'){noise(0.8,0.18*v,700,0.6);tone(90,0.3,'sine',0.12*v)}
  else if(k==='window'){noise(0.25,0.2*v,1200,1);noise(2,0.08*v,500,0.4,0.2)}
  else if(k==='gong'){for(const f of[110,165,221,277])tone(f,3,'sine',0.12*v);noise(0.5,0.15*v,300,0.5)}
  else if(k==='horn'){tone(415,1.4,'sawtooth',0.18*v);tone(466,1.4,'sawtooth',0.14*v)}
  else if(k==='crank'){for(let i=0;i<4;i++)noise(0.04,0.12*v,2600,3,i*0.08)}
  else if(k==='lever'){tone(160,0.2,'square',0.1*v);noise(0.3,0.12*v,900,1,0.1)}
}
// the host's turn for the props: timers, spawns, and what each trick does to the boss
function bpHost(dt,TG){
  const m=bMain(),id=BOSSES[F.boss.i].id;if(!m||BS.won)return;
  for(const p of BP.props){if(p.cd>0)p.cd-=dt;if(p.t>0){p.t-=dt;if(p.t<=0)bpExpire(p)}}
  for(const q of F.shades)if(q.type===6&&q.rec>0)q.rec-=dt;
  // pickups: cheese for the rat, bowling balls for the vacuum
  const kind=id==='rat'?'cheese':id==='vac'?'ball':null;
  if(kind&&BS.started){BP.spawnT-=dt;if(BP.spawnT<=0&&BP.items.length<(kind==='cheese'?3:2)){BP.spawnT=kind==='cheese'?5:7;
    for(let k=0;k<20;k++){const x=2+Math.random()*(F.W-4),z=2+Math.random()*(F.H-4);if(Math.hypot(x-m.x,z-m.z)>3.5&&!F.pillars.some(q=>Math.hypot(q[0]-x,q[1]-z)<0.6)){BP.items.push({id:++BP.nid,kind,x:r2(x),z:r2(z),holder:''});BP.dirty=true;break}}}}
  // the gloop: a slime that lands under a lit lamp bakes into a brittle crust
  if(id==='gloop')for(const s of F.shades){if(s.type!==6||s.dead||s.x<0||s.stun>0||s.rec>0||(s.state!==3))continue;
    for(const p of BP.props)if(p.kind==='lamp'&&p.st===1&&Math.hypot(s.x-p.x,s.z-p.z)<1.7){bossBlow(s,0.2,4,1);break}}
  // the dill: brine on the floor soaks him soft (rolling through it, or walking)
  if(id==='dill'&&m.stun<=0&&!bWary(m)&&!(m.soakT>0)){for(const h of BS.hz)if(h.brine&&Math.hypot(m.x-h.x,m.z-h.z)<h.r+0.3){m.soakT=8;bossBlow(m,0.1,5,1.8);if(m.state===4)bSet(m,5,0.5);break}}
  if(m.soakT>0)m.soakT-=dt;
  // Mother Tallow: standing in a draft from an open window blows her flame out
  if(id==='tallow'&&!bWary(m))for(const p of BP.props)if(p.kind==='window'&&p.st===1&&!p.used&&inDraft(p,m.x,m.z)){p.used=1;bossBlow(m,0.12,5,1.8);break}
  // the clock: all three cranks wound at once stops it dead
  if(id==='cuckoo'){for(const p of BP.props)if(p.kind==='crank'){if(p.w>=0.99&&!p.held){p.held=1;p.t=25}if(p.w>0&&!(p.t>0)){p.held=0;p.w=Math.max(0,p.w-0.04*dt)}}   // a fully wound crank holds for 25 s, then slips
    const cr=BP.props.filter(p=>p.kind==='crank');if(cr.length&&cr.every(p=>p.w>=0.99)&&m.stun<=0&&!bWary(m)){for(const p of cr){p.w=0;p.t=0;p.held=0}bossBlow(m,0.13,7,2);BP.dirty=true}}
  // the heart: a geyser from a grate it hovers over quenches it black
  if(id==='heart'&&!bWary(m))for(const g of BP.props)if(g.kind==='grate'&&g.st===2&&!g.used&&Math.hypot(m.x-g.x,m.z-g.z)<1.5){g.used=1;bossBlow(m,0.12,6,2)}
  // the vacuum: a bowling ball held in his suction is ripped away and jams the hose
  if(id==='vac'&&m.state===3&&!bWary(m))for(const t of TG){const it=BP.items.find(q=>q.holder===bWho(t));if(!it)continue;
    const a=Math.atan2(t.z-m.z,t.x-m.x),d=Math.hypot(t.x-m.x,t.z-m.z);
    if(d<8&&Math.abs(angD(m.face,a))<0.6){BP.items.splice(BP.items.indexOf(it),1);m.clogs=(m.clogs|0)+1;BP.dirty=true;
      bossBlow(m,m.clogs%3===0?0.22:0.1,m.clogs%3===0?4:3,1);bSet(m,4,0.1);if(m.clogs%3===0){bzAdd({k:'dust',x:r3(m.x),z:r3(m.z),r:4,life:0.5});mpSend({k:'bfx2',w:'burst'});bpBurst()}else{mpSend({k:'bfx2',w:'clog'});bpClog()}}}
  BP.syncT-=dt;if(MP.on&&(BP.dirty||BP.syncT<=0)){BP.syncT=1;BP.dirty=false;
    mpSend({k:'bsx',d:R.depth,r:r2(m.rec>0?m.rec:0),p:BP.props.map(p=>[p.st,r2(p.t),r2(p.cd),r2(p.w)]),it:BP.items.map(q=>[q.id,q.kind,q.x,q.z,q.holder])})}
}
function bpExpire(p){
  if(p.kind==='lamp'){p.st=0;p.cd=10}
  else if(p.kind==='barrel')p.st=0;
  else if(p.kind==='window')p.st=0;
  else if(p.kind==='trap'&&p.st===2)p.st=0;
  else if(p.kind==='grate'){if(p.st===1){p.st=2;p.t=1.6;p.used=0;bpGeyser(p)}else p.st=0}
  BP.dirty=true;
}
function bpGeyser(p){const d=Math.hypot(p.x-P.x,p.z-P.z);if(d<16){noise(1.4,0.25*(1-d/16),900,0.5);tone(60,0.6,'sine',0.1*(1-d/16))}}
function bpClog(){if(Math.hypot(bMain().x-P.x,bMain().z-P.z)<16){tone(300,0.15,'square',0.12,0,-200);tone(160,0.6,'sawtooth',0.1,0.15,-90);say('CLONK! The ball jams his hose!',1.6)}}
function bpBurst(){noise(0.8,0.35,400,0.5);tone(50,0.8,'sine',0.3);say('His bag BURSTS!',2)}
// a window's draft: a strip of wind straight across the room from it
function inDraft(p,x,z){const dx=(x-p.x)*p.ex;return dx>0&&dx<7.5&&Math.abs(z-p.z)<1}
// the rat's nose: the nearest baited trap, if any
const ratBait=s=>{if(s.rec>0)return null;let b=null,bd=1e9;for(const p of BP.props)if(p.kind==='trap'&&p.st===1){const d=Math.hypot(p.x-s.x,p.z-s.z);if(d<bd){bd=d;b=p}}return b};
// ---- everyone: pick-ups by walking over them, the prompt, and the prop under your hand
function bpClient(dt){
  if(!F||!F.boss||!BP.props.length&&!BP.items.length){BP.near=null;BP.carry=null;return}
  const me=bMeId(),mine=BP.items.find(q=>q.holder===me);BP.carry=mine?mine.kind:null;
  if(!MP.guest)bpHost(dt,mpTargets().filter(t=>!t.inSafe));else{const b=bMain();if(b&&b.rec>0)b.rec-=dt}
  if(state!=='play'||P.down){BP.near=null;return}
  if(!BP.carry)for(const it of BP.items)if(!it.holder&&Math.hypot(it.x-P.x,it.z-P.z)<0.55){
    if(MP.guest)mpSend({k:'bpa',d:R.depth,it:it.id},MP.hostId);else bpTake(it.id,me);
    it.holder=me;say(it.kind==='cheese'?'You pick up a wedge of cheese. Something down here loves cheese.':'You heft a bowling ball. It is very heavy.',2.2);sfx('pick');break}
  let best=null,bd=1.25;for(const p of BP.props){if(p.kind==='grate')continue;const d=Math.hypot(p.x-P.x,p.z-P.z);if(d<bd){bd=d;best=p}}
  BP.near=best;
  // the wind from an open window snuffs your torch too
  for(const p of BP.props)if(p.kind==='window'&&p.st===1&&inDraft(p,P.x,P.z)){P.fuel=Math.max(0,P.fuel-9*dt);break}
}
function bpUse(){
  const p=BP.near;if(!p)return false;
  if(MP.guest)mpSend({k:'bpa',d:R.depth,i:p.i},MP.hostId);else bpAct(p.i,bMeId(),{x:P.x,z:P.z});
  return true;
}
const bpPrompt=()=>{const p=BP.near;if(!p)return BP.carry?'Carrying '+(BP.carry==='cheese'?'a wedge of cheese':'a bowling ball'):'';const b=bMain(),w=bWary(b)?'  ('+BOSSES[b.boss].name+' is wary for '+Math.ceil(b.rec)+' s)':'';const l=BPLABEL[p.kind](p);return l?(touch.on?'USE':pad.id?'X':'E')+': '+l+w:''};
// the guest's copy of the props and pickups
function bpApply(m){
  if(!Array.isArray(m.p)||!Array.isArray(m.it))return;
  {const b=bMain();if(b)b.rec=Math.max(0,+m.r||0)}
  m.p.forEach((q,i)=>{const p=BP.props[i];if(p&&Array.isArray(q)){const was=p.st;p.st=q[0]|0;p.t=+q[1]||0;p.cd=+q[2]||0;p.w=+q[3]||0;if(p.kind==='grate'&&was!==2&&p.st===2)bpGeyser(p);if(p.kind==='trap'&&was===1&&p.st===2)bpSound('snap',p)}});
  BP.items=m.it.filter(Array.isArray).slice(0,8).map(q=>({id:q[0]|0,kind:q[1]==='ball'?'ball':'cheese',x:+q[2]||0,z:+q[3]||0,holder:String(q[4]||'')}));
}
// ---- drawing the props and the pickups
function bpDraw(t){
  if(!F||!F.boss)return;const flat={p:[0,0,0],R:ID3,lo:ZERO3},wood=[0.45,0.3,0.15,6],iron=[0.32,0.32,0.34,4],brass=[1,0.75,0.3,4],m=bMain();
  for(const p of BP.props){const f={p:[p.x,0,p.z],R:ID3,lo:ZERO3};
    switch(p.kind){
      case 'trap':{slab(f,[0,0.03,0],[0.42,0.03,0.26],wood);for(const z of[-0.2,0.2])seg(f,[-0.3,0.07,z],[0.3,0.07,z],0.012,0.012,iron);
        const a=p.st===2?0:1.2,B=subF(f,[0,0.07,0],rZ(-a));seg(B,[0,0,-0.22],[0.36,0,-0.22],0.012,0.012,iron);seg(B,[0,0,0.22],[0.36,0,0.22],0.012,0.012,iron);seg(B,[0.36,0,-0.22],[0.36,0,0.22],0.014,0.014,iron);
        if(p.st===1){slab(f,[0.05,0.1,0],[0.07,0.04,0.09],[1.3,1.05,0.3,7],rYaw(0.4));spr(p.x,0.25,p.z,0.4,0.4,7,1,0.85,0.3,0.35+0.2*Math.sin(t*5),1)}
        if(p.st===0&&BP.carry==='cheese')spr(p.x,0.35,p.z,0.25,0.25,7,1,0.9,0.4,0.4+0.3*Math.sin(t*6),1);break}
      case 'lamp':{seg(f,[0,0,0],[0,1.1,0],0.03,0.025,iron);slab(f,[0,1.12,0],[0.18,0.05,0.18],iron);slab(f,[0.05,0.9,0],[0.03,0.06,0.05],p.st?[0.2,1.5,0.3,7]:[1.5,0.2,0.1,7]);
        if(p.st===1){ball(flat,[p.x,0.012,p.z],[1.7,0.004,1.7],[1.4,0.7,0.15,7],true);spr(p.x,1.05,p.z,0.9,0.9,7,1,0.6,0.15,0.8,1);for(let i=0;i<5;i++){const k=(t*0.8+i/5)%1;spr(p.x+Math.sin(i*2.3)*1.2,0.1+k*0.8,p.z+Math.cos(i*1.7)*1.2,0.15,0.15,7,1,0.5,0.2,0.4*(1-k),1)}}
        else slab(f,[0,1.08,0],[0.12,0.01,0.12],[0.3,0.2,0.15,8]);break}
      case 'barrel':{const d=p.ex;if(p.st){const B={p:[p.x,0.22,p.z],R:rYaw(Math.atan2(d[1],d[0]))};seg(B,[-0.3,0,0],[0.3,0,0],0.22,0.22,wood);for(const x of[-0.2,0.2])seg(B,[x-0.02,0,0],[x+0.02,0,0],0.23,0.23,iron)}
        else{seg(f,[0,0,0],[0,0.6,0],0.24,0.24,wood);for(const y of[0.12,0.48])seg(f,[0,y-0.02,0],[0,y+0.02,0],0.25,0.25,iron);slab(f,[0,0.61,0],[0.2,0.01,0.2],[0.4,0.55,0.15,8])}break}
      case 'window':{const W2={p:[p.x,1.3,p.z],R:rYaw(p.ex>0?0:Math.PI)};slab(W2,[0,0,0],[0.04,0.45,0.55],[0.35,0.22,0.12,6]);
        const o=p.st?1.3:0;for(const z of[-1,1]){const S={p:fpt(W2,[0.04,0,z*0.5]),R:m3(W2.R,rYaw(z*o))};slab(S,[0.02,0,-z*0.25],[0.02,0.42,0.24],[0.5,0.32,0.18,6])}
        if(p.st){slab(W2,[0.01,0,0],[0.02,0.4,0.48],[1.2,1.3,1.5,7]);for(let i=0;i<10;i++){const k=(t*1.3+i/10)%1;spr(p.x+p.ex*k*7.5,0.4+Math.sin(i*1.7+t)*0.4,p.z+Math.sin(i*3.1)*0.8,0.3,0.12,7,0.85,0.9,1,0.25*(1-k),0)}}
        else slab(W2,[0.03,0,0],[0.01,0.4,0.48],[0.05,0.05,0.08,8]);break}
      case 'gong':{const G={p:[p.x,0,p.z],R:rYaw(Math.PI/2)};for(const z of[-0.55,0.55])seg(G,[0,0,z],[0,1.1,z],0.035,0.03,wood);seg(G,[0,1.1,-0.6],[0,1.1,0.6],0.035,0.035,wood);
        const sw=p.cd>6?Math.sin(t*14)*0.12*(p.cd-6)/3:0;seg(G,[-0.02+sw,0.6,0],[0.02+sw,0.6,0],0.42,0.42,[1.1,0.8,0.3,4]);break}
      case 'horn':{const Hn={p:[p.x,1.0,p.z],R:rYaw(p.ex>0?0:Math.PI)};slab(Hn,[-0.08,0,0],[0.06,0.12,0.1],[0.8,0.1,0.1,4]);seg(Hn,[-0.02,0.05,0],[0.3,0.12,0],0.04,0.14,[0.9,0.85,0.8,4]);break}
      case 'crank':{const C={p:[p.x,0.85,p.z],R:rYaw(p.ex>0?0:p.ex<0?Math.PI:Math.PI/2)};slab(C,[-0.05,0,0],[0.08,0.22,0.22],iron);
        const a=p.w*12+t*0.2;seg(C,[0.03,0,0],[0.12,0,0],0.02,0.02,iron);const h=[0.12,Math.sin(a)*0.15,Math.cos(a)*0.15];seg(C,[0.12,0,0],h,0.015,0.015,iron);seg(C,h,[0.2,h[1],h[2]],0.02,0.02,wood);
        slab(C,[0.035,0.3,0],[0.01,0.03,0.2],[0.05,0.05,0.05,8]);slab(C,[0.04,0.3,-0.2+0.2*p.w],[0.01,0.025,0.2*p.w+0.001],p.w>=0.99?[0.3,2,0.4,7]:[2,1.4,0.2,7]);break}
      case 'grate':{slab(f,[0,0.008,0],[0.6,0.008,0.6],[0.1,0.1,0.11,4]);for(let i=-2;i<=2;i++)slab(f,[i*0.24,0.018,0],[0.02,0.006,0.58],iron);
        if(p.st===1)for(let i=0;i<6;i++)spr(p.x+Math.sin(i*2+t*9)*0.3,0.05,p.z+Math.cos(i*3+t*7)*0.3,0.15,0.1,7,0.6,0.8,1,0.6,1);
        if(p.st===2)for(let i=0;i<24;i++){const k=((t*2+i/24)%1);spr(p.x+Math.sin(i*2.4)*0.35*k,k*1.2,p.z+Math.cos(i*2.4)*0.35*k,0.25,0.35,7,0.7,0.85,1,0.7*(1-k*0.5),0)}
        const L=BP.props.find(q=>q.kind==='lever'&&q.ex===p.ex);if(L)seg(flat,[L.x,0.02,L.z],[p.x,0.02,p.z],0.03,0.03,[0.25,0.3,0.35,4]);break}
      case 'lever':{const Lv={p:[p.x,0.6,p.z],R:rYaw(p.x<F.W/2?0:Math.PI)};slab(Lv,[-0.04,0,0],[0.05,0.2,0.14],iron);const a=p.cd>0?-0.9:0.9;
        const hdl=[0.05+Math.sin(Math.abs(a))*0.25*0.4,Math.cos(a)*0.25,0];seg(Lv,[0.02,0,0],hdl,0.018,0.018,iron);ball(Lv,hdl,0.04,[1.6,0.2,0.1,7],true);break}
    }
  }
  for(const it of BP.items){
    let x=it.x,z=it.z,y=0.08;
    if(it.holder){if(it.holder===bMeId())continue;const pp=MP.peers.get(it.holder);if(!pp||pp.rx===undefined)continue;x=pp.rx+Math.cos(pp.ryaw)*0.3;z=pp.rz+Math.sin(pp.ryaw)*0.3;y=0.55}
    const f={p:[x,y+(it.holder?0:Math.sin(t*3+it.id)*0.02),z],R:rYaw(t*0.6+it.id),lo:ZERO3};
    if(it.kind==='cheese'){slab(f,[0,0.04,0],[0.12,0.04,0.08],[1.25,1.0,0.3,7],rYaw(0.4));for(let i=0;i<3;i++)ball(f,[-0.04+i*0.04,0.08,0.03-i*0.02],0.015,[0.6,0.45,0.1,8],true);spr(x,y+0.15,z,0.35,0.35,7,1,0.85,0.3,0.3,1)}
    else{ball(f,[0,0.11,0],0.11,[0.08,0.06,0.2,4]);for(const q of[[0.07,0.17,0.02],[0.08,0.15,-0.04],[0.09,0.12,0.03]])ball(f,q,0.015,[0.01,0.01,0.01,8],true)}
  }
  // what you carry, held up at the bottom of the view
  if(BP.carry&&!danceCam()){const cp=Math.cos(P.pitch),fx=Math.cos(P.yaw)*cp,fz=Math.sin(P.yaw)*cp,rx=-Math.sin(P.yaw),rz=Math.cos(P.yaw),e=EYE*wofEye()+P.y;
    const x=P.x+fx*0.35+rx*-0.12,z=P.z+fz*0.35+rz*-0.12,y=e-0.2+Math.sin(P.pitch)*0.35,f={p:[x,y,z],R:rYaw(P.yaw),lo:ZERO3};
    if(BP.carry==='cheese')slab(f,[0,0,0],[0.06,0.025,0.045],[1.25,1.0,0.3,7],rYaw(0.5));else ball(f,[0,0,0],0.07,[0.08,0.06,0.2,4])}
}
// ---- everyone, every frame: hazards, auras, the fight's music and its screens
function bossClientTick(dt){
  bpClient(dt);
  {const mm=bMain();if(mm&&mm.x>0&&BOSSES[mm.boss].id==='mimic'&&mm.state===6&&Math.hypot(mm.x-P.x,mm.z-P.z)<9){BS.wz=(BS.wz||0)-dt;if(BS.wz<=0){BS.wz=2.62;noise(0.6,0.035,500,2);tone(110,0.5,'sine',0.02,0,-20)}}}   // the real chest wheezes as it breathes
  if(!F||!F.boss){if(BS.el&&BS.el.style.display!=='none')BS.el.style.display='none';return}
  const me=bMe(),live=state==='play'&&!P.down&&!P.away;
  for(const s of F.shades)if(s.type===6){
    if(s.state!==s.lastSt){bossCue(s,s.lastSt,s.state);s.lastSt=s.state;s.sT=R.time}
    if(s.x>0&&!s.seenOn)s.seenOn=true;
  }
  if(BS.goo>0)BS.goo-=dt;if(BS.cool>0)BS.cool-=dt;if(BS.dust>0)BS.dust-=dt;if(BS.reveal>0)BS.reveal-=dt;
  const m=bMain(),D=bDef();
  if(!BS.said.intro)BS.said.intro=R.time+4;else if(BS.said.intro>0&&R.time>BS.said.intro){BS.said.intro=-1;if(!BS.started&&state==='play')say(D.intro,3.5)}
  // the Big Dill's cold: close to him you are slowed and the frost creeps in
  if(live&&m&&m.x>0&&D.id==='dill'&&Math.hypot(m.x-P.x,m.z-P.z)<2.3)BS.cool=0.3;
  for(let i=BS.hz.length-1;i>=0;i--){const h=BS.hz[i];h.t+=dt;if(bzStep(h,dt,live,me)===false||h.t>=(h.life||99))BS.hz.splice(i,1)}
  danceTick(dt);
  if(BS.frz){const f=BS.frz;f.t+=dt;
    if(live&&!f.hit&&f.t>0.35&&(Math.hypot(P.vx,P.vz)>0.4||P.y>0.08)){f.hit=true;say('You moved!',1.4);if(P.inv<=0)hurt(null)}
    if(f.t>=f.life){BS.frz=null;$('chill').style.boxShadow=''}}
  bossMusic(dt);bossHud();
}
// one hazard's step; false when it is spent
function bzStep(h,dt,live,me){
  const dx=P.x-h.x,dz=P.z-h.z,d=Math.hypot(dx,dz);
  const hitMe=fx=>{if(!live||P.inv>0)return;if(fx==='fuel'){bFuelMe(25);return}hurt(null);if(fx==='chill')P.chill=Math.max(P.chill,2.5);if(fx==='burn'){P.fuel=Math.max(0,P.fuel-8)}};
  switch(h.k){
    case 'shot':{h.x+=h.vx*dt;h.z+=h.vz*dt;
      if(solidAt(h.x,h.z)||F.pillars.some(q=>Math.hypot(q[0]-h.x,q[1]-h.z)<0.25)){if(h.pool)BS.hz.push({...h.pool,k:'pool',x:h.x-h.vx*0.05,z:h.z-h.vz*0.05,t:0});return false}
      if(live&&Math.hypot(P.x-h.x,P.z-h.z)<h.r+PR&&P.y<h.y+0.25&&P.y+1>h.y){hitMe(h.fx);if(h.pool)BS.hz.push({...h.pool,k:'pool',x:h.x,z:h.z,t:0});return false}
      if(h.pool&&h.t>=h.life-0.02)BS.hz.push({...h.pool,k:'pool',x:h.x,z:h.z,t:0});
      break}
    case 'ring':{h.r=(h.r||0)+h.v*dt;if(h.r>h.max)return false;
      if(live&&!h.done&&Math.abs(d-h.r)<h.w+PR*0.6&&P.y<h.hh){h.done=true;hitMe('')}
      break}
    case 'mark':if(h.t>=h.delay){
        if(live&&(h.sq?Math.abs(dx)<h.r+PR*0.5&&Math.abs(dz)<h.r+PR*0.5:d<h.r+PR*0.5)&&P.y<0.45)hitMe(h.pillar||h.sq?'burn':'');
        if(h.ring)BS.hz.push({k:'ring',x:h.x,z:h.z,v:4,max:h.ring,w:0.16,hh:0.22,c:h.c,t:0});
        if(h.pool)BS.hz.push({...h.pool,k:'pool',x:h.x,z:h.z,t:0});
        if(Math.hypot(h.x-P.x,h.z-P.z)<10){noise(0.3,0.16,h.pillar||h.sq?900:400,0.6);bShake(0.35,h.x,h.z)}
        for(let i=0;i<14;i++){const a=Math.random()*6.283,u=0.5+Math.random()*1.5;POT.fx.push({x:h.x,y:0.05,z:h.z,vx:Math.cos(a)*u,vy:1.5+Math.random()*(h.pillar?4:2),vz:Math.sin(a)*u,t:0,life:0.6,c:h.c,s:0.06})}
        return false}
      break;
    case 'pool':if(live&&d<h.r+PR*0.4&&P.y<0.1){if(h.fx==='goo')BS.goo=0.25;else if(h.fx==='burn'&&(h.bt=(h.bt||0)-dt)<=0){h.bt=1.2;hitMe('')}}break;
    case 'cone':{
      if(!live)break;const a=Math.atan2(dz,dx);if(d>h.len||d<0.05||Math.abs(angD(h.yaw,a))>h.cone||!los(h.x,h.z,P.x,P.z))break;
      if(h.fx==='snuff'){P.fuel=Math.max(0,P.fuel-26*dt);bPush(Math.cos(h.yaw)*1.3*dt,Math.sin(h.yaw)*1.3*dt);if(!BS.said.snuff||R.time-BS.said.snuff>3){BS.said.snuff=R.time;say('She blows on your torch!',1.6)}}
      else{const k=(h.fx==='tug'?2.4:2.1)*dt*(1-0.4*d/h.len);bPush(-dx/d*k,-dz/d*k);
        if(d<(h.ow||0.8)&&P.inv<=0){hurt(null);if(h.fx==='pull'){say('SHLOOP! He spits you back out.',1.8);POT.slv={vx:dx/d*7,vz:dz/d*7,t:0.45}}return false}}
      break}
    case 'line':{if(!live||h.got)break;const ux=Math.cos(h.yaw),uz=Math.sin(h.yaw),ex=Math.min(h.len,h.len*h.t/0.2),along=dx*ux+dz*uz,off=Math.abs(-dx*uz+dz*ux);
      if(along>0&&along<ex&&off<h.w+PR&&P.inv<=0){h.got=true;hurt(null);if(h.pull){const to=h.ow||0.9,k=Math.max(0,along-to);bPush(-ux*k,-uz*k);say('The tongue reels you in!',1.5)}}
      break}
    case 'wall':break;   // collision is in blocked(); see bossWallAt
    case 'pwall':{const k=Math.min(1,h.t/0.3);h.x0+=h.vx*dt*k;h.z0+=h.vz*dt*k;h.x1+=h.vx*dt*k;h.z1+=h.vz*dt*k;
      if(live&&segDist(P.x,P.z,h.x0,h.z0,h.x1,h.z1)<PR+0.06){const ox=P.x,oz=P.z;bPush(h.vx*dt*1.05,h.vz*dt*1.05);
        if(Math.hypot(P.x-ox,P.z-oz)<Math.hypot(h.vx,h.vz)*dt*0.5&&P.inv<=0){hurt(null);say('Pinned by a wall that is not there!',1.6)}}
      if(h.x0<0.5&&h.x1<0.5||h.x0>F.W-0.5&&h.x1>F.W-0.5||h.z0<0.5&&h.z1<0.5||h.z0>F.H-0.5&&h.z1>F.H-0.5)return false;
      break}
    case 'roll':{h.x+=h.vx*dt;h.z+=h.vz*dt;if(solidAt(h.x+Math.sign(h.vx)*h.r,h.z)||solidAt(h.x,h.z+Math.sign(h.vz)*h.r))return false;
      if(live&&Math.hypot(P.x-h.x,P.z-h.z)<h.r+PR&&P.y<0.3){hitMe('');return false}
      break}
    case 'ddr':if(!h.on){h.on=1;if(live)danceStart(h)}break;
    case 'freeze':if(!h.on){h.on=1;BS.frz={t:0,life:h.life,n:h.n,hit:false};$('chill').style.boxShadow='inset 0 0 160px rgba(255,40,30,.65)';
      for(let i=0;i<h.n;i++){tone(880,0.18,'square',0.12,0.35+i*0.55);tone(698,0.3,'square',0.12,0.55+i*0.55)}say('CUCKOO! Freeze!',1.5)}break;
    case 'dust':if(!h.on){h.on=1;if(live&&d<h.r){BS.dust=4;say('A cloud of dust! You can barely see.',1.6)}noise(0.6,0.2,500,0.5)}break;
  }
}
function segDist(px,pz,ax,az,bx,bz){const vx=bx-ax,vz=bz-az,l=vx*vx+vz*vz||1e-6,t=clamp(((px-ax)*vx+(pz-az)*vz)/l,0,1);return Math.hypot(px-ax-vx*t,pz-az-vz*t)}
function bPush(dx,dz){if(!blocked(P.x+dx,P.z))P.x+=dx;if(!blocked(P.x,P.z+dz))P.z+=dz;if(Math.floor(P.x)!==P.tx||Math.floor(P.z)!==P.ty)onTileChange()}
// the Mime's walls stop you as surely as stone (only you: they are drawn in the air for you, and the boss walks through them)
function bossWallAt(x,z){
  if(!F||!F.boss||!BS.hz.length)return false;
  for(const h of BS.hz)if(h.k==='wall'&&segDist(x,z,h.x0,h.z0,h.x1,h.z1)<0.06)return true;
  return false;
}
const bossMoveMul=()=>(BS.goo>0?0.55:1)*(BS.cool>0?0.75:1);
// sounds when a boss changes what it is doing (heard by everyone, because everyone sees the state change)
function bossCue(s,from,to){
  const d=Math.hypot(s.x-P.x,s.z-P.z);if(d>15||s.x<0)return;const k=1-d/15,id=BOSSES[s.boss].id;
  if(s.role==='add'){if(to===1&&id==='rat')tone(1800,0.15,'square',0.04*k,0,600);return}
  if(id==='mime')return;   // not a sound
  if(id==='rat'){if(to===2){for(let i=0;i<4;i++)noise(0.08,0.1*k,2500,3);tone(1500,0.4,'sawtooth',0.08*k,0,900)}if(to===3)noise(0.9,0.12*k,300,0.4);if(to===4){tone(60,0.5,'sine',0.3*k);noise(0.4,0.25*k,200,0.5);say('Ratbag slams into the wall! He is dazed.',1.6)}
    if(to===5)tone(220,0.15,'square',0.1*k,0,-120);if(to===6){tone(2200,1,'sawtooth',0.1*k,0,-800);say('Ratbag squeals for his subjects!',1.8)}}
  if(id==='gloop'){if(to===2)tone(180,0.25,'sine',0.12*k,0,220);if(to===3&&from===2)noise(0.25,0.18*k*s.size,250,0.8);if(to===4){tone(90,0.6,'sine',0.15*k,0,140);if(d<9)say('The Gloop gathers itself to leap!',1.4)}if(to===3&&from===5){tone(50,0.6,'sine',0.35*k);noise(0.5,0.3*k,180,0.5)}}
  if(id==='dill'){if(to===2)tone(400,0.2,'square',0.06*k,0,-200);if(to===3)tone(140,0.6,'sawtooth',0.08*k,0,-60);if(to===4)noise(1.5,0.1*k,400,0.6);if(to===6){say('The Big Dill is in a pickle now!',2);noise(0.8,0.14,1500,1)}}
  if(id==='tallow'){if(to===2){noise(0.9,0.08*k,600,1);tone(300,0.9,'sine',0.04*k,0,-150)}if(to===3)noise(1.4,0.2*k,900,0.4);if(to===5)say('Mother Tallow lights her little ones.',1.8)}
  if(id==='mimic'){if(to===2||to===4){tone(120,0.12,'square',0.12*k);tone(90,0.12,'square',0.12*k,0.13)}if(to===3)noise(0.25,0.15*k,1800,1.5);if(to===5){say('It shuts its lid... where did it go?',2);for(let i=0;i<6;i++)noise(0.12,0.1*k,700,1)}if(to===1&&from===6){tone(80,0.6,'sawtooth',0.18*k,0,-40);say('Found it!',1.2)}}
  if(id==='vac'){if(to===2)tone(120,0.8,'sawtooth',0.07*k,0,500);if(to===3){tone(620,3.2,'sawtooth',0.05*k,0,60);noise(3.2,0.09*k,2200,0.7)}if(to===4){noise(2.4,0.06*k,300,1);say('He is overheating! Hit him now!',1.8)}if(to===5)tone(90,0.4,'square',0.1*k,0,-50)}
  if(id==='cuckoo'){if(to===4){for(let i=0;i<4;i++)tone(1320,0.08,'triangle',0.08,i*0.3);say('The clock is about to strike...',1.4)}if(to===2)tone(200,0.4,'square',0.05*k,0,-80)}
  if(id==='heart'){if(to===2){tone(45,0.3,'sine',0.4*k);tone(40,0.35,'sine',0.35*k,0.18)}if(to===3)noise(0.4,0.12*k,1200,0.8);if(to===5)say('Embers break loose from the Heart!',1.6)}
  if(id==='boogie'&&to===1&&from===2)say(BS.said.round?'Again! Faster!':'Not bad. Again!',1.6),BS.said.round=1;
}
// a simple driving beat under the fight (the Boogie Man brings his own; the Mime has none at all)
function bossMusic(dt){
  if(state!=='play'||!ac)return;const id=bDef().id;
  if(id==='boogie'){if(!BS.won)disco();return}   // the Disco Pit always has its song playing, from the moment you walk in
  if(!BS.started||BS.won||id==='mime')return;
  const bpm=id==='heart'?(bMain()?.frozen?120:96):id==='cuckoo'?120:112;BS.mus-=dt;
  if(BS.mus<=0){BS.mus+=60/bpm;BS.beat=(BS.beat+1)%16;const b=BS.beat;
    if(id==='heart'){if(b%2===0){tone(48,0.22,'sine',0.22);tone(42,0.25,'sine',0.18,0.16)}}
    else if(id==='cuckoo'){tone(b%2?1760:1320,0.04,'triangle',0.05);if(b%4===0)tone(55,0.25,'sine',0.18)}
    else{if(b%4===0||b%8===6)tone(52,0.22,'sine',0.22,0,-25);if(b%2===1)noise(0.05,0.035,7000,2);if(b%8===4)noise(0.12,0.07,1500,1);if(b%16===0)tone(110,1.8,'sawtooth',0.035,0,0)}}
}
// ---- the Disco Pit's song: four on the floor, offbeat hats, an octave-jumping bass, chord stabs and a little hook, in A minor.
// Scheduled a moment ahead on the audio clock, in sixteenths; during a dance-off it locks to that round's tempo and its count-in.
const DISCO={next:0,step:0,bpm:116,chords:[[220,261.6,329.6],[146.8,174.6,220],[196,246.9,293.7],[130.8,164.8,196]],hook:[880,0,784,880,0,1046,988,0,880,0,784,659,0,784,0,0]};
function disco(){
  const now=ac.currentTime,D=BS.dance;
  if(D&&!D.locked){   // a round starts: line the sixteenths up with the chart (its count-in included)
    D.locked=true;const sx=D.ch.beat/4,pn=performance.now()/1000,n=Math.ceil((pn-D.t0)/sx);
    DISCO.sx=sx;DISCO.next=now+(D.t0+n*sx-pn);DISCO.step=((n%64)+64)%64;
  }
  if(!D)DISCO.sx=60/DISCO.bpm/4;
  if(DISCO.next<now-0.2||DISCO.next>now+1)DISCO.next=now+0.05;
  while(DISCO.next<now+0.12){discoStep(DISCO.step,Math.max(0,DISCO.next-now),DISCO.sx);DISCO.step=(DISCO.step+1)%64;DISCO.next+=DISCO.sx}
}
function discoStep(i,w,sx){
  const b=i%16,bar=i>>4,ch=DISCO.chords[bar];
  if(b%4===0)tone(58,0.2,'sine',0.3,w,-28);                                  // kick
  if(b===4||b===12)noise(0.12,0.1,1700,0.9,w);                              // clap
  if(b%4===2)noise(0.09,0.05,9000,1.5,w);                                   // open hat on the offbeat
  else if(b%2===1)noise(0.03,0.025,11000,2,w);                              // closed hat
  if(b%2===0)tone(ch[0]/(b%4===0?4:2),sx*1.7,'sawtooth',0.07,w);           // octave bass
  if(b===3||b===6||b===11)for(const f of ch)tone(f,sx*1.2,'square',0.018,w); // chord stabs
  if(b===0)for(const f of ch)tone(f*2,sx*15,'triangle',0.012,w);            // strings
  const h=DISCO.hook[b];if(bar%2===1&&h)tone(h,sx*1.6,'triangle',0.035,w);   // the hook, every other bar
}
// the health bar and the title cards
function bossHud(){
  if(!BS.el){BS.el=document.createElement('div');BS.el.style.cssText='position:fixed;top:14px;left:50%;transform:translateX(-50%);width:min(560px,80vw);z-index:6;pointer-events:none;font-family:Georgia,serif;text-align:center;color:#f3e3c8;text-shadow:0 2px 6px #000;display:none';
    BS.el.innerHTML='<div class="bn" style="font-size:20px;letter-spacing:2px"></div><div style="height:12px;margin-top:4px;background:rgba(0,0,0,.6);border:1px solid #c9a46a;border-radius:3px;overflow:hidden"><div class="bf" style="height:100%;width:100%;background:linear-gradient(#ff6b5a,#a3121e)"></div></div>';
    document.body.appendChild(BS.el);
    BS.card=document.createElement('div');BS.card.style.cssText='position:fixed;top:30%;left:0;right:0;text-align:center;z-index:7;pointer-events:none;font-family:Georgia,serif;color:#ffe1b0;text-shadow:0 3px 12px #000,0 0 30px #7a2a00;opacity:0;transition:opacity .6s';
    document.body.appendChild(BS.card);
    const du=document.createElement('div');du.id='bossDust';du.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;transition:opacity .3s;background:radial-gradient(circle at 50% 50%,rgba(150,135,110,.55),rgba(95,85,70,.95))';document.body.appendChild(du)}
  const show=state==='play'&&BS.started&&!BS.won;
  if(show){
    let hp=0,mx=0;for(const s of F.shades){if(s.type!==6||(s.role!=='main'&&s.role!=='part'))continue;mx+=s.hpMax;
      const alive=MP.guest?s.x>0:!s.dead;hp+=alive?(MP.guest?(s.hpPct?s.hpPct/100*s.hpMax:s.hpMax):Math.max(0,s.hp)):(s.born||s.seenOn||s.role==='main'?0:s.hpMax)}
    const nm=bDef().name+(F.boss.cyc?' ('+(F.boss.cyc+1)+')':'');
    const b=BS.el.querySelector('.bn');if(b.textContent!==nm)b.textContent=nm;
    BS.el.querySelector('.bf').style.width=(clamp(hp/(mx||1),0,1)*100).toFixed(1)+'%';
  }
  if((BS.el.style.display!=='none')!==show)BS.el.style.display=show?'block':'none';
  if(BS.cardT>0&&R.time>BS.cardT){BS.cardT=0;BS.card.style.opacity=0}
  const dl=$('bossDust');if(dl)dl.style.opacity=BS.dust>0?Math.min(1,BS.dust/1.5)*0.85:0;
}
function bossCard(a,b){bossHud();BS.card.innerHTML='<div style="font-size:46px;letter-spacing:4px">'+a+'</div><div style="font-size:19px;margin-top:6px;font-style:italic">'+b+'</div>';BS.card.style.opacity=1;BS.cardT=R.time+4}

// ---- the Boogie Man's dance-off: arrows rise up four lanes; press the matching arrow (or W A S D) as each one meets the top.
// You stand still while you dance. Every arrow you hit hurts him; miss too many and he zaps you.
const LANE_KEYS={ArrowLeft:0,KeyA:0,ArrowDown:1,KeyS:1,ArrowUp:2,KeyW:2,ArrowRight:3,KeyD:3};
const LANE_COL=['#ff5fd2','#5fd8ff','#7dff6a','#ffb24a'];
function danceStart(h){
  const ch=danceChart(h.seed,h.round),t0=performance.now()/1000+h.delay;
  const him=h.part==='him';
  BS.dance={ch,t0,notes:ch.notes.map(n=>({...n,j:null})),groove:BS.groove??100,fb:'',fbT:0,beatN:-8,round:h.round,cmb:0,him};
  say(him?'My turn! Hit the arrows to dodge his moves.':'DANCE OFF! Round '+h.round+': your turn. Every arrow you hit hurts him.',2.6);
  danceShow();
}
function danceKey(code){
  const L=LANE_KEYS[code];const D=BS.dance;if(L===undefined||!D)return false;
  const now=performance.now()/1000-D.t0;let best=null,bd=9;
  for(const n of D.notes){if(n.j||n.lane!==L)continue;const e=Math.abs(now-n.t);if(e<bd){bd=e;best=n}if(n.t>now+0.5)break}
  D.flash=D.flash||[0,0,0,0];D.flash[L]=0.12;
  const j=best?judge(now-best.t):null;
  if(!j)return true;   // a stray press costs nothing
  best.j=j;D.cmb++;D.groove=Math.min(100,D.groove+(j==='perfect'?5:2));D.fb=D.him?'DODGE':j==='perfect'?'PERFECT':'GOOD';D.fbT=0.5;BS.groove=D.groove;
  tone([523,587,659,784][L]*(j==='perfect'?2:1),0.08,'triangle',0.06);
  const m=bMain();if(m&&!D.him)wSend([{i:F.shades.indexOf(m),d:j==='perfect'?3:2,ddr:1}]);
  if(D.him){best.dodge=R.time;noise(0.08,0.06,5000,2)}
  BS.move={lane:L,t:R.time};mpSend({k:'bdm',d:R.depth,l:L});
  return true;
}
function danceTick(dt){
  const D=BS.dance;if(!D)return;
  if(P.down||!F||!F.boss||BS.won){BS.dance=null;danceHide();return}
  if(state!=='play')return;
  const now=performance.now()/1000-D.t0;
  // the beat
  for(const n of D.notes)if(!n.j&&now-n.t>0.15){n.j='miss';D.cmb=0;D.fbT=0.5;
    if(D.him){   // his move lands on you: four of those and it costs a heart
      D.groove-=25;D.fb='HIT!';n.hitT=R.time;tone(140,0.18,'sawtooth',0.1,0,-60);const h=$('hurt');h.style.transition='none';h.style.opacity=0.45;requestAnimationFrame(()=>{h.style.transition='opacity .5s';h.style.opacity=0});pkShake=Math.max(pkShake,0.25)}
    else{D.groove-=16;D.fb='MISS'}
    if(D.groove<=0){D.groove=60;if(P.inv<=0){hurt(null);say(D.him?'He got you! Keep dodging.':'Out of step! The Boogie Man zaps you.',1.6)}}
    BS.groove=D.groove}
  if(D.fbT>0)D.fbT-=dt;if(D.flash)for(let i=0;i<4;i++)D.flash[i]=Math.max(0,D.flash[i]-dt);
  if(now>D.ch.len+0.6){BS.dance=null;danceHide();return}
  danceDraw(now);
}
function danceShow(){
  if(!BS.dc){const c=document.createElement('canvas');c.width=360;c.height=640;c.style.cssText='position:fixed;top:50%;right:3vw;transform:translateY(-50%);height:min(78vh,620px);z-index:6;pointer-events:none;display:none';   // to the side, so the dance floor shows
    c.addEventListener('pointerdown',e=>{const r=c.getBoundingClientRect(),L=clamp(Math.floor((e.clientX-r.left)/r.width*4),0,3);danceKey(['ArrowLeft','ArrowDown','ArrowUp','ArrowRight'][L]);e.preventDefault()});
    document.body.appendChild(c);BS.dc=c}
  BS.dc.style.display='block';BS.dc.style.pointerEvents=touch.on?'auto':'none';
}
function danceHide(){if(BS.dc)BS.dc.style.display='none'}
function danceArrow(x,y,L,s,col,fill){
  x.save();x.beginPath();x.translate(s.x,y);x.rotate([-Math.PI/2,Math.PI,0,Math.PI/2][L]);   // drawn pointing up, turned to its lane: left, down, up, right
  x.moveTo(0,-s.r);x.lineTo(s.r*0.95,s.r*0.05);x.lineTo(s.r*0.38,s.r*0.05);x.lineTo(s.r*0.38,s.r*0.85);x.lineTo(-s.r*0.38,s.r*0.85);x.lineTo(-s.r*0.38,s.r*0.05);x.lineTo(-s.r*0.95,s.r*0.05);x.closePath();
  if(fill){x.fillStyle=col;x.fill()}x.lineWidth=4;x.strokeStyle=fill?'#fff':col;x.stroke();x.restore();
}
function danceDraw(now){
  const c=BS.dc,x=c.getContext('2d'),D=BS.dance,W=c.width,H=c.height,top=70,spd=420;
  x.clearRect(0,0,W,H);x.fillStyle='rgba(10,0,20,.45)';x.fillRect(0,0,W,H);
  const lx=L=>W*(L+0.5)/4;
  for(let L=0;L<4;L++){const f=D.flash&&D.flash[L]>0;danceArrow(x,top,L,{x:lx(L),r:32},f?'#fff':LANE_COL[L],false)}
  for(const n of D.notes){if(n.j&&n.j!=='miss')continue;const y=top+(n.t-now)*spd;if(y>H+40||y<-40)continue;danceArrow(x,y,n.lane,{x:lx(n.lane),r:30},n.j==='miss'?'#555':LANE_COL[n.lane],true)}
  x.fillStyle='rgba(0,0,0,.6)';x.fillRect(20,H-28,W-40,12);x.fillStyle=D.groove>40?'#7dff6a':'#ff5a4a';x.fillRect(20,H-28,(W-40)*clamp(D.groove/100,0,1),12);
  x.font='bold 20px Georgia';x.textAlign='center';x.fillStyle='#ffe1b0';x.fillText('GROOVE',W/2,H-36);
  if(now<0){x.font='bold 64px Georgia';x.fillText(String(Math.ceil(-now)),W/2,H/2)}
  x.font='bold 18px Georgia';x.fillStyle=D.him?'#ff8ad8':'#9cf';x.fillText(D.him?'HIS TURN: DODGE':'YOUR TURN: ATTACK',W/2,top+48);
  if(D.fbT>0){x.font='bold 34px Georgia';x.fillStyle=D.fb==='MISS'||D.fb==='HIT!'?'#ff6a5a':D.fb==='PERFECT'?'#fff27a':'#9cf';x.fillText(D.fb,W/2,top+90)}
  if(D.cmb>4){x.font='bold 22px Georgia';x.fillStyle='#fff';x.fillText(D.cmb+' combo',W/2,top+124)}
}

// ---- the dance-off camera: during a round everyone's view pulls back to take in the whole dance floor (every player and the
// Boogie Man), and you see yourself dance with the others
function danceFight(){return !!(F&&F.boss&&BOSSES[F.boss.i].id==='boogie'&&BS.started&&!BS.won&&!P.down&&state==='play')}
// shots, each held for two bars of the music: [angle from behind the dancers, distance, height, drift]
const DANCE_SHOTS=[[0,1,1.08,0.18],[0.95,0.82,0.92,-0.3],[-0.95,0.82,0.92,0.3],[Math.PI,0.9,1.1,0.12],[0.45,0.62,0.62,0.35],[-0.5,1.05,1.15,-0.2],[Math.PI-0.7,0.7,0.75,-0.25],[1.6,0.95,1.0,0.22]];
function danceCam(){
  if(!danceFight())return null;
  const m=bMain();if(!m||m.x<0)return null;
  const pts=[[P.x,P.z]];if(MP.on)for(const p of MP.peers.values())if(mpDrawn(p)&&p.rx!==undefined)pts.push([p.rx,p.rz]);
  let ax=0,az=0;for(const q of pts){ax+=q[0];az+=q[1]}ax/=pts.length;az/=pts.length;
  let dx=ax-m.x,dz=az-m.z,l=Math.hypot(dx,dz);if(l<0.3){dx=0;dz=1;l=1}dx/=l;dz/=l;
  const mx=(ax+m.x)/2,mz=(az+m.z)/2;let sp=1;for(const q of[...pts,[m.x,m.z]])sp=Math.max(sp,Math.hypot(q[0]-mx,q[1]-mz));
  // which shot: cut on the bar line of whatever is playing (the round's chart, or the song between rounds)
  const D=BS.dance,beat=D?D.ch.beat:60/DISCO.bpm,tt=D?performance.now()/1000-D.t0:R.time,n=Math.floor(tt/(beat*8)),ix=((n%DANCE_SHOTS.length)+DANCE_SHOTS.length)%DANCE_SHOTS.length;
  const sh=D&&D.him&&n%3===1?[Math.PI,0.75,0.85,0.2]:DANCE_SHOTS[ix],ph=(tt/(beat*8))-n;   // his turn often cuts to behind him, looking at you
  const base=Math.atan2(dz,dx)+sh[0]+sh[3]*(ph-0.5)*1.2,want=(sp/Math.tan(0.55)+0.55)*sh[1];
  const x=clamp(mx+Math.cos(base)*want,1.35,F.W-1.35),z=clamp(mz+Math.sin(base)*want,1.35,F.H-1.35),y=Math.min(1.15,sh[2]),d=Math.hypot(mx-x,mz-z)||1;
  const C=BS.dcam||(BS.dcam={x:P.x,z:P.z,y:EYE,yaw:P.yaw,pitch:0,ix});
  const cut=C.ix!==ix&&D;C.ix=ix;const k=cut?0.35:0.06;   // a quick swing on the cut, then a slow drift
  C.x+=(x-C.x)*k;C.z+=(z-C.z)*k;C.y+=(y-C.y)*k;
  const yaw=Math.atan2(mz-C.z,mx-C.x),pitch=-Math.atan2(C.y-0.6,d);
  C.yaw+=angD(C.yaw,yaw)*Math.min(1,k*2);C.pitch+=(pitch-C.pitch)*Math.min(1,k*2);
  return {x:C.x,y:C.y,z:C.z,yaw:C.yaw,pitch:C.pitch};
}
function danceSelf(t){
  const id=MP.on?MP.id:'me',m=bMain();
  if(m)P.yaw=turnTo(P.yaw,Math.atan2(m.z-P.z,m.x-P.x),0.2);   // you face your partner
  BS.self=BS.self||{};Object.assign(BS.self,{id,col:localPlayerColor(),look:playerLook,rx:P.x,rz:P.z,ry:P.y,ryaw:P.yaw,rpitch:0,spd:0,walk:0,
    dz:BS.move||{lane:-1,t:R.time-1},fat:FX.fat>0,pox:FX.pox>0,baby:FX.baby>0});
  const q=buildPlayer(BS.self,t).torch;
  if(P.fuel>0){spr(q[0],q[1]+0.02,q[2],0.07,0.12,11,1.0,0.6,0.2,1,1);spr(q[0],q[1],q[2],0.5,0.5,7,1.0,0.5,0.15,0.25,1)}
}
// ---- bare fists: on a boss floor with no weapon in hand you still have your fists
function wPunch(){
  if(!canUse()||potHeld()||W.cd>0)return;W.cd=0.5;W.swing=1;W.swingT=0.25;
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);let best=null,bd=9;
  for(const s of F.shades){if(s.x<0||s.dead||s.type===3)continue;const dx=s.x-P.x,dz=s.z-P.z,d=Math.hypot(dx,dz);if(d>1.05+(s.rad||0)||d<0.01)continue;if((dx*fx+dz*fz)/d<0.5&&d>0.45+(s.rad||0))continue;if(d<bd){bd=d;best=s}}
  noise(0.1,0.1,900,0.8);
  if(best){wSend([wHit({dmg:1,stun:0.15,kb:0.1},best)]);tone(150,0.1,'square',0.1,0,-40);wSpark(best.x,0.55,best.z,'#e8d0b0')}
  if(!BS.said.fist){BS.said.fist=1;say('No weapon? Your fists will have to do. The Blacksmith can help next time.',3)}
}

// ---- drawing
function bossDraw(s,t,ex,ez){
  const D=BOSSES[s.boss],ag=R.time-(s.sT||0),hpF=MP.guest?(s.hpPct?s.hpPct/100:1):clamp(s.hp/(s.hpMax||1),0,1);
  if(s.role==='add'){addDraw(s,t,ag);return}
  BDRAW[s.boss](s,t,ag,hpF);
}
const fr=(s,y,R2,k)=>({p:[s.x,y,s.z],R:(R2?m3(rYaw(s.face||0),R2):rYaw(s.face||0)).map(q=>q*(k||1)),lo:[s.ph,0,0]});
function addDraw(s,t,ag){
  if(s.kind==='rat'){ratModel(s,t,0.3,false,ag);return}
  if(s.kind==='candle'){const B=fr(s,Math.abs(Math.sin(t*9+s.ph))*0.03),wax=[0.92,0.86,0.66,8];seg(B,[0,0.04,0],[0,0.3,0],0.07,0.065,wax);ball(B,[0.07,0.24,0],[0.005,0.012,0.04],[0.05,0.03,0.02,8],true);
    for(const z of[-1,1])seg(B,[0,0.06,z*0.04],[Math.sin(t*12+z)*0.05,0,z*0.05],0.02,0.018,wax);seg(B,[0,0.3,0],[0,0.34,0],0.006,0.006,[0.05,0.04,0.03,8]);
    spr(s.x,0.38,s.z,0.06,0.1,11,1,0.6,0.2,1,1);spr(s.x,0.38,s.z,0.4,0.4,7,1,0.55,0.15,0.35,1);return}
  if(s.kind==='ember'){const y=0.5+Math.sin(t*4+s.ph)*0.08;ball({p:[s.x,y,s.z],R:ID3},[0,0,0],0.09,[3,0.9,0.15,7],true);spr(s.x,y+0.05,s.z,0.22,0.3,11,1,0.5,0.1,1,1);spr(s.x,y,s.z,0.7,0.7,7,1,0.4,0.1,0.4,1);return}
}
// King Ratbag, and his subjects (the same rat at a third of the size, without the crown)
function ratModel(s,t,k,king,ag){
  const st=king?s.state|0:1,walk=(s.wk=(s.wk||0)+(st===3?0.45:st===1?0.2:0.05)),fur=king?[0.32,0.27,0.24,2]:[0.3,0.26,0.24,2],pink=[0.85,0.55,0.55,1],dark=[0.05,0.04,0.04,8];
  let rz=0,lift=0;if(st===2){rz=0.28+Math.sin(t*30)*0.03;lift=0.08}if(st===3)rz=-0.08;if(st===4)rz=Math.sin(t*3)*0.1;
  const B=fr(s,lift*k,m3(rZ(rz),st===4?rX(0.25):[1,0,0,0,1,0,0,0,1]),k);
  ball(B,[0,0.48,0],[0.62,0.36,0.4],fur);ball(B,[-0.34,0.44,0],[0.42,0.38,0.42],fur);ball(B,[0.1,0.32,0],[0.5,0.2,0.3],[0.42,0.37,0.33,2]);
  const bite=st===5?Math.sin(Math.min(1,ag/0.42)*Math.PI)*0.15:0;
  const H=subF(B,[0.55+bite,0.55,0],rZ(st===3?-0.15:0.05));
  ball(H,[0.12,0,0],[0.3,0.22,0.23],fur);ball(H,[0.38,-0.05,0],[0.15,0.11,0.12],fur);ball(H,[0.53,-0.04,0],0.04,pink,true);
  for(const z of[-1,1]){ball(H,[0.25,0.07,z*0.12],0.04,[2.8,0.25,0.15,7],true);ball(H,[0.02,0.22,z*0.15],[0.05,0.11,0.1],fur,true);ball(H,[0.03,0.21,z*0.15],[0.03,0.08,0.07],pink,true);
    slab(H,[0.47,-0.13,z*0.022],[0.01,0.045,0.016],[0.95,0.9,0.7,8]);
    for(let w=0;w<3;w++)seg(H,[0.45,-0.04,z*0.07],[0.5,-0.04+(w-1)*0.05,z*0.3],0.004,0.002,[0.8,0.78,0.72,8])}
  if(st===5)slab(H,[0.42,-0.15,0],[0.08,0.01,0.08],dark);
  if(king){   // a little gold crown, slightly askew
    const C=subF(H,[0.05,0.24,0],rX(0.15)),gold=[1.3,0.95,0.3,4];seg(C,[0,0,0],[0,0.07,0],0.13,0.13,gold);
    for(let i=0;i<6;i++){const a=i/6*6.283;seg(C,[Math.cos(a)*0.12,0.07,Math.sin(a)*0.12],[Math.cos(a)*0.1,0.15,Math.sin(a)*0.1],0.025,0.002,gold)}
    ball(C,[0.13,0.04,0],0.025,[2.5,0.2,0.3,7],true)}
  for(const [x,z,p] of[[0.35,-0.22,0],[0.35,0.22,Math.PI],[-0.35,-0.25,Math.PI],[-0.35,0.25,0]]){
    const sw=st===2&&x>0?Math.sin(t*30+p)*0.12:Math.sin(walk*2+p)*0.12;
    seg(B,[x,0.32,z],[x+sw,0.04,z*1.05],0.08,0.05,fur);ball(B,[x+sw+0.04,0.03,z*1.05],[0.08,0.03,0.05],pink,true)}
  let p=[-0.72,0.4,0];const a0=Math.sin(t*3+s.ph)*0.4;
  for(let i=0;i<9;i++){const q=[p[0]-0.14,p[1]-0.03+(i>4?0.02:0),p[2]+Math.sin(a0+i*0.6)*0.06];seg(B,p,q,0.05*(1-i/10)+0.008,0.05*(1-(i+1)/10)+0.008,pink);p=q}
  if(king&&st===4)for(let i=0;i<4;i++){const a=t*5+i*1.57,q=fpt(H,[0.1,0.35,0]);spr(q[0]+Math.cos(a)*0.25,q[1],q[2]+Math.sin(a)*0.25,0.07,0.07,7,1,0.95,0.4,1,1)}
}
const BDRAW=[
  (s,t,ag)=>ratModel(s,t,1,true,ag),
  // the Boogie Man: a long-limbed shadow in a white disco suit, sunglasses, an enormous afro, under a disco ball on a floor of lights
  (s,t,ag)=>{
    const cx=F.W/2,cz=F.H/2-1,bt=BS.dance?(performance.now()/1000-BS.dance.t0)/BS.dance.ch.beat:t*1.8;
    for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){const v=(Math.floor(bt)+x*3+z*5)%4,c=hex3(LANE_COL[(v+4)%4]),k=0.25+0.35*((x+z+Math.floor(bt))%2===0?1:0);slab({p:[cx+x,0.006,cz+z],R:ID3},[0,0,0],[0.46,0.004,0.46],[c[0]*k,c[1]*k,c[2]*k,7])}
    {const db={p:[cx,1.05,cz],R:rYaw(t*0.8)};ball(db,[0,0,0],0.13,[0.9,0.9,1,4]);seg(db,[0,0.12,0],[0,0.2,0],0.005,0.005,[0.3,0.3,0.3,4]);
      for(let i=0;i<8;i++){const a=t*0.8+i*0.785,e=0.4+0.3*Math.sin(t*3+i);spr(cx+Math.cos(a)*0.14,1.05+Math.sin(i*2.1)*0.08,cz+Math.sin(a)*0.14,0.05,0.05,7,e*2,e*2,e*2.2,1,1)}}
    const his=s.state===4,dance=s.state===2||his,sw=Math.sin(bt*Math.PI)*(his?0.2:dance?0.1:0.05),pt=Math.floor(bt*(his?2:1))%2,suit=[0.95,0.93,0.88,2],sk=[0.1,0.04,0.16,8],gl=[0.03,0.02,0.04,4];
    const B=fr(s,0,rZ(0),1.05),U=subF(B,[0,0.5,0],m3(rX(sw),rZ(-0.05)));
    for(const z of[-1,1]){const k=z>0?sw:-sw;seg(B,[0,0.5,z*0.06],[0.02,0.25,z*(0.08+Math.max(0,k))],0.05,0.045,suit);seg(B,[0.02,0.25,z*(0.08+Math.max(0,k))],[0,0.06,z*0.1],0.045,0.1,suit);slab(B,[0.03,0.03,z*0.1],[0.07,0.03,0.045],[0.95,0.75,0.2,4])}
    seg(U,[0,0,0],[0,0.3,0],0.09,0.12,suit);slab(U,[0.1,0.22,0],[0.01,0.1,0.06],sk);
    for(const z of[-1,1])slab(U,[0.11,0.27,z*0.06],[0.01,0.04,0.05],suit,rX(z*0.5));
    for(const z of[-1,1]){const up=dance?(pt===(z>0?1:0)):z>0,sh=[0,0.28,z*0.13];
      if(s.state===3&&z>0)limb(U,sh,[0.2,0.3,z*0.16],[0.42,0.34,z*0.12],0.04,0.035,0.03,suit,suit,sk,0.035);   // "my turn": he points at you
      else if(his&&up)limb(U,sh,[0.18,0.36,z*0.18],[0.36,0.42,z*0.12],0.04,0.035,0.03,suit,suit,sk,0.035);   // throwing a move at you
      else if(up)limb(U,sh,[0.05,0.45,z*0.2],[0.08,0.66,z*0.24],0.04,0.035,0.03,suit,suit,sk,0.035);
      else limb(U,sh,[0.1,0.16,z*0.22],[0.12,0.0,z*0.32],0.04,0.035,0.03,suit,suit,sk,0.035)}
    seg(U,[0,0.3,0],[0,0.36,0],0.04,0.04,sk);
    const Hd=subF(U,[0,0.44,0],rZ(Math.sin(bt*Math.PI*2)*0.08));
    ball(Hd,[0,0,0],[0.085,0.1,0.085],sk);ball(Hd,[-0.02,0.08,0],[0.2,0.17,0.2],[0.06,0.03,0.07,5]);
    slab(Hd,[0.085,0.015,0],[0.012,0.022,0.075],gl);for(const z of[-1,1])ball(Hd,[0.098,0.015,z*0.035],0.014,[2.6,0.5,2.2,7],true);
    slab(Hd,[0.08,-0.05,0],[0.01,0.008,0.035],[2,2,2,7]);   // a grin
    spr(s.x,1.0,s.z,1.6,1.6,7,0.6,0.1,0.5,0.15,1);
    const D=BS.dance;
    if(D&&D.him&&!P.down){   // every arrow of his turn is a glittering shot flying at you, arriving with its arrow
      const now=performance.now()/1000-D.t0,fx=s.x+Math.cos(s.face||0)*0.3,fz=s.z+Math.sin(s.face||0)*0.3,FL=1.3;
      for(const n of D.notes){
        const c=hex3(LANE_COL[n.lane]),left=n.t-now;
        if(!n.j&&left>0&&left<FL){const k=1-left/FL,side=(n.lane-1.5)*0.35*Math.sin(k*Math.PI);
          const x=fx+(P.x-fx)*k+side*Math.sin(s.face||0),z=fz+(P.z-fz)*k-side*Math.cos(s.face||0),y=0.85+Math.sin(k*Math.PI)*0.25-0.2*k;
          ball({p:[x,y,z],R:ID3},[0,0,0],0.05,[c[0]*2.5,c[1]*2.5,c[2]*2.5,7],true);spr(x,y,z,0.32,0.32,7,c[0],c[1],c[2],0.8,1);
          for(let q=1;q<4;q++){const k2=Math.max(0,k-q*0.04);spr(fx+(P.x-fx)*k2,0.85+Math.sin(k2*Math.PI)*0.25-0.2*k2,fz+(P.z-fz)*k2,0.12,0.12,7,c[0],c[1],c[2],0.5-q*0.12,1)}}
        else if(n.dodge&&R.time-n.dodge<0.4){const a=(R.time-n.dodge)/0.4;for(let q=0;q<6;q++){const an=q*1.05+n.lane;spr(P.x+Math.cos(an)*a*0.8,0.8+Math.sin(q*2)*a*0.4,P.z+Math.sin(an)*a*0.8,0.08,0.08,7,c[0],c[1],c[2],1-a,1)}}
        else if(n.hitT&&R.time-n.hitT<0.3){const a=(R.time-n.hitT)/0.3;spr(P.x,0.8,P.z,0.3+a,0.3+a,7,1,0.3,0.6,0.8*(1-a),1)}
      }
    }
  },
  // the Gloop: a shining green blob with two bobbing eyes (squashes when it lands, stretches when it jumps)
  (s,t,ag)=>{
    const z=s.size,st=s.state|0;let y=0,sq=1;
    if(st===2){const p=clamp(ag/0.6,0,1);y=Math.sin(p*Math.PI)*0.45*Math.sqrt(z);sq=1.15}
    else if(st===5){const p=clamp(ag/0.9,0,1);y=Math.sin(p*Math.PI)*0.75;sq=1.2}
    else if(st===1||st===4){sq=0.8+0.2*Math.cos(t*14)}
    else if(st===3){const p=clamp(ag/0.3,0,1);sq=0.65+0.35*p}
    const crust=s.stun>0,r=0.62*z,B={p:[s.x,y,s.z],R:rYaw(s.face||0),lo:[s.ph,0,0]},g=crust?[0.42,0.32,0.18,6]:[0.18,0.62,0.12,8];   // baked under a lamp: a cracked brown crust
    ball(B,[0,r*0.75*sq,0],[r/Math.sqrt(sq),r*0.75*sq,r/Math.sqrt(sq)],g);
    if(crust)for(let i=0;i<8;i++){const a=i*0.8;slab(B,[Math.cos(a)*r*0.8,r*(0.5+0.3*Math.sin(i*1.7)),Math.sin(a)*r*0.8],[0.01,r*0.25,0.006],[0.12,0.08,0.04,8],rYaw(a))}
    else ball(B,[0,r*0.75*sq,0],[r*0.55,r*0.5*sq,r*0.55],[0.3,1.1,0.2,7]);
    for(const q of[-1,1]){const e=fpt(B,[r*0.6,r*1.05*sq,q*r*0.3]);ball({p:e,R:B.R},[0,0,0],0.11*z+0.02,[0.95,0.95,0.9,8],true);ball({p:e,R:B.R},[0.07*z+0.01,0,0],0.05*z+0.01,[0.02,0.02,0.02,8],true)}
    for(let i=0;i<3;i++){const k=(t*0.5+i/3+s.ph)%1,q=fpt(B,[Math.cos(i*2)*r*0.4,r*(0.2+k*1.1)*sq,Math.sin(i*2)*r*0.4]);spr(q[0],q[1],q[2],0.05*z+0.02,0.05*z+0.02,7,0.6,1,0.5,0.7*(1-k),1)}
    if(s.role==='main'&&st===4)spr(s.x,0.5,s.z,1.8,1.8,7,0.3,1,0.2,0.3,1);
  },
  // the Big Dill: a tall cucumber in sunglasses, with stubby vine arms; lying down to roll; darker and lumpier once pickled
  (s,t,ag)=>{
    const pk=!!s.frozen||s.stun>0,st=s.state|0,g=s.stun>0?[0.3,0.32,0.08,8]:pk?[0.2,0.28,0.06,8]:[0.12,0.38,0.1,8],gl=pk?[0.32,0.42,0.12,8]:[0.35,0.65,0.25,8],dk=[0.03,0.03,0.04,4];
    let B;
    if(st===4||st===5&&ag<0.5||st===3&&ag>0.4){const roll=st===4?(s.wk=(s.wk||0)+0.3):0;B={p:[s.x,0.24,s.z],R:m3(m3(rYaw(s.face||0),rX(Math.PI/2)),rYaw(roll)),lo:[s.ph,0,0]};
      B.p=[s.x-Math.sin(s.face||0)*0.5,0.24,s.z+Math.cos(s.face||0)*0.5]}
    else{const w=s.stun>0?-0.35+Math.sin(t*2)*0.05:st===1?Math.sin(t*6)*0.06:st===2?-0.15:st===6?Math.sin(t*20)*0.1:0;B=fr(s,0,rZ(w))}   // soggy: limp, leaning over
    seg(B,[0,0.08,0],[0,0.95,0],0.2,0.19,g);ball(B,[0,0.95,0],[0.19,0.12,0.19],g);ball(B,[0,0.08,0],[0.2,0.08,0.2],g);
    for(let i=0;i<6;i++){const a=i/6*6.283;seg(B,[Math.cos(a)*0.19,0.12,Math.sin(a)*0.19],[Math.cos(a)*0.18,0.92,Math.sin(a)*0.18],0.022,0.02,gl)}
    for(let i=0;i<(pk?26:14);i++){const a=i*2.4,h=0.15+((i*0.37)%1)*0.75;ball(B,[Math.cos(a)*0.2,h,Math.sin(a)*0.2],pk?0.035:0.022,gl,true)}
    slab(B,[0.19,0.78,0],[0.02,0.04,0.13],dk);for(const z of[-1,1])ball(B,[0.2,0.78,z*0.065],[0.012,0.035,0.05],[0.3,0.6,0.9,4],true);   // sunglasses
    slab(B,[0.195,0.62,0],[0.01,st===2?0.035:0.01,0.06],dk);
    if(st!==4)for(const z of[-1,1]){const up=st===2?0.1:Math.sin(t*4+z)*0.03;seg(B,[0,0.55,z*0.19],[0.12,0.35+up,z*0.32],0.025,0.02,gl);ball(B,[0.12,0.35+up,z*0.32],0.035,gl,true);
      seg(B,[0,0.1,z*0.1],[Math.sin(t*6+(z>0?0:3))*0.06*(st===1?1:0),0,z*0.12],0.03,0.025,gl)}
    for(let i=0;i<5;i++){const a=t*0.7+i*1.26,r=1.2+Math.sin(t+i)*0.4;spr(s.x+Math.cos(a)*r,0.15+((t*0.3+i*0.2)%1)*0.7,s.z+Math.sin(a)*r,0.06,0.06,7,0.6,0.85,1.2,0.6,1)}
  },
  // Mother Tallow: a great melting candle with a sorrowful face; she is shorter the more she is hurt, and her flame flares to blow
  (s,t,ag,hpF)=>{
    const h=0.45+0.5*hpF,st=s.state|0,wax=[0.93,0.86,0.66,8],ws=[0.85,0.76,0.55,8],dk=[0.12,0.06,0.04,8];
    const B=fr(s,0,rZ(st===2?-0.12:st===3?0.12:Math.sin(t*1.5)*0.03));
    ball(B,[0,0.02,0],[0.5,0.04,0.5],ws);seg(B,[0,0.02,0],[0,h,0],0.3,0.27,wax);ball(B,[0,h,0],[0.27,0.05,0.27],wax);
    for(let i=0;i<9;i++){const a=i*0.7+0.3,l=0.12+((i*0.41)%1)*0.3;seg(B,[Math.cos(a)*0.28,h-0.02,Math.sin(a)*0.28],[Math.cos(a)*0.3,h-l,Math.sin(a)*0.3],0.035,0.03,wax);ball(B,[Math.cos(a)*0.3,h-l,Math.sin(a)*0.3],0.04,wax,true)}
    const fy=h-0.15;for(const z of[-1,1]){ball(B,[0.27,fy,z*0.09],[0.02,0.04,0.035],dk,true);seg(B,[0.27,fy-0.04,z*0.09],[0.29,fy-0.12,z*0.1],0.008,0.004,[0.7,0.6,0.4,8])}
    ball(B,[0.275,fy-0.12,0],[0.015,st===2?0.04:0.02,st===2?0.03:0.04],dk,true);
    for(const z of[-1,1]){const up=st===4?0.25:0.05;seg(B,[0,h-0.25,z*0.27],[0.2,h-0.3+up,z*0.4],0.05,0.04,wax);ball(B,[0.2,h-0.3+up,z*0.4],0.05,wax,true)}
    seg(B,[0,h+0.04,0],[0,h+0.1,0],0.01,0.01,dk);
    const top=fpt(B,[0,h+0.16,0]),fl=st===3?0.4:st===2?0.6:1+Math.sin(t*11)*0.1;
    if(s.stun>0)for(let i=0;i<5;i++){const k=(t*0.7+i/5)%1;spr(top[0]+Math.sin(i*2+t)*0.05,top[1]+k*0.5,top[2],0.08+k*0.15,0.08+k*0.15,7,0.6,0.6,0.62,0.35*(1-k),0)}   // blown out: a curl of smoke
    else{spr(top[0],top[1]+0.03*fl,top[2],0.09*fl,0.18*fl,11,1,0.62,0.22,1,1);spr(top[0],top[1],top[2],0.6,0.6,7,1,0.55,0.15,0.25*fl,1)}
    if(st===3)for(let i=0;i<10;i++){const k=((t*2.5+i/10)%1),a=(s.face||0)+(Math.sin(i*5.3)*0.5);spr(s.x+Math.cos(a)*k*5.5,0.6+Math.sin(i*3)*0.2,s.z+Math.sin(a)*k*5.5,0.15+k*0.3,0.15+k*0.3,7,0.8,0.8,0.85,0.25*(1-k),0)}
  },
  // the Grand Mimic: a treasure chest with a mouth full of teeth and a very long tongue; shut, it looks like any other chest
  (s,t,ag)=>mimicModel(s,t,ag),
  // Sir Suckalot: an upright vacuum cleaner with headlamp eyes, a swelling bag and a trunk of a hose
  (s,t,ag)=>{
    const st=s.state|0,red=[0.55,0.06,0.05,4],gr=[0.35,0.35,0.37,4],bag=[0.75,0.68,0.55,2],dk=[0.03,0.03,0.03,8],hot=st===4;
    const B=fr(s,Math.abs(Math.sin(t*(st===3?30:3)))*0.01,rZ(st===3?-0.1:0),1.2);
    slab(B,[0.12,0.08,0],[0.2,0.07,0.24],hot?[1.6,0.2,0.05,7]:red);slab(B,[0.33,0.05,0],[0.02,0.03,0.22],dk);
    for(const z of[-1,1]){ball(B,[0.3,0.11,z*0.14],0.035,[2.4,2.2,1.6,7],true);ball(B,[-0.04,0.05,z*0.22],[0.05,0.05,0.025],dk,true)}
    seg(B,[-0.02,0.12,0],[-0.12,0.95,0],0.03,0.025,gr);seg(B,[-0.12,0.95,0],[-0.06,1.02,0],0.02,0.02,dk);
    const inf=st===3?1.25+Math.sin(t*8)*0.05:st===5?1.3:1;ball(B,[-0.07,0.55,0],[0.13*inf,0.3,0.15*inf],bag);slab(B,[-0.07,0.3,0],[0.08,0.03,0.1],red);
    // the hose: from the bag round to the front, reaching for you when it sucks
    let p=[-0.02,0.35,0.12];const reach=st===3?1:st===2?0.6:0.2;
    for(let i=0;i<7;i++){const k=(i+1)/7,q=[0.05+k*(0.2+0.45*reach),0.35+Math.sin(k*Math.PI)*0.25-k*0.2*reach+Math.sin(t*3+i)*0.02,0.12-k*0.12];seg(B,p,q,0.035,0.035,gr);p=q}
    seg(B,p,[p[0]+0.06,p[1]-0.02,p[2]],0.035,0.06,dk);
    if(st===3)for(let i=0;i<8;i++){const k=(t*2+i/8)%1,a=(s.face||0)+Math.sin(i*4.1)*0.5,r=(1-k)*6;spr(s.x+Math.cos(a)*r,0.3+Math.sin(i*2.7)*0.25,s.z+Math.sin(a)*r,0.05,0.05,7,0.8,0.8,0.8,0.6*k,0)}
    if(hot)for(let i=0;i<5;i++){const k=(t*0.8+i/5)%1;spr(s.x+Math.sin(i*3)*0.15,0.9+k*0.4,s.z+Math.cos(i*3)*0.15,0.15+k*0.3,0.15+k*0.3,7,0.5,0.5,0.5,0.4*(1-k),0)}
  },
  // the Mime: white face, black beret, striped shirt; every move a pantomime
  (s,t,ag)=>{
    if(!(s.stun>0)&&Math.hypot(s.x-P.x,s.z-P.z)>1.7&&!danceCam()){   // he is miming that he is not there: only a faint chalky shimmer gives him away
      for(let i=0;i<7;i++){const a=t*1.3+i*0.9,y=0.15+((i*0.37+t*0.2)%1)*0.95;spr(s.x+Math.cos(a)*0.18,y,s.z+Math.sin(a)*0.18,0.06,0.06,7,0.9,0.9,0.95,0.22,1)}return}
    const st=s.state|0,wh=[0.95,0.95,0.93,8],bk=[0.04,0.04,0.05,2],gl=[0.98,0.98,0.98,2],red=[0.8,0.05,0.1,8];
    const tip=st===1?Math.abs(Math.sin(t*5))*0.04:0,lean=st===4?-0.25:st===8?0.25:0;
    const B=fr(s,tip,rZ(lean),1.05),U=subF(B,[0,0.46,0]);
    for(const z of[-1,1]){const k=st===1?Math.sin(t*5+(z>0?0:Math.PI))*0.15:0;seg(B,[0,0.46,z*0.05],[k,0.03,z*0.06],0.035,0.03,bk);slab(B,[k+0.03,0.02,z*0.06],[0.06,0.02,0.03],bk)}
    for(let i=0;i<6;i++)seg(U,[0,i*0.05,0],[0,i*0.05+0.05,0],0.085,0.085,i%2?wh:bk);
    const A=(z,e,h)=>{limb(U,[0,0.27,z*0.1],e,h,0.028,0.025,0.022,z>0?wh:bk,z>0?bk:wh,gl,0.035)};
    if(st===2){const k=Math.sin(t*6)*0.04;A(1,[0.12,0.25,0.16],[0.22,0.32+k,0.1]);A(-1,[0.12,0.25,-0.16],[0.22,0.32-k,-0.1])}
    else if(st===3||st===4){const k=Math.sin(t*(st===4?8:3))*0.08;A(1,[0.12,0.22,0.1],[0.25,0.25+k,0.02]);A(-1,[0.1,0.2,-0.08],[0.2,0.18-k,-0.02])}
    else if(st===5||st===6){A(-1,[0.15,0.3,-0.12],[0.32,0.32,-0.05]);A(1,[0.02,0.32,0.15],[st===6?0.2:-0.05,0.32,0.05])}
    else if(st===7||st===8){A(1,[0.14,0.3,0.12],[0.3,0.35,0.12]);A(-1,[0.14,0.3,-0.12],[0.3,0.35,-0.12])}
    else{const k=Math.sin(t*5)*0.1;A(1,[0.02+k,0.12,0.14],[0.05+k,0.0,0.15]);A(-1,[0.02-k,0.12,-0.14],[0.05-k,0.0,-0.15])}
    seg(U,[0,0.3,0],[0,0.34,0],0.03,0.03,wh);
    const Hd=subF(U,[0,0.42,0],rZ(Math.sin(t*1.3)*0.08));ball(Hd,[0,0,0],[0.08,0.095,0.075],wh);
    for(const z of[-1,1]){slab(Hd,[0.075,0.02,z*0.03],[0.004,0.03,0.008],bk);ball(Hd,[0.077,0.015,z*0.03],0.009,bk,true)}
    ball(Hd,[0.078,-0.045,0],[0.008,0.012,0.02],red,true);ball(Hd,[-0.01,0.08,0.01],[0.09,0.025,0.09],bk);ball(Hd,[-0.01,0.105,0.01],0.012,bk,true);
  },
  // the Cuckoo Clock: a carved wooden clock on little legs, a swinging pendulum blade, and the bird
  (s,t,ag)=>{
    const st=s.state|0,wd=[0.35,0.2,0.1,6],wl=[0.48,0.3,0.15,6],cr=[0.9,0.85,0.7,8],dk=[0.05,0.04,0.03,8],br=[1,0.75,0.3,4];
    const B=fr(s,Math.abs(Math.sin(t*4))*0.02,rZ(st===4?Math.sin(t*25)*0.03:0),1.1);
    for(const z of[-1,1]){const k=st===1?Math.sin(t*4+(z>0?0:3))*0.06:0;seg(B,[0,0.25,z*0.1],[k,0.02,z*0.12],0.03,0.025,wd);ball(B,[k+0.03,0.02,z*0.12],[0.05,0.02,0.035],wd,true)}
    slab(B,[0,0.62,0],[0.17,0.38,0.26],wd);slab(B,[0.17,0.62,0],[0.01,0.34,0.22],wl);
    for(const z of[-1,1])slab(B,[0,1.05,z*0.13],[0.21,0.015,0.17],wl,rX(z*-0.62));
    seg(B,[0.17,0.68,0],[0.2,0.68,0],0.15,0.15,cr);
    const hr=s.stun>0?1:t*0.15,mn=s.stun>0?4:t*1.8;slab(B,[0.205,0.68+Math.cos(hr)*0.05,Math.sin(hr)*0.05],[0.005,0.06,0.01],dk,rX(-hr));slab(B,[0.205,0.68+Math.cos(mn)*0.07,Math.sin(mn)*0.07],[0.005,0.09,0.006],dk,rX(-mn));
    for(const z of[-1,1]){ball(B,[0.2,0.75,z*0.06],[0.01,0.025,0.02],dk,true);slab(B,[0.2,0.79,z*0.06],[0.005,0.006,0.03],dk,rX(z*0.5))}
    const open=st===4?Math.min(1,ag/0.4):st===5?1:0;
    slab(B,[0.18,0.93,0],[0.01,0.06,0.05],dk);
    if(open>0){slab(B,[0.19,0.93,0.05+open*0.04],[0.005,0.06,0.025],wl);const out=st===5?0.12+Math.abs(Math.sin(t*6))*0.06:0.04*open;
      const Bd=subF(B,[0.18+out,0.93,0]);ball(Bd,[0,0,0],[0.05,0.045,0.04],[1.4,1.1,0.2,7],true);seg(Bd,[0.04,0.005,0],[0.09,0,0],0.015,0.002,[1.6,0.6,0.1,7]);ball(Bd,[0.03,0.02,0.02],0.008,dk,true)}
    else slab(B,[0.19,0.93,0],[0.005,0.06,0.05],wl);
    // the pendulum blade sweeps in front (the host works out the same swing for the hits)
    const pa=s.stun>0?0:Math.sin(R.time*2.4)*0.9,P0=fpt(B,[0.2,0.4,0]);   // stopped dead: the pendulum hangs still
    const P1=[s.x+Math.cos((s.face||0)+pa)*1.25,0.35,s.z+Math.sin((s.face||0)+pa)*1.25];
    seg({p:[0,0,0],R:ID3},P0,P1,0.012,0.012,br);ball({p:P1,R:rYaw(-((s.face||0)+pa))},[0,0,0],[0.03,0.12,0.12],[0.85,0.85,0.9,4]);
    for(const z of[-1,1]){seg(B,[0.1,0.24,z*0.08],[0.1,0.05+Math.sin(t+z)*0.03,z*0.08],0.004,0.004,dk);ball(B,[0.1,0.04+Math.sin(t+z)*0.03,z*0.08],[0.03,0.06,0.03],wd,true)}
  },
  // the Ember Heart: a great beating heart of coal and embers, chained in the air, with one burning eye
  (s,t,ag)=>{
    const p2=!!s.frozen,bt=(t*(p2?2:1.6))%1,pulse=bt<0.12?bt/0.12:bt<0.3?1-(bt-0.12)/0.18*0.6:0.4*(1-(bt-0.3)/0.7),k=1+0.08*pulse+(s.state===2?0.06:0);
    const y=0.62+Math.sin(t*0.9)*0.04,B={p:[s.x,y,s.z],R:rYaw(s.face||0).map(q=>q*k),lo:[s.ph,0,0]},coal=[0.12,0.05,0.04,8],hot=s.stun>0?[0.1,0.09,0.09,8]:[1.6+1.2*pulse,0.45+0.3*pulse,0.06,7];
    if(s.stun>0)for(let i=0;i<8;i++){const q=(t*0.9+i/8)%1;spr(s.x+Math.sin(i*2.1)*0.35,y+0.2+q*0.6,s.z+Math.cos(i*1.3)*0.35,0.2+q*0.4,0.2+q*0.4,7,0.75,0.75,0.78,0.35*(1-q),0)}   // quenched: black and steaming
    ball(B,[0,0,0],[0.42,0.38,0.42],coal);for(const z of[-1,1])ball(B,[0,0.18,z*0.2],[0.3,0.25,0.26],coal);seg(B,[0,-0.15,0],[0,-0.5,0],0.3,0.02,coal);
    for(let i=0;i<14;i++){const a=i*2.39,h=(i*0.37)%1*0.7-0.35;slab(B,[Math.cos(a)*0.41*(1-Math.abs(h)*0.6),h,Math.sin(a)*0.41*(1-Math.abs(h)*0.6)],[0.012,0.08,0.012],hot,m3(rYaw(-a),rX(i)))}
    ball(B,[0.38,0.05,0],[0.05,0.12,0.12],[1.4,1.1,0.5,7]);ball(B,[0.41,0.05,0],[0.02,0.08,0.03],[0.02,0.01,0,8],true);
    for(const z of[-0.12,0.1])seg(B,[-0.05,0.3,z],[-0.05,0.62/k,z*1.5],0.06,0.05,[0.25,0.08,0.06,8]);
    for(const [cx,cz] of[[1.6,0],[-1.6,0],[0,1.6],[0,-1.6]]){const a=[s.x+cx*0.9,0.05,s.z+cz*0.9];seg({p:[0,0,0],R:ID3},[s.x+cx*0.2,y-0.2,s.z+cz*0.2],a,0.015,0.015,[0.25,0.24,0.26,4])}
    spr(s.x,y,s.z,1.6,1.6,7,1,0.35,0.08,0.04+0.06*pulse,1);
    for(let i=0;i<5;i++){const q=(t*0.6+i/5)%1;spr(s.x+Math.sin(i*2.7+t)*0.3,y+q*0.6,s.z+Math.cos(i*1.9+t)*0.3,0.04,0.04,7,1,0.5,0.1,1-q,1)}
  },
];
function mimicModel(s,t,ag){
  const st=s.state|0,shut=s.role==='decoy'||st===5||st===6,wd=[0.42,0.24,0.1,6],gold=[1.1,0.8,0.25,4],dk=[0.05,0.02,0.02,8],tooth=[0.95,0.92,0.82,8];
  const hop=!shut&&st===1?Math.abs(Math.sin(t*6+s.ph))*0.1:0;
  const B=fr(s,hop,rZ(0),1.2);
  slab(B,[0,0.16,0],[0.24,0.16,0.33],wd);for(const z of[-0.22,0,0.22])slab(B,[0,0.16,z],[0.245,0.165,0.02],gold);
  const breath=s.role==='main'&&(st===5||st===6)?Math.max(0,Math.sin(t*2.4))**6*0.09:0;   // the real one breathes: its lid lifts a crack now and then
  const lid=shut?breath:st===2||st===3?1.2:st===4?0.9:0.35+0.25*Math.abs(Math.sin(t*3));
  const L=subF(B,[-0.24,0.32,0],rZ(lid));
  slab(L,[0.24,0.05,0],[0.24,0.05,0.33],wd);seg(L,[0.24,0.1,-0.33],[0.24,0.1,0.33],0.24,0.24,wd);
  for(const z of[-0.22,0,0.22])slab(L,[0.24,0.06,z],[0.25,0.06,0.02],gold);slab(L,[0.49,0.0,0],[0.02,0.04,0.04],gold);
  if(!shut){for(let i=0;i<7;i++){const z=(i-3)*0.09;seg(B,[0.22,0.31,z],[0.22,0.37,z],0.02,0.002,tooth);seg(L,[0.46,0,z],[0.46,-0.06,z],0.02,0.002,tooth)}
    slab(B,[0,0.3,0],[0.22,0.01,0.31],[0.35,0.02,0.04,8]);
    for(const z of[-1,1])ball(B,[0.05,0.42,z*0.12],0.035,[2.6,1.8,0.2,7],true);
    if(st===3){const ex2=clamp(ag/0.2,0,1)*3.8/1.2;let p=[0.1,0.3,0];for(let i=1;i<=8;i++){const q=[0.1+ex2*i/8,0.3+Math.sin(i+t*20)*0.02,Math.sin(i*1.3+t*15)*0.03];seg(B,p,q,0.05,0.045,[0.85,0.3,0.4,1]);p=q}ball(B,p,0.07,[0.85,0.3,0.4,1],true)}
    else if(st!==4)seg(B,[0.1,0.3,0],[0.3,0.25,0.05],0.05,0.04,[0.85,0.3,0.4,1]);
    for(let i=0;i<3;i++){const k=(t*0.7+i/3)%1;const q=fpt(B,[0.15,0.35+k*0.2,(i-1)*0.15]);spr(q[0],q[1],q[2],0.04,0.04,1,1,0.85,0.4,1-k,0)}}
}
// the hazards
function bzDraw(t,ex,ez){
  if(!F||!F.boss)return;bpDraw(t);const flat={p:[0,0,0],R:ID3,lo:ZERO3};
  for(const h of BS.hz){
    if((h.x-ex)**2+(h.z-ez)**2>18*18&&h.k!=='wall'&&h.k!=='pwall')continue;const c=h.c||[1,0.5,0.2];
    switch(h.k){
      case 'shot':ball(flat,[h.x,h.y,h.z],h.r,[c[0]*2,c[1]*2,c[2]*2,7],true);spr(h.x,h.y,h.z,0.35*(h.sz||1),0.35*(h.sz||1),7,c[0],c[1],c[2],h.sz<1?0.25:0.7,1);break;
      case 'ring':{const n=Math.max(10,Math.round(h.r*14));for(let i=0;i<n;i++){const a=i/n*6.283;spr(h.x+Math.cos(a)*h.r,0.12,h.z+Math.sin(a)*h.r,0.22,0.24,11,c[0],c[1],c[2],0.9,1)}break}
      case 'mark':{const k=clamp(h.t/h.delay,0,1),f=0.5+0.5*Math.sin(t*(8+16*k));
        if(h.sq)slab(flat,[h.x,0.012,h.z],[h.r*k,0.004,h.r*k],[c[0]*(0.6+f),c[1]*(0.6+f)*0.5,c[2]*0.3,7]);
        else{ball(flat,[h.x,0.012,h.z],[h.r*k,0.004,h.r*k],[c[0]*(0.5+f),c[1]*(0.5+f)*0.6,c[2]*0.5,7],true);const n=16;for(let i=0;i<n;i++){const a=i/n*6.283+t;spr(h.x+Math.cos(a)*h.r,0.05,h.z+Math.sin(a)*h.r,0.08,0.08,7,c[0],c[1],c[2],0.8,1)}}
        break}
      case 'pool':{const k=Math.min(1,h.t/0.3)*Math.min(1,(h.life-h.t)/1.5);ball(flat,[h.x,0.008,h.z],[h.r*k,0.006,h.r*k],[c[0],c[1],c[2],8],true);break}
      case 'cone':if(h.fx==='snuff'||h.fx==='pull'){for(let i=0;i<10;i++){const q=(t*(h.fx==='pull'?-1.5:2)+i/10)%1,k=q<0?q+1:q,a=h.yaw+Math.sin(i*7.1)*h.cone*0.8;spr(h.x+Math.cos(a)*k*h.len,0.4+Math.sin(i*3.3)*0.25,h.z+Math.sin(a)*k*h.len,0.1+k*0.25,0.1+k*0.25,7,0.85,0.85,0.9,0.18*(1-k*0.5),0)}}break;
      case 'line':break;   // the tongue is drawn with the Mimic
      case 'wall':case 'pwall':{const L=Math.hypot(h.x1-h.x0,h.z1-h.z0),n=Math.ceil(L*5),rv=BS.reveal>0?1:0.18;
        for(let i=0;i<=n;i++){const k=i/n,x=h.x0+(h.x1-h.x0)*k,z=h.z0+(h.z1-h.z0)*k;for(let j=0;j<3;j++){const y=0.2+j*0.35+Math.sin(t*3+i+j)*0.05;spr(x,y,z,0.12,0.12,7,0.8,0.9,1,rv*(0.4+0.4*Math.sin(t*5+i*1.7+j)),1)}}
        if(BS.reveal>0)slab({p:[(h.x0+h.x1)/2,0.6,(h.z0+h.z1)/2],R:rYaw(-Math.atan2(h.z1-h.z0,h.x1-h.x0))},[0,0,0],[L/2,0.6,0.01],[0.5,0.6,0.8,7]);
        break}
      case 'roll':{const a=Math.atan2(h.vz,h.vx),G={p:[h.x,h.r,h.z],R:m3(rYaw(a),rZ(-h.t*12))},br=[0.75,0.55,0.25,4];
        seg(G,[0,0,-0.05],[0,0,0.05],h.r*0.85,h.r*0.85,br);for(let i=0;i<10;i++){const q=i/10*6.283;slab(G,[Math.cos(q)*h.r*0.92,Math.sin(q)*h.r*0.92,0],[0.04,0.035,0.045],br,rZ(q))}
        seg(G,[0,0,-0.07],[0,0,0.07],0.05,0.05,[0.3,0.3,0.3,4]);break}
    }
  }
}
// the boss's own glow, so it reads in the dark
function bossLights(lights,ex,ez){
  if(!F||!F.boss)return;
  for(const s of F.shades){if(s.type!==6||s.x<0||(s.role!=='main'&&s.role!=='part'))continue;const d=(s.x-ex)**2+(s.z-ez)**2,c=hex3(BOSSES[s.boss].col),k=BOSSES[s.boss].id==='tallow'||BOSSES[s.boss].id==='heart'?0.5:0.9,l=Math.sqrt(d)||1,o=Math.min(l*0.6,(s.rad||0.4)+0.7);
    lights.push([d-8,s.x+(ex-s.x)/l*o,0.75,s.z+(ez-s.z)/l*o,c,k,5])/* lit from your side, so its face shows */}
  for(const p of BP.props){const d=(p.x-ex)**2+(p.z-ez)**2;if(d>140)continue;if(p.kind==='lamp'&&p.st===1)lights.push([d-4,p.x,1.0,p.z,[1,0.6,0.2],1.6,3.5]);else if(p.kind==='window'&&p.st===1)lights.push([d,p.x+p.ex*0.5,1.3,p.z,[0.7,0.8,1],1.2,4])}
  for(const h of BS.hz)if(h.k==='shot'&&h.sz>=1){const d=(h.x-ex)**2+(h.z-ez)**2;if(d<60)lights.push([d+2,h.x,h.y,h.z,h.c,0.7,2])}
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
  if(!loading||now<loading.at||loading.waiting)return;
  const transition=loading,{stages,index}=transition;
  if(index===stages.length){closeLoading();return}
  try{const r=stages[index][1]();
    if(r&&typeof r.then==='function'){transition.waiting=true;const go=()=>{transition.waiting=false};r.then(go,go)}   // a stage that finishes later: wait for it
  }catch(error){
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
  cameraView:()=>cameraView,createAvatar:buildLocalAvatar,
  say:(t,s)=>say(t,s),tone:(...a)=>tone(...a),noise:(...a)=>noise(...a),rumble:(...a)=>rumble(...a),
  hud:h=>{const el=$('roomHud');if(el.innerHTML!==h)el.innerHTML=h},
  hurtFx:()=>{const h=$('hurt');h.style.transition='none';h.style.opacity=1;requestAnimationFrame(()=>{h.style.transition='opacity .9s';h.style.opacity=0})},
  audio:()=>{initAudio();return ac?{ac,master,noise:noiseBuf}:null},
  // one blow from the room: true when it would be the killing one (the caller then ends the room with a death), otherwise it costs a heart as any creature's hit does
  damage:()=>{if(!P.ward&&P.hp<=1&&!(up.wind&&!R.wind))return true;hurt(null);return false},
  hearts:()=>'♥'.repeat(Math.max(0,P.hp))+'<span style="opacity:.4">'+'♥'.repeat(Math.max(0,maxHp()-P.hp))+'</span>',
  gems:n=>{wallet+=n;R.gems+=n;store.set('wallet',wallet)},sfx:n=>sfx(n),
  neon:{party:()=>NR.party,send:m=>mpSend(m),peers:()=>NR.peers,take:()=>NR.events.splice(0)},
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
const doorSeed=D=>hashStr(R.seed+'#theater'+R.depth+','+D.tx+','+D.ty);
// a floor with a still wood door bakes that forest in the background once the floor is up, so the room opens on the real trees
let swWarmTimer=0;
function stillwoodWarmSoon(){
  clearTimeout(swWarmTimer);
  const fl=F,D=fl&&fl.sdoors&&fl.sdoors.find(q=>q.kind==='stillwood'&&!q.used);if(!D)return;
  const go=()=>{if(F!==fl)return;if(loading||state==='title'){swWarmTimer=setTimeout(go,1000);return}stillwoodWarm(doorSeed(D))};
  swWarmTimer=setTimeout(go,1500);
}
function sdoorOpen(D,showProgress=false){
  if(loading||state!=='play'||D.used||P.down||P.grab)return;
  D.used=true;nearDoor=null;clearPrompt();RW=null;document.body.classList.remove('rwatch');
  mpSend({k:'sd',d:R.depth,i:F.sdoors.indexOf(D),w:D.kind});
  sfx('door');
  const seed=doorSeed(D);
  remember('doors',D.kind,{seed,depth:R.depth,look:doorLookOf(D),tx:D.tx,ty:D.ty,ph:D.ph,stone:F.stone.slice()});
  if(!showProgress)buildStatic(F);
  if(D.kind==='neonride')nrPullAll(seed);
  beginRoom(D.kind,roomEnd,seed,showProgress);
  if(DOOR_KINDS[D.kind]?.infinite)achieve('infinite',ACH_DEFS.infinite.title,ACH_DEFS.infinite.desc);
}
// ---- the Neon Run is a party ride: whoever opens its door pulls every other player in the run (on any floor) in with them. They ride
// one train of carts in the order of the list the opener sends ({k:'nrPull'}), each with their own blaster, score and prize. Riders
// tell each other where they aim and their score five times a second ({k:'nrSt'}), and send their shots and the cutouts they knock down
// ({k:'nrShot'}, {k:'nrHit'}); the room (src/neon-ride.js) reads all that through o.neon. Anyone who cannot come just then (dead, down,
// behind another door, in a cut scene) is left out, and their seat stays an empty cart.
const NR={party:null,peers:new Map(),events:[]};
function nrPullAll(seed){
  NR.party=null;NR.peers.clear();NR.events.length=0;
  if(!MP.on)return;
  const seats=[{id:MP.id,name:myName(),col:localPlayerColor()}];
  for(const p of MP.peers.values())if(p.run&&!p.down&&!p.away&&!(p.ko>0)&&mpFresh(p)&&seats.length<8)seats.push({id:p.id,name:p.name,col:p.col});
  if(seats.length<2)return;
  NR.party={seats,me:0};
  mpSend({k:'nrPull',sd:seed>>>0,seats,by:myName()});
  mpSys(myName()+' pulled everyone onto the Neon Run');
}
function nrPulled(m,p){
  if(!Array.isArray(m.seats))return;
  const seats=m.seats.slice(0,8).filter(q=>q&&typeof q.id==='string').map(q=>({id:q.id,name:String(q.name||'Rider').slice(0,16),col:Array.isArray(q.col)?q.col.slice(0,3).map(v=>clamp(+v||0,0,1)):[0.5,0.8,1]}));
  const me=seats.findIndex(q=>q.id===MP.id);
  if(me<0||state==='room'||state==='dead'||loading||P.down||P.ko>0||P.eaten>0||FX.frozen||P.hug||P.grab||RR)return;
  if(state==='pause')$('pause').classList.add('hidden');
  roomPauseHide(false);
  if(state==='talk'){$('talk').classList.add('hidden');talk=null}
  if(activeStation)closeStation();
  state='play';NR.party={seats,me};NR.peers.clear();NR.events.length=0;
  clearPrompt();RW=null;document.body.classList.remove('rwatch');
  say((p.name||'Someone')+' pulled you onto the Neon Run!',3.5);
  beginRoom('neonride',roomEnd,(+m.sd||7)>>>0);
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
  NR.party=null;NR.peers.clear();NR.events.length=0;
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
const xrayOn=()=>(R.xray>0&&R.xray===R.depth||ps('xray'))&&!!F;
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
  const all=xrayOn();
  if(state==='title'||P.down||!all&&!F.shades.some(potRevealed))return;
  const c=[];for(const s of F.shades)if(s.x>0&&(all||potRevealed(s)))c.push([s.x,s.z,s.type,potRevealed(s)]);
  if(MP.on&&MIM.st!==0&&MIM.rx>0)c.push([MIM.rx,MIM.rz,9]);
  for(const m of c){
    const d=Math.hypot(m[0]-P.x,m[1]-P.z);if(d>(m[3]?30:12)||d<0.6||los(P.x,P.z,m[0],m[1]))continue;if(m[3]){XR.list.push({x:m[0],z:m[1],t:m[2],d});continue}
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
  const on=state!=='title';
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
  if(res.why==='bathroom'){
    if(res.k==='dead'){mpSend({k:'sdr',r:'bathroom'});mpSys(myName()+' wiped too hard');P.hp=0;$('deadTitle').textContent='DEATH BY TOILET PAPER';die();return}
    achieve('bathroom','Squeaky clean','Wiped until the paper came back white');
    if(!res.reds)achieve('bathroomGentle','A gentle touch','Got clean in the bathroom without a single red wipe');
    if(P.hp<maxHp())P.hp++;
    say(P.hp<maxHp()?'You feel lighter. +1 heart.':'You feel lighter.',3);sfx('door');
    return;
  }
  if(res.why==='neonride'){
    // the prize: every tier up the board is a better one (NEON_PRIZES)
    const t=neonTier(Math.max(0,res.score|0)),q=NEON_PRIZES[t],got=[];
    if(q.gems){wallet+=q.gems;R.gems+=q.gems;store.set('wallet',wallet);got.push(q.gems+' gems')}
    if(q.flash){P.flash+=q.flash;got.push(q.flash+' flash bombs')}
    if(q.ward&&!P.ward){P.ward=1;got.push('a ward stone')}
    if(q.potion){const pool=POTIONS.filter(p=>p&&p.tier===q.potion&&!p.debuff);if(pool.length){const p=pool[(Math.random()*pool.length)|0];beltAdd(p.id);got.push(p.name)}}
    if(q.heart){R.hpBonus=(R.hpBonus|0)+1;P.hp=maxHp();got.push('+1 heart for this run')}
    achieve('neonride','Keep your arms inside the cart','Rode the Neon Run to the prize counter');
    if(t===NEON_PRIZES.length-1)achieve('neonrideTop','Galactic sharpshooter','Won the Golden Saucer on the Neon Run');
    if(res.friendly>0&&t>=3)achieve('neonrideOops','Friendly fire','Won a good prize on the Neon Run anyway, after shooting an astronaut');
    say('Prize: '+q.name+'! '+got.join(', ')+'.',5);sfx('shard');
    return;
  }
  if(res.why==='stillwood'){
    achieve('stillwood','Held in the water','Saw the door behind you in a still pond, and walked back out');
    if(!R.mirror){R.mirror=true;say('You step back through. Something from the water came with you: a small mirror now rides on the back of your head.',5)}
    else say('You step back through. The wood does not follow.',3.5);
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
  const actions=roomActions(keys,pad.roomButtons,{mode,mouse:mouseL,touchPress:touch.act,touchJump:touch.jump,touchCrouch:touch.crouch,keyboardSprint:keyboardSprint()});
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
let toggleSprint=store.get('toggleSprint',false)===true,sprintLatched=false;
const keyboardSprint=()=>toggleSprint?sprintLatched:!!(keys.ShiftLeft||keys.ShiftRight);
const sprintSettings=document.querySelectorAll('.toggleSprint');
for(const el of sprintSettings){
  el.checked=toggleSprint;
  el.addEventListener('change',()=>{
    toggleSprint=el.checked;sprintLatched=false;
    store.set('toggleSprint',toggleSprint);
    for(const setting of sprintSettings)setting.checked=toggleSprint;
  });
}
let cameraView='first';
const cameraViewSettings=document.querySelectorAll('.cameraView');
function setCameraView(view){
  cameraView=typeof view==='string'&&Object.hasOwn(CAMERA_VIEWS,view)?view:'first';
  store.set('cameraView',cameraView);
  for(const setting of cameraViewSettings)setting.value=cameraView;
}
setCameraView(store.get('cameraView','first'));
for(const setting of cameraViewSettings)setting.addEventListener('change',()=>setCameraView(setting.value));
$('sens').value=sens;
$('sens').addEventListener('input',e=>{sens=+e.target.value;store.set('sens',sens);document.querySelectorAll('.sensP').forEach(o=>o.value=sens)});
document.querySelectorAll('.sensP').forEach(el=>{el.value=sens;el.addEventListener('input',()=>{sens=+el.value;store.set('sens',sens);$('sens').value=sens;document.querySelectorAll('.sensP').forEach(o=>o.value=sens)})});
$('startSel').addEventListener('change',e=>store.set('startDepth',+e.target.value));
let bright=clamp(+store.get('bright',1.3)||1.3,0.6,3);
const mazeExposure=()=>Math.pow(bright/1.3,1.6);
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

function playerEye(extra=0){
  const base=EYE*wofEye()*potEye();
  const headroom=F.archive?archiveHeadroom(F.archive,P.x,P.z,P.y,PR):
    F.forestRoutes&&forestRootAt(F.forestRoutes,P.x,P.z,PR)?ROOT_CLEARANCE:CAM_TOP+.06;
  return Math.min(headroom-.06,base+P.y+bobY(P,1)+extra-crouchOffset(P,base));
}

function solidAt(x,z){
  const tx=Math.floor(x),ty=Math.floor(z);
  if(tx<0||ty<0||tx>=F.W||ty>=F.H)return !F.lift||!inDockAnnex(F.lift,x,z,liftScale,floorLiftGate===1);
  return (F.g[ty*F.W+tx]&3)===1||F.g[ty*F.W+tx]===2;
}
let panelLvl=1;
function torchRadius(fu){const mine=fu===undefined&&state!=='title';if(fu===undefined)fu=state==='title'?100:P.fuel;return (1.6+6.0*Math.sqrt(Math.max(0,fu)/100))*(F.dark?0.5:1)*(F.back?0.45:1)*(mine?potTorch():1)}
function blocked(x,z){return solidAt(x-PR,z-PR)||solidAt(x+PR,z-PR)||solidAt(x-PR,z+PR)||solidAt(x+PR,z+PR)||BS.hz.length>0&&bossWallAt(x,z)}
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
function installFloor(depth,nextFloor,prepared=false,landing=null){
  prepareMazeLighting();
  R.depth=depth;
  if(!archiveRun&&depth>deepest&&!(URL_DEPTH&&depth===R.startDepth)){deepest=depth;store.set('deepest',deepest)}
  if(F?.npcs)for(const npc of F.npcs)disposeGpuRig(npc);
  R.xray=0;R.guide=0;GD.have=false;GD.key='';F=nextFloor;bossReset();
  POT.zones=[];POT.proj=[];POT.fx=[];W.shots=[];P.fizz=0;P.woozy=0;P.hug=null;POT.hist=[];POT.apo=null;POT.stop=0;canvas.style.filter='';for(const k of['life','allmon','xray','gems','phase','hold'])POT.ps[k]=0;TK=null;WOF.here=false;panelLvl=1;P.grab=null;clearMooseLures();mimicReset();
  if(!(prepared&&landingOf.get(F)?.install())&&F.built!==2){buildMesh(F);buildStatic(F);buildSdf(F)}
  wofModel();
  floorLiftGate=1;
  positionFloorLift(F,depth);
  if(prepared)afterLiftFrame(()=>{if(state==='play'&&F===nextFloor&&!loading)sweepWorld()});else sweepWorld();
  if(F.npcs&&F.npcs.some(q=>q.type==='keeper'))keeperWarm();
  P.x=F.start.tx+0.5;P.z=F.start.ty+0.5;P.yaw=F.start.yaw;P.pitch=0;P.shards=0;P.tx=-1;P.ty=-1;
  P.y=0;P.vy=0;P.vx=0;P.vz=0;P.crouched=false;P.crouchBlend=0;P.inWater=false;P.keys=0;P.jumpQ=0;P.inSafe=false;P.unseen=false;nearNpc=nearDoor=null;
  const visit=liftVisits.get(depth);
  if(visit?.floor===F){
    P.shards=visit.shards;P.keys=visit.keys;
    BS.started=visit.bossStarted;BS.won=visit.bossWon;
  }
  sealMsgT=0;doorMsgT=0;
  if(landing)Object.assign(P,landing);
  onTileChange();
  pkReapply();
  if(MP.guest&&MP.hostId)mpSend({k:'pkq',d:depth},MP.hostId);
  glReset();
  stillwoodWarmSoon();
  if(floorKind(depth+1)==='forest')setTimeout(warmForest,1200);
}
function onTileChange(){
  P.tx=Math.floor(P.x);P.ty=Math.floor(P.z);
  const outside=P.tx<0||P.ty<0||P.tx>=F.W||P.ty>=F.H;
  const tx=outside?F.lift?.tx??F.start.tx:P.tx,tz=outside?F.lift?.tz??F.start.ty:P.ty;
  F.dist=bfs(F.g,F.W,F.H,tx,tz);
  if(!outside&&F.pocketMask[P.ty*F.W+P.tx]){const q=F.pockets.find(q=>q.tx===P.tx&&q.ty===P.ty);
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
// The floor is built in steps behind the loading screen (one per frame, so the page stays responsive), then every shader the floor
// needs is compiled in parallel and one frame is drawn off screen, so play starts without the first-frame stalls.
function loadFloorWithProgress(title,seed,depth,enter,createFloor=()=>genFloor(seed,depth)){
  let nextFloor;
  showLoading(title,[
    ['Generating the maze',()=>{nextFloor=createFloor()}],
    ['Building the walls',()=>{SURFS.defer(true);try{buildMesh(nextFloor)}finally{SURFS.defer(false)}nextFloor.built=1}],
    ['Painting the walls',()=>paintSurfaces()],
    ['Placing the details',()=>{buildStatic(nextFloor);buildSdf(nextFloor);nextFloor.built=2}],
    ['Building the floor',()=>enter(nextFloor)],
    ['Preparing shaders',()=>warmFloor()],
    ['Almost there',()=>compilePasses()],
    ['Ready',()=>{if(F&&state!=='title')try{render(performance.now()/1000)}catch(e){console.error(e)}}]
  ]);
}
// Post-processing (bloom, ambient occlusion, FXAA...) and the shadow shader compile on the first frame drawn through the composer.
// First compile the passes' shaders in parallel, then draw one tiny frame through the composer (the lobby draws over it in the same
// frame, so it is never seen), so stepping into the maze needs nothing new.
function compilePasses(){
  if(!composer)return Promise.resolve();
  const sc=new THREE.Scene(),geo=new THREE.PlaneGeometry(2,2),seen=new Set();
  const add=m=>{if(m&&m.isMaterial&&!seen.has(m)){seen.add(m);const q=new THREE.Mesh(geo,m);q.frustumCulled=false;sc.add(q)}};
  for(const pass of composer.passes){if(pass.isOutputPass||pass.constructor.name==='OutputPass')continue;
    for(const v of Object.values(pass)){if(Array.isArray(v))v.forEach(add);else add(v)}if(pass.fsQuad)add(pass.fsQuad.material)}
  const prev=renderer.getRenderTarget();
  try{renderer.setRenderTarget(composer.readBuffer);return renderer.compileAsync(sc,new THREE.OrthographicCamera(-1,1,1,-1,0,1)).catch(()=>{}).then(()=>geo.dispose())}
  catch(e){return Promise.resolve()}finally{renderer.setRenderTarget(prev)}
}
function warmPost(){
  if(!composer)return;
  const hidden=[];scene.traverse(o=>{if(!o.visible&&o!==scene){hidden.push(o);o.visible=true}});
  for(const l of shadLights)l.shadow.needsUpdate=true;
  // drawn at the size it already is: resizing the composer (every render target) and the canvas and back forced a long GPU stall
  try{composer.render(0)}catch(e){console.error(e)}
  for(const o of hidden)o.visible=false;
}
// paint the queued wall textures a couple per frame (their shaders compiled in parallel first)
function paintSurfaces(){
  return SURFS.compileQueued().then(()=>new Promise(res=>{const step=()=>{if(SURFS.pump(12))requestAnimationFrame(step);else res()};step()}));   // behind a loading bar: a few surfaces a frame (each is painted in strips)
}
function warmFloor(){
  if(!F||state==='title')return null;
  wofModel();
  return compileScene();
}
// Compile what the maze scene needs, for the target it is really drawn into: with post-processing that is the composer's buffer
// (linear colour, no tone mapping), and a shader compiled for the screen would not be reused there.
// Everything is compiled, hidden things too (in the lobby the maze's hands, sprites and characters are hidden, and they would
// otherwise compile on the first step out of the lift), and the textures are uploaded now rather than on first use.
function compileScene(){
  const prev=renderer.getRenderTarget(),hidden=[];
  scene.traverse(o=>{if(!o.visible){hidden.push(o);o.visible=true}});
  try{
    renderer.setRenderTarget(composer?composer.readBuffer:null);
    const p=renderer.compileAsync(scene,camera).catch(()=>{});
    const seen=new Set();
    scene.traverse(o=>{for(const m of [].concat(o.material||[]))for(const k of['map','normalMap','emissiveMap','alphaMap','roughnessMap','aoMap']){const t=m&&m[k];
      if(t&&t.isTexture&&!t.isRenderTargetTexture&&!seen.has(t)){seen.add(t);try{renderer.initTexture(t)}catch(e){}}}});
    return p;
  }catch(e){return Promise.resolve()}
  finally{for(const o of hidden)o.visible=false;renderer.setRenderTarget(prev)}
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
  sprintLatched=false;
  liftVisits.clear();liftResume=liftJourney=false;
  if(seed===autoSeed&&!$('seedIn').value.trim()){autoSeed=randSeed();reWarm=true}
  liftCacheClear(!!landing);
  roomLeave();$('deadTitle').textContent='THE DARK TAKES YOU';wofClear();WOF.done=true;WOF.plan=null;WOF.flap=0;WOF.party=0;
  showHub(false);
  P.down=false;
  R.seed=seed;R.pk={};R.mirror=false;P.pick=0;P.spikeTraps=0;P.moose=P.mounted=false;P.moosePending=null;R.score=0;R.time=0;R.gems=0;R.startDepth=sd;
  R.hpBonus=0;potReset(true);P.fizz=0;P.woozy=0;P.kissT=0;P.hug=null;W.shots=[];W.cd=0;W.parryT=0;
  P.hp=maxHp();P.fuel=100;P.stam=100;P.winded=false;P.flash=1+Math.floor((sd-1)/3)+(up.band|0);P.ward=0;R.wind=false;P.inv=0;P.chill=0;lowFuelSaid=false;
  installFloor(sd,floor,!!landing,landing);
  finishFloorArrival(sd,liftTrip);
}
function finishFloorArrival(depth,liftTrip){
  // Resetting the lift disposes its landing task. Transfer the floor first.
  if(!archiveRun)hub.reset();
  state='play';
  rememberFloor();
  ['title','pause','dead','talk'].forEach(id=>$(id).classList.add('hidden'));talk=null;
  $('hud').classList.remove('hidden');$('map').classList.remove('hidden');
  if(!archiveRun){say(depth>1?`Depth ${depth}: ${floorTag()}`:'Find 3 shards to break the seal',4);showTips()}
  initAudio();
  if(liftTrip)for(const [message,from] of sharedLift.waiting.splice(0))mpRecv(message,from);
  if(MP.host)mpSendRun(undefined,liftTrip);
  if(liftTrip)completeSharedLift(liftTrip);
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
  sprintLatched=false;
  bossReset();
  if(archiveRun){finishArchive();return}
  if(loading)closeLoading();
  endWallClip();
  roomLeave();glFallEnd();GL.queued=null;
  if(MP.on)mpLeave(false);
  liftVisits.clear();liftResume=liftJourney=false;
  state='title';potHide();
  ['pause','dead','hud','map','talk'].forEach(id=>$(id).classList.add('hidden'));talk=null;clearPrompt();
  $('toast').style.opacity=0;
  showHub(true);
  showBest();
  if(document.pointerLockElement){usingLock=false;document.exitPointerLock()}
}
function showBest(){
  hub.setTrophies?.(bossTrophies(),adminOverride);
  fillStartSel();
  const b=store.get('best',null);
  $('bestLine').textContent=(b?`Best run: depth ${b.depth}, ${b.score} points · `:'')+`Level ${plLevel()} · ${wallet} gems banked`;
}
function pause(){
  if(state!=='play')return;
  if(activeStation==='lift')closeStation();
  sprintLatched=false;
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
function freeInput(){for(const k in keys)keys[k]=false;mouseL=false;sprintLatched=false}
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
  if(MP.on&&!MP.wiping&&state==='play'&&!archiveRun&&koTry())return;   // co-op: down, not out, while a friend can still come
  if(archiveRun){state='dead';queueMicrotask(finishArchive);return}
  if(loading)closeLoading();
  if(activeStation)closeStation();
  endWallClip();
  roomLeave();GL.queued=null;R.xray=0;R.guide=0;POT.ps={};BS.dance=null;danceHide();
  if(MP.on&&!MP.wiping){mpDown();return}
  state='dead';clearPrompt();potHide();
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
  const firstClear=!why&&!liftVisits.get(R.depth)?.cleared;
  saveLiftFloor(firstClear);
  state='trans';
  const bonus=firstClear?100*R.depth+Math.round(P.fuel):0;
  R.score+=bonus;
  sfx('descend');
  const depth=R.depth+n;
  loadFloorWithProgress('Descending to depth '+depth,R.seed,depth,floor=>{
    P.fuel=Math.min(100,P.fuel+25);lowFuelSaid=false;
    if(P.down){P.down=false;P.hp=maxHp();P.fuel=Math.max(P.fuel,50);P.inv=2;say('You rise again',2)}
    if(P.ko>0){P.ko=0;P.half=false;P.hp=maxHp();P.inv=2;say('You rise again',2)}
    installFloor(depth,floor);
    rememberFloor();
    $('fade').style.transition='';$('fade').style.opacity=0;
    say((why?why+'. ':'')+`Depth ${R.depth}: ${floorTag()}`,why?5:3.5);showTips();
    state='play';
  },()=>liftFloor(R.seed,depth));
}
function useFlash(){
  if(P.flash<=0){say('No flash bombs',1.2);return}
  P.flash--;flashT=1;
  const fx=$('flashfx');fx.style.transition='none';fx.style.opacity=0.85;
  requestAnimationFrame(()=>{fx.style.transition='opacity .7s';fx.style.opacity=0});
  let n=0;
  for(const s of F.shades)if(s.type===3&&s.x>0&&Math.hypot(s.x-P.x,s.z-P.z)<9&&los(P.x,P.z,s.x,s.z)){banish(s,true);n++}
  n+=flashStun(P.x,P.z,up.powder|0);
  BS.reveal=2.5;   // a flash shows the Mime's walls
  for(const s of F.shades)if(s.x>0&&!s.dead&&!s.dropped&&s.type!==3&&s.type!==6&&Math.hypot(s.x-P.x,s.z-P.z)<6.5+1.25*(up.powder|0)&&los(P.x,P.z,s.x,s.z)){s.dropped=true;potLoot(s.x,s.z,'ingr',1,s.type===0?10:s.type===2?11:12)}   // a flash knocks a little of it loose
  if(MP.guest)mpSend({k:'fl',d:R.depth,x:P.x,z:P.z,p:up.powder|0},MP.hostId);
  sfx('flash');rumble(120,0.2,0.7);
  if(n)say(n>1?`${n} creatures stunned`:'Stunned',1.5);
}
function flashStun(x,z,lv){
  lv=clamp(lv|0,0,2);let n=0;
  for(const s of F.shades){
    if(s.type===3)continue;
    if(Math.hypot(s.x-x,s.z-z)<6.5+1.25*lv+(s.rad||0)&&los(x,z,s.x,s.z)){if(s.type===6&&s.role!=='add'){if(!s.immune)s.stun=Math.max(s.stun,1.2)}else{s.stun=4.5+1.5*lv;if(s.type!==1&&s.type!==6)s.state=0}n++}
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
const ACH_DEFS={infinite:{title:"It's Bigger on the Inside",desc:'Discover your first infinite room'},knowledge:{title:'Knowledge is power',desc:'Silence the peasants of the picture house'},...MOOSE_ACH};
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
  if(F.mazeH&&ty>=F.mazeH-1)return 'kept';
  if(F.g[ty*W+tx]!==1)return 'notwall';
  if(F.archive?.reserved(tx,ty)||F.forestRoutes?.reserved(tx,ty))return 'kept';
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
  if(P.ko>0||P.eaten>0)return;   // down, or already the spider's: nothing more can hurt you
  if(wHurt(s))return;
  if(potHurt(s))return;
  if(P.ward){P.ward=0;P.inv=1.6;if(s){s.stun=2.5;s.calm=9;s.state=0}sfx('seal');say('Your ward stone shatters',2);return}
  P.hp--;P.inv=1.6;if(s){s.stun=2.5;s.calm=9;s.state=0}
  if(POT.hex>0||ps('doom')){if(POT.hex>0)POT.hex--;P.hp--;say(ps('doom')?'Doomed: the wound cuts twice as deep':'The hex bites: two hearts',1.8)}   // hexed: this wound costs two
  if(P.hp<=0&&potDying())return;
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
    case 'gem':{const k=(ps('gold3')?3:ps('midas')?2:1)*(ps('lucky')&&Math.random()<0.5?2:1);if(k>1){R.gems+=k-1;wallet+=k-1}}R.score+=10*R.depth;R.gems++;wallet++;if(Math.random()<0.15*(up.purse|0)){R.gems++;wallet++;say('Lucky find: 2 gems',1.2)}store.set('wallet',wallet);sfx('gem');break;
    case 'oil':P.fuel=Math.min(100,P.fuel+35);lowFuelSaid=false;sfx('oil');break;
    case 'flash':P.flash++;sfx('pick');break;
    case 'chest':wallet+=8;R.gems+=8;R.score+=60*R.depth;store.set('wallet',wallet);sfx('shard');say('You slipped through the wall. A hidden cache: 8 gems',4);break;
    case 'key':P.keys++;sfx('key');say('You found the gate key',2.5);break;
    case 'heart':if(P.hp<maxHp())P.hp++;else R.score+=25;sfx('pick');break;
    case 'ingr':POT.bag[it.ing]++;potSaveBag();POT.hudK='';tone(1046,0.1,'triangle',0.08);tone(1318,0.14,'triangle',0.07,0.07);say(INGREDIENTS[it.ing].name+(POT.bag[it.ing]>1?' ('+POT.bag[it.ing]+')':'')+'. The Brewer can use this.',2);break;
  }
  if(!it.loc)mpSend({k:'got',d:R.depth,i:F.items.indexOf(it)});
}

/* ---------- multiplayer: one player hosts, friends join with ?room=CODE ----------
   Every client builds the same maze from the shared seed, so only small updates travel:
   where each player is, what the creatures are doing (the host runs them), and events
   such as a pickup, a gate, a descent. See src/net.js for the connection itself. */
const MP_COLS=[[0.31,0.76,0.97],[0.51,0.82,0.45],[0.78,0.45,0.9],[1.0,0.72,0.3],[0.97,0.42,0.62],[0.35,0.85,0.75],[1.0,0.92,0.42],[0.62,0.6,1.0]];
const localPlayerColor=()=>MP.on?MP_COLS[hashStr(MP.id||'')%MP_COLS.length]:defaultPlayerColor;
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
  if(!p){const c=MP_COLS[hashStr(id||'')%MP_COLS.length];p={id,name:'Delver',col:c,hex:toHex(c),look:0,d:0,run:false,down:false,inv:0,walk:0,spd:0,fu:100};MP.peers.set(id,p)}
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
      if(Math.abs(x)>21&&!isBunkPosition(x,z)||y< -10000||y>3||z< -34||z>16||Math.abs(yaw)>1e4)return;
      const station=['settings','guide','news','lift'].includes(m.station)?m.station:null;
      let ride=null;
      if(m.ride&&sharedLift.trip&&m.ride===sharedLift.trip.id){
        ride=m.ride;
        if(!sharedLift.trip.members.includes(from))sharedLift.trip.members.push(from);
      }
      p.hub={x,y,z,yaw,station,ride,ready:!!m.ready,at:performance.now()};p.run=false;
      if(m.look!==p.look)p.look=normalizeAppearance(m.look);
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
      if(MP.host)requestLiftDeparture(from,m);
      break;
    case 'liftSelection':
      if(fromHost&&(validLiftDepth(m.depth)||m.depth===0&&m.pending)&&validLiftDepth(m.max)&&m.depth<=m.max&&!sharedLift.trip){
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
        sharedLift.trip.motion={travel:m.travel,extra:m.extra,y:Number.isFinite(m.y)?m.y:undefined,docked:!!m.docked,gaps:Array.isArray(m.gaps)?m.gaps:null};
        if(m.docked)updateLiftScreen();
      }
      break;
    case 'liftHold':
      if(fromHost&&state==='play')say('Everyone in the run needs to board the lift.',3);
      break;
    case 'liftLobby':
      if(fromHost){MP.run=null;mpTitle()}
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
      const sameTrip=!!(m.liftTrip&&(m.liftTrip===sharedLift.trip?.id||m.liftTrip===sharedLift.lastTrip));
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
      if(m.look!==p.look)p.look=normalizeAppearance(m.look);
      p.positionAt=performance.now();
      p.d=m.d;p.x=+a[0];p.z=+a[1];p.y=+a[2];p.yaw=+a[3];p.pitch=+a[4];p.fu=+a[5];p.down=!!(a[6]&1);p.safe=!!(a[6]&2);p.run=!!(a[6]&4);p.away=!!(a[6]&8);p.mounted=!!(a[6]&16);p.unseen=!!(a[6]&32);p.hp=a[7];p.form=a[6]>>6&3;p.fat=!!(a[6]&256);p.pox=!!(a[6]&512);p.frz=!!(a[6]&1024);p.bob=!!(a[6]&2048);p.hedge=!!(a[6]&4096);p.curl=a[6]&8192?1:a[6]&16384?2:0;p.mirror=!!(a[6]&32768);p.crouched=!!(a[6]&65536);p.baby=!!(a[6]&131072);p.pf=a[8]|0;p.web=+a[9]||0;p.ko=+a[10]||0;p.slugs=a[11]|0;
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
        s.nx=a[j];s.nz=a[j+1];s.face=a[j+2];s.state=a[j+3];s.stun=a[j+4];s.frozen=!!a[j+5];s.pv=Array.isArray(m.pv)?m.pv[j/6]|0:0;{const hp=Array.isArray(m.hp)?m.hp[j/6]|0:0;if(hp){if(s.hpPct&&hp<s.hpPct)s.hitT=0.25;s.hpPct=hp;s.hpShow=1.2}else s.hpPct=0}j+=6;
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
    case 'wh':{if(!MP.host||!inRun||!here||!Array.isArray(m.h))break;for(const h of m.h.slice(0,24))if(h&&Number.isInteger(h.i)&&Number.isFinite(+h.d)&&+h.d<50)wApply(h,from);break}
    case 'gw':{if(fromHost&&inRun&&here)grannyWoozy();break}
    case 'nrPull':{if(inRun)nrPulled(m,p);break}
    case 'emo':{const e=m.e|0;p.emote=e>=0&&e<EMOTES.length?{id:e,t0:R.time}:null;break}
    case 'nrSt':{if(NR.party&&NR.party.seats.some(q=>q.id===from))NR.peers.set(from,{y:clamp(+m.y||0,-4,4),p:clamp(+m.p||0,-2,2),sc:m.sc|0,e:m.e?1:0});break}
    case 'nrShot':case 'nrHit':{if(NR.party&&state==='room'&&ROOMS.kind==='neonride'&&NR.party.seats.some(q=>q.id===from)){NR.events.push({k:m.k,id:m.id|0,to:Array.isArray(m.to)?m.to.slice(0,3).map(Number):null,by:from});if(NR.events.length>200)NR.events.shift()}break}
    case 'slx':{if(fromHost&&inRun&&here&&F.shades.some(q=>q.type===8)){const n=Math.min(m.n|0,F.shades.length+400);while(F.shades.length<n)slugNew()}break}
    case 'spe':{if(fromHost&&inRun&&here)spiderEaten();break}
    case 'spl':{if(fromHost&&inRun&&here&&Array.isArray(m.a))for(const q of m.a){const s=Array.isArray(q)&&F.shades[q[0]|0];if(s&&s.type===10)s.lv=clamp(q[1]|0,1,99)}break}
    case 'slc':{if(fromHost&&inRun&&here&&F.shades[m.i|0]&&F.shades[m.i|0].type===8)slugOn(m.i|0);break}
    case 'slf':{if(MP.host&&inRun&&here){const s=F.shades[m.i|0];if(s&&s.type===8&&s.ride&&s.rideBy===from&&Number.isFinite(+m.x)&&Number.isFinite(+m.z))slugDrop(s,+m.x,+m.z)}break}
    case 'kup':{if(inRun&&here&&P.ko>0&&Number.isFinite(p.x)&&Math.hypot(p.x-P.x,p.z-P.z)<3)koUp();break}
    case 'unweb':{if(inRun&&here&&webLocked()&&!(P.eaten>0)&&Number.isFinite(p.x)&&Math.hypot(p.x-P.x,p.z-P.z)<3){P.web=50;say((p.name||'A friend')+' cuts you loose! The silk still clings, though.',3);sfx('pick')}break}
    case 'bz':{if(fromHost&&inRun&&here&&F.boss&&m.h&&typeof m.h==='object'){const h={...m.h,t:0};if(!BS.hz.some(q=>q.id===h.id))BS.hz.push(h)}break}
    case 'bsx':{if(fromHost&&inRun&&here&&F.boss)bpApply(m);break}
    case 'bpa':{if(!MP.guest&&inRun&&here&&F.boss&&p){if(m.it!==undefined)bpTake(m.it|0,from);else bpAct(m.i|0,from,{x:p.x,z:p.z})}break}
    case 'bfx2':{if(fromHost&&inRun&&here){if(m.w==='snap')say('SNAP! Ratbag is caught in his own trap!',2);else if(m.w==='clog')bpClog();else if(m.w==='burst')bpBurst();else if(m.w==='shock')BP.shock=R.time}break}
    case 'bdm':{if(inRun&&here&&p){p.dz={lane:clamp(m.l|0,0,3),t:R.time}}break}
    case 'bst':{if(fromHost&&inRun&&here)bossStart(true);break}
    case 'bd':{if(fromHost&&inRun&&here)bossWin();break}
    case 'bfx':{if(fromHost&&inRun&&here&&m.w==='fuel')bFuelMe(Math.min(60,+m.a||0),String(m.why||'').slice(0,80));break}
    case 'gg':{if(fromHost&&inRun&&here&&F.shades[m.i])grannyGrab(F.shades[m.i]);break}
    case 'gf':{if(MP.host&&inRun&&here&&F.shades[m.i]){p.hug=false;grannyLet(F.shades[m.i],p.x,p.z)}break}
    case 'fz':{if(fromHost&&inRun&&here&&Number.isFinite(+m.a))fizzMe(Math.min(0.5,+m.a));break}
    case 'wk':{if(fromHost&&inRun&&here)wReward(m.t|0);break}
    case 'pt':{if(!inRun||!here||!potInfo(m.id)||![m.x,m.z].every(Number.isFinite))break;potLand(m,false);break}
    case 'pth':{if(!inRun||!here||!potInfo(m.id)||!Array.isArray(m.a)||!m.a.every(Number.isFinite))break;const a=m.a;POT.proj.push({id:m.id,x:a[0],y:a[1],z:a[2],vx:a[3],vy:a[4],vz:a[5],t:0,mine:false,rot:0});break}
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
    case 'sdr':if(inRun)say(m.r==='theater'?p.name+' silenced the picture house':m.r==='theater-dead'?p.name+' was roasted to death by teenagers':m.r==='esc'?p.name+' beat the glass kiln':m.r==='fall'?p.name+' fell to their death':m.r==='lucky'?p.name+' hid behind a mirror and got lucky':m.r==='mirror'?p.name+' was eaten by the thing behind the mirror':m.r==='bathroom'?p.name+' wiped too hard':m.r==='hamlet'?p.name+' was taken by the thing in the village':p.name+' was buried in the glass kiln',3);break;
    case 'warp':{
      const n=(m.d|0)-R.depth;
      if(inRun&&state!=='trans'&&n>=1&&n<=3)mpDescend(n,p.name+' woke a black hole. It throws you all '+n+(n>1?' floors':' floor')+' down');
      break;}
    case 'down':if(inRun&&state!=='trans'&&m.d===R.depth+1){say(p.name+' found the way down',2);mpDescend()}break;
    case 'pk':
      if(!inRun||!here||p.down||state==='trans')return;
      if(pkApply(m.x,m.y,false)){say(p.name+' broke through a wall',2.5);mpSys(p.name+' broke through a wall')}
      break;
    case 'tpk':
      if(!fromHost||!inRun||!here||state==='trans')return;
      if(pkApply(m.x,m.y,false)&&Math.hypot(m.x+0.5-P.x,m.y+0.5-P.z)<14)say('CRASH! The troll smashes straight through the wall!',3);
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
      else if(m.w==='club'){if(P.inv<=0)trollClubbed(clamp(+m.dx||0,-1,1),clamp(+m.dz||0,-1,1))}
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
    case 'cg':{if(!fromHost||!inRun||m.d!==R.depth)break;if(m.end){CG=null;break}
      if(![m.x,m.z,m.y].every(Number.isFinite))break;
      if(!CG)CG=cgNew(m.x,m.z);
      CG.tx=m.x;CG.tz=m.z;CG.tyaw=m.y;CG.mv=+m.m||0;CG.chew=m.c?1:0;CG.t=+m.t||0;CG.age=0;break}
    case 'cgb':if(fromHost&&inRun)cgBitten();break;
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
function inArchiveAlcove(x,z,y=0,crouched=false){return !!F.archive&&archiveHidden(F.archive,x,z,y,crouched)}
const playerInArchiveCover=()=>inArchiveAlcove(P.x,P.z,P.y,P.crouched);
const underForestRoots=(x,z,y,crouched)=>!!F.forestRoutes&&forestCover(F.forestRoutes,x,z,y,crouched);
function mpTargets(){
  const T=[];
  if(!P.down&&!(P.ko>0)&&!(P.eaten>0))T.push({x:P.x,z:P.z,y:P.y,yaw:P.yaw,fuel:P.fuel,inSafe:P.inSafe||F.archive&&P.y>.84||playerInArchiveCover()||underForestRoots(P.x,P.z,P.y,P.crouched)||P.away||!!FX.frozen||potSafeAt(P.x,P.z),inv:P.inv,loc:true,mirror:R.mirror,tx:P.tx,ty:P.ty,pf:potFlags()});
  if(MP.host)for(const p of MP.peers.values())
    if(p.run&&!p.down&&!(p.ko>0)&&p.d===R.depth&&p.x!==undefined&&mpFresh(p))T.push({x:p.x,z:p.z,y:p.y,yaw:p.yaw,fuel:p.fu,inSafe:p.safe||F.archive&&p.y>.84||inArchiveAlcove(p.x,p.z,p.y,p.crouched)||underForestRoots(p.x,p.z,p.y,p.crouched)||potSafeAt(p.x,p.z),inv:p.inv,loc:false,mirror:!!p.mirror,p,tx:Math.floor(p.x),ty:Math.floor(p.z),pf:p.pf|0});
  return T;
}
// path distance from every tile to the nearest player
function mpDist(T,archiveRoute=false){
  if(!archiveRoute&&!F.forestRoutes&&T.length===1&&T[0].loc)return F.dist;
  const key=T.map(t=>t.tx+','+t.ty).join(';')+(F.door?'d':'');
  const field=archiveRoute?'archiveMd':'md',memo=field+'Key';
  if(F[memo]===key&&F[field])return F[field];
  const W=F.W,H=F.H,g=F.g,d=new Int16Array(W*H).fill(-1),q=new Int32Array(W*H);let qh=0,qt=0;
  for(const t of T){if(t.tx<0||t.ty<0||t.tx>=W||t.ty>=H)continue;const i=t.ty*W+t.tx;if(d[i]<0){d[i]=0;q[qt++]=i}}
  while(qh<qt){
    const c=q[qh++],cx=c%W,cy=(c/W)|0,nd=d[c]+1;
    for(let k=0;k<4;k++){const nx=cx+DIRS[k][0],ny=cy+DIRS[k][1];if(nx<0||ny<0||nx>=W||ny>=H)continue;const n=ny*W+nx;if(g[n]===0&&d[n]<0&&(!F.forestRoutes||!forestRootTile(F.forestRoutes,nx,ny))&&(!archiveRoute||!archiveMobBlocked(F.archive,nx+.5,ny+.5))){d[n]=nd;q[qt++]=n}}
  }
  F[memo]=key;F[field]=d;return d;
}
function mpNearest(T,x,z){let b=null,bd=1e9;for(const t of T){const d=(t.x-x)**2+(t.z-z)**2;if(d<bd){bd=d;b=t}}return b}
function mpWatched(T,s){
  for(const t of T){
    const eu=Math.hypot(s.x-t.x,s.z-t.z);if(eu>=9||eu>=torchRadius(t.fuel)+0.5)continue;
    const facing=((s.x-t.x)*Math.cos(t.yaw)+(s.z-t.z)*Math.sin(t.yaw))/Math.max(eu,0.001);
    if((facing>0.55||(t.mirror&&facing<-0.55))&&los(s.x,s.z,t.x,t.z))return true;   // the mirror on the back of the head watches behind
  }
  return false;
}
function mpTouching(T,s){for(const t of T)if(!t.inSafe&&(!F.archive||t.y<.84)&&Math.hypot(s.x-t.x,s.z-t.z)<0.5)return t;return null}
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
  P.x=f.rx;P.z=f.rz;P.y=F.archive||F.forestRoutes?f.ry:0;P.crouched=f.crouched;P.crouchBlend=Number(!!f.crouched);P.yaw=f.ryaw;P.pitch=f.rpitch*0.6;P.fuel=f.fu;P.inSafe=f.safe;
  if(Math.floor(P.x)!==P.tx||Math.floor(P.z)!==P.ty)onTileChange();
}
function mpCycle(){const L=mpAlive();if(L.length<2)return;const i=L.findIndex(p=>p.id===MP.follow);MP.follow=L[(i+1)%L.length].id}
// flags packed into a[6] of the per-frame position message: 1 down, 2 safe, 4 run, 8 away, 16 mounted, 32 unseen,
// 64+128 wheel form, 256 fat, 512 pox, 1024 frozen, 2048 bobblehead, 4096 hedgehog, 8192/16384 curl (1 / 2), 32768 mirror on the back of the head, 65536 crouched, 131072 a baby
const mpPosFlags=()=>(P.down?1:0)|(P.inSafe||P.away||FX.frozen?2:0)|4|(P.away?8:0)|(P.mounted?16:0)|(P.unseen?32:0)|((wofForm()<4?wofForm():0)<<6)|(FX.fat>0?256:0)|(FX.pox>0?512:0)|(FX.frozen?1024:0)|(FX.bob>0?2048:0)|(FX.hedge>0?4096:0)|(FX.curl===1?8192:FX.curl===2?16384:0)|(R.mirror?32768:0)|(P.crouched?65536:0)|(FX.baby>0?131072:0);
const mpFresh=p=>performance.now()-(p.seen||0)<15000;
const mpShown=p=>MP.on&&p.run&&!p.away&&!p.unseen&&p.d===R.depth&&p.rx!==undefined&&state!=='title'&&mpFresh(p);
function sanctuaryPeers(floor){
  const now=performance.now(),room=floor.safe.room;
  const inMaze=(x,z)=>{
    if(!Number.isFinite(x)||!Number.isFinite(z)||x<0||z<0||x>=floor.W||z>=floor.mazeH)return false;
    const i=Math.floor(z)*floor.W+Math.floor(x);
    return floor.g[i]!==1&&!floor.pocketMask[i]&&
      !(Math.floor(x)===room.entrance.x&&z>=room.entrance.z+1);
  };
  const peers=[];
  for(const p of MP.peers.values()){
    if(!mpShown(p)||now-p.positionAt>=15000||!inMaze(p.x,p.z))continue;
    const smooth=inMaze(p.rx,p.rz);
    peers.push({name:p.name,hex:p.hex,down:p.down,x:smooth?p.rx:p.x,z:smooth?p.rz:p.z});
  }
  return peers;
}
function sendHubPresence(to){
  const {x,y,z,yaw,station,ride,ready}=hub.presence;
  mpSend({k:'hub',a:[r3(x),r3(y),r3(z),r3(wrapA(yaw))],station,ride,ready,deepest,look:playerLook},to);
}
function sendRunPresence(to){
  mpSend({k:'p',d:R.depth,a:[r3(P.x),r3(P.z),r3(P.y),r3(P.yaw),r3(P.pitch),Math.round(P.fuel),mpPosFlags(),P.hp,potFlags(),Math.round(P.web||0),P.ko>0?Math.ceil(P.ko):0,(P.slugs||[]).length],look:playerLook},to);
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
    p.crouchBlend=(p.crouchBlend||0)+(Number(!!p.crouched)-(p.crouchBlend||0))*k;
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
    sendRunPresence();
  }
  rvT-=raw;
  if(state==='room'&&rvT<=0&&MP.peers.size){rvT=0.1;const q=ROOMS.snap();if(q)mpSend({k:'rv',d:R.depth,w:ROOMS.kind,q})}
  if(MP.host&&state!=='trans'){
    MP.mt-=raw;
    if(MP.mt<=0){
      MP.mt=0.1;
      const a=[],ml=[],pv=[];
      for(const s of F.shades){
        if(s.type===3)continue;
        if(facingMoose(s))ml.push(a.length/6);
        a.push(r2(s.x),r2(s.z),r2(s.face||0),s.state|0,r2(Math.max(0,s.stun||0)),s.frozen?1:0);pv.push(s.pv|0);
      }
      const M=MIM;
      const moose=[...mooseLures].map(([id,l])=>[id,r2(l.x),r2(l.z),r2(l.yaw),l.hp]);
      mpSend({k:'m',d:R.depth,t:r2(R.time),b:F.blk|0,s:a,pv:pv.some(Boolean)?pv:undefined,hp:F.shades.some(q=>q.type!==3&&q.hpShow>0)?F.shades.filter(q=>q.type!==3).map(q=>q.hpShow>0&&q.hpMax>0?Math.max(1,Math.round(q.hp/q.hpMax*100)):0):undefined,moose,ml,mi:[r2(M.x),r2(M.z),r2(M.face),M.st,M.as,M.vic,r2(M.t)]});
    }
    // everyone is down: the run is over for the whole room
    if(P.down&&!mpAlive().length){mpSend({k:'wipe'});MP.wiping=true;die();MP.wiping=false}
  }
}
const appearanceColor=(look,field)=>field.colors[appearanceChoice(look,field)];
function playerHead(H,look,skin,cloak,cloakD,blink){
  const {face:shape,hair:hairStyle,hairColor,beard:facialHair,tattoo:ink}=appearanceField;
  const scales=shape.scales[appearanceChoice(look,shape)];
  const head=scales===shape.scales[0]?H:{p:H.p,R:H.R.map((value,i)=>value*scales[i%3])};
  const hair=appearanceChoice(look,hairStyle),color=appearanceColor(look,hairColor);
  face(head,{skin,blink,iris:[0.3,0.25,0.18],brow:color,browH:0.006,eyeS:1.1,ears:hair!==0,
    nose:[0.012,0.013,0.011],mouth:[0.6,0.32,0.3],mouthW:0.022});
  if(hair===0){
    ball(head,[-0.03,0.1,0],[0.088,0.1,0.094],cloak);
    ball(head,[-0.05,0.04,0],[0.07,0.07,0.09],cloakD,true);
  }else if(hair!==4){
    ball(head,[-0.024,0.111,0],[0.068,0.075,0.083],color);
    ball(head,[0.009,0.155,0],[0.071,0.037,0.082],color);
    if(hair===2){
      ball(head,[0.033,0.177,-0.018],[0.055,0.039,0.065],color);
      ball(head,[0.05,0.151,0.047],[0.022,0.033,0.027],color,true);
    }
    if(hair===3)for(const side of [-1,1]){
      for(let i=0;i<6;i++)ball(head,[0.007+0.005*(i%2),0.109-i*0.026,side*(0.073+0.004*(i%2))],
        [0.019,0.023,0.019],color,true);
      ball(head,[0.007,-0.027,side*0.075],[0.014,0.009,0.014],cloak,true);
    }
  }
  const beard=appearanceChoice(look,facialHair);
  if(beard===1)ball(head,[0.052,0.026,0],[0.029,0.021,0.056],color,true);
  if(beard===2||beard===3)for(const side of [-1,1]){
    seg(head,[0.089,0.047,0],[0.073,0.035,side*0.035],0.008,0.004,color);
  }
  if(beard===3)ball(head,[0.05,0.011,0],[0.039,0.038,0.061],color);
  if(beard===4)ball(head,[0.075,0.013,0],[0.019,0.027,0.026],color,true);
  const tattoo=appearanceChoice(look,ink),pigment=[0.045,0.16,0.18,1];
  if(tattoo===1){
    seg(head,[0.079,0.064,-0.039],[0.068,0.049,-0.05],0.003,0.0025,pigment);
    seg(head,[0.073,0.063,-0.049],[0.062,0.049,-0.058],0.003,0.0025,pigment);
  }
  if(tattoo===2)slab(head,[0.074,0.058,-0.044],[0.006,0.016,0.016],pigment,rX(Math.PI/4));
  if(tattoo===3)for(let i=0;i<3;i++)ball(head,[0.078-i*0.005,0.059,-0.036-i*0.009],0.0035,pigment,true);
}

// friends drawn in the maze, built from the same jointed parts as everyone else
function buildPlayer(p,t,rev,et){
  if(p.baby&&!rev)return buildBaby(p,t,false);
  if(p.hedge&&!rev)return buildHedgehog(p,t,false);
  if(p.form&&!rev)return buildCritter(p,t,p.form,false);
  rev=rev||0;et=et||0;
  const look=p.look||0,c=appearanceColor(look,appearanceField.cloak)||p.col;
  const cloak=[c[0]*0.72,c[1]*0.72,c[2]*0.72,2],cloakD=[c[0]*0.42,c[1]*0.42,c[2]*0.42,2];
  const leg=[0.22,0.17,0.13,2],boot=[0.3,0.19,0.1,3],belt=[0.3,0.17,0.08,3],skin=appearanceColor(look,appearanceField.skin),wood=[0.36,0.23,0.12,6],rag=[0.13,0.1,0.08,2];
  const S=AV,v=(x,y,z)=>[x*S,y*S,z*S],ph=hashStr(p.id)%100;
  const em=!rev&&p.emote&&!(p.ko>0)&&!(p.spd>0.6)?emotePose(p.emote.id,R.time-p.emote.t0):null;   // dancing (src/emotes.js)
  const crouch=rev?0:Math.max(p.crouchBlend||0,em?em.crouch:0),hipY=.45-.31*crouch;
  const mv=Math.min(1,p.spd/2.7),w=p.walk,sw=Math.sin(w)*mv,bob=Math.abs(Math.cos(w))*0.018*mv,breath=Math.sin(t*1.7+ph)*0.004;
  const B={p:[p.rx,Math.max(0,p.ry),p.rz],R:rYaw(p.ryaw)};
  if(p.ko>0&&!rev){B.p[1]=0.06;B.R=m3(B.R,rZ(1.45))}   // down: flat on their back
  if(em){B.p[1]+=em.lift;B.R=m3(B.R,m3(rYaw(em.turn),m3(rX(em.lean),rZ(-em.bend))))}
  // the dance-off: a groove while the round lasts, and a move for each arrow hit (lane 0 left, 1 down, 2 up, 3 right)
  const dz=p.dz&&R.time-p.dz.t<0.55?p.dz:null,dk=dz?Math.sin(Math.min(1,(R.time-dz.t)/0.55)*Math.PI)**0.6:0,dl=dz?dz.lane:-1,dancing=p.dz&&R.time-p.dz.t<3;
  if(dancing){B.p[1]+=Math.abs(Math.sin(R.time*7+ph))*0.02+(dl===2?0.07*dk:dl===1?-0.05*dk:0);B.R=m3(B.R,rX((dl===0?-0.22:dl===3?0.22:0)*dk+Math.sin(R.time*3.5+ph)*0.06))}
  for(const z of[-1,1]){
    const st=em?em.legs[z>0?1:0]:sw*z;
    const hip=v(0,hipY,z*.052),knee=v(.012+.09*st+.125*crouch,.25+.03*Math.max(0,st)-.11*crouch,z*.058),ank=v(.17*st,.05+.06*Math.max(0,-st),z*.062);
    seg(B,hip,knee,0.047*S,0.038*S,leg);ball(B,knee,0.04*S,leg,true);seg(B,knee,ank,0.04*S,0.03*S,boot);
    ball(B,[ank[0]+0.03,ank[1]-0.02,ank[2]],[0.062*S,0.03*S,0.036*S],boot,true);
  }
  const U=subF(B,v(0,hipY+bob,0),m3(rYaw(sw*0.12),rZ(-0.06*mv-.23*crouch)));
  ball(U,v(0,0.02,0),[0.075*S,0.06*S,0.09*S],cloakD);
  seg(U,v(0,-0.1,0),v(0,0.07,0),0.12*S,0.078*S,cloak);
  seg(U,v(0,0.045,0),v(0,0.075,0),0.083*S,0.081*S,belt);
  if(rev<=0)ball(U,v(0,0.17+breath,0),[0.066*S,0.115*S,0.09*S],cloak);
  if(p.fat&&rev<=0){ball(U,v(0.05,0.05,0),[0.15*S,0.15*S,0.17*S],cloak);ball(U,v(0.0,0.19+breath,0),[0.11*S,0.12*S,0.15*S],cloak);for(const z of[-1,1])ball(B,v(0,0.36,z*0.07),[0.08*S,0.1*S,0.07*S],cloakD)}   // 200 extra pounds
  else mimicMaw(U,v,S,rev,t,et,cloak);
  ball(U,v(-0.035,0.2+breath,0),[0.055*S,0.12*S,0.095*S],cloakD);
  const la=-sw*0.09;
  const mix=(a,b,k)=>a.map((q,i)=>q+(b[i]-q)*k);
  let LH=v(0.02+la,0.01,-0.115),LE=v(-0.01+la*0.6,0.11+breath,-0.135),W1=v(0.16,0.17+breath,0.12),RE=v(0.05,0.11+breath,0.15);
  if(em){const elb=(sh,h,zs)=>[(sh[0]+h[0])/2+0.03*S,(sh[1]+h[1])/2-0.03*S,(sh[2]+h[2])/2+zs*0.04*S];LH=v(...em.L);W1=v(...em.R);LE=elb(v(0,0.225,-0.1),LH,-1);RE=elb(v(0,0.225,0.1),W1,1)}
  if(dz){
    const L2=dl===0?v(0.02,0.4,-0.34):dl===2?v(0.03,0.52,-0.12):dl===1?v(0.16,0.12,-0.1):v(0.04,0.2,-0.2);
    const R2=dl===3?v(0.02,0.4,0.34):dl===2?v(0.03,0.52,0.12):dl===1?v(0.18,0.12,0.1):v(0.04,0.2,0.2);
    LH=mix(LH,L2,dk);W1=mix(W1,R2,dk);LE=mix(LE,[(0+LH[0])/2,(0.225*S+LH[1])/2,(-0.1*S+LH[2])/2-0.03*S],dk);RE=mix(RE,[(0+W1[0])/2,(0.225*S+W1[1])/2,(0.1*S+W1[2])/2+0.03*S],dk);
  }
  limb(U,v(0,0.225+breath,-0.1),LE,LH,0.03*S,0.027*S,0.023*S,cloak,cloak,skin,0.026*S);
  limb(U,v(0,0.225+breath,0.1),RE,W1,0.03*S,0.027*S,0.023*S,cloak,cloak,skin,0.026*S);
  if(p.weapon)wDrawHeldWeapon(t,p.weapon,subF(U,[LH[0]-0.2,LH[1]+0.16,LH[2]+0.16]),[0.2,-0.16,-0.16]);
  const tb=[W1[0]+0.004,W1[1]-0.05,W1[2]],tt=[W1[0]+0.03,W1[1]+0.13,W1[2]];
  seg(U,tb,tt,0.011,0.013,wood);ball(U,tt,[0.02,0.018,0.02],rag,true);
  seg(U,v(0,0.27+breath,0),v(0.003,0.31+breath,0),0.027*S,0.026*S,skin);
  const H=subF(U,v(0.003-0.03*rev,0.305+breath+0.02*rev,0),rev?m3(rZ(rev*1.05),rX(rev*0.35+Math.sin(t*23)*0.04*rev)):m3(rZ(clamp(p.rpitch,-0.6,0.6)*0.7),rYaw(em&&em.head||0)));
  const bk=p.bob?3:1,HS={p:H.p,R:H.R.map(q=>q*S*bk)};   // Bobblehead: the head grows from the neck and wobbles
  if(p.bob){const w=m3(rZ(Math.sin(t*6+ph)*0.25),rX(Math.sin(t*4.3+ph)*0.2));HS.R=m3(HS.R,w)}
  playerHead(HS,look,skin,cloak,cloakD,((t*0.23+ph*0.01)%1)<0.035?0.12:1);
  if(p.pox)for(let i=0;i<7;i++)ball(HS,[0.075+((i*3)%4)*0.004,0.03+((i*7)%9)*0.011,((i*5)%11-5)*0.011],0.007,[0.82,0.12,0.1,1],true);   // smallpox
  if(p.mirror)ball(HS,[-0.098,0.085,0],[0.012,0.046,0.046],[0.78,0.9,0.96,1],true);   // a small round mirror on the back of the head
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
    const q=buildPlayer(p,t).torch;crawlDrawPeer(p,t);
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
  const q=buildPlayer({id:M.as+'~',col,look:as?.look,rx:M.rx,ry:0,rz:M.rz,ryaw:M.rface,rpitch:0,spd:M.spd,walk:M.walk},t,rev,M.st===2?M.t:0);
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
  if(activeStation){
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
    const walking=activeStation&&/^Key[WASD]$/.test(e.code);
    const editing=e.target.matches('input[type=text]:not([readonly]), input[type=number], input[type=password]');
    if(!walking||editing)return;
  }
  if((state==='title'||activeStation)&&(e.code==='Tab'||e.target?.closest?.('button')&&(e.code==='Enter'||e.code==='Space')))return;
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
  if(e.code==='KeyJ'&&['title','play','room'].includes(state)){
    setCameraView(nextCameraView(cameraView));
    say(CAMERA_VIEWS[cameraView],1.4);
    return;
  }
  if(toggleSprint&&!activeStation&&['title','play','room'].includes(state)&&(e.code==='ShiftLeft'||e.code==='ShiftRight'))sprintLatched=!sprintLatched;
  keys[e.code]=true;
  initAudio();
  if(e.code==='KeyF'){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{})}
  if(e.code==='KeyV'&&!(state==='room'&&ROOMS.kind==='theater'))toggleMute();   // in the picture house V is your voice when there is no microphone
  if(e.code==='BracketRight')setBright(bright+0.15);
  if(e.code==='BracketLeft')setBright(bright-0.15);
  if(state==='title'){
    if(e.code==='KeyE'||e.code==='Enter'){e.preventDefault();hub.interact()}
  }
  else if(state==='play'&&P.hug&&['Space','KeyE','Enter'].includes(e.code)){grannyMash()}
  else if(state==='play'&&BS.dance&&danceKey(e.code)){}
  else if(state==='play'){
    if(e.code==='Space')P.jumpQ=MOVE.jumpBuffer;
    if(e.code==='KeyE')act(false);
    if(e.code==='KeyY')wCycle();
    if(e.code==='KeyU')slugPeel();
    if(e.code==='KeyQ')usePick();
    if(e.code==='KeyR')useMoose();
    if(e.code==='KeyG')useMoose(true);
    if(e.code==='KeyM'||e.code==='Tab')mapBig=!mapBig;
    if(/^Digit[1-6]$/.test(e.code)){const i=+e.code.slice(5)-1;if(i<POT.belt.length){POT.sel=i;POT.hudK='';sfx('pick')}}
    if(e.code==='KeyH')potDrink();
    if(e.code==='KeyI')invOpen();
    if(e.code==='KeyB')potThrow();
    if(e.code==='Escape'||e.code==='KeyP')pause();
    if(e.code==='KeyT')emoteNext();   // dance (chat is on Enter)
    if((e.code==='Enter'||e.code==='NumpadEnter')&&MP.on){e.preventDefault();chatOpenBox()}
  }else if(state==='room'){
    if((e.code==='KeyT'||roomMode!=='table'&&(e.code==='Enter'||e.code==='NumpadEnter'))&&MP.on){e.preventDefault();chatOpenBox()}
  }else if(state==='talk'&&talk&&talk.inv)invKey(e);
  else if(state==='talk'){
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
addEventListener('blur',()=>{const lobby=lobbyHadLock();freeInput();pause();if(lobby)lobbyPauseShow()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){const lobby=lobbyHadLock();sprintLatched=false;pause();if(lobby)lobbyPauseShow()}});
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
canvas.addEventListener('mousedown',e=>{if(loading)return;if(state==='room'&&!onMooseTable()&&e.button===0)mouseL=true;if(state!=='play'||document.pointerLockElement!==canvas)return;if(e.button===0){if(grannyMash())return;W.hold=true;clickL()}else if(e.button===2)clickR();else if(e.button===1){e.preventDefault();potThrow()}});
canvas.addEventListener('wheel',e=>{if(state==='play'&&document.pointerLockElement===canvas&&POT.belt.length>1){e.preventDefault();potSel(e.deltaY>0?1:-1)}},{passive:false});
addEventListener('mouseup',e=>{if(e.button===0){mouseL=false;W.hold=false}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('resumeBtn').addEventListener('click',()=>resume(true));
$('lobbyPause').addEventListener('click',()=>{initAudio();lobbyPauseHide(true)});
$('againBtn').addEventListener('click',()=>{startFromMenu();lock()});
// touch controls
const touch={on:false,mx:0,my:0,jump:false,crouch:false,stickId:null,lookId:null,tapId:null,sx:0,sy:0,lx:0,ly:0};
function enableTouch(){
  if(touch.on)return;touch.on=true;document.body.classList.add('touch');
  const upd=()=>{$('rotHint').textContent=innerHeight>innerWidth?'Turn your phone sideways for a wider view':''};
  upd();addEventListener('resize',upd);
}
if(window.matchMedia&&matchMedia('(pointer:coarse)').matches)enableTouch();
addEventListener('touchstart',()=>{enableTouch();if(state==='room')roomDevice='touch';initAudio()},{passive:true});
document.addEventListener('touchstart',()=>{if(P.hug)grannyMash()},{capture:true,passive:true});   // any tap struggles out of Granny's hug
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
  btn('tCrouch',()=>{touch.crouch=true},()=>{touch.crouch=false});
  btn('tFlash',()=>{
    touch.act=true;
    if(state==='play')act();
    else if(state==='title')hub.interact();
  },()=>{touch.act=false});
  btn('tPause',()=>{touch.jump=touch.crouch=false;endStick();touch.lookId=null;touch.tapId=null;ROOMS.untap();pause()});
  btn('tMap',()=>{mapBig=!mapBig});
  btn('tPick',()=>{usePick()});
  {const st=document.createElement('style');st.textContent='#tAtk{right:calc(210px + env(safe-area-inset-right));bottom:calc(26px + env(safe-area-inset-bottom));width:74px;height:74px;font-size:12px}body:not(.hasweapon) #tAtk{display:none}';document.head.appendChild(st);
   const b=document.createElement('div');b.id='tAtk';b.className='tbtn';b.textContent='ATTACK';$('touch').appendChild(b);btn('tAtk',()=>{touch.atk=true;wAttack()},()=>{touch.atk=false})}
  {const b=document.createElement('div');b.id='tInv';b.className='tbtn';b.textContent='BAG';$('touch').appendChild(b);btn('tInv',()=>{if(state==='play')invOpen();else if(talk&&talk.inv)closeTalk()})}
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
  pad.mx=pad.my=pad.lx=pad.ly=0;pad.sprint=false;pad.jump=false;pad.crouch=false;pad.roomButtons.length=0;
  const gp=pickPad();pad.gp=gp;
  if(!gp){if(pad.id){pad.id='';$('padLine').textContent='';pad.prev=[]}return}
  if(pad.id!==gp.id){pad.id=gp.id;initAudio();
    $('padLine').innerHTML='Controller connected. <b>Left stick</b> move · <b>Right stick</b> look · <b>A</b> jump · hold <b>D-pad ↓</b> to crouch · <b>RT</b> attack · <b>LB</b> flash · <b>X</b> talk · <b>LT</b> or click left stick to sprint · <b>Y</b> map · <b>RB</b> pickaxe · <b>Back</b> drink a potion · <b>B</b> throw it · <b>D-pad ← →</b> choose · <b>R3</b> inventory · <b>Start</b> pause';
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
  if(activeStation&&(state==='play'||state==='title')){
    pad.sprint=B(6)||state==='title'&&B(4);
    if(hit(1)||hit(8))closeStation();
    else if(hit(0)||hit(2)){
      const controls=stationControls();
      (controls.includes(document.activeElement)?document.activeElement:controls[0])?.click();
    }else if(hit(12)||hit(13)){
      if(!scrollNews(hit(12)?-90:90)){
        const controls=stationControls(),i=controls.indexOf(document.activeElement);
        controls[i<0?0:(i+(hit(12)?-1:1)+controls.length)%controls.length]?.focus();
      }
    }else if(hit(14)||hit(15))adjustStationControl(hit(14)?-1:1);
  }else if(state==='play'){
    if(archiveRun&&hit(8)){finishArchive();pad.prev[8]=true;return}
    if(P.hug&&(hit(0)||hit(2)||hit(7))){grannyMash();pad.prev=gp.buttons.map((_,i)=>B(i));return}
    pad.jump=B(0)&&performance.now()>padHold;
    pad.curl=FX.hedge>0&&B(4);pad.roll=FX.hedge>0&&B(11);   // the hedgehog borrows LB and the right stick click
    if(B(6))pad.sprint=true;
    if(hit(10))pad.sprintLatch=!pad.sprintLatch;
    if(Math.hypot(pad.mx,pad.my)<0.3)pad.sprintLatch=false;
    if(pad.sprintLatch)pad.sprint=true;
    if(hit(2)||hit(1)&&!POT.belt.length)act(false);
    if(hit(7))clickL();
    if(B(7)&&wHeld()&&!nearNpc&&!nearDoor)wAttack();
    if(hit(4)&&!(FX.hedge>0))useFlash();
    if(hit(1)&&POT.belt.length)potThrow();
    if(hit(8))potDrink();
    if(hit(11)&&!(FX.hedge>0))invOpen();
    if(hit(5))usePick();
    if(hit(12))useMoose();
    if(hit(13))pad.crouchStart=performance.now();
    if(B(13)&&pad.crouchStart!==undefined)pad.crouch=performance.now()-pad.crouchStart>=180;
    if(!B(13)&&pad.prev[13]&&pad.crouchStart!==undefined){
      if(performance.now()-pad.crouchStart<180)useMoose(true);
      pad.crouchStart=undefined;
    }
    if(hit(3)&&!slugPeel())mapBig=!mapBig;
    if(hit(9))pause();
    if(hit(14)){if(POT.belt.length)potSel(-1);else setBright(bright-0.15)}
    if(hit(15)){if(POT.belt.length)potSel(1);else setBright(bright+0.15)}
  }else if(state==='title'){
    pad.sprint=B(6)||B(4);
    if(hit(2)||hit(7)||hit(9))hub.interact();
  }
  else if(state==='room'&&archiveRun&&hit(8))finishArchive();
  else if(state==='talk'&&talk&&talk.inv)invPad(hit,gp);
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
function noise(dur,vol,freq,q,when){
  if(!ac)return;
  const t=ac.currentTime+(when||0),s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
  s.buffer=noiseBuf;s.loop=true;f.type='bandpass';f.frequency.value=freq;f.Q.value=q||1;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f);f.connect(g);g.connect(sfxBus);s.start(t,Math.random()*0.5);s.stop(t+dur+0.02);
}
function sfx(n){
  switch(n){
    case 'washFace':noise(0.7,0.19,1750,0.71);noise(0.17,0.13,2650,0.9,0.32);break;
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
const moveMul=()=>(P.chill>0?0.55:1)*((P.woozy||0)>0?0.7:1)*((P.fizz||0)>0.3?0.8:1)*(1+0.06*(up.boots|0))*wofSpeed()*potSpeed()*bossMoveMul()*webMul();
const potPhase=(x,z)=>x<0.6||z<0.6||x>F.W-0.6||z>F.H-0.6;
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
  if(floorLiftGate<1){
    floorLiftGate=Math.min(1,floorLiftGate+dt/liftGateTime);
    floorLift.setGate(floorLiftGate);
  }
  R.time+=dt;xrayTick(dt);guideTick(dt);mooseLureTick(dt);scoutTick(dt);
  // in a shared game the world keeps going while you pause or talk, but you stand still
  if(P.grab)mimicGrabTick(dt);
  const ctl=state==='play'&&!P.grab&&!GL.fall&&!(GL.rb&&!GL.rb.fwd)&&!FX.frozen&&FX.curl!==1&&!potHeld()&&!P.hug&&!BS.dance&&!danceFight()&&!(P.ko>0)&&!webLocked()&&!P.help;
  if(P.down)mpSpectate();
  else{
  // look and move: the shared movement system (src/movement.js), the same one the rooms use
  lookStep(P,dt,ctl?(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0)+pad.lx*MOVE.padTurn:0,ctl?pad.ly:0,MOVE.pitch);
  if(wallClip)wallClipTick(dt);
  else{
  const moon=FX.moon>0?-1:1;   // Moonwalk: forward is backward, left is right
  let fwd=moon*(ctl?((keys.KeyW||keys.ArrowUp)?1:0)-((keys.KeyS||keys.ArrowDown)?1:0)-pad.my-touch.my:0);
  const str=moon*(ctl?(keys.KeyD?1:0)-(keys.KeyA?1:0)+pad.mx+touch.mx:0);
  const fury=ctl&&ps('fury');if(fury&&Math.abs(fwd)<0.2&&Math.abs(str)<0.2)fwd=1;   // Fury Brew: you cannot stop running
  const J0=MOVE.jumpV,G0=MOVE.gravity,pvx=P.vx,pvz=P.vz;MOVE.jumpV=J0*potJump();MOVE.gravity=G0*potGrav();
  const normalBlock=ps('phase')?potPhase:blocked;
  const routes=F.forestRoutes;
  const groundAt=F.archive?(x,z)=>archiveGround(F.archive,x,z,P.y):
    routes?(x,z)=>forestGround(routes,x,z,P.y):undefined;
  const height=()=>ARCHIVE_BODY*(P.crouched?MOVE.crouchEye:1);
  const headroom=F.archive?(x,z)=>archiveHeadroom(F.archive,x,z,P.y,PR):
    routes?(x,z)=>forestRootAt(routes,x,z,PR)?ROOT_CLEARANCE:Infinity:null;
  const sceneryBlock=F.archive?(x,z)=>archiveBlocked(F.archive,x,z,P.y,height(),PR,P.y<=groundAt(P.x,P.z)):
    routes?(x,z)=>forestBlocked(routes,x,z,P.y,height(),PR):null;
  const wading=routes&&forestSubmerged(routes,P.x,P.z,P.y);
  const walkBlock=sceneryBlock?(x,z)=>normalBlock(x,z)||sceneryBlock(x,z):normalBlock;
  const slideBlock=sceneryBlock?(x,z)=>blocked(x,z)||sceneryBlock(x,z):blocked;
  const crouch=ctl&&!P.mounted&&(keys.ControlLeft||keys.ControlRight||keys.KeyX&&!FX.hedge||pad.crouch||touch.crouch);
  const ev=stepMove(P,dt,{fwd,str,fx:Math.cos(P.yaw),fz:Math.sin(P.yaw),ctl,crouch,
    jump:FX.fat<=0&&!(FX.baby>0)&&potJump()>0&&(keys.Space||pad.jump||touch.jump),sprint:!(FX.baby>0)&&!P.half&&!((P.web||0)>=50)&&(fury||keyboardSprint()||pad.sprint||Math.hypot(touch.mx,touch.my)>0.94)},
    {scale:1,speedMul:moveMul()*(P.mounted?1.25:1)*(wading?.49:1),lungs:up.lungs|0,blocked:walkBlock,groundAt,snap:F.archive?0.115:0,
      canStand:headroom?()=>P.y+ARCHIVE_BODY<=headroom(P.x,P.z):null,
      ceilingAt:headroom?(x,z)=>headroom(x,z)-height():null});
  MOVE.jumpV=J0;MOVE.gravity=G0;
  if(!F.archive&&P.y>0.62&&(potGrav()<1||potJump()>1)){P.y=0.62;if(P.vy>0)P.vy=0}
  if(ps('slick')&&ev.ground){const k=Math.min(1,1.4*dt),nvx=pvx+(P.vx-pvx)*k,nvz=pvz+(P.vz-pvz)*k,cx=P.x+(nvx-P.vx)*dt,cz=P.z+(nvz-P.vz)*dt;if(!slideBlock(cx,P.z))P.x=cx;if(!slideBlock(P.x,cz))P.z=cz;P.vx=nvx;P.vz=nvz}
  if(POT.slv){const q=POT.slv;q.t-=dt;const nx=P.x+q.vx*dt,nz=P.z+q.vz*dt;if(!slideBlock(nx,P.z))P.x=nx;if(!slideBlock(P.x,nz))P.z=nz;q.vx*=0.9;q.vz*=0.9;if(q.t<=0)POT.slv=null}
  if(ev.jumped)sfx('jump');
  const inWater=routes&&forestSubmerged(routes,P.x,P.z,P.y);
  if(inWater&&!P.inWater&&!ps('hush'))noise(.17,.12,690,.62);
  P.inWater=!!inWater;
  if((ev.landed>0||ev.step)&&!ps('hush')){if(inWater)noise(.12,.09,810,.65);else sfx('step');if(ps('loud'))tone(55,0.12,'sine',0.25)}
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
  potCollide();smithCollide();
  if(F.safe&&F.safe.wheel)for(const q of F.safe.wheel.discs){const ddx=P.x-q[0],ddz=P.z-q[1],dd=Math.hypot(ddx,ddz),m=q[2]+PR;if(dd<m&&dd>1e-4){const nx2=q[0]+ddx/dd*m,nz2=q[1]+ddz/dd*m;if(!blocked(nx2,nz2)){P.x=nx2;P.z=nz2}}}
  for(const n of F.npcs){if(n.fall)continue;const X=n.x+(n.ox||0),Z=n.z+(n.oz||0),ddx=P.x-X,ddz=P.z-Z,dd=Math.hypot(ddx,ddz),m=0.16+PR;if(dd<m&&dd>1e-4){const nx2=X+ddx/dd*m,nz2=Z+ddz/dd*m;if(!blocked(nx2,nz2)){P.x=nx2;P.z=nz2}}}
  if(wallClip){P.x=wallClip.hx;P.z=wallClip.hz;P.vx=P.vz=P.vy=0;P.y=0}
  if(Math.floor(P.x)!==P.tx||Math.floor(P.z)!==P.ty)onTileChange();
  if(activeStation==='lift'&&!aboardFloorLift())closeStation();
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
    nearNpc=best;nearDoor=nd;
    const lift=floorLiftInReach();
    if(state==='play'){
      const action=helpTarget()?'HELP':lift?'USE':best?'TALK':nd?'OPEN':'FLASH';
      if($('tFlash').textContent!==action)$('tFlash').textContent=action;
    }
    const pt=!best&&!nd&&state==='play'&&P.pick>0&&!P.down&&!P.away&&!P.grab?pkAim():null;
    const inRoots=underForestRoots(P.x,P.z,P.y,P.crouched);
    const low=!P.crouched&&(F.archive&&archiveLowOpening(F.archive,P.x,P.z,P.y,P.yaw)||
      F.forestRoutes&&forestRootAt(F.forestRoutes,P.x+Math.cos(P.yaw)*.39,P.z+Math.sin(P.yaw)*.39,PR));
    const crouchHint=touch.on?'Hold Crouch':pad.id?'Hold D-pad ↓ to crouch':'Hold X to crouch';
    if(state!=='room')setText('prompt',helpPrompt()||(F.boss&&!best&&!nd&&!lift&&bpPrompt()?bpPrompt():playerInArchiveCover()?(P.z>=2?'Hidden under the reading desk':'Hidden in the alcove'):inRoots?'Hidden under the roots':low?crouchHint:lift?(touch.on?'USE':pad.id?'X':'E')+': use lift controls':best?(touch.on?'TALK':pad.id?'X':'E')+': speak with '+NPC[best.type].name:nd?(touch.on?'OPEN':pad.id?'X':'E')+': open the strange door':pt?pt.ok?(touch.on?'PICK':pad.id?'RB':'Q')+': break through this wall':'This wall will not break':''));}
  if(P.fuel<20&&!lowFuelSaid){lowFuelSaid=true;say(P.fuel<=0?'Your torch is out':'Your torch is guttering. Find oil.',3)}
  if(P.inv>0)P.inv-=dt;
  if(P.chill>0){P.chill-=dt;$('chill').style.opacity=clamp(P.chill/1.2,0,1)}else if(P.chill<0||P.chill===0&&$('chill').style.opacity!=='0'){P.chill=0;$('chill').style.opacity='0'}
  if(flashT>0)flashT=Math.max(0,flashT-dt*1.6);
  // pickups
  for(const it of F.items){
    if(it.got||P.y<-0.2||F.archive&&Math.abs(P.y-(it.y||0))>.72)continue;
    const dx=it.x-P.x,dz=it.z-P.z;
    if(dx*dx+dz*dz<0.2)collect(it);
  }
  // exit
  sealMsgT-=dt;
  if(Math.hypot(F.exit.x-P.x,F.exit.z-P.z)<0.42&&P.y>-0.2){
    if(P.shards>=3){mpSend({k:'down',d:R.depth+1});descend();return}
    if(sealMsgT<=0&&F.boss){sealMsgT=3;say(`The seal holds while ${BOSSES[F.boss.i].name} lives.`,2.5);sfx('seal')}
    else if(sealMsgT<=0){sealMsgT=3;const n=3-P.shards;say(`The seal holds. ${n} shard${n>1?'s':''} to go.`,2.5);sfx('seal')}
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
      if(P.inv<=0&&!P.away&&!P.mounted&&P.y<0.22&&P.y>-0.2&&Math.abs(tr.x-P.x)<0.42&&Math.abs(tr.z-P.z)<0.42){if(ps('bouncy')){P.vy=4.2;P.y=0.001;P.inv=1;tone(300,0.2,'sine',0.15,0,400)}else hurt(null);if(state==='dead')return}
    }else tr.up=false;
  }
  } // end of the living player's turn
  wofTick(dt);if(state==='dead')return;
  potTick(dt);if(state==='dead')return;
  wTick(dt);if(!MP.guest)wMonTick(dt);bossClientTick(dt);if(state==='dead')return;fizzPlayerTick(dt);grannyPlayerTick(dt);crawlPlayerTick(dt);trollClientTick(dt);emoteTick(dt);grannyVoiceTick(dt);
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
  const archiveTargets=F.archive&&TG?TG.filter(t=>!t.inSafe&&t.y<.84):null;
  const archiveDist=archiveTargets?mpDist(archiveTargets,true):null;
  if(TG)potPowers(dt,TG);
  for(const s of F.shades){
    if(s.dead||s.down>0){s.x=s.z=-99;s.state=0;s.vis=false;continue}
    if(s.type<4)rememberMob(s.type,s);
    else if(s.type===LIBRARIAN)rememberMob('librarian',s);
    s.ph+=dt*3;
    if(s.type===3){if(!P.down&&!followMoose(s,dt,1.9)){watcher(s,dt,pfx,pfz);if(state==='dead')return}continue}
    const cx=Math.floor(s.x),cz=Math.floor(s.z);
    const dl=F.dist[cz*F.W+cx];
    if(MP.guest){
      mpFollowShade(s,dt);
      s.think=(s.think||0)-dt;
      if(s.think<=0){s.think=0.2;s.vis=Math.hypot(s.x-P.x,s.z-P.z)<9&&los(s.x,s.z,P.x,P.z)}
      if(s.stun<=0&&s.state===1&&dl>=0&&dl<=14&&(s.type===0||s.type===LIBRARIAN&&dl<=11||(s.type===1&&!s.frozen&&dl<=8))){chasing++;if(dl<nearest)nearest=dl;
        if(s.type===1){s.snd=(s.snd||0)-dt;if(s.snd<=0){s.snd=0.45;sfx('scrape')}}}
      continue;
    }
    if(s.type===6){if(s.role==='add'&&potMon(s,dt,TG,MD))continue;bossTick(s,dt,TG);if(state==='dead')return;continue}
    if(s.type===8&&(s.pool||s.ride)){if(s.ride)slugRideCheck(s);s.x=s.z=-99;continue}
    if(potMon(s,dt,TG,MD)){s.gx=Math.floor(s.x);s.gy=Math.floor(s.z);s.px=-1;continue}
    if(s.stun>0){s.stun-=dt;if(s.type>=4&&s.state>1)s.state=1;continue}
    if(s.type===4){fizzTick(s,dt,TG,MD);continue}
    if(s.type===5){grannyTick(s,dt,TG,MD);continue}
    if(s.type===10){spiderTick(s,dt,TG,MD);continue}
    if(s.type===8){slugTick(s,dt,TG,MD);continue}
    if(s.type===9){trollTick(s,dt,TG,MD);continue}
    if(followMoose(s,dt,s.type===1?3.15:2.95)){s.frozen=false;continue}
    const librarian=s.type===LIBRARIAN;
    const targets=librarian?archiveTargets:TG,distances=librarian?archiveDist:MD;
    const d=distances[cz*F.W+cx];s.d=d;
    const T=mpNearest(targets,s.x,s.z);
    if(librarian&&!T&&s.state===1){s.state=0;s.think=0}
    const eu=T?Math.hypot(s.x-T.x,s.z-T.z):99, tDark=!!T&&T.fuel<=0;
    const chaseSpeed=Math.min(2.95+R.depth*0.06,3.6)+(tDark?0.35:0);
    s.think-=dt;
    if(s.think<=0){
      s.think=0.2;
      const tv=!!T&&eu<9&&los(s.x,s.z,T.x,T.z);
      s.vis=T&&T.loc?tv:!P.down&&Math.hypot(s.x-P.x,s.z-P.z)<9&&los(s.x,s.z,P.x,P.z);
      const sk=T?potSk(T):1;   // potions change how far away you are noticed
      if(s.type===0){
        if(s.state===0){if((d>=0&&d<=8*sk&&tv)||(d>=0&&d<=2*sk)||(tDark&&d>=0&&d<=12*sk)){s.state=1;if(dl>=0&&dl<=14&&!(s.pe&&s.pe.hush))sfx('growl')}}
        else if(d<0||d>14||sk===0&&d>1)s.state=0;
      }else if(librarian){
        if(!s.state&&tv&&d>=0&&d<=8*sk){
          s.state=1;
          if(dl>=0&&dl<=11&&!(s.pe&&s.pe.hush))sfx('scrape');
        }else if(!T||d<0||d>11||sk===0)s.state=0;
      }else if(s.type===1)s.state=(d>=0&&d<=45*Math.min(1,sk))?1:0;
      else{if(s.state===0){if(d>=0&&d<=9*sk)s.state=1}else if(d<0||d>13||sk===0&&d>1)s.state=0}
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
      if(dl>=0&&dl<=8){chasing++;if(dl<nearest)nearest=dl;s.snd-=dt;if(s.snd<=0){s.snd=0.45;if(!(s.pe&&s.pe.hush))sfx('scrape')}}
    }else if(librarian){
      sp=s.state===1?3.25:1.15;
      if(s.state===1&&dl>=0&&dl<=11){chasing++;nearest=Math.min(nearest,dl)}
    }else sp=s.state===1?2.95:1.4;
    let gx=s.gx+0.5,gz=s.gy+0.5;
    const direct=!!T&&s.state===1&&d>=0&&d<=1&&!T.inSafe&&(!librarian||!archiveMobBlocked(F.archive,T.x,T.z))&&
      (!F.forestRoutes||!forestRootTile(F.forestRoutes,T.tx,T.ty));
    if(direct){gx=T.x;gz=T.z;s.gx=cx;s.gy=cz}
    const dx=gx-s.x,dz=gz-s.z,l=Math.hypot(dx,dz),step=sp*dt*(s.pmul||1);
    if(l<=step+0.001){
      s.x=gx;s.z=gz;
      if(!direct){
        const opts=[];let bestN=null,bestD=d<0?1e9:d;
        for(const k of DIRS){
          const nx2=cx+k[0],ny2=cz+k[1];
          if(nx2<0||ny2<0||nx2>=F.W||ny2>=F.H||F.g[ny2*F.W+nx2]||F.safeMask[ny2*F.W+nx2]||F.pocketMask[ny2*F.W+nx2])continue;
          if(inArchiveAlcove(nx2+.5,ny2+.5)||librarian&&archiveMobBlocked(F.archive,nx2+.5,ny2+.5)||
            F.forestRoutes&&forestRootTile(F.forestRoutes,nx2,ny2))continue;
          const nd=distances[ny2*F.W+nx2];
          if(nd>=0&&nd<bestD){bestD=nd;bestN=[nx2,ny2]}
          if(!(nx2===s.px&&ny2===s.py))opts.push([nx2,ny2]);
        }
        let next=null;
        if(s.state===1)next=bestN;
        else next=opts.length?opts[(Math.random()*opts.length)|0]:(s.px>=0?[s.px,s.py]:null);
        if(next){s.px=cx;s.py=cz;s.gx=next[0];s.gy=next[1]}
      }
    }else{s.x+=dx/l*step;s.z+=dz/l*step;s.face=Math.atan2(dz,dx)}
    const hitT=mpTouching(targets,s);
    if(hitT&&!potTouch(s,hitT)){
      if(s.type===2){
        // a wisp drinks some of the torch and flits away
        if(hitT.loc){P.fuel=Math.max(0,P.fuel-22);sfx('drain');say('A wisp drinks your flame',2)}else mpHit(hitT,'drain');
        for(let tries=0;tries<60;tries++){
          const rx=1+(Math.random()*(F.W-2)|0),ry=1+(Math.random()*(F.H-2)|0),rd=MD[ry*F.W+rx];
          if(F.g[ry*F.W+rx]===0&&!F.safeMask[ry*F.W+rx]&&!F.pocketMask[ry*F.W+rx]&&!inArchiveAlcove(rx+0.5,ry+0.5)&&(rd>10||(tries>40&&rd>4))){s.x=rx+0.5;s.z=ry+0.5;s.gx=rx;s.gy=ry;s.px=-1;break}
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
  if(!F||P.away||!F.npcs||playerInArchiveCover()||underForestRoots(P.x,P.z,P.y,P.crouched)||F.archive&&P.y>.84)return;
  for(const n of F.npcs){
    if(n.type!=='lurk'||n.x<0)continue;
    const r=lurkStep(n,dt,{x:P.x,z:P.z,yaw:P.yaw,down:!!P.down||state!=='play'},{
      los:(x,z)=>los(P.x,P.z,x,z),
      open:(x,z)=>x>0&&z>0&&x<F.W-1&&z<F.H-1&&F.g[z*F.W+x]===0&&!F.safeMask[z*F.W+x]&&!F.pocketMask[z*F.W+x]&&!inArchiveAlcove(x+0.5,z+0.5)&&(!F.forestRoutes||!forestRootTile(F.forestRoutes,x,z)),
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
let composer=null,fxaaPass=null,bloomPass=null,gtaoPass=null,viewKey='',torchShadowAt=-1;
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
    // creatures and NPCs stay out of the ambient-occlusion pass: their thin, layered parts read as deep crevices and the pass
    // darkened whole fronts of them (the Fizzler's label went black at high quality)
    gtaoPass.overrideVisibility=function(){ov();sprMesh.visible=false;charMesh.visible=false};
    // Ambient occlusion was the single biggest cost of a maze frame: a second full-resolution pass over the whole scene for normals and
    // depth, the AO itself, a denoise, then a full-screen copy of the picture just to multiply the AO onto it. Now its buffers are half
    // the size (a quarter of the pixels; AO is soft anyway and the denoise hides the difference), and it multiplies straight onto the
    // picture already there instead of copying it first.
    {const size0=gtaoPass.setSize.bind(gtaoPass),render0=gtaoPass.render.bind(gtaoPass);
      gtaoPass.output=GTAOPass.OUTPUT.Off;gtaoPass.needsSwap=false;
      gtaoPass.setSize=(w,h)=>size0(Math.max(1,Math.ceil(w/2)),Math.max(1,Math.ceil(h/2)));
      gtaoPass.render=(r,write,read,dt,mask)=>{render0(r,write,read,dt,mask);const m=gtaoPass.blendMaterial;
        m.uniforms.intensity.value=gtaoPass.blendIntensity;m.uniforms.tDiffuse.value=gtaoPass.pdRenderTarget.texture;gtaoPass.renderPass(r,m,read)}}
    composer.addPass(gtaoPass);
  }
  bloomPass=new UnrealBloomPass(new THREE.Vector2(4,4),0.5,0.55,1.0);composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  fxaaPass=new ShaderPass(FXAAShader);composer.addPass(fxaaPass);
}
const rendererSize=new THREE.Vector2();
function resize(){
  const {width:w,height:h,pixelRatio:pr}=gameViewport(rs);
  const key=w+'x'+h+'@'+pr.toFixed(3);if(key===viewKey)return;viewKey=key;
  renderer.getSize(rendererSize);
  if(rendererSize.x!==w||rendererSize.y!==h||renderer.getPixelRatio()!==pr)renderer.setDrawingBufferSize(w,h,pr);
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
const cabinLampColor=new THREE.Color(liftCabinLamps.color).toArray();
const mazeView=cameraViewRig(),mazeViewDirection=new THREE.Vector3(),mazeViewEye=new THREE.Vector3();
let mazeExternalView=false;
function mazeCameraCeiling(x,y,z){
  if(F.archive)return archiveHeadroom(F.archive,x,z,y,0.08)-0.09;
  if(F.forest)return F.forestRoutes&&forestRootAt(F.forestRoutes,x,z,0.08)?ROOT_CLEARANCE-0.09:Infinity;
  return CAM_TOP;
}

function mazeCameraClearance(origin,direction,distance){
  for(let d=0.04;d<=distance+0.04;d+=0.04){
    const x=origin.x+direction.x*d,y=origin.y+direction.y*d,z=origin.z+direction.z*d;
    const ground=F.forestRoutes?forestGround(F.forestRoutes,x,z,y):0;
    if(y<ground+0.08||y>mazeCameraCeiling(x,y,z)+1e-6||blocked(x,z)||
      F.archive&&archiveBlocked(F.archive,x,z,y-0.07,0.14,0.08,false)||
      F.forestRoutes&&forestBlocked(F.forestRoutes,x,z,y-0.07,0.14,0.08))return Math.max(0,d-0.08);
  }
  return distance;
}

function localAvatarPose(){
  const id=MP.on?MP.id:'me';
  return {id,col:localPlayerColor(),look:playerLook,rx:0,ry:0,rz:0,ryaw:0,rpitch:0,spd:0,walk:0};
}

function buildLocalAvatar(){
  const pose=localAvatarPose();
  const avatar=exhibitModel(time=>buildPlayer(pose,time),true);
  avatar.name='Local player';
  avatar.userData.cam=true;
  avatar.frustumCulled=false;
  // Keep the same vertex colors readable in rooms lit by custom shaders.
  avatar.material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight += diffuseColor.rgb * 0.08;\n#include <opaque_fragment>');
  };
  const animate=avatar.userData.pose;
  avatar.userData.pose=(time,body,yaw,pitch,eye)=>{
    pose.id=MP.on?MP.id:'me';
    pose.col=localPlayerColor();
    pose.look=playerLook;
    pose.crouchBlend=body.crouchBlend;
    pose.rpitch=pitch;
    pose.spd=Math.hypot(body.vx,body.vz)*EYE/eye;
    pose.walk=body.bob;
    avatar.position.set(body.x,body.y,body.z);
    avatar.rotation.y=Math.PI/2-yaw;
    avatar.scale.setScalar(eye/EYE);
    animate(time,0);
  };
  return avatar;
}

const mazeAvatar=()=>Object.assign(localAvatarPose(),{
  rx:P.x,ry:P.y+(P.mounted?0.35:0),rz:P.z,ryaw:P.yaw,rpitch:P.pitch,
  spd:Math.hypot(P.vx,P.vz),walk:P.bob,form:wofForm(),fat:FX.fat>0,pox:FX.pox>0,bob:FX.bob>0,curl:FX.curl,
  weapon:wHeld(),mirror:R.mirror,crouchBlend:P.crouchBlend,baby:FX.baby>0,emote:EMO.id!=null?{id:EMO.id,t0:EMO.t0}:null,
});

function render(t){
  resize();
  if(!F){renderer.clear();return}
  UT.value=t;
  const title=state==='title';
  const DC=title?null:danceCam(),SC=STUDIO&&STUDIO.cam||DC;
  const yaw=SC?SC.yaw:P.yaw, pitch=SC?SC.pitch:title?0:P.pitch;
  const riding=P.mounted&&!P.down&&!P.away;
  const ex=SC?SC.x:P.x,ez=SC?SC.z:P.z;
  const ey=SC?SC.y:title?EYE:playerEye(riding?.16:0);
  sanctuaryDisplay.update(F,R.depth,!title&&!STUDIO,ex,ez,t,sanctuaryPeers);
  {const cp=Math.cos(pitch);camera.position.set(ex,ey,ez);camera.lookAt(ex+cp*Math.cos(yaw),ey+Math.sin(pitch),ez+cp*Math.sin(yaw))}
  const viewAllowed=!SC&&!title&&state!=='dead'&&!P.down&&!P.away&&!P.hug&&!P.ko&&!P.eaten&&!GL.fall;
  const viewNow=cameraView==='first'&&EMO.id!=null?'second':cameraView;   // a dance in first person turns the camera round to watch it
  mazeExternalView=viewAllowed&&viewNow!=='first'&&mazeView.place(camera,viewNow,EYE-crouchOffset(P,EYE),
    mazeCameraClearance,mazeCameraCeiling(ex,ey,ez));
  if(FX.flyT>0&&!title){const k=Math.min(1,FX.flyT/1.2);camera.rotateZ(Math.sin(t*FX.spin)*0.5*k);camera.rotateX(Math.cos(t*FX.spin*0.7)*0.25*k)}   // tumbling through the air
  if(FX.bob>0&&!title){camera.rotateZ(Math.sin(t*2.3)*0.06);camera.rotateX(Math.sin(t*1.7)*0.03)}
  if(P.ko>0&&!title&&!P.down){camera.position.y-=EYE*0.72;camera.rotateZ(0.5)}
  if(P.half&&!(P.ko>0)&&!title&&!P.down)camera.position.y-=Math.max(0,Math.sin((CRAWL.limp||0)*6))*0.06;   // the limp   // down: on the floor, the world on its side
  if(P.woozy>0&&!title&&!P.down){const k=Math.min(1,P.woozy/1.5);camera.rotateZ(Math.sin(t*1.6)*0.14*k);camera.rotateX(Math.sin(t*1.05)*0.05*k)}   // Granny's perfume
  if(FX.tickled>0&&!title){const k=0.025;camera.position.x+=(Math.random()-0.5)*k;camera.position.y+=(Math.random()-0.5)*k;camera.position.z+=(Math.random()-0.5)*k}
  if(pkShake>0){const k=0.05*pkShake;camera.position.x+=(Math.random()-0.5)*k;camera.position.y+=(Math.random()-0.5)*k;camera.position.z+=(Math.random()-0.5)*k;pkShake=Math.max(0,pkShake-0.03)}
  if(P.grab){const k=0.012+0.02*Math.min(1,P.grab.t);camera.position.x+=(Math.random()-0.5)*k;camera.position.y+=(Math.random()-0.5)*k;camera.position.z+=(Math.random()-0.5)*k}
  if(POT.dom){
    const marker=POT.dom.xh;
    if(mazeExternalView&&cameraView==='third'&&wHeld()){
      const range=mazeCameraClearance(mazeViewEye.set(ex,ey,ez),mazeViewDirection.set(Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),Math.cos(pitch)*Math.sin(yaw)),5);
      // The marker follows the player's sightline at the first wall or at weapon range.
      camera.updateMatrixWorld();
      mazeView.aimMarker(marker,camera,Math.max(range,0.6));
    }else{marker.style.left='';marker.style.top=''}
  }
  scene.background=F.forest?forestSky:null;
  if(forestGrp)FOREST.focus(forestGrp,ex,ez);
  const B=F.biome;
  const fwx=Math.cos(yaw),fwz=Math.sin(yaw),rx=-fwz,rz=fwx;
  const viewing=mazeExternalView?camera.getWorldDirection(mazeViewDirection):null;
  const vwx=viewing?.x??fwx,vwz=viewing?.z??fwz;
  const flick=1+Math.sin(t*11)*0.02+Math.sin(t*23.7)*0.015+Math.sin(t*5.3)*0.02;
  const torchR=torchRadius()*flick;
  // the torch is held low in the right hand, so shadows swing as you turn
  const L={ex,ey,ez,B,torchR,tx:ex+rx*0.2+fwx*0.04,ty:ey-0.14,tz:ez+rz*0.2+fwz*0.04};
  if(solidAt(L.tx,L.tz)){L.tx=ex;L.tz=ez}
  {const pl=F.back?0.05+0.95*panelLvl:1;
    const aK=F.ambK||1;
    const aT=F.ambT||[1,1,1],a0=B.amb[0]*aK*aT[0],a1=B.amb[1]*aK*aT[1],a2=B.amb[2]*aK*aT[2];
    L.amb=F.dark?AMB_ZERO:F.back?[a0*pl,a1*pl,a2*pl]:[a0,a1,a2];
    L.fog=[a0*2.2*pl,a1*2.2*pl,a2*2.2*pl];scene.fog.density=0.062*(F.fogK||1)*(ps('cat')?0.6:1);
    if(F.forest){
      L.amb=[a0+.004,a1+.008,a2+.013];
      L.fog=[a0+.006,a1+.014,a2+.026];
      scene.fog.density=.076*(F.fogK||1);
    }
    {const ak=F.back?2.5:LK.amb;ambLight.color.setRGB(L.amb[0]*ak,L.amb[1]*ak,L.amb[2]*ak)}
    scene.fog.color.setRGB(L.fog[0],L.fog[1],L.fog[2]);
    if(scene.environment)scene.environmentIntensity=F.dark?0.01:F.back?0.3*pl:F.forest?0.012:LK.env;}
  torchLight.position.set(L.tx,L.ty,L.tz);
  // The torch's shadow is a cube map: six extra passes over the scene. Redrawing it up to ~45 times a second instead of every frame
  // halves that at 60 fps or more and changes nothing you can see (at 30 fps it is still every frame). Anything else that draws the
  // scene (warm-ups, the landing frame) keeps the normal every-frame update.
  const torchShadowDue=t-torchShadowAt>=0.021||t<torchShadowAt;if(torchShadowDue)torchShadowAt=t;
  torchLight.shadow.autoUpdate=torchShadowDue;
  {const tt=F.torchT||[1,1,1];torchLight.color.setRGB(B.torch[0]*tt[0],B.torch[1]*tt[1],B.torch[2]*tt[2])}
  torchLight.distance=torchR*1.2;
  torchLight.intensity=LK.torch*flick*(0.3+0.7*torchR/7.6)*(F.back?0.5:1);
  flashLight.position.set(ex,ey,ez);flashLight.intensity=flashT*LK.flash;
  // nearest coloured lights: [dist2, x,y,z, colour, strength, radius]
  const lights=[];
  if(F.forestRoutes){
    const c=F.forestRoutes.creek;
    for(const z of [c.z0+1.45,c.z1-1.38]){
      const d=(c.mid-ex)**2+(z-ez)**2;
      if(d<100)lights.push([d-3,c.mid,1.12,z,[.38,.65,.73],1.06,4.5]);
    }
  }
  if(F.archive)for(const l of F.archive.lamps){
    const d=(l.x-ex)**2+(l.z-ez)**2;
    if(d<125)lights.push([d-8,l.x,l.y-0.11,l.z,[1.0,0.69,0.37],2.2,6]);
  }
  if(F.lift&&floorLift.model.visible){
    const {x,z,fx,fz}=F.lift,ahead=(landingMazeZ-liftMouthLamp.z)*liftScale;
    const lx=x+fx*ahead,lz=z+fz*ahead,d=(lx-ex)**2+(lz-ez)**2;
    if(d<36)lights.push([d-5,lx,liftMouthLamp.y*liftScale,lz,[1,0.67,0.41],2.3,3.5]);
    const cabin=(landingMazeZ-liftCabinLamps.z)*liftScale;
    for(const side of liftCabinLamps.sides){
      const cx=x+fx*cabin-fz*side*liftScale,cz=z+fz*cabin+fx*side*liftScale;
      const distance=(cx-ex)**2+(cz-ez)**2;
      if(distance<12)lights.push([distance-4,cx,liftCabinLamps.y*liftScale,cz,cabinLampColor,3.2,3.7]);
    }
  }
  for(const it of F.items){if(it.got||it.type==='chest'||it.type==='ingr')continue;const d=(it.x-ex)**2+(it.z-ez)**2;if(d<140)lights.push([d,it.x,.45+(it.y||0),it.z,ITEM[it.type].col,it.type==='gem'?0.5:1.0,2.6])}
  const open=P.shards>=3&&!title;
  const exCol=open?[0.4,1.0,0.6]:[1.0,0.2,0.15];
  lights.push([(F.exit.x-ex)**2+(F.exit.z-ez)**2-4,F.exit.x,0.5,F.exit.z,exCol,1.5,3.2]);
  for(const s of F.shades)if(s.type===2||s.pv&32){const d=(s.x-ex)**2+(s.z-ez)**2;if(d<140)lights.push([d,s.x,0.55,s.z,s.type===2?[0.35,0.6,1.0]:[1,0.9,0.55],1.3,3.0])}
  // the Fizzler's label catches a little light from the side you see it from, so it reads even in the dark (and on low quality, where nothing glows)
  for(const s of F.shades)if(s.type===4&&s.x>0){const d=(s.x-ex)**2+(s.z-ez)**2,l=Math.sqrt(d)||1;if(d<120)lights.push([d+1,s.x+(ex-s.x)/l*0.6,0.55,s.z+(ez-s.z)/l*0.6,[1,0.92,0.8],0.9,1.6])}
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
  const room=F.safe?.room;
  if(room&&Math.hypot(room.mapX-ex,room.back-ez)<12)
    lights.push([-3,room.mapX,1.7,room.back-0.52,[0.52,0.87,0.79],0.95,4.8]);
  for(const n of F.npcs){if(n.type==='keeper')continue;const d=(n.x-ex)**2+(n.z-ez)**2;if(d<140)lights.push([d-3,n.x,n.type==='delver'?0.5:0.95,n.z,[1.0,0.85,0.6],0.75,2.8])}
  if(GD.have&&guideOn()&&!title){const gd=(GD.x-ex)**2+(GD.z-ez)**2;lights.push([gd-10,GD.x,0.65,GD.z,[1.0,0.93,0.8],1.9,6.5])}
  bossLights(lights,ex,ez);mpLights(lights,ex,ez,B);
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
    const y=(it.y||0)+0.44+Math.sin(t*2.2+it.ph)*0.05,c=ITEM[it.type].col,sh=it.type==='shard';
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
    if(o.cauldron)potCauldronFx(o.cauldron,t);
    if(o.anvil)smithFx(o.anvil,t);
    if(!lurk&&!n.used&&n.type!=='keeper'){const y=o.top+0.08+Math.sin(t*3+n.ph)*0.03,X=n.x+(n.ox||0),Z=n.z+(n.oz||0);spr(X,y,Z,0.08,0.08,7,1.0,0.85,0.4,1,1);spr(X,y,Z,0.32,0.32,7,1.0,0.7,0.2,0.3,1)}
  }
  wofDraw(t,ex,ey,ez,dtR);}
  if(mazeExternalView){
    const q=buildPlayer(mazeAvatar(),t).torch;
    if(P.fuel>0){spr(q[0],q[1]+0.02,q[2],0.07,0.12,11,1.0,0.6,0.2,1,1);spr(q[0],q[1],q[2],0.5,0.5,7,1.0,0.5,0.15,0.25,1)}
  }
  if(DC)danceSelf(t);drawMoose(t,title||!!STUDIO);drawScout(t,title||!!STUDIO);mpDrawPlayers(t,ex,ez,vwx,vwz);mimicDraw(t,ex,ez);glDraw(t,ex,ez,vwx,vwz);
  if(F.safe&&(F.safe.x-ex)**2+(F.safe.z-ez)**2<22*22){
    const fl=F.safe.fl||1,X=F.safe.x,Z=F.safe.z;
    spr(X,0.72,Z,0.42*fl,0.62*fl,11,1.0,0.55,0.16,1,1);
    spr(X+Math.sin(t*5.1)*0.05,0.66,Z+Math.cos(t*4.3)*0.05,0.3,0.42,11,1.0,0.75,0.3,0.9,1);
    spr(X,0.75,Z,1.9,1.9,7,1.0,0.42,0.1,0.32*fl,1);
    for(let i=0;i<4;i++){const a=((t*0.35+i*0.25)%1);spr(X+Math.sin(i*2.4+t)*0.12*a,0.8+a*0.9,Z+Math.cos(i*1.7+t)*0.12*a,0.025,0.025,7,1.0,0.6,0.2,1-a,1)}
  }
  for(const s of F.shades){
    const d2=(s.x-ex)**2+(s.z-ez)**2;if(d2>18*18)continue;
    if((s.x-ex)*vwx+(s.z-ez)*vwz<-1.5)continue;
    if(s.pv&&potMonPre(s,t))continue;
    if(s.type===2){if(s.pv)potMonPost(s,CH.n,sprList.length,t);continue}
    const pn0=CH.n,ps0=sprList.length;
    if(s.type===3){const e=buildWatcher(s,t,ex,ez);if(F.blk===2)for(const q of e)spr(q[0],q[1],q[2],0.045,0.045,7,0.95,0.92,0.8,1,1)}
    else if(s.type===6)bossDraw(s,t,ex,ez);
    else if(s.type===4)buildFizz(s,t,ex,ez);
    else if(s.type===5)buildGranny(s,t,ex,ez);
    else if(s.type===LIBRARIAN)buildLibrarian(s,t);
    else if(s.type===10)buildSpider(s,t,ex,ez);
    else if(s.type===8)buildSlug(s,t,ex,ez);
    else if(s.type===9)buildTroll(s,t,ex,ez);
    else if(s.type===1)buildStalker(s,t,ex,ez);
    else{
      const o=buildShade(s,t,ex,ez);
      if(s.stun<=0){
        const ec=o.chase?[1.0,0.22,0.15]:[0.75,0.65,1.0];
        for(const e of o.eyes)spr(e[0],e[1],e[2],0.075,0.075,7,ec[0],ec[1],ec[2],1,1);
        if(o.chase)spr(s.x,0.6,s.z,1.5,1.5,7,0.8,0.05,0.1,0.25,1);
      }
    }
    if(s.pv)potMonPost(s,pn0,ps0,t);
    if(s.hitT>0){const W2=CH.w||13,b=CH.buf;for(let i=pn0;i<CH.n;i++){const o=i*W2;b[o+6]=b[o+6]*0.5+0.9;b[o+7]=b[o+7]*0.5+0.08;b[o+8]=b[o+8]*0.5+0.06}}
  }
  potDraw3D(t,ex,ez,fwx,fwz);wDraw(t,ex,ez,rx,rz);bzDraw(t,ex,ez);

  upload(charMesh,CH);
  upload(lurkMesh,LURK);
  // the torch in your hand, drawn close to the eye so it never pokes through a wall
  HB.n=0;
  if(!title&&state!=='dead'&&!P.down&&!DC&&!mazeExternalView){
    const fm=wofForm();
    TB=HB;const q=fm?buildCritter({rx:P.x,rz:P.z,ry:P.y,ryaw:yaw,rpitch:pitch,walk:P.bob,spd:Math.hypot(P.vx,P.vz),fat:FX.fat>0,pox:FX.pox>0,curl:FX.curl},t,fm,true).torch:buildHand(t,ex,ey,ez,yaw,pitch);if(!fm)wDrawHand(t,ex,ey,ez,yaw,pitch);TB=CH;
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
    if(it.type==='ingr')continue;
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
  potDrawSpr(t,ex,ez);
  for(const s of F.shades){
    if(s.type!==2||(s.x-ex)**2+(s.z-ez)**2>18*18)continue;
    if(s.pv&&((s.pv&31)===9||(s.pv&31)>=6&&(s.pv&31)<=8))continue;
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
    const py=(0.05+((m[1]+t*0.012+Math.sin(t*0.3+m[3])*0.05)%1.15))*(F.archive?1.85:1);
    const k=clamp(1-Math.hypot(px-ex,pz-ez)/Math.min(torchR,4),0,1);
    if(k>0.02)spr(px,py,pz,m[4]*2.4,m[4]*2.4,7,B.torch[0],B.torch[1],B.torch[2],k*(F.archive?0.79:0.5),1);
  }
  if(F.forest&&F.fo.n){
    const P2=F.fo.n,fv=F.variant.fo;
    for(const q of P2.flies){if((q.x-ex)**2+(q.z-ez)**2>64)continue;
      const fx=q.x+Math.sin(t*q.sp+q.ph)*0.3,fy=q.y+Math.sin(t*q.sp*1.7+q.ph*2)*0.1,fz=q.z+Math.cos(t*q.sp*0.8+q.ph)*0.3,bl=0.5+0.5*Math.sin(t*(1.2+q.sp)+q.ph*3);
      spr(fx,fy,fz,0.045,0.045,7,0.75,1,0.4,0.95*bl,1);spr(fx,fy,fz,0.2,0.2,7,0.5,1,0.3,0.3*bl,1)}
    for(const q of P2.landmarks){
      if((q.x-ex)**2+(q.z-ez)**2<34){
        const glow=.22+.045*Math.sin(t*1.2+q.rot);
        spr(q.x,.21,q.z,.65,.58,7,.35,1,.72,glow,1);
      }
    }
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
  for(const s of sprList)s.d=(s.x-camera.position.x)**2+(s.z-camera.position.z)**2;
  sprList.sort((a,b)=>b.d-a.d);
  const invHoriz=1/Math.hypot(vwx,vwz),srx=-vwz*invHoriz,srz=vwx*invHoriz;
  let o=0;
  for(let i=0;i<n;i++){
    const s=sprList[i],hw=s.w/2,hh=s.h/2;
    const u0=(s.cell%4)/4+0.002,u1=(s.cell%4+1)/4-0.002,v0=(s.cell>>2)/4+0.002,v1=((s.cell>>2)+1)/4-0.002;
    const xl=s.x-srx*hw,zl=s.z-srz*hw,xr=s.x+srx*hw,zr=s.z+srz*hw,yb=s.y-hh,yt=s.y+hh;
    const vv=[[xl,yb,zl,u0,v1],[xr,yb,zr,u1,v1],[xr,yt,zr,u1,v0],[xl,yb,zl,u0,v1],[xr,yt,zr,u1,v0],[xl,yt,zl,u0,v0]];
    for(const q of vv){sprData[o++]=q[0];sprData[o++]=q[1];sprData[o++]=q[2];sprData[o++]=q[3];sprData[o++]=q[4];
      sprData[o++]=s.r;sprData[o++]=s.g;sprData[o++]=s.b;sprData[o++]=s.a;sprData[o++]=s.add}
  }

  sprIB.clearUpdateRanges();sprIB.addUpdateRange(0,o);sprIB.needsUpdate=true;sprGeo.setDrawRange(0,n*6);
  renderer.toneMappingExposure=mazeExposure();
  if(state==='play'&&activeStation==='lift'){
    camera.updateMatrixWorld();
    if(floorLiftInReach())hub.projectDockPanel(camera,floorLift.model);
    else board.style.visibility='hidden';
  }
  if(composer)composer.render();else renderer.render(scene,camera);
  torchLight.shadow.autoUpdate=true;
}

/* ---------- self-check: is the picture actually there? ---------- */
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
  {const full=Math.max(0,P.hp-(P.half?1:0)),half=P.half&&P.hp>0?1:0;setHTML('hearts','♥'.repeat(full)+(half?'<b class="half">♥</b>':'')+'<i>'+'♥'.repeat(Math.max(0,maxHp()-full-half))+'</i>')}
  setW('fuelFill',P.fuel);setW('stamFill',P.stam);
  setText('shards',GL.hudOv.shards||'◆ '+P.shards+' / 3 shards');
  setText('flashes','✦ '+P.flash+' flash'+(P.flash===1?'':'es')+(P.pick>0?'   ⛏ '+P.pick:'')+(wHeld()?'   ⚔ '+WEAPON[wHeld()].name:''));
  document.body.classList.toggle('hasweapon',!!wHeld()&&state==='play');
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
  if(F.lift&&F.seen[F.lift.tz*F.W+F.lift.tx]){
    c.fillStyle='#79dcca';
    c.fillRect(ox+(F.lift.tx+0.23)*ts,oy+(F.lift.tz+0.23)*ts,ts*0.54,ts*0.54);
  }
  if(F.seen[F.exit.ty*F.W+F.exit.tx]||F.reveal){c.fillStyle=P.shards>=3?'#5dff9a':'#ff4a3a';c.fillRect(ox+F.exit.tx*ts,oy+F.exit.ty*ts,ts,ts)}
  for(const it of F.items){
    if(it.got||(!F.seen[it.ty*F.W+it.tx]&&!(F.reveal&&it.type==='shard')&&!(it.type==='gem'&&ps('gems'))))continue;
    if(it.type==='ingr'){const g=INGREDIENTS[it.ing].col;dot(it.x,it.z,Math.max(1.6,ts*0.2),'rgb('+g.map(v=>Math.round(Math.min(1,v)*255)).join(',')+')');continue}
    dot(it.x,it.z,(it.type==='shard'||it.type==='key')?Math.max(3,ts*0.4):Math.max(1.6,ts*0.22),it.type==='shard'?'#7fe9ff':it.type==='key'?'#ffd35a':it.type==='oil'?'#ff9a2e':it.type==='gem'?'#ffd84a':it.type==='heart'?'#ff5a6a':'#ffffff');
  }
  if(F.safe&&F.seen[F.safe.ty*F.W+F.safe.tx+1])dot(F.safe.x,F.safe.z,Math.max(2.5,ts*0.3),'#ff8a2a');
  for(const n of F.npcs)if(F.seen[Math.floor(n.z)*F.W+Math.floor(n.x)]){c.fillStyle=n.type==='lurk'&&n.aggro?'#ff2a4a':n.type==='keeper'?'#ffe0a0':'#8ff0d0';c.fillRect(ox+n.x*ts-2.5,oy+n.z*ts-2.5,5,5)}
  for(const s of F.shades)if(s.vis||s.x>0&&(potSeen(s)||s.type===6))dot(s.x,s.z,Math.max(3,ts*0.4),s.type===1?'#e6e0d2':s.type===2?'#5aa8ff':s.type===4?'#c0732a':s.type===5?'#ff8ad0':s.type===10?'#e8e4f0':s.type===8?'#a89a50':s.type===9?'#7f9a5a':s.type===6?(s.role==='add'?'#ff9060':BOSSES[s.boss].col):s.state===1?'#ff2a4a':'#a07cff');
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
    // Leave the locked room's input and draw on the animation frame. The lobby gets one step in a separate idle callback.
    if(!hub.lobbyReady)scheduleLobbyWarm();
    else if(!hub.canWarmLift()||!hub.warmStill())liftWarmSince=0;
    // The lift's floors are prepared only while you stand still in the lobby (outside the bunk room), after a moment, a small step per
    // frame, and as a slow trickle while the lift panel is open. Never while you walk: every step costs GPU time, and doing them as
    // you moved made the whole lobby stutter.
    else{if(!liftWarmSince)liftWarmSince=now;if(now-liftWarmSince>600&&now-liftWarmLast>(activeStation?300:0))scheduleLiftWarm()}
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
// how much background work a frame can take: a few strips of surface painting when frames are coming quickly, one when they are not
let frameEma=1/60;
const workBudget=()=>frameEma<0.018?4:frameEma<0.026?2:1;
function frameBody(now){
  advanceLoading(now);
  const raw=step(now);
  if(raw>0&&raw<0.5)frameEma+=(raw-frameEma)*0.1;
  resize();   // size the canvas and the composer from the very first frame, not after the loading screen (a late first resize stalls on everything queued)
  if(loading&&loading.index<loading.stages.length)return;
  mpVoiceTick(Math.min(raw,0.1));chatTick();
  if(state==='play'&&!STUDIO&&!loading)adapt(raw);
  setHum();updateAmbience(Math.min(raw,0.1),{F,state,hold:GL.frz>0||!!GL.fall||P.away});
  updateMusic(Math.min(raw,0.1),{F,state,lift:state==='title'&&hub.riding,chasing:CHASE.n,nearest:CHASE.near,inRoom:state==='room'||ROOMS.watching||ROOMS.active,room:ROOMS.kind,voiceActive:MP.on&&[...MP.peers.keys()].some(id=>VOX.speaking(id))});
  if(GL.frz<=0){
    const warm=state==='title'&&lobbyWarmFrame;
    if(warm||!window.__norender){
      if(state==='title'){
        const exposure=Math.sqrt(bright/1.3),time=now/1000;
        if(warm){
          lobbyWarmFrame=null;
          warm(exposure,time);
        }else if(PIPE.draw&&hub.warmStill()&&!activeStation)pipeDraw();   // the one heavy warm-up frame waits for a moment you stand still
        hub.render(exposure,time,mazeExposure());
        if(warm&&!window.__norender)selfCheck();
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
    maze:'Stone Maze',cave:'The Hollow',back:'The Humming Rooms',dark:'The Black Hush',forest:'The Dark Forest',archive:'Forgotten Archive'}},
  mobs:{title:'Mob Archive',action:'Encounter',hint:'Spot creatures during a descent, in the maze or behind a strange door, to record them.',entries:{
    0:'Shade',1:'Stalker',2:'Wisp',3:'Watcher',mimic:'Mimic',lurk:'Wrong Shadow',librarian:'Librarian',
    ...Object.fromEntries(Object.entries(ROOM_MOBS).map(([id,mob])=>[id,mob.name]))}},
  glitches:{title:'Glitch Archive',entries:GLITCH_ARCHIVE}
};
let adminOverride=store.get('adminOverride',false)===true;
const archive=Object.fromEntries(Object.keys(archiveCatalog).map(kind=>{
  const saved=store.get('archive.'+kind,{});
  return [kind,saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{}];
}));
const hub=createMenuRoom(renderer,{sfx,asset:exhibitAsset,activate:useMenuAsset,enterLanding:startFromLanding,arriveLobby:finishLiftInLobby,mazeFov:camera.fov,
  cameraView:()=>cameraView,createAvatar:buildLocalAvatar,
  sampleFloor:memoFloor,prepareLanding:preparedLanding,landingGlimpse,passingLook,onLeavePanel:()=>closeStation(),createVisitor:buildHubVisitor,
  appearance:{getLook:()=>playerLook,setLook:setPlayerLook,getName:myName,getColor:localPlayerColor,buildPortrait:buildMirrorPortrait}});
const floorLift=hub.createDockModel();
let floorLiftGate=1;
scene.add(floorLift.model);
function positionFloorLift(floor,depth){
  const dock=floor.lift,model=floorLift.model;
  model.visible=!!dock&&!archiveRun;
  if(!model.visible)return;
  model.position.set(dock.x+dock.fx*landingMazeZ*liftScale,0,dock.z+dock.fz*landingMazeZ*liftScale);
  model.rotation.y=-dock.yaw-Math.PI/2;
  model.scale.setScalar(liftScale);
  floorLift.setGate(floorLiftGate);
  floorLift.screen.setLabel(['FLOOR '+depth,'SELECT DESTINATION']);
}
function floorLiftPose(player=P){
  return F?.lift&&dockPosition(F.lift,player.x,player.z,liftScale);
}
function aboardFloorLift(player=P){
  const p=floorLiftPose(player);
  return !!p&&!archiveRun&&!player.down&&!player.away&&!player.mounted&&onLiftPlatform(p);
}
function floorLiftInReach(){
  if(state!=='play'||!aboardFloorLift())return false;
  const p=floorLiftPose();p.eyeY=liftEye+P.y/liftScale;
  return hub.dockPanelReach(p,P.yaw-F.lift.yaw,P.pitch);
}
const board=$('title');
const stationPanels=[...document.querySelectorAll('[data-station-panel]')];
$('newsList').replaceChildren(...NEWS.map(post=>{
  const item=document.createElement('article'),when=document.createElement('time'),head=document.createElement('h2'),text=document.createElement('p');
  when.textContent=post.date;head.textContent=post.title;text.textContent=post.body;
  item.append(when,head,text);return item;
}));
const scrollNews=dy=>{if(activeStation!=='news')return false;board.scrollBy({top:dy});return true};
let activeStation=null;
let editingLiftDepth=false;
const sharedLift={selection:null,pending:0,trip:null,waiting:[],lastTrip:null};
const liftVisits=new Map();
let liftResume=false,liftJourney=false;
function saveLiftFloor(cleared=false){
  liftVisits.set(R.depth,{floor:F,shards:P.shards,keys:P.keys,bossStarted:BS.started,bossWon:BS.won,cleared:cleared||!!liftVisits.get(R.depth)?.cleared});
}
function liftFloor(seed,depth){
  return seed===R.seed&&liftVisits.get(depth)?.floor||genFloor(seed,depth);
}
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
const overrideForms=[board,settingsScreen.screen].map(screen=>screen.querySelector('.admin-override'));
function resetOverrideForms(){
  for(const form of overrideForms){
    form.reset();
    form.querySelector('button').hidden=form.querySelector('input').hidden=adminOverride;
    form.querySelector('[role=status]').textContent=adminOverride?'Lobby collections unlocked.':'';
  }
}
for(const form of overrideForms)form.addEventListener('submit',event=>{
  event.preventDefault();
  if(activeStation!=='settings'||adminOverride||(MP.on&&!hub.settingsInReach(hub.presence)))return;
  const password=form.querySelector('input');
  const accepted=password.value==='12345';
  password.value='';
  if(!accepted){
    form.querySelector('[role=status]').textContent='Incorrect password.';
    password.focus();
    return;
  }
  adminOverride=true;
  store.set('adminOverride',true);
  resetOverrideForms();
  refreshHub();
  hub.setTrophies(bossTrophies(),adminOverride);
});
resetOverrideForms();

const liftFloorLimit=()=>Math.max(40,deepest);
const defaultLiftFloor=()=>liftResume?R.depth:URL_DEPTH||+$('startSel').value||1;
const validLiftDepth=depth=>Number.isSafeInteger(depth)&&depth>=1;
const liftIsOnFloor=()=>state==='play'||state==='pause';
const nextLiftFloor=(depth,max)=>depth<max?depth+1:depth-1;
const partyDeepestFloor=()=>Math.max(deepest,...[...MP.peers.values()].map(peer=>peer.deepest||1));

function resetSharedLift(){
  Object.assign(sharedLift,{selection:MP.host?{depth:defaultLiftFloor(),max:liftFloorLimit(),deepest,by:''}:null,pending:0,trip:null,waiting:[],lastTrip:null});
  hub.setSharedLift(sharedLift.selection,false);
}
function completeSharedLift(id){
  sharedLift.lastTrip=id;
  sharedLift.trip=null;sharedLift.pending=0;sharedLift.waiting.length=0;
  if(sharedLift.selection)sharedLift.selection.pending=false;
  if(MP.host){
    const reached=partyDeepestFloor(),max=Math.max(40,reached);
    sharedLift.selection={depth:state==='play'?nextLiftFloor(R.depth,max):defaultLiftFloor(),max,deepest:reached,by:''};
    publishLiftSelection();
  }
}

function updateLiftScreen(){
  const selection=sharedLift.selection;
  // The cabin stays in the world while a car is away. watchLift moves it for anyone still in the hall.
  hub.setSharedLift(selection,false);
  if(activeStation!=='lift')return;
  const field=$('liftDepth'),go=$('liftGo'),lobby=$('liftLobby'),onFloor=state==='play';
  const joining=!!(!onFloor&&MP.guest&&MP.run&&!sharedLift.trip&&!liftResume);
  lobby.hidden=!onFloor;
  $('liftDeepest').hidden=onFloor;
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
  go.textContent=onFloor||liftResume?'Travel':'Descend';
  if(selection?.pending)editingLiftDepth=false;
  if(MP.on&&!editingLiftDepth&&selection?.depth>0){
    const depth=onFloor&&selection.depth===R.depth?nextLiftFloor(R.depth,+field.max):selection.depth;
    if(field.valueAsNumber!==depth)field.value=depth;
  }
  $('liftDeepest').textContent='Deepest reached · '+(MP.on?selection?.deepest||deepest:deepest);
  $('liftRunType').textContent=MP.on?(selection?.pending?'Departing · '+(selection.depth===0?'Lobby':'Floor '+selection.depth):
    selection?.by?selection.by+' selected floor '+selection.depth:onFloor?'Floor '+R.depth+' · board together to travel':'Shared destination · all aboard ride together'):
    onFloor?'Docked at floor '+R.depth:liftResume?'Continue your run':'Solo descent';
  // A guest can still press Descend; the click explains itself if the host has not answered yet.
  lobby.disabled=field.disabled=go.disabled=$('liftDeepest').disabled=!!(MP.on&&selection?.pending);
}

function publishLiftSelection(to){
  if(!sharedLift.selection)return;
  mpSend({k:'liftSelection',...sharedLift.selection},to);
  if(!to)updateLiftScreen();
}

function aboardSharedLift(id){
  if(liftIsOnFloor()){
    if(id===MP.id)return aboardFloorLift();
    const player=MP.peers.get(id);
    return !!player&&player.d===R.depth&&player.run&&mpFresh(player)&&aboardFloorLift(player);
  }
  if(id===MP.id)return state==='title'&&hub.boarded&&!hub.riding;
  const p=MP.peers.get(id)?.hub;
  return !!p&&!p.ride&&onLiftPlatform(p);
}

function selectLiftDepth(id,depth){
  const max=sharedLift.selection?.max||liftFloorLimit();
  if(state!=='title'&&!liftIsOnFloor()||sharedLift.pending||sharedLift.trip||!aboardSharedLift(id)||!validLiftDepth(depth)||depth>max)return;
  sharedLift.selection={...sharedLift.selection,depth,max,by:terminalPlayerName(id)};
  publishLiftSelection();
}

function requestLiftDeparture(id,{depth:requested,shortcut,lobby}){
  const onFloor=liftIsOnFloor(),toLobby=lobby===true;
  if(state!=='title'&&!onFloor||sharedLift.pending||sharedLift.trip||!aboardSharedLift(id)||toLobby&&!onFloor)return;
  const reached=partyDeepestFloor(),max=Math.max(40,reached);
  const selected=sharedLift.selection?.depth||defaultLiftFloor();
  const depth=toLobby?0:shortcut===true?reached:requested??selected;
  if(!toLobby&&(!validLiftDepth(depth)||depth>max))return;
  if(onFloor&&depth===R.depth){say('Choose another floor or the lobby.',2);return}
  sharedLift.pending=performance.now()+420;
  sharedLift.selection={depth,max,deepest:reached,by:terminalPlayerName(id),pending:true};
  publishLiftSelection();
}

function startSharedLift(packet){
  const from=packet.from??0;
  const floorRide=from>0;
  if((floorRide?!liftIsOnFloor()||R.depth!==from||R.seed!==packet.seed:state!=='title')||sharedLift.trip||typeof packet.id!=='string'||typeof packet.seed!=='string'||
    !(validLiftDepth(packet.depth)||floorRide&&packet.depth===0)||!validLiftDepth(packet.max)||packet.depth>packet.max||packet.depth===from||
    !Array.isArray(packet.members)||!packet.members.includes(packet.pilot))return;
  const {id,depth,max,seed,pilot,members}=packet;
  if(floorRide&&(!members.includes(MP.id)||!aboardFloorLift()))return;
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
  if(floorRide||hub.boarded&&!hub.riding){
    if(!members.includes(MP.id))members.push(MP.id);
    const ready=()=>members.every(member=>{
      if(member===MP.id)return true;
      const peer=MP.peers.get(member),pose=peer?.hub;
      if(pose?.ride===id)return pose.ready||!mpFresh(peer);
      return performance.now()-trip.started>1700;
    });
    const group=MP.host?{id,ready}:{id,follow:()=>trip.motion};
    if(floorRide)beginFloorLift(depth,group);
    else{
      liftJourney=liftResume&&seed===R.seed;
      hub.engageLift(depth,seed,group);
    }
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
  if(!sharedLift.selection)return;
  if(state!=='title'&&!liftIsOnFloor()){
    sharedLift.selection={...sharedLift.selection,pending:false};publishLiftSelection();return;
  }
  const from=liftIsOnFloor()?R.depth:0;
  const members=[MP.id,...MP.peers.keys()].filter(aboardSharedLift);
  const together=!from||members.includes(MP.id)&&[...MP.peers.values()].every(p=>!p.run||p.down||!mpFresh(p)||members.includes(p.id));
  if(!members.length||!together){
    sharedLift.selection={...sharedLift.selection,pending:false};
    publishLiftSelection();
    if(!together){say('Everyone in the run needs to board the lift.',3);mpSend({k:'liftHold'})}
    return;
  }
  const {depth,max}=sharedLift.selection;
  const seed=from?R.seed:liftSeed();
  // The run must be hosted by someone on the platform. Keep the current
  // host whenever they are among the riders.
  const packet={id:newRoomCode(),depth,max,seed,from,pilot:members[0],members};
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
    else requestLiftDeparture(MP.id,message);
  }else if(MP.hostId){
    if(state==='play')sendRunPresence(MP.hostId);else sendHubPresence(MP.hostId);
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
  return {seed:R.seed,depth:R.depth,pose:[P.x,P.z,P.yaw,P.pitch],gate:F.doorOpen,breaks:R.pk[R.depth]?.slice(),blackout:F.blk,...(F.archive?{y:P.y,crouched:P.crouched}:{})};
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
// Use preview data only for missing entries, so live discoveries still supersede it.
function archivePreview(kind,id){
  const seed='OVERRIDE';
  if(kind==='glitches')return {preview:true};
  if(kind==='floors')return {seed,depth:{maze:1,cave:3,back:4,dark:9,forest:7,archive:ARCHIVE_DEPTH}[id]};
  const room=kind==='doors'?id:ROOM_MOBS[id]?.room;
  if(room)return {seed:hashStr(seed+room),depth:1,room};
  return {seed,depth:id==='librarian'?ARCHIVE_DEPTH:1,preview:true};
}
function refreshHub(){
  hub.syncArchives(Object.fromEntries(Object.entries(archiveCatalog).map(([kind,catalog])=>[kind,
    Object.entries(catalog.entries).map(([id,name])=>({
      kind,id,name,data:archive[kind][id]||(adminOverride?archivePreview(kind,id):undefined),
      discovered:!!archive[kind][id]
    }))])),adminOverride);
}
function showHub(on){
  closeStation();
  if(!on)settingsScreen.screen.hidden=true;
  $('menuHub').hidden=!on;
  hub.setActive(on);
  document.body.classList.toggle('hub-room',on);
  if(on&&reWarm&&state==='title'&&!loading){reWarm=false;retargetShaft()}
  if(on){if(hub.lobbyReady)refreshHub();$('tFlash').textContent='USE'}
  else $('tFlash').textContent='FLASH';
}
function openStation(id){
  const onFloor=state==='play'&&id==='lift'&&floorLiftInReach();
  if(!onFloor&&(state!=='title'||loading||hub.riding||!hub.lobbyReady))return;
  activeStation=id;
  board.toggleAttribute('data-lift',id==='lift');
  if(!onFloor)hub.focusPanel(id);
  else board.style.visibility='hidden';
  initAudio();
  if(document.pointerLockElement){usingLock=false;document.exitPointerLock()}
  $('stationTitle').textContent=id==='settings'?'Settings':id==='lift'?(onFloor?'Lift controls':'Descent Control'):id==='news'?'Update Log':'Field Guide';
  if(id==='news')hub.markNewsSeen();
  if(id==='settings')resetOverrideForms();
  if(id==='lift'){
    editingLiftDepth=false;
    $('liftDepth').value=onFloor?nextLiftFloor(R.depth,liftFloorLimit()):defaultLiftFloor();
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
  editingLiftDepth=false;
  hub.focusPanel(null);
  board.classList.add('hidden');
  document.body.classList.remove('hub-panel');
  if(previous==='settings')resetOverrideForms();
  if(previous&&(board.contains(document.activeElement)||settingsScreen.screen.contains(document.activeElement)))document.activeElement.blur();
  updateSettingsScreen();
}
function useMenuAsset(entry){
  if(state!=='title'||loading)return;
  if(entry.playClip){entry.playClip();return}
  initAudio();
  if(entry.locked){sfx('seal');say('Locked. The hangar door will not budge.',2.6);return}
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
  const {x,z,yaw,fx,fz}=floor.lift;
  const side=position.x*liftScale,forward=(landingMazeZ-position.z)*liftScale;
  const sideSpeed=position.vx*liftScale,forwardSpeed=-position.vz*liftScale;
  const pose={x:x+fx*forward-fz*side,z:z+fz*forward+fx*side,
    y:position.y*liftScale,vx:fx*forwardSpeed-fz*sideSpeed,vz:fz*forwardSpeed+fx*sideSpeed,
    vy:position.vy*liftScale,airSpeed:position.airSpeed*liftScale,bob:position.bob,stepPh:position.stepPh,
    yaw:yaw+position.yaw,pitch:clamp(position.pitch,-MOVE.pitch,MOVE.pitch)};
  if(tripId){
    if(MP.host)publishLiftMotion();
    if(MP.guest)MP.wantJoin=true;
  }
  if(!liftJourney)enterRun(seed,depth,floor,pose,tripId);
  else{
    liftJourney=liftResume=false;
    liftCacheClear(true);showHub(false);
    installFloor(depth,floor,true,pose);
    finishFloorArrival(depth,tripId);
  }
  // The gate opens in the playable maze scene, so walking across it never swaps models or lighting.
  floorLiftGate=0;floorLift.setGate(0);
}
function beginFloorLift(depth,group=null){
  if(!aboardFloorLift())return false;
  const {x,z}=floorLiftPose(),departure=landingView(F,worldMesh,true);
  hub.place(x,z,P.yaw-F.lift.yaw,P.pitch);
  if(!hub.engageLift(depth,R.seed,group,R.depth,departure)){
    departure.children[0].geometry.dispose();return false;
  }
  saveLiftFloor();liftJourney=true;
  state='title';potHide();clearPrompt();
  $('pause').classList.add('hidden');
  $('hud').classList.add('hidden');$('map').classList.add('hidden');
  showHub(true);
  return true;
}
function finishLiftInLobby(tripId){
  if(tripId&&MP.host)publishLiftMotion();
  hub.resetLift();liftResume=true;liftJourney=false;
  MP.run=null;
  if(tripId){
    completeSharedLift(tripId);
    if(MP.host)mpSend({k:'liftLobby',id:tripId});
  }
  showBest();mpTitle();
  sfx('descend');
}
function buildHubVisitor(peer){
  const pose={id:peer.id,col:peer.col,look:peer.look,rx:0,ry:0,rz:0,ryaw:0,rpitch:0,spd:0,walk:0};
  const avatar=exhibitModel((time,stride)=>{pose.spd=stride*2.7;buildPlayer(pose,time)},true);
  const animate=avatar.userData.pose;
  avatar.userData.pose=(time,stride,pace)=>{pose.walk=pace;animate(time,stride)};
  avatar.scale.setScalar(1.62/EYE);
  return avatar;
}
function buildMirrorPortrait(look,baseColor){
  const color=appearanceColor(look,appearanceField.cloak)||baseColor;
  const cloak=[color[0]*0.72,color[1]*0.72,color[2]*0.72,2],shadow=[color[0]*0.42,color[1]*0.42,color[2]*0.42,2];
  const skin=appearanceColor(look,appearanceField.skin);
  return exhibitModel(()=>{
    const head={p:[0,0,0],R:rYaw(-Math.PI/2).map(value=>value*2.35)};
    ball(head,[-0.013,-0.108,0],[0.063,0.079,0.146],cloak);
    ball(head,[0.023,-0.075,0.0],[0.049,0.045,0.104],shadow,true);
    seg(head,[0.008,-0.082,0],[0.008,0.038,0],0.035,0.033,skin);
    playerHead(head,look,skin,cloak,shadow,1);
  });
}
function landingView(floor,world,copyGeometry=false){
  const {x:ex,z:ez,yaw}=floor.lift;
  const group=new THREE.Group();
  const mesh=new THREE.Mesh(copyGeometry?world.geometry.clone():world.geometry,world.material);
  group.name='Maze seen from the shaft';
  const angle=yaw+Math.PI/2,k=1/liftScale;
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
  // its textures are queued, not painted here: SURFS.idle() paints them in later frames, once their shaders are compiled in parallel
  SURFS.defer(true);let proto;try{proto=buildMesh(look,true)}finally{SURFS.defer(false)}
  const tx=2,ty=1,yaw=Math.PI/2,fx=Math.cos(yaw),fz=Math.sin(yaw);
  const ex=tx+0.5-fx*0.5,ez=ty+0.5-fz*0.5,angle=yaw+Math.PI/2,k=1.62/EYE;
  proto.rotation.y=angle;proto.scale.setScalar(k);
  proto.position.set(-k*(Math.cos(angle)*ex+Math.sin(angle)*ez),0,-k*(-Math.sin(angle)*ex+Math.cos(angle)*ez));
  proto.userData.floor=look;
  // compiled in the background before it is ever shown: a glimpse drawn with a fresh material compiled it in the middle of the ride
  proto.userData.ready=false;
  {const p=hub.compileObject(proto),ok=()=>{proto.userData.ready=true};if(p&&p.then)p.then(ok,ok);else ok()}
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
  if(proto.userData.ready===false)return null;   // still compiling: the car waits a moment rather than stall on it
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
// A prepared landing owns its own world mesh and decor snapshot (the world itself is only swapped in when the ride docks),
// so several landings can wait in the cache at once. A forest floor builds its world straight away as it always did, so it is only ever cached alone.
const landingOf=new WeakMap();
function prepareLanding(seed,depth){
  let stage=0,waiting=false,shadersRequested=false,shadersReady=false;
  const wait=p=>{waiting=true;p.then(()=>{waiting=false;stage++},()=>{waiting=false;stage++})};
  // the wall textures are queued while the mesh is built, then their shaders compile in parallel and they are painted a couple per step
  const task={floor:null,model:null,mesh:null,decor:null,decorN:0,own:true,installed:false,progress:0,ready:false,arrivalReady:false,
    advance(){
      if(task.ready||waiting)return;
      const wl=window.__warmLog,ws=wl&&performance.now(),st0=stage;
      try{task.step()}finally{if(wl)wl.push(['landing '+depth+' stage '+st0,performance.now()-ws])}
    },
    step(){
      if(stage===0){
        task.floor=liftFloor(seed,depth);task.own=!task.floor.forest;
        landingOf.set(task.floor,task);task.progress=0.15;stage++;
      }
      else if(stage===1){
        SURFS.defer(true);
        try{
          if(task.own)task.mesh=buildMesh(task.floor,true);
          else{buildMesh(task.floor);task.mesh=worldMesh}
        }finally{SURFS.defer(false)}
        task.progress=0.3;stage++;
      }
      else if(stage===2){task.model=landingView(task.floor,task.mesh);task.progress=0.4;stage++}
      else if(stage===3){task.progress=0.45;wait(SURFS.compileQueued())}
      else if(stage===4){if(!SURFS.pump(workBudget()))stage++;task.progress=Math.max(task.progress,0.5+0.2*(1-SURFS.pending/12))}
      else if(stage===5){
        buildStatic(task.floor);buildSdf(task.floor);
        task.decorN=DEC.n;task.decor=DEC.buf.slice(0,DEC.n*13);
        task.progress=0.85;stage++;
      }
      else if(stage===6){task.progress=1;task.ready=true;stage++}
    },
    warmArrival(){
      const wl=window.__warmLog,ws=wl&&performance.now();
      try{return task.arrive()}finally{if(wl)wl.push(['arrival '+depth,performance.now()-ws])}
    },
    arrive(){
      if(task.arrivalReady||!task.ready)return task.arrivalReady;
      if(PIPE.pre.length){PIPE.pre.shift()();return false}
      if(!shadersRequested){
        shadersRequested=true;
        Promise.all([pipeWarm([task]),hub.compileObject(task.model)])
          .catch(error=>console.warn(error)).finally(()=>{shadersReady=true});
        return false;
      }
      if(!shadersReady)return false;
      try{drawLandingFrame(task,depth)}catch(error){console.warn(error)}
      task.arrivalReady=true;
      return true;
    },
    // called as the run takes this floor: puts its own world and decor in place
    install(){
      if(!task.mesh||!task.decor)return false;
      task.installed=true;
      if(task.own)installWorldMesh(task.floor,task.mesh,true);
      DEC.buf.set(task.decor);DEC.n=task.decorN;upload(decorMesh,DEC);
      return true;
    },
    dispose(){
      if(task.model){task.model.removeFromParent();task.model=null}
      if(task.own&&task.mesh&&!task.installed){task.mesh.geometry.dispose();task.mesh=null}
      task.decor=null;
    }
  };
  return task;
}
// Landings built ahead of time for the lift, keyed by seed and depth: the selected floor, then floor 1.
// A landing is handed out once and never reused, since a run mutates its floor.
const LIFT_CACHE_MAX=2;   // the selected floor and floor 1: building six ahead tripled the background work (and its shaders) for floors rarely taken
const liftCache=new Map(),glimpseCompiled=new Set();
let liftCacheAt=0,liftCompiling=0;
// the seed a lift ride uses while the seed field is blank; a new one is rolled once a run starts from it, so each ride is a new maze
let autoSeed=randSeed(),reWarm=false;
const liftSeed=()=>($('seedIn').value.trim()||(liftResume?R.seed:autoSeed)).toUpperCase();
function selectedLiftDepth(){
  const typed=+$('liftDepth').value;
  return Number.isInteger(typed)&&typed>=1?typed:defaultLiftFloor();
}
function liftWanted(){
  const sel=selectedLiftDepth(),max=+$('liftDepth').max,out=[sel];
  if(sel!==1)out.push(1);
  return out.slice(0,LIFT_CACHE_MAX);
}
function liftEntry(seed,depth){
  const key=seed+'#'+depth;
  let e=liftCache.get(key);
  if(!e){e={seed,depth,task:prepareLanding(seed,depth),compiled:false};liftCache.set(key,e)}
  return e;
}
function liftCacheTrim(seed,wanted){
  for(const [key,e] of liftCache)if(e.seed!==seed||!wanted.includes(e.depth)){e.task.dispose();liftCache.delete(key)}
}
function afterLiftFrame(cleanup){
  if(window.requestIdleCallback)window.requestIdleCallback(cleanup,{timeout:500});
  else setTimeout(cleanup,80);
}
function liftCacheClear(defer=false){
  if(!defer){liftCacheTrim(null,[]);return}
  const pending=[...liftCache.values()];liftCache.clear();
  if(pending.length)afterLiftFrame(()=>{for(const {task} of pending)task.dispose()});
}
function preparedLanding(seed,depth){
  const key=seed+'#'+depth,e=liftCache.get(key);
  if(e){liftCache.delete(key);return e.task}
  return prepareLanding(seed,depth);
}
function compileAhead(object,done){
  liftCompiling++;
  const finish=()=>{liftCompiling--;done()};
  const p=hub.compileObject(object);
  if(p&&p.then)p.then(finish,finish);else finish();
}
// One small step per idle frame: build the next missing landing, compile a finished one, then compile the near floors' glimpses.
function liftCachePump(){
  if(liftCompiling>0||performance.now()<liftCacheAt)return true;
  const seed=liftSeed(),wanted=liftWanted();
  liftCacheTrim(seed,wanted);
  for(const depth of wanted){
    const e=liftEntry(seed,depth);
    if(!e.task.ready){e.task.advance();return true}
    if(!e.compiled){
      e.compiled=true;
      if(e.task.model){compileAhead(e.task.model,()=>{});return true}
    }
  }
  for(let n=1;n<=10;n++)for(let turn=0;turn<3;turn++){
    const surf=glimpseSurf(n,turn);
    if(glimpseCompiled.has(surf))continue;
    glimpseCompiled.add(surf);
    compileAhead(buildGlimpseProto(n,turn),()=>{});
    return true;
  }
  return false;
}
let liftWarmScheduled=false,liftWarmLast=0,liftWarmSince=0;
function scheduleLiftWarm(){
  if(liftWarmScheduled||PIPE.draw)return;
  liftWarmScheduled=true;
  afterLiftFrame(()=>{
    liftWarmScheduled=false;
    if(state!=='title'||loading||!hub.canWarmLift()||!hub.warmStill())return;
    liftWarmLast=performance.now();
    const wl=window.__warmLog;let ws=wl&&performance.now();
    SURFS.idle(workBudget());
    if(wl){wl.push(['surfs idle',performance.now()-ws]);ws=performance.now()}
    const r=liftCachePump();
    if(wl){wl.push(['lift pump',performance.now()-ws]);ws=performance.now()}
    if(!r&&!activeStation){pipeWarmPump();if(wl)wl.push(['pipe pump',performance.now()-ws])}
  });
}
/* ---------- warm the in-game render pipeline in the lobby ---------- */
// The first frames of a floor used to link dozens of programs on the spot: the world surfaces lit by the game's lights and shadows,
// the characters and sprites, and every pass of the post chain. Each link can stall the page for a good fraction of a second, so the
// lobby does it ahead of time. The programs are requested in the background (compileAsync), each against the render target they will
// really draw into, and then one real frame of the game scene goes through the composer inside a lobby frame that the hub immediately
// paints over, so nothing is ever shown. Landings that arrive later in the cache (another seed or floor) only compile their own surfaces.
const PIPE={pre:[prepareMazeLighting,()=>{if(Q>0)hairTex()},
  ()=>{if(!WOF.grp){WOF.grp=wheelModel();WOF.grp.visible=false;scene.add(WOF.grp)}},
  ()=>{glFallBuild()}],base:null,busy:false,fx:false,draw:false,runs:0,warmed:new WeakSet(),geo:null,mark:[]};
const pipeTasks=()=>[...liftCache.values()].map(e=>e.task).filter(t=>t.ready&&!PIPE.warmed.has(t));
function pipeWarmState(){
  const all=[...liftCache.values()];
  return {busy:PIPE.busy,runs:PIPE.runs,fx:PIPE.fx,pending:pipeTasks().length,done:PIPE.fx&&!PIPE.busy&&!pipeTasks().length&&all.length>0};
}
// everything a pass draws with: full-screen shader materials, plus the plain materials a pass lays over the whole scene (the AO normals and depth)
function pipePassMaterials(){
  const shader=new Set(),over=new Set(),last=new Set();
  if(!composer)return {shader,over,last};
  composer.passes.forEach((pass,i)=>{
    // the output pass picks its tone mapping defines on its first frame: set them now so the program built ahead is the one it will use
    if(pass._toneMapping!==undefined&&renderer.toneMapping===THREE.ACESFilmicToneMapping){
      pass._outputColorSpace=renderer.outputColorSpace;pass._toneMapping=renderer.toneMapping;
      const d={};if(THREE.ColorManagement.getTransfer(pass._outputColorSpace)===THREE.SRGBTransfer)d.SRGB_TRANSFER='';
      d.ACES_FILMIC_TONE_MAPPING='';pass.material.defines=d;pass.material.needsUpdate=true;
    }
    const add=m=>{if(!m||!m.isMaterial)return;(m.isShaderMaterial?shader:over).add(m);if(i===composer.passes.length-1&&m.isShaderMaterial)last.add(m)};
    for(const k in pass){const v=pass[k];if(Array.isArray(v))v.forEach(add);else add(v)}
    if(pass.fsQuad)add(pass.fsQuad.material);
  });
  return {shader,over,last};
}
function pipeBoard(materials){
  const board=new THREE.Scene();
  PIPE.geo??=new THREE.PlaneGeometry(1,1);
  for(const m of materials){const o=new THREE.Mesh(PIPE.geo,m);o.frustumCulled=false;board.add(o)}
  return board;
}
async function pipeWarm(tasks){
  const was=renderer.getRenderTarget(),into=composer?composer.renderTarget1:null;
  const run=async(target,object,over,bare)=>{
    renderer.setRenderTarget(target);
    let p=null;
    const fog=scene.fog;
    if(bare)scene.fog=null;   // a shadow map pass draws with no scene of its own: no fog, but the real lights
    try{camera.updateMatrixWorld();p=renderer.compileAsync(object,camera,over)}catch(e){}
    scene.fog=fog;
    renderer.setRenderTarget(was);
    if(p)await p;
  };
  PIPE.base??=(async()=>{
    const {shader,over,last}=pipePassMaterials();
    // a draped garment's own materials (made when a keeper or similar first comes into view); kept for good so the programs stay alive
    PIPE.drape=drapeMaterials();
    {const g=new THREE.BufferGeometry(),z=n=>new THREE.BufferAttribute(new Float32Array(3*n),n===0?3:3);
      g.setAttribute('position',z(3));g.setAttribute('normal',z(3));g.setAttribute('color',z(3));
      g.setAttribute('aLoc',new THREE.BufferAttribute(new Float32Array(12),4));g.setAttribute('aBand',z(3));
      const o=new THREE.Mesh(g,PIPE.drape.m);o.customDepthMaterial=PIPE.drape.dm;o.customDistanceMaterial=PIPE.drape.ds;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
      const board=new THREE.Scene(),d=new THREE.Mesh(g,PIPE.drape.ds);d.frustumCulled=false;board.add(o);PIPE.drapeBoard=board;
      // a shadow caster's side decides which way the depth pass culls, which is part of the program: cover each side
      const dists=[];
      for(const side of [THREE.FrontSide,THREE.BackSide,THREE.DoubleSide]){
        const a=new THREE.MeshDistanceMaterial(),b=PIPE.drape.ds.clone();a.side=b.side=side;
        b.onBeforeCompile=PIPE.drape.ds.onBeforeCompile;b.customProgramCacheKey=PIPE.drape.ds.customProgramCacheKey;dists.push(a,b);
      }
      PIPE.castBoard=pipeBoard(dists)}
    await run(into,scene);                                  // the standing scene: world, characters, decor, sprites, torch hand, shadow casters
    if(shader.size)await run(into,pipeBoard(shader));       // post chain, drawing into the composer's targets
    // plain materials laid over the scene and the point light shadow depth, as they are drawn against the real lights
    await run(into,pipeBoard([...over]),scene);
    await run(into,PIPE.drapeBoard,scene);
    await run(into,PIPE.castBoard,scene,true);
    if(last.size)await run(null,pipeBoard(last));           // the last pass draws to the screen
  })();
  await PIPE.base;
  for(const t of tasks)if(t.mesh&&!PIPE.warmed.has(t))await run(into,t.mesh,scene);
}
let landingWarmTarget=null;
function drawLandingFrame(task,depth){
  const dock=task.floor.lift,mesh=task.mesh,attached=!!mesh.parent;
  const hideWorld=worldMesh&&worldMesh!==mesh&&worldMesh.visible;
  if(hideWorld)worldMesh.visible=false;
  if(!attached)scene.add(mesh);
  positionFloorLift(task.floor,depth);
  floorLift.setGate(0);
  const target=renderer.getRenderTarget(),screen=composer?.renderToScreen;
  // Upload the actual destination mesh and render the landing before the car opens, without touching the displayed canvas.
  camera.position.set(dock.x-dock.fx*2.1,EYE,dock.z-dock.fz*2.1);
  camera.lookAt(dock.x+dock.fx,EYE,dock.z+dock.fz);
  torchLight.position.copy(camera.position);
  try{
    if(composer){composer.renderToScreen=false;composer.render(0)}
    else{
      landingWarmTarget??=new THREE.WebGLRenderTarget(32,32);
      renderer.setRenderTarget(landingWarmTarget);renderer.render(scene,camera);
    }
  }finally{
    if(composer)composer.renderToScreen=screen;
    renderer.setRenderTarget(target);
    if(!attached)mesh.removeFromParent();
    if(hideWorld)worldMesh.visible=true;
  }
}
function pipeWarmPump(){
  if(PIPE.busy)return true;
  if(!renderer.compileAsync)return false;
  // things the first frames of a floor would otherwise build on the spot, one per idle frame
  if(PIPE.pre.length){const wl=window.__warmLog,ws=wl&&performance.now(),f=PIPE.pre.shift();f();if(wl)wl.push(['pipe pre '+(f.name||'?'),performance.now()-ws]);return true}
  const tasks=pipeTasks();
  if(!tasks.length&&PIPE.fx)return false;
  // wait until the first landing is built: its surfaces are what the first frames will need
  if(!tasks.length)return false;
  PIPE.busy=true;PIPE.mark=tasks;
  pipeWarm(tasks).then(()=>{PIPE.draw=true},()=>{PIPE.draw=true});
  return true;
}
// one real frame of the game scene through the composer, inside a lobby frame that the hub paints over straight after
function pipeDraw(){
  const wl=window.__warmLog,ws=wl&&performance.now();
  try{pipeDraw0()}finally{if(wl)wl.push(['pipe draw',performance.now()-ws])}
}
function pipeDraw0(){
  PIPE.draw=false;
  if(state!=='title'||hub.riding||loading){PIPE.busy=false;return}
  try{
    for(const l of shadLights)l.shadow.needsUpdate=true;
    if(composer)composer.render(0);else renderer.render(scene,camera);
    PIPE.runs++;PIPE.fx=true;
    for(const t of PIPE.mark)PIPE.warmed.add(t);
  }catch(e){console.error(e)}
  PIPE.busy=false;
}
let lobbyWarm,lobbyWarmFrame,lobbyWarmWaiting=false,lobbyWarmScheduled=false,lobbyWarmStatus='';
function* prepareLobby(){
  while(hub.buildLobbyStep())yield ['FURNISHING LOBBY',0.25];
  yield ['PREPARING ARCHIVES',0.5,refreshHub];
  yield ['LIGHTING THE LOBBY',0.75,()=>hub.compileLobby()];
  // the maze's own one-off set-up (its reflections, the wheel, the falling scene) is done here, behind the bunk room, instead of on the
  // lift ride, where it stalled the car
  while(PIPE.pre.length)yield ['LIGHTING THE DEEP',0.85,PIPE.pre.shift()];
  // Draw to the same framebuffer as the lobby, then paint the locked bunk room over it in that frame.
  yield ['FINISHING LOBBY',0.97,()=>new Promise((resolve,reject)=>{
    lobbyWarmFrame=(exposure,time)=>{
      try{hub.drawLobbyWarmFrame(exposure,time);resolve()}catch(error){reject(error)}
    };
  })];
}
function scheduleLobbyWarm(){
  if(!lobbyWarm||lobbyWarmWaiting||lobbyWarmScheduled)return;
  lobbyWarmScheduled=true;
  const run=()=>{
    lobbyWarmScheduled=false;
    if(state==='title'&&!loading){const wl=window.__warmLog,ws=wl&&performance.now(),lab=lobbyWarmStatus;advanceLobbyWarm();if(wl)wl.push(['lobby '+lab,performance.now()-ws])}
  };
  if(window.requestIdleCallback)window.requestIdleCallback(run,{timeout:120});
  else setTimeout(run,0);
}
function advanceLobbyWarm(){
  if(!lobbyWarm||lobbyWarmWaiting)return;
  const fail=error=>{
    lobbyWarm=null;console.error('Could not prepare the lobby',error);
    hub.setLobbyStatus('LOBBY LOAD FAILED');
  };
  try{
    const {value,done}=lobbyWarm.next();
    if(done){lobbyWarm=null;hub.unlockLobby();return}
    const [label,progress,work]=value;
    if(label!==lobbyWarmStatus){lobbyWarmStatus=label;hub.setLobbyStatus(label,progress)}
    const pending=work?.();
    if(pending?.then){lobbyWarmWaiting=true;pending.then(()=>{lobbyWarmWaiting=false},fail)}
  }catch(error){fail(error)}
}
// the seed or floor changed: the pump drops landings that no longer match and builds the new ones, after a short pause so typing does not thrash
function retargetShaft(){
  if(state!=='title'||hub.riding||loading)return;
  liftCacheAt=performance.now()+400;
}
function departFromLift(shortcut=false){
  const onFloor=state==='play';
  if(activeStation!=='lift'||loading||!(onFloor?floorLiftInReach():state==='title'&&hub.boarded&&!hub.riding))return;
  if(!onFloor&&MP.guest&&MP.run&&!sharedLift.trip&&!liftResume){
    if(!MP.hostId){say('Still looking for the host. Keep this page open.',2.5);return}
    closeStation();mpJoinClick();return;
  }
  if(MP.on&&!MP.host&&!MP.hostId){say('Still looking for the host. Keep this page open.',2.5);return}
  if(MP.on&&shortcut){sendLiftAction({k:'liftDepart',shortcut:true});return}
  const depth=shortcut?deepest:$('liftDepth').valueAsNumber;
  if(!Number.isInteger(depth)||depth<1||depth>+$('liftDepth').max)return;
  if(onFloor&&depth===R.depth){say('Choose another floor or the lobby.',2);return}
  if(MP.on){sendLiftAction({k:'liftDepart',depth});return}
  if(onFloor){beginFloorLift(depth);return}
  const seed=liftSeed();
  liftJourney=liftResume&&seed===R.seed;
  if(hub.engageLift(depth,seed))closeStation();
}
$('liftDestination').addEventListener('submit',event=>{
  event.preventDefault();
  departFromLift();
});
$('liftDeepest').addEventListener('click',()=>departFromLift(true));
$('liftLobby').addEventListener('click',()=>{
  if(state!=='play'||activeStation!=='lift'||!floorLiftInReach())return;
  if(MP.on)sendLiftAction({k:'liftDepart',lobby:true});else beginFloorLift(0);
});
$('liftDepth').addEventListener('input',()=>{
  editingLiftDepth=true;
  const depth=$('liftDepth').valueAsNumber;
  if(MP.on&&activeStation==='lift'&&(state==='play'?aboardFloorLift():hub.boarded)&&validLiftDepth(depth)&&depth<=+$('liftDepth').max)sendLiftAction({k:'liftPick',depth});
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
  const geometry=new THREE.BufferGeometry();
  function uploadAttributes(){
    const data=new THREE.InterleavedBuffer(exhibitBuffer.buf.slice(0,exhibitBuffer.n*13),13);
    if(animated)data.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));
    geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(data,3,3));
    geometry.setAttribute('color',new THREE.InterleavedBufferAttribute(data,3,6));
    return data;
  }
  let vertices=uploadAttributes();
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.76,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,mat);
  if(animated){
    mesh.userData.pose=(time,stride)=>{
      bake(time,stride);
      if(exhibitBuffer.n>vertices.count){
        geometry.dispose();
        vertices=uploadAttributes();
        geometry.boundingSphere=null;
        geometry.boundingBox=null;
      }else vertices.array.set(exhibitBuffer.buf.subarray(0,exhibitBuffer.n*13));
      geometry.setDrawRange(0,exhibitBuffer.n);
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
    else if(id==='librarian')buildLibrarian(mob,time,true);
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
      }else if(kind==='mobs'){
        if(data.preview)data=previewMobEncounter(data);
        restoreEncounter(data);
        replayMob(id,data);
      }
    }catch(error){
      finishArchive();
      throw error;
    }
  }]]);
}
function previewMobEncounter(data){
  if(F.archive){const z=F.archive.aisle;return {...data,pose:[9.5,z,0,0],mob:[11,z]}}
  for(let ty=1;ty<F.H-1;ty++)for(let tx=1;tx<F.W-1;tx++){
    if(!glOpen(tx,ty)||glTrapAt(tx,ty)||Math.hypot(F.exit.x-tx-0.5,F.exit.z-ty-0.5)<2)continue;
    for(const [dx,dz] of DIRS){
      let steps=0;
      while(steps<4&&glOpen(tx+(steps+1)*dx,ty+(steps+1)*dz))steps++;
      if(steps<4)continue;
      const x=tx+0.5,z=ty+0.5,yaw=Math.atan2(dz,dx);
      return {...data,pose:[x,z,yaw,0],mob:[x+3*dx,z+3*dz]};
    }
  }
  return {...data,pose:[P.x,P.z,P.yaw,P.pitch],mob:[P.x,P.z]};
}
function restoreEncounter(data){
  if(data.gate&&F.door)openDoor(true);
  for(const tile of data.breaks||[])pkApply(tile[0],tile[1],true);
  F.blk=data.blackout||0;
  F.shades=[];
  const [x,z,yaw,pitch]=data.pose;
  if(!blocked(x,z)){
    Object.assign(P,{x,z,yaw,pitch});
    if(F.archive){
      P.y=archiveGround(F.archive,x,z,data.y||0);
      P.crouched=!!data.crouched;P.crouchBlend=Number(P.crouched);
    }
    onTileChange();
  }
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
    F.shades.push({type:id==='librarian'?LIBRARIAN:Number(id),x,z,gx,gy,px:-1,py:-1,state:0,stun:0,think:0,vis:false,
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
R.seed=randSeed();F=genFloor(R.seed,1);showBest();achLine();showHub(true);mpTitle();
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
window.__game={pipelineWarm:pipeWarmState,EMO,emoteNext,emoteStop,NR,nrPulled,perf:{get composer(){return composer},torchLight,poolLights,shadLights,get gtao(){return gtaoPass},get bloom(){return bloomPass},get fxaa(){return fxaaPass},get rs(){return rs},set rs(v){rs=v;viewKey=''}},wMaxHp,TROLL,trollTick,trollWall,canUse,SPI,SLUG,KO,spiderTick,slugTick,slugPeel,slugOn,koTry,koUp,helpStart,webClear,webMul,crawlPlayerTick,get crawl(){return CRAWL},liftCache:()=>[...liftCache.values()].map(e=>({seed:e.seed,depth:e.depth,ready:e.task.ready,compiled:e.compiled})),stillwoodWarmState,stillwoodWarm,doorSeed,wofQ:WOQ,tkTargets,rrStart,wofClear,wofTick,mpPosFlags,wof:WOF,fx:FX,get tk(){return TK},get bomb(){return BOMB},get rr(){return RR},set rr(v){RR=v},rrAct,get ts(){return TS},get brk(){return BRK},set tk(v){TK=v},get cg(){return CG},set cg(v){CG=v},departFromLift,wofSpinStart,wofResolve,wofBegin,wofScene,planSpin,pickSlice,sliceAt,spinAngle,NEWS,openStation,get activeStation(){return activeStation},hub,get lobbyPaused(){return lobbyPaused},get roomPaused(){return roomPaused},simLockLost(){if(document.pointerLockElement){document.exitPointerLock();return}usingLock=true;document.dispatchEvent(new Event("pointerlockchange"))},music,get menuPosition(){return hub.position},previewRoom,keeperReady:()=>{PROBE_SYNC=true;return keeperReady()},keeperLoad:()=>KEEPER_LOAD,KEEPER_T,keeperSaved:()=>KEEPER_SAVED,gripProbe,studio,benchNpc,NPC_T,GPU_RIGS,get CH(){return CH},bakeRecipe,KEEPER,get keeperStats(){return bakeRecipe(KEEPER).stats},guideInfo,guideCompute,GD,achieve,ACH,amb,roomInput,XR,xrayTick,wallsBetween,update,render,drawHUD,drawMap,camera,scene,get BABY(){return BABY},get Q(){return Q},mpRecv,blocked,solidAt,onTileChange,pkWhy,pkApply,pkAim,usePick,pkReapply,doorPlan,doorCountFor,doorOrder,flashStun,collect,get watching(){return RW},roomLeave,DOOR_LOOKS,DOOR_KINDS,buildStatic,glitch:glTest,setSkyTime:t=>hub.setSkyTime(t),get skyTime(){return hub.skyTime},hubLook:(dyaw,dpitch)=>hub.look(dyaw,dpitch),hubRender:t=>{if(t!=null)hub.setSkyTime(t);hub.render(1,t??hub.skyTime)},hubStep:(dt,inp)=>hub.update(dt,inp||{},dt),pause,resume,GL,ROOMS,sdoorOpen,kilnGame,KILN,roomEnd,MP,mpHost,hurt,keys,MIM,CLIPS,VOX,mpVoiceSet,chatOpenBox,chatClose,mimicEat,surfPreview(i,nrm,p){const t=SURFS.get(i,p),rt=nrm?t.rtN:t.rtA,n=rt.width,px=new Uint8Array(n*n*4);renderer.readRenderTargetPixels(rt,0,0,n,n,px);const c=document.createElement('canvas');c.width=c.height=n;const x=c.getContext('2d'),im=x.createImageData(n,n);im.data.set(px);if(!nrm)for(let k=3;k<px.length;k+=4)im.data[k]=255;else for(let k=0;k<px.length;k+=4){im.data[k]=im.data[k+1]=im.data[k+2]=255-px[k+3];im.data[k+3]=255}x.putImageData(im,0,0);return c.toDataURL('image/jpeg',0.9)},get wallet(){return wallet},set wallet(v){wallet=v},up,openTalk,closeTalk,pickTalk,moveTalk,get talk(){return talk},get nearNpc(){return nearNpc},act,genFloor,bfs,loadFloor,get F(){return F},FOREST,get forestGrp(){return forestGrp},BIOMES,VARIANTS,biomeIx,floorKind,pickVariant,SURFS,worldMats,get URL_DEPTH(){return URL_DEPTH},renderer,resize,get state(){return state},get rs(){return rs},get panelLvl(){return panelLvl},watcher,banish,startRun,useFlash,P,R,touch,patYell,initAudio,fizzTick,fizzMe,FIZZ,grannyTick,grannyWoozy,grannyGrab,grannyMash,GRAN,smith:SMITH,W,wAttack,sprList,wApply,wStats,wHeld,wCycle,clickL,clickR,WEAPONS,pot:POT,PFX,potLand,potDrink,potThrow,beltAdd,potBrew,potMon,potTouch,POTIONS,INGREDIENTS,brew,brewAny,potInfo,ps,potHud,wLevelOf,wRanks,wChoice,wGainXp,wXpFor,wReward,smithTalk,BS,BOSSES,bossAt,danceKey,danceChart,bossStart,bossWin,bossTrophies,bMain,wPunch,BP,bpAct,bpUse,bossArmor};
lobbyWarm=prepareLobby();
requestAnimationFrame(frame);
