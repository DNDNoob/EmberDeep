// node tools/pickaxe_test.mjs  -- checks the kiln pickaxe (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch(),pg=await b.newPage({viewport:{width:1280,height:720}}),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)},ok=(c,m)=>{if(!c)bad(m);else console.log('ok  ',m)};
await pg.evaluate(()=>{
  const G=window.__game,P=G.P,R=G.R;window.T={G};
  const idx=(x,y)=>y*G.F.W+x;
  T.sum=()=>{let s=0;for(const v of G.F.g)s+=v;return s+':'+G.F.g.length};
  // stand on the open tile next to wall (tx,ty), facing it
  T.face=(tx,ty)=>{const F=G.F;for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const ox=tx+d[0],oy=ty+d[1];if(ox<0||oy<0||ox>=F.W||oy>=F.H||F.g[idx(ox,oy)]!==0)continue;
    P.x=ox+0.5;P.z=oy+0.5;P.yaw=Math.atan2(-d[1],-d[0]);P.pitch=0;G.onTileChange();return {ox,oy,dx:-d[0],dy:-d[1]}}return null};
  // a breakable wall with open floor straight through on both sides (and a real detour around), not in the list of tiles to skip
  T.find=(skip)=>{const F=G.F;for(let y=2;y<F.H-2;y++)for(let x=2;x<F.W-2;x++){
    if(skip&&skip.some(q=>q[0]===x&&q[1]===y))continue;
    if(F.g[idx(x,y)]!==1||G.pkWhy(x,y))continue;
    for(const d of [[1,0],[0,1]]){const a=idx(x-d[0],y-d[1]),c=idx(x+d[0],y+d[1]);
      if(F.g[a]===0&&F.g[c]===0&&!F.pocketMask[a]&&!F.pocketMask[c]){const dd=G.bfs(F.g,F.W,F.H,x-d[0],y-d[1]);if(dd[c]>4||dd[c]<0)return {x,y,ax:x-d[0],ay:y-d[1],cx:x+d[0],cy:y+d[1],d:dd[c]}}}}return null};
  T.wall=(f)=>{const F=G.F;for(let y=1;y<F.H-1;y++)for(let x=1;x<F.W-1;x++)if(F.g[idx(x,y)]===1&&f(x,y))return [x,y];return null};
});
const ev=(f,a)=>pg.evaluate(f,a);
// ---- run start
await ev(()=>{const G=T.G;G.startRun('pickaxe',2,true);G.P.inv=0});
ok(await ev(()=>T.G.P.pick===0),'no pickaxe at run start');
// ---- the kiln win
const g0=await ev(()=>({w:T.G.wallet,g:T.G.R.gems,hp:T.G.P.hp,fuel:T.G.P.fuel}));
await ev(()=>{T.G.P.hp=1;T.G.roomEnd({k:'win',why:'kiln'})});
const w1=await ev(()=>({p:T.G.P.pick,w:T.G.wallet,g:T.G.R.gems,hp:T.G.P.hp,fuel:T.G.P.fuel,sc:T.G.R.score}));
ok(w1.p===1,'winning the kiln gives one pickaxe');
ok(w1.w===g0.w&&w1.g===g0.g,'no gems from the kiln any more');
ok(w1.hp===1&&w1.fuel<=g0.fuel,'no heart or fuel from the kiln');
ok(w1.sc>0,'score bonus kept');
await ev(()=>T.G.roomEnd({k:'win',why:'kiln'}));
ok(await ev(()=>T.G.P.pick===2),'winning again adds another');
await ev(()=>{T.G.P.pick=1});
// ---- nothing without a pick; nothing when fallen
const A=await ev(()=>{const t=T.find();T.face(t.x,t.y);return t});
ok(!!A,'found a breakable wall to test with');
let s0=await ev(()=>T.sum());
await ev(()=>{T.G.P.pick=0;T.G.usePick()});
ok(s0===await ev(()=>T.sum()),'use key does nothing without a pick');
await ev(()=>{T.G.P.pick=1;T.G.P.down=true;T.G.usePick();T.G.P.down=false});
ok(s0===await ev(()=>T.sum())&&await ev(()=>T.G.P.pick===1),'a fallen player cannot swing');
// ---- refusals keep the pick
const refuse=async(name,tile)=>{
  const r=await pg.evaluate(([tx,ty])=>{const G=T.G;const f=T.face(tx,ty);if(!f)return {skip:1};const before=T.sum(),p=G.P.pick,why=G.pkWhy(tx,ty);G.usePick();return {why,same:before===T.sum(),keep:G.P.pick===p}},tile);
  if(r.skip)console.log('skip',name);else ok(r.why!==''&&r.same&&r.keep,name+' refuses ('+r.why+') and keeps the pick')};
await refuse('map border',await ev(()=>{const F=T.G.F;for(let y=2;y<F.H-2;y++)if(F.g[idx0(1,y)]===0)return [0,y];function idx0(x,y){return y*F.W+x}}));
const gate=await ev(()=>{const F=T.G.F;return F.door?[F.door.tx,F.door.ty]:null});
ok(!!gate,'floor 2 has a locked gate');
if(gate)await refuse('the locked gate',gate);
await refuse('a wall beside the gate',await ev(()=>{const F=T.G.F;return T.wall((x,y)=>F.door&&Math.abs(x-F.door.tx)+Math.abs(y-F.door.ty)===1)}));
await refuse('a wall around the sanctuary',await ev(()=>{const F=T.G.F;return T.wall((x,y)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(F.safeMask[(y+dy)*F.W+x+dx])return true;return false})}));
await refuse('a strange door wall',await ev(()=>{const F=T.G.F;const D=F.sdoors[0];return D?[D.tx+D.dx,D.ty+D.dz]:null}));
// no wall may join the two sides of the shut gate
const joins=await ev(()=>{const G=T.G,F=G.F;let n=0,bad=0;const a=G.bfs(F.g,F.W,F.H,F.start.tx,F.start.ty);
  for(let y=1;y<F.H-1;y++)for(let x=1;x<F.W-1;x++){if(G.pkWhy(x,y)!=='')continue;n++;F.g[y*F.W+x]=0;const c=G.bfs(F.g,F.W,F.H,F.start.tx,F.start.ty);F.g[y*F.W+x]=1;
    for(let i=0;i<c.length;i++)if(a[i]<0&&c[i]>=0&&i!==y*F.W+x){bad++;break}}return {n,bad}});
ok(joins.n>0&&joins.bad===0,'none of the '+joins.n+' breakable walls lets you skip the gate');
// ---- a valid break
const B=await ev(()=>{const t=T.find();T.face(t.x,t.y);const G=T.G;return Object.assign(t,{before:G.F.dist[t.cy*G.F.W+t.cx]})});
await ev(()=>{const t=T.find();T.face(t.x,t.y);T.G.P.x=t.ax+0.5;T.G.P.z=t.ay+0.5;T.G.P.yaw=Math.atan2(t.y-t.ay,t.x-t.ax);T.G.onTileChange()});
const pre=await ev(()=>{const G=T.G,F=G.F,t=T.find();const aim=G.pkAim();return {aim,dist:F.dist[t.cy*F.W+t.cx]}});
ok(pre.aim&&pre.aim.ok&&pre.aim.tx===B.x&&pre.aim.ty===B.y,'aiming at the wall shows it as breakable');
await ev(()=>{T.G.usePick()});
const post=await ev(([x,y,ax,ay,cx,cy])=>{const G=T.G,F=G.F;return {g:F.g[y*F.W+x],pick:G.P.pick,d:F.dist[cy*F.W+cx],walk:!G.blocked(x+0.5,y+0.5)&&!G.solidAt(x+0.5,y+0.5),seen:F.seen[y*F.W+x],rec:JSON.stringify(G.R.pk[G.R.depth])}},[B.x,B.y,B.ax,B.ay,B.cx,B.cy]);
ok(post.g===0,'the wall tile became open floor');
ok(post.pick===0,'the pickaxe was consumed');
ok(post.walk,'the player can stand in the opening');
ok(post.d===2&&B.d>2,'bfs now reaches across ('+B.d+' steps became '+post.d+')');
ok(post.seen===1,'the tile is marked seen');
const s1=await ev(()=>T.sum());
await ev(()=>{const t=T.wall((x,y)=>T.G.pkWhy(x,y)==='');T.face(t[0],t[1]);T.G.usePick()});
ok(s1===await ev(()=>T.sum()),'a second press does nothing');
// ---- the hole survives a rebuild of the floor
await ev(()=>{T.G.loadFloor(2)});
ok(await ev(([x,y])=>T.G.F.g[y*T.G.F.W+x]===0,[B.x,B.y]),'the opening survives a rebuild of that floor');
ok(await ev(([x,y])=>T.G.pkWhy(x,y)==='notwall',[B.x,B.y]),'and it is no longer a wall to break');
// ---- multiplayer messages
const M=await ev(()=>{const t=T.find([[0,0]]);return t});
const before=await ev(()=>T.sum());
const garbage=[{d:'D',x:-1,y:5},{d:'D',x:5000,y:3},{d:'D',x:1.5,y:4},{d:'D',x:'3',y:'4'},{d:'D',x:NaN,y:2},{d:'D',x:null,y:null},{d:'D'},{d:'D',x:0,y:3},{d:'D',x:3,y:0},{d:'D',x:M.ax,y:M.ay},{d:99,x:M.x,y:M.y},{d:'2',x:M.x,y:M.y},{x:M.x,y:M.y}];
let threw=null;
for(const m of garbage){try{await pg.evaluate(m=>{if(m.d==='D')m.d=T.G.R.depth;T.G.mpRecv(Object.assign({k:'pk'},m),'peer1')},m)}catch(e){threw=String(e)}}
ok(!threw,'garbage pk messages do not throw '+(threw||''));
ok(before===await ev(()=>T.sum()),'garbage pk messages change nothing');
await ev(m=>{T.G.mpRecv({k:'pk',d:T.G.R.depth,x:m.x,y:m.y},'peer1')},M);
ok(await ev(m=>T.G.F.g[m.y*T.G.F.W+m.x]===0,M),'a valid pk message opens the tile');
ok(await ev(m=>JSON.stringify(T.G.R.pk[T.G.R.depth]).includes('['+m.x+','+m.y+']'),M),'and it is recorded for the floor');
const keepPick=await ev(()=>T.G.P.pick);
ok(keepPick===0,'a friend breaking a wall does not touch our pickaxe');
// wrong depth for a valid wall
const M2=await ev(()=>T.find());
await ev(m=>{T.G.mpRecv({k:'pk',d:T.G.R.depth+1,x:m.x,y:m.y},'peer1')},M2);
ok(await ev(m=>T.G.F.g[m.y*T.G.F.W+m.x]===1,M2),'a pk for another depth is ignored');
// ---- the pickaxe persists to the next floor
await ev(()=>{T.G.P.pick=1;T.G.loadFloor(3)});
ok(await ev(()=>T.G.P.pick===1&&T.G.R.depth===3),'an unused pickaxe persists to the next floor');
await ev(()=>{T.G.startRun('pickaxe',2,true)});
ok(await ev(()=>T.G.P.pick===0&&Object.keys(T.G.R.pk).length===0),'a new run starts with none and no broken walls');
ok(errs.length===0,'no console errors '+errs.join(' | '));
console.log(fails?fails+' FAILED':'all passed');await b.close();process.exit(fails?1:0);
