import * as THREE from 'three';
import {worldSign} from './archive-hall.js';
import {appearanceChoice,appearanceFields,cycleAppearance} from './player-appearance.js';

const mirrorX=0.72,controlsX=-0.68,sinkFront=5.65;
const controlsWidth=1.23,controlsHeight=1.26,controlsY=1.835;
const rowTop=97,rowHeight=58,screenWidth=480,screenHeight=492;
const pageSize=5,pageY=416,pageCount=Math.ceil(appearanceFields.length/pageSize);

export function createBunkVanity(group,box,{trim,wood,lockers,lens},back,{getLook,setLook,getName,getColor,buildPortrait},sfx){
  const enamel=new THREE.MeshStandardMaterial({color:0xd2d4c4,roughness:0.34});
  const glass=new THREE.MeshStandardMaterial({color:0x365357,roughness:0.45});
  const depth=back-0.13;
  box(group,trim,mirrorX,1.89,depth,1.39,1.24,0.17);
  box(group,wood,mirrorX,1.89,depth-0.075,1.32,1.17,0.09);
  box(group,glass,mirrorX,1.89,depth-0.123,1.24,1.09,0.025);
  box(group,lens,mirrorX,2.45,depth-0.15,1.19,0.037,0.041);
  box(group,trim,controlsX,controlsY,depth,controlsWidth+0.09,controlsHeight+0.09,0.18);

  const portraitMount=new THREE.Group();
  portraitMount.name='Mirror portrait';
  portraitMount.position.set(mirrorX,1.82,depth-0.23);
  group.add(portraitMount);
  let portrait,shownLook,shownName,shownColor,highlight,washTime=0,page=0;

  const basinZ=5.91;
  box(group,lockers,mirrorX,0.46,basinZ+0.07,0.75,0.92,0.37);
  box(group,trim,mirrorX,0.08,basinZ+0.06,0.8,0.16,0.39);
  box(group,enamel,mirrorX,0.94,basinZ,1.13,0.09,0.55);
  for(const side of [-1,1]){
    box(group,enamel,mirrorX+side*0.52,1.02,basinZ,0.09,0.11,0.55);
    box(group,enamel,mirrorX,1.02,basinZ+side*0.23,0.96,0.11,0.09);
  }
  box(group,trim,mirrorX,0.993,basinZ,0.14,0.02,0.12);
  box(group,trim,mirrorX,1.17,6.13,0.09,0.23,0.08);
  box(group,trim,mirrorX,1.26,6.02,0.09,0.063,0.24);
  for(const side of [-1,1])box(group,wood,mirrorX+side*0.18,1.105,6.13,0.12,0.058,0.071);
  const sink=worldSign(group,'WASH FACE',mirrorX,0.91,sinkFront-0.027,0.83,0.15,{
    background:'#1b2b2e',border:'#77664c',color:'#f0dfb8',font:'700 102px monospace'
  });
  sink.name='Wash face';sink.rotation.y=Math.PI;
  const stream=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.022,0.24,8),
    new THREE.MeshBasicMaterial({color:0x9ce3f2,transparent:true,opacity:0.7}));
  stream.name='Running water';
  stream.position.set(mirrorX,1.11,5.92);stream.visible=false;group.add(stream);
  const basinTarget=new THREE.Mesh(new THREE.PlaneGeometry(1.13,0.55),new THREE.MeshBasicMaterial({visible:false}));
  basinTarget.name='Sink interaction';
  basinTarget.position.set(mirrorX,1.06,sinkFront-0.03);
  basinTarget.rotation.y=Math.PI;group.add(basinTarget);

  const canvas=document.createElement('canvas');
  canvas.width=screenWidth;canvas.height=screenHeight;
  const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const controls=new THREE.Mesh(new THREE.PlaneGeometry(controlsWidth,controlsHeight),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
  controls.name='Appearance controls';
  controls.position.set(controlsX,controlsY,depth-0.092);
  controls.rotation.y=Math.PI;group.add(controls);

  function draw(look,name){
    ctx.fillStyle='#172528';ctx.fillRect(0,0,screenWidth,screenHeight);
    ctx.fillStyle='#233538';ctx.fillRect(0,0,screenWidth,83);
    ctx.fillStyle='#f6e4bf';ctx.font='700 29px monospace';ctx.fillText('APPEARANCE',19,34);
    ctx.font='19px monospace';ctx.fillStyle='#adc9c3';ctx.fillText(name,20,62,screenWidth-40);
    ctx.textBaseline='middle';
    appearanceFields.slice(page*pageSize,(page+1)*pageSize).forEach((field,index)=>{
      const y=rowTop+index*rowHeight;
      ctx.fillStyle=index%2?'#1b2b2d':'#223335';ctx.fillRect(12,y,456,rowHeight-3);
      ctx.fillStyle='#c9d9d3';ctx.font='21px monospace';ctx.fillText(field.label,23,y+25);
      ctx.fillStyle='#fff0cd';ctx.font='700 21px monospace';ctx.textAlign='center';
      ctx.fillText(field.choices[appearanceChoice(look,field)],331,y+25,165);
      for(const [direction,x] of [[-1,224],[1,438]]){
        const selected=highlight?.field===field&&highlight.direction===direction;
        ctx.fillStyle=selected?'#e2bc79':'#3b5654';ctx.fillRect(x-19,y+6,38,37);
        ctx.fillStyle=selected?'#192627':'#f6e4bf';ctx.fillText(direction<0?'‹':'›',x,y+25);
      }
      ctx.textAlign='left';
    });
    ctx.fillStyle='#233538';ctx.fillRect(12,pageY,456,58);
    ctx.textAlign='center';ctx.fillStyle='#f6e4bf';ctx.font='700 21px monospace';
    ctx.fillText(page===0?'Style  1 / 2':'Details  2 / 2',240,pageY+29);
    for(const [direction,x] of [[-1,47],[1,433]]){
      const selected=highlight?.page===direction;
      ctx.fillStyle=selected?'#e2bc79':'#3b5654';ctx.fillRect(x-22,pageY+8,44,42);
      ctx.fillStyle=selected?'#192627':'#f6e4bf';ctx.fillText(direction<0?'‹':'›',x,pageY+29);
    }
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    texture.needsUpdate=true;
  }

  function refresh(){
    const look=getLook(),name=getName(),color=getColor();
    if(look!==shownLook||color!==shownColor){
      if(portrait){
        portraitMount.remove(portrait);portrait.geometry.dispose();portrait.material.dispose();
      }
      portrait=buildPortrait(look,color);
      portraitMount.add(portrait);
    }
    if(look!==shownLook||name!==shownName)draw(look,name);
    shownLook=look;shownName=name;shownColor=color;
  }
  function aim(ray,side,playerDepth){
    if(playerDepth<3.7||Math.abs(side)>2.02)return null;
    controls.updateWorldMatrix(true,false);
    basinTarget.updateWorldMatrix(true,false);
    const hit=ray.intersectObjects([controls,basinTarget])[0];
    if(!hit||hit.distance>2.5)return null;
    if(hit.object===basinTarget)return {wash:true,label:'Wash face to restore defaults'};
    const y=(1-hit.uv.y)*screenHeight;
    const x=hit.uv.x*screenWidth;
    if(y>=pageY&&y<pageY+58){
      const direction=x<80?-1:x>400?1:0;
      return direction?{page:direction,label:'Change appearance page'}:null;
    }
    const row=Math.floor((y-rowTop)/rowHeight);
    if(row<0||row>=pageSize)return null;
    const field=appearanceFields[page*pageSize+row];
    if(!field)return null;
    const direction=Math.abs(x-224)<=25?-1:Math.abs(x-438)<=25?1:0;
    if(!direction)return null;
    return {field,direction,label:field.label+' · '+(direction<0?'Previous':'Next')};
  }
  function setHighlight(hit){
    if(hit?.field===highlight?.field&&hit?.direction===highlight?.direction&&hit?.page===highlight?.page)return;
    highlight=hit;draw(getLook(),getName());
  }
  function use(hit){
    if(hit.wash){
      setLook(0);washTime=0.95;stream.visible=true;sink.setLabel('APPEARANCE RESET');sfx('washFace');
    }else if(hit.page){
      page=(page+hit.page+pageCount)%pageCount;
      draw(getLook(),getName());sfx('pick');
    }else{
      setLook(cycleAppearance(getLook(),hit.field,hit.direction));sfx('pick');
    }
    refresh();
  }
  function update(dt){
    refresh();
    if(washTime<=0)return;
    washTime-=dt;
    stream.material.opacity=0.51+0.15*Math.sin(washTime*68);
    if(washTime<=0){stream.visible=false;sink.setLabel('WASH FACE')}
  }
  return {aim,setHighlight,use,update,sinkFront,sinkMin:mirrorX-0.565,sinkMax:mirrorX+0.565};
}
