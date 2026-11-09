import ear from 'rabbit-ear';
import {polygonArea} from './geometry';
import type {FaceOrder} from './layerSolutions';
import type {Point} from './types';

/** FOLD relations use the second face's normal. Convert to the fixed +Z camera,
 * rather than letting the lowest face ID choose (and possibly reverse) the axis.
 */
export function flatLayerEdges(relations:FaceOrder[],normals:number[]):[number,number][]{
 return relations.map(([a,b,sign])=>sign*normals[b]>0?[b,a]:[a,b]);
}
export function flatLayerOrder(vertices:Point[],faces:number[][],relations:FaceOrder[]):number[]{
 const normals=faces.map(f=>Math.sign(polygonArea(f.map(v=>vertices[v]))));
 if(normals.some(n=>!Number.isFinite(n)||n===0))return [];
 const order=ear.graph.topologicalSort(flatLayerEdges(relations,normals)) as number[]|undefined;
 if(!order)return [];
 const included=new Set(order);return [...faces.map((_,i)=>i).filter(i=>!included.has(i)),...order];
}
