import {diagramBranchNumbering,diagramBranchTree,type DiagramBranchTreeNode} from './diagramBranches';
import type {DiagramProject} from './diagramProject';
import type {DiagramPDFRibbon} from './diagramPDFDecoration';

export interface DiagramPDFRibbonBranch {stepId:string;label:string;firstStepLabel:string;parentStepId?:string}
interface BranchIndex {branches:DiagramPDFRibbonBranch[];byStep:Map<string,string>}
const branchIndexes=new WeakMap<DiagramProject,BranchIndex>();

/** Each arm is identified by its first step, independent of its printed number or current route. */
export function diagramPDFRibbonBranchIndex(project:DiagramProject):BranchIndex {
  const cached=branchIndexes.get(project);if(cached)return cached;
  const branches:DiagramPDFRibbonBranch[]=[],byStep=new Map<string,string>();
  if(project.branchSteps?.length){
    const {forks,stepLabels}=diagramBranchNumbering(project);
    const pending:{node:DiagramBranchTreeNode;owner?:DiagramPDFRibbonBranch;newArm?:boolean}[]=[{node:diagramBranchTree(project)}];
    while(pending.length){
      const {node,owner,newArm}=pending.pop()!;
      if(owner){byStep.set(node.step.id,owner.stepId);if(newArm)branches.push(owner);}
      const fork=forks.get(node.step.id);
      for(let i=node.children.length-1;i>=0;i--){
        const child=node.children[i],stepId=child.step.id;
        if(!fork){pending.push({node:child,owner});continue;}
        const label=owner?owner.label+'.'+fork.arms[i].label:fork.arms[i].label;
        pending.push({node:child,newArm:true,owner:{stepId,label,firstStepLabel:stepLabels.get(stepId)!,parentStepId:owner?.stepId}});
      }
    }
  }
  const result={branches,byStep};branchIndexes.set(project,result);return result;
}
export function diagramPDFRibbonBranches(project:DiagramProject){return diagramPDFRibbonBranchIndex(project).branches;}

export function diagramPDFRibbonBranchColor(branches:readonly DiagramPDFRibbonBranch[],stepId:string|undefined,colors?:Readonly<Record<string,string>>):string|undefined {
  if(!stepId||!colors)return;
  // Parents always precede their children. One reverse scan walks only up the selected arm.
  for(let i=branches.length-1;i>=0&&stepId;i--){
    if(branches[i].stepId!==stepId)continue;
    if(Object.hasOwn(colors,stepId))return colors[stepId];
    stepId=branches[i].parentStepId;
  }
}

function setRibbonColor(ribbon:DiagramPDFRibbon,field:'branchColors'|'segmentColors',key:string,color?:string):DiagramPDFRibbon {
  const next={...ribbon},entries=new Map(Object.entries(ribbon[field]??{}));
  if(color===undefined)entries.delete(key);
  else{
    if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('彩带颜色无效。');
    entries.set(key,color);
  }
  if(entries.size)next[field]=Object.fromEntries(entries);else delete next[field];
  return next;
}
export function setDiagramPDFRibbonBranchColor(ribbon:DiagramPDFRibbon,stepId:string,color?:string){return setRibbonColor(ribbon,'branchColors',stepId,color);}
export function setDiagramPDFRibbonSegmentColor(ribbon:DiagramPDFRibbon,key:string,color?:string){return setRibbonColor(ribbon,'segmentColors',key,color);}
