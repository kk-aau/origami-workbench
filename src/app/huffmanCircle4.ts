import {apiWhenIdle} from './api';

export type HuffmanCircle4Query={family:'huffman-circle4-in4072';divisions:number};
type Point2=[number,number];
type Point3=[number,number,number];
export type HuffmanCircle4Row={
  t:number;anglesDeg:[number,number,number];
  flat:Point2[];folded:Point3[];flatMirror:Point2[];foldedMirror:Point3[];
  flatThirdRulingLength:number;foldedThirdRulingLength:number;
};
export type HuffmanCircle4Result={
  family:'origamica-huffman-circle4-pair';query:HuffmanCircle4Query;
  source:{constructionCell:'In[4070]';closureCell:'In[4071]';
    displayCell:'In[4072]';savedDivisions:25;
    samplingStatus:'saved-input'|'bounded-local-extension';
    machineReadableWolframOut:false};
  closure:{savedInitialGuessDeg:number[];localRootDeg:number[];
    residuals:number[];maximumAbsoluteResidual:number;rootUniqueCertified:false};
  certification:{thirdRulingOffset:1e-6;firstTwoPatchesAnalyticIsometry:true;
    completeBlockExactIsometry:false;exactStraightCreaseFOLD:false;
    adoptableCreasePattern:false;deploymentPathChecked:false;
    selfCollisionChecked:false};
  sample:{rows:HuffmanCircle4Row[];pairedBlocks:2};
};

export const HUFFMAN_CIRCLE4_PRESET:HuffmanCircle4Query={
  family:'huffman-circle4-in4072',divisions:25,
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
function fail():never{throw Error('Huffman 保存例的来源、闭合或配对绘图数据异常。');}

export function validateHuffmanCircle4Query(value:unknown):HuffmanCircle4Query{
  if(!record(value)||value.family!=='huffman-circle4-in4072'||
    Object.keys(value).some(key=>!['family','divisions'].includes(key)))
    throw Error('请选择受限的 In[4072] 保存例。');
  const divisions=value.divisions??25;
  if(!finite(divisions)||!Number.isInteger(divisions)||divisions<8||divisions>64)
    throw Error('采样段数须为 8–64 的整数。');
  return {family:'huffman-circle4-in4072',divisions};
}

/** Rejects a false isometry/FOLD claim and checks the saved planar equations. */
export function parseHuffmanCircle4Result(raw:unknown,requested?:HuffmanCircle4Query):HuffmanCircle4Result{
  if(!record(raw)||!keys(raw,['family','query','source','closure','certification','sample'])||
    raw.family!=='origamica-huffman-circle4-pair'||!record(raw.query)||
    !record(raw.source)||!record(raw.closure)||!record(raw.certification)||
    !record(raw.sample))fail();
  const query=validateHuffmanCircle4Query(raw.query);
  if(!keys(raw.query,['family','divisions'])||raw.query.divisions!==query.divisions||
    requested&&requested.divisions!==query.divisions)fail();
  const source=raw.source;
  if(!keys(source,['constructionCell','closureCell','displayCell','savedDivisions',
    'samplingStatus','machineReadableWolframOut'])||
    source.constructionCell!=='In[4070]'||source.closureCell!=='In[4071]'||
    source.displayCell!=='In[4072]'||source.savedDivisions!==25||
    source.samplingStatus!==(query.divisions===25?'saved-input':'bounded-local-extension')||
    source.machineReadableWolframOut!==false)fail();
  const closure=raw.closure,guess=[33,87,60,-52],root=[
    38.72794743,80.39502465,82.11258052,-63.36130120];
  if(!keys(closure,['savedInitialGuessDeg','localRootDeg','residuals',
    'maximumAbsoluteResidual','rootUniqueCertified'])||
    !Array.isArray(closure.savedInitialGuessDeg)||
    !Array.isArray(closure.localRootDeg)||!Array.isArray(closure.residuals)||
    closure.savedInitialGuessDeg.length!==4||closure.localRootDeg.length!==4||
    closure.residuals.length!==4||!guess.every((n,i)=>
      close((closure.savedInitialGuessDeg as unknown[])[i],n))||
    !root.every((n,i)=>close((closure.localRootDeg as unknown[])[i],n,.005))||
    !closure.residuals.every(value=>finite(value)&&Math.abs(value)<2e-6)||
    !close(closure.maximumAbsoluteResidual,
      Math.max(...closure.residuals.map((value:number)=>Math.abs(value))),1e-10)||
    closure.rootUniqueCertified!==false)fail();
  const cert=raw.certification;
  if(!keys(cert,['thirdRulingOffset','firstTwoPatchesAnalyticIsometry',
    'completeBlockExactIsometry','exactStraightCreaseFOLD','adoptableCreasePattern',
    'deploymentPathChecked','selfCollisionChecked'])||
    cert.thirdRulingOffset!==1e-6||cert.firstTwoPatchesAnalyticIsometry!==true||
    ['completeBlockExactIsometry','exactStraightCreaseFOLD','adoptableCreasePattern',
      'deploymentPathChecked','selfCollisionChecked'].some(key=>cert[key]!==false))fail();
  const sample=raw.sample;
  if(!keys(sample,['rows','pairedBlocks'])||sample.pairedBlocks!==2||
    !Array.isArray(sample.rows)||sample.rows.length!==query.divisions+1)fail();
  const first=sample.rows[0];
  if(!record(first)||!Array.isArray(first.folded)||first.folded.length!==4||
    !first.folded.every(value=>point(value,3)))fail();
  const center=first.folded[1] as number[];
  const axisRaw=(first.folded[2] as number[]).map((value,index)=>value/2-center[index]);
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
    const expected:Point2[]=[[0,0],[Math.cos(t),Math.sin(t)],
      [4*Math.cos(q)-2,4*Math.sin(q)],[2,4*Math.sin(q)]];
    const flat=entry.flat as Point2[],folded=entry.folded as Point3[];
    const mirrorFlat=entry.flatMirror as Point2[],mirrorFolded=entry.foldedMirror as Point3[];
    for(let j=0;j<4;j++){
      if(!expected[j].every((value,k)=>close(flat[j][k],value))||
        !close(mirrorFlat[j][0],2-flat[j][0])||
        !close(mirrorFlat[j][1],-flat[j][1]))fail();
      const delta=folded[j].map((value,k)=>value-center[k]);
      if(!mirrorFolded[j].every((value,k)=>
        close(value,center[k]+2*dot(axis,delta)*axis[k]-delta[k],1e-6)))fail();
      for(let k=j+1;k<4;k++)if(!close(distance(folded[j],folded[k]),
        distance(mirrorFolded[j],mirrorFolded[k]),1e-6))fail();
    }
    const flatLength=4*(1-Math.cos(q));
    if(!close(entry.flatThirdRulingLength,flatLength)||
      !close(entry.foldedThirdRulingLength,flatLength+1e-6)||
      !close(distance(flat[2],flat[3]),flatLength)||
      !close(distance(folded[2],folded[3]),flatLength+1e-6))fail();
  }
  return raw as HuffmanCircle4Result;
}

export async function fetchHuffmanCircle4(input:unknown,signal?:AbortSignal){
  const query=validateHuffmanCircle4Query(input);
  return parseHuffmanCircle4Result(await apiWhenIdle('tessellation/huffman-circle4',query,signal),query);
}
