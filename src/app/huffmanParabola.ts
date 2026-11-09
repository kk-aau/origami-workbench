import {apiWhenIdle} from './api';

export type HuffmanParabolaQuery={family:'huffman-parabola-in4060';divisions:number};
type Point2=[number,number];
type Point3=[number,number,number];
export type HuffmanParabolaRow={
  t:number;anglesDeg:[number,number,number];
  flat:Point2[];folded:Point3[];flatMirror:Point2[];foldedMirror:Point3[];
  flatThirdRulingLength:number;foldedThirdRulingLength:number;
};
export type HuffmanParabolaResult={
  family:'origamica-huffman-confocal-parabola-pair';query:HuffmanParabolaQuery;
  source:{constructionCell:'In[4058]';graphicsCell:'In[4059]';
    display2DCell:'In[4062]';display3DCell:'In[4069]';
    savedExampleCell:'In[4060]';savedParametersDeg:[5,85,60,-90];savedDivisions:25;
    samplingStatus:'saved-input'|'bounded-local-extension';
    originalCompletionStatus:'partially-worked-out';machineReadableWolframOut:false};
  diagnostics:{terminalParabolaParameterDeg:number;closureConditionsSaved:false;
    thirdRulingLengthDifference:1e-6;parabolaEquation:'x + y^2/8 = 2'};
  certification:{thirdRulingOffset:1e-6;completeBlockExactIsometry:false;
    exactStraightCreaseFOLD:false;adoptableCreasePattern:false;
    deploymentPathChecked:false;selfCollisionChecked:false};
  sample:{rows:HuffmanParabolaRow[];pairedBlocks:2};
};

export const HUFFMAN_PARABOLA_PRESET:HuffmanParabolaQuery={
  family:'huffman-parabola-in4060',divisions:25,
};
const record=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:Record<string,unknown>,names:string[])=>
  Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const close=(actual:unknown,expected:number,tolerance=1e-7)=>
  finite(actual)&&Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected));
const point=(value:unknown,dimension:number):value is number[]=>
  Array.isArray(value)&&value.length===dimension&&value.every(finite);
const distance=(a:number[],b:number[])=>
  Math.hypot(...a.map((value,index)=>value-b[index]));
const dot=(a:number[],b:number[])=>a.reduce((sum,value,index)=>sum+value*b[index],0);
function fail():never{throw Error('Huffman 抛物线保存例的来源、母线或配对绘图数据异常。');}

export function validateHuffmanParabolaQuery(value:unknown):HuffmanParabolaQuery{
  if(!record(value)||value.family!=='huffman-parabola-in4060'||
    Object.keys(value).some(key=>!['family','divisions'].includes(key)))
    throw Error('请选择受限的 Huffman 抛物线保存例。');
  const divisions=value.divisions??25;
  if(!finite(divisions)||!Number.isInteger(divisions)||divisions<8||divisions>64)
    throw Error('采样段数须为 8–64 的整数。');
  return {family:'huffman-parabola-in4060',divisions};
}

/** Reject false isometry claims and verify the saved circle/parabola formula. */
export function parseHuffmanParabolaResult(raw:unknown,requested?:HuffmanParabolaQuery):HuffmanParabolaResult{
  if(!record(raw)||!keys(raw,['family','query','source','diagnostics','certification','sample'])||
    raw.family!=='origamica-huffman-confocal-parabola-pair'||
    !record(raw.query)||!record(raw.source)||!record(raw.diagnostics)||
    !record(raw.certification)||!record(raw.sample))fail();
  const query=validateHuffmanParabolaQuery(raw.query);
  if(!keys(raw.query,['family','divisions'])||raw.query.divisions!==query.divisions||
    requested&&requested.divisions!==query.divisions)fail();
  const source=raw.source;
  if(!keys(source,['constructionCell','graphicsCell','display2DCell','display3DCell',
    'savedExampleCell','savedParametersDeg','savedDivisions','samplingStatus',
    'originalCompletionStatus','machineReadableWolframOut'])||
    source.constructionCell!=='In[4058]'||source.graphicsCell!=='In[4059]'||
    source.display2DCell!=='In[4062]'||source.display3DCell!=='In[4069]'||
    source.savedExampleCell!=='In[4060]'||source.savedDivisions!==25||
    source.samplingStatus!==(query.divisions===25?'saved-input':'bounded-local-extension')||
    source.originalCompletionStatus!=='partially-worked-out'||
    source.machineReadableWolframOut!==false||
    !Array.isArray(source.savedParametersDeg)||
    ![5,85,60,-90].every((n,i)=>close((source.savedParametersDeg as unknown[])[i],n))||
    source.savedParametersDeg.length!==4)fail();
  const diag=raw.diagnostics;
  if(!keys(diag,['terminalParabolaParameterDeg','closureConditionsSaved',
    'thirdRulingLengthDifference','parabolaEquation'])||
    !finite(diag.terminalParabolaParameterDeg)||diag.closureConditionsSaved!==false||
    diag.thirdRulingLengthDifference!==1e-6||diag.parabolaEquation!=='x + y^2/8 = 2')fail();
  const cert=raw.certification;
  if(!keys(cert,['thirdRulingOffset','completeBlockExactIsometry',
    'exactStraightCreaseFOLD','adoptableCreasePattern','deploymentPathChecked',
    'selfCollisionChecked'])||cert.thirdRulingOffset!==1e-6||
    ['completeBlockExactIsometry','exactStraightCreaseFOLD','adoptableCreasePattern',
      'deploymentPathChecked','selfCollisionChecked'].some(key=>cert[key]!==false))fail();
  const sample=raw.sample;
  if(!keys(sample,['rows','pairedBlocks'])||sample.pairedBlocks!==2||
    !Array.isArray(sample.rows)||sample.rows.length!==query.divisions+1)fail();
  const first=sample.rows[0];
  if(!record(first)||!Array.isArray(first.folded)||first.folded.length!==4||
    !first.folded.every(value=>point(value,3)))fail();
  const center=(first.folded as number[][])[1];
  const axisRaw=(first.folded as number[][])[2].map((value,index)=>value/2-center[index]);
  const axisLength=Math.hypot(...axisRaw);
  if(!finite(axisLength)||axisLength<1e-9)fail();
  const axis=axisRaw.map(value=>value/axisLength);
  for(const [index,entry] of sample.rows.entries()){
    if(!record(entry)||!keys(entry,['t','anglesDeg','flat','folded','flatMirror',
      'foldedMirror','flatThirdRulingLength','foldedThirdRulingLength'])||
      !close(entry.t,Math.PI*index/(2*query.divisions))||
      !Array.isArray(entry.anglesDeg)||entry.anglesDeg.length!==3||
      !entry.anglesDeg.every(finite)||
      !Array.isArray(entry.flat)||!Array.isArray(entry.folded)||
      !Array.isArray(entry.flatMirror)||!Array.isArray(entry.foldedMirror)||
      [entry.flat,entry.folded,entry.flatMirror,entry.foldedMirror]
        .some(points=>points.length!==4)||
      !entry.flat.every(value=>point(value,2))||
      !entry.folded.every(value=>point(value,3))||
      !entry.flatMirror.every(value=>point(value,2))||
      !entry.foldedMirror.every(value=>point(value,3)))fail();
    const t=entry.t as number,q=(entry.anglesDeg as number[])[0]*Math.PI/180;
    const scale=4/(1+Math.cos(q));
    const expected:Point2[]=[[0,0],[Math.cos(t),Math.sin(t)],
      [scale*Math.cos(q),scale*Math.sin(q)],[2,scale*Math.sin(q)]];
    const flat=entry.flat as Point2[],folded=entry.folded as Point3[];
    const mirrorFlat=entry.flatMirror as Point2[],mirrorFolded=entry.foldedMirror as Point3[];
    if(!close(diag.terminalParabolaParameterDeg,
      (sample.rows.at(-1) as HuffmanParabolaRow).anglesDeg[0]))fail();
    for(let j=0;j<4;j++){
      if(!expected[j].every((value,k)=>close(flat[j][k],value))||
        !close(mirrorFlat[j][0],2-flat[j][0])||
        !close(mirrorFlat[j][1],-flat[j][1]))fail();
      const delta=folded[j].map((value,k)=>value-center[k]);
      if(!mirrorFolded[j].every((value,k)=>
        close(value,center[k]+2*dot(axis,delta)*axis[k]-delta[k],1e-6)))fail();
    }
    const flatLength=2-scale*Math.cos(q);
    if(!close(flat[2][0]+flat[2][1]**2/8,2)||
      !close(entry.flatThirdRulingLength,flatLength)||
      !close(entry.foldedThirdRulingLength,flatLength+1e-6)||
      !close(distance(flat[2],flat[3]),flatLength)||
      !close(distance(folded[2],folded[3]),flatLength+1e-6)||
      !close(distance(flat[1],flat[2]),distance(folded[1],folded[2]),1e-6))fail();
  }
  return raw as HuffmanParabolaResult;
}

export async function fetchHuffmanParabola(input:unknown,signal?:AbortSignal){
  const query=validateHuffmanParabolaQuery(input);
  return parseHuffmanParabolaResult(await apiWhenIdle('tessellation/huffman-parabola',query,signal),query);
}
