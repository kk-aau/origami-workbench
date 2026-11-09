import {readTessParams,tessDocument,type TessParams,type TessResult} from './tessellation';
export const sourceRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function sourceNear(a:unknown,b:any,tolerance=1e-9):boolean{
 return typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)):
  Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>sourceNear(a[i],v,tolerance)):
  sourceRecord(b)?sourceRecord(a)&&Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&Object.entries(b).every(([k,v])=>sourceNear(a[k],v,tolerance)):a===b;
}
/** Compare effective parsed fields; only the declared customOutput=twist and
 * parameterization defaults may differ between native input and backend stats. */
export function generatedParametersMatch(actual:unknown,selected:TessParams):boolean{
 try{
  if(sourceRecord(actual)&&actual.family==='primal-dual'&&actual.reciprocalMethod==='original-min-total-pleat'){
   const allowed=['family','tiling','rings','angle','scale','reciprocalMethod','motherParams','dualTargets','parameterization','gamma','pleatAngle','twistDirection','postRotation','visibleTopFace','faceupFace'];
   if(Object.keys(actual).some(k=>!allowed.includes(k))||['family','tiling','rings','angle','scale','reciprocalMethod','motherParams','dualTargets'].some(k=>!Object.hasOwn(actual,k))||actual.parameterization==='gamma-alpha'&&['gamma','pleatAngle','twistDirection'].some(k=>!Object.hasOwn(actual,k)))return false;
  }
  const normalize=(p:TessParams)=>{const value=structuredClone(p) as unknown as Record<string,any>;if(value.family==='primal-dual'){value.parameterization??='rho-beta';value.postRotation??='none';if(value.motherParams?.family==='custom')value.motherParams.customOutput??='twist';}return value;};
  const read=readTessParams(actual),expected=readTessParams(selected);
  if(read&&sourceRecord(actual)&&actual.family==='primal-dual'&&actual.reciprocalMethod==='original-min-total-pleat'&&(!sourceNear(actual.angle,(read as unknown as Record<string,unknown>).angle,1e-12)||!sourceNear(actual.scale,(read as unknown as Record<string,unknown>).scale,1e-12)))return false;
  return !!read&&!!expected&&sourceNear(normalize(read),normalize(expected),1e-12);
 }catch{return false;}
}
/** A source result is adopted from its actual prepared mm drawing. The caller
 * separately reconstructs native CP/FF and source topology from mathematics. */
export function generatedDocumentMatches(result:TessResult,params:TessParams):boolean{
 try{
  const stats=result.stats as unknown as Record<string,unknown>,metadata=result.doc?.metadata?.tessellation;
  if(!sourceRecord(metadata)||!generatedParametersMatch(stats.parameters,params)||!generatedParametersMatch(metadata.parameters,params)||!sourceNear(metadata.source,result.source,0))return false;
  const expected=tessDocument(result.fold,result.doc.name);
  return sourceNear(result.doc.paper,expected.paper,1e-10)&&sourceNear(result.doc.segments,expected.segments,1e-10)&&!Object.hasOwn(result.doc.metadata??{},'materialTopology');
 }catch{return false;}
}
