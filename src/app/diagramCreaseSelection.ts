import {reportDiagramWork} from './diagramWork';
import {buildDiagramFold,distance,epsilonFor} from '../core/geometry';
import {hasMaterialTopology} from '../core/materialTopology';
import {validateDoc,type FoldGraph,type Point} from '../core/types';
import type {DiagramCPState,DiagramPose} from './diagramProject';
import type {DiagramLineAnnotation} from './diagramAnnotations';
import type {DiagramFoldLinkSettings} from './diagramFoldLinkTypes';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {diagramPresentation} from './diagramDrawing';
import {modelProjection} from './modelProjection';

type Triangle={face:number;cp:Point[];shown:Point[];den:number};
type Span={lo:number;hi:number;triangle:Triangle};
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const along=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const identity=(graph:FoldGraph)=>JSON.stringify([graph.vertices_coords,graph.edges_vertices,graph.faces_vertices,graph.faces_holes??[]]);
const finite=(point:Point)=>Array.isArray(point)&&point.length===2&&point.every(n=>Number.isFinite(n)&&Math.abs(n)<=1_000_000);

function clip(a:Point,b:Point,triangle:Triangle,eps:number):[number,number]|null {
  let lo=0,hi=1;const sign=Math.sign(triangle.den);
  for(let i=0;i<3;i++){
    const p=triangle.shown[i],q=triangle.shown[(i+1)%3],start=sign*cross(p,q,a),end=sign*cross(p,q,b),tolerance=eps*Math.max(eps,distance(p,q));
    if(start < -tolerance&&end < -tolerance)return null;
    if(start>=-tolerance&&end>=-tolerance)continue;
    const t=start/(start-end);if(start < -tolerance)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return [Math.max(0,lo),Math.min(1,hi)];
}
function toCP(point:Point,triangle:Triangle):Point {
  const [a,b,c]=triangle.shown,wb=cross(a,point,c)/triangle.den,wc=cross(a,b,point)/triangle.den,wa=1-wb-wc;
  return [wa*triangle.cp[0][0]+wb*triangle.cp[1][0]+wc*triangle.cp[2][0],wa*triangle.cp[0][1]+wb*triangle.cp[1][1]+wc*triangle.cp[2][1]];
}
function overlaps(a:Point,b:Point,c:Point,d:Point,eps:number):boolean {
  const length=distance(a,b);if(length<=eps||distance(c,d)<=eps)return false;
  if(Math.abs(cross(a,b,c))>eps*length||Math.abs(cross(a,b,d))>eps*length)return false;
  const parameter=(p:Point)=>((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/(length*length);
  const first=parameter(c),second=parameter(d);
  return (Math.min(1,Math.max(first,second))-Math.max(0,Math.min(first,second)))*length>eps;
}

/** Selection follows original material triangles, including manually pulled
 * illustration cells. The material range stored on each line takes precedence
 * over the next drawing tool's range. CP atomic edge numbers remain unchanged. */
export function diagramCreaseCPEdges(pose:DiagramPose,lines:readonly DiagramLineAnnotation[],settings:DiagramFoldLinkSettings,state:DiagramCPState,source?:DiagramCPState):number[] {
  if(!lines.length)return [];
  try{
    validateDoc(pose.sourceDoc);validateDoc(state.doc);
    if(source&&(source.id!==pose.sourceStateId||source.revision!==pose.sourceRevision||JSON.stringify(source.doc)!==JSON.stringify(pose.sourceDoc)))return [];
    const {baseGraph,graph,triangles:cells,vertices}=diagramIllustrationMesh(pose),geometry=pose.result.geometry,target=buildDiagramFold(state.doc).graph;
    if(geometry.status!=='ready'||geometry.vertices.length!==baseGraph.vertices_coords.length||JSON.stringify(geometry.faces)!==JSON.stringify(baseGraph.faces_vertices)||geometry.vertices.some(p=>!finite(p)))return [];
    // Coincident independent material banks need their indexed identity, not
    // coordinate guesses after a cut or topology edit.
    const material=hasMaterialTopology(pose.sourceDoc)||hasMaterialTopology(state.doc);
    if(material&&identity(baseGraph)!==identity(target))return [];
    const count=geometry.faces.length,validFaces=(faces:readonly number[])=>faces.every(f=>Number.isInteger(f)&&f>=0&&f<count);
    if(!['all','top','selected'].includes(settings.layers)||!validFaces(settings.selectedFaces))return [];
    const eps=Math.max(epsilonFor(pose.sourceDoc),epsilonFor(state.doc)),projection=modelProjection(geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter),shown=vertices.map(projection.project);
    const triangles:Triangle[]=[],paintOrder=diagramPresentation(pose).order,coverage:{a:Point;b:Point;face:number}[]=[];
    const tick=reportDiagramWork;
    for(let face=0;face<count;face++)for(const indices of cells[face]){
      tick();const cp=indices.map(v=>graph.vertices_coords[v]),points=indices.map(v=>shown[v]);
      if(cp.length!==3||cp.some(p=>!p||!finite(p))||points.some(p=>!p||!finite(p)))return [];
      const den=cross(points[0],points[1],points[2]),scale=Math.max(...points.map((p,i)=>distance(p,points[(i+1)%3])));
      if(Math.abs(den)<=eps*Math.max(eps,scale))return [];
      triangles.push({face,cp,shown:points,den});
    }
    for(const line of lines){
      if(line.style==='auxiliary'||line.style==='boundary'||line.foldFaces?.length===0)continue;
      if(!finite(line.a)||!finite(line.b)||line.foldFaces&&!validFaces(line.foldFaces))return [];
      const length=distance(line.a,line.b);if(length<=eps)continue;
      const bound=line.foldFaces?new Set(line.foldFaces):settings.layers==='selected'?new Set(settings.selectedFaces):null;
      const spans:Span[]=[],breaks=[0,1];
      for(const triangle of triangles){
        tick();if(bound&&!bound.has(triangle.face))continue;
        const range=clip(line.a,line.b,triangle,eps);if(!range||(range[1]-range[0])*length<=eps)continue;
        spans.push({lo:range[0],hi:range[1],triangle});breaks.push(...range);
      }
      const stops:number[]=[];for(const t of breaks.sort((a,b)=>a-b))if(!stops.length||(t-stops.at(-1)!)*length>eps)stops.push(t);
      for(let i=1;i<stops.length;i++){
        const lo=stops[i-1],hi=stops[i],mid=(lo+hi)/2;if((hi-lo)*length<=eps)continue;
        let active=spans.filter(span=>{tick();return span.lo<=mid&&span.hi>=mid;});
        if(!line.foldFaces&&settings.layers==='top'){
          const covered=new Set(active.map(span=>span.triangle.face)),top=[...paintOrder].reverse().find(face=>covered.has(face));
          active=active.filter(span=>span.triangle.face===top);
        }
        for(const span of active){
          tick();const a=toCP(along(line.a,line.b,lo),span.triangle),b=toCP(along(line.a,line.b,hi),span.triangle);
          if(!finite(a)||!finite(b))return [];coverage.push({a,b,face:span.triangle.face});
        }
      }
    }
    const result:number[]=[];
    for(let edge=0;edge<target.edges_vertices.length;edge++){
      if(!['M','V','F','U'].includes(target.edges_assignment[edge]))continue;
      const [a,b]=target.edges_vertices[edge].map(v=>target.vertices_coords[v]),incident=target.edges_faces?.[edge]??[];
      if(coverage.some(part=>{tick();return (!material||!incident.length||incident.includes(part.face))&&overlaps(part.a,part.b,a,b,eps);}))result.push(edge);
    }
    return result;
  }catch{return [];}
}
