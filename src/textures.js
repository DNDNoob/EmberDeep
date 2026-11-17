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
// per-floor look: VAR is 0 (the classic surface) to 3; vs picks one value per look
float vs(float a,float b,float c,float d){return VAR==1?b:VAR==2?c:VAR==3?d:a;}
vec3 vs3(vec3 a,vec3 b,vec3 c,vec3 d){return VAR==1?b:VAR==2?c:VAR==3?d:a;}
const float V1=float(VAR==1),V2=float(VAR==2),V3=float(VAR==3);
vec3 tone(vec3 c,float k){return c*k;}
`;

// each surface: void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em)   (alb in display space)
const SURF = [
// 0 old stonework wall: weathered sandstone ashlar
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(vs(2.,3.,2.,3.),vs(4.,4.,5.,3.)),.5,q,id,d);
  float chip=((fbm(uv,24.)-.4)*.02)*vs(1.,1.,2.2,1.)+vn(uv*96.,vec2(96.))*.004;
  float de=d-vs(.005,.007,.008,.005)-chip*step(.35,hash1(id+7.))-chip*.4;
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
#if VAR==1
  float low=smoothstep(.5,1.,uv.y+fbm(uv,6.)*.3-.12);
  alb*=mix(vec3(1.),vec3(.5,.62,.5),low*(.5+.5*fbm(uv+.3,10.)));rough=mix(rough,.35,low*face);h-=low*.03*vn(uv*90.,vec2(90.));
#elif VAR==2
  vec4 vc=voro(uv+r*.2,6.,.9);float crk=(1.-smoothstep(.0,.009,vc.y))*smoothstep(.35,.6,fbm(uv+.4,4.))*face;
  float pit2=smoothstep(.55,.72,fbm(uv,18.))*face;
  h-=crk*.16+pit2*.05;alb*=1.-crk*.65-pit2*.22;alb=mix(alb,alb*vec3(.78,.7,.6),smoothstep(.55,.8,fbm(uv+.9,5.))*.6);
#elif VAR==3
  float sot=smoothstep(.25,.9,vn2(uv,34.,2.)*.6+fbm(uv+.2,5.)*.5)*(1.-uv.y*.6);
  alb*=mix(vec3(1.),vec3(.34,.32,.32),sot*.85);rough=mix(rough,.95,sot);
#endif
}`,
// 1 stonework floor: worn flagstones
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(vs(4.,3.,4.,5.),vs(4.,3.,5.,4.)),.5,q,id,d);
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
#if VAR==1
  alb*=mix(vec3(1.),vec3(.7,.76,.74),face);alb=mix(alb,vec3(.18,.26,.14)*(.7+.5*fbm(uv,18.)),smoothstep(.55,.8,fbm(uv+.5,7.))*.5);rough=mix(rough,.16,face);
#elif VAR==2
  vec4 vc=voro(uv+r2,9.,.9);float crk2=(1.-smoothstep(.0,.01,vc.y))*step(.4,r)*face;
  h-=crk2*.2;alb*=1.-crk2*.6;alb=mix(alb,vec3(.34,.3,.24)*(.8+.4*fbm(uv,30.)),smoothstep(.62,.8,fbm(uv+.7,8.))*.6);
#elif VAR==3
  alb*=vec3(.55,.53,.52)*(.8+.4*fbm(uv+.4,6.));rough=mix(rough,.95,.5);
#endif
}`,
// 2 stonework ceiling: rough hewn rock
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);vec4 v=voro(uv,4.,1.);
  h=.45+.3*a+.2*b-(1.-smoothstep(0.,.03,v.y))*.18;
  alb=mix(vec3(.36,.32,.28),vec3(.27,.25,.23),b)*(.7+.55*fbm(uv+.4,16.));
  alb*=mix(.6,1.,smoothstep(.3,.8,h));
  rough=.95;em=0.;
#if VAR==1
  float dr=smoothstep(.5,.8,fbm(uv+.4,5.));alb=mix(alb,alb*vec3(.6,.75,.65),dr*.7);rough=mix(rough,.6,dr);
#elif VAR==2
  h-=(1.-smoothstep(0.,.02,voro(uv+.3,8.,1.).y))*.15;alb*=mix(1.,.8,smoothstep(.5,.8,fbm(uv+.9,4.)));
#elif VAR==3
  alb*=mix(vec3(1.),vec3(.3,.28,.28),smoothstep(.25,.75,fbm(uv+.5,3.)+fbm(uv,14.)*.3)*.85);
#endif
}`,
// 3 mossgrown wall: big rough blocks under moss
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(vs(2.,2.,3.,2.),vs(2.,2.,3.,3.)),.5,q,id,d);
  float r=hash1(id+5.),r2=hash1(id+23.);
  float chip=(fbm(uv,12.)-.4)*.04+fbm(uv,48.)*.008;
  float de=d-.007-chip*.8;
  float face=smoothstep(.0,.022,de);
  float surfH=.8+r*.12+ridge(uv,8.)*.1+fbm(uv,32.)*.05+(q.y*(r-.5))*.1;
  float mort=.25+fbm(uv,64.)*.15;
  float mossM=smoothstep(vs(.5,.34,.6,.62),vs(.66,.5,.76,.78),fbm(uv+.7,5.)*.62+(1.-face)*.22+(.5-q.y)*.2+fbm(uv,40.)*.12);
  float mossH=fbm(uv,90.)*.5+vn(uv*220.,vec2(220.))*.5;
  h=mix(mort,surfH,face);h=mix(h,max(h,mort+.2)+.1+mossH*.1,mossM);
  vec3 st=mix(vec3(.4,.43,.36),vec3(.3,.34,.3),r)*(.75+.45*fbm(uv+r2,8.));
  st=mix(vec3(.16,.16,.13),st,face)*mix(.5,1.,smoothstep(-.004,.04,de));
  st*=1.-.3*smoothstep(.3,.9,vn2(uv,30.,2.))*smoothstep(.4,.7,fbm(uv,4.));
  vec3 mo=mix(vec3(.12,.2,.08),vec3(.26,.34,.13),mossH)*(.7+.55*fbm(uv,20.));
  alb=mix(st,mo,mossM);
  rough=mix(mix(.95,.78,face),1.,mossM);em=0.;
#if VAR==1
  alb=mix(alb,alb*vec3(.8,1.05,.75),mossM);
#elif VAR==2
  float drip=smoothstep(.45,.85,vn2(uv,50.,2.))*smoothstep(.3,.7,fbm(uv+.2,3.));
  alb*=1.-drip*.4;rough=mix(rough,.3,drip);
#elif VAR==3
  alb=mix(alb,vec3(.6,.64,.48)*(.7+.5*mossH)*(.8+.3*fbm(uv,22.)),mossM);
#endif
}`,
// 4 mossgrown floor: cobbles with moss in the joints
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec4 v=voro(uv,vs(6.,6.,5.,7.),.95);float r=hash1(v.zw+3.),r2=hash1(v.zw+31.);
  float dome=smoothstep(.0,.16,v.y-.012-fbm(uv,40.)*.02);
  float top=1.-v.x*v.x*.5;
  float surfH=(.55+.35*top+r*.08+fbm(uv,48.)*.04);
  float gap=.22+fbm(uv,90.)*.12;
  float mossM=smoothstep(vs(.5,.36,.58,.6),vs(.8,.66,.88,.9),(1.-dome)*.7+fbm(uv+.2,6.)*.42-.05);
  float mossH=vn(uv*200.,vec2(200.));
  h=mix(gap,surfH,dome);h=mix(h,max(h,gap+.16)+mossH*.07,mossM*.9);
  vec3 st=mix(vec3(.4,.42,.36),vec3(.29,.31,.29),r)*(.75+.45*fbm(uv+r2,12.));
  st=mix(st,st*vec3(1.1,1.02,.86),step(.75,r2));
  st*=mix(.5,1.,dome);
  vec3 mo=mix(vec3(.11,.19,.08),vec3(.24,.32,.12),mossH)*(.75+.45*fbm(uv,24.));st=mix(st,vec3(.17,.15,.12),(1.-dome)*.6);
  alb=mix(st,mo,mossM);
  rough=mix(mix(.95,.6,dome),1.,mossM);em=0.;
#if VAR==1
  alb=mix(alb,alb*vec3(.8,1.05,.75),mossM);
#elif VAR==2
  float pud=smoothstep(.5,.7,fbm(uv+.6,4.))*dome;alb*=1.-pud*.4;rough=mix(rough,.18,pud);
#elif VAR==3
  alb=mix(alb,vec3(.62,.66,.5)*(.7+.5*mossH)*(.8+.3*fbm(uv,24.)),mossM);
#endif
}`,
// 5 mossgrown ceiling: damp rock with moss
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);
  h=.45+.32*a+.2*b;
  float mossM=smoothstep(vs(.6,.46,.68,.7),vs(.74,.6,.82,.84),fbm(uv+.5,5.)+fbm(uv,32.)*.15);
  float mossH=vn(uv*180.,vec2(180.));
  alb=mix(vec3(.25,.3,.24),vec3(.17,.2,.18),b)*(.7+.5*fbm(uv+.4,16.))*mix(.6,1.,smoothstep(.3,.8,h));
  alb=mix(alb,mix(vec3(.1,.17,.07),vec3(.21,.29,.11),mossH),mossM);
  h+=mossM*(.04+mossH*.05);
  rough=mix(.8,1.,mossM);em=0.;
#if VAR==2
  float dr=smoothstep(.5,.8,fbm(uv+.4,6.))*(1.-mossM);alb*=1.-dr*.4;rough=mix(rough,.3,dr);
#elif VAR==3
  alb=mix(alb,vec3(.62,.66,.5)*(.7+.5*mossH)*(.8+.3*fbm(uv,24.)),mossM);
#endif
}`,
// 6 frostvault wall: blocks of old ice
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(vs(2.,2.,3.,2.),vs(2.,3.,2.,2.)),.5,q,id,d);
  float r=hash1(id+5.);
  float de=d-.004-fbm(uv,10.)*.012;
  float face=smoothstep(.0,.05,de);
  vec4 v=voro(uv+r*.3,4.,1.);
  float crk=(1.-smoothstep(.0,.006,v.y))*smoothstep(vs(.35,.35,.35,.1),vs(.6,.6,.6,.3),fbm(uv,3.));
  float vein=1.-smoothstep(.0,.05,abs(vn2(uv,7.,3.)-.5));
  float rime=smoothstep(vs(.56,.72,.42,.7),vs(.74,.88,.6,.9),fbm(uv,7.)*.62+(1.-smoothstep(0.,.05,de))*.3);
  float rimeH=vn(uv*256.,vec2(256.))*.6+vn(uv*90.,vec2(90.))*.4;
  h=mix(.35,.84+r*.08+fbm(uv,5.)*.1+vn2(uv,60.,4.)*.02,face)-crk*.06+rime*(.03+rimeH*.06);
  vec3 ice=mix(vec3(.2,.4,.58),vec3(.48,.7,.82),fbm(uv+r,4.));
  ice=mix(ice,vec3(.8,.92,.97),vein*.35+crk*.8);
  ice*=mix(.5,1.,smoothstep(-.004,.05,de));
  ice*=.9+.2*vn2(uv,90.,3.);
  alb=mix(ice,vec3(.86,.92,.96)*(.85+.15*rimeH),rime);
  rough=mix(mix(.6,.14,face),.8,rime);rough=mix(rough,.5,crk);em=0.;
#if VAR==1
  alb=mix(alb,alb*vec3(.78,.93,1.1),1.-rime);rough=mix(rough,.08,face*(1.-rime));
#elif VAR==3
  alb=mix(alb,alb*vec3(.18,.22,.3),(1.-rime)*.9);alb=mix(alb,vec3(.8,.9,.97),crk*.8);rough=mix(rough,.06,face*(1.-rime));
#endif
}`,
// 7 frostvault floor: frosted slabs
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(vs(2.,2.,3.,2.),vs(2.,3.,3.,2.)),0.,q,id,d);
  float r=hash1(id+9.);
  float de=d-.005-fbm(uv,24.)*.008;
  float face=smoothstep(.0,.02,de);
  float scr=smoothstep(.72,.8,vn2(uv+r,3.,220.))*.5+smoothstep(.76,.82,vn2(uv,260.,5.))*.5;
  float frost=smoothstep(vs(.6,.74,.44,.7),vs(.78,.9,.62,.92),fbm(uv+.3,6.)+(1.-smoothstep(0.,.04,de))*.3);
  float fh=vn(uv*256.,vec2(256.));
  h=mix(.4,.88+r*.05+fbm(uv,12.)*.04-scr*.03,face)+frost*(.02+fh*.05);
  vec3 sl=mix(vec3(.36,.5,.63),vec3(.47,.6,.7),r)*(.82+.3*fbm(uv+r,10.));
  sl=mix(sl,sl*1.25,scr*.6);sl*=mix(.5,1.,smoothstep(-.003,.025,de));
  alb=mix(sl,vec3(.84,.9,.95)*(.85+.15*fh),frost*.9);
  rough=mix(mix(.7,.2,face),.85,frost);em=0.;
#if VAR==1
  alb=mix(alb,alb*vec3(.78,.93,1.1),1.-frost);rough=mix(rough,.1,face*(1.-frost));
#elif VAR==3
  vec4 vc=voro(uv+r,5.,.9);float fr=(1.-smoothstep(.0,.008,vc.y))*smoothstep(.4,.6,fbm(uv+.5,3.));
  alb=mix(alb*vec3(.2,.24,.32),vec3(.8,.9,.97),fr*.7);alb=mix(alb,vec3(.84,.9,.95),frost*.5);rough=mix(rough,.05,face*(1.-frost));
#endif
}`,
// 8 frostvault ceiling: frozen rock
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);
  h=.45+.32*a+.2*b;
  float frost=smoothstep(vs(.62,.74,.5,.72),vs(.8,.9,.68,.9),fbm(uv+.6,6.)+a*.25);float fh=vn(uv*200.,vec2(200.));
  alb=mix(vec3(.26,.35,.45),vec3(.2,.27,.36),b)*(.75+.45*fbm(uv+.4,16.))*mix(.6,1.,smoothstep(.3,.8,h));
  alb=mix(alb,vec3(.8,.87,.93)*(.85+.15*fh),frost);h+=frost*fh*.05;
  rough=mix(.45,.85,frost);em=0.;
#if VAR==1
  alb=mix(alb,alb*vec3(.78,.93,1.1),1.-frost);
#elif VAR==3
  alb=mix(alb,alb*vec3(.25,.3,.4),(1.-frost)*.8);rough=mix(rough,.2,1.-frost);
#endif
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
  float seam=(1.-smoothstep(.0,vs(.007,.005,.011,.005),dx))*smoothstep(vs(.52,.66,.4,.64),vs(.62,.78,.5,.74),fbm(uv*vec2(1.,1.)+r2,3.))*smoothstep(.3,.5,vn2(uv+r,1.,5.));
  float heat=vn2(uv,3.,40.)*.5+.5;
  alb=mix(ba,mix(vec3(1.,.28,.03),vec3(1.,.6,.15),heat*heat),seam);
  alb=mix(alb,alb+vec3(.25,.06,.0),(1.-smoothstep(0.,.035,dx))*smoothstep(.5,.62,fbm(uv+r2,3.))*.6*(1.-seam));
  rough=mix(.9,.55+rs*.2,face);em=seam;h=mix(h,.12,seam);
#if VAR==1
  alb=mix(alb,vec3(dot(alb,vec3(.33)))*vec3(.92,.95,1.05),(1.-seam)*.7);
#elif VAR==3
  alb*=mix(vec3(.6,.58,.7),vec3(1.),seam);rough=mix(.25,rough,seam);
#endif
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
  float hot=smoothstep(vs(.5,.64,.38,.62),vs(.6,.76,.48,.72),fbm(uv+.11,3.));
  float seam=(1.-smoothstep(.0,.012,v.y))*hot;
  float heat=fbm(uv,20.);
  alb=mix(ba,mix(vec3(1.,.26,.03),vec3(1.,.62,.16),heat),seam);
  alb=mix(alb,alb+vec3(.3,.07,.0),(1.-smoothstep(0.,.06,v.y))*hot*.5*(1.-seam));
  rough=mix(.92,.5+r*.25,face);em=seam;h=mix(h,.1,seam);
#if VAR==1
  alb=mix(alb,vec3(dot(alb,vec3(.33)))*vec3(.92,.95,1.05),(1.-seam)*.7);
#elif VAR==3
  alb*=mix(vec3(.6,.58,.7),vec3(1.),seam);rough=mix(.22,rough,seam);
#endif
}`,
// 11 cinder warrens ceiling: scorched rock
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);vec4 v=voro(uv,5.,1.);
  h=.45+.3*a+.2*b-(1.-smoothstep(0.,.02,v.y))*.15;
  alb=mix(vec3(.2,.16,.15),vec3(.13,.11,.11),b)*(.7+.55*fbm(uv+.4,16.))*mix(.55,1.,smoothstep(.3,.8,h));
  alb=mix(alb,alb*vec3(1.5,1.,.8),smoothstep(.6,.8,fbm(uv+.9,4.)));
  rough=.9;em=0.;
#if VAR==1
  alb=mix(alb,vec3(dot(alb,vec3(.33)))*vec3(.95,.98,1.1),.7);
#elif VAR==2
  float hv=(1.-smoothstep(.0,.02,v.y))*smoothstep(.5,.62,fbm(uv+.3,3.));alb=mix(alb,vec3(1.,.4,.08),hv);em=hv>.3?.5+.4*hv:0.;
#elif VAR==3
  alb*=vec3(.7,.68,.8);rough=.3;
#endif
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
  vec3 pa=vs3(vec3(.76,.68,.33),vec3(.55,.63,.4),vec3(.84,.56,.46),vec3(.74,.67,.36));
  pa=mix(pa,vs3(vec3(.81,.74,.4),vec3(.6,.68,.46),vec3(.9,.63,.52),vec3(.8,.73,.42)),stripe*.5);
  pa=mix(pa,vs3(vec3(.62,.54,.22),vec3(.4,.5,.28),vec3(.7,.42,.34),vec3(.6,.53,.25)),max(chev,dot2)*.55);
  pa*=.92+.14*paper;
  float stain=smoothstep(vs(.5,.5,.5,.3),vs(.78,.78,.78,.6),fbm(uv+.15,4.)*.75+fbm(uv,24.)*.12);
  pa=mix(pa,pa*vs3(vec3(.72,.63,.42),vec3(.7,.66,.5),vec3(.72,.6,.5),vec3(.62,.56,.4)),stain*.7);
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
  vec3 ca=mix(vs3(vec3(.47,.41,.23),vec3(.3,.37,.25),vec3(.5,.31,.28),vec3(.47,.41,.23)),vs3(vec3(.56,.5,.3),vec3(.37,.44,.31),vec3(.6,.4,.35),vec3(.56,.5,.3)),pile)*(.85+.3*mat);
  float tr=smoothstep(.45,.75,fbm(uv+.6,3.));
  ca=mix(ca,ca*vec3(.82,.78,.7),tr*.6);
  float stain=smoothstep(vs(.58,.58,.58,.4),vs(.74,.74,.74,.58),fbm(uv+.21,5.)*.8+fbm(uv,30.)*.1);
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
  vec3 tl=vs3(vec3(.8,.78,.69),vec3(.72,.79,.7),vec3(.84,.76,.7),vec3(.8,.78,.69))*(.92+.12*fbm(uv+r,14.));
  tl*=1.-fiss*.3-pin*.35;
  float st=fbm(uv+.3,2.);float stain=smoothstep(vs(.7,.7,.7,.5),vs(.8,.8,.8,.64),st);float ring=smoothstep(.67,.7,st)*(1.-smoothstep(.7,.75,st));
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
// 17 bone galleries wall: stacked skulls and long-bone ends packed between stone piers
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float ns=vs(4.,4.,4.,3.),pw=.2;
  float fx=fract(uv.x*2.),nid=floor(uv.x*2.);
  float rv=(uv.y-.075)/.84*7.,r=floor(rv),rf=fract(rv);
  float isB=mod(r,3.)>1.5?1.:0.;
  float u=(fx-pw)/(1.-pw)*ns+.5*mod(r,2.);
  vec2 cid=vec2(floor(u)+nid*7.,r);
  float hr=hash1(cid+3.),hr2=hash1(cid+17.),hr3=hash1(cid+41.);
  vec2 p=vec2(fract(u)-.5,(rf-.5)*.349*ns)-vec2(hr-.5,hr2-.5)*.05;
  vec2 s=p/(1.04+.12*hr3);
  float cr=length((s-vec2(0.,-.12))/vec2(.4,.42));
  float jaw=max(abs(s.x)-.2+(s.y-.25)*.45,abs(s.y-.34)-.15);
  float dm=min((cr-1.)*.4,jaw);
  float eye=length(vec2(abs(s.x)-.15,s.y*1.1))-.1;
  float nose=length(vec2(s.x*1.4,(s.y-.17)*.85))-.05;
  float eyeM=1.-smoothstep(-.02,.02,eye),noseM=1.-smoothstep(-.02,.02,nose);
  float tooth=(jaw<0.&&s.y>.22)?smoothstep(.35,.5,abs(fract(s.x*12.)-.5)):0.;
  float skH=.5+.3*sqrt(max(0.,1.-cr*cr))+(jaw<0.?.06:0.)-eyeM*.34-noseM*.25-tooth*.04;
  vec2 lc=hr>.5?vec2(.2,0.):vec2(0.,.26);
  float lb=min(length(p-lc),length(p+lc))-.23,sh=length(p*vec2(1.,.75))-.44;
  float bH=.45+.2*(1.-smoothstep(-.2,.0,sh))+.28*(1.-smoothstep(-.18,.0,lb));
  float dmA=mix(dm,min(lb,sh),isB);
  float m=1.-smoothstep(-.012,.012,dmA);
  float gap=.12+fbm(uv,50.)*.08;
  float boneH=mix(gap,mix(skH,bH,isB)*.82,m);
  vec3 bc=mix(vec3(.82,.76,.62),vec3(.68,.6,.46),hr*.8)*(.78+.34*fbm(uv+hr,24.));
  bc*=1.-.25*smoothstep(.5,.9,fbm(uv+.3,9.));
  bc*=mix(.4,1.,smoothstep(.0,.09,-dmA));
  bc=mix(bc,vec3(.05,.04,.035),(eyeM+noseM)*(1.-isB));bc*=1.-tooth*.45;bc=mix(bc,bc*vec3(.62,.58,.5),isB*smoothstep(-.02,.03,lb));
  vec3 boneC=mix(vec3(.1,.08,.06)*(.7+.6*vn(uv*160.,vec2(160.))),bc,m);
  float pier=1.-smoothstep(pw-.008,pw,fx);
  float band=max(1.-smoothstep(.065,.075,uv.y),smoothstep(.915,.925,uv.y));
  float stoneM=max(pier,band);
  float vj=fract(uv.x*4.);
  float jd=band>.5?min(vj,1.-vj)*.25:min(rf,1.-rf)*.15;
  float joint=1.-smoothstep(.003,.009,jd-fbm(uv,60.)*.004);
  float stoneH=.9+fbm(uv,20.)*.06+vn(uv*120.,vec2(120.))*.02-joint*.14;
  vec3 stoneC=vec3(.6,.56,.47)*(.72+.5*fbm(uv+hr,10.))*(1.-joint*.5);
  stoneC*=mix(1.,.8,smoothstep(.915,1.,uv.y));
  h=mix(boneH,stoneH,stoneM);alb=mix(boneC,stoneC,stoneM);
  alb*=mix(1.,mix(.45,1.,smoothstep(pw,pw+.06,fx)*(1.-smoothstep(.94,1.,fx))),1.-stoneM);
  rough=mix(.78,.95,stoneM);em=0.;
#if VAR==1
  float mm=smoothstep(.5,.68,fbm(uv+.3,6.)*.7+(1.-m)*.2+stoneM*.1+uv.y*.15);
  float mh=vn(uv*200.,vec2(200.));
  alb=mix(alb*.85,mix(vec3(.1,.18,.07),vec3(.22,.3,.11),mh)*(.7+.5*fbm(uv,24.)),mm);h+=mm*(.05+mh*.05);rough=mix(rough,1.,mm);
#elif VAR==2
  alb=mix(alb,vec3(.93,.92,.88)*(.88+.12*fbm(uv+hr,20.)),.55)*(1.+.1*stoneM);rough=.9;
#elif VAR==3
  float sot=smoothstep(.15,.85,fbm(uv+.5,5.)*.6+(1.-uv.y)*.5);
  alb*=mix(vec3(1.),vec3(.34,.3,.27),sot*.85);alb=mix(alb,alb*vec3(1.1,.9,.7),m*.4);
#endif
}`,
// 18 bone galleries floor: packed earth, worn pavers, bone fragments
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec4 v=voro(uv,vs(4.,4.,3.,5.),.85);float r=hash1(v.zw+5.),r2=hash1(v.zw+29.);
  float paver=step(vs(.3,.3,.2,.34),r);
  float de=v.y-.008-fbm(uv,40.)*.012;
  float face=smoothstep(.0,.025,de)*paver;
  float wear=fbm(uv,7.);
  float er=fbm(uv,30.)*.5+vn(uv*180.,vec2(180.))*.5;
  float peb=smoothstep(.74,.82,vn(uv*220.,vec2(220.)))*(1.-face);
  float surfH=.72+r*.1+fbm(uv,24.)*.05-smoothstep(.55,.8,vn(uv*150.,vec2(150.)))*.04-smoothstep(.55,.75,wear)*.04;
  float earthH=.3+er*.2+peb*.12;
  h=mix(earthH,surfH,face);
  vec3 pc=mix(vec3(.55,.5,.4),vec3(.45,.41,.34),r)*(.78+.4*fbm(uv+r2,10.));
  pc=mix(pc,pc*vec3(1.1,1.04,.92),smoothstep(.4,.7,wear));
  pc*=mix(.65,1.,smoothstep(-.003,.02,de));
  vec3 ec=mix(vec3(.33,.26,.18),vec3(.42,.34,.25),er)*(.8+.4*vn(uv*128.,vec2(128.)));ec=mix(ec,vec3(.5,.46,.4),peb*.8);
  alb=mix(ec,pc,face);
  // bone fragments: one chance per cell
  float n=12.;vec2 gp=uv*n,gi=floor(gp),gf=fract(gp);
  float fh=hash1(mod(gi,n)+61.),fa=hash1(mod(gi,n)+83.)*PI;
  vec2 c0=.3+.4*hash2(mod(gi,n)+97.),dir=vec2(cos(fa),sin(fa))*(.14+.1*hash1(mod(gi,n)+7.));
  vec2 pa=gf-c0;float t=clamp(dot(pa,dir)/dot(dir,dir),-1.,1.);
  float fd=length(pa-dir*t);float fw=.045+.02*hash1(mod(gi,n)+19.);
  float cap=1.-pow(abs(t),6.)*.5;
  float fm=(1.-smoothstep(fw*.6,fw,fd/cap))*step(vs(.8,.8,.74,.84),fh);
  h=mix(h,.78+(1.-fd/fw)*.1,fm);
  alb=mix(alb,vec3(.82,.78,.66)*(.85+.2*hash1(mod(gi,n)+3.)),fm);
  rough=mix(.98,mix(.62,.85,wear),face);rough=mix(rough,.7,fm);em=0.;
#if VAR==1
  float mm=smoothstep(.5,.7,(1.-face)*.55+fbm(uv+.2,6.)*.5);float mh=vn(uv*200.,vec2(200.));
  alb=mix(alb*.8,mix(vec3(.1,.17,.07),vec3(.22,.3,.11),mh),mm*(1.-fm));h+=mm*.05*(1.-fm);rough=mix(rough,1.,mm);
#elif VAR==2
  alb=mix(alb,vec3(.85,.83,.77)*(.9+.1*er),.5);
#elif VAR==3
  alb*=vec3(.55,.5,.46)*(.8+.4*fbm(uv+.4,6.));
#endif
}`,
// 19 bone galleries ceiling: low brick vault
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 q,id;float d;blocks(uv,vec2(8.,vs(24.,24.,20.,24.)),.5,q,id,d);
  float r=hash1(id+5.),r2=hash1(id+23.);
  float de=d-.0035-fbm(uv,48.)*.004;
  float face=smoothstep(.0,.007,de);
  float sag=fbm(uv,10.)*.06+r*.05+(q.x*(r-.5)+q.y*(r2-.5))*.04;
  h=mix(.3+fbm(uv,96.)*.1,.8+sag+vn(uv*200.,vec2(200.))*.03,face);
  vec3 br=mix(vec3(.46,.34,.27),vec3(.36,.27,.22),r)*(.74+.5*fbm(uv+r2,18.));
  br=mix(br,br*vec3(1.15,1.1,1.0),step(.8,r2));
  float eff=smoothstep(.62,.8,fbm(uv+.4,7.)+fbm(uv,40.)*.15);
  br=mix(br,vec3(.7,.67,.6)*(.85+.15*fbm(uv,60.)),eff*.6);
  float dust=smoothstep(.3,.9,vn2(uv,28.,2.))*smoothstep(.4,.75,fbm(uv+.2,4.));
  br*=1.-dust*.35;br*=mix(.5,1.,smoothstep(-.002,.012,de));
  vec3 mo=vec3(.6,.56,.48)*(.75+.4*vn(uv*160.,vec2(160.)));
  alb=mix(mo*.6,br,face);
  rough=mix(.97,.9,face);em=0.;
#if VAR==1
  float mm=smoothstep(.55,.72,fbm(uv+.6,5.)+(1.-face)*.2);float mh=vn(uv*180.,vec2(180.));
  alb=mix(alb*.85,mix(vec3(.1,.17,.07),vec3(.21,.29,.11),mh),mm);h+=mm*(.04+mh*.05);rough=mix(rough,1.,mm);
#elif VAR==2
  alb=mix(alb,vec3(.9,.88,.82)*(.88+.12*fbm(uv+r,18.)),.65*face)*(.9+.1*face);
#elif VAR==3
  alb*=mix(vec3(1.),vec3(.3,.27,.25),smoothstep(.2,.8,fbm(uv+.5,3.)+fbm(uv,12.)*.3)*.85);
#endif
}`,
// 20 rustworks wall: riveted iron plates with seams, rust streaks and a pipe run
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float pid=floor(uv.y*2.);
  vec2 pf=vec2(fract(uv.x+.5*mod(pid,2.)),fract(uv.y*2.));
  float ex=min(pf.x,1.-pf.x),ey=min(pf.y,1.-pf.y)*.625;
  float de=min(ex,ey);
  float groove=1.-smoothstep(.003,.008,de-fbm(uv,40.)*.003);
  float lip=smoothstep(.008,.024,de);
  float pr=hash1(vec2(pid,floor(uv.x+.5*mod(pid,2.)))+4.);
  float rvX=length(vec2((fract(pf.x*8.)-.5)*.125,ey-.036)),rvY=length(vec2(ex-.036,(fract(pf.y*5.)-.5)*.125));
  float rvd=min(rvX,rvY);
  float riv=1.-smoothstep(.017,.021,rvd);
  float rivH=riv*sqrt(max(0.,1.-pow(rvd/.021,2.)));
  float pit=smoothstep(.74,.86,vn(uv*140.,vec2(140.)))*smoothstep(.55,.8,fbm(uv,10.));
  h=.78+pr*.04+fbm(uv,20.)*.04+lip*.04-groove*.14+rivH*.16-pit*.06;
  // pipes
  float dy=(uv.y-.78)*1.25,py=1.-smoothstep(.06,.075,abs(dy));
  float dy2=(uv.y-.16)*1.25,py2=1.-smoothstep(.02,.028,abs(dy2));
  float a=fract(uv.x*2.+.5),cdx=min(a,1.-a)*.5;
  float col=(1.-smoothstep(.026,.034,cdx))*(1.-smoothstep(.088,.1,abs(dy)));
  float col2=(1.-smoothstep(.014,.02,cdx))*(1.-smoothstep(.034,.04,abs(dy2)));
  float pipeCyl=sqrt(max(0.,1.-pow(dy/.075,2.))),pipeCyl2=sqrt(max(0.,1.-pow(dy2/.028,2.)));
  h=mix(h,.86+.1*pipeCyl+vn2(uv,2.,200.)*.01,py);h=mix(h,.84+.08*pipeCyl2,py2);h=mix(h,max(h,.97),max(col,col2));
  // rust: seams, rivets and wet streaks
  float stk=smoothstep(.5,.9,vn2(uv,64.,2.)*.7+vn2(uv,21.,1.)*.4)*(1.-pf.y*.8);
  float rbl=smoothstep(.4,.7,fbm(uv+.2,4.)*.7+fbm(uv,22.)*.2);
  float rs=smoothstep(.45,.7,rbl*.7+fbm(uv,64.)*.18+(1.-smoothstep(.0,.07,de))*.3+stk*.22+pit*.3);
  float rh=vn(uv*160.,vec2(160.));
  vec3 steel=mix(vec3(.3,.31,.33),vec3(.2,.22,.25),pr)*(.75+.4*fbm(uv+pr,10.))*(.92+.16*vn2(uv,2.,160.));
  vec3 rust=mix(vec3(.36,.17,.07),vec3(.62,.32,.11),fbm(uv,80.)*.6+rh*.4)*(.72+.45*fbm(uv,24.));
  rust=mix(rust,vec3(.2,.1,.05),stk*.6);
  vec3 pipeC=mix(vec3(.26,.27,.27),vec3(.34,.2,.12),smoothstep(.5,.8,fbm(uv+.5,8.)))*(.6+.6*pipeCyl);
  alb=mix(steel,rust,rs);
  alb=mix(alb,pipeC,max(py,py2)*(1.-.4*rs));alb=mix(alb,pipeC*1.3,max(col,col2));
  alb=mix(alb,vec3(.34,.33,.33)*(.8+.5*smoothstep(.0,.02,.021-rvd))*mix(1.,.8,rs*.6),riv);alb*=mix(.55,1.,smoothstep(.016,.032,rvd));alb*=1.-groove*.6;
  rough=mix(.48,.93,rs);rough=mix(rough,.4,max(py,py2)*(1.-rs));em=0.;
#if VAR==1
  float vg=smoothstep(.35,.7,rs*.8+stk*.4+fbm(uv+.7,7.)*.3);
  alb=mix(alb,mix(vec3(.15,.42,.36),vec3(.4,.68,.58),rh)*(.7+.5*fbm(uv,20.)),vg*.85*smoothstep(.1,.5,rs+pit));
#elif VAR==2
  float oil=smoothstep(.45,.75,fbm(uv+.9,6.)+stk*.5);
  alb*=mix(.8,.45,oil);rough=mix(rough,.18,oil);
#elif VAR==3
  float pn=smoothstep(.62,.68,fbm(uv+.7,8.)+fbm(uv,45.)*.25);
  vec3 paint=mix(vec3(.2,.36,.32),vec3(.26,.44,.38),rh)*(.8+.3*fbm(uv,30.));
  alb=mix(alb,paint,pn*(1.-groove)*(1.-.5*riv));h+=pn*.05;rough=mix(rough,.55,pn);
#endif
}`,
// 21 rustworks floor: diamond plate and open grating, grimed
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec2 pg=uv*2.,pid=floor(pg),pf=fract(pg);
  float rp=hash1(pid+9.);
  float grate=step(vs(.72,.72,.66,.8),rp);
  float ed=min(min(pf.x,1.-pf.x),min(pf.y,1.-pf.y));
  float seam=1.-smoothstep(.004,.01,ed);
  vec2 dp=pf*12.,cl=floor(dp),cf=fract(dp)-.5;
  vec2 lq=mod(cl.x+cl.y,2.)>.5?vec2(cf.y,cf.x):cf;
  vec2 rq=vec2(lq.x+lq.y,lq.x-lq.y)*.7071;
  float ld=length(rq/vec2(.44,.13));
  float loz=1.-smoothstep(.8,1.,ld);
  float lozH=loz*(.5+.5*sqrt(max(0.,1.-ld*ld)));
  // grating
  vec2 gq=fract(pf*vec2(14.,3.))-.5;
  float barM=1.-smoothstep(.2,.26,abs(gq.x));
  float crs=1.-smoothstep(.06,.1,abs(gq.y));
  float gr=max(barM,crs*.9);
  float frame=1.-smoothstep(.03,.045,ed);
  float gm=grate*(1.-frame)*(1.-gr);
  float plate=.78+fbm(uv,20.)*.03+lozH*.1-seam*.12;
  h=mix(plate,.1+fbm(uv,30.)*.06,gm);
  h=mix(h,.84+fbm(uv,50.)*.04,grate*(1.-gm));
  float bolt=1.-smoothstep(.012,.02,length(abs(pf-.5)-.46)*.5);
  h+=bolt*.08*(1.-grate);
  float grime=smoothstep(.4,.75,fbm(uv+.3,5.)*.7+fbm(uv,28.)*.3);
  float rs=smoothstep(.45,.75,fbm(uv+.6,6.)*.6+seam*.3+(1.-smoothstep(.0,.06,ed))*.35+grime*.25);
  vec3 steel=mix(vec3(.32,.33,.35),vec3(.24,.25,.27),rp)*(.72+.5*fbm(uv+rp,12.));
  steel=mix(steel*.7,steel*1.45,lozH*.85);
  vec3 rust=mix(vec3(.4,.2,.09),vec3(.62,.33,.12),vn(uv*140.,vec2(140.)))*(.7+.5*fbm(uv,22.));
  alb=mix(steel,rust,rs*(1.-loz*.35));
  alb=mix(alb,vec3(.07,.065,.06)*(.7+.6*fbm(uv,40.)),grime*.6);
  alb*=1.-seam*.6;
  alb=mix(alb,vec3(.015,.014,.013),gm);
  rough=mix(.45,.9,rs);rough=mix(rough,.28,grime*(1.-rs)*.8);em=0.;
#if VAR==1
  float vg=smoothstep(.3,.7,rs+fbm(uv+.9,6.)*.3);
  alb=mix(alb,mix(vec3(.15,.42,.36),vec3(.38,.66,.56),vn(uv*120.,vec2(120.)))*(.7+.5*fbm(uv,20.)),vg*.8*(1.-gm));
#elif VAR==2
  float oil=smoothstep(.45,.7,fbm(uv+.9,5.));
  alb*=mix(.85,.4,oil);rough=mix(rough,.12,oil);
#elif VAR==3
  float pn=smoothstep(.6,.67,fbm(uv+.7,7.)+fbm(uv,40.)*.2);
  alb=mix(alb,mix(vec3(.5,.48,.2),vec3(.6,.55,.24),vn(uv*90.,vec2(90.)))*(.8+.3*fbm(uv,30.)),pn*(1.-gm)*.9*(1.-seam));h+=pn*.04*(1.-gm);rough=mix(rough,.6,pn);
#endif
}`,
// 22 rustworks ceiling: plates between riveted girders
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=fract(uv.y*2.-.5),gd=min(a,1.-a);
  float gm=1.-smoothstep(.15,.165,gd);
  float flange=smoothstep(.105,.12,gd)*gm;
  float ex=min(fract(uv.x*4.),1.-fract(uv.x*4.))*.5;
  float seam=1.-smoothstep(.004,.01,ex);
  float rvG=length(vec2((fract(uv.x*16.)-.5)*.125,gd-.137));
  float rvP=length(vec2(ex-.03,(fract(uv.y*16.)-.5)*.125));
  float riv=1.-smoothstep(.014,.019,min(rvG*gm+(1.-gm)*9.,rvP*(1.-gm)+gm*9.));
  float rivH=riv*sqrt(max(0.,1.-pow(min(rvG*gm+(1.-gm)*9.,rvP*(1.-gm)+gm*9.)/.019,2.)));
  float pr=hash1(vec2(floor(uv.x*4.),floor(uv.y*2.-.5))+11.);
  h=mix(.78+pr*.05+fbm(uv,18.)*.04-seam*.1,.9+flange*.06+vn(uv*130.,vec2(130.))*.02,gm);
  h+=rivH*.14;
  float stk=smoothstep(.5,.85,vn2(uv,60.,2.)*.7+vn2(uv,17.,1.)*.4);
  float rs=smoothstep(.45,.74,fbm(uv+.2,5.)*.6+fbm(uv,30.)*.2+seam*.2+stk*.35+(1.-gm)*.1);
  vec3 steel=mix(vec3(.3,.31,.33),vec3(.2,.21,.23),pr)*(.7+.5*fbm(uv+pr,14.));
  steel=mix(steel,steel*1.4,rivH*.8);steel=mix(steel,steel*1.25,flange*.6);
  vec3 rust=mix(vec3(.38,.18,.08),vec3(.62,.32,.12),vn(uv*150.,vec2(150.)))*(.7+.5*fbm(uv,22.));
  alb=mix(steel,rust,rs);alb*=1.-seam*.5;alb*=mix(1.,.55,(1.-smoothstep(.12,.17,gd))*smoothstep(.1,.15,gd));
  float soot=smoothstep(.3,.8,fbm(uv+.4,3.)+fbm(uv,12.)*.3);alb*=1.-soot*.4;
  rough=mix(.5,.93,rs);em=0.;
#if VAR==1
  alb=mix(alb,mix(vec3(.15,.42,.36),vec3(.38,.66,.56),vn(uv*120.,vec2(120.)))*(.7+.5*fbm(uv,20.)),smoothstep(.35,.7,rs+fbm(uv+.9,6.)*.25)*.8);
#elif VAR==2
  float oil=smoothstep(.45,.75,fbm(uv+.9,5.)+stk*.4);alb*=mix(.85,.45,oil);rough=mix(rough,.18,oil);
#elif VAR==3
  float pn=smoothstep(.6,.66,fbm(uv+.7,7.)+fbm(uv,40.)*.2);
  alb=mix(alb,mix(vec3(.2,.36,.32),vec3(.26,.44,.38),vn(uv*90.,vec2(90.)))*(.8+.3*fbm(uv,30.)),pn*(1.-seam)*(1.-.5*riv));h+=pn*.04;rough=mix(rough,.55,pn);
#endif
}`,
// 23 glimmer veins wall: dark bedded slate shot through with glowing crystal veins
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float warp=fbm(uv,4.)*.07;
  vec2 wu=uv+vec2(0.,warp);
  float strata=vn2(wu,3.,26.)*.5+vn2(wu,5.,70.)*.3+vn2(wu,9.,150.)*.2;
  vec4 v=voro(uv,4.,1.);float vr=hash1(v.zw+3.);
  float crk=1.-smoothstep(.0,.012,v.y);
  h=.62+strata*.16+fbm(uv,32.)*.05+(vr-.5)*.1-crk*.2;
  vec3 col=vs3(vec3(.2,.95,.85),vec3(.66,.36,1.),vec3(1.,.72,.22),vec3(.3,.7,1.));
  float lvl=vs(1.,1.,1.,.55);
  float vm=smoothstep(vs(.4,.4,.4,.52),vs(.56,.56,.56,.64),fbm(uv+.3,3.));
  float vline=1.-smoothstep(.0,.02,abs(fbm(uv+vec2(.37,.11),4.)-.5)-.0);
  vline*=vm;
  float vthin=(1.-smoothstep(.0,.008,abs(fbm(uv*vec2(1.,1.)+vec2(.11,.52),6.)-.5)))*smoothstep(.5,.62,fbm(uv+.8,3.));
  float cg=crk*step(.72,hash1(v.zw+31.))*.6;
  float g=max(max(vline,vthin*.8),cg)*lvl;
  // crystal pockets along the veins
  vec4 c=voro(uv+.13,8.,1.);float ch=hash1(c.zw+13.);
  vec2 cc=(c.zw+.5+(hash2(c.zw+SEED)-.5))/8.-.13,dd=uv-cc;dd-=floor(dd+.5);
  float ang=atan(dd.y,dd.x);
  float R=.03/cos(mod(ang+ch*6.,1.0472)-.5236);
  float cm=(1.-smoothstep(R*.8,R,length(dd)))*step(vs(.8,.8,.8,.88),ch)*smoothstep(.3,.5,fbm(uv+.3,3.)+.2);
  float facet=hash1(vec2(floor((ang+ch*6.)/1.0472),ch*40.));
  float rim=1.-smoothstep(.0,.9,length(dd)/R);
  h+=vline*.05+vthin*.03;
  h=mix(h,.92+facet*.08-(1.-rim)*.06,cm);
  vec3 rock=mix(vec3(.15,.16,.2),vec3(.09,.1,.13),strata)*(.7+.6*fbm(uv+vr,14.));
  rock*=1.-crk*.5;rock*=mix(.8,1.,smoothstep(.0,.05,v.y));
  float gl=max(g,cm);
  alb=mix(rock,col*(.12+.38*gl)*(.55+.9*facet*cm+.45*(1.-cm)),sat(gl*2.));
  alb=mix(alb,alb+col*.02,vline*.5);
  rough=mix(.82-.15*strata,.25,sat(gl*2.));
  em=gl>.06?.5+.5*sat(gl)*vs(.7,.7,.7,.5):0.;
}`,
// 24 glimmer veins floor: slate slabs with crystal shards and a faint glow in the cracks
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  vec4 v=voro(uv,vs(4.,4.,5.,4.),.9);float r=hash1(v.zw+3.),r2=hash1(v.zw+31.);
  float de=v.y-.006-fbm(uv,32.)*.01;
  float face=smoothstep(.0,.025,de);
  float crk=1.-smoothstep(.0,.014,v.y);
  float lay=vn2(uv+r,6.,60.)*.5+vn2(uv,3.,24.)*.5;
  float surfH=.8+r*.1+fbm(uv,22.)*.05+lay*.04-smoothstep(.55,.8,vn(uv*150.,vec2(150.)))*.03;
  h=mix(.25+fbm(uv,64.)*.1,surfH,face);
  vec3 col=vs3(vec3(.2,.95,.85),vec3(.66,.36,1.),vec3(1.,.72,.22),vec3(.3,.7,1.));
  float lvl=vs(1.,1.,1.,.55);
  float cg=crk*step(.5,hash1(v.zw+57.))*smoothstep(.35,.55,fbm(uv+.4,3.))*.7*lvl;
  vec4 c=voro(uv+.29,9.,1.);float ch=hash1(c.zw+13.);
  vec2 cc=(c.zw+.5+(hash2(c.zw+SEED)-.5))/9.-.29,dd=uv-cc;dd-=floor(dd+.5);
  float ang=atan(dd.y,dd.x);float R=.024/cos(mod(ang+ch*6.,1.0472)-.5236);
  float cm=(1.-smoothstep(R*.8,R,length(dd)))*step(vs(.8,.8,.8,.9),ch);
  float facet=hash1(vec2(floor((ang+ch*6.)/1.0472),ch*40.));
  h=mix(h,.94+facet*.06,cm);
  vec3 sl=mix(vec3(.17,.18,.22),vec3(.11,.12,.15),r)*(.72+.5*fbm(uv+r2,10.));
  sl=mix(sl,sl*1.25,smoothstep(.5,.8,lay)*.5);sl*=mix(.45,1.,smoothstep(-.003,.025,de));
  float gl=max(cg,cm);
  alb=mix(sl,col*(.12+.38*gl)*(.55+.9*facet*cm+.45*(1.-cm)),sat(gl*2.));
  rough=mix(mix(.85,.55,face*lay),.25,sat(gl*2.));
  em=gl>.06?.5+.5*sat(gl)*vs(.6,.6,.6,.45):0.;
}`,
// 25 glimmer veins ceiling: dark rock with sparse glints
`void surf(vec2 uv,out float h,out vec3 alb,out float rough,out float em){
  float a=ridge(uv,4.),b=fbm(uv,8.);vec4 v=voro(uv,5.,1.);
  h=.45+.32*a+.2*b-(1.-smoothstep(0.,.03,v.y))*.14;
  vec3 col=vs3(vec3(.2,.95,.85),vec3(.66,.36,1.),vec3(1.,.72,.22),vec3(.3,.7,1.));
  vec4 s=voro(uv+.21,13.,1.);float sh=hash1(s.zw+7.);
  float gl=(1.-smoothstep(.0,.2,s.x))*step(vs(.84,.84,.84,.93),sh);
  float thin=(1.-smoothstep(.0,.012,abs(fbm(uv+vec2(.4,.7),4.)-.5)))*smoothstep(.52,.64,fbm(uv+.5,3.))*vs(1.,1.,1.,.5)*.6;
  alb=mix(vec3(.17,.18,.22),vec3(.1,.11,.14),b)*(.7+.55*fbm(uv+.4,16.))*mix(.6,1.,smoothstep(.3,.8,h));
  float g=max(gl,thin);h+=g*.04;
  alb=mix(alb,col*(.1+.3*g),sat(g*2.));
  rough=mix(.85,.3,sat(g*2.));
  em=g>.1?.5+.5*sat(g)*.6:0.;
}`,
];

// 1 = floors and ceilings (one tile of texture over two metres), 0 = walls and the gate
const FLAT = [0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1];

const VS = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const mainA = `
void main(){float h,rough,em;vec3 alb;surf(vUv,h,alb,rough,em);
  alb=pow(clamp(alb*TINT,0.,1.),vec3(2.2));
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
  // p = {v: look 0-3, seed: noise offset, tint: [r,g,b]} (all optional). Surfaces are cached per layer and look; sweep() frees the ones a floor stopped using.
  const key = p => p ? `${p.v | 0}|${(p.seed || 0).toFixed(2)}|${(p.tint || [1, 1, 1]).map(c => c.toFixed(3)).join(',')}` : '0|0.00|1.000,1.000,1.000';
  function get(i, p) {
    const ck = i + ':' + key(p);
    if (cache.has(ck)) {const c = cache.get(ck); c.used = true; return c}
    const prev = renderer.getRenderTarget(), tm = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    const tn = (p && p.tint) || [1, 1, 1];
    const head = `#define SEED ${(i * 17.31 + 3.7 + ((p && p.seed) || 0)).toFixed(2)}\n#define VAR ${(p && p.v) | 0}\n#define TINT vec3(${tn.map(c => c.toFixed(4)).join(',')})\n` + LIB + SURF[i];
    const A = target(true);
    run(new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: head + mainA, depthTest: false, depthWrite: false, toneMapped: false}), A);
    let N = null;
    if (wantNormals) {
      const Hh = new THREE.WebGLRenderTarget(size, size, {type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping});
      run(new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: head + mainH, depthTest: false, depthWrite: false, toneMapped: false}), Hh);
      N = target(false);
      // floors and ceilings stretch one tile of texture over two metres, walls over one
      const flat = FLAT[i];
      run(new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: FS_N, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: {tH: {value: Hh.texture}, px: {value: new THREE.Vector2(1 / size, 1 / size)}, bump: {value: flat ? 0.05 : 0.1}}}), N);
      Hh.dispose();
    }
    renderer.toneMapping = tm; renderer.setRenderTarget(prev);
    const out = {map: A.texture, nrm: N ? N.texture : null, rtA: A, rtN: N, used: true};
    cache.set(ck, out);
    return out;
  }
  const sweep = () => {for (const [k, c] of cache) {if (c.used) c.used = false; else {c.rtA.dispose(); if (c.rtN) c.rtN.dispose(); cache.delete(k)}}};
  return {get, key, sweep, count: SURF.length, size: () => cache.size};
}
