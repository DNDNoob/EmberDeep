export const appearanceFields=[
  {key:'cloak',label:'Cloak color',choices:['Default','Rust','Moss','Ocean','Plum','Charcoal','Gold'],
    colors:[null,[0.75,0.27,0.13],[0.26,0.53,0.24],[0.19,0.51,0.77],[0.59,0.29,0.65],[0.29,0.31,0.36],[0.88,0.64,0.22]]},
  {key:'skin',label:'Skin tone',choices:['Peach','Ivory','Amber','Umber','Deep brown'],
    colors:[[0.86,0.65,0.5,1],[0.94,0.77,0.65,1],[0.72,0.46,0.29,1],[0.51,0.3,0.18,1],[0.33,0.19,0.14,1]]},
  {key:'face',label:'Face shape',choices:['Oval','Round','Long','Broad'],
    scales:[[1,1,1],[1,0.87,1.13],[1,1.12,0.9],[1.06,0.99,1.22]]},
  {key:'hair',label:'Hairstyle',choices:['Hood','Cropped','Wave','Braids','Shaved']},
  {key:'hairColor',label:'Hair color',choices:['Chestnut','Black','Copper','Blond','Silver','Teal'],
    colors:[[0.25,0.16,0.1,5],[0.055,0.045,0.05,5],[0.54,0.21,0.09,5],[0.74,0.54,0.28,5],[0.66,0.69,0.72,5],[0.12,0.42,0.39,5]]},
  {key:'beard',label:'Facial hair',choices:['Clean-shaven','Stubble','Mustache','Full beard','Goatee']},
  {key:'tattoo',label:'Face tattoo',choices:['None','Twin lines','Diamond','Dots']}
];

// Three bits per choice keep the saved look and multiplayer presence compact.
appearanceFields.forEach((field,index)=>{field.shift=index*3});
export const appearanceField=Object.fromEntries(appearanceFields.map(field=>[field.key,field]));
export const appearanceChoice=(look,field)=>(look>>field.shift)&7;
export function normalizeAppearance(look){
  if(!Number.isInteger(look)||look<0||look>=2**(appearanceFields.length*3))return 0;
  return appearanceFields.every(field=>appearanceChoice(look,field)<field.choices.length)?look:0;
}
export function cycleAppearance(look,field,direction){
  const current=appearanceChoice(look,field),length=field.choices.length;
  const next=(current+direction+length)%length;
  return look+((next-current)<<field.shift);
}
