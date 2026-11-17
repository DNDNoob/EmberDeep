// Per-floor looks. Every biome has four named variants (0 is the classic look); pickVariant draws one from a separate dice stream
// so floor layouts never move. `tex` is the VAR number the surface shaders switch on, tint multiplies the albedo,
// wetK scales puddles, fogK/ambK/ambT the haze and ambient light, torch tints the torch, rubbleK adds loose stones, stone tints props.
const W3=[1,1,1];
const V=(name,o)=>({name,wetK:1,tint:W3,fogK:1,ambK:1,ambT:W3,torch:W3,rubbleK:1,stone:W3,...o});
export const VARIANTS=[
  [V('plain',{tex:0}),
   V('flooded',{tex:1,wetK:1.9,tint:[.92,.97,1.02],fogK:1.12,ambK:.92,torch:[.97,.98,1.02],stone:[.9,.95,1]}),
   V('crumbling',{tex:2,wetK:.6,tint:[1.02,.98,.92],rubbleK:3,stone:[.95,.92,.88]}),
   V('sooty',{tex:3,tint:[.86,.84,.82],fogK:1.1,ambK:.88,torch:[1.04,.96,.86],stone:[.72,.7,.68]})],
  [V('plain',{tex:0}),
   V('overgrown',{tex:1,tint:[.94,1.04,.92],wetK:1.1,stone:[.8,1,.8]}),
   V('dripping wet',{tex:2,wetK:1.6,tint:[.9,.98,.98],fogK:1.12,torch:[.98,1,1.02]}),
   V('pale lichen',{tex:3,tint:[1.04,1.05,.93],wetK:.6,ambK:1.15,fogK:.9,stone:[1.1,1.1,1]})],
  [V('plain',{tex:0}),
   V('deep ice',{tex:1,tint:[.86,.95,1.1],wetK:1.3,ambK:1.1,ambT:[.9,1,1.1]}),
   V('snow-dusted',{tex:2,tint:[1.04,1.04,1.04],wetK:.5,fogK:1.2,ambK:1.05}),
   V('black ice',{tex:3,tint:[.72,.76,.86],wetK:1.6,ambK:.85,torch:[1,.95,.9],stone:[.7,.75,.85]})],
  [V('plain',{tex:0}),
   V('ashen',{tex:1,tint:[.88,.9,.94],ambK:.75,ambT:[.9,1.1,1.3],torch:[.98,.96,.98],stone:[.9,.9,.95]}),
   V('molten',{tex:2,tint:[1.06,.96,.9],ambK:1.35,torch:[1,.95,.88],fogK:1.1}),
   V('obsidian',{tex:3,tint:[.8,.78,.9],ambK:.9,rubbleK:1.8,stone:[.6,.6,.7]})],
  [V('yellow wallpaper',{tex:0}),
   V('faded green',{tex:1,ambT:[.74,1.05,.88]}),
   V('salmon',{tex:2,ambT:[1.12,.8,.78]}),
   V('water-stained',{tex:3,wetK:2,ambK:.92,ambT:[.95,.96,.88],tint:[.97,.97,.95]})],
  [V('plain',{tex:0}),
   V('damp and mossy',{tex:1,tint:[.95,1,.95],wetK:2.5,fogK:1.15,ambT:[.92,1.04,.96]}),
   V('chalk white',{tex:2,tint:[1.06,1.06,1.05],ambK:1.18,fogK:1.05}),
   V('smoke-blackened',{tex:3,tint:[.72,.68,.64],ambK:.85,torch:[1.04,.95,.85],stone:[.65,.62,.58]})],
  [V('plain',{tex:0}),
   V('verdigris',{tex:1,tint:[.9,1.04,1],wetK:1.3,ambT:[.92,1.05,1.05],stone:[.85,1,.95]}),
   V('oily wet',{tex:2,wetK:2,tint:[.86,.84,.82],fogK:1.1}),
   V('flaking paint',{tex:3,rubbleK:2.2,wetK:.7,ambK:1.05})],
  [V('teal',{tex:0}),
   V('violet',{tex:1,ambT:[1.12,.82,1.25],stone:[1.1,.9,1.15]}),
   V('amber',{tex:2,ambT:[1.2,1,.7],torch:[1.02,.98,.92],stone:[1.15,1,.8]}),
   V('dim',{tex:3,ambK:.7,fogK:1.1,tint:[.9,.9,.92]})],
];
// four named variants of this biome, plus a small continuous per-floor jitter (colour, light, noise seed) so even the same variant never repeats exactly
export function pickVariant(rng,bi){
  const ix=(rng()*4)|0,v=VARIANTS[bi][ix],j=()=>1+(rng()-0.5)*0.07,b=j();
  const tint=[v.tint[0]*b*j(),v.tint[1]*b*j(),v.tint[2]*b*j()];
  return {...v,ix,bi,tint,fogK:v.fogK*(1+(rng()-0.5)*0.12),ambK:v.ambK*(1+(rng()-0.5)*0.1),seed:Math.floor(rng()*40000)/100};
}
