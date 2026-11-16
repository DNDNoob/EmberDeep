# Anthropometry reference for NPCs

Ground truth for face and body proportions. Numbers live in code as `ANTHRO` (`src/anthro.js`, ratios of head height) and every NPC recipe scales from them. `node tools/npc_measure.mjs KEEPER` compares a baked character to this table.

**Sources and honesty note.** Adult male 50th percentile from ANSUR II (2012 US Army anthropometric survey, public domain; stature 1756, head breadth 153, head length 197, bizygomatic 143, menton-sellion 122, interpupillary 64, ear length ~63, ear breadth ~35, ear protrusion ~20, biacromial ~397), the Farkas craniofacial norms (ear length ~ nose length, ear top at brow level, ear bottom at nose base, eye width ~ intercanthal ~ 1/5 face width, mouth width ~ distance between irises, eyeball ~24 mm with a third showing, iris 11.7 mm) and the Loomis canon. Web search worked, but returned only PDF links without extractable numbers, so the values are the published ones I know, rounded; treat +-3 mm as the uncertainty. Old men are a few percent shorter and stooped (`ANTHRO.elderlyStature` 0.96), with longer ears and noses.

Head height (menton to vertex) is 232 mm = 1.0. The unscaled kit head is `HEAD_H` = 0.237 m; a recipe's `headScale` draws it smaller, ratios stay.

| Measure | mm | / head height | Maps to |
|---|---|---|---|
| Head height (menton-vertex) | 232 | 1.00 | `HEAD_H` |
| Head breadth | 153 | 0.66 | `head({skull})` rz (without ears) |
| Bizygomatic (cheekbone) breadth | 143 | 0.62 | cheek spheres `ez + 0.015` |
| Menton-sellion | 122 | 0.53 | chin to nose root |
| Interpupillary distance | 64 | 0.276 | `eye.z` = half of it |
| Intercanthal (inner corners) | 33 | 0.14 | eye opening spacing |
| Eyeball diameter | 24 | 0.103 | `eye.r` = half |
| Eye opening width / height | 30 / 10 | 0.129 / 0.043 | lids: `open` 12, `low` -24 deg for an old man |
| Iris diameter | 11.7 | 0.050 | `eyes.iris` = 0.5 of eyeball radius |
| Nose length (sellion-subnasale) | 52 | 0.22 | `nose.len` |
| Nose width | 35 | 0.15 | `nose.width` |
| Mouth width | 50 | 0.215 | mouth slit, moustache span |
| Ear length | 63 | 0.27 | `ears()` total extent incl. rim and lobe (checked by npc_measure; old men a little more) |
| Ear breadth | 35 | 0.55 of ear length | |
| Ear protrusion (rim from skull) | 20 | 0.085 | `earFlare` 30 deg about the front edge |
| Ear tilt back from vertical | | 15 to 20 deg | `earTilt` 17 deg |
| Biacromial (shoulder joints) | 397 | 1.7 | |
| Bideltoid (over the muscle) | 465 | 2.0 | robe shoulders ~2.7 head widths with sleeves |
| Hand length | 190 | 0.82 | `hand({size})` |
| Stature | 1756 | 7.57 | `proportions.height` / `headScale` |

Placement rules used by the kit: ear top at brow line, ear bottom at the nose base, ear front at about the middle of the head depth and behind the jaw hinge; eyeball front level with the brow-to-cheek line, not in a hole; upper lip (nose base to mouth line) about 0.1 of head height; moustache starts a few mm under the nose base.
