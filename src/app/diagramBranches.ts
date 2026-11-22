import type {DiagramCPState,DiagramProject,DiagramStep} from './diagramProject';
import {syncDiagramReturnLabels} from './diagramReturnReference';

/** An alternate step owns its output. Its input is the parent's output CP. */
export interface DiagramBranchEntry {parentId:string;step:DiagramStep;after:DiagramCPState}
export interface DiagramBranchTreeNode {
  step:DiagramStep;before:DiagramCPState;after:DiagramCPState;depth:number;children:DiagramBranchTreeNode[];
}
export type DiagramBranchLabelMode='upper'|'lower'|'number'|'custom';
export interface DiagramBranchLabels {mode:DiagramBranchLabelMode;labels?:Record<string,string>}
interface NumberedFork {mode:DiagramBranchLabelMode;arms:{stepId:string;label:string}[]}
export interface DiagramBranchNumbering {
  stepLabels:ReadonlyMap<string,string>;cpLabels:ReadonlyMap<string,string>;
  forks:ReadonlyMap<string,NumberedFork>;ownerForks:ReadonlyMap<string,string>;
}
const numberingCache=new WeakMap<DiagramProject,DiagramBranchNumbering>();

function letter(index:number){
  let value=index+1,result='';
  while(value){value--;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26);}
  return result;
}
function labelFork(children:DiagramBranchTreeNode[],setting?:DiagramBranchLabels):NumberedFork{
  const mode=setting?.mode??'upper';
  const custom=new Map(Object.entries(setting?.labels??{})),used=new Set(custom.values());
  const arms=children.map(({step},i)=>{
    let label=custom.get(step.id);
    if(label===undefined){
      if(mode==='custom'){
        let candidate=i;
        do{label=letter(candidate++);}while(used.has(label));
        used.add(label);
      }else label=mode==='number'?String(i+1):mode==='lower'?letter(i).toLowerCase():letter(i);
    }
    return {stepId:step.id,label};
  });
  return {mode,arms};
}

/** CP0 starts the tree. Every later CP takes the number of the step that
 * produced it, so all arms share exactly one input label at their fork. */
export function diagramBranchNumbering(project:DiagramProject):DiagramBranchNumbering{
  const cached=numberingCache.get(project);if(cached)return cached;
  const root=diagramBranchTree(project),stepLabels=new Map<string,string>(),cpLabels=new Map([[root.before.id,'CP0']]);
  const forks=new Map<string,NumberedFork>(),ownerForks=new Map<string,string>();
  const settings=new Map(Object.entries(project.branchLabels??{}));
  const pending=[{node:root,suffix:'',owner:''}];
  while(pending.length){
    const {node,suffix,owner}=pending.pop()!,id=node.step.id,label=String(node.depth+1)+suffix;
    stepLabels.set(id,label);cpLabels.set(node.after.id,'CP'+label);if(owner)ownerForks.set(id,owner);
    if(node.children.length>1){
      const fork=labelFork(node.children,settings.get(id));forks.set(id,fork);
      node.children.forEach((child,i)=>{
        const raw=fork.arms[i].label;
        // A literal dot in a name is distinct from the separator at a nested fork.
        const token=/[.〔〕]/u.test(raw)||raw.startsWith('-')?'〔'+raw.replaceAll('〕','〕〕')+'〕':raw;
        const prefix=suffix?suffix+'.':/^\d/u.test(token)?'-':'';
        pending.push({node:child,suffix:prefix+token,owner:id});
      });
    }else if(node.children.length)pending.push({node:node.children[0],suffix,owner});
  }
  const result={stepLabels,cpLabels,forks,ownerForks};numberingCache.set(project,result);return result;
}

function isRecord(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function validateDiagramBranchLabels(project:DiagramProject){
  if(!isRecord(project.branchLabels))throw Error('分支编号设置无效。');
  const nodes=[diagramBranchTree(project)],children=new Map<string,Set<string>>();
  for(let i=0;i<nodes.length;i++){
    const n=nodes[i];if(n.children.length>1)children.set(n.step.id,new Set(n.children.map(child=>child.step.id)));
    nodes.push(...n.children);
  }
  for(const [id,rule] of Object.entries(project.branchLabels)){
    const arms=children.get(id);
    if(!arms||!isRecord(rule)||!Object.hasOwn(rule,'mode')||!['upper','lower','number','custom'].includes(rule.mode)||Object.keys(rule).some(k=>k!=='mode'&&k!=='labels'))throw Error('分支编号模式或所属分叉无效。');
    if(rule.labels===undefined)continue;
    if(rule.mode!=='custom'||!isRecord(rule.labels))throw Error('自定义分支标识列表无效。');
    const used=new Set<string>();
    for(const [child,label] of Object.entries(rule.labels)){
      if(!arms.has(child)||typeof label!=='string'||!label.trim()||label!==label.trim()||/[\r\n\u0000-\u001f\u007f]/u.test(label))throw Error('请输入单行的分支标识。');
      if(used.has(label))throw Error('同一分叉的标识不能重复。');
      used.add(label);
    }
  }
  const values=diagramBranchNumbering(project).stepLabels;
  if(new Set(values.values()).size!==values.size)throw Error('分支标识组合与工程中的其他步骤编号重复。');
}

export function setDiagramBranchLabels(project:DiagramProject,parentStepId:string,mode:DiagramBranchLabelMode,labels?:Readonly<Record<string,string>>):DiagramProject{
  const fork=diagramBranchNumbering(project).forks.get(parentStepId);
  if(!fork)throw Error('请选择具有两条或更多路线的分叉步骤。');
  const settings=new Map(Object.entries(project.branchLabels??{}));
  if(mode==='upper')settings.delete(parentStepId);
  else settings.set(parentStepId,mode==='custom'?{mode,labels:Object.fromEntries(Object.entries(labels??{}).map(([id,label])=>[id,label.trim()]))}:{mode});
  const result:DiagramProject={...project,branchLabels:Object.fromEntries(settings)};
  validateDiagramBranchLabels(result);
  if(!settings.size)delete result.branchLabels;
  return syncDiagramReturnLabels(result);
}

/** Inserting or deleting at a fork can change the first step on an arm.
 * Move its authored tag to the new head, and discard rules for vanished forks. */
export function repairDiagramBranchLabels(project:DiagramProject,replaced?:{from:string;to:string}):void{
  const pdf=project.exportSettings?.pdf,ribbon=pdf?.ribbon;
  if(!project.branchLabels&&!ribbon?.branchColors)return;
  const settings=new Map(Object.entries(project.branchLabels??{})),survivors=new Map<string,DiagramBranchLabels>();
  const armIds=new Set<string>();
  const pending=[diagramBranchTree(project)];
  for(let i=0;i<pending.length;i++){
    const node=pending[i],setting=settings.get(node.step.id);pending.push(...node.children);
    if(node.children.length<2)continue;
    for(const child of node.children)armIds.add(child.step.id);
    if(!setting)continue;
    if(!setting.labels){survivors.set(node.step.id,setting);continue;}
    const arms=new Set(node.children.map(child=>child.step.id));
    const labels=Object.entries(setting.labels).flatMap(([id,value])=>{
      const target=replaced?.from===id&&!arms.has(id)?replaced.to:id;
      return arms.has(target)?[[target,value] as const]:[];
    });
    survivors.set(node.step.id,{...setting,labels:Object.fromEntries(labels)});
  }
  if(survivors.size)project.branchLabels=Object.fromEntries(survivors);else delete project.branchLabels;
  if(ribbon?.branchColors){
    const colors=new Map<string,string>();
    for(const [id,color] of Object.entries(ribbon.branchColors)){
      const target=replaced?.from===id&&!armIds.has(id)?replaced.to:id;
      if(armIds.has(target))colors.set(target,color);
    }
    const next={...ribbon};
    if(colors.size)next.branchColors=Object.fromEntries(colors);else delete next.branchColors;
    project.exportSettings={...project.exportSettings,pdf:{...pdf,ribbon:next}};
  }
  numberingCache.delete(project);
}

export function diagramBranchStepCount(project:DiagramProject):number {
  return project.steps.length+(project.branchSteps?.length??0);
}

/** A sibling may suggest a solver candidate; the normal worker must still verify it. */
export function diagramBranchFoldPreference(project:DiagramProject,step:DiagramStep,input:DiagramCPState,chosenFace?:number):{startingFace:number;solutionIndex:number}|undefined {
  if(step.pose||step.beforeId!==input.id)return;
  for(const entry of project.branchSteps??[]){
    const other=entry.step,pose=other.pose;
    if(other.beforeId!==input.id||!pose||pose.spatial||pose.paperDeformation||
       other.paperStates&&other.paperStates.active!=='flat'||pose.sourceStateId!==input.id||pose.sourceRevision!==input.revision)continue;
    const startingFace=pose.result.geometry.startingFace??0,solutionIndex=pose.layerSolutionIndex??pose.result.layers.solutionIndex;
    if(solutionIndex===undefined||!Number.isSafeInteger(solutionIndex)||solutionIndex<0||chosenFace!==undefined&&chosenFace!==startingFace)continue;
    if(pose.result.geometry.graph?.zhezhi_flatCreases!=='marks'&&input.doc.segments.some(line=>line.assignment==='F'))continue;
    if(pose.sourceDoc===input.doc||JSON.stringify(pose.sourceDoc)===JSON.stringify(input.doc))return {startingFace,solutionIndex};
  }
}

export function diagramBranchTree(project:DiagramProject):DiagramBranchTreeNode {
  const nodes=new Map<string,DiagramBranchTreeNode>();
  const add=(step:DiagramStep,after:DiagramCPState,before:DiagramCPState)=>{
    if(nodes.has(step.id)||step.afterId!==after.id)throw Error('分支步骤编号重复或输出 CP 不匹配。');
    const node:DiagramBranchTreeNode={step,after,before,depth:0,children:[]};
    nodes.set(step.id,node);return node;
  };
  const active=project.steps.map((step,i)=>add(step,project.states[i+1],project.states[i]));
  active.slice(1).forEach((node,i)=>active[i].children.push(node));
  for(const entry of project.branchSteps??[])add(entry.step,entry.after,entry.after);
  for(const {parentId,step} of project.branchSteps??[]){
    const parent=nodes.get(parentId);
    if(!parent||parent.after.id!==step.beforeId)throw Error('分支的父步骤或起始 CP 不匹配。');
    const node=nodes.get(step.id)!;
    node.before=parent.after;
    parent.children.push(node);
  }
  const order=new Map(project.branchOrder?.map((id,i)=>[id,i]));
  const pending=[active[0]];let reached=0;
  while(pending.length){
    const node=pending.pop()!;reached++;
    if(node.children.length>1)node.children.sort((a,b)=>(order.get(a.step.id)??order.size)-(order.get(b.step.id)??order.size));
    for(const child of node.children){child.depth=node.depth+1;pending.push(child);}
  }
  if(reached!==nodes.size)throw Error('分支中存在未连接到起始步骤的环路。');
  return active[0];
}

/** Project the tree onto the requested route, sharing all untouched drawings and CPs. */
export function projectDiagramBranch(project:DiagramProject,stepId:string,continueToLeaf:boolean):DiagramProject {
  const root=diagramBranchTree(project),nodes=new Map<string,DiagramBranchTreeNode>(),parents=new Map<string,DiagramBranchTreeNode>();
  const queue=[root];
  for(let index=0;index<queue.length;index++){
    const node=queue[index];nodes.set(node.step.id,node);
    for(const child of node.children){parents.set(child.step.id,node);queue.push(child);}
  }
  let end=nodes.get(stepId);if(!end)throw Error('指定的分支步骤不存在。');
  if(continueToLeaf)while(end.children.length)end=end.children[0];
  const route:DiagramBranchTreeNode[]=[];
  for(let node:DiagramBranchTreeNode|undefined=end;node;node=parents.get(node.step.id))route.push(node);
  route.reverse();
  const selected=new Set(route);
  const branchSteps=queue.filter(node=>!selected.has(node)).map(node=>({parentId:parents.get(node.step.id)!.step.id,step:node.step,after:node.after}));
  return {...project,activeStepId:stepId,steps:route.map(n=>n.step),states:[root.before,...route.map(n=>n.after)],branchSteps,
    branchOrder:queue.map(n=>n.step.id)};
}
