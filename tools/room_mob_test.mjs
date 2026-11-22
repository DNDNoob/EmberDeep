import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ROOM_MOBS,spotted} from '../src/room-mobs.js';
import {DOOR_KINDS} from '../src/rooms.js';
import {roomMobExhibit} from '../src/room-mob-exhibits.js';

const eye=[0,1.6,0],forward=[0,0,-1];
assert.equal(spotted(eye,forward,[0,1.6,-4]),true);
assert.equal(spotted(eye,forward,[0.5,1.7,-3]),true);
assert.equal(spotted(eye,forward,[0,1.6,3]),false);
assert.equal(spotted(eye,forward,[4,1.6,-1]),false);
assert.equal(spotted(eye,forward,[0,1.6,-13]),false);
assert.equal(spotted(eye,forward,[0,1.6,-4],3),false);
assert.equal(spotted(eye,[0,0,-2],[0,1.6,-2]),true);

assert.deepEqual(Object.keys(ROOM_MOBS),['guest','teens','moose','goose','mother']);
for(const [id,mob] of Object.entries(ROOM_MOBS)){
  assert.equal(typeof mob.name,'string');
  assert.ok(mob.name.length>1,id);
  assert.ok(Object.hasOwn(DOOR_KINDS,mob.room),id+' room');
}

const box=new THREE.Box3(),size=new THREE.Vector3(),spot=new THREE.Vector3();
for(const id of Object.keys(ROOM_MOBS)){
  const model=roomMobExhibit(id);
  assert.equal(typeof model.userData.pose,'function',id);
  model.userData.pose(1.7);
  model.updateMatrixWorld(true);
  let meshes=0;
  model.traverse(obj=>{
    if(!obj.isMesh)return;
    meshes++;
    assert.ok(obj.geometry.getAttribute('position').count>0,id);
    obj.getWorldPosition(spot);
    assert.ok(Number.isFinite(spot.x+spot.y+spot.z),id+' finite');
  });
  assert.ok(meshes>3,id);
  box.setFromObject(model);box.getSize(size);
  assert.ok(size.y>0.7&&size.y<1.42,id+' height '+size.y.toFixed(2));
  assert.ok(size.x<1.42&&size.z<1.55,id+' footprint '+size.x.toFixed(2)+'x'+size.z.toFixed(2));
  assert.ok(box.min.y>=-0.02,id+' base '+box.min.y.toFixed(2));
}
console.log('room mob archive ok');
