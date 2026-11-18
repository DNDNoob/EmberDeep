// node tools/npc_hand_view.mjs OUT.png yaw elev dist tx ty tz [lod]  -- the Keeper's staff hand in HAND coordinates (wrist at the origin, fingers +X, back of the hand +Y) with the staff rod drawn as a cylinder, flat-shaded by a software rasteriser (~2 s, no browser).
// (copied from npc_view.mjs)
// node tools/npc_view.mjs OUT.png yaw elev dist tx ty tz [parts,comma]  -- quick software rasteriser (no browser, ~1 s) for baked parts of KEEPER, flat colours per part.
// Parts are drawn in their own frame (U for robe/sleeves/sash/cuffs, H for head/ears/neck), hands at their anchors. yaw 0 = camera at +x (front), 90 = +z. Env: W, H, FOV (deg).
// Needs ImageMagick `convert` for the PNG. Example (ear): FOV=12 node tools/npc_view.mjs ear.png 50 8 0.5 0.012 0.075 0.085 head,ears
import * as R from '../src/npc_recipes.js';
import {bakePart} from '../src/npc_kit.js';
import {writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
const [out,yaw,elev,dist,tx,ty,tz,lodArg]=process.argv.slice(2);
const GR=+(process.env.GR||0.0105);const SPEC=R.KEEPER.build.call({...R.KEEPER,gripR:GR}).parts.gripHand,GB=bakePart(SPEC,R.KEEPER.seed+15);
const W=+(process.env.W||900),H=+(process.env.H||700),zb=new Float32Array(W*H).fill(1e9),img=new Uint8Array(W*H*3);
for(let i=0;i<W*H;i++){img[i*3]=28;img[i*3+1]=30;img[i*3+2]=36}
const mv=(m,x,y,z)=>[m[0]*x+m[1]*y+m[2]*z,m[3]*x+m[4]*y+m[5]*z,m[6]*x+m[7]*y+m[8]*z];
const ya=+yaw*Math.PI/180,el=+elev*Math.PI/180,D=+dist,tgt=[+tx,+ty,+tz];
const eye=[tgt[0]+D*Math.cos(el)*Math.cos(ya),tgt[1]+D*Math.sin(el),tgt[2]+D*Math.cos(el)*Math.sin(ya)];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],nz=a=>{const l=Math.hypot(...a);return a.map(v=>v/l)};
const f=nz(sub(tgt,eye)),r=nz(cr(f,[0,1,0])),u=cr(r,f),fov=Math.tan(+(process.env.FOV||25)*Math.PI/180);
const proj=p=>{const d=sub(p,eye),z=dot(d,f);return [W/2+(dot(d,r)/z/fov)*H/2,H/2-(dot(d,u)/z/fov)*H/2,z]};
const COL={torso:[200,60,50],sleeve0:[230,110,60],sleeve1:[210,90,110],sash:[230,190,60],cuff0:[240,200,70],cuff1:[240,200,70],gripHand:[225,170,135],restHand:[225,170,135],neck:[225,170,135],skirt:[170,50,45],hem:[230,190,60],stole:[40,140,110],brooch:[240,200,80],pouch:[150,90,45],keys:[200,170,80]};
const L1=nz([0.5,0.8,0.6]),L2=nz([-0.5,0.1,-0.6]);
function draw(m,off,Mx,col){const n=m.length/9;
  const Pw=[],Nw=[];for(let i=0;i<n;i++){const p=mv(Mx,m[i*9],m[i*9+1],m[i*9+2]);Pw.push([p[0]+off[0],p[1]+off[1],p[2]+off[2]]);Nw.push(mv(Mx,m[i*9+3],m[i*9+4],m[i*9+5]))}
  const ev=nz(sub(eye,tgt));
  const cut=process.env.CUT?process.env.CUT.split(',').map(Number):null;
  for(let t=0;t<n;t+=3){if(cut&&col[0]===225){const c=(Pw[t][cut[0]]+Pw[t+1][cut[0]]+Pw[t+2][cut[0]])/3;if(c>cut[1])continue}
    const v=[t,t+1,t+2].map(i=>{const nn=Nw[i];return {p:proj(Pw[i]),l:Math.max(0,dot(nn,ev))*0.3+Math.max(0,dot(nn,L1))*0.55+Math.max(0,dot(nn,L2))*0.2+0.25}});
    const [a,b,c]=v;if(a.p[2]<=0.01||b.p[2]<=0.01||c.p[2]<=0.01)continue;
    const mnx=Math.max(0,Math.floor(Math.min(a.p[0],b.p[0],c.p[0]))),mxx=Math.min(W-1,Math.ceil(Math.max(a.p[0],b.p[0],c.p[0]))),mny=Math.max(0,Math.floor(Math.min(a.p[1],b.p[1],c.p[1]))),mxy=Math.min(H-1,Math.ceil(Math.max(a.p[1],b.p[1],c.p[1])));
    const den=(b.p[1]-c.p[1])*(a.p[0]-c.p[0])+(c.p[0]-b.p[0])*(a.p[1]-c.p[1]);if(Math.abs(den)<1e-12)continue;
    for(let y=mny;y<=mxy;y++)for(let x=mnx;x<=mxx;x++){const l0=((b.p[1]-c.p[1])*(x-c.p[0])+(c.p[0]-b.p[0])*(y-c.p[1]))/den,l1=((c.p[1]-a.p[1])*(x-c.p[0])+(a.p[0]-c.p[0])*(y-c.p[1]))/den,l2=1-l0-l1;if(l0<0||l1<0||l2<0)continue;
      const z=l0*a.p[2]+l1*b.p[2]+l2*c.p[2];if(z>=zb[y*W+x])continue;zb[y*W+x]=z;const li=l0*a.l+l1*b.l+l2*c.l;for(let k=0;k<3;k++)img[(y*W+x)*3+k]=Math.min(255,col[k]*li)}}}

const I=[1,0,0,0,1,0,0,0,1],g=GB,lod=+(lodArg||0);
draw(g[lod],[0,0,0],I,[225,170,135]);
// the staff rod: a cylinder along the grip axis
const rr=GR,{p:gp,d:gd}=SPEC.grip;
{const cz=process.env.CUT?+process.env.CUT.split(',')[1]:null,T0=cz==null?0:(cz-gp[2])/gd[2];const seg=24,n=[],L=cz==null?0.1:0.0012,ax=gd,u=nz(cr(ax,[0,1,0])),v=cr(ax,u),tri=[];
 const pt=(a,t)=>[gp[0]+ax[0]*t+(u[0]*Math.cos(a)+v[0]*Math.sin(a))*rr,gp[1]+ax[1]*t+(u[1]*Math.cos(a)+v[1]*Math.sin(a))*rr,gp[2]+ax[2]*t+(u[2]*Math.cos(a)+v[2]*Math.sin(a))*rr];
 const nr=a=>[u[0]*Math.cos(a)+v[0]*Math.sin(a),u[1]*Math.cos(a)+v[1]*Math.sin(a),u[2]*Math.cos(a)+v[2]*Math.sin(a)];
 const m=[];for(let i=0;i<seg;i++){const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2;for(const [a,t] of [[a0,-L],[a1,-L],[a1,L],[a0,-L],[a1,L],[a0,L]]){m.push(...pt(a,t+T0),...nr(a),0,0,1)}}
 draw(new Float32Array(m),[0,0,0],I,[70,130,255]);}
writeFileSync((process.env.TMPDIR||'/tmp')+'/npc_hand.ppm',Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`),Buffer.from(img)]));
execSync(`convert ${(process.env.TMPDIR||'/tmp')}/npc_hand.ppm ${out}`);
