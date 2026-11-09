import {useMemo} from 'react';
import type {FlatFoldConflict,FlatFoldResult,FoldGraph,Point} from '../core/types';
import {flatConflictOverlapRegions,flatConflictSourceOverlapRegions} from '../core/flatConflictRegions';
import IndexedFaceShape from './IndexedFaceShape';
import './FlatConflictDetails.css';

const uniqueIndices=(indices:readonly number[]|undefined,count:number)=>[...new Set(indices??[])].filter(i=>Number.isInteger(i)&&i>=0&&i<count);
export function visibleFlatConflicts(result:FlatFoldResult|null|undefined,busy:boolean,stale:boolean):FlatFoldConflict[]{
 return !busy&&!stale&&result?.layers.status==='no-solution'?(result.layers.conflicts??[]):[];
}
/** Source and folded geometry share indices, but have independent coordinates
 * and cameras. Never project a folded model's display position onto the CP. */
export function sourceConflictResult(result:FlatFoldResult,source:FoldGraph):FlatFoldResult{
 return {...result,geometry:{...result.geometry,vertices:source.vertices_coords,faces:source.faces_vertices??[],graph:source}};
}
export function conflictFaces(conflict:FlatFoldConflict,result:FlatFoldResult){return uniqueIndices(conflict.faces,result.geometry.faces.length);}
export function conflictPoints(conflict:FlatFoldConflict,result:FlatFoldResult,coords:Point[]):Point[]{
 const vertices=new Set(uniqueIndices(conflict.vertices,coords.length));
 for(const face of conflictFaces(conflict,result))for(const v of result.geometry.faces[face])vertices.add(v);
 for(const edge of uniqueIndices(conflict.edges,result.geometry.graph?.edges_vertices.length??0))for(const v of result.geometry.graph!.edges_vertices[edge])vertices.add(v);
 return [...vertices].map(v=>coords[v]).filter((p):p is Point=>!!p&&p.every(Number.isFinite));
}

/** Fit only the identified location; absence of evidence never highlights the
 * whole paper as a substitute for a conflict region. */
export function conflictView(points:Point[],view:{width:number;height:number},modelSpan:number){
 if(!points.length)return null;
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const [x,y]of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 const aspect=Math.max(.1,view.width/Math.max(view.height,.001)),minimum=Math.max(.001,modelSpan/30);
 let width=Math.max(minimum,maxX-minX)*1.65,height=Math.max(minimum,maxY-minY)*1.65;
 if(width/height<aspect)width=height*aspect;else height=width/aspect;
 return {x:(minX+maxX-width)/2,y:(minY+maxY-height)/2,width,height};
}

function label(conflict:FlatFoldConflict,located:boolean){return conflict.scope==='branch'?'搜索冲突示例':conflict.scope==='condition'?'必要条件不满足':conflict.kind==='global'&&!located?'尚未定位具体区域':'约束矛盾';}

export default function FlatConflictDetails({conflicts,index,result,onSelect,onLocate}:{conflicts:FlatFoldConflict[];index:number;result:FlatFoldResult;onSelect:(index:number)=>void;onLocate:()=>void}){
 const conflict=conflicts[index];if(!conflict)return null;
 const faces=conflictFaces(conflict,result),vertices=uniqueIndices(conflict.vertices,result.geometry.vertices.length);
 const located=conflictPoints(conflict,result,result.geometry.vertices).length>0;
 const relations=(conflict.relations??[]).filter(({above,below})=>above!==below&&[above,below].every(face=>Number.isInteger(face)&&face>=0&&face<result.geometry.faces.length));
 return <div className="flat-conflict-details" data-flat-conflict-details="true">
  <div className="flat-conflict-heading"><strong>{label(conflict,located)}</strong>{conflicts.length>1&&<select aria-label="查看冲突原因" value={index} onChange={e=>onSelect(Number(e.target.value))}>{conflicts.map((item,i)=><option key={i} value={i}>{i+1} / {conflicts.length} · {label(item,conflictPoints(item,result,result.geometry.vertices).length>0)}</option>)}</select>}{located&&<button type="button" onClick={onLocate}>定位冲突</button>}</div>
  <p className="flat-conflict-reason" role="status">{conflict.message}</p>
  {(faces.length>0||vertices.length>0)&&<p className="flat-conflict-members">{faces.length>0?`涉及纸面 ${faces.map(f=>`F${f+1}`).join('、')}`:`涉及顶点 ${vertices.map(v=>`V${v+1}`).join('、')}`}；画布已高亮。</p>}
  {['taco_taco','taco_tortilla','tortilla_tortilla'].includes(conflict.kind)&&<p className="flat-conflict-note">深色部分标出相关纸面的共同重叠范围；层序冲突记录只含纸面编号，不能证明范围内每一点都发生穿层。</p>}
  {conflict.scope==='branch'&&<p className="flat-conflict-note">这是被排除候选中的局部冲突示例，可能还涉及其他纸面；不能将此处视为唯一原因。</p>}
  {relations.length>0&&<details className="flat-conflict-relations"><summary>查看冲突时的上下关系</summary><p className="flat-conflict-note">以下关系以模型正面为准。</p>{conflict.scope==='branch'&&<p className="flat-conflict-note">以下关系来自这个被排除的候选，并非最终确定的层序。</p>}<ul>{relations.slice(0,6).map(({above,below},i)=><li key={i}>F{above+1} 在 F{below+1} 上方</li>)}</ul>{relations.length>6&&<p className="flat-conflict-note">另有 {relations.length-6} 组关系。</p>}</details>}
 </div>;
}

export function FlatConflictOverlay({conflict,result,coords,viewWidth,foldedResult}:{conflict:FlatFoldConflict|undefined;result:FlatFoldResult;coords:Point[];viewWidth:number;foldedResult?:FlatFoldResult}){
 const overlap=useMemo(()=>conflict?(foldedResult?flatConflictSourceOverlapRegions(conflict,foldedResult,coords):flatConflictOverlapRegions(conflict,result,coords).map(polygon=>({polygon,face:undefined}))):[],[conflict,result,coords,foldedResult]);
 if(!conflict||!conflictPoints(conflict,result,coords).length)return null;
 const vertices=uniqueIndices(conflict.vertices,coords.length),edges=uniqueIndices(conflict.edges,result.geometry.graph?.edges_vertices.length??0);
 return <g className="flat-conflict-overlay" data-flat-conflict-highlight="true" pointerEvents="none" role="img" aria-label={conflict.message}>
  <title>{conflict.message}</title>
  {conflictFaces(conflict,result).map(face=><IndexedFaceShape key={face} data-conflict-face={face} outer={result.geometry.faces[face]} holes={result.geometry.graph?.faces_holes?.[face]} coords={coords} className="flat-conflict-face" strokeWidth={2} vectorEffect="non-scaling-stroke"/>)}
  {overlap.map(({polygon,face},index)=><polygon key={index} data-conflict-overlap={index} data-conflict-source-face={face} points={polygon.map(point=>point.join(',')).join(' ')} className="flat-conflict-overlap" strokeWidth={2.5} vectorEffect="non-scaling-stroke"/>)}
  {edges.map(edge=>{const [a,b]=result.geometry.graph!.edges_vertices[edge],p=coords[a],q=coords[b];return p&&q?<line key={edge} data-conflict-edge={edge} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className="flat-conflict-edge" strokeWidth={3} vectorEffect="non-scaling-stroke"/>:null;})}
  {vertices.map(vertex=>{const p=coords[vertex];return p?<circle key={vertex} data-conflict-vertex={vertex} cx={p[0]} cy={p[1]} r={Math.max(.001,viewWidth/95)} className="flat-conflict-vertex" strokeWidth={2} vectorEffect="non-scaling-stroke"/>:null;})}
 </g>;
}
