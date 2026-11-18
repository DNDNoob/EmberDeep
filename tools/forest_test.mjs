// node tools/forest_test.mjs  -- checks the Dark Forest floor (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
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
    o.forest=[7,15].map(d=>{const F=G.genFloor('FT',d);return F.kind+':'+F.name+':'+F.bi+':'+!!F.forest});
    o.cave=[3,11].map(d=>G.genFloor('FT',d).kind);
    // forest grid equals the maze path: same seed at a maze depth with the same size parameters is not comparable, so check structure instead
    const F=G.genFloor('FT',7),W=F.W,H=F.H;let okb=true;
    for(let x=0;x<W;x++)if(F.g[x]!==1||F.g[(H-1)*W+x]!==1)okb=false;
    o.border=okb;o.reach=(()=>{const d=G.bfs(F.g,W,H,F.start.tx,F.start.ty);return d[F.exit.ty*W+F.exit.tx]>0})();
    const fg=Array.from(F.g).join('');G.loadFloor(7);o.gridKept=Array.from(G.F.g).join('')===Array.from(G.genFloor(G.R.seed,7).g).join('');
    // core coverage: every wall tile beside open floor (not a pocket) has a core face on each open side
    const f2=G.F;let missing=0,faces=0;const cf=G.FOREST.faces(f2),has=new Set(cf.map(c=>c.tx+','+c.ty+','+c.dx+','+c.dz));faces=cf.length;
    for(let y=0;y<f2.H;y++)for(let x=0;x<W;x++){if(f2.g[y*W+x]!==1)continue;for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+d[0],ny=y+d[1];
      if(nx<0||ny<0||nx>=W||ny>=H)continue;if(f2.g[ny*W+nx]!==1&&!f2.pocketMask[ny*W+nx]&&!has.has(x+','+y+','+d[0]+','+d[1]))missing++}}
    o.missing=missing;o.faces=faces;
    // mesh: no ceiling quads (layer 2/4/6 groups) outside pockets; worldMesh geometry groups use materials from getWorldMat
    const gm=G.F&&G.forestGrp;o.group=!!gm;o.stats=gm.userData.stats;
    // determinism
    const a=JSON.stringify(G.FOREST.place(G.F)),c=JSON.stringify(G.FOREST.place(G.F));o.det=a===c;
    const G2=G.genFloor(G.R.seed,7);G2.fo.n=null;o.det2=JSON.stringify(G.FOREST.place(Object.assign(G2,{})))===a;
    // ceiling: count geometry whose normal points down at height WALL_H
    const pos=G.scene.children.find(m=>m.isMesh&&m.geometry&&m.geometry.groups&&m.geometry.groups.length>1);
    return o});
  console.log(JSON.stringify(r.stats));
  ok(JSON.stringify(r.kinds)==='["forest","forest","forest","cave","cave","back","dark"]','floorKind: 7/15/23 forest, 3/11 cave ('+r.kinds+') ['+q+']');
  ok(r.forest.every(s=>s==='forest:The Dark Forest:8:true'),'depths 7 and 15 are The Dark Forest, biome 8 ('+r.forest+')');
  ok(r.cave.every(k=>k==='cave'),'depths 3 and 11 stay caves');
  ok(r.border&&r.reach,'forest grid is a maze with a solid border and a reachable exit');
  ok(r.gridKept,'loadFloor leaves the collision grid exactly as genFloor makes it');
  ok(r.missing===0&&r.faces>200,'every wall tile beside open floor has a core face ('+r.faces+' faces, '+r.missing+' missing)');
  ok(r.det&&r.det2,'instance placement is deterministic');
  ok(r.stats.tris<250000,'forest triangles under budget at 31x31 ('+r.stats.tris+')');
  const ceil=await pg.evaluate(()=>{const G=window.__game;G.startRun('CEIL',7,true);G.loadFloor(7,{bi:8,ix:0});
    let wm=null;G.scene.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&o.geometry.groups&&o.geometry.groups.length>1&&o.geometry.attributes.uv)wm=o});
    const n=wm.geometry.attributes.normal,p=wm.geometry.attributes.position;let down=0;
    for(let i=0;i<n.count;i++)if(n.getY(i)<-.9&&Math.abs(p.getY(i)-1.25)<1e-3)down++;
    const F=G.F;let pk=0;for(const v of F.pocketMask)pk+=v;return {down,pk}});
  ok(ceil.down===0||ceil.pk>0,'no ceiling quads on a forest floor ('+ceil.down+' at wall height, '+ceil.pk+' pocket tiles)');
  // all variants on forest floors of both sizes render cleanly
  const before=errs.length;
  const res=await pg.evaluate(()=>{const G=window.__game,out=[];
    for(const d of [7,15])for(let ix=0;ix<4;ix++){G.startRun('RF'+ix,d,true);G.loadFloor(d,{bi:8,ix});G.resize();G.render(1+ix);G.renderer.getContext().finish();
      out.push({d,v:G.F.variant.name,err:G.renderer.getContext().getError(),tris:G.F.fo.stats.tris,calls:G.F.fo.stats.calls,mats:G.worldMats.size,sf:G.SURFS.size()})}
    G.loadFloor(2);out.push({back:!G.forestGrp,mats:G.worldMats.size});return out});
  ok(res.slice(0,8).every(x=>!x.err),'all four forest variants render at depths 7 and 15 without GL errors ['+q+']');
  ok(res.slice(0,8).every(x=>x.tris<250000),'forest triangles < 250k at 41x41: '+res.slice(4,8).map(x=>x.v+' '+x.tris+' ('+x.calls+' draws)').join(', '));
  ok(res[8].back,'leaving the forest removes its meshes');
  ok(errs.length===before&&errs.length===0,'no page or shader errors ['+q+']'+(errs.length?' -> '+errs.slice(0,3).join(' | '):''));
  await pg.close();
}
await b.close();
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
