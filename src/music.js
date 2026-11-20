/* ---------- music channel: streamed tracks under the synthesized sound ----------
   Plumbing only: no audio files ship yet. Drop tracks in by adding URLs to MUSIC_TRACKS (below, or from anywhere before the floor
   loads: MUSIC_TRACKS.moss.push('audio/moss1.ogg') or __game.music.register('moss',[...])). With every list empty this module
   does nothing per frame and creates no nodes beyond three idle gains.

   Graph:  sfxBus ------------------------\
           ambience bus -> ambBus ---------+--> master -> destination
           voices -> duck -> musicBus -----/
   master is the mute switch (game.js). The three buses carry the Music / Effects / Ambience sliders (persisted, 0..1).

   WHICH TRACK A FLOOR GETS (same order as ambience.js; the first key with at least one URL wins)
     1. F.music     an explicit key a floor may set
     2. F.kind      'cave' -> hollow, 'dark' -> blackhush, 'forest' -> forest ('back' = Humming Rooms: always silent)
     3. F.biome.name  the biome's own key (BIOME_KEY below) or the biome name itself, e.g. 'The Rustworks'
   The title screen plays 'title'; a chase plays 'chase' if it has tracks, otherwise ducks the floor track by CHASE_DUCK_DB.
   Silent: strange-door rooms, the Humming Rooms, dead. Paused: lowered. A voice-chat peer talking ducks by VOICE_DUCK_DB.
   Each list holds one or more URLs; one is picked at random when the track starts. Tracks loop. */
export const MUSIC_TRACKS={title:[],stonework:[],moss:[],cinder:[],frost:[],hollow:[],blackhush:[],chase:[],
  'The Bone Galleries':[],'The Rustworks':[],'The Glimmer Veins':[],forest:[]};
const BIOME_KEY={'The Old Stonework':'stonework','Mossgrown Halls':'moss','Cinder Warrens':'cinder','The Frostvault':'frost','The Dark Forest':'forest'};
const KIND_KEY={cave:'hollow',dark:'blackhush',forest:'forest'};
export const DEFAULT_VOL={music:0.35,sfx:1,ambience:1};
const FADE_TAU=1.0;           // seconds; 3 tau is the ~3 s crossfade
const DUCK_TAU=0.35,CHASE_DUCK_DB=-6,VOICE_DUCK_DB=-8,PAUSE_LEVEL=0.35,CHASE_HOLD=2.5,DIE_AFTER=4.2;
const db=x=>Math.pow(10,x/20),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

let ac=null,mst=null,musicBus=null,sfxBus=null,ambBus=null,duck=null,store=null;
const vol={...DEFAULT_VOL},voices=new Map(),bufs=new Map(),failed=new Set();
let chaseT=0,lastKey=null,duckNow=1,over=null,lastInfo={};

export function resolveMusicKey(F){
  const has=k=>k&&MUSIC_TRACKS[k]&&MUSIC_TRACKS[k].length;
  if(!F)return null;
  if(F.back||F.kind==='back')return null;
  if(has(F.music))return F.music;
  const k=F.kind&&KIND_KEY[F.kind];if(has(k))return k;
  const n=F.biome&&F.biome.name,b=n&&BIOME_KEY[n];if(has(b))return b;
  return has(n)?n:null;
}

// load the persisted volumes (call once at startup so the sliders can show them before audio starts)
export function useStore(storage){
  store=storage||null;
  for(const k of Object.keys(vol)){const v=store?+store.get('vol.'+k,DEFAULT_VOL[k]):DEFAULT_VOL[k];vol[k]=isFinite(v)?clamp(v,0,1):DEFAULT_VOL[k]}
}
export function initMusic(ctx,master,storage){
  teardown();ac=ctx;if(storage)useStore(storage);mst=master;
  try{
    musicBus=ac.createGain();sfxBus=ac.createGain();ambBus=ac.createGain();duck=ac.createGain();
    duck.connect(musicBus);for(const g of[musicBus,sfxBus,ambBus])g.connect(master);
    apply();
  }catch(e){ac=null}
  return {music:musicBus,sfx:sfxBus,ambience:ambBus};
}
function teardown(){for(const v of voices.values())kill(v);voices.clear();ac=null}
function apply(){if(!ac)return;const t=ac.currentTime;musicBus.gain.setTargetAtTime(vol.music,t,0.03);sfxBus.gain.setTargetAtTime(vol.sfx,t,0.03);ambBus.gain.setTargetAtTime(vol.ambience,t,0.03)}
export function getVolumes(){return {...vol}}
export function setVolumes(o){
  for(const k of Object.keys(vol))if(o&&o[k]!=null&&isFinite(+o[k])){vol[k]=clamp(+o[k],0,1);if(store)store.set('vol.'+k,vol[k])}
  apply();
}

function load(url){
  if(bufs.has(url))return bufs.get(url);
  const p=fetch(url).then(r=>{if(!r.ok)throw new Error(r.status);return r.arrayBuffer()}).then(b=>new Promise((ok,no)=>ac.decodeAudioData(b,ok,no)))
    .catch(e=>{failed.add(url);console.warn('music: could not load',url,e&&e.message||e);return null});
  bufs.set(url,p);return p;
}
function voiceFor(key){
  let v=voices.get(key);if(v)return v;
  const list=MUSIC_TRACKS[key],url=list[(Math.random()*list.length)|0];
  v={key,url,g:ac.createGain(),src:null,target:0,idle:0,dead:false};v.g.gain.value=0;v.g.connect(duck);voices.set(key,v);
  load(url).then(buf=>{
    if(v.dead||!buf)return;
    const s=ac.createBufferSource();s.buffer=buf;s.loop=true;s.connect(v.g);s.start();v.src=s;
  });
  return v;
}
function kill(v){v.dead=true;try{v.src&&v.src.stop()}catch(e){}try{v.src&&v.src.disconnect()}catch(e){}try{v.g.disconnect()}catch(e){}}
function setTarget(v,t){if(v.target===t)return;v.target=t;v.g.gain.setTargetAtTime(t,ac.currentTime,FADE_TAU)}

/* called once per frame. info: {state,F,chasing,nearest,inRoom,voiceActive} */
export function updateMusic(dt,info){
  if(!ac||!duck)return;
  info=over?Object.assign({},info,over):info||{};lastInfo=info;dt=clamp(dt||0,0,0.25);
  try{
    const s=info.state,F=info.F;
    let key=null,floorKey=null;
    if(s==='title')key=MUSIC_TRACKS.title.length?'title':null;
    else if(s==='dead'||info.inRoom||s==='room')key=null;
    else{
      floorKey=resolveMusicKey(F);key=floorKey;
      if(info.chasing>0&&s==='play')chaseT=CHASE_HOLD;else chaseT=Math.max(0,chaseT-dt);
      if(chaseT>0&&!(F&&F.back)&&MUSIC_TRACKS.chase.length)key='chase';
    }
    lastKey=key;
    if(!key&&!voices.size)return;                    // nothing registered / nothing playing: free
    if(key)voiceFor(key);                            // creates + loads lazily
    for(const v of voices.values()){
      if(v.key===key&&!failed.has(v.url)){v.idle=0;setTarget(v,1)}
      else{setTarget(v,0);v.idle+=dt;if(v.idle>DIE_AFTER){kill(v);voices.delete(v.key)}}
    }
    let d=1;
    if(s==='pause')d*=PAUSE_LEVEL;
    if(chaseT>0&&key&&key!=='chase')d*=db(CHASE_DUCK_DB);
    if(info.voiceActive)d*=db(VOICE_DUCK_DB);
    if(d!==duckNow){duckNow=d;duck.gain.setTargetAtTime(d,ac.currentTime,DUCK_TAU)}
  }catch(e){console.warn('music',e)}
}

/* ---------- debug hook (window.__game.music) ---------- */
export const music={
  tracks:MUSIC_TRACKS,resolve:resolveMusicKey,
  register(key,urls){MUSIC_TRACKS[key]=[].concat(urls);return MUSIC_TRACKS[key]},
  setVolumes,getVolumes,
  override(o){over=o||null},                       // test hook: merged into every frame's info
  get key(){return lastKey},
  get ducking(){return duckNow},
  get master(){return mst},get bus(){return musicBus},get sfxBus(){return sfxBus},get ambienceBus(){return ambBus},
  get duckGain(){return duck?duck.gain.value:null},
  get voices(){return [...voices.values()].map(v=>({key:v.key,url:v.url,playing:!!v.src,gain:v.g.gain.value,target:v.target}))},
  get playing(){for(const v of voices.values())if(v.src&&v.g.gain.value>0.01)return v.key;return null},
};
