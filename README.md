# Door Simulator

A procedural maze explorer that runs in the browser. Play it at https://dndnoob.github.io/EmberDeep/

- `index.html` is the whole game in one file, rendered with Three.js (bundled inline, no network needed).
- `classic.html` is the earlier hand-written WebGL2 renderer, kept as a fallback.
- `src/game.js` is the source. `npm install` then `npm run build` rebuilds `index.html`.
- The title lobby looks out through an observation window. The stars drift, and three worlds move on their own orbits, so the station feels as if it is really traveling.

## Playing with friends

Click **Host for friends** on the title screen. The invite link is copied for you (it is also in the pause menu). Friends open the link, type a name, and press **Join**. Everyone plays the same maze and sees each other.

- No server: browsers find each other through free public relays, then connect directly (WebRTC, via [Trystero](https://github.com/dmotz/trystero)). `src/net.js` is the connection; the game side is the multiplayer section of `src/game.js`.
- The host's browser runs the creatures. If the host leaves, everyone else keeps playing alone.
- Shards and gate keys count for the whole team. Anyone reaching the open seal takes everyone down. A player who falls watches a friend and comes back on the next floor; if everyone falls, the host can start again for the room.
- Add `&net=local` to a room link to test with two tabs on one computer without any network.

## Chat, voice and the mimic

- **Text chat:** press Enter (or T) in a shared game. On a phone, use the CHAT button.
- **Voice chat:** choose Push to talk (hold C, or the TALK button) or Open mic, either on the title screen or in the pause menu. The host decides whether voices fade with distance and get muffled behind walls.
- **The mimic:** while your mic is live, your browser cuts what you say into short clips and shares them with the room. The host's game sends out a creature that wears one player's look and name tag and plays their clips near someone else. If it reaches you, its chest splits open. A flash bomb drives it off, and the minimap never shows it, so check where your friend really is. The host can turn it off.
- Clips live only in the browsers in the room and are gone when you leave. `docs/mimic-brain.md` describes the optional local-AI line picker.

## Strange doors
See [Authoring a strange-door room](docs/strange-doors.md) for the room starter workflow and shared movement rules.

Strange doors are set into the maze walls. Face one and press E (or OPEN / X) to enter. The room registry in `src/rooms.js` links each door to its scene.

- **A door full of stars:** you float over a little solar system until its sun collapses into a black hole, eats the planets and throws you back out, one to three floors deeper. In a shared game the whole party is thrown down together, and fallen players rise as on any descent.
- **The glass kiln:** a glass box of falling ember stones. Burn four full rows to open the way out, for gems and a heart. Ash rises from the bottom every 16 seconds; if the box fills, you die.
- **A door with no floor:** you are shoved through and fall.
- **A mirror:** you stand in a dark back room and watch a lit parlor with three people through a big pane. It takes a while to see that you are behind the glass. Then something comes in, kills them, turns and starts smashing through to you. A can of pepper spray rolls up to your foot: spray the monster and it breaks through faster and eats you, or suck your thumb and hope the bad things go away (you spray yourself, it only rages while you look at it, and it wanders off). Looking away slows it. Surviving pays a few gems.
- **The whispering monoliths:** three floating stone heads fall silent, turn, and scream. When they vanish, follow the faint star path and walk through its door to land at the current maze's exit seal. The normal shard requirement still applies.
- **A door into the still wood:** the forest does not end. The door you came through stays directly behind you, out of sight, and turns when you turn. A still pond shows that door when you look down into it. Seeing the reflection holds the door in place; while you can see the door, or its reflection, it will not move. Turn and walk back through it. Look away from both and it slips behind you again.
- **A door into a little village:** a blocky hamlet of bright houses. Villagers run the lanes until the sun sets. Then something comes out, kills whoever it catches, and comes for you. The chest in the square holds an obsidian-glass sword. Each hit takes one limb, and the fourth ends it. The door home is behind where you arrived. Walk out after it dies. Leave earlier and the village keeps the night.
- **Mosquito Outpost** is a walkable arcade. Approach the table and press E or X to play, or step away with Esc or B while the round keeps running. The progress bar shows how far the leading enemy has reached and turns red at halfway. The same moose returns with Canada goose escorts across three increasingly difficult rounds. Towers cost three gems and go on snow squares. Spikes cost five gems and go on path squares, and a trap already bought from the Keeper is used first. Maple syrup costs three gems and slows enemies that cross it during the round. Press Z or RB on a controller to pour it on a selected path square. Survive each round to earn gems and clear all three to see the defeated moose rise as a rideable zombie. In the maze, press R or D-pad up to mount or dismount. Riding increases speed by 25% and protects you from maze spike traps. Press G or D-pad down to release the moose and divert pursuers. It keeps running until those enemies take all three hearts. On touch, use RIDE and LURE.
- The keyhole is the only hint: cold blue light, warm amber light, pale silver shimmer, or nothing.
- While someone is inside a room their friends cannot see them and creatures ignore them. A used door is boarded up for everyone, including players who join later.


## Floor types and looks

Floors move through seven types, one after another, with a Humming Rooms floor every fourth depth: **The Old Stonework**, **Mossgrown Halls**, **The Frostvault**, **Cinder Warrens**, **The Bone Galleries** (an ossuary of stacked skulls and long bones between stone piers, brick vault overhead), **The Rustworks** (riveted iron plate, pipes, diamond plate and grating) and **The Glimmer Veins** (dark slate shot through with glowing crystal).

Every type also has four looks, picked per floor from the run seed (so friends in a shared game see the same one) and nudged by a little random colour and noise so no two floors match exactly: Stonework is plain, flooded, crumbling or sooty; Moss is plain, overgrown, dripping wet or pale lichen; Frost is plain, deep ice, snow-dusted or black ice; Cinder is plain, ashen, molten or obsidian; Humming Rooms are yellow, faded green, salmon or water-stained; Bone is plain, damp and mossy, chalk white or smoke-blackened; Rust is plain, verdigris, oily wet or flaking paint; Glimmer is teal, violet, amber or dim. The arrival message names the look, for example `Depth 6: The Bone Galleries (chalk white)`.

**The Dark Forest** replaces every other cavern floor (depths 7, 15, 23 and so on). There is no ceiling at all, only pitch-black sky: look up and you see the dark undersides of pine boughs and then nothing. The maze walls are living undergrowth: a dense core of needles and leaves, with pines, bushes and thorny brambles growing out of it, old iron lanterns hung on posts instead of wall torches, stumps and thick trunks where the pillars were, and ferns, fallen logs and pale mushrooms on the ground. Its four looks are pine, thicket (brambles and bushes), deadwood (bare grey trees, no glow) and mossy (wet, with fireflies and glowing mushrooms). Try it with `?depth=7`.

- **Jump to a floor:** open the game with `?depth=N` (1 to 40) to start new runs at that depth without having reached it. The saved deepest-depth record is not raised by loading.
- Developers: `src/forest.js` makes the forest from math (core wall faces, instanced pines, bushes, brambles, ferns, logs; placement uses its own dice from `seed#forest#depth`). `tools/forest_test.mjs` checks it. `src/variants.js` holds the look tables and `pickVariant`. The surface shaders in `src/textures.js` switch on `VAR` (0 to 3), and `SURFS.get(layer, {v, seed, tint})` builds one. In the console, `__game.genFloor(seed, depth, {bi, ix})` or `__game.loadFloor(depth, {bi, ix})` forces a biome and look.

## Ambient sound

Every kind of floor has its own faint background sound: dripping water on the moss floors, wind in the frost, embers in the warrens. It goes quiet in the menus, strange-door rooms and the fall.

- Developers: `src/ambience.js` holds the soundscapes. Give a new floor type sound with `registerAmbience('Biome Name', {beds, shots})` (or register under its `F.kind`); the header comment there has an example.

## Things that look like bugs (they are not)

From depth 2, every minute or two, something goes wrong on purpose. It only happens on your own screen, and never while a creature is hunting you.

- **A hang:** the picture freezes and the sound sticks on one buzzing note. When it lets go, the way you came may be walled up, you may be facing the other way, or something pale is standing ahead.
- **Rubber-banding:** "Reconnecting…" and you are snapped back a few steps. Another time you are snapped forward somewhere you have never been, and your footsteps carry on behind you. In a shared game it says it is reconnecting to *you*, your friends see a frozen copy of you left standing where you were, and sometimes a friend in front of you rewinds and walks the last two seconds again.
- **A lying HUD:** the wrong depth, a fourth shard, a garbled message, or a chat line from someone who is not in your game (in a shared game, it is from you).
- **A T-posing figure:** arms straight out, lit from nowhere, sliding toward you in jerky steps. Look away and it is gone.
- **A wall that never loaded:** a gap showing a grey floor that goes on forever and one lit doorway. Walk up and the wall pops back in.
- **Falling through the floor** (depth 3 and deeper): you sink under the maze, fall toward a dark grid, and wake at the start of the floor, with the map showing only the path you walked.
- **A hall that loops** (the Humming Rooms only): you are quietly put back at the start of a long hall. On the third pass a light is dead. On the fourth, something is standing at the far end.
- **A wall that is not there:** a small chance, once each time you slam into a wall at a full sprint, that you pass through it into the open cell beyond. It never opens a locked gate. The maze may say the wall was not there.

From depth 2, some floors also hide a neighbor whose shadow is wrong. It wears a cartographer's or a delver's face and wanders. It does not hunt unless you look at it for too long. The shadow on the floor is a different, worse shape.

For testing, `__game.glitch('freeze' | 'rubber' | 'rubberfwd' | 'replay' | 'hud' | 'tpose' | 'hole' | 'fall' | 'loop' | 'clip')` in the console forces one.

## Movement

One movement system drives the maze and every strange-door room: `src/movement.js`.

- The tunables are in `MOVE` (walk 2.7, sprint 4.3, jump 3.5, gravity 11, air control 7, stamina, turn rates, mouse and touch look, pitch limits, footstep and bob numbers). They are in maze units (eye height 0.62). To change how the whole game moves, change them there.
- `stepMove(body, dt, intent, world)` is the one step function. The maze calls it from `update()` in `src/game.js`; rooms call it through `createRoomWalker`. A room is in human scale (eye 1.6), so the walker multiplies every length, speed and gravity by `scale = eye / 0.62` (about 2.58). Walking and jumping then take the same time and feel the same relative to your height as in the maze. Do not retune per room.
- Stamina, boots, lungs and the cold slowdown are shared: `game.js` passes the player's stamina and modifiers to rooms in the options of `createRooms`.
- `roomInput()` in `game.js` gives every room the maze bindings: WASD / arrows move and turn, Space / pad A / touch JUMP jumps, Shift / pad sprint sprints. `press` (click, E, Enter, pad X, touch action) is separate from jump.

A new room that walks needs only this (see the kiln and mirror for full examples):

```js
const WK=createRoomWalker({o, eye:1.6, x:0, z:5, collide:b=>{/* push b.x, b.z out of walls */}, groundAt, ceilingAt, speedMul});
// every frame
lookStep(S,dt,inp.lx,inp.ly);                       // shared turning and pitch
WK.step(dt,inp,S.yaw);                              // walk, sprint, jump, sounds
eyeY = 1.6 + WK.b.y + bobY(WK.b,WK.scale);          // camera height
```

`groundAt(x,z)` gives floor height (a ledge, a slope), `ceilingAt(x,z)` the highest the body may rise, `speedMul()` a room's own slowdown.

Declaring an exception: `MODES` next to `KINDS` in `createRooms` (`src/rooms.js`). A room that is not listed walks. `'look'` allows turning only (galaxy: floating), `'none'` allows no control (fall: a cinematic). Give every exception a one-line reason. `tools/movement_test.mjs` checks the maze numbers, that rooms match the maze in eye-heights, and the exceptions.
