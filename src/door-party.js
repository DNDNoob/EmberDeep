// The host keeps one record per physical door. Array order is admission order.
export const TURN_ROOMS=new Set(['kiln','moose','bathroom']);
export const ONCE_ROOMS=new Set(['mirror','fall','galaxy']);

export function createDoorParty(kind){
  return {kind,first:null,members:new Map(),invites:new Map(),turn:0,done:false,shared:null,train:null,trainId:0,contributors:new Set()};
}

export function doorLeader(room){
  if(room.kind==='neonride')return [...room.members.keys()].find(id=>!room.train?.includes(id))??null;
  if(ONCE_ROOMS.has(room.kind))return room.done?null:room.first;
  return room.members.keys().next().value??null;
}

export function admitToDoor(room,id,ticket){
  if(room.members.has(id))return false;
  room.first??=id;
  room.members.set(id,ticket);
  room.invites.delete(id);
  return true;
}

export function leaveDoorParty(room,id){
  const lead=doorLeader(room)===id;
  if(!room.members.delete(id))return false;
  if(lead&&TURN_ROOMS.has(room.kind)){room.turn++;room.shared=null}
  if(lead&&ONCE_ROOMS.has(room.kind))room.done=true;
  if(room.train){
    room.train=room.train.map(rider=>rider===id?null:rider);
    if(!room.train.some(Boolean))room.train=null;
  }
  return true;
}

export function passDoorTurn(room,id){
  if(!TURN_ROOMS.has(room.kind)||doorLeader(room)!==id||room.members.size<2)return false;
  const ticket=room.members.get(id);
  room.members.delete(id);
  room.members.set(id,ticket);
  room.turn++;
  room.shared=null;
  return true;
}
