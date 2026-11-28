// The one movement system: the maze and every strange-door room walk, sprint and jump through this file.
// All numbers are in MAZE units (eye height 0.62). A room in human scale (eye 1.6) passes scale = eye / 0.62,
// so speeds, jump height, gravity and footstep timing are multiplied up and it FEELS the same as the maze.
// To change how the whole game moves, change MOVE. Rooms only declare exceptions (see MODES in rooms.js).
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const MOVE={
  eye:0.62,                    // the maze eye height the numbers below belong to
  crouchSpeed:0.54, crouchEye:0.61,
  walk:2.7, sprint:4.3,        // ground speed
  sprintAirMul:1.18, airMin:2.7, airControl:7,   // in the air you keep the speed you left the ground with and steer toward it
  jumpV:3.5, gravity:11, jumpBuffer:0.15,        // jump launch speed, gravity, how long an early jump press is remembered
  stamina:{max:100, drain:30, regen:18, winded:30, lungs:0.2},   // sprint drain/s (less per lungs upgrade), regen/s, winded until this much is back
  turn:2.5, padTurn:1.35, padPitch:1.9,          // arrow-key turn rad/s, pad stick turn multiplier, pad pitch rad/s
  mouse:0.0022, touchX:0.0062, touchY:0.005,     // mouse and touch look, radians per pixel (times the sensitivity slider)
  pitch:0.9, roomPitch:1.2,                      // look-up/down limit in the maze and in rooms
  stepBob:2.3, bobAmp:0.018,                     // footstep phase per metre walked, vertical head bob
};
export const scaleFor=eye=>eye/MOVE.eye;
export const newBody=o=>Object.assign({x:0,z:0,y:0,vx:0,vz:0,vy:0,airSpeed:MOVE.airMin,jumpQ:0,bob:0,stepPh:0,stam:MOVE.stamina.max,winded:false},o);

// Advances the footstep phase by a distance walked (also used for a watcher's interpolated view); true when a foot lands.
export function bobAdvance(b,dist,scale){
  b.bob+=dist/(scale||1)*MOVE.stepBob;
  const ph=Math.floor(b.bob/Math.PI);
  if(ph!==b.stepPh){b.stepPh=ph;return true}
  return false;
}
// the vertical head bob, in world units
export const bobY=(b,scale)=>Math.sin(b.bob*2)*MOVE.bobAmp*(scale||1)*(1-(b.crouchBlend||0)*0.6);
export const crouchOffset=(b,eye)=>(b.crouchBlend||0)*eye*(1-MOVE.crouchEye);

// Shared look: keyboard/pad turn (turn is -1..1 already including the pad stick) and pad pitch. lim is a +- number or [lo,hi].
const lims=l=>Array.isArray(l)?l:[-l,l];
export function lookStep(o,dt,turn,pitchIn,lim){
  o.yaw+=turn*MOVE.turn*dt;
  if(pitchIn){const [lo,hi]=lims(lim===undefined?MOVE.roomPitch:lim);o.pitch=clamp(o.pitch-pitchIn*MOVE.padPitch*dt,lo,hi)}
}
// mouse / touch look: dyaw and dpitch are already scaled (pixels * MOVE.mouse * sens)
export function lookBy(o,dyaw,dpitch,lim){
  const [lo,hi]=lims(lim===undefined?MOVE.roomPitch:lim);
  o.yaw+=dyaw;o.pitch=clamp(o.pitch-dpitch,lo,hi);
}

// One step of a body. it = {fwd,str} local axes (-1..1), {fx,fz} the world direction "forward" points,
// {jump,sprint} held buttons, {ctl:false} to forbid starting a jump (the maze uses this while a menu or grab has you).
// w = {scale, speedMul, sta (object with stam/winded, default the body), lungs, blocked(x,z) per-axis (maze),
//      canStand(b) checks overhead clearance before the body stands;
//      collide(b) push-out after the move (rooms), snap (max drop followed on stairs/slopes, rooms only), groundAt(x,z), ceilingAt(x,z) (max body height)}.
// Returns {jumped, landed (impact speed in maze units, 0 if none), step, moving, sprint, speed, ground}.
export function stepMove(b,dt,it,w){
  const sc=w.scale||1,ev={jumped:false,landed:0,step:false,moving:false,sprint:false,speed:0,ground:false};
  b.crouched=!!it.crouch||!!(b.crouched&&w.canStand&&!w.canStand(b));
  const blend=b.crouchBlend||0;
  if(blend||b.crouched){
    b.crouchBlend=blend+(Number(b.crouched)-blend)*Math.min(1,dt*17);
    if(b.crouchBlend<0.001)b.crouchBlend=0;
  }
  let fwd=it.fwd||0,str=it.str||0;
  const mag=Math.hypot(fwd,str);if(mag>1){fwd/=mag;str/=mag}
  const moving=mag>0.05,g0=w.groundAt?w.groundAt(b.x,b.z):0,ground=b.y<=g0;
  if(ground&&b.y<g0)b.y=g0;
  const sta=w.sta||b,S=MOVE.stamina;
  const wantSprint=!!it.sprint&&moving&&!sta.winded&&!b.crouched;
  if(ground){
    if(wantSprint){sta.stam-=S.drain*(1-S.lungs*(w.lungs|0))*dt;if(sta.stam<=0){sta.stam=0;sta.winded=true}}
    else{sta.stam=Math.min(S.max,sta.stam+S.regen*dt);if(sta.winded&&sta.stam>=S.winded)sta.winded=false}
  }
  const speed=(wantSprint?MOVE.sprint:MOVE.walk)*sc*(w.speedMul===undefined?1:w.speedMul)*(b.crouched?MOVE.crouchSpeed:1);
  const dxn=it.fx*fwd-it.fz*str,dzn=it.fz*fwd+it.fx*str;
  if(ground){b.vx=dxn*speed;b.vz=dzn*speed}
  else if(moving){const k=Math.min(1,MOVE.airControl*dt);b.vx+=(dxn*b.airSpeed-b.vx)*k;b.vz+=(dzn*b.airSpeed-b.vz)*k}
  if(b.jumpQ>0)b.jumpQ-=dt;
  if(b.crouched)b.jumpQ=0;
  if(ground&&!b.crouched&&it.ctl!==false&&(b.jumpQ>0||it.jump)){
    b.jumpQ=0;b.vy=MOVE.jumpV*sc;b.y=g0+0.0001*sc;
    b.airSpeed=Math.max(speed*(wantSprint?MOVE.sprintAirMul:1),MOVE.airMin*sc);ev.jumped=true;
  }
  if(b.y>g0){
    b.vy-=MOVE.gravity*sc*dt;b.y+=b.vy*dt;
    const cl=w.ceilingAt?w.ceilingAt(b.x,b.z):Infinity;
    if(b.y>cl){b.y=cl;if(b.vy>0)b.vy=0}
    if(b.y<=g0&&b.vy<=0){ev.landed=-b.vy/sc;b.y=g0;b.vy=0}
  }
  if(w.blocked){
    const nx=b.x+b.vx*dt;
    if(!w.blocked(nx,b.z))b.x=nx;
    else{ev.blockedX=true;ev.hitVX=b.vx;if(ground)b.vx=0}
    const nz=b.z+b.vz*dt;
    if(!w.blocked(b.x,nz))b.z=nz;
    else{ev.blockedZ=true;ev.hitVZ=b.vz;if(ground)b.vz=0}
  }else{b.x+=b.vx*dt;b.z+=b.vz*dt}
  if(w.collide)w.collide(b);
  // walking down a slope or steps: stay on the floor instead of drifting off it (only for rooms that ask, with the largest drop to follow)
  if(w.snap&&(ground||ev.landed>0)&&!ev.jumped&&b.vy<=0&&w.groundAt){const g1=w.groundAt(b.x,b.z);if(b.y>g1&&b.y-g1<=w.snap*sc){b.y=g1;b.vy=0}}
  if(moving&&b.y<=g0&&bobAdvance(b,speed*dt,sc))ev.step=true;
  ev.moving=moving;ev.sprint=wantSprint;ev.speed=speed;ev.ground=b.y<=g0;
  return ev;
}

// A sprint into a solid wall, once per fresh impact. cell() is 0 open, 1 wall, 2 gate or blocked.
// roll is in [0,1). Returns the open cell beyond the wall, or null. Never crosses a gate.
export function noclipDest({x,z,hitVX=0,hitVZ=0,sprint,fullSpeed,roll,chance=0.025,cell,W,H}){
  if(!sprint)return null;
  const sp=Math.hypot(hitVX,hitVZ);
  if(!(fullSpeed>0)||sp<fullSpeed*0.72)return null;
  if(!(roll<chance))return null;
  const ax=Math.abs(hitVX)>=Math.abs(hitVZ);
  const dirx=ax?Math.sign(hitVX):0,dirz=ax?0:Math.sign(hitVZ);
  if(!dirx&&!dirz)return null;
  const tx=Math.floor(x),tz=Math.floor(z);
  const wx=tx+dirx,wz=tz+dirz;
  if(wx<1||wz<1||wx>=W-1||wz>=H-1)return null;
  if(cell(wx,wz)!==1)return null;
  const bx=wx+dirx,bz=wz+dirz;
  if(bx<0||bz<0||bx>=W||bz>=H)return null;
  if(cell(bx,bz)!==0)return null;
  return {x:bx+0.5,z:bz+0.5};
}

// The default walker for a room, so a new room gets the full maze movement in a few lines:
//   const W=createRoomWalker({o,eye:1.6,x:0,z:5,collide:b=>{...push b.x/b.z out of walls...}});
//   each frame:  lookStep(S,dt,inp.lx,inp.ly);  const ev=W.step(dt,inp,S.yaw);   camera height = eye + W.b.y + bobY(W.b,W.scale) - crouchOffset(W.b,eye)
// c: o (the room options, for the shared stamina and sounds), eye, x, z, collide(b), groundAt(x,z), ceilingAt(x,z),
//    speedMul() extra slowdown (a room's own effects), sound(ev) to replace the default jump/step/landing sounds.
// Stamina, boots, lungs and chill come from the game through o.sta, o.speedMul() and o.lungs(), the same as in the maze.
const num=v=>typeof v==='number'&&isFinite(v)?clamp(v,-1,1):0;
export function createRoomWalker(c){
  const o=c.o||{},sc=scaleFor(c.eye),b=newBody({x:c.x||0,z:c.z||0});
  const W={b,eye:c.eye,scale:sc,ev:null,pj:false};
  const world={scale:sc,snap:c.snap,sta:o.sta||b,collide:c.collide?()=>c.collide(b):null,groundAt:c.groundAt,ceilingAt:c.ceilingAt,canStand:c.canStand};
  const sound=c.sound||(e=>{if(!o.sfx)return;if(e.jumped)o.sfx('jump');else if(e.landed>0.8||e.step)o.sfx('step')});
  W.step=(dt,inp,yaw)=>{
    const mx=num(inp.mx),my=num(inp.my);
    world.speedMul=(o.speedMul?o.speedMul():1)*(c.speedMul?c.speedMul():1);world.lungs=o.lungs?o.lungs():0;
    const it={fwd:-my,str:mx,fx:Math.sin(yaw),fz:-Math.cos(yaw),jump:!!inp.jump,sprint:!!inp.sprint,crouch:!!inp.crouch};
    if(it.jump&&!W.pj&&!(W.ev&&W.ev.ground))b.jumpQ=MOVE.jumpBuffer;W.pj=it.jump;
    // small slices, so even a long frame at room speed cannot step through a thin wall
    const n=Math.max(1,Math.ceil(dt/0.04)),tot={jumped:false,landed:0,step:false,moving:false,sprint:false,speed:0,ground:true};
    for(let i=0;i<n;i++){
      const e=stepMove(b,dt/n,it,world);W.ev=e;
      tot.jumped=tot.jumped||e.jumped;tot.landed=Math.max(tot.landed,e.landed);tot.step=tot.step||e.step;tot.moving=e.moving;tot.sprint=e.sprint;tot.speed=e.speed;tot.ground=e.ground;
    }
    W.ev=tot;sound(tot);return tot;
  };
  // a watcher's view eases toward the player's reported spot; the bob follows how far it really moved
  W.watch=(dt,tx,tz,jy)=>{
    b.y+=(jy-b.y)*Math.min(1,dt*14);
    if(!W.has||Math.hypot(tx-b.x,tz-b.z)>3){b.x=tx;b.z=tz;W.has=true;return}
    const k=Math.min(1,dt*10),ox=b.x,oz=b.z;b.x+=(tx-b.x)*k;b.z+=(tz-b.z)*k;
    if(dt>0&&b.y<0.01*sc)bobAdvance(b,Math.hypot(b.x-ox,b.z-oz),sc);
  };
  W.inAir=()=>!(W.ev?W.ev.ground:true);
  return W;
}
