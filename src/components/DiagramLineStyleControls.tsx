import {useEffect,useState} from 'react';
import {DIAGRAM_ANNOTATION_LIMITS,DIAGRAM_STROKE_PATTERNS,type DiagramLineStyle} from '../app/diagramAnnotations';
import {LINE_LABELS} from '../app/diagramAnnotationSVG';
import {DIAGRAM_LINE_STYLES,DIAGRAM_STROKE_PATTERN_LABELS,diagramLineDasharray,type DiagramLineAppearance,type DiagramLineDefaults} from '../app/diagramLineStyles';
import ColorPicker from '../ui/ColorPicker';
import './DiagramLineStyleControls.css';
import {useAdaptiveLineStyle} from '../app/useAdaptiveLineStyle';
import {adaptiveLineStroke} from '../app/adaptiveLineStyle';

interface AppearanceProps {
  value:DiagramLineAppearance;
  onChange:(patch:Partial<DiagramLineAppearance>)=>void;
  disabled?:boolean;
  ariaLabel?:string;
}
/** Shared by the global category bar and the selected-line inspector. */
export function DiagramLineAppearanceControls({value,onChange,disabled=false,ariaLabel='线条外观'}:AppearanceProps) {
  const [widthText,setWidthText]=useState(String(value.width));
  useEffect(()=>setWidthText(String(value.width)),[value.width]);
  const color=value.color.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i,'#$1$1$2$2$3$3');
  return <fieldset className="diagram-line-appearance" disabled={disabled} aria-label={ariaLabel}>
    <label className="diagram-line-color-control"><span>颜色</span><ColorPicker aria-label={`${ariaLabel}颜色`} title={color.toUpperCase()} value={color} disabled={disabled} onChange={color=>onChange({color})}/></label>
    <label className="diagram-line-width-control"><span>粗细</span><input type="number" inputMode="decimal" aria-label={`${ariaLabel}粗细（毫米）`} title="绘图线宽（毫米）" min={DIAGRAM_ANNOTATION_LIMITS.minimumWidth} max={DIAGRAM_ANNOTATION_LIMITS.width} step="any" value={widthText} onChange={event=>{
      const raw=event.currentTarget.value,next=event.currentTarget.valueAsNumber;setWidthText(raw);
      if(raw.trim()&&Number.isFinite(next)&&next>=DIAGRAM_ANNOTATION_LIMITS.minimumWidth&&next<=DIAGRAM_ANNOTATION_LIMITS.width)onChange({width:next});
    }} onBlur={()=>setWidthText(String(value.width))}/><small>mm</small></label>
    <label className="diagram-line-pattern-control"><span>线型</span><select aria-label={`${ariaLabel}线型`} value={value.strokePattern} onChange={event=>onChange({strokePattern:event.currentTarget.value as DiagramLineAppearance['strokePattern']})}>
      {DIAGRAM_STROKE_PATTERNS.map(pattern=><option key={pattern} value={pattern}>{DIAGRAM_STROKE_PATTERN_LABELS[pattern]}</option>)}
    </select></label>
  </fieldset>;
}

interface Props {
  lineStyle:DiagramLineStyle;
  defaults:DiagramLineDefaults;
  onLine:(style:DiagramLineStyle)=>void;
  onChange:(style:DiagramLineStyle,patch:Partial<DiagramLineAppearance>)=>void;
  disabled?:boolean;
}
export function DiagramLineStyleControls({lineStyle,defaults,onLine,onChange,disabled=false}:Props) {
  const [adaptiveLines,setAdaptiveLines]=useAdaptiveLineStyle();
  const [adaptiveError,setAdaptiveError]=useState('');
  return <div className="diagram-line-style-controls" data-diagram-line-style-controls="true">
    <div className="diagram-line-category-controls" role="group" aria-label="选择绘图线条类别">
      {DIAGRAM_LINE_STYLES.map(style=>{
        const paint=defaults[style],width=Math.max(.9,Math.min(2.4,paint.width*1.6)),label=LINE_LABELS[style];
        const preview=adaptiveLineStroke(30,width,diagramLineDasharray(style,width,paint.strokePattern),{enabled:adaptiveLines,units:1,linecap:'round'});
        return <button key={style} type="button" data-diagram-line-category={style} aria-label={`绘制${label}`} aria-pressed={lineStyle===style} disabled={disabled} title={style==='boundary'?'绘制边界标记；不改变纸张或 CP':`绘制${label}`} onClick={()=>onLine(style)}>
          <svg viewBox="0 0 34 10" aria-hidden="true"><line x1="2" y1="5" x2="32" y2="5" stroke={paint.color} strokeWidth={preview.width} strokeLinecap="round" strokeDasharray={preview.dash} strokeDashoffset={preview.dashOffset}/></svg><span>{label}</span>
        </button>;
      })}
    </div>
    <DiagramLineAppearanceControls key={lineStyle} value={defaults[lineStyle]} onChange={patch=>onChange(lineStyle,patch)} disabled={disabled} ariaLabel={`${LINE_LABELS[lineStyle]}全局`}/>
    <label className="diagram-adaptive-line-control" title="按显示长度调整虚线密度和粗细，帮助区分短折痕；与折痕编辑共用设置"><input type="checkbox" aria-label="自适应线型" checked={adaptiveLines} disabled={disabled} onChange={event=>{try{setAdaptiveLines(event.currentTarget.checked);setAdaptiveError('');}catch{setAdaptiveError('显示设置未保存，请检查本机存储后重试。');}}}/>自适应线型</label>
    {adaptiveError&&<span role="alert">{adaptiveError}</span>}
  </div>;
}
export default DiagramLineStyleControls;
