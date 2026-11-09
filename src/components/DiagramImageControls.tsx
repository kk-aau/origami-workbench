import {useEffect,useState} from 'react';
import type {DiagramImage} from '../app/diagramImages';
import {NumberField} from './Fields';
import './DiagramImageControls.css';

export default function DiagramImageControls({images,selectedId,paperVisible,disabled,onSelect,onChange,onPaperVisible}:{
  images:DiagramImage[];selectedId:string|null;paperVisible:boolean;disabled:boolean;
  onSelect:(id:string|null)=>void;onChange:(images:DiagramImage[])=>void;onPaperVisible:(visible:boolean)=>void;
}){
  const selected=images.find(image=>image.id===selectedId),[name,setName]=useState(selected?.name??'');
  useEffect(()=>setName(selected?.name??''),[selected?.id,selected?.name]);
  const edit=(patch:Partial<DiagramImage>)=>selected&&onChange(images.map(image=>image.id===selected.id?{...image,...patch}:image));
  return <section className="diagram-image-controls" aria-label="步骤图片设置">
    <header><h3>步骤图片</h3><small>{images.length} 张</small></header>
    <label className="diagram-image-paper"><input type="checkbox" checked={paperVisible} disabled={disabled} onChange={event=>onPaperVisible(event.target.checked)}/>同时显示折图纸面</label>
    <div className="diagram-image-list" aria-label="本步图片">{images.map((image,index)=><button key={image.id} type="button" aria-pressed={selectedId===image.id} disabled={disabled} onClick={()=>onSelect(image.id)} title={image.name}>
      <img src={image.dataUrl} alt=""/><span>{image.name||`图片 ${index+1}`}</span>
    </button>)}</div>
    {selected?<>
      <label className="diagram-image-name"><span>图片名称</span><input aria-label="图片名称" value={name} maxLength={160} disabled={disabled} onChange={event=>setName(event.target.value)} onBlur={()=>{if(name!==selected.name)edit({name:name.trim()});}} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/></label>
      <NumberField label="图片宽度" value={selected.width} min={.1} max={10000} suffix="mm" disabled={disabled} onChange={width=>edit({width,height:selected.height*width/selected.width})}/>
      <NumberField label="图片旋转" value={selected.rotation} min={-360} max={360} suffix="°" disabled={disabled} onChange={rotation=>edit({rotation})}/>
      <button type="button" className="diagram-full-button" disabled={disabled} onClick={()=>{onChange(images.filter(image=>image.id!==selected.id));onSelect(null);}}>移除这张图片</button>
      <p>拖动图片移动，拖动四角等比缩放。可在图片上叠加箭头、折线和符号。</p>
    </>:<p>点击图片选择，再拖动或调整大小。右击取消选择。</p>}
  </section>;
}
