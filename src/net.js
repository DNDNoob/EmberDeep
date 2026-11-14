// Peer-to-peer rooms for Emberdeep. One player hosts, friends join with ?room=CODE.
// Browsers find each other through free public Nostr relays (Trystero), then talk directly
// over WebRTC, so there is no game server. ?net=local swaps in a BroadcastChannel so two
// tabs of the same browser can play together without any network (used for testing).
import {joinRoom, selfId} from 'trystero';

const APP_ID = 'emberdeep-dndnoob-p2p-v1';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(){
  let s = '';
  const r = new Uint32Array(6);
  crypto.getRandomValues(r);
  for(const v of r) s += CODE_CHARS[v % CODE_CHARS.length];
  return s;
}

export function cleanCode(s){
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

// Two tabs on one machine, no network at all
function localRoom(code){
  const id = 'L' + Math.random().toString(36).slice(2, 10);
  const ch = new BroadcastChannel('emberdeep-room-' + code);
  const known = new Set();
  const room = {id, onPeerJoin: null, onPeerLeave: null, onMessage: null};
  const post = (to, data) => ch.postMessage({from: id, to, data});
  const meet = from => {
    if(known.has(from)) return;
    known.add(from);
    post(from, {k: '__hello'});
    if(room.onPeerJoin) room.onPeerJoin(from);
  };
  ch.onmessage = e => {
    const m = e.data;
    if(!m || m.from === id || (m.to && m.to !== id)) return;
    if(m.data && m.data.k === '__hello'){ meet(m.from); return; }
    if(m.data && m.data.k === '__bye'){
      if(known.delete(m.from) && room.onPeerLeave) room.onPeerLeave(m.from);
      return;
    }
    if(!known.has(m.from)) meet(m.from);
    if(room.onMessage) room.onMessage(m.data, m.from);
  };
  room.send = (data, to) => post(to || null, data);
  room.leave = () => { post(null, {k: '__bye'}); ch.close(); };
  addEventListener('pagehide', () => { try{ post(null, {k: '__bye'}); }catch(e){} });
  setTimeout(() => post(null, {k: '__hello'}), 30);
  return room;
}

function p2pRoom(code){
  const r = joinRoom({appId: APP_ID}, code);
  const act = r.makeAction('g');
  const room = {id: selfId, onPeerJoin: null, onPeerLeave: null, onMessage: null};
  r.onPeerJoin = pid => { if(room.onPeerJoin) room.onPeerJoin(pid); };
  r.onPeerLeave = pid => { if(room.onPeerLeave) room.onPeerLeave(pid); };
  act.onMessage = (data, meta) => { if(room.onMessage) room.onMessage(data, meta && meta.peerId); };
  room.send = (data, to) => {
    try{ const p = act.send(data, to ? {target: to} : undefined); if(p && p.catch) p.catch(() => {}); }
    catch(e){}
  };
  room.leave = () => { try{ r.leave(); }catch(e){} };
  return room;
}

// Returns {id, send(data, toPeerId?), leave(), onPeerJoin, onPeerLeave, onMessage}
export function openRoom(code, local){
  return local ? localRoom(code) : p2pRoom(code);
}
