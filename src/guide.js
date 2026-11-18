// The guiding light ("Knowledge is power"): pure path helpers, kept apart from the game so they can be read and tested on their own.
export const GUIDE_RANGE=14;   // tiles: the light never sits farther than this from you, so it stays inside the torch-fog of the sprites
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
// the shortest walkable path from (sx,sy) to (tx,ty) over grid g (0 = open), as [[tx,ty],...] starting at the player's own tile; null when unreachable
export function guidePath(bfs,g,W,H,sx,sy,tx,ty){
  const d=bfs(g,W,H,tx,ty);if(d[sy*W+sx]<0)return null;
  const path=[[sx,sy]];let x=sx,y=sy,lx=0,ly=0,guard=W*H;
  while((x!==tx||y!==ty)&&guard-->0){
    const here=d[y*W+x];let best=null;
    // keep going straight when the way ahead is just as short, so the route reads as long corridors
    const order=lx||ly?[[lx,ly],...DIRS]:DIRS;
    for(const [dx,dy] of order){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;if(d[ny*W+nx]===here-1){best=[dx,dy];break}}
    if(!best)return null;
    x+=best[0];y+=best[1];lx=best[0];ly=best[1];path.push([x,y]);
  }
  return path;
}
// the farthest tile along the path that you can see in a straight line (and within range): the end of the corridor you are looking down.
// With the target itself in view, the light sits on the target.
export function guideBeacon(path,px,pz,los,range=GUIDE_RANGE){
  if(!path||path.length<2)return path&&path.length?path[0]:null;
  for(let i=path.length-1;i>=1;i--){
    const [x,y]=path[i];
    if(Math.hypot(x+0.5-px,y+0.5-pz)<=range&&los(px,pz,x+0.5,y+0.5))return path[i];
  }
  return path[1];
}
