import type {DiagramProject} from './diagramProject';
import {exportDiagramProject} from './diagramProject';
import type {LearningObservation} from './diagramLearning';
import {newLearningDesignTask,type LearningDesignGuide,type LearningDesignRule,type LearningDesignTask} from './diagramLearningDesign';

export interface LearningRecordedAction {guide:LearningDesignGuide;label:string}
/** Only infer conditions backed by a real project change; other demonstrations stay author-confirmed. */
export function recordedLearningTask(before:DiagramProject,after:DiagramProject,actions:LearningRecordedAction[],message:string,observation:LearningObservation):LearningDesignTask {
 const current=after.steps.find(s=>s.id===after.activeStepId)!,previous=before.steps.find(s=>s.id===before.activeStepId)!;
 const existing=new Set(before.steps.flatMap(s=>s.annotations?.map(a=>a.id)??[]));
 const line=current.annotations?.find(a=>a.kind==='line'&&!a.id.startsWith('cp-existing:')&&!existing.has(a.id));
 let rule:LearningDesignRule={kind:'manual'},guide:LearningDesignGuide=actions[0]?.guide??{kind:'none'};
 if(after.steps.findIndex(s=>s.id===after.activeStepId)>before.steps.findIndex(s=>s.id===before.activeStepId)){
  if(current.pose?.result.layers.status!=='solved')throw Error('折图还在计算，请等结果出来后再记为一步。');
  rule={kind:'next'};
 }else if(line?.kind==='line'){
  rule={kind:'line'};guide={kind:'line',points:[line.a,line.b],tool:'line'};
 }else if(current.foldLink?.fixed&&JSON.stringify(current.foldLink.fixed)!==JSON.stringify(previous.foldLink?.fixed)){
  rule={kind:'fixed',expected:structuredClone(current.foldLink.fixed)};
 }else if(observation.selectedLineCount===0&&current.foldLink&&(current.foldLink.layers!==previous.foldLink?.layers||JSON.stringify(current.foldLink.selectedFaces)!==JSON.stringify(previous.foldLink?.selectedFaces))){
  rule={kind:'scope',expected:{layers:current.foldLink.layers,faces:[...current.foldLink.selectedFaces]}};
 }else if(actions.length&&(actions.every(a=>a.guide.kind==='cp-face'||a.guide.kind==='control'&&a.guide.control.tag==='button')||JSON.stringify(before)===JSON.stringify(after)))rule={kind:'click'};
 const description=message.trim()||actions.map(a=>a.label).filter(Boolean).join('，')||'观察当前纸面，确认后继续。';
 return {...newLearningDesignTask(),title:description.slice(0,24),message:description,scene:exportDiagramProject(before),guide,rule,route:actions.map(a=>a.guide),demo:{after:exportDiagramProject(after)}};
}
