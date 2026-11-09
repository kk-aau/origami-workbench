import earcut from 'earcut';
import {buildDiagramFold} from '../core/geometry';
import {materialFaceInside,materialFaceRings} from '../core/materialRings';
import type {Doc,FoldGraph,Point} from '../core/types';

/** Keep sidebar and full-size CP face names inside the same material region,
 * including concave faces and faces containing holes. */
export function diagramCPFaceLabelPoint(graph:FoldGraph,face:number):{point:Point;clearance:number}|null {
  const rings=materialFaceRings(graph,face),indices=rings.flat(),points=indices.map(v=>graph.vertices_coords[v]);
  if(!points.length||points.some(p=>!p))return null;
  const holes:number[]=[];let count=rings[0].length;
  for(const ring of rings.slice(1)){holes.push(count);count+=ring.length;}
  const triangles=earcut(points.flat(),holes,2);
  let best:Point|null=null,clearance=-1;
  const distanceToRing=(p:Point,ring:number[])=>ring.reduce((minimum,v,i)=>{
    const a=graph.vertices_coords[v],b=graph.vertices_coords[ring[(i+1)%ring.length]],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
    return Math.min(minimum,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));
  },Infinity);
  for(let i=0;i<triangles.length;i+=3){
    const a=points[triangles[i]],b=points[triangles[i+1]],c=points[triangles[i+2]],p:Point=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3];
    if(!materialFaceInside(graph,face,p))continue;
    const distance=Math.min(...rings.map(r=>distanceToRing(p,r)));
    if(distance>clearance){clearance=distance;best=p;}
  }
  return best?{point:best,clearance}:null;
}

export function buildDiagramCPLabelGeometry(doc:Doc){
  const {graph,edgeSourceIds}=buildDiagramFold(doc);
  return {graph,edgeSourceIds,faces:(graph.faces_vertices??[]).map((_,face)=>diagramCPFaceLabelPoint(graph,face))};
}
export type DiagramCPLabelGeometry=ReturnType<typeof buildDiagramCPLabelGeometry>;
export type DiagramCPLabel={kind:'face'|'edge';index:number;text:string;point:Point;selected:boolean};
export type DiagramCPLabelViewport={view:{x:number;y:number;w:number;h:number};units:number};

/** Resolve spacing in screen pixels. Zooming reveals smaller cells and atomic
 * edges without scaling the type or changing their topology indices. */
export function layoutDiagramCPLabels(geometry:DiagramCPLabelGeometry,{view,units}:DiagramCPLabelViewport,show:{faces:boolean;edges:boolean},selected:ReadonlySet<string>):DiagramCPLabel[]{
  if(!(units>0&&Number.isFinite(units)))return [];
  const labels:DiagramCPLabel[]=[],font=12,width=view.w/units,height=view.h/units;
  type Box={left:number;right:number;top:number;bottom:number};
  const cells=new Map<string,Box[]>(),cellSize=40;
  const keys=(b:Box)=>{
    const result:string[]=[];
    for(let x=Math.floor(b.left/cellSize);x<=Math.floor(b.right/cellSize);x++)for(let y=Math.floor(b.top/cellSize);y<=Math.floor(b.bottom/cellSize);y++)result.push(`${x},${y}`);
    return result;
  };
  const place=(kind:DiagramCPLabel['kind'],index:number,point:Point,isSelected=false)=>{
    const text=`${kind==='face'?'F':'E'}${index+1}`,x=(point[0]-view.x)/units,y=(point[1]-view.y)/units,halfWidth=text.length*font*.32+2;
    const box={left:x-halfWidth,right:x+halfWidth,top:y-8,bottom:y+8},buckets=keys({...box,left:box.left-3,right:box.right+3,top:box.top-3,bottom:box.bottom+3});
    if(box.left<3||box.right>width-3||box.top<3||box.bottom>height-3)return false;
    if(buckets.some(key=>(cells.get(key)??[]).some(b=>box.left<b.right+3&&box.right>b.left-3&&box.top<b.bottom+3&&box.bottom>b.top-3)))return false;
    for(const key of buckets){const bucket=cells.get(key)??[];bucket.push(box);cells.set(key,bucket);}
    labels.push({kind,index,text,point,selected:isSelected});return true;
  };
  const selectedEdges=new Set(geometry.edgeSourceIds.flatMap((ids,index)=>ids.some(id=>selected.has(id))?[index]:[]));
  const addEdge=(index:number)=>{
    const [a,b]=geometry.graph.edges_vertices[index].map(v=>geometry.graph.vertices_coords[v]),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length/units<(`E${index+1}`.length*font*.64+8))return;
    // A fixed pixel offset keeps names beside the line, including paper edges.
    for(const t of [.5,.3,.7])for(const side of [1,-1]){
      const point:Point=[a[0]+dx*t-dy/length*10*units*side,a[1]+dy*t+dx/length*10*units*side];
      if(place('edge',index,point,selectedEdges.has(index)))return;
    }
  };
  if(show.edges)for(const index of selectedEdges)addEdge(index);
  if(show.faces)geometry.faces.forEach((face,index)=>{
    const radius=Math.hypot(`F${index+1}`.length*font*.32+2,8);
    if(face&&face.clearance/units>=radius)place('face',index,face.point);
  });
  if(show.edges)geometry.graph.edges_vertices.forEach((_,index)=>{if(!selectedEdges.has(index))addEdge(index);});
  return labels;
}
