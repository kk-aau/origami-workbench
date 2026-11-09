import type {FlatFoldResult,Point} from '../core/types';
import {buildExactModelTopology,walkExactCoverage,type ExactTopologyProgress} from './modelExactTopology';

export interface ExactArrangementCell {
 polygon:Point[];holes:Point[][];faces:number[];area:number;
 /** Mathematical positivity is certified even when the rounded area is zero. */
 positiveArea:true;rings:number[][];
}
export interface ExactArrangementEdge {a:number;b:number;leftCell:number;rightCell:number;ringOwners:number[]}
export interface ExactModelArrangement {
 vertices:Point[];cells:ExactArrangementCell[];edges:ExactArrangementEdge[];
 exactVertices:readonly (readonly [bigint,bigint,bigint])[];binaryExponent:number;
 rings:readonly {face:number;hole:boolean}[];maxDepth:number;
 diagnostics:{sourceSegments:number;candidatePairs:number;intersections:number;components:number;neutralSegments:number;coverageMemberships:number};
}

/** Small-scale audit adapter. Production-sized experiments use the compact
 * topology and repeatable walk directly, without these polygon/membership
 * copies. This wrapper does not impose a size cutoff or discard geometry. */
export function modelExactArrangement(result:FlatFoldResult,onProgress?:ExactTopologyProgress):ExactModelArrangement{
 const topology=buildExactModelTopology(result,onProgress,{retainExactVertices:true});
 const vertices:Point[]=Array.from({length:topology.vertexCount},(_,v)=>[topology.vertexXY[v*2],topology.vertexXY[v*2+1]]);
 const cells:ExactArrangementCell[]=Array.from({length:topology.cellCount},(_,cell)=>{
  const rings:number[][]=[];for(let ring=topology.cellRingOffsets[cell];ring<topology.cellRingOffsets[cell+1];ring++)rings.push(Array.from(topology.ringVertices.subarray(topology.ringVertexOffsets[ring],topology.ringVertexOffsets[ring+1])));
  return {polygon:rings[0].map(v=>vertices[v]),holes:rings.slice(1).map(ring=>ring.map(v=>vertices[v])),faces:[],area:topology.cellArea[cell],positiveArea:true,rings};
 });
 let maxDepth=0,coverageMemberships=0;
 walkExactCoverage(topology,{onCell(cell,faces){cells[cell].faces=[...faces].sort((a,b)=>a-b);maxDepth=Math.max(maxDepth,faces.size);coverageMemberships+=faces.size;}});
 const edges:ExactArrangementEdge[]=Array.from({length:topology.edgeCount},(_,edge)=>({a:topology.edgeVertices[edge*2],b:topology.edgeVertices[edge*2+1],leftCell:topology.edgeCells[edge*2],rightCell:topology.edgeCells[edge*2+1],ringOwners:Array.from(topology.edgeOwners.subarray(topology.edgeOwnerOffsets[edge],topology.edgeOwnerOffsets[edge+1]))}));
 const rings=Array.from(topology.ringFaces,(face,ring)=>({face,hole:Boolean(topology.ringIsHole[ring])}));
 onProgress?.('complete',{cells:cells.length,vertices:vertices.length,edges:edges.length,maxDepth,coverageMemberships});
 return {vertices,cells,edges,exactVertices:topology.exactVertices!,binaryExponent:topology.binaryExponent,rings,maxDepth,diagnostics:{...topology.diagnostics,coverageMemberships}};
}
