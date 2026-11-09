import {api} from './api';
import {validateNDSolveStepOptions,type NDSolveStepOptions} from './curvedNDSolveOptions';
import {validateLinkedFirst3DIntegration,replayLinkedCircleFirst,linkedPointMatches,type LinkedFirst3DIntegration} from './curvedLinkedNDSolveOptions';


export type LinkedFirstBandQuery={family:'linked-concentric-first-band';segments:number;ndsolveOptions?:NDSolveStepOptions};
export type LinkedFirstBandRow={s:number;flatFirst:[number,number];flatSecond:[number,number];
  foldedFirst:[number,number,number];foldedSecond:[number,number,number]};
export type LinkedFirstBandResult={
  family:'linked-concentric-first-band';query:LinkedFirstBandQuery;first3DIntegration?:LinkedFirst3DIntegration;
  source:{notebookRows:[339070,340310];savedNumericalOut:false;
    savedRadii:[1,1.1];savedQ1Perturbation:0.1;savedFirstFoldAngleDeg:120};
  certification:{firstBandAnalyticLocalIsometry:true;
    firstBandRegularityMarginLowerBound:number;
    firstBandNumericalFrameGramMaxError:number;
    firstBandNumericalTangentMaxError:number;
    wholeFiveFoldChainCertified:false;exactStraightCreaseFOLD:false;
    adoptableCreasePattern:false;deploymentPathChecked:false;
    selfCollisionChecked:false};
  sample:{rows:LinkedFirstBandRow[]};
};

export const LINKED_FIRST_BAND_PRESET:LinkedFirstBandQuery={
  family:'linked-concentric-first-band',segments:32,
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
function fail():never{throw Error('关联同心圆首带来源或采样证书异常。');}

export function validateLinkedFirstBandQuery(value:unknown):LinkedFirstBandQuery{
  if(!record(value)||value.family!=='linked-concentric-first-band'||
    Object.keys(value).some(key=>!['family','segments','ndsolveOptions'].includes(key)))
    throw Error('只支持原版保存的关联同心圆首带。');
  const segments=value.segments??32;
  if(!finite(segments)||!Number.isInteger(segments)||segments<8||segments>128)
    throw Error('采样段数须为 8–128 的整数。');
  return {family:'linked-concentric-first-band',segments,...(Object.hasOwn(value,'ndsolveOptions')?{ndsolveOptions:validateNDSolveStepOptions(value.ndsolveOptions,Math.PI)}:{})};
}

export function parseLinkedFirstBandResult(raw:unknown,requested?:LinkedFirstBandQuery):LinkedFirstBandResult{
  if(!record(raw)||!keys(raw,['family','query','source','certification','sample',...(Object.hasOwn(raw,'first3DIntegration')?['first3DIntegration']:[])])||
    raw.family!=='linked-concentric-first-band'||!record(raw.query)||
    !record(raw.source)||!record(raw.certification)||!record(raw.sample))fail();
  const query=validateLinkedFirstBandQuery(raw.query);
  if(!keys(raw.query,['family','segments',...(query.ndsolveOptions?['ndsolveOptions']:[])])||requested&&JSON.stringify(validateLinkedFirstBandQuery(requested))!==JSON.stringify(query))fail();
  if(!!query.ndsolveOptions!==Object.hasOwn(raw,'first3DIntegration'))fail();
  const source=raw.source;
  if(!keys(source,['notebookRows','savedNumericalOut','savedRadii',
    'savedQ1Perturbation','savedFirstFoldAngleDeg'])||
    !Array.isArray(source.notebookRows)||source.notebookRows.length!==2||
    source.notebookRows[0]!==339070||source.notebookRows[1]!==340310||
    source.savedNumericalOut!==false||!Array.isArray(source.savedRadii)||
    source.savedRadii.length!==2||source.savedRadii[0]!==1||source.savedRadii[1]!==1.1||
    source.savedQ1Perturbation!==.1||source.savedFirstFoldAngleDeg!==120)fail();
  const cert=raw.certification;
  if(!keys(cert,['firstBandAnalyticLocalIsometry',
    'firstBandRegularityMarginLowerBound','firstBandNumericalFrameGramMaxError',
    'firstBandNumericalTangentMaxError','wholeFiveFoldChainCertified',
    'exactStraightCreaseFOLD','adoptableCreasePattern','deploymentPathChecked',
    'selfCollisionChecked'])||cert.firstBandAnalyticLocalIsometry!==true||
    !close(cert.firstBandRegularityMarginLowerBound,.088,1e-9)||
    !finite(cert.firstBandNumericalFrameGramMaxError)||
    cert.firstBandNumericalFrameGramMaxError<0||cert.firstBandNumericalFrameGramMaxError>2e-7||
    !finite(cert.firstBandNumericalTangentMaxError)||
    cert.firstBandNumericalTangentMaxError<0||cert.firstBandNumericalTangentMaxError>2e-7||
    ['wholeFiveFoldChainCertified','exactStraightCreaseFOLD','adoptableCreasePattern',
      'deploymentPathChecked','selfCollisionChecked'].some(key=>cert[key]!==false))fail();
  if(!keys(raw.sample,['rows'])||!Array.isArray(raw.sample.rows)||
    raw.sample.rows.length!==query.segments+1)fail();
  for(const [i,item] of raw.sample.rows.entries()){
    if(!record(item)||!keys(item,['s','flatFirst','flatSecond','foldedFirst',
      'foldedSecond'])||!close(item.s,Math.PI*i/query.segments)||
      !point(item.flatFirst,2)||!point(item.flatSecond,2)||
      !point(item.foldedFirst,3)||!point(item.foldedSecond,3))fail();
    const s=item.s as number,q=s+.1*Math.sin(2*s);
    const first=item.flatFirst as number[],second=item.flatSecond as number[];
    if(!close(first[0],Math.cos(s))||!close(first[1],Math.sin(s))||
      !close(second[0],1.1*Math.cos(q))||!close(second[1],1.1*Math.sin(q))||
      !close(distance(item.foldedFirst as number[],item.foldedSecond as number[]),
        distance(first,second)))fail();
  }
  if(query.ndsolveOptions){const rows=raw.sample.rows as LinkedFirstBandRow[],replay=replayLinkedCircleFirst(rows.map(r=>r.s));
    if(!validateLinkedFirst3DIntegration(raw.first3DIntegration,query.ndsolveOptions,0,Math.PI,replay.initial))fail();
    for(const row of rows){const y=replay.at(row.s),delta=.1*Math.sin(2*row.s),a=1.1*Math.sin(delta),b=1-1.1*Math.cos(delta),
      second=y.slice(0,3).map((x,i)=>x+a*y[3+i]+b*y[6+i]);if(!linkedPointMatches(row.foldedFirst,y.slice(0,3))||!linkedPointMatches(row.foldedSecond,second))fail();}}
  return raw as LinkedFirstBandResult;
}

export async function fetchLinkedFirstBand(value:unknown,signal?:AbortSignal){
  const query=validateLinkedFirstBandQuery(value);
  return parseLinkedFirstBandResult(await api('tessellation/curved-linked-first-band',query,signal),query);
}
