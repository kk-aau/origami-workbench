import {useState} from 'react';
import type {GridAppearance} from '../app/gridAppearance';
import type {Theme} from '../app/theme';
import {previewWorkbenchPreferences,type WorkbenchPreferences} from '../app/oriconfigWorkbench';

export default function OriconfigWorkbenchImport({config,current,onApply}:{config:Record<string,unknown>;current:WorkbenchPreferences;onApply:(value:WorkbenchPreferences)=>void}){
 const [error,setError]=useState(''),[saved,setSaved]=useState(false);
 const preview=previewWorkbenchPreferences(config,current),changes=preview.settings?(['gridAppearance','theme'] as const).filter(key=>JSON.stringify(preview.settings![key])!==JSON.stringify(current[key])):[];
 const show=(key:'gridAppearance'|'theme',value:GridAppearance|Theme)=>key==='theme'?(value==='dark'?'深色':'浅色'):(()=>{const grid=value as GridAppearance;return `${grid.gridColor} / ${grid.diagonalColor} · ${grid.lineWidth}px · 默认 ${grid.defaultDivisions} 等分`;})();
 function apply(){if(!preview.settings||!changes.length)return;try{onApply(preview.settings);setError('');setSaved(true);}catch(e){setError(e instanceof Error?e.message:String(e));setSaved(false);}}
 return <fieldset aria-label="工作台配置迁移"><legend>工作台配置 · 独立确认</legend>
  <p className="note">仅迁移折纸工坊命名空间中的网格外观与主题；不会改变作品。网格设置包含颜色、线宽、默认等分和最小屏幕间距。</p>
  {!!preview.issues.length&&<ul role="alert">{preview.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
  <ul>{changes.map(key=><li key={key}>{key==='theme'?'主题':'网格外观'}：{show(key,current[key])} → {show(key,preview.settings![key])}</li>)}</ul>
  {!preview.recognized.length&&!preview.issues.length&&<p className="note">此包没有可迁移的工作台配置字段。</p>}
  {!!preview.recognized.length&&!changes.length&&!preview.issues.length&&<p className="note">支持的工作台配置与当前值一致。</p>}
  <button className="primary" disabled={!preview.settings||!changes.length} onClick={apply}>确认仅导入工作台配置</button>
  {error&&<p role="alert">{error}</p>}{saved&&<p role="status">工作台配置已导入；其他设置和作品未改变。</p>}
 </fieldset>;
}
