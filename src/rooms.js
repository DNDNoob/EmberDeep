// Strange doors lead to scenes outside the maze.
//   galaxy  you float among stars until the sun collapses and spits you back out, floors deeper
//   kiln    a stone hall with an arcade console: walk up, press its buttons to steer the falling stones in the glass, burn enough rows and the door lets you go
//   fall    there is no floor behind the door
//   mirror  you stand behind a one-way mirror, watching a parlor; something comes in and then looks back at you
// Each room owns its own scene. See docs/strange-doors.md for the authoring workflow.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {createTheater} from './theater.js';
import {monolithRoom} from './monoliths.js';
import {mooseDefenseRoom} from './moose-defense.js';
import {MOVE,lookStep,lookBy,bobAdvance,bobY,createRoomWalker} from './movement.js';

// Order is part of seeded door rotation. Add new IDs at the end.
export const DOOR_KINDS={
  galaxy:{name:'a door full of stars',look:'galaxy',mode:'look'}, // zero-gravity scene with no floor
  kiln:{name:'the glass kiln',look:'kiln',action:'PRESS',css:'kilnroom'},
  fall:{name:'a door with no floor behind it',disguise:true,mode:'none',fadeIn:0.18}, // cinematic fall
  mirror:{name:'a room behind a mirror',look:'mirror',action:'USE',css:'mirroom',fadeIn:1.4},
  theater:{name:'the picture house',look:'theater',action:'TALK'},
  monoliths:{name:'the whispering monoliths',look:'monoliths'},
  moose:{name:'Mosquito Outpost',look:'moose',css:'mooseroom'}, // walkable arcade with a tabletop camera
};
const modeOf=k=>DOOR_KINDS[k]?.mode||'walk';

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const lerp=(a,b,t)=>a+(b-a)*t;
// a small seeded generator (mulberry32): one per visit to the mirror room, so a room can be rebuilt exactly for a watcher
const rng32=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};

// the falling stones of the kiln: clusters of two to four cells
const SHAPES=[
  [[0,0],[1,0]],
  [[0,0],[1,0],[2,0]],
  [[0,0],[1,0],[0,1]],
  [[0,0],[1,0],[0,1],[1,1]],
  [[0,0],[1,0],[2,0],[1,1]],
  [[0,0],[1,0],[2,0],[0,1]],
  [[0,0],[1,0],[2,0],[2,1]],
  [[0,0],[1,0],[1,1],[2,1]],
  [[1,0],[2,0],[0,1],[1,1]],
  [[0,0]],
];
const SHAPE_W=[3,4,4,2,3,2,2,2,2,1];
export const KILN={W:7,H:15,need:4,ash:22};
// the kiln's rules, kept apart from the drawing so they can be tested on their own
export function kilnGame(rand){
  const {W,H}=KILN,g=new Uint8Array(W*H);
  const K={g,W,H,cleared:0,over:null,piece:null,next:null,fallT:0,ashT:KILN.ash,flash:[],moved:0};
  const at=(x,y)=>x<0||x>=W||y<0?9:y>=H?0:g[y*W+x];
  const pick=()=>{let tot=0;for(const w of SHAPE_W)tot+=w;let r=rand()*tot,i=0;while(r>=SHAPE_W[i]){r-=SHAPE_W[i];i++}
    return {c:SHAPES[i].map(c=>c.slice()),col:1+(rand()*3|0)}};
  const fits=(c,x,y)=>c.every(q=>!at(x+q[0],y+q[1]));
  K.fits=fits;
  const ashRow=y=>{const gap=rand()*W|0;for(let x=0;x<W;x++)g[y*W+x]=x===gap?0:4};
  ashRow(0);ashRow(1);
  K.spawn=()=>{
    const p=K.next||pick();K.next=pick();
    const w=Math.max(...p.c.map(q=>q[0]))+1;
    p.x=(W-w)>>1;p.y=H-2;
    if(!fits(p.c,p.x,p.y)){K.piece=null;K.over='dead';return}
    K.piece=p;K.fallT=0;
  };
  K.move=dx=>{const p=K.piece;if(!p||!fits(p.c,p.x+dx,p.y))return false;p.x+=dx;K.moved++;return true};
  K.rotate=()=>{
    const p=K.piece;if(!p||p.c.length<2)return false;
    let c=p.c.map(q=>[-q[1],q[0]]);const mx=Math.min(...c.map(q=>q[0])),my=Math.min(...c.map(q=>q[1]));
    c=c.map(q=>[q[0]-mx,q[1]-my]);
    for(const k of [0,-1,1,-2,2])for(const ky of [0,1]){if(fits(c,p.x+k,p.y+ky)){p.c=c;p.x+=k;p.y+=ky;K.moved++;return true}}
    return false;
  };
  K.landY=()=>{const p=K.piece;let y=p.y;while(fits(p.c,p.x,y-1))y--;return y};
  const lock=()=>{
    const p=K.piece;let top=false;
    for(const q of p.c){const y=p.y+q[1];if(y>=H){top=true;continue}g[y*W+p.x+q[0]]=p.col}
    K.piece=null;
    let n=0;
    for(let y=0;y<H;y++){
      let full=true;for(let x=0;x<W;x++)if(!g[y*W+x]){full=false;break}
      if(!full)continue;
      K.flash.push({y:y+n,t:0.45});
      g.copyWithin(y*W,(y+1)*W);g.fill(0,(H-1)*W);y--;n++;
    }
    K.cleared+=n;K.lastLock=n;
    if(K.cleared>=KILN.need){K.over='win';return n}
    if(top&&!n){K.over='dead';return n}
    K.spawn();return n;
  };
  K.step=()=>{const p=K.piece;if(!p)return -1;if(fits(p.c,p.x,p.y-1)){p.y--;return -1}return lock()};
  K.drop=()=>{const p=K.piece;if(!p)return -1;p.y=K.landY();return lock()};
  K.rise=()=>{
    for(let x=0;x<W;x++)if(g[(H-1)*W+x]){K.over='dead';return}
    g.copyWithin(W,0,(H-1)*W);ashRow(0);
    const p=K.piece;if(p&&!fits(p.c,p.x,p.y)){p.y++;if(!fits(p.c,p.x,p.y))K.over='dead'}
  };
  K.spawn();
  return K;
}

function canvasTex(w,h,draw,repeat){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping}
  return t;
}
const rnd=(()=>{let a=1234567;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})();

// the mirror room's shaders: one lit material for everything (wrap light in two zones, fresnel rim, patterns from world position) and the pane itself
const LIT_VS=`varying vec3 vN;varying vec3 vW;varying vec2 vUv;
void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;vN=normalize(transpose(inverse(mat3(modelMatrix)))*normal);vUv=uv;gl_Position=projectionMatrix*viewMatrix*w;}`;
const NOISE_GLSL=`float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h1(i),h1(i+vec2(1.0,0.0)),f.x),mix(h1(i+vec2(0.0,1.0)),h1(i+vec2(1.0,1.0)),f.x),f.y);}
float fb(vec2 p){return 0.5*n2(p)+0.3*n2(p*2.1+3.0)+0.2*n2(p*4.3+7.0);}
float vor(vec2 p){vec2 i=floor(p),f=fract(p);float d1=8.0,d2=8.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=vec2(h1(i+g),h1(i+g+17.3));vec2 r=g+o-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
  return sqrt(d2)-sqrt(d1);}`;
const LIT_FS=`uniform vec3 uCol,uRimC;uniform float uRim,uSpec,uWrap,uGlow,uLit,uPat,uAlpha;
uniform vec3 uLP[4],uLC[4],uBP,uBC,uAmbP,uAmbB;uniform float uWallZ;
uniform vec3 uWain,uTrim,uRugA,uRugB,uRugC;uniform vec4 uRug;uniform float uWpat,uWsc,uRugP;
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
varying vec3 vN;varying vec3 vW;varying vec2 vUv;
${NOISE_GLSL}
vec3 pat(int k,vec3 p,vec3 n,vec3 c){
  vec2 q=abs(n.x)>0.6?p.zy:abs(n.z)>0.6?p.xy:p.xz;
  if(k==1){float m=fb(q*3.0)+0.35*fb(q*13.0);c*=0.5+0.75*m;float damp=smoothstep(1.3,0.0,p.y)*fb(q*2.0+9.0);c*=1.0-0.5*damp;float pe=smoothstep(0.6,0.64,fb(q*1.4+4.0));c=mix(c,c*vec3(0.62,0.56,0.5),pe*0.8);}
  else if(k==2){vec2 g=vec2(q.x/0.7+0.5*mod(floor(q.y/0.5),2.0),q.y/0.5);vec2 id=floor(g),f=fract(g);float j=min(min(f.x,1.0-f.x*1.0),min(f.y,1.0-f.y)*0.7);
    c*=(0.65+0.6*h1(id))*(0.7+0.5*fb(q*8.0))*(0.45+0.55*smoothstep(0.0,0.05,j));}
  else if(k==3){float y=p.y;
    if(y<1.05){float px=fract(q.x/0.85);float ins=smoothstep(0.05,0.08,px)*smoothstep(0.05,0.08,1.0-px)*smoothstep(0.12,0.15,y)*smoothstep(0.12,0.15,0.93-y);
      float gr=fb(vec2(q.x*6.0,y*50.0));c=uWain*(0.7+0.6*gr)*(0.7+0.4*ins);if(y>0.96)c=uTrim*(0.8+0.4*gr);}
    else{float u=q.x/uWsc;float st=smoothstep(0.3,0.5,abs(fract(u)-0.5));vec2 d=vec2(abs(fract(u)-0.5),abs(fract(y/0.34)-0.5));float dm=smoothstep(0.17,0.12,d.x+d.y*0.55);if(uWpat>0.5&&uWpat<1.5)dm=0.0;if(uWpat>1.5)st=0.0;
      c=mix(c*0.8,c*1.25,st);c=mix(c,vec3(0.37,0.24,0.10),dm*0.35*(1.0-st));c*=0.75+0.4*fb(q*2.5);}}
  else if(k==4){float row=floor(q.y/0.18),xo=q.x+row*0.73,len=floor(xo/1.4);vec2 id=vec2(len,row);float fx=fract(xo/1.4),fz=fract(q.y/0.18);
    float j=min(min(fz,1.0-fz)*0.18,min(fx,1.0-fx)*1.4);float gr=fb(vec2(q.x*3.0,q.y*60.0)+id*5.0);
    c*=(0.55+0.75*h1(id))*(0.7+0.55*gr)*(0.5+0.5*smoothstep(0.0,0.006,j));
    vec2 r=q-uRug.xy;vec2 dd=abs(r);if(dd.x<uRug.z&&dd.y<uRug.w){float e=min(uRug.z-dd.x,uRug.w-dd.y);vec3 rc=uRugA;float lz=uRugP<0.5?abs(fract((r.x+r.y)*1.7)-0.5)+abs(fract((r.x-r.y)*1.7)-0.5):uRugP<1.5?abs(fract(r.x*2.6)-0.5)*1.45:abs(fract(max(dd.x/uRug.z,dd.y/uRug.w)*5.0)-0.5)*1.45;rc*=0.85+0.35*smoothstep(0.62,0.4,lz);
      if(e<0.2)rc=uRugB*(0.8+0.5*fb(q*30.0));if(e>0.2&&e<0.27)rc=uRugC;if(e>0.27&&e<0.45)rc=uRugA*0.88*(0.8+0.4*fb(q*12.0));if(e<0.05)rc=vec3(0.5,0.42,0.3);c=rc*(0.8+0.35*fb(q*40.0));}}
  else if(k==5){float g=fb(q*vec2(3.0,42.0));float kn=smoothstep(0.1,0.0,length(fract(q*vec2(0.9,2.2))-0.5)-0.04);c*=(0.6+0.7*g)*(1.0-0.3*kn);}
  else if(k==6){float g=fb(q*vec2(42.0,3.0));c*=(0.6+0.7*g);}
  else if(k==7){float g=fb(q*30.0);c*=0.65+0.55*g+0.15*sin(q.x*70.0)*sin(q.y*70.0);}
  else if(k==8){vec2 thread=q*150.0;float weave=sin(thread.x)*sin(thread.y);
    c*=0.91+0.15*fb(q*14.0)+0.09*weave*(1.0-smoothstep(0.5,2.5,length(fwidth(thread))));}
  return c;
}
void main(){
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;
  vec3 V=normalize(cameraPosition-vW);
  vec3 c=uCol;
  #ifdef USE_MAP
  c*=texture2D(uMap,vUv).rgb;
  #endif
  int k=int(uPat+0.5);if(k>0)c=pat(k,vW,N,c);
  float zp=smoothstep(uWallZ+0.04,uWallZ-0.04,vW.z);
  vec3 lp=vec3(0.0),sp=vec3(0.0);
  for(int i=0;i<4;i++){vec3 L=uLP[i]-vW;float d=max(length(L),0.001);L/=d;float w=max((dot(N,L)+uWrap)/(1.0+uWrap),0.0),at=1.0/(1.0+0.32*d*d);lp+=uLC[i]*w*at;sp+=uLC[i]*at*pow(max(dot(N,normalize(L+V)),0.0),28.0);}
  vec3 B=uBP-vW;float bd=length(B);B/=bd;float bw=max((dot(N,B)+uWrap)/(1.0+uWrap),0.0);vec3 lb=uBC*bw/(1.0+0.3*bd*bd);
  vec3 lit=mix(uAmbB+lb+lp*0.1,uAmbP+lp,zp);
  vec3 col=c*lit*uLit+sp*uSpec*mix(0.08,1.0,zp)+c*uGlow;
  float rim=pow(1.0-max(dot(N,V),0.0),3.0);
  float rimLight=mix(0.35,0.15+0.55*clamp(lp.r,0.0,1.0),zp);
  col+=uRimC*rim*uRim*rimLight*uLit;
  gl_FragColor=vec4(col,uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PANE_FS=`uniform vec4 uH[10];uniform float uK;varying vec2 vP;varying vec3 vW;
${NOISE_GLSL}
float cracks(vec2 p){
  float m=0.0,prox=0.0;
  float web=1.0-smoothstep(0.0,0.022,vor(p*3.0+uH[0].w*9.0)),web2=1.0-smoothstep(0.0,0.02,vor(p*7.0+3.0));
  for(int i=0;i<10;i++){vec4 h=uH[i];if(h.z<=0.001)continue;
    vec2 d=p-h.xy;float r=length(d),a=atan(d.y,d.x);
    float R=(0.3+0.45*h.z)*(1.0+uK*1.3);
    prox=max(prox,1.0-smoothstep(R*0.3,R,r));
    float ang=a*1.432394+h.w*13.0+(n2(vec2(r*6.0,h.w*9.0))-0.5)*0.9;
    float da=abs(fract(ang+0.5)-0.5)*r*0.698;
    float spoke=(1.0-smoothstep(0.0,0.004+0.005*r,da))*(1.0-smoothstep(R*0.55,R,r));
    float ring=abs(fract(r/0.17+n2(vec2(a*2.0,h.w))*0.6)-0.5)*0.17;
    float rm=(1.0-smoothstep(0.0,0.0045,ring))*step(0.45,n2(vec2(a*2.5+h.w*7.0,floor(r/0.17))))*(1.0-smoothstep(R*0.3,R*0.75,r));
    m=max(m,max(spoke,rm));
    m=max(m,(1.0-smoothstep(0.0,0.05+0.03*h.z,r))*h.z);
  }
  m=max(m,max(web,web2*0.6)*smoothstep(0.45,0.95,prox)*smoothstep(0.12,0.6,uK));
  return clamp(m,0.0,1.0);
}
void main(){
  vec2 p=vP;
  vec3 view=normalize(cameraPosition-vW);
  float grazing=pow(1.0-abs(view.z),2.0);
  float band=1.0-smoothstep(0.02,0.2,abs(p.x*0.25+p.y*0.85+view.x*1.4+view.y*0.4));
  float edge=1.0-smoothstep(0.0,0.48,min(1.55-abs(p.x),1.095-abs(p.y)));
  float tar=smoothstep(0.58,0.7,fb(p*4.0+2.0));
  float a=0.012+0.04*edge+0.025*tar+grazing*(0.10+0.26*band);
  vec3 col=mix(vec3(0.37,0.47,0.60),vec3(0.14,0.12,0.10),tar*0.6);
  float cr=cracks(p);
  col=mix(col,vec3(1.1,1.15,1.25),cr);a=clamp(a+cr*0.6,0.0,0.9);
  gl_FragColor=vec4(col,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// orange spray on the back of the glass: a splat, beads around it, and a few runs that creep down the pane
const DRIP_FS=`uniform vec4 uS[10];uniform float uT;varying vec2 vP;
float hh(float n){return fract(sin(n*91.3458)*47453.5453);}
void main(){float a=0.0;
  for(int i=0;i<10;i++){vec4 s=uS[i];if(s.z<0.0)continue;float age=uT-s.z;if(age<0.0)continue;float gr=smoothstep(0.0,0.25,age);
    a=max(a,smoothstep(0.075,0.025,length(vP-s.xy))*(0.5+0.35*hh(s.w))*gr);
    for(int k=0;k<7;k++){float fk=float(k)+s.w*13.0;vec2 o=vec2(hh(fk)-0.5,hh(fk+7.0)-0.5)*0.34;float br=0.008+0.012*hh(fk+3.0);a=max(a,smoothstep(br,br*0.4,length(vP-s.xy-o))*0.8*gr);}
    for(int k=0;k<3;k++){float fk=float(k)+s.w*29.0;float ox=(hh(fk)-0.5)*0.12,sp=0.03+0.05*hh(fk+2.0),L=min(0.9,max(0.0,age-0.5)*sp);
      vec2 q=vP-s.xy-vec2(ox,0.0);float inside=step(-L,q.y)*step(q.y,0.0),w=0.005+0.003*hh(fk+5.0);
      a=max(a,smoothstep(w,w*0.3,abs(q.x))*inside*0.55*gr);a=max(a,smoothstep(0.016,0.006,length(q+vec2(0.0,L)))*0.9*gr*step(0.01,L));}}
  gl_FragColor=vec4(vec3(1.0,0.42,0.08)*0.85,a*0.8);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class RoomGTAOPass extends GTAOPass {
  setSize(width,height){
    // The normal, AO and denoise buffers use half the drawing size on each axis.
    super.setSize(Math.max(1,Math.floor(width/2)),Math.max(1,Math.floor(height/2)));
  }

  overrideVisibility(){
    super.overrideVisibility();
    this.scene.traverseVisible(object=>{
      if(object.isSprite) object.visible=false;
      if(!object.isMesh) return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      // Glass and other overlays must let the surfaces behind them contribute.
      if(!materials.some(m=>m.visible&&!m.transparent&&m.depthTest&&m.depthWrite)) object.visible=false;
    });
  }
}

export function createRooms(renderer,o0){
  // a watcher is not the one in the room: no speech or shaking for them, and a fast-forward makes no sound
  const o=Object.assign({},o0,{say:(...a)=>{if(!A.watching)o0.say(...a)},rumble:(...a)=>{if(!A.watching)o0.rumble(...a)},
    tone:(...a)=>{if(!A.mute)o0.tone(...a)},noise:(...a)=>{if(!A.mute)o0.noise(...a)},hint:k=>A.watching?A.label:o0.hint(k),gems:n=>{if(!A.watching&&o0.gems)o0.gems(n)},sfx:n=>{if(!A.mute&&!A.watching&&o0.sfx)o0.sfx(n)}});
  const nf=v=>typeof v==='number'&&isFinite(v),Z={mx:0,my:0,press:0,lx:0,ly:0};
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(72,1,0.05,2000);
  scene.background=new THREE.Color(0x000000);
  let composer=null,bloom=null,blurPass=null,fxaaPass=null,viewKey='',cur=null,group=null,done=null,held=false;
  const A={active:false,kind:'',watching:false,label:'',mute:0,theaterOpts:{}};
  const clearHooks=[];
  const glowTex=canvasTex(128,128,(c,w)=>{const g=c.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.25,'rgba(255,255,255,0.45)');g.addColorStop(0.6,'rgba(255,255,255,0.08)');g.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=g;c.fillRect(0,0,w,w)});
  const glow=(col,size,op)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:col,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:op===undefined?1:op}));s.scale.setScalar(size);return s};
  function setup(){
    if(o.post&&!composer){
      composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType}));
      composer.addPass(new RenderPass(scene,cam));
      if(o.ao){
        const ao=new RoomGTAOPass(scene,cam,4,4);
        // Some room shells are viewed from the reverse side of their geometry.
        ao.normalMaterial.side=THREE.DoubleSide;
        ao.blendIntensity=0.7;
        ao.updateGtaoMaterial({radius:0.55,distanceExponent:1.4,thickness:0.7,scale:1.1,samples:12,distanceFallOff:1,screenSpaceRadius:false});
        composer.addPass(ao);
      }
      // a soft blur for burning eyes, off unless a room asks for it
      blurPass=new ShaderPass({uniforms:{tDiffuse:{value:null},uAmt:{value:0},uPx:{value:new THREE.Vector2(1,1)}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:'uniform sampler2D tDiffuse;uniform float uAmt;uniform vec2 uPx;varying vec2 vUv;void main(){vec4 s=vec4(0.0);for(int i=0;i<16;i++){float a=float(i)*2.39996,r=sqrt((float(i)+0.5)/16.0)*uAmt;s+=texture2D(tDiffuse,vUv+vec2(cos(a),sin(a))*r*uPx);}gl_FragColor=s/16.0;}'});
      blurPass.enabled=false;composer.addPass(blurPass);
      bloom=new UnrealBloomPass(new THREE.Vector2(4,4),0.9,0.6,0.8);composer.addPass(bloom);
      composer.addPass(new OutputPass());
      // Match the maze: FXAA detects edges in the final display colors.
      fxaaPass=new ShaderPass(FXAAShader);composer.addPass(fxaaPass);
      viewKey='';
    }
    group=new THREE.Group();scene.add(group);
  }
  function clear(){
    while(clearHooks.length){try{clearHooks.pop()()}catch(e){}}
    if(!group)return;
    group.traverse(m=>{if(m.geometry)m.geometry.dispose();if(m.material){const L=Array.isArray(m.material)?m.material:[m.material];for(const q of L){if(q.map&&q.map!==glowTex)q.map.dispose();q.dispose()}}});
    scene.remove(group);group=null;scene.fog=null;
  }
  const finish=res=>{if(A.watching){held=true;return}const d=done;done=null;A.active=false;A.kind='';cur=null;clear();o.hud('');if(d)d(res)};

  /* ---------- the galaxy ---------- */
  function galaxy(){
    const S={t:0,yaw:0,pitch:-0.12,said:0,rumT:0,planets:[]};
    cam.fov=72;cam.near=0.05;cam.far=2000;
    // stars
    {const n=o.low?1400:3200,pos=new Float32Array(n*3),col=new Float32Array(n*3);
      for(let i=0;i<n;i++){
        const u=rnd()*2-1,a=rnd()*6.283,r=Math.sqrt(1-u*u),R=380+rnd()*160;
        // a brighter band across the sky
        const band=rnd()<0.45?0.22:1;
        pos[i*3]=Math.cos(a)*r*R;pos[i*3+1]=u*R*band;pos[i*3+2]=Math.sin(a)*r*R;
        const k=0.35+Math.pow(rnd(),3)*2.4,w=rnd();
        col[i*3]=k*(w<0.2?1:w<0.5?0.75:0.95);col[i*3+1]=k*(w<0.2?0.72:0.85);col[i*3+2]=k*(w<0.2?0.55:1);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
      S.stars=new THREE.Points(g,new THREE.PointsMaterial({size:2.2,sizeAttenuation:false,vertexColors:true,map:glowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
      S.stars.frustumCulled=false;group.add(S.stars);}
    // nebulae
    S.neb=[];
    for(const q of [[-220,60,-300,0x5a2a9a,420],[260,-40,-260,0x1a4a9a,380],[60,140,330,0x8a2a4a,360],[-300,-90,160,0x1a7a6a,300],[0,-200,-120,0x6a3a1a,340]]){
      const s=glow(q[3],q[4],0.2);s.position.set(q[0],q[1],q[2]);group.add(s);S.neb.push(s)}
    // the sun and its worlds, a little below and ahead
    S.sys=new THREE.Group();S.sys.position.set(0,-7,-34);S.sys.rotation.x=0.16;group.add(S.sys);
    S.sun=new THREE.Mesh(new THREE.SphereGeometry(2.6,32,20),new THREE.MeshBasicMaterial({color:new THREE.Color(3.2,2.1,0.8)}));S.sys.add(S.sun);
    S.sunGlow=glow(0xffb060,26,0.55);S.sys.add(S.sunGlow);
    S.light=new THREE.PointLight(0xffe2b0,900,0,2);S.sys.add(S.light);
    group.add(new THREE.AmbientLight(0x223044,0.5));
    const band=(a,b,c)=>canvasTex(128,64,(x,w,h)=>{for(let y=0;y<h;y++){const k=Math.sin(y*0.35+Math.sin(y*0.11)*3)*0.5+0.5,m=rnd()*0.12;
      x.fillStyle=`rgb(${a.map((v,i)=>Math.round(clamp(lerp(v,b[i],k)+m*60,0,255))).join(',')})`;x.fillRect(0,y,w,1)}
      for(let i=0;i<c;i++){x.fillStyle=`rgba(${rnd()<0.5?'255,255,255':'0,0,0'},${0.05+rnd()*0.12})`;x.beginPath();x.ellipse(rnd()*w,rnd()*h,3+rnd()*10,1+rnd()*3,0,0,7);x.fill()}});
    const defs=[[5.2,0.34,[150,120,100],[90,70,60],6],[7.6,0.62,[220,170,90],[180,110,60],10],[10.4,0.7,[50,110,200],[40,160,120],26],[13.4,0.5,[190,80,50],[110,50,40],8],
      [18.5,1.7,[210,170,120],[150,100,70],18],[24.5,1.35,[220,200,150],[170,150,110],8,1],[30,0.95,[120,200,220],[80,150,200],4]];
    defs.forEach((d,i)=>{
      const m=new THREE.Mesh(new THREE.SphereGeometry(d[1],24,16),new THREE.MeshStandardMaterial({map:band(d[2],d[3],d[4]),roughness:0.9,metalness:0}));
      const p={m,r:d[0],r0:d[0],a:rnd()*6.283,s:d[1],sp:rnd()*2+0.5,gone:false};
      if(d[5]){const ring=new THREE.Mesh(new THREE.RingGeometry(d[1]*1.35,d[1]*2.3,48),new THREE.MeshBasicMaterial({color:0xcbb890,side:THREE.DoubleSide,transparent:true,opacity:0.55}));ring.rotation.x=1.2;m.add(ring)}
      S.sys.add(m);S.planets.push(p);
      const orbit=new THREE.Mesh(new THREE.RingGeometry(d[0]-0.02,d[0]+0.02,96),new THREE.MeshBasicMaterial({color:0x8fa8ff,side:THREE.DoubleSide,transparent:true,opacity:0.1,depthWrite:false}));
      orbit.rotation.x=Math.PI/2;S.sys.add(orbit);p.orbit=orbit;
    });
    // the hole: a black ball, a ring of burning matter, and a thin bright edge
    S.hole=new THREE.Mesh(new THREE.SphereGeometry(1,32,20),new THREE.MeshBasicMaterial({color:0x000000}));S.hole.visible=false;S.sys.add(S.hole);
    S.disk=new THREE.Mesh(new THREE.RingGeometry(1.15,3.0,96,8),new THREE.ShaderMaterial({
      uniforms:{uT:{value:0},uK:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`uniform float uT;uniform float uK;varying vec2 vP;
void main(){float r=length(vP),a=atan(vP.y,vP.x);float k=(r-1.15)/1.85;
  float sw=0.55+0.45*sin(a*3.0+r*4.0-uT*5.0)+0.3*sin(a*7.0-r*9.0+uT*8.0);
  vec3 c=mix(vec3(2.6,1.9,1.1),vec3(1.2,0.3,0.7),smoothstep(0.0,0.7,k));
  float f=smoothstep(0.0,0.08,k)*(1.0-smoothstep(0.35,1.0,k));
  gl_FragColor=vec4(c*max(sw,0.15)*f*uK,1.0);}`}));
    S.disk.rotation.x=Math.PI/2-0.1;S.disk.visible=false;S.sys.add(S.disk);
    S.edge=glow(0xffd0a0,1,0);S.sys.add(S.edge);
    // the doorway you came through, far behind you at first
    S.door=new THREE.Mesh(new THREE.PlaneGeometry(1.1,2.1),new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.5,0.7),side:THREE.DoubleSide}));
    S.door.position.set(0,0,9);group.add(S.door);
    S.doorGlow=glow(0xff9a40,5,0.5);S.door.add(S.doorGlow);
    S.white=glow(0xffffff,1,0);group.add(S.white);
    const HOLE_AT=6.5,EAT=8.3,END=13.6,OUT=14.4,FIN=16.2;
    S.update=(dt,inp)=>{
      S.t+=dt;const t=S.t;
      lookStep(S,dt,inp.lx,inp.ly);
      if(S.said===0&&t>0.9){S.said=1;o.say('You are floating. There is no floor, and no maze.',4)}
      if(S.said===1&&t>HOLE_AT){S.said=2;o.say('The sun goes out.',3.5);o.tone(55,3.5,'sawtooth',0.2,0,-30);o.noise(2.5,0.25,180,0.7)}
      if(S.said===2&&t>EAT+1.6){S.said=3;o.say('It is pulling everything in.',3.5)}
      if(S.said===3&&t>END-0.1){S.said=4;o.noise(1.4,0.6,900,0.5);o.tone(880,1.2,'sine',0.25,0,-700);o.rumble(900,1,1)}
      // the sun caves in between HOLE_AT and EAT
      const col=ss(HOLE_AT,EAT,t),pull=ss(EAT,END,t);
      S.sun.scale.setScalar(Math.max(0.001,1-col));
      S.sun.material.color.setRGB(3.2*(1-col*0.4),2.1*(1-col),0.8*(1-col));
      S.sunGlow.material.opacity=0.55*(1-col);S.sunGlow.scale.setScalar(26*(1-col*0.7));
      S.light.intensity=900*(1-col)+260*col;S.light.color.setRGB(1,0.89-0.4*col,0.69-0.45*col);
      const hr=col*(1.5+pull*2.0);
      S.hole.visible=S.disk.visible=col>0.02;
      S.hole.scale.setScalar(Math.max(hr,0.001));
      S.disk.scale.setScalar(Math.max(hr*0.9,0.001));S.disk.material.uniforms.uT.value=t;S.disk.material.uniforms.uK.value=col;
      S.edge.material.opacity=col*0.8;S.edge.scale.setScalar(hr*3.1);
      // worlds wind inward and are stretched along the way
      for(const p of S.planets){
        if(p.gone)continue;
        if(t>EAT){p.r-=dt*(0.9+pull*pull*26)*(6/Math.max(p.r,2.5));}
        p.a+=dt*2.1*Math.pow(5.2/Math.max(p.r,0.6),1.5)*(1+pull*1.5);
        const sq=1+ss(9,0,p.r)*pull*2.4;
        p.m.position.set(Math.cos(p.a)*p.r,0,Math.sin(p.a)*p.r);
        p.m.rotation.y=-p.a+t*p.sp;p.m.scale.set(sq,1/Math.sqrt(sq),1/Math.sqrt(sq));
        p.orbit.material.opacity=0.1*(1-ss(EAT,EAT+2,t));
        if(p.r<hr+p.s*0.4){p.gone=true;p.m.visible=false;o.tone(140+p.r0*8,0.5,'sine',0.14,0,-90);o.rumble(160,0.6,0.4)}
      }
      // the sky itself leans toward the hole
      const sk=pull*pull;
      S.stars.position.copy(S.sys.position).multiplyScalar(sk*0.85);S.stars.scale.setScalar(1-sk*0.8);
      S.stars.rotation.z=sk*1.6;
      for(const s of S.neb)s.material.opacity=0.2*(1-sk);
      // and so do you
      S.rumT-=dt;
      if(pull>0.05&&S.rumT<=0){S.rumT=0.28;o.noise(0.4,0.06+0.3*pull,120+400*pull,0.6);o.rumble(250,0.3+0.6*pull,0.2+0.5*pull)}
      const out=ss(OUT,FIN,t),drift=Math.sin(t*0.5)*0.25;
      const cz=lerp(drift,-17,Math.pow(pull,3))+out*out*46;
      const sh=pull*0.12*(1-out);
      cam.position.set(Math.sin(t*0.37)*0.2+(Math.random()-0.5)*sh,Math.sin(t*0.29)*0.25-3*Math.pow(pull,3)*(1-out)+(Math.random()-0.5)*sh,cz+(Math.random()-0.5)*sh);
      cam.fov=72+pull*26-out*20;cam.updateProjectionMatrix();
      // as you are thrown back the doorway rushes past and shrinks away
      const yw=S.yaw*(1-out),pt=S.pitch*(1-out);
      cam.rotation.set(pt,-yw,Math.sin(t*0.4)*0.04+pull*0.25*Math.sin(t*3)*(1-out),'YXZ');
      S.door.visible=out>0;
      // a white burst when the last of it goes, then the dark of the corridor
      const w=ss(END-0.25,END+0.15,t)*(1-ss(OUT,OUT+0.8,t));
      S.white.material.opacity=w;S.white.scale.setScalar(900*w+1);S.white.position.copy(cam.position).add(new THREE.Vector3(0,0,-3).applyEuler(cam.rotation));
      S.sys.visible=t<END+0.1;
      S.fade=ss(FIN-0.7,FIN-0.1,t);
      if(t>=FIN)finish({k:'warp'});
    };
    S.bloom=1.0;
    S.snap=()=>({t:+S.t.toFixed(3),yaw:+S.yaw.toFixed(2),pitch:+S.pitch.toFixed(2)});
    S.apply=q=>{
      if(nf(q.yaw))S.yaw=q.yaw;if(nf(q.pitch))S.pitch=clamp(q.pitch,-1.2,1.2);
      if(!nf(q.t))return;
      const to=clamp(q.t,0,FIN+1),d=to-S.t;
      // the worlds wind inward step by step, so a jump forward is played through silently
      if(Math.abs(d)>0.25){if(d>0){A.mute++;try{for(let n=0;n<420&&!held&&S.t<to-0.001;n++)S.update(Math.min(0.05,to-S.t),Z)}finally{A.mute--}}else S.t=to}
    };
    return S;
  }

  /* ---------- the fall ---------- */
  function fall(){
    const S={t:0,y:0,v:0,said:0,windT:0,hit:false};
    cam.fov=78;cam.near=0.05;cam.far=200;
    scene.fog=new THREE.FogExp2(0x000000,0.055);
    const DEPTH=64;
    const brick=canvasTex(256,256,(c,w)=>{c.fillStyle='#3d3830';c.fillRect(0,0,w,w);
      for(let r=0;r<8;r++)for(let q=-1;q<4;q++){const x=q*64+(r&1?32:0),y=r*32,k=0.75+rnd()*0.45;
        c.fillStyle=`rgb(${Math.round(84*k)},${Math.round(76*k)},${Math.round(64*k)})`;c.fillRect(x+2,y+2,60,28);
        c.fillStyle='rgba(0,0,0,0.25)';c.fillRect(x+2,y+24,60,6);
        for(let i=0;i<5;i++){c.fillStyle=`rgba(${rnd()<0.5?0:255},${rnd()<0.5?0:255},0,0.04)`;c.fillRect(x+2+rnd()*50,y+2+rnd()*22,10,6)}}},true);
    brick.repeat.set(2,DEPTH/1.5);
    const shaft=new THREE.Mesh(new THREE.BoxGeometry(3,DEPTH,3),new THREE.MeshStandardMaterial({map:brick,side:THREE.BackSide,roughness:0.95}));
    shaft.position.y=-DEPTH/2+1.6;group.add(shaft);
    // what is waiting at the bottom
    const iron=new THREE.MeshStandardMaterial({color:0x8a8478,roughness:0.5,metalness:0.6});
    for(let i=0;i<5;i++)for(let j=0;j<5;j++){const sp=new THREE.Mesh(new THREE.ConeGeometry(0.16,1.3+rnd()*0.7,6),iron);sp.position.set(-1.2+i*0.6+(rnd()-0.5)*0.15,-DEPTH+2.3,-1.2+j*0.6+(rnd()-0.5)*0.15);group.add(sp)}
    const floorY=-DEPTH+3.6;
    // the doorway, left behind above
    const door=new THREE.Mesh(new THREE.PlaneGeometry(0.9,1.5),new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,0.9,0.4)}));
    door.position.set(0,0.1,1.49);door.rotation.y=Math.PI;group.add(door);
    S.torch=new THREE.PointLight(0xffb070,14,13,1.6);group.add(S.torch);
    group.add(new THREE.AmbientLight(0x202028,0.6));
    S.update=(dt)=>{
      S.t+=dt;const t=S.t;
      if(S.said===0){S.said=1;o.say('Hands in the dark shove you through.',2.5);o.noise(0.25,0.5,300,0.8);o.tone(70,0.3,'square',0.2,0,-30);o.rumble(300,1,0.8)}
      if(!S.hit){
        if(t>0.32){S.v+=13*dt;S.y-=S.v*dt}
        S.windT-=dt;
        if(t>0.3&&S.windT<=0){S.windT=0.16;const k=clamp(S.v/26,0,1);o.noise(0.35,0.08+0.45*k,500+1900*k,0.7)}
        if(S.y<=floorY){S.y=floorY;S.hit=true;S.hitT=t;o.hurtFx();o.noise(0.5,0.9,160,0.9);o.tone(60,0.5,'sawtooth',0.4,0,-40);o.rumble(600,1,1)}
      }
      const sh=clamp(S.v/26,0,1)*0.05;
      // lurch forward off the sill, then tip to look straight down the shaft
      const fwd=ss(0,0.35,t);
      cam.position.set((Math.random()-0.5)*sh,S.y+0.3,1.1-fwd*1.1+(Math.random()-0.5)*sh);
      cam.rotation.set(-ss(0.1,0.9,t)*1.45+Math.sin(t*5)*0.03,Math.sin(t*2.3)*0.25*ss(0.4,1.4,t),Math.sin(t*3.1)*0.2*ss(0.4,1.2,t),'YXZ');
      S.torch.position.copy(cam.position);S.torch.intensity=14*(1+Math.sin(t*23)*0.08);
      S.fade=S.hit?ss(0,0.12,t-S.hitT):0;
      if(S.hit&&t-S.hitT>0.9)finish({k:'dead',why:'fall'});
    };
    S.bloom=0.35;
    S.snap=()=>({t:+S.t.toFixed(3),y:+S.y.toFixed(2),v:+S.v.toFixed(2),hit:S.hit,hitT:+(S.hitT||0).toFixed(2)});
    S.apply=q=>{
      if(!nf(q.t)||!nf(q.y)||!nf(q.v))return;
      if(S.t>0.05)S.said=1;
      if(Math.abs(q.t-S.t)>0.25){S.t=q.t;S.y=q.y;S.v=q.v}
      if(q.hit===true&&!S.hit&&nf(q.hitT)){S.hit=true;S.hitT=q.hitT;S.y=q.y}
    };
    return S;
  }

  /* ---------- the glass kiln: a walkable arcade hall ---------- */
  function kiln(){
    const {W,H}=KILN,C=0.2,BY=1.35,KZ=-6.3,CZ=-0.4,RX=6,RZ=7,RH=7.5,EYE=1.6,REACH=2.5,SNAP=0.2,SNAPT=0.15,RAD=0.32;
    const S={t:0,rep:0,softT:0,endT:0,shake:0,yaw:0,pitch:-0.05,vx:0,vz:6.2,vyaw:0,vpitch:-0.05,tx:0,tz:6.2,tyaw:0,tpitch:-0.05,tjy:0,hasPose:false,
      aim:-1,held:-1,pb:-1,pl:0,tb:-1,started:false,lit:0,jy:0,eyeY:EYE,sink:[0,0,0,0,0],hot:[0.6,0.6,0.6,0.6,0.6]};
    const K=S.K=kilnGame(Math.random);
    // walking, sprinting and jumping come from the shared walker (src/movement.js); the hall only says what is solid
    const WK=createRoomWalker({o,eye:EYE,x:0,z:6.2,collide:b=>collide(b)});
    Object.defineProperty(S,'px',{get:()=>WK.b.x,set:v=>{WK.b.x=v}});Object.defineProperty(S,'pz',{get:()=>WK.b.z,set:v=>{WK.b.z=v}});
    cam.fov=70;cam.near=0.05;cam.far=80;
    scene.fog=new THREE.FogExp2(0x060403,0.03);
    const bw=W*C,bh=H*C;S.dims={bw,bh,BY,KZ,CZ,RX,RZ};
    const stone=canvasTex(256,256,(c,w)=>{c.fillStyle='#2b2722';c.fillRect(0,0,w,w);
      for(let r=0;r<4;r++)for(let q=-1;q<3;q++){const x=q*128+(r&1?64:0),y=r*64,k=0.7+rnd()*0.5;c.fillStyle=`rgb(${Math.round(70*k)},${Math.round(62*k)},${Math.round(54*k)})`;c.fillRect(x+3,y+3,122,58)}},true);
    const surf=(w,h,x,y,z,rx,ry,rough)=>{const t=stone.clone();t.needsUpdate=true;t.repeat.set(w/2,h/2);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:rough||0.95}));m.position.set(x,y,z);m.rotation.set(rx,ry,0);group.add(m);return m};
    // the hall: four walls, floor, ceiling
    surf(RX*2,RH,0,RH/2,-RZ,0,0);surf(RX*2,RH,0,RH/2,RZ,0,Math.PI);surf(RZ*2,RH,-RX,RH/2,0,0,Math.PI/2);surf(RZ*2,RH,RX,RH/2,0,0,-Math.PI/2);
    surf(RX*2,RZ*2,0,0,0,-Math.PI/2,0,0.9);surf(RX*2,RZ*2,0,RH,0,Math.PI/2,0);
    const iron=new THREE.MeshStandardMaterial({color:0x2a2622,roughness:0.55,metalness:0.4}),ironD=new THREE.MeshStandardMaterial({color:0x1a1714,roughness:0.6,metalness:0.4});
    const box=(w,h,d,x,y,z,mat,par)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat||iron);m.position.set(x,y,z);(par||group).add(m);return m};
    const plane=(w,h,x,y,z,map,k,par)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,color:new THREE.Color(k,k,k)}));m.position.set(x,y,z);(par||group).add(m);return m};
    for(const z of [-4,0,4])box(RX*2,0.35,0.5,0,RH-0.2,z,ironD);
    // braziers on the walls: a glow and nothing more, the kiln does the lighting
    for(const [x,z,ry] of [[-RX+0.1,-3,0],[-RX+0.1,3,0],[RX-0.1,-3,0],[RX-0.1,3,0]]){box(0.16,0.7,0.16,x,2.2,z,ironD);const g=glow(0xff8a40,2.4,0.7);g.position.set(x+(x<0?0.3:-0.3),2.75,z);group.add(g)}
    // the kiln: a tall glowing cabinet at the far end, stones in glass above a furnace mouth
    const kg=new THREE.Group();kg.position.set(0,BY,KZ);group.add(kg);
    box(bw+0.9,BY,0.9,0,BY/2,KZ-0.1,iron);
    const mouth=canvasTex(256,192,(c,w,h)=>{c.fillStyle='#0d0a08';c.fillRect(0,0,w,h);const g=c.createRadialGradient(w/2,h*0.85,6,w/2,h*0.85,h*0.8);g.addColorStop(0,'#ffd27a');g.addColorStop(0.35,'#f06a1c');g.addColorStop(1,'#1a0a04');
      c.fillStyle=g;c.beginPath();c.moveTo(24,h);c.lineTo(24,h*0.45);c.quadraticCurveTo(w/2,-h*0.15,w-24,h*0.45);c.lineTo(w-24,h);c.closePath();c.fill();
      c.strokeStyle='#050403';c.lineWidth=7;for(let i=1;i<6;i++){c.beginPath();c.moveTo(24+i*(w-48)/6,h*0.2);c.lineTo(24+i*(w-48)/6,h);c.stroke()}});
    plane(1.5,1.0,0,0.62,KZ+0.356,mouth,1.6);
    for(const sx of [-1,1])box(0.14,bh+0.3,0.5,sx*(bw/2+0.1),BY+bh/2,KZ,iron);
    box(bw+0.5,0.2,0.6,0,BY-0.1+0.1,KZ,iron);box(bw+0.5,0.25,0.6,0,BY+bh+0.125,KZ,iron);
    const sign=(t,w,h,fs,col)=>canvasTex(w,h,(c)=>{c.fillStyle='#120d09';c.fillRect(0,0,w,h);c.strokeStyle='#6a4a2a';c.lineWidth=5;c.strokeRect(5,5,w-10,h-10);c.strokeStyle='#ff9a40';c.lineWidth=2;c.strokeRect(12,12,w-24,h-24);
      c.font=`bold ${fs}px Georgia,serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#2a1204';c.fillText(t,w/2+3,h/2+4);c.fillStyle=col;c.fillText(t,w/2,h/2)});
    box(bw+0.5,0.6,0.3,0,BY+bh+0.55,KZ-0.1,ironD);plane(bw+0.3,0.5,0,BY+bh+0.55,KZ+0.06,sign('THE GLASS KILN',640,160,74,'#ffc070'),1.5);
    const glassBox=new THREE.BoxGeometry(bw,bh,C*1.3);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(glassBox),new THREE.LineBasicMaterial({color:new THREE.Color(0.6,0.95,1.3)}));edges.position.set(0,bh/2,0);kg.add(edges);
    const sheen=canvasTex(64,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(0.45,'rgba(255,255,255,0.5)');g.addColorStop(0.55,'rgba(255,255,255,0.05)');g.addColorStop(1,'rgba(255,255,255,0.25)');c.fillStyle=g;c.fillRect(0,0,w,h)});
    S.glass=new THREE.Mesh(new THREE.PlaneGeometry(bw,bh),new THREE.MeshBasicMaterial({map:sheen,color:0x9fd8ff,transparent:true,opacity:0.07,depthWrite:false,blending:THREE.AdditiveBlending}));
    S.glass.position.set(0,bh/2,C*0.66);kg.add(S.glass);
    const back=new THREE.Mesh(new THREE.PlaneGeometry(bw,bh),new THREE.MeshBasicMaterial({color:0x06080a}));back.position.set(0,bh/2,-C*0.66);kg.add(back);
    // the next stone waits in a small window on the cabinet
    const NX=-bw/2-0.95,NY=bh-0.7;
    box(1.1,0.95,0.12,NX,NY,-0.12,ironD,kg);
    plane(1.0,0.85,NX,NY,-0.05,canvasTex(128,112,(c,w,h)=>{c.fillStyle='#07090b';c.fillRect(0,0,w,h);c.strokeStyle='#ff9a40';c.lineWidth=2;c.strokeRect(3,3,w-6,h-6);c.font='bold 15px Georgia,serif';c.textAlign='center';c.fillStyle='#e8b070';c.fillText('NEXT',w/2,19)}),1.2,kg);
    // the sealed door on the back wall, one rune for each row that must burn
    const DX=3.4;S.doorX=DX;
    for(const sx of [-1,1])box(0.28,2.9,0.5,DX+sx*0.95,1.45,-RZ+0.25,ironD);box(2.2,0.4,0.5,DX,3.05,-RZ+0.25,ironD);
    const gate=new THREE.Mesh(new THREE.PlaneGeometry(1.65,2.7),new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.9,1.1)}));gate.position.set(DX,1.35,-RZ+0.03);group.add(gate);
    S.door=box(1.65,2.7,0.2,DX,1.35,-RZ+0.2,new THREE.MeshStandardMaterial({color:0x3a2a1c,roughness:0.8}));
    S.runes=[];
    for(let i=0;i<KILN.need;i++){const r=new THREE.Mesh(new THREE.OctahedronGeometry(0.13),new THREE.MeshBasicMaterial({color:0x221a14}));r.position.set(DX-0.45+i*0.3,3.05,-RZ+0.52);group.add(r);S.runes.push(r)}
    // stones: bright faces with a dark rim, coloured per cell
    const tile=canvasTex(64,64,(c,w)=>{c.fillStyle='#000';c.fillRect(0,0,w,w);const g=c.createRadialGradient(w/2,w/2,2,w/2,w/2,w*0.62);g.addColorStop(0,'#fff');g.addColorStop(0.7,'#b9b9b9');g.addColorStop(1,'#3a3a3a');c.fillStyle=g;c.fillRect(4,4,w-8,w-8);
      c.strokeStyle='rgba(0,0,0,0.5)';c.lineWidth=2;c.beginPath();c.moveTo(12,20);c.lineTo(28,30);c.lineTo(22,48);c.moveTo(28,30);c.lineTo(50,24);c.stroke()});
    const MAXI=W*H+12;
    S.inst=new THREE.InstancedMesh(new THREE.BoxGeometry(C*0.94,C*0.94,C*0.94),new THREE.MeshBasicMaterial({map:tile}),MAXI);
    S.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);S.inst.frustumCulled=false;kg.add(S.inst);
    S.ghost=new THREE.InstancedMesh(new THREE.BoxGeometry(C*0.9,C*0.9,C*0.3),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.13,depthWrite:false}),4);
    S.ghost.frustumCulled=false;kg.add(S.ghost);
    const COL=[null,[2.6,0.75,0.16],[2.4,1.5,0.3],[2.3,0.3,0.22],[0.2,0.2,0.23]];
    S.l1=new THREE.PointLight(0xff8a40,70,24,1.5);S.l1.position.set(0,BY+bh*0.5,KZ+3);group.add(S.l1);
    S.l2=new THREE.PointLight(0xffb070,16,10,1.6);S.l2.position.set(0,2.4,CZ+1.4);group.add(S.l2);
    const l3=new THREE.PointLight(0x7fb8ff,22,26,1.6);l3.position.set(-2,6.5,-1);group.add(l3);
    group.add(new THREE.AmbientLight(0x3a3844,1.1));
    // the control console: a chunky cabinet with a slanted deck and five big buttons
    const con=new THREE.Group();con.position.set(0,0,CZ);group.add(con);
    box(2.6,0.85,1.0,0,0.425,0,iron,con);
    for(const sx of [-1,1])box(0.07,0.9,1.04,sx*1.3,0.45,0,ironD,con);
    const mat=canvasTex(256,256,(c,w)=>{c.fillStyle='#14100d';c.fillRect(0,0,w,w);for(let i=0;i<900;i++){c.fillStyle=`rgba(255,255,255,${rnd()*0.03})`;c.fillRect(rnd()*w,rnd()*w,2,2)}});
    const slotT=canvasTex(128,160,(c,w,h)=>{c.fillStyle='#0c0a08';c.fillRect(0,0,w,h);c.strokeStyle='#6a4a2a';c.lineWidth=3;c.strokeRect(3,3,w-6,h-6);
      c.fillStyle='#ff8a30';c.fillRect(w/2-4,26,8,50);c.fillStyle='#331a08';c.fillRect(w/2-2,30,4,42);c.font='bold 14px Georgia,serif';c.textAlign='center';c.fillStyle='#e8b070';c.fillText('ONE EMBER',w/2,104);c.fillText('PER STONE',w/2,124);c.fillText('(FREE)',w/2,144)});
    plane(0.5,0.62,0.7,0.42,0.505,slotT,1.4,con);
    plane(1.2,0.35,-0.5,0.42,0.505,canvasTex(256,70,(c,w,h)=>{c.fillStyle='#0c0a08';c.fillRect(0,0,w,h);c.font='bold 26px Georgia,serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#c98a4a';c.fillText('GLASS  &  EMBER',w/2,h/2)}),1.3,con);
    // trim lights along the front, chasing until the first press
    S.bulbs=[];for(let i=0;i<13;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.04),new THREE.MeshBasicMaterial({color:0x331a08}));b.position.set(-1.2+i*0.2,0.76,0.52);con.add(b);S.bulbs.push(b)}
    // the deck, tilted toward the player
    const deck=new THREE.Group();deck.position.set(0,1.05,0);deck.rotation.x=0.42;con.add(deck);
    const BTN=[['LEFT',[240,140,40]],['RIGHT',[240,140,40]],['TURN',[236,196,60]],['FASTER',[60,170,230]],['SLAM',[226,50,40]]],BX=[-0.9,-0.45,0,0.45,0.9];
    const plate=canvasTex(1024,360,(c,w,h)=>{c.fillStyle='#17130f';c.fillRect(0,0,w,h);for(let i=0;i<2400;i++){c.fillStyle=`rgba(255,255,255,${rnd()*0.035})`;c.fillRect(rnd()*w,rnd()*h,2,2)}
      c.strokeStyle='#6a4a2a';c.lineWidth=4;c.strokeRect(10,10,w-20,h-20);c.strokeStyle='rgba(255,154,64,0.5)';c.lineWidth=2;c.strokeRect(22,22,w-44,h-44);
      for(const [x,y] of [[34,34],[w-34,34],[34,h-34],[w-34,h-34]]){c.fillStyle='#4a3a2a';c.beginPath();c.arc(x,y,7,0,7);c.fill()}
      c.textAlign='center';c.textBaseline='middle';c.font='bold 38px Georgia,serif';
      BTN.forEach((b,i)=>{const x=(BX[i]+1.3)/2.6*w;c.fillStyle=`rgb(${b[1].join(',')})`;c.fillText(b[0],x,h*0.84)});
      c.fillStyle='rgba(255,154,64,0.35)';c.font='bold 22px Georgia,serif';c.fillText('HOLD  ◂ ▸  TO  SLIDE   ·   HOLD  FASTER  TO  FALL  FASTER',w/2,h*0.1)});
    const dm=new THREE.MeshStandardMaterial({color:0x2a2622,roughness:0.55,metalness:0.4});
    const deckM=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.1,0.9),[dm,dm,new THREE.MeshStandardMaterial({map:plate,roughness:0.7,metalness:0.3}),dm,dm,dm]);deck.add(deckM);
    const icon=(c,w,i)=>{c.fillStyle='#fff1d6';c.strokeStyle='#2a1204';c.lineWidth=w*0.035;c.lineJoin='round';c.lineCap='round';const P=(pts)=>{c.beginPath();pts.forEach((p,j)=>j?c.lineTo(p[0]*w,p[1]*w):c.moveTo(p[0]*w,p[1]*w));c.closePath();c.fill();c.stroke()};
      if(i===0)P([[0.64,0.25],[0.27,0.5],[0.64,0.75]]);else if(i===1)P([[0.36,0.25],[0.73,0.5],[0.36,0.75]]);
      else if(i===2){c.lineWidth=w*0.1;c.strokeStyle='#2a1204';c.beginPath();c.arc(w/2,w/2,w*0.22,-2.2,1.5);c.stroke();c.strokeStyle='#fff1d6';c.lineWidth=w*0.065;c.beginPath();c.arc(w/2,w/2,w*0.22,-2.2,1.5);c.stroke();c.lineWidth=w*0.035;c.strokeStyle='#2a1204';P([[0.3,0.43],[0.2,0.2],[0.52,0.3]])}
      else if(i===3)P([[0.24,0.34],[0.76,0.34],[0.5,0.74]]);
      else{P([[0.42,0.2],[0.58,0.2],[0.58,0.46],[0.74,0.46],[0.5,0.7],[0.26,0.46],[0.42,0.46]]);c.fillRect(0.26*w,0.76*w,0.48*w,0.07*w);c.strokeRect(0.26*w,0.76*w,0.48*w,0.07*w)}};
    S.btn=[];S.bp=[];
    BTN.forEach((b,i)=>{
      const g=new THREE.Group();g.position.set(BX[i],0.05,-0.04);deck.add(g);
      const ring=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.16,0.03,24),ironD);ring.position.y=0.015;g.add(ring);
      const side=new THREE.MeshStandardMaterial({color:new THREE.Color(b[1][0]/255,b[1][1]/255,b[1][2]/255).multiplyScalar(0.5),emissive:new THREE.Color(b[1][0]/255,b[1][1]/255,b[1][2]/255),emissiveIntensity:0.4,roughness:0.4});
      const body=new THREE.Mesh(new THREE.CylinderGeometry(0.115,0.125,0.1,24,1,true),side);body.position.y=0.06;g.add(body);
      const tex=canvasTex(128,128,(c,w)=>{const gr=c.createRadialGradient(w*0.42,w*0.36,4,w/2,w/2,w*0.55);const f=(k)=>`rgb(${b[1].map(v=>Math.min(255,Math.round(v*k))).join(',')})`;
        gr.addColorStop(0,f(1.25));gr.addColorStop(0.6,f(0.85));gr.addColorStop(1,f(0.45));c.fillStyle=gr;c.fillRect(0,0,w,w);
        c.strokeStyle='rgba(0,0,0,0.35)';c.lineWidth=6;c.beginPath();c.arc(w/2,w/2,w*0.47,0,7);c.stroke();icon(c,w,i)});
      const cap=new THREE.Mesh(new THREE.CircleGeometry(0.115,28),new THREE.MeshBasicMaterial({map:tex,color:0xffffff}));cap.rotation.x=-Math.PI/2;cap.position.y=0.111;g.add(cap);
      S.btn.push({g,cap,side,col:b[1]});
    });
    // the marquee, backlit, leaning over the back of the deck
    box(2.6,0.3,0.1,0,1.36,-0.5,ironD,con);plane(2.5,0.24,0,1.36,-0.447,sign('THE GLASS KILN',640,64,38,'#ffc070'),1.5,con);
    S.mq=con.children[con.children.length-1];
    // a worn mat to stand on
    const rug=new THREE.Mesh(new THREE.PlaneGeometry(2.8,1.3),new THREE.MeshStandardMaterial({map:canvasTex(256,128,(c,w,h)=>{c.fillStyle='#2a0f0a';c.fillRect(0,0,w,h);c.strokeStyle='#8a5a2a';c.lineWidth=6;c.strokeRect(6,6,w-12,h-12);c.strokeStyle='#5a2a14';c.lineWidth=3;c.strokeRect(16,16,w-32,h-32);for(let i=0;i<500;i++){c.fillStyle=`rgba(0,0,0,${rnd()*0.2})`;c.fillRect(rnd()*w,rnd()*h,3,2)}}),roughness:1}));
    rug.rotation.x=-Math.PI/2;rug.position.set(0,0.01,1.65);group.add(rug);
    // an iron rail keeps you at arm's length from the deck
    box(3.0,0.06,0.06,0,0.95,1.0,iron);box(3.0,0.06,0.06,0,0.55,1.0,ironD);for(const x of [-1.45,0,1.45])box(0.09,1.0,0.09,x,0.5,1.0,iron);
    con.updateMatrixWorld(true);
    S.btn.forEach(b=>{const v=new THREE.Vector3(0,0.111,0);b.g.localToWorld(v);S.bp.push([v.x,v.y,v.z])});
    // where the walls and furniture stop you
    const BOXES=[[-1.45,1.45,CZ-0.5,1.0],[-bw/2-0.45,bw/2+0.45,-RZ,KZ+0.5]];
    const M=new THREE.Matrix4(),col=new THREE.Color();
    const X=x=>(x-W/2+0.5)*C,Y=y=>(y+0.5)*C;
    const draw=()=>{
      let n=0;const L=0.3+0.7*S.lit;const put=(x,y,c,k,z)=>{if(n>=MAXI)return;M.makeTranslation(x,y,z||0);S.inst.setMatrixAt(n,M);col.setRGB(c[0]*k*L,c[1]*k*L,c[2]*k*L);S.inst.setColorAt(n,col);n++};
      const dead=K.over==='dead'?clamp(S.endT*1.4,0,1):0,win=K.over==='win'?S.endT:0;
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=K.g[y*W+x];if(!v)continue;
        const c=COL[v],pulse=v===4?1:0.82+0.18*Math.sin(S.t*2.2+x*1.3+y*0.7);
        put(X(x),Y(y)+(win?win*win*-3*(1+((x*7+y*3)%5)*0.3):0),dead?[lerp(c[0],0.16,dead),lerp(c[1],0.15,dead),lerp(c[2],0.16,dead)]:c,pulse)}
      for(const f of K.flash)if(f.t>0)for(let x=0;x<W;x++)put(X(x),Y(f.y),[4,3.2,2],f.t/0.45,0.02);
      const p=K.piece;let gn=0;
      if(p){
        const ly=K.landY();
        for(const q of p.c){put(X(p.x+q[0]),Y(p.y+q[1]),COL[p.col],1.25);
          if(ly<p.y){M.makeTranslation(X(p.x+q[0]),Y(ly+q[1]),0);S.ghost.setMatrixAt(gn++,M)}}
      }
      if(K.next&&!K.over){const nw=Math.max(...K.next.c.map(q=>q[0]))+1,nh=Math.max(...K.next.c.map(q=>q[1]))+1;
        for(const q of K.next.c)put(NX+(q[0]-(nw-1)/2)*C*0.8,NY-0.06+(q[1]-(nh-1)/2)*C*0.8,COL[K.next.col],0.8,0.02)}
      S.inst.count=n;S.inst.instanceMatrix.needsUpdate=true;if(S.inst.instanceColor)S.inst.instanceColor.needsUpdate=true;
      S.ghost.count=gn;S.ghost.instanceMatrix.needsUpdate=true;
    };
    const hud=()=>o.hud(K.over==='win'?'<b>The glass parts.</b>':K.over==='dead'?'<b>The kiln is full.</b>':
      !S.started?`<b>THE GLASS KILN</b><br>Walk to the console and press any button to light the kiln<br><small>${o.hint()}</small>`:
      `<b>THE GLASS KILN</b><br>Rows burned <b>${K.cleared} / ${KILN.need}</b> &nbsp;·&nbsp; ash rises in ${Math.max(0,Math.ceil(K.ashT))}s<br><small>${o.hint()}</small>`);
    const landed=n=>{
      if(n<0)return;
      if(n>0){o.tone(330,0.25,'triangle',0.2);o.tone(495,0.3,'triangle',0.18,0.08);o.tone(660,0.4,'triangle',0.16,0.16);o.noise(0.35,0.25,2400,0.8);o.rumble(160,0.5,0.6);S.shake=0.25}
      else{o.tone(110,0.09,'square',0.1,0,-30);o.rumble(50,0.2,0.3)}
      S.softT=0;
    };
    // the ray from the eye (or from a tap) to the nearest button within reach, forgiving by design
    const basis=()=>{const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw),sp=Math.sin(S.pitch),cp=Math.cos(S.pitch);return {f:[sy*cp,sp,-cy*cp],r:[cy,0,sy],u:[-sy*sp,cp,cy*sp]}};
    const pick=(d,snap)=>{
      let best=-1,bd=snap;const e=[S.px,S.eyeY,S.pz];
      for(let i=0;i<5;i++){const p=S.bp[i],vx=p[0]-e[0],vy=p[1]-e[1],vz=p[2]-e[2],t=vx*d[0]+vy*d[1]+vz*d[2],l2=vx*vx+vy*vy+vz*vz;
        if(t<=0||l2>REACH*REACH)continue;const pe=Math.sqrt(Math.max(0,l2-t*t));if(pe<=bd){bd=pe;best=i}}
      return best;
    };
    const fovFor=a=>{const tv=Math.max(Math.tan(35*Math.PI/180),0.62/Math.max(0.2,a));return Math.min(100,2*Math.atan(tv)*180/Math.PI)};
    S.tap=(nx,ny)=>{
      if(A.watching||K.over||!nf(nx)||!nf(ny))return false;
      const sz=renderer.getSize(new THREE.Vector2()),a=sz.x/Math.max(1,sz.y),tv=Math.tan(fovFor(a)*Math.PI/360),B=basis(),d=[0,1,2].map(k=>B.f[k]+B.r[k]*nx*tv*a+B.u[k]*ny*tv),l=Math.hypot(...d);
      const b=pick(d.map(v=>v/l),SNAPT);if(b<0)return false;S.tb=b;return true;
    };
    S.untap=()=>{S.tb=-1};
    S.aimed=()=>S.aim>=0;
    const setHeld=(h,quiet)=>{
      if(h===S.held)return;const was=S.held;S.held=h;
      if(!quiet){if(h>=0)o.tone(150+h*30,0.05,'square',0.14,0,-70);else if(was>=0)o.tone(260,0.03,'square',0.05)}
    };
    const press=(dt,inp)=>{
      // a press locks on to the button it started on, so a shaky hand can't slide off it
      if(inp.press){if(!S.pl){S.pl=1;S.pb=S.aim}}else{S.pl=0;S.pb=-1}
      const h=K.over?-1:S.pb>=0?S.pb:S.tb,was=S.held;
      setHeld(h);
      if(h>=0&&h!==was){
        S.started=true;
        if(h<2){S.rep=0.19;if(K.move(h?1:-1))o.tone(520,0.03,'square',0.04)}
        else if(h===2){if(K.rotate())o.tone(700,0.05,'triangle',0.07)}
        else if(h===4){landed(K.drop());S.shake=Math.max(S.shake,0.08);return true}
      }else if(h===0||h===1){S.rep-=dt;if(S.rep<=0){S.rep=0.06;if(K.move(h?1:-1))o.tone(520,0.03,'square',0.04)}}
      return false;
    };
    const collide=b=>{
      for(let it=0;it<2;it++){
        for(const q of BOXES){const qx=clamp(b.x,q[0],q[1]),qz=clamp(b.z,q[2],q[3]),ex=b.x-qx,ez=b.z-qz,d=Math.hypot(ex,ez);
          if(d<RAD){if(d>1e-6){b.x=qx+ex/d*RAD;b.z=qz+ez/d*RAD}else{const m=[b.x-q[0],q[1]-b.x,b.z-q[2],q[3]-b.z],i=m.indexOf(Math.min(...m));
            if(i===0)b.x=q[0]-RAD;else if(i===1)b.x=q[1]+RAD;else if(i===2)b.z=q[2]-RAD;else b.z=q[3]+RAD}}}
        b.x=clamp(b.x,-RX+RAD,RX-RAD);b.z=clamp(b.z,-RZ+RAD,RZ-RAD);
      }
    };
    const walk=(dt,inp)=>{
      lookStep(S,dt,nf(inp.lx)?inp.lx:0,nf(inp.ly)?inp.ly:0);
      S.yaw=((S.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      WK.step(dt,inp,S.yaw);S.jy=WK.b.y;
      view();S.vx=S.px;S.vz=S.pz;S.vyaw=S.yaw;S.vpitch=S.pitch;
      // aiming a button works on the ground only
      const B=basis();S.aim=K.over||WK.inAir()?-1:pick(B.f,SNAP);
    };
    // the eye follows the jump and the footstep bob; a watcher gets the same bob from how far the view really moved
    const view=()=>{S.eyeY=EYE+S.jy+bobY(WK.b,WK.scale)};
    const watchView=dt=>{
      const wr=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      if(!S.hasPose||Math.hypot(S.tx-S.vx,S.tz-S.vz)>4){S.vx=S.tx;S.vz=S.tz;S.vyaw=S.tyaw;S.vpitch=S.tpitch;S.hasPose=true;return}
      const k=Math.min(1,dt*12),ox=S.vx,oz=S.vz;
      S.vx+=(S.tx-S.vx)*k;S.vz+=(S.tz-S.vz)*k;S.vyaw=wr(S.vyaw+wr(S.tyaw-S.vyaw)*k);S.vpitch+=(S.tpitch-S.vpitch)*k;
      S.jy+=(S.tjy-S.jy)*k;bobAdvance(WK.b,Math.hypot(S.vx-ox,S.vz-oz),WK.scale);view();S.px=S.vx;S.pz=S.vz;
    };
    const visuals=dt=>{
      const k=Math.min(1,dt*28);
      for(let i=0;i<5;i++){
        const b=S.btn[i],tgt=S.held===i?1:0;S.sink[i]+=(tgt-S.sink[i])*k;
        const want=S.held===i?1.7:S.aim===i?1.3:S.started?0.75:0.65+0.2*(0.5+0.5*Math.sin(S.t*3-i*0.9));S.hot[i]+=(want-S.hot[i])*k;
        b.g.position.y=0.05-0.045*S.sink[i];b.cap.material.color.setScalar(S.hot[i]);b.side.emissiveIntensity=0.15+S.hot[i]*0.45;
      }
      for(let i=0;i<S.bulbs.length;i++){const on=S.started?0.55+0.45*Math.sin(S.t*1.5+i*0.5):Math.max(0,Math.sin(S.t*5-i*0.6));S.bulbs[i].material.color.setRGB(0.2+on*2.4,0.1+on*1.0,0.04+on*0.2)}
      S.mq.material.color.setScalar(1.35+Math.sin(S.t*2.1)*0.08);
      S.l1.intensity=70*(0.35+0.65*S.lit)*(1+Math.sin(S.t*9)*0.05);
    };
    const runes=()=>{for(let i=0;i<S.runes.length;i++)S.runes[i].material.color.setRGB(i<K.cleared?3:0.13,i<K.cleared?1.8:0.1,i<K.cleared?0.5:0.08)};
    S.update=(dt,inp)=>{
      S.t+=dt;
      for(const f of K.flash)f.t-=dt;
      if(S.shake>0)S.shake-=dt;
      if(A.watching)watchView(dt);else walk(dt,inp);
      S.lit+=((S.started?1:0)-S.lit)*Math.min(1,dt*3);
      if(K.over){
        if(S.endT===0){
          if(K.over==='win'){o.tone(392,0.5,'sine',0.2);o.tone(523,0.6,'sine',0.2,0.15);o.tone(784,0.9,'sine',0.2,0.3);o.noise(0.9,0.2,1800,0.6)}
          else{o.tone(90,0.9,'sawtooth',0.3,0,-50);o.noise(0.8,0.5,220,0.8);o.rumble(500,1,0.8);S.shake=0.7}
        }
        S.endT+=dt;
        if(!A.watching)setHeld(-1,true);
        if(K.over==='win'){S.door.position.x=S.doorX+ss(0.2,1.5,S.endT)*1.5;S.glass.material.opacity=0.07*(1-ss(0,1,S.endT))}
        S.fade=ss(K.over==='win'?1.4:1.1,K.over==='win'?2.0:1.7,S.endT);
        hud();visuals(dt);draw();
        if(S.endT>(K.over==='win'?2.0:1.7))finish({k:K.over==='win'?'win':'dead',why:'kiln'});
        return;
      }
      if(A.watching){
        // the watcher only draws what the player's last snapshot said; the rules run on the player's side
        runes();K.ashT-=dt;visuals(dt);hud();draw();return;
      }
      const slammed=press(dt,inp);
      // nothing falls, and the ash holds its breath, until the first press
      if(S.started&&!slammed){
        K.fallT+=dt;const iv=S.held===3?0.045:Math.max(0.45,1.0-K.cleared*0.1);
        if(K.fallT>=iv){K.fallT=0;landed(K.step())}
      }
      if(S.started){
        K.ashT-=dt;
        if(K.ashT<=0&&!K.over){K.ashT=KILN.ash;K.rise();o.noise(0.5,0.3,260,0.9);o.tone(80,0.4,'sawtooth',0.15,0,-20);S.shake=0.2}
      }
      runes();visuals(dt);hud();draw();
    };
    S.snap=()=>{const p=K.piece,n=K.next,fl=[];for(const f of K.flash)if(f.t>0)fl.push([f.y,+f.t.toFixed(2)]);
      return {g:Array.from(K.g).join(''),p:p?[p.col,p.x,p.y,p.c.flat()]:null,n:n?[n.col,n.c.flat()]:null,cl:K.cleared,a:+K.ashT.toFixed(1),o:K.over,f:fl,e:+S.endT.toFixed(2),
        x:+S.px.toFixed(2),z:+S.pz.toFixed(2),jy:+S.jy.toFixed(2),yw:+S.yaw.toFixed(2),pt:+S.pitch.toFixed(2),am:S.aim,hd:S.held,st:S.started?1:0}};
    const cells=a=>{if(!Array.isArray(a)||a.length<2||a.length>16||a.length%2)return null;const c=[];
      for(let i=0;i<a.length;i+=2){const x=a[i],y=a[i+1];if(!Number.isInteger(x)||!Number.isInteger(y)||Math.abs(x)>6||Math.abs(y)>6)return null;c.push([x,y])}return c};
    S.apply=q=>{
      if(typeof q.g==='string'&&q.g.length===W*H&&/^[0-4]+$/.test(q.g))for(let i=0;i<W*H;i++)K.g[i]=q.g.charCodeAt(i)-48;
      if(q.p===null)K.piece=null;
      else if(Array.isArray(q.p)){const c=cells(q.p[3]),[col,x,y]=q.p;if(c&&Number.isInteger(col)&&col>=1&&col<=4&&Number.isInteger(x)&&Number.isInteger(y)&&x>-8&&x<16&&y>-8&&y<40)K.piece={c,col,x,y}}
      if(q.n===null)K.next=null;
      else if(Array.isArray(q.n)){const c=cells(q.n[1]),col=q.n[0];if(c&&Number.isInteger(col)&&col>=1&&col<=4)K.next={c,col}}
      if(Number.isInteger(q.cl)&&q.cl>=0&&q.cl<100){if(q.cl>K.cleared){o.tone(330,0.25,'triangle',0.2);o.tone(495,0.3,'triangle',0.18,0.08);o.tone(660,0.4,'triangle',0.16,0.16);S.shake=0.25}K.cleared=q.cl}
      if(nf(q.a))K.ashT=clamp(q.a,0,KILN.ash);
      if(q.o===null||q.o==='win'||q.o==='dead')K.over=q.o;
      if(Array.isArray(q.f)){K.flash=[];for(const f of q.f.slice(0,8))if(Array.isArray(f)&&Number.isInteger(f[0])&&nf(f[1])&&f[0]>=0&&f[0]<H)K.flash.push({y:f[0],t:clamp(f[1],0,0.45)})}
      if(nf(q.e)&&K.over&&Math.abs(q.e-S.endT)>0.25)S.endT=clamp(q.e,0,3);
      // where the player stands and looks, what they aim at and hold (a client without these fields is taken to be playing)
      if(nf(q.x)&&nf(q.z)){S.tx=clamp(q.x,-RX,RX);S.tz=clamp(q.z,-RZ,RZ)}
      if(nf(q.jy))S.tjy=clamp(q.jy,0,2);
      if(nf(q.yw))S.tyaw=clamp(q.yw,-7,7);
      if(nf(q.pt))S.tpitch=clamp(q.pt,-1.2,1.2);
      if(Number.isInteger(q.am)&&q.am>=-1&&q.am<5)S.aim=q.am;
      if(Number.isInteger(q.hd)&&q.hd>=-1&&q.hd<5)setHeld(q.hd);
      if(q.st===0||q.st===1)S.started=q.st===1;else if(q.st===undefined)S.started=true;
    };
    S.frame=()=>{
      cam.fov=fovFor(cam.aspect);
      const sh=S.shake>0?S.shake*0.12:0;
      cam.position.set(S.vx+(Math.random()-0.5)*sh,S.eyeY+(Math.random()-0.5)*sh,S.vz);cam.rotation.set(S.vpitch,-S.vyaw,0,'YXZ');
    };
    runes();visuals(0);draw();hud();
    S.bloom=0.55;
    return S;
  }

  /* ---------- behind the mirror ---------- */
  // you stand in the back room of a one-way mirror; the timeline (seconds) is fixed, only the smashing and your choice move
  const MIR0={ENTER:17,K:[19,20.9,22.7],STOP:23.7,HEAD:24.4,BODY:26.6,WALK:28.2,SMASH:30.6,CAN:31.2,CHOICE:32.2,NB:13,BREAK:14,SZ:-4.1,LOOK:0.8};
  function mirror(seed){
    const LOW=!!o.low,TAU=Math.PI*2,S={held:false,ht:-9,aim:false,splats:[],sn:0,spj:-1,spc:0,spt:[0,1.5,-1],btn:['USE',false],t:0,yaw:0,pitch:0.02,said:0,ch:0,ct:-1,bt:-1,sm:0,sel:-1,prev:null,lk:0,shk:0,leaveT:-1,want:null,touch:false,nb:0,blind:0,ph:'watch',eyeY:1.6,fr:false,fb:0,gb:-1,st:false,tg:'',tx:0,tz:0.1,tyaw:0,tpit:0.02,hasPose:false,dip:0,tjy:0,lamp:1,lampK:1,lockT:-9,lockC:0,locks:0};
    cam.fov=66;cam.near=0.05;cam.far=60;
    const wrap=a=>{a%=TAU;return a>Math.PI?a-TAU:a<-Math.PI?a+TAU:a},ang=(dx,dz)=>Math.atan2(dx,dz),nrm=(x,z)=>{const l=Math.hypot(x,z)||1;return[x/l,z/l]};
    const CC=c=>Array.isArray(c)?new THREE.Color().setRGB(c[0],c[1],c[2]):new THREE.Color(c);
    // ---- this visit's room: one seed drives the cast, the furniture, the colours and the timing (a watcher rebuilds the same room from it) ----
    seed=Number.isInteger(seed)&&seed>=0&&seed<4294967296?seed:(Math.random()*4294967296)>>>0;S.seed=seed;
    const rr=rng32(seed),rg=(a,b)=>a+(b-a)*rr(),pk=a=>a[rr()*a.length|0],shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=rr()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
    const PX=3.7,PZ=-6.8,PH=3.4;
    const WALLS=[[0x5a1618,[0.2,0.085,0.05],[0.42,0.22,0.1]],[0x1f3a2a,[0.07,0.11,0.08],[0.26,0.3,0.16]],[0x2a2f4a,[0.07,0.08,0.13],[0.2,0.22,0.35]],[0x5a4220,[0.17,0.11,0.06],[0.4,0.28,0.12]],[0x4a1c3a,[0.12,0.05,0.09],[0.32,0.15,0.22]],[0x1f4045,[0.05,0.1,0.11],[0.15,0.28,0.3]]];
    const RUGS=[[[0.34,0.05,0.07],[0.1,0.09,0.2],[0.5,0.36,0.12]],[[0.08,0.2,0.16],[0.2,0.1,0.05],[0.5,0.42,0.2]],[[0.16,0.1,0.3],[0.3,0.08,0.1],[0.55,0.45,0.2]],[[0.38,0.26,0.1],[0.1,0.14,0.08],[0.55,0.18,0.1]],[[0.2,0.2,0.22],[0.3,0.05,0.07],[0.5,0.5,0.45]]];
    const wall=pk(WALLS),rugK=pk(RUGS),floorC=pk([0x6a4a2c,0x5a3a22,0x7a5a38,0x4a3426,0x6a5a42]),wpat=rr()*3|0,wsc=rg(0.2,0.34),rugP=rr()*3|0;
    const SKIN=[0xd7a98a,0xe2b698,0xc99876,0x9a6a4a,0x6e4630,0xefc7a8,0xb88462],HAIR=[0x2a1a12,0x1c140f,0xc9c4bc,0x6a3a1c,0x8a5a2a,0xd2b070,0x4a1a12,0x7a7a80];
    const TOPS=[0x3a1f33,0x1f6a4a,0x1c3a6a,0x6a1c1c,0x5a4a1c,0x2a4a5a,0x6a3a5a,0x2a2a30,0x7a6a4a,0x3a5a2a];
    const mkCfg=()=>{const f=rr()<0.55,skin=pk(SKIN),hair=pk(HAIR);
      if(f){const top=pk(TOPS);return{skin,hair,top,bot:top,collar:pk([0xeee6d6,0xd8cfe0,0xe8d8c0]),dress:1,bun:rr()<0.65?1:0,seed:rg(0,6),h:rg(0.93,1.03)}}
      return{skin,hair,top:pk([0xe6dfd0,0xd0d8e0,0x9aa0a8,0xe0d0b0]),bot:pk([0x2a2a30,0x26303a,0x3a2a22]),vest:pk([0x5a1d26,0x1d3a5a,0x2a4a2a,0x4a3a1a]),tie:pk([0x1a1a1a,0x5a1010,0x103a5a]),beard:rr()<0.45?1:0,seed:rg(0,6),h:rg(1.02,1.1)}};
    const DX=pk([2.3,-2.4,0.15]);   // which door of the parlor the thing comes through
    const occ=[],crowd=(x,z,r)=>occ.some(q=>Math.hypot(q[0]-x,q[1]-z)<q[2]+r),spot=(xa,xb,za,zb,r)=>{let x,z;for(let i=0;i<60;i++){x=rg(xa,xb);z=rg(za,zb);if(!crowd(x,z,r))break}occ.push([x,z,r]);return[x,z]};
    const fw=[[DX-1.0,DX+1.0]],fwFree=(a,b)=>fw.every(q=>b+0.15<q[0]||a-0.15>q[1]),fwPlace=w=>{for(let i=0;i<60;i++){const x=rg(-PX+w/2+0.25,PX-w/2-0.25);if(fwFree(x-w/2,x+w/2)){fw.push([x-w/2,x+w/2]);return x}}return null};
    const sbX=fwPlace(1.5)??(DX>0?-2.2:2.2),sofX=fwPlace(1.4)??(DX>0?-0.4:0.9);
    const TZ=rg(-5.2,-4.55),TX=rg(-1.7,0.9);let seatK=pk(['L','R','B']);if(seatK==='B'&&!fwFree(TX-0.6,TX+0.6))seatK=pk(['L','R']);if(seatK==='B')fw.push([TX-0.6,TX+0.6]);
    const SEAT={L:[TX-1.0,TZ,Math.PI/2],R:[TX+1.0,TZ,-Math.PI/2],B:[TX,TZ-1.05,0]},seat2=seatK==='L'?'R':seatK==='R'?'L':pk(['L','R']);
    occ.push([TX,TZ,1.25]);for(const k of [seatK,seat2])occ.push([SEAT[k][0],SEAT[k][1],0.5]);
    const PS={x0:rg(-2.0,-0.6),L:rg(2.0,3.0),z:rg(-3.7,-3.2),sp:rg(0.5,0.7),s:pk([-1,1]),tg:rg(9,11.8)};
    for(let i=0;i<5;i++)occ.push([PS.x0+PS.L*i/4,PS.z,0.55]);
    const pace=t=>{const sp=PS.sp,L=PS.L,u=((t*sp)%(2*L)+2*L)%(2*L),d=u<L?u:2*L-u,sn=Math.sin(Math.PI*u/L);return{x:PS.s>0?PS.x0+d:PS.x0+L-d,z:PS.z,yaw:PS.s*Math.PI/2*Math.tanh(sn*5),wa:Math.min(1,Math.abs(sn)*4),w:t*sp*5.2}};
    const LA=[-rg(2.75,3.3),rg(-5.2,-2.7)],LB=[rg(2.75,3.3),rg(-5.2,-2.7)];occ.push([LA[0],LA[1],0.5],[LB[0],LB[1],0.5]);
    const GL=[rg(-0.5,0.7),-2.6],side=pk([-1,1]),A0=spot(side<0?-3.2:2.2,side<0?-2.2:3.2,-4.1,-3.0,0.55),QS=spot(-3.2,3.2,-4.4,-2.9,0.6);
    // wall hangings keep clear of the door and of each other
    const decor=[[DX-1.1,DX+1.1]],dFree=(x,w)=>decor.every(q=>x+w/2+0.1<q[0]||x-w/2-0.1>q[1]),dPlace=w=>{for(let i=0;i<60;i++){const x=rg(-3.0,3.0);if(dFree(x,w)){decor.push([x-w/2,x+w/2]);return x}}return null};
    // the cast: two to four people, each with a routine of their own; the preener is always one of them
    const nP=2+(rr()*3|0),roles=shuf(['glass'].concat(shuf(['pace','sit','stand']).slice(0,nP-1)));
    const cast=roles.map(role=>({role,c:mkCfg(),sv:role==='sit'?pk(['tea','read','nod']):''}));
    const ENTER=16.8+rg(0,1.4),PT=[3.0,0];PT[1]=Math.min(4.6,ENTER-13.1);const tA=rg(PT[0],Math.max(PT[0],PT[1]));
    const GT={tA,tB:tA+3.8,tC:tA+10.2,tD:tA+12.9,ord:shuf([0,1,2])},DUR=[2.2,1.6,1.5];
    const k0=ENTER+2+rg(0,0.4),kl=ENTER+[0,0,4.8,5.7,6.4][nP]+rg(-0.3,0.3),Ks=[...Array(nP)].map((_,i)=>lerp(k0,kl,i/(nP-1))+(i>0&&i<nP-1?rg(-0.15,0.15):0));
    const HEAD=Math.max(kl+0.6,kl+1.7+rg(-1.5,1.5)),BODY=HEAD+2.2+rg(-0.3,0.3),WALK=BODY+1.6+rg(-0.3,0.3),SMASH=WALK+2.4;
    const MIR=Object.assign({},MIR0,{ENTER,K:Ks,STOP:Math.min(kl+1,HEAD-0.1),HEAD,BODY,WALK,SMASH,CAN:SMASH+0.6,CHOICE:SMASH+0.9});S.mir=MIR;
    const PA=[DX,-7.6],PB=[DX,-6.0],near=(v,from,dd)=>{const q=nrm(from[0]-v[0],from[1]-v[1]);return[v[0]+q[0]*dd,v[1]+q[1]*dd]};
    for(const e of cast){
      if(e.role==='pace'){const p=pace(ENTER);e.V=[p.x,p.z]}
      else if(e.role==='sit')e.V=SEAT[seatK].slice(0,2);
      else if(e.role==='glass'){e.V=QS;e.T=GT;e.A0=A0}
      else{const x=rr()<0.5?fwPlace(1.2):null;if(x!==null){e.sv='gaze';e.V=[x,-6.0];decor.push([x-0.55,x+0.55]);e.pic=x}else{e.sv='sway';e.V=spot(-3.2,3.2,-4.4,-2.9,0.6);e.yaw0=rg(-0.9,0.9)}}
      e.y0=e.role==='sit'?0.55:0.95;e.fd=e.role==='sit'?0.9:1.0}
    const order=shuf(cast.map((_,i)=>i)),Ms=[],Vs=[];let prevM=PB;
    order.forEach((ci,i)=>{const e=cast[ci];e.k=Ks[i];e.M=near(e.V,prevM,i===1?1.3:1.25);prevM=e.M;Ms.push(e.M);Vs.push(e.V)});
    const PICS=[dPlace(0.9),dPlace(0.9)].filter(x=>x!==null).map(x=>[x,1.95]);if(cast.some(e=>e.pic!==undefined))PICS.push([cast.find(e=>e.pic!==undefined).pic,1.95]);
    const clkX=dPlace(0.5)??(DX>0?-0.2:0.2);
    // the lights go out in some order as it works through the room: which one fails, and how far, comes from the seed
    const LO=shuf([1,0.65,0.4,0.5]).map(d=>({t:Ks[rr()*nP|0]+0.1+rr()*0.9,d}));
    // the stool and the can on it: a little off to one side, below your eyes
    const SH=0.92,SX=pk([-1,1])*rg(0.62,0.85),SZ=rg(-1.4,-1.25);
    // ---- one small lit shader for everything: wrap light, two zones (parlor / back room), fresnel rim, world-space patterns ----
    const LU={uLP:{value:[0,1,2,3].map(()=>new THREE.Vector3())},uLC:{value:[0,1,2,3].map(()=>new THREE.Vector3())},uBP:{value:new THREE.Vector3(0.5,2.4,0.6)},uBC:{value:new THREE.Vector3(0.5,0.62,0.9)},
      uAmbP:{value:new THREE.Vector3(0.05,0.03,0.02)},uAmbB:{value:new THREE.Vector3(0.022,0.03,0.05)},uWallZ:{value:-1.9},
      uWain:{value:new THREE.Vector3(...wall[1])},uTrim:{value:new THREE.Vector3(...wall[2])},uWpat:{value:wpat},uWsc:{value:wsc},
      uRug:{value:new THREE.Vector4(clamp(TX+rg(-0.5,0.5),-1.2,1.2),TZ+rg(0,0.5),rg(1.8,2.4),rg(1.15,1.5))},uRugA:{value:new THREE.Vector3(...rugK[0])},uRugB:{value:new THREE.Vector3(...rugK[1])},uRugC:{value:new THREE.Vector3(...rugK[2])},uRugP:{value:rugP}};
    const cache=new Map();
    const lit=(col,p={})=>{
      const key=p.u?null:JSON.stringify([col,p]);if(key&&cache.has(key))return cache.get(key);
      const m=new THREE.ShaderMaterial({uniforms:Object.assign({uCol:{value:CC(col)},uRimC:{value:CC(p.rc||0)},uRim:{value:p.rim||0},uSpec:{value:p.sp||0},uWrap:{value:p.wrap===undefined?0.35:p.wrap},
        uGlow:{value:p.glow||0},uLit:{value:p.lit===undefined?1:p.lit},uPat:{value:p.pat||0},uAlpha:{value:p.al===undefined?1:p.al}},LU),
        vertexShader:LIT_VS,fragmentShader:LIT_FS,side:p.dbl?THREE.DoubleSide:THREE.FrontSide,transparent:p.al!==undefined&&p.al<1,depthWrite:!(p.al!==undefined&&p.al<1)});
      if(p.map){m.uniforms.uMap={value:p.map};m.defines={USE_MAP:''};m.map=p.map}
      if(key)cache.set(key,m);return m;
    };
    const geo={},G=(k,f)=>geo[k]||(geo[k]=f());
    const SPH=()=>G('s',()=>new THREE.SphereGeometry(1,LOW?8:18,LOW?6:12)),BOXG=()=>G('b',()=>new THREE.BoxGeometry(1,1,1)),PLN=()=>G('p',()=>new THREE.PlaneGeometry(1,1));
    const CYL=(rt,rb,h,s)=>G('c'+rt+'_'+rb+'_'+h+'_'+(s||0),()=>new THREE.CylinderGeometry(rt,rb,h,s||(LOW?6:10),1));
    const add=(par,g,m,x,y,z,sx,sy,sz)=>{const e=new THREE.Mesh(g,m);e.position.set(x||0,y||0,z||0);if(sx!==undefined)e.scale.set(sx,sy===undefined?sx:sy,sz===undefined?sx:sz);par.add(e);return e};
    const ball=(par,m,x,y,z,sx,sy,sz)=>add(par,SPH(),m,x,y,z,sx,sy,sz),box=(par,m,x,y,z,w,h,d)=>add(par,BOXG(),m,x,y,z,w,h,d),cyl=(par,m,x,y,z,rt,rb,h,s)=>add(par,CYL(rt,rb,h,s),m,x,y,z);
    const grp=(par,x,y,z)=>{const g=new THREE.Group();g.position.set(x||0,y||0,z||0);par.add(g);return g};
    const plane=(par,m,x,y,z,w,h,rx,ry)=>{const e=add(par,PLN(),m,x,y,z,w,h,1);e.rotation.set(rx||0,ry||0,0);return e};
    // two-segment limb hanging from a pivot: u = upper (pivot), f = lower (at the joint)
    const limb=(par,x,y,z,L1,L2,r0,r1,r2,mU,mL,mE,rE)=>{
      const u=grp(par,x,y,z);cyl(u,mU,0,-L1/2,0,r0,r1,L1);ball(u,mU,0,-L1,0,r1*1.05);
      const f=grp(u,0,-L1,0);cyl(f,mL,0,-L2/2,0,r1,r2,L2);if(mE)ball(f,mE,0,-L2,0,rE||r2*1.2);return{u,f};
    };
    // ---- the two rooms ----
    const WZ=-1.9,PW=1.55,PY0=0.36,PY1=2.55,SILL=PY0+0.025;   // glass wall plane, half width of the pane, bottom and top of the pane; the sill is a knee wall you can only jump (apex of a jump is 0.56 m)
    const plas=lit(0x59595c,{pat:1,rim:0.25,rc:[0.1,0.14,0.22],wrap:0.5}),flo=lit(0x454750,{pat:2,rim:0.2,rc:[0.1,0.14,0.22],wrap:0.5,sp:0.05}),ceil=lit(0x3a3b40,{pat:1,wrap:0.5});
    const BX=2.3,BZ=2.8,BH=3.4;
    plane(group,flo,0,0,(BZ+WZ)/2,BX*2,BZ-WZ,-Math.PI/2);plane(group,ceil,0,BH,(BZ+WZ)/2,BX*2,BZ-WZ,Math.PI/2);
    plane(group,plas,-BX,BH/2,(BZ+WZ)/2,BZ-WZ,BH,0,Math.PI/2);plane(group,plas,BX,BH/2,(BZ+WZ)/2,BZ-WZ,BH,0,-Math.PI/2);plane(group,plas,0,BH/2,BZ,BX*2,BH,0,Math.PI);
    // front wall with the opening
    box(group,plas,-(BX+PW)/2,BH/2,WZ-0.15,BX-PW,BH,0.3);box(group,plas,(BX+PW)/2,BH/2,WZ-0.15,BX-PW,BH,0.3);
    box(group,plas,0,(PY1+BH)/2,WZ-0.15,PW*2,BH-PY1,0.3);box(group,plas,0,PY0/2,WZ-0.15,PW*2,PY0,0.3);
    // gilt lining of the opening (the finished side shows at its edges)
    const gilt=lit(0x7a5a1c,{pat:7,rim:0.6,rc:[0.9,0.6,0.2],sp:0.5,wrap:0.1});
    box(group,gilt,-PW,(PY0+PY1)/2,WZ-0.15,0.05,PY1-PY0,0.3);box(group,gilt,PW,(PY0+PY1)/2,WZ-0.15,0.05,PY1-PY0,0.3);box(group,gilt,0,PY1,WZ-0.15,PW*2+0.05,0.05,0.3);box(group,gilt,0,PY0,WZ-0.15,PW*2+0.05,0.05,0.3);
    // the unfinished back of the frame: bare boards, braces, nails
    const wood=lit(0x6e5030,{pat:5,rim:0.5,rc:[0.2,0.28,0.45],wrap:0.4}),woodV=lit(0x6a4c2e,{pat:6,rim:0.5,rc:[0.2,0.28,0.45],wrap:0.4}),iron=lit(0x1c1c20,{rim:0.9,rc:[0.5,0.6,0.9],sp:0.6});
    const FZ=WZ+0.15;
    box(group,wood,0.04,PY1+0.07,FZ,PW*2+0.36,0.14,0.1);box(group,wood,-0.06,PY0-0.07,FZ,PW*2+0.28,0.14,0.1);
    box(group,woodV,-PW-0.07,1.5,FZ+0.03,0.14,PY1-PY0+0.4,0.1);box(group,woodV,PW+0.08,1.45,FZ+0.03,0.14,PY1-PY0+0.3,0.1);
    for(const q of [[-1,0.55,-0.62],[1,2.35,0.7]]){const e=box(group,wood,q[0]*(PW+0.55),q[1]+0.55,FZ+0.09,0.12,1.7,0.07);e.rotation.z=q[2]}
    for(const q of [[-1,1],[1,1],[-1,-1],[1,-1]])box(group,woodV,q[0]*(PW+0.0),q[1]>0?PY1-0.1:PY0+0.1,FZ+0.07,0.2,0.2,0.08);
    for(let i=0;i<(LOW?14:34);i++){const side=i%4,u=rnd(),x=side<2?(side?PW+0.07:-PW-0.07):-PW+u*PW*2,y=side<2?PY0+u*(PY1-PY0):(side===2?PY1+0.07:PY0-0.07);ball(group,iron,x+(rnd()-0.5)*0.03,y+(rnd()-0.5)*0.03,FZ+0.055,0.013,0.013,0.008)}
    // a crate or two, a barrel, a leaning board
    const crate=lit(0x5c4529,{pat:5,rim:0.5,rc:[0.2,0.28,0.45],wrap:0.4});
    box(group,crate,-1.7,0.3,-0.9,0.6,0.6,0.6).rotation.y=0.2;box(group,crate,-1.62,0.8,-0.95,0.5,0.4,0.5).rotation.y=-0.3;box(group,crate,1.75,0.25,1.9,0.55,0.5,0.55).rotation.y=0.5;
    cyl(group,lit(0x3b3228,{rim:0.6,rc:[0.2,0.28,0.45],wrap:0.4}),1.75,0.45,-1.0,0.26,0.26,0.9,12);for(const y of [0.2,0.7])cyl(group,iron,1.75,y,-1.0,0.275,0.275,0.04,12);
    {const e=box(group,wood,-2.1,1.0,1.4,0.16,1.9,0.03);e.rotation.z=0.12}
    // the exit behind you
    const dm=lit(0x4d3b27,{pat:6,rim:0.5,rc:[0.3,0.35,0.5],wrap:0.4});
    box(group,dm,-0.4,1.05,BZ-0.05,1.0,2.1,0.08);box(group,woodV,-0.4-0.58,1.1,BZ-0.06,0.14,2.3,0.12);box(group,woodV,-0.4+0.58,1.1,BZ-0.06,0.14,2.3,0.12);box(group,woodV,-0.4,2.2,BZ-0.06,1.3,0.14,0.12);
    ball(group,iron,-0.4+0.36,1.0,BZ-0.13,0.035,0.035,0.035);box(group,lit([1.9,1.0,0.35],{lit:0,glow:1}),-0.4,0.012,BZ-0.1,0.96,0.02,0.02);
    S.exitGlow=glow(0xff9a40,1.4,0.25);S.exitGlow.position.set(-0.4,0.12,BZ-0.3);group.add(S.exitGlow);
    // the cold bulb, the only light on your side
    cyl(group,iron,0.5,2.7,0.6,0.006,0.006,0.4);S.bulb=ball(group,lit([1.8,2.3,3.4],{lit:0,glow:1,u:1}),0.5,2.48,0.6,0.05,0.07,0.05);
    S.bulbG=glow(0x7fa8ff,1.1,0.3);S.bulbG.position.set(0.5,2.48,0.6);group.add(S.bulbG);
    // warm light spilling through the glass onto your floor
    {const sp=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({uniforms:{uK:{value:1}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform float uK;varying vec2 vU;void main(){float f=pow(1.0-vU.y,1.6)*smoothstep(0.0,0.2,vU.x)*smoothstep(1.0,0.8,vU.x);gl_FragColor=vec4(vec3(1.0,0.6,0.3)*f*0.16*uK,1.0);}'}));
      sp.rotation.x=-Math.PI/2;sp.rotation.z=0;sp.scale.set(PW*2.4,2.6,1);sp.position.set(0,0.012,WZ+1.5);group.add(sp);S.spill=sp}
    // dust in the cold light
    {const n=LOW?40:110,pos=new Float32Array(n*3);S.dustSeed=[];for(let i=0;i<n;i++){S.dustSeed.push([rnd()*TAU,rnd()*TAU,0.1+rnd()*0.25]);pos[i*3]=(rnd()-0.5)*4;pos[i*3+1]=0.3+rnd()*2.4;pos[i*3+2]=-1.6+rnd()*4}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));S.dust=new THREE.Points(g,new THREE.PointsMaterial({size:0.035,map:glowTex,color:0x9db8ff,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));S.dust.frustumCulled=false;group.add(S.dust)}
    // ---- the parlor ----
    const paper=lit(wall[0],{pat:3,rim:0.15,rc:[0.5,0.3,0.15],wrap:0.5}),pfl=lit(floorC,{pat:4,rim:0.2,rc:[0.5,0.3,0.15],wrap:0.5,sp:0.25}),pce=lit(0x6e6252,{wrap:0.5});
    plane(group,pfl,0,0,(WZ+PZ)/2-0.15,PX*2,PZ-WZ,-Math.PI/2);plane(group,pce,0,PH,(WZ+PZ)/2-0.15,PX*2,PZ-WZ,Math.PI/2);
    plane(group,paper,-PX,PH/2,(WZ+PZ)/2-0.15,WZ-PZ,PH,0,Math.PI/2);plane(group,paper,PX,PH/2,(WZ+PZ)/2-0.15,WZ-PZ,PH,0,-Math.PI/2);
        box(group,paper,(-PX+DX-0.55)/2,PH/2,PZ-0.1,DX-0.55+PX,PH,0.2);box(group,paper,(PX+DX+0.55)/2,PH/2,PZ-0.1,PX-DX-0.55,PH,0.2);box(group,paper,DX,(2.3+PH)/2,PZ-0.1,1.1,PH-2.3,0.2);
    box(group,lit(0x000000,{lit:0}),DX,1.2,PZ-0.9,1.1,2.4,1.2);
    for(const s of[-1,1])box(group,gilt,DX+s*0.58,1.18,PZ+0.0,0.08,2.36,0.1);box(group,gilt,DX,2.34,PZ,1.24,0.08,0.1);
    S.door=grp(group,DX-0.55,0,PZ+0.02);box(S.door,lit(0x3a1f12,{pat:6,rim:0.4,rc:[0.5,0.3,0.15],sp:0.3}),0.55,1.15,0,1.1,2.3,0.07);ball(S.door,gilt,0.95,1.1,0.06,0.03,0.03,0.03);
    // the parlor face of the mirror wall: wallpaper around the frame, and the frame's gilt moulding, for when you walk through
    {const z=WZ-0.325;box(group,paper,(-PX-PW)/2,PH/2,z,PX-PW,PH,0.05);box(group,paper,(PX+PW)/2,PH/2,z,PX-PW,PH,0.05);box(group,paper,0,(PY1+PH)/2,z,PW*2,PH-PY1,0.05);box(group,paper,0,PY0/2,z,PW*2,PY0,0.05);
      for(const s of[-1,1])box(group,gilt,s*(PW+0.05),(PY0+PY1)/2,z-0.02,0.1,PY1-PY0+0.2,0.06);box(group,gilt,0,PY1+0.05,z-0.02,PW*2+0.2,0.1,0.06);box(group,gilt,0,PY0-0.05,z-0.02,PW*2+0.2,0.1,0.06)}
    // furniture
    const cloth=lit(0xa99d86,{pat:8,rim:0.4,rc:[0.5,0.35,0.2],wrap:0.6}),dwood=lit(0x3a2112,{pat:5,rim:0.5,rc:[0.6,0.35,0.15],sp:0.35,wrap:0.3}),china=lit(0xb8b2a2,{rim:0.4,rc:[0.5,0.4,0.3],sp:0.6});
        cyl(group,dwood,TX,0.37,TZ,0.07,0.13,0.74);cyl(group,dwood,TX,0.76,TZ,0.62,0.62,0.04,20);cyl(group,cloth,TX,0.6,TZ,0.6,0.72,0.34,20);cyl(group,cloth,TX,0.775,TZ,0.6,0.6,0.012,20);
    S.cup=cyl(group,china,TX+0.1,0.82,TZ-0.05,0.07,0.05,0.07);S.cup0=S.cup.position.clone();ball(group,china,TX-0.25,0.84,TZ+0.1,0.09,0.08,0.09);cyl(group,china,TX+0.3,0.805,TZ+0.18,0.04,0.03,0.04);cyl(group,china,TX-0.1,0.805,TZ-0.3,0.04,0.03,0.04);
    const chair=(x,z,yaw)=>{const c=grp(group,x,0,z);c.rotation.y=yaw;box(c,dwood,0,0.45,0,0.44,0.05,0.44);box(c,dwood,0,0.78,-0.21,0.44,0.62,0.04);
      for(const a of[-1,1])for(const b of[-1,1])cyl(c,dwood,a*0.19,0.22,b*0.19,0.02,0.018,0.44);box(c,lit(0x3a1a2a,{rim:0.4,rc:[0.5,0.3,0.2],wrap:0.5}),0,0.485,0,0.38,0.03,0.38);return c};
    S.chairA=chair(...SEAT[seatK]);S.chairB=chair(...SEAT[seat2]);
    // Soft floor contacts keep furniture grounded, including when the chair is knocked aside.
    const shadowMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec2 vUv;void main(){float r=length(vUv*2.0-1.0);gl_FragColor=vec4(0.0,0.0,0.0,0.56*(1.0-smoothstep(0.15,1.0,r)));}'});
    const contact=(x,z,w,d)=>plane(group,shadowMat,x,0.004,z,w,d,-Math.PI/2);
    contact(TX,TZ,1.85,1.55);contact(sbX,-6.47,1.95,0.75);contact(sofX,-6.38,1.75,0.95);
    contact(LA[0],LA[1],0.7,0.7);contact(LB[0],LB[1],0.7,0.7);contact(SX,SZ,0.62,0.62);
    const chairShadow=contact(S.chairA.position.x,S.chairA.position.z,0.85,0.85);
    contact(S.chairB.position.x,S.chairB.position.z,0.85,0.85);
    box(group,dwood,sbX,0.45,-6.45,1.5,0.9,0.5);box(group,gilt,sbX,0.92,-6.45,1.56,0.04,0.54);
    {const sf=lit(pk([0x203826,0x2a2a4a,0x4a2a20,0x4a3a1a,0x3a2036]),{rim:0.4,rc:[0.5,0.4,0.2],wrap:0.4});box(group,sf,sofX,0.3,-6.4,1.3,0.6,0.55);box(group,sf,sofX,0.72,-6.62,1.3,0.45,0.14)}
    const lamp=(x,z,i)=>{const L={};cyl(group,dwood,x,0.04,z,0.2,0.22,0.08);cyl(group,dwood,x,0.85,z,0.025,0.025,1.6);
      L.shade=cyl(group,lit([2.3,1.35,0.55],{lit:0,glow:1,u:1,dbl:1}),x,1.75,z,0.12,0.25,0.34,12);L.g=glow(0xffa550,2.2,0.5);L.g.position.set(x,1.75,z);group.add(L.g);return L};
    S.lampA=lamp(LA[0],LA[1]);S.lampB=lamp(LB[0],LB[1]);
    // a chandelier over the table, and the candles on the sideboard
    cyl(group,iron,TX,3.3,TZ,0.01,0.01,0.8);cyl(group,gilt,TX,2.9,TZ,0.28,0.28,0.04,14);S.chFl=[];
    for(let i=0;i<6;i++){const a=i/6*TAU;cyl(group,china,TX+Math.cos(a)*0.28,2.97,TZ+Math.sin(a)*0.28,0.015,0.015,0.1);S.chFl.push(ball(group,lit([3,1.9,0.7],{lit:0,glow:1,u:1}),TX+Math.cos(a)*0.28,3.06,TZ+Math.sin(a)*0.28,0.015,0.03,0.015))}
    S.chG=glow(0xffb060,1.1,0.3);S.chG.position.set(TX,3.05,TZ);group.add(S.chG);
    S.candle=ball(group,lit([3,1.9,0.7],{lit:0,glow:1,u:1}),sbX,1.07,-6.45,0.02,0.04,0.02);S.candleG=glow(0xffb060,0.9,0.5);S.candleG.position.set(sbX,1.1,-6.45);group.add(S.candleG);
    // pictures and a clock
    for(const q of PICS){const c=lit([0.06+rr()*0.1,0.1+rr()*0.08,0.1+rr()*0.1],{rim:0.3,rc:[0.4,0.3,0.2]});box(group,gilt,q[0],q[1],PZ+0.03,0.86,0.66,0.05);box(group,c,q[0],q[1],PZ+0.065,0.72,0.52,0.02)}
    cyl(group,gilt,clkX,2.5,PZ+0.04,0.24,0.24,0.04,16).rotation.x=Math.PI/2;cyl(group,china,clkX,2.5,PZ+0.065,0.2,0.2,0.02,16).rotation.x=Math.PI/2;
    // ---- people ----
    const person=c=>{
      const h=c.h||1,R=new THREE.Group(),P={R,h,ph:c.seed||0},rcp=[0.55,0.38,0.22];
      const sk=lit(c.skin,{rim:0.9,rc:rcp,wrap:0.55,sp:0.08}),hr=lit(c.hair,{rim:1.0,rc:rcp,sp:0.3}),tp=lit(c.top,{rim:0.7,rc:rcp}),bt=lit(c.bot,{rim:0.6,rc:rcp}),sh=lit(0x120c0a,{rim:0.6,rc:rcp,sp:0.5}),dk=lit(0x0c0605),pu=lit(0x6a2a2a),cl=lit(c.collar||0xe8e0d0,{rim:0.6,rc:rcp,wrap:0.6});
      const hips=P.hips=grp(R,0,0.92*h,0),tor=P.torso=grp(hips,0,0.02,0);
      ball(hips,bt,0,0.05,0,0.17,0.12,0.12);ball(tor,tp,0,0.21,0,0.185,0.27,0.12);ball(tor,tp,0,0.05,0,0.155,0.14,0.105);ball(tor,tp,0,0.4,0,0.21,0.075,0.11);
      if(c.vest)ball(tor,lit(c.vest,{rim:0.6,rc:rcp}),0,0.2,0.035,0.17,0.25,0.1);
      cyl(tor,sk,0,0.5,0,0.045,0.05,0.1);cyl(tor,cl,0,0.46,0,0.07,0.085,0.045);if(c.tie)ball(tor,lit(c.tie,{rim:0.5,rc:rcp}),0,0.3,0.12,0.02,0.1,0.01);
      const hd=P.head=grp(tor,0,0.52,0);
      ball(hd,sk,0,0.1,0.005,0.092,0.115,0.1);ball(hd,sk,0,0.045,0.03,0.07,0.06,0.07);ball(hd,hr,0,0.128,-0.015,0.1,0.116,0.108);
      if(c.bun)ball(hd,hr,0,0.2,-0.09,0.055,0.05,0.055);if(c.beard)ball(hd,hr,0,0.03,0.045,0.062,0.05,0.04);
      ball(hd,sk,0,0.085,0.108,0.014,0.02,0.02);for(const s of[-1,1]){ball(hd,dk,s*0.036,0.108,0.092,0.014,0.012,0.01);ball(hd,sk,s*0.093,0.1,0,0.012,0.022,0.016);ball(hd,hr,s*0.037,0.13,0.095,0.02,0.005,0.01)}
      P.mouth=ball(hd,pu,0,0.052,0.097,0.026,0.01,0.01);
      P.ua=[];P.fa=[];P.ul=[];P.fl=[];
      for(const s of[1,-1]){const a=limb(tor,s*0.205,0.42,0,0.27,0.25,0.05,0.042,0.036,tp,c.bare?sk:tp,sk,0.04);P.ua.push(a.u);P.fa.push(a.f)}
      for(const s of[1,-1]){const l=limb(hips,s*0.09,0,0,0.46,0.46,0.078,0.062,0.045,bt,c.dress?sk:bt,sh,0.05);ball(l.f,sh,0,-0.455,0.05,0.047,0.04,0.1);P.ul.push(l.u);P.fl.push(l.f)}
      if(c.dress)P.skirt=cyl(hips,bt,0,-0.38,0,0.14,0.34,0.8,LOW?8:14);
      P.book=box(tor,lit(0x5a2a1a,{rim:0.4,rc:rcp}),0,0.17,0.2,0.2,0.03,0.27);P.book.rotation.x=-0.55;P.book.visible=false;
      return P;
    };
    const posePerson=(P,q)=>{
      const s=q.sit||0,br=Math.sin(S.t*1.7+P.ph)*0.004,w=Math.sin(q.w||0),wa=q.wa||0;
      P.hips.position.y=lerp(0.92,0.53,s)*P.h+br;P.torso.rotation.set((q.lean||0)+br*3,q.ty||0,0);P.head.rotation.set(q.hp||0,q.hy||0,q.hr||0);P.mouth.scale.y=0.01+(q.mo||0)*0.03;
      if(P.skirt)P.skirt.scale.y=lerp(1,0.55,s);
      for(let i=0;i<2;i++){const sg=i?-1:1,A=(i?q.aR:q.aL)||[0.06-sg*w*wa*0.45,0.08,0.2+Math.abs(w)*wa*0.25];
        P.ua[i].rotation.set(-A[0],0,sg*A[1]);P.fa[i].rotation.x=-A[2];
        P.ul[i].rotation.set(-sg*w*wa*0.5-s*1.5,0,sg*((q.sp||0)+s*0.08));P.fl[i].rotation.x=s*1.5+Math.max(0,-sg*w)*0.7*wa+(q.kb||0)}
    };
    for(const e of cast){e.p=person(e.c);group.add(e.p.R);e.contact=contact(e.V[0],e.V[1],0.74,0.66)}
    // each role is one small routine, a function of the clock: it says where the person is and how they hold themselves
    const ENT=MIR.ENTER+0.35,CM=[99,99],SY=SEAT[seatK][2];
    const ROLE={
      pace:e=>t=>{const pz=pace(Math.min(t,MIR.ENTER)),sw=ss(ENT,MIR.ENTER+1.0,t),gl=ss(PS.tg,PS.tg+0.6,t)*(1-ss(PS.tg+1.3,PS.tg+1.9,t)),yw0=pz.yaw,yw=t<ENT?yw0:lerp(yw0,ang(CM[0]-e.V[0],CM[1]-e.V[1]),sw);
        const q={w:pz.w*(t<MIR.ENTER?1:0),wa:t<MIR.ENTER?pz.wa:0,lean:0.04,hy:lerp(Math.sin(t*0.5)*0.08,clamp(wrap(ang(0-pz.x,0.1-pz.z)-yw0),-1.2,1.2),gl)*(1-sw),hp:0.02};
        if(t>=ENT)Object.assign(q,startle,{wa:0});return{x:pz.x,z:pz.z,yw,q}},
      sit:e=>t=>{const V=e.V,sw=ss(ENT,MIR.ENTER+1.2,t),sip=Math.max(0,Math.sin(t*0.45))**6,rel=clamp(wrap(ang(CM[0]-V[0],CM[1]-V[1])-SY),-1.3,1.3);
        const q={sit:1,lean:0.04+0.03*Math.sin(t*0.3),hy:lerp(Math.sin(t*0.37)*0.25,rel,sw),hp:0.05+0.05*Math.sin(t*0.9),mo:Math.max(0,Math.sin(t*5.3))>0.6&&t<MIR.ENTER?0.5:0,aL:[1.05,0.12,1.0-sip*0.2],aR:[1.0+sip*0.6,0.1,1.0+sip*1.1]};
        if(e.sv==='read'){q.hp=0.42+0.05*Math.sin(t*0.7);q.hy=lerp(Math.sin(t*0.3)*0.06,rel,sw);q.mo=0;q.aL=[0.95,0.2,1.55];q.aR=[0.95+0.3*Math.max(0,Math.sin(t*0.5))**8,0.2,1.55]}
        else if(e.sv==='nod'){q.hp=0.34+0.2*Math.sin(t*0.6);q.lean=0.16+0.05*Math.sin(t*0.5);q.mo=0;q.aL=[0.5,0.2,0.4];q.aR=[0.5,0.2,0.4]}
        e.p.book.visible=e.sv==='read'&&t<ENT+0.3;
        if(t>=ENT){q.aL=[0.9,0.3,2.0];q.aR=[0.9,0.3,2.0];q.lean=-0.1;q.hp=lerp(q.hp,-0.05,sw)}
        return{x:V[0],z:V[1],yw:SY,q}},
      glass:e=>t=>{const T=e.T,A0=e.A0,Q=e.V,wk=(a,b,t0,t1)=>{const k=ss(t0,t1,t);return[lerp(a[0],b[0],k),lerp(a[1],b[1],k)]};let p,yw,q;
        if(t<T.tA){p=A0;yw=A0[0]<0?-Math.PI/2:Math.PI/2;q={w:0,wa:0,lean:0.03,hy:Math.sin(t*0.4)*0.3,aL:[1.0,0.2,1.8],aR:[0.15,0.1,0.2]}}
        else if(t<T.tB){p=wk(A0,GL,T.tA,T.tB);yw=lerp(ang(GL[0]-A0[0],GL[1]-A0[1]),0,ss(T.tB-1.4,T.tB-0.3,t));q={w:t*5.4,wa:ss(T.tA,T.tA+0.5,t)*(1-ss(T.tB-0.4,T.tB,t)),lean:0.03,hy:0}}
        else if(t<T.tC){p=GL;yw=0;const u=t-T.tB,a=[0,0,0];let s0=0.7;for(const j of T.ord){a[j]=ss(s0,s0+0.45,u)*(1-ss(s0+DUR[j]-0.4,s0+DUR[j],u));s0+=DUR[j]}
          // collar, teeth and hair, in the order this woman happens to do them
          const [c1,c2,c3]=a;
          q={lean:0.12*ss(0.2,1.2,u)+0.1*c2,hy:Math.sin(u*0.9)*0.05+0.35*c2*Math.sin(u*2)*0.4,hp:-0.1*c2+0.05*c3,hr:0.12*c2,mo:c2,
            aL:[lerp(0.1,0.65,c1)+c3*1.9,lerp(0.12,0.28,c1)+0.2*c3,lerp(0.2,2.3+Math.sin(u*7)*0.12*c1,c1)+c3*0.2],aR:[lerp(0.1,0.7,c1)+c2*0.1,0.2,lerp(0.2,2.2,c1)]};
          if(c2>0.1)q.aL=[0.3,0.2,0.3];if(c3>0.1)q.aL=[1.9+Math.sin(u*5)*0.1,0.3,0.9]}
        else if(t<T.tD){p=wk(GL,Q,T.tC,T.tD);yw=lerp(0,ang(Q[0]-GL[0],Q[1]-GL[1]),ss(T.tC,T.tC+0.7,t));q={w:t*5.4,wa:ss(T.tC+0.2,T.tC+0.7,t)*(1-ss(T.tD-0.5,T.tD,t)),lean:0.03}}
        else{p=Q;yw=lerp(ang(Q[0]-GL[0],Q[1]-GL[1]),ang(CM[0]-Q[0],CM[1]-Q[1]),ss(ENT,MIR.ENTER+1.1,t));
          q={lean:0.03,hy:Math.sin(t*0.5)*0.2,aL:[0.9,0.3,1.4+Math.sin(t*0.6)*0.2],aR:[0.1,0.1,0.2]};if(t>=ENT){q.aL=startle.aL;q.aR=startle.aR}}
        return{x:p[0],z:p[1],yw,q}},
      stand:e=>t=>{const V=e.V,sw=ss(ENT,MIR.ENTER+1.1,t),gz=e.sv==='gaze',y0=gz?Math.PI:e.yaw0,yw=lerp(y0,y0+wrap(ang(CM[0]-V[0],CM[1]-V[1])-y0),sw);
        const q=gz?{lean:0.03,hp:-0.12+0.04*Math.sin(t*0.5),hy:Math.sin(t*0.3)*0.15*(1-sw),aL:[-0.35,0.05,0.9],aR:[-0.35,0.05,0.9]}:{lean:0.03+0.02*Math.sin(t*0.6),hp:0.02,hy:Math.sin(t*0.45)*0.5*(1-sw),aL:[0.5,0.15,1.7],aR:[0.4,0.15,1.6]};
        q.ty=Math.sin(t*0.5)*0.05;if(t>=ENT)Object.assign(q,startle,{hy:0,ty:0});return{x:V[0],z:V[1],yw,q}}};
    for(const e of cast)e.f=ROLE[e.role](e);
    const drawCast=(e,t)=>{
      const P=e.p,sit=e.role==='sit';
      if(t>=e.k){const f=fling(P,t,e.k,e.V,e.M,e.y0,e.fd);posePerson(P,Object.assign(flop(P,t,e.k,f.k),{t,sit:sit?1-f.k:0}));
        if(sit)S.chairA.position.set(e.V[0]-f.k*0.5,0.22*Math.sin(f.k*Math.PI)*0.3,e.V[1]-f.k*0.5),S.chairA.rotation.set(-1.45*f.k,SY,0.2*f.k);return}
      if(sit){S.chairA.position.set(e.V[0],0,e.V[1]);S.chairA.rotation.set(0,SY,0)}
      const o=e.f(t);P.R.position.set(o.x,0,o.z);P.R.rotation.set(0,o.yw,0);o.q.t=t;posePerson(P,o.q);
    };
    S.cast=cast.map(e=>({role:e.role,sv:e.sv,x:+e.V[0].toFixed(2),z:+e.V[1].toFixed(2),skin:e.c.skin,hair:e.c.hair,top:e.c.top,h:+e.c.h.toFixed(3),k:+e.k.toFixed(2)}));
    S.layout={DX,TX:+TX.toFixed(2),TZ:+TZ.toFixed(2),seat:seatK,sbX:+sbX.toFixed(2),sofX:+sofX.toFixed(2),wall:wall[0],rug:rugK[0].join(),floor:floorC,wpat,rugP,stool:[+SX.toFixed(2),+SZ.toFixed(2)],pics:PICS.length};
    // ---- the thing ----
    const mon=(()=>{
      const R=new THREE.Group(),M={R},rc=[0.25,0.4,0.8],sk=lit(0x6c6762,{rim:0.9,rc,wrap:0.3,sp:0.12}),dk=lit(0x1b1a18,{rim:1.2,rc}),mo=lit(0x5a0709,{glow:0.5,rim:0.4,rc:[0.8,0.2,0.1]}),th=lit(0xe9dcbc,{rim:0.6,rc:[0.5,0.5,0.5],sp:0.3});
      M.eye=lit([4,3.2,1.2],{lit:0,glow:1,u:1});
      const hips=M.hips=grp(R,0,1.5,0),tor=M.torso=grp(hips,0,0,0);
      ball(hips,sk,0,0,0,0.21,0.17,0.15);ball(tor,sk,0,0.38,0,0.2,0.42,0.16);ball(tor,sk,0,0.88,0,0.36,0.42,0.25);ball(tor,sk,0,1.12,-0.1,0.34,0.2,0.2);
      for(let i=0;i<5;i++){const e=cyl(tor,dk,0,0.25+i*0.22,-0.16-(i>1&&i<4?0.08:0),0,0.045,0.26-Math.abs(i-2)*0.03);e.rotation.x=-1.0}
      const nk=M.neck=grp(tor,0,1.12,0.06);nk.rotation.x=0.7;cyl(nk,sk,0,0.2,0,0.07,0.095,0.42);
      const hd=M.head=grp(nk,0,0.44,0);hd.rotation.x=-0.45;
      ball(hd,sk,0,0.08,0.13,0.18,0.22,0.3);ball(hd,dk,0,0.2,0.3,0.17,0.04,0.1);
      for(const s of[-1,1]){ball(hd,dk,s*0.11,0.14,0.34,0.075,0.07,0.06);ball(hd,M.eye,s*0.11,0.145,0.385,0.05,0.04,0.025);const g=glow(0xffd070,0.7,0.5);g.position.set(s*0.11,0.145,0.42);hd.add(g);(M.glows=M.glows||[]).push(g)}
      for(let i=0;i<5;i++){const e=cyl(hd,dk,(i-2)*0.06,0.3,-0.02-Math.abs(i-2)*0.03,0,0.025,0.2+(i===2?0.1:0));e.rotation.x=-0.5-Math.abs(i-2)*0.15;e.rotation.z=(i-2)*0.2}
      ball(hd,mo,0,-0.02,0.2,0.12,0.06,0.2);
      for(let i=0;i<7;i++){const x=(i-3)*0.032;cyl(hd,th,x,-0.045,0.34-Math.abs(i-3)*0.03,0.0,0.014,0.07).rotation.x=Math.PI}
      const jw=M.jaw=grp(hd,0,-0.04,0.06);ball(jw,sk,0,-0.04,0.17,0.12,0.06,0.2);ball(jw,mo,0,0.0,0.17,0.09,0.03,0.15);
      for(let i=0;i<7;i++){const x=(i-3)*0.03;cyl(jw,th,x,0.025,0.3-Math.abs(i-3)*0.035,0.0,0.014,0.07)}
      M.ua=[];M.fa=[];M.ul=[];M.fl=[];
      for(const s of[1,-1]){const a=limb(tor,s*0.4,1.08,0,0.95,1.0,0.075,0.06,0.045,sk,sk,sk,0.06);M.ua.push(a.u);M.fa.push(a.f);
        const e=cyl(a.u,dk,0,-0.95,-0.06,0,0.03,0.18);e.rotation.x=-1.2;
        for(let k=0;k<4;k++){const f=cyl(a.f,dk,(k-1.5)*0.032,-1.13,0.01,0.004,0.015,0.3);f.rotation.x=0.18}}
      for(const s of[1,-1]){const l=limb(hips,s*0.14,0,0,0.78,0.78,0.1,0.07,0.05,sk,sk,sk,0.055);ball(l.f,dk,0,-0.76,0.1,0.06,0.04,0.22);M.ul.push(l.u);M.fl.push(l.f)}
      group.add(R);return M;
    })();
    mon.R.visible=false;
    const poseMon=q=>{
      const w=Math.sin(q.w||0),wa=q.wa||0,sag=q.sag||0;
      mon.R.position.set(q.x,0,q.z);mon.R.rotation.y=q.yaw;mon.hips.position.y=1.5-0.07*Math.abs(w)*wa-sag*0.12;mon.torso.rotation.set((q.lean===undefined?0.45:q.lean)+Math.sin(S.t*1.3)*0.02+sag*0.25,q.ty||0,0);
      mon.neck.rotation.x=0.7+sag*0.5;mon.head.rotation.set(-0.45+(q.hp||0)-sag*0.3,q.hy||0,Math.sin(S.t*0.7)*0.03);mon.jaw.rotation.x=q.jaw||0;
      for(let i=0;i<2;i++){const sg=i?-1:1,A=(i?q.aR:q.aL)||[0.05-sg*w*wa*0.4,0.12+sag*0.04,0.15+Math.abs(w)*wa*0.2];
        mon.ua[i].rotation.set(-A[0],0,sg*A[1]);mon.fa[i].rotation.x=-A[2];
        mon.ul[i].rotation.set(-sg*w*wa*0.5-0.3,0,sg*0.04);mon.fl[i].rotation.x=0.55+Math.max(0,-sg*w)*0.6*wa}
      const e=q.e===undefined?0.2:q.e;mon.eye.uniforms.uCol.value.setRGB(1.45*e,0.85*e,0.25*e);for(const g of mon.glows){g.material.opacity=0.28*Math.min(1,e);g.scale.setScalar(0.18+0.14*Math.min(e,1.5))}
    };
    // ---- the glass ----
    const HP=[[0.1,0.3],[-0.55,0.55],[0.65,0.25],[-0.2,-0.2],[0.4,0.65],[-0.8,0.1],[0.9,0.5],[0.0,0.8],[-0.45,0.85],[0.75,-0.1]];
    const hits=[...Array(10)].map((_,i)=>new THREE.Vector4(HP[i][0],HP[i][1]+0.1,0,rnd()));S.hitT=[];
    S.pane=new THREE.Mesh(new THREE.PlaneGeometry(PW*2,PY1-PY0),new THREE.ShaderMaterial({uniforms:{uH:{value:hits},uK:{value:0}},transparent:true,depthWrite:false,vertexShader:'varying vec2 vP;varying vec3 vW;void main(){vP=position.xy;vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',fragmentShader:PANE_FS}));
    S.pane.position.set(0,(PY0+PY1)/2,WZ-0.04);S.pane.renderOrder=5;group.add(S.pane);
    // what you spray at the glass before it breaks: splats, beads and runs, on the pane's near face
    S.drip=new THREE.Mesh(new THREE.PlaneGeometry(PW*2,PY1-PY0),new THREE.ShaderMaterial({uniforms:{uS:{value:[...Array(10)].map(()=>new THREE.Vector4(0,0,-1,0))},uT:{value:0}},transparent:true,depthWrite:false,vertexShader:'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:DRIP_FS}));
    S.drip.position.set(0,(PY0+PY1)/2,WZ-0.034);S.drip.renderOrder=5;group.add(S.drip);
    // shards for the moment it gives
    {const n=LOW?44:96,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-0.5,-0.3,0,0.5,-0.2,0,0.1,0.6,0]),3));
      S.shards=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:new THREE.Color(1.1,1.2,1.35),side:THREE.DoubleSide,transparent:true,opacity:0.85}),n);S.shards.frustumCulled=false;S.shards.visible=false;S.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(S.shards);
      S.sh=[];for(let i=0;i<n;i++){const x=(rnd()-0.5)*PW*2,y=PY0+rnd()*(PY1-PY0);S.sh.push({p:[x,y,WZ-0.04],v:[x*0.9+(rnd()-0.5)*1.5,(rnd()-0.3)*2.5+1,2.5+rnd()*7],r:[rnd()*6,rnd()*6,rnd()*6],w:[(rnd()-0.5)*14,(rnd()-0.5)*14,(rnd()-0.5)*14],s:0.08+rnd()*0.28});S.shards.setColorAt(i,new THREE.Color().setScalar(0.5+rnd()*1.1))}}
    // spray and mist
    {const n=LOW?50:110,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3).fill(999),3));
      S.mist=new THREE.Points(g,new THREE.PointsMaterial({size:0.3,map:glowTex,color:new THREE.Color(3,1.1,0.25),transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}));S.mist.frustumCulled=false;group.add(S.mist);S.pt=[...Array(n)].map(()=>({a:9,l:1,p:[0,0,0],v:[0,0,0]}));S.pi=0}
    S.splash=glow(0xff8a30,1,0);S.splash.position.set(0,1.7,WZ-0.1);S.splash.material.depthTest=false;S.splash.renderOrder=6;group.add(S.splash);
    // the cloud that closes your eyes
    S.veil=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({uniforms:{uK:{value:0},uT:{value:0}},transparent:true,depthTest:false,depthWrite:false,vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform float uK,uT;varying vec2 vU;void main(){vec2 p=vU-0.5;float r=length(p);float b=0.5+0.5*sin(uT*3.0+p.x*7.0+sin(p.y*9.0+uT));vec3 c=vec3(1.7,0.42,0.06)*(0.25+0.9*b*smoothstep(0.75,0.0,r))*(0.6+0.4*smoothstep(0.0,0.5,r));gl_FragColor=vec4(c,clamp(uK,0.0,1.0));}'}));
    S.veil.renderOrder=1000;S.veil.frustumCulled=false;S.veil.visible=false;group.add(S.veil);
    // ---- the can: on a stool in front of you, then in your hand ----
    const label=canvasTex(512,256,(c,w,h)=>{c.fillStyle='#b3200f';c.fillRect(0,0,w,h);const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(255,200,80,.55)');g.addColorStop(0.5,'rgba(255,120,30,0)');g.addColorStop(1,'rgba(0,0,0,.45)');c.fillStyle=g;c.fillRect(0,0,w,h);
      c.fillStyle='#ffe9c0';c.fillRect(w*0.25,0,w*0.5,h);c.fillStyle='#c4200a';c.fillRect(w*0.26,8,w*0.48,h-16);c.fillStyle='#fff3d6';c.textAlign='center';c.textBaseline='middle';c.font='bold 62px Arial Black,Impact,sans-serif';c.fillText('PEPPER',w*0.5,h*0.36);
      c.font='bold 52px Arial Black,Impact,sans-serif';c.fillText('SPRAY',w*0.5,h*0.62);c.font='bold 22px Arial,sans-serif';c.fillText('MAX STRENGTH · STREAM',w*0.5,h*0.84);
      c.fillStyle='#ffb52a';c.beginPath();c.moveTo(w*0.5,h*0.04);c.bezierCurveTo(w*0.56,h*0.14,w*0.52,h*0.2,w*0.5,h*0.22);c.bezierCurveTo(w*0.48,h*0.2,w*0.44,h*0.14,w*0.5,h*0.04);c.fill()});
    const canMat=lit(0xffffff,{map:label,glow:0.85,rim:0.8,rc:[1.0,0.6,0.3],sp:0.4,wrap:0.5}),canQ=lit(0xffffff,{map:label,glow:0,rim:0.25,rc:[0.5,0.45,0.4],sp:0.3,wrap:0.5}),canTop=lit(0x16161a,{rim:1.0,rc:[0.8,0.8,1],sp:0.6});
    const makeCan=m=>{const g=new THREE.Group(),s=grp(g);cyl(s,m||canMat,0,0,0,0.05,0.05,0.26,16);cyl(s,iron,0,0.145,0,0.036,0.05,0.03,16);cyl(s,canTop,0,0.19,0,0.034,0.034,0.06,12);box(s,canTop,0.0,0.225,0.02,0.02,0.02,0.045);cyl(s,lit(0xc01a10,{rim:0.6,rc:[1,0.5,0.3]}),0.03,0.21,-0.0,0.012,0.012,0.04);g.spin=s;return g};
    // a plain wooden stool, a little to one side and below your eyes, so the glass stays clear
    {const st=grp(group,SX,0,SZ);cyl(st,wood,0,SH-0.025,0,0.2,0.2,0.05,14);
      for(let i=0;i<3;i++){const a=i/3*TAU+0.5,l=cyl(st,woodV,Math.cos(a)*0.14,SH/2,Math.sin(a)*0.14,0.017,0.024,SH,8);l.rotation.set(-0.07*Math.sin(a),0,0.07*Math.cos(a))}
      const rg2=new THREE.Mesh(new THREE.TorusGeometry(0.155,0.01,6,18),woodV);rg2.rotation.x=Math.PI/2;rg2.position.y=0.3;st.add(rg2)}
    S.can=makeCan(canQ);S.can.scale.setScalar(0.95);S.can.position.set(SX,SH+0.125,SZ);S.can.spin.rotation.y=Math.atan2(SX,SZ-0.1)+0.2;group.add(S.can);
    S.canC=[SX,SH+0.14,SZ];Object.defineProperty(S,'canAim',{get:()=>{const dx=SX-S.px,dy=S.canC[1]-S.eyeY,dz=SZ-S.pz;return{yaw:Math.atan2(dx,-dz),pitch:Math.asin(dy/Math.hypot(dx,dy,dz))}}});
    S.hand=new THREE.Group();S.hand.visible=false;group.add(S.hand);
    {const skin=lit(0xd2a085,{rim:0.9,rc:[0.8,0.5,0.4],wrap:0.5}),sl=lit(0x2a2f3a,{rim:0.6,rc:[0.4,0.5,0.8]});
      const a=cyl(S.hand,sl,0.34,-0.5,-0.4,0.07,0.06,0.9);a.rotation.set(1.0,0,-0.35);ball(S.hand,skin,0.2,-0.2,-0.58,0.075,0.07,0.1);
      S.handCan=makeCan();S.handCan.position.set(0.2,-0.2,-0.58);S.hand.add(S.handCan);for(let i=0;i<3;i++)ball(S.hand,skin,0.14+i*0.04,-0.16,-0.52-i*0.02,0.02,0.02,0.035)}
    S.hand.userData.cam=true;
    // lights
    const WARM=[1.0,0.62,0.32];
    LU.uLP.value[0].set(LA[0],1.75,LA[1]);LU.uLP.value[1].set(LB[0],1.75,LB[1]);LU.uLP.value[2].set(TX,2.6,TZ);LU.uLP.value[3].set(sbX,1.4,-6.3);
    const LI=[1.05,1.05,1.65,0.65];
    const setLights=t=>{
      let a=1,b=1,c=1,d=1;
      const flick=ss(MIR.ENTER-0.1,MIR.ENTER,t)*(1-ss(MIR.ENTER+3.5,MIR.ENTER+4.5,t));
      const fk=k=>1-flick*(0.5+0.5*Math.sin(t*(31+k*7)+Math.sin(t*13+k)*4))*0.8*(Math.sin(t*(7+k*3))>-0.2?1:0.25);
      a=fk(0);b=fk(1);c=fk(2);d=fk(3);
      a*=1-LO[0].d*ss(LO[0].t,LO[0].t+0.3,t);b*=1-LO[1].d*ss(LO[1].t,LO[1].t+0.3,t);c*=1-LO[2].d*ss(LO[2].t,LO[2].t+0.4,t);d*=1-LO[3].d*ss(LO[3].t,LO[3].t+0.3,t);
      const F=S.lampK;a*=F;b*=F;c*=F;d*=F;LU.uAmbP.value.set(lerp(0.026,0.05,F),lerp(0.04,0.03,F),lerp(0.07,0.02,F));
      const k=[a,b,c,d];for(let i=0;i<4;i++){const I=LI[i]*k[i];LU.uLC.value[i].set(WARM[0]*I,WARM[1]*I,WARM[2]*I)}
      S.lampA.shade.material.uniforms.uCol.value.setRGB(1.6*a,0.83*a,0.3*a);S.lampB.shade.material.uniforms.uCol.value.setRGB(1.6*b,0.83*b,0.3*b);
      S.lampA.g.material.opacity=0.35*a;S.lampB.g.material.opacity=0.35*b;S.chG.material.opacity=0.24*c;S.candleG.material.opacity=0.38*d;
      for(const f of S.chFl)f.material.uniforms.uCol.value.setRGB(3*c,1.9*c,0.7*c);S.candle.material.uniforms.uCol.value.setRGB(3*d,1.9*d,0.7*d);
      return[a,b,c,d];
    };
    // ---- how the people and the thing move: all of it a function of the clock ----
    const G0=[0.1,MIR.SZ];
    const sg=(t,a,b,p,q)=>{const k=ss(a,b,t);return[lerp(p[0],q[0],k),lerp(p[1],q[1],k)]};
    // victims: thrown away from the thing, they land and lie still
    const fling=(P,t,K,V,M,y0,tp)=>{
      const T=0.8,k=clamp((t-K)/T,0,1),d=nrm(V[0]-M[0],V[1]-M[1]),dist=tp||1.0;let lx=clamp(V[0]+d[0]*dist,-3.2,3.2),lz=clamp(V[1]+d[1]*dist,-6.2,-2.9);
      const x=lerp(V[0],lx,k),z=lerp(V[1],lz,k),vy=(0.17-y0+0.5*9*T*T)/T,tt=Math.min(t-K,T),y=Math.max(0.17,y0+vy*tt-4.5*tt*tt),sl=ss(0,1,k);
      P.R.position.set(x,y,z);P.R.rotation.set(-1.52*Math.min(1,k*1.15),ang(d[0],d[1])+Math.PI,0,'YXZ');
      return{k,flop:k};
    };
    const flop=(P,t,K,k)=>{const w=ss(0,1,k),tw=Math.sin((t-K)*18)*0.3*(1-k);
      return{aL:[0.5+tw,1.1,0.4],aR:[-0.3-tw,1.3,0.5],hr:0.35*w,hp:-0.3*w,sp:0.25*w,kb:0.3*w,mo:0.2*w}};
    const startle={aL:[0.55,0.45,1.9],aR:[0.55,0.45,1.9],hp:-0.15};
    const mpos={x:0,z:0,yaw:0};
    S.pose=t=>{
      const K=MIR.K,n=K.length,Ml=Ms[n-1],Vl=Vs[n-1];
      // ---- the monster's path: in at the door, then from one victim to the next in the order it takes them ----
      let m={x:99,z:99,yaw:0,w:0,wa:0,e:0.2,jaw:0};
      const ET=MIR.ENTER+0.35,e1=MIR.ENTER+1.2;
      if(t>=ET){
        let p,yw=null,moving=false;
        if(t<e1){p=sg(t,ET,e1,PA,PB);yw=ang(PB[0]-PA[0],PB[1]-PA[1]);moving=true}
        else if(t<K[0]){p=sg(t,e1,K[0],PB,Ms[0]);yw=ang(Vs[0][0]-PB[0],Vs[0][1]-PB[1]);moving=true}
        else{let rest=true;
          for(let i=0;i<n-1;i++)if(t<K[i+1]-0.05){p=sg(t,K[i]+0.1,K[i+1]-0.05,Ms[i],Ms[i+1]);yw=ang(Vs[i+1][0]-Ms[i][0],Vs[i+1][1]-Ms[i][1]);moving=t>K[i]+0.1;rest=false;break}
          if(rest){if(t<MIR.WALK){p=Ml;yw=ang(Vl[0]-Ml[0],Vl[1]-Ml[1])}else{p=sg(t,MIR.WALK,MIR.SMASH-0.3,Ml,G0);yw=null;moving=t<MIR.SMASH-0.3}}}
        m.x=p[0];m.z=p[1];m.yaw=yw===null?lerp(ang(Vl[0]-Ml[0],Vl[1]-Ml[1]),0,ss(MIR.WALK,MIR.WALK+0.8,t)):yw;m.w=t*7.2;m.wa=moving?1:0;
        // strikes
        for(let i=0;i<n;i++){const dt=t-K[i];if(dt>-0.55&&dt<0.5){const u=dt<0?ss(-0.55,0,dt):1-ss(0,0.5,dt);m[i%2?'aL':'aR']=[lerp(0.1,i%2?2.7:2.9,Math.min(1,ss(-0.55,-0.1,dt)))*(dt<0?1:1-ss(0,0.08,dt)*0.55),0.2,0.25];m.lean=0.45+0.5*(dt<0?0:1-ss(0,0.45,dt))+0.2*(dt<0?ss(-0.55,0,dt):0);m.ty=0}}
        m.e=0.35+0.2*ss(MIR.ENTER+1,MIR.ENTER+2,t);
        if(t>=MIR.STOP){m.wa=0;m.e=0.3}
        // the long turn: head first, then the rest
        if(t>=MIR.HEAD&&t<MIR.WALK){const base=ang(Vl[0]-Ml[0],Vl[1]-Ml[1]),toGlass=wrap(0-base),hk=ss(MIR.HEAD,MIR.HEAD+2.8,t),bk=ss(MIR.BODY,MIR.BODY+1.9,t);
          m.yaw=base+toGlass*bk;m.hy=clamp(toGlass*hk-toGlass*bk,-2.6,2.6)+Math.sin(t*3)*0.03*hk*(1-bk);m.hp=0.12*hk;
          m.e=0.3+1.2*ss(MIR.HEAD+2.0,MIR.HEAD+3.3,t);m.sag=0}
        if(t>=MIR.WALK){m.e=1.5;m.wa=t<MIR.SMASH-0.3?1:0;m.hy=0}
        if(t>=MIR.SMASH-0.3){m.x=G0[0];m.z=G0[1];m.yaw=0;m.lean=0.5}
      }
      return m;
    };
    // ---- walking: boxes [x0,x1,z0,z1] and circles [x,z,r] you cannot enter; the pane is a wall until it is broken ----
    const RAD=0.22,SPEED=2.2,SB=[-PW,PW,WZ-0.3,WZ];
    const WB=[[-BX-0.6,-BX,-2.2,BZ+0.6],[BX,BX+0.6,-2.2,BZ+0.6],[-BX-0.6,BX+0.6,BZ,BZ+0.6],[-PX-0.6,-PW,-2.2,WZ],[PW,PX+0.6,-2.2,WZ],[-PX-0.6,-PX,PZ-0.6,-2.2],[PX,PX+0.6,PZ-0.6,-2.2],[-PX-0.6,PX+0.6,PZ-0.6,PZ],
      [-1.7-0.34,-1.7+0.34,-0.9-0.34,-0.9+0.34],[1.75-0.3,1.75+0.3,1.9-0.3,1.9+0.3],[1.75-0.27,1.75+0.27,-1.0-0.27,-1.0+0.27],[SX-0.2,SX+0.2,SZ-0.2,SZ+0.2],
      [sbX-0.78,sbX+0.78,-6.45-0.28,-6.45+0.28],[sofX-0.68,sofX+0.68,-6.72,-6.1]];
    const WBG=WB.concat([[-PW-0.1,PW+0.1,-2.2,WZ-0.04]]);
    const circ=()=>[[TX,TZ,0.66],[LA[0],LA[1],0.22],[LB[0],LB[1],0.22],[S.chairA.position.x,S.chairA.position.z,0.27],[S.chairB.position.x,S.chairB.position.z,S.st?0.36:0.27]];
    const collide=()=>{
      const bl=(S.gb<0?WBG:WB).concat(S.gb>=0&&S.jy<SILL-0.02?[SB]:[]),cs=circ();
      for(let it=0;it<2;it++){
        for(const b of bl){const qx=clamp(S.px,b[0],b[1]),qz=clamp(S.pz,b[2],b[3]),ex=S.px-qx,ez=S.pz-qz,d=Math.hypot(ex,ez);
          if(d<RAD){if(d>1e-6){S.px=qx+ex/d*RAD;S.pz=qz+ez/d*RAD}else{const m=[S.px-b[0],b[1]-S.px,S.pz-b[2],b[3]-S.pz],i=m.indexOf(Math.min(...m));
            if(i===0)S.px=b[0]-RAD;else if(i===1)S.px=b[1]+RAD;else if(i===2)S.pz=b[2]-RAD;else S.pz=b[3]+RAD}}}
        for(const c of cs){const ex=S.px-c[0],ez=S.pz-c[1],d=Math.hypot(ex,ez),r=c[2]+RAD;if(d<r){if(d>1e-6){S.px=c[0]+ex/d*r;S.pz=c[1]+ez/d*r}else S.px=c[0]+r}}
      }
    };
    // how shut your eyes are after you spray yourself: it slows you down too
    const veilK=h=>h<0?0:ss(0.85,1.5,h)*(1-0.82*ss(4.4,8.0,h))*(1-0.5*ss(8.0,11.5,h))*(1-ss(11.5,15,h));
    // the sill of the broken frame is a ledge you can stand on but never walk onto; the pane-top and the ceiling stop your head
    const sillG=(x,z)=>S.gb>=0&&Math.abs(x)<PW&&z>SB[2]&&z<SB[3]?SILL:0;
    let holdNow=-1;
    // walking, sprinting and jumping are the shared walker (src/movement.js); this room adds its sill, ceiling, veil slowdown and sounds
    const WK=createRoomWalker({o,eye:1.6,x:0,z:0.1,collide:()=>collide(),groundAt:sillG,speedMul:()=>1-0.65*veilK(holdNow),
      ceilingAt:(x,z)=>(S.gb>=0&&Math.abs(x)<PW+0.1&&z>WZ-0.5&&z<WZ+0.25?PY1-0.12:(z<WZ-0.3?PH:BH)-0.15)-1.6,
      sound:e=>{
        if(e.jumped)o.sfx('jump');
        if(e.landed>0.8){S.dip=Math.min(0.1,0.03+0.02*e.landed);o.sfx('step');o.noise(0.1,0.16,150,0.9);o.tone(58,0.12,'sine',0.12)}
        else if(e.step&&!A.watching)o.noise(0.07,0.03,170+(WK.b.stepPh&1)*30,1);
      }});
    Object.defineProperty(S,'px',{get:()=>WK.b.x,set:v=>{WK.b.x=v}});Object.defineProperty(S,'pz',{get:()=>WK.b.z,set:v=>{WK.b.z=v}});Object.defineProperty(S,'jy',{get:()=>WK.b.y,set:v=>{WK.b.y=v}});
    // the eye: standing height, the jump, the footstep bob, and a dip when you land
    const view=dt=>{S.dip*=Math.exp(-dt*11);S.eyeY=1.6+bobY(WK.b,WK.scale)+S.jy-S.dip};
    const walk=(dt,inp,hold,ok)=>{
      holdNow=hold;
      // not while it breaks through, not when you spray it: you stand still (and a jump already begun keeps going)
      const ci=ok?{mx:inp.mx,my:inp.my,sprint:inp.sprint,jump:!!inp.jump&&!(S.live&&inp.touch)}:{mx:0,my:0,jump:false};
      if(!ok){WK.b.vx=WK.b.vz=0}
      WK.step(dt,ci,S.yaw);view(dt);
    };
    const watchWalk=dt=>{WK.watch(dt,S.tx,S.tz,S.tjy);view(dt)};
    // stepping through the frame: the bodies are gone, one chair is pulled out and the other lies on its side, a cup is on the floor
    const stepIn=()=>{
      S.st=true;for(const e of cast)e.p.R.visible=false;mon.R.visible=false;
      const a=SEAT[seatK],b=SEAT[seat2],pull=seatK==='B'?0.3:0.5;
      S.chairA.position.set(a[0]-Math.sin(a[2])*pull,0,a[1]-Math.cos(a[2])*pull);S.chairA.rotation.set(0,a[2]+0.3,0);
      S.chairB.position.set(b[0],0.2,b[1]);S.chairB.rotation.set(-1.45,b[2],0.2);
      S.cup.position.set(TX+0.5,0.045,TZ+0.7);S.cup.rotation.set(0,0.5,1.4);
    };
    // each blow on the glass from this side; the third one gives and the pieces fall into the parlor
    const fblow=()=>{S.fb++;blow(12+S.fb);S.shk=Math.max(S.shk,0.22);if(S.fb>=3&&S.gb<0){shatter();S.gb=S.t;S.shIn=true;S.shards.material.color.setRGB(0.62,0.68,0.76)}};
    // ---- easter egg B, a mirror inside a mirror: a small framed glass on a parlor wall. While the parlor lamp burns it is an ordinary dim mirror; put the lamp out and it is one-way glass, and behind it is another tiny dark room with someone standing in it, watching you. Self-contained: replace the function to swap the idea ----
    const mirrorEggMirror=()=>{
      const M={rv:0,lean:0,knocked:false,mats:[]};
      // a free wall spot, never the wall with the pane: left, right or the far wall beside the door
      let at=null;
      for(const sd of shuf(['L','R','F'])){
        if(sd==='F'){const x=dPlace(0.8);if(x!==null){at={x,z:PZ,yaw:0};break}}
        else{const lz=sd==='L'?LA[1]:LB[1];let z=null;for(let i=0;i<40;i++){const c=rg(-5.8,-3.4);if(Math.abs(c-lz)>0.95){z=c;break}}if(z!==null){at={x:sd==='L'?-PX:PX,z,yaw:sd==='L'?Math.PI/2:-Math.PI/2};break}}}
      if(!at)at={x:-PX,z:-4.4,yaw:Math.PI/2};
      const n=[Math.sin(at.yaw),Math.cos(at.yaw)],K=grp(group,at.x,0,at.z);K.rotation.y=at.yaw;S.mini=[+at.x.toFixed(2),+at.z.toFixed(2)];
      const W2=0.28,Y0=1.1,Y1=1.9,YC=1.5,D=0.34,GZ=0.31;
      // the cabinet: dark wood body, gilt lip, a deep shadow box. Everything behind the glass gets its own faint light, which comes up with the reveal
      const mk=(c,p)=>{const m=lit(c,Object.assign({u:1},p));M.mats.push(m);return m};
      const dim=mk(0x3a2c1c,{pat:5,lit:0.5,wrap:0.4}),dimV=mk(0x2e2216,{pat:6,lit:0.5,wrap:0.4});
      box(K,dwood,0,Y0-0.03,D/2,W2*2+0.12,0.06,D);box(K,dwood,0,Y1+0.03,D/2,W2*2+0.12,0.06,D);for(const sg of[-1,1])box(K,dwood,sg*(W2+0.03),YC,D/2,0.06,Y1-Y0,D);
      for(const sg of[-1,1])box(K,gilt,sg*(W2+0.045),YC,D+0.005,0.09,Y1-Y0+0.18,0.025);box(K,gilt,0,Y1+0.045,D+0.005,W2*2+0.18,0.09,0.025);box(K,gilt,0,Y0-0.045,D+0.005,W2*2+0.18,0.09,0.025);
      // inside: back boards, raw bracing, a stool with a can on it, and someone standing in the dark
      box(K,dim,0,YC,0.03,W2*2,Y1-Y0,0.02);for(const sg of[-1,1])box(K,dimV,sg*0.2,YC,0.05,0.03,Y1-Y0,0.025);
      for(const q of[[0.1,0.9],[-0.12,-0.7]]){const e=box(K,dimV,q[0],YC,0.052,0.028,0.95,0.02);e.rotation.z=q[1]}
      box(K,dim,0,Y0+0.005,D/2,W2*2,0.012,D-0.02);
      {const st=grp(K,-0.13,Y0,0.13),ml=mk(0x6e5030,{pat:5,lit:0.55,wrap:0.4});cyl(st,ml,0,0.2,0,0.046,0.046,0.012,10);for(let i=0;i<3;i++){const a=i/3*TAU+0.5;cyl(st,ml,Math.cos(a)*0.03,0.1,Math.sin(a)*0.03,0.004,0.006,0.2,5)}
        const c=makeCan(mk(0xffffff,{map:label,rim:0.2,rc:[0.5,0.45,0.4],lit:0.45,wrap:0.5}));c.scale.setScalar(0.24);c.position.set(0,0.2+0.036,0);st.add(c)}
      const fig=M.fig=grp(K,0.1,Y0,0.15),fs=mk(0x7a746e,{lit:0.5,rim:0.6,rc:[0.25,0.3,0.45],wrap:0.3});
      for(const sg of[-1,1]){cyl(fig,fs,sg*0.014,0.12,0,0.008,0.01,0.24,6);const a=cyl(fig,fs,sg*0.05,0.36,0,0.006,0.008,0.27,6);a.rotation.z=sg*0.08}
      fig.torso=grp(fig,0,0.24,0);cyl(fig.torso,fs,0,0.1,0,0.026,0.036,0.22,8);fig.head=grp(fig.torso,0,0.27,0);ball(fig.head,fs,0,0.02,0.004,0.034,0.048,0.036);
      M.eyes=[-1,1].map(sg=>{const e=ball(fig.head,lit([4,3.2,1.2],{lit:0,glow:1,u:1}),sg*0.014,0.028,0.032,0.0055,0.004,0.004),g=glow(0xffd070,0.06,0);g.position.set(sg*0.014,0.028,0.04);fig.head.add(g);return g});
      // the glass: a dim, silvery, ordinary mirror while the lamp is lit; see-through once the room behind you is darker than the room in front
      M.skin=new THREE.Mesh(new THREE.PlaneGeometry(W2*2,Y1-Y0),new THREE.MeshBasicMaterial({map:canvasTex(64,128,(c,w,h)=>{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#3a424c');g.addColorStop(0.35,'#1c2128');g.addColorStop(0.5,'#4a525c');g.addColorStop(0.62,'#1a1d23');g.addColorStop(1,'#2a3038');c.fillStyle=g;c.fillRect(0,0,w,h)}),transparent:true,opacity:1,depthWrite:true}));
      M.skin.position.set(0,YC,GZ);K.add(M.skin);
      const sheen=new THREE.Mesh(new THREE.PlaneGeometry(W2*2,Y1-Y0),new THREE.MeshBasicMaterial({color:0x9fb2c6,transparent:true,opacity:0.07,depthWrite:false}));sheen.position.set(0,YC,GZ+0.003);K.add(sheen);M.sheen=sheen;
      // world box for the cabinet so you cannot walk into it
      {const cs=[[-W2-0.06,0],[W2+0.06,0],[-W2-0.06,D+0.03],[W2+0.06,D+0.03]].map(q=>[at.x+Math.cos(at.yaw)*q[0]+Math.sin(at.yaw)*q[1],at.z-Math.sin(at.yaw)*q[0]+Math.cos(at.yaw)*q[1]]),
        bx=[Math.min(...cs.map(q=>q[0])),Math.max(...cs.map(q=>q[0])),Math.min(...cs.map(q=>q[1])),Math.max(...cs.map(q=>q[1]))];WB.push(bx);WBG.push(bx)}
      const C=[at.x+n[0]*GZ,YC,at.z+n[1]*GZ];
      M.pose=()=>{const k=M.rv,L=M.lean,vis=k>0.01;
        M.skin.material.opacity=1-0.93*k;M.sheen.material.opacity=0.07*(1-k);fig.visible=vis;for(const m of M.mats)m.uniforms.uGlow.value=0.5*k;
        for(const g of M.eyes){g.material.opacity=vis?0.9*ss(0.5,1,k):0;g.scale.setScalar(0.03+0.03*L)}
        fig.position.z=lerp(0.15,0.235,L);fig.position.x=lerp(0.1,0.03,L);fig.torso.rotation.x=0.45*L;fig.head.rotation.x=0.25*L;fig.head.rotation.y=Math.sin(S.t*0.8)*0.12*(1-L)};
      // the glass clears over 0.6 s when the lamp goes out. Closer than 1.5 m in the dark, it slowly leans in, and gives one soft knock the first time you do
      M.update=dt=>{
        M.rv+=clamp((S.st&&S.lamp<0.5?1:0)-M.rv,-dt/0.6,dt/0.6);
        const close=M.rv>0.6&&Math.hypot(S.px-C[0],S.pz-C[2])<1.5;
        M.lean+=clamp((close?1:0)-M.lean,-dt*0.5,dt*0.3);
        if(close&&!M.knocked&&M.rv>0.9){M.knocked=true;S.knocks=(S.knocks||0)+1;o.noise(0.08,0.1,220,1.4);o.tone(140,0.12,'sine',0.14,0,-40);o.tone(120,0.1,'sine',0.08,0.02,-30)}
        M.pose();
      };
      M.snap=()=>({kn:M.knocked?1:0});
      M.apply=q=>{if(q.kn===1)M.knocked=true};
      S.reveal=()=>M.rv;
      M.pose();return M;
    };
    // ---- easter egg C, the thank-you note: a guestbook open on the parlor table ----
    const mirrorEggBook=()=>{
      const B={st:0,paid:false},bx=TX+0.05,bz=TZ+0.38,b=grp(group,bx,0.78,bz);b.rotation.y=rg(-0.6,0.6);
      const pg=canvasTex(128,128,(c,w,h)=>{c.fillStyle='#e6d6ae';c.fillRect(0,0,w,h);c.strokeStyle='rgba(60,40,25,.65)';c.lineWidth=2;for(let i=0;i<9;i++){c.beginPath();let x=10;c.moveTo(x,16+i*12);while(x<w-12){x+=6;c.lineTo(x,16+i*12+Math.sin(x*0.7+i*3)*2.5)}c.stroke()}});
      box(b,lit(0x4a1a1a,{rim:0.4,rc:[0.5,0.3,0.2],wrap:0.5}),0,0.006,0,0.5,0.012,0.31);
      for(const sg of[-1,1]){const p=box(b,lit(0xffffff,{map:pg,wrap:0.6,rim:0.2,rc:[0.5,0.4,0.3]}),sg*0.115,0.02,0,0.22,0.014,0.28);p.rotation.z=-sg*0.06}
      S.book=[+bx.toFixed(2),+bz.toFixed(2)];
      B.aimed=(ox,oy,oz,fx,fy,fz)=>{if(!S.st)return false;const rx=bx-ox,ry=0.8-oy,rz=bz-oz,al=rx*fx+ry*fy+rz*fz;return al>0.2&&al<1.8&&Math.hypot(rx-fx*al,ry-fy*al,rz-fz*al)<0.3};
      B.toggle=()=>{if(B.st===1){B.st=2;o.tone(300,0.12,'triangle',0.05);return}B.st=1;o.noise(0.2,0.08,2600,1);o.tone(240,0.1,'triangle',0.04);
        if(!B.paid){B.paid=true;o.gems(5);o.sfx('shard');o.say('+5 gems tucked in the book.',3.5)}};
      B.html=()=>`<div style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1.2deg);width:min(90vw,470px);box-sizing:border-box;padding:30px 34px 26px;text-align:left;font:italic 20px/1.55 'Segoe Script','Bradley Hand','Lucida Handwriting','Snell Roundhand',Georgia,'Times New Roman',serif;letter-spacing:0;color:#2a1810;text-shadow:none;background:radial-gradient(ellipse at 28% 18%,rgba(255,246,218,.97),rgba(226,200,146,.98) 62%,rgba(168,128,76,1) 100%);border-radius:3px;box-shadow:inset 0 0 38px rgba(110,70,30,.55),0 8px 40px #000,0 0 0 1px rgba(60,35,15,.8)">To whoever stood behind the glass:<br>Thank you for not looking. Most of them look.<br>Please take something for your trouble.<br><span style="display:block;text-align:right;margin-top:6px">&mdash; the Guest</span><small style="display:block;margin-top:14px;font:12px sans-serif;color:#6a5030;text-align:center;letter-spacing:.06em">${S.touch?'tap USE or walk to close':'press again or walk to close'}</small></div>`;
      B.snap=()=>({eb:B.st,bp:B.paid?1:0});
      B.apply=q=>{if(Number.isInteger(q.eb)&&q.eb>=0&&q.eb<=2)B.st=q.eb;if(q.bp===1)B.paid=true};
      return B;
    };
    const emM=mirrorEggMirror(),emB=mirrorEggBook();
    // ---- the lamp that rules the parlor: the one nearest the little mirror is the switch for every light in the room ----
    const LN=Math.hypot(LA[0]-S.mini[0],LA[1]-S.mini[1])<=Math.hypot(LB[0]-S.mini[0],LB[1]-S.mini[1])?LA:LB;S.lampAt=LN.slice();{const q=LO[LN===LA?0:1];q.d=Math.min(q.d,0.4)}
    const lampAim=(ox,oy,oz,fx,fy,fz)=>{const rx=LN[0]-ox,rz=LN[1]-oz,d2=fx*fx+fz*fz;if(d2<1e-4)return false;const al=(rx*fx+rz*fz)/d2,y=oy+fy*al;return al>0.1&&al<1.6&&y>0.1&&y<1.95&&Math.hypot(rx-fx*al,rz-fz*al)<0.4};
    const setLamp=on=>{S.lamp=on?1:0;o.noise(0.03,0.2,3200,2);o.tone(1500,0.025,'square',0.05,0,-500);o.tone(90,0.06,'sine',0.1,0.01)};
    const toggleLamp=()=>setLamp(S.lamp?0:1);
    // the far door is locked: a rattle and a thud, and it stays shut
    const lockedDoor=()=>{if(S.t<S.lockC)return;S.lockC=S.t+1.0;S.lockT=S.t;S.locks++;for(let i=0;i<3;i++)o.tone(1700-i*160,0.035,'square',0.05,i*0.08);o.noise(0.2,0.35,160,0.8);o.tone(70,0.25,'sine',0.22,0.22);o.say("It's locked.",2.2)};
    // ---- update ----
    let T0=0;const at=x=>T0<x&&S.t>=x;
    S.update=(dt,inp)=>{
      T0=S.t;S.t+=dt;const t=S.t,W=A.watching,hold=S.ch===2?t-S.ct:-1;
      lookStep(S,dt,inp.lx,inp.ly,[-1.25,1.0]);S.yaw=wrap(S.yaw);S.touch=!!inp.touch;
      S.fr=S.ch===2&&hold>=LK.PROMPT&&S.bt<0;
      // walking: not while it breaks through, not when you spray it, not while you lean in to the little glass
      const wOk=S.bt<0&&S.ch!==1&&S.leaveT<0;
      if(W)watchWalk(dt);else walk(dt,inp,hold,wOk);
      S.lampK+=clamp(S.lamp-S.lampK,-dt/0.35,dt/0.35);
      if(S.gb>=0&&!S.st&&S.pz<WZ-0.32)stepIn();
      // sound of the parlor
      if(at(MIR.ENTER)){o.noise(0.5,0.8,180,0.6);o.tone(55,0.7,'sawtooth',0.35,0,-25);o.rumble(500,1,0.8);S.shk=Math.max(S.shk,0.25)}
      for(let i=0;i<MIR.K.length;i++)if(at(MIR.K[i])){o.noise(0.35,0.7,260,0.7);o.tone(80,0.35,'square',0.3,0,-45);o.tone(45,0.6,'sine',0.35,0.05,-15);o.rumble(350,1,0.9);S.shk=Math.max(S.shk,0.3)}
      if(at(MIR.HEAD)){o.tone(62,2.8,'sawtooth',0.1,0,-14)}if(at(MIR.HEAD+2.4)){o.tone(150,1.4,'sine',0.14,0,40)}
      if(at(MIR.WALK))for(let i=0;i<5;i++)o.tone(46,0.13,'sine',0.22,i*0.42);
      if(t<MIR.WALK&&t>MIR.ENTER&&Math.random()<dt*0.5)o.noise(0.08,0.1,3000,2);
      // is the thing looked at?
      // heavy footsteps follow its legs
      const mp=S.pose(t),cp=Math.cos(S.pitch),fx=Math.sin(S.yaw)*cp,fy=Math.sin(S.pitch),fz=-Math.cos(S.yaw)*cp;
      let dx=mp.x-S.px,dy=2.2-S.eyeY,dz=mp.z-S.pz;const dl=Math.hypot(dx,dy,dz)||1;
      const seen=(dx*fx+dy*fy+dz*fz)/dl>MIR.LOOK&&t>=MIR.WALK;S.lk=lerp(S.lk,seen?1:0,Math.min(1,dt*8));
      if(mp.wa>0&&S.ch!==2){const a=Math.floor(mp.w/Math.PI);if(S.fs!==undefined&&a!==S.fs){o.tone(50,0.14,'sine',0.25);o.noise(0.14,0.25,110,0.8)}S.fs=a}else S.fs=undefined;
      // is the can under the crosshair? a generous ray test, and the only thing that ever says so
      {const ey=S.eyeY;let tg='';const c=S.canC,rx=c[0]-S.px,ry=c[1]-ey,rz=c[2]-S.pz,al=rx*fx+ry*fy+rz*fz;
        if(!S.held&&S.ch===0&&S.bt<0&&al>0.2&&al<3.4&&Math.hypot(rx-fx*al,ry-fy*al,rz-fz*al)<0.17)tg='can';
        else if(S.fr&&S.leaveT<0&&emB.st!==1){
          if(S.gb<0&&fz<-0.05){const q=(WZ-0.04-S.pz)/fz;if(q>0&&q<3.6){const hx=S.px+fx*q,hy=ey+fy*q;if(Math.abs(hx)<PW&&hy>PY0&&hy<PY1)tg='glass'}}
          if(!tg&&fz>0.05&&S.pz>WZ-0.35){const q=(BZ-0.05-S.pz)/fz;if(q>0&&q<4.4){const hx=S.px+fx*q,hy=ey+fy*q;if(Math.abs(hx+0.4)<0.6&&hy>0&&hy<2.2)tg='door'}}
          if(!tg&&S.st&&lampAim(S.px,ey,S.pz,fx,fy,fz))tg='lamp';
          if(!tg&&S.st&&fz<-0.05){const q=(PZ+0.1-S.pz)/fz;if(q>0&&q<1.8){const hx=S.px+fx*q,hy=ey+fy*q;if(Math.abs(hx-DX)<0.5&&hy>0.1&&hy<2.3)tg='mdoor'}}
          if(!tg&&emB.aimed(S.px,ey,S.pz,fx,fy,fz))tg='book'}
        S.tg=tg;S.aim=!!tg}
      // the glass
      if(t>=MIR.SMASH&&S.bt<0){
        let r=0;
        if(S.ch===1)r=(1-S.sp0)/1.2/1.0;
        else if(S.ch===2){const m=1-ss(0.6,3.0,hold);r=lerp(0.35,1,S.lk)/MIR.BREAK*m}
        else r=lerp(0.35,1,S.lk)/MIR.BREAK;
        if(S.ch===0&&t<MIR.SMASH+0.8)r*=ss(MIR.SMASH,MIR.SMASH+0.8,t);
        let sm=S.sm+r*dt;if(S.ch===2)sm=Math.min(sm,0.93);if(W&&S.ch===0&&!S.wb)sm=Math.min(sm,0.995);
        S.sm=sm;
        const nb=Math.floor(Math.min(S.sm,1)*MIR.NB+1e-6);
        if(nb>S.nb){const n=nb-S.nb;S.nb=nb;for(let i=0;i<n;i++)blow(nb-n+i)}
        if(S.sm>=1){S.sm=1;S.bt=t;shatter()}
      }
      if(S.want&&t>=S.want[1]&&S.ch===0){pick(S.want[0]);S.want=null}
      // choosing
      const cur_={l:!!inp.sl,r:!!inp.sr,k1:!!inp.k1,k2:!!inp.k2,tab:!!inp.tab,ok:!!inp.press,spray:!!inp.spray,thumb:!!inp.thumb},P0=S.prev||cur_;S.prev=cur_;const e=k=>cur_[k]&&!P0[k];
      const live=S.held&&t>=MIR.CHOICE&&S.ch===0&&S.bt<0;S.live=live;
      if(!W&&S.ch===0&&S.bt<0){
        if(!S.held){if(S.tg==='can'&&e('ok'))grab()}
        else if(live){
          if(inp.touch){if(e('spray'))pick(1);else if(e('thumb'))pick(2)}
          else{if(e('l'))S.sel=0;if(e('r'))S.sel=1;if(e('tab'))S.sel=S.sel===0?1:0;if(nf(inp.wh)&&inp.wh)S.sel=inp.wh>0?1:0;if(e('k1'))pick(1);else if(e('k2'))pick(2);else if(e('ok')&&S.sel>=0)pick(S.sel===0?1:2)}
        }else if(e('ok')&&t>=S.spc)spray(fx,fy,fz);
      }
      // once it is gone: break the glass, leave by the door, or look at what is in the parlor. No timer forces you out
      if(!W&&S.fr&&S.leaveT<0&&e('ok')){
        if(emB.st===1)emB.toggle();
        else if(S.tg==='glass')fblow();
        else if(S.tg==='door'){S.leaveT=t;o.tone(300,0.4,'sine',0.12,0,-100)}
        else if(S.tg==='lamp')toggleLamp();
        else if(S.tg==='mdoor')lockedDoor();
        else if(S.tg==='book')emB.toggle()}
      if(emB.st===1&&Math.abs(nf(inp.mx)?inp.mx:0)+Math.abs(nf(inp.my)?inp.my:0)>0.3)emB.st=2;
      emM.update(dt);
      if(S.leaveT>=0&&t-S.leaveT>=0.7)finish({k:'win',why:'mirror'});
      // after it gives
      if(S.bt>=0){const d=t-S.bt;if(at(S.bt+0.75)){o.hurtFx();o.noise(0.6,0.8,300,0.6);o.tone(70,0.6,'sawtooth',0.4,0,-40)}if(d>=1.9)finish({k:'dead',why:'mirror'})}
      S.shk=Math.max(0,S.shk-dt*1.4);
      draw(t,dt,mp);
    };
    // ---- the choice ----
    const LK={PROMPT:11.6};
    const grab=()=>{S.held=true;S.ht=S.t;S.can.visible=false;o.tone(900,0.05,'triangle',0.08);o.noise(0.08,0.12,2500,1)};
    // a squirt at the glass before it gives: a jet, then splats and runs on the pane. Nothing in the room minds.
    const spray=(fx,fy,fz)=>{
      S.spc=S.t+0.9;S.spj=S.t+0.55;o.noise(0.6,0.3,4500,0.5);o.tone(260,0.35,'sawtooth',0.04,0,-120);
      const s=fz<-0.05?(WZ-0.04-S.pz)/fz:6,hx=S.px+fx*s,hy=S.eyeY+fy*s;S.spt=[hx,hy,S.pz+fz*s];
      if(fz<-0.05&&Math.abs(hx)<PW-0.08&&hy>PY0+0.08&&hy<PY1-0.08){const sp=[hx+(Math.random()-0.5)*0.05,hy-(PY0+PY1)/2+(Math.random()-0.5)*0.05,S.t+0.3,Math.random()];if(S.splats.length<10)S.splats.push(sp);else S.splats[S.sn++%10]=sp}
    };
    const pick=c=>{
      if(!S.held){S.held=true;S.ht=S.t-1;S.can.visible=false}
      S.ch=c;S.ct=S.t;S.sp0=S.sm;S.mt=0;
      if(c===1){o.tone(140,0.5,'sawtooth',0.25,0.4,160);o.noise(1.3,0.35,4500,0.5)}
      else o.tone(500,0.08,'triangle',0.1);
    };
    S.pick=pick;
    const blow=i=>{
      const k=i%HP.length;S.hitT[k]=S.t;S.shk=Math.max(S.shk,0.14);
      o.tone(62+Math.random()*10,0.28,'sawtooth',0.3,0,-30);o.noise(0.22,0.55,170,0.7);o.noise(0.35,0.3,3600,2);o.tone(2200+Math.random()*900,0.16,'triangle',0.05,0,-1300);o.rumble(160,0.9,0.5);
    };
    const shatter=()=>{S.pane.visible=false;S.drip.visible=false;S.shards.visible=true;o.noise(1.0,0.9,2800,0.8);o.noise(0.9,0.7,500,0.8);o.tone(1700,0.5,'triangle',0.1,0,-1200);o.tone(60,0.9,'sawtooth',0.4,0,-30);o.rumble(800,1,1);S.shk=0.5};
    // ---- drawing ----
    const hudHtml=()=>{
      if(A.watching)return;
      let h='';const t=S.t,op=(i,tx,tag)=>{const on=S.sel===i;return`<div style="display:block;margin:6px auto 0;padding:6px 14px;max-width:88vw;border:1px solid ${on?'#ffe0a8':'#6b5a48'};border-radius:6px;background:${on?'rgba(255,190,110,.26)':'rgba(0,0,0,.5)'};color:${on?'#fff2d6':'#d9c7ae'}">${S.touch?'<span style="opacity:.65;font-size:12px">['+tag+']</span> ':''}${tx}</div>`};
      const pr=(w,k)=>`<div style="position:fixed;left:0;right:0;top:61%;font-size:15px">${w} <small>[${o.hint(k)}]</small></div>`;
      S.btn=['USE',false];
      if(emB.st===1)h=emB.html();
      else if(S.bt<0&&S.ch===0&&S.live){S.btn=['SPRAY',true];h=op(0,'Spray the monster','SPRAY')+op(1,'Suck your thumb and hope the bad things go away','THUMB')+`<small style="display:block;margin-top:8px">${o.hint('mirror')}</small>`}
      else if(S.bt<0&&S.ch===0&&S.held){S.btn=['SPRAY',false];h=pr('Spray','mspray')}
      else if(S.bt<0&&S.ch===0&&S.tg==='can'){S.btn=['PICK UP',false];h=pr('Pick up','mpick')}
      else if(S.fr&&S.leaveT<0){
        if(S.tg==='door'){S.btn=['LEAVE',false];h=pr('Leave','muse')}
        else if(S.tg==='lamp')h=pr(S.lamp?'Turn off':'Turn on','muse')
        else if(S.tg==='mdoor')h=pr('Open','muse')
        else if(S.tg==='book'){S.btn=['READ',false];h=pr('Read','muse')}}
      o.hud(h);
    };
    const v3=new THREE.Vector3(),M4=new THREE.Matrix4(),Q4=new THREE.Quaternion(),E4=new THREE.Euler(),S3=new THREE.Vector3(),camQ=new THREE.Quaternion();
    const emit=(mode,n,from,to)=>{
      for(let i=0;i<n;i++){const p=S.pt[S.pi=(S.pi+1)%S.pt.length];p.a=0;p.l=0.45+Math.random()*0.25;
        if(mode===0){p.p=[from[0]+(Math.random()-0.5)*0.03,from[1]+(Math.random()-0.5)*0.03,from[2]];const d=[to[0]-from[0],to[1]-from[1],to[2]-from[2]],l=Math.hypot(...d),sp=5.5+Math.random()*1.5;p.v=[d[0]/l*sp+(Math.random()-0.5)*0.5,d[1]/l*sp+(Math.random()-0.5)*0.5,d[2]/l*sp+(Math.random()-0.5)*0.5]}
        else{p.p=[from[0]+(Math.random()-0.5)*0.1,from[1]+(Math.random()-0.5)*0.1,from[2]+(Math.random()-0.5)*0.1];const d=[to[0]-from[0]+(Math.random()-0.5)*0.9,to[1]-from[1]+(Math.random()-0.5)*0.9,to[2]-from[2]+(Math.random()-0.5)*0.5],l=Math.hypot(...d)||1,sp=1.2+Math.random()*1.6;p.v=[d[0]/l*sp,d[1]/l*sp,d[2]/l*sp];p.l=0.9+Math.random()*0.6}}
    };
    const draw=(t,dt,mp)=>{
      const lit4=setLights(t),W=A.watching,hold=S.ch===2?t-S.ct:-1,dd=S.bt>=0?t-S.bt:-1;
      // camera
      const sh=S.shk*(S.shk>0.2?0.06:0.04),cy=S.eyeY+Math.sin(t*1.1)*0.008;
      let yaw=S.yaw,pit=S.pitch;
      if(S.ch===1&&S.bt>=0||S.ch===1&&t-S.ct<2){const k=Math.min(1,dt*4);S.yaw=yaw=lerp(yaw,0,k);S.pitch=pit=lerp(pit,0.05,k)}
      if(dd>=0&&S.ch!==1){const k=Math.min(1,dt*2.5);S.yaw=yaw=lerp(yaw,0,k);S.pitch=pit=lerp(pit,0.1,k)}
      cam.position.set(S.px+(Math.random()-0.5)*sh,cy+(Math.random()-0.5)*sh,S.pz+(Math.random()-0.5)*sh);
      cam.rotation.set(pit,-yaw,Math.sin(t*0.4)*0.008+(Math.random()-0.5)*sh*0.8,'YXZ');cam.updateMatrixWorld();camQ.copy(cam.quaternion);
      // people
      CM[0]=mp.x;CM[1]=mp.z;const mOn=t>=MIR.ENTER+0.35;
      if(!S.st)for(const e of cast)drawCast(e,t);
      for(const e of cast){
        const p=e.p.R.position;
        e.contact.position.set(p.x,0.004,p.z);
      }
      chairShadow.position.set(S.chairA.position.x,0.004,S.chairA.position.z);
      // the thing
      mon.R.visible=mOn&&!S.st;
      if(mOn){
        const q=Object.assign({},mp);
        const sm=t>=MIR.SMASH-0.3&&S.bt<0&&S.ch!==2||(S.ch===2&&hold<3.2);
        if(t>=MIR.SMASH-0.3&&t<MIR.SMASH+0.0){q.wa=1}
        if(t>=MIR.SMASH&&(S.bt<0)){
          const f=S.nb>0||S.sm>0?(S.sm*MIR.NB)%1:0,ar=Math.floor(S.sm*MIR.NB)%2,slow=S.ch===2?1-ss(0.6,3.0,hold):1;
          // wind up high, then bring it down on the glass
          const w=f<0.72?ss(0,0.72,f):1-ss(0.72,1.0,f)*1.0,A=[lerp(0.5,2.7,Math.min(1,w*(f<0.72?1:1))) ,0.15,0.35],B=[lerp(0.3,1.0,0.0),0.15,0.3];
          const rise=f<0.7?ss(0,0.7,f):1-ss(0.7,0.95,f);
          const hi=[lerp(1.45,2.9,rise),0.25,lerp(0.25,0.5,rise)],lo=[0.5,0.25,0.4];
          q[ar?'aR':'aL']=hi;q[ar?'aL':'aR']=lo;q.lean=0.5+0.2*rise*0-0.15*rise+0.12*(1-rise);q.hp=0.15-0.1*rise;q.jaw=0.15+0.25*Math.sin(t*9)*S.lk;q.hy=0;
          q.e=1.2+1.2*S.lk+(S.ch===1?1.5:0);
          if(S.ch===1){q.jaw=0.6;q.hp=0.2}
          if(S.ch===2){const k=ss(0.6,3.0,hold);q.sag=k;q.e=lerp(q.e,0.12,k);q.aL=q.aL;q.hp=lerp(q.hp,0.5,k);q.jaw=lerp(q.jaw,0.05,k);
            if(hold>=3.2){q.aL=[0.05,0.1,0.15];q.aR=[0.05,0.1,0.15];q.lean=0.35;q.sag=1}
            if(hold>=LK.PROMPT-6.6){const u=hold-(LK.PROMPT-6.6),d=ss(0,1.2,u),wl=ss(1.0,5.0,u);const from=G0,to=[DX,-6.5];
              q.yaw=lerp(0,Math.PI+0.2,d);q.x=lerp(from[0],to[0],wl);q.z=lerp(from[1],to[1],wl);q.w=u*4.2;q.wa=u>1.0&&u<5.0?0.7:0;q.sag=1-0.4*wl;q.e=0.1;q.hy=0;
              q.yaw=u<1.0?q.yaw:ang(to[0]-from[0],to[1]-from[1]);if(u>=1.0&&u<5.0)q.yaw=lerp(Math.PI+0.2,ang(to[0]-from[0],to[1]-from[1]),ss(1.0,1.5,u));
              if(u>=5.1)q.x=99}}
        }
        if(S.bt>=0){
          // it comes through: the whole of it hurls itself at your face
          const d=t-S.bt,k=ss(0.05,0.7,d);mon.R.position.set(0,0,0);
          q.jaw=lerp(0.5,1.1,ss(0.2,0.7,d));q.e=1.1;q.hp=-0.55;q.lean=0.3;q.aL=[1.4,0.1,0.3];q.aR=[1.4,0.1,0.3];q.x=G0[0];q.z=G0[1]+k*1.7;q.hy=0;
          if(d>0.05){poseMon(q);mon.R.updateMatrixWorld(true);mon.jaw.getWorldPosition(v3);v3.y-=0.02;const tx=cam.position.x,ty=cam.position.y-0.18,tz=cam.position.z-0.7-0.3*(1-k);
            mon.R.position.x+=(tx-v3.x)*k;mon.R.position.y+=(ty-v3.y)*k;mon.R.position.z+=(tz-v3.z)*k}
          else poseMon(q);
        }else poseMon(q);
        if(S.bt<0||S.bt>=0&&t-S.bt<=0.05){}
      }
      // door of the parlor: slams open, later closes behind it
      {let a=0;if(t>=MIR.ENTER){const u=t-MIR.ENTER;a=-1.9*(u<0.18?u/0.18:1+0.08*Math.exp(-(u-0.18)*6)*Math.sin((u-0.18)*30))}
        if(S.ch===2&&hold>=LK.PROMPT-6.6+5.0)a=lerp(-1.9,0,ss(LK.PROMPT-6.6+5.4,LK.PROMPT-6.6+5.9,hold));if(S.lockT>=0){const u=t-S.lockT;if(u<0.8&&a===0)a+=0.035*Math.sin(u*55)*Math.exp(-u*5)}S.door.rotation.y=a}
      // the pane
      const U=S.pane.material.uniforms;U.uK.value=S.sm+0.12*S.fb;for(let i=0;i<10;i++){const h=hits[i];h.z=S.hitT[i]===undefined?0:(0.45+0.5*((i*37%10)/10))*ss(0,0.2,t-S.hitT[i])}
      if(S.gb>=0&&S.bt<0){
        // broken from this side: the glass falls inward onto the parlor floor and stays there
        const d=t-S.gb;S.shards.visible=true;
        for(let i=0;i<S.sh.length;i++){const s=S.sh[i],vz=-(0.3+(s.v[2]-2.5)/7*1.6),vy=s.v[1]*0.5,vx=s.v[0]*0.5,y0=s.p[1],tl=(vy+Math.sqrt(vy*vy+18*(y0-0.03)))/9,g=Math.min(d,tl);
          v3.set(s.p[0]+vx*g,Math.max(0.03,y0+vy*g-4.5*g*g),s.p[2]+vz*g);if(d>=tl)E4.set(-Math.PI/2,s.r[1]+s.w[1]*tl,0);else E4.set(s.r[0]+s.w[0]*g,s.r[1]+s.w[1]*g,s.r[2]+s.w[2]*g);
          Q4.setFromEuler(E4);S3.setScalar(s.s);M4.compose(v3,Q4,S3);S.shards.setMatrixAt(i,M4)}
        S.shards.instanceMatrix.needsUpdate=true;
      }
      if(S.bt>=0){
        const d=t-S.bt;S.shards.visible=d<2.2;
        for(let i=0;i<S.sh.length;i++){const s=S.sh[i],g=Math.min(d,2.2);v3.set(s.p[0]+s.v[0]*g,s.p[1]+s.v[1]*g-4.5*g*g,s.p[2]+s.v[2]*g);E4.set(s.r[0]+s.w[0]*g,s.r[1]+s.w[1]*g,s.r[2]+s.w[2]*g);Q4.setFromEuler(E4);S3.setScalar(s.s);M4.compose(v3,Q4,S3);S.shards.setMatrixAt(i,M4)}
        S.shards.instanceMatrix.needsUpdate=true;
      }
      // the can sits on its stool until you take it
      S.can.visible=!S.held;
      // the hand
      let hv=false;
      if(S.held&&(S.bt<0||S.ch===1)){const c=t-S.ct,up=ss(0,0.5,t-S.ht)*(S.ch===2?1-ss(2.6,3.4,c):1);hv=up>0.01;
        S.hand.position.copy(cam.position);S.hand.quaternion.copy(camQ);
        const turn=S.ch===2?ss(0.35,0.9,c):0,aimY=S.ch===1?0:0;
        S.hand.children[0].position.set(0.34-turn*0.12,-0.5-(1-up)*0.8,-0.4);
        S.handCan.position.set(0.2-turn*0.14,-0.2-(1-up)*0.8,-0.58+turn*0.18);S.handCan.rotation.set(S.ch===1?-1.45:-1.45+turn*3.0,0,S.ch===1?0.0:0.0);
        S.hand.children[1].position.set(0.2-turn*0.14,-0.22-(1-up)*0.8,-0.58+turn*0.18);for(let i=0;i<3;i++)S.hand.children[3+i].position.set(0.14+i*0.04-turn*0.14,-0.16-(1-up)*0.8,-0.52-i*0.02+turn*0.18)}
      S.hand.visible=hv;
      if(S.ch===0&&t<S.spj)S.hand.position.y+=Math.sin(t*70)*0.004;
      if(S.ch===0&&t<S.spj&&t>S.spj-0.5)emit(0,Math.max(1,Math.round(dt*140)),[cam.position.x+0.2,cam.position.y-0.3,cam.position.z-0.8],S.spt);
      // splats on the glass
      {const us=S.drip.material.uniforms.uS.value;for(let i=0;i<10;i++){const sp=S.splats[i];if(sp)us[i].set(sp[0],sp[1],sp[2],sp[3]);else us[i].set(0,0,-1,0)}S.drip.material.uniforms.uT.value=t}
      // spray: a jet at the glass, or a cloud in your own face
      let veil=0,burn=0;
      if(S.ch===1){const c=t-S.ct;const noz=[cam.position.x+0.2,cam.position.y-0.3,cam.position.z-0.8];if(c>0.35&&c<9){emit(0,Math.max(1,Math.round(dt*160)),noz,[0.0,1.9,WZ-0.1])}
        S.splash.material.opacity=ss(0.7,1.1,c)*0.9;S.splash.scale.setScalar(0.8+ss(0.7,1.8,c)*2.2);S.splash.visible=S.bt<0||t-S.bt<0.2}
      else S.splash.visible=false;
      if(S.ch===2){const c=hold;if(c>0.8&&c<2.6)emit(1,Math.max(1,Math.round(dt*220)),[cam.position.x+0.05,cam.position.y-0.1,cam.position.z-0.5],[cam.position.x,cam.position.y,cam.position.z+0.2]);
        veil=veilK(c);burn=ss(0.9,1.5,c);
        if(at(S.ct+0.9)){o.hurtFx();o.noise(1.0,0.4,4500,0.5)}
        if(at(S.ct+1.0))o.say('You spray yourself in the eyes.',3);
        for(const x of [0.9,1.4,1.9,2.4,2.9,3.3])if(at(S.ct+x)){o.tone(60,0.25,'sawtooth',0.28,0,-30);o.noise(0.3,0.5,170,0.7);o.rumble(150,0.8,0.4)}
        for(let i=0;i<9;i++)if(at(S.ct+5.2+i*0.55)){const dist=1-i/9;o.tone(48,0.15,'sine',0.26*dist+0.03);o.noise(0.14,0.22*dist+0.02,110,0.8)}
        if(at(S.ct+LK.PROMPT-6.6+5.0))o.tone(70,0.4,'sine',0.14);if(at(S.ct+LK.PROMPT-6.6+5.5)){o.noise(0.3,0.4,200,0.7);o.tone(55,0.4,'sine',0.25)}}
      S.veil.visible=veil>0.01;S.veil.material.uniforms.uK.value=veil;S.veil.material.uniforms.uT.value=t;
      if(S.veil.visible){S.veil.position.copy(cam.position).add(v3.set(0,0,-0.25).applyQuaternion(camQ));S.veil.quaternion.copy(camQ);const h=2*0.25*Math.tan(cam.fov*Math.PI/360)*1.4;S.veil.scale.set(h*2.2,h,1)}
      // mist particles
      {const pa=S.mist.geometry.attributes.position;let any=false;
        for(let i=0;i<S.pt.length;i++){const p=S.pt[i];p.a+=dt;if(p.a>=p.l){pa.setXYZ(i,999,999,999);continue}any=true;for(let k=0;k<3;k++)p.p[k]+=p.v[k]*dt;pa.setXYZ(i,p.p[0],p.p[1],p.p[2])}
        pa.needsUpdate=true;S.mist.visible=any}
      // light and dust
      const fl=1+Math.sin(t*37)*0.03*Math.sin(t*3.1);S.bulbG.material.opacity=0.3*fl;LU.uBC.value.set(0.5*fl,0.62*fl,0.9*fl);
      const dp=S.dust.geometry.attributes.position;for(let i=0;i<S.dustSeed.length;i++){const s=S.dustSeed[i];dp.setY(i,dp.getY(i)+Math.sin(t*s[2]*2+s[0])*0.0006)}dp.needsUpdate=true;
      S.spill.material.uniforms.uK.value=0.2*lit4[0]+0.25*lit4[1]+0.55*lit4[2];
      // the blur that comes with burning eyes
      S.blur=burn>0?burn*(1-ss(4.6,9.5,hold)):0;
      S.fade=Math.max(S.bt>=0?ss(S.bt+0.95,S.bt+1.55,t):0,S.leaveT>=0?ss(S.leaveT+0.1,S.leaveT+0.65,t):0,S.ch===2?0.62*burn*(1-ss(4.4,9.0,hold)):0);
      S.bloom=0.33+0.25*burn;
      if(!W)hudHtml();
    };
    S.snap=()=>({px:+S.px.toFixed(2),pz:+S.pz.toFixed(2),fb:S.fb,...emM.snap(),...emB.snap(),lo:S.lamp,jy:+S.jy.toFixed(2),t:+S.t.toFixed(3),yaw:+S.yaw.toFixed(2),pitch:+S.pitch.toFixed(2),sm:+S.sm.toFixed(3),ch:S.ch,ct:+S.ct.toFixed(2),bt:+S.bt.toFixed(2),sel:S.sel,lv:+S.leaveT.toFixed(2),sd:S.seed,hd:S.held?1:0,sp:S.splats.map(q=>[+q[0].toFixed(3),+q[1].toFixed(3),+q[2].toFixed(2),+q[3].toFixed(2)])});
    S.apply=q=>{
      if(nf(q.yaw))S.yaw=wrap(clamp(q.yaw,-7,7));if(nf(q.pitch))S.pitch=clamp(q.pitch,-1.25,1);
      if(nf(q.px)&&nf(q.pz)&&Math.abs(q.px)<5&&q.pz>-8&&q.pz<3.5){S.tx=q.px;S.tz=q.pz}
      if(Number.isInteger(q.sel)&&q.sel>=-1&&q.sel<=1)S.sel=q.sel;
      if((q.ch===1||q.ch===2)&&S.ch===0&&nf(q.ct)&&q.ct>=MIR.CHOICE&&q.ct<400)S.want=[q.ch,q.ct];
      if(nf(q.bt)&&q.bt>=0&&S.bt<0)S.wb=true;
      if(q.hd&&!S.held){S.held=true;S.ht=S.t;S.can.visible=false}
      if(Array.isArray(q.sp))for(const v of q.sp.slice(0,10)){if(Array.isArray(v)&&v.length>=4&&v.slice(0,4).every(nf)&&Math.abs(v[0])<2&&Math.abs(v[1])<2&&!S.splats.some(o=>o[2]===v[2])){const c=v.slice(0,4);if(S.splats.length<10)S.splats.push(c);else S.splats[S.sn++%10]=c}}
      if(nf(q.lv)&&q.lv>=0&&S.leaveT<0&&q.lv<400)S.leaveT=q.lv;
      if(!nf(q.t)||q.t<0||q.t>200)return;
      const to=clamp(q.t,0,400),d=to-S.t;
      if(d>0.25){A.mute++;try{for(let n=0;n<4200&&!held&&S.t<to-0.001;n++)S.update(Math.min(0.1,to-S.t),Z)}finally{A.mute--}}else if(d<-0.25)S.t=to;
      if(nf(q.sm)&&S.bt<0)S.sm=clamp(q.sm,0,q.bt>=0?1:0.995);
      if(Number.isInteger(q.fb)&&q.fb>=0&&q.fb<=3)while(S.fb<q.fb)fblow();
      if((q.lo===0||q.lo===1)&&q.lo!==S.lamp)setLamp(q.lo);if(nf(q.jy))S.tjy=clamp(q.jy,0,2);
      emM.apply(q);emB.apply(q);
    };
    S.bloom=0.33;
    S.look=0;S.aimed=()=>S.aim;
    S.update(0,Z);
    return S;
  }

  const theater=createTheater({renderer,scene,cam,o,A,canvasTex,glow,clamp,ss,lerp,nf,rnd,getGroup:()=>group,onClear:fn=>clearHooks.push(fn),finish:r=>finish(r),createRoomWalker,MOVE,lookStep,bobAdvance,bobY});
  const monoliths=(seed=7)=>monolithRoom({group,cam,o,A,finish,rand:rng32(seed),seed});
  const moose=()=>mooseDefenseRoom({group,scene,cam,o,A,finish,onClear:fn=>clearHooks.push(fn)});
  const KINDS={galaxy,fall,kiln,mirror,theater,monoliths,moose};
  for(const kind of Object.keys(DOOR_KINDS))if(!Object.hasOwn(KINDS,kind))throw new Error('Missing room factory for '+kind);
  A.mode=modeOf;
  // a room only ever sees the controls its mode allows
  const gate=(k,inp)=>{const m=modeOf(k);return m==='walk'?inp:m==='look'?Object.assign({},inp,{mx:0,my:0,jump:false,sprint:false}):Object.assign({},inp,{mx:0,my:0,jump:false,sprint:false,lx:0,ly:0,press:0})};
  const build=(kind,seed)=>{
    setup();A.active=true;A.kind=kind;held=false;
    cur=(KINDS[kind]||kiln)(seed);
    cur.fade=0;cur.in=0;
  };
  // watching someone else's room: the same scene, driven by their snapshots instead of our input
  A.watch=(kind,q)=>{
    if(A.active)A.abort();
    if(!KINDS[kind])return;
    done=null;A.watching=true;
    build(kind,q&&q.sd);
    A.sync(q);cur.update(0,Z);
  };
  // a watcher's mirror room is rebuilt from the other player's seed when it is not the one they are looking at
  A.sync=q=>{if(!cur||!A.watching||held||!q||typeof q!=='object'||!cur.apply)return;
    try{if(A.kind==='mirror'&&Number.isInteger(q.sd)&&q.sd>=0&&q.sd<4294967296&&q.sd!==cur.seed){const o2=cur;clear();setup();cur=mirror(q.sd);cur.fade=0;cur.in=o2.in}
      cur.apply(q)}catch(e){}};
  A.snap=()=>cur&&cur.snap&&!A.watching?cur.snap():null;
  A.start=(kind,cb,seed)=>{
    if(A.active)A.abort();
    A.watching=false;setup();done=cb;A.active=true;A.kind=kind;
    cur=(KINDS[kind]||kiln)(seed!==undefined?seed:(Math.random()*4294967296)>>>0);
    cur.fade=0;cur.in=0;
    cur.update(0,Z);
  };
  A.abort=()=>{done=null;A.active=false;A.kind='';A.watching=false;held=false;cur=null;clear();o.hud('')};
  A.update=(dt,inp)=>{if(!cur||held)return;cur.in+=dt;cur.update(dt,A.watching?inp:gate(A.kind,inp))};
  A.tap=(x,y)=>!!(cur&&!A.watching&&cur.tap&&cur.tap(x,y));
  A.untap=()=>{if(cur&&cur.untap)cur.untap()};
  A.aimed=()=>!!(cur&&cur.aimed&&cur.aimed());
  A.cam=cam;
  // test hooks for the picture house: inject a mic level or recognised words, force the house reel
  A.theaterTest=q=>cur&&cur.test&&cur.test.api?cur.test.api(q):null;
  A.look=(dx,dy)=>{if(cur&&!A.watching&&cur.yaw!==undefined)lookBy(cur,dx,dy,MOVE.roomPitch)};
  // how black the screen overlay should be: fades in at the start, out at the end
  A.fade=()=>cur?Math.max(cur.fade||0,1-ss(0,DOOR_KINDS[A.kind]?.fadeIn||0.7,cur.in)):0;
  A.state=()=>cur;
  A.render=()=>{
    if(!cur)return;
    const sz=renderer.getSize(new THREE.Vector2()),pr=renderer.getPixelRatio();
    cam.aspect=sz.x/Math.max(1,sz.y);
    if(cur.frame)cur.frame();
    cam.updateProjectionMatrix();
    if(composer){
      const key=sz.x+'x'+sz.y+'@'+pr;
      if(key!==viewKey){
        viewKey=key;composer.setPixelRatio(pr);composer.setSize(sz.x,sz.y);
        const px=renderer.getDrawingBufferSize(new THREE.Vector2());
        fxaaPass.uniforms.resolution.value.set(1/Math.max(1,px.x),1/Math.max(1,px.y));
      }
      bloom.strength=cur.bloom;
      blurPass.enabled=(cur.blur||0)>0.01;if(blurPass.enabled){blurPass.uniforms.uAmt.value=cur.blur*10*pr;blurPass.uniforms.uPx.value.set(1/(sz.x*pr),1/(sz.y*pr))}
      composer.render();
    }else renderer.render(scene,cam);
  };
  return A;
}
