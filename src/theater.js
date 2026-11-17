// The picture house: a walkable cinema behind a strange door.
//   calm    the teenagers are glued to the screen; nothing happens however long you stay, until you SPEAK within 10 ft of one
//   huh     every teen turns to you at once and says "huh?"; the entrance slams shut
//   attack  they lean in and hurl insults (each one costs a heart) until you YELL "silence, peasants"
//   crying  they burst into tears, the EXIT sign turns green and the side door unlocks
// The screen plays an allow-listed YouTube video (a DOM player laid over the canvas, see THEATER_VIDEOS) and falls back to a drawn "house reel".
import * as THREE from 'three';

/* ---------- the allow-list ----------
   ONLY these videos are ever played, and nothing else can be reached: the player is created with no controls, no keyboard, no suggestions,
   pointer-events:none, and it only ever moves on to the next id in THIS list. Andrew: edit the list freely (11-character YouTube ids).
   An empty list simply means the screen always shows the offline house reel. */
export const THEATER_VIDEOS=[
  {id:'vkkNuCsEa8c',title:'11 Hours of Kinetic Sand ASMR',by:'Sand Tagious'},
  {id:'Kta9uDyeRh0',title:'1 Hour Oddly Satisfying Kinetic Sand Cutting and Crushing ASMR',by:'ASMUR'},
  {id:'tV1PWf_YLUE',title:'Purely Relaxing Kinetic Sand ASMR',by:'SandPure'},
  {id:'GA1D88HF0xE',title:'Heavy Rain on Window, 30 Minute Rain Sounds',by:'ΣHAANTI - Virtual Environment'},
  {id:'LX-kcOcNez8',title:'ASMR Wood Carving - No Talking',by:'BeaverCraft'},
  {id:'ld6dB17yDcQ',title:'ASMR Wood Carving - No Talking (part 2)',by:'BeaverCraft'},
  {id:'27xXPg3T9Uc',title:'Wood carving (no talking ASMR)',by:'ASMRSurge'},
  {id:'VABl4mFT7uk',title:'ASMR Keyboard Typing (No Talking)',by:'ASMRMagic'},
  {id:'o7XGuBZ_ydE',title:'ASMR Typing & Paperwork, Page Turning, No Talking',by:'Poisabloom ASMR'},
  {id:'Tn8IDh21AVY',title:'ASMR 15 Keyboards with Fast Typing (No Talking)',by:'ASMR PPOMO'},
];

/* ---------- tunables ----------
   The room is built in metres, like the kiln hall (eye height 1.6): one room unit = 1 m. */
export const TH={
  TEEN_RANGE:3.05,      // 10 ft = 3.05 m: speak this close to any teen and they notice
  SPEAK:0.03,           // mic RMS above this counts as speech (the same level voice.js calls loud)
  SPEAK_TIME:0.25,      // seconds of speech (while in range) before the teens turn
  YELL:0.12,            // mic RMS peak that counts as a yell, clearly louder than speech
  YELL_WINDOW:2.5,      // the words must have been shouted within this many seconds before they were recognised
  YELL_HOLD:1.0,        // fallback without speech recognition: a yell this long counts as the phrase
  HUH_TIME:1.2,         // from "huh?" to the first insults
  FIRST_INSULT:1.5,     // seconds into the attack before the first insult
  INSULT_EVERY:3.5,     // seconds between insults (each costs one heart)
  SCREEN_DUCK:0.7,      // the screen is played this much quieter than it could be, so it cannot drown out your voice
  YT_READY_MS:6000,     // give the video this long to start before the house reel takes over
  KEY_YELL_HOLD:1.0,    // no microphone: hold V this long to yell the phrase
};
// mild and non-hateful only: these exact lines, no others
export const INSULTS=['ok boomer','L + ratio',"that's so mid",'skill issue','who asked?','touch grass','negative aura','NPC behavior','bro fell off','cringe',"you're cooked",'no rizz','delulu','bro thinks he\'s the main character',"it's giving... nothing"];

// does what was heard contain the phrase? "silen..." plus peasant (or what a recogniser makes of it)
export function heardPhrase(text){
  const w=String(text||'').toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/).filter(Boolean);
  return w.some(x=>x.startsWith('silen'))&&w.some(x=>/^(peasants?|pheasants?|pleasants?|presents?|peasantry)$/.test(x));
}
const yid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{11}$/.test(s);

// the homography that carries the unit rectangle [0,w]x[0,h] onto four screen points (tl,tr,br,bl), as a CSS matrix3d
function quadMatrix(w,h,p){
  const src=[[0,0],[w,0],[w,h],[0,h]],A=[],b=[];
  for(let i=0;i<4;i++){const [x,y]=src[i],[X,Y]=p[i];A.push([x,y,1,0,0,0,-x*X,-y*X]);b.push(X);A.push([0,0,0,x,y,1,-x*Y,-y*Y]);b.push(Y)}
  for(let c=0;c<8;c++){
    let m=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[m][c]))m=r;
    if(Math.abs(A[m][c])<1e-12)return null;
    [A[c],A[m]]=[A[m],A[c]];[b[c],b[m]]=[b[m],b[c]];
    for(let r=0;r<8;r++){if(r===c)continue;const f=A[r][c]/A[c][c];for(let k=c;k<8;k++)A[r][k]-=f*A[c][k];b[r]-=f*b[c]}
  }
  const h8=b.map((v,i)=>v/A[i][i]);
  return `matrix3d(${h8[0]},${h8[3]},0,${h8[6]},${h8[1]},${h8[4]},0,${h8[7]},0,0,1,0,${h8[2]},${h8[5]},0,1)`;
}

// one shared style sheet for the DOM bits (bubbles, the "now playing" line)
function ensureStyle(){
  if(document.getElementById('theaterCss'))return;
  const s=document.createElement('style');s.id='theaterCss';
  s.textContent=`#theaterLayer{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:2}
#theaterYT{position:fixed;left:0;top:0;width:1280px;height:720px;transform-origin:0 0;pointer-events:none;z-index:1;visibility:hidden;background:#000}
#theaterYT iframe{width:100%;height:100%;border:0;pointer-events:none;display:block}
.thb{position:absolute;left:0;top:0;white-space:nowrap;font:900 26px/1.1 "Comic Sans MS","Chalkboard SE","Marker Felt",Impact,sans-serif;color:#141414;background:#fff;border:3px solid #141414;border-radius:20px;padding:6px 15px;box-shadow:3px 4px 0 rgba(0,0,0,.55);will-change:transform,opacity}
.thb::after{content:'';position:absolute;left:50%;bottom:-13px;margin-left:-8px;border:8px solid transparent;border-top:13px solid #141414;border-bottom:0}
.thb::before{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-6px;border:6px solid transparent;border-top:10px solid #fff;border-bottom:0;z-index:1}
.thb.big{font-size:40px;background:#fff35a;padding:8px 20px}.thb.big::before{border-top-color:#fff35a}
.thb.cry{background:#cfe9ff}.thb.cry::before{border-top-color:#cfe9ff}
#theaterNow{position:fixed;left:14px;bottom:14px;max-width:min(520px,80vw);font-size:13px;line-height:1.4;color:#ffd9a0;background:rgba(10,6,6,.62);border:1px solid rgba(255,190,110,.35);border-radius:8px;padding:6px 10px;pointer-events:auto;z-index:6;text-shadow:0 1px 3px #000}
#theaterNow a{color:#ffe7b8;text-decoration:underline}#theaterNow small{opacity:.7}`;
  document.head.appendChild(s);
}

export function createTheater(env){
  const {renderer,scene,cam,o,A,canvasTex,glow,clamp,ss,lerp,nf,rnd,onClear,getGroup,finish}=env;
  const opts=A.theaterOpts;
  const FY=z=>0.15*clamp(z+5,0,9);               // the floor rises toward the back
  const RX=6,ZF=-9,ZB=8,RH=8.4,EYE=1.6,RAD=0.32;
  const SCR={w:7.1,h:4.0,cy:5.6,z:ZF+0.31};         // the screen: its lower edge (3.6 m) is above any standing head, even on the back landing
  const SPAWN={x:-3.5,z:7.15},ENT={x:-3.5},EXIT={z:-6.5};
  const ROWZ=[-3.5,-2,-0.5,1,2.5,4],BLOCKS=[[-4.9,-4.1,-3.3,-2.5],[-0.8,0,0.8],[2.5,3.3,4.1,4.9]];

  return function theater(seed){
    const group=getGroup();
    const rng=(()=>{let a=(seed>>>0)||1;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})();
    const S={t:0,st:'calm',stT:0,px:SPAWN.x,pz:SPAWN.z,yaw:0,pitch:-0.02,ux:0,uz:0,vx:SPAWN.x,vz:SPAWN.z,vyaw:0,vpitch:-0.02,tx:SPAWN.x,tz:SPAWN.z,tyaw:0,tpitch:-0.02,hasPose:false,
      bob:0,bobP:0,eyeY:EYE+FY(SPAWN.z),shake:0,fade:0,over:null,overT:0,
      tv:'reel',np:null,mic:'idle',lvl:0,speechT:0,yellT:0,insults:0,hits:0,insT:0,lastIns:-1,hint:'',hintT:0,unlocked:false,rattleT:0,entLocked:false,
      keyHold:0,teens:[],bubbles:[],test:{level:null},heard:[],watching:A.watching};
    cam.fov=70;cam.near=0.05;cam.far=90;
    scene.fog=new THREE.FogExp2(0x0a0508,0.012);
    const live=!A.watching;

    /* ---------- the room ---------- */
    const tex=(w,h,draw,rep)=>canvasTex(w,h,draw,rep);
    const carpet=tex(256,256,(c,w)=>{c.fillStyle='#4a1016';c.fillRect(0,0,w,w);c.strokeStyle='#b8862e';c.lineWidth=3;
      for(let i=0;i<2;i++)for(let j=0;j<2;j++){const x=i*128+64,y=j*128+64;c.beginPath();c.moveTo(x,y-46);c.lineTo(x+46,y);c.lineTo(x,y+46);c.lineTo(x-46,y);c.closePath();c.stroke();c.fillStyle='#7a1c24';c.fill();c.fillStyle='#d6a640';c.fillRect(x-4,y-4,8,8)}
      for(let i=0;i<1800;i++){c.fillStyle=`rgba(0,0,0,${rnd()*0.18})`;c.fillRect(rnd()*w,rnd()*w,2,2)}},true);
    carpet.repeat.set(5,6);
    const wallT=tex(256,256,(c,w)=>{c.fillStyle='#5a1822';c.fillRect(0,0,w,w);for(let x=0;x<w;x+=64){c.fillStyle='#6a2030';c.fillRect(x+4,0,56,w);c.fillStyle='rgba(0,0,0,0.28)';c.fillRect(x,0,4,w);c.fillStyle='rgba(255,200,160,0.07)';c.fillRect(x+10,0,6,w)}
      c.fillStyle='#b8862e';c.fillRect(0,w*0.62,w,5);c.fillStyle='#2a0c10';c.fillRect(0,w*0.63,w,w)},true);
    wallT.repeat.set(5,1);
    const velvet=tex(128,128,(c,w)=>{const g=c.createLinearGradient(0,0,w,0);for(let i=0;i<=8;i++)g.addColorStop(i/8,i%2?'#8a1626':'#5e0e1a');c.fillStyle=g;c.fillRect(0,0,w,w)},true);
    const M={
      carpet:new THREE.MeshStandardMaterial({map:carpet,roughness:1}),
      wall:new THREE.MeshStandardMaterial({map:wallT,roughness:0.95}),
      ceil:new THREE.MeshStandardMaterial({color:0x2a1218,roughness:1}),
      velvet:new THREE.MeshStandardMaterial({map:velvet,roughness:0.9}),
      seat:new THREE.MeshStandardMaterial({color:0xb02a3a,roughness:0.85}),
      seatD:new THREE.MeshStandardMaterial({color:0x2a1014,roughness:0.9}),
      wood:new THREE.MeshStandardMaterial({color:0x4a2a18,roughness:0.7}),
      black:new THREE.MeshStandardMaterial({color:0x08080a,roughness:0.6}),
      brass:new THREE.MeshStandardMaterial({color:0xc29a3a,roughness:0.35,metalness:0.7}),
    };
    const box=(w,h,d,x,y,z,m,par)=>{const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m||M.black);q.position.set(x,y,z);(par||group).add(q);return q};
    const quad=(pts,uv,m)=>{const g=new THREE.BufferGeometry(),p=[],u=[];for(const i of [0,1,2,0,2,3]){p.push(...pts[i]);u.push(...uv[i])}
      g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.computeVertexNormals();
      const q=new THREE.Mesh(g,m);m.side=THREE.DoubleSide;group.add(q);return q};
    const UV=[[0,0],[1,0],[1,1],[0,1]];
    // floor: flat at the front, a ramp under the seats, a flat landing at the back
    const fl=(z0,z1)=>quad([[-RX,FY(z0),z0],[RX,FY(z0),z0],[RX,FY(z1),z1],[-RX,FY(z1),z1]],UV,M.carpet);
    fl(ZF,-5);fl(-5,4);fl(4,ZB);
    quad([[-RX,RH,ZF],[RX,RH,ZF],[RX,RH,ZB],[-RX,RH,ZB]],UV,M.ceil);
    // walls
    const wall=(x0,z0,x1,z1,w)=>{const q=quad([[x0,0,z0],[x1,0,z1],[x1,RH,z1],[x0,RH,z0]],UV,M.wall);return q};
    wall(-RX,ZB,-RX,ZF);wall(RX,ZF,RX,ZB);wall(-RX,ZF,RX,ZF);wall(RX,ZB,-RX,ZB);
    // the screen wall: a black frame, the picture, velvet curtains and a valance with a chase of bulbs
    box(SCR.w+0.6,SCR.h+0.6,0.2,0,SCR.cy,ZF+0.15,M.black);
    S.reel=makeReel();
    S.screen=new THREE.Mesh(new THREE.PlaneGeometry(SCR.w,SCR.h),new THREE.MeshBasicMaterial({map:S.reel.tex,color:new THREE.Color(1.15,1.15,1.15)}));
    S.screen.position.set(0,SCR.cy,SCR.z);group.add(S.screen);
    for(const sx of [-1,1]){const cw=2.1;box(cw,RH,0.45,sx*(SCR.w/2+0.3+cw/2),RH/2,ZF+0.3,M.velvet);box(0.5,RH,0.6,sx*(SCR.w/2+0.3+cw+0.1),RH/2,ZF+0.4,M.velvet)}
    box(RX*2,0.9,0.7,0,RH-0.45,ZF+0.4,M.velvet);
    S.bulbs=[];for(let i=0;i<19;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(0.07,8,6),new THREE.MeshBasicMaterial({color:0x553311}));b.position.set(-5.4+i*0.6,RH-0.95,ZF+0.8);group.add(b);S.bulbs.push(b)}
    box(RX*2-1,0.5,1.4,0,0.25,ZF+0.9,M.wood);   // the lip of the stage
    // seats
    const seats=[];for(const z of ROWZ)for(const bl of BLOCKS)for(const x of bl)seats.push([x,z]);
    const iBase=new THREE.InstancedMesh(new THREE.BoxGeometry(0.58,0.16,0.54),M.seat,seats.length),iBack=new THREE.InstancedMesh(new THREE.BoxGeometry(0.58,0.62,0.12),M.seat,seats.length),iLeg=new THREE.InstancedMesh(new THREE.BoxGeometry(0.46,0.44,0.4),M.seatD,seats.length);
    {const m4=new THREE.Matrix4(),c=new THREE.Color();seats.forEach(([x,z],i)=>{const y=FY(z),k=0.85+((i*37)%7)*0.04;c.setRGB(k,k*0.95,k*0.95);
      m4.makeTranslation(x,y+0.46,z);iBase.setMatrixAt(i,m4);iBase.setColorAt(i,c);m4.makeTranslation(x,y+0.82,z+0.27);iBack.setMatrixAt(i,m4);iBack.setColorAt(i,c);m4.makeTranslation(x,y+0.22,z+0.04);iLeg.setMatrixAt(i,m4)});
      group.add(iBase,iBack,iLeg)}
    // the aisle lights
    for(const x of [-1.7,1.7])for(const z of ROWZ){box(0.06,0.04,0.3,x+(x<0?0.45:-0.45),FY(z)+0.03,z,new THREE.MeshBasicMaterial({color:new THREE.Color(1.6,0.9,0.3)}))}
    // the entrance (behind you) and its sign
    const eY=FY(ZB);
    box(1.7,2.7,0.12,ENT.x,eY+1.35,ZB-0.04,M.black);
    box(1.3,2.4,0.1,ENT.x,eY+1.2,ZB-0.12,M.wood);box(0.1,0.8,0.06,ENT.x+0.45,eY+1.2,ZB-0.2,M.brass);
    S.entMark=box(1.3,0.24,0.05,ENT.x,eY+2.95,ZB-0.08,new THREE.MeshBasicMaterial({map:tex(256,48,(c,w,h)=>{c.fillStyle='#220';c.fillRect(0,0,w,h);c.font='bold 30px Georgia,serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#ffd27a';c.fillText('ENTRANCE',w/2,h/2+2)}),color:new THREE.Color(1.1,1.1,1.1)}));
    // the etiquette poster
    S.poster=box(1.0,1.4,0.04,-0.6,eY+1.75,ZB-0.06,new THREE.MeshBasicMaterial({map:tex(500,700,(c,w,h)=>{
      c.fillStyle='#14100a';c.fillRect(0,0,w,h);c.strokeStyle='#c29a3a';c.lineWidth=8;c.strokeRect(14,14,w-28,h-28);c.lineWidth=3;c.strokeRect(30,30,w-60,h-60);
      c.fillStyle='#c29a3a';c.textAlign='center';c.textBaseline='middle';c.font='bold 34px Georgia,serif';c.fillText('PLEASE NOTE',w/2,100);
      c.beginPath();c.moveTo(90,140);c.lineTo(w-90,140);c.stroke();
      c.fillStyle='#fff3d6';c.font='bold 86px Georgia,serif';c.fillText('SILENCE,',w/2,270);c.fillText('PEASANTS.',w/2,380);
      c.fillStyle='#c29a3a';c.font='italic 36px Georgia,serif';c.fillText('— The Management',w/2,520);
      c.font='22px Georgia,serif';c.fillStyle='#8a7a5a';c.fillText('THE PICTURE HOUSE · EST. LONG AGO',w/2,610)}),color:new THREE.Color(1.35,1.3,1.2)}));
    box(1.12,1.52,0.06,-0.6,eY+1.75,ZB-0.03,M.brass);
    // the side exit and its sign
    box(0.12,2.5,1.5,RX-0.04,1.25,EXIT.z,M.black);box(0.1,2.2,1.2,RX-0.1,1.1,EXIT.z,new THREE.MeshStandardMaterial({color:0x2c3a34,roughness:0.6,metalness:0.3}));box(0.08,0.1,1.0,RX-0.18,1.05,EXIT.z,M.brass);
    S.exitDoor=null;
    const exitTex=tex(256,96,(c,w,h)=>{c.fillStyle='#fff';c.fillRect(0,0,w,h);c.fillStyle='#000';c.fillRect(6,6,w-12,h-12);c.fillStyle='#fff';c.font='bold 66px Arial,Helvetica,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('EXIT',w/2,h/2+4)});
    S.sign=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.34,0.9),[M.black,M.black,M.black,M.black,new THREE.MeshBasicMaterial({color:0xffffff}),M.black]);
    S.sign.position.set(RX-0.07,2.82,EXIT.z);group.add(S.sign);
    S.signFace=new THREE.Mesh(new THREE.PlaneGeometry(0.9,0.34),new THREE.MeshBasicMaterial({map:exitTex,color:new THREE.Color(2.4,0.12,0.1)}));
    S.signFace.position.set(RX-0.125,2.82,EXIT.z);S.signFace.rotation.y=-Math.PI/2;group.add(S.signFace);
    S.signLight=new THREE.PointLight(0xff2a1a,5,8,1.6);S.signLight.position.set(RX-0.8,2.7,EXIT.z);group.add(S.signLight);
    // lights: ambient so you can see, the screen's own flicker, a couple of wall lamps
    group.add(new THREE.AmbientLight(0x6a5a78,1.5));
    S.hemi=new THREE.HemisphereLight(0x9a8aa8,0x2a1014,0.7);group.add(S.hemi);
    S.sLight=new THREE.PointLight(0xaaccff,120,34,1.4);S.sLight.position.set(0,SCR.cy-0.5,ZF+3.5);group.add(S.sLight);
    for(const [x,z] of [[-RX+0.2,-3],[-RX+0.2,3],[RX-0.2,0.5],[RX-0.2,5]]){box(0.12,0.3,0.2,x,FY(z)+2.4,z,M.brass);const g=glow(0xffb070,1.6,0.6);g.position.set(x+(x<0?0.3:-0.3),FY(z)+2.4,z);group.add(g)}
    S.lampL=new THREE.PointLight(0xffb878,22,16,1.5);S.lampL.position.set(0,5.5,2);group.add(S.lampL);
    // where you cannot walk: seat blocks and the walls
    const BOXES=[];for(const z of ROWZ)for(const bl of BLOCKS)BOXES.push([bl[0]-0.36,bl[bl.length-1]+0.36,z-0.38,z+0.38]);
    BOXES.push([-RX,RX,ZF,ZF+1.2]);

    /* ---------- the teenagers ---------- */
    const eyeMat=new THREE.MeshBasicMaterial({color:new THREE.Color(0.8,0.85,1)});
    const eyeGlows=[];
    const HOODS=[[0.9,0.45,0.1],[0.1,0.55,0.55],[0.55,0.2,0.65],[0.35,0.35,0.4],[0.8,0.15,0.2],[0.15,0.35,0.7],[0.75,0.7,0.2]];
    const SKIN=[[0.95,0.75,0.62],[0.75,0.52,0.38],[0.55,0.36,0.26],[0.9,0.68,0.5],[0.42,0.27,0.2],[0.98,0.82,0.7]];
    const HAIR=[[0.1,0.07,0.05],[0.55,0.35,0.12],[0.85,0.7,0.3],[0.05,0.05,0.07],[0.4,0.15,0.1],[0.3,0.3,0.34]];
    const stdMat=c=>new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(c[0],c[1],c[2],THREE.SRGBColorSpace),roughness:0.9});
    const wet=new THREE.MeshBasicMaterial({color:new THREE.Color(0.7,0.85,1.2),transparent:true,opacity:0.8});
    const dropGeo=new THREE.SphereGeometry(0.014,6,5),tearGeo=new THREE.SphereGeometry(0.03,8,6);
    const pick=[];{const ok=[];seats.forEach(([x,z])=>{if(Math.hypot(x-SPAWN.x,z-SPAWN.z)>TH.TEEN_RANGE+0.8)ok.push([x,z])});
      for(let n=0;n<6&&ok.length;n++){const i=(rng()*ok.length)|0,s=ok.splice(i,1)[0];pick.push(s);for(let k=ok.length-1;k>=0;k--)if(Math.hypot(ok[k][0]-s[0],ok[k][1]-s[1])<1.55)ok.splice(k,1)}}
    pick.forEach(([x,z],i)=>S.teens.push(makeTeen(i,x,z)));
    function makeTeen(i,x,z){
      const T={i,x,z,y:FY(z),g:new THREE.Group(),shout:0,cry:0,phone:i%2===0,hood:i%3!==1,drip:rng()*3,dropY:-1,dropV:0,bubbleT:0,ph:rng()*6.28,tears:[]};
      const hoodC=HOODS[(i+((rng()*3)|0))%HOODS.length],skin=SKIN[(rng()*SKIN.length)|0],hair=HAIR[(rng()*HAIR.length)|0];
      const mH=stdMat(hoodC),mP=stdMat([0.12,0.14,0.2]),mS=stdMat(skin),mHair=stdMat(hair),mShoe=stdMat([0.92,0.92,0.9]);
      const sc=0.96+rng()*0.1;T.g.scale.setScalar(sc);T.g.position.set(x,T.y,z);group.add(T.g);
      const add=(par,geo,mat,px,py,pz,rx,ry,rz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(px,py,pz);m.rotation.set(rx||0,ry||0,rz||0);par.add(m);return m};
      const bx=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
      // legs: thighs forward, knees apart, shins out to a pair of white sneakers
      for(const s of [-1,1]){add(T.g,bx(0.17,0.16,0.5),mP,s*0.13,0.63,-0.2,0,s*0.12,0);add(T.g,bx(0.14,0.5,0.15),mP,s*0.17,0.36,-0.52,0.25,0,0);add(T.g,bx(0.15,0.1,0.3),mShoe,s*0.17,0.07,-0.64)}
      add(T.g,bx(0.42,0.2,0.3),mP,0,0.6,0.05);
      // torso: slumped back in the seat, hoodie bunched at the neck
      T.torso=new THREE.Group();T.torso.position.set(0,0.68,0.1);T.torso.rotation.order='YXZ';T.g.add(T.torso);
      add(T.torso,bx(0.46,0.5,0.26),mH,0,0.25,0);add(T.torso,bx(0.4,0.12,0.22),mH,0,0.02,-0.02);
      add(T.torso,new THREE.SphereGeometry(0.15,10,8),mH,0,0.5,0.06);                       // the hood, bunched behind the neck
      add(T.torso,bx(0.3,0.1,0.02),stdMat([hoodC[0]*0.6,hoodC[1]*0.6,hoodC[2]*0.6]),0,0.08,-0.14);   // front pocket
      // arms
      T.arms=[];
      for(const s of [-1,1]){const sh=new THREE.Group();sh.position.set(s*0.29,0.45,0);sh.rotation.order='XYZ';T.torso.add(sh);
        add(sh,bx(0.12,0.3,0.12),mH,0,-0.15,0);const el=new THREE.Group();el.position.set(0,-0.3,0);sh.add(el);add(el,bx(0.1,0.28,0.1),mH,0,-0.14,0);add(el,new THREE.SphereGeometry(0.055,8,6),mS,0,-0.3,0);
        T.arms.push({sh,el,s})}
      // head: pivots on a neck that droops forward
      T.neck=new THREE.Group();T.neck.position.set(0,0.56,-0.02);T.torso.add(T.neck);
      T.head=new THREE.Group();T.head.rotation.order='YXZ';T.neck.add(T.head);
      const hd=add(T.head,new THREE.SphereGeometry(0.125,16,12),mS,0,0.11,0);hd.scale.set(1,1.1,1.05);
      add(T.head,new THREE.SphereGeometry(0.13,14,8,0,6.283,0,1.5),mHair,0,0.13,0.01).scale.set(1,1,1.05);
      if(T.hood)add(T.head,new THREE.SphereGeometry(0.15,12,10,0,6.283,0,2.2),mH,0,0.09,0.05).scale.set(1,1,1.1);
      T.eyes=[];for(const s of [-1,1]){const e=add(T.head,new THREE.SphereGeometry(0.02,8,6),eyeMat,s*0.047,0.135,-0.118);T.eyes.push(e);add(T.head,bx(0.05,0.008,0.01),mHair,s*0.047,0.17,-0.12,0,0,-s*0.12)}
      T.eg=glow(0x5599ff,0.26,0);T.eg.position.set(0,0.135,-0.16);T.head.add(T.eg);eyeGlows.push(T.eg);
      add(T.head,new THREE.SphereGeometry(0.015,6,5),mS,0,0.095,-0.135);   // nose
      T.mouth=add(T.head,new THREE.SphereGeometry(0.03,10,8),new THREE.MeshBasicMaterial({color:0x1a0508}),0,0.045,-0.12);T.mouth.scale.set(1,0.8,0.4);
      // the drool: a strand that stretches from the lip, and a drop that falls from its end
      T.strand=add(T.head,new THREE.CylinderGeometry(0.005,0.005,1,5).translate(0,-0.5,0),wet,0,0.025,-0.125);
      T.drop=add(T.head,dropGeo,wet,0,0,-0.125);
      // a phone in the lap that lights the chin
      if(T.phone){T.phoneM=add(T.torso,bx(0.08,0.15,0.01),new THREE.MeshBasicMaterial({color:new THREE.Color(0.5,0.8,1.6)}),0,0.02,-0.24,-0.7,0,0);
        T.phoneG=glow(0x77aaff,0.55,0.55);T.phoneG.position.set(0,0.06,-0.28);T.torso.add(T.phoneG)}
      // tears
      for(let k=0;k<12;k++){const d=new THREE.Mesh(tearGeo,wet);d.visible=false;group.add(d);T.tears.push({m:d,t:rng(),s:k&1?1:-1})}
      return T;
    }
    // where the head looks: a point in the room, smoothly (k=1 snaps)
    const tmpV=new THREE.Vector3();
    function lookAt(T,px,py,pz,k){
      const hx=T.x,hy=T.y+1.25,hz=T.z,dx=px-hx,dz=pz-hz,dy=py-hy;
      const yaw=Math.atan2(-dx,-dz),pit=Math.atan2(dy,Math.hypot(dx,dz));
      const base=T.torso.rotation.x+T.neck.rotation.x;
      T.head.rotation.y+=((yaw-T.torso.rotation.y)-T.head.rotation.y)*k;
      T.head.rotation.x+=(clamp(pit-base,-0.9,0.9)-T.head.rotation.x)*k;
      T.lookYaw=yaw;
    }
    const screenPt=[0,SCR.cy-0.3,SCR.z];
    const camEye=()=>[S.vx,S.eyeY,S.vz];
    // every teen reads the same state, so they all change in the same frame
    function teenPose(T,dt){
      const t=S.t+T.ph,st=S.st;
      const tTorsoX=st==='attack'||st==='huh'?-0.12:st==='crying'?0.15+Math.sin(t*14)*0.05:0.42+Math.sin(t*0.5)*0.02;
      const tNeck=st==='crying'?-0.7:st==='calm'?-0.32:-0.18;
      const tYaw=st==='attack'||st==='huh'?clamp(angTo(T)*0.8,-0.9,0.9):0;
      const k=Math.min(1,dt*(st==='huh'?30:6));
      T.torso.rotation.x+=(tTorsoX-T.torso.rotation.x)*k;T.neck.rotation.x+=(tNeck-T.neck.rotation.x)*k;T.torso.rotation.y+=(tYaw-T.torso.rotation.y)*k;
      T.torso.rotation.z=st==='crying'?Math.sin(t*17)*0.05:Math.sin(t*0.4)*0.02;
      if(st==='calm'){const p=screenPt;lookAt(T,p[0],p[1]+0.6*Math.sin(t*0.3)*0.2,p[2],0.1);T.head.rotation.x+=Math.sin(t*0.9)*0.0015}
      else if(st==='huh'||st==='attack'){const e=camEye();lookAt(T,e[0],e[1],e[2],st==='huh'&&S.stT<0.05?1:0.35)}
      else{T.head.rotation.x+=(-0.15-T.head.rotation.x)*Math.min(1,dt*5);T.head.rotation.y*=0.9}
      // arms
      const phone=T.phone&&st==='calm';
      for(const a of T.arms){
        let sx=0.1,ex=0,sz=a.s*0.08;
        if(phone){sx=-0.7;ex=-1.1}
        else if(st==='calm'){sx=0.2;ex=-0.5;sz=a.s*0.15}
        else if(st==='crying'){sx=-1.0;ex=-2.0;sz=a.s*-0.15}
        else if(a.s>0&&T.shout>0){sx=-1.4;ex=-0.4;sz=-0.15}
        else if(st==='attack'){sx=-0.3;ex=-0.8;sz=a.s*0.2}
        a.sh.rotation.x+=(sx-a.sh.rotation.x)*k;a.sh.rotation.z+=(sz-a.sh.rotation.z)*k;a.el.rotation.x+=(ex-a.el.rotation.x)*k;
      }
      // face
      const open=st==='crying'?0.9+Math.sin(t*8)*0.15:T.shout>0?1.6:st==='huh'?1.2:0.9+Math.sin(t*0.7)*0.12;
      T.mouth.scale.y+=(open-T.mouth.scale.y)*Math.min(1,dt*14);T.mouth.scale.x=st==='crying'?1.5:1;
      const squint=st==='crying'?0.18:1;T.eyes[0].scale.y=T.eyes[1].scale.y=squint;
      // drool: the strand lengthens, thins, and a drop lets go
      const dr=T.strand;
      if(st==='crying'){dr.visible=false;T.drop.visible=false}
      else{
        const L=0.05+0.05*(0.5+0.5*Math.sin(t*0.9))+(st==='calm'?0.04:0);dr.visible=true;dr.scale.set(1,L*(1+0.3*Math.sin(t*0.9)),1);dr.scale.x=dr.scale.z=Math.max(0.35,1.2-L*5);
        T.drip-=dt;
        if(T.dropV===0&&T.drip<=0){T.dropV=0.001;T.dropY=0}
        if(T.dropV>0){T.dropV+=dt*3;T.dropY-=T.dropV*dt*0.9;T.drop.visible=true;T.drop.position.set(0,0.025-L*(1+0.3*Math.sin(t*0.9))+T.dropY,-0.125);
          if(T.dropY<-0.5){T.dropV=0;T.drip=1.2+rng()*2.5;T.drop.visible=false}}
        else{T.drop.visible=true;T.drop.position.set(0,0.025-L*(1+0.3*Math.sin(t*0.9))-0.005,-0.125);T.drop.scale.setScalar(0.5+0.8*Math.min(1,Math.max(0,1-T.drip/2)))}
      }
      T.shout=Math.max(0,T.shout-dt);
      if(T.phoneG)T.phoneG.material.opacity=st==='calm'?0.5+0.2*Math.sin(S.t*3+T.ph):0.2;
      T.eg.material.opacity=st==='attack'||st==='huh'?0.85:st==='calm'?0.18:0;
      // tears
      for(const q of T.tears){
        if(st!=='crying'){q.m.visible=false;continue}
        q.t+=dt*0.9;if(q.t>1)q.t-=1;
        T.head.updateWorldMatrix(true,false);tmpV.set(q.s*0.05,0.12-q.t*0.5,-0.13-q.t*0.06);T.head.localToWorld(tmpV);
        q.m.position.copy(tmpV);q.m.visible=true;
      }
    }
    function angTo(T){const dx=S.vx-T.x,dz=S.vz-T.z;return Math.atan2(-dx,-dz)}

    /* ---------- the screen: the house reel, drawn ---------- */
    function makeReel(){
      const W=640,H=360,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
      const lay=document.createElement('canvas');lay.width=W;lay.height=H;const lc=lay.getContext('2d');
      const grain=document.createElement('canvas');grain.width=300;grain.height=200;{const g=grain.getContext('2d');g.fillStyle='#d9b27a';g.fillRect(0,0,300,200);for(let i=0;i<5000;i++){const v=rnd();g.fillStyle=v<0.5?'rgba(255,235,190,0.35)':'rgba(120,80,40,0.3)';g.fillRect(rnd()*300,rnd()*200,2,2)}}
      const small=document.createElement('canvas');small.width=8;small.height=4;const sc=small.getContext('2d',{willReadFrequently:true});
      const t0=new THREE.CanvasTexture(cv);t0.colorSpace=THREE.SRGBColorSpace;
      const R={canvas:cv,tex:t0,avg:[0.6,0.7,1],scene:0,brushIdx:-1};
      const bokeh=[...Array(16)].map(()=>({x:rnd()*W,y:rnd()*H,r:14+rnd()*30,h:rnd()<0.5?[255,190,110]:[130,180,255],p:rnd()*6.28}));
      const drops=[...Array(46)].map(()=>({x:rnd()*W,y:rnd()*H,r:2+rnd()*5,v:0,p:rnd()*9}));
      const grad=(a,b)=>{const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,a);g.addColorStop(1,b);return g};
      const SC=[
        // slow rain on a window, a city blurred behind it
        (t,dt)=>{c.fillStyle=grad('#0b1520','#1d2f44');c.fillRect(0,0,W,H);
          for(const b of bokeh){const g=c.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);const a=0.35+0.2*Math.sin(t*0.8+b.p);g.addColorStop(0,`rgba(${b.h},${a})`);g.addColorStop(1,`rgba(${b.h},0)`);c.fillStyle=g;c.fillRect(b.x-b.r,b.y-b.r,b.r*2,b.r*2)}
          c.fillStyle='rgba(180,205,235,0.08)';c.fillRect(0,0,W,H);
          for(const d of drops){if(d.v===0&&Math.sin(t*0.7+d.p*13)>0.985)d.v=12+rnd()*30;d.y+=d.v*dt;d.v*=0.985;if(d.v<4)d.v=0;if(d.y>H+10){d.y=-8;d.x=rnd()*W}
            c.fillStyle='rgba(200,225,250,0.22)';c.beginPath();c.ellipse(d.x,d.y,d.r*0.8,d.r*1.15,0,0,7);c.fill();c.fillStyle='rgba(255,255,255,0.5)';c.fillRect(d.x-d.r*0.3,d.y-d.r*0.5,1.5,1.5);
            if(d.v>0){c.strokeStyle='rgba(200,225,250,0.1)';c.lineWidth=d.r*0.6;c.beginPath();c.moveTo(d.x,d.y);c.lineTo(d.x,d.y-d.v*0.5);c.stroke()}}},
        // a brush laying paint on canvas, no hand in sight
        (t,dt,lt)=>{if(R.brushIdx<0||lt<0.05){lc.fillStyle='#efe5d0';lc.fillRect(0,0,W,H);R.brushIdx=0}
          const pal=['#c4553a','#e8b04a','#3f7f8c','#7a4a8c','#4a8a5a'],k=Math.floor(lt/2.2),f=(lt%2.2)/2.2,y0=50+k*52,x=70+f*500;
          if(k<6){const y=y0+Math.sin(f*7+k)*14;lc.strokeStyle=pal[k%5];lc.lineCap='round';lc.lineWidth=26;lc.globalAlpha=0.55;lc.beginPath();lc.moveTo(x-8,y);lc.lineTo(x,y);lc.stroke();lc.globalAlpha=1;R.bx=x;R.by=y}
          c.drawImage(lay,0,0);const bx=R.bx||70,by=R.by||50;c.save();c.translate(bx,by);c.rotate(-0.9);c.fillStyle='#6a4a2a';c.fillRect(-4,-130,8,120);c.fillStyle='#b8b8c0';c.fillRect(-6,-30,12,26);c.fillStyle=pal[Math.min(k,5)%5];c.beginPath();c.ellipse(0,0,8,14,0,0,7);c.fill();c.restore()},
        // kinetic sand sliced by a blade
        (t,dt,lt)=>{c.fillStyle=grad('#1f3a40','#2c5058');c.fillRect(0,0,W,H);
          const x0=150,x1=490,y0=100,y1=280,pw=34,n=Math.floor((x1-x0)/pw);c.fillStyle='rgba(0,0,0,0.3)';c.beginPath();c.ellipse(320,y1+14,200,16,0,0,7);c.fill();
          for(let i=0;i<n;i++){const ct=0.6+(n-1-i)*1.0,since=lt-ct,cut=since>0.7,sep=cut?Math.min(1,(since-0.7)*0.8)*16*(1+((i*7)%3)*0.2):0,x=x1-(i+1)*pw-sep,tilt=cut?-Math.min(1,(since-0.7)*0.6)*0.05:0;
            c.save();c.translate(x+pw/2,y1);c.rotate(tilt);c.drawImage(grain,i*8%250,0,pw,y1-y0,-pw/2,-(y1-y0),pw,y1-y0);c.fillStyle='rgba(255,255,255,0.12)';c.fillRect(-pw/2,-(y1-y0),3,y1-y0);c.fillStyle='rgba(0,0,0,0.18)';c.fillRect(pw/2-3,-(y1-y0),3,y1-y0);c.restore()}
          const cur=Math.floor(lt-0.6),bi=clamp(cur,0,n-1);const bx=x1-(bi+1)*pw,p=((lt-0.6)%1)/1,dy=p<0.7?ss(0,0.7,p):1-ss(0.7,1,p);
          if(lt>0.4&&lt<0.6+n){c.fillStyle='#c8ccd4';c.fillRect(bx-1,y0-70+dy*(y1-y0+60)-150+150,2,150);c.fillStyle='#8a8f9a';c.fillRect(bx-9,y0-90+dy*(y1-y0+60)-60,18,60)}},
        // a candle flame
        (t,dt)=>{c.fillStyle=grad('#0a0605','#1a0c08');c.fillRect(0,0,W,H);const fx=320+Math.sin(t*1.3)*3+Math.sin(t*5.1)*1.5,fy=170;
          const g=c.createRadialGradient(fx,fy,4,fx,fy,260);g.addColorStop(0,'rgba(255,170,70,0.55)');g.addColorStop(0.4,'rgba(200,90,30,0.18)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,W,H);
          c.fillStyle='#e9d8b0';c.fillRect(296,205,48,150);c.fillStyle='#d4bf90';c.fillRect(296,205,10,150);c.fillStyle='#f6ead0';c.beginPath();c.ellipse(320,205,24,6,0,0,7);c.fill();
          c.fillStyle='#2a1a10';c.fillRect(318,188,4,18);
          const sw=Math.sin(t*3.1)*4+Math.sin(t*7.3)*2,h=44+Math.sin(t*9)*3;const fg=c.createRadialGradient(fx+sw*0.3,fy+20,2,fx,fy+14,40);fg.addColorStop(0,'#fff8d8');fg.addColorStop(0.35,'#ffd070');fg.addColorStop(1,'rgba(255,100,20,0)');
          c.fillStyle=fg;c.beginPath();c.moveTo(fx-12,188);c.quadraticCurveTo(fx-16,170,fx+sw,fy-h*0.45);c.quadraticCurveTo(fx+16,170,fx+12,188);c.quadraticCurveTo(fx,196,fx-12,188);c.fill();
          c.fillStyle='rgba(90,140,255,0.5)';c.beginPath();c.ellipse(fx,186,5,9,0,0,7);c.fill();
          for(let i=0;i<8;i++){const p=(t*0.15+i/8)%1,x=fx+Math.sin(p*9+i)*20,y=fy-p*140;c.fillStyle=`rgba(255,200,100,${0.5*(1-p)})`;c.fillRect(x,y,2,2)}},
      ];
      const LEN=11,lastT=[0];
      R.draw=(t,dt)=>{
        const i=Math.floor(t/LEN)%SC.length,lt=t%LEN;
        if(lt<1.0&&t>=LEN){const pi=(i+SC.length-1)%SC.length;SC[pi](t,dt,LEN+lt);c.globalAlpha=ss(0,1,lt);SC[i](t,dt,lt);c.globalAlpha=1}else SC[i](t,dt,lt);
        c.save();c.globalAlpha=0.08;c.fillStyle='#000';for(let y=0;y<H;y+=3)c.fillRect(0,y,W,1);c.restore();
        const v=c.createRadialGradient(W/2,H/2,H*0.35,W/2,H/2,H*0.95);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,0.45)');c.fillStyle=v;c.fillRect(0,0,W,H);
        if(R.bug){c.font='bold 15px Arial,sans-serif';c.textAlign='right';c.textBaseline='alphabetic';const tx='NO SIGNAL · HOUSE REEL',w=c.measureText(tx).width;
          c.fillStyle='rgba(0,0,0,0.55)';c.fillRect(W-w-52,H-38,w+40,26);c.fillStyle=Math.sin(t*3)>0?'#ff4a3a':'#6a2018';c.beginPath();c.arc(W-w-38,H-25,5,0,7);c.fill();c.fillStyle='#f4efe6';c.fillText(tx,W-24,H-20)}
        t0.needsUpdate=true;
        sc.drawImage(cv,0,0,8,4);const d=sc.getImageData(0,0,8,4).data;let r=0,g=0,b=0;for(let k=0;k<d.length;k+=4){r+=d[k];g+=d[k+1];b+=d[k+2]}const n=d.length/4*255;R.avg=[r/n,g/n,b/n];
      };
      R.bug=true;
      return R;
    }
    S.reel.draw(0,0.016);

    /* ---------- sound: mic, speech, the reel's own soft audio ---------- */
    let AU=null,micStream=null,micAn=null,micBuf=null,micSrc=null,rec=null,recBad=false,recWant=false,recTimer=0,ytHandle=null,disposed=false;
    const hist=[];
    const micLevel=()=>{if(!micAn)return 0;micAn.getFloatTimeDomainData(micBuf);let s=0;for(let i=0;i<micBuf.length;i++)s+=micBuf[i]*micBuf[i];return Math.sqrt(s/micBuf.length)};
    async function micOpen(){
      if(!live||(opts&&opts.noMic)){S.mic='none';return}
      AU=o.audio?o.audio():null;
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!AU){S.mic='none';return}
      S.mic='asking';
      try{
        // our own stream, analysed only: it goes nowhere (never to a friend, never to a recording), whatever the voice chat is doing
        const st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
        if(disposed){for(const t of st.getTracks())t.stop();return}
        micStream=st;micSrc=AU.ac.createMediaStreamSource(st);micAn=AU.ac.createAnalyser();micAn.fftSize=1024;micBuf=new Float32Array(micAn.fftSize);micSrc.connect(micAn);
        S.mic='ok';
      }catch(e){S.mic='none'}
    }
    const SR=typeof window!=='undefined'&&(window.SpeechRecognition||window.webkitSpeechRecognition);
    function recStart(){
      recWant=true;
      if(!live||!SR||recBad||rec||S.mic==='none'&&!(opts&&opts.srOnly))return;
      if(navigator.onLine===false){recBad=true;return}
      try{
        const r=new SR();r.lang='en-US';r.continuous=true;r.interimResults=true;r.maxAlternatives=3;
        r.onresult=e=>{let txt='';for(let i=e.resultIndex;i<e.results.length;i++)for(let k=0;k<e.results[i].length;k++)txt+=' '+e.results[i][k].transcript;heard(txt)};
        r.onerror=e=>{if(['not-allowed','service-not-allowed','network','audio-capture','language-not-supported'].includes(e&&e.error)){recBad=true}};
        r.onend=()=>{rec=null;if(recWant&&!recBad&&!disposed){clearTimeout(recTimer);recTimer=setTimeout(recStart,250)}};
        rec=r;r.start();
      }catch(e){rec=null;recBad=true}
    }
    function recStop(){recWant=false;clearTimeout(recTimer);if(rec){const r=rec;rec=null;r.onend=null;r.onresult=null;r.onerror=null;try{r.abort()}catch(e){}}}
    const srOk=()=>!!SR&&!recBad&&navigator.onLine!==false;
    const synth=typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance!=='undefined'?speechSynthesis:null;
    function speak(text,pitch,rate,cancel){
      if(!live||!synth)return;
      try{if(cancel)synth.cancel();const u=new SpeechSynthesisUtterance(text);u.pitch=pitch;u.rate=rate;u.volume=0.9;u.lang='en-US';synth.speak(u)}catch(e){}
    }
    // the reel's audio: rain hiss, soft taps, a whisper of filtered noise
    let reelA=null,tapT=1;
    function reelAudioOn(){
      if(!live||reelA||!o.audio)return;AU=AU||o.audio();if(!AU)return;
      const {ac,master,noise}=AU,g=ac.createGain();g.gain.value=0;g.connect(master);
      const mk=(type,f,q,vol)=>{const s=ac.createBufferSource(),b=ac.createBiquadFilter(),gg=ac.createGain();s.buffer=noise;s.loop=true;b.type=type;b.frequency.value=f;b.Q.value=q;gg.gain.value=vol;s.connect(b);b.connect(gg);gg.connect(g);s.start(0,Math.random());return {s,b,gg}};
      const rain=mk('highpass',2400,0.5,0.1),wh=mk('bandpass',1700,3,0.05),lo=mk('lowpass',380,0.7,0.05);
      const lfo=ac.createOscillator(),lg=ac.createGain();lfo.frequency.value=0.13;lg.gain.value=700;lfo.connect(lg);lg.connect(wh.b.frequency);lfo.start();
      reelA={g,nodes:[rain.s,wh.s,lo.s,lfo],ac,master,noise};
    }
    function reelAudioOff(){if(!reelA)return;const r=reelA;reelA=null;try{r.g.gain.setTargetAtTime(0,r.ac.currentTime,0.05)}catch(e){}for(const n of r.nodes)try{n.stop(r.ac.currentTime+0.3)}catch(e){}setTimeout(()=>{try{r.g.disconnect()}catch(e){}},500)}
    function reelTap(){
      if(!reelA)return;const {ac,noise,g}=reelA,t=ac.currentTime,s=ac.createBufferSource(),f=ac.createBiquadFilter(),gg=ac.createGain();
      s.buffer=noise;f.type='bandpass';f.frequency.value=700+Math.random()*1800;f.Q.value=4;gg.gain.setValueAtTime(0.0001,t);gg.gain.exponentialRampToValueAtTime(0.35,t+0.004);gg.gain.exponentialRampToValueAtTime(0.0001,t+0.07);
      s.connect(f);f.connect(gg);gg.connect(g);s.start(t,Math.random());s.stop(t+0.1);
    }

    /* ---------- the YouTube player (DOM, laid over the canvas) ---------- */
    ensureStyle();
    const layer=document.createElement('div');layer.id='theaterLayer';document.body.appendChild(layer);
    const list=THEATER_VIDEOS.filter(v=>v&&yid(v.id));
    const yt={p:null,wrap:null,idx:Math.floor(rng()*Math.max(1,list.length)),tries:0,played:false,timer:0,vol:-1,ready:false,hidden:true,muted:false};
    const nowEl=document.createElement('div');nowEl.id='theaterNow';nowEl.style.display='none';document.body.appendChild(nowEl);
    function wantYT(){
      if(!live||(opts&&opts.reel)||window.__theaterReel||!list.length)return false;
      if(location.protocol==='file:'||navigator.onLine===false)return false;
      return true;
    }
    function toReel(why){
      S.tv='reel';S.np=null;S.reel.bug=true;nowEl.style.display='none';S.why=why||S.why;
      clearTimeout(yt.timer);ytKill();
      if(!reelA&&!disposed)reelAudioOn();
    }
    function ytKill(){
      if(yt.p){try{yt.p.destroy()}catch(e){}yt.p=null}
      if(yt.wrap){yt.wrap.remove();yt.wrap=null}
      yt.ready=false;
    }
    function ytNext(){
      yt.tries++;
      if(yt.tries>list.length+1){toReel('errors');return}
      yt.idx=(yt.idx+1)%list.length;
      ytLoad(true);
    }
    function ytLoad(next){
      const v=list[yt.idx];if(!v||!yid(v.id)){toReel('badid');return}
      const start=next?0:Math.floor(rng()*240);
      S.np=null;
      if(yt.p&&yt.ready){try{yt.p.loadVideoById({videoId:v.id,startSeconds:start})}catch(e){toReel('api')}return}
      toReel('api');
    }
    function ytLoadApi(){
      return new Promise((res,rej)=>{
        if(window.YT&&window.YT.Player){res();return}
        const prev=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{try{prev&&prev()}catch(e){}res()};
        if(!document.getElementById('ytapi')){const s=document.createElement('script');s.id='ytapi';s.src='https://www.youtube.com/iframe_api';s.async=true;s.onerror=()=>{s.remove();rej(new Error('script'))};document.head.appendChild(s)}
      });
    }
    function ytBegin(){
      if(!wantYT()){S.why=!live?'watch':location.protocol==='file:'?'file':!list.length?'empty':navigator.onLine===false?'offline':'forced';toReel();return}
      reelAudioOn();   // until the picture starts
      yt.timer=setTimeout(()=>{if(!yt.played)toReel('slow')},TH.YT_READY_MS);
      ytLoadApi().then(()=>{
        if(disposed||yt.p)return;
        const v=list[yt.idx];if(!v)return;
        const host=document.createElement('div');yt.wrap=document.createElement('div');yt.wrap.id='theaterYT';yt.wrap.appendChild(host);document.body.appendChild(yt.wrap);
        const pv={autoplay:1,controls:0,disablekb:1,fs:0,rel:0,iv_load_policy:3,modestbranding:1,playsinline:1,enablejsapi:1,start:Math.floor(rng()*240)};
        if(/^https?:$/.test(location.protocol))pv.origin=location.origin;
        yt.p=new YT.Player(host,{host:'https://www.youtube-nocookie.com',width:'1280',height:'720',videoId:v.id,playerVars:pv,events:{
          onReady:e=>{try{yt.ready=true;e.target.setVolume(40);e.target.playVideo();const f=yt.wrap&&yt.wrap.querySelector('iframe');if(f){f.style.pointerEvents='none';f.setAttribute('tabindex','-1')}}catch(x){}},
          onStateChange:e=>{
            const s=e&&e.data;
            if(s===1){if(!yt.played){yt.played=true;clearTimeout(yt.timer)}const cur=list[yt.idx];S.tv='yt';S.np={id:cur.id,title:cur.title,by:cur.by};S.reel.bug=false;reelAudioOff();yt.hidden=false;nowRefresh()}
            else if(s===2){yt.hidden=true}
            else if(s===3&&yt.played){yt.hidden=false}
            else if(s===0){yt.hidden=true;S.np=null;ytNext()}
          },
          onError:()=>{yt.hidden=true;if(!yt.played){clearTimeout(yt.timer);yt.timer=setTimeout(()=>{if(!yt.played)toReel('slow')},TH.YT_READY_MS)}ytNext()}}});
      }).catch(()=>toReel('script'));
    }
    function nowRefresh(){
      if(S.tv!=='yt'||!S.np){nowEl.style.display='none';return}
      nowEl.innerHTML='Now playing: <a href="https://youtu.be/'+S.np.id+'" target="_blank" rel="noopener">'+S.np.title.replace(/[<>&"]/g,'')+'</a><br><small>'+S.np.by.replace(/[<>&"]/g,'')+' · on YouTube · Esc frees the mouse so you can click</small>';
      nowEl.style.display='block';
    }
    const corners=[new THREE.Vector3(-SCR.w/2,SCR.cy+SCR.h/2,SCR.z),new THREE.Vector3(SCR.w/2,SCR.cy+SCR.h/2,SCR.z),new THREE.Vector3(SCR.w/2,SCR.cy-SCR.h/2,SCR.z),new THREE.Vector3(-SCR.w/2,SCR.cy-SCR.h/2,SCR.z)];
    function ytPlace(){
      const w=yt.wrap;if(!w)return;
      const sz=renderer.getSize(new THREE.Vector2());let ok=S.tv==='yt'&&!yt.hidden&&!document.hidden;const pts=[];
      if(ok)for(const c of corners){const v=c.clone().applyMatrix4(cam.matrixWorldInverse);if(v.z>-0.2){ok=false;break}v.applyMatrix4(cam.projectionMatrix);pts.push([(v.x*0.5+0.5)*sz.x,(1-(v.y*0.5+0.5))*sz.y])}
      const m=ok?quadMatrix(1280,720,pts):null;
      if(!m){w.style.visibility='hidden';return}
      w.style.transform=m;w.style.visibility='visible';
      // volume follows distance to the screen, ducked so the room cannot drown out your voice
      if(yt.p&&yt.ready&&yt.p.setVolume){const d=Math.hypot(S.vx,S.vz-SCR.z),v=Math.round(100*clamp(1.15-d/16,0.15,1)*TH.SCREEN_DUCK);if(Math.abs(v-yt.vol)>=3){yt.vol=v;try{yt.p.setVolume(v)}catch(e){}}}
    }
    const onVis=()=>{if(document.hidden){try{yt.p&&yt.p.pauseVideo&&yt.p.pauseVideo()}catch(e){}}else{try{yt.p&&yt.p.playVideo&&yt.p.playVideo()}catch(e){}}};
    document.addEventListener('visibilitychange',onVis);

    /* ---------- bubbles (DOM, so the picture can never cover them) ---------- */
    function bubble(T,text,cls,kind){
      const el=document.createElement('div');el.className='thb'+(cls?' '+cls:'');el.textContent=text;el.style.visibility='hidden';layer.appendChild(el);
      const b={el,T,kind,t:0,life:kind==='fly'?1.5:kind==='stay'?2.6:1.1,rot:(rng()-0.5)*8,dx:(rng()-0.5)*0.3};S.bubbles.push(b);return b;
    }
    const proj=new THREE.Vector3();
    function bubbleFrame(sz){
      for(let i=S.bubbles.length-1;i>=0;i--){
        const b=S.bubbles[i];
        const T=b.T;T.head.updateWorldMatrix(true,false);proj.set(0,0.35,0);T.head.localToWorld(proj);proj.project(cam);
        if(proj.z>1||proj.z<-1){b.el.style.visibility='hidden';continue}
        let x=(proj.x*0.5+0.5)*sz.x,y=(1-(proj.y*0.5+0.5))*sz.y,sc=1,op=1;
        const dist=Math.hypot(T.x-S.vx,T.z-S.vz);
        if(b.kind==='fly'){const k=ss(0,1,b.t/(b.life*0.8)),tx=sz.x*(0.5+b.dx),ty=sz.y*0.44;x=lerp(x,tx,k);y=lerp(y,ty,k);sc=lerp(0.5,2.1,k)*Math.min(1.25,sz.y/720+0.45);op=1-ss(0.78,1,b.t/b.life)}
        else{sc=clamp(2.2/Math.max(1.5,dist),0.5,1.1)*Math.min(1.2,sz.y/720+0.45);op=1-ss(0.7,1,b.t/b.life)}
        b.el.style.visibility='visible';b.el.style.opacity=op;
        b.el.style.transform=`translate(${(x-b.el.offsetWidth/2).toFixed(1)}px,${(y-b.el.offsetHeight-14).toFixed(1)}px) rotate(${b.rot}deg) scale(${sc.toFixed(2)})`;
      }
    }

    /* ---------- the story ---------- */
    const near=()=>{let m=1e9;for(const T of S.teens)m=Math.min(m,Math.hypot(T.x-S.px,T.z-S.pz));return m};
    S.nearest=near;
    function say(T,text,cls,kind){return bubble(T,text,cls,kind)}
    const blip=(f,when)=>{o.tone(f,0.14,'triangle',0.13,when||0,f*0.45);o.tone(f*1.5,0.1,'sine',0.05,when||0)};
    function toHuh(){
      if(S.st!=='calm')return;
      S.st='huh';S.stT=0;S.entLocked=true;S.speechT=0;
      S.teens.forEach((T,i)=>{say(T,'huh?','','head');blip(300+i*43,i*0.012)});
      speak('huh?',1.7,1.1,true);
      o.noise(0.3,0.55,160,0.7);o.tone(70,0.25,'square',0.25,0.02,-30);if(o.rumble)o.rumble(250,0.8,0.7);S.shake=0.35;   // the door slams
      o.say('The door slams shut behind you.',2.5);
      for(const T of S.teens)lookAtNow(T);
    }
    function lookAtNow(T){const e=camEye();lookAt(T,e[0],e[1],e[2],1)}
    function toAttack(){S.st='attack';S.stT=0;S.insT=TH.FIRST_INSULT;recStart()}
    function fire(){
      const idx=[];S.teens.forEach((T,i)=>{if(i!==S.lastIns)idx.push(i)});
      const i=idx[(Math.random()*idx.length)|0],T=S.teens[i];S.lastIns=i;
      const txt=INSULTS[(Math.random()*INSULTS.length)|0];
      T.shout=0.8;say(T,txt,'big','fly');S.insults++;
      speak(txt,0.9+Math.random()*0.9,0.95+Math.random()*0.3,true);
      o.tone(180+Math.random()*80,0.12,'square',0.12,0,-60);
      if(o.damage()){o.hurtFx();S.over='dead';S.overT=0;recStop();return}
      S.hits++;
      if(S.insults>=2&&!S.hintShown){S.hintShown=true}
    }
    function toCrying(){
      if(S.st==='crying'||S.over)return;
      S.st='crying';S.stT=0;S.unlocked=true;recStop();for(let i=S.bubbles.length-1;i>=0;i--){S.bubbles[i].el.remove();S.bubbles.splice(i,1)}   // the insults stop at once, and so do their bubbles
      if(synth)try{synth.cancel()}catch(e){}
      S.teens.forEach((T,i)=>{say(T,i%2?'waaah':'wahhh...','cry','stay');
        o.tone(360+i*30,0.9,'sawtooth',0.07,i*0.05,-120);o.tone(420+i*25,0.7,'triangle',0.08,0.5+i*0.06,-100)});
      o.noise(0.8,0.1,1200,1.2);
      // the exit unlocks: a crisp two-part click
      o.tone(1900,0.03,'square',0.2,0.25);o.noise(0.04,0.5,3600,3);o.tone(820,0.05,'square',0.22,0.36,-200);o.noise(0.06,0.5,1800,2);
      o.say('Click. The exit unlocks.',3);
    }
    function heard(text){
      if(!live||S.st!=='attack')return;
      S.heard.push(String(text).slice(0,80));if(S.heard.length>6)S.heard.shift();
      if(!heardPhrase(text))return;
      const pk=peak();
      if(pk>=TH.YELL||S.test.force)toCrying();
      else if(S.hintT<=0){S.hint='Yell it!';S.hintT=3;say(S.teens[(Math.random()*S.teens.length)|0],"we can't HEAR you",'','stay')}
    }
    const peak=()=>{let m=0;for(const h of hist)m=Math.max(m,h[1]);return m};
    S.heardNow=heard;

    /* ---------- walking ---------- */
    const walk=(dt,inp)=>{
      const mx=nf(inp.mx)?clamp(inp.mx,-1,1):0,my=nf(inp.my)?clamp(inp.my,-1,1):0,lx=nf(inp.lx)?inp.lx:0,ly=nf(inp.ly)?inp.ly:0;
      S.yaw+=lx*1.6*dt;S.pitch=clamp(S.pitch-ly*1.4*dt,-1.2,1.2);S.yaw=((S.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);let dx=cy*mx-sy*my,dz=sy*mx+cy*my;const l=Math.hypot(dx,dz);if(l>1){dx/=l;dz/=l}
      const k=Math.min(1,dt*12);S.ux+=(dx*3.0-S.ux)*k;S.uz+=(dz*3.0-S.uz)*k;
      const ox=S.px,oz=S.pz;S.px+=S.ux*dt;S.pz+=S.uz*dt;
      for(let it=0;it<2;it++){
        for(const b of BOXES){const qx=clamp(S.px,b[0],b[1]),qz=clamp(S.pz,b[2],b[3]),ex=S.px-qx,ez=S.pz-qz,d=Math.hypot(ex,ez);
          if(d<RAD){if(d>1e-6){S.px=qx+ex/d*RAD;S.pz=qz+ez/d*RAD}else{const m=[S.px-b[0],b[1]-S.px,S.pz-b[2],b[3]-S.pz],i=m.indexOf(Math.min(...m));if(i===0)S.px=b[0]-RAD;else if(i===1)S.px=b[1]+RAD;else if(i===2)S.pz=b[2]-RAD;else S.pz=b[3]+RAD}}}
        S.px=clamp(S.px,-RX+RAD,RX-RAD);S.pz=clamp(S.pz,ZF+RAD,ZB-RAD);
      }
      view(dt,Math.hypot(S.px-ox,S.pz-oz)/Math.max(dt,1e-4));S.vx=S.px;S.vz=S.pz;S.vyaw=S.yaw;S.vpitch=S.pitch;
    };
    const view=(dt,sp)=>{if(dt<=0)return;const a=clamp(sp/3,0,1);S.bobP+=sp*dt*2.3;S.bob+=(Math.sin(S.bobP)*0.028*a-S.bob)*Math.min(1,dt*20);S.eyeY=EYE+FY(S.vz)+S.bob};
    const wr=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
    const watchView=dt=>{
      if(!S.hasPose||Math.hypot(S.tx-S.vx,S.tz-S.vz)>4){S.vx=S.tx;S.vz=S.tz;S.vyaw=S.tyaw;S.vpitch=S.tpitch;S.hasPose=true;S.eyeY=EYE+FY(S.vz);return}
      const k=Math.min(1,dt*12),ox=S.vx,oz=S.vz;S.vx+=(S.tx-S.vx)*k;S.vz+=(S.tz-S.vz)*k;S.vyaw=wr(S.vyaw+wr(S.tyaw-S.vyaw)*k);S.vpitch+=(S.tpitch-S.vpitch)*k;
      view(dt,Math.hypot(S.vx-ox,S.vz-oz)/dt);S.px=S.vx;S.pz=S.vz;
    };

    /* ---------- the HUD ---------- */
    const isTouch=()=>document.body.classList.contains('touch');
    const hud=()=>{
      let h;
      const mic=S.mic==='ok'?'microphone listening':S.mic==='asking'?'allow the microphone to talk (or hold V)':isTouch()?'No microphone: hold TALK to talk, hold it for 1 second to yell':'No microphone: hold V to talk, hold V for 1 second to yell';
      const hearts=o.hearts?o.hearts():'';
      if(S.over==='dead')h='<b>You are cooked.</b>';
      else if(S.over==='win')h='<b>You slip out through the exit.</b>';
      else if(S.st==='calm')h=`<b>THE PICTURE HOUSE</b><br><small>${mic}</small>`;
      else if(S.st==='huh')h='<b>huh?</b>';
      else if(S.st==='attack')h=`<b style="color:#ff9a8a">${hearts}</b><br>`+(S.insults>=2?'<b>Yell "SILENCE, PEASANTS!"</b>':'<small>they are not happy</small>')+(S.hintT>0?`<br><b style="color:#ffe27a">${S.hint}</b>`:'')+(S.mic!=='ok'&&S.mic!=='asking'?`<br><small>${mic}</small>`:'');
      else h=S.unlocked?'<b>The exit is unlocked.</b><br><small>The green sign, on the right wall</small>':'';
      o.hud(h);
    };

    /* ---------- update ---------- */
    let ytStarted=false;
    S.update=(dt,inp)=>{
      S.t+=dt;S.stT+=dt;
      for(let i=S.bubbles.length-1;i>=0;i--){const b=S.bubbles[i];b.t+=dt;if(b.t>=b.life){b.el.remove();S.bubbles.splice(i,1)}}
      if(!ytStarted){ytStarted=true;if(live){micOpen();ytBegin()}else toReel('watch')}
      S.hintT=Math.max(0,S.hintT-dt);if(S.shake>0)S.shake-=dt;S.rattleT-=dt;
      if(A.watching)watchView(dt);else walk(dt,inp);
      // the reel picture and what lights the room
      S.reel.draw(S.t,dt);
      if(S.tv==='reel'&&reelA){const d=Math.hypot(S.vx,S.vz-SCR.z);reelA.g.gain.setTargetAtTime(0.5*clamp(1.15-d/16,0.2,1)*TH.SCREEN_DUCK,reelA.ac.currentTime,0.1);tapT-=dt;if(tapT<=0){tapT=0.5+Math.random()*1.2;reelTap()}}
      const av=S.reel.avg;const fl=0.9+Math.sin(S.t*23)*0.03+Math.sin(S.t*7.1)*0.05;
      const tint=S.tv==='yt'?[0.65+0.2*Math.sin(S.t*0.7),0.7,0.8+0.2*Math.sin(S.t*0.5)]:av;
      S.sLight.color.setRGB(0.35+tint[0]*0.65,0.35+tint[1]*0.65,0.35+tint[2]*0.65);S.sLight.intensity=120*fl*(S.st==='attack'?1.15:1);
      S.screen.material.color.setScalar(S.st==='calm'?1.15:1.0);
      S.bulbs.forEach((b,i)=>{const on=Math.max(0,Math.sin(S.t*4-i*0.7));b.material.color.setRGB(0.35+on*2,0.2+on*1.1,0.06+on*0.25)});
      // the exit sign: red, then green
      const gk=S.unlocked?ss(0,0.5,S.stT):0,sg=S.unlocked?[0.2,2.4,0.45]:[2.4,0.12,0.1];
      S.signFace.material.color.setRGB(sg[0],sg[1],sg[2]);S.signLight.color.setRGB(S.unlocked?0.3:1,S.unlocked?1:0.15,S.unlocked?0.5:0.1);S.signLight.intensity=(S.unlocked?7:4+0.8*Math.sin(S.t*2.5));
      // the teens
      for(const T of S.teens)teenPose(T,dt);
      if(live&&!S.over){
        // microphone, or the V key standing in for it
        let lv=0,keyYell=false;
        if(S.test.level!==null&&S.test.level!==undefined)lv=S.test.level;
        else if(S.mic==='ok')lv=micLevel();
        else{
          const held=!!(inp&&inp.talk);S.keyHold=held?S.keyHold+dt:0;
          lv=held?(S.keyHold>=TH.KEY_YELL_HOLD?0.3:0.06):0;
          if(S.st==='attack'&&S.keyHold>=TH.KEY_YELL_HOLD&&!S.keyDone){S.keyDone=true;keyYell=true}
          if(!held)S.keyDone=false;
        }
        S.lvl=lv;hist.push([S.t,lv]);while(hist.length&&hist[0][0]<S.t-TH.YELL_WINDOW)hist.shift();
        if(keyYell)heard('silence peasants');
        const n=near();S.dist=n;
        if(S.st==='calm'){
          if(lv>TH.SPEAK&&n<=TH.TEEN_RANGE)S.speechT+=dt;else S.speechT=Math.max(0,S.speechT-dt*2);
          if(S.speechT>=TH.SPEAK_TIME)toHuh();
        }else if(S.st==='huh'){if(S.stT>=TH.HUH_TIME)toAttack()}
        else if(S.st==='attack'){
          S.insT-=dt;if(S.insT<=0){S.insT=TH.INSULT_EVERY;fire()}
          // no speech recogniser (or it failed): a yell that holds long enough is the phrase
          if(!srOk()||(S.test&&S.test.noSR)){if(lv>=TH.YELL)S.yellT=Math.min(TH.YELL_HOLD+0.5,S.yellT+dt);else S.yellT=Math.max(0,S.yellT-dt*0.5);if(S.yellT>=TH.YELL_HOLD)toCrying()}
        }
        // the doors
        if(S.pz>ZB-0.55&&Math.abs(S.px-ENT.x)<0.9){
          if(S.entLocked){if(S.rattleT<=0){S.rattleT=1.3;o.noise(0.12,0.3,260,2);o.tone(110,0.1,'square',0.12);o.say('The door will not open.',1.5)}}
          else if(!S.over){S.over='leave';S.overT=0}
        }
        if(S.rattleT<=0&&S.px>RX-0.55&&Math.abs(S.pz-EXIT.z)<0.85){
          if(!S.unlocked){S.rattleT=1.3;o.noise(0.12,0.3,260,2);o.tone(110,0.1,'square',0.12);o.say('Locked.',1.2)}
          else if(!S.over){S.over='win';S.overT=0}
        }
      }
      if(S.over){S.overT+=dt;S.fade=ss(0.1,0.7,S.overT);if(S.overT>0.75){const r=S.over;S.over='done';finish(r==='win'?{k:'win',why:'theater'}:r==='dead'?{k:'dead',why:'theater'}:{k:'leave',why:'theater'})}}
      hud();
    };
    // a friend watching: the pose and the story, nothing else runs on their side
    S.snap=()=>({x:+S.px.toFixed(2),z:+S.pz.toFixed(2),yw:+S.yaw.toFixed(2),pt:+S.pitch.toFixed(2),st:S.st,tv:S.tv});
    S.apply=q=>{
      if(nf(q.x)&&nf(q.z)){S.tx=clamp(q.x,-RX,RX);S.tz=clamp(q.z,ZF,ZB)}
      if(nf(q.yw))S.tyaw=clamp(q.yw,-7,7);if(nf(q.pt))S.tpitch=clamp(q.pt,-1.2,1.2);
      if(q.st==='calm'||q.st==='huh'||q.st==='attack'||q.st==='crying'){
        if(q.st!==S.st){const prev=S.st;S.st=q.st;S.stT=0;S.unlocked=q.st==='crying';if(q.st==='huh'){for(const T of S.teens)say(T,'huh?','','head')}if(q.st==='crying'&&prev!=='crying')for(const T of S.teens)say(T,'waaah','cry','stay')}
      }
    };
    // for the tests: inject mic levels and recognised words, force the reel
    S.test.api=q=>{
      if(!q||typeof q!=='object')return;
      if('level' in q)S.test.level=q.level===null?null:+q.level;
      if('noSR' in q)S.test.noSR=!!q.noSR;
      if(q.force)S.test.force=true;
      if(typeof q.heard==='string')heard(q.heard);
      if(q.reel)toReel('test');
    };
    S.frame=()=>{
      const asp=cam.aspect||1;cam.fov=asp<1?Math.min(100,2*Math.atan(Math.tan(37.5*Math.PI/180)/asp)*180/Math.PI):70;cam.updateProjectionMatrix();
      const sh=S.shake>0?S.shake*0.1:0;
      cam.position.set(S.vx+(Math.random()-0.5)*sh,S.eyeY+(Math.random()-0.5)*sh,S.vz);cam.rotation.set(S.vpitch,-S.vyaw,0,'YXZ');
      cam.updateMatrixWorld(true);
      const sz=renderer.getSize(new THREE.Vector2());
      bubbleFrame(sz);ytPlace();
    };
    // the bubbles also age in the fixed-step tests (they are removed on dispose either way)
    S.bloom=0.5;

    function dispose(){
      if(disposed)return;disposed=true;
      recStop();clearTimeout(yt.timer);ytKill();
      try{if(synth)synth.cancel()}catch(e){}
      reelAudioOff();
      if(micSrc){try{micSrc.disconnect()}catch(e){}micSrc=null}
      if(micStream){for(const t of micStream.getTracks())try{t.stop()}catch(e){}micStream=null}
      micAn=null;
      document.removeEventListener('visibilitychange',onVis);
      layer.remove();nowEl.remove();for(const b of S.bubbles)b.el.remove();S.bubbles.length=0;
      for(const T of S.teens)for(const q of T.tears)q.m.removeFromParent();
    }
    onClear(dispose);
    S.dispose=dispose;
    S.hudNow=hud;
    S.update(0,{});
    return S;
  };
}
