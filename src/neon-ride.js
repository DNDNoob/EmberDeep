// The Neon Run: a dark ride behind a strange door. You sit in a little cart that rolls itself along a track through a black void lit
// only by neon: tubes along the barriers, arches overhead, a glowing grid underfoot, planets and a saucer hanging in the dark. Wooden
// alien cutouts flip up on hinges as the cart comes near. Shoot them with the cart's blaster (Use: E / click / X / tap; hold to keep
// firing) for points: little ones further off are worth more, the saucers that slide on wires more still, the big one near the end
// takes three hits. The painted astronauts are friends, and cost you points. At the end the cart rolls into the prize counter: the
// better the score, the better the prize (NEON_PRIZES), and Use steps you out through the exit beside it.
// Everything is drawn from math at load time (canvas art for the cutouts and signs), and the course comes from the visit's seed, so a
// watcher rebuilds the same ride and follows the rider's snapshots (where the cart is, where they look, the score, what they hit).
import * as THREE from 'three';
import {MOVE,lookStep} from './movement.js';

export const NEON={speed:3.3,start:3,eye:1.22,barrier:2.05,popAhead:13,stayBehind:2.5,cooldown:0.2,hold:0.3,steps:24,step:9};
// the prizes, from the least to the best: the highest one whose score you reach is yours
export const NEON_PRIZES=[
  {min:0,name:'Glow Sticker',gems:3},
  {min:100,name:'Rubber Alien',gems:10},
  {min:220,name:'Ray Gun Keychain',gems:15,flash:2},
  {min:360,name:'Lava Lamp',gems:25,flash:2,potion:2},
  {min:520,name:'Plush Martian',gems:40,flash:3,ward:1,potion:3},
  {min:700,name:'Golden Saucer',gems:60,flash:3,ward:1,potion:4,heart:1},
];
export const neonTier=score=>{let t=0;for(let i=0;i<NEON_PRIZES.length;i++)if(score>=NEON_PRIZES[i].min)t=i;return t};
// what each cutout is worth
export const NEON_PTS={alien:10,far:5,saucer:50,astronaut:-30,boss:100};
const rng=seed=>{let a=seed>>>0||1;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
// the course: the track's points, and the cutouts along it (s: metres along the track where it stands, side, how far off, what it is)
export function neonCourse(seed){
  const r=rng(seed),pts=[new THREE.Vector3(0,0,8),new THREE.Vector3(0,0,0)];let h=0,x=0,z=0;
  for(let i=1;i<=NEON.steps;i++){
    const last=i>NEON.steps-3;   // a straight run in to the prize counter
    if(!last)h=THREE.MathUtils.clamp(h+(r()-0.5)*1.1,-1.5,1.5);
    x+=Math.sin(h)*NEON.step;z-=Math.cos(h)*NEON.step;pts.push(new THREE.Vector3(x,0,z));
  }
  const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal');curve.arcLengthDivisions=3000;
  const L=curve.getLength(),targets=[];let id=0;
  for(let s=16,i=0;s<L-22;s+=3.8+r()*1.4,i++){   // evenly enough that every course is worth about the same
    const k=r(),side=r()<0.5?-1:1;
    const kind=i%7===3?'saucer':k<0.14?'astronaut':'alien';
    const off=kind==='saucer'?3.2+r()*3:2.9+r()*4.8;
    targets.push({id:id++,s,side,off,kind,art:kind==='alien'?(r()*4)|0:0,h:kind==='saucer'?2.3+r()*0.9:0,sw:kind==='saucer'?1.2+r()*1.4:0,ph:r()*6.28});
    if(r()<0.22&&kind==='alien')targets.push({id:id++,s:s+0.6,side:-side,off:3+r()*3.5,kind:'alien',art:(r()*4)|0,h:0,sw:0,ph:r()*6.28});   // now and then a pair
  }
  targets.push({id:id++,s:L-19,side:r()<0.5?-1:1,off:5.2,kind:'boss',art:0,h:0,sw:0,ph:0,hp:3});
  return {curve,L,targets};
}
// the whole score you can get, for the tests: every alien far off, every saucer, the boss, no astronauts
export const neonMax=c=>c.targets.reduce((a,t)=>a+(t.kind==='alien'?NEON_PTS.alien+(t.off>6?NEON_PTS.far:0):t.kind==='saucer'?NEON_PTS.saucer:t.kind==='boss'?NEON_PTS.boss:0),0);

function canvasTex(w,h,draw){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
// ---- the cutouts' paint: a plywood silhouette with a bold painted figure on the front (fluorescent paint that glows under the black light)
const ply=(x,w,h,shape)=>{   // the board: a pale wood silhouette with grain, then the shape's own outline
  x.save();shape();x.clip();x.fillStyle='#c79a62';x.fillRect(0,0,w,h);
  for(let i=0;i<70;i++){x.strokeStyle=`rgba(${110+((i*37)%40)},${70+((i*13)%30)},30,${0.15+((i*7)%10)/40})`;x.lineWidth=1+((i*5)%3);x.beginPath();const y=(i*13.7)%h;x.moveTo(0,y);x.bezierCurveTo(w*0.3,y+6,w*0.7,y-6,w,y+3);x.stroke()}
  x.restore();
};
const ART={
  // 0-3 aliens, 4 astronaut, 5 saucer, 6 the big one
  0:(x,w,h)=>{   // a gray: huge head, black almond eyes, thin body
    const sh=()=>{x.beginPath();x.ellipse(w/2,h*0.27,w*0.36,h*0.24,0,0,6.28);x.rect(w*0.42,h*0.48,w*0.16,h*0.08);x.ellipse(w/2,h*0.72,w*0.2,h*0.2,0,0,6.28);x.rect(w*0.18,h*0.6,w*0.64,h*0.06);x.rect(w*0.36,h*0.86,w*0.1,h*0.14);x.rect(w*0.54,h*0.86,w*0.1,h*0.14)};
    ply(x,w,h,sh);x.fillStyle='#39ff6e';x.beginPath();x.ellipse(w/2,h*0.27,w*0.33,h*0.21,0,0,6.28);x.fill();x.fillRect(w*0.44,h*0.48,w*0.12,h*0.08);
    x.beginPath();x.ellipse(w/2,h*0.72,w*0.17,h*0.17,0,0,6.28);x.fill();x.fillRect(w*0.2,h*0.61,w*0.6,h*0.04);x.fillRect(w*0.38,h*0.86,w*0.06,h*0.13);x.fillRect(w*0.56,h*0.86,w*0.06,h*0.13);
    x.fillStyle='#050505';for(const s of[-1,1]){x.beginPath();x.ellipse(w/2+s*w*0.14,h*0.29,w*0.1,h*0.05,s*0.5,0,6.28);x.fill()}
    x.fillStyle='#ffffff';for(const s of[-1,1]){x.beginPath();x.arc(w/2+s*w*0.12,h*0.28,w*0.02,0,6.28);x.fill()}
    x.strokeStyle='#0a3a14';x.lineWidth=3;x.beginPath();x.arc(w/2,h*0.38,w*0.06,0.2,2.9);x.stroke()},
  1:(x,w,h)=>{   // an octopus: round head, three eyes, wavy tentacles
    const sh=()=>{x.beginPath();x.arc(w/2,h*0.35,w*0.38,0,6.28);for(let i=0;i<5;i++)x.rect(w*(0.14+i*0.15),h*0.55,w*0.11,h*0.42)};
    ply(x,w,h,sh);x.fillStyle='#ff3ad6';x.beginPath();x.arc(w/2,h*0.35,w*0.35,0,6.28);x.fill();
    for(let i=0;i<5;i++){x.beginPath();x.moveTo(w*(0.16+i*0.15),h*0.55);for(let y=0;y<=8;y++)x.lineTo(w*(0.16+i*0.15)+Math.sin(y*1.3+i)*6,h*(0.55+y*0.05));x.lineTo(w*(0.23+i*0.15),h*0.95);x.lineTo(w*(0.23+i*0.15),h*0.55);x.fill()}
    x.fillStyle='#ffef3a';for(const [a,b,rr] of[[0.36,0.3,0.08],[0.64,0.3,0.08],[0.5,0.18,0.06]]){x.beginPath();x.arc(w*a,h*b,w*rr,0,6.28);x.fill()}
    x.fillStyle='#120012';for(const [a,b,rr] of[[0.36,0.31,0.04],[0.64,0.31,0.04],[0.5,0.19,0.03]]){x.beginPath();x.arc(w*a,h*b,w*rr,0,6.28);x.fill()}
    x.fillStyle='#ffd1f5';for(let i=0;i<7;i++){x.beginPath();x.arc(w*(0.3+((i*37)%40)/100),h*(0.42+((i*13)%10)/100),w*0.025,0,6.28);x.fill()}},
  2:(x,w,h)=>{   // a one-eyed blob on an antenna
    const sh=()=>{x.beginPath();x.ellipse(w/2,h*0.62,w*0.42,h*0.34,0,0,6.28);x.rect(w*0.47,h*0.1,w*0.06,h*0.2);x.arc(w/2,h*0.1,w*0.08,0,6.28)};
    ply(x,w,h,sh);x.fillStyle='#b6ff2a';x.beginPath();x.ellipse(w/2,h*0.63,w*0.39,h*0.31,0,0,6.28);x.fill();x.fillRect(w*0.48,h*0.12,w*0.04,h*0.2);
    x.fillStyle='#ff8a1a';x.beginPath();x.arc(w/2,h*0.1,w*0.06,0,6.28);x.fill();
    x.fillStyle='#fff';x.beginPath();x.arc(w/2,h*0.56,w*0.17,0,6.28);x.fill();x.fillStyle='#e0142a';x.beginPath();x.arc(w/2,h*0.57,w*0.09,0,6.28);x.fill();x.fillStyle='#000';x.beginPath();x.arc(w/2,h*0.57,w*0.045,0,6.28);x.fill();
    x.strokeStyle='#1c3a00';x.lineWidth=5;x.beginPath();x.arc(w/2,h*0.74,w*0.15,0.3,2.84);x.stroke();
    x.fillStyle='#fff';for(let i=0;i<4;i++)x.fillRect(w*(0.4+i*0.055),h*0.79,w*0.035,h*0.04)},
  3:(x,w,h)=>{   // a bug: four arms, mandibles, a striped body
    const sh=()=>{x.beginPath();x.ellipse(w/2,h*0.22,w*0.22,h*0.16,0,0,6.28);x.ellipse(w/2,h*0.62,w*0.24,h*0.32,0,0,6.28);x.rect(w*0.06,h*0.42,w*0.88,h*0.06);x.rect(w*0.1,h*0.58,w*0.8,h*0.06)};
    ply(x,w,h,sh);x.fillStyle='#2af0ff';x.beginPath();x.ellipse(w/2,h*0.22,w*0.2,h*0.14,0,0,6.28);x.fill();x.beginPath();x.ellipse(w/2,h*0.62,w*0.21,h*0.29,0,0,6.28);x.fill();
    x.fillRect(w*0.08,h*0.43,w*0.84,h*0.04);x.fillRect(w*0.12,h*0.59,w*0.76,h*0.04);
    x.fillStyle='#0a2a6a';for(let i=0;i<4;i++)x.fillRect(w*0.32,h*(0.47+i*0.09),w*0.36,h*0.035);
    x.fillStyle='#ff2a5a';for(const s of[-1,1]){x.beginPath();x.arc(w/2+s*w*0.09,h*0.2,w*0.05,0,6.28);x.fill()}
    x.strokeStyle='#ffffff';x.lineWidth=4;for(const s of[-1,1]){x.beginPath();x.moveTo(w/2+s*w*0.05,h*0.32);x.quadraticCurveTo(w/2+s*w*0.12,h*0.4,w/2+s*w*0.02,h*0.42);x.stroke()}},
  4:(x,w,h)=>{   // an astronaut, waving: a friend
    const sh=()=>{x.beginPath();x.arc(w/2,h*0.22,w*0.24,0,6.28);x.rect(w*0.24,h*0.4,w*0.52,h*0.36);x.rect(w*0.06,h*0.2,w*0.18,h*0.32);x.rect(w*0.76,h*0.42,w*0.16,h*0.3);x.rect(w*0.28,h*0.74,w*0.18,h*0.26);x.rect(w*0.54,h*0.74,w*0.18,h*0.26)};
    ply(x,w,h,sh);x.fillStyle='#f4f6fa';x.beginPath();x.arc(w/2,h*0.22,w*0.22,0,6.28);x.fill();x.fillRect(w*0.26,h*0.41,w*0.48,h*0.34);x.fillRect(w*0.08,h*0.21,w*0.14,h*0.3);x.fillRect(w*0.78,h*0.43,w*0.12,h*0.28);x.fillRect(w*0.3,h*0.75,w*0.14,h*0.24);x.fillRect(w*0.56,h*0.75,w*0.14,h*0.24);
    x.fillStyle='#ffb21a';x.beginPath();x.ellipse(w/2,h*0.22,w*0.15,h*0.09,0,0,6.28);x.fill();x.fillStyle='rgba(255,255,255,.7)';x.beginPath();x.ellipse(w*0.45,h*0.2,w*0.04,h*0.025,-0.5,0,6.28);x.fill();
    x.fillStyle='#2a6aff';x.fillRect(w*0.38,h*0.48,w*0.24,h*0.1);x.fillStyle='#ff3030';x.fillRect(w*0.42,h*0.5,w*0.05,h*0.06);
    x.fillStyle='#ff3030';x.fillRect(w*0.26,h*0.62,w*0.48,h*0.03)},
  5:(x,w,h)=>{   // a little saucer with a pilot
    const sh=()=>{x.beginPath();x.ellipse(w/2,h*0.6,w*0.48,h*0.2,0,0,6.28);x.arc(w/2,h*0.48,w*0.2,0,6.28)};
    ply(x,w,h,sh);x.fillStyle='#c7c9d6';x.beginPath();x.ellipse(w/2,h*0.6,w*0.46,h*0.18,0,0,6.28);x.fill();
    x.fillStyle='rgba(120,220,255,.9)';x.beginPath();x.arc(w/2,h*0.5,w*0.18,Math.PI,0);x.fill();x.fillStyle='#39ff6e';x.beginPath();x.arc(w/2,h*0.48,w*0.08,0,6.28);x.fill();
    x.fillStyle='#000';for(const s of[-1,1]){x.beginPath();x.ellipse(w/2+s*w*0.03,h*0.47,w*0.022,h*0.015,s*0.5,0,6.28);x.fill()}
    for(let i=0;i<6;i++){x.fillStyle=['#ff3ad6','#ffef3a','#2af0ff'][i%3];x.beginPath();x.arc(w*(0.14+i*0.144),h*0.64,w*0.03,0,6.28);x.fill()}},
  6:(x,w,h)=>{   // the big one: tall, four eyes, a crown of spikes
    const sh=()=>{x.beginPath();x.ellipse(w/2,h*0.3,w*0.4,h*0.24,0,0,6.28);for(let i=0;i<5;i++){x.moveTo(w*(0.2+i*0.15),h*0.1);x.lineTo(w*(0.25+i*0.15),0);x.lineTo(w*(0.3+i*0.15),h*0.1)}x.rect(w*0.2,h*0.5,w*0.6,h*0.5);x.rect(0,h*0.55,w,h*0.08)};
    ply(x,w,h,sh);x.fillStyle='#8a3aff';x.beginPath();x.ellipse(w/2,h*0.3,w*0.37,h*0.21,0,0,6.28);x.fill();x.fillRect(w*0.22,h*0.51,w*0.56,h*0.49);x.fillRect(w*0.02,h*0.56,w*0.96,h*0.06);
    x.fillStyle='#ffef3a';for(let i=0;i<5;i++){x.beginPath();x.moveTo(w*(0.21+i*0.15),h*0.11);x.lineTo(w*(0.25+i*0.15),h*0.02);x.lineTo(w*(0.29+i*0.15),h*0.11);x.fill()}
    x.fillStyle='#39ff6e';for(const [a,b] of[[0.36,0.26],[0.64,0.26],[0.42,0.36],[0.58,0.36]]){x.beginPath();x.arc(w*a,h*b,w*0.05,0,6.28);x.fill()}
    x.fillStyle='#000';for(const [a,b] of[[0.36,0.26],[0.64,0.26],[0.42,0.36],[0.58,0.36]]){x.beginPath();x.arc(w*a,h*b,w*0.022,0,6.28);x.fill()}
    x.fillStyle='#fff';for(let i=0;i<6;i++){x.beginPath();x.moveTo(w*(0.36+i*0.05),h*0.43);x.lineTo(w*(0.385+i*0.05),h*0.48);x.lineTo(w*(0.41+i*0.05),h*0.43);x.fill()}
    x.fillStyle='#ff3ad6';x.fillRect(w*0.3,h*0.66,w*0.4,h*0.05);x.fillRect(w*0.3,h*0.78,w*0.4,h*0.05)},
};
// the back of a board: the same silhouette, bare plywood with two battens
const backOf=front=>canvasTex(front.image.width,front.image.height,(x,w,h)=>{x.drawImage(front.image,0,0);x.globalCompositeOperation='source-in';x.fillStyle='#a77d4c';x.fillRect(0,0,w,h);
  for(let i=0;i<40;i++){x.strokeStyle=`rgba(80,50,20,${0.2+(i%4)/10})`;x.beginPath();const y=i*h/40;x.moveTo(0,y);x.bezierCurveTo(w*0.3,y+3,w*0.7,y-3,w,y+1);x.stroke()}
  x.fillStyle='#6a4a28';x.fillRect(0,h*0.35,w,h*0.05);x.fillRect(0,h*0.7,w,h*0.05)});
// a neon sign: glowing letters on black, with a halo
function neonSign(lines,{w=1024,h=256,col='#ff3ad6',glow='#ff7ae8',font='bold 120px "Trebuchet MS",sans-serif',sizes}={}){
  return canvasTex(w,h,(x)=>{x.fillStyle='#050208';x.fillRect(0,0,w,h);x.textAlign='center';x.textBaseline='middle';
    lines.forEach((ln,i)=>{const y=h*(i+0.5)/lines.length,c=Array.isArray(col)?col[i%col.length]:col;x.font=sizes?sizes[i]:font;
      x.shadowColor=Array.isArray(glow)?glow[i%glow.length]:glow;x.shadowBlur=28;x.fillStyle=c;x.fillText(ln,w/2,y);x.shadowBlur=8;x.fillText(ln,w/2,y);x.shadowBlur=0;x.fillStyle='#fff';x.globalAlpha=0.55;x.fillText(ln,w/2,y);x.globalAlpha=1})});
}

export function neonRideRoom({group,scene,cam,o,A,finish,onClear,seed=7}){
  const C=neonCourse(seed),{curve,L}=C;
  cam.fov=74;cam.near=0.05;cam.far=140;
  const prevBg=scene.background,prevFog=scene.fog;scene.background=new THREE.Color(0x020006);scene.fog=new THREE.FogExp2(0x05010d,0.028);
  const owned=[];const own=x=>{owned.push(x);return x};
  const basic=(c,extra={})=>own(new THREE.MeshBasicMaterial({color:c,toneMapped:false,...extra}));
  const std=(c,r=0.7,m=0,extra={})=>own(new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m,...extra}));
  const NEONS=[0xff3ad6,0x2af0ff,0xb6ff2a,0xffa22a,0x8a5aff];
  // light: a dim violet black light over everything, and a cool lamp riding on the cart; the cutouts' paint glows by itself
  group.add(new THREE.HemisphereLight(0x5a2aa0,0x0a0418,0.9));
  const cartLamp=new THREE.PointLight(0xa58aff,5,11,1.6);group.add(cartLamp);
  // the floor: a glowing grid out to the horizon
  {const tex=canvasTex(128,128,(x,w,h)=>{x.fillStyle='#04010a';x.fillRect(0,0,w,h);x.strokeStyle='#5a1aa8';x.lineWidth=3;x.strokeRect(0,0,w,h);x.strokeStyle='rgba(160,80,255,.35)';x.lineWidth=1;x.strokeRect(2,2,w-4,h-4)});
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(140,140);own(tex);
    const g=new THREE.Mesh(own(new THREE.PlaneGeometry(420,420)),own(new THREE.MeshBasicMaterial({map:tex,toneMapped:false})));g.rotation.x=-Math.PI/2;g.position.set(0,-0.02,-60);group.add(g)}
  // stars overhead
  {const n=900,p=new Float32Array(n*3),r=rng(seed^0x5eed);for(let i=0;i<n;i++){const a=r()*6.28,e=0.15+r()*1.3,R=70+r()*30;p[i*3]=Math.cos(a)*Math.cos(e)*R;p[i*3+1]=Math.sin(e)*R*0.6+4;p[i*3+2]=Math.sin(a)*Math.cos(e)*R-60}
    const g=own(new THREE.BufferGeometry());g.setAttribute('position',new THREE.BufferAttribute(p,3));
    group.add(new THREE.Points(g,own(new THREE.PointsMaterial({color:0xd8c8ff,size:0.35,sizeAttenuation:true,fog:false,toneMapped:false}))))}
  // the track: rails, a dark bed, low barriers either side with neon tubes along the top, and neon arches every so often
  const N=Math.ceil(L/1.2),P=[],T=[],Rt=[];
  for(let i=0;i<=N;i++){const u=i/N;P.push(curve.getPointAt(u));const t=curve.getTangentAt(u);T.push(t);Rt.push(new THREE.Vector3(-t.z,0,t.x).normalize())}
  const ribbon=(a,b,ya,yb,mat)=>{const pos=[],idx=[];for(let i=0;i<=N;i++){const p=P[i],r=Rt[i];pos.push(p.x+r.x*a,ya,p.z+r.z*a,p.x+r.x*b,yb,p.z+r.z*b);if(i<N){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}
    const g=own(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,mat);group.add(m);return m};
  const bedMat=std(0x0c0714,0.95,0,{side:THREE.DoubleSide}),wallMat=std(0x120a22,0.85,0,{side:THREE.DoubleSide});
  ribbon(-1.1,1.1,0.0,0.0,bedMat);
  for(const s of[-1,1]){ribbon(s*NEON.barrier,s*NEON.barrier,0,0.78,wallMat);ribbon(s*NEON.barrier,s*(NEON.barrier+0.12),0.78,0.78,wallMat)}
  const tube=(off,y,r,col)=>{const c=new THREE.CatmullRomCurve3(P.map((p,i)=>new THREE.Vector3(p.x+Rt[i].x*off,y,p.z+Rt[i].z*off)));
    const m=new THREE.Mesh(own(new THREE.TubeGeometry(c,Math.ceil(N*0.8),r,5,false)),basic(col));group.add(m);return m};
  tube(-NEON.barrier,0.8,0.03,0x2af0ff);tube(NEON.barrier,0.8,0.03,0xff3ad6);
  tube(-0.42,0.05,0.025,0x8a5aff);tube(0.42,0.05,0.025,0x8a5aff);
  {const ag=own(new THREE.TorusGeometry(2.6,0.045,6,40,Math.PI));
    for(let s=10,i=0;s<L-12;s+=13,i++){const u=s/L,p=curve.getPointAt(u),t=curve.getTangentAt(u);const m=new THREE.Mesh(ag,basic(NEONS[i%NEONS.length]));m.position.copy(p);m.lookAt(p.clone().add(t));group.add(m)}}
  // things hanging in the dark: two banded planets, one with a ring, and a big saucer turning slowly with its lights chasing round
  const spin=[];let ufoBulbs=null;
  {const r=rng(seed^0xf1a7);
    for(let k=0;k<2;k++){const u=0.25+k*0.4,p=curve.getPointAt(u),rt=new THREE.Vector3(-curve.getTangentAt(u).z,0,curve.getTangentAt(u).x).normalize(),side=k?-1:1;
      const tex=canvasTex(256,128,(x,w,h)=>{const cs=k?['#2a0a6a','#ff3ad6','#5a1aa8','#ffa22a']:['#062a3a','#2af0ff','#0a5a6a','#b6ff2a'];for(let y=0;y<h;y+=8){x.fillStyle=cs[((y/8)|0)%cs.length];x.fillRect(0,y+Math.sin(y)*2,w,9)}});own(tex);
      const pl=new THREE.Mesh(own(new THREE.SphereGeometry(3+r()*1.5,32,20)),own(new THREE.MeshBasicMaterial({map:tex,toneMapped:false,fog:false})));
      pl.position.set(p.x+rt.x*side*(18+r()*6),6+r()*3,p.z+rt.z*side*(18+r()*6));pl.rotation.z=0.4;group.add(pl);spin.push([pl,0.08]);
      if(k===0){const ring=new THREE.Mesh(own(new THREE.TorusGeometry(5.2,0.12,6,48)),basic(0xb6ff2a,{fog:false}));ring.position.copy(pl.position);ring.rotation.x=1.2;group.add(ring)}}
    const u=0.62,p=curve.getPointAt(u),t=curve.getTangentAt(u),rt=new THREE.Vector3(-t.z,0,t.x).normalize();
    const ufo=new THREE.Group();ufo.position.set(p.x+rt.x*11,4.2,p.z+rt.z*11);group.add(ufo);
    const hull=new THREE.Mesh(own(new THREE.SphereGeometry(3,32,12)),std(0x8a8ca0,0.3,0.8));hull.scale.y=0.22;ufo.add(hull);
    const dome=new THREE.Mesh(own(new THREE.SphereGeometry(1.2,24,12,0,6.28,0,Math.PI/2)),own(new THREE.MeshStandardMaterial({color:0x7ae8ff,emissive:0x2af0ff,emissiveIntensity:0.8,transparent:true,opacity:0.75})));dome.position.y=0.4;ufo.add(dome);
    const bulbs=[];for(let i=0;i<14;i++){const a=i/14*6.28,b=new THREE.Mesh(own(new THREE.SphereGeometry(0.13,8,6)),basic(0xffef3a));b.position.set(Math.cos(a)*2.85,0,Math.sin(a)*2.85);ufo.add(b);bulbs.push(b)}
    const beam=new THREE.Mesh(own(new THREE.ConeGeometry(2.2,4.2,24,1,true)),own(new THREE.MeshBasicMaterial({color:0x6affb0,transparent:true,opacity:0.12,side:THREE.DoubleSide,depthWrite:false,toneMapped:false})));beam.position.y=-2.2;ufo.add(beam);
    spin.push([ufo,0.25]);ufoBulbs=bulbs}
  // the cart: a low tub with neon trim, a padded safety bar in front of you, and a scoreboard on the dash
  const cart=new THREE.Group();group.add(cart);
  {const body=std(0x1a0a2a,0.4,0.3),trim=basic(0xff3ad6);
    const tub=new THREE.Mesh(own(new THREE.BoxGeometry(1.25,0.55,1.7)),body);tub.position.set(0,0.42,0.15);cart.add(tub);
    const nose=new THREE.Mesh(own(new THREE.CylinderGeometry(0.62,0.62,0.55,20,1,false,-Math.PI/2,Math.PI)),body);nose.rotation.y=Math.PI;nose.position.set(0,0.42,-0.7);cart.add(nose);
    for(const s of[-1,1]){const t=new THREE.Mesh(own(new THREE.BoxGeometry(0.04,0.04,1.75)),trim);t.position.set(s*0.63,0.71,0.15);cart.add(t)}
    const bar=new THREE.Mesh(own(new THREE.CylinderGeometry(0.06,0.06,1.05,12)),std(0x2a2a36,0.5,0.6));bar.rotation.z=Math.PI/2;bar.position.set(0,0.92,-0.36);cart.add(bar);
    const pad=new THREE.Mesh(own(new THREE.CylinderGeometry(0.085,0.085,0.6,14)),std(0x6a1a5a,0.9));pad.rotation.z=Math.PI/2;pad.position.set(0,0.92,-0.36);cart.add(pad);
    for(const s of[-1,1]){const arm=new THREE.Mesh(own(new THREE.BoxGeometry(0.05,0.3,0.05)),std(0x2a2a36,0.5,0.6));arm.position.set(s*0.52,0.78,-0.36);cart.add(arm)}
    for(const s of[-1,1])for(const z of[-0.45,0.75]){const w=new THREE.Mesh(own(new THREE.CylinderGeometry(0.13,0.13,0.08,14)),std(0x0a0a0a,0.6));w.rotation.z=Math.PI/2;w.position.set(s*0.6,0.14,z);cart.add(w)}}
  const board=canvasTex(512,160,()=>{});own(board);const boardCv=board.image,bctx=boardCv.getContext('2d');
  const drawBoard=(top,big,col='#2af0ff')=>{const x=bctx,w=512,h=160;x.fillStyle='#04010a';x.fillRect(0,0,w,h);x.strokeStyle='#5a1aa8';x.lineWidth=6;x.strokeRect(3,3,w-6,h-6);
    x.textAlign='center';x.textBaseline='middle';x.font='bold 34px "Trebuchet MS",sans-serif';x.fillStyle='#ff7ae8';x.shadowColor='#ff3ad6';x.shadowBlur=14;x.fillText(top,w/2,38);
    x.font='bold 76px "Courier New",monospace';x.fillStyle=col;x.shadowColor=col;x.shadowBlur=20;x.fillText(big,w/2,106);x.shadowBlur=0;board.needsUpdate=true};
  const dash=new THREE.Mesh(own(new THREE.PlaneGeometry(0.36,0.112)),own(new THREE.MeshBasicMaterial({map:board,toneMapped:false})));dash.position.set(0,0.86,-0.88);dash.rotation.x=-0.5;cart.add(dash);   // on the nose, low in the view looking ahead
  // the blaster, held in front of you, and its bolts
  const gun=new THREE.Group();group.add(gun);
  {const shell=std(0x6a6a82,0.3,0.75),dark=std(0x22222c,0.6,0.4);
    const g1=new THREE.Mesh(own(new THREE.CylinderGeometry(0.036,0.042,0.22,14)),shell);g1.rotation.x=Math.PI/2;gun.add(g1);
    for(let i=0;i<3;i++){const fin=new THREE.Mesh(own(new THREE.TorusGeometry(0.043,0.006,6,18)),basic([0xff3ad6,0x2af0ff,0xb6ff2a][i]));fin.position.z=-0.04-i*0.045;gun.add(fin)}
    const g2=new THREE.Mesh(own(new THREE.CylinderGeometry(0.014,0.02,0.16,12)),dark);g2.rotation.x=Math.PI/2;g2.position.set(0,0,-0.18);gun.add(g2);
    const st=new THREE.Mesh(own(new THREE.BoxGeometry(0.008,0.008,0.18)),basic(0x2af0ff));st.position.set(0,0.04,-0.02);gun.add(st);
    const gr=new THREE.Mesh(own(new THREE.BoxGeometry(0.035,0.1,0.045)),dark);gr.position.set(0,-0.07,0.06);gr.rotation.x=0.35;gun.add(gr)}
  const muzzle=new THREE.Mesh(own(new THREE.SphereGeometry(0.03,10,8)),basic(0xb6ff2a,{transparent:true,opacity:0}));muzzle.position.set(0,0,-0.27);gun.add(muzzle);
  const bolts=[];const boltGeo=own(new THREE.CylinderGeometry(0.012,0.012,1,6));boltGeo.rotateX(Math.PI/2);boltGeo.translate(0,0,-0.5);
  for(let i=0;i<4;i++){const b=new THREE.Mesh(boltGeo,basic(0xb6ff2a,{transparent:true,opacity:0,depthWrite:false}));b.visible=false;group.add(b);bolts.push({m:b,t:0})}
  // wood chips when a cutout is hit
  const chipGeo=own(new THREE.BoxGeometry(0.05,0.02,0.08)),chipMat=std(0xc79a62,0.8),chips=[];
  for(let i=0;i<40;i++){const m=new THREE.Mesh(chipGeo,chipMat);m.visible=false;group.add(m);chips.push({m,v:new THREE.Vector3(),t:0})}
  // the points each hit scores, floating up from it
  const popTex=new Map(),pops=[];
  const popOf=v=>{if(!popTex.has(v))popTex.set(v,own(canvasTex(128,64,(x,w,h)=>{x.textAlign='center';x.textBaseline='middle';x.font='bold 46px "Trebuchet MS",sans-serif';const c=v<0?'#ff4a4a':'#ffef3a';x.shadowColor=c;x.shadowBlur=14;x.fillStyle=c;x.fillText((v>0?'+':'')+v,w/2,h/2)})));return popTex.get(v)};
  for(let i=0;i<6;i++){const s=new THREE.Sprite(own(new THREE.SpriteMaterial({transparent:true,depthWrite:false,toneMapped:false,fog:false})));s.visible=false;s.scale.set(0.8,0.4,1);group.add(s);pops.push({s,t:0})}
  // the cutouts: a board on a hinge at its foot, lying back flat until the cart comes near, then flipping up to face the track
  const texArt={},matArt={};
  const artTex=k=>texArt[k]||(texArt[k]=own(canvasTex(k===5?256:192,k===5?160:k===6?320:288,(x,w,h)=>ART[k](x,w,h))));
  // one front and one back material per kind of board, shared by every board of that kind
  const artMats=k=>matArt[k]||(matArt[k]={front:own(new THREE.MeshStandardMaterial({map:artTex(k),emissiveMap:artTex(k),emissive:0xffffff,emissiveIntensity:0.7,roughness:0.85,alphaTest:0.5,side:THREE.FrontSide})),
    back:own(new THREE.MeshStandardMaterial({map:own(backOf(artTex(k))),roughness:0.9,alphaTest:0.5,side:THREE.BackSide}))});
  const panels=[];
  for(const t of C.targets){
    const art=t.kind==='astronaut'?4:t.kind==='saucer'?5:t.kind==='boss'?6:t.art,M=artMats(art);
    const W=t.kind==='saucer'?1.1:t.kind==='boss'?2.2:t.kind==='astronaut'?0.95:1.05,H=t.kind==='saucer'?0.7:t.kind==='boss'?3.2:1.6;
    const u=t.s/L,p=curve.getPointAt(u),tg=curve.getTangentAt(u),rt=new THREE.Vector3(-tg.z,0,tg.x).normalize();
    const base=new THREE.Group();base.position.set(p.x+rt.x*t.side*t.off,t.h,p.z+rt.z*t.side*t.off);
    const look=new THREE.Vector3(p.x+tg.x*3,t.h,p.z+tg.z*3);base.lookAt(look);   // it faces the track, a little ahead
    const hinge=new THREE.Group();base.add(hinge);
    const front=new THREE.Mesh(own(new THREE.PlaneGeometry(W,H)),M.front);
    front.position.y=H/2;hinge.add(front);
    const rear=new THREE.Mesh(front.geometry,M.back);rear.position.copy(front.position);hinge.add(rear);
    if(t.kind==='saucer'){const wire=new THREE.Mesh(own(new THREE.CylinderGeometry(0.006,0.006,6,4)),basic(0x6a6a7a));wire.position.y=3+H;base.add(wire)}
    else{const foot=new THREE.Mesh(own(new THREE.BoxGeometry(W*0.6,0.08,0.2)),std(0x3a2a1a,0.9));foot.position.y=0.04;base.add(foot)}
    hinge.rotation.x=-Math.PI/2;group.add(base);
    front.userData.t=t;
    panels.push({t,base,hinge,front,up:0,hit:false,hp:t.hp||1,flip:0,x0:base.position.clone(),rt:rt.clone().multiplyScalar(t.side)});
  }
  // the stations: the loading platform with the ride's marquee and the prize list, and the prize counter at the end, beside the exit
  const station=(u,dir)=>{const p=curve.getPointAt(u),t=curve.getTangentAt(u),rt=new THREE.Vector3(-t.z,0,t.x).normalize();return {p,t,rt,dir}};
  {const s=station(0.02),sg=new THREE.Group();sg.position.copy(s.p);sg.lookAt(s.p.clone().add(s.t));group.add(sg);
    const mq=new THREE.Mesh(own(new THREE.PlaneGeometry(4.2,1.05)),own(new THREE.MeshBasicMaterial({map:own(neonSign(['NEON RUN'],{col:'#ff3ad6',glow:'#ff7ae8',font:'bold 150px "Trebuchet MS",sans-serif'})),toneMapped:false})));
    mq.position.set(0,3.4,5);mq.rotation.y=Math.PI;sg.add(mq);
    const lines=['PRIZES'].concat(NEON_PRIZES.slice().reverse().map(q=>String(q.min).padStart(4,' ')+'  '+q.name.toUpperCase()));
    const pb=new THREE.Mesh(own(new THREE.PlaneGeometry(2.1,2.3)),own(new THREE.MeshBasicMaterial({map:own(neonSign(lines,{w:640,h:700,col:['#ffef3a','#2af0ff'],glow:['#ffa22a','#2af0ff'],sizes:['bold 70px "Trebuchet MS",sans-serif'].concat(Array(6).fill('bold 40px "Courier New",monospace')),font:''})),toneMapped:false})));
    pb.position.set(-3.2,1.7,2.6);pb.rotation.y=Math.atan2(3.2,-2.6);sg.add(pb);
    const plat=new THREE.Mesh(own(new THREE.BoxGeometry(2.4,0.4,6)),std(0x1a1028,0.8));plat.position.set(2.6,0.2,-1);sg.add(plat)}
  let counterDesk=null;const endS=station(1),counter=new THREE.Group();counter.position.copy(endS.p);counter.lookAt(endS.p.clone().add(endS.t));group.add(counter);
  {const deskM=std(0x2a103a,0.5,0.2);
    const deskG=new THREE.Group();deskG.position.set(-1.7,0,2.9);deskG.rotation.y=Math.PI-0.45;counter.add(deskG);
    const desk=new THREE.Mesh(own(new THREE.BoxGeometry(2.2,1.0,0.7)),deskM);desk.position.set(0,0.5,0);deskG.add(desk);
    const top=new THREE.Mesh(own(new THREE.BoxGeometry(2.3,0.05,0.8)),basic(0x2af0ff));top.position.set(0,1.02,0);deskG.add(top);
    const sign=new THREE.Mesh(own(new THREE.PlaneGeometry(2.8,0.7)),own(new THREE.MeshBasicMaterial({map:own(neonSign(['PRIZE COUNTER'],{col:'#ffef3a',glow:'#ffa22a',font:'bold 110px "Trebuchet MS",sans-serif'})),toneMapped:false})));
    sign.position.set(0,2.4,-0.3);deskG.add(sign);
    const exitF=new THREE.Group();exitF.position.set(1.9,0,3.1);exitF.rotation.y=Math.PI+0.45;counter.add(exitF);
    const door=new THREE.Mesh(own(new THREE.BoxGeometry(1.1,2.2,0.08)),std(0x14101e,0.6));door.position.y=1.1;exitF.add(door);
    for(const s of[-1,1]){const j=new THREE.Mesh(own(new THREE.BoxGeometry(0.06,2.3,0.06)),basic(0xb6ff2a));j.position.set(s*0.6,1.15,0.04);exitF.add(j)}
    const ex=new THREE.Mesh(own(new THREE.PlaneGeometry(0.9,0.3)),own(new THREE.MeshBasicMaterial({map:own(neonSign(['EXIT'],{w:384,h:128,col:'#b6ff2a',glow:'#6aff2a',font:'bold 90px "Trebuchet MS",sans-serif'})),toneMapped:false})));ex.position.set(0,2.5,0.05);exitF.add(ex);
    const warm=new THREE.PointLight(0xffc27a,6,7,1.6);warm.position.set(0,2.2,0.9);deskG.add(warm);counterDesk=deskG}
  // the prizes themselves, one built for each tier, shown on the counter when it is won
  const prizeModels=NEON_PRIZES.map((q,i)=>{const g=new THREE.Group();g.visible=false;g.position.set(0,1.05,0);counterDesk.add(g);
    if(i===0){const d=new THREE.Mesh(own(new THREE.CylinderGeometry(0.12,0.12,0.01,24)),basic(0xb6ff2a));d.rotation.x=Math.PI/2;d.position.y=0.15;g.add(d)}
    else if(i===1){const m=std(0x39ff6e,0.4);const b=new THREE.Mesh(own(new THREE.CapsuleGeometry(0.06,0.12,6,12)),m);b.position.y=0.12;g.add(b);const h=new THREE.Mesh(own(new THREE.SphereGeometry(0.09,16,12)),m);h.scale.y=1.2;h.position.y=0.32;g.add(h)}
    else if(i===2){const m=std(0xc0c4d0,0.3,0.8);const b=new THREE.Mesh(own(new THREE.CylinderGeometry(0.04,0.05,0.24,12)),m);b.rotation.z=Math.PI/2;b.position.y=0.18;g.add(b);const r=new THREE.Mesh(own(new THREE.TorusGeometry(0.06,0.01,6,16)),basic(0xff3ad6));r.position.set(0.14,0.18,0);g.add(r);const h=new THREE.Mesh(own(new THREE.BoxGeometry(0.05,0.12,0.04)),m);h.position.set(-0.06,0.1,0);g.add(h)}
    else if(i===3){const glass=new THREE.Mesh(own(new THREE.CylinderGeometry(0.07,0.11,0.4,20)),own(new THREE.MeshStandardMaterial({color:0xff6a2a,emissive:0xff3a0a,emissiveIntensity:1.2,transparent:true,opacity:0.8})));glass.position.y=0.3;g.add(glass);
      for(const y of[0.05,0.55]){const c=new THREE.Mesh(own(new THREE.CylinderGeometry(0.1,0.12,0.1,20)),std(0xc0a040,0.3,0.8));c.position.y=y;g.add(c)}}
    else if(i===4){const m=std(0x39ff6e,1);const b=new THREE.Mesh(own(new THREE.SphereGeometry(0.22,20,16)),m);b.position.y=0.24;g.add(b);
      for(const s of[-1,1]){const e=new THREE.Mesh(own(new THREE.SphereGeometry(0.06,12,10)),basic(0x111111));e.position.set(s*0.08,0.3,0.18);g.add(e);const a=new THREE.Mesh(own(new THREE.CylinderGeometry(0.01,0.01,0.2,6)),m);a.position.set(s*0.08,0.52,0);a.rotation.z=s*0.4;g.add(a)}}
    else{const gold=own(new THREE.MeshStandardMaterial({color:0xffd24a,metalness:1,roughness:0.2,emissive:0x8a5a00,emissiveIntensity:0.6}));const h=new THREE.Mesh(own(new THREE.SphereGeometry(0.3,28,12)),gold);h.scale.y=0.25;h.position.y=0.3;g.add(h);
      const d=new THREE.Mesh(own(new THREE.SphereGeometry(0.13,20,10,0,6.28,0,Math.PI/2)),own(new THREE.MeshStandardMaterial({color:0x7ae8ff,emissive:0x2af0ff,emissiveIntensity:1})));d.position.y=0.34;g.add(d)}
    return g});

  const S={t:0,s:0,v:0,yaw:0,pitch:-0.04,bloom:0.9,seed,score:0,hits:[],ended:false,endT:0,cd:0,holdT:0,shots:0,friendly:0,beat:0,tier:0};
  S.aimed=()=>!S.ended;
  S.controlMode=()=>'walk';
  const ray=new THREE.Raycaster(),ctr=new THREE.Vector2(0,0),tmp=new THREE.Vector3(),q=new THREE.Quaternion();
  const sayBoard=()=>{if(S.ended){const p=NEON_PRIZES[S.tier];drawBoard('YOU WIN: '+p.name.toUpperCase(),String(Math.max(0,S.score)).padStart(4,'0'),'#ffef3a')}else drawBoard('NEON RUN · SCORE',String(Math.max(0,S.score)).padStart(4,'0'))};
  sayBoard();
  function hitPanel(P,pt,local=true){
    if(P.hit)return;P.hp--;
    for(let k=0,n=0;k<chips.length&&n<8;k++)if(chips[k].t<=0){const c=chips[k];c.m.position.copy(pt);c.v.set((Math.random()-0.5)*3,1+Math.random()*2.5,(Math.random()-0.5)*3);c.t=1.2;c.m.visible=true;n++}
    if(P.hp>0){P.flip=0.25;if(local)o.tone(180,0.12,'square',0.06,0,-40);return}
    P.hit=true;S.hits.push(P.t.id);
    const t=P.t,v=t.kind==='alien'?NEON_PTS.alien+(t.off>6?NEON_PTS.far:0):NEON_PTS[t.kind];
    if(local){S.score+=v;if(t.kind==='astronaut')S.friendly++;sayBoard();
      o.noise(0.08,0.25,1800,1.5);o.tone(t.kind==='astronaut'?140:520,0.12,t.kind==='astronaut'?'sawtooth':'triangle',0.07,0,t.kind==='astronaut'?-60:200);
      if(t.kind==='boss'){o.tone(392,0.15,'square',0.05,0.1);o.tone(523,0.15,'square',0.05,0.25);o.tone(784,0.3,'square',0.05,0.4)}}
    const pp=pops.find(z=>z.t<=0)||pops[0];pp.s.material.map=popOf(v);pp.s.material.needsUpdate=true;pp.s.position.copy(pt);pp.t=1;pp.s.visible=true;
  }
  function fire(){
    S.cd=NEON.cooldown;S.shots++;
    cam.updateMatrixWorld();ray.setFromCamera(ctr,cam);ray.far=40;
    const live=panels.filter(P=>P.up>0.8&&!P.hit).map(P=>P.front);
    const hit=ray.intersectObjects(live,false)[0];
    const from=muzzle.getWorldPosition(new THREE.Vector3()),to=hit?hit.point:ray.ray.at(30,new THREE.Vector3());
    const b=bolts.find(z=>z.t<=0)||bolts[0];b.m.position.copy(from);b.m.lookAt(to);b.m.scale.set(1,1,from.distanceTo(to));b.t=0.12;b.m.visible=true;
    muzzle.material.opacity=1;
    o.tone(1400,0.09,'square',0.035,0,-1100);o.noise(0.05,0.05,5000,2);
    if(hit)hitPanel(panels.find(P=>P.front===hit.object),hit.point);
  }
  S.tap=()=>false;
  S.snap=()=>({sd:seed,s:+S.s.toFixed(2),t:+S.t.toFixed(2),yaw:+S.yaw.toFixed(3),pitch:+S.pitch.toFixed(3),sc:S.score,h:S.hits.slice(-80),e:S.ended?1:0});
  S.apply=qq=>{
    if(![qq.s,qq.yaw,qq.pitch].every(Number.isFinite))return;
    S.s=THREE.MathUtils.clamp(qq.s,0,L);S.yaw=qq.yaw;S.pitch=THREE.MathUtils.clamp(qq.pitch,-MOVE.roomPitch,MOVE.roomPitch);
    if(Number.isFinite(qq.sc)&&qq.sc!==S.score){S.score=qq.sc|0;sayBoard()}
    if(Array.isArray(qq.h))for(const id of qq.h){const P=panels.find(z=>z.t.id===id);if(P&&!P.hit){P.hp=1;hitPanel(P,P.front.getWorldPosition(tmp),false)}}
    if(qq.e&&!S.ended){S.ended=true;S.tier=neonTier(S.score);sayBoard();prizeModels[S.tier].visible=true}
  };
  S.update=(dt,input)=>{
    S.t+=dt;
    const pressNow=!!input.press,press=pressNow&&!S.wasP;S.wasP=pressNow;
    if(!A.watching){
      lookStep(S,dt,input.lx||0,input.ly||0,MOVE.roomPitch);S.yaw=THREE.MathUtils.clamp(S.yaw,-2.5,2.5);
      // the cart: waits a moment at the platform (a bell), rolls the course, and eases to a stop at the prize counter
      if(S.t>NEON.start&&!S.ended){
        const left=L-S.s,want=Math.min(NEON.speed,Math.sqrt(2*0.9*Math.max(0,left-0.4))+0.15);
        S.v+=THREE.MathUtils.clamp(want-S.v,-2*dt,1.2*dt);S.s=Math.min(L,S.s+S.v*dt);
        if(left<0.5&&S.v<0.3){S.ended=true;S.endT=S.t;S.tier=neonTier(S.score);sayBoard();prizeModels[S.tier].visible=true;
          o.tone(523,0.18,'triangle',0.08);o.tone(659,0.18,'triangle',0.08,0.15);o.tone(784,0.18,'triangle',0.08,0.3);o.tone(1046,0.4,'triangle',0.08,0.45)}
      }
      if(S.t>0.5&&S.t-dt<=0.5){o.tone(880,0.4,'sine',0.06);o.tone(1320,0.6,'sine',0.04,0.05)}   // the bell
      if(!S.ended&&S.t>NEON.start){S.cd-=dt;if(press&&S.cd<=0){fire();S.holdT=0}else if(pressNow){S.holdT+=dt;if(S.holdT>=NEON.hold&&S.cd<=0){fire();S.holdT=0}}}
      if(S.ended&&press&&S.t-S.endT>1.2){finish({k:'win',why:'neonride',score:S.score,tier:S.tier,friendly:S.friendly,shots:S.shots,hits:S.hits.length});return}
      // a soft synth pulse while the cart rolls
      if(S.t>NEON.start&&!S.ended){const b=Math.floor(S.t*2.4);if(b!==S.beat){S.beat=b;const n=[110,110,131,98][b%4];o.tone(n,0.18,'sawtooth',0.018,0,-20);if(b%2)o.tone(n*4,0.08,'triangle',0.008)}}
    }
    o.hud(A.watching?'<small>'+(A.label||'')+'</small>':'');
    // place the cart and the camera on the track
    const u=S.s/L,p=curve.getPointAt(Math.min(1,u)),tg=curve.getTangentAt(Math.min(1,u));
    cart.position.copy(p);cart.lookAt(p.clone().add(tg));cart.rotateY(Math.PI);   // the tub's nose (-z) points along the track
    const bob=S.v>0.1?Math.sin(S.t*9)*0.008:0;
    cam.position.set(p.x+tg.x*0.15,NEON.eye+bob,p.z+tg.z*0.15);
    const head=Math.atan2(-tg.x,-tg.z);
    cam.rotation.set(S.pitch,head-S.yaw,0,'YXZ');cam.updateMatrixWorld();
    cartLamp.position.set(p.x+tg.x*2.5,2.4,p.z+tg.z*2.5);
    // the blaster, low and to the right of the view, kicking back as it fires
    const kick=Math.max(0,S.cd/NEON.cooldown)*0.03;
    gun.position.copy(new THREE.Vector3(0.19,-0.16,-0.45+kick).applyMatrix4(cam.matrixWorld));gun.quaternion.copy(cam.quaternion);gun.visible=!S.ended;
    muzzle.material.opacity=Math.max(0,muzzle.material.opacity-dt*10);
    for(const b of bolts)if(b.t>0){b.t-=dt;b.m.material.opacity=Math.max(0,b.t/0.12);if(b.t<=0)b.m.visible=false}
    for(const c of chips)if(c.t>0){c.t-=dt;c.v.y-=9.8*dt;c.m.position.addScaledVector(c.v,dt);c.m.rotation.x+=dt*9;c.m.rotation.z+=dt*7;if(c.m.position.y<0){c.m.position.y=0;c.v.set(0,0,0)}if(c.t<=0)c.m.visible=false}
    for(const pp of pops)if(pp.t>0){pp.t-=dt;pp.s.position.y+=dt*0.9;pp.s.material.opacity=Math.min(1,pp.t*2);if(pp.t<=0)pp.s.visible=false}
    // the cutouts flip up as the cart comes, sway a little, and fall back when hit or when the cart has gone by
    for(const P of panels){
      const d=P.t.s-S.s,want=!P.hit&&d<NEON.popAhead&&d>-NEON.stayBehind?1:0;
      const was=P.up;P.up=THREE.MathUtils.clamp(P.up+(want?3.5:-2.5)*dt,0,1);
      if(was===0&&P.up>0&&!A.watching&&Math.abs(d)<20)o.noise(0.07,0.06,900,2);   // the clack of the hinge
      if(P.flip>0)P.flip=Math.max(0,P.flip-dt);
      const e=P.up<1?P.up*P.up*(3-2*P.up):1;
      P.hinge.rotation.x=-Math.PI/2*(1-e)+(P.hit?0:Math.sin(S.t*2+P.t.ph)*0.03)+(P.flip>0?Math.sin(P.flip*40)*0.15:0);
      P.base.visible=P.up>0.001||d<NEON.popAhead+6&&d>-6;
      if(P.t.kind==='saucer'&&!P.hit)P.base.position.copy(P.x0).addScaledVector(P.rt,Math.sin(S.t*1.3+P.t.ph)*P.t.sw);
    }
    for(const [m,k] of spin)m.rotation.y+=dt*k;
    if(ufoBulbs)ufoBulbs.forEach((b,i)=>b.material.color.setHex(((i+Math.floor(S.t*8))%3)?0x5a4a10:0xffef3a));
    for(const g of prizeModels)if(g.visible)g.rotation.y+=dt*1.2;
  };
  onClear(()=>{scene.background=prevBg;scene.fog=prevFog;for(const x of owned)x.dispose&&x.dispose();for(const b of bolts)b.m.material.dispose()});
  S.update(0,{});
  S.course=C;S.panels=panels;   // for the tests
  return S;
}
