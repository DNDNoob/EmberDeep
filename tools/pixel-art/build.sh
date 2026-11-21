#!/bin/sh
# usage: tools/pixel-art/build.sh <folder with uncle-sam.png and canadian-ranger.png> [out dir for src/art modules]
# Re-encodes both murals from the reference images, rewrites src/art/*.js and renders preview PNGs to ./preview/.
set -e
SRC=$(cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(cd "${2:-$HERE/../../src/art}" && pwd)
mkdir -p "$HERE/preview"
cd "$HERE"
SAMPAL=",#1a120e,#3a281d,#5b3523,#8d471e,#b0601f,#d38233,#eeac57,#f3d49a,#c8683a,#e9e3d3,#9a9a96,#c0391b,#8a2a17,#254a8a,#17294f,#0e5d60,#1f7473,#36657a,#5b87a0,#254153,#14293b,#e7983a,#2f8f8a"
RNGPAL=",#1d1710,#2f281e,#413120,#664423,#8a5a2a,#b57c45,#d9a05a,#f0c27a,#c0352a,#7e231a,#efe3c8,#b8683a,#6a6a3c,#4a4a2c,#1f5b55,#3e8f84,#1c3a30,#4c6a4a,#7b705b,#c9a063,#e9902f,#f1b64a,#b8361e"
python3 enc_sam.py "$SRC"; python3 enc_rng.py "$SRC"
python3 emit.py sam_idx.npy tpl/uncle-sam.tpl.js "$OUT/uncle-sam.js" "$SAMPAL"
python3 emit.py rng_idx.npy tpl/canadian-ranger.tpl.js "$OUT/canadian-ranger.js" "$RNGPAL"
rm -f sam_idx.npy rng_idx.npy
# render.js needs playwright (NODE_PATH=$(npm root -g) if it is installed globally)
node render.js "$OUT/uncle-sam.js" drawUncleSam "$SRC/uncle-sam.png" preview/uncle-sam
node render.js "$OUT/canadian-ranger.js" drawCanadianRanger "$SRC/canadian-ranger.png" preview/canadian-ranger
