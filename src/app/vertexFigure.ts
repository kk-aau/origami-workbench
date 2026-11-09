import {apiWhenIdle} from './api';
import {unitRegularPolygonTileVertices} from './tileSpecs';
import type {XY} from './tessellation';
export type VertexFigureQuery={family:'archimedean-vertex-figure-native';vertexType:number[]};
export type VertexFigureLine={primitive:'Line';points:[XY,XY];style:'TilingLine'};
export type VertexFigureResult={schema:'origamica-vertex-figure-v1';query:VertexFigureQuery;source:{function:'MakeArchimedeanVertexFigure';definitionCell:'In[3098]';definitionLines:[231647,231696];renderTileCells:['In[2999]','In[2860]'];defaultOptionsLines:[210801,210827];rotationsRad:number[];tileVertices:XY[][];totalInteriorAngleRad:number;renderTileDefaults:{TilePolys:false;TileEdges:true;TileVertexIndices:false;TileEdgeArrowStyle:null;TilePolyFill:null;TileEdgeArrowDirs:null;TileIndex:null};originalGraphicGroupsPreserved:true;wolframExecuted:false;paperCertification:false};data:{graphics:[[VertexFigureLine[]][],{primitive:'Point';point:XY;style:{AbsolutePointSize:5}}]}};
export function readVertexFigureQuery(raw:unknown):VertexFigureQuery|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as Record<string,unknown>,v=r.vertexType===undefined?[3,4,6,4]:r.vertexType;
 if(r.family!=='archimedean-vertex-figure-native'||Object.keys(r).some(k=>!['family','vertexType'].includes(k))||!Array.isArray(v)||v.length>16||v.some(n=>typeof n!=='number'||!Number.isInteger(n)||n<3||n>24))return null;
 return{family:'archimedean-vertex-figure-native',vertexType:[...v]};
}
/** Source FractionBox is read as division, independently from the Python helper. */
export function vertexFigureReference(query:VertexFigureQuery):VertexFigureResult{
 const q=readVertexFigureQuery(query);if(!q)throw Error('原顶点图输入无效。');let theta=0;const rotationsRad:number[]=[],tileVertices:XY[][]=[];
 for(const n of q.vertexType){rotationsRad.push(theta);const c=Math.cos(theta),s=Math.sin(theta);tileVertices.push(unitRegularPolygonTileVertices(n).map(([x,y])=>[c*x-s*y,s*x+c*y]));theta+=Math.PI-2*Math.PI/n;}
 const groups=tileVertices.map(tile=>[tile.map((p,j)=>({primitive:'Line' as const,points:[p,tile[(j+1)%tile.length]] as [XY,XY],style:'TilingLine' as const}))] as [VertexFigureLine[]]);
 return{schema:'origamica-vertex-figure-v1',query:q,source:{function:'MakeArchimedeanVertexFigure',definitionCell:'In[3098]',definitionLines:[231647,231696],renderTileCells:['In[2999]','In[2860]'],defaultOptionsLines:[210801,210827],rotationsRad,tileVertices,totalInteriorAngleRad:theta,renderTileDefaults:{TilePolys:false,TileEdges:true,TileVertexIndices:false,TileEdgeArrowStyle:null,TilePolyFill:null,TileEdgeArrowDirs:null,TileIndex:null},originalGraphicGroupsPreserved:true,wolframExecuted:false,paperCertification:false},data:{graphics:[groups,{primitive:'Point',point:[0,0],style:{AbsolutePointSize:5}}]}};
}
export function readVertexFigureResult(raw:unknown,q:VertexFigureQuery):VertexFigureResult{
 const expected=vertexFigureReference(q),same=(a:unknown,b:any):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=3e-11*Math.max(1,Math.abs(b)):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',')&&Object.entries(b).every(([k,v])=>same((a as any)[k],v)):a===b;
 if(!same(raw,expected))throw Error('原顶点图边、旋转、分组、原点或来源独立回读失败。');return raw as VertexFigureResult;
}
export async function fetchVertexFigure(q:VertexFigureQuery,signal?:AbortSignal){return readVertexFigureResult(await apiWhenIdle('tessellation/archimedean-vertex-figure',q,signal),q);}
