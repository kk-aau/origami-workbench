export type CurvedCirclePolyhedralParams={
  family:'curved-circle-polyhedral';
  foldAngleDeg:number;
  parameterStartPi:number;
  parameterEndPi:number;
  leftWidth:number;
  rightWidth:number;
  curveSegments:number;
  minimumAngleDeg:number;
};

export const curvedCirclePolyhedralPreset=():CurvedCirclePolyhedralParams=>({
  family:'curved-circle-polyhedral',foldAngleDeg:120,
  parameterStartPi:0,parameterEndPi:1,leftWidth:1,rightWidth:1,
  curveSegments:32,minimumAngleDeg:.5,
});

const finite=(value:unknown,low:number,high:number):value is number=>
  typeof value==='number'&&Number.isFinite(value)&&value>=low&&value<=high;

export function readCurvedCirclePolyhedralParams(
  value:Record<string,unknown>,
):CurvedCirclePolyhedralParams|null{
  if(value.family!=='curved-circle-polyhedral'||Object.keys(value).some(key=>
    !['family','foldAngleDeg','parameterStartPi','parameterEndPi','leftWidth',
      'rightWidth','curveSegments','minimumAngleDeg'].includes(key)))return null;
  const {foldAngleDeg,parameterStartPi,parameterEndPi,leftWidth,rightWidth,
    curveSegments,minimumAngleDeg}={...curvedCirclePolyhedralPreset(),...value};
  if(!finite(foldAngleDeg,30,150)||!finite(parameterStartPi,0,1)||
    !finite(parameterEndPi,0,1)||parameterEndPi-parameterStartPi<.01||
    !finite(leftWidth,.05,4)||!finite(rightWidth,.05,4)||
    leftWidth>=(1-1e-8)/Math.cos(foldAngleDeg*Math.PI/360)||
    !Number.isInteger(curveSegments)||!finite(curveSegments,4,96)||
    !finite(minimumAngleDeg,0,90))return null;
  return {family:'curved-circle-polyhedral',foldAngleDeg,parameterStartPi,
    parameterEndPi,leftWidth,rightWidth,curveSegments,minimumAngleDeg};
}
