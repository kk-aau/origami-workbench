/** Explicit UI dispatch; it does not migrate either original source namespace. */
import {UNIFORM_HELIX_GENERAL_CP_3951_EXAMPLE,validateUniformHelixGeneralCP3951Recipe,prepareUniformHelixGeneralCP3951Preview,uniformHelixGeneralCP3951SourceMatches,readUniformHelixGeneralCP3951Recipe,type UniformHelixGeneralCP3951Recipe,type UniformHelixGeneralCP3951Source} from './uniformHelixGeneralCP3951';
import {validateUniformHelixExtendedCP3951Recipe,prepareUniformHelixExtendedCP3951Preview,uniformHelixExtendedCP3951SourceMatches,readUniformHelixExtendedCP3951Recipe,type UniformHelixExtendedCP3951Source} from './uniformHelixExtendedCP3951';
import type {Doc} from '../core/types';
export type UniformHelixGeneralCP3951Mode='principal-v1'|'literal-extended-v2';
export type UniformHelixModeRecipe=UniformHelixGeneralCP3951Recipe;
export const UNIFORM_HELIX_MODE_DEFAULT:UniformHelixGeneralCP3951Mode='principal-v1';
export const UNIFORM_HELIX_MODE_EXAMPLE={...UNIFORM_HELIX_GENERAL_CP_3951_EXAMPLE};
export type UniformHelixModeSource=UniformHelixGeneralCP3951Source|UniformHelixExtendedCP3951Source;
export type UniformHelixModeView={frames:UniformHelixModeSource['frames'];worldErrorEstimateMm:number;circleRadiusMm:number|null;leftFocusMm:number|null;rightFocusMm:number|null;positiveFocusSide:'left'|'right'|'none';focusOverflows:boolean;explicitPiContinuation:boolean;classification:string;classificationText:string;focusText:string;mode:UniformHelixGeneralCP3951Mode};
function modeIsValid(x:unknown):x is UniformHelixGeneralCP3951Mode{return x==='principal-v1'||x==='literal-extended-v2';}
export function validateUniformHelixModeRecipe(mode:UniformHelixGeneralCP3951Mode,raw:unknown):UniformHelixModeRecipe{
 if(!modeIsValid(mode))throw Error('请选择明确的 v1 或 v2 源模式；没有自动回退。');return mode==='principal-v1'?validateUniformHelixGeneralCP3951Recipe(raw):validateUniformHelixExtendedCP3951Recipe(raw);
}
export function uniformHelixModeSourceKey(mode:UniformHelixGeneralCP3951Mode,r:UniformHelixModeRecipe):string{return JSON.stringify([mode,r.radius,r.helicityAngleDeg,r.foldAngleDeg,r.parameterStart,r.parameterEnd,r.segments]);}
export function uniformHelixModeSourceMatches(mode:UniformHelixGeneralCP3951Mode,doc:Doc):boolean{
 if(!modeIsValid(mode))return false;const metadata=doc.metadata;if(metadata&&Object.hasOwn(metadata,mode==='principal-v1'?'originalUniformHelixExtended3951':'originalUniformHelixGeneral3951'))return false;
 return mode==='principal-v1'?uniformHelixGeneralCP3951SourceMatches(doc):uniformHelixExtendedCP3951SourceMatches(doc);
}
export function readUniformHelixModeRecipe(doc:Doc):{mode:UniformHelixGeneralCP3951Mode;recipe:UniformHelixModeRecipe}|null{
 const m=doc.metadata;if(!m)return null;const v1=Object.hasOwn(m,'originalUniformHelixGeneral3951'),v2=Object.hasOwn(m,'originalUniformHelixExtended3951');if(v1===v2)return null;
 const mode=v1?'principal-v1':'literal-extended-v2',recipe=v1?readUniformHelixGeneralCP3951Recipe(doc):readUniformHelixExtendedCP3951Recipe(doc);return recipe?{mode,recipe}:null;
}
function view(mode:UniformHelixGeneralCP3951Mode,source:UniformHelixModeSource):UniformHelixModeView{
 if(mode==='principal-v1'){
  const s=source as UniformHelixGeneralCP3951Source;return {mode,frames:s.frames,worldErrorEstimateMm:s.numericPolicy.maximumWorldErrorEstimateMm,circleRadiusMm:s.constants.radius2D,leftFocusMm:s.constants.leftFocalDistance,rightFocusMm:null,positiveFocusSide:'left',focusOverflows:false,explicitPiContinuation:false,classification:'v1-selected-principal-branch',classificationText:'v1 · 既有主分支合同，重建仍保存原 v1。',focusText:'左宽须严格小于焦距并留数值余量；右宽可至原单位 1。',};
 }
 const s=source as UniformHelixExtendedCP3951Source,status=s.classification.status,text=s.classification.explicitAnalyticContinuation?'v2 · 原平面 literal 在奇数 π 未定义；这里采用新增解析延续。':s.classification.paperTransverseDegenerate?'v2 · 原 literal 已定义，但左右同母线、纸域退化；仅源参考。':s.classification.originalDerivationAssumptionsSatisfied?'v2 · 原 literal 已定义，满足 In3952 原简化假设。':'v2 · 原 literal 已定义，但不满足 In3952 简化假设；raw 参数保留。';
 const focus=s.constants.focusPositiveSide;return {mode,frames:s.frames,worldErrorEstimateMm:s.numericalPolicy.maximumWorldErrorEstimateMm,circleRadiusMm:s.constants.signedCircleRadiusRepresentedMm,leftFocusMm:s.constants.leftFocalDistanceRepresentedMm,rightFocusMm:s.constants.rightFocalDistanceRepresentedMm,positiveFocusSide:focus,focusOverflows:s.constants.focusOverflowsBinary64,explicitPiContinuation:s.classification.explicitAnalyticContinuation,classification:status,classificationText:text,focusText:s.classification.paperTransverseDegenerate?'纸域横向退化，不能采用两面 CP；未自动替换折角。':focus==='none'?'π 延续为直线，无有限焦点；两侧宽度分别由用户选择，均不超过原单位 1。':`${focus==='left'?'左':'右'}宽须严格小于对应焦距并留数值余量；另一侧可至原单位 1。`};
}
export function prepareUniformHelixModePreview(mode:UniformHelixGeneralCP3951Mode,raw:unknown){
 const recipe=validateUniformHelixModeRecipe(mode,raw),prepared=mode==='principal-v1'?prepareUniformHelixGeneralCP3951Preview(recipe):prepareUniformHelixExtendedCP3951Preview(recipe);
 return {mode,source:prepared.source,view:view(mode,prepared.source),key:uniformHelixModeSourceKey(mode,recipe),build:(next:unknown)=>prepared.build(validateUniformHelixModeRecipe(mode,next))};
}
