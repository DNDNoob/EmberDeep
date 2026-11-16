# Anthropometry reference for NPCs

Ground truth for face and body proportions. Numbers live in code as `ANTHRO` (`src/anthro.js`, ratios of head height) and every NPC recipe scales from them. `node tools/npc_measure.mjs KEEPER` compares a baked character to this table.

**Source.** The real ANSUR II public data (Gordon et al. 2014, US Army anthropometric survey, 6,068 adults, via openlab.psu.edu/ansur2). Percentiles (p5/p50/p95) per group (male, female, and older = age >= 45) are in `src/ansur2_stats.json` (mm; interpupillary breadth is stored in 0.1 mm). `src/anthro.js` turns them into ratios: `anthro(group, pct)` returns `{ratios, mm, headMM}`, and `ANTHRO` is `male_older` p50 (the Keeper). A recipe for another character calls `anthro('female', 'p50')` or `anthro('male', 'p95')` and passes the ratios on (`body({ratios})`).

**Head height is not an ANSUR measure.** We derive it as menton-sellion length + 0.85 * tragion-vertex height (the sellion sits slightly above the tragion level), which gives 233.5 mm for older men, in line with the textbook 232 mm. Face details ANSUR does not measure (eyeball 24 mm, iris 11.7 mm, intercanthal 33, eye opening, nose and mouth size) are Farkas craniofacial norms, constant for every group. Ear tilt and flare are Farkas rules of thumb. Values below are older-male p50 ratios of the 233.5 mm head height, rounded.

Head height (menton to vertex, derived) is 233.5 mm = 1.0. The unscaled kit head is `HEAD_H` = 0.237 m; a recipe's `headScale` draws it smaller, ratios stay.

| Measure | mm | / head height | Maps to |
|---|---|---|---|
| Head height (menton-vertex) | 232 | 1.00 | `HEAD_H` |
| Head breadth | 154 | 0.66 | `head({skull})` rz (without ears) |
| Bizygomatic (cheekbone) breadth | 144 | 0.62 | cheek spheres `ez + 0.015` |
| Menton-sellion | 123 | 0.53 | chin to nose root |
| Interpupillary distance | 64.5 | 0.276 | `eye.z` = half of it |
| Intercanthal (inner corners) | 33 | 0.14 | eye opening spacing |
| Eyeball diameter | 24 | 0.103 | `eye.r` = half |
| Eye opening width / height | 30 / 10 | 0.129 / 0.043 | lids: `open` 12, `low` -24 deg for an old man |
| Iris diameter | 11.7 | 0.050 | `eyes.iris` = 0.5 of eyeball radius |
| Nose length (sellion-subnasale) | 52 | 0.22 | `nose.len` |
| Nose width | 35 | 0.15 | `nose.width` |
| Mouth width | 50 | 0.215 | mouth slit, moustache span |
| Ear length | 67 | 0.29 | `ears()` total extent incl. rim and lobe (checked by npc_measure; old men a little more) |
| Ear breadth | 37 | 0.55 of ear length | |
| Ear protrusion (rim from skull) | 23 | 0.10 | `earFlare` 30 deg about the front edge |
| Ear tilt back from vertical | | 15 to 20 deg | `earTilt` 17 deg |
| Biacromial (shoulder joints) | 413 | 1.77 | shoulder joint centres ~0.105 m each side at Keeper scale |
| Bideltoid (over the muscle) | 513 | 2.20 | robe shoulders ~2.7 head widths with sleeves |
| Chest breadth / depth | 296 / 267 | 1.27 / 1.14 | `body()` ribcage ellipsoid radii |
| Waist breadth / depth | 338 / 262 | 1.45 / 1.12 | belly, waist (elders carry a belly) |
| Hip breadth | 350 | 1.50 | pelvis |
| Shoulder to elbow | 365 | 1.56 | upper arm S to E |
| Elbow to wrist (radiale-stylion) | 268 | 1.15 | forearm E to W |
| Neck circumference | 408 | radius 0.28 | neck column uses 0.6 of it |
| Hand length | 195 | 0.84 | `hand({size})` |
| Stature | 1748 | 7.49 | `proportions.height` / `headScale` |

Placement rules used by the kit: ear top at brow line, ear bottom at the nose base, ear front at about the middle of the head depth and behind the jaw hinge; eyeball front level with the brow-to-cheek line, not in a hole; upper lip (nose base to mouth line) about 0.1 of head height; moustache starts a few mm under the nose base.
