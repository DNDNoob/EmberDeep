// The Blacksmith's weapons: five weapons, each with five skill paths (levels 1-5). From level 3 a path can take an augment that borrows
// a little of another weapon's ability. stats(L, A) turns path levels L[0..4] and augments A[0..4] (true when bought) into numbers that
// game.js reads; every field is optional and defaults to "off". Weapons, levels and augments are bought with gems and kept between runs.
//
// fields: dmg, cd (seconds between attacks), range (m), arc (degrees), multi (melee hits everything in the arc, not just the nearest),
//   kb (knockback m), stun (s), bleed / burn (damage per second for 4 / 3 s), mark (s marked: shown through walls, takes markBonus more),
//   root (chance) + rootT (s), smoke (s it loses your trail), slow (s at half speed), quakeR / quakeT (a stun around each hit),
//   shatter (damage multiplier against stunned, frozen or stone things), light (multiplier against shades, wisps and watchers),
//   lunge (m you dash forward), lungeSafe, parry (s after a swing in which a blow is blocked and the attacker stunned), parryQuake,
//   block (chance to shrug off a blow), blockBurn, spin (chance a swing becomes a full circle), spinStun (a spin stuns shades),
//   every (every Nth attack is doubled), step (m you step forward each swing), fuel / killFuel (torch on hit / kill), aura (dps within 1 m),
//   auraPulse (s between aura stun pulses), shot: {speed, pierce, blast, blastFrac, extraEvery}, jav: {every, dmg, blast},
//   killShards (damage to things around a monster you kill), killBlast, wallPin (s a monster knocked into a wall is pinned).
export const MAX_LV = 5, AUG_AT = 3, AUG_COST = 25;
export const LEVEL_COST = [4, 7, 11, 16, 22];

const lv = (L, i) => L[i] | 0;
export const WEAPONS = [
  {id: 'sword', name: 'Ashen Blade', cost: 15, col: '#c8b8a8', kind: 'melee',
    blurb: 'A quick, light sword. Fast slashes in a wide arc.',
    paths: [
      {name: 'Keen Edge', per: '+20% damage', aug: {name: 'Shatter', from: 'hammer', text: 'Half again as much damage to stunned, frozen or stone foes.'}},
      {name: 'Bloodletting', per: 'hits bleed: +0.3 damage a second for 4 s', aug: {name: 'Hunter\'s Mark', from: 'crossbow', text: 'Bleeding foes are marked: seen through walls, +15% damage.'}},
      {name: 'Flurry', per: '8% faster swings; at level 5 every 4th swing hits twice', aug: {name: 'Lunge', from: 'spear', text: 'Every swing carries you a step forward.'}},
      {name: 'Whirlwind', per: '+10% chance a swing becomes a full spin', aug: {name: 'Radiance', from: 'censer', text: 'Spins flare with light and stun shades.'}},
      {name: 'Parry', per: 'a longer window after a swing to block a blow and stun the attacker', aug: {name: 'Quake', from: 'hammer', text: 'A parry sends out a small shockwave.'}},
    ],
    stats: (L, A) => ({dmg: 2 * (1 + 0.2 * lv(L, 0)), cd: 0.45 * (1 - 0.08 * lv(L, 2)), range: 1.25, arc: 100, multi: true, kb: 0.15, stun: 0.25,
      shatter: A[0] ? 1.5 : 1, bleed: 0.3 * lv(L, 1), markOnBleed: !!A[1], step: A[2] ? 0.4 : 0, every: lv(L, 2) >= 5 ? 4 : 0,
      spin: 0.1 * lv(L, 3), spinStun: !!A[3], parry: lv(L, 4) ? 0.15 + 0.05 * lv(L, 4) : 0, parryQuake: !!A[4]})},
  {id: 'hammer', name: 'Stonebreaker Maul', cost: 20, col: '#8a8f99', kind: 'melee',
    blurb: 'A slow, crushing maul. Every blow knocks foes back and dazes them.',
    paths: [
      {name: 'Crush', per: '+25% damage', aug: {name: 'Bloodletting', from: 'sword', text: 'Blows also bleed (+0.6 damage a second).'}},
      {name: 'Quake', per: 'each blow stuns everything around it (wider and longer)', aug: {name: 'Smoke', from: 'censer', text: 'Quakes raise dust: those caught lose your trail.'}},
      {name: 'Shatter', per: '+20% damage to stunned, frozen or stone foes (pale statues!)', aug: {name: 'Piercing', from: 'crossbow', text: 'A foe you shatter sprays shards at those around it.'}},
      {name: 'Juggernaut', per: '+0.3 m knockback; slamming a foe into a wall stuns it longer', aug: {name: 'Pin', from: 'spear', text: 'A foe slammed into a wall is pinned there.'}},
      {name: 'Bulwark', per: '+8% chance to shrug off a blow', aug: {name: 'Ember', from: 'censer', text: 'A blow you shrug off sets the attacker burning.'}},
    ],
    stats: (L, A) => ({dmg: 4 * (1 + 0.25 * lv(L, 0)), cd: 1.1, range: 1.2, arc: 80, multi: true, kb: 0.9 + 0.3 * lv(L, 3), stun: 1.2,
      bleed: A[0] ? 0.6 : 0, quakeR: lv(L, 1) ? 0.5 + 0.25 * lv(L, 1) : 0, quakeT: 0.5 + 0.3 * lv(L, 1), quakeSmoke: !!A[1],
      shatter: 1 + 0.2 * lv(L, 2), killShards: A[2] ? 2 : 0, wallStun: 0.6 * lv(L, 3), wallPin: A[3] ? 2 : 0,
      block: 0.08 * lv(L, 4), blockBurn: !!A[4]})},
  {id: 'crossbow', name: 'Rustwind Crossbow', cost: 25, col: '#a0703a', kind: 'shot',
    blurb: 'Bolts that fly down a corridor. Hits from far away.',
    paths: [
      {name: 'Heavy Bolts', per: '+20% damage', aug: {name: 'Juggernaut', from: 'hammer', text: 'Bolts knock foes back.'}},
      {name: 'Quick Reload', per: '10% faster reload', aug: {name: 'Flurry', from: 'sword', text: 'Every third shot fires a second bolt.'}},
      {name: 'Piercing', per: 'bolts pass through one more foe', aug: {name: 'Pin', from: 'spear', text: 'The last foe a bolt passes through is pinned.'}},
      {name: 'Blast Bolts', per: 'bolts burst, hurting what is near (wider each level)', aug: {name: 'Ember', from: 'censer', text: 'Bursts set foes burning.'}},
      {name: 'Hunter\'s Mark', per: 'hit foes are marked longer and take +10% damage', aug: {name: 'Bloodletting', from: 'sword', text: 'Marked foes bleed.'}},
    ],
    stats: (L, A) => ({dmg: 3 * (1 + 0.2 * lv(L, 0)), cd: 0.9 * (1 - 0.1 * lv(L, 1)), range: 14, kb: A[0] ? 0.8 : 0.1, stun: 0.2,
      shot: {speed: 18, pierce: lv(L, 2), pinLast: !!A[2], blast: lv(L, 3) ? 0.4 + 0.15 * lv(L, 3) : 0, blastFrac: 0.4, extraEvery: A[1] ? 3 : 0},
      burn: A[3] && lv(L, 3) ? 0.5 : 0, mark: lv(L, 4) ? 3 + 2 * lv(L, 4) : 0, markBonus: 0.1 * lv(L, 4), bleed: A[4] && lv(L, 4) ? 0.4 : 0})},
  {id: 'spear', name: 'Thornwood Spear', cost: 20, col: '#7a5a34', kind: 'melee',
    blurb: 'A long spear. Strikes from further away, in a narrow line.',
    paths: [
      {name: 'Reach', per: '+0.3 m reach', aug: {name: 'Piercing', from: 'crossbow', text: 'Thrusts run through everything in the line.'}},
      {name: 'Pin', per: '+12% chance to pin a foe in place', aug: {name: 'Quake', from: 'hammer', text: 'Pinning a foe stuns those beside it.'}},
      {name: 'Sweep', per: 'a wider arc that hits everything in it', aug: {name: 'Whirlwind', from: 'sword', text: 'Sweeps sometimes come all the way round.'}},
      {name: 'Lunge', per: 'thrusts dash you forward (further each level)', aug: {name: 'Parry', from: 'sword', text: 'Nothing can hurt you mid-lunge.'}},
      {name: 'Javelin', per: 'every few thrusts also hurl a spectral spear (more often each level)', aug: {name: 'Blast Bolts', from: 'crossbow', text: 'Spectral spears burst where they strike.'}},
    ],
    stats: (L, A) => ({dmg: 2.6, cd: 0.7, range: 1.9 + 0.3 * lv(L, 0), arc: 25 + 15 * lv(L, 2), multi: !!A[0] || lv(L, 2) > 0, kb: 0.3, stun: 0.3,
      root: 0.12 * lv(L, 1), rootT: 1.5, rootQuake: !!A[1], spin: A[2] ? 0.2 : 0, lunge: lv(L, 3) ? 0.3 + 0.15 * lv(L, 3) : 0, lungeSafe: !!A[3],
      jav: lv(L, 4) ? {every: 6 - lv(L, 4), dmg: 2.5, blast: A[4] ? 0.7 : 0} : null})},
  {id: 'censer', name: 'Ember Censer', cost: 30, col: '#d08a30', kind: 'melee',
    blurb: 'A burning censer on a chain. Its holy light sears shades and wisps.',
    paths: [
      {name: 'Radiance', per: '+25% damage to shades, wisps and watchers', aug: {name: 'Hunter\'s Mark', from: 'crossbow', text: 'Shades you strike are marked.'}},
      {name: 'Smoke', per: 'struck foes lose your trail for longer', aug: {name: 'Pin', from: 'spear', text: 'Smoked foes are slowed too.'}},
      {name: 'Ember', per: 'hits burn: +0.25 damage a second for 3 s', aug: {name: 'Blast Bolts', from: 'crossbow', text: 'A burning foe bursts when it dies.'}},
      {name: 'Sacred Aura', per: 'foes within a metre of you take damage every second', aug: {name: 'Quake', from: 'hammer', text: 'The aura pulses, stunning foes around you every 6 s.'}},
      {name: 'Kindling', per: 'each hit feeds your torch', aug: {name: 'Flurry', from: 'sword', text: 'Swings come 20% faster.'}},
    ],
    stats: (L, A) => ({dmg: 1.6, cd: 0.6 * (A[4] ? 0.8 : 1), range: 1.55, arc: 140, multi: true, kb: 0.25, stun: 0.3, light: 2 * (1 + 0.25 * lv(L, 0)), markShade: !!A[0],
      smoke: lv(L, 1) ? 2 + lv(L, 1) : 0, slowSmoke: !!A[1], burn: 0.25 * lv(L, 2), killBlast: A[2] && lv(L, 2) ? 2.5 : 0,
      aura: 0.3 * lv(L, 3), auraPulse: A[3] && lv(L, 3) ? 6 : 0, fuel: 2 * lv(L, 4)})},
];
export const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
