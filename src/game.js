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
import {createRooms,kilnGame,KILN} from './rooms.js';

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
const store={
  get:lsGet,set:lsSet
};

/* ---------- constants ---------- */
const WALL_H=1.25, EYE=0.62, PR=0.22;
const BIOMES=[
  {name:'The Old Stonework', wall:[1.0,0.92,0.82], floor:[0.9,0.85,0.8],  ceil:[0.7,0.65,0.6],   torch:[1.0,0.72,0.42], amb:[0.012,0.012,0.02], stone:[0.44,0.4,0.34], spec:[0.12,0.2,0.05], wet:0.5},
  {name:'Mossgrown Halls',   wall:[0.7,0.95,0.7],  floor:[0.65,0.85,0.6], ceil:[0.5,0.65,0.5],   torch:[1.0,0.8,0.5],   amb:[0.008,0.02,0.012], stone:[0.3,0.36,0.27], spec:[0.08,0.16,0.05], wet:0.9},
  {name:'The Frostvault',    wall:[0.7,0.85,1.1],  floor:[0.75,0.9,1.1],  ceil:[0.55,0.65,0.85], torch:[0.95,0.88,0.8], amb:[0.012,0.018,0.035], stone:[0.5,0.62,0.72], spec:[0.75,0.6,0.3], wet:0.3},
  {name:'Cinder Warrens',    wall:[1.15,0.65,0.5], floor:[1.0,0.6,0.5],   ceil:[0.8,0.45,0.4],   torch:[1.0,0.6,0.3],   amb:[0.03,0.008,0.004], stone:[0.24,0.2,0.19], spec:[0.3,0.22,0.08], wet:0.0},
  {name:'The Humming Rooms', wall:[1,1,0.8],     floor:[0.8,0.75,0.5],  ceil:[0.9,0.9,0.8],    torch:[1.0,0.93,0.7],  amb:[0.21,0.19,0.105], stone:[0.6,0.58,0.5], spec:[0.03,0.02,0.05], wet:0.35},
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
function biomeIx(depth){return (depth-1-Math.floor(depth/4))%4}
function floorKind(depth){if(depth>=4&&depth%4===0)return 'back';if(depth>=3&&depth%4===3)return 'cave';if(depth>=5&&depth%4===1)return 'dark';return 'maze'}
function genFloor(seedStr,depth){
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
    const special=bix===1?'shroom':bix===2?'ice':bix===3?'ember':'urn';
    const types=kind==='back'?['boxes','boxes','cabinet','cabinet','plant','chair','chair']:kind==='cave'?['bones','bones','sack',special,special,special,'urn']:['barrel','barrel','crate','crate','urn','sack','bones',special,special];
    const RAD={barrel:0.13,crate:0.15,urn:0.09,sack:0.11,ice:0.08,ember:0.11,boxes:0.15,cabinet:0.14,plant:0.08,chair:0.13};
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
  // face down an open corridor at the start
  let yaw=0;
  for(const d of DIRS){if(g[idx(stx+d[0],sty+d[1])]===0){yaw=Math.atan2(d[1],d[0]);break}}
  const bi=kind==='back'?4:biomeIx(depth);
  return {W,H,g,cw,ch,kind,dark:kind==='dark',back:kind==='back',base:kind==='back'?13:bi*3,panels,panelAt,pocketMask,phantoms,pockets,blk:0,boT:22+rng()*25,props,discs,safe,safeMask,npcs,reveal:false,door,sdoors,traps,pillars,sconces,rubble,frames:[],start:{tx:stx,ty:sty,yaw},exit:{tx:ex,ty:ey,x:ex+0.5,z:ey+0.5},items,shades,
          seen:new Uint8Array(W*H),dist:d0,bi,biome:BIOMES[bi],
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
if(SHADOWS){torchLight.castShadow=true;torchLight.shadow.mapSize.set(Q>=2?1024:512,Q>=2?1024:512);torchLight.shadow.camera.near=0.04;torchLight.shadow.camera.far=9;torchLight.shadow.bias=-0.003;torchLight.shadow.normalBias=0.025}
scene.add(torchLight);
const flashLight=new THREE.PointLight(0xd9edff,0,9,1);scene.add(flashLight);
const poolLights=[],shadLights=[];
for(let i=0;i<NPOOL;i++){const l=new THREE.PointLight(0xffffff,0,4,1.25);scene.add(l);poolLights.push(l)}
for(let i=0;i<NSHAD;i++){const l=new THREE.PointLight(0xffffff,0,4,1.25);l.castShadow=true;l.shadow.mapSize.set(512,512);l.shadow.camera.near=0.05;l.shadow.camera.far=8;l.shadow.bias=-0.004;l.shadow.normalBias=0.03;l.shadow.autoUpdate=false;l.userData.key='';scene.add(l);shadLights.push(l)}
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
  const tex=SAFE?null:SURFS.get(o.layer);
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
function getWorldMat(F,k){
  const office=k>=10,kd=k%10,panel=kd===4||kd===6,B=F.biome;
  const base=office?13:F.base;
  const layer=kd===3?12:base+(panel?3:kd===5?0:kd);
  const kind=kd===3?3:panel?2:kd===5?0:kd;
  const wet=kind===1?(office?0.25:F.kind==='cave'?1:B.wet):0;
  const gl2=office?BIOMES[4].spec:B.spec,g=kind===3?0.15:gl2[kind];
  const key=[layer,kd,wet].join(':');
  let m=worldMats.get(key);
  if(!m){m=worldMaterial({layer,kind,panel,bad:kd===6,phantom:kd===5,wet,depth:layer===13?0.02:layer===14?0.025:layer>=15?0.03:0.06});worldMats.set(key,m)}
  return m;
}
// characters, creatures and decor: painted procedural materials on top of physically based shading
const MAT_GLSL=`
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){return n3(p)*0.6+n3(p*2.3)*0.3+n3(p*5.1)*0.1;}
`;
function paintedMaterial(glowBase){
  if(Q===0)return new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,emissive:new THREE.Color(glowBase,glowBase,glowBase)});
  const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.7,metalness:0,side:THREE.DoubleSide});
  m.onBeforeCompile=sh=>{
    sh.uniforms.uGlowBase={value:glowBase};
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 aLoc;varying vec4 vLoc;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvLoc=aLoc;');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec4 vLoc;uniform float uGlowBase;float mRough=0.7;float mMetal=0.0;float mGlow=0.0;float mRim=0.0;'+MAT_GLSL)
      .replace('#include <color_fragment>',`
  {vec3 alb=vColor.rgb,q=vLoc.xyz;int m=int(vLoc.w+0.5);
    float fine=clamp(1.6+vViewPosition.z*0.45,0.0,1.0);
    float mott=fbm3(q*34.0);
    if(m==1){alb*=0.92+0.16*mott;mRough=0.55;}
    else if(m==2){
      float folds=n3(vec3(q.x*55.0,q.y*5.0,q.z*55.0));
      float weave=sin(q.y*1500.0)*sin((q.x+q.z)*1500.0);
      alb*=(0.8+0.26*folds)*(0.93+0.14*mott)*(1.0+0.07*weave*fine);mRough=0.95;
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
    else if(m==8){mRough=0.07;}
    else if(m==9){
      float sp=fbm3(q*60.0),cr=smoothstep(0.035,0.0,abs(n3(q*13.0)-0.5));
      alb*=0.72+0.45*sp;alb*=1.0-cr*0.5;mRough=0.88;
    }else if(m==10){
      float wv=n3(vec3(q.x*40.0,q.y*9.0,q.z*40.0));alb*=0.7+0.5*wv;mRough=1.0;mRim=1.0;
    }else if(m==11){mRough=0.1;mGlow=0.55;}
    diffuseColor.rgb=pow(max(alb,vec3(0.0)),vec3(2.2));
    if(m==7)diffuseColor.rgb*=0.1;
  }`)
      .replace('#include <roughnessmap_fragment>','float roughnessFactor=mRough;')
      .replace('#include <metalnessmap_fragment>','float metalnessFactor=mMetal;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
  {vec3 ec=pow(max(vColor.rgb,vec3(0.0)),vec3(2.2));
    totalEmissiveRadiance+=ec*(mGlow*1.6+uGlowBase);
    if(mRim>0.5){float rim=pow(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),3.0);totalEmissiveRadiance+=ec*rim*rim*1.6;}}`);
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
let worldMesh=null;
function buildMesh(F){
  const v=[],{W,H,g}=F,Y=WALL_H;
  const quad=(p,n,uv,layer)=>{for(const i of[0,1,2,0,2,3])v.push(p[i][0],p[i][1],p[i][2],n[0],n[1],n[2],uv[i][0],uv[i][1],layer)};
  const wall=(x,y)=>x<0||y<0||x>=W||y>=H||g[y*W+x]===1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(g[y*W+x]===1)continue;
    const pk=F.pocketMask[y*W+x]?10:0;
    const fu=[[x/2,y/2],[(x+1)/2,y/2],[(x+1)/2,(y+1)/2],[x/2,(y+1)/2]];
    quad([[x,0,y],[x+1,0,y],[x+1,0,y+1],[x,0,y+1]],[0,1,0],fu,1+pk);
    quad([[x,Y,y],[x+1,Y,y],[x+1,Y,y+1],[x,Y,y+1]],[0,-1,0],fu,(pk?4:F.panelAt[y*W+x]===2?6:F.panelAt[y*W+x]?4:2)+pk);
    if(wall(x+1,y))quad([[x+1,0,y],[x+1,0,y+1],[x+1,Y,y+1],[x+1,Y,y]],[-1,0,0],[[y,1],[y+1,1],[y+1,0],[y,0]],pk);
    if(wall(x-1,y))quad([[x,0,y],[x,0,y+1],[x,Y,y+1],[x,Y,y]],[1,0,0],[[y,1],[y+1,1],[y+1,0],[y,0]],pk);
    if(wall(x,y+1))quad([[x,0,y+1],[x+1,0,y+1],[x+1,Y,y+1],[x,Y,y+1]],[0,0,-1],[[x,1],[x+1,1],[x+1,0],[x,0]],pk);
    if(wall(x,y-1))quad([[x,0,y],[x+1,0,y],[x+1,Y,y],[x,Y,y]],[0,0,1],[[x,1],[x+1,1],[x+1,0],[x,0]],pk);
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
    // u runs along the corridor, w across it
    const b=(u0,y0,w0,u1,y1,w1,door)=>D.ax===0?box(D.tx+u0,y0,D.ty+w0,D.tx+u1,y1,D.ty+w1,door?3:0,0)
                                               :box(D.tx+w0,y0,D.ty+u0,D.tx+w1,y1,D.ty+u1,0,door?3:0);
    b(0.34,0,0,0.66,Y,0.14,false);b(0.34,0,0.86,0.66,Y,1,false);b(0.34,1.04,0.14,0.66,Y,0.86,false);
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
  if(worldMesh){scene.remove(worldMesh);worldMesh.geometry.dispose()}
  worldMesh=new THREE.Mesh(geo,mats);worldMesh.castShadow=true;worldMesh.receiveShadow=true;worldMesh.frustumCulled=false;worldMesh.matrixAutoUpdate=false;
  scene.add(worldMesh);
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
function buildNpc(n,t,ex,ey,ez,dtR){
  const dxp=ex-n.x,dzp=ez-n.z,dist=Math.hypot(dxp,dzp),toP=Math.atan2(dzp,dxp);
  const seated=n.type==='delver';
  if(n.yaw===undefined){
    n.hy=0;n.hp=0;
    if(seated){ // sit with the back to a wall when there is one
      n.yaw=n.wy!==undefined?n.wy:toP;
    }else n.yaw=n.type==='keeper'&&F.safe?Math.atan2(F.safe.z-n.z,F.safe.x-n.x):toP;
  }
  const wrap=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a};
  const talking=talk&&talk.npc===n;
  let diff=wrap(toP-n.yaw);
  if(!seated&&dist<5&&(Math.abs(diff)>0.45||talking)){const st=Math.sign(diff)*Math.min(Math.abs(diff),2.6*dtR);n.yaw+=st;diff-=st}
  const lim=seated?1.25:1.0,wantY=dist<6?clamp(diff,-lim,lim):Math.sin(t*0.4+n.ph)*0.35;
  const headY0=seated?0.62:0.84,wantP=dist<6?clamp(Math.atan2(ey-headY0,Math.max(dist,0.3)),-0.45,0.4):0;
  const k=Math.min(1,dtR*6);n.hy+=(wantY-n.hy)*k;n.hp+=(wantP-n.hp)*k;
  const ph=n.ph,br=Math.sin(t*1.7+ph),breath=br*0.004;
  const blink=((t*0.23+ph)%1)<0.035?0.12:1;
  const nod=talking?Math.sin(t*5.5)*0.05:0,jaw=talking?Math.max(0,Math.sin(t*9))*0.006:0;
  const B={p:[n.x+(n.ox||0),0,n.z+(n.oz||0)],R:rYaw(n.yaw)};
  const out={top:1,lantern:null};
  if(n.type==='keeper'){
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
  }else if(n.type==='map'){
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
  }else{
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
  }
  return out;
}
/* ---------- creatures in the same jointed style ---------- */
function buildShade(s,t,ex,ez){
  const chase=s.state===1&&s.stun<=0,tp=Math.atan2(ez-s.z,ex-s.x),fa=chase?tp:(s.face||0);
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
  const tp=Math.atan2(ez-s.z,ex-s.x),k=s.stun>0?0.6:1;
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
  const tp=Math.atan2(ez-s.z,ex-s.x),c=[0.022,0.022,0.027,9],k=WALL_H*0.95/1.2;
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
  const f={p:[pr.x,0,pr.z],R:rYaw(pr.r),lo:[pr.x*0.37,0,pr.z*0.37]},S=pr.s,st=F.biome.stone;
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
      seg(f,[x,0,z],[x+0.006,h,z],0.012,0.009,[0.8,0.8,0.7,1]);ball(f,[x+0.006,h,z],[0.035*S,0.018*S,0.035*S],pr.v?[0.25,1.5,1.2,7]:[0.75,0.2,0.12,1]);}
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
   Behaviour (rooms, ROOM_NAME, network messages) always follows D.kind; drawing and the keyhole glow follow D.look.
   To add a new door type: add one entry to DOOR_LOOKS (leaf + optional glow) and one to DOOR_KINDS ({look:'name'}).
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
  }
};
const DOOR_KINDS={galaxy:{look:'galaxy'},kiln:{look:'kiln'},fall:{disguise:true}};
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
function buildStatic(F){
  TB=DEC;DEC.n=0;
  const st=[...F.biome.stone,9],dk=[st[0]*0.8,st[1]*0.8,st[2]*0.8,9],iron=[0.1,0.09,0.085,4];
  const I=(x,z,yaw)=>({p:[x,0,z],R:rYaw(yaw||0),lo:[x*0.61,0,z*0.61]});
  for(const q of F.pillars)emit(mesh6('pillar'),I(q[0],q[1]),ZERO3,[1,1,1],st);
  if(F.safe){const f=I(F.safe.x,F.safe.z);emit(mesh6('pillar'),f,ZERO3,[1.15,0.3,1.15],st);emit(mesh6('bowl'),f,[0,0.375,0],[1,1,1],iron)}
  for(const r of F.rubble)emit(mesh6('octa'),I(r.x,r.z,r.r),[0,r.s*r.sy*0.6,0],[r.s*1.4,r.s*r.sy,r.s],dk);
  for(const q of F.sconces){const f=I(q.x,q.z);slab(f,[0,0.72,0],[0.05,0.2,0.05],iron);slab(f,[-q.dx*0.07,0.82,-q.dz*0.07],[0.12,0.04,0.12],iron)}
  for(const pr of F.props)buildProp(pr,F);
  for(const D of F.sdoors){
    const f={p:[D.x,0,D.z],R:rYaw(D.r),lo:[D.x*0.37,0,D.z*0.37]},band=[0.13,0.12,0.12,4];
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
const P={y:0,vy:0,vx:0,vz:0,airSpeed:2.7,jumpQ:0,keys:0,x:0,z:0,yaw:0,pitch:0,hp:3,fuel:100,stam:100,winded:false,flash:1,ward:0,shards:0,inv:0,bob:0,tx:-1,ty:-1,stepPh:0};
const R={seed:'',depth:1,score:0,time:0,gems:0,wind:false};
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
};
const KEEPER_LINES=['Sit. The fire keeps them out. Gems feed the fire, and the fire remembers you.','Still breathing? Good. Warm your hands and show me what you found.','Every hall below is hungrier than the last. Spend well.','The dark forgets its dead. I do not. What will you carry down?'];
const DELVER_TIPS=['The pale statues only walk when you look away. Keep your eyes on them and back off.','Blue wisps do not bite. They drink your flame, and that is worse.','A running jump clears a spike plate. Do not stand and think about it.','When your torch dies they smell you from much farther off.','The chime turns low and warm once the seal is broken. Follow it down.','Shades lose interest if you break their line of sight twice.'];
const clearPrompt=()=>{hudCache.prompt='';$('prompt').textContent=''};
function openTalk(n){
  if(state!=='play')return;
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
function act(){if(P.down){mpCycle();return}if(state==='play'&&nearNpc)openTalk(nearNpc);else if(state==='play'&&nearDoor)sdoorOpen(nearDoor);else useFlash()}
/* ---------- strange doors (the rooms themselves are in src/rooms.js) ---------- */
let nearDoor=null;
const ROOMS=createRooms(renderer,{post:POST,low:Q===0,
  say:(t,s)=>say(t,s),tone:(...a)=>tone(...a),noise:(...a)=>noise(...a),rumble:(...a)=>rumble(...a),
  hud:h=>{const el=$('roomHud');if(el.innerHTML!==h)el.innerHTML=h},
  hurtFx:()=>{const h=$('hurt');h.style.transition='none';h.style.opacity=1;requestAnimationFrame(()=>{h.style.transition='opacity .9s';h.style.opacity=0})},
  hint:()=>touch.on?'Stick: move, pull down to drop faster · JUMP turns the stone · DROP slams it down':pad.id?'Stick or D-pad: move · A turn · X slam down':'A D move · W turn · S faster · Space slam down'});
const ROOM_NAME={galaxy:'a door full of stars',kiln:'the glass kiln',fall:'a door with no floor behind it'};
// a fallen player rides along with the friend they follow, into that friend's strange door too
let RW=null,rvT=0;const NOIN={l:0,r:0,d:0,rot:0,drop:0,lx:0,ly:0};
function roomWatch(){
  const f=MP.on&&P.down&&(state==='play'||state==='pause')?MP.peers.get(MP.follow):null,rv=f&&f.away&&f.d===R.depth&&f.rv&&f.rv.d===R.depth&&performance.now()-f.rv.at<2000?f.rv:null;
  if(rv){
    if(!ROOMS.watching||!RW||RW.id!==f.id||RW.w!==rv.w){ROOMS.watch(rv.w,rv.q);RW={id:f.id,w:rv.w};document.body.classList.add('rwatch');$('fade').style.transition='none'}
    const nm=f.name.replace(/[<>&"']/g,''),lb=`Watching ${nm} · ${ROOM_NAME[rv.w]}`+(mpAlive().length>1?' · E to switch':'');
    ROOMS.label=lb;if(rv.w!=='kiln'){const el=$('roomHud'),h=`<small>${lb}</small>`;if(el.innerHTML!==h)el.innerHTML=h}
  }else if(RW||ROOMS.watching){
    if(ROOMS.watching)ROOMS.abort();
    RW=null;document.body.classList.remove('rwatch');
    if(state!=='room'){$('fade').style.transition='opacity .4s';$('fade').style.opacity=0}
  }
}
function sdoorOpen(D){
  if(state!=='play'||D.used||P.down||P.grab)return;
  D.used=true;nearDoor=null;buildStatic(F);clearPrompt();RW=null;document.body.classList.remove('rwatch');
  mpSend({k:'sd',d:R.depth,i:F.sdoors.indexOf(D),w:D.kind});
  sfx('door');
  state='room';P.away=true;P.vx=P.vz=0;mapBig=false;
  document.body.classList.add('inroom');$('tFlash').textContent=D.kind==='kiln'?'DROP':'FLASH';$('tJump').textContent=D.kind==='kiln'?'TURN':'JUMP';
  $('fade').style.transition='none';$('fade').style.opacity=1;
  ROOMS.start(D.kind,roomEnd);
}
// leave whatever room we are in without its ending, because the floor itself is changing
function roomLeave(){
  if(state!=='room')return;
  ROOMS.abort();roomClose();
}
function roomClose(){
  P.away=false;state='play';document.body.classList.remove('inroom');
  $('tFlash').textContent='FLASH';$('tJump').textContent='JUMP';
  $('fade').style.transition='opacity .4s';$('fade').style.opacity=0;
}
function roomEnd(res){
  const fall=res.k==='dead'&&res.why==='fall';
  if(res.k==='warp'){
    const n=1+(Math.random()*3|0);
    P.away=false;document.body.classList.remove('inroom');
    mpSend({k:'warp',d:R.depth+n});mpSys(myName()+' was thrown '+n+(n>1?' floors':' floor')+' down by a collapsing star, and took everyone along');
    descend(n,'The black hole throws you '+n+(n>1?' floors':' floor')+' down');
    return;
  }
  roomClose();
  if(res.k==='win'){
    const g=4+R.depth;wallet+=g;R.gems+=g;R.score+=80*R.depth;store.set('wallet',wallet);
    if(P.hp<maxHp())P.hp++;P.fuel=Math.min(100,P.fuel+30);P.inv=2;
    say('The kiln lets you go. '+g+' gems, and your wounds close a little.',4.5);sfx('shard');
    mpSend({k:'sdr',r:'esc'});mpSys(myName()+' beat the glass kiln');
    return;
  }
  mpSend({k:'sdr',r:fall?'fall':'kiln'});mpSys(myName()+(fall?' opened a door and fell to their death':' was buried in the glass kiln'));
  P.hp=0;
  $('deadTitle').textContent=fall?'THE PIT TAKES YOU':'THE KILN KEEPS YOU';
  die();
  if(MP.on)say(fall?'There was no floor. Your friends can still bring you back on the next floor.':'The kiln filled up. Your friends can still bring you back on the next floor.',5);
}
function roomInput(){
  return {l:keys.KeyA||keys.ArrowLeft||pad.mx<-0.5||touch.mx<-0.5||pad.dl,r:keys.KeyD||keys.ArrowRight||pad.mx>0.5||touch.mx>0.5||pad.dr,
    d:keys.KeyS||keys.ArrowDown||pad.my>0.5||touch.my>0.5||pad.dd,rot:keys.KeyW||keys.ArrowUp||keys.KeyE||pad.b0||pad.du||touch.jump,
    drop:keys.Space||pad.b2||touch.act,lx:pad.lx*1.35+(ROOMS.kind==='galaxy'?(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0):0),ly:pad.ly};
}
let doorMsgT=0, tipTimers=[];
let mapBig=false, usingLock=false, pausedAt=0, flashT=0, sealMsgT=0, lowFuelSaid=false, pingT=0, beatT=0, titleYaw=0;
let sens=store.get('sens',1);
$('sens').value=sens;
$('sens').addEventListener('input',e=>{sens=+e.target.value;store.set('sens',sens)});
$('startSel').addEventListener('change',e=>store.set('startDepth',+e.target.value));
let bright=clamp(+store.get('bright',1.3)||1.3,0.6,3);
function setBright(v,quiet){bright=clamp(v,0.6,3);store.set('bright',bright);document.querySelectorAll('.brightS').forEach(el=>el.value=bright);if(!quiet)say('Brightness '+Math.round(bright/1.3*100)+'%',1)}
document.querySelectorAll('.brightS').forEach(el=>{el.value=bright;el.addEventListener('input',e=>setBright(+e.target.value,true))});
$('qSel').value=QSET;
$('qSel').addEventListener('change',e=>{lsSet('quality',e.target.value);lsSet('safe',0);location.reload()});
$('gtx').checked=WANT_GTX;
$('gtx').addEventListener('change',e=>{lsSet('gtx',e.target.checked);lsSet('safe',0);location.reload()});

function solidAt(x,z){const tx=Math.floor(x),ty=Math.floor(z);return tx<0||ty<0||tx>=F.W||ty>=F.H||(F.g[ty*F.W+tx]&3)===1||F.g[ty*F.W+tx]===2}
let panelLvl=1;
function torchRadius(fu){if(fu===undefined)fu=state==='title'?100:P.fuel;return (1.6+6.0*Math.sqrt(Math.max(0,fu)/100))*(F.dark?0.5:1)*(F.back?0.45:1)}
function blocked(x,z){return solidAt(x-PR,z-PR)||solidAt(x+PR,z-PR)||solidAt(x-PR,z+PR)||solidAt(x+PR,z+PR)}
function los(x0,z0,x1,z1){
  const dx=x1-x0,dz=z1-z0,l=Math.hypot(dx,dz),n=Math.ceil(l/0.2);
  for(let i=1;i<n;i++){const t=i/n;if(solidAt(x0+dx*t,z0+dz*t))return false}
  return true;
}
function loadFloor(depth){
  R.depth=depth;
  if(depth>deepest){deepest=depth;store.set('deepest',deepest)}
  F=genFloor(R.seed,depth);panelLvl=1;P.grab=null;if(typeof MIM!=='undefined')mimicReset();
  buildMesh(F);buildStatic(F);buildSdf(F);
  P.x=F.start.tx+0.5;P.z=F.start.ty+0.5;P.yaw=F.start.yaw;P.pitch=0;P.shards=0;P.tx=-1;P.ty=-1;
  P.y=0;P.vy=0;P.vx=0;P.vz=0;P.keys=0;P.jumpQ=0;P.inSafe=false;nearNpc=null;
  sealMsgT=0;doorMsgT=0;
  onTileChange();
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
let deepest=Math.max(1,+store.get('deepest',1)||1,+((store.get('best',null)||{}).depth)||1);
function fillStartSel(){
  const sel=$('startSel'),want=clamp(+store.get('startDepth',1)||1,1,deepest);
  sel.innerHTML='';
  for(let d=1;d<=deepest;d++){const o=document.createElement('option');o.value=d;
    o.textContent='Depth '+d+(d===deepest&&d>1?' (deepest reached)':'');sel.appendChild(o)}
  sel.value=want;$('depthLbl').hidden=deepest<2;
}
function startRun(seed,depth,force){
  roomLeave();$('deadTitle').textContent='THE DARK TAKES YOU';
  if(MP.guest&&!force){mpJoinClick();return}
  const sd=force?depth:clamp(depth||+$('startSel').value||1,1,deepest);
  P.down=false;
  R.seed=(seed||randSeed()).toUpperCase();R.score=0;R.time=0;R.gems=0;R.startDepth=sd;
  P.hp=maxHp();P.fuel=100;P.stam=100;P.winded=false;P.flash=1+Math.floor((sd-1)/3)+(up.band|0);P.ward=0;R.wind=false;P.inv=0;P.chill=0;lowFuelSaid=false;
  loadFloor(sd);
  state='play';
  ['title','pause','dead','talk'].forEach(id=>$(id).classList.add('hidden'));talk=null;
  $('hud').classList.remove('hidden');$('map').classList.remove('hidden');
  say(sd>1?`Depth ${sd}: ${F.name}`:'Find 3 shards to break the seal',4);showTips();
  initAudio();
  if(MP.host)mpSendRun();
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
  roomLeave();
  if(MP.on)mpLeave(false);
  state='title';
  ['pause','dead','hud','map','talk'].forEach(id=>$(id).classList.add('hidden'));talk=null;clearPrompt();
  $('title').classList.remove('hidden');
  showBest();
  if(document.pointerLockElement)document.exitPointerLock();
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
  if(state!=='pause')return;
  state='play';$('pause').classList.add('hidden');
  if(withLock)lock();
}
function lock(){
  try{const p=canvas.requestPointerLock({unadjustedMovement:true});
    if(p&&p.catch)p.catch(()=>{try{const q=canvas.requestPointerLock();if(q&&q.catch)q.catch(()=>{})}catch(e){}})}
  catch(e){try{canvas.requestPointerLock()}catch(e2){}}
}
let toastTimer=0;
function say(t,secs){const el=$('toast');el.textContent=t;el.style.opacity=1;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.opacity=0,(secs||2.5)*1000)}

function die(){
  roomLeave();
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
  n=n||1;roomLeave();
  state='trans';
  const bonus=why?0:100*R.depth+Math.round(P.fuel);
  R.score+=bonus;
  sfx('descend');
  $('fade').style.opacity=1;
  setTimeout(()=>{
    P.fuel=Math.min(100,P.fuel+25);lowFuelSaid=false;
    if(P.down){P.down=false;P.hp=maxHp();P.fuel=Math.max(P.fuel,50);P.inv=2;say('You rise again',2)}
    loadFloor(R.depth+n);
    $('fade').style.transition='';$('fade').style.opacity=0;
    say((why?why+'. ':'')+`Depth ${R.depth}: ${F.name}`,why?5:3.5);showTips();
    state='play';
  },550);
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
  P.keys=Math.max(0,P.keys-1);F.doorOpen=true;F.g[F.door.ty*F.W+F.door.tx]=0;F.frames.push(F.door);F.door=null;buildMesh(F);buildSdf(F);onTileChange();
  if(!quiet){sfx('door');say('The gate grinds open',2.5)}
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
function mpLink(){return location.origin+location.pathname+'?room='+MP.code+(MP.local?'&net=local':'')}
function mpPeer(id){
  let p=MP.peers.get(id);
  if(!p){const c=MP_COLS[hashStr(id||'')%MP_COLS.length];p={id,name:'Delver',col:c,hex:toHex(c),d:0,run:false,down:false,inv:0,walk:0,spd:0,fu:100};MP.peers.set(id,p)}
  return p;
}
const hostName=()=>{const h=MP.peers.get(MP.hostId);return h?h.name:'the host'};
function mpOpen(code){
  MP.code=code;MP.on=true;MP.local=new URLSearchParams(location.search).get('net')==='local';
  const room=openRoom(code,MP.local);MP.room=room;MP.id=room.id;
  room.onPeerJoin=id=>{mpPeer(id);mpSend({k:'hi',n:myName(),h:MP.host},id);if(MP.host)mpSend(mpCfg(),id);if(VOX.stream)room.addStream(VOX.stream,id);mpTitle()};
  room.onPeerLeave=id=>mpGone(id);
  room.onPeerStream=(st,id)=>{if(MP.room===room){initAudio();VOX.attach(id,st)}};
  room.onBinary=(buf,meta,from)=>{if(MP.room===room&&from)try{mpBinary(buf,meta||{},from)}catch(e){console.warn('emberdeep clip',e)}};
  if(VOX.stream)room.addStream(VOX.stream);
  room.onMessage=(m,from)=>{if(!m||!from||MP.room!==room)return;try{mpRecv(m,from)}catch(e){console.warn('emberdeep net',e)}};
}
function mpLeave(endIfDown){
  if(MP.room)try{MP.room.leave()}catch(e){}
  Object.assign(MP,{room:null,on:false,host:false,guest:false,hostId:null,run:null,wantJoin:false,code:'',follow:null});
  for(const id of MP.peers.keys())VOX.detach(id);
  MP.peers.clear();
  if(chatOpen)chatClose(false);chatLog.textContent='';
  try{const u=new URL(location.href);if(u.searchParams.has('room')){u.searchParams.delete('room');u.searchParams.delete('net');history.replaceState(null,'',u)}}catch(e){}
  if(P.down){P.down=false;if(endIfDown&&state!=='title'&&state!=='dead')die()}
  mpTitle();
}
// the host button: open a room, start a run, copy the invite link
function mpHost(){
  if(MP.on)mpLeave(false);
  MP.host=true;MP.guest=false;
  mpOpen(newRoomCode());
  startRun($('seedIn').value.trim());
  lock();
  const link=mpLink(),fallback=()=>say('Room '+MP.code+'. Press Esc for the invite link.',4);
  try{navigator.clipboard.writeText(link).then(()=>say('Invite link copied. Send it to your friends.',4),fallback)}catch(e){fallback()}
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
function mpSendRun(to){
  if(!MP.host||!F)return;
  const got=[];F.items.forEach((it,i)=>{if(it.got)got.push(i)});
  mpSend({k:'run',seed:R.seed,d:R.depth,sd:R.startDepth,t:r2(R.time),got,door:F.doorOpen?1:0,sdo:F.sdoors.map(q=>q.used?1:0),sh:P.shards,ke:P.keys,blk:F.blk|0},to);
}
function mpApplyRun(r){
  startRun(r.seed,r.d,true);
  R.startDepth=r.sd;R.time=r.t;
  for(const i of r.got||[]){const it=F.items[i];if(it)it.got=true}
  if(r.door&&F.door)openDoor(true);
  if(Array.isArray(r.sdo)){r.sdo.forEach((u,i)=>{if(u&&F.sdoors[i])F.sdoors[i].used=true});buildStatic(F)}
  P.shards=r.sh|0;P.keys=r.ke|0;
  if(F.back&&r.blk)F.blk=r.blk;
  say(`You joined ${hostName()}'s game`,3);
}
function mpGone(id){
  const p=MP.peers.get(id);MP.peers.delete(id);VOX.detach(id);
  if(p&&p.greeted&&state!=='title'){say(p.name+' left',2.5);mpSys(p.name+' left')}
  if(MP.guest&&id===MP.hostId){
    MP.hostId=null;MP.run=null;
    if(state==='title'||!MP.wantJoin)mpTitle();
    else{say('The host left. The maze is yours alone now.',4);mpLeave(true)}
  }else mpTitle();
}
function mpDown(){
  P.down=true;P.hp=0;clearPrompt();sfx('die');rumble(300,1,0.8);
  say('You have fallen. Reach the next floor together and you rise again.',5);
}
function mpDescend(n,why){
  if(state==='pause')$('pause').classList.add('hidden');
  if(state==='talk'){$('talk').classList.add('hidden');talk=null}
  descend(n,why);
}
function mpRecv(m,from){
  const p=mpPeer(from),fromHost=from===MP.hostId;
  p.seen=performance.now();
  const inRun=state!=='title'&&state!=='dead'&&!(MP.guest&&!MP.wantJoin);
  const here=m.d===R.depth;
  switch(m.k){
    case 'hi':
      p.name=String(m.n||'Delver').slice(0,16);
      if(m.h&&MP.guest){MP.hostId=from;p.host=true}
      if(!p.greeted){p.greeted=true;if(inRun)say(p.name+' joined',2.5);mpSys(p.name+' joined');if(MP.host&&state!=='title'&&state!=='dead')mpSendRun(from)}
      mpTitle();break;
    case 'run':
      if(!fromHost)return;
      MP.run=m;if(MP.wantJoin)mpApplyRun(m);
      mpTitle();break;
    case 'p':{
      const a=m.a;if(!Array.isArray(a))return;
      p.d=m.d;p.x=+a[0];p.z=+a[1];p.y=+a[2];p.yaw=+a[3];p.pitch=+a[4];p.fu=+a[5];p.down=!!(a[6]&1);p.safe=!!(a[6]&2);p.run=!!(a[6]&4);p.away=!!(a[6]&8);p.hp=a[7];
      if(p.rx===undefined||p.rd!==p.d||Math.hypot(p.x-p.rx,p.z-p.rz)>3){p.rx=p.x;p.rz=p.z;p.ry=p.y;p.ryaw=p.yaw;p.rpitch=p.pitch;p.rd=p.d}
      break;}
    case 'm':{
      if(!fromHost||!inRun||!here)return;
      const e=m.t-R.time;if(Math.abs(e)>1)R.time=m.t;else R.time+=e*0.2;
      if(F.back&&(m.b|0)!==(F.blk|0))setBlk(m.b|0);
      let j=0;const a=m.s||[];
      for(const s of F.shades){
        if(s.type===3)continue;
        if(j+5>=a.length)break;
        s.nx=a[j];s.nz=a[j+1];s.face=a[j+2];s.state=a[j+3];s.stun=a[j+4];s.frozen=!!a[j+5];j+=6;
        s.gx=Math.floor(s.nx);s.gy=Math.floor(s.nz);s.px=-1;
        if(s.x<0||Math.hypot(s.nx-s.x,s.nz-s.z)>2.5){s.x=s.nx;s.z=s.nz}
      }
      if(Array.isArray(m.mi)){const q=m.mi;Object.assign(MIM,{x:+q[0],z:+q[1],face:+q[2],st:q[3]|0,as:String(q[4]||''),vic:String(q[5]||'')});if(MIM.st===2||MIM.st===3){if(Math.abs(MIM.t-q[6])>0.3)MIM.t=+q[6]}}
      break;}
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
      say(p.name+' opened a strange door',2.5);mpSys(p.name+' opened '+(ROOM_NAME[m.w]||'a strange door'));
      break;}
    case 'rv':if(m.q&&typeof m.q==='object'&&(m.w==='galaxy'||m.w==='kiln'||m.w==='fall')){p.rv={w:m.w,q:m.q,d:m.d,at:performance.now()};if(RW&&RW.id===from&&RW.w===m.w)ROOMS.sync(m.q)}break;
    case 'sdr':if(inRun)say(m.r==='esc'?p.name+' beat the glass kiln':m.r==='fall'?p.name+' fell to their death':p.name+' was buried in the glass kiln',3);break;
    case 'warp':{
      const n=(m.d|0)-R.depth;
      if(inRun&&state!=='trans'&&n>=1&&n<=3)mpDescend(n,p.name+' woke a black hole. It throws you all '+n+(n>1?' floors':' floor')+' down');
      break;}
    case 'down':if(inRun&&state!=='trans'&&m.d===R.depth+1){say(p.name+' found the way down',2);mpDescend()}break;
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
  }
}
// the host's view of everyone the creatures can hunt
function mpTargets(){
  const T=[];
  if(!P.down)T.push({x:P.x,z:P.z,yaw:P.yaw,fuel:P.fuel,inSafe:P.inSafe||P.away,inv:P.inv,loc:true,tx:P.tx,ty:P.ty});
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
const mpFresh=p=>performance.now()-(p.seen||0)<15000;
const mpShown=p=>MP.on&&p.run&&!p.away&&p.d===R.depth&&p.rx!==undefined&&state!=='title'&&mpFresh(p);
function mpTick(raw){
  if(!MP.on)return;
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
  if(state==='title'||state==='dead'||(MP.guest&&!MP.wantJoin))return;
  MP.pt-=raw;
  if(MP.pt<=0){
    MP.pt=1/15;
    mpSend({k:'p',d:R.depth,a:[r3(P.x),r3(P.z),r3(P.y),r3(P.yaw),r3(P.pitch),Math.round(P.fuel),(P.down?1:0)|(P.inSafe||P.away?2:0)|4|(P.away?8:0),P.hp]});
  }
  rvT-=raw;
  if(state==='room'&&rvT<=0&&MP.peers.size){rvT=0.1;const q=ROOMS.snap();if(q)mpSend({k:'rv',d:R.depth,w:ROOMS.kind,q})}
  if(MP.host&&state!=='trans'){
    MP.mt-=raw;
    if(MP.mt<=0){
      MP.mt=0.1;
      const a=[];for(const s of F.shades){if(s.type===3)continue;a.push(r2(s.x),r2(s.z),r2(s.face||0),s.state|0,r2(Math.max(0,s.stun||0)),s.frozen?1:0)}
      const M=MIM;
      mpSend({k:'m',d:R.depth,t:r2(R.time),b:F.blk|0,s:a,mi:[r2(M.x),r2(M.z),r2(M.face),M.st,M.as,M.vic,r2(M.t)]});
    }
    // everyone is down: the run is over for the whole room
    if(P.down&&!mpAlive().length){mpSend({k:'wipe'});MP.wiping=true;die();MP.wiping=false}
  }
}
// friends drawn in the maze, built from the same jointed parts as everyone else
function buildPlayer(p,t,rev,et){
  rev=rev||0;et=et||0;
  const c=p.col,cloak=[c[0]*0.72,c[1]*0.72,c[2]*0.72,2],cloakD=[c[0]*0.42,c[1]*0.42,c[2]*0.42,2];
  const leg=[0.22,0.17,0.13,2],boot=[0.3,0.19,0.1,3],belt=[0.3,0.17,0.08,3],skin=[0.86,0.65,0.5,1],wood=[0.36,0.23,0.12,6],rag=[0.13,0.1,0.08,2];
  const S=0.94,v=(x,y,z)=>[x*S,y*S,z*S],ph=hashStr(p.id)%100;
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
  const HS={p:H.p,R:H.R.map(q=>q*S)};
  face(HS,{skin,blink:((t*0.23+ph*0.01)%1)<0.035?0.12:1,iris:[0.3,0.25,0.18],brow:[0.25,0.16,0.1,5],browH:0.006,eyeS:1.1,nose:[0.012,0.013,0.011],mouth:[0.6,0.32,0.3],mouthW:0.022});
  ball(HS,[-0.03,0.1,0],[0.088,0.1,0.094],cloak);
  ball(HS,[-0.05,0.04,0],[0.07,0.07,0.09],cloakD,true);
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
    const q=buildPlayer(p,t).torch;
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
    if(vis){tagV.set(MIM.rx,1.08,MIM.rz).project(camera);if(tagV.z>1||Math.abs(tagV.x)>1.1||Math.abs(tagV.y)>1.1)vis=false}
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
    if(vis){tagV.set(p.rx,1.08+p.ry,p.rz).project(camera);if(tagV.z>1||Math.abs(tagV.x)>1.1||Math.abs(tagV.y)>1.1)vis=false}
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
  $('startBtn').textContent=g?(MP.run?('JOIN '+hostName().toUpperCase()):'LOOKING FOR HOST…'):'DESCEND';
  $('hostBtn').hidden=g;$('soloBtn').hidden=!g;$('seedLbl').hidden=g;
  if(g)$('depthLbl').hidden=true;
  $('mpJoinLine').textContent=g?(MP.run?`${hostName()} is at depth ${MP.run.d}. ${n} player${n>1?'s':''} in room ${MP.code}.`:`Room ${MP.code}: waiting for the host to answer. Keep this page open.`):'';
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
$('hostBtn').addEventListener('click',mpHost);
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
  if(mode==='off'){if(VOX.stream&&MP.room)MP.room.removeStream(VOX.stream);VOX.disable();return}
  initAudio();
  const had=!!VOX.stream;
  if(!await VOX.enable(mode)){say('No microphone, or permission was refused',3);document.querySelectorAll('.voiceSel').forEach(el=>el.value='off');voiceMode='off';return}
  if(!had&&MP.on&&MP.room)MP.room.addStream(VOX.stream);
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
  $('proxChk').checked=MP.prox;$('mimicChk').checked=MP.mimicOn;
  $('brainLine').textContent=BRAIN.on?(BRAIN.ok===true?'Local AI is answering.':BRAIN.ok===false?'Local AI is not answering; the mimic picks lines itself.':'Waiting for the first clip.'):'';
  $('guestOpts').textContent=MP.on&&MP.guest?`Host settings: voices ${MP.prox?'fade with distance':'carry everywhere'}, mimic ${MP.mimicOn?'on':'off'}.`:'';
}
document.querySelectorAll('.voiceSel').forEach(el=>{el.value=voiceMode;el.addEventListener('change',()=>mpVoiceSet(el.value))});
$('proxChk').addEventListener('change',()=>{MP.prox=$('proxChk').checked;store.set('prox',MP.prox);mpSend(mpCfg())});
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
const MIM={x:-99,z:-99,rx:-99,rz:-99,face:0,rface:0,st:0,as:'',vic:'',t:0,hid:40,sayT:5,gx:0,gy:0,px:-1,py:-1,walk:0,spd:0,lastKey:'',vd:null,vdKey:'',voice:null,depth:0};
// st: 0 hidden, 1 stalking, 2 revealing (eating), 3 recoiling from a flash
function mimicReset(){Object.assign(MIM,{x:-99,z:-99,rx:-99,rz:-99,st:0,hid:30+Math.random()*25,t:0,vd:null,vdKey:'',as:'',vic:''})}
const tid=t=>t.loc?MP.id:t.p.id;
function mimicHost(dt,TG){
  const M=MIM;
  if(!MP.on||!MP.mimicOn){if(M.st)mimicReset();return}
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
  if(M.st===3){if(M.t>0.7){M.st=0;M.x=M.z=-99;M.hid=18+Math.random()*12}return}
  const V=TG.find(t=>tid(t)===M.vic);
  if(M.st===2){if(M.t>1.6){mimicReset()}return}
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
  for(const L of CLIPS.values()){const c=L.find(q=>q.key===key);if(c){
    VOX.playClip(key,c.buf,mpEar(MIM.rx,MIM.rz,R.depth,true)).then(h=>{MIM.voice=h});return}}
}
// you are the one it reached
function mimicEat(){
  if(P.down||P.grab||state==='title'||state==='dead')return;
  P.grab={t:0,x:MIM.rx>0?MIM.rx:P.x+Math.cos(P.yaw),z:MIM.rx>0?MIM.rz:P.z+Math.sin(P.yaw)};for(const k in keys)keys[k]=false;
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
  const M=MIM;if(M.st===0||M.rx<0||!MP.on)return;
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
  if(e.target&&e.target.tagName==='SELECT')return;
  if(e.target&&e.target.tagName==='INPUT'){if(e.code==='Enter'&&(e.target.id==='seedIn'||e.target.id==='nameIn')){e.target.blur();startRun($('seedIn').value.trim())}return}
  if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  keys[e.code]=true;
  initAudio();
  if(e.code==='KeyF'){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{})}
  if(e.code==='KeyV')toggleMute();
  if(e.code==='BracketRight')setBright(bright+0.15);
  if(e.code==='BracketLeft')setBright(bright-0.15);
  if(state==='title'){if(e.code==='Enter')startRun($('seedIn').value.trim())}
  else if(state==='play'){
    if(e.code==='Space')P.jumpQ=0.15;
    if(e.code==='KeyE')act();
    if(e.code==='KeyM'||e.code==='Tab')mapBig=!mapBig;
    if(e.code==='Escape'||e.code==='KeyP')pause();
    if((e.code==='Enter'||e.code==='NumpadEnter'||e.code==='KeyT')&&MP.on){e.preventDefault();chatOpenBox()}
  }else if(state==='room'){
    if((e.code==='Enter'||e.code==='NumpadEnter'||e.code==='KeyT')&&MP.on){e.preventDefault();chatOpenBox()}
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
    if(e.code==='Enter')startRun();
    if(e.code==='KeyR')startRun(R.seed,R.startDepth);
    if(e.code==='KeyT')toTitle();
  }
});
addEventListener('keyup',e=>{keys[e.code]=false});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;pause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
document.addEventListener('mousemove',e=>{
  if((state!=='play'&&state!=='room')||document.pointerLockElement!==canvas)return;
  const mx=e.movementX,my=e.movementY;
  if(!isFinite(mx)||!isFinite(my)||Math.abs(mx)>600||Math.abs(my)>600)return;
  if(state==='room'){ROOMS.look(mx*0.0022*sens,my*0.0022*sens);return}
  P.yaw+=mx*0.0022*sens;
  P.pitch=clamp(P.pitch-my*0.0022*sens,-0.9,0.9);
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas)usingLock=true;
  else if(usingLock){usingLock=false;pause()}
});
canvas.addEventListener('click',()=>{if((state==='play'||state==='room')&&!document.pointerLockElement)lock()});
canvas.addEventListener('mousedown',e=>{if(state!=='play'||document.pointerLockElement!==canvas)return;if(e.button===0)act();else if(e.button===2)P.jumpQ=0.15});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('startBtn').addEventListener('click',()=>{startRun($('seedIn').value.trim());lock()});
$('resumeBtn').addEventListener('click',()=>resume(true));
$('againBtn').addEventListener('click',()=>{startRun();lock()});
// touch controls
const touch={on:false,mx:0,my:0,jump:false,stickId:null,lookId:null,sx:0,sy:0,lx:0,ly:0};
function enableTouch(){
  if(touch.on)return;touch.on=true;document.body.classList.add('touch');
  const upd=()=>{$('rotHint').textContent=innerHeight>innerWidth?'Turn your phone sideways for a wider view':''};
  upd();addEventListener('resize',upd);
}
if(window.matchMedia&&matchMedia('(pointer:coarse)').matches)enableTouch();
addEventListener('touchstart',()=>{enableTouch();initAudio()},{passive:true});
{
  const layer=$('touch'),base=$('stickBase'),knob=$('stickKnob'),SR=52;
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
      if(touch.stickId===null&&t.clientX<innerWidth*0.45){
        touch.stickId=t.identifier;touch.sx=t.clientX;touch.sy=t.clientY;
        base.style.left=knob.style.left=t.clientX+'px';base.style.top=knob.style.top=t.clientY+'px';
        base.style.display=knob.style.display='block';
      }else if(touch.lookId===null){touch.lookId=t.identifier;touch.lx=t.clientX;touch.ly=t.clientY}
    }
  },{passive:false});
  layer.addEventListener('touchmove',e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier===touch.stickId)setStick(t.clientX,t.clientY);
      else if(t.identifier===touch.lookId){
        if(state==='room')ROOMS.look((t.clientX-touch.lx)*0.0062*sens,(t.clientY-touch.ly)*0.005*sens);
        if(state==='play'){P.yaw+=(t.clientX-touch.lx)*0.0062*sens;P.pitch=clamp(P.pitch-(t.clientY-touch.ly)*0.005*sens,-0.9,0.9)}
        touch.lx=t.clientX;touch.ly=t.clientY;
      }
    }
  },{passive:false});
  const end=e=>{for(const t of e.changedTouches){if(t.identifier===touch.stickId)endStick();else if(t.identifier===touch.lookId)touch.lookId=null}};
  layer.addEventListener('touchend',end);layer.addEventListener('touchcancel',end);
  const btn=(id,down,up)=>{const el=$(id);
    el.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();el.classList.add('on');down()},{passive:false});
    const u=e=>{e.preventDefault();e.stopPropagation();el.classList.remove('on');if(up)up()};
    el.addEventListener('touchend',u);el.addEventListener('touchcancel',u);
    el.addEventListener('touchmove',e=>{e.preventDefault();e.stopPropagation()},{passive:false});};
  btn('tJump',()=>{touch.jump=true;P.jumpQ=0.15},()=>{touch.jump=false});
  btn('tFlash',()=>{touch.act=true;if(state==='play')act()},()=>{touch.act=false});
  btn('tPause',()=>{touch.jump=false;endStick();touch.lookId=null;pause()});
  btn('tMap',()=>{mapBig=!mapBig});
  btn('tTalk',()=>{touch.talk=true},()=>{touch.talk=false});
  btn('tChat',()=>{chatOpenBox()});
  $('quitBtn').addEventListener('click',toTitle);
  $('retryBtn').addEventListener('click',()=>startRun(R.seed,R.startDepth));
  document.addEventListener('contextmenu',e=>{if(touch.on)e.preventDefault()});
}
// optional gamepad
// Xbox-style controller (standard mapping): sticks move and look, A jump, X/B/RT flash,
// LT/LB/left-stick click sprint, Y map, Start pause, Back quits to title from a menu
const pad={mx:0,my:0,lx:0,ly:0,sprint:false,jump:false,prev:[],gp:null,id:''};
function pickPad(){
  const list=navigator.getGamepads?navigator.getGamepads():[];let best=null;
  for(const g of list){if(!g||!g.connected||g.buttons.length<10||g.axes.length<4)continue;if(g.mapping==='standard')return g;if(!best)best=g}
  return best;
}
function rumble(ms,strong,weak){
  try{const a=pad.gp&&pad.gp.vibrationActuator;if(a&&a.playEffect)a.playEffect('dual-rumble',{duration:ms,strongMagnitude:strong,weakMagnitude:weak})}catch(e){}
}
function pollPad(){
  pad.mx=pad.my=pad.lx=pad.ly=0;pad.sprint=false;pad.jump=false;pad.b0=pad.b2=pad.du=pad.dd=pad.dl=pad.dr=false;
  const gp=pickPad();pad.gp=gp;
  if(!gp){if(pad.id){pad.id='';$('padLine').textContent='';pad.prev=[]}return}
  if(pad.id!==gp.id){pad.id=gp.id;initAudio();
    $('padLine').innerHTML='Controller connected. <b>Left stick</b> move · <b>Right stick</b> look · <b>A</b> jump · <b>X</b> or <b>RT</b> flash · <b>LT</b> or click left stick to sprint · <b>Y</b> map · <b>Start</b> pause';
    if(state==='play')say('Controller connected',2)}
  const B=i=>{const b=gp.buttons[i];return !!b&&(b.pressed||b.value>0.4)};
  pad.b0=B(0);pad.b2=B(2);pad.du=B(12);pad.dd=B(13);pad.dl=B(14);pad.dr=B(15);
  const hit=i=>B(i)&&!pad.prev[i];
  const curve=v=>{const a=Math.abs(v);if(a<0.2)return 0;const k=(a-0.2)/0.8;return Math.sign(v)*k};
  pad.mx=curve(gp.axes[0]||0);pad.my=curve(gp.axes[1]||0);
  const lx=curve(gp.axes[2]||0),ly=curve(gp.axes[3]||0);
  pad.lx=lx*(0.45+0.55*Math.abs(lx))*sens;pad.ly=ly*(0.45+0.55*Math.abs(ly))*sens;
  if(state==='play'){
    pad.jump=B(0)&&performance.now()>padHold;
    if(B(6)||B(4))pad.sprint=true;
    if(hit(10))pad.sprintLatch=!pad.sprintLatch;
    if(Math.hypot(pad.mx,pad.my)<0.3)pad.sprintLatch=false;
    if(pad.sprintLatch)pad.sprint=true;
    if(hit(2)||hit(1)||hit(7))act();
    if(hit(3))mapBig=!mapBig;
    if(hit(9))pause();
    if(hit(14))setBright(bright-0.15);
    if(hit(15))setBright(bright+0.15);
  }else if(state==='title'){if(hit(0)||hit(9))startRun($('seedIn').value.trim());
    const sel=$('startSel');if(hit(14)&&+sel.value>1){sel.value=+sel.value-1;store.set('startDepth',+sel.value)}
    if(hit(15)&&+sel.value<deepest){sel.value=+sel.value+1;store.set('startDepth',+sel.value)}}
  else if(state==='talk'){
    const sy=(gp.axes[1]||0)>0.6?1:(gp.axes[1]||0)<-0.6?-1:0;
    if(hit(12)||(sy<0&&pad.psy!==-1))moveTalk(-1);else if(hit(13)||(sy>0&&pad.psy!==1))moveTalk(1);
    pad.psy=sy;
    if(hit(0)||hit(2))pickTalk();else if(hit(1)||hit(9))closeTalk();
  }
  else if(state==='pause'){if(hit(0)||hit(9))resume(false);else if(hit(8))toTitle()}
  else if(state==='dead'){if(hit(0)||hit(9))startRun();else if(hit(2))startRun(R.seed,R.startDepth);else if(hit(8)||hit(1))toTitle()}
  for(let i=0;i<gp.buttons.length;i++)pad.prev[i]=B(i);
}
addEventListener('gamepadconnected',()=>{});

/* ---------- audio (all synthesized) ---------- */
let ac=null,master=null,muted=store.get('muted',false),noiseBuf=null;
function initAudio(){
  if(ac){if(ac.state==='suspended')ac.resume();return}
  try{
    ac=new (window.AudioContext||window.webkitAudioContext)();
    master=ac.createGain();master.gain.value=muted?0:0.55;master.connect(ac.destination);
    noiseBuf=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);
    const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    // low ambient drone
    for(const[f,v]of[[55,0.05],[82.6,0.03],[110.7,0.015]]){const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(master);o.start()}
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
    humG=ac.createGain();humG.gain.value=0;humG.connect(master);
    const o=ac.createOscillator(),hp=ac.createBiquadFilter();o.type='sawtooth';o.frequency.value=120;hp.type='highpass';hp.frequency.value=700;o.connect(hp);hp.connect(humG);o.start();
    const o2=ac.createOscillator(),g2=ac.createGain();o2.frequency.value=60;g2.gain.value=1.6;o2.connect(g2);g2.connect(humG);o2.start();
    hvG=ac.createGain();hvG.gain.value=0;hvG.connect(master);
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
  out.connect(master);o.start(t);o.stop(t+dur+0.05);
}
function noise(dur,vol,freq,q){
  if(!ac)return;
  const t=ac.currentTime,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
  s.buffer=noiseBuf;s.loop=true;f.type='bandpass';f.frequency.value=freq;f.Q.value=q||1;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f);f.connect(g);g.connect(master);s.start(t,Math.random()*0.5);s.stop(t+dur+0.02);
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
    case 'seal':tone(110,0.4,'square',0.08,0,-30);break;
    case 'descend':[440,330,247,165].forEach((f,i)=>tone(f,0.6,'triangle',0.14,i*0.12));break;
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
function update(dt){
  R.time+=dt;
  // in a shared game the world keeps going while you pause or talk, but you stand still
  if(P.grab)mimicGrabTick(dt);
  const ctl=state==='play'&&!P.grab&&!GL.fall&&!(GL.rb&&!GL.rb.fwd);
  if(P.down)mpSpectate();
  else{
  // look
  const turn=ctl?(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0)+pad.lx*1.35:0;
  P.yaw+=turn*2.5*dt;
  if(pad.ly&&ctl)P.pitch=clamp(P.pitch-pad.ly*1.9*dt,-0.9,0.9);
  // move, with momentum kept through a jump
  let fwd=ctl?((keys.KeyW||keys.ArrowUp)?1:0)-((keys.KeyS||keys.ArrowDown)?1:0)-pad.my-touch.my:0;
  let str=ctl?(keys.KeyD?1:0)-(keys.KeyA?1:0)+pad.mx+touch.mx:0;
  const mag=Math.hypot(fwd,str);if(mag>1){fwd/=mag;str/=mag}
  const moving=mag>0.05, ground=P.y<=0;
  const wantSprint=(keys.ShiftLeft||keys.ShiftRight||pad.sprint||Math.hypot(touch.mx,touch.my)>0.94)&&moving&&!P.winded;
  if(ground){
    if(wantSprint){P.stam-=30*(1-0.2*(up.lungs|0))*dt;if(P.stam<=0){P.stam=0;P.winded=true}}
    else{P.stam=Math.min(100,P.stam+18*dt);if(P.winded&&P.stam>=30)P.winded=false}
  }
  const speed=(wantSprint?4.3:2.7)*(P.chill>0?0.55:1)*(1+0.06*(up.boots|0));
  const cy=Math.cos(P.yaw),sy=Math.sin(P.yaw);
  const dxn=cy*fwd-sy*str, dzn=sy*fwd+cy*str;
  if(ground){P.vx=dxn*speed;P.vz=dzn*speed}
  else if(moving){const k=Math.min(1,7*dt);P.vx+=(dxn*P.airSpeed-P.vx)*k;P.vz+=(dzn*P.airSpeed-P.vz)*k}
  if(P.jumpQ>0)P.jumpQ-=dt;
  if(ground&&ctl&&(P.jumpQ>0||keys.Space||pad.jump||touch.jump)){P.jumpQ=0;P.vy=3.5;P.y=0.0001;P.airSpeed=Math.max(speed*(wantSprint?1.18:1),2.7);sfx('jump')}
  if(P.y>0){P.vy-=11*dt;P.y+=P.vy*dt;if(P.y<=0){P.y=0;P.vy=0;sfx('step')}}
  const nx=P.x+P.vx*dt;if(!blocked(nx,P.z))P.x=nx;else if(ground)P.vx=0;
  const nz=P.z+P.vz*dt;if(!blocked(P.x,nz))P.z=nz;else if(ground)P.vz=0;
  for(const q of F.pillars){const ddx=P.x-q[0],ddz=P.z-q[1],dd=Math.hypot(ddx,ddz),m=0.2+PR;if(dd<m&&dd>1e-4){P.x=q[0]+ddx/dd*m;P.z=q[1]+ddz/dd*m}}
  if(F.safe){const ddx=P.x-F.safe.x,ddz=P.z-F.safe.z,dd=Math.hypot(ddx,ddz),m=0.3+PR;if(dd<m&&dd>1e-4){P.x=F.safe.x+ddx/dd*m;P.z=F.safe.z+ddz/dd*m}}
  for(const q of F.discs){const ddx=P.x-q[0],ddz=P.z-q[1],dd=Math.hypot(ddx,ddz),m=q[2]+PR;if(dd<m&&dd>1e-4){const nx2=q[0]+ddx/dd*m,nz2=q[1]+ddz/dd*m;if(!blocked(nx2,nz2)){P.x=nx2;P.z=nz2}}}
  for(const n of F.npcs){const X=n.x+(n.ox||0),Z=n.z+(n.oz||0),ddx=P.x-X,ddz=P.z-Z,dd=Math.hypot(ddx,ddz),m=0.16+PR;if(dd<m&&dd>1e-4){const nx2=X+ddx/dd*m,nz2=Z+ddz/dd*m;if(!blocked(nx2,nz2)){P.x=nx2;P.z=nz2}}}
  if(moving&&P.y<=0){
    P.bob+=speed*dt*2.3;
    const ph=Math.floor(P.bob/Math.PI);
    if(ph!==P.stepPh){P.stepPh=ph;sfx('step')}
  }
  if(Math.floor(P.x)!==P.tx||Math.floor(P.z)!==P.ty)onTileChange();
  // torch
  // sanctuary: the brazier feeds the torch and nothing hunts you here
  {const inS=F.safeMask[P.ty*F.W+P.tx]===1;
    if(inS!==P.inSafe){P.inSafe=inS;if(inS){say('A sanctuary. Nothing can follow you here.',3);sfx('descend')}}
    if(inS){P.fuel=Math.min(100,P.fuel+9*dt);P.stam=Math.min(100,P.stam+25*dt);P.chill=Math.min(P.chill,0.3);lowFuelSaid=false}
    else if(!F.back)P.fuel=Math.max(0,P.fuel-0.85*(1-0.15*(up.lamp|0))*dt);}
  // who is close enough to talk to
  {let best=null,bd=1.45;
    for(const n of F.npcs){const d=Math.hypot(n.x-P.x,n.z-P.z);if(d<bd&&los(P.x,P.z,n.x,n.z)){bd=d;best=n}}
    let nd=null;
    if(!best&&ctl){let dd=0.72;for(const D of F.sdoors){if(D.used)continue;const d=Math.hypot(D.x-P.x,D.z-P.z);if(d<dd&&(D.x-P.x)*Math.cos(P.yaw)+(D.z-P.z)*Math.sin(P.yaw)>d*0.45){dd=d;nd=D}}}
    if(best!==nearNpc||nd!==nearDoor){nearNpc=best;nearDoor=nd;if(state!=='room')$('tFlash').textContent=best?'TALK':nd?'OPEN':'FLASH'}
    if(state!=='room')setText('prompt',best?(touch.on?'TALK':pad.id?'X':'E')+': speak with '+NPC[best.type].name:nd?(touch.on?'OPEN':pad.id?'X':'E')+': open the strange door':'');}
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
      if(P.inv<=0&&!P.away&&P.y<0.22&&P.y>-0.2&&Math.abs(tr.x-P.x)<0.42&&Math.abs(tr.z-P.z)<0.42){hurt(null);if(state==='dead')return}
    }else tr.up=false;
  }
  } // end of the living player's turn
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
    s.ph+=dt*3;
    if(s.type===3){if(!P.down){watcher(s,dt,pfx,pfz);if(state==='dead')return}continue}
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
  if(TG)mimicHost(dt,TG);
  // heartbeat when hunted
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

/* ---------- fake glitches: things that look like bugs and are not ---------- */
// Every one of these is deliberate. They are rare, they happen only on your own screen, and they
// never start while something is hunting you, so they unsettle without ever costing a life.
// __game.glitch('freeze'|'rubber'|'rubberfwd'|'replay'|'hud'|'tpose'|'hole'|'fall'|'loop') forces one for testing.
const GL={cd:60,used:{},frz:0,frzAfter:null,buzz:null,hist:[],histT:0,rb:null,rbN:0,figs:[],hole:null,fall:null,loop:null,
  ghosts:[],walked:null,peerH:new Map(),hudOv:{},hudSeq:null,chatT:0,dip:0,netEl:null,netT:0};
function glReset(){
  GL.cd=F.back?28+Math.random()*30:55+Math.random()*60;GL.used={};GL.frz=0;GL.frzAfter=null;GL.hist=[];GL.rb=null;
  GL.figs=[];GL.ghosts=[];GL.fall=null;GL.loop=null;GL.hudOv={};GL.hudSeq=null;GL.dip=0;GL.walked=new Uint8Array(F.W*F.H);
  glHoleOff();if(GL.grid){scene.remove(GL.grid);GL.grid=null}
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
  if(GL.netT>0){GL.netT-=dt;if(GL.netT<=0)glNet('')}
  if(GL.chatT>0)GL.chatT-=dt;
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
  // the director: every so often, if the moment is right, something goes wrong
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
function glStart(k,forced){
  if(state!=='play')return false;
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
function glUnfreeze(){
  if(GL.buzz){try{GL.buzz.stop()}catch(e){}GL.buzz=null;if(master)master.gain.setValueAtTime(muted?0:0.55,ac.currentTime)}
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
function glTellRoom(from){if(MP.on)mpSend({k:'gl',w:'rb',d:R.depth,x:r2(from[0]),z:r2(from[1]),yaw:r2(from[2])})}
function glRecv(m,p){
  if(m.w==='rb'&&m.d===R.depth&&state!=='title'&&state!=='dead'&&isFinite(+m.x)&&isFinite(+m.z))
    GL.ghosts.push({x:+m.x,z:+m.z,yaw:+m.yaw||0,col:p.col,id:p.id,t:7+Math.random()*3});
}
// multiplayer only: a friend in front of you rewinds two seconds and walks it again
function glReplay(){
  let best=null,bd=13;
  const fx=Math.cos(P.yaw),fz=Math.sin(P.yaw);
  for(const p of mpAlive()){const d=Math.hypot(p.rx-P.x,p.rz-P.z),h=GL.peerH.get(p.id);
    if(d<bd&&h&&h.length>=20&&((p.rx-P.x)*fx+(p.rz-P.z)*fz)/Math.max(d,0.1)>0.5&&los(P.x,P.z,p.rx,p.rz)){bd=d;best=p}}
  if(!best)return false;
  best.glRep={h:GL.peerH.get(best.id).slice(-20),i:0};
  glNet(`Reconnecting to ${best.name}…`,1.5);
  return true;
}

/* 3. the HUD lies */
const GL_LINES=()=>[`The seal holds. ${4+((Math.random()*3)|0)} shards to go.`,'A sanctuary. Nothing can follow you here.','You rise again',`Depth ${R.depth}: ${F.name}`,'Your torch is out'];
function glGarble(s){const c='▒░█▓';let o='';for(const ch of s){const r=Math.random();o+=r<0.1?c[(Math.random()*4)|0]:r<0.14?ch+ch:r<0.17?'':ch}return o}
function glHud(){
  const r=Math.random();
  if(r<0.4){
    const wrong=['Depth 0','Depth -1','Depth '+(-R.depth),'Depth ∞','Depth '+(R.depth+Math.floor(20+Math.random()*60))][(Math.random()*5)|0];
    GL.hudSeq={t:0,end:2.4,k:'depthLine',a:wrong};
  }else if(r<0.62){
    GL.hudSeq={t:0,end:2,k:'shards',a:'◆ '+(P.shards+1)+' / 3 shards'};
    if(P.shards>=2)GL.hudSeq.a='◆ '+P.shards+' / 4 shards';
  }else if(r<0.8){const L=GL_LINES();say(glGarble(L[(Math.random()*L.length)|0]),2.4)}
  else{
    // a line in the chat from somebody who is not in your game. In a shared game, it is you.
    const nm=MP.on?myName():'Delver',col=MP.on?toHex(MP_COLS[hashStr(MP.id||'')%MP_COLS.length]):'#8f8a80';
    GL.chatT=15;chatLine(nm,col,['is anyone else down here','hello?','i can hear you walking','which way did you go'][(Math.random()*4)|0]);
    sfx('pick');
  }
  return true;
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
  const S=0.94,v=(x,y,z)=>[x*S,y*S,z*S];
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

/* 6. falling through the floor, under the maze, into a dark grid, and waking at the start */
function glFall(){
  if(glTrapAt(P.tx,P.ty)||Math.hypot(F.exit.x-P.x,F.exit.z-P.z)<2)return false;
  GL.fall={t:0,vy:0};P.vx=P.vz=0;P.inv=99;
  if(!GL.grid){GL.grid=new THREE.GridHelper(400,200,0x3a3a40,0x26262c);GL.grid.position.set(P.x,-34,P.z);scene.add(GL.grid)}
  tone(70,2.6,'sine',0.12,0.3,-40);noise(0.25,0.08,2400,3);
  return true;
}
function glFallTick(dt){
  const L=GL.fall;if(!L)return;
  L.t+=dt;
  if(L.t<0.9)P.y=-0.85*(L.t/0.9)**2;          // sink slowly through the stone
  else if(L.t<1.6)P.y=-0.85-0.05*(L.t-0.9);    // hang for a moment just under it, looking at the underside
  else{L.vy+=9*dt;P.y-=L.vy*dt}
  if(L.t>1.6&&!L.wind){L.wind=1;noise(2.6,0.12,180,0.6)}
  if(L.t>3.6&&!L.dark){L.dark=1;$('fade').style.opacity=1}
  if(L.t>4.6){
    // wake at the start of the floor. The map remembers only the path you walked
    GL.fall=null;if(GL.grid){scene.remove(GL.grid);GL.grid=null}
    P.x=F.start.tx+0.5;P.z=F.start.ty+0.5;P.yaw=F.start.yaw;P.pitch=0;P.y=0;P.vy=0;P.inv=2;
    if(GL.walked)for(let i=0;i<F.seen.length;i++)F.seen[i]=GL.walked[i];
    onTileChange();tone(48,0.4,'sine',0.3);noise(0.2,0.2,200,1);
    setTimeout(()=>{$('fade').style.opacity=0},400);
  }
}

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
    if(F.back&&!GL.used.loop&&GL.cd<25&&glCalm(chasing)&&(Math.abs(P.vx)+Math.abs(P.vz))>1&&glLoopTry()){GL.used.loop=1}
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
function glLoopEnd(){if(!GL.loop)return;for(const q of F.panels)q.dead=false;GL.loop=null}

/* ---------- render ---------- */
let rs=1,rsCeil=1,fAcc=0,fN=0,goodSecs=0,lastRaise=-99,clock=0,fpsShown=0;
let composer=null,fxaaPass=null,bloomPass=null,gtaoPass=null,viewKey='';
const charMesh=paintedMesh(CH.buf,true,0.012),decorMesh=paintedMesh(DEC.buf,false,0);
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
  const yaw=title?titleYaw:P.yaw, pitch=title?0:P.pitch;
  const ex=P.x, ez=P.z, ey=EYE+(title?0:P.y+Math.sin(P.bob*2)*0.018);
  {const cp=Math.cos(pitch);camera.position.set(ex,ey,ez);camera.lookAt(ex+cp*Math.cos(yaw),ey+Math.sin(pitch),ez+cp*Math.sin(yaw))}
  if(P.grab){const k=0.012+0.02*Math.min(1,P.grab.t);camera.position.x+=(Math.random()-0.5)*k;camera.position.y+=(Math.random()-0.5)*k;camera.position.z+=(Math.random()-0.5)*k}
  const B=F.biome;
  const fwx=Math.cos(yaw),fwz=Math.sin(yaw),rx=-fwz,rz=fwx;
  const flick=1+Math.sin(t*11)*0.02+Math.sin(t*23.7)*0.015+Math.sin(t*5.3)*0.02;
  const torchR=torchRadius()*flick;
  // the torch is held low in the right hand, so shadows swing as you turn
  const L={ex,ey,ez,B,torchR,tx:ex+rx*0.2+fwx*0.04,ty:ey-0.14,tz:ez+rz*0.2+fwz*0.04};
  if(solidAt(L.tx,L.tz)){L.tx=ex;L.tz=ez}
  {const pl=F.back?0.05+0.95*panelLvl:1;
    L.amb=F.dark?AMB_ZERO:F.back?[B.amb[0]*pl,B.amb[1]*pl,B.amb[2]*pl]:B.amb;
    L.fog=[B.amb[0]*2.2*pl,B.amb[1]*2.2*pl,B.amb[2]*2.2*pl];
    {const ak=F.back?2.5:LK.amb;ambLight.color.setRGB(L.amb[0]*ak,L.amb[1]*ak,L.amb[2]*ak)}
    scene.fog.color.setRGB(L.fog[0],L.fog[1],L.fog[2]);
    if(scene.environment)scene.environmentIntensity=F.dark?0.01:F.back?0.3*pl:LK.env;}
  torchLight.position.set(L.tx,L.ty,L.tz);
  torchLight.color.setRGB(B.torch[0],B.torch[1],B.torch[2]);
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
    lights.push([d-6,q.lx,0.9,q.lz,SCONCE_COL,1.25*fl,4.6,'s'+q.lx+','+q.lz])}}
  if(F.safe){const d=(F.safe.x-ex)**2+(F.safe.z-ez)**2;if(d<400){
    const fl=1+Math.sin(t*8.3)*0.08+Math.sin(t*19.1)*0.05;F.safe.fl=fl;
    lights.push([d-30,F.safe.x,0.85,F.safe.z,[1.0,0.56,0.2],2.3*fl,7.5,'safe'])}}
  for(const n of F.npcs){if(n.type==='keeper')continue;const d=(n.x-ex)**2+(n.z-ez)**2;if(d<140)lights.push([d-3,n.x,n.type==='delver'?0.5:0.95,n.z,[1.0,0.85,0.6],0.75,2.8])}
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
  CH.n=0;
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
  for(const n of F.npcs){
    const d2=(n.x-ex)**2+(n.z-ez)**2;if(d2>16*16)continue;
    if((n.x-ex)*fwx+(n.z-ez)*fwz<-1.5)continue;
    const o=buildNpc(n,t,ex,ey,ez,dtR);
    if(o.lantern){const q=o.lantern,fl=1+Math.sin(t*10+n.ph)*0.1;spr(q[0],q[1]+0.012,q[2],0.045*fl,0.07*fl,11,1.0,0.6,0.2,1,1);spr(q[0],q[1],q[2],0.5,0.5,7,1.0,0.5,0.15,0.3,1)}
    if(o.lamp){const q=o.lamp;spr(q[0],q[1],q[2],0.22,0.22,7,1.0,0.75,0.3,0.4,1)}
    if(!n.used&&n.type!=='keeper'){const y=o.top+0.08+Math.sin(t*3+n.ph)*0.03,X=n.x+(n.ox||0),Z=n.z+(n.oz||0);spr(X,y,Z,0.08,0.08,7,1.0,0.85,0.4,1,1);spr(X,y,Z,0.32,0.32,7,1.0,0.7,0.2,0.3,1)}
  }}
  mpDrawPlayers(t,ex,ez,fwx,fwz);mimicDraw(t,ex,ez);glDraw(t,ex,ez,fwx,fwz);
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
  // the torch in your hand, drawn close to the eye so it never pokes through a wall
  HB.n=0;
  if(!title&&state!=='dead'&&!P.down){
    TB=HB;const q=buildHand(t,ex,ey,ez,yaw,pitch);TB=CH;
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
  for(const s of F.shades){
    if(s.type!==2||(s.x-ex)**2+(s.z-ez)**2>18*18)continue;
    const y=0.56+Math.sin(s.ph)*0.03,a=s.stun>0?0.35:1;
    spr(s.x,y,s.z,1.3,1.3,7,0.25,0.45,1.0,0.5*a,1);spr(s.x,y+Math.sin(s.ph*2.3)*0.03,s.z,0.42,0.6,11,1,1,1,a,1);
  }
  for(const q of F.sconces){
    if((q.x-ex)**2+(q.z-ez)**2>20*20)continue;
    const fx=q.x-q.dx*0.07,fz=q.z-q.dz*0.07,fl=q.fl||1;
    spr(fx,0.93,fz,0.15*fl,0.24*fl,11,1.0,0.55,0.16,1,1);
    spr(fx,0.93,fz,0.8,0.8,7,1.0,0.42,0.1,0.3*fl,1);
    if(Q>0&&(q.x-ex)**2+(q.z-ez)**2<81)for(let i=0;i<3;i++){const a=(t*0.4+i*0.33+q.ph)%1;spr(fx+Math.sin(i*2.4+t*1.3+q.ph)*0.06*a,0.98+a*0.45,fz+Math.cos(i*1.7+t+q.ph)*0.06*a,0.018,0.018,7,1.0,0.6,0.2,(1-a)*0.9,1)}
  }
  if(flashT>0){const k=1-flashT,rr=0.4+k*5.5;
    for(let i=0;i<18;i++){const a=i/18*6.283+k;spr(ex+Math.cos(a)*rr,0.25+((i*7)%5)*0.16,ez+Math.sin(a)*rr,0.25,0.25,7,0.8,0.9,1.0,flashT*0.8,1)}}
  for(const m of DUST){
    const px=ex+((m[0]+Math.sin(t*0.21+m[3])*0.4-ex)%8+12)%8-4,pz=ez+((m[2]+Math.cos(t*0.17+m[3])*0.4-ez)%8+12)%8-4;
    const py=0.05+((m[1]+t*0.012+Math.sin(t*0.3+m[3])*0.05)%1.15);
    const k=clamp(1-Math.hypot(px-ex,pz-ez)/Math.min(torchR,4),0,1);
    if(k>0.02)spr(px,py,pz,m[4]*2.4,m[4]*2.4,7,B.torch[0],B.torch[1],B.torch[2],k*0.5,1);
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
  if(title&&++titleFrames===20)selfCheck();
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
  setText('flashes','✦ '+P.flash+' flash'+(P.flash===1?'':'es'));
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
  c.fillStyle='#7d7263';
  const x0=Math.max(0,Math.floor(-ox/ts)),x1=Math.min(F.W-1,Math.ceil((size-ox)/ts));
  const y0=Math.max(0,Math.floor(-oy/ts)),y1=Math.min(F.H-1,Math.ceil((size-oy)/ts));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(F.seen[y*F.W+x]){const sm=F.safeMask[y*F.W+x];if(sm)c.fillStyle='#c79a4e';c.fillRect(ox+x*ts,oy+y*ts,ts+0.5,ts+0.5);if(sm)c.fillStyle='#7d7263'}
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
  for(const n of F.npcs)if(F.seen[Math.floor(n.z)*F.W+Math.floor(n.x)]){c.fillStyle=n.type==='keeper'?'#ffe0a0':'#8ff0d0';c.fillRect(ox+n.x*ts-2.5,oy+n.z*ts-2.5,5,5)}
  for(const s of F.shades)if(s.vis)dot(s.x,s.z,Math.max(3,ts*0.4),s.type===1?'#e6e0d2':s.type===2?'#5aa8ff':s.state===1?'#ff2a4a':'#a07cff');
  for(const p of MP.peers.values()){if(!mpShown(p))continue;
    c.save();c.translate(ox+p.rx*ts,oy+p.rz*ts);c.rotate(p.ryaw);c.fillStyle=p.down?'#777':p.hex;
    c.beginPath();c.moveTo(5,0);c.lineTo(-3.5,3.5);c.lineTo(-1.5,0);c.lineTo(-3.5,-3.5);c.closePath();c.fill();c.restore()}
  if(!P.down){
  c.save();c.translate(ox+P.x*ts,oy+P.z*ts);c.rotate(P.yaw);
  c.fillStyle='#ffc27a';c.beginPath();c.moveTo(6,0);c.lineTo(-4,4);c.lineTo(-2,0);c.lineTo(-4,-4);c.closePath();c.fill();c.restore();
  }
  if(F.back){
    const S2=mapCv.width,tk=Math.floor(R.time*7),r=k=>{const v=Math.sin(tk*12.9898+k*78.233)*43758.5453;return v-Math.floor(v)};
    c.setTransform(1,0,0,1,0,0);
    if(F.blk===2){c.fillStyle='#050406';c.fillRect(0,0,S2,S2)}
    else if(r(0)<0.4||F.blk===1)for(let i=0;i<3;i++){const y=Math.floor(r(1+i)*S2),h=Math.floor(3+r(4+i)*S2*0.09),dx=Math.floor((r(7+i)-0.5)*S2*0.3);c.drawImage(mapCv,0,y,S2,h,dx,y,S2,h)}
    c.fillStyle='rgba(255,240,170,0.45)';for(let i=0;i<(F.blk===2?90:36);i++)c.fillRect(Math.random()*S2,Math.random()*S2,2*dpr,dpr);
  }
}

/* ---------- main loop ---------- */
let last=performance.now(),wasPlaying=false;
function step(now){
  const raw=Math.max(0,(now-last)/1000);last=now;
  const dt=Math.min(raw,0.05);
  pollPad();
  if((state==='play')!==wasPlaying){wasPlaying=state==='play';document.body.classList.toggle('playing',wasPlaying)}
  roomWatch();
  if(state==='room'){ROOMS.update(dt,roomInput());if(state==='room')$('fade').style.opacity=ROOMS.fade()}
  else if(ROOMS.watching){ROOMS.update(dt,NOIN);$('fade').style.opacity=ROOMS.fade()}
  const live=()=>state==='play'||(MP.on&&(state==='pause'||state==='talk'||state==='room'));
  // a fake hang: nothing moves for you, though the room carries on
  if(GL.frz>0){GL.frz-=raw;if(GL.frz<=0)glUnfreeze();mpTick(raw);return raw}
  if(live()){
    // a host whose tab is in the background still runs the creatures, in catch-up steps
    if(raw>0.1&&MP.host&&document.hidden){let left=Math.min(raw,1);while(left>0&&live()){const s=Math.min(left,0.05);update(s);left-=s}}
    else update(dt);
  }
  else if(state==='title')titleYaw+=dt*0.15;
  mpTick(raw);
  return raw;
}
function frame(now){
  const raw=step(now);
  mpVoiceTick(Math.min(raw,0.1));chatTick();
  if(state==='play')adapt(raw);
  setHum();
  if(GL.frz<=0){
    if(!window.__norender){if((state==='room'||ROOMS.watching)&&ROOMS.active){resize();renderer.toneMappingExposure=1;ROOMS.render()}else render(now/1000)}
    if(state!=='title'){drawHUD();if(state!=='room'&&!ROOMS.watching)drawMap()}
    mpTags();
  }
  requestAnimationFrame(frame);
}
setInterval(()=>{if(MP.host&&document.hidden&&performance.now()-last>200)step(performance.now())},100);
// a backdrop maze behind the title screen
R.seed=randSeed();loadFloor(1);titleYaw=P.yaw;showBest();
{const rc=cleanCode(new URLSearchParams(location.search).get('room'));if(rc)mpPrepareJoin(rc)}
window.__game={doorPlan,doorCountFor,doorOrder,flashStun,collect,get watching(){return RW},roomLeave,DOOR_LOOKS,DOOR_KINDS,buildStatic,glitch:k=>glStart(k,true),GL,ROOMS,sdoorOpen,kilnGame,KILN,roomEnd,MP,mpHost,hurt,keys,MIM,CLIPS,VOX,mpVoiceSet,chatOpenBox,chatClose,mimicEat,surfPreview(i,nrm){const t=SURFS.get(i),rt=nrm?t.rtN:t.rtA,n=rt.width,px=new Uint8Array(n*n*4);renderer.readRenderTargetPixels(rt,0,0,n,n,px);const c=document.createElement('canvas');c.width=c.height=n;const x=c.getContext('2d'),im=x.createImageData(n,n);im.data.set(px);if(!nrm)for(let k=3;k<px.length;k+=4)im.data[k]=255;else for(let k=0;k<px.length;k+=4){im.data[k]=im.data[k+1]=im.data[k+2]=255-px[k+3];im.data[k+3]=255}x.putImageData(im,0,0);return c.toDataURL('image/jpeg',0.9)},get wallet(){return wallet},set wallet(v){wallet=v},up,openTalk,closeTalk,pickTalk,moveTalk,get talk(){return talk},get nearNpc(){return nearNpc},act,genFloor,bfs,loadFloor,get F(){return F},get state(){return state},get rs(){return rs},get panelLvl(){return panelLvl},watcher,banish,startRun,useFlash,P,R,touch};
requestAnimationFrame(frame);
