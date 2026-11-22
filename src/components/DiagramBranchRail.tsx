import {Fragment,useId,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode,type RefObject} from 'react';
import {diagramBranchStepCount,diagramBranchTree,type DiagramBranchTreeNode,type DiagramCPState,type DiagramProject,type DiagramStep} from '../app/diagramProject';
import {diagramBranchNumbering,type DiagramBranchLabelMode} from '../app/diagramBranches';
import {diagramPanelNumber} from '../app/diagramPDFLayout';
import AppDialog from './AppDialog';
import PanelDivider from './PanelDivider';
import './DiagramBranchRail.css';

interface Props {
  project:DiagramProject;
  railRef:RefObject<HTMLElement|null>;
  tabletHeading?:ReactNode;
  actions:ReactNode;
  onAddBranch:()=>void;
  numbering:ReturnType<typeof diagramBranchNumbering>;
  onBranchLabels:(id:string,mode:DiagramBranchLabelMode,labels:Record<string,string>)=>void;
  disabled:boolean;
  onSelect:(id:string)=>void;
  onFigure:(stepId:string,figure:DiagramProject)=>void;
  renderThumbnail:(item:DiagramStep,states:DiagramCPState[])=>ReactNode;
}

interface PositionedNode {node:DiagramBranchTreeNode;column:number}

// A single successor stays in its parent's lane. Siblings sit side by side directly below the fork.
function positionTree(root:DiagramBranchTreeNode,folded:ReadonlySet<string>){
  const nodes:(PositionedNode&{states:DiagramCPState[]})[]=[];
  let row:PositionedNode[]=[{node:root,column:0}],left=0;
  while(row.length){
    const next:PositionedNode[]=[];
    for(const entry of row){
      nodes.push({...entry,states:[entry.node.before,entry.node.after]});
      left=Math.min(left,entry.column);
      const {step,children}=entry.node;
      if(folded.has(step.id))continue;
      const previous=next.at(-1);
      const start=Math.max(entry.column-(children.length-1),previous?previous.column+2:-Infinity);
      children.forEach((node,index)=>next.push({node,column:start+index*2}));
    }
    row=next;
  }
  return {nodes,left};
}

function BranchLabelEditor({project,id,numbering,choices,onChoose,onApply,onClose}:Pick<Props,'project'|'numbering'>&{id:string;choices:string[];onChoose:(id:string)=>void;onApply:Props['onBranchLabels'];onClose:()=>void}){
  const fork=numbering.forks.get(id)!;
  const [mode,setMode]=useState(fork.mode),[names,setNames]=useState(()=>Object.fromEntries(fork.arms.map(arm=>[arm.stepId,arm.label])));
  const [error,setError]=useState('');
  const formId=useId();
  const sample=useMemo(()=>{
    if(mode==='custom'||mode===fork.mode)return numbering;
    return diagramBranchNumbering({...project,branchLabels:{...project.branchLabels,[id]:{mode}}});
  },[project,id,mode,fork.mode,numbering]);
  const armSteps=useMemo(()=>new Map([...project.steps,...(project.branchSteps??[]).map(entry=>entry.step)].map(item=>[item.id,item])),[project.steps,project.branchSteps]);
  function submit(){
    try{onApply(id,mode,names);onClose();}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
  }
  return <AppDialog title={'第 '+numbering.stepLabels.get(id)+' 步的分支编号'} size="small" onClose={onClose}
    footer={<><button type="button" onClick={onClose}>取消</button><button type="submit" className="primary" form={formId}>应用编号</button></>}>
    <form id={formId} className="diagram-branch-label-editor" onSubmit={event=>{event.preventDefault();submit();}}>
      {choices.length>1&&<label className="diagram-branch-label-row">编辑分叉<select value={id} onChange={event=>onChoose(event.target.value)}>{choices.map(choice=>
        <option key={choice} value={choice}>{choice===project.activeStepId?'本步骤之后':'本步骤所属'} · 第 {numbering.stepLabels.get(choice)} 步</option>)}</select></label>}
      <div role="group" aria-label="编号方式" className="diagram-branch-label-modes">{([['upper','A B C'],['lower','a b c'],['number','1 2 3'],['custom','自定义']] as const).map(([value,label])=>
        <button type="button" key={value} aria-pressed={mode===value} onClick={()=>{setMode(value);setError('');}}>{label}</button>)}</div>
      {fork.arms.map(({stepId})=><label key={stepId} className="diagram-branch-label-row">
        <span>第 {numbering.stepLabels.get(stepId)} 步 · {armSteps.get(stepId)?.title||'未命名步骤'}</span>
        {mode==='custom'?<input aria-label={'第 '+numbering.stepLabels.get(stepId)+' 步的分支名称'} value={names[stepId]??''}
          onChange={event=>{setNames({...names,[stepId]:event.target.value});setError('');}}/>:<output>{sample.stepLabels.get(stepId)}</output>}
      </label>)}
      {error&&<p role="alert">{error}</p>}
    </form>
  </AppDialog>;
}

export default function DiagramBranchRail({project,railRef,tabletHeading,actions,onAddBranch,numbering,onBranchLabels,disabled,onSelect,onFigure,renderThumbnail}:Props){
  const branched=!!project.branchSteps?.length;
  const [collapsed,setCollapsed]=useState(false),[folded,setFolded]=useState<ReadonlySet<string>>(()=>new Set());
  const [preferredWidth,setPreferredWidth]=useState<number|null>(null);
  const width=preferredWidth??(branched?282:140);
  const closed=!tabletHeading&&collapsed;
  const toggleButton=useRef<HTMLButtonElement>(null),restoreButton=useRef<HTMLButtonElement>(null);
  const changedPanel=useRef(false);
  const root=useMemo(()=>branched?diagramBranchTree(project):null,[project,branched]);
  const tree=useMemo(()=>root?positionTree(root,folded):null,[root,folded]);
  const activeId=project.activeStepId;
  const [editingFork,setEditingFork]=useState<string|null>(null);
  const forkChoices=[numbering.ownerForks.get(activeId),numbering.forks.has(activeId)?activeId:undefined].filter((id):id is string=>!!id);

  // Navigation outside the rail (e.g. Next) also reveals a step in a previously folded subtree.
  const previousActive=useRef(activeId);
  useLayoutEffect(()=>{
    if(previousActive.current===activeId)return;
    previousActive.current=activeId;
    if(!folded.size)return;
    const ancestors=new Set(project.steps.slice(0,project.steps.findIndex(step=>step.id===activeId)).map(step=>step.id));
    if([...folded].some(id=>ancestors.has(id)))setFolded(new Set([...folded].filter(id=>!ancestors.has(id))));
  },[activeId,project.steps,folded]);
  useLayoutEffect(()=>{
    if(changedPanel.current){
      (closed?restoreButton:toggleButton).current?.focus({preventScroll:true});
      changedPanel.current=false;
    }
    const nav=railRef.current,card=nav?.querySelector<HTMLElement>('[aria-current="step"]');
    if(closed||!nav||!card)return;
    const bounds=card.getBoundingClientRect(),viewport=nav.getBoundingClientRect();
    if(bounds.top<viewport.top)nav.scrollTop+=bounds.top-viewport.top;
    else if(bounds.bottom>viewport.bottom)nav.scrollTop+=bounds.bottom-viewport.bottom;
    if(bounds.left<viewport.left)nav.scrollLeft+=bounds.left-viewport.left;
    else if(bounds.right>viewport.right)nav.scrollLeft+=bounds.right-viewport.right;
  },[activeId,folded,closed,railRef]);

  function toggleFork(id:string){
    setFolded(current=>{
      const next=new Set(current);
      if(!next.delete(id))next.add(id);
      return next;
    });
  }
  function togglePanel(){
    changedPanel.current=true;
    setCollapsed(value=>!value);
  }
  function figures(item:DiagramStep,index:number){
    return item.processFigures?.map((figure,figureIndex)=><button key={figure.activeStepId} className="diagram-figure-entry" type="button"
      disabled={disabled} onClick={()=>onFigure(item.id,figure)} title={figure.steps[0].title||'编辑过程图'}>
      过程图 {diagramPanelNumber({stepIndex:index,figureIndex,branchLabel:numbering.stepLabels.get(item.id)})}{figure.steps[0].title?' · '+figure.steps[0].title:''}
    </button>);
  }
  const count=diagramBranchStepCount(project);
  return <aside className={'diagram-step-rail diagram-branch-rail'+(closed?' is-closed':'')+(branched?' has-branches':'')}
    style={{'--step-rail-width':width+'px'} as CSSProperties}>
    {closed?<button className="diagram-restore-steps" type="button" ref={restoreButton} onClick={togglePanel} aria-expanded="false" aria-label="展开步骤栏" title="展开步骤栏">»<span>步骤</span></button>:<>
      {tabletHeading}
      <header><strong>折纸步骤</strong><small>{count} 步</small>
        {!tabletHeading&&<button type="button" className="diagram-collapse-steps" ref={toggleButton} onClick={togglePanel} aria-expanded="true" aria-label="收起步骤栏" title="收起步骤栏">«</button>}
      </header>
      <div className="diagram-step-actions diagram-insert-actions">{actions}
        <button type="button" className="diagram-add-branch" disabled={disabled} onClick={onAddBranch} title="从当前步骤完成后的 CP 新建分支">添加分支</button>
        {branched&&<button type="button" className="diagram-edit-branch" disabled={disabled||!forkChoices.length} onClick={()=>setEditingFork(forkChoices[0])} title="设置当前分叉的编号或名称">分支编号</button>}
      </div>
      <nav ref={railRef} aria-label={branched?'折序分叉树':'折序步骤列表'}>
        {tree?<div className={'diagram-branch-grid'+(Object.values(project.branchLabels??{}).some(setting=>setting.mode==='custom')?' has-custom-labels':'')}>
          {tree.nodes.map(({node,states,column})=>{
            const item=node.step,selected=item.id===activeId,hasFork=node.children.length>1,expanded=!folded.has(item.id);
            const owner=numbering.ownerForks.get(item.id);
            const arm=owner?numbering.forks.get(owner)?.arms.find(child=>child.stepId===item.id):undefined;
            const number=numbering.stepLabels.get(item.id)!,title=item.title||(arm?'分支 '+arm.label:'未命名步骤');
            return <div key={item.id} className="diagram-branch-cell" style={{gridRow:node.depth+1,gridColumn:(column-tree.left+1)+' / span 2'}}>
              <div className={'diagram-branch-card'+(selected?' is-active':'')}>
                <button type="button" className="diagram-branch-select" aria-current={selected?'step':undefined}
                  onClick={()=>onSelect(item.id)} title={'第 '+number+' 步 · '+title} aria-label={'第 '+number+' 步，'+title}>
                  <div className="diagram-step-thumb">{renderThumbnail(item,states)}</div>
                  <span className="diagram-branch-caption"><small>第 {number} 步</small><strong>{title}</strong></span>
                </button>
                {hasFork&&<button type="button" className="diagram-branch-fold" aria-expanded={expanded}
                  title={expanded?'收起子分支':'展开子分支'} aria-label={(expanded?'收起':'展开')+'第 '+number+' 步后的 '+node.children.length+' 条分支'}
                  onClick={()=>toggleFork(item.id)}>{expanded?'▾':'▸'}</button>}
              </div>
              {figures(item,node.depth)}
            </div>;
          })}
        </div>:project.steps.map((item,index)=><Fragment key={item.id}>
          <button type="button" className={'diagram-step-card'+(item.id===activeId?' is-active':'')} aria-current={item.id===activeId?'step':undefined} onClick={()=>onSelect(item.id)}>
            <span className="diagram-step-number">{String(index+1).padStart(2,'0')}</span>
            <div className="diagram-step-thumb">{renderThumbnail(item,project.states)}</div>
            <strong>{item.title||'未命名步骤'}</strong><small>CP{index} → CP{index+1}</small>
          </button>{figures(item,index)}
        </Fragment>)}
      </nav>
      <footer><span className="diagram-status-dot"/>CP 连续衔接 <strong>N＋1</strong></footer>
      {!tabletHeading&&<PanelDivider side="left" label="步骤栏宽度" min={140} max={560} value={width} onChange={setPreferredWidth} onReset={()=>setPreferredWidth(null)}/>}
    </>}
    {editingFork&&numbering.forks.has(editingFork)&&<BranchLabelEditor key={editingFork} id={editingFork} choices={forkChoices} onChoose={setEditingFork} project={project} numbering={numbering} onApply={onBranchLabels} onClose={()=>setEditingFork(null)}/>}
  </aside>;
}
