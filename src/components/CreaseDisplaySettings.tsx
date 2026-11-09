import {useState} from 'react';
import {defaultCreaseDisplay,validateCreaseDisplay,type CreaseDisplay,type CreasePointStyle} from '../app/creaseDisplay';
import {LINE_STYLES,AUXILIARY_LINE_STYLES,type CreaseLineStyle,type AuxiliaryLineStyle} from '../app/creaseLineStyle';
import {useAdaptiveLineStyle} from '../app/useAdaptiveLineStyle';
export default function CreaseDisplaySettings({value,onSave}:{value:CreaseDisplay;onSave:(value:CreaseDisplay)=>void}){
 const [adaptive,setAdaptive]=useAdaptiveLineStyle();
 const [markWidth,setMarkWidth]=useState(String(value.markLineWidth??1.3));
 const [style,setStyle]=useState(value.lineStyle);
 const [auxStyle,setAuxStyle]=useState(value.auxLineStyle);
 const [pointSize,setPointSize]=useState(String(value.pointSize));
 const [pointStyle,setPointStyle]=useState<CreasePointStyle>(value.pointStyle??'hollow');
 const [showToolGuide,setShowToolGuide]=useState(value.showToolGuide!==false),[showCursorHint,setShowCursorHint]=useState(value.showCursorHint!==false);
 const [main,setMain]=useState(String(value.lineWidth)),[aux,setAux]=useState(String(value.auxLineWidth)),[rounded,setRounded]=useState(value.roundedEnds),[antiAlias,setAntiAlias]=useState(value.antiAlias),[error,setError]=useState(''),[message,setMessage]=useState('');
 function changeAdaptive(enabled:boolean){try{setAdaptive(enabled);setError('');setMessage('自适应线型设置已保存。');}catch(e){setError(e instanceof Error?e.message:String(e));setMessage('');}}
 function save(next:CreaseDisplay){try{onSave(validateCreaseDisplay(next));setMain(String(next.lineWidth));setMarkWidth(String(next.markLineWidth??1.3));setAux(String(next.auxLineWidth));setRounded(next.roundedEnds);setAntiAlias(next.antiAlias);setStyle(next.lineStyle);setAuxStyle(next.auxLineStyle);setPointSize(String(next.pointSize));setPointStyle(next.pointStyle??'hollow');setShowToolGuide(next.showToolGuide!==false);setShowCursorHint(next.showCursorHint!==false);setError('');setMessage('显示设置已保存。');}catch(e){setError(e instanceof Error?e.message:String(e));setMessage('');}}
 return <section aria-label="折痕显示设置"><h3>折痕显示</h3><p className="note">用于编辑画布、镶嵌预览及折痕图 SVG／PNG／JPG／打印。导出线宽按 96 DPI 换算；不修改作品几何、吸附范围或 CP／FOLD 数据。构造参考线与选中提示保持独立样式。</p>
  <div className="button-pair"><label className="select-field">主线宽（像素）<input type="number" aria-label="主线宽" min="0.5" max="20" step="0.1" value={main} onChange={e=>setMain(e.target.value)}/></label><label className="select-field">辅助线宽（像素）<input type="number" aria-label="辅助线宽" min="0.5" max="20" step="0.1" value={aux} onChange={e=>setAux(e.target.value)}/></label></div>
  <label className="select-field">独立标记线宽（像素）<input type="number" aria-label="独立标记线宽" min="0.5" max="20" step="0.1" value={markWidth} onChange={e=>setMarkWidth(e.target.value)}/></label><p className="note">统一调整所有独立标记；不影响辅助折痕、圆、文字或构造预览。</p>
  <label className="select-field">山谷线显示样式<select aria-label="山谷线显示样式" value={style} onChange={e=>setStyle(e.target.value as CreaseLineStyle)}>{Object.entries(LINE_STYLES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <p className="note">样式只改变山、谷与边界的显示；辅助线保留自定义颜色，未指派线仍以专用虚线区分。</p>
  <label className="select-field">辅助线样式<select aria-label="辅助线样式" value={auxStyle} onChange={e=>setAuxStyle(e.target.value as AuxiliaryLineStyle)}>{Object.entries(AUXILIARY_LINE_STYLES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <p className="note">默认显示为实线，仍是辅助线，不参与折叠计算；临时构造引导线保留原样式。</p>
  <label className="checkbox"><input type="checkbox" aria-label="自适应线型" checked={adaptive} onChange={e=>changeAdaptive(e.target.checked)}/>自适应线型</label>
  <p className="note">即时应用于折痕编辑、折序绘图和图像／PDF 导出。短线会缩短节距以保留山谷特征；极短线仍需放大查看。</p>
  <label><input type="checkbox" checked={rounded} onChange={e=>setRounded(e.target.checked)}/>圆头端点</label>
  <label className="select-field">点样式<select aria-label="点样式" value={pointStyle} onChange={e=>setPointStyle(e.target.value as CreasePointStyle)}><option value="hollow">空心圆</option><option value="square">实心方块</option><option value="circle">实心圆</option></select></label>
  <label className="select-field">顶点标记大小<input type="number" aria-label="顶点标记大小" min="0" max="20" step="1" value={pointSize} onChange={e=>setPointSize(e.target.value)}/></label>
  <p className="note">缩小时标记同步变小；放大时交点不超过默认大小，端点不超过设定大小。0 隐藏端点标记，不关闭交点选择或吸附。点大小调整所选样式的外半径或半边长；辅助线端点不额外标记。</p>
  <label className="checkbox"><input type="checkbox" checked={antiAlias} onChange={e=>setAntiAlias(e.target.checked)}/>抗锯齿显示</label><p className="note">关闭后使用更锐利的像素边缘，适合低分辨率截图；不改变 SVG 几何或线宽。</p>
  <h3>操作提示</h3>
  <label className="checkbox"><input type="checkbox" checked={showToolGuide} onChange={e=>setShowToolGuide(e.target.checked)}/>显示顶部操作说明</label>
  <label className="checkbox"><input type="checkbox" checked={showCursorHint} onChange={e=>setShowCursorHint(e.target.checked)}/>悬浮提示（鼠标旁操作说明）</label>
  <p className="note">保存后应用并记住选择。关闭提示仍可使用工具参数和确认按钮；操作失败会保留错误提示。</p>
  <div className="button-pair"><button className="primary" onClick={()=>save({lineWidth:Number(main),auxLineWidth:Number(aux),auxLineStyle:auxStyle,markLineWidth:markWidth.trim()?Number(markWidth):NaN,roundedEnds:rounded,lineStyle:style,pointSize:pointSize.trim()?Number(pointSize):NaN,pointStyle,antiAlias,showToolGuide,showCursorHint})}>保存显示设置</button><button onClick={()=>{save(defaultCreaseDisplay());changeAdaptive(true);}}>恢复默认显示</button></div>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
