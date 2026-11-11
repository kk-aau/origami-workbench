import type {FoldGraph,Point} from '../core/types';
import type {RigidFoldPoint3} from '../core/rigidFoldGeometry';
import type {DiagramSpatialPose} from './diagramSpatialPose';

/** Indices always refer to the source CP, never a coplanar solver's subgraph.
 * This is a failed candidate for inspection, not a verified DiagramPose. */
export interface DiagramSpatialDiagnostic {
  version:1;
  kind:'intersection'|'layer-cycle'|'missing-layer-order'|'layer-conflict';
  message:string;
  faceIds:number[];
  /** A closed, directed path, when a cycle has actually been established. */
  cycle?:number[];
  vertices3D:RigidFoldPoint3[];
  verticesCP:Point[];
  faces:number[][];
  facesHoles?:number[][][];
  /** The same overlap cell lifted onto each involved material face. */
  region?:{faceId:number;vertices3D:RigidFoldPoint3[];verticesCP:Point[]}[];
}

export class DiagramSpatialDiagnosticError extends Error {
  readonly diagnostic:DiagramSpatialDiagnostic;
  constructor(diagnostic:DiagramSpatialDiagnostic){
    super(diagnostic.message);this.name='DiagramSpatialDiagnosticError';this.diagnostic=diagnostic;
  }
}

export function spatialDiagnosticError(source:FoldGraph,spatial:DiagramSpatialPose,issue:Pick<DiagramSpatialDiagnostic,'kind'|'message'|'faceIds'|'cycle'|'region'>):DiagramSpatialDiagnosticError {
  return new DiagramSpatialDiagnosticError(structuredClone({version:1,...issue,
    faceIds:[...new Set(issue.faceIds)],vertices3D:spatial.vertices,verticesCP:source.vertices_coords,
    faces:source.faces_vertices??[],...(source.faces_holes?{facesHoles:source.faces_holes}:{})}));
}

/** Only traverse the supplied local overlap graph. A global cycle can be a
 * valid folded paper and must never be diagnosed as a local contradiction. */
export function findDiagramSpatialCycle(faces:readonly number[],above:ReadonlyMap<number,readonly number[]>):number[]|undefined {
  const allowed=new Set(faces),state=new Map<number,number>();
  for(const start of faces){
    if(state.has(start))continue;
    const stack=[{face:start,next:0}],position=new Map<number,number>([[start,0]]);state.set(start,1);
    while(stack.length){
      const item=stack[stack.length-1],edges=above.get(item.face)??[];
      if(item.next>=edges.length){state.set(item.face,2);position.delete(item.face);stack.pop();continue;}
      const next=edges[item.next++];if(!allowed.has(next))continue;
      if(state.get(next)===1)return [...stack.slice(position.get(next)!).map(row=>row.face),next];
      if(state.has(next))continue;
      position.set(next,stack.length);state.set(next,1);stack.push({face:next,next:0});
    }
  }
}

function isDiagnostic(value:unknown):value is DiagramSpatialDiagnostic {
  if(!value||typeof value!=='object')return false;
  const d=value as DiagramSpatialDiagnostic;
  const points=(rows:unknown,n:number):rows is number[][]=>Array.isArray(rows)&&rows.every(p=>Array.isArray(p)&&p.length===n&&p.every(v=>typeof v==='number'&&Number.isFinite(v)));
  if(d.version!==1||!['intersection','layer-cycle','missing-layer-order','layer-conflict'].includes(d.kind)||typeof d.message!=='string'||!points(d.vertices3D,3)||!points(d.verticesCP,2)||d.vertices3D.length!==d.verticesCP.length||!Array.isArray(d.faces))return false;
  const face=(f:unknown):f is number=>Number.isSafeInteger(f)&&Number(f)>=0&&Number(f)<d.faces.length;
  const ring=(row:unknown):row is number[]=>Array.isArray(row)&&row.length>=3&&row.every(v=>Number.isSafeInteger(v)&&v>=0&&v<d.verticesCP.length);
  if(!d.faces.every(ring)||!Array.isArray(d.faceIds)||!d.faceIds.length||!d.faceIds.every(face))return false;
  if(d.cycle&&(!Array.isArray(d.cycle)||d.cycle.length<3||!d.cycle.every(face)||d.cycle[0]!==d.cycle.at(-1)))return false;
  if(d.facesHoles&&(!Array.isArray(d.facesHoles)||d.facesHoles.length!==d.faces.length||!d.facesHoles.every(rows=>Array.isArray(rows)&&rows.every(ring))))return false;
  return !d.region||Array.isArray(d.region)&&d.region.every(r=>r&&face(r.faceId)&&points(r.vertices3D,3)&&points(r.verticesCP,2)&&r.vertices3D.length===r.verticesCP.length&&r.vertices3D.length>=3);
}

export function getDiagramSpatialDiagnostic(error:unknown):DiagramSpatialDiagnostic|undefined {
  if(!error||typeof error!=='object'||!('diagnostic' in error))return undefined;
  return isDiagnostic(error.diagnostic)?error.diagnostic:undefined;
}

/** Error custom properties are not retained by structured-clone. Send the
 * diagnostic explicitly, and reconstruct the error at every worker boundary. */
export function serializeDiagramSpatialError(error:unknown){
  const message=error instanceof Error?error.message:String(error),diagnostic=getDiagramSpatialDiagnostic(error);
  return {ok:false as const,message,...(diagnostic?{diagnostic}:{})};
}
export function restoreDiagramSpatialError(message:string,diagnostic?:unknown):Error {
  return isDiagnostic(diagnostic)&&diagnostic.message===message?new DiagramSpatialDiagnosticError(diagnostic):new Error(message);
}
