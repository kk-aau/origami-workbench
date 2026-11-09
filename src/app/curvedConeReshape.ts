/**
 * Exact circular-cone subdomain of Origamica ReshapeCone3D/NReshapeCone3D
 * saved In[3902/3903/3907/3908]. No general Darboux ODE or FOLD export.
 */
export type ConeReshapeMode='flatten'|'curl';
export type ConePoint3=[number,number,number];
export type ConeReshapeParams={thetaDeg:number;normalCurvature:number};
export type ConeReshapeSample={s:number;v:number;source:ConePoint3;target:ConePoint3};
export const CONE_RESHAPE_PRESET:ConeReshapeParams={thetaDeg:30,normalCurvature:.7};
export const CONE_RESHAPE_SOURCE={
  analyticCells:['In[3902]','In[3903]'],numericCells:['In[3907]','In[3908]'],
  analyticFunction:'ReshapeCone3D',numericFunction:'NReshapeCone3D',
  parameterStart:0,parameterEnd:Math.PI,radialStart:0,radialEnd:1,
  machineReadableWolframSamples:false,
} as const;

export function validateConeReshapeParams(value:unknown):ConeReshapeParams{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('圆锥重塑参数无效。');
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(key=>!['thetaDeg','normalCurvature'].includes(key)))
    throw Error('包含不支持的圆锥重塑参数。');
  const {thetaDeg,normalCurvature}=data;
  if(typeof thetaDeg!=='number'||!Number.isFinite(thetaDeg)||thetaDeg<10||thetaDeg>60)
    throw Error('原锥角须在 10°–60° 内。');
  if(typeof normalCurvature!=='number'||!Number.isFinite(normalCurvature)||
    normalCurvature<.1||normalCurvature>1.5)
    throw Error('目标法曲率须在 0.1–1.5 内。');
  return {thetaDeg,normalCurvature};
}

/** Director from the saved constant-coefficient Darboux frame, sigma/psi fixed. */
export function coneReshapeDirectors(mode:ConeReshapeMode,s:number,
  input:ConeReshapeParams=CONE_RESHAPE_PRESET):{source:ConePoint3;target:ConePoint3}{
  const params=validateConeReshapeParams(input);
  if(mode!=='flatten'&&mode!=='curl')throw Error('未知圆锥重塑模式。');
  if(!Number.isFinite(s)||s<0||s>Math.PI)throw Error('s 必须在原保存范围 [0,π]。');
  if(mode==='flatten'){
    const theta=params.thetaDeg*Math.PI/180,k=Math.sin(theta),c=Math.cos(theta);
    const q=k*s;
    // Initial Darboux frame: L0=(k,-c,0), T0=(-c,-k,0), U0=(0,0,1).
    const target:[number,number,number]=[
      -k*Math.cos(q)-c*Math.sin(q),c*Math.cos(q)-k*Math.sin(q),0];
    return {source:[-k*Math.cos(s),c,k*Math.sin(s)],target};
  }
  const beta=params.normalCurvature,K=Math.hypot(1,beta),q=K*s;
  const oneMinusCos=1-Math.cos(q),K2=K*K;
  return {source:[-Math.cos(s),Math.sin(s),0],
    target:[-1+oneMinusCos/K2,Math.sin(q)/K,beta*oneMinusCos/K2]};
}

export function coneReshapeMetric(mode:ConeReshapeMode,v:number,
  input:ConeReshapeParams=CONE_RESHAPE_PRESET):{E:number;F:number;G:number;regular:boolean}{
  const params=validateConeReshapeParams(input);
  if(mode!=='flatten'&&mode!=='curl'||!Number.isFinite(v)||v<0||v>1)
    throw Error('圆锥参数超出保存范围。');
  const speed=mode==='flatten'?Math.sin(params.thetaDeg*Math.PI/180):1;
  return {E:(v*speed)**2,F:0,G:1,regular:v>0};
}

export function sampleConeReshape(mode:ConeReshapeMode,s:number,v:number,
  input:ConeReshapeParams=CONE_RESHAPE_PRESET):ConeReshapeSample{
  if(!Number.isFinite(v)||v<0||v>1)throw Error('v 必须在原保存范围 [0,1]。');
  const directors=coneReshapeDirectors(mode,s,input);
  return {s,v,source:directors.source.map(x=>v*x) as ConePoint3,
    target:directors.target.map(x=>v*x) as ConePoint3};
}

export function sampleConeReshapeGrid(mode:ConeReshapeMode,
  input:ConeReshapeParams=CONE_RESHAPE_PRESET,curveSegments=100,radialSegments=20):ConeReshapeSample[][]{
  const params=validateConeReshapeParams(input);
  if(!Number.isInteger(curveSegments)||curveSegments<16||curveSegments>200||
    !Number.isInteger(radialSegments)||radialSegments<2||radialSegments>50)
    throw Error('显示采样段数超出安全范围。');
  return Array.from({length:curveSegments+1},(_,i)=>
    Array.from({length:radialSegments+1},(_,j)=>
      sampleConeReshape(mode,Math.PI*i/curveSegments,j/radialSegments,params)));
}

export function projectConePoint(point:ConePoint3,azimuthDeg:number):[number,number]{
  const az=azimuthDeg*Math.PI/180,elev=28*Math.PI/180;
  const depth=Math.sin(az)*point[0]+Math.cos(az)*point[1];
  return [Math.cos(az)*point[0]-Math.sin(az)*point[1],
    -Math.sin(elev)*depth+Math.cos(elev)*point[2]];
}
