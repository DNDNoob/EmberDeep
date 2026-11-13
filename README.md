# Emberdeep

A procedural maze explorer that runs in the browser. Play it at https://dndnoob.github.io/EmberDeep/

- `index.html` is the whole game in one file, rendered with Three.js (bundled inline, no network needed).
- `classic.html` is the earlier hand-written WebGL2 renderer, kept as a fallback.
- `src/game.js` is the source. `npm install` then `npm run build` rebuilds `index.html`.
