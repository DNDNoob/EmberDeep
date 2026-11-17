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
| `tools/npc_view.mjs` | Software rasteriser, no browser: flat-shaded baked parts from any angle in ~1 s (iterate on hands, sleeves, ears with it, then check in the game) |
| `tools/npc_shot.mjs` | Headless screenshots of one NPC at standard angles under the same light |

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
drawRecipe()    -> emitS() each part into its frame every frame; eyes and blinking lids
```

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

- Near LOD (within 6 m, Q>=1): about **6.7k triangles (20.2k vertices) for the whole character**, eyes included (Keeper v8: 6725 tris; per part in `node tools/npc_stats.mjs`), plus about 2k vertices of primitive staff. Far LOD: about 40% of that.
- Rough split (v8): head 780, ears 560, beard and hair 700, hands 700 each, torso 540, skirt 520, sleeves 350 each, trims 80 to 120 each, eyes 600 for both. Flat robe panels give triangles to hands and ears.
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
- **Nails and the white glints (root cause, tested).** v7 nails were a separate thin shell (1.8 mm ellipsoid slab); a second try smooth-min'd a raised plate (0.4 mm) into the hand SDF. Both showed silver slivers at every fingertip (and bloom turned them into white glints); removing the plate removed them in an A/B screenshot, while the clamp, F90 and roughness changes alone did not. A sub-millimetre ridge on a 2 to 3 mm mesh makes the normals sweep through every orientation inside a pixel, so some pixel always lines up with the torch. Rule: **no sub-millimetre geometry on skin**. Nails are now paint only (`paint < 0` extrapolates away from `col2`, so lighter than the skin), no extra mesh, no extra material. All Keeper parts are on material ids 12 to 15 (skin 12 is clamped to 2.0, 13 to 15 to 3.0, eyes 5.0), skin roughness is 0.66, and `specularF90` is cut to 0.1 for rough dielectrics (no grazing-angle Fresnel at silhouettes).
- **Shadow fill.** The hand shadow on the sash and sleeve is real (the torch shadow map), but with ambient near zero it came out pitch black and jagged like holes. Sculpted materials get a 0.2 albedo fill in the emissive chunk (`mCh > 0.75`), so a shadow is dark red or gold. The sleeve mouth notches that looked like black marks were real holes at the cuff (see sleeves).
- **Hand definition.** Back of hand (geometry, ~1 mm): metacarpal ridges (`T` lines from the knuckles towards the wrist, width 3.6 mm) with sunken valleys between (`1 - ridge(w 8 mm)`), bigger knuckle spheres (+20% with `age`), raised veins. Palm: thenar and hypothenar ellipsoids, a slight cup between them (rest pose; the grip has the rod channel instead), creases (thenar arc, proximal and distal transverse) as detail-mask paint, so the shader bump and a darker tint draw them. Wrist: oval, narrower than the palm, with the ulnar (little-finger side, back) and radial styloid bumps. Budget 700 tris per hand.
- **Sleeves hang.** `dress()` sleeves are no longer a tube round the arm. The sleeve tube's centre line drops along world up (`up`, default [0,1,0]) by `hang(t)` and its radius grows by the same amount: shoulder 0, elbow 13 mm, mouth `hang` (0.8) x (bell radius - wrist radius - ease). The top of the cloth therefore follows the arm line with `ease` 6 mm, while the underside hangs 2 x hang lower; the mouth ring and the cuff band follow the dropped mouth (`cEnd`). Detail: compression creases at the inner elbow (weighted by the direction into the bend), cloth gathered there (bulge), hanging folds measured from straight down and strongest on the underside. The armhole seam is a 1.5 mm welt plus a dark line where the sleeve surface meets the robe (`base()` ~ 3 mm). Pitfall: when the mouth moves, move the cuff region too (it was centred on the arm end, so the band lost its lower half).
- **Shoulders.** Joints at ANSUR biacromial (z +-0.115 = 1.62 heads), deltoid radius 0.036 so the outer deltoid is at about bideltoid/2 = 0.156 with the sleeve; shoulder joint y 0.318 (old men droop). The trapezius is a slope from the neck (Y.neck - 0.062) to the acromion (Y.shoulder - 0.014), about 20 degrees, not a flat shelf; a clavicle capsule runs from the notch to the acromion (shows as a soft ridge under the robe); the robe has a soft fold from the shoulder point down toward the chest.
- **Ear front.** A real ear has no rim down its front edge. The helix is a C that starts at the crus (a ridge entering the concha above the tragus), goes up and over and down the back to the lobe. The front edge below the crus has no rim and no thickness: the plate grows out of the skull (`fa` = smoothstep over the first 12 mm), so there is no step. The tragus is a small flap in front of the canal, flush with the head at its front. Only the rear edge stands off the head (flare 30 deg). Check with `npc_shot --views ear,ear34`.
