import {useState} from 'react';
import type {DiagramProject} from '../app/diagramProject';
import {diagramPDFLeaveCorner,diagramPDFPageCorner} from '../app/diagramPDFCornerPlacement';
import {DiagramPDFSeamControls} from './DiagramPDFSeamHandles';
import {diagramPDFCaptionNumber,diagramPDFPanelPlacementKey,diagramPDFPanelSlotInfo,type DiagramPanelRef,type DiagramPDFOptions,type DiagramPDFPageLayout,type DiagramPDFPlan} from '../app/diagramPDFLayout';

export default function DiagramPDFLayoutControls({project,options,plan,pageIndex,onPage,onChange,editing,onEditing,selected,onSelect}:{
  project:DiagramProject;options:DiagramPDFOptions;plan:DiagramPDFPlan;pageIndex:number;onPage:(page:number)=>void;
  onChange:(patch:Partial<DiagramPDFOptions>)=>void;editing:boolean;onEditing:(value:boolean)=>void;selected:string;onSelect:(key:string)=>void;
}){
  const [cornerConflict,setCornerConflict]=useState<DiagramPDFPlan['pages'][number]>();
  const pages=plan.pages.map((page,index)=>({page,index})).filter(({page})=>page.cells.length||page.kind==='gallery');
  const target=pages.find(item=>item.index===pageIndex)??pages[0];if(!target)return null;
  const {page,index}=target,free=options.layoutMode==='free',override=options.pageLayouts?.[index];
  const intro=page.kind==='intro';
  const columns=override?.columns??(intro?plan.introColumns:plan.columns);
  const rows=override?.rows??(intro?plan.introRows:plan.rows);
  const remaining=pages.filter(item=>item.index>=index).reduce((sum,item)=>sum+item.page.cells.length,0);
  const panelKey=(cell:DiagramPanelRef)=>diagramPDFPanelPlacementKey(project,cell,options.layoutMode);
  const count=page.cells.length,selectedCell=page.cells.find(cell=>panelKey(cell)===selected)??page.cells[0];
  const corner=diagramPDFPageCorner(options,page);
  const key=selectedCell?panelKey(selectedCell):'',placement={x:0,y:0,scale:1,...options.panelPlacements?.[key],...(selectedCell&&diagramPDFPanelSlotInfo(page,selectedCell))};
  function setPageLayout(layout:DiagramPDFPageLayout){
    onPage(index);
    const layouts={...options.pageLayouts};
    if(Object.keys(layout).length)layouts[index]=layout;
    else delete layouts[index];
    onChange({pageLayouts:layouts});
  }
  function changePage(patch:DiagramPDFPageLayout){
    const next={...override,...patch};
    if(next.snakeDirection===undefined)delete next.snakeDirection;
    if(next.count!==undefined&&(patch.columns!==undefined||patch.rows!==undefined)){
      next.count=Math.min(next.count,(patch.columns??columns)*(patch.rows??rows));
    }
    setPageLayout(next);
  }
  function resetPanels(all=false){
    const placements={...options.panelPlacements};for(const cell of all?plan.pages.flatMap(p=>p.cells):page.cells)delete placements[panelKey(cell)];
    onChange({panelPlacements:placements});
  }
  return <div className="diagram-page-layout-controls">
    <div role="group" aria-label="步骤排版模式" className="diagram-decoration-tabs">
      <button type="button" aria-pressed={!free} onClick={()=>onChange({layoutMode:'grid'})}>常规网格</button>
      <button type="button" aria-pressed={free} onClick={()=>onChange({layoutMode:'free'})}>错落自由</button>
    </div>
    <div className="diagram-export-fields">
      <label>单独设置页面<select aria-label="单独设置页面" value={index} onChange={e=>onPage(Number(e.target.value))}>{pages.map(({page,index})=><option key={index} value={index}>第 {index+1} 页 · {page.kind==='gallery'?'成品图':`${diagramPDFCaptionNumber(page.cells[0])}—${diagramPDFCaptionNumber(page.cells.at(-1)!)}`}</option>)}</select></label>
      {(options.readingOrder==='snake'||!page.branchEdges)&&<label>本页走向<select value={override?.snakeDirection??'inherit'} onChange={e=>{
        const direction=e.target.value;
        changePage({snakeDirection:direction==='horizontal'||direction==='vertical'?direction:undefined});
      }}>
        <option value="inherit">跟随全篇（{options.snakeDirection==='vertical'?'纵向':'横向'}）</option>
        <option value="horizontal">横向逐行</option>
        <option value="vertical">纵向逐列</option>
      </select></label>}
      <label>列数<input aria-label="本页列数" type="number" min={1} max={8} value={columns} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isInteger(n)&&n>=1&&n<=8)changePage({columns:n});}}/></label>
      <label>行数<input aria-label="本页行数" type="number" min={1} max={8} value={rows} onChange={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isInteger(n)&&n>=1&&n<=8)changePage({rows:n});}}/></label>
      {count>0&&<div className="diagram-export-wide diagram-page-count"><span>本页步骤数</span>{corner&&<button type="button" title="沿彩带移动拐角后的步骤，将本页最后一步移至下一页" onClick={()=>{
        const patch=diagramPDFLeaveCorner(project,options,plan,index,corner);
        if(!patch){setCornerConflict(page);return;}
        setCornerConflict(undefined);onPage(index);onChange(patch);
      }}>拐角留一格</button>}<button type="button" aria-label="减少本页步骤" disabled={count<=1} onClick={()=>changePage({count:count-1})}>−</button><output aria-live="polite">{count}</output><button type="button" aria-label="增加本页步骤" disabled={count>=Math.min(64,remaining)} onClick={()=>changePage({count:count+1})}>+</button></div>}
    </div>
    {cornerConflict===page&&<p role="status" className="diagram-pdf-hint">当前分页会同时移走其他步骤。可先调整本页步骤数，再为拐角留位。</p>}
    {count>0&&<p className="diagram-pdf-hint">减少步骤数会将步骤移到下一页。增加时从后页移入，必要时自动增加行数。</p>}
    {override&&<button type="button" onClick={()=>setPageLayout({})}>恢复本页默认排版</button>}
    {index===pageIndex&&<DiagramPDFSeamControls options={options} plan={plan} pageIndex={index} onChange={onChange}/>}
    {free&&selectedCell&&
      <div role="group" aria-label="自由排版间距" className="diagram-decoration-tabs">{([['compact','紧凑'],['airy','舒展']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={(options.freeSpacing??'compact')===value} onClick={()=>onChange({freeSpacing:value})}>{label}</button>)}</div>
    }
    {selectedCell&&
      <button type="button" aria-pressed={editing} onClick={()=>{onPage(index);onEditing(!editing);}}>{editing?'完成步骤调整':'调整步骤位置'}</button>
    }
    {selectedCell&&(free||editing)&&<>
      <label>选择步骤<select aria-label="选择排版步骤" value={key} onChange={e=>{onSelect(e.target.value);onPage(index);}}>{page.cells.map(cell=><option key={panelKey(cell)} value={panelKey(cell)}>第 {diagramPDFCaptionNumber(cell)} 步</option>)}</select></label>
      <label className="diagram-cover-position-slider">所选步骤大小 <output>{Math.round(placement.scale*100)}%</output><input aria-label="步骤大小" type="range" min={30} max={200} step={1} value={Math.round(placement.scale*100)} onChange={e=>{onSelect(key);onChange({panelPlacements:{...options.panelPlacements,[key]:{...placement,scale:e.currentTarget.valueAsNumber/100}}});}}/></label>
      <div role="group" className="diagram-decoration-tabs"><button type="button" onClick={()=>resetPanels()}>复位本页位置</button><button type="button" onClick={()=>resetPanels(true)}>复位全部位置</button></div>
      <p className="diagram-pdf-hint">开启调整后拖动整步，右下角缩放。方向键微调，Shift 加大步幅；彩带跟随移动。</p>
    </>}
  </div>;
}
