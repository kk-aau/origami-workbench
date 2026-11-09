import {useState} from 'react';
import {defaultCanvasZoom,validateCanvasZoom,type CanvasZoomSettings as Settings} from '../app/canvasZoom';
export default function CanvasZoomSettings({value,onSave}:{value:Settings;onSave:(value:Settings)=>void}){
 const [precise,setPrecise]=useState(value.preciseZoom),[speed,setSpeed]=useState(String(value.zoomSpeed)),[error,setError]=useState(''),[message,setMessage]=useState('');
 function save(next:Settings){try{onSave(validateCanvasZoom(next));setPrecise(next.preciseZoom);setSpeed(String(next.zoomSpeed));setError('');setMessage('鼠标缩放设置已保存。');}catch(e){setError(e instanceof Error?e.message:String(e));setMessage('');}}
 return <section aria-label="鼠标缩放设置"><h3>鼠标缩放</h3><p className="note">用于折痕编辑和镶嵌预览，围绕鼠标位置缩放。按住滚轮拖动画布不受影响；不改变作品数据。</p>
 <label><input type="checkbox" checked={precise} onChange={e=>setPrecise(e.target.checked)}/>精细缩放</label>
 <p className="note">开启时按滚动距离连续缩放，适合触控板；关闭时每次滚动事件按一档缩放。浏览器滚动单位与原版 Java 不同，已统一换算。</p>
 <label className="select-field">缩放速度<input aria-label="缩放速度" type="number" min="0" max="10" step="0.1" value={speed} onChange={e=>setSpeed(e.target.value)}/></label>
 <p className="note">默认 1；0 关闭滚轮缩放，仍可使用缩放按钮。</p>
 <div className="button-pair"><button className="primary" onClick={()=>save({preciseZoom:precise,zoomSpeed:speed.trim()?Number(speed):NaN})}>保存鼠标设置</button><button onClick={()=>save(defaultCanvasZoom())}>恢复默认鼠标设置</button></div>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
