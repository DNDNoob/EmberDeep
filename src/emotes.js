// Dance emotes: T (or the DANCE button) starts one, T again moves on to the next, and walking, jumping or swinging stops it.
// Each dance is a pose for any moment of it: where the hands are, how the body turns, leans, bounces and bends its knees, and how far
// each leg steps. buildPlayer in game.js draws a Delver in that pose, so everyone in the game sees the same dance.
// Positions are in the player model's own units (x forward, y up, z to the right; the shoulders sit at y 0.225, z +-0.1).
const TAU = Math.PI * 2;
const sq = x => (Math.sin(x) >= 0 ? 1 : -1);
export const BPM = 120;
export const EMOTES = [
  {id: 'disco', name: 'Disco Fever', pose(b) {   // point up to the corner of the sky, then down across, hand on hip
    const up = Math.floor(b) % 2 === 0, k = Math.min(1, (b % 1) * 4);
    return {lift: Math.abs(Math.sin(Math.PI * b)) * 0.03, turn: 0.35 * Math.sin(b * Math.PI / 2), lean: (up ? 0.1 : -0.06) * k, bend: 0, crouch: 0.1 + 0.08 * Math.abs(Math.sin(Math.PI * b)),
      legs: [0.25 * Math.sin(Math.PI * b), -0.25 * Math.sin(Math.PI * b)], L: [0.0, 0.07, -0.17], R: up ? [0.07, 0.5, 0.26] : [0.16, 0.02, -0.06]};
  }},
  {id: 'robot', name: 'The Robot', pose(b) {   // stiff arms, jerking up and down in turn, the body turning in sharp little steps
    const s = sq(Math.PI * b), step = Math.floor(b / 2) % 4;
    return {lift: 0, turn: [0, 0.5, 0, -0.5][step], lean: 0, bend: 0.04, crouch: 0.05,
      legs: [0, 0], L: [0.2, 0.13 + 0.09 * s, -0.12], R: [0.2, 0.13 - 0.09 * s, 0.12], head: 0.15 * s};
  }},
  {id: 'floss', name: 'The Floss', pose(b) {   // straight arms swinging side to side, one in front and one behind, hips the other way
    const q = Math.sin(Math.PI * b), f = sq(Math.PI * b * 2);
    return {lift: 0.01, turn: 0, lean: -0.12 * q, bend: 0, crouch: 0.06,
      legs: [0.1 * q, -0.1 * q], L: [0.11 * f, 0.03, -0.1 + 0.13 * q], R: [-0.11 * f, 0.03, 0.1 + 0.13 * q]};
  }},
  {id: 'sprinkler', name: 'The Sprinkler', pose(b) {   // a hand behind the head, the other arm out front ticking round, then sweeping back
    const n = Math.floor(b * 2) % 6, a = n < 5 ? -0.7 + 0.35 * n : 0.7 - 1.4 * ((b * 2) % 1);
    return {lift: 0, turn: a * 0.45, lean: 0, bend: 0.05, crouch: 0.18 + 0.05 * Math.abs(Math.sin(TAU * b)),
      legs: [0.12, -0.12], L: [-0.05, 0.38, -0.05], R: [0.26 * Math.cos(a), 0.27, 0.1 + 0.26 * Math.sin(a)]};
  }},
  {id: 'jump', name: 'Hype Jumps', pose(b) {   // a jump on every beat, both fists pumping
    const p = b % 1, air = Math.sin(Math.PI * Math.min(1, p / 0.7)), land = p > 0.7 ? Math.sin(Math.PI * (p - 0.7) / 0.3) : 0;
    return {lift: 0.13 * (p < 0.7 ? air : 0), turn: 0.15 * Math.sin(Math.PI * b / 2), lean: 0, bend: 0.06, crouch: 0.3 * land,
      legs: [0, 0], L: air > 0.3 ? [0.05, 0.48, -0.14] : [0.13, 0.26, -0.15], R: air > 0.3 ? [0.05, 0.48, 0.14] : [0.13, 0.26, 0.15]};
  }},
  {id: 'shuffle', name: 'The Shuffle', pose(b) {   // quick heel-toe steps, arms loose at the sides, the body turning back and forth
    const s = Math.sin(TAU * b);
    return {lift: Math.abs(s) * 0.015, turn: 0.4 * Math.sin(Math.PI * b / 2), lean: 0.05 * s, bend: 0.08, crouch: 0.12,
      legs: [0.45 * s, -0.45 * s], L: [0.04 - 0.08 * s, 0.05, -0.15], R: [0.04 + 0.08 * s, 0.05, 0.15]};
  }},
];
export const emotePose = (id, t) => {const e = EMOTES[id]; return e ? e.pose(Math.max(0, t) * BPM / 60) : null};
