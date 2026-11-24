// usage: node tools/_dbg.mjs name kind seed camx camy camz tx ty tz fov [q]
import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';import {resolve,dirname} from 'node:path';
const {chromium}=createRequire(import.meta.url)('playwright');const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [name,kind,seed,cx,cy,cz,tx,ty,tz,fov,q]=process.argv.slice(2);
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await b.newPage({viewport:{width:1000,height:700}});pg.on('pageerror',e=>console.log(String(e)));
await pg.goto(pathToFileURL(root+'/tools/nature-gallery.html').href+'?q='+(q||2));await pg.waitForFunction(()=>window.__gal&&window.__gal.ready);
await pg.evaluate(([k,s,c,t,f])=>{const g=window.__gal;g.place(k.split(',').map((kk,i)=>({kind:kk,seed:+s,x:i*1.0,z:0})));g.setCamera(c,t,f)},[kind,seed,[+cx,+cy,+cz],[+tx,+ty,+tz],+fov]);
await pg.screenshot({path:resolve(root,'shots/nature/dbg_'+name+'.png')});await b.close();
