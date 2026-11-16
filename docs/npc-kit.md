# NPC sculpt kit: how to build a character

The Keeper is built this way. Use the same path for Ilse, Brakk and new NPCs. Read `docs/procedural-art.md` first for the house style.

Files:

| File | What it is |
|---|---|
| `src/sculpt.js` | SDF primitives, smooth-min, noise, surface nets (`sculptIndexed`), quadric simplification (`simplify`), `flatten` (normals, paint, baked AO) |
| `src/npc_kit.js` | Part builders, eye rig, baking and caching (`bakeRecipe`, `bakeRecipeIdle`) |
| `src/npc_recipes.js` | Characters as recipes (`KEEPER`) |
| `src/game.js` | Posing: `emitS`, `humanoidFrames`, `drawRecipe`, `buildKeeperSculpt`; shader materials 12-15 in `paintedMaterial` |
| `tools/npc_stats.mjs` | Bake a recipe in Node; prints triangles per part and LOD, and bake time |
| `tools/npc_shot.mjs` | Headless screenshots of one NPC at standard angles under the same light |

## Pipeline

```
recipe.build()  -> part specs {sdf, bounds, cell, tris:[near,far], cull, paint}
bakePart()      -> surface nets on a fine grid (narrow band)
                -> simplify to tris[0] (near LOD) -> simplify again to tris[1] (far LOD)
                -> flatten: project onto the surface, SDF normals, paint + detail mask + baked AO
drawRecipe()    -> emitS() each part into its frame every frame; eyes and blinking lids
```

The simplifier spends triangles where the shape bends: a nose keeps its triangles, a flat robe panel loses them. Shading stays smooth because normals come from the SDF, not from the triangles. So set the budget with `tris`, and set `cell` only fine enough to capture the smallest feature. Aim for a raw grid of about 4 to 10 times the near budget.

## Recipe format

```js
export const ILSE = {
  id: 'ilse-v1', seed: 77,                       // change id whenever the shape changes
  palette: {skin: [0.92,0.71,0.57], skinDeep: [0.8,0.45,0.38], ...},
  rig: {waist: [0,0.42,0], lean: 0, neck: [0.003,0.29,0], jaw: 0.004, headTilt: 0},
  parts: [
    {part: 'head', frame: 'H', mat: 'skin', col: 'skin', col2: 'skinDeep'},
    {part: 'hair', frame: 'H', mat: 'hair', col: 'hair', col2: 'hairDeep'},
    {part: 'coat', frame: 'U', mat: 'cloth', col: 'teal', col2: 'tealDeep'},
    {part: 'mapHand', frame: 'handR', mat: 'skin', col: 'skin', col2: 'skinDeep'},
  ],
  eyes: {frame: 'H', sclera: 'sclera', iris: 'iris', pupil: 'pupil', lid: 'skin', lid2: 'skinDeep'},
  build() { /* kit builders -> {parts: {...}, eyes: {...}, anchors: {...}} */ }
};
```

- **frame**: one of `B` (feet; turns with the body), `U` (waist; lean and breathing), `H` (head; tracks the player and nods), `J` (H moved down by the jaw while talking; use it for beards). Any other name is a frame your pose code adds, such as `grip` or `rest` for hands.
- **mat**: `skin` (12, subsurface, pores, wrinkles where the detail mask says), `cloth` (13, weave and sheen), `hair` (14, strands), `trim` (15, gold embroidery), `eye` (8, glossy), plus `wood`, `metal`, `glow`.
- **col / col2**: the part's paint channel blends from `col` to `col2` per vertex. Make `col2` a darker, redder version: it is used for ruddy noses, darker lips and lid lines, and the beard tips.
- **build()** runs once, in plain JS (no THREE, no DOM), so Node can bake it.
- **anchors**: anything the pose code needs (eye centre, where the hands go, the staff axis).

## Builders and parameters

All are in `src/npc_kit.js`. Units are metres, in the part's frame: +X is forward (where the face looks), +Y is up, and +Z is to the side.

| Builder | Parameters | Notes |
|---|---|---|
| `head(p)` | `age` 0..1 (sag, nasolabial fold, eye bags, wrinkle mask), `jaw` (width), `chin`, `brow` (ridge weight, 1.2+ for deep-set eyes), `nose:{len,width,droop,bulb}`, `cheek:{bone,sag}`, `ears`, `eye:{x,y,z,r}` (centre, half spacing, radius), `skull:[rx,ry,rz]`, `neck` | Returns `.eye`, `.noseTip`, `.mouth`, plus `.skull`/`.jawSdf` for parts that wrap the head |
| `hairCap(H,p)` | `thick`, `crown` (bald line height; raise above 0.2 for a full head), `front`, `hang` | Horseshoe fringe; culls itself inside the head |
| `brows(H,p)` | `size`, `droop`, `lift` | Sits on the brow ridge, so it is always attached |
| `moustache(H,p)` | `size`, `droop` | Grows from the upper lip |
| `beard(H,p)` | `length`, `width`, `thick`, `fork` 0..1, `cheekLine` | A shell over the jaw plus a hanging mass; draw it in frame `J` |
| `hand(p)` | `pose:'rest'|'grip'|'point'`, `side` ±1 (the Z the thumb is on), `size`, `age` (knuckles), `gripR` (radius of the held thing), `curl`, `spread` | Wrist at the origin, fingers along +X, back of the hand +Y. `grip` returns `.grip` = held axis [x,y] (along hand Z) |
| `robeSkirt(p)` | `height`, `hem`, `waist`, `folds`, `depth` | `.base` is the smooth silhouette |
| `robeTorso(p)` | `arms:[{S,E,W,r:[shoulder,elbow,mouth],back}]`, `chest`, `waist`, `sash:{y,h}` | Returns `.trims.sash`, `.trims.cuffs[]`, `.ends[]` (sleeve mouths for hands), `.body` |
| `trimBand(base, region, p)` | `thick`, `bounds`, `cell`, `tris` | A real raised band (hem, sash, cuff) over cloth. Add `band.covers` to the cloth's cull |
| `eyeRig(p)` | `r`, `iris` (fraction of r, real eyes ~0.5), `open` (deg, upper lid edge; lower is sleepier), `low`, `arch`, `lidT` | Built from `recipe.eyes`; lids rotate to blink |
| helpers | `chain`, `inChild`, `inParent`, `basis`, `rotX`, `rotZ` | `inChild`/`inParent` evaluate another frame's SDF, for culling across frames |

A custom part is any `{sdf, bounds, cell, tris, cull?, paint?}` written with the primitives from `sculpt.js`.

## Budgets

- Near LOD (within 6 m, Q>=1): at most **~6k triangles (18k vertices) for the whole character**, eyes included. The Keeper uses 5.9k, plus about 2k vertices of primitive staff. Far LOD: about 40% of that.
- Rough split: head 1250, beard and hair 900, hands 380 each, torso 650, skirt 480, trims 100 to 200 each, eyes 600 for both.
- All characters share `CH.cap` = 90k vertices per frame.
- Bake time: about 1.5 s for the Keeper in total. `bakeRecipeIdle()` at load spreads it across ticks, one part per tick. Add new recipes to the idle bake next to `KEEPER` in game.js.
- Check budgets with `node tools/npc_stats.mjs KEEPER` (`--obj DIR` dumps the near meshes).

## Posing a new NPC (game.js)

```js
function buildIlseSculpt(n,B,t,ph,breath,blink,jaw,nod,out,lod){
  const K=bakeRecipe(ILSE),fr=humanoidFrames(ILSE,n,B,t,ph,breath,nod,jaw);
  fr.handR=subF(fr.U,K.anchors.mapAt,K.anchors.mapR);   // custom frames from anchors
  drawRecipe(K,lod,fr,blink);                            // all parts, eyes, blinking lids
  // props stay primitive: seg/ball/slab into the same frames
  out.top=0.98;
}
```

Call it from `buildNpc` in the same way the Keeper is called (`dist<14`, `lod = dist<6&&Q>=1?0:1`). Keep the classic build behind `?npc=classic`.

## Screenshots

```
npm run build
node tools/npc_shot.mjs --npc keeper --views face,front,34,side,hands,wide --out /tmp/shots     # quick, scale 1
node tools/npc_shot.mjs --npc map --views front --scale 2 --prefix ilse                          # final quality
node tools/npc_shot.mjs --q low --views front                                                    # check Q0
node tools/npc_shot.mjs --file old.html --prefix before --views face                             # compare builds
```

`__game.studio()` moves the NPC into a straight corridor far from braziers and sconces, freezes gameplay, and fixes the camera. The light is the player's torch plus ambient: what players see in most of the maze, and the same for every build. Every view takes 30 to 50 s (software GL). Use `face` and `hands` while iterating, and look at every PNG.

## Pitfalls we hit

- **Parts buried in other parts**: brows centred on the brow ridge ended up mostly inside it, and only fragments showed. Put a part's centreline *outside* the surface it grows from, then cull with `H.sdf(...) < -0.0015`.
- **Beards that float or flare**: build the cheek part as an offset of `H.jawSdf` (no ears or nose) and clamp `|z|`. An offset of the full head wraps the ears into wings.
- **The mask look**: deep temple carves, a narrow V jaw, and geometric noise above ~0.0005 m on skin all read as a mask or hammered metal. Keep skin noise tiny. Form comes from the brow, nose, cheek pads and baked AO.
- **Eyes**: real iris ~0.5 of the eyeball radius. Set the upper lid edge at 8 to 13 deg so it covers the top of the iris. If the eyeball glints below the lid, the socket is open there: close it with an orbital-rim ellipsoid.
- **White squares in bloom**: specular spikes on slivers overflow the half-float target. `paintedMaterial` clamps output to 12; do not remove that.
- **Cross-frame culling**: the skirt (B) and torso (U) overlap. Use `inChild`/`inParent` with the rig's waist offset and lean, and cull triangles more than 4 mm inside the other part.
- **Thin shells** (trim bands) need `cell` below the thickness. The inner face is culled automatically.
- **Change the recipe `id`** after editing a shape: the cache key is the id.

## Worked example: a hooded acolyte (sketch)

```js
export const ACOLYTE = {
  id: 'acolyte-v1', seed: 9,
  palette: {skin:[0.75,0.58,0.48], skinDeep:[0.6,0.36,0.3], robe:[0.2,0.22,0.3], robeDeep:[0.1,0.1,0.16],
            sclera:[0.85,0.82,0.76], iris:[0.3,0.4,0.5], pupil:[0.02,0.02,0.02]},
  rig: {waist:[0,0.46,0], lean:0, neck:[0.005,0.29,0], jaw:0.004},
  parts: [
    {part:'skirt', frame:'B', mat:'cloth', col:'robe', col2:'robeDeep'},
    {part:'torso', frame:'U', mat:'cloth', col:'robe', col2:'robeDeep'},
    {part:'head',  frame:'H', mat:'skin',  col:'skin', col2:'skinDeep'},
    {part:'hood',  frame:'H', mat:'cloth', col:'robe', col2:'robeDeep'},
    {part:'hands', frame:'U', mat:'skin',  col:'skin', col2:'skinDeep', at:[0.1,0.06,0]},
  ],
  eyes: {frame:'H', sclera:'sclera', iris:'iris', pupil:'pupil', lid:'skin', lid2:'skinDeep'},
  build() {
    const H = K.head({age: 0.3, brow: 1.1, nose: {len: 0.9}});
    // hood: a 1 cm shell round the skull, open at the face (x > 0.06)
    const hood = {sdf: (x,y,z) => Math.max(H.skull(x,y,z) - 0.018, -(H.skull(x,y,z) - 0.008), x - 0.06),
                  bounds: [-0.13,-0.05,-0.12,0.12,0.22,0.12], cell: 0.005, tris: [500,180], cull: (x,y,z) => H.sdf(x,y,z) < -0.002};
    return {parts: {skirt: K.robeSkirt({height: 0.5}), torso: K.robeTorso({arms: [/* both hands meet in front */]}),
                    head: H, hood, hands: K.hand({pose: 'rest', side: 1})},
            eyes: {r: H.eye.r, open: 11}, anchors: {eye: [H.eye.x, H.eye.y, H.eye.z]}};
  }
};
```

Then run `node tools/npc_stats.mjs ACOLYTE`, write the pose function, and take screenshots.
