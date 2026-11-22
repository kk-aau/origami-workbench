import {polygonArea} from './geometry';
import type {FlatFoldResult,Point} from './types';

/** Produce a single, bounded geometric realization for both the contact solver
 * and exact visible surfaces. A caller must solve and certify it in full. */
export function flatRoundoffRecovery(input:FlatFoldResult,epsilon:number):FlatFoldResult|null {
  if(input.geometry.status!=='ready'||!input.geometry.graph||!Number.isFinite(epsilon)||epsilon<=0)return null;
  const step=10**Math.floor(Math.log10(epsilon/100));
  const vertices:Point[]=input.geometry.vertices.map(p=>p.map(x=>Math.round(x/step)*step) as Point);
  let displacement=0;
  for(let v=0;v<vertices.length;v++){
    const p=vertices[v],original=input.geometry.vertices[v];
    if(!p.every(Number.isFinite))return null;
    displacement=Math.max(displacement,Math.hypot(p[0]-original[0],p[1]-original[1]));
  }
  if(!displacement||displacement>epsilon/100)return null;
  for(const face of input.geometry.faces){
    const before=polygonArea(face.map(v=>input.geometry.vertices[v]));
    const after=polygonArea(face.map(v=>vertices[v]));
    if(!Number.isFinite(after)||Math.abs(after)<=epsilon*epsilon||Math.sign(before)!==Math.sign(after))return null;
    // Distinct material corners must retain distinct projected positions.
    const positions=new Map<string,Point>();
    for(const v of face){
      const key=vertices[v].join(','),prior=positions.get(key),original=input.geometry.vertices[v];
      if(prior&&(prior[0]!==original[0]||prior[1]!==original[1]))return null;
      positions.set(key,original);
    }
  }
  return {...input,geometry:{...input.geometry,vertices,graph:{...input.geometry.graph,vertices_coords:vertices}},
    layers:{status:'unknown',message:'正在完整复核稳定后的折后坐标。'},
    warnings:[...input.warnings,`折后坐标已进行精度归一，最大调整 ${displacement.toExponential(2)} 毫米；层序与可见轮廓使用同一份坐标重新计算。`]};
}
