import type {DiagramPose} from '../app/diagramProject';
import {diagramPoseView} from '../app/diagramDrawing';
import {flatPresentation} from '../app/flatPresentation';
import {flatLayerEdges} from '../core/flatLayerOrder';
import {polygonArea} from '../core/geometry';

/** A user-supplied drawing order never certifies a physical paper layer order. */
export function diagramLayerStackOrder(pose:DiagramPose,selectedFaces:number[]=[]):{faces:number[];scope:'global'|'local'|'unknown'} {
  const view=diagramPoseView(pose),display=flatPresentation(pose.result,view.side,view.rotation),count=pose.result.geometry.faces.length;
  if(display.hasOrder)return {faces:[...display.order].reverse(),scope:'global'};
  const all=Array.from({length:count},(_,face)=>face),unknown={faces:all,scope:'unknown'} as const;
  const selected=[...new Set(selectedFaces.filter(face=>Number.isInteger(face)&&face>=0&&face<count))],relations=pose.result.layers.faceOrders;
  if(pose.result.layers.status!=='solved'||!relations?.length||selected.length<2||selected.length>64||relations.length>20_000||count>8192)return unknown;
  if(relations.some(row=>row.length!==3||row[0]===row[1]||!Number.isInteger(row[0])||!Number.isInteger(row[1])||row[0]<0||row[0]>=count||row[1]<0||row[1]>=count||Math.abs(row[2])!==1))return unknown;
  const normals=pose.result.geometry.faces.map(face=>Math.sign(polygonArea(face.map(vertex=>pose.result.geometry.vertices[vertex]))));
  if(normals.some(normal=>normal===0))return unknown;
  const edges=flatLayerEdges(relations,normals),next=new Map(all.map(face=>[face,new Set<number>()])),degree=new Map(all.map(face=>[face,0]));
  for(const [lower,upper] of edges)if(!next.get(lower)!.has(upper)){next.get(lower)!.add(upper);degree.set(upper,degree.get(upper)!+1);}
  const ready=all.filter(face=>degree.get(face)===0);let visited=0;
  for(let at=0;at<ready.length;at++){visited++;for(const upper of next.get(ready[at])!){const remaining=degree.get(upper)!-1;degree.set(upper,remaining);if(remaining===0)ready.push(upper);}}
  if(visited!==count)return unknown;
  // Unselected intermediate faces can certify a selected pair without
  // requiring any total order for the other, disconnected paper regions.
  const reachable=new Map<number,Set<number>>();let work=0;
  for(const from of selected){
    const seen=new Set<number>([from]),queue=[from];
    for(let at=0;at<queue.length;at++)for(const to of next.get(queue[at])!){if(++work>200_000)return unknown;if(!seen.has(to)){seen.add(to);queue.push(to);}}
    reachable.set(from,seen);
  }
  for(let a=0;a<selected.length;a++)for(let b=a+1;b<selected.length;b++)if(reachable.get(selected[a])!.has(selected[b])===reachable.get(selected[b])!.has(selected[a]))return unknown;
  selected.sort((a,b)=>reachable.get(a)!.has(b)?-1:1);
  if(view.side!=='back')selected.reverse();
  return {faces:selected,scope:'local'};
}
