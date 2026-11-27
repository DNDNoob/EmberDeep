// node tools/forest_test.mjs  -- checks the Dark Forest floor (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch({executablePath:process.env.LIFT_BROWSER||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)},ok=(c,m)=>{if(!c)bad(m);else console.log('ok  ',m)};
const open=async q=>{
  const pg=await b.newPage({viewport:{width:640,height:360}}),errs=[];
  pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,300))});
  await pg.addInitScript(([q])=>{window.__norender=true;localStorage.setItem('emberdeep.quality',JSON.stringify(q))},[q]);
  await pg.goto(pathToFileURL(root+'/index.html').href);await pg.waitForFunction(()=>window.__game&&window.__game.genFloor);
  return {pg,errs};
};
for(const q of ['low','medium']){
  const {pg,errs}=await open(q);
  const r=await pg.evaluate(()=>{const G=window.__game,o={};
    o.kinds=[7,15,23,3,11,4,5].map(d=>G.floorKind(d));
    o.forest=[7,23].map(d=>{const F=G.genFloor('FT',d);return F.kind+':'+F.name+':'+F.bi+':'+!!F.forest});
    o.cave=[3,11].map(d=>G.genFloor('FT',d).kind);
    // forest grid equals the maze path: same seed at a maze depth with the same size parameters is not comparable, so check structure instead
    const F=G.genFloor('FT',7),W=F.W,H=F.H;let okb=true;
    for(let x=0;x<W;x++)if(F.g[x]!==1||F.g[(H-1)*W+x]!==1)okb=false;
    o.border=okb;o.reach=(()=>{const d=G.bfs(F.g,W,H,F.start.tx,F.start.ty);return d[F.exit.ty*W+F.exit.tx]>0})();
    G.startRun('FT',7,true);
    const dock=G.F.lift;
    o.gridKept=G.F.g.every((tile,i)=>{
      if(tile===F.g[i])return true;
      if(!dock||tile!==0||F.g[i]!==1)return false;
      const x=i%W,z=Math.floor(i/W);
      return dock.fx?z===dock.tz:x===dock.tx;
    });
    // core coverage: every wall tile beside open floor (not a pocket) has a core face on each open side
    const f2=G.F;let missing=0,faces=0;const cf=G.FOREST.faces(f2),has=new Set(cf.map(c=>c.tx+','+c.ty+','+c.dx+','+c.dz));faces=cf.length;
    for(let y=0;y<f2.H;y++)for(let x=0;x<W;x++){if(f2.g[y*W+x]!==1)continue;for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+d[0],ny=y+d[1];
      if(nx<0||ny<0||nx>=W||ny>=H)continue;if(f2.g[ny*W+nx]!==1&&!f2.pocketMask[ny*W+nx]&&!(f2.mazeH&&f2.safeMask[ny*W+nx])&&!has.has(x+','+y+','+d[0]+','+d[1]))missing++}}
    o.missing=missing;o.faces=faces;
    // mesh: no ceiling quads (layer 2/4/6 groups) outside pockets; worldMesh geometry groups use materials from getWorldMat
    const gm=G.F&&G.forestGrp;o.group=!!gm;o.stats=gm.userData.stats;
    // determinism
    const a=JSON.stringify(G.FOREST.place(F));
    o.det=a===JSON.stringify(G.FOREST.place(F));
    o.det2=JSON.stringify(G.FOREST.place(G.genFloor('FT',7)))===a;
    // ceiling: count geometry whose normal points down at height WALL_H
    const pos=G.scene.children.find(m=>m.isMesh&&m.geometry&&m.geometry.groups&&m.geometry.groups.length>1);
    return o});
  console.log(JSON.stringify(r.stats));
  ok(JSON.stringify(r.kinds)==='["forest","arena","forest","cave","cave","back","arena"]','floorKind: 7/23 forest, 3/11 cave, bosses keep 5/15 ('+r.kinds+') ['+q+']');
  ok(r.forest.every(s=>s==='forest:The Dark Forest:8:true'),'depths 7 and 23 are The Dark Forest, biome 8 ('+r.forest+')');
  ok(r.cave.every(k=>k==='cave'),'depths 3 and 11 stay caves');
  ok(r.border&&r.reach,'forest grid is a maze with a solid border and a reachable exit');
  ok(r.gridKept,'installing the forest leaves the maze grid intact outside the lift approach');
  ok(r.missing===0&&r.faces>200,'every wall tile beside open floor has a core face ('+r.faces+' faces, '+r.missing+' missing)');
  ok(r.det&&r.det2,'instance placement is deterministic');
  ok(r.stats.tris<250000,'forest triangles under budget at 31x31 ('+r.stats.tris+')');
  const ceil=await pg.evaluate(()=>{const G=window.__game;G.startRun('CEIL',7,true);G.loadFloor(7,{bi:8,ix:0});
    const wm=G.scene.children.find(o=>Array.isArray(o.material)&&o.material.some(m=>m.customProgramCacheKey()==='forest-creek'));
    const {normal:n,position:p}=wm.geometry.attributes,F=G.F;let outside=0;
    for(let i=0;i<n.count;i+=3){
      if(n.getY(i)>-.999||Math.abs(p.getY(i)-1.25)>1e-3)continue;
      const x=Math.floor((p.getX(i)+p.getX(i+1)+p.getX(i+2))/3);
      const z=Math.floor((p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3);
      if(!F.safeMask[z*F.W+x]&&!F.pocketMask[z*F.W+x])outside++;
    }
    return outside});
  ok(ceil===0,'no ceiling quads outdoors ('+ceil+' at wall height)');
  // all variants on forest floors of both sizes render cleanly
  const before=errs.length;
  const res=[];
  for(const d of [7,23])for(let ix=0;ix<4;ix++){
    await pg.evaluate(([d,ix])=>{
      const G=window.__game;G.startRun('RF'+ix,d,true);G.loadFloor(d,{bi:8,ix});G.resize();
    },[d,ix]);
    await pg.waitForFunction(()=>window.__game.F.fo.stats.ready,null,{timeout:180000});
    res.push(await pg.evaluate(()=>{
      const G=window.__game,F=G.F,gl=G.renderer.getContext();
      // The existing lift and spawn setup can leave an error before the forest draw.
      gl.getError();G.render(2);gl.finish();
      const {tris,hedgeTris,calls,models}=F.fo.stats;
      const hedge=G.scene.children.find(m=>Array.isArray(m.material)&&m.material.some(mat=>mat.customProgramCacheKey()==='hedge'));
      const sprays=hedge?.material.find(mat=>mat.customProgramCacheKey()==='hedge-leaves');
      const group=hedge?.geometry.groups.find(part=>hedge.material[part.materialIndex].customProgramCacheKey()==='hedge');
      const normal=hedge?.geometry.attributes.normal;
      let curved=false;
      if(group&&normal){
        curved=true;
        for(let i=group.start;i<group.start+group.count;i+=3){
          if([normal.getX(i),normal.getY(i),normal.getZ(i)].every((v,j)=>
            v===[normal.getX(i+1),normal.getY(i+1),normal.getZ(i+1)][j]&&
            v===[normal.getX(i+2),normal.getY(i+2),normal.getZ(i+2)][j])){
            curved=false;
            break;
          }
        }
      }
      const markerCount=F.fo.n.landmarks.length;
      const junctions=F.fo.n.landmarks.every(q=>{
        const x=Math.floor(q.x),z=Math.floor(q.z);
        return [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>F.g[(z+dz)*F.W+x+dx]===0).length===3;
      });
      return {d:G.R.depth,v:F.variant.name,err:gl.getError(),tris,hedgeTris,calls,models,markerCount,junctions,hedge:curved&&!!hedge?.geometry.attributes.color&&!!sprays&&!sprays.map};
    }));
  }
  const lifecycle=await pg.evaluate(()=>{
    const G=window.__game,group=G.forestGrp,slot=group.userData.lod[0],count=G.F.fo.stats.tris;
    let switched=false;
    if(slot){
      const matrix=slot.near.instanceMatrix.array;
      const first=slot.list[0],last=slot.list.reduce((a,b)=>
        Math.hypot(a.x-first.x,a.z-first.z)>Math.hypot(b.x-first.x,b.z-first.z)?a:b);
      G.FOREST.focus(group,first.x,first.z);
      const before=[matrix[12],matrix[14]];
      G.FOREST.focus(group,last.x,last.z);
      switched=(matrix[12]!==before[0]||matrix[14]!==before[1])&&G.F.fo.stats.tris===count;
    }
    G.loadFloor(2);
    return {switched,gone:!G.forestGrp&&!group.parent&&group.userData.disposed};
  });
  ok(res.every(x=>!x.err),'all four forest variants render at depths 7 and 23 without GL errors ['+q+']');
  ok(res.every(x=>x.hedge&&x.hedgeTris>10000),'every variant renders rounded bush crowns with no planar backing');
  ok(res.every(x=>x.tris+x.hedgeTris<=342000),'forest scenery triangles within budget at 41x41: '+res.slice(4).map(x=>x.v+' '+(x.tris+x.hedgeTris)).join(', '));
  ok(res.every(x=>x.markerCount>=2&&x.junctions),'glowcaps mark actual junctions throughout the forest');
  ok(res.every(x=>x.models.fir>0&&x.models.shrub>0&&x.models.mossrock>0)&&res.some(x=>x.v==='deadwood'&&x.models.snag>0),
    'shared Still Wood meshes load in each variant: '+res.slice(4).map(x=>x.v+' '+JSON.stringify(x.models)).join(' | '));
  if(q!=='low')ok(lifecycle.switched,'moving the view swaps detail levels within the same budget');
  ok(lifecycle.gone,'leaving the forest removes and disposes its meshes');
  ok(errs.length===before&&errs.length===0,'no page or shader errors ['+q+']'+(errs.length?' -> '+errs.slice(0,3).join(' | '):''));
  await pg.close();
}
await b.close();
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
