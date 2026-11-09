import type {DiagramAnnotation,DiagramSymbolAnnotation} from './diagramAnnotations';
import {cadAttributeDefinitions} from './diagramCadSymbols';
import type {DiagramProject,DiagramStep} from './diagramProject';

const isReturn=(annotation:DiagramAnnotation):annotation is DiagramSymbolAnnotation=>annotation.kind==='symbol'&&annotation.symbol==='return';
const annotationSets=(step:DiagramStep)=>([step.annotations,step.paperStates?.flatAnnotations,step.paperStates?.spatialAnnotations]).filter((annotations):annotations is DiagramAnnotation[]=>!!annotations);
const stepLabel=(step:DiagramStep,index:number)=>`第 ${index+1} 步${step.title.trim()?`「${step.title.trim().slice(0,60)}」`:''}`;
function targetId(steps:readonly DiagramStep[],indexes:ReadonlyMap<string,number>,index:number,annotations:readonly DiagramAnnotation[]):string|null {
  const targets=new Set<string>();
  for(const annotation of annotations){
    if(!isReturn(annotation)||annotation.returnStepId===undefined)continue;
    const target=indexes.get(annotation.returnStepId),label=stepLabel(steps[index],index);
    if(target===undefined)throw new Error(`${label}的返回目标已不存在，请重新选择返回步骤。`);
    if(target>=index)throw new Error(`${label}只能返回此前的步骤，不能返回本步或后续步骤。`);
    targets.add(annotation.returnStepId);
  }
  if(targets.size>1)throw new Error(`${stepLabel(steps[index],index)}设置了多个不同的返回目标，请保留一个目标步骤。`);
  return targets.values().next().value??null;
}

/** Only an explicit bound return symbol changes progression. Never infer an
 * instruction from a legacy numeric label or the symbol's repeat count. */
export function getDiagramReturnTarget(project:DiagramProject,stepId:string):DiagramStep|null {
  const indexes=new Map(project.steps.map((step,index)=>[step.id,index])),index=indexes.get(stepId);
  if(index===undefined)throw new Error('指定的折序步骤不存在。');
  const id=targetId(project.steps,indexes,index,project.steps[index].annotations??[]);
  return id===null?null:project.steps[indexes.get(id)!];
}

/** Archived annotation variants are also persisted inputs, not a way to keep
 * dangling or forward references hidden from the project's trust boundary. */
export function validateDiagramReturnReferences(project:DiagramProject):void {
  const indexes=new Map(project.steps.map((step,index)=>[step.id,index]));
  project.steps.forEach((step,index)=>{for(const annotations of annotationSets(step))targetId(project.steps,indexes,index,annotations);});
}

/** Retain the chosen identity and refresh its presentation number. The same
 * text feeds the drawing, cached thumbnails, PDF panels and exported images. */
export function syncDiagramReturnLabels(project:DiagramProject):DiagramProject {
  validateDiagramReturnReferences(project);
  const indexes=new Map(project.steps.map((step,index)=>[step.id,index])),attribute=cadAttributeDefinitions('return').find(item=>item.editable)?.key;
  function labels(annotations:DiagramAnnotation[]|undefined):DiagramAnnotation[]|undefined {
    if(!annotations)return annotations;let changed=false;
    const next=annotations.map(annotation=>{
      if(!isReturn(annotation)||annotation.returnStepId===undefined)return annotation;
      const text=String(indexes.get(annotation.returnStepId)!+1);
      if(annotation.text===text&&(!attribute||annotation.cadAttributes?.[attribute]===text))return annotation;
      changed=true;return {...annotation,text,...(attribute?{cadAttributes:{...annotation.cadAttributes,[attribute]:text}}:{})};
    });
    return changed?next:annotations;
  }
  let changed=false;
  const steps=project.steps.map(step=>{
    const annotations=labels(step.annotations),flatAnnotations=labels(step.paperStates?.flatAnnotations),spatialAnnotations=labels(step.paperStates?.spatialAnnotations);
    if(annotations===step.annotations&&flatAnnotations===step.paperStates?.flatAnnotations&&spatialAnnotations===step.paperStates?.spatialAnnotations)return step;
    changed=true;return {...step,...(annotations?{annotations}:{}),...(step.paperStates?{paperStates:{...step.paperStates,...(flatAnnotations?{flatAnnotations}:{}),...(spatialAnnotations?{spatialAnnotations}:{})}}:{})};
  });
  return changed?{...project,steps}:project;
}

/** Return references belong to the current symbols across paper modes. Copy
 * only instruction fields into cached artwork, retaining its old coordinates. */
export function syncDiagramReturnAnnotationCaches(step:DiagramStep):DiagramStep {
  if(!step.paperStates)return step;
  const current=new Map((step.annotations??[]).filter(isReturn).map(annotation=>[annotation.id,annotation]));
  function sync(annotations:DiagramAnnotation[]|undefined):DiagramAnnotation[]|undefined {
    if(!annotations)return annotations;let changed=false;
    const next=annotations.flatMap<DiagramAnnotation>(annotation=>{
      if(!isReturn(annotation))return [annotation];
      const live=current.get(annotation.id);if(!live){changed=true;return [];}
      if(annotation.returnStepId===live.returnStepId&&annotation.text===live.text&&JSON.stringify(annotation.cadAttributes)===JSON.stringify(live.cadAttributes))return [annotation];
      changed=true;const result={...annotation};delete result.returnStepId;delete result.text;delete result.cadAttributes;
      if(live.returnStepId!==undefined)result.returnStepId=live.returnStepId;
      if(live.text!==undefined)result.text=live.text;
      if(live.cadAttributes!==undefined)result.cadAttributes={...live.cadAttributes};
      return [result];
    });
    return changed?next:annotations;
  }
  const paper=step.paperStates,flatAnnotations=sync(paper.flatAnnotations),spatialAnnotations=sync(paper.spatialAnnotations);
  return flatAnnotations===paper.flatAnnotations&&spatialAnnotations===paper.spatialAnnotations?step:{...step,paperStates:{...paper,...(flatAnnotations?{flatAnnotations}:{}),...(spatialAnnotations?{spatialAnnotations}:{})}};
}

export function assertDiagramReturnTargetRemovable(project:DiagramProject,targetStepId:string):void {
  const references=project.steps.flatMap((step,index)=>step.id!==targetStepId&&annotationSets(step).some(annotations=>annotations.some(annotation=>isReturn(annotation)&&annotation.returnStepId===targetStepId))?[stepLabel(step,index)]:[]);
  if(references.length)throw new Error(`无法删除：${references.join('、')}的返回符号引用了此步骤，请先清除或修改返回目标。`);
}
