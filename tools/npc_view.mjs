// node tools/npc_view.mjs OUT.png yaw elev dist tx ty tz [parts,comma]  -- quick software rasteriser (no browser, ~1 s) for baked parts of KEEPER, flat colours per part.
// Parts are drawn in their own frame (U for robe/sleeves/sash/cuffs, H for head/ears/neck), hands at their anchors. yaw 0 = camera at +x (front), 90 = +z. Env: W, H, FOV (deg).
// Needs ImageMagick `convert` for the PNG. Example (ear): FOV=12 node tools/npc_view.mjs ear.png 50 8 0.5 0.012 0.075 0.085 head,ears
import * as R from '../src/npc_recipes.js';
import {bakeRecipe} from '../src/npc_kit.js';
import {writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
const [out,yaw,elev,dist,tx,ty,tz,pl]=process.argv.slice(2);
const K=bakeRecipe(R.KEEPER),P=K.parts,A=K.anchors;
const W=+(process.env.W||900),H=+(process.env.H||700),zb=new Float32Array(W*H).fill(1e9),img=new Uint8Array(W*H*3);
for(let i=0;i<W*H;i++){img[i*3]=28;img[i*3+1]=30;img[i*3+2]=36}
const mv=(m,x,y,z)=>[m[0]*x+m[1]*y+m[2]*z,m[3]*x+m[4]*y+m[5]*z,m[6]*x+m[7]*y+m[8]*z];
const ya=+yaw*Math.PI/180,el=+elev*Math.PI/180,D=+dist,tgt=[+tx,+ty,+tz];
const eye=[tgt[0]+D*Math.cos(el)*Math.cos(ya),tgt[1]+D*Math.sin(el),tgt[2]+D*Math.cos(el)*Math.sin(ya)];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],nz=a=>{const l=Math.hypot(...a);return a.map(v=>v/l)};
const f=nz(sub(tgt,eye)),r=nz(cr(f,[0,1,0])),u=cr(r,f),fov=Math.tan(+(process.env.FOV||25)*Math.PI/180);
const proj=p=>{const d=sub(p,eye),z=dot(d,f);return [W/2+(dot(d,r)/z/fov)*H/2,H/2-(dot(d,u)/z/fov)*H/2,z]};
const COL={torso:[200,60,50],sleeve0:[230,110,60],sleeve1:[210,90,110],sash:[230,190,60],cuff0:[240,200,70],cuff1:[240,200,70],gripHand:[225,170,135],restHand:[225,170,135],neck:[225,170,135],skirt:[170,50,45],hem:[230,190,60]};
const L1=nz([0.5,0.8,0.6]),L2=nz([-0.5,0.1,-0.6]);
function draw(m,off,Mx,col){const n=m.length/9;
  const Pw=[],Nw=[];for(let i=0;i<n;i++){const p=mv(Mx,m[i*9],m[i*9+1],m[i*9+2]);Pw.push([p[0]+off[0],p[1]+off[1],p[2]+off[2]]);Nw.push(mv(Mx,m[i*9+3],m[i*9+4],m[i*9+5]))}
  const ev=nz(sub(eye,tgt));
  for(let t=0;t<n;t+=3){const v=[t,t+1,t+2].map(i=>{const nn=Nw[i];return {p:proj(Pw[i]),l:Math.max(0,dot(nn,ev))*0.3+Math.max(0,dot(nn,L1))*0.55+Math.max(0,dot(nn,L2))*0.2+0.1}});
    const [a,b,c]=v;if(a.p[2]<=0.01||b.p[2]<=0.01||c.p[2]<=0.01)continue;
    const mnx=Math.max(0,Math.floor(Math.min(a.p[0],b.p[0],c.p[0]))),mxx=Math.min(W-1,Math.ceil(Math.max(a.p[0],b.p[0],c.p[0]))),mny=Math.max(0,Math.floor(Math.min(a.p[1],b.p[1],c.p[1]))),mxy=Math.min(H-1,Math.ceil(Math.max(a.p[1],b.p[1],c.p[1])));
    const den=(b.p[1]-c.p[1])*(a.p[0]-c.p[0])+(c.p[0]-b.p[0])*(a.p[1]-c.p[1]);if(Math.abs(den)<1e-12)continue;
    for(let y=mny;y<=mxy;y++)for(let x=mnx;x<=mxx;x++){const l0=((b.p[1]-c.p[1])*(x-c.p[0])+(c.p[0]-b.p[0])*(y-c.p[1]))/den,l1=((c.p[1]-a.p[1])*(x-c.p[0])+(a.p[0]-c.p[0])*(y-c.p[1]))/den,l2=1-l0-l1;if(l0<0||l1<0||l2<0)continue;
      const z=l0*a.p[2]+l1*b.p[2]+l2*c.p[2];if(z>=zb[y*W+x])continue;zb[y*W+x]=z;const li=l0*a.l+l1*b.l+l2*c.l;for(let k=0;k<3;k++)img[(y*W+x)*3+k]=Math.min(255,col[k]*li)}}}
const I=[1,0,0,0,1,0,0,0,1];
const want=(pl||'torso,sleeve0,sleeve1,sash,cuff0,cuff1,gripHand,restHand').split(',');
for(const nm of want){const m=P[nm]&&P[nm][0];if(!m)continue;
  if(nm==='gripHand')draw(m,A.gripAt,A.gripR,COL[nm]);else if(nm==='restHand')draw(m,A.restAt,A.restR,COL[nm]);else draw(m,[0,0,0],I,COL[nm]||[200,200,200]);}
writeFileSync((process.env.TMPDIR||'/tmp')+'/npc_view.ppm',Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`),Buffer.from(img)]));
execSync(`convert ${(process.env.TMPDIR||'/tmp')}/npc_view.ppm ${out}`);
