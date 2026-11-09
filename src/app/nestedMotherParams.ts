import {changeTessParams,PRUNABLE,readTessParams,tessPreset,
  type TessFamily,type TessParams} from './tessellation';

export type NestedMotherParent=Extract<TessParams,{family:'primal-dual'|'flagstone'}>;
export const PRIMAL_DUAL_MOTHER_FAMILIES:TessFamily[]=['periodic','archimedean','nonperiodic','custom','ring'];
export function nestedMotherFamilies(parent:NestedMotherParent):TessFamily[]{
  return [...(parent.family==='primal-dual'?PRIMAL_DUAL_MOTHER_FAMILIES:PRUNABLE)];
}
/** Use the existing finite parameter reader; this does not certify the resulting CP. */
export function readNestedMother(parent:NestedMotherParent,raw:unknown):TessParams{
  const mother=readTessParams(raw);
  if(!mother||!nestedMotherFamilies(parent).includes(mother.family)||
      parent.family==='primal-dual'&&mother.family==='ring'&&mother.ringMode==='origamica')
    throw Error('需要有效的有限平面母结构参数；原始—对偶的母结构不支持递归对偶或原版环状传播。');
  if(parent.family==='primal-dual'){
    const {paper:_paper,...withoutPaper}=mother;
    return withoutPaper as TessParams;
  }
  return mother;
}
export function initialNestedMother(parent:NestedMotherParent):TessParams{
  return structuredClone(parent.motherParams??tessPreset('custom'));
}
/** Transferring an explicitly boundary-only mother must not restore the new preset's paper. */
export function flagstoneParamsFromMother(source:TessParams):Extract<TessParams,{family:'flagstone'}>{
  const {paper,...mother}=structuredClone(source);
  return {...tessPreset('flagstone'),paper,motherParams:mother as TessParams};
}
/** An unchanged draft keeps targets; changed topology cannot retain old indexed targets. */
export function applyNestedMother(parent:NestedMotherParent,raw:unknown):NestedMotherParent{
  const mother=readNestedMother(parent,raw);
  if(parent.motherParams&&JSON.stringify(readNestedMother(parent,parent.motherParams))===JSON.stringify(mother))
    return structuredClone(parent);
  if(parent.family==='flagstone')return changeTessParams(parent,{motherParams:mother,aspect:1}) as NestedMotherParent;
  return changeTessParams(parent,{motherParams:mother,paper:undefined,pruneBoundary:undefined,
    dualTargets:undefined,dualEdgeFlips:undefined,visibleTopFace:undefined,faceupFace:undefined}) as NestedMotherParent;
}
/** Preview the retained/pruned mother in its source coordinates, independent of CP adoption. */
export function nestedMotherPreviewRequest(parent:NestedMotherParent,raw:unknown):TessParams{
  const mother=structuredClone(readNestedMother(parent,raw));
  if(mother.family==='custom')return changeTessParams(mother,{customOutput:'tiling',
    tileDecorations:undefined,tileSpecs:undefined,unitRegularCentered:undefined,unitTriangle:undefined,
    unitCyclic:undefined,unitQuadrilateralSplit:undefined,archimedeanPatch:undefined,
    twoColorableArchimedeanPatch:undefined,twoUniformPatch:undefined});
  return mother;
}
