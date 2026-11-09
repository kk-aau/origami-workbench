import type {Point} from '../core/types';
import {epsilonFor,polygonArea} from '../core/geometry';
import type {DiagramPose} from './diagramProject';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import {diagramPresentation} from './diagramDrawing';
import {modelBoundsIndex,modelPolygonBounds} from './modelOverlapRegions';
import {modelRegionLayers,type ModelRegionLayerOrder} from './modelRegionLayers';

export interface DiagramLocalLayerProbe {
  face:number;point:Point;faces:number[];
  order:ModelRegionLayerOrder;
  above:number[];below:number[];sampled?:boolean;
}
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function weights(p:Point,t:Point[],eps:number):number[]|null {
  const den=cross(t[0],t[1],t[2]);if(Math.abs(den)<=eps*eps)return null;
  const b=cross(t[0],p,t[2])/den,c=cross(t[0],t[1],p)/den,a=1-b-c;
  return Math.min(a,b,c)>=-1e-9?[a,b,c]:null;
}

/** Prepared once per paper pose. Every query uses actual illustration triangles,
 * including holes and pulled vertices. Neither global list neighbours nor paths
 * through paper absent at this point may establish the local layer order. */
export function prepareDiagramLocalLayerProbe(pose:DiagramPose){
  const mesh=diagramIllustrationMesh(pose),display=diagramPresentation(pose),eps=epsilonFor(pose.sourceDoc);
  const cells=mesh.triangles.flatMap((row,face)=>row.map(ids=>({face,cp:ids.map(v=>mesh.graph.vertices_coords[v]),shown:ids.map(v=>display.vertices[v])})));
  const index=modelBoundsIndex(cells.map(cell=>modelPolygonBounds(cell.shown)));
  const byFace=new Map<number,typeof cells>();for(const cell of cells){const row=byFace.get(cell.face)??[];row.push(cell);byFace.set(cell.face,row);}
  const orders=new Map<string,ModelRegionLayerOrder>();
  function at(point:Point,preferred?:number):DiagramLocalLayerProbe|null {
    const faces=[...new Set(index.at(point).filter(i=>weights(point,cells[i].shown,eps)).map(i=>cells[i].face))].sort((a,b)=>a-b);
    if(!faces.length||preferred!==undefined&&!faces.includes(preferred))return null;
    const key=faces.join(',');let order=orders.get(key);
    if(!order){
      order=pose.result.layers.status!=='solved'?{status:'unconfirmed',message:'此处层序尚未确认。'}:
        pose.paperDeformation?.nodes.length?{status:'unconfirmed',message:'拖角后的局部重叠尚未确认层序。'}:
        modelRegionLayers(pose.result,{cells:[{faces,polygon:[],area:0}],maxDepth:faces.length,omittedThinRegions:0,epsilon:eps},pose.view?.side??'front')[0].layers;
      orders.set(key,order);if(orders.size>256)orders.delete(orders.keys().next().value!);
    }
    const face=preferred??(order.status==='ordered'?order.topToBottom.find(f=>!pose.hiddenFaces?.includes(f)):undefined)??faces.find(f=>!pose.hiddenFaces?.includes(f));
    if(face===undefined)return null;
    const position=order.status==='ordered'?order.topToBottom.indexOf(face):-1;
    return {face,point,faces,order,above:order.status==='ordered'?order.topToBottom.slice(Math.max(0,position-2),position):[],below:order.status==='ordered'?order.topToBottom.slice(position+1,position+3):[]};
  }
  function fromCP(point:Point,allowed:readonly number[]):DiagramLocalLayerProbe|null {
    for(const face of allowed)for(const cell of byFace.get(face)??[]){
      const w=weights(point,cell.cp,eps);if(!w)continue;
      const shown:Point=[0,0];w.forEach((value,i)=>{shown[0]+=value*cell.shown[i][0];shown[1]+=value*cell.shown[i][1];});
      return at(shown,face);
    }
    return null;
  }
  function faceSample(face:number):DiagramLocalLayerProbe|null {
    const cell=byFace.get(face)?.reduce((best,next)=>Math.abs(polygonArea(next.shown))>Math.abs(polygonArea(best.shown))?next:best);
    const probe=cell?at([cell.shown.reduce((s,p)=>s+p[0],0)/3,cell.shown.reduce((s,p)=>s+p[1],0)/3],face):null;
    return probe?{...probe,sampled:true}:null;
  }
  function highlight(face:number){
    const polygons=(byFace.get(face)??[]).map(cell=>cell.shown);
    return {polygons,polygonFaces:polygons.map(()=>face),faces:[face],points:[] as Point[],label:`纸面 F${face+1}`};
  }
  return {at,fromCP,faceSample,highlight};
}
