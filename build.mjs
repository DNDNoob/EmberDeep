// Bundles src/game.js with Three.js and inlines it into one self-contained index.html
import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
const dev=process.argv.includes('--dev');
const r=await build({entryPoints:['src/game.js'],bundle:true,format:'iife',minify:!dev,write:false,target:'es2020',legalComments:'none',
  alias:{'three/addons':'./node_modules/three/examples/jsm'}});
const js=r.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const shell=readFileSync('src/shell.html','utf8');
const out=shell.replace('/*BUNDLE*/',()=>js);
writeFileSync('index.html',out);
console.log('index.html',(out.length/1024).toFixed(0)+' KB');
