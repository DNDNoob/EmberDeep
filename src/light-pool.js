import * as THREE from 'three';
// A fixed set of real point lights standing in for all the lamps in a big scene. Every point light in a shader is paid for on every
// pixel of every lit surface, and changing how many there are makes three.js recompile every lit material (a long stall). The lamps
// placed in the scene become stand-ins: hidden themselves, and each frame the pool's lights take the places of the ones that matter
// most from where the camera is (bright, close, still in reach), fading in and out so nothing pops. The number of lights never
// changes, so nothing ever recompiles, however many lamps come and go (a lift ride, a gallery, a hangar).
export function createLightPool(scene,size=8){
  const rig=new THREE.Group();rig.name='lightPool';scene.add(rig);
  const slots=[];
  for(let i=0;i<size;i++){const l=new THREE.PointLight(0xffffff,0,1,2);l.userData.pool=true;rig.add(l);slots.push({light:l,src:null,w:0})}
  let lamps=[],scan=0;
  const pos=new THREE.Vector3(),cam=new THREE.Vector3();
  const shown=o=>{for(let p=o.parent;p;p=p.parent)if(!p.visible)return false;return true};
  function rescan(){
    const found=[];
    scene.traverse(o=>{if(o.isPointLight&&!o.userData.pool){found.push(o);if(o.visible){o.visible=false;o.userData.lamp={}}}});
    lamps=found;
  }
  function update(camera,dt=1/60){
    if(--scan<=0){scan=30;rescan()}
    scene.updateMatrixWorld();camera.getWorldPosition(cam);
    const ranked=[];
    for(const l of lamps){
      if(!l.userData.lamp||!shown(l)||l.intensity<=0)continue;
      pos.setFromMatrixPosition(l.matrixWorld);
      const d=pos.distanceTo(cam),r=l.distance||40;
      if(d>r+14)continue;
      const held=slots.some(s=>s.src===l&&s.w>0.5);
      ranked.push([l.intensity/(1+Math.max(0,d-r*0.35)**2)*(held?1.35:1),l]);
    }
    ranked.sort((a,b)=>b[0]-a[0]);
    const want=new Set(ranked.slice(0,size).map(q=>q[1]));
    const k=Math.min(1,dt/0.35);
    for(const s of slots){if(s.src&&!want.has(s.src))s.w=Math.max(0,s.w-k);if(s.src&&want.has(s.src))s.w=Math.min(1,s.w+k);if(s.w<=0)s.src=null}
    for(const l of want){
      if(slots.some(s=>s.src===l))continue;
      let s=slots.find(q=>!q.src);
      if(!s){s=slots.filter(q=>!want.has(q.src)).sort((a,b)=>a.w-b.w)[0];if(!s)break}
      s.src=l;s.w=Math.min(k,1);
    }
    for(const s of slots){
      const L=s.light,l=s.src;
      if(!l){L.intensity=0;continue}
      pos.setFromMatrixPosition(l.matrixWorld);L.position.copy(pos);
      L.color.copy(l.color);L.distance=l.distance;L.decay=l.decay;L.intensity=l.intensity*s.w;
    }
  }
  rescan();
  return {update,rescan,get lamps(){return lamps.length}};
}
