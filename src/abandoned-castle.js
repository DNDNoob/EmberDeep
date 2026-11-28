import * as THREE from 'three';

export const CASTLE_DEPTH=13;
export const CASTLE_CEILING=4.35;
export const CASTLE_GALLERY=1.89;
export const isCastleDepth=depth=>depth>=CASTLE_DEPTH&&(depth-CASTLE_DEPTH)%16===0;
const stepRise=.105,steps=18,inner=.48,outer=1.8,stepAngle=Math.PI*1.5/steps;
const tau=Math.PI*2,startAngle=Math.PI/2;

export function carveCastle(grid,width,random){
  const reserved=(x,z)=>x>=2&&x<=17&&z>=1&&z<=9;
  for(let z=1;z<=9;z++)for(let x=2;x<=17;x++)grid[z*width+x]=0;
  const stairs=[{x:4.7,z:4.75},{x:12.7,z:4.75}];
  const platforms=[],rails=[],columns=[];
  const deck=(x0,x1,z0,z1)=>platforms.push({x0,x1,z0,z1});
  const rail=(x0,x1,z0,z1)=>rails.push({x0,x1,z0,z1});
  const gallery={x0:2.08,x1:17.92,z0:1.02,z1:2.92};
  const centers=random()<.5?[8.55,16.0]:[8.95,16.2];
  const hatches=centers.map(x=>({x0:x-.49,x1:x+.49,z0:1.47,z1:2.47,triggered:-Infinity}));
  let edge=gallery.x0;
  for(const hatch of hatches){
    deck(edge,hatch.x0,gallery.z0,gallery.z1);
    deck(hatch.x0,hatch.x1,gallery.z0,hatch.z0);
    deck(hatch.x0,hatch.x1,hatch.z1,gallery.z1);
    edge=hatch.x1;
  }
  deck(edge,gallery.x1,gallery.z0,gallery.z1);
  edge=gallery.x0;
  for(const stair of stairs){
    const x0=stair.x+1.66,x1=x0+1.10;
    deck(x0,x1,gallery.z1,stair.z+.31);
    rail(edge,x0,gallery.z1-.055,gallery.z1);
    rail(x1-.055,x1,gallery.z1,stair.z+.31);
    rail(x0,x1,stair.z+.255,stair.z+.31);
    rail(x0,x0+.055,gallery.z1,stair.z-.56);
    edge=x1;
  }
  rail(edge,gallery.x1,gallery.z1-.055,gallery.z1);
  for(const x of [gallery.x0,gallery.x1-.055])rail(x,x+.055,gallery.z0,gallery.z1);
  for(const x of [3.25,7.5,10.5,15.6,17.3])columns.push({x,z:7.25});
  const windows=[3,5,7,9,11,13,15,17].map(tx=>({tx,x:tx+.5}));
  const lamps=[3.5,7.55,11.55,15.55].flatMap(x=>[{x,y:1.28,z:5.75},{x,y:2.88,z:1.6}]);
  return {reserved,start:[9,8],stairs,platforms,rails,columns,windows,hatches,lamps};
}

function inside(rect,x,z,margin=0){
  return x>rect.x0-margin&&x<rect.x1+margin&&z>rect.z0-margin&&z<rect.z1+margin;
}

function stairHeight(stair,x,z,margin=0){
  const dx=x-stair.x,dz=z-stair.z,r=Math.hypot(dx,dz);
  if(r<inner-margin||r>outer+margin)return 0;
  const a=(Math.atan2(dz,dx)-startAngle+tau)%tau;
  return a<steps*stepAngle?stepRise*(1+Math.floor(a/stepAngle)):0;
}

export function hatchAngle(hatch,time){
  const age=time-hatch.triggered;
  return Math.min(1,Math.max(0,(age-.18)/.20),Math.max(0,(3.35-age)/.27))*1.40;
}

export function castleHatchAt(castle,x,z){
  return castle.hatches.findIndex(hatch=>inside(hatch,x,z,-.07));
}

export function startCastleHatch(hatch,time){
  if(!hatch||time-hatch.triggered<3.8)return false;
  hatch.triggered=time;
  return true;
}

export function castleGround(castle,x,z,feet,time){
  let ground=0;
  for(const stair of castle.stairs){
    const y=stairHeight(stair,x,z);
    if(y<=feet+.118)ground=Math.max(ground,y);
  }
  if(feet+.118>=CASTLE_GALLERY&&(
    castle.platforms.some(deck=>inside(deck,x,z,.003))||
    castle.hatches.some(hatch=>hatchAngle(hatch,time)<.42&&inside(hatch,x,z,.003))))return CASTLE_GALLERY;
  return ground;
}

export function castleBlocked(castle,x,z,feet,height,radius){
  if(!castle.reserved(Math.floor(x),Math.floor(z)))return false;
  if(castle.columns.some(p=>Math.hypot(x-p.x,z-p.z)<.23+radius))return true;
  for(const stair of castle.stairs){
    if(Math.hypot(x-stair.x,z-stair.z)<.23+radius)return true;
    if(stairHeight(stair,x,z)>feet+.118)return true;
  }
  if(feet<CASTLE_GALLERY-.118&&feet+height>CASTLE_GALLERY-.18&&castle.platforms.some(deck=>inside(deck,x,z,radius)))return true;
  return feet>=CASTLE_GALLERY-.11&&feet<CASTLE_GALLERY+.67&&castle.rails.some(rail=>inside(rail,x,z,radius));
}

export function castleHeadroom(castle,x,z,feet,radius){
  if(!castle.reserved(Math.floor(x),Math.floor(z)))return 1.25;
  if(feet<CASTLE_GALLERY-.20&&castle.platforms.some(deck=>inside(deck,x,z,radius)))return CASTLE_GALLERY-.18;
  return CASTLE_CEILING;
}

// Use the world material for stonework so the torch, shadows and fog match the adjoining maze.
export function castleWindowWall(quad,x,z,top,layer){
  const uv=points=>points.map(([u,y])=>[u,1-y/1.25]);
  const panel=(a,b,low,high)=>quad([[a,low,z],[b,low,z],[b,high,z],[a,high,z]],[0,0,1],
    uv([[a,low],[b,low],[b,high],[a,high]]),layer);
  const left=x+.32,right=x+.68;
  panel(x,left,0,top);panel(right,x+1,0,top);
  let bottom=0;
  for(const [sill,arch] of [[.68,1.55],[2.51,3.69]]){
    panel(left,right,bottom,sill);
    const tip=x+.5,peak=arch+.24;
    quad([[left,arch,z],[tip,peak,z],[tip,peak,z],[left,peak,z]],[0,0,1],uv([[left,arch],[tip,peak],[tip,peak],[left,peak]]),layer);
    quad([[tip,peak,z],[right,arch,z],[right,peak,z],[tip,peak,z]],[0,0,1],uv([[tip,peak],[right,arch],[right,peak],[tip,peak]]),layer);
    bottom=arch+.24;
  }
  panel(left,right,bottom,top);
}

export function drawCastleArchitecture(castle,quad){
  const face=(points,n,layer=0)=>{
    const uv=points.map(([x,y,z])=>n[1]?[x/2,z/2]:[(x*n[2]-z*n[0])/1.5,1-y/1.25]);
    quad(points,n,uv,layer);
  };
  for(const stair of castle.stairs)for(let i=0;i<steps;i++){
    const a=startAngle+i*stepAngle,b=a+stepAngle,y=(i+1)*stepRise;
    const point=(r,t,h)=>[stair.x+r*Math.cos(t),h,stair.z+r*Math.sin(t)];
    const post=.21;
    face([point(post,a,y),point(outer,a,y),point(outer,b,y),point(post,b,y)],[0,1,0],1);
    face([point(post,a,y-.18),point(post,b,y-.18),point(outer,b,y-.18),point(outer,a,y-.18)],[0,-1,0]);
    face([point(post,a,y-.18),point(outer,a,y-.18),point(outer,a,y),point(post,a,y)],[Math.sin(a),0,-Math.cos(a)]);
    face([point(post,b,y-.18),point(outer,b,y-.18),point(outer,b,y),point(post,b,y)],[-Math.sin(b),0,Math.cos(b)]);
    const m=(a+b)/2;
    face([point(outer,a,y-.18),point(outer,b,y-.18),point(outer,b,y),point(outer,a,y)],[Math.cos(m),0,Math.sin(m)]);
  }
  for(const {x0,x1,z0,z1} of castle.platforms){
    const y=CASTLE_GALLERY,lo=y-.18;
    face([[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]],[0,1,0],1);
    face([[x0,lo,z0],[x1,lo,z0],[x1,lo,z1],[x0,lo,z1]],[0,-1,0]);
    face([[x0,lo,z0],[x0,lo,z1],[x0,y,z1],[x0,y,z0]],[-1,0,0]);
    face([[x1,lo,z0],[x1,lo,z1],[x1,y,z1],[x1,y,z0]],[1,0,0]);
    face([[x0,lo,z0],[x1,lo,z0],[x1,y,z0],[x0,y,z0]],[0,0,-1]);
    face([[x0,lo,z1],[x1,lo,z1],[x1,y,z1],[x0,y,z1]],[0,0,1]);
  }
}

export function drawCastleDetails(castle,frame,{slab,seg}){
  const limestone=[.45,.46,.46,9],edge=[.65,.63,.57,9],iron=[.16,.14,.12,4],cloth=[.24,.061,.078,2];
  for(const p of [...castle.stairs,...castle.columns]){
    const f=frame(p.x,p.z);
    seg(f,[0,.12,0],[0,4.23,0],.22,.22,limestone);
    for(const y of [.10,.24,1.89,4.10,4.23])slab(f,[0,y,0],[.59,.13,.59],edge);
  }
  for(const {x0,x1,z0,z1} of castle.rails){
    const f=frame((x0+x1)/2,(z0+z1)/2),dx=x1-x0,dz=z1-z0;
    slab(f,[0,CASTLE_GALLERY+.64,0],[dx+.035,.075,dz+.035],edge);
    const length=Math.max(dx,dz),count=Math.max(1,Math.ceil(length/.35));
    for(let i=0;i<=count;i++){
      const u=i/count-.5;
      slab(f,[dx>dz?dx*u:0,CASTLE_GALLERY+.30,dz>dx?dz*u:0],[.052,.60,.052],iron);
    }
  }
  for(const {x} of castle.windows){
    const f=frame(x,1.07);
    for(const y of [.65,2.48])slab(f,[0,y,0],[.56,.09,.23],edge);
    for(const side of [-1,1]){
      slab(f,[side*.225,3.09,0],[.10,1.12,.22],limestone);
      seg(f,[side*.23,3.64,.007],[0,3.99,.007],.065,.065,edge);
    }
  }
  for(const x of [4,8,12,16]){
    const f=frame(x,1.10);
    slab(f,[0,3.63,.015],[.62,1.18,.028],cloth);
    slab(f,[0,4.18,.035],[.75,.045,.048],iron);
    slab(f,[0,3.66,.037],[.035,.58,.012],edge);
    slab(f,[0,3.77,.037],[.22,.034,.012],edge);
  }
  for(const {x,y,z} of castle.lamps){
    const f=frame(x,z);
    slab(f,[0,y-.17,0],[.10,.30,.10],iron);
    slab(f,[0,y-.03,0],[.16,.045,.16],edge);
  }
}

export function drawCastleHatches(castle,time,frame,{slab,subF,rX}){
  const wood=[.33,.19,.11,6],iron=[.14,.13,.12,4];
  for(const hatch of castle.hatches){
    const width=hatch.x1-hatch.x0,length=hatch.z1-hatch.z0;
    const f=subF(frame((hatch.x0+hatch.x1)/2,hatch.z0),[0,CASTLE_GALLERY,0],rX(hatchAngle(hatch,time)));
    for(let i=0;i<6;i++)slab(f,[(i-2.5)*width/6,-.045,length/2],[width/6-.011,.085,length],wood);
    for(const x of [-.32,.32])slab(f,[x,.001,length/2],[.056,.013,length-.09],iron);
    slab(f,[0,.025,length*.80],[.19,.036,.045],iron);
  }
}

// A distant painted-style skyline generated on the GPU, visible only through the slits.
export function createCastleValley(){
  const geometry=new THREE.PlaneGeometry(56,32);
  const material=new THREE.ShaderMaterial({fog:false,side:THREE.DoubleSide,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;
      float hash(float x){return fract(sin(x*45.81)*43758.5453);}
      float noise(float x){float i=floor(x),f=fract(x);return mix(hash(i),hash(i+1.),f*f*(3.-2.*f));}
      void main(){
        vec2 p=vec2(vUv.x,(vUv.y-.5)*(32./18.)+.5);
        vec3 sky=mix(vec3(.70,.75,.73),vec3(.26,.37,.43),smoothstep(.39,.84,p.y));
        vec3 col=sky+vec3(.12,.09,.051)*exp(-length((p-vec2(.64,.65))*vec2(4.,2.2))*4.);
        for(int i=0;i<5;i++){
          float k=float(i),x=p.x*(13.+k*5.)+k*11.;
          float ridge=.59-k*.052+noise(x)*(.10+k*.012)+noise(x*3.2)*.024+noise(x*10.)*.008;
          vec3 hill=mix(vec3(.47,.55,.55),vec3(.115,.23,.26),k/4.);
          float haze=exp(-abs(p.y-ridge+.10)*15.);
          hill=mix(hill,vec3(.59,.66,.65),haze*(.63-k*.075));
          col=mix(col,hill,1.-smoothstep(ridge-.004,ridge+.003,p.y));
        }
        float fog=sin(p.y*104.+sin(p.x*27.)*.92)*.035+.09;
        col=mix(col,vec3(.66,.70,.69),fog*(1.-smoothstep(.52,.77,p.y)));
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`
  });
  const valley=new THREE.Mesh(geometry,material);
  valley.name='Misty valley';valley.position.set(10,2.5,-9);
  return valley;
}
