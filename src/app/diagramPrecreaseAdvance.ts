import {reportDiagramWork} from './diagramWork';
import earcut from 'earcut';
import ear from 'rabbit-ear';
import {buildDiagramFold,distance,epsilonFor,polygonArea} from '../core/geometry';
import {buildDiagramPoseFold,buildDiagramPoseDocFold} from './diagramFoldGeometry';
import {flatLayerEdges} from '../core/flatLayerOrder';
import type {Doc,FlatFoldResult,FoldGraph,Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import {modelProjection} from './modelProjection';
import {diffDiagramFoldCP,diagramFoldStartingFace,mapDiagramFoldLines,pickDiagramFoldAnchor,type DiagramFoldAnchor} from './diagramFoldLink';

/** A dormant F route records a mark, never changes the retained folded pose.
 * Check both directions: replacing an existing mountain/valley with F unfolds
 * that paper and therefore still needs an explicit stationary side. */
export function hasDiagramActiveFoldChanges(before:Doc,after:Doc):boolean {
  const active=(doc:Doc,other:Doc)=>diffDiagramFoldCP(doc,other).some(s=>s.assignment==='M'||s.assignment==='V'||s.assignment==='U');
  return active(before,after)||active(after,before);
}

function distanceToEdge(point:Point,a:Point,b:Point):number {
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)):0;
  return distance(point,[a[0]+t*dx,a[1]+t*dy]);
}
const interpolate=(points:Point[],weights:number[]):Point=>[points.reduce((sum,p,i)=>sum+p[0]*weights[i],0),points.reduce((sum,p,i)=>sum+p[1]*weights[i],0)];
function trianglesOf(graph:FoldGraph,face:number):number[][] {
  const rings=[graph.faces_vertices![face],...(graph.faces_holes?.[face]??[])],ids=rings.flat(),holes:number[]=[];
  let offset=rings[0].length;for(const ring of rings.slice(1)){holes.push(offset);offset+=ring.length;}
  const indices=earcut(ids.flatMap(v=>graph.vertices_coords[v]),holes,2);
  return Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).map(v=>ids[v]));
}

/** Locate a material-interior seed automatically when only dormant creases
 * changed. The original raw rigid matrix preserves real front/back parity;
 * the view stays with the caller and is not baked into the new geometry.
 * Layer relationships are deliberately not copied across new face indices. */
export function chooseDiagramPrecreaseAnchor(pose:DiagramPose,after:Doc):DiagramFoldAnchor {
  if(hasDiagramActiveFoldChanges(pose.sourceDoc,after))throw Error('实际折叠发生变化，请选择本步保持不动的纸面。');
  // This also verifies source/result topology and all faces' isometry before
  // interpolating points. A pulled or stale illustration cannot supply seeds.
  mapDiagramFoldLines(pose,[],{enabled:true,layers:'all',selectedFaces:[]});
  const source=buildDiagramPoseFold(pose).graph,next=buildDiagramFold(after).graph;
  const faces=source.faces_vertices??[],newFaces=next.faces_vertices??[];
  if(!newFaces.length)throw Error('预折 CP 需要有效的纸面，才能保持原折图姿态。');
  const eps=Math.max(epsilonFor(pose.sourceDoc),epsilonFor(after));
  const edges=[...source.edges_vertices.map(([a,b])=>[source.vertices_coords[a],source.vertices_coords[b]]),...next.edges_vertices.map(([a,b])=>[next.vertices_coords[a],next.vertices_coords[b]])];
  const camera=modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter);
  const root=pose.result.geometry.startingFace,order=faces.map((_,f)=>f);
  if(root!==undefined&&order.includes(root)){order.splice(order.indexOf(root),1);order.unshift(root);}
  
  for(const face of order){
    const rings=[faces[face],...(source.faces_holes?.[face]??[])],ids=rings.flat(),holes:number[]=[];
    let offset=rings[0].length;for(const ring of rings.slice(1)){holes.push(offset);offset+=ring.length;}
    const triangles=earcut(ids.flatMap(v=>source.vertices_coords[v]),holes,2);
    for(let t=0;t<triangles.length;t+=3){
      const triangle=triangles.slice(t,t+3).map(i=>ids[i]);
      for(let probe=0;probe<65;probe++){
        // The centroid is usual; asymmetric interior probes avoid F lines
        // through centres, symmetry axes, and previous triangulation seams.
        const r=Math.sqrt((probe*.6180339887498949)%1),v=(probe*.4142135623730951)%1;
        const weights=probe===0?[1/3,1/3,1/3]:[1-r,r*(1-v),r*v];
        const point=interpolate(triangle.map(i=>source.vertices_coords[i]),weights);
        let clear=true;
        for(const [a,b] of edges){
          reportDiagramWork();
          if(distanceToEdge(point,a,b)<=eps*4){clear=false;break;}
        }
        if(!clear)continue;
        const shown=camera.project(interpolate(triangle.map(i=>pose.result.geometry.vertices[i]),weights));
        const anchor=pickDiagramFoldAnchor(pose,shown,face);
        // The same material point must belong uniquely to a new subface.
        try{diagramFoldStartingFace(after,anchor);return anchor;}
        catch(error){if(!(error instanceof Error)||!error.message.includes('固定点位于新折痕或纸面边界'))throw error;}
      }
    }
  }
  throw Error('预折 CP 没有可安全定位的纸面内部点，请检查重合线、细小纸面或纸面边界。');
}

/** Accept only genuine new solver certificates that retain the previous
 * certified order where old material layers overlap. Coplanar F daughters
 * do not receive fabricated ordering relationships. A false return leaves
 * the caller free to try another solver candidate or mark the order unknown. */
export function diagramPrecreaseLayerOrderMatches(pose:DiagramPose,after:Doc,result:FlatFoldResult):boolean {
  if(pose.result.layers.status!=='solved')return true;
  if(result.layers.status!=='solved'||result.geometry.status!=='ready')return false;
  const oldRelations=pose.result.layers.faceOrders;
  if(!oldRelations)return pose.result.geometry.faces.length===1;
  try{
    const source=buildDiagramPoseFold(pose).graph,next=buildDiagramPoseDocFold(after,{result}).graph;
    const oldFaces=source.faces_vertices??[],newFaces=next.faces_vertices??[];
    if(!oldFaces.length||!newFaces.length||
      JSON.stringify(oldFaces)!==JSON.stringify(pose.result.geometry.faces)||JSON.stringify(newFaces)!==JSON.stringify(result.geometry.faces)||
      source.vertices_coords.length!==pose.result.geometry.vertices.length||next.vertices_coords.length!==result.geometry.vertices.length)return false;
    const valid=(relations:[number,number,number][],count:number)=>relations.every(r=>Array.isArray(r)&&r.length===3&&Number.isInteger(r[0])&&Number.isInteger(r[1])&&r[0]>=0&&r[1]>=0&&r[0]<count&&r[1]<count&&r[0]!==r[1]&&Math.abs(r[2])===1);
    const newRelations=result.layers.faceOrders??[];
    if(!valid(oldRelations,oldFaces.length)||!valid(newRelations,newFaces.length))return false;
    const oldNormals=oldFaces.map(face=>Math.sign(polygonArea(face.map(v=>pose.result.geometry.vertices[v]))));
    const newNormals=newFaces.map(face=>Math.sign(polygonArea(face.map(v=>result.geometry.vertices[v]))));
    if(oldNormals.includes(0)||newNormals.includes(0))return false;
    const expected=flatLayerEdges(oldRelations,oldNormals);
    if(!expected.length)return true;
    const eps=Math.max(epsilonFor(pose.sourceDoc),epsilonFor(after)),oldPolygons=oldFaces.map(face=>face.map(v=>source.vertices_coords[v]));
    const tick=reportDiagramWork;
    const containsStrict=(point:Point,polygon:Point[]):boolean=>{
      let inside=false;
      for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
        tick();const a=polygon[j],b=polygon[i];if(distanceToEdge(point,a,b)<=eps*4)return false;
        if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
      return inside;
    };
    const triangles=newFaces.map((_,f)=>trianglesOf(next,f)),children=oldFaces.map(()=>[] as number[]);
    for(let face=0;face<newFaces.length;face++){
      let parent:number|undefined;
      for(const triangle of triangles[face]){
        let owner:number|undefined;
        for(const weights of [[1/3,1/3,1/3],[.6,.25,.15],[.15,.6,.25],[.25,.15,.6]]){
          const point=interpolate(triangle.map(v=>next.vertices_coords[v]),weights);
          const hits=oldPolygons.flatMap((polygon,f)=>containsStrict(point,polygon)&&!(source.faces_holes?.[f]??[]).some(ring=>containsStrict(point,ring.map(v=>source.vertices_coords[v])))?[f]:[]);
          if(hits.length===1){owner=hits[0];break;}
        }
        if(owner===undefined||parent!==undefined&&parent!==owner)return false;
        parent=owner;
      }
      if(parent===undefined)return false;
      children[parent].push(face);
    }
    const actual=flatLayerEdges(newRelations,newNormals),adjacency=newFaces.map(()=>new Set<number>());
    for(const [bottom,top] of actual)adjacency[bottom].add(top);
    const reached=new Map<number,Set<number>>();
    const reaches=(bottom:number,top:number)=>{
      let set=reached.get(bottom);
      if(!set){set=new Set<number>();const todo=[bottom];while(todo.length){const f=todo.pop()!;for(const g of adjacency[f]){tick();if(!set.has(g)){set.add(g);todo.push(g);}}}reached.set(bottom,set);}
      return set.has(top);
    };
    const shownTriangles=triangles.map(row=>row.map(ids=>ids.map(v=>result.geometry.vertices[v])));
    for(const [bottom,top] of expected)for(const a of children[bottom])for(const b of children[top]){
      let overlap=false;
      for(const p of shownTriangles[a]){for(const q of shownTriangles[b]){tick(9);if(ear.math.overlapConvexPolygons(p,q,eps)){overlap=true;break;}}if(overlap)break;}
      if(overlap&&!reaches(a,b))return false;
    }
    return true;
  }catch{return false;}
}
