# Door Simulator

A procedural maze explorer that runs in the browser. Play it at https://dndnoob.github.io/EmberDeep/

- `index.html` is the whole game in one file, rendered with Three.js (bundled inline, no network needed).
- `classic.html` is the earlier hand-written WebGL2 renderer, kept as a fallback.
- `src/game.js` is the source. `npm install` then `npm run build` rebuilds `index.html`.

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

Every floor has two or three doors set into its walls. Face one and press E (or OPEN / X) and you are somewhere else. `src/rooms.js` holds the three rooms, each with a small scene of its own.

- **A door full of stars:** you float over a little solar system until its sun collapses into a black hole, eats the planets and throws you back out, one to three floors deeper. In a shared game the whole party is thrown down together, and fallen players rise as on any descent.
- **The glass kiln:** a glass box of falling ember stones. Burn four full rows to open the way out, for gems and a heart. Ash rises from the bottom every 16 seconds; if the box fills, you die.
- **A door with no floor:** you are shoved through and fall.
- The keyhole is the only hint: cold blue light, warm amber light, or nothing.
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

For testing, `__game.glitch('freeze' | 'rubber' | 'rubberfwd' | 'replay' | 'hud' | 'tpose' | 'hole' | 'fall' | 'loop')` in the console forces one.
