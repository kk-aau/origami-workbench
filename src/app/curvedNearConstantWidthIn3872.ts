/** Origamica section 45, saved In[3872]/In[3875]: the symbolic and
 * interpolation-backed calls to NearConstantWidthScale/NNearConstantWidthScale.
 * Their common fixed analytic inputs are evaluated here without claiming to
 * reproduce Mathematica's InterpolatingFunction samples. */
export type Point2=[number,number];
export type NearWidthCell='In[3872]'|'In[3875]';
const END=Math.PI/3;
const SAMPLES=97;
export const NEAR_WIDTH_SAVED={
  analyticCell:'In[3872]',numericCell:'In[3875]',
  analyticDefinition:'In[3871]',numericDefinition:'In[3874]',
  directrix:'b(u)=(u,0)',director:'d(u)=(sin u,cos u)',
  parameterStart:0,parameterEnd:END,widthMultiplier:.5,
  localPreviewPoints:SAMPLES,
} as const;
export type NearWidthRow={u:number;base:Point2;director:Point2;
  scale:number;rulingLength:number;outer:Point2;verticalGap:number};
export type NearWidthSample={source:typeof NEAR_WIDTH_SAVED;selectedCell:NearWidthCell;
  rows:NearWidthRow[];rulingFrameIndices:number[];diagnostics:{
    scaleIdentityMaximumResidual:number;outerHeightMaximumResidual:number;
    jacobianLowerBound:number;globalStripInjective:true;
  };machineReadableWolframOut:false;wolframInterpolationReproduced:false;
  exactStraightCreaseFOLD:false;adoptableCreasePattern:false};

function checkU(u:number){
  if(!Number.isFinite(u)||u<0||u>END)throw Error('In[3872]/In[3875] 的 u 须在 [0,π/3]。');
}
export function nearWidthRowAt(u:number):NearWidthRow{
  checkU(u);
  const base:Point2=[u,0],director:Point2=[Math.sin(u),Math.cos(u)];
  const scale=1/Math.sqrt(1-(director[0])**2);
  const rulingLength=.5*scale;
  const outer:Point2=[base[0]+rulingLength*director[0],
    base[1]+rulingLength*director[1]];
  return {u,base,director,scale,rulingLength,outer,verticalGap:outer[1]};
}
/** Unit strip parameter s: X(u,s)=(u+s*tan(u)/2,s/2). */
export function nearWidthStripAt(u:number,s:number):Point2{
  checkU(u);
  if(!Number.isFinite(s)||s<0||s>1)throw Error('带宽参数 s 须在 [0,1]。');
  return [u+.5*s*Math.tan(u),.5*s];
}
export function sampleNearWidthSaved(cell:NearWidthCell):NearWidthSample{
  if(cell!=='In[3872]'&&cell!=='In[3875]')throw Error('未保存的近恒宽例。');
  const rows=Array.from({length:SAMPLES},(_,i)=>nearWidthRowAt(END*i/(SAMPLES-1)));
  let scaleIdentityMaximumResidual=0,outerHeightMaximumResidual=0;
  for(const row of rows){
    scaleIdentityMaximumResidual=Math.max(scaleIdentityMaximumResidual,
      Math.abs(row.scale*Math.sqrt(1-Math.sin(row.u)**2)-1));
    outerHeightMaximumResidual=Math.max(outerHeightMaximumResidual,
      Math.abs(row.outer[1]-.5),
      Math.abs(row.outer[0]-(row.u+.5*Math.tan(row.u))));
  }
  if(scaleIdentityMaximumResidual>1e-12||outerHeightMaximumResidual>1e-12)
    throw Error('In[3872]/In[3875] 固定输入解析恒等式未通过。');
  return {source:NEAR_WIDTH_SAVED,selectedCell:cell,rows,
    rulingFrameIndices:rows.map((_,i)=>i).filter(i=>i===SAMPLES-1||i%8===0),
    diagnostics:{scaleIdentityMaximumResidual,outerHeightMaximumResidual,
      jacobianLowerBound:.5,globalStripInjective:true},
    machineReadableWolframOut:false,wolframInterpolationReproduced:false,
    exactStraightCreaseFOLD:false,adoptableCreasePattern:false};
}
