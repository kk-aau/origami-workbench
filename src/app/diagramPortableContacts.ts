import {pointBounds} from '../core/pointBounds';
import {solveConcaveLayerCandidate} from '../core/concaveLayerCandidate';
import {validateLayerOrders,type FaceOrder} from '../core/layerSolutions';
import {relativeLayerConstraintsMatch} from '../core/relativeLayerConstraints';
import {coveragePairMembership} from '../core/regionTournament';
import {buildExactModelTopology,walkExactCoverage} from './modelExactTopology';
import {artworkCRC32} from './artworkZipIntegrity';
import {solveSpatialContactGroup} from './diagramSpatialContactGroup';
import type {GroupTask,RestoreContactGroup} from './diagramSpatialLayerSolver';
import type {DiagramPose} from './diagramProject';

const encoder=new TextEncoder();
function fingerprint(value:unknown){
  const bytes=encoder.encode(JSON.stringify(value));
  return bytes.length.toString(36)+'-'+artworkCRC32(bytes).toString(16);
}
type Entry={input:string;sourceStateId:string;sourceRevision:number;previousStateId?:string;previousRevision?:number;faces:number[];orders:FaceOrder[];checksum:string};
type Archive={version:1;groups:Entry[]};

/** Check the candidate against live material coverage, hinges and contact
 * constraints. A matching fingerprint alone never establishes a layer order. */
function verify(group:GroupTask,orders:FaceOrder[]):boolean {
  const {result,required}=group.input,{vertices,faces,graph}=result.geometry;
  if(!graph||graph.edges_assignment.includes('U'))return false;
  validateLayerOrders(orders,faces.length);
  if(!group.coversMaterialPairs?.(orders)||!relativeLayerConstraintsMatch(vertices,faces,orders,required))return false;
  const topology=buildExactModelTopology(result);
  const coverage={faceCount:topology.faceCount,cellCount:topology.cellCount,walk:(visitor:Parameters<typeof walkExactCoverage>[1])=>walkExactCoverage(topology,visitor)};
  const touches=coveragePairMembership(coverage);
  if(orders.filter(([a,b])=>touches(a,b)).length!==touches.count)return false;
  const {minX,minY,maxX,maxY}=pointBounds(vertices),epsilon=Math.max(1e-6,Math.max(maxX-minX,maxY-minY)*1e-8);
  const checked=solveConcaveLayerCandidate(graph,epsilon,{coverage,fixedOrders:orders});
  return !!checked?.coverageCertificate;
}

export class DiagramPortableContacts {
  private readonly entries=new Map<string,Entry>();
  readonly verified={groups:0,solved:0};
  constructor(private readonly recording:boolean,raw?:unknown){
    const data=raw as Partial<Archive>|null;
    if(data?.version===1&&Array.isArray(data.groups)){
      for(const entry of data.groups){
        if(entry&&typeof entry.input==='string'&&Array.isArray(entry.orders)&&typeof entry.checksum==='string'){
          this.entries.set(entry.input,entry);
        }
      }
    }
  }
  forPose(pose:DiagramPose,previous?:DiagramPose):RestoreContactGroup {
    const source=[pose.sourceStateId,pose.sourceRevision,previous?.sourceStateId,previous?.sourceRevision,previous?.layerSolutionIndex];
    return group=>{
      const {result,required,preferred}=group.input;
      // preferred contains the actual preceding material relations inherited
      // by this group. Caption, symbols and project title have no bearing on it.
      const faces=group.materialFaces??[];
      const key=fingerprint([source,faces,result.geometry.graph,required,preferred]);
      if(!this.recording){
        const entry=this.entries.get(key);
        if(entry){
          try{
            if(entry.sourceStateId===pose.sourceStateId&&entry.sourceRevision===pose.sourceRevision&&
              entry.previousStateId===previous?.sourceStateId&&entry.previousRevision===previous?.sourceRevision&&
              JSON.stringify(entry.faces)===JSON.stringify(faces)&&entry.checksum===fingerprint([key,entry.orders])&&verify(group,entry.orders)){
              this.verified.groups++;
              return {ok:true,orders:entry.orders,message:''};
            }
          }catch{/* Malformed or unsupported candidates take the full solver path. */}
        }
      }
      this.verified.solved++;
      const answer=solveSpatialContactGroup(group.input);
      if(this.recording&&answer.ok)this.entries.set(key,{input:key,sourceStateId:pose.sourceStateId,sourceRevision:pose.sourceRevision,
        previousStateId:previous?.sourceStateId,previousRevision:previous?.sourceRevision,faces,orders:answer.orders,checksum:fingerprint([key,answer.orders])});
      return answer;
    };
  }
  archive():Archive|undefined{
    return this.entries.size?{version:1,groups:[...this.entries.values()]}:undefined;
  }
}
