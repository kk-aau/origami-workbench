import {useState} from 'react';
import {previewOrieditaDisplay,isCreasePointStyle,type CreaseDisplay} from '../app/creaseDisplay';
import {LINE_STYLES,isCreaseLineStyle,AUXILIARY_LINE_STYLES,isAuxiliaryLineStyle} from '../app/creaseLineStyle';
const labels:Record<keyof CreaseDisplay,string>={lineWidth:'主线宽（像素）',auxLineWidth:'辅助线宽（像素）',auxLineStyle:'辅助线样式',markLineWidth:'独立标记线宽（像素）',roundedEnds:'圆头端点',lineStyle:'山谷线显示样式',pointSize:'顶点标记大小',pointStyle:'点样式',antiAlias:'抗锯齿显示',showToolGuide:'顶部操作说明',showCursorHint:'鼠标旁操作提示'};
const show=(value:number|boolean|string|undefined)=>value===undefined?'默认':typeof value==='boolean'?(value?'开启':'关闭'):isCreaseLineStyle(value)?LINE_STYLES[value]:isAuxiliaryLineStyle(value)?AUXILIARY_LINE_STYLES[value]:isCreasePointStyle(value)?{hollow:'空心圆',square:'实心方块',circle:'实心圆'}[value]:String(value);
export default function OriconfigDisplayImport({config,current,onApply,native=false}:{native?:boolean;config:Record<string,unknown>;current:CreaseDisplay;onApply:(next:CreaseDisplay)=>void}){
 const [error,setError]=useState(''),[saved,setSaved]=useState(false);
 const preview=previewOrieditaDisplay(config,current,native),changes=preview.settings?(Object.keys(labels) as (keyof CreaseDisplay)[]).filter(key=>preview.recognized.includes(key)&&preview.settings![key]!==current[key]):[];
 function apply(){if(!preview.settings||!changes.length)return;try{onApply(preview.settings);setError('');setSaved(true);}catch(e){setError(e instanceof Error?e.message:String(e));setSaved(false);}}
 return <fieldset aria-label="显示配置迁移"><legend>显示配置 · 独立确认</legend>
  <p className="note">支持主线宽、辅助线宽、圆头端点、顶点标记大小、山谷线显示样式和抗锯齿开关；不改变快捷键或作品。浏览器绘制与 Java 抗锯齿效果可能不同。</p>
  {native&&<p className="note">工作台扩展另支持独立标记线宽、辅助线样式、点样式和操作提示开关；不将这些字段当作原版 Java 配置。</p>}
  {!!preview.ignored.length&&<details><summary>未支持的显示配置字段：{preview.ignored.length} 项，不会导入</summary><p style={{maxHeight:120,overflow:'auto',overflowWrap:'anywhere'}}>{preview.ignored.join('、')}</p></details>}
  {!!preview.issues.length&&<ul role="alert">{preview.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
  <ul>{changes.map(key=><li key={key}>{labels[key]}：{show(current[key])} → {show(preview.settings![key])}</li>)}</ul>
  {!preview.recognized.length&&!preview.issues.length&&<p className="note">此包没有可迁移的显示字段。</p>}
  {!!preview.recognized.length&&!changes.length&&!preview.issues.length&&<p className="note">支持的显示字段与当前值一致。</p>}
  <button className="primary" disabled={!preview.settings||!changes.length} onClick={apply}>确认仅导入显示设置</button>
  {error&&<p role="alert">{error}</p>}{saved&&<p role="status">显示设置已导入；快捷键和作品未改变。</p>}
 </fieldset>;
}
