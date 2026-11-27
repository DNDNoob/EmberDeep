import * as THREE from 'three';
import {BUNK_DOOR} from './bunk-room.js';
import {TELESCOPE_MAG} from './kepler-orrery.js';

const halfWidth=20.65, front=-7.14, rear=15.12, spring=5.5, rise=5.65;
const rockMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.94,side:THREE.DoubleSide});
const ribMaterial=new THREE.MeshStandardMaterial({color:0x444052,roughness:0.83,side:THREE.DoubleSide});
const trimMaterial=new THREE.MeshStandardMaterial({color:0x997346,metalness:0.51,roughness:0.5,side:THREE.DoubleSide});
const blueLight=new THREE.MeshBasicMaterial({color:0x8bbbd9});
const cube=new THREE.BoxGeometry();

function triangleMesh(parent,points,colors,material){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  if(colors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  parent.add(new THREE.Mesh(geometry,material));
}

function block(parent,material,x,y,z,w,h,d){
  const mesh=new THREE.Mesh(cube,material);
  mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);
}

function arch(u,z,inset=0){
  const angle=Math.PI*u;
  return [-halfWidth*Math.cos(angle),spring+(rise-inset)*Math.sin(angle)-inset,z];
}

function vault(parent){
  const points=[],colors=[],c=new THREE.Color();
  const n=44,m=13,depth=rear-front;
  for(let row=0;row<m;row++)for(let col=0;col<n;col++){
    const offset=row%2===0?0:0.36;
    const left=Math.max(0,col+offset-0.02),right=Math.min(n,col+1+offset-0.024);
    const z0=front+depth*row/m+0.018,z1=front+depth*(row+1)/m-0.018;
    const a=arch(left/n,z0),b=arch(right/n,z0),d=arch(left/n,z1),e=arch(right/n,z1);
    c.setHex(0x4b4655).multiplyScalar(0.67+0.33*Math.abs(Math.sin(row*7.31+col*4.74)));
    points.push(...a,...b,...d,...b,...e,...d);
    for(let i=0;i<6;i++)colors.push(c.r,c.g,c.b);
    if(left>0&&col===0){
      const edgeA=arch(0,z0),edgeB=arch(0,z1);
      points.push(...edgeA,...a,...edgeB,...a,...d,...edgeB);
      for(let i=0;i<6;i++)colors.push(c.r,c.g,c.b);
    }
  }
  // Close the narrow masonry joints with a continuous rock shell.
  const backing=[];
  for(let i=0;i<n;i++){
    const a=arch(i/n,front,-0.11),b=arch((i+1)/n,front,-0.11);
    const d=arch(i/n,rear,-0.11),e=arch((i+1)/n,rear,-0.11);
    backing.push(...a,...b,...d,...b,...e,...d);
  }
  triangleMesh(parent,backing,null,ribMaterial);
  triangleMesh(parent,points,colors,rockMaterial);

  function band(z,width,inset,material){
    const vertices=[];
    for(let i=0;i<n;i++){
      const a=arch(i/n,z-width/2,inset),b=arch((i+1)/n,z-width/2,inset);
      const d=arch(i/n,z+width/2,inset),e=arch((i+1)/n,z+width/2,inset);
      const aa=arch(i/n,z-width/2),bb=arch((i+1)/n,z-width/2);
      const dd=arch(i/n,z+width/2),ee=arch((i+1)/n,z+width/2);
      vertices.push(...a,...b,...d,...b,...e,...d,...aa,...bb,...a,...a,...bb,...b,...dd,...d,...ee,...d,...e,...ee);
    }
    triangleMesh(parent,vertices,null,material);
  }
  for(const z of [-6.83,-2.45,2.25,7,11.7,14.78]){
    band(z,0.43,0.3,ribMaterial);
    band(z-0.16,0.052,0.33,trimMaterial);
    band(z+0.16,0.052,0.33,trimMaterial);
  }
  // The two end walls fill the arch above the unchanged archive entrances.
  for(const z of [front+0.045,rear-0.05]){
    const fill=[];
    for(let i=0;i<n;i++){
      const a=arch(i/n,z),b=arch((i+1)/n,z);
      const d=[a[0],4.4,z],e=[b[0],4.4,z];
      fill.push(...d,...e,...a,...a,...e,...b);
    }
    triangleMesh(parent,fill,null,ribMaterial);
  }
}

// Irregular, continuous rock surfaces use the same strata on the exposed wall
// and on the shoulders of the cutout around the glass.
function rockFace(parent,side,z0,z1,bottom,top,seed){
  const mid=(z0+z1)/2;
  const cols=Math.ceil((z1-z0)*3.25),rows=Math.max(2,Math.ceil((top(mid)-bottom(mid))*2.5));
  const points=[],colors=[],grid=[];
  const color=new THREE.Color();
  const hash=(a,b)=>{const v=Math.sin(a*127.1+b*311.7+seed*74.78)*43758.5453;return v-Math.floor(v)};
  for(let row=0;row<=rows;row++){
    const line=[];
    for(let col=0;col<=cols;col++){
      const edge=col===0||col===cols;
      const z=z0+(z1-z0)*(col+(edge?0:(hash(col,row)-0.5)*0.62))/cols;
      const v=(row+(row===0||row===rows?0:(hash(row,col+7)-0.5)*0.62))/rows;
      const y=THREE.MathUtils.lerp(bottom(z),top(z),v);
      const layers=Math.sin(y*5.6+z*0.63)*0.13+Math.sin(y*2.6-z*0.47)*0.17;
      const bump=layers+0.24*(hash(col+4,row+9)-0.5)+0.19*Math.sin(z*1.73+y*0.76);
      const nearBunk=1-THREE.MathUtils.smoothstep(Math.abs(z-BUNK_DOOR.z),2.95,3.4);
      const wall=side===1?Math.min(20.84,20.69+bump):THREE.MathUtils.lerp(20.69+bump,Math.min(20.86,20.69+bump),nearBunk);
      line.push([side*wall,y,z]);
    }
    grid.push(line);
  }
  function face(a,b,c,id){
    points.push(...a,...b,...c);
    const y=(a[1]+b[1]+c[1])/3,z=(a[2]+b[2]+c[2])/3;
    const seam=Math.sin(y*5.4+z*0.64),mineral=seam>0.89&&hash(id,6)>0.35;
    color.setHex(mineral?(side===1?0x887181:0x8c7060):(side===1?0x554756:0x695456))
      .multiplyScalar(0.53+0.37*hash(id,3)+0.18*Math.cos(y*2.7-z*0.6));
    for(let i=0;i<3;i++)colors.push(color.r,color.g,color.b);
  }
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const a=grid[r][c],b=grid[r][c+1],d=grid[r+1][c],e=grid[r+1][c+1],id=(r*cols+c)*2;
    if((c+r)%2){face(a,b,e,id);face(a,e,d,id+1)}
    else{face(a,b,d,id);face(b,e,d,id+1)}
  }
  triangleMesh(parent,points,colors,rockMaterial);
}

function observationWindow(parent){
  const body=()=>new THREE.Vector4();
  const tint=()=>new THREE.Vector3(1,1,1);
  const shader=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,
    uniforms:{
      uTime:{value:0},
      uMag:{value:1},
      uRoll:{value:0},
      uStation:{value:new THREE.Vector3()},
      uForward:{value:new THREE.Vector3(1,0,0)},
      uRight:{value:new THREE.Vector3(0,0,1)},
      uUp:{value:new THREE.Vector3(0,1,0)},
      uBody:{value:[body(),body(),body(),body(),body(),body(),body(),body()]},
      uTint:{value:[tint(),tint(),tint(),tint(),tint(),tint(),tint(),tint()]}
    },
    vertexShader:`
      varying vec3 world;
      varying vec2 pane;
      void main(){
        pane=uv;
        world=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
      }`,
    fragmentShader:`
      varying vec3 world;
      varying vec2 pane;
      uniform float uTime;
      uniform float uMag;
      uniform float uRoll;
      uniform vec3 uStation;
      uniform vec3 uForward;
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform vec4 uBody[8];
      uniform vec3 uTint[8];
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      vec3 stars(vec2 p,float scale,float chance,float seed){
        vec2 cell=floor(p*scale),uv=fract(p*scale);
        float luck=hash(cell+seed);
        vec2 offset=vec2(hash(cell+5.7),hash(cell-6.3))*0.72+0.14;
        float d=length(uv-offset);
        float width=max(length(fwidth(p))*scale,0.045);
        float bright=(1.0-smoothstep(0.035,width*1.07+0.066,d))*step(chance,luck);
        return bright*mix(vec3(0.29,0.54,0.99),vec3(1.0,0.78,0.54),hash(cell+19.5))*(0.29+0.63*luck);
      }
      vec3 disc(vec3 sky,vec2 coords,vec2 center,float r,vec3 base,vec3 pale,float bands,float rocky){
        vec2 p=(coords-center)/max(r,1e-4);
        float d2=dot(p,p),edge=max(fwidth(d2),0.01);
        float cs=cos(uRoll),sn=sin(uRoll);
        vec2 pr=mat2(cs,sn,-sn,cs)*p;
        vec3 n=vec3(p,sqrt(max(0.0,1.0-d2)));
        float sunlight=smoothstep(-0.22,0.58,dot(n,normalize(vec3(-0.48,0.66,0.42))));
        float stripe=sin(pr.y*(rocky>0.5?8.0:16.0)+pr.x*(rocky>0.5?2.4:1.3)+sin(pr.x*4.2+pr.y*6.0));
        float grain=hash(floor(pr*vec2(rocky>0.5?22.0:7.0,rocky>0.5?16.0:5.0)+9.0));
        float mark=mix(smoothstep(0.18,0.82,stripe*0.5+0.5),grain,rocky);
        float rim=pow(max(0.0,1.0-n.z),2.7);
        vec3 surface=mix(base,pale,0.2+mark*bands)*(0.07+0.93*sunlight)+pale*rim*sunlight*0.3;
        sky+=pale*exp(-max(0.0,sqrt(d2)-1.0)*16.0)*step(1.0,d2)*0.18;
        return mix(sky,surface,1.0-smoothstep(1.0-edge,1.0+edge,d2));
      }
      vec3 sun(vec3 sky,vec2 coords,vec2 center,float r,vec3 tint){
        float d=length((coords-center)/max(r,1e-4));
        float core=smoothstep(1.2,0.15,d);
        float glow=exp(-max(0.0,d-0.45)*1.25);
        return sky+tint*(core*1.25+glow*0.85);
      }
      float rings(vec2 p){
        p=mat2(0.94,0.34,-0.34,0.94)*p;
        float d=length(p/vec2(1.0,0.31));
        return smoothstep(1.55,1.72,d)*(1.0-smoothstep(4.9,5.35,d))*(0.58+0.42*sin(d*28.0));
      }
      void main(){
        vec3 ray=normalize(world-cameraPosition);
        vec2 paneAng=ray.zy/max(ray.x,0.05);
        float mag=max(uMag,0.001);
        float cs=cos(uRoll),sn=sin(uRoll);
        vec2 inertial=mat2(cs,sn,-sn,cs)*(paneAng/mag);
        vec3 dir=normalize(uForward+uRight*(paneAng.x/mag)+uUp*(paneAng.y/mag));
        float dust=0.0;
        if(abs(dir.y)>0.003){
          float lam=-uStation.y/dir.y;
          if(lam>0.05){
            vec2 hit=uStation.xz+dir.xz*lam;
            dust=exp(-pow((length(hit)-1.19)*5.5,2.0))*exp(-lam*0.22);
          }
        }
        vec3 color=vec3(0.003,0.005,0.014);
        color+=vec3(0.45,0.52,0.58)*dust*0.22;
        color+=stars(inertial,14.0,0.962,4.8)*(0.7+0.16*sin(uTime*1.3+inertial.x))+stars(inertial,34.0,0.986,8.7)*0.62;
        float lane=exp(-pow(inertial.y*7.0,2.0))*0.045;
        color+=vec3(0.16,0.18,0.26)*lane;
        for(int i=0;i<8;i++){
          vec4 b=uBody[i];
          if(b.z>0.0001){
            vec3 tint=uTint[i];
            vec2 local=mat2(cs,sn,-sn,cs)*((paneAng-b.xy)/max(b.z,1e-4));
            if(b.w>1.5 && b.w<2.5) color=mix(color,tint,rings(local)*0.62);
            if(b.w>0.5 && b.w<1.5) color=sun(color,paneAng,b.xy,b.z,tint);
            else color=disc(color,paneAng,b.xy,b.z,tint*0.42,tint,b.w>3.5?0.72:0.48,b.w>2.5 && b.w<3.5?1.0:0.0);
            if(b.w>1.5 && b.w<2.5) color=mix(color,tint,rings(local)*smoothstep(-0.05,0.2,local.y)*0.5);
          }
        }
        float glassEdge=pow(1.0-max(0.0,ray.x),3.0);
        float glare=exp(-pow((pane.y-0.87+0.27*pane.x)*44.0,2.0));
        float lower=exp(-pow((pane.y-0.11+0.09*pane.x)*84.0,2.0));
        color+=vec3(0.063,0.117,0.17)*(glassEdge*0.48+glare*0.105+lower*0.058+0.08);
        gl_FragColor=vec4(color,1.0);
        #include <colorspace_fragment>
      }`
  });
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(20.65,5.31),shader);
  glass.rotation.y=-Math.PI/2;glass.position.set(20.92,2.67,4);parent.add(glass);

  // The retaining frame is one continuous sill and lintel, with no mullions.
  for(const y of [0.45,5.13]){
    block(parent,ribMaterial,20.57,y,4,0.38,0.20,19.28);
    block(parent,trimMaterial,20.34,y+0.019,4,0.061,0.044,18.98);
  }
  for(const z of [-5.62,13.62])block(parent,trimMaterial,20.54,2.79,z,0.22,4.68,0.15);
  for(const z of [-5.25,13.25]){
    block(parent,blueLight,20.3,0.59,z,0.045,0.04,0.29);
    block(parent,blueLight,20.3,5.0,z,0.045,0.04,0.29);
  }
  return shader;
}

// Stands on the room side of the glass, right of the aim, so Obera stays clear.
export const TELESCOPE_PANEL={x:19.48,y:1.46,z:7.15,w:2.4,h:1.5};

function telescopePanel(parent){
  const {x,y,z,w,h}=TELESCOPE_PANEL;
  block(parent,ribMaterial,x+0.12,0.46,z,0.36,0.92,0.62);
  block(parent,trimMaterial,x+0.1,0.94,z,0.5,0.06,0.78);
  block(parent,ribMaterial,x,y,z,0.1,h+0.14,w+0.14);
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=640;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#14110e';ctx.fillRect(0,0,1024,640);
  ctx.strokeStyle='#c6a15a';ctx.lineWidth=12;ctx.strokeRect(16,16,992,608);
  ctx.strokeStyle='#6d522c';ctx.lineWidth=3;ctx.strokeRect(34,34,956,572);
  ctx.textAlign='center';
  ctx.fillStyle='#e7d3a8';ctx.font='600 52px Georgia, serif';
  ctx.fillText('KEPLER-47 TELESCOPE',512,108);
  ctx.fillStyle='#b89a6c';ctx.font='500 34px Georgia, serif';
  ctx.fillText('MAGNIFICATION',512,186);
  ctx.fillStyle='#fff1d2';ctx.font='600 124px Georgia, serif';
  ctx.fillText(TELESCOPE_MAG.toFixed(2)+'\u00d7',512,330);
  ctx.fillStyle='#f0d7a4';ctx.font='500 42px Georgia, serif';
  ctx.fillText('POSITION LOCKED',512,430);
  ctx.fillText('MAGNIFICATION LOCKED',512,490);
  ctx.fillStyle='#d7b98a';ctx.font='500 32px Georgia, serif';
  ctx.fillText('CONSULT TECHNICIAN MANUAL TO RESTART',512,568);
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map}));
  face.position.set(x-0.07,y,z);
  face.rotation.y=Math.PI/2;
  parent.add(face);
}

export function buildAsteroidLobby(parent){
  vault(parent);
  const floor=()=>-0.1,roof=()=>spring+0.08;
  const entryStart=BUNK_DOOR.z-BUNK_DOOR.half,entryEnd=BUNK_DOOR.z+BUNK_DOOR.half;
  rockFace(parent,-1,front,entryStart,floor,roof,3);
  rockFace(parent,-1,entryStart,entryEnd,()=>BUNK_DOOR.height+0.12,roof,3);
  rockFace(parent,-1,entryEnd,rear,floor,roof,3);
  const sky=observationWindow(parent);
  telescopePanel(parent);
  rockFace(parent,1,front,-5.65,floor,roof,5);
  rockFace(parent,1,13.65,rear,floor,roof,9);
  rockFace(parent,1,-5.95,13.95,floor,z=>0.61+0.20*Math.sin(z*0.86)+0.14*Math.sin(z*2.14),7);
  rockFace(parent,1,-5.95,13.95,z=>5.03-0.20*Math.sin(z*0.96)-0.13*Math.sin(z*2.51),roof,11);
  return sky;
}
