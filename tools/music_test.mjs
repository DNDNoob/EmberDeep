// node tools/music_test.mjs  -- checks the music channel with a generated test track (needs a built index.html)
import {createRequire} from 'node:module';const {chromium}=createRequire(import.meta.url)('playwright');
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';import {serve} from './serve.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']}),pg=await b.newPage({viewport:{width:1280,height:720}}),errs=[];
pg.on('pageerror',e=>errs.push(String(e)));pg.on('console',m=>{if(m.type()==='error'||(m.type()==='warning'&&/music/.test(m.text())))errs.push(m.text())});
await pg.addInitScript(()=>{window.__norender=true});
const srv=await serve(root);await pg.goto(srv.url+'index.html');await pg.waitForFunction(()=>window.__game&&window.__game.music);
let fails=0;const bad=m=>{fails++;console.log('FAIL',m)},ok=(c,m)=>{if(!c)bad(m);else console.log('ok  ',m)};
const ev=(f,a)=>pg.evaluate(f,a),wait=s=>pg.waitForTimeout(s*1000);
const M=f=>ev(f);
// ---- registry and resolution
const keys=await M(()=>Object.keys(window.__game.music.tracks));
for(const k of ['lobby','elevator','stonework','moss','cinder','frost','hollow','blackhush','chase','The Bone Galleries','The Rustworks','The Glimmer Veins','forest','stillwood'])ok(keys.includes(k),'track key '+k);
const shipped=await M(()=>JSON.parse(JSON.stringify(window.__game.music.tracks)));
ok(Object.entries(shipped).every(([k,a])=>a.length===(k==='stillwood'?1:2)),'every key ships two tracks (the still wood reuses one)');
ok(shipped.stillwood[0]==='music/glimmer-1.ogg','the still wood reuses an existing track');
const dec=await ev(async urls=>{const ac=new OfflineAudioContext(2,44100,44100),out=[];for(const u of urls){try{const b=await (await fetch(u)).arrayBuffer();const a=await ac.decodeAudioData(b);
  const d=a.getChannelData(0);let s=0,pk=0,bad=0;for(let i=0;i<d.length;i++){const x=d[i];if(x!==x)bad++;s+=x*x;pk=Math.max(pk,Math.abs(x))}out.push({u,dur:a.duration,rms:Math.sqrt(s/d.length),pk,bad})}catch(e){out.push({u,err:String(e)})}}return out},[...new Set(Object.values(shipped).flat())]);
ok(dec.length===26&&dec.every(x=>!x.err&&x.dur>55&&x.dur<65&&!x.bad&&x.rms>0.01&&x.rms<0.5&&x.pk<=1.01),'all 26 shipped tracks decode as real ~60 s music '+JSON.stringify(dec.filter(x=>x.err||x.bad||x.rms<=0.01||x.rms>=0.5||x.dur<=55)));
// the rest of the test drives the channel with a synthetic tone, so start from empty lists
await ev(()=>{const t=window.__game.music.tracks;for(const k in t)t[k].length=0});
// ---- generate a 2 s test tone as a WAV blob URL in the page and register it for moss and chase
await ev(()=>{
  const sr=8000,n=sr*2,buf=new ArrayBuffer(44+n*2),v=new DataView(buf),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/sr*6.283*220)*12000,true);
  const u=URL.createObjectURL(new Blob([buf],{type:'audio/wav'})),m=window.__game.music;
  window.__u=u;m.register('moss',[u]);
});
// ---- lobby: nothing plays (no lobby track registered), no voices created
await wait(0.5);
ok(await M(()=>window.__game.music.voices.length===0&&window.__game.music.playing===null),'lobby: silent, no voices, nothing loaded');
// ---- start a run
await pg.mouse.click(640,360);
// ---- lobby vs lift ride: the elevator tracks take over while riding
await ev(()=>{const m=window.__game.music;m.register('lobby',[window.__u]);m.register('elevator',[window.__u])});
await ev(()=>window.__game.music.override({lift:true}));await wait(0.5);
ok(await M(()=>window.__game.music.key==='elevator'),'riding the lift plays the elevator track');
await ev(()=>window.__game.music.override({lift:false}));await wait(0.5);
ok(await M(()=>window.__game.music.key==='lobby'),'off the lift the lobby track plays');
await ev(()=>{const m=window.__game.music;m.override(null);m.register('lobby',[]);m.register('elevator',[])});await wait(3.5);
await ev(()=>{window.__game.startRun('mus',1,true)});
ok(await M(()=>window.__game.state==='play'),'run started');
await ev(()=>{const G=window.__game;G.F.biome={...G.F.biome,name:'Mossgrown Halls'};G.F.kind='maze';G.F.back=false});
await wait(5);
let s=await M(()=>({k:window.__game.music.key,p:window.__game.music.playing,v:window.__game.music.voices,bus:window.__game.music.bus.gain.value,duck:window.__game.music.duckGain}));
ok(s.k==='moss'&&s.p==='moss','moss floor plays the moss track '+JSON.stringify(s.v));
ok(s.v[0]&&s.v[0].playing&&s.v[0].gain>0.9,'track faded in (gain '+(s.v[0]&&s.v[0].gain.toFixed(2))+')');
ok(Math.abs(s.bus-0.35)<0.01,'music bus defaults to 0.35 ('+s.bus.toFixed(3)+')');
ok(Math.abs(s.duck-1)<0.02,'no ducking while calm');
// ---- chase with no chase track: floor track ducks by about 6 dB
await ev(()=>window.__game.music.override({chasing:2,nearest:3}));
await wait(2.5);
let d=await M(()=>({duck:window.__game.music.duckGain,p:window.__game.music.playing}));
ok(d.p==='moss'&&Math.abs(d.duck-0.501)<0.03,'chase without chase track ducks the floor track ~6 dB ('+d.duck.toFixed(3)+')');
// ---- chase with a chase track: crossfade to it
await ev(()=>window.__game.music.register('chase',[window.__u]));
await wait(5);
let c=await M(()=>({k:window.__game.music.key,v:window.__game.music.voices,duck:window.__game.music.duckGain}));
ok(c.k==='chase'&&c.v.find(v=>v.key==='chase'&&v.gain>0.9)&&c.v.every(v=>v.key==='chase'||v.gain<0.1),'chase track takes over, floor track fades ('+c.v.map(v=>v.key+':'+v.gain.toFixed(2))+')');
ok(Math.abs(c.duck-1)<0.03,'no extra duck when the chase track plays');
await ev(()=>window.__game.music.override({chasing:0}));
await wait(9);
ok(await M(()=>window.__game.music.key==='moss'),'back to the floor track after the chase ends');
// ---- voice chat ducking
await ev(()=>window.__game.music.override({voiceActive:true}));await wait(2);
d=await M(()=>window.__game.music.duckGain);ok(Math.abs(d-0.398)<0.03,'voice chat ducks ~8 dB ('+d.toFixed(3)+')');
await ev(()=>window.__game.music.override(null));await wait(2);
ok(Math.abs(await M(()=>window.__game.music.duckGain)-1)<0.03,'duck released');
// ---- pause lowers, resume restores
await ev(()=>window.__game.pause());await wait(2);
d=await M(()=>({k:window.__game.music.key,duck:window.__game.music.duckGain}));
ok(d.k==='moss'&&Math.abs(d.duck-0.35)<0.03,'pause lowers music ('+d.duck.toFixed(3)+')');
// ---- sliders: real mouse clicks on the track of each range input, then persisted values
for(const bus of ['music','sfx','ambience']){
  const sl=pg.locator(`#pause .volSl[data-bus=${bus}]`);ok(await sl.isVisible(),bus+' slider visible in the pause panel');
}
// a real Escape releases the mouse before the pause panel shows; pause() from the test does not
await ev(()=>document.exitPointerLock());await wait(0.3);const bx=await pg.locator('#pause .volSl[data-bus=sfx]').boundingBox();
await pg.mouse.click(bx.x+bx.width*0.25,bx.y+bx.height/2);
const sfxV=await M(()=>window.__game.music.getVolumes().sfx);
ok(sfxV>0.15&&sfxV<0.35,'mouse click on the Effects slider sets it ('+sfxV.toFixed(2)+')');
await pg.locator('#pause .volSl[data-bus=music]').fill('70');await pg.locator('#pause .volSl[data-bus=ambience]').fill('20');
const stored=await M(()=>({m:localStorage.getItem('emberdeep.vol.music'),s:localStorage.getItem('emberdeep.vol.sfx'),a:localStorage.getItem('emberdeep.vol.ambience'),v:window.__game.music.getVolumes()}));
ok(stored.m==='0.7'&&stored.a==='0.2'&&+stored.s===sfxV,'values persisted '+JSON.stringify(stored));
await wait(0.3);
const g=await M(()=>({m:window.__game.music.bus.gain.value,s:window.__game.music.sfxBus.gain.value,a:window.__game.music.ambienceBus.gain.value}));
ok(Math.abs(g.m-0.7)<0.01&&Math.abs(g.a-0.2)<0.01&&Math.abs(g.s-sfxV)<0.01,'bus gains follow sliders '+JSON.stringify(g));
// touch: a tap on the slider
const tctx=await b.newContext({hasTouch:true,viewport:{width:1280,height:720}});await tctx.close();
await pg.evaluate(()=>{const el=document.querySelector('#pause .volSl[data-bus=music]');el.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',bubbles:true}));el.value=40;el.dispatchEvent(new Event('input',{bubbles:true}))});
ok(await M(()=>window.__game.music.getVolumes().music===0.4),'touch-style input event sets the slider value');
// reload keeps values
await pg.reload();await pg.waitForFunction(()=>window.__game&&window.__game.music);
ok(await M(()=>document.querySelector('#pause .volSl[data-bus=music]').value==='40'&&document.querySelector('#pause .volSl[data-bus=ambience]').value==='20'),'sliders restore from storage after reload');
// ---- Humming Rooms and strange-door rooms fade to silence
await ev(()=>{
  const sr=8000,n=sr,buf=new ArrayBuffer(44+n*2),v=new DataView(buf),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/sr*6.283*330)*12000,true);
  window.__u=URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));window.__game.music.register('moss',[window.__u]);window.__game.music.register('hollow',[window.__u]);
});
await pg.mouse.click(640,360);
await ev(()=>{window.__game.startRun('mus3',1,true)});
await ev(()=>{const G=window.__game;G.F.biome={...G.F.biome,name:'Mossgrown Halls'};G.F.kind='maze';G.F.back=false});
await wait(5);ok(await M(()=>window.__game.music.playing==='moss'),'moss plays again on a fresh page');
await ev(()=>{window.__game.F.back=true});await wait(6);
ok(await M(()=>window.__game.music.key===null&&window.__game.music.voices.every(v=>v.gain<0.05)),'Humming Rooms (F.back): faded to silence');
await ev(()=>{const G=window.__game;G.F.back=false;G.F.kind='cave'});await wait(5);
ok(await M(()=>window.__game.music.playing==='hollow'),'cave floor resolves to the hollow track');
await ev(()=>window.__game.music.override({inRoom:true}));await wait(6);
ok(await M(()=>window.__game.music.playing===null),'strange-door room: faded to silence');
await ev(()=>window.__game.music.override({inRoom:true,room:'mirror'}));await wait(2);
ok(await M(()=>window.__game.music.playing===null),'other strange-door rooms stay silent');
await ev(()=>{const m=window.__game.music;m.register('stillwood',[window.__u]);m.override({inRoom:true,room:'stillwood'})});await wait(5);
ok(await M(()=>window.__game.music.playing==='stillwood'&&window.__game.music.key==='stillwood'),'still wood: its own track fades in');
ok(await M(()=>window.__game.music.voices.filter(v=>v.key==='hollow').every(v=>v.gain<0.1)),'the floor track has faded out underneath');
await ev(()=>window.__game.music.setVolumes({music:0}));await wait(0.5);
ok(await M(()=>window.__game.music.bus.gain.value<0.01),'the Music volume setting silences it');
await ev(()=>window.__game.music.setVolumes({music:0.35}));
await ev(()=>window.__game.music.override(null));await wait(6);
ok(await M(()=>window.__game.music.playing==='hollow'),'music returns after the room');
// dead
await ev(()=>window.__game.music.override({state:'dead'}));await wait(6);
ok(await M(()=>window.__game.music.playing===null),'dead: silent');
await ev(()=>window.__game.music.override(null));
// ---- a missing file must not break anything
await ev(()=>{window.__game.music.register('forest',['nope/missing.ogg']);const G=window.__game;G.F.kind='forest'});await wait(2);
ok(await M(()=>window.__game.music.playing===null),'missing track: silent, no crash');
// ---- mute still works
const before=await M(()=>window.__game.music.master.gain.value);
await pg.keyboard.press('KeyV');await wait(0.2);
ok(await M(()=>window.__game.music.master.gain.value===0),'mute key sets master to 0 (was '+before+')');
await pg.keyboard.press('KeyV');
const real=errs.filter(e=>!/nope\/missing|Failed to load resource/.test(e));
ok(real.length===0,'no console errors '+JSON.stringify(real.slice(0,3)));
await b.close();console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
