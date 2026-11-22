import {useMemo,useState} from 'react';
import {diagramBranchTree,type DiagramBranchNumbering,type DiagramBranchTreeNode} from '../app/diagramBranches';
import type {DiagramProject} from '../app/diagramProject';
import AppDialog from './AppDialog';

type Route={id:string;name:string};
type Position='before'|'after';

export default function DiagramBranchInsertDialog({project,numbering,position,onApply,onClose}:{
  project:DiagramProject;numbering:DiagramBranchNumbering;position:Position;
  onApply:(leafId:string,anchorId:string)=>void;onClose:()=>void;
}){
  const {leaves,parents,nodes}=useMemo(()=>{
    const leaves:Route[]=[],parents=new Map<string,string>(),nodes=new Map<string,DiagramBranchTreeNode>();
    const stack=[{node:diagramBranchTree(project),name:''}];
    while(stack.length){
      const {node,name}=stack.pop()!,id=node.step.id;
      nodes.set(id,node);
      if(!node.children.length)leaves.push({id,name});
      const arms=numbering.forks.get(id)?.arms;
      for(let i=node.children.length-1;i>=0;i--){
        const child=node.children[i];
        const label=arms?.[i].label;
        parents.set(child.step.id,id);
        stack.push({node:child,name:label?(name?name+' › '+label:label):name});
      }
    }
    return {leaves,parents,nodes};
  },[project,numbering]);
  const [leafId,setLeafId]=useState('');
  const [chosenAnchor,setChosenAnchor]=useState('');
  const [error,setError]=useState('');
  const route=useMemo(()=>{
    const result:DiagramBranchTreeNode[]=[];
    for(let id=leafId;nodes.has(id);id=parents.get(id)??'')result.push(nodes.get(id)!);
    return result.reverse();
  },[leafId,parents,nodes]);
  const anchorId=chosenAnchor||(route.some(node=>node.step.id===project.activeStepId)?project.activeStepId:'');
  const index=route.findIndex(node=>node.step.id===anchorId);
  const at=position==='before'?index:index+1;
  const previous=route[at-1]?.step.id,following=route[at]?.step.id;
  const shared=route.slice(at).some(node=>node.children.length>1);
  const stepLabel=(id:string)=>'第 '+numbering.stepLabels.get(id)+' 步';
  function chooseLeaf(id:string){setLeafId(id);setChosenAnchor('');setError('');}
  function apply(){
    if(index<0)return;
    try{onApply(leafId,anchorId);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  }
  return <AppDialog title="新建折叠步骤" size="small" onClose={onClose} bodyClassName="diagram-branch-insert"
    footer={<><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={index<0} onClick={apply}>添加步骤</button></>}>
    <fieldset><legend>选择分支</legend><div className="diagram-branch-choices">{leaves.map(leaf=>
      <button key={leaf.id} type="button" aria-pressed={leafId===leaf.id} onClick={()=>chooseLeaf(leaf.id)}>分支 {leaf.name}</button>)}</div></fieldset>
    <label>定位步骤<select value={anchorId} disabled={!leafId} onChange={event=>{setChosenAnchor(event.target.value);setError('');}}>
      <option value="" disabled>{leafId?'请选择步骤':'先选择分支'}</option>
      {route.map(({step})=><option key={step.id} value={step.id}>{stepLabel(step.id)}{step.title?' · '+step.title:''}</option>)}
    </select></label>
    {index>=0&&<p>{previous&&following?`插在${stepLabel(previous)}和${stepLabel(following)}之间。`:previous?`接在${stepLabel(previous)}之后。`:`插在${stepLabel(following!)}之前。`}{shared&&'后续分支共用这一步。'}</p>}
    {error&&<p role="alert">{error}</p>}
  </AppDialog>;
}
