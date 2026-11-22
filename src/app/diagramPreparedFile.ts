import {withDiagramOpenMemo} from '../core/diagramOpenMemo';
import {normalizeImportedDiagramCP} from './diagramCP';
import {prepareDiagramFileSteps,type DiagramProject} from './diagramProject';
import {prepareExistingCreases} from './diagramProjectPreparation';
import type {DiagramCaptionEdits} from './diagramProjectContent';
import {validateDiagramExportSettings} from './diagramExportSettings';

interface SavedCanvas {version:1;digest:string;drawings:[string,string][];complete:boolean}
type FileRecord=DiagramProject&{spatialContactSolutions?:{version?:number;canvas?:SavedCanvas}};

/** The caller verifies the native receipt for these exact source bytes first. */
export async function encodePreparedCaptionEdits(raw:string,edits:DiagramCaptionEdits):Promise<string|undefined>{
  const {spatialContactSolutions:archive,...body}=JSON.parse(raw) as FileRecord;
  if(!archive?.canvas?.complete||archive.canvas.version!==1||!body.steps.some(step=>step.id===edits.activeStepId))return;
  const steps=new Map(body.steps.map(step=>[step.id,step]));
  for(const caption of edits.captions){
    const step=steps.get(caption.id);if(!step)return;
    step.title=caption.title;step.description=caption.description;
  }
  body.name=edits.name;body.activeStepId=edits.activeStepId;
  if(edits.exportSettings===null)delete body.exportSettings;
  else if(edits.exportSettings!==undefined){
    validateDiagramExportSettings(edits.exportSettings);
    body.exportSettings=edits.exportSettings;
  }
  const text=JSON.stringify(body);archive.canvas.digest=await digest(text);
  return text.slice(0,-1)+',"spatialContactSolutions":'+JSON.stringify(archive)+'}';
}

async function digest(text:string):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function drawingInputs(project:DiagramProject,ids:ReadonlySet<string>){
  const states=new Map<string,string>();
  for(const state of project.states)states.set(state.id,await digest(JSON.stringify(state)));
  const entries:[string,string][]=[];
  for(const step of project.steps){
    if(!ids.has(step.id))continue;
    // A saved line depends on the paper and the two CPs in this step. Edits to
    // another page, its caption or an unrelated image cannot invalidate it.
    const pose=step.pose;
    // The CP and rigid transforms bind the angles used to place every stroke.
    // A recomputed diagnostic angle can differ in its last bit across JS engines.
    const drawingPose=pose?.spatial?{...pose,spatial:{...pose.spatial,
      measuredAngles:pose.spatial.measuredAngles.map(angle=>angle!==null&&Math.abs(angle)>1e-5)}}:pose;
    const input=[step.id,states.get(step.beforeId),states.get(step.afterId),drawingPose,step.foldLink,
      step.annotations,step.firstSymbolPlaced,step.paperStates?.active,project.basicSettings?.symbolStyles];
    entries.push([step.id,await digest(JSON.stringify(input))]);
  }
  return entries;
}

/** The document body itself carries prepared geometry, layer order, normalized
 * CPs, step views and editable drawings. Do not store a second geometry bank. */
export async function encodePreparedDiagramFile(project:DiagramProject){
  const completed=new Set<string>(),failed=new Set<string>();
  const {ready,archive}=withDiagramOpenMemo(()=>{
    const file=prepareDiagramFileSteps(project);
    const normalized=normalizeImportedDiagramCP(file.project).project;
    return {ready:prepareExistingCreases(normalized,{completed,failed}),archive:file.archive};
  });
  const {spatialContactSolutions:_old,...body}=ready as FileRecord;
  const text=JSON.stringify(body),drawings=await drawingInputs(body,completed);
  const canvas:SavedCanvas={version:1,digest:await digest(text),drawings,complete:failed.size===0};
  return {text:text.slice(0,-1)+',"spatialContactSolutions":'+JSON.stringify({...archive,version:1,groups:archive?.groups??[],canvas})+'}',complete:canvas.complete};
}

/** A file digest binds authored overlays to all the inputs that placed them.
 * It never certifies solver geometry. Only the native exact-byte, same-build
 * receipt may bypass the geometry path. */
export function inspectPreparedDiagram(value:unknown){
  if(!value||typeof value!=='object')return;
  const {spatialContactSolutions,...project}=value as FileRecord;
  const canvas=spatialContactSolutions?.canvas;
  if(canvas?.version!==1||typeof canvas.complete!=='boolean'||!Array.isArray(canvas.drawings)||
     !canvas.drawings.every(row=>Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&typeof row[1]==='string')||
     typeof canvas.digest!=='string'||canvas.digest.length!==64)return;
  const expected=new Map(canvas.drawings);
  return {project,complete:canvas.complete,
    matches:async(body:DiagramProject)=>(await digest(JSON.stringify(body)))===canvas.digest,
    async matchingDrawings(body:DiagramProject){
      const keys=await drawingInputs(body,new Set(expected.keys()));
      return new Set(keys.filter(([id,key])=>key===expected.get(id)).map(([id])=>id));
    }};

}

