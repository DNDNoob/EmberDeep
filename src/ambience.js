/* ---------- ambient soundscapes: one layered bed + random one-shots per floor type ----------
   Everything here is synthesized with WebAudio and is local to each player (nothing goes over the
   network). It uses Math.random() only and never touches the game's seeded rng.

   HOW TO GIVE A NEW FLOOR TYPE ITS OWN SOUND
   Call registerAmbience(key, spec) (below, or from anywhere before the floor loads). The key is picked per floor:
     1. F.ambience            an explicit string a floor may set
     2. F.kind                'cave' | 'dark' | 'back' (or any new kind) if a spec is registered under it
     3. F.biome.name          e.g. 'Mossgrown Halls'
     4. 'default'
   So a new BIOMES entry gets sound by registering under its name, with no other code change. An
   unregistered floor falls back to 'default' (a faint draft and a rare drip).

   A spec is plain data:
     {level:1,bed:1,                    // bed scales just the beds; level scales the whole scape (the global knob is AMBIENCE_LEVEL)
      echo:{time:.4,fb:.45,tone:2400,mix:.8},   // optional shared feedback-delay send, makes a space sound big
      beds:[ {type:'noise'|'osc', wave:'sine', freq:200,            // oscillator freq, osc beds only
              filter:{type:'bandpass',freq:400,q:1}, gain:.05,      // filter may also be filters:[...]
              mod:[{target:'gain'|'freq', rate:.07, depth:.5, walk:false}] } ],
          // mod: rate Hz of a slow sine (walk:true = smooth random walk instead). depth is a fraction of
          // gain, or octaves of filter freq. Beds breathe so they never loop audibly.
      shots:[ {every:[8,20], vol:[.3,1], echo:0, play(a){a.drip({f:1200})}} ]}
          // every: random seconds between plays. vol: random 0..1 loudness (quiet also means farther, so
          // duller). pan is random per play. echo: send to the echo line (number or [min,max]).

   `a` (passed to play) has the primitives below. Times are seconds from now, amp is the raw level before
   the random volume. Each returns nothing; every node stops and disconnects itself.
     a.drip({f,n,up,amp})     water plink (n>1: a short run of drips; up: rising chirp)
     a.plop({f,amp})          drop into a puddle          a.chirr({f,amp,n})   insect/frog-like trill
     a.ping({f,dur,amp,when,glass})  metal (or glass) strike with inharmonic partials
     a.tick({f,q,dur,amp,when,type}) short filtered noise tick   a.crackle({dur,n,f,amp})  random pops
     a.gust({dur,f,f2,q,amp,type})   swelling filtered noise    a.hiss({dur,f,amp})      steam
     a.creak({f,dur,amp})     wavering saw through a narrow band  a.rumble({f,dur,amp})   low noise swell
     a.flutter({n,f,amp})     wing-beat burst train           a.bubbles({n,dur,f,amp}) slow low plops
     a.tone({type,f,f2,slide,dur,amp,when,att}) and a.noise({f,f2,q,dur,amp,when,type,att,swell}) raw building blocks
     a.rand(a,b)  a.pick(arr)

   Worked example (the real 'forest' entry further down is fuller; the Dark Forest floor resolves to it by its F.kind):
     registerAmbience('forest', {
       level:.9,
       beds:[ {type:'noise', filter:{type:'bandpass',freq:500,q:.7}, gain:.05, mod:[{target:'gain',rate:.05,depth:.6,walk:true},{target:'freq',rate:.04,depth:.5}]}, // wind in the pines
              {type:'noise', filter:{type:'highpass',freq:3500,q:.5}, gain:.006, mod:[{target:'gain',rate:.5,depth:.7,walk:true}]} ], // needles hissing
       shots:[ {every:[25,60], vol:[.2,.6], echo:.5, play(a){a.tone({f:420,f2:330,dur:.5,amp:.06,att:.08});a.tone({f:400,f2:300,dur:.7,amp:.05,att:.1,when:.7})}}, // owl
               {every:[14,40], vol:[.3,.8], play(a){a.tick({f:1800,q:2,dur:.02,amp:.12});a.tick({f:900,q:1,dur:.03,amp:.08,when:.03})}} ] }); // twig snap
   Do not make anything that sounds like a footstep, a knock, a growl or breathing: those are danger cues.
*/
export const AMBIENCE_LEVEL=1;         // one tunable level for the whole ambience bus (master is 0.55 on top of this)
const FADE_TAU=0.55;                   // seconds; a 3 tau fade is ~1.65 s
const DIE_AFTER=3.2;                   // a faded-out voice is torn down after this many seconds
export const registry=new Map();
export function registerAmbience(key,spec){registry.set(key,spec);return spec}

let ac=null,bus=null,noiseBuf=null,offline=false,cur=null;
const dying=[],fired={};let shotsLive=0,last={},forced=null,rnd=Math.random;
const rand=(a,b)=>a+rnd()*(b-a),pick=a=>a[(rnd()*a.length)|0],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function initAmbience(ctx,master,noise){
  killAll();
  ac=ctx;noiseBuf=noise;offline=typeof OfflineAudioContext!=='undefined'&&ctx instanceof OfflineAudioContext;
  try{bus=ac.createGain();bus.gain.value=AMBIENCE_LEVEL;bus.connect(master)}catch(e){ac=null;bus=null}
}
function killAll(){if(cur){destroy(cur);cur=null}while(dying.length)destroy(dying.pop())}

// which spec a floor gets
export function resolveKey(F){
  if(!F)return 'default';
  if(F.ambience&&registry.has(F.ambience))return F.ambience;
  if(F.kind&&registry.has(F.kind))return F.kind;
  const n=F.biome&&F.biome.name;if(n&&registry.has(n))return n;
  return 'default';
}

/* ---------- a voice: the beds, the echo line and the one-shot timers of one floor type ---------- */
function makeVoice(key){
  const spec=registry.get(key)||registry.get('default');
  const v={key,spec,g:ac.createGain(),nodes:[],mods:[],shots:[],age:0,off:0,tm:0,echoIn:null,target:0};
  v.g.gain.value=0;v.g.connect(bus);v.nodes.push(v.g);
  if(spec.echo){
    const e=spec.echo,inp=ac.createGain(),d=ac.createDelay(2),fb=ac.createGain(),lp=ac.createBiquadFilter(),wet=ac.createGain();
    d.delayTime.value=e.time||0.4;fb.gain.value=e.fb||0.4;lp.type='lowpass';lp.frequency.value=e.tone||2400;wet.gain.value=e.mix==null?0.8:e.mix;
    inp.connect(d);d.connect(lp);lp.connect(fb);fb.connect(d);lp.connect(wet);wet.connect(v.g);
    v.echoIn=inp;v.nodes.push(inp,d,fb,lp,wet);
  }
  for(const b of spec.beds||[])addBed(v,b);
  // first one-shots arrive a little after the floor starts, not all at once
  for(const s of spec.shots||[])v.shots.push({s,t:rand(0.25,0.9)*rand(s.every[0],s.every[1])});
  return v;
}
function addBed(v,b){
  const g=ac.createGain(),base=(b.gain==null?0.05:b.gain)*(v.spec.bed||1);g.gain.value=base;
  let src;
  if(b.type==='osc'){src=ac.createOscillator();src.type=b.wave||'sine';src.frequency.value=b.freq||100}
  else{src=ac.createBufferSource();src.buffer=noiseBuf;src.loop=true}
  let n=src;const fs=b.filters||(b.filter?[b.filter]:[]),fl=[];
  for(const f of fs){const bf=ac.createBiquadFilter();bf.type=f.type||'lowpass';bf.frequency.value=f.freq||500;bf.Q.value=f.q==null?0.7:f.q;n.connect(bf);n=bf;fl.push({node:bf,base:bf.frequency.value});v.nodes.push(bf)}
  n.connect(g);g.connect(v.g);v.nodes.push(src,g);
  if(b.type==='osc')src.start();else src.start(0,rand(0,0.9));
  v.src=(v.src||[]);v.src.push(src);
  for(const m of b.mod||[]){
    const tgt=m.target==='freq'?fl[0]:{node:g,base};if(!tgt)continue;
    v.mods.push({p:tgt.node[m.target==='freq'?'frequency':'gain'],base:tgt.base,freq:m.target==='freq',rate:m.rate||0.1,depth:m.depth||0.3,walk:!!m.walk,ph:rand(0,6.28),x:rand(-1,1)});
  }
}
function modulate(v,dt){
  v.tm-=dt;if(v.tm>0)return;
  const step=0.12;v.tm=step;const t=ac.currentTime;
  for(const m of v.mods){
    let x;
    if(m.walk){m.x=clamp(m.x*(1-0.4*m.rate*step)+(rnd()-0.5)*2*Math.sqrt(m.rate*step)*1.2,-1,1);x=m.x}
    else{m.ph+=6.2832*m.rate*step;x=Math.sin(m.ph)}
    const val=m.freq?m.base*Math.pow(2,m.depth*x):Math.max(0,m.base*(1+m.depth*x));
    m.p.setTargetAtTime(val,t,step*1.5);
  }
}
function destroy(v){
  for(const s of v.src||[])try{s.stop()}catch(e){}
  for(const n of v.nodes)try{n.disconnect()}catch(e){}
  v.nodes.length=0;v.mods.length=0;v.shots.length=0;v.dead=true;
}
function fade(v,target){
  if(v.target===target)return;v.target=target;
  v.g.gain.cancelScheduledValues(ac.currentTime);v.g.gain.setTargetAtTime(target,ac.currentTime,FADE_TAU);
}
function stateLevel(info){
  if(info.level!=null)return info.level;
  if(info.hold)return 0;
  const s=info.state;
  return s==='play'||s==='trans'?1:s==='pause'||s==='talk'?0.35:0;
}

/* ---------- called once per frame ---------- */
export function updateAmbience(dt,info){
  if(!ac||!bus)return;
  info=info||{};last=info;dt=clamp(dt||0,0,0.25);
  try{
    for(let i=dying.length-1;i>=0;i--){const v=dying[i];v.age+=dt;if(v.age>DIE_AFTER){destroy(v);dying.splice(i,1)}}
    const lvl=stateLevel(info),key=forced||resolveKey(info.F);
    if(cur&&(cur.key!==key||(lvl<=0&&cur.off>DIE_AFTER))){cur.age=0;fade(cur,0);dying.push(cur);cur=null}
    if(lvl<=0&&!cur)return;
    if(!cur){if(lvl<=0)return;cur=makeVoice(key)}
    cur.off=lvl<=0?cur.off+dt:0;
    fade(cur,lvl*(cur.spec.level==null?1:cur.spec.level));
    modulate(cur,dt);
    if(lvl>0.2&&(offline||ac.state==='running'))for(const sh of cur.shots){
      sh.t-=dt;if(sh.t>0)continue;
      sh.t=rand(sh.s.every[0],sh.s.every[1]);fire(cur,sh.s);
    }
  }catch(e){console.warn('ambience',e)}
}

/* ---------- one-shots ---------- */
function fire(v,s){
  const vol=rand(...(s.vol||[0.4,1])),pan=rand(-0.9,0.9),dist=1-vol;
  const e=s.echo==null?(v.spec.echo?1:0):Array.isArray(s.echo)?rand(s.echo[0],s.echo[1]):s.echo;
  fired[v.key]=(fired[v.key]||0)+1;
  const a=makeApi(v,vol,pan,dist,v.echoIn?e:0);
  s.play(a);a.seal();
}
function makeApi(v,vol,pan,dist,wet){
  const inp=ac.createGain(),lp=ac.createBiquadFilter(),nodes=[inp,lp];let pending=0,sealed=false;
  inp.gain.value=vol;lp.type='lowpass';lp.frequency.value=Math.min(18000,16000*Math.pow(0.08,dist));
  inp.connect(lp);let out=lp;
  if(ac.createStereoPanner){const p=ac.createStereoPanner();p.pan.value=pan;lp.connect(p);out=p;nodes.push(p)}
  out.connect(v.g);
  if(wet>0&&v.echoIn){const w=ac.createGain();w.gain.value=wet;lp.connect(w);w.connect(v.echoIn);nodes.push(w)}
  const cleanup=()=>{if(sealed&&pending===0)for(const n of nodes)try{n.disconnect()}catch(e){}};
  const T=when=>ac.currentTime+0.02+(when||0);
  // start a source with an envelope; the node cleans up after itself
  function voice(srcNode,filt,t,dur,amp,att,swell){
    const g=ac.createGain();let n=srcNode;
    if(filt){n.connect(filt);n=filt;nodes.push(filt)}
    n.connect(g);g.connect(inp);nodes.push(srcNode,g);
    g.gain.setValueAtTime(0.0001,t);
    if(swell){g.gain.linearRampToValueAtTime(amp,t+dur*0.4);g.gain.linearRampToValueAtTime(0.0001,t+dur)}
    else{g.gain.exponentialRampToValueAtTime(Math.max(0.0002,amp),t+Math.min(att,dur*0.5));g.gain.exponentialRampToValueAtTime(0.0001,t+dur)}
    pending++;shotsLive++;
    srcNode.onended=()=>{pending--;shotsLive--;try{srcNode.disconnect();g.disconnect()}catch(e){}cleanup()};
    return t+dur+0.05;
  }
  const A={rand,pick,vol,pan,dist};
  A.tone=o=>{
    const t=T(o.when),dur=o.dur||0.2,osc=ac.createOscillator();osc.type=o.type||'sine';osc.frequency.setValueAtTime(o.f||440,t);
    const f2=o.f2||(o.slide?(o.f||440)+o.slide:0);if(f2)osc.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t+(o.slideT||dur));
    let filt=null;if(o.filt){filt=ac.createBiquadFilter();filt.type=o.filt.type;filt.frequency.value=o.filt.freq;filt.Q.value=o.filt.q||1}
    const end=voice(osc,filt,t,dur,o.amp==null?0.1:o.amp,o.att||0.01,o.swell);osc.start(t);osc.stop(end);
  };
  A.noise=o=>{
    const t=T(o.when),dur=o.dur||0.05,s=ac.createBufferSource(),f=ac.createBiquadFilter();s.buffer=noiseBuf;s.loop=true;
    f.type=o.type||'bandpass';f.frequency.setValueAtTime(o.f||1000,t);f.Q.value=o.q==null?1:o.q;
    if(o.f2)f.frequency.exponentialRampToValueAtTime(Math.max(20,o.f2),t+dur);
    const end=voice(s,f,t,dur,o.amp==null?0.1:o.amp,o.att||0.004,o.swell);s.start(t,rand(0,0.8));s.stop(end);
  };
  A.tick=o=>A.noise({f:o.f||3000,q:o.q||2,dur:o.dur||0.015,amp:o.amp||0.1,when:o.when,type:o.type,att:0.002});
  A.drip=o=>{
    const n=o.n||1;let when=o.when||0,f=o.f||rand(700,2300);const up=o.up==null?rnd()<0.35:o.up;
    for(let i=0;i<n;i++){
      const amp=(o.amp||0.2)*(1-0.18*i);
      A.tone({f,f2:f*(up?1.3:0.72),slideT:0.05,dur:rand(0.09,0.17),amp,when,att:0.004});
      A.tick({f:f*2.2,q:3,dur:0.012,amp:amp*0.5,when});
      when+=rand(0.13,0.34);f*=rand(0.85,1.18);
    }
  };
  A.plop=o=>{const f=o.f||rand(160,340),amp=o.amp||0.16;A.tone({f:f*1.5,f2:f*0.7,slideT:0.08,dur:0.16,amp,att:0.005});A.noise({f:500,q:0.7,dur:0.08,amp:amp*0.5,type:'lowpass'})};
  A.ping=o=>{
    const f=o.f||800,d=o.dur||1,amp=o.amp||0.08,P=o.glass?[[1,1,1],[2.32,.5,.5],[4.1,.3,.3]]:[[1,1,1],[2.76,.5,.6],[5.4,.25,.35]];
    for(const[r,a,dd]of P)A.tone({f:f*r,dur:d*dd,amp:amp*a,when:o.when,att:0.003});
  };
  A.crackle=o=>{
    const dur=o.dur||1.2,n=o.n||((3+rnd()*6)|0);
    for(let i=0;i<n;i++){const w=rnd()*dur;A.noise({f:rand(o.f||1500,(o.f||1500)*3.5),q:rand(1,4),dur:rand(0.006,0.03),amp:(o.amp||0.12)*rand(0.25,1),when:w,att:0.001});if(rnd()<0.25)A.noise({f:200,q:0.8,dur:0.05,amp:(o.amp||0.12)*0.8,when:w,type:'lowpass',att:0.002})}
  };
  A.gust=o=>A.noise({f:o.f||600,f2:o.f2||(o.f||600)*rand(0.6,1.5),q:o.q||2,dur:o.dur||3,amp:o.amp||0.08,type:o.type,swell:true});
  A.hiss=o=>A.noise({f:o.f||5000,q:0.6,dur:o.dur||1.5,amp:o.amp||0.05,type:'highpass',swell:true});
  A.rumble=o=>{A.noise({f:o.f||90,q:0.7,dur:o.dur||4,amp:o.amp||0.12,type:'lowpass',swell:true});A.tone({f:(o.f||90)*0.6,dur:o.dur||4,amp:(o.amp||0.12)*0.5,swell:true})};
  A.creak=o=>{
    const t=T(),dur=o.dur||1.2,f=o.f||300,osc=ac.createOscillator(),bp=ac.createBiquadFilter(),N=10,c=new Float32Array(N);
    for(let i=0;i<N;i++)c[i]=f*rand(0.8,1.25);osc.type='sawtooth';osc.frequency.setValueCurveAtTime(c,t,dur);
    bp.type='bandpass';bp.frequency.value=f*2.2;bp.Q.value=9;
    const end=voice(osc,bp,t,dur,o.amp||0.1,0.1,true);osc.start(t);osc.stop(end);
  };
  A.chirr=o=>{const n=o.n||(4+((rnd()*5)|0)),f=o.f||rand(3200,4600);for(let i=0;i<n;i++)A.tone({f,f2:f*1.05,dur:0.035,amp:(o.amp||0.05),when:i*0.055,att:0.005})};
  A.flutter=o=>{const n=o.n||(8+((rnd()*6)|0));for(let i=0;i<n;i++)A.noise({f:o.f||1300,q:0.8,dur:0.035,amp:(o.amp||0.1)*(0.5+0.5*Math.sin(i/n*3.14)),when:i*0.028+rnd()*0.01,type:'lowpass',att:0.004})};
  A.bubbles=o=>{const n=o.n||8,dur=o.dur||3;for(let i=0;i<n;i++){const f=rand(o.f||110,(o.f||110)*2);A.tone({f,f2:f*1.8,slideT:0.07,dur:0.12,amp:(o.amp||0.1)*rand(0.5,1),when:rnd()*dur,att:0.01})}};
  A.seal=()=>{sealed=true;cleanup()};
  return A;
}

/* ---------- the soundscapes ---------- */
const draft=[
  {type:'noise',filter:{type:'bandpass',freq:360,q:0.8},gain:0.05,mod:[{target:'gain',rate:0.06,depth:0.7,walk:true},{target:'freq',rate:0.05,depth:0.35}]},
  {type:'noise',filter:{type:'lowpass',freq:140,q:0.5},gain:0.05,mod:[{target:'gain',rate:0.035,depth:0.5}]}];

registerAmbience('default',{bed:3.5,level:1,beds:draft,shots:[
  {every:[25,60],vol:[0.2,0.6],play:a=>a.drip({f:a.rand(900,1700)})}]});

registerAmbience('The Old Stonework',{bed:3.5,beds:draft,shots:[
  {every:[9,22],vol:[0.2,0.6],play:a=>a.drip({f:a.rand(900,1800),amp:0.18})},
  {every:[14,35],vol:[0.15,0.5],play:a=>{let w=0;for(let i=0,n=3+((Math.random()*4)|0);i<n;i++){a.tick({f:a.rand(2800,5200),q:3,dur:0.012,amp:0.06,when:w});w+=0.04*(1+i*0.7)*a.rand(0.6,1.4)}}},
  {every:[50,110],vol:[0.15,0.4],play:a=>{a.creak({f:a.rand(230,330),dur:1.4,amp:0.06});a.ping({f:a.rand(420,560),dur:1.4,amp:0.025,when:0.5})}}]});

registerAmbience('Mossgrown Halls',{bed:5,level:0.5,echo:{time:0.31,fb:0.38,tone:3000,mix:0.7},beds:[
  {type:'noise',filters:[{type:'bandpass',freq:2600,q:1.1}],gain:0.012,mod:[{target:'gain',rate:0.08,depth:0.5,walk:true},{target:'freq',rate:2.1,depth:0.12}]},
  {type:'noise',filters:[{type:'bandpass',freq:950,q:1.6}],gain:0.016,mod:[{target:'gain',rate:0.05,depth:0.45,walk:true},{target:'freq',rate:0.7,depth:0.2,walk:true}]},
  {type:'noise',filter:{type:'lowpass',freq:120,q:0.5},gain:0.035,mod:[{target:'gain',rate:0.04,depth:0.5}]}],shots:[
  {every:[1.3,4.2],vol:[0.2,1],echo:[0,0.55],play:a=>a.drip({f:a.rand(650,2600)})},
  {every:[7,16],vol:[0.3,0.9],echo:[0.1,0.7],play:a=>a.drip({n:2+((Math.random()*2)|0),f:a.rand(800,2000)})},
  {every:[6,15],vol:[0.2,0.7],echo:[0,0.4],play:a=>a.plop({})},
  {every:[30,70],vol:[0.15,0.5],play:a=>a.chirr({amp:0.05})}]});

registerAmbience('The Frostvault',{bed:9,beds:[
  {type:'noise',filter:{type:'bandpass',freq:1900,q:7},gain:0.03,mod:[{target:'freq',rate:0.045,depth:0.55,walk:true},{target:'gain',rate:0.07,depth:0.7}]},
  {type:'noise',filter:{type:'bandpass',freq:3300,q:11},gain:0.013,mod:[{target:'freq',rate:0.06,depth:0.4,walk:true},{target:'gain',rate:0.05,depth:0.8,walk:true}]},
  {type:'noise',filter:{type:'lowpass',freq:180,q:0.5},gain:0.03,mod:[{target:'gain',rate:0.05,depth:0.6}]}],shots:[
  {every:[6,16],vol:[0.25,0.9],play:a=>{const n=1+((Math.random()*3)|0);for(let i=0;i<n;i++)a.tick({f:a.rand(2500,6000),q:4,dur:0.02,amp:0.14,when:i*a.rand(0.03,0.12)})}},
  {every:[18,45],vol:[0.2,0.6],play:a=>{let f=a.rand(2200,3600),w=0;for(let i=0,n=3+((Math.random()*3)|0);i<n;i++){a.ping({f,dur:0.9,amp:0.03,when:w,glass:true});w+=a.rand(0.06,0.16);f*=a.rand(1.05,1.3)}}},
  {every:[40,90],vol:[0.3,0.7],play:a=>{a.creak({f:a.rand(75,115),dur:3,amp:0.14});a.rumble({f:70,dur:3.2,amp:0.07})}}]});

registerAmbience('Cinder Warrens',{bed:8,beds:[
  {type:'noise',filter:{type:'lowpass',freq:130,q:0.6},gain:0.1,mod:[{target:'gain',rate:0.11,depth:0.3,walk:true},{target:'freq',rate:0.07,depth:0.25}]},
  {type:'noise',filter:{type:'bandpass',freq:300,q:0.9},gain:0.02,mod:[{target:'gain',rate:0.09,depth:0.6,walk:true}]}],shots:[
  {every:[1.2,4.5],vol:[0.25,0.9],play:a=>a.crackle({dur:a.rand(0.4,1.4),amp:0.12})},
  {every:[12,30],vol:[0.25,0.7],play:a=>a.hiss({dur:a.rand(1.2,2.2),amp:0.05})},
  {every:[40,90],vol:[0.3,0.7],play:a=>{a.rumble({f:80,dur:4,amp:0.09});a.bubbles({f:90,n:9,dur:3.2,amp:0.07})}}]});

registerAmbience('back',{level:8,beds:[],shots:[
  {every:[9,24],vol:[0.25,0.7],play:a=>{const n=2+((Math.random()*3)|0);let w=0;for(let i=0;i<n;i++){a.tick({f:a.rand(2200,4200),q:2,dur:0.01,amp:0.08,when:w});w+=a.rand(0.03,0.14)}}},
  {every:[20,50],vol:[0.2,0.5],play:a=>{a.ping({f:a.rand(380,620),dur:0.35,amp:0.04});a.noise({f:300,q:0.7,dur:0.25,amp:0.03,type:'lowpass'})}},
  {every:[55,120],vol:[0.25,0.6],play:a=>{a.tone({type:'sawtooth',f:a.rand(200,260),f2:120,dur:0.45,amp:0.025,filt:{type:'highpass',freq:900,q:0.7}});a.noise({f:6000,q:4,dur:0.3,amp:0.015})}}]});

registerAmbience('cave',{bed:8,level:1,echo:{time:0.47,fb:0.5,tone:2200,mix:0.85},beds:[
  {type:'noise',filter:{type:'bandpass',freq:150,q:3.5},gain:0.09,mod:[{target:'freq',rate:0.04,depth:0.45,walk:true},{target:'gain',rate:0.05,depth:0.5}]},
  {type:'noise',filter:{type:'lowpass',freq:70,q:0.5},gain:0.06,mod:[{target:'gain',rate:0.03,depth:0.4}]}],shots:[
  {every:[3,9],vol:[0.3,0.9],echo:[0.7,1],play:a=>a.drip({f:a.rand(450,1500),amp:0.2})},
  {every:[20,50],vol:[0.3,0.7],echo:1,play:a=>{let w=0,f=1400;for(let i=0;i<6;i++){a.tone({f,f2:f*0.6,dur:0.06,amp:0.09,when:w});a.tick({f:2000,q:2,dur:0.01,amp:0.05,when:w});w+=0.2*Math.pow(0.7,i);f*=0.88}}},
  {every:[45,100],vol:[0.25,0.6],echo:0.5,play:a=>a.flutter({amp:0.09})}]});

registerAmbience('dark',{bed:3,level:1,beds:[
  {type:'noise',filter:{type:'lowpass',freq:70,q:0.5},gain:0.03,mod:[{target:'gain',rate:0.03,depth:0.5,walk:true}]}],shots:[
  {every:[30,70],vol:[0.4,0.9],play:a=>{const f=a.rand(48,80);a.tone({f,f2:f*1.12,dur:6,amp:0.1,swell:true});a.tone({f:f*2.01,dur:6,amp:0.03,swell:true})}},
  {every:[45,100],vol:[0.3,0.7],play:a=>a.tone({f:a.rand(6200,8800),dur:3.5,amp:0.012,swell:true})}]});

registerAmbience('The Bone Galleries',{bed:8,beds:[
  {type:'noise',filter:{type:'bandpass',freq:260,q:1.4},gain:0.05,mod:[{target:'gain',rate:0.05,depth:0.7,walk:true},{target:'freq',rate:0.04,depth:0.4,walk:true}]},
  {type:'noise',filter:{type:'lowpass',freq:110,q:0.5},gain:0.04,mod:[{target:'gain',rate:0.03,depth:0.5}]}],shots:[
  {every:[12,30],vol:[0.15,0.45],echo:0.4,play:a=>{let w=0;for(let i=0,n=2+((Math.random()*3)|0);i<n;i++){a.ping({f:a.rand(1500,2600),dur:0.08,amp:0.05,when:w});w+=a.rand(0.05,0.2)}}},
  {every:[10,26],vol:[0.15,0.5],play:a=>a.noise({f:4200,q:0.8,dur:a.rand(0.6,1.2),amp:0.025,type:'highpass',swell:true})},
  {every:[35,80],vol:[0.2,0.5],play:a=>a.drip({f:a.rand(500,1000),amp:0.12})}]});

registerAmbience('The Rustworks',{bed:8,echo:{time:0.26,fb:0.3,tone:2800,mix:0.5},beds:[
  {type:'noise',filter:{type:'lowpass',freq:100,q:0.6},gain:0.06,mod:[{target:'gain',rate:0.06,depth:0.4,walk:true}]},
  {type:'noise',filter:{type:'bandpass',freq:700,q:2},gain:0.01,mod:[{target:'gain',rate:0.04,depth:0.7,walk:true},{target:'freq',rate:0.05,depth:0.4}]}],shots:[
  {every:[18,45],vol:[0.25,0.7],echo:0.5,play:a=>{a.creak({f:a.rand(110,190),dur:2.2,amp:0.1});a.rumble({f:80,dur:2.2,amp:0.04})}},
  {every:[14,34],vol:[0.2,0.6],play:a=>a.hiss({dur:a.rand(1,2),f:4500,amp:0.04})},
  {every:[7,16],vol:[0.15,0.5],echo:0.3,play:a=>a.ping({f:a.rand(520,900),dur:0.5,amp:0.03})},
  {every:[3,9],vol:[0.2,0.8],echo:[0,0.5],play:a=>{a.drip({f:a.rand(900,1800),amp:0.12});a.ping({f:a.rand(900,1500),dur:0.25,amp:0.02})}}]});

registerAmbience('The Glimmer Veins',{bed:8,echo:{time:0.35,fb:0.4,tone:3500,mix:0.7},beds:[
  {type:'osc',wave:'sine',freq:392,gain:0.008,mod:[{target:'gain',rate:0.07,depth:0.8}]},
  {type:'osc',wave:'sine',freq:395,gain:0.006,mod:[{target:'gain',rate:0.05,depth:0.8}]},
  {type:'osc',wave:'sine',freq:588,gain:0.004,mod:[{target:'gain',rate:0.09,depth:0.9,walk:true}]},
  {type:'noise',filter:{type:'bandpass',freq:2300,q:1.2},gain:0.01,mod:[{target:'gain',rate:0.06,depth:0.5,walk:true}]}],shots:[
  {every:[6,16],vol:[0.2,0.8],echo:[0.3,0.8],play:a=>{let f=a.rand(1800,3600),w=0;for(let i=0,n=1+((Math.random()*3)|0);i<n;i++){a.ping({f,dur:1.2,amp:0.035,when:w,glass:true});w+=a.rand(0.1,0.3);f*=a.pick([1.5,1.25,1.33,0.75])}}},
  {every:[3,9],vol:[0.15,0.6],echo:[0,0.5],play:a=>a.drip({f:a.rand(1000,2400),amp:0.1})}]});

// the Dark Forest floor sets F.kind==='forest'
registerAmbience('forest',{bed:8,level:1,echo:{time:0.55,fb:0.35,tone:2200,mix:0.5},beds:[
  {type:'noise',filter:{type:'bandpass',freq:480,q:0.7},gain:0.06,mod:[{target:'gain',rate:0.05,depth:0.6,walk:true},{target:'freq',rate:0.04,depth:0.5}]},
  {type:'noise',filter:{type:'bandpass',freq:1500,q:3},gain:0.012,mod:[{target:'gain',rate:0.07,depth:0.8,walk:true},{target:'freq',rate:0.05,depth:0.4,walk:true}]},
  {type:'noise',filter:{type:'highpass',freq:4000,q:0.5},gain:0.005,mod:[{target:'gain',rate:0.4,depth:0.8,walk:true}]}],shots:[
  {every:[14,34],vol:[0.15,0.5],echo:0.4,play:a=>a.creak({f:a.rand(120,220),dur:a.rand(1.6,2.6),amp:0.08})},
  {every:[5,14],vol:[0.15,0.5],play:a=>a.gust({f:a.rand(1800,3200),q:1.2,dur:a.rand(0.8,1.8),amp:0.03})},
  {every:[28,70],vol:[0.2,0.5],echo:0.6,play:a=>{a.tone({f:420,f2:330,dur:0.5,amp:0.06,att:0.08});a.tone({f:400,f2:300,dur:0.7,amp:0.05,att:0.1,when:0.7})}},
  {every:[30,80],vol:[0.1,0.35],echo:0.4,play:a=>{a.tick({f:1800,q:2,dur:0.02,amp:0.1});a.tick({f:900,q:1,dur:0.03,amp:0.07,when:0.03})}}]});

/* ---------- debug hook (exposed on window.__game.amb) ---------- */
export const amb={
  get key(){return cur?cur.key:null},
  keys:()=>[...registry.keys()],
  resolve:resolveKey,
  get fired(){return fired},
  get bedNodes(){let n=cur?cur.nodes.length:0;for(const v of dying)n+=v.nodes.length;return n},
  get voices(){return (cur?1:0)+dying.length},
  get shotNodes(){return shotsLive},
  get bus(){return bus},
  force(k){forced=k||null},
  register:registerAmbience,init:initAmbience,update:updateAmbience,
  // run n seconds of game time in one go (used by tests); info defaults to the last frame's
  tick(sec,info){const i=Object.assign({},last,info||{});for(let t=0;t<sec;t+=0.1)updateAmbience(0.1,i)},
};
