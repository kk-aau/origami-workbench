import {useMemo,useState} from 'react';
import type {DiagramProject} from '../app/diagramProject';
import {diagramPanelNumber,type DiagramPDFOptions,type DiagramPDFPlan} from '../app/diagramPDFLayout';
import {diagramPDFRibbonStrokeWidth} from '../app/diagramPDFBranchContinuation';
import {defaultDiagramPDFRibbon,diagramPDFRibbonPaintTargets,type DiagramPDFRibbonPaintTarget} from '../app/diagramPDFDecoration';
import {diagramPDFRibbonBranches,setDiagramPDFRibbonBranchColor,setDiagramPDFRibbonSegmentColor} from '../app/diagramPDFBranchColors';
import ColorPicker from '../ui/ColorPicker';

type PaintScope='branch'|'segment';
interface PaintChoice {key:string;label:string}

export function useDiagramPDFRibbonPaint(active:boolean,project:DiagramProject,options:DiagramPDFOptions,plan:DiagramPDFPlan|null,firstPage:number,lastPage:number,onPage:(index:number)=>void,onChange:(patch:Partial<DiagramPDFOptions>)=>void){
  const [requestedScope,setScope]=useState<PaintScope>('branch');
  const [brush,setBrush]=useState('#2F68C9'),[restore,setRestore]=useState(false);
  const [selectedBranch,setSelectedBranch]=useState(''),[selectedSegment,setSelectedSegment]=useState('');
  const enabled=options.readingOrder==='snake'&&!!options.ribbon?.enabled;
  const branches=useMemo(()=>active?diagramPDFRibbonBranches(project):[],[active,project]);
  const scope=branches.length?requestedScope:'segment';
  const sheets=useMemo(()=>{
    const result=new Map<number,DiagramPDFRibbonPaintTarget[]>();
    if(active&&enabled&&plan)for(let i=firstPage;i<=lastPage&&i<plan.pages.length;i++){
      result.set(i,diagramPDFRibbonPaintTargets(options,plan,plan.pages[i]));
    }
    return result;
  },[active,enabled,plan,options,firstPage,lastPage]);
  const numbers=useMemo(()=>{
    const labels=new Map<string,string>();
    if(active&&plan)for(const page of plan.pages)for(const cell of page.cells){
      if(cell.ribbonNodeId)labels.set(cell.ribbonNodeId,diagramPanelNumber(cell));
    }
    return labels;
  },[active,plan]);
  function transition(target:DiagramPDFRibbonPaintTarget){return numbers.get(target.from)+' → '+numbers.get(target.to);}
  const choices:PaintChoice[]=useMemo(()=>{
    if(scope==='branch')return branches.map(branch=>({key:branch.stepId,label:'分支 '+branch.label+' · 第 '+branch.firstStepLabel+' 步起'}));
    const unique=new Map<string,PaintChoice>();
    for(const targets of sheets.values())for(const target of targets)unique.set(target.key,{key:target.key,label:transition(target)});
    return Array.from(unique.values());
  },[scope,branches,sheets,numbers]);
  const selected=scope==='branch'?selectedBranch:selectedSegment;
  const current=choices.find(item=>item.key===selected)??choices[0];
  const branchPage=scope==='branch'&&current&&plan?plan.pages.findIndex(page=>page.cells.some(cell=>cell.branchColorStepId===current.key)):-1;
  const overrides=scope==='branch'?options.ribbon?.branchColors:options.ribbon?.segmentColors;
  const currentColor=current&&overrides&&Object.hasOwn(overrides,current.key)?overrides[current.key]:undefined;
  function select(key:string){if(scope==='branch')setSelectedBranch(key);else setSelectedSegment(key);}
  function apply(key:string){
    if(!active||!enabled||!key)return;
    select(key);
    const color=restore?undefined:brush;
    const existing=overrides&&Object.hasOwn(overrides,key)?overrides[key]:undefined;
    if(existing?.toLowerCase()===color?.toLowerCase())return;
    const ribbon=options.ribbon??defaultDiagramPDFRibbon();
    onChange({ribbon:scope==='branch'?setDiagramPDFRibbonBranchColor(ribbon,key,color):setDiagramPDFRibbonSegmentColor(ribbon,key,color)});
  }
  const controls=enabled?<div className="diagram-ribbon-paint-controls">
    <div className="diagram-export-alignment"><span>上色范围</span><div role="group" aria-label="上色范围">
      <button type="button" aria-pressed={scope==='branch'} disabled={!branches.length} onClick={()=>setScope('branch')}>整条分支</button>
      <button type="button" aria-pressed={scope==='segment'} onClick={()=>setScope('segment')}>单段彩带</button>
    </div></div>
    <div className="diagram-ribbon-paint-tools">
      <label className="diagram-paint-color">画笔颜色<ColorPicker aria-label="画笔颜色" value={brush} onChange={color=>{setBrush(color);setRestore(false);}}/></label>
      <div className="diagram-export-alignment"><div role="group" aria-label="上色工具">
        <button type="button" aria-pressed={!restore} onClick={()=>setRestore(false)}>上色</button>
        <button type="button" aria-pressed={restore} onClick={()=>setRestore(true)}>恢复继承</button>
      </div></div>
    </div>
    <p className="diagram-pdf-hint">{restore
      ?scope==='branch'?'点击分支，恢复父分支或全局彩带的颜色。':'点击彩带段，恢复它所在分支或全局彩带的颜色。'
      :scope==='branch'?'点击预览中的彩带，为这条分支上色。子分支可以单独设色。':'点击两个相邻步骤之间的彩带。跨页时，两页上的同一段会同步变色。'}</p>
    <div className="diagram-ribbon-paint-selection">
      <label>{scope==='branch'?'选择分支':'预览中的彩带段'}
        <select value={current?.key??''} disabled={!choices.length} onChange={event=>select(event.currentTarget.value)}>
          {!choices.length&&<option value="">此页没有彩带段</option>}
          {choices.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
      {branchPage>=0&&(branchPage<firstPage||branchPage>lastPage)&&<button type="button" onClick={()=>onPage(branchPage)}>定位分支</button>}
      <button type="button" disabled={!current||restore&&!currentColor} onClick={()=>{if(current)apply(current.key);}}>{restore?'恢复所选':'应用到所选'}</button>
    </div>
    {current&&<output className="diagram-ribbon-paint-status" aria-live="polite">
      {currentColor&&<i style={{background:currentColor}}/>}{current.label} · {currentColor?currentColor.toUpperCase():'继承颜色'}
    </output>}
  </div>:<button type="button" onClick={()=>onChange({readingOrder:'snake',ribbon:{...(options.ribbon??defaultDiagramPDFRibbon()),enabled:true}})}>启用蛇形彩带</button>;
  function overlay(index:number){
    const targets=sheets.get(index);
    if(!targets?.length)return null;
    return <g className="diagram-ribbon-paint-overlay" fill="none" stroke="transparent" strokeWidth={Math.max(14,diagramPDFRibbonStrokeWidth(options.ribbon))}>
      {targets.map(target=>{
        const key=scope==='segment'?target.key:target.branchStepId;
        if(!key)return null;
        const label=scope==='segment'?transition(target):choices.find(item=>item.key===key)?.label;
        return <path key={target.key} d={target.path} pointerEvents="stroke" onClick={event=>{event.stopPropagation();apply(key);}}>
          <title>{(restore?'恢复继承 · ':'上色 · ')+label}</title>
        </path>;
      })}
    </g>;
  }
  return {controls,overlay,painting:active&&enabled};
}
