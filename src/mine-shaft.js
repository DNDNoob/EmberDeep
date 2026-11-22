import * as THREE from 'three';

const boxGeometry=new THREE.BoxGeometry();
const boulderGeometry=new THREE.IcosahedronGeometry(1,1);

// High-quality precomputed noise texture (preserves all original detail, far cheaper at runtime)
function makeNoiseTexture(size=256){
  const data=new Uint8Array(size*size*4);
  const hash=(x,y)=>{
    let n=Math.sin(x*127.1+y*311.7)*43758.5453;
    return n-Math.floor(n);
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4;
    const n=hash(x,y);
    const v=Math.floor(n*255);
    data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.magFilter=THREE.LinearFilter;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.needsUpdate=true;
  tex.generateMipmaps=true;
  return tex;
}
const noiseTex=makeNoiseTexture(512); // high res for full detail

const rock=new THREE.MeshStandardMaterial({color:0x776a72,roughness:0.93});
rock.onBeforeCompile=shader=>{
  shader.uniforms.noiseMap={value:noiseTex};
  shader.vertexShader='varying vec3 shaftRock;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
    #include <begin_vertex>
    vec4 shaftPoint=vec4(position,1.0);
    #ifdef USE_INSTANCING
      shaftPoint=instanceMatrix*shaftPoint;
    #endif
    shaftRock=(modelMatrix*shaftPoint).xyz;`);
  shader.fragmentShader=`varying vec3 shaftRock;
    uniform sampler2D noiseMap;
    float shaftNoise(vec3 p){
      // Project world position onto 2D noise plane (preserves the original layered look)
      vec2 uv=p.xz*0.15+p.y*0.07;
      return texture2D(noiseMap,uv).r;
    }\n`+shader.fragmentShader.replace('#include <color_fragment>',`
    #include <color_fragment>
    vec3 p=shaftRock;
    float broad=shaftNoise(p*1.45);
    float grain=shaftNoise(p*21.0);
    float bands=p.y*3.0+p.z*0.82-p.x*0.48+1.42*broad;
    float strata=smoothstep(-0.6,0.8,sin(bands));
    float seam=pow(max(0.0,sin(bands*0.58)),19.0)*smoothstep(0.31,0.61,broad);
    diffuseColor.rgb*=0.48+0.42*broad+0.20*strata+0.13*grain;
    diffuseColor.rgb+=vec3(0.108,0.080,0.092)*seam;
  `);
};
rock.customProgramCacheKey=()=>'rock-noise-tex';
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

export function createShaftHead(){
  const group=new THREE.Group();
  beam(group,rock,0,1.76,-11.64,6.1,4.28,0.78);
  beam(group,rock,0,3.87,-9.3,6.1,0.58,4.96);
  beam(group,steel,0,-0.15,-11.29,4.76,0.31,0.83);
  beam(group,timber,0,2.92,-11.07,5.2,0.22,0.34);
  for(const side of [-1,1]){
    beam(group,timber,side*2.23,1.37,-11.07,0.23,2.94,0.34);
    for(let i=0;i<7;i++){
      const stone=new THREE.Mesh(boulderGeometry,rock);
      stone.position.set(side*(2.6+0.16*Math.sin(i*6.4)),0.15+i*.51,-11.04+0.21*Math.cos(i*4.3));
      stone.scale.set(0.52,0.45,0.38);stone.rotation.set(i*.64,i*.85,i*.38);
      group.add(stone);
    }
  }
  const lamp=new THREE.PointLight(0xffd1a3,19,7);
  lamp.position.set(0,2.64,-10.76);group.add(lamp);
  beam(group,lampMaterial,0,2.79,-10.89,0.52,0.073,0.12);
  return group;
}

export function advanceLiftMotion(ride,elapsed,destination,ready){
  const dt=Math.min(elapsed,0.055);
  const acceleration=2.1,braking=1.6,cruise=THREE.MathUtils.clamp(destination/18,2.2,6);
  const remaining=destination-ride.travel;
  const desired=ready?Math.min(cruise,Math.sqrt(2*braking*remaining)):cruise;
  const speed=ride.speed+THREE.MathUtils.clamp(desired-ride.speed,-acceleration*dt,acceleration*dt);
  const movement=(speed+ride.speed)*0.5*dt;
  ride.speed=speed;
  const buffer=Math.max(3.8,cruise*cruise/(2*braking)+0.15);
  const approach=ready?remaining:Math.max(0,remaining-buffer);
  const travel=Math.min(approach,movement);
  ride.travel+=travel;
  if(!ready)ride.extra+=movement-travel;
  return ready&&movement>=remaining;
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
  stones.frustumCulled=minerals.frustumCulled=terrain.frustumCulled=false;
  terrain.visible=false;
  const tile=new THREE.Object3D(),shade=new THREE.Color(),base=new THREE.Color();
  const alcove=new THREE.Group();
  alcove.add(terrain);group.add(stones,minerals,alcove);
  beam(alcove,rock,0,1.6,socket-1.75-rows*dimension,5.4,3.5,0.2);
  for(const side of [-1,1])beam(alcove,rock,side*2.23,1.3,socket-4.83,0.33,3.1,7.65);
  const lantern=new THREE.PointLight(0xffcda4,38,10);
  lantern.position.set(-1.34,2.27,socket-0.45);
  alcove.add(lantern);
  const mazeMount=new THREE.Group();mazeMount.position.z=landingMazeZ;group.add(mazeMount);
  // A thick rock collar from the car to the landing mouth, so the cut is not a window onto the void.
  const vestibule=new THREE.Group();
  group.add(vestibule);
  const zNear=-11.06,zFar=-12.74,span=zNear-zFar,zMid=(zNear+zFar)/2;
  beam(vestibule,rock,-2.84,1.5,zMid,0.66,3.0,span);
  beam(vestibule,rock,2.84,1.5,zMid,0.66,3.0,span);
  beam(vestibule,rock,0,3.02,zMid,5.75,1.7,span);
  beam(vestibule,steel,0,-0.03,(-11.02+-12.46)/2,5.2,0.08,-11.02-(-12.46));
  const cap=new THREE.Mesh(boxGeometry,rock);
  cap.position.set(0,1.12,-12.5);cap.scale.set(4.9,2.24,0.18);vestibule.add(cap);
  vestibule.visible=false;
  let lastKey='',lastFloor,cursor=1e9,workKey='',workFloor=null;
  const stoneN=stones.count,mineralN=minerals.count,batch=24;
  function assign(mesh,i,x,y,z,w,h,d,r=0){
    tile.position.set(x,y,z);tile.scale.set(w,h,d);tile.rotation.set(r*0.62,r,r*0.32);
    tile.updateMatrix();mesh.setMatrixAt(i,tile.matrix);
  }
  function update(seed,depth,prepared){
    const key=seed+':'+depth;
    if(key!==workKey){workKey=key;cursor=0;workFloor=prepared||null}
    else if(cursor>=stoneN+mineralN)return false;
    const hash=(i,s)=>{
      const n=Math.sin(i*127.1+s*81.77+depth*19.13)*43758.5453;
      return n-Math.floor(n);
    };
    const end=Math.min(cursor+batch,stoneN+mineralN);
    for(let n=cursor;n<end;n++){
      if(n<stoneN){
        const i=n,side=i%2===0?-1:1,broad=i>=68;
        const x=broad?(hash(i,2)-0.5)*5.65:side*(3.18+hash(i,3)*0.31);
        const y=broad?4.04+hash(i,3)*(height-4.9):hash(i,4)*height-0.2;
        const z=broad?socket-0.78-hash(i,4)*0.26:-11.04+hash(i,5)*4.60;
        assign(stones,i,x,y,z,0.34+hash(i,6)*(broad?0.31:0.71),0.25+hash(i,7)*(broad?0.35:0.43),0.32+hash(i,8)*(broad?0.32:0.63),hash(i,9)*6.28);
        shade.setHex(i%19===0?0xbbb9ce:i%8===0?0xc79c8f:0x9d8f9d).multiplyScalar(0.55+hash(i,11)*0.58);
        stones.setColorAt(i,shade);
      }else{
        const i=n-stoneN,cluster=Math.floor(i/7),side=cluster%2===0?1:-1;
        assign(minerals,i,side*(2.87-hash(i,1)*0.16),0.65+cluster*height/7+hash(i,3)*0.48,
          -10.7+hash(cluster,5)*3.44+hash(i,6)*0.52,0.06+hash(i,6)*0.08,0.11+hash(i,7)*0.20,0.05+hash(i,8)*0.10,hash(i,2)*5.5);
        minerals.setColorAt(i,shade.setHex(cluster%3===0?0xa7a1d9:cluster%3===1?0x8fc4b4:0xcf8f56));
      }
    }
    cursor=end;
    stones.instanceMatrix.needsUpdate=stones.instanceColor.needsUpdate=true;
    minerals.instanceMatrix.needsUpdate=minerals.instanceColor.needsUpdate=true;
    if(cursor<stoneN+mineralN)return true;
    lastKey=key;lastFloor=workFloor;
    plaque.setLabel(workFloor?['FLOOR '+depth,workFloor.name]:['L','ENTRANCE HALL']);
    alcove.visible=vestibule.visible=!!workFloor;
    if(workFloor)lantern.color.setHex(workFloor.forest?0x9eeab8:workFloor.dark?0x97aaff:workFloor.back?0xe8e7a1:workFloor.kind==='cave'?0xaabeff:0xffc294);
    return true;
  }
  return {group,update,setMaze(model){
    if((mazeMount.children[0]||null)===model)return;
    mazeMount.clear();
    if(model)mazeMount.add(model);
    cap.visible=!model;
    terrain.visible=false;
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
