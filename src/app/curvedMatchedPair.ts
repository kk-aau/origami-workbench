/**
 * Origamica In[3865]/In[3868] saved MatchCurvesPair example.
 * This is the closed-form saved circular pair, not an arbitrary-curve solver.
 */
export type MatchedPoint2=[number,number];
export type MatchedPoint3=[number,number,number];
export type MatchedPairSample={parameter:number;transverse:number;flat:MatchedPoint2;space:MatchedPoint3};
export type MatchedCircleParams={flatRadius:number;spaceRadius:number};
export const MATCHED_CIRCLE_PRESET:MatchedCircleParams={flatRadius:2,spaceRadius:1};
export const MATCHED_PAIR_SOURCE={
  symbolicCell:'In[3865]',numericCell:'In[3868]',
  symbolicFunction:'MatchCurvesPair',numericFunction:'NMatchCurvesPair',
  psi:1,sigma:1,parameterStart:0,parameterEnd:Math.PI,
  transverseStart:-1,transverseEnd:1,
  flatRadius:2,spaceRadius:1,spaceHeight:1,
  machineReadableWolframSamples:false,
} as const;

/** A source-derived analytic circle subfamily; equality is singular in the original frame. */
export function validateMatchedCircleParams(value:unknown):MatchedCircleParams{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('圆弧参数无效。');
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(key=>!['flatRadius','spaceRadius'].includes(key)))
    throw Error('含不支持的圆弧参数。');
  const {flatRadius,spaceRadius}=data;
  if(typeof flatRadius!=='number'||!Number.isFinite(flatRadius)||flatRadius<1.2||flatRadius>4)
    throw Error('平面半径须在 1.2–4 之间。');
  if(typeof spaceRadius!=='number'||!Number.isFinite(spaceRadius)||spaceRadius<1||
    spaceRadius>=flatRadius-.05)
    throw Error('空间半径须至少为 1，且严格小于平面半径。');
  return {flatRadius,spaceRadius};
}

/** Analytic MatchCurvesPair branch for two unit-speed horizontal circles. */
export function sampleMatchedCircularPair(
  s:number,v:number,input:MatchedCircleParams):MatchedPairSample{
  const {flatRadius,spaceRadius}=validateMatchedCircleParams(input);
  if(!Number.isFinite(s)||s<0||s>Math.PI||!Number.isFinite(v)||v< -1||v>1)
    throw Error('圆弧子域仅支持 0≤s≤π、−1≤v≤1。');
  const cosEta=spaceRadius/flatRadius,sinEta=Math.sqrt(1-cosEta*cosEta);
  return {parameter:s,transverse:v,
    flat:[(flatRadius-v)*Math.cos(s/flatRadius),
      (flatRadius-v)*Math.sin(s/flatRadius)],
    space:[(spaceRadius-v*cosEta)*Math.cos(s/spaceRadius),
      (spaceRadius-v*cosEta)*Math.sin(s/spaceRadius),1-v*sinEta]};
}

/** Common (s,v) parametrization of the two saved ruled patches. */
export function sampleSavedMatchedPair(s:number,v:number):MatchedPairSample{
  return sampleMatchedCircularPair(s,v,MATCHED_CIRCLE_PRESET);
}

/** Both first fundamental forms are E=(1-v/R_flat)^2, F=0, G=1. */
export function savedMatchedPairMetric(
  v:number,input:MatchedCircleParams=MATCHED_CIRCLE_PRESET):{E:number;F:number;G:number}{
  const {flatRadius}=validateMatchedCircleParams(input);
  if(!Number.isFinite(v)||v< -1||v>1)throw Error('横向参数超出保存示例。');
  return {E:(1-v/flatRadius)**2,F:0,G:1};
}

export function sampleMatchedCircularPairGrid(
  input:MatchedCircleParams,curveSegments=100,rulingSegments=50):MatchedPairSample[][]{
  const params=validateMatchedCircleParams(input);
  if(!Number.isInteger(curveSegments)||curveSegments<8||curveSegments>200||
    !Number.isInteger(rulingSegments)||rulingSegments<2||rulingSegments>100||rulingSegments%2)
    throw Error('采样密度须为 8–200 条曲线段及 2–100 条偶数母线段。');
  return Array.from({length:curveSegments+1},(_,i)=>
    Array.from({length:rulingSegments+1},(_,j)=>
      sampleMatchedCircularPair(Math.PI*i/curveSegments,-1+2*j/rulingSegments,params)));
}

export function sampleSavedMatchedPairGrid(curveSegments=100,rulingSegments=50):MatchedPairSample[][]{
  return sampleMatchedCircularPairGrid(MATCHED_CIRCLE_PRESET,curveSegments,rulingSegments);
}

export function projectSavedMatchedPoint(point:MatchedPoint3,azimuthDeg:number):MatchedPoint2{
  const az=azimuthDeg*Math.PI/180,elev=28*Math.PI/180;
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [Math.cos(az)*point[0]-Math.sin(az)*point[1],
    -Math.sin(elev)*depth+Math.cos(elev)*point[2]];
}
