import {changeTessParams,type TessParams} from '../app/tessellation';
import TessNumberField from './TessNumberField';

export default function PenroseControls({params,onChange}:{params:Extract<TessParams,{family:'nonperiodic'}>;onChange:(p:TessParams)=>void}){
 const original=params.penroseVersion==='origamica',change=(patch:Record<string,unknown>)=>onChange(changeTessParams(params,patch));
 return <><label className="select-field">层级规则<select aria-label="Penrose 层级规则" value={params.penroseVersion??'legacy'} onChange={e=>change({penroseVersion:e.target.value,depth:e.target.value==='origamica'?2*params.depth-1:Math.max(1,Math.min(3,Math.ceil(params.depth/2)))})}><option value="origamica">{original?`原版 · ${params.depth%2?'Sun 太阳':'Star 星形'}`:'原版 Star／Sun'}</option><option value="legacy">兼容旧细分</option></select></label>
 <TessNumberField label={original?'原版层级 n':'细分层数'} value={params.depth} min={original?0:1} max={original?7:3} step={1} onChange={depth=>change({depth})}/>
 <label title="只移除未配对的边界三角形，完整菱形保持不变"><input type="checkbox" checked={params.borderTriangles??true} onChange={e=>change({borderTriangles:e.target.checked})}/>保留边界半菱形</label>
 </>;
}
