import {diagramBranchTree,selectDiagramBranchStep,type DiagramProject} from './diagramProject';
import {diagramBranchNumbering} from './diagramBranches';
import type {DiagramPanelRef} from './diagramPDFLayout';
import type {DiagramPDFBranchNode} from './diagramPDFBranchLayout';
import {diagramPDFRibbonNodeId} from './diagramPDFSeams';

const routes=new WeakMap<DiagramProject,Map<string,DiagramProject>>();

/** Resolve each branch against its own ancestors for zoom, CP and layer history. */
export function diagramPanelRoute(project:DiagramProject,ref:DiagramPanelRef):DiagramProject {
  const id=ref.branchStepId;
  if(!id||project.steps[ref.stepIndex]?.id===id)return project;
  let cache=routes.get(project);
  if(!cache){cache=new Map();routes.set(project,cache);}
  let route=cache.get(id);
  if(!route){
    route=selectDiagramBranchStep(project,id);
    for(let i=0;i<route.steps.length;i++){
      const step=route.steps[i];
      if(project.steps[i]?.id!==step.id&&!cache.has(step.id))cache.set(step.id,route);
    }
  }
  return route;
}

export function diagramPDFBranchPanels(project:DiagramProject){
  const nodes:DiagramPDFBranchNode[]=[],refs=new Map<string,DiagramPanelRef>();
  const root=diagramBranchTree(project);
  const {stepLabels}=diagramBranchNumbering(project);
  const pending=[{node:root,parentId:''}];
  while(pending.length){
    const {node,parentId}=pending.pop()!;
    const step=node.step,stepIndex=node.depth,branchLabel=stepLabels.get(step.id)!;
    const ref={stepIndex,branchStepId:step.id,branchLabel};
    const id=diagramPDFRibbonNodeId(step.id);
    nodes.push({id,parentId:parentId||null,stepIndex});refs.set(id,ref);
    let last=id;
    for(const [figureIndex,figure] of (step.processFigures??[]).entries()){
      const figureId=diagramPDFRibbonNodeId(step.id,figure.activeStepId);
      nodes.push({id:figureId,parentId:last,stepIndex,figureIndex});
      refs.set(figureId,{...ref,figureIndex});last=figureId;
    }
    for(let i=node.children.length-1;i>=0;i--){
      pending.push({node:node.children[i],parentId:last});
    }
  }
  return {nodes,refs};
}

/** A choice identifies an endpoint step, while trailing process figures stay
 * on that same route. Export preferences never change the editor's branch. */
export function diagramPDFMainRouteChoices(project:DiagramProject){
  const {nodes,refs}=diagramPDFBranchPanels(project),parents=new Set(nodes.map(n=>n.parentId));
  const byId=new Map(nodes.map(n=>[n.id,n])),steps=new Map([...project.steps,...(project.branchSteps??[]).map(b=>b.step)].map(s=>[s.id,s]));
  return nodes.filter(n=>!parents.has(n.id)).map(leaf=>{
    const ref=refs.get(leaf.id)!;let length=0;
    for(let n:DiagramPDFBranchNode|undefined=leaf;n;n=byId.get(n.parentId??''))if(n.figureIndex===undefined)length++;
    const step=steps.get(ref.branchStepId!)!;
    return {stepId:step.id,nodeId:leaf.id,length,label:`到第 ${ref.branchLabel} 步${step.title.trim()?' · '+step.title.trim():''}（${length} 步）`};
  }).sort((a,b)=>b.length-a.length);
}
