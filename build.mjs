// Bundles src/game.js with Three.js and inlines it into one self-contained index.html
import {build} from 'esbuild';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {GLITCH_ARCHIVE} from './src/glitch-catalog.js';
// version hash of the kit sources: keys the baked-mesh cache (IndexedDB) so a changed kit or recipe never loads stale meshes
const kitInputs=readdirSync('src').filter(f=>/^(npc_|sculpt).*\.js$/.test(f)||f==='nature.js'||f==='anthro.js'||f==='ansur2_stats.json').sort();
let kh=2166136261;for(const f of kitInputs)for(const c of readFileSync('src/'+f,'utf8')){kh^=c.charCodeAt(0);kh=Math.imul(kh,16777619)}
const KIT_HASH=(kh>>>0).toString(36);
const dev=process.argv.includes('--dev');
const glitchClips=Object.fromEntries(Object.keys(GLITCH_ARCHIVE).map(id=>{
  const path=`src/art/glitches/${id}.webm`;
  const clip=readFileSync(path);
  if(!clip.length)throw new Error(`Glitch Archive clip is empty: ${path}`);
  return [id,`data:video/webm;base64,${clip.toString('base64')}`];
}));
const r=await build({entryPoints:['src/game.js'],bundle:true,format:'iife',minify:!dev,write:false,target:'es2020',legalComments:'none',
  define:{__KIT_HASH__:JSON.stringify(KIT_HASH),__GLITCH_CLIPS__:JSON.stringify(glitchClips)},
  alias:{'three/addons':'./node_modules/three/examples/jsm'}});
const js=r.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const shell=readFileSync('src/shell.html','utf8');
const out=shell.replace('/*BUNDLE*/',()=>js);
writeFileSync('index.html',out);
console.log('index.html',(out.length/1024).toFixed(0)+' KB');
