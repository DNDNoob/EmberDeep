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

## Record a room-only creature in the Mob Archive

A creature that exists only behind a strange door is a Mob Archive
exhibit by default. Add it in the same change as the room. This is not
optional for a new hostile, and it is not implied by `DOOR_KINDS`.

Leave out scenery and hazards that are not an encounter: monolith heads,
kiln stones, the star room, the fall, the still wood, the person
sometimes seen in the mirror, and the zombie-moose mount. Maze creatures
(Shade, Stalker, Wisp, Watcher, Mimic, Wrong Shadow) are recorded in
`src/game.js` and stay ahead of room creatures. Do not add them here.

The thing in the little village is a door-room creature and is not
recorded yet. Add it the same way the next time that room changes.

1. Append a stable id to `ROOM_MOBS` in `src/room-mobs.js`. Keep existing
   ids and their order. New exhibits are added at the end of the hall.
   Each entry is `{name, room}`, and `room` is that creature's
   `DOOR_KINDS` id. Listing it is what adds the case, the save, and
   Encounter replay. Encounter reopens that room with the recorded seed.
2. The first time the player looks at the creature during a live visit,
   call `o.mob?.(id, seed)`. Use `spotted()` from `src/room-mobs.js`:
   in front of the look direction and within range. The maze cone is
   `minDot` 0.52. Call it once. Do not call it while `A.watching` or
   during an archive replay. `createRooms` already drops spectator
   calls. Pass the room seed when the visit depends on it. If you omit
   the seed, the archive uses the seed already stored for that door, so
   the door has to have been opened on a real descent.
3. Add a glass-case model for that id in `roomMobExhibit` in
   `src/room-mob-exhibits.js`. Feet near y=0, height under 1.42, width
   under 1.42, and a `userData.pose(time)`. An id with no model is an
   empty case.
4. Append the same id, in the same order, to the expected key list in
   `tools/room_mob_test.mjs` and run it. The size checks already cover
   every `ROOM_MOBS` id.

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

## Room controls protocol

Use the shared action names from `src/room-controls.js`. Room logic reads
those actions from `roomInput()` and shows their current device labels
through `o.control(action)`. Controller labels use Xbox names for the
standard button positions. Use a room's `controlMode()` to declare
temporary `table`, `choice`, or `read` focus.

| Intent | Keyboard and mouse | Controller | Touch |
| --- | --- | --- | --- |
| Walk and look | WASD to move, mouse to look. Outside focused activities, ↑/↓ also move and ←/→ turn. | Left stick moves, right stick looks. | Left stick moves, drag to look. |
| Sprint | Shift | LT or left-stick click | Push the movement stick fully. |
| Jump | Space | A | Jump |
| Interact or confirm (`press`) | E or click an eligible control | X | Tap Use or the labeled control. |
| Navigate a choice or board (`nav*`) | Arrow keys | D-pad | Tap the option or tile. |
| Step back (`back`) | Esc | B | Visible Back, Close, or Step away action. |
| Alternate action (`alternate`) | Q | Y | Labeled action button. |
| Additional tool (`tool`) | Z | RB | Labeled action button. |
| Start a ready round (`start`) | Enter | Menu | Start round button. |

- Keep walking and looking available at stations. A tabletop or choice
  overlay can reserve arrows and D-pad for selection while the player still
  walks with WASD or the left stick. Let the player step away to disengage.
- Reserve Space and A for jumping, and consume each confirm, back, and
  purchase once per press. Repeat only for an action that benefits from a
  hold, such as a console's soft drop. Leave Tab and focused buttons'
  native keyboard activation available for accessible navigation.
- In a focused activity, Back returns to walking or closes an optional
  overlay. Exiting a room is a separate action at its physical door.
  Use the room's established exit interaction when a passage is meant
  to be walked through.
- Explain any additional action at the station, with the correct keyboard,
  controller, or touch label. Offer an equivalent control on every
  supported input device. A required voice action needs a button fallback.
- Declare look-only or cinematic rooms in the registry. They should only
  show controls the player can use, and spectators should never operate
  the room they are watching.

### Existing rooms

- The Glass Kiln uses Interact on the aimed machine button. Mouse and
  touch also support hitting the physical control.
- The Mirror Room uses Interact on objects and exits. In its timed choice,
  use left/right and confirm, or select the visible option directly.
  Back closes the optional book.
- Mosquito Outpost uses Interact to operate the table, build a tower
  on a selected snow tile, or open the physical exit when walking.
  Alternate places spikes, Tool pours syrup, and Start launches a round.
  Back returns to walking while a wave continues.
- The Picture House uses the microphone or a held Interact action to
  speak and yell. Walk through an available exit.
- The Whispering Monoliths use ordinary walking through the passage.
  The star room is look-only, and the falling room is cinematic.
- The still wood is ordinary walking. Look down into the pond to pin the
  door that hides behind you, then walk back through it.
- The little village is ordinary walking. Villagers run the paths until the
  sun sets and a thing comes out. A chest in the square holds an obsidian-glass
  sword. Each hit takes one limb. Kill it, then walk back through the door
  behind where you arrived. Leaving before it dies is a retreat.

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
`tools/room_controls_test.mjs` when changing bindings or focus,
`tools/room_fxaa_test.mjs` when changing room rendering, and
`tools/room_mob_test.mjs` when adding or changing a room-only creature.
