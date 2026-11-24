// Two "breaks" from the Wheel of Misfortune, played as first-person 3D scenes with their own set, lights and camera:
//   walmart  you stand in the 10 ITEMS OR LESS lane behind a lady on a powered cart who unloads 53 groceries, one at a time,
//            with price checks, then pays by check. You hold your one bottle of lamp oil. You can look around; you cannot move.
//   dmv      you sit in the back row of the DMV holding number 847 while NOW SERVING crawls up from 12. Then it is your turn. Wrong form.
//   birth    the Circle of Life: a warm tunnel, a light, and a doctor saying congratulations
//   roulette everyone at one table with a revolver (the game logic lives in game.js; this draws it)
//   ad       a thirty second commercial for GLOWBRITE lamp oil, with a pitchman, a happy customer and a product shot.
//            "Skip Ad" lights up after five seconds and does nothing.
// Characters are built from rounded parts (spheres and capsules) in the same toy-like proportions as the maze's NPCs.
import * as THREE from 'three';

const TAU=Math.PI*2,clamp=(v,a,b)=>v<a?a:v>b?b:v,ease=u=>u<0?0:u>1?1:u*u*(3-2*u);
const mats=new Map();
const mat=(c,o)=>{const k=c+JSON.stringify(o||{});let m=mats.get(k);if(!m){m=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:0.72,metalness:0},o||{}));mats.set(k,m)}return m};
const G={ball:new THREE.SphereGeometry(1,20,14),box:new THREE.BoxGeometry(1,1,1),cyl:new THREE.CylinderGeometry(1,1,1,18),cap:new THREE.CapsuleGeometry(1,1,6,14)};
function part(parent,geo,m,x,y,z,sx,sy,sz){const o=new THREE.Mesh(G[geo],typeof m==='number'||typeof m==='string'?mat(m):m);o.position.set(x,y,z);o.scale.set(sx,sy==null?sx:sy,sz==null?sx:sz);parent.add(o);return o}
const grp=(parent,x,y,z)=>{const g=new THREE.Group();g.position.set(x||0,y||0,z||0);if(parent)parent.add(g);return g};
// a limb segment hanging from a pivot: capsule of radius r and length len pointing down -y
const limb=(pv,r,len,m)=>{const o=new THREE.Mesh(new THREE.CapsuleGeometry(r,Math.max(0.001,len-2*r),6,12),typeof m==='number'?mat(m):m);o.position.y=-len/2+r*0.5;pv.add(o);return o};
const cvTex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.userData.cv=c;return t};

/* ---------- people ---------- */
// o: skin, top, bottom, shoes, hair, style ('curls','short','pomp','bun'), w (girth), h (height), topMap (texture), sleeve
function person(o){
  const g=new THREE.Group(),S=o.h||1,W=o.w||1,skin=mat(o.skin||0xe8b896,{roughness:0.55}),top=o.topMap?new THREE.MeshStandardMaterial({map:o.topMap,roughness:0.8}):mat(o.top),
        sleeve=mat(o.sleeve||o.top),bottom=mat(o.bottom),shoes=mat(o.shoes||0x2a2420),hair=mat(o.hair||0x3a2414,{roughness:0.9});
  const P={g};
  // legs
  for(const s of[-1,1]){const hip=grp(g,s*0.1*W,0.92*S,0);limb(hip,0.08*W,0.44*S,bottom);const knee=grp(hip,0,-0.44*S,0);limb(knee,0.065*W,0.42*S,bottom);
    part(knee,'box',shoes,0,-0.44*S,0.05,0.1*W,0.07,0.24);P[s<0?'legL':'legR']={hip,knee}}
  // body
  const ch=grp(g,0,0.92*S,0);P.chest=ch;
  part(ch,'ball',bottom,0,0.04,0,0.2*W,0.14,0.15*W);
  part(ch,'cap',top,0,0.3*S,0,0.19*W,0.18*S,0.15*W);
  if(o.belly)part(ch,'ball',top,0,0.2*S,0.08*W,0.2*W,0.2*S,0.16*W);
  part(ch,'ball',top,0,0.5*S,0,0.25*W,0.1,0.15*W);                                       // shoulders
  // arms
  for(const s of[-1,1]){const sh=grp(ch,s*0.24*W,0.5*S,0);limb(sh,0.06*W,0.3*S,sleeve);const el=grp(sh,0,-0.3*S,0);limb(el,0.052*W,0.26*S,o.forearm?mat(o.forearm):skin);
    const hand=part(el,'ball',skin,0,-0.3*S,0.01,0.05,0.06,0.04);P[s<0?'armL':'armR']={sh,el,hand}}
  // head
  part(ch,'cyl',skin,0,0.6*S,0,0.055,0.12,0.055);
  const hd=grp(ch,0,0.74*S,0);P.head=hd;
  part(hd,'ball',skin,0,0,0,0.125,0.14,0.13);
  for(const s of[-1,1]){part(hd,'ball',0xf6f4ee,s*0.045,0.025,0.105,0.026,0.026,0.016);part(hd,'ball',o.eye||0x2a1c12,s*0.045,0.025,0.118,0.012,0.014,0.008);
    part(hd,'ball',skin,s*0.125,0,0,0.025,0.04,0.02);
    const b=part(hd,'box',o.brow||hair,s*0.045,0.065,0.112,0.05,0.012,0.012);b.rotation.z=-s*(o.browTilt||0.08)}
  part(hd,'ball',skin,0,-0.01,0.128,0.022,0.03,0.025);                                     // nose
  P.mouth=part(hd,'box',0x7a2a26,0,-0.065,0.112,0.05,0.012,0.01);
  if(o.smile)part(hd,'box',0xf8f6f0,0,-0.06,0.116,0.042,0.008,0.006);
  if(o.glasses)for(const s of[-1,1]){const r=new THREE.Mesh(new THREE.TorusGeometry(0.03,0.005,6,16),mat(0x2a1e14));r.position.set(s*0.045,0.025,0.125);hd.add(r)}
  const st=o.style||'short';
  if(st==='curls'){for(let i=0;i<34;i++){const a=i/34*TAU*2.3,yy=0.02+(i%5)*0.03,r=0.125-(i%5)*0.012;part(hd,'ball',hair,Math.cos(a)*r,yy+0.04,Math.sin(a)*r*0.95-0.01,0.042)}
    part(hd,'ball',hair,0,0.1,-0.01,0.12,0.07,0.12);part(hd,'ball',hair,0,0.17,-0.06,0.06)}
  else if(st==='pomp'){part(hd,'ball',hair,0,0.08,-0.01,0.13,0.08,0.13);part(hd,'ball',hair,0,0.15,0.05,0.1,0.07,0.09)}
  else if(st==='bun'){part(hd,'ball',hair,0,0.06,-0.02,0.132,0.11,0.13);part(hd,'ball',hair,0,0.12,-0.11,0.06)}
  else{part(hd,'ball',hair,0,0.06,-0.02,0.13,0.1,0.135)}
  g.scale.setScalar(o.scale||1);
  return P;
}
const pose=(a,x,z,el)=>{a.sh.rotation.x=x;a.sh.rotation.z=z||0;a.el.rotation.x=el||0};

/* ---------- props ---------- */
const GROC=[0xd23a2a,0x2a6ad0,0xf0b020,0x2a9a5a,0xe8e8e8,0x8a3ac0,0xf07a20,0x5a3010,0x40c0e0,0xc02060];
function grocery(i){
  const g=new THREE.Group(),c=GROC[(i*7)%GROC.length],k=i%4;
  if(k===0){part(g,'box',c,0,0.11,0,0.16,0.22,0.08);part(g,'box',0xffffff,0,0.13,0.041,0.12,0.06,0.002)}
  else if(k===1){part(g,'cyl',c,0,0.06,0,0.045,0.12,0.045);part(g,'cyl',0xcfcfcf,0,0.121,0,0.045,0.004,0.045)}
  else if(k===2){part(g,'cyl',c,0,0.1,0,0.05,0.2,0.05);part(g,'cyl',c,0,0.22,0,0.02,0.05,0.02);part(g,'cyl',0xeeeeee,0,0.25,0,0.022,0.02,0.022)}
  else{part(g,'ball',c,0,0.05,0,0.12,0.06,0.08)}
  return g;
}
let glowLabel=null;
function glowBottle(s){
  if(!glowLabel)glowLabel=cvTex(512,128,(x,w,h)=>{x.fillStyle='#fff4d8';x.fillRect(0,0,w,h);x.fillStyle='#a8221a';x.textAlign='center';   // the label goes all the way round, the name on both sides
    for(const cx of[w/4,w*3/4]){x.font='900 52px "Arial Black",Arial';x.fillText('GLOW',cx,58);x.font='900 36px "Arial Black",Arial';x.fillText('BRITE',cx,104)}});
  const g=new THREE.Group();
  part(g,'cyl',mat(0xd8901a,{roughness:0.2,metalness:0.1,emissive:0x3a1a00}),0,0.12,0,0.06,0.24,0.06);
  const lb=new THREE.Mesh(new THREE.CylinderGeometry(0.0605,0.0605,0.1,32,1,true),new THREE.MeshStandardMaterial({map:glowLabel,roughness:0.7}));lb.position.y=0.12;g.add(lb);
  part(g,'cyl',0xd8901a,0,0.27,0,0.025,0.06,0.025);part(g,'cyl',0x1a1a1a,0,0.31,0,0.03,0.03,0.03);
  g.scale.setScalar(s||1);return g;
}
const sign=(w,h,draw,emiss)=>{const t=cvTex(Math.round(w*400),Math.round(h*400),draw);const m=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:emiss==null?0.6:emiss,roughness:0.6});
  return new THREE.Mesh(new THREE.PlaneGeometry(w,h),m)};
const floral=()=>cvTex(256,256,(x,w,h)=>{x.fillStyle='#e57aa6';x.fillRect(0,0,w,h);let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;
  for(let i=0;i<70;i++){const cx=r()*w,cy=r()*h,c=['#fff7e0','#ffd84a','#7ac0d8'][i%3];for(let k=0;k<5;k++){const a=k/5*TAU;x.fillStyle=c;x.beginPath();x.arc(cx+Math.cos(a)*6,cy+Math.sin(a)*6,5,0,TAU);x.fill()}x.fillStyle='#c43a72';x.beginPath();x.arc(cx,cy,4,0,TAU);x.fill()}});

/* ---------- the store ---------- */
function buildWalmart(){
  const sc=new THREE.Scene();sc.background=new THREE.Color(0xdfe4dc);sc.fog=new THREE.Fog(0xdfe4dc,9,22);
  sc.add(new THREE.HemisphereLight(0xffffff,0x9a9a8a,1.5));
  const sun=new THREE.DirectionalLight(0xffffff,1.2);sun.position.set(2,6,3);sc.add(sun);
  const pl=new THREE.PointLight(0xfff6e8,6,8,1.2);pl.position.set(0.6,2.8,-1.6);sc.add(pl);
  // floor, ceiling, light panels
  const tile=cvTex(256,256,(x,w,h)=>{for(let i=0;i<4;i++)for(let j=0;j<4;j++){x.fillStyle=(i+j)%2?'#d8d6cc':'#c4c2b6';x.fillRect(i*64,j*64,64,64)}x.strokeStyle='#aaa89c';for(let i=0;i<=4;i++){x.beginPath();x.moveTo(i*64,0);x.lineTo(i*64,h);x.moveTo(0,i*64);x.lineTo(w,i*64);x.stroke()}});
  tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.repeat.set(14,14);
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(28,28),new THREE.MeshStandardMaterial({map:tile,roughness:0.35}));fl.rotation.x=-Math.PI/2;sc.add(fl);
  const ce=new THREE.Mesh(new THREE.PlaneGeometry(28,28),mat(0xe8eae4));ce.rotation.x=Math.PI/2;ce.position.y=3.4;sc.add(ce);
  for(let x=-6;x<=6;x+=3)for(let z=-12;z<=3;z+=3)part(sc,'box',mat(0xffffff,{emissive:0xffffff,emissiveIntensity:1}),x,3.38,z,1.6,0.03,0.5);
  // aisles of shelves behind the registers
  const shelfM=mat(0xb8bcc0,{metalness:0.4,roughness:0.5}),prodG=new THREE.BoxGeometry(0.22,0.3,0.2);
  const prods=new THREE.InstancedMesh(prodG,new THREE.MeshStandardMaterial({roughness:0.6}),2600);let ni=0;const m4=new THREE.Matrix4(),col=new THREE.Color();
  for(let a=0;a<7;a++){const z=-6.5-a*2.2;for(const side of[-1,1])for(let xs=-6;xs<6;xs+=0.25){
    if(a===0&&side<0)continue;
    for(let lv=0;lv<4;lv++){if(ni>=2600)break;m4.makeTranslation(xs,0.35+lv*0.5,z+side*0.25);prods.setMatrixAt(ni,m4);col.setHex(GROC[(ni*13+lv)%GROC.length]);prods.setColorAt(ni,col);ni++}}
    part(sc,'box',shelfM,0,0.95,z,12.4,1.9,0.12);for(let lv=0;lv<4;lv++)part(sc,'box',shelfM,0,0.18+lv*0.5,z,12.4,0.03,0.8)}
  prods.count=ni;sc.add(prods);
  const banner=(txt,x,z)=>{const s=sign(1.6,0.4,(c,w,h)=>{c.fillStyle='#1b4e9c';c.fillRect(0,0,w,h);c.fillStyle='#fff';c.font='bold 90px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(txt,w/2,h/2)},0.5);s.position.set(x,2.9,z);sc.add(s)};
  banner('GROCERY',-3.5,-6);banner('PHARMACY',0,-6.2);banner('HOME',3.5,-6);
  // closed lanes to the left
  for(const x of[-2.6,-5]){part(sc,'box',0x6d7278,x,0.45,-1.8,0.6,0.9,3);const s=sign(0.7,0.28,(c,w,h)=>{c.fillStyle='#200';c.fillRect(0,0,w,h);c.fillStyle='#ff3a2a';c.font='bold 80px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('CLOSED',w/2,h/2)},0.8);s.position.set(x,2.1,-0.3);sc.add(s);part(sc,'cyl',0x333333,x,1.0,-0.3,0.03,2,0.03)}
  // lane 4: counter, belt, scanner, bagging, register
  const lane={};
  part(sc,'box',0x7d828a,0.95,0.45,-2,0.62,0.9,3.6);
  const beltT=cvTex(64,256,(x,w,h)=>{x.fillStyle='#1c1c1e';x.fillRect(0,0,w,h);x.fillStyle='#2f2f33';for(let y=0;y<h;y+=32)x.fillRect(0,y,w,4)});beltT.wrapT=THREE.RepeatWrapping;beltT.repeat.set(1,5);
  lane.belt=new THREE.Mesh(new THREE.PlaneGeometry(0.46,2.2),new THREE.MeshStandardMaterial({map:beltT,roughness:0.9}));lane.belt.rotation.x=-Math.PI/2;lane.belt.position.set(0.95,0.905,-1.25);sc.add(lane.belt);lane.beltT=beltT;
  part(sc,'box',0x2b2d31,0.95,0.91,-2.55,0.5,0.03,0.4);
  lane.scan=part(sc,'box',mat(0xff2020,{emissive:0xff0000,emissiveIntensity:0.2}),0.95,0.928,-2.55,0.3,0.004,0.18);
  part(sc,'box',0xa6a9ad,0.95,0.91,-3.45,0.6,0.02,0.9);
  // register screen: the item and its price, then the total
  lane.regT=cvTex(256,128,()=>{});lane.reg=new THREE.Mesh(new THREE.PlaneGeometry(0.34,0.17),new THREE.MeshStandardMaterial({map:lane.regT,emissive:0xffffff,emissiveMap:lane.regT,emissiveIntensity:0.9}));
  lane.reg.position.set(0.7,1.32,-2.2);lane.reg.rotation.y=0.55;sc.add(lane.reg);part(sc,'box',0x1a1a1a,0.71,1.32,-2.21,0.38,0.21,0.02).rotation.y=0.55;part(sc,'cyl',0x333333,0.75,1.1,-2.25,0.02,0.42,0.02);
  // the lane light and its sign
  part(sc,'cyl',0x2a2a2a,1.22,1.1,-0.92,0.03,2.2,0.03);
  const s10=sign(0.62,0.42,(c,w,h)=>{c.fillStyle='#0e7a2a';c.fillRect(0,0,w,h);c.strokeStyle='#fff';c.lineWidth=8;c.strokeRect(6,6,w-12,h-12);c.fillStyle='#fff';c.textAlign='center';
    c.font='900 92px "Arial Black",Arial';c.fillText('10',w/2,98);c.font='bold 34px Arial';c.fillText('ITEMS OR LESS',w/2,146)},0.9);
  s10.position.set(1.22,2.25,-0.83);sc.add(s10);
  const s4=sign(0.22,0.22,(c,w,h)=>{c.fillStyle='#ffd400';c.beginPath();c.arc(w/2,h/2,w/2-2,0,TAU);c.fill();c.fillStyle='#222';c.font='900 60px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('4',w/2,h/2+4)},0.7);
  s4.position.set(1.22,2.58,-0.82);sc.add(s4);lane.s10=s10;
  // the candy rack beside you
  part(sc,'box',0x7a1d1d,-0.75,0.65,-0.3,0.35,1.3,0.7);for(let i=0;i<20;i++)part(sc,'box',GROC[i%GROC.length],-0.56,0.2+(i%5)*0.24,-0.55+((i/5)|0)*0.17,0.04,0.14,0.12);
  // the cashier
  const cashier=person({skin:0xc99470,top:0x1d4f9d,sleeve:0xf2f2f2,bottom:0x2a2a30,hair:0x4a2a16,style:'bun',w:1.05,h:0.98,brow:0x3a2010});
  cashier.g.position.set(1.62,0,-2.55);cashier.g.rotation.y=-Math.PI/2;sc.add(cashier.g);
  part(cashier.chest,'box',0xffd400,0.1,0.42,0.15,0.08,0.04,0.01);lane.phone=part(sc,'box',0x333333,1.5,1.0,-2.0,0.06,0.04,0.18);
  // the lady on the powered cart, from behind
  const cart=grp(sc,0.12,0,-1.45);
  part(cart,'box',0xc22a2a,0,0.22,0,0.62,0.16,1.15);part(cart,'box',0xe14444,0,0.31,-0.05,0.58,0.03,1.05);
  for(const [x,z] of[[-0.26,0.42],[0.26,0.42],[-0.26,-0.45],[0.26,-0.45]]){const w=part(cart,'cyl',0x1b1b1b,x,0.12,z,0.12,0.08,0.12);w.rotation.z=Math.PI/2}
  part(cart,'box',0x1f3a6e,0,0.55,0.12,0.56,0.2,0.5);part(cart,'box',0x1f3a6e,0,0.82,0.4,0.5,0.36,0.1);part(cart,'cyl',0x888888,-0.22,0.6,0.4,0.015,0.3,0.015);part(cart,'cyl',0x888888,0.22,0.6,0.4,0.015,0.3,0.015);
  part(cart,'cyl',0x333333,0,0.75,-0.52,0.03,0.9,0.03).rotation.x=0.35;part(cart,'box',0x333333,0,1.15,-0.66,0.5,0.04,0.06);
  const bask=grp(cart,0,0.85,-0.82);part(bask,'box',mat(0x99aaaa,{metalness:0.5,roughness:0.4,wireframe:true}),0,0,0,0.5,0.3,0.32);
  lane.basket=[];for(let i=0;i<14;i++){const q=grocery(i*3);q.position.set(-0.18+(i%4)*0.12,-0.1+((i/4)|0)*0.06,-0.08+(i%3)*0.08);q.rotation.y=i;bask.add(q);lane.basket.push(q)}
  const lady=person({skin:0xeac0a4,topMap:floral(),sleeve:0x8a5fae,bottom:0xd9658f,hair:0xc4c0d4,style:'curls',w:1.6,h:0.95,belly:true,glasses:true,brow:0x9a96a8,shoes:0xe8e0d0});
  lady.g.position.set(0,-0.22,0.16);cart.add(lady.g);lady.g.rotation.y=Math.PI;               // facing away from you, towards the cashier
  for(const L of[lady.legL,lady.legR]){L.hip.rotation.x=-1.45;L.knee.rotation.x=1.4}
  lane.lady=lady;lane.cart=cart;
  // groceries on the belt and in the bags
  lane.items=[];for(let i=0;i<53;i++){const q=grocery(i);q.visible=false;sc.add(q);lane.items.push(q)}
  lane.bags=[];for(let i=0;i<18;i++){const b=part(sc,'ball',mat(0xf4f4f4,{roughness:0.5}),0.75+(i%3)*0.2,1.02+((i/9)|0)*0.18,-3.2-((i/3|0)%3)*0.22,0.1,0.13,0.1);b.visible=false;lane.bags.push(b)}
  lane.check=part(sc,'box',0xf0ead8,0,0,0,0.18,0.008,0.08);lane.check.visible=false;
  // you: one bottle of lamp oil in your hand
  const cam=new THREE.PerspectiveCamera(70,16/9,0.05,40);cam.position.set(-0.05,1.62,0.75);sc.add(cam);
  const hand=grp(cam,0.22,-0.27,-0.5);part(hand,'cap',0xe0b08a,0,-0.05,0.06,0.045,0.06,0.045).rotation.x=0.6;const bt=glowBottle(0.75);bt.position.set(0,-0.05,0);hand.add(bt);lane.hand=hand;
  return {sc,cam,lane,cashier};
}

/* ---------- the commercial ---------- */
function buildAd(){
  const sc=new THREE.Scene();
  const bg=cvTex(64,256,(x,w,h)=>{const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,'#ffcf3a');g.addColorStop(0.5,'#ff6a2a');g.addColorStop(1,'#5a0a6a');x.fillStyle=g;x.fillRect(0,0,w,h)});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(14,24,16),new THREE.MeshBasicMaterial({map:bg,side:THREE.BackSide}));sc.add(sky);
  sc.add(new THREE.HemisphereLight(0xfff2e0,0x6a3a5a,1.4));
  const key=new THREE.DirectionalLight(0xffffff,1.6);key.position.set(2,4,5);sc.add(key);
  const spots=[0xff3a8a,0x3ad0ff,0xffe03a].map((c,i)=>{const l=new THREE.PointLight(c,8,10,1.5);sc.add(l);return l});
  const stage=new THREE.Mesh(new THREE.CylinderGeometry(3,3.2,0.2,48),mat(0x2a1a4a,{roughness:0.25,metalness:0.3}));stage.position.y=-0.1;sc.add(stage);
  for(let i=0;i<24;i++){const a=i/24*TAU;part(sc,'ball',mat(0xfff0b0,{emissive:0xffd070,emissiveIntensity:1.5}),Math.cos(a)*3.05,0.02,Math.sin(a)*3.05,0.04)}
  // the pitchman: loud suit, big hair, bigger grin
  const man=person({skin:0xf0c4a0,top:0xf07a1a,sleeve:0xf07a1a,bottom:0x3a2a6a,hair:0x2a1a0a,style:'pomp',smile:true,w:1.05,brow:0x2a1a0a,shoes:0xf4f4f4});
  part(man.chest,'box',0xffffff,0,0.42,0.14,0.1,0.18,0.02);const tie=part(man.chest,'box',0x22c0ff,0,0.4,0.155,0.04,0.17,0.01);void tie;
  man.g.position.set(-0.45,0,0);sc.add(man.g);
  const prop=glowBottle(1);man.armR.el.add(prop);prop.position.set(0,-0.38,0.05);prop.rotation.x=-0.2;
  // a happy delver with a blazing torch
  const fan=person({skin:0xc98a64,top:0x2a6a4a,sleeve:0x2a6a4a,bottom:0x4a3a2a,hair:0x1a1410,style:'short',smile:true,w:0.95,h:0.95});
  fan.g.position.set(0.75,0,-0.2);fan.g.rotation.y=-0.35;sc.add(fan.g);
  const torch=grp(fan.armR.el,0,-0.32,0.04);part(torch,'cyl',0x5a3a1a,0,0.15,0,0.02,0.45,0.02);
  const flame=part(torch,'ball',mat(0xffc060,{emissive:0xff8a20,emissiveIntensity:3}),0,0.42,0,0.07,0.12,0.07);
  const fl=new THREE.PointLight(0xffa040,4,4,1.5);torch.add(fl);fl.position.y=0.45;
  fan.g.visible=false;
  // the product, enormous
  const hero=glowBottle(5);hero.position.set(0,0.05,-0.4);hero.visible=false;sc.add(hero);
  const sparks=[];for(let i=0;i<40;i++){const s=part(sc,'ball',mat(0xffffff,{emissive:0xfff2b0,emissiveIntensity:3}),0,0,0,0.025);s.visible=false;sparks.push(s)}
  const logo=sign(2.6,0.8,(c,w,h)=>{c.fillStyle='#a8221a';c.fillRect(0,0,w,h);c.strokeStyle='#ffd23a';c.lineWidth=14;c.strokeRect(10,10,w-20,h-20);
    c.fillStyle='#ffd23a';c.font='900 170px "Arial Black",Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('GLOWBRITE',w/2,h*0.42);
    c.fillStyle='#fff';c.font='bold 64px Arial';c.fillText('Ask your Keeper about it today',w/2,h*0.8)},0.7);
  logo.position.set(0,2.45,-0.8);logo.visible=false;sc.add(logo);
  const cam=new THREE.PerspectiveCamera(45,16/9,0.05,60);sc.add(cam);
  return {sc,cam,man,fan,flame,hero,sparks,logo,spots};
}

/* ---------- the DMV ---------- */
function buildDmv(){
  const sc=new THREE.Scene();sc.background=new THREE.Color(0xd8d4c0);sc.fog=new THREE.Fog(0xd8d4c0,8,18);
  sc.add(new THREE.HemisphereLight(0xfffbe8,0x8a8470,1.35));
  const sun=new THREE.DirectionalLight(0xfff6e0,0.9);sun.position.set(-2,6,4);sc.add(sun);
  const lino=cvTex(256,256,(x,w,h)=>{for(let i=0;i<8;i++)for(let j=0;j<8;j++){x.fillStyle=(i*3+j*5)%7===0?'#9a9478':(i+j)%2?'#cfc8ac':'#c4bd9e';x.fillRect(i*32,j*32,32,32)}});
  lino.wrapS=lino.wrapT=THREE.RepeatWrapping;lino.repeat.set(6,6);
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.MeshStandardMaterial({map:lino,roughness:0.5}));fl.rotation.x=-Math.PI/2;sc.add(fl);
  const wallM=mat(0xd9cfa8,{roughness:0.9});
  part(sc,'box',wallM,0,1.6,-5,12,3.2,0.1);part(sc,'box',wallM,-5,1.6,0,0.1,3.2,12);part(sc,'box',wallM,5,1.6,0,0.1,3.2,12);part(sc,'box',wallM,0,1.6,4,12,3.2,0.1);
  part(sc,'box',0x8a7e5a,0,0.06,-4.94,12,0.12,0.04);
  const ce=new THREE.Mesh(new THREE.PlaneGeometry(14,14),mat(0xeeeadc));ce.rotation.x=Math.PI/2;ce.position.y=3.1;sc.add(ce);
  const panels=[];for(let x=-3;x<=3;x+=2)for(let z=-4;z<=2;z+=2){const m=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff8e0,emissiveIntensity:1});panels.push(m);part(sc,'box',m,x,3.08,z,1.1,0.03,0.55)}
  // the counter and its four windows; only one is open
  part(sc,'box',0x6a7480,0,0.55,-3.4,8,1.1,0.7);part(sc,'box',0x50565e,0,1.12,-3.4,8.1,0.05,0.8);
  for(let i=0;i<4;i++){const x=-3+i*2;part(sc,'box',mat(0xbfdce8,{transparent:true,opacity:0.25,roughness:0.1}),x,1.6,-3.15,1.6,0.9,0.02);
    const s=sign(0.4,0.26,(c,w,h)=>{c.fillStyle='#1b2a4a';c.fillRect(0,0,w,h);c.fillStyle='#fff';c.font='bold 80px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(String(i+1),w/2,h/2)},0.4);s.position.set(x,2.2,-3.1);sc.add(s);
    if(i){const cl=sign(0.7,0.24,(c,w,h)=>{c.fillStyle='#f4f0e0';c.fillRect(0,0,w,h);c.fillStyle='#b01818';c.font='bold 30px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('WINDOW CLOSED',w/2,h/2)},0.3);cl.position.set(x,1.45,-3.13);sc.add(cl)}}
  // NOW SERVING: red digits above the open window
  const L={};
  L.numT=cvTex(512,160,()=>{});
  const nb=new THREE.Mesh(new THREE.PlaneGeometry(1.6,0.5),new THREE.MeshStandardMaterial({map:L.numT,emissive:0xffffff,emissiveMap:L.numT,emissiveIntensity:1}));
  nb.position.set(-1,2.75,-3.0);sc.add(nb);part(sc,'box',0x111111,-1,2.75,-3.03,1.7,0.6,0.04);
  const pls=sign(2.2,0.34,(c,w,h)=>{c.fillStyle='#f6f2e2';c.fillRect(0,0,w,h);c.fillStyle='#2a2a2a';c.font='bold 72px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('PLEASE HAVE YOUR DOCUMENTS READY',w/2,h/2)},0.2);
  pls.position.set(2.6,2.75,-4.93);sc.add(pls);
  // the wall clock, barely moving
  const face=sign(0.5,0.5,(c,w,h)=>{c.fillStyle='#fff';c.beginPath();c.arc(w/2,h/2,w/2-4,0,TAU);c.fill();c.strokeStyle='#222';c.lineWidth=10;c.stroke();for(let i=0;i<12;i++){const a=i/12*TAU;c.fillStyle='#222';c.fillRect(w/2+Math.sin(a)*(w/2-24)-4,h/2-Math.cos(a)*(h/2-24)-4,8,8)}},0.2);
  face.position.set(4.93,2.4,-1.5);face.rotation.y=-Math.PI/2;sc.add(face);
  L.hand=part(sc,'box',0x111111,4.9,2.4,-1.5,0.01,0.2,0.012);L.hand.geometry=new THREE.BoxGeometry(1,1,1).translate(0,0.4,0);L.hand.scale.set(0.012,0.2,0.012);
  // the clerk, stamping
  const clerk=person({skin:0xd8a888,top:0x8a6a9a,sleeve:0x8a6a9a,bottom:0x4a4a52,hair:0x9a9a9a,style:'bun',glasses:true,w:1.1,brow:0x7a7a7a});
  clerk.g.position.set(-3,0,-3.95);sc.add(clerk.g);L.clerk=clerk;
  L.stamp=part(clerk.armR.el,'cyl',0x5a3a1a,0,-0.32,0.03,0.025,0.08,0.025);
  part(sc,'box',0xf4f2ea,-2.85,1.16,-3.5,0.3,0.04,0.22);
  // chairs, in rows, and the people already waiting
  const chairM=mat(0x2f5aa0,{roughness:0.5}),legM=mat(0x9a9a9a,{metalness:0.6,roughness:0.4});
  const seat=(x,z)=>{part(sc,'box',chairM,x,0.45,z,0.46,0.06,0.44);part(sc,'box',chairM,x,0.72,z+0.2,0.46,0.5,0.05);for(const a of[-0.2,0.2])for(const b of[-0.18,0.18])part(sc,'cyl',legM,x+a,0.22,z+b,0.015,0.44,0.015)};
  for(let r=0;r<3;r++)for(let c=0;c<6;c++)seat(-2.5+c*0.55,-1.4+r*1.0);
  const waiting=[];const sit=(x,z,o)=>{const p=person(o);p.g.position.set(x,-0.47,z);for(const Lg of[p.legL,p.legR]){Lg.hip.rotation.x=-1.5;Lg.knee.rotation.x=1.5}p.g.rotation.y=Math.PI;sc.add(p.g);waiting.push(p);return p};
  sit(-2.5,-1.4,{top:0x7a2a2a,bottom:0x2a2a3a,hair:0x1a1a1a,style:'short'});
  sit(-1.4,-1.4,{top:0x3a6a3a,bottom:0x4a3a2a,hair:0x6a4a2a,style:'bun'});
  sit(-0.3,-1.4,{top:0xc0a060,bottom:0x2a3a5a,hair:0xaaaaaa,style:'short',glasses:true});
  sit(0.25,-0.4,{top:0x5a5aa0,bottom:0x2a2a2a,hair:0x2a1a10,style:'pomp'});
  sit(-1.95,-0.4,{top:0xa04a7a,bottom:0x3a2a3a,hair:0xd8b060,style:'curls'});
  L.waiting=waiting;
  // you: in the back row, holding your number
  seat(-0.85,1.3);
  const cam=new THREE.PerspectiveCamera(70,16/9,0.05,40);cam.position.set(-0.85,1.3,1.25);sc.add(cam);
  L.ticketT=cvTex(256,320,()=>{});
  const hand=grp(cam,0.16,-0.24,-0.42);part(hand,'cap',0xe0b08a,0,-0.07,0.02,0.04,0.05,0.04);
  const tk=new THREE.Mesh(new THREE.PlaneGeometry(0.09,0.11),new THREE.MeshStandardMaterial({map:L.ticketT,roughness:0.8,emissive:0xffffff,emissiveMap:L.ticketT,emissiveIntensity:0.25}));tk.rotation.x=-0.25;hand.add(tk);
  L.hand2=hand;L.panels=panels;
  return {sc,cam,lane:L};
}

/* ---------- the Circle of Life ---------- */
// A soft red tunnel with a heartbeat, a light at the end of it, then a delivery room seen from the newborn's side: blurry ceiling lights,
// a doctor in a mask leaning in, a nurse with a clipboard. Kept gentle: warm rings and light, nothing anatomical.
function buildBirth(){
  const sc=new THREE.Scene();sc.background=new THREE.Color(0x2a0508);sc.fog=new THREE.Fog(0x2a0508,0.5,6);
  const L={};
  const tun=grp(sc);L.tun=tun;
  tun.add(new THREE.AmbientLight(0xff7a7a,0.5));
  const glow=new THREE.PointLight(0xff5a4a,6,4,1.5);tun.add(glow);L.glow=glow;
  const ringM=mat(0xb83a48,{roughness:0.35,emissive:0x400810,emissiveIntensity:0.6}),ringM2=mat(0xd0566a,{roughness:0.3,emissive:0x500a18,emissiveIntensity:0.6});
  L.rings=[];for(let i=0;i<40;i++){const r=new THREE.Mesh(new THREE.TorusGeometry(0.75,0.22,12,28),i%2?ringM:ringM2);r.position.z=-i*0.5;tun.add(r);L.rings.push(r)}
  const tube=new THREE.Mesh(new THREE.CylinderGeometry(0.95,0.95,22,24,1,true),mat(0x7a1822,{side:THREE.BackSide,roughness:0.5}));tube.rotation.x=Math.PI/2;tube.position.z=-10;tun.add(tube);
  L.exit=part(tun,'ball',mat(0xffffff,{emissive:0xffffff,emissiveIntensity:4}),0,0,-20,0.6,0.6,0.1);
  // the delivery room
  const room=grp(sc);room.visible=false;L.room=room;
  room.add(new THREE.HemisphereLight(0xffffff,0xa0c0c0,1.6));
  const key=new THREE.PointLight(0xffffff,10,8,1.2);key.position.set(0,2.8,0);room.add(key);
  part(room,'box',mat(0x9ad0c8,{roughness:0.9}),0,1.5,-3,8,3.2,0.1);part(room,'box',mat(0x9ad0c8,{roughness:0.9}),-3,1.5,0,0.1,3.2,8);part(room,'box',mat(0x9ad0c8,{roughness:0.9}),3,1.5,0,0.1,3.2,8);
  const ce=part(room,'box',mat(0xf2f4f2),0,3.1,0,8,0.05,8);void ce;part(room,'box',mat(0xd8dcd8),0,0,0,8,0.02,8);
  // the big round surgical lamp
  const lamp=grp(room,0,2.6,-0.2);part(lamp,'cyl',mat(0xdfe4e8,{metalness:0.5,roughness:0.3}),0,0.05,0,0.5,0.12,0.5);
  for(let i=0;i<7;i++){const a=i/6*TAU;part(lamp,'cyl',mat(0xffffff,{emissive:0xffffff,emissiveIntensity:3}),i?Math.cos(a)*0.28:0,-0.02,i?Math.sin(a)*0.28:0,0.1,0.02,0.1)}
  part(room,'cyl',mat(0xcfd4d8,{metalness:0.5}),0,2.9,-0.2,0.03,0.4,0.03);
  // the doctor, leaning in; the nurse, writing it down
  const doc=person({skin:0xe0b090,top:0x3a9a7a,sleeve:0x3a9a7a,bottom:0x3a9a7a,hair:0x3a9a7a,style:'bun',glasses:true,w:1.05,brow:0x4a3020,shoes:0xe8e8e8});
  doc.g.position.set(0,0,-0.95);sc.add(doc.g);doc.g.visible=false;L.doc=doc;
  part(doc.head,'box',mat(0xeaf4f4),0,-0.05,0.12,0.2,0.1,0.03);                                        // mask
  for(const A of[doc.armL,doc.armR])part(A.el,'ball',mat(0x8ac0e8,{roughness:0.4}),0,-0.3,0.01,0.055,0.065,0.045);  // gloves
  const nurse=person({skin:0xc08a68,top:0x6a8ad0,sleeve:0x6a8ad0,bottom:0x6a8ad0,hair:0x2a1810,style:'bun',w:1.0,h:0.96});
  nurse.g.position.set(1.05,0,-0.6);nurse.g.rotation.y=-0.9;sc.add(nurse.g);nurse.g.visible=false;L.nurse=nurse;
  part(nurse.armL.el,'box',0x5a3a1a,0,-0.32,0.06,0.16,0.22,0.01);
  const cam=new THREE.PerspectiveCamera(70,16/9,0.05,40);sc.add(cam);
  return {sc,cam,lane:L};
}

/* ---------- the Russian roulette table ---------- */
function revolver(n){
  const g=new THREE.Group(),steel=mat(0x6a6e76,{metalness:0.85,roughness:0.3}),wood=mat(0x5a3418,{roughness:0.6});
  part(g,'cyl',steel,0,0,0.14,0.012,0.16,0.012).rotation.x=Math.PI/2;                                     // barrel (along +z)
  part(g,'box',steel,0,-0.005,0.03,0.03,0.05,0.1);                                                        // frame
  const cyl=grp(g,0,0,0.03);cyl.rotation.x=Math.PI/2;part(cyl,'cyl',steel,0,0,0,0.028,0.055,0.028);
  for(let i=0;i<n;i++){const a=i/n*TAU;part(cyl,'cyl',mat(0x050505),Math.cos(a)*0.017,0.028,Math.sin(a)*0.017,0.006,0.002,0.006)}
  const grip=part(g,'box',wood,0,-0.065,-0.035,0.026,0.09,0.035);grip.rotation.x=0.35;
  const tg=new THREE.Mesh(new THREE.TorusGeometry(0.018,0.004,6,12,Math.PI),steel);tg.rotation.y=Math.PI/2;tg.position.set(0,-0.03,0.01);g.add(tg);
  const ham=part(g,'box',steel,0,0.025,-0.02,0.008,0.02,0.012);
  g.userData={cyl,ham};
  return g;
}
function buildRoulette(rr,me){
  const sc=new THREE.Scene();sc.background=new THREE.Color(0x07060a);sc.fog=new THREE.Fog(0x07060a,3,9);
  sc.add(new THREE.AmbientLight(0x403040,0.6));
  const bulb=new THREE.PointLight(0xffd8a0,9,6,1.4);bulb.position.set(0,2.0,0);sc.add(bulb);
  part(sc,'cyl',0x111111,0,2.6,0,0.005,0.8,0.005);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.22,24,1,true),mat(0x1a3a2a,{side:THREE.DoubleSide,metalness:0.4}));shade.position.set(0,2.12,0);sc.add(shade);
  part(sc,'ball',mat(0xfff0c0,{emissive:0xffd890,emissiveIntensity:3}),0,2.03,0,0.05);
  // the table: dark wood, green felt
  part(sc,'cyl',mat(0x3a2210,{roughness:0.5}),0,0.74,0,0.95,0.06,0.95);part(sc,'cyl',mat(0x1e5a32,{roughness:0.9}),0,0.775,0,0.88,0.01,0.88);
  part(sc,'cyl',mat(0x2a180a),0,0.37,0,0.08,0.72,0.08);part(sc,'cyl',mat(0x2a180a),0,0.02,0,0.45,0.04,0.45);
  part(sc,'box',mat(0x8a6a2a,{metalness:0.6}),0.3,0.79,0.15,0.06,0.02,0.06);                                 // an ashtray
  // a chair and a figure for every player but you; you sit nearest the camera
  const N=rr.seats.length,mi=Math.max(0,rr.seats.findIndex(q=>q.id===me)),seats=[];
  for(let i=0;i<N;i++){
    const a=Math.PI/2+(i-mi)/N*TAU,x=Math.cos(a)*1.25,z=Math.sin(a)*1.25,face=Math.atan2(-x,-z);
    const ch=grp(sc,x,0,z);ch.rotation.y=face;part(ch,'box',mat(0x3a1e10),0,0.45,0,0.44,0.05,0.42);part(ch,'box',mat(0x3a1e10),0,0.75,-0.2,0.44,0.55,0.05);
    for(const p of[[-0.18,-0.17],[0.18,-0.17],[-0.18,0.17],[0.18,0.17]])part(ch,'cyl',mat(0x2a140a),p[0],0.22,p[1],0.018,0.44,0.018);
    const sd={seat:rr.seats[i],ch,a,x,z,face};
    if(i!==mi){const c=rr.seats[i].col||[0.5,0.5,0.5],hex=new THREE.Color(c[0],c[1],c[2]).getHex();
      const p=person({top:hex,sleeve:hex,bottom:0x2a2a30,hair:[0x2a1a0a,0x6a4a2a,0x1a1a1a,0xb08a50][i%4],style:['short','bun','pomp','curls'][i%4],w:1.0});
      p.g.position.set(x,-0.47,z);p.g.rotation.y=face;for(const Lg of[p.legL,p.legR]){Lg.hip.rotation.x=-1.5;Lg.knee.rotation.x=1.5}sc.add(p.g);sd.p=p;
      const tag=sign(0.6,0.12,(cx,w,h)=>{cx.fillStyle='rgba(0,0,0,.6)';cx.fillRect(0,0,w,h);cx.fillStyle='#fff';cx.font='bold 34px Arial';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(String(rr.seats[i].name||'Delver').slice(0,16),w/2,h/2)},0.8);
      tag.position.set(x,1.72,z);tag.rotation.y=face+Math.PI;sc.add(tag)}
    seats.push(sd);
  }
  const gun=revolver(rr.n);sc.add(gun);
  const cam=new THREE.PerspectiveCamera(65,16/9,0.03,30);const my=seats[mi];cam.position.set(my.x*0.95,1.2,my.z*0.95);cam.lookAt(0,0.85,0);sc.add(cam);
  const myGun=revolver(rr.n);myGun.visible=false;cam.add(myGun);
  return {sc,cam,lane:{seats,gun,myGun,mi}};
}

/* ---------- running a break ---------- */
export function createBreaks(renderer,{onBeep,ui}){
  let cur=null;
  const W53=53,per=0.74,checks={14:2.4,36:2.8},lines={3:'I have coupons for these.',14:'Can you check the price on that?',24:'Oh, these are on sale.',36:'That rang up wrong, honey.',46:'Oh wait! I have three more.'};
  const prices=Array.from({length:W53},(_,i)=>0.48+((i*7919)%1453)/100),names=['Cheese slices','Antacids','AA batteries','Fishing line','Wipes','Dill pickles','Magic eraser','Potato chips','Toothpaste','Dish soap','Undershirts','Paper towels','Chicken soup','Detergent','White bread','Aluminum foil','Lubricant spray','Air freshener','Bleach','Sweatpants XL','Vitamins','Car wax','Trash bags','9V batteries','Frozen pizza','Fruit punch','Soda 12-pack','Ramen 24-pack','Butter','Bandages','Bar soap','Crescent rolls','PB cups','Canned meat','Pasta sauce','Brownie mix','Juice pouches','Pudding','Mustard','Ketchup','Garlic powder','Cake mix','Pickle chips','Crackers','Juice pouches','Mac & cheese','Meat sticks','Party pizza','Reading glasses','Paper plates','Cat litter','Birdseed','Lottery tickets'];
  function drawReg(L,a,b){const c=L.regT.userData.cv,x=c.getContext('2d');x.fillStyle='#062810';x.fillRect(0,0,256,128);x.fillStyle='#5dff8a';x.font='bold 26px monospace';x.fillText(a.slice(0,15),12,48);x.textAlign='right';x.font='bold 34px monospace';x.fillText(b,244,104);x.textAlign='left';L.regT.needsUpdate=true}
  function walmart(onDone){
    const S=buildWalmart(),L=S.lane;
    const times=[];let t0=1.4;for(let i=0;i<W53;i++){t0+=per+(checks[i]||0);times.push(t0)}
    const payStart=t0+0.6,payEnd=payStart+4.4,end=payEnd+2.4;let beeped=-1,lineKey=-2;drawReg(L,'WELCOME','$0.00');
    const st={kind:'walmart',S,t:0,yaw:-0.12,pitch:0.02,end,onDone,
      tick(dt){
        const t=(st.t+=dt);
        let n=0;while(n<W53&&t>=times[n])n++;
        while(beeped<n-1){beeped++;onBeep&&onBeep('scan');drawReg(L,names[beeped%names.length].toUpperCase(),'$'+prices[beeped].toFixed(2));L.scan.material.emissiveIntensity=3}
        L.scan.material.emissiveIntensity=Math.max(0.2,L.scan.material.emissiveIntensity-dt*12);
        const prev=n?times[n-1]:1.4,ph=n<W53?clamp((t-prev)/(times[n]-prev),0,1):1,pc=[14,36].find(i=>n===i&&t>times[i]-checks[i]-per*0.6&&t<times[i]-per*0.3);
        L.beltT.offset.y=(L.beltT.offset.y-dt*0.25)%1;
        // groceries: queued on the belt, swept over the scanner, then bagged
        for(let i=0;i<W53;i++){const q=L.items[i],k=i-n;
          if(k<0||k>5){q.visible=false;continue}
          q.visible=true;
          if(k===0&&ph>0.55){const u=ease((ph-0.55)/0.45);q.position.set(0.95-0.1*Math.sin(u*Math.PI),0.92+0.12*Math.sin(u*Math.PI),-2.3-0.5*u);}
          else{const z=-2.25+k*0.33+(k===5?(1-ph)*0.3:0);q.position.x+=(0.95-q.position.x)*Math.min(1,dt*8);q.position.y=0.91;q.position.z+=(z-q.position.z)*Math.min(1,dt*6)}
          if(k===5&&!q.userData.in){q.userData.in=1;q.position.set(0.7,1.0,-0.95)}   // from her hand
        }
        for(let i=0;i<L.bags.length;i++)L.bags[i].visible=i<n/3;
        for(let i=0;i<L.basket.length;i++)L.basket[i].visible=i<(W53-n)/3.6;
        // the lady: reaches for the belt with each item, nods along; writes a check at the end
        const A=L.lady,reach=n<W53&&t<payStart?Math.sin(ph*Math.PI):0;
        pose(A.armL,-0.2-reach*1.1,0.5+reach*0.5,-0.6);           // her left is the belt side (she faces away from you)
        pose(A.armR,-0.35,-0.15,-0.9);
        A.head.rotation.y=Math.sin(t*0.7)*0.25+(t>payStart&&t<payEnd?-0.2:0);A.head.rotation.x=t>payStart&&t<payEnd?0.35:0.05;
        A.chest.rotation.z=reach*0.12;
        if(t>payStart&&t<payEnd){pose(A.armR,-0.9,-0.2,-1.2+Math.sin(t*14)*0.15);pose(A.armL,-0.9,0.3,-1.3);L.check.visible=true;L.check.position.set(0.12,0.95,-1.85)}else L.check.visible=false;
        // the cashier: sweeps each item, picks up the phone for price checks
        const C=S.cashier,sw=n<W53&&ph>0.55?Math.sin(ease((ph-0.55)/0.45)*Math.PI):0;
        pose(C.armR,-0.8-sw*0.4,0.1,-0.9);pose(C.armL,-0.5,-0.1,-0.8);C.head.rotation.x=0.25+Math.sin(t*0.4)*0.05;C.head.rotation.y=Math.sin(t*0.3)*0.1;
        if(pc!==undefined){pose(C.armL,-2.2,0.3,-1.8);L.phone.visible=false}else L.phone.visible=true;
        L.s10.material.emissiveIntensity=0.7+0.25*Math.sin(t*3);
        // the camera: your head, looking where you look, swaying with boredom
        S.cam.rotation.set(st.pitch+Math.sin(t*0.5)*0.01,st.yaw,0,'YXZ');L.hand.position.y=-0.27+Math.sin(t*1.1)*0.006;
        // words on screen
        const say=Object.keys(lines).map(Number).filter(i=>n>=i&&t<(times[i]||payStart)+1.8).pop();
        const key=pc!==undefined?-1:t>=payEnd?100:t>=payStart?99:say==null?-2:say;
        if(key!==lineKey){lineKey=key;ui.caption(key===-1?'':key===99?'"Now where did I put my checkbook..."':key===100?'Cashier: "Next!"':say!=null?'"'+lines[say]+'"':'');ui.callout(key===-1?'PRICE CHECK ON LANE 4':'')}
        if(t>=payStart&&n>=W53&&!st.tot){st.tot=1;drawReg(L,'TOTAL','$'+prices.reduce((a,b)=>a+b,0).toFixed(2))}
        ui.bar(t<payStart?`Item ${Math.min(n+1,W53)} of ${W53}`:t<payEnd?'Paying by check':'Done','You are in line. You cannot move.');
        return t<end;
      }};
    return st;
  }
  function dmv(onDone){
    const S=buildDmv(),L=S.lane,dur=42;
    const drawNum=(n,flash)=>{const c=L.numT.userData.cv,x=c.getContext('2d');x.fillStyle='#120404';x.fillRect(0,0,512,160);x.fillStyle='#ff9a7a';x.font='bold 34px Arial';x.fillText('NOW SERVING',20,46);
      x.fillStyle=flash?'#ffffff':'#ff2a1a';x.font='bold 96px monospace';x.textAlign='right';x.fillText(String(n).padStart(3,'0'),492,140);x.textAlign='left';L.numT.needsUpdate=true};
    const drawTicket=n=>{const c=L.ticketT.userData.cv,x=c.getContext('2d');x.fillStyle='#fffbe8';x.fillRect(0,0,256,320);x.fillStyle='#444';x.font='bold 26px Arial';x.textAlign='center';x.fillText('YOUR NUMBER',128,52);
      x.fillStyle='#b01818';x.font='bold 120px Arial';x.fillText(String(n),128,190);x.fillStyle='#777';x.font='18px Arial';x.fillText('Estimated wait: yes',128,260);for(let i=0;i<256;i+=16)x.fillRect(i,300,8,4);L.ticketT.needsUpdate=true};
    let shown=-1,mine=847;drawTicket(mine);
    const st={kind:'dmv',S,t:0,yaw:0.1,pitch:0.02,end:dur,onDone,
      tick(dt){
        const t=(st.t+=dt);
        // the queue: a number every few seconds, then a sudden jump to you
        const n=t<30?12+Math.floor(t/3.4):t<33?846:847;
        if(n!==shown){shown=n;drawNum(n,false);if(t>0.5)onBeep&&onBeep('ding')}
        if(t>=33&&t<36)drawNum(847,Math.floor(t*4)%2===0);
        if(t>=37&&mine===847){mine=1203;drawTicket(mine)}
        // the clerk stamps, slowly
        const C=L.clerk,ph=(t%2.6)/2.6,up=ph<0.7?ease(ph/0.7):1-ease((ph-0.7)/0.3);
        pose(C.armR,-0.6-up*0.9,0.1,-1.2+up*0.6);pose(C.armL,-0.5,-0.1,-1.0);C.head.rotation.x=0.3;C.head.rotation.y=t>=33&&t<38?0.35:Math.sin(t*0.2)*0.05;
        if(ph>0.98)L.stamp.scale.y=0.9;
        // the waiting room: one asleep, one checking a phone, one tapping a foot
        const Wt=L.waiting;Wt[0].head.rotation.x=0.5+Math.sin(t*0.5)*0.05;Wt[0].head.rotation.z=0.3;
        pose(Wt[1].armL,-1.2,0.2,-1.4);pose(Wt[1].armR,-1.2,-0.2,-1.4);Wt[1].head.rotation.x=0.45;
        Wt[2].legR.knee.rotation.x=1.5+Math.max(0,Math.sin(t*9))*0.15;Wt[3].head.rotation.y=Math.sin(t*0.8)*0.4;Wt[4].head.rotation.z=Math.sin(t*0.3)*0.1;
        L.hand.rotation.x=-t*0.002;
        L.panels[5].emissiveIntensity=Math.random()<0.1?0.2:1;          // the one light that flickers
        S.cam.rotation.set(st.pitch,st.yaw,0,'YXZ');L.hand2.position.y=-0.24+Math.sin(t*0.9)*0.004;
        const cap=t<5?'Intercom: "Please take a number and have a seat."':t>=33&&t<37?'Clerk: "Eight forty-seven? ...Eight forty-seven?"':t>=37?'Clerk: "This is the wrong form. Take another number."':t>=18&&t<23?'Someone behind you sighs very loudly.':'';
        if(cap!==st.cap){st.cap=cap;ui.caption(cap)}
        ui.bar(`Your number: ${mine}  ·  Now serving: ${String(n).padStart(3,'0')}`,'You cannot leave your seat.');
        return t<dur;
      }};
    return st;
  }
  function birth(onDone){
    const S=buildBirth(),L=S.lane,dur=27;
    const caps=[[0,'...thump... thump... thump...'],[5,'There is a light.'],[9,''],[11.5,'Doctor: "There we go! There we go."'],[15,'Doctor: "Congratulations! It\'s a... delver."'],[19,'Nurse: "Seven pounds, two ounces of pure misfortune."'],[23,'You have been born again. Back to the maze with you.']];
    const st={kind:'birth',S,t:0,yaw:0,pitch:0,end:dur,onDone,
      tick(dt){
        const t=(st.t+=dt),C=S.cam;
        if(t<9){
          L.tun.visible=true;L.room.visible=false;L.doc.g.visible=L.nurse.g.visible=false;
          const z=-Math.min(t,8.5)*1.15;C.position.set(Math.sin(t*1.3)*0.05,Math.cos(t*1.1)*0.04,z);C.rotation.set(0,0,Math.sin(t*0.6)*0.1);
          const beat=Math.pow(Math.max(0,Math.sin(t*Math.PI*1.2)),12);L.rings.forEach((r,i)=>r.scale.setScalar(1-beat*0.06*Math.sin(i)));
          L.glow.position.set(0,0,z-0.6);L.glow.intensity=5+beat*6;
          const near=Math.max(0,(t-5)/4);S.sc.fog.color.setRGB(0.16+near*0.8,0.02+near*0.85,0.03+near*0.85);S.sc.background.copy(S.sc.fog.color);S.sc.fog.far=6+near*20;
          if(t>8.3)ui.flash(1);
        }else{
          if(L.tun.visible){L.tun.visible=false;L.room.visible=true;L.doc.g.visible=L.nurse.g.visible=true;ui.flash(0)}
          // blurry at first: white fog that clears as your eyes open
          const k=ease((t-9)/5);S.sc.background.setRGB(0.95,0.97,0.97);S.sc.fog.color.setRGB(0.95,0.97,0.97);S.sc.fog.near=0.05;S.sc.fog.far=0.6+k*12;
          // you are held up to the doctor, then turned towards the nurse
          const lift=ease((t-11)/2.5),turn=ease((t-18.5)/1.5)-ease((t-22)/1.5);
          C.position.set(Math.sin(t*1.3)*0.02,0.95+lift*0.4,0.35-lift*0.25);
          // look up at the lamp, then at the doctor's face, then over at the nurse
          const hd=new THREE.Vector3(),nh=new THREE.Vector3();L.doc.head.getWorldPosition(hd);L.nurse.head.getWorldPosition(nh);
          const lookP=new THREE.Vector3(0,2.6,-0.2).lerp(hd,lift).lerp(nh,turn);C.lookAt(lookP);C.rotateZ(Math.sin(t*1.1)*0.05);
          const D=L.doc;D.chest.rotation.x=0.35-lift*0.2;pose(D.armL,-1.3+lift*0.2,0.3,-0.8);pose(D.armR,-1.3+lift*0.2,-0.3,-0.8);
          D.head.rotation.x=0.3*(1-lift);D.head.rotation.z=t>15&&t<19?Math.sin(t*3)*0.08:0;
          const N=L.nurse;pose(N.armL,-1.1,0.1,-1.2);pose(N.armR,-0.9,-0.1,-1.4+Math.sin(t*12)*0.1);N.head.rotation.x=t>19&&t<23?0:0.35;
        }
        let c='';for(const q of caps)if(t>=q[0])c=q[1];if(c!==st.cap){st.cap=c;ui.caption(c)}
        ui.bar('','You cannot move. You are a newborn.');
        return t<dur;
      }};
    return st;
  }
  function roulette(onDone,o){
    const rr0=o.rr(),S=buildRoulette(rr0,o.me),L=S.lane;let ver=-1,evT=0,slump=-1,lastCap='';
    const st={kind:'roulette',S,t:0,yaw:0,pitch:-0.15,end:1e9,onDone,
      tick(dt){
        const t=(st.t+=dt),rr=o.rr();if(!rr)return true;
        if(rr.ver!==ver){ver=rr.ver;evT=0;if(rr.ev==='bang'){slump=rr.loser;ui.flash(rr.loser===L.mi?2:1)}}
        evT+=dt;
        const mine=rr.turn===L.mi,active=rr.phase==='aim'||rr.phase==='click'||rr.phase==='bang';
        // others: the one whose turn it is raises the revolver; whoever lost slumps over the table
        L.seats.forEach((sd,i)=>{if(!sd.p)return;const P=sd.p,up=active&&rr.turn===i&&!(rr.phase==='bang'&&slump===i)?1:0;
          pose(P.armR,-0.9-up*1.7,0.1+up*0.3,-0.6-up*1.0);pose(P.armL,-0.7,-0.1,-0.9);
          P.chest.rotation.x=slump===i?Math.min(0.95,evT*3):0;P.head.rotation.x=slump===i?0.6:Math.sin(t*0.6+i)*0.05;
          P.head.rotation.y=slump===i?0:Math.atan2(Math.sin(L.seats[rr.turn].a-sd.a),1)*0.5});
        const cylSpin=rr.ev==='spin'&&evT<1.2?(1.2-evT)*40:0;
        if(mine&&active&&!(rr.phase==='bang')){
          L.gun.visible=false;L.myGun.visible=true;
          const shake=Math.sin(t*23)*0.003+Math.sin(t*31)*0.002,kick=rr.ev==='click'?Math.max(0,0.25-evT)*0.3:0;
          L.myGun.position.set(0.17+shake,-0.15+kick,-0.42);L.myGun.rotation.set(-0.9+kick*3,0.5,0.15);L.myGun.scale.setScalar(0.8);
          L.myGun.userData.cyl.rotation.y+=cylSpin*dt;L.myGun.userData.ham.position.z=rr.ev==='click'&&evT<0.3?-0.005:-0.02;
        }else{
          L.myGun.visible=false;L.gun.visible=true;
          const sd=L.seats[rr.turn];
          if(active&&sd.p&&rr.phase!=='bang'){const h=new THREE.Vector3();sd.p.armR.hand.getWorldPosition(h);L.gun.position.copy(h);L.gun.rotation.set(-1.3,sd.face+Math.PI,0)}
          else{L.gun.position.set(0,0.8,0);L.gun.rotation.set(Math.PI/2,t*0.05,0)}
          L.gun.userData.cyl.rotation.y+=cylSpin*dt;
        }
        S.cam.lookAt(0,0.9,0);S.cam.rotateY(st.yaw);S.cam.rotateX(st.pitch+0.15);
        const name=rr.seats[rr.turn].name||'Delver';
        const cap=rr.phase==='aim'?(mine?'Your turn. Spin the cylinder if you like, then pull the trigger.':name+'\'s turn.'):rr.phase==='click'?'*click*':rr.phase==='bang'?'BANG.':rr.phase==='done'?'Everyone survived. This time.':'';
        if(cap!==lastCap){lastCap=cap;ui.caption(cap)}
        ui.rr({mine:mine&&rr.phase==='aim',spun:rr.spun,left:rr.phase==='aim'?rr.phT:null,chambers:rr.n,players:rr.seats.length,act:o.act});
        return true;
      }};
    return st;
  }
  function ad(onDone){
    const S=buildAd(),dur=30;
    const cap=[[0,'Is your torch guttering?'],[6,'Shades smelling you from three halls away?'],[12,'Try GLOWBRITE™ Lamp Oil!'],[17,'Now with 30% more flicker.*'],[23,'']];
    let ck=-1;
    const st={kind:'ad',S,t:0,end:dur,onDone,
      tick(dt){
        const t=(st.t+=dt),M=S.man,Fa=S.fan;
        S.spots.forEach((l,i)=>l.position.set(Math.cos(t*0.8+i*2.1)*3,2.5+Math.sin(t*1.3+i)*0.5,Math.sin(t*0.8+i*2.1)*3+1));
        const talk=Math.max(0,Math.sin(t*11))*(t<23?1:0);M.mouth.scale.y=0.012*(1+talk*2.5);
        M.head.rotation.y=Math.sin(t*0.9)*0.15;M.head.rotation.x=Math.sin(t*2.2)*0.05;M.chest.rotation.z=Math.sin(t*1.8)*0.04;
        let cam;
        if(t<6){cam=[-0.3+t*0.03,1.5,2.6-t*0.08];pose(M.armL,-0.4-Math.abs(Math.sin(t*2))*0.8,0.3,-0.6);pose(M.armR,-0.5,-0.1,-1.2)}
        else if(t<12){cam=[-0.45,1.55,1.5];M.head.rotation.y=0.3*Math.sin(t*3);pose(M.armL,-1.4,0.6,-1.5);pose(M.armR,-0.6,-0.1,-1.3)}   // hand to the cheek: the horror
        else if(t<17){const a=(t-12)*0.5-0.6;cam=[Math.sin(a)*3.0,1.1,-0.4+Math.cos(a)*3.0]}
        else if(t<23){cam=[0.15,1.35,2.8];pose(M.armL,-2.6,0.2,-0.2);pose(M.armR,-1.1,-0.1,-0.9);pose(Fa.armL,-2.6,-0.2,-0.2);pose(Fa.armR,-1.0,0,-0.8);Fa.chest.position.y=0.92+Math.abs(Math.sin(t*5))*0.04}
        else{cam=[0,1.7,4.2]}
        S.hero.visible=t>=12&&t<17||t>=23;S.hero.rotation.y=t*1.2;S.hero.position.set(0,t>=23?0.05:0.15,t>=23?-0.9:-0.4);
        M.g.visible=!(t>=12&&t<17);Fa.g.visible=t>=17&&t<23;S.logo.visible=t>=23;
        S.flame.scale.set(0.07+Math.sin(t*20)*0.01,0.12+Math.sin(t*27)*0.02,0.07);
        S.sparks.forEach((s,i)=>{s.visible=S.hero.visible;const a=t*1.5+i*0.9,r=0.9+(i%5)*0.15;s.position.set(Math.cos(a)*r,0.2+((i*37)%30)/12+Math.sin(t*3+i)*0.1,Math.sin(a)*r-0.4);s.scale.setScalar(0.015+0.015*Math.abs(Math.sin(t*6+i)))});
        S.cam.position.set(...cam);S.cam.lookAt(t>=12&&t<17?0:t>=23?0:-0.1,t>=12&&t<17?0.85:t>=23?1.55:1.35,t>=12&&t<17?-0.4:t>=23?-0.7:0);
        let c='';for(const q of cap)if(t>=q[0])c=q[1];if(c!==ck){ck=c;ui.caption(c)}
        ui.adClock(t,dur);
        return t<dur;
      }};
    return st;
  }
  return {
    get active(){return !!cur},get kind(){return cur&&cur.kind},
    start(kind,onDone,o){if(cur)this.stop(true);cur=kind==='ad'?ad(onDone):kind==='dmv'?dmv(onDone):kind==='birth'?birth(onDone):kind==='roulette'?roulette(onDone,o):walmart(onDone);ui.open(kind)},
    seek(t){if(cur)cur.t=t},   // for tools/wheel_test.mjs
    look(dx,dy){if(!cur||cur.kind==='ad'||cur.kind==='birth')return;cur.yaw=clamp(cur.yaw-dx,-1.6,1.6);cur.pitch=clamp(cur.pitch-dy,-0.9,0.7)},
    stop(silent){if(!cur)return;const c=cur;cur=null;ui.close();c.S.sc.traverse(o=>{if(o.geometry&&!Object.values(G).includes(o.geometry))o.geometry.dispose()});if(!silent&&c.onDone)c.onDone()},
    render(dt){
      if(!cur)return;
      const c=cur,alive=c.tick(Math.min(dt,1));
      const s=renderer.getSize(new THREE.Vector2());c.S.cam.aspect=s.x/Math.max(1,s.y);c.S.cam.updateProjectionMatrix();
      renderer.render(c.S.sc,c.S.cam);
      if(!alive)this.stop();
    },
  };
}
