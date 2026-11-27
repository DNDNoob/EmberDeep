// Kepler-47 orbital elements from Orosz et al. (2019), in AU, days, and solar masses.
// Phase and display tilt are chosen for the scene rather than tied to an observation epoch.
export const BINARY={
  a:0.08145,e:0.0288,period:7.4483648,phase:0.2,
  primaryMass:0.957,secondaryMass:0.342
};
export const PLANETS=[
  {id:'b',name:'Yuron',a:0.2877,e:0.021,period:49.4643,phase:0.4,tilt:0.04,radiusEarth:3.05},
  {id:'d',name:'Sollel',a:0.6992,e:0.024,period:187.366,phase:1.1,tilt:0.12,radiusEarth:7.04},
  {id:'c',name:'Obera',a:0.9638,e:0.044,period:303.227,phase:2.2,tilt:0.05,radiusEarth:4.65}
];

export function orbitPolar({a,e,period,phase},day){
  const mean=2*Math.PI*(day%period)/period+phase;
  let eccentric=mean;
  for(let i=0;i<6;i++)eccentric=mean+e*Math.sin(eccentric);
  const angle=Math.atan2(Math.sqrt(1-e*e)*Math.sin(eccentric),Math.cos(eccentric)-e);
  return [a*(1-e*Math.cos(eccentric)),angle];
}

export function binaryPolar(day){
  const [radius,angle]=orbitPolar(BINARY,day);
  const mass=BINARY.primaryMass+BINARY.secondaryMass;
  return [[radius*BINARY.secondaryMass/mass,angle+Math.PI],[radius*BINARY.primaryMass/mass,angle]];
}

export function orbitalPosition([radius,angle],tilt=0){
  const z=radius*Math.sin(angle);
  return [radius*Math.cos(angle),-Math.sin(tilt)*z,Math.cos(tilt)*z];
}
