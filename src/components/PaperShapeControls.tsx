import TessNumberField from './TessNumberField';
import {defaultTessPaper,type TessPaperSpec} from '../app/tessellation';
import './paperShapeControls.css';

/** The missing value keeps an older project's original pattern-edge paper. */
export default function PaperShapeControls({value,onChange,canExtend=true}:{value?:TessPaperSpec;onChange:(paper?:TessPaperSpec)=>void;canExtend?:boolean}){
  const selectShape=(shape:string)=>{
    if(shape==='legacy'){onChange(undefined);return;}
    const margin=value?.margin??defaultTessPaper().margin;
    // A new paper for a non-extending family is explicit inner clipping.
    // Existing saved paper keeps its mode until the user changes it.
    const fit=value?.fit??(!value&&!canExtend?'inscribed':undefined);
    const mode=fit?{fit}:{};
    if(shape==='rectangle')onChange({shape,aspect:value?.aspect??1.5,margin,...mode});
    else if(shape==='regular')onChange({shape,sides:value?.sides??6,margin,...mode});
    else onChange({shape:'square',margin,...mode});
  };
  const fit=value?.fit??'extend',inscribed=fit==='inscribed';
  return <div className="paper-shape-controls" aria-label="镶嵌纸张">
    <div className={'paper-shape-row'+(value?' has-paper':'')}>
      <label className="select-field">纸张<select aria-label="纸张形状" value={value?.shape??'legacy'} onChange={event=>selectShape(event.target.value)}>
        <option value="legacy">原图案边界</option><option value="square">正方形</option><option value="rectangle">矩形</option><option value="regular">正多边形</option>
      </select></label>
      {value&&<><label className="select-field">方式<select aria-label="纸张方式" value={fit} onChange={event=>{const fit=event.target.value as 'extend'|'inscribed';onChange({...value,fit,margin:fit==='inscribed'?Math.min(.45,value.margin):value.margin});}}>
        <option value="extend" disabled={!canExtend}>外延</option><option value="inscribed">内切</option>
      </select></label><div title={inscribed?'缩小纸张并裁去外围图样；重新检查剩余折痕。':'相对核心图样跨度；图案继续延伸到新纸边。'}><TessNumberField key={fit} label={inscribed?'内缩比例':'外延比例'} value={value.margin} min={.02} max={inscribed?.45:1} step={.01} onChange={margin=>onChange({...value,margin})}/></div></>}
    </div>
    {value?.shape==='rectangle'&&<TessNumberField label="宽高比" value={value.aspect??1.5} min={.2} max={5} step={.1} onChange={aspect=>onChange({...value,aspect})}/>}
    {value?.shape==='regular'&&<TessNumberField label="边数" value={value.sides??6} min={3} max={12} onChange={sides=>onChange({...value,sides})}/>}
  </div>;
}
