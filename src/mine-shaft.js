import * as THREE from 'three';

const boxGeometry=new THREE.BoxGeometry();
const boulderGeometry=new THREE.IcosahedronGeometry(1,1);
const rock=new THREE.MeshStandardMaterial({color:0x776a72,roughness:0.93});
rock.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 shaftRock;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
    #include <begin_vertex>
    vec4 shaftPoint=vec4(position,1.0);
    #ifdef USE_INSTANCING
      shaftPoint=instanceMatrix*shaftPoint;
    #endif
    shaftRock=(modelMatrix*shaftPoint).xyz;`);
  shader.fragmentShader=`varying vec3 shaftRock;
    float shaftHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float shaftNoise(vec3 p){
      vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(mix(shaftHash(i),shaftHash(i+vec3(1,0,0)),f.x),
                     mix(shaftHash(i+vec3(0,1,0)),shaftHash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(shaftHash(i+vec3(0,0,1)),shaftHash(i+vec3(1,0,1)),f.x),
                     mix(shaftHash(i+vec3(0,1,1)),shaftHash(i+vec3(1,1,1)),f.x),f.y),f.z);
    }\n`+shader.fragmentShader.replace('#include <color_fragment>',`
    #include <color_fragment>
    vec3 p=shaftRock;
    float broad=shaftNoise(p*1.45),grain=shaftNoise(p*21.0);
    float bands=p.y*3.0+p.z*0.82-p.x*0.48+1.42*broad;
    float strata=smoothstep(-0.6,0.8,sin(bands));
    float seam=pow(max(0.0,sin(bands*0.58)),19.0)*smoothstep(0.31,0.61,broad);
    diffuseColor.rgb*=0.48+0.42*broad+0.20*strata+0.13*grain;
    diffuseColor.rgb+=vec3(0.108,0.080,0.092)*seam;
  `);
};
const timber=new THREE.MeshStandardMaterial({color:0x78503b,roughness:0.87});
const steel=new THREE.MeshStandardMaterial({color:0x424454,metalness:0.54,roughness:0.57});
const lampMaterial=new THREE.MeshBasicMaterial({color:0xffc280});
const floorMaterial=new THREE.MeshStandardMaterial({roughness:0.93});
const calcite=new THREE.MeshStandardMaterial({color:0xa8b4cb,emissive:0x292d46,emissiveIntensity:0.4,roughness:0.45,metalness:0.2});
const dimension=0.83,rows=8,columns=5;
export const landingMazeZ=-12.58;

function beam(group,material,x,y,z,w,h,d){
  const mesh=new THREE.Mesh(boxGeometry,material);
  mesh.position.set(x,y,z);mesh.scale.set(w,h,d);group.add(mesh);
}

export function createMineLanding({height,numberSign,sampleFloor}){
  const group=new THREE.Group();
  const socket=-11.14,platformDepth=1.73;
  // Support sets frame the open landing. The faces between them remain bare rock.
  beam(group,rock,0,(height+3.54)/2,socket-0.34,6.05,height-3.54,0.58);
  beam(group,steel,0,-0.13,socket-platformDepth/2+0.14,5.15,0.23,platformDepth+0.18);
  beam(group,timber,0,0.028,socket+0.13,4.74,0.075,0.22);
  for(const x of [-2.36,2.36]){
    beam(group,rock,x*1.25,height/2-0.32,-8.92,0.51,height,5.16);
    beam(group,steel,x*0.86,height/2-0.16,-8.02,0.083,height+0.01,0.16);
    beam(group,timber,x,1.41,socket,0.29,2.84,0.42);
    beam(group,steel,x,0.25,socket+0.15,0.36,0.24,0.33);
    beam(group,lampMaterial,x*0.77,2.61,socket+0.18,0.26,0.095,0.12);
  }
  beam(group,timber,0,2.94,socket,5.0,0.28,0.48);
  beam(group,steel,0,3.09,socket+0.16,2.12,0.11,0.19);
  const plaque=numberSign(group,socket+0.27);
  // The opposite wall closes off the cut without making a wall on the platform.
  beam(group,rock,0,height/2-0.31,-6.35,6.0,height,0.30);

  const stones=new THREE.InstancedMesh(boulderGeometry,rock,92);
  const minerals=new THREE.InstancedMesh(boulderGeometry,calcite,42);
  const terrain=new THREE.InstancedMesh(boxGeometry,floorMaterial,rows*columns*2);
  const tile=new THREE.Object3D(),shade=new THREE.Color(),base=new THREE.Color();
  const alcove=new THREE.Group();
  alcove.add(terrain);group.add(stones,minerals,alcove);
  beam(alcove,rock,0,1.6,socket-1.75-rows*dimension,5.4,3.5,0.2);
  for(const side of [-1,1])beam(alcove,rock,side*2.23,1.3,socket-4.83,0.33,3.1,7.65);
  const lantern=new THREE.PointLight(0xffcda4,38,10);
  lantern.position.set(-1.34,2.27,socket-0.45);
  alcove.add(lantern);
  const mazeMount=new THREE.Group();mazeMount.position.z=landingMazeZ;group.add(mazeMount);
  let lastKey='',lastFloor;
  function assign(mesh,i,x,y,z,w,h,d,r=0){
    tile.position.set(x,y,z);tile.scale.set(w,h,d);tile.rotation.set(r*0.62,r,r*0.32);
    tile.updateMatrix();mesh.setMatrixAt(i,tile.matrix);
  }
  function update(seed,depth,prepared){
    const key=seed+':'+depth;
    if(key===lastKey&&(!prepared||prepared===lastFloor))return;
    lastKey=key;
    const hash=(i,s)=>{
      const n=Math.sin(i*127.1+s*81.77+depth*19.13)*43758.5453;
      return n-Math.floor(n);
    };
    for(let i=0;i<stones.count;i++){
      const side=i%2===0?-1:1,broad=i>=68;
      const x=broad?(hash(i,2)-0.5)*5.65:side*(3.18+hash(i,3)*0.31);
      const y=broad?4.04+hash(i,3)*(height-4.9):hash(i,4)*height-0.2;
      const z=broad?socket-0.78-hash(i,4)*0.26:-11.04+hash(i,5)*4.60;
      const w=0.34+hash(i,6)*(broad?0.31:0.71);
      const h=0.25+hash(i,7)*(broad?0.35:0.43);
      const d=0.32+hash(i,8)*(broad?0.32:0.63);
      assign(stones,i,x,y,z,w,h,d,hash(i,9)*6.28);
      shade.setHex(i%19===0?0xbbb9ce:i%8===0?0xc79c8f:0x9d8f9d).multiplyScalar(0.55+hash(i,11)*0.58);
      stones.setColorAt(i,shade);
    }
    stones.instanceMatrix.needsUpdate=true;stones.instanceColor.needsUpdate=true;stones.computeBoundingSphere();
    for(let i=0;i<minerals.count;i++){
      const cluster=Math.floor(i/7),side=cluster%2===0?1:-1;
      assign(minerals,i,side*(2.87-hash(i,1)*0.16),0.65+cluster*height/7+hash(i,3)*0.48,
        -10.7+hash(cluster,5)*3.44+hash(i,6)*0.52,0.06+hash(i,6)*0.08,0.11+hash(i,7)*0.20,0.05+hash(i,8)*0.10,hash(i,2)*5.5);
      minerals.setColorAt(i,shade.setHex(cluster%3===0?0xa7a1d9:cluster%3===1?0x8fc4b4:0xcf8f56));
    }
    minerals.instanceMatrix.needsUpdate=true;minerals.instanceColor.needsUpdate=true;minerals.computeBoundingSphere();
    const floor=prepared||(depth>0?sampleFloor(seed,depth):null);
    lastFloor=floor;
    plaque.setLabel(floor?['FLOOR '+depth,floor.name]:['L','ENTRANCE HALL']);
    alcove.visible=!!floor;
    if(!floor)return;
    const fx=Math.round(Math.cos(floor.start.yaw)),fz=Math.round(Math.sin(floor.start.yaw));
    base.setRGB(...floor.stone);
    lantern.color.setHex(floor.forest?0x9eeab8:floor.dark?0x97aaff:floor.back?0xe8e7a1:floor.kind==='cave'?0xaabeff:0xffc294);
    let n=0;
    for(let row=0;row<rows;row++)for(let col=-2;col<=2;col++){
      const x=floor.start.tx+fx*row-fz*col,z=floor.start.ty+fz*row+fx*col;
      const tileIndex=z*floor.W+x;
      const open=x>=0&&z>=0&&x<floor.W&&z<floor.H&&floor.g[tileIndex]===0;
      const wx=col*dimension,wz=socket-platformDepth-row*dimension;
      assign(terrain,n,wx,-0.061,wz,dimension*0.988,0.127,dimension*0.988);
      shade.copy(base).multiplyScalar((floor.safeMask[tileIndex]?1.28:0.78)+hash(n,12)*0.24);
      terrain.setColorAt(n++,shade);
      if(!open){
        const h=floor.kind==='cave'?1.1+hash(n,13)*0.45:1.89+hash(n,13)*0.36;
        assign(terrain,n,wx,h/2,wz,dimension*0.986,h,dimension*0.986);
        terrain.setColorAt(n++,shade.copy(base).multiplyScalar(0.84+hash(n,14)*0.36));
      }
    }
    terrain.count=n;terrain.instanceMatrix.needsUpdate=true;terrain.instanceColor.needsUpdate=true;
    terrain.computeBoundingSphere();
  }
  return {group,update,setMaze(model){
    if((mazeMount.children[0]||null)===model&&terrain.visible===!model)return;
    mazeMount.clear();
    if(model)mazeMount.add(model);
    terrain.visible=!model;
    for(const child of alcove.children)if(child!==terrain&&!child.isLight)child.visible=!model;
  }};
}

export function createMineRockGap(){
  const group=new THREE.Group();
  // Stretch just the continuous shaft walls below the previous landing while
  // the platform and the selected landing keep their normal dimensions.
  beam(group,rock,-2.98,-0.5,-8.78,0.48,1,5.3);
  beam(group,rock,2.98,-0.5,-8.78,0.48,1,5.3);
  beam(group,rock,0,-0.5,-11.25,6.1,1,0.46);
  beam(group,rock,0,-0.5,-6.28,6.1,1,0.42);
  for(const side of [-1,1]){
    beam(group,steel,side*2.03,-0.5,-8.02,0.082,1,0.15);
    beam(group,calcite,side*2.73,-0.5,-9.59+side*0.33,0.09,1,0.18);
  }
  return {group,resize(top,height){
    group.visible=height>0.001;
    group.position.y=top;
    group.scale.y=Math.max(height,0.001);
  }};
}
