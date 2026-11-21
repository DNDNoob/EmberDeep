import * as THREE from 'three';
import {outpostArcade,outpostCamera,walkOutpost,TABLE_HEIGHT,TABLE_SCALE} from './moose-arcade.js';

export const MOOSE_TOWER_PRICE=3;
export const MOOSE_SPIKE_PRICE=5;
export const MOOSE_SYRUP_PRICE=3;
export const MOOSE_ACH={
  mooseWin:{title:'Welcome to Murica, the 51st state.',desc:'Survive all three rounds of Mosquito Outpost'},
  mooseLose:{title:'Maple syrup never tasted so sticky.',desc:'Lose a game of Mosquito Outpost'},
};

const COLS=15,ROWS=9;
const CORNERS=[[0,7],[3,7],[3,2],[7,2],[7,6],[11,6],[11,2],[14,2]];
const PATH=[CORNERS[0][1]*COLS+CORNERS[0][0]];
for(let i=1;i<CORNERS.length;i++){
  let [col,row]=CORNERS[i-1];
  const [endCol,endRow]=CORNERS[i],dx=Math.sign(endCol-col),dz=Math.sign(endRow-row);
  while(col!==endCol||row!==endRow){
    col+=dx;row+=dz;PATH.push(row*COLS+col);
  }
}
export const MOOSE_GRID={cols:COLS,rows:ROWS,path:PATH};
const TILES=Array.from({length:COLS*ROWS},(_,index)=>({
  x:index%COLS-(COLS-1)/2,z:Math.floor(index/COLS)-(ROWS-1)/2,path:PATH.indexOf(index),
}));
export const MOOSE_ROUNDS=[
  {hp:144,speed:1.65,gems:6,green:0,geese:1},
  {hp:192,speed:1.94,gems:8,green:.25,geese:2},
  {hp:204,speed:2.23,gems:12,green:.53,geese:3},
];
const RANGE=2.55,FLIGHT=.24,REVIVE_TIME=2.8,GOOSE_HP=8,LAST=PATH.length-1;
const MOTHER_GOOSE={hp:252,speed:1.98,gems:0,geese:0};
const HATCH_TIME=2.9;
const roundRules=index=>MOOSE_ROUNDS[index]||MOTHER_GOOSE;
const clamp=THREE.MathUtils.clamp;

function along(distance){
  const index=clamp(Math.floor(distance),0,PATH.length-2),t=clamp(distance-index,0,1);
  const a=TILES[PATH[index]],b=TILES[PATH[index+1]];
  return {x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t),yaw:Math.atan2(b.x-a.x,b.z-a.z)};
}

export function mooseDefenseGame(){
  const S={phase:'build',round:0,cleared:0,hp:MOOSE_ROUNDS[0].hp,distance:0,reviveT:0,
    towers:new Map(),traps:new Set(),syrups:new Set(),usedSyrup:new Set(),
    geese:[],shots:[],hits:[],slow:0,lastTile:-1,trapHit:false,
    crossedHalf:false,farthest:0,bonus:false,bonusWon:false,hatchT:0,mooseAt:0};
  const tick=1/60;
  let time=0;
  const placeable=()=>S.phase==='build'||S.phase==='break'||S.phase==='run';
  S.canBuild=i=>placeable()&&TILES[i]?.path===-1&&!S.towers.has(i);
  S.canSpike=i=>placeable()&&TILES[i]?.path>=0&&!S.traps.has(i)&&!S.syrups.has(i);
  S.build=(i,spend)=>{
    if(!S.canBuild(i)||!spend(MOOSE_TOWER_PRICE))return false;
    S.towers.set(i,0);return true;
  };
  S.spike=(i,spend)=>{
    if(!S.canSpike(i)||!spend(MOOSE_SPIKE_PRICE))return false;
    S.traps.add(i);return true;
  };
  S.syrup=(i,spend)=>{
    if(!S.canSpike(i)||!spend(MOOSE_SYRUP_PRICE))return false;
    S.syrups.add(i);return true;
  };
  S.launch=()=>{
    if(S.phase!=='build'&&S.phase!=='break')return false;
    if(S.phase==='break')S.round++;
    const round=roundRules(S.round);
    S.hp=round.hp;
    S.distance=S.slow=0;
    S.lastTile=-1;
    S.crossedHalf=false;
    S.farthest=0;
    S.geese=Array.from({length:round.geese},(_,i)=>({
      distance:-1.12-i*.98,hp:GOOSE_HP,slow:0,lastTile:-1,
    }));
    time=0;
    for(const i of S.towers.keys())S.towers.set(i,0);
    S.phase='run';return true;
  };
  S.skipBonus=()=>{
    if(S.phase!=='break'||!S.bonus)return false;
    S.phase='revive';return true;
  };
  function damage(enemy,amount){
    if(enemy.hp<=0)return;
    enemy.hp=Math.max(0,enemy.hp-amount);
    S.hits.push({goose:enemy!==S||S.round===MOOSE_ROUNDS.length,distance:enemy.distance,
      boss:enemy===S&&S.round===MOOSE_ROUNDS.length});
  }
  function march(enemy,speed,dt){
    if(enemy.hp<=0||enemy.distance>=LAST)return;
    enemy.distance=Math.min(LAST,enemy.distance+dt*speed*(enemy.slow>0?.54:1));
    enemy.slow=Math.max(0,enemy.slow-dt);
    const tile=Math.floor(enemy.distance+.5);
    if(enemy.distance<0||tile===enemy.lastTile)return;
    enemy.lastTile=tile;
    if(S.traps.delete(PATH[tile])){
      S.trapHit=true;damage(enemy,35);enemy.slow=1.2;
    }
    if(S.syrups.has(PATH[tile])){
      S.usedSyrup.add(PATH[tile]);enemy.slow=1.75;
    }
  }
  function advance(dt){
    if(S.phase==='hatch'){
      S.hatchT=Math.min(HATCH_TIME,S.hatchT+dt);
      if(S.hatchT>=HATCH_TIME)S.phase='revive';
      return;
    }
    if(S.phase==='revive'){
      S.reviveT=Math.min(REVIVE_TIME,S.reviveT+dt);
      if(S.reviveT>=REVIVE_TIME)S.phase='win';
      return;
    }
    if(S.phase!=='run')return;
    const round=roundRules(S.round),boss=S.round===MOOSE_ROUNDS.length;
    march(S,round.speed,dt);
    for(const goose of S.geese)march(goose,round.speed*.97,dt);
    S.farthest=Math.max(S.farthest,S.distance,...S.geese.map(g=>g.distance));
    if(S.round===2&&S.farthest>LAST/2)S.crossedHalf=true;
    for(let i=S.shots.length-1;i>=0;i--){
      const shot=S.shots[i];shot.age+=dt;
      if(shot.age>=FLIGHT){
        const target=shot.target<0?S:S.geese[shot.target];
        if(target.distance<LAST)damage(target,4);
        S.shots.splice(i,1);
      }
    }
    if(S.hp===0||S.distance>=LAST){
      S.shots.length=0;
      for(const tile of S.usedSyrup)S.syrups.delete(tile);
      S.usedSyrup.clear();
      if(boss){
        S.bonusWon=S.hp===0;S.phase=S.bonusWon?'hatch':'revive';
      }else if(S.hp>0)S.phase='lose';
      else{
        S.cleared++;
        if(S.cleared===MOOSE_ROUNDS.length){
          S.mooseAt=S.distance;S.bonus=!S.crossedHalf;
          S.phase=S.bonus?'break':'revive';
        }else S.phase='break';
      }
      return;
    }
    const enemies=[S,...S.geese].flatMap((enemy,i)=>enemy.hp>0&&enemy.distance>=0&&enemy.distance<LAST
      ?[{...along(enemy.distance),id:i-1}]:[]);
    for(const [i,cooldown] of S.towers){
      const {x,z}=TILES[i],left=Math.max(0,cooldown-dt);
      if(left>0){S.towers.set(i,left);continue}
      let target=null,best=RANGE;
      for(const enemy of enemies){
        const d=Math.hypot(enemy.x-x,enemy.z-z);
        if(d<best){target=enemy;best=d}
      }
      if(target)S.shots.push({i,age:0,target:target.id});
      S.towers.set(i,target ? .52 : 0);
    }
  }
  S.step=dt=>{
    S.trapHit=false;
    S.hits.length=0;
    time+=dt;
    while(time>=tick-1e-9){time-=tick;advance(tick)}
  };
  return S;
}


function mesh(group,geometry,material,x,y,z) {
  const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);group.add(m);return m;
}

export function animalHitEffects(group,scale=1){
  const drops=new THREE.IcosahedronGeometry(1,0);
  const feather=new THREE.Shape();
  feather.moveTo(0,-1);feather.quadraticCurveTo(-.75,-.14,0,1);feather.quadraticCurveTo(.75,.56,0,-1);
  const plumes=new THREE.ShapeGeometry(feather);
  const materials=[0xd9222f,0xffe7b6].map(color=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
  const pools=[[],[]],next=[0,0];
  function burst(x,y,z,goose=false){
    const type=Number(goose),pool=pools[type];
    for(let i=0;i<(goose?7:6);i++){
      const index=next[type]++%36;
      let p=pool[index];
      if(!p){
        p={mesh:mesh(group,goose?plumes:drops,materials[type],0,0,0),velocity:new THREE.Vector3()};
        pool[index]=p;
      }
      p.mesh.position.set(x,y,z);p.mesh.rotation.set(Math.random(),Math.random()*Math.PI,Math.random()*6);
      const angle=i*2.4+Math.random()*.8,speed=scale*(1.05+Math.random()*1.5);
      p.velocity.set(Math.cos(angle)*speed,scale*(.8+Math.random()*1.4),Math.sin(angle)*speed);
      p.life=goose?.63:.36;p.size=scale*(goose?.145:.065)*(1+Math.random()*.45);
      p.goose=goose;p.mesh.visible=true;
      p.mesh.scale.setScalar(p.size);
    }
  }
  function update(dt){
    for(const pool of pools)for(const p of pool){
      if(!p.mesh.visible)continue;
      p.life-=dt;
      p.mesh.visible=p.life>0;
      if(!p.mesh.visible)continue;
      p.mesh.position.addScaledVector(p.velocity,dt);
      p.velocity.y-=dt*scale*(p.goose?3.7:8);
      p.mesh.rotation.z+=dt*(p.goose?5:2);
      p.mesh.scale.setScalar(p.size*clamp(p.life/.16,0,1));
    }
  }
  return {burst,update,clear(){for(const pool of pools)for(const p of pool)p.mesh.visible=false}};
}

function gooseModel(){
  const root=new THREE.Group(),ball=new THREE.IcosahedronGeometry(1,1);
  const neck=new THREE.Group();neck.position.set(0,.36,.13);root.add(neck);
  const mat=color=>new THREE.MeshStandardMaterial({color,roughness:.9,flatShading:true});
  const gray=mat(0x81745d),wing=mat(0x5e5346),black=mat(0x262629),white=mat(0xf0e7d4);
  const part=(m,x,y,z,sx,sy,sz,parent=root)=>{
    const p=mesh(parent,ball,m,x,y,z);p.scale.set(sx,sy,sz);return p;
  };
  part(gray,0,.32,-.09,.24,.23,.38);
  part(black,0,.31,-.43,.12,.10,.19);
  part(black,0,.22,.05,.095,.31,.11,neck).rotation.x=.28;
  part(black,0,.48,.15,.12,.14,.15,neck);
  part(black,0,.47,.305,.066,.045,.09,neck);
  const wings=[];
  for(const side of [-1,1]){
    part(white,side*.094,.43,.146,.035,.060,.082,neck);
    const joint=new THREE.Group();joint.position.set(side*.165,.36,-.17);root.add(joint);
    part(wing,0,0,0,.10,.16,.29,joint).rotation.x=-.18;
    wings.push({joint,side});
  }
  const feet=[-.10,.10].map(x=>part(black,x,.09,.015,.057,.065,.126));
  root.userData.pose=(time,slow,flying=false)=>{
    wings.forEach(({joint,side})=>{
      joint.children[0].scale.x=flying?.36:.10;
      joint.children[0].position.x=flying?side*.24:0;
      joint.rotation.z=flying?side*Math.sin(time*19)*.74:0;
    });
    feet.forEach((foot,i)=>{
      const step=Math.sin(time*(slow?11:20)+i*Math.PI);
      foot.position.z=flying?-.13:.015+step*.105;
      foot.position.y=flying?.16:.07+Math.max(0,step)*.06;
    });
  };
  root.userData.neck=neck;
  return root;
}

export function scoutGooseModel(){
  const root=gooseModel(),blade=new THREE.BoxGeometry(1,1,1);
  const metal=new THREE.MeshStandardMaterial({color:0x414b58,metalness:.55,roughness:.43});
  const paint=new THREE.MeshStandardMaterial({color:0xe4b04d,metalness:.32,roughness:.4});
  const light=new THREE.MeshBasicMaterial({color:0x51eaff});
  const block=(parent,mat,x,y,z,sx,sy,sz)=>{
    const o=mesh(parent,blade,mat,x,y,z);o.scale.set(sx,sy,sz);return o;
  };
  block(root,paint,0,.65,-.1,.36,.23,.34);
  block(root,light,0,.67,.08,.20,.07,.04);
  const rotors=[];
  for(const x of [-.44,.44])for(const z of [-.48,.23]){
    const arm=block(root,metal,x*.5,.67,(z-.10)*.5,.65,.065,.065);
    arm.rotation.y=-Math.atan2(z+.10,x);
    block(root,paint,x,.69,z,.14,.12,.14);
    const hub=new THREE.Group();root.add(hub);hub.position.set(x,.79,z);
    block(hub,metal,0,0,0,.45,.025,.060);rotors.push(hub);
  }
  root.userData.pose=time=>{
    rotors.forEach((hub,i)=>hub.rotation.y=time*(i%2===0?33:-33)+i);
    root.userData.neck.rotation.x=1.85+Math.sin(time*5)*.13;
    root.userData.neck.rotation.z=Math.sin(time*4)*.12;
  };
  return root;
}

function flagTexture(american){
  const c=document.createElement('canvas');c.width=380;c.height=200;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,380,200);
  if(american){
    ctx.fillStyle='#b31942';
    for(let row=0;row<13;row+=2)ctx.fillRect(0,row*200/13,380,200/13+.2);
    ctx.fillStyle='#0a3161';ctx.fillRect(0,0,152,200*7/13);
    ctx.fillStyle='#fff';
    for(let row=0;row<9;row++)for(let col=0;col<(row%2?5:6);col++){
      const x=13+col*25+(row%2?12.5:0),y=10+row*11;
      ctx.beginPath();
      for(let point=0;point<10;point++){
        const a=point*Math.PI/5-Math.PI/2,r=point%2?1.75:4;
        ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);
      }
      ctx.fill();
    }
  }else{
    ctx.fillStyle='#d80621';ctx.fillRect(0,0,95,200);ctx.fillRect(285,0,95,200);
    const leaf=[[0,-66],[12,-42],[22,-47],[17,-12],[39,-34],[43,-23],[61,-27],[54,-7],
      [66,-1],[34,25],[37,37],[4,31],[4,62],[-4,62],[-4,31],[-37,37],[-34,25],
      [-66,-1],[-54,-7],[-61,-27],[-43,-23],[-39,-34],[-17,-12],[-22,-47],[-12,-42]];
    ctx.beginPath();
    leaf.forEach(([x,y])=>ctx.lineTo(190+x,100+y));
    ctx.fill();
  }
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}

export function mooseModel(zombie=false) {
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const mat=(c)=>new THREE.MeshStandardMaterial({color:c,roughness:.86,flatShading:true});
  const coat=mat(zombie?0x51664e:0x634538),dark=mat(zombie?0x263c32:0x352620),tan=mat(zombie?0x98a694:0xb38c69);
  const eye=new THREE.MeshStandardMaterial({color:zombie?0x9cf87f:0x24201d,emissive:zombie?0x426829:0x000000,roughness:.5});
  const ball=new THREE.IcosahedronGeometry(1,1),cube=new THREE.BoxGeometry(1,1,1);
  const part=(parent,g,m,x,y,z,sx,sy,sz)=>{
    const o=mesh(parent,g,m,x,y,z);o.scale.set(sx,sy,sz);return o;
  };
  part(body,ball,coat,0,.97,-.10,.40,.43,.79);
  part(body,ball,dark,0,1.13,.39,.35,.40,.42);
  part(body,ball,coat,0,1.43,.56,.28,.49,.25).rotation.x=.53;
  part(body,ball,dark,0,1.55,.83,.26,.30,.32);
  part(body,ball,coat,0,1.43,1.06,.24,.23,.37);
  part(body,ball,dark,0,1.45,1.32,.22,.17,.13);
  part(body,ball,dark,0,1.03,-.79,.16,.13,.22);
  const legs=[];
  for(const side of [-1,1]){
    part(body,ball,coat,side*.28,1.75,.72,.16,.09,.15).rotation.z=side*.5;
    part(body,ball,eye,side*.236,1.62,.99,.042,.045,.042);
    const rack=new THREE.Group();rack.position.set(side*.20,1.76,.69);
    rack.rotation.z=-side*.27;body.add(rack);
    part(rack,cube,tan,side*.20,.16,0,.46,.065,.08).rotation.z=side*.56;
    part(rack,ball,tan,side*.50,.32,-.03,.30,.22,.075).rotation.z=side*.45;
    for(let i=0;i<4;i++){
      const tine=part(rack,new THREE.ConeGeometry(.070,.28+i*.025,5),tan,side*(.31+i*.156),.47+i*.046,-.035,1,1,1);
      tine.rotation.z=-side*(.14+i*.16);
    }
    for(const z of [-.58,.45]){
      const hip=new THREE.Group();hip.position.set(side*.25,.81,z);root.add(hip);
      part(hip,cube,coat,0,-.22,0,.15,.49,.17);
      part(hip,cube,dark,0,-.64,0,.10,.38,.105);
      part(hip,cube,dark,0,-.787,.03,.16,.105,.19);
      legs.push({hip,phase:(side===1)===(z>0)?0:Math.PI});
    }
  }
  if(zombie){
    part(body,cube,dark,0,1.28,-.21,.57,.1,.56);
    for(const side of [-1,1])part(body,cube,tan,side*.30,1.1,-.25,.07,.32,.19);
  }
  const tints=[[coat,0x634538,0x51664e],[dark,0x352620,0x263c32],[tan,0xb38c69,0x98a694],[eye,0x24201d,0x9cf87f]]
    .map(([m,from,to])=>[m,new THREE.Color(from),new THREE.Color(to)]);
  const glow=new THREE.Color(0x74c344);
  root.userData.tint=factor=>{
    for(const [m,a,b] of tints)m.color.lerpColors(a,b,factor);
    eye.emissive.copy(glow).multiplyScalar(THREE.MathUtils.smoothstep(factor,.48,1)*.68);
  };
  root.userData.pose=(t,gait,fallen=0)=>{
    const stride=t*10;
    body.position.y=Math.abs(Math.sin(stride))*.055*gait;
    for(const {hip,phase} of legs)hip.rotation.x=Math.sin(stride+phase)*.43*gait;
    root.rotation.z=-1.16*fallen;
    root.position.y=.25*fallen;
  };
  return root;
}

export function mooseDefenseRoom({group:room,scene,cam,o,A,onClear,finish}){
  const S=mooseDefenseGame(),live=!A.watching;
  const arcade=outpostArcade(room,o,onClear),group=arcade.board;
  Object.assign(S,{table:false,tableMix:0,yaw:0,pitch:-.085});
  S.controlMode=()=>S.table?'table':'walk';
  const frame=outpostCamera(cam,arcade,S);
  let selection=Math.floor(TILES.length/2),previous={},time=0,prompt='',lastHud='';
  if(TILES[selection].path>=0)selection--;
  cam.fov=48;cam.near=.1;cam.far=95;
  scene.fog=new THREE.FogExp2(0x151d27,.025);

  const material=(color,emissive=0)=>new THREE.MeshStandardMaterial({color,emissive,roughness:.88,flatShading:true});
  const rim=material(0x334845),pine=material(0x26423e),pineL=material(0x52746c);
  const timber=material(0x4b3930),steel=material(0x364345),warm=material(0xf2bb66,0x9c4c16);
  const lit=material(0xba9064,0x3b2917),cyan=material(0x77c9bf,0x194845),spike=material(0xaeb7bd);
  const box=new THREE.BoxGeometry(1,1,1),cone=new THREE.ConeGeometry(1,1,6),cylinder=new THREE.CylinderGeometry(1,1,1,12);
  const put=(parent,g,m,x,y,z,sx,sy,sz)=>{
    const q=mesh(parent,g,m,x,y,z);q.scale.set(sx,sy,sz);return q;
  };
  put(group,box,rim,0,-.34,0,COLS+.42,.68,ROWS+.48);
  const cells=new THREE.InstancedMesh(new THREE.BoxGeometry(.954,.05,.954),material(0xffffff),TILES.length);
  const transform=new THREE.Matrix4(),color=new THREE.Color();
  TILES.forEach(({x,z,path},i)=>{
    cells.setMatrixAt(i,transform.makeTranslation(x,.008,z));
    const checker=(i+Math.floor(i/COLS))%4;
    cells.setColorAt(i,color.setHex(path>=0?(checker===0?0x665047:0x584840):(checker===0?0x89a6a4:0x779593)));
    if(path>=0&&path%2===1&&path<PATH.length-1){
      const n=TILES[PATH[path+1]],dash=put(group,box,lit,x,.04,z,.036,.009,.26);
      dash.rotation.y=Math.atan2(n.x-x,n.z-z);
    }
  });
  group.add(cells);
  for(const [x,z,h] of [[-7.55,-4.7,1.55],[-6.85,-4.71,1.05],[-3.65,-4.75,1.36],[-1.1,-4.72,1.9],
    [.03,-4.83,1.28],[7.54,3.55,1.32],[7.53,4.43,1.84],[-7.52,-2.25,1.22]]){
    put(group,cylinder,timber,x,.21,z,.092,.45,.092);
    for(let i=0;i<3;i++)put(group,cone,i===2?pineL:pine,x,.38+h*(.2+i*.23),z,h*(.29-i*.061),h*.60,h*(.29-i*.061));
  }
  for(const i of [0,PATH.length-1]){
    const {x,z}=TILES[PATH[i]],gx=x+Math.sign(x)*.50;
    for(const side of [-1,1]){
      put(group,box,timber,gx,.57,z+side*.50,.15,1.14,.14);
      put(group,box,warm,gx,1.14,z+side*.50,.20,.19,.19);
    }
    put(group,box,timber,gx,1.27,z,.16,.13,1.12);
  }
  const pole=new THREE.Group();group.add(pole);pole.position.set(5.65,0,-4.46);
  put(pole,cylinder,steel,0,.08,0,.24,.16,.24);
  put(pole,cylinder,spike,0,1.59,0,.045,3.18,.045);
  put(pole,new THREE.SphereGeometry(.08,10,7),warm,0,3.22,0,1,1,1);
  const cloth=new THREE.PlaneGeometry(1.66,.87,20,8);cloth.translate(.83,-.435,0);
  const flag=mesh(pole,cloth,new THREE.MeshBasicMaterial({map:flagTexture(false),side:THREE.DoubleSide}),.046,3.08,0);
  const usFlag=flagTexture(true);
  onClear(()=>{if(flag.material.map===usFlag)canadaFlag.dispose();else usFlag.dispose()});
  const canadaFlag=flag.material.map;
  const flagPos=cloth.attributes.position,flagBase=flagPos.array.slice();
  let flagT=0;

  const range=mesh(group,new THREE.RingGeometry(RANGE-.035,RANGE,64),
    new THREE.MeshBasicMaterial({color:0xf7c17e,transparent:true,opacity:.36,depthWrite:false}),0,.050,0);
  range.rotation.x=-Math.PI/2;
  const cursor=put(group,box,warm,0,.040,0,.85,.015,.85);
  const cursorCenter=put(group,box,rim,0,.050,0,.76,.011,.76);
  const towers=new Map(),traps=new Map(),syrups=new Map(),flies=[],geese=[];
  const effects=animalHitEffects(group);
  const syrupDark=material(0x914010),syrupGold=material(0xde831e,0x532905);
  function addTower(tile){
    const q=new THREE.Group();group.add(q);q.position.set(tile.x,.035,tile.z);
    put(q,cylinder,steel,0,.06,0,.42,.12,.42);
    put(q,box,timber,0,.35,0,.37,.51,.37);
    put(q,box,steel,0,.63,0,.46,.16,.46);
    put(q,cylinder,cyan,0,.74,0,.20,.21,.20);
    for(const k of [-1,1])put(q,box,warm,k*.105,.85,0,.052,.14,.15);
    return q;
  }
  function addTrap(tile){
    const q=new THREE.Group();group.add(q);q.position.set(tile.x,.034,tile.z);
    q.rotation.y=along(tile.path).yaw;
    put(q,box,steel,0,.04,0,.75,.08,.42);
    for(const x of [-.24,0,.24])for(const z of [-.11,.11])put(q,cone,spike,x,.16,z,.067,.23,.067);
    return q;
  }
  function addSyrup(tile){
    const q=new THREE.Group();group.add(q);q.position.set(tile.x,.043,tile.z);
    put(q,cylinder,syrupDark,0,.012,0,.44,.023,.37);
    put(q,cylinder,syrupGold,.035,.031,-.015,.34,.018,.28).rotation.y=.32;
    for(const [x,z] of [[-.33,.23],[.29,.27],[.37,-.25],[-.21,-.36]])
      put(q,cylinder,syrupGold,x,.016,z,.074,.026,.058);
    return q;
  }
  function addFly(){
    const q=new THREE.Group();group.add(q);
    put(q,cylinder,steel,0,0,0,.026,.16,.028).rotation.x=Math.PI/2;
    put(q,box,warm,0,0,.024,.042,.042,.065);
    const wings=new THREE.Group();q.add(wings);
    for(const side of [-1,1])put(wings,box,cyan,side*.083,.012,0,.135,.022,.071).rotation.y=side*.45;
    q.userData.wings=wings;return q;
  }
  const moose=mooseModel();group.add(moose);
  const mother=gooseModel();mother.scale.setScalar(2.65);mother.visible=false;group.add(mother);
  const gold=material(0xeac249,0x6f3804);
  const egg=new THREE.Group();group.add(egg);
  const eggTop=put(egg,new THREE.SphereGeometry(.30,20,8,0,Math.PI*2,0,Math.PI/2),gold,0,0,0,1,1.28,1);
  const eggBase=put(egg,new THREE.SphereGeometry(.30,20,8,0,Math.PI*2,Math.PI/2,Math.PI/2),gold,0,0,0,1,1.28,1);
  const eggGlow=mesh(egg,new THREE.RingGeometry(.38,.52,30),
    new THREE.MeshBasicMaterial({color:0xffd64a,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}),0,0,0);
  const drone=scoutGooseModel();group.add(drone);egg.visible=drone.visible=false;
  const revival=new THREE.Group();group.add(revival);
  const haze=new THREE.MeshBasicMaterial({color:0x98ff72,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const pulse=mesh(revival,new THREE.RingGeometry(.8,1,64),haze,0,.06,0);pulse.rotation.x=-Math.PI/2;
  const light=new THREE.PointLight(0x9bff67,0,5);revival.add(light);light.position.y=1.25;
  const sparks=Array.from({length:16},(_,i)=>put(revival,box,haze,0,0,0,.068+i%3*.022,.10,.068));
  group.add(new THREE.HemisphereLight(0xc1dcf6,0x543830,2.15));
  const key=new THREE.DirectionalLight(0xffdeaa,2.1);key.position.set(-5,10,5);group.add(key);
  const fill=new THREE.DirectionalLight(0x7caef7,1.35);fill.position.set(4,5,-7);group.add(fill);

  const panel=document.createElement('section');
  panel.id='moosePanel';
  panel.innerHTML='<div class="moose-info"><h2>Mosquito Outpost</h2><div class="moose-stats"></div><p class="moose-status" aria-live="polite"></p><label>Moose health <progress aria-label="Moose health"></progress></label></div>'+
    '<div class="moose-console"><div class="moose-track"><label for="outpostTrack">Track progress</label><progress id="outpostTrack" max="100" value="0"></progress><output for="outpostTrack">0%</output></div>'+
    '<div class="moose-tile"></div><div class="moose-actions"></div><p class="moose-hint"></p></div>'+
    '<div class="moose-walk"><span></span><button type="button">Play tabletop</button><button type="button">Exit arcade</button></div>';
  document.body.appendChild(panel);
  onClear(()=>panel.remove());
  const progress=panel.querySelector('.moose-info progress'),status=panel.querySelector('.moose-status'),health=progress.parentNode;
  const stats=panel.querySelector('.moose-stats'),hint=panel.querySelector('.moose-hint');
  const tileLabel=panel.querySelector('.moose-tile'),actions=panel.querySelector('.moose-actions');
  const track=panel.querySelector('#outpostTrack'),percent=panel.querySelector('output');
  const walkHint=panel.querySelector('.moose-walk span'),[enter,door]=panel.querySelectorAll('.moose-walk button');
  const setTable=on=>{
    S.table=on;prompt='';
    if(live)o.mooseTableFocus(on);
    if(document.activeElement?.closest('#moosePanel'))document.activeElement.blur();
    refresh();
  };
  enter.addEventListener('click',()=>{if(live&&arcade.near())setTable(true)});
  door.addEventListener('click',()=>{if(live&&!S.table&&arcade.atExit())leaveArcade()});
  if(!live)panel.classList.add('moose-watching');
  const button=(title,action)=>{
    const b=document.createElement('button');b.type='button';b.textContent=title;
    b.addEventListener('click',action);actions.appendChild(b);return b;
  };
  const build=button('Build tower',()=>command('build'));
  const trap=button('Lay spikes',()=>command('spike'));
  const syrup=button('Pour syrup',()=>command('syrup'));
  const back=button('Step away',()=>setTable(false));
  const skip=button('Skip bonus round',()=>{if(live&&S.skipBonus())refresh()});
  const release=button('Start round 1',()=>command('launch'));
  const spendSpike=price=>o.useMooseSpike()||o.spendMooseGems(price);

  function command(action){
    if(!live||!S.table||S.phase==='win'||S.phase==='lose')return;
    prompt='';
    if(action==='build'){
      if(S.build(selection,o.spendMooseGems))o.sfx('pick');
      else if(S.phase!=='revive')prompt=S.canBuild(selection)?'A tower costs '+MOOSE_TOWER_PRICE+' gems.':'Select an empty snow square for a tower.';
    }else if(action==='spike'){
      if(S.spike(selection,spendSpike))o.sfx('spike');
      else if(S.phase!=='revive')prompt=S.canSpike(selection)?'A spike trap costs '+MOOSE_SPIKE_PRICE+' gems.':'Select an empty path square for spikes.';
    }else if(action==='syrup'){
      if(S.syrup(selection,o.spendMooseGems))o.sfx('pick');
      else if(S.phase!=='revive')prompt=S.canSpike(selection)?'Maple syrup costs '+MOOSE_SYRUP_PRICE+' gems.':'Select an empty path square for syrup.';
    }else if(action==='launch'&&S.launch())o.sfx('moose');
    refresh();
  }
  function leaveArcade(){
    const win=S.cleared===MOOSE_ROUNDS.length;
    o.sfx('door');finish({k:win?'win':'lose',why:'moose',drone:S.bonusWon,
      beforePlay:S.phase==='build',forfeited:!win&&S.phase!=='lose'});
  }

  function refresh(){
    const supply=live?o.mooseSpikes():S.supply||0,funds=live?o.mooseGems():S.funds||0;
    const tile=TILES[selection],phase=S.phase,round=S.round+1,over=phase==='win'||phase==='lose';
    const count=round+' / '+(S.bonus?4:3),boss=S.round===3;
    const reward=roundRules(S.round).gems;
    let text='Place towers in the snow. Spikes hurt and syrup slows enemies on the path.';
    if(phase==='run')text='Stop the moose at the gate. Canada geese draw tower fire.';
    if(phase==='break')text='Round '+round+' cleared. +'+reward+' gems. Prepare for the next charge.';
    if(phase==='revive')text='Round '+round+' cleared. +'+reward+' gems. The moose is moving again…';
    if(phase==='win')text='Round '+round+' cleared. +'+reward+' gems. Your zombie moose is ready.';
    if(phase==='lose')text='The moose broke through in round '+round+'.';
    if(S.bonus&&phase==='break')text='Round 3 cleared before halfway. +'+reward+' gems. Bonus round unlocked: Mother Goose.';
    if(boss&&phase==='run')text='Mother Goose is on the march. Stop her before the gate.';
    if(phase==='hatch')text='Mother Goose is down. Something is hatching from the golden egg…';
    if(boss&&phase==='revive')text=S.bonusWon?'Turbo 6000 G is airborne. The moose is rising…':'Mother Goose got through. Your zombie moose is still yours.';
    if(boss&&phase==='win')text=S.bonusWon?'Zombie moose and Turbo 6000 G earned.':'Your zombie moose is ready.';
    const target=String.fromCharCode(65+Math.floor(selection/COLS))+(selection%COLS+1)
      +' · '+(S.towers.has(selection)?'Tower':S.traps.has(selection)?'Spike trap':S.syrups.has(selection)?'Maple syrup':tile.path>=0?'Path':'Snow');
    const pct=Math.min(100,Math.floor(S.farthest/LAST*100)),near=arcade.near(),atExit=arcade.atExit();
    const device=o.inputDevice(),key=o.control;
    const hud=[text,S.hp,count,funds,supply,target,phase,prompt,S.table,near,atExit,pct,device].join('|');
    if(hud===lastHud)return;
    lastHud=hud;status.textContent=text;tileLabel.textContent=target;
    panel.classList.toggle('moose-roam',!S.table);
    enter.hidden=!near||!live;
    door.hidden=!atExit||!live;
    const interact=device==='touch'?'Tap Use':key('press');
    walkHint.textContent=atExit?interact+' to exit':phase==='run'?'Round '+round+' running · '+pct+'% of track':
      phase==='hatch'||phase==='revive'?'Round complete':near?interact+' to play':'Approach the table to play';
    track.value=pct;percent.value=pct+'%';
    const hue=pct>=50?0:pct<25?120-pct*3:45-(pct-25)*1.8;
    track.style.setProperty('--track-color',`hsl(${hue} 83% 56%)`);
    stats.textContent='Round '+count+' · '+funds+' gems'+(supply?' · '+supply+' spike'+(supply===1?'':'s')+' carried':'');
    const healthName=boss?'Mother Goose health':'Moose health';
    health.firstChild.nodeValue=healthName+' ';progress.setAttribute('aria-label',healthName);
    progress.max=roundRules(S.round).hp;progress.value=S.hp;
    build.textContent='Build tower · '+MOOSE_TOWER_PRICE+' gems';
    trap.textContent=supply?'Lay spikes · 1 carried':'Lay spikes · '+MOOSE_SPIKE_PRICE+' gems';
    syrup.textContent='Pour syrup · '+MOOSE_SYRUP_PRICE+' gems';
    build.disabled=!live||!S.canBuild(selection)||funds<MOOSE_TOWER_PRICE;
    trap.disabled=!live||!S.canSpike(selection)||(!supply&&funds<MOOSE_SPIKE_PRICE);
    syrup.disabled=!live||!S.canSpike(selection)||funds<MOOSE_SYRUP_PRICE;
    back.hidden=!live;
    skip.hidden=!S.bonus||phase!=='break';
    skip.disabled=!live;
    release.hidden=over||phase==='run'||phase==='revive'||phase==='hatch';
    release.disabled=!live;
    release.textContent=S.bonus&&phase==='break'?'Start bonus round 4':'Start round '+(phase==='break'?round+1:round);
    const controls=device==='touch'?'Tap a square, then tap an action.':
      (device==='keyboard'?'Click or ':'')+key('navigate')+' select · '+key('press')+' tower · '+key('alternate')+' spikes · '+key('tool')+' syrup · '+key('start')+' start · '+key('back')+' back';
    hint.textContent=prompt||(live?(over?'Step away and use the exit door to return to the maze.':controls):'Watching Mosquito Outpost');
  }

  function moveSelection(dx,dz){
    const col=clamp(selection%COLS+dx,0,COLS-1);
    const row=clamp(Math.floor(selection/COLS)+dz,0,ROWS-1);
    selection=row*COLS+col;prompt='';
  }
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3();
  const board=new THREE.Plane(new THREE.Vector3(0,1,0),-(TABLE_HEIGHT+.034*TABLE_SCALE));
  S.tap=(x,y)=>{
    if(!live||!S.table||S.tableMix<.97||!['build','run','break'].includes(S.phase))return false;
    ray.setFromCamera(pointer.set(x,y),cam);
    if(!ray.ray.intersectPlane(board,hit))return false;
    const col=Math.floor(hit.x/TABLE_SCALE+COLS/2),row=Math.floor(hit.z/TABLE_SCALE+ROWS/2);
    if(col<0||col>=COLS||row<0||row>=ROWS)return false;
    selection=row*COLS+col;prompt='';refresh();return true;
  };

  S.update=(dt,input)=>{
    time+=dt;
    effects.update(dt);
    const edges={left:input.navLeft,right:input.navRight,up:input.navUp,down:input.navDown,
      build:input.press,spike:input.alternate,syrup:input.tool,launch:input.start,back:input.back};
    const rising=action=>edges[action]&&!previous[action];
    if(live){
      if(!S.table){
        walkOutpost(arcade,S,input,dt);
        if(rising('build')){
          if(arcade.atExit()){leaveArcade();return}
          if(arcade.near())setTable(true);
        }
      }else if(rising('back'))setTable(false);
      else{
        if(rising('left'))moveSelection(-1,0);
        if(rising('right'))moveSelection(1,0);
        if(rising('up'))moveSelection(0,-1);
        if(rising('down'))moveSelection(0,1);
        for(const action of ['build','spike','syrup','launch'])if(rising(action))command(action);
      }
      previous=edges;
      const before=S.cleared,reviveT=S.reviveT;
      S.step(dt);
      for(const hit of S.hits)drawHit(hit);
      if(S.trapHit)o.sfx('spike');
      if(before!==S.cleared){
        o.rewardMooseGems(roundRules(S.round).gems);o.sfx('gem');
      }
      if(reviveT<1.72&&S.reviveT>=1.72)o.sfx('moose');
    }
    S.tableMix=THREE.MathUtils.lerp(S.tableMix,S.table?1:0,Math.min(1,dt*14));

    const {phase,reviveT,hatchT}=S,p=along(S.distance),reviving=phase==='revive',boss=S.round===3;
    const moosePos=boss?along(S.mooseAt):p;
    moose.position.set(moosePos.x,0,moosePos.z);moose.rotation.y=moosePos.yaw;
    moose.visible=!boss||reviving||phase==='win';
    mother.visible=boss&&(phase==='run'||phase==='hatch'||S.bonusWon);
    mother.position.set(p.x,0,p.z);mother.rotation.y=p.yaw;
    mother.rotation.z=-1.12*THREE.MathUtils.smoothstep(hatchT,0,.42);
    mother.userData.pose(phase==='run'?time:0,S.slow>0);
    const rise=THREE.MathUtils.smoothstep(reviveT,1.28,2.50);
    const fall=reviving?(boss?1:THREE.MathUtils.smoothstep(reviveT,0,.63))*(1-rise):phase==='break'?1:0;
    const green=phase==='win'?1:THREE.MathUtils.lerp(MOOSE_ROUNDS[Math.min(S.round,2)].green,1,
      THREE.MathUtils.smoothstep(reviveT,.48,2.03));
    moose.userData.tint(green);
    moose.userData.pose(time,phase==='run'?(S.slow>0?.55:1):phase==='win'?.18:0,fall);
    revival.visible=reviving;
    if(reviving){
      const flash=Math.sin(Math.PI*THREE.MathUtils.smoothstep(reviveT,.30,2.8));
      revival.position.set(moosePos.x,0,moosePos.z);light.intensity=flash*12;haze.opacity=flash*.75;
      pulse.scale.setScalar(.30+reviveT*.72);
      sparks.forEach((spark,i)=>{
        const a=i*Math.PI*2/sparks.length+reviveT*.82,rad=.42+(i%3)*.22;
        spark.position.set(Math.cos(a)*rad, .14+((reviveT*1.53+i*.31)%1)*1.36,Math.sin(a)*rad);
        spark.rotation.y=a;
      });
    }
    const roll=THREE.MathUtils.smoothstep(hatchT,.3,1.3),crack=THREE.MathUtils.smoothstep(hatchT,1.28,1.95);
    const eggX=clamp(p.x-Math.sin(p.yaw)*roll*1.65+Math.cos(p.yaw)*roll*.8,-7,7);
    const eggZ=clamp(p.z-Math.cos(p.yaw)*roll*1.65-Math.sin(p.yaw)*roll*.8,-4,4);
    egg.visible=S.bonusWon&&hatchT>.3;
    egg.position.set(eggX,.34,eggZ);
    eggTop.rotation.z=-roll*6.28-crack*.87;eggBase.rotation.z=-roll*6.28+crack*.55;
    eggTop.position.set(-crack*.47,crack*.13,0);eggBase.position.x=crack*.27;
    eggGlow.rotation.x=-Math.PI/2;eggGlow.position.y=-.27;
    eggGlow.material.opacity=Math.sin(crack*Math.PI)*.85;eggGlow.scale.setScalar(1+crack*2.5);
    drone.visible=S.bonusWon&&crack>.10;
    if(drone.visible){
      drone.position.set(eggX+crack*.37,crack*1.06+Math.sin(time*5)*.07,eggZ);
      drone.rotation.y=p.yaw+Math.PI*.78;
      drone.scale.setScalar(.15+crack*.78);drone.userData.pose(time);
    }
    flagT=S.cleared===3?Math.min(3,flagT+dt):0;
    flag.position.y=3.08-2.10*Math.sin(Math.PI*flagT/3);
    flag.material.map=flagT>=1.5?usFlag:canadaFlag;
    for(let i=0;i<flagPos.count;i++){
      const x=flagBase[i*3],y=flagBase[i*3+1];
      flagPos.setXYZ(i,x,y+.046*x*Math.sin(time*4-x*4.5),.17*x*Math.sin(time*4.4-x*6+y));
    }
    flagPos.needsUpdate=true;
    for(const i of S.towers.keys())if(!towers.has(i))towers.set(i,addTower(TILES[i]));
    for(const [i,tower] of towers)tower.visible=S.towers.has(i);
    for(const i of S.traps)if(!traps.has(i))traps.set(i,addTrap(TILES[i]));
    for(const [i,trap] of traps)trap.visible=S.traps.has(i);
    for(const i of S.syrups)if(!syrups.has(i))syrups.set(i,addSyrup(TILES[i]));
    for(const [i,syrup] of syrups)syrup.visible=S.syrups.has(i);
    while(geese.length<S.geese.length){const goose=gooseModel();group.add(goose);geese.push(goose)}
    geese.forEach((model,i)=>{
      const goose=S.geese[i];
      model.visible=phase==='run'&&goose?.hp>0&&goose.distance>=0&&goose.distance<LAST;
      if(!model.visible)return;
      const p=along(goose.distance);
      model.position.set(p.x,.40+Math.sin(time*9+i)*.075,p.z);model.rotation.y=p.yaw;
      model.userData.pose(time+i,goose.slow>0,true);
    });
    range.visible=S.canBuild(selection);
    const {x,z}=TILES[selection];
    range.position.set(x,.05,z);cursor.position.set(x,.04,z);cursorCenter.position.set(x,.05,z);
    cursor.visible=cursorCenter.visible=S.table&&['build','run','break'].includes(phase);
    range.visible=range.visible&&S.table;
    while(flies.length<S.shots.length)flies.push(addFly());
    flies.forEach((q,i)=>{
      const shot=S.shots[i];q.visible=!!shot;if(!shot)return;
      const tile=TILES[shot.i],a=clamp(shot.age/FLIGHT,0,1);
      const target=shot.target<0?p:along(S.geese[shot.target].distance);
      q.position.set(THREE.MathUtils.lerp(tile.x,target.x,a),.84+Math.sin(a*Math.PI)*.54+(boss?a*.34:0),
        THREE.MathUtils.lerp(tile.z,target.z,a));
      q.rotation.y=Math.atan2(target.x-tile.x,target.z-tile.z);q.userData.wings.rotation.z=Math.sin(time*154+i)*.73;
    });
    refresh();
  };
  function drawHit({goose,boss,distance}){
    const p=along(distance);
    effects.burst(p.x,boss?1.30:goose?.78:1.05,p.z,goose);
  }
  S.frame=()=>{
    scene.fog.density=.025+.009*S.tableMix;
    frame();
  };
  S.snap=()=>({phase:S.phase,round:S.round,hp:S.hp,d:S.distance,slow:S.slow,reviveT:S.reviveT,t:[...S.towers.keys()],p:[...S.traps],
    cleared:S.cleared,bonus:S.bonus,bonusWon:S.bonusWon,hatchT:S.hatchT,mooseAt:S.mooseAt,flagT,farthest:S.farthest,
    arcade:[arcade.walker.b.x,arcade.walker.b.z,arcade.walker.b.y,S.yaw,S.pitch,S.table],
    sy:[...S.syrups],geese:S.geese.map(q=>[q.distance,q.hp,q.slow]),
    shots:S.shots.map(q=>[q.i,q.age,q.target]),sel:selection,supply:o.mooseSpikes(),funds:o.mooseGems()});
  S.apply=q=>{
    if(!q||!['build','break','run','hatch','revive','win','lose'].includes(q.phase))return;
    if(!Array.isArray(q.t)||!Array.isArray(q.p)||!Array.isArray(q.shots))return;
    const oldHp=S.hp,oldGeese=S.geese,sameWave=S.phase==='run'&&S.round===q.round;
    S.phase=q.phase;S.round=clamp(q.round|0,0,3);
    S.cleared=clamp(q.cleared|0,0,3);S.bonus=!!q.bonus;S.bonusWon=!!q.bonusWon;
    S.hatchT=clamp(Number(q.hatchT)||0,0,HATCH_TIME);S.mooseAt=clamp(Number(q.mooseAt)||0,0,LAST);
    S.farthest=clamp(Number(q.farthest??q.d)||0,0,LAST);
    if(Array.isArray(q.arcade)&&q.arcade.length>=6&&q.arcade.slice(0,5).every(Number.isFinite)){
      const [x,z,y,yaw,pitch,table]=q.arcade;
      Object.assign(arcade.walker.b,{x:clamp(x,-6.23,6.23),z:clamp(z,-5.18,5.18),y:clamp(y,0,1.28)});
      S.yaw=yaw;S.pitch=clamp(pitch,-1.2,1.2);S.table=table===true;
    }else S.table=true;
    flagT=clamp(Number(q.flagT)||0,0,3);
    S.hp=clamp(Number(q.hp)||0,0,roundRules(S.round).hp);S.distance=clamp(Number(q.d)||0,0,LAST);
    S.slow=clamp(Number(q.slow)||0,0,1.75);
    S.reviveT=clamp(Number(q.reviveT)||0,0,REVIVE_TIME);
    S.towers=new Map(q.t.filter(i=>Number.isInteger(i)&&TILES[i]?.path===-1).map(i=>[i,0]));
    S.traps=new Set(q.p.filter(i=>Number.isInteger(i)&&TILES[i]?.path>=0));
    S.syrups=new Set((Array.isArray(q.sy)?q.sy:[]).filter(i=>Number.isInteger(i)&&TILES[i]?.path>=0));
    S.geese=(Array.isArray(q.geese)?q.geese:[]).slice(0,3).map(row=>{
      const [d,hp,slow]=Array.isArray(row)?row:[];
      return {distance:clamp(Number(d)||0,-3,LAST),hp:clamp(hp|0,0,GOOSE_HP),slow:clamp(Number(slow)||0,0,1.75)};
    });
    if(sameWave){
      if(S.hp<oldHp)drawHit({goose:S.round===3,boss:S.round===3,distance:S.distance});
      S.geese.forEach((g,i)=>{if(g.distance>=0&&g.hp<oldGeese[i]?.hp)drawHit({goose:true,distance:g.distance})});
    }
    S.shots=q.shots.slice(0,TILES.length).filter(a=>Array.isArray(a)&&Number.isInteger(a[0])&&TILES[a[0]])
      .map(([i,age,target])=>({i,age:Number(age)||0,target:Number.isInteger(target)&&S.geese[target]?target:-1}));
    selection=Number.isInteger(q.sel)&&TILES[q.sel]?q.sel:selection;S.supply=Math.max(0,q.supply|0);S.funds=Math.max(0,q.funds|0);
  };
  S.bloom=.39;
  return S;
}
