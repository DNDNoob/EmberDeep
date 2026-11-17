// Strange doors (the picture house is in src/theater.js): three rooms that are somewhere else entirely.
//   galaxy  you float among stars until the sun collapses and spits you back out, floors deeper
//   kiln    a stone hall with an arcade console: walk up, press its buttons to steer the falling stones in the glass, burn enough rows and the door lets you go
//   fall    there is no floor behind the door
// Each room owns a small scene of its own, drawn in place of the maze while it runs.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {createTheater} from './theater.js';

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

export function createRooms(renderer,o0){
  // a watcher is not the one in the room: no speech or shaking for them, and a fast-forward makes no sound
  const o=Object.assign({},o0,{say:(...a)=>{if(!A.watching)o0.say(...a)},rumble:(...a)=>{if(!A.watching)o0.rumble(...a)},
    tone:(...a)=>{if(!A.mute)o0.tone(...a)},noise:(...a)=>{if(!A.mute)o0.noise(...a)},hint:()=>A.watching?A.label:o0.hint()});
  const nf=v=>typeof v==='number'&&isFinite(v),Z={mx:0,my:0,press:0,lx:0,ly:0};
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(72,1,0.05,2000);
  scene.background=new THREE.Color(0x000000);
  let composer=null,bloom=null,viewKey='',cur=null,group=null,done=null,held=false;
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
      bloom=new UnrealBloomPass(new THREE.Vector2(4,4),0.9,0.6,0.8);composer.addPass(bloom);
      composer.addPass(new OutputPass());viewKey='';
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

  /* ---------- the glass kiln: a walkable arcade hall ---------- */
  function kiln(){
    const {W,H}=KILN,C=0.2,BY=1.35,KZ=-6.3,CZ=-0.4,RX=6,RZ=7,RH=7.5,EYE=1.6,REACH=2.5,SNAP=0.2,SNAPT=0.15,RAD=0.32;
    const S={t:0,rep:0,softT:0,endT:0,shake:0,px:0,pz:6.2,yaw:0,pitch:-0.05,ux:0,uz:0,vx:0,vz:6.2,vyaw:0,vpitch:-0.05,tx:0,tz:6.2,tyaw:0,tpitch:-0.05,hasPose:false,
      aim:-1,held:-1,pb:-1,pl:0,tb:-1,started:false,lit:0,bobP:0,bob:0,eyeY:EYE,sink:[0,0,0,0,0],hot:[0.6,0.6,0.6,0.6,0.6]};
    const K=S.K=kilnGame(Math.random);
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
    const walk=(dt,inp)=>{
      const mx=nf(inp.mx)?clamp(inp.mx,-1,1):0,my=nf(inp.my)?clamp(inp.my,-1,1):0,lx=nf(inp.lx)?inp.lx:0,ly=nf(inp.ly)?inp.ly:0;
      S.yaw+=lx*1.6*dt;S.pitch=clamp(S.pitch-ly*1.4*dt,-1.2,1.2);
      S.yaw=((S.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);let dx=cy*mx-sy*my,dz=sy*mx+cy*my;const l=Math.hypot(dx,dz);if(l>1){dx/=l;dz/=l}
      const k=Math.min(1,dt*12);S.ux+=(dx*3.2-S.ux)*k;S.uz+=(dz*3.2-S.uz)*k;
      const ox=S.px,oz=S.pz;S.px+=S.ux*dt;S.pz+=S.uz*dt;
      for(let it=0;it<2;it++){
        for(const b of BOXES){const qx=clamp(S.px,b[0],b[1]),qz=clamp(S.pz,b[2],b[3]),ex=S.px-qx,ez=S.pz-qz,d=Math.hypot(ex,ez);
          if(d<RAD){if(d>1e-6){S.px=qx+ex/d*RAD;S.pz=qz+ez/d*RAD}else{const m=[S.px-b[0],b[1]-S.px,S.pz-b[2],b[3]-S.pz],i=m.indexOf(Math.min(...m));
            if(i===0)S.px=b[0]-RAD;else if(i===1)S.px=b[1]+RAD;else if(i===2)S.pz=b[2]-RAD;else S.pz=b[3]+RAD}}}
        S.px=clamp(S.px,-RX+RAD,RX-RAD);S.pz=clamp(S.pz,-RZ+RAD,RZ-RAD);
      }
      view(dt,Math.hypot(S.px-ox,S.pz-oz)/Math.max(dt,1e-4));S.vx=S.px;S.vz=S.pz;S.vyaw=S.yaw;S.vpitch=S.pitch;
      const B=basis();S.aim=K.over?-1:pick(B.f,SNAP);
    };
    // the walk bob follows how fast the view is really moving, for the player and for a watcher alike
    const view=(dt,sp)=>{if(dt<=0)return;const a=clamp(sp/3,0,1);S.bobP+=sp*dt*2.3;S.bob+=(Math.sin(S.bobP)*0.028*a-S.bob)*Math.min(1,dt*20);S.eyeY=EYE+S.bob};
    const watchView=dt=>{
      const wr=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      if(!S.hasPose||Math.hypot(S.tx-S.vx,S.tz-S.vz)>4){S.vx=S.tx;S.vz=S.tz;S.vyaw=S.tyaw;S.vpitch=S.tpitch;S.hasPose=true;return}
      const k=Math.min(1,dt*12),ox=S.vx,oz=S.vz;
      S.vx+=(S.tx-S.vx)*k;S.vz+=(S.tz-S.vz)*k;S.vyaw=wr(S.vyaw+wr(S.tyaw-S.vyaw)*k);S.vpitch+=(S.tpitch-S.vpitch)*k;
      view(dt,Math.hypot(S.vx-ox,S.vz-oz)/dt);S.px=S.vx;S.pz=S.vz;
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
        x:+S.px.toFixed(2),z:+S.pz.toFixed(2),yw:+S.yaw.toFixed(2),pt:+S.pitch.toFixed(2),am:S.aim,hd:S.held,st:S.started?1:0}};
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

  const theater=createTheater({renderer,scene,cam,o,A,canvasTex,glow,clamp,ss,lerp,nf,rnd,getGroup:()=>group,onClear:fn=>clearHooks.push(fn),finish:r=>finish(r)});
  const KINDS={galaxy,fall,kiln,theater};
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
    build(kind);
    A.sync(q);cur.update(0,Z);
  };
  A.sync=q=>{if(!cur||!A.watching||held||!q||typeof q!=='object'||!cur.apply)return;try{cur.apply(q)}catch(e){}};
  A.snap=()=>cur&&cur.snap&&!A.watching?cur.snap():null;
  A.start=(kind,cb,seed)=>{
    if(A.active)A.abort();
    A.watching=false;setup();done=cb;A.active=true;A.kind=kind;
    cur=(KINDS[kind]||kiln)(seed!==undefined?seed:(Math.random()*4294967296)>>>0);
    cur.fade=0;cur.in=0;
    cur.update(0,Z);
  };
  A.abort=()=>{done=null;A.active=false;A.kind='';A.watching=false;held=false;cur=null;clear();o.hud('')};
  A.update=(dt,inp)=>{if(!cur||held)return;cur.in+=dt;cur.update(dt,inp)};
  A.tap=(x,y)=>!!(cur&&!A.watching&&cur.tap&&cur.tap(x,y));
  A.untap=()=>{if(cur&&cur.untap)cur.untap()};
  A.aimed=()=>!!(cur&&cur.aimed&&cur.aimed());
  A.cam=cam;
  // test hooks for the picture house: inject a mic level or recognised words, force the house reel
  A.theaterTest=q=>cur&&cur.test&&cur.test.api?cur.test.api(q):null;
  A.look=(dx,dy)=>{if(cur&&!A.watching&&cur.yaw!==undefined){cur.yaw+=dx;cur.pitch=clamp(cur.pitch-dy,-1.2,1.2)}};
  // how black the screen overlay should be: fades in at the start, out at the end
  A.fade=()=>cur?Math.max(cur.fade||0,1-ss(0,A.kind==='fall'?0.18:0.7,cur.in)):0;
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
      composer.render();
    }else renderer.render(scene,cam);
  };
  return A;
}
