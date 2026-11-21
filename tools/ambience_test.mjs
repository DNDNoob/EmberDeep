// node tools/ambience_test.mjs  -- checks the ambient soundscapes (needs a built index.html). Add --levels to print the level table.
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';import {serve} from './serve.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']}),pg=await b.newPage({viewport:{width:1280,height:720}}),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error'||(m.type()==='warning'&&/ambience/.test(m.text())))errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
const srv=await serve(root);await pg.goto(srv.url+'index.html');await pg.waitForFunction(()=>window.__game&&window.__game.amb);
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)},ok=(c,m)=>{if(!c)bad(m);else console.log('ok  ',m)};
const ev=(f,a)=>pg.evaluate(f,a);
// ---- registry
const keys=await ev(()=>window.__game.amb.keys());
for(const k of ['default','The Old Stonework','Mossgrown Halls','The Frostvault','Cinder Warrens','back','cave','dark','forest','The Bone Galleries','The Rustworks','The Glimmer Veins'])ok(keys.includes(k),'registered '+k);
// ---- resolution
const res=await ev(()=>{const r=window.__game.amb.resolve,B=n=>({biome:{name:n}});return{
  moss:r({kind:'maze',...B('Mossgrown Halls')}),old:r({kind:'maze',...B('The Old Stonework')}),frost:r({kind:'maze',...B('The Frostvault')}),cinder:r({kind:'maze',...B('Cinder Warrens')}),
  cave:r({kind:'cave',...B('Mossgrown Halls')}),dark:r({kind:'dark',...B('Cinder Warrens')}),back:r({kind:'back',...B('The Humming Rooms')}),forest:r({kind:'forest',...B('The Dark Forest')}),
  bone:r({kind:'maze',...B('The Bone Galleries')}),made:r({kind:'maze',...B('Nowhere At All')}),nul:r(null),
  over:r({kind:'cave',ambience:'Cinder Warrens',...B('Mossgrown Halls')}),badover:r({kind:'maze',ambience:'nope',...B('Mossgrown Halls')})}});
ok(res.moss==='Mossgrown Halls'&&res.old==='The Old Stonework'&&res.frost==='The Frostvault'&&res.cinder==='Cinder Warrens','biomes resolve to their own spec');
ok(res.cave==='cave'&&res.dark==='dark'&&res.back==='back'&&res.forest==='forest','kinds win over biome');
ok(res.bone==='The Bone Galleries','new biome name resolves');
ok(res.made==='default'&&res.nul==='default','unknown biome / no floor -> default');
ok(res.over==='Cinder Warrens'&&res.badover==='Mossgrown Halls','F.ambience override wins (unregistered override ignored)');
const rt=await ev(()=>{const G=window.__game;return G.amb.registerAmbience?1:0});
// ---- runtime registration: expose through a floor whose biome we fake
await ev(()=>{window.fakeF=n=>({kind:'maze',biome:{name:n}})});
// ---- title screen: silent
await ev(()=>{const A=window.__game.amb;A.tick(30,{F:window.__game.F,state:'title'})});
ok(await ev(()=>window.__game.amb.voices===0&&Object.keys(window.__game.amb.fired).length===0),'nothing plays on the title screen');
// ---- start a run (user gesture for audio)
await pg.mouse.click(640,360);
await ev(()=>{window.__game.startRun('amb',1,true)});
ok(await ev(()=>window.__game.state==='play'),'run started');
await pg.waitForTimeout(600);
const mossF=await ev(()=>{const G=window.__game;G.F.biome={...G.F.biome,name:'Mossgrown Halls'};G.F.kind='maze';return 1});
await pg.waitForTimeout(300);
ok(await ev(()=>window.__game.amb.key==='Mossgrown Halls'),'moss floor in play uses the moss spec');
await ev(()=>{window.__game.amb.tick(60)});
const f1=await ev(()=>window.__game.amb.fired['Mossgrown Halls']||0);
ok(f1>=10,'one-shots fire over simulated time on the moss floor ('+f1+' in 60 s)');
// ---- hold / pause / room
await ev(()=>{window.__game.amb.tick(1)});
const before=await ev(()=>window.__game.amb.fired['Mossgrown Halls']);
await ev(()=>{window.__game.amb.tick(60,{hold:true})});
ok(await ev(b=>window.__game.amb.fired['Mossgrown Halls']===b,before),'nothing fires while held (hang / fall / away)');
await ev(()=>{window.__game.amb.tick(60,{state:'room',hold:false})});
ok(await ev(b=>window.__game.amb.fired['Mossgrown Halls']===b,before),'nothing fires inside a strange-door room');
ok(await ev(()=>window.__game.amb.voices<=1),'voice torn down after long silence');
// ---- switching floors: cleanup
const names=['Mossgrown Halls','The Frostvault','Cinder Warrens','The Old Stonework','The Bone Galleries','The Rustworks','The Glimmer Veins'],kinds=['cave','dark','back','forest'];
const nodes=[];
for(let r=0;r<4;r++){
  for(const n of [...names,...kinds]){
    await ev(n=>{const A=window.__game.amb;A.force(n);A.tick(2.5,{state:'play',hold:false})},n);
    const k=await ev(()=>window.__game.amb.key);if(k!==n)bad('key '+n+' got '+k);
  }
  await ev(()=>window.__game.amb.tick(5));
  nodes.push(await ev(()=>window.__game.amb.bedNodes));
}
ok(nodes.every(n=>n===nodes[0])||nodes[3]<=nodes[0]+2,'bed node count does not grow across many switches: '+nodes.join(','));
ok(await ev(()=>window.__game.amb.voices===1),'old voices cleaned up');
await ev(()=>{const A=window.__game.amb;A.tick(8,{state:'pause'});A.force(null)});
await pg.waitForTimeout(1500);
ok(await ev(()=>window.__game.amb.shotNodes<40),'one-shot nodes stop themselves (live '+'now)');
// runtime registration
await ev(()=>{window.__game.amb.register('Fake Biome',{beds:[{type:'noise',filter:{type:'lowpass',freq:200},gain:0.02}],shots:[{every:[0.2,0.4],play:a=>a.tick({})}]})});
const rtm=await ev(()=>{const A=window.__game.amb;A.force(null);A.tick(10,{F:{kind:'maze',biome:{name:'Fake Biome'}},state:'play',hold:false});return [A.key,A.fired['Fake Biome']||0]});
ok(rtm[0]==='Fake Biome'&&rtm[1]>5,'spec registered at runtime under a made-up biome name is picked up ('+rtm[1]+' shots)');
// mute still goes through master
// ---- levels (offline render of each spec, vs sfx references)
const rows=await ev(async()=>{
  const out=[];const {amb}=window.__game;
  const sr=44100,secs=20;
  async function run(key,F){
    const oc=new OfflineAudioContext(2,sr*secs,sr),m=oc.createGain();m.gain.value=0.55;m.connect(oc.destination);
    const nb=oc.createBuffer(1,sr,sr),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    amb.init(oc,m,nb);
    const info={F,state:'play',hold:false};
    for(let k=0;k<200;k++)oc.suspend(Math.round(k*0.1*sr/128)*128/sr).then(()=>{amb.update(0.1,info);oc.resume()});
    const buf=await oc.startRendering();
    return buf;
  }
  const st=(buf,from)=>{let pk=0,s=0,n=0;for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=Math.floor(from*buf.sampleRate);i<d.length;i++){const a=Math.abs(d[i]);if(a>pk)pk=a;s+=d[i]*d[i];n++}}return{pk,rms:Math.sqrt(s/n)}};
  const cases={'default':{kind:'maze',biome:{name:'q'}},'Old Stonework':{kind:'maze',biome:{name:'The Old Stonework'}},'Mossgrown Halls':{kind:'maze',biome:{name:'Mossgrown Halls'}},'Frostvault':{kind:'maze',biome:{name:'The Frostvault'}},'Cinder Warrens':{kind:'maze',biome:{name:'Cinder Warrens'}},'back (Humming)':{kind:'back',biome:{name:'x'}},'cave (Hollow)':{kind:'cave',biome:{name:'x'}},'dark (Black Hush)':{kind:'dark',biome:{name:'x'}},'forest':{kind:'forest',biome:{name:'x'}},'Bone Galleries':{kind:'maze',biome:{name:'The Bone Galleries'}},'Rustworks':{kind:'maze',biome:{name:'The Rustworks'}},'Glimmer Veins':{kind:'maze',biome:{name:'The Glimmer Veins'}}};
  for(const[n,F]of Object.entries(cases)){const s=st(await run(n,F),3);out.push([n,s.pk,s.rms])}
  // references through the same master: drone only, a footstep, a gem chime
  {const oc=new OfflineAudioContext(2,sr*2,sr),m=oc.createGain();m.gain.value=0.55;m.connect(oc.destination);
   const nb=oc.createBuffer(1,sr,sr),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
   const s=oc.createBufferSource(),f=oc.createBiquadFilter(),g=oc.createGain();s.buffer=nb;s.loop=true;f.type='bandpass';f.frequency.value=320;f.Q.value=1.2;g.gain.setValueAtTime(0.12,0);g.gain.exponentialRampToValueAtTime(0.0001,0.09);s.connect(f);f.connect(g);g.connect(m);s.start(0);s.stop(0.12);
   const sp=st(await oc.startRendering(),0);out.push(['REF step peak',sp.pk,0]);}
  {const oc=new OfflineAudioContext(2,sr*2,sr),m=oc.createGain();m.gain.value=0.55;m.connect(oc.destination);
   for(const[f,t,v]of[[1320,0,0.12],[1760,0.06,0.1]]){const o=oc.createOscillator(),g=oc.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+0.15);o.connect(g);g.connect(m);o.start(t);o.stop(t+0.2)}
   const sp=st(await oc.startRendering(),0);out.push(['REF gem peak',sp.pk,0]);}
  return out;
});
console.log('\nlevel          peak    rms   (ambience bus only, 20 s offline render, last 17 s, through master 0.55; the existing drone alone is rms 0.023)');
for(const[n,pk,rms]of rows)console.log(n.padEnd(18),pk.toFixed(3),rms.toFixed(4));
const ref=rows.find(r=>r[0]==='REF gem peak')[1];
for(const[n,pk,rms]of rows){if(n.startsWith('REF'))continue;ok(pk<ref*1.6,n+' does not clip (peak '+pk.toFixed(3)+')');ok(rms<ref*0.25,n+' rms well below the gem sfx peak');if(!/dark|back/.test(n))ok(rms>0.001,n+' is audible (rms '+rms.toFixed(4)+')')}
ok(errs.length===0,'no page errors'+(errs.length?': '+errs.join(' | '):''));
await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
