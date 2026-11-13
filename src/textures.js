// Procedural PBR surfaces, generated on the GPU when a floor first needs them.
// Every surface is described as a height field plus colour, roughness and glow; normals and parallax depth come from the real height.
import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

const LIB = `
precision highp float;
varying vec2 vUv;
#define PI 3.14159265
float hash1(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash2(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
// tileable value noise: p in cells, per = cells per tile
float vn(vec2 p,vec2 per){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  float a=hash1(mod(i,per)+SEED),b=hash1(mod(i+vec2(1.,0.),per)+SEED),c=hash1(mod(i+vec2(0.,1.),per)+SEED),d=hash1(mod(i+vec2(1.,1.),per)+SEED);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 uv,float f){float s=0.,a=.5;for(int i=0;i<6;i++){s+=a*vn(uv*f,vec2(f));f*=2.;a*=.5;}return s/.984;}
float fbm3(vec2 uv,float f){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*vn(uv*f,vec2(f));f*=2.;a*=.5;}return s/.875;}
float ridge(vec2 uv,float f){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*(1.-abs(2.*vn(uv*f,vec2(f))-1.));f*=2.;a*=.5;}return s/.969;}
// stretched noise for grain and streaks: fx,fy cells per tile
float vn2(vec2 uv,float fx,float fy){return vn(uv*vec2(fx,fy),vec2(fx,fy));}
// tileable voronoi: x = distance to nearest point, y = distance to the cell border, zw = cell id
vec4 voro(vec2 uv,float n,float jit){vec2 p=uv*n,i=floor(p),f=fract(p);float d1=9.;vec2 id=vec2(0.),mr=vec2(0.);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 c=mod(i+g,n);vec2 r=g+(hash2(c+SEED)-.5)*jit+.5-f;float d=dot(r,r);if(d<d1){d1=d;id=c;mr=r;}}
  float bd=9.;
  for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 g=vec2(float(x),float(y));vec2 c=mod(i+g,n);vec2 r=g+(hash2(c+SEED)-.5)*jit+.5-f;
    if(dot(mr-r,mr-r)>1e-5)bd=min(bd,dot(.5*(mr+r),normalize(r-mr)));}
  return vec4(sqrt(d1),bd,id);}
// running-bond blocks: n = blocks across and down, stag = row offset. q = position inside the block (-.5..5), d = distance to its edge in tile units
void blocks(vec2 uv,vec2 n,float stag,out vec2 q,out vec2 id,out float d){
  float row=floor(uv.y*n.y);float x=uv.x*n.x+mod(row,2.)*stag;
  id=vec2(mod(floor(x),n.x),row);q=vec2(fract(x)-.5,fract(uv.y*n.y)-.5);
  d=min((.5-abs(q.x))/n.x,(.5-abs(q.y))/n.y);}
float sat(float x){return clamp(x,0.,1.);}
vec3 tone(vec3 c,float k){return c*k;}
`;

// each surface: void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em)   (alb in display space)
const SURF = [
// 0 old stonework wall: weathered sandstone ashlar
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(2.,4.),.5,q,id,d);
  float chip=(fbm(uv,24.)-.4)*.02+vn(uv*96.,vec2(96.))*.004;
  float de=d-.005-chip*step(.35,hash1(id+7.))-chip*.4;
  float face=smoothstep(.0,.014,de);
  float r=hash1(id+3.),r2=hash1(id+11.);
  float tilt=(q.x*(r-.5)+q.y*(r2-.5))*.12;
  float pits=smoothstep(.66,.8,vn(uv*128.,vec2(128.)))*smoothstep(.55,.75,fbm3(uv,12.));
  float bed=vn2(uv,6.,90.)*.5+vn2(uv,12.,200.)*.5;
  float surfH=.84+r*.1+tilt+fbm(uv,16.)*.07-pits*.07-(bed-.5)*.03;
  float mort=.3+fbm(uv,96.)*.14;
  h=mix(mort,surfH,face);
  vec3 cA=vec3(.62,.54,.42),cB=vec3(.50,.43,.34),cC=vec3(.58,.47,.36);
  vec3 st=mix(mix(cA,cB,r),cC,step(.7,r2));
  st*=.78+.4*fbm(uv+r,8.);st*=1.-.04*(bed-.5)*2.;st*=1.-pits*.35;
  st=mix(st,st*vec3(.62,.6,.56),smoothstep(.5,.85,fbm(uv*vec2(1.,.5)+.3,6.))*smoothstep(.2,1.,vn2(uv,40.,3.)));
  vec3 mc=vec3(.36,.33,.29)*(.75+.5*vn(uv*160.,vec2(160.)));
  alb=mix(mc,st,face)*mix(.62,1.,smoothstep(-.004,.02,de));
  rough=mix(.97,.86-.1*r,face);em=0.;
}`,
// 1 stonework floor: worn flagstones
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(4.,4.),.5,q,id,d);
  float r=hash1(id+3.),r2=hash1(id+19.);
  float chip=(fbm(uv,32.)-.4)*.012;
  float de=d-.004-chip;
  float face=smoothstep(.0,.01,de);
  vec4 v=voro(uv+r,5.,.9);
  float crk=(1.-smoothstep(.0,.012,v.y))*step(.72,r2);
  float wear=fbm(uv,6.);
  float surfH=.88+r*.07+fbm(uv,24.)*.05-crk*.25-smoothstep(.55,.8,vn(uv*150.,vec2(150.)))*.04;
  h=mix(.32+fbm(uv,128.)*.12,surfH,face);
  vec3 st=mix(vec3(.47,.44,.4),vec3(.38,.36,.34),r)*(.78+.42*fbm(uv+r2,10.));
  st=mix(st,st*vec3(1.08,1.,.9),smoothstep(.4,.7,wear));
  st*=1.-crk*.6;
  vec3 dirt=vec3(.27,.24,.2)*(.8+.4*vn(uv*128.,vec2(128.)));
  alb=mix(dirt,st,face)*mix(.62,1.,smoothstep(-.003,.016,de));
  rough=mix(.98,mix(.62,.85,wear),face);em=0.;
}`,
// 2 stonework ceiling: rough hewn rock
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);vec4 v=voro(uv,4.,1.);
  h=.45+.3*a+.2*b-(1.-smoothstep(0.,.03,v.y))*.18;
  alb=mix(vec3(.36,.32,.28),vec3(.27,.25,.23),b)*(.7+.55*fbm(uv+.4,16.));
  alb*=mix(.6,1.,smoothstep(.3,.8,h));
  rough=.95;em=0.;
}`,
// 3 mossgrown wall: big rough blocks under moss
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(2.,2.),.5,q,id,d);
  float r=hash1(id+5.),r2=hash1(id+23.);
  float chip=(fbm(uv,12.)-.4)*.04+fbm(uv,48.)*.008;
  float de=d-.007-chip*.8;
  float face=smoothstep(.0,.022,de);
  float surfH=.8+r*.12+ridge(uv,8.)*.1+fbm(uv,32.)*.05+(q.y*(r-.5))*.1;
  float mort=.25+fbm(uv,64.)*.15;
  float mossM=smoothstep(.5,.66,fbm(uv+.7,5.)*.62+(1.-face)*.22+(.5-q.y)*.2+fbm(uv,40.)*.12);
  float mossH=fbm(uv,90.)*.5+vn(uv*220.,vec2(220.))*.5;
  h=mix(mort,surfH,face);h=mix(h,max(h,mort+.2)+.1+mossH*.1,mossM);
  vec3 st=mix(vec3(.4,.43,.36),vec3(.3,.34,.3),r)*(.75+.45*fbm(uv+r2,8.));
  st=mix(vec3(.16,.16,.13),st,face)*mix(.5,1.,smoothstep(-.004,.04,de));
  st*=1.-.3*smoothstep(.3,.9,vn2(uv,30.,2.))*smoothstep(.4,.7,fbm(uv,4.));
  vec3 mo=mix(vec3(.12,.2,.08),vec3(.26,.34,.13),mossH)*(.7+.55*fbm(uv,20.));
  alb=mix(st,mo,mossM);
  rough=mix(mix(.95,.78,face),1.,mossM);em=0.;
}`,
// 4 mossgrown floor: cobbles with moss in the joints
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec4 v=voro(uv,6.,.95);float r=hash1(v.zw+3.),r2=hash1(v.zw+31.);
  float dome=smoothstep(.0,.16,v.y-.012-fbm(uv,40.)*.02);
  float top=1.-v.x*v.x*.5;
  float surfH=(.55+.35*top+r*.08+fbm(uv,48.)*.04);
  float gap=.22+fbm(uv,90.)*.12;
  float mossM=smoothstep(.5,.8,(1.-dome)*.7+fbm(uv+.2,6.)*.42-.05);
  float mossH=vn(uv*200.,vec2(200.));
  h=mix(gap,surfH,dome);h=mix(h,max(h,gap+.16)+mossH*.07,mossM*.9);
  vec3 st=mix(vec3(.4,.42,.36),vec3(.29,.31,.29),r)*(.75+.45*fbm(uv+r2,12.));
  st=mix(st,st*vec3(1.1,1.02,.86),step(.75,r2));
  st*=mix(.5,1.,dome);
  vec3 mo=mix(vec3(.11,.19,.08),vec3(.24,.32,.12),mossH)*(.75+.45*fbm(uv,24.));st=mix(st,vec3(.17,.15,.12),(1.-dome)*.6);
  alb=mix(st,mo,mossM);
  rough=mix(mix(.95,.6,dome),1.,mossM);em=0.;
}`,
// 5 mossgrown ceiling: damp rock with moss
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);
  h=.45+.32*a+.2*b;
  float mossM=smoothstep(.6,.74,fbm(uv+.5,5.)+fbm(uv,32.)*.15);
  float mossH=vn(uv*180.,vec2(180.));
  alb=mix(vec3(.25,.3,.24),vec3(.17,.2,.18),b)*(.7+.5*fbm(uv+.4,16.))*mix(.6,1.,smoothstep(.3,.8,h));
  alb=mix(alb,mix(vec3(.1,.17,.07),vec3(.21,.29,.11),mossH),mossM);
  h+=mossM*(.04+mossH*.05);
  rough=mix(.8,1.,mossM);em=0.;
}`,
// 6 frostvault wall: blocks of old ice
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(2.,2.),.5,q,id,d);
  float r=hash1(id+5.);
  float de=d-.004-fbm(uv,10.)*.012;
  float face=smoothstep(.0,.05,de);
  vec4 v=voro(uv+r*.3,4.,1.);
  float crk=(1.-smoothstep(.0,.006,v.y))*smoothstep(.35,.6,fbm(uv,3.));
  float vein=1.-smoothstep(.0,.05,abs(vn2(uv,7.,3.)-.5));
  float rime=smoothstep(.56,.74,fbm(uv,7.)*.62+(1.-smoothstep(0.,.05,de))*.3);
  float rimeH=vn(uv*256.,vec2(256.))*.6+vn(uv*90.,vec2(90.))*.4;
  h=mix(.35,.84+r*.08+fbm(uv,5.)*.1+vn2(uv,60.,4.)*.02,face)-crk*.06+rime*(.03+rimeH*.06);
  vec3 ice=mix(vec3(.2,.4,.58),vec3(.48,.7,.82),fbm(uv+r,4.));
  ice=mix(ice,vec3(.8,.92,.97),vein*.35+crk*.8);
  ice*=mix(.5,1.,smoothstep(-.004,.05,de));
  ice*=.9+.2*vn2(uv,90.,3.);
  alb=mix(ice,vec3(.86,.92,.96)*(.85+.15*rimeH),rime);
  rough=mix(mix(.6,.14,face),.8,rime);rough=mix(rough,.5,crk);em=0.;
}`,
// 7 frostvault floor: frosted slabs
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(2.,2.),0.,q,id,d);
  float r=hash1(id+9.);
  float de=d-.005-fbm(uv,24.)*.008;
  float face=smoothstep(.0,.02,de);
  float scr=smoothstep(.72,.8,vn2(uv+r,3.,220.))*.5+smoothstep(.76,.82,vn2(uv,260.,5.))*.5;
  float frost=smoothstep(.6,.78,fbm(uv+.3,6.)+(1.-smoothstep(0.,.04,de))*.3);
  float fh=vn(uv*256.,vec2(256.));
  h=mix(.4,.88+r*.05+fbm(uv,12.)*.04-scr*.03,face)+frost*(.02+fh*.05);
  vec3 sl=mix(vec3(.36,.5,.63),vec3(.47,.6,.7),r)*(.82+.3*fbm(uv+r,10.));
  sl=mix(sl,sl*1.25,scr*.6);sl*=mix(.5,1.,smoothstep(-.003,.025,de));
  alb=mix(sl,vec3(.84,.9,.95)*(.85+.15*fh),frost*.9);
  rough=mix(mix(.7,.2,face),.85,frost);em=0.;
}`,
// 8 frostvault ceiling: frozen rock
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);
  h=.45+.32*a+.2*b;
  float frost=smoothstep(.62,.8,fbm(uv+.6,6.)+a*.25);float fh=vn(uv*200.,vec2(200.));
  alb=mix(vec3(.26,.35,.45),vec3(.2,.27,.36),b)*(.75+.45*fbm(uv+.4,16.))*mix(.6,1.,smoothstep(.3,.8,h));
  alb=mix(alb,vec3(.8,.87,.93)*(.85+.15*fh),frost);h+=frost*fh*.05;
  rough=mix(.45,.85,frost);em=0.;
}`,
// 9 cinder warrens wall: basalt columns with fire in the seams
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float n=8.;float w=uv.x*n+(vn2(uv,1.,4.)-.5)*.16;float col=mod(floor(w),n);float fx=fract(w)-.5;
  float r=hash1(vec2(col,3.)),r2=hash1(vec2(col,17.));
  float dx=(.5-abs(fx))/n;
  float seg=uv.y*3.+r*3.;float sid=floor(seg);float fy=fract(seg);
  float dy=min(fy,1.-fy)/3.*step(.25,hash1(vec2(col,mod(sid,3.)+40.)))+ (1.-step(.25,hash1(vec2(col,mod(sid,3.)+40.))))*.2;
  float de=min(dx,dy)-.004-fbm(uv,40.)*.006;
  float face=smoothstep(.0,.014,de);
  float rs=hash1(vec2(col,mod(sid,3.)+9.));
  float surfH=.78+rs*.16+fbm(uv,32.)*.06+vn2(uv,160.,6.)*.03-abs(fx)*.12;
  h=mix(.22,surfH,face);
  vec3 ba=mix(vec3(.2,.17,.165),vec3(.3,.25,.23),rs)*(.72+.5*fbm(uv+r,12.));
  ba=mix(ba,ba*vec3(1.25,1.,.85),smoothstep(.55,.8,fbm(uv+.2,5.)));
  ba*=mix(.4,1.,smoothstep(-.002,.02,de));
  float seam=(1.-smoothstep(.0,.007,dx))*smoothstep(.52,.62,fbm(uv*vec2(1.,1.)+r2,3.))*smoothstep(.3,.5,vn2(uv+r,1.,5.));
  float heat=vn2(uv,3.,40.)*.5+.5;
  alb=mix(ba,mix(vec3(1.,.28,.03),vec3(1.,.6,.15),heat*heat),seam);
  alb=mix(alb,alb+vec3(.25,.06,.0),(1.-smoothstep(0.,.035,dx))*smoothstep(.5,.62,fbm(uv+r2,3.))*.6*(1.-seam));
  rough=mix(.9,.55+rs*.2,face);em=seam;h=mix(h,.12,seam);
}`,
// 10 cinder warrens floor: cracked basalt plates over the glow
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec4 v=voro(uv,4.,.9);float r=hash1(v.zw+3.);
  float de=v.y-.006-fbm(uv,32.)*.01;
  float face=smoothstep(.0,.03,de);
  vec4 v2=voro(uv+.37,11.,1.);float fine=(1.-smoothstep(.0,.008,v2.y))*.6;
  h=mix(.2,.82+r*.12+fbm(uv,24.)*.06-fine*.08,face);
  vec3 ba=mix(vec3(.19,.165,.16),vec3(.27,.23,.21),r)*(.72+.5*fbm(uv+r,12.));
  ba*=1.-fine*.4;ba*=mix(.4,1.,smoothstep(-.002,.04,de));
  float hot=smoothstep(.5,.6,fbm(uv+.11,3.));
  float seam=(1.-smoothstep(.0,.012,v.y))*hot;
  float heat=fbm(uv,20.);
  alb=mix(ba,mix(vec3(1.,.26,.03),vec3(1.,.62,.16),heat),seam);
  alb=mix(alb,alb+vec3(.3,.07,.0),(1.-smoothstep(0.,.06,v.y))*hot*.5*(1.-seam));
  rough=mix(.92,.5+r*.25,face);em=seam;h=mix(h,.1,seam);
}`,
// 11 cinder warrens ceiling: scorched rock
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);vec4 v=voro(uv,5.,1.);
  h=.45+.3*a+.2*b-(1.-smoothstep(0.,.02,v.y))*.15;
  alb=mix(vec3(.2,.16,.15),vec3(.13,.11,.11),b)*(.7+.55*fbm(uv+.4,16.))*mix(.55,1.,smoothstep(.3,.8,h));
  alb=mix(alb,alb*vec3(1.5,1.,.8),smoothstep(.6,.8,fbm(uv+.9,4.)));
  rough=.9;em=0.;
}`,
// 12 gate: iron-bound oak
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float n=4.;float px=uv.x*n;float pid=floor(px);float fx=fract(px)-.5;float r=hash1(vec2(pid,2.));
  float gap=smoothstep(.0,.03,.5-abs(fx));
  float grain=vn2(uv+r,60.,2.)*.6+vn2(uv+r*2.,140.,3.)*.4;
  float knot=1.-smoothstep(.0,.05,length(vec2(fx*.25,fract(uv.y*1.+r)-.5)*vec2(4.,1.)-vec2(0.,.0))-.0);
  h=mix(.3,.62+r*.08+grain*.1-knot*.05,gap);
  vec3 wd=mix(vec3(.42,.27,.13),vec3(.5,.33,.16),r)*(.62+.6*grain);
  wd=mix(wd,wd*.55,knot*.6);wd*=mix(.35,1.,gap);
  alb=wd;rough=.72;
  float band=max(step(abs(uv.y-.18),.055),step(abs(uv.y-.82),.055));
  float bandY=min(abs(uv.y-.18),abs(uv.y-.82));
  vec2 rv=vec2(fract(uv.x*8.)-.5,bandY*8.);float riv=1.-smoothstep(.12,.17,length(rv));
  vec3 iron=vec3(.24,.25,.27)*(.75+.4*fbm(uv,40.));iron=mix(iron,vec3(.34,.2,.12),smoothstep(.55,.75,fbm(uv+.3,14.))*.7);
  if(band>.5){h=.86+fbm(uv,60.)*.05+riv*.12-smoothstep(.04,.055,bandY)*.1;alb=mix(iron,iron*1.5,riv);rough=.48;}
  vec2 lp=abs(uv-vec2(.5,.52));float plate=step(max(lp.x,lp.y),.11);float inner=step(max(lp.x,lp.y),.092);
  if(plate>.5){h=.9+inner*.04;alb=mix(vec3(.3,.31,.34),vec3(.72,.56,.22)*(.8+.3*fbm(uv,50.)),inner);rough=mix(.5,.35,inner);
    float kh=max(1.-smoothstep(.028,.034,length(uv-vec2(.5,.495))),step(abs(uv.x-.5),.014)*step(.495,uv.y)*step(uv.y,.575));
    alb=mix(alb,vec3(.03),kh);h-=kh*.3;}
  em=0.;
}`,
// 13 humming rooms wall: yellowed wallpaper over a baseboard
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float stripe=smoothstep(.42,.5,abs(fract(uv.x*8.)-.5));
  vec2 c=vec2(fract(uv.x*8.)-.5,fract(uv.y*8.+.5*floor(uv.x*8.))-.5);
  float chev=1.-smoothstep(.02,.045,abs(c.y+abs(c.x)*.9-.2));chev*=step(abs(c.x),.36);
  float dot2=1.-smoothstep(.03,.05,length(c-vec2(0.,-.22)));
  float paper=vn(uv*300.,vec2(300.))*.5+vn2(uv,400.,60.)*.5;
  float bub=smoothstep(.6,.8,fbm(uv+.4,7.))*.05;
  float seam=1.-smoothstep(.0,.004,abs(fract(uv.x*2.)-.5)-.0);
  h=.8+paper*.02+chev*.012+bub-seam*.03;
  vec3 pa=vec3(.76,.68,.33);
  pa=mix(pa,vec3(.81,.74,.4),stripe*.5);
  pa=mix(pa,vec3(.62,.54,.22),max(chev,dot2)*.55);
  pa*=.92+.14*paper;
  float stain=smoothstep(.5,.78,fbm(uv+.15,4.)*.75+fbm(uv,24.)*.12);
  pa=mix(pa,pa*vec3(.72,.63,.42),stain*.7);
  float damp=smoothstep(.55,1.,uv.y+fbm(uv,6.)*.25-.12);
  pa=mix(pa,pa*vec3(.6,.52,.36),damp*.75);
  pa*=1.-.25*smoothstep(.6,.95,vn2(uv,50.,2.))*smoothstep(.0,.4,uv.y)*.6;
  pa*=1.-seam*.25;
  alb=pa;rough=.9;
  float bb=smoothstep(.934,.938,uv.y);float lip=smoothstep(.934,.95,uv.y)*(1.-smoothstep(.95,.962,uv.y));
  float wg=vn2(uv,3.,300.);
  vec3 bc=vec3(.3,.22,.13)*(.75+.4*wg);bc*=1.-.3*smoothstep(.99,1.,uv.y);
  alb=mix(alb,bc,bb);h=mix(h,.93+lip*.07+wg*.01,bb);rough=mix(rough,.55,bb);
  alb*=mix(1.,.6,smoothstep(.915,.934,uv.y)*(1.-bb));
  em=0.;
}`,
// 14 humming rooms floor: damp office carpet
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float f1=vn(uv*256.,vec2(256.)),f2=vn(uv*128.,vec2(128.)),lp=vn2(uv,200.,90.);
  float pile=f1*.5+f2*.3+lp*.2;
  float mat=fbm(uv,10.);
  h=.72+pile*.2+mat*.06;
  vec3 ca=mix(vec3(.47,.41,.23),vec3(.56,.5,.3),pile)*(.85+.3*mat);
  float tr=smoothstep(.45,.75,fbm(uv+.6,3.));
  ca=mix(ca,ca*vec3(.82,.78,.7),tr*.6);
  float stain=smoothstep(.58,.74,fbm(uv+.21,5.)*.8+fbm(uv,30.)*.1);
  float ring=smoothstep(.56,.6,fbm(uv+.21,5.)*.8)*(1.-smoothstep(.62,.7,fbm(uv+.21,5.)*.8));
  ca=mix(ca,ca*vec3(.58,.52,.4),stain*.8);ca*=1.-ring*.18;
  alb=ca;rough=mix(1.,.82,stain);em=0.;
}`,
// 15 humming rooms ceiling: drop-ceiling tiles
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 g=fract(uv*2.)-.5;vec2 tid=floor(uv*2.);float r=hash1(tid+2.);
  float e=min(.5-abs(g.x),.5-abs(g.y))/2.;
  float bar=1.-smoothstep(.0085,.0095,e);
  float bevel=smoothstep(.0095,.02,e);
  float fiss=smoothstep(.72,.8,vn2(uv+r,90.,26.))*smoothstep(.5,.7,fbm3(uv,9.));
  float pin=smoothstep(.8,.86,vn(uv*150.,vec2(150.)));
  float sag=fbm(uv,3.)*.03;
  h=.8+sag+vn(uv*256.,vec2(256.))*.015-fiss*.1-pin*.08;h=mix(.7,h,bevel);
  vec3 tl=vec3(.8,.78,.69)*(.92+.12*fbm(uv+r,14.));
  tl*=1.-fiss*.3-pin*.35;
  float st=fbm(uv+.3,2.);float stain=smoothstep(.7,.8,st);float ring=smoothstep(.67,.7,st)*(1.-smoothstep(.7,.75,st));
  tl=mix(tl,tl*vec3(.78,.62,.36),stain*.75);tl=mix(tl,tl*vec3(.6,.45,.25),ring*.6);
  tl*=mix(.7,1.,bevel);
  vec3 bc=vec3(.62,.62,.6)*(.9+.15*vn2(uv,300.,300.));
  alb=mix(tl,bc,bar);h=mix(h,.86,bar);rough=mix(.96,.45,bar);em=0.;
}`,
// 16 humming rooms light panel set into the ceiling grid
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 g=fract(uv*2.)-.5;vec2 tid=floor(uv*2.);float r=hash1(tid+2.);
  float e=min(.5-abs(g.x),.5-abs(g.y))/2.;
  float bar=1.-smoothstep(.0085,.0095,e);
  float bevel=smoothstep(.0095,.02,e);
  float pin=smoothstep(.8,.86,vn(uv*150.,vec2(150.)));
  h=.8+vn(uv*256.,vec2(256.))*.015-pin*.08;h=mix(.7,h,bevel);
  vec3 tl=vec3(.8,.78,.69)*(.92+.12*fbm(uv+r,14.));tl*=1.-pin*.35;tl*=mix(.7,1.,bevel);
  alb=mix(tl,vec3(.62,.62,.6),bar);h=mix(h,.86,bar);rough=mix(.96,.45,bar);em=0.;
  vec2 a=abs(g)-vec2(.39,.27);float fd=max(a.x,a.y);
  float frame=1.-smoothstep(.0,.004,fd);float lens=1.-smoothstep(-.03,-.026,fd);
  if(frame>.01){alb=mix(alb,vec3(.3,.3,.29),frame);h=mix(h,.9,frame);rough=mix(rough,.4,frame);}
  if(lens>.01){
    vec2 pr=fract(g*40.)-.5;float prism=.9+.1*smoothstep(.0,.3,max(abs(pr.x),abs(pr.y)));
    float tube=.8+.2*smoothstep(.12,.0,abs(abs(g.y)-.11));
    float dirt=1.-.08*smoothstep(.5,.8,fbm(uv+r,8.))-.12*smoothstep(-.06,-.03,fd);
    alb=mix(alb,vec3(1.,.97,.86)*prism*tube*dirt,lens);h=mix(h,.82+.02*prism,lens);rough=mix(rough,.3,lens);em=lens;}
}`,
];

const VS = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const mainA = `
void main(){float h,rough,em;vec3 alb;surf(vUv,h,alb,rough,em);
  alb=pow(clamp(alb,0.,1.),vec3(2.2));
  gl_FragColor=vec4(alb,em>.5?.5-.5*sat(em):.5+.5*sat(rough));}`;
const mainH = `
void main(){float h,rough,em;vec3 alb;surf(vUv,h,alb,rough,em);gl_FragColor=vec4(sat(h),0.,0.,1.);}`;
const FS_N = `precision highp float;varying vec2 vUv;uniform sampler2D tH;uniform vec2 px;uniform float bump;
float H(vec2 o){return texture2D(tH,vUv+o*px).r;}
void main(){
  float tl=H(vec2(-1.,-1.)),t=H(vec2(0.,-1.)),tr=H(vec2(1.,-1.)),l=H(vec2(-1.,0.)),c=H(vec2(0.)),r=H(vec2(1.,0.)),bl=H(vec2(-1.,1.)),b=H(vec2(0.,1.)),br=H(vec2(1.,1.));
  float gx=((tl+2.*l+bl)-(tr+2.*r+br))/(8.*px.x),gy=((tl+2.*t+tr)-(bl+2.*b+br))/(8.*px.y);
  vec3 n=normalize(vec3(gx*bump,gy*bump,1.));
  gl_FragColor=vec4(n*.5+.5,clamp(1.-c,0.,1.));}`;

export function makeSurfaces(renderer, size, wantNormals) {
  const quad = new FullScreenQuad();
  const cache = new Map();
  const an = Math.min(size >= 1024 ? 16 : 8, renderer.capabilities.getMaxAnisotropy());
  const target = (srgb, type) => {
    const rt = new THREE.WebGLRenderTarget(size, size, {type: type || THREE.UnsignedByteType, depthBuffer: false,
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace});
    rt.texture.anisotropy = an;
    return rt;
  };
  const run = (mat, rt) => {quad.material = mat; renderer.setRenderTarget(rt); quad.render(renderer); renderer.setRenderTarget(null); mat.dispose()};
  function get(i) {
    if (cache.has(i)) return cache.get(i);
    const prev = renderer.getRenderTarget(), tm = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    const head = `#define SEED ${(i * 17.31 + 3.7).toFixed(2)}\n` + LIB + SURF[i];
    const A = target(true);
    run(new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: head + mainA, depthTest: false, depthWrite: false, toneMapped: false}), A);
    let N = null;
    if (wantNormals) {
      const Hh = new THREE.WebGLRenderTarget(size, size, {type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping});
      run(new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: head + mainH, depthTest: false, depthWrite: false, toneMapped: false}), Hh);
      N = target(false);
      // floors and ceilings stretch one tile of texture over two metres, walls over one
      const flat = i === 12 ? 0 : [0, 1, 1][i < 12 ? i % 3 : i - 13 > 2 ? 1 : i - 13];
      run(new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: FS_N, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: {tH: {value: Hh.texture}, px: {value: new THREE.Vector2(1 / size, 1 / size)}, bump: {value: flat ? 0.05 : 0.1}}}), N);
      Hh.dispose();
    }
    renderer.toneMapping = tm; renderer.setRenderTarget(prev);
    const out = {map: A.texture, nrm: N ? N.texture : null, rtA: A, rtN: N};
    cache.set(i, out);
    return out;
  }
  return {get, count: SURF.length};
}
