import {useEffect,useId,useRef,useState} from 'react';
import type {DiagramLineStyle} from '../app/diagramAnnotations';
import {diagramAnnotationMarkup} from '../app/diagramAnnotationSVG';
import {evaluateDiagramRatio} from '../app/diagramPrecisionTools';
import {DIAGRAM_ANGLE_PRESET_MIN,DIAGRAM_ANGLE_PRESET_MAX,isValidDiagramAnglePreset} from '../app/diagramAnglePreset';
import type {DiagramDrawingTool} from './DiagramDrawingCanvas';
import {Icon} from './Fields';
import './DiagramPrecisionToolbar.css';

export interface DiagramPrecisionSettings {ratioA:number;ratioB:number;expression:string}
interface Props {
  showLineStyles?:boolean;tool:DiagramDrawingTool;lineStyle:DiagramLineStyle;disabled:boolean;angle:number;pointCount:number;
  precision:DiagramPrecisionSettings;onPrecision:(settings:DiagramPrecisionSettings)=>void;
  onLine:(style:DiagramLineStyle)=>void;onPointTool:(tool:'ratio-point'|'special-point')=>void;
  onAngle:(angle:number)=>void;onClearPoints:()=>void;
}
const STYLES:[DiagramLineStyle,string][]=[['valley','谷折'],['mountain','峰折'],['crease','已有折痕'],['auxiliary','辅助线']];
const PRESET_ANGLES=[0,15,22.5,30,45,60,90];

export default function DiagramPrecisionToolbar({showLineStyles=true,tool,lineStyle,disabled,angle,pointCount,precision,onPrecision,onLine,onPointTool,onAngle,onClearPoints}:Props){
  const [panel,setPanel]=useState<'angle'|'ratio'|'special'|null>(null);
  const [customAngle,setCustomAngle]=useState(!PRESET_ANGLES.includes(angle));
  const [angleDraft,setAngleDraft]=useState(String(angle||22.5)),[angleError,setAngleError]=useState('');
  const angleInput=useRef<HTMLInputElement>(null),angleErrorId=useId();
  const toolbar=useRef<HTMLDivElement>(null);
  useEffect(()=>{setAngleDraft(String(angle||22.5));setAngleError('');},[angle]);
  useEffect(()=>{if(panel==='angle'&&customAngle){angleInput.current?.focus();angleInput.current?.select();}},[panel,customAngle]);
  useEffect(()=>{if(!panel)return;const outside=(event:PointerEvent)=>{if(!toolbar.current?.contains(event.target as Node))setPanel(null);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setPanel(null);};window.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape);return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape);};},[panel]);
  let value:number|undefined,error='';try{value=evaluateDiagramRatio(precision.expression);}catch(e){error=e instanceof Error?e.message:'表达式无效';}
  const change=(patch:Partial<DiagramPrecisionSettings>)=>onPrecision({...precision,...patch});
  function toggleAnglePanel(){
    if(panel==='angle'){setPanel(null);return;}
    setCustomAngle(!PRESET_ANGLES.includes(angle));setAngleDraft(String(angle||22.5));setAngleError('');setPanel('angle');
  }
  function applyCustomAngle(){
    const next=Number(angleDraft);
    if(!angleDraft.trim()||next===0||!isValidDiagramAnglePreset(next)){
      setAngleError(`请输入 ${DIAGRAM_ANGLE_PRESET_MIN}～${DIAGRAM_ANGLE_PRESET_MAX}° 之间的角度，可含小数。`);angleInput.current?.focus();return;
    }
    setAngleError('');setAngleDraft(String(next));onAngle(next);
  }
  function pointTool(kind:'ratio'|'special'){setPanel(panel===kind?null:kind);if(!disabled)onPointTool(kind==='ratio'?'ratio-point':'special-point');}
  return <div ref={toolbar} className="diagram-precision-toolbar" aria-label="绘线与精确取点工具" onKeyDown={e=>{if(e.key==='Escape')setPanel(null);}}>
    <div className="diagram-precision-buttons">
      {showLineStyles&&STYLES.map(([style,label])=><button type="button" key={style} disabled={disabled} aria-label={label} aria-pressed={['line','polyline'].includes(tool)&&lineStyle===style} onClick={()=>{setPanel(null);onLine(style);}}><svg viewBox="0 0 80 12" aria-hidden="true" dangerouslySetInnerHTML={{__html:diagramAnnotationMarkup({id:'style-'+style,kind:'line',a:[4,6],b:[76,6],style,color:'#426f59',width:1})}}/><span>{label}</span></button>)}
      <button type="button" disabled={disabled} aria-expanded={panel==='angle'} aria-pressed={angle>0} title={angle>0?`预设角度 · ${angle}°`:'预设角度 · 自由'} onClick={toggleAnglePanel}><Icon name="angledirection"/><span>预设角度</span></button>
      <button type="button" disabled={disabled} aria-expanded={panel==='ratio'} aria-pressed={tool==='ratio-point'} onClick={()=>pointTool('ratio')}><Icon name="ratio"/><span>比例分点</span></button>
      <button type="button" disabled={disabled} aria-expanded={panel==='special'} aria-pressed={tool==='special-point'} onClick={()=>pointTool('special')}><Icon name="addvertex"/><span>特殊取点</span></button>
    </div>
    {panel&&!disabled&&<div className="diagram-precision-panel" role="group" aria-label={panel==='angle'?'预设角度参数':panel==='ratio'?'比例分点参数':'特殊取点参数'}>
      <button type="button" className="diagram-precision-close" aria-label="关闭精确取点参数" onClick={()=>setPanel(null)}>×</button>
      {panel==='angle'?<>
        <label><span>角度间隔</span><select aria-label="预设角度间隔" value={customAngle?'custom':angle} onChange={e=>{
          setAngleError('');
          if(e.target.value==='custom'){setCustomAngle(true);setAngleDraft(String(angle||22.5));}
          else{setCustomAngle(false);onAngle(Number(e.target.value));}
        }}>{PRESET_ANGLES.map(a=><option key={a} value={a}>{a?a+'°':'自由'}</option>)}<option value="custom">自定义…</option></select></label>
        {customAngle&&<div className="diagram-custom-angle">
          <label><span>自定义</span><input ref={angleInput} type="number" aria-label="自定义角度间隔（度）" min={DIAGRAM_ANGLE_PRESET_MIN} max={DIAGRAM_ANGLE_PRESET_MAX} step="any" inputMode="decimal" value={angleDraft} aria-invalid={!!angleError} aria-describedby={angleError?angleErrorId:undefined} onChange={e=>{setAngleDraft(e.target.value);setAngleError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();applyCustomAngle();}}}/><span>°</span></label>
          <div className="diagram-custom-angle-actions"><button type="button" onClick={applyCustomAngle}>应用角度</button><button type="button" aria-label="取消自定义角度" onClick={()=>setPanel(null)}>取消</button></div>
          {angleError&&<p id={angleErrorId} className="is-error" role="alert">{angleError}</p>}
        </div>}
        <p>{customAngle?`支持 ${DIAGRAM_ANGLE_PRESET_MIN}～${DIAGRAM_ANGLE_PRESET_MAX}°，可含小数；点击“应用角度”或按 Enter 生效。`:''}从绘线起点按网格横轴限制方向。Shift 临时按 45°，Alt 暂停预设与吸附。</p>
      </>:panel==='ratio'?<><div className="diagram-precision-ratio"><label><span>AP</span><input type="number" aria-label="比例分点 AP" min="0.000001" max="1000000" step="1" value={precision.ratioA} onChange={e=>change({ratioA:Number(e.target.value)})}/></label><b>:</b><label><span>PB</span><input type="number" aria-label="比例分点 PB" min="0.000001" max="1000000" step="1" value={precision.ratioB} onChange={e=>change({ratioB:Number(e.target.value)})}/></label></div><p>依次点击第一端 A、第二端 B，按 AP : PB 得到定位点 P。</p></>:<><label><span>AP / AB</span><input type="text" aria-label="特殊取点表达式" maxLength={160} value={precision.expression} placeholder="(√2+1)/3" onChange={e=>change({expression:e.target.value})}/></label><div className="diagram-precision-examples">{['√2-1','(√2+1)/3','1/3'].map(expression=><button type="button" key={expression} onClick={()=>change({expression})}>{expression}</button>)}</div>{error?<p className="is-error" role="status">{error}</p>:<p>AP / AB ≈ {value!.toFixed(6)}。依次点击 A、B，定位点用于吸附绘线。</p>}</>}
      {panel!=='angle'&&pointCount>0&&<div className="diagram-precision-point-info"><span>{pointCount} 个定位点</span><button type="button" onClick={onClearPoints}>清除取点</button></div>}
    </div>}
  </div>;
}
