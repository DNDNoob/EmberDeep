// Swallows, swifts and a kite over the still wood. They wander, then sit on the grass.
// The body is the signed-distance bird from the close-up study, not a stand-in of spheres.
import {createSdfBird} from './stillwood-bird-sdf.js';

const KINDS=[
  {id:'swallow',scale:0.42,speed:8.4,flap:4.8,cruise:5.4},
  {id:'swift',scale:0.38,speed:11.2,flap:8.2,cruise:6.6},
  {id:'kite',scale:0.72,speed:4.6,flap:1.45,cruise:8.2},
];
const MIX=[0,0,0,0,1,1,1,2,2];

function rng(seed){
  let a=seed>>>0;
  return ()=>{a=a+0x6d2b79f5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
}
function wrap(d){d%=Math.PI*2;if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d}
function steer(b,tx,tz,dt,rate){
  const want=Math.atan2(tx-b.x,-(tz-b.z));
  const d=wrap(want-b.yaw),max=rate*dt,turn=Math.abs(d)<max?d:Math.sign(d)*max;
  b.yaw+=turn;b.bank=Math.max(-0.7,Math.min(0.7,-turn/Math.max(dt,1e-3)*0.12));
}

export function spawnBird(i,seed,px=0,pz=0){
  const r=rng((seed+1)*10007+i*97);
  const kind=MIX[i%MIX.length];
  const a=r()*Math.PI*2,d=16+r()*22;
  return {i,seed,kind,r,x:px+Math.sin(a)*d,z:pz-Math.cos(a)*d,y:6,yaw:a,bank:0,phase:r(),fold:0,
    tx:0,tz:0,lx:0,lz:0,mode:'fly',until:3+r()*8,leg:0};
}

function retarget(b,px,pz){
  const a=b.yaw+(b.r()-0.5)*2.4,d=12+b.r()*30;
  b.tx=px+Math.sin(a)*d;b.tz=pz-Math.cos(a)*d;b.leg++;
}
function pickLand(b,ctx){
  for(let n=0;n<6;n++){
    const a=b.r()*Math.PI*2,d=8+b.r()*18,x=b.x+Math.sin(a)*d,z=b.z-Math.cos(a)*d;
    if(Math.hypot(x-ctx.x,z-ctx.z)<8)continue;
    if(ctx.open&&!ctx.open(x,z))continue;
    b.lx=x;b.lz=z;return true;
  }
  return false;
}
function park(b,ctx){
  const a=ctx.yaw??0,d=22+b.r()*18;
  b.x=ctx.x+Math.sin(a+ (b.r()-0.5)*1.4)*d;
  b.z=ctx.z-Math.cos(a+(b.r()-0.5)*1.4)*d;
  b.y=ctx.ground(b.x,b.z)+KINDS[b.kind].cruise;
  b.mode='fly';b.until=4+b.r()*8;retarget(b,ctx.x,ctx.z);
}

export function stepBird(b,dt,ctx){
  const k=KINDS[b.kind];
  if(Math.hypot(b.x-ctx.x,b.z-ctx.z)>92)park(b,ctx);
  const g=ctx.ground(b.x,b.z);
  let aim=g+k.cruise,spd=k.speed,flap=1;
  if(b.mode==='fly'){
    b.until-=dt;
    const left=Math.hypot(b.tx-b.x,b.tz-b.z);
    if(left<3||b.until<0&&left<8)retarget(b,ctx.x,ctx.z);
    steer(b,b.tx,b.tz,dt,1.7);
    if(b.until<=0&&Math.hypot(b.x-ctx.x,b.z-ctx.z)>12&&pickLand(b,ctx)){b.mode='land';b.until=7}
    else if(b.until<=0)b.until=6+b.r()*8;
  }else if(b.mode==='land'){
    b.until-=dt;
    const dxz=Math.hypot(b.lx-b.x,b.lz-b.z);
    const lg=ctx.ground(b.lx,b.lz);
    aim=dxz<5?lg+0.02:lg+k.cruise*Math.min(1,dxz/16);
    spd*=0.62;flap=0.55;steer(b,b.lx,b.lz,dt,2.4);
    b.fold=Math.max(0,1-dxz/7);
    if(dxz<0.7&&Math.abs(b.y-lg)<0.45){b.mode='perch';b.x=b.lx;b.z=b.lz;b.y=lg;b.until=5+b.r()*9;b.fold=1;spd=0}
    else if(b.until<=0){b.mode='fly';b.until=5+b.r()*6;retarget(b,ctx.x,ctx.z)}
  }else if(b.mode==='perch'){
    aim=ctx.ground(b.x,b.z);spd=0;flap=0;b.fold=1;b.bank*=0.9;b.until-=dt;
    if(b.until<=0){b.mode='launch';b.until=1.15;retarget(b,ctx.x,ctx.z)}
  }else{
    b.until-=dt;aim=g+k.cruise;spd*=0.85;flap=1.2;b.fold=Math.max(0,b.until/1.15);
    steer(b,b.tx,b.tz,dt,1.4);
    if(b.until<=0){b.mode='fly';b.until=6+b.r()*9}
  }
  if(spd){b.x+=Math.sin(b.yaw)*spd*dt;b.z-=Math.cos(b.yaw)*spd*dt}
  b.y+=(aim-b.y)*Math.min(1,dt*(b.mode==='land'?2.4:1.5));
  b.phase+=dt*k.flap*flap;
  if(b.mode!=='land'&&b.mode!=='perch'&&b.mode!=='launch')b.fold=0;
  return b;
}

export function stepFlock(birds,dt,ctx){for(const b of birds)stepBird(b,dt,ctx);return birds}

export function createStillwoodBirds(group,{seed=1,ground,open,low=false}={}){
  const birds=MIX.map((_,i)=>spawnBird(i,seed));
  const meshes=birds.map(b=>{
    const m=createSdfBird(KINDS[b.kind],low);
    group.add(m);return m;
  });
  const ctx={x:0,z:0,yaw:0,ground:ground||(()=>0),open};
  let time=0;
  return {
    birds,
    step(dt,x,z,yaw=0){
      ctx.x=x;ctx.z=z;ctx.yaw=yaw;
      time+=dt;
      let left=Math.min(Math.max(dt,0),0.1);
      while(left>1e-4){const h=Math.min(0.05,left);stepFlock(birds,h,ctx);left-=h}
      for(let i=0;i<birds.length;i++){
        const b=birds[i],m=meshes[i],k=KINDS[b.kind];
        const pitch=b.mode==='land'?0.34*(1-b.fold*0.35):b.mode==='perch'?0.06:-0.08;
        m.position.set(b.x,b.y+k.scale*0.16,b.z);
        m.rotation.set(pitch,Math.PI-b.yaw,-b.bank,'YXZ');
        m.userData.pose(b,time);
      }
    },
    dispose(){
      for(const m of meshes){group.remove(m);m.material.dispose()}
    },
  };
}
