// Standard gamepad mapping. Labels use Xbox names for the same button positions.
const bindings={
  press:{keys:['KeyE'],button:2,labels:['E','X','Use']},
  jump:{keys:['Space'],button:0,labels:['Space','A','Jump']},
  back:{keys:['Escape'],button:1,labels:['Esc','B','Back']},
  alternate:{keys:['KeyQ'],button:3,labels:['Q','Y','Alternate']},
  tool:{keys:['KeyZ'],button:5,labels:['Z','RB','Tool']},
  start:{keys:['Enter','NumpadEnter'],button:9,labels:['Enter','Menu','Start round']},
  navUp:{keys:['ArrowUp'],button:12},
  navDown:{keys:['ArrowDown'],button:13},
  navLeft:{keys:['ArrowLeft'],button:14},
  navRight:{keys:['ArrowRight'],button:15},
};

export function roomActions(keys,buttons,{mode,mouse=false,touchPress=false,touchJump=false}){
  const action=name=>{
    const {keys:codes,button}=bindings[name];
    return !!buttons[button]||codes.some(code=>!!keys[code]);
  };
  const table=mode==='table',choice=mode==='choice';
  return {
    press:action('press')||mouse||touchPress,
    jump:!table&&(action('jump')||touchJump),
    back:action('back')||(table&&!!keys.Backspace),
    alternate:action('alternate'),
    tool:action('tool'),
    start:table&&action('start'),
    navUp:(table||choice)&&action('navUp'),navDown:(table||choice)&&action('navDown'),
    navLeft:(table||choice)&&action('navLeft'),navRight:(table||choice)&&action('navRight'),
    sprint:!!(keys.ShiftLeft||keys.ShiftRight||buttons[6]||buttons[10]),
  };
}

export function roomControlLabel(action,device){
  const index=device==='controller'?1:device==='touch'?2:0;
  if(action==='navigate')return ['Arrow keys','D-pad','Tap an option'][index];
  if(action==='navigateHorizontal')return ['←/→','D-pad ←/→','Tap an option'][index];
  if(action==='look')return ['Mouse or ←/→','Right stick','Drag to look'][index];
  return bindings[action].labels[index];
}
