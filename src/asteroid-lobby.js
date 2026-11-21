import * as THREE from 'three';

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
      line.push([side*(side===1?Math.min(20.84,20.69+bump):20.69+bump),y,z]);
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
  const shader=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,
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
      vec3 planet(vec3 sky,vec2 coords,vec2 center,float r,vec3 base,vec3 pale,float bands){
        vec2 p=(coords-center)/r;
        float d=dot(p,p),edge=max(fwidth(d),0.013);
        vec3 n=vec3(p,sqrt(max(0.0,1.0-d)));
        float sunlight=smoothstep(-0.17,0.49,dot(n,normalize(vec3(-0.61,0.64,0.52))));
        float stripe=sin(p.y*22.0+p.x*2.0+sin(p.x*5.0+p.y*7.0)*1.15);
        float clouds=smoothstep(0.24,0.81,stripe*0.5+0.5);
        float rim=pow(max(0.0,1.0-n.z),2.8);
        vec3 surface=mix(base,pale,0.22+clouds*bands)*(0.09+0.92*sunlight)+pale*rim*sunlight*0.26;
        sky+=pale*exp(-max(0.0,sqrt(d)-1.0)*24.0)*step(1.0,d)*0.105;
        return mix(sky,surface,1.0-smoothstep(1.0-edge,1.0+edge,d));
      }
      float rings(vec2 p){
        p=mat2(0.94,0.34,-0.34,0.94)*p;
        float d=length(p/vec2(1.0,0.31));
        return smoothstep(1.29,1.40,d)*(1.0-smoothstep(1.91,2.04,d))*(0.61+0.39*sin(d*38.0));
      }
      void main(){
        vec3 ray=normalize(world-cameraPosition);
        vec2 p=ray.zy/max(ray.x,0.05);
        float dust=exp(-pow((p.y+0.11*p.x-0.028)*6.5,2.0))*exp(-dot(p,p)*0.43);
        dust*=0.56+0.21*sin(13.0*p.x+18.0*p.y)+0.11*sin(32.0*p.x-21.0*p.y);
        vec3 color=vec3(0.003,0.005,0.014)+dust*vec3(0.020,0.017,0.048);
        color+=stars(p,115.0,0.953,4.8)*0.52+stars(p,59.0,0.983,8.7)*0.91;
        vec2 gold=vec2(-0.069,0.094);
        vec2 ring=(p-gold)/0.023;
        float r=rings(ring);
        color=mix(color,vec3(0.45,0.30,0.18),r*0.64);
        color=planet(color,p,gold,0.023,vec3(0.42,0.24,0.12),vec3(0.95,0.68,0.38),0.55);
        color=mix(color,vec3(0.61,0.41,0.25),r*smoothstep(0.0,0.14,ring.y)*0.52);
        color=planet(color,p,vec2(0.18,0.048),0.034,vec3(0.079,0.28,0.46),vec3(0.48,0.78,0.97),0.63);
        color=planet(color,p,vec2(0.315,0.143),0.014,vec3(0.36,0.115,0.085),vec3(0.87,0.45,0.29),0.43);
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
}

export function buildAsteroidLobby(parent){
  vault(parent);
  const floor=()=>-0.1,roof=()=>spring+0.08;
  rockFace(parent,-1,front,rear,floor,roof,3);
  observationWindow(parent);
  rockFace(parent,1,front,-5.65,floor,roof,5);
  rockFace(parent,1,13.65,rear,floor,roof,9);
  rockFace(parent,1,-5.95,13.95,floor,z=>0.61+0.20*Math.sin(z*0.86)+0.14*Math.sin(z*2.14),7);
  rockFace(parent,1,-5.95,13.95,z=>5.03-0.20*Math.sin(z*0.96)-0.13*Math.sin(z*2.51),roof,11);
}
