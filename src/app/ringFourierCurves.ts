import {validRingLinearMap,type RingLinearMap} from './ringLinearMaps';

/** R * (offset + Σ M[k] [cos((k+1)φ), sin((k+1)φ)]). */
export type RingFourierCurve={offset?:[number,number];harmonics:RingLinearMap[]};

const singularExtrema=([[a,b],[c,d]]:RingLinearMap):[number,number]=>{
  const first=a*a+c*c,second=b*b+d*d,mixed=a*b+c*d;
  const maximum=Math.sqrt(Math.max(0,(first+second+Math.hypot(first-second,2*mixed))/2));
  return [maximum?Math.abs(a*d-b*c)/maximum:0,maximum];
};

/** Match the backend's analytic single-winding/monotone-angle certificate. */
export function validRingFourierCurve(value:unknown):value is RingFourierCurve{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(key=>key!=='offset'&&key!=='harmonics'))return false;
  const maps=data.harmonics;
  if(!Array.isArray(maps)||maps.length<1||maps.length>4||!validRingLinearMap(maps[0]))return false;
  if(maps.slice(1).some(matrix=>!Array.isArray(matrix)||matrix.length!==2||matrix.some(row=>
    !Array.isArray(row)||row.length!==2||row.some(coordinate=>
      typeof coordinate!=='number'||!Number.isFinite(coordinate)||Math.abs(coordinate)>2))))return false;
  const offset=data.offset===undefined?[0,0]:data.offset;
  if(!Array.isArray(offset)||offset.length!==2||offset.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>.5))return false;
  const [minimum,maximum]=singularExtrema(maps[0]);
  const tail=maps.slice(1) as RingLinearMap[];
  const h0=Math.hypot(offset[0],offset[1])+tail.reduce((sum,m)=>sum+singularExtrema(m)[1],0);
  const h1=tail.reduce((sum,m,index)=>sum+(index+2)*singularExtrema(m)[1],0);
  const [[a,b],[c,d]]=maps[0] as RingLinearMap;
  return h0<minimum-.01&&a*d-b*c>maximum*(h0+h1)+h0*h1+.01&&
    (maximum+h1)/(minimum-h0)<64;
}

export const exampleRingFourierCurve=():RingFourierCurve=>({
  offset:[0,0],harmonics:[[[1,0],[0,1]],[[.04,.01],[0,.03]]],
});
