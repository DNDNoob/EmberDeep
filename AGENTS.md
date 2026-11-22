# Shared-world interaction

Keep screens, consoles, and props usable from the player’s position in the shared scene. Preserve the player’s camera and movement during use, and allow them to walk away to disengage. Use proximity and world-space targeting to determine what they can interact with. Show shared terminal contents and selections in the world. For personal settings, identify the logged-on player on the screen and apply shared terminal changes only to that player's local settings.

For any wall art (murals, posters, paintings, signs with pictures), follow "Wall art, posters and murals" in `docs/procedural-art.md`: generate pixel art at load time; never ship bitmaps.

Strange-door rooms follow `docs/strange-doors.md`. A creature that exists only in a door room is a Mob Archive exhibit in that same change: append it to `ROOM_MOBS`, call `o.mob` once when the player spots it on a live visit, and give it a glass-case model. `DOOR_KINDS` alone does not record it.
