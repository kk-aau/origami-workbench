import {polygonArea} from '../core/geometry';
import type {FlatFoldResult,FoldGraph,Point} from '../core/types';
import type {SimulationStepInitialOrder} from '../engine/simStepContactOrder';
import type {DiagramPose} from './diagramProject';
import {flatPresentation} from './flatPresentation';
import {modelOverlapRegions} from './modelOverlapRegions';

/** The saved drawing order is bottom-to-top on the front camera. Convert only
 * positive-area overlaps on the animation's actual subdivided mesh. These
 * relative paint priorities belong to illustration playback, not physics. */
export function diagramAnimationDisplayOrder(pose:DiagramPose|undefined,fold:FoldGraph,
  materialParent:(points:Point[])=>number,projectPoint:(p:Point)=>Point):SimulationStepInitialOrder|undefined {
  const order=pose?.displayOrder;
  if(!pose||pose.spatial||!order?.length||flatPresentation(pose.result,'front').hasOrder)return;
  const count=pose.result.geometry.faces.length;
  if(order.length!==count||new Set(order).size!==count||order.some(f=>!Number.isInteger(f)||f<0||f>=count))return;
  const faces=fold.faces_vertices!,vertices=fold.vertices_coords.map(projectPoint);
  const projected:FlatFoldResult={geometry:{status:'ready',message:'',vertices,faces,graph:{...fold,vertices_coords:vertices}},layers:{status:'unknown',message:''},warnings:[]};
  const parents=faces.map(face=>materialParent(face.map(v=>fold.vertices_coords[v])));
  if(parents.some(f=>f<0||f>=count))throw Error('细分纸面与主图的材料对应缺失，无法继承显示顺序。');
  const ranks=new Map(order.map((f,i)=>[f,i])),windings=faces.map(face=>Math.sign(polygonArea(face.map(v=>vertices[v]))));
  const rows=new Map<number,[number,number,number]>();
  for(const {faces:cover} of modelOverlapRegions(projected).cells){
    for(let i=0;i<cover.length;i++)for(let j=i+1;j<cover.length;j++){
      const a=cover[i],b=cover[j],key=a*faces.length+b;
      if(parents[a]===parents[b]||rows.has(key))continue;
      const above=ranks.get(parents[a])!>ranks.get(parents[b])!;
      rows.set(key,[a,b,(above?1:-1)*windings[b]]);
    }
  }
  if(rows.size)return {sourceFaceCount:faces.length,faceOrders:[...rows.values()]};
}
