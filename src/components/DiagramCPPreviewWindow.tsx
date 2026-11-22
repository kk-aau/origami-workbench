import {useEffect,useRef,useState} from 'react';
import {JunctionWarningSwitch,JunctionWarnings} from './JunctionWarnings';
import DiagramCPInteractive,{type DiagramCPHit} from './DiagramCPInteractive';
import DiagramCPWorkspace from './DiagramCPWorkspace';
import {COLORS} from '../app/state';
import {adjustGridDivisions,clampGridDivisions} from '../app/gridControls';
import {NumberField} from './Fields';
import type {Assignment,Doc,Point} from '../core/types';
import type {DiagramCPPresentationContext} from '../app/diagramCPPresentation';
import './diagramCPPreview.css';

type CPOperation={type:'edit';doc:Doc}|{type:'undo'|'redo';historyVersion:number}|{type:'scope';face:number|null;sourceRevision:number}|{type:'sink';checked:boolean;sourceRevision:number};
export type CPPreviewEdit=CPOperation & {
  stepId:string;stateId:string;revision:number;generation:number;request:string;
};
const lineTypes=[['V','谷线'],['M','峰线'],['F','已有折痕'],['B','边界'],['A','辅助线']] as const;
export interface CPPreviewData {
  stepId:string;stateId:string;revision:number;generation:number;reason:string;
  title:string;cpLabel:string;
  doc:Doc;
  presentation:DiagramCPPresentationContext;
  adaptive:boolean;spatial?:boolean;junctions?:import('../core/editedJunctions').JunctionWarning[];
  canUndo:boolean;canRedo:boolean;historyVersion:number;
  drawingFaceRegions?:Point[][][];
  scopeReason:string;scopeFaces:number[];sourceRevision:number;sinkDrawing?:boolean;
}

export default function DiagramCPPreviewWindow({token}:{token:string}){
  const [data,setData]=useState<CPPreviewData|null>(null);
  const junctionWarnings=data?.junctions??[];
  const [hovered,setHovered]=useState<DiagramCPHit|null>(null),[selected,setSelected]=useState<DiagramCPHit|null>(null);
  const [editMode,setEditMode]=useState<'line'|'assign'|null>(null),[preset,setPreset]=useState<Assignment>('V');
  const connection=useRef<BroadcastChannel|null>(null),pending=useRef<{request:string;revision?:number}|null>(null),latest=useRef<CPPreviewData|null>(null);
  const [waiting,setWaiting]=useState(false);
  const [layerSlot,setLayerSlot]=useState<HTMLDivElement|null>(null);
  const [grid,setGrid]=useState({grid:false,snap:true,diagonalGrid:false,divisions:4});
  const [labels,setLabels]=useState({edges:false,faces:false});
  const [highlight,setHighlight]=useState({edges:true,faces:true}),[picking,setPicking]=useState(false);
  const native=window.cpWindowAction;
  const [notice,setNotice]=useState('');
  const [pinned,setPinned]=useState(true),[error,setError]=useState('');
  function act(action:Parameters<NonNullable<typeof native>>[0]){
    native?.(action).then(setPinned).catch(e=>setError(String(e)));
  }
  useEffect(()=>{if(native)act('state');},[native]);
  useEffect(()=>{
    const channel=new BroadcastChannel('diagram-cp-'+token);
    connection.current=channel;
    channel.onmessage=({data:message})=>{
      if(message.type==='drawing-face-regions'){
        const current=latest.current;
        if(current&&current.stateId===message.stateId&&current.stepId===message.stepId&&current.generation===message.generation&&current.revision===message.revision){
          latest.current={...current,drawingFaceRegions:message.regions};setData(latest.current);
        }
        return;
      }
      if(message==='close'){if(native)act('close');else window.close();setData(null);return;}
      if(message==='unavailable'){latest.current=null;pending.current=null;setWaiting(false);setData(null);return;}
      if(message.type==='edit-result'&&message.request===pending.current?.request){
        if(message.error)setError(message.error);
        if(message.error||message.revision===latest.current?.revision){pending.current=null;setWaiting(false);}
        else if(pending.current)pending.current.revision=message.revision;
        return;
      }
      if(message.type==='preview'){
        const next:CPPreviewData=message.data;
        const previous=latest.current;
        if(!previous||previous.generation!==next.generation||previous.stateId!==next.stateId||previous.revision!==next.revision||previous.stepId!==next.stepId){
          setHovered(null);setSelected(null);
        }
        latest.current=next;
        if(pending.current?.revision===next.revision){pending.current=null;setWaiting(false);}
        document.title=next.title;
        setData(next);
      }
    };
    const leave=()=>channel.postMessage('closed');
    window.addEventListener('pagehide',leave);channel.postMessage('ready');
    return ()=>{window.removeEventListener('pagehide',leave);connection.current=null;channel.close();};
  },[token]);
  function submit(operation:CPOperation){
    if(!data||(operation.type==='scope'||operation.type==='sink'?data.scopeReason:data.reason)||!connection.current||pending.current)return false;
    if(operation.type==='undo'&&!data.canUndo||operation.type==='redo'&&!data.canRedo)return false;
    const request=crypto.randomUUID();
    setNotice('');setError('');pending.current={request};setWaiting(true);
    connection.current.postMessage({...operation,request,stepId:data.stepId,stateId:data.stateId,generation:data.generation,revision:data.revision});
    return true;
  }
  const visibleHover=hovered&&(hovered.kind==='face'?highlight.faces:highlight.edges)?hovered:null;
  const linkedHover=visibleHover;
  useEffect(()=>{setHovered(null);setSelected(null);},[editMode]);
  useEffect(()=>{
    if(!data||!linkedHover)return;
    const channel=connection.current;
    const message={type:'preview-hover',stepId:data.stepId,stateId:data.stateId,revision:data.revision,sourceRevision:data.sourceRevision,generation:data.generation};
    channel?.postMessage({...message,hit:linkedHover});
    return ()=>{if(connection.current===channel)channel?.postMessage({...message,hit:null});};
  },[linkedHover?.kind,linkedHover?.index,data?.stepId,data?.stateId,data?.revision,data?.sourceRevision,data?.generation]);
  useEffect(()=>{
    if(!data||!selected)return;
    const channel=connection.current;
    const message={type:'preview-selection',stepId:data.stepId,stateId:data.stateId,revision:data.revision,sourceRevision:data.sourceRevision,generation:data.generation};
    channel?.postMessage({...message,hit:selected});
    return ()=>{if(connection.current===channel)channel?.postMessage({...message,hit:null});};
  },[selected?.kind,selected?.index,data?.stepId,data?.stateId,data?.revision,data?.sourceRevision,data?.generation]);
  const locked=!!data?.reason||waiting;
  function history(action:'undo'|'redo'){
    if(data)submit({type:action,historyVersion:data.historyVersion});
  }
  useEffect(()=>{
    function keydown(e:KeyboardEvent){
      if(!(e.ctrlKey||e.metaKey)||e.altKey||e.isComposing||(e.target instanceof Element&&e.target.closest('input,textarea,[contenteditable]')))return;
      const key=e.key.toLowerCase();
      if(key==='z'||key==='y'){e.preventDefault();e.stopPropagation();history(key==='y'||e.shiftKey?'redo':'undo');}
    }
    window.addEventListener('keydown',keydown,true);
    return ()=>window.removeEventListener('keydown',keydown,true);
  },[data]);
  return <main className="diagram-cp-detached">{native&&<header className="cp-window-titlebar">
    <span onPointerDown={e=>{if(e.button===0&&e.detail<2)act('drag');}} onDoubleClick={()=>act('maximize')}>{data?.title??'CP 预览'}</span>
    <button aria-label="窗口置顶" aria-pressed={pinned} title={pinned?'取消置顶':'窗口置顶'} onClick={()=>act(pinned?'unpin':'pin')}><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" style={{transform:pinned?undefined:'rotate(38deg)'}}><path fill={pinned?'currentColor':'none'} d="M8 3h8l-1 2v5l3 3v2H6v-2l3-3V5Z"/><path d="M12 15v6"/></svg></button>
    <button aria-label="最小化" title="最小化" onClick={()=>act('minimize')}>−</button>
    <button aria-label="最大化或还原" title="最大化或还原" onClick={()=>act('maximize')}>□</button>
    <button aria-label="关闭" title="关闭" onClick={()=>act('close')}>×</button>
  </header>}{error&&<p role="alert">{error}</p>}{data?<>{!native&&<header>{data.title}</header>}
    <div className="cp-detached-body"><div className="cp-detached-surface">
    {editMode?<DiagramCPWorkspace junctions={junctionWarnings} key={data.stepId+data.stateId} detached={{mode:editMode,assignment:preset,layerSlot,labels,highlight,onHover:setHovered}}
      doc={data.doc} presentation={data.presentation} cpLabel={data.cpLabel}
      adaptiveLineStyle={data.adaptive} gridSettings={grid} onGridSettings={patch=>setGrid(old=>({...old,...patch}))}
      editable={!data.reason} disabled={waiting} reason={data.reason} showCursorHint={false} showToolGuide={false}
      onMessage={setNotice} onReturn={()=>setEditMode(null)} onCommit={doc=>submit({type:'edit',doc})}/> : <DiagramCPInteractive junctions={junctionWarnings} expanded dragToPan doc={data.doc} presentation={data.presentation} adaptiveLineStyle={data.adaptive}
      drawingFaceRegions={data.drawingFaceRegions} gridSettings={grid} labels={labels} scopeFaces={data.scopeFaces} scopePicking={picking&&!data.scopeReason}
      cameraKey={data.stepId+data.stateId+data.generation} hovered={visibleHover} selected={selected}
      onHover={hit=>setHovered(old=>old?.kind===hit?.kind&&old?.index===hit?.index?old:hit)} onSelect={hit=>{
        if(!picking||data.scopeReason){setSelected(hit);return;}
        if(hit.kind==='face')submit({type:'scope',face:hit.index,sourceRevision:data.sourceRevision});
      }}/>}</div>
    <aside className="cp-detached-settings" aria-label="CP 视图设置"><JunctionWarnings issues={junctionWarnings}/>
      <fieldset><legend>网格设置</legend>
        <label><input type="checkbox" checked={grid.grid} onChange={e=>setGrid({...grid,grid:e.target.checked})}/>显示网格</label>
        <div className="cp-grid-count"><button title="等分减半" onClick={()=>setGrid({...grid,divisions:adjustGridDivisions(grid.divisions,-1)})}>÷2</button>
          <NumberField label="网格等分" value={grid.divisions} min={1} max={512} onChange={n=>setGrid({...grid,divisions:clampGridDivisions(n)})}/>
          <button title="等分加倍" onClick={()=>setGrid({...grid,divisions:adjustGridDivisions(grid.divisions,1)})}>×2</button></div>
        <label><input type="checkbox" checked={grid.diagonalGrid} onChange={e=>setGrid({...grid,diagonalGrid:e.target.checked})}/>对角网格</label>
        <label><input type="checkbox" checked={grid.snap} onChange={e=>setGrid({...grid,snap:e.target.checked})}/>绘图吸附</label>
      </fieldset>
      <fieldset><legend>显示</legend><JunctionWarningSwitch/>
        <label><input type="checkbox" checked={labels.edges} onChange={e=>setLabels({...labels,edges:e.target.checked})}/>线段编号</label>
        <label><input type="checkbox" checked={labels.faces} onChange={e=>setLabels({...labels,faces:e.target.checked})}/>纸面编号</label>
      </fieldset>
      <fieldset><legend>悬停高亮</legend>
        <label><input type="checkbox" checked={highlight.edges} onChange={e=>setHighlight({...highlight,edges:e.target.checked})}/>线段</label>
        <label><input type="checkbox" checked={highlight.faces} onChange={e=>setHighlight({...highlight,faces:e.target.checked})}/>纸面</label>
      </fieldset>
      <fieldset><legend>折线作用纸层</legend>
        <button disabled={!!data.scopeReason} aria-pressed={picking&&!data.scopeReason} onClick={()=>{setPicking(!picking);setEditMode(null);setSelected(null);}}>选择纸面</button>
        {data.scopeReason?<small>{data.scopeReason}</small>:<small>{data.scopeFaces.length?'已选 '+data.scopeFaces.length+' 层':picking?'点击纸面加入范围':'用于主图后续折线'}</small>}
        <label title={data.scopeReason||(!data.scopeFaces.length?'请先选择参与沉折的纸面':'在主图用谷线或峰线画出沉折边界')}><input type="checkbox" checked={!!data.sinkDrawing} disabled={!!data.scopeReason||!data.scopeFaces.length||waiting} onChange={event=>{
          if(submit({type:'sink',checked:event.target.checked,sourceRevision:data.sourceRevision})){setPicking(false);setEditMode(null);setSelected(null);}
        }}/>沉折</label>
        {!!data.scopeFaces.length&&<button disabled={!!data.scopeReason||waiting} onClick={()=>submit({type:'scope',face:null,sourceRevision:data.sourceRevision})}>恢复最上层</button>}
      </fieldset>
    </aside></div>
    <div className="cp-drawing-actions" role="toolbar" aria-label="CP 绘图工具" title={data.reason}>
      <div role="group" aria-label="线段类型">{lineTypes.map(([type,label])=><button key={type} disabled={locked} aria-pressed={preset===type} onClick={()=>setPreset(type)}>
        <i aria-hidden="true" style={{background:COLORS[type]}}/>{label}</button>)}</div>
      <div role="group" aria-label="工具">
        <button aria-pressed={!editMode&&!picking} onClick={()=>{setPicking(false);setEditMode(null);}}>查看</button>
        <button disabled={locked} aria-pressed={editMode==='line'} onClick={()=>{setPicking(false);setEditMode('line');}}>画线</button>
        <button disabled={locked} aria-pressed={editMode==='assign'} onClick={()=>{setPicking(false);setEditMode('assign');}}>赋型</button>
      </div>
      <div role="group" aria-label="编辑历史">
        <button disabled={locked||!data.canUndo} title="撤销 Ctrl+Z" onClick={()=>history('undo')}>撤销</button>
        <button disabled={locked||!data.canRedo} title="重做 Ctrl+Y" onClick={()=>history('redo')}>重做</button>
      </div>
      {editMode&&<div ref={setLayerSlot} className="cp-layer-slot"/>}
    </div>{(data.reason||editMode&&notice)&&<small role="status">{data.reason||notice}</small>}</>:<p role="status">等待来源 CP…</p>}</main>;
}
