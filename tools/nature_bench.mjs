import {NATURE_KINDS,bakeProp} from '../src/nature.js';
const kinds=process.argv[2]?process.argv[2].split(','):NATURE_KINDS;
for(const k of kinds){const r=bakeProp(k,+process.argv[3]||1);const s=r.stats;console.log(k.padEnd(10),'near',s.tris,'far',s.farTris,'raw',s.rawTris,'ms',s.ms.toFixed(0),'(sculpt',s.sculptMs.toFixed(0),'near',s.nearMs.toFixed(0),'far',s.farMs.toFixed(0)+')')}
