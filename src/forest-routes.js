const inside=(q,x,z)=>x>=q.x0&&x<q.x1&&z>=q.z0&&z<q.z1;
export const CREEK_BED=-.26,CREEK_WATER=-.083,ROOT_CLEARANCE=.72;

export function carveForestRoutes(g,W,H,start,safe,bfs,rng){
  const sites=[];
  for(let z=2;z<=H-10;z+=2)for(let x=2;x<=W-13;x+=2){
    if(safe&&x-3<safe.tx&&x+13>safe.tx&&z-4<safe.ty&&z+11>safe.ty)continue;
    const d=Math.hypot(x+5-start[0],z+3.5-start[1]);
    sites.push({x,z,rank:d+rng()*3});
  }
  sites.sort((a,b)=>a.rank-b.rank);
  const {x,z}=sites[0];
  const creek={x0:x,x1:x+10,z0:z,z1:z+7,mid:x+5.05,phase:rng()*Math.PI*2,
    bridge:z+(rng()<.5?1.65:5.35)};
  const stoneZ=z+(creek.bridge<z+3?5.30:1.70),stones=[];
  for(let i=0;i<3;i++){
    const pz=stoneZ+[-.13,.19,-.10][i];
    stones.push({x:creekCenter(creek,pz)+(i-1)*.66,z:pz,rx:.23+rng()*.06,rz:.29+rng()*.08,y:.035+rng()*.03});
  }
  creek.stones=stones;
  for(let pz=z;pz<z+7;pz++)for(let px=x;px<x+10;px++)g[pz*W+px]=0;

  const roots=[],candidates=[];
  // Link old paths through a wall when going around already takes several tiles.
  for(let pz=2;pz<H-2;pz++)for(let px=2;px<W-2;px++){
    if(g[pz*W+px]!==1||px>=x-1&&px<=x+10&&pz>=z-1&&pz<=z+7||
      safe&&Math.abs(px-safe.tx)<=3&&Math.abs(pz-safe.ty)<=3)continue;
    for(const [dx,dz] of [[1,0],[0,1]]){
      if(g[(pz+dz)*W+px+dx]!==0||g[(pz-dz)*W+px-dx]!==0||
        g[(pz+dx)*W+px+dz]!==1||g[(pz-dx)*W+px-dz]!==1)continue;
      candidates.push({tx:px,tz:pz,x:px+.5,z:pz+.5,dx,dz,rank:rng()});
    }
  }
  candidates.sort((a,b)=>a.rank-b.rank);
  for(const root of candidates){
    if(roots.length===2)break;
    const {tx,tz,dx,dz}=root;
    if(roots.some(p=>Math.abs(p.tx-tx)+Math.abs(p.tz-tz)<7))continue;
    const dist=bfs(g,W,H,tx-dx,tz-dz)[(tz+dz)*W+tx+dx];
    if(dist<6)continue;
    g[tz*W+tx]=0;
    roots.push(root);
  }
  const reserved=(px,pz)=>inside(creek,px,pz)||
    roots.some(r=>Math.abs(px-r.tx)+Math.abs(pz-r.tz)<=1);
  return {creek,roots,reserved,oak:{x:x+8.55,z:z+3.65},arch:{x:x+2.05,z:z+2.80}};
}

export function creekCenter(c,z){
  return c.mid+.23*Math.sin((z-c.z0)*1.08+c.phase);
}
export function creekBanks(c,z){
  const mid=creekCenter(c,z),end=Math.min(1,z-c.z0,c.z1-z);
  const half=.60+end*(.38+.085*Math.sin((z-c.z0)*1.9+c.phase));
  return [mid-half,mid+half];
}
const bridgeAt=(c,x,z)=>Math.abs(x-c.mid)<1.43&&Math.abs(z-c.bridge)<.48;
const onStone=(p,x,z)=>((x-p.x)/p.rx)**2+((z-p.z)/p.rz)**2<1;
const overOak=(oak,x,z,radius=0)=>Math.abs(x-oak.x)<.28+radius&&Math.abs(z-oak.z)<1.26+radius;
const OAK_TOP=.48;
export function forestSubmerged(routes,x,z,y){
  const c=routes.creek;
  if(y>CREEK_WATER+.055||!inside(c,x,z)||bridgeAt(c,x,z))return false;
  const [l,r]=creekBanks(c,z);
  return x>l&&x<r;
}
export function forestGround(routes,x,z,feet){
  const c=routes.creek;
  if(!inside(c,x,z))return 0;
  if(feet>=OAK_TOP-.07&&overOak(routes.oak,x,z))return OAK_TOP;
  if(bridgeAt(c,x,z))return .052;
  for(const stone of c.stones)if(feet>=stone.y-.11&&onStone(stone,x,z))return stone.y;
  const [l,r]=creekBanks(c,z);
  if(x<=l||x>=r)return 0;
  return CREEK_BED;
}
function rootIn(r,x,z,radius){
  const dx=x-r.x,dz=z-r.z;
  return Math.abs(dx*r.dx+dz*r.dz)<.43+radius&&Math.abs(dx*r.dz-dz*r.dx)<.53+radius;
}
export function forestRootAt(routes,x,z,radius=0){
  return routes.roots.some(r=>rootIn(r,x,z,radius));
}
export function forestRootTile(routes,tx,tz){
  return routes.roots.some(r=>r.tx===tx&&r.tz===tz);
}
export function forestCover(routes,x,z,y,crouched){
  return crouched&&y<.10&&forestRootAt(routes,x,z,-.13);
}
export function forestBlocked(routes,x,z,feet,height,radius){
  if(feet+height>ROOT_CLEARANCE&&forestRootAt(routes,x,z,radius))return true;
  if(feet<-.10&&routes.creek.stones.some(p=>onStone(p,x,z)))return true;
  const {oak,arch}=routes;
  if(feet<OAK_TOP-.075&&overOak(oak,x,z,radius))return true;
  return [arch.x-.72,arch.x+.72].some(px=>Math.hypot(x-px,z-arch.z)<.14+radius);
}

// Ground and banks share the visual and gameplay channel profile.
export function drawCreekTerrain(c,quad){
  for(let z=c.z0;z<c.z1;z+=.25){
    const end=z+.25,[a,b]=creekBanks(c,z),[d,e]=creekBanks(c,end);
    const surface=(y,kind)=>quad([[a,y,z],[b,y,z],[e,y,end],[d,y,end]],[0,1,0],
      [[a,z],[b,z],[e,end],[d,end]],kind);
    surface(CREEK_BED,1);
    surface(CREEK_WATER,8);
    quad([[a,0,z],[d,0,end],[d,CREEK_BED,end],[a,CREEK_BED,z]],[1,0,0],[[z,0],[end,0],[end,.23],[z,.23]],1);
    quad([[b,0,z],[e,0,end],[e,CREEK_BED,end],[b,CREEK_BED,z]],[-1,0,0],[[z,0],[end,0],[end,.23],[z,.23]],1);
  }
  for(const [z,normal] of [[c.z0,1],[c.z1,-1]]){
    const [a,b]=creekBanks(c,z);
    quad([[a,0,z],[b,0,z],[b,CREEK_BED,z],[a,CREEK_BED,z]],[0,0,normal],[[a,0],[b,0],[b,.26],[a,.26]],1);
  }
}
export function drawForestGround(c,x,z,quad){
  if(!inside(c,x,z))return false;
  for(let y=z;y<z+1;y+=.25){
    const end=y+.25,[a,b]=creekBanks(c,y),[d,e]=creekBanks(c,end);
    const cap=n=>Math.max(x,Math.min(x+1,n));
    for(const [l,r,ll,rr] of [[x,cap(a),x,cap(d)],[cap(b),x+1,cap(e),x+1]]){
      if(r<=l&&rr<=ll)continue;
      quad([[l,0,y],[r,0,y],[rr,0,end],[ll,0,end]],[0,1,0],
        [[l/2,y/2],[r/2,y/2],[rr/2,end/2],[ll/2,end/2]],1);
    }
  }
  return true;
}

export function drawForestRoutes(routes,I,{slab,seg,ball,emit,mesh6,rZ}){
  const {creek:c,oak,arch}=routes;
  const bark=[.36,.23,.13,6],dark=[.18,.10,.054,6],end=[.50,.32,.15,6],moss=[.19,.32,.11,9];
  const slate=[.22,.26,.23,9],light=[.32,.36,.29,9],rope=[.49,.35,.19,6];
  const box=(f,p,s,color,turn)=>slab(f,p,s,color,turn);
  const rock=(f,p,s,color=slate)=>emit(mesh6('octa'),f,p,s,color);
  const bridge=I(c.mid,c.bridge);
  for(let i=-6;i<=6;i++){
    const x=i*.215;
    box(bridge,[x,.007,0],[.205,.091,.98],i%3?bark:end,rZ((i%3-1)*.025));
    for(const side of [-1,1])box(bridge,[x,.057,side*.38],[.029,.013,.032],dark);
  }
  for(const side of [-1,1]){
    const z=side*.43;
    seg(bridge,[-1.43,-.052,z],[1.43,-.05,z],.06,.048,dark);
    for(const x of [-1.30,-.45,.48,1.29]){
      seg(bridge,[x,-.13,z],[x,.46,z],.043,.028,bark);
      for(const y of [.36,.40,.43])box(bridge,[x,y,z],[.086,.024,.085],rope);
    }
    seg(bridge,[-1.31,.45,z],[0,.37,z],.013,.013,rope);
    seg(bridge,[0,.37,z],[1.29,.45,z],.013,.013,rope);
  }
  for(const p of c.stones){
    const f=I(p.x,p.z);
    ball(f,[0,(CREEK_BED+p.y)*.5,0],[p.rx,.16,p.rz],slate,true);
    ball(f,[0,p.y-.039,0],[p.rx*.91,.045,p.rz*.89],light,true);
    ball(f,[p.rx*.52,p.y-.035,.08],[p.rx*.28,.026,p.rz*.46],moss,true);
  }
  for(const z of [c.z0+.10,c.z1-.10]){
    for(let i=-2;i<=2;i++){
      const f=I(creekCenter(c,z)+i*.28,z+Math.sin(i*2.4)*.10,i*.73);
      ball(f,[0,-.065,0],[.22,.14+.025*(i*i%3),.19],i%2?moss:slate,true);
    }
  }
  // Roots and fern cover soften the exposed banks at regular intervals.
  for(let z=c.z0+.26,k=0;z<c.z1;z+=.53,k++){
    const banks=creekBanks(c,z);
    for(let side=0;side<2;side++){
      const f=I(banks[side]+(side?.075:-.075),z,k*2.58);
      rock(f,[0,-.038,0],[.13+.03*(k%3),.12,.16],k%3===0?moss:slate);
      if(k%3===0)for(const dir of [-1,1]){
        seg(f,[0,-.01,0],[dir*.12,.32+dir*.04,.055],.022,.005,moss);
        for(let l=1;l<4;l++){
          const y=l*.069,x=dir*l*.025;
          ball(f,[x+dir*.03,y,.036],[.078,.014,.032],moss,true);
        }
      }
    }
  }
  // The split stump, exposed rings and long broken trunk form the first landmark.
  const f=I(oak.x,oak.z);
  seg(f,[0,.225,-1.26],[0,.227,1.32],.29,.23,bark);
  seg(f,[0,.227,1.31],[0,.227,1.338],.225,.221,end);
  seg(f,[0,.231,1.338],[0,.231,1.343],.16,.153,dark);
  seg(f,[.02,.227,1.343],[.02,.227,1.35],.11,.101,end);
  for(const side of [-1,1]){
    seg(f,[0,.41,-.60],[side*.53,.59,-.15],.104,.036,bark);
    seg(f,[side*.51,.58,-.16],[side*.67,.83,.10],.039,.012,end);
    for(let i=0;i<4;i++){
      const a=.25+i*.51,dx=side*Math.sin(a),dy=Math.cos(a);
      seg(f,[dx*.293,.225+dy*.293,-1.23],[dx*.252,.227+dy*.252,.18],.013,.019,i%2?dark:end);
      seg(f,[dx*.252,.227+dy*.252,.18],[dx*.230,.227+dy*.230,1.29],.019,.008,i%2?dark:end);
    }
    for(let i=0;i<4;i++)ball(f,[side*.14,.475-i*.011,-.81+i*.37],[.13,.043,.29],moss,true);
  }
  // The low ruins hold a ragged stone arch, open through its center.
  const ruin=I(arch.x,arch.z);
  for(const sign of [-1,1]){
    for(let i=0;i<4;i++){
      const offset=sign*(.72-.07*Math.max(0,i-1));
      box(ruin,[offset,.16+i*.28,0],[.36,.296,.49],i%2?light:slate,rZ(sign*(i%2?.055:-.025)));
    }
    for(let i=0;i<5;i++){
      const a=.13+i*.27,x=sign*.58*Math.cos(a),y=1.03+.60*Math.sin(a);
      box(ruin,[x,y,0],[.225,.32,.45],i%2?light:slate,rZ(sign*a));
      if(i%2===0)ball(ruin,[x+sign*.12,y+.105,.17],[.125,.045,.14],moss,true);
    }
    const x=sign*.72;
    ball(ruin,[x+sign*.19,.07,.18],[.22,.11,.26],moss,true);
    seg(ruin,[sign*.34,1.65,.245],[sign*.53,1.27,.251],.021,.016,moss);
    seg(ruin,[sign*.53,1.27,.251],[sign*.63,.97,.253],.016,.007,moss);
    for(let i=0;i<4;i++)ball(ruin,[sign*(.44+i*.054+(i%2)*.065),1.48-i*.12,.269],[.079,.034,.022],moss,true);
  }
  box(ruin,[0,1.65,0],[.30,.29,.5],light);
  for(const root of routes.roots){
    const yaw=Math.atan2(root.dz,root.dx),r=I(root.x,root.z,yaw);
    // The root shoulders anchor the arch outside the player-width opening.
    seg(r,[.12,.29,-.65],[.36,1.69,-.68],.33,.23,bark);
    seg(r,[.36,1.65,-.68],[.45,2.65,-.78],.24,.13,dark);
    for(const side of [-1,1]){
      seg(r,[-.46,.16,side*.50],[.18,.71,side*.47],.23,.16,bark);
      seg(r,[.18,.71,side*.47],[.32,.92,side*.21],.16,.11,bark);
      seg(r,[-.20,.05,side*.50],[-.84,.04,side*.38],.10,.016,dark);
      seg(r,[.35,.24,side*.50],[.93,.045,side*.42],.125,.018,bark);
      ball(r,[.02,.92,side*.31],[.29,.075,.15],moss,true);
      seg(r,[-.60,.025,side*.40],[-.94,.014,side*.22],.055,.012,bark);
    }
    seg(r,[-.28,.82,-.47],[-.21,.95,-.12],.127,.145,bark);
    seg(r,[-.21,.95,-.12],[-.14,.89,.28],.145,.123,bark);
    seg(r,[-.14,.89,.28],[.17,.71,.51],.123,.10,bark);
    seg(r,[.28,.99,-.46],[.14,1.00,-.02],.165,.129,dark);
    seg(r,[.14,1.00,-.02],[.42,.84,.48],.129,.103,bark);
    for(let i=0;i<5;i++)ball(r,[-.13+i*.108,1.065+(i%2)*.035,-.35+i*.174],[.15,.06,.15],moss,true);
  }
}
