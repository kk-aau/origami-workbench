import earcut from 'earcut';
import {buildDiagramFold,epsilonFor,polygonArea} from '../core/geometry';
import type {Doc,FoldGraph,Point} from '../core/types';
import type {DiagramCPState,DiagramPose} from './diagramProject';
import type {DiagramFoldAnchor} from './diagramFoldLinkTypes';
import {pickDiagramFoldAnchor,diagramFoldStartingFace} from './diagramFoldLink';
import {modelProjection} from './modelProjection';
import {materialFaceInside} from '../core/materialRings';
import {hasMaterialTopology} from '../core/materialTopology';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';

export type DiagramCPItem={kind:'face'|'vertex'|'edge';index:number};
export interface DiagramCPMappedSelection {
  polygons:Point[][];polygonFaces:number[];points:Point[];faces:number[];label?:string;
  /** Edge projection is piecewise across source triangles, so the highlight
   * follows a manually pulled paper corner as well as a rigid flat face. */
  segments:{a:Point;b:Point;face:number}[];
  pieces:{face:number;cp:Point[]}[];
}
type Triangle=[number,number,number];
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const center=(p:Point[]):Point=>[p.reduce((s,p)=>s+p[0],0)/p.length,p.reduce((s,p)=>s+p[1],0)/p.length];
export function diagramCPFaceTriangles(graph:FoldGraph,face:number):Triangle[]{
  const outer=graph.faces_vertices?.[face];if(!outer)throw Error('所选纸面不存在。');
  const rings=[outer,...(graph.faces_holes?.[face]??[])],ids=rings.flat(),holes:number[]=[];let offset=outer.length;
  for(const ring of rings.slice(1)){holes.push(offset);offset+=ring.length;}
  const indices=earcut(ids.flatMap(v=>graph.vertices_coords[v]),holes,2);
  return Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).map(k=>ids[k]) as Triangle);
}
function inConvex(point:Point,poly:Point[],eps:number,strict=false):boolean {
  const sign=Math.sign(polygonArea(poly));return !!sign&&poly.every((p,i)=>{
    const q=poly[(i+1)%poly.length],value=sign*cross(p,q,point),tolerance=eps*Math.max(eps,distance(p,q));return strict?value>tolerance:value>=-tolerance;
  });
}
function overlap(a:Point[],b:Point[],eps:number):Point[]{
  let output=a;const sign=Math.sign(polygonArea(b));
  for(let i=0;i<b.length&&output.length;i++){
    const u=b[i],v=b[(i+1)%b.length],input=output;output=[];
    const side=(p:Point)=>sign*cross(u,v,p),tolerance=eps*Math.max(eps,distance(u,v));
    for(let k=0;k<input.length;k++){
      const p=input[k],q=input[(k+1)%input.length],sp=side(p),sq=side(q),insideP=sp>=-tolerance,insideQ=sq>=-tolerance;
      if(insideP)output.push(p);
      if(insideP!==insideQ&&Math.abs(sp-sq)>Number.EPSILON){const t=sp/(sp-sq);output.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
    output=output.filter((p,k)=>distance(p,output[(k+output.length-1)%output.length])>eps);
  }
  return output.length>=3&&Math.abs(polygonArea(output))>eps*eps?output:[];
}
function projectPoint(point:Point,triangle:Point[],shown:Point[]):Point {
  const [a,b,c]=triangle,den=cross(a,b,c);if(Math.abs(den)<1e-15)throw Error('纸面退化，无法对应主图。');
  const wb=cross(a,point,c)/den,wc=cross(a,b,point)/den,wa=1-wb-wc;
  return [shown[0][0]*wa+shown[1][0]*wb+shown[2][0]*wc,shown[0][1]*wa+shown[1][1]*wb+shown[2][1]*wc];
}
function clipSegment(a:Point,b:Point,poly:Point[],eps:number):[Point,Point]|null {
  const sign=Math.sign(polygonArea(poly));if(!sign)return null;
  let from=0,to=1;
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],start=sign*cross(p,q,a),end=sign*cross(p,q,b),tolerance=eps*Math.max(eps,distance(p,q));
    if(start < -tolerance&&end < -tolerance)return null;
    if(start>=-tolerance&&end>=-tolerance)continue;
    const t=start/(start-end);
    if(start < -tolerance)from=Math.max(from,t);else to=Math.min(to,t);
    if(from>to)return null;
  }
  const point=(t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],start=point(from),end=point(to);
  return distance(start,end)>eps?[start,end]:null;
}
function prepare(pose:DiagramPose,source?:DiagramCPState){
  if(source&&(source.id!==pose.sourceStateId||source.revision!==pose.sourceRevision||JSON.stringify(source.doc)!==JSON.stringify(pose.sourceDoc)))throw Error('折图来源 CP 已更新，请重新计算后查看对应关系。');
  const {baseGraph,graph,triangles,vertices}=diagramIllustrationMesh(pose),geometry=pose.result.geometry;
  if(geometry.status!=='ready'||geometry.vertices.length!==baseGraph.vertices_coords.length||JSON.stringify(geometry.faces)!==JSON.stringify(baseGraph.faces_vertices))throw Error('当前折图缺少可对应的纸面身份。');
  const projection=modelProjection(geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter),shown=vertices.map(projection.project);
  return {baseGraph,graph,triangles,shown,eps:epsilonFor(pose.sourceDoc)};
}

/** Piecewise source-face projection also works on illustration-only vertex
 * edits. Fixing a face separately requires the existing rigid-map validator. */
export function mapDiagramCPSelection(pose:DiagramPose,state:DiagramCPState,item:DiagramCPItem,source?:DiagramCPState):DiagramCPMappedSelection {
  const prepared=prepare(pose,source),graph=buildDiagramFold(state.doc).graph,eps=Math.max(prepared.eps,epsilonFor(state.doc));
  const result:DiagramCPMappedSelection={polygons:[],polygonFaces:[],points:[],faces:[],pieces:[],segments:[]},faces=new Set<number>();let comparisons=0;
  const tick=()=>{if(++comparisons>500_000)throw Error('CP 对应关系过多，请缩小选择范围。');};
  const identity=(g:FoldGraph)=>JSON.stringify([g.vertices_coords,g.edges_vertices,g.faces_vertices,g.faces_holes??[]]);
  const exact=identity(graph)===identity(prepared.baseGraph);
  const material=hasMaterialTopology(state.doc)||hasMaterialTopology(pose.sourceDoc);
  if(!exact&&material)throw Error('独立材料或切口的 CP 拓扑已变化，请重新计算折图后选择，避免混淆重合纸面。');
  if(item.kind==='vertex'){
    const point=graph.vertices_coords[item.index];if(!point)throw Error('所选顶点不存在。');
    const incident=exact?graph.edges_vertices.flatMap((edge,index)=>edge.includes(item.index)?[index]:[]):[];
    // A finite F mark may end inside an otherwise unsplit paper face. It has
    // indexed CP identity but no face-boundary corner; locate it in that face's
    // triangles. Explicit cut/material graphs must keep indexed adjacency.
    const flatInteriorTip=exact&&!material&&incident.length>0&&incident.every(edge=>graph.edges_assignment[edge]==='F')&&
      !(graph.faces_vertices??[]).some((ring,face)=>[ring,...(graph.faces_holes?.[face]??[])].flat().includes(item.index));
    for(let f=0;f<(prepared.graph.faces_vertices?.length??0);f++){
      if(exact&&!flatInteriorTip&&![prepared.graph.faces_vertices![f],...(prepared.graph.faces_holes?.[f]??[])].flat().includes(item.index))continue;
      for(const triangle of prepared.triangles[f]){
        tick();const cp=triangle.map(v=>prepared.graph.vertices_coords[v]);if(!inConvex(point,cp,eps))continue;
        faces.add(f);result.pieces.push({face:f,cp});
        const mapped=projectPoint(point,cp,triangle.map(v=>prepared.shown[v]));if(!result.points.some(p=>distance(p,mapped)<=eps))result.points.push(mapped);
      }
    }
  }else if(item.kind==='edge'){
    const edge=graph.edges_vertices[item.index];if(!edge)throw Error('所选线段不存在。');
    const a=graph.vertices_coords[edge[0]],b=graph.vertices_coords[edge[1]],incident=graph.edges_faces?.[item.index]??[];
    const seen=new Set<string>();
    for(let f=0;f<(prepared.graph.faces_vertices?.length??0);f++){
      // Coincident cuts/material banks share coordinates, but keep indexed
      // edge adjacency. Interior F marks deliberately have no boundary face.
      if(exact&&material&&incident.length&&!incident.includes(f))continue;
      for(const triangle of prepared.triangles[f]){
        tick();const cp=triangle.map(v=>prepared.graph.vertices_coords[v]),part=clipSegment(a,b,cp,eps);if(!part)continue;
        faces.add(f);result.pieces.push({face:f,cp});
        const shown=triangle.map(v=>prepared.shown[v]),mapped=part.map(p=>projectPoint(p,cp,shown)) as [Point,Point];
        const key=f+'|'+mapped.map(p=>p.map(n=>Math.round(n/eps)).join(',')).sort().join('|');
        if(seen.has(key))continue;seen.add(key);result.segments.push({a:mapped[0],b:mapped[1],face:f});
      }
    }
  }else{
    const target=diagramCPFaceTriangles(graph,item.index).map(t=>t.map(v=>graph.vertices_coords[v]));
    for(let f=0;f<(prepared.graph.faces_vertices?.length??0);f++){
      if(exact&&f!==item.index)continue;
      for(const triangle of prepared.triangles[f]){
        const cp=triangle.map(v=>prepared.graph.vertices_coords[v]),shown=triangle.map(v=>prepared.shown[v]);
        for(const part of target){tick();const clipped=exact?cp:overlap(part,cp,eps);if(!clipped.length)continue;
          faces.add(f);result.pieces.push({face:f,cp:clipped});result.polygons.push(clipped.map(p=>projectPoint(p,cp,shown)));result.polygonFaces.push(f);
          if(exact)break;
        }
      }
    }
  }
  result.faces=[...faces];if(!result.faces.length)throw Error('此选择不在当前折图的来源纸面中。');return result;
}

/** Pick an actual interior seed in the chosen original face and the current
 * after-CP partition. A vertex target stays exact while its adjacent face
 * supplies the orientation needed by the flat-fold computation. */
export function fixedDiagramCPSelection(pose:DiagramPose,state:DiagramCPState,item:DiagramCPItem,face:number,after:Doc,point?:Point,source?:DiagramCPState):DiagramFoldAnchor {
  if(item.kind==='edge')throw Error('线段用于修改折痕属性；请选择纸面或顶点设置固定。');
  const mapped=mapDiagramCPSelection(pose,state,item,source),prepared=prepare(pose,source),afterGraph=buildDiagramFold(after).graph,eps=Math.max(prepared.eps,epsilonFor(after));
  const target=item.kind==='vertex'?buildDiagramFold(state.doc).graph.vertices_coords[item.index]:point;
  const parts=mapped.pieces.filter(p=>p.face===face),seeds:{point:Point;score:number;poly:Point[]}[]=[];let comparisons=0;
  for(let f=0;f<(afterGraph.faces_vertices?.length??0);f++)for(const t of diagramCPFaceTriangles(afterGraph,f)){
    const poly=t.map(v=>afterGraph.vertices_coords[v]);
    if(item.kind==='vertex'&&target&&!inConvex(target,poly,eps))continue;
    for(const part of parts){if(++comparisons>500_000)throw Error('固定选择对应的纸面过多，请缩小范围。');const region=overlap(poly,part.cp,eps);if(!region.length||target&&!inConvex(target,region,eps))continue;const c=center(region);
      let seed=c;if(target&&inConvex(target,region,eps))seed=inConvex(target,region,eps,true)?target:[target[0]*.96+c[0]*.04,target[1]*.96+c[1]*.04];
      seeds.push({point:seed,poly:region,score:target?distance(target,c):-Math.abs(polygonArea(region))});
    }
  }
  const selected=seeds.sort((a,b)=>a.score-b.score)[0];if(!selected)throw Error('这个点与所选纸面没有共同的固定区域，请选择其它邻接纸面。');
  const triangle=prepared.triangles[face]?.find(t=>inConvex(selected.point,t.map(v=>prepared.graph.vertices_coords[v]),eps));if(!triangle)throw Error('无法定位固定纸面。');
  const shown=projectPoint(selected.point,triangle.map(v=>prepared.graph.vertices_coords[v]),triangle.map(v=>prepared.shown[v]));
  const fixed=pickDiagramFoldAnchor(pose,shown,face,source);diagramFoldStartingFace(after,fixed);
  return {...fixed,target:{stateId:state.id,kind:item.kind,point:target??selected.point}};
}

export function fixedDiagramCPItem(state:DiagramCPState,fixed:DiagramFoldAnchor|undefined):DiagramCPItem|null {
  if(!fixed?.target||fixed.target.stateId!==state.id)return null;
  const graph=buildDiagramFold(state.doc).graph,eps=epsilonFor(state.doc);
  if(fixed.target.kind==='vertex'){
    const matches=graph.vertices_coords.flatMap((p,index)=>distance(p,fixed.target!.point)<=eps?[index]:[]);return matches.length===1?{kind:'vertex',index:matches[0]}:null;
  }
  const index=(graph.faces_vertices??[]).findIndex((_,f)=>materialFaceInside(graph,f,fixed.point));
  return index<0?null:{kind:'face',index};
}
