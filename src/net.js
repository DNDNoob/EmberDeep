// Peer-to-peer rooms for Emberdeep. One player hosts, friends join with ?room=CODE.
// Browsers find each other through free public Nostr relays (Trystero), then talk directly
// over WebRTC, so there is no game server. ?net=local swaps in a BroadcastChannel so two
// tabs of the same browser can play together without any network (used for testing); voice
// still goes over real WebRTC between the tabs.
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

// Two tabs on one machine: messages over a BroadcastChannel, media over a direct
// RTCPeerConnection per pair of tabs that the channel introduces ("perfect negotiation").
function localRoom(code){
  const id = 'L' + Math.random().toString(36).slice(2, 10);
  const ch = new BroadcastChannel('emberdeep-room-' + code);
  const known = new Set(), pcs = new Map(), senders = new Map();
  const room = {id, onPeerJoin: null, onPeerLeave: null, onMessage: null, onPeerStream: null, onBinary: null};
  const post = (to, data) => ch.postMessage({from: id, to, data});
  const pcFor = pid => {
    let o = pcs.get(pid);
    if(o) return o;
    const pc = new RTCPeerConnection();
    o = {pc, making: false, polite: id < pid};
    pcs.set(pid, o);
    pc.onicecandidate = e => { if(e.candidate) post(pid, {k: '__ice', c: e.candidate.toJSON()}); };
    pc.ontrack = e => { if(room.onPeerStream) room.onPeerStream(e.streams[0] || new MediaStream([e.track]), pid); };
    pc.onnegotiationneeded = async () => {
      try{ o.making = true; await pc.setLocalDescription(); post(pid, {k: '__sdp', d: pc.localDescription.toJSON()}); }
      catch(e){} finally{ o.making = false; }
    };
    return o;
  };
  const signal = async (pid, m) => {
    const o = pcFor(pid), pc = o.pc;
    try{
      if(m.k === '__sdp'){
        const collide = m.d.type === 'offer' && (o.making || pc.signalingState !== 'stable');
        if(collide && !o.polite) return;
        await pc.setRemoteDescription(m.d);
        if(m.d.type === 'offer'){ await pc.setLocalDescription(); post(pid, {k: '__sdp', d: pc.localDescription.toJSON()}); }
      }else if(m.k === '__ice'){ try{ await pc.addIceCandidate(m.c); }catch(e){} }
    }catch(e){}
  };
  const meet = from => {
    if(known.has(from)) return;
    known.add(from);
    post(from, {k: '__hello'});
    if(room.onPeerJoin) room.onPeerJoin(from);
  };
  const drop = from => {
    if(!known.delete(from)) return;
    const o = pcs.get(from); if(o){ try{ o.pc.close(); }catch(e){} pcs.delete(from); }
    if(room.onPeerLeave) room.onPeerLeave(from);
  };
  ch.onmessage = e => {
    const m = e.data;
    if(!m || m.from === id || (m.to && m.to !== id)) return;
    const d = m.data;
    if(d && d.k === '__hello'){ meet(m.from); return; }
    if(d && d.k === '__bye'){ drop(m.from); return; }
    if(!known.has(m.from)) meet(m.from);
    if(d && (d.k === '__sdp' || d.k === '__ice')){ signal(m.from, d); return; }
    if(d && d.k === '__bin'){ if(room.onBinary) room.onBinary(d.b, d.meta, m.from); return; }
    if(room.onMessage) room.onMessage(d, m.from);
  };
  room.send = (data, to) => post(to || null, data);
  room.sendBinary = (buf, meta, to) => post(to || null, {k: '__bin', b: buf, meta});
  room.addStream = (stream, to) => {
    for(const pid of (to ? [to] : [...known])){
      const pc = pcFor(pid).pc, key = pid + '|' + stream.id;
      if(senders.has(key)) continue;
      senders.set(key, stream.getTracks().map(t => pc.addTrack(t, stream)));
    }
  };
  room.removeStream = stream => {
    for(const [key, list] of senders){
      const [pid, sid] = key.split('|');
      if(sid !== stream.id) continue;
      const o = pcs.get(pid);
      if(o) for(const s of list) try{ o.pc.removeTrack(s); }catch(e){}
      senders.delete(key);
    }
  };
  room.leave = () => {
    post(null, {k: '__bye'});
    for(const o of pcs.values()) try{ o.pc.close(); }catch(e){}
    ch.close();
  };
  addEventListener('pagehide', () => { try{ post(null, {k: '__bye'}); }catch(e){} });
  setTimeout(() => post(null, {k: '__hello'}), 30);
  return room;
}

function p2pRoom(code){
  const r = joinRoom({appId: APP_ID}, code);
  const act = r.makeAction('g'), bin = r.makeAction('b');
  const room = {id: selfId, onPeerJoin: null, onPeerLeave: null, onMessage: null, onPeerStream: null, onBinary: null};
  r.onPeerJoin = pid => { if(room.onPeerJoin) room.onPeerJoin(pid); };
  r.onPeerLeave = pid => { if(room.onPeerLeave) room.onPeerLeave(pid); };
  r.onPeerStream = (stream, pid) => { if(room.onPeerStream) room.onPeerStream(stream, pid); };
  act.onMessage = (data, meta) => { if(room.onMessage) room.onMessage(data, meta && meta.peerId); };
  bin.onMessage = (data, meta) => { if(room.onBinary) room.onBinary(data, meta && meta.metadata, meta && meta.peerId); };
  const quiet = p => { if(p && p.catch) p.catch(() => {}); };
  room.send = (data, to) => { try{ quiet(act.send(data, to ? {target: to} : undefined)); }catch(e){} };
  room.sendBinary = (buf, meta, to) => { try{ quiet(bin.send(buf, {target: to || undefined, metadata: meta})); }catch(e){} };
  room.addStream = (stream, to) => { try{ const ps = r.addStream(stream, to ? {target: to} : undefined); if(Array.isArray(ps)) ps.forEach(quiet); }catch(e){} };
  room.removeStream = stream => { try{ r.removeStream(stream); }catch(e){} };
  room.leave = () => { try{ r.leave(); }catch(e){} };
  return room;
}

// Returns {id, send(data, to?), sendBinary(buf, meta, to?), addStream(stream, to?), removeStream(stream),
//          leave(), onPeerJoin, onPeerLeave, onMessage, onPeerStream, onBinary}
export function openRoom(code, local){
  return local ? localRoom(code) : p2pRoom(code);
}
