export const liftEye=1.62;
export const liftGateZ=-10.75;
export const liftBackZ=-7.05;
export const liftCabinZ=-8.9;
export const liftGateTime=0.42;
export const landingMazeZ=-12.58;
export const liftMouthHalf=0.9;
export const liftMouthHeight=2.25;
export const liftMouthLamp={z:landingMazeZ-0.35,y:1.96,color:0xffd3a1};
export const liftCabinLamps={sides:[-0.91,0.91],y:2.77,z:liftCabinZ,color:0xffdfb5};

// Connect an outside wall to the reachable maze with the shortest practical passage.
export function mountLiftDock(floor,distances){
  const {g,W,H}=floor;
  const sealed=i=>g[i]===0&&distances[i]<0;
  let best=null;
  for(const [fx,fz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    // The bottom edge belongs to the sanctuary approach on these floors.
    if(floor.mazeH&&fz<0)continue;
    const width=fx?(floor.mazeH||H):W,length=fx?W:H;
    for(let side=1;side<width-1;side++){
      const tx=fx?(fx>0?0:W-1):side,tz=fz?(fz>0?0:H-1):side;
      const cells=[];
      for(let n=0;n<length-1;n++){
        const i=(tz+fz*n)*W+tx+fx*n;
        if(g[i]===1&&!floor.pocketMask[i]){
          // The side of the new passage must not reach around a gate or into a pocket.
          const across=fx?W:1;
          if(sealed(i-across)||sealed(i+across))break;
          cells.push(i);continue;
        }
        if(g[i]===0&&distances[i]>=0){
          const cost=distances[i]+cells.length*3;
          if(!best||cost<best.cost)best={tx,tz,fx,fz,cells,cost};
        }
        break;
      }
    }
  }
  if(!best)return null;
  const {tx,tz,fx,fz,cells}=best;
  for(const i of cells)g[i]=0;
  return {tx,tz,fx,fz,x:tx+0.5-fx*0.5,z:tz+0.5-fz*0.5,yaw:Math.atan2(fz,fx)};
}

export function dockPosition(dock,x,z,scale){
  const dx=x-dock.x,dz=z-dock.z;
  return {x:(-dx*dock.fz+dz*dock.fx)/scale,z:landingMazeZ-(dx*dock.fx+dz*dock.fz)/scale};
}

export function inDockAnnex(dock,x,z,scale,gateOpen=true){
  const p=dockPosition(dock,x,z,scale);
  if(!gateOpen&&Math.abs(p.z-liftGateZ)<0.12)return false;
  return p.z>=landingMazeZ&&p.z<=liftBackZ&&Math.abs(p.x)<(p.z<liftGateZ?liftMouthHalf:1.7);
}
