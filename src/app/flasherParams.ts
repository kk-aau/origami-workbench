export type FlasherParams={
  family:'flasher';
  rings:number;
  heightOrder:number;
  rotationalOrder:number;
  radialIncrement:number;
  diagonal:'X'|'Y'|'Z';
  minimumAngleDeg:number;
};

export const flasherPreset=():FlasherParams=>({
  family:'flasher',rings:2,heightOrder:2,rotationalOrder:4,
  radialIncrement:.05,diagonal:'Y',minimumAngleDeg:10,
});

// Finite input contract: the existing radial and actual-face budgets determine
// the allowed rotational order. The smallest r1/h1 sector has four facets;
// this is a bounded numeric domain, not an arbitrary-integer claim.
export const FLASHER_RADIAL_ORDER_LIMIT=9;
export const FLASHER_FACE_LIMIT=600;
export const FLASHER_ROTATIONAL_ORDER_LIMIT=Math.floor((FLASHER_FACE_LIMIT-1)/4);

// Origamica In[4197]: HexFlasherGraph3DAssigned, displayed in In[4199].
export const hexFlasherSavedParams=():FlasherParams=>({
  family:'flasher',rings:2,heightOrder:2,rotationalOrder:6,
  radialIncrement:.05,diagonal:'Z',minimumAngleDeg:10,
});

// In[4131]/[4132] define the r4/h1/m5 Y/Z seed topology only. These
// presets solve MakeFlasher with explicit local dr=.05 and a 10 degree
// assignment threshold; they are not the notebook's saved solved Out.
export const fourRingFlasherParams=(diagonal:'Y'|'Z'='Y'):FlasherParams=>({
  family:'flasher',rings:4,heightOrder:1,rotationalOrder:5,
  radialIncrement:.05,diagonal,minimumAngleDeg:10,
});

const finite=(value:unknown,min:number,max:number):value is number=>
  typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;

export function flasherFaceCount(rings:number,heightOrder:number,rotationalOrder:number):number{
  const n=rings*heightOrder;
  let quads=0;
  for(let group=0;group<rings;group++){
    const j=heightOrder*group,i=heightOrder*group-1;
    for(let major=j;major<=n;major++)if(Math.min(j+heightOrder,major)>j)quads++;
    for(let minor=j+1;minor<=n;minor++)if(Math.min(i+heightOrder,minor-2)>i)quads++;
  }
  return rotationalOrder*(2*quads+2*rings)+1;
}

/** Actual parameter limits of the current candidate, also used by the UI. */
export function flasherFactorLimits(params:Pick<FlasherParams,'rings'|'heightOrder'|'rotationalOrder'>):
 {rings:number;heightOrder:number;rotationalOrder:number}{
  const allowed=(r:number,h:number,m:number)=>r*h<=FLASHER_RADIAL_ORDER_LIMIT&&flasherFaceCount(r,h,m)<=FLASHER_FACE_LIMIT;
  const largest=(max:number,predicate:(n:number)=>boolean)=>{
    let result=1;for(let n=1;n<=max;n++)if(predicate(n))result=n;return result;
  };
  return {rings:largest(FLASHER_RADIAL_ORDER_LIMIT,r=>allowed(r,params.heightOrder,params.rotationalOrder)),
    heightOrder:largest(FLASHER_RADIAL_ORDER_LIMIT,h=>allowed(params.rings,h,params.rotationalOrder)),
    rotationalOrder:largest(FLASHER_ROTATIONAL_ORDER_LIMIT,m=>m>=3&&allowed(params.rings,params.heightOrder,m))};
}

export function readFlasherParams(value:Record<string,unknown>):FlasherParams|null{
  if(value.family!=='flasher'||Object.keys(value).some(key=>
    !['family','rings','heightOrder','rotationalOrder','radialIncrement','diagonal','minimumAngleDeg'].includes(key)))return null;
  // Defaults apply only to absent fields; explicit null/undefined is invalid.
  const rings='rings' in value?value.rings:2,heightOrder='heightOrder' in value?value.heightOrder:2,
    rotationalOrder='rotationalOrder' in value?value.rotationalOrder:4,
    radialIncrement='radialIncrement' in value?value.radialIncrement:.05,
    diagonal='diagonal' in value?value.diagonal:'Y',minimumAngleDeg='minimumAngleDeg' in value?value.minimumAngleDeg:10;
  if(!Number.isInteger(rings)||!finite(rings,1,FLASHER_RADIAL_ORDER_LIMIT)||
    !Number.isInteger(heightOrder)||!finite(heightOrder,1,FLASHER_RADIAL_ORDER_LIMIT)||rings*heightOrder>FLASHER_RADIAL_ORDER_LIMIT||
    !Number.isInteger(rotationalOrder)||!finite(rotationalOrder,3,FLASHER_ROTATIONAL_ORDER_LIMIT)||
    flasherFaceCount(rings,heightOrder,rotationalOrder)>FLASHER_FACE_LIMIT||
    !finite(radialIncrement,0,.5)||!finite(minimumAngleDeg,0,90)||
    !(diagonal==='X'||diagonal==='Y'||diagonal==='Z'))return null;
  return {family:'flasher',rings,heightOrder,rotationalOrder,
    radialIncrement,diagonal,minimumAngleDeg};
}
