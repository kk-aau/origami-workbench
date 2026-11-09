import {useState} from 'react';
import {previewOrieditaMouse,MOUSE_ZOOM_LABELS,MOUSE_PICKING_LABELS} from '../app/orieditaMouseSettings';
import type {CanvasZoomSettings} from '../app/canvasZoom';
import type {CanvasPicking} from '../app/canvasPicking';
export interface MouseImportProps {zoom:CanvasZoomSettings;picking:CanvasPicking;onApplyZoom:(value:CanvasZoomSettings)=>void;onApplyPicking:(value:CanvasPicking)=>void}
function Group<T extends object>({name,current,preview,labels,onApply}:{name:string;current:T;preview:{settings:T|null;recognized:string[];issues:string[]};labels:Record<keyof T,string>;onApply:(value:T)=>void}){
 const [error,setError]=useState(''),[saved,setSaved]=useState(false);
 const changes=preview.settings?(Object.keys(labels) as (keyof T)[]).filter(key=>preview.settings![key]!==current[key]):[];
 const show=(v:unknown)=>typeof v==='boolean'?(v?'开启':'关闭'):String(v);
 return <fieldset aria-label={`${name}配置迁移`}><legend>{name}配置 · 独立确认</legend>
 {!!preview.issues.length&&<ul role="alert">{preview.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
 <ul>{changes.map(key=><li key={String(key)}>{labels[key]}：{show(current[key])} → {show(preview.settings![key])}</li>)}</ul>
 {!preview.recognized.length&&!preview.issues.length&&<p className="note">此包没有可迁移的{name}字段。</p>}
 {!!preview.recognized.length&&!changes.length&&!preview.issues.length&&<p className="note">支持的{name}字段与当前值一致。</p>}
 <button className="primary" disabled={!preview.settings||!changes.length} onClick={()=>{if(!preview.settings)return;try{onApply(preview.settings);setError('');setSaved(true);}catch(e){setError(e instanceof Error?e.message:String(e));setSaved(false);}}}>确认仅导入{name}设置</button>
 {error&&<p role="alert">{error}</p>}{saved&&<p role="status">{name}设置已导入；其他设置和作品未改变。</p>}
 </fieldset>;
}
export default function OriconfigMouseImport({config,zoom,picking,onApplyZoom,onApplyPicking}:MouseImportProps&{config:Record<string,unknown>}){
 const preview=previewOrieditaMouse(config,zoom,picking);
 return <section aria-label="鼠标配置迁移"><p className="note">仅迁移折痕编辑画布的缩放与拾取设置，各组独立确认；缺失字段保留当前值。浏览器滚轮单位经过换算，不等同于 Java 硬件转数。折叠模型、滚轮目标和其他偏好不在本次迁移范围。</p>
 <Group name="缩放" labels={MOUSE_ZOOM_LABELS} current={zoom} preview={preview.zoom} onApply={onApplyZoom}/>
 <Group name="拾取" labels={MOUSE_PICKING_LABELS} current={picking} preview={preview.picking} onApply={onApplyPicking}/>
 {!!preview.ignored.length&&<details><summary>不属于本组支持范围的字段：{preview.ignored.length} 项</summary><p style={{maxHeight:120,overflow:'auto',overflowWrap:'anywhere'}}>{preview.ignored.join('、')}</p></details>}
 </section>;
}
