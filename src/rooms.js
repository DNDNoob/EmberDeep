// Strange doors: four rooms that are somewhere else entirely.
//   galaxy  you float among stars until the sun collapses and spits you back out, floors deeper
//   kiln    a glass box of falling ember stones; burn enough rows and the door lets you go
//   fall    there is no floor behind the door
//   mirror  you stand behind a one-way mirror, watching a parlor; something comes in and then looks back at you
// Each room owns a small scene of its own, drawn in place of the maze while it runs. To add one: write the room function and add it to KINDS in createRooms.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const ss=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const lerp=(a,b,t)=>a+(b-a)*t;

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
export const KILN={W:7,H:15,need:4,ash:16};
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
      float gr=fb(vec2(q.x*6.0,y*50.0));c=vec3(0.2,0.085,0.05)*(0.7+0.6*gr)*(0.7+0.4*ins);if(y>0.96)c=vec3(0.42,0.22,0.1)*(0.8+0.4*gr);}
    else{float u=q.x/0.26;float st=smoothstep(0.3,0.5,abs(fract(u)-0.5));vec2 d=vec2(abs(fract(u)-0.5),abs(fract(y/0.34)-0.5));float dm=smoothstep(0.17,0.12,d.x+d.y*0.55);
      c=mix(c*0.8,c*1.25,st);c=mix(c,vec3(0.55,0.4,0.15),dm*0.55*(1.0-st));c*=0.75+0.4*fb(q*2.5);}}
  else if(k==4){float row=floor(q.y/0.18),xo=q.x+row*0.73,len=floor(xo/1.4);vec2 id=vec2(len,row);float fx=fract(xo/1.4),fz=fract(q.y/0.18);
    float j=min(min(fz,1.0-fz)*0.18,min(fx,1.0-fx)*1.4);float gr=fb(vec2(q.x*3.0,q.y*60.0)+id*5.0);
    c*=(0.55+0.75*h1(id))*(0.7+0.55*gr)*(0.5+0.5*smoothstep(0.0,0.006,j));
    vec2 r=q-vec2(0.0,-4.1);vec2 dd=abs(r);if(dd.x<2.3&&dd.y<1.45){float e=min(2.3-dd.x,1.45-dd.y);vec3 rc=vec3(0.34,0.05,0.07);float lz=abs(fract((r.x+r.y)*1.7)-0.5)+abs(fract((r.x-r.y)*1.7)-0.5);rc*=0.85+0.35*smoothstep(0.62,0.4,lz);
      if(e<0.2)rc=vec3(0.1,0.09,0.2)*(0.8+0.5*fb(q*30.0));if(e>0.2&&e<0.27)rc=vec3(0.5,0.36,0.12);if(e>0.27&&e<0.45)rc=vec3(0.3,0.05,0.07)*(0.8+0.4*fb(q*12.0));if(e<0.05)rc=vec3(0.5,0.42,0.3);c=rc*(0.8+0.35*fb(q*40.0));}}
  else if(k==5){float g=fb(q*vec2(3.0,42.0));float kn=smoothstep(0.1,0.0,length(fract(q*vec2(0.9,2.2))-0.5)-0.04);c*=(0.6+0.7*g)*(1.0-0.3*kn);}
  else if(k==6){float g=fb(q*vec2(42.0,3.0));c*=(0.6+0.7*g);}
  else if(k==7){float g=fb(q*30.0);c*=0.65+0.55*g+0.15*sin(q.x*70.0)*sin(q.y*70.0);}
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
  for(int i=0;i<4;i++){vec3 L=uLP[i]-vW;float d=length(L);L/=d;float w=max((dot(N,L)+uWrap)/(1.0+uWrap),0.0),at=1.0/(1.0+0.09*d*d);lp+=uLC[i]*w*at;sp+=uLC[i]*at*pow(max(dot(N,normalize(L+V)),0.0),28.0);}
  vec3 B=uBP-vW;float bd=length(B);B/=bd;float bw=max((dot(N,B)+uWrap)/(1.0+uWrap),0.0);vec3 lb=uBC*bw/(1.0+0.3*bd*bd);
  vec3 lit=mix(uAmbB+lb+lp*0.1,uAmbP+lp,zp);
  vec3 col=c*lit*uLit+sp*uSpec*mix(0.08,1.0,zp)+c*uGlow;
  float rim=pow(1.0-max(dot(N,V),0.0),3.0);col+=uRimC*rim*uRim*mix(0.5,1.0,zp)*uLit;
  gl_FragColor=vec4(col,uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PANE_FS=`uniform vec4 uH[10];uniform float uK,uT;varying vec2 vP;
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
  float band=exp(-pow((p.x*0.7+p.y*0.45-0.15+0.2*sin(uT*0.2))*2.6,2.0));
  float edge=smoothstep(0.7,0.0,min(1.55-abs(p.x),1.065-abs(p.y)));
  float tar=smoothstep(0.58,0.7,fb(p*4.0+2.0));
  float a=0.05+0.07*band+0.1*edge+0.1*tar;
  vec3 col=mix(vec3(0.78,0.84,0.92),vec3(0.22,0.19,0.16),tar*0.7);
  float cr=cracks(p);
  col=mix(col,vec3(1.1,1.15,1.25),cr);a=clamp(a+cr*0.6,0.0,0.9);
  gl_FragColor=vec4(col,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createRooms(renderer,o0){
  // a watcher is not the one in the room: no speech or shaking for them, and a fast-forward makes no sound
  const o=Object.assign({},o0,{say:(...a)=>{if(!A.watching)o0.say(...a)},rumble:(...a)=>{if(!A.watching)o0.rumble(...a)},
    tone:(...a)=>{if(!A.mute)o0.tone(...a)},noise:(...a)=>{if(!A.mute)o0.noise(...a)},hint:k=>A.watching?A.label:o0.hint(k)});
  const nf=v=>typeof v==='number'&&isFinite(v),Z={l:0,r:0,d:0,rot:0,drop:0,lx:0,ly:0};
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(72,1,0.05,2000);
  scene.background=new THREE.Color(0x000000);
  let composer=null,bloom=null,blurPass=null,viewKey='',cur=null,group=null,done=null,held=false;
  const A={active:false,kind:'',watching:false,label:'',mute:0};
  const glowTex=canvasTex(128,128,(c,w)=>{const g=c.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.25,'rgba(255,255,255,0.45)');g.addColorStop(0.6,'rgba(255,255,255,0.08)');g.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=g;c.fillRect(0,0,w,w)});
  const glow=(col,size,op)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:col,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:op===undefined?1:op}));s.scale.setScalar(size);return s};
  function setup(){
    if(o.post&&!composer){
      composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType}));
      composer.addPass(new RenderPass(scene,cam));
      // a soft blur for burning eyes, off unless a room asks for it
      blurPass=new ShaderPass({uniforms:{tDiffuse:{value:null},uAmt:{value:0},uPx:{value:new THREE.Vector2(1,1)}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:'uniform sampler2D tDiffuse;uniform float uAmt;uniform vec2 uPx;varying vec2 vUv;void main(){vec4 s=vec4(0.0);for(int i=0;i<16;i++){float a=float(i)*2.39996,r=sqrt((float(i)+0.5)/16.0)*uAmt;s+=texture2D(tDiffuse,vUv+vec2(cos(a),sin(a))*r*uPx);}gl_FragColor=s/16.0;}'});
      blurPass.enabled=false;composer.addPass(blurPass);
      bloom=new UnrealBloomPass(new THREE.Vector2(4,4),0.9,0.6,0.8);composer.addPass(bloom);
      composer.addPass(new OutputPass());viewKey='';
    }
    group=new THREE.Group();scene.add(group);
  }
  function clear(){
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
      S.yaw+=inp.lx*1.6*dt;S.pitch=clamp(S.pitch-inp.ly*1.4*dt,-1.2,1.2);
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

  /* ---------- the glass kiln ---------- */
  function kiln(){
    const {W,H}=KILN,C=0.5,S={t:0,prev:null,rep:0,repDir:0,softT:0,endT:0,shake:0};
    const K=S.K=kilnGame(Math.random);
    cam.fov=52;cam.near=0.1;cam.far=200;
    scene.fog=new THREE.FogExp2(0x000000,0.028);
    const stone=canvasTex(256,256,(c,w)=>{c.fillStyle='#2b2722';c.fillRect(0,0,w,w);
      for(let r=0;r<4;r++)for(let q=-1;q<3;q++){const x=q*128+(r&1?64:0),y=r*64,k=0.7+rnd()*0.5;c.fillStyle=`rgb(${Math.round(70*k)},${Math.round(62*k)},${Math.round(54*k)})`;c.fillRect(x+3,y+3,122,58)}},true);
    stone.repeat.set(6,4);
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(40,24),new THREE.MeshStandardMaterial({map:stone,roughness:0.95}));wall.position.set(0,8,-3);group.add(wall);
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(40,20),new THREE.MeshStandardMaterial({map:stone,roughness:0.9}));fl.rotation.x=-Math.PI/2;fl.position.set(0,-0.3,4);group.add(fl);
    const bw=W*C,bh=H*C;
    // iron plinth and cap, glass between
    const iron=new THREE.MeshStandardMaterial({color:0x2a2622,roughness:0.6,metalness:0.7});
    const base=new THREE.Mesh(new THREE.BoxGeometry(bw+0.5,0.3,1.1),iron);base.position.set(0,-0.15,0);group.add(base);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(bw+0.5,0.25,1.1),iron);cap.position.set(0,bh+0.125,0);group.add(cap);
    const glassBox=new THREE.BoxGeometry(bw,bh,C*1.3);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(glassBox),new THREE.LineBasicMaterial({color:new THREE.Color(0.6,0.95,1.3)}));edges.position.set(0,bh/2,0);group.add(edges);
    const sheen=canvasTex(64,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(0.45,'rgba(255,255,255,0.5)');g.addColorStop(0.55,'rgba(255,255,255,0.05)');g.addColorStop(1,'rgba(255,255,255,0.25)');c.fillStyle=g;c.fillRect(0,0,w,h)});
    S.glass=new THREE.Mesh(new THREE.PlaneGeometry(bw,bh),new THREE.MeshBasicMaterial({map:sheen,color:0x9fd8ff,transparent:true,opacity:0.07,depthWrite:false,blending:THREE.AdditiveBlending}));
    S.glass.position.set(0,bh/2,C*0.66);group.add(S.glass);
    const back=new THREE.Mesh(new THREE.PlaneGeometry(bw,bh),new THREE.MeshBasicMaterial({color:0x06080a}));back.position.set(0,bh/2,-C*0.66);group.add(back);
    // the sealed door beside it, with one rune for each row that must burn
    const doorM=new THREE.Mesh(new THREE.BoxGeometry(1.5,2.6,0.2),new THREE.MeshStandardMaterial({color:0x3a2a1c,roughness:0.8}));
    S.doorX=bw/2+1.7;doorM.position.set(S.doorX,1.0,-2.6);group.add(doorM);S.door=doorM;
    S.runes=[];
    for(let i=0;i<KILN.need;i++){const r=new THREE.Mesh(new THREE.OctahedronGeometry(0.13),new THREE.MeshBasicMaterial({color:0x221a14}));r.position.set(S.doorX-0.45+i*0.3,2.6,-2.45);group.add(r);S.runes.push(r)}
    // stones: bright faces with a dark rim, coloured per cell
    const tile=canvasTex(64,64,(c,w)=>{c.fillStyle='#000';c.fillRect(0,0,w,w);const g=c.createRadialGradient(w/2,w/2,2,w/2,w/2,w*0.62);g.addColorStop(0,'#fff');g.addColorStop(0.7,'#b9b9b9');g.addColorStop(1,'#3a3a3a');c.fillStyle=g;c.fillRect(4,4,w-8,w-8);
      c.strokeStyle='rgba(0,0,0,0.5)';c.lineWidth=2;c.beginPath();c.moveTo(12,20);c.lineTo(28,30);c.lineTo(22,48);c.moveTo(28,30);c.lineTo(50,24);c.stroke()});
    const MAXI=W*H+12;
    S.inst=new THREE.InstancedMesh(new THREE.BoxGeometry(C*0.94,C*0.94,C*0.94),new THREE.MeshBasicMaterial({map:tile}),MAXI);
    S.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);S.inst.frustumCulled=false;group.add(S.inst);
    S.ghost=new THREE.InstancedMesh(new THREE.BoxGeometry(C*0.9,C*0.9,C*0.3),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.13,depthWrite:false}),4);
    S.ghost.frustumCulled=false;group.add(S.ghost);
    const COL=[null,[2.6,0.75,0.16],[2.4,1.5,0.3],[2.3,0.3,0.22],[0.2,0.2,0.23]];
    S.l1=new THREE.PointLight(0xff8a40,60,22,1.6);S.l1.position.set(0,bh*0.4,3);group.add(S.l1);
    const l2=new THREE.PointLight(0x7fb8ff,30,30,1.6);l2.position.set(-6,9,5);group.add(l2);
    group.add(new THREE.AmbientLight(0x30303a,0.7));
    const M=new THREE.Matrix4(),col=new THREE.Color();
    const X=x=>(x-W/2+0.5)*C,Y=y=>(y+0.5)*C;
    const draw=()=>{
      let n=0;const put=(x,y,c,k,z)=>{if(n>=MAXI)return;M.makeTranslation(x,y,z||0);S.inst.setMatrixAt(n,M);col.setRGB(c[0]*k,c[1]*k,c[2]*k);S.inst.setColorAt(n,col);n++};
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
      if(K.next&&!K.over)for(const q of K.next.c)put(-bw/2-1.5+q[0]*C,bh-1.3+q[1]*C,COL[K.next.col],0.7,-0.3);
      S.inst.count=n;S.inst.instanceMatrix.needsUpdate=true;if(S.inst.instanceColor)S.inst.instanceColor.needsUpdate=true;
      S.ghost.count=gn;S.ghost.instanceMatrix.needsUpdate=true;
    };
    const hud=()=>o.hud(K.over==='win'?'<b>The glass parts.</b>':K.over==='dead'?'<b>The kiln is full.</b>':
      `<b>THE GLASS KILN</b><br>Rows burned <b>${K.cleared} / ${KILN.need}</b> &nbsp;·&nbsp; ash rises in ${Math.max(0,Math.ceil(K.ashT))}s<br><small>${o.hint()}</small>`);
    const landed=n=>{
      if(n<0)return;
      if(n>0){o.tone(330,0.25,'triangle',0.2);o.tone(495,0.3,'triangle',0.18,0.08);o.tone(660,0.4,'triangle',0.16,0.16);o.noise(0.35,0.25,2400,0.8);o.rumble(160,0.5,0.6);S.shake=0.25}
      else{o.tone(110,0.09,'square',0.1,0,-30);o.rumble(50,0.2,0.3)}
      S.softT=0;
    };
    S.update=(dt,inp)=>{
      S.t+=dt;
      for(const f of K.flash)f.t-=dt;
      if(S.shake>0)S.shake-=dt;
      if(K.over){
        if(S.endT===0){
          if(K.over==='win'){o.tone(392,0.5,'sine',0.2);o.tone(523,0.6,'sine',0.2,0.15);o.tone(784,0.9,'sine',0.2,0.3);o.noise(0.9,0.2,1800,0.6)}
          else{o.tone(90,0.9,'sawtooth',0.3,0,-50);o.noise(0.8,0.5,220,0.8);o.rumble(500,1,0.8);S.shake=0.7}
        }
        S.endT+=dt;
        if(K.over==='win'){S.door.position.x=S.doorX+ss(0.2,1.5,S.endT)*1.7;S.glass.material.opacity=0.07*(1-ss(0,1,S.endT))}
        S.fade=ss(K.over==='win'?1.4:1.1,K.over==='win'?2.0:1.7,S.endT);
        hud();draw();
        if(S.endT>(K.over==='win'?2.0:1.7))finish({k:K.over==='win'?'win':'dead',why:'kiln'});
        return;
      }
      if(A.watching){
        // the watcher only draws what the player's last snapshot said; the rules run on the player's side
        for(let i=0;i<S.runes.length;i++)S.runes[i].material.color.setRGB(i<K.cleared?3:0.13,i<K.cleared?1.8:0.1,i<K.cleared?0.5:0.08);
        K.ashT-=dt;S.l1.intensity=60*(1+Math.sin(S.t*9)*0.05);hud();draw();return;
      }
      const P0=S.prev||inp;S.prev={l:inp.l,r:inp.r,d:inp.d,rot:inp.rot,drop:inp.drop};
      if(S.t>0.5){
        const dir=(inp.r?1:0)-(inp.l?1:0);
        if(dir!==S.repDir){S.repDir=dir;S.rep=0.19;if(dir&&K.move(dir))o.tone(520,0.03,'square',0.04)}
        else if(dir){S.rep-=dt;if(S.rep<=0){S.rep=0.06;if(K.move(dir))o.tone(520,0.03,'square',0.04)}}
        if(inp.rot&&!P0.rot&&K.rotate())o.tone(700,0.05,'triangle',0.07);
        if(inp.drop&&!P0.drop){landed(K.drop());S.shake=Math.max(S.shake,0.08)}
        else{
          K.fallT+=dt;const iv=inp.d?0.045:Math.max(0.28,0.72-K.cleared*0.07);
          if(K.fallT>=iv){K.fallT=0;landed(K.step())}
        }
        K.ashT-=dt;
        if(K.ashT<=0&&!K.over){K.ashT=KILN.ash;K.rise();o.noise(0.5,0.3,260,0.9);o.tone(80,0.4,'sawtooth',0.15,0,-20);S.shake=0.2}
      }
      for(let i=0;i<S.runes.length;i++)S.runes[i].material.color.setRGB(i<K.cleared?3:0.13,i<K.cleared?1.8:0.1,i<K.cleared?0.5:0.08);
      S.l1.intensity=60*(1+Math.sin(S.t*9)*0.05);
      hud();draw();
    };
    S.snap=()=>{const p=K.piece,n=K.next,fl=[];for(const f of K.flash)if(f.t>0)fl.push([f.y,+f.t.toFixed(2)]);
      return {g:Array.from(K.g).join(''),p:p?[p.col,p.x,p.y,p.c.flat()]:null,n:n?[n.col,n.c.flat()]:null,cl:K.cleared,a:+K.ashT.toFixed(1),o:K.over,f:fl,e:+S.endT.toFixed(2)}};
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
    };
    S.frame=()=>{
      // stand back far enough that the whole box fits, on a wide screen or a tall phone
      const th=Math.tan(cam.fov*Math.PI/360),dv=(bh/2+0.9)/th,dh=(bw/2+2.3)/(th*cam.aspect),d=Math.max(dv,dh);
      const sh=S.shake>0?S.shake*0.25:0;
      cam.position.set((Math.random()-0.5)*sh,bh/2+0.1+(Math.random()-0.5)*sh,d);cam.rotation.set(0,0,0);
    };
    draw();hud();
    S.bloom=0.55;
    return S;
  }

  /* ---------- behind the mirror ---------- */
  // you stand in the back room of a one-way mirror; the timeline (seconds) is fixed, only the smashing and your choice move
  const MIR={ENTER:17,K:[19,20.9,22.7],STOP:23.7,HEAD:24.4,BODY:26.6,WALK:28.2,SMASH:30.6,CAN:31.2,CHOICE:32.2,NB:13,BREAK:14,SZ:-4.1,LOOK:0.8};
  function mirror(){
    const LOW=!!o.low,TAU=Math.PI*2,S={t:0,yaw:0,pitch:0.02,said:0,ch:0,ct:-1,bt:-1,sm:0,sel:-1,prev:null,lk:0,shk:0,leaveT:-1,want:null,touch:false,nb:0,blind:0,ph:'watch'};
    cam.fov=66;cam.near=0.05;cam.far=60;
    const wrap=a=>{a%=TAU;return a>Math.PI?a-TAU:a<-Math.PI?a+TAU:a},ang=(dx,dz)=>Math.atan2(dx,dz),nrm=(x,z)=>{const l=Math.hypot(x,z)||1;return[x/l,z/l]};
    const CC=c=>Array.isArray(c)?new THREE.Color().setRGB(c[0],c[1],c[2]):new THREE.Color(c);
    // ---- one small lit shader for everything: wrap light, two zones (parlor / back room), fresnel rim, world-space patterns ----
    const LU={uLP:{value:[0,1,2,3].map(()=>new THREE.Vector3())},uLC:{value:[0,1,2,3].map(()=>new THREE.Vector3())},uBP:{value:new THREE.Vector3(0.5,2.4,0.6)},uBC:{value:new THREE.Vector3(0.5,0.62,0.9)},
      uAmbP:{value:new THREE.Vector3(0.05,0.03,0.02)},uAmbB:{value:new THREE.Vector3(0.022,0.03,0.05)},uWallZ:{value:-1.9}};
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
    const WZ=-1.9,PW=1.55,PY0=0.42,PY1=2.55;   // glass wall plane, half width of the pane, bottom and top of the pane
    const plas=lit(0x59595c,{pat:1,rim:0.25,rc:[0.1,0.14,0.22],wrap:0.5}),flo=lit(0x454750,{pat:2,rim:0.2,rc:[0.1,0.14,0.22],wrap:0.5,sp:0.05}),ceil=lit(0x3a3b40,{pat:1,wrap:0.5});
    const BX=2.3,BZ=2.8,BH=2.9;
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
    const PX=3.7,PZ=-6.8,PH=3.4,paper=lit(0x5a1618,{pat:3,rim:0.15,rc:[0.5,0.3,0.15],wrap:0.5}),pfl=lit(0x6a4a2c,{pat:4,rim:0.2,rc:[0.5,0.3,0.15],wrap:0.5,sp:0.25}),pce=lit(0x6e6252,{wrap:0.5});
    plane(group,pfl,0,0,(WZ+PZ)/2-0.15,PX*2,PZ-WZ,-Math.PI/2);plane(group,pce,0,PH,(WZ+PZ)/2-0.15,PX*2,PZ-WZ,Math.PI/2);
    plane(group,paper,-PX,PH/2,(WZ+PZ)/2-0.15,WZ-PZ,PH,0,Math.PI/2);plane(group,paper,PX,PH/2,(WZ+PZ)/2-0.15,WZ-PZ,PH,0,-Math.PI/2);
    const DX=2.3;   // the far door
    box(group,paper,(-PX+DX-0.55)/2,PH/2,PZ-0.1,DX-0.55+PX,PH,0.2);box(group,paper,(PX+DX+0.55)/2,PH/2,PZ-0.1,PX-DX-0.55,PH,0.2);box(group,paper,DX,(2.3+PH)/2,PZ-0.1,1.1,PH-2.3,0.2);
    box(group,lit(0x000000,{lit:0}),DX,1.2,PZ-0.9,1.1,2.4,1.2);
    for(const s of[-1,1])box(group,gilt,DX+s*0.58,1.18,PZ+0.0,0.08,2.36,0.1);box(group,gilt,DX,2.34,PZ,1.24,0.08,0.1);
    S.door=grp(group,DX-0.55,0,PZ+0.02);box(S.door,lit(0x3a1f12,{pat:6,rim:0.4,rc:[0.5,0.3,0.15],sp:0.3}),0.55,1.15,0,1.1,2.3,0.07);ball(S.door,gilt,0.95,1.1,0.06,0.03,0.03,0.03);
    // furniture
    const cloth=lit(0xa99d86,{rim:0.4,rc:[0.5,0.35,0.2],wrap:0.6}),dwood=lit(0x3a2112,{rim:0.5,rc:[0.6,0.35,0.15],sp:0.5,wrap:0.3}),china=lit(0xb8b2a2,{rim:0.4,rc:[0.5,0.4,0.3],sp:0.6});
    const TX=-1.0,TZ=-4.3;
    cyl(group,dwood,TX,0.37,TZ,0.07,0.13,0.74);cyl(group,dwood,TX,0.76,TZ,0.62,0.62,0.04,20);cyl(group,cloth,TX,0.6,TZ,0.6,0.72,0.34,20);cyl(group,cloth,TX,0.775,TZ,0.6,0.6,0.012,20);
    cyl(group,china,TX+0.1,0.82,TZ-0.05,0.07,0.05,0.07);ball(group,china,TX-0.25,0.84,TZ+0.1,0.09,0.08,0.09);cyl(group,china,TX+0.3,0.805,TZ+0.18,0.04,0.03,0.04);cyl(group,china,TX-0.1,0.805,TZ-0.3,0.04,0.03,0.04);
    const chair=(x,z,yaw)=>{const c=grp(group,x,0,z);c.rotation.y=yaw;box(c,dwood,0,0.45,0,0.44,0.05,0.44);box(c,dwood,0,0.78,-0.21,0.44,0.62,0.04);
      for(const a of[-1,1])for(const b of[-1,1])cyl(c,dwood,a*0.19,0.22,b*0.19,0.02,0.018,0.44);box(c,lit(0x3a1a2a,{rim:0.4,rc:[0.5,0.3,0.2],wrap:0.5}),0,0.485,0,0.38,0.03,0.38);return c};
    S.chairA=chair(TX,TZ-1.05,0);S.chairB=chair(TX-0.9,TZ+0.1,Math.PI/2);
    box(group,dwood,-2.2,0.45,-6.45,1.5,0.9,0.5);box(group,gilt,-2.2,0.92,-6.45,1.56,0.04,0.54);
    box(group,lit(0x203826,{rim:0.4,rc:[0.5,0.4,0.2],wrap:0.4}),0.5,0.3,-6.4,1.3,0.6,0.55);
    const lamp=(x,z,i)=>{const L={};cyl(group,dwood,x,0.04,z,0.2,0.22,0.08);cyl(group,dwood,x,0.85,z,0.025,0.025,1.6);
      L.shade=cyl(group,lit([2.3,1.35,0.55],{lit:0,glow:1,u:1,dbl:1}),x,1.75,z,0.12,0.25,0.34,12);L.g=glow(0xffa550,2.2,0.5);L.g.position.set(x,1.75,z);group.add(L.g);return L};
    S.lampA=lamp(-3.1,-3.0);S.lampB=lamp(3.15,-3.6);
    // a chandelier over the table, and the candles on the sideboard
    cyl(group,iron,TX,3.3,TZ,0.01,0.01,0.8);cyl(group,gilt,TX,2.9,TZ,0.28,0.28,0.04,14);S.chFl=[];
    for(let i=0;i<6;i++){const a=i/6*TAU;cyl(group,china,TX+Math.cos(a)*0.28,2.97,TZ+Math.sin(a)*0.28,0.015,0.015,0.1);S.chFl.push(ball(group,lit([3,1.9,0.7],{lit:0,glow:1,u:1}),TX+Math.cos(a)*0.28,3.06,TZ+Math.sin(a)*0.28,0.015,0.03,0.015))}
    S.chG=glow(0xffb060,1.1,0.3);S.chG.position.set(TX,3.05,TZ);group.add(S.chG);
    S.candle=ball(group,lit([3,1.9,0.7],{lit:0,glow:1,u:1}),-2.2,1.07,-6.45,0.02,0.04,0.02);S.candleG=glow(0xffb060,0.9,0.5);S.candleG.position.set(-2.2,1.1,-6.45);group.add(S.candleG);
    // pictures and a clock
    for(const q of[[-2.9,1.95],[0.55,1.95]]){const c=lit([0.06+rnd()*0.1,0.1+rnd()*0.08,0.1+rnd()*0.1],{rim:0.3,rc:[0.4,0.3,0.2]});box(group,gilt,q[0],q[1],PZ+0.03,0.86,0.66,0.05);box(group,c,q[0],q[1],PZ+0.065,0.72,0.52,0.02)}
    cyl(group,gilt,-1.0,2.5,PZ+0.04,0.24,0.24,0.04,16).rotation.x=Math.PI/2;cyl(group,china,-1.0,2.5,PZ+0.065,0.2,0.2,0.02,16).rotation.x=Math.PI/2;
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
    const peps=[{c:{skin:0xd7a98a,hair:0xc9c4bc,top:0x3a1f33,bot:0x3a1f33,collar:0xeee6d6,dress:1,bun:1,seed:1.3,h:0.97}},
      {c:{skin:0xe2b698,hair:0x2a1a12,top:0x1f6a4a,bot:0x1f6a4a,collar:0xf2ead8,dress:1,bun:1,seed:2.1,h:1.0}},
      {c:{skin:0xc99876,hair:0x1c140f,top:0xe6dfd0,bot:0x2a2a30,vest:0x5a1d26,tie:0x1a1a1a,beard:1,seed:0.4,h:1.06}}];
    for(const e of peps){e.p=person(e.c);group.add(e.p.R)}
    const [W1,W2,M1]=peps.map(e=>e.p);
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
      const e=q.e===undefined?0.2:q.e;mon.eye.uniforms.uCol.value.setRGB(4*e,3.2*e,1.2*e);for(const g of mon.glows){g.material.opacity=0.55*Math.min(1,e);g.scale.setScalar(0.2+0.2*Math.min(e,1.5))}
    };
    // ---- the glass ----
    const HP=[[0.1,0.3],[-0.55,0.55],[0.65,0.25],[-0.2,-0.2],[0.4,0.65],[-0.8,0.1],[0.9,0.5],[0.0,0.8],[-0.45,0.85],[0.75,-0.1]];
    const hits=[...Array(10)].map((_,i)=>new THREE.Vector4(HP[i][0],HP[i][1]+0.1,0,rnd()));S.hitT=[];
    S.pane=new THREE.Mesh(new THREE.PlaneGeometry(PW*2,PY1-PY0),new THREE.ShaderMaterial({uniforms:{uH:{value:hits},uK:{value:0},uT:{value:0}},transparent:true,depthWrite:false,vertexShader:'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:PANE_FS}));
    S.pane.position.set(0,(PY0+PY1)/2,WZ-0.04);S.pane.renderOrder=5;group.add(S.pane);
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
    // ---- the can, on the floor and in your hand ----
    const label=canvasTex(512,256,(c,w,h)=>{c.fillStyle='#b3200f';c.fillRect(0,0,w,h);const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(255,200,80,.55)');g.addColorStop(0.5,'rgba(255,120,30,0)');g.addColorStop(1,'rgba(0,0,0,.45)');c.fillStyle=g;c.fillRect(0,0,w,h);
      c.fillStyle='#ffe9c0';c.fillRect(w*0.25,0,w*0.5,h);c.fillStyle='#c4200a';c.fillRect(w*0.26,8,w*0.48,h-16);c.fillStyle='#fff3d6';c.textAlign='center';c.textBaseline='middle';c.font='bold 62px Arial Black,Impact,sans-serif';c.fillText('PEPPER',w*0.5,h*0.36);
      c.font='bold 52px Arial Black,Impact,sans-serif';c.fillText('SPRAY',w*0.5,h*0.62);c.font='bold 22px Arial,sans-serif';c.fillText('MAX STRENGTH · STREAM',w*0.5,h*0.84);
      c.fillStyle='#ffb52a';c.beginPath();c.moveTo(w*0.5,h*0.04);c.bezierCurveTo(w*0.56,h*0.14,w*0.52,h*0.2,w*0.5,h*0.22);c.bezierCurveTo(w*0.48,h*0.2,w*0.44,h*0.14,w*0.5,h*0.04);c.fill()});
    const canMat=lit(0xffffff,{map:label,glow:0.85,rim:0.8,rc:[1.0,0.6,0.3],sp:0.4,wrap:0.5}),canTop=lit(0x16161a,{rim:1.0,rc:[0.8,0.8,1],sp:0.6});
    const makeCan=()=>{const g=new THREE.Group(),s=grp(g);cyl(s,canMat,0,0,0,0.05,0.05,0.26,16);cyl(s,iron,0,0.145,0,0.036,0.05,0.03,16);cyl(s,canTop,0,0.19,0,0.034,0.034,0.06,12);box(s,canTop,0.0,0.225,0.02,0.02,0.02,0.045);cyl(s,lit(0xc01a10,{rim:0.6,rc:[1,0.5,0.3]}),0.03,0.21,-0.0,0.012,0.012,0.04);g.spin=s;return g};
    S.can=makeCan();S.can.visible=false;S.can.scale.setScalar(1.8);S.can.rotation.set(0,0.3,Math.PI/2);S.can.position.set(0.2,0.07,-0.65);group.add(S.can);
    S.canG=glow(0xff7a30,0.55,0.0);S.canG.position.set(0.2,0.1,-0.65);group.add(S.canG);
    S.hand=new THREE.Group();S.hand.visible=false;group.add(S.hand);
    {const skin=lit(0xd2a085,{rim:0.9,rc:[0.8,0.5,0.4],wrap:0.5}),sl=lit(0x2a2f3a,{rim:0.6,rc:[0.4,0.5,0.8]});
      const a=cyl(S.hand,sl,0.34,-0.5,-0.4,0.07,0.06,0.9);a.rotation.set(1.0,0,-0.35);ball(S.hand,skin,0.2,-0.2,-0.58,0.075,0.07,0.1);
      S.handCan=makeCan();S.handCan.position.set(0.2,-0.2,-0.58);S.hand.add(S.handCan);for(let i=0;i<3;i++)ball(S.hand,skin,0.14+i*0.04,-0.16,-0.52-i*0.02,0.02,0.02,0.035)}
    S.hand.userData.cam=true;
    // lights
    const WARM=[1.0,0.62,0.32];
    LU.uLP.value[0].set(-3.1,1.75,-3.0);LU.uLP.value[1].set(3.15,1.75,-3.6);LU.uLP.value[2].set(TX,2.6,TZ);LU.uLP.value[3].set(-2.2,1.4,-6.3);
    const LI=[1.15,1.15,1.35,0.7];
    const setLights=t=>{
      let a=1,b=1,c=1,d=1;
      const flick=ss(MIR.ENTER-0.1,MIR.ENTER,t)*(1-ss(MIR.ENTER+3.5,MIR.ENTER+4.5,t));
      const fk=k=>1-flick*(0.5+0.5*Math.sin(t*(31+k*7)+Math.sin(t*13+k)*4))*0.8*(Math.sin(t*(7+k*3))>-0.2?1:0.25);
      a=fk(0);b=fk(1);c=fk(2);d=fk(3);
      b*=1-ss(21.2,21.5,t);a*=1-0.65*ss(22.9,23.2,t);c*=1-0.4*ss(23.2,23.6,t);d*=1-0.5*ss(22.0,22.3,t);
      const k=[a,b,c,d];for(let i=0;i<4;i++){const I=LI[i]*k[i];LU.uLC.value[i].set(WARM[0]*I,WARM[1]*I,WARM[2]*I)}
      const sw=Math.sin(t*0.9)*0.02;S.lampA.shade.material.uniforms.uCol.value.setRGB(2.3*a,1.35*a,0.55*a);S.lampB.shade.material.uniforms.uCol.value.setRGB(2.3*b,1.35*b,0.55*b);
      S.lampA.g.material.opacity=0.5*a;S.lampB.g.material.opacity=0.5*b;S.chG.material.opacity=0.3*c;S.candleG.material.opacity=0.5*d;
      for(const f of S.chFl)f.material.uniforms.uCol.value.setRGB(3*c,1.9*c,0.7*c);S.candle.material.uniforms.uCol.value.setRGB(3*d,1.9*d,0.7*d);
      return[a,b,c,d];
    };
    // ---- how the people and the thing move: all of it a function of the clock ----
    const pace=t=>{const sp=0.62,L=2.7,u=((t*sp)%(2*L)+2*L)%(2*L),d=u<L?u:2*L-u,sn=Math.sin(Math.PI*u/L);return{x:2.3-d,z:-3.3,yaw:-Math.PI/2*Math.tanh(sn*5),wa:Math.min(1,Math.abs(sn)*4),w:t*sp*5.2}};
    const MP0=pace(MIR.ENTER),V1=[MP0.x,-3.3],V2=[-2.0,-3.9],V3=[TX,TZ-1.05];
    const PA=[DX,-7.6],PB=[DX,-6.0];
    const near=(v,from,dd)=>{const n=nrm(from[0]-v[0],from[1]-v[1]);return[v[0]+n[0]*dd,v[1]+n[1]*dd]};
    const MA=near(V1,PB,1.25),MB=near(V2,MA,1.3),MC=[V3[0]+1.2,V3[1]-0.2];
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
      const ph=[];
      // ---- the monster's path ----
      let m={x:99,z:99,yaw:0,w:0,wa:0,e:0.2,jaw:0};
      const ET=MIR.ENTER+0.35;
      if(t>=ET){
        let p,yw=null,wa=1;
        if(t<18.2){p=sg(t,ET,18.2,PA,PB);yw=ang(PB[0]-PA[0],PB[1]-PA[1])}
        else if(t<19){p=sg(t,18.2,19,PB,MA);yw=ang(V1[0]-PB[0],V1[1]-PB[1])}
        else if(t<MIR.K[1]-0.05){p=sg(t,MIR.K[0]+0.1,MIR.K[1]-0.05,MA,MB);yw=ang(V2[0]-MA[0],V2[1]-MA[1])}
        else if(t<MIR.K[2]-0.05){p=sg(t,MIR.K[1]+0.1,MIR.K[2]-0.05,MB,MC);yw=ang(V3[0]-MB[0],V3[1]-MB[1])}
        else if(t<MIR.WALK){p=MC;yw=ang(V3[0]-MC[0],V3[1]-MC[1])}
        else{p=sg(t,MIR.WALK,MIR.SMASH-0.3,MC,G0);yw=null}
        const moving=(t<19&&t>=ET)||(t>MIR.K[0]+0.1&&t<MIR.K[1]-0.05)||(t>MIR.K[1]+0.1&&t<MIR.K[2]-0.05)||(t>=MIR.WALK&&t<MIR.SMASH-0.3);
        m.x=p[0];m.z=p[1];m.yaw=yw===null?lerp(ang(V3[0]-MC[0],V3[1]-MC[1]),0,ss(MIR.WALK,MIR.WALK+0.8,t)):yw;m.w=t*7.2;m.wa=moving?1:0;
        // strikes
        for(let i=0;i<3;i++){const dt=t-MIR.K[i];if(dt>-0.55&&dt<0.5){const u=dt<0?ss(-0.55,0,dt):1-ss(0,0.5,dt);m[i%2?'aL':'aR']=[lerp(0.1,i===1?2.7:2.9,Math.min(1,ss(-0.55,-0.1,dt)))*(dt<0?1:1-ss(0,0.08,dt)*0.55),0.2,0.25];m.lean=0.45+0.5*(dt<0?0:1-ss(0,0.45,dt))+0.2*(dt<0?ss(-0.55,0,dt):0);m.ty=0}}
        m.e=0.35+0.2*ss(MIR.ENTER+1,MIR.ENTER+2,t);
        if(t>=MIR.STOP){m.wa=0;m.e=0.3}
        // the long turn: head first, then the rest
        if(t>=MIR.HEAD&&t<MIR.WALK){const base=ang(V3[0]-MC[0],V3[1]-MC[1]),toGlass=wrap(0-base),hk=ss(MIR.HEAD,MIR.HEAD+2.8,t),bk=ss(MIR.BODY,MIR.BODY+1.9,t);
          m.hy=clamp(toGlass,-2.5,2.5)*hk*(1-bk*0.0)-toGlass*bk;m.yaw=base+toGlass*bk;m.hy=clamp(toGlass*hk-toGlass*bk,-2.6,2.6)+Math.sin(t*3)*0.03*hk*(1-bk);m.hp=0.12*hk;
          m.e=0.3+1.2*ss(MIR.HEAD+2.0,MIR.HEAD+3.3,t);m.sag=0}
        if(t>=MIR.WALK){m.e=1.5;m.wa=t<MIR.SMASH-0.3?1:0;m.hy=0}
        if(t>=MIR.SMASH-0.3){m.x=G0[0];m.z=G0[1];m.yaw=0;m.lean=0.5}
      }
      return m;
    };
    // ---- update ----
    let T0=0;const at=x=>T0<x&&S.t>=x;
    S.update=(dt,inp)=>{
      T0=S.t;S.t+=dt;const t=S.t,W=A.watching,hold=S.ch===2?t-S.ct:-1;
      S.yaw=clamp(S.yaw+inp.lx*1.6*dt,-3.3,3.3);S.pitch=clamp(S.pitch-inp.ly*1.4*dt,-1.25,1.0);S.touch=!!inp.touch;
      const say=(x,s,d)=>{if(at(x))o.say(s,d||3.5)};
      say(1.0,'A mirror. There are people in it.',3.5);say(8.7,'She leans in and fixes her collar. She looks straight through you.',4);say(13.3,'You have no reflection. You are standing behind the glass.',4.2);
      say(25.6,'It turns. It can see you.',3.2);say(MIR.SMASH+0.4,'It is coming through the glass.',3);say(MIR.CAN+0.1,'Something rolls against your foot.',3.2);
      // sound of the parlor
      if(at(MIR.ENTER)){o.noise(0.5,0.8,180,0.6);o.tone(55,0.7,'sawtooth',0.35,0,-25);o.rumble(500,1,0.8);S.shk=Math.max(S.shk,0.25)}
      for(let i=0;i<3;i++)if(at(MIR.K[i])){o.noise(0.35,0.7,260,0.7);o.tone(80,0.35,'square',0.3,0,-45);o.tone(45,0.6,'sine',0.35,0.05,-15);o.rumble(350,1,0.9);S.shk=Math.max(S.shk,0.3)}
      for(const x of [19.6,21.5,22.9])if(at(x))o.noise(0.3,0.5,150,0.7);
      for(const x of [18.4,18.9,19.7,20.2,21.0,21.4,22.0,22.3])if(at(x)){o.tone(50,0.14,'sine',0.25);o.noise(0.14,0.25,110,0.8)}
      if(at(21.3))o.tone(2000,0.2,'triangle',0.05,0,-1500);
      if(at(MIR.HEAD)){o.tone(62,2.8,'sawtooth',0.1,0,-14)}if(at(MIR.HEAD+2.4)){o.tone(150,1.4,'sine',0.14,0,40)}
      if(at(MIR.WALK))for(let i=0;i<5;i++)o.tone(46,0.13,'sine',0.22,i*0.42);
      if(t<MIR.WALK&&t>MIR.ENTER&&Math.random()<dt*0.5)o.noise(0.08,0.1,3000,2);
      // is the thing looked at?
      const mp=S.pose(t),cp=Math.cos(S.pitch),fx=Math.sin(S.yaw)*cp,fy=Math.sin(S.pitch),fz=-Math.cos(S.yaw)*cp;
      let dx=mp.x-0,dy=2.2-1.6,dz=mp.z-0.1;const dl=Math.hypot(dx,dy,dz)||1;
      const seen=(dx*fx+dy*fy+dz*fz)/dl>MIR.LOOK&&t>=MIR.WALK;S.lk=lerp(S.lk,seen?1:0,Math.min(1,dt*8));
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
      const P0=S.prev||inp;S.prev={l:!!inp.l,r:!!inp.r,rot:!!inp.rot,drop:!!inp.drop};const e=k=>inp[k]&&!P0[k];
      if(!W&&t>=MIR.CHOICE&&S.ch===0&&S.bt<0){
        if(inp.touch){if(e('drop'))pick(1);else if(e('rot'))pick(2)}
        else{if(e('l'))S.sel=0;if(e('r'))S.sel=1;if((e('drop')||e('rot'))&&S.sel>=0)pick(S.sel===0?1:2)}
      }
      if(S.ch===2&&hold>=LK.PROMPT&&S.leaveT<0&&!W){if(e('drop')||e('rot')||hold>=LK.PROMPT+8){S.leaveT=t;o.tone(300,0.4,'sine',0.12,0,-100)}}
      if(S.leaveT>=0&&t-S.leaveT>=0.7)finish({k:'win',why:'mirror'});
      // after it gives
      if(S.bt>=0){const d=t-S.bt;if(at(S.bt+0.75)){o.hurtFx();o.noise(0.6,0.8,300,0.6);o.tone(70,0.6,'sawtooth',0.4,0,-40)}if(d>=1.9)finish({k:'dead',why:'mirror'})}
      S.shk=Math.max(0,S.shk-dt*1.4);
      draw(t,dt,mp);
    };
    // ---- the choice ----
    const LK={PROMPT:11.6};
    const pick=c=>{
      S.ch=c;S.ct=S.t;S.sp0=S.sm;S.mt=0;
      if(c===1){o.tone(140,0.5,'sawtooth',0.25,0.4,160);o.noise(1.3,0.35,4500,0.5)}
      else o.tone(500,0.08,'triangle',0.1);
    };
    S.pick=pick;
    const blow=i=>{
      const k=i%HP.length;S.hitT[k]=S.t;S.shk=Math.max(S.shk,0.14);
      o.tone(62+Math.random()*10,0.28,'sawtooth',0.3,0,-30);o.noise(0.22,0.55,170,0.7);o.noise(0.35,0.3,3600,2);o.tone(2200+Math.random()*900,0.16,'triangle',0.05,0,-1300);o.rumble(160,0.9,0.5);
    };
    const shatter=()=>{S.pane.visible=false;S.shards.visible=true;o.noise(1.0,0.9,2800,0.8);o.noise(0.9,0.7,500,0.8);o.tone(1700,0.5,'triangle',0.1,0,-1200);o.tone(60,0.9,'sawtooth',0.4,0,-30);o.rumble(800,1,1);S.shk=0.5};
    // ---- drawing ----
    const hudHtml=()=>{
      if(A.watching)return;
      let h='';const t=S.t,op=(i,tx,tag)=>{const on=S.sel===i;return`<div style="display:block;margin:6px auto 0;padding:6px 14px;max-width:88vw;border:1px solid ${on?'#ffe0a8':'#6b5a48'};border-radius:6px;background:${on?'rgba(255,190,110,.26)':'rgba(0,0,0,.5)'};color:${on?'#fff2d6':'#d9c7ae'}">${S.touch?'<span style="opacity:.65;font-size:12px">['+tag+']</span> ':''}${tx}</div>`};
      if(S.bt<0&&S.ch===0&&t>=MIR.CHOICE)h=op(0,'Spray the monster','SPRAY')+op(1,'Suck your thumb and hope the bad things go away','THUMB')+`<small style="display:block;margin-top:8px">${o.hint('mirror')}</small>`;
      else if(S.ch===2&&S.leaveT<0&&t-S.ct>=LK.PROMPT)h=`<b>It is gone.</b><br><small>${S.touch?'Tap SPRAY or THUMB to leave':'Press Space or W to leave'}</small>`;
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
      const sh=S.shk*(S.shk>0.2?0.06:0.04),cy=1.6+Math.sin(t*1.1)*0.008;
      let yaw=S.yaw,pit=S.pitch;
      if(S.ch===1&&S.bt>=0||S.ch===1&&t-S.ct<2){const k=Math.min(1,dt*4);S.yaw=yaw=lerp(yaw,0,k);S.pitch=pit=lerp(pit,0.05,k)}
      if(dd>=0&&S.ch!==1){const k=Math.min(1,dt*2.5);S.yaw=yaw=lerp(yaw,0,k);S.pitch=pit=lerp(pit,0.1,k)}
      cam.position.set((Math.random()-0.5)*sh,cy+(Math.random()-0.5)*sh,0.1+(Math.random()-0.5)*sh);
      cam.rotation.set(pit,-yaw,Math.sin(t*0.4)*0.008+(Math.random()-0.5)*sh*0.8,'YXZ');cam.updateMatrixWorld();camQ.copy(cam.quaternion);
      // people
      const pe=(P,x,z,yw,q,y)=>{P.R.position.set(x,y||0,z);P.R.rotation.set(0,yw,0);q.t=t;posePerson(P,q)};
      const M=[mp.x,mp.z],mOn=t>=MIR.ENTER+0.35;
      // the man paces, glances at the glass, then freezes
      {const pz=pace(Math.min(t,MIR.ENTER)),sw=ss(MIR.ENTER+0.35,MIR.ENTER+1.0,t),gl=ss(10.8,11.4,t)*(1-ss(12.1,12.7,t)),yw0=pz.yaw;
        const toM=ang(M[0]-V1[0],M[1]-V1[1]),yw=t<MIR.ENTER+0.35?yw0:lerp(yw0,toM,sw);
        const q={w:pz.w*(t<MIR.ENTER?1:0),wa:t<MIR.ENTER?pz.wa:0,lean:0.04,hy:lerp(Math.sin(t*0.5)*0.08,clamp(wrap(ang(0-pz.x,0.1-pz.z)-yw0),-1.2,1.2),gl)*(1-sw),hp:0.02};
        if(t>=MIR.ENTER+0.35)Object.assign(q,startle,{wa:0});
        if(t>=MIR.K[0]){const f=fling(M1,t,MIR.K[0],V1,[MA[0],MA[1]],0.95,1.0);posePerson(M1,Object.assign(flop(M1,t,MIR.K[0],f.k),{t}))}
        else pe(M1,pz.x,pz.z,yw,q)}
      // the seated woman
      {const dy=t-0,toM=ang(M[0]-V3[0],M[1]-V3[1]),sw=ss(MIR.ENTER+0.35,MIR.ENTER+1.2,t),sip=Math.max(0,Math.sin(t*0.45))**6,
        q={sit:1,lean:0.04+0.03*Math.sin(t*0.3),hy:lerp(Math.sin(t*0.37)*0.25,clamp(wrap(toM),-1.3,1.3),sw),hp:0.05+0.05*Math.sin(t*0.9),mo:Math.max(0,Math.sin(t*5.3))>0.6&&t<MIR.ENTER?0.5:0,
          aL:[1.05,0.12,1.0-sip*0.2],aR:[1.0+sip*0.6,0.1,1.0+sip*1.1]};
        if(t>=MIR.ENTER+0.35){q.aL=[0.9,0.3,2.0];q.aR=[0.9,0.3,2.0];q.lean=-0.1}
        if(t>=MIR.K[2]){const f=fling(W1,t,MIR.K[2],[V3[0],V3[1]],[MC[0],MC[1]],0.55,0.9);posePerson(W1,Object.assign(flop(W1,t,MIR.K[2],f.k),{t,sit:1-f.k}));
          S.chairA.position.set(V3[0]-f.k*0.5,0.0+0.22*Math.sin(f.k*Math.PI)*0.3,V3[1]-f.k*0.5);S.chairA.rotation.set(-1.45*f.k,0,0.2*f.k)}
        else{pe(W1,V3[0],V3[1],0+0,q,0);S.chairA.position.set(V3[0],0,V3[1]);S.chairA.rotation.set(0,0,0)}}
      // the woman at the glass
      {const A0=[-2.9,-3.2],G=[0.12,-2.6],Q=[-2.0,-3.9],tA=4.2,tB=8.0,tC=14.0,tD=16.7;let p,yw,q={t};
        const wk=(a,b,c,d,t0,t1)=>{const k=ss(t0,t1,t);return[lerp(a[0],b[0],k),lerp(a[1],b[1],k)]};
        if(t<tA){p=A0;yw=-Math.PI/2;q={w:0,wa:0,lean:0.03,hy:Math.sin(t*0.4)*0.3,aL:[1.0,0.2,1.8],aR:[0.15,0.1,0.2]}}
        else if(t<tB){p=wk(A0,G,0,0,tA,tB);const fin=ss(tB-1.4,tB-0.3,t);yw=lerp(ang(G[0]-A0[0],G[1]-A0[1]),0,fin);const m=ss(tA,tA+0.5,t)*(1-ss(tB-0.4,tB,t));q={w:t*5.4,wa:m,lean:0.03,hy:0}}
        else if(t<tC){p=G;yw=0;const u=t-tB,lean=0.12*ss(0.2,1.2,u)+0.1*ss(4.4,5.0,u);
          // collar, then teeth, then hair
          const c1=ss(0.9,1.4,u)*(1-ss(3.3,3.7,u)),c2=ss(3.5,4.0,u)*(1-ss(5.2,5.6,u)),c3=ss(5.3,5.8,u);
          q={lean,hy:Math.sin(u*0.9)*0.05+0.35*c2*Math.sin(u*2)*0.4,hp:-0.1*c2+0.05*c3,hr:0.12*c2,mo:c2,
            aL:[lerp(0.1,0.65,c1)+c3*1.9,lerp(0.12,0.28,c1)+0.2*c3,lerp(0.2,2.3+Math.sin(u*7)*0.12*c1,c1)+c3*0.2],aR:[lerp(0.1,0.7,c1)+c2*0.1,0.2,lerp(0.2,2.2,c1)]}
          if(c2>0.1)q.aL=[0.3,0.2,0.3]; if(c3>0.1)q.aL=[1.9+Math.sin(u*5)*0.1,0.3,0.9]}
        else if(t<tD){p=wk(G,Q,0,0,tC,tD);yw=lerp(0,ang(Q[0]-G[0],Q[1]-G[1]),ss(tC,tC+0.7,t));const m=ss(tC+0.2,tC+0.7,t)*(1-ss(tD-0.5,tD,t));q={w:t*5.4,wa:m,lean:0.03}}
        else{p=Q;const toM=ang(M[0]-Q[0],M[1]-Q[1]);yw=lerp(Math.PI/2,toM,ss(MIR.ENTER+0.35,MIR.ENTER+1.1,t));
          q={lean:0.03,hy:Math.sin(t*0.5)*0.2,aL:[0.9,0.3,1.4+Math.sin(t*0.6)*0.2],aR:[0.1,0.1,0.2]};if(t>=MIR.ENTER+0.35){q.aL=startle.aL;q.aR=startle.aR}}
        if(t>=MIR.K[1]){const f=fling(W2,t,MIR.K[1],Q,[MB[0],MB[1]],0.95,1.0);posePerson(W2,Object.assign(flop(W2,t,MIR.K[1],f.k),{t}))}
        else pe(W2,p[0],p[1],yw,q)}
      // the thing
      mon.R.visible=mOn;
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
        if(S.ch===2&&hold>=LK.PROMPT-6.6+5.0)a=lerp(-1.9,0,ss(LK.PROMPT-6.6+5.4,LK.PROMPT-6.6+5.9,hold));S.door.rotation.y=a}
      // the pane
      const U=S.pane.material.uniforms;U.uK.value=S.sm;U.uT.value=t;for(let i=0;i<10;i++){const h=hits[i];h.z=S.hitT[i]===undefined?0:(0.45+0.5*((i*37%10)/10))*ss(0,0.2,t-S.hitT[i])}
      if(S.bt>=0){
        const d=t-S.bt;S.shards.visible=d<2.2;
        for(let i=0;i<S.sh.length;i++){const s=S.sh[i],g=Math.min(d,2.2);v3.set(s.p[0]+s.v[0]*g,s.p[1]+s.v[1]*g-4.5*g*g,s.p[2]+s.v[2]*g);E4.set(s.r[0]+s.w[0]*g,s.r[1]+s.w[1]*g,s.r[2]+s.w[2]*g);Q4.setFromEuler(E4);S3.setScalar(s.s);M4.compose(v3,Q4,S3);S.shards.setMatrixAt(i,M4)}
        S.shards.instanceMatrix.needsUpdate=true;
      }
      // the can
      if(S.ch===0&&t>=MIR.CAN){const u=clamp((t-MIR.CAN)/1.4,0,1),e=1-(1-u)*(1-u);S.can.visible=true;S.canG.material.opacity=0.35*ss(0.6,1,u)*(0.8+0.2*Math.sin(t*3));
        S.can.position.set(lerp(1.9,0.2,e),0.07,-0.65+Math.sin(u*9)*0.02*(1-u));S.can.children[0].rotation.y=-Math.PI/2-(1-e)*1.7/0.05;S.can.rotation.y=0.3+0.35*(1-e)*Math.sin(u*12);
        if(S.said<1&&t>=MIR.CAN){S.said=1;for(let i=0;i<5;i++)o.tone(1800-i*160,0.06,'triangle',0.09,i*0.2+0.0);o.noise(0.6,0.3,2600,1.5);o.rumble(150,0.4,0.4)}}
      else if(S.ch!==0){S.can.visible=false;S.canG.material.opacity=0}
      // the hand
      let hv=false;
      if(S.ch>0&&S.bt<0||S.ch===1){const c=t-S.ct,up=ss(0,0.5,c)*(S.ch===2?1-ss(2.6,3.4,c):1);hv=up>0.01;
        S.hand.position.copy(cam.position);S.hand.quaternion.copy(camQ);
        const turn=S.ch===2?ss(0.35,0.9,c):0,aimY=S.ch===1?0:0;
        S.hand.children[0].position.set(0.34-turn*0.12,-0.5-(1-up)*0.8,-0.4);
        S.handCan.position.set(0.2-turn*0.14,-0.2-(1-up)*0.8,-0.58+turn*0.18);S.handCan.rotation.set(S.ch===1?-1.45:-1.45+turn*3.0,0,S.ch===1?0.0:0.0);
        S.hand.children[1].position.set(0.2-turn*0.14,-0.22-(1-up)*0.8,-0.58+turn*0.18);for(let i=0;i<3;i++)S.hand.children[3+i].position.set(0.14+i*0.04-turn*0.14,-0.16-(1-up)*0.8,-0.52-i*0.02+turn*0.18)}
      S.hand.visible=hv;
      // spray: a jet at the glass, or a cloud in your own face
      let veil=0,burn=0;
      if(S.ch===1){const c=t-S.ct;const noz=[cam.position.x+0.2,cam.position.y-0.3,cam.position.z-0.8];if(c>0.35&&c<9){emit(0,Math.max(1,Math.round(dt*160)),noz,[0.0,1.9,WZ-0.1])}
        S.splash.material.opacity=ss(0.7,1.1,c)*0.9;S.splash.scale.setScalar(0.8+ss(0.7,1.8,c)*2.2);S.splash.visible=S.bt<0||t-S.bt<0.2}
      else S.splash.visible=false;
      if(S.ch===2){const c=hold;if(c>0.8&&c<2.6)emit(1,Math.max(1,Math.round(dt*220)),[cam.position.x+0.05,cam.position.y-0.1,cam.position.z-0.5],[cam.position.x,cam.position.y,cam.position.z+0.2]);
        veil=ss(0.85,1.5,c)*(1-0.82*ss(4.4,8.0,c))*(1-0.5*ss(8.0,11.5,c));burn=ss(0.9,1.5,c);
        if(at(S.ct+0.9)){o.hurtFx();o.noise(1.0,0.4,4500,0.5)}
        if(at(S.ct+1.0))o.say('You spray yourself in the eyes. You cannot see a thing.',4.2);
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
      S.spill.material.uniforms.uK.value=0.55+0.45*(lit4[0]+lit4[2])/2;
      // the blur that comes with burning eyes
      S.blur=burn>0?burn*(1-ss(4.6,9.5,hold)):0;
      S.fade=Math.max(S.bt>=0?ss(S.bt+0.95,S.bt+1.55,t):0,S.leaveT>=0?ss(S.leaveT+0.1,S.leaveT+0.65,t):0,S.ch===2?0.62*burn*(1-ss(4.4,9.0,hold)):0);
      S.bloom=0.55+0.25*burn;
      if(!W)hudHtml();
    };
    S.snap=()=>({t:+S.t.toFixed(3),yaw:+S.yaw.toFixed(2),pitch:+S.pitch.toFixed(2),sm:+S.sm.toFixed(3),ch:S.ch,ct:+S.ct.toFixed(2),bt:+S.bt.toFixed(2),sel:S.sel,lv:+S.leaveT.toFixed(2)});
    S.apply=q=>{
      if(nf(q.yaw))S.yaw=clamp(q.yaw,-3.3,3.3);if(nf(q.pitch))S.pitch=clamp(q.pitch,-1.25,1);
      if(Number.isInteger(q.sel)&&q.sel>=-1&&q.sel<=1)S.sel=q.sel;
      if((q.ch===1||q.ch===2)&&S.ch===0&&nf(q.ct)&&q.ct>=MIR.CHOICE&&q.ct<400)S.want=[q.ch,q.ct];
      if(nf(q.bt)&&q.bt>=0&&S.bt<0)S.wb=true;
      if(nf(q.lv)&&q.lv>=0&&S.leaveT<0&&q.lv<400)S.leaveT=q.lv;
      if(!nf(q.t)||q.t<0||q.t>200)return;
      const to=clamp(q.t,0,400),d=to-S.t;
      if(d>0.25){A.mute++;try{for(let n=0;n<4200&&!held&&S.t<to-0.001;n++)S.update(Math.min(0.1,to-S.t),Z)}finally{A.mute--}}else if(d<-0.25)S.t=to;
      if(nf(q.sm)&&S.bt<0)S.sm=clamp(q.sm,0,q.bt>=0?1:0.995);
    };
    S.bloom=0.55;
    S.look=0;
    S.update(0,Z);
    return S;
  }

  const KINDS={galaxy,fall,kiln,mirror},FADE_IN={fall:0.18,mirror:1.4};
  const build=kind=>{
    setup();A.active=true;A.kind=kind;held=false;
    cur=(KINDS[kind]||kiln)();
    cur.fade=0;cur.in=0;
  };
  // watching someone else's room: the same scene, driven by their snapshots instead of our input
  A.watch=(kind,q)=>{
    if(A.active)A.abort();
    if(!KINDS[kind])return;
    done=null;A.watching=true;
    build(kind);
    A.sync(q);cur.update(0,Z);
  };
  A.sync=q=>{if(!cur||!A.watching||held||!q||typeof q!=='object'||!cur.apply)return;try{cur.apply(q)}catch(e){}};
  A.snap=()=>cur&&cur.snap&&!A.watching?cur.snap():null;
  A.start=(kind,cb)=>{
    if(A.active)A.abort();
    A.watching=false;setup();done=cb;A.active=true;A.kind=kind;
    cur=(KINDS[kind]||kiln)();
    cur.fade=0;cur.in=0;
    cur.update(0,{l:0,r:0,d:0,rot:1,drop:1,lx:0,ly:0});
  };
  A.abort=()=>{done=null;A.active=false;A.kind='';A.watching=false;held=false;cur=null;clear();o.hud('')};
  A.update=(dt,inp)=>{if(!cur||held)return;cur.in+=dt;cur.update(dt,inp)};
  A.look=(dx,dy)=>{if(cur&&!A.watching&&cur.yaw!==undefined){cur.yaw+=dx;cur.pitch=clamp(cur.pitch-dy,-1.2,1.2)}};
  // how black the screen overlay should be: fades in at the start, out at the end
  A.fade=()=>cur?Math.max(cur.fade||0,1-ss(0,FADE_IN[A.kind]||0.7,cur.in)):0;
  A.state=()=>cur;
  A.render=()=>{
    if(!cur)return;
    const sz=renderer.getSize(new THREE.Vector2()),pr=renderer.getPixelRatio();
    cam.aspect=sz.x/Math.max(1,sz.y);
    if(cur.frame)cur.frame();
    cam.updateProjectionMatrix();
    if(composer){
      const key=sz.x+'x'+sz.y+'@'+pr;
      if(key!==viewKey){viewKey=key;composer.setPixelRatio(pr);composer.setSize(sz.x,sz.y)}
      bloom.strength=cur.bloom;
      blurPass.enabled=(cur.blur||0)>0.01;if(blurPass.enabled){blurPass.uniforms.uAmt.value=cur.blur*10*pr;blurPass.uniforms.uPx.value.set(1/(sz.x*pr),1/(sz.y*pr))}
      composer.render();
    }else renderer.render(scene,cam);
  };
  return A;
}
