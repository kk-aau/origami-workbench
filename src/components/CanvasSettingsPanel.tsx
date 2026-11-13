import {useEffect,useId,useRef,useState} from 'react';
import type {CreaseDisplay} from '../app/creaseDisplay';
import {CANVAS_LINE_STYLES,LINE_STYLES,canvasLineStyleGroup,creaseLineStroke,type CanvasLineStyle,type CreaseLineStyle} from '../app/creaseLineStyle';
import {GRID_MAX,GRID_MIN,adjustGridDivisions,clampGridDivisions} from '../app/gridControls';
import {validateGridRotation,type GridPattern} from '../app/gridGeometry';
import {useAdaptiveLineStyle} from '../app/useAdaptiveLineStyle';
import type {Doc,Segment} from '../core/types';
import {NumberField} from './Fields';
import CanvasPaperSettings from './CanvasPaperSettings';
import './CanvasSettingsPanel.css';

export interface CanvasSettingsPanelProps {
  paper?:Doc;
  onPaperChange?:(doc:Doc)=>boolean;
  onPaperMessage?:(message:string)=>void;
  grid:boolean;
  onGridChange:(value:boolean)=>void;
  gridScope:'paper'|'canvas'|'off';
  onGridScopeChange:(value:'paper'|'canvas'|'off')=>void;
  divisions:number;
  onDivisionsChange:(value:number)=>void;
  diagonalGrid:boolean;
  onDiagonalGridChange:(value:boolean)=>void;
  gridPattern?:GridPattern;
  onGridPatternChange?:(value:GridPattern)=>void;
  gridRotation?:number;
  onGridRotationChange?:(degrees:number)=>void;
  snap:boolean;
  onSnapChange:(value:boolean)=>void;
  defaultDivisions:number;
  display:CreaseDisplay;
  onDisplayChange:(value:CreaseDisplay)=>void;
}

function LineSample({style,adaptive,rounded}:{style:CreaseLineStyle;adaptive:boolean;rounded:boolean}){
  return <svg className="canvas-style-sample" viewBox="0 0 204 24" aria-hidden="true">
    {(['M','V'] as const).map((assignment,index)=>{
      const x=26+index*104,y=12;
      const segment:Segment={id:`sample-${assignment}`,a:[x,y],b:[x+68,y],assignment,angle:assignment==='M'?-180:180};
      const stroke=creaseLineStroke(segment,style,1.6,1,adaptive,rounded);
      return <g key={assignment}><text x={x-24} y={y} dominantBaseline="central">{assignment==='M'?'山折':'谷折'}</text><line x1={x} x2={x+68} y1={y} y2={y} stroke={stroke.color} strokeWidth={stroke.width} strokeDasharray={stroke.dash} strokeDashoffset={stroke.dashOffset} strokeLinecap={rounded?'round':'butt'}/></g>;
    })}
  </svg>;
}

/** Numeric drafts can be incomplete while typing. Only valid values reach the
 * preference owner; blurring an invalid draft restores the last stored value. */
function DisplaySizeControl({label,value,min,max,step,integer=false,onChange}:{label:string;value:number;min:number;max:number;step:number;integer?:boolean;onChange:(value:number)=>void}){
  const id=useId(),[text,setText]=useState(String(value)),[error,setError]=useState('');
  const ownPublished=useRef<number|undefined>(undefined);
  useEffect(()=>{
    if(ownPublished.current!==value)setText(String(value));
    ownPublished.current=undefined;
    setError('');
  },[value]);
  const valid=(draft:string)=>draft.trim()!==''&&Number.isFinite(Number(draft))&&Number(draft)>=min&&Number(draft)<=max&&(!integer||Number.isInteger(Number(draft)));
  function publish(next:number){
    try{ownPublished.current=next;onChange(next);setError('');}
    catch(e){ownPublished.current=undefined;setError(e instanceof Error?e.message:String(e));}
  }
  function restore(){setText(String(value));ownPublished.current=undefined;}
  return <div className="canvas-display-size">
    <div className="canvas-display-size-heading"><label htmlFor={id}>{label}</label><span className="canvas-display-size-number"><input id={id} type="number" aria-label={label} title={`${label}（像素）`} min={min} max={max} step={step} value={text} aria-invalid={!valid(text)||!!error} aria-describedby={error?`${id}-error`:undefined} onChange={event=>{const next=event.target.value;setText(next);setError('');if(valid(next))publish(Number(next));}} onBlur={restore} onKeyDown={event=>{if(event.nativeEvent.isComposing||event.keyCode===229)return;if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.blur();}}}/><span>像素</span></span></div>
    <input type="range" aria-label={`${label}滑条`} min={min} max={max} step={step} value={value} onChange={event=>{const next=Number(event.target.value);setText(String(next));publish(next);}}/>
    {error&&<small id={`${id}-error`} className="canvas-settings-error" role="alert">{error}</small>}
  </div>;
}

function GridRotationControl({value,disabled,onChange}:{value:number;disabled:boolean;onChange:(degrees:number)=>void}){
  const label=(degrees:number)=>String(Number(degrees.toPrecision(12)));
  const id=useId(),[draft,setDraft]=useState(label(value)),[error,setError]=useState(''),skipCommit=useRef(false);
  useEffect(()=>{setDraft(label(value));setError('');},[value]);
  function publish(next:number){
    try{const degrees=validateGridRotation(next);onChange(degrees);setDraft(label(degrees));setError('');}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  function commit(){
    if(skipCommit.current){skipCommit.current=false;return;}
    if(draft===label(value)){setError('');return;}
    if(!draft.trim()){setError('请输入旋转角度');return;}
    publish(Number(draft));
  }
  return <div className="canvas-grid-rotation" title="绕纸张基准中心旋转方格及对角参考线">
    <label className="canvas-grid-rotation-field" htmlFor={id}><span>网格旋转</span><span className="canvas-grid-rotation-input"><input id={id} aria-label="网格旋转" type="number" step="any" value={draft} disabled={disabled} aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined} onChange={event=>{setDraft(event.target.value);setError('');}} onBlur={commit} onKeyDown={event=>{if(event.nativeEvent.isComposing||event.keyCode===229)return;if(event.key==='Enter'){event.preventDefault();event.stopPropagation();event.currentTarget.blur();}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();skipCommit.current=true;setDraft(label(value));setError('');event.currentTarget.blur();}}}/><span>°</span></span></label>
    <div className="canvas-grid-rotation-presets">{[0,45,90].map(degrees=><button key={degrees} type="button" aria-label={`网格旋转 ${degrees}°`} disabled={disabled} onClick={()=>publish(degrees)}>{degrees}°</button>)}</div>
    {error&&<small id={`${id}-error`} className="canvas-settings-error" role="alert">{error}</small>}
  </div>;
}

export default function CanvasSettingsPanel({paper,onPaperChange,onPaperMessage,grid,onGridChange,gridScope,onGridScopeChange,divisions,onDivisionsChange,diagonalGrid,onDiagonalGridChange,gridPattern='square',onGridPatternChange,gridRotation=0,onGridRotationChange,snap,onSnapChange,defaultDivisions,display,onDisplayChange}:CanvasSettingsPanelProps){
  const [adaptive,setAdaptive]=useAdaptiveLineStyle(),[error,setError]=useState('');
  const panelId=useId(),gridBodyId=`${panelId}-grid`,styleBodyId=`${panelId}-style`;
  const [gridCollapsed,setGridCollapsed]=useState(false),[styleCollapsed,setStyleCollapsed]=useState(false);
  const previousScope=useRef<'paper'|'canvas'>(gridScope==='canvas'?'canvas':'paper');
  useEffect(()=>{if(gridScope!=='off')previousScope.current=gridScope;},[gridScope]);
  const shown=grid&&gridScope!=='off',currentGroup=canvasLineStyleGroup(display.lineStyle);
  function changeScope(scope:CanvasSettingsPanelProps['gridScope']){onGridScopeChange(scope);onGridChange(scope!=='off');}
  function changeDisplay(patch:Partial<CreaseDisplay>){onDisplayChange({...display,...patch});}
  function selectStyle(style:CanvasLineStyle){try{changeDisplay({lineStyle:style});setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}
  function selectPointStyle(pointStyle:NonNullable<CreaseDisplay['pointStyle']>){try{changeDisplay({pointStyle});setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}
  return <div className="canvas-settings-panel" aria-label="画布设置">
    {paper&&onPaperChange&&<CanvasPaperSettings doc={paper} onApply={onPaperChange} onMessage={onPaperMessage}/>}
    <section className={'canvas-settings-section'+(gridCollapsed?' is-collapsed':'')}><div className="canvas-grid-heading"><h3><button type="button" className="canvas-section-toggle" aria-expanded={!gridCollapsed} aria-controls={gridBodyId} onClick={()=>setGridCollapsed(value=>!value)}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d={gridCollapsed?'m4 2 4 4-4 4':'m2 4 4 4 4-4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>网格与吸附</button></h3><button type="button" onClick={()=>{onDivisionsChange(clampGridDivisions(defaultDivisions));changeScope('paper');onDiagonalGridChange(false);onGridPatternChange?.('square');onGridRotationChange?.(0);}}>重置网格</button></div>
      <div id={gridBodyId} className="canvas-settings-body" hidden={gridCollapsed}>
      <div className="canvas-grid-visibility"><label className="canvas-setting-check" title="显示或隐藏网格"><input aria-label="显示网格" type="checkbox" checked={shown} onChange={event=>changeScope(event.target.checked?previousScope.current:'off')}/>网格</label><select aria-label="网格范围" title="网格显示范围" value={shown?gridScope:'off'} onChange={event=>changeScope(event.target.value as CanvasSettingsPanelProps['gridScope'])}><option value="paper">纸内</option><option value="canvas">全画布</option><option value="off">关闭</option></select><div className="canvas-grid-actions" role="group" aria-label="网格等分调整"><button type="button" aria-label="网格等分减半" disabled={divisions<=GRID_MIN} onClick={()=>onDivisionsChange(adjustGridDivisions(divisions,-1))}>÷2</button><NumberField label="网格等分" value={divisions} min={GRID_MIN} max={GRID_MAX} step={1} onChange={value=>onDivisionsChange(clampGridDivisions(value))}/><button type="button" aria-label="网格等分加倍" disabled={divisions>=GRID_MAX} onClick={()=>onDivisionsChange(adjustGridDivisions(divisions,1))}>×2</button></div></div>
      <div className="canvas-grid-options">{onGridPatternChange&&<label className="canvas-grid-pattern"><span>网格格式</span><select aria-label="网格格式" value={gridPattern==='triangular'?'triangular':diagonalGrid?'diagonal':'square'} disabled={!shown} onChange={event=>{const value=event.target.value;onGridPatternChange(value==='triangular'?'triangular':'square');onDiagonalGridChange(value==='diagonal');}}><option value="square">方格</option><option value="diagonal">方格＋对角</option><option value="triangular">正三角</option></select></label>}<div className="canvas-grid-checks">{!onGridPatternChange&&<label className="canvas-setting-check" title="显示原有对角参考线，吸附启用时可吸附线与网格交点"><input type="checkbox" checked={diagonalGrid} disabled={!shown} onChange={event=>onDiagonalGridChange(event.target.checked)}/>对角线</label>}<label className="canvas-setting-check" title="吸附网格、端点与交点"><input type="checkbox" checked={snap} onChange={event=>onSnapChange(event.target.checked)}/>吸附</label></div></div>
      {gridPattern==='square'&&onGridRotationChange&&<GridRotationControl value={gridRotation} disabled={!shown} onChange={onGridRotationChange}/>}
      </div>
    </section>
    <section className={'canvas-settings-section'+(styleCollapsed?' is-collapsed':'')}><div className="canvas-line-style-heading"><h3><button type="button" className="canvas-section-toggle" aria-expanded={!styleCollapsed} aria-controls={styleBodyId} onClick={()=>setStyleCollapsed(value=>!value)}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d={styleCollapsed?'m4 2 4 4-4 4':'m2 4 4 4 4-4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>折线样式</button></h3><select className="canvas-line-style-select" aria-label="折线样式" value={currentGroup} onChange={event=>selectStyle(event.target.value as CanvasLineStyle)}>{(Object.entries(CANVAS_LINE_STYLES) as [CanvasLineStyle,string][]).map(([style,label])=><option key={style} value={style}>{label}</option>)}</select></div>
      <div id={styleBodyId} className="canvas-settings-body" hidden={styleCollapsed}>
      <div className="canvas-line-preview" role="img" aria-label={`${LINE_STYLES[display.lineStyle]}：山折、谷折线型预览`}><LineSample style={display.lineStyle} adaptive={adaptive} rounded={display.roundedEnds}/></div>
      {currentGroup!==display.lineStyle&&<p className="canvas-settings-note">当前保留：{LINE_STYLES[display.lineStyle]}</p>}
      <DisplaySizeControl label="线宽" value={display.lineWidth} min={.5} max={20} step={.1} onChange={lineWidth=>changeDisplay({lineWidth})}/>
      <div className="canvas-point-controls"><label className="canvas-point-style"><span>点样式</span><select aria-label="点样式" value={display.pointStyle??'hollow'} onChange={event=>selectPointStyle(event.target.value as NonNullable<CreaseDisplay['pointStyle']>)}><option value="hollow">空心圆</option><option value="square">实心方块</option><option value="circle">实心圆</option></select></label><DisplaySizeControl label="点大小" value={display.pointSize} min={0} max={20} step={1} integer onChange={pointSize=>changeDisplay({pointSize})}/></div>
      <p className="canvas-settings-note">点大小按像素计，为半径或半边长；0 隐藏端点，仍可选择和吸附。</p>
      <label className="canvas-setting-check canvas-adaptive-check" title="短折痕自动缩短虚线间距，极短线可放大查看。"><input type="checkbox" checked={adaptive} onChange={event=>{try{setAdaptive(event.target.checked);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}/>自适应短线样式</label>
      {error&&<p className="canvas-settings-error" role="alert">{error}</p>}
      </div>
    </section>
  </div>;
}
