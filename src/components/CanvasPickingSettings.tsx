import {useState} from 'react';
import {defaultCanvasPicking,validateCanvasPicking,type CanvasPicking} from '../app/canvasPicking';
export default function CanvasPickingSettings({value,onSave}:{value:CanvasPicking;onSave:(value:CanvasPicking)=>void}){
 const [radius,setRadius]=useState(String(value.mouseRadius)),[spotlight,setSpotlight]=useState(value.displayPointSpotlight),[offset,setOffset]=useState(value.displayPointOffset),[error,setError]=useState(''),[message,setMessage]=useState('');
 function save(next:CanvasPicking){try{onSave(validateCanvasPicking(next));setRadius(String(next.mouseRadius));setSpotlight(next.displayPointSpotlight);setOffset(next.displayPointOffset);setError('');setMessage('拾取设置已保存。');}catch(e){setError(e instanceof Error?e.message:String(e));setMessage('');}}
 return <section aria-label="鼠标拾取设置"><h3>鼠标拾取</h3>
 <label className="select-field">拾取半径（屏幕像素）<input aria-label="拾取半径" type="number" min="2" max="100" step="1" value={radius} onChange={e=>setRadius(e.target.value)}/></label>
 <p className="note">默认 10。用于几何工具的点吸附、线段／圆拾取、右击删除和构造候选确认；缩放后屏幕范围保持不变。文字、框选规则及拖动阈值不受影响。</p>
 <label className="checkbox"><input type="checkbox" checked={spotlight} onChange={e=>setSpotlight(e.target.checked)}/>显示拾取范围圆</label>
 <label className="checkbox"><input type="checkbox" checked={offset} onChange={e=>setOffset(e.target.checked)}/>显示鼠标中心指示线</label>
 <p className="note">指示线只帮助定位鼠标中心，不移动实际点击位置。指示图形不参与选择或导出。</p>
 <div className="button-pair"><button className="primary" onClick={()=>save({mouseRadius:radius.trim()?Number(radius):NaN,displayPointSpotlight:spotlight,displayPointOffset:offset})}>保存拾取设置</button><button onClick={()=>save(defaultCanvasPicking())}>恢复默认拾取设置</button></div>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
