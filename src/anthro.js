// anthro.js - human face/body proportions as ratios of HEAD HEIGHT (menton to vertex), so every NPC recipe scales from them.
// Values in mm are the adult-male 50th percentile (ANSUR II / Farkas norms, see docs/anthropometry.md); head height 232 mm.
// Multiply a ratio by the kit head height `HEAD_H` (0.237 m, the unscaled kit head) to get kit metres.
export const HEAD_MM = 232, HEAD_H = 0.237;
const r = mm => mm / HEAD_MM;
export const ANTHRO_MM = {
  stature: 1756, headLength: 197, headBreadth: 153, bizygomatic: 143, mentonSellion: 122, interpupillary: 64, intercanthal: 33,
  earLength: 63, earBreadth: 35, earProtrusion: 20, noseLength: 52, noseWidth: 35, mouthWidth: 50, eyeball: 24,
  eyeOpeningWidth: 30, eyeOpeningHeight: 10, iris: 11.7, biacromial: 397, bideltoid: 465, handLength: 190
};
export const ANTHRO = Object.fromEntries(Object.entries(ANTHRO_MM).map(([k, v]) => [k, r(v)]));
// derived rules of thumb
ANTHRO.earWidthOverLength = 0.55;       // ear breadth / ear length
ANTHRO.earTilt = 17 * Math.PI / 180;    // ear long axis leans back from vertical
ANTHRO.earFlare = 25 * Math.PI / 180;   // rim stands off the skull by this angle
ANTHRO.eyeVisible = 1 / 3;              // fraction of the eyeball visible between the lids (vertical)
ANTHRO.elderlyStature = 0.96;           // old men are a few percent shorter and stooped
