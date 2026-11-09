import {api} from './api';

export type LinkedZeroChainQuery={family:'linked-concentric-first-band';variant:'zero-chain';segments:number};
export type LinkedZeroChainRow={s:number;flatCurves:[number,number][];foldedCurves:[number,number,number][]};
export type LinkedZeroChainResult={
  family:'linked-concentric-zero-chain';query:LinkedZeroChainQuery;
  source:{notebookRows:[339070,340310];savedNumericalOut:false;
    savedRadii:[1,1.1,1.2,1.3,1.4];savedQ1Perturbation:0.1;
    subdomainQ1Perturbation:0;savedFirstFoldAngleDeg:120};
  certification:{fourBandsAnalyticLocalIsometry:true;singleSheetContinuous:true;
    regularityMarginLowerBound:1;numericalFrameGramMaxError:number;
    numericalMetricMaxError:number;numericalSharedEdgeMaxError:number;
    foldAnglesDeg:[120,-120,120,-120];boundaryEndContact:true;
    wholeSavedPerturbedChainCertified:false;globalLayerOrderChecked:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false;
    deploymentPathChecked:false;selfCollisionChecked:false};
  sample:{rows:LinkedZeroChainRow[]};
};

export const LINKED_ZERO_CHAIN_PRESET:LinkedZeroChainQuery={
  family:'linked-concentric-first-band',variant:'zero-chain',segments:32,
};
const record=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,names:string[])=>
  Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const close=(a:unknown,b:number,tolerance=2e-8)=>finite(a)&&
  Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b));
const point=(value:unknown,n:number):value is number[]=>
  Array.isArray(value)&&value.length===n&&value.every(finite);
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
function fail():never{throw Error('零扰动四带来源或局部等距证书异常。');}

export function validateLinkedZeroChainQuery(value:unknown):LinkedZeroChainQuery{
  if(!record(value)||!keys(value,['family','variant','segments'])||
    value.family!=='linked-concentric-first-band'||value.variant!=='zero-chain'||
    !finite(value.segments)||!Number.isInteger(value.segments)||
    value.segments<8||value.segments>128)
    throw Error('零扰动四带采样须为 8–128 的整数，且不能改写原版参数。');
  return value as LinkedZeroChainQuery;
}

export function parseLinkedZeroChainResult(raw:unknown,requested?:LinkedZeroChainQuery):LinkedZeroChainResult{
  if(!record(raw)||!keys(raw,['family','query','source','certification','sample'])||
    raw.family!=='linked-concentric-zero-chain'||!record(raw.query)||
    !record(raw.source)||!record(raw.certification)||!record(raw.sample))fail();
  const query=validateLinkedZeroChainQuery(raw.query);
  if(requested&&requested.segments!==query.segments)fail();
  const source=raw.source;
  if(!keys(source,['notebookRows','savedNumericalOut','savedRadii','savedQ1Perturbation',
    'subdomainQ1Perturbation','savedFirstFoldAngleDeg'])||
    JSON.stringify(source.notebookRows)!=='[339070,340310]'||source.savedNumericalOut!==false||
    JSON.stringify(source.savedRadii)!=='[1,1.1,1.2,1.3,1.4]'||
    source.savedQ1Perturbation!==.1||source.subdomainQ1Perturbation!==0||
    source.savedFirstFoldAngleDeg!==120)fail();
  const cert=raw.certification;
  if(!keys(cert,['fourBandsAnalyticLocalIsometry','singleSheetContinuous',
    'regularityMarginLowerBound','numericalFrameGramMaxError','numericalMetricMaxError',
    'numericalSharedEdgeMaxError','foldAnglesDeg','boundaryEndContact',
    'wholeSavedPerturbedChainCertified','globalLayerOrderChecked','exactStraightCreaseFOLD',
    'adoptableCreasePattern','deploymentPathChecked','selfCollisionChecked'])||
    cert.fourBandsAnalyticLocalIsometry!==true||cert.singleSheetContinuous!==true||
    cert.boundaryEndContact!==true||!close(cert.regularityMarginLowerBound,1)||
    JSON.stringify(cert.foldAnglesDeg)!=='[120,-120,120,-120]'||
    ['numericalFrameGramMaxError','numericalMetricMaxError','numericalSharedEdgeMaxError']
      .some(key=>!finite(cert[key])||cert[key]<0||cert[key]>1e-9)||
    ['wholeSavedPerturbedChainCertified','globalLayerOrderChecked','exactStraightCreaseFOLD',
      'adoptableCreasePattern','deploymentPathChecked','selfCollisionChecked']
      .some(key=>cert[key]!==false))fail();
  if(!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||
    raw.sample.rows.length!==query.segments+1)fail();
  for(const [index,row] of raw.sample.rows.entries()){
    if(!record(row)||!keys(row,['s','flatCurves','foldedCurves'])||
      !close(row.s,Math.PI*index/query.segments)||
      !Array.isArray(row.flatCurves)||row.flatCurves.length!==5||
      !Array.isArray(row.foldedCurves)||row.foldedCurves.length!==5||
      !row.flatCurves.every(p=>point(p,2))||!row.foldedCurves.every(p=>point(p,3)))fail();
    for(let i=0;i<5;i++){
      const flat=row.flatCurves[i] as number[],folded=row.foldedCurves[i] as number[];
      const radius=1+.1*i,s=row.s as number;
      if(!close(flat[0],radius*Math.cos(s))||!close(flat[1],radius*Math.sin(s)))fail();
      if(i>0&&(!close(distance(row.flatCurves[i-1] as number[],flat),.1)||
        !close(distance(row.foldedCurves[i-1] as number[],folded),.1)))fail();
    }
  }
  const rows=raw.sample.rows as LinkedZeroChainRow[];
  if(rows[0].foldedCurves.some((p,i)=>distance(p,rows.at(-1)!.foldedCurves[i])>1e-8))fail();
  return raw as LinkedZeroChainResult;
}

export async function fetchLinkedZeroChain(value:unknown,signal?:AbortSignal){
  const query=validateLinkedZeroChainQuery(value);
  return parseLinkedZeroChainResult(await api('tessellation/curved-linked-first-band',query,signal),query);
}
