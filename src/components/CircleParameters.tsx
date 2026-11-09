import type { CircleObject } from '../app/circleTools';
import { NumberField } from './Fields';

export default function CircleParameters({circles,selectedId,onSelect,onEdit,onDelete}:{
  circles:CircleObject[];selectedId:string|null;onSelect:(id:string)=>void;
  onEdit:(patch:Partial<Pick<CircleObject,'center'|'radius'|'color'>>)=>void;onDelete:()=>void;
}) {
  const circle=circles.find(c=>c.id===selectedId);
  return <div className="construction-parameters" aria-label="圆编辑参数">
    <label>辅助圆 <select aria-label="选择辅助圆" value={circle?.id??''} onChange={e=>onSelect(e.target.value)}>
      <option value="">{circles.length?'点击圆周或在此选择':'还没有辅助圆'}</option>
      {circles.map((c,i)=><option key={c.id} value={c.id}>{i+1} · 半径 {Number(c.radius.toFixed(3))} mm</option>)}
    </select></label>
    {circle&&<div className="circle-fields" key={circle.id}>
      <NumberField label="圆心 X" value={circle.center[0]} step={.1} onChange={x=>onEdit({center:[x,circle.center[1]]})}/>
      <NumberField label="圆心 Y" value={circle.center[1]} step={.1} onChange={y=>onEdit({center:[circle.center[0],y]})}/>
      <NumberField label="圆半径" value={circle.radius} min={.000001} step={.1} onChange={radius=>onEdit({radius})}/>
      <label>圆颜色 <select aria-label="圆颜色" value={circle.color} onChange={e=>onEdit({color:e.target.value})}>
        <option value={circle.color}>当前 {circle.color}</option>
        {['#367d86','#8052ad','#737373','#ad7135'].filter(c=>c!==circle.color).map((c,i)=><option value={c} key={c}>{({'#367d86':'青色','#8052ad':'紫色','#737373':'灰色','#ad7135':'棕色'} as Record<string,string>)[c]??i}</option>)}
      </select></label>
      <button onClick={onDelete}>删除此圆</button>
    </div>}
    <small>辅助对象 · 不参与折叠 · 修改／删除可撤销</small>
  </div>;
}
