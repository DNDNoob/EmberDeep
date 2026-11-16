# Procedural art guide for Door Simulator

Every surface, creature and character in Door Simulator is made from math at load time or in a shader. No photos, no painted textures, no downloaded models. This guide is the house style for building new areas and characters that way. It borrows its toolbox from [Abyssal Garden](https://github.com/Noniv/abyssal-garden) (MIT), an underwater scene in which everything is generated: terrain, two million kelp leaves, corals, fish and a stone whale tail.

## The core idea

Describe a shape as a **signed distance field (SDF)**, a function that says how far a point is from the surface (negative inside). Shapes combine with simple math. Turn the field into triangles once, at load time. Add detail with **noise**, and finish it in the **shader** with lighting tricks. Seed everything, so one seed always gives the same world, which also keeps multiplayer in sync.

```
idea → SDF (primitives + smooth-min + noise) → mesh (surface nets, once) → pose/instance → shader (palette, rim, subsurface, glow) → fog/bloom
```

## 1. Shapes: SDFs and smooth blending

- Start from a few primitives: sphere, ellipsoid, capsule, round cone, box.
- Join them with **smooth-min** `smin(a, b, k)` instead of overlapping separate meshes. This is what turns a "pile of capsules" into one skin with natural joints: a neck that flows into shoulders, a nose that grows out of a face.
- Carve with **smooth-max** (eye sockets, tunnels, arches, cracks).
- Keep `k` (blend radius) proportional to the part: about 0.01 m on a face, 0.05 m on a torso, 2-3 m on terrain.
- Lay out big things by hand with a few numbers (Abyssal Garden places its mesas, arches and holes as short arrays), then let noise do the rest. A designer-readable list of centres and radii beats a fully random generator.

## 2. Detail: noise

- **fbm** (stacked value or simplex noise) for soft lumps, cloth folds, erosion.
- **Worley / cellular** noise for cracks, scales, pits, cobbles, cells.
- **Domain warping** (feed noise into the position before sampling more noise) for anything organic or alien. It is the cheapest way to stop things looking like math.
- **Ridged noise** `1 - |n|` for veins, wrinkles and rock strata.
- Bake detail into geometry when it changes the silhouette (robe folds, beard locks, rock overhangs); keep it in the shader when it only changes colour or roughness (skin mottling, wood grain, rust).

## 3. Meshing

- **Naive surface nets** on a voxel grid (one vertex per cell that crosses the surface, quads between them). It is short, robust and gives smooth, evenly spaced triangles. Normals come from the SDF gradient (central differences).
- Size the grid to the part: about 4-6 mm cells for a face, 1-2 cm for a body, 0.5-1 m for terrain.
- Build two levels of detail (fine and coarse grid) and switch by distance.
- Cache meshes. Sculpting happens once at load or on first use, never per frame.

## 4. Characters

- Sculpt each **rigid part** (head, torso, hands, beard) as its own SDF mesh and keep posing those parts with the existing frame system in `src/game.js` (`subF`, `emit`). This keeps every animation (breathing, head tracking, blinking, talking) and avoids skinning.
- Eyes stay separate glossy spheres so blinking keeps working.
- Silhouette first: the character must read from 10 m away in a dark corridor. Then the face. Then the small stuff.
- Secondary motion comes from math in time: sway `sin(t*f + phase(position))`, stronger towards the tips (hair, beard, hems, tentacles), as Abyssal Garden does for its leaves.
- Creatures follow the same recipe. Abyssal Garden builds its mantas from a parametric grid (span to outline via power and gaussian curves) and its whale tail from smooth-min capsules. Use parametric surfaces for flat, finned or winged shapes and SDFs for blobby or bony ones.

## 5. Surfaces and shading

- Colour from **palettes**, not textures: per-material base colours, varied by a hash of position, plus the cosine palette `a + b*cos(2π(c*t + d))` for anything iridescent or magical.
- **Fresnel rim** `pow(1 - n·v, 3)` to separate shapes from dark backgrounds. Essential in a game lit mostly by torches.
- **Fake subsurface** for skin, leaves, wax and fungus: let a little light through when back-lit and warm up the shadow edge (wrap lighting).
- **Triplanar** sampling of a baked noise texture at a few scales for large world surfaces, so there are no UV seams.
- Keep the material-id system in `paintedMaterial` (one id per surface type) and add ids rather than one-off shaders.

## 6. Atmosphere

- Fog with real in-scattering (`(1 - exp(-a*d)) / a`) tinted per area, so depth reads through colour.
- Bloom from an HDR target for lanterns, runes and eyes.
- Light shafts and caustics where an area has a strong light source.
- Each area gets one dominant light colour and one accent; everything else is near neutral.

## 7. Performance budget (target: GTX 1660 Ti laptop, also phones on low)

- Instance anything that repeats (moss, pebbles, mushrooms, bones) and cull by a coarse grid; merge neighbouring visible cells into one draw.
- Per-frame CPU posing is the bottleneck for characters: about 20k vertices for a close NPC, far fewer at range.
- Every effect needs a low-quality path (`Q === 0` stays Lambert, no extras).
- Abyssal Garden adapts resolution from GPU timings; worth copying if frame times become a problem.

## Checklist for a new area or character

1. Write the shape as a short list of hand-placed primitives.
2. Blend with smooth-min, carve with smooth-max.
3. Add noise detail: geometry for silhouette, shader for colour.
4. Mesh once with surface nets; two LODs.
5. Assign material ids; add rim and subsurface where it helps.
6. Animate with time-based math on frames or vertices.
7. Seed it from the floor seed.
8. Screenshot near and far, then on low quality.
