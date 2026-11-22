import type {GalleryArrangement,GalleryArrangementAxis} from '../app/diagramPDFGalleryArrange';
import type {DiagramGalleryBox,DiagramGalleryPlace} from '../app/diagramPDFGallery';

export default function DiagramGalleryAlignControls({boxes,place,selected,onSelect,onArrange,error}:{
  boxes:DiagramGalleryBox[];place:DiagramGalleryPlace;selected:number[];onSelect:(indices:number[])=>void;
  onArrange:(axis:GalleryArrangementAxis,action:GalleryArrangement)=>void;error:string;
}){
  const visible=boxes.filter(entry=>entry.place===place);
  if(!visible.length)return null;
  const actions:GalleryArrangement[]=['start','center','end','distribute'];
  return <fieldset className="diagram-gallery-arrange">
    <legend>{place==='cover'?'封面':'本页'}成品图对齐</legend>
    <div className="diagram-gallery-picks" role="group" aria-label="选择要对齐的成品图">
      {visible.map(({index})=><button key={index} type="button" aria-label={'选择成品图 '+(index+1)} aria-pressed={selected.includes(index)}
        onClick={()=>onSelect(selected.includes(index)?selected.filter(i=>i!==index):[...selected,index])}>{index+1}</button>)}
      <button type="button" onClick={()=>onSelect(selected.length===visible.length?[]:visible.map(entry=>entry.index))}>{selected.length===visible.length?'清除选择':'全选本页'}</button>
    </div>
    {visible.length>1&&(['x','y'] as const).map(axis=><div key={axis} className="diagram-gallery-align-actions" role="group" aria-label={axis==='x'?'水平对齐与分布':'垂直对齐与分布'}>
      {(axis==='x'?['左对齐','水平居中','右对齐','水平等距']:['顶对齐','垂直居中','底对齐','垂直等距']).map((label,i)=>
        <button key={label} type="button" disabled={selected.length<(i===3?3:2)} onClick={()=>onArrange(axis,actions[i])}>{label}</button>)}
    </div>)}
    <div className="diagram-gallery-align-actions diagram-gallery-page-center" role="group" aria-label="相对整页居中">
      <span>相对整页</span>
      {([['x','水平居中'],['y','垂直居中'],['both','页面正中']] as const).map(([axis,label])=>
        <button key={axis} type="button" disabled={!selected.length} onClick={()=>onArrange(axis,'page-center')}>{label}</button>)}
    </div>
    {error&&<p role="alert" className="diagram-pdf-error">{error}</p>}
  </fieldset>;
}
