import * as THREE from 'three';

export const CASTLE_DEPTH=13;
export const CASTLE_CEILING=4.35;
export const CASTLE_GALLERY=1.89;
const TUNNEL_ROOF=3.43,TUNNEL_RADIUS=.78;
export const isCastleDepth=depth=>depth>=CASTLE_DEPTH&&(depth-CASTLE_DEPTH)%16===0;
const stepRise=.105,steps=18,inner=.48,outer=1.8,stepAngle=Math.PI*1.5/steps;
const tau=Math.PI*2,startAngle=Math.PI/2;
const rect=(x0,x1,z0,z1)=>({x0,x1,z0,z1});

export function carveCastle(grid,width,random){
  const reserved=(x,z)=>x>=2&&x<=17&&z>=1&&z<=16;
  for(let z=1;z<=16;z++)for(let x=2;x<=17;x++)grid[z*width+x]=0;
  const stairs=[4.75,11.35].flatMap(z=>[4.7,12.7].map(x=>({x,z,landingX:x+1.66})));
  const ladders=[{x:5.45,z:15.7,nx:0,nz:1},{x:14.36,z:9.42,nx:-1,nz:0}];
  // Three cross-galleries meet three north-south routes. The rooms are extensions
  // of those galleries, so the bridge and the two wings can be taken in either direction.
  const decks=[
    rect(2.08,17.92,1.02,2.92),rect(2.65,17.5,7.05,8.85),rect(2.65,17.72,13.75,15.7),
    rect(6.36,8.05,2.92,7.05),rect(9,10.65,2.92,7.05),rect(14.36,16.08,2.92,7.05),
    rect(6.36,8.05,8.85,13.75),rect(9,10.65,8.85,13.75),rect(14.36,16.08,8.85,13.75),
    rect(2.65,5.7,6.55,7.05),rect(2.65,5.7,8.85,9.58),rect(16.08,17.72,9.7,13.75),
  ];
  const tunnels=buildTunnels(width,random);
  decks.push(...tunnels.decks);
  const openings=stairs.map(({landingX,z})=>({axis:'x',at:landingX,lo:z-.58,hi:z+.28}));
  for(const {x,z,nx} of ladders)openings.push(nx?{axis:'x',at:x,lo:z-.43,hi:z+.43}:{axis:'z',at:z,lo:x-.43,hi:x+.43});
  const perimeter=upperPerimeter(decks,openings);
  const rails=[],tunnelWalls=[],walls=[rect(2.65,4.7,8.25,8.41),rect(16.74,17.72,11.6,11.76)];
  for(const {axis,at,lo,hi} of perimeter){
    if(axis==='z'&&at===1.02)continue; // the exterior window wall already closes this side
    const mid=(lo+hi)/2;
    const tunnel=tunnels.decks.some(deck=>axis==='x'?inside(deck,at,mid,.012):inside(deck,mid,at,.012));
    const solid=axis==='x'&&(at===8.05||at===6.36&&hi<=7.05||at===17.72&&lo>=9.7)||axis==='z'&&at===6.55;
    const skin=tunnel||solid?.085:.027;
    (tunnel?tunnelWalls:solid?walls:rails).push(axis==='x'?rect(at-skin,at+skin,lo,hi):rect(lo,hi,at-skin,at+skin));
  }
  const centers=random()<.5?[8.55,16,11.7]:[8.95,16.2,12.15];
  const hatches=centers.map((x,i)=>({...rect(x-.49,x+.49,i===2?14.20:1.47,i===2?15.19:2.47),triggered:-Infinity}));
  const platforms=hatches.reduce((areas,hatch)=>areas.flatMap(deck=>subtractDeck(deck,hatch)),decks);
  const columns=[6.92,9.24,14.9].flatMap(x=>[7.65,14.95].map(z=>({x,z})));
  const windows=[3,5,7,9,11,13,15,17].map(tx=>({tx,x:tx+.5}));
  const lamps=[3.5,7.55,11.55,15.55].flatMap(x=>[{x,y:1.28,z:5.75},{x,y:2.88,z:1.6},{x,y:2.95,z:7.8},{x,y:2.96,z:14.6}]);
  lamps.push({x:17.3,y:2.94,z:10.1},{x:10.38,y:2.94,z:10.65},{x:5.45,y:1.03,z:16.55});
  lamps.push(...tunnels.lamps);
  const rugs=[rect(3.01,5.24,7.12,8.11),rect(16.46,17.39,12.17,13.57),rect(3.06,4.73,14.16,15.25)];
  const upperBounds=rect(Math.min(...decks.map(deck=>deck.x0)),Math.max(...decks.map(deck=>deck.x1)),
    Math.min(...decks.map(deck=>deck.z0)),Math.max(...decks.map(deck=>deck.z1)));
  const mapTiles=indexDecks(decks,width);
  return {reserved,start:[9,8],stairs,ladders,platforms,rails,walls,columns,windows,hatches,lamps,rugs,upperBounds,mapTiles,
    tunnels,tunnelWalls,tunnelTiles:indexDecks(tunnels.decks,width),width,upperSeen:new Set()};
}

function indexDecks(decks,width){
  const tiles=new Map();
  for(const deck of decks)for(let z=Math.floor(deck.z0);z<deck.z1;z++)for(let x=Math.floor(deck.x0);x<deck.x1;x++){
    const key=z*width+x;
    const fragment=rect(Math.max(x,deck.x0),Math.min(x+1,deck.x1),Math.max(z,deck.z0),Math.min(z+1,deck.z1));
    if(!tiles.has(key))tiles.set(key,[]);
    tiles.get(key).push(fragment);
  }
  return tiles;
}

function buildTunnels(width,random){
  const xs=[3.5,10,16.2,22.5,28.5,34.5,width-2.5],zs=[2.5,8,14.5,20.5,26.5,32.5,width-2.5];
  const nodes=new Map(),decks=[],edges=[],lamps=[];
  const key=(col,row)=>row*xs.length+col;
  for(const [row,z] of zs.entries())for(const [col,x] of xs.entries()){
    if(col<3&&row<3)continue;
    const size=random()<.27?1.34:1.02,id=key(col,row);
    nodes.set(id,{id,x,z,size});
    decks.push(rect(x-size,x+size,z-size,z+size));
    if((col+row)%2===0)lamps.push({x:x+size-.17,y:2.78,z:z+size-.18});
    for(const neighbor of [col>0?nodes.get(key(col-1,row)):null,row>0?nodes.get(key(col,row-1)):null]){
      if(neighbor)edges.push({from:neighbor.id,to:id,order:random()});
    }
  }
  // A seeded spanning tree reaches every chamber. Extra links make alternate routes around dead ends.
  const parents=new Map(Array.from(nodes.keys(),id=>[id,id]));
  const root=id=>{while(parents.get(id)!==id)id=parents.get(id);return id};
  const connect=({from,to})=>{
    const p=nodes.get(from),q=nodes.get(to),r=TUNNEL_RADIUS;
    decks.push(p.z===q.z?rect(p.x+p.size,q.x-q.size,p.z-r,p.z+r):rect(p.x-r,p.x+r,p.z+p.size,q.z-q.size));
  };
  const unused=[];
  let cycles=0;
  for(const edge of edges.sort((a,b)=>a.order-b.order)){
    const {from,to}=edge;
    const a=root(from),b=root(to);
    if(a===b&&random()>=.33){unused.push(edge);continue}
    if(a===b)cycles++;
    else parents.set(a,b);
    connect(edge);
  }
  for(const edge of unused.slice(0,Math.max(0,3-cycles)))connect(edge);
  const r=TUNNEL_RADIUS;
  const east=nodes.get(key(3,1)),south=nodes.get(key(1,3)),southeast=nodes.get(key(2,3));
  decks.push(rect(17.5,east.x-east.size,east.z-r,east.z+r));
  for(const node of [south,southeast])decks.push(rect(node.x-r,node.x+r,15.7,node.z-node.size));
  const portals=[
    {axis:'x',at:18,lo:east.z-r,hi:east.z+r},
    ...[south,southeast].map(node=>({axis:'z',at:17,lo:node.x-r,hi:node.x+r})),
  ];
  const far=nodes.get(key(xs.length-1,zs.length-1));
  return {decks,lamps,portals,far};
}

function upperPerimeter(decks,openings){
  const result=[];
  for(const axis of ['x','z']){
    const along=axis==='x'?'z':'x';
    const edges=[...new Set(decks.flatMap(deck=>[deck[axis+'0'],deck[axis+'1']]))];
    const cuts=[...new Set([...decks.flatMap(deck=>[deck[along+'0'],deck[along+'1']]),
      ...openings.filter(exit=>exit.axis===axis).flatMap(exit=>[exit.lo,exit.hi])])].sort((a,b)=>a-b);
    const onDeck=(u,v)=>decks.some(deck=>axis==='x'?inside(deck,u,v):inside(deck,v,u));
    for(const at of edges){
      let segment=null;
      for(let i=1;i<cuts.length;i++){
        const lo=cuts[i-1],hi=cuts[i],mid=(lo+hi)/2;
        const edge=onDeck(at-.01,mid)!==onDeck(at+.01,mid);
        const gap=openings.some(exit=>exit.axis===axis&&Math.abs(exit.at-at)<.001&&mid>exit.lo&&mid<exit.hi);
        if(!edge||gap){segment=null;continue}
        if(segment)segment.hi=hi;
        else{segment={axis,at,lo,hi};result.push(segment)}
      }
    }
  }
  return result;
}

function subtractDeck(deck,hole){
  const x0=Math.max(deck.x0,hole.x0),x1=Math.min(deck.x1,hole.x1);
  const z0=Math.max(deck.z0,hole.z0),z1=Math.min(deck.z1,hole.z1);
  if(x0>=x1||z0>=z1)return [deck];
  return [rect(deck.x0,x0,deck.z0,deck.z1),rect(x1,deck.x1,deck.z0,deck.z1),
    rect(x0,x1,deck.z0,z0),rect(x0,x1,z1,deck.z1)].filter(part=>part.x1>part.x0&&part.z1>part.z0);
}

function inside(rect,x,z,margin=0){
  return x>rect.x0-margin&&x<rect.x1+margin&&z>rect.z0-margin&&z<rect.z1+margin;
}

export function castleLadderNear(castle,body){
  return castle.ladders.find(ladder=>{
    const dx=body.x-ladder.x,dz=body.z-ladder.z;
    const side=dx*ladder.nz-dz*ladder.nx,out=dx*ladder.nx+dz*ladder.nz;
    return Math.abs(side)<.38&&(body.y<.13?out>.12&&out<.9:
      Math.abs(body.y-CASTLE_GALLERY)<.13&&out>-.24&&out<.32);
  });
}

// Walking into the rungs from below climbs up. Walking out of their rail gap
// from above climbs down. Reversing the same movement works midway.
export function stepCastleLadder(castle,body,dt,dx,dz){
  let ladder=body.castleLadder;
  if(ladder&&Math.hypot(body.x-ladder.x-ladder.nx*.42,body.z-ladder.z-ladder.nz*.42)>.24){
    body.castleLadder=null;ladder=null;
  }
  if(!ladder){
    ladder=castleLadderNear(castle,body);
    if(!ladder||Math.abs(body.vy)>.35)return false;
    const toward=dx*ladder.nx+dz*ladder.nz;
    if(body.y<.13?toward>=-.16:toward<=.16)return false;
    body.castleLadder=ladder;
  }
  const climb=-(dx*ladder.nx+dz*ladder.nz);
  const y=Math.max(0,Math.min(CASTLE_GALLERY,body.y+climb*1.65*dt));
  const reachedTop=climb>0&&y===CASTLE_GALLERY;
  const reachedBottom=climb<0&&y===0;
  const offset=reachedTop?-.34:reachedBottom?.91:.42;
  body.x=ladder.x+offset*ladder.nx;
  body.z=ladder.z+offset*ladder.nz;
  body.y=y;
  body.vx=body.vz=body.vy=body.jumpQ=0;
  body.crouched=false;
  body.crouchBlend=(body.crouchBlend||0)*Math.max(0,1-dt*17);
  if(reachedTop||reachedBottom)body.castleLadder=null;
  return true;
}

function stairHeight(stair,x,z,margin=0){
  const dx=x-stair.x,dz=z-stair.z,r=Math.hypot(dx,dz);
  if(r<inner-margin||r>outer+margin)return 0;
  const a=(Math.atan2(dz,dx)-startAngle+tau)%tau;
  return a<steps*stepAngle?stepRise*(1+Math.floor(a/stepAngle)):0;
}

export function hatchAngle(hatch,time){
  const age=time-hatch.triggered;
  return Math.min(1,Math.max(0,(age-.18)/.20),Math.max(0,(3.35-age)/.27))*1.40;
}

export function castleHatchAt(castle,x,z){
  return castle.hatches.findIndex(hatch=>inside(hatch,x,z,-.07));
}

export function startCastleHatch(hatch,time){
  if(!hatch||time-hatch.triggered<3.8)return false;
  hatch.triggered=time;
  return true;
}

export function castleGround(castle,x,z,feet,time){
  let ground=0;
  for(const stair of castle.stairs){
    const y=stairHeight(stair,x,z);
    if(y<=feet+.118)ground=Math.max(ground,y);
  }
  if(feet+.118>=CASTLE_GALLERY&&(
    castle.platforms.some(deck=>inside(deck,x,z,.003))||
    castle.hatches.some(hatch=>hatchAngle(hatch,time)<.42&&inside(hatch,x,z,.003))))return CASTLE_GALLERY;
  return ground;
}

export function castleBlocked(castle,x,z,feet,height,radius){
  if(feet+height>CASTLE_GALLERY&&(castle.tunnelWalls.some(wall=>inside(wall,x,z,radius))||
    feet+height>TUNNEL_ROOF&&castleTunnelAt(castle,x,z)))return true;
  if(!castle.reserved(Math.floor(x),Math.floor(z)))return false;
  if(castle.columns.some(p=>Math.hypot(x-p.x,z-p.z)<.23+radius))return true;
  for(const stair of castle.stairs){
    if(Math.hypot(x-stair.x,z-stair.z)<.23+radius)return true;
    if(stairHeight(stair,x,z)>feet+.118)return true;
  }
  if(feet<CASTLE_GALLERY-.118&&feet+height>CASTLE_GALLERY-.18&&castle.platforms.some(deck=>inside(deck,x,z,radius)))return true;
  if(feet+height>CASTLE_GALLERY&&castle.walls.some(wall=>inside(wall,x,z,radius)))return true;
  return feet>=CASTLE_GALLERY-.11&&feet<CASTLE_GALLERY+.67&&castle.rails.some(rail=>inside(rail,x,z,radius));
}

export function castleHeadroom(castle,x,z,feet,radius){
  if(feet>=CASTLE_GALLERY-.19&&castleTunnelAt(castle,x,z))return TUNNEL_ROOF;
  if(!castle.reserved(Math.floor(x),Math.floor(z)))return 1.25;
  if(feet<CASTLE_GALLERY-.20&&castle.platforms.some(deck=>inside(deck,x,z,radius)))return CASTLE_GALLERY-.18;
  return CASTLE_CEILING;
}

export function castleTunnelAt(castle,x,z){
  const fragments=castle.tunnelTiles.get(Math.floor(z)*castle.width+Math.floor(x));
  return !!fragments?.some(fragment=>inside(fragment,x,z,.002));
}

// Cut just the upstairs doorways through the keep's perimeter. The lower wall
// underneath them still belongs to the original maze.
export function drawCastlePerimeterWall(castle,quad,points,normal,uv,layer){
  const [a,b,,c]=points;
  const fixed=normal[0]?'x':'z',axis=fixed==='x'?2:0,plane=fixed==='x'?0:2;
  const u0=a[axis],u1=b[axis],y0=a[1],y1=c[1];
  const low=Math.min(u0,u1),high=Math.max(u0,u1);
  const portals=castle.tunnels.portals.filter(p=>p.axis===fixed&&Math.abs(p.at-a[plane])<.001&&p.lo<high&&p.hi>low);
  if(!portals.length||y1<=CASTLE_GALLERY||y0>=TUNNEL_ROOF){quad(points,normal,uv,layer);return}
  const holes=portals.map(p=>rect(p.lo,p.hi,CASTLE_GALLERY,TUNNEL_ROOF));
  const slices=holes.reduce((parts,hole)=>parts.flatMap(part=>subtractDeck(part,hole)),[rect(low,high,y0,y1)]);
  const at=(horizontal,height)=>{
    const t=(horizontal-u0)/(u1-u0);
    return [a[0]+(b[0]-a[0])*t,height,a[2]+(b[2]-a[2])*t];
  };
  const map=(horizontal,height)=>{
    const t=(horizontal-u0)/(u1-u0),h=(height-y0)/(y1-y0);
    return [0,1].map(i=>((1-t)*uv[0][i]+t*uv[1][i])*(1-h)+((1-t)*uv[3][i]+t*uv[2][i])*h);
  };
  for(const part of slices){
    const left=u1>u0?part.x0:part.x1,right=u1>u0?part.x1:part.x0;
    const corners=[[left,part.z0],[right,part.z0],[right,part.z1],[left,part.z1]];
    quad(corners.map(pair=>at(...pair)),normal,corners.map(pair=>map(...pair)),layer);
  }
}

// Use the world material for stonework so the torch, shadows and fog match the adjoining maze.
export function castleWindowWall(quad,x,z,top,layer){
  const uv=points=>points.map(([u,y])=>[u,1-y/1.25]);
  const panel=(a,b,low,high)=>quad([[a,low,z],[b,low,z],[b,high,z],[a,high,z]],[0,0,1],
    uv([[a,low],[b,low],[b,high],[a,high]]),layer);
  const left=x+.32,right=x+.68;
  panel(x,left,0,top);panel(right,x+1,0,top);
  let bottom=0;
  for(const [sill,arch] of [[.68,1.55],[2.51,3.69]]){
    panel(left,right,bottom,sill);
    const tip=x+.5,peak=arch+.24;
    quad([[left,arch,z],[tip,peak,z],[tip,peak,z],[left,peak,z]],[0,0,1],uv([[left,arch],[tip,peak],[tip,peak],[left,peak]]),layer);
    quad([[tip,peak,z],[right,arch,z],[right,peak,z],[tip,peak,z]],[0,0,1],uv([[tip,peak],[right,arch],[right,peak],[tip,peak]]),layer);
    bottom=arch+.24;
  }
  panel(left,right,bottom,top);
}

export function drawCastleArchitecture(castle,quad){
  const face=(points,n,layer=0)=>{
    const uv=points.map(([x,y,z])=>n[1]?[x/2,z/2]:[(x*n[2]-z*n[0])/1.5,1-y/1.25]);
    quad(points,n,uv,layer);
  };
  for(const stair of castle.stairs)for(let i=0;i<steps;i++){
    const a=startAngle+i*stepAngle,b=a+stepAngle,y=(i+1)*stepRise;
    const point=(r,t,h)=>[stair.x+r*Math.cos(t),h,stair.z+r*Math.sin(t)];
    const post=.21;
    face([point(post,a,y),point(outer,a,y),point(outer,b,y),point(post,b,y)],[0,1,0],1);
    face([point(post,a,y-.18),point(post,b,y-.18),point(outer,b,y-.18),point(outer,a,y-.18)],[0,-1,0]);
    face([point(post,a,y-.18),point(outer,a,y-.18),point(outer,a,y),point(post,a,y)],[Math.sin(a),0,-Math.cos(a)]);
    face([point(post,b,y-.18),point(outer,b,y-.18),point(outer,b,y),point(post,b,y)],[-Math.sin(b),0,Math.cos(b)]);
    const m=(a+b)/2;
    face([point(outer,a,y-.18),point(outer,b,y-.18),point(outer,b,y),point(outer,a,y)],[Math.cos(m),0,Math.sin(m)]);
  }
  const box=({x0,x1,z0,z1},lo,y,topLayer)=>{
    face([[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]],[0,1,0],topLayer);
    face([[x0,lo,z0],[x1,lo,z0],[x1,lo,z1],[x0,lo,z1]],[0,-1,0]);
    face([[x0,lo,z0],[x0,lo,z1],[x0,y,z1],[x0,y,z0]],[-1,0,0]);
    face([[x1,lo,z0],[x1,lo,z1],[x1,y,z1],[x1,y,z0]],[1,0,0]);
    face([[x0,lo,z0],[x1,lo,z0],[x1,y,z0],[x0,y,z0]],[0,0,-1]);
    face([[x0,lo,z1],[x1,lo,z1],[x1,y,z1],[x0,y,z1]],[0,0,1]);
  };
  for(const platform of castle.platforms)box(platform,CASTLE_GALLERY-.18,CASTLE_GALLERY,1);
  for(const wall of castle.walls)box(wall,CASTLE_GALLERY,CASTLE_CEILING,0);
  for(const wall of castle.tunnelWalls)box(wall,CASTLE_GALLERY,TUNNEL_ROOF+.12,0);
  for(const roof of castle.tunnels.decks)box(roof,TUNNEL_ROOF,TUNNEL_ROOF+.12,2);
}

export function drawCastleDetails(castle,frame,{slab,seg}){
  const limestone=[.46,.44,.41,9],edge=[.60,.58,.55,9],iron=[.13,.145,.16,4],cloth=[.115,.134,.16,2];
  for(const p of [...castle.stairs,...castle.columns]){
    const f=frame(p.x,p.z);
    seg(f,[0,.12,0],[0,4.23,0],.22,.22,limestone);
    for(const y of [.10,.24,1.89,4.10,4.23])slab(f,[0,y,0],[.59,.13,.59],edge);
  }
  for(const {x0,x1,z0,z1} of castle.rails){
    const f=frame((x0+x1)/2,(z0+z1)/2),dx=x1-x0,dz=z1-z0;
    slab(f,[0,CASTLE_GALLERY+.64,0],[dx+.035,.075,dz+.035],edge);
    const length=Math.max(dx,dz),count=Math.max(1,Math.ceil(length/.35));
    for(let i=0;i<=count;i++){
      const u=i/count-.5;
      slab(f,[dx>dz?dx*u:0,CASTLE_GALLERY+.30,dz>dx?dz*u:0],[.052,.60,.052],iron);
    }
  }
  const rung=[.31,.28,.25,6],fastener=[.31,.33,.36,4];
  for(const {x,z,nx,nz} of castle.ladders){
    const f=frame(x+nx*.1,z+nz*.1);
    const size=(width,height,depth)=>nx?[depth,height,width]:[width,height,depth];
    for(const side of [-1,1]){
      slab(f,[side*nz*.30,1.16,side*nx*.30],size(.095,2.30,.10),rung);
      for(const y of [.10,1.65,2.21])slab(f,[side*nz*.30,y,side*nx*.30],size(.113,.11,.14),fastener);
    }
    for(let y=.20;y<2.19;y+=.23)slab(f,[0,y,0],size(.59,.062,.08),rung);
  }
  for(const {x0,x1,z0,z1} of castle.rugs){
    const f=frame((x0+x1)/2,(z0+z1)/2),w=x1-x0,d=z1-z0;
    const trim=[.31,.33,.36,2];
    slab(f,[0,CASTLE_GALLERY+.009,0],[w,.014,d],cloth);
    for(const side of [-1,1]){
      slab(f,[side*(w/2-.075),CASTLE_GALLERY+.018,0],[.035,.007,d-.10],trim);
      slab(f,[0,CASTLE_GALLERY+.018,side*(d/2-.075)],[w-.12,.007,.035],trim);
    }
  }
  for(const {x} of castle.windows){
    const f=frame(x,1.07);
    for(const y of [.65,2.48])slab(f,[0,y,0],[.56,.09,.23],edge);
    for(const side of [-1,1]){
      slab(f,[side*.225,3.09,0],[.10,1.12,.22],limestone);
      seg(f,[side*.23,3.64,.007],[0,3.99,.007],.065,.065,edge);
    }
  }
  for(const x of [4,8,12,16]){
    const f=frame(x,1.10);
    slab(f,[0,3.63,.015],[.62,1.18,.028],cloth);
    slab(f,[0,4.18,.035],[.75,.045,.048],iron);
    slab(f,[0,3.66,.037],[.035,.58,.012],edge);
    slab(f,[0,3.77,.037],[.22,.034,.012],edge);
  }
  for(const {x,y,z} of castle.lamps){
    const f=frame(x,z);
    slab(f,[0,y-.17,0],[.10,.30,.10],iron);
    slab(f,[0,y-.03,0],[.16,.045,.16],edge);
  }
}

export function drawCastleHatches(castle,time,frame,{slab,subF,rX}){
  const wood=[.25,.23,.21,6],iron=[.13,.15,.17,4];
  for(const hatch of castle.hatches){
    const width=hatch.x1-hatch.x0,length=hatch.z1-hatch.z0;
    const f=subF(frame((hatch.x0+hatch.x1)/2,hatch.z0),[0,CASTLE_GALLERY,0],rX(hatchAngle(hatch,time)));
    for(let i=0;i<6;i++)slab(f,[(i-2.5)*width/6,-.045,length/2],[width/6-.011,.085,length],wood);
    for(const x of [-.32,.32])slab(f,[x,.001,length/2],[.056,.013,length-.09],iron);
    slab(f,[0,.025,length*.80],[.19,.036,.045],iron);
  }
}

// A distant painted-style skyline generated on the GPU, visible only through the slits.
export function createCastleValley(){
  const geometry=new THREE.PlaneGeometry(56,32);
  const material=new THREE.ShaderMaterial({fog:false,side:THREE.DoubleSide,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;
      float hash(float x){return fract(sin(x*45.81)*43758.5453);}
      float noise(float x){float i=floor(x),f=fract(x);return mix(hash(i),hash(i+1.),f*f*(3.-2.*f));}
      void main(){
        vec2 p=vec2(vUv.x,(vUv.y-.5)*(32./18.)+.5);
        vec3 sky=mix(vec3(.70,.75,.73),vec3(.26,.37,.43),smoothstep(.39,.84,p.y));
        vec3 col=sky+vec3(.12,.09,.051)*exp(-length((p-vec2(.64,.65))*vec2(4.,2.2))*4.);
        for(int i=0;i<5;i++){
          float k=float(i),x=p.x*(13.+k*5.)+k*11.;
          float ridge=.59-k*.052+noise(x)*(.10+k*.012)+noise(x*3.2)*.024+noise(x*10.)*.008;
          vec3 hill=mix(vec3(.47,.55,.55),vec3(.115,.23,.26),k/4.);
          float haze=exp(-abs(p.y-ridge+.10)*15.);
          hill=mix(hill,vec3(.59,.66,.65),haze*(.63-k*.075));
          col=mix(col,hill,1.-smoothstep(ridge-.004,ridge+.003,p.y));
        }
        float fog=sin(p.y*104.+sin(p.x*27.)*.92)*.035+.09;
        col=mix(col,vec3(.66,.70,.69),fog*(1.-smoothstep(.52,.77,p.y)));
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`
  });
  const valley=new THREE.Mesh(geometry,material);
  valley.name='Misty valley';valley.position.set(10,2.5,-9);
  return valley;
}
