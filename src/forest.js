// The Dark Forest: walls of undergrowth, pines, bushes and brambles. Every mesh here is made from math at load (noise-displaced
// cones, tubes and blobs, instanced by type), and every position comes from a per-floor forest dice stream, never the main one.
import * as THREE from 'three';
export const INSET=0.12, CORE_H=1.6;
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const hs=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const rngOf=a=>function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const ih=(x,y,z,s)=>{let h=(x*374761393+y*668265263+z*1013904223+s*1274126177)|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296};
function vn3(x,y,z,s){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz);
  const L=(a,b,t)=>a+(b-a)*t,c=(i,j,k)=>ih(ix+i,iy+j,iz+k,s);
  return L(L(L(c(0,0,0),c(1,0,0),u),L(c(0,1,0),c(1,1,0),u),v),L(L(c(0,0,1),c(1,0,1),u),L(c(0,1,1),c(1,1,1),u),v),w)}
const lin=c=>[Math.pow(Math.max(c[0],0),2.2),Math.pow(Math.max(c[1],0),2.2),Math.pow(Math.max(c[2],0),2.2)];
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const mulc=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];

/* ---------- wall faces: the occluding core of every wall tile that borders open floor ---------- */
// A face is one wall tile's side toward an open tile, pushed INSET into the tile. e0/e1 say how far each end runs past (or stops short of) the tile edge so
// that neighbouring faces meet exactly at inside corners and outside corners, leaving no gap to see through.
export function coreFaces(F){
  const {W,H,g,pocketMask}=F,out=[];
  const op=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&g[y*W+x]!==1&&!pocketMask[y*W+x];
  for(let ty=0;ty<H;ty++)for(let tx=0;tx<W;tx++){
    if(g[ty*W+tx]!==1)continue;
    for(const [dx,dz] of DIRS){
      if(!op(tx+dx,ty+dz))continue;
      const ax=dz?1:0,az=dx?1:0;
      const e=s=>{const nx=tx+ax*s,ny=ty+az*s;return op(nx,ny)?-INSET:op(nx+dx,ny+dz)?0:INSET};
      out.push({tx,ty,dx,dz,e0:e(-1),e1:e(1)});
    }
  }
  return out;
}

/* ---------- geometry kit: flat-shaded triangle soup with a colour and a sway weight on every vertex ---------- */
class Geo{
  constructor(){this.p=[];this.n=[];this.c=[];this.w=[]}
  v(p,n,c,w){this.p.push(p[0],p[1],p[2]);this.n.push(n[0],n[1],n[2]);this.c.push(c[0],c[1],c[2]);this.w.push(w)}
  // a triangle; a,b,c = [x,y,z,r,g,b,sway]; flat normal unless nn is given (three smooth normals)
  tri(a,b,c,nn){
    let n;
    if(!nn){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];const l=Math.hypot(n[0],n[1],n[2])||1;n=[n[0]/l,n[1]/l,n[2]/l]}
    [a,b,c].forEach((q,i)=>this.v(q,nn?nn[i]:n,[q[3],q[4],q[5]],q[6]));
  }
  build(){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));g.setAttribute('aSw',new THREE.Float32BufferAttribute(this.w,1));
    g.computeBoundingSphere();return g;
  }
}
// sweep a ring along a polyline. pts [[x,y,z]], rad(i)->radius, col(i,j)->linear colour, sw(i)->sway weight, jit(p)->radius multiplier
function tube(g,pts,n,rad,col,sw,jit,smooth){
  const rings=[];let u=null;
  for(let i=0;i<pts.length;i++){
    const p=pts[i],q=pts[Math.min(i+1,pts.length-1)],o=pts[Math.max(i-1,0)];
    let tx=q[0]-o[0],ty=q[1]-o[1],tz=q[2]-o[2];const tl=Math.hypot(tx,ty,tz)||1;tx/=tl;ty/=tl;tz/=tl;
    if(!u)u=Math.abs(ty)<.9?[0,1,0]:[1,0,0];
    const d=u[0]*tx+u[1]*ty+u[2]*tz;let ux=u[0]-d*tx,uy=u[1]-d*ty,uz=u[2]-d*tz;const ul=Math.hypot(ux,uy,uz)||1;ux/=ul;uy/=ul;uz/=ul;u=[ux,uy,uz];
    const vx=ty*uz-tz*uy,vy=tz*ux-tx*uz,vz=tx*uy-ty*ux,ring=[];
    for(let j=0;j<n;j++){
      const a=j/n*Math.PI*2,c=Math.cos(a),s=Math.sin(a),nx=ux*c+vx*s,ny=uy*c+vy*s,nz=uz*c+vz*s;
      const r=rad(i)*(jit?jit([p[0]+nx,p[1]+ny,p[2]+nz],j):1),cc=col(i,j);
      ring.push([p[0]+nx*r,p[1]+ny*r,p[2]+nz*r,cc[0],cc[1],cc[2],sw(i),nx,ny,nz]);
    }
    rings.push(ring);
  }
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){
    const a=rings[i][j],b=rings[i][(j+1)%n],c=rings[i+1][(j+1)%n],d=rings[i+1][j];
    const N=q=>[q[7],q[8],q[9]];
    if(smooth){g.tri(a,b,c,[N(a),N(b),N(c)]);g.tri(a,c,d,[N(a),N(c),N(d)])}else{g.tri(a,b,c);g.tri(a,c,d)}
  }
  return rings;
}
function icosphere(sub){
  const t=(1+Math.sqrt(5))/2;let V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(v=>{const l=Math.hypot(...v);return v.map(x=>x/l)});
  let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let s=0;s<sub;s++){const cache=new Map(),mid=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;if(cache.has(k))return cache.get(k);
      const m=[(V[a][0]+V[b][0])/2,(V[a][1]+V[b][1])/2,(V[a][2]+V[b][2])/2],l=Math.hypot(...m);V.push(m.map(x=>x/l));cache.set(k,V.length-1);return V.length-1};
    const N=[];for(const f of F){const a=mid(f[0],f[1]),b=mid(f[1],f[2]),c=mid(f[2],f[0]);N.push([f[0],a,c],[f[1],b,a],[f[2],c,b],[a,b,c])}F=N}
  return {V,F};
}
const ICO={0:icosphere(0),1:icosphere(1)};

/* ---------- the pieces ---------- */
// tapering, gnarled trunk with a root flare; returns the centre line so branches can start on it
function trunk(g,R,H,r0,pal,o){
  const n=o.rad||6,lev=o.lev||[0,.07,.16,.28,.5,.75,1],rings=lev.length-1,lean=[(R()-.5)*.12,(R()-.5)*.12],pts=[],sd=(R()*1e3)|0;
  for(let i=0;i<=rings;i++){const t=lev[i];pts.push([lean[0]*t*t*H*.5+Math.sin(t*5+sd)*.012,H*t,lean[1]*t*t*H*.5+Math.cos(t*4+sd)*.012])}
  const bark=lin(pal.bark),bd=mulc(bark,.5);
  tube(g,pts,n,i=>{const t=lev[i];return r0*(Math.pow(1-t,o.taper||.85)*.92+.08)+.07*Math.exp(-t*9)*r0/.12},
    (i,j)=>{const k=.55+.9*vn3(j*1.7,i*.5,sd,3)+(j%2?.12:0);return mulc(mixc(bd,bark,Math.min(1,k)),1)},()=>0,
    p=>1+(vn3(p[0]*9,p[1]*5,p[2]*9,sd)-.5)*.35,true);
  return pts;
}
// a drooping, scalloped skirt of needles: apex fan plus a ring of long and short fingers hanging below the tier line
function skirt(g,R,cx,y,cz,rad,hgt,pal,o){
  const segs=o.segs||11,lit=lin(pal.lit),dk=lin(pal.dark),rim=[],mid=[];
  const a0=R()*6.28;
  for(let j=0;j<segs;j++){
    const a=a0+(j+(R()-.5)*.35)/segs*6.2832,long=j%2===0,f=(long?1:.55+R()*.15)*(.86+.3*R()),rr=rad*f;
    const droop=rr*(long?.42:.3)+.03;
    const tipc=mulc(lit,(long?1.1:.8)*(.75+.5*R())),mc=mixc(dk,lit,.3+.3*R());
    rim.push([cx+Math.cos(a)*rr,y-droop+(R()-.5)*.05,cz+Math.sin(a)*rr,tipc[0],tipc[1],tipc[2],o.sw*1]);
    const mr=rad*.5*(.85+.3*R());
    mid.push([cx+Math.cos(a)*mr,y+hgt*.4-(long?0:.03),cz+Math.sin(a)*mr,mc[0],mc[1],mc[2],o.sw*.4]);
  }
  const ap=[cx,y+hgt,cz,dk[0]*.7,dk[1]*.7,dk[2]*.7,0];
  for(let j=0;j<segs;j++){const k=(j+1)%segs;
    g.tri(ap,mid[j],mid[k]);g.tri(mid[j],rim[j],rim[k]);g.tri(mid[j],rim[k],mid[k]);
  }
}
function pineTree(seed,pal,o){
  const R=rngOf(seed),g=new Geo(),H=4,N=o.tiers||7,pts=trunk(g,R,H,.12,pal,{});
  const y0=1.2,at=y=>{let i=0;while(i<pts.length-2&&pts[i+1][1]<y)i++;const f=Math.min(1,Math.max(0,(y-pts[i][1])/(pts[i+1][1]-pts[i][1])));return [pts[i][0]+(pts[i+1][0]-pts[i][0])*f,pts[i][2]+(pts[i+1][2]-pts[i][2])*f]};
  for(let i=0;i<N;i++){
    const t=i/(N-1),y=y0+t*(H-y0-.55),rad=(.52*Math.pow(1-t,.8)+.09)*(.9+.2*R()),hgt=(.62*(1-t*.4)+.15)*(.9+.2*R());
    const c=at(y);skirt(g,R,c[0],y,c[1],rad,hgt,pal,{segs:t>.6?7:t>.3?8:9,sw:.6+t*.8});
  }
  const top=at(H);const lt=lin(pal.lit);
  g.tri([top[0]-.04,H-.5,top[1],lt[0],lt[1],lt[2],1],[top[0]+.04,H-.5,top[1],lt[0],lt[1],lt[2],1],[top[0],H+.12,top[1],lt[0]*.8,lt[1]*.8,lt[2]*.8,1.6]);
  return g.build();
}
function deadTree(seed,pal){
  const R=rngOf(seed),g=new Geo(),H=3.6,pts=trunk(g,R,H,.11,pal,{rad:5,lev:[0,.1,.25,.45,.7,1],taper:.7}),bark=lin(pal.bark);
  const nb=6;
  for(let b=0;b<nb;b++){
    const t=.28+.68*b/nb+R()*.06;let ix=0;while(ix<pts.length-2&&pts[ix+1][1]<H*t)ix++;const f=Math.min(1,Math.max(0,(H*t-pts[ix][1])/(pts[ix+1][1]-pts[ix][1])));
    const s=[pts[ix][0]+(pts[ix+1][0]-pts[ix][0])*f,H*t,pts[ix][2]+(pts[ix+1][2]-pts[ix][2])*f];
    const a=b*2.4+R()*.8,L=(.5+.9*(1-t))*(.7+.6*R()),up=.35+R()*.5,bp=[s];
    for(let k=1;k<=4;k++){const q=k/4;bp.push([s[0]+Math.cos(a)*L*q+(R()-.5)*.1,s[1]+L*up*q+(k>2?.08*q:0)-L*.2*q*q*(R()),s[2]+Math.sin(a)*L*q+(R()-.5)*.1])}
    tube(g,bp,3,i=>.034*(1-i/4)+.004,()=>mulc(bark,.8+.4*R()),i=>i/4,null,false);
    if(R()<.7){const m=bp[2],a2=a+(R()<.5?1:-1)*(.6+R()*.5),L2=L*.45;
      tube(g,[m,[m[0]+Math.cos(a2)*L2*.5,m[1]+L2*.3,m[2]+Math.sin(a2)*L2*.5],[m[0]+Math.cos(a2)*L2,m[1]+L2*.5,m[2]+Math.sin(a2)*L2]],3,i=>.016*(1-i/2)+.003,()=>mulc(bark,.9),i=>.6+i*.4,null,false)}
  }
  return g.build();
}
// lumpy cluster of leaf blobs; blobs are displaced icospheres, flat shaded, lighter toward the top and the tips
function bushGeo(seed,pal,o){
  const R=rngOf(seed),g=new Geo(),nb=o.blobs||5,base=lin(pal.leaf),sd=(R()*1e3)|0;
  for(let b=0;b<nb;b++){
    const ang=R()*6.28,d=b?.1+R()*.14:0,cx=Math.cos(ang)*d,cz=Math.sin(ang)*d,rr=(b?.13+R()*.09:.2)*(o.size||1),cy=rr*.6+(b?R()*.18:.08)*(o.size||1);
    const sub=ICO[o.sub??1],ry=.85+R()*.4,tint=mulc(base,.8+.5*R());
    const P=sub.V.map(v=>{const k=1+(vn3(v[0]*2.2+b*3,v[1]*2.2,v[2]*2.2+sd,5)-.5)*.75;return [cx+v[0]*rr*k*1.12,Math.max(.02,cy+v[1]*rr*k*ry),cz+v[2]*rr*k*1.12,v]});
    for(const f of sub.F){
      const j=.7+.6*R(),vv=f.map(i=>{const p=P[i],tt=Math.max(0,Math.min(1,p[1]/.55)),c=mulc(mixc(mulc(tint,.45),mulc(tint,1.25),tt),j);return [p[0],p[1],p[2],c[0],c[1],c[2],.2+tt*.8]});
      g.tri(vv[0],vv[1],vv[2]);
    }
  }
  const tn=o.tufts||10;
  for(let i=0;i<tn;i++){const a=R()*6.28,d=R()*.2,x=Math.cos(a)*d,z=Math.sin(a)*d,y=.25+R()*.18,L=.12+R()*.1,c=mulc(base,1.3+.5*R()),ta=R()*6.28;
    g.tri([x,y,z,c[0]*.5,c[1]*.5,c[2]*.5,.6],[x+Math.cos(ta)*.04,y,z+Math.sin(ta)*.04,c[0]*.5,c[1]*.5,c[2]*.5,.6],[x+Math.cos(a)*L*.7,y+L,z+Math.sin(a)*L*.7,c[0],c[1],c[2],1.4])}
  return g.build();
}
// a tangle of thorny canes: local +Z is out toward the corridor, X along the wall. Some arch up and over, some creep low across the base.
function brambleGeo(seed,pal,o){
  const R=rngOf(seed),g=new Geo(),cane=lin(pal.thorn),ns=o.stems||6,berry=lin([.12,.02,.09]),leaf=lin(mulc(pal.leaf,.9));
  for(let s=0;s<ns;s++){
    const low=s>=ns-1,x0=(R()-.5)*.36,z0=R()*.08,pts=[],seg=4;
    const H=low?.1+R()*.1:.55+R()*.75,ZL=low?.14+R()*.1:.12+R()*.3,wx=(R()-.5)*.5,ph=R()*6.28,span=low?(R()<.5?1:-1)*(.35+R()*.25):0;
    for(let i=0;i<=seg;i++){
      const t=i/seg;
      pts.push(low?[x0+span*t,H*(.5+.5*Math.sin(t*5+ph))*.8+.03,z0+ZL*Math.sin(t*3+ph)*.8]:
        [x0+wx*Math.pow(t,1.3)+Math.sin(t*5+ph)*.04,H*Math.sin(Math.min(1,t*1.15)*Math.PI*.58)*(1-.12*t),z0+ZL*Math.pow(t,1.6)+Math.sin(t*4+ph)*.03]);
    }
    const rings=tube(g,pts,3,i=>.014*(1-i/seg*.85)+.003,(i,j)=>mulc(cane,.45+.4*vn3(i*2.1,j,s,9)),i=>i/seg,null,true);
    for(let i=1;i<seg;i++)if((i+s)%2===0){
      const p=pts[i],a=R()*6.28,tl=.04+R()*.025,c=mulc(cane,1.4);
      g.tri([p[0]+Math.cos(a)*.012,p[1],p[2]+Math.sin(a)*.012,c[0]*.6,c[1]*.6,c[2]*.6,i/seg],[p[0]-Math.cos(a)*.012,p[1]+.012,p[2]-Math.sin(a)*.012,c[0]*.6,c[1]*.6,c[2]*.6,i/seg],[p[0]+Math.cos(a)*tl,p[1]+tl*.4,p[2]+Math.sin(a)*tl,c[0],c[1],c[2],i/seg+.2]);
    }
    const e=pts[seg];
    if(!low&&o.berries&&R()<.8)for(let k=0;k<2;k++){const bx=e[0]+(R()-.5)*.07,by=e[1]-.02-k*.04,bz=e[2]+(R()-.5)*.07,r=.013+R()*.006,c=mulc(berry,.8+.8*R());
      const q=(x,y,z)=>[bx+x*r,by+y*r,bz+z*r,c[0],c[1],c[2],1],A=q(1,-.6,0),B=q(-.5,-.6,.9),C=q(-.5,-.6,-.9),D=q(0,1.2,0);g.tri(A,B,D);g.tri(B,C,D);g.tri(C,A,D)}
    if(o.leaves)for(let i=2;i<=seg;i++)if(i%2===0){const p=pts[i],a=R()*6.28,L=.06+R()*.03,c=mulc(leaf,.7+.7*R());
      g.tri([p[0],p[1],p[2],c[0]*.5,c[1]*.5,c[2]*.5,i/seg],[p[0]+Math.cos(a)*L*.6,p[1]+.01,p[2]+Math.sin(a)*L*.6+.01,c[0],c[1],c[2],i/seg+.3],[p[0]+Math.cos(a+1)*L*.7,p[1]+.03,p[2]+Math.sin(a+1)*L*.7,c[0],c[1],c[2],i/seg+.3])}
  }
  return g.build();
}
function fernGeo(seed,pal,o){
  const R=rngOf(seed),g=new Geo(),lit=lin(mixc(pal.leaf,[.1,.3,.1],.5)),dk=mulc(lit,.35),nf=o.fronds||5;
  for(let f=0;f<nf;f++){
    const a=f/nf*6.283+R()*.4,L=.22+R()*.14,up=.3+R()*.3,pts=[],segs=5;
    for(let i=0;i<=segs;i++){const t=i/segs;pts.push([Math.cos(a)*L*t,.02+L*up*Math.sin(t*2.2)-L*.35*t*t*(1-up)+.04*t,Math.sin(a)*L*t])}
    const px=-Math.sin(a),pz=Math.cos(a);
    for(let i=0;i<segs;i++){
      const t0=i/segs,t1=(i+1)/segs,w0=Math.sin(Math.min(1,t0*1.1+.12)*Math.PI)*.06*(i%2?.7:1),w1=Math.sin(Math.min(1,t1*1.1+.12)*Math.PI)*.06*((i+1)%2?.7:1);
      const c0=mixc(dk,lit,t0),c1=mixc(dk,lit,t1),A=pts[i],B=pts[i+1];
      const V=(p,w,s,c,sw)=>[p[0]+px*w*s,p[1]-Math.abs(w)*.2,p[2]+pz*w*s,c[0],c[1],c[2],sw];
      g.tri(V(A,0,1,c0,t0),V(A,w0,1,c0,t0),V(B,0,1,c1,t1));g.tri(V(A,0,1,c0,t0),V(B,0,1,c1,t1),V(A,-w0,1,c0,t0));
      g.tri(V(A,w0,1,c0,t0),V(B,w1,1,c1,t1),V(B,0,1,c1,t1));g.tri(V(A,-w0,1,c0,t0),V(B,0,1,c1,t1),V(B,-w1,1,c1,t1));
    }
  }
  return g.build();
}
function shroomGeo(seed,pal){
  const R=rngOf(seed),g=new Geo(),stem=[.78,.78,.7],cap=[.82,.9,.88],n=3;
  for(let m=0;m<n;m++){
    const a=m*2.1+R(),d=m?.05+R()*.05:0,cx=Math.cos(a)*d,cz=Math.sin(a)*d,h=.05+R()*.06,cr=.03+R()*.02;
    const sp=[[cx,0,cz],[cx+.004,h*.5,cz],[cx+.008,h,cz]];
    tube(g,sp,5,i=>.007-i*.0012,()=>lin(stem),()=>.3,null,true);
    const segs=8,rings=[0,1,2].map(r=>{const ph=r/2*Math.PI*.5,rr=cr*Math.cos(ph)*(r===2?.12:1),yy=h+cr*.55*Math.sin(ph);return Array.from({length:segs},(_,j)=>{const t=j/segs*6.283;return [cx+.008+Math.cos(t)*rr,yy-(r===0?.012:0),cz+Math.sin(t)*rr]})});
    const cc=lin(mulc(cap,.85+.3*R()));
    for(let r=0;r<2;r++)for(let j=0;j<segs;j++){const k=(j+1)%segs,A=rings[r][j],B=rings[r][k],C=rings[r+1][k],D=rings[r+1][j],q=p=>[p[0],p[1],p[2],cc[0],cc[1],cc[2],0];
      g.tri(q(A),q(B),q(C));g.tri(q(A),q(C),q(D))}
  }
  return g.build();
}
function logGeo(seed,pal,mossy){
  const R=rngOf(seed),g=new Geo(),L=.55,pts=[],sd=(R()*1e3)|0,bark=lin(pal.bark),moss=lin([.07,.2,.06]),cut=lin([.45,.36,.25]);
  for(let i=0;i<=5;i++){const t=i/5;pts.push([(t-.5)*2*L,.07+Math.sin(t*3+sd)*.012,Math.sin(t*2.4+sd)*.02])}
  const rings=tube(g,pts,7,i=>.085-i*.003+(i===0||i===5?-.008:0),(i,j)=>{const m=mossy?smoothS(vn3(i*.9,j*.7,sd,2),.45,.7):0;return mixc(mulc(bark,.6+.8*vn3(i,j*1.3,sd,4)),moss,m*.85)},()=>0,p=>1+(vn3(p[0]*10,p[1]*10,p[2]*10,sd)-.5)*.3,true);
  for(const [ri,sgn] of [[0,-1],[5,1]]){const r=rings[ri],c=pts[ri];for(let j=0;j<7;j++){const k=(j+1)%7;g.tri([c[0]+sgn*.004,c[1],c[2],cut[0],cut[1],cut[2],0],[r[j][0],r[j][1],r[j][2],cut[0]*.7,cut[1]*.7,cut[2]*.7,0],[r[k][0],r[k][1],r[k][2],cut[0]*.7,cut[1]*.7,cut[2]*.7,0])}}
  return g.build();
}
const smoothS=(x,a,b)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
// broken stump: jagged top, pale cut face, root flare
function stumpGeo(seed,pal){
  const R=rngOf(seed),g=new Geo(),n=11,h=.78,bark=lin(pal.bark),cut=lin([.4,.33,.24]),sd=(R()*1e3)|0,rings=[];
  for(let i=0;i<=4;i++){const t=i/4,ring=[];for(let j=0;j<n;j++){const a=j/n*6.283,jag=i===4?(vn3(Math.cos(a)*2,sd,Math.sin(a)*2,1)-.3)*.36:0,flare=.1*Math.exp(-t*5),r=.25*(1-.06*t)+flare,k=1+(vn3(Math.cos(a)*3,t*2,Math.sin(a)*3,sd)-.5)*.3;
    const c=mulc(bark,(.55+.9*vn3(j*.9,t*3,sd,6))*(i<1?.8:1));ring.push([Math.cos(a)*r*k,h*t+jag*h*.5,Math.sin(a)*r*k,c[0],c[1],c[2],0])}rings.push(ring)}
  for(let i=0;i<4;i++)for(let j=0;j<n;j++){const k=(j+1)%n;g.tri(rings[i][j],rings[i][k],rings[i+1][k]);g.tri(rings[i][j],rings[i+1][k],rings[i+1][j])}
  const top=rings[4],cy=h+.01;for(let j=0;j<n;j++){const k=(j+1)%n,c=mulc(cut,.85+.3*vn3(j,0,sd,8));g.tri([0,cy-.03,0,c[0],c[1],c[2],0],[top[j][0],top[j][1],top[j][2],c[0]*.7,c[1]*.7,c[2]*.7,0],[top[k][0],top[k][1],top[k][2],c[0]*.7,c[1]*.7,c[2]*.7,0])}
  return g.build();
}

/* ---------- placement: pure functions of the floor grid and the forest dice ---------- */
export function place(F){
  const {W,H,g,pocketMask,safeMask}=F,fo=F.variant.fo,base=hs(F.fo.seed+'#forest#'+F.fo.depth);
  const tr=(k,s)=>rngOf((base^Math.imul(k+1,2654435761)^s)>>>0);
  const faces=coreFaces(F),tiles=new Map();
  for(const c of faces){const k=c.ty*W+c.tx;let a=tiles.get(k);if(!a)tiles.set(k,a=[]);a.push(c)}
  // keep-out spots for the loose bits of undergrowth: lanterns, doors, the gate, props, the way out
  const ko=[];
  for(const q of F.sconces)ko.push([q.x,q.z,.5]);
  for(const D of F.sdoors)ko.push([D.x,D.z,.6]);
  for(const D of [F.door,...F.frames])if(D)ko.push([D.tx+.5,D.ty+.5,.8]);
  for(const q of F.props)ko.push([q.x,q.z,.28]);
  for(const q of F.pockets)ko.push([q.x,q.z,.9]);
  ko.push([F.exit.x,F.exit.z,.5],[F.start.tx+.5,F.start.ty+.5,.55]);
  const free=(x,z,r)=>{for(const k of ko)if(Math.hypot(k[0]-x,k[1]-z)<k[2]+(r||0))return false;return true};
  const out={trees:[],bushes:[],brambles:[],ferns:[],shrooms:[],logs:[],flies:[],stumps:[]};
  for(const [k,fs] of tiles){
    const tx=k%W,ty=(k/W)|0,r=tr(k,1),cx=tx+.5,cz=ty+.5,n=fs.length;
    // trees: mostly one to a tile, a taller and thicker sentinel at corners and dead ends
    if(r()<Math.min(.95,.44*fo.tree*(n>1?1.25:1))){
      const sent=n>1&&r()<.3,f=fs[(r()*n)|0],u=.02+r()*.12,a=(r()-.5)*.6;
      let x=cx+f.dx*(.5-u)+(f.dz?a:0),z=cz+f.dz*(.5-u)+(f.dx?a:0);
      if(n>1){const f2=fs[(fs.indexOf(f)+1)%n];x+=f2.dx*(.5-(.02+r()*.12))*.9;z+=f2.dz*(.5-(.02+r()*.12))*.9;x=cx+Math.max(-.3,Math.min(.3,x-cx));z=cz+Math.max(-.3,Math.min(.3,z-cz))}
      if(sent){x=cx+(x-cx)*.5;z=cz+(z-cz)*.5}
      const dead=r()<fo.dead;
      out.trees.push({x,z,y:0,rot:r()*6.283,sx:sent?1.45+r()*.3:.75+r()*.4,sy:sent?1.25+r()*.2:.7+r()*.4,v:(r()*3)|0,dead,sent,tint:.8+r()*.4,s:0});
      if(out.trees[out.trees.length-1].sx>0&&!sent)out.trees[out.trees.length-1].sx=out.trees[out.trees.length-1].sy*(.9+r()*.2);
    }
    for(const f of fs){
      const rf=tr(k,10+f.dx*3+f.dz*5+7),nb=Math.floor(1.05*fo.bush+rf()),nbr=rf()<Math.min(.9,.34*fo.bram)?1:0;
      for(let i=0;i<nb;i++){
        const a=((i+.5)/nb-.5)*.9+(rf()-.5)*.2,u=-.04+rf()*.12,x=cx+f.dx*(.5-u)+(f.dz?a:0),z=cz+f.dz*(.5-u)+(f.dx?a:0),s=.95+rf()*.45;
        if(!free(x,z,.12))continue;
        out.bushes.push({x,z,y:0,rot:rf()*6.283,sx:s,sy:s*(.75+rf()*.45),v:(rf()*3)|0,tint:.75+rf()*.5});
      }
      for(let i=0;i<nbr;i++){const a=(rf()-.5)*.5,u=-.02+rf()*.07,x=cx+f.dx*(.5-u)+(f.dz?a:0),z=cz+f.dz*(.5-u)+(f.dx?a:0);
        if(free(x,z,.2))out.brambles.push({x,z,y:0,rot:Math.atan2(f.dx,f.dz),sx:.9+rf()*.35,sy:.8+rf()*.5,v:(rf()*3)|0,tint:.8+rf()*.4})}
    }
  }
  // thick trunks and stumps stand where the chamber pillars were
  for(const q of F.pillars){const r=tr(((q[1]|0)*W+(q[0]|0)),3);
    if(r()<.5)out.stumps.push({x:q[0],z:q[1],y:0,rot:r()*6.283,sx:1,sy:.8+r()*.5,tint:.8+r()*.4});
    else out.trees.push({x:q[0],z:q[1],y:0,rot:r()*6.283,sx:1.95,sy:1.15+r()*.25,v:(r()*3)|0,dead:r()<fo.dead,sent:true,tint:.8+r()*.4,pillar:true})}
  // ground cover on open tiles beside walls
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const k=y*W+x;if(g[k]!==0||pocketMask[k]||safeMask[k])continue;
    const ws=DIRS.filter(d=>g[(y+d[1])*W+x+d[0]]===1);if(!ws.length)continue;
    const r=tr(k,2),cx=x+.5,cz=y+.5,spot=(u)=>{const d=ws[(r()*ws.length)|0],a=(r()-.5)*.8;return [cx+d[0]*(.5-u)+(d[1]?a:0),cz+d[1]*(.5-u)+(d[0]?a:0),d]};
    if(r()<.3*fo.fern){const p=spot(.12+r()*.2);if(free(p[0],p[1],.15))out.ferns.push({x:p[0],z:p[1],y:0,rot:r()*6.283,sx:.8+r()*.6,sy:.8+r()*.5,tint:.7+r()*.6})}
    if(r()<.07*fo.shroom){const p=spot(.1+r()*.3);if(free(p[0],p[1],.1))out.shrooms.push({x:p[0],z:p[1],y:0,rot:r()*6.283,sx:.9+r()*.8,sy:.9+r()*.6,tint:1})}
    if(r()<.06){const d=ws[(r()*ws.length)|0],u=.14+r()*.14,px=cx+d[0]*(.5-u),pz=cz+d[1]*(.5-u);
      if(free(px,pz,.2))out.logs.push({x:px,z:pz,y:0,rot:d[0]?Math.PI/2+(r()-.5)*.5:(r()-.5)*.5,sx:.7+r()*.8,sy:.8+r()*.5,v:(r()*2)|0,tint:.7+r()*.6})}
    if(fo.fly&&r()<.1)out.flies.push({x:cx+(r()-.5)*.7,y:.25+r()*.55,z:cz+(r()-.5)*.7,ph:r()*6.28,sp:.4+r()*.5});
  }
  // keep the whole forest under the triangle budget: thin the loose undergrowth first, then the trees, evenly so nothing goes bare in one place
  const cap=(l,n)=>{if(l.length<=n)return l;const o=[];for(let i=0;i<n;i++)o.push(l[Math.floor(i*l.length/n)]);return o};
  const T={trees:230,bushes:66,brambles:150,ferns:84},est=()=>out.trees.length*T.trees+out.bushes.length*T.bushes+out.brambles.length*T.brambles+out.ferns.length*T.ferns+out.logs.length*85+out.shrooms.length*150;
  for(const [k,lo] of [['bushes',.35],['brambles',.3],['ferns',.3],['trees',.6]]){
    const over=est()-BUDGET;if(over<=0)break;
    const cur=out[k].length,cut=Math.min(cur-Math.floor(cur*lo),Math.ceil(over/T[k]));out[k]=cap(out[k],cur-cut);
  }
  return out;
}
const BUDGET=235000;

/* ---------- building the scene objects ---------- */
export function createForest({UT,Q,shadows}){
  const mats=[],patch=sh=>{
    sh.uniforms.uTime=UT;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float aSw;uniform float uTime;varying vec3 vOP;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvOP=position;\n#ifdef USE_INSTANCING\n{float ph=instanceMatrix[3].x*1.7+instanceMatrix[3].z*2.3;float k=aSw*(sin(uTime*1.3+ph)*.7+sin(uTime*3.1+ph*1.7)*.3)*.016;transformed.x+=k;transformed.z+=k*.6;}\n#endif');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vOP;')
      .replace('#include <color_fragment>','#include <color_fragment>\n{float fd=clamp(1.6-length(vViewPosition)*.5,0.,1.);vec3 q=floor(vOP*160.);float nn=fract(sin(dot(q,vec3(12.9898,78.233,37.719)))*43758.5453);diffuseColor.rgb*=1.+(nn-.5)*.3*fd;}');
  };
  const mk=(o)=>{const m=Q===0?new THREE.MeshLambertMaterial({vertexColors:true,side:o.side,emissive:o.emissive||0x000000}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:o.rough||.85,metalness:0,side:o.side,emissive:o.emissive||0x000000,emissiveIntensity:o.ei||1});
    m.onBeforeCompile=patch;m.customProgramCacheKey=()=>'forest';mats.push(m);return m};
  const matA=mk({side:THREE.DoubleSide}),matT=mk({side:THREE.FrontSide,rough:.95});
  const dummy=new THREE.Object3D(),col=new THREE.Color();
  function inst(geo,list,mat,cast,tintK,name){
    if(!list.length)return null;
    const im=new THREE.InstancedMesh(geo,mat,list.length);im.name=name||'';
    list.forEach((q,i)=>{dummy.position.set(q.x,q.y||0,q.z);dummy.rotation.set(0,q.rot,0);dummy.scale.set(q.sx,q.sy,q.sx);dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix);
      const t=(q.tint||1)*(tintK||1);col.setRGB(t,t*(.94+(i*37%11)/90),t);im.setColorAt(i,col)});
    im.instanceMatrix.needsUpdate=true;im.frustumCulled=false;im.castShadow=!!cast;im.receiveShadow=false;im.matrixAutoUpdate=false;im.userData.tris=list.length*geo.attributes.position.count/3;
    return im;
  }
  function build(F){
    const fo=F.variant.fo,P=place(F),grp=new THREE.Group(),geos=[],seed=F.variant.seed*100|0;
    const thin=a=>Q===0?a.filter((_,i)=>i%2===0):a;
    const G=(f)=>{const g=f();geos.push(g);return g};
    const pal=fo,add=m=>{if(m)grp.add(m)};
    const dead=P.trees.filter(t=>t.dead),live=P.trees.filter(t=>!t.dead);
    const tierN=fo.dead>.5?5:7;
    for(let v=0;v<3;v++){
      const L=thin(live.filter(t=>t.v===v));
      if(L.length)add(inst(G(()=>pineTree(seed+v*977,pal,{tiers:tierN})),L,matA,false,1,'pine'));
      const D=thin(dead.filter(t=>t.v===v));
      if(D.length)add(inst(G(()=>deadTree(seed+v*1301,pal)),D,matA,shadows,1,'dead'));
    }
    const bushV=[0,1,2].map(v=>G(()=>bushGeo(seed+v*53,pal,{blobs:3,sub:0,tufts:6})));
    for(let v=0;v<3;v++)add(inst(bushV[v],thin(P.bushes.filter(b=>b.v===v)),matA,false,1,'bush'));
    for(let v=0;v<3;v++){const L=thin(P.brambles.filter(b=>b.v===v));if(L.length)add(inst(G(()=>brambleGeo(seed+v*211,pal,{stems:5,berries:true,leaves:fo.bram>1.5})),L,matA,false,1,'bramble'))}
    if(P.ferns.length)add(inst(G(()=>fernGeo(seed+5,pal,{})),thin(P.ferns),matA,false,1,'fern'));
    if(P.stumps.length)add(inst(G(()=>stumpGeo(seed+9,pal)),P.stumps,matT,shadows,1,'stump'));
    for(let v=0;v<2;v++){const L=thin(P.logs.filter(b=>b.v===v));if(L.length)add(inst(G(()=>logGeo(seed+v*7,pal,fo.glow>.5)),L,matT,shadows,1,'log'))}
    if(P.shrooms.length&&fo.glow>0){const m=mk({side:THREE.DoubleSide,emissive:0x77ddc8,ei:.02+fo.glow*.12});add(inst(G(()=>shroomGeo(seed+3,pal)),P.shrooms,m,false,1,'shroom'))}
    F.fo.n=P;
    let tris=0,calls=0;const by={};for(const c of grp.children){tris+=c.userData.tris;calls++;by[c.name]=(by[c.name]||0)+c.userData.tris}
    grp.userData.geos=geos;grp.userData.stats={tris,calls,trees:P.trees.length,bushes:P.bushes.length,brambles:P.brambles.length,ferns:P.ferns.length,logs:P.logs.length,shrooms:P.shrooms.length,stumps:P.stumps.length,by};
    return grp;
  }
  function dispose(grp){if(!grp)return;for(const c of grp.children){c.dispose();}for(const g of grp.userData.geos||[])g.dispose();if(grp.parent)grp.parent.remove(grp)}
  return {build,dispose,place,faces:coreFaces};
}
