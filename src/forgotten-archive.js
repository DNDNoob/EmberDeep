export const ARCHIVE_DEPTH=14;
export const LIBRARIAN=7;
export const ARCHIVE_CEILING=4.12;
export const ARCHIVE_CORRIDOR=2.65;
export const BALCONY_Y=1.6;
export const ARCHIVE_BODY=1.04;
export const isArchiveDepth=depth=>depth>=ARCHIVE_DEPTH&&(depth-ARCHIVE_DEPTH)%12===0;

export function carveArchive(g,W,rng){
  const split=rng()<0.5?4:5;
  const alcoves=(rng()<0.5?[2,6,10]:[3,5,9]).map(tx=>({tx,x:tx+0.5,z:1.5}));
  const reserved=(x,z)=>x>=1&&x<=12&&z>=1&&z<=8;
  const crawlRow=split===4?6:3;
  for(let z=1;z<=8;z++)for(let x=1;x<=12;x++){
    g[z*W+x]=Number(z===1&&x!==12&&!alcoves.some(a=>a.tx===x)||x===8&&z>=2&&z<=7&&z!==split&&z!==crawlRow);
  }
  const aisle=split+.5,gapEnd=rng()<.5?5.23:5.38;
  const blocks=[],lamps=[];
  const block=(x0,x1,z0,z1,h,kind,bottom=0)=>blocks.push({x0,x1,z0,z1,h,kind,bottom});

  // Two staircases give the upper galleries separate approaches from the reading floor.
  const stairs=[{x:1.45,z:2.42,w:1.13},{x:1.45,z:6.46,w:1.17}];
  for(const stair of stairs)for(let i=0;i<16;i++){
    const x=stair.x+i*.22,h=(i+1)*.10;
    block(x,stair.x+(i+1)*.22,stair.z,stair.z+stair.w,h,'step');
  }
  const deck=(x0,x1,z0,z1)=>block(x0,x1,z0,z1,BALCONY_Y,'deck',BALCONY_Y-.16);
  deck(4.97,7.78,2.39,3.61);
  deck(4.97,7.78,6.39,7.65);
  deck(5.08,6.13,3.61,6.39);
  deck(6.69,7.78,3.61,4.32);
  deck(6.69,7.78,gapEnd,6.39);
  const rail=(x0,x1,z0,z1)=>block(x0,x1,z0,z1,BALCONY_Y+.67,'rail',BALCONY_Y);
  rail(4.97,7.78,2.39,2.45);
  rail(4.97,7.78,7.59,7.65);
  rail(7.72,7.78,2.45,4.32);
  rail(7.72,7.78,gapEnd,7.59);
  for(const z of [3.55,6.39]){
    for(const [x0,x1] of [[4.97,5.08],[6.13,6.69]])rail(x0,x1,z,z+.06);
  }
  for(const x of [5.08,6.07])rail(x,x+.06,3.61,6.39);
  rail(6.69,6.75,3.61,4.32);
  rail(6.69,6.75,gapEnd,6.39);
  // Leave both sides of the gap open so its edge is a real drop to the library.
  block(5.14,6.07,4.70,4.98,BALCONY_Y+.34,'fallen',BALCONY_Y);
  // The bookshelves and low lintel leave crawl routes along the ground floor.
  block(8.38,8.62,split,split+1,.31,'fallen');
  block(8.02,8.98,crawlRow,crawlRow+1,1.66,'lintel',.72);
  const nook={x0:9.7,x1:11.1,z0:6.42,z1:7.78};
  block(nook.x0,nook.x1,nook.z0,nook.z1,1.06,'nook',.72);
  for(const x of [nook.x0,nook.x1-.1])block(x,x+.1,nook.z0,nook.z1,.72,'post');
  const arches=[{x:8.51,z:aisle,width:.94,height:1.75}];
  for(const x of [4.91,7.62])arches.push({x,z:4.95,width:5.93,height:3.91});
  for(const x of [2.9,5.75,7.6,10.75])lamps.push({x,z:4.95,y:3.31});
  lamps.push({x:9.8,z:crawlRow+.5,y:1.78},{x:3.6,z:5.05,y:1.25});
  for(const x of [5.05,6.86,7.64])for(const row of [3.48,6.51]){
    const z=Math.floor(row)!==crawlRow?row:crawlRow===3?3.87:6.12;
    block(x-.08,x+.08,z-.08,z+.08,1.44,'column');
  }
  const shelves=[];
  for(let x=1;x<=11;x++){
    if(x===8||alcoves.some(a=>a.tx===x))continue;
    shelves.push({x:x+0.5,z:2.18,w:0.89,yaw:0});
    block(x+0.055,x+0.945,2,2.34,1.82,'shelf');
  }
  for(const z of [3,4,5,6]){
    shelves.push({x:11.87,z:z+0.5,w:0.87,yaw:Math.PI/2});
    block(11.71,12.04,z+0.065,z+0.935,1.82,'shelf');
  }
  for(const a of alcoves){
    block(a.tx,a.tx+0.17,1.82,2.06,2.1,'jamb');
    block(a.tx+0.83,a.tx+1,1.82,2.06,2.1,'jamb');
  }
  return {reserved,blocks,alcoves,arches,lamps,shelves,stairs,aisle,split,crawlRow,nook,gapEnd,start:[1,split]};

}

const surface=b=>b.kind==='step'||b.kind==='deck'||b.kind==='fallen';
const contains=(b,x,z)=>x>=b.x0&&x<b.x1&&z>=b.z0&&z<b.z1;
const overlaps=(b,x,z,r)=>x+r>b.x0&&x-r<b.x1&&z+r>b.z0&&z-r<b.z1;
const stairRise=.115;
export function archiveGround(archive,x,z,feet){
  let y=0;
  for(const b of archive.blocks){
    if(surface(b)&&contains(b,x,z)&&b.h<=feet+(b.kind==='step'?stairRise:.001))y=Math.max(y,b.h);
  }
  return y;
}

export function archiveBlocked(archive,x,z,feet,height,r,step){
  return archive.blocks.some(b=>b.kind==='step'
    ?contains(b,x,z)&&b.h>feet+(step?stairRise:.001)
    :overlaps(b,x,z,r)&&b.h>feet+(step&&b.kind==='deck'?stairRise:.008)&&feet+height>b.bottom+.001);
}

export function archiveHeadroom(archive,x,z,feet,r){
  let y=archive.reserved(Math.floor(x),Math.floor(z))?ARCHIVE_CEILING:ARCHIVE_CORRIDOR;
  for(const b of archive.blocks){
    if(b.bottom>feet+.025&&b.bottom<y&&overlaps(b,x,z,r))y=b.bottom;
  }
  return y;
}

export function archiveMobBlocked(archive,x,z){
  return x>=8&&x<9&&z>=archive.crawlRow&&z<archive.crawlRow+1||contains(archive.nook,x,z);
}

export function archiveLowOpening(archive,x,z,feet,yaw){
  const aheadX=x+Math.cos(yaw)*.38,aheadZ=z+Math.sin(yaw)*.38;
  return archive.blocks.some(b=>(b.kind==='lintel'||b.kind==='nook')&&
    feet<b.bottom&&feet+ARCHIVE_BODY>b.bottom&&overlaps(b,aheadX,aheadZ,.23));
}

export function archiveHidden(archive,x,z,y,crouched){
  if(y>=.65)return false;
  if(z>=1&&z<1.69&&archive.alcoves.some(a=>Math.abs(x-a.x)<.38))return true;
  const n=archive.nook;
  return crouched&&x>n.x0+.19&&x<n.x1-.19&&z>n.z0+.22&&z<n.z1-.22;
}

const sand=[.67,.43,.24,9], cream=[.87,.64,.37,9], dark=[.38,.22,.13,9];
const blue=[.065,.34,.33,9], gold=[.78,.48,.15,4], wood=[.24,.095,.043,6];
const bindings=[[.4,.12,.07,6],[.11,.26,.23,6],[.28,.19,.085,6],[.38,.25,.11,6],[.23,.15,.125,6]];
const paper=[.63,.47,.30,6];

export function drawArchive(A,I,{slab,seg,rZ,rX}){
  const put=(x,y,z,sx,sy,sz,col)=>slab(I(x,z),[0,y,0],[sx,sy,sz],col);
  const box=(b,col)=>put((b.x0+b.x1)/2,(b.bottom+b.h)/2,(b.z0+b.z1)/2,b.x1-b.x0,b.h-b.bottom,b.z1-b.z0,col);
  for(const b of A.blocks){
    const width=b.x1-b.x0,depth=b.z1-b.z0,x=(b.x1+b.x0)/2,z=(b.z1+b.z0)/2;
    if(b.kind==='step'){
      box(b,sand);
      put(b.x0+.024,b.h+.004,z,.045,.012,depth-.06,cream);
      for(const edge of [b.z0+.033,b.z1-.033])put(x,b.h+.003,edge,width,.011,.07,blue);
    }else if(b.kind==='deck'){
      box(b,sand);
      put(x,b.h-.045,z,width+.014,.023,depth+.014,blue);
      for(let u=b.x0+.12;u<b.x1-.08;u+=.26){
        const f=I(u,z,Math.PI/4);
        slab(f,[0,b.h+.006,0],[.125,.013,.125],blue);
        slab(f,[0,b.h+.013,0],[.062,.013,.062],gold);
      }
    }else if(b.kind==='rail'){
      const alongX=width>depth,length=Math.max(width,depth);
      const y=b.bottom+.63,f=I(x,z,alongX?0:Math.PI/2);
      slab(f,[0,y,0],[length,.075,.105],wood);
      slab(f,[0,y+.042,0],[length,.018,.114],gold);
      slab(f,[0,b.bottom+.104,0],[length,.035,.063],blue);
      const n=Math.max(1,Math.ceil(length/.23));
      for(let i=0;i<=n;i++){
        const u=length*(i/n-.5);
        slab(f,[u,b.bottom+.32,0],[.032,.61,.032],dark);
        if(i<n){
          for(const turn of [-1,1])slab(f,[u+length/n*.5,b.bottom+.34,0],[.025,.21,.028],gold,rZ(turn*.70));
        }
      }
    }else if(b.kind==='fallen'){
      box(b,dark);
      const aloft=b.bottom>0,f=I(x,z,aloft?Math.PI/2:0);
      const length=aloft?width:depth;
      for(const w of [-.097,.097])slab(f,[w,b.h-.044,0],[.063,.09,length],wood);
      for(const part of [-.46,-.16,.16,.46])slab(f,[0,b.h-.028,part*length],[.265,.06,.044],gold);
      for(let i=0;i<7;i++){
        const u=(i/7-.43)*length;
        slab(f,[-.22,b.bottom+.025,u],[.14,.05,.08],bindings[i%bindings.length],rZ(.05));
        slab(f,[.04,b.h-.017,u],[.104,.037,.083],bindings[(i+2)%bindings.length]);
      }
    }else if(b.kind==='lintel'||b.kind==='nook'){
      box(b,b.kind==='lintel'?sand:wood);
      put(x,b.bottom+.027,z,width+.045,.055,depth+.035,blue);
      put(x,b.bottom+.066,z,width+.052,.018,depth+.043,gold);
      if(b.kind==='lintel'){
        put(x,b.h+.32,z,width,.64,depth,cream);
        put(x,b.h+.62,z,width+.035,.047,depth+.045,blue);
      }else{
        const lectern=I(x,z,Math.PI/2);
        for(const side of [-1,1]){
          slab(lectern,[.015,b.h+.028,side*.092],[.23,.026,.18],paper,rX(side*.14));
          for(let i=0;i<4;i++)slab(lectern,[(i-1.5)*.039,b.h+.048,side*.091],[.013,.005,.107],dark);
        }
        put(x-.43,b.h+.048,z+.39,.27,.087,.21,bindings[1]);
        put(x-.43,b.h+.097,z+.39,.22,.04,.25,bindings[0]);
      }
    }else if(b.kind==='post')box(b,wood);
  }
  for(const stair of A.stairs){
    const position=stair.z+stair.w*.5;
    for(const side of [-1,1]){
      const z=position+side*(stair.w*.5+.035);
      seg(I(stair.x,z),[.24,.64,0],[3.50,BALCONY_Y+.63,0],.032,.032,wood);
      for(let i=2;i<16;i+=3)put(stair.x+i*.22,i*.1+.29,z,.038,.58,.038,gold);
    }
  }
  // Stone corbels and slender columns carry the gallery above the reading floor.
  for(const b of A.blocks.filter(b=>b.kind==='column')){
    const x=(b.x0+b.x1)/2,z=(b.z0+b.z1)/2;
    put(x,.72,z,.16,1.45,.16,sand);
    put(x,.082,z,.23,.16,.23,cream);
    put(x,1.35,z,.29,.19,.25,cream);
  }
  const arch=(f,width,height,base=0)=>{
    const radius=width*.49,knee=height-width*.39;
    for(const side of [-1,1]){
      const z=side*radius;
      slab(f,[0,(knee+base)/2,z],[.23,knee-base,.16],sand);
      for(const y of [base+.09,knee-.04]){
        slab(f,[0,y,z],[.28,.095,.24],cream);
        slab(f,[0,y+.055,z],[.285,.024,.245],blue);
      }
      let prev=[0,knee,z];
      for(let i=1;i<=8;i++){
        const t=i/8,point=[0,knee+(height-knee)*Math.sin(t*Math.PI/2),z*(1-t*t)];
        const dy=point[1]-prev[1],dz=point[2]-prev[2];
        slab(f,[0,(point[1]+prev[1])/2,(point[2]+prev[2])/2],[.245,Math.hypot(dy,dz)+.022,.125],i%2?cream:dark,
          rX(Math.atan2(dz,dy)));
        prev=point;
      }
    }
  };
  for(const a of A.arches)arch(I(a.x,a.z),a.width,a.height);
  for(const a of A.alcoves){
    arch(I(a.x,2.015,Math.PI/2),.88,1.51);
    const f=I(a.x,1.05,Math.PI/2);
    slab(f,[0,.68,0],[.065,1.37,.78],blue);
    for(let i=-4;i<=4;i++)slab(f,[.041,.685,i*.085],[.026,1.35,.014],i%2?dark:gold);
    put(a.x,.016,1.45,.60,.034,.65,dark);
  }
  for(const s of A.shelves){
    const f=I(s.x,s.z,s.yaw);
    slab(f,[0,.91,-.13],[s.w,1.82,.075],wood);
    for(const x of [-s.w/2,s.w/2]){
      slab(f,[x,.92,0],[.05,1.84,.35],dark);
      slab(f,[x,1,.18],[.036,1.67,.026],gold);
    }
    for(let row=0;row<5;row++){
      const y=.12+row*.32;
      slab(f,[0,y,0],[s.w,.042,.36],wood);
      slab(f,[0,y,.183],[s.w,.022,.021],row===4?blue:gold);
      for(let n=0;n<9;n++){
        const seed=(Math.floor(s.x*17+s.z*31)+row*7+n*11)%23;
        if(seed%6===0)continue;
        const x=(n-4)*.085,h=.115+seed%9*.015;
        slab(f,[x,y+.022+h/2,.027],[.053,h,.255],bindings[seed%bindings.length]);
        slab(f,[x,y+.042+h*.30,.157],[.048,.012,.009],seed%2?paper:gold);
      }
    }
    slab(f,[0,1.773,0],[s.w+.09,.12,.39],blue);
    slab(f,[0,1.849,0],[s.w+.13,.046,.43],cream);
  }
  for(const l of A.lamps){
    const f=I(l.x,l.z);
    if(l.y>2.5)seg(f,[0,l.y+.10,0],[0,ARCHIVE_CEILING,0],.012,.012,gold);
    slab(f,[0,l.y,0],[.11,.20,.11],[1.2,.61,.20,11]);
    for(const side of [-1,1])slab(f,[0,l.y+side*.11,0],[.19,.04,.19],gold);
    for(const x of [-.067,.067])for(const z of [-.067,.067])slab(f,[x,l.y,z],[.015,.22,.015],dark);
  }
  // A tiled compass rose marks the lantern court under the open balconies.
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,x=3.5+Math.cos(angle)*.66,z=4.96+Math.sin(angle)*.66;
    slab(I(x,z,-angle),[0,.014,0],[.29,.025,.16],i%2?cream:blue);
  }
  slab(I(3.5,4.96,Math.PI/4),[0,.023,0],[.29,.018,.29],gold);
  for(let x=1.56;x<11.7;x+=.36)for(const side of [-1,1]){
    const z=A.aisle+side*1.28;
    if(x>=8&&x<9)continue;
    const f=I(x,z,Math.PI/4);
    slab(f,[0,.009,0],[.20,.02,.20],blue);
    slab(f,[0,.022,0],[.092,.009,.092],cream);
  }
  for(const x of [2.2,4.25,6.4,9.65,10.57])for(const side of [-1,1]){
    const z=A.aisle+side*1.63,f=I(x,z,x);
    for(let i=0;i<3;i++)slab(f,[i*.14,.014+i*.004,i*.073],[.15,.025,.095],i===1?bindings[0]:paper,rZ(i*.06));
  }
}

export function drawLibrarian(f,s,t,{slab,seg,ball,rZ}){
  const hunting=s.state===1,sw=Math.sin(t*4+s.ph);
  const robe=hunting?[.2,.09,.10,2]:[.06,.21,.20,2],hem=[.095,.075,.06,2],face=[.025,.02,.025,9];
  seg(f,[0,.055,0],[0,.88,0],.265,.12,robe);
  for(const side of [-1,1]){
    seg(f,[0,.82,side*.14],[.11,.52+sw*.035,side*.21],.087,.055,robe);
    seg(f,[.11,.52+sw*.035,side*.21],[.25,.50+sw*.025,side*.13],.052,.027,hem);
    ball(f,[.25,.50+sw*.025,side*.13],.035,paper,true);
    seg(f,[.14,.08,side*.14],[.10,.79,side*.09],.015,.008,gold);
  }
  ball(f,[0,1.02,0],[.15,.23,.165],robe,true);
  seg(f,[-.026,1.14,0],[-.10,1.32,0],.115,.015,robe);
  ball(f,[.105,1.014,0],[.061,.126,.106],face,true);
  for(const z of [-.045,.045])ball(f,[.156,1.049,z],.017,hunting?[1.45,.26,.13,11]:[1.0,.73,.33,11],true);
  slab(f,[.273,.47,0],[.16,.056,.27],wood,rZ(.21));
  slab(f,[.279,.499,0],[.156,.021,.238],paper,rZ(.21));
  for(const y of [.1,.14,.18])seg(f,[0,y,0],[0,y+.018,0],.268-y*.166,.264-y*.166,gold);
}
