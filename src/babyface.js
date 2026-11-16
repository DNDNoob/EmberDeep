// A giant baby face, generated entirely in code: nothing is downloaded and there are no image files.
//
//   createBabyFace(THREE,{quality}) -> {group, update(dt,{camPos,open,t,fade}), dispose(), stats}
//   createFallVoid(THREE,{quality}) -> {group, update(dt,{camPos,t,fade}), dispose()}
//
// The head is a signed distance field made from a short list of hand-placed ellipsoids (see headSDF),
// joined with smooth-min and carved with smooth-max, meshed ONCE with naive surface nets (see meshSDF).
// The mouth opens in the vertex shader: vertices are pushed radially away from the mouth axis with a
// smooth falloff, so there are never any cracks. Eyes are separate glossy spheres with a procedural
// iris that turn to follow the camera; the eyelids are skin shells that are cut away by an ellipse.
//
// Head space: unit-ish metres, +x to the viewer's right, +y up the forehead, +z out of the face.
// The group is scaled (default 13.5) so the head is roughly 27 m across.

/* ---------------------------------------------------------------- the sculpt */

const sq=v=>v*v;
// distance to an ellipsoid (a cheap approximation that is good near the surface)
function ell(x,y,z,cx,cy,cz,rx,ry,rz){
  x=(x-cx)/rx;y=(y-cy)/ry;z=(z-cz)/rz;
  const k0=Math.sqrt(x*x+y*y+z*z),k1=Math.sqrt(sq(x/rx)+sq(y/ry)+sq(z/rz));
  return k1<1e-9?-Math.min(rx,ry,rz):k0*(k0-1)/k1;
}
const smin=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*0.25};
const smax=(a,b,k)=>-smin(-a,-b,k);

// where things sit (head space)
export const FACE={
  mouth:[0,-0.60],          // centre of the mouth, x and y
  lipZ:0.80,                // a little above the lips, in front of the rim: the camera is "in the mouth" below this
  eye:[0.42,-0.10,0.68],    // eyeball centre (mirrored in x)
  eyeR:0.18,                // eyeball radius
  scale:13.5,               // metres per head unit
};

function cavity(x,y,z){return smin(ell(x,y,z,0,-0.605,0.70,0.15,0.08,0.36),ell(Math.abs(x),y,z,0.105,-0.585,0.70,0.075,0.06,0.36),0.05)}   // a small round mouth, corners lifted                       // the carved-out mouth
function tongue(x,y,z){return ell(x,y,z,0,-0.665,0.58,0.105,0.05,0.14)}
function teeth(x,y,z){const ax=Math.abs(x);return Math.min(ell(ax,y,z,0.055,-0.66,0.70,0.022,0.045,0.021),1)}

function headSDF(x,y,z){
  const ax=Math.abs(x);
  // big round cranium
  let d=ell(x,y,z, 0,0.16,-0.04, 0.98,0.98,0.93);
  // chubby cheeks and a small round chin
  d=smin(d,ell(ax,y,z, 0.45,-0.46,0.34, 0.52,0.44,0.46),0.30);
  d=smin(d,ell(x,y,z, 0,-0.80,0.30, 0.55,0.30,0.42),0.25);
  // ears, a button nose, and a plump pad of lip around the mouth
  d=smin(d,ell(ax,y,z, 0.97,-0.15,-0.05, 0.12,0.23,0.17),0.10);
  d=smin(d,ell(x,y,z, 0,-0.31,0.84, 0.105,0.088,0.095),0.09);
  d=smin(d,ell(x,y,z, 0,-0.60,0.62, 0.27,0.155,0.13),0.12);
  // carve: eye sockets, the dimple under the lip, then the mouth itself
  d=smax(d,-ell(ax,y,z, FACE.eye[0],FACE.eye[1],FACE.eye[2],0.188,0.188,0.188),0.05);
  d=smax(d,-ell(x,y,z, 0,-0.76,0.66,0.09,0.05,0.07),0.08);
  d=smax(d,-cavity(x,y,z),0.035);
  // tongue and two little teeth rising out of the cavity floor
  d=smin(d,tongue(x,y,z),0.03);
  d=Math.min(d,teeth(x,y,z));
  // flat cut at the back: the camera only ever sees the front, so the head is not modelled behind z=-0.5
  return Math.max(d,-(z+0.5));
}

/* ---------------------------------------------------------------- naive surface nets */

// Samples f on a regular grid, but only where the surface can be: a coarse lattice finds the cells that might
// hold it, and the fine corners of those cells are evaluated on demand (and the x>=0 half mirrored).
function meshSDF(f,lo,hi,h,post){
  const nx=Math.round((hi[0]-lo[0])/h)|1,ny=Math.round((hi[1]-lo[1])/h)+1,nz=Math.round((hi[2]-lo[2])/h)+1;   // nx odd: x=0 is a grid plane
  const ox=-(nx-1)/2*h,oy=lo[1],oz=lo[2];
  const S=new Float32Array(nx*ny*nz).fill(NaN),mid=(nx-1)>>1;
  const at=(i,j,k)=>{
    if(i>mid)i=nx-1-i;                 // mirror
    const q=(k*ny+j)*nx+i;let v=S[q];
    if(v!==v){v=f(ox+i*h,oy+j*h,oz+k*h);S[q]=v}
    return v;
  };
  const cx=nx-1,cy=ny-1,cz=nz-1,cell=new Int32Array(cx*cy*cz).fill(-1);
  const C=4,band=C*h*0.5*Math.sqrt(3)*1.6;
  const pos=[],act=[];
  const E=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const cv=new Float32Array(8);
  // pass 1: one vertex in every cell the surface passes through
  for(let K=0;K<cz;K+=C)for(let J=0;J<cy;J+=C)for(let I=0;I<cx;I+=C){
    const ci=Math.min(I+C/2,nx-1),cj=Math.min(J+C/2,ny-1),ck=Math.min(K+C/2,nz-1);
    if(Math.abs(at(ci,cj,ck))>band)continue;
    act.push(I,J,K);
    for(let k=K;k<Math.min(K+C,cz);k++)for(let j=J;j<Math.min(J+C,cy);j++)for(let i=I;i<Math.min(I+C,cx);i++){
      let m=0;
      for(let c=0;c<8;c++){const v=at(i+(c&1),j+((c>>1)&1),k+(c>>2));cv[c]=v;if(v<0)m|=1<<c}
      if(m===0||m===255)continue;
      let sx=0,sy=0,sz=0,n=0;
      for(let e=0;e<12;e++){
        const a=E[e][0],b=E[e][1];
        if((cv[a]<0)===(cv[b]<0))continue;
        const t=cv[a]/(cv[a]-cv[b]);
        sx+=(a&1)+((b&1)-(a&1))*t;sy+=((a>>1)&1)+(((b>>1)&1)-((a>>1)&1))*t;sz+=(a>>2)+((b>>2)-(a>>2))*t;n++;
      }
      cell[(k*cy+j)*cx+i]=pos.length/3;
      pos.push(ox+(i+sx/n)*h,oy+(j+sy/n)*h,oz+(k+sz/n)*h);
    }
  }
  // pass 2: a quad across every grid edge that crosses the surface
  const idx=[];let miss=0;
  const quad=(a,b,c,d,flip)=>{
    if(a<0||b<0||c<0||d<0){miss++;return}
    if(flip)idx.push(a,c,b,a,d,c);else idx.push(a,b,c,a,c,d);
  };
  const cid=(i,j,k)=>(i<0||j<0||k<0||i>=cx||j>=cy||k>=cz)?-1:cell[(k*cy+j)*cx+i];
  for(let n=0;n<act.length;n+=3){
    const I=act[n],J=act[n+1],K=act[n+2];
    for(let k=K;k<Math.min(K+C,cz);k++)for(let j=J;j<Math.min(J+C,cy);j++)for(let i=I;i<Math.min(I+C,cx);i++){
      const v0=at(i,j,k),in0=v0<0;
      if(j>0&&k>0){const v1=at(i+1,j,k);if(in0!==(v1<0))quad(cid(i,j-1,k-1),cid(i,j,k-1),cid(i,j,k),cid(i,j-1,k),!in0)}
      if(i>0&&k>0){const v1=at(i,j+1,k);if(in0!==(v1<0))quad(cid(i-1,j,k-1),cid(i-1,j,k),cid(i,j,k),cid(i,j,k-1),!in0)}
      if(i>0&&j>0){const v1=at(i,j,k+1);if(in0!==(v1<0))quad(cid(i-1,j-1,k),cid(i,j-1,k),cid(i,j,k),cid(i-1,j,k),!in0)}
    }
  }
  return {pos:new Float32Array(pos),idx:new Uint32Array(idx),miss};
}

// normals from the SDF gradient (four taps, tetrahedron pattern), and what each vertex is made of
function shadeVerts(m,f,h){
  const n=m.pos.length/3,nor=new Float32Array(n*3),mat=new Float32Array(n*4),e=h*0.6;
  const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
  for(let i=0;i<n;i++){
    const x=m.pos[i*3],y=m.pos[i*3+1],z=m.pos[i*3+2];
    const a=f(x+e,y-e,z-e),b=f(x-e,y-e,z+e),c=f(x-e,y+e,z-e),d=f(x+e,y+e,z+e);
    let gx=a-b-c+d,gy=-a-b+c+d,gz=-a+b-c+d;const l=Math.hypot(gx,gy,gz)||1;
    nor[i*3]=gx/l;nor[i*3+1]=gy/l;nor[i*3+2]=gz/l;
    mat[i*4]=sm(0.05,0.0,cavity(x,y,z));       // inside the mouth
    mat[i*4+1]=sm(0.03,0.0,tongue(x,y,z));     // tongue
    mat[i*4+2]=sm(0.025,0.0,teeth(x,y,z));     // teeth
  }
  return {nor,mat};
}

/* ---------------------------------------------------------------- the mouth opening, shared by shader and JS */

const DIL={R0:0.17,R1:1.1,A:0.50,UP:0.3};   // UP: how much of the push goes upward (the jaw drops, the nose stays)
const DIL_GLSL=`
const float DR0=${DIL.R0.toFixed(3)},DR1=${DIL.R1.toFixed(3)},DA=${DIL.A.toFixed(3)},DUP=${DIL.UP.toFixed(3)};
// radial push away from the mouth axis. D: how far a point at radius r moves, lr: stretch along the radius
void dilate(float r,float o,float w,out float D,out float lr){
  float u=clamp(r/DR0,0.,1.),v=clamp((r-DR0)/(DR1-DR0),0.,1.);
  float a=u*u*(3.-2.*u),b=1.-v*v*(3.-2.*v);
  float da=6.*u*(1.-u)/DR0*(r<DR0?1.:0.),db=-6.*v*(1.-v)/(DR1-DR0)*(r>DR0?1.:0.);
  D=w*DA*o*a*b;lr=1.+w*DA*o*(da*b+a*db);
}`;
function dilateJS(x,y,o){   // same map for a point (used to carry the eyes along)
  const q0=x-FACE.mouth[0],q1=y-FACE.mouth[1],r=Math.hypot(q0,q1)||1e-6;
  const u=Math.min(1,r/DIL.R0),v=Math.min(1,Math.max(0,(r-DIL.R0)/(DIL.R1-DIL.R0)));
  const w=DIL.UP+(1-DIL.UP)*(t=>t*t*(3-2*t))(Math.min(1,Math.max(0,(-q1/r+0.3)/0.6)));
  const D=w*DIL.A*o*(u*u*(3-2*u))*(1-v*v*(3-2*v));
  return [x+q0/r*D,y+q1/r*D];
}

/* ---------------------------------------------------------------- shading */

const COMMON_GLSL=`
float hash(vec3 p){p=fract(p*0.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float blob(vec3 d,vec3 k){d*=k;return exp(-dot(d,d));}
// one warm nursery lamp from above and to the right of the viewer, one cool accent on the rim
const vec3 KEY_DIR=vec3(0.50,0.62,0.60);
const vec3 KEY_COL=vec3(1.55,1.05,0.62);
const vec3 RIM_COL=vec3(0.18,0.62,1.05);
const vec3 AMB=vec3(0.20,0.11,0.12);

vec3 skinAlb(vec3 r){
  vec3 base=vec3(0.80,0.42,0.31);
  #ifndef LOW
  base*=0.93+0.14*(vn(r*9.)*0.6+vn(r*23.)*0.4);
  base=mix(base,vec3(0.72,0.36,0.34),0.35*vn(r*3.+4.));
  #endif
  vec3 ar=vec3(abs(r.x),r.y,r.z);
  base=mix(base,vec3(0.90,0.27,0.25),0.55*blob(ar-vec3(0.56,-0.38,0.62),vec3(2.2,2.6,1.3)));   // rosy cheeks
  base=mix(base,vec3(0.92,0.33,0.29),0.50*blob(r-vec3(0.,-0.30,0.90),vec3(6.)));                // warm nose
  base=mix(base,vec3(0.78,0.30,0.28),0.25*blob(ar-vec3(0.42,0.16,0.80),vec3(3.,6.,4.)));        // pink brow
  vec2 m=(r.xy-vec2(0.,-0.60))/vec2(0.17,0.105);float e=length(m);                             // lips
  float lip=smoothstep(0.85,1.1,e)*(1.-smoothstep(1.35,1.9,e));
  base=mix(base,vec3(0.80,0.24,0.25),0.8*lip);
  vec2 bb=vec2(ar.x-0.40,r.y-0.215-0.05*(ar.x-0.40));                                           // faint brows
  base=mix(base,vec3(0.36,0.18,0.10),0.55*smoothstep(0.03,0.0,abs(bb.y))*smoothstep(0.26,0.12,abs(bb.x))*step(0.5,r.z));
  base=mix(base,vec3(0.25,0.06,0.07),0.85*blob(ar-vec3(0.036,-0.356,0.90),vec3(30.)));          // nostrils
  return base;
}
// wrap lighting with a warm glow at the terminator (fake subsurface), plus a cool rim
vec3 lightSkin(vec3 alb,vec3 N,vec3 V,float gloss,float rimK){
  vec3 L=normalize(KEY_DIR);float nl=dot(N,L);
  float wrap=clamp((nl+0.55)/1.55,0.,1.);
  vec3 col=alb*(AMB+KEY_COL*wrap*wrap);
  #ifndef LOW
  col+=alb*vec3(0.95,0.22,0.10)*0.55*smoothstep(-0.25,0.25,nl)*(1.-smoothstep(0.25,0.8,nl));
  #endif
  float fr=pow(1.-clamp(dot(N,V),0.,1.),3.);
  col+=RIM_COL*fr*(0.55+0.45*clamp(0.5-nl,0.,1.))*1.15*rimK;
  col+=KEY_COL*gloss*pow(max(dot(N,normalize(L+V)),0.),38.)*0.5;
  return col;
}`;

const HEAD_VS=`
attribute vec4 aMat;
uniform float uOpen;
varying vec3 vRest,vP,vN;varying vec4 vMat;
${DIL_GLSL}
void main(){
  vec3 p=position,n=normal;
  vec2 q=p.xy-vec2(${FACE.mouth[0].toFixed(3)},${FACE.mouth[1].toFixed(3)});
  float r=length(q)+1e-5;vec2 d=q/r,t=vec2(-d.y,d.x);
  float w=mix(DUP,1.,smoothstep(-0.3,0.3,-d.y));
  float D,lr;dilate(r,uOpen,w,D,lr);
  float lt=(r+D)/r;
  n=normalize(vec3(d*(dot(n.xy,d)/lr)+t*(dot(n.xy,t)/lt),n.z));
  p.xy+=d*D;
  vRest=position;vP=p;vN=n;vMat=aMat;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const HEAD_FS=`
uniform vec3 uCamL;uniform float uScale,uFade,uTime;
varying vec3 vRest,vP,vN;varying vec4 vMat;
${COMMON_GLSL}
void main(){
  vec3 N=normalize(vN);vec3 Vv=uCamL-vP;float dl=length(Vv);vec3 V=Vv/dl;
  vec3 alb=skinAlb(vRest);
  if(vMat.w>0.5)alb=vec3(0.30,0.15,0.07);                                    // the hair curl
  float inM=vMat.x;
  alb=mix(alb,vec3(0.52,0.09,0.12),inM);                                      // wet red inside the mouth
  alb=mix(alb,vec3(0.86,0.34,0.36),vMat.y);                                   // tongue
  alb=mix(alb,vec3(0.96,0.90,0.78),vMat.z);                                   // teeth
  float gloss=0.35+0.9*max(inM,vMat.y)+0.5*vMat.z;
  vec3 col=lightSkin(alb,N,V,gloss,mix(0.2,1.,smoothstep(0.6,1.0,length(vRest.xy*vec2(1.,0.8)))));
  col*=mix(1.,0.10+0.9*smoothstep(0.30,0.74,vRest.z),inM*(1.-vMat.z));         // the throat is dark
  float fade=smoothstep(150.,78.,dl*uScale)*uFade;                             // emerge from the black
  gl_FragColor=vec4(col*fade,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// shared by eyeball and eyelid: both live in the eye's own space, and are lit in head space
const EYE_VS=`
uniform mat4 uM;
varying vec3 vL,vP,vN;
void main(){
  vL=position;vP=(uM*vec4(position,1.)).xyz;vN=mat3(uM)*normal;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;
const LID_GLSL=`
uniform vec2 uLid;                        // how far the eye is open upwards and downwards
float lidE(vec3 n){                       // <1 inside the opening, 1 at the lid edge
  float up=max(uLid.x,0.002),dn=max(uLid.y,0.002);
  float y=n.y+0.02;return length(vec2(n.x/0.88,y/(y>0.?up:dn)));
}`;
const EYE_FS=`
uniform vec3 uCamL;uniform float uScale,uFade,uPupil;
varying vec3 vL,vP,vN;
${COMMON_GLSL}${LID_GLSL}
void main(){
  vec3 n=normalize(vL),N=normalize(vN);vec3 Vv=uCamL-vP;float dl=length(Vv);vec3 V=Vv/dl;
  float th=acos(clamp(n.z,-1.,1.)),ph=atan(n.y,n.x);
  float ir=th/0.62;
  // sclera, softly shaded toward the corners
  vec3 col=mix(vec3(0.95,0.90,0.84),vec3(0.78,0.62,0.58),smoothstep(0.9,1.5,th));
  #ifndef LOW
  col=mix(col,vec3(0.8,0.35,0.3),0.12*smoothstep(0.5,0.0,abs(vn(vec3(ph*3.,th*9.,1.))-0.62))*smoothstep(1.0,1.5,th));
  float fib=vn(vec3(ph*9.,ir*4.,2.))*0.6+vn(vec3(ph*26.,ir*8.,5.))*0.4;
  #else
  float fib=0.5;
  #endif
  // iris: warm radial fibres, a dark ring at the limbus, a big soft pupil
  vec3 ic=mix(vec3(0.46,0.22,0.07),vec3(0.16,0.08,0.04),smoothstep(0.25,1.0,ir));
  ic=mix(ic,vec3(0.78,0.45,0.16),0.65*fib*(1.-smoothstep(0.35,0.95,ir)));
  ic*=0.7+0.6*fib;
  ic=mix(ic,vec3(0.03,0.015,0.01),smoothstep(0.80,1.0,ir));
  float pr=uPupil;
  ic=mix(ic,vec3(0.005),smoothstep(pr+0.06,pr-0.03,ir));
  col=mix(col,ic,smoothstep(1.03,0.97,ir));
  // light, then the lids' shadow on the ball
  vec3 L=normalize(KEY_DIR);float nl=dot(N,L);
  vec3 lit=col*(AMB*0.8+KEY_COL*(0.25+0.75*clamp((nl+0.4)/1.4,0.,1.)));
  lit*=mix(0.25,1.,smoothstep(1.0,0.45,lidE(n)));
  // glossy cornea: a bright window catch-light from the lamp and a small cool one from below
  vec3 R1=reflect(-L,N);float s1=pow(max(dot(R1,V),0.),260.);
  vec3 R2=reflect(-normalize(vec3(-0.55,-0.35,0.75)),N);float s2=pow(max(dot(R2,V),0.),150.);
  lit+=vec3(1.0,0.95,0.85)*s1*7.+vec3(0.5,0.8,1.1)*s2*2.;
  lit+=RIM_COL*pow(1.-clamp(dot(N,V),0.,1.),4.)*0.5;
  float fade=smoothstep(150.,78.,dl*uScale)*uFade;
  gl_FragColor=vec4(lit*fade,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const LID_FS=`
uniform vec3 uCamL;uniform float uScale,uFade;
varying vec3 vL,vP,vN;
${COMMON_GLSL}${LID_GLSL}
void main(){
  vec3 n=normalize(vL);float e=lidE(n);
  if(e<1.0)discard;
  vec3 N=normalize(vN);vec3 Vv=uCamL-vP;float dl=length(Vv);vec3 V=Vv/dl;
  vec3 alb=skinAlb(vP);
  alb=mix(alb,vec3(0.07,0.03,0.03),0.9*(1.-smoothstep(1.0,1.13,e)));            // lash line
  vec3 col=lightSkin(alb,N,V,0.3,0.15);
  float fade=smoothstep(150.,78.,dl*uScale)*uFade;
  gl_FragColor=vec4(col*fade,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* ---------------------------------------------------------------- the face */

export function createBabyFace(THREE,{quality=2,scale=FACE.scale}={}){
  const hi=quality>0,t0=performance.now();
  const h=hi?0.0258:0.045;
  // build the head once
  const lo=[-1.18,-1.2,-0.6],hiB=[1.18,1.26,1.08];
  const m=meshSDF(headSDF,lo,hiB,h);
  const sh=shadeVerts(m,headSDF,h);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(m.pos,3));
  geo.setAttribute('normal',new THREE.BufferAttribute(sh.nor,3));
  geo.setAttribute('aMat',new THREE.BufferAttribute(sh.mat,4));
  geo.setIndex(new THREE.BufferAttribute(m.idx,1));
  geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0.2),2.2);
  const def=hi?'':'#define LOW\n';
  const U={uCamL:{value:new THREE.Vector3(0,0,50)},uScale:{value:scale},uFade:{value:1},uTime:{value:0}};
  const headMat=new THREE.ShaderMaterial({uniforms:{...U,uOpen:{value:0}},vertexShader:HEAD_VS,fragmentShader:def+HEAD_FS});
  const group=new THREE.Group();group.scale.setScalar(scale);
  const head=new THREE.Mesh(geo,headMat);head.frustumCulled=false;group.add(head);

  // one wispy curl of hair on the crown (tube, thinned toward the tip)
  const pts=[];for(let i=0;i<=24;i++){const s=i/24,a=-1.15+s*6.0,r=0.19*(1-0.72*s);pts.push(new THREE.Vector3(-0.02+r*Math.cos(a),1.28+r*Math.sin(a)-0.02,0.20+0.05*s))}
  const curve=new THREE.CatmullRomCurve3(pts),TUB=48,RAD=8;
  const hg=new THREE.TubeGeometry(curve,TUB,0.034,RAD,false),hp=hg.attributes.position;
  for(let i=0;i<hp.count;i++){
    const ring=Math.floor(i/(RAD+1)),c=curve.getPointAt(ring/TUB),k=1-0.75*ring/TUB;
    hp.setXYZ(i,c.x+(hp.getX(i)-c.x)*k,c.y+(hp.getY(i)-c.y)*k,c.z+(hp.getZ(i)-c.z)*k);
  }
  const hm=new Float32Array(hp.count*4);for(let i=0;i<hp.count;i++)hm[i*4+3]=1;
  hg.setAttribute('aMat',new THREE.BufferAttribute(hm,4));
  const hair=new THREE.Mesh(hg,headMat);hair.frustumCulled=false;group.add(hair);

  // eyes: a glossy ball that turns, and a skin shell that is cut away to make the opening
  const seg=hi?[36,24]:[18,12],R=FACE.eyeR;
  const ballG=new THREE.SphereGeometry(R,seg[0],seg[1]).rotateX(Math.PI/2);   // SphereGeometry's poles are on +y: turn the pole to +z, the gaze axis
  const lidG=new THREE.SphereGeometry(R*1.12,seg[0],seg[1]).rotateX(Math.PI/2);
  const eyes=[-1,1].map(sg=>{
    const eu={uM:{value:new THREE.Matrix4()},uPupil:{value:0.40}},lu={uM:{value:new THREE.Matrix4()},uLid:{value:new THREE.Vector2(0.6,0.4)}};
    const ballM=new THREE.ShaderMaterial({uniforms:{...U,...eu,uLid:lu.uLid},vertexShader:EYE_VS,fragmentShader:def+EYE_FS});
    const lidM=new THREE.ShaderMaterial({uniforms:{...U,...lu},vertexShader:EYE_VS,fragmentShader:def+LID_FS});
    const ball=new THREE.Mesh(ballG,ballM),lid=new THREE.Mesh(lidG,lidM);
    ball.frustumCulled=lid.frustumCulled=false;
    group.add(ball,lid);
    return {sg,ball,lid,ballM,lidM,yaw:0,pitch:0,c:new THREE.Vector3()};
  });

  // blink + expression state
  const tmp=new THREE.Vector3(),inv=new THREE.Matrix4();
  let nextBlink=1.4,blink=-1,wide=0;
  
  function update(dt,{camPos,open=0,t=0,fade=1}={}){
    const o=Math.min(1,Math.max(0,open));
    headMat.uniforms.uOpen.value=o;U.uFade.value=fade;U.uTime.value=t;
    group.updateMatrixWorld(true);
    if(camPos){inv.copy(group.matrixWorld).invert();U.uCamL.value.copy(camPos).applyMatrix4(inv)}
    // blinking: every few seconds, a quick down and up
    nextBlink-=dt;
    if(blink<0&&nextBlink<=0){blink=0;nextBlink=1.6+((Math.sin(t*12.9898)*43758.5453)%1+1)%1*2.6}
    let closed=0;
    if(blink>=0){blink+=dt;const b=blink/0.22;closed=b<1?Math.sin(b*Math.PI):0;if(b>=1)blink=-1}
    wide+=((o>0.25?1:0)-wide)*Math.min(1,dt*3);                    // eyes go wide as the mouth does
    const top=0.68+0.14*wide,bot=0.40+0.04*wide;                    // happy: cheeks push the lower lid up
    for(const E of eyes){
      const ex=E.sg*FACE.eye[0],[mx,my]=dilateJS(ex,FACE.eye[1],o);
      E.c.set(mx,my,FACE.eye[2]);
      // look at the camera, but never roll the eye further than a person could
      tmp.copy(U.uCamL.value).sub(E.c);
      const ty=Math.max(-0.5,Math.min(0.5,Math.atan2(tmp.x,tmp.z))),tp=Math.max(-0.38,Math.min(0.42,Math.atan2(tmp.y,Math.hypot(tmp.x,tmp.z))));
      const k=Math.min(1,dt*14);E.yaw+=(ty-E.yaw)*k;E.pitch+=(tp-E.pitch)*k;
      E.ball.position.copy(E.c);E.ball.rotation.set(-E.pitch,E.yaw,0,'YXZ');E.ball.updateMatrix();
      E.lid.position.copy(E.c);E.lid.updateMatrix();
      E.ballM.uniforms.uM.value.copy(E.ball.matrix);E.lidM.uniforms.uM.value.copy(E.lid.matrix);
      const lu=E.lidM.uniforms.uLid.value;lu.set(top*(1-closed),bot*(1-closed)+0.0);
      E.ballM.uniforms.uPupil.value=0.36+0.10*wide;
    }
  }
  const stats={verts:m.pos.length/3+hp.count,headVerts:m.pos.length/3,tris:m.idx.length/3,miss:m.miss,buildMs:performance.now()-t0};
  function dispose(){geo.dispose();hg.dispose();ballG.dispose();lidG.dispose();headMat.dispose();for(const E of eyes){E.ballM.dispose();E.lidM.dispose()}}
  return {group,update,dispose,stats,lipZ:FACE.lipZ,mouth:FACE.mouth,scale};
}

/* ---------------------------------------------------------------- the void: a faint grid to fall through, and drifting motes */

export function createFallVoid(THREE,{quality=2}={}){
  const hi=quality>0,group=new THREE.Group();group.frustumCulled=false;
  const U={uCam:{value:new THREE.Vector3()},uTime:{value:0},uFade:{value:1}};
  // the underside of the map: a thin sheet of wireframe, stretched across 240 m
  const N=60,S=4,half=N*S/2,gp=[];
  for(let i=0;i<=N;i++){const a=-half+i*S;gp.push(a,0,-half,a,0,half,-half,0,a,half,0,a)}
  const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(gp,3));
  const gm=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform vec3 uCam;varying float vA;
void main(){vec3 p=position;p.xz+=floor(uCam.xz/${S}.+0.5)*${S}.;vec4 w=modelMatrix*vec4(p,1.);vA=1.-smoothstep(10.,95.,length(w.xz-uCam.xz));
  gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float uFade;varying float vA;void main(){gl_FragColor=vec4(vec3(0.16,0.34,0.52)*vA*uFade*0.9,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`});
  const grid=new THREE.LineSegments(gg,gm);grid.frustumCulled=false;group.add(grid);
  // motes: world-fixed specks that wrap around the camera, so falling makes them stream upward
  const n=hi?420:150,mp=new Float32Array(n*3),ms=new Float32Array(n);
  let sd=12345;const rnd=()=>(sd=(sd*1664525+1013904223)>>>0)/4294967296;
  for(let i=0;i<n;i++){mp[i*3]=(rnd()-0.5)*2;mp[i*3+1]=rnd();mp[i*3+2]=(rnd()-0.5)*2;ms[i]=0.4+rnd()*rnd()*2.2}
  const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(mp,3));pg.setAttribute('aSize',new THREE.BufferAttribute(ms,1));
  const pm=new THREE.ShaderMaterial({uniforms:{...U,uPx:{value:1}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform vec3 uCam;uniform float uTime,uPx;attribute float aSize;varying float vA;
void main(){
  const float H=70.,RAD=22.;
  vec3 p=position;vec3 w;
  w.xz=uCam.xz+p.xz*RAD+vec2(sin(uTime*0.4+p.y*40.),cos(uTime*0.33+p.x*30.))*0.8;
  w.y=uCam.y+mod(p.y*H-uCam.y,H)-H*0.5;
  vec4 mv=viewMatrix*vec4(w,1.);float d=-mv.z;
  vA=smoothstep(0.5,3.,d)*(1.-smoothstep(H*0.3,H*0.5,abs(w.y-uCam.y)))*0.7;
  gl_PointSize=clamp(aSize*uPx*38./max(d,1.),1.,7.*uPx);
  gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float uFade;varying float vA;void main(){float r=length(gl_PointCoord-0.5)*2.;float a=smoothstep(1.,0.2,r)*vA*uFade;
  gl_FragColor=vec4(vec3(0.95,0.72,0.45)*a,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`});
  const motes=new THREE.Points(pg,pm);motes.frustumCulled=false;group.add(motes);
  return {group,
    update(dt,{camPos,t=0,fade=1,gridY=-5,px=1}={}){
      if(camPos)U.uCam.value.copy(camPos);U.uTime.value=t;U.uFade.value=fade;grid.position.y=gridY;pm.uniforms.uPx.value=px;
    },
    dispose(){gg.dispose();pg.dispose();gm.dispose();pm.dispose()}};
}
