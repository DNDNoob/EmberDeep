// anthro.js - human face/body proportions as ratios of HEAD HEIGHT, derived from the real ANSUR II public data
// (Gordon et al. 2014; openlab.psu.edu/ansur2), percentiles in src/ansur2_stats.json (mm; weight 0.1 kg; interpupillarybreadth in 0.1 mm).
// anthro(group, pct) picks a population: group 'male' | 'female' | 'male_older' | 'female_older' (older = age >= 45), pct 'p5' | 'p50' | 'p95'.
// ANTHRO (default male_older p50: the Keeper) is the ratio table; ANTHRO_MM the raw millimetres; HEAD_MM the derived head height.
// Multiply a ratio by the head height of the figure (the kit head is `HEAD_H` = 0.237 m unscaled) to get metres.
// Head height (menton to vertex) is NOT an ANSUR measure. We derive it: menton-sellion length + 0.85 * tragion-vertex height
// (the sellion sits a little above the tragion level, so sellion-vertex is ~0.85 of tragion-vertex); it comes out at ~233 mm for
// older men, matching the textbook 232 mm. Face details ANSUR lacks (eyeball, iris, intercanthal, eye opening, nose, mouth) are
// Farkas craniofacial norms in mm, constant across groups.
import STATS from './ansur2_stats.json' with {type: 'json'};
export const HEAD_H = 0.237;   // the unscaled kit head, metres
const FARKAS_MM = {intercanthal: 33, eyeball: 24, eyeOpeningWidth: 30, eyeOpeningHeight: 10, iris: 11.7, noseLength: 52, noseWidth: 35, mouthWidth: 50};
export function anthro(group = 'male_older', pct = 'p50') {
  const G = STATS[group];
  if (!G) throw new Error('anthro: unknown group ' + group);
  const v = k => { const e = G[k]; if (!e) throw new Error('anthro: no ANSUR measure ' + k); return e[pct]; };
  const circR = k => v(k) / (2 * Math.PI);       // circumference -> radius of the equivalent circle
  const mm = {
    stature: v('stature'), headLength: v('headlength'), headBreadth: v('headbreadth'), bizygomatic: v('bizygomaticbreadth'),
    mentonSellion: v('mentonsellionlength'), interpupillary: v('interpupillarybreadth') / 10, tragionVertex: v('tragiontopofhead'),
    earLength: v('earlength'), earBreadth: v('earbreadth'), earProtrusion: v('earprotrusion'),
    biacromial: v('biacromialbreadth'), bideltoid: v('bideltoidbreadth'), handLength: v('handlength'), handBreadth: v('handbreadth'),
    chestBreadth: v('chestbreadth'), chestDepth: v('chestdepth'), waistBreadth: v('waistbreadth'), waistDepth: v('waistdepth'), hipBreadth: v('hipbreadth'),
    upperArmLength: v('shoulderelbowlength'), forearmLength: v('radialestylionlength'), shoulderHeight: v('acromialheight'), neckBaseHeight: v('cervicaleheight'),
    crotchHeight: v('crotchheight'), elbowHeight: v('elbowrestheight'),
    upperArmRadius: circR('bicepscircumferenceflexed'), elbowRadius: circR('forearmcircumferenceflexed'), wristRadius: circR('wristcircumference'), neckRadius: circR('neckcircumference'),
    ...FARKAS_MM
  };
  const head = mm.mentonSellion + 0.85 * mm.tragionVertex;
  const ratios = Object.fromEntries(Object.entries(mm).map(([k, x]) => [k, x / head]));
  ratios.earWidthOverLength = mm.earBreadth / mm.earLength;
  ratios.earTilt = 17 * Math.PI / 180;    // ear long axis leans back from vertical (Farkas)
  ratios.earFlare = 30 * Math.PI / 180;   // rim stands off the skull by this angle
  ratios.eyeVisible = 1 / 3;              // fraction of the eyeball visible between the lids (vertical)
  ratios.elderlyStature = 0.96;           // old men are a few percent shorter and stooped (vs the young adult p50)
  return {ratios, mm, headMM: head};
}
const DEF = anthro();
export const ANTHRO = DEF.ratios, ANTHRO_MM = DEF.mm, HEAD_MM = DEF.headMM;
