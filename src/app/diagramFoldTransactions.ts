import type {Doc,Point,Segment} from '../core/types';
import {setDiagramStartingFace as setStartingFace} from './diagramFoldSettings';
import {normalizeDiagramCP} from './diagramCP';
import {updateDiagramAnnotations,updateDiagramCP,updateDiagramFoldLink,type DiagramProject,type DiagramPose,type DiagramCPState} from './diagramProject';
import {isDiagramCPExistingLine,isDiagramCPLine,type DiagramAnnotation,type DiagramLineAnnotation} from './diagramAnnotations';
import type {DiagramFoldLinkSettings,DiagramFoldPreviewSegment} from './diagramFoldLinkTypes';
import {diagramFoldBackgroundLines,diagramFoldPreviewAttributes,diagramFoldPreviewAppearanceSegments} from './diagramDrawing';
import {modelProjection} from './modelProjection';
import type {ModelViewState} from './modelViewState';
import {defaultDiagramStrokePattern,defaultDiagramLineDefaults} from './diagramLineStyles';
import {applyDiagramFoldSegments,diffDiagramFoldCP,subtractDiagramFoldSegments,intersectDiagramFoldSegments,retainDiagramPrecreaseIntents,mapDiagramFoldLines,projectDiagramFoldCP,diagramFoldStartingFace} from './diagramFoldLink';

export const defaultDiagramFoldLink=():DiagramFoldLinkSettings=>({enabled:false,layers:'top',selectedFaces:[]});
export const isLinkedFoldLine=(a:DiagramAnnotation):a is DiagramLineAnnotation=>a.kind==='line'&&(a.style==='valley'||a.style==='mountain');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function context(project:DiagramProject,stepId:string){
  const step=project.steps.find(s=>s.id===stepId);if(!step)throw new Error('找不到折叠步骤。');
  const before=project.states.find(s=>s.id===step.beforeId)!,after=project.states.find(s=>s.id===step.afterId)!;
  if(!step.pose||step.pose.sourceStateId!==before.id)throw new Error('请先计算操作前 CP，再联动本步折线。');
  return {step,before,after,pose:step.pose};
}
function cleanFixed(doc:Doc,settings:DiagramFoldLinkSettings):Doc {
  return settings.fixed?setStartingFace(doc,diagramFoldStartingFace(doc,settings.fixed)):doc;
}

/** Rebuild editable operation handles without changing physical CP rendering.
 * The ordinary preview intentionally displays only actual changes/F marks.
 * A private projection adds unchanged old-MV instructions to the saved handles,
 * so refreshing/adopting cannot discard a lower layer's return instruction. */
function operationPreview(pose:DiagramPose,before:DiagramCPState,after:Doc,precreases:Segment[]=[],annotations:DiagramAnnotation[]=[]){
  const retained=retainDiagramPrecreaseIntents(before.doc,after,precreases),mapped=projectDiagramFoldCP(pose,before.doc,after,before,retained);
  const returning=intersectDiagramFoldSegments(after,retained,after.segments.filter(s=>s.assignment==='M'||s.assignment==='V'));
  if(!returning.length)return mapped;
  const probe:Doc={...after,segments:[...after.segments.filter(s=>s.assignment==='B').map((s,i)=>({...s,id:`return-probe-boundary-${i}`})),
    ...returning.map((s,i)=>({...s,id:`return-probe-mark-${i}`,assignment:'F' as const,angle:0}))]};
  const extra=projectDiagramFoldCP(pose,before.doc,probe,before,returning);
  // In the private F probe an unchanged MV hinge looks like an unfolding.
  // The authoritative after CP still keeps that MV: present its retained
  // press-and-return intent as a precrease, rather than dropping this bank.
  const parts=extra.preview.filter(part=>part.existing===false||part.unfolding)
    .map(part=>part.unfolding?{...part,existing:false,unfolding:false}:part);
  const eps=Math.max(1e-6,Math.max(before.doc.paper.width,before.doc.paper.height)*1e-8);
  const overlaps=(a:{a:Point;b:Point},b:{a:Point;b:Point})=>{
    const dx=a.b[0]-a.a[0],dy=a.b[1]-a.a[1],length=Math.hypot(dx,dy);if(length<=eps)return false;
    if([b.a,b.b].some(p=>Math.abs(dx*(p[1]-a.a[1])-dy*(p[0]-a.a[0]))>eps*length))return false;
    const along=(p:Point)=>((p[0]-a.a[0])*dx+(p[1]-a.a[1])*dy)/length;
    return Math.min(length,Math.max(along(b.a),along(b.b)))-Math.max(0,Math.min(along(b.a),along(b.b)))>eps;
  };
  const covered=(part:DiagramFoldPreviewSegment)=>annotations.some(a=>{
    if(a.kind!=='line'||a.foldAction!=='precrease'||a.foldFaces&&!a.foldFaces.includes(part.face)||!overlaps(a,part))return false;
    // Explicit material ownership survives a front/back paint change. Screen
    // style alone cannot discard a selected returning bank of the same hinge.
    if(a.style!==part.style&&!a.foldFaces?.includes(part.face))return false;
    const dx=a.b[0]-a.a[0],dy=a.b[1]-a.a[1],length=Math.hypot(dx,dy);
    return [part.a,part.b].every(p=>{const t=((p[0]-a.a[0])*dx+(p[1]-a.a[1])*dy)/length;return t>=-eps&&t<=length+eps;});
  });
  // The same old hinge has two material banks. Keep the bank(s) explicitly
  // chosen by an existing handle; only ledger-only imports need both projected
  // possibilities reconstructed. Never manufacture an extra selected layer.
  const owned=parts.filter(covered),extraPreview=parts.filter(part=>covered(part)||!owned.some(other=>overlaps(part,other)));
  return {preview:[...mapped.preview,...extraPreview],warnings:[...new Set([...mapped.warnings,...extra.warnings])]};
}

/** One history transaction: remove only the previously owned geometry, restore
 * source creases covered by reassignment, and map the current drawing again. */
export function reconcileDiagramFoldAnnotations(project:DiagramProject,stepId:string,annotations:DiagramAnnotation[],settings?:DiagramFoldLinkSettings):DiagramProject {
  const original=project.steps.find(s=>s.id===stepId)!;
  const config=settings??original.foldLink??defaultDiagramFoldLink();
  if(!config.enabled)return updateDiagramAnnotations(project,stepId,annotations);
  if(!settings&&same((original.annotations??[]).filter(isLinkedFoldLine),annotations.filter(isLinkedFoldLine)))return updateDiagramAnnotations(project,stepId,
    [...annotations.filter(a=>!isDiagramCPExistingLine(a)),...(original.annotations??[]).filter(isDiagramCPExistingLine)]);
  const {before,after,pose}=context(project,stepId);
  // CP-authored F lines are existing routes, not editable drawing operations.
  // Only F coverage with a retained precrease intent belongs to this step.
  const ledger=config.generated??[],owned=[...ledger.filter(s=>s.assignment!=='F'),
    ...intersectDiagramFoldSegments(after.doc,ledger.filter(s=>s.assignment==='F'),config.precreases??[])];
  let baseline=subtractDiagramFoldSegments(after.doc,owned);
  if(owned.length){
    const uncovered=subtractDiagramFoldSegments(before.doc,owned,false);
    const restore=diffDiagramFoldCP(uncovered,before.doc);
    baseline=applyDiagramFoldSegments(baseline,restore);
  }
  const mappedSegments:Segment[]=[],intent:Segment[]=[],nextAnnotations=annotations.filter(a=>!isDiagramCPExistingLine(a)).map(annotation=>{
    if(!isLinkedFoldLine(annotation))return annotation;
    const effective=annotation.foldFaces?{...config,layers:'selected' as const,selectedFaces:annotation.foldFaces}:config;
    // An explicitly empty material range is a dormant crease. Keep its drawing
    // handle, but remove previously generated CP geometry until a range is
    // explicitly reapplied. Ordinary movement must not activate other layers.
    if(annotation.foldFaces&&!annotation.foldFaces.length)return annotation;
    const mapped=mapDiagramFoldLines(pose,[annotation],effective,before);
    mappedSegments.push(...mapped.segments);
    intent.push(...mapped.precreases);
    // Existing linked creases retain their material identities even when moved
    // temporarily outside the paper. Newly drawn creases capture only faces
    // actually included by the chosen layer range, after clipping/filtering.
    const faces=[...new Set(mapped.preview.map(part=>part.face))].sort((a,b)=>a-b);
    return !annotation.foldFaces&&faces.length?{...annotation,foldFaces:faces}:annotation;
  });
  // A precrease never unfolds a previously folded edge. Actual folds drawn in
  // this step also take precedence over a coincident precrease instruction.
  const active=mappedSegments.filter(s=>s.assignment!=='F'),flat=mappedSegments.filter(s=>s.assignment==='F');
  const retained=subtractDiagramFoldSegments({...baseline,segments:flat},[...baseline.segments.filter(s=>['M','V','U'].includes(s.assignment)),...active],false).segments;
  const normalized=normalizeDiagramCP(applyDiagramFoldSegments(baseline,[...retained,...active]));
  if(normalized.conflicts)throw new Error('映射折线与现有 CP 赋型冲突，请检查作用纸层。');
  const doc=cleanFixed(normalized.doc,config),generated=diffDiagramFoldCP(baseline,doc).filter(s=>['M','V','U','F'].includes(s.assignment));
  const precreases=retainDiagramPrecreaseIntents(before.doc,doc,intent);
  const inherited=projectDiagramFoldCP(pose,before.doc,doc,before,precreases).preview.filter(p=>p.existing);
  let next=updateDiagramAnnotations(project,stepId,[...nextAnnotations,...previewAnnotations(inherited,stepId,(original.annotations??[]).filter(isDiagramCPExistingLine),nextAnnotations.map(a=>a.id))]);
  if(!same(after.doc,doc))next=updateDiagramCP(next,after.id,doc);
  return updateDiagramFoldLink(next,stepId,{...config,drawingVersion:1,generated,...(intent.length||config.precreases?{precreases}:{})});
}

/** The layer picker edits either the selection or the defaults for future
 * strokes. Never interpret an empty UI selection as selecting the whole step. */
export function changeDiagramFoldLayerScope(project:DiagramProject,stepId:string,settings:DiagramFoldLinkSettings,annotationIds:readonly string[]=[]):DiagramProject {
  const step=project.steps.find(s=>s.id===stepId);if(!step)throw new Error('找不到折叠步骤。');
  const previous=step.foldLink??defaultDiagramFoldLink();
  if(annotationIds.length){
    const next=reapplyDiagramFoldLayerScope(project,stepId,settings,annotationIds);
    const applied=next.steps.find(s=>s.id===stepId)!;
    // Editing selected handles does not change the next stroke's defaults.
    return updateDiagramFoldLink(next,stepId,{...applied.foldLink!,layers:previous.layers,selectedFaces:previous.selectedFaces});
  }
  let next=project;
  if(previous.enabled&&(step.annotations??[]).some(a=>isLinkedFoldLine(a)&&!a.foldFaces)){
    const {pose,before}=context(project,stepId);
    // Bind legacy unowned handles under the OLD defaults, so drawing another
    // line later cannot accidentally reinterpret them under the new range.
    const annotations=step.annotations!.map(annotation=>{
      if(!isLinkedFoldLine(annotation)||annotation.foldFaces)return annotation;
      const preview=previous.layers==='selected'&&!previous.selectedFaces.length?[]:mapDiagramFoldLines(pose,[annotation],previous,before).preview;
      return {...annotation,foldFaces:[...new Set(preview.map(part=>part.face))].sort((a,b)=>a-b)};
    });
    next=updateDiagramAnnotations(next,stepId,annotations);
  }
  // Changing only a default leaves CP data/revisions, generated geometry and
  // saved poses intact; no reconcile or whole-step geometry rebuild is needed.
  return updateDiagramFoldLink(next,stepId,settings);
}

/** Explicitly apply the current layer range to existing M/V drawing handles.
 * A nonempty ID list targets those handles only; no IDs targets the whole step.
 * Unlike a normal move, this discards the targets' previous material identity,
 * including identities imported from a single-layer CP edit. */
export function reapplyDiagramFoldLayerScope(project:DiagramProject,stepId:string,settings:DiagramFoldLinkSettings,annotationIds:readonly string[]=[]):DiagramProject {
  const step=project.steps.find(s=>s.id===stepId);if(!step)throw new Error('找不到折叠步骤。');
  if(!settings.enabled)return updateDiagramFoldLink(project,stepId,settings);
  const {before,pose}=context(project,stepId);
  // Even clearing the selected range is a CP edit. Verify the current drawing
  // is rigid before restoring/removing any owned CP segments.
  mapDiagramFoldLines(pose,[],{...settings,layers:'all'},before);
  const ids=new Set(annotationIds),targets=new Set((step.annotations??[]).filter(isLinkedFoldLine).filter(a=>!ids.size||ids.has(a.id)).map(a=>a.id));
  const previous=step.foldLink??defaultDiagramFoldLink();
  // Legacy handles without a material ledger still belong to the old range.
  // Capture that range before changing defaults for the targeted handles.
  const unbound=(step.annotations??[]).some(a=>isLinkedFoldLine(a)&&!targets.has(a.id)&&!a.foldFaces);
  const oldContext=unbound?context(project,stepId):undefined;
  const annotations=(step.annotations??[]).map(annotation=>{
    if(!isLinkedFoldLine(annotation))return annotation;
    if(targets.has(annotation.id)){
      const {foldFaces:_oldFaces,...line}=annotation;
      return settings.layers==='selected'&&!settings.selectedFaces.length?{...line,foldFaces:[]}:line;
    }
    if(annotation.foldFaces||!oldContext)return annotation;
    const preview=previous.layers==='selected'&&!previous.selectedFaces.length?[]:mapDiagramFoldLines(oldContext.pose,[annotation],previous,oldContext.before).preview;
    return {...annotation,foldFaces:[...new Set(preview.map(part=>part.face))].sort((a,b)=>a-b)};
  });
  const next=reconcileDiagramFoldAnnotations(project,stepId,annotations,settings);
  // A crease may lie outside the currently chosen paper faces. Preserve that
  // explicit empty range as well, rather than falling back to future defaults.
  const applied=next.steps.find(s=>s.id===stepId)!;
  return updateDiagramAnnotations(next,stepId,(applied.annotations??[]).map(a=>isLinkedFoldLine(a)&&targets.has(a.id)&&!a.foldFaces?{...a,foldFaces:[]}:a));
}

const pointKey=(p:Point)=>p.map(n=>Math.round(n*1e7)/1e7).join(',');
const drawingLineKey=(style:string,a:Point,b:Point)=>style+'|'+[pointKey(a),pointKey(b)].sort().join('|');
function previewAnnotations(preview:DiagramFoldPreviewSegment[],stepId:string,previous:DiagramLineAnnotation[]=[],reservedIds:readonly string[]=[]):DiagramLineAnnotation[]{
  const seen=new Map<string,DiagramLineAnnotation>();const result:DiagramLineAnnotation[]=[],authoredPaint=defaultDiagramLineDefaults();
  for(const line of diagramFoldPreviewAppearanceSegments(preview,previous)){
    const style=line.style??(line.assignment==='V'?'valley':line.assignment==='M'?'mountain':'crease');
    const precrease=line.assignment==='F'&&!line.existing&&(style==='valley'||style==='mountain');
    const attributes=diagramFoldPreviewAttributes({...line,style},previous,line.existing&&!line.unfolding?'#8d9b92':'#293d35',authoredPaint);
    const key=drawingLineKey(style,line.a,line.b)+(line.existing?'|existing':precrease?'|precrease':'|fold')+`|${line.foldAngle===undefined?180:line.foldAngle}|${attributes.color}|${attributes.width}|${attributes.strokePattern??''}|${attributes.appearanceOverrides?.join(',')??''}`;
    const existing=seen.get(key);
    if(existing){if(!existing.foldFaces!.includes(line.face))existing.foldFaces!.push(line.face);continue;}
    const annotation:DiagramLineAnnotation={id:`${line.existing?'cp-existing':'cp-link'}:${stepId}:${result.length}`,kind:'line',a:[...line.a],b:[...line.b],style,color:attributes.color,width:attributes.width,foldFaces:[line.face],...(attributes.strokePattern?{strokePattern:attributes.strokePattern}:{}),...(attributes.appearanceOverrides?{appearanceOverrides:attributes.appearanceOverrides}:{}),...(precrease?{foldAction:'precrease' as const}:{})};
    if((style==='valley'||style==='mountain')&&line.foldAngle!==undefined)annotation.foldAngle=line.foldAngle;
    seen.set(key,annotation);result.push(annotation);
  }
  for(const annotation of result)annotation.foldFaces!.sort((a,b)=>a-b);
  const used=new Set(reservedIds);let suffix=0;
  for(const annotation of result){
    while(used.has(annotation.id))annotation.id=`${isDiagramCPExistingLine(annotation)?'cp-existing':'cp-link'}:${stepId}:${suffix++}`;
    used.add(annotation.id);
  }
  // Camera exchanges and CP refreshes can split/rebuild handles. Preserve the
  // authored clock by matching material-scoped geometry, then remap references
  // to the rebuilt handles instead of retaining a stale drawing-array index.
  if(!previous.some(line=>line.animationTiming))return result;
  const eps=1e-6,near=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=eps;
  const contains=(outer:DiagramLineAnnotation,inner:DiagramLineAnnotation)=>{
    const dx=outer.b[0]-outer.a[0],dy=outer.b[1]-outer.a[1],den=dx*dx+dy*dy;
    return [inner.a,inner.b].every(p=>{
      const t=((p[0]-outer.a[0])*dx+(p[1]-outer.a[1])*dy)/den;
      return t>=-eps&&t<=1+eps&&Math.abs((p[0]-outer.a[0])*dy-(p[1]-outer.a[1])*dx)<=eps*Math.sqrt(den);
    });
  };
  const origins=new Map<string,DiagramLineAnnotation>(),replacements=new Map<string,DiagramLineAnnotation[]>();
  for(const annotation of result){
    const candidates=previous.filter(old=>old.style===annotation.style&&(old.foldAction??'fold')===(annotation.foldAction??'fold')&&
      (!old.foldFaces||annotation.foldFaces!.some(f=>old.foldFaces!.includes(f)))&&contains(old,annotation));
    candidates.sort((a,b)=>Number(near(b.a,annotation.a)&&near(b.b,annotation.b)||near(b.a,annotation.b)&&near(b.b,annotation.a))-Number(near(a.a,annotation.a)&&near(a.b,annotation.b)||near(a.a,annotation.b)&&near(a.b,annotation.a))||Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1])-Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1]));
    const old=candidates[0];if(!old)continue;
    origins.set(annotation.id,old);replacements.set(old.id,[...(replacements.get(old.id)??[]),annotation]);
  }
  for(const annotation of result){
    const timing=origins.get(annotation.id)?.animationTiming;if(!timing)continue;
    const reference=replacements.get(timing.afterLineId)?.[0];
    if(reference&&reference.id!==annotation.id)annotation.animationTiming={...timing,afterLineId:reference.id};
  }
  return result;
}

/** Reproject editable line handles after a camera-side/model rotation change,
 * without touching CP revisions or ownership. */
export function prepareDiagramFoldDrawing(project:DiagramProject,stepId:string,previousView?:ModelViewState,preserveDrawing=false):DiagramAnnotation[] {
  const {step,before,after,pose}=context(project,stepId);
  let annotations=step.annotations??[];
  if(previousView){
    const from=modelProjection(pose.result.geometry.vertices,previousView.side==='back',previousView.rotation,previousView?.projectionCenter),view=pose.view,to=modelProjection(pose.result.geometry.vertices,view?.side==='back',view?.rotation??0,view?.projectionCenter),zero=from.project([0,0]);
    const project=(p:Point)=>to.project(from.unprojectDelta([p[0]-zero[0],p[1]-zero[1]]));
    const reversed=previousView.side!==(view?.side??'front');
    annotations=annotations.map(a=>{
      if(a.kind!=='line'||!isLinkedFoldLine(a)&&!isDiagramCPLine(a)||a.foldFaces?.length===0)return a;
      const style=reversed&&a.style==='valley'?'mountain':reversed&&a.style==='mountain'?'valley':a.style;
      // Standard M/V paint follows the viewed fold direction. Explicit custom
      // patterns stay attached to the source drawing; legacy omissions stay omitted.
      const standard=!a.appearanceOverrides?.includes('strokePattern')&&a.strokePattern!==undefined&&a.strokePattern===defaultDiagramStrokePattern(a.style);
      return {...a,a:project(a.a),b:project(a.b),style,...(style!==a.style&&standard?{strokePattern:defaultDiagramStrokePattern(style)}:{})};
    });
  }
  const mapped=operationPreview(pose,before,after.doc,step.foldLink?.precreases,annotations);
  // Loading, camera changes and layer-only analysis do not change the CP or
  // paper geometry. Rebuilding current operations here would discard long
  // handles, their selected paper faces and animation references. Regenerate
  // only inherited F marks; real CP/geometry edits keep the rebuild path below.
  const current=step.foldLink?.drawingVersion===1;
  if((previousView||preserveDrawing)&&current){
    const keep=annotations.filter(a=>!isDiagramCPExistingLine(a));
    return [...keep,...previewAnnotations(mapped.preview.filter(part=>part.existing),stepId,annotations.filter(isDiagramCPExistingLine),keep.map(a=>a.id))];
  }
  const keep=[...annotations.filter(a=>isLinkedFoldLine(a)?a.foldFaces?.length===0:!isDiagramCPLine(a)),...diagramFoldBackgroundLines(pose,annotations)];
  return [...keep,...previewAnnotations(mapped.preview,stepId,annotations.filter((a):a is DiagramLineAnnotation=>a.kind==='line'),keep.map(a=>a.id))];
}
export function refreshDiagramFoldDrawing(project:DiagramProject,stepId:string,previousView?:ModelViewState,preserveDrawing=false):DiagramProject {
  return updateDiagramAnnotations(project,stepId,prepareDiagramFoldDrawing(project,stepId,previousView,preserveDrawing));
}

/** Explicitly present the authoritative after CP on this step's before pose.
 * Unlike adopting/recalculating a model, this writes neither CP state nor any
 * pose coordinate, layer order or source revision. Capture the generated ledger
 * so subsequent drawing edits retain the same CP ownership. */
export function updateDiagramFoldDrawingFromCP(project:DiagramProject,stepId:string):DiagramProject {
  const {step,before,after,pose}=context(project,stepId),settings=step.foldLink??defaultDiagramFoldLink();
  if(step.paperStates?.active==='pulled')throw new Error('请切回平整状态或立体状态后再更新主图折痕。');
  if(normalizeDiagramCP(after.doc).conflicts)throw new Error('操作后 CP 有重叠赋型冲突，请先处理再更新主图折痕。');
  // Validate flat-paper rigidity and the current source before producing any
  // new handle. This also rejects legacy pulled poses without a state archive.
  mapDiagramFoldLines(pose,[],{...settings,enabled:true},before);
  const precreases=retainDiagramPrecreaseIntents(before.doc,after.doc,settings.precreases??[]);
  const mapped=operationPreview(pose,before,after.doc,precreases,step.annotations??[]);
  const keep=[...(step.annotations??[]).filter(a=>isLinkedFoldLine(a)?a.foldFaces?.length===0:!isDiagramCPLine(a)),...diagramFoldBackgroundLines(pose,step.annotations??[])];
  const changed=diffDiagramFoldCP(before.doc,after.doc),generated=[...changed.filter(s=>['M','V','U'].includes(s.assignment)),
    ...intersectDiagramFoldSegments(after.doc,changed.filter(s=>s.assignment==='F'),precreases)];
  const next=updateDiagramAnnotations(project,stepId,[...keep,...previewAnnotations(mapped.preview,stepId,(step.annotations??[]).filter((a):a is DiagramLineAnnotation=>a.kind==='line'),keep.map(a=>a.id))]);
  return updateDiagramFoldLink(next,stepId,{...settings,enabled:true,generated,...(settings.precreases?{precreases}:{})});
}

/** CP is authoritative on a CP edit. Its difference supplies editable drawing
 * lines; symbols and ordinary construction marks retain their identities. */
export function prepareDiagramFoldCPAdoption(project:DiagramProject,stepId:string,doc:Doc){
  const {step,before,after,pose}=context(project,stepId),settings=step.foldLink??defaultDiagramFoldLink();
  const normalized=normalizeDiagramCP(doc);if(normalized.conflicts)throw new Error('操作后 CP 有重叠赋型冲突，请先处理再应用。');
  const prepared=cleanFixed(normalized.doc,settings);
  const precreases=retainDiagramPrecreaseIntents(before.doc,prepared,settings.precreases??[]);
  const mapped=operationPreview(pose,before,prepared,precreases,step.annotations??[]);
  const keep=[...(step.annotations??[]).filter(a=>isLinkedFoldLine(a)?a.foldFaces?.length===0:!isDiagramCPLine(a)),...diagramFoldBackgroundLines(pose,step.annotations??[])];
  const annotations=[...keep,...previewAnnotations(mapped.preview,stepId,(step.annotations??[]).filter((a):a is DiagramLineAnnotation=>a.kind==='line'),keep.map(a=>a.id))];
  const changed=diffDiagramFoldCP(before.doc,prepared),generated=[...changed.filter(s=>['M','V','U'].includes(s.assignment)),
    ...intersectDiagramFoldSegments(prepared,changed.filter(s=>s.assignment==='F'),precreases)];
  return {doc:prepared,changed:!same(after.doc,prepared),annotations,settings:{...settings,generated,...(settings.precreases?{precreases}:{})}};
}
export function adoptDiagramFoldCP(project:DiagramProject,stepId:string,doc:Doc):DiagramProject {
  const answer=prepareDiagramFoldCPAdoption(project,stepId,doc),{after}=context(project,stepId);
  let next=answer.changed?updateDiagramCP(project,after.id,answer.doc):project;
  next=updateDiagramAnnotations(next,stepId,answer.annotations);
  return updateDiagramFoldLink(next,stepId,answer.settings);
}


/** Simulation measures this operation's target creases, not its displayed start pose. */
export function applyDiagramSimulationFoldAngles(project:DiagramProject,stepId:string,doc:Doc):DiagramProject {
  const step=project.steps.find(s=>s.id===stepId);if(!step)throw Error('找不到要应用折角的步骤。');
  if(step.foldLink?.enabled){
    if(step.pose?.sourceStateId!==step.beforeId)throw Error('请先恢复操作前折图，再应用本步折角。');
    return adoptDiagramFoldCP(project,stepId,doc);
  }
  return updateDiagramCP(project,step.afterId,doc);
}
