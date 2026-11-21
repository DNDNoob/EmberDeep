// The Wheel of Misfortune: an upright game-show wheel that stands in each sanctuary beside Pat Sajak.
// The model is built from plain meshes; the face and the banner are painted on canvases at load time.
// Angles: the disc turns by `angle` (radians, counter-clockwise as seen from the front). A slice sits under the
// pointer when angle mod 2PI falls inside it, so sliceAt(angle) is the result, and planSpin() picks the final
// angle for a result chosen up front: what the pointer shows is always what happens.
import * as THREE from 'three';

export const WOF_SLICES=[
  {name:'Walmart',col:'#1b63c6'},
  {name:'Ad Break',col:'#e0402a'},
  {name:'Dog Days',col:'#f0a21c'},
  {name:'Ratatouille',col:'#7a4b9c'},
  {name:'Biggest Loser',col:'#2e9e4f'},
  {name:'Double or Nothing',col:'#d8c21f'},
  {name:'Nothing',col:'#2a2a2e'},
  {name:'Hearing Aids',col:'#1fa6b8'},
  {name:'Tinnitus',col:'#c33a8a'},
  {name:'Black Plague',col:'#3d4a2a'},
  {name:'Tickle Monster',col:'#ff7ab8'},
  {name:'First Thanksgiving',col:'#b5651d'},
];
export const WOF_N=WOF_SLICES.length;
export const WOF_W=Math.PI*2/WOF_N;              // one slice
export const WOF_R=0.4;                          // disc radius (m)
export const WOF_HUB=0.86;                       // height of the axle above the floor
const TAU=Math.PI*2;
const mod=(a,n)=>((a%n)+n)%n;

export const sliceAt=a=>Math.floor(mod(a,TAU)/WOF_W)%WOF_N;

// rest inside the slice, clear of the pegs at its edges (the flapper must hang free when the wheel stops)
export function planSpin(index,from,rnd=Math.random){
  const turns=6+Math.floor(rnd()*3);
  const inSlice=0.24+rnd()*0.18;                  // radians past the slice's leading peg
  const base=from-mod(from,TAU)+TAU*turns;
  const to=base+index*WOF_W+inSlice;
  return {from,to,dur:12+rnd()*2.5};
}
// a long coast: fast at first, then a crawl past the last few pegs
export function spinAngle(plan,t){
  const u=Math.min(1,Math.max(0,t/plan.dur)),k=1-Math.pow(1-u,3.2);
  return plan.from+(plan.to-plan.from)*k;
}

// the flapper is pushed aside by the peg coming up under it, slips off and swings back.
// q: how far the disc has turned past the last peg. Returns the deflection while a peg holds it (0..1), else -1.
const C_IN=0.07,C_OUT=0.19;
export function pegPush(angle){
  const q=mod(angle,WOF_W);
  if(q>=WOF_W-C_IN)return (q-(WOF_W-C_IN))/(C_IN+C_OUT);
  if(q<=C_OUT)return (C_IN+q)/(C_IN+C_OUT);
  return -1;
}

let faceCanvas=null,bannerCanvas=null;
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function grain(ctx,w,h,amt,seed){
  const r=rng(seed),im=ctx.getImageData(0,0,w,h),d=im.data;
  for(let i=0;i<d.length;i+=4){const n=(r()-0.5)*amt;d[i]+=n;d[i+1]+=n;d[i+2]+=n}
  ctx.putImageData(im,0,0);
}
export function drawWheelFace(){
  if(faceCanvas)return faceCanvas;
  const S=1024,c=document.createElement('canvas');c.width=c.height=S;
  const g=c.getContext('2d'),cx=S/2,cy=S/2,R=S/2-4;
  const pt=(a,r)=>[cx+Math.sin(a)*r,cy-Math.cos(a)*r];  // a: clockwise from the top
  for(let i=0;i<WOF_N;i++){
    const a0=i*WOF_W,a1=a0+WOF_W;
    g.beginPath();g.moveTo(cx,cy);
    for(let k=0;k<=24;k++){const p=pt(a0+(a1-a0)*k/24,R);g.lineTo(p[0],p[1])}
    g.closePath();
    const gr=g.createRadialGradient(cx,cy,60,cx,cy,R);gr.addColorStop(0,WOF_SLICES[i].col);gr.addColorStop(0.82,WOF_SLICES[i].col);gr.addColorStop(1,'#00000055');
    g.fillStyle=WOF_SLICES[i].col;g.fill();g.fillStyle=gr;g.fill();
    g.lineWidth=7;g.strokeStyle='#1a1208';g.stroke();
  }
  grain(g,S,S,18,7);
  // labels run along the radius, reading from the rim towards the hub
  for(let i=0;i<WOF_N;i++){
    const a=(i+0.5)*WOF_W,words=WOF_SLICES[i].name.toUpperCase().split(' ');
    const lines=words.length>2?[words.slice(0,2).join(' '),words.slice(2).join(' ')]:words.length===2&&WOF_SLICES[i].name.length>11?words:[words.join(' ')];
    g.save();g.translate(cx,cy);g.rotate(a);   // -y of this frame points out through the middle of the slice
    g.textAlign='center';g.textBaseline='middle';
    const len=330,fs=Math.min(50,Math.floor(len/Math.max(...lines.map(s=>s.length))/0.74));
    g.font=`900 ${fs}px "Arial Black",Impact,Arial,sans-serif`;
    lines.forEach((s,k)=>{
      const off=((lines.length-1)/2-k)*(fs*1.05);
      g.save();g.translate(off,-(R*0.6));g.rotate(Math.PI/2);   // text runs along the radius, rim to hub
      g.lineWidth=Math.max(4,fs*0.16);g.strokeStyle='#120c05';g.lineJoin='round';g.strokeText(s,0,0);
      g.fillStyle=i===5?'#2a1a05':'#fffaf0';if(i===5){g.strokeStyle='#fff3b0';g.lineWidth=3;g.strokeText(s,0,0)}
      g.fillText(s,0,0);g.restore();
    });
    g.restore();
  }
  // gold hub ring
  g.beginPath();g.arc(cx,cy,92,0,TAU);g.fillStyle='#2a1a08';g.fill();
  faceCanvas=c;return c;
}
export function drawBanner(){
  if(bannerCanvas)return bannerCanvas;
  const W=1024,H=220,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#8e1414');gr.addColorStop(1,'#4c0606');
  g.fillStyle=gr;g.fillRect(0,0,W,H);
  g.lineWidth=14;g.strokeStyle='#d9a521';g.strokeRect(10,10,W-20,H-20);
  g.lineWidth=3;g.strokeStyle='#6b4a08';g.strokeRect(24,24,W-48,H-48);
  // marquee bulbs
  for(let x=44;x<W-30;x+=40)for(const y of[17,H-17]){g.beginPath();g.arc(x,y,6,0,TAU);g.fillStyle='#fff3c0';g.fill()}
  for(let y=57;y<H-40;y+=40)for(const x of[17,W-17]){g.beginPath();g.arc(x,y,6,0,TAU);g.fillStyle='#fff3c0';g.fill()}
  g.textAlign='center';g.textBaseline='middle';
  g.font='900 50px "Arial Black",Impact,Arial,sans-serif';
  g.lineWidth=10;g.strokeStyle='#2a0303';g.lineJoin='round';
  g.strokeText('WHEEL OF',W/2,72);g.fillStyle='#ffe28a';g.fillText('WHEEL OF',W/2,72);
  g.font='900 76px "Arial Black",Impact,Arial,sans-serif';
  g.strokeText('MISFORTUNE',W/2,148);
  const tg=g.createLinearGradient(0,110,0,190);tg.addColorStop(0,'#fff6c8');tg.addColorStop(1,'#f0b324');g.fillStyle=tg;g.fillText('MISFORTUNE',W/2,148);
  grain(g,W,H,14,11);
  bannerCanvas=c;return c;
}

const tex=cv=>{const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t};
export function wheelModel(){
  const root=new THREE.Group(),R=WOF_R,HUB=WOF_HUB;
  const std=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:0.6,metalness:0.1},o||{}));
  const wood=std(0x4a2a14,{roughness:0.85}),woodD=std(0x2c180b,{roughness:0.9}),brass=std(0xc8962a,{roughness:0.35,metalness:0.75}),
        red=std(0xb01818,{roughness:0.5}),dark=std(0x161210,{roughness:0.7});
  const box=(w,h,d,m,x,y,z,p=root)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);p.add(o);return o};
  const cyl=(r0,r1,h,m,seg=16)=>new THREE.Mesh(new THREE.CylinderGeometry(r0,r1,h,seg),m);
  // stand: a plinth, two posts and an arch that carries the banner and the pointer
  box(0.98,0.08,0.4,woodD,0,0.04,-0.02);
  box(0.9,0.012,0.34,woodD,0,0.086,-0.02);
  const top=HUB+R+0.34;
  for(const s of[-1,1]){box(0.07,top-0.08,0.07,wood,s*(R+0.1),0.08+(top-0.08)/2,-0.06);box(0.09,0.04,0.09,brass,s*(R+0.1),top+0.01,-0.06)}
  box(0.07,0.07,0.06,wood,0,HUB,-0.09).scale.x=(2*R+0.2)/0.07;           // crossbar behind the axle
  box(2*R+0.27,0.06,0.06,wood,0,top-0.22,-0.06);                          // arch over the wheel
  // marquee ring of bulbs around the disc, fixed to the stand
  const bulbMats=[0,1].map(()=>new THREE.MeshStandardMaterial({color:0xffe9a8,emissive:0xffc860,emissiveIntensity:1.2,roughness:0.3}));
  const bulbG=new THREE.SphereGeometry(0.014,8,6),ring=new THREE.Mesh(new THREE.TorusGeometry(R+0.045,0.016,8,64),brass);
  ring.position.set(0,HUB,-0.015);root.add(ring);
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2,b=new THREE.Mesh(bulbG,bulbMats[i&1]);b.position.set(Math.sin(a)*(R+0.045),HUB+Math.cos(a)*(R+0.045),0.008);root.add(b)}
  // the spinning disc: painted face, wooden edge, brass rim and the pegs between the slices
  const spin=new THREE.Group();spin.position.set(0,HUB,0);root.add(spin);
  const edge=cyl(R,R,0.035,woodD,64);edge.rotation.x=Math.PI/2;spin.add(edge);
  const faceMat=new THREE.MeshStandardMaterial({map:tex(drawWheelFace()),roughness:0.55,emissive:0xffffff,emissiveMap:null,emissiveIntensity:0});
  faceMat.emissiveMap=faceMat.map;faceMat.emissiveIntensity=0.18;
  const face=new THREE.Mesh(new THREE.CircleGeometry(R,72),faceMat);face.position.z=0.0185;spin.add(face);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(R,0.011,8,72),brass);rim.position.z=0.012;spin.add(rim);
  const pegG=cyl(0.0075,0.0075,0.05,brass,8).geometry;pegG.rotateX(Math.PI/2);
  for(let j=0;j<WOF_N;j++){const a=j*WOF_W,p=new THREE.Mesh(pegG,brass);p.position.set(Math.sin(a)*(R-0.02),Math.cos(a)*(R-0.02),0.04);spin.add(p)}
  const hub=cyl(0.075,0.085,0.05,brass,32);hub.rotation.x=Math.PI/2;hub.position.z=0.03;spin.add(hub);
  const cap=cyl(0.03,0.04,0.03,red,16);cap.rotation.x=Math.PI/2;cap.position.z=0.06;spin.add(cap);
  // the flapper: a leather tongue in three links hanging from a brass clamp, bending as the pegs push past it
  const clamp=box(0.06,0.05,0.07,brass,0,HUB+R+0.085,0.03);
  box(0.03,0.08,0.03,brass,0,top-0.22-0.03,-0.02).position.y=(top-0.22+HUB+R+0.085)/2;
  const links=[],L=0.042;let parent=root;
  const pivot=new THREE.Group();pivot.position.set(0,HUB+R+0.06,0.052);root.add(pivot);parent=pivot;
  for(let k=0;k<3;k++){
    const j=new THREE.Group();if(k)j.position.y=-L;parent.add(j);
    const w=0.034-k*0.008,m=new THREE.Mesh(new THREE.BoxGeometry(w,L,0.008),k===2?brass:red);m.position.y=-L/2;j.add(m);
    links.push(j);parent=j;
  }
  { // arrow tip
    const tip=new THREE.Mesh(new THREE.ConeGeometry(0.014,0.03,4),brass);tip.rotation.z=Math.PI;tip.position.y=-L-0.012;links[2].add(tip);
  }
  // banner on the arch
  const ban=new THREE.Mesh(new THREE.PlaneGeometry(1.02,0.22),new THREE.MeshStandardMaterial({map:tex(drawBanner()),emissive:0xffffff,roughness:0.6}));
  ban.material.emissiveMap=ban.material.map;ban.material.emissiveIntensity=0.45;
  ban.position.set(0,top-0.05,-0.02);root.add(ban);
  const banBack=box(1.04,0.24,0.025,woodD,0,top-0.05,-0.037);
  void clamp;void banBack;
  let bulbT=0;
  root.userData={
    spin,links,bulbMats,
    // angle: disc rotation; flap: flapper deflection in radians (+ = swung left, as the rim carries it); t, mode: bulb chase
    pose(angle,flap,t,mode){
      spin.rotation.z=angle;
      const b=-flap;links[0].rotation.z=b*0.45;links[1].rotation.z=b*0.35;links[2].rotation.z=b*0.25;
      bulbT=t;
      const ph=mode==='spin'?Math.floor(t*14)&1:mode==='win'?Math.floor(t*6)&1:0;
      if(mode==='win'){bulbMats[0].emissiveIntensity=bulbMats[1].emissiveIntensity=ph?2.4:0.2}
      else if(mode==='spin'){bulbMats[0].emissiveIntensity=ph?2.2:0.25;bulbMats[1].emissiveIntensity=ph?0.25:2.2}
      else{const s=0.9+0.3*Math.sin(t*2);bulbMats[0].emissiveIntensity=s;bulbMats[1].emissiveIntensity=1.8-s}
    },
  };
  void bulbT;
  return root;
}
