import * as THREE from 'three';
import {MOVE,bobY,createRoomWalker,lookStep} from './movement.js';

const EYE=1.6, PORTAL_Z=-18, TURN=4.1, SCREAM=4.65, VANISH=6.45;
const clamp=THREE.MathUtils.clamp;
const smooth=THREE.MathUtils.smoothstep;

function makeSky(group,rand,low){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(125,32,20),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{seed:{value:rand()*40}},
    vertexShader:`varying vec3 direction;
      void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 direction;
      uniform float seed;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){
        vec3 i=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main(){
        vec3 d=normalize(direction), p=d*4.2+vec3(seed,0,0);
        float n=.55*noise(p)+.27*noise(p*2.2)+.12*noise(p*5.1)+.06*noise(p*11.3);
        float band=exp(-3.2*abs(d.y-.25*d.x+.15));
        vec3 col=vec3(.008,.008,.028)+mix(vec3(.48,.055,.38),vec3(.06,.32,.64),noise(p*.94))*
          smoothstep(.30,.80,n)*band;
        vec2 q=mat2(.90,-.44,.44,.90)*(d.xy-vec2(-.29,.24));
        q.y*=2.5;
        float r=length(q), a=atan(q.y,q.x);
        float arm=.5+.5*cos(2.0*a-18.0*r+2.0*noise(p*5.0));
        float galaxy=exp(-7.4*r)*(0.27+0.73*pow(arm,4.0));
        col+=step(.0,-d.z)*(vec3(.45,.37,.77)*galaxy+vec3(1,.63,.37)*exp(-31.0*r));
        gl_FragColor=vec4(col,1.0);
      }`,
  }));
  sky.renderOrder=-2;
  group.add(sky);

  const count=low?850:2200, positions=[], colors=[];
  for(let i=0;i<count;i++){
    const h=rand()*2-1,a=rand()*Math.PI*2,r=Math.sqrt(1-h*h)*113;
    positions.push(Math.cos(a)*r,h*113,Math.sin(a)*r);
    const light=.22+.78*rand()**3;
    colors.push(light*(.67+rand()*.33),light*(.75+rand()*.25),light);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const stars=new THREE.Points(geometry,new THREE.PointsMaterial({size:.13,vertexColors:true,transparent:true,opacity:.86,depthWrite:false}));
  stars.renderOrder=-1;
  group.add(stars);
}

function makeHead(parent,variant){
  const root=new THREE.Group();
  parent.add(root);
  const stone=new THREE.MeshStandardMaterial({color:variant,roughness:1,flatShading:true});
  const shadow=new THREE.MeshStandardMaterial({color:0x29232d,roughness:1,flatShading:true});
  const eye=new THREE.MeshBasicMaterial({color:0x42151d});
  const box=(w,h,d,x,y,z,mat=stone,angle=0)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,z);mesh.rotation.z=angle;root.add(mesh);
    return mesh;
  };
  const profile=[[.02,-1.79],[.64,-1.77],[.85,-1.52],[.71,-1.15],[.78,-.52],[.87,.26],[.96,.87],[.79,1.56],[.54,1.76],[.03,1.78]];
  const crown=new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),9),stone);
  crown.scale.z=.79;root.add(crown);
  for(const side of [-1,1]){
    box(.17,1.09,.24,side*.8,.14,-.04,stone,side*.09);
    box(.57,.21,.39,side*.36,.44,.62,stone,-side*.12);
    box(.39,.19,.06,side*.35,.23,.74,shadow);
    box(.22,.068,.065,side*.35,.23,.779,eye);
    box(.36,.34,.25,side*.44,-.22,.55,stone,side*.19);
  }
  const nose=new THREE.Mesh(new THREE.CylinderGeometry(.11,.29,.98,4),stone);
  nose.position.set(0,-.03,.76);nose.rotation.y=Math.PI/4;root.add(nose);
  box(.59,.25,.075,0,-.82,.675,shadow);
  box(.68,.13,.24,0,-.7,.64,stone);
  const jaw=box(.66,.22,.27,0,-.91,.64);
  return {root,eye,jaw};
}

function makePath(group){
  const path=new THREE.Group();
  group.add(path);
  const deck=new THREE.MeshBasicMaterial({color:0x778fd1,transparent:true,opacity:0,depthWrite:false});
  const seams=new THREE.MeshBasicMaterial({color:0xa9dcff,transparent:true,opacity:0,depthWrite:false});
  const portal=new THREE.MeshBasicMaterial({color:0x735fce,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const frame=new THREE.MeshBasicMaterial({color:0xccdaff,transparent:true,opacity:0,depthWrite:false});
  const box=(w,h,d,x,y,z,material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);path.add(mesh);
  };
  for(let i=0;i<12;i++){
    const z=-1.45-i*1.5;
    box(2.35,.055,1.42,0,-.04,z,deck);
    for(const side of [-1,1])box(.04,.065,1.43,side*1.17,-.022,z,seams);
  }
  for(const side of [-1,1])box(.12,2.9,.18,side*1.06,1.45,PORTAL_Z,frame);
  box(2.24,.12,.18,0,2.9,PORTAL_Z,frame);
  box(2.24,.14,.18,0,.07,PORTAL_Z,frame);
  const veil=new THREE.Mesh(new THREE.PlaneGeometry(2,2.72),portal);
  veil.position.set(0,1.49,PORTAL_Z);path.add(veil);
  return (t,reveal)=>{
    path.visible=reveal>0;
    deck.opacity=.17*reveal;seams.opacity=.57*reveal;
    frame.opacity=.9*reveal;portal.opacity=(.22+.08*Math.sin(t*3))*reveal;
  };
}

const syllables=[[90,520,1090],[112,380,1640],[77,690,1210],[96,430,860],[125,310,1360],[83,595,1720],[102,450,980]];
function speak(o,index,pan){
  const [pitch,formant,upper]=syllables[index];
  o.tone(pitch,.23,'triangle',.074,0,-16,pan);
  o.tone(formant,.15,'sine',.025,.018,-formant*.28,pan);
  o.tone(upper,.17,'sine',.013,.028,-upper*.13,pan);
}

// Walkable throughout. The opening platform holds the player until the star path appears.
export function monolithRoom({group,cam,o,A,finish,rand,seed}){
  cam.fov=72;cam.near=.05;cam.far=220;
  group.add(new THREE.HemisphereLight(0xaebeff,0x5a304c,2.0));
  const rim=new THREE.DirectionalLight(0xe4a6ff,2.0);
  rim.position.set(-4,3,-5);group.add(rim);
  const front=new THREE.DirectionalLight(0xabcaff,1.3);
  front.position.set(1,2,5);group.add(front);

  const platform=new THREE.Mesh(new THREE.CylinderGeometry(2.36,2.2,.29,12),
    new THREE.MeshStandardMaterial({color:0x232134,roughness:.85,flatShading:true}));
  platform.position.y=-.145;group.add(platform);
  const revealPath=makePath(group);
  const stones=[0x807079,0x777b87,0x8d7876,0x686d82];
  const heads=[[-3.7,-5.9],[.2,-7.9],[3.6,-6.1]].map(([x,z],i)=>{
    const head=makeHead(group,stones[(rand()*stones.length)|0]);
    head.root.scale.setScalar(.76+rand()*.28);
    head.root.position.set(x,1.45+rand()*.6,z);
    return {...head,x,z,y:head.root.position.y,rest:Math.atan2(-x,-7-z)+(i===1?1.42:0)};
  });
  makeSky(group,rand,o.low);
  const dustN=o.low?100:240, dustPositions=new Float32Array(dustN*3), dustOrigins=[];
  for(let i=0;i<dustN;i++){
    const h=heads[i%heads.length];
    dustOrigins.push([h.x,h.y,h.z,rand()*2-1,rand()*2-1,rand()*2-1]);
  }
  const dustGeometry=new THREE.BufferGeometry();
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0xeea7ff,size:.09,transparent:true,depthWrite:false}));
  dust.visible=false;dust.frustumCulled=false;group.add(dust);

  const S={t:0,yaw:0,pitch:0,bloom:.42,seed};
  let lastBeat=-1, screamed=false, vanished=false;
  const walker=createRoomWalker({o,eye:EYE,x:0,z:1,collide:b=>{
    if(S.t>=VANISH&&b.z<-.8&&(b.z<-2.1||Math.abs(b.x)<1.5)){
      b.x=clamp(b.x,-1.01,1.01);
      return;
    }
    const r=Math.hypot(b.x,b.z);
    if(r>2.1){b.x*=2.1/r;b.z*=2.1/r}
  }});
  const b=walker.b;
  S.snap=()=>({sd:seed,t:S.t,x:b.x,z:b.z,y:b.y,yaw:S.yaw,pitch:S.pitch});
  S.apply=q=>{
    if(![q.t,q.x,q.z,q.y,q.yaw,q.pitch].every(Number.isFinite))return;
    S.t=clamp(q.t,0,1e5);S.yaw=q.yaw;S.pitch=clamp(q.pitch,-1.2,1.2);
    walker.watch(.1,clamp(q.x,-3,3),clamp(q.z,-19,3),clamp(q.y,0,2));
  };
  S.update=(dt,input)=>{
    if(!A.watching){
      S.t+=dt;
      lookStep(S,dt,input.lx,input.ly,MOVE.roomPitch);
      const before=b.z;
      walker.step(dt,input,S.yaw);
      if(S.t>=VANISH&&before>PORTAL_Z&&b.z<=PORTAL_Z){
        finish({k:'maze-exit'});return;
      }
    }
    const t=S.t, beat=Math.floor(t/.27), speaker=Math.floor(beat/3)%heads.length;
    if(t>.4&&t<TURN&&beat!==lastBeat){
      if(!A.watching)speak(o,(beat+seed%syllables.length)%syllables.length,(speaker-1)*.66);
      lastBeat=beat;
    }
    if(t>=SCREAM&&!screamed){
      screamed=true;
      if(!A.watching){
        o.tone(690,1.6,'sawtooth',.105,0,-310,-.64);
        o.tone(926,1.65,'sawtooth',.1,0,-420,.63);
        o.tone(427,1.67,'square',.072,0,-130,0);
        o.noise(1.7,.15,1550,.8);
      }
    }
    if(t>=VANISH&&!vanished){
      vanished=true;
      if(!A.watching)o.sfx('gone');
    }
    const turn=smooth(t,TURN,SCREAM);
    for(const [i,h] of heads.entries()){
      h.root.visible=t<VANISH;
      h.root.position.y=h.y+Math.sin(t*1.45+i*2)*.12;
      const face=Math.atan2(b.x-h.x,b.z-h.z);
      h.root.rotation.y=h.rest+Math.atan2(Math.sin(face-h.rest),Math.cos(face-h.rest))*turn;
      h.root.rotation.x=-Math.atan2(EYE+b.y-h.root.position.y,Math.hypot(b.x-h.x,b.z-h.z))*turn;
      h.eye.color.setRGB(.12+turn*1.8,.004,.013);
      h.jaw.position.y=-.91-(t>=SCREAM?.20+.045*Math.sin(t*53+i):t<TURN&&i===speaker?.12*Math.sin((t%.27)/.27*Math.PI):0);
    }
    const burst=t-VANISH;
    dust.visible=burst>=0&&burst<1;
    if(dust.visible){
      dust.material.opacity=.8*(1-burst);
      for(let i=0;i<dustN;i++){
        const [x,y,z,dx,dy,dz]=dustOrigins[i], spread=.44+burst*2.1;
        dustPositions.set([x+dx*spread,y+dy*spread*1.5,z+dz*spread],i*3);
      }
      dustGeometry.attributes.position.needsUpdate=true;
    }
    revealPath(t,smooth(t,VANISH,VANISH+.8));
    if(!A.watching)o.hud(t>=VANISH?'<small>'+o.hint('monoliths')+'</small>':
      t>=SCREAM?'<small>[The stone faces scream.]</small>':t>=TURN?'':t>.4?'<small>[Voices in an unfamiliar language.]</small>':'');
    cam.position.set(b.x,EYE+b.y+bobY(b,walker.scale),b.z);
    cam.rotation.set(S.pitch,-S.yaw,0,'YXZ');
  };
  return S;
}
