// The bosses: every fifth floor is an arena with a boss in it instead of a maze. Floors 5, 10 ... 50 bring bosses 1 to 10, and after
// that they come round again, tougher each time (more health, a little quicker). Beating one breaks the seal on the way down, pays out
// gems and rare ingredients, and puts its trophy in the lobby for good. The fights themselves live in game.js; this file holds what
// they are, and the pure parts (which boss is where, how a cycle scales it, the dance charts) so they can be tested on their own.
export const BOSSES = [
  {id: 'rat', name: 'King Ratbag', title: 'Lord of the Sewers', arena: 'The Sewer Throne', bi: 6, hp: 70, rad: 0.55, gems: 25, col: '#9a8270',
    intro: 'Something enormous is gnawing on the dark.', taunt: 'SQUEEEEAK!'},
  {id: 'boogie', name: 'The Boogie Man', title: 'He only respects the dance', arena: 'The Disco Pit', bi: 7, hp: 420, rad: 0.4, gems: 30, col: '#ff4fd8',
    intro: 'A disco ball turns in the dark. Somebody is waiting for a partner.', taunt: 'DANCE OFF!'},
  {id: 'gloop', name: 'The Gloop', title: 'It splits when it is hurt', arena: 'The Ooze Pit', bi: 1, hp: 50, rad: 0.7, gems: 35, col: '#6ee05a',
    intro: 'The floor is wet, and the wet is moving.', taunt: 'BLORP.'},
  {id: 'dill', name: 'The Big Dill', title: 'Cool as a cucumber', arena: 'The Cold Frame', bi: 2, hp: 90, rad: 0.42, gems: 40, col: '#4fa83a',
    intro: 'It is very cold in here, and it smells of vinegar.', taunt: 'Stay frosty.'},
  {id: 'tallow', name: 'Mother Tallow', title: 'She blows out every flame', arena: 'The Wax Chapel', bi: 5, hp: 100, rad: 0.45, gems: 45, col: '#f0d9a0',
    intro: 'Hush now. Hush. Let mother put out the light.', taunt: 'Shhhhhh...'},
  {id: 'mimic', name: 'The Grand Mimic', title: 'Not every chest is a chest', arena: 'The Counting House', bi: 0, hp: 100, rad: 0.45, gems: 60, col: '#d9a441',
    intro: 'Treasure! Heaps of it. Look how still it sits.', taunt: 'CHOMP CHOMP CHOMP'},
  {id: 'vac', name: 'Sir Suckalot', title: 'He picks up everything', arena: 'The Showroom', bi: 4, hp: 110, rad: 0.42, gems: 55, col: '#c0392b',
    intro: 'Somewhere a motor whines, louder and louder.', taunt: 'VRRRRRRRMMMMMM'},
  {id: 'mime', name: 'The Mime', title: 'Not a sound', arena: 'The Silent Stage', bi: 0, hp: 120, rad: 0.32, gems: 60, col: '#f2f2f2',
    intro: '...', taunt: '...'},
  {id: 'cuckoo', name: 'The Cuckoo Clock', title: 'Do not move when it strikes', arena: 'The Clockworks', bi: 6, hp: 130, rad: 0.55, gems: 70, col: '#8a5a2b',
    intro: 'Tick. Tock. Tick. Tock. Freeze when it calls.', taunt: 'CUCKOO!'},
  {id: 'heart', name: 'The Ember Heart', title: 'The burning heart of the deep', arena: 'The Heart of the Deep', bi: 3, hp: 200, rad: 0.62, gems: 100, col: '#ff6a1a',
    intro: 'The whole deep is beating, like a drum, like a heart.', taunt: 'BA-BOOM.'},
];
// the Boogie Man's 420 (more with more players): only your half of each round hurts him, and rounds 1 and 2 hold at most 84 + 168 damage
// even hitting every arrow perfectly, so he always lasts into round 3, and usually to round 4
export const BOSS = Object.fromEntries(BOSSES.map((b, i) => [b.id, {...b, i}]));

// which boss guards a depth: floors 5, 10, 15 ... (bosses 1-10), then round again. cyc counts the times round (0 the first time).
export function bossAt(depth) {
  depth = depth | 0;
  if (depth < 5 || depth % 5) return null;
  const n = depth / 5 - 1;
  return {i: n % BOSSES.length, cyc: Math.floor(n / BOSSES.length)};
}
// tougher each time round: 60% more health and 10% quicker a cycle, and more gems
export const bossHp = (i, cyc) => Math.round(BOSSES[i].hp * (1 + 0.6 * cyc));
export const bossSpeed = cyc => 1 + 0.1 * Math.min(cyc, 6);
export const bossGems = (i, cyc) => Math.round(BOSSES[i].gems * (1 + 0.5 * cyc));

// ---- the Boogie Man's dance charts: arrows in four lanes (0 left, 1 down, 2 up, 3 right), the same for everyone with the same seed.
// Round 1 is a steady quarter-note walk; later rounds add eighth notes, jumps (two lanes at once) and a quicker tempo.
export function danceChart(seed, round) {
  let a = (seed >>> 0) || 1;
  const rnd = () => {a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296};
  const bpm = Math.min(96 + 14 * (round - 1), 168), beat = 60 / bpm, bars = 6 + Math.min(round, 4);
  const notes = [];let last = -1;
  for (let b = 0; b < bars * 4; b++) {
    const t = b * beat;
    let lane = (rnd() * 4) | 0;if (lane === last && rnd() < 0.7) lane = (lane + 1 + ((rnd() * 3) | 0)) % 4;last = lane;
    notes.push({t, lane});
    if (round >= 2 && rnd() < 0.12 + 0.06 * round) {let l2 = (lane + 1 + ((rnd() * 3) | 0)) % 4;notes.push({t, lane: l2})}   // a jump
    if (round >= 2 && b % 2 === 1 && rnd() < 0.2 + 0.08 * round) notes.push({t: t + beat / 2, lane: (lane + 2) % 4});           // an eighth
  }
  notes.sort((p, q) => p.t - q.t || p.lane - q.lane);
  return {bpm, beat, len: bars * 4 * beat, notes};
}
// how a press lines up with a note: 'perfect', 'good' or null (a miss)
export const JUDGE = {perfect: 0.075, good: 0.15};
export function judge(dt) {dt = Math.abs(dt);return dt <= JUDGE.perfect ? 'perfect' : dt <= JUDGE.good ? 'good' : null}
