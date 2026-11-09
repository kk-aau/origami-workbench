import type {TessParams,TessPaperSpec,XY} from './tessellation';

/** Ordinary section-37 ArchimedeanPatch, separate from TwoColorableArchimedeanPatch. */
export const ARCHIMEDEAN_PATCH_SOURCE='Origamica.Section37.ArchimedeanPatch' as const;
export const ARCHIMEDEAN_PATCH_NUMBERS=[1,2,3,4,5,6,7,8,9,10,11,12] as const;
export type ArchimedeanPatchNumber=typeof ARCHIMEDEAN_PATCH_NUMBERS[number];
export type ArchimedeanPatchSpec={
  source:typeof ARCHIMEDEAN_PATCH_SOURCE;
  number:ArchimedeanPatchNumber;
  range1:[number,number];
  range2:[number,number];
  preset?:'in3180-centered-single'|'in3180-centered-lattice2x2'|'in3182-alt-single'|'in3185-alt-pruned'|'in3186-alt-single'|
    'in3186-alt-pruned';
};
export type ArchimedeanPatchParams=Extract<TessParams,{family:'custom'}>&{
  archimedeanPatch:ArchimedeanPatchSpec;
};

type Join=readonly [number,number,number];
type Tile=readonly [number,Join|null];
type Ref=readonly [number,number];
type Vector=readonly [Ref,Ref];

// Literal transcriptions of the ordinary JoinTiling and PatchVector(s) definitions.
// References remain 1-based, matching the saved notebook and the Python catalog.
const TILES:Record<ArchimedeanPatchNumber,readonly Tile[]>={
  1:[[3,null],[3,[1,2,1]]],
  2:[[4,null]],
  3:[[6,null]],
  4:[[3,null],[3,[1,2,1]],[3,[2,1,1]],[3,[3,2,1]],[3,[4,2,2]],
    [3,[5,2,1]],[3,[6,2,2]],[3,[7,3,2]],[6,[2,2,2]]],
  5:[[3,null],[3,[1,3,2]],[3,[2,3,3]],[3,[3,3,2]],[3,[4,2,2]],
    [3,[5,3,2]],[3,[6,2,2]],[3,[7,2,1]],[6,[2,2,2]]],
  6:[[3,null],[3,[1,2,1]],[4,[2,2,2]]],
  7:[[3,null],[4,[1,2,1]],[3,[2,3,2]],[3,[3,2,1]],[4,[3,3,3]],[3,[5,1,3]]],
  8:[[4,null],[3,[1,1,3]],[4,[2,1,1]],[3,[3,2,1]],[4,[4,2,1]],[6,[1,2,1]]],
  9:[[3,null],[6,[1,2,1]],[3,[2,3,1]]],
  10:[[3,null],[12,[1,2,12]],[3,[2,5,1]]],
  11:[[4,null],[6,[1,2,6]],[4,[2,3,1]],[6,[3,2,1]],[4,[4,4,2]],[12,[1,3,2]]],
  12:[[4,null],[8,[1,2,8]]],
};
const VECTORS:Record<ArchimedeanPatchNumber,readonly [Vector,Vector]>={
  1:[[[1,1],[1,2]],[[1,1],[1,3]]],
  2:[[[1,1],[1,2]],[[1,1],[1,4]]],
  3:[[[1,1],[1,3]],[[1,1],[1,5]]],
  4:[[[1,1],[4,2]],[[1,1],[9,5]]],
  5:[[[4,3],[1,2]],[[1,1],[9,5]]],
  6:[[[1,1],[1,2]],[[1,1],[3,4]]],
  7:[[[1,1],[2,2]],[[1,1],[5,4]]],
  8:[[[1,4],[6,4]],[[4,1],[6,4]]],
  9:[[[1,1],[2,2]],[[1,1],[2,5]]],
  10:[[[1,1],[2,3]],[[1,1],[2,8]]],
  11:[[[1,1],[4,2]],[[1,1],[6,8]]],
  12:[[[1,1],[2,3]],[[1,1],[2,6]]],
};
const VERTEX_TYPES:Record<ArchimedeanPatchNumber,readonly number[]>={
  1:[3,3,3,3,3,3],2:[4,4,4,4],3:[6,6,6],4:[3,3,3,3,6],
  5:[3,3,3,3,6],6:[3,3,3,4,4],7:[3,3,4,3,4],8:[3,4,6,4],
  9:[3,6,3,6],10:[3,12,12],11:[4,6,12],12:[4,8,8],
};

export const ARCHIMEDEAN_PATCH_CATALOG=ARCHIMEDEAN_PATCH_NUMBERS.map(number=>({
  number,
  vertexType:VERTEX_TYPES[number].join('.'),
  sourceFaces:TILES[number].length,
  notebookIn:[3104+4*(number-1),3105+4*(number-1),number===12?3151:3106+4*(number-1)] as const,
}));

export function archimedeanPatchPreset(number:ArchimedeanPatchNumber=1):ArchimedeanPatchSpec{
  return {source:ARCHIMEDEAN_PATCH_SOURCE,number,range1:[0,1],range2:[0,1]};
}

/** Notebook In[3180]: one two-triangle ArchimedeanPatch[1], centered pleat angle τ. */
export function archimedeanPatchIn3180Preset():ArchimedeanPatchSpec{
  return {source:ARCHIMEDEAN_PATCH_SOURCE,number:1,range1:[0,0],range2:[0,0],
    preset:'in3180-centered-single'};
}

/** In[3106] 2×2 source lattice with In[3180]'s two-triangle centered recipe. */
export function archimedeanPatchIn3180LatticePreset():ArchimedeanPatchSpec{
  return {source:ARCHIMEDEAN_PATCH_SOURCE,number:1,range1:[0,1],range2:[0,1],
    preset:'in3180-centered-lattice2x2'};
}

/** Notebook In[3185]: 4×4 ordinary square patch, Alt, then whole-tile prune. */
export function archimedeanPatchIn3185Preset():ArchimedeanPatchSpec{
  return {source:ARCHIMEDEAN_PATCH_SOURCE,number:2,range1:[0,3],range2:[0,3],
    preset:'in3185-alt-pruned'};
}

/** Notebook In[3182]: one three-face ArchimedeanPatch[6] centered Alt patch. */
export function archimedeanPatchIn3182Preset():ArchimedeanPatchSpec{
  return {source:ARCHIMEDEAN_PATCH_SOURCE,number:6,range1:[0,0],range2:[0,0],
    preset:'in3182-alt-single'};
}

/** Notebook In[3186]: the six source faces only, not the saved 120-tile extent. */
export function archimedeanPatchIn3186Preset():ArchimedeanPatchSpec{
  return {source:ARCHIMEDEAN_PATCH_SOURCE,number:8,range1:[0,0],range2:[0,0],
    preset:'in3186-alt-single'};
}

/** Notebook In[3186]: 120 source tiles, then whole-tile prune to 21 tiles. */
export function archimedeanPatchIn3186PrunedPreset():ArchimedeanPatchSpec{
  return {source:ARCHIMEDEAN_PATCH_SOURCE,number:8,range1:[-2,2],range2:[-1,2],
    preset:'in3186-alt-pruned'};
}

const SAVED_PRESETS={
  'in3180-centered-single':archimedeanPatchIn3180Preset(),
  'in3180-centered-lattice2x2':archimedeanPatchIn3180LatticePreset(),
  'in3182-alt-single':archimedeanPatchIn3182Preset(),
  'in3185-alt-pruned':archimedeanPatchIn3185Preset(),
  'in3186-alt-single':archimedeanPatchIn3186Preset(),
  'in3186-alt-pruned':archimedeanPatchIn3186PrunedPreset(),
};

/** The custom lattice adapter caps output at 192 faces; use the same bound here. */
export function readArchimedeanPatchSpec(value:unknown):ArchimedeanPatchSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(!['number,range1,range2,source','number,preset,range1,range2,source'].includes(
      Object.keys(raw).sort().join(','))||
    raw.source!==ARCHIMEDEAN_PATCH_SOURCE||
    typeof raw.number!=='number'||!Number.isInteger(raw.number)||
    !ARCHIMEDEAN_PATCH_NUMBERS.includes(raw.number as ArchimedeanPatchNumber))return null;
  const validRange=(range:unknown):range is [number,number]=>Array.isArray(range)&&range.length===2&&
    range.every(n=>typeof n==='number'&&Number.isInteger(n)&&Math.abs(n)<=64)&&range[0]<=range[1];
  if(!validRange(raw.range1)||!validRange(raw.range2))return null;
  const number=raw.number as ArchimedeanPatchNumber;
  const saved=typeof raw.preset==='string'&&
    Object.prototype.hasOwnProperty.call(SAVED_PRESETS,raw.preset)
    ?SAVED_PRESETS[raw.preset as keyof typeof SAVED_PRESETS]:null;
  if(raw.preset!==undefined&&(!saved||number!==saved.number||
    raw.range1[0]!==saved.range1[0]||raw.range1[1]!==saved.range1[1]||
    raw.range2[0]!==saved.range2[0]||raw.range2[1]!==saved.range2[1]))return null;
  if(TILES[number].length*(raw.range1[1]-raw.range1[0]+1)*
      (raw.range2[1]-raw.range2[0]+1)>192)return null;
  return {source:ARCHIMEDEAN_PATCH_SOURCE,number,
    range1:[...raw.range1],range2:[...raw.range2],
    ...(saved?{preset:saved.preset}:{})};
}

function unitRegular(sides:number):XY[]{
  const points:XY[]=[[0,0]];
  for(let k=0;k<sides-1;k++){
    const angle=2*Math.PI*k/sides,last=points[points.length-1];
    points.push([last[0]+Math.cos(angle),last[1]+Math.sin(angle)]);
  }
  return points;
}

function join(newTile:XY[],oldTile:XY[],oldVertex:number,newVertex:number):XY[]{
  const oldStart=oldTile[oldVertex-1],oldEnd=oldTile[oldVertex%oldTile.length];
  const newEnd=newTile[newVertex-1],newStart=newTile[(newVertex-2+newTile.length)%newTile.length];
  const a=oldStart[0]-oldEnd[0],b=oldStart[1]-oldEnd[1];
  const c=newEnd[0]-newStart[0],d=newEnd[1]-newStart[1],den=c*c+d*d;
  const re=(a*c+b*d)/den,im=(b*c-a*d)/den;
  if(Math.abs(Math.hypot(re,im)-1)>1e-10)throw Error('ArchimedeanPatch 来源接边长度不一致。');
  return newTile.map(point=>{
    const x=point[0]-newStart[0],y=point[1]-newStart[1];
    return [oldEnd[0]+re*x-im*y,oldEnd[1]+im*x+re*y];
  });
}

export function archimedeanPatchGeometry(number:ArchimedeanPatchNumber):{
  sourceTiles:XY[][];vertices:XY[];faces:number[][];lattice:[XY,XY];vertexType:number[];
}{
  if(!ARCHIMEDEAN_PATCH_NUMBERS.includes(number))throw Error('ArchimedeanPatch 仅有 1–12 的显式来源。');
  const sourceTiles:XY[][]=[];
  for(const [sides,link] of TILES[number]){
    let polygon=unitRegular(sides);
    if(link){const [tile,oldVertex,newVertex]=link;
      polygon=join(polygon,sourceTiles[tile-1],oldVertex,newVertex);}
    sourceTiles.push(polygon);
  }
  const ref=([tile,vertex]:Ref)=>sourceTiles[tile-1][vertex-1];
  const lattice=VECTORS[number].map(([start,end])=>{
    const a=ref(start),b=ref(end);return [b[0]-a[0],b[1]-a[1]] as XY;
  }) as [XY,XY];
  const area=sourceTiles.reduce((sum,polygon)=>sum+Math.abs(polygon.reduce((part,a,i)=>{
    const b=polygon[(i+1)%polygon.length];return part+a[0]*b[1]-a[1]*b[0];
  },0))/2,0);
  const determinant=lattice[0][0]*lattice[1][1]-lattice[0][1]*lattice[1][0];
  if(determinant<=1e-10||Math.abs(area-determinant)>1e-8*Math.max(1,area))
    throw Error('ArchimedeanPatch 来源面积与格矢不一致。');
  const vertices:XY[]=[],faces:number[][]=[],lookup=new Map<string,number>();
  for(const polygon of sourceTiles){
    faces.push(polygon.map(point=>{
      const key=point.map(n=>Math.round(n*1e9)).join(',');
      let index=lookup.get(key);
      if(index===undefined){index=vertices.length;vertices.push([...point] as XY);lookup.set(key,index);}
      return index;
    }));
  }
  return {sourceTiles,vertices,faces,lattice,vertexType:[...VERTEX_TYPES[number]]};
}

/** Saved 2×2 examples are the default; other bounded ranges use the same lattice adapter. */
export function archimedeanPatchParams(spec:ArchimedeanPatchSpec,paper?:TessPaperSpec):ArchimedeanPatchParams{
  const source=readArchimedeanPatchSpec(spec);
  if(!source)throw Error('ArchimedeanPatch 来源参数无效。');
  const mesh=archimedeanPatchGeometry(source.number);
  const saved=source.preset!==undefined;
  const centered1=source.preset==='in3180-centered-single'||
    source.preset==='in3180-centered-lattice2x2';
  const single6=source.preset==='in3182-alt-single';
  const single8=source.preset==='in3186-alt-single';
  const pruned8=source.preset==='in3186-alt-pruned';
  const pruned2=source.preset==='in3185-alt-pruned';
  const sourceTypes=centered1?['MMM','VVV']:single6?['MMM','VVV','MMMM']:
    ['MMMM','VVV','MMMM','VVV','MMMM','VVVVVV'];
  return {family:'custom',vertices:mesh.vertices,faces:mesh.faces,
    repeatX:1,repeatY:1,lattice:mesh.lattice,
    range1:[...source.range1],range2:[...source.range2],
    customOutput:saved?'tile-twists':'tiling',
    ...(saved?{
      tileTwists:centered1||single6||single8||pruned8?sourceTypes.map(types=>({
        width:centered1||single6 ? .2 : .12,offset:0,
        ...(centered1?{tilt:70}:{angleMode:'twist' as const,twistAngle:single6?25:29}),
        centralTypes:[...types] as ('V'|'M')[],
      })):[{width:.2,offset:0,angleMode:'twist' as const,twistAngle:30,
        centralTypes:['V','V','M','M'] as ('V'|'M')[]}],
      ...(pruned2?{
        pruneBoundary:[[0,0],[2.9,0],[2.9,2.9],[0,2.9]] as XY[],
      }:{}),
      ...(pruned8?{
        pruneBoundary:[[.1,.1],[3.9,.1],[3.9,3.9],[.1,3.9]] as XY[],
      }:{}),
      ...(!centered1&&!single6?{monolithicOptions:{mergedEdges:'delete' as const,
        samePtTolerance:1e-8,collinearCleanup:true,collinearTolerance:1e-8}}:{}),
    }:{}),
    angle:36,scale:.3,archimedeanPatch:source,...(paper?{paper}:{})};
}

/** Call after generic readTessParams validation to retain a trusted source name. */
export function archimedeanPatchSourceMatches(value:unknown,spec:ArchimedeanPatchSpec):boolean{
  const source=readArchimedeanPatchSpec(spec);
  if(!source||!value||typeof value!=='object'||Array.isArray(value))return false;
  const actual=value as Record<string,unknown>,expected=archimedeanPatchParams(source);
  if(actual.family!=='custom'||actual.customOutput!==expected.customOutput||
    actual.repeatX!==1||actual.repeatY!==1||
    actual.stationaryFace!==undefined||
    actual.unitRegularCentered!==undefined||actual.unitTriangle!==undefined||
    actual.unitCyclic!==undefined||actual.unitQuadrilateralSplit!==undefined)return false;
  const canonical=(value:unknown)=>JSON.stringify(value,(_key,item)=>
    item&&typeof item==='object'&&!Array.isArray(item)
      ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
  const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
  if(!same(actual.faces,expected.faces)||!same(actual.range1,expected.range1)||
    !same(actual.range2,expected.range2)||
    !same(actual.tileTwists,expected.tileTwists)||
    !same(actual.monolithicOptions,expected.monolithicOptions)||
    !same(actual.pruneBoundary,expected.pruneBoundary))return false;
  const pointwise=(actualPoints:unknown,reference:XY[]):boolean=>Array.isArray(actualPoints)&&
    actualPoints.length===reference.length&&actualPoints.every((point,i)=>Array.isArray(point)&&
      point.length===2&&point.every((n,j)=>typeof n==='number'&&Number.isFinite(n)&&
        Math.abs(n-reference[i][j])<=1e-8));
  return pointwise(actual.vertices,expected.vertices)&&pointwise(actual.lattice,expected.lattice!);
}
