// IndexedDB cache for baked NPC meshes (npc_kit.js bakeExport / bakePrime). Everything is wrapped: if storage is unavailable
// (private window, blocked, quota) the NPC is simply baked as before.
const DB = 'emberdeep-npc', ST = 'bakes';
function open() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  });
}
export const cacheStats = {readMs: -1};   // time the IndexedDB read itself took (event to event, not counting a busy main thread)
export async function loadBake(key) {
  try { const t0 = performance.now(), db = await open(); return await new Promise(res => { const q = db.transaction(ST).objectStore(ST).get(key); q.onsuccess = () => { cacheStats.readMs = performance.now() - t0; res(q.result || null); }; q.onerror = () => res(null); }); } catch (e) { return null; }
}
export async function saveBake(key, payload) {
  try {
    const db = await open();
    await new Promise(res => { const tx = db.transaction(ST, 'readwrite'), os = tx.objectStore(ST), pre = key.split(':')[0] + ':', ks = os.getAllKeys();
      ks.onsuccess = () => { for (const k of ks.result) if (k !== key && String(k).startsWith(pre)) os.delete(k); os.put(payload, key); }; tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => res(); });   // only the newest kit version per recipe is kept
  } catch (e) { /* no cache */ }
}
