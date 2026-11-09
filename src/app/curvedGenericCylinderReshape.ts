/** Saved constant-Darboux ReshapeGeneric3D cases, as continuous surfaces.
 * No Wolfram NDSolve interpolation or straight-crease FOLD graph is produced.
 */

export type ReshapeMode='flatten-cylinder'|'curl-plane';
export type Point3=[number,number,number];
export type ReshapeStage='source'|'target';
export type ReshapeParams={mode:ReshapeMode;parameterEnd:number;
  rulingWidth:number;curveSegments:number};
export type ReshapeFrame={u:number;b:Point3;t:Point3;l:Point3;
  normal:Point3;d:Point3;normalCurvature:number};
export type ReshapeSample={params:ReshapeParams;parameterValues:number[];
  stages:Record<ReshapeStage,{crease:Point3[];outerBoundary:Point3[]}>;
  sourceCells:readonly string[];wolframNumericalOutputReproduced:false;
  exactStraightCreaseFOLD:false};

export const SAVED_RESHAPE:Record<ReshapeMode,ReshapeParams>={
  'flatten-cylinder':{mode:'flatten-cylinder',parameterEnd:Math.PI,
    rulingWidth:1,curveSegments:80},
  'curl-plane':{mode:'curl-plane',parameterEnd:Math.PI,
    rulingWidth:1,curveSegments:80},
};
export const RESHAPE_INITIAL={u:0,b:[0,0,0],d:[0,1,0],t:[1,0,0],sigma:1} as const;

const finite=(value:unknown,label:string):number=>{
  if(typeof value!=='number'||!Number.isFinite(value))throw Error(`${label}须为有限数字。`);
  return value;
};
const dot=(a:Point3,b:Point3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Point3,b:Point3):Point3=>[
  a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function validateReshapeParams(value:unknown):ReshapeParams{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('重塑参数无效。');
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(key=>!['mode','parameterEnd','rulingWidth','curveSegments'].includes(key)))
    throw Error('包含不支持的重塑参数。');
  const mode=data.mode;
  if(mode!=='flatten-cylinder'&&mode!=='curl-plane')throw Error('只支持两个原版保存例。');
  const parameterEnd=finite(data.parameterEnd,'终点');
  const rulingWidth=finite(data.rulingWidth,'母线宽度');
  const curveSegments=finite(data.curveSegments,'采样段数');
  if(parameterEnd<=0||parameterEnd>Math.PI)throw Error('终点须在 (0, π] 内。');
  if(rulingWidth<=0||rulingWidth>1)throw Error('母线宽度须在 (0, 1] 内。');
  if(!Number.isInteger(curveSegments)||curveSegments<16||curveSegments>256)
    throw Error('采样段数须为 16–256 的整数。');
  return {mode,parameterEnd,rulingWidth,curveSegments};
}

export function reshapeFrame(params:ReshapeParams,stage:ReshapeStage,u:number):ReshapeFrame{
  const p=validateReshapeParams(params);
  finite(u,'u');
  if(u<0||u>p.parameterEnd)throw Error('u 超出保存例子域。');
  const cylinder=stage==='source'&&p.mode==='flatten-cylinder'||
    stage==='target'&&p.mode==='curl-plane';
  let b:Point3,t:Point3,normal:Point3,normalCurvature:number;
  if(cylinder&&stage==='source'){
    b=[-Math.cos(u),0,Math.sin(u)];
    t=[Math.sin(u),0,Math.cos(u)];
    normal=[-Math.cos(u),0,Math.sin(u)];
    normalCurvature=-1;
  }else if(cylinder){
    b=[Math.sin(u),0,1-Math.cos(u)];
    t=[Math.cos(u),0,Math.sin(u)];
    normal=[-Math.sin(u),0,Math.cos(u)];
    normalCurvature=1;
  }else{
    b=[u,0,0];t=[1,0,0];normal=[0,0,1];normalCurvature=0;
  }
  const d:Point3=[0,1,0];
  return {u,b,t,l:cross(normal,t),normal,d,normalCurvature};
}

export function reshapeSurface(params:ReshapeParams,stage:ReshapeStage,u:number,v:number):Point3{
  const p=validateReshapeParams(params);
  finite(v,'v');
  if(v<0||v>p.rulingWidth)throw Error('v 超出保存例子域。');
  const {b,d}=reshapeFrame(p,stage,u);
  return [b[0]+v*d[0],b[1]+v*d[1],b[2]+v*d[2]];
}

export function reshapeFirstForm(params:ReshapeParams,stage:ReshapeStage,u:number,v:number){
  reshapeSurface(params,stage,u,v);
  const {t,d}=reshapeFrame(params,stage,u);
  const area=cross(t,d);
  return {E:dot(t,t),F:dot(t,d),G:dot(d,d),regularity:Math.hypot(...area)};
}

export function sampleReshape(input:unknown):ReshapeSample{
  const params=validateReshapeParams(input),n=params.curveSegments;
  const parameterValues=Array.from({length:n+1},(_,i)=>
    i===n?params.parameterEnd:params.parameterEnd*i/n);
  const values=(stage:ReshapeStage)=>({
    crease:parameterValues.map(u=>reshapeFrame(params,stage,u).b),
    outerBoundary:parameterValues.map(u=>reshapeSurface(params,stage,u,params.rulingWidth)),
  });
  return {params,parameterValues,stages:{source:values('source'),target:values('target')},
    sourceCells:params.mode==='flatten-cylinder'?['In[3891]','In[3896]']:
      ['In[3892]','In[3897]'],
    wolframNumericalOutputReproduced:false,exactStraightCreaseFOLD:false};
}
