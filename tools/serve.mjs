// Tiny static server so tests load index.html over http (fetch of music/*.ogg is blocked on file://).
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {join,extname,normalize} from 'node:path';
const TYPES={'.html':'text/html','.js':'text/javascript','.ogg':'audio/ogg','.json':'application/json','.png':'image/png'};
export function serve(root){return new Promise(ok=>{const s=createServer(async(q,r)=>{
  const p=normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^([/\\])+/,'')||'index.html';
  try{const b=await readFile(join(root,p));r.writeHead(200,{'content-type':TYPES[extname(p)]||'application/octet-stream'});r.end(b)}
  catch(e){r.writeHead(404);r.end()}
}).listen(0,'127.0.0.1',()=>ok({url:'http://127.0.0.1:'+s.address().port+'/',close:()=>s.close()}))})}
