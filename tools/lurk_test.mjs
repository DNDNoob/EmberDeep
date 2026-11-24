// node tools/lurk_test.mjs
import assert from 'node:assert/strict';
import {lurkLooking,lurkStep} from '../src/lurk.js';

const open=()=>true;
const los=()=>true;
const world=(rand=()=>0)=>({los,open,rand});
const player=(yaw=0)=>({x:0,z:0,yaw,down:false});

// Maze forward is (cos yaw, sin yaw). Looking along +X sees someone standing there.
assert.equal(lurkLooking({x:2,z:0},player(0)),true);
assert.equal(lurkLooking({x:0,z:2},player(0)),false);
assert.equal(lurkLooking({x:2,z:0},{x:0,z:0,yaw:0,down:true}),false);
assert.equal(lurkLooking({x:20,z:0},player(0)),false);

const n={x:2.5,z:1.5,gx:3,gy:1,px:-1,py:-1,stare:0,aggro:false,face:0,hitT:0};
// A glance is not enough, and looking away spends the stare quickly.
lurkStep(n,0.4,player(0),world());
assert.equal(n.aggro,false);
assert.ok(n.stare>0.3&&n.stare<0.5);
lurkStep(n,0.3,{x:0,z:0,yaw:Math.PI,down:false},world());
assert.ok(n.stare<0.1,'stare should decay when you look away');

// Holding the look past the threshold makes it hunt, and it stays hunting.
n.stare=2;
lurkStep(n,0.2,player(0),world());
assert.equal(n.aggro,true);
const before=n.x;
lurkStep(n,0.2,{x:0,z:0,yaw:Math.PI,down:false},world());
assert.equal(n.aggro,true);
assert.ok(n.x<before,'an aggro lurk steps toward the player');

// Contact hurts once, then waits out the cooldown.
n.x=0.2;n.z=0;n.hitT=0;
const hit=lurkStep(n,0.05,player(0),world());
assert.equal(hit.hurt,true);
assert.equal(lurkStep(n,0.05,player(0),world()).hurt,false);

// It will not walk into a closed cell, and it does wander when ignored.
const boxed={x:2.5,z:2.5,gx:2,gy:2,px:-1,py:-1,stare:0,aggro:false,face:0,hitT:0};
const walled={los:()=>false,open:(x,z)=>!(x===3&&z===2),rand:()=>0};
lurkStep(boxed,0.5,{x:0,z:0,yaw:0,down:true},walled);
assert.ok(Math.floor(boxed.x)!==3||Math.floor(boxed.z)!==2);
assert.equal(boxed.aggro,false);

console.log('lurk rules ok');
