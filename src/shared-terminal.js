const fields={
  nameIn:{event:'input',label:'Player name',read:v=>typeof v==='string'?v.slice(0,16):undefined},
  seedIn:{event:'input',label:'Seed',read:v=>typeof v==='string'?v.slice(0,8):undefined},
  startSel:{event:'change',label:'Default lift floor',read:v=>Number.isInteger(+v)&&+v>=1&&+v<=1000?String(+v):undefined},
  sens:{event:'input',label:'Look speed',read:v=>number(v,0.4,2.5)},
  brightness:{event:'input',label:'Brightness',read:v=>number(v,0.6,3)},
  qSel:{event:'change',label:'Graphics',read:v=>['auto','high','medium','low'].includes(v)?v:undefined},
  gtx:{event:'change',label:'Dedicated graphics',read:v=>typeof v==='boolean'?v:undefined},
  voice:{event:'change',label:'Voice chat',read:v=>['off','ptt','open'].includes(v)?v:undefined},
};
const graphics={auto:'Auto',high:'High',medium:'Medium',low:'Low'};
const voices={off:'Off',ptt:'Push to talk',open:'Open mic'};

function number(value,min,max){
  const n=Number(value);
  if(Number.isFinite(n)&&n>=min&&n<=max)return String(n);
}

function snapshot(values){
  const result={};
  for(const [key,field] of Object.entries(fields)){
    const value=field.read(values?.[key]);
    if(value!==undefined)result[key]=value;
  }
  return result;
}

export function createTerminalSession({canReach,publish,apply,read,playerId,playerName}){
  let session=null,revision=0;
  function receive(next){
    const previous=session;
    session=next;
    if(!next||next.owner!==playerId())return;
    const baseline=previous?.owner===next.owner?previous.values:read();
    for(const [key,value] of Object.entries(next.values)){
      if(Object.hasOwn(fields,key)&&fields[key].read(value)===value&&baseline[key]!==value)apply(key,value);
    }
  }
  function send(next){
    receive(next);
    publish(session,++revision);
  }
  function expire(){
    if(session&&!canReach(session.owner))send(null);
  }
  return {
    get session(){return session},
    reset(){session=null;revision=0},
    sync(){publish(session,revision)},
    update(next,version){
      if(!Number.isSafeInteger(version)||version<=revision)return;
      revision=version;
      receive(next);
    },
    expire,
    select(actor,{key,value,initial,highlight=false}){
      expire();
      if(!canReach(actor)||!Object.hasOwn(fields,key))return;
      const changes=!highlight;
      const setting=changes?fields[key].read(value):undefined;
      if(changes&&setting===undefined)return;
      const owner=session?.owner||actor;
      const values=session?.values||snapshot(initial);
      if(!Object.hasOwn(values,key))return;
      // Turning on another player's microphone requires their own selection.
      const limits=session?.limits||Math.min(1000,Math.max(1,Math.trunc(initial?.maxDepth)||1));
      if(key==='startSel'&&changes&&+setting>limits)return;
      const edit=changes&&(key!=='voice'||actor===owner||setting==='off');
      const selection={actor,key,by:playerName(actor),confirm:changes&&!edit};
      send({
        owner,values:edit?{...values,[key]:setting}:values,
        limits,
        selections:[selection,...(session?.selections||[]).filter(item=>item.actor!==actor)].slice(0,3),
      });
    }
  };
}

export function createSettingsScreen(board,{select,close,enabled}){
  const selectors={nameIn:'#nameIn',seedIn:'#seedIn',startSel:'#startSel',sens:'#sens',brightness:'.brightS',qSel:'#qSel',gtx:'#gtx',voice:'.voiceSel'};
  const source=Object.fromEntries(Object.entries(selectors).map(([key,selector])=>[key,board.querySelector(selector)]));
  const screen=board.cloneNode(true);
  const display=document.createElement('canvas');
  display.width=900;display.height=560;
  const ctx=display.getContext('2d');
  screen.className='shared-terminal';
  screen.hidden=true;
  screen.removeAttribute('id');
  screen.querySelectorAll('[data-station-panel]:not([data-station-panel=settings])').forEach(el=>el.remove());
  const panel=screen.querySelector('[data-station-panel=settings]');
  panel.hidden=false;
  const controls=Object.fromEntries(Object.entries(selectors).map(([key,selector])=>[key,panel.querySelector(selector)]));
  for(const [key,el] of Object.entries(controls))el.dataset.setting=key;
  controls.nameIn.closest('label').firstChild.nodeValue='Player name ';
  const byId=id=>screen.querySelector('#'+id);
  const role=Object.fromEntries(['hostBtn','soloBtn','hubInvite','hubInviteLink','hubInviteCopy','mpJoinLine','depthLbl','seedLbl'].map(id=>[id,byId(id)]));
  const card=byId('stationCard'),heading=byId('stationTitle');
  const exit=byId('closeStation');
  card.removeAttribute('aria-labelledby');
  const login=document.createElement('p'),status=document.createElement('p');
  login.className='terminal-login';
  status.className='terminal-selection';
  heading.textContent='Settings';
  heading.after(login,status);
  for(const el of screen.querySelectorAll('[id]')){
    el.dataset.screenId=el.id;
    el.removeAttribute('id');
  }
  document.body.append(screen);
  exit.onclick=close;
  for(const key of ['hostBtn','soloBtn','hubInviteCopy'])role[key].onclick=()=>board.querySelector('#'+key).click();
  role.hubInviteLink.addEventListener('click',()=>role.hubInviteLink.select());
  const valueOf=el=>el.type==='checkbox'?el.checked:el.value;
  const write=(message,x,y,color='#c1ecd9',size=22)=>{
    ctx.fillStyle=color;ctx.font=size+'px Consolas, monospace';ctx.fillText(message,x,y,display.width-x-30);
  };
  function paint(session,ownerName,selectionText){
    const {values,selections}=session;
    ctx.fillStyle='#102128';
    ctx.fillRect(0,0,900,560);
    ctx.strokeStyle='#416662';ctx.lineWidth=3;ctx.strokeRect(12,12,876,536);
    for(let y=16;y<548;y+=5){ctx.fillStyle='#08131535';ctx.fillRect(14,y,872,1)}
    write('Settings',40,70,'#bdf1d5',45);
    write('Logged on · '+ownerName,42,112,'#a5efc0',28);
    write(selectionText,42,146,'#f6d590',19);
    const text={
      nameIn:values.nameIn||'Delver',voice:voices[values.voice],
      seedIn:values.seedIn||'Random',startSel:'Depth '+values.startSel,
      sens:values.sens+'×',brightness:Math.round(+values.brightness/1.3*100)+'%',
      qSel:graphics[values.qSel],gtx:values.gtx?'On':'Off',
    };
    Object.keys(text).forEach((key,i)=>{
      const x=42+i%2*418,y=176+Math.floor(i/2)*81;
      const picked=selections.some(item=>item.key===key);
      ctx.fillStyle=picked?'#3e3928':'#192e35';
      ctx.fillRect(x,y,398,64);
      ctx.strokeStyle=picked?'#e9be65':'#416662';ctx.lineWidth=2;ctx.strokeRect(x,y,398,64);
      write(fields[key].label,x+13,y+23,picked?'#f6d590':'#a9c2bc',19);
      write(text[key],x+13,y+50,'#def6ec',25);
    });
  }
  screen.addEventListener('pointerdown',e=>{
    const control=e.target.closest('[data-setting]')||e.target.closest('label')?.querySelector('[data-setting]');
    if(control&&enabled())select(control.dataset.setting,undefined,true);
  });
  for(const [key,el] of Object.entries(controls))el.addEventListener(fields[key].event,()=>{
    if(enabled())select(key,valueOf(el),false);
  });
  function read(){
    return {...Object.fromEntries(Object.entries(source).map(([key,el])=>[key,valueOf(el)])),
      maxDepth:+source.startSel.options[source.startSel.options.length-1]?.value||1};
  }
  let depthLimit,lastRender='';
  return {
    screen,display,source,read,
    render({visible,interactive,session,ownerName,near}){
      screen.hidden=!interactive;
      screen.inert=!interactive;
      if(!visible){lastRender='';return}
      const values=session?.values||read();
      const join=board.querySelector('#mpJoinLine').textContent;
      const signature=JSON.stringify([interactive,ownerName,session,near,values,join]);
      if(lastRender===signature)return false;
      lastRender=signature;
      login.textContent=session?'Logged on · '+ownerName:'No player logged on';
      login.classList.toggle('signed-in',!!session);
      const selections=session?.selections||[];
      const selectionText=selections.map(picked=>picked.by+' selected '+fields[picked.key].label+(picked.confirm?' (owner enables mic)':'')).join(' · ');
      status.textContent=selectionText||'Select an option to log on';
      if(!near&&interactive)status.textContent='Step within 5 ft to use Settings'+(selectionText?' · '+selectionText:'');
      if(interactive&&selections.some(item=>['qSel','gtx'].includes(item.key)))status.textContent+=' · Graphics apply on reload';
      for(const key of ['hostBtn','soloBtn','hubInvite','mpJoinLine','depthLbl','seedLbl']){
        const original=board.querySelector('#'+key);
        role[key].hidden=key==='depthLbl'?!(session?session.limits>1:!original.hidden):key==='seedLbl'?false:original.hidden;
      }
      role.hostBtn.textContent=board.querySelector('#hostBtn').textContent;
      role.mpJoinLine.textContent=join;
      if(document.activeElement!==role.hubInviteLink)role.hubInviteLink.value=board.querySelector('#hubInviteLink').value;
      const limit=session?.limits||values.maxDepth;
      if(depthLimit!==limit){
        depthLimit=limit;
        controls.startSel.replaceChildren(...Array.from({length:limit},(_,i)=>new Option('Depth '+(i+1),i+1)));
      }
      for(const [key,el] of Object.entries(controls)){
        el.disabled=!near;
        el.classList.toggle('terminal-picked',selections.some(picked=>picked.key===key));
        const value=values[key];
        if(value===undefined)continue;
        if(el.type==='checkbox')el.checked=value;
        else if(el.value!==value)el.value=value;
      }
      if(session)paint(session,ownerName,selectionText);
      return !!session;
    }
  };
}
