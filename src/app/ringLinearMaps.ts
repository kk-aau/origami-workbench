export type RingLinearMap=[[number,number],[number,number]];

/** Match the certified, orientation-preserving ellipse domain in the backend. */
export function validRingLinearMap(value:unknown):value is RingLinearMap{
  if(!Array.isArray(value)||value.length!==2||value.some(row=>
    !Array.isArray(row)||row.length!==2||row.some(coordinate=>
      typeof coordinate!=='number'||!Number.isFinite(coordinate)||Math.abs(coordinate)>2)))return false;
  const [[a,b],[c,d]]=value as RingLinearMap;
  const determinant=a*d-b*c;
  const first=a*a+c*c,second=b*b+d*d,mixed=a*b+c*d;
  const maximum=Math.sqrt(Math.max(0,(first+second+Math.hypot(first-second,2*mixed))/2));
  const minimum=maximum>0?Math.abs(determinant)/maximum:0;
  return determinant>1e-4&&minimum>=.08&&maximum<=2.5;
}

export const identityRingLinearMap=():RingLinearMap=>[[1,0],[0,1]];
