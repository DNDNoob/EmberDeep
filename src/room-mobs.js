// Strange-door creatures recorded in the Mob Archive. Maze shades stay in game.js.
// Order is the order of the exhibits: keep new ids at the end.
export const ROOM_MOBS={
  guest:{name:'The Guest',room:'mirror'},
  teens:{name:'Teenagers',room:'theater'},
  moose:{name:'Moose',room:'moose'},
  goose:{name:'Canada Goose',room:'moose'},
  mother:{name:'Mother Goose',room:'moose'},
};

// Same cone the maze uses: in front of the look direction and within maxDist.
// Pure so the archive rules can be tested without three.
export function spotted(eye,dir,target,maxDist=12,minDot=0.52){
  const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2];
  const d=Math.hypot(dx,dy,dz);
  if(!(d>1e-4)||d>maxDist)return false;
  const len=Math.hypot(dir[0],dir[1],dir[2])||1;
  return (dx*dir[0]+dy*dir[1]+dz*dir[2])/(d*len)>=minDot;
}
