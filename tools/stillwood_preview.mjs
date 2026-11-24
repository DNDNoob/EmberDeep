// node tools/stillwood_preview.mjs [out.html]  -- writes a self-contained build (from index.html) that boots straight into the still wood
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=process.argv[2]||root+'/preview/DoorSimulator-stillwood-preview.html';
const html=readFileSync(root+'/index.html','utf8');
const boot=`<script>(function(){var n=0,t=setInterval(function(){
  var G=window.__game;if(++n>600){clearInterval(t);return}
  if(!G||!G.previewRoom||!G.startRun)return;
  try{if(G.state!=='room'&&G.state!=='play')G.startRun('STILLWOOD',1,true);
    if(G.state==='play'&&G.previewRoom('stillwood',7)){clearInterval(t)}}catch(e){console.warn('stillwood preview',e)}
},100)})();</script>`;
const i=html.lastIndexOf('</body>');
writeFileSync(out,i<0?html+boot:html.slice(0,i)+boot+html.slice(i));
console.log(out);
