import type {DiagramPose} from './diagramProject';
import {createDiagramSpatialProjector,type DiagramSpatialPose} from './diagramSpatialPose';
import {drawingSVG} from './diagramDrawing';
import {defaultDiagramLineDefaults} from './diagramLineStyles';
import type {FoldGraph} from '../core/types';

type Camera=DiagramSpatialPose['camera'];
export type DiagramSpatialPreviewAnswer=ReturnType<ReturnType<typeof createDiagramSpatialProjector>>;
const key=(value:unknown)=>JSON.stringify(value);

/** Camera projection fields are deliberately absent here. Everything that can
 * change the physical paper or its material-side contact evidence stays bound. */
function materialKey(pose:DiagramPose):string{
 const {vertices_coords,zhezhi_spatialEdgeOnFaces,...materialGraph}=(pose.result.geometry.graph??{}) as FoldGraph;
 const {camera,...physical}=pose.spatial??{} as DiagramSpatialPose;
 return key([pose.sourceStateId,pose.sourceRevision,pose.sourceDoc,pose.paperDeformation??null,
  pose.result.geometry.status,pose.result.geometry.faces,pose.result.geometry.startingFace??0,pose.result.geometry.modified??false,materialGraph,
  pose.spatial?[physical,camera.frame??null]:[pose.result.geometry.vertices,vertices_coords]]);
}
/** A matching material alone does not authorize reusing arbitrary saved order.
 * Camera-only sync is allowed only for an input already verified in this
 * session, or an exact answer this session has explicitly issued for commit. */
function proofKey(pose:DiagramPose):string{
 return key([materialKey(pose),pose.spatial?.camera,pose.result.geometry.vertices,
  pose.result.geometry.graph?.vertices_coords,pose.result.geometry.graph?.zhezhi_spatialEdgeOnFaces,
  pose.result.layers,pose.layerSolutionIndex??pose.result.layers.solutionIndex??null]);
}
const cameraKey=(camera:Camera)=>key([camera.yaw,camera.elevation,camera.rotation??null,camera.pivot??null,camera.offset??null,camera.frame??null]);

/** Private worker-owned model. A successful camera gesture keeps the verified
 * material projector alive; a changed file, source, contact or historical
 * proof must build a new one. No global cache transfers trust between files. */
export function createDiagramSpatialPreviewModel(pose:DiagramPose,history:readonly DiagramPose[]=[],drawingRotation=0){
 let projector:ReturnType<typeof createDiagramSpatialProjector>|undefined,presentation:DiagramPose,rotation=drawingRotation,material='',historyProof='';
 let knownProofs=new Set<string>(),issuedProofs:string[]=[];
 let cached:{camera:string;answer:DiagramSpatialPreviewAnswer;svg?:string}|undefined;
 const historyKey=(values:readonly DiagramPose[],owner:string,known:ReadonlySet<string>)=>{
  let end=values.length;
  // paperStates.spatial and active pose can be separate exact copies at the
  // end. Their own camera changes are not changes to preceding step history.
  while(end&&materialKey(values[end-1])===owner&&known.has(proofKey(values[end-1])))end--;
  return key(values.slice(0,end).map(proofKey));
 };
 const install=(next:DiagramPose,ancestry:readonly DiagramPose[],angle:number)=>{
  // Failure makes the model unavailable until a later successful sync; never
  // render an old paper after rejecting a changed source.
  projector=undefined;cached=undefined;
  const verified=createDiagramSpatialProjector(next,ancestry),owner=materialKey(next),known=new Set([proofKey(next)]);
  for(let i=ancestry.length-1;i>=0&&materialKey(ancestry[i])===owner;i--)known.add(proofKey(ancestry[i]));
  historyProof=historyKey(ancestry,owner,known);material=owner;knownProofs=known;issuedProofs=[];
  presentation=structuredClone(next);rotation=angle;projector=verified;
 };
 const compute=(camera:Camera)=>{
  if(!projector)throw Error('视角模型尚未通过确认，请重新载入。');
  const selected=cameraKey(camera);
  if(cached?.camera===selected)return cached;
  return cached={camera:selected,answer:projector(camera)};
 };
 install(pose,history,drawingRotation);
 return {
  sync(next:DiagramPose,ancestry:readonly DiagramPose[]=[],angle=0):void{
   const owner=materialKey(next);
   if(!projector||owner!==material||!knownProofs.has(proofKey(next))||historyKey(ancestry,owner,knownProofs)!==historyProof){install(next,ancestry,angle);return;}
   presentation=structuredClone(next);rotation=angle;if(cached)cached.svg=undefined;
  },
  frame(camera:Camera):string{
   const entry=compute(camera);
   return entry.svg??=drawingSVG({...presentation,...entry.answer},[],'','',undefined,[],true,defaultDiagramLineDefaults(),[],undefined,undefined,undefined,rotation);
  },
  project(camera:Camera):DiagramSpatialPreviewAnswer{
   const answer=compute(camera).answer,proof=proofKey({...presentation,...answer});
   if(!knownProofs.has(proof)){knownProofs.add(proof);issuedProofs.push(proof);}
   // Only recent issued commit answers need to survive asynchronous UI sync.
   if(issuedProofs.length>4)knownProofs.delete(issuedProofs.shift()!);
   return answer;
  }
 };
}
