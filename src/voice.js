// Voice for Emberdeep: your microphone, every friend's voice placed in the maze through
// Web Audio (volume, left/right, a muffling filter behind walls), short clips of what you
// say (for the mimic), and playback of a clip from any point in the maze.
export function createVoice(getAC){
  const V = {stream: null, mode: 'off', on: false, peers: new Map(), out: null, level: 0, onClip: null, cache: new Map()};
  let micAn = null, micBuf = null, rec = null, recT = 0, quietT = 0, recPeak = 0, recChunks = [];

  const ac = () => getAC();
  function outNode(){
    const a = ac(); if(!a) return null;
    if(!V.out){ V.out = a.createGain(); V.out.gain.value = 1; V.out.connect(a.destination); }
    return V.out;
  }
  const rms = (an, buf) => { an.getFloatTimeDomainData(buf); let s = 0; for(let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };

  // ask for the microphone; resolves true when it is ready
  V.enable = async mode => {
    V.mode = mode;
    if(V.stream) return true;
    try{
      V.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}, video: false});
    }catch(e){ V.mode = 'off'; return false; }
    const a = ac();
    if(a){ const src = a.createMediaStreamSource(V.stream); micAn = a.createAnalyser(); micAn.fftSize = 1024; micBuf = new Float32Array(micAn.fftSize); src.connect(micAn); }
    V.transmit(false);
    return true;
  };
  V.disable = () => {
    V.mode = 'off';
    if(rec && rec.state !== 'inactive') try{ rec.stop(); }catch(e){}
    rec = null;
    if(V.stream) for(const t of V.stream.getTracks()) t.stop();
    V.stream = null; micAn = null; V.on = false;
  };
  V.transmit = on => {
    V.on = !!on && !!V.stream;
    if(V.stream) for(const t of V.stream.getAudioTracks()) t.enabled = V.on;
  };

  // a friend's voice arrives
  V.attach = (id, stream) => {
    V.detach(id);
    const a = ac(), out = outNode(); if(!a || !out) return;
    // Chrome only pulls a remote WebRTC stream into Web Audio while a media element plays it
    const el = new Audio(); el.muted = true; el.srcObject = stream; el.play().catch(() => {});
    const src = a.createMediaStreamSource(stream), filt = a.createBiquadFilter(), gain = a.createGain(), pan = a.createStereoPanner(), an = a.createAnalyser();
    filt.type = 'lowpass'; filt.frequency.value = 20000; an.fftSize = 512;
    src.connect(an); src.connect(filt); filt.connect(gain); gain.connect(pan); pan.connect(out);
    V.peers.set(id, {el, src, filt, gain, pan, an, buf: new Float32Array(an.fftSize), lvl: 0});
  };
  V.detach = id => {
    const n = V.peers.get(id); if(!n) return;
    try{ n.src.disconnect(); n.pan.disconnect(); }catch(e){}
    try{ n.el.srcObject = null; }catch(e){}
    V.peers.delete(id);
  };
  const setPlace = (n, p) => {
    const a = ac(), t = a.currentTime;
    n.gain.gain.setTargetAtTime(p.gain, t, 0.08);
    n.pan.pan.setTargetAtTime(p.pan, t, 0.08);
    n.filt.frequency.setTargetAtTime(p.muffle ? 900 : 20000, t, 0.1);
  };
  // gain 0..1, pan -1..1, muffle true behind walls
  V.place = (id, p) => { const n = V.peers.get(id); if(n && ac()) setPlace(n, p); };
  V.speaking = id => { const n = V.peers.get(id); return !!n && n.lvl > 0.02; };

  // play a recorded clip from a spot in the maze; returns a handle to move it
  V.playClip = async (key, buf, p) => {
    const a = ac(), out = outNode(); if(!a || !out) return null;
    let ab = V.cache.get(key);
    if(!ab){ try{ ab = await a.decodeAudioData(buf.slice(0)); }catch(e){ return null; } V.cache.set(key, ab); }
    const src = a.createBufferSource(), filt = a.createBiquadFilter(), gain = a.createGain(), pan = a.createStereoPanner();
    src.buffer = ab; filt.type = 'lowpass';
    src.connect(filt); filt.connect(gain); gain.connect(pan); pan.connect(out);
    const h = {filt, gain, pan, done: false, dur: ab.duration};
    setPlace(h, p);
    src.onended = () => { h.done = true; try{ pan.disconnect(); }catch(e){} };
    src.start();
    return h;
  };
  V.placeClip = (h, p) => { if(h && !h.done && ac()) setPlace(h, p); };

  // every frame: levels for the speaking icons, and cut what you say into short clips
  V.tick = dt => {
    for(const n of V.peers.values()) n.lvl = n.lvl * 0.85 + rms(n.an, n.buf) * 0.15;
    if(!micAn){ V.level = 0; return; }
    const lv = rms(micAn, micBuf); V.level = lv;
    if(!V.onClip || typeof MediaRecorder === 'undefined') return;
    const loud = V.on && lv > 0.03;
    if(!rec && loud){
      try{
        recChunks = []; recT = 0; quietT = 0; recPeak = 0;
        rec = new MediaRecorder(V.stream);
        rec.ondataavailable = e => { if(e.data && e.data.size) recChunks.push(e.data); };
        const r = rec;
        rec.onstop = async () => {
          const len = r._len || 0, peak = r._peak || 0;
          if(len < 0.6 || !recChunks.length) return;
          const blob = new Blob(recChunks, {type: r.mimeType || 'audio/webm'});
          const buf = await blob.arrayBuffer();
          if(V.onClip) V.onClip(buf, len, peak, blob.type);
        };
        rec.start();
      }catch(e){ rec = null; }
    }else if(rec){
      recT += dt; recPeak = Math.max(recPeak, lv);
      quietT = loud ? 0 : quietT + dt;
      if(quietT > 0.7 || recT > 4.5 || !V.on){
        rec._len = recT - Math.min(quietT, 0.7); rec._peak = recPeak;
        try{ rec.stop(); }catch(e){}
        rec = null;
      }
    }
  };
  return V;
}
