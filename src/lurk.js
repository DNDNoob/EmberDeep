// A person in the maze whose shadow is wrong. It wanders until it is stared at.
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const SEE=0.78, STARE=2.15, CHASE=2.65, WALK=1.05, REACH=0.46;

export function lurkLooking(n,p){
  const dx=n.x-p.x,dz=n.z-p.z,d=Math.hypot(dx,dz);
  if(d<0.35||d>8||p.down)return false;
  return (Math.cos(p.yaw)*dx+Math.sin(p.yaw)*dz)/d>SEE;
}

// n moves in place. world.open(tx,tz) is a floor cell it may stand in. world.los is from the player's eyes.
// world.rand() is [0,1). Returns {hurt, looking}.
export function lurkStep(n,dt,p,world){
  const looking=!!world.los(n.x,n.z)&&lurkLooking(n,p);
  if(!n.aggro){
    if(looking)n.stare=(n.stare||0)+dt;
    else n.stare=Math.max(0,(n.stare||0)-dt*3);
    if(n.stare>=STARE)n.aggro=true;
  }
  const cx=Math.floor(n.x),cz=Math.floor(n.z);
  let gx=(n.gx??cx)+0.5,gz=(n.gy??cz)+0.5;
  if(n.aggro){gx=p.x;gz=p.z}
  const dx=gx-n.x,dz=gz-n.z,l=Math.hypot(dx,dz);
  const step=(n.aggro?CHASE:WALK)*dt;
  const toward=()=>{
    if(l<1e-4)return false;
    const nx=n.x+dx/l*Math.min(step,l),nz=n.z+dz/l*Math.min(step,l);
    if(!world.open(Math.floor(nx),Math.floor(nz)))return false;
    n.x=nx;n.z=nz;n.face=Math.atan2(dz,dx);return true;
  };
  if(l<=step+0.001&&!n.aggro){
    n.x=gx;n.z=gz;
    const opts=[];
    for(const [ox,oz] of DIRS){
      const nx=cx+ox,nz=cz+oz;
      if(!world.open(nx,nz)||(nx===n.px&&nz===n.py))continue;
      opts.push([nx,nz]);
    }
    const next=opts.length?opts[(world.rand()*opts.length)|0]:(n.px>=0?[n.px,n.py]:null);
    if(next){n.px=cx;n.py=cz;n.gx=next[0];n.gy=next[1]}
  }else if(!toward()){
    let best=null,bestD=1e9;
    for(const [ox,oz] of DIRS){
      const nx=cx+ox,nz=cz+oz;
      if(!world.open(nx,nz))continue;
      const nd=(nx+0.5-gx)**2+(nz+0.5-gz)**2;
      if(nd<bestD){bestD=nd;best=[nx+0.5,nz+0.5]}
    }
    if(best){
      if(n.aggro){
        const sx=best[0]-n.x,sz=best[1]-n.z,sl=Math.hypot(sx,sz);
        if(sl>1e-4){n.x+=sx/sl*Math.min(step,sl);n.z+=sz/sl*Math.min(step,sl);n.face=Math.atan2(sz,sx)}
      }else{n.gx=Math.floor(best[0]);n.gy=Math.floor(best[1])}
    }
  }
  n.hitT=Math.max(0,(n.hitT||0)-dt);
  const hurt=!!n.aggro&&n.hitT<=0&&Math.hypot(n.x-p.x,n.z-p.z)<REACH;
  if(hurt)n.hitT=1.15;
  return {hurt,looking};
}
