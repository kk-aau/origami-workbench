import {reportDiagramWork} from './diagramWork';
import {epsilonFor,distance} from '../core/geometry';
import type {FlatFoldResult,Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {modelProjection} from './modelProjection';
import {moveFoldedVertices,type FoldedVertexSelection} from './foldedVertexEdit';

/** A drawing-only node on one indexed material face. CP and solver IDs stay intact. */
export interface DiagramPaperAnchor {face:number;cp:Point;point:Point}
export interface DiagramPaperDeformation {nodes:DiagramPaperAnchor[]}
export interface DiagramPaperAnchorEndpoint {point:Point;faces:readonly number[]}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const finite=(p:unknown):p is Point=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1_000_000);
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function weights(point:Point,triangle:Point[],eps:number):number[]|null {
  const [a,b,c]=triangle,den=cross(a,b,c),scale=Math.max(distance(a,b),distance(b,c),distance(c,a));
  if(Math.abs(den)<=eps*Math.max(eps,scale))return null;
  const sign=Math.sign(den);
  if(triangle.some((p,i)=>sign*cross(p,triangle[(i+1)%3],point)<-eps*Math.max(eps,distance(p,triangle[(i+1)%3]))))return null;
  const wb=cross(a,point,c)/den,wc=cross(a,b,point)/den;return [1-wb-wc,wb,wc];
}
const interpolate=(values:Point[],w:number[]):Point=>[values.reduce((sum,p,i)=>sum+p[0]*w[i],0),values.reduce((sum,p,i)=>sum+p[1]*w[i],0)];
const basePose=(pose:DiagramPose):DiagramPose=>{const {paperDeformation:_deformation,...base}=pose;return base;};
function atSource(pose:DiagramPose,face:number,cp:Point):Point {
  const mesh=diagramIllustrationMesh(pose),eps=epsilonFor(pose.sourceDoc);
  for(const cell of mesh.triangles[face]??[]){const w=weights(cp,cell.map(v=>mesh.graph.vertices_coords[v]),eps);if(w)return interpolate(cell.map(v=>mesh.vertices[v]),w);}
  throw Error('纸面锚点不在其原材料面内。');
}
function knownVertex(pose:DiagramPose,face:number,cp:Point):boolean {
  const mesh=diagramIllustrationMesh(basePose(pose)),eps=epsilonFor(pose.sourceDoc);
  return (mesh.triangles[face]??[]).some(cell=>cell.some(v=>distance(mesh.graph.vertices_coords[v],cp)<=eps));
}

/** Validate saved anchors independently of the solver snapshot contract. */
export function validateDiagramPaperDeformation(pose:DiagramPose):void {
  if(pose.paperDeformation===undefined)return;
  const value=pose.paperDeformation;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Array.isArray(value.nodes))throw Error('纸面图示锚点格式无效。');
  const mesh=diagramIllustrationMesh(basePose(pose)),eps=epsilonFor(pose.sourceDoc),seen:DiagramPaperAnchor[]=[];
  for(const node of value.nodes){
    if(!node||typeof node!=='object'||Array.isArray(node)||Object.keys(node).length!==3||!Object.hasOwn(node,'face')||!Object.hasOwn(node,'cp')||!Object.hasOwn(node,'point')||!Number.isInteger(node.face)||node.face<0||node.face>=mesh.triangles.length||!finite(node.cp)||!finite(node.point))throw Error('纸面图示锚点坐标或材料面身份无效。');
    if(seen.some(previous=>previous.face===node.face&&distance(previous.cp,node.cp)<=eps))throw Error('同一原纸面上的图示锚点重复。');
    if(knownVertex(pose,node.face,node.cp))throw Error('图示锚点不能覆盖已有原纸面顶点。');
    if(!(mesh.triangles[node.face]??[]).some(cell=>weights(node.cp,cell.map(v=>mesh.graph.vertices_coords[v]),eps)))throw Error('纸面图示锚点越出原材料面或落入孔洞。');
    seen.push(node);
  }
}

/** Base-fold coordinates followed by the stored per-material drawing anchors. */
export function diagramPaperVertices(pose:DiagramPose):Point[] {
  return [...pose.result.geometry.vertices,...(pose.paperDeformation?.nodes.map(node=>node.point)??[])];
}

/** Temporary overlay geometry; never pass this expanded result to snapshot saving. */
export function diagramPaperEditResult(pose:DiagramPose):FlatFoldResult {
  const mesh=diagramIllustrationMesh(pose);
  if(!pose.paperDeformation?.nodes.length)return pose.result;
  return {...pose.result,geometry:{...pose.result.geometry,vertices:mesh.vertices,faces:mesh.rings.map(rings=>rings[0]),
    ...(pose.result.geometry.graph?{graph:{...pose.result.geometry.graph,vertices_coords:mesh.vertices,faces_vertices:mesh.rings.map(rings=>rings[0]),faces_holes:mesh.rings.map(rings=>rings.slice(1))}}:{})}};
}

/** Bind displayed crease endpoints to their source triangles and material face.
 * Coincident points on separate banks intentionally remain separate members. */
export function prepareDiagramPaperAnchors(pose:DiagramPose,endpoints:readonly DiagramPaperAnchorEndpoint[]):DiagramPose {
  if(!endpoints.length)return pose;
  validateDiagramPaperDeformation(pose);
  const mesh=diagramIllustrationMesh(pose),projection=modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter),shown=mesh.vertices.map(projection.project),eps=epsilonFor(pose.sourceDoc);
  const nodes=[...(pose.paperDeformation?.nodes??[])];
  for(const endpoint of endpoints){
    if(!finite(endpoint.point))throw Error('折线端点坐标无效，无法绑定纸面。');
    for(const face of new Set(endpoint.faces)){
      if(!Number.isInteger(face)||face<0||face>=mesh.triangles.length)throw Error('折线端点引用了不存在的原纸面。');
      for(const cell of mesh.triangles[face]){
        reportDiagramWork();
        const w=weights(endpoint.point,cell.map(v=>shown[v]),eps);if(!w)continue;
        const cp=interpolate(cell.map(v=>mesh.graph.vertices_coords[v]),w);
        if(knownVertex(pose,face,cp)||nodes.some(node=>node.face===face&&distance(node.cp,cp)<=eps))continue;
        nodes.push({face,cp,point:interpolate(cell.map(v=>mesh.vertices[v]),w)});
      }
    }
  }
  if(nodes.length===(pose.paperDeformation?.nodes.length??0))return pose;
  const next={...pose,paperDeformation:{nodes}};validateDiagramPaperDeformation(next);diagramIllustrationMesh(next);return next;
}

/** Give both poses the same source-node order for interpolation and state switches. */
export function alignDiagramPaperAnchors(previous:DiagramPose,next:DiagramPose):[DiagramPose,DiagramPose] {
  if(previous.sourceStateId!==next.sourceStateId||previous.sourceRevision!==next.sourceRevision||!same(previous.sourceDoc,next.sourceDoc))throw Error('纸面锚点要求相同的来源 CP，不能跨步骤合并。');
  const eps=epsilonFor(previous.sourceDoc),layout:Pick<DiagramPaperAnchor,'face'|'cp'>[]=[];
  for(const pose of [previous,next])for(const node of pose.paperDeformation?.nodes??[])if(!layout.some(other=>other.face===node.face&&distance(other.cp,node.cp)<=eps))layout.push({face:node.face,cp:node.cp});
  if(!layout.length)return [previous,next];
  return [previous,next].map(pose=>{
    const nodes=layout.map(({face,cp})=>{
      const found=pose.paperDeformation?.nodes.find(node=>node.face===face&&distance(node.cp,cp)<=eps);
      return found?{...found,cp:[...cp] as Point}:{face,cp:[...cp] as Point,point:atSource(pose,face,cp)};
    });
    return same(nodes,pose.paperDeformation?.nodes)?pose:{...pose,paperDeformation:{nodes}};
  }) as [DiagramPose,DiagramPose];
}

/** A single edit may move original vertices and appended illustration anchors. */
export function moveDiagramPaperVertices(pose:DiagramPose,selection:FoldedVertexSelection,destination:Point):DiagramPose {
  const edit=diagramPaperEditResult(pose),moved=moveFoldedVertices(edit,selection,destination);if(moved===edit)return pose;
  const count=pose.result.geometry.vertices.length,vertices=moved.geometry.vertices.slice(0,count),graph=pose.result.geometry.graph?structuredClone(pose.result.geometry.graph):undefined;
  if(graph){graph.vertices_coords=vertices;delete graph.faceOrders;delete graph.faces_normal;delete graph.faces_matrix2;delete graph.faces_matrix;}
  if(graph&&Array.isArray(graph.zhezhi_spatialEdgeOnFaces))graph.zhezhi_spatialEdgeOnFaces=(graph.zhezhi_spatialEdgeOnFaces as number[]).filter(f=>{
    const points=pose.result.geometry.faces[f].map(v=>vertices[v]),a=points[0],b=points.reduce((best,p)=>Math.hypot(p[0]-a[0],p[1]-a[1])>Math.hypot(best[0]-a[0],best[1]-a[1])?p:best,a),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const scale=Math.max(1,...points.flat().map(Math.abs));return points.every(p=>Math.abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))<=Number.EPSILON*128*scale*Math.max(1,length));
  });
  const result:FlatFoldResult={...moved,geometry:{...moved.geometry,vertices,faces:pose.result.geometry.faces,...(graph?{graph}:{})}};
  // A screen-space illustration edit no longer certifies the physical 3D pose.
  // The paper-state archive retains that original pose for restoring later.
  const {spatial:_physicalPose,...illustration}=pose;
  const next:DiagramPose={...illustration,result,...(pose.paperDeformation?{paperDeformation:{nodes:pose.paperDeformation.nodes.map((node,i)=>({...node,point:moved.geometry.vertices[count+i]}))}}:{})};
  validateDiagramPaperDeformation(next);return next;
}
