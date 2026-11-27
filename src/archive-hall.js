import * as THREE from 'three';


const accents={doors:0xd49d5b,floors:0x79b595,mobs:0xd58976,glitches:0xa98bd8};
const boxGeometry=new THREE.BoxGeometry();
const material=(color,props)=>new THREE.MeshStandardMaterial({color,roughness:0.82,...props});
const stone=material(0x625b64), dark=material(0x242330), iron=material(0x3c3b49,{metalness:0.5});
const brass=material(0x9f784b,{metalness:0.45});
const glass=material(0x91cbd9,{transparent:true,opacity:0.13,depthWrite:false,roughness:0.2});
const sharedMaterials=new Set([stone,dark,iron,brass,glass]);


function box(parent,mat,x,y,z,w,h,d){
  const mesh=new THREE.Mesh(boxGeometry,mat);
  mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);
  return mesh;
}
function lamp(parent,color,intensity,x,y,z,distance){
  const light=new THREE.PointLight(color,intensity,distance);
  light.position.set(x,y,z);parent.add(light);
}
export function worldSign(parent,text,x,y,z,width,height,options={}){
  const canvas=document.createElement('canvas');
  const heightPx=256,widthPx=Math.round(Math.min(1920,heightPx*width/height));
  canvas.width=widthPx;canvas.height=heightPx;
  const ctx=canvas.getContext('2d');
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map}));
  mesh.position.set(x,y,z);parent.add(mesh);
  mesh.setLabel=(value,lit=true,progress=null)=>{
    ctx.clearRect(0,0,widthPx,heightPx);
    ctx.fillStyle=options.background||'#181622';ctx.fillRect(0,0,widthPx,heightPx);
    if(options.border!==false){
      ctx.strokeStyle=options.border||'#a48762';ctx.lineWidth=4;ctx.strokeRect(8,8,widthPx-16,heightPx-16);
    }
    const lines=Array.isArray(value)?value:[value];
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=lit?(options.color||'#ffdfb5'):'#686273';
    for(const [index,line] of lines.entries()){
      ctx.font=index===0?(options.font||'600 77px Georgia'):(options.subFont||'500 37px "Segoe UI"');
      ctx.fillText(line,widthPx/2,lines.length===1?132:94+index*83,widthPx-28);
    }
    if(progress!==null){
      ctx.fillStyle='#244940';ctx.fillRect(16,223,widthPx-32,14);
      ctx.fillStyle='#a4ead0';ctx.fillRect(16,223,(widthPx-32)*progress,14);
    }
    map.needsUpdate=true;
  };
  mesh.setLabel(text);
  return mesh;
}

// The model uses the recorded seed's actual walkable cells, walls and landmarks.
export function floorDiorama(floor){
  const group=new THREE.Group(),s=1.84/Math.max(floor.W,floor.H);
  const color=new THREE.Color(),tile=new THREE.Object3D();
  const stoneColor=new THREE.Color().setRGB(...floor.stone);
  const terrain=new THREE.InstancedMesh(boxGeometry,material(0xffffff),floor.W*floor.H);
  for(let z=0;z<floor.H;z++)for(let x=0;x<floor.W;x++){
    const i=z*floor.W+x,v=floor.g[i],wall=v===1||v===2;
    const h=wall?(floor.forest?2.5:1.38)*s:0.17*s;
    tile.position.set((x-(floor.W-1)/2)*s,h/2,(z-(floor.H-1)/2)*s);
    tile.scale.set(s*0.99,h,s*0.99);tile.updateMatrix();terrain.setMatrixAt(i,tile.matrix);
    color.copy(stoneColor).multiplyScalar(wall?0.72+0.28*Math.abs(Math.sin(i*18.21)):1.27);
    if(floor.safeMask[i])color.setHex(0xa87c3b);
    if(v===2)color.setHex(0x918160);
    terrain.setColorAt(i,color);
  }
  group.add(terrain);
  for(const [point,tint] of [[floor.start,0x64e0ca],[floor.exit,0xffb177]]){
    const beacon=new THREE.Mesh(new THREE.OctahedronGeometry(s*0.7),new THREE.MeshBasicMaterial({color:tint}));
    beacon.position.set((point.tx-(floor.W-1)/2)*s,s*1.4,(point.ty-(floor.H-1)/2)*s);
    group.add(beacon);
  }
  group.rotation.x=0.45;
  return group;
}

export function lenticularDoor(skins){
  const exhibit=new THREE.Group();
  const eye=new THREE.Vector3();
  const layers=skins.map(mesh=>{
    const amount={value:0},incoming={value:0};
    mesh.material.onBeforeCompile=shader=>{
      shader.uniforms.lensAmount=amount;
      shader.uniforms.lensIncoming=incoming;
      shader.vertexShader='varying float lensX;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nlensX = position.x;');
      shader.fragmentShader='varying float lensX;\nuniform float lensAmount;\nuniform float lensIncoming;\n'+
        shader.fragmentShader.replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif ((fract(lensX * 65.0) < lensAmount) != (lensIncoming > 0.5)) discard;');
    };
    exhibit.add(mesh);
    return {mesh,amount,incoming};
  });
  function show(angle){
    const index=THREE.MathUtils.clamp(Math.floor(layers.length/2)+angle*(layers.length-1)/1.96,0,layers.length-1);
    const start=Math.floor(index);
    const amount=THREE.MathUtils.smoothstep(index-start,0.36,0.64);
    layers.forEach((layer,i)=>{
      const next=i===start+1;
      layer.mesh.visible=i===start&&amount<1||next&&amount>0;
      layer.amount.value=amount;
      layer.incoming.value=next?1:0;
    });
  }
  exhibit.userData.faceViewer=position=>{
    exhibit.worldToLocal(eye.copy(position));
    show(Math.atan2(eye.x,Math.max(0.001,eye.z)));
  };
  show(0);
  return exhibit;
}

function glitchScreen(parent,id,name,known){
  const width=384,height=224,canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  box(parent,iron,0,1.47,0,1.96,1.24,0.43);
  box(parent,brass,0,1.47,0.2,1.77,1.06,0.055);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.66,0.96),new THREE.MeshBasicMaterial({map}));
  screen.name=known?name+' recording':'Undiscovered glitch';
  screen.position.set(0,1.47,0.234);parent.add(screen);
  const clip=known?__GLITCH_CLIPS__[id]:null;
  let frame=-1,video=null;
  function stop(){
    if(!video)return;
    const current=video;
    video=null;
    current.pause();
    current.removeAttribute('src');
    current.load();
    frame=-1;
  }
  function play(){
    if(!clip||video)return;
    const current=document.createElement('video');
    current.muted=true;
    current.playsInline=true;
    current.addEventListener('ended',()=>{if(video===current)stop()},{once:true});
    current.addEventListener('error',()=>{if(video===current)stop()},{once:true});
    video=current;
    current.src=clip;
    current.play().catch(()=>{if(video===current)stop()});
  }
  function draw(time){
    const tick=Math.floor(time*12);
    if(tick===frame)return;
    frame=tick;
    ctx.fillStyle='#101522';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#648f96';ctx.lineWidth=2;ctx.strokeRect(12,12,width-24,height-24);
    ctx.save();ctx.beginPath();ctx.rect(14,14,width-28,height-28);ctx.clip();
    const playing=video?.readyState>=2;
    if(playing){
      const scale=Math.min((width-28)/video.videoWidth,(height-56)/video.videoHeight);
      const w=video.videoWidth*scale,h=video.videoHeight*scale;
      ctx.drawImage(video,(width-w)/2,42+(height-56-h)/2,w,h);
    }else if(known){
      const freezeTick=tick%72,held=id==='freeze'&&freezeTick>=22&&freezeTick<49;
      const motion=id==='freeze'?freezeTick-THREE.MathUtils.clamp(freezeTick-22,0,27):tick;
      const drift=((motion*(id==='rubberfwd'?3:1))%28)/28;
      ctx.strokeStyle=id==='hud'?'#ca78ac':'#72c9b6';
      // CRT illustrations use the anomaly's movement and framing.
      if(id==='fall'){
        for(let i=0;i<8;i++){
          const p=((i+drift)/8)**2,w=20+p*350,h=14+p*220;
          ctx.strokeRect(width/2-w/2,height/2-h/2,w,h);
        }
      }else if(id==='clip'){
        const phase=tick%48,held=phase>=18&&phase<29;
        const progress=phase<18?phase/18:phase<29?1:Math.max(0,1-(phase-29)/11);
        const w=48+progress*290,h=48+progress*165,left=(width-w)/2,top=120-h/2;
        ctx.strokeStyle='#b49a7d';ctx.strokeRect(left,top,w,h);
        ctx.fillStyle=held?'#292231':'#543b37';ctx.fillRect(left+1,top+1,w-2,h-2);
        for(let row=1;row<5;row++){
          const y=top+h*row/5;
          ctx.strokeStyle='#211b25';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+w,y);ctx.stroke();
        }
        ctx.fillStyle=held?'#eab8a1':'#c4dfbc';ctx.font='13px monospace';
        ctx.fillText(held?'CAUGHT IN STONE':phase>=29?'PUSHED THROUGH':'APPROACHING WALL',25,172);
      }else if(id==='hud'){
        ctx.fillStyle='#dc87b7';ctx.font='bold 26px monospace';
        ctx.fillText(tick%18<10?'DEPTH  -1':'D█PTH  ∞',48,109);
        ctx.fillText('◆ ◆ ◆ / 4',78,147);
      }else{
        for(const side of [-1,1]){
          ctx.beginPath();ctx.moveTo(width/2,87);ctx.lineTo(width/2+side*214,218);ctx.stroke();
          ctx.beginPath();ctx.moveTo(width/2,87);ctx.lineTo(width/2+side*200,-15);ctx.stroke();
        }
        for(let i=0;i<5;i++){
          const p=((i+drift)/5)**2,w=25+p*330;
          ctx.strokeRect(width/2-w/2,84-p*70,w,42+p*130);
        }
        if(id==='hole'&&tick%42>=16){
          ctx.fillStyle='#090b14';ctx.fillRect(251,68,78,127);
          ctx.strokeStyle='#d3ae89';ctx.setLineDash([5,4]);
          ctx.strokeRect(251,68,78,127);ctx.setLineDash([]);
        }
        if(['rubber','rubberfwd','replay','tpose'].includes(id)){
          const x=id==='tpose'?192:192+40*Math.sin(drift*6.28)*(tick%5===0?-1:1);
          ctx.fillStyle='#e4a9b9';ctx.fillRect(x-6,92,12,12);ctx.fillRect(x-3,107,6,37);
          ctx.fillRect(x-18,110,36,4);ctx.fillRect(x-10,142,5,18);ctx.fillRect(x+5,142,5,18);
        }
        if(held||id==='loop'){
          ctx.fillStyle='#e7b599';ctx.font='13px monospace';
          ctx.fillText(held?'FRAME HELD':'PASSAGE 01 ↻',24,194);
        }
      }
    }else{
      ctx.fillStyle='#78899b';ctx.font='18px monospace';ctx.textAlign='center';ctx.fillText('AWAITING SIGNAL',width/2,119);
    }
    ctx.fillStyle='#11152175';
    for(let y=0;y<height;y+=5)ctx.fillRect(0,y,width,2);
    ctx.fillStyle='#111521bb';ctx.fillRect(14,14,width-28,28);
    ctx.fillStyle='#a9d6cd';ctx.font='15px monospace';ctx.textAlign='left';
    ctx.fillText(known?name.toUpperCase():'NO RECORDING',24,34,known?246:336);
    if(known){
      ctx.fillStyle=tick%18<12?'#e69ba8':'#80606e';
      ctx.fillText(playing?'▶ CLIP':'● LOOP',306,34);
      if(clip&&!playing){
        ctx.fillStyle='#131723';ctx.fillRect(115,182,154,20);
        ctx.fillStyle='#c8cfdb';ctx.font='12px monospace';ctx.textAlign='center';
        ctx.fillText('USE · GAMEPLAY CLIP',width/2,196);
      }
    }
    ctx.restore();map.needsUpdate=true;
  }
  draw(0);
  return {draw:known?draw:null,play:clip?play:null,stop};
}

export function createArchiveHall(kind,entries,asset){
  const accent=accents[kind],span=3.65;
  const end=-(Math.ceil(entries.length/2)-1)*span-3;
  const scene=new THREE.Group();
  const rear=6.55;
  const mid=(end+rear)/2,length=rear-end,lightMaterial=new THREE.MeshBasicMaterial({color:accent});
  const wallEnd=rear-0.26,wallLength=wallEnd-end,wallMiddle=(end+wallEnd)/2;
  const floorMat=material(0x393542), inlay=material(accent,{emissive:accent,emissiveIntensity:0.19});
  box(scene,dark,0,-0.15,mid,8.8,0.26,length);
  box(scene,dark,0,3.63,wallMiddle,8.8,0.18,wallLength);
  box(scene,stone,0,1.77,end,8.85,3.57,0.18);

  const stones=new THREE.InstancedMesh(boxGeometry,stone,entries.length*115+500);
  const tiles=new THREE.Object3D(),shade=new THREE.Color();
  let n=0;
  function tile(x,y,z,w,h,d){
    tiles.position.set(x,y,z);tiles.scale.set(w,h,d);tiles.updateMatrix();
    stones.setMatrixAt(n,tiles.matrix);
    const c=0.57+Math.abs(Math.sin(n*28.7))*0.36;stones.setColorAt(n++,shade.setRGB(c,c,c));
  }
  for(let z=end+0.45;z<rear-0.05;z+=0.9){
    for(let x=-3.75;x<4;x+=0.83)tile(x,-0.043,z,0.817,0.09,0.883);
    for(const side of [-1,1])for(let row=0;row<9;row++){
      const start=z+(row%2)*0.44-0.439,finish=Math.min(start+0.878,wallEnd);
      if(finish>start)tile(side*4.38,0.195+row*0.4,(start+finish)/2,0.13,0.382,finish-start);
    }
  }
  stones.count=n;scene.add(stones);
  box(scene,floorMat,0,0.012,mid,2.02,0.023,length);
  for(const side of [-1,1]){
    box(scene,inlay,side*1.03,0.024,mid,0.024,0.02,length);
    box(scene,iron,side*4.29,0.18,wallMiddle,0.23,0.34,wallLength);
    box(scene,iron,side*4.25,3.24,wallMiddle,0.32,0.16,wallLength);
  }
  for(let z=3;z>end;z-=span){
    box(scene,iron,0,3.33,z,8.58,0.37,0.29);
    for(const side of [-1,1]){
      box(scene,iron,side*3.93,1.65,z,0.34,3.42,0.39).rotation.z=side*0.13;
      box(scene,inlay,side*3.76,2.95,z+0.16,0.25,0.035,0.08);
    }
    box(scene,lightMaterial,0,3.10,z,0.86,0.024,0.19);

  }
  lamp(scene,accent,30,0,2.96,2.9,8);
  lamp(scene,accent,24,0,2.96,end/2,Math.abs(end)/2+5);
  const proxy=new THREE.MeshBasicMaterial({visible:false});
  const screens=[],lenses=[],actors=[],targets=[];
  for(const [index,entry] of entries.entries()){
    let playback=null;
    const side=index%2===0?-1:1,z=-Math.floor(index/2)*span;
    const bay=new THREE.Group();
    bay.position.set(side*(kind==='floors'?2.40:3.05),0,z);
    bay.rotation.y=-side*0.91;
    scene.add(bay);
    const back=kind==='doors'?0:kind==='floors'?-1.28:-0.33;
    box(bay,dark,0,1.34,back-0.15,2.14,2.68,0.14);
    box(bay,iron,0,2.65,back-0.06,2.28,0.15,0.28);
    for(const x of [-1.09,1.09])box(bay,iron,x,1.35,back,0.095,2.74,0.21);
    box(bay,entry.data?inlay:iron,0,2.55,back+0.15,1.85,0.025,0.09);
    if(kind==='doors'){
      box(bay,brass,0,0.075,0.11,1.78,0.15,0.87);
      const model=asset(entry);model.position.y=0.15;model.scale.setScalar(1.94);bay.add(model);
      if(model.userData.faceViewer)lenses.push(model.userData.faceViewer);
      if(!entry.data)worldSign(bay,'?',0,2.55,0.27,0.60,0.51,{font:'700 151px Georgia'});
    }else{
      box(bay,iron,0,0.47,0,1.88,0.94,1.0);
      box(bay,brass,0,0.93,0,2.02,0.08,1.12);
      if(kind==='glitches'){
        const screen=glitchScreen(bay,entry.id,entry.name,!!entry.data);
        if(screen.draw)screens.push(screen);
        playback=screen.play;
      }else if(entry.data){
        const exhibit=asset(entry);
        if(kind==='floors'){
          // Mount the tray in the model's own plane. The rear wall sits
          // behind the full swept footprint of the tilted diorama.
          exhibit.position.y=1.60;
          box(exhibit,iron,0,-0.044,0,1.96,0.064,1.96);
          for(const z of [-0.38,0.38]){
            const top=1.60-0.066/Math.cos(exhibit.rotation.x)-z*Math.tan(exhibit.rotation.x);
            box(bay,brass,0,(top+0.97)/2,z,0.91,top-0.97,0.073);
          }
        }else exhibit.position.y=0.97;
        bay.add(exhibit);
        if(exhibit.userData.animateExhibit)actors.push(exhibit.userData.animateExhibit);
        if(kind==='mobs'){
          box(bay,glass,0,1.67,0.38,1.47,1.43,0.02);
          box(bay,iron,0,2.41,0.06,1.53,0.09,0.68);
        }
      }else{
        worldSign(bay,'?',0,1.61,0.01,1.33,0.9,{font:'700 133px Georgia',background:'#252434',color:'#b8a5be'});
      }
    }
    if(entry.data){
      const plaqueY=kind==='doors'?0.23:kind==='floors'?0.66:0.75;
      const plaqueZ=kind==='floors'?0.63:0.556;
      box(bay,brass,0,plaqueY,plaqueZ,1.5,0.23,0.065);
      worldSign(bay,entry.name,0,plaqueY,plaqueZ+0.034,1.47,0.20,{font:'600 107px Georgia'});
    }
    if(kind!=='glitches'||playback){
      const hit=box(bay,proxy,0,1.42,0.37,2.04,2.75,0.34);
      hit.userData.entry=playback?{...entry,playClip:playback}:entry;
      targets.push(hit);
    }
  }
  function dispose(){
    for(const screen of screens)screen.stop();
    const materials=new Set(),geometries=new Set();
    scene.traverse(object=>{
      if(object.isInstancedMesh)object.dispose();
      if(object.geometry&&object.geometry!==boxGeometry)geometries.add(object.geometry);
      if(object.material&&!sharedMaterials.has(object.material))materials.add(object.material);
    });
    for(const geometry of geometries)geometry.dispose();
    for(const mat of materials){mat.map?.dispose();mat.dispose()}
    scene.removeFromParent();
  }
  return {group:scene,end:end-rear,targets,dispose,animate(time,viewer){
    for(const screen of screens)screen.draw(time);
    for(const faceViewer of lenses)faceViewer(viewer);
    for(const animate of actors)animate(time,viewer);
  }};
}
