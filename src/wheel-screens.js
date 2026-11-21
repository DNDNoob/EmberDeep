// Screen-space pieces of the Wheel of Misfortune: the result announcement, the coin toss, a strip of active effects, the tinted
// overlays (pox, plague, tickling), and the captions and buttons over the 3D breaks (src/wheel-breaks.js).
// Nothing here touches game state; the caller passes callbacks.
const css=`
#wofAnn{position:fixed;left:50%;top:22%;transform:translate(-50%,-50%) scale(.6);opacity:0;z-index:34;pointer-events:none;text-align:center;
  font-family:"Arial Black",Impact,Arial,sans-serif;transition:opacity .35s,transform .35s cubic-bezier(.2,1.6,.4,1)}
#wofAnn.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
#wofAnn b{display:block;font-size:54px;letter-spacing:.04em;color:#fff6d0;-webkit-text-stroke:3px #2a0606;text-shadow:0 4px 0 #2a0606,0 0 30px rgba(255,190,60,.8)}
#wofAnn span{display:inline-block;margin-top:10px;font:600 18px Georgia,serif;color:#ffe9c0;background:rgba(20,8,4,.78);padding:8px 16px;border-radius:8px;border:2px solid var(--wc,#d9a521)}
#wofFx{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:12;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;pointer-events:none;max-width:80vw}
#wofFx div{font:600 13px Georgia,serif;color:#ffe9c0;background:rgba(18,8,4,.72);border:1px solid rgba(217,165,33,.6);border-radius:12px;padding:3px 10px;white-space:nowrap}
body.inroom #wofFx{display:none}
.wofTint{position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity .6s}
#wofPlague{background:radial-gradient(ellipse at center,transparent 45%,rgba(70,120,20,.55) 100%)}
#wofTickle{background:radial-gradient(ellipse at center,transparent 50%,rgba(255,110,190,.55) 100%)}
#wofFat{background:radial-gradient(ellipse at center,transparent 60%,rgba(80,40,10,.35) 100%)}
body.wofbreak #hud,body.wofbreak #map,body.wofbreak #prompt,body.wofbreak #toast,body.wofbreak #vig,body.wofbreak .ptag,body.wofbreak #wofFx,body.wofbreak .wofTint,body.wofbreak #tMap,body.wofbreak #tPause{display:none!important}
#wofBreak{display:none;position:fixed;inset:0;z-index:33;pointer-events:none}
#wofBreak.on{display:block}
#wofBar{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;padding:10px 18px;background:rgba(0,0,0,.6);font:600 16px Arial,sans-serif;color:#fff}
#wofBar span+span{color:#ffd9a0}
#wofBreak.ad #wofBar{display:none}
#wofCap{position:absolute;left:50%;bottom:72px;transform:translateX(-50%);max-width:80vw;font:600 22px Georgia,serif;color:#fff;background:rgba(0,0,0,.6);padding:8px 18px;border-radius:6px;text-align:center}
#wofCall{position:absolute;left:50%;top:18%;transform:translateX(-50%);font:900 34px "Arial Black",Arial,sans-serif;color:#ffde3a;-webkit-text-stroke:2px #000;text-shadow:0 3px 0 #000}
#wofAdTag{position:absolute;left:16px;top:14px;font:600 14px Arial,sans-serif;color:#fff;background:rgba(0,0,0,.6);padding:4px 10px;border-radius:3px}
#wofAdBar{position:absolute;left:0;right:0;bottom:0;height:5px;background:rgba(255,255,255,.25)}#wofAdProg{height:100%;width:0;background:#ffcc00}
#wofBreak.walmart #wofAdTag,#wofBreak.walmart #wofAdBar{display:none}
#wofSkip{position:fixed;right:24px;bottom:44px;z-index:34;font:600 18px Arial,sans-serif;
  color:#9a9a9a;background:rgba(0,0,0,.72);border:1px solid #555;padding:10px 18px 10px 22px;cursor:default;display:none;user-select:none}
#wofSkip.lit{color:#fff;border-color:#eee;cursor:pointer}
#wofSkip.lit:hover{background:rgba(40,40,40,.85)}
#wofCoin{position:fixed;left:50%;top:40%;z-index:34;transform:translate(-50%,-50%);perspective:700px;pointer-events:none;display:none;text-align:center}
#wofCoin .c{width:150px;height:150px;margin:0 auto;position:relative;transform-style:preserve-3d}
#wofCoin .f{position:absolute;inset:0;border-radius:50%;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;
  font:900 26px "Arial Black",Arial,sans-serif;color:#5a3a06;border:8px solid #b5841c;box-shadow:inset 0 0 0 4px #f6d670,inset 0 0 26px rgba(90,50,0,.6);
  background:radial-gradient(circle at 35% 30%,#fff1b0,#e2b23c 55%,#a9781a)}
#wofCoin .t{transform:rotateY(180deg)}
#wofCoin p{margin:18px 0 0;font:700 22px Georgia,serif;color:#ffe9c0;text-shadow:0 2px 6px #000;opacity:0;transition:opacity .4s}
`;
const $=id=>document.getElementById(id);
let ready=false;
function setup(){
  if(ready)return;ready=true;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const add=(html)=>{const d=document.createElement('div');d.innerHTML=html;while(d.firstChild)document.body.appendChild(d.firstChild)};
  add(`<div id="wofAnn"><b></b><span></span></div><div id="wofFx"></div>
    <div id="wofPlague" class="wofTint"></div><div id="wofTickle" class="wofTint"></div><div id="wofFat" class="wofTint"></div>
    <canvas id="wofPox" class="wofTint" width="320" height="180" style="width:100%;height:100%"></canvas>
    <div id="wofBreak"><div id="wofAdTag"></div><div id="wofCall"></div><div id="wofCap"></div><div id="wofBar"><span id="wofBarL"></span><span id="wofBarR"></span></div><div id="wofAdBar"><div id="wofAdProg"></div></div></div>
    <div id="wofSkip">Skip Ad</div>
    <div id="wofCoin"><div class="c"><div class="f">HEADS</div><div class="f t">TAILS</div></div><p></p></div>`);
  // smallpox: red pustules crowding in from the edges of the view
  const g=$('wofPox').getContext('2d');let s=99;const r=()=>(s=(s*16807)%2147483647)/2147483647;
  for(let i=0;i<260;i++){const x=r()*320,y=r()*180,ex=Math.min(x,320-x)/160,ey=Math.min(y,180-y)/90,e=Math.min(ex,ey);if(r()<e*1.6)continue;
    const rad=1.5+r()*4.5;g.fillStyle='rgba(150,20,20,.55)';g.beginPath();g.arc(x,y,rad*1.5,0,7);g.fill();
    g.fillStyle='rgba(230,70,60,.9)';g.beginPath();g.arc(x,y,rad,0,7);g.fill();g.fillStyle='rgba(255,235,190,.85)';g.beginPath();g.arc(x-rad*.25,y-rad*.25,rad*.4,0,7);g.fill()}
}

let annT=0;
export function announce(title,sub,color){
  setup();const el=$('wofAnn');el.querySelector('b').textContent=title;el.querySelector('span').textContent=sub||'';el.querySelector('span').style.display=sub?'':'none';
  el.style.setProperty('--wc',color||'#d9a521');el.classList.add('on');clearTimeout(annT);annT=setTimeout(()=>el.classList.remove('on'),5200);
}
// list: [[label, secondsLeft]]
let fxKey='';
export function statusStrip(list){
  setup();const key=list.map(q=>q[0]+(q[1]==null?'':Math.ceil(q[1]))).join('|');if(key===fxKey)return;fxKey=key;
  $('wofFx').innerHTML=list.map(([l,t])=>`<div>${l}${t==null?'':' '+fmt(t)}</div>`).join('');
}
const fmt=t=>{t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
export function tints(o){
  setup();
  $('wofPlague').style.opacity=o.plague||0;$('wofTickle').style.opacity=o.tickle||0;$('wofPox').style.opacity=o.pox||0;$('wofFat').style.opacity=o.fat||0;
}

/* ---------- the words and buttons over a 3D break (src/wheel-breaks.js draws the scene) ---------- */
let skipT=0;
export const breakUI={
  open(kind){setup();document.body.classList.add('wofbreak');$('wofBreak').className='on '+kind;this.caption('');this.callout('');this.bar('','');
    const sk=$('wofSkip');sk.classList.remove('lit');sk.style.display=kind==='ad'?'block':'none';sk.innerHTML='Skip Ad in 5';sk.onclick=e=>{e.stopPropagation()}},  // it does nothing. That is the joke.
  close(){setup();document.body.classList.remove('wofbreak');$('wofBreak').className='';$('wofSkip').style.display='none'},
  caption(t){const el=$('wofCap');el.textContent=t;el.style.display=t?'':'none'},
  callout(t){const el=$('wofCall');el.textContent=t;el.style.display=t?'':'none'},
  bar(a,b){$('wofBarL').textContent=a;$('wofBarR').textContent=b},
  adClock(t,dur){const left=Math.max(0,dur-t);$('wofAdTag').textContent='Ad · 0:'+String(Math.ceil(left)).padStart(2,'0');$('wofAdProg').style.width=(100*t/dur)+'%';
    const sk=$('wofSkip');if(t<5){const k=Math.ceil(5-t);if(k!==skipT){skipT=k;sk.innerHTML='Skip Ad in '+k}}else if(!sk.classList.contains('lit')){sk.classList.add('lit');sk.innerHTML='Skip Ad &#9654;&#10073;';skipT=0}},
};

// the coin: spins in the air, lands on the side the spinner rolled
export function coinFlip(heads,onDone){
  setup();const box=$('wofCoin'),c=box.querySelector('.c'),p=box.querySelector('p');
  box.style.display='block';p.style.opacity=0;
  const turns=7+(heads?0:0.5),dur=2600;
  c.style.transition='none';c.style.transform='rotateY(0deg) translateY(0)';
  void c.offsetWidth;
  c.animate([{transform:'translateY(0) rotateY(0deg)'},{transform:'translateY(-120px) rotateY('+turns*180+'deg)',offset:0.5},{transform:'translateY(0) rotateY('+turns*360+'deg)'}],
    {duration:dur,easing:'cubic-bezier(.3,.6,.4,1)',fill:'forwards'});
  setTimeout(()=>{p.textContent=heads?'Heads! Everyone gains 200 pounds.':'Tails. Nothing happens. This time.';p.style.opacity=1},dur+100);
  setTimeout(()=>{box.style.display='none';if(onDone)onDone()},dur+2600);
}
