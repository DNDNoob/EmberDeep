# Shared-world interaction

Keep screens, consoles, and props usable from the player’s position in the shared scene. Preserve the player’s camera and movement during use, and allow them to walk away to disengage. Use proximity and world-space targeting to determine what they can interact with. Show shared terminal contents and selections in the world. For personal settings, identify the logged-on player on the screen and apply shared terminal changes only to that player's local settings.

For any wall art (murals, posters, paintings, signs with pictures), follow "Wall art, posters and murals" in `docs/procedural-art.md`: generate pixel art at load time; never ship bitmaps.

Strange-door rooms follow `docs/strange-doors.md`. A creature that exists only in a door room is a Mob Archive exhibit in that same change: append it to `ROOM_MOBS`, call `o.mob` once when the player spots it on a live visit, and give it a glass-case model. `DOOR_KINDS` alone does not record it. Door rooms give no hints by default (see "No hints" in that doc).

## Update Log (player-facing changes)

Every change a player can notice (new door, floor, creature, item, room, sound, setting, lobby feature, notable bug fix) must add a post at the top of `src/news.js` in the same commit/PR as the change. Rules:

- Newest first: prepend the new post. `date` is the day the change lands (`YYYY-MM-DD`).
- Short title; 1-3 sentence body in a friendly player voice.
- Spoiler-free: tease, never reveal what a strange door, glitch, scare, trap, secret or easter egg does, where it is, or how to trigger it.
- No code names, file names, PR numbers or agent names.
- Group small fixes into one post. Pure refactors, tests and tooling need no post.
- Then rebuild `index.html` (`npm run build`).

## Spelling

All player-facing text (UI, signs, stencils, terminal screens, Update Log posts, door/creature descriptions, NPC lines) uses American English spelling: color, center, gray, armor, authorized, realize, meter, favorite, traveled, defense.
