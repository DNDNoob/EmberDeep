// Potions: 14 ingredients found in the maze and 100 potions in four tiers.
//   tier 1: two ingredients     tier 2: two tier-1 potions     tier 3: two tier-2 potions     tier 4: two tier-3 potions
// A pair that is not a recipe brews Murky Sludge. Every potion does something when drunk (or splashed on a player) and something when
// it splashes a monster; the effects themselves live in game.js (POT_FX), this file is only the data and the recipe book.

export const INGREDIENTS = [
  {id: 'glowcap', name: 'Glowcap', col: [0.55, 1.0, 0.7], where: 'everywhere'},
  {id: 'moss', name: 'Cave Moss', col: [0.35, 0.7, 0.25], where: 'everywhere, most in mossy halls'},
  {id: 'ember', name: 'Ember Salt', col: [1.0, 0.45, 0.15], where: 'the Cinder Warrens'},
  {id: 'frost', name: 'Frost Lichen', col: [0.6, 0.85, 1.0], where: 'the Frostvault'},
  {id: 'bone', name: 'Bone Meal', col: [0.92, 0.88, 0.78], where: 'the Bone Galleries'},
  {id: 'rust', name: 'Rust Flakes', col: [0.65, 0.3, 0.12], where: 'the Rustworks'},
  {id: 'glimmer', name: 'Glimmer Crystal', col: [0.75, 0.45, 1.0], where: 'the Glimmer Veins'},
  {id: 'silk', name: 'Spider Silk', col: [0.95, 0.95, 0.95], where: 'dead ends'},
  {id: 'water', name: 'Still Water', col: [0.3, 0.55, 0.9], where: 'everywhere, most on wet floors'},
  {id: 'bat', name: 'Bat Wing', col: [0.3, 0.22, 0.25], where: 'anywhere, rare'},
  {id: 'shade', name: 'Shade Dust', col: [0.5, 0.3, 0.7], where: 'flash a shade'},
  {id: 'wisp', name: 'Wisp Essence', col: [0.4, 0.65, 1.0], where: 'flash a wisp'},
  {id: 'statue', name: 'Statue Chip', col: [0.7, 0.68, 0.62], where: 'flash a pale statue'},
  {id: 'pretzel', name: 'Pretzel Crumbs', col: [0.75, 0.45, 0.15], where: 'the Crunch Gremlin drops them'},
];
const ING = Object.fromEntries(INGREDIENTS.map((g, i) => [g.id, i]));

// [id, name, tier, colour, recipe (two ingredient ids for tier 1, two potion ids above it), drink, monster]
const T = [
  // ---------- tier 1: two ingredients ----------
  [1, 'Mending Tonic', 1, '#e8506a', ['moss', 'water'], '+1 heart.', 'Shakes off a stun at once.'],
  [2, 'Lamp Oil', 1, '#ffa030', ['ember', 'water'], 'Refills your torch.', 'A wisp gorges and drifts off; a shade glows.'],
  [3, 'Quickstep', 1, '#ffe040', ['bat', 'glowcap'], '+30% speed for 45 s.', '+30% speed.'],
  [4, 'Molasses', 1, '#7a4a20', ['moss', 'silk'], 'Half speed for 20 s.', 'Half speed for 20 s.'],
  [5, 'Frostbite', 1, '#9ad8ff', ['frost', 'water'], 'Frozen solid for 3 s.', 'Frozen for 6 s.'],
  [6, 'Cinderburst', 1, '#ff4a10', ['ember', 'rust'], 'You catch fire: a heart unless warded.', 'Flees while burning, then stunned.'],
  [7, 'Glowdraught', 1, '#c8ffa0', ['glowcap', 'water'], 'You glow: double light for 60 s.', 'Glows, seen from far away and on the map.'],
  [8, 'Shadow Ink', 1, '#3a2050', ['shade', 'water'], 'Monsters notice you at half the distance.', 'Nearly invisible.'],
  [9, 'Featherdrop', 1, '#f0f0ff', ['bat', 'moss'], 'High, floaty jumps.', 'Floats and drifts, poor at corners.'],
  [10, 'Lead Belly', 1, '#555560', ['rust', 'bone'], 'Can\'t jump, slower, can\'t be knocked back.', 'Slow and heavy; wisps sink.'],
  [11, 'Spider Snare', 1, '#e8e8e0', ['silk', 'bone'], 'Webbed in place for 3 s.', 'Webbed for 8 s.'],
  [12, 'Slick', 1, '#60a0c0', ['silk', 'water'], 'No grip: you slide.', 'Slides past corners and overshoots.'],
  [13, 'Sleep Dust', 1, '#b090e0', ['moss', 'shade'], 'Asleep for 4 s.', 'Asleep for 12 s.'],
  [14, 'Smelling Salts', 1, '#f0f0c0', ['ember', 'bone'], 'Clears stun, sleep and chill; gets a downed friend up.', 'Wakes it, and it goes for the thrower.'],
  [15, 'Calm Tea', 1, '#a0d080', ['moss', 'glowcap'], 'Steady nerves: no screen shake.', 'Stops hunting for 15 s.'],
  [16, 'Fury Brew', 1, '#d02020', ['ember', 'bat'], 'Free sprinting, but you can\'t stop running.', 'Frenzied and faster.'],
  [17, 'Shrinking Draught', 1, '#ff80c0', ['silk', 'glimmer'], 'Tiny for 60 s.', 'Tiny: half speed, its touch only chills.'],
  [18, 'Growth Tonic', 1, '#80c040', ['bone', 'glimmer'], 'Huge for 60 s.', 'Huge and slow.'],
  [19, 'Pug Juice', 1, '#d8b070', ['bone', 'pretzel'], 'A pug for 60 s.', 'A harmless pug.'],
  [20, 'Rat Rum', 1, '#8a8070', ['pretzel', 'water'], 'A rat for 60 s.', 'A rat that runs away.'],
  [21, 'Fade', 1, '#c0c0ff', ['shade', 'wisp'], 'Invisible for 20 s.', 'Invisible but for a shimmer.'],
  [22, 'Revealing Dust', 1, '#ffffa0', ['glowcap', 'glimmer'], 'See creatures through walls for 30 s.', 'Everyone sees it through walls.'],
  [23, 'Hush', 1, '#404060', ['shade', 'silk'], 'Silent footsteps.', 'Makes no sound.'],
  [24, 'Loudmouth', 1, '#ff6060', ['bat', 'rust'], 'Thundering footsteps that draw monsters.', 'Screeches, easy to track.'],
  [25, 'Stoneskin', 1, '#9a968c', ['statue', 'water'], 'The next hit is blocked; 20% slower.', 'Stone for 10 s.'],
  [26, 'Statue Stare', 1, '#d0ccc0', ['statue', 'glowcap'], 'What you look at slows down.', 'Moves only when nobody looks.'],
  [27, 'Wisp Bane', 1, '#4060ff', ['wisp', 'ember'], 'Wisps can\'t drink your flame.', 'A wisp fizzles out; a shade\'s chill weakens.'],
  [28, 'Wisp Lure', 1, '#80c0ff', ['wisp', 'glowcap'], 'Wisps flock to you.', 'Wisps flock to it.'],
  [29, 'Decoy Musk', 1, '#a07040', ['pretzel', 'shade'], 'Monsters follow your trail.', 'The others hunt it instead.'],
  [30, 'Repellent', 1, '#60ff90', ['rust', 'shade'], 'Shades keep away for 30 s.', 'Other monsters keep away from it.'],
  [31, 'Hiccup Tonic', 1, '#ffc0e0', ['bat', 'water'], 'Random little hops.', 'Lurches about.'],
  [32, 'Sneezing Powder', 1, '#e0d0a0', ['rust', 'pretzel'], 'Sneezes stop you now and then.', 'Sneezes stop it now and then.'],
  [33, 'Bouncy Bones', 1, '#ffffff', ['bone', 'bat'], 'Knockbacks bounce you harmlessly.', 'Ricochets off walls.'],
  [34, 'Magnet Draught', 1, '#a03030', ['rust', 'glimmer'], 'Gems and items fly to you.', 'Pulls nearby monsters into a clump.'],
  [35, 'Gem Sense', 1, '#ffd040', ['glimmer', 'water'], 'Gems show on the map.', 'Crystallises and sheds 3 gems.'],
  [36, 'Warmth', 1, '#ff9060', ['ember', 'frost'], 'Immune to chill and frost.', 'Can\'t be frozen.'],
  [37, 'Echo Draught', 1, '#80a0c0', ['bat', 'statue'], 'A ping maps the halls and creatures near you.', 'Disoriented: loses your trail.'],
  [38, 'Blink', 1, '#a0f0ff', ['wisp', 'bat'], 'Teleport 4 m forward.', 'Teleported 4 m away from the splash.'],
  [39, 'Corrode', 1, '#80a040', ['rust', 'water'], 'Your ward crumbles.', 'Weakened: stuns last twice as long.'],
  [40, 'Murky Sludge', 1, '#5a5030', null, 'Nothing.', 'Slightly slowed.'],
  // ---------- tier 2: two tier-1 potions ----------
  [41, 'Windrunner', 2, '#e0ff80', [3, 9], 'Fast, with long jumps.', 'Zips about and overshoots.'],
  [42, 'Deep Freeze', 2, '#60c0ff', [5, 4], 'Frozen 6 s, then slowed.', 'Frozen 15 s; fire shatters it for good.'],
  [43, 'Dragonfire', 2, '#ff6000', [6, 16], 'You breathe fire for 20 s.', 'Bursts into flame and stuns what it touches.'],
  [44, 'Daybreak', 2, '#fff0a0', [7, 2], 'Blinding aura: shades won\'t come within 3 m.', 'Blazes, stunning nearby shades.'],
  [45, 'Nightshade', 2, '#201030', [8, 21], 'Unseen for 30 s.', 'Unseen, and blind: it wanders.'],
  [46, 'Dreamless Sleep', 2, '#9070c0', [13, 15], 'A 6 s sleep that fully heals you.', 'Asleep for 30 s.'],
  [47, 'Berserk', 2, '#ff2040', [16, 14], 'Unlimited stamina, can\'t be stunned.', 'Attacks other monsters.'],
  [48, 'Regeneration', 2, '#ff8090', [1, 15], '+1 heart every 15 s for 2 minutes.', 'Recovers from stuns faster.'],
  [49, 'Gargoyle Skin', 2, '#7a7670', [25, 10], 'Can\'t be hurt or move for 10 s.', 'Stone for 30 s.'],
  [50, 'Medusa Gaze', 2, '#a0e060', [26, 22], 'Monsters you look at freeze, for 30 s.', 'Freezes the monsters around it.'],
  [51, 'Giant\'s Brew', 2, '#60a020', [18, 10], 'Huge and shoves monsters aside.', 'Too big for the halls: stuck.'],
  [52, 'Pixie Dust', 2, '#ffb0ff', [17, 9], 'Tiny and floaty.', 'Tiny, floaty and harmless.'],
  [53, 'Puppy Love', 2, '#f0c090', [19, 15], 'A pug that monsters ignore.', 'A pet pug that follows you.'],
  [54, 'Plague Rat Rum', 2, '#506040', [20, 32], 'A plague rat: nearby things sicken.', 'A plague rat that sickens monsters.'],
  [55, 'Ghostwalk', 2, '#d0e0ff', [23, 21], 'Invisible and silent.', 'A harmless ghost.'],
  [56, 'Thunderclap', 2, '#ffff60', [24, 6], 'A shockwave throws back everything near you.', 'Bursts in a shockwave.'],
  [57, 'Web Bomb', 2, '#f0f0f0', [11, 11], 'A web that holds everything for 10 s.', 'A web that holds everything for 10 s.'],
  [58, 'Banishing Brew', 2, '#40ffa0', [30, 27], 'Shades that touch you are banished.', 'Banished from this floor.'],
  [59, 'Pied Piper', 2, '#e08040', [29, 24], 'Monsters follow you without attacking, 20 s.', 'Leads the others away.'],
  [60, 'Recall', 2, '#80ffff', [38, 15], 'Back to the sanctuary.', 'Sent to a far-off hall.'],
  [61, 'Bottled Echo', 2, '#a0c0e0', [37, 22], 'The whole map and every creature.', 'Its position shown to everyone.'],
  [62, 'Midas Touch', 2, '#ffc020', [35, 34], 'Gems count double and fly to you.', 'Turns to gold and drops gems.'],
  [63, 'Corrosion Cloud', 2, '#90b030', [39, 32], 'Strips your ward.', 'Stuns last three times as long.'],
  [64, 'Wisp Lantern', 2, '#60a0ff', [28, 2], 'A tame wisp lights your way.', 'A wisp becomes your lantern.'],
  [65, 'Hedgehog Draught', 2, '#7a5230', [33, 11], 'A hedgehog for 60 s (Z curl, X roll).', 'Grows spines; others avoid it.'],
  [66, 'Moon Gravity', 2, '#e0e0ff', [9, 31], 'Very low gravity.', 'Floats up to the ceiling, 10 s.'],
  [67, 'Time Syrup', 2, '#c08040', [4, 13], 'Everything near you at half speed, 20 s.', 'Slow motion for 30 s.'],
  [68, 'Mirror Skin', 2, '#e0e0f0', [25, 7], 'Monsters that hit you are stunned.', 'Its attacks rebound on its kind.'],
  [69, 'Warm Hearth', 2, '#ff8040', [36, 2], 'Your torch can\'t run out for 2 minutes.', 'Its chilling touch is gone.'],
  [70, 'Swap Draught', 2, '#c080ff', [38, 29], 'Swap places with the nearest creature.', 'You and it swap places.'],
  // ---------- tier 3: two tier-2 potions ----------
  [71, 'Storm Flask', 3, '#a0a0ff', [56, 41], 'You crackle: whatever touches you is stunned.', 'Lightning chains between creatures within 8 m.'],
  [72, 'Absolute Zero', 3, '#c0f0ff', [42, 67], 'Everything within 6 m freezes for 20 s.', 'Everything within 6 m freezes for 20 s.'],
  [73, 'Sunburst', 3, '#fff8c0', [44, 43], 'A nova that banishes every shade in sight.', 'A nova that banishes every shade in sight.'],
  [74, 'Void Cloak', 3, '#301848', [45, 55], 'Walk through walls for 10 s.', 'Sinks through the floor: gone.'],
  [75, 'Wyrm Form', 3, '#ff5020', [43, 51], 'A drake: fire breath and size for 45 s.', 'A drake that burns other monsters.'],
  [76, 'Stone Garden', 3, '#8a8680', [49, 50], 'Every monster in sight is stone for 45 s.', 'Every monster in sight is stone for 45 s.'],
  [77, 'Beastmaster', 3, '#d09060', [53, 59], 'Up to 3 monsters become pets for 2 minutes.', 'Up to 3 monsters become pets for 2 minutes.'],
  [78, 'Black Death', 3, '#203010', [54, 63], 'A plague cloud that destroys monsters, and hurts players.', 'A plague cloud that destroys monsters, and hurts players.'],
  [79, 'Hourglass', 3, '#e0c080', [67, 60], 'Rewind 10 s: place, hearts and torch.', 'Rewound to where it was 10 s ago.'],
  [80, 'Dreamwalk', 3, '#b0a0ff', [46, 55], 'Sleep safe for 8 s while the whole map is revealed.', 'Dreams for 60 s.'],
  [81, 'Fortress', 3, '#a09080', [49, 68], 'A stone ring that is a safe zone for 30 s.', 'A stone ring that is a safe zone for 30 s.'],
  [82, 'Black Hole Flask', 3, '#100010', [62, 59], 'Pulls every creature in, then flings them away.', 'Pulls every creature in, then flings them away.'],
  [83, 'Hedge Wall', 3, '#6a4a20', [65, 57], 'A wall of spikes that monsters can\'t pass, 30 s.', 'A wall of spikes that monsters can\'t pass, 30 s.'],
  [84, 'Wisp Queen', 3, '#4080ff', [64, 58], 'Every wisp on the floor serves you; shades flee the light.', 'Every wisp on the floor serves you.'],
  [85, 'Warp Bottle', 3, '#60ffff', [70, 60], 'A portal back to the sanctuary for 20 s.', 'Sent far away.'],
  [86, 'Moonfall', 3, '#d0d0ff', [66, 56], 'Everything nearby is launched and slammed down, stunned.', 'Everything nearby is launched and slammed down.'],
  [87, 'Golden Hour', 3, '#ffd040', [62, 69], 'Gems x3 and a full torch for 90 s.', 'A gold statue that drops gems.'],
  [88, 'Ghost Light', 3, '#c0e0ff', [64, 61], 'The map, every creature, and the way down.', 'Shown to everyone for the rest of the floor.'],
  [89, 'Second Life', 3, '#ff4060', [48, 47], 'Die, and come back with full hearts (once this floor).', 'Can\'t be banished for 60 s.'],
  [90, 'Chaos Draught', 3, '#ff40ff', [65, 61], 'A random tier 1-2 effect on everything within 8 m.', 'A random tier 1-2 effect on everything within 8 m.'],
  // ---------- tier 4: two tier-3 potions ----------
  [91, 'Philosopher\'s Stone', 4, '#ffe060', [87, 76], 'Every monster in sight turns to gold, is banished, and drops gems.', 'Same.'],
  [92, 'Elixir of Life', 4, '#ff2050', [89, 79], '+1 max heart for the run, full heal, can\'t die for 60 s.', 'Heals it and makes it unbanishable.'],
  [93, 'Apocalypse', 4, '#400000', [78, 73], 'Destroys every monster on the floor over 20 s; hurts players too.', 'Same.'],
  [94, 'Archmage\'s Draught', 4, '#a040ff', [71, 72], 'For 60 s thrown potions come back to you.', 'Stuns it for 20 s.'],
  [95, 'Time Stop', 4, '#f0e0b0', [79, 72], 'Everything but the players stops for 10 s.', 'Same.'],
  [96, 'Dragon Ascension', 4, '#ff3000', [75, 73], 'A great drake for 60 s: fire breath banishes shades.', 'Burns to nothing.'],
  [97, 'World Key', 4, '#00ffff', [85, 74], 'Opens a way down to the next floor for everyone.', 'Same.'],
  [98, 'Pandemonium', 4, '#ff00a0', [90, 86], 'Spins the Wheel of Misfortune three times at once.', 'Same.'],
  [99, 'Panacea', 4, '#ffffff', [81, 80], 'Cures everything; 3 minutes immune to curses.', 'Undoes every effect on it.'],
  [100, 'Lord of the Deep', 4, '#600080', [77, 76], 'Every monster on the floor follows you for 2 minutes.', 'Same.'],
  // ---------- added later: more buffs (101-112) and debuffs (113-124), recipes from their own class ----------
  [101, 'Iron Lungs', 1, '#9fd0c8', ['bat', 'bat'], 'Sprinting costs no stamina for 45 s.', 'Never tires: +20% speed for 20 s.'],
  [102, 'Catseye', 1, '#b8e060', ['glowcap', 'shade'], 'See in the dark: +50% light, less fog, 60 s.', 'Sees you from twice as far, 30 s.'],
  [103, 'Lucky Clover', 1, '#50c060', ['moss', 'glimmer'], 'Every gem has a 50% chance to count twice, 90 s.', 'Lucky: half your blows miss it, 20 s.'],
  [104, 'Thick Hide', 1, '#a08060', ['bone', 'statue'], 'The next 2 wounds only chill you.', 'Tough: takes half damage, 30 s.'],
  [113, 'Blurwater', 1, '#7090b0', ['water', 'water'], 'Your sight blurs for 20 s.', 'Loses your trail and blunders about, 20 s.'],
  [114, 'Butterfingers', 1, '#e0c070', ['silk', 'pretzel'], 'You drop another potion from your belt.', 'Fumbles: stunned 3 s and sheds a gem.'],
  [115, 'Weakling Brew', 1, '#b0a0a0', ['rust', 'rust'], 'Your weapon does half damage for 30 s.', 'Vulnerable: takes double damage, 20 s.'],
  [116, 'Sapping Draught', 1, '#806080', ['moss', 'pretzel'], 'Stamina drains away and will not refill, 25 s.', 'Exhausted: keeps stopping to rest, 25 s.'],
  [105, 'Quicksilver', 2, '#d0d8e8', [3, 101], '+50% speed and free sprinting for 40 s.', '+40% speed for 20 s.'],
  [106, 'Bloodwine', 2, '#a01830', [1, 104], '+2 hearts and slow healing for 60 s.', 'Heals all its wounds.'],
  [107, 'Hawk\'s Eye', 2, '#e0b040', [102, 37], 'The halls around you map themselves, and you see creatures through walls, 60 s.', 'Knows where you are through walls, 30 s.'],
  [117, 'Witchfire Hex', 2, '#80ff40', [115, 6], 'Hexed: your next wound costs 2 hearts.', 'Hexed: takes 2.5x damage, 20 s.'],
  [118, 'Tanglevine', 2, '#407020', [11, 4], 'Rooted 4 s, then slowed for 10 s.', 'Rooted 10 s, then slowed.'],
  [119, 'Nightmare Draught', 2, '#301040', [113, 13], 'Your torch shrinks to a glimmer, 15 s.', 'Terrified: flees from everything, 15 s.'],
  [108, 'Titan\'s Draught', 3, '#c08040', [51, 106], 'Huge, +1 heart for this floor, and you shove monsters aside, 60 s.', 'Huge, with double health.'],
  [109, 'Aegis', 3, '#f0e0a0', [68, 69], 'The next 3 blows are blocked, 120 s.', 'Cannot be stunned, 30 s.'],
  [110, 'Phantom Step', 3, '#c0d0f0', [55, 105], 'Half of all blows pass through you, 60 s.', 'Half of all blows pass through it, 30 s.'],
  [120, 'Rotgut', 3, '#607020', [117, 63], 'Poisoned: lose a heart every 10 s for 30 s (never the last).', 'Poisoned: loses 1 health a second, 15 s.'],
  [121, 'Grave Chill', 3, '#a0c0d0', [42, 118], 'Frozen 5 s, then half speed for 15 s.', 'Frozen 20 s and brittle: takes 4x damage.'],
  [122, 'Madness Brew', 3, '#c040a0', [119, 57], 'Your controls are reversed and the world swims, 30 s.', 'Mad: attacks the other monsters, 30 s.'],
  [111, 'Ambrosia', 4, '#fff0c0', [108, 109], 'Full hearts, and speed, light, healing, a ward and endless stamina for 3 minutes.', 'A champion: fast, tough and fully healed.'],
  [112, 'Godspeed', 4, '#e0f0ff', [110, 79], 'Every monster on the floor moves at a quarter speed, and you are fast, 30 s.', 'Blindingly fast, 30 s.'],
  [123, 'Oblivion', 4, '#101018', [122, 121], 'You forget the whole map, and your torch gutters, 20 s.', 'Everything within 8 m is erased.'],
  [124, 'Doomsayer\'s Draught', 4, '#500010', [120, 78], 'Doomed: every monster hunts you, and wounds cost 2 hearts, 30 s.', 'Doom: everything within 10 m rots away (3 health a second, 10 s) at half speed.'],
];
export const SLUDGE = 40;
export const POTIONS = [null];
for (const [id, name, tier, col, recipe, you, mon] of T) POTIONS[id] = {id, name, tier, col, recipe, you, mon};
export const hex3 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

// the recipe book: a key for an unordered pair of things (ingredient 'i3' or potion 'p12')
const pair = (a, b) => [a, b].sort().join('+');
const RECIPES = new Map();
for (const p of POTIONS) {
  if (!p || !p.recipe) continue;
  const [a, b] = p.recipe, k = p.tier === 1 ? pair('i' + ING[a], 'i' + ING[b]) : pair('p' + a, 'p' + b);
  if (RECIPES.has(k)) throw new Error('two potions share a recipe: ' + k);
  RECIPES.set(k, p.id);
}
// a, b: {ing:index} or {pot:id}. Returns the potion id brewed (Murky Sludge if it is not a recipe).
export function brew(a, b) {
  const t = x => x.ing != null ? 'i' + x.ing : 'p' + x.pot;
  return RECIPES.get(pair(t(a), t(b))) || SLUDGE;
}
export const recipeText = p => !p.recipe ? 'any pair that is not a recipe' :
  p.tier === 1 ? p.recipe.map(r => INGREDIENTS[ING[r]].name).join(' + ') : p.recipe.map(r => POTIONS[r].name).join(' + ');

// ---- tiers, buffs and debuffs
// A higher tier is stronger: its timed effects last longer (TIER_K) and its numbers are bigger (TIER_M). The figures in each description
// are already scaled for the potion's tier. Every potion is a buff (good to drink) or a debuff (bad to drink: throw it at monsters).
export const TIER_K = [0, 1, 1.5, 2.2, 3], TIER_M = [0, 1, 1.4, 1.8, 2.3];
export const DEBUFF = new Set([4, 5, 6, 10, 11, 12, 13, 16, 19, 20, 24, 28, 29, 31, 32, 39, 40, 42, 54, 57, 63, 78, 90, 93, 98, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124]);
export const MAX_ID = 124;
const isDebuff = id => DEBUFF.has(id);
// seconds and minutes scale with k, +N% with m
export function scaleText(t, k, m) {
  if (k === 1 && m === 1) return t;
  const r = v => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toString();
  return t.replace(/(\d+(?:\.\d+)?) s\b/g, (_, n) => r(n * k) + ' s').replace(/(\d+(?:\.\d+)?) minutes?/g, (_, n) => r(n * k) + ' minutes')
    .replace(/\+(\d+)%/g, (_, n) => '+' + Math.round(n * m) + '%');
}
for (const p of POTIONS) if (p) {p.you0 = p.you;p.mon0 = p.mon;p.debuff = isDebuff(p.id);p.k = TIER_K[p.tier];p.m = TIER_M[p.tier];
  p.you = scaleText(p.you, p.k, p.m);p.mon = p.mon === 'Same.' ? p.mon : scaleText(p.mon, p.k, p.m)}

// ---- blends: every pair brews something.
// Two ingredients that are not a recipe brew a tier-1 blend of what each one is good for (AFFINITY). Two potions of the same tier
// brew the next tier up (tier 4 stays 4); two of different tiers brew the tier in the middle, rounded up. A blend carries at most two
// effects, and never a buff with a debuff: when they meet, the side with the higher-tier effect wins (a buff on a tie) and the other is
// boiled off. The same effect twice, or an effect brewed into a higher tier than its own, comes out boosted.
// A blend is a number: 1000000 + ((tier*5 + level)*125 + a)*125 + b, a and b its effects (b = 0 for one), level 0-4 how boosted it is.
export const AFFINITY = {glowcap: 7, moss: 1, ember: 2, frost: 5, bone: 33, rust: 39, glimmer: 35, silk: 11, water: 12, bat: 3, shade: 8, wisp: 28, statue: 25, pretzel: 20};
const AFF = INGREDIENTS.map(g => AFFINITY[g.id]);
export const BOOST = [1, 1.25, 1.5, 1.75, 2], BOOST_NAME = ['', 'Strong ', 'Potent ', 'Mighty ', 'Legendary '];
// one word to describe each potion's effect, and one to name it: a blend is called [boost] [describe the first] [name the second] [vessel for its tier]
const BLEND_WORDS = ['Mending Balm','Oily Lamplight','Swift Haste','Sluggish Treacle','Frosted Rime','Smoldering Cinder','Glowing Glow','Inky Shadow','Feathered Plume','Leaden Ballast','Webbed Snare','Slippery Ooze','Drowsy Slumber','Rousing Salts','Soothing Calm','Furious Rage','Shrunken Speck','Swollen Bulk','Puggish Pug','Ratty Whisker','Fading Vanish','Revealing Sight','Hushed Silence','Booming Clamor','Stony Granite','Staring Gaze','Snuffing Snuff','Luring Lure','Musky Musk','Repelling Ward','Hiccuping Hiccup','Sneezy Sneeze','Bouncing Bounce','Magnetic Lodestone','Glittering Gemsight','Warming Ember','Echoing Echo','Blinking Blink','Corroding Rust','Murky Sludge','Windborne Gale','Glacial Glacier','Fiery Flame','Dawning Dawn','Nocturnal Night','Dreamless Dream','Berserk Frenzy','Renewing Renewal','Petrified Gargoyle','Gorgon Medusa','Giant Colossus','Fey Pixie','Loyal Puppy','Plagued Pestilence','Ghostly Ghost','Thundering Thunder','Tangled Web','Banishing Exile','Piping Piper','Homeward Return','Resounding Resonance','Gilded Gold','Acrid Acid','Wisplit Lantern','Prickly Quill','Lunar Moon','Syrupy Syrup','Mirrored Mirror','Hearthwarm Hearth','Swapping Switch','Stormy Storm','Frozen Zero','Radiant Sun','Hollow Void','Wyrmish Wyrm','Petrifying Garden','Feral Beast','Blighted Blight','Rewound Hourglass','Dreaming Reverie','Fortified Bastion','Abyssal Abyss','Thorned Thorn','Regal Queen','Warped Portal','Falling Meteor','Golden Dusk','Spectral Specter','Undying Phoenix','Chaotic Chaos','Alchemical Philosopher','Vital Life','Apocalyptic Doom','Arcane Archmage','Timeless Stillness','Draconic Dragon','Unlocking Key','Pandemonic Pandemonium','Purifying Cure','Lordly Lord','Tireless Bellows','Nightseeing Owl','Lucky Clover','Thickskinned Hide','Mercurial Quicksilver','Sanguine Bloodwine','Hawkeyed Hawk','Titanic Titan','Shielding Aegis','Phantasmal Phantom','Ambrosial Ambrosia','Hurtling Godspeed','Blurry Haze','Fumbling Butterfingers','Feeble Weakling','Sapping Lethargy','Hexed Witchfire','Entangling Tanglevine','Nightmarish Nightmare','Poisoned Rotgut','Gravecold Grave','Maddening Madness','Forgetful Oblivion','Doomed Doomsayer'].map(w => w.split(' '));
const VESSEL = ['', 'Draught', 'Brew', 'Elixir', 'Philter'];
const BASE = 125, MIX0 = 1000000;
const mixId = (tier, lv, a, b) => MIX0 + ((tier * 5 + lv) * BASE + a) * BASE + b;
const MIX = new Map();
const mixCol = (a, b) => '#' + [0, 1, 2].map(i => Math.round((hex3(a)[i] + hex3(b)[i]) / 2 * 255).toString(16).padStart(2, '0')).join('');
// the potion for any id: a named one (1-124) or a blend. k and m: how much longer and stronger its effects are than their base.
export function potInfo(id) {
  if (!Number.isInteger(id)) return null;
  if (id >= 1 && id <= MAX_ID) return POTIONS[id] || null;
  if (id < MIX0) return null;
  if (MIX.has(id)) return MIX.get(id);
  let n = id - MIX0;const b = n % BASE;n = (n - b) / BASE;const a = n % BASE;n = (n - a) / BASE;const lv = n % 5, tier = (n - lv) / 5;
  if (tier < 1 || tier > 4 || !POTIONS[a] || b && !POTIONS[b] || b && b <= a || b && isDebuff(a) !== isDebuff(b)) return null;
  const A = POTIONS[a], B = b ? POTIONS[b] : null, k = TIER_K[tier] * BOOST[lv], m = TIER_M[tier] * (1 + 0.12 * lv);
  const sy = q => scaleText(q.you0, k, m), sm = q => q.mon0 === 'Same.' ? scaleText(q.you0, k, m) : scaleText(q.mon0, k, m);
  const p = {id, tier, mix: true, parts: b ? [a, b] : [a], boost: k, k, m, level: lv, recipe: null, debuff: isDebuff(a),
    name: (B || lv ? BOOST_NAME[lv] : 'Pure ') + (B ? BLEND_WORDS[a - 1][0] + ' ' + BLEND_WORDS[b - 1][1] : BLEND_WORDS[a - 1][1]) + ' ' + VESSEL[tier],
    of: B ? A.name + ' and ' + B.name : A.name,
    col: B ? mixCol(A.col, B.col) : A.col,
    you: B ? sy(A) + ' And: ' + sy(B) : sy(A),
    mon: B ? sm(A) + ' And: ' + sm(B) : sm(A)};
  MIX.set(id, p);return p;
}
const partsOf = x => x.ing != null ? [AFF[x.ing]] : potInfo(x.pot).mix ? potInfo(x.pot).parts : [x.pot];
const tierOf = x => x.ing != null ? 0 : potInfo(x.pot).tier;
export function brewAny(a, b) {
  const named = brew(a, b);
  if (named !== SLUDGE) return named;
  const ia = a.ing != null, ib = b.ing != null;
  if (ia !== ib) return SLUDGE;                                     // an ingredient and a potion
  const ta = tierOf(a), tb = tierOf(b);
  const tier = ia ? 1 : ta === tb ? Math.min(4, ta + 1) : Math.ceil((ta + tb) / 2);   // two of a tier make the next tier up; different tiers meet in the middle, rounded up
  const pa = partsOf(a), pb = partsOf(b), dup = pa.some(q => pb.includes(q));
  let all = [...new Set([...pa, ...pb])].sort((x, y) => POTIONS[y].tier - POTIONS[x].tier || (isDebuff(x) - isDebuff(y)) || x - y);
  const side = isDebuff(all[0]);all = all.filter(q => isDebuff(q) === side);   // buffs and debuffs never share a bottle
  let parts = all.slice(0, 2);
  const low = Math.min(...parts.map(q => POTIONS[q].tier));
  const lvIn = Math.max(...[a, b].map(x => x.pot != null && potInfo(x.pot).mix ? potInfo(x.pot).level : 0));
  const lv = Math.min(4, Math.max(lvIn, (dup ? 2 : 0) + Math.max(0, tier - low)));
  parts = parts.sort((x, y) => x - y);
  return mixId(tier, lv, parts[0], parts[1] || 0);
}
