export type LinkedFirstBandPolyhedralParams={
  family:'linked-first-band-polyhedral';
  curveSegments:number;
  minimumAngleDeg:number;
};

export const linkedFirstBandPolyhedralPreset=():LinkedFirstBandPolyhedralParams=>({
  family:'linked-first-band-polyhedral',curveSegments:32,minimumAngleDeg:.5,
});

export function readLinkedFirstBandPolyhedralParams(
  value:Record<string,unknown>,
):LinkedFirstBandPolyhedralParams|null{
  if(value.family!=='linked-first-band-polyhedral'||Object.keys(value).some(key=>
    !['family','curveSegments','minimumAngleDeg'].includes(key)))return null;
  const {curveSegments,minimumAngleDeg}={...linkedFirstBandPolyhedralPreset(),...value};
  if(typeof curveSegments!=='number'||!Number.isInteger(curveSegments)||
    curveSegments<8||curveSegments>96||typeof minimumAngleDeg!=='number'||
    !Number.isFinite(minimumAngleDeg)||minimumAngleDeg<0||minimumAngleDeg>90)return null;
  return {family:'linked-first-band-polyhedral',curveSegments,minimumAngleDeg};
}
