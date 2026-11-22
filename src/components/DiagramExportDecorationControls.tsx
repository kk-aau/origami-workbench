import {useState,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import type {DiagramPDFOptions} from '../app/diagramPDFLayout';
import {
  DEFAULT_RIBBON_ARROW_COLOR,DEFAULT_RIBBON_ARROW_STYLE,DEFAULT_RIBBON_ARROW_THICKNESS,
  MIN_RIBBON_ARROW_THICKNESS,MAX_RIBBON_ARROW_THICKNESS,
  defaultDiagramPDFPaint,defaultDiagramPDFRibbon,diagramPDFRibbonArrowIconPath,diagramPDFRibbonArrowOpacity,type DiagramPDFPaint,
} from '../app/diagramPDFDecoration';
import ColorPicker from '../ui/ColorPicker';

function PaintEditor({label,value,onChange,alongRibbon=false}:{label:string;value:DiagramPDFPaint;onChange:(paint:DiagramPDFPaint)=>void;alongRibbon?:boolean}){
  const [stopId,setStopId]=useState(value.stops[0].id);
  const selected=value.stops.find(stop=>stop.id===stopId)??value.stops[0];
  const patch=(change:Partial<DiagramPDFPaint>)=>onChange({...value,...change});
  const stop=(change:Partial<typeof selected>)=>patch({stops:value.stops.map(item=>item.id===selected.id?{...item,...change}:item)});
  const gradient='linear-gradient(90deg,'+[...value.stops].sort((a,b)=>a.offset-b.offset).map(s=>s.color+Math.round(s.opacity*255).toString(16).padStart(2,'0')+' '+s.offset+'%').join(',')+')';
  function move(event:ReactPointerEvent<HTMLButtonElement>){
    if(!event.currentTarget.hasPointerCapture(event.pointerId))return;
    const bar=event.currentTarget.parentElement!.getBoundingClientRect();
    const offset=Math.max(0,Math.min(100,Math.round((event.clientX-bar.left)/bar.width*100)));
    patch({stops:value.stops.map(s=>s.id===event.currentTarget.dataset.stop?{...s,offset}:s)});
  }
  return <div className="diagram-paint-editor">
    <div className="diagram-export-alignment"><span>{label}</span><div role="group" aria-label={label+'类型'}>{([['solid','纯色'],['linear','线性渐变'],['radial','径向渐变']] as const).map(([kind,text])=><button type="button" key={kind} aria-pressed={value.kind===kind} onClick={()=>patch({kind})}>{text}</button>)}</div></div>
    {value.kind==='solid'?<label className="diagram-paint-color">颜色<ColorPicker aria-label={label+'颜色'} value={value.color} onChange={color=>patch({color})}/><span>{value.color.toUpperCase()}</span></label>:<>
      <div className="diagram-gradient-bar" style={{background:gradient}} role="group" aria-label={label+'渐变色标'}>
        {value.stops.map((s,index)=><button type="button" key={s.id} data-stop={s.id} aria-label={label+'色标 '+(index+1)} aria-pressed={s.id===selected.id} title={s.offset+'%'} style={{left:s.offset+'%',background:s.color}} onClick={()=>setStopId(s.id)}
          onPointerDown={event=>{event.preventDefault();setStopId(s.id);event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={move} onPointerUp={event=>{move(event);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
          onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();patch({stops:value.stops.map(item=>item.id===s.id?{...item,offset:Math.max(0,Math.min(100,item.offset+(event.key==='ArrowLeft'?-1:1)))}:item)});}}}/>)}
      </div>
      <div className="diagram-paint-stop-fields">
        <ColorPicker aria-label={label+'色标颜色'} value={selected.color} onChange={color=>stop({color})}/>
        <label>位置<input aria-label={label+'色标位置'} type="number" min={0} max={100} value={selected.offset} onChange={e=>stop({offset:e.currentTarget.valueAsNumber})}/>%</label>
        <button type="button" disabled={value.stops.length>=12} onClick={()=>{const id=crypto.randomUUID();patch({stops:[...value.stops,{id,offset:50,color:selected.color,opacity:1}]});setStopId(id);}}>添加色标</button>
        <button type="button" disabled={value.stops.length<=2} onClick={()=>{patch({stops:value.stops.filter(s=>s.id!==selected.id)});setStopId(value.stops.find(s=>s.id!==selected.id)!.id);}}>删除色标</button>
      </div>
      <label className="diagram-decoration-range">色标透明度<input aria-label={label+'色标透明度'} type="range" min={0} max={100} value={Math.round(selected.opacity*100)} onChange={e=>stop({opacity:e.currentTarget.valueAsNumber/100})}/><output>{Math.round(selected.opacity*100)}%</output></label>
      {alongRibbon&&<p className="diagram-pdf-hint">渐变随彩带转弯。0° 沿彩带前进，90° 横跨彩带；中心 X 为沿程位置，中心 Y 为宽度位置。</p>}
      {value.kind==='linear'?<label className="diagram-decoration-range">渐变方向<input aria-label={label+'渐变方向'} type="range" min={0} max={360} value={value.angle} onChange={e=>patch({angle:e.currentTarget.valueAsNumber})}/><output>{value.angle}°</output></label>:<div className="diagram-paint-radial">{([['centerX','中心 X',0,100],['centerY','中心 Y',0,100],['radius','范围',1,150]] as const).map(([key,text,min,max])=><label key={key}>{text}<input aria-label={label+text} type="number" min={min} max={max} value={value[key]} onChange={e=>patch({[key]:e.currentTarget.valueAsNumber})}/>%</label>)}</div>}
    </>}
  </div>;
}

const schemes=[
  {name:'白底深灰',start:'#ffffff',end:'#ffffff',ribbon:'#9dada5'},
  {name:'暖桃酒红',start:'#fff7ef',end:'#f2c9b8',ribbon:'#7a1725'},
  {name:'清绿墨绿',start:'#fbfcf5',end:'#dce9d6',ribbon:'#345b47'},
  {name:'雾蓝靛蓝',start:'#fafcff',end:'#dbe8f4',ribbon:'#375676'},
  {name:'柔紫深紫',start:'#fffafc',end:'#e9dff0',ribbon:'#75546d'},
];

const decorationTabs=['background','ribbon','paint'] as const;
export type DiagramDecorationTab=typeof decorationTabs[number];
export default function DiagramExportDecorationControls({options,onChange,editing,onEditingChange,onResetNodes,tab,onTabChange,children}:{options:DiagramPDFOptions;onChange:(patch:Partial<DiagramPDFOptions>)=>void;editing:boolean;onEditingChange:(enabled:boolean)=>void;onResetNodes:()=>void;tab:DiagramDecorationTab;onTabChange:(tab:DiagramDecorationTab)=>void;children:ReactNode}){
  const background=options.pageBackground??defaultDiagramPDFPaint(),ribbon=options.ribbon??defaultDiagramPDFRibbon();
  const arrowColor=ribbon.arrowColor??DEFAULT_RIBBON_ARROW_COLOR;
  const arrowOpacity=diagramPDFRibbonArrowOpacity(ribbon);
  const arrowOpacityPercent=Math.round(arrowOpacity*100);
  const arrowStyle=ribbon.arrowStyle??DEFAULT_RIBBON_ARROW_STYLE;
  const arrowThickness=ribbon.arrowThicknessPercent??DEFAULT_RIBBON_ARROW_THICKNESS;
  return <>
    <div className="diagram-export-schemes" role="group" aria-label="页面配色方案">{schemes.map(scheme=><button type="button" key={scheme.name} title={scheme.name} aria-label={scheme.name} onClick={()=>onChange({pageBackground:{...defaultDiagramPDFPaint(scheme.start),kind:scheme.start===scheme.end?'solid':'linear',stops:[{id:'start',offset:0,color:scheme.start,opacity:1},{id:'end',offset:100,color:scheme.end,opacity:1}]},ribbon:{...ribbon,paint:defaultDiagramPDFPaint(scheme.ribbon)},pageTextColor:'#293d35'})}><i style={{background:'linear-gradient(110deg,'+scheme.start+','+scheme.end+')'}}><b style={{background:scheme.ribbon}}/></i><span>{scheme.name}</span></button>)}</div>
    <div className="diagram-decoration-tabs" role="tablist" aria-label="背景和彩带设置" onKeyDown={event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const count=decorationTabs.length,index=decorationTabs.indexOf(tab);
      const next=decorationTabs[event.key==='Home'?0:event.key==='End'?count-1:(index+(event.key==='ArrowLeft'?count-1:1))%count];
      onTabChange(next);event.currentTarget.querySelector<HTMLButtonElement>('[data-decoration-tab="'+next+'"]')?.focus();
    }}>{decorationTabs.map(key=><button type="button" key={key} role="tab" data-decoration-tab={key} tabIndex={tab===key?0:-1} aria-selected={tab===key} onClick={()=>onTabChange(key)}>{{background:'页面背景',ribbon:'蛇形彩带',paint:'彩带上色'}[key]}</button>)}</div>
    {tab==='background'?<>
      <PaintEditor label="页面背景" value={background} onChange={pageBackground=>onChange({pageBackground})}/>
      <label className="diagram-paint-color">文字颜色<ColorPicker aria-label="页面文字颜色" value={options.pageTextColor??'#293d35'} onChange={pageTextColor=>onChange({pageTextColor})}/></label>
    </>:tab==='paint'?children:<>
      <label className="diagram-pdf-check"><input type="checkbox" checked={ribbon.enabled&&options.readingOrder==='snake'} onChange={e=>{onChange({readingOrder:'snake',ribbon:{...ribbon,enabled:e.currentTarget.checked}});if(!e.currentTarget.checked)onEditingChange(false);}}/>显示蛇形彩带</label>
      <div className="diagram-ribbon-settings" inert={!ribbon.enabled||options.readingOrder!=='snake'||undefined}>
        <label className="diagram-decoration-range">彩带宽度<input aria-label="彩带宽度" type="range" min={1} max={40} value={ribbon.widthMm} onChange={e=>onChange({ribbon:{...ribbon,widthMm:e.currentTarget.valueAsNumber}})}/><output>{ribbon.widthMm} mm</output></label>
        <label className="diagram-decoration-range">彩带透明度<input aria-label="彩带透明度" type="range" min={0} max={100} value={Math.round(ribbon.opacity*100)} onChange={e=>onChange({ribbon:{...ribbon,opacity:e.currentTarget.valueAsNumber/100}})}/><output>{Math.round(ribbon.opacity*100)}%</output></label>
        <PaintEditor label="彩带颜色" value={ribbon.paint} alongRibbon onChange={paint=>onChange({ribbon:{...ribbon,paint}})}/>
        <label className="diagram-pdf-check">
          <input type="checkbox" checked={ribbon.showArrows??false} onChange={e=>onChange({ribbon:{...ribbon,showArrows:e.currentTarget.checked}})}/>
          显示宽箭头
        </label>
        <div className="diagram-export-alignment diagram-ribbon-arrow-styles">
          <span>箭头样式</span>
          <div role="group" aria-label="箭头样式">
            {([['double','双箭头'],['solid','实心三角']] as const).map(([style,label])=>(
              <button key={style} type="button" disabled={!ribbon.showArrows} aria-pressed={arrowStyle===style}
                onClick={()=>onChange({ribbon:{...ribbon,arrowStyle:style}})}>
                <svg aria-hidden="true" viewBox={style==='solid'?'-0.8 -0.55 1.6 1.1':'-0.65 -0.52 1.3 1.04'} width="25" height="18">
                  <path d={diagramPDFRibbonArrowIconPath(style,arrowThickness)} fill="currentColor"/>
                </svg>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="diagram-decoration-range">{arrowStyle==='solid'?'三角高度':'箭头粗细'}
          <input aria-label={arrowStyle==='solid'?'三角高度':'箭头粗细'} type="range" min={MIN_RIBBON_ARROW_THICKNESS} max={MAX_RIBBON_ARROW_THICKNESS} step={5}
            value={arrowThickness} aria-valuetext={arrowThickness+'%'} disabled={!ribbon.showArrows}
            onChange={e=>onChange({ribbon:{...ribbon,arrowThicknessPercent:e.currentTarget.valueAsNumber}})}/>
          <output>{arrowThickness}%</output>
        </label>
        <div className="diagram-ribbon-arrow-paint">
          <label className="diagram-paint-color">箭头颜色
            <ColorPicker aria-label="宽箭头颜色" value={arrowColor} disabled={!ribbon.showArrows}
              onChange={arrowColor=>onChange({ribbon:{...ribbon,arrowColor,arrowOpacity}})}/>
          </label>
          <label className="diagram-decoration-range">不透明度
            <input aria-label="箭头不透明度" type="range" min={0} max={100} value={arrowOpacityPercent} aria-valuetext={arrowOpacityPercent+'%'}
              disabled={!ribbon.showArrows} onChange={e=>onChange({ribbon:{...ribbon,arrowOpacity:e.currentTarget.valueAsNumber/100}})}/>
            <output>{arrowOpacityPercent}%</output>
          </label>
        </div>
        <div className="diagram-ribbon-node-actions"><button type="button" aria-pressed={editing} onClick={()=>onEditingChange(!editing)}>{editing?'完成节点调整':'调整彩带节点'}</button><button type="button" onClick={onResetNodes}>复位本页节点</button></div>
        <p className="diagram-pdf-hint">拖动节点改变路径，双击彩带添加节点；选中节点后按 Delete 删除，方向键微调。</p>
      </div>
    </>}
  </>;
}
