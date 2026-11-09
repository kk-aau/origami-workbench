import {MIN_TOTAL_METHOD,minTotalPleatResultMatches,minTotalPleatInputAllowed} from './reciprocalMinTotalPleat';
import {TRANSFORM_KEYS,shrinkAndTwist,postRotation,readPrimalDualOptions,type PrimalDualOptions} from './primalDualParams';
import {polygonTilePreset,readPolygonTileParams,type PolygonTileParams} from './polygonTileParams';
import {splitPreset,readSplitParams,type ExactSplitParams} from './splitParams';
import {wovenPreset,readWovenParams,type WovenParams} from './wovenParams';
import {readWovenCourteousSource} from './wovenCourteous';
import {hasWovenInternalB,inspectWovenCutTopology} from './wovenCutTopology';
import {readWovenGraph,wovenGraphComponents} from './wovenGraph';
import {brocardPreset,readBrocardParams,type BrocardParams} from './brocardParams';
import {readTileDecorations,type TileDecorations} from './tileDecorations';
import {ORIGINAL_MONOLITHIC_OPTIONS,readTileMonolithicOptions,type TileMonolithicOptions} from './tileMonolithicOptions';
import {UNIT_REGULAR_CENTERED_ALT_TILE_TYPE,UNIT_REGULAR_OFFSET_TILE_TYPE,
  readUnitRegularCenteredSpec,unitRegularCenteredMesh,unitRegularSidePairLayout,
  type UnitRegularCenteredSpec} from './unitRegularCentered';
import {UNIT_TRIANGLE_ALT_TYPE,UNIT_TRIANGLE_OFFSET_TYPE,readUnitTriangleSpec,
  unitTriangleMesh,type UnitTriangleSpec} from './unitTriangleSource';
import {UNIT_CYCLIC_ALT_TYPE,readUnitCyclicSpec,unitCyclicMesh,unitCyclicParams,type UnitCyclicSpec} from './unitCyclicSource';
import {UNIT_QUAD_ALT_SPLIT_TYPE,readUnitQuadrilateralSplitSpec,unitQuadrilateralSplitMesh,unitQuadrilateralSplitParams,type UnitQuadrilateralSplitSpec} from './unitQuadrilateralSplitSource';
import {archimedeanPatchSourceMatches,readArchimedeanPatchSpec,type ArchimedeanPatchSpec} from './archimedeanPatchSource';
import {twoColorableArchimedeanSourceMatches,readTwoColorableArchimedeanSpec,type TwoColorableArchimedeanSpec} from './twoColorableArchimedeanPatchSource';
import {twoUniformPatchSourceMatches,readTwoUniformPatchSpec,type TwoUniformPatchSpec} from './twoUniformPatchSource';
import {readTileSpecs,type TileSpec} from './tileSpecs';
import {radialPotPreset,readRadialPotParams,type RadialPotParams} from './radialPotParams';
import {rectangularPotPreset,readRectangularPotParams,type RectangularPotParams} from './rectangularPotParams';
import {joinedTubePreset,readJoinedTubeParams,type JoinedTubeParams} from './joinedTubeParams';
import {closedTubePreset,readClosedTubeParams,type ClosedTwistToppedTubeParams} from './closedTubeParams';
import {gorePaperPreset,readGorePaperParams,gorePaperSourceValid,type GorePaperParams} from './goreData';
import {goreMultipleMaterialDocument,multipleGoreMaterialMatches} from './goreMultipleMaterial';
import {generatedDocumentMatches} from './generatedSourceBinding';
import {flasherPreset,readFlasherParams,type FlasherParams} from './flasherParams';
import {curvedCirclePolyhedralPreset,readCurvedCirclePolyhedralParams,type CurvedCirclePolyhedralParams} from './curvedCirclePolyhedralParams';
import {linkedFirstBandPolyhedralPreset,readLinkedFirstBandPolyhedralParams,type LinkedFirstBandPolyhedralParams} from './linkedFirstBandPolyhedralParams';
import {paraboloidalFlasherPreset,readParaboloidalFlasherParams,type ParaboloidalFlasherParams} from './paraboloidalFlasherParams';
import {twistedPotPreset,readTwistedPotParams,type TwistedPotParams} from './twistedPotParams';
import {spatialMeshScene} from './spatialMeshView';
import {flasherSourceParametersMatch,flasherSourceFaceVertexBudget} from './flasherSourceBudget';
import {previewClippedCoordinates,type PaperClipPreviewRecipe} from './tessellationPaperClipPreview';
import {validRingVectorPolygon} from './ringVectorPolygon';
import {validRingVectorFormulaText} from './ringVectorFormulaText';
import {readRingVectorFunctionDefinitions,inspectRingBuiltinLogInput} from './ringVectorFunctionDefinitions';
import {ringLogSourceMatches} from './ringLogSource';
import {validRingLinearMap,type RingLinearMap} from './ringLinearMaps';
import {validRingFourierCurve,type RingFourierCurve} from './ringFourierCurves';
import type {Doc} from '../core/types';
import {validateDoc} from '../core/types';
import {importDocument} from '../core/formats';
import {discreteCurveCPPreset,readDiscreteCurveCPParams,discreteCurveCPSourceValid,discreteCurveCPLocalAssignmentsValid,type DiscreteCurveCPParams} from './discreteCurveCP';

export type TessFamily='discrete-curve-cp'|'twist'|'circular-twist'|'rigid-quad'|'radial-pot'|'gore-paper'|'rectangular-pot'|'twisted-pot'|'flasher'|'paraboloidal-flasher'|'curved-circle-polyhedral'|'linked-first-band-polyhedral'|'twist-joined-tube'|'double-joined-tube'|'closed-twist-topped-tube'|'periodic'|'primal-dual'|'archimedean'|'nonperiodic'|'custom'|'ring'|'flagstone'|'woven'|'brocard'|'split'|'woven-lines'|'polygon-tile';
export type TessTiling='square'|'triangle'|'hexagon';
export type XY=[number,number];
export type TessPaperSpec={shape:'square'|'rectangle'|'regular';aspect?:number;sides?:number;margin:number;fit?:'extend'|'inscribed'};
export const defaultTessPaper=():TessPaperSpec=>({shape:'square',margin:.1});
/** An absent paper field is the saved legacy behavior, not a new default. */
export function readTessPaper(value:unknown):TessPaperSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(Object.keys(raw).some(key=>!['shape','aspect','sides','margin','fit'].includes(key))||typeof raw.shape!=='string'||!['square','rectangle','regular'].includes(raw.shape)
    ||raw.fit!==undefined&&(typeof raw.fit!=='string'||!['extend','inscribed'].includes(raw.fit))
    ||typeof raw.margin!=='number'||!Number.isFinite(raw.margin)||raw.margin<.02||raw.margin>(raw.fit==='inscribed'?.45:1))return null;
  if(raw.shape==='rectangle'){
    if(raw.sides!==undefined||raw.aspect!==undefined&&(typeof raw.aspect!=='number'||!Number.isFinite(raw.aspect)||raw.aspect<.2||raw.aspect>5))return null;
  }else if(raw.shape==='regular'){
    if(raw.aspect!==undefined||raw.sides!==undefined&&(typeof raw.sides!=='number'||!Number.isInteger(raw.sides)||raw.sides<3||raw.sides>12))return null;
  }else if(raw.aspect!==undefined||raw.sides!==undefined)return null;
  return structuredClone(raw) as TessPaperSpec;
}
export type TileTwist={width:number;offset:number;tilt?:number;angleMode?:'twist';twistAngle?:number;centralTypes:('M'|'V')[];construction?:'split';baseVertex?:number;connection?:'M'|'V';ccw?:boolean};
export type CircularTwistParams={family:'circular-twist';polygon:XY[];angle:number;radius:number;circleDivisions:number;centralTypes:('M'|'V'|'U')[];stationaryFace:'auto'|number};
export type RigidQuadParams={family:'rigid-quad';bottomDirectionsDeg:number[];bottomFoldAnglesDeg:number[];leftDirectionsDeg:number[];leftFoldAnglesDeg:number[];minimumEdgeLength:number;minimumEdgeLengths?:[number,number,number,number][];baseFaces?:[number,number][];rectangular?:boolean;cornerAnglesDeg?:number[];samePtTolerance?:number|null};
type Rotation={angle:number;scale:number;dualTargets?:XY[]}&PrimalDualOptions;
export type TessParams=(DiscreteCurveCPParams|CircularTwistParams|RigidQuadParams|RadialPotParams|GorePaperParams|RectangularPotParams|TwistedPotParams|FlasherParams|ParaboloidalFlasherParams|CurvedCirclePolyhedralParams|LinkedFirstBandPolyhedralParams|JoinedTubeParams|ClosedTwistToppedTubeParams|PolygonTileParams|WovenParams|ExactSplitParams|BrocardParams|({family:'twist';sides:number;offsetX?:number;offsetY?:number;splitCount?:number;polygon?:XY[];mode?:'polygon'|'quad-split';pleatWidth?:number;splitVertex?:number;connection?:'M'|'V'}&Rotation)|({family:'periodic';tiling:TessTiling;rows:number;columns:number}&Rotation)|({family:'primal-dual';tiling:TessTiling;rings:number;motherParams?:TessParams;dualEdgeFlips?:[number,number][];visibleTopFace?:number;faceupFace?:number;reciprocalMethod?:'original-min-total-pleat'}&Rotation)|({family:'archimedean';tiling:string;rings:number;starAngle?:number;cairoAngle?:number;repeatX?:number;repeatY?:number;cairoOutput?:'tiling'|'twist'}&Rotation)|({family:'nonperiodic';kind:'voronoi'|'delaunay'|'penrose'|'goldberg';count:number;seed:number;depth:number;points?:XY[];boundary?:XY[];boundaryMode?:'square'|'hull';penroseVersion?:'legacy'|'origamica';borderTriangles?:boolean;goldbergVersion?:'legacy'|'origamica';goldbergOrder?:number;goldbergRings?:number;goldbergOffset?:number;goldbergOutput?:'twist'|'tiling'}&Rotation)|({family:'custom';vertices:XY[];faces:number[][];repeatX:number;repeatY:number;lattice?:[XY,XY];range1?:[number,number];range2?:[number,number];customOutput?:'twist'|'tiling'|'tile-twists';tileTwists?:TileTwist[];stationaryFace?:number;monolithicOptions?:TileMonolithicOptions;tileDecorations?:TileDecorations;tileSpecs?:TileSpec[];unitRegularCentered?:UnitRegularCenteredSpec;unitTriangle?:UnitTriangleSpec;unitCyclic?:UnitCyclicSpec;unitQuadrilateralSplit?:UnitQuadrilateralSplitSpec;archimedeanPatch?:ArchimedeanPatchSpec;twoColorableArchimedeanPatch?:TwoColorableArchimedeanSpec;twoUniformPatch?:TwoUniformPatchSpec}&Rotation)|({family:'ring';sides:number;rings:number;growth:number;radii?:number[];includeCenter?:boolean;ringMode?:'mesh'|'origamica';outerRadii?:number[];creaseRadii?:number[];offsetAngle?:number;outerProfiles?:number[][];creaseProfiles?:number[][];outerExpressions?:string[];creaseExpressions?:string[];outerVectors?:XY[][];creaseVectors?:XY[][];outerLinearMaps?:RingLinearMap[];creaseLinearMaps?:RingLinearMap[];outerFourierCurves?:RingFourierCurve[];creaseFourierCurves?:RingFourierCurve[];outerSignedPowers?:number[];creaseSignedPowers?:number[];outerVectorExpressions?:[string,string][];creaseVectorExpressions?:[string,string][];outerVectorTemplate?:[string,string];creaseVectorTemplate?:[string,string];vectorFunctionDefinitions?:string[]}&Rotation)|{family:'flagstone';tiling:TessTiling;rows:number;columns:number;width:number;aspect:number;motherParams?:TessParams;dualTargets?:XY[];shrinkage?:number;junctionAssignment?:'original'|'tuck'}|{family:'woven';rows:number;columns:number;width:number;weave:'plain'|'basket'|'twill';phase:number})&{pruneBoundary?:XY[];paper?:TessPaperSpec};
export const SPLIT_QUAD:XY[]=[[-1,-1],[1,-1],[.8,1],[-.8,.8]];
export const TESS_NAMES:Record<TessFamily,string>={'discrete-curve-cp':'原离散曲折 · 有限纸带',twist:'单元扭转','circular-twist':'圆形扭转','rigid-quad':'刚性四边网格','radial-pot':'旋转对称壶体','gore-paper':'原Gore瓣片展开','rectangular-pot':'矩形壶体','twisted-pot':'扭转壶体',flasher:'Flasher 旋转折叠','paraboloidal-flasher':'抛物面 Flasher','curved-circle-polyhedral':'圆弧跨面 · 多面体','linked-first-band-polyhedral':'关联同心圆首带 · 多面体','twist-joined-tube':'扭转连接管','double-joined-tube':'双连接管','closed-twist-topped-tube':'封顶扭转管',periodic:'周期拼接','primal-dual':'原始—对偶',archimedean:'混合平铺',nonperiodic:'非周期',custom:'自定义',ring:'环状镶嵌',flagstone:'铺石镶嵌',woven:'盒褶编织',brocard:'Brocard 扭转',split:'分裂扭转','woven-lines':'线组编织','polygon-tile':'精确多边形'};
export const PRUNABLE:TessFamily[]=['periodic','primal-dual','archimedean','nonperiodic','custom','ring'];
export const CAIRO=[['cairo','Cairo 五边形'],['double-cairo','Double Cairo 双周期']] as [string,string][];
export const ARCHIMEDEAN=['3.12.12','4.6.12','3.3.4.3.4','3.3.3.3.6','4.8.8','3.6.3.6','3.4.6.4','3.3.3.4.4'];
export const RESCH_CATALOG=['三尖星／三角形','三尖星／三角形 · 混合','三尖星／六边形','四尖星／正方形','六尖星／三角形'].map((name,i)=>[`resch-catalog-${i+1}`,`Resch ${i+1} · ${name}`] as [string,string]);
export const TWO_UNIFORM=[
  '3⁶ / 3⁴.6 · A','3⁶ / 3⁴.6 · B','3⁶ / 3³.4² · A','3⁶ / 3³.4² · B',
  '3⁶ / 3².4.12','3⁶ / 3².4.3.4','3⁶ / 3².6²','3⁴.6 / 3².6²',
  '3³.4² / 3².4.3.4 · A','3³.4² / 3².4.3.4 · B','3².4.3.4 / 3.4.6.4',
  '3³.4² / 3.4.6.4','3³.4² / 4⁴ · A','3³.4² / 4⁴ · B','3.4².6 / 3.4.6.4',
  '3².6² / 3.6.3.6','3.4.3.12 / 3.12²','3.4².6 / 3.6.3.6 · A','3.4².6 / 3.6.3.6 · B','3.4.6.4 / 4.6.12',
].map((name,i)=>[`two-uniform-${i+1}`,`双均匀 ${i+1} · ${name}`] as [string,string]);
export function defaultTileTwists(faces:number[][]):TileTwist[]{
  const seams=new Map<string,number[]>(),neighbors=faces.map(()=>new Set<number>());
  faces.forEach((face,i)=>face.forEach((a,j)=>{const b=face[(j+1)%face.length],key=[a,b].sort((x,y)=>x-y).join(',');seams.set(key,[...(seams.get(key)??[]),i]);}));
  for(const uses of seams.values())if(uses.length===2){neighbors[uses[0]].add(uses[1]);neighbors[uses[1]].add(uses[0]);}
  const parity=Array<number>(faces.length).fill(-1);
  for(let start=0;start<faces.length;start++)if(parity[start]<0){parity[start]=0;const queue=[start];for(let k=0;k<queue.length;k++)for(const other of neighbors[queue[k]])if(parity[other]<0){parity[other]=1-parity[queue[k]];queue.push(other);}}
  // Adjacent twists also need opposite central M/V signs.  Complementary
  // pleat angles alone close the geometry but give the four-tile default no
  // global layer-order solution.
  return faces.map((face,i)=>({width:.2,offset:0,tilt:parity[i]?110:70,centralTypes:face.map(()=> parity[i]?'V' as const:'M' as const)}));
}
/** The historical source key covers all named unit regular-polygon modes; custom twists drive construction. */
export function unitRegularCenteredParams(spec:UnitRegularCenteredSpec,paper?:TessPaperSpec):Extract<TessParams,{family:'custom'}>{
  const valid=readUnitRegularCenteredSpec(spec);
  if(!valid)throw Error('单位正多边形扭转参数无效。');
  const {vertices,faces}=unitRegularCenteredMesh(valid.sides,valid.arrangement);
  const twists:TileTwist[]=valid.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE
    ?valid.tiles.map(tile=>({width:valid.width,offset:tile.offset,tilt:90,
      centralTypes:[...tile.centralTypes]}))
    :faces.map((_,index)=>({width:valid.width,offset:0,
      ...(valid.tileType===UNIT_REGULAR_CENTERED_ALT_TILE_TYPE
        ?{angleMode:'twist' as const,twistAngle:valid.twistAngle}
        :{tilt:valid.pleatAngle}),
      centralTypes:valid.tileType===UNIT_REGULAR_CENTERED_ALT_TILE_TYPE&&
        unitRegularSidePairLayout(valid.arrangement)&&index===1
        ?valid.centralTypes.map(type=>type==='M'?'V' as const:'M' as const)
        :[...valid.centralTypes]}));
  const base=tessPreset('custom');
  return {...base,vertices,faces,repeatX:1,repeatY:1,
    customOutput:'tile-twists',tileTwists:twists,
    monolithicOptions:structuredClone(ORIGINAL_MONOLITHIC_OPTIONS),
    unitRegularCentered:valid,...(paper?{paper}:{}),
  };
}
/** A named triangle source uses the existing custom per-tile construction contract. */
export function unitTriangleParams(spec:UnitTriangleSpec,paper?:TessPaperSpec):Extract<TessParams,{family:'custom'}>{
  const valid=readUnitTriangleSpec(spec);
  if(!valid)throw Error('单位三角形扭转参数无效。');
  const {vertices,faces}=unitTriangleMesh(valid.angles,valid.arrangement);
  const twists:TileTwist[]=valid.tileType===UNIT_TRIANGLE_OFFSET_TYPE
    ?valid.tiles.map(tile=>({width:valid.width,offset:tile.offset,tilt:90,
      centralTypes:[...tile.centralTypes]}))
    :valid.tiles.map(tile=>({width:valid.width,offset:0,
      ...(valid.tileType===UNIT_TRIANGLE_ALT_TYPE
        ?{angleMode:'twist' as const,twistAngle:valid.twistAngle}
        :{tilt:valid.pleatAngle}),
      centralTypes:[...tile.centralTypes]}));
  const base=tessPreset('custom');
  return {...base,vertices,faces,repeatX:1,repeatY:1,
    customOutput:'tile-twists',tileTwists:twists,
    monolithicOptions:structuredClone(ORIGINAL_MONOLITHIC_OPTIONS),
    unitTriangle:valid,...(paper?{paper}:{}),
  };
}
/** A named four-sided cyclic unit reproduces In[3042]/In[3045] within the checked numerical subdomain. */
export function unitCyclicSourceParams(spec:UnitCyclicSpec,paper?:TessPaperSpec):Extract<TessParams,{family:'custom'}>{
  const valid=readUnitCyclicSpec(spec);
  if(!valid)throw Error('单位圆内接多边形扭转参数无效。');
  const generated=unitCyclicParams(valid,paper);
  const base=tessPreset('custom');
  return {...base,...generated};
}
/** Named In[3066]/In[3069] quadrilateral centered split source. */
export function unitQuadrilateralSplitSourceParams(spec:UnitQuadrilateralSplitSpec,paper?:TessPaperSpec):Extract<TessParams,{family:'custom'}>{
  const valid=readUnitQuadrilateralSplitSpec(spec);
  if(!valid)throw Error('单位四边形居中分裂参数无效。');
  const generated=unitQuadrilateralSplitParams(valid,paper);
  return {...tessPreset('custom'),...generated};
}


function originalMonolithic(options:TileMonolithicOptions|undefined):boolean{
  return !!options&&options.mergedEdges===ORIGINAL_MONOLITHIC_OPTIONS.mergedEdges&&
    options.samePtTolerance===ORIGINAL_MONOLITHIC_OPTIONS.samePtTolerance&&
    options.collinearCleanup===ORIGINAL_MONOLITHIC_OPTIONS.collinearCleanup&&
    options.collinearTolerance===ORIGINAL_MONOLITHIC_OPTIONS.collinearTolerance;
}
/** Preserve edited geometry while changing the transform; rebuild targets only when the mother mesh changes. */
function sameIndexedCustomMesh(first:Extract<TessParams,{family:'custom'}>,second:Extract<TessParams,{family:'custom'}>):boolean{
  return first.vertices.length===second.vertices.length&&first.faces.length===second.faces.length&&
    first.vertices.every((point,i)=>point.length===2&&second.vertices[i]?.length===2&&point.every((value,j)=>
      Number.isFinite(value)&&Number.isFinite(second.vertices[i][j])&&Math.abs(value-second.vertices[i][j])<=1e-8))&&
    first.faces.every((face,i)=>face.length===second.faces[i]?.length&&face.every((vertex,j)=>vertex===second.faces[i][j]));
}
export function changeTessParams(params:TessParams,patch:Record<string,unknown>):TessParams{
  const next={...params,...patch} as TessParams;
  const sameCustomMesh=params.family==='custom'&&next.family==='custom'&&sameIndexedCustomMesh(params,next);
  if(next.family==='custom'&&params.family==='custom'){
    const sourceChanged=
      ('vertices' in patch||'faces' in patch)&&!sameCustomMesh||
      ['repeatX','repeatY','lattice','range1','range2','customOutput','tileTwists','pruneBoundary'].some(key=>key in patch)||
      'monolithicOptions' in patch&&(
        next.monolithicOptions?.mergedEdges!==params.monolithicOptions?.mergedEdges||
        next.monolithicOptions?.samePtTolerance!==params.monolithicOptions?.samePtTolerance||
        next.monolithicOptions?.collinearCleanup!==params.monolithicOptions?.collinearCleanup||
        next.monolithicOptions?.collinearTolerance!==params.monolithicOptions?.collinearTolerance);
    if(sourceChanged){
      if(!('unitRegularCentered' in patch))delete next.unitRegularCentered;
      if(!('unitTriangle' in patch))delete next.unitTriangle;
      if(!('unitCyclic' in patch))delete next.unitCyclic;
      if(!('unitQuadrilateralSplit' in patch))delete next.unitQuadrilateralSplit;
      if(!('archimedeanPatch' in patch))delete next.archimedeanPatch;
      if(!('twoColorableArchimedeanPatch' in patch))delete next.twoColorableArchimedeanPatch;
      if(!('twoUniformPatch' in patch))delete next.twoUniformPatch;
    }
  }
  if(next.family==='custom'&&params.family==='custom'&&('vertices' in patch||'faces' in patch)&&!('tileDecorations' in patch)
      &&!sameCustomMesh)delete next.tileDecorations;
  if(next.family==='custom'&&params.family==='custom'&&('vertices' in patch||'faces' in patch)&&!('tileSpecs' in patch)
      &&!sameCustomMesh)delete next.tileSpecs;
  if(next.family==='custom'&&'tileSpecs' in patch&&!patch.tileSpecs)delete next.tileSpecs;
  if(next.family==='custom'&&'tileSpecs' in patch&&!('twoUniformPatch' in patch))delete next.twoUniformPatch;
  if(next.family==='custom'&&next.customOutput==='tile-twists'&&('faces' in patch||'vertices' in patch)&&!('tileTwists' in patch)&&
    (params.family!=='custom'||params.customOutput!=='tile-twists'||!sameCustomMesh))next.tileTwists=defaultTileTwists(next.faces);
  if(next.family==='custom'&&next.customOutput!=='tile-twists'){delete next.tileTwists;delete next.stationaryFace;delete next.monolithicOptions;}
  if(next.family==='custom'&&'lattice' in patch&&!next.lattice){delete next.range1;delete next.range2;}
  if(next.family==='custom'&&params.family==='custom'&&'faces' in patch&&!('stationaryFace' in patch)&&JSON.stringify(next.faces)!==JSON.stringify(params.faces))delete next.stationaryFace;
  if('dualTargets' in next&&!('dualTargets' in patch)&&Object.keys(patch).some(key=>key!=='tileDecorations'&&key!=='tileSpecs'&&key!=='paper'&&!TRANSFORM_KEYS.includes(key)&&!(params.family==='flagstone'&&['width','shrinkage','junctionAssignment'].includes(key))))delete next.dualTargets;
  if(next.family==='nonperiodic'&&('count' in patch||'seed' in patch)&&!('points' in patch))delete next.points;
  if(next.family==='nonperiodic'&&'kind' in patch){
    delete next.boundary;delete next.boundaryMode;delete next.penroseVersion;delete next.borderTriangles;
    delete next.goldbergVersion;delete next.goldbergOrder;delete next.goldbergRings;delete next.goldbergOffset;delete next.goldbergOutput;
    if(!('points' in patch))delete next.points;
    if(next.kind==='delaunay')next.boundaryMode='hull';
    if(next.kind==='penrose'){next.penroseVersion='origamica';next.borderTriangles=true;next.depth=1;}
    if(next.kind==='goldberg'){next.goldbergVersion='origamica';next.goldbergOrder=5;next.goldbergRings=2;next.goldbergOffset=0;next.goldbergOutput='twist';}
  }
  if(next.family==='twist'&&'sides' in patch&&!('polygon' in patch))delete next.polygon;
  if(next.family==='archimedean'&&'tiling' in patch){if(next.tiling.startsWith('resch-'))next.starAngle=40;else delete next.starAngle;}
  if('angle' in next&&'scale' in next&&next.parameterization==='gamma-alpha')Object.assign(next,shrinkAndTwist(next.gamma??1,next.pleatAngle??30,next.twistDirection??'ccw'));
  if(next.family==='archimedean'&&'tiling' in patch){
    if(['cairo','double-cairo'].includes(next.tiling)){
      if(!('cairoAngle' in patch))next.cairoAngle=90;
      if(!('repeatX' in patch))next.repeatX=2;
      if(!('repeatY' in patch))next.repeatY=2;
      if(!('cairoOutput' in patch))next.cairoOutput='tiling';
    }
    else{delete next.cairoAngle;delete next.repeatX;delete next.repeatY;delete next.cairoOutput;}
  }
  return next;
}

/** Validate editable coordinates before they can replace the working geometry. */
export function tessGeometryError(points:XY[],min:number,max:number,faces:number[][]=[],strict=false):string{
  for(let i=0;i<points.length;i++){
    if(points[i].some(n=>!Number.isFinite(n)||n<min||n>max))return `点 ${i+1} 的坐标必须在 ${min} 至 ${max} 之间。`;
    for(let j=0;j<i;j++)if(Math.hypot(points[i][0]-points[j][0],points[i][1]-points[j][1])<1e-6)return `点 ${j+1} 与点 ${i+1} 重合或过近，请移动后再保存。`;
  }
  for(let i=0;i<faces.length;i++){
    const ps=faces[i].map(index=>points[index]);
    if(ps.some(p=>!p)||ps.length<3)return '形状包含无效的面顶点。';
    // All vertices must lie on the same side of every boundary edge. This also rejects crossed star polygons.
    const crosses=ps.flatMap((a,j)=>{const b=ps[(j+1)%ps.length];return ps.filter((_,k)=>k!==j&&k!==(j+1)%ps.length).map(c=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));});
    const valid=strict?(crosses.every(x=>x>1e-8)||crosses.every(x=>x< -1e-8)):((crosses.every(x=>x>=-1e-9)||crosses.every(x=>x<=1e-9))&&crosses.some(x=>Math.abs(x)>=1e-9));
    if(!valid)return strict?'轮廓必须为严格凸多边形，请调整凹入、共线或交叉的顶点。':`第 ${i+1} 个面必须为非退化的凸多边形，请调整顶点。`;
  }
  return '';
}
export function tessPreset<F extends TessFamily>(family:F):Extract<TessParams,{family:F}>;
export function tessPreset(family:TessFamily):TessParams{
  if(family==='polygon-tile')return polygonTilePreset();
  if(family==='woven-lines')return wovenPreset();
  if(family==='split')return splitPreset();
  if(family==='brocard')return brocardPreset();
  if(family==='twist')return {family,sides:4,angle:36,scale:.5,offsetX:0,offsetY:0,splitCount:1};
  if(family==='circular-twist')return {family,polygon:[[0,0],[1,0],[.5,.4]],angle:30,radius:2,circleDivisions:16,centralTypes:['M','M','V'],stationaryFace:'auto'};
  if(family==='radial-pot')return radialPotPreset();
  if(family==='discrete-curve-cp')return discreteCurveCPPreset();
  if(family==='gore-paper')return gorePaperPreset();
  if(family==='rectangular-pot')return rectangularPotPreset();
  if(family==='twisted-pot')return twistedPotPreset();
  if(family==='flasher')return flasherPreset();
  if(family==='paraboloidal-flasher')return paraboloidalFlasherPreset();
  if(family==='curved-circle-polyhedral')return curvedCirclePolyhedralPreset();
  if(family==='linked-first-band-polyhedral')return linkedFirstBandPolyhedralPreset();
  if(family==='twist-joined-tube'||family==='double-joined-tube')return joinedTubePreset(family);
  if(family==='closed-twist-topped-tube')return closedTubePreset();
  if(family==='rigid-quad'){
    const small=2*Math.atan(1/Math.sqrt(2))*180/Math.PI,large=2*Math.atan(Math.sqrt(2))*180/Math.PI;
    return {family,bottomDirectionsDeg:[90,90],bottomFoldAnglesDeg:[-small,small],leftDirectionsDeg:[30,30],leftFoldAnglesDeg:[large,-large],minimumEdgeLength:1};
  }
  if(family==='periodic')return {family,tiling:'square',rows:3,columns:3,angle:36,scale:.3,paper:defaultTessPaper()};
  if(family==='archimedean')return {family,tiling:'3.6.3.6',rings:1,angle:45,scale:.3,paper:defaultTessPaper()};
  if(family==='nonperiodic')return {family,kind:'voronoi',count:9,seed:1,depth:2,angle:36,scale:.3};
  if(family==='custom')return {family,vertices:[[0,0],[.5,0],[1,0],[0,.5],[.5,.5],[1,.5],[0,1],[.5,1],[1,1]],faces:[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]],repeatX:1,repeatY:1,angle:36,scale:.3};
  if(family==='ring')return {family,sides:8,rings:2,growth:1.8,angle:36,scale:.3};
  if(family==='flagstone')return {family,tiling:'square',rows:3,columns:3,width:.25,aspect:1,junctionAssignment:'original',paper:defaultTessPaper()};
  if(family==='woven')return {family,rows:3,columns:3,width:.25,weave:'plain',phase:0};
  return {family,tiling:'square',rings:1,angle:36,scale:.5,paper:defaultTessPaper()};
}
export type TessGraph={vertices_coords:XY[];edges_vertices:[number,number][];faces_vertices:number[][];faces_holes?:number[][][];edges_assignment:string[];zhezhi_custom_face_index?:number[];zhezhi_custom_polygons?:XY[][]};
export function tessConstructionKey(params:TessParams):string{
  if(params.family!=='custom'||!params.tileDecorations&&!params.tileSpecs)return JSON.stringify(params);
  const {tileDecorations:_display,tileSpecs:_source,...construction}=params;
  return JSON.stringify(construction);
}
export type TessLffCheck={status:'passed'|'failed'|'incomplete'|'not_applicable';reason?:string;interiorVertices:number;checkedVertices:number;graphVertices:XY[];graphEdges:[number,number][];edgeTypes:number[];constraintVertices:number[];assignmentViolations:number[];unassignedConstraints:number[]};
export type TessResponse={preview?:{kind:'shrink-rotate';vertices:[number,number,number,number][]}|null;fold:unknown;mother?:TessGraph|null;dual?:TessGraph|null;stats:{vertices:number;edges:number;faces:number;tiles:number;checks:{geometry:{status:string};local:{status:string;interiorVertices?:number};lff?:TessLffCheck}};warnings:string[];source:Record<string,unknown>};
export type TessResult=TessResponse&{doc:Doc;motherDoc?:Doc;dualDoc?:Doc};
/** Original internal B edges require a separate cut topology, not the single-sheet solver. */
export function hasWovenInternalBoundary(result:TessResult):boolean{
  const topology=result.source.wovenCutTopology;
  const recipe=(result.doc?.metadata?.tessellation as {parameters?:{family?:string;mode?:string}}|undefined)?.parameters;
  const mother=recipe?.family==='woven-lines'&&recipe.mode==='graph'?readWovenGraph(result.source.graph):null;
  return Object.hasOwn(result.source,'wovenMotherHoles')||Object.hasOwn(result.source,'wovenIndependentMother')||!!mother&&(wovenGraphComponents(mother).length>1||!!mother.holeFaces?.length)||hasWovenInternalB(result.fold)||!!topology&&typeof topology==='object'&&!Array.isArray(topology)&&
    (topology as Record<string,unknown>).standardSingleSheetFold===false;
}
export function canAdoptTess(result:TessResult|null,busy:boolean,signature:string,params:TessParams){
  if(!result||busy||signature!==tessConstructionKey(params)||result.stats.checks.geometry.status!=='passed')return false;
  if(params.family==='flasher'&&(!flasherSourceParametersMatch(result,params)||flasherSourceFaceVertexBudget(result)===null||!generatedDocumentMatches(result,params)))return false;
  if(params.family==='woven-lines'&&params.mode==='random'&&(params.randomVersion==='original-courteous'||params.randomVersion==='original-courteous-graph')&&!readWovenCourteousSource(result.source,params,result.mother))return false;
  if(params.family==='primal-dual'&&params.reciprocalMethod===MIN_TOTAL_METHOD&&!minTotalPleatResultMatches(result,params))return false;
  if(params.family==='ring'&&params.ringMode==='origamica'&&!ringLogSourceMatches(result.source,params as unknown as Record<string,unknown>))return false;
  if(params.family==='discrete-curve-cp')return discreteCurveCPLocalAssignmentsValid(params)&&discreteCurveCPSourceValid(result,params)&&result.stats.checks.local.status==='passed'&&result.stats.checks.lff?.status==='passed';
  if(params.family==='gore-paper')return gorePaperSourceValid(result.source,result.fold,params)&&spatialMeshScene(result)!==null&&(params.petals!=='multiple'||multipleGoreMaterialMatches(result,params));
  if(hasWovenInternalBoundary(result)||params.family==='woven-lines'&&params.mode==='graph'&&wovenGraphComponents(params.graph).length>1)return inspectWovenCutTopology(result,params).ok;
  if(typeof result.source.spatialKind==='string')return spatialMeshScene(result)!==null;
  return result.source.output==='tiling'||result.stats.checks.local.status==='passed'||
    result.stats.checks.local.status==='not_applicable'&&result.stats.checks.local.interiorVertices===0;
}
/** Shared by the worker trigger, candidate readout and final adoption gate. */
export function needsTessellationLayerCheck(params:TessParams,tilingOnly=false):boolean{
  return params.family==='discrete-curve-cp'||params.family==='ring'&&params.ringMode==='origamica'&&inspectRingBuiltinLogInput(params as unknown as Record<string,unknown>)===true||params.family==='woven'||params.family==='woven-lines'||params.family==='custom'&&params.customOutput==='tile-twists'||params.family==='primal-dual'&&
    (!!params.motherParams||!!params.dualEdgeFlips?.length||!!params.visibleTopFace||!!params.faceupFace||params.reciprocalMethod===MIN_TOTAL_METHOD)||
    params.family==='nonperiodic'&&params.kind==='goldberg'&&params.goldbergVersion==='origamica'&&params.goldbergOutput!=='tiling'||
    !!params.paper&&!tilingOnly;
}
/** A tile patch may pass every local check yet have no global layer order. */
export function canAdoptTessWithTileLayers(result:TessResult|null,busy:boolean,signature:string,params:TessParams,layerStatus?:string){
  return canAdoptTess(result,busy,signature,params)&&
    (!needsTessellationLayerCheck(params,result?.source.output==='tiling')||layerStatus==='solved');
}
function pointBounds(points:readonly XY[]){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const point of points){minX=Math.min(minX,point[0]);minY=Math.min(minY,point[1]);maxX=Math.max(maxX,point[0]);maxY=Math.max(maxY,point[1]);}
  return {minX,minY,width:maxX-minX,height:maxY-minY};
}
export function tessDocument(fold:unknown,name:string):Doc{
  // Generated small units are valid in their own coordinate frame. Normalize
  // before the file importer applies its world-unit segment tolerance.
  if(fold&&typeof fold==='object'&&!Array.isArray(fold)){
    const graph=fold as Record<string,unknown>,coords=graph.vertices_coords;
    if(Array.isArray(coords)&&coords.length&&
      coords.every(p=>Array.isArray(p)&&p.length===2&&p.every(c=>typeof c==='number'&&Number.isFinite(c)))){
      const ps=coords as XY[],min=[Infinity,Infinity],max=[-Infinity,-Infinity];
      for(const p of ps)for(const k of [0,1]){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
      const span=Math.max(max[0]-min[0],max[1]-min[1]);
      if(span>0&&span<1e-3)fold={...graph,vertices_coords:ps.map(p=>[(p[0]-min[0])*200/span,(p[1]-min[1])*200/span])};
    }
  }
  const raw=importDocument(JSON.stringify(fold),'fold',name).doc;
  const points=raw.segments.flatMap(s=>[s.a,s.b]);
  if(!points.length)throw new Error('镶嵌结果没有折痕。');
  const {minX,minY,width,height}=pointBounds(points);
  const scale=200/Math.max(width,height);
  const doc:Doc={name,paper:{width:width*scale,height:height*scale},segments:raw.segments.map(s=>({...s,a:[(s.a[0]-minX)*scale,(s.a[1]-minY)*scale],b:[(s.b[0]-minX)*scale,(s.b[1]-minY)*scale]}))};
  validateDoc(doc);return doc;
}
export function prepareTessResult(response:TessResponse,params:TessParams):TessResult{
  const name=params.family==='twist'?(params.mode==='quad-split'?'四边形分裂扭转':`${params.sides} 边形${(params.splitCount??1)>1?'镜像拼接':'偏置'}扭转`):TESS_NAMES[params.family];
  const doc=params.family==='gore-paper'&&params.petals==='multiple'?goreMultipleMaterialDocument(response,params):tessDocument(response.fold,name);
  if(response.source.output==='tiling')doc.segments=doc.segments.map(s=>({...s,assignment:s.assignment==='B'?'B':'A',angle:null}));
  // Interpolation recipes contain a second full graph for live dragging. They
  // belong to this candidate only; saved projects regenerate them from params.
  const savedSource={...response.source};
  delete savedSource.paperClipPreview;
  delete savedSource.paperPreview;
  doc.metadata={...doc.metadata,tessellation:{parameters:structuredClone(params),source:savedSource,stats:response.stats,warnings:response.warnings},generatedAt:new Date().toISOString()};
  const motherDoc=response.mother?tessDocument(response.mother,'母结构参考'):undefined;
  if(motherDoc)motherDoc.segments=motherDoc.segments.map(s=>({...s,assignment:s.assignment==='B'?'B':'A',angle:null}));
  // Display the dual in the mother's coordinate frame, not independently scaled.
  let dualDoc:Doc|undefined;
  if(response.dual&&response.mother&&motherDoc){
    const {minX,minY,width,height}=pointBounds(response.mother.vertices_coords);
    const size=Math.max(width,height),scale=200/size;
    dualDoc={...structuredClone(motherDoc),name:'原始—对偶参考',segments:[...motherDoc.segments.map(s=>({...s,assignment:'A' as const,angle:null,color:'#202124'})),...response.dual.edges_vertices.map(([a,b],i)=>({id:`dual-${i}`,assignment:'A' as const,angle:null,color:'#009eae',a:[(response.dual!.vertices_coords[a][0]-minX)*scale,(response.dual!.vertices_coords[a][1]-minY)*scale] as XY,b:[(response.dual!.vertices_coords[b][0]-minX)*scale,(response.dual!.vertices_coords[b][1]-minY)*scale] as XY}))]};
  }
  return {...response,doc,motherDoc,dualDoc};
}

/** Read a saved parameter record without letting malformed project metadata crash the UI. */
export function readTessParams(value:unknown):TessParams|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>,family=raw.family??'primal-dual';
  if(typeof family!=='string'||!Object.hasOwn(TESS_NAMES,family))return null;
  if(Object.hasOwn(raw,'reciprocalMethod')&&!minTotalPleatInputAllowed(raw))return null;
  // Recognized weaving inputs must never be discarded under another family
  // tag. Shared boundary/width/seed/stationaryFace fields retain their uses.
  // SamePtTolerance also belongs to the original rigid-quad reader.
  if(family!=='woven-lines'&&family!=='rigid-quad'&&Object.hasOwn(raw,'samePtTolerance'))return null;
  if(family!=='woven-lines'&&(['lines','graph','graphSource','parity','minPleat','minBorderPleat','borderInset','periodicity','periodicityEnabled','segmentInsets','fullEdgeInsets','minDistance','maxTries','randomVersion','intersectionTolerance','order'].some(key=>Object.hasOwn(raw,key))||
    typeof raw.mode==='string'&&['lines','chord','random','graph'].includes(raw.mode)))return null;
  if(family!=='woven'&&['weave','phase'].some(key=>Object.hasOwn(raw,key)))return null;
  if(raw.vectorFunctionDefinitions!==undefined&&(family!=='ring'||raw.ringMode!=='origamica'))return null;
  if(family==='radial-pot')return readRadialPotParams(raw);
  if(family==='discrete-curve-cp')return readDiscreteCurveCPParams(raw);
  if(family==='gore-paper')return readGorePaperParams(raw);
  if(family==='rectangular-pot')return readRectangularPotParams(raw);
  if(family==='twisted-pot')return readTwistedPotParams(raw);
  if(family==='flasher')return readFlasherParams(raw);
  if(family==='paraboloidal-flasher')return readParaboloidalFlasherParams(raw);
  if(family==='curved-circle-polyhedral')return readCurvedCirclePolyhedralParams(raw);
  if(family==='linked-first-band-polyhedral')return readLinkedFirstBandPolyhedralParams(raw);
  if(family==='twist-joined-tube'||family==='double-joined-tube')return readJoinedTubeParams(raw);
  if(family==='closed-twist-topped-tube')return readClosedTubeParams(raw);
  if(family==='circular-twist'){
    if(Object.keys(raw).some(key=>!['family','polygon','angle','radius','circleDivisions','centralTypes','stationaryFace'].includes(key)))return null;
    const polygon=raw.polygon,angle=raw.angle??30,radius=raw.radius??2,divisions=raw.circleDivisions??64,types=raw.centralTypes,stationaryFace=raw.stationaryFace??'auto';
    if(!Array.isArray(polygon)||polygon.length<3||polygon.length>64||polygon.some(point=>!Array.isArray(point)||point.length!==2||point.some(value=>typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1000)))return null;
    const vertices=polygon as XY[],center:[number,number]=[vertices.reduce((sum,p)=>sum+p[0],0)/vertices.length,vertices.reduce((sum,p)=>sum+p[1],0)/vertices.length];
    const edges=vertices.map((point,i)=>{const next=vertices[(i+1)%vertices.length];return [next[0]-point[0],next[1]-point[1]] as XY;});
    const turn=edges.map((edge,i)=>edge[0]*edges[(i+1)%edges.length][1]-edge[1]*edges[(i+1)%edges.length][0]);
    if(typeof angle!=='number'||!Number.isFinite(angle)||Math.abs(angle)<1||Math.abs(angle)>179||typeof radius!=='number'||!Number.isFinite(radius)||radius<=0||radius>1000||!Number.isInteger(divisions)||(divisions as number)<8||(divisions as number)>360||
      turn.some(value=>value*angle<=1e-9)||vertices.some(point=>Math.hypot(point[0]-center[0],point[1]-center[1])>=radius-1e-8))return null;
    const assignments=types??vertices.map(()=> 'U');
    if(!Array.isArray(assignments)||assignments.length!==vertices.length||assignments.some(type=>!['M','V','U'].includes(type)))return null;
    if(stationaryFace!=='auto'&&(!Number.isInteger(stationaryFace)||(stationaryFace as number)<1||(stationaryFace as number)>2*vertices.length+1))return null;
    return {family:'circular-twist',polygon:structuredClone(vertices),angle,radius,circleDivisions:divisions as number,centralTypes:[...assignments] as ('M'|'V'|'U')[],stationaryFace:stationaryFace as 'auto'|number};
  }
  if(family==='rigid-quad'){
    if(Object.keys(raw).some(key=>!['family','bottomDirectionsDeg','bottomFoldAnglesDeg','leftDirectionsDeg','leftFoldAnglesDeg','minimumEdgeLength','minimumEdgeLengths','baseFaces','rectangular','cornerAnglesDeg','samePtTolerance'].includes(key)))return null;
    const bottomDirectionsDeg=raw.bottomDirectionsDeg,bottomFoldAnglesDeg=raw.bottomFoldAnglesDeg,leftDirectionsDeg=raw.leftDirectionsDeg,leftFoldAnglesDeg=raw.leftFoldAnglesDeg,minimumEdgeLength=raw.minimumEdgeLength??1;
    const validAngles=(value:unknown):value is number[]=>Array.isArray(value)&&value.length>=1&&value.length<=12&&value.every(angle=>typeof angle==='number'&&Number.isFinite(angle));
    if(!validAngles(bottomDirectionsDeg)||!validAngles(bottomFoldAnglesDeg)||!validAngles(leftDirectionsDeg)||!validAngles(leftFoldAnglesDeg)||bottomDirectionsDeg.length!==bottomFoldAnglesDeg.length||leftDirectionsDeg.length!==leftFoldAnglesDeg.length||
      bottomFoldAnglesDeg.some(angle=>angle===0||Math.abs(angle)>=180)||leftFoldAnglesDeg.some(angle=>angle===0||Math.abs(angle)>=180)||bottomFoldAnglesDeg.some(bottom=>leftFoldAnglesDeg.some(left=>Math.abs(Math.abs(bottom)-Math.abs(left))<1e-9))||typeof minimumEdgeLength!=='number'||!Number.isFinite(minimumEdgeLength)||minimumEdgeLength<1e-5||minimumEdgeLength>1000)return null;
    const overrides=raw.minimumEdgeLengths;
    if(overrides!==undefined&&(!Array.isArray(overrides)||overrides.length>256||overrides.some(row=>!Array.isArray(row)||row.length!==4||!Number.isInteger(row[0])||![0,1].includes(row[0])||!Number.isInteger(row[1])||!Number.isInteger(row[2])||typeof row[3]!=='number'||!Number.isFinite(row[3])||row[3]<0||row[3]>1000||row[1]<0||row[2]<0||
      (row[0]===0?(row[1]>=bottomDirectionsDeg.length+1||row[2]>leftDirectionsDeg.length+1):(row[1]>bottomDirectionsDeg.length+1||row[2]>=leftDirectionsDeg.length+1)))||new Set(overrides.map(row=>`${row[0]},${row[1]},${row[2]}`)).size!==overrides.length))return null;
    const baseFaces=raw.baseFaces;
    if(baseFaces!==undefined&&(!Array.isArray(baseFaces)||baseFaces.length>169||baseFaces.some(row=>!Array.isArray(row)||row.length!==2||!Number.isInteger(row[0])||!Number.isInteger(row[1])||row[0]<0||row[1]<0||row[0]>=bottomDirectionsDeg.length+1||row[1]>=leftDirectionsDeg.length+1)||new Set(baseFaces.map(row=>`${row[0]},${row[1]}`)).size!==baseFaces.length))return null;
    const rectangular=raw.rectangular??true;
    if(typeof rectangular!=='boolean')return null;
    const rawCorners=raw.cornerAnglesDeg;
    const cornerAngles=typeof rawCorners==='number'?[rawCorners,rawCorners,rawCorners,rawCorners]:rawCorners;
    if(cornerAngles!==undefined&&(!Array.isArray(cornerAngles)||cornerAngles.length!==4||cornerAngles.some(angle=>typeof angle!=='number'||!Number.isFinite(angle)||angle<=0||angle>180)))return null;
    const tolerance=raw.samePtTolerance;
    if(tolerance!==undefined&&tolerance!==null&&(typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<0))return null;
    return {family:'rigid-quad',bottomDirectionsDeg:[...bottomDirectionsDeg],bottomFoldAnglesDeg:[...bottomFoldAnglesDeg],leftDirectionsDeg:[...leftDirectionsDeg],leftFoldAnglesDeg:[...leftFoldAnglesDeg],minimumEdgeLength,...(overrides===undefined?{}:{minimumEdgeLengths:structuredClone(overrides) as [number,number,number,number][]}),...(baseFaces===undefined?{}:{baseFaces:structuredClone(baseFaces) as [number,number][]}),...(raw.rectangular===undefined?{}:{rectangular}),...(cornerAngles===undefined?{}:{cornerAnglesDeg:[...cornerAngles]}),...(tolerance===undefined?{}:{samePtTolerance:tolerance})};
  }
  if(raw.pruneBoundary!==undefined&&!PRUNABLE.includes(family as TessFamily))return null;
  const paper=raw.paper===undefined?undefined:readTessPaper(raw.paper);
  if(raw.paper!==undefined&&!paper)return null;
  const {paper:_ignored,...withoutPaper}=raw;
  const attachPaper=<T extends object>(params:T|null)=>params?(paper?{...params,paper}:params) as TessParams:null;
  if(family==='polygon-tile')return attachPaper(readPolygonTileParams(withoutPaper));
  if(family==='split')return attachPaper(readSplitParams(withoutPaper));
  if(family==='woven-lines')return attachPaper(readWovenParams(withoutPaper));
  if(family==='brocard')return attachPaper(readBrocardParams(withoutPaper));
  const base=tessPreset(family as TessFamily) as unknown as Record<string,unknown>;
  // A wrong family tag must not discard line-group inputs and silently load a grid.
  if(family==='woven'&&Object.keys(withoutPaper).some(key=>!Object.hasOwn(base,key)))return null;
  if(paper===undefined)delete base.paper;
  if(family==='archimedean'&&['resch-3','resch-4','resch-6',...RESCH_CATALOG.map(([id])=>id)].includes(String(raw.tiling)))base.starAngle=40;
  if(family==='twist'&&raw.mode!==undefined){
    if(raw.mode!=='polygon'&&raw.mode!=='quad-split')return null;
    base.mode=raw.mode;
    if(raw.mode==='quad-split')Object.assign(base,{pleatWidth:.25,splitVertex:0,connection:'M'});
  }
  for(const [key,defaultValue] of Object.entries(base)){
    const candidate=raw[key];if(candidate===undefined)continue;
    if(typeof candidate!==typeof defaultValue)return null;
    if(typeof candidate==='number'&&(!Number.isFinite(candidate)||Math.abs(candidate)>1e6))return null;
    if(Array.isArray(defaultValue)&&(!Array.isArray(candidate)||candidate.length>256||candidate.some(row=>!Array.isArray(row)||row.length>24||row.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>10000))))return null;
    base[key]=structuredClone(candidate);
  }
  if(paper)base.paper=paper;
  if(raw.reciprocalMethod===MIN_TOTAL_METHOD)base.reciprocalMethod=MIN_TOTAL_METHOD;
  for(const key of ['points','dualTargets','polygon'])if(raw[key]!==undefined){
    const ps=raw[key];if(!Array.isArray(ps)||ps.length<(key==='points'?3:key==='polygon'?3:2)||ps.length>(key==='points'?96:key==='polygon'?12:256)||ps.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>100)))return null;
    base[key]=structuredClone(ps);
  }
  if(raw.pruneBoundary!==undefined){
    const p=raw.pruneBoundary;if(!Array.isArray(p)||p.length<3||p.length>32||p.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>typeof v!=='number')))return null;
    if(tessGeometryError(p,-10,10,[p.map((_,i)=>i)]))return null;base.pruneBoundary=structuredClone(p);
  }
  if(family==='nonperiodic'){
    if(raw.goldbergVersion!==undefined){if(base.kind!=='goldberg'||!['legacy','origamica'].includes(String(raw.goldbergVersion)))return null;base.goldbergVersion=raw.goldbergVersion;}
    if(base.goldbergVersion==='origamica'){
      const m=raw.goldbergOrder??5,n=raw.goldbergRings??2,o=raw.goldbergOffset??0,output=raw.goldbergOutput??'twist';
      if(![m,n,o].every(Number.isInteger)||!(m as number>=3&&m as number<=16)||!(n as number>=1&&n as number<=9)||(m as number)*(n as number)**2>256||!(o as number>=0&&o as number<2*(n as number))||((m as number)%2===1&&o!==0)||!['twist','tiling'].includes(String(output))||((m as number)<5&&output==='twist'))return null;
      Object.assign(base,{goldbergOrder:m,goldbergRings:n,goldbergOffset:o,goldbergOutput:output});
    }else if(['goldbergOrder','goldbergRings','goldbergOffset','goldbergOutput'].some(key=>raw[key]!==undefined))return null;
    if(raw.penroseVersion!==undefined){if(base.kind!=='penrose'||!['legacy','origamica'].includes(String(raw.penroseVersion)))return null;base.penroseVersion=raw.penroseVersion;}
    if(raw.borderTriangles!==undefined){if(base.kind!=='penrose'||typeof raw.borderTriangles!=='boolean')return null;base.borderTriangles=raw.borderTriangles;}
    if(raw.boundaryMode!==undefined){if(base.kind!=='delaunay'||!['square','hull'].includes(String(raw.boundaryMode)))return null;base.boundaryMode=raw.boundaryMode;}
    if(raw.boundary!==undefined){
      const p=raw.boundary;if(base.kind!=='voronoi'||!Array.isArray(p)||p.length<3||p.length>32||p.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>typeof v!=='number')))return null;
      if(tessGeometryError(p,-10,10,[p.map((_,i)=>i)]))return null;base.boundary=structuredClone(p);
    }
    if(base.points){
      const ps=base.points as XY[];if(ps.some(p=>p.some(x=>Math.abs(x)>10)))return null;
      if(base.kind!=='voronoi'&&base.kind!=='delaunay')return null;
      if(base.kind==='voronoi'){
        const bs=(base.boundary??[[0,0],[1,0],[1,1],[0,1]]) as XY[],area=bs.reduce((s,a,i)=>{const b=bs[(i+1)%bs.length];return s+a[0]*b[1]-a[1]*b[0];},0);
        if(bs.some((a,i)=>{const b=bs[(i+1)%bs.length];return ps.some(p=>Math.sign(area)*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))< -1e-8);}))return null;
      }
    }
  }
  if(raw.shrinkage!==undefined){if(family!=='flagstone'||typeof raw.shrinkage!=='number'||!Number.isFinite(raw.shrinkage)||raw.shrinkage<.05||raw.shrinkage>.99)return null;base.shrinkage=raw.shrinkage;}
  if(raw.junctionAssignment!==undefined){if(family!=='flagstone'||!['original','tuck'].includes(String(raw.junctionAssignment)))return null;base.junctionAssignment=raw.junctionAssignment;}
  else if(family==='flagstone')base.junctionAssignment='tuck'; // Saved projects without this field used the old tuck default.
  if(raw.motherParams!==undefined){
    const sourceFamily=(raw.motherParams as TessParams|undefined)?.family;
    const allowed=family==='flagstone'?PRUNABLE:
      family==='primal-dual'?['periodic','archimedean','nonperiodic','custom','ring']:[];
    if(!allowed.includes(sourceFamily as TessFamily))return null;
    const mother=readTessParams(raw.motherParams);
    if(!mother||family==='primal-dual'&&mother.family==='ring'&&mother.ringMode==='origamica'||family==='flagstone'&&base.aspect!==1)return null;
    base.motherParams=mother;
  }
  if(raw.dualEdgeFlips!==undefined){
    const pairs=raw.dualEdgeFlips;
    if(family!=='primal-dual'||!Array.isArray(pairs)||pairs.length>256||
      pairs.some(pair=>!Array.isArray(pair)||pair.length!==2||
        pair.some(value=>!Number.isInteger(value)||value<0||value>=256)||pair[0]>=pair[1])||
      new Set(pairs.map(pair=>pair.join(','))).size!==pairs.length)return null;
    base.dualEdgeFlips=structuredClone(pairs);
  }
  if(raw.visibleTopFace!==undefined){
    if(family!=='primal-dual'||!Number.isInteger(raw.visibleTopFace)||
      raw.visibleTopFace===0||Math.abs(raw.visibleTopFace as number)>4096)return null;
    base.visibleTopFace=raw.visibleTopFace;
  }
  if(raw.faceupFace!==undefined){
    if(family!=='primal-dual'||!Number.isInteger(raw.faceupFace)||
      raw.faceupFace===0||Math.abs(raw.faceupFace as number)>4096)return null;
    base.faceupFace=raw.faceupFace;
  }
  if(family==='ring'){
    if(raw.ringMode==='origamica'){
      const n=base.rings as number,p=raw.outerRadii,r=raw.creaseRadii;
      if(raw.radii!==undefined||raw.includeCenter!==undefined||raw.dualTargets!==undefined||raw.pruneBoundary!==undefined||!Array.isArray(p)||!Array.isArray(r)||p.length!==n+1||r.length!==n||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<.001||v>10)||r.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<.001||v>10)||r.some((v,i)=>!(p[i]+1e-5<v&&v<p[i+1]-1e-5)))return null;
      if(typeof base.angle!=='number'||base.angle<.1||base.angle>80||typeof raw.offsetAngle!=='number'||!Number.isFinite(raw.offsetAngle)||Math.abs(raw.offsetAngle)>180)return null;
      Object.assign(base,{ringMode:'origamica',outerRadii:structuredClone(p),creaseRadii:structuredClone(r),offsetAngle:raw.offsetAngle});
      const curveVariants=[
        ['outerProfiles','creaseProfiles'],['outerExpressions','creaseExpressions'],
        ['outerVectors','creaseVectors'],['outerLinearMaps','creaseLinearMaps'],
        ['outerFourierCurves','creaseFourierCurves'],['outerSignedPowers','creaseSignedPowers'],
        ['outerVectorExpressions','creaseVectorExpressions'],['outerVectorTemplate','creaseVectorTemplate'],
      ];
      if(curveVariants.filter(pair=>pair.some(key=>raw[key]!==undefined)).length>1)return null;
      if(raw.vectorFunctionDefinitions!==undefined){
        if(raw.outerVectorTemplate===undefined&&raw.outerVectorExpressions===undefined)return null;
        const definitions=readRingVectorFunctionDefinitions(raw.vectorFunctionDefinitions);
        if(!definitions)return null;
        base.vectorFunctionDefinitions=definitions;
      }
      if(raw.outerProfiles!==undefined||raw.creaseProfiles!==undefined){
        if(raw.outerExpressions!==undefined||raw.creaseExpressions!==undefined||raw.outerVectors!==undefined||raw.creaseVectors!==undefined||raw.outerLinearMaps!==undefined||raw.creaseLinearMaps!==undefined||raw.outerFourierCurves!==undefined||raw.creaseFourierCurves!==undefined||raw.outerSignedPowers!==undefined||raw.creaseSignedPowers!==undefined)return null;
        const valid=(rows:unknown,count:number):rows is number[][]=>Array.isArray(rows)&&rows.length===count&&rows.every(row=>Array.isArray(row)&&row.length>=8&&row.length<=64&&row.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=.5&&v<=1.5));
        if(!valid(raw.outerProfiles,n+1)||!valid(raw.creaseProfiles,n))return null;
        base.outerProfiles=structuredClone(raw.outerProfiles);base.creaseProfiles=structuredClone(raw.creaseProfiles);
      }
      if(raw.outerExpressions!==undefined||raw.creaseExpressions!==undefined){
        if(raw.outerVectors!==undefined||raw.creaseVectors!==undefined||raw.outerLinearMaps!==undefined||raw.creaseLinearMaps!==undefined||raw.outerFourierCurves!==undefined||raw.creaseFourierCurves!==undefined||raw.outerSignedPowers!==undefined||raw.creaseSignedPowers!==undefined)return null;
        const valid=(rows:unknown,count:number):rows is string[]=>Array.isArray(rows)&&rows.length===count&&rows.every(row=>typeof row==='string'&&row.length>=1&&row.length<=120&&/^[\w.+\-*/(),\s]+$/.test(row));
        if(!valid(raw.outerExpressions,n+1)||!valid(raw.creaseExpressions,n))return null;
        base.outerExpressions=structuredClone(raw.outerExpressions);base.creaseExpressions=structuredClone(raw.creaseExpressions);
      }
      if(raw.outerVectors!==undefined||raw.creaseVectors!==undefined){
        const valid=(rows:unknown,count:number):rows is XY[][]=>Array.isArray(rows)&&rows.length===count&&rows.every(validRingVectorPolygon);
        if(!valid(raw.outerVectors,n+1)||!valid(raw.creaseVectors,n)||raw.outerProfiles!==undefined||raw.creaseProfiles!==undefined||raw.outerExpressions!==undefined||raw.creaseExpressions!==undefined||raw.outerLinearMaps!==undefined||raw.creaseLinearMaps!==undefined||raw.outerFourierCurves!==undefined||raw.creaseFourierCurves!==undefined||raw.outerSignedPowers!==undefined||raw.creaseSignedPowers!==undefined)return null;
        base.outerVectors=structuredClone(raw.outerVectors);base.creaseVectors=structuredClone(raw.creaseVectors);
      }
      if(raw.outerLinearMaps!==undefined||raw.creaseLinearMaps!==undefined){
        const valid=(rows:unknown,count:number):rows is RingLinearMap[]=>Array.isArray(rows)&&rows.length===count&&rows.every(validRingLinearMap);
        if(!valid(raw.outerLinearMaps,n+1)||!valid(raw.creaseLinearMaps,n)||raw.outerProfiles!==undefined||raw.creaseProfiles!==undefined||raw.outerExpressions!==undefined||raw.creaseExpressions!==undefined||raw.outerVectors!==undefined||raw.creaseVectors!==undefined||raw.outerFourierCurves!==undefined||raw.creaseFourierCurves!==undefined||raw.outerSignedPowers!==undefined||raw.creaseSignedPowers!==undefined)return null;
        base.outerLinearMaps=structuredClone(raw.outerLinearMaps);base.creaseLinearMaps=structuredClone(raw.creaseLinearMaps);
      }
      if(raw.outerFourierCurves!==undefined||raw.creaseFourierCurves!==undefined){
        const valid=(rows:unknown,count:number):rows is RingFourierCurve[]=>Array.isArray(rows)&&rows.length===count&&rows.every(validRingFourierCurve);
        if(!valid(raw.outerFourierCurves,n+1)||!valid(raw.creaseFourierCurves,n)||raw.outerProfiles!==undefined||raw.creaseProfiles!==undefined||raw.outerExpressions!==undefined||raw.creaseExpressions!==undefined||raw.outerVectors!==undefined||raw.creaseVectors!==undefined||raw.outerLinearMaps!==undefined||raw.creaseLinearMaps!==undefined||raw.outerSignedPowers!==undefined||raw.creaseSignedPowers!==undefined)return null;
        base.outerFourierCurves=structuredClone(raw.outerFourierCurves);base.creaseFourierCurves=structuredClone(raw.creaseFourierCurves);
      }
      if(raw.outerSignedPowers!==undefined||raw.creaseSignedPowers!==undefined){
        const valid=(rows:unknown,count:number):rows is number[]=>Array.isArray(rows)&&rows.length===count&&rows.every(value=>typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=8);
        if(!valid(raw.outerSignedPowers,n+1)||!valid(raw.creaseSignedPowers,n)||raw.outerProfiles!==undefined||raw.creaseProfiles!==undefined||raw.outerExpressions!==undefined||raw.creaseExpressions!==undefined||raw.outerVectors!==undefined||raw.creaseVectors!==undefined||raw.outerLinearMaps!==undefined||raw.creaseLinearMaps!==undefined||raw.outerFourierCurves!==undefined||raw.creaseFourierCurves!==undefined)return null;
        base.outerSignedPowers=structuredClone(raw.outerSignedPowers);base.creaseSignedPowers=structuredClone(raw.creaseSignedPowers);
      }
      if(raw.outerVectorExpressions!==undefined||raw.creaseVectorExpressions!==undefined){
         const valid=(rows:unknown,count:number):rows is [string,string][]=>Array.isArray(rows)&&rows.length===count&&rows.every(row=>Array.isArray(row)&&row.length===2&&row.every(validRingVectorFormulaText));
        if(!valid(raw.outerVectorExpressions,n+1)||!valid(raw.creaseVectorExpressions,n)||
          raw.outerProfiles!==undefined||raw.creaseProfiles!==undefined||raw.outerExpressions!==undefined||raw.creaseExpressions!==undefined||
          raw.outerVectors!==undefined||raw.creaseVectors!==undefined||raw.outerLinearMaps!==undefined||raw.creaseLinearMaps!==undefined||
          raw.outerFourierCurves!==undefined||raw.creaseFourierCurves!==undefined||raw.outerSignedPowers!==undefined||raw.creaseSignedPowers!==undefined)return null;
        base.outerVectorExpressions=structuredClone(raw.outerVectorExpressions);base.creaseVectorExpressions=structuredClone(raw.creaseVectorExpressions);
      }
      if(raw.outerVectorTemplate!==undefined||raw.creaseVectorTemplate!==undefined){
         const valid=(pair:unknown):pair is [string,string]=>Array.isArray(pair)&&pair.length===2&&pair.every(validRingVectorFormulaText);
        if(!valid(raw.outerVectorTemplate)||!valid(raw.creaseVectorTemplate))return null;
        base.outerVectorTemplate=structuredClone(raw.outerVectorTemplate);base.creaseVectorTemplate=structuredClone(raw.creaseVectorTemplate);
      }
    }else if(raw.ringMode!==undefined&&raw.ringMode!=='mesh'||raw.outerRadii!==undefined||raw.creaseRadii!==undefined||raw.offsetAngle!==undefined||raw.outerProfiles!==undefined||raw.creaseProfiles!==undefined||raw.outerExpressions!==undefined||raw.creaseExpressions!==undefined||raw.outerVectors!==undefined||raw.creaseVectors!==undefined||raw.outerLinearMaps!==undefined||raw.creaseLinearMaps!==undefined||raw.outerFourierCurves!==undefined||raw.creaseFourierCurves!==undefined||raw.outerSignedPowers!==undefined||raw.creaseSignedPowers!==undefined||raw.outerVectorExpressions!==undefined||raw.creaseVectorExpressions!==undefined||raw.outerVectorTemplate!==undefined||raw.creaseVectorTemplate!==undefined)return null;
    else if(raw.radii!==undefined){
      if(!Array.isArray(raw.radii)||raw.radii.length<1||raw.radii.length>8||raw.radii.some((r,i,a)=>typeof r!=='number'||!Number.isFinite(r)||r<.001||r>10||(i>0&&r-a[i-1]<1e-5))||(raw.includeCenter!==undefined&&typeof raw.includeCenter!=='boolean'))return null;
      base.radii=structuredClone(raw.radii);base.includeCenter=raw.includeCenter??false;
    }else if(raw.includeCenter!==undefined)return null;
  }
  if(family==='custom'){
    if(raw.tileDecorations!==undefined){
      const decorations=readTileDecorations(raw.tileDecorations,base.faces as number[][]);
      if(!decorations)return null;base.tileDecorations=decorations;
    }
    if(raw.customOutput!==undefined){
      if(raw.customOutput!=='twist'&&raw.customOutput!=='tiling'&&raw.customOutput!=='tile-twists')return null;
      base.customOutput=raw.customOutput;
    }
    if(raw.lattice!==undefined){
      const lattice=raw.lattice;
      if(!Array.isArray(lattice)||lattice.length!==2||lattice.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>20)))return null;
      const [u,v]=lattice as [XY,XY];if(Math.abs(u[0]*v[1]-u[1]*v[0])<1e-8)return null;
      base.lattice=structuredClone(lattice);
    }
    const hasRanges=raw.range1!==undefined||raw.range2!==undefined;
    if(hasRanges){
      const validRange=(value:unknown):value is [number,number]=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isInteger(n)&&Math.abs(n)<=64)&&value[0]<=value[1];
      if(!base.lattice||base.repeatX!==1||base.repeatY!==1||!validRange(raw.range1)||!validRange(raw.range2))return null;
      base.range1=structuredClone(raw.range1);base.range2=structuredClone(raw.range2);
    }
    const vertices=base.vertices as number[][],faces=base.faces as number[][];
    if(vertices.length<3||vertices.length>96||vertices.some(p=>p.length!==2)||faces.length<1||faces.length>96||faces.some(f=>f.length<3||f.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length)))return null;
    if(raw.tileSpecs!==undefined){
      const specs=readTileSpecs(raw.tileSpecs,{vertices:vertices as XY[],faces});
      if(!specs)return null;base.tileSpecs=specs;
    }
    const cellCount=hasRanges?((base.range1 as [number,number])[1]-(base.range1 as [number,number])[0]+1)*((base.range2 as [number,number])[1]-(base.range2 as [number,number])[0]+1):(base.repeatX as number)*(base.repeatY as number);
    if(faces.length*cellCount>192)return null;
    if(base.customOutput==='tile-twists'){
      if(raw.monolithicOptions!==undefined){
        const monolithic=readTileMonolithicOptions(raw.monolithicOptions);
        if(!monolithic)return null;
        base.monolithicOptions=monolithic;
      }
      const entries=raw.tileTwists;
      // A validated boundary may reduce a larger mother mesh before the backend's 36-face tile construction.
      if(!Array.isArray(entries)||entries.length!==faces.length||
        (faces.length*cellCount>36&&!base.pruneBoundary))return null;
      const twists:TileTwist[]=[];
      for(let i=0;i<entries.length;i++){
        const e=entries[i] as Record<string,unknown>;
        if(!e||typeof e!=='object'||Array.isArray(e))return null;
        const split=e.construction==='split';
        const centered=e.angleMode==='twist';
        const keys=centered?(split?'angleMode,baseVertex,centralTypes,connection,construction,offset,twistAngle,width':'angleMode,centralTypes,offset,twistAngle,width'):(split?'baseVertex,ccw,centralTypes,connection,construction,offset,tilt,width':'centralTypes,offset,tilt,width');
        if(Object.keys(e).sort().join(',')!==keys||typeof e.width!=='number'||!Number.isFinite(e.width)||e.width<.05||e.width>.8||typeof e.offset!=='number'||!Number.isFinite(e.offset)||Math.abs(e.offset)>.4||Math.abs(e.offset)+e.width/2>=.5-1e-8||!Array.isArray(e.centralTypes)||e.centralTypes.length!==faces[i].length||e.centralTypes.some(t=>t!=='M'&&t!=='V'))return null;
        if(centered?(e.offset!==0||typeof e.twistAngle!=='number'||!Number.isFinite(e.twistAngle)||e.twistAngle<1||e.twistAngle>179):(typeof e.tilt!=='number'||!Number.isFinite(e.tilt)||e.tilt<1||e.tilt>179))return null;
        if(split&&(faces[i].length!==4||!Number.isInteger(e.baseVertex)||Number(e.baseVertex)<0||Number(e.baseVertex)>3||(e.connection!=='M'&&e.connection!=='V')||!centered&&typeof e.ccw!=='boolean'))return null;
        twists.push({width:e.width,offset:e.offset,centralTypes:[...e.centralTypes],...(centered?{angleMode:'twist',twistAngle:e.twistAngle as number}:{tilt:e.tilt as number}),...(split?{construction:'split',baseVertex:e.baseVertex as number,connection:e.connection as 'M'|'V',...(!centered?{ccw:e.ccw as boolean}:{})}:{})});
      }
      base.tileTwists=twists;
      if(raw.stationaryFace!==undefined){
        if(typeof raw.stationaryFace!=='number'||!Number.isInteger(raw.stationaryFace)||raw.stationaryFace<0||raw.stationaryFace>4096)return null;
        base.stationaryFace=raw.stationaryFace;
      }
    }else if(raw.tileTwists!==undefined||raw.stationaryFace!==undefined||raw.monolithicOptions!==undefined)return null;
    if([raw.unitRegularCentered,raw.unitTriangle,raw.unitCyclic,raw.unitQuadrilateralSplit,raw.archimedeanPatch,raw.twoColorableArchimedeanPatch,raw.twoUniformPatch].filter(value=>value!==undefined).length>1)return null;
    if(raw.archimedeanPatch!==undefined){
      const spec=readArchimedeanPatchSpec(raw.archimedeanPatch);
      if(!spec||!archimedeanPatchSourceMatches(base,spec))return null;
      base.archimedeanPatch=spec;
    }
    if(raw.twoColorableArchimedeanPatch!==undefined){
      const spec=readTwoColorableArchimedeanSpec(raw.twoColorableArchimedeanPatch);
      if(!spec||!twoColorableArchimedeanSourceMatches(base,spec))return null;
      base.twoColorableArchimedeanPatch=spec;
    }
    if(raw.twoUniformPatch!==undefined){
      const spec=readTwoUniformPatchSpec(raw.twoUniformPatch);
      if(!spec||!twoUniformPatchSourceMatches(base,spec))return null;
      base.twoUniformPatch=spec;
    }
    if(raw.unitRegularCentered!==undefined){
      const spec=readUnitRegularCenteredSpec(raw.unitRegularCentered);
      const monolithic=base.monolithicOptions as TileMonolithicOptions|undefined;
      if(!spec||base.customOutput!=='tile-twists'||base.repeatX!==1||base.repeatY!==1||
        !originalMonolithic(monolithic)||
        base.lattice!==undefined||hasRanges)return null;
      const expected=unitRegularCenteredMesh(spec.sides,spec.arrangement);
      const actualVertices=base.vertices as XY[],actualFaces=base.faces as number[][];
      const twists=base.tileTwists as TileTwist[];
      if(JSON.stringify(actualFaces)!==JSON.stringify(expected.faces)||
        actualVertices.length!==expected.vertices.length||
        actualVertices.some((point,i)=>point.some((value,j)=>Math.abs(value-expected.vertices[i][j])>1e-8))||
        twists.length!==expected.faces.length||twists.some((twist,i)=>
          twist.width!==spec.width||twist.construction!==undefined||
          (spec.tileType===UNIT_REGULAR_OFFSET_TILE_TYPE
            ?twist.offset!==spec.tiles[i].offset||twist.tilt!==90||
              twist.angleMode!==undefined||twist.twistAngle!==undefined||
              JSON.stringify(twist.centralTypes)!==JSON.stringify(spec.tiles[i].centralTypes)
            :twist.offset!==0||
              (spec.tileType===UNIT_REGULAR_CENTERED_ALT_TILE_TYPE
                ?twist.angleMode!=='twist'||twist.twistAngle!==spec.twistAngle||twist.tilt!==undefined
                :twist.tilt!==spec.pleatAngle||twist.angleMode!==undefined||twist.twistAngle!==undefined)||
              JSON.stringify(twist.centralTypes)!==JSON.stringify(
                spec.tileType===UNIT_REGULAR_CENTERED_ALT_TILE_TYPE&&
                unitRegularSidePairLayout(spec.arrangement)&&i===1
                  ?spec.centralTypes.map(type=>type==='M'?'V':'M')
                  :spec.centralTypes))))return null;
      base.unitRegularCentered=spec;
    }
    if(raw.unitTriangle!==undefined){
      const spec=readUnitTriangleSpec(raw.unitTriangle);
      const monolithic=base.monolithicOptions as TileMonolithicOptions|undefined;
      if(!spec||base.customOutput!=='tile-twists'||base.repeatX!==1||base.repeatY!==1||
        !originalMonolithic(monolithic)||base.lattice!==undefined||hasRanges)return null;
      const expected=unitTriangleMesh(spec.angles,spec.arrangement);
      const vertices=base.vertices as XY[],faces=base.faces as number[][];
      const twists=base.tileTwists as TileTwist[];
      if(JSON.stringify(faces)!==JSON.stringify(expected.faces)||
        vertices.length!==expected.vertices.length||
        vertices.some((point,i)=>point.some((value,j)=>Math.abs(value-expected.vertices[i][j])>1e-8))||
        twists.length!==spec.tiles.length||twists.some((twist,i)=>{
          const tile=spec.tiles[i];
          if(twist.width!==spec.width||twist.construction!==undefined||
            JSON.stringify(twist.centralTypes)!==JSON.stringify(tile.centralTypes))return true;
          if(spec.tileType===UNIT_TRIANGLE_OFFSET_TYPE)return twist.offset!==spec.tiles[i].offset||
            twist.tilt!==90||twist.angleMode!==undefined||twist.twistAngle!==undefined;
          if(spec.tileType===UNIT_TRIANGLE_ALT_TYPE)return twist.offset!==0||
            twist.angleMode!=='twist'||twist.twistAngle!==spec.twistAngle||twist.tilt!==undefined;
          return twist.offset!==0||twist.tilt!==spec.pleatAngle||
            twist.angleMode!==undefined||twist.twistAngle!==undefined;
        }))return null;
      base.unitTriangle=spec;
    }
    if(raw.unitCyclic!==undefined){
      const spec=readUnitCyclicSpec(raw.unitCyclic);
      const monolithic=base.monolithicOptions as TileMonolithicOptions|undefined;
      if(!spec||base.customOutput!=='tile-twists'||base.repeatX!==1||base.repeatY!==1||!originalMonolithic(monolithic)||base.lattice!==undefined||hasRanges)return null;
      const expected=unitCyclicMesh(spec),vertices=base.vertices as XY[],faces=base.faces as number[][],twists=base.tileTwists as TileTwist[];
      if(JSON.stringify(faces)!==JSON.stringify(expected.faces)||vertices.length!==expected.vertices.length||vertices.some((point,i)=>point.some((value,j)=>Math.abs(value-expected.vertices[i][j])>1e-8))||twists.length!==spec.tiles.length||twists.some((twist,i)=>{
        const tile=spec.tiles[i];
        if(twist.width!==spec.width||twist.offset!==0||twist.construction!==undefined||JSON.stringify(twist.centralTypes)!==JSON.stringify(tile.centralTypes))return true;
        return spec.tileType===UNIT_CYCLIC_ALT_TYPE
          ?twist.angleMode!=='twist'||twist.twistAngle!==spec.twistAngle||twist.tilt!==undefined
          :twist.tilt!==spec.pleatAngle||twist.angleMode!==undefined||twist.twistAngle!==undefined;
      }))return null;
      base.unitCyclic=spec;
    }
    if(raw.unitQuadrilateralSplit!==undefined){
      const spec=readUnitQuadrilateralSplitSpec(raw.unitQuadrilateralSplit);
      const monolithic=base.monolithicOptions as TileMonolithicOptions|undefined;
      if(!spec||base.customOutput!=='tile-twists'||base.repeatX!==1||base.repeatY!==1||!originalMonolithic(monolithic)||base.lattice!==undefined||hasRanges)return null;
      const expected=unitQuadrilateralSplitMesh(spec),vertices=base.vertices as XY[],faces=base.faces as number[][],twists=base.tileTwists as TileTwist[];
      if(JSON.stringify(faces)!==JSON.stringify(expected.faces)||vertices.length!==expected.vertices.length||vertices.some((point,i)=>point.some((value,j)=>Math.abs(value-expected.vertices[i][j])>1e-8))||twists.length!==spec.tiles.length||twists.some((twist,i)=>{
        const tile=spec.tiles[i];
        if(twist.width!==spec.width||twist.offset!==0||twist.construction!=='split'||twist.baseVertex!==spec.preservedVertex-1||twist.connection!==tile.connection||(spec.tileType!==UNIT_QUAD_ALT_SPLIT_TYPE&&twist.ccw!==true)||(spec.tileType===UNIT_QUAD_ALT_SPLIT_TYPE&&twist.ccw!==undefined)||JSON.stringify(twist.centralTypes)!==JSON.stringify(tile.centralTypes))return true;
        return spec.tileType===UNIT_QUAD_ALT_SPLIT_TYPE
          ?twist.angleMode!=='twist'||twist.twistAngle!==spec.twistAngle||twist.tilt!==undefined
          :twist.tilt!==spec.pleatAngle||twist.angleMode!==undefined||twist.twistAngle!==undefined;
      }))return null;
      base.unitQuadrilateralSplit=spec;
    }
  }
  if(family==='archimedean'&&CAIRO.some(([id])=>id===base.tiling)){
    base.cairoAngle=raw.cairoAngle??90;base.repeatX=raw.repeatX??2;base.repeatY=raw.repeatY??2;base.cairoOutput=raw.cairoOutput??'tiling';
    if(typeof base.cairoAngle!=='number'||!Number.isFinite(base.cairoAngle)||base.cairoAngle<60.1||base.cairoAngle>119.9||!['tiling','twist'].includes(String(base.cairoOutput)))return null;
    if(['repeatX','repeatY'].some(k=>typeof base[k]!=='number'||!Number.isInteger(base[k])||(base[k] as number)<1||(base[k] as number)>4))return null;
  }else if(raw.cairoAngle!==undefined||raw.cairoOutput!==undefined)return null;
  const options=readPrimalDualOptions(raw);if(!options)return null;
  if(family==='ring'&&base.ringMode==='origamica'&&Object.keys(options).length)return null;
  if(family==='custom'&&base.customOutput==='tile-twists'&&Object.keys(options).length)return null;
  if(Object.keys(options).length&&!PRUNABLE.includes(family as TessFamily))return null;
  Object.assign(base,options);
  if(options.parameterization==='gamma-alpha')Object.assign(base,shrinkAndTwist(options.gamma!,options.pleatAngle!,options.twistDirection));
  const enums:Record<string,string[]>={tiling:family==='archimedean'?[...ARCHIMEDEAN,...CAIRO.map(([id])=>id),...TWO_UNIFORM.map(([id])=>id),...RESCH_CATALOG.map(([id])=>id),'pgg','2uniform','equilateral-pentagon','resch-3','resch-4','resch-6']:['square','triangle','hexagon'],kind:['voronoi','delaunay','penrose','goldberg'],weave:['plain','twill','basket']};
  for(const [key,values] of Object.entries(enums))if(key in base&&!values.includes(base[key] as string))return null;
  const bounds:Record<string,[number,number,boolean?]>={rows:[2,6,true],columns:[2,6,true],rings:[family==='primal-dual'?0:1,family==='archimedean'?2:family==='ring'?4:3,true],sides:[3,family==='ring'?(base.ringMode==='origamica'?20:16):12,true],splitCount:[1,4,true],offsetX:[-.6,.6],offsetY:[-.6,.6],angle:[-80,80],scale:[['twist','periodic','primal-dual'].includes(family)?.2:.1,.85],count:[3,96,true],seed:[0,999999,true],depth:[base.kind==='penrose'&&base.penroseVersion==='origamica'?0:1,base.kind==='penrose'&&base.penroseVersion==='origamica'?7:base.kind==='goldberg'?2:3,true],repeatX:[1,family==='archimedean'?4:3,true],repeatY:[1,family==='archimedean'?4:3,true],growth:[1.2,2.5],width:[.1,.45],aspect:[.5,2],phase:[0,1,true]};
  for(const [key,[min,max,integer]] of Object.entries(bounds))if(key in base&&!(options.parameterization==='gamma-alpha'&&['angle','scale'].includes(key))){const n=base[key] as number;if(n<min||n>max||(integer&&!Number.isInteger(n)))return null;}
  if(options.parameterization!=='gamma-alpha'&&'angle' in base&&Math.abs(base.angle as number)<.1&&!(family==='primal-dual'&&base.rings===0))return null;
  if('starAngle' in base&&((base.starAngle as number)<10||(base.starAngle as number)>55))return null;
  if(base.mode==='quad-split'){
    if(base.sides!==4||base.splitCount!==1||base.offsetX!==0||base.offsetY!==0||!['M','V'].includes(base.connection as string))return null;
    if((base.pleatWidth as number)<.1||(base.pleatWidth as number)>.45||!Number.isInteger(base.splitVertex)||(base.splitVertex as number)<0||(base.splitVertex as number)>3)return null;
  }
  if(base.polygon&&(base.polygon as XY[]).length!==base.sides)return null;
  for(const [key,limit] of [['vertices',10],['polygon',1],['points',10]] as const)if(key in base&&(base[key] as XY[]).some(p=>p.some(n=>Math.abs(n)>limit)))return null;
  return base as unknown as TessParams;
}

/** Exact geometry for continuous angle/scale changes; never an adoptable result.
 * Topology and M/V assignments are reused only within the same rotation sign.
 * Background checks still determine whether the final candidate can be adopted.
 */
export function previewTessDocument(result:TessResult|null,signature:string,params:TessParams):Doc|null{
  if(!result||!signature||signature===tessConstructionKey(params)||!('angle' in params&&'scale' in params))return null;
  const previous=JSON.parse(signature) as TessParams;
  if(!('angle' in previous&&'scale' in previous)||Math.sign(previous.angle)!==Math.sign(params.angle)||Math.abs(params.angle)<1e-8)return null;
  const structure=(p:TessParams)=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='tileDecorations'&&k!=='tileSpecs'&&!TRANSFORM_KEYS.includes(k))));
  if(structure(previous)!==structure(params))return null;
  const fold=result.fold as TessGraph;
  if(result.doc.segments.length!==fold.edges_vertices.length)return null;
  let coords:XY[]|null=null;
  const clipRecipe=result.source.paperClipPreview as PaperClipPreviewRecipe|undefined;
  if(params.paper&&clipRecipe){
    coords=previewClippedCoordinates(fold,params,clipRecipe);
  }else if(!params.paper&&result.preview?.kind==='shrink-rotate'){
    const radians=params.angle*Math.PI/180,c=Math.cos(radians)*params.scale,s=Math.sin(radians)*params.scale;
    const rotation=postRotation(params),rc=Math.cos(rotation),rs=Math.sin(rotation);
    const originalCoords=result.preview.vertices.map(([cx,cy,x,y])=>{const px=cx+x*c-y*s,py=cy+x*s+y*c;return [rc*px-rs*py,rs*px+rc*py] as XY;});
    if(result.preview.vertices.length===fold.vertices_coords.length){
      coords=originalCoords;
    }
  }
  if(!coords||coords.some(p=>!p.every(Number.isFinite)))return null;
  const {minX,minY,width,height}=pointBounds(coords);
  const scale=200/Math.max(width,height);if(!Number.isFinite(scale))return null;
  const points=coords.map(p=>[(p[0]-minX)*scale,(p[1]-minY)*scale] as XY);
  return {name:result.doc.name,paper:{width:width*scale,height:height*scale},segments:fold.edges_vertices.map(([a,b],i)=>({...result.doc.segments[i],a:points[a],b:points[b]}))};
}
