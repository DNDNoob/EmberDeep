import * as THREE from 'three';

export const CAMERA_VIEWS={
  first:'First person',
  third:'Third person',
  second:'Second person',
};

export function nextCameraView(view){
  const modes=Object.keys(CAMERA_VIEWS);
  return modes[(modes.indexOf(view)+1)%modes.length];
}

// The camera can move independently of the eye used for movement and interaction.
export function cameraViewRig(){
  const eye=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3();
  const offset=new THREE.Vector3(),target=new THREE.Vector3();
  const savedPosition=new THREE.Vector3(),savedRotation=new THREE.Quaternion();

  return {
    place(camera,view,eyeHeight,clearance,ceiling=Infinity){
      if(view==='first')return false;
      eye.copy(camera.position);
      camera.getWorldDirection(forward);
      right.set(-forward.z,0,forward.x).normalize();
      const side=view==='third'?1:-1;
      const horizontal=Math.hypot(forward.x,forward.z);
      if(horizontal<0.001)return false;
      offset.set(-forward.x/horizontal*side,0,-forward.z/horizontal*side)
        .multiplyScalar(eyeHeight*(side===1?1.9:1.7))
        .addScaledVector(right,eyeHeight*(side===1?0.52:0.22));
      offset.y=Math.min(ceiling-eye.y,eyeHeight*(0.18-forward.y*side*0.75));
      const distance=offset.length();
      offset.divideScalar(distance);
      const allowed=clearance(eye,offset,distance);
      if(allowed<eyeHeight*0.38)return false;

      savedPosition.copy(camera.position);
      savedRotation.copy(camera.quaternion);
      camera.position.addScaledVector(offset,allowed);
      target.copy(eye);
      if(side===1)target.addScaledVector(forward,eyeHeight*2.5);
      target.y-=eyeHeight*(side===1?0.42:0.38);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      return true;
    },
    restore(camera){
      camera.position.copy(savedPosition);
      camera.quaternion.copy(savedRotation);
      camera.updateMatrixWorld();
    },
    aimMarker(element,camera,distance,point){
      if(point)target.fromArray(point);
      else target.copy(eye).addScaledVector(forward,distance);
      target.project(camera);
      element.style.left=(50+50*target.x)+'%';
      element.style.top=(50-50*target.y)+'%';
    },
  };
}

export function sceneCameraClearance(root){
  const ray=new THREE.Raycaster(),hits=[];
  return (origin,direction,distance)=>{
    root.updateMatrixWorld();
    ray.set(origin,direction);
    ray.far=distance+0.16;
    root.traverseVisible(object=>{
      if(!object.isMesh||object.isInstancedMesh||object.userData.cam)return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(!materials.some(mat=>mat.visible&&mat.depthWrite&&(!mat.transparent||mat.opacity>=0.9)))return;
      object.raycast(ray,hits);
    });
    let allowed=distance;
    for(const hit of hits)allowed=Math.min(allowed,Math.max(0,hit.distance-0.16));
    hits.length=0;
    return allowed;
  };
}
