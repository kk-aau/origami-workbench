import type {TessParams} from './tessellation';
import {ORIGINAL_MONOLITHIC_OPTIONS} from './tileMonolithicOptions';
import {twoColorableArchimedeanGeometry} from './twoColorableArchimedeanPatchSource';
import {TWO_COLORABLE_OFFSET_SOURCE_PARAMETERS} from './twoColorableOffsetValues';

/** In[3183] defines the offset formula; no CP Out is saved for these sources. */
export const TWO_COLORABLE_OFFSET_CANDIDATE_SOURCE=
  'Origamica.Section37.In3183.TwoColorableOffsetCandidate' as const;
export type TwoColorableOffsetCandidateNumber=1|8|9;
export type TwoColorableOffsetCandidateSpec={
  source:typeof TWO_COLORABLE_OFFSET_CANDIDATE_SOURCE;
  number:TwoColorableOffsetCandidateNumber;
  notebookFormulaIn:3183;
  savedCpOut:false;
  parity:(1|-1)[];
  width:number;
  offsetMagnitude:number;
  centralTypes:('M'|'V')[][];
};

export const TWO_COLORABLE_OFFSET_CANDIDATE_NUMBERS=[1,8,9] as const;

export function twoColorableOffsetCandidate(number:TwoColorableOffsetCandidateNumber):TwoColorableOffsetCandidateSpec{
  if(!TWO_COLORABLE_OFFSET_CANDIDATE_NUMBERS.includes(number))throw Error('未定义的二色偏置候选。');
  const mesh=twoColorableArchimedeanGeometry(number),parameters=TWO_COLORABLE_OFFSET_SOURCE_PARAMETERS[number];
  return {source:TWO_COLORABLE_OFFSET_CANDIDATE_SOURCE,number,notebookFormulaIn:3183,
    savedCpOut:false,parity:[...mesh.parity],width:parameters.width,
    offsetMagnitude:parameters.offsetMagnitude,
    centralTypes:parameters.centralTypes.map(types=>[...types] as ('M'|'V')[])};
}

/** Candidate identity is exact; changing any field makes it an unverified construction. */
export function readTwoColorableOffsetCandidate(value:unknown):TwoColorableOffsetCandidateSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>,number=raw.number;
  if(typeof number!=='number'||!Number.isInteger(number)||
    !TWO_COLORABLE_OFFSET_CANDIDATE_NUMBERS.includes(number as TwoColorableOffsetCandidateNumber))return null;
  const expected=twoColorableOffsetCandidate(number as TwoColorableOffsetCandidateNumber);
  if(Object.keys(raw).sort().join(',')!==Object.keys(expected).sort().join(','))return null;
  const canonical=(item:unknown):unknown=>Array.isArray(item)?item.map(canonical)
    :item&&typeof item==='object'?Object.fromEntries(Object.entries(item)
      .sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>[key,canonical(entry)])):item;
  return JSON.stringify(canonical(value))===JSON.stringify(canonical(expected))?expected:null;
}

/** Internal diagnostic request; the candidate provenance is kept out of the backend request. */
export function twoColorableOffsetCandidateRequest(value:unknown):Extract<TessParams,{family:'custom'}>{
  const spec=readTwoColorableOffsetCandidate(value);
  if(!spec)throw Error('二色偏置候选来源不匹配。');
  const mesh=twoColorableArchimedeanGeometry(spec.number);
  return {family:'custom',vertices:mesh.vertices,faces:mesh.faces,repeatX:1,repeatY:1,
    angle:36,scale:.3,customOutput:'tile-twists',
    tileTwists:spec.centralTypes.map((types,index)=>({width:spec.width,
      offset:spec.parity[index]*spec.offsetMagnitude,tilt:90,centralTypes:[...types]})),
    monolithicOptions:structuredClone(ORIGINAL_MONOLITHIC_OPTIONS)};
}

/** Findings from the named/generic CP and full-sheet flat-layer verifier. */
export const TWO_COLORABLE_OFFSET_DIAGNOSTICS={
  1:{cp:[18,28,11],geometry:'passed',local:'passed',lff:'passed',
    flatGeometry:'ready',layers:'no-solution',reason:'整片层序约束传播无解。'},
  8:{cp:[54,88,35],geometry:'passed',local:'passed',lff:'passed',
    flatGeometry:'ready',layers:'solved',reason:'本项目原面统一层序唯一；仍无原版保存数值 CP Out。'},
  9:{cp:null,geometry:'not_computed',local:'source-rejected',lff:'not_computed',
    flatGeometry:'not_computed',layers:'not_computed',
    sourceRejection:'逐块扭转的固定山谷不满足 Maekawa：顶点 (0.65, 0.606217783) 有 M=1、V=1，两者须相差 2。',
    reason:'原版固定赋型在接缝处有 M=1、V=1，不满足 Maekawa；未生成整片 CP，未计算层序。'},
} as const;
