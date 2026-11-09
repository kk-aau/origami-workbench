import {api} from './api';
import {validateNDSolveStepOptions,type NDSolveStepOptions} from './curvedNDSolveOptions';
import {validateLinkedFirst3DIntegration,replayLinkedCircleFirst,linkedPointMatches,type LinkedFirst3DIntegration} from './curvedLinkedNDSolveOptions';


export type P45LinkedChainQuery={family:'linked-concentric-first-band';variant:'saved-chain';
  segments:number;interpolationPoints?:number;ndsolveOptions?:NDSolveStepOptions};
export type P45LinkedChainRow={s:number;qValues:number[];foldAnglesDeg:number[];
  flatCurves:[number,number][];foldedCurves:[number,number,number][]};
export type P45LinkedChainResult={
  family:'linked-concentric-saved-chain';query:P45LinkedChainQuery;first3DIntegration?:LinkedFirst3DIntegration;
  source:{notebookRows:[339070,340310];savedNumericalOut:false;
    savedRadii:number[];savedQ1Perturbation:0.1;savedFirstFoldAngleDeg:120;
    interpolationIntervals:number;interpolationMethod:'local-scipy-quartic-not-wolfram-output'};
  diagnostics:{maxNodeRootResidual:number;maxFirstBandJoinError:number;
    q4EndpointByIntervals16_32_64:number[][];q4EndpointExtrapolation:number;
    cachedTangentErrorAtPiOver4Rad:0.1;secondBandGeodesicMismatchAtZero:number};
  certification:{finiteFormulaVisualizationOnly:true;wolframNumericalOutputReproduced:false;
    wholeSavedPerturbedChainCertified:false;secondBandIsometric:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false;selfCollisionChecked:false};
  sample:{rows:P45LinkedChainRow[]};
};

const record=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,names:string[])=>
  Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const close=(a:unknown,b:number,tolerance=2e-7)=>finite(a)&&
  Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b));
const point=(value:unknown,n:number):value is number[]=>
  Array.isArray(value)&&value.length===n&&value.every(finite);
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
function fail():never{throw Error('第 45 节保存五曲线数值图来源或诊断异常。');}

export function validateP45LinkedChainQuery(value:unknown):P45LinkedChainQuery{
  if(!record(value)||!keys(value,['family','variant','segments',
    ...(Object.hasOwn(value,'interpolationPoints')?['interpolationPoints']:[]),...(Object.hasOwn(value,'ndsolveOptions')?['ndsolveOptions']:[])])||
    value.family!=='linked-concentric-first-band'||value.variant!=='saved-chain'||
    !finite(value.segments)||!Number.isInteger(value.segments)||
    value.segments<8||value.segments>128||
    (Object.hasOwn(value,'interpolationPoints')&&
      (!finite(value.interpolationPoints)||!Number.isInteger(value.interpolationPoints)||
        value.interpolationPoints<8||value.interpolationPoints>128)))
    throw Error('保存五曲线只支持 8–128 段本地绘图采样与 8–128 个本地插值区间。');
  return {...value,...(Object.hasOwn(value,'ndsolveOptions')?{ndsolveOptions:validateNDSolveStepOptions(value.ndsolveOptions,Math.PI)}:{})} as P45LinkedChainQuery;
}

export function parseP45LinkedChainResult(raw:unknown,requested?:P45LinkedChainQuery):P45LinkedChainResult{
  if(!record(raw)||!keys(raw,['family','query','source','diagnostics','certification','sample',...(Object.hasOwn(raw,'first3DIntegration')?['first3DIntegration']:[])])||
    raw.family!=='linked-concentric-saved-chain'||!record(raw.query)||
    !record(raw.source)||!record(raw.diagnostics)||!record(raw.certification)||
    !record(raw.sample))fail();
  const query=validateP45LinkedChainQuery(raw.query);
  if(requested&&(requested.segments!==query.segments||
    (requested.interpolationPoints??32)!==(query.interpolationPoints??32)||JSON.stringify(requested.ndsolveOptions)!==JSON.stringify(query.ndsolveOptions)))fail();
  if(!!query.ndsolveOptions!==Object.hasOwn(raw,'first3DIntegration'))fail();
  const source=raw.source;
  if(!keys(source,['notebookRows','savedNumericalOut','savedRadii',
    'savedQ1Perturbation','savedFirstFoldAngleDeg','interpolationIntervals',
    'interpolationMethod'])||JSON.stringify(source.notebookRows)!=='[339070,340310]'||
    source.savedNumericalOut!==false||
    JSON.stringify(source.savedRadii)!=='[1,1.1,1.2,1.3,1.4]'||
    source.savedQ1Perturbation!==.1||source.savedFirstFoldAngleDeg!==120||
    source.interpolationIntervals!==(query.interpolationPoints??32)||
    source.interpolationMethod!=='local-scipy-quartic-not-wolfram-output')fail();
  const diagnostic=raw.diagnostics;
  if(!keys(diagnostic,['maxNodeRootResidual','maxFirstBandJoinError',
    'q4EndpointByIntervals16_32_64','q4EndpointExtrapolation',
    'cachedTangentErrorAtPiOver4Rad','secondBandGeodesicMismatchAtZero'])||
    !finite(diagnostic.maxNodeRootResidual)||diagnostic.maxNodeRootResidual<0||
    diagnostic.maxNodeRootResidual>1e-8||!finite(diagnostic.maxFirstBandJoinError)||
    diagnostic.maxFirstBandJoinError<0||diagnostic.maxFirstBandJoinError>1e-8||
    !close(diagnostic.cachedTangentErrorAtPiOver4Rad,.1,1e-12)||
    !close(diagnostic.secondBandGeodesicMismatchAtZero,396/665,1e-12)||
    !finite(diagnostic.q4EndpointExtrapolation)||
    diagnostic.q4EndpointExtrapolation<0||diagnostic.q4EndpointExtrapolation>.02||
    !Array.isArray(diagnostic.q4EndpointByIntervals16_32_64)||
    diagnostic.q4EndpointByIntervals16_32_64.length!==3||
    !diagnostic.q4EndpointByIntervals16_32_64.every(pair=>point(pair,2)))fail();
  const cert=raw.certification;
  if(!keys(cert,['finiteFormulaVisualizationOnly','wolframNumericalOutputReproduced',
    'wholeSavedPerturbedChainCertified','secondBandIsometric','exactStraightCreaseFOLD',
    'adoptableCreasePattern','selfCollisionChecked'])||
    cert.finiteFormulaVisualizationOnly!==true||
    ['wolframNumericalOutputReproduced','wholeSavedPerturbedChainCertified',
      'secondBandIsometric','exactStraightCreaseFOLD','adoptableCreasePattern',
      'selfCollisionChecked'].some(key=>cert[key]!==false))fail();
  if(!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||
    raw.sample.rows.length!==query.segments+1)fail();
  const rows=raw.sample.rows as P45LinkedChainRow[];
  for(const [index,row] of rows.entries()){
    if(!record(row)||!keys(row,['s','qValues','foldAnglesDeg','flatCurves',
      'foldedCurves'])||!close(row.s,Math.PI*index/query.segments)||
      !Array.isArray(row.qValues)||row.qValues.length!==5||!row.qValues.every(finite)||
      !Array.isArray(row.foldAnglesDeg)||row.foldAnglesDeg.length!==3||
      !row.foldAnglesDeg.every(finite)||!Array.isArray(row.flatCurves)||
      row.flatCurves.length!==5||!row.flatCurves.every(p=>point(p,2))||
      !Array.isArray(row.foldedCurves)||row.foldedCurves.length!==5||
      !row.foldedCurves.every(p=>point(p,3))||!close(row.qValues[0],row.s)||
      !close(row.qValues[1],row.s+.1*Math.sin(2*row.s)))fail();
    for(let i=0;i<5;i++){
      const angle=row.qValues[i],radius=1+.1*i;
      if(!close(row.flatCurves[i][0],radius*Math.cos(angle))||
        !close(row.flatCurves[i][1],radius*Math.sin(angle)))fail();
      if(i>0&&Math.abs(distance(row.foldedCurves[i],row.foldedCurves[i-1])-
        distance(row.flatCurves[i],row.flatCurves[i-1]))>2e-6)fail();
    }
  }
  const endpoints=diagnostic.q4EndpointByIntervals16_32_64 as number[][];
  const index={16:0,32:1,64:2}[source.interpolationIntervals as 16|32|64];
  if(index!==undefined&&(!close(endpoints[index][0],rows[0].qValues[4],2e-8)||
    !close(endpoints[index][1],rows.at(-1)!.qValues[4],2e-8)))fail();
  if(!close(diagnostic.q4EndpointExtrapolation,
    Math.max(0,-rows[0].qValues[4],rows.at(-1)!.qValues[4]-Math.PI),2e-8))fail();
  if(query.ndsolveOptions){const replay=replayLinkedCircleFirst(rows.map(r=>r.s));
    if(!validateLinkedFirst3DIntegration(raw.first3DIntegration,query.ndsolveOptions,0,Math.PI,replay.initial))fail();
    for(const row of rows){const y=replay.at(row.s),T=y.slice(3,6),cachedT=[-Math.sin(row.s),Math.cos(row.s)],cachedL=[-Math.cos(row.s),-Math.sin(row.s)];
      let C=y.slice(0,3),L=y.slice(6,9);if(!linkedPointMatches(row.foldedCurves[0],C))fail();
      for(let i=1;i<5;i++){const df=row.flatCurves[i].map((x,k)=>x-row.flatCurves[i-1][k]),a=df.reduce((s,x,k)=>s+x*cachedT[k],0),b=df.reduce((s,x,k)=>s+x*cachedL[k],0);
        C=C.map((x,k)=>x+a*T[k]+b*L[k]);if(!linkedPointMatches(row.foldedCurves[i],C))fail();
        if(i<4){const angle=row.foldAnglesDeg[i-1]*Math.PI/180,U=[T[1]*L[2]-T[2]*L[1],T[2]*L[0]-T[0]*L[2],T[0]*L[1]-T[1]*L[0]];
          L=L.map((x,k)=>Math.cos(angle)*x-Math.sin(angle)*U[k]);}}}}
  return raw as P45LinkedChainResult;
}

export async function fetchP45LinkedChain(value:unknown,signal?:AbortSignal){
  const query=validateP45LinkedChainQuery(value);
  return parseP45LinkedChainResult(await api('tessellation/curved-linked-first-band',query,signal),query);
}
