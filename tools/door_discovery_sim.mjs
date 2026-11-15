// node tools/door_discovery_sim.mjs [seeds=40] [speed=3.3]
// Tunes DOOR_EXPLORE_PER_MIN: generates real floors with doorCountFor(depth) doors (13 fake kinds put in the registry so rotation
// mode runs through genFloor) and sends a map-blind frontier explorer in from the start tile. Reports time to the first door seen.
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL,fileURLToPath} from 'node:url';import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SEEDS=+process.argv[2]||40,SPEED=+process.argv[3]||3.3,SIGHT=6;
const b=await chromium.launch(),pg=await b.newPage();
await pg.addInitScript(()=>{window.__norender=true});
await pg.goto(pathToFileURL(root+'/index.html').href);await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
const rows=await pg.evaluate(([SEEDS,SPEED,SIGHT])=>{
  const G=window.__game;for(let i=0;i<13;i++)G.DOOR_KINDS['fake'+i]={look:'galaxy'};
  const out=[];
  for(let d=1;d<=20;d++){const times=[],opens=[],cnts=[],nom=2*Math.min(8+d,20)**2;let kind='';
    for(let s=0;s<SEEDS;s++){
      const f=G.genFloor('sim'+s,d),{W,H,g}=f;kind=f.kind;cnts.push(f.sdoors.length);
      let open=0;for(let i=0;i<W*H;i++)if(g[i]===0)open++;opens.push(open);
      const seen=new Uint8Array(W*H),isD=new Set(f.sdoors.map(q=>q.ty*W+q.tx));
      const los=(x0,y0,x1,y1)=>{let n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0))*2;for(let k=1;k<n;k++){const x=Math.floor(x0+(x1-x0)*k/n+0.5-0.5+0.0),y=Math.floor(y0+(y1-y0)*k/n);if(g[Math.floor(y)*W+Math.floor(x)]===1&&!(Math.floor(x)===Math.floor(x1)&&Math.floor(y)===Math.floor(y1)))return false}return true};
      const look=(cx,cy)=>{let hit=false;for(let y=Math.max(0,cy-SIGHT);y<=Math.min(H-1,cy+SIGHT);y++)for(let x=Math.max(0,cx-SIGHT);x<=Math.min(W-1,cx+SIGHT);x++){const i=y*W+x;if(seen[i]||Math.hypot(x-cx,y-cy)>SIGHT)continue;if(los(cx+0.5,cy+0.5,x+0.5,y+0.5)){seen[i]=1;if(isD.has(i))hit=true}}return hit};
      let cx=f.start.tx,cy=f.start.ty,t=0,found=look(cx,cy)?0:-1;
      const unseenN=(x,y)=>[[1,0],[-1,0],[0,1],[0,-1]].some(([a,c])=>{const nx=x+a,ny=y+c;return nx>=0&&ny>=0&&nx<W&&ny<H&&!seen[ny*W+nx]});
      while(found<0&&t<1500){
        // BFS over seen open tiles to the nearest frontier tile
        const prev=new Int32Array(W*H).fill(-2),q=[cy*W+cx];prev[q[0]]=-1;let tgt=-1;
        for(let h=0;h<q.length;h++){const c=q[h],x=c%W,y=(c/W)|0;if(c!==cy*W+cx&&unseenN(x,y)){tgt=c;break}
          for(const [a,e] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+a,ny=y+e,n=ny*W+nx;if(nx<0||ny<0||nx>=W||ny>=H||prev[n]!==-2||!seen[n]||g[n]!==0)continue;prev[n]=c;q.push(n)}}
        if(tgt<0)break;
        const path=[];for(let c=tgt;c!==cy*W+cx;c=prev[c])path.push(c);path.reverse();
        for(const c of path){t+=1/SPEED;cx=c%W;cy=(c/W)|0;if(look(cx,cy)){found=t;break}}
      }
      times.push(found<0?Infinity:found);
    }
    times.sort((a,b)=>a-b);const med=times[times.length>>1],p80=times[Math.floor(times.length*0.8)],u60=times.filter(x=>x<=60).length/times.length;
    opens.sort((a,b)=>a-b);
    out.push({d,kind,size:(Math.min(8+d,20)*2+1),doors:cnts.reduce((a,b)=>a+b)/cnts.length,minDoors:Math.min(...cnts),open:opens[opens.length>>1],nom,med,p80,u60});
  }return out},[SEEDS,SPEED,SIGHT]);
console.log('speed',SPEED,'tiles/s, sight',SIGHT,', seeds',SEEDS);
console.log('depth kind  size doors(min) openTiles nominal  median  p80   <=60s');
for(const r of rows)console.log(String(r.d).padStart(5),r.kind.padEnd(5),String(r.size).padStart(4),(r.doors.toFixed(1)+'('+r.minDoors+')').padStart(10),String(r.open).padStart(9),String(r.nom).padStart(7),r.med.toFixed(1).padStart(8),r.p80.toFixed(1).padStart(6),(r.u60*100).toFixed(0).padStart(6)+'%');
await b.close();
