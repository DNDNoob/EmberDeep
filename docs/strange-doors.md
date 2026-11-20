# Authoring a strange-door room

Start with a short room brief. Describe what the door hints at, what the
player notices on arrival, what they can do, and how the visit can end.
Decide whether each ending affects the visitor or the whole party.

## Build the playable version

1. Append a stable ID to `DOOR_KINDS` in `src/rooms.js`. Keep existing IDs
   and their order because seeded floors rotate through them. Give the
   room a display name and a door look from `DOOR_LOOKS` in `src/game.js`.
   Add a new look if the room needs its own leaf or keyhole cue.
2. Register a scene factory in `KINDS` inside `createRooms`. Use the
   kiln or mirror for an in-file example and the picture house for a
   room in its own module. Start with the spawn, walkable geometry,
   and one interaction before adding final lighting and props.
3. Finish the scene through the room manager. Wire the outcome through
   `roomEnd` when it changes rewards, health, or depth. For a room that
   supports spectating, send the seed and state that a watcher needs to
   reconstruct the same visit.

## Give the room an entrance, an exit, and an achievement

- Give each room a physical entrance and exit by default. Place the
  arrival point by the entrance and make the exit identifiable from
  inside the room. Use a different layout when the room's premise or
  mechanics call for it.
- Give each room at least one achievement tied to an action or outcome
  specific to that room. Check that the intended trigger awards it in
  a real visit through a strange door.
- Sign minigames in the room itself. Put the game's name on a cabinet,
  tabletop, marquee, or nearby wall sign so players can discover it by
  walking through the space. Keep the play station physically reachable
  and preserve the player's position when switching back to walking.

## Light and detail the room

Rooms registered with the shared manager get FXAA edge smoothing on Medium
and High, plus half-resolution ambient occlusion on High. Opaque,
depth-writing geometry contributes to occlusion. Glass, particles, and
translucent effects stay out of its depth pass, so surfaces behind them
can still contribute. Use the shared renderer and set the room's `bloom`
strength to suit its lighting.

- Give the arrival view one clear focal point. The Glass Kiln uses its
  illuminated cabinet, and the Picture House uses the screen. Place the
  room's strongest light where the player should look first.
- Use softer fill and local light pools to reveal the rest of the space.
  Let light come from visible fixtures when possible. The Mirror Room uses
  warm parlor lamps beyond the pane and cooler light on the player's side.
  Keep interaction targets and exits readable in dim states.
- Give visible surfaces distinct material responses. Use wood grain,
  fabric roughness, restrained glass sheen, and small bevels where light
  should catch an edge. Place furniture legs and prop bases against the
  floor so the shared occlusion pass can shade those contacts.

## Use the shared movement

Walkable rooms default to the maze controls. Use `createRoomWalker` from
`src/movement.js` for walking, sprinting, jumping, gravity, and shared
stamina and movement modifiers. Feed it the normalized input from
`roomInput()`, use the shared look and camera bob helpers, and size the
scene around the walker. Keep interaction separate from jump.

The walker scales from the maze's 0.62 eye height to the room's eye height
(usually 1.6). Tune the room's spawn, walls, slopes, and ceilings through
the collision and ground callbacks. Keep baseline locomotion in `MOVE`
so changes apply throughout the game. Size required jumps and gaps for
ordinary movement and test routes with low stamina and chill.

Declare an exception in the registry only when the scene needs it.
The galaxy is look-only because there's no floor. The fall is a
cinematic with no movement input. For local effects that change movement
temporarily, follow the mirror's use of the walker's speed multiplier.

## Preview and check

Start a solo run and call `__game.previewRoom('mirror', 7)` from the
browser console. Change the ID to select a room and the seed to try a
different variant. Call it again to restart or switch rooms.
`__game.roomLeave()` returns to the maze. The preview uses normal room
input and scene updates, and skips the door-consumption and outcome
effects. Play through an actual door to check those effects and test
spectating in a shared run.

Check that the arrival and main interaction views read clearly on Medium
and High. Revisit lighting changes, including darkened states and the
unlocked exit if applicable. Check Low when glow or contact shadows help
guide the player. For before-and-after captures, use the same seed, camera,
room state, viewport, and quality. Compare frame times under those same
conditions when adding a costly graphics effect.

Before shipping, verify that the main interaction works on keyboard,
controller, and touch, and that the room leaves no lingering HUD, audio,
or controls after exit. Run `tools/movement_test.mjs` and
`tools/door_rotation_test.mjs` against a fresh build. Run
`tools/room_fxaa_test.mjs` when changing room rendering.
