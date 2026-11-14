# Emberdeep

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
