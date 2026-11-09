import type {TessParams,TessPaperSpec,XY} from './tessellation';
import {ORIGINAL_MONOLITHIC_OPTIONS} from './tileMonolithicOptions';
import {ARCHIMEDEAN_PATCH_CATALOG,archimedeanPatchGeometry} from './archimedeanPatchSource';
import {TWO_COLORABLE_OFFSET_SOURCE_PARAMETERS} from './twoColorableOffsetValues';

export const TWO_COLORABLE_ARCHIMEDEAN_SOURCE='Origamica.Section37.TwoColorableArchimedeanPatch' as const;
export const TWO_COLORABLE_ARCHIMEDEAN_NUMBERS=[1,2,8,9] as const;
export type TwoColorableArchimedeanNumber=typeof TWO_COLORABLE_ARCHIMEDEAN_NUMBERS[number];
export type TwoColorableArchimedeanPreset='mother'|'in3184-offset'|'in3187-alt-pruned'|'in3188-offset-pruned'|'in3183-offset-derived';
type SourceBase={
  source:typeof TWO_COLORABLE_ARCHIMEDEAN_SOURCE;
  number:TwoColorableArchimedeanNumber;
  parity:(1|-1)[];
};
export type TwoColorableArchimedeanSpec=
  |(SourceBase&{preset:'mother';range1:[number,number];range2:[number,number]})
  |(SourceBase&{number:2;preset:'in3184-offset'|'in3187-alt-pruned'|'in3188-offset-pruned'})
  |(SourceBase&{number:8;preset:'in3183-offset-derived';notebookFormulaIn:3183;savedCpOut:false});
export type TwoColorableArchimedeanParams=Extract<TessParams,{family:'custom'}>&{
  twoColorableArchimedeanPatch:TwoColorableArchimedeanSpec;
};

const PARITY:Record<TwoColorableArchimedeanNumber,readonly (1|-1)[]>={
  1:[1,-1],2:[1,-1],8:[1,-1,1,-1,1,-1],9:[1,-1,1],
};
const SOURCE_INS:Record<TwoColorableArchimedeanNumber,readonly [number,number]>={
  1:[3156,3159],2:[3160,3163],8:[3164,3167],9:[3168,3171],
};
export const TWO_COLORABLE_ARCHIMEDEAN_CATALOG=TWO_COLORABLE_ARCHIMEDEAN_NUMBERS.map(number=>({
  number,
  vertexType:ARCHIMEDEAN_PATCH_CATALOG[number-1].vertexType,
  sourceFaces:number===2?2:ARCHIMEDEAN_PATCH_CATALOG[number-1].sourceFaces,
  parity:[...PARITY[number]],
  notebookIn:SOURCE_INS[number],
}));

export function twoColorableArchimedeanPreset(
  number:TwoColorableArchimedeanNumber=2,
  preset:TwoColorableArchimedeanPreset='mother',
):TwoColorableArchimedeanSpec{
  if(!TWO_COLORABLE_ARCHIMEDEAN_NUMBERS.includes(number)||
    (preset==='in3183-offset-derived'?number!==8:preset!=='mother'&&number!==2))
    throw Error('二色 ArchimedeanPatch 来源预设无效。');
  const common={source:TWO_COLORABLE_ARCHIMEDEAN_SOURCE,number,parity:[...PARITY[number]]};
  if(preset==='mother')return {...common,preset,range1:[0,1],range2:[0,1]};
  if(preset==='in3183-offset-derived')return {...common,number:8,preset,
    notebookFormulaIn:3183,savedCpOut:false};
  if(!['in3184-offset','in3187-alt-pruned','in3188-offset-pruned'].includes(preset))
    throw Error('二色 ArchimedeanPatch 保存例未定义。');
  return {...common,number:2,preset} as TwoColorableArchimedeanSpec;
}

export function readTwoColorableArchimedeanSpec(value:unknown):TwoColorableArchimedeanSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(raw.source!==TWO_COLORABLE_ARCHIMEDEAN_SOURCE||
    typeof raw.number!=='number'||!Number.isInteger(raw.number)||
    !TWO_COLORABLE_ARCHIMEDEAN_NUMBERS.includes(raw.number as TwoColorableArchimedeanNumber))return null;
  const number=raw.number as TwoColorableArchimedeanNumber;
  if(!Array.isArray(raw.parity)||JSON.stringify(raw.parity)!==JSON.stringify(PARITY[number]))return null;
  if(raw.preset==='mother'){
    if(Object.keys(raw).sort().join(',')!=='number,parity,preset,range1,range2,source')return null;
    const validRange=(range:unknown):range is [number,number]=>Array.isArray(range)&&range.length===2&&
      range.every(n=>typeof n==='number'&&Number.isInteger(n)&&Math.abs(n)<=64)&&range[0]<=range[1];
    if(!validRange(raw.range1)||!validRange(raw.range2))return null;
    const faceCount=number===2?2:ARCHIMEDEAN_PATCH_CATALOG[number-1].sourceFaces;
    if(faceCount*(raw.range1[1]-raw.range1[0]+1)*
        (raw.range2[1]-raw.range2[0]+1)>192)return null;
    return {source:TWO_COLORABLE_ARCHIMEDEAN_SOURCE,number,parity:[...PARITY[number]],
      preset:'mother',range1:[...raw.range1],range2:[...raw.range2]};
  }
  if(raw.preset==='in3183-offset-derived'){
    if(number!==8||raw.notebookFormulaIn!==3183||raw.savedCpOut!==false||
      Object.keys(raw).sort().join(',')!==
      'notebookFormulaIn,number,parity,preset,savedCpOut,source')return null;
    return twoColorableArchimedeanPreset(8,'in3183-offset-derived');
  }
  if(number!==2||Object.keys(raw).sort().join(',')!=='number,parity,preset,source'||
    raw.preset!=='in3184-offset'&&raw.preset!=='in3187-alt-pruned'&&
    raw.preset!=='in3188-offset-pruned')return null;
  return {source:TWO_COLORABLE_ARCHIMEDEAN_SOURCE,number:2,parity:[1,-1],preset:raw.preset};
}

/** n=2 has its own two-square JoinTiling and PatchVectors, not ordinary n=2. */
export function twoColorableArchimedeanGeometry(number:TwoColorableArchimedeanNumber):{
  sourceTiles:XY[][];vertices:XY[];faces:number[][];lattice:[XY,XY];parity:(1|-1)[];
}{
  if(!TWO_COLORABLE_ARCHIMEDEAN_NUMBERS.includes(number))
    throw Error('二色 ArchimedeanPatch 仅有 1、2、8、9 的显式来源。');
  if(number===2){
    const vertices:XY[]=[[0,0],[1,0],[1,1],[0,1],[2,0],[2,1]];
    const faces=[[0,1,2,3],[1,4,5,2]];
    return {sourceTiles:faces.map(face=>face.map(index=>[...vertices[index]] as XY)),
      vertices,faces,lattice:[[2,0],[1,1]],parity:[1,-1]};
  }
  const ordinary=archimedeanPatchGeometry(number);
  return {...ordinary,parity:[...PARITY[number]]};
}

const BOUNDARY:XY[]=[[.1,.1],[3.9,.1],[3.9,3.9],[.1,3.9]];

/** Saved n=2 CP cases carry exact per-source options; parity gives the signed offsets. */
export function twoColorableArchimedeanParams(spec:TwoColorableArchimedeanSpec,paper?:TessPaperSpec):TwoColorableArchimedeanParams{
  const source=readTwoColorableArchimedeanSpec(spec);
  if(!source)throw Error('二色 ArchimedeanPatch 来源参数无效。');
  const mesh=twoColorableArchimedeanGeometry(source.number);
  const base={family:'custom' as const,vertices:mesh.vertices,faces:mesh.faces,
    repeatX:1,repeatY:1,angle:36,scale:.3,twoColorableArchimedeanPatch:source};
  if(source.preset==='mother')return {...base,customOutput:'tiling',lattice:mesh.lattice,
    range1:[...source.range1],range2:[...source.range2],...(paper?{paper}:{})};
  if(source.preset==='in3183-offset-derived'){
    const values=TWO_COLORABLE_OFFSET_SOURCE_PARAMETERS[8];
    return {...base,customOutput:'tile-twists',tileTwists:values.centralTypes.map((types,index)=>({
      width:values.width,offset:source.parity[index]*values.offsetMagnitude,tilt:90,
      centralTypes:[...types] as ('M'|'V')[],
    })),monolithicOptions:structuredClone(ORIGINAL_MONOLITHIC_OPTIONS),
      ...(paper?{paper}:{})};
  }
  const offset=source.preset==='in3184-offset'?.1:.1001;
  const tileTwists=source.preset==='in3187-alt-pruned'
    ?[{width:.2,offset:0,angleMode:'twist' as const,twistAngle:30,
        centralTypes:['M','M','M','M'] as ('M'|'V')[]},
      {width:.2,offset:0,angleMode:'twist' as const,twistAngle:30,
        centralTypes:['V','V','V','V'] as ('M'|'V')[]}]
    :mesh.parity.map(sign=>({width:.2,offset:sign*offset,tilt:90,
      centralTypes:['M','M','M','M'] as ('M'|'V')[]}));
  return {...base,customOutput:'tile-twists',tileTwists,
    monolithicOptions:structuredClone(ORIGINAL_MONOLITHIC_OPTIONS),
    ...(source.preset==='in3184-offset'?{}:{lattice:mesh.lattice,
      range1:[-2,2] as [number,number],range2:[0,3] as [number,number],
      pruneBoundary:structuredClone(BOUNDARY)}),
  };
}

/** Generic custom validation runs first; this binds the source name to its exact saved geometry/options. */
export function twoColorableArchimedeanSourceMatches(value:unknown,spec:TwoColorableArchimedeanSpec):boolean{
  const source=readTwoColorableArchimedeanSpec(spec);
  if(!source||!value||typeof value!=='object'||Array.isArray(value))return false;
  const actual=value as Record<string,unknown>,expected=twoColorableArchimedeanParams(source);
  if(actual.family!=='custom'||actual.repeatX!==1||actual.repeatY!==1||
    source.preset!=='mother'&&source.preset!=='in3183-offset-derived'&&actual.paper!==undefined||
    actual.archimedeanPatch!==undefined||actual.unitRegularCentered!==undefined||
    actual.unitTriangle!==undefined||actual.unitCyclic!==undefined||
    actual.unitQuadrilateralSplit!==undefined)return false;
  const ordered=(value:unknown):unknown=>Array.isArray(value)?value.map(ordered)
    :value&&typeof value==='object'?Object.fromEntries(Object.entries(value)
      .sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,ordered(item)])):value;
  const same=(a:unknown,b:unknown)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
  for(const key of ['faces','range1','range2','pruneBoundary','customOutput',
    'tileTwists','monolithicOptions'] as const)if(!same(actual[key],expected[key]))return false;
  const pointwise=(points:unknown,reference:XY[]|undefined):boolean=>reference===undefined
    ?points===undefined
    :Array.isArray(points)&&points.length===reference.length&&points.every((point,i)=>
      Array.isArray(point)&&point.length===2&&point.every((n,j)=>
        typeof n==='number'&&Number.isFinite(n)&&Math.abs(n-reference[i][j])<=1e-8));
  return pointwise(actual.vertices,expected.vertices)&&pointwise(actual.lattice,expected.lattice);
}
