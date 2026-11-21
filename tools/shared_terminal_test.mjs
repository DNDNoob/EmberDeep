import assert from 'node:assert/strict';
import {createTerminalSession} from '../src/shared-terminal.js';

const reachable=new Set(['host','guest']);
const host={sens:'1',brightness:'1.3',voice:'off'};
const guest={sens:'1.5',brightness:'1.6',voice:'off'};
const states=[];
const reader=createTerminalSession({
  playerId:()=> 'guest',read:()=>guest,
  apply:(key,value)=>{guest[key]=value},
});
const authority=createTerminalSession({
  playerId:()=> 'host',playerName:id=>id,read:()=>host,
  canReach:id=>reachable.has(id),apply:(key,value)=>{host[key]=value},
  publish:(session,revision)=>states.push([session,revision]),
});

authority.select('guest',{key:'sens',highlight:true,initial:guest});
authority.select('host',{key:'brightness',value:'2',initial:host});
authority.select('guest',{key:'sens',value:'1.9',initial:guest});
assert.equal(authority.session.owner,'guest');
assert.deepEqual(authority.session.selections.map(item=>item.actor),['guest','host']);
reader.update(...states[2]);
reader.update(...states[1]);
assert.deepEqual(guest,{sens:'1.9',brightness:'2',voice:'off'});
assert.deepEqual(host,{sens:'1',brightness:'1.3',voice:'off'});

authority.select('host',{key:'voice',value:'open',initial:host});
assert.equal(authority.session.values.voice,'off');
assert.equal(authority.session.selections[0].confirm,true);
reachable.delete('guest');
authority.select('host',{key:'brightness',value:'1.8',initial:host});
assert.equal(authority.session.owner,'host');
assert.equal(host.brightness,'1.8');
assert.equal(guest.brightness,'2');
reachable.delete('host');
authority.expire();
assert.equal(authority.session,null);
authority.select('guest',{key:'sens',value:'1.3',initial:guest});
assert.equal(authority.session,null);
console.log('Shared terminal ownership, concurrent edits, handoff and microphone consent passed.');
