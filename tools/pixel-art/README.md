# Pixel-art pipeline

Offline tools that turn a painted reference image into a small code-generated pixel-art mural
(`src/art/uncle-sam.js`, `src/art/canadian-ranger.js`). The game never ships the bitmaps; it draws
the 192x108 canvas at load time. See "Wall art, posters and murals" in `docs/procedural-art.md`.

## Rebuild

Needs python3 with numpy and Pillow, and node with playwright (only for the preview).

    tools/pixel-art/build.sh <folder containing uncle-sam.png and canadian-ranger.png>

This runs `enc_sam.py` / `enc_rng.py` (quantise the image to the palette, hand-defined polygon
regions, light cleanup, palette-indexed grid), `emit.py` (RLE-encode the sprite into `tpl/*.tpl.js`,
which holds the procedural background code), and `render.js` (preview + side-by-side compare PNGs in
`tools/pixel-art/preview/`). The reference PNGs are not stored in the repo; pass the folder as the
argument or set `PIXEL_SRC_DIR`. Intermediate `.npy` files are deleted after emitting.

## New piece

Copy an `enc_*.py` and its template, redraw the region polygons for the new subject, pick a
16-24 colour palette, and add a line to `build.sh`. `km.py` (k-means palette suggestion) and
`grid.py` (crop with a coordinate grid, for placing polygons) are helpers.
