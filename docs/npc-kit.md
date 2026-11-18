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
| `tools/npc_measure.mjs` | Head height, head width, crown height and heads-tall ratio of a recipe |
| `tools/npc_mesh_check.mjs` | Scans baked meshes for NaN, zero normals and degenerate triangles (what makes white squares on real GPUs) |
| `tools/npc_view.mjs` | Software rasteriser, no browser: flat-shaded baked parts from any angle in ~1 s (iterate on hands, sleeves, ears with it, then check in the game). `RECIPE=file.mjs` bakes a reduced recipe (head + the one part you work on) in a second or two |
| `tools/npc_shot.mjs` | Headless screenshots of one NPC at standard angles under the same light (views include `beard`, `beard34`, `sleeve`, `sleeveS`) |
| `src/npc_hair.js` | Hair cards (v11): `hairAtlas` (procedural strand atlas), `Cards` (ribbon collector, LOD meshes), `traceSurface`; the v10 lock functions are still there but unused |
| `src/npc_cloth.js` | Cloth simulation (v11): `SdfGrid`, `Cloth` (PBD), `clothDress` (robe + bell sleeves laid out round a `K.body()`), `clothParts` (parts, LODs, paint, AO, band coordinates) |
| `tools/npc_grip.mjs` | Checks that the staff hand stays locked on the rod over the animation (idle and talking); exits 1 above 1 mm |

## Inspect in Blender

```
node tools/npc_export_glb.mjs                  # KEEPER -> /mnt/project-files/emberdeep/blender/keeper.glb (near LOD) and keeper-far.glb
node tools/npc_export_glb.mjs ILSE --out DIR   # other recipe / folder
```

Pure Node (no browser): it bakes the recipe, poses it in the rest pose (head straight, same frame maths as `humanoidFrames`/`emitS`, drape blend included) and writes a binary glTF with one named mesh and node per part (skirt, hem, torso, sleeve0, sash, head, ears, hair, brows, moustache, beard, gripHand, restHand, eyeL_ball ..., staff). Each mesh has normals, `COLOR_0` (palette colour blended by the paint channel) and custom attributes `_MATID` (shader material id), `_DETAIL`, `_AO`. Materials are plain PBR materials named `skin`, `cloth`, `hair`, `trim`, `eye`, `wood`. Metres, y up, the figure faces +Z.

In Blender: File > Import > glTF 2.0. Select a part and hide others with H / Alt+H in the outliner. In Viewport Shading choose Solid with Color = Attribute (Blender 4: Color > Attribute, then pick `Col`/`Color`), or Material Preview for the named materials; the custom attributes show in Object Data properties > Attributes. Check the geometry with Overlays > Statistics and Wireframe. Re-export after every recipe change (the file has no link to the recipe). Verify a file from Node by loading it with `GLTFLoader.parse` and counting meshes.

## Pipeline

```
recipe.build()  -> part specs {sdf, bounds, cell, tris:[near,far], cull, paint}
bakePart()      -> surface nets on a fine grid (narrow band)
                -> simplify to tris[0] (near LOD) -> simplify again to tris[1] (far LOD)
                -> flatten: project onto the surface, SDF normals, paint + detail mask + baked AO
drawRecipe()    -> GPU posing: each baked part is uploaded once as a static geometry (emitS with an identity frame), parts that share a
                   frame are merged, and every frame only a model matrix per group is set from the frame {p,R} and the figure scale
```

**GPU posing (v9).** Nothing is transformed per vertex on the CPU any more. `gpuGroups(baked)` (game.js) groups the recipe's parts by frame (B, U, H, grip, rest, ...; the eyeballs, irises and lower lids join the head group, pre-translated to the eye centres) and builds one `THREE.Mesh` per group and LOD on first use (lazy, cached on the baked object). The mesh uses the shared painted material (`charMesh.material`: same shader, same clamps), `matrixAutoUpdate = false` and a model matrix `[scale*R | p]` written by `setMat4` each frame; frustum culling uses a bounding sphere, and the meshes are hidden (`GPU_RIGS`, reset each frame) when the NPC is not drawn. Eyelids are their own group: the matrix is `H * T(pivot) * Rz(lidAngle) * T(-pivot)`. **Drape parts** (`drape: [y0, y1]`: neck, beard) get a private material with a small vertex-shader blend between the part's frame and `D` (`uRel = frame^-1 * D`, `uDr = (y0, y1, 1/(y1-y0))`, smoothstep weight from the local y, normals blended and renormalised), with matching depth and distance materials so their shadows follow. Result: the Keeper's `buildNpc` went from 0.65 ms (23.6k vertices written into `CH` and re-uploaded each frame) to 0.10 ms per call and 8 draw calls. Props (staff, lantern, belt gem) are still primitives in `CH`. `__game.NPC_T` counts CPU ms, triangles and draw calls; `node tools/npc_perf.mjs` prints them. `tools/npc_shot.mjs --blink 0` and `--lod N` force the eyelids and the LOD.


The simplifier spends triangles where the shape bends: a nose keeps its triangles, a flat robe panel loses them. Shading stays smooth because normals come from the SDF, not from the triangles. So set the budget with `tris`, and set `cell` only fine enough to capture the smallest feature. Aim for a raw grid of about 4 to 10 times the near budget.

## Recipe format

```js
export const ILSE = {
  id: 'ilse-v1', seed: 77,                       // change id whenever the shape changes
  palette: {skin: [0.92,0.71,0.57], skinDeep: [0.8,0.45,0.38], ...},
  rig: {waist: [0,0.42,0], lean: 0, neck: [0.003,0.29,0], jaw: 0.004, headTilt: 0},
  proportions: {headScale: 0.62, frames: ['H', 'J']},   // see Proportions
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
| `ears(H,p)` | `size`, `x` (front edge of the ear), `y` (mid-height), `flare` (rad, default 30 deg: how far the plate swings out about its front edge), `tilt` (default 17 deg back); see "Keeper v8" for the front edge | Separate SDF part for both ears, sized from `ANTHRO` (0.27 of head height, total extent incl. rim). Ear space is pivoted on the front edge, which is sunk into the skull, so the rear rim stands ~20 mm off it. Helix (rolled C rim, thicker at top and back), scapha plate, recessed concha bowl, antihelix Y ridge, tragus, antitragus, lobe, wall to the skull. Cell 2.1 mm, ao radius 6 mm so the bowl darkens. Add `{part:'ears', frame:'H', mat:'skin'}`. `head()` has no ears of its own |
| `head(p)` | `age` 0..1 (sag, nasolabial fold, eye bags, wrinkle mask), `jaw` (width), `chin`, `brow` (ridge weight, 1.2+ for deep-set eyes), `nose:{len,width,droop,bulb}`, `cheek:{bone,sag}`, `ears`, `eye:{x,y,z,r}` (centre, half spacing, radius), `skull:[rx,ry,rz]`, `neck` | Returns `.eye`, `.noseTip`, `.mouth`, plus `.skull`/`.jawSdf` for parts that wrap the head |
| `hairCap(H,p)` | `thick`, `crown` (bald line height; raise above 0.2 for a full head), `front`, `hang` | Horseshoe fringe; culls itself inside the head |
| `brows(H,p)` | `size`, `droop`, `lift` | Sits on the brow ridge, so it is always attached |
| `moustache(H,p)` | `size`, `droop` | Rides on the upper lip: its top is ~4 mm below the nose base (philtrum gap, never merges with the nostrils), droops over the mouth corners, mouth slit and lower lip stay free. Small smooth-min (4 mm) |
| `beard(H,p)` | `length`, `width`, `thick`, `fork` 0..1, `cheekLine` | A shell over the jaw plus a hanging mass; draw it in frame `J`. Shell thickness fades to zero towards the cheek line (it sinks into the skin: sparse, soft edge, clumps from the strand noise) and is full below the chin. It starts below the lower lip, so the lip shows |
| `hand(p)` | `pose:'rest'|'grip'|'point'`, `side` ±1 (the Z the thumb is on), `size`, `age` (knuckles), `gripR` (radius of the held thing), `curl`, `spread` | Wrist at the origin, fingers along +X, back of the hand +Y. `grip` returns `.grip` = `{p, d, alpha}`: a point on the held axis, its unit direction (slightly diagonal across the palm) and its angle from hand Z about Y. Pose the hand with `K.mul3(K.rotX(PI/2), K.rotY(-alpha))` so the rod stands vertical |
| `robeSkirt(p)` | `height`, `hem`, `waist`, `folds`, `depth` | `.base` is the smooth silhouette |
| `robeTorso(p)` | `arms:[{S,E,W,r:[shoulder,elbow,mouth],back}]`, `chest`, `waist`, `sash:{y,h}` | Returns `.trims.sash`, `.trims.cuffs[]`, `.ends[]` (sleeve mouths for hands), `.body` |
| `trimBand(base, region, p)` | `thick`, `bounds`, `cell`, `tris` | A real raised band (hem, sash, cuff) over cloth. Add `band.covers` to the cloth's cull |
| `eyeRig(p)` | `r`, `iris` (fraction of r, real eyes ~0.5), `open` (deg, upper lid edge; lower is sleepier), `low`, `arch`, `lidT` | Built from `recipe.eyes`; lids rotate to blink |
| helpers | `chain`, `inChild`, `inParent`, `basis`, `rotX`, `rotZ` | `inChild`/`inParent` evaluate another frame's SDF, for culling across frames |

A custom part is any `{sdf, bounds, cell, tris, cull?, paint?}` written with the primitives from `sculpt.js`.

## Proportions (read this before building a new human)

Build the head at its natural size, then set the figure's proportions in the recipe, not by editing the head SDF:

```js
proportions: {headScale: 0.6, frames: ['H', 'J'], height: 0.93},   // height: uniform scale of the whole figure (default 1); frames drawn at headScale (head, jaw/beard; the eyes follow the frame in recipe.eyes)
```

`drawRecipe` scales those frames' meshes about the neck origin (positions only; normals are rotation-only), so hair, brows, moustache, beard and eyes stay attached and head turn, nod and jaw still work. The unscaled kit head is about 0.237 m chin to crown (4 heads tall on a 0.96 m body: cartoonish), so `headScale` is the knob. Lengthen the body to match: `robeTorso({len})` stretches chest, collar and cowl (the arms in `ARMS` are in U coordinates, so move the shoulders up yourself), `robeSkirt({height})` and `rig.waist` / `rig.neck` set the leg length and neck height. Run `node tools/npc_measure.mjs KEEPER` to read the result.

| Target | Value |
|---|---|
| Height | 7 to 7.5 heads (heroic 8). The Keeper: 7.25 (head 0.142 m, crown at 1.03 m; was 4.06) |
| Head width (ears included) | ~0.75 of head height (0.106 m) |
| Shoulders (outer, with sleeves) | 2.5 to 3 head widths. Keeper 0.28 m |
| Hand | wrist to fingertip ~ chin to hairline, i.e. 0.7 to 0.75 head heights (~0.1 m; `hand({size: 1})` already is) |
| Neck | ~0.5 of head width across; the head's neck cylinder is scaled with it |
| Elbow / waist / crotch | ~3 / 3.0 / 3.5 heads down from the crown (the robe hides the rest) |
| Overall height | `proportions.height` scales everything uniformly (meshes, rig offsets, anchors, props). The Keeper is built 1.03 m crown at height 1, shown at 0.93: crown 0.956 m (player eye height is 0.62 m, wall 1.25 m, Ilse/Brakk label heights 0.98/0.72). Props in game.js multiply by it; update `headY0` in `buildNpc` too |
| Beard / hair | live in head frames: they scale with the head. Lengthen `beard({length})` to compensate |

## Drape: parts that hang instead of following the head

A long beard in the head frame swings through the chest when the head pitches or yaws. Mark it as a drape part and give the rig a drape frame:

```js
rig:   {..., drape: {follow: 0.3, push: 0.012}},        // D = torso frame at the neck, turning 30% of the head angles, 12 mm forward
parts: [{part: 'beard', frame: 'J', ..., drape: [-0.015, -0.13]}],   // local y where the blend starts and is complete
```

Vertices below `drape[0]` blend (linear blend skinning, smoothstep) from the part's frame to `D`, so the top of the beard grows from the jaw and follows it, the tip hangs near-vertical on the chest, and there is no seam. `tools/npc_shot.mjs --pose YAW,PITCH` fixes the head angles to check extremes (try `0,-0.45` and `1,0.4`).

## White squares on real GPUs

Real cause, found by toggling things in software GL at Q2 (`?npc` default): **bloom blocks from fireflies**. Bright specular pixels on skin and hair silhouettes (grazing GGX, close torch, a few HDR units) go through `UnrealBloomPass` and its coarse mips, which spread each such pixel into a soft 8 to 32 px square that flickers as the camera moves. Evidence: the blocks vanish with the head hidden, with bloom strength 0, and with the final colour clamp at 2.5, and they stay with the shader NaN guards, GTAO off, dust off and shadows off. The meshes are clean (no stray islands, no slivers, no NaN: `tools/npc_mesh_check.mjs`). Fix: sculpted characters (material ids 12 to 15) are clamped to 3.0 at the end of the fragment shader (eyes 5.0, the rest 12.0). **Rule: every material a sculpted character uses must be 12 to 15 (or eye 8): put new parts (nails, teeth, props) on `skin`/`cloth`/`hair`/`trim`, never on `wood`/`metal` or a new id, or they escape the clamp.** Skin roughness is 0.52; never add a glossy overlay shell. Earlier fixes (bump fade, bounded tilt, saturate in rim `pow`, NaN bit test) stay: they guard real NaNs. Debug recipe: in a page script set `__game.KEEPER.parts = KEEPER.parts.filter(...)` and `__game.bakeRecipe(KEEPER).eyes = null`, re-run `studio()`, and compare screenshots.

## Budgets

- Three LODs, `tris: [near, mid, far]` per part (each simplified from the previous one). Keeper v10: **near 18.1k triangles (54.2k vertices)**, mid 8.4k (25.1k), far 3.2k (9.6k); Keeper v9: **near 15.1k triangles (45.2k vertices)** within 6 m at Q>=1, **mid 7.1k (21.3k)** to 9.5 m (and for Q0 within 8 m), **far 3.6k (10.8k)** to 14 m and for Q0 beyond 8 m. Per-part budgets in `node tools/npc_stats.mjs`: head 1900/780/300, ears 1000/560/200, hands 1700/700/240 each, skirt 1500/520/200, torso 1150/540/210, sleeves 800/350/130, beard 1100/430, hair 450/260/100, brows 300, moustache 420, neck 260, hem 380, sash 260, cuffs 170; eyes 480 near / 330 far (both).
- Grid cells are about 0.6x the v8 values (head 3.8 mm, ears 1.5 mm, hands 1.7 mm, robe 5.8 mm, sleeves 4.8 mm, trims 3.4 mm) so the raw surface-net mesh stays 4 to 10x the near budget. Finer cells also reveal finer noise in the SDFs (the chest cloth got more crinkled); lower the noise amplitude, not the cell, if that is too much.
- Thin open shells (hair, moustache) can stall the simplifier far above their budget (link condition); `simplify` re-queues refused edges with a more permissive flip test, and a cell of 6.5 mm for hair / 2.3 mm for the moustache keeps them reaching their far budgets.
- Bake: `sculptGen`, `simplifyGen`, `flattenGen` and `bakePartGen` are generators that yield inside their loops; `bakeRecipeIdle` runs them in 6 ms slices every 10 ms (no hitch longer than a few ms; `bakeRecipe` drains the rest synchronously, `node tools/npc_stats.mjs` prints the totals). Keeper v9 total CPU time: about 5.2 s in the browser (6.5 s in Node), against 3.7 s for v8 with 3x fewer triangles; it is spread over roughly 15 s after the 1.5 s load delay.
- All characters share `CH.cap` = 90k vertices per frame for the CPU-posed props only; sculpted parts do not use it.
- Check budgets with `node tools/npc_stats.mjs KEEPER` (`--obj DIR` dumps the near meshes) and `node tools/npc_perf.mjs`.
- Weave moire: the cloth weave (1500 rad/m) and its bump fade out with the screen-space derivative of its phase (`wFade`, about 1 rad per pixel), not only with distance, so it never aliases at any resolution.

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

## Body first, clothes over it (the standard way to dress a human)

Do not sculpt a robe or tunic as one blob. Build the body as a distance field, then make each garment a shell over it. Only the garments (and skin that shows: head, neck, hands) are meshed; the body SDF is never drawn, it just defines the shapes.

```js
body: {stoop: 0.05, belly: 0.5, narrow: 1, waistNarrow: 0.86, arms: ARMS},   // ratios come from ANTHRO (ANSUR II); override with ratios:{chestDepth: 1.2}
garments: [
  {type: 'robe', ease: 0.012, hang: 0.03, collar: {r: 0.037}},                // torso offset by ease, hangs straight down from the belly
  {type: 'sleeve', arm: 0, ease: 0.011, bell: 0.044, cuff: {len: 0.028}},     // tube around arm 0, widening to a bell mouth, gold cuff band
  {type: 'sleeve', arm: 1, ease: 0.011, bell: 0.042, cuff: {len: 0.028}},
  {type: 'sash', y: 0.017, h: 0.027, thick: 0.006}
],
// build():  const B = K.body(this.body), D = K.dress(B, this.garments);   parts: {...D.parts}   anchors: D.ends[i].at / .dir for the hands
```

- `K.body(p)` (frame U, waist origin): ribcage (two ellipsoids), belly, pelvis, neck, trapezius slopes, from ANTHRO ratios times `unit` (head height of the figure, default `HEAD_H*0.6`). `stoop` shears the upper body forward, `belly` pushes the belly out. Arms are rigid and separate: `{S, E, W, r:[deltoid, elbow, wrist]}` joint centres in U coordinates, each its own SDF with only a 10 mm blend, so there is a real armpit and a gap between the arm and the ribs. They are posed by the same frames as before (U), so breathing and sway still apply. Choose S/E/W lengths from ANTHRO (`upperArmLength` 1.56 heads, `forearmLength` 1.15) and give the elbows some abduction (z 0.165 against ribs at 0.09) or the sleeves fuse with the torso.
- `K.dress(B, list)` returns `{parts, ends, torsoBase, sleeveBase}`. `parts.torso` is `body.torso - ease` with the lower section extruded straight down from `hang` (the cloth does not cling to the belly), a neck opening, a collar roll and a cowl, and folds from noise. `sleeve0..n` are round cones around the arms (`ease`, widening to `bell`), with elbow crook and forearm folds. `sash`, `cuff0..n` are `trimBand`s over those shells (the cuff region is radially capped: see the cuff-slab pitfall).
- Layering: every shell is its own mesh. Each culls what lies inside another shell (4 mm), so where sleeve meets robe there is a real intersection crease. Both get `aoSdf` (baked AO also sees the other shell) and a `paint` that darkens (toward `col2`) within 14 mm of the other shell, so the join reads in shading.
- Skirt: `robeSkirt({aspect})` makes the top oval (belly deeper than wide) fading to round at the hem, so it continues the robe's hanging section. The lower garment is still the `skirt` part in frame B.
- Budget: torso ~570 tris, each sleeve ~380, no extra cost for the body. Keeper total 19.9k vertices near.
- Ilse would use `garments: [{type:'tunic'...}]`: a tight robe shell (`ease` 0.004, `hang` at the hips, no flare) plus fitted sleeves (`bell` 0) and trousers as two leg tube shells around leg SDFs added to `body()` (not built yet), boots as the lower part of those tubes with a cuff. Brakk (seated): pass a `body` with a pelvis lower and thighs forward, armour as shells with big `ease` on chest and shoulders (pauldrons are sleeve caps with a larger `ease`) and no hang. Neither is rebuilt yet; `dress()` currently implements robe, sleeve and sash.

## Human proportions: read `docs/anthropometry.md`

`src/anthro.js` exports `ANTHRO` (ratios of head height from the real ANSUR II data in `src/ansur2_stats.json`; `anthro(group, pct)` for other populations) and `HEAD_H`. Defaults of `head()` (`eye.r`, `eye.z`) and `ears()` come from it, so a new NPC gets anatomical eyes (24 mm ball, 64 mm IPD, 11.7 mm iris) and ears (0.27 head height, 30 deg flare, 17 deg tilt) for free. `node tools/npc_measure.mjs NAME` prints the recipe's ratios against the reference with a tolerance column. Lessons from the Keeper v5:

- **Eyes**: a deep orbital carve in front of the eyeball (the old 6 mm pit) read as a dark ring and sunken eyes. Keep only a shallow hollow, put the eyeball front level with the brow and cheek, keep paint around the socket light (0.2) and use a small pink spot at the inner corner as the tear duct. Lids: `open` 12, `low` -24, `lidT` 2.1 mm for an old man.
- **Ears**: build them pivoted on the front edge and flare the plate out; a plate centred on the skull lies flat and reads as an oval stuck on the cheek. Check front view: the rims must be visible beside the head.
- **Moustache and beard**: put the moustache top below the nose base, not on the nose tip; end the beard shell with a thickness fade (negative thickness inside the skin), not a hard `smax` plane; keep the mass below the lower lip.


## Keeper v7 notes: neck, beard over robe, folds, hands, camera

- **Neck and collar.** `K.neck(H)` is a skin part in frame H (same cone as the head's own neck stub, continued down with a trapezius flare, Adam's apple and neck cords). Give it `drape: [-0.04, -0.17]` in the recipe so its lower end stays on the torso when the head turns or nods; it overlaps the head's stub by 1 cm, so there is no gap. The robe no longer wraps the neck: `body().torsoCloth` is the torso without the neck column (trapezius starts at the neck base, `Y.neck - 0.088`), and `dress()` carves an oval neckline scoop (`collar: {dx, ny, rx, ry, rz}`) with a rolled collar band standing 6 mm off the cloth. The head pivot (`rig.neck`) is 0.418 so there are ~4 cm of visible neck.
- **Beard on the robe.** `beard({chest})` takes a function giving the distance to the clothes in the beard's own coordinates. The beard marches along +X at z = 0 to find the cloth profile per height, carries the hanging mass out to `profile + gap + half thickness`, and cuts away what is still inside the cloth. The recipe builds `robeInBeard` from `D.torsoSolid` (cloth without the neckline scoop) using the drape frame D (neck pivot, follows the head 30%) so the beard rests on the chest. Length 0.3, width 1.25.
- **Robe fold recipe.** Skirt: round tubular ridges (`pow(0.5+0.5cos, 0.7)`), widths varied by noise warp, amplitude `0.012 + 0.085 (1-t)^1.5` (deep at the hem), narrow secondary folds, radial pinch folds under the sash (26 per turn), hem flare with lumps that break on the floor, front overlap step plus groove (`x > 0`). Torso: 9 hanging folds from shoulders and chest, pinch folds above and below the sash (kept 4 mm clear of the band), overlap seam running diagonally from the neck to the sash. Sleeves: sag (`sag`, gravity warp of the forearm), accordion at the elbow crook, sag under the elbow, 6 hanging folds that deepen towards the bell (zero inside the cuff), bell 0.056 / 0.044. **Rules:** trim bands (`hem`, `sash`, `cuff`) must use the folded cloth SDF as their base (not the smooth one) and `coverTol` 0.011, or cloth ridges poke through the band; a band's `bounds` must reach `bell radius + 0.04` or it is clipped (that made holes in the bell sleeves).
- **Hands.** `K.handAngles(pose, opts)` returns joint angles `{f: [[mcp, pip, dip, spreadDeg] x4], t: [[yaw, pitch] x3]}` (radians; flexion positive towards the palm; thumb yaw cumulative); `K.hand({angles})` poses any hand, `pose:'rest'|'grip'|'point'` generate them (grip derives the finger angles from circles of radius `gripR` + finger radius, knuckle at 50 deg). Proportions are ANSUR II older male (hand 195 mm, breadth 90 mm; `MM` = figure metres per real mm): knuckle positions, three phalanges per finger with tapering radii, thumb from the side of the palm (CMC joint, metacarpal, two phalanges, thenar pad), knuckle bumps (bigger with `age`), nails as a second part (`hand().nails`, lighter palette colour), raised veins and tendons on the back, wrinkle mask on every joint. `hand().joints` gives joint positions. Budget 480 tris per hand + 60 per nail set. The Keeper's staff radius is 0.0105 (= `gripR`).
- **Player camera.** World scale: 1.75 m man = 0.973 m Keeper, so 0.556. Eye height `EYE` (game.js, single constant) went 0.62 to 0.90 m = the Keeper's eye level (0.916 m). `CAM_TOP` stops the camera rising into the 1.25 m ceiling on jumps; humanoid player avatars and name tags scale with `AV = EYE/0.84`. Vertical FOV stays 72 (a wider FOV makes close things look smaller, not taller).

## Pitfalls we hit

- **Trim region slabs cut through other cloth** (the "air gap" band across the Keeper's chest): `trimBand`'s `region` for a sleeve cuff was only a slab perpendicular to the forearm (`-0.028 < t < 0.016` along the arm axis), and `covers` (used to cull cloth hidden under the band) is region AND near the body surface. The slab extends infinitely sideways, so it also culled the torso surface wherever the plane crossed the chest, leaving a jagged hole where you saw the inside. Always bound a band's region radially too (`rad - (sleeveRadius + 0.025)`). If a hole appears in cloth, test `part.cull` for the culling band first.

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


## Keeper v8 notes: grip, nails, hand definition, sleeves, shoulders, ear front

- **Grip from the staff radius.** `gripPlan(gR, side)` (npc_kit.js) derives the whole grip from the rod radius. The rod is a line in hand coordinates, below the knuckles at the height where the first phalanx leaves the knuckle at ~74 deg round the rod; it is slightly diagonal (a least-squares line through the per-finger rod centres, about 8 deg from hand Z). Each finger is a closed loop: its joints lie on the circle round the rod (radius = distance knuckle to rod centre, about rod radius + 0.7 finger radius), the chord of every phalanx on that circle gives the flexion, so a 10.5 mm (figure) staff gives mcp 74 to 89, pip 91 to 98, dip 53 to 58 degrees; a thicker rod opens the fist, a thinner one closes it. The thumb is solved by a small seeded IK (cost: tip on the outside of the index middle phalanx, no penetration of the fingers or the rod) and runs over the index and middle fingers. The palm gets a channel cut along the rod (smooth `smax`) and a roll of flesh on the far side, so the rod sits in the palm instead of in it. The staff in game.js is placed at `gripAxis` (a 3D point on that line). Dev check without the game: render the baked hand with a tiny rasteriser (`node tools/npc_view.mjs`, a 1 s flat-shaded rasteriser for baked parts, great for grips, sleeves and ears) or `npc_shot --views gripF,gripB,gripT` (lat shifts the camera sideways).
- **Nails and the white glints (root cause, tested by A/B screenshots).** The silver slivers on every fingertip (bloom made them white glints on real GPUs) came from the v8 nail paint, not from the material clamp: the paint channel was driven below 0 (extrapolating away from `col2` to get paler nails), and negative or out-of-range paint values give a sparkling highlight at the silhouette of every fingertip. Removing the nail geometry alone did not help; removing the negative paint did. v7's separate thin nail shell (1.8 mm slab) had the same kind of problem (sliver triangles). Rules: **keep the paint channel inside 0..1, put no sub-millimetre geometry on skin, and no glossy overlay shells.** Nails are now just a faint lightening (`(1 - nm)` towards the skin colour, no extra mesh). All Keeper parts use material ids 12 to 15 (skin 12 clamped to 2.0, 13 to 15 to 3.0, eyes 5.0), skin roughness is 0.66, and `specularF90` is cut to 0.1 for rough dielectrics.
- **Shadow fill.** The hand shadow on the sash and sleeve is real (the torch shadow map), but with ambient near zero it came out pitch black and jagged like holes. Sculpted materials get a 0.2 albedo fill in the emissive chunk (`mCh > 0.75`), so a shadow is dark red or gold. The sleeve mouth notches that looked like black marks were real holes at the cuff (see sleeves).
- **Hand definition.** Back of hand (geometry, ~1 mm): metacarpal ridges (`T` lines from the knuckles towards the wrist, width 3.6 mm) with sunken valleys between (`1 - ridge(w 8 mm)`), bigger knuckle spheres (+20% with `age`), raised veins. Palm: thenar and hypothenar ellipsoids, a slight cup between them (rest pose; the grip has the rod channel instead), creases (thenar arc, proximal and distal transverse) as detail-mask paint, so the shader bump and a darker tint draw them. Wrist: oval, narrower than the palm, with the ulnar (little-finger side, back) and radial styloid bumps. Budget 700 tris per hand.
- **Sleeves hang.** `dress()` sleeves are no longer a tube round the arm. The sleeve tube's centre line drops along world up (`up`, default [0,1,0]) by `hang(t)` and its radius grows by the same amount: shoulder 0, elbow 13 mm, mouth `hang` (0.8) x (bell radius - wrist radius - ease). The top of the cloth therefore follows the arm line with `ease` 6 mm, while the underside hangs 2 x hang lower; the mouth ring and the cuff band follow the dropped mouth (`cEnd`). Detail: compression creases at the inner elbow (weighted by the direction into the bend), cloth gathered there (bulge), hanging folds measured from straight down and strongest on the underside. The armhole seam is a 1.5 mm welt plus a dark line where the sleeve surface meets the robe (`base()` ~ 3 mm). Pitfall: when the mouth moves, move the cuff region too (it was centred on the arm end, so the band lost its lower half).
- **Shoulders.** Joints at ANSUR biacromial (z +-0.115 = 1.62 heads), deltoid radius 0.036 so the outer deltoid is at about bideltoid/2 = 0.156 with the sleeve; shoulder joint y 0.318 (old men droop). The trapezius is a slope from the neck (Y.neck - 0.062) to the acromion (Y.shoulder - 0.014), about 20 degrees, not a flat shelf; a clavicle capsule runs from the notch to the acromion (shows as a soft ridge under the robe); the robe has a soft fold from the shoulder point down toward the chest.
- **Ear front.** A real ear has no rim down its front edge. The helix is a C that starts at the crus (a ridge entering the concha above the tragus), goes up and over and down the back to the lobe. The front edge below the crus has no rim and no thickness: the plate grows out of the skull (`fa` = smoothstep over the first 12 mm), so there is no step. The tragus is a small flap in front of the canal, flush with the head at its front. Only the rear edge stands off the head (flare 30 deg). Check with `npc_shot --views ear,ear34`.


## Keeper v9: clothing design and props (reusable kit features)

All procedural: geometry for what changes the silhouette, shader patterns for the rest. Nothing here is a texture.

- **Embroidery from a band coordinate.** A part can carry a per-vertex band attribute `aBand = (u, v, motif)`: `u` runs along a band in motif cells (an integer count round a closed loop, so there is no seam; `flatten` unwraps it per triangle with `bandWrap`), `v` runs 0..1 across it (not clamped, so it stays linear across big triangles), `motif` picks the pattern. `trimBand(base, region, {motif, cells, uv, rib})` builds it: `uv(x,y,z,out)` sets `out = [s, v]`, `cells` is the cell count along `s`, `rib` raises a piping (m) along the band edges (the only geometry; the pattern itself is shader paint). `bandCoords()` / `constBand(motif)` are the helpers for other parts. The stitched-diamond look of the `trim` material stays for parts without a motif. Motifs (see `embroidery()` in `MAT_GLSL`, game.js): **1** rows of ember flames with a bright core and a bead between them, in dark ember ink on gold thread (hem, cuffs); **2** Greek key (meander, sash); **3** the same key in gold thread worked into cloth (stole border, on the `cloth` material); **4** polished metal (brooch, keys); **5** leather grain (pouch). Border lines run along both edges of every band. The pattern fades its antialiasing width with the screen-space derivative, and the raised ink adds a little bump. Paint stays in 0..1.
- **Garment options in `dress()`**: sash `{motif, rib, cellAspect}`, sleeve cuff `{motif, rib, cellAspect, tris, cell}`, robe/sleeve/stole `wear` (a function from `wearPaint`, added to the paint channel). `wearPaint({vary, freq, dirt, dirtY, seed})` gives low-frequency colour variation and dirt that builds up towards the floor; give the skirt a darker brown-red `col2` (`robeDirt`) so the paint reads as dirt, not as shadow. `robeSkirt({rag})` and `hemLift(rag)`: **worn hem** `rag = {amp, notches, depth, width, seed}` raises the bottom edge by noise plus a few frayed V-cuts (cloth by 45%, the trim band by 100%, so the band edge is ragged and the cloth shows beneath it). Use the returned `skirt.lift(x, z)` in the hem band's `region` and `cull`.
- **Stole / mantle**: `garments: [{type: 'stole', gap, thick, yoke, zc, w, y0, border, motif, lower, wear, tris, cell}]` builds a separate shell (part `stole`) at `gap` above the robe and sleeve caps: a yoke over the shoulders (front dips into a V, lower at the back and over the arms) and two lappets of width `w` at `±zc` ending at `y0`. It follows `min(robe, sleeves, lower)` (`lower` = the skirt's smooth field in U coordinates, for lappets that hang below the waist), is restricted to where the torso (not a forearm) is the nearest body, leaves the neckline open wider than the collar, and carries its border as band coordinates (`v` = distance to the free edge over `border`). `dress()` also returns `stoleSolid` (put it in the beard's `chest` field so the beard rests on the stole) and `stoleOuter` (a field whose zero is the outer surface, to pin things on). Pitfall: do not simplify a patterned band into huge triangles with a *clamped* v; the pattern then smears over whole triangles.
- **Props on a surface**: `surfacePoint(field, origin, dir)` marches to a zero crossing and returns `{P, n}`; `brooch(P, n, up, {r})` (round clasp with a raised rim, boss paint 1 = `col2` garnet and six beads), `pouch(P, n, up, surf, {size})` (leather sack, gathered neck with drawstring, scalloped flap, back clipped flat to `surf`), `keyRing(P, n, up, surf, {size})` (ring with three keys fanned out, interlocked bows, notched bits). `up` is world up in the part's frame (`[sin(lean), cos(lean), 0]` for U); the frame at P tilts `up` into the surface so hanging things follow the skirt's slope. All are rigid parts on frame U, so they breathe and lean with the torso.
- **Keeper layout**: gold hem with flames (25 cells), gold cuffs with flames (8 cells), gold sash with a Greek key (10 cells), indigo stole with a gold key border and a brass brooch with a garnet boss on the left lappet, leather pouch on the staff-side hip, three brass keys on a ring on the front hip.


## Keeper v10: hair as locks, wizard sleeves, locked grip

### Hair (`src/npc_hair.js`, reusable)

Hair is no longer one smooth slab. Beard, moustache, brows (and the fringe cap's shading) are built from **locks**: tapered tubes (round cones along a polyline) that overlap like layered tufts, follow S-shaped paths along the growth direction, and thin to a point at the tip. Geometry carries the clumps (3 to 10 mm), the shader carries the strands (0.5 to 2 mm).

Geometry (`npc_hair.js`):

| Function | What it does |
|---|---|
| `lockSet(list, {k, pad, ref})` | Union of locks `{pts, rad, id}`; per-lock padded bounding boxes keep `eval(x,y,z)` cheap (about 100 locks cost little more than one SDF). `info(x,y,z,o)` gives the nearest lock's `[u along, v across, id]`; `rootT` 0 root .. 1 tip (for paint) |
| `traceSurface(field, [[y,z]...])` | Marches along -X to find the surface of a field at each (y, z) and returns points and normals; each sample brackets the previous x, so a path costs about 12 evaluations per point |
| `lockFromTrace(trace, {R, off, root, taper, tip, sink})` | Lock lying on that surface: `off` pushes it outwards (overlay layers), the root is buried (`sink`) so nothing stubby sticks out of the skin, radius profile `lockRadius` (thin root, full third, long taper to `tip`) |
| `lockFromPath(fn, {n, R, tip})` | Lock along a free curve `fn(s)`, for moustache and brows |
| `tipWisps(lock, rng, {s0, count, spread, extend})` | Thin locks leaving the parent near its end and fanning out sideways: the separated, wispy tips |
| `rng(seed)` | Small deterministic generator, so a recipe bakes identically every time |

How the beard is built (`K.beard`): the old smooth envelope (broad at the jaw, taper, chest-aware cut) stays as the inner mass, inset by 3 mm. On its surface lie three layers of locks: a full-length under-layer (14 across the jaw, centre longest, defines the silhouette), shorter overlay tufts that start lower and sit 2 mm proud (their blunt ends step over the layer below), and loose wisps near the edge and tip. Lock positions are given relative to the beard's width at each height (`zeta`), so they converge towards the tip like real hair. The inset fades out on the cheek, so there a thin stubble shell grows out of the skin. Options: `locks`, `tufts`, `wisps`, `inset`, `seed`; `length`, `width`, `thick`, `chest` as before. The moustache fans 7 locks per side out of the philtrum (a gap under the nose, parted in the middle) over the lip corners; the brows are 13 tufts per side that grow up and out at the inner end and out and down at the outer end.

Per-vertex flow coordinates: a part spec may carry `band(x,y,z,o)` (the same `aBand` attribute the embroidery uses). Hair uses `o = [u, v, skinProximity]`: `u` along the growth direction, `v` across it, and 0..1 closeness to the skin. They must be **continuous over the surface** (beard: `u = -y`, `v = z / halfWidth(y) * 0.045`; moustache and brows: rotated `|z|`, `y`). A first attempt took them from the nearest lock, which jumps at every seam between locks; the shader fades strands where the coordinate jumps (`fwidth`), so they vanished almost everywhere.

Shader (`paintedMaterial`, material 14):

- Strands: two layers of value noise stretched along `u` (period 1.7 mm and 0.65 mm across `v`, wandering a little along the length), stretched in contrast (value noise alone is flat), modulate albedo and a procedural bump (`mHairH`). Each layer fades to its mean by cycles per pixel (`fwidth(v) * freq` from 0.25 to 0.75), so nothing shimmers or moires at range.
- Colour: grey/white strands, occasional dark strands, yellowed strands (`yel`), roots darkened by the paint channel, and a grey-brown stubble tint within 7 mm of the skin (the third band value), which is the root blend on the cheeks and under the lip. Albedo is capped at 0.54 (gamma), so the torch cannot turn it flat white.
- Highlight: a dim Kajiya-Kay streak across the strands. The flow tangent is rebuilt from the screen derivatives of `u` and `v` (`dP/du`), exposed as `mTan`, and added to `directSpecular` in `RE_Direct_Physical` (`pow(sin, 40) * 0.035`, light colour clamped to 4). The clamp at the end of the fragment shader (3.0 for sculpted materials) is unchanged, so bloom still cannot firefly.
- `flatten` got an `aoFloor` option and hair parts use `ao: 0.006, aoFloor: 0.6`: deep valleys between locks were black holes at the default 0.25.

LODs: thin tubes cannot be simplified below a floor (every collapse breaks the link condition, so a 4500-triangle beard stalled at 2250). A part spec may therefore carry `lods: [{sdf, cell, tris:[n]}, ...]`: those LODs are meshed from their own field (locks inflated by 1.2 and 4.2 mm, coarser cell) instead of simplifying the previous one. The beard, moustache and brows use it; the clumps are what a viewer sees at range anyway.

Triangle budget: locks need triangles: near beard 3800 (was 1500), moustache 750, brows 450. To stay at about 54k near vertices the hands (1300), ears (650), skirt, head, stole, keys and torso were trimmed.

### Wizard sleeves (`dress()`, sleeve garment)

A sleeve is the smooth union of two shapes: **A** hugs the arm (shoulder cap to wrist, ease 6 mm, so the top of the shoulder and forearm stay close) and **B**, a pouch of cloth that hangs straight down in world space (`up`, pass `UP` = world up in U coordinates) from the mid forearm: its centre line drops by `drop` at the cuff and its radius grows to `pouch`. The cuff opening is the section of A and B, a teardrop with the wrist in its upper part and the cloth edge `drop + pouch` (Keeper: 100 mm and 85 mm) below it, whatever the arm angle. The inside is a hollow whose wall follows the folded outer surface (8 mm), 7 cm deep, painted with the deep colour. The cuff band uses the same field and follows the opening. Options: `pouch`, `drop`, `up`, `ease`, `wristEase`, `hangElbow`, `pouchBlend`, `folds`; the two Keeper sleeves differ (staff arm 50/50 mm, resting arm 43/40 mm). Folds: compression creases at the inner elbow, long drape folds from the forearm top over the pouch (7 around, amplitude growing with the pouch), sagging cloth under the elbow.

The whole sleeve is one rigid mesh, so there is no elbow junction to blend. Arms are not meshed (hands carry a wrist stub that shows inside the cuff).

### Locked grip (`buildKeeperSculpt`)

The staff foot stands on the floor and the staff hand sits at a **fixed point of the figure's base frame** (`U0`, no breathing, no sway), so the hand cannot slide along the rod. The torso still breathes; the arm absorbs it: the sleeve and cuff are drawn in a frame `arm0` = `U` rotated about the shoulder (`anchors.shoulder0`) so that the wrist stays on the hand (one-bone aim; residual at the cuff 2 mm). Any recipe can use this: give the part `frame: 'arm0'`, and add `shoulder0` and `gripAt` to the anchors. `node tools/npc_grip.mjs` checks it in the browser: grip height on the rod over 40 animation times, idle and talking, must vary by less than 1 mm (v9: 18.1 mm).


Keeper v10 costs: bake CPU time about 12 s in the browser (beard 6 s: about 100 locks in a 2.4 mm grid, plus two coarser LOD fields), still sliced by `bakeRecipeIdle`; per frame CPU 0.3 ms, 9 draw calls (the extra one is the `arm0` frame).


## Keeper v11: hair cards and simulated cloth

Both systems replace SDF sculpting of hair and loose cloth. Everything is still generated by code at load; the only texture is the strand atlas (`DataTexture` built by `hairAtlas()`).

### Hair cards (`src/npc_hair.js`, `K.beard / K.moustache / K.brows`)

- **Atlas**: `hairAtlas(512)` returns a 512x512 RGBA array: four 128x512 tiles (u across the card, v along it, root at v = 0): 0 dense clump, 1 wispy tip, 2 sparse curly, 3 ragged. Strands are anti-aliased noisy curves with per-strand tone (white, grey, yellowed), tapered tips, alpha. `hairTex()` in game.js wraps it in a mipmapped DataTexture, uniform `uStrand`.
- **Cards**: `new Cards()`, `cards.ribbon(pts, nor, {w (half width, m or s => m), variant 0..3, lift, root/tip (paint), ao, keep (0 = silhouette card, always kept), round})` lays a ribbon along a polyline on a surface (lateral axis = tangent x normal; vertex normals bend across the card so it shades like a lock). `cards.build([{keep, segStep, wScale}, ...])` returns one mesh per LOD (stride 9, `.band` = (u across, v along, 2 + variant)). `onSkin(field, p, off)` (npc_kit) snaps a point to `off` metres above a field, for moustache and brow roots.
- **Recipe**: a hair builder returns the solid inner mass as the part spec (low envelope, darker paint, inset 3 mm, cell 4.8 mm, ~650 tris) and `.cardsPart = {cardsDirect}`. The recipe adds a second part `{part: 'beardCards', frame: 'J', mat: 'hair', cards: true, drape: [...]}` (`cardsDirect` is a function: `bakePartGen` calls it at bake time and sanitises the meshes, no sculpting). The Keeper beard is ~330 cards in layers (two shingled rows of full-length cards, a fill layer, wisps, tip strays), 650 mass triangles, bake 0.2 s for the cards.
- **Shader** (material 14): when `vBand.z > 1.5` the vertex is a card: sample the atlas (tile from `vBand.z - 1.5`), alpha test with a small per-pixel hash threshold (no MSAA here, so no alphaToCoverage), alpha boosted by the mip level so far cards do not vanish, albedo = atlas tone x palette x paint x AO capped at 0.56, Kajiya-Kay highlight along `dP/dv` (`mTan`). Same 3.0 output clamp as the other sculpted materials, so no fireflies. Cards do not cast shadows (their group sets `castShadow = false`; the mass does) and are skipped at Q0, where the solid mass carries the hair.
- **Costs**: each cards group is its own draw call (3 for the Keeper: beard, moustache, brows); alpha-tested, depth correct, no sorting.

### Cloth (`src/npc_cloth.js`)

1. **Layout** (`clothDress(B, opts)`): the robe is an nu x nv grid of rings (Keeper 72 x 50): the upper 18 rows walk down the offset torso surface from the neckline to the waist (arc-length rows from a geodesic walk per azimuth), the lower 32 rows go down the smooth skirt silhouette (table of `skirt.base` radii) to the floor with seeded pleats growing towards the hem and three rows lying on the floor. Sleeves are 24 x 26 rings round the arm S-E-wrist axis, radius = arm + 18 mm growing into a bell. Rest lengths come from the layout, times `gather` (robe 1.10: cloth wider than the body it hangs on, so folds persist).
2. **Simulation** (`Cloth`, Verlet / PBD): stretch (stiff), shear, bending (skip-one distances, soft), diameter springs in sleeves, pins (neckline, sash row, shoulder rows), floor, and SDF colliders (`SdfGrid`: body SDF sampled once on a 7.5 mm narrow-band grid, an analytic underskirt from the skirt table, thickness per cloth, friction). All in B (world-aligned) coordinates so gravity is -y and the floor is y = 0. 90 steps x 8 iterations for the robe, 80 for each sleeve; about 1.0 s, sliced by `yield` (the first part that needs it runs it, `ensure()` is shared).
3. **Output** (`clothParts(cd, opts)`): parts `torso` (U, rows above the waist), `skirt` + `hem` (B), `placket` (3 columns down the front, trim material, Greek key), `sleeveN` + `cuffN` (U; sleeve 0 in `arm0`). LODs are column/row strides of the same grid (1, 2/2, 4/3) with normals and AO from the fine grid. Paint = wear functions; AO from the cavity (how far a vertex lies below the mean of its neighbours); band coordinates (u along the band in cells, v across, motif) feed the embroidery shader; hem notches are cut quads. The sheet is single, drawn double sided; the cloth shader darkens back faces (`gl_FrontFacing`) so sleeve mouths and the hem inside read as cloth.
4. **Rules**: the SDF garments from `dress()` are not baked any more but still exist as fields (stole, beard `chest`, props rest on them; stole gap 12 mm so simulated folds do not poke through). Do not put cloth parts in the cull of other SDF parts. Pin rows and `gather` are the knobs for fold depth; `pleat` seeds the fold amplitude. For another NPC: `K.body()`, a skirt SDF with `.base`, then `clothDress` / `clothParts` and list the parts in the recipe with their frames.

Keeper v11 costs: bake about 4.9 s in Node (6.3 s CPU in the browser before the last trims) (cloth 1.0 s, hair cards 0.25 s, beard mass 0.5 s), near 22.3k triangles (66.9k vertices), mid 10.0k, far 4.3k; 11 draw calls. Grip lock unchanged (0 mm).
