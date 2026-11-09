import {flasherFaceCount} from './flasherParams';

/** MakeParaboloidalFlasher plus CutParaboloidalFlasher, with separate angle thresholds. */
export type ParaboloidalFlasherParams={
  family:'paraboloidal-flasher';
  rings:number;
  heightOrder:number;
  rotationalOrder:number;
  focalLength:number;
  radialIncrement:number;
  diagonal:'X'|'Y'|'Z';
  minimumAngleDeg:number;
  cutMinimumAngleDeg:number;
};

export const paraboloidalFlasherPreset=():ParaboloidalFlasherParams=>({
  family:'paraboloidal-flasher',rings:2,heightOrder:2,rotationalOrder:4,
  focalLength:6,radialIncrement:.05,diagonal:'Y',minimumAngleDeg:10,
  cutMinimumAngleDeg:10,
});

/** In[4208]'s MakeParaboloidalFlasher input plus a local 10° cut for a planar sheet. */
export const deepBowlIn4208CutParams=():ParaboloidalFlasherParams=>({
  family:'paraboloidal-flasher',rings:2,heightOrder:3,rotationalOrder:6,
  focalLength:5,radialIncrement:.2,diagonal:'Y',minimumAngleDeg:20,
  cutMinimumAngleDeg:10,
});

const finite=(value:unknown,min:number,max:number):value is number=>
  typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;

export function readParaboloidalFlasherParams(value:Record<string,unknown>):ParaboloidalFlasherParams|null{
  if(value.family!=='paraboloidal-flasher'||Object.keys(value).some(key=>
    !['family','rings','heightOrder','rotationalOrder','focalLength','radialIncrement',
      'diagonal','minimumAngleDeg','cutMinimumAngleDeg'].includes(key)))return null;
  const rings=value.rings??2,heightOrder=value.heightOrder??2,
    rotationalOrder=value.rotationalOrder??4,focalLength=value.focalLength??6,
    radialIncrement=value.radialIncrement??.05,diagonal=value.diagonal??'Y',
    minimumAngleDeg=value.minimumAngleDeg??10,cutMinimumAngleDeg=value.cutMinimumAngleDeg??10;
  if(!Number.isInteger(rings)||!finite(rings,1,2)||
    !Number.isInteger(heightOrder)||!finite(heightOrder,1,3)||rings*heightOrder>6||
    !Number.isInteger(rotationalOrder)||!finite(rotationalOrder,3,8)||
    flasherFaceCount(rings,heightOrder,rotationalOrder)>600||
    !finite(focalLength,.1,1e7)||!finite(radialIncrement,0,.5)||
    !finite(minimumAngleDeg,0,180)||!finite(cutMinimumAngleDeg,0,180)||
    (diagonal!=='X'&&diagonal!=='Y'&&diagonal!=='Z'))return null;
  return {family:'paraboloidal-flasher',rings,heightOrder,rotationalOrder,
    focalLength,radialIncrement,diagonal,minimumAngleDeg,cutMinimumAngleDeg};
}
